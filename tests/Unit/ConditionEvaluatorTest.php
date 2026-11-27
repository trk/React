<?php // __(file-not-translatable)

declare(strict_types=1);

use Totoglu\React\Condition\ConditionEvaluator;
use Totoglu\React\Condition\ConditionNormalizer;

require_once dirname(__DIR__) . '/bootstrap.php';

test('ConditionNormalizer parses flat expressions, normalizes trees, and preserves group negate and field comparisons', function (): void {
	$fromFlat = ConditionNormalizer::parseFlatExpression('status=published, amount>=100; tier=vip, note!=empty');
	expect($fromFlat)->toBeArray()
		->and($fromFlat['match'])->toBe('any')
		->and($fromFlat['groups'])->toHaveCount(2)
		->and($fromFlat['groups'][0]['rules'][1]['operator'])->toBe('gte')
		->and($fromFlat['groups'][1]['rules'][1]['operator'])->toBe('is_not_empty');

	$normalized = ConditionNormalizer::normalizeTree([
		'match' => 'ANY',
		'groups' => [
			[
				'id' => 'g_custom',
				'match' => 'all',
				'negate' => true,
				'rules' => [
					['id' => 'r1', 'field' => 'total', 'operator' => 'gt', 'value' => '{min_total}', 'valueSource' => 'manual'],
					['id' => 'r2', 'field' => 'status', 'operator' => 'eq', 'value' => 'active'],
					['id' => 'r3', 'field' => 'discount', 'operator' => 'lt', 'value' => 'max_discount', 'valueSource' => 'field'],
				],
			],
			[
				'id' => 'g_plain',
				'match' => 'all',
				'negate' => false,
				'rules' => [
					['id' => 'r4', 'field' => 'is_vip', 'operator' => 'is_true', 'value' => null],
				],
			],
		],
	]);

	expect($normalized['match'])->toBe('any')
		->and($normalized['groups'])->toHaveCount(2)
		->and($normalized['groups'][0]['negate'] ?? false)->toBeTrue()
		->and($normalized['groups'][0]['rules'][2]['valueSource'] ?? null)->toBe('field')
		->and(array_key_exists('negate', $normalized['groups'][1]))->toBeFalse()
		->and(array_key_exists('valueSource', $normalized['groups'][0]['rules'][1]))->toBeFalse()
		->and(ConditionNormalizer::countRules($normalized))->toBe(4)
		->and(ConditionNormalizer::isEmptyTree($normalized))->toBeFalse();

	$emptyNormalized = ConditionNormalizer::normalizeTree('invalid-unparseable$$$');
	expect(ConditionNormalizer::isEmptyTree($emptyNormalized))->toBeTrue();

	$oversized = str_repeat(' ', ConditionNormalizer::MAX_JSON_BYTES + 10);
	expect(ConditionNormalizer::isEmptyTree(ConditionNormalizer::normalizeTree($oversized)))->toBeTrue();
});

test('ConditionNormalizer normalizes categorized field descriptors and renders safe summary markup', function (): void {
	$specs = ConditionNormalizer::normalizeFieldSpecs([
		[
			'key' => 'email',
			'label' => 'Customer Email',
			'type' => 'text',
			'group' => 'Contact',
			'icon' => 'mail',
			'description' => 'Primary contact address',
			'placeholder' => 'name@example.com',
			'sourceOnly' => true,
		],
		[
			'key' => 'tier',
			'label' => 'Tier',
			'type' => 'select',
			'group' => 'Account',
			'targetOnly' => true,
			'comparableTypes' => ['text', 'select', 'unknown_ignored'],
			'options' => [
				['value' => 'vip', 'label' => 'VIP', 'description' => 'Priority'],
			],
		],
		['key' => 'tier', 'label' => 'Duplicate Ignored', 'type' => 'text'],
		['key' => '', 'label' => 'Empty Key Ignored', 'type' => 'text'],
	]);

	expect($specs)->toHaveCount(2)
		->and($specs[0]['group'])->toBe('Contact')
		->and($specs[0]['icon'])->toBe('mail')
		->and($specs[0]['sourceOnly'])->toBeTrue()
		->and($specs[1]['targetOnly'])->toBeTrue()
		->and($specs[1]['comparableTypes'])->toBe(['text', 'select']);

	$tree = [
		'match' => 'all',
		'groups' => [
			[
				'id' => 'g1',
				'match' => 'any',
				'negate' => true,
				'rules' => [
					['id' => 'r1', 'field' => 'status', 'operator' => 'eq', 'value' => '<script>bad</script>'],
				],
			],
		],
	];

	$summary = ConditionNormalizer::formatHumanSummary($tree);
	expect($summary)->toContain('NOT')
		->and($summary)->toContain('Equals');

	$markup = ConditionNormalizer::renderSummaryMarkup($tree);
	expect($markup)->not->toContain('<script>')
		->and($markup)->toContain('&lt;script&gt;');
});

test('ConditionEvaluator evaluates all 21 built-in operators, aliases, negate, field comparison, dot paths, and custom resolvers', function (): void {
	$ctx = [
		'title' => 'Enterprise Plan',
		'count' => 15,
		'min_count' => 10,
		'tags' => ['pro', 'annual'],
		'country' => 'TR',
		'currency' => 'EUR',
		'created_at' => '2026-05-15',
		'active' => true,
		'note' => '',
		'customer' => ['tier' => 'gold'],
	];

	// Empty tree respects emptyResult option
	expect(ConditionEvaluator::evaluate(['match' => 'all', 'groups' => []], $ctx))->toBeTrue()
		->and(ConditionEvaluator::evaluate(['match' => 'all', 'groups' => []], $ctx, ['emptyResult' => false]))->toBeFalse();

	$ops = [
		['field' => 'title', 'operator' => 'eq', 'value' => 'enterprise plan', 'expected' => true],
		['field' => 'title', 'operator' => 'equals', 'value' => 'Enterprise Plan', 'expected' => true],
		['field' => 'title', 'operator' => 'neq', 'value' => 'Starter', 'expected' => true],
		['field' => 'title', 'operator' => 'not_equals', 'value' => 'enterprise plan', 'expected' => false],
		['field' => 'title', 'operator' => 'contains', 'value' => 'prise', 'expected' => true],
		['field' => 'title', 'operator' => 'not_contains', 'value' => 'free', 'expected' => true],
		['field' => 'title', 'operator' => 'starts_with', 'value' => 'enter', 'expected' => true],
		['field' => 'title', 'operator' => 'ends_with', 'value' => 'plan', 'expected' => true],
		['field' => 'count', 'operator' => 'gt', 'value' => 10, 'expected' => true],
		['field' => 'count', 'operator' => 'gte', 'value' => 15, 'expected' => true],
		['field' => 'count', 'operator' => 'lt', 'value' => 20, 'expected' => true],
		['field' => 'count', 'operator' => 'lte', 'value' => 14, 'expected' => false],
		['field' => 'count', 'operator' => 'between', 'value' => [10, 20], 'expected' => true],
		['field' => 'country', 'operator' => 'in', 'value' => ['DE', 'TR'], 'expected' => true],
		['field' => 'country', 'operator' => 'not_in', 'value' => ['US', 'UK'], 'expected' => true],
		['field' => 'created_at', 'operator' => 'before', 'value' => '2026-06-01', 'expected' => true],
		['field' => 'created_at', 'operator' => 'on_or_before', 'value' => '2026-05-15', 'expected' => true],
		['field' => 'created_at', 'operator' => 'after', 'value' => '2026-05-01', 'expected' => true],
		['field' => 'created_at', 'operator' => 'on_or_after', 'value' => '2026-05-15', 'expected' => true],
		['field' => 'created_at', 'operator' => 'between', 'value' => ['2026-05-01', '2026-05-31'], 'expected' => true],
		['field' => 'active', 'operator' => 'is_true', 'value' => null, 'expected' => true],
		['field' => 'active', 'operator' => 'is_false', 'value' => null, 'expected' => false],
		['field' => 'note', 'operator' => 'is_empty', 'value' => null, 'expected' => true],
		['field' => 'title', 'operator' => 'is_not_empty', 'value' => null, 'expected' => true],
		['field' => 'title', 'operator' => 'not_empty', 'value' => null, 'expected' => true],
		['field' => 'customer.tier', 'operator' => 'eq', 'value' => 'gold', 'expected' => true],
		['field' => 'count', 'operator' => 'gt', 'value' => 'min_count', 'valueSource' => 'field', 'expected' => true],
	];

	foreach ($ops as $idx => $case) {
		$tree = [
			'match' => 'all',
			'groups' => [
				[
					'id' => 'g1',
					'match' => 'all',
					'rules' => [
						[
							'id' => 'r_' . $idx,
							'field' => $case['field'],
							'operator' => $case['operator'],
							'value' => $case['value'],
							...(!empty($case['valueSource']) ? ['valueSource' => $case['valueSource']] : []),
						],
					],
				],
			],
		];
		expect(ConditionEvaluator::evaluate($tree, $ctx))->toBe(
			$case['expected'],
			"Failed operator {$case['operator']} on {$case['field']}",
		);
	}

	// Case-sensitive + group negate + callable resolver + fieldAliases + customOperators
	$negatedTree = [
		'match' => 'all',
		'groups' => [
			[
				'id' => 'g1',
				'match' => 'all',
				'negate' => true,
				'rules' => [
					['id' => 'r1', 'field' => 'plan_name', 'operator' => 'eq', 'value' => 'enterprise plan'],
				],
			],
			[
				'id' => 'g2',
				'match' => 'all',
				'rules' => [
					['id' => 'r2', 'field' => 'plan_name', 'operator' => 'starts_with_upper', 'value' => 'Enterprise'],
				],
			],
		],
	];

	$passed = ConditionEvaluator::evaluate(
		$negatedTree,
		static fn(string $key): mixed => $ctx[$key] ?? null,
		[
			'caseSensitive' => true,
			'fieldAliases' => ['plan_name' => 'title'],
			'customOperators' => [
				'starts_with_upper' => static fn(mixed $actual, mixed $expected): bool => is_string($actual) && is_string($expected) && str_starts_with($actual, $expected),
			],
		],
	);
	expect($passed)->toBeTrue();
});

test('ConditionNormalizer parses pipe lists, serializes flat expressions, preserves allowCustomValue, and ConditionEvaluator supports allowWildcards', function (): void {
	$pipeParsed = ConditionNormalizer::parseFlatExpression('plan=pro|enterprise, status!=draft|archived');
	expect($pipeParsed)->toBeArray()
		->and($pipeParsed['groups'][0]['rules'][0]['operator'])->toBe('in')
		->and($pipeParsed['groups'][0]['rules'][0]['value'])->toBe(['pro', 'enterprise'])
		->and($pipeParsed['groups'][0]['rules'][1]['operator'])->toBe('not_in')
		->and($pipeParsed['groups'][0]['rules'][1]['value'])->toBe(['draft', 'archived']);

	expect(ConditionNormalizer::serializeFlatExpression($pipeParsed))
		->toBe('plan=pro|enterprise, status!=draft|archived');

	expect(ConditionNormalizer::serializeFlatExpression([
		'match' => 'all',
		'groups' => [
			[
				'id' => 'g1',
				'match' => 'all',
				'negate' => true,
				'rules' => [['id' => 'r1', 'field' => 'tier', 'operator' => 'eq', 'value' => 'vip']],
			],
		],
	]))->toBeNull();

	$specs = ConditionNormalizer::normalizeFieldSpecs([
		[
			'key' => 'tier',
			'label' => 'Tier',
			'type' => 'select',
			'allowCustomValue' => true,
			'options' => [['value' => 'vip', 'label' => 'VIP']],
		],
	]);
	expect($specs[0]['allowCustomValue'] ?? false)->toBeTrue();

	$wildcardTree = [
		'match' => 'all',
		'groups' => [
			[
				'id' => 'g1',
				'match' => 'all',
				'rules' => [['id' => 'r1', 'field' => 'email', 'operator' => 'eq', 'value' => '*@acme.com']],
			],
		],
	];

	expect(ConditionEvaluator::evaluate($wildcardTree, ['email' => 'ops@ACME.com'], ['allowWildcards' => true]))->toBeTrue()
		->and(ConditionEvaluator::evaluate($wildcardTree, ['email' => 'ops@acme.com'], ['allowWildcards' => false]))->toBeFalse()
		->and(ConditionEvaluator::evaluate($wildcardTree, ['email' => 'ops@ACME.com'], ['allowWildcards' => true, 'caseSensitive' => true]))->toBeFalse();

	$inWildcardTree = [
		'match' => 'all',
		'groups' => [
			[
				'id' => 'g1',
				'match' => 'all',
				'rules' => [['id' => 'r1', 'field' => 'code', 'operator' => 'in', 'value' => ['EU-*', 'TR-*']]],
			],
		],
	];
	expect(ConditionEvaluator::evaluate($inWildcardTree, ['code' => 'tr-34'], ['allowWildcards' => true]))->toBeTrue();
});
