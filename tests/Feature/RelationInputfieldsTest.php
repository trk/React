<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\HookEvent;
use ProcessWire\InputfieldPage;
use ProcessWire\InputfieldReactM2A;
use ProcessWire\InputfieldReactM2M;
use ProcessWire\InputfieldReactM2O;
use ProcessWire\InputfieldReactO2M;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Page;
use ProcessWire\React;
use ProcessWire\Role;
use ProcessWire\User;
use ProcessWire\WireInputData;
use ProcessWire\WirePermissionException;
use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Data\ReactPageResult;
use Totoglu\React\Relation\RelationItem;
use Totoglu\React\Relation\Resource\AbstractRelationResource;
use Totoglu\React\Relation\Resource\PageResourceAdapter;
use Totoglu\React\Relation\Resource\UserResourceAdapter;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

/**
 * @param array<string, mixed> $data
 */
function makeRelationWireInputData(array $data): WireInputData
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

test('all 8 core relation resource adapters register, query, hydrate, and support custom deferRelationRegistration adapters', function (): void {
	$workspace = React::instance();
	$registry = $workspace->relations();

	foreach (['page', 'template', 'field', 'user', 'role', 'permission', 'language', 'module'] as $resName) {
		expect($registry->has($resName))->toBeTrue();
	}

	// 1. Page adapter (query + tree + hydrate)
	$pageAdapter = $registry->get('page');
	expect($pageAdapter->supportsTree())->toBeTrue()
		->and($pageAdapter->supportsQuickCreate())->toBeTrue();

	$homeHydrated = $pageAdapter->hydrate([1]);
	expect($homeHydrated)->toHaveCount(1)
		->and((int) $homeHydrated[0]->value)->toBe(1)
		->and($homeHydrated[0]->resource)->toBe('page');

	$rootTree = $pageAdapter->tree(0);
	expect($rootTree)->not->toBeEmpty();

	// 2. Template adapter
	$tplAdapter = $registry->get('template');
	$tplQuery = $tplAdapter->query(['q' => 'home']);
	expect($tplQuery['total'])->toBeGreaterThanOrEqual(1);
	$tplHydrated = $tplAdapter->hydrate(['home'], ['valueField' => 'name']);
	expect($tplHydrated)->toHaveCount(1)
		->and($tplHydrated[0]->value)->toBe('home');

	// 3. Field adapter + cascading dependsValue template scoping
	$fieldAdapter = $registry->get('field');
	$scopedFields = $fieldAdapter->query(['dependsValue' => 'home']);
	$scopedNames = array_map(static fn(RelationItem $i): string => (string) $i->value, $scopedFields['items']);
	expect($scopedNames)->toContain('title');

	// 4. User, Role, Permission, Module adapters
	expect($registry->get('user')->query([], ['excludeGuest' => false])['total'])->toBeGreaterThanOrEqual(1)
		->and($registry->get('role')->hydrate(['superuser'], ['valueField' => 'name']))->toHaveCount(1)
		->and($registry->get('permission')->hydrate(['page-edit'], ['valueField' => 'name']))->toHaveCount(1)
		->and($registry->get('module')->hydrate(['React'], ['valueField' => 'name']))->toHaveCount(1);

	// 5. Custom adapter registration
	$customAdapter = new class extends AbstractRelationResource {
		public function name(): string
		{
			return 'custom_tag';
		}

		public function label(): string
		{
			return 'Custom Tag';
		}

		public function icon(): string
		{
			return 'tag';
		}

		public function defaultValueField(): string
		{
			return 'name';
		}

		public function query(array $params = [], array $config = []): array
		{
			return $this->paginateItems([
				new RelationItem(value: 'featured', resource: 'custom_tag', resourceLabel: 'Custom Tag', label: 'Featured'),
				new RelationItem(value: 'seasonal', resource: 'custom_tag', resourceLabel: 'Custom Tag', label: 'Seasonal'),
			], $params, $config);
		}

		public function hydrate(array $values, array $config = []): array
		{
			$all = ['featured' => 'Featured', 'seasonal' => 'Seasonal'];
			$out = [];
			foreach ($values as $v) {
				$k = (string) $v;
				if (isset($all[$k])) {
					$out[] = new RelationItem(value: $k, resource: 'custom_tag', resourceLabel: 'Custom Tag', label: $all[$k]);
				}
			}

			return $out;
		}

		public function count(array $config = []): int
		{
			return 2;
		}
	};
	wire($customAdapter);
	$registry->register($customAdapter);

	expect($registry->has('custom_tag'))->toBeTrue()
		->and($registry->hydrateMorphTokens(['template:home', 'custom_tag:featured'], ['template', 'custom_tag']))->toHaveCount(2);
});

test('InputfieldReactM2O, InputfieldReactM2M, InputfieldReactO2M, and InputfieldReactM2A render, process input, validate bounds, and serialize FieldtypeText JSON', function (): void {
	$modules = wire('modules');

	// 1. InputfieldReactM2O
	/** @var InputfieldReactM2O $m2o */
	$m2o = $modules->get('InputfieldReactM2O');
	$m2o->attr('name', 'target_tpl');
	$m2o->set('resource', 'template');
	$m2o->set('valueField', 'name');
	$m2o->set('widget', 'select');
	$m2o->attr('value', 'home');

	$m2oData = $m2o->inertiaWithData();
	expect($m2oData['cardinality'])->toBe('m2o')
		->and($m2oData['resource'])->toBe('template')
		->and($m2oData['widget'])->toBe('select')
		->and($m2oData['value'])->toBe('home')
		->and($m2oData['relationToken'])->not->toBeEmpty()
		->and($m2oData['selectedItems'])->toHaveCount(1);

	$m2oHtml = $m2o->render();
	expect($m2oHtml)->toContain('pw-inertia-inputfield-island')
		->and($m2o->renderValue())->toContain('home');

	$m2o->processInput(makeRelationWireInputData(['target_tpl' => 'basic-page']));
	expect($m2o->attr('value'))->toBe('basic-page');

	// 2. InputfieldReactM2M (array + FieldtypeText JSON roundtrip + minItems/maxItems validation)
	/** @var InputfieldReactM2M $m2m */
	$m2m = $modules->get('InputfieldReactM2M');
	$m2m->attr('name', 'allowed_roles');
	$m2m->set('resource', 'role');
	$m2m->set('valueField', 'name');
	$m2m->set('minItems', 2);
	$m2m->set('maxItems', 3);

	$m2m->processInput(makeRelationWireInputData(['allowed_roles' => ['superuser']]));
	expect($m2m->getErrors(true))->not->toBeEmpty();

	$m2m->processInput(makeRelationWireInputData(['allowed_roles' => ['superuser', 'guest']]));
	expect($m2m->getErrors(true))->toBeEmpty()
		->and($m2m->attr('value'))->toBe(['superuser', 'guest']);

	// FieldtypeText JSON serialization when attached to a text Field
	$dummyTextField = new Field();
	wire($dummyTextField);
	$dummyTextField->type = $modules->get('FieldtypeText');
	$m2mText = new InputfieldReactM2M();
	wire($m2mText);
	$m2mText->attr('name', 'roles_json');
	$m2mText->set('resource', 'role');
	$m2mText->set('valueField', 'name');
	$m2mText->set('hasField', $dummyTextField);
	$m2mText->processInput(makeRelationWireInputData(['roles_json' => ['superuser', 'guest']]));
	expect($m2mText->attr('value'))->toBe('["superuser","guest"]');

	// 3. InputfieldReactO2M (read/action-only — processInput is a safe no-op)
	/** @var InputfieldReactO2M $o2m */
	$o2m = $modules->get('InputfieldReactO2M');
	$o2m->attr('name', 'child_pages');
	$o2m->set('targetResource', 'page');
	$o2m->set('foreignField', 'parent_id');
	$o2m->set('ownerId', 1);
	$o2m->attr('value', 'untouched');
	$o2m->processInput(makeRelationWireInputData(['child_pages' => 'tampered']));
	expect($o2m->attr('value'))->toBe('untouched')
		->and($o2m->inertiaWithData()['cardinality'])->toBe('o2m');

	// 4. InputfieldReactM2A (polymorphic URI tokens)
	/** @var InputfieldReactM2A $m2a */
	$m2a = $modules->get('InputfieldReactM2A');
	$m2a->attr('name', 'featured_refs');
	$m2a->set('allowedResources', ['page', 'template', 'role']);
	$m2a->processInput(makeRelationWireInputData([
		'featured_refs' => ['page:1', 'template:home', 'user:41', 'invalid_token'],
	]));
	expect($m2a->attr('value'))->toBe(['page:1', 'template:home']);

	// 5. Native InputfieldPage delegate integration + per-template context overrides + InputfieldReactKeyValue FieldtypeText bridge
	/** @var InputfieldPage $ifPage */
	$ifPage = $modules->get('InputfieldPage');
	$ifPage->attr('name', 'parent_ref');
	$ifPage->set('inputfield', 'InputfieldReactM2O');
	$ifPage->set('derefAsPage', 1);
	expect($ifPage->getInputfield())->toBeInstanceOf(InputfieldReactM2O::class);

	$ctxField = new \ProcessWire\Field();
	wire($ctxField);
	expect($m2o->getConfigAllowContext($ctxField))->toContain('resource', 'valueField', 'widget', 'selector', 'parentId', 'dependsOn')
		->and($m2mText->getConfigAllowContext($ctxField))->toContain('sortable', 'minItems', 'maxItems', 'optionColumns')
		->and($o2m->getConfigAllowContext($ctxField))->toContain('targetResource', 'foreignField', 'layout', 'allowLink', 'allowUnlink')
		->and($m2a->getConfigAllowContext($ctxField))->toContain('allowedResources', 'multiple', 'sortable', 'minItems', 'maxItems');

	/** @var \ProcessWire\InputfieldReactKeyValue $kvText */
	$kvText = $modules->get('InputfieldReactKeyValue');
	$kvText->attr('name', 'specs_json');
	$kvText->set('hasFieldtype', $modules->get('FieldtypeText'));
	$kvText->set('maxItems', 2);
	$kvText->processInput(makeRelationWireInputData([
		'specs_json_key' => ['cpu', 'ram', 'gpu'],
		'specs_json_val' => ['M4', '32GB', '16-core'],
	]));
	expect($kvText->attr('value'))->toBe('{"cpu":"M4","ram":"32GB"}')
		->and($kvText->getConfigInputfields()->getChildByName('maxItems'))->not->toBeNull()
		->and($kvText->getConfigAllowContext($ctxField))->toContain('keyLabel', 'valueLabel', 'addLabel', 'maxItems');
});

test('FormSchemaSerializer serializes standalone relation Inputfields, bridges native InputfieldPage, and compiles declarative relation schemas', function (): void {
	$workspace = React::instance();
	$modules = wire('modules');

	$wrapper = new InputfieldWrapper();
	wire($wrapper);

	$m2o = new InputfieldReactM2O();
	wire($m2o);
	$m2o->attr('name', 'source_tpl');
	$m2o->label = 'Source Template';
	$m2o->set('resource', 'template');
	$m2o->set('valueField', 'name');
	$m2o->attr('value', 'home');
	$wrapper->add($m2o);

	/** @var InputfieldPage $nativePage */
	$nativePage = $modules->get('InputfieldPage');
	$nativePage->attr('name', 'author_user');
	$nativePage->label = 'Author User';
	$nativePage->set('inputfield', 'InputfieldPageAutocomplete');
	$nativePage->set('findPagesSelector', 'template=user, include=all');
	$nativePage->set('derefAsPage', 1);
	$wrapper->add($nativePage);

	$serialized = $workspace->serializeForm($wrapper);
	$byName = [];
	foreach ($serialized['fields'] as $node) {
		if (isset($node['name'])) {
			$byName[(string) $node['name']] = $node;
		}
	}

	expect($byName['source_tpl']['type'])->toBe('relation')
		->and($byName['source_tpl']['cardinality'])->toBe('m2o')
		->and($byName['source_tpl']['resource'])->toBe('template')
		->and($byName['source_tpl']['value'])->toBe('home')
		->and($byName['author_user']['type'])->toBe('relation')
		->and($byName['author_user']['resource'])->toBe('user')
		->and($byName['author_user']['widget'])->toBe('autocomplete');

	$declarative = $workspace->serializeFormDefinitions([
		[
			'name' => 'kind',
			'type' => 'select',
			'label' => 'Kind',
			'options' => ['page' => 'Page', 'role' => 'Role'],
			'value' => 'page',
		],
		[
			'name' => 'target',
			'type' => 'm2o',
			'label' => 'Target',
			'resource' => 'template',
			'dependsOn' => 'kind',
			'dependsResourceMap' => ['page' => 'template', 'role' => 'role'],
			'valueField' => 'name',
			'value' => 'home',
		],
		[
			'name' => 'spotlights',
			'type' => 'm2a',
			'label' => 'Spotlights',
			'allowedResources' => ['page', 'template'],
			'value' => ['page:1', 'template:home'],
		],
	]);

	expect($declarative['fields'][1]['type'])->toBe('relation')
		->and($declarative['fields'][1]['dependsOn'])->toBe('kind')
		->and($declarative['fields'][1]['dependsResourceMap'])->toBe(['page' => 'template', 'role' => 'role'])
		->and($declarative['fields'][2]['cardinality'])->toBe('m2a')
		->and($declarative['values']['spotlights'])->toBe(['page:1', 'template:home']);
});

test('handleRelationAction enforces authentication, HMAC relationToken binding, CSRF on mutations, allowedResources bounds, and cascading dependsResourceMap', function (): void {
	$workspace = React::instance();
	$currentUser = wire('user');
	$uid = (int) $currentUser->id;

	$signedToken = $workspace->relationSigner()->sign([
		'cardinality' => 'm2o',
		'resource' => 'template',
		'valueField' => 'name',
		'dependsResourceMap' => ['page' => 'template', 'role' => 'role'],
		'creatable' => false,
	], $uid);

	// 1. Guest user rejected with 403
	$guestUser = wire('users')->getGuestUser();
	if ($guestUser instanceof User) {
		$guestRes = $workspace->handleRelationAction([
			'action' => 'search',
			'relationToken' => $signedToken,
		], false, $guestUser);
		expect($guestRes['ok'])->toBeFalse()
			->and($guestRes['status'])->toBe(403);
	}

	// 2. Missing and tampered tokens rejected
	expect($workspace->handleRelationAction(['action' => 'search'])['status'])->toBe(400);
	$tamperedRes = $workspace->handleRelationAction([
		'action' => 'search',
		'relationToken' => $signedToken . 'tampered',
	]);
	expect($tamperedRes['ok'])->toBeFalse()
		->and($tamperedRes['status'])->toBe(403);

	// 3. Cross-user uid mismatch rejected
	$otherUserToken = $workspace->relationSigner()->sign(['cardinality' => 'm2o', 'resource' => 'template'], $uid + 9999);
	expect($workspace->handleRelationAction([
		'action' => 'search',
		'relationToken' => $otherUserToken,
	])['status'])->toBe(403);

	// 4. Valid search + cascading dependsResourceMap switching
	$tplSearch = $workspace->handleRelationAction([
		'action' => 'search',
		'relationToken' => $signedToken,
		'dependsValue' => 'page',
		'q' => 'home',
	]);
	expect($tplSearch['ok'])->toBeTrue()
		->and($tplSearch['resource'])->toBe('template')
		->and($tplSearch['total'])->toBeGreaterThanOrEqual(1);

	$roleSearch = $workspace->handleRelationAction([
		'action' => 'search',
		'relationToken' => $signedToken,
		'dependsValue' => 'role',
		'q' => 'superuser',
	]);
	expect($roleSearch['ok'])->toBeTrue()
		->and($roleSearch['resource'])->toBe('role')
		->and($roleSearch['total'])->toBeGreaterThanOrEqual(1);

	// 5. CSRF enforcement on mutating actions (`quick_create`, `o2m_link`, `o2m_unlink`)
	$csrfRes = $workspace->handleRelationAction([
		'action' => 'quick_create',
		'relationToken' => $signedToken,
		'payload' => ['title' => 'Should Fail CSRF'],
	], true);
	expect($csrfRes['ok'])->toBeFalse()
		->and($csrfRes['status'])->toBe(419);

	// 6. Non-creatable token blocked from `quick_create` even without CSRF failure
	$nonCreatableRes = $workspace->handleRelationAction([
		'action' => 'quick_create',
		'relationToken' => $signedToken,
		'payload' => ['title' => 'Blocked'],
	], false);
	expect($nonCreatableRes['ok'])->toBeFalse()
		->and($nonCreatableRes['status'])->toBe(403);

	// 7. M2A rejects probing resources outside signed `allowedResources`
	$m2aToken = $workspace->relationSigner()->sign([
		'cardinality' => 'm2a',
		'allowedResources' => ['page', 'template'],
	], $uid);
	$probedUserRes = $workspace->handleRelationAction([
		'action' => 'search',
		'relationToken' => $m2aToken,
		'resource' => 'user',
	]);
	expect($probedUserRes['ok'])->toBeFalse()
		->and($probedUserRes['status'])->toBe(403);

	// 8. Selector injection payload in search query is safely neutralized
	$pageToken = $workspace->relationSigner()->sign([
		'cardinality' => 'm2o',
		'resource' => 'page',
	], $uid);
	$injSearch = $workspace->handleRelationAction([
		'action' => 'search',
		'relationToken' => $pageToken,
		'q' => '", include=all, template=user, id>=1, title*="',
	]);
	expect($injSearch['ok'])->toBeTrue();

	// 9. Authorized inline Page quick_create + cleanup
	$creatablePageToken = $workspace->relationSigner()->sign([
		'cardinality' => 'm2o',
		'resource' => 'page',
		'creatable' => true,
		'createParentId' => 1,
		'createTemplate' => 'page',
	], $uid);
	if (wire('templates')->get('page') !== null) {
		$createdPageId = 0;
		try {
			$createRes = $workspace->handleRelationAction([
				'action' => 'quick_create',
				'relationToken' => $creatablePageToken,
				'payload' => ['title' => 'Rel Quick Created Test Page'],
			], false);
			expect($createRes['ok'])->toBeTrue()
				->and($createRes['item']['label'])->toBe('Rel Quick Created Test Page');
			$createdPageId = (int) $createRes['item']['value'];
			expect($createdPageId)->toBeGreaterThan(1);
		} finally {
			if ($createdPageId > 1) {
				$createdPage = wire('pages')->get($createdPageId);
				if ($createdPage instanceof Page && $createdPage->id > 1) {
					wire('pages')->delete($createdPage, true);
				}
			}
		}
	}
});

test('dependsResourceMap fallback hydrates saved alternate-resource values and FieldResourceAdapter scopes external blueprint fields', function (): void {
	$workspace = React::instance();
	$modules = wire('modules');
	$uid = (int) wire('user')->id;

	// 1. InputfieldReactM2O initial server hydration when saved value belongs to a secondary resource in dependsResourceMap
	/** @var InputfieldReactM2O $cascadedM2O */
	$cascadedM2O = $modules->get('InputfieldReactM2O');
	$cascadedM2O->attr('name', 'target_name');
	$cascadedM2O->set('resource', 'template');
	$cascadedM2O->set('valueField', 'name');
	$cascadedM2O->set('dependsOn', 'source_kind');
	$cascadedM2O->set('dependsResourceMap', ['page' => 'template', 'role' => 'role']);
	$cascadedM2O->attr('value', 'superuser');

	$cascadedProps = $cascadedM2O->inertiaWithData();
	expect($cascadedProps['selectedItems'])->toHaveCount(1)
		->and($cascadedProps['selectedItems'][0]['value'])->toBe('superuser')
		->and($cascadedProps['selectedItems'][0]['resource'])->toBe('role');

	// Also verify /_react/relation hydrate fallback when dependsValue is omitted
	$hydrateToken = $workspace->relationSigner()->sign([
		'cardinality' => 'm2o',
		'resource' => 'template',
		'valueField' => 'name',
		'dependsResourceMap' => ['page' => 'template', 'role' => 'role'],
	], $uid);
	$hydrateRes = $workspace->handleRelationAction([
		'action' => 'hydrate',
		'relationToken' => $hydrateToken,
		'values' => ['superuser'],
	]);
	expect($hydrateRes['ok'])->toBeTrue()
		->and($hydrateRes['items'])->toHaveCount(1)
		->and($hydrateRes['items'][0]['value'])->toBe('superuser');

	// 2. FieldResourceAdapter external scope & hydrate resolver extension contract
	/** @var \Totoglu\React\Relation\Resource\FieldResourceAdapter $fieldAdapter */
	$fieldAdapter = $workspace->relations()->get('field');
	$extScope = 'ext_schema_' . strtolower(uniqid());
	$fieldAdapter->registerScopeResolver('test_ext', static function (string $scope, array $cfg) use ($extScope): ?array {
		if ($scope !== $extScope) {
			return null;
		}
		return [
			new RelationItem(value: 'hero_banner', resource: 'field', resourceLabel: 'Field', label: 'Hero Banner (hero_banner)', badge: 'Image'),
		];
	});
	$fieldAdapter->registerHydrateResolver('test_ext', static function (string $fieldName, array $cfg): ?RelationItem {
		if ($fieldName !== 'hero_banner') {
			return null;
		}
		return new RelationItem(value: 'hero_banner', resource: 'field', resourceLabel: 'Field', label: 'Hero Banner (hero_banner)', badge: 'Image');
	});
	try {
		$scoped = $fieldAdapter->query(
			['dependsValue' => $extScope],
			['fieldtypes' => ['image'], 'valueField' => 'name']
		);
		expect($scoped['items'])->toHaveCount(1)
			->and($scoped['items'][0]->value)->toBe('hero_banner');

		$hydratedExtField = $fieldAdapter->hydrate(['hero_banner'], ['template' => $extScope, 'valueField' => 'name']);
		expect($hydratedExtField)->toHaveCount(1)
			->and($hydratedExtField[0]->value)->toBe('hero_banner')
			->and($hydratedExtField[0]->label)->toContain('Hero Banner');
	} finally {
		$fieldAdapter->unregisterResolvers('test_ext');
	}

	// 3. UserResourceAdapter + RoleResourceAdapter + PermissionResourceAdapter scope confinement + PageResourceAdapter tree/quickCreate confinement
	$userAdapter = $workspace->relations()->get('user');
	$nonSuperUsers = $userAdapter->query([], ['excludeSuperuser' => true, 'valueField' => 'name']);
	$nonSuperNames = array_map(static fn(RelationItem $i): string => (string) $i->value, $nonSuperUsers['items']);
	expect($nonSuperNames)->not->toContain('admin')
		->and($userAdapter->hydrate(['admin'], ['excludeSuperuser' => true, 'valueField' => 'name']))->toBe([]);

	$roleAdapter = $workspace->relations()->get('role');
	expect($roleAdapter->hydrate(['superuser'], ['excludeSuperuser' => true, 'valueField' => 'name']))->toBe([])
		->and($roleAdapter->hydrate(['guest'], ['excludeGuest' => true, 'valueField' => 'name']))->toBe([]);

	$permAdapter = $workspace->relations()->get('permission');
	expect($permAdapter->hydrate(['user-admin'], ['prefix' => ['page-'], 'valueField' => 'name']))->toBe([])
		->and($permAdapter->hydrate(['page-edit'], ['prefix' => ['page-'], 'valueField' => 'name']))->toHaveCount(1);

	$pageAdapter = $workspace->relations()->get('page');
	$adminRootId = (int) (wire()->config->adminRootPageID ?: 2);
	$trashRootId = (int) (wire()->config->trashPageID ?: 7);
	expect($pageAdapter->tree($adminRootId, []))->toBe([])
		->and($pageAdapter->tree($trashRootId, []))->toBe([]);

	$nonSysTemplates = $workspace->relations()->get('template')->query([], ['includeSystem' => false, 'valueField' => 'name']);
	$validTplName = (string) ($nonSysTemplates['items'][0]->value ?? 'home');

	$createdQuickPage = null;
	try {
		$quickItem = $pageAdapter->quickCreate(
			['title' => 'Quick Confinement Test Page'],
			[
				'creatable' => true,
				'createParentId' => 0,
				'parentId' => 1,
				'createTemplate' => '',
				'templates' => [$validTplName],
			]
		);
		$createdQuickPage = wire()->pages->get((int) $quickItem->value);
		expect($createdQuickPage->id)->toBeGreaterThan(1)
			->and((string) $createdQuickPage->template->name)->toBe($validTplName);

		// Subtree confinement: requesting tree(1) when parentId is locked to $createdQuickPage->id must return []
		expect($pageAdapter->tree(1, ['parentId' => (int) $createdQuickPage->id]))->toBe([]);

		// Quick-creating under Admin root when not configured must throw
		expect(static fn() => $pageAdapter->quickCreate(
			['title' => 'Illegal Admin Child', 'parentId' => $adminRootId],
			['creatable' => true, 'templates' => [$validTplName]]
		))->toThrow(\ProcessWire\WireException::class);
	} finally {
		if ($createdQuickPage !== null && (int) $createdQuickPage->id > 1) {
			wire()->pages->delete($createdQuickPage, true);
		}
	}
});

test('o2m_list, UserResourceAdapter, PageResourceAdapter, hydrate limits, and JSON 403 WirePermissionException responses enforce strict scope bounds', function (): void {
	$workspace = React::instance();
	$pw = wire();
	$uid = (int) $pw->user->id;
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);

	// 1. o2m_list ignores forged client ownerId when signed token omits ownerId and caps q at 250 chars
	$unsignedOwnerToken = $workspace->relationSigner()->sign([
		'cardinality' => 'o2m',
		'resource' => 'page',
		'targetResource' => 'page',
		'foreignField' => 'parent',
	], $uid);
	$forgedO2mRes = $workspace->handleRelationAction([
		'action' => 'o2m_list',
		'relationToken' => $unsignedOwnerToken,
		'ownerId' => 1,
		'q' => 'home',
	]);
	expect($forgedO2mRes['ok'])->toBeTrue()
		->and($forgedO2mRes['items'])->toBe([])
		->and($forgedO2mRes['total'])->toBe(0);

	$capturedO2mQ = [];
	$probeResName = 'o2m_cap_probe_' . $suffix;
	$probeAdapter = new class($probeResName, $capturedO2mQ) extends AbstractRelationResource {
		/**
		 * @param list<string> $captured
		 */
		public function __construct(
			private string $probeName,
			private array &$captured,
		) {
			parent::__construct();
		}

		public function name(): string { return $this->probeName; }
		public function label(): string { return 'Probe'; }
		public function icon(): string { return 'search'; }
		public function defaultValueField(): string { return 'id'; }

		public function query(array $params = [], array $config = []): array
		{
			return ['items' => [], 'total' => 0, 'hasMore' => false];
		}

		public function hydrate(array $values, array $config = []): array
		{
			return [];
		}

		public function count(array $config = []): int
		{
			return 0;
		}

		public function queryReverse(string|int $ownerId, string $foreignField, array $params = [], array $config = []): array
		{
			$this->captured[] = (string) ($params['q'] ?? '');

			return ['items' => [], 'total' => 0, 'hasMore' => false];
		}
	};
	$workspace->relations()->register($probeAdapter, $probeResName);

	$signedOwnerToken = $workspace->relationSigner()->sign([
		'cardinality' => 'o2m',
		'resource' => $probeResName,
		'targetResource' => $probeResName,
		'ownerId' => 1,
		'foreignField' => 'title',
	], $uid);
	$longQ = str_repeat('ü', 300);
	$workspace->handleRelationAction([
		'action' => 'o2m_list',
		'relationToken' => $signedOwnerToken,
		'q' => $longQ,
	]);
	expect($capturedO2mQ)->toHaveCount(1)
		->and(mb_strlen($capturedO2mQ[0], 'UTF-8'))->toBe(250);

	// 2. UserResourceAdapter ignores dependsValue when dependsParam is unset and rejects role escalation outside signed roles
	/** @var UserResourceAdapter $userAdapter */
	$userAdapter = $workspace->relations()->get('user');
	$tempRole = null;
	$tempUser = null;
	try {
		$tempRole = $pw->roles->add('rw_rel_scope_' . $suffix);

		$tempUser = $pw->users->add('rw_rel_user_' . $suffix);
		$tempUser->addRole('guest');
		$tempUser->addRole($tempRole);
		$pw->users->save($tempUser);

		$unsetDepRes = $userAdapter->query(
			['dependsValue' => 'superuser'],
			['roles' => [$tempRole->name], 'excludeSuperuser' => false, 'valueField' => 'name'],
		);
		$unsetDepNames = array_map(static fn(RelationItem $i): string => (string) $i->value, $unsetDepRes['items']);
		expect($unsetDepNames)->toContain($tempUser->name)
			->and($unsetDepNames)->not->toContain('admin');

		$escapedRoleRes = $userAdapter->query(
			['dependsValue' => 'superuser'],
			['dependsParam' => 'role', 'roles' => [$tempRole->name], 'excludeSuperuser' => false, 'valueField' => 'name'],
		);
		expect($escapedRoleRes['items'])->toBe([])
			->and($escapedRoleRes['total'])->toBe(0);

		$allowedRoleRes = $userAdapter->query(
			['dependsValue' => $tempRole->name],
			['dependsParam' => 'role', 'roles' => [$tempRole->name], 'valueField' => 'name'],
		);
		$allowedRoleNames = array_map(static fn(RelationItem $i): string => (string) $i->value, $allowedRoleRes['items']);
		expect($allowedRoleNames)->toContain($tempUser->name);

		// UserResourceAdapter::hydrate() caps >500 inputs and appends limit=500
		$hydrateUserSelectors = [];
		$hookUserHydrateId = $pw->addHookBefore('Pages::find', static function (HookEvent $event) use (&$hydrateUserSelectors): void {
			$hydrateUserSelectors[] = (string) $event->arguments(0);
		});
		try {
			$overCapInputs = [$tempUser->name];
			for ($i = 0; $i < 515; $i++) {
				$overCapInputs[] = 'rw_missing_user_' . $i;
			}
			$overCapInputs[] = 'admin';
			$hydratedUsers = $userAdapter->hydrate($overCapInputs, ['valueField' => 'name', 'excludeSuperuser' => false]);
			$hydratedNames = array_map(static fn(RelationItem $i): string => (string) $i->value, $hydratedUsers);
			expect($hydratedNames)->toContain($tempUser->name)
				->and($hydratedNames)->not->toContain('admin')
				->and(implode("\n", $hydrateUserSelectors))->toContain('limit=500');
		} finally {
			$pw->removeHook($hookUserHydrateId);
		}
	} finally {
		if ($tempUser instanceof User && $tempUser->id > 0) {
			try {
				$pw->users->delete($tempUser, true);
			} catch (\Throwable) {
			}
		}
		if ($tempRole instanceof Role && $tempRole->id > 0) {
			try {
				$pw->roles->delete($tempRole);
			} catch (\Throwable) {
			}
		}
	}

	// 3. PageResourceAdapter blocks dependsValue=admin escape and appends limit=500 in hydrate()
	/** @var PageResourceAdapter $pageAdapter */
	$pageAdapter = $workspace->relations()->get('page');
	$adminEscapeWithTpls = $pageAdapter->query(
		['dependsValue' => 'admin'],
		['dependsParam' => 'template', 'templates' => ['home']],
	);
	$adminEscapeOpen = $pageAdapter->query(
		['dependsValue' => 'admin'],
		['dependsParam' => 'template'],
	);
	expect($adminEscapeWithTpls['items'])->toBe([])
		->and($adminEscapeOpen['items'])->toBe([]);

	$hydratePageSelectors = [];
	$hookPageHydrateId = $pw->addHookBefore('Pages::find', static function (HookEvent $event) use (&$hydratePageSelectors): void {
		$hydratePageSelectors[] = (string) $event->arguments(0);
	});
	try {
		$pageAdapter->hydrate(['home'], ['valueField' => 'name']);
		expect(implode("\n", $hydratePageSelectors))->toContain('limit=500');
	} finally {
		$pw->removeHook($hookPageHydrateId);
	}

	// 4. WirePermissionException returns JSON HTTP 403 on both /_react/relation and /_react/viewport
	$permRelHookId = $pw->addHookBefore('Pages::find', static function (): void {
		throw new WirePermissionException('Forbidden relation access');
	});
	try {
		$relToken = $workspace->relationSigner()->sign([
			'cardinality' => 'm2o',
			'resource' => 'page',
		], $uid);
		$relPermRes = $workspace->handleRelationAction([
			'action' => 'search',
			'relationToken' => $relToken,
			'q' => 'home',
		]);
		expect($relPermRes['ok'])->toBeFalse()
			->and($relPermRes['status'])->toBe(403)
			->and($relPermRes['error'])->toBe('Forbidden relation access');
	} finally {
		$pw->removeHook($permRelHookId);
	}

	$permProviderId = 'perm_test_' . $suffix . ':boom';
	$permProvider = new class($permProviderId) implements ReactDataProviderInterface {
		public bool $throwOnQuery = false;

		public function __construct(private string $id) {}
		public function id(): string { return $this->id; }
		public function title(): string { return 'Perm Test'; }
		public function columns(): array { return ['title' => 'Title']; }
		public function sortableColumns(): array { return []; }
		public function statusOptions(): array { return []; }
		public function isLocked(): bool { return false; }
		public function query(array $criteria = []): ReactPageResult {
			if ($this->throwOnQuery) {
				throw new WirePermissionException('Forbidden viewport access');
			}

			return new ReactPageResult([], 0, 1, 25);
		}
		public function mutate(string $operation, array $ids, array $payload = []): int { return 0; }
	};
	$workspace->providers()->register($permProviderId, $permProvider);
	$prevHttpStatus = http_response_code();
	try {
		$vp = $workspace->configureTable($permProviderId);
		$stateToken = $vp->signViewportState();
		$permProvider->throwOnQuery = true;
		$pw->input->post->set('stateToken', $stateToken);
		$pw->input->post->set('action', 'fetch');
		$rawJson = $workspace->handleViewportRequest(new HookEvent());
		$decoded = json_decode($rawJson, true);
		expect(http_response_code())->toBe(403)
			->and($decoded)->toBe([
				'ok' => false,
				'error' => 'Forbidden viewport access',
			]);
	} finally {
		$pw->input->post->remove('stateToken');
		$pw->input->post->remove('action');
		if (is_int($prevHttpStatus) && $prevHttpStatus > 0) {
			http_response_code($prevHttpStatus);
		}
	}
});
