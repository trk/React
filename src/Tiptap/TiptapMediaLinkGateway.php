<?php

declare(strict_types=1);

namespace Totoglu\React\Tiptap;

use ProcessWire\Field;
use ProcessWire\FieldtypeFile;
use ProcessWire\FieldtypeImage;
use ProcessWire\FieldtypeRepeater;
use ProcessWire\Inputfield;
use ProcessWire\InputfieldFile;
use ProcessWire\InputfieldTiptap;
use ProcessWire\Language;
use ProcessWire\Languages;
use ProcessWire\NullPage;
use ProcessWire\Page;
use ProcessWire\PageArray;
use ProcessWire\Pagefile;
use ProcessWire\Pagefiles;
use ProcessWire\PagefilesManager;
use ProcessWire\Pageimage;
use ProcessWire\Pageimages;
use ProcessWire\React;
use ProcessWire\RepeaterPage;
use ProcessWire\Template;
use ProcessWire\User;
use ProcessWire\Wire;
use ProcessWire\WirePageEditor;
use ProcessWire\WireUpload;
use Totoglu\React\Media\MediaGateway;
use Totoglu\React\Security\AccessGuard;

/**
 * TiptapMediaLinkGateway
 *
 * Deep HMAC-signed backend gateway powering ProcessWire `pwlink` and `pwimage` capabilities
 * inside `InputfieldTiptap` across both classic ProcessWire Admin (`ProcessPageEdit`) and
 * standalone React / Inertia workspaces (`SchemaForm` & `MediaHostAdapterInterface` hosts).
 *
 * Honors `ProcessPageEditLink` and `ProcessPageEditImageSelect` module configurations, resolves
 * multi-language page URLs and cross-page files/images (including Repeater items), generates
 * canonical `-is` (`ImageSelect`) `Pageimage` variations (crop, resize, rotate, flip, HiDPI),
 * and handles drag-and-drop / clipboard image uploads into ProcessWire image fields.
 */
final class TiptapMediaLinkGateway extends Wire
{
	/**
	 * Actions on `/_react/tiptap` that mutate files/variations on disk and require POST + CSRF.
	 *
	 * @var list<string>
	 */
	public const array MUTATING_ACTIONS = [
		'resize',
		'upload',
	];

	/**
	 * Safe raster image extensions permitted for editor uploads.
	 *
	 * @var list<string>
	 */
	public const array UPLOAD_IMAGE_EXTENSIONS = [
		'jpg',
		'jpeg',
		'png',
		'gif',
		'webp',
		'avif',
	];

	/**
	 * Allowed keys persisted inside the signed `tiptapToken` envelope.
	 *
	 * @var list<string>
	 */
	private const array ALLOWED_ENVELOPE_KEYS = [
		'pageId',
		'editPageId',
		'fieldName',
		'uploadFieldName',
		'imageFields',
		'readOnly',
	];

	/**
	 * Sign a Tiptap context envelope bound to `$config->userAuthSalt` and the active user ID.
	 *
	 * @param array<string, mixed> $config
	 */
	public function sign(array $config, ?int $userId = null): string
	{
		$envelope = [];
		foreach (self::ALLOWED_ENVELOPE_KEYS as $key) {
			if (!array_key_exists($key, $config)) {
				continue;
			}
			$val = $config[$key];
			if ($val instanceof \Closure || is_object($val)) {
				continue;
			}
			$envelope[$key] = $val;
		}

		$resolvedUid = $userId ?? (int) $this->wire()->user->id;
		$envelope['typ'] = 'tiptap';
		$envelope['uid'] = $resolvedUid;

		return React::instance($this)->tokenCodec()->encode($envelope);
	}

	/**
	 * Verify a signed `tiptapToken` and return the decoded envelope, or `null` if invalid/expired.
	 *
	 * @return array<string, mixed>|null
	 */
	public function verify(string $token, ?int $expectedUserId = null): ?array
	{
		$currentUid = $expectedUserId ?? (int) $this->wire()->user->id;
		$decoded = React::instance($this)->tokenCodec()->decode($token, $currentUid);
		if ($decoded === null || ($decoded['typ'] ?? '') !== 'tiptap') {
			return null;
		}

		return $decoded;
	}

	/**
	 * Build the complete client `pwContext` payload (`endpoint`, `tiptapToken`, `pageId`, `editPageId`,
	 * `uploadFieldName`, `canUploadImages`, `linkConfig`, `imageConfig`) for an `InputfieldTiptap` instance.
	 *
	 * @return array<string, mixed>
	 */
	public function buildContextForInputfield(InputfieldTiptap $inputfield): array
	{
		$hostPage = $this->resolveInputfieldHostPage($inputfield);
		$rawName = $inputfield->attr('name');
		$fieldName = is_scalar($rawName) ? trim((string) $rawName) : '';
		if ($inputfield->hasField instanceof Field && (string) $inputfield->hasField->name !== '') {
			$fieldName = (string) $inputfield->hasField->name;
		}
		$isReadOnly = $inputfield->isEffectivelyReadOnly();
		$rawImageFields = $inputfield->getSetting('imageFields') ?? $inputfield->get('imageFields') ?? [];
		$imageFields = $this->normalizeFieldNames($rawImageFields);

		return $this->assembleClientContext($hostPage, $fieldName, $imageFields, $isReadOnly);
	}

	/**
	 * Build client `pwContext` for a declarative `SchemaForm` rich-text definition.
	 *
	 * @param array<string, mixed> $raw
	 * @param array<string, mixed> $options
	 * @return array<string, mixed>
	 */
	public function buildDeclarativeContext(array $raw, string $fieldName = '', array $options = []): array
	{
		$hostPage = null;
		$candidate = $raw['hasPage'] ?? $options['page'] ?? null;
		if ($candidate instanceof Page && !$candidate instanceof NullPage && (int) $candidate->id > 0) {
			$hostPage = $candidate;
		} elseif (is_numeric($candidate) && (int) $candidate > 0) {
			$found = $this->wire()->pages->get((int) $candidate);
			if ($found instanceof Page && !$found instanceof NullPage && (int) $found->id > 0) {
				$hostPage = $found;
			}
		} else {
			$process = $this->wire()->process;
			if ($process instanceof WirePageEditor) {
				try {
					$procPage = $process->getPage();
					if ($procPage instanceof Page && !$procPage instanceof NullPage && (int) $procPage->id > 0) {
						$hostPage = $procPage;
					}
				} catch (\Throwable) {
					$hostPage = null;
				}
			}
		}

		$isReadOnly = !empty($raw['readOnly']) || !empty($raw['readonly']) || !empty($raw['disabled']);
		$imageFields = $this->normalizeFieldNames($raw['imageFields'] ?? $raw['image_fields'] ?? []);

		return $this->assembleClientContext($hostPage, $fieldName, $imageFields, $isReadOnly);
	}

	/**
	 * Resolve normalized `ProcessPageEditLink` module settings for client & sanitizer consumption.
	 *
	 * @return array{
	 *   urlType: int,
	 *   extLinkRel: string,
	 *   extLinkTarget: string,
	 *   extLinkClass: string,
	 *   noLinkTextEdit: bool,
	 *   classOptions: list<array{value: string, default: bool}>,
	 *   relOptions: list<array{value: string, default: bool}>,
	 *   targetOptions: list<array{value: string, default: bool}>,
	 *   httpHosts: list<string>
	 * }
	 */
	public function getLinkConfig(): array
	{
		$modules = $this->wire()->modules;
		$config = $this->wire()->config;
		$sanitizer = $this->wire()->sanitizer;

		$raw = $modules->getModuleConfigData('ProcessPageEditLink');
		if (!is_array($raw)) {
			$raw = [];
		}

		$parseLines = static function (string $input, callable $validator) use ($sanitizer): array {
			$out = [];
			$seen = [];
			foreach (explode("\n", $input) as $line) {
				$trimmed = trim($line);
				if ($trimmed === '') {
					continue;
				}
				$isDefault = str_starts_with($trimmed, '+') || str_ends_with($trimmed, '+');
				$clean = trim($trimmed, "+ \t\r\n");
				if ($clean === '' || !$validator($clean, $sanitizer) || isset($seen[$clean])) {
					continue;
				}
				$seen[$clean] = true;
				$out[] = [
					'value' => $clean,
					'default' => $isDefault,
				];
			}

			return $out;
		};

		$rawClass = isset($raw['classOptions']) && is_string($raw['classOptions']) ? $raw['classOptions'] : '';
		$rawRel = isset($raw['relOptions']) && is_string($raw['relOptions']) && trim($raw['relOptions']) !== ''
			? $raw['relOptions']
			: "nofollow\nnoopener\nnoreferrer";
		$rawTarget = isset($raw['targetOptions']) && is_string($raw['targetOptions']) && trim($raw['targetOptions']) !== ''
			? $raw['targetOptions']
			: '_blank';

		$classOptions = $parseLines(
			$rawClass,
			static fn(string $v, $s): bool => $s->nameFilter($v, ['-', '_', ':'], '-') === $v,
		);
		$relOptions = $parseLines(
			$rawRel,
			static fn(string $v, $s): bool => $s->nameFilter($v, ['-'], '-') === $v,
		);
		$targetOptions = $parseLines(
			$rawTarget,
			static fn(string $v, $s): bool => $s->nameFilter($v, ['_', '-'], '_') === $v,
		);
		if ($targetOptions === []) {
			$targetOptions = [['value' => '_blank', 'default' => false]];
		}

		$hosts = [];
		$rawHosts = $config->httpHosts;
		if (is_array($rawHosts)) {
			foreach ($rawHosts as $h) {
				if (is_string($h) && trim($h) !== '') {
					$hosts[] = strtolower(trim($h));
				}
			}
		}
		$currentHost = strtolower(trim((string) $config->httpHost));
		if ($currentHost !== '' && !in_array($currentHost, $hosts, true)) {
			$hosts[] = $currentHost;
		}

		return [
			'urlType' => max(0, min(2, (int) ($raw['urlType'] ?? 0))),
			'extLinkRel' => trim((string) ($raw['extLinkRel'] ?? '')),
			'extLinkTarget' => trim((string) ($raw['extLinkTarget'] ?? '')),
			'extLinkClass' => trim((string) ($raw['extLinkClass'] ?? '')),
			'noLinkTextEdit' => !empty($raw['noLinkTextEdit']),
			'classOptions' => $classOptions,
			'relOptions' => $relOptions,
			'targetOptions' => $targetOptions,
			'httpHosts' => array_values(array_unique($hosts)),
		];
	}

	/**
	 * Resolve normalized `ProcessPageEditImageSelect` module settings.
	 *
	 * @return array{
	 *   alignLeftClass: string,
	 *   alignCenterClass: string,
	 *   alignRightClass: string,
	 *   hidpiDefault: bool,
	 *   noSizeAttrs: bool,
	 *   maxWidth: int,
	 *   skipFields: list<string>
	 * }
	 */
	public function getImageConfig(): array
	{
		$raw = $this->wire()->modules->getModuleConfigData('ProcessPageEditImageSelect');
		if (!is_array($raw)) {
			$raw = [];
		}

		$sanitizer = $this->wire()->sanitizer;
		$cleanClass = static function (mixed $val, string $fallback) use ($sanitizer): string {
			$str = is_string($val) ? trim($val) : '';
			if ($str === '') {
				return $fallback;
			}
			$filtered = $sanitizer->nameFilter($str, ['-', '_'], '_');

			return $filtered !== '' ? $filtered : $fallback;
		};

		$skipFields = [];
		$rawSkip = isset($raw['skipFields']) && is_string($raw['skipFields']) ? $raw['skipFields'] : '';
		foreach (preg_split('/[\s,]+/', trim($rawSkip)) ?: [] as $sf) {
			$cleanSf = $sanitizer->fieldName($sf);
			if ($cleanSf !== '' && !in_array($cleanSf, $skipFields, true)) {
				$skipFields[] = $cleanSf;
			}
		}

		return [
			'alignLeftClass' => $cleanClass($raw['alignLeftClass'] ?? '', 'align_left'),
			'alignCenterClass' => $cleanClass($raw['alignCenterClass'] ?? '', 'align_center'),
			'alignRightClass' => $cleanClass($raw['alignRightClass'] ?? '', 'align_right'),
			'hidpiDefault' => !empty($raw['hidpiDefault']),
			'noSizeAttrs' => !empty($raw['noSizeAttrs']),
			'maxWidth' => max(0, (int) ($raw['maxWidth'] ?? 0)),
			'skipFields' => $skipFields,
		];
	}

	/**
	 * Execute a signed Tiptap link/media action (`pages`, `files`, `images`, `inspectImage`, `resize`, `upload`).
	 *
	 * @param array<string, mixed> $requestPayload
	 * @param array<string, mixed>|null $uploadedFiles
	 * @return array<string, mixed>
	 */
	public function handleAction(
		array $requestPayload,
		bool $enforceCsrf = false,
		?User $user = null,
		?array $uploadedFiles = null,
	): array {
		$workspace = React::instance($this);
		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticated($resolvedUser)) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => $this->_('Authentication required.'),
			];
		}

		$token = trim((string) ($requestPayload['tiptapToken'] ?? ''));
		if ($token === '') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('Missing editor context token.'),
			];
		}

		$envelope = $this->verify($token, (int) $resolvedUser->id);
		if ($envelope === null) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => $this->_('Invalid or expired editor context token.'),
			];
		}

		$action = strtolower(trim((string) ($requestPayload['action'] ?? 'pages')));
		$isMutating = in_array($action, self::MUTATING_ACTIONS, true);

		if ($isMutating) {
			$reqMethod = strtoupper(trim((string) ($requestPayload['_requestMethod'] ?? (PHP_SAPI !== 'cli' ? ($_SERVER['REQUEST_METHOD'] ?? '') : ''))));
			if ($reqMethod !== '' && $reqMethod !== 'POST') {
				return [
					'ok' => false,
					'status' => 405,
					'error' => $this->_('Method not allowed. POST required.'),
				];
			}
			if ((bool) $this->wire()->config->demo || !empty($envelope['readOnly'])) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => $this->_('This rich text field is read-only.'),
				];
			}
			if ($enforceCsrf && !$workspace->verifyRequestCsrf($requestPayload)) {
				return [
					'ok' => false,
					'status' => 419,
					'error' => $this->_('CSRF token validation failed.'),
				];
			}
		}

		$users = $this->wire()->users;
		$previousUser = $this->wire()->user;
		$switchedUser = false;
		if ((int) $previousUser->id !== (int) $resolvedUser->id) {
			$users->setCurrentUser($resolvedUser);
			$switchedUser = true;
		}

		$pages = $this->wire()->pages;
		$prevPagesOf = $pages->of();
		if ($isMutating && $prevPagesOf) {
			$pages->of(false);
		}

		try {
			return match ($action) {
				'pages' => $this->executePagesQuery($envelope, $requestPayload, $resolvedUser),
				'files' => $this->executeFilesQuery($envelope, $requestPayload, $resolvedUser),
				'images' => $this->executeImagesQuery($envelope, $requestPayload, $resolvedUser),
				'inspectimage', 'inspect_image', 'inspect' => $this->executeInspectImage($envelope, $requestPayload, $resolvedUser),
				'resize' => $this->executeResize($envelope, $requestPayload, $resolvedUser),
				'upload' => $this->executeUpload($envelope, $requestPayload, $resolvedUser, $uploadedFiles),
				default => [
					'ok' => false,
					'status' => 400,
					'error' => $this->_('Unsupported Tiptap action.'),
				],
			};
		} finally {
			if ($isMutating && $prevPagesOf) {
				$pages->of(true);
			}
			if ($switchedUser) {
				$users->setCurrentUser($previousUser);
			}
		}
	}

	/**
	 * Extract a ProcessWire `Page` ID from a `/site/assets/files/...` URL (supporting both `/123/` and extended `/1/2/3/` paths).
	 */
	public static function extractPageIdFromAssetUrl(string $rawUrl): int
	{
		$path = (string) parse_url(trim($rawUrl), PHP_URL_PATH);
		if ($path === '' || !str_contains($path, '/files/')) {
			return 0;
		}

		$afterFiles = substr($path, strpos($path, '/files/') + strlen('/files/'));
		$segments = explode('/', trim($afterFiles, '/'));
		if (count($segments) < 2) {
			return 0;
		}
		array_pop($segments);
		$digits = '';
		foreach ($segments as $seg) {
			if ($seg === '' || !ctype_digit($seg)) {
				break;
			}
			$digits .= $seg;
		}
		if ($digits === '' || strlen($digits) > 10) {
			return 0;
		}

		$dirStr = '/' . implode('/', $segments) . '/';
		if (count($segments) > 1) {
			$fromManager = (int) PagefilesManager::dirToPageID($dirStr);
			if ($fromManager > 0) {
				return $fromManager;
			}
		}

		return (int) $digits;
	}

	/**
	 * Resolve original basename from a ProcessWire variation filename
	 * (e.g. `photo.400x0-is-hidpi.jpg` or `photo.-crop-x10-y10-200x120-is.jpg` -> `photo.jpg`).
	 */
	public static function extractOriginalBasename(string $filename): string
	{
		$base = basename(trim($filename));
		$qPos = strpos($base, '?');
		if ($qPos !== false) {
			$base = substr($base, 0, $qPos);
		}
		$dot1 = strpos($base, '.');
		$dot2 = strrpos($base, '.');
		if ($dot1 === false || $dot2 === false || $dot1 === $dot2) {
			return $base;
		}
		$middle = substr($base, $dot1 + 1, $dot2 - $dot1 - 1);
		if (preg_match('/^(?:\d+x\d+|-[a-z0-9_-]+|crop[a-z0-9_-]*)/i', $middle) === 1) {
			return substr($base, 0, $dot1) . substr($base, $dot2);
		}

		return $base;
	}

	/**
	 * @param list<string> $imageFields
	 * @return array<string, mixed>
	 */
	private function assembleClientContext(
		?Page $hostPage,
		string $fieldName,
		array $imageFields,
		bool $isReadOnly,
	): array {
		$user = $this->wire()->user;
		$config = $this->wire()->config;
		$rootUrl = rtrim((string) ($config->urls->root ?: '/'), '/') . '/';
		$endpoint = $rootUrl . '_react/tiptap';

		$pageId = 0;
		$editPageId = 0;
		$uploadFieldName = '';
		$canUploadImages = false;
		$pageTitle = '';
		$pagePath = '';

		if ($hostPage instanceof Page && !$hostPage instanceof NullPage && (int) $hostPage->id > 0 && !method_exists($hostPage, 'getEntryUuid')) {
			$pageId = (int) $hostPage->id;
			$master = $this->resolveMasterPage($hostPage);
			$editPageId = $master instanceof Page ? (int) $master->id : $pageId;

			// If Repeater item has no image fields of its own, default image selection to master page
			if ($hostPage instanceof RepeaterPage && !$this->pageHasImageFields($hostPage) && $master instanceof Page && (int) $master->id > 0) {
				$pageId = (int) $master->id;
				$targetForUpload = $master;
			} else {
				$targetForUpload = $hostPage;
			}

			$displayPage = $this->wire()->pages->get($pageId);
			if ($displayPage instanceof Page && !$displayPage instanceof NullPage && (int) $displayPage->id > 0) {
				$pageTitle = (string) ($displayPage->get('title|name') ?: $displayPage->name);
				$pagePath = (string) $displayPage->path;
			}

			if (!$isReadOnly && !(bool) $config->demo) {
				$uploadField = $this->resolveUploadImageField($targetForUpload, $imageFields, $user);
				if ($uploadField instanceof Field) {
					$uploadFieldName = (string) $uploadField->name;
					$canUploadImages = true;
				}
			}
		}

		$tiptapToken = '';
		if (AccessGuard::isAuthenticated($user)) {
			$tiptapToken = $this->sign([
				'pageId' => $pageId,
				'editPageId' => $editPageId,
				'fieldName' => $fieldName,
				'uploadFieldName' => $uploadFieldName,
				'imageFields' => $imageFields,
				'readOnly' => $isReadOnly,
			], (int) $user->id);
		}

		return [
			'endpoint' => $endpoint,
			'tiptapToken' => $tiptapToken,
			'pageId' => $pageId,
			'editPageId' => $editPageId,
			'pageTitle' => $pageTitle,
			'pagePath' => $pagePath,
			'uploadFieldName' => $uploadFieldName,
			'canUploadImages' => $canUploadImages,
			'linkConfig' => $this->getLinkConfig(),
			'imageConfig' => $this->getImageConfig(),
		];
	}

	private function resolveInputfieldHostPage(InputfieldTiptap $inputfield): ?Page
	{
		$hasPage = $inputfield->hasPage;
		if ($hasPage instanceof Page && !$hasPage instanceof NullPage && (int) $hasPage->id > 0) {
			return $hasPage;
		}
		$process = $this->wire()->process;
		if ($process instanceof WirePageEditor) {
			try {
				$procPage = $process->getPage();
				if ($procPage instanceof Page && !$procPage instanceof NullPage && (int) $procPage->id > 0) {
					return $procPage;
				}
			} catch (\Throwable) {
				return null;
			}
		}

		return null;
	}

	private function resolveMasterPage(Page $page): ?Page
	{
		$current = $page;
		$hops = 0;
		while ($current instanceof RepeaterPage && $hops < 16) {
			$hops++;
			$forPage = $current->getForPage();
			if (!$forPage instanceof Page || $forPage instanceof NullPage || (int) $forPage->id <= 0) {
				return null;
			}
			$current = $forPage;
		}

		return ($current instanceof Page && !$current instanceof NullPage && (int) $current->id > 0) ? $current : null;
	}

	/**
	 * @param list<string> $skipFields
	 */
	private function pageHasImageFields(Page $page, array $skipFields = [], int $level = 0): bool
	{
		if ($level > 4) {
			return false;
		}
		$template = $page->template;
		if (!$template instanceof Template || $template->fieldgroup === null) {
			return false;
		}
		foreach ($template->fieldgroup as $field) {
			if (!$field instanceof Field || in_array((string) $field->name, $skipFields, true)) {
				continue;
			}
			if ($this->isFieldImageCapable($field)) {
				return true;
			}
			if ($field->type instanceof FieldtypeRepeater) {
				$repVal = $page->get($field->name);
				if ($repVal instanceof Page) {
					$repVal = [$repVal];
				}
				if ($repVal instanceof PageArray || is_array($repVal)) {
					foreach ($repVal as $subPage) {
						if ($subPage instanceof Page && (int) $subPage->id > 0 && $this->pageHasImageFields($subPage, $skipFields, $level + 1)) {
							return true;
						}
					}
				}
			}
		}

		return false;
	}

	private function isFieldImageCapable(Field $field): bool
	{
		$ft = $field->type;
		if ($ft instanceof FieldtypeImage) {
			return true;
		}

		return is_object($ft) && method_exists($ft, 'getPageimages');
	}

	private static function readImgWidth(Pageimage $img, bool $hidpi = false): int
	{
		$val = $hidpi ? $img->hidpiWidth() : $img->width();

		return is_int($val) ? $val : (is_numeric($val) ? (int) $val : 0);
	}

	private static function readImgHeight(Pageimage $img, bool $hidpi = false): int
	{
		$val = $hidpi ? $img->hidpiHeight() : $img->height();

		return is_int($val) ? $val : (is_numeric($val) ? (int) $val : 0);
	}

	/**
	 * Resolve the target `FieldtypeImage` field for drag-drop/paste/modal uploads on `$page`
	 * (mirrors `InputfieldTinyMCETools::getImageField()`).
	 *
	 * @param list<string> $configuredFields
	 */
	private function resolveUploadImageField(Page $page, array $configuredFields, User $user, string $requestedField = ''): ?Field
	{
		if (in_array('x', $configuredFields, true)) {
			return null;
		}

		$template = $page->template;
		if (!$template instanceof Template || $template->fieldgroup === null) {
			return null;
		}

		$masterPage = $this->resolveMasterPage($page) ?? $page;
		if (!$user->isSuperuser()) {
			$permissions = $this->wire()->permissions;
			if ($permissions->has('page-edit-images') && !$user->hasPermission('page-edit-images', $masterPage)) {
				// Uploading new files only requires field editability on the page, checked below
			}
		}

		$canEditField = function (Field $field) use ($page, $masterPage): bool {
			if (!$field->type instanceof FieldtypeImage) {
				return false;
			}
			if ((bool) $field->get('noUpload')) {
				return false;
			}
			if ($page instanceof RepeaterPage) {
				return $masterPage->editable() && $page->editable($field->name);
			}

			return $page->editable($field->name);
		};

		if ($requestedField !== '') {
			$cleanReq = $this->wire()->sanitizer->fieldName($requestedField);
			if ($cleanReq !== '' && ($configuredFields === [] || in_array($cleanReq, $configuredFields, true))) {
				$explicit = $page->getField($cleanReq);
				if ($explicit instanceof Field && $canEditField($explicit)) {
					return $explicit;
				}
			}
		}

		foreach ($configuredFields as $fieldName) {
			$candidate = $page->getField($fieldName);
			if ($candidate instanceof Field && $canEditField($candidate)) {
				return $candidate;
			}
		}

		if ($configuredFields !== []) {
			return null;
		}

		$alternates = [];
		foreach ($template->fieldgroup as $field) {
			if (!$field instanceof Field || !$canEditField($field)) {
				continue;
			}
			$maxFiles = (int) $field->get('maxFiles');
			if ($maxFiles === 0) {
				return $field;
			}
			if ($maxFiles === 1) {
				continue;
			}
			$unformatted = $page->getUnformatted($field->name);
			if ($unformatted instanceof Pageimages && $unformatted->count() >= $maxFiles) {
				continue;
			}
			$alternates[] = $field;
		}

		return $alternates[0] ?? null;
	}

	/**
	 * Return all editable, non-full `FieldtypeImage` options on `$page` for the Image Studio upload selector
	 * (mirrors `ProcessPageEditImageSelect::getImageFields($page, true)`).
	 *
	 * @param list<string> $configuredFields
	 * @param list<string> $skipFields
	 * @return list<array{name: string, label: string, maxFiles: int}>
	 */
	private function listEditableUploadFields(Page $page, array $configuredFields, array $skipFields = []): array
	{
		if (in_array('x', $configuredFields, true)) {
			return [];
		}
		$template = $page->template;
		if (!$template instanceof Template || $template->fieldgroup === null) {
			return [];
		}
		$masterPage = $this->resolveMasterPage($page) ?? $page;
		$out = [];
		foreach ($template->fieldgroup as $field) {
			if (!$field instanceof Field || !$field->type instanceof FieldtypeImage) {
				continue;
			}
			$fieldName = (string) $field->name;
			if (in_array($fieldName, $skipFields, true)) {
				continue;
			}
			if ((bool) $field->get('noUpload')) {
				continue;
			}
			if ($configuredFields !== [] && !in_array($fieldName, $configuredFields, true)) {
				continue;
			}
			$editable = $page instanceof RepeaterPage
				? ($masterPage->editable() && $page->editable($fieldName))
				: $page->editable($fieldName);
			if (!$editable) {
				continue;
			}
			$maxFiles = max(0, (int) ($field->get('maxFiles') ?? 0));
			$overwrite = (bool) ($field->get('overwrite') ?? false);
			if ($maxFiles > 0 && !$overwrite) {
				$unformatted = $page->getUnformatted($fieldName);
				if ($unformatted instanceof Pageimages && $unformatted->count() >= $maxFiles) {
					continue;
				}
			}
			$out[] = [
				'name' => $fieldName,
				'label' => (string) ($field->getLabel() ?: $fieldName),
				'maxFiles' => $maxFiles,
			];
		}

		return $out;
	}

	/**
	 * Search or browse ProcessWire pages for `pwlink` and cross-page `pwimage` / `pwlink` file selection.
	 *
	 * @param array<string, mixed> $envelope
	 * @param array<string, mixed> $payload
	 * @return array<string, mixed>
	 */
	private function executePagesQuery(array $envelope, array $payload, User $user): array
	{
		$pages = $this->wire()->pages;
		$config = $this->wire()->config;
		$sanitizer = $this->wire()->sanitizer;
		$languages = $this->wire()->languages;

		$adminRootId = (int) ($config->adminRootPageID ?: 2);
		$trashPageId = (int) ($config->trashPageID ?: 7);
		$http404PageId = (int) ($config->http404PageID ?: 27);
		$editPageId = (int) ($payload['editPageId'] ?? $envelope['editPageId'] ?? $envelope['pageId'] ?? 0);
		$langId = (int) ($payload['langId'] ?? 0);
		$targetLang = ($langId > 0 && $languages instanceof Languages) ? $languages->get($langId) : null;
		if (!$targetLang instanceof Language || (int) $targetLang->id <= 0) {
			$targetLang = null;
		}

		$editPage = $editPageId > 0 ? $pages->get($editPageId) : null;
		$fromUrl = ($editPage instanceof Page && !$editPage instanceof NullPage && (int) $editPage->id > 0)
			? $this->resolveLocalizedPageUrl($editPage, $targetLang)
			: '';

		$linkConfig = $this->getLinkConfig();
		$urlType = (int) $linkConfig['urlType'];

		$query = trim((string) ($payload['q'] ?? ''));
		$parentId = isset($payload['parentId']) && is_numeric($payload['parentId']) ? (int) $payload['parentId'] : 0;
		$limit = max(1, min(50, (int) ($payload['limit'] ?? 30)));

		$items = [];

		if ($query !== '') {
			$safeQ = $sanitizer->selectorValue($query);
			$selectorParts = [
				"has_parent!={$adminRootId}|{$trashPageId}",
				"id!={$adminRootId}|{$trashPageId}|{$http404PageId}",
				"status<" . Page::statusTrash,
			];
			if (ctype_digit($query) && (int) $query > 0) {
				$idVal = (int) $query;
				$selectorParts[] = "(id={$idVal}), (title|name%={$safeQ})";
			} else {
				$selectorParts[] = "title|name%={$safeQ}";
			}
			if ($user->isSuperuser() || $user->hasPermission('page-edit')) {
				$selectorParts[] = 'include=hidden';
			}
			$selectorParts[] = 'sort=title';
			$selectorParts[] = "limit={$limit}";

			$found = $pages->find(implode(', ', $selectorParts));
			foreach ($found as $p) {
				if (!$p instanceof Page || !$this->canReadPageInPicker($p, $user)) {
					continue;
				}
				$items[] = $this->serializePagePickerItem($p, $targetLang, $fromUrl, $urlType);
			}
		} else {
			$effectiveParentId = $parentId > 0 ? $parentId : 1;
			if ($effectiveParentId === $adminRootId || $effectiveParentId === $trashPageId) {
				return [
					'ok' => true,
					'items' => [],
					'parentId' => $effectiveParentId,
				];
			}
			$parentPage = $pages->get($effectiveParentId);
			if (!$parentPage instanceof Page || $parentPage instanceof NullPage || (int) $parentPage->id <= 0) {
				return [
					'ok' => true,
					'items' => [],
					'parentId' => $effectiveParentId,
				];
			}

			// Include homepage itself at top when browsing root (`parentId = 1` and explicit root requested)
			if ($effectiveParentId === 1 && !empty($payload['includeRoot']) && $this->canReadPageInPicker($parentPage, $user)) {
				$rootSerialized = $this->serializePagePickerItem($parentPage, $targetLang, $fromUrl, $urlType);
				$rootSerialized['isHome'] = true;
				$items[] = $rootSerialized;
			}

			$childSelector = "parent_id={$effectiveParentId}, id!={$adminRootId}|{$trashPageId}|{$http404PageId}, status<" . Page::statusTrash;
			if ($user->isSuperuser() || $user->hasPermission('page-edit')) {
				$childSelector .= ', include=unpublished';
			}
			$childSelector .= ", limit={$limit}";

			$children = $pages->find($childSelector);
			foreach ($children as $child) {
				if (!$child instanceof Page || !$this->canReadPageInPicker($child, $user)) {
					continue;
				}
				$items[] = $this->serializePagePickerItem($child, $targetLang, $fromUrl, $urlType);
			}
		}

		return [
			'ok' => true,
			'items' => $items,
			'parentId' => $parentId > 0 ? $parentId : 1,
		];
	}

	/**
	 * List viewable `Pagefile` items on a ProcessWire `Page` (including Repeater items) or a verified `MediaHostAdapter` token.
	 *
	 * @param array<string, mixed> $envelope
	 * @param array<string, mixed> $payload
	 * @return array<string, mixed>
	 */
	private function executeFilesQuery(array $envelope, array $payload, User $user): array
	{
		$mediaToken = trim((string) ($payload['mediaToken'] ?? ''));
		if ($mediaToken !== '') {
			$resolved = React::instance($this)->media()->resolveVerifiedContext($mediaToken, $user, false);
			if (empty($resolved['ok'])) {
				return $resolved;
			}
			/** @var Pagefiles $pfCollection */
			$pfCollection = $resolved['pagefiles'];
			$fieldLabel = isset($resolved['inputfield']) && $resolved['inputfield'] instanceof Inputfield
				? (string) ($resolved['inputfield']->label ?: ($resolved['fieldName'] ?? 'Files'))
				: (string) ($resolved['fieldName'] ?? 'Files');
			$files = [];
			foreach ($pfCollection as $pf) {
				if (!$pf instanceof Pagefile) {
					continue;
				}
				$files[] = $this->serializeLinkFileItem($pf, $fieldLabel);
			}

			return [
				'ok' => true,
				'pageId' => 0,
				'files' => $files,
			];
		}

		$targetPageId = (int) ($payload['pageId'] ?? $envelope['pageId'] ?? $envelope['editPageId'] ?? 0);
		if ($targetPageId <= 0) {
			return [
				'ok' => true,
				'pageId' => 0,
				'files' => [],
			];
		}

		$page = $this->wire()->pages->get($targetPageId);
		if (!$page instanceof Page || !$this->canReadPageAssets($page, $user)) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => $this->_('You do not have permission to view files on this page.'),
			];
		}

		$files = $this->collectPageFiles($page, '');
		usort($files, static fn(array $a, array $b): int => strnatcasecmp($a['label'], $b['label']));

		return [
			'ok' => true,
			'pageId' => (int) $page->id,
			'pageTitle' => (string) ($page->get('title|name') ?: $page->name),
			'pagePath' => (string) $page->path,
			'files' => $files,
		];
	}

	/**
	 * List viewable `Pageimage` items on a ProcessWire `Page` (including Repeater items) or a verified `MediaHostAdapter` token.
	 *
	 * @param array<string, mixed> $envelope
	 * @param array<string, mixed> $payload
	 * @return array<string, mixed>
	 */
	private function executeImagesQuery(array $envelope, array $payload, User $user): array
	{
		$langId = (int) ($payload['langId'] ?? 0);
		$languages = $this->wire()->languages;
		$targetLang = ($langId > 0 && $languages instanceof Languages) ? $languages->get($langId) : null;
		if (!$targetLang instanceof Language || (int) $targetLang->id <= 0) {
			$targetLang = null;
		}

		$mediaToken = trim((string) ($payload['mediaToken'] ?? ''));
		if ($mediaToken !== '') {
			$resolved = React::instance($this)->media()->resolveVerifiedContext($mediaToken, $user, false);
			if (empty($resolved['ok'])) {
				return $resolved;
			}
			/** @var Pagefiles $pfCollection */
			$pfCollection = $resolved['pagefiles'];
			$fieldLabel = isset($resolved['inputfield']) && $resolved['inputfield'] instanceof Inputfield
				? (string) ($resolved['inputfield']->label ?: ($resolved['fieldName'] ?? 'Images'))
				: (string) ($resolved['fieldName'] ?? 'Images');
			$fieldName = (string) ($resolved['fieldName'] ?? '');
			$images = [];
			foreach ($pfCollection as $img) {
				if (!$img instanceof Pageimage) {
					continue;
				}
				$serialized = $this->serializePickerImageItem($img, 0, $fieldName, $fieldLabel, $targetLang);
				$serialized['mediaToken'] = $mediaToken;
				$images[] = $serialized;
			}

			$hostEnv = is_array($resolved['envelope'] ?? null) ? $resolved['envelope'] : [];
			$canUpload = empty($envelope['readOnly'])
				&& empty($hostEnv['readOnly'])
				&& empty($hostEnv['noUpload'])
				&& !(bool) $this->wire()->config->demo;

			return [
				'ok' => true,
				'pageId' => 0,
				'hasImageFields' => true,
				'canUpload' => $canUpload,
				'uploadFields' => $canUpload && $fieldName !== '' ? [['name' => $fieldName, 'label' => $fieldLabel, 'maxFiles' => (int) ($hostEnv['maxFiles'] ?? 0)]] : [],
				'images' => $images,
			];
		}

		$targetPageId = (int) ($payload['pageId'] ?? $envelope['pageId'] ?? $envelope['editPageId'] ?? 0);
		if ($targetPageId <= 0) {
			return [
				'ok' => true,
				'pageId' => 0,
				'hasImageFields' => false,
				'canUpload' => false,
				'uploadFields' => [],
				'images' => [],
			];
		}

		$page = $this->wire()->pages->get($targetPageId);
		if (!$page instanceof Page || !$this->canReadPageAssets($page, $user)) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => $this->_('You do not have permission to view images on this page.'),
			];
		}

		$imgConfig = $this->getImageConfig();
		$hasImageFields = $this->pageHasImageFields($page, $imgConfig['skipFields']);
		$images = $this->collectPageImages($page, $imgConfig['skipFields'], $targetLang);

		$configuredUploadFields = $this->normalizeFieldNames($envelope['imageFields'] ?? []);
		$isSameHostPage = (int) $page->id === (int) ($envelope['pageId'] ?? 0)
			|| (int) $page->id === (int) ($envelope['editPageId'] ?? 0);
		$uploadFields = (empty($envelope['readOnly']) && !(bool) $this->wire()->config->demo)
			? $this->listEditableUploadFields($page, $isSameHostPage ? $configuredUploadFields : [], $imgConfig['skipFields'])
			: [];

		return [
			'ok' => true,
			'pageId' => (int) $page->id,
			'pageTitle' => (string) ($page->get('title|name') ?: $page->name),
			'pagePath' => (string) $page->path,
			'hasImageFields' => $hasImageFields,
			'canUpload' => $uploadFields !== [],
			'uploadFields' => $uploadFields,
			'images' => $images,
		];
	}

	/**
	 * Inspect an existing `img[src]` inside the editor and resolve its original `Pageimage` metadata.
	 *
	 * @param array<string, mixed> $envelope
	 * @param array<string, mixed> $payload
	 * @return array<string, mixed>
	 */
	private function executeInspectImage(array $envelope, array $payload, User $user): array
	{
		$rawSrc = trim((string) ($payload['src'] ?? ''));
		if ($rawSrc === '') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('Missing image URL.'),
			];
		}

		$mediaToken = trim((string) ($payload['mediaToken'] ?? ''));
		if ($mediaToken !== '') {
			$resolved = React::instance($this)->media()->resolveVerifiedContext($mediaToken, $user, false);
			if (!empty($resolved['ok']) && isset($resolved['pagefiles']) && $resolved['pagefiles'] instanceof Pagefiles) {
				$found = self::findPageimageInCollection($resolved['pagefiles'], $rawSrc);
				if ($found instanceof Pageimage) {
					return [
						'ok' => true,
						'found' => true,
						'pageId' => 0,
						'mediaToken' => $mediaToken,
						'basename' => (string) $found->basename(),
						'originalUrl' => (string) $found->url(),
						'originalWidth' => self::readImgWidth($found),
						'originalHeight' => self::readImgHeight($found),
						'description' => (string) ($found->description ?? ''),
						'canEditImages' => true,
					];
				}
			}
		}

		$explicitPageId = (int) ($payload['pageId'] ?? 0);
		$pageId = $explicitPageId > 0 ? $explicitPageId : self::extractPageIdFromAssetUrl($rawSrc);
		if ($pageId <= 0) {
			$pageId = (int) ($envelope['pageId'] ?? $envelope['editPageId'] ?? 0);
		}
		if ($pageId <= 0) {
			return [
				'ok' => true,
				'found' => false,
			];
		}

		$page = $this->wire()->pages->get($pageId);
		if (!$page instanceof Page || !$this->canReadPageAssets($page, $user)) {
			return [
				'ok' => true,
				'found' => false,
			];
		}

		$foundImage = $this->findOriginalPageimageOnPage($page, $rawSrc);
		if (!$foundImage instanceof Pageimage) {
			return [
				'ok' => true,
				'found' => false,
			];
		}

		return [
			'ok' => true,
			'found' => true,
			'pageId' => (int) $foundImage->page->id,
			'pageTitle' => (string) ($foundImage->page->get('title|name') ?: $foundImage->page->name),
			'basename' => (string) $foundImage->basename(),
			'originalUrl' => (string) $foundImage->url(),
			'originalWidth' => self::readImgWidth($foundImage),
			'originalHeight' => self::readImgHeight($foundImage),
			'description' => (string) ($foundImage->description ?? ''),
			'canEditImages' => $this->canCreateImageVariation($foundImage->page, $envelope, $user),
		];
	}

	/**
	 * Generate a canonical `-is` (`ProcessPageEditImageSelect`) variation with optional crop, rotation, flip, and HiDPI.
	 *
	 * @param array<string, mixed> $envelope
	 * @param array<string, mixed> $payload
	 * @return array<string, mixed>
	 */
	private function executeResize(array $envelope, array $payload, User $user): array
	{
		$rawFile = trim((string) ($payload['file'] ?? $payload['src'] ?? ''));
		if ($rawFile === '') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('Missing source image filename.'),
			];
		}

		$image = null;
		$ownerPageId = 0;
		$mediaToken = trim((string) ($payload['mediaToken'] ?? ''));

		if ($mediaToken !== '') {
			$resolved = React::instance($this)->media()->resolveVerifiedContext($mediaToken, $user, false);
			if (empty($resolved['ok'])) {
				return $resolved;
			}
			/** @var Pagefiles $pfCollection */
			$pfCollection = $resolved['pagefiles'];
			$candidate = self::findPageimageInCollection($pfCollection, $rawFile);
			if ($candidate instanceof Pageimage) {
				$image = $candidate;
			}
		} else {
			$pageId = (int) ($payload['pageId'] ?? 0);
			if ($pageId <= 0) {
				$pageId = self::extractPageIdFromAssetUrl($rawFile);
			}
			if ($pageId <= 0) {
				$pageId = (int) ($envelope['pageId'] ?? $envelope['editPageId'] ?? 0);
			}
			if ($pageId <= 0) {
				return [
					'ok' => false,
					'status' => 400,
					'error' => $this->_('Target image page could not be determined.'),
				];
			}
			$page = $this->wire()->pages->get($pageId);
			if (!$page instanceof Page || !$this->canReadPageAssets($page, $user)) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => $this->_('You do not have permission to access this image.'),
				];
			}
			if (!$this->canCreateImageVariation($page, $envelope, $user)) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => $this->_('You do not have permission to resize images here.'),
				];
			}
			$image = $this->findOriginalPageimageOnPage($page, $rawFile);
			if ($image instanceof Pageimage) {
				$ownerPageId = (int) $image->page->id;
			}
		}

		if (!$image instanceof Pageimage) {
			return [
				'ok' => false,
				'status' => 404,
				'error' => $this->_('Source image was not found.'),
			];
		}

		$ext = strtolower((string) $image->ext());
		if ($ext === 'svg') {
			$reqW = max(0, min(MediaGateway::MAX_RASTER_AXIS, (int) ($payload['width'] ?? 0)));

			return [
				'ok' => true,
				'src' => (string) $image->url(),
				'originalSrc' => (string) $image->url(),
				'name' => (string) $image->basename(),
				'width' => $reqW > 0 ? $reqW : self::readImgWidth($image),
				'height' => 0,
				'pageId' => $ownerPageId,
				'hidpi' => false,
				'nosize' => (bool) $this->getImageConfig()['noSizeAttrs'],
			];
		}

		$originalUrl = (string) $image->url();
		$originalBasename = (string) $image->basename();
		$workingImage = $image;

		// Optional explicit pixel crop (`crop: { x, y, width, height }`)
		$cropSuffix = null;
		$cropRaw = $payload['crop'] ?? null;
		if (is_string($cropRaw) && str_starts_with(trim($cropRaw), '{')) {
			$decodedCrop = json_decode($cropRaw, true, 8);
			$cropRaw = is_array($decodedCrop) ? $decodedCrop : null;
		}
		if (is_array($cropRaw)) {
			$cx = max(0, (int) ($cropRaw['x'] ?? 0));
			$cy = max(0, (int) ($cropRaw['y'] ?? 0));
			$cw = max(0, (int) ($cropRaw['width'] ?? 0));
			$ch = max(0, (int) ($cropRaw['height'] ?? 0));
			$origW = self::readImgWidth($workingImage);
			$origH = self::readImgHeight($workingImage);
			if ($cw > 0 && $ch > 0 && $origW > 0 && $origH > 0) {
				$cx = min($cx, max(0, $origW - 1));
				$cy = min($cy, max(0, $origH - $cy > 0 ? $origH - 1 : 0));
				$cw = min($cw, $origW - $cx);
				$ch = min($ch, $origH - $cy);
				if ($cw > 0 && $ch > 0 && ($cx > 0 || $cy > 0 || $cw < $origW || $ch < $origH)) {
					$cropped = $workingImage->crop($cx, $cy, $cw, $ch, [
						'cleanFilename' => true,
						'suffix' => ['is'],
						'webpAdd' => false,
						'delayed' => false,
					]);
					if ($cropped instanceof Pageimage) {
						$workingImage = $cropped;
						$cropSuffix = "cropx{$cx}y{$cy}";
					}
				}
			}
		}

		$hidpi = filter_var($payload['hidpi'] ?? false, FILTER_VALIDATE_BOOLEAN);
		$reqWidth = max(0, min(MediaGateway::MAX_RASTER_AXIS, (int) ($payload['width'] ?? 0)));
		$reqHeight = max(0, min(MediaGateway::MAX_RASTER_AXIS, (int) ($payload['height'] ?? 0)));
		$rotate = (int) ($payload['rotate'] ?? 0);
		if (!in_array($rotate, [-270, -180, -90, 0, 90, 180, 270], true)) {
			$rotate = 0;
		}
		$flip = strtolower(trim((string) ($payload['flip'] ?? '')));
		if ($flip !== 'h' && $flip !== 'v') {
			$flip = '';
		}

		$needsResize = false;

		if ($rotate !== 0 || $flip !== '') {
			$needsResize = true;
		} elseif ($reqWidth > 0) {
			$maxLogicalWidth = self::readImgWidth($workingImage, $hidpi);
			if ($reqWidth < $maxLogicalWidth) {
				$needsResize = true;
			}
		} elseif ($reqHeight > 0) {
			$maxLogicalHeight = self::readImgHeight($workingImage, $hidpi);
			if ($reqHeight < $maxLogicalHeight) {
				$needsResize = true;
			}
		}

		if ($needsResize) {
			$suffixes = ['is'];
			if ($cropSuffix !== null) {
				$suffixes[] = $cropSuffix;
			}
			$options = [
				'cleanFilename' => true,
				'suffix' => $suffixes,
				'hidpi' => $hidpi,
				'webpAdd' => false,
				'delayed' => false,
			];
			if ($rotate !== 0) {
				$options['rotate'] = $rotate;
			}
			if ($flip !== '') {
				$options['flip'] = $flip;
			}
			// Requested dimensions are display (logical) pixels; HiDPI variations store 2x physical pixels
			$scale = $hidpi ? 2 : 1;
			$physW = min(MediaGateway::MAX_RASTER_AXIS, $reqWidth * $scale);
			$physH = min(MediaGateway::MAX_RASTER_AXIS, $reqHeight * $scale);
			if ($physW > 0 && $physH > 0 && !empty($payload['forceDimensions'])) {
				$resized = $workingImage->size($physW, $physH, $options);
			} elseif ($physW > 0) {
				$resized = $workingImage->width($physW, $options);
			} elseif ($physH > 0) {
				$resized = $workingImage->height($physH, $options);
			} else {
				$targetW = max(1, self::readImgWidth($workingImage));
				$resized = $workingImage->width($targetW, $options);
			}
		} else {
			$resized = $workingImage;
		}

		if (!$resized instanceof Pageimage) {
			$resized = $workingImage;
		}

		$outWidth = self::readImgWidth($resized, $hidpi);
		$outHeight = self::readImgHeight($resized, $hidpi);
		$imgCfg = $this->getImageConfig();

		return [
			'ok' => true,
			'src' => (string) $resized->url(),
			'originalSrc' => $originalUrl,
			'name' => $originalBasename,
			'width' => $outWidth,
			'height' => $outHeight,
			'pageId' => $ownerPageId,
			'hidpi' => $hidpi,
			'nosize' => (bool) $imgCfg['noSizeAttrs'],
		];
	}

	/**
	 * Upload raster image file(s) into the target `FieldtypeImage` field on the host `Page`
	 * (or delegate to `MediaGateway` when a sibling `mediaToken` is provided).
	 *
	 * @param array<string, mixed> $envelope
	 * @param array<string, mixed> $payload
	 * @param array<string, mixed>|null $uploadedFiles
	 * @return array<string, mixed>
	 */
	private function executeUpload(
		array $envelope,
		array $payload,
		User $user,
		?array $uploadedFiles = null,
	): array {
		$mediaToken = trim((string) ($payload['mediaToken'] ?? ''));
		if ($mediaToken !== '') {
			$delegatedPayload = [
				'mediaToken' => $mediaToken,
				'action' => 'upload',
				'_requestMethod' => 'POST',
			];
			$mediaRes = React::instance($this)->media()->handleAction(
				$delegatedPayload,
				false,
				$user,
				$uploadedFiles,
			);
			if (empty($mediaRes['ok'])) {
				return $mediaRes;
			}
			$uploadedList = isset($mediaRes['items']) && is_array($mediaRes['items'])
				? $mediaRes['items']
				: (isset($mediaRes['uploaded']) && is_array($mediaRes['uploaded'])
					? $mediaRes['uploaded']
					: (isset($mediaRes['files']) && is_array($mediaRes['files']) ? array_slice($mediaRes['files'], -1) : []));
			$normalizedItems = [];
			foreach ($uploadedList as $uItem) {
				if (!is_array($uItem)) {
					continue;
				}
				$rawUrl = (string) ($uItem['url'] ?? '');
				$cleanUrl = (string) preg_replace('/[?&]nc=\d+$/', '', $rawUrl);
				$normalizedItems[] = [
					'pageId' => 0,
					'mediaToken' => $mediaToken,
					'field' => (string) ($payload['fieldName'] ?? ''),
					'basename' => (string) ($uItem['basename'] ?? $uItem['name'] ?? ''),
					'url' => $cleanUrl !== '' ? $cleanUrl : $rawUrl,
					'thumbUrl' => (string) ($uItem['thumbUrl'] ?? $rawUrl),
					'width' => (int) ($uItem['width'] ?? 0),
					'height' => (int) ($uItem['height'] ?? 0),
					'description' => (string) ($uItem['description'] ?? ''),
					'filesizeStr' => (string) ($uItem['filesizeStr'] ?? ''),
				];
			}

			return [
				'ok' => true,
				'uploaded' => $normalizedItems,
			];
		}

		$targetPageId = (int) ($payload['pageId'] ?? $envelope['pageId'] ?? $envelope['editPageId'] ?? 0);
		if ($targetPageId <= 0) {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('No target page available for image upload.'),
			];
		}

		$page = $this->wire()->pages->get($targetPageId);
		if (!$page instanceof Page || $page instanceof NullPage || (int) $page->id <= 0 || $page->isTrash()) {
			return [
				'ok' => false,
				'status' => 404,
				'error' => $this->_('Target page not found.'),
			];
		}

		$wasFormatted = $page->of();
		$page->of(false);

		try {
			$isSameHostPage = (int) $page->id === (int) ($envelope['pageId'] ?? 0)
				|| (int) $page->id === (int) ($envelope['editPageId'] ?? 0);
			$configuredFields = $isSameHostPage ? $this->normalizeFieldNames($envelope['imageFields'] ?? []) : [];
			$requestedField = trim((string) ($payload['fieldName'] ?? $envelope['uploadFieldName'] ?? ''));

			$imageField = $this->resolveUploadImageField($page, $configuredFields, $user, $requestedField);
			if (!$imageField instanceof Field) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => $this->_('No editable image field is available on this page.'),
				];
			}

			$filesBag = $uploadedFiles ?? $_FILES;
			if ($filesBag === []) {
				return [
					'ok' => false,
					'status' => 400,
					'error' => $this->_('No image file was received.'),
				];
			}

			$uploadKey = '';
			foreach (['files', 'file', (string) $imageField->name] as $candidateKey) {
				if ($candidateKey !== '' && isset($filesBag[$candidateKey]) && is_array($filesBag[$candidateKey])) {
					$uploadKey = $candidateKey;
					break;
				}
			}
			if ($uploadKey === '') {
				foreach ($filesBag as $k => $v) {
					if (is_string($k) && $k !== '' && is_array($v)) {
						$uploadKey = $k;
						break;
					}
				}
			}
			if ($uploadKey === '') {
				return [
					'ok' => false,
					'status' => 400,
					'error' => $this->_('No valid image file was received.'),
				];
			}

			$fieldInputfield = $imageField->getInputfield($page);
			$allowedExts = self::UPLOAD_IMAGE_EXTENSIONS;
			if ($fieldInputfield instanceof InputfieldFile) {
				$fieldExts = React::instance($this)->media()->resolveAllowedExtensions($fieldInputfield, [], true);
				$intersected = array_values(array_intersect($fieldExts, self::UPLOAD_IMAGE_EXTENSIONS));
				if ($intersected !== []) {
					$allowedExts = $intersected;
				}
			}

			$maxFiles = max(0, (int) ($imageField->get('maxFiles') ?? 0));
			$overwrite = (bool) ($imageField->get('overwrite') ?? false);
			$maxFilesize = max(0, (int) ($imageField->get('maxFilesize') ?? 0));

			/** @var Pageimages|mixed $existingCollection */
			$existingCollection = $page->getUnformatted($imageField->name);
			if (!$existingCollection instanceof Pageimages) {
				return [
					'ok' => false,
					'status' => 400,
					'error' => $this->_('Target field does not hold an image collection.'),
				];
			}

			if ($maxFiles > 0 && !$overwrite && $existingCollection->count() >= $maxFiles) {
				return [
					'ok' => false,
					'status' => 422,
					'error' => $this->_('The image field on this page has reached its maximum file limit.'),
				];
			}

			$tempDir = $this->wire()->files->tempDir('rw-tiptap-upload-' . (int) $user->id . '-' . bin2hex(random_bytes(4)));
			$tempPath = (string) $tempDir->get();
			$sanitizer = $this->wire()->sanitizer;

			$savedGlobalFiles = $_FILES;
			$_FILES = [$uploadKey => $filesBag[$uploadKey]];

			try {
				$uploadedNames = [];
				$uploadErrors = [];
				$remaining = ($maxFiles > 0 && !$overwrite) ? max(1, $maxFiles - $existingCollection->count()) : 0;

				if ($uploadedFiles !== null && PHP_SAPI === 'cli' && is_array($_FILES[$uploadKey])) {
					$cliEntries = self::normalizeCliFileEntries($_FILES[$uploadKey]);
					if ($remaining > 0 && count($cliEntries) > $remaining) {
						$cliEntries = array_slice($cliEntries, 0, $remaining);
					}
					foreach ($cliEntries as $idx => $entry) {
						// WireUpload deletes tmp_name on move; stage a copy inside $tempPath first so caller fixture survives
						$srcTmp = (string) ($entry['tmp_name'] ?? '');
						if ($srcTmp === '' || !is_file($srcTmp)) {
							continue;
						}
						$stagedCopy = rtrim($tempPath, '/') . '/_cli_stage_' . $idx . '_' . basename((string) ($entry['name'] ?? 'file'));
						@copy($srcTmp, $stagedCopy);
						$slotKey = '_rw_tiptap_cli_ul_' . $idx;
						$_FILES[$slotKey] = array_merge($entry, [
							'tmp_name' => $stagedCopy,
							'ajax' => true,
						]);
						$ul = new WireUpload($slotKey);
						$this->wire($ul);
						$ul->setValidExtensions($allowedExts);
						$ul->setDestinationPath($tempPath);
						$ul->setOverwrite(false);
						$ul->setLowercase(true);
						if ($maxFilesize > 0) {
							$ul->setMaxFileSize($maxFilesize);
						}
						foreach ($ul->execute() as $savedName) {
							$uploadedNames[] = $savedName;
						}
						foreach ($ul->getErrors() as $err) {
							$uploadErrors[] = (string) $err;
						}
						unset($_FILES[$slotKey]);
						if (is_file($stagedCopy)) {
							@unlink($stagedCopy);
						}
					}
				} else {
					$uploader = new WireUpload($uploadKey);
					$this->wire($uploader);
					$uploader->setValidExtensions($allowedExts);
					$uploader->setDestinationPath($tempPath);
					$uploader->setOverwrite(false);
					$uploader->setLowercase(true);
					if ($remaining > 0) {
						$uploader->setMaxFiles($remaining);
					}
					if ($maxFilesize > 0) {
						$uploader->setMaxFileSize($maxFilesize);
					}
					$uploadedNames = $uploader->execute();
					$uploadErrors = $uploader->getErrors();
				}

				if (!is_array($uploadedNames) || $uploadedNames === []) {
					$errMsg = is_array($uploadErrors) && $uploadErrors !== []
						? implode(' ', array_map('strval', $uploadErrors))
						: $this->_('Image upload failed validation.');

					return [
						'ok' => false,
						'status' => 422,
						'error' => $errMsg,
					];
				}

				$realTempDir = realpath($tempPath);
				if (!is_string($realTempDir)) {
					return [
						'ok' => false,
						'status' => 500,
						'error' => $this->_('Temporary upload directory is unavailable.'),
					];
				}
				$basePrefix = rtrim($realTempDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;

				$addedImages = [];
				foreach ($uploadedNames as $rawUploadedName) {
					$safeBase = basename((string) $rawUploadedName);
					$candidatePath = $tempPath . $safeBase;
					if ($safeBase === '' || is_link($candidatePath) || !is_file($candidatePath)) {
						continue;
					}
					$realCandidate = realpath($candidatePath);
					if (!is_string($realCandidate) || !str_starts_with($realCandidate, $basePrefix)) {
						continue;
					}

					$isValid = $sanitizer->validateFile($realCandidate, ['pagefile' => null]);
					if ($isValid === false) {
						return [
							'ok' => false,
							'status' => 422,
							'error' => $this->_('Uploaded image was rejected by security validation.'),
						];
					}

					$dims = @getimagesize($realCandidate);
					if (!is_array($dims) || $dims[0] <= 0 || $dims[1] <= 0) {
						return [
							'ok' => false,
							'status' => 422,
							'error' => $this->_('Uploaded file is not a valid raster image.'),
						];
					}
					if (
						$dims[0] > MediaGateway::MAX_RASTER_AXIS
						|| $dims[1] > MediaGateway::MAX_RASTER_AXIS
						|| ((int) $dims[0] * (int) $dims[1]) > MediaGateway::MAX_RASTER_PIXELS
					) {
						return [
							'ok' => false,
							'status' => 422,
							'error' => $this->_('Uploaded image dimensions exceed the maximum allowed pixel limit.'),
						];
					}

					if ($maxFiles === 1 && $overwrite && $existingCollection->count() > 0) {
						$existingCollection->removeAll();
					}

					$existingCollection->add($realCandidate);
					$added = $existingCollection->last();
					if ($added instanceof Pageimage) {
						// Apply field maxWidth / maxHeight server resize constraint if configured on FieldtypeImage
						$fieldMaxW = (int) ($imageField->get('maxWidth') ?? 0);
						$fieldMaxH = (int) ($imageField->get('maxHeight') ?? 0);
						$addedW = self::readImgWidth($added);
						$addedH = self::readImgHeight($added);
						if (($fieldMaxW > 0 && $addedW > $fieldMaxW) || ($fieldMaxH > 0 && $addedH > $fieldMaxH)) {
							$capW = $fieldMaxW > 0 ? min($addedW, $fieldMaxW) : 0;
							$capH = $fieldMaxH > 0 ? min($addedH, $fieldMaxH) : 0;
							$resizedOrig = $added->size($capW, $capH);
							if ($resizedOrig instanceof Pageimage && $resizedOrig->filename() !== $added->filename() && is_file($resizedOrig->filename())) {
								@copy($resizedOrig->filename(), $added->filename());
								$added->removeVariations();
							}
						}
						$addedImages[] = $added;
					}
				}

				if ($addedImages !== []) {
					// Re-assert outputFormatting off before saveField in case any Pagefile::install hook toggled it
					$page->of(false);
					try {
						$page->save($imageField->name);
					} catch (\Throwable $e) {
						foreach ($addedImages as $rollbackImg) {
							$rollbackImg->removeVariations();
							$rollbackPath = $rollbackImg->filename();
							$existingCollection->remove($rollbackImg);
							if ($rollbackPath !== '' && is_file($rollbackPath)) {
								@unlink($rollbackPath);
							}
						}
						$this->wire()->log->error('React Tiptap upload save failed: ' . $e->getMessage());

						return [
							'ok' => false,
							'status' => 422,
							'error' => $this->_('Uploaded image could not be saved to the page field.'),
						];
					}
				}

				$fieldLabel = (string) ($imageField->getLabel() ?: $imageField->name);
				$serializedUploaded = [];
				foreach ($addedImages as $img) {
					$serializedUploaded[] = $this->serializePickerImageItem(
						$img,
						(int) $page->id,
						(string) $imageField->name,
						$fieldLabel,
						null,
					);
				}

				return [
					'ok' => true,
					'pageId' => (int) $page->id,
					'fieldName' => (string) $imageField->name,
					'uploaded' => $serializedUploaded,
				];
			} finally {
				$_FILES = $savedGlobalFiles;
				$tempDir->remove();
			}
		} finally {
			$page->of($wasFormatted);
		}
	}

	/**
	 * @return list<array{url: string, basename: string, label: string, fieldLabel: string, ext: string, filesizeStr: string, description: string, pageId: int}>
	 */
	private function collectPageFiles(Page $page, string $prefixLabel): array
	{
		$template = $page->template;
		if (!$template instanceof Template || $template->fieldgroup === null) {
			return [];
		}

		$items = [];
		foreach ($template->fieldgroup as $field) {
			if (!$field instanceof Field) {
				continue;
			}
			if ($field->type instanceof FieldtypeFile) {
				if (!$page->viewable($field, false)) {
					continue;
				}
				$unformatted = $page->getUnformatted($field->name);
				$collection = $unformatted instanceof Pagefiles
					? $unformatted
					: ($unformatted instanceof Pagefile ? [$unformatted] : []);
				$fieldLabel = $prefixLabel . (string) ($field->getLabel() ?: $field->name);
				foreach ($collection as $pf) {
					if (!$pf instanceof Pagefile) {
						continue;
					}
					$entry = $this->serializeLinkFileItem($pf, $fieldLabel);
					$entry['pageId'] = (int) $page->id;
					$items[] = $entry;
				}
			} elseif ($field->type instanceof FieldtypeRepeater) {
				$repVal = $page->get($field->name);
				if ($repVal instanceof Page) {
					$repVal = [$repVal];
				}
				if (is_iterable($repVal)) {
					$subPrefix = $prefixLabel . (string) ($field->getLabel() ?: $field->name) . ' > ';
					foreach ($repVal as $subPage) {
						if ($subPage instanceof Page && (int) $subPage->id > 0 && !$subPage->isUnpublished() && !$subPage->isHidden()) {
							foreach ($this->collectPageFiles($subPage, $subPrefix) as $subFile) {
								$items[] = $subFile;
							}
						}
					}
				}
			}
		}

		return $items;
	}

	/**
	 * @param list<string> $skipFields
	 * @return list<array<string, mixed>>
	 */
	private function collectPageImages(Page $page, array $skipFields, ?Language $lang, string $prefixLabel = '', int $level = 0): array
	{
		if ($level > 4) {
			return [];
		}
		$template = $page->template;
		if (!$template instanceof Template || $template->fieldgroup === null) {
			return [];
		}

		$images = [];
		foreach ($template->fieldgroup as $field) {
			if (!$field instanceof Field || in_array((string) $field->name, $skipFields, true)) {
				continue;
			}
			if ($field->type instanceof FieldtypeRepeater) {
				$repVal = $page->get($field->name);
				if ($repVal instanceof Page) {
					$repVal = [$repVal];
				}
				if ($repVal instanceof PageArray || is_array($repVal)) {
					$subPrefix = $prefixLabel . (string) ($field->getLabel() ?: $field->name) . ' > ';
					foreach ($repVal as $subPage) {
						if ($subPage instanceof Page && (int) $subPage->id > 0) {
							foreach ($this->collectPageImages($subPage, $skipFields, $lang, $subPrefix, $level + 1) as $subImg) {
								$images[] = $subImg;
							}
						}
					}
				}
				continue;
			}

			$ft = $field->type;
			if (!$this->isFieldImageCapable($field) || !is_object($ft) || !$page->viewable($field, false)) {
				continue;
			}

			$collection = $ft instanceof FieldtypeImage
				? $page->getUnformatted($field->name)
				: (method_exists($ft, 'getPageimages') ? $ft->getPageimages($page, $field) : null);
			if (!$collection instanceof Pageimages || $collection->count() === 0) {
				continue;
			}

			$fieldLabel = $prefixLabel . (string) ($field->getLabel() ?: $field->name);
			foreach ($collection as $img) {
				if (!$img instanceof Pageimage) {
					continue;
				}
				$images[] = $this->serializePickerImageItem($img, (int) $page->id, (string) $field->name, $fieldLabel, $lang);
			}
		}

		return $images;
	}

	private function findOriginalPageimageOnPage(Page $page, string $rawFileOrSrc): ?Pageimage
	{
		$template = $page->template;
		if (!$template instanceof Template || $template->fieldgroup === null) {
			return null;
		}

		foreach ($template->fieldgroup as $field) {
			if (!$field instanceof Field) {
				continue;
			}
			$ft = $field->type;
			if ($this->isFieldImageCapable($field) && is_object($ft)) {
				if (!$page->viewable($field, false)) {
					continue;
				}
				$collection = $ft instanceof FieldtypeImage
					? $page->getUnformatted($field->name)
					: (method_exists($ft, 'getPageimages') ? $ft->getPageimages($page, $field) : null);
				if (!$collection instanceof Pageimages) {
					continue;
				}
				$matched = self::findPageimageInCollection($collection, $rawFileOrSrc);
				if ($matched instanceof Pageimage) {
					return $matched;
				}
			} elseif ($ft instanceof FieldtypeRepeater) {
				$repVal = $page->get($field->name);
				if ($repVal instanceof Page) {
					$repVal = [$repVal];
				}
				if (is_iterable($repVal)) {
					foreach ($repVal as $subPage) {
						if ($subPage instanceof Page && (int) $subPage->id > 0) {
							$subFound = $this->findOriginalPageimageOnPage($subPage, $rawFileOrSrc);
							if ($subFound instanceof Pageimage) {
								return $subFound;
							}
						}
					}
				}
			}
		}

		return null;
	}

	private static function findPageimageInCollection(Pagefiles $collection, string $rawFileOrSrc): ?Pageimage
	{
		$origBasename = self::extractOriginalBasename($rawFileOrSrc);
		if ($origBasename === '') {
			return null;
		}
		$exactBasename = basename((string) (parse_url($rawFileOrSrc, PHP_URL_PATH) ?: $rawFileOrSrc));

		$direct = $collection->get($exactBasename);
		if ($direct instanceof Pageimage) {
			return $direct;
		}
		$orig = $collection->get($origBasename);
		if ($orig instanceof Pageimage) {
			return $orig;
		}

		$origStem = strtolower((string) pathinfo($origBasename, PATHINFO_FILENAME));
		$firstDotPos = strpos($exactBasename, '.');
		$exactFirstStem = $firstDotPos !== false ? strtolower(substr($exactBasename, 0, $firstDotPos)) : strtolower($origStem);

		foreach ($collection as $candidateImg) {
			if (!$candidateImg instanceof Pageimage) {
				continue;
			}
			if ($candidateImg->isVariation($exactBasename) !== false) {
				return $candidateImg;
			}
			$candidateStem = strtolower((string) pathinfo($candidateImg->basename(), PATHINFO_FILENAME));
			if ($candidateStem !== '' && ($candidateStem === $origStem || $candidateStem === $exactFirstStem)) {
				return $candidateImg;
			}
		}

		return null;
	}

	/**
	 * @return array{url: string, basename: string, label: string, fieldLabel: string, ext: string, filesizeStr: string, description: string, pageId: int}
	 */
	private function serializeLinkFileItem(Pagefile $pf, string $fieldLabel): array
	{
		$basename = (string) $pf->basename();
		$desc = trim((string) ($pf->description ?? ''));
		$shortDesc = mb_strlen($desc, 'UTF-8') > 60 ? (mb_substr($desc, 0, 57, 'UTF-8') . '...') : $desc;
		$label = $fieldLabel !== '' ? "{$fieldLabel}: {$basename}" : $basename;
		if ($shortDesc !== '') {
			$label .= " ({$shortDesc})";
		}

		return [
			'url' => (string) $pf->url(),
			'basename' => $basename,
			'label' => $label,
			'fieldLabel' => $fieldLabel,
			'ext' => strtolower((string) $pf->ext()),
			'filesizeStr' => (string) $pf->filesizeStr(),
			'description' => $desc,
			'pageId' => $pf->page instanceof Page ? (int) $pf->page->id : 0,
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	private function serializePickerImageItem(
		Pageimage $img,
		int $pageId,
		string $fieldName,
		string $fieldLabel,
		?Language $lang,
	): array {
		$ext = strtolower((string) $img->ext());
		$origUrl = (string) $img->url();
		$thumbUrl = $origUrl;
		$w = self::readImgWidth($img);
		$h = self::readImgHeight($img);

		if ($ext !== 'svg' && $w > 320 && is_file((string) $img->filename())) {
			try {
				$thumb = $img->size(320, 240, ['upscaling' => false, 'delayed' => false]);
				if ($thumb instanceof Pageimage) {
					$thumbUrl = (string) $thumb->url();
				}
			} catch (\Throwable) {
				$thumbUrl = $origUrl;
			}
		}

		$desc = '';
		if ($lang instanceof Language) {
			$rawLangDesc = $img->description($lang);
			$desc = is_string($rawLangDesc) ? trim($rawLangDesc) : '';
		}
		if ($desc === '') {
			$desc = trim((string) ($img->description ?? ''));
		}

		return [
			'pageId' => $pageId,
			'field' => $fieldName,
			'fieldLabel' => $fieldLabel,
			'basename' => (string) $img->basename(),
			'ext' => $ext,
			'url' => $origUrl,
			'thumbUrl' => $thumbUrl,
			'width' => $w,
			'height' => $h,
			'filesizeStr' => (string) $img->filesizeStr(),
			'description' => $desc,
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	private function serializePagePickerItem(
		Page $page,
		?Language $lang,
		string $fromUrl,
		int $urlType,
	): array {
		$title = '';
		if ($lang instanceof Language && method_exists($page, 'getLanguageValue')) {
			$title = trim((string) ($page->getLanguageValue($lang, 'title') ?: ''));
		}
		if ($title === '') {
			$title = trim((string) ($page->get('title|name') ?: $page->name));
		}

		$rootUrl = $this->resolveLocalizedPageUrl($page, $lang);
		$resolvedUrl = $rootUrl;
		if ($urlType > 0 && $fromUrl !== '' && $rootUrl !== '') {
			$resolvedUrl = self::computeRelativePageUrl($fromUrl, $rootUrl, $urlType === 1);
		}

		$templateLabel = $page->template instanceof Template
			? (string) ($page->template->getLabel() ?: $page->template->name)
			: '';

		return [
			'id' => (int) $page->id,
			'parentId' => (int) $page->parent_id,
			'title' => $title,
			'name' => (string) $page->name,
			'path' => (string) $page->path,
			'url' => $resolvedUrl,
			'rootUrl' => $rootUrl,
			'template' => $templateLabel,
			'numChildren' => (int) $page->numChildren(false),
			'unpublished' => $page->isUnpublished(),
			'hidden' => $page->isHidden(),
			'hasImages' => $this->pageHasImageFields($page),
		];
	}

	private function resolveLocalizedPageUrl(Page $page, ?Language $lang): string
	{
		if ($lang instanceof Language && method_exists($page, 'localUrl')) {
			try {
				$local = (string) $page->localUrl($lang);
				if ($local !== '') {
					return $local;
				}
			} catch (\Throwable) {
				// Fall back to standard $page->url
			}
		}

		return (string) $page->url;
	}

	/**
	 * Compute relative URL matching `ProcessPageEditLink.js` `absoluteToRelativePath()`.
	 */
	public static function computeRelativePageUrl(string $fromUrl, string $toUrl, bool $sameBranchOnly): string
	{
		if ($fromUrl === '' || $toUrl === '' || $fromUrl === $toUrl) {
			return './';
		}

		$fromParts = array_values(array_filter(explode('/', trim($fromUrl, '/')), static fn(string $s): bool => $s !== ''));
		$toParts = array_values(array_filter(explode('/', trim($toUrl, '/')), static fn(string $s): bool => $s !== ''));

		$common = 0;
		$maxCommon = min(count($fromParts), count($toParts));
		while ($common < $maxCommon && $fromParts[$common] === $toParts[$common]) {
			$common++;
		}

		if ($sameBranchOnly && $common === 0 && count($fromParts) > 0) {
			return $toUrl;
		}

		$upCount = count($fromParts) - $common;
		$prefix = $upCount > 0 ? str_repeat('../', $upCount) : './';
		$tail = implode('/', array_slice($toParts, $common));
		$trailingSlash = str_ends_with($toUrl, '/') && $tail !== '' ? '/' : '';

		return $prefix . $tail . $trailingSlash;
	}

	private function canReadPageInPicker(Page $page, User $user): bool
	{
		if ($page instanceof NullPage || (int) $page->id <= 0 || $page->isTrash()) {
			return false;
		}
		$config = $this->wire()->config;
		$adminRootId = (int) ($config->adminRootPageID ?: 2);
		if ((int) $page->id === $adminRootId) {
			return false;
		}
		foreach ($page->parents() as $ancestor) {
			if ($ancestor instanceof Page && (int) $ancestor->id === $adminRootId) {
				return false;
			}
		}
		if ($user->isSuperuser()) {
			return true;
		}

		return $user->hasPermission('page-view', $page) || $page->editable();
	}

	private function canReadPageAssets(Page $page, User $user): bool
	{
		if ($page instanceof NullPage || (int) $page->id <= 0 || $page->isTrash()) {
			return false;
		}
		$config = $this->wire()->config;
		$adminRootId = (int) ($config->adminRootPageID ?: 2);
		if ((int) $page->id === $adminRootId) {
			return false;
		}
		if ($page instanceof RepeaterPage) {
			$master = $this->resolveMasterPage($page);
			if (!$master instanceof Page) {
				return false;
			}

			return $user->isSuperuser() || $master->editable() || $user->hasPermission('page-view', $master);
		}
		foreach ($page->parents() as $ancestor) {
			if ($ancestor instanceof Page && (int) $ancestor->id === $adminRootId) {
				return false;
			}
		}
		if ($user->isSuperuser()) {
			return true;
		}

		return $user->hasPermission('page-view', $page) || $page->editable();
	}

	/**
	 * Verify whether `$user` may create `-is` variations from `$imagePage` while editing the envelope context.
	 *
	 * @param array<string, mixed> $envelope
	 */
	private function canCreateImageVariation(Page $imagePage, array $envelope, User $user): bool
	{
		if ($user->isSuperuser()) {
			return true;
		}
		if (!$user->hasPermission('page-edit')) {
			return false;
		}
		$editPageId = (int) ($envelope['editPageId'] ?? $envelope['pageId'] ?? 0);
		$checkPage = $editPageId > 0 ? $this->wire()->pages->get($editPageId) : $imagePage;
		if (!$checkPage instanceof Page || $checkPage instanceof NullPage || (int) $checkPage->id <= 0) {
			$checkPage = $imagePage;
		}
		$master = $this->resolveMasterPage($checkPage) ?? $checkPage;
		$permissions = $this->wire()->permissions;
		if ($permissions->has('page-edit-images') && !$user->hasPermission('page-edit-images', $master)) {
			return false;
		}

		return $master->editable() || $imagePage->editable();
	}

	/**
	 * @return list<string>
	 */
	private function normalizeFieldNames(mixed $raw): array
	{
		$sanitizer = $this->wire()->sanitizer;
		$list = [];
		$items = is_array($raw)
			? $raw
			: (is_string($raw) ? (preg_split('/[\s,]+/', trim($raw)) ?: []) : []);
		foreach ($items as $item) {
			if (!is_scalar($item)) {
				continue;
			}
			$str = trim((string) $item);
			if ($str === 'x') {
				return ['x'];
			}
			$clean = $sanitizer->fieldName($str);
			if ($clean !== '' && !in_array($clean, $list, true)) {
				$list[] = $clean;
			}
		}

		return $list;
	}

	/**
	 * @param array<string, mixed> $raw
	 * @return list<array{name: string, type: string, tmp_name: string, error: int, size: int}>
	 */
	private static function normalizeCliFileEntries(array $raw): array
	{
		if (isset($raw['name']) && is_array($raw['name'])) {
			$out = [];
			foreach ($raw['name'] as $i => $nameVal) {
				$tmpVal = $raw['tmp_name'][$i] ?? '';
				if (!is_string($nameVal) || !is_string($tmpVal) || $tmpVal === '') {
					continue;
				}
				$out[] = [
					'name' => $nameVal,
					'type' => is_string($raw['type'][$i] ?? null) ? $raw['type'][$i] : 'application/octet-stream',
					'tmp_name' => $tmpVal,
					'error' => isset($raw['error'][$i]) ? (int) $raw['error'][$i] : UPLOAD_ERR_OK,
					'size' => isset($raw['size'][$i]) ? (int) $raw['size'][$i] : 0,
				];
			}

			return $out;
		}

		if (isset($raw['name'], $raw['tmp_name']) && is_string($raw['name']) && is_string($raw['tmp_name'])) {
			return [
				[
					'name' => $raw['name'],
					'type' => is_string($raw['type'] ?? null) ? $raw['type'] : 'application/octet-stream',
					'tmp_name' => $raw['tmp_name'],
					'error' => isset($raw['error']) ? (int) $raw['error'] : UPLOAD_ERR_OK,
					'size' => isset($raw['size']) ? (int) $raw['size'] : 0,
				],
			];
		}

		return [];
	}
}
