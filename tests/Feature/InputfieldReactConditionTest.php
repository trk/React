<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\FieldtypeText;
use ProcessWire\InputfieldReactCondition;
use ProcessWire\InputfieldText;
use ProcessWire\React;
use ProcessWire\WireInputData;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

test('InputfieldReactCondition exposes module metadata, isolated asset bundle, and inertia island props', function (): void {
	$info = wire('modules')->getModuleInfoVerbose('InputfieldReactCondition');
	expect($info['title'])->toBe('React Condition Builder')
		->and($info['requires'])->toContain('React');

	/** @var InputfieldReactCondition $inputfield */
	$inputfield = wire('modules')->get('InputfieldReactCondition');
	expect($inputfield)->toBeInstanceOf(InputfieldReactCondition::class)
		->and(implode("\n", $inputfield->getModuleScriptAssets()))->toContain('InputfieldReactCondition.js');

	$condField = new Field();
	wire($condField);
	$condField->type = wire('modules')->get('FieldtypeText');
	$condField->set('inputfieldClass', 'InputfieldReactCondition');
	expect(InputfieldReactCondition::isConditionField($condField))->toBeTrue();

	$inputfield->attr('id', 'Inputfield_visibility_rules');
	$inputfield->attr('name', 'visibility_rules');
	$inputfield->set('label', 'Visibility Rules');
	$inputfield->set('conditionFields', [
		['key' => 'plan', 'label' => 'Plan', 'type' => 'select', 'group' => 'Billing', 'options' => [['value' => 'pro', 'label' => 'Pro']]],
		['key' => 'seats', 'label' => 'Seats', 'type' => 'number', 'group' => 'Billing'],
	]);
	$inputfield->set('allowFieldComparison', false);
	$inputfield->set('allowNegate', true);
	$inputfield->set('showSummary', true);
	$inputfield->set('layout', 'compact');
	$inputfield->set('maxGroups', 4);
	$inputfield->set('maxRulesPerGroup', 8);
	$inputfield->attr('value', '{"match":"any","groups":[{"id":"g1","match":"all","negate":true,"rules":[{"id":"r1","field":"plan","operator":"eq","value":"pro"}]}]}');

	$props = $inputfield->inertiaWithData();
	expect($props['controlType'])->toBe('condition_builder')
		->and($props['allowFieldComparison'])->toBeFalse()
		->and($props['allowNegate'])->toBeTrue()
		->and($props['showSummary'])->toBeTrue()
		->and($props['layout'])->toBe('compact')
		->and($props['maxGroups'])->toBe(4)
		->and($props['maxRulesPerGroup'])->toBe(8)
		->and($props['conditionFields'])->toHaveCount(2)
		->and($props['value']['match'])->toBe('any')
		->and($props['value']['groups'][0]['negate'])->toBeTrue();

	expect($inputfield->___renderValue())->toContain('NOT')
		->and($inputfield->___renderValue())->toContain('Plan');

	expect(InputfieldReactCondition::evaluate($inputfield->val(), ['plan' => 'free']))->toBeTrue()
		->and(InputfieldReactCondition::evaluate($inputfield->val(), ['plan' => 'pro']))->toBeFalse();
});

test('InputfieldReactCondition processes valid JSON, flat expressions, empty clears, and limit errors', function (): void {
	/** @var InputfieldReactCondition $inputfield */
	$inputfield = wire('modules')->get('InputfieldReactCondition');
	$inputfield->attr('name', 'rules_input');
	$inputfield->set('maxGroups', 1);
	$inputfield->set('maxRulesPerGroup', 2);

	$validJson = json_encode([
		'match' => 'all',
		'groups' => [
			[
				'id' => 'g1',
				'match' => 'all',
				'rules' => [
					['id' => 'r1', 'field' => 'status', 'operator' => 'eq', 'value' => 'published'],
				],
			],
		],
	]);

	$postData = ['rules_input' => $validJson];
	$post = new WireInputData($postData);
	$inputfield->___processInput($post);
	$stored = $inputfield->val();
	expect($inputfield->getErrors())->toBe([])
		->and($stored)->toBeArray()
		->and($stored['groups'] ?? [])->toHaveCount(1);

	// Exceeding maxGroups records an Inputfield error
	$tooManyGroups = json_encode([
		'match' => 'all',
		'groups' => [
			['id' => 'g1', 'match' => 'all', 'rules' => [['id' => 'r1', 'field' => 'a', 'operator' => 'eq', 'value' => '1']]],
			['id' => 'g2', 'match' => 'all', 'rules' => [['id' => 'r2', 'field' => 'b', 'operator' => 'eq', 'value' => '2']]],
		],
	]);
	$inputfield->getErrors(true);
	$tooManyPost = ['rules_input' => $tooManyGroups];
	$inputfield->___processInput(new WireInputData($tooManyPost));
	expect($inputfield->getErrors())->not->toBe([]);

	// Empty clear resets stored value cleanly
	$inputfield->getErrors(true);
	$emptyPost = ['rules_input' => ''];
	$inputfield->___processInput(new WireInputData($emptyPost));
	$cleared = $inputfield->val();
	expect($cleared)->toBeArray()
		->and($cleared['groups'] ?? null)->toBe([]);
});

test('FieldIntegrationHooks integrates InputfieldReactCondition on FieldtypeText and ReactControlRegistry isolates rwControl=condition_builder', function (): void {
	/** @var FieldtypeText $fieldtype */
	$fieldtype = wire('modules')->get('FieldtypeText');
	$field = new Field();
	wire($field);
	$field->type = $fieldtype;
	$field->name = 'test_cond_field';
	$field->set('inputfieldClass', 'InputfieldReactCondition');

	$sleepJson = $fieldtype->sleepValue(
		wire('pages')->newNullPage(),
		$field,
		['match' => 'all', 'groups' => [['id' => 'g1', 'match' => 'all', 'rules' => [['id' => 'r1', 'field' => 'x', 'operator' => 'eq', 'value' => '1']]]]],
	);
	expect($sleepJson)->toBeString()->toContain('"field":"x"');

	$formatted = $fieldtype->formatValue(wire('pages')->newNullPage(), $field, $sleepJson);
	expect($formatted)->toBeArray()->and($formatted['groups'])->toHaveCount(1);

	$markup = $fieldtype->markupValue(wire('pages')->newNullPage(), $field, $formatted);
	expect($markup)->toContain('x');

	// Verify classic Inputfield with rwControl=condition_builder routes to isolated InputfieldReactCondition bundle & island
	/** @var InputfieldText $classic */
	$classic = wire('modules')->get('InputfieldText');
	$classic->attr('name', 'classic_cond');
	$classic->set('rwControl', 'condition_builder');

	/** @var React $react */
	$react = wire('react');
	$bridge = $react->controls()->resolveControlBridge($classic);
	expect($bridge)->not->toBeNull()
		->and($bridge['canonical'])->toBe('condition_builder')
		->and($bridge['island'])->toBe('InputfieldReactCondition')
		->and($bridge['isCondition'])->toBeTrue();
});

test('InputfieldReactCondition enforces allowNegate and allowFieldComparison flags server-side and ReactControlRegistry accepts string conditionFields cleanly', function (): void {
	/** @var InputfieldReactCondition $inputfield */
	$inputfield = wire('modules')->get('InputfieldReactCondition');
	$inputfield->attr('name', 'guarded_cond');
	$inputfield->set('allowNegate', false);
	$inputfield->set('allowFieldComparison', false);

	$negatedPayload = json_encode([
		'match' => 'all',
		'groups' => [
			[
				'id' => 'g1',
				'match' => 'all',
				'negate' => true,
				'rules' => [
					['id' => 'r1', 'field' => 'status', 'operator' => 'eq', 'value' => 'active'],
				],
			],
		],
	]);
	$inputfield->getErrors(true);
	$negatedPost = ['guarded_cond' => $negatedPayload];
	$inputfield->___processInput(new WireInputData($negatedPost));
	expect($inputfield->getErrors())->not->toBe([]);

	$fieldComparePayload = json_encode([
		'match' => 'all',
		'groups' => [
			[
				'id' => 'g1',
				'match' => 'all',
				'rules' => [
					['id' => 'r1', 'field' => 'min_age', 'operator' => 'lte', 'value' => 'max_age', 'valueSource' => 'field'],
				],
			],
		],
	]);
	$inputfield->getErrors(true);
	$comparePost = ['guarded_cond' => $fieldComparePayload];
	$inputfield->___processInput(new WireInputData($comparePost));
	expect($inputfield->getErrors())->not->toBe([]);

	/** @var InputfieldText $classic */
	$classic = wire('modules')->get('InputfieldText');
	$classic->attr('name', 'classic_cond_str_fields');
	$classic->set('rwControl', 'condition_builder');
	$classic->set('conditionFields', json_encode([
		['key' => 'title', 'label' => 'Title', 'type' => 'text'],
	]));
	/** @var React $react */
	$react = wire('react');
	$html = (string) $react->controls()->renderControlIsland($classic, false);
	expect($html)->toContain('data-inertia-island="InputfieldReactCondition"');
	if (preg_match('/\bdata-props=(["\'])(.*?)\1/s', $html, $propsMatch) === 1) {
		$decodedProps = json_decode(html_entity_decode($propsMatch[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'), true);
		expect($decodedProps['control']['conditionFields'] ?? [])->toHaveCount(1);
	} else {
		expect(false)->toBeTrue('Expected data-props JSON on rendered condition island');
	}

	/** @var FieldtypeText $ftText */
	$ftText = wire('modules')->get('FieldtypeText');
	$condField = new Field();
	wire($condField);
	$condField->type = $ftText;
	$condField->name = 'cond_str_markup_probe';
	$condField->set('rwControl', 'condition_builder');
	$condField->set('conditionFields', json_encode([
		['key' => 'title', 'label' => 'Title', 'type' => 'text'],
	]));
	$summaryHtml = $react->controls()->renderTextMarkupValue($condField, [
		'match' => 'all',
		'groups' => [
			['id' => 'g1', 'match' => 'all', 'rules' => [['id' => 'r1', 'field' => 'title', 'operator' => 'eq', 'value' => 'hi']]],
		],
	]);
	expect((string) $summaryHtml)->toContain('Title');
});

test('InputfieldReactCondition implements isEmpty(), required validation, and FieldtypeText JSON getAttribute(value)', function (): void {
	/** @var InputfieldReactCondition $unbound */
	$unbound = wire('modules')->get('InputfieldReactCondition');
	$unbound->attr('name', 'cond_empty_probe');

	expect($unbound->isEmpty())->toBeTrue()
		->and($unbound->getAttribute('value'))->toBe(['match' => 'all', 'groups' => []]);

	$unbound->attr('value', '{"match":"any","groups":[]}');
	expect($unbound->isEmpty())->toBeTrue();

	$unbound->set('required', true);
	$unbound->getErrors(true);
	$emptyPost = ['cond_empty_probe' => ''];
	$unbound->___processInput(new WireInputData($emptyPost));
	expect($unbound->getErrors())->not->toBe([])
		->and($unbound->isEmpty())->toBeTrue();

	$sampleTree = [
		'match' => 'all',
		'groups' => [
			[
				'id' => 'g1',
				'match' => 'all',
				'rules' => [
					['id' => 'r1', 'field' => 'status', 'operator' => 'eq', 'value' => 'published'],
				],
			],
		],
	];
	$unbound->setAttribute('value', $sampleTree);
	expect($unbound->isEmpty())->toBeFalse()
		->and($unbound->getAttribute('value'))->toBeArray()
		->and($unbound->getAttribute('value')['groups'] ?? [])->toHaveCount(1);

	/** @var FieldtypeText $ftText */
	$ftText = wire('modules')->get('FieldtypeText');
	$boundField = new Field();
	wire($boundField);
	$boundField->type = $ftText;
	$boundField->name = 'cond_bound_probe';
	$boundField->set('inputfieldClass', 'InputfieldReactCondition');

	/** @var InputfieldReactCondition $bound */
	$bound = wire('modules')->get('InputfieldReactCondition');
	$bound->attr('name', 'cond_bound_probe');
	$bound->set('hasFieldtype', $ftText);
	$bound->set('hasField', $boundField);

	expect($bound->isEmpty())->toBeTrue()
		->and($bound->getAttribute('value'))->toBe('');

	$bound->setAttribute('value', $sampleTree);
	$encoded = $bound->getAttribute('value');
	expect($bound->isEmpty())->toBeFalse()
		->and($encoded)->toBeString()
		->and($encoded)->toContain('"field":"status"')
		->and($bound->getNormalizedTree()['groups'] ?? [])->toHaveCount(1);
});
