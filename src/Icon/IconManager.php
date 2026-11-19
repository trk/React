<?php

declare(strict_types=1);

namespace Totoglu\React\Icon;

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\Page;
use ProcessWire\Template;
use ProcessWire\Wire;

/**
 * IconManager
 *
 * Centralized vector icon registry, value normalizer, paginated search/hydration engine,
 * safe inline `<svg>` / badge renderer, and ProcessWire Admin CSS `mask-image` stylesheet generator.
 *
 * @phpstan-type SvgTuple array{0: string, 1: array<string, string>}
 * @phpstan-type CatalogEntry array{
 *   name: string,
 *   label: string,
 *   category: string,
 *   hasFilled: bool,
 *   outline: list<SvgTuple>,
 *   filled: list<SvgTuple>|null
 * }
 */
class IconManager extends Wire
{
	public const string ADMIN_PREFIX = 'lucide--';
	public const string ADMIN_SAFE_REPLACEMENT = 'lucreplaced-';
	public const int MAX_JSON_BYTES = 4096;
	public const int MAX_JSON_DEPTH = 8;

	/**
	 * Allowed child SVG primitives emitted by the vector icon catalog.
	 *
	 * @var list<string>
	 */
	private const array ALLOWED_SVG_TAGS = [
		'path',
		'rect',
		'circle',
		'ellipse',
		'line',
		'polyline',
		'polygon',
	];

	/**
	 * Allowed badge radius tokens.
	 *
	 * @var list<string>
	 */
	public const array VALID_RADII = [
		'none',
		'sm',
		'md',
		'lg',
		'full',
	];

	/**
	 * Special brand/acronym display casing rules.
	 *
	 * @var array<string, string>
	 */
	private const array SPECIAL_BRAND_LABELS = [
		'whatsapp' => 'WhatsApp',
		'youtube' => 'YouTube',
		'tiktok' => 'TikTok',
		'linkedin' => 'LinkedIn',
		'github' => 'GitHub',
		'gitlab' => 'GitLab',
		'javascript' => 'JavaScript',
		'typescript' => 'TypeScript',
		'html5' => 'HTML5',
		'css3' => 'CSS3',
		'paypal' => 'PayPal',
		'openai' => 'OpenAI',
		'ios' => 'iOS',
		'macos' => 'macOS',
	];

	/**
	 * Static in-memory catalog cache loaded once per PHP worker from `dist/vector-icons.json`.
	 *
	 * @var array{
	 *   version: string,
	 *   outlineCount: int,
	 *   filledCount: int,
	 *   totalVariants: int,
	 *   names: list<string>,
	 *   outline: array<string, list<SvgTuple>>,
	 *   filled: array<string, list<SvgTuple>>,
	 *   meta: array<string, array{0: string, 1: string}>,
	 *   categories: list<array{id: string, label: string, count: int}>,
	 *   popular: list<string>,
	 *   aliases: array<string, string>
	 * }|null
	 */
	private static ?array $catalogCache = null;

	/**
	 * Static registry of Admin UI icons declared by modules (`getModuleInfo`, `executeNavJSON`, `Inputfield` headers).
	 *
	 * @var array<string, true>
	 */
	private static array $registeredAdminIcons = [];

	private bool $adminCssVerified = false;

	/**
	 * Register canonical or `lucide--*` icon identifiers so `LucideIcons.css` includes `mask-image` rules for them.
	 *
	 * @param list<string> $icons
	 */
	public static function registerAdminIcons(array $icons): void
	{
		foreach ($icons as $raw) {
			if (is_string($raw) && trim($raw) !== '') {
				self::$registeredAdminIcons[trim($raw)] = true;
			}
		}
	}

	/**
	 * Compute a deterministic hash of `self::$registeredAdminIcons` for fast O(1) `LucideIcons.css` freshness checks.
	 */
	private static function registeredIconsSignature(): string
	{
		if (self::$registeredAdminIcons === []) {
			return 'none';
		}
		$keys = array_keys(self::$registeredAdminIcons);
		sort($keys);

		return sha1(implode("\n", $keys));
	}

	/**
	 * Normalize a single icon's `[tag, attrs]` tuple list lazily on demand.
	 *
	 * @return list<SvgTuple>
	 */
	private static function sanitizeTupleList(mixed $nodes): array
	{
		if (!is_array($nodes)) {
			return [];
		}
		$tupleList = [];
		foreach ($nodes as $tuple) {
			if (!is_array($tuple) || !isset($tuple[0], $tuple[1]) || !is_string($tuple[0]) || !is_array($tuple[1])) {
				continue;
			}
			$attrs = [];
			foreach ($tuple[1] as $attrK => $attrV) {
				if (is_string($attrK) && is_scalar($attrV)) {
					$attrs[$attrK] = (string) $attrV;
				}
			}
			$tupleList[] = [$tuple[0], $attrs];
		}

		return $tupleList;
	}

	/**
	 * Load and cache `dist/vector-icons.json`.
	 *
	 * @return array{
	 *   version: string,
	 *   outlineCount: int,
	 *   filledCount: int,
	 *   totalVariants: int,
	 *   names: list<string>,
	 *   outline: array<string, list<SvgTuple>>,
	 *   filled: array<string, list<SvgTuple>>,
	 *   meta: array<string, array{0: string, 1: string}>,
	 *   categories: list<array{id: string, label: string, count: int}>,
	 *   popular: list<string>,
	 *   aliases: array<string, string>
	 * }
	 */
	public static function loadCatalog(): array
	{
		if (self::$catalogCache !== null) {
			return self::$catalogCache;
		}

		$empty = [
			'version' => '0.0.0',
			'outlineCount' => 0,
			'filledCount' => 0,
			'totalVariants' => 0,
			'names' => [],
			'outline' => [],
			'filled' => [],
			'meta' => [],
			'categories' => [],
			'popular' => [],
			'aliases' => [],
		];

		$jsonPath = dirname(__DIR__, 2) . '/dist/vector-icons.json';
		if (!is_file($jsonPath)) {
			self::$catalogCache = $empty;
			return self::$catalogCache;
		}

		$raw = @file_get_contents($jsonPath);
		$decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true, 16) : null;
		if (!is_array($decoded)) {
			self::$catalogCache = $empty;
			return self::$catalogCache;
		}

		/** @var array<string, list<SvgTuple>> $outline */
		$outline = isset($decoded['outline']) && is_array($decoded['outline']) ? $decoded['outline'] : [];
		/** @var array<string, list<SvgTuple>> $filled */
		$filled = isset($decoded['filled']) && is_array($decoded['filled']) ? $decoded['filled'] : [];

		/** @var array<string, array{0: string, 1: string}> $meta */
		$meta = isset($decoded['meta']) && is_array($decoded['meta']) ? $decoded['meta'] : [];

		$categories = [];
		if (isset($decoded['categories']) && is_array($decoded['categories'])) {
			foreach ($decoded['categories'] as $catItem) {
				if (is_array($catItem) && isset($catItem['id'], $catItem['label'], $catItem['count']) && is_string($catItem['id']) && is_string($catItem['label'])) {
					$categories[] = [
						'id' => $catItem['id'],
						'label' => $catItem['label'],
						'count' => (int) $catItem['count'],
					];
				}
			}
		}

		$popular = [];
		if (isset($decoded['popular']) && is_array($decoded['popular'])) {
			foreach ($decoded['popular'] as $popName) {
				if (is_string($popName) && isset($outline[$popName])) {
					$popular[] = $popName;
				}
			}
		}

		$aliases = [];
		if (isset($decoded['aliases']) && is_array($decoded['aliases'])) {
			foreach ($decoded['aliases'] as $aliasKey => $targetName) {
				if (is_string($aliasKey) && is_string($targetName)) {
					$aliases[strtolower($aliasKey)] = strtolower($targetName);
				}
			}
		}

		/** @var list<string> $names */
		$names = array_values(array_filter(array_keys($outline), 'is_string'));

		$outlineCount = count($outline);
		$filledCount = count($filled);

		self::$catalogCache = [
			'version' => isset($decoded['version']) && is_string($decoded['version']) ? $decoded['version'] : '3.0.0',
			'outlineCount' => $outlineCount,
			'filledCount' => $filledCount,
			'totalVariants' => $outlineCount + $filledCount,
			'names' => $names,
			'outline' => $outline,
			'filled' => $filled,
			'meta' => $meta,
			'categories' => $categories,
			'popular' => $popular,
			'aliases' => $aliases,
		];

		return self::$catalogCache;
	}

	public function getVersion(): string
	{
		return self::loadCatalog()['version'];
	}

	/**
	 * Return the count of canonical icon families (outline entries).
	 */
	public function count(): int
	{
		return self::loadCatalog()['outlineCount'];
	}

	/**
	 * Return the combined count of outline + filled icon variants.
	 */
	public function totalVariantsCount(): int
	{
		return self::loadCatalog()['totalVariants'];
	}

	/**
	 * Return the count of filled icon variants.
	 */
	public function filledCount(): int
	{
		return self::loadCatalog()['filledCount'];
	}

	/**
	 * @return list<array{id: string, label: string, count: int}>
	 */
	public function getCategories(): array
	{
		return self::loadCatalog()['categories'];
	}

	/**
	 * Format a canonical icon slug into a human-friendly label (e.g. `brand-whatsapp` -> `WhatsApp`).
	 */
	public static function formatLabel(string $raw): string
	{
		$clean = self::cleanIdentifier($raw);
		if ($clean === '') {
			return '';
		}
		if (str_ends_with($clean, '-filled') && strlen($clean) > 7) {
			$clean = substr($clean, 0, -7);
		}
		$withoutBrand = str_starts_with($clean, 'brand-') ? substr($clean, 6) : $clean;
		if (isset(self::SPECIAL_BRAND_LABELS[$withoutBrand])) {
			return self::SPECIAL_BRAND_LABELS[$withoutBrand];
		}

		$parts = array_values(array_filter(explode('-', $withoutBrand), static fn (string $p): bool => $p !== ''));
		$formatted = array_map(
			static fn (string $part): string => self::SPECIAL_BRAND_LABELS[$part] ?? ucfirst($part),
			$parts,
		);

		return implode(' ', $formatted);
	}

	/**
	 * Normalize a raw icon identifier string, stripping admin/class prefixes and `lucreplaced-` tokens.
	 */
	public static function cleanIdentifier(string $raw): string
	{
		$trimmed = trim($raw);
		if ($trimmed === '') {
			return '';
		}
		$restored = str_ireplace(self::ADMIN_SAFE_REPLACEMENT, 'fa-', $trimmed);
		$stripped = (string) preg_replace(
			'/^(?:fa-lucide--|lucide--|fa-solid\s+fa-|fa-regular\s+fa-|fa-brands\s+fa-|fas\s+fa-|far\s+fa-|fab\s+fa-|ti\s+ti-|ti-|fa-|icon-|uk-icon-)/i',
			'',
			$restored,
		);
		$kebab = (string) preg_replace('/([a-z0-9])([A-Z])/', '$1-$2', $stripped);
		$kebab = (string) preg_replace('/[^a-zA-Z0-9-]+/', '-', $kebab);
		$kebab = (string) preg_replace('/-+/', '-', $kebab);

		return strtolower(trim($kebab, '-'));
	}

	/**
	 * Extract `[cleanBaseIdentifier, variant]` from a raw string (`heart:filled`, `heart-filled`, `lucide--heart-filled`).
	 *
	 * @return array{0: string, 1: 'outline'|'filled'}
	 */
	public static function splitIdentifierAndVariant(string $raw): array
	{
		$trimmed = trim($raw);
		if ($trimmed === '') {
			return ['', 'outline'];
		}
		$explicitFilled = false;
		if (preg_match('/:filled$/i', $trimmed) === 1) {
			$explicitFilled = true;
			$trimmed = (string) preg_replace('/:filled$/i', '', $trimmed);
		}
		$clean = self::cleanIdentifier($trimmed);
		if ($clean === '') {
			return ['', 'outline'];
		}

		$cat = self::loadCatalog();
		if (!$explicitFilled && !isset($cat['outline'][$clean]) && str_ends_with($clean, '-filled') && strlen($clean) > 7) {
			$candidateBase = substr($clean, 0, -7);
			if ($cat['outline'] === [] || isset($cat['outline'][$candidateBase]) || isset($cat['aliases'][$candidateBase])) {
				$clean = $candidateBase;
				$explicitFilled = true;
			}
		}

		return [$clean, $explicitFilled ? 'filled' : 'outline'];
	}

	/**
	 * Resolve any shorthand, aliased, or canonical icon identifier to a canonical icon name (or `''` if unknown).
	 */
	public static function resolveCanonicalName(string $raw): string
	{
		[$clean] = self::splitIdentifierAndVariant($raw);
		if ($clean === '') {
			return '';
		}

		$cat = self::loadCatalog();
		if (isset($cat['outline'][$clean])) {
			return $clean;
		}
		if (isset($cat['aliases'][$clean])) {
			$aliased = $cat['aliases'][$clean];
			if (isset($cat['outline'][$aliased])) {
				return $aliased;
			}
		}
		if (str_ends_with($clean, '-o') && strlen($clean) > 2) {
			$base = substr($clean, 0, -2);
			if (isset($cat['outline'][$base])) {
				return $base;
			}
			if (isset($cat['aliases'][$base]) && isset($cat['outline'][$cat['aliases'][$base]])) {
				return $cat['aliases'][$base];
			}
		}

		return '';
	}

	public static function hasFilledVariant(string $raw): bool
	{
		$canonical = self::resolveCanonicalName($raw);
		if ($canonical === '') {
			return false;
		}
		$cat = self::loadCatalog();

		return isset($cat['filled'][$canonical]) && $cat['filled'][$canonical] !== [];
	}

	public function hasIcon(string $raw): bool
	{
		return self::resolveCanonicalName($raw) !== '';
	}

	/**
	 * Build a single `CatalogEntry` payload for client query/hydration responses.
	 *
	 * @return CatalogEntry|null
	 */
	public static function buildCatalogEntry(string $canonical): ?array
	{
		$cat = self::loadCatalog();
		if (!isset($cat['outline'][$canonical])) {
			return null;
		}
		$outlineNodes = self::sanitizeTupleList($cat['outline'][$canonical]);
		if ($outlineNodes === []) {
			return null;
		}
		$filledNodes = isset($cat['filled'][$canonical]) ? self::sanitizeTupleList($cat['filled'][$canonical]) : [];
		$hasFilled = $filledNodes !== [];
		$rawMeta = $cat['meta'][$canonical] ?? null;
		$category = is_array($rawMeta) && isset($rawMeta[0]) && is_string($rawMeta[0]) ? $rawMeta[0] : 'Other';

		return [
			'name' => $canonical,
			'label' => self::formatLabel($canonical),
			'category' => $category,
			'hasFilled' => $hasFilled,
			'outline' => $outlineNodes,
			'filled' => $hasFilled ? $filledNodes : null,
		];
	}

	/**
	 * Hydrate a bounded list of icon names into a map of `CatalogEntry` items for `<DynamicIcon>` / `ReactIcons.js`.
	 *
	 * @param list<string> $rawNames
	 * @return array<string, CatalogEntry>
	 */
	public function hydrateIcons(array $rawNames): array
	{
		$sliced = array_slice($rawNames, 0, 100);
		$result = [];
		foreach ($sliced as $rawName) {
			if (!is_string($rawName)) {
				continue;
			}
			$canonical = self::resolveCanonicalName($rawName);
			if ($canonical === '') {
				continue;
			}
			$entry = self::buildCatalogEntry($canonical);
			if ($entry !== null) {
				$result[$canonical] = $entry;
			}
		}

		return $result;
	}

	/**
	 * Paginated catalog query supporting search across names, shorthand aliases, and tags, plus category and style filtering.
	 *
	 * @return array{
	 *   ok: bool,
	 *   total: int,
	 *   offset: int,
	 *   limit: int,
	 *   hasMore: bool,
	 *   categories?: list<array{id: string, label: string, count: int}>,
	 *   popular?: list<CatalogEntry>,
	 *   items: list<CatalogEntry>
	 * }
	 */
	public function queryCatalog(
		string $query = '',
		string $category = 'all',
		string $style = 'all',
		int $offset = 0,
		int $limit = 96,
		bool $includeMeta = false,
	): array {
		$cat = self::loadCatalog();
		$safeOffset = max(0, $offset);
		$safeLimit = max(1, min(200, $limit));
		$normCategory = trim($category);
		if ($normCategory === '' || strcasecmp($normCategory, 'all') === 0) {
			$normCategory = 'all';
		}
		$normStyle = strtolower(trim($style));
		if (!in_array($normStyle, ['all', 'outline', 'filled'], true)) {
			$normStyle = 'all';
		}

		$q = self::cleanIdentifier($query);
		$qWords = $q !== '' ? array_values(array_filter(explode('-', $q), static fn (string $w): bool => $w !== '')) : [];

		// Pre-filter pool by category and filled style
		$pool = [];
		foreach ($cat['names'] as $name) {
			if ($normStyle === 'filled' && !isset($cat['filled'][$name])) {
				continue;
			}
			if ($normCategory !== 'all') {
				$itemCat = $cat['meta'][$name][0] ?? 'Other';
				if (strcasecmp($itemCat, $normCategory) !== 0) {
					continue;
				}
			}
			$pool[] = $name;
		}

		if ($q === '') {
			$matched = $pool;
		} else {
			$direct = self::resolveCanonicalName($q);
			$aliasTargets = [];
			foreach ($cat['aliases'] as $alias => $target) {
				if (str_contains($alias, $q)) {
					$aliasTargets[$target] = true;
				}
			}

			$exact = [];
			$prefix = [];
			$aliasHit = [];
			$contains = [];
			$tagHit = [];

			foreach ($pool as $name) {
				if ($name === $q || ($direct !== '' && $name === $direct)) {
					$exact[] = $name;
				} elseif (str_starts_with($name, $q) || str_starts_with($name, 'brand-' . $q)) {
					$prefix[] = $name;
				} elseif (isset($aliasTargets[$name])) {
					$aliasHit[] = $name;
				} elseif (str_contains($name, $q)) {
					$contains[] = $name;
				} else {
					$tagsStr = $cat['meta'][$name][1] ?? '';
					if ($tagsStr !== '') {
						$allMatched = true;
						foreach ($qWords as $word) {
							if (!str_contains($tagsStr, $word) && !str_contains($name, $word)) {
								$allMatched = false;
								break;
							}
						}
						if ($allMatched) {
							$tagHit[] = $name;
						}
					}
				}
			}

			$matched = array_merge($exact, $prefix, $aliasHit, $contains, $tagHit);
		}

		$matchedCount = count($matched);
		$displayTotal = ($q === '' && $normCategory === 'all' && $normStyle === 'all')
			? $cat['totalVariants']
			: $matchedCount;

		$slice = array_slice($matched, $safeOffset, $safeLimit);
		$items = [];
		foreach ($slice as $name) {
			$entry = self::buildCatalogEntry($name);
			if ($entry !== null) {
				$items[] = $entry;
			}
		}

		$response = [
			'ok' => true,
			'total' => $displayTotal,
			'offset' => $safeOffset,
			'limit' => $safeLimit,
			'hasMore' => ($safeOffset + count($items)) < $matchedCount,
			'items' => $items,
		];

		if ($includeMeta) {
			$response['categories'] = $cat['categories'];
			$popularEntries = [];
			foreach ($cat['popular'] as $popName) {
				$popEntry = self::buildCatalogEntry($popName);
				if ($popEntry !== null) {
					$popularEntries[] = $popEntry;
				}
			}
			$response['popular'] = $popularEntries;
		}

		return $response;
	}

	public static function sanitizeVariant(mixed $raw, string $fallback = 'outline'): string
	{
		if (is_string($raw)) {
			$lower = strtolower(trim($raw));
			if (in_array($lower, ['filled', 'fill', 'solid'], true)) {
				return 'filled';
			}
			if (in_array($lower, ['outline', 'regular', 'line'], true)) {
				return 'outline';
			}
		}

		return $fallback === 'filled' ? 'filled' : 'outline';
	}

	public static function sanitizeColor(mixed $raw): string
	{
		if (!is_string($raw)) {
			return '';
		}
		$trimmed = trim($raw);
		if ($trimmed === '' || strcasecmp($trimmed, 'currentColor') === 0 || strcasecmp($trimmed, 'inherit') === 0) {
			return '';
		}

		return preg_match('/^(?:#[0-9a-fA-F]{3,8}|var\(--[a-zA-Z0-9_-]+\))$/', $trimmed) === 1 ? $trimmed : '';
	}

	public static function clampSize(mixed $raw, int $fallback = 24): int
	{
		if (!is_numeric($raw)) {
			return $fallback;
		}
		$num = (int) round((float) $raw);
		if ($num <= 0) {
			return $fallback;
		}

		return max(12, min(96, $num));
	}

	public static function clampStrokeWidth(mixed $raw, float $fallback = 2.0): float
	{
		if (!is_numeric($raw)) {
			return $fallback;
		}
		$num = (float) $raw;
		if ($num <= 0.0) {
			return $fallback;
		}

		return round(max(1.0, min(3.0, $num)), 2);
	}

	public static function sanitizeRadius(mixed $raw, string $fallback = 'md'): string
	{
		if (is_string($raw)) {
			$clean = strtolower(trim($raw));
			if (in_array($clean, self::VALID_RADII, true)) {
				return $clean;
			}
		}

		return $fallback;
	}

	/**
	 * Resolve effective customization permission flags from field/blueprint settings.
	 *
	 * @param array<string, mixed> $raw
	 * @return array{
	 *   allowCustomization: bool,
	 *   allowVariant: bool,
	 *   allowSize: bool,
	 *   allowColor: bool,
	 *   allowStrokeWidth: bool,
	 *   allowBackground: bool
	 * }
	 */
	public static function resolveCustomizationFlags(array $raw = []): array
	{
		$master = !empty($raw['allowCustomization']);
		$hasExplicit = !empty($raw['allowVariant'])
			|| !empty($raw['allowSize'])
			|| !empty($raw['allowColor'])
			|| !empty($raw['allowStrokeWidth'])
			|| !empty($raw['allowBackground']);
		if (!$master && !$hasExplicit) {
			return [
				'allowCustomization' => false,
				'allowVariant' => false,
				'allowSize' => false,
				'allowColor' => false,
				'allowStrokeWidth' => false,
				'allowBackground' => false,
			];
		}

		return [
			'allowCustomization' => true,
			'allowVariant' => array_key_exists('allowVariant', $raw) ? (bool) $raw['allowVariant'] : $master,
			'allowSize' => array_key_exists('allowSize', $raw) ? (bool) $raw['allowSize'] : $master,
			'allowColor' => array_key_exists('allowColor', $raw) ? (bool) $raw['allowColor'] : $master,
			'allowStrokeWidth' => array_key_exists('allowStrokeWidth', $raw) ? (bool) $raw['allowStrokeWidth'] : $master,
			'allowBackground' => array_key_exists('allowBackground', $raw) ? (bool) $raw['allowBackground'] : $master,
		];
	}

	/**
	 * Normalize arbitrary raw icon input (scalar string, JSON string, array, `\stdClass`, or `ReactIconValue`).
	 *
	 * @return array{
	 *   name: string,
	 *   variant: string,
	 *   size: int,
	 *   color: string,
	 *   strokeWidth: float,
	 *   background: string,
	 *   radius: string
	 * }
	 */
	public static function normalizeValue(mixed $raw): array
	{
		$base = [
			'name' => '',
			'variant' => 'outline',
			'size' => 24,
			'color' => '',
			'strokeWidth' => 2.0,
			'background' => '',
			'radius' => 'md',
		];

		if ($raw instanceof ReactIconValue) {
			$rawName = (string) $raw->get('name');
			[$cleanBase, $parsedVariant] = self::splitIdentifierAndVariant($rawName);
			$explicitVariant = self::sanitizeVariant($raw->get('variant'), $parsedVariant);
			$canonical = self::resolveCanonicalName($rawName);

			return [
				'name' => $canonical !== '' ? $canonical : $cleanBase,
				'variant' => $explicitVariant,
				'size' => self::clampSize($raw->get('size'), 24),
				'color' => self::sanitizeColor($raw->get('color')),
				'strokeWidth' => self::clampStrokeWidth($raw->get('strokeWidth'), 2.0),
				'background' => self::sanitizeColor($raw->get('background')),
				'radius' => self::sanitizeRadius($raw->get('radius'), 'md'),
			];
		}

		if ($raw instanceof \stdClass) {
			$raw = get_object_vars($raw);
		}
		if ($raw === null || $raw === '' || $raw === [] || $raw === false) {
			return $base;
		}

		if (is_string($raw) || $raw instanceof \Stringable) {
			$trimmed = trim((string) $raw);
			if ($trimmed === '' || strlen($trimmed) > self::MAX_JSON_BYTES) {
				return $base;
			}
			if (str_starts_with($trimmed, '{')) {
				$decoded = json_decode($trimmed, true, self::MAX_JSON_DEPTH);
				if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
					return $base;
				}
				$raw = $decoded;
			}
			if (is_string($raw) || $raw instanceof \Stringable) {
				[$cleanBase, $parsedVariant] = self::splitIdentifierAndVariant($trimmed);
				$canonical = self::resolveCanonicalName($trimmed);
				$base['name'] = $canonical !== '' ? $canonical : $cleanBase;
				$base['variant'] = $parsedVariant;

				return $base;
			}
		}

		if (is_array($raw)) {
			$rawName = '';
			if (isset($raw['name']) && is_string($raw['name'])) {
				$rawName = $raw['name'];
			} elseif (isset($raw['icon']) && is_string($raw['icon'])) {
				$rawName = $raw['icon'];
			}
			[$cleanBase, $parsedVariant] = self::splitIdentifierAndVariant($rawName);
			$canonical = self::resolveCanonicalName($rawName);
			$base['name'] = $canonical !== '' ? $canonical : $cleanBase;
			$base['variant'] = self::sanitizeVariant($raw['variant'] ?? $raw['style'] ?? null, $parsedVariant);
			$base['size'] = self::clampSize($raw['size'] ?? null, 24);
			$base['color'] = self::sanitizeColor($raw['color'] ?? null);
			$base['strokeWidth'] = self::clampStrokeWidth($raw['strokeWidth'] ?? $raw['stroke'] ?? null, 2.0);
			$base['background'] = self::sanitizeColor($raw['background'] ?? $raw['bg'] ?? null);
			$base['radius'] = self::sanitizeRadius($raw['radius'] ?? $raw['shape'] ?? null, 'md');
		}

		return $base;
	}

	/**
	 * Encode normalized icon value into canonical database string (scalar string when customization is disabled,
	 * JSON object string when customization is enabled).
	 *
	 * @param array<string, mixed> $rawFlags
	 */
	public static function encodeForStorage(mixed $raw, array $rawFlags = [], string $prefixMode = 'none'): string
	{
		$norm = self::normalizeValue($raw);
		if ($norm['name'] === '') {
			return '';
		}

		$flags = self::resolveCustomizationFlags($rawFlags);
		if (!$flags['allowCustomization']) {
			$scalar = ($norm['variant'] === 'filled' && (self::loadCatalog()['outline'] === [] || self::hasFilledVariant($norm['name'])))
				? ($norm['name'] . '-filled')
				: $norm['name'];
			if ($prefixMode === 'lucide') {
				return self::ADMIN_PREFIX . $scalar;
			}
			if ($prefixMode === 'fa') {
				return 'fa-' . $scalar;
			}

			return $scalar;
		}

		$payload = [
			'name' => $norm['name'],
			'variant' => $flags['allowVariant'] ? $norm['variant'] : 'outline',
			'size' => $flags['allowSize'] ? $norm['size'] : 24,
			'color' => $flags['allowColor'] ? $norm['color'] : '',
			'strokeWidth' => $flags['allowStrokeWidth'] ? $norm['strokeWidth'] : 2.0,
			'background' => $flags['allowBackground'] ? $norm['background'] : '',
			'radius' => $flags['allowBackground'] ? $norm['radius'] : 'md',
		];

		$encoded = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

		return is_string($encoded) ? $encoded : '';
	}

	/**
	 * Render safe inline `<svg>` markup for a canonical or aliased vector icon (Outline or Filled).
	 *
	 * @param array{variant?: string, size?: int, color?: string, strokeWidth?: float, class?: string} $overrides
	 */
	public static function renderSvgMarkup(mixed $raw, array $overrides = []): string
	{
		$norm = self::normalizeValue($raw);
		if ($norm['name'] === '') {
			return '';
		}

		$cat = self::loadCatalog();
		$canonical = self::resolveCanonicalName($norm['name']);
		if ($canonical === '') {
			$canonical = isset($cat['outline']['box']) ? 'box' : '';
		}
		if ($canonical === '' || !isset($cat['outline'][$canonical])) {
			return '';
		}

		$variant = isset($overrides['variant'])
			? self::sanitizeVariant($overrides['variant'], $norm['variant'])
			: $norm['variant'];
		$useFilled = $variant === 'filled' && isset($cat['filled'][$canonical]) && $cat['filled'][$canonical] !== [];
		$nodes = self::sanitizeTupleList($useFilled ? $cat['filled'][$canonical] : $cat['outline'][$canonical]);

		$size = isset($overrides['size']) ? self::clampSize($overrides['size'], 24) : $norm['size'];
		$strokeWidth = isset($overrides['strokeWidth'])
			? self::clampStrokeWidth($overrides['strokeWidth'], 2.0)
			: $norm['strokeWidth'];
		$color = array_key_exists('color', $overrides)
			? self::sanitizeColor($overrides['color'])
			: $norm['color'];
		$activeColor = $color !== '' ? $color : 'currentColor';
		$extraClass = isset($overrides['class']) && is_string($overrides['class']) ? trim($overrides['class']) : '';
		$classAttr = trim('rw-icon rw-icon-' . $canonical . ($extraClass !== '' ? ' ' . $extraClass : ''));

		$inner = '';
		foreach ($nodes as $tuple) {
			$tag = $tuple[0];
			$attrs = $tuple[1];
			if (!in_array($tag, self::ALLOWED_SVG_TAGS, true)) {
				continue;
			}
			$attrStr = '';
			foreach ($attrs as $k => $v) {
				if ($k === 'key' || preg_match('/^[a-zA-Z][a-zA-Z0-9-]*$/', $k) !== 1) {
					continue;
				}
				$attrStr .= ' ' . $k . '="' . htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '"';
			}
			$inner .= '<' . $tag . $attrStr . '/>';
		}

		$safeColor = htmlspecialchars($activeColor, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
		$safeClass = htmlspecialchars($classAttr, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

		if ($useFilled) {
			return '<svg xmlns="http://www.w3.org/2000/svg" width="' . $size . '" height="' . $size . '" viewBox="0 0 24 24" fill="' . $safeColor . '" stroke="none" class="' . $safeClass . '" aria-hidden="true" focusable="false">' . $inner . '</svg>';
		}

		return '<svg xmlns="http://www.w3.org/2000/svg" width="' . $size . '" height="' . $size . '" viewBox="0 0 24 24" fill="none" stroke="' . $safeColor . '" stroke-width="' . $strokeWidth . '" stroke-linecap="round" stroke-linejoin="round" class="' . $safeClass . '" aria-hidden="true" focusable="false">' . $inner . '</svg>';
	}

	/**
	 * Render inline `<svg>` or `<span class="rw-icon-badge">` framed HTML when `background` is configured.
	 *
	 * @param array{variant?: string, size?: int, color?: string, strokeWidth?: float, background?: string, radius?: string, class?: string} $overrides
	 */
	public static function renderHtmlMarkup(mixed $raw, array $overrides = []): string
	{
		$norm = self::normalizeValue($raw);
		if ($norm['name'] === '') {
			return '';
		}

		$svg = self::renderSvgMarkup($norm, $overrides);
		if ($svg === '') {
			return '';
		}

		$bg = array_key_exists('background', $overrides)
			? self::sanitizeColor($overrides['background'])
			: $norm['background'];
		if ($bg === '') {
			return $svg;
		}

		$radius = isset($overrides['radius'])
			? self::sanitizeRadius($overrides['radius'], 'md')
			: $norm['radius'];
		$radiusCss = match ($radius) {
			'none' => '0px',
			'sm' => '4px',
			'lg' => '12px',
			'full' => '9999px',
			default => '8px',
		};
		$size = isset($overrides['size']) ? self::clampSize($overrides['size'], 24) : $norm['size'];
		$pad = max(4, (int) round($size * 0.35));
		$safeBg = htmlspecialchars($bg, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

		return '<span class="rw-icon-badge" style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;background-color:' . $safeBg . ';border-radius:' . $radiusCss . ';padding:' . $pad . 'px;">' . $svg . '</span>';
	}

	/**
	 * Resolve any raw icon value into a formatted `ReactIconValue` `WireData` object.
	 *
	 * @param array{variant?: string, size?: int, color?: string, strokeWidth?: float, background?: string, radius?: string, class?: string} $overrides
	 */
	public static function resolveValueObject(mixed $raw, array $overrides = []): ReactIconValue
	{
		$norm = self::normalizeValue($raw);
		if ($norm['name'] === '') {
			return new ReactIconValue();
		}

		$canonical = self::resolveCanonicalName($norm['name']);
		$effectiveName = $canonical !== '' ? $canonical : $norm['name'];
		$svg = self::renderSvgMarkup($norm, $overrides);
		$html = self::renderHtmlMarkup($norm, $overrides);
		$rawStr = is_scalar($raw) ? trim((string) $raw) : self::encodeForStorage($norm, ['allowCustomization' => true]);

		$isCustomized = $norm['variant'] !== 'outline'
			|| $norm['size'] !== 24
			|| $norm['strokeWidth'] !== 2.0
			|| $norm['color'] !== ''
			|| $norm['background'] !== ''
			|| $norm['radius'] !== 'md';

		return new ReactIconValue([
			'set' => 'vector',
			'name' => $effectiveName,
			'variant' => $norm['variant'],
			'raw' => $rawStr,
			'svg' => $svg,
			'html' => $html,
			'size' => $norm['size'],
			'color' => $norm['color'],
			'strokeWidth' => $norm['strokeWidth'],
			'background' => $norm['background'],
			'radius' => $norm['radius'],
			'customized' => $isCustomized,
		]);
	}

	/**
	 * @param array{variant?: string, size?: int, color?: string, strokeWidth?: float, class?: string} $overrides
	 */
	public function renderSvg(mixed $raw, array $overrides = []): string
	{
		return self::renderSvgMarkup($raw, $overrides);
	}

	/**
	 * @param array{variant?: string, size?: int, color?: string, strokeWidth?: float, background?: string, radius?: string, class?: string} $overrides
	 */
	public function resolveValue(mixed $raw, array $overrides = []): ReactIconValue
	{
		$val = self::resolveValueObject($raw, $overrides);
		$this->wire($val);

		return $val;
	}

	/* =========================================================================
	 * ProcessWire Admin CSS `mask-image` Integration
	 * ======================================================================= */

	/**
	 * Convert a raw icon selection into `lucide--{canonical}` or `lucide--{canonical}-filled` (or `''` when blank/invalid).
	 */
	public static function toAdminPrefixedValue(mixed $raw): string
	{
		$norm = self::normalizeValue($raw);
		if ($norm['name'] === '') {
			return '';
		}
		$canonical = self::resolveCanonicalName($norm['name']);
		if ($canonical === '') {
			return '';
		}
		$suffix = ($norm['variant'] === 'filled' && self::hasFilledVariant($canonical)) ? '-filled' : '';

		return self::ADMIN_PREFIX . $canonical . $suffix;
	}

	/**
	 * Guard against `InputfieldWrapper::render()` stripping `'icon-'` and `'fa-'` substrings inside icon names (e.g. `sofa-bed`).
	 */
	public static function sanitizeAdminIconClass(string $lucideIcon): string
	{
		$clean = trim($lucideIcon);
		if ($clean === '') {
			return '';
		}
		if (str_starts_with($clean, 'fa-')) {
			$clean = substr($clean, 3);
		}

		return str_replace(['icon-', 'fa-'], self::ADMIN_SAFE_REPLACEMENT, $clean);
	}

	/**
	 * Check whether an icon name stored on a `Field` or `Template` belongs to the Admin vector icon system.
	 */
	public static function isAdminVectorIcon(string $icon): bool
	{
		$clean = ltrim(trim($icon), '-');
		if (str_starts_with($clean, 'fa-')) {
			$clean = substr($clean, 3);
		}

		return str_starts_with($clean, self::ADMIN_PREFIX) || str_contains($clean, self::ADMIN_SAFE_REPLACEMENT);
	}

	public function getAdminCssPath(): string
	{
		$assetsPath = (string) $this->wire()->config->paths->assets;
		if ($assetsPath === '') {
			return dirname(__DIR__, 2) . '/dist/LucideIcons.css';
		}

		return rtrim($assetsPath, '/') . '/lucide-icons/LucideIcons.css';
	}

	public function getAdminCssUrl(): string
	{
		$assetsUrl = (string) ($this->wire()->config->urls->assets ?: '/site/assets/');

		return rtrim($assetsUrl, '/') . '/lucide-icons/LucideIcons.css';
	}

	public function ensureAdminCss(): string
	{
		$path = $this->getAdminCssPath();
		if (!is_file($path)) {
			$this->adminCssVerified = true;

			return $this->generateAdminCss();
		}

		if (!$this->adminCssVerified) {
			$this->adminCssVerified = true;
			$expectedSig = 'rw-reg-sig:' . self::registeredIconsSignature();
			$head = @file_get_contents($path, false, null, 0, 220);
			if (!is_string($head) || !str_contains($head, $expectedSig) || !str_contains($head, 'rw-count:')) {
				return $this->generateAdminCss();
			}
		}

		return $path;
	}

	/**
	 * Ensure admin icon CSS is up to date and report whether at least one vector icon override rule is active.
	 */
	public function hasActiveAdminCss(): bool
	{
		$path = $this->ensureAdminCss();
		if (!is_file($path)) {
			return false;
		}
		$head = @file_get_contents($path, false, null, 0, 220);
		if (!is_string($head)) {
			return false;
		}
		if (preg_match('/rw-count:(\d+)/', $head, $matches) === 1) {
			return (int) $matches[1] > 0;
		}

		return str_contains($head, 'mask-image');
	}

	/**
	 * Generate `site/assets/lucide-icons/LucideIcons.css` with inline SVG `mask-image` rules for all
	 * `lucide--*` icons assigned across Modules, Templates, Fields (global + template contexts), and Admin `page_icon` pages.
	 */
	public function generateAdminCss(): string
	{
		$modules = $this->wire()->modules;
		$templates = $this->wire()->templates;
		$fields = $this->wire()->fields;
		$fieldgroups = $this->wire()->fieldgroups;
		$pages = $this->wire()->pages;
		$files = $this->wire()->files;

		/** @var array<string, string> $prefixedIcons */
		$prefixedIcons = [];

		$collect = static function (mixed $candidate) use (&$prefixedIcons): void {
			if (!is_string($candidate) && !$candidate instanceof \Stringable && !is_array($candidate)) {
				return;
			}
			$prefixed = self::toAdminPrefixedValue($candidate);
			if ($prefixed !== '') {
				$key = substr($prefixed, strlen(self::ADMIN_PREFIX));
				$prefixedIcons[$key] = $prefixed;
			}
		};

		foreach (array_keys(self::$registeredAdminIcons) as $registeredIcon) {
			$collect($registeredIcon);
		}

		if ($modules !== null) {
			foreach ($modules as $mod) {
				$modName = is_object($mod) ? (method_exists($mod, 'className') ? (string) $mod->className() : '') : (string) $mod;
				if ($modName === '') {
					continue;
				}
				try {
					$info = $modules->getModuleInfo($modName);
					$modIcon = isset($info['icon']) && is_string($info['icon']) ? trim($info['icon']) : '';
					if ($modIcon !== '' && self::isAdminVectorIcon($modIcon)) {
						$collect($modIcon);
					}
				} catch (\Throwable) {
					// Ignore uninstalled or transient module metadata
				}
			}
		}

		if ($templates !== null) {
			foreach ($templates as $template) {
				if (!$template instanceof Template) {
					continue;
				}
				$lucideProp = $template->get('lucideIcon');
				if (is_string($lucideProp) && trim($lucideProp) !== '') {
					$collect($lucideProp);
				}
				$tplIcon = (string) $template->getIcon(false);
				if ($tplIcon !== '' && self::isAdminVectorIcon($tplIcon)) {
					$collect($tplIcon);
				}
			}
		}

		if ($fields !== null) {
			foreach ($fields as $field) {
				if (!$field instanceof Field) {
					continue;
				}
				$lucideProp = $field->get('lucideIcon');
				if (is_string($lucideProp) && trim($lucideProp) !== '') {
					$collect($lucideProp);
				}
				$fIcon = (string) $field->getIcon(false);
				if ($fIcon !== '' && self::isAdminVectorIcon($fIcon)) {
					$collect($fIcon);
				}
			}
		}

		if ($fieldgroups !== null) {
			foreach ($fieldgroups as $fg) {
				if (!$fg instanceof Fieldgroup) {
					continue;
				}
				foreach ($fg as $field) {
					if (!$field instanceof Field || !$fg->hasFieldContext($field)) {
						continue;
					}
					$ctx = $fg->getFieldContextArray($field->id);
					if (isset($ctx['lucideIcon']) && is_string($ctx['lucideIcon']) && trim($ctx['lucideIcon']) !== '') {
						$collect($ctx['lucideIcon']);
					}
					if (isset($ctx['icon']) && is_string($ctx['icon']) && self::isAdminVectorIcon($ctx['icon'])) {
						$collect($ctx['icon']);
					}
				}
			}
		}

		if ($fields !== null && $pages !== null && $fields->get('page_icon') instanceof Field) {
			try {
				$adminPages = $pages->find("template=admin, page_icon!='', include=unpublished, check_access=0");
				foreach ($adminPages as $adminPage) {
					if (!$adminPage instanceof Page) {
						continue;
					}
					$rawPageIcon = $adminPage->getUnformatted('page_icon');
					if (is_string($rawPageIcon) && (self::isAdminVectorIcon($rawPageIcon) || str_starts_with(trim($rawPageIcon), '{'))) {
						$collect($rawPageIcon);
					}
				}
			} catch (\Throwable) {
				// Ignore if page_icon table is not queryable during early bootstrap
			}
		}

		$cssLines = [
			'/* Auto-generated by React IconManager | rw-reg-sig:' . self::registeredIconsSignature() . ' | rw-count:' . count($prefixedIcons) . ' */',
			'[class*="fa-lucide--"]::before, [class*="fa-lucreplaced-"]::before { content: "" !important; display: none !important; }',
			'[class*="fa-lucide--"], [class*="fa-lucreplaced-"] {',
			'  display: inline-block;',
			'  vertical-align: middle;',
			'  position: relative;',
			'  top: -1px;',
			'  width: 18px;',
			'  height: 18px;',
			'  min-width: 16px;',
			'  background-color: currentColor;',
			'  mask-repeat: no-repeat;',
			'  -webkit-mask-repeat: no-repeat;',
			'  mask-position: center;',
			'  -webkit-mask-position: center;',
			'  mask-size: contain;',
			'  -webkit-mask-size: contain;',
			'}',
			'.PageListItem [class*="fa-lucide--"], .PageListItem [class*="fa-lucreplaced-"], .ui-menu-item [class*="fa-lucide--"], .uk-nav [class*="fa-lucide--"] {',
			'  width: 16px;',
			'  height: 16px;',
			'  box-sizing: content-box;',
			'}',
			'h1 [class*="fa-lucide--"], h1 [class*="fa-lucreplaced-"] {',
			'  width: 28px;',
			'  height: 28px;',
			'}',
		];

		ksort($prefixedIcons);
		foreach ($prefixedIcons as $iconKey => $prefixed) {
			$svg = self::renderSvgMarkup($iconKey, ['size' => 24, 'strokeWidth' => 2.0]);
			if ($svg === '') {
				continue;
			}
			$dataUri = 'data:image/svg+xml,' . rawurlencode($svg);
			$selectors = ['.fa-' . $prefixed];
			$sanitized = self::sanitizeAdminIconClass($prefixed);
			if ($sanitized !== $prefixed) {
				$selectors[] = '.fa-' . $sanitized;
			}
			if (str_ends_with($prefixed, '-o')) {
				$selectors[] = '.far.fa-' . substr($prefixed, 0, -2);
			}
			if (str_ends_with($sanitized, '-o')) {
				$selectors[] = '.far.fa-' . substr($sanitized, 0, -2);
			}
			$selectorStr = implode(', ', array_unique($selectors));
			$cssLines[] = "{$selectorStr} { mask-image: url(\"{$dataUri}\"); -webkit-mask-image: url(\"{$dataUri}\"); }";
		}

		$css = implode("\n", $cssLines) . "\n";
		$cssPath = $this->getAdminCssPath();
		$dir = dirname($cssPath);
		if (!is_dir($dir)) {
			if ($files !== null) {
				$files->mkdir($dir, true);
			} else {
				@mkdir($dir, 0755, true);
			}
		}
		if (is_link($cssPath) || is_link(rtrim($dir, '/\\'))) {
			return $cssPath;
		}
		if ($files !== null) {
			$files->filePutContents($cssPath, $css, LOCK_EX);
		} else {
			@file_put_contents($cssPath, $css, LOCK_EX);
		}

		return $cssPath;
	}
}
