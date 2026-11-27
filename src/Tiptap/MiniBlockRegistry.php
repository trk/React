<?php

declare(strict_types=1);

namespace Totoglu\React\Tiptap;

use ProcessWire\Wire;

/**
 * Registry and declarative schema normalizer for flat (single-level) `InputfieldTiptap` editorial mini-blocks.
 *
 * Discovers built-in leaf/editorial blocks (`callout`, `figure`, `details`, `pullquote`), project-specific
 * declarative definitions in `./site/tiptap/*.{yaml,yml,php}`, and runtime additions from
 * `InputfieldTiptap::___registerMiniBlocks()`.
 */
final class MiniBlockRegistry
{
	/**
	 * Allowed semantic HTML5 wrapper tags for custom mini-blocks.
	 *
	 * @var list<string>
	 */
	public const array ALLOWED_CUSTOM_TAGS = [
		'aside',
		'section',
		'div',
		'figure',
		'blockquote',
	];

	/**
	 * Allowed scalar field types inside a custom mini-block header/inspector (strictly flat — never nested blocks).
	 *
	 * @var list<string>
	 */
	public const array ALLOWED_FIELD_TYPES = [
		'text',
		'textarea',
		'url',
		'image',
		'select',
		'toggle',
	];

	/**
	 * Built-in mini-block identifiers.
	 *
	 * @var list<string>
	 */
	public const array BUILTIN_NAMES = [
		'callout',
		'figure',
		'details',
		'pullquote',
	];

	/**
	 * In-memory cache of discovered directory blocks keyed by real directory path + mtime signature.
	 *
	 * @var array<string, array<string, array<string, mixed>>>
	 */
	private static array $directoryCache = [];

	/**
	 * Reset static directory cache (invoked on `React::uninstall()`).
	 */
	public static function resetCache(): void
	{
		self::$directoryCache = [];
	}

	/**
	 * Return canonical built-in flat mini-block definitions.
	 *
	 * @param callable(string): string|null $translate
	 * @return array<string, array<string, mixed>>
	 */
	public static function builtInDefinitions(?callable $translate = null): array
	{
		$tr = $translate ?? static fn(string $s): string => $s;

		return [
			'callout' => [
				'name' => 'callout',
				'kind' => 'builtin',
				'label' => $tr('Callout'),
				'description' => $tr('Highlighted info, tip, warning, or danger note'),
				'icon' => 'info',
				'tag' => 'aside',
				'editableBody' => true,
				'keywords' => ['callout', 'alert', 'note', 'info', 'warning', 'tip', 'danger'],
				'variants' => [
					'info' => $tr('Info'),
					'tip' => $tr('Tip'),
					'warning' => $tr('Warning'),
					'danger' => $tr('Danger'),
				],
				'fields' => [],
			],
			'figure' => [
				'name' => 'figure',
				'kind' => 'builtin',
				'label' => $tr('Figure'),
				'description' => $tr('Image with caption and alignment controls'),
				'icon' => 'image',
				'tag' => 'figure',
				'editableBody' => false,
				'keywords' => ['figure', 'image', 'photo', 'caption', 'media'],
				'alignments' => [
					'inline' => $tr('Inline'),
					'wide' => $tr('Wide'),
					'full' => $tr('Full width'),
					'left' => $tr('Float left'),
					'right' => $tr('Float right'),
				],
				'fields' => [],
			],
			'details' => [
				'name' => 'details',
				'kind' => 'builtin',
				'label' => $tr('Details / Accordion'),
				'description' => $tr('Collapsible disclosure block with summary title'),
				'icon' => 'chevron-down',
				'tag' => 'details',
				'editableBody' => true,
				'keywords' => ['details', 'accordion', 'collapse', 'toggle', 'faq', 'spoiler'],
				'fields' => [],
			],
			'pullquote' => [
				'name' => 'pullquote',
				'kind' => 'builtin',
				'label' => $tr('Pullquote'),
				'description' => $tr('Emphasized quotation with author or source attribution'),
				'icon' => 'quote',
				'tag' => 'figure',
				'editableBody' => true,
				'keywords' => ['pullquote', 'quote', 'citation', 'testimonial'],
				'fields' => [],
			],
		];
	}

	/**
	 * Resolve the filesystem directory where project-specific Tiptap mini-blocks live (`./site/tiptap/`).
	 */
	public static function resolveDirectory(?Wire $context = null): string
	{
		$config = $context?->wire()->config;
		if ($config !== null) {
			$override = $config->get('tiptapBlocksPath');
			if (is_string($override) && trim($override) !== '') {
				return rtrim(trim($override), '/\\') . '/';
			}
			$sitePath = (string) ($config->paths->site ?? '');
			if ($sitePath !== '') {
				return rtrim($sitePath, '/\\') . '/tiptap/';
			}
		}

		return '';
	}

	/**
	 * Discover and normalize project-specific mini-blocks from `./site/tiptap/*.{yaml,yml,php}`.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public static function discoverFromDirectory(string $directory): array
	{
		$trimmedDir = rtrim($directory, '/\\');
		if ($trimmedDir === '' || is_link($trimmedDir) || !is_dir($trimmedDir)) {
			return [];
		}
		$realDir = realpath($trimmedDir);
		if ($realDir === false) {
			return [];
		}
		$realDirPrefix = rtrim($realDir, '/\\') . DIRECTORY_SEPARATOR;

		$files = glob($realDir . '/*.{yaml,yml,php}', GLOB_BRACE) ?: [];
		if ($files === []) {
			return [];
		}
		sort($files, SORT_STRING);

		$validFiles = [];
		$sigParts = [];
		foreach ($files as $file) {
			if (is_link($file) || !is_file($file) || !is_readable($file)) {
				continue;
			}
			$realFile = realpath($file);
			if ($realFile === false || !str_starts_with($realFile, $realDirPrefix)) {
				continue;
			}
			$validFiles[] = $realFile;
			$mtime = filemtime($realFile);
			$sigParts[] = basename($realFile) . ':' . (string) ($mtime !== false ? $mtime : 0);
		}
		if ($validFiles === []) {
			return [];
		}

		$cacheKey = $realDir . '|' . implode(',', $sigParts);
		if (isset(self::$directoryCache[$cacheKey])) {
			return self::$directoryCache[$cacheKey];
		}

		$discovered = [];
		foreach ($validFiles as $file) {
			$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
			$fallbackName = self::sanitizeIdentifier(pathinfo($file, PATHINFO_FILENAME));
			if ($fallbackName === '') {
				continue;
			}

			$raw = null;
			if ($ext === 'php') {
				$loaded = static function (string $__tiptapFile): mixed {
					return include $__tiptapFile;
				};
				$raw = $loaded($file);
			} elseif ($ext === 'yaml' || $ext === 'yml') {
				$contents = file_get_contents($file);
				if (is_string($contents) && trim($contents) !== '') {
					$raw = self::parseYamlString($contents);
				}
			}

			if (!is_array($raw)) {
				continue;
			}

			$normalized = self::normalizeCustomDefinition($raw, $fallbackName);
			if ($normalized !== null) {
				$discovered[$normalized['name']] = $normalized;
			}
		}

		self::$directoryCache[$cacheKey] = $discovered;

		return $discovered;
	}

	/**
	 * Normalize a single custom mini-block array definition.
	 *
	 * @param array<string, mixed> $raw
	 * @return array<string, mixed>|null
	 */
	public static function normalizeCustomDefinition(array $raw, string $fallbackName = ''): ?array
	{
		$rawName = isset($raw['name']) && is_string($raw['name']) && trim($raw['name']) !== ''
			? $raw['name']
			: $fallbackName;
		$name = self::sanitizeIdentifier($rawName);
		if ($name === '' || in_array($name, self::BUILTIN_NAMES, true)) {
			return null;
		}

		$rawTag = isset($raw['tag']) && is_string($raw['tag']) ? strtolower(trim($raw['tag'])) : 'div';
		$tag = in_array($rawTag, self::ALLOWED_CUSTOM_TAGS, true) ? $rawTag : 'div';

		$label = isset($raw['label']) && is_string($raw['label']) && trim($raw['label']) !== ''
			? trim($raw['label'])
			: self::humanizeIdentifier($name);
		$description = isset($raw['description']) && is_string($raw['description'])
			? trim($raw['description'])
			: '';
		$icon = isset($raw['icon']) && is_string($raw['icon']) && trim($raw['icon']) !== ''
			? strtolower(trim($raw['icon']))
			: 'box';
		$editableBody = !empty($raw['editableBody']) || !empty($raw['editable_body']) || !empty($raw['hasBody']);

		$keywords = [$name];
		if (isset($raw['keywords'])) {
			$rawKw = is_array($raw['keywords'])
				? $raw['keywords']
				: (preg_split('/[\s,]+/', (string) $raw['keywords']) ?: []);
			foreach ($rawKw as $kw) {
				$cleanKw = strtolower(trim((string) $kw));
				if ($cleanKw !== '' && !in_array($cleanKw, $keywords, true)) {
					$keywords[] = $cleanKw;
				}
			}
		}

		$fields = [];
		if (isset($raw['fields']) && is_array($raw['fields'])) {
			foreach ($raw['fields'] as $fKey => $fSpec) {
				if (!is_array($fSpec)) {
					continue;
				}
				$candidateName = isset($fSpec['name']) && is_string($fSpec['name']) && trim($fSpec['name']) !== ''
					? $fSpec['name']
					: (is_string($fKey) ? $fKey : '');
				$fieldName = self::sanitizeFieldName($candidateName);
				if ($fieldName === '') {
					continue;
				}

				$rawType = isset($fSpec['type']) && is_string($fSpec['type']) ? strtolower(trim($fSpec['type'])) : 'text';
				$fieldType = match ($rawType) {
					'boolean', 'checkbox', 'switch' => 'toggle',
					'link' => 'url',
					default => in_array($rawType, self::ALLOWED_FIELD_TYPES, true) ? $rawType : 'text',
				};

				$options = [];
				if ($fieldType === 'select' && isset($fSpec['options']) && is_array($fSpec['options'])) {
					$isList = array_is_list($fSpec['options']);
					foreach ($fSpec['options'] as $oKey => $oVal) {
						$optValue = $isList ? trim((string) $oVal) : trim((string) $oKey);
						$optLabel = trim((string) $oVal);
						if ($optValue !== '') {
							$options[$optValue] = $optLabel !== '' ? $optLabel : $optValue;
						}
					}
				}

				$defaultVal = $fSpec['default'] ?? ($fieldType === 'toggle' ? false : '');
				if ($fieldType === 'toggle') {
					$defaultVal = (bool) $defaultVal;
				} elseif ($fieldType === 'select') {
					$defaultStr = is_scalar($defaultVal) ? trim((string) $defaultVal) : '';
					if ($options !== [] && !array_key_exists($defaultStr, $options)) {
						$defaultStr = (string) array_key_first($options);
					}
					$defaultVal = $defaultStr;
				} else {
					$defaultVal = is_scalar($defaultVal) ? (string) $defaultVal : '';
				}

				$kebabProp = str_replace('_', '-', $fieldName);
				$fields[] = [
					'name' => $fieldName,
					'attr' => 'data-prop-' . $kebabProp,
					'type' => $fieldType,
					'label' => isset($fSpec['label']) && is_string($fSpec['label']) && trim($fSpec['label']) !== ''
						? trim($fSpec['label'])
						: self::humanizeIdentifier($fieldName),
					'placeholder' => isset($fSpec['placeholder']) && is_string($fSpec['placeholder'])
						? trim($fSpec['placeholder'])
						: '',
					'required' => !empty($fSpec['required']),
					'default' => $defaultVal,
					'options' => $options,
				];
			}
		}

		return [
			'name' => $name,
			'kind' => 'custom',
			'label' => $label,
			'description' => $description,
			'icon' => $icon,
			'tag' => $tag,
			'editableBody' => $editableBody,
			'keywords' => $keywords,
			'fields' => $fields,
		];
	}

	/**
	 * Merge built-in definitions with raw discovered/hooked map into a normalized catalog.
	 *
	 * @param array<string, mixed> $rawCatalog
	 * @param callable(string): string|null $translate
	 * @return array<string, array<string, mixed>>
	 */
	public static function normalizeCatalog(array $rawCatalog, ?callable $translate = null): array
	{
		$builtins = self::builtInDefinitions($translate);
		$catalog = $builtins;

		foreach ($rawCatalog as $key => $entry) {
			if (!is_array($entry)) {
				continue;
			}
			$candidateName = isset($entry['name']) && is_string($entry['name']) && trim($entry['name']) !== ''
				? self::sanitizeIdentifier($entry['name'])
				: (is_string($key) ? self::sanitizeIdentifier($key) : '');
			if ($candidateName === '') {
				continue;
			}
			if (isset($builtins[$candidateName])) {
				// Allow safe label/description/icon overrides on built-ins without altering structural schema
				$mergedBuiltin = $builtins[$candidateName];
				if (isset($entry['label']) && is_string($entry['label']) && trim($entry['label']) !== '') {
					$mergedBuiltin['label'] = trim($entry['label']);
				}
				if (isset($entry['description']) && is_string($entry['description'])) {
					$mergedBuiltin['description'] = trim($entry['description']);
				}
				if (isset($entry['icon']) && is_string($entry['icon']) && trim($entry['icon']) !== '') {
					$mergedBuiltin['icon'] = strtolower(trim($entry['icon']));
				}
				$catalog[$candidateName] = $mergedBuiltin;
				continue;
			}

			$normalized = self::normalizeCustomDefinition($entry, $candidateName);
			if ($normalized !== null) {
				$catalog[$normalized['name']] = $normalized;
			}
		}

		return $catalog;
	}

	/**
	 * Normalize a field's configured `miniBlocks` selection against the available catalog.
	 * Supports `['*']` or `'*'` / `'all'` to enable every registered mini-block.
	 *
	 * @param mixed $raw
	 * @param array<string, array<string, mixed>> $catalog
	 * @return list<string>
	 */
	public static function normalizeSelection(mixed $raw, array $catalog): array
	{
		if ($raw === null || $raw === false || $raw === '') {
			return [];
		}
		if ($raw === true || $raw === '*' || $raw === 'all') {
			return array_keys($catalog);
		}

		$items = is_string($raw)
			? (preg_split('/[\s,|]+/', trim($raw)) ?: [])
			: (is_array($raw) ? $raw : []);

		$selected = [];
		foreach ($items as $item) {
			$token = strtolower(trim((string) $item));
			if ($token === '' || $token === 'none' || $token === 'false') {
				continue;
			}
			if ($token === '*' || $token === 'all') {
				return array_keys($catalog);
			}
			$clean = self::sanitizeIdentifier($token);
			if ($clean !== '' && isset($catalog[$clean]) && !in_array($clean, $selected, true)) {
				$selected[] = $clean;
			}
		}

		return $selected;
	}

	public static function sanitizeIdentifier(string $raw): string
	{
		$clean = strtolower(trim($raw));
		$clean = (string) preg_replace('/[^a-z0-9_-]+/', '_', $clean);
		$clean = trim($clean, '_-');
		if ($clean === '' || preg_match('/^[a-z][a-z0-9_-]{0,63}$/', $clean) !== 1) {
			return '';
		}

		return $clean;
	}

	public static function sanitizeFieldName(string $raw): string
	{
		$clean = strtolower(trim($raw));
		$clean = str_replace('-', '_', $clean);
		$clean = (string) preg_replace('/[^a-z0-9_]+/', '_', $clean);
		$clean = trim($clean, '_');
		if ($clean === '' || preg_match('/^[a-z][a-z0-9_]{0,47}$/', $clean) !== 1) {
			return '';
		}

		return $clean;
	}

	private static function humanizeIdentifier(string $identifier): string
	{
		return ucwords(str_replace(['_', '-'], ' ', $identifier));
	}

	/**
	 * Parse a declarative YAML string using `Symfony\Component\Yaml\Yaml` when available,
	 * or a lightweight indentation parser for standalone deployments.
	 *
	 * @return array<string, mixed>
	 */
	public static function parseYamlString(string $yaml): array
	{
		$normalized = str_replace(["\r\n", "\r"], "\n", $yaml);
		if (trim($normalized) === '') {
			return [];
		}

		if (class_exists(\Symfony\Component\Yaml\Yaml::class)) {
			try {
				$parsed = \Symfony\Component\Yaml\Yaml::parse($normalized);

				return is_array($parsed) ? $parsed : [];
			} catch (\Throwable) {
				return [];
			}
		}

		if (function_exists('yaml_parse')) {
			$prevHandler = set_error_handler(static fn(): bool => true);
			try {
				$parsed = yaml_parse($normalized);
			} finally {
				restore_error_handler();
			}

			return is_array($parsed) ? $parsed : [];
		}

		$tokens = [];
		foreach (explode("\n", $normalized) as $rawLine) {
			$trimmed = trim($rawLine);
			if ($trimmed === '' || str_starts_with($trimmed, '#') || $trimmed === '---') {
				continue;
			}
			$expanded = str_replace("\t", '  ', $rawLine);
			$indent = strlen($expanded) - strlen(ltrim($expanded, ' '));
			$content = self::stripYamlComment(trim($expanded));
			if ($content !== '') {
				$tokens[] = ['indent' => $indent, 'text' => $content];
			}
		}

		$idx = 0;

		return self::parseYamlTokens($tokens, $idx, 0);
	}

	/**
	 * @param list<array{indent: int, text: string}> $tokens
	 * @return array<mixed>
	 */
	private static function parseYamlTokens(array $tokens, int &$index, int $minIndent): array
	{
		$count = count($tokens);
		if ($index >= $count || $tokens[$index]['indent'] < $minIndent) {
			return [];
		}

		$baseIndent = $tokens[$index]['indent'];
		$isList = str_starts_with($tokens[$index]['text'], '- ') || $tokens[$index]['text'] === '-';
		if ($isList) {
			$list = [];
			while ($index < $count) {
				$tok = $tokens[$index];
				if ($tok['indent'] < $baseIndent) {
					break;
				}
				if ($tok['indent'] > $baseIndent) {
					$index++;
					continue;
				}
				if (!str_starts_with($tok['text'], '- ') && $tok['text'] !== '-') {
					break;
				}
				$itemText = trim(substr($tok['text'], 1));
				$index++;
				if ($itemText === '') {
					$list[] = ($index < $count && $tokens[$index]['indent'] > $baseIndent)
						? self::parseYamlTokens($tokens, $index, $tokens[$index]['indent'])
						: null;
					continue;
				}
				$colon = self::findYamlColon($itemText);
				if ($colon !== null) {
					$k = self::unquoteYaml(trim(substr($itemText, 0, $colon)));
					$vRaw = trim(substr($itemText, $colon + 1));
					$entry = [];
					$entry[$k] = $vRaw === ''
						? (($index < $count && $tokens[$index]['indent'] > $baseIndent)
							? self::parseYamlTokens($tokens, $index, $tokens[$index]['indent'])
							: null)
						: self::parseYamlScalar($vRaw);
					if ($index < $count && $tokens[$index]['indent'] > $baseIndent && !str_starts_with($tokens[$index]['text'], '-')) {
						$extra = self::parseYamlTokens($tokens, $index, $tokens[$index]['indent']);
						$entry = array_replace($entry, $extra);
					}
					$list[] = $entry;
					continue;
				}
				$list[] = self::parseYamlScalar($itemText);
			}

			return $list;
		}

		$map = [];
		while ($index < $count) {
			$tok = $tokens[$index];
			if ($tok['indent'] < $baseIndent) {
				break;
			}
			if ($tok['indent'] > $baseIndent) {
				$index++;
				continue;
			}
			if (str_starts_with($tok['text'], '- ') || $tok['text'] === '-') {
				break;
			}
			$colon = self::findYamlColon($tok['text']);
			if ($colon === null) {
				$index++;
				continue;
			}
			$key = self::unquoteYaml(trim(substr($tok['text'], 0, $colon)));
			$valText = trim(substr($tok['text'], $colon + 1));
			$index++;
			if ($valText === '') {
				$map[$key] = ($index < $count && $tokens[$index]['indent'] > $baseIndent)
					? self::parseYamlTokens($tokens, $index, $tokens[$index]['indent'])
					: [];
			} else {
				$map[$key] = self::parseYamlScalar($valText);
			}
		}

		return $map;
	}

	private static function findYamlColon(string $line): ?int
	{
		$len = strlen($line);
		$inSingle = false;
		$inDouble = false;
		for ($i = 0; $i < $len; $i++) {
			$ch = $line[$i];
			if ($ch === "'" && !$inDouble) {
				$inSingle = !$inSingle;
			} elseif ($ch === '"' && !$inSingle && ($i === 0 || $line[$i - 1] !== '\\')) {
				$inDouble = !$inDouble;
			} elseif ($ch === ':' && !$inSingle && !$inDouble && ($i + 1 === $len || $line[$i + 1] === ' ' || $line[$i + 1] === "\t")) {
				return $i;
			}
		}

		return null;
	}

	private static function stripYamlComment(string $line): string
	{
		$len = strlen($line);
		$inSingle = false;
		$inDouble = false;
		for ($i = 0; $i < $len; $i++) {
			$ch = $line[$i];
			if ($ch === "'" && !$inDouble) {
				$inSingle = !$inSingle;
			} elseif ($ch === '"' && !$inSingle && ($i === 0 || $line[$i - 1] !== '\\')) {
				$inDouble = !$inDouble;
			} elseif ($ch === '#' && !$inSingle && !$inDouble && ($i === 0 || $line[$i - 1] === ' ' || $line[$i - 1] === "\t")) {
				return rtrim(substr($line, 0, $i));
			}
		}

		return $line;
	}

	private static function unquoteYaml(string $value): string
	{
		$len = strlen($value);
		if ($len >= 2) {
			if ($value[0] === "'" && $value[$len - 1] === "'") {
				return str_replace("''", "'", substr($value, 1, -1));
			}
			if ($value[0] === '"' && $value[$len - 1] === '"') {
				return stripcslashes(substr($value, 1, -1));
			}
		}

		return $value;
	}

	private static function parseYamlScalar(string $raw): mixed
	{
		$trimmed = trim($raw);
		if ($trimmed === '') {
			return '';
		}
		$len = strlen($trimmed);
		if ($len >= 2 && (($trimmed[0] === "'" && $trimmed[$len - 1] === "'") || ($trimmed[0] === '"' && $trimmed[$len - 1] === '"'))) {
			return self::unquoteYaml($trimmed);
		}
		if ($trimmed[0] === '[' && $trimmed[$len - 1] === ']') {
			$inner = trim(substr($trimmed, 1, -1));
			if ($inner === '') {
				return [];
			}

			return array_map(static fn(string $p): mixed => self::parseYamlScalar($p), explode(',', $inner));
		}
		$lower = strtolower($trimmed);
		if ($lower === 'true' || $lower === 'yes') {
			return true;
		}
		if ($lower === 'false' || $lower === 'no') {
			return false;
		}
		if ($lower === 'null' || $lower === '~') {
			return null;
		}
		if (preg_match('/^-?\d+$/', $trimmed) === 1) {
			return (int) $trimmed;
		}
		if (preg_match('/^-?\d+\.\d+$/', $trimmed) === 1) {
			return (float) $trimmed;
		}

		return $trimmed;
	}
}
