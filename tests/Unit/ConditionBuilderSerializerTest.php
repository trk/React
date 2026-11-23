<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\InputfieldForm;
use ProcessWire\InputfieldText;
use ProcessWire\InputfieldTextarea;
use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Support\IntlCatalog;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
});

test('FormSchemaSerializer serializes declarative condition_builder definitions and IntlCatalog defaults', function (): void {
	$serializer = new FormSchemaSerializer();
	wire($serializer);

	$rawConditionJson = json_encode([
		'match' => 'any',
		'groups' => [
			[
				'id' => 'grp_1',
				'match' => 'all',
				'rules' => [
					['id' => 'rule_1', 'field' => 'shipping_country', 'operator' => 'eq', 'value' => 'TR'],
					['field' => 'subtotal', 'operator' => 'gte', 'value' => 250],
				],
			],
		],
	], JSON_THROW_ON_ERROR);

	$schema = $serializer->serializeDefinitions([
		[
			'name' => 'rules',
			'type' => 'condition_builder',
			'label' => 'Eligibility Rules',
			'value' => $rawConditionJson,
			'conditionFields' => [
				['key' => 'shipping_country', 'label' => 'Shipping Country', 'type' => 'country'],
				['key' => 'currency', 'label' => 'Currency', 'type' => 'currency'],
				['key' => 'subtotal', 'label' => 'Subtotal', 'type' => 'number', 'operators' => ['gte', 'lte']],
				[
					'key' => 'tier',
					'label' => 'Tier',
					'type' => 'select',
					'options' => ['vip' => 'VIP', 'regular' => 'Regular'],
				],
			],
		],
	]);

	expect($schema['fields'])->toHaveCount(1);
	$field = $schema['fields'][0];

	expect($field['type'])->toBe('condition_builder')
		->and($field['useLanguages'])->toBeFalse()
		->and($field['value'])->toBe([
			'match' => 'any',
			'groups' => [
				[
					'id' => 'grp_1',
					'match' => 'all',
					'rules' => [
						['id' => 'rule_1', 'field' => 'shipping_country', 'operator' => 'eq', 'value' => 'TR'],
						['id' => 'rule_1_2', 'field' => 'subtotal', 'operator' => 'gte', 'value' => 250],
					],
				],
			],
		])
		->and($schema['values']['rules'])->toBe($field['value'])
		->and($field['conditionFields'])->toHaveCount(4)
		->and($field['conditionFields'][0]['options'])->toHaveCount(count(IntlCatalog::countryOptions()))
		->and($field['conditionFields'][1]['options'])->toHaveCount(count(IntlCatalog::currencyOptions()))
		->and($field['conditionFields'][2]['operators'])->toBe(['gte', 'lte'])
		->and($field['conditionFields'][3]['options'])->toBe([
			['value' => 'vip', 'label' => 'VIP'],
			['value' => 'regular', 'label' => 'Regular'],
		]);
});

test('FormSchemaSerializer serializes native InputfieldText and InputfieldTextarea with rwControl condition_builder', function (): void {
	$serializer = new FormSchemaSerializer();
	wire($serializer);
	$modules = wire('modules');

	$form = new InputfieldForm();
	wire($form);
	$form->attr('id+name', 'condition_native_form');

	/** @var InputfieldText $textField */
	$textField = $modules->get('InputfieldText');
	$textField->attr('id+name', 'text_conditions');
	$textField->label = 'Text Rules';
	$textField->set('rwControl', 'condition_builder');
	$textField->set('conditionFields', [
		['key' => 'country', 'label' => 'Country', 'type' => 'country', 'options' => [['value' => 'TR', 'label' => 'Türkiye']]],
	]);
	$textField->val('{"match":"all","groups":[]}');
	$form->add($textField);

	/** @var InputfieldTextarea $textareaField */
	$textareaField = $modules->get('InputfieldTextarea');
	$textareaField->attr('id+name', 'textarea_conditions');
	$textareaField->label = 'Textarea Rules';
	$textareaField->set('rwControl', 'condition-builder');
	$textareaField->set('conditionFields', [
		['key' => 'active', 'label' => 'Active', 'type' => 'boolean'],
	]);
	$textareaField->val('{"match":"any","groups":[{"id":"g1","match":"all","rules":[{"id":"r1","field":"active","operator":"is_true","value":null}]}]}');
	$form->add($textareaField);

	$schema = $serializer->serialize($form);

	expect($schema['fields'])->toHaveCount(2)
		->and($schema['fields'][0]['type'])->toBe('condition_builder')
		->and($schema['fields'][0]['value'])->toBe(['match' => 'all', 'groups' => []])
		->and($schema['fields'][0]['conditionFields'])->toBe([
			[
				'key' => 'country',
				'label' => 'Country',
				'type' => 'country',
				'options' => [['value' => 'TR', 'label' => 'Türkiye']],
			],
		])
		->and($schema['fields'][1]['type'])->toBe('condition_builder')
		->and($schema['fields'][1]['value'])->toBe([
			'match' => 'any',
			'groups' => [
				[
					'id' => 'g1',
					'match' => 'all',
					'rules' => [
						['id' => 'r1', 'field' => 'active', 'operator' => 'is_true', 'value' => null],
					],
				],
			],
		])
		->and($schema['fields'][1]['conditionFields'])->toBe([
			['key' => 'active', 'label' => 'Active', 'type' => 'boolean'],
		]);
});
