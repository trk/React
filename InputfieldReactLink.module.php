<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Inertia\InputfieldReact;
use Totoglu\React\Media\PageLinkMediaHostAdapter;
use Totoglu\React\Security\UrlSanitizer;
use Totoglu\React\Support\IslandMarkup;

/**
 * InputfieldReactLink
 *
 * Dual-mode Inertia + React ProcessWire Inputfield (`extends InputfieldReact`) for polymorphic
 * link & media selection (`page`, `url` with native `#anchor` support, strict `tel`, `email`,
 * configurable multi-profile `media` uploads such as `file`, `image`, `video`, or registered custom resolver types).
 *
 * @property array<int, string>|string $linkTypes Allowed target types (e.g. `['page', 'url', 'tel', 'email', 'file']`)
 * @property string $defaultType Default active target type (default: `'page'`)
 * @property array<string, mixed>|string $mediaProfiles Custom or overridden media upload profiles (`image`, `video`, `file`, etc.)
 * @property bool $enableLabel Show Link Label input when target is populated (default: `true`)
 * @property bool $enableAriaLabel Show ARIA Label input when target is populated (default: `true`)
 * @property bool $enableTarget Show Open Target selector in Link Settings (default: `true`)
 * @property bool $enableRel Show Rel Attribute input in Link Settings (default: `true`)
 * @property bool $enableAnchor Show `#anchor` fragment input in Link Settings (default: `true`)
 * @property bool $enableQuery Show `?query` parameter input in Link Settings (default: `true`)
 * @property string $selector Optional ProcessWire selector narrowing selectable `Page` targets
 * @property string $blueprintType Optional scope identifier forwarded to custom link target resolvers
 * @property bool $readOnly Render in read-only mode
 */
class InputfieldReactLink extends InputfieldReact
{
	public const bool INERTIA_IS_LINK_FIELD = true;
	public const int MAX_JSON_BYTES = 65536;
	public const int MAX_JSON_DEPTH = 12;

	/**
	 * Canonical built-in link target types (`anchor` is unified into `url`).
	 *
	 * @var list<string>
	 */
	public const array DEFAULT_TYPES = [
		'page',
		'url',
		'tel',
		'email',
		'file',
	];

	/**
	 * Extensions classifying a media profile as raster/vector image.
	 *
	 * @var list<string>
	 */
	public const array IMAGE_EXTENSIONS = [
		'jpg',
		'jpeg',
		'png',
		'gif',
		'webp',
		'avif',
		'svg',
	];

	/**
	 * Extensions classifying a media profile as native video.
	 *
	 * @var list<string>
	 */
	public const array VIDEO_EXTENSIONS = [
		'mp4',
		'webm',
		'mov',
		'ogv',
		'm4v',
	];

	/**
	 * Executable / script extensions strictly forbidden in link media profiles.
	 *
	 * @var list<string>
	 */
	private const array FORBIDDEN_EXTENSIONS = [
		'php',
		'php3',
		'php4',
		'php5',
		'php7',
		'php8',
		'phtml',
		'phar',
		'htaccess',
		'cgi',
		'pl',
		'py',
		'sh',
		'bat',
		'cmd',
		'exe',
		'dll',
		'msi',
		'jsp',
		'asp',
		'aspx',
		'html',
		'htm',
		'xhtml',
		'shtml',
		'js',
		'mjs',
		'cjs',
	];

	public function __construct()
	{
		parent::__construct();
		$this->set('linkTypes', self::DEFAULT_TYPES);
		$this->set('defaultType', 'page');
		$this->set('mediaProfiles', '');
		$this->set('enableLabel', true);
		$this->set('enableAriaLabel', true);
		$this->set('enableTarget', true);
		$this->set('enableRel', true);
		$this->set('enableAnchor', true);
		$this->set('enableQuery', true);
		$this->set('selector', '');
		$this->set('blueprintType', '');
		$this->set('readOnly', false);
		$this->setAttribute('value', self::normalizeValue([]));
	}

	public function inertiaComponent(): string
	{
		return 'InputfieldReactLink';
	}

	/**
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		return React::instance($this)->resolveModuleAssetUrl('InputfieldReactLink.js');
	}

	/**
	 * Enqueue `ReactMedia.css` only when media target types (`file`, `image`, `video`) are enabled.
	 *
	 * @return list<string>
	 */
	public function getModuleStyleAssets(): array
	{
		$types = self::normalizeTypeList($this->getSetting('linkTypes') ?? self::DEFAULT_TYPES);
		if (array_intersect($types, ['file', 'image', 'video']) === []) {
			return [];
		}

		return React::instance($this)->resolveModuleAssetUrl('ReactMedia.css');
	}

	/**
	 * Determine whether a ProcessWire `Field` uses `InputfieldReactLink`.
	 */
	public static function isLinkField(?Field $field): bool
	{
		if (!$field instanceof Field || !$field->type instanceof FieldtypeText) {
			return false;
		}
		$cls = strtolower(trim((string) ($field->get('inputfieldClass') ?? '')));

		return $cls === 'inputfieldreactlink';
	}

	/**
	 * Sanitize a phone number strictly to an optional leading `+` followed by digits `0-9` only.
	 */
	public static function sanitizePhoneValue(string $raw): string
	{
		$stripped = trim((string) preg_replace('/^tel:/i', '', trim($raw)));
		if ($stripped === '') {
			return '';
		}
		$hasLeadingPlus = str_starts_with($stripped, '+');
		$digits = preg_replace('/[^0-9]+/', '', $stripped) ?? '';
		if ($digits === '') {
			return '';
		}

		return ($hasLeadingPlus ? '+' : '') . substr($digits, 0, 30);
	}

	/**
	 * Validate that a raw phone input contains only digits `0-9` and at most one leading `+`.
	 */
	public static function isValidPhoneInput(string $raw): bool
	{
		$trimmed = trim((string) preg_replace('/^tel:/i', '', trim($raw)));
		if ($trimmed === '') {
			return true;
		}

		return preg_match('/^\+?[0-9]{1,30}$/', $trimmed) === 1;
	}

	/**
	 * Sanitize an `href` / URL string, rejecting executable protocols (`javascript:`, `vbscript:`, `data:`).
	 */
	public static function sanitizeHref(string $href): string
	{
		return UrlSanitizer::sanitizeHref($href, true);
	}

	/**
	 * Built-in default media profile definitions (`image`, `video`, `file`).
	 *
	 * @return array<string, array{key: string, kind: string, isImage: bool, isVideo: bool, label: string, icon: string, extensions: list<string>, accept: string, maxFilesize: int}>
	 */
	public static function defaultMediaProfilePresets(): array
	{
		return [
			'image' => self::buildMediaProfileEntry('image', [
				'kind' => 'image',
				'label' => 'Image',
				'icon' => 'image',
				'extensions' => self::IMAGE_EXTENSIONS,
			]),
			'video' => self::buildMediaProfileEntry('video', [
				'kind' => 'video',
				'label' => 'Video',
				'icon' => 'film',
				'extensions' => ['mp4', 'webm', 'mov'],
			]),
			'file' => self::buildMediaProfileEntry('file', [
				'kind' => 'file',
				'label' => 'File',
				'icon' => 'file-up',
				'extensions' => ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'csv', 'txt'],
			]),
		];
	}

	/**
	 * Normalize arbitrary `media` / `mediaProfiles` definitions (associative array, JSON object, or
	 * multi-line `profile: ext1 ext2` lines) merged with built-in presets for enabled types (`file`, `image`, `video`).
	 *
	 * @param list<string> $enabledTypes
	 * @return array<string, array{key: string, kind: string, isImage: bool, isVideo: bool, label: string, icon: string, extensions: list<string>, accept: string, maxFilesize: int}>
	 */
	public static function normalizeMediaProfiles(mixed $rawMedia, array $enabledTypes = []): array
	{
		if ($rawMedia === false) {
			return [];
		}

		$presets = self::defaultMediaProfilePresets();
		$parsedCustom = [];

		if (is_string($rawMedia)) {
			$trimmed = trim($rawMedia);
			if ($trimmed !== '') {
				if (str_starts_with($trimmed, '{')) {
					$decoded = json_decode($trimmed, true, self::MAX_JSON_DEPTH);
					if (is_array($decoded)) {
						$parsedCustom = $decoded;
					}
				} else {
					foreach (preg_split('/\r\n|\r|\n/', $trimmed) ?: [] as $line) {
						$line = trim($line);
						if ($line === '' || str_starts_with($line, '#')) {
							continue;
						}
						$sepPos = strpos($line, ':');
						if ($sepPos === false) {
							$sepPos = strpos($line, '=');
						}
						if ($sepPos === false || $sepPos === 0) {
							continue;
						}
						$pKey = strtolower(trim(substr($line, 0, $sepPos)));
						$pExts = trim(substr($line, $sepPos + 1));
						if ($pKey !== '' && preg_match('/^[a-z0-9_-]{1,32}$/', $pKey) === 1) {
							$parsedCustom[$pKey] = ['extensions' => $pExts];
						}
					}
				}
			}
		} elseif (is_array($rawMedia)) {
			$parsedCustom = $rawMedia;
		}

		$profiles = [];

		foreach ($enabledTypes as $typeKey) {
			$cleanType = strtolower(trim($typeKey));
			if (isset($presets[$cleanType]) && !array_key_exists($cleanType, $parsedCustom)) {
				$profiles[$cleanType] = $presets[$cleanType];
			}
		}

		foreach ($parsedCustom as $rawKey => $spec) {
			if (is_int($rawKey) && is_string($spec)) {
				$k = strtolower(trim($spec));
				if (isset($presets[$k])) {
					$profiles[$k] = $presets[$k];
				}
				continue;
			}
			$key = strtolower(trim((string) $rawKey));
			if ($key === '' || preg_match('/^[a-z0-9_-]{1,32}$/', $key) !== 1) {
				continue;
			}
			if ($spec === false) {
				unset($profiles[$key]);
				continue;
			}
			$base = $presets[$key] ?? [];
			if (is_string($spec)) {
				$mergedSpec = array_merge($base, ['extensions' => $spec]);
			} elseif (is_array($spec)) {
				$mergedSpec = array_merge($base, $spec);
			} else {
				$mergedSpec = $base;
			}
			$built = self::buildMediaProfileEntry($key, $mergedSpec);
			if ($built['extensions'] !== []) {
				$profiles[$key] = $built;
			}
		}

		return $profiles;
	}

	/**
	 * Resolve configured media profiles for a ProcessWire `Field`.
	 *
	 * @return array<string, array{key: string, kind: string, isImage: bool, isVideo: bool, label: string, icon: string, extensions: list<string>, accept: string, maxFilesize: int}>
	 */
	public static function resolveFieldMediaProfiles(Field $field): array
	{
		$types = self::normalizeTypeList($field->get('linkTypes') ?? self::DEFAULT_TYPES);
		$rawMedia = $field->get('mediaProfiles') ?? $field->get('media') ?? '';

		return self::normalizeMediaProfiles($rawMedia, $types);
	}

	/**
	 * @param array<string, mixed> $spec
	 * @return array{key: string, kind: string, isImage: bool, isVideo: bool, label: string, icon: string, extensions: list<string>, accept: string, maxFilesize: int}
	 */
	private static function buildMediaProfileEntry(string $key, array $spec): array
	{
		$rawExts = $spec['extensions'] ?? [];
		if (is_string($rawExts)) {
			$rawExts = preg_split('/[\s,|]+/', strtolower(trim($rawExts)), -1, PREG_SPLIT_NO_EMPTY) ?: [];
		}
		$exts = [];
		if (is_array($rawExts)) {
			foreach ($rawExts as $ext) {
				if (!is_string($ext)) {
					continue;
				}
				$cleanExt = ltrim(strtolower(trim($ext)), '.');
				if (
					$cleanExt !== ''
					&& preg_match('/^[a-z0-9]{1,12}$/', $cleanExt) === 1
					&& !in_array($cleanExt, self::FORBIDDEN_EXTENSIONS, true)
					&& !in_array($cleanExt, $exts, true)
				) {
					$exts[] = $cleanExt;
				}
			}
		}

		$explicitKind = strtolower(trim((string) ($spec['kind'] ?? $spec['type'] ?? '')));
		if ($explicitKind === 'image' || !empty($spec['isImage'])) {
			$kind = 'image';
		} elseif ($explicitKind === 'video' || !empty($spec['isVideo'])) {
			$kind = 'video';
		} elseif ($exts !== [] && array_diff($exts, self::IMAGE_EXTENSIONS) === []) {
			$kind = 'image';
		} elseif ($exts !== [] && array_diff($exts, self::VIDEO_EXTENSIONS) === []) {
			$kind = 'video';
		} else {
			$kind = 'file';
		}

		if ($exts === []) {
			$exts = match ($kind) {
				'image' => self::IMAGE_EXTENSIONS,
				'video' => ['mp4', 'webm', 'mov'],
				default => ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'csv', 'txt'],
			};
		}

		$defaultLabel = ucfirst(str_replace(['_', '-'], ' ', $key));
		$label = isset($spec['label']) && is_string($spec['label']) && trim($spec['label']) !== ''
			? trim($spec['label'])
			: $defaultLabel;
		$icon = isset($spec['icon']) && is_string($spec['icon']) && trim($spec['icon']) !== ''
			? trim($spec['icon'])
			: match ($kind) {
				'image' => 'image',
				'video' => 'film',
				default => 'paperclip',
			};
		$maxFilesize = isset($spec['maxFilesize']) && is_numeric($spec['maxFilesize'])
			? max(0, (int) $spec['maxFilesize'])
			: 0;

		return [
			'key' => $key,
			'kind' => $kind,
			'isImage' => $kind === 'image',
			'isVideo' => $kind === 'video',
			'label' => $label,
			'icon' => $icon,
			'extensions' => $exts,
			'accept' => implode(',', array_map(static fn (string $e): string => '.' . $e, $exts)),
			'maxFilesize' => $maxFilesize,
		];
	}

	/**
	 * Normalize allowed target type list (migrating standalone `'anchor'` into `'url'`).
	 *
	 * @param list<string|int> $extraMediaKeys
	 * @return list<string>
	 */
	public static function normalizeTypeList(mixed $rawTypes, array $extraMediaKeys = []): array
	{
		if (is_string($rawTypes)) {
			$rawTypes = preg_split('/[\s,|]+/', trim($rawTypes), -1, PREG_SPLIT_NO_EMPTY) ?: [];
		}
		$out = [];
		if (is_array($rawTypes)) {
			foreach ($rawTypes as $t) {
				if (!is_string($t)) {
					continue;
				}
				$clean = strtolower(trim($t));
				if ($clean === 'anchor') {
					$clean = 'url';
				}
				if ($clean !== '' && preg_match('/^[a-z0-9_-]{1,32}$/', $clean) === 1 && !in_array($clean, $out, true)) {
					$out[] = $clean;
				}
			}
		}
		foreach ($extraMediaKeys as $mKey) {
			$cleanM = strtolower(trim((string) $mKey));
			if ($cleanM !== '' && !in_array($cleanM, $out, true)) {
				$out[] = $cleanM;
			}
		}

		return $out !== [] ? $out : self::DEFAULT_TYPES;
	}

	/**
	 * Normalize arbitrary raw link input into canonical associative storage structure.
	 *
	 * @return array{
	 *   type: string,
	 *   pageId: int,
	 *   resourceType: string,
	 *   resourceId: string,
	 *   url: string,
	 *   file: string,
	 *   query: string,
	 *   anchor: string,
	 *   label: string,
	 *   ariaLabel: string,
	 *   target: string,
	 *   rel: string,
	 *   labels?: array<string, string>,
	 *   ariaLabels?: array<string, string>,
	 *   alt?: string,
	 *   descriptions?: array<string, string>,
	 *   focus?: string,
	 *   tags?: string
	 * }
	 */
	public static function normalizeValue(mixed $value, string $defaultType = 'url'): array
	{
		$fallbackType = strtolower(trim($defaultType)) ?: 'url';
		if ($fallbackType === 'anchor') {
			$fallbackType = 'url';
		}

		$empty = [
			'type' => $fallbackType,
			'pageId' => 0,
			'resourceType' => '',
			'resourceId' => '',
			'url' => '',
			'file' => '',
			'query' => '',
			'anchor' => '',
			'label' => '',
			'ariaLabel' => '',
			'target' => '_self',
			'rel' => '',
		];

		if ($value instanceof \stdClass) {
			$value = get_object_vars($value);
		}
		if ($value instanceof Page) {
			$empty['type'] = 'page';
			$empty['pageId'] = $value->id > 0 ? (int) $value->id : 0;
			return $empty;
		}
		if ($value === null || $value === '' || $value === [] || $value === false) {
			return $empty;
		}

		if (is_string($value) || $value instanceof \Stringable) {
			$trimmed = trim((string) $value);
			if ($trimmed === '' || strlen($trimmed) > self::MAX_JSON_BYTES) {
				return $empty;
			}
			if (str_starts_with($trimmed, '{')) {
				$decoded = json_decode($trimmed, true, self::MAX_JSON_DEPTH);
				if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
					$value = $decoded;
				}
			}
			if (is_string($value) || $value instanceof \Stringable) {
				if (stripos($trimmed, 'mailto:') === 0) {
					$empty['type'] = 'email';
					$empty['url'] = trim(substr($trimmed, 7));
					return $empty;
				}
				if (stripos($trimmed, 'tel:') === 0) {
					$empty['type'] = 'tel';
					$empty['url'] = self::sanitizePhoneValue($trimmed);
					return $empty;
				}
				$empty['type'] = 'url';
				$empty['url'] = self::sanitizeHref($trimmed);
				return $empty;
			}
		}

		if (!is_array($value)) {
			return $empty;
		}

		$type = isset($value['type']) && is_string($value['type']) && trim($value['type']) !== ''
			? strtolower(trim($value['type']))
			: $fallbackType;
		$pageId = isset($value['pageId']) && is_numeric($value['pageId'])
			? max(0, (int) $value['pageId'])
			: 0;
		$resourceType = isset($value['resourceType']) && is_string($value['resourceType'])
			? trim($value['resourceType'])
			: '';
		$resourceId = isset($value['resourceId']) && is_scalar($value['resourceId'])
			? trim((string) $value['resourceId'])
			: '';
		$rawUrl = isset($value['url']) && is_scalar($value['url'])
			? trim((string) $value['url'])
			: '';
		$rawFile = isset($value['file']) && is_scalar($value['file']) ? trim((string) $value['file']) : '';
		$rawQuery = isset($value['query']) && is_scalar($value['query']) ? ltrim(trim((string) $value['query']), '?') : '';
		$rawAnchor = isset($value['anchor']) && is_scalar($value['anchor']) ? ltrim(trim((string) $value['anchor']), '#') : '';

		// Normalize standalone `type: anchor` into `type: url` with `#fragment`
		if ($type === 'anchor') {
			$frag = $rawAnchor !== '' ? $rawAnchor : ltrim($rawUrl, '#');
			$type = 'url';
			$rawUrl = $frag !== '' ? '#' . $frag : '';
			$rawAnchor = '';
		}

		if ($type === 'email') {
			$cleanUrl = trim((string) preg_replace('/^mailto:/i', '', $rawUrl));
		} elseif ($type === 'tel') {
			$cleanUrl = self::sanitizePhoneValue($rawUrl);
		} else {
			$cleanUrl = $rawUrl !== '' ? self::sanitizeHref($rawUrl) : '';
		}

		$cleanFile = $rawFile !== '' ? self::sanitizeHref($rawFile) : '';
		$label = isset($value['label']) && is_scalar($value['label']) ? trim((string) $value['label']) : '';
		$labels = self::normalizeLocalizedTextMap($value['labels'] ?? null, $label);
		if ($label === '' && isset($labels['default'])) {
			$label = $labels['default'];
		}
		$rawAriaLabel = $value['ariaLabel'] ?? null;
		$ariaLabel = is_scalar($rawAriaLabel) ? trim((string) $rawAriaLabel) : '';
		$rawAriaLabels = $value['ariaLabels'] ?? null;
		$ariaLabels = self::normalizeLocalizedTextMap($rawAriaLabels, $ariaLabel);
		if ($ariaLabel === '' && isset($ariaLabels['default'])) {
			$ariaLabel = $ariaLabels['default'];
		}
		$rawTarget = isset($value['target']) && is_string($value['target']) ? trim($value['target']) : '_self';
		$target = in_array($rawTarget, ['_self', '_blank'], true) ? $rawTarget : '_self';
		$rel = isset($value['rel']) && is_scalar($value['rel']) ? trim((string) $value['rel']) : '';

		$out = [
			'type' => $type,
			'pageId' => $pageId,
			'resourceType' => $resourceType,
			'resourceId' => $resourceId,
			'url' => $cleanUrl,
			'file' => $cleanFile,
			'query' => $rawQuery,
			'anchor' => $rawAnchor,
			'label' => $label,
			'ariaLabel' => $ariaLabel,
			'target' => $target,
			'rel' => $rel,
		];
		if ($labels !== []) {
			$out['labels'] = $labels;
		}
		if ($ariaLabels !== []) {
			$out['ariaLabels'] = $ariaLabels;
		}

		$hasMediaRef = $cleanFile !== '' || ($cleanUrl !== '' && in_array($type, ['image', 'video', 'file'], true));
		if ($hasMediaRef) {
			$alt = isset($value['alt']) && is_scalar($value['alt']) ? trim((string) $value['alt']) : '';
			$descriptions = [];
			if (isset($value['descriptions']) && is_array($value['descriptions'])) {
				foreach ($value['descriptions'] as $dKey => $dVal) {
					$cleanKey = trim((string) $dKey);
					if ($cleanKey !== '' && preg_match('/^[a-zA-Z0-9_-]{1,32}$/', $cleanKey) === 1 && is_scalar($dVal)) {
						$cleanText = trim((string) $dVal);
						if ($cleanText !== '') {
							$descriptions[$cleanKey] = $cleanText;
						}
					}
				}
			}
			if ($alt === '' && isset($descriptions['default'])) {
				$alt = $descriptions['default'];
			}
			if ($alt !== '') {
				$out['alt'] = $alt;
			}
			if ($descriptions !== []) {
				$out['descriptions'] = $descriptions;
			}
			$focusStr = self::normalizeFocusString($value['focus'] ?? null);
			if ($focusStr !== '') {
				$out['focus'] = $focusStr;
			}
			$tags = isset($value['tags']) && is_scalar($value['tags']) ? trim((string) $value['tags']) : '';
			if ($tags !== '') {
				$out['tags'] = $tags;
			}
		}

		return $out;
	}

	/**
	 * Normalize optional focal point (`"50 50 0"` or `{top, left, zoom}`) into a clean space-separated string, or `""` when default/empty.
	 */
	public static function normalizeFocusString(mixed $raw): string
	{
		$top = 50.0;
		$left = 50.0;
		$zoom = 0;
		if (is_string($raw)) {
			$trimmed = trim($raw);
			if ($trimmed === '') {
				return '';
			}
			$parts = preg_split('/\s+/', $trimmed) ?: [];
			if (isset($parts[0]) && is_numeric($parts[0])) {
				$top = (float) $parts[0];
			}
			if (isset($parts[1]) && is_numeric($parts[1])) {
				$left = (float) $parts[1];
			}
			if (isset($parts[2]) && is_numeric($parts[2])) {
				$zoom = (int) round((float) $parts[2]);
			}
		} elseif (is_array($raw)) {
			if (!isset($raw['top']) && !isset($raw['left']) && !isset($raw['zoom'])) {
				return '';
			}
			$top = isset($raw['top']) && is_numeric($raw['top']) ? (float) $raw['top'] : 50.0;
			$left = isset($raw['left']) && is_numeric($raw['left']) ? (float) $raw['left'] : 50.0;
			$zoom = isset($raw['zoom']) && is_numeric($raw['zoom']) ? (int) round((float) $raw['zoom']) : 0;
		} else {
			return '';
		}
		$top = max(0.0, min(100.0, round($top, 1)));
		$left = max(0.0, min(100.0, round($left, 1)));
		$zoom = max(0, min(50, $zoom));
		if ($top === 50.0 && $left === 50.0 && $zoom === 0) {
			return '';
		}
		$topStr = rtrim(rtrim(number_format($top, 1, '.', ''), '0'), '.');
		$leftStr = rtrim(rtrim(number_format($left, 1, '.', ''), '0'), '.');

		return "{$topStr} {$leftStr} {$zoom}";
	}

	/**
	 * Determine whether a link payload has no active destination target.
	 */
	public static function isEmptyValue(mixed $value): bool
	{
		if ($value === null || $value === '' || $value === [] || $value === false) {
			return true;
		}
		$norm = self::normalizeValue($value);

		return match ($norm['type']) {
			'page' => $norm['pageId'] <= 0,
			'url', 'email', 'tel' => $norm['url'] === '' && ($norm['type'] !== 'url' || $norm['anchor'] === ''),
			default => $norm['file'] === '' && $norm['url'] === '' && $norm['pageId'] <= 0 && $norm['resourceId'] === '',
		};
	}

	/**
	 * Normalize a localized string map keyed by `'default'` and/or ProcessWire language IDs/names.
	 * Returns `[]` when no non-default language entry is present so single-language payloads stay compact.
	 *
	 * @return array<string, string>
	 */
	private static function normalizeLocalizedTextMap(mixed $rawMap, string $defaultText): array
	{
		if ($rawMap instanceof \stdClass) {
			$rawMap = get_object_vars($rawMap);
		}
		$clean = [];
		$hasNonDefault = false;
		if (is_array($rawMap)) {
			foreach ($rawMap as $rawKey => $rawVal) {
				$cleanKey = trim((string) $rawKey);
				if ($cleanKey === '' || preg_match('/^[a-zA-Z0-9_-]{1,32}$/', $cleanKey) !== 1 || !is_scalar($rawVal)) {
					continue;
				}
				$trimmedVal = trim((string) $rawVal);
				if ($trimmedVal === '') {
					continue;
				}
				$clean[$cleanKey] = $trimmedVal;
				if ($cleanKey !== 'default') {
					$hasNonDefault = true;
				}
			}
		}
		if ($defaultText !== '') {
			$clean['default'] = $defaultText;
		}
		if (!$hasNonDefault) {
			return [];
		}

		return $clean;
	}

	/**
	 * Resolve a localized link text value for a target Language, falling back to the default string.
	 */
	private static function resolveLocalizedText(string $defaultText, mixed $rawMap, ?Language $language): string
	{
		$map = is_array($rawMap) ? $rawMap : [];
		if ($language instanceof Language && !$language->isDefault()) {
			$idKey = (string) $language->id;
			if (isset($map[$idKey]) && is_scalar($map[$idKey]) && trim((string) $map[$idKey]) !== '') {
				return trim((string) $map[$idKey]);
			}
			$nameKey = (string) $language->name;
			if (isset($map[$nameKey]) && is_scalar($map[$nameKey]) && trim((string) $map[$nameKey]) !== '') {
				return trim((string) $map[$nameKey]);
			}
		}
		if ($defaultText !== '') {
			return $defaultText;
		}

		return isset($map['default']) && is_scalar($map['default']) ? trim((string) $map['default']) : '';
	}

	/**
	 * Normalize link sub-field enablement flags from canonical camelCase config arrays.
	 *
	 * @param array<string, mixed> $config
	 * @return array{
	 *   enableLabel: bool,
	 *   enableAriaLabel: bool,
	 *   enableTarget: bool,
	 *   enableRel: bool,
	 *   enableAnchor: bool,
	 *   enableQuery: bool
	 * }
	 */
	public static function normalizeFeatureFlags(array $config): array
	{
		return [
			'enableLabel' => (bool) ($config['enableLabel'] ?? true),
			'enableAriaLabel' => (bool) ($config['enableAriaLabel'] ?? true),
			'enableTarget' => (bool) ($config['enableTarget'] ?? true),
			'enableRel' => (bool) ($config['enableRel'] ?? true),
			'enableAnchor' => (bool) ($config['enableAnchor'] ?? true),
			'enableQuery' => (bool) ($config['enableQuery'] ?? true),
		];
	}

	/**
	 * Strip disabled link sub-fields according to normalized `enable*` feature flags.
	 *
	 * @param array<string, mixed> $norm
	 * @param array<string, mixed> $config
	 * @return array<string, mixed>
	 */
	public static function applyConfigFlags(array $norm, array $config): array
	{
		$flags = self::normalizeFeatureFlags($config);
		if (!$flags['enableLabel']) {
			$norm['label'] = '';
			unset($norm['labels']);
		}
		if (!$flags['enableAriaLabel']) {
			$norm['ariaLabel'] = '';
			unset($norm['ariaLabels']);
		}
		if (!$flags['enableTarget']) {
			$norm['target'] = '_self';
		}
		if (!$flags['enableRel']) {
			$norm['rel'] = '';
		}
		if (!$flags['enableAnchor']) {
			$norm['anchor'] = '';
		}
		if (!$flags['enableQuery']) {
			$norm['query'] = '';
		}

		return $norm;
	}

	/**
	 * Encode normalized link payload as canonical JSON object string (`""` when empty).
	 */
	public static function encodeJsonObject(mixed $value, string $defaultType = 'url'): string
	{
		if (self::isEmptyValue($value)) {
			return '';
		}
		$norm = self::normalizeValue($value, $defaultType);
		$encoded = json_encode($norm, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

		return is_string($encoded) ? $encoded : '';
	}

	/**
	 * Resolve a stored Page/standalone link payload into a frontend-ready descriptor.
	 *
	 * @return array<string, mixed>
	 */
	public static function resolveValue(
		mixed $value,
		?Page $ownerPage = null,
		?Field $field = null,
		?Language $language = null,
	): array {
		$defaultType = $field instanceof Field ? ((string) ($field->get('defaultType') ?: 'page')) : 'url';
		$norm = self::normalizeValue($value, $defaultType);
		if ($field instanceof Field) {
			$norm = self::applyConfigFlags($norm, [
				'enableLabel' => $field->get('enableLabel'),
				'enableAriaLabel' => $field->get('enableAriaLabel'),
				'enableTarget' => $field->get('enableTarget'),
				'enableRel' => $field->get('enableRel'),
				'enableAnchor' => $field->get('enableAnchor'),
				'enableQuery' => $field->get('enableQuery'),
			]);
		}
		$type = $norm['type'];

		$href = '';
		$fallbackLabel = '';
		$isExternal = false;
		$isDownload = false;
		$isMedia = false;
		$mediaKind = '';
		$width = 0;
		$height = 0;
		$filesize = 0;
		$ext = '';

		$profiles = $field instanceof Field
			? self::resolveFieldMediaProfiles($field)
			: self::normalizeMediaProfiles([], [$type]);
		$wireContext = $ownerPage?->wire() ?? $field?->wire() ?? ProcessWire::getCurrentInstance();

		if ($type === 'page') {
			if ($norm['pageId'] > 0 && $wireContext instanceof ProcessWire) {
				$targetPage = $wireContext->pages->get($norm['pageId']);
				if (
					$targetPage instanceof Page
					&& !$targetPage instanceof NullPage
					&& $targetPage->id > 0
					&& !$targetPage->isTrash()
					&& !$targetPage->isUnpublished()
					&& $targetPage->viewable(false)
				) {
					$rawPageUrl = ($language instanceof Language && ($targetPage->hasHook('localUrl()') || method_exists($targetPage, 'localUrl')))
						? (string) $targetPage->localUrl($language)
						: (string) $targetPage->url;
					if ($rawPageUrl === '' && (!$language instanceof Language || $language->isDefault()) && (string) $targetPage->url !== '') {
						$rawPageUrl = (string) $targetPage->url;
					}
					$href = self::appendQueryAndAnchor(self::sanitizeHref($rawPageUrl), $norm['query'], $norm['anchor']);
					$localizedTitle = $language instanceof Language
						? trim((string) $targetPage->getLanguageValue($language, 'title'))
						: '';
					$fallbackLabel = $localizedTitle !== ''
						? $localizedTitle
						: trim((string) ($targetPage->title ?: $targetPage->name));
				}
			}
		} elseif ($type === 'email') {
			$cleanEmail = (string) preg_replace('/[\x00-\x20\x7F]+/', '', $norm['url']);
			if ($cleanEmail !== '' && str_contains($cleanEmail, '@')) {
				$cleanMailQuery = (string) preg_replace('/[\x00-\x20\x7F]+/', '', ltrim($norm['query'], '?&'));
				$href = 'mailto:' . $cleanEmail . ($cleanMailQuery !== '' ? '?' . $cleanMailQuery : '');
				$fallbackLabel = $cleanEmail;
			}
		} elseif ($type === 'tel') {
			$dial = self::sanitizePhoneValue($norm['url']);
			if ($dial !== '') {
				$href = 'tel:' . $dial;
				$fallbackLabel = $dial;
			}
		} elseif (isset($profiles[$type]) || ($norm['file'] !== '' && !in_array($type, ['url', 'page', 'email', 'tel'], true) && $norm['resourceId'] === '')) {
			$isMedia = true;
			$profile = $profiles[$type] ?? self::buildMediaProfileEntry($type, []);
			$mediaKind = $profile['kind'];
			$isDownload = $mediaKind === 'file';
			$rawFile = $norm['file'] !== '' ? $norm['file'] : $norm['url'];
			$bn = basename($rawFile);
			if ($ownerPage instanceof Page && $ownerPage->id > 0 && $field instanceof Field && $bn !== '' && !str_contains($rawFile, '/')) {
				$diskDir = PageLinkMediaHostAdapter::directoryPathFor($ownerPage, $field->name);
				$urlDir = PageLinkMediaHostAdapter::directoryUrlFor($ownerPage, $field->name);
				$diskFile = $diskDir . $bn;
				$realDir = $diskDir !== '' && !is_link(rtrim($diskDir, '/\\')) ? realpath($diskDir) : false;
				$realFile = is_string($realDir) && !is_link($diskFile) && is_file($diskFile) ? realpath($diskFile) : false;
				if (
					is_string($realDir)
					&& is_string($realFile)
					&& str_starts_with($realFile, rtrim($realDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)
				) {
					$href = self::appendQueryAndAnchor($urlDir . rawurlencode($bn), $norm['query'], $norm['anchor']);
					$filesize = (int) (@filesize($realFile) ?: 0);
					$ext = strtolower(pathinfo($bn, PATHINFO_EXTENSION));
					if ($mediaKind === 'image' && $ext !== 'svg') {
						$dims = @getimagesize($realFile);
						if (is_array($dims)) {
							$width = (int) $dims[0];
							$height = (int) $dims[1];
						}
					}
					$fallbackLabel = $bn;
				}
			}
			if ($href === '') {
				$cleanMediaUrl = self::sanitizeHref($rawFile);
				if ($cleanMediaUrl !== '') {
					$href = self::appendQueryAndAnchor($cleanMediaUrl, $norm['query'], $norm['anchor']);
					$pathPart = (string) parse_url($cleanMediaUrl, PHP_URL_PATH);
					$fallbackLabel = $pathPart !== '' ? basename($pathPart) : $cleanMediaUrl;
					$ext = strtolower(pathinfo($fallbackLabel, PATHINFO_EXTENSION));
				}
			}
		} elseif ($type !== 'url' && $wireContext instanceof ProcessWire) {
			$reactInst = $wireContext->wire('react');
			if ($reactInst instanceof React) {
				$customResolved = $reactInst->resolveCustomLink($type, $norm, [
					'language' => $language,
					'ownerPage' => $ownerPage,
					'field' => $field,
					'fallbackToTargetLabel' => true,
				]);
				if (is_array($customResolved)) {
					$href = self::sanitizeHref((string) ($customResolved['href'] ?? ''));
					$fallbackLabel = (string) ($customResolved['label'] ?? '');
					$isExternal = !empty($customResolved['isExternal']);
				}
			}
		} else {
			$cleanUrl = self::sanitizeHref($norm['url']);
			if ($cleanUrl === '' && $norm['anchor'] !== '') {
				$cleanUrl = '#' . preg_replace('/[^a-zA-Z0-9_\-.:]/', '', $norm['anchor']);
			}
			if ($cleanUrl !== '') {
				$href = str_starts_with($cleanUrl, '#')
					? $cleanUrl
					: self::appendQueryAndAnchor($cleanUrl, $norm['query'], $norm['anchor']);
				$httpHost = $wireContext instanceof ProcessWire ? (string) $wireContext->config->httpHost : '';
				if (preg_match('#^https?://#i', $href) === 1) {
					$parsedHost = strtolower((string) parse_url($href, PHP_URL_HOST));
					$cleanHost = strtolower((string) preg_replace('/:\d+$/', '', trim($httpHost)));
					$isExternal = $parsedHost === '' || $cleanHost === '' || $parsedHost !== $cleanHost;
				}
				$fallbackLabel = $href;
			}
		}

		$target = $norm['target'] === '_blank' ? '_blank' : '_self';
		$relTokens = [];
		if ($norm['rel'] !== '') {
			foreach (preg_split('/\s+/', $norm['rel'], -1, PREG_SPLIT_NO_EMPTY) ?: [] as $tok) {
				$cleanTok = strtolower(trim($tok));
				if ($cleanTok !== '' && !in_array($cleanTok, $relTokens, true)) {
					$relTokens[] = $cleanTok;
				}
			}
		}
		if ($target === '_blank') {
			foreach (['noopener', 'noreferrer'] as $secTok) {
				if (!in_array($secTok, $relTokens, true)) {
					$relTokens[] = $secTok;
				}
			}
		}

		$effectiveLanguage = $language instanceof Language
			? $language
			: ($wireContext instanceof ProcessWire && $wireContext->user->language instanceof Language ? $wireContext->user->language : null);
		$resolvedCustomLabel = self::resolveLocalizedText((string) $norm['label'], $norm['labels'] ?? [], $effectiveLanguage);
		$resolvedAriaLabel = self::resolveLocalizedText((string) $norm['ariaLabel'], $norm['ariaLabels'] ?? [], $effectiveLanguage);

		return [
			'type' => $type,
			'href' => $href,
			'url' => $href,
			'file' => $norm['file'],
			'label' => $resolvedCustomLabel !== '' ? $resolvedCustomLabel : $fallbackLabel,
			'customLabel' => $resolvedCustomLabel,
			'ariaLabel' => $resolvedAriaLabel,
			'target' => $target,
			'rel' => implode(' ', $relTokens),
			'query' => $norm['query'],
			'anchor' => $norm['anchor'],
			'isExternal' => $isExternal,
			'isDownload' => $isDownload,
			'isMedia' => $isMedia,
			'mediaKind' => $mediaKind,
			'width' => $width,
			'height' => $height,
			'filesize' => $filesize,
			'ext' => $ext,
			'pageId' => $norm['pageId'],
			'resourceType' => $norm['resourceType'],
			'resourceId' => $norm['resourceId'],
		];
	}

	private static function appendQueryAndAnchor(string $baseHref, string $query, string $anchor): string
	{
		if ($baseHref === '') {
			return '';
		}
		$existingAnchor = '';
		$baseWithoutHash = $baseHref;
		if (str_contains($baseHref, '#')) {
			[$baseWithoutHash, $existingAnchor] = explode('#', $baseHref, 2);
		}
		$cleanQuery = ltrim(trim($query), '?&');
		if ($cleanQuery !== '') {
			$cleanQuery = (string) preg_replace('/[\x00-\x20\x7F]+/', '', $cleanQuery);
			if ($cleanQuery !== '') {
				$baseWithoutHash .= (str_contains($baseWithoutHash, '?') ? '&' : '?') . $cleanQuery;
			}
		}
		$cleanAnchor = (string) preg_replace('/[^a-zA-Z0-9_\-.:]/', '', ltrim(trim($anchor), '#'));
		$finalAnchor = $cleanAnchor !== '' ? $cleanAnchor : $existingAnchor;

		return $finalAnchor !== '' ? $baseWithoutHash . '#' . $finalAnchor : $baseWithoutHash;
	}

	/**
	 * Render entity-escaped HTML summary badge for Admin Lister / `markupValue()`.
	 */
	public static function renderLinkMarkup(
		mixed $value,
		?Page $page = null,
		?Field $field = null,
		string $property = '',
	): string {
		if (self::isEmptyValue($value)) {
			return '<span class="pw-kv-empty">&mdash;</span>';
		}
		$resolved = self::resolveValue($value, $page, $field);
		if ($property !== '') {
			$propVal = $resolved[$property] ?? '';
			$strVal = is_bool($propVal) ? ($propVal ? '1' : '0') : (string) $propVal;

			return htmlspecialchars($strVal, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
		}
		$safeType = htmlspecialchars(strtoupper((string) $resolved['type']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
		$display = trim((string) ($resolved['label'] !== '' ? $resolved['label'] : $resolved['href']));
		$safeDisplay = htmlspecialchars($display !== '' ? $display : '—', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

		return "<span class=\"pw-kv-summary\"><strong>{$safeType}:</strong> {$safeDisplay}</span>";
	}

	protected function isBoundToTextFieldtype(): bool
	{
		$ft = $this->getSetting('hasFieldtype');
		if ($ft instanceof FieldtypeText) {
			return true;
		}
		$field = $this->getSetting('hasField');

		return $field instanceof Field && $field->type instanceof FieldtypeText;
	}

	/**
	 * @return array<string, mixed>
	 */
	public function getNormalizedLink(): array
	{
		$defType = (string) ($this->getSetting('defaultType') ?: 'page');

		return self::normalizeValue($this->attributes['value'] ?? [], $defType);
	}

	/**
	 * @param string|array<string, mixed> $key
	 * @param mixed $value
	 */
	public function setAttribute($key, $value): self
	{
		if ($key === 'value') {
			$defType = (string) ($this->getSetting('defaultType') ?: 'page');
			$value = self::normalizeValue($value, $defType);
		}

		return parent::setAttribute($key, $value);
	}

	/**
	 * @param string $key
	 */
	public function getAttribute($key): mixed
	{
		if ($key === 'value') {
			$defType = (string) ($this->getSetting('defaultType') ?: 'page');
			if ($this->isBoundToTextFieldtype()) {
				return self::encodeJsonObject($this->attributes['value'] ?? [], $defType);
			}

			return self::normalizeValue($this->attributes['value'] ?? [], $defType);
		}

		return parent::getAttribute($key);
	}

	public function isEmpty(): bool
	{
		return self::isEmptyValue($this->getNormalizedLink());
	}

	protected function serializeValueForProps(mixed $value): mixed
	{
		return $this->getNormalizedLink();
	}

	protected function serializeValueForHiddenInput(mixed $value): string
	{
		$defType = (string) ($this->getSetting('defaultType') ?: 'page');

		return self::encodeJsonObject($this->getNormalizedLink(), $defType);
	}

	/**
	 * @return array<string, mixed>
	 */
	public function buildRawLinkConfig(): array
	{
		$existing = $this->getSetting('linkConfig');
		if (is_array($existing) && $existing !== []) {
			return array_merge($existing, self::normalizeFeatureFlags($existing));
		}

		$rawMedia = $this->getSetting('mediaProfiles') ?? $this->getSetting('media') ?? '';
		$baseTypes = self::normalizeTypeList($this->getSetting('linkTypes') ?? self::DEFAULT_TYPES);
		$profiles = self::normalizeMediaProfiles($rawMedia, $baseTypes);
		$types = self::normalizeTypeList($baseTypes, array_keys($profiles));
		$defaultType = strtolower(trim((string) ($this->getSetting('defaultType') ?: $types[0])));
		if (!in_array($defaultType, $types, true)) {
			$defaultType = $types[0];
		}

		$flags = self::normalizeFeatureFlags([
			'enableLabel' => $this->getSetting('enableLabel'),
			'enableAriaLabel' => $this->getSetting('enableAriaLabel'),
			'enableTarget' => $this->getSetting('enableTarget'),
			'enableRel' => $this->getSetting('enableRel'),
			'enableAnchor' => $this->getSetting('enableAnchor'),
			'enableQuery' => $this->getSetting('enableQuery'),
		]);

		return array_merge(
			[
				'types' => $types,
				'defaultType' => $defaultType,
				'media' => $profiles,
			],
			$flags,
			[
				'selector' => trim((string) ($this->getSetting('selector') ?? '')),
				'blueprintType' => trim((string) ($this->getSetting('blueprintType') ?? '')),
			],
		);
	}

	/**
	 * @return array<string, mixed>
	 */
	public function inertiaWithData(): array
	{
		$rawName = $this->stringAttr('name');
		$rawId = $this->stringAttr('id');
		$inputName = $rawName !== '' ? $rawName : ($rawId !== '' ? $rawId : 'pw_link');
		$inputId = $rawId !== '' ? $rawId : ('Inputfield_' . $inputName);
		$serializer = new FormSchemaSerializer();
		$this->wire($serializer);
		$serialized = $serializer->serializeInputfieldNode($this);

		return [
			'id' => $inputId,
			'name' => $inputName,
			'value' => $this->getNormalizedLink(),
			'linkConfig' => $serialized['linkConfig'] ?? $this->buildRawLinkConfig(),
			'readOnly' => $this->isEffectivelyReadOnly(),
		];
	}

	public function ___renderValue(): string
	{
		$payload = $this->inertia()->resolver->resolveValue($this->toInertiaProp());
		$data = is_array($payload) ? $payload : $this->toInertiaProp();
		$data['readOnly'] = true;
		if (isset($data['props']) && is_array($data['props'])) {
			$data['props']['readOnly'] = true;
		}

		$component = is_string($data['component'] ?? null) ? $data['component'] : $this->inertiaComponent();
		$hasPage = $this->getSetting('hasPage');
		$hasField = $this->getSetting('hasField');
		$fallbackHtml = self::renderLinkMarkup(
			$this->getNormalizedLink(),
			$hasPage instanceof Page ? $hasPage : null,
			$hasField instanceof Field ? $hasField : null,
		);

		return IslandMarkup::render($component, $data, [
			'class' => 'pw-inertia-inputfield-island',
			'data-readonly' => 'true',
		], $fallbackHtml);
	}

	public function ___processInput(WireInputData $input): self
	{
		if ($this->isInputProcessingLocked()) {
			return $this;
		}

		$name = $this->stringAttr('name');
		if ($name === '' || $input[$name] === null) {
			return $this;
		}

		$rawPosted = $input[$name];
		$cfg = $this->buildRawLinkConfig();
		$allowedTypes = isset($cfg['types']) && is_array($cfg['types']) && $cfg['types'] !== []
			? $cfg['types']
			: self::DEFAULT_TYPES;
		$defaultType = (string) ($cfg['defaultType'] ?? $allowedTypes[0]);

		$hasValidationErrors = false;

		// Check raw phone format BEFORE stripping invalid chars so user receives clear validation feedback if tampered
		$rawDecoded = is_string($rawPosted) && strlen($rawPosted) <= self::MAX_JSON_BYTES && str_starts_with(trim($rawPosted), '{')
			? json_decode(trim($rawPosted), true, self::MAX_JSON_DEPTH)
			: (is_array($rawPosted) ? $rawPosted : null);
		if (is_array($rawDecoded) && strtolower(trim((string) ($rawDecoded['type'] ?? ''))) === 'tel') {
			$rawPhoneCandidate = trim((string) ($rawDecoded['url'] ?? ''));
			if ($rawPhoneCandidate !== '' && !self::isValidPhoneInput($rawPhoneCandidate)) {
				$this->error($this->_('Phone number may only contain digits and a leading + sign.'));
				$hasValidationErrors = true;
			}
		}

		$normalized = self::applyConfigFlags(self::normalizeValue($rawPosted, $defaultType), $cfg);
		$isEmpty = self::isEmptyValue($normalized);

		if (!$isEmpty && !in_array($normalized['type'], $allowedTypes, true)) {
			$this->error(sprintf(
				$this->_('Link type "%s" is not permitted on this field.'),
				$normalized['type']
			));
			$hasValidationErrors = true;
		}

		if (!$isEmpty && $normalized['type'] === 'email' && filter_var($normalized['url'], FILTER_VALIDATE_EMAIL) === false) {
			$this->error($this->_('Please enter a valid email address.'));
			$hasValidationErrors = true;
		}

		if ((bool) $this->getSetting('required') && $isEmpty) {
			$this->error($this->_('A destination link is required.'));
			$hasValidationErrors = true;
		}

		$previous = $this->getNormalizedLink();
		if ($hasValidationErrors) {
			$this->setAttribute('value', $previous);

			return $this;
		}

		if ($normalized !== $previous) {
			if (!$this->trackChanges()) {
				$this->setTrackChanges(true);
			}
			$this->setAttribute('value', $normalized);
			$this->trackChange('value', $previous, $normalized);
		}

		return $this;
	}

	public function ___getConfigInputfields(): InputfieldWrapper
	{
		$inputfields = parent::___getConfigInputfields();
		$modules = $this->wire()->modules;

		$registeredResolverTypes = React::instance($this)->linkResolverTypes();

		/** @var InputfieldAsmSelect|InputfieldCheckboxes|null $typesField */
		$typesField = $modules->isInstalled('InputfieldAsmSelect')
			? $modules->get('InputfieldAsmSelect')
			: $modules->get('InputfieldCheckboxes');
		if ($typesField) {
			$typesField->attr('name', 'linkTypes');
			$typesField->label = $this->_('Allowed Target Types');
			$typesField->addOption('page', $this->_('Page'));
			$typesField->addOption('url', $this->_('URL & Anchor (#)'));
			$typesField->addOption('tel', $this->_('Phone (+ & digits)'));
			$typesField->addOption('email', $this->_('Email'));
			$typesField->addOption('file', $this->_('Media: File'));
			$typesField->addOption('image', $this->_('Media: Image'));
			$typesField->addOption('video', $this->_('Media: Video'));
			$currentTypes = self::normalizeTypeList($this->getSetting('linkTypes') ?? self::DEFAULT_TYPES);
			foreach (array_merge($registeredResolverTypes, $currentTypes) as $ct) {
				if ($ct !== '' && !isset($typesField->getOptions()[$ct])) {
					$typesField->addOption($ct, ucfirst($ct));
				}
			}
			$typesField->val($currentTypes);
			$typesField->columnWidth = 65;
			$inputfields->add($typesField);
		}

		/** @var InputfieldSelect|null $defTypeField */
		$defTypeField = $modules->get('InputfieldSelect');
		if ($defTypeField) {
			$defTypeField->attr('name', 'defaultType');
			$defTypeField->label = $this->_('Default Target Type');
			$defTypeField->addOption('page', $this->_('Page'));
			$defTypeField->addOption('url', $this->_('URL & Anchor (#)'));
			$defTypeField->addOption('tel', $this->_('Phone (+ & digits)'));
			$defTypeField->addOption('email', $this->_('Email'));
			$defTypeField->addOption('file', $this->_('Media: File'));
			$defTypeField->addOption('image', $this->_('Media: Image'));
			$defTypeField->addOption('video', $this->_('Media: Video'));
			$currentDefaultType = strtolower(trim((string) ($this->getSetting('defaultType') ?: 'page')));
			foreach (array_merge($registeredResolverTypes, self::normalizeTypeList($this->getSetting('linkTypes') ?? self::DEFAULT_TYPES)) as $ct) {
				if ($ct !== '' && !isset($defTypeField->getOptions()[$ct])) {
					$defTypeField->addOption($ct, ucfirst($ct));
				}
			}
			if ($currentDefaultType !== '' && !isset($defTypeField->getOptions()[$currentDefaultType])) {
				$defTypeField->addOption($currentDefaultType, ucfirst($currentDefaultType));
			}
			$defTypeField->val($currentDefaultType !== '' ? $currentDefaultType : 'page');
			$defTypeField->columnWidth = 35;
			$inputfields->add($defTypeField);
		}

		/** @var InputfieldTextarea|null $mediaField */
		$mediaField = $modules->get('InputfieldTextarea');
		if ($mediaField) {
			$mediaField->attr('name', 'mediaProfiles');
			$mediaField->label = $this->_('Media Upload Profiles');
			$mediaField->description = $this->_('Optional per-profile allowed file extensions (one per line as `profile: ext1 ext2` or JSON object, e.g. `image: jpg png webp`, `video: mp4 webm`, `file: pdf zip`).');
			$rawMp = $this->getSetting('mediaProfiles');
			$mediaField->val(is_array($rawMp) ? (string) json_encode($rawMp, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) : (string) $rawMp);
			$mediaField->set('rows', 4);
			$inputfields->add($mediaField);
		}

		$flagInputs = [
			'enableLabel' => [$this->_('Enable Link Label'), 50],
			'enableAriaLabel' => [$this->_('Enable ARIA Label'), 50],
			'enableTarget' => [$this->_('Enable Open Target'), 25],
			'enableRel' => [$this->_('Enable Rel Attribute'), 25],
			'enableAnchor' => [$this->_('Enable Anchor (#)'), 25],
			'enableQuery' => [$this->_('Enable Query (?)'), 25],
		];
		foreach ($flagInputs as $flagName => [$flagLabel, $flagWidth]) {
			/** @var InputfieldCheckbox|null $flagField */
			$flagField = $modules->get('InputfieldCheckbox');
			if ($flagField) {
				$flagField->attr('name', $flagName);
				$flagField->label = $flagLabel;
				$flagField->attr('checked', (bool) ($this->getSetting($flagName) ?? true) ? 'checked' : '');
				$flagField->columnWidth = $flagWidth;
				$inputfields->add($flagField);
			}
		}

		/** @var InputfieldText|null $selField */
		$selField = $modules->get('InputfieldText');
		if ($selField) {
			$selField->attr('name', 'selector');
			$selField->label = $this->_('Page Target Selector');
			$selField->val((string) ($this->getSetting('selector') ?? ''));
			$selField->columnWidth = 50;
			$inputfields->add($selField);
		}

		/** @var InputfieldText|null $bpField */
		$bpField = $modules->get('InputfieldText');
		if ($bpField) {
			$bpField->attr('name', 'blueprintType');
			$bpField->label = $this->_('Target Resource Scope');
			$bpField->val((string) ($this->getSetting('blueprintType') ?? ''));
			$bpField->columnWidth = 50;
			$inputfields->add($bpField);
		}

		return $inputfields;
	}

	/**
	 * @param Field $field
	 * @return array<int, string>
	 */
	public function ___getConfigAllowContext($field): array
	{
		return array_merge(parent::___getConfigAllowContext($field), [
			'linkTypes',
			'defaultType',
			'mediaProfiles',
			'enableLabel',
			'enableAriaLabel',
			'enableTarget',
			'enableRel',
			'enableAnchor',
			'enableQuery',
			'selector',
			'blueprintType',
		]);
	}
}
