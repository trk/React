<?php

declare(strict_types=1);

namespace Totoglu\React\Condition;

use DateTimeImmutable;

/**
 * Domain-agnostic predicate evaluator for canonical 2-level `condition_builder` rule trees.
 *
 * Supports `all`/`any` root and group match modes, group-level `negate`, `valueSource === 'field'`
 * target-field comparisons, dot-path resolution, field aliases, lazy callable resolvers,
 * custom operators, and all 21 built-in text, numeric, option, boolean, country, currency, and date operators.
 */
final class ConditionEvaluator
{
	/**
	 * Evaluate a condition tree against a context array or lazy field resolver callable.
	 *
	 * @param array<string, mixed>|callable(string): mixed $context
	 * @param array{
	 *   emptyResult?: bool,
	 *   caseSensitive?: bool,
	 *   allowWildcards?: bool,
	 *   fieldAliases?: array<string, string>,
	 *   customOperators?: array<string, callable(mixed, mixed, array<string, mixed>, bool): bool>
	 * } $options
	 */
	public static function evaluate(mixed $tree, array|callable $context, array $options = []): bool
	{
		$normalized = ConditionNormalizer::normalizeTree($tree);
		$emptyResult = array_key_exists('emptyResult', $options) ? (bool) $options['emptyResult'] : true;
		$caseSensitive = !empty($options['caseSensitive']);
		$allowWildcards = !empty($options['allowWildcards']);
		$fieldAliases = is_array($options['fieldAliases'] ?? null) ? $options['fieldAliases'] : [];
		$customOperators = is_array($options['customOperators'] ?? null) ? $options['customOperators'] : [];

		$groups = $normalized['groups'];
		if ($groups === []) {
			return $emptyResult;
		}

		$groupResults = [];
		foreach ($groups as $group) {
			$rules = is_array($group['rules'] ?? null) ? $group['rules'] : [];
			if ($rules === []) {
				continue;
			}

			$groupAny = ($group['match'] ?? 'all') === 'any';
			$ruleResults = [];

			foreach ($rules as $rule) {
				if (!is_array($rule)) {
					continue;
				}
				$ruleResults[] = self::evaluateRule($rule, $context, $caseSensitive, $allowWildcards, $fieldAliases, $customOperators);
			}

			if ($ruleResults === []) {
				continue;
			}

			$matched = $groupAny
				? in_array(true, $ruleResults, true)
				: !in_array(false, $ruleResults, true);

			if (!empty($group['negate'])) {
				$matched = !$matched;
			}

			$groupResults[] = $matched;
		}

		if ($groupResults === []) {
			return $emptyResult;
		}

		$rootAny = $normalized['match'] === 'any';

		return $rootAny
			? in_array(true, $groupResults, true)
			: !in_array(false, $groupResults, true);
	}

	/**
	 * @param array<string, mixed> $rule
	 * @param array<string, mixed>|callable(string): mixed $context
	 * @param array<string, string> $fieldAliases
	 * @param array<string, callable(mixed, mixed, array<string, mixed>, bool): bool> $customOperators
	 */
	private static function evaluateRule(
		array $rule,
		array|callable $context,
		bool $caseSensitive,
		bool $allowWildcards,
		array $fieldAliases,
		array $customOperators,
	): bool {
		$fieldKey = is_scalar($rule['field'] ?? null) ? trim((string) $rule['field']) : '';
		if ($fieldKey === '') {
			return false;
		}

		$rawOp = is_scalar($rule['operator'] ?? null) ? strtolower(trim((string) $rule['operator'])) : 'eq';
		$operator = self::canonicalOperator($rawOp);
		$actual = self::resolveValue($fieldKey, $context, $fieldAliases);

		$expected = $rule['value'] ?? null;
		if (isset($rule['valueSource']) && $rule['valueSource'] === 'field') {
			$targetKey = is_scalar($expected) ? trim((string) $expected) : '';
			$expected = $targetKey !== '' ? self::resolveValue($targetKey, $context, $fieldAliases) : null;
		}

		if (isset($customOperators[$operator]) && is_callable($customOperators[$operator])) {
			return (bool) ($customOperators[$operator])($actual, $expected, $rule, $caseSensitive);
		}

		return match ($operator) {
			'eq' => self::opEquals($actual, $expected, $caseSensitive, $allowWildcards),
			'neq' => !self::opEquals($actual, $expected, $caseSensitive, $allowWildcards),
			'contains' => self::opContains($actual, $expected, $caseSensitive),
			'not_contains' => !self::opContains($actual, $expected, $caseSensitive),
			'starts_with' => self::opStartsWith($actual, $expected, $caseSensitive),
			'ends_with' => self::opEndsWith($actual, $expected, $caseSensitive),
			'gt' => self::opCompareNumeric($actual, $expected, '>'),
			'gte' => self::opCompareNumeric($actual, $expected, '>='),
			'lt' => self::opCompareNumeric($actual, $expected, '<'),
			'lte' => self::opCompareNumeric($actual, $expected, '<='),
			'between' => self::opBetween($actual, $expected),
			'in' => self::opIn($actual, $expected, $caseSensitive, $allowWildcards),
			'not_in' => !self::opIn($actual, $expected, $caseSensitive, $allowWildcards),
			'before' => self::opDateCompare($actual, $expected, '<'),
			'on_or_before' => self::opDateCompare($actual, $expected, '<='),
			'after' => self::opDateCompare($actual, $expected, '>'),
			'on_or_after' => self::opDateCompare($actual, $expected, '>='),
			'is_true' => self::toBool($actual, false) === true,
			'is_false' => self::toBool($actual, true) === false,
			'is_empty' => self::opIsEmpty($actual),
			'is_not_empty' => !self::opIsEmpty($actual),
			default => false,
		};
	}

	private static function canonicalOperator(string $operator): string
	{
		return match ($operator) {
			'equals' => 'eq',
			'not_equals', 'ne' => 'neq',
			'not_empty' => 'is_not_empty',
			default => $operator,
		};
	}

	/**
	 * Resolve a field key against a context array (supporting aliases and dot notation) or callable resolver.
	 *
	 * @param array<string, mixed>|callable(string): mixed $context
	 * @param array<string, string> $fieldAliases
	 */
	private static function resolveValue(string $key, array|callable $context, array $fieldAliases): mixed
	{
		$resolvedKey = $fieldAliases[$key] ?? $key;

		if (is_callable($context)) {
			return $context($resolvedKey);
		}

		if (array_key_exists($resolvedKey, $context)) {
			return $context[$resolvedKey];
		}

		if ($resolvedKey !== $key && array_key_exists($key, $context)) {
			return $context[$key];
		}

		if (str_contains($resolvedKey, '.')) {
			$cursor = $context;
			foreach (explode('.', $resolvedKey) as $segment) {
				if (is_array($cursor) && array_key_exists($segment, $cursor)) {
					$cursor = $cursor[$segment];
					continue;
				}
				return null;
			}
			return $cursor;
		}

		return null;
	}

	private static function opEquals(mixed $actual, mixed $expected, bool $caseSensitive, bool $allowWildcards = false): bool
	{
		if (is_array($actual)) {
			if (is_array($expected)) {
				return self::opIn($actual, $expected, $caseSensitive, $allowWildcards);
			}
			foreach ($actual as $item) {
				if (self::scalarEquals($item, $expected, $caseSensitive, $allowWildcards)) {
					return true;
				}
			}

			return false;
		}

		return self::scalarEquals($actual, $expected, $caseSensitive, $allowWildcards);
	}

	private static function scalarEquals(mixed $a, mixed $b, bool $caseSensitive, bool $allowWildcards = false): bool
	{
		if ($a === null || $b === null) {
			return $a === null && $b === null;
		}
		if (is_bool($a) || is_bool($b)) {
			$ba = self::toBool($a, null);
			$bb = self::toBool($b, null);

			return $ba !== null && $ba === $bb;
		}

		if ($allowWildcards && is_string($b) && str_contains($b, '*')) {
			return self::matchWildcard(self::toStringValue($a), $b, $caseSensitive);
		}

		$numA = self::toFloat($a);
		$numB = self::toFloat($b);
		if ($numA !== null && $numB !== null) {
			return abs($numA - $numB) < 1e-9;
		}

		$strA = self::toStringValue($a);
		$strB = self::toStringValue($b);

		return $caseSensitive
			? $strA === $strB
			: mb_strtolower($strA, 'UTF-8') === mb_strtolower($strB, 'UTF-8');
	}

	/**
	 * Linear-time two-pointer wildcard match (`*` matches any sequence of characters).
	 */
	private static function matchWildcard(string $text, string $pattern, bool $caseSensitive): bool
	{
		if (!$caseSensitive) {
			$text = mb_strtolower($text, 'UTF-8');
			$pattern = mb_strtolower($pattern, 'UTF-8');
		}
		$textChars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
		$patChars = preg_split('//u', $pattern, -1, PREG_SPLIT_NO_EMPTY) ?: [];
		$tLen = count($textChars);
		$pLen = count($patChars);
		$ti = 0;
		$pi = 0;
		$starIdx = -1;
		$matchIdx = 0;

		while ($ti < $tLen) {
			if ($pi < $pLen && $patChars[$pi] === $textChars[$ti]) {
				$ti++;
				$pi++;
			} elseif ($pi < $pLen && $patChars[$pi] === '*') {
				$starIdx = $pi;
				$matchIdx = $ti;
				$pi++;
			} elseif ($starIdx !== -1) {
				$pi = $starIdx + 1;
				$matchIdx++;
				$ti = $matchIdx;
			} else {
				return false;
			}
		}

		while ($pi < $pLen && $patChars[$pi] === '*') {
			$pi++;
		}

		return $pi === $pLen;
	}

	private static function opContains(mixed $actual, mixed $expected, bool $caseSensitive): bool
	{
		if (is_array($actual)) {
			foreach ($actual as $item) {
				if (self::scalarEquals($item, $expected, $caseSensitive) || self::opContains($item, $expected, $caseSensitive)) {
					return true;
				}
			}

			return false;
		}

		$needle = self::toStringValue($expected);
		if ($needle === '') {
			return false;
		}
		$haystack = self::toStringValue($actual);

		return $caseSensitive
			? str_contains($haystack, $needle)
			: str_contains(mb_strtolower($haystack, 'UTF-8'), mb_strtolower($needle, 'UTF-8'));
	}

	private static function opStartsWith(mixed $actual, mixed $expected, bool $caseSensitive): bool
	{
		$prefix = self::toStringValue($expected);
		if ($prefix === '') {
			return false;
		}
		$haystack = self::toStringValue($actual);

		return $caseSensitive
			? str_starts_with($haystack, $prefix)
			: str_starts_with(mb_strtolower($haystack, 'UTF-8'), mb_strtolower($prefix, 'UTF-8'));
	}

	private static function opEndsWith(mixed $actual, mixed $expected, bool $caseSensitive): bool
	{
		$suffix = self::toStringValue($expected);
		if ($suffix === '') {
			return false;
		}
		$haystack = self::toStringValue($actual);

		return $caseSensitive
			? str_ends_with($haystack, $suffix)
			: str_ends_with(mb_strtolower($haystack, 'UTF-8'), mb_strtolower($suffix, 'UTF-8'));
	}

	private static function opCompareNumeric(mixed $actual, mixed $expected, string $op): bool
	{
		$numA = self::toFloat($actual);
		$numB = self::toFloat($expected);
		if ($numA === null || $numB === null) {
			return false;
		}

		return match ($op) {
			'>' => $numA > $numB,
			'>=' => $numA >= $numB,
			'<' => $numA < $numB,
			'<=' => $numA <= $numB,
			default => false,
		};
	}

	private static function opBetween(mixed $actual, mixed $expected): bool
	{
		if (!is_array($expected) || count($expected) < 2) {
			return false;
		}
		$minRaw = $expected[0] ?? null;
		$maxRaw = $expected[1] ?? null;

		$numA = self::toFloat($actual);
		$numMin = self::toFloat($minRaw);
		$numMax = self::toFloat($maxRaw);
		if ($numA !== null && $numMin !== null && $numMax !== null) {
			$lo = min($numMin, $numMax);
			$hi = max($numMin, $numMax);

			return $numA >= $lo && $numA <= $hi;
		}

		$tsA = self::toTimestamp($actual);
		$tsMin = self::toTimestamp($minRaw);
		$tsMax = self::toTimestamp($maxRaw);
		if ($tsA !== null && $tsMin !== null && $tsMax !== null) {
			$lo = min($tsMin, $tsMax);
			$hi = max($tsMin, $tsMax);

			return $tsA >= $lo && $tsA <= $hi;
		}

		return false;
	}

	private static function opIn(mixed $actual, mixed $expected, bool $caseSensitive, bool $allowWildcards = false): bool
	{
		$candidates = self::toComparableList($expected);
		if ($candidates === []) {
			return false;
		}

		if (is_array($actual)) {
			foreach ($actual as $item) {
				foreach ($candidates as $cand) {
					if (self::scalarEquals($item, $cand, $caseSensitive, $allowWildcards)) {
						return true;
					}
				}
			}

			return false;
		}

		foreach ($candidates as $cand) {
			if (self::scalarEquals($actual, $cand, $caseSensitive, $allowWildcards)) {
				return true;
			}
		}

		return false;
	}

	private static function opDateCompare(mixed $actual, mixed $expected, string $op): bool
	{
		$tsA = self::toTimestamp($actual);
		$tsB = self::toTimestamp($expected);
		if ($tsA === null || $tsB === null) {
			return false;
		}

		return match ($op) {
			'<' => $tsA < $tsB,
			'<=' => $tsA <= $tsB,
			'>' => $tsA > $tsB,
			'>=' => $tsA >= $tsB,
			default => false,
		};
	}

	private static function opIsEmpty(mixed $actual): bool
	{
		if ($actual === null) {
			return true;
		}
		if (is_array($actual)) {
			return $actual === [];
		}
		if (is_bool($actual)) {
			return false;
		}
		if (is_int($actual) || is_float($actual)) {
			return false;
		}
		if (is_string($actual)) {
			return trim($actual) === '';
		}

		return false;
	}

	private static function toFloat(mixed $value): ?float
	{
		if (is_int($value) || is_float($value)) {
			return is_finite((float) $value) ? (float) $value : null;
		}
		if (is_string($value)) {
			$trimmed = trim($value);
			if ($trimmed !== '' && is_numeric($trimmed)) {
				$f = (float) $trimmed;
				return is_finite($f) ? $f : null;
			}
		}

		return null;
	}

	private static function toBool(mixed $value, ?bool $default): ?bool
	{
		if (is_bool($value)) {
			return $value;
		}
		if (is_int($value) || is_float($value)) {
			if ((float) $value === 1.0) {
				return true;
			}
			if ((float) $value === 0.0) {
				return false;
			}
			return $default;
		}
		if (is_string($value)) {
			$lower = strtolower(trim($value));
			if (in_array($lower, ['1', 'true', 'yes', 'on'], true)) {
				return true;
			}
			if (in_array($lower, ['0', 'false', 'no', 'off', ''], true)) {
				return false;
			}
		}

		return $default;
	}

	private static function toTimestamp(mixed $value): ?int
	{
		if (is_int($value)) {
			return $value;
		}
		if (is_float($value) && is_finite($value)) {
			return (int) $value;
		}
		if (!is_string($value)) {
			return null;
		}
		$trimmed = trim($value);
		if ($trimmed === '') {
			return null;
		}
		if (preg_match('/^-?\d+$/', $trimmed) === 1) {
			return (int) $trimmed;
		}
		if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $trimmed) === 1) {
			$dt = DateTimeImmutable::createFromFormat('!Y-m-d', $trimmed, new \DateTimeZone('UTC'));
			return $dt instanceof DateTimeImmutable ? $dt->getTimestamp() : null;
		}
		try {
			$dt = new DateTimeImmutable($trimmed, new \DateTimeZone('UTC'));
			return $dt->getTimestamp();
		} catch (\Throwable) {
			return null;
		}
	}

	private static function toStringValue(mixed $value): string
	{
		if ($value === null) {
			return '';
		}
		if (is_bool($value)) {
			return $value ? '1' : '0';
		}
		if (is_scalar($value)) {
			return trim((string) $value);
		}

		return '';
	}

	/**
	 * @return list<mixed>
	 */
	private static function toComparableList(mixed $expected): array
	{
		if (is_array($expected)) {
			$out = [];
			foreach ($expected as $item) {
				if (is_scalar($item)) {
					$str = trim((string) $item);
					if ($str !== '' || is_bool($item) || is_int($item) || is_float($item)) {
						$out[] = $item;
					}
				}
			}

			return $out;
		}

		if (is_string($expected)) {
			$out = [];
			foreach (explode(',', $expected) as $part) {
				$clean = trim($part);
				if ($clean !== '') {
					$out[] = $clean;
				}
			}

			return $out;
		}

		if (is_scalar($expected)) {
			return [$expected];
		}

		return [];
	}
}
