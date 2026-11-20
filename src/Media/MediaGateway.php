<?php

declare(strict_types=1);

namespace Totoglu\React\Media;

use ProcessWire\Field;
use ProcessWire\FieldtypeFile;
use ProcessWire\ImageSizer;
use ProcessWire\Inputfield;
use ProcessWire\InputfieldFile;
use ProcessWire\InputfieldImage;
use ProcessWire\Language;
use ProcessWire\NullPage;
use ProcessWire\Page;
use ProcessWire\Pagefile;
use ProcessWire\Pagefiles;
use ProcessWire\Pageimage;
use ProcessWire\Pageimages;
use ProcessWire\React;
use ProcessWire\Sanitizer;
use ProcessWire\User;
use ProcessWire\Wire;
use ProcessWire\WireException;
use ProcessWire\WirePageEditor;
use ProcessWire\WireUpload;
use Totoglu\React\Security\AccessGuard;

/**
 * MediaGateway
 *
 * Unified HMAC-signed media endpoint and serializer helper for `InputfieldReactImage`,
 * `InputfieldReactFile`, `FormSchemaSerializer`, and pluggable `MediaHostAdapterInterface` hosts.
 *
 * Supports both ProcessWire `Page` fields (`FieldtypeImage` / `FieldtypeFile`, including Repeaters
 * and custom per-file `fileSchema` fields) and registered custom entity hosts without requiring
 * any custom `Fieldtype`.
 */
final class MediaGateway extends Wire
{
	/**
	 * Registered non-page `MediaHostAdapterInterface` instances keyed by lowercase `kind()`.
	 *
	 * @var array<string, MediaHostAdapterInterface>
	 */
	private array $hostAdapters = [];
	/**
	 * Maximum decoded raster pixel budget (64 megapixels) and per-axis cap to prevent decompression bombs.
	 */
	public const int MAX_RASTER_PIXELS = 64_000_000;

	public const int MAX_RASTER_AXIS = 16_384;

	/**
	 * Safe default raster image extensions when none are explicitly configured (`svg` must be opted in explicitly).
	 *
	 * @var list<string>
	 */
	public const array DEFAULT_IMAGE_EXTENSIONS = [
		'jpg',
		'jpeg',
		'png',
		'gif',
		'webp',
	];

	/**
	 * Allowed keys persisted inside the signed `mediaToken` envelope.
	 *
	 * @var list<string>
	 */
	private const ALLOWED_ENVELOPE_KEYS = [
		'kind',
		'mediaProfile',
		'isImage',
		'inputName',
		'fieldName',
		'pageId',
		'rootPageId',
		'hostPageId',
		'entryUuid',
		'entryType',
		'prefix',
		'extensions',
		'maxFiles',
		'maxFilesize',
		'maxWidth',
		'maxHeight',
		'minWidth',
		'minHeight',
		'maxReject',
		'dimensionsByAspectRatio',
		'useImageEditor',
		'noUpload',
		'overwrite',
		'noLang',
		'readOnly',
	];

	/**
	 * Actions on `/_react/media` that mutate files/sidecars on disk/database and require POST + CSRF.
	 *
	 * @var list<string>
	 */
	public const MUTATING_ACTIONS = [
		'upload',
		'replace',
		'transform',
		'inspect',
		'clone',
	];

	/**
	 * Sign a media context envelope bound to `$config->userAuthSalt` and the active user ID.
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
		$envelope['typ'] = 'media';
		$envelope['uid'] = $resolvedUid;

		return React::instance($this)->tokenCodec()->encode($envelope);
	}

	/**
	 * Verify a signed `mediaToken` and return the decoded envelope, or `null` if invalid/expired.
	 *
	 * @return array<string, mixed>|null
	 */
	public function verify(string $token, ?int $expectedUserId = null): ?array
	{
		$currentUid = $expectedUserId ?? (int) $this->wire()->user->id;
		$decoded = React::instance($this)->tokenCodec()->decode($token, $currentUid);
		if (
			$decoded === null
			|| ($decoded['typ'] ?? '') !== 'media'
			|| !isset($decoded['kind'])
		) {
			return null;
		}

		return $decoded;
	}

	/**
	 * Register a custom `MediaHostAdapterInterface` for virtual or entity-backed `Pagefiles` hosts.
	 */
	public function registerHostAdapter(MediaHostAdapterInterface $adapter): void
	{
		$kind = strtolower(trim($adapter->kind()));
		if ($kind === '' || $kind === 'page') {
			return;
		}
		if ($adapter instanceof Wire) {
			$this->wire($adapter);
		}
		$this->hostAdapters[$kind] = $adapter;
	}

	/**
	 * Check whether a `MediaHostAdapterInterface` is registered for `$kind`.
	 */
	public function hasHostAdapter(string $kind): bool
	{
		return isset($this->hostAdapters[strtolower(trim($kind))]);
	}

	/**
	 * Retrieve a registered `MediaHostAdapterInterface` by `$kind`.
	 */
	public function getHostAdapter(string $kind): ?MediaHostAdapterInterface
	{
		return $this->hostAdapters[strtolower(trim($kind))] ?? null;
	}

	/**
	 * Resolve the effective `maxFiles` limit (`0` = unlimited, `1` = single asset, `> 1` = bounded collection) for a media `Inputfield`.
	 */
	public function resolveInputfieldMaxFiles(Inputfield $inputfield): int
	{
		$maxFiles = max(0, (int) ($inputfield->getSetting('maxFiles') ?? 0));
		if ($maxFiles === 0) {
			$maxItems = max(0, (int) ($inputfield->getSetting('maxItems') ?? 0));
			if ($maxItems > 0) {
				$maxFiles = $maxItems;
			} elseif ($inputfield->hasField instanceof Field) {
				$fieldMax = max(0, (int) ($inputfield->hasField->get('maxFiles') ?? 0));
				if ($fieldMax > 0) {
					$maxFiles = $fieldMax;
				}
			}
		}
		if ($maxFiles === 0 && $inputfield->getSetting('multiple') === false) {
			$maxFiles = 1;
		}

		return $maxFiles;
	}

	/**
	 * Resolve the authoritative lowercase list of allowed file extensions for an `Inputfield` and/or envelope.
	 *
	 * @param array<string, mixed> $envelope
	 * @return list<string>
	 */
	public function resolveAllowedExtensions(Inputfield $inputfield, array $envelope = [], bool $isImage = false): array
	{
		$normalize = static function (mixed $source): array {
			$tokens = [];
			if (is_array($source)) {
				foreach ($source as $item) {
					if (is_scalar($item)) {
						foreach (preg_split('/[\s,]+/', strtolower(trim((string) $item))) ?: [] as $part) {
							$clean = ltrim($part, '.');
							if ($clean !== '' && !in_array($clean, $tokens, true)) {
								$tokens[] = $clean;
							}
						}
					}
				}
			} elseif (is_string($source) && trim($source) !== '') {
				foreach (preg_split('/[\s,]+/', strtolower(trim($source))) ?: [] as $part) {
					$clean = ltrim($part, '.');
					if ($clean !== '' && !in_array($clean, $tokens, true)) {
						$tokens[] = $clean;
					}
				}
			}

			return $tokens;
		};

		$hasField = $inputfield->hasField;
		if ($hasField instanceof Field && $hasField->type instanceof FieldtypeFile) {
			try {
				$extInfo = $hasField->type->getValidFileExtensions($inputfield);
				if (is_array($extInfo) && !empty($extInfo['valid']) && is_array($extInfo['valid'])) {
					$validList = $normalize($extInfo['valid']);
					if ($validList !== []) {
						return $validList;
					}
				}
			} catch (\Throwable) {
				// Fall through to inputfield / envelope settings
			}
		}

		$fromInputfield = $normalize($inputfield->getSetting('extensions'));
		if ($fromInputfield !== []) {
			return $fromInputfield;
		}

		$fromEnvelope = $normalize($envelope['extensions'] ?? []);
		if ($fromEnvelope !== []) {
			return $fromEnvelope;
		}

		return $isImage ? self::DEFAULT_IMAGE_EXTENSIONS : [];
	}

	/**
	 * Extract a signable media context envelope from a ProcessWire `InputfieldFile` / `InputfieldImage`
	 * bound either to a `Page` or to a registered `MediaHostAdapterInterface` virtual host.
	 *
	 * @param list<string> $extensions
	 * @return array<string, mixed>|null
	 */
	public function buildEnvelopeFromInputfield(
		Inputfield $inputfield,
		bool $isImage,
		string $inputName,
		array $extensions,
		bool $readOnly = false,
	): ?array {
		$val = $inputfield->val();
		$hostPage = null;
		$dataFieldName = '';

		if ($val instanceof Pagefiles || $val instanceof Pagefile) {
			$hostPage = $val->page;
			if ($val->field !== null && (string) $val->field->name !== '') {
				$dataFieldName = (string) $val->field->name;
			}
		}

		if (!$hostPage instanceof Page) {
			$hasPage = $inputfield->hasPage;
			if ($hasPage instanceof Page) {
				$hostPage = $hasPage;
			}
		}

		if ($dataFieldName === '') {
			$hasField = $inputfield->hasField;
			if ($hasField instanceof Field) {
				$dataFieldName = (string) $hasField->name;
			} elseif (is_string($hasField) && $hasField !== '') {
				$dataFieldName = $hasField;
			} else {
				$explicitFieldName = $inputfield->get('_rwDataFieldName');
				if (is_string($explicitFieldName) && $explicitFieldName !== '') {
					$dataFieldName = $explicitFieldName;
				}
			}
		}

		$resolvedExtensions = $extensions !== []
			? $extensions
			: $this->resolveAllowedExtensions($inputfield, [], $isImage);

		$common = [
			'isImage' => $isImage,
			'inputName' => $inputName,
			'extensions' => $resolvedExtensions,
			'maxFiles' => $this->resolveInputfieldMaxFiles($inputfield),
			'maxFilesize' => (int) ($inputfield->getSetting('maxFilesize') ?? 0),
			'maxWidth' => (int) ($inputfield->getSetting('maxWidth') ?? 0),
			'maxHeight' => (int) ($inputfield->getSetting('maxHeight') ?? 0),
			'minWidth' => (int) ($inputfield->getSetting('minWidth') ?? 0),
			'minHeight' => (int) ($inputfield->getSetting('minHeight') ?? 0),
			'maxReject' => (bool) $inputfield->getSetting('maxReject'),
			'dimensionsByAspectRatio' => (bool) $inputfield->getSetting('dimensionsByAspectRatio'),
			'useImageEditor' => $isImage && ((int) ($inputfield->getSetting('useImageEditor') ?? 1) > 0),
			'noUpload' => (bool) $inputfield->getSetting('noUpload'),
			'overwrite' => (bool) $inputfield->getSetting('overwrite'),
			'noLang' => (bool) $inputfield->getSetting('noLang'),
			'readOnly' => $readOnly,
		];

		// Case 1: Custom entity / virtual file host registered via `MediaHostAdapterInterface`
		foreach ($this->hostAdapters as $adapter) {
			$customEnvelope = $adapter->buildEnvelope($inputfield, $hostPage, $dataFieldName, $inputName, $common);
			if (is_array($customEnvelope) && $customEnvelope !== []) {
				return $customEnvelope;
			}
		}

		// Case 2: Standard ProcessWire `Page` (including `RepeaterPage`)
		if (!$hostPage instanceof Page || $hostPage instanceof NullPage || (int) $hostPage->id <= 0) {
			$process = $this->wire()->process;
			if ($process instanceof WirePageEditor) {
				try {
					$candidate = $process->getPage();
					if ($candidate instanceof Page && $candidate->id > 0) {
						$hostPage = $candidate;
					}
				} catch (\Throwable) {
					$hostPage = null;
				}
			}
		}

		if ($hostPage instanceof Page && !$hostPage instanceof NullPage && (int) $hostPage->id > 0) {
			$resolvedFieldName = $dataFieldName;
			if ($resolvedFieldName === '' && $inputName !== '') {
				$cleanCandidate = (string) preg_replace('/_repeater\d+$/', '', $inputName);
				$resolvedFieldName = $cleanCandidate !== '' ? $cleanCandidate : $inputName;
			}
			if ($resolvedFieldName === '') {
				return null;
			}

			$rootPage = $hostPage;
			while ($rootPage instanceof \ProcessWire\RepeaterPage) {
				$forPage = $rootPage->getForPage();
				if (!$forPage instanceof Page || $forPage->id <= 0) {
					break;
				}
				$rootPage = $forPage;
			}

			return array_merge($common, [
				'kind' => 'page',
				'fieldName' => $resolvedFieldName,
				'pageId' => (int) $hostPage->id,
				'rootPageId' => (int) $rootPage->id,
			]);
		}

		return null;
	}

	/**
	 * Build a serialized `InputfieldMediaItem` array for a single `Pagefile` / `Pageimage`.
	 *
	 * @return array<string, mixed>
	 */
	public function serializeMediaItem(
		Pagefile $pagefile,
		Inputfield $inputfield,
		string $inputName,
		int $sortIndex,
		bool $noLang,
		bool $includeVisualAnalysis = false,
	): array {
		$hash = (string) $pagefile->hash;
		$itemId = $this->resolvePagefileInputId($inputfield, $pagefile, $inputName);

		$languages = !$noLang ? $this->wire()->languages : null;
		$defaultDesc = '';
		$descriptions = [];

		if (is_iterable($languages)) {
			foreach ($languages as $lang) {
				if (!$lang instanceof Language) {
					continue;
				}
				$rawDesc = $pagefile->description($lang);
				$langDesc = is_string($rawDesc) ? $rawDesc : '';
				if ($lang->isDefault()) {
					$defaultDesc = $langDesc;
					$descriptions['default'] = $langDesc;
				} else {
					$descriptions[(string) $lang->id] = $langDesc;
				}
			}
		} else {
			$defaultDesc = (string) ($pagefile->description ?? '');
		}

		$filename = (string) $pagefile->filename();
		$mtime = ($filename !== '' && is_file($filename)) ? (int) @filemtime($filename) : (int) ($pagefile->modified ?: 0);
		$baseUrl = (string) $pagefile->url();
		$cacheSuffix = $mtime > 0 ? (str_contains($baseUrl, '?') ? "&nc={$mtime}" : "?nc={$mtime}") : '';
		$fileUrl = $baseUrl . $cacheSuffix;
		$thumbUrl = $fileUrl;
		$width = 0;
		$height = 0;
		$focusStr = '50 50 0';
		$dominantColor = '';
		$palette = [];
		$lqip = '';

		if ($pagefile instanceof Pageimage) {
			try {
				$rawW = $pagefile->width();
				$rawH = $pagefile->height();
				$width = is_int($rawW) ? $rawW : 0;
				$height = is_int($rawH) ? $rawH : 0;
			} catch (\Throwable) {
				$width = 0;
				$height = 0;
			}

			try {
				$focusData = $pagefile->focus();
				if (is_array($focusData) && isset($focusData['str']) && is_string($focusData['str'])) {
					$focusStr = $focusData['str'];
				}
			} catch (\Throwable) {
				$focusStr = '50 50 0';
			}

			$ext = strtolower((string) $pagefile->ext());
			if ($ext !== 'svg' && $filename !== '' && is_file($filename)) {
				$thumbUrl = $this->resolveAdminThumbUrl($pagefile, $width, $height, $mtime, $fileUrl);
				[$dominantColor, $palette, $lqip] = $this->extractVisualMetadata($pagefile, $filename, $includeVisualAnalysis);
			}
		}

		[$customFields, $customValues] = $this->serializeItemCustomFields($inputfield, $pagefile);

		return [
			'id' => $itemId,
			'hash' => $hash,
			'name' => (string) $pagefile->name,
			'basename' => (string) $pagefile->basename(),
			'basenameNoExt' => (string) $pagefile->basename(false),
			'ext' => strtolower((string) $pagefile->ext()),
			'url' => $fileUrl,
			'thumbUrl' => $thumbUrl,
			'size' => ($filename !== '' && is_file($filename)) ? (int) @filesize($filename) : (int) $pagefile->filesize(),
			'filesizeStr' => (string) $pagefile->filesizeStr(),
			'description' => $defaultDesc,
			'descriptions' => $descriptions,
			'tags' => (string) ($pagefile->tags ?? ''),
			'sort' => $sortIndex,
			'isTemp' => (bool) $pagefile->isTemp(),
			'width' => $width,
			'height' => $height,
			'focus' => $focusStr,
			'dominantColor' => $dominantColor,
			'palette' => $palette,
			'lqip' => $lqip,
			'customFields' => $customFields,
			'customValues' => $customValues,
		];
	}

	/**
	 * Execute a signed media action (`upload`, `replace`, `transform`, `inspect`).
	 *
	 * @param array<string, mixed> $requestPayload
	 * @param array<string, mixed>|null $uploadedFiles Optional explicit `$_FILES`-shaped map
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

		$token = trim((string) ($requestPayload['mediaToken'] ?? ''));
		if ($token === '') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('Missing mediaToken.'),
			];
		}

		$envelope = $this->verify($token, (int) $resolvedUser->id);
		if ($envelope === null) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => $this->_('Invalid or expired mediaToken.'),
			];
		}

		$action = strtolower(trim((string) ($requestPayload['action'] ?? 'upload')));
		$isMutating = in_array($action, self::MUTATING_ACTIONS, true);
		$requireEdit = $isMutating && $action !== 'inspect';

		if ($isMutating) {
			$reqMethod = strtoupper(trim((string) ($requestPayload['_requestMethod'] ?? (PHP_SAPI !== 'cli' ? ($_SERVER['REQUEST_METHOD'] ?? '') : ''))));
			if ($reqMethod !== '' && $reqMethod !== 'POST') {
				return [
					'ok' => false,
					'status' => 405,
					'error' => $this->_('Method not allowed. POST required.'),
				];
			}
			if ($requireEdit && (bool) $this->wire()->config->demo) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => $this->_('This media field is read-only.'),
				];
			}
			if ($requireEdit && !empty($envelope['readOnly'])) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => $this->_('This media field is read-only.'),
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

		if (isset($requestPayload['_clientOwnerId']) && is_scalar($requestPayload['_clientOwnerId'])) {
			$envelope['_clientOwnerId'] = trim((string) $requestPayload['_clientOwnerId']);
		}
		if (isset($requestPayload['_clientInputName']) && is_scalar($requestPayload['_clientInputName'])) {
			$envelope['_clientInputName'] = trim((string) $requestPayload['_clientInputName']);
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
		if ($requireEdit && $prevPagesOf) {
			$pages->of(false);
		}

		try {
			$resolved = $this->resolveTargetContext($envelope, $resolvedUser, $requireEdit);
			if (empty($resolved['ok'])) {
				return $resolved;
			}

			/** @var Pagefiles $pagefiles */
			$pagefiles = $resolved['pagefiles'];
			/** @var InputfieldFile $inputfield */
			$inputfield = $resolved['inputfield'];
			$inputName = (string) ($resolved['inputName'] ?? $envelope['inputName'] ?? $inputfield->attr('name') ?: '');
			$noLang = !empty($envelope['noLang']);

			if ($requireEdit) {
				$attrs = $inputfield->getAttributes();
				$collapsed = (int) ($inputfield->collapsed ?? 0);
				$liveReadOnly = !empty($envelope['readOnly'])
					|| (bool) $inputfield->getSetting('readOnly')
					|| in_array($collapsed, [Inputfield::collapsedNoLocked, Inputfield::collapsedYesLocked], true)
					|| !empty($attrs['disabled'])
					|| !empty($attrs['readonly']);
				if ($liveReadOnly) {
					return [
						'ok' => false,
						'status' => 403,
						'error' => $this->_('This media field is read-only.'),
					];
				}
				if (
					($action === 'upload' || $action === 'replace')
					&& (!empty($envelope['noUpload']) || (bool) $inputfield->getSetting('noUpload'))
				) {
					return [
						'ok' => false,
						'status' => 403,
						'error' => $this->_('Uploads are disabled for this media field.'),
					];
				}
			}

			return match ($action) {
				'upload' => $this->executeUpload($resolved, $envelope, $pagefiles, $inputfield, $inputName, $noLang, $uploadedFiles),
				'replace' => $this->executeReplace($resolved, $envelope, $requestPayload, $pagefiles, $inputfield, $inputName, $noLang, $uploadedFiles),
				'transform' => $this->executeTransform($resolved, $envelope, $requestPayload, $pagefiles, $inputfield, $inputName, $noLang, $resolvedUser),
				'inspect' => $this->executeInspect($requestPayload, $pagefiles, $inputfield, $inputName, $noLang),
				'clone' => $this->executeClone($resolved, $envelope, $requestPayload, $pagefiles, $inputfield, $inputName, $noLang, $resolvedUser),
				default => [
					'ok' => false,
					'status' => 400,
					'error' => $this->_('Unsupported media action.'),
				],
			};
		} finally {
			if ($requireEdit && $prevPagesOf) {
				$pages->of(true);
			}
			if ($switchedUser) {
				$users->setCurrentUser($previousUser);
			}
		}
	}

	/**
	 * Verify a signed `mediaToken` for `$user` and resolve its target `Pagefiles` context.
	 *
	 * @return array<string, mixed>
	 */
	public function resolveVerifiedContext(string $mediaToken, User $user, bool $requireEdit = false): array
	{
		$envelope = $this->verify($mediaToken, (int) $user->id);
		if ($envelope === null) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => $this->_('Invalid or expired mediaToken.'),
			];
		}

		$resolved = $this->resolveTargetContext($envelope, $user, $requireEdit);
		if (!empty($resolved['ok'])) {
			$resolved['envelope'] = $envelope;
		}

		return $resolved;
	}

	/**
	 * Resolve and authorize the underlying `Page` or custom `MediaHostAdapterInterface` target.
	 *
	 * @param array<string, mixed> $envelope
	 * @return array<string, mixed>
	 */
	private function resolveTargetContext(array $envelope, User $user, bool $requireEdit): array
	{
		$kind = strtolower(trim((string) ($envelope['kind'] ?? 'page')));

		if ($kind !== '' && $kind !== 'page') {
			$adapter = $this->getHostAdapter($kind);
			if ($adapter === null) {
				return [
					'ok' => false,
					'status' => 400,
					'error' => $this->_('Requested media host adapter is not available.'),
				];
			}

			return $adapter->resolveTargetContext($envelope, $user, $requireEdit);
		}

		$pageId = (int) ($envelope['pageId'] ?? 0);
		$rootPageId = (int) ($envelope['rootPageId'] ?? 0);
		$fieldName = trim((string) ($envelope['fieldName'] ?? ''));
		$inputName = trim((string) ($envelope['inputName'] ?? $fieldName));

		$pages = $this->wire()->pages;
		$fields = $this->wire()->fields;
		if ($pageId <= 0 || $fieldName === '') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('Invalid page media context.'),
			];
		}

		$page = $pages->get($pageId);
		if (!$page instanceof Page || $page instanceof NullPage || (int) $page->id <= 0 || $page->isTrash()) {
			return [
				'ok' => false,
				'status' => 404,
				'error' => $this->_('Target page not found.'),
			];
		}

		$field = $fields->get($fieldName);
		if (
			!$field instanceof Field
			|| !$field->type instanceof FieldtypeFile
			|| !$page->template instanceof \ProcessWire\Template
			|| $page->template->fieldgroup === null
			|| !$page->template->fieldgroup->hasField($field)
		) {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('Target field is not a ProcessWire file or image field.'),
			];
		}

		$rootPage = $page;
		if ($page instanceof \ProcessWire\RepeaterPage) {
			$hops = 0;
			while ($rootPage instanceof \ProcessWire\RepeaterPage && $hops < 16) {
				$hops++;
				$forPage = $rootPage->getForPage();
				if (!$forPage instanceof Page || $forPage instanceof NullPage || $forPage->id <= 0) {
					$rootPage = null;
					break;
				}
				$rootPage = $forPage;
			}
			if ($rootPage instanceof \ProcessWire\RepeaterPage) {
				$rootPage = null;
			}
			if (
				$rootPage instanceof Page
				&& $rootPageId > 0
				&& $rootPageId !== (int) $page->id
				&& $rootPageId !== (int) $rootPage->id
			) {
				$rootPage = null;
			}
		} elseif ($rootPageId > 0 && $rootPageId !== (int) $page->id) {
			$candidateRoot = $pages->get($rootPageId);
			$rootPage = ($candidateRoot instanceof Page && !$candidateRoot instanceof NullPage && $candidateRoot->id > 0)
				? $candidateRoot
				: null;
		}

		if (!$rootPage instanceof Page || $rootPage instanceof NullPage || $rootPage->id <= 0 || $rootPage->isTrash()) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => $this->_('You do not have permission to modify this media field.'),
			];
		}

		if (!$user->isSuperuser()) {
			$allowed = $requireEdit
				? ($page->editable($fieldName) && ($page === $rootPage || $rootPage->editable()))
				: (($page->viewable($fieldName) || $page->editable($fieldName))
					&& ($page === $rootPage || $rootPage->viewable() || $rootPage->editable()));
			if (!$allowed) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => $this->_('You do not have permission to modify this media field.'),
				];
			}
		}

		$prevOf = $page->of();
		$page->of(false);
		try {
			$rawVal = $page->getUnformatted($fieldName);
			$pagefiles = $rawVal instanceof Pagefile ? $rawVal->pagefiles : $rawVal;
			if (!$pagefiles instanceof Pagefiles) {
				$isImg = !empty($envelope['isImage']);
				$pagefiles = $isImg ? new Pageimages($page) : new Pagefiles($page);
				$this->wire($pagefiles);
				$pagefiles->setField($field);
				$page->set($fieldName, $pagefiles);
			}

			$inputfield = $field->getInputfield($page);
			if (!$inputfield instanceof InputfieldFile) {
				$inputfield = !empty($envelope['isImage'])
					? $this->wire(new InputfieldImage())
					: $this->wire(new InputfieldFile());
			}
			if ($inputName !== '') {
				$inputfield->attr('name', $inputName);
			}
			$inputfield->hasPage = $page;
			$inputfield->hasField = $field;
			$inputfield->val($pagefiles);
		} finally {
			$page->of($prevOf);
		}

		return [
			'ok' => true,
			'kind' => 'page',
			'page' => $page,
			'rootPage' => $rootPage,
			'field' => $field,
			'fieldName' => $fieldName,
			'pagefiles' => $pagefiles,
			'inputfield' => $inputfield,
		];
	}

	/**
	 * Handle `action=upload` for one or more uploaded files.
	 *
	 * @param array<string, mixed> $resolved
	 * @param array<string, mixed> $envelope
	 * @param array<string, mixed>|null $uploadedFiles
	 * @return array<string, mixed>
	 */
	private function executeUpload(
		array $resolved,
		array $envelope,
		Pagefiles $pagefiles,
		InputfieldFile $inputfield,
		string $inputName,
		bool $noLang,
		?array $uploadedFiles,
	): array {
		$filesBag = $uploadedFiles ?? $_FILES;
		$hasStreamHeader = !empty($_SERVER['HTTP_X_FILENAME']);
		$uploadKey = $this->detectFilesKey($filesBag, $inputName);
		if ($uploadKey === '' && !$hasStreamHeader) {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('No uploaded files received.'),
			];
		}
		if ($uploadKey === '') {
			$uploadKey = 'files';
		}

		$pagefiles->page->filesManager()->createPath();
		$destPath = $pagefiles->path();

		$resolvedInputMax = $this->resolveInputfieldMaxFiles($inputfield);
		$envelopeMax = max(0, (int) ($envelope['maxFiles'] ?? 0));
		$maxFiles = $resolvedInputMax > 0 ? $resolvedInputMax : $envelopeMax;
		$overwrite = (bool) $inputfield->overwrite || !empty($envelope['overwrite']);

		if ($maxFiles > 1 && $pagefiles->count() >= $maxFiles) {
			if (!$overwrite || !$this->incomingMatchesExistingPagefile($filesBag, $uploadKey, $pagefiles)) {
				return [
					'ok' => false,
					'status' => 422,
					'error' => sprintf($this->_('Maximum file limit (%d) reached.'), $maxFiles),
				];
			}
		}

		$maxUploadBatch = $maxFiles === 1
			? 1
			: ($maxFiles > 1 && !$overwrite ? max(1, $maxFiles - $pagefiles->count()) : 0);

		[$savedPaths, $uploadErrors] = $this->runValidatedUpload($uploadKey, $destPath, $envelope, $inputfield, $overwrite || $maxFiles === 1, $uploadedFiles, $maxUploadBatch);
		if ($savedPaths === []) {
			return [
				'ok' => false,
				'status' => 422,
				'error' => $uploadErrors !== [] ? implode(' ', $uploadErrors) : $this->_('File upload failed validation.'),
			];
		}

		$addedHashes = [];
		$validationErrors = [];

		foreach ($savedPaths as $fullPath) {
			if (!is_file($fullPath)) {
				continue;
			}
			try {
				$basename = basename($fullPath);
				$existingSame = $pagefiles->get($basename);

				if ($maxFiles === 1 && $pagefiles->count() >= 1) {
					foreach (iterator_to_array($pagefiles) as $existing) {
						if (!$existing instanceof Pagefile) {
							continue;
						}
						if ($existing instanceof Pageimage) {
							$existing->removeVariations();
						}
						if ($existing->basename !== $basename) {
							$pagefiles->remove($existing);
						}
					}
					clearstatcache(true, $fullPath);
				} elseif ($existingSame instanceof Pagefile && $overwrite) {
					if ($existingSame instanceof Pageimage) {
						$existingSame->removeVariations();
					}
					clearstatcache(true, $fullPath);
				} elseif ($maxFiles > 1 && $pagefiles->count() >= $maxFiles) {
					@unlink($fullPath);
					$validationErrors[] = sprintf($this->_('Maximum file limit (%d) reached.'), $maxFiles);
					continue;
				}

				$pagefiles->add($fullPath);
				$added = $pagefiles->get($basename);
				if (!$added instanceof Pagefile) {
					$added = $pagefiles->last();
				}
				if (!$added instanceof Pagefile) {
					continue;
				}

				if ($added instanceof Pageimage) {
					$this->validateAndConstrainUploadedImage($added, $envelope, $inputfield);
				}

				if ($resolved['kind'] === 'page' && !$overwrite && $maxFiles !== 1) {
					$added->isTemp(true);
				}

				$addedHashes[(string) $added->hash] = true;
			} catch (\Throwable $e) {
				if (isset($added) && $added instanceof Pagefile) {
					$pagefiles->remove($added);
				}
				if (is_file($fullPath)) {
					@unlink($fullPath);
				}
				$validationErrors[] = $e->getMessage();
			}
		}

		if ($addedHashes === [] && $validationErrors !== []) {
			return [
				'ok' => false,
				'status' => 422,
				'error' => implode(' ', $validationErrors),
			];
		}

		$this->persistPagefiles($resolved, $pagefiles, $maxFiles);

		$allFiles = $this->serializeCollection($pagefiles, $inputfield, $inputName, $noLang, true);
		$newItems = array_values(array_filter(
			$allFiles,
			static fn(array $item): bool => isset($addedHashes[(string) ($item['hash'] ?? '')]),
		));

		return [
			'ok' => true,
			'status' => 200,
			'items' => $newItems,
			'files' => $allFiles,
			'warnings' => array_values(array_merge($uploadErrors, $validationErrors)),
		];
	}

	/**
	 * Handle `action=replace` for replacing an existing `Pagefile` / `Pageimage` in place
	 * while preserving descriptions (all languages), tags, focal point, custom fields, and sort index.
	 *
	 * @param array<string, mixed> $resolved
	 * @param array<string, mixed> $envelope
	 * @param array<string, mixed> $requestPayload
	 * @param array<string, mixed>|null $uploadedFiles
	 * @return array<string, mixed>
	 */
	private function executeReplace(
		array $resolved,
		array $envelope,
		array $requestPayload,
		Pagefiles $pagefiles,
		InputfieldFile $inputfield,
		string $inputName,
		bool $noLang,
		?array $uploadedFiles,
	): array {
		$targetHash = trim((string) ($requestPayload['targetHash'] ?? ''));
		$targetName = trim((string) ($requestPayload['targetName'] ?? ''));
		$targetFile = $this->findPagefileByHashOrName($pagefiles, $targetHash, $targetName);
		if (!$targetFile instanceof Pagefile) {
			return [
				'ok' => false,
				'status' => 404,
				'error' => $this->_('Target file to replace was not found.'),
			];
		}

		$filesBag = $uploadedFiles ?? $_FILES;
		$uploadKey = $this->detectFilesKey($filesBag, $inputName);
		if ($uploadKey === '') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('No replacement file received.'),
			];
		}

		// Snapshot metadata & sort order from the existing file before replacing it
		$languages = !$noLang ? $this->wire()->languages : null;
		$savedLangDescriptions = [];
		if (is_iterable($languages)) {
			foreach ($languages as $lang) {
				if ($lang instanceof Language) {
					$rawLangDesc = $targetFile->description($lang);
					$savedLangDescriptions[(int) $lang->id] = [$lang, is_string($rawLangDesc) ? $rawLangDesc : ''];
				}
			}
		}
		$savedDefaultDesc = (string) ($targetFile->description ?? '');
		$savedTags = (string) ($targetFile->tags ?? '');
		$savedFocus = '50 50 0';
		if ($targetFile instanceof Pageimage) {
			try {
				$focusInfo = $targetFile->focus();
				if (is_array($focusInfo) && isset($focusInfo['str']) && is_string($focusInfo['str'])) {
					$savedFocus = $focusInfo['str'];
				}
			} catch (\Throwable) {
				$savedFocus = '50 50 0';
			}
		}
		$savedFiledata = is_array($targetFile->filedata) ? $targetFile->filedata : [];
		$wasTemp = (bool) $targetFile->isTemp();

		$orderedNamesBefore = [];
		$targetIndex = 0;
		$idx = 0;
		foreach ($pagefiles as $pf) {
			if ($pf === $targetFile) {
				$targetIndex = $idx;
			} elseif ($pf instanceof Pagefile) {
				$orderedNamesBefore[] = (string) $pf->name;
			}
			$idx++;
		}

		$tempDirObj = $this->wire()->files->tempDir('rw-media-replace-' . bin2hex(random_bytes(4)));
		$stagingDir = (string) $tempDirObj->get();
		if (!is_dir($stagingDir)) {
			@mkdir($stagingDir, 0775, true);
		}

		try {
			[$savedPaths, $uploadErrors] = $this->runValidatedUpload($uploadKey, $stagingDir, $envelope, $inputfield, true, $uploadedFiles);
			if ($savedPaths === []) {
				return [
					'ok' => false,
					'status' => 422,
					'error' => $uploadErrors !== [] ? implode(' ', $uploadErrors) : $this->_('Replacement file failed validation.'),
				];
			}

			$stagedPath = $savedPaths[0];
			if (!empty($envelope['isImage']) && strtolower(pathinfo($stagedPath, PATHINFO_EXTENSION)) !== 'svg') {
				$dims = @getimagesize($stagedPath);
				if (!is_array($dims) || (int) $dims[0] <= 0 || (int) $dims[1] <= 0) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => $this->_('Invalid replacement image.'),
					];
				}
				$bounds = $this->resolveImageDimensionBounds((int) $dims[0], (int) $dims[1], $envelope, $inputfield);
				if (($bounds['minW'] > 0 && (int) $dims[0] < $bounds['minW']) || ($bounds['minH'] > 0 && (int) $dims[1] < $bounds['minH'])) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => sprintf($this->_('Image (%dx%d) does not meet minimum size (%dx%d).'), (int) $dims[0], (int) $dims[1], $bounds['minW'], $bounds['minH']),
					];
				}
				if (
					$bounds['maxReject']
					&& (($bounds['maxW'] > 0 && (int) $dims[0] > $bounds['maxW']) || ($bounds['maxH'] > 0 && (int) $dims[1] > $bounds['maxH']))
				) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => sprintf($this->_('Image (%dx%d) exceeds maximum allowed dimensions (%dx%d).'), (int) $dims[0], (int) $dims[1], $bounds['maxW'], $bounds['maxH']),
					];
				}
			}

			$pagefiles->page->filesManager()->createPath();
			if ($resolved['kind'] === 'page') {
				if ($targetFile instanceof Pageimage) {
					$targetFile->removeVariations();
				}
				$pagefiles->remove($targetFile);
				$pagefiles->hookPageSave();
			} else {
				$sameBasename = strtolower(basename($stagedPath)) === strtolower((string) $targetFile->basename());
				if ($sameBasename && $targetFile instanceof Pageimage) {
					$targetFile->removeVariations();
				}
				$pagefiles->remove($targetFile);
				if ($sameBasename) {
					$pagefiles->hookPageSave();
				}
			}

			$pagefiles->add($stagedPath);
			$replacement = $pagefiles->last();
			if (!$replacement instanceof Pagefile) {
				return [
					'ok' => false,
					'status' => 500,
					'error' => $this->_('Failed to attach replacement file.'),
				];
			}

			if ($replacement instanceof Pageimage) {
				$this->validateAndConstrainUploadedImage($replacement, $envelope, $inputfield);
			}

			if ($savedFiledata !== []) {
				$replacement->set('filedata', $savedFiledata);
			}
			if ($savedLangDescriptions !== []) {
				foreach ($savedLangDescriptions as [$langObj, $descVal]) {
					$replacement->description($langObj, $descVal);
				}
			} elseif ($savedDefaultDesc !== '') {
				$replacement->description = $savedDefaultDesc;
			}
			if ($savedTags !== '') {
				$replacement->tags = $savedTags;
			}
			if ($replacement instanceof Pageimage && $savedFocus !== '' && $savedFocus !== '50 50 0') {
				$replacement->focus($savedFocus);
			}
			$replacement->isTemp($wasTemp);

			// Restore original sort position inside `$pagefiles`
			$reordered = [];
			$inserted = false;
			foreach ($orderedNamesBefore as $pos => $existingName) {
				if ($pos === $targetIndex) {
					$reordered[] = $replacement;
					$inserted = true;
				}
				$pf = $pagefiles->get($existingName);
				if ($pf instanceof Pagefile) {
					$reordered[] = $pf;
				}
			}
			if (!$inserted) {
				$reordered[] = $replacement;
			}
			foreach ($reordered as $newSort => $pf) {
				$pf->set('sort', $newSort);
			}
			$pagefiles->sort('sort');

			$maxFiles = (int) ($envelope['maxFiles'] ?? $inputfield->maxFiles ?? 0);
			$this->persistPagefiles($resolved, $pagefiles, $maxFiles);

			$allFiles = $this->serializeCollection($pagefiles, $inputfield, $inputName, $noLang, true);
			$replacedHash = (string) $replacement->hash;
			$replacedSerialized = null;
			foreach ($allFiles as $fItem) {
				if (($fItem['hash'] ?? '') === $replacedHash) {
					$replacedSerialized = $fItem;
					break;
				}
			}

			return [
				'ok' => true,
				'status' => 200,
				'item' => $replacedSerialized,
				'files' => $allFiles,
			];
		} finally {
			$tempDirObj->remove();
		}
	}

	/**
	 * Handle `action=transform` (`crop`, `rotate`, `flip_h`, `flip_v`) on an existing raster `Pageimage`.
	 *
	 * @param array<string, mixed> $resolved
	 * @param array<string, mixed> $envelope
	 * @param array<string, mixed> $requestPayload
	 * @return array<string, mixed>
	 */
	private function executeTransform(
		array $resolved,
		array $envelope,
		array $requestPayload,
		Pagefiles $pagefiles,
		InputfieldFile $inputfield,
		string $inputName,
		bool $noLang,
		User $user,
	): array {
		$editorEnabled = array_key_exists('useImageEditor', $envelope)
			? (bool) $envelope['useImageEditor']
			: true;
		$liveEditorSetting = $inputfield->getSetting('useImageEditor');
		if ($liveEditorSetting !== null) {
			$editorEnabled = ((int) $liveEditorSetting) > 0;
		}
		if (!$editorEnabled) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => $this->_('You do not have image editing permission.'),
			];
		}

		if ($resolved['kind'] === 'page' && !$user->isSuperuser()) {
			$permissions = $this->wire()->permissions;
			$rootPage = $resolved['rootPage'] ?? $resolved['page'];
			if ($permissions->has('page-edit-images') && !$user->hasPermission('page-edit-images', $rootPage)) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => $this->_('You do not have image editing permission.'),
				];
			}
		}

		$targetHash = trim((string) ($requestPayload['targetHash'] ?? ''));
		$targetName = trim((string) ($requestPayload['targetName'] ?? ''));
		$targetFile = $this->findPagefileByHashOrName($pagefiles, $targetHash, $targetName);
		if (!$targetFile instanceof Pageimage) {
			return [
				'ok' => false,
				'status' => 404,
				'error' => $this->_('Target image was not found.'),
			];
		}

		$ext = strtolower((string) $targetFile->ext());
		if ($ext === 'svg') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('Vector SVG images cannot be raster-transformed.'),
			];
		}

		$filename = (string) $targetFile->filename();
		if ($filename === '' || !is_file($filename)) {
			return [
				'ok' => false,
				'status' => 404,
				'error' => $this->_('Image file does not exist on disk.'),
			];
		}

		$operation = strtolower(trim((string) ($requestPayload['operation'] ?? '')));
		$rawSrcW = $targetFile->width();
		$rawSrcH = $targetFile->height();
		$srcW = max(1, is_int($rawSrcW) ? $rawSrcW : 1);
		$srcH = max(1, is_int($rawSrcH) ? $rawSrcH : 1);

		$focusBefore = ['top' => 50.0, 'left' => 50.0, 'zoom' => 0];
		try {
			$f = $targetFile->focus();
			if (is_array($f)) {
				$focusBefore = [
					'top' => (float) ($f['top'] ?? 50.0),
					'left' => (float) ($f['left'] ?? 50.0),
					'zoom' => (int) ($f['zoom'] ?? 0),
				];
			}
		} catch (\Throwable) {
			// Keep centered default
		}

		$nextFocusStr = null;
		$prevMtime = (int) @filemtime($filename);

		try {
			if ($operation === 'crop') {
				$crop = is_array($requestPayload['crop'] ?? null) ? $requestPayload['crop'] : $requestPayload;
				$cropX = max(0, min($srcW - 1, (int) round((float) ($crop['x'] ?? 0))));
				$cropY = max(0, min($srcH - 1, (int) round((float) ($crop['y'] ?? 0))));
				$cropW = max(1, min($srcW - $cropX, (int) round((float) ($crop['width'] ?? $srcW))));
				$cropH = max(1, min($srcH - $cropY, (int) round((float) ($crop['height'] ?? $srcH))));

				$minW = (int) ($envelope['minWidth'] ?? 0);
				$minH = (int) ($envelope['minHeight'] ?? 0);
				if (($minW > 0 && $cropW < $minW) || ($minH > 0 && $cropH < $minH)) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => sprintf($this->_('Cropped area (%dx%d) is smaller than minimum required dimensions (%dx%d).'), $cropW, $cropH, $minW, $minH),
					];
				}

				if (!$this->applyCropInPlace($filename, $ext, $cropX, $cropY, $cropW, $cropH)) {
					return [
						'ok' => false,
						'status' => 500,
						'error' => $this->_('Failed to crop image.'),
					];
				}
				$nextFocusStr = '50 50 0';
			} elseif ($operation === 'rotate') {
				$degrees = (int) ($requestPayload['degrees'] ?? 90);
				if (!in_array($degrees, [90, -90, 180, -180, 270, -270], true)) {
					return [
						'ok' => false,
						'status' => 400,
						'error' => $this->_('Invalid rotation angle.'),
					];
				}
				$sizer = $this->wire(new ImageSizer($filename));
				if (!$sizer->rotate($degrees)) {
					return [
						'ok' => false,
						'status' => 500,
						'error' => $this->_('Failed to rotate image.'),
					];
				}
				$normDeg = (($degrees % 360) + 360) % 360;
				[$newTop, $newLeft] = match ($normDeg) {
					90 => [$focusBefore['left'], 100.0 - $focusBefore['top']],
					180 => [100.0 - $focusBefore['top'], 100.0 - $focusBefore['left']],
					default => [100.0 - $focusBefore['left'], $focusBefore['top']],
				};
				$nextFocusStr = round($newTop, 1) . ' ' . round($newLeft, 1) . ' ' . $focusBefore['zoom'];
			} elseif ($operation === 'flip_h') {
				$sizer = $this->wire(new ImageSizer($filename));
				if (!$sizer->flipHorizontal()) {
					return [
						'ok' => false,
						'status' => 500,
						'error' => $this->_('Failed to flip image horizontally.'),
					];
				}
				$nextFocusStr = round($focusBefore['top'], 1) . ' ' . round(100.0 - $focusBefore['left'], 1) . ' ' . $focusBefore['zoom'];
			} elseif ($operation === 'flip_v') {
				$sizer = $this->wire(new ImageSizer($filename));
				if (!$sizer->flipVertical()) {
					return [
						'ok' => false,
						'status' => 500,
						'error' => $this->_('Failed to flip image vertically.'),
					];
				}
				$nextFocusStr = round(100.0 - $focusBefore['top'], 1) . ' ' . round($focusBefore['left'], 1) . ' ' . $focusBefore['zoom'];
			} else {
				return [
					'ok' => false,
					'status' => 400,
					'error' => $this->_('Unsupported transform operation.'),
				];
			}
		} catch (\Throwable $e) {
			return [
				'ok' => false,
				'status' => 500,
				'error' => $e->getMessage(),
			];
		}

		clearstatcache(true, $filename);
		$nextMtime = max(time(), $prevMtime + 1);
		@touch($filename, $nextMtime);
		clearstatcache(true, $filename);

		$lqipSidecar = $filename . '.lqip.webp';
		if (is_file($lqipSidecar)) {
			@unlink($lqipSidecar);
		}
		if ($operation === 'crop') {
			$colorsSidecar = $filename . '.colors.json';
			if (is_file($colorsSidecar)) {
				@unlink($colorsSidecar);
			}
		}

		$targetFile->removeVariations();
		$dims = @getimagesize($filename);
		if (is_array($dims) && (int) $dims[0] > 0 && (int) $dims[1] > 0) {
			$targetFile->setImageInfo([
				'width' => (int) $dims[0],
				'height' => (int) $dims[1],
			]);
		} else {
			$targetFile->getImageInfo(true);
		}
		$targetFile->setQuietly('filesize', (int) @filesize($filename));
		$targetFile->set('modified', $nextMtime);
		$targetFile->focus($nextFocusStr);

		$maxFiles = (int) ($envelope['maxFiles'] ?? $inputfield->maxFiles ?? 0);
		$this->persistPagefiles($resolved, $pagefiles, $maxFiles);

		$allFiles = $this->serializeCollection($pagefiles, $inputfield, $inputName, $noLang, true);
		$updatedItem = null;
		foreach ($allFiles as $fItem) {
			if (($fItem['hash'] ?? '') === (string) $targetFile->hash) {
				$updatedItem = $fItem;
				break;
			}
		}

		return [
			'ok' => true,
			'status' => 200,
			'item' => $updatedItem,
			'files' => $allFiles,
		];
	}

	/**
	 * Handle `action=clone` via registered `MediaHostAdapterInterface` implementations that expose `cloneFromSource()`.
	 *
	 * @param array<string, mixed> $resolved
	 * @param array<string, mixed> $envelope
	 * @param array<string, mixed> $requestPayload
	 * @return array<string, mixed>
	 */
	private function executeClone(
		array $resolved,
		array $envelope,
		array $requestPayload,
		Pagefiles $pagefiles,
		InputfieldFile $inputfield,
		string $inputName,
		bool $noLang,
		User $user,
	): array {
		$kind = strtolower(trim((string) ($resolved['kind'] ?? $envelope['kind'] ?? 'page')));
		$adapter = $this->getHostAdapter($kind);
		if ($adapter === null || !method_exists($adapter, 'cloneFromSource')) {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('Media cloning is not supported for this host.'),
			];
		}

		/** @var array<string, mixed> $cloneOutcome */
		$cloneOutcome = $adapter->cloneFromSource($resolved, $envelope, $requestPayload, $pagefiles, $inputfield, $user);
		if (empty($cloneOutcome['ok'])) {
			return $cloneOutcome;
		}

		$clonedPagefiles = ($cloneOutcome['pagefiles'] ?? null) instanceof Pagefiles
			? $cloneOutcome['pagefiles']
			: $pagefiles;
		$allFiles = $this->serializeCollection($clonedPagefiles, $inputfield, $inputName, $noLang, false);

		return [
			'ok' => true,
			'status' => 200,
			'items' => $allFiles,
			'files' => $allFiles,
		];
	}

	/**
	 * Handle `action=inspect` to lazily compute `InterventionImage` color palette & LQIP for a single asset.
	 *
	 * @param array<string, mixed> $requestPayload
	 * @return array<string, mixed>
	 */
	private function executeInspect(
		array $requestPayload,
		Pagefiles $pagefiles,
		InputfieldFile $inputfield,
		string $inputName,
		bool $noLang,
	): array {
		$targetHash = trim((string) ($requestPayload['targetHash'] ?? ''));
		$targetName = trim((string) ($requestPayload['targetName'] ?? ''));
		$targetFile = $this->findPagefileByHashOrName($pagefiles, $targetHash, $targetName);
		if (!$targetFile instanceof Pagefile) {
			return [
				'ok' => false,
				'status' => 404,
				'error' => $this->_('Target file was not found.'),
			];
		}

		$sortIdx = 0;
		foreach ($pagefiles as $pf) {
			if ($pf === $targetFile) {
				break;
			}
			$sortIdx++;
		}

		return [
			'ok' => true,
			'status' => 200,
			'item' => $this->serializeMediaItem($targetFile, $inputfield, $inputName, $sortIdx, $noLang, true),
		];
	}

	/**
	 * Serialize all items in `$pagefiles` into `InputfieldMediaItem[]`.
	 *
	 * @return list<array<string, mixed>>
	 */
	public function serializeCollection(
		Pagefiles $pagefiles,
		Inputfield $inputfield,
		string $inputName,
		bool $noLang,
		bool $forceVisualAnalysis = false,
	): array {
		$count = $pagefiles->count();
		$includeVisual = $forceVisualAnalysis || $count <= 12;
		$result = [];
		$sortIdx = 0;

		foreach ($pagefiles as $pagefile) {
			if (!$pagefile instanceof Pagefile) {
				continue;
			}
			$result[] = $this->serializeMediaItem($pagefile, $inputfield, $inputName, $sortIdx++, $noLang, $includeVisual);
		}

		return $result;
	}

	/**
	 * Persist modified `$pagefiles` either onto the ProcessWire `Page` or via its `MediaHostAdapterInterface`.
	 *
	 * @param array<string, mixed> $resolved
	 */
	private function persistPagefiles(array $resolved, Pagefiles $pagefiles, int $maxFiles): void
	{
		$kind = strtolower(trim((string) ($resolved['kind'] ?? 'page')));
		if ($kind !== '' && $kind !== 'page') {
			$adapter = $this->getHostAdapter($kind);
			if ($adapter !== null) {
				$adapter->persistPagefiles($resolved, $pagefiles, $maxFiles);
			}

			return;
		}

		/** @var Page $page */
		$page = $resolved['page'];
		$fieldName = (string) $resolved['fieldName'];
		$prevOf = $page->of();
		$page->of(false);
		try {
			$page->trackChange($fieldName);
			$page->save($fieldName, ['quiet' => true]);
		} finally {
			$page->of($prevOf);
		}
	}

	/**
	 * Determine whether at least one incoming uploaded filename matches an existing `Pagefile` in `$pagefiles`.
	 *
	 * @param array<string, mixed> $filesBag
	 */
	private function incomingMatchesExistingPagefile(array $filesBag, string $uploadKey, Pagefiles $pagefiles): bool
	{
		$sanitizer = $this->wire()->sanitizer;
		$rawNames = [];

		if (!empty($_SERVER['HTTP_X_FILENAME'])) {
			$rawNames[] = (string) $_SERVER['HTTP_X_FILENAME'];
		}
		if (isset($filesBag[$uploadKey]) && is_array($filesBag[$uploadKey]) && isset($filesBag[$uploadKey]['name'])) {
			$entryNames = $filesBag[$uploadKey]['name'];
			if (is_array($entryNames)) {
				foreach ($entryNames as $n) {
					if (is_string($n) && $n !== '') {
						$rawNames[] = $n;
					}
				}
			} elseif (is_string($entryNames) && $entryNames !== '') {
				$rawNames[] = $entryNames;
			}
		}

		foreach ($rawNames as $rawName) {
			$candidate = strtolower(basename($rawName));
			$sanitized = strtolower((string) $sanitizer->pageName(pathinfo($candidate, PATHINFO_FILENAME), Sanitizer::translate));
			$ext = strtolower((string) pathinfo($candidate, PATHINFO_EXTENSION));
			if ($sanitized !== '' && $ext !== '') {
				$candidateSanitized = $sanitized . '.' . $ext;
				if ($pagefiles->get($candidateSanitized) instanceof Pagefile) {
					return true;
				}
			}
			if ($pagefiles->get($candidate) instanceof Pagefile) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Run `WireUpload` + extension, size, and `FileValidator` checks into `$destinationPath`.
	 *
	 * @param array<string, mixed> $envelope
	 * @param array<string, mixed>|null $uploadedFiles
	 * @return array{0: list<string>, 1: list<string>}
	 */
	private function runValidatedUpload(
		string $uploadKey,
		string $destinationPath,
		array $envelope,
		InputfieldFile $inputfield,
		bool $overwrite,
		?array $uploadedFiles = null,
		int $maxUploadBatch = 0,
	): array {
		$prevFiles = null;
		if ($uploadedFiles !== null) {
			$prevFiles = $_FILES;
			$_FILES = $uploadedFiles;
		}

		try {
			$isImage = !empty($envelope['isImage']) || $inputfield instanceof InputfieldImage;
			$extensions = $this->resolveAllowedExtensions($inputfield, $envelope, $isImage);

			$liveMaxFilesize = (int) ($inputfield->getSetting('maxFilesize') ?? 0);
			$maxFilesize = $liveMaxFilesize > 0 ? $liveMaxFilesize : (int) ($envelope['maxFilesize'] ?? 0);
			$savedNames = [];
			$errors = [];

			$cliEntries = ($uploadedFiles !== null && PHP_SAPI === 'cli' && isset($_FILES[$uploadKey]) && is_array($_FILES[$uploadKey]))
				? $this->normalizeSingleFileEntries($_FILES[$uploadKey])
				: null;

			if ($cliEntries !== null) {
				if ($maxUploadBatch > 0 && count($cliEntries) > $maxUploadBatch) {
					$cliEntries = array_slice($cliEntries, 0, $maxUploadBatch);
					$errors[] = sprintf($this->_('Maximum file limit (%d) reached.'), $maxUploadBatch);
				}
				foreach ($cliEntries as $idx => $entry) {
					$slotKey = '_rw_cli_upload_' . $idx;
					$_FILES[$slotKey] = array_merge($entry, ['ajax' => true]);
					$ul = new WireUpload($slotKey);
					$this->wire($ul);
					$ul->setDestinationPath(rtrim($destinationPath, '/') . '/');
					$ul->setOverwrite($overwrite);
					$ul->setLowercase(true);
					if ($maxUploadBatch > 0) {
						$ul->setMaxFiles(1);
					}
					if ($extensions !== []) {
						$ul->setValidExtensions($extensions);
					}
					if ($maxFilesize > 0) {
						$ul->setMaxFileSize($maxFilesize);
					}
					foreach ($ul->execute() as $name) {
						$savedNames[] = $name;
					}
					foreach ($ul->getErrors() as $err) {
						$errors[] = (string) $err;
					}
					unset($_FILES[$slotKey]);
				}
			} else {
				$ul = new WireUpload($uploadKey);
				$this->wire($ul);
				$ul->setDestinationPath(rtrim($destinationPath, '/') . '/');
				$ul->setOverwrite($overwrite);
				$ul->setLowercase(true);
				if ($maxUploadBatch > 0) {
					$ul->setMaxFiles($maxUploadBatch);
				}
				if ($extensions !== []) {
					$ul->setValidExtensions($extensions);
				}
				if ($maxFilesize > 0) {
					$ul->setMaxFileSize($maxFilesize);
				}
				$savedNames = $ul->execute();
				$errors = array_values(array_map('strval', $ul->getErrors()));
			}
			$savedPaths = [];
			$sanitizer = $this->wire()->sanitizer;

			foreach ($savedNames as $savedName) {
				$fullPath = rtrim($destinationPath, '/') . '/' . basename((string) $savedName);
				if (!is_file($fullPath)) {
					continue;
				}
				$ext = strtolower((string) pathinfo($fullPath, PATHINFO_EXTENSION));
				$contentErr = $this->validateUploadedFileContent($fullPath, $ext, $isImage);
				if ($contentErr !== null) {
					@unlink($fullPath);
					$errors[] = $contentErr;
					continue;
				}
				$valid = $sanitizer->validateFile($fullPath, ['extensions' => $extensions]);
				if ($valid === false) {
					@unlink($fullPath);
					$errors[] = sprintf($this->_('File "%s" failed content security validation.'), basename($fullPath));
					continue;
				}
				$savedPaths[] = $fullPath;
			}

			return [$savedPaths, $errors];
		} finally {
			if ($prevFiles !== null) {
				$_FILES = $prevFiles;
			}
		}
	}

	/**
	 * Perform built-in MIME, SVG XSS, and raster decompression-bomb validation on an uploaded file.
	 */
	private function validateUploadedFileContent(string $fullPath, string $ext, bool $isImage): ?string
	{
		$basename = basename($fullPath);
		$detectedMime = '';
		if (function_exists('finfo_open')) {
			$finfo = @finfo_open(FILEINFO_MIME_TYPE);
			if ($finfo !== false) {
				$mime = @finfo_file($finfo, $fullPath);
				if (is_string($mime)) {
					$detectedMime = strtolower(trim($mime));
				}
			}
		}

		$blockedMimes = [
			'text/html',
			'application/xhtml+xml',
			'text/x-php',
			'application/x-php',
			'application/x-httpd-php',
			'text/javascript',
			'application/javascript',
			'application/x-sh',
			'application/x-executable',
			'application/x-dosexec',
		];
		if ($detectedMime !== '' && in_array($detectedMime, $blockedMimes, true)) {
			return sprintf($this->_('File "%s" failed content security validation.'), $basename);
		}

		if ($ext === 'svg' || $detectedMime === 'image/svg+xml') {
			return $this->validateSafeSvgFile($fullPath, $basename);
		}

		$isRasterCandidate = $isImage || in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff'], true);
		if ($isRasterCandidate) {
			$dims = @getimagesize($fullPath);
			if (!is_array($dims) || (int) $dims[0] <= 0 || (int) $dims[1] <= 0) {
				return $this->_('Invalid image dimensions.');
			}
			$w = (int) $dims[0];
			$h = (int) $dims[1];
			if ($w > self::MAX_RASTER_AXIS || $h > self::MAX_RASTER_AXIS || ($w * $h) > self::MAX_RASTER_PIXELS) {
				return $this->_('Image resolution exceeds maximum safe pixel limit.');
			}
		}

		return null;
	}

	/**
	 * Reject SVG payloads containing active scripts, inline event handlers, external entities, or dangerous URIs.
	 */
	private function validateSafeSvgFile(string $fullPath, string $basename): ?string
	{
		$size = (int) @filesize($fullPath);
		if ($size <= 0 || $size > 8_388_608) {
			return sprintf($this->_('File "%s" failed content security validation.'), $basename);
		}

		$raw = @file_get_contents($fullPath);
		if (!is_string($raw) || $raw === '' || str_contains($raw, "\0")) {
			return sprintf($this->_('File "%s" failed content security validation.'), $basename);
		}

		if (
			str_starts_with($raw, "\xFE\xFF")
			|| str_starts_with($raw, "\xFF\xFE")
			|| preg_match('/<!ENTITY\b/i', $raw) === 1
			|| preg_match('/<\?xml-stylesheet\b/i', $raw) === 1
		) {
			return sprintf($this->_('File "%s" failed content security validation.'), $basename);
		}

		$withoutComments = (string) preg_replace('/<!--[\s\S]*?-->/', '', $raw);
		$decoded = html_entity_decode($withoutComments, ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$strippedControl = (string) preg_replace('/[\x00-\x1F\x7F]+/', '', $decoded);

		if (stripos($decoded, '<svg') === false) {
			return sprintf($this->_('File "%s" failed content security validation.'), $basename);
		}

		foreach ([$withoutComments, $decoded, $strippedControl] as $candidate) {
			if (
				preg_match('/<\s*\/?\s*(?:script|foreignobject|iframe|embed|object|applet|meta|base|link)\b/i', $candidate) === 1
				|| preg_match('/<\s*(?:animate|set|animateTransform|animateMotion)\b[^>]*\battributeName\s*=\s*["\']?\s*(?:on[a-z0-9_]+|href|xlink:href)\b/i', $candidate) === 1
				|| preg_match('/\bon[a-z0-9_]+\s*=/i', $candidate) === 1
				|| preg_match('/(?:javascript|vbscript)\s*:/i', $candidate) === 1
				|| preg_match('/data\s*:\s*(?:text\/html|application\/xhtml|image\/svg\+xml)/i', $candidate) === 1
			) {
				return sprintf($this->_('File "%s" failed content security validation.'), $basename);
			}
		}

		return null;
	}

	/**
	 * Resolve effective `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, and `maxReject` bounds,
	 * swapping axes when `dimensionsByAspectRatio` is enabled on a portrait image.
	 *
	 * @param array<string, mixed> $envelope
	 * @return array{minW: int, minH: int, maxW: int, maxH: int, maxReject: bool}
	 */
	private function resolveImageDimensionBounds(int $w, int $h, array $envelope, InputfieldFile $inputfield): array
	{
		$liveMinW = (int) ($inputfield->getSetting('minWidth') ?? 0);
		$liveMinH = (int) ($inputfield->getSetting('minHeight') ?? 0);
		$liveMaxW = (int) ($inputfield->getSetting('maxWidth') ?? 0);
		$liveMaxH = (int) ($inputfield->getSetting('maxHeight') ?? 0);

		$minW = $liveMinW > 0 ? $liveMinW : (int) ($envelope['minWidth'] ?? 0);
		$minH = $liveMinH > 0 ? $liveMinH : (int) ($envelope['minHeight'] ?? 0);
		$maxW = $liveMaxW > 0 ? $liveMaxW : (int) ($envelope['maxWidth'] ?? 0);
		$maxH = $liveMaxH > 0 ? $liveMaxH : (int) ($envelope['maxHeight'] ?? 0);

		$maxReject = (bool) ($inputfield->getSetting('maxReject') ?? ($envelope['maxReject'] ?? false));
		$byAspect = (bool) ($inputfield->getSetting('dimensionsByAspectRatio') ?? ($envelope['dimensionsByAspectRatio'] ?? false));

		if ($byAspect && $w < $h) {
			[$minW, $minH] = [$minH, $minW];
			[$maxW, $maxH] = [$maxH, $maxW];
		}

		return [
			'minW' => $minW,
			'minH' => $minH,
			'maxW' => $maxW,
			'maxH' => $maxH,
			'maxReject' => $maxReject,
		];
	}

	/**
	 * Validate `minWidth`/`minHeight`, enforce `maxReject` / `dimensionsByAspectRatio`,
	 * and apply server-side `maxWidth`/`maxHeight` constraints on uploaded images.
	 *
	 * @param array<string, mixed> $envelope
	 * @throws WireException
	 */
	private function validateAndConstrainUploadedImage(Pageimage $image, array $envelope, InputfieldFile $inputfield): void
	{
		if (strtolower((string) $image->ext()) === 'svg') {
			return;
		}

		$rawW = $image->width();
		$rawH = $image->height();
		$w = is_int($rawW) ? $rawW : 0;
		$h = is_int($rawH) ? $rawH : 0;
		if ($w <= 0 || $h <= 0) {
			throw new WireException($this->_('Invalid image dimensions.'));
		}
		if ($w > self::MAX_RASTER_AXIS || $h > self::MAX_RASTER_AXIS || ($w * $h) > self::MAX_RASTER_PIXELS) {
			throw new WireException($this->_('Image resolution exceeds maximum safe pixel limit.'));
		}

		$bounds = $this->resolveImageDimensionBounds($w, $h, $envelope, $inputfield);
		$minW = $bounds['minW'];
		$minH = $bounds['minH'];
		if (($minW > 0 && $w < $minW) || ($minH > 0 && $h < $minH)) {
			throw new WireException(
				sprintf($this->_('Image (%dx%d) does not meet minimum size requirements (%dx%d).'), $w, $h, $minW, $minH),
			);
		}

		$maxW = $bounds['maxW'];
		$maxH = $bounds['maxH'];
		if (($maxW > 0 && $w > $maxW) || ($maxH > 0 && $h > $maxH)) {
			if ($bounds['maxReject']) {
				throw new WireException(
					sprintf($this->_('Image (%dx%d) exceeds maximum allowed dimensions (%dx%d).'), $w, $h, $maxW, $maxH),
				);
			}
			$sizer = $this->wire(new ImageSizer($image->filename()));
			$sizer->setUpscaling(false);
			$sizer->setCropping(false);
			$sizer->resize($maxW > 0 ? $maxW : 0, $maxH > 0 ? $maxH : 0);
			clearstatcache(true, $image->filename());
			$dims = @getimagesize($image->filename());
			if (is_array($dims) && (int) $dims[0] > 0 && (int) $dims[1] > 0) {
				$image->setImageInfo([
					'width' => (int) $dims[0],
					'height' => (int) $dims[1],
				]);
			}
			$image->setQuietly('filesize', (int) @filesize($image->filename()));
		}
	}

	/**
	 * Crop an image file in place using `InterventionImage` when installed, or ProcessWire `ImageSizer` as fallback.
	 */
	private function applyCropInPlace(string $filename, string $ext, int $x, int $y, int $width, int $height): bool
	{
		$modules = $this->wire()->modules;
		if ($modules->isInstalled('InterventionImage')) {
			try {
				$imgModule = $modules->get('InterventionImage');
				if (is_object($imgModule) && method_exists($imgModule, 'manager') && class_exists(\Intervention\Image\Format::class)) {
					$image = $imgModule->manager()->decodePath($filename);
					$image->crop($width, $height, x: $x, y: $y);
					$format = \Intervention\Image\Format::tryCreate($ext) ?? \Intervention\Image\Format::JPEG;
					$encoded = $image->encodeUsingFormat($format, quality: 90);
					$encoded->save($filename);

					return true;
				}
			} catch (\Throwable) {
				// Fall back to ProcessWire core ImageSizer below
			}
		}

		$sizer = $this->wire(new ImageSizer($filename));
		$sizer->setCropExtra([$x, $y, $width, $height]);

		return (bool) $sizer->resize($width, $height);
	}

	/**
	 * Generate or resolve a lightweight `260px` admin thumbnail URL so large multi-megabyte originals
	 * are never downloaded just to render grid thumbnails.
	 */
	private function resolveAdminThumbUrl(Pageimage $pagefile, int $width, int $height, int $mtime, string $fallbackUrl): string
	{
		if ($width <= 0 || $height <= 0 || ($width <= 360 && $height <= 260)) {
			return $fallbackUrl;
		}

		try {
			$thumb = $width >= $height
				? $pagefile->height(260, ['upscaling' => false, 'cropping' => false])
				: $pagefile->width(260, ['upscaling' => false, 'cropping' => false]);
			if ($thumb instanceof Pageimage) {
				$tUrl = (string) $thumb->url();
				if ($tUrl !== '') {
					$tFile = (string) $thumb->filename();
					$tMtime = ($tFile !== '' && is_file($tFile)) ? (int) @filemtime($tFile) : $mtime;

					return $tMtime > 0
						? ($tUrl . (str_contains($tUrl, '?') ? "&nc={$tMtime}" : "?nc={$tMtime}"))
						: $tUrl;
				}
			}
		} catch (\Throwable) {
			// Fall back to original URL if variation creation fails
		}

		return $fallbackUrl;
	}

	/**
	 * Extract `InterventionImage` visual metadata (`dominantColor`, `palette`, `lqip`), reading cached sidecars
	 * (`{basename}.colors.json` and `{basename}.lqip.webp`) immediately when present, or computing them when requested.
	 *
	 * @return array{0: string, 1: list<string>, 2: string}
	 */
	private function extractVisualMetadata(Pageimage $pagefile, string $filename, bool $computeIfMissing): array
	{
		$dominantColor = '';
		$palette = [];
		$lqip = '';

		$colorsPath = $filename . '.colors.json';
		$lqipPath = $filename . '.lqip.webp';

		if (!is_link($colorsPath) && is_file($colorsPath)) {
			$colorsBytes = @filesize($colorsPath);
			$rawColors = ($colorsBytes !== false && $colorsBytes > 0 && $colorsBytes <= 65536)
				? @file_get_contents($colorsPath, false, null, 0, 65536)
				: false;
			if (is_string($rawColors) && $rawColors !== '') {
				$decoded = json_decode($rawColors, true, 16);
				if (is_array($decoded)) {
					if (
						!empty($decoded['dominant'])
						&& is_string($decoded['dominant'])
						&& preg_match('/^#[0-9a-fA-F]{3,8}$/', $decoded['dominant']) === 1
					) {
						$dominantColor = $decoded['dominant'];
					}
					$rawPalette = is_array($decoded['palette'] ?? null)
						? $decoded['palette']
						: (is_array($decoded['6'] ?? null) ? $decoded['6'] : []);
					if ($rawPalette !== []) {
						$palette = array_values(array_filter(
							array_map('strval', $rawPalette),
							static fn(string $hex): bool => preg_match('/^#[0-9a-fA-F]{3,8}$/', $hex) === 1,
						));
					}
				}
			}
		}

		if (!is_link($lqipPath) && is_file($lqipPath)) {
			$lqipBytes = @filesize($lqipPath);
			$rawLqip = ($lqipBytes !== false && $lqipBytes > 0 && $lqipBytes <= 65536)
				? @file_get_contents($lqipPath, false, null, 0, 65536)
				: false;
			if (is_string($rawLqip) && $rawLqip !== '') {
				$lqip = 'data:image/webp;base64,' . base64_encode($rawLqip);
			}
		}

		if (!$computeIfMissing) {
			return [$dominantColor, $palette, $lqip];
		}

		$dims = @getimagesize($filename);
		if (
			!is_array($dims)
			|| (int) $dims[0] <= 0
			|| (int) $dims[1] <= 0
			|| (int) $dims[0] > self::MAX_RASTER_AXIS
			|| (int) $dims[1] > self::MAX_RASTER_AXIS
			|| ((int) $dims[0] * (int) $dims[1]) > self::MAX_RASTER_PIXELS
		) {
			return [$dominantColor, $palette, $lqip];
		}

		$modules = $this->wire()->modules;
		if (!$modules->isInstalled('InterventionImage')) {
			return [$dominantColor, $palette, $lqip];
		}

		if ($dominantColor === '') {
			try {
				$dom = $pagefile->dominantColor(true);
				if (is_string($dom) && preg_match('/^#[0-9a-fA-F]{3,8}$/', $dom) === 1) {
					$dominantColor = $dom;
				}
			} catch (\Throwable) {
				$dominantColor = '';
			}
		}

		if ($palette === []) {
			try {
				$pal = $pagefile->palette(6, true);
				if (is_array($pal)) {
					$palette = array_values(array_filter(
						array_map('strval', $pal),
						static fn(string $hex): bool => preg_match('/^#[0-9a-fA-F]{3,8}$/', $hex) === 1,
					));
				}
			} catch (\Throwable) {
				$palette = [];
			}
		}

		if ($lqip === '') {
			try {
				$lqipUri = $pagefile->lqip();
				if (
					is_string($lqipUri)
					&& strlen($lqipUri) <= 98304
					&& preg_match('/^data:image\/(?:webp|png|jpe?g|gif|avif);base64,[A-Za-z0-9+\/=]+$/i', $lqipUri) === 1
				) {
					$lqip = $lqipUri;
				}
			} catch (\Throwable) {
				$lqip = '';
			}
		}

		return [$dominantColor, $palette, $lqip];
	}

	/**
	 * Serialize ProcessWire custom per-file `InputfieldWrapper` (`getItemInputfields($pagefile)`)
	 * into `SchemaForm` nodes and flat initial values.
	 *
	 * @return array{0: list<array<string, mixed>>, 1: array<string, mixed>}
	 */
	private function serializeItemCustomFields(Inputfield $inputfield, Pagefile $pagefile): array
	{
		if (!$inputfield instanceof InputfieldFile) {
			return [[], []];
		}

		$hadTempEid = false;
		$input = $this->wire()->input;
		$hasPage = $inputfield->hasPage;
		if (
			$hasPage instanceof \ProcessWire\RepeaterPage
			&& !($this->wire()->process instanceof WirePageEditor)
			&& (int) ($input->get('eid') ?? 0) === 0
		) {
			$input->get->set('eid', -1);
			$hadTempEid = true;
		}

		try {
			$itemWrapper = $inputfield->getItemInputfields($pagefile);
			if (!$itemWrapper instanceof \ProcessWire\InputfieldWrapper || $itemWrapper->count() === 0) {
				return [[], []];
			}

			$serializer = React::instance($this)->forms();
			$serialized = $serializer->serialize($itemWrapper, ['isFragment' => true]);
			$fields = isset($serialized['fields']) && is_array($serialized['fields']) ? array_values($serialized['fields']) : [];
			$values = isset($serialized['values']) && is_array($serialized['values']) ? $serialized['values'] : [];

			return [$fields, $values];
		} catch (\Throwable) {
			return [[], []];
		} finally {
			if ($hadTempEid) {
				unset($input->get['eid']);
			}
		}
	}

	/**
	 * Compute the exact item input ID (`{fieldName}_{context}{hash}`) expected by `InputfieldFile::processInputFile()`.
	 */
	public function resolvePagefileInputId(Inputfield $inputfield, Pagefile $pagefile, string $fallbackName): string
	{
		$rawAttrName = $inputfield->attr('name');
		$name = is_scalar($rawAttrName) && (string) $rawAttrName !== '' ? (string) $rawAttrName : $fallbackName;
		$context = '';
		$fileContext = (string) ($inputfield->getSetting('fileContext') ?? '');
		if ($fileContext !== '') {
			$context .= $fileContext . '_';
		}

		$hasPage = $inputfield->hasPage;
		if ($hasPage instanceof \ProcessWire\RepeaterPage) {
			$process = $this->wire()->process;
			$eid = (int) ($this->wire()->input->get('eid') ?? 0);
			if ($eid <= 0 && $process instanceof WirePageEditor) {
				try {
					$editedPage = $process->getPage();
					$eid = $editedPage instanceof Page ? (int) $editedPage->id : 0;
				} catch (\Throwable) {
					$eid = 0;
				}
			}
			if (!($process instanceof WirePageEditor && $eid === (int) $hasPage->id) && !str_contains($name, '_repeater')) {
				$context .= "repeater{$hasPage->id}_";
			}
		}

		return $name . '_' . $context . $pagefile->hash;
	}

	/**
	 * Locate a `Pagefile` in `$pagefiles` by hash or basename.
	 */
	private function findPagefileByHashOrName(Pagefiles $pagefiles, string $hash, string $name): ?Pagefile
	{
		if ($hash !== '') {
			foreach ($pagefiles as $pf) {
				if ($pf instanceof Pagefile && (string) $pf->hash === $hash) {
					return $pf;
				}
			}
		}
		if ($name !== '') {
			$found = $pagefiles->get(basename($name));
			if ($found instanceof Pagefile) {
				return $found;
			}
		}

		return null;
	}

	/**
	 * Detect the active upload field key inside `$_FILES`.
	 *
	 * @param array<string, mixed> $filesBag
	 */
	private function detectFilesKey(array $filesBag, string $inputName): string
	{
		foreach (['files', 'file', $inputName] as $candidate) {
			if ($candidate !== '' && isset($filesBag[$candidate]) && is_array($filesBag[$candidate])) {
				return $candidate;
			}
		}
		foreach ($filesBag as $key => $entry) {
			if (is_string($key) && $key !== '' && is_array($entry)) {
				return $key;
			}
		}

		return '';
	}

	/**
	 * Normalize single or multi-file `$_FILES[key]` arrays into a list of single-file entries.
	 *
	 * @param array<string, mixed> $rawEntry
	 * @return list<array{name: string, tmp_name: string, size: int, error: int}>
	 */
	private function normalizeSingleFileEntries(array $rawEntry): array
	{
		if (isset($rawEntry['name']) && is_array($rawEntry['name'])) {
			$list = [];
			foreach ($rawEntry['name'] as $k => $n) {
				$list[] = [
					'name' => (string) $n,
					'tmp_name' => (string) ($rawEntry['tmp_name'][$k] ?? ''),
					'size' => (int) ($rawEntry['size'][$k] ?? 0),
					'error' => (int) ($rawEntry['error'][$k] ?? UPLOAD_ERR_OK),
				];
			}

			return $list;
		}

		if (isset($rawEntry['name'], $rawEntry['tmp_name'])) {
			return [[
				'name' => (string) $rawEntry['name'],
				'tmp_name' => (string) $rawEntry['tmp_name'],
				'size' => (int) ($rawEntry['size'] ?? 0),
				'error' => (int) ($rawEntry['error'] ?? UPLOAD_ERR_OK),
			]];
		}

		return [];
	}
}
