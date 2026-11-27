<?php

declare(strict_types=1);

namespace Totoglu\React\Condition;

use Totoglu\React\Support\IntlCatalog;

/**
 * Canonical sanitizer, flattener, normalizer, and summary formatter for 2-level
 * `condition_builder` rule trees (`{ match, groups: [{ id, match, negate?, rules }] }`).
 */
final class ConditionNormalizer
{
	public const int MAX_JSON_BYTES = 262144;
	public const int MAX_JSON_DEPTH = 16;
	public const int MAX_GROUPS = 50;
	public const int MAX_RULES_PER_GROUP = 100;

	/** @var list<string> */
	public const array ALLOWED_FIELD_TYPES = [
		'text',
		'number',
		'select',
		'boolean',
		'country',
		'currency',
		'date',
	];

	/** @var list<string> */
	public const array UNARY_OPERATORS = [
		'is_empty',
		'is_not_empty',
		'is_true',
		'is_false',
	];

	/** @var array<string, list<string>> */
	public const array DEFAULT_OPERATORS_BY_TYPE = [
		'text' => ['eq', 'neq', 'contains', 'not_contains', 'starts_with', 'ends_with', 'in', 'not_in', 'is_empty', 'is_not_empty'],
		'number' => ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in', 'is_empty', 'is_not_empty'],
		'select' => ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
		'boolean' => ['is_true', 'is_false'],
		'country' => ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
		'currency' => ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
		'date' => ['eq', 'neq', 'before', 'on_or_before', 'after', 'on_or_after', 'between', 'is_empty', 'is_not_empty'],
	];

	/** @var array<string, string> */
	private const array SYMBOL_OPERATOR_MAP = [
		'=' => 'eq',
		'!=' => 'neq',
		'*=' => 'contains',
		'!*=' => 'not_contains',
		'^=' => 'starts_with',
		'$=' => 'ends_with',
		'>=' => 'gte',
		'<=' => 'lte',
		'>' => 'gt',
		'<' => 'lt',
	];

	/** @var array<string, string> */
	private const array OPERATOR_LABELS = [
		'eq' => 'Equals',
		'neq' => 'Does not equal',
		'contains' => 'Contains',
		'not_contains' => 'Does not contain',
		'starts_with' => 'Starts with',
		'ends_with' => 'Ends with',
		'gt' => 'Greater than',
		'gte' => 'Greater than or equal',
		'lt' => 'Less than',
		'lte' => 'Less than or equal',
		'between' => 'Between',
		'in' => 'Is one of',
		'not_in' => 'Is not one of',
		'before' => 'Before',
		'on_or_before' => 'On or before',
		'after' => 'After',
		'on_or_after' => 'On or after',
		'is_true' => 'Is true',
		'is_false' => 'Is false',
		'is_empty' => 'Is empty',
		'is_not_empty' => 'Is not empty',
	];

	/**
	 * Parse a flat string condition expression (`name=ali,surname=veli;tier=vip`) into a
	 * ConditionBuilder tree, or return `null` when the string is not a valid expression.
	 *
	 * @return array{match: string, groups: list<array{id: string, match: string, rules: list<array<string, mixed>>}>}|null
	 */
	public static function parseFlatExpression(string $expr): ?array
	{
		$orGroupsRaw = preg_split('/\s*;\s*/', trim($expr)) ?: [];
		$groups = [];
		$gIdx = 0;
		$totalRules = 0;

		foreach ($orGroupsRaw as $groupStr) {
			$cleanGroup = trim((string) $groupStr);
			if ($cleanGroup === '') {
				continue;
			}
			$clauses = preg_split('/\s*,\s*/', $cleanGroup) ?: [];
			$gIdx++;
			$rules = [];
			$rIdx = 0;

			foreach ($clauses as $clause) {
				$cleanClause = trim((string) $clause);
				if ($cleanClause === '') {
					continue;
				}
				if (preg_match('/^([a-zA-Z0-9_.]+)\s*(!\*=|!=|\*=|\^=|\$=|>=|<=|=|>|<)\s*(.*)$/', $cleanClause, $m) !== 1) {
					return null;
				}
				$rIdx++;
				$totalRules++;
				$fieldKey = $m[1];
				$sym = $m[2];
				$rawExp = trim($m[3]);
				if (strlen($rawExp) >= 2 && (($rawExp[0] === '"' && $rawExp[-1] === '"') || ($rawExp[0] === "'" && $rawExp[-1] === "'"))) {
					$rawExp = substr($rawExp, 1, -1);
				}

				$operator = self::SYMBOL_OPERATOR_MAP[$sym];
				$value = $rawExp;
				$valueSource = null;

				if ($sym === '=' && strtolower($rawExp) === 'empty') {
					$operator = 'is_empty';
					$value = null;
				} elseif ($sym === '!=' && strtolower($rawExp) === 'empty') {
					$operator = 'is_not_empty';
					$value = null;
				} elseif (preg_match('/^\{([a-zA-Z0-9_.]+)\}$/', $rawExp, $refMatch) === 1) {
					$valueSource = 'field';
					$value = $refMatch[1];
				} elseif (($sym === '=' || $sym === '!=') && str_contains($rawExp, '|')) {
					$pipeTokens = array_values(array_filter(
						array_map('trim', explode('|', $rawExp)),
						static fn(string $token): bool => $token !== '',
					));
					if (count($pipeTokens) >= 2) {
						$operator = $sym === '=' ? 'in' : 'not_in';
						$value = $pipeTokens;
					}
				}

				$rule = [
					'id' => 'rule_' . $gIdx . '_' . $rIdx,
					'field' => $fieldKey,
					'operator' => $operator,
					'value' => $value,
				];
				if ($valueSource === 'field') {
					$rule['valueSource'] = 'field';
				}
				$rules[] = $rule;
			}

			if ($rules !== []) {
				$groups[] = [
					'id' => 'grp_' . $gIdx,
					'match' => 'all',
					'rules' => $rules,
				];
			}
		}

		if ($totalRules === 0 || $groups === []) {
			return null;
		}

		return [
			'match' => count($groups) > 1 ? 'any' : 'all',
			'groups' => $groups,
		];
	}

	/**
	 * Normalize a condition builder rule tree into `{match: 'all'|'any', groups: [...]}`.
	 *
	 * @return array{match: string, groups: list<array<string, mixed>>}
	 */
	public static function normalizeTree(mixed $raw): array
	{
		if ($raw instanceof \stdClass) {
			$raw = self::objectToArrayRecursive($raw);
		} elseif (is_string($raw)) {
			$trimmed = trim($raw);
			if ($trimmed === '' || $trimmed === '[]') {
				$raw = [];
			} elseif (strlen($trimmed) > self::MAX_JSON_BYTES) {
				$raw = [];
			} elseif (str_starts_with($trimmed, '{')) {
				$decoded = json_decode($trimmed, true, self::MAX_JSON_DEPTH);
				$raw = json_last_error() === JSON_ERROR_NONE && is_array($decoded) ? $decoded : [];
			} else {
				$raw = self::parseFlatExpression($trimmed) ?? [];
			}
		}

		if (!is_array($raw)) {
			return [
				'match' => 'all',
				'groups' => [],
			];
		}

		$rootMatch = is_string($raw['match'] ?? null) && strtolower(trim($raw['match'])) === 'any'
			? 'any'
			: 'all';
		$rawGroups = is_array($raw['groups'] ?? null) ? $raw['groups'] : [];
		$groups = [];
		$gIdx = 0;

		foreach ($rawGroups as $rawGroup) {
			if ($rawGroup instanceof \stdClass) {
				$rawGroup = self::objectToArrayRecursive($rawGroup);
			}
			if (!is_array($rawGroup)) {
				continue;
			}
			$gIdx++;
			if ($gIdx > self::MAX_GROUPS) {
				break;
			}
			$groupId = is_string($rawGroup['id'] ?? null) && trim($rawGroup['id']) !== ''
				? trim($rawGroup['id'])
				: 'grp_' . $gIdx;
			$groupMatch = is_string($rawGroup['match'] ?? null) && strtolower(trim($rawGroup['match'])) === 'any'
				? 'any'
				: 'all';
			$rawRules = is_array($rawGroup['rules'] ?? null) ? $rawGroup['rules'] : [];
			$rules = [];
			$rIdx = 0;

			foreach ($rawRules as $rawRule) {
				if ($rawRule instanceof \stdClass) {
					$rawRule = self::objectToArrayRecursive($rawRule);
				}
				if (!is_array($rawRule)) {
					continue;
				}
				$rIdx++;
				if ($rIdx > self::MAX_RULES_PER_GROUP) {
					break;
				}
				$ruleId = is_string($rawRule['id'] ?? null) && trim($rawRule['id']) !== ''
					? trim($rawRule['id'])
					: 'rule_' . $gIdx . '_' . $rIdx;
				$fieldKey = is_scalar($rawRule['field'] ?? null) ? trim((string) $rawRule['field']) : '';
				$operator = is_scalar($rawRule['operator'] ?? null) && trim((string) $rawRule['operator']) !== ''
					? trim((string) $rawRule['operator'])
					: 'eq';
				$ruleOut = [
					'id' => $ruleId,
					'field' => $fieldKey,
					'operator' => $operator,
					'value' => array_key_exists('value', $rawRule) ? $rawRule['value'] : null,
				];
				if (isset($rawRule['valueSource']) && is_string($rawRule['valueSource']) && strtolower(trim($rawRule['valueSource'])) === 'field') {
					$ruleOut['valueSource'] = 'field';
				}
				$rules[] = $ruleOut;
			}

			$groupOut = [
				'id' => $groupId,
				'match' => $groupMatch,
				'rules' => $rules,
			];
			if (!empty($rawGroup['negate'])) {
				$groupOut['negate'] = true;
			}
			$groups[] = $groupOut;
		}

		return [
			'match' => $rootMatch,
			'groups' => $groups,
		];
	}

	/**
	 * Count total rules across all groups in a tree.
	 */
	public static function countRules(mixed $raw): int
	{
		$tree = self::normalizeTree($raw);
		$total = 0;
		foreach ($tree['groups'] as $group) {
			if (is_array($group['rules'] ?? null)) {
				$total += count($group['rules']);
			}
		}

		return $total;
	}

	/**
	 * Determine whether a condition tree contains zero rules.
	 */
	public static function isEmptyTree(mixed $raw): bool
	{
		return self::countRules($raw) === 0;
	}

	/**
	 * Encode a normalized condition tree as canonical JSON (`""` when no rules are configured).
	 */
	public static function encodeTree(mixed $raw): string
	{
		$tree = self::normalizeTree($raw);
		if (self::isEmptyTree($tree)) {
			return '';
		}

		$encoded = json_encode($tree, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

		return is_string($encoded) ? $encoded : '';
	}

	/**
	 * Normalize declarative `conditionFields` definitions for `condition_builder` controls.
	 *
	 * @return list<array<string, mixed>>
	 */
	public static function normalizeFieldSpecs(mixed $rawFields): array
	{
		if ($rawFields instanceof \stdClass) {
			$rawFields = self::objectToArrayRecursive($rawFields);
		} elseif (is_string($rawFields)) {
			$trimmed = trim($rawFields);
			if ($trimmed === '' || strlen($trimmed) > self::MAX_JSON_BYTES) {
				return [];
			}
			$decoded = json_decode($trimmed, true, self::MAX_JSON_DEPTH);
			$rawFields = json_last_error() === JSON_ERROR_NONE && is_array($decoded) ? $decoded : [];
		}

		if (!is_array($rawFields)) {
			return [];
		}

		$seenKeys = [];
		$normalized = [];

		foreach ($rawFields as $entry) {
			if ($entry instanceof \stdClass) {
				$entry = self::objectToArrayRecursive($entry);
			}
			if (!is_array($entry)) {
				continue;
			}
			$key = is_scalar($entry['key'] ?? null) ? trim((string) $entry['key']) : '';
			if ($key === '' || isset($seenKeys[$key])) {
				continue;
			}
			$seenKeys[$key] = true;

			$label = is_scalar($entry['label'] ?? null) && trim((string) $entry['label']) !== ''
				? trim((string) $entry['label'])
				: $key;
			$rawType = is_scalar($entry['type'] ?? null) ? strtolower(trim((string) $entry['type'])) : 'text';
			$type = in_array($rawType, self::ALLOWED_FIELD_TYPES, true) ? $rawType : 'text';

			$spec = [
				'key' => $key,
				'label' => $label,
				'type' => $type,
			];

			if (is_scalar($entry['group'] ?? null) && trim((string) $entry['group']) !== '') {
				$spec['group'] = trim((string) $entry['group']);
			}
			if (is_scalar($entry['icon'] ?? null) && trim((string) $entry['icon']) !== '') {
				$spec['icon'] = trim((string) $entry['icon']);
			}
			if (is_scalar($entry['description'] ?? null) && trim((string) $entry['description']) !== '') {
				$spec['description'] = trim((string) $entry['description']);
			}
			if (is_scalar($entry['placeholder'] ?? null) && trim((string) $entry['placeholder']) !== '') {
				$spec['placeholder'] = trim((string) $entry['placeholder']);
			}

			if (isset($entry['options']) && is_array($entry['options'])) {
				$opts = self::normalizeOptionItems($entry['options']);
				if ($opts !== []) {
					$spec['options'] = $opts;
				}
			} elseif ($type === 'country') {
				$spec['options'] = self::normalizeOptionItems(IntlCatalog::countryOptions());
			} elseif ($type === 'currency') {
				$spec['options'] = self::normalizeOptionItems(IntlCatalog::currencyOptions());
			}

			if (isset($entry['operators']) && is_array($entry['operators'])) {
				$ops = self::normalizeStringList($entry['operators']);
				if ($ops !== []) {
					$spec['operators'] = $ops;
				}
			}

			if (!empty($entry['sourceOnly'])) {
				$spec['sourceOnly'] = true;
			}
			if (!empty($entry['targetOnly'])) {
				$spec['targetOnly'] = true;
			}
			if (!empty($entry['allowCustomValue'])) {
				$spec['allowCustomValue'] = true;
			}
			if (isset($entry['comparableTypes']) && is_array($entry['comparableTypes'])) {
				$compTypes = [];
				foreach ($entry['comparableTypes'] as $ct) {
					if (!is_scalar($ct)) {
						continue;
					}
					$cleanCt = strtolower(trim((string) $ct));
					if (in_array($cleanCt, self::ALLOWED_FIELD_TYPES, true) && !in_array($cleanCt, $compTypes, true)) {
						$compTypes[] = $cleanCt;
					}
				}
				if ($compTypes !== []) {
					$spec['comparableTypes'] = $compTypes;
				}
			}

			$normalized[] = $spec;
		}

		return $normalized;
	}

	/**
	 * Serialize a canonical 2-level condition tree back into a flat expression string
	 * (`a=1, b>=2; c=3`), or return `null` when the tree uses constructs that cannot be
	 * represented losslessly (e.g. `negate`, OR inside an AND root, or `between`).
	 */
	public static function serializeFlatExpression(mixed $rawTree): ?string
	{
		$tree = self::normalizeTree($rawTree);
		$groups = $tree['groups'];
		if ($groups === []) {
			return '';
		}

		$reverseSymbolMap = array_flip(self::SYMBOL_OPERATOR_MAP);
		$reverseSymbolMap['after'] = '>';
		$reverseSymbolMap['on_or_after'] = '>=';
		$reverseSymbolMap['before'] = '<';
		$reverseSymbolMap['on_or_before'] = '<=';

		$serializeRule = static function (array $rule) use ($reverseSymbolMap): ?string {
			$field = is_scalar($rule['field'] ?? null) ? trim((string) $rule['field']) : '';
			if ($field === '' || preg_match('/^[a-zA-Z0-9_.]+$/', $field) !== 1) {
				return null;
			}
			$op = is_scalar($rule['operator'] ?? null) ? strtolower(trim((string) $rule['operator'])) : 'eq';
			$isFieldSource = ($rule['valueSource'] ?? null) === 'field';
			$rawValue = $rule['value'] ?? null;

			if ($op === 'is_empty') {
				return $field . '=empty';
			}
			if ($op === 'is_not_empty') {
				return $field . '!=empty';
			}
			if ($op === 'is_true') {
				return $field . '=1';
			}
			if ($op === 'is_false') {
				return $field . '=0';
			}
			if ($op === 'in' || $op === 'not_in') {
				$sym = $op === 'in' ? '=' : '!=';
				if ($isFieldSource) {
					$target = is_scalar($rawValue) ? trim((string) $rawValue) : '';
					return $target !== '' && preg_match('/^[a-zA-Z0-9_.]+$/', $target) === 1
						? $field . $sym . '{' . $target . '}'
						: null;
				}
				if (!is_array($rawValue) || $rawValue === []) {
					return null;
				}
				$tokens = [];
				foreach ($rawValue as $item) {
					if (!is_scalar($item)) {
						return null;
					}
					$tok = trim((string) $item);
					if ($tok === '' || strpbrk($tok, "|,;\"") !== false) {
						return null;
					}
					$tokens[] = $tok;
				}

				return $field . $sym . implode('|', $tokens);
			}

			$sym = $reverseSymbolMap[$op] ?? null;
			if (!is_string($sym)) {
				return null;
			}

			if ($isFieldSource) {
				$target = is_scalar($rawValue) ? trim((string) $rawValue) : '';
				return $target !== '' && preg_match('/^[a-zA-Z0-9_.]+$/', $target) === 1
					? $field . $sym . '{' . $target . '}'
					: null;
			}

			if (!is_scalar($rawValue) && $rawValue !== null) {
				return null;
			}
			$strVal = $rawValue === null ? '' : (is_bool($rawValue) ? ($rawValue ? '1' : '0') : (string) $rawValue);
			if (strpbrk($strVal, ",;\"") !== false) {
				return null;
			}
			$needsQuotes = $strVal === ''
				|| trim($strVal) !== $strVal
				|| (($sym === '=' || $sym === '!=') && strtolower($strVal) === 'empty');

			return $field . $sym . ($needsQuotes ? '"' . $strVal . '"' : $strVal);
		};

		if ($tree['match'] === 'all') {
			$clauses = [];
			foreach ($groups as $group) {
				if (!empty($group['negate'])) {
					return null;
				}
				$rules = is_array($group['rules'] ?? null) ? $group['rules'] : [];
				if (($group['match'] ?? 'all') === 'any' && count($rules) > 1) {
					return null;
				}
				foreach ($rules as $rule) {
					$encodedRule = is_array($rule) ? $serializeRule($rule) : null;
					if ($encodedRule === null) {
						return null;
					}
					$clauses[] = $encodedRule;
				}
			}

			return $clauses !== [] ? implode(', ', $clauses) : '';
		}

		$branches = [];
		foreach ($groups as $group) {
			if (!empty($group['negate'])) {
				return null;
			}
			$rules = is_array($group['rules'] ?? null) ? $group['rules'] : [];
			if ($rules === []) {
				continue;
			}
			if (($group['match'] ?? 'all') === 'any') {
				foreach ($rules as $rule) {
					$encodedRule = is_array($rule) ? $serializeRule($rule) : null;
					if ($encodedRule === null) {
						return null;
					}
					$branches[] = $encodedRule;
				}
			} else {
				$clauses = [];
				foreach ($rules as $rule) {
					$encodedRule = is_array($rule) ? $serializeRule($rule) : null;
					if ($encodedRule === null) {
						return null;
					}
					$clauses[] = $encodedRule;
				}
				$branches[] = implode(', ', $clauses);
			}
		}

		return $branches !== [] ? implode('; ', $branches) : '';
	}

	/**
	 * Build a human-readable plain-text expression for a condition tree.
	 *
	 * @param list<array<string, mixed>> $fieldSpecs
	 */
	public static function formatHumanSummary(mixed $rawTree, array $fieldSpecs = []): string
	{
		$tree = self::normalizeTree($rawTree);
		if (self::isEmptyTree($tree)) {
			return '';
		}

		$fieldLabels = [];
		$optionLabels = [];
		foreach ($fieldSpecs as $spec) {
			$k = is_string($spec['key'] ?? null) ? $spec['key'] : '';
			if ($k === '') {
				continue;
			}
			$fieldLabels[$k] = is_string($spec['label'] ?? null) && $spec['label'] !== '' ? $spec['label'] : $k;
			if (is_array($spec['options'] ?? null)) {
				foreach ($spec['options'] as $opt) {
					if (is_array($opt) && isset($opt['value'])) {
						$optionLabels[$k][(string) $opt['value']] = (string) ($opt['label'] ?? $opt['value']);
					}
				}
			}
		}

		$rootJoin = $tree['match'] === 'any' ? ' OR ' : ' AND ';
		$groupParts = [];

		foreach ($tree['groups'] as $group) {
			$rules = is_array($group['rules'] ?? null) ? $group['rules'] : [];
			if ($rules === []) {
				continue;
			}
			$groupJoin = ($group['match'] ?? 'all') === 'any' ? ' OR ' : ' AND ';
			$ruleParts = [];

			foreach ($rules as $rule) {
				if (!is_array($rule)) {
					continue;
				}
				$fieldKey = (string) ($rule['field'] ?? '');
				$fieldLabel = $fieldLabels[$fieldKey] ?? ($fieldKey !== '' ? $fieldKey : '?');
				$operator = (string) ($rule['operator'] ?? 'eq');
				$opLabel = self::OPERATOR_LABELS[$operator] ?? str_replace(['_', '-'], ' ', $operator);

				if (in_array($operator, self::UNARY_OPERATORS, true)) {
					$ruleParts[] = "{$fieldLabel} {$opLabel}";
					continue;
				}

				$val = $rule['value'] ?? null;
				$isFieldTarget = isset($rule['valueSource']) && $rule['valueSource'] === 'field';
				if ($isFieldTarget) {
					$targetKey = is_scalar($val) ? (string) $val : '';
					$targetLabel = $fieldLabels[$targetKey] ?? $targetKey;
					$valText = '{' . $targetLabel . '}';
				} elseif ($operator === 'between' && is_array($val)) {
					$minVal = is_scalar($val[0] ?? null) ? (string) $val[0] : '';
					$maxVal = is_scalar($val[1] ?? null) ? (string) $val[1] : '';
					$valText = "{$minVal} .. {$maxVal}";
				} elseif (is_array($val)) {
					$mapped = [];
					foreach ($val as $item) {
						$strItem = is_scalar($item) ? (string) $item : '';
						if ($strItem === '') {
							continue;
						}
						$mapped[] = $optionLabels[$fieldKey][$strItem] ?? $strItem;
					}
					$valText = '[' . implode(', ', $mapped) . ']';
				} elseif (is_bool($val)) {
					$valText = $val ? 'true' : 'false';
				} elseif ($val === null || $val === '') {
					$valText = '""';
				} else {
					$strVal = is_scalar($val) ? (string) $val : '';
					$valText = $optionLabels[$fieldKey][$strVal] ?? $strVal;
				}

				$ruleParts[] = "{$fieldLabel} {$opLabel} {$valText}";
			}

			if ($ruleParts === []) {
				continue;
			}
			$expr = implode($groupJoin, $ruleParts);
			if (count($ruleParts) > 1 || !empty($group['negate']) || count($tree['groups']) > 1) {
				$expr = "({$expr})";
			}
			if (!empty($group['negate'])) {
				$expr = 'NOT ' . $expr;
			}
			$groupParts[] = $expr;
		}

		return implode($rootJoin, $groupParts);
	}

	/**
	 * Render clean, entity-escaped HTML summary markup for ProcessWire `renderValue()` / `markupValue()`.
	 *
	 * @param list<array<string, mixed>> $fieldSpecs
	 */
	public static function renderSummaryMarkup(mixed $rawTree, array $fieldSpecs = [], string $property = ''): string
	{
		$tree = self::normalizeTree($rawTree);
		if ($property === 'count') {
			return (string) self::countRules($tree);
		}
		if ($property === 'groups') {
			return (string) count($tree['groups']);
		}

		$summary = self::formatHumanSummary($tree, $fieldSpecs);
		if ($property === 'summary') {
			return htmlspecialchars($summary, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
		}
		if ($summary === '') {
			return '';
		}

		return '<div class="rw-condition-summary"><code>'
			. htmlspecialchars($summary, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
			. '</code></div>';
	}

	/**
	 * @param array<int|string, mixed> $rawOptions
	 * @return list<array{value: string, label: string}>
	 */
	private static function normalizeOptionItems(array $rawOptions): array
	{
		$out = [];
		foreach ($rawOptions as $k => $v) {
			if (is_array($v)) {
				$val = (string) ($v['value'] ?? $k);
				$lbl = (string) ($v['label'] ?? $val);
				$out[] = ['value' => $val, 'label' => $lbl];
			} elseif (is_scalar($v) || $v === null) {
				$val = is_int($k) ? (string) $v : (string) $k;
				$lbl = (string) ($v ?? $val);
				$out[] = ['value' => $val, 'label' => $lbl];
			}
		}

		return $out;
	}

	/**
	 * @param array<int|string, mixed> $rawList
	 * @return list<string>
	 */
	private static function normalizeStringList(array $rawList): array
	{
		$out = [];
		foreach ($rawList as $item) {
			if (!is_scalar($item)) {
				continue;
			}
			$clean = trim((string) $item);
			if ($clean !== '' && !in_array($clean, $out, true)) {
				$out[] = $clean;
			}
		}

		return $out;
	}

	/**
	 * Recursively convert `\stdClass` trees to associative PHP arrays.
	 *
	 * @return array<mixed>
	 */
	private static function objectToArrayRecursive(object $obj): array
	{
		$encoded = json_encode($obj);
		if (!is_string($encoded)) {
			return [];
		}
		$decoded = json_decode($encoded, true, self::MAX_JSON_DEPTH);

		return is_array($decoded) ? $decoded : [];
	}
}
