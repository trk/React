<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Inertia\InputfieldReact;
use Totoglu\React\Support\IslandMarkup;

/**
 * InputfieldReactKeyValue
 *
 * Dual-mode Inertia + React ProcessWire Inputfield (`extends InputfieldReact`) for editing
 * repeatable associative key-value pairs (`array<string, string|int|float|bool>`).
 *
 * @property string $keyLabel Column/field label for keys (default: "Key")
 * @property string $valueLabel Column/field label for values (default: "Value")
 * @property string $keyPlaceholder Optional placeholder for key inputs (falls back to $keyLabel)
 * @property string $valuePlaceholder Optional placeholder for value inputs (falls back to $valueLabel)
 * @property string $addLabel Button label for adding a new row (default: "Add Row")
 * @property string $removeLabel Accessible label template for removing a row (default: "Remove row")
 * @property int $minItems Minimum number of key-value pairs required when populated or required (0 = none)
 * @property int $maxItems Maximum number of key-value pairs allowed (0 = unlimited, capped at HARD_MAX_ITEMS)
 * @property string $keyPattern Optional regular expression pattern validated against each key
 * @property string $keyPatternMessage Optional custom validation error message when $keyPattern fails
 * @property bool $allowEmptyValues Whether empty string values are preserved for non-empty keys (default: true)
 * @property bool $readOnly Whether the editor is rendered in read-only mode
 */
class InputfieldReactKeyValue extends InputfieldReact implements InputfieldHasArrayValue
{
	public const bool INERTIA_IS_KEYVALUE_FIELD = true;
	public const int HARD_MAX_ITEMS = 1000;
	public const int MAX_KEY_LENGTH = 255;
	public const int MAX_VALUE_LENGTH = 16384;
	public const int MAX_JSON_BYTES = 524288;
	public const int MAX_JSON_DEPTH = 16;

	/**
	 * Prototype-pollution keys forbidden across PHP/JS serialization boundaries.
	 *
	 * @var list<string>
	 */
	public const array BLOCKED_KEYS = [
		'__proto__',
		'constructor',
		'prototype',
	];

	public function __construct()
	{
		parent::__construct();
		$this->set('keyLabel', 'Key');
		$this->set('valueLabel', 'Value');
		$this->set('keyPlaceholder', '');
		$this->set('valuePlaceholder', '');
		$this->set('addLabel', 'Add Row');
		$this->set('removeLabel', '');
		$this->set('minItems', 0);
		$this->set('maxItems', 0);
		$this->set('keyPattern', '');
		$this->set('keyPatternMessage', '');
		$this->set('allowEmptyValues', true);
		$this->set('readOnly', false);
		$this->setAttribute('value', []);
	}

	public function inertiaComponent(): string
	{
		return 'InputfieldReactKeyValue';
	}

	/**
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		return React::instance($this)->resolveModuleAssetUrl('InputfieldReactKeyValue.js');
	}

	/**
	 * Determine whether a ProcessWire `Field` is configured to use `InputfieldReactKeyValue`.
	 */
	public static function isKeyValueField(Field $field): bool
	{
		if (!$field->type instanceof FieldtypeText) {
			return false;
		}
		$cls = strtolower(trim((string) ($field->get('inputfieldClass') ?? '')));

		return $cls === 'inputfieldreactkeyvalue';
	}

	/**
	 * Determine whether a raw key string is a forbidden prototype-pollution identifier (`__proto__`, `constructor`, `prototype`).
	 */
	public static function isBlockedKey(string $rawKey): bool
	{
		$clean = preg_replace('/[\x00-\x1F\x7F]+/', '', $rawKey) ?? '';
		$clean = strtolower(trim($clean));

		return $clean !== '' && in_array($clean, self::BLOCKED_KEYS, true);
	}

	/**
	 * Sanitize a single key string (strips C0/DEL control bytes, enforces length cap, and rejects prototype-pollution keys).
	 */
	public static function sanitizeKey(string $rawKey): string
	{
		$clean = preg_replace('/[\x00-\x1F\x7F]+/', '', $rawKey) ?? '';
		$clean = trim($clean);
		if ($clean === '' || self::isBlockedKey($clean)) {
			return '';
		}
		if (mb_strlen($clean, 'UTF-8') > self::MAX_KEY_LENGTH) {
			$clean = mb_substr($clean, 0, self::MAX_KEY_LENGTH, 'UTF-8');
		}

		return $clean;
	}

	/**
	 * Sanitize a single scalar value while preserving booleans and finite numbers when supplied programmatically.
	 */
	public static function sanitizeScalarValue(mixed $rawVal): string|int|float|bool
	{
		if (is_bool($rawVal) || is_int($rawVal)) {
			return $rawVal;
		}
		if (is_float($rawVal)) {
			return is_nan($rawVal) || is_infinite($rawVal) ? '' : $rawVal;
		}
		if (!is_scalar($rawVal) && $rawVal !== null) {
			return '';
		}

		$clean = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/', '', (string) ($rawVal ?? '')) ?? '';
		$clean = trim($clean);
		if (mb_strlen($clean, 'UTF-8') > self::MAX_VALUE_LENGTH) {
			$clean = mb_substr($clean, 0, self::MAX_VALUE_LENGTH, 'UTF-8');
		}

		return $clean;
	}

	/**
	 * Normalize arbitrary input (JSON object/row-array string, `key: value` / `key=value` lines, `\stdClass`,
	 * associative map, or `[['key' => ..., 'value' => ...]]` rows) into a clean associative key-value array.
	 *
	 * Preserves sequential numeric string keys such as `'0' => 'No', '1' => 'Yes'`.
	 *
	 * @return array<string, string|int|float|bool>
	 */
	public static function normalizeValue(mixed $value, bool $allowEmptyValues = true): array
	{
		if ($value instanceof \stdClass) {
			$value = get_object_vars($value);
		}

		if (is_string($value)) {
			$trimmed = trim($value);
			if ($trimmed === '') {
				return [];
			}
			if (strlen($trimmed) > self::MAX_JSON_BYTES) {
				$trimmed = substr($trimmed, 0, self::MAX_JSON_BYTES);
			}
			if (str_starts_with($trimmed, '{') || str_starts_with($trimmed, '[')) {
				$decoded = json_decode($trimmed, true, self::MAX_JSON_DEPTH);
				if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
					return [];
				}
				$value = $decoded;
			} else {
				$pairs = [];
				$lines = preg_split('/\r\n|\r|\n/', $trimmed) ?: [];
				foreach ($lines as $line) {
					if (count($pairs) >= self::HARD_MAX_ITEMS) {
						break;
					}
					$line = trim($line);
					if ($line === '' || str_starts_with($line, '#')) {
						continue;
					}
					$tabPos = strpos($line, "\t");
					$colonPos = strpos($line, ':');
					$eqPos = strpos($line, '=');
					$splitPos = null;
					if ($tabPos !== false) {
						$splitPos = $tabPos;
					} elseif ($colonPos !== false && $eqPos !== false) {
						$splitPos = min($colonPos, $eqPos);
					} elseif ($colonPos !== false) {
						$splitPos = $colonPos;
					} elseif ($eqPos !== false) {
						$splitPos = $eqPos;
					}
					if ($splitPos === null || $splitPos === 0) {
						continue;
					}
					$cleanK = self::sanitizeKey(substr($line, 0, $splitPos));
					if ($cleanK === '') {
						continue;
					}
					$cleanV = self::sanitizeScalarValue(substr($line, $splitPos + 1));
					if (!$allowEmptyValues && $cleanV === '') {
						continue;
					}
					$pairs[$cleanK] = $cleanV;
				}

				return $pairs;
			}
		}

		if (!is_array($value) || $value === []) {
			return [];
		}

		$isRowList = array_is_list($value)
			&& is_array($value[0] ?? null)
			&& (array_key_exists('key', $value[0]) || array_key_exists('k', $value[0]));

		$normalized = [];
		foreach ($value as $k => $v) {
			if (count($normalized) >= self::HARD_MAX_ITEMS) {
				break;
			}

			if ($isRowList || (is_array($v) && (array_key_exists('key', $v) || array_key_exists('k', $v)))) {
				if (!is_array($v)) {
					continue;
				}
				$pairKey = self::sanitizeKey((string) ($v['key'] ?? $v['k'] ?? ''));
				$rawPairVal = $v['value'] ?? $v['val'] ?? $v['v'] ?? '';
				if ($pairKey === '' || !is_scalar($rawPairVal)) {
					continue;
				}
				$cleanPairVal = self::sanitizeScalarValue($rawPairVal);
				if (!$allowEmptyValues && $cleanPairVal === '') {
					continue;
				}
				$normalized[$pairKey] = $cleanPairVal;
				continue;
			}

			$cleanKey = self::sanitizeKey((string) $k);
			if ($cleanKey === '' || (!is_scalar($v) && $v !== null)) {
				continue;
			}
			$cleanVal = self::sanitizeScalarValue($v);
			if (!$allowEmptyValues && $cleanVal === '') {
				continue;
			}
			$normalized[$cleanKey] = $cleanVal;
		}

		return $normalized;
	}

	/**
	 * Encode normalized key-value pairs as a canonical JSON object string (`""` when empty).
	 *
	 * Casts to `(object)` so sequential numeric keys (`'0' => 'No', '1' => 'Yes'`) always serialize
	 * as `'{"0":"No","1":"Yes"}'` rather than a JSON array `'["No","Yes"]'`.
	 */
	public static function encodeJsonObject(mixed $value, bool $allowEmptyValues = true): string
	{
		$map = self::normalizeValue($value, $allowEmptyValues);
		if ($map === []) {
			return '';
		}

		$encoded = json_encode(
			self::toJsonObject($map),
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
		);

		return is_string($encoded) ? $encoded : '';
	}

	/**
	 * Convert normalized key-value pairs into a `\stdClass` instance so `json_encode()` always emits `{}`
	 * when empty and preserves sequential numeric string keys (`"0"`, `"1"`).
	 */
	public static function toJsonObject(mixed $value, bool $allowEmptyValues = true): \stdClass
	{
		$map = self::normalizeValue($value, $allowEmptyValues);
		$obj = new \stdClass();
		foreach ($map as $k => $v) {
			$obj->{(string) $k} = $v;
		}

		return $obj;
	}

	/**
	 * Validate and normalize a PCRE key pattern (accepts bare regex `^[a-z0-9_]+$` or delimited `/^[a-z0-9_]+$/i`),
	 * rejecting malformed PCRE syntax, oversized patterns (`> 512` bytes), and nested-quantifier ReDoS patterns.
	 */
	public static function validateRegexPattern(string $rawPattern): ?string
	{
		$trimmed = trim($rawPattern);
		if ($trimmed === '' || strlen($trimmed) > 512 || str_contains($trimmed, "\0")) {
			return null;
		}

		$body = $trimmed;
		$candidate = $trimmed;
		if (preg_match('/^([\/#~!])(.*)\1([imsxuADSUXJu]*)$/s', $trimmed, $m) === 1) {
			$body = $m[2];
		} else {
			$candidate = '/' . str_replace('/', '\\/', $trimmed) . '/u';
		}

		// Reject nested quantifiers (e.g. `([a-z]+)+`, `(a*)*`, `(a{1,5})+`) to prevent catastrophic ReDoS backtracking
		if (preg_match('/(?:\+|\*|\{[0-9,]+\})\??\s*\)\s*(?:\+|\*|\?|\{[0-9,]+\})/', $body) === 1) {
			return null;
		}

		set_error_handler(static fn (): bool => true);
		try {
			$isValid = preg_match($candidate, '') !== false;
		} finally {
			restore_error_handler();
		}

		return $isValid ? $candidate : null;
	}

	/**
	 * Evaluate a validated delimited key regex with a bounded PCRE backtrack limit (`10000`) to prevent ReDoS.
	 */
	public static function matchesKeyPattern(string $delimitedRegex, string $key): bool
	{
		$prevBacktrack = ini_get('pcre.backtrack_limit');
		ini_set('pcre.backtrack_limit', '10000');
		try {
			$matched = @preg_match($delimitedRegex, $key);
			$err = preg_last_error();
		} finally {
			if (is_string($prevBacktrack) && $prevBacktrack !== '') {
				ini_set('pcre.backtrack_limit', $prevBacktrack);
			}
		}

		return $err === PREG_NO_ERROR && $matched === 1;
	}

	/**
	 * Render clean, entity-escaped HTML markup (`<dl>`) for read-only Admin/Lister/`markupValue()` contexts.
	 */
	public static function renderPairsMarkup(mixed $value, string $property = ''): string
	{
		$map = self::normalizeValue($value);
		if ($property !== '') {
			if ($property === 'count') {
				return (string) count($map);
			}
			if (!array_key_exists($property, $map)) {
				return '';
			}
			$propVal = $map[$property];
			$strVal = is_bool($propVal) ? ($propVal ? '1' : '0') : (string) $propVal;

			return htmlspecialchars($strVal, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
		}

		if ($map === []) {
			return '<span class="pw-kv-empty">&mdash;</span>';
		}

		$html = '<dl class="pw-kv-summary">';
		foreach ($map as $k => $v) {
			$safeK = htmlspecialchars((string) $k, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
			$strV = is_bool($v) ? ($v ? 'true' : 'false') : (string) $v;
			$safeV = htmlspecialchars($strV, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
			$html .= "<div class=\"pw-kv-summary-row\"><dt>{$safeK}</dt><dd>{$safeV}</dd></div>";
		}
		$html .= '</dl>';

		return $html;
	}

	/**
	 * Determine whether this Inputfield is currently attached to a `FieldtypeText` / `FieldtypeTextarea` Page field.
	 */
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
	 * Return the internal normalized associative map (`array<string, string|int|float|bool>`),
	 * independent of `FieldtypeText` JSON string formatting on `getAttribute('value')`.
	 *
	 * @return array<string, string|int|float|bool>
	 */
	public function getNormalizedMap(): array
	{
		$allowEmpty = (bool) ($this->getSetting('allowEmptyValues') ?? true);

		return self::normalizeValue($this->attributes['value'] ?? [], $allowEmpty);
	}

	/**
	 * @param string|array<string, mixed> $key
	 * @param mixed $value
	 */
	public function setAttribute($key, $value): self
	{
		if ($key === 'value') {
			$allowEmpty = (bool) ($this->getSetting('allowEmptyValues') ?? true);
			$value = self::normalizeValue($value, $allowEmpty);
		}

		return parent::setAttribute($key, $value);
	}

	/**
	 * Return canonical JSON object string when persisted directly by `FieldtypeText` / `FieldtypeTextarea`.
	 *
	 * @param string $key
	 */
	public function getAttribute($key): mixed
	{
		if ($key === 'value') {
			$allowEmpty = (bool) ($this->getSetting('allowEmptyValues') ?? true);
			if ($this->isBoundToTextFieldtype()) {
				return self::encodeJsonObject($this->attributes['value'] ?? [], $allowEmpty);
			}

			return self::normalizeValue($this->attributes['value'] ?? [], $allowEmpty);
		}

		return parent::getAttribute($key);
	}

	public function isEmpty(): bool
	{
		return $this->getNormalizedMap() === [];
	}

	protected function serializeValueForProps(mixed $value): mixed
	{
		return $this->getNormalizedMap();
	}

	protected function serializeValueForHiddenInput(mixed $value): string
	{
		$allowEmpty = (bool) ($this->getSetting('allowEmptyValues') ?? true);

		return self::encodeJsonObject($this->getNormalizedMap(), $allowEmpty);
	}

	/**
	 * @return array<string, mixed>
	 */
	public function inertiaWithData(): array
	{
		$rawName = $this->stringAttr('name');
		$rawId = $this->stringAttr('id');
		$inputName = $rawName !== '' ? $rawName : ($rawId !== '' ? $rawId : 'pw_kv');
		$inputId = $rawId !== '' ? $rawId : ('Inputfield_' . $inputName);
		$rawKeyLabel = trim((string) $this->getSetting('keyLabel'));
		$rawValLabel = trim((string) $this->getSetting('valueLabel'));
		$rawKeyPlaceholder = trim((string) $this->getSetting('keyPlaceholder'));
		$rawValPlaceholder = trim((string) $this->getSetting('valuePlaceholder'));
		$rawAddLabel = trim((string) $this->getSetting('addLabel'));
		$rawRemoveLabel = trim((string) $this->getSetting('removeLabel'));
		$rawKeyPattern = trim((string) $this->getSetting('keyPattern'));
		$rawKeyPatternMsg = trim((string) $this->getSetting('keyPatternMessage'));

		$resolvedKeyLabel = $rawKeyLabel !== '' && $rawKeyLabel !== 'Key' ? $rawKeyLabel : $this->_('Key');
		$resolvedValLabel = $rawValLabel !== '' && $rawValLabel !== 'Value' ? $rawValLabel : $this->_('Value');
		$resolvedAddLabel = $rawAddLabel !== '' && $rawAddLabel !== 'Add Row' ? $rawAddLabel : $this->_('Add Row');
		$resolvedRemoveLabel = $rawRemoveLabel !== '' ? $rawRemoveLabel : $this->_('Remove row');

		$kvPairs = $this->getNormalizedMap();
		$rows = [];
		foreach ($kvPairs as $k => $v) {
			$rows[] = [
				'key' => (string) $k,
				'value' => is_bool($v) ? ($v ? '1' : '0') : (string) $v,
			];
		}

		return [
			'id' => $inputId,
			'name' => $inputName,
			'keyLabel' => $resolvedKeyLabel,
			'valueLabel' => $resolvedValLabel,
			'keyPlaceholder' => $rawKeyPlaceholder !== '' ? $rawKeyPlaceholder : $resolvedKeyLabel,
			'valuePlaceholder' => $rawValPlaceholder !== '' ? $rawValPlaceholder : $resolvedValLabel,
			'addLabel' => $resolvedAddLabel,
			'removeLabel' => $resolvedRemoveLabel,
			'minItems' => max(0, (int) $this->getSetting('minItems')),
			'maxItems' => max(0, min(self::HARD_MAX_ITEMS, (int) $this->getSetting('maxItems'))),
			'keyPattern' => $rawKeyPattern !== '' ? $rawKeyPattern : null,
			'keyPatternMessage' => $rawKeyPatternMsg !== '' ? $rawKeyPatternMsg : null,
			'allowEmptyValues' => (bool) ($this->getSetting('allowEmptyValues') ?? true),
			'readOnly' => $this->isEffectivelyReadOnly(),
			'rows' => $rows,
			'value' => $kvPairs,
		];
	}

	/**
	 * Render read-only Inertia island with clean server-rendered `<dl>` fallback inside the mount node.
	 */
	public function ___renderValue(): string
	{
		$inertia = $this->inertia();
		$data = Inertia::withoutEntityEncoding(function () use ($inertia): array {
			$payload = $inertia->resolver->resolveValue($this->toInertiaProp());

			return is_array($payload) ? $payload : $this->toInertiaProp();
		});
		$data['readOnly'] = true;
		if (isset($data['props']) && is_array($data['props'])) {
			$data['props']['readOnly'] = true;
		}

		$component = is_string($data['component'] ?? null) ? $data['component'] : $this->inertiaComponent();
		return IslandMarkup::render($component, $data, [
			'class' => 'pw-inertia-inputfield-island',
			'data-readonly' => 'true',
		], self::renderPairsMarkup($this->getNormalizedMap()));
	}

	/**
	 * Process submitted key-value arrays (`{name}_key[]` and `{name}_val[]`, JSON string `{name}`, or direct array `{name}`).
	 */
	public function ___processInput(WireInputData $input): self
	{
		if ($this->isInputProcessingLocked()) {
			return $this;
		}

		$name = $this->stringAttr('name');
		if ($name === '') {
			return $this;
		}

		$hasPresentFlag = $input["{$name}_present"] !== null;
		$hasKeyArray = is_array($input["{$name}_key"]);
		$hasDirectInput = $input[$name] !== null;

		if (!$hasPresentFlag && !$hasKeyArray && !$hasDirectInput) {
			return $this;
		}

		$allowEmpty = (bool) ($this->getSetting('allowEmptyValues') ?? true);
		$duplicateKeys = [];
		$blockedKeysFound = [];
		$kv = [];

		if ($hasKeyArray) {
			$rawKeys = array_slice($input["{$name}_key"], 0, self::HARD_MAX_ITEMS, true);
			$rawVals = is_array($input["{$name}_val"]) ? $input["{$name}_val"] : [];
			foreach ($rawKeys as $idx => $rawK) {
				$trimmedRawK = trim(preg_replace('/[\x00-\x1F\x7F]+/', '', (string) $rawK) ?? '');
				if ($trimmedRawK === '') {
					continue;
				}
				if (self::isBlockedKey($trimmedRawK)) {
					$blockedKeysFound[$trimmedRawK] = true;
					continue;
				}
				$cleanK = self::sanitizeKey($trimmedRawK);
				if ($cleanK === '') {
					continue;
				}
				if (array_key_exists($cleanK, $kv)) {
					$duplicateKeys[$cleanK] = true;
				}
				$cleanV = self::sanitizeScalarValue((string) ($rawVals[$idx] ?? ''));
				if (!$allowEmpty && $cleanV === '') {
					continue;
				}
				$kv[$cleanK] = $cleanV;
			}
		} elseif ($hasPresentFlag) {
			// Form rendered KeyValueFieldControl with `_present=1` and zero `_key[]` inputs (unless JSON array map was posted directly)
			if (is_array($input[$name]) || $input[$name] instanceof \stdClass) {
				$rawPostedMap = $input[$name] instanceof \stdClass ? get_object_vars($input[$name]) : $input[$name];
				foreach ($rawPostedMap as $rk => $rv) {
					if (is_array($rv) && (array_key_exists('key', $rv) || array_key_exists('k', $rv))) {
						$candK = (string) ($rv['key'] ?? $rv['k'] ?? '');
						if (self::isBlockedKey($candK)) {
							$blockedKeysFound[trim($candK)] = true;
						}
					} elseif (is_string($rk) && self::isBlockedKey($rk)) {
						$blockedKeysFound[trim($rk)] = true;
					}
				}
				$kv = self::normalizeValue($input[$name], $allowEmpty);
			} else {
				$kv = [];
			}
		} else {
			$rawDirect = $input[$name];
			if (is_string($rawDirect)) {
				$trimmedDirect = trim($rawDirect);
				if (str_starts_with($trimmedDirect, '{') && strlen($trimmedDirect) <= self::MAX_JSON_BYTES) {
					foreach (self::BLOCKED_KEYS as $forbidden) {
						if (preg_match('/"' . preg_quote($forbidden, '/') . '"\s*:/i', $trimmedDirect) === 1) {
							$blockedKeysFound[$forbidden] = true;
						}
					}
				}
			} elseif (is_array($rawDirect) || $rawDirect instanceof \stdClass) {
				$rawDirectArr = $rawDirect instanceof \stdClass ? get_object_vars($rawDirect) : $rawDirect;
				foreach ($rawDirectArr as $rk => $rv) {
					if (is_array($rv) && (array_key_exists('key', $rv) || array_key_exists('k', $rv))) {
						$candK = (string) ($rv['key'] ?? $rv['k'] ?? '');
						if (self::isBlockedKey($candK)) {
							$blockedKeysFound[trim($candK)] = true;
						}
					} elseif (is_string($rk) && self::isBlockedKey($rk)) {
						$blockedKeysFound[trim($rk)] = true;
					}
				}
			}
			$kv = self::normalizeValue($rawDirect, $allowEmpty);
		}

		if ($blockedKeysFound !== []) {
			$this->error(sprintf(
				$this->_('Reserved key name(s) are not allowed: %s'),
				implode(', ', array_keys($blockedKeysFound))
			));
		}

		if ($duplicateKeys !== []) {
			$this->error(sprintf(
				$this->_('Duplicate key(s) detected: %s. Each key must be unique.'),
				implode(', ', array_keys($duplicateKeys))
			));
		}

		$rawPattern = trim((string) $this->getSetting('keyPattern'));
		if ($rawPattern !== '') {
			$delimitedRegex = self::validateRegexPattern($rawPattern);
			if ($delimitedRegex === null) {
				$this->error($this->_('Invalid key format pattern configured.'));
			} elseif ($kv !== []) {
				$invalidKeys = [];
				foreach (array_keys($kv) as $k) {
					if (!self::matchesKeyPattern($delimitedRegex, (string) $k)) {
						$invalidKeys[] = (string) $k;
					}
				}
				if ($invalidKeys !== []) {
					$customMsg = trim((string) $this->getSetting('keyPatternMessage'));
					$this->error(
						$customMsg !== ''
							? $customMsg
							: sprintf(
								$this->_('Invalid key format for: %s'),
								implode(', ', $invalidKeys)
							)
					);
				}
			}
		}

		$maxItems = max(0, min(self::HARD_MAX_ITEMS, (int) $this->getSetting('maxItems')));
		if ($maxItems > 0 && count($kv) > $maxItems) {
			$this->error(sprintf(
				$this->_('Maximum of %d key-value pair(s) allowed.'),
				$maxItems
			));
			$kv = array_slice($kv, 0, $maxItems, true);
		}

		$minItems = max(0, (int) $this->getSetting('minItems'));
		$isRequired = (bool) $this->getSetting('required');
		if ($minItems > 0 && ($kv !== [] || $isRequired) && count($kv) < $minItems) {
			$this->error(sprintf(
				$this->_('At least %d key-value pair(s) required.'),
				$minItems
			));
		}

		$previous = $this->getNormalizedMap();
		if ($kv !== $previous) {
			if (!$this->trackChanges()) {
				$this->setTrackChanges(true);
			}
			$this->setAttribute('value', $kv);
			$this->trackChange('value', $previous, $kv);
		}

		return $this;
	}

	/**
	 * Standalone configuration fields when configuring InputfieldReactKeyValue in ProcessWire admin.
	 */
	public function ___getConfigInputfields(): InputfieldWrapper
	{
		$inputfields = parent::___getConfigInputfields();
		$modules = $this->wire()->modules;

		/** @var InputfieldText|null $keyLabelField */
		$keyLabelField = $modules->get('InputfieldText');
		if ($keyLabelField) {
			$keyLabelField->attr('name', 'keyLabel');
			$keyLabelField->label = $this->_('Key Column Label');
			$keyLabelField->val((string) $this->getSetting('keyLabel'));
			$keyLabelField->columnWidth = 25;
			$inputfields->add($keyLabelField);
		}

		/** @var InputfieldText|null $valLabelField */
		$valLabelField = $modules->get('InputfieldText');
		if ($valLabelField) {
			$valLabelField->attr('name', 'valueLabel');
			$valLabelField->label = $this->_('Value Column Label');
			$valLabelField->val((string) $this->getSetting('valueLabel'));
			$valLabelField->columnWidth = 25;
			$inputfields->add($valLabelField);
		}

		/** @var InputfieldText|null $keyPlaceholderField */
		$keyPlaceholderField = $modules->get('InputfieldText');
		if ($keyPlaceholderField) {
			$keyPlaceholderField->attr('name', 'keyPlaceholder');
			$keyPlaceholderField->label = $this->_('Key Input Placeholder');
			$keyPlaceholderField->val((string) $this->getSetting('keyPlaceholder'));
			$keyPlaceholderField->columnWidth = 25;
			$inputfields->add($keyPlaceholderField);
		}

		/** @var InputfieldText|null $valPlaceholderField */
		$valPlaceholderField = $modules->get('InputfieldText');
		if ($valPlaceholderField) {
			$valPlaceholderField->attr('name', 'valuePlaceholder');
			$valPlaceholderField->label = $this->_('Value Input Placeholder');
			$valPlaceholderField->val((string) $this->getSetting('valuePlaceholder'));
			$valPlaceholderField->columnWidth = 25;
			$inputfields->add($valPlaceholderField);
		}

		/** @var InputfieldText|null $addLabelField */
		$addLabelField = $modules->get('InputfieldText');
		if ($addLabelField) {
			$addLabelField->attr('name', 'addLabel');
			$addLabelField->label = $this->_('Add Row Button Label');
			$addLabelField->val((string) $this->getSetting('addLabel'));
			$addLabelField->columnWidth = 25;
			$inputfields->add($addLabelField);
		}

		/** @var InputfieldText|null $removeLabelField */
		$removeLabelField = $modules->get('InputfieldText');
		if ($removeLabelField) {
			$removeLabelField->attr('name', 'removeLabel');
			$removeLabelField->label = $this->_('Remove Row Button Label');
			$removeLabelField->val((string) $this->getSetting('removeLabel'));
			$removeLabelField->columnWidth = 25;
			$inputfields->add($removeLabelField);
		}

		/** @var InputfieldInteger|null $minItemsField */
		$minItemsField = $modules->get('InputfieldInteger');
		if ($minItemsField) {
			$minItemsField->attr('name', 'minItems');
			$minItemsField->label = $this->_('Minimum Pairs (0 = Optional)');
			$minItemsField->val((int) $this->getSetting('minItems'));
			$minItemsField->columnWidth = 25;
			$inputfields->add($minItemsField);
		}

		/** @var InputfieldInteger|null $maxItemsField */
		$maxItemsField = $modules->get('InputfieldInteger');
		if ($maxItemsField) {
			$maxItemsField->attr('name', 'maxItems');
			$maxItemsField->label = $this->_('Maximum Pairs (0 = Unlimited)');
			$maxItemsField->val((int) $this->getSetting('maxItems'));
			$maxItemsField->columnWidth = 25;
			$inputfields->add($maxItemsField);
		}

		/** @var InputfieldText|null $keyPatternField */
		$keyPatternField = $modules->get('InputfieldText');
		if ($keyPatternField) {
			$keyPatternField->attr('name', 'keyPattern');
			$keyPatternField->label = $this->_('Allowed Key Format');
			$keyPatternField->description = $this->_('Optional pattern that every key name must match (e.g. ^[a-z0-9_]+$).');
			$keyPatternField->val((string) $this->getSetting('keyPattern'));
			$keyPatternField->columnWidth = 50;
			$inputfields->add($keyPatternField);
		}

		/** @var InputfieldText|null $keyPatternMsgField */
		$keyPatternMsgField = $modules->get('InputfieldText');
		if ($keyPatternMsgField) {
			$keyPatternMsgField->attr('name', 'keyPatternMessage');
			$keyPatternMsgField->label = $this->_('Key Pattern Error Message');
			$keyPatternMsgField->val((string) $this->getSetting('keyPatternMessage'));
			$keyPatternMsgField->columnWidth = 50;
			$inputfields->add($keyPatternMsgField);
		}

		/** @var InputfieldCheckbox|null $allowEmptyField */
		$allowEmptyField = $modules->get('InputfieldCheckbox');
		if ($allowEmptyField) {
			$allowEmptyField->attr('name', 'allowEmptyValues');
			$allowEmptyField->label = $this->_('Allow Empty Values');
			$allowEmptyField->description = $this->_('Keep keys whose value is left blank instead of omitting them.');
			$allowEmptyField->attr('checked', (bool) ($this->getSetting('allowEmptyValues') ?? true) ? 'checked' : '');
			$inputfields->add($allowEmptyField);
		}

		return $inputfields;
	}

	/**
	 * Allow overriding key-value editor settings per-template context.
	 *
	 * @param Field $field
	 * @return array<int, string>
	 */
	public function ___getConfigAllowContext($field): array
	{
		return array_merge(parent::___getConfigAllowContext($field), [
			'keyLabel',
			'valueLabel',
			'keyPlaceholder',
			'valuePlaceholder',
			'addLabel',
			'removeLabel',
			'minItems',
			'maxItems',
			'keyPattern',
			'keyPatternMessage',
			'allowEmptyValues',
		]);
	}
}
