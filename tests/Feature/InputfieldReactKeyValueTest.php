<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\Inputfield;
use ProcessWire\InputfieldReactKeyValue;
use ProcessWire\InputfieldSelect;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Page;
use ProcessWire\Template;
use ProcessWire\User;
use ProcessWire\WireInputData;
use Totoglu\Inertia\Provider\Field\ScalarFieldDataProvider;
use Totoglu\React\Form\FormSchemaSerializer;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

/**
 * @param array<string, mixed> $data
 */
function makeKeyValueInput(array $data): WireInputData
{
	$input = new WireInputData();
	$input->setArray($data);

	return $input;
}

beforeEach(function (): void {
	bootReactForTesting();
	$this->previousUser = wire('user');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superUser = wire('users')->get($superId);
	if ($superUser instanceof User && $superUser->id > 0) {
		wire('users')->setCurrentUser($superUser);
	}
});

afterEach(function (): void {
	if (isset($this->previousUser) && $this->previousUser instanceof User && $this->previousUser->id > 0) {
		wire('users')->setCurrentUser($this->previousUser);
	}
});

test('InputfieldReactKeyValue FieldtypeText/FieldtypeTextarea inputfieldClass registration works cleanly', function (): void {
	$instance = new InputfieldReactKeyValue();
	expect($instance)->toBeInstanceOf(InputfieldReactKeyValue::class);

	$fields = wire('fields');
	$modules = wire('modules');

	$textField = new Field();
	$textField->type = $modules->get('FieldtypeText');
	$textField->name = 'tmp_kv_cfg_text';
	$textConfig = $textField->type->getConfigInputfields($textField);
	/** @var InputfieldSelect|null $textClassSelect */
	$textClassSelect = $textConfig->getChildByName('inputfieldClass');
	expect($textClassSelect)->toBeInstanceOf(InputfieldSelect::class)
		->and($textClassSelect->getOptions())->toHaveKey('InputfieldReactKeyValue');

	$textareaField = new Field();
	$textareaField->type = $modules->get('FieldtypeTextarea');
	$textareaField->name = 'tmp_kv_cfg_textarea';
	$textareaConfig = $textareaField->type->getConfigInputfields($textareaField);
	/** @var InputfieldSelect|null $textareaClassSelect */
	$textareaClassSelect = $textareaConfig->getChildByName('inputfieldClass');
	expect($textareaClassSelect)->toBeInstanceOf(InputfieldSelect::class)
		->and($textareaClassSelect->getOptions())->toHaveKey('InputfieldReactKeyValue');
});

test('normalizeValue, encodeJsonObject, multiline priority, and sequential numeric string keys work without corruption', function (): void {
	// Sequential numeric string keys must NEVER be treated as a flat list and dropped
	$numericMap = ['0' => 'Disabled', '1' => 'Enabled', '2' => 'Auto'];
	$normalizedNumeric = InputfieldReactKeyValue::normalizeValue($numericMap);
	expect($normalizedNumeric)->toBe(['0' => 'Disabled', '1' => 'Enabled', '2' => 'Auto'])
		->and(InputfieldReactKeyValue::encodeJsonObject($numericMap))->toBe('{"0":"Disabled","1":"Enabled","2":"Auto"}')
		->and(InputfieldReactKeyValue::encodeJsonObject([]))->toBe('')
		->and(json_encode(InputfieldReactKeyValue::toJsonObject([])))->toBe('{}');

	// Multiline first-delimiter priority: `:` before `=` vs `=` before `:`
	$multiline = "redirect: https://example.com/?a=1&b=2\nenv=prod:eu-central-1\nplain_flag:";
	$parsedLines = InputfieldReactKeyValue::normalizeValue($multiline, true);
	expect($parsedLines)->toBe([
		'redirect' => 'https://example.com/?a=1&b=2',
		'env' => 'prod:eu-central-1',
		'plain_flag' => '',
	]);

	// Blocked prototype keys and C0 control bytes are stripped
	$polluted = [
		'__proto__' => 'polluted',
		'constructor' => 'bad',
		'prototype' => 'bad',
		"cpu\x00_model" => "Apple\x07 M4 Max",
	];
	expect(InputfieldReactKeyValue::normalizeValue($polluted))->toBe([
		'cpu_model' => 'Apple M4 Max',
	]);
});

test('processInput enforces empty clearing, duplicate keys, blocked keys, keyPattern, minItems, maxItems, and readOnly tamper guards', function (): void {
	/** @var InputfieldReactKeyValue $field */
	$field = wire('modules')->get('InputfieldReactKeyValue');
	$field->attr('name', 'specs');
	$field->set('value', ['existing' => 'keep']);

	// 1. Clearing all rows when _present=1 is submitted with zero rows
	$field->processInput(makeKeyValueInput(['specs_present' => '1']));
	expect($field->val())->toBe([]);

	// 2. Missing payload entirely preserves existing value
	$field->set('value', ['existing' => 'keep']);
	$field->processInput(makeKeyValueInput(['unrelated' => '1']));
	expect($field->val())->toBe(['existing' => 'keep']);

	// 3. Duplicate keys emit validation error
	$dupField = new InputfieldReactKeyValue();
	$dupField->wire(wire());
	$dupField->attr('name', 'specs');
	$dupField->processInput(makeKeyValueInput([
		'specs_present' => '1',
		'specs_key' => ['cpu', 'cpu'],
		'specs_val' => ['M3', 'M4'],
	]));
	expect($dupField->getErrors())->not->toBeEmpty()
		->and($dupField->val())->toBe(['cpu' => 'M4']);

	// 4. Blocked key emits error and is stripped
	$protoField = new InputfieldReactKeyValue();
	$protoField->wire(wire());
	$protoField->attr('name', 'specs');
	$protoField->processInput(makeKeyValueInput([
		'specs_present' => '1',
		'specs_key' => ['__proto__', 'ram'],
		'specs_val' => ['hack', '64GB'],
	]));
	expect($protoField->getErrors())->not->toBeEmpty()
		->and($protoField->val())->toBe(['ram' => '64GB']);

	// 5. keyPattern + minItems + maxItems validation
	$patternField = new InputfieldReactKeyValue();
	$patternField->wire(wire());
	$patternField->attr('name', 'attrs');
	$patternField->keyPattern = '^[a-z][a-z0-9_]*$';
	$patternField->keyPatternMessage = 'Use snake_case keys only.';
	$patternField->minItems = 2;
	$patternField->maxItems = 2;

	$patternField->processInput(makeKeyValueInput([
		'attrs_present' => '1',
		'attrs_key' => ['Invalid-Key'],
		'attrs_val' => ['1'],
	]));
	$errors = implode(' | ', $patternField->getErrors(true));
	expect($errors)->toContain('Use snake_case keys only.')
		->and($errors)->toContain('2');

	// Exceeding maxItems records error AND caps stored items
	$patternField->processInput(makeKeyValueInput([
		'attrs_present' => '1',
		'attrs_key' => ['one', 'two', 'three'],
		'attrs_val' => ['1', '2', '3'],
	]));
	expect($patternField->getErrors(true))->not->toBeEmpty()
		->and($patternField->val())->toBe(['one' => '1', 'two' => '2']);

	// 6. Locked collapsed state blocks tampering, while dynamic _rwDynamicReadOnly allows unlocked POST
	$lockedField = new InputfieldReactKeyValue();
	$lockedField->wire(wire());
	$lockedField->attr('name', 'locked_kv');
	$lockedField->collapsed = Inputfield::collapsedNoLocked;
	$lockedField->set('value', ['safe' => 'original']);
	$lockedField->processInput(makeKeyValueInput([
		'locked_kv_present' => '1',
		'locked_kv_key' => ['tampered'],
		'locked_kv_val' => ['evil'],
	]));
	expect($lockedField->val())->toBe(['safe' => 'original']);

	$dynamicField = new InputfieldReactKeyValue();
	$dynamicField->wire(wire());
	$dynamicField->attr('name', 'dyn_kv');
	$dynamicField->attr('readonly', 'readonly');
	$dynamicField->set('_rwDynamicReadOnly', true);
	$dynamicField->set('value', ['initial' => '1']);
	$dynamicField->processInput(makeKeyValueInput([
		'dyn_kv_present' => '1',
		'dyn_kv_key' => ['unlocked'],
		'dyn_kv_val' => ['2'],
	]));
	expect($dynamicField->val())->toBe(['unlocked' => '2']);
});

test('Page lifecycle with TextformatterEntities and Inertia ScalarFieldDataProvider preserves numeric and reserved keys end to end', function (): void {
	$fields = wire('fields');
	$templates = wire('templates');
	$fieldgroups = wire('fieldgroups');
	$pages = wire('pages');
	$modules = wire('modules');

	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$fieldName = "test_kv_{$suffix}";
	$tplName = "test-kv-tpl-{$suffix}";

	$kvField = null;
	$fg = null;
	$tpl = null;
	$testPage = null;

	try {
		$kvField = new Field();
		$kvField->type = $modules->get('FieldtypeTextarea');
		$kvField->name = $fieldName;
		$kvField->label = 'Specifications';
		$kvField->set('inputfieldClass', 'InputfieldReactKeyValue');
		$kvField->set('textformatters', ['TextformatterEntities']);
		$kvField->set('keyLabel', 'Spec');
		$kvField->set('valueLabel', 'Detail');
		$fields->save($kvField);

		$fg = new Fieldgroup();
		$fg->name = $tplName;
		$fg->add($fields->get('title'));
		$fg->add($kvField);
		$fieldgroups->save($fg);

		$tpl = new Template();
		$tpl->name = $tplName;
		$tpl->fieldgroup = $fg;
		$templates->save($tpl);

		$inputfield = $kvField->getInputfield(new Page());
		expect($inputfield)->toBeInstanceOf(InputfieldReactKeyValue::class);

		$wrapper = new InputfieldWrapper();
		wire($wrapper);
		$wrapper->add($inputfield);

		$serializer = new FormSchemaSerializer();
		wire($serializer);
		$schema = $serializer->serialize($wrapper);
		$serialized = $schema['fields'][0] ?? null;
		expect($serialized)->not->toBeNull()
			->and($serialized['type'])->toBe('keyvalue')
			->and($serialized['keyLabel'])->toBe('Spec')
			->and($serialized['valueLabel'])->toBe('Detail');

		$testPage = new Page();
		$testPage->template = $tpl;
		$testPage->parent = $pages->get(1);
		$testPage->name = "kv-page-{$suffix}";
		$testPage->title = 'KV Test Page';
		$testPage->set($fieldName, [
			'0' => 'Zero Index Option',
			'1' => 'First Index Option',
			'voltage' => '220V & 110V <safe>',
		]);
		$pages->save($testPage);

		// Reload unformatted (canonical JSON object string) and formatted (array, NOT corrupted by TextformatterEntities)
		$pages->uncacheAll();
		$reloaded = $pages->get((int) $testPage->id);

		$reloaded->of(false);
		$rawStored = $reloaded->getUnformatted($fieldName);
		expect($rawStored)->toBe('{"0":"Zero Index Option","1":"First Index Option","voltage":"220V & 110V <safe>"}');

		$reloaded->of(true);
		$formatted = $reloaded->get($fieldName);
		expect($formatted)->toBe([
			'0' => 'Zero Index Option',
			'1' => 'First Index Option',
			'voltage' => '220V & 110V <safe>',
		]);

		// FieldtypeText::markupValue renders semantic <dl> and single subkey lookup
		$markupAll = $kvField->type->markupValue($reloaded, $kvField, $formatted);
		expect($markupAll)->toContain('<dl')
			->and($markupAll)->toContain('220V &amp; 110V &lt;safe&gt;');

		$markupSingle = $kvField->type->markupValue($reloaded, $kvField, $formatted, 'voltage');
		expect($markupSingle)->toBe('220V &amp; 110V &lt;safe&gt;');

		// Inertia ScalarFieldDataProvider returns stdClass preserving numeric keys and {} when empty
		$modules->get('Inertia');
		$inertiaProvider = new ScalarFieldDataProvider();
		wire($inertiaProvider);
		$inertiaVal = $inertiaProvider->transform($formatted, $kvField, $reloaded);
		expect($inertiaVal)->toBeInstanceOf(\stdClass::class)
			->and(json_encode($inertiaVal))->toBe('{"0":"Zero Index Option","1":"First Index Option","voltage":"220V & 110V <safe>"}');

		$emptyInertiaVal = $inertiaProvider->transform('', $kvField, $reloaded);
		expect($emptyInertiaVal)->toBeInstanceOf(\stdClass::class)
			->and(json_encode($emptyInertiaVal))->toBe('{}');

		// Reserved "default" key and numeric "0" key persist cleanly across unformatted save/reload
		$reloaded->of(false);
		$reloaded->set($fieldName, [
			'default' => 'Standard Preset',
			'0' => 'Fallback',
		]);
		$pages->save($reloaded);

		$pages->uncacheAll();
		$reloaded = $pages->get((int) $testPage->id);
		$reloaded->of(false);
		expect($reloaded->getUnformatted($fieldName))->toBe('{"default":"Standard Preset","0":"Fallback"}');
	} finally {
		$classesDir = rtrim((string) wire('config')->paths->classes, '/') . '/';
		if ($testPage instanceof Page && $testPage->id > 0) {
			try {
				$pages->delete($testPage, true);
			} catch (\Throwable) {
			}
		}
		if ($tpl instanceof Template && $tpl->id > 0) {
			$pascal = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', (string) $tpl->name)));
			try {
				$templates->delete($tpl);
			} catch (\Throwable) {
			}
			$classFile = $classesDir . $pascal . 'Page.php';
			if (is_file($classFile)) {
				unlink($classFile);
			}
		}
		if ($fg instanceof Fieldgroup && $fg->id > 0) {
			try {
				$fieldgroups->delete($fg);
			} catch (\Throwable) {
			}
		}
		if ($kvField instanceof Field && $kvField->id > 0) {
			try {
				$fields->delete($kvField);
			} catch (\Throwable) {
			}
		}
	}
});

test('isBlockedKey, validateRegexPattern ReDoS protection, TSV parsing, config fields, and FieldtypeRepeater Page items work end-to-end', function (): void {
	expect(InputfieldReactKeyValue::isBlockedKey('__proto__'))->toBeTrue()
		->and(InputfieldReactKeyValue::isBlockedKey('  PROTOTYPE '))->toBeTrue()
		->and(InputfieldReactKeyValue::isBlockedKey("con\x00structor"))->toBeTrue()
		->and(InputfieldReactKeyValue::isBlockedKey('cpu_model'))->toBeFalse();

	// ReDoS nested quantifiers and malformed regexes are rejected by validateRegexPattern
	expect(InputfieldReactKeyValue::validateRegexPattern('^([a-z0-9_]+)+$'))->toBeNull()
		->and(InputfieldReactKeyValue::validateRegexPattern('/(a*)*$/'))->toBeNull()
		->and(InputfieldReactKeyValue::validateRegexPattern('^[unclosed'))->toBeNull()
		->and(InputfieldReactKeyValue::validateRegexPattern('^[a-z0-9_]+$'))->toBe('/^[a-z0-9_]+$/u')
		->and(InputfieldReactKeyValue::validateRegexPattern('/^data-[a-z]+$/i'))->toBe('/^data-[a-z]+$/i');

	// TSV lines split on tab before colon/equals
	$tsvNormalized = InputfieldReactKeyValue::normalizeValue("endpoint\thttps://api.example.com:8443?x=1\n0\tPrimary");
	expect($tsvNormalized)->toBe([
		'endpoint' => 'https://api.example.com:8443?x=1',
		'0' => 'Primary',
	]);

	// Invalid/ReDoS keyPattern fails closed in processInput, and config UI includes removeLabel + data-react-island in renderValue
	$ifCheck = new InputfieldReactKeyValue();
	wire($ifCheck);
	$ifCheck->attr('name', 'kv_redos');
	$ifCheck->set('keyPattern', '^([a-z]+)+$');
	$rawPost = [
		'kv_redos_present' => '1',
		'kv_redos_key' => ['valid_key'],
		'kv_redos_val' => ['val'],
	];
	$postData = new WireInputData($rawPost);
	$ifCheck->processInput($postData);
	expect($ifCheck->getErrors())->not->toBeEmpty();

	$cfgFields = $ifCheck->getConfigInputfields();
	expect($cfgFields->getChildByName('removeLabel'))->not->toBeNull()
		->and($ifCheck->renderValue())->toContain('data-react-island="InputfieldReactKeyValue"');

	$modules = wire('modules');
	if (!$modules->isInstalled('FieldtypeRepeater')) {
		return;
	}

	$fields = wire('fields');
	$fieldgroups = wire('fieldgroups');
	$templates = wire('templates');
	$pages = wire('pages');

	$suffix = substr(md5(uniqid('kv_rep_', true)), 0, 8);
	$subFieldName = "kv_rep_sub_{$suffix}";
	$repFieldName = "kv_rep_list_{$suffix}";
	$hostTplName = "kv_rep_host_{$suffix}";

	$subKvField = null;
	$repField = null;
	$hostFg = null;
	$hostTpl = null;
	$hostPage = null;

	try {
		$subKvField = new Field();
		$subKvField->type = $modules->get('FieldtypeTextarea');
		$subKvField->name = $subFieldName;
		$subKvField->label = 'Repeater Specs';
		$subKvField->set('inputfieldClass', 'InputfieldReactKeyValue');
		$fields->save($subKvField);

		$repFg = new Fieldgroup();
		$repFg->name = "repeater_{$repFieldName}";
		$repFg->add($subKvField);
		$fieldgroups->save($repFg);

		$repTpl = new Template();
		$repTpl->name = "repeater_{$repFieldName}";
		$repTpl->fieldgroup = $repFg;
		$repTpl->flags = Template::flagSystem;
		$repTpl->noChildren = 1;
		$repTpl->noParents = 1;
		$templates->save($repTpl);

		$repField = new Field();
		$repField->type = $modules->get('FieldtypeRepeater');
		$repField->name = $repFieldName;
		$repField->label = 'Spec Groups';
		$repField->set('repeaterFields', [(int) $subKvField->id]);
		$repField->set('template_id', (int) $repTpl->id);
		$fields->save($repField);

		$hostFg = new Fieldgroup();
		$hostFg->name = $hostTplName;
		$hostFg->add($fields->get('title'));
		$hostFg->add($repField);
		$fieldgroups->save($hostFg);

		$hostTpl = new Template();
		$hostTpl->name = $hostTplName;
		$hostTpl->fieldgroup = $hostFg;
		$templates->save($hostTpl);

		$hostPage = new Page();
		$hostPage->template = $hostTpl;
		$hostPage->parent = $pages->get(1);
		$hostPage->name = "kv-rep-page-{$suffix}";
		$hostPage->title = 'Repeater KV Host';
		$pages->save($hostPage);

		$hostPage->of(false);
		$repItem = $hostPage->get($repFieldName)->getNew();
		$repItem->of(false);
		$repItem->set($subFieldName, [
			'0' => 'Slot Zero',
			'port' => 'Thunderbolt 5',
		]);
		$repItem->save();
		$pages->save($hostPage);

		$pages->uncacheAll();
		$reloadedHost = $pages->get((int) $hostPage->id);
		$reloadedHost->of(true);
		$firstItem = $reloadedHost->get($repFieldName)->first();
		expect($firstItem)->not->toBeNull()
			->and($firstItem->get($subFieldName))->toBe([
				'0' => 'Slot Zero',
				'port' => 'Thunderbolt 5',
			]);
	} finally {
		$classesDir = rtrim((string) wire('config')->paths->classes, '/') . '/';
		if ($hostPage instanceof Page && $hostPage->id > 0) {
			try {
				$pages->delete($hostPage, true);
			} catch (\Throwable) {
			}
		}
		if ($hostTpl instanceof Template && $hostTpl->id > 0) {
			$pascal = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', (string) $hostTpl->name)));
			try {
				$templates->delete($hostTpl);
			} catch (\Throwable) {
			}
			$classFile = $classesDir . $pascal . 'Page.php';
			if (is_file($classFile)) {
				unlink($classFile);
			}
		}
		if ($hostFg instanceof Fieldgroup && $hostFg->id > 0) {
			try {
				$fieldgroups->delete($hostFg);
			} catch (\Throwable) {
			}
		}
		$repTplCleanup = $templates->get("repeater_{$repFieldName}");
		$repFgCleanup = $fieldgroups->get("repeater_{$repFieldName}");
		if ($repField instanceof Field && $repField->id > 0) {
			try {
				$fields->delete($repField);
			} catch (\Throwable) {
			}
		}
		if ($repTplCleanup instanceof Template && $repTplCleanup->id > 0) {
			try {
				$repTplCleanup->flags = Template::flagSystemOverride;
				$repTplCleanup->flags = 0;
				$templates->delete($repTplCleanup);
			} catch (\Throwable) {
			}
		}
		if ($repFgCleanup instanceof Fieldgroup && $repFgCleanup->id > 0) {
			try {
				$fieldgroups->delete($repFgCleanup);
			} catch (\Throwable) {
			}
		}
		if ($subKvField instanceof Field && $subKvField->id > 0) {
			try {
				$fields->delete($subKvField);
			} catch (\Throwable) {
			}
		}
	}
});
