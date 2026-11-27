<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\FieldtypeDatetime;
use ProcessWire\FieldtypeDecimal;
use ProcessWire\FieldtypeFloat;
use ProcessWire\FieldtypeInteger;
use ProcessWire\FieldtypeOptions;
use ProcessWire\FieldtypeText;
use ProcessWire\FieldtypeTextarea;
use ProcessWire\HookEvent;
use ProcessWire\InputfieldCheckboxes;
use ProcessWire\InputfieldDatetime;
use ProcessWire\InputfieldFloat;
use ProcessWire\InputfieldForm;
use ProcessWire\InputfieldInteger;
use ProcessWire\InputfieldSelect;
use ProcessWire\InputfieldText;
use ProcessWire\InputfieldTextarea;
use ProcessWire\InputfieldToggle;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Page;
use ProcessWire\React;
use ProcessWire\Template;
use ProcessWire\WireInputData;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

/**
 * Decode JSON `data-props` from the first island element in rendered HTML.
 *
 * @return array<string, mixed>
 */
function rwBridgeDecodeIslandProps(string $html): array
{
	if (preg_match('/\bdata-props=(["\'])(.*?)\1/s', $html, $matches) !== 1) {
		return [];
	}

	$decoded = json_decode(html_entity_decode($matches[2], ENT_QUOTES | ENT_HTML5, 'UTF-8'), true);

	return is_array($decoded) ? $decoded : [];
}

test('universal rwControl bridge hydrates extra and core controls with strict per-bundle asset isolation', function (): void {
	bootReactForTesting();

	$modules = wire('modules');
	$config = wire('config');
	$react = React::instance();

	// 1. Extra control (`phone`) -> ReactWorkspace/ExtraFieldControl, loads ReactExtraFields.js and NOT SchemaForm.js
	$config->scripts->removeAll();
	$config->styles->removeAll();

	/** @var InputfieldText $phoneInput */
	$phoneInput = $modules->get('InputfieldText');
	$phoneInput->attr('id+name', 'bridge_phone');
	$phoneInput->label = 'Phone Number';
	$phoneInput->set('rwControl', 'phone');
	$phoneInput->set('defaultCountry', 'TR');
	$phoneInput->attr('value', '+905321112233');
	$phoneInput->renderReady();
	$phoneHtml = $phoneInput->render();

	$phoneScripts = implode("\n", iterator_to_array($config->scripts));
	$phoneProps = rwBridgeDecodeIslandProps($phoneHtml);

	expect($phoneHtml)->toContain('data-inertia-island="ReactWorkspace/ExtraFieldControl"')
		->and($phoneHtml)->toContain('data-rw-bridge-control="phone"')
		->and($phoneHtml)->toContain('name="bridge_phone"')
		->and($phoneHtml)->toContain('value="+905321112233"')
		->and($phoneScripts)->toContain('ReactExtraFields.js')
		->and($phoneScripts)->not->toContain('SchemaForm.js')
		->and($phoneScripts)->not->toContain('ReactCalendar.js')
		->and($phoneProps['control']['type'] ?? null)->toBe('phone')
		->and($phoneProps['control']['defaultCountry'] ?? null)->toBe('TR')
		->and($phoneProps['control']['renderValueMode'] ?? null)->toBeFalse();

	// Read-only renderValue() sets renderValueMode + readOnly without emitting fallback inputs
	$phoneRoHtml = $phoneInput->renderValue();
	$phoneRoProps = rwBridgeDecodeIslandProps($phoneRoHtml);
	expect($phoneRoHtml)->toContain('data-inertia-island="ReactWorkspace/ExtraFieldControl"')
		->and($phoneRoHtml)->not->toContain('<input type="hidden"')
		->and($phoneRoProps['control']['renderValueMode'] ?? null)->toBeTrue()
		->and($phoneRoProps['control']['readOnly'] ?? null)->toBeTrue();

	// 2. Country / timezone aliases route to combobox inside ExtraFieldControl
	/** @var InputfieldText $tzInput */
	$tzInput = $modules->get('InputfieldText');
	$tzInput->attr('id+name', 'bridge_tz');
	$tzInput->set('rwControl', 'timezone');
	$tzInput->attr('value', 'Europe/Istanbul');
	$tzHtml = $tzInput->render();
	$tzProps = rwBridgeDecodeIslandProps($tzHtml);
	expect($tzHtml)->toContain('data-inertia-island="ReactWorkspace/ExtraFieldControl"')
		->and($tzProps['control']['type'] ?? null)->toBe('combobox')
		->and(count($tzProps['control']['options'] ?? []))->toBeGreaterThan(20);

	// `countries` sets multiple=true automatically inside ExtraFieldControl
	/** @var InputfieldText $countriesInput */
	$countriesInput = $modules->get('InputfieldText');
	$countriesInput->attr('id+name', 'bridge_countries');
	$countriesInput->set('rwControl', 'countries');
	$countriesInput->attr('value', 'TR,DE');
	$countriesHtml = $countriesInput->render();
	$countriesProps = rwBridgeDecodeIslandProps($countriesHtml);
	expect($countriesHtml)->toContain('name="bridge_countries_present"')
		->and($countriesHtml)->toContain('name="bridge_countries[]"')
		->and($countriesProps['control']['multiple'] ?? false)->toBeTrue()
		->and($countriesProps['control']['value'] ?? [])->toBe(['TR', 'DE']);

	// 3. Core control (`rating`) -> ReactWorkspace/FieldControl, loads SchemaForm.js without ReactExtraFields.js or ReactCalendar.js
	$config->scripts->removeAll();
	$config->styles->removeAll();

	/** @var InputfieldInteger $ratingInput */
	$ratingInput = $modules->get('InputfieldInteger');
	$ratingInput->attr('id+name', 'bridge_rating');
	$ratingInput->set('rwControl', 'rating');
	$ratingInput->set('maxStars', 5);
	$ratingInput->attr('value', 4);
	$ratingInput->renderReady();
	$ratingHtml = $ratingInput->render();

	$ratingScripts = implode("\n", iterator_to_array($config->scripts));
	$ratingProps = rwBridgeDecodeIslandProps($ratingHtml);
	expect($ratingHtml)->toContain('data-inertia-island="ReactWorkspace/FieldControl"')
		->and($ratingScripts)->toContain('SchemaForm.js')
		->and($ratingScripts)->not->toContain('ReactExtraFields.js')
		->and($ratingScripts)->not->toContain('ReactCalendar.js')
		->and($ratingProps['control']['type'] ?? null)->toBe('rating')
		->and($ratingProps['control']['maxStars'] ?? null)->toBe(5);

	// 4. Calendar control (`date` picker vs `html` mode)
	$config->scripts->removeAll();
	$config->styles->removeAll();

	/** @var InputfieldDatetime $pickerDate */
	$pickerDate = $modules->get('InputfieldDatetime');
	$pickerDate->attr('id+name', 'bridge_date_picker');
	$pickerDate->set('rwControl', 'date');
	$pickerDate->renderReady();
	$pickerScripts = implode("\n", iterator_to_array($config->scripts));
	$pickerStyles = implode("\n", iterator_to_array($config->styles));
	expect($pickerScripts)->toContain('SchemaForm.js')
		->and($pickerScripts)->toContain('ReactCalendar.js')
		->and($pickerStyles)->toContain('ReactCalendar.css');

	$config->scripts->removeAll();
	$config->styles->removeAll();
	/** @var InputfieldDatetime $htmlDate */
	$htmlDate = $modules->get('InputfieldDatetime');
	$htmlDate->attr('id+name', 'bridge_date_html');
	$htmlDate->set('rwControl', 'date');
	$htmlDate->set('datetimeMode', 'html');
	$htmlDate->renderReady();
	$htmlDateScripts = implode("\n", iterator_to_array($config->scripts));
	expect($htmlDateScripts)->toContain('SchemaForm.js')
		->and($htmlDateScripts)->not->toContain('ReactCalendar.js');

	// 5. Plain native InputfieldText without rwControl must remain untouched
	/** @var InputfieldText $plainText */
	$plainText = $modules->get('InputfieldText');
	$plainText->attr('id+name', 'plain_title');
	$plainText->attr('value', 'Hello');
	$plainHtml = $plainText->render();
	expect($plainHtml)->not->toContain('data-inertia-island')
		->and($plainHtml)->toContain('<input');

	// 6. FormSchemaSerializer must NEVER double-wrap rwControl Inputfields inside an inner island string
	$form = new InputfieldForm();
	wire($form);
	$form->add($phoneInput);
	$form->add($ratingInput);
	$schema = $react->serializeForm($form);
	$schemaJson = (string) json_encode($schema);
	expect($schema['fields'] ?? [])->toHaveCount(2)
		->and($schema['fields'][0]['type'] ?? null)->toBe('phone')
		->and($schema['fields'][1]['type'] ?? null)->toBe('rating')
		->and($schemaJson)->not->toContain('ReactWorkspace/ExtraFieldControl')
		->and($schemaJson)->not->toContain('ReactWorkspace/FieldControl');
});

test('LanguageSupport multi-language Inputfields render cleanly without duplicate React language tabs', function (): void {
	bootReactForTesting();

	$modules = wire('modules');
	$languages = wire('languages');
	if (!$modules->isInstalled('LanguageSupport') || !$languages || $languages->count() < 2) {
		$this->markTestSkipped('Requires LanguageSupport with at least 2 languages.');
	}

	/** @var InputfieldTextarea $mdInput */
	$mdInput = $modules->get('InputfieldTextarea');
	$mdInput->attr('id+name', 'bridge_md_i18n');
	$mdInput->set('useLanguages', true);
	$mdInput->set('rwControl', 'markdown');
	$mdInput->attr('value', '# Default Markdown');
	foreach ($languages as $lang) {
		if (!$lang->isDefault()) {
			$mdInput->set('value' . (int) $lang->id, '# Localized ' . $lang->name);
		}
	}

	$renderedHtml = $mdInput->render();
	$islandCount = preg_match_all('/data-inertia-island="ReactWorkspace\/ExtraFieldControl"/', $renderedHtml);
	expect($islandCount)->toBeGreaterThanOrEqual(2);

	$firstProps = rwBridgeDecodeIslandProps($renderedHtml);
	expect($firstProps['control']['useLanguages'] ?? null)->toBeFalse()
		->and($firstProps['control']['languages'] ?? null)->toBe([])
		->and($firstProps['control']['i18n'] ?? null)->toBeNull();
});

test('Setup > Fields exposes compatible React Control config per Fieldtype and propagates onto Field::getInputfield()', function (): void {
	bootReactForTesting();

	$fields = wire('fields');
	$fieldgroups = wire('fieldgroups');
	$templates = wire('templates');
	$pages = wire('pages');
	$modules = wire('modules');
	$react = React::instance();
	$suffix = substr(md5((string) microtime(true) . mt_rand()), 0, 8);

	$checks = [
		[FieldtypeText::class, ['phone', 'country', 'countries', 'timezone', 'currency', 'condition_builder'], ['markdown', 'colspan']],
		[FieldtypeTextarea::class, ['markdown', 'signature', 'condition_builder'], ['phone', 'otp']],
		[FieldtypeInteger::class, ['rating', 'range', 'colspan', 'calculation'], ['phone', 'markdown']],
		[FieldtypeFloat::class, ['range', 'rating', 'calculation'], ['phone', 'markdown']],
		[FieldtypeDecimal::class, ['range', 'rating', 'calculation'], ['phone', 'markdown']],
		[FieldtypeDatetime::class, ['date', 'time', 'datetime'], ['phone', 'daterange']],
		[FieldtypeOptions::class, ['combobox', 'segmented', 'tags'], ['phone', 'password']],
	];

	foreach ($checks as [$ftClass, $expectedPresent, $expectedAbsent]) {
		$shortFt = (new ReflectionClass($ftClass))->getShortName();
		$ft = $modules->get($shortFt);
		if (!$ft) {
			continue;
		}
		$options = $react->controls()->resolveCompatibleControlOptions($ft);
		foreach ($expectedPresent as $key) {
			expect(array_key_exists($key, $options))->toBeTrue("Expected {$key} for {$shortFt}");
		}
		foreach ($expectedAbsent as $key) {
			expect(array_key_exists($key, $options))->toBeFalse("Did not expect {$key} for {$shortFt}");
		}
	}

	// Verify live Field::getConfigInputfields() + persistent Field save -> Page::getInputfield() + sleepValue/formatValue/markupValue
	$field = null;
	$colorField = null;
	$passField = null;
	$unitField = null;
	$tagsField = null;
	$tpl = null;
	$fg = null;
	$page = null;

	try {
		$textFt = $modules->get('FieldtypeText');

		$field = new Field();
		wire($field);
		$field->type = $textFt;
		$field->name = 'rw_bridge_phone_' . $suffix;
		$field->label = 'Bridge Phone';
		$field->set('rwControl', 'phone');
		$field->set('rwDefaultCountry', 'DE');
		$field->set('rwPreferredCountries', 'DE,TR,US');
		$field->set('rwClearable', 1);
		$fields->save($field);

		$configWrapper = $field->getConfigInputfields();
		$fieldset = $configWrapper->getChildByName('rwControlFieldset');
		$controlSelect = $configWrapper->getChildByName('rwControl');
		expect($fieldset)->not->toBeNull()
			->and($controlSelect)->toBeInstanceOf(InputfieldSelect::class)
			->and($controlSelect?->attr('value'))->toBe('phone');

		$colorField = new Field();
		wire($colorField);
		$colorField->type = $textFt;
		$colorField->name = 'rw_bridge_color_' . $suffix;
		$colorField->set('rwControl', 'color');
		$colorField->set('rwSwatches', '#111111, #22c55e');
		$colorField->set('rwAllowAlpha', 1);
		$fields->save($colorField);

		$passField = new Field();
		wire($passField);
		$passField->type = $textFt;
		$passField->name = 'rw_bridge_pass_' . $suffix;
		$passField->set('rwControl', 'password');
		$fields->save($passField);

		$unitField = new Field();
		wire($unitField);
		$unitField->type = $textFt;
		$unitField->name = 'rw_bridge_unit_' . $suffix;
		$unitField->set('rwControl', 'unit_number');
		$unitField->set('rwUnits', 'px,rem');
		$fields->save($unitField);

		$tagsField = new Field();
		wire($tagsField);
		$tagsField->type = $textFt;
		$tagsField->name = 'rw_bridge_tags_' . $suffix;
		$tagsField->set('rwControl', 'tags');
		$tagsField->set('rwDelimiter', '|');
		$tagsField->set('rwSuggestions', 'alpha,beta');
		$fields->save($tagsField);

		$fg = new Fieldgroup();
		$fg->name = 'rw_bridge_tpl_' . $suffix;
		$fg->add('title');
		$fg->add($field);
		$fg->add($colorField);
		$fg->add($passField);
		$fg->add($unitField);
		$fg->add($tagsField);
		$fieldgroups->save($fg);

		$tpl = new Template();
		$tpl->name = $fg->name;
		$tpl->fieldgroup = $fg;
		$templates->save($tpl);

		$page = new Page();
		$page->template = $tpl;
		$page->parent = $pages->get(1);
		$page->name = 'rw-bridge-test-' . $suffix;
		$page->title = 'Bridge Test Page';
		$page->set($unitField->name, ['value' => 24, 'unit' => 'px']);
		$page->set($tagsField->name, ['one', 'two']);
		$page->set($colorField->name, '#22c55e');
		$page->set($passField->name, 'S3cretPass!');
		$page->save();

		$pages->uncacheAll();
		$reloaded = $pages->get($page->id);

		// Verified getInputfield() forwarding from saved Field
		$phoneInputfield = $reloaded->getInputfield($field->name);
		expect($phoneInputfield)->not->toBeNull()
			->and($phoneInputfield?->get('rwControl'))->toBe('phone')
			->and($phoneInputfield?->get('defaultCountry'))->toBe('DE')
			->and($phoneInputfield?->get('preferredCountries'))->toBe(['DE', 'TR', 'US'])
			->and($phoneInputfield?->get('clearable'))->toBeTrue()
			->and($phoneInputfield?->render())->toContain('data-inertia-island="ReactWorkspace/ExtraFieldControl"');

		$tagsInputfield = $reloaded->getInputfield($tagsField->name);
		expect($tagsInputfield?->get('delimiter'))->toBe('|')
			->and($tagsInputfield?->get('suggestions'))->toBe(['alpha', 'beta']);

		// Verified sleepValue + formatValue roundtrip for structured JSON & array -> delimited storage
		$reloaded->of(true);
		expect($reloaded->get($unitField->name))->toBe(['value' => 24, 'unit' => 'px'])
			->and($reloaded->getUnformatted($tagsField->name))->toBe('one|two');

		// Verified markupValue masking & CSS injection neutralization
		expect($textFt->markupValue($reloaded, $passField, 'TopSecret'))->toContain('••••••••')
			->and($textFt->markupValue($reloaded, $passField, 'TopSecret'))->not->toContain('TopSecret')
			->and($textFt->markupValue($reloaded, $colorField, '#22c55e'))->toContain('background:#22c55e')
			->and($textFt->markupValue($reloaded, $colorField, 'red;background-image:url(https://evil.test)'))->toContain('background:transparent')
			->and($textFt->markupValue($reloaded, $colorField, 'red;background-image:url(https://evil.test)'))->not->toContain('background:red;');
	} finally {
		if ($page instanceof Page && $page->id) {
			$pages->delete($page, true);
		}
		if ($tpl instanceof Template) {
			$templates->delete($tpl);
		}
		if ($fg instanceof Fieldgroup) {
			$fieldgroups->delete($fg);
		}
		foreach ([$field, $colorField, $passField, $unitField, $tagsField] as $cleanupField) {
			if ($cleanupField instanceof Field && $cleanupField->id) {
				$fields->delete($cleanupField);
			}
		}
	}
});

test('processInput normalization handles multi-select arrays, empty clears via _present, and ISO datetimes', function (): void {
	bootReactForTesting();

	$modules = wire('modules');
	$react = React::instance();

	// 1. Multi tags/combobox into InputfieldText -> joins cleanly, and `_present` clears to empty
	/** @var InputfieldText $textTags */
	$textTags = $modules->get('InputfieldText');
	$textTags->attr('id+name', 'norm_tags');
	$textTags->set('rwControl', 'tags');
	$textTags->set('delimiter', ',');
	$textTags->attr('value', 'initial');

	$tagsArr = [
		'norm_tags_present' => '1',
		'norm_tags' => ['alpha', 'beta', 'gamma'],
	];
	$textTags->processInput(new WireInputData($tagsArr));
	expect($textTags->val())->toBe('alpha,beta,gamma');

	$emptyTagsArr = [
		'norm_tags_present' => '1',
	];
	$textTags->processInput(new WireInputData($emptyTagsArr));
	expect($textTags->val())->toBe('');

	// 2. Multi-value FieldtypeOptions / InputfieldCheckboxes with `segmented` + `_present` clear
	/** @var InputfieldCheckboxes $checkMulti */
	$checkMulti = $modules->get('InputfieldCheckboxes');
	$checkMulti->attr('id+name', 'norm_segments');
	$checkMulti->set('rwControl', 'segmented');
	$checkMulti->addOption('a', 'Option A');
	$checkMulti->addOption('b', 'Option B');
	$checkMulti->attr('value', ['a', 'b']);

	$emptySegmentsArr = [
		'norm_segments_present' => '1',
	];
	$checkMulti->processInput(new WireInputData($emptySegmentsArr));
	expect($checkMulti->val())->toBe([]);

	// 3. InputfieldDatetime configured with `d/m/Y` + `H:i` receives ISO `2026-06-15T14:30` from React DatetimeField
	/** @var InputfieldDatetime $dtInput */
	$dtInput = $modules->get('InputfieldDatetime');
	$dtInput->attr('id+name', 'norm_dt');
	$dtInput->set('rwControl', 'datetime');
	$dtInput->set('dateInputFormat', 'd/m/Y');
	$dtInput->set('timeInputFormat', 'H:i');

	$dtEvent = new HookEvent();
	$dtEvent->object = $dtInput;
	$dtPostArr = [
		'norm_dt' => '2026-06-15T14:30',
	];
	$dtWireInput = new WireInputData($dtPostArr);
	$dtEvent->arguments = [$dtWireInput];
	$react->controls()->normalizeProcessInput($dtEvent);
	expect($dtWireInput->get('norm_dt'))->toBe('15/06/2026 14:30');

	// 4. InputfieldToggle stays compatible with hidden string `'0'` / `'1'`
	/** @var InputfieldToggle $toggleInput */
	$toggleInput = $modules->get('InputfieldToggle');
	$toggleInput->attr('id+name', 'norm_toggle');
	$toggleInput->set('rwControl', 'toggle');
	$togglePostArr = ['norm_toggle' => '1'];
	$toggleInput->processInput(new WireInputData($togglePostArr));
	expect((string) $toggleInput->val())->toBe('1');
});
