<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\InputfieldForm;
use ProcessWire\InputfieldIcon;
use ProcessWire\InputfieldReactIcon;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Page;
use ProcessWire\ProcessField;
use ProcessWire\React;
use ProcessWire\ProcessTemplate;
use ProcessWire\Template;
use ProcessWire\WireInputData;
use Totoglu\React\Icon\IconManager;
use Totoglu\React\Icon\ReactIconValue;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
});

test('IconManager loads 5,400+ outline and 1,000+ filled vector icons, serves paginated /_react/icons queries and hydration, resolves shorthand aliases, and renders Outline and Filled SVGs safely', function (): void {
	$workspace = React::instance();
	$icons = $workspace->icons();

	expect($icons)->toBeInstanceOf(IconManager::class)
		->and($icons->count())->toBeGreaterThan(5400)
		->and($icons->filledCount())->toBeGreaterThan(1000)
		->and($icons->totalVariantsCount())->toBeGreaterThan(6500)
		->and(count($icons->getCategories()))->toBeGreaterThanOrEqual(40)
		->and($icons->hasIcon('sparkles'))->toBeTrue()
		->and($icons->hasIcon('brand-whatsapp'))->toBeTrue()
		->and($icons->hasIcon('sofa'))->toBeTrue()
		->and(IconManager::resolveCanonicalName('whatsapp'))->toBe('brand-whatsapp')
		->and(IconManager::resolveCanonicalName('fa-cog'))->toBe('settings')
		->and(IconManager::resolveCanonicalName('fa-gear'))->toBe('settings')
		->and(IconManager::resolveCanonicalName('fa-bars'))->toBe('menu-2')
		->and(IconManager::resolveCanonicalName('fa-puzzle-piece'))->toBe('puzzle')
		->and(IconManager::resolveCanonicalName('rwv--layout-dashboard'))->toBe('layout-dashboard')
		->and(IconManager::formatLabel('brand-whatsapp'))->toBe('WhatsApp')
		->and(IconManager::sanitizeAdminIconClass('rwv--sofa-bed'))->toBe('rwv--sorwvreplaced-bed')
		->and(IconManager::resolveCanonicalName('nonexistent-xyz-icon-999'))->toBe('');

	// Paginated /_react/icons query & hydration gateway
	$queryMeta = $workspace->handleIconsAction([
		'_requestMethod' => 'GET',
		'action' => 'query',
		'meta' => '1',
		'limit' => 24,
	]);
	expect($queryMeta['ok'])->toBeTrue()
		->and($queryMeta['total'])->toBe($icons->totalVariantsCount())
		->and(count($queryMeta['items']))->toBe(24)
		->and(count($queryMeta['categories'] ?? []))->toBeGreaterThanOrEqual(40)
		->and(count($queryMeta['popular'] ?? []))->toBeGreaterThanOrEqual(20);

	$brandSearch = $workspace->handleIconsAction([
		'_requestMethod' => 'GET',
		'action' => 'query',
		'q' => 'whatsapp',
		'category' => 'Brand',
	]);
	expect($brandSearch['ok'])->toBeTrue()
		->and($brandSearch['items'][0]['name'] ?? '')->toBe('brand-whatsapp');

	$filledQuery = $workspace->handleIconsAction([
		'_requestMethod' => 'GET',
		'action' => 'query',
		'style' => 'filled',
		'limit' => 12,
	]);
	expect($filledQuery['ok'])->toBeTrue()
		->and($filledQuery['total'])->toBe($icons->filledCount())
		->and($filledQuery['items'][0]['hasFilled'] ?? false)->toBeTrue();

	$hydrated = $workspace->handleIconsAction([
		'_requestMethod' => 'GET',
		'action' => 'hydrate',
		'names' => 'heart,whatsapp,nonexistent-999',
	]);
	expect($hydrated['ok'])->toBeTrue()
		->and(isset($hydrated['icons']['heart']))->toBeTrue()
		->and($hydrated['icons']['heart']['hasFilled'])->toBeTrue()
		->and(isset($hydrated['icons']['brand-whatsapp']))->toBeTrue();

	// Reject POST on read-only /_react/icons endpoint
	$postRejected = $workspace->handleIconsAction(['_requestMethod' => 'POST']);
	expect($postRejected['ok'])->toBeFalse()
		->and($postRejected['status'])->toBe(405);

	// Outline vs Filled SVG rendering
	$outlineSvg = $icons->renderSvg('sparkles', ['size' => 28, 'strokeWidth' => 1.5, 'color' => '#10b981']);
	expect($outlineSvg)->toContain('<svg')
		->and($outlineSvg)->toContain('width="28"')
		->and($outlineSvg)->toContain('fill="none"')
		->and($outlineSvg)->toContain('stroke="#10b981"')
		->and($outlineSvg)->toContain('stroke-width="1.5"');

	$filledSvg = $icons->renderSvg('heart-filled', ['size' => 24, 'color' => '#e11d48']);
	expect($filledSvg)->toContain('<svg')
		->and($filledSvg)->toContain('fill="#e11d48"')
		->and($filledSvg)->toContain('stroke="none"');

	// Hostile CSS injection in color/background must be rejected cleanly
	$safeHtml = IconManager::renderHtmlMarkup([
		'name' => 'shield-check',
		'size' => 32,
		'color' => 'red;background:url(javascript:alert(1))',
		'background' => '#dcfce7',
		'radius' => 'full',
	]);
	expect($safeHtml)->toContain('class="rw-icon-badge"')
		->and($safeHtml)->toContain('background-color:#dcfce7')
		->and($safeHtml)->toContain('border-radius:9999px')
		->and($safeHtml)->toContain('stroke="currentColor"')
		->and($safeHtml)->not->toContain('javascript:');

	$valObj = $icons->resolveValue('{"name":"heart","variant":"filled","size":30,"color":"#0284c7","strokeWidth":1.75,"background":"#e0f2fe","radius":"lg"}');
	expect($valObj)->toBeInstanceOf(ReactIconValue::class)
		->and($valObj->isEmpty())->toBeFalse()
		->and($valObj->set)->toBe('vector')
		->and($valObj->name)->toBe('heart')
		->and($valObj->variant)->toBe('filled')
		->and($valObj->customized)->toBeTrue()
		->and($valObj->size)->toBe(30)
		->and((string) $valObj)->toContain('rw-icon-badge')
		->and((string) $valObj)->toContain('fill="#0284c7"');
});

test('InputfieldReactIcon handles scalar and customizable modes, FormSchemaSerializer serialization, validation, and Page FieldtypeText persistence with TextformatterEntities', function (): void {
	$workspace = React::instance();
	$modules = wire()->modules;
	$fields = wire()->fields;
	$fieldgroups = wire()->fieldgroups;
	$templates = wire()->templates;
	$pages = wire()->pages;

	/** @var InputfieldReactIcon $iconInput */
	$iconInput = $modules->get('InputfieldReactIcon');
	$iconInput->attr('id+name', 'hero_icon');
	$iconInput->label = 'Hero Icon';
	$iconInput->required = true;

	// Scalar mode (`allowCustomization = false`) including `-filled` variant
	$postScalar = ['hero_icon' => 'fa-sparkles'];
	$iconInput->processInput(new WireInputData($postScalar));
	expect($iconInput->val())->toBe('sparkles')
		->and($iconInput->getErrors())->toBe([]);

	$postFilled = ['hero_icon' => 'heart:filled'];
	$iconInput->processInput(new WireInputData($postFilled));
	expect($iconInput->val())->toBe('heart-filled')
		->and($iconInput->getErrors())->toBe([]);

	// Reject unknown icon names with brand-neutral message
	$postInvalid = ['hero_icon' => 'totally-fake-icon-9876'];
	$iconInput->processInput(new WireInputData($postInvalid));
	$errs = $iconInput->getErrors(true);
	expect($errs)->not->toBe([])
		->and(implode(' ', $errs))->not->toContain('Lucide')
		->and(implode(' ', $errs))->not->toContain('Tabler');

	// Customization mode (`allowCustomization = true`, `allowBackground = false`)
	$iconInput->set('allowCustomization', true);
	$iconInput->set('allowBackground', false);
	$postCustom = [
		'hero_icon' => (string) json_encode([
			'name' => 'sailboat',
			'variant' => 'filled',
			'size' => 36,
			'color' => '#2563eb',
			'strokeWidth' => 1.5,
			'background' => '#dbeafe',
			'radius' => 'full',
		]),
	];
	$iconInput->processInput(new WireInputData($postCustom));
	$decoded = json_decode((string) $iconInput->val(), true);
	expect($decoded)->toBe([
		'name' => 'sailboat',
		'variant' => 'filled',
		'size' => 36,
		'color' => '#2563eb',
		'strokeWidth' => 1.5,
		'background' => '',
		'radius' => 'md',
	]);

	// FormSchemaSerializer serializes both InputfieldReactIcon instances and declarative `type: 'icon'`
	/** @var InputfieldForm $form */
	$form = $modules->get('InputfieldForm');
	$form->add($iconInput);
	$serializedForm = $workspace->forms()->serialize($form);
	expect($serializedForm['fields'][0]['type'])->toBe('icon')
		->and($serializedForm['fields'][0]['iconConfig']['allowCustomization'])->toBeTrue()
		->and($serializedForm['fields'][0]['iconConfig']['allowVariant'])->toBeTrue()
		->and($serializedForm['fields'][0]['iconConfig']['allowBackground'])->toBeFalse()
		->and($serializedForm['fields'][0]['iconConfig']['totalIcons'])->toBeGreaterThan(6500);

	$declSchema = $workspace->forms()->serializeDefinitions([
		'card_icon' => [
			'type' => 'icon',
			'label' => 'Card Icon',
			'allowCustomization' => true,
			'default' => 'anchor',
		],
	]);
	expect($declSchema['fields'][0]['type'])->toBe('icon')
		->and($declSchema['fields'][0]['iconConfig']['allowCustomization'])->toBeTrue()
		->and($declSchema['values']['card_icon']['name'] ?? null)->toBe('anchor');

	// Real Page lifecycle with FieldtypeText + TextformatterEntities
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$fieldName = 'rw_icon_test_' . $suffix;
	$tplName = 'rw-icon-tpl-' . $suffix;

	$field = new Field();
	$field->type = $modules->get('FieldtypeText');
	$field->name = $fieldName;
	$field->label = 'Custom Feature Icon';
	$field->set('inputfieldClass', 'InputfieldReactIcon');
	$field->set('allowCustomization', true);
	$field->set('textformatters', ['TextformatterEntities']);
	$fields->save($field);

	$fg = new Fieldgroup();
	$fg->name = $tplName;
	$fg->add($fields->get('title'));
	$fg->add($field);
	$fieldgroups->save($fg);

	$tpl = new Template();
	$tpl->name = $tplName;
	$tpl->fieldgroup = $fg;
	$templates->save($tpl);

	$page = new Page();
	$page->template = $tpl;
	$page->parent = $pages->get(1);
	$page->name = 'rw-icon-page-' . $suffix;
	$page->title = 'Icon Page ' . $suffix;
	$page->set($fieldName, [
		'name' => 'compass',
		'variant' => 'filled',
		'size' => 40,
		'color' => '#0d9488',
		'strokeWidth' => 1.5,
		'background' => '#ccfbf1',
		'radius' => 'full',
	]);
	$pages->save($page);

	$prevUser = wire()->user;
	$superuser = wire()->users->get((int) wire()->config->superUserPageID);
	if ($superuser instanceof \ProcessWire\User && $superuser->id > 0) {
		wire()->users->setCurrentUser($superuser);
	}

	try {
		$pages->uncacheAll();
		$reloaded = $pages->get((int) $page->id);
		$reloaded->of(true);

		$formatted = $reloaded->get($fieldName);
		expect($formatted)->toBeInstanceOf(ReactIconValue::class)
			->and($formatted->name)->toBe('compass')
			->and($formatted->variant)->toBe('filled')
			->and($formatted->size)->toBe(40)
			->and($formatted->color)->toBe('#0d9488')
			->and($formatted->strokeWidth)->toBe(1.5)
			->and($formatted->background)->toBe('#ccfbf1')
			->and($formatted->radius)->toBe('full')
			->and((string) $formatted)->toContain('rw-icon-badge')
			->and((string) $field->type->markupValue($reloaded, $field, $reloaded->getUnformatted($fieldName)))->toContain('pw-rw-cell-icon');
	} finally {
		if ($prevUser instanceof \ProcessWire\User) {
			wire()->users->setCurrentUser($prevUser);
		}
		if ($page->id > 0) {
			$pages->delete($page, true);
		}
		if ($tpl->id > 0) {
			$templates->delete($tpl);
		}
		if ($fg->id > 0) {
			$fieldgroups->delete($fg);
		}
		if ($field->id > 0) {
			$fields->delete($field);
		}
	}
});

test('Admin icon hooks inject brand-neutral Vector Icon picker on ProcessTemplate and ProcessField and generate CSS mask-image rules for both outline and filled icons', function (): void {
	$workspace = React::instance();
	$workspace->set('enableAdminVectorIcons', true);

	$modules = wire()->modules;
	$fields = wire()->fields;
	$fieldgroups = wire()->fieldgroups;
	$templates = wire()->templates;
	$input = wire()->input;

	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$fieldName = 'rw_admin_icon_f_' . $suffix;
	$tplName = 'rw-admin-icon-t-' . $suffix;

	$field = new Field();
	$field->type = $modules->get('FieldtypeText');
	$field->name = $fieldName;
	$field->label = 'Admin Icon Field';
	$fields->save($field);

	$fg = new Fieldgroup();
	$fg->name = $tplName;
	$fg->add($fields->get('title'));
	$fg->add($field);
	$fieldgroups->save($fg);

	$tpl = new Template();
	$tpl->name = $tplName;
	$tpl->fieldgroup = $fg;
	$templates->save($tpl);

	$prevUser = wire()->user;
	$superuser = wire()->users->get((int) wire()->config->superUserPageID);
	if ($superuser instanceof \ProcessWire\User && $superuser->id > 0) {
		wire()->users->setCurrentUser($superuser);
	}

	try {
		// 1. Verify ProcessTemplate::buildEditForm & ProcessField::buildEditForm use brand-neutral `Vector Icon` label and `showIf="vectorIcon=''"`
		$input->get->set('id', (int) $tpl->id);
		/** @var ProcessTemplate $procTemplate */
		$procTemplate = $modules->getModule('ProcessTemplate', ['noPermissionCheck' => true]);
		/** @var InputfieldWrapper $tplForm */
		$tplForm = $procTemplate->__call('buildEditForm', [$tpl]);
		$coreTplIconField = $tplForm->getChildByName('pageLabelIcon');
		$vectorTplField = $tplForm->getChildByName('vectorIcon');
		expect($coreTplIconField)->toBeInstanceOf(InputfieldIcon::class)
			->and($coreTplIconField?->showIf)->toBe("vectorIcon=''")
			->and($vectorTplField)->toBeInstanceOf(InputfieldReactIcon::class)
			->and($vectorTplField?->label)->toBe('Vector Icon')
			->and((string) $vectorTplField?->description)->not->toContain('Lucide')
			->and((string) $vectorTplField?->description)->not->toContain('Tabler');

		$input->get->set('id', (int) $field->id);
		/** @var ProcessField $procField */
		$procField = $modules->getModule('ProcessField', ['noPermissionCheck' => true]);
		/** @var InputfieldWrapper $fieldForm */
		$fieldForm = $procField->__call('buildEditForm', []);
		$coreFieldIcon = $fieldForm->getChildByName('icon');
		$vectorFieldInput = $fieldForm->getChildByName('vectorIcon');
		expect($coreFieldIcon)->toBeInstanceOf(InputfieldIcon::class)
			->and($coreFieldIcon?->showIf)->toBe("vectorIcon=''")
			->and($vectorFieldInput)->toBeInstanceOf(InputfieldReactIcon::class)
			->and($vectorFieldInput?->label)->toBe('Vector Icon');

		// 2. Save outline `sofa` on Template and filled `heart-filled` on Field
		$tpl->set('vectorIcon', 'sofa');
		$templates->save($tpl);

		$field->set('vectorIcon', 'heart-filled');
		$fields->save($field);

		expect($tpl->get('vectorIcon'))->toBe('rwv--sofa')
			->and($tpl->getIcon(false))->toBe('rwv--sofa')
			->and($field->get('vectorIcon'))->toBe('rwv--heart-filled')
			->and($field->getIcon(false))->toBe('rwv--heart-filled');

		$cssPath = $workspace->icons()->getAdminCssPath();
		expect(is_file($cssPath))->toBeTrue()
			->and($workspace->icons()->hasActiveAdminCss())->toBeTrue();
		$css = (string) file_get_contents($cssPath);
		expect($css)->toContain('.fa-rwv--sofa')
			->and($css)->toContain('.fa-rwv--heart-filled')
			->and($css)->toContain('.ui-menu .ui-menu-item a i[class*="fa-rwv--"]')
			->and($css)->toContain('.uk-nav [class*="fa-rwvreplaced-"]')
			->and($css)->toContain('rw-count:')
			->and($css)->toContain('mask-image: url("data:image/svg+xml,');

		// Verify IconManager::isAdminIconRegistered() resolves canonical names and aliases accurately
		IconManager::registerAdminIcons(['adjustments-horizontal', 'layout-dashboard']);
		expect(IconManager::isAdminIconRegistered('adjustments-horizontal'))->toBeTrue()
			->and(IconManager::isAdminIconRegistered('sliders'))->toBeTrue()
			->and(IconManager::isAdminIconRegistered('rwv--layout-dashboard'))->toBeTrue()
			->and(IconManager::isAdminIconRegistered('nonexistent-unregistered-xyz'))->toBeFalse();

		// 3. Clearing `vectorIcon` restores clean blank icon state
		$tpl->set('vectorIcon', '');
		$templates->save($tpl);
		$field->set('vectorIcon', '');
		$fields->save($field);

		expect($tpl->get('vectorIcon'))->toBe('')
			->and($tpl->getIcon(false))->toBe('')
			->and($field->get('vectorIcon'))->toBe('')
			->and($field->getIcon(false))->toBe('');
	} finally {
		if ($prevUser instanceof \ProcessWire\User) {
			wire()->users->setCurrentUser($prevUser);
		}
		$input->get->remove('id');
		if ($tpl->id > 0) {
			$templates->delete($tpl);
		}
		if ($fg->id > 0) {
			$fieldgroups->delete($fg);
		}
		if ($field->id > 0) {
			$fields->delete($field);
		}
		$workspace->icons()->generateAdminCss();
	}
});
