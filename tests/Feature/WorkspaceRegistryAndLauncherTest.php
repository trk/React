<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\HookEvent;
use ProcessWire\ProcessReactWorkspace;
use ProcessWire\React;
use ProcessWire\User;
use Totoglu\React\Icon\IconManager;
use Totoglu\React\Inertia\ProcessReact;
use Totoglu\React\Workspace\WorkspaceDefinition;
use Totoglu\React\Workspace\WorkspaceLauncherProcess;
use Totoglu\React\Workspace\WorkspacePreferenceStore;
use Totoglu\React\Workspace\WorkspaceRegistry;
use Totoglu\React\Workspace\WorkspaceWidgetDefinition;
use Totoglu\React\Workspace\WorkspaceWidgetRegistry;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

if (!class_exists('RwLauncherFixture', false)) {
	class RwLauncherFixture extends WorkspaceLauncherProcess
	{
		public static function getModuleInfo(): array
		{
			return [
				'title' => 'Workspace',
				'version' => 10,
				'useNavJSON' => false,
				'permissionMethod' => 'checkAccess',
				'page' => [
					'name' => 'workspace',
					'parent' => '',
					'title' => 'Workspace',
				],
			];
		}
	}
}

if (!class_exists('RwNavDemoProcessFixture', false)) {
	class RwNavDemoProcessFixture extends ProcessReact
	{
		public static function getModuleInfo(): array
		{
			return [
				'title' => 'Nav Demo',
				'version' => 1,
				'useNavJSON' => true,
			];
		}

		public function ___executeNavJSON(array $options = []): string|array
		{
			IconManager::registerAdminIcons(['layout-dashboard', 'adjustments-horizontal', 'database', 'circle-plus']);
			$items = [
				['url' => '', 'label' => 'Overview', 'icon' => 'layout-dashboard', 'separator' => true],
				['url' => 'rules/', 'label' => 'Rules &amp; Defaults', 'badge' => '4 &amp; 2', 'icon' => 'sliders', 'separator' => true],
				['url' => 'custom/', 'label' => 'Custom', 'icon' => 'alien-unregistered-xyz', 'fallbackIcon' => 'database', 'dynamicIcon' => true],
			];

			return $this->buildAdminNavJSON($items, array_merge($options, [
				'add' => 'edit/',
				'addLabel' => 'New &amp; Item',
				'addIcon' => 'circle-plus',
			]));
		}
	}
}

if (!class_exists('RwRawNavDemoProcessFixture', false)) {
	class RwRawNavDemoProcessFixture extends ProcessReact
	{
		public static function getModuleInfo(): array
		{
			return [
				'title' => 'Raw Nav Demo',
				'version' => 1,
				'useNavJSON' => true,
			];
		}

		public function ___executeNavJSON(array $options = []): string|array
		{
			$options['items'] = [
				['id' => '', 'name' => 'Overview'],
				['id' => './', 'name' => 'Root'],
				['id' => 'sub/', 'name' => 'Sub'],
			];
			$options['edit'] = '{id}';
			$options['sort'] = false;

			return parent::___executeNavJSON($options);
		}
	}
}

function rwSetSuperuser(): ?User
{
	$users = wire('users');
	if (!$users) {
		return null;
	}
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$admin = $users->get($superId);
	if (!$admin instanceof User || !$admin->id) {
		$admin = $users->get('roles=superuser');
	}
	if ($admin instanceof User && $admin->id) {
		$users->setCurrentUser($admin);
		return $admin;
	}

	return null;
}

beforeEach(function (): void {
	bootReactForTesting();
	rwSetSuperuser();
});

test('WorkspaceDefinition and WorkspaceRegistry register, sort, resolve URLs, and filter by user permissions', function (): void {
	/** @var React $workspace */
	$workspace = wire('react');
	$registry = $workspace->workspaces();

	expect($registry)->toBeInstanceOf(WorkspaceRegistry::class);

	$workspace->registerWorkspace([
		'id' => 'zeta-app',
		'title' => 'Zeta App',
		'description' => 'Zeta custom workspace.',
		'icon' => 'fa-bolt',
		'url' => '/processwire/setup/zeta/',
		'permission' => 'zeta-access',
		'category' => 'Custom',
		'order' => 90,
	]);

	$workspace->registerWorkspace(new WorkspaceDefinition(
		id: 'alpha-app',
		title: 'Alpha App',
		description: 'Alpha callback-gated workspace.',
		icon: 'shield',
		url: '/processwire/setup/alpha/',
		accessCallback: static fn(User $u): bool => $u->name === 'alpha-editor' || $u->isSuperuser(),
		category: 'Security',
		order: 5,
	));

	expect($registry->has('zeta-app'))->toBeTrue()
		->and($registry->has('alpha-app'))->toBeTrue()
		->and($registry->get('zeta-app')?->icon)->toBe('bolt')
		->and($registry->resolveUrl('zeta-app'))->toBe('/processwire/setup/zeta/');

	$allKeys = array_keys($registry->all());
	expect(array_search('alpha-app', $allKeys, true))->toBeLessThan(array_search('zeta-app', $allKeys, true));

	$superuser = rwSetSuperuser();
	expect($superuser)->toBeInstanceOf(User::class);
	if ($superuser instanceof User) {
		$accessibleSuper = $registry->accessible($superuser);
		expect($accessibleSuper)->toHaveKey('alpha-app')
			->and($accessibleSuper)->toHaveKey('zeta-app');
	}

	$restrictedUser = new User();
	wire($restrictedUser);
	$restrictedUser->id = 999001;
	$restrictedUser->name = 'plain-viewer';
	$restrictedUser->addRole('guest');

	expect($registry->canAccess('zeta-app', $restrictedUser))->toBeFalse()
		->and($registry->canAccess('alpha-app', $restrictedUser))->toBeFalse();

	$alphaEditor = new User();
	wire($alphaEditor);
	$alphaEditor->id = 999002;
	$alphaEditor->name = 'alpha-editor';
	expect($registry->canAccess('alpha-app', $alphaEditor))->toBeTrue()
		->and($registry->canAccess('zeta-app', $alphaEditor))->toBeFalse();

	$registry->unregister('zeta-app')->unregister('alpha-app');
	expect($registry->has('zeta-app'))->toBeFalse();
});

test('React::getWorkspaceDefinitions hook registers third-party workspaces cleanly', function (): void {
	$pw = wire();
	$hookId = $pw->addHookAfter('React::getWorkspaceDefinitions', function (HookEvent $event): void {
		$defs = is_array($event->return) ? $event->return : [];
		$defs[] = [
			'id' => 'hooked-crm',
			'title' => 'Hooked CRM',
			'description' => 'Registered via React::getWorkspaceDefinitions hook.',
			'icon' => 'users',
			'url' => '/processwire/setup/crm/',
			'order' => 75,
		];
		$event->return = $defs;
	});

	$freshWorkspace = new React();
	$pw->wire($freshWorkspace);
	$freshWorkspace->init();

	expect($freshWorkspace->workspaces()->has('hooked-crm'))->toBeTrue()
		->and($freshWorkspace->workspaces()->get('hooked-crm')?->title)->toBe('Hooked CRM');

	$pw->removeHook($hookId);
});

test('React is a pure service module without an admin page while WorkspaceLauncherProcess drives the optional Admin > Workspace hub', function (): void {
	expect(is_subclass_of(React::class, \ProcessWire\WireData::class))->toBeTrue()
		->and(is_subclass_of(React::class, \Totoglu\Inertia\ProcessInertia::class))->toBeFalse()
		->and(is_subclass_of(ProcessReactWorkspace::class, WorkspaceLauncherProcess::class))->toBeTrue()
		->and(is_subclass_of(ProcessReactWorkspace::class, \Totoglu\Inertia\ProcessInertia::class))->toBeTrue();

	$reactInfo = React::getModuleInfo();
	expect($reactInfo['title'])->toBe('React')
		->and($reactInfo)->not->toHaveKey('page')
		->and($reactInfo['installs'])->not->toContain('ProcessReactWorkspace');

	$info = wire('modules')->getModuleInfoVerbose('ProcessReactWorkspace', ['noCache' => true]);
	expect($info['title'])->toBe('Workspace')
		->and($info['autoload'])->toBeFalse()
		->and($info['requires'])->toContain('React')
		->and($info['useNavJSON'])->toBeFalse()
		->and($info['permissionMethod'])->toBe('checkAccess')
		->and($info['page']['name'])->toBe('workspace')
		->and($info['page']['parent'])->toBe('')
		->and($info['page']['title'])->toBe('Workspace')
		->and(method_exists(ProcessReactWorkspace::class, 'executeNavJSON'))->toBeFalse();

	/** @var React $workspace */
	$workspace = wire('react');
	$workspace->registerWorkspace([
		'id' => 'editor-space',
		'title' => 'Editor Space',
		'description' => 'Accessible to editor.',
		'icon' => 'edit',
		'url' => '/processwire/setup/editor-space/',
		'accessCallback' => static fn(User $u): bool => $u->name === 'workspace-editor' || $u->isSuperuser(),
	]);

	$editorUser = new User();
	wire($editorUser);
	$editorUser->id = 999010;
	$editorUser->name = 'workspace-editor';

	expect(WorkspaceLauncherProcess::checkAccess(['user' => new User()]))->toBeFalse()
		->and(WorkspaceLauncherProcess::checkAccess(['user' => $editorUser]))->toBeTrue();

	$adminUser = rwSetSuperuser();
	expect($adminUser)->toBeInstanceOf(User::class);
	if ($adminUser instanceof User) {
		expect(WorkspaceLauncherProcess::checkAccess(['user' => $adminUser]))->toBeTrue();
	}

	$proc = new ProcessReactWorkspace();
	wire($proc);
	$proc->init();
	$html = $proc->execute();

	expect($html)->toContain('<div id="app"></div>')
		->and($html)->toContain('<script type="application/json" data-page="app">')
		->and($html)->toContain('ReactWorkspace/WorkspaceLauncher')
		->and($html)->toContain('editor-space')
		->and($html)->toContain('Editor Space');

	$workspace->workspaces()->unregister('editor-space');
});

test('ProcessReact modules operate standalone when ProcessReactWorkspace is not installed and integrate into the hub when installed', function (): void {
	/** @var React $react */
	$react = wire('react');

	$react->registerWorkspace([
		'id' => 'catalog-standalone',
		'title' => 'Catalog',
		'description' => 'Catalog metadata.',
		'icon' => 'line-chart',
		'url' => '/processwire/setup/catalog-demo/',
		'process' => 'ProcessCatalogStandaloneFixture',
		'accessCallback' => static fn(): bool => true,
	]);

	$catalogProcess = new class extends ProcessReact {
		public static function getModuleInfo(): array
		{
			return [
				'title' => 'Catalog',
				'version' => 1,
			];
		}
	};
	wire($catalogProcess);

	try {
		// 1. Without ProcessReactWorkspace installed: standalone mode (no hub link, no cross-module switcher)
		$react->setWorkspaceHubEnabled(false);
		$standalonePage = $catalogProcess->inertiaRender('CatalogDemo/Workspace', [
			'title' => 'Catalog',
		])->toPageObject();

		expect($standalonePage['props']['workspace']['launcherUrl'])->toBe('')
			->and($standalonePage['props']['workspace']['launcherScripts'])->toBe([])
			->and($standalonePage['props']['workspace']['workspaces'])->toBe([])
			->and($standalonePage['props']['workspace']['adminUrl'])->not->toBe('');

		// 2. With ProcessReactWorkspace installed: unified hub mode (launcherUrl + cross-module switcher populated)
		$react->setWorkspaceHubEnabled(true);
		$hubPage = $catalogProcess->inertiaRender('CatalogDemo/Workspace', [
			'title' => 'Catalog',
		])->toPageObject();

		expect($hubPage['props']['workspace']['launcherUrl'])->toContain('workspace/')
			->and($hubPage['props']['workspace']['launcherScripts'])->not->toBeEmpty()
			->and(array_column($hubPage['props']['workspace']['workspaces'], 'id'))->toContain('catalog-standalone');
	} finally {
		$react->setWorkspaceHubEnabled(null);
		$react->workspaces()->unregister('catalog-standalone');
	}
});

test('WorkspaceLauncherProcess serializes accessible workspaces, live stats, and initial search query for ReactWorkspace/WorkspaceLauncher', function (): void {
	/** @var React $workspace */
	$workspace = wire('react');
	$workspace->registerWorkspace([
		'id' => 'catalog-app',
		'title' => 'Catalog',
		'description' => 'Manage structured catalog records and singletons.',
		'icon' => 'cubes',
		'url' => '/processwire/setup/catalog-app/',
		'order' => 10,
		'accessCallback' => static fn(): bool => true,
		'stats' => [
			['label' => 'Collections', 'value' => '4'],
			['label' => 'Singles', 'value' => '2'],
		],
	]);
	$workspace->registerWorkspace([
		'id' => 'routing-app',
		'title' => 'Routing',
		'description' => 'Manage URL metadata and redirects.',
		'icon' => 'line-chart',
		'url' => '/processwire/setup/routing-app/',
		'order' => 40,
		'accessCallback' => static fn(): bool => true,
		'statsCallback' => static fn(): array => [
			['label' => 'Redirects', 'value' => '12'],
			['label' => '404 Alerts', 'value' => '3', 'tone' => 'warning'],
		],
	]);

	$adminUser = wire('users')->get('admin');
	if ($adminUser instanceof User && $adminUser->id) {
		wire('users')->setCurrentUser($adminUser);
	}

	wire('input')->get->set('q', 'redirect');

	$proc = new RwLauncherFixture();
	wire($proc);
	$html = $proc->execute();

	expect($html)->toContain('ReactWorkspace/WorkspaceLauncher')
		->and($html)->toContain('catalog-app')
		->and($html)->toContain('routing-app')
		->and($html)->toContain('Collections')
		->and($html)->toContain('404 Alerts')
		->and($html)->toContain('"searchQuery":"redirect"');

	wire('input')->get->remove('q');
	$workspace->workspaces()->unregister('catalog-app')->unregister('routing-app');
});

test('ProcessReactWorkspace composer.json and uninstall lifecycle clean up session preferences, registries, and fuel', function (): void {
	$composer = json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/composer.json'), true);
	$mainVersion = React::getModuleInfo()['version'] ?? null;
	expect($composer)->not->toHaveKey('version')
		->and($mainVersion)->toBeInt()->toBeGreaterThan(0)
		->and($composer['require']['trk/processwire-inertia'] ?? null)->toBe('^1.0');

	foreach (React::getModuleInfo()['installs'] ?? [] as $companionModule) {
		$subVersion = wire('modules')->getModuleInfoVerbose($companionModule, ['noCache' => true])['version'] ?? null;
		expect($subVersion)->toBeInt()
			->toBeGreaterThan(0)
			->toBeLessThanOrEqual($mainVersion);
	}

	$pw = wire();
	$existing = wire('react');
	$session = wire('session');

	// Snapshot any existing user preference JSON files so the test never wipes live preferences
	$prefStore = ($existing instanceof React ? $existing : bootReactForTesting())->workspacePreferences();
	$prefDir = $prefStore->directoryPath();
	$savedPrefFiles = [];
	if (is_dir($prefDir)) {
		foreach (glob($prefDir . '*.json') ?: [] as $file) {
			if (is_file($file)) {
				$savedPrefFiles[$file] = (string) file_get_contents($file);
			}
		}
	}

	$isolated = new class extends React {
		public function className($options = null): string
		{
			return 'React';
		}
	};
	$pw->wire($isolated);

	try {
		$isolated->___install();
		$cssPath = $isolated->icons()->generateAdminCss();
		expect(is_file($cssPath))->toBeTrue()
			->and(React::getModuleInfo()['installs'])->toContain('TextformatterTiptapMiniBlocks')
			->and(React::getModuleInfo()['installs'])->toContain('InputfieldReactIcon')
			->and(React::getModuleInfo()['installs'])->toContain('InputfieldReactLink');
		$session->setFor('ReactViewPrefs', 'test_scope', ['limit' => 25]);

		$isolated->___uninstall();

		expect($session->getFor('ReactViewPrefs', 'test_scope'))->toBeNull()
			->and(is_file($cssPath))->toBeFalse()
			->and(wire()->fuel->get('react'))->toBeNull();
	} finally {
		if ($savedPrefFiles !== []) {
			if (!is_dir($prefDir)) {
				@mkdir($prefDir, 0755, true);
			}
			foreach ($savedPrefFiles as $file => $contents) {
				@file_put_contents($file, $contents, LOCK_EX);
			}
		}
		if ($existing instanceof React) {
			wire()->fuel->set('react', $existing);
			wire('modules')->set('React', $existing);
		} else {
			bootReactForTesting();
		}
	}
});

test('ProcessReact and InteractWithReact bind standalone views/admin.php Root View, shared workspace context, embedded MarkupReactTable viewData assets, and React Islands', function (): void {
	$workspace = React::instance();

	$inertiaProcess = new class extends ProcessReact {
		public function getWorkspaceDefinition(): WorkspaceDefinition
		{
			return WorkspaceDefinition::fromArray([
				'id' => 'inertia-demo',
				'title' => 'Inertia Demo Workspace',
				'description' => 'Test workspace powered by ProcessReact.',
				'icon' => 'rocket',
				'url' => '/processwire/setup/inertia-demo/',
				'process' => 'ProcessInertiaDemo',
				'permission' => 'page-edit',
			]);
		}

		public function getModuleScriptAssets(): array
		{
			return ['/site/modules/Demo/Demo.js'];
		}
	};
	wire($inertiaProcess);

	$table = $workspace->configureTable([
		['id' => '1', 'title' => 'Demo Row'],
	]);

	$response = $inertiaProcess->inertiaRender('Demo/Workspace', [
		'title' => 'Inertia Demo Workspace',
		'activeTab' => 'overview',
		'table' => $table,
	]);

	$pageObject = $response->toPageObject();
	expect($pageObject['component'])->toBe('Demo/Workspace')
		->and($pageObject['props']['activeTab'])->toBe('overview')
		->and($pageObject['props']['table']['component'] ?? null)->toBe('ReactWorkspace/Table')
		->and($pageObject['props']['table']['records'][0]['title'] ?? null)->toBe('Demo Row')
		->and($pageObject['props']['workspace'])->toBeArray()
		->and($pageObject['props']['workspace']['activeWorkspace']['id'] ?? null)->toBe('inertia-demo')
		->and($pageObject['sharedProps'] ?? [])->toContain('workspace');

	$html = $response->toOutput();
	expect($html)
		->toContain('<!DOCTYPE html>')
		->toContain('id="pw-color-scheme-tokens"')
		->toContain('--pw-main-color:')
		->toContain('ReactInertia.css')
		->toContain('ReactInertia.js')
		->toContain('/site/modules/Demo/Demo.js')
		->toContain('<div id="app"></div>')
		->toContain('<script type="application/json" data-page="app">');

	$islandHtml = $workspace->renderIsland('Demo/FieldIsland', ['field' => 'seo_title']);
	expect($islandHtml)
		->toContain('data-inertia-island="Demo/FieldIsland"')
		->toContain('data-react-island="Demo/FieldIsland"')
		->toContain('seo_title');
});

test('ProcessReactWorkspace resolveAdminReturnLabel defaults to Panel and supports language-aware overrides', function (): void {
	/** @var React $workspace */
	$workspace = wire('react');

	expect($workspace->resolveAdminReturnLabel())->toBe('Panel');

	$workspace->set('adminReturnLabel', 'Control Panel');
	expect($workspace->resolveAdminReturnLabel())->toBe('Control Panel');

	$user = rwSetSuperuser();
	if ($user instanceof User && $user->language && $user->language->id && !$user->language->isDefault()) {
		$langKey = 'adminReturnLabel__' . (int) $user->language->id;
		$workspace->set($langKey, 'Yönetim Paneli');
		expect($workspace->resolveAdminReturnLabel($user))->toBe('Yönetim Paneli');
		$workspace->set($langKey, '');
	}

	$workspace->set('adminReturnLabel', 'Panel');
	expect($workspace->resolveAdminReturnLabel())->toBe('Panel');
});

test('WorkspaceWidgetRegistry registers module widgets, enforces parent workspace availability, and resolves live metrics and items', function (): void {
	/** @var React $workspace */
	$workspace = wire('react');
	$widgets = $workspace->widgets();

	expect($widgets)->toBeInstanceOf(WorkspaceWidgetRegistry::class);

	$workspace->registerWorkspace([
		'id' => 'analytics-hub',
		'title' => 'Analytics',
		'description' => 'Traffic & event metrics.',
		'icon' => 'bar-chart-3',
		'url' => '/processwire/setup/analytics-hub/',
		'accessCallback' => static fn(): bool => true,
	]);

	$workspace->registerWidget(new WorkspaceWidgetDefinition(
		id: 'analytics-summary',
		title: 'Analytics Overview',
		workspaceId: 'analytics-hub',
		subtitle: 'Real-time traffic metrics',
		icon: 'bar-chart-3',
		size: 'lg',
		order: 15,
		dataCallback: static fn(): array => [
			'status' => ['label' => 'Live', 'tone' => 'success'],
			'metrics' => [
				['label' => 'Visitors', 'value' => '1,240', 'tone' => 'primary'],
				['label' => 'Bounce Rate', 'value' => '28%', 'tone' => 'success'],
			],
			'items' => [
				[
					'id' => 'top-page',
					'title' => '/products/enterprise',
					'subtitle' => '420 views today',
					'badge' => 'Top URL',
					'badgeVariant' => 'primary',
					'href' => '/processwire/setup/analytics-hub/',
				],
			],
			'actions' => [
				['label' => 'Open Analytics', 'href' => '/processwire/setup/analytics-hub/', 'variant' => 'primary'],
				['label' => 'Unsafe Action', 'href' => 'javascript:alert(1)', 'variant' => 'outline'],
			],
		],
	));

	$workspace->registerWidget([
		'id' => 'orphan-widget',
		'title' => 'Orphan Widget',
		'workspaceId' => 'non-existent-module-workspace',
		'data' => [
			'metrics' => [['label' => 'Orphan', 'value' => '0']],
		],
	]);

	$user = rwSetSuperuser();
	expect($widgets->has('analytics-summary'))->toBeTrue()
		->and($widgets->canAccess('analytics-summary', $user))->toBeTrue()
		->and($widgets->canAccess('orphan-widget', $user))->toBeFalse();

	$serialized = $widgets->accessible($user);
	expect($serialized)->toHaveKey('analytics-summary')
		->and($serialized)->not->toHaveKey('orphan-widget');

	$found = $serialized['analytics-summary'] ?? null;

	expect($found)->toBeArray()
		->and($found['workspaceTitle'] ?? null)->toBe('Analytics')
		->and($found['metrics'][0]['value'] ?? null)->toBe('1,240')
		->and($found['items'][0]['title'] ?? null)->toBe('/products/enterprise')
		->and($found['actions'] ?? [])->toHaveCount(1);

	// Unregistering the parent workspace automatically hides the child widget
	$workspace->workspaces()->unregister('analytics-hub');
	expect($widgets->canAccess('analytics-summary', $user))->toBeFalse();

	$widgets->unregister('analytics-summary')->unregister('orphan-widget');
});

test('WorkspacePreferenceStore persists per-user JSON files in cache/ProcessReactWorkspace/[user-id].json and self-heals when modules or widgets are removed', function (): void {
	/** @var React $workspace */
	$workspace = wire('react');
	$store = $workspace->workspacePreferences();

	expect($store)->toBeInstanceOf(WorkspacePreferenceStore::class);

	$testUser = new User();
	wire($testUser);
	$testUser->id = 888777;
	$testUser->name = 'prefs-tester';
	$testUser->addRole('superuser');

	$filePath = $store->filePath($testUser);
	expect($filePath)->toEndWith('/React/workspaces/888777.json');

	$store->reset($testUser);

	$accessibleWorkspaces = [
		'entries' => ['id' => 'entries', 'title' => 'Entries'],
		'navigation' => ['id' => 'navigation', 'title' => 'Navigation'],
		'seo' => ['id' => 'seo', 'title' => 'SEO'],
	];
	$accessibleWidgets = [
		'entries-overview' => ['id' => 'entries-overview', 'title' => 'Entries'],
		'navigation-overview' => ['id' => 'navigation-overview', 'title' => 'Navigation'],
		'seo-overview' => ['id' => 'seo-overview', 'title' => 'SEO'],
	];

	// Save preferences including stale/deleted module & widget IDs
	$store->savePreferences([
		'favorites' => ['seo', 'deleted-stale-module', 'entries'],
		'widgetOrder' => ['seo-overview', 'removed-widget', 'entries-overview'],
		'hiddenWidgets' => ['navigation-overview', 'removed-widget'],
		'widgetSizes' => [
			'seo-overview' => 'lg',
			'removed-widget' => 'full',
		],
	], $testUser);

	expect(is_file($filePath))->toBeTrue();

	// Reconcile against active workspaces & widgets -> stale entries pruned, missing active widget appended
	$reconciled = $store->reconcile($accessibleWorkspaces, $accessibleWidgets, $testUser);

	expect($reconciled['favorites'])->toBe(['seo', 'entries'])
		->and($reconciled['widgetOrder'])->toBe(['seo-overview', 'entries-overview', 'navigation-overview'])
		->and($reconciled['hiddenWidgets'])->toBe(['navigation-overview'])
		->and($reconciled['widgetSizes'])->toBe(['seo-overview' => 'lg']);

	// Register navigation workspace and entries-overview widget on $workspace so handleWorkspacePrefsAction's reconcile() retains them
	$workspace->registerWorkspace([
		'id' => 'navigation',
		'title' => 'Navigation',
		'description' => 'Menus',
		'url' => '/processwire/setup/navigation/',
		'accessCallback' => static fn(): bool => true,
	]);
	$workspace->registerWorkspace([
		'id' => 'entries',
		'title' => 'Entries',
		'description' => 'Collections',
		'url' => '/processwire/setup/entries/',
		'accessCallback' => static fn(): bool => true,
	]);
	$workspace->registerWidget([
		'id' => 'entries-overview',
		'title' => 'Entries',
		'workspaceId' => 'entries',
	]);

	// Toggle favorite & widget size via ProcessReactWorkspace action handler
	$afterFav = $workspace->handleWorkspacePrefsAction([
		'action' => 'toggle_favorite',
		'workspaceId' => 'navigation',
	], false, $testUser);
	expect($afterFav['ok'])->toBeTrue()
		->and($afterFav['preferences']['favorites'] ?? [])->toContain('navigation');

	$afterResize = $workspace->handleWorkspacePrefsAction([
		'action' => 'resize_widget',
		'widgetId' => 'entries-overview',
		'size' => 'lg',
	], false, $testUser);
	expect($afterResize['ok'])->toBeTrue()
		->and($afterResize['preferences']['widgetSizes']['entries-overview'] ?? null)->toBe('lg');

	$workspace->widgets()->unregister('entries-overview');
	$workspace->workspaces()->unregister('navigation')->unregister('entries');
	$store->reset($testUser);
	expect(is_file($filePath))->toBeFalse();
});

test('ProcessReactWorkspace isolates module assets and defers widget and stats evaluation until the Workspace Dashboard is requested', function (): void {
	$pw = wire();
	$prevWorkspace = $pw->fuel->get('react');
	$freshWorkspace = new React();
	$pw->wire($freshWorkspace);
	$freshWorkspace->setWorkspaceHubEnabled(true);
	$pw->fuel->set('react', $freshWorkspace);
	$pw->modules->set('React', $freshWorkspace);

	$statsEvaluations = 0;
	$widgetHookEvaluations = 0;
	$widgetDataEvaluations = 0;

	$wsHookId = $pw->addHookAfter('React::registerWorkspaces', function (HookEvent $event) use (&$statsEvaluations): void {
		/** @var React $ws */
		$ws = $event->object;
		$ws->registerWorkspace([
			'id' => 'lazy-catalog',
			'title' => 'Catalog',
			'description' => 'Product catalog management.',
			'icon' => 'shopping-bag',
			'url' => '/processwire/setup/catalog/',
			'process' => 'ProcessCatalogApp',
			'component' => 'Catalog/Workspace',
			'scripts' => ['/site/modules/ProcessCatalogApp/dist/ProcessCatalogApp.js'],
			'accessCallback' => static fn(): bool => true,
			'statsCallback' => static function () use (&$statsEvaluations): array {
				$statsEvaluations++;
				return [['label' => 'Products', 'value' => '42']];
			},
		]);
	});

	$widgetHookId = $pw->addHookAfter('React::registerWidgets', function (HookEvent $event) use (&$widgetHookEvaluations, &$widgetDataEvaluations): void {
		$widgetHookEvaluations++;
		/** @var React $ws */
		$ws = $event->object;
		$ws->registerWidget([
			'id' => 'lazy-catalog-widget',
			'title' => 'Catalog Health',
			'workspaceId' => 'lazy-catalog',
			'dataCallback' => static function () use (&$widgetDataEvaluations): array {
				$widgetDataEvaluations++;
				return [
					'metrics' => [['label' => 'Score', 'value' => '98%']],
				];
			},
		]);
	});

	$testUser = rwSetSuperuser();
	$store = $freshWorkspace->workspacePreferences();
	$userPrefFile = $store->filePath($testUser);
	$hadUserPrefFile = $userPrefFile !== '' && is_file($userPrefFile);
	$prevUserPrefContent = $hadUserPrefFile ? (string) file_get_contents($userPrefFile) : null;

	try {
		// 1. Before any workspace or widget request, nothing is resolved or evaluated
		expect($freshWorkspace->isWorkspacesResolved())->toBeFalse()
			->and($freshWorkspace->isWidgetsResolved())->toBeFalse()
			->and($statsEvaluations)->toBe(0)
			->and($widgetHookEvaluations)->toBe(0)
			->and($widgetDataEvaluations)->toBe(0);

		// Seed user preferences with widget settings to verify non-dashboard requests preserve them without loading widgets
		$store->savePreferences([
			'favorites' => ['lazy-catalog'],
			'widgetOrder' => ['lazy-catalog-widget'],
			'hiddenWidgets' => ['lazy-catalog-widget'],
			'widgetSizes' => ['lazy-catalog-widget' => 'lg'],
		], $testUser);

		// 2. Visiting a downstream module page builds shared nav context and root view data:
		//    - Workspaces nav is resolved WITHOUT evaluating statsCallback ($statsEvaluations === 0)
		//    - Widgets registry is NOT resolved ($widgetHookEvaluations === 0, $widgetDataEvaluations === 0)
		//    - Saved widget preferences remain intact
		//    - Root view scripts include ReactInertia.js and ProcessCatalogApp.js, NOT ProcessReactWorkspace.js
		$sharedContext = $freshWorkspace->buildInertiaSharedContext(
			null,
			WorkspaceDefinition::fromArray([
				'id' => 'lazy-catalog',
				'title' => 'Catalog',
				'url' => '/processwire/setup/catalog/',
			])
		);

		expect($freshWorkspace->isWorkspacesResolved())->toBeTrue()
			->and($freshWorkspace->isWidgetsResolved())->toBeFalse()
			->and($statsEvaluations)->toBe(0)
			->and($widgetHookEvaluations)->toBe(0)
			->and($widgetDataEvaluations)->toBe(0)
			->and($sharedContext['preferences']['favorites'] ?? [])->toContain('lazy-catalog')
			->and($sharedContext['preferences']['widgetOrder'] ?? [])->toContain('lazy-catalog-widget')
			->and($sharedContext['preferences']['hiddenWidgets'] ?? [])->toContain('lazy-catalog-widget')
			->and($sharedContext['preferences']['widgetSizes']['lazy-catalog-widget'] ?? null)->toBe('lg')
			->and($sharedContext['launcherScripts'] ?? [])->not->toBeEmpty();

		$rootViewData = $freshWorkspace->buildInertiaRootViewData(
			'Catalog',
			['/site/modules/ProcessCatalogApp/dist/ProcessCatalogApp.js']
		);

		$scriptsJoined = implode("\n", $rootViewData['scripts']);
		expect($scriptsJoined)->toContain('ReactInertia.js')
			->and($scriptsJoined)->toContain('/site/modules/ProcessCatalogApp/dist/ProcessCatalogApp.js')
			->and($scriptsJoined)->not->toContain('ProcessReactWorkspace.js');

		// 3. Visiting the Workspace Dashboard (WorkspaceLauncherProcess::___execute()) evaluates stats, widgets, and loads ProcessReactWorkspace.js
		$launcherProc = new RwLauncherFixture();
		$pw->wire($launcherProc);
		$launcherProc->init();
		$dashboardHtml = $launcherProc->execute();

		expect($freshWorkspace->isWidgetsResolved())->toBeTrue()
			->and($statsEvaluations)->toBeGreaterThan(0)
			->and($widgetHookEvaluations)->toBe(1)
			->and($widgetDataEvaluations)->toBe(1)
			->and($dashboardHtml)->toContain('ProcessReactWorkspace.js')
			->and($dashboardHtml)->toContain('lazy-catalog-widget')
			->and($dashboardHtml)->not->toContain('src="/site/modules/ProcessCatalogApp/dist/ProcessCatalogApp.js"');
	} finally {
		$pw->removeHook($wsHookId);
		$pw->removeHook($widgetHookId);
		$freshWorkspace->widgets()->unregister('lazy-catalog-widget');
		$freshWorkspace->workspaces()->unregister('lazy-catalog');
		if ($userPrefFile !== '') {
			if ($hadUserPrefFile && $prevUserPrefContent !== null) {
				@file_put_contents($userPrefFile, $prevUserPrefContent, LOCK_EX);
			} else {
				@unlink($userPrefFile);
			}
		}
		if ($prevWorkspace instanceof React) {
			$pw->fuel->set('react', $prevWorkspace);
			$pw->modules->set('React', $prevWorkspace);
		}
	}
});

test('WorkspacePreferenceStore and handleWorkspacePrefsAction export and import layout JSON presets with strict validation', function (): void {
	/** @var React $workspace */
	$workspace = wire('react');

	$workspace->registerWorkspace([
		'id' => 'preset-ws-a',
		'title' => 'Preset Workspace A',
		'description' => 'First workspace for preset testing.',
		'url' => '/processwire/setup/preset-a/',
		'accessCallback' => static fn(): bool => true,
	]);
	$workspace->registerWidget([
		'id' => 'preset-widget-1',
		'workspaceId' => 'preset-ws-a',
		'title' => 'Preset Widget 1',
		'order' => 10,
	]);
	$workspace->registerWidget([
		'id' => 'preset-widget-2',
		'workspaceId' => 'preset-ws-a',
		'title' => 'Preset Widget 2',
		'order' => 20,
	]);

	$editor = new User();
	wire($editor);
	$editor->id = 999201;
	$editor->name = 'preset-editor';

	try {
		$invalidRes = $workspace->handleWorkspacePrefsAction([
			'action' => 'import_layout',
			'preset' => '{not-valid-json',
		], false, $editor);
		expect($invalidRes['ok'])->toBeFalse()
			->and($invalidRes['status'])->toBe(422);

		$missingKeysRes = $workspace->handleWorkspacePrefsAction([
			'action' => 'import_layout',
			'preset' => ['unrelated' => 'value'],
		], false, $editor);
		expect($missingKeysRes['ok'])->toBeFalse()
			->and($missingKeysRes['status'])->toBe(422);

		$importRes = $workspace->handleWorkspacePrefsAction([
			'action' => 'import_layout',
			'preset' => json_encode([
				'schema' => WorkspacePreferenceStore::PRESET_SCHEMA,
				'layout' => [
					'favorites' => ['preset-ws-a', 'non-existent-ws'],
					'widgetOrder' => ['preset-widget-2', 'preset-widget-1'],
					'hiddenWidgets' => ['preset-widget-1'],
					'widgetSizes' => ['preset-widget-2' => 'lg', 'bad' => 'invalid-size'],
				],
			], JSON_THROW_ON_ERROR),
		], false, $editor);

		expect($importRes['ok'])->toBeTrue()
			->and($importRes['preferences']['favorites'])->toBe(['preset-ws-a'])
			->and($importRes['preferences']['hiddenWidgets'])->toBe(['preset-widget-1'])
			->and($importRes['preferences']['widgetSizes'])->toHaveKey('preset-widget-2', 'lg')
			->and(array_search('preset-widget-2', $importRes['preferences']['widgetOrder'], true))
			->toBeLessThan(array_search('preset-widget-1', $importRes['preferences']['widgetOrder'], true));

		$exportRes = $workspace->handleWorkspacePrefsAction([
			'action' => 'export_layout',
		], false, $editor);

		expect($exportRes['ok'])->toBeTrue()
			->and($exportRes['preset']['schema'])->toBe(WorkspacePreferenceStore::PRESET_SCHEMA)
			->and($exportRes['preset']['layout']['favorites'])->toBe(['preset-ws-a'])
			->and($exportRes['preset']['layout']['widgetSizes']['preset-widget-2'])->toBe('lg');
	} finally {
		$workspace->workspacePreferences()->reset($editor);
		$workspace->widgets()->unregister('preset-widget-1')->unregister('preset-widget-2');
		$workspace->workspaces()->unregister('preset-ws-a');
	}
});

test('EditPresenceStore and handlePresenceAction track live co-editors, ignore self tabs, expire stale locks, bump remote saves, and enforce RBAC and CSRF', function (): void {
	/** @var React $workspace */
	$workspace = wire('react');
	$store = $workspace->presence();

	$workspace->registerWorkspace([
		'id' => 'presence-space',
		'title' => 'Presence Space',
		'url' => '/processwire/setup/presence/',
		'accessCallback' => static fn(User $u): bool => in_array($u->name, ['alice', 'bob'], true) || $u->isSuperuser(),
	]);

	$alice = new User();
	wire($alice);
	$alice->id = 999301;
	$alice->name = 'alice';
	$alice->set('title', 'Alice Yılmaz');

	$bob = new User();
	wire($bob);
	$bob->id = 999302;
	$bob->name = 'bob';
	$bob->set('title', 'Bob Kaya');

	$guestUser = new User();
	wire($guestUser);
	$guestUser->id = (int) (wire('config')->guestUserPageID ?: 40);
	$guestUser->name = 'guest';
	$guestUser->addRole('guest');

	$resourceKey = 'entry:articles:uuid-100';
	$baseNow = 1_750_000_000;

	try {
		// 1. Guest / unauthenticated user gets 403
		$denied = $workspace->handlePresenceAction([
			'action' => 'heartbeat',
			'resourceKey' => $resourceKey,
			'clientId' => 'tab_out',
		], false, $guestUser);
		expect($denied['ok'])->toBeFalse()
			->and($denied['status'])->toBe(403);

		// 2. Missing CSRF when enforceCsrf=true returns 419
		$csrfDenied = $workspace->handlePresenceAction([
			'action' => 'heartbeat',
			'resourceKey' => $resourceKey,
			'clientId' => 'tab_alice_1',
		], true, $alice);
		expect($csrfDenied['ok'])->toBeFalse()
			->and($csrfDenied['status'])->toBe(419);

		// 3. Alice opens the editor in two tabs of her own: zero coEditors (no self-ghosting on refresh/multi-tab)
		$snapAlice1 = $store->heartbeat($resourceKey, $alice, 'tab_a1', 45, $baseNow);
		$snapAlice2 = $store->heartbeat($resourceKey, $alice, 'tab_a2', 45, $baseNow + 2);
		expect($snapAlice1['coEditors'])->toBeEmpty()
			->and($snapAlice2['coEditors'])->toBeEmpty()
			->and($snapAlice2['lastSaved'])->toBeNull();

		// 4. Bob opens the exact same record: Bob immediately sees Alice, and Alice's next heartbeat sees Bob
		$snapBob = $store->heartbeat($resourceKey, $bob, 'tab_b1', 45, $baseNow + 5);
		expect($snapBob['coEditors'])->toHaveCount(1)
			->and($snapBob['coEditors'][0]['userId'])->toBe(999301)
			->and($snapBob['coEditors'][0]['displayName'])->toBe('Alice Yılmaz')
			->and($snapBob['coEditors'][0]['secondsAgo'])->toBe(3);

		$snapAliceAfterBob = $store->heartbeat($resourceKey, $alice, 'tab_a1', 45, $baseNow + 10);
		expect($snapAliceAfterBob['coEditors'])->toHaveCount(1)
			->and($snapAliceAfterBob['coEditors'][0]['userId'])->toBe(999302)
			->and($snapAliceAfterBob['coEditors'][0]['displayName'])->toBe('Bob Kaya');

		// 5. Bob saves the record -> lastSaved version increments to 1 with Bob's identity
		$savedSnap = $store->markSaved($resourceKey, $bob, 'tab_b1', 45, $baseNow + 12);
		expect($savedSnap['lastSaved'])->toBeArray()
			->and($savedSnap['lastSaved']['version'])->toBe(1)
			->and($savedSnap['lastSaved']['userId'])->toBe(999302)
			->and($savedSnap['lastSaved']['displayName'])->toBe('Bob Kaya');

		// Alice's next heartbeat receives Bob's remote save metadata
		$snapAliceStale = $store->heartbeat($resourceKey, $alice, 'tab_a1', 45, $baseNow + 15);
		expect($snapAliceStale['lastSaved']['version'])->toBe(1)
			->and($snapAliceStale['lastSaved']['userName'])->toBe('bob');

		// 6. Bob leaves -> Alice no longer sees Bob as an active co-editor
		$store->leave($resourceKey, $bob, 'tab_b1', 45, $baseNow + 16);
		$snapAliceAfterLeave = $store->heartbeat($resourceKey, $alice, 'tab_a1', 45, $baseNow + 17);
		expect($snapAliceAfterLeave['coEditors'])->toBeEmpty();

		// 7. TTL expiration: Bob joins again at +20, then stalls past 45s TTL -> pruned automatically at +70
		$store->heartbeat($resourceKey, $bob, 'tab_b2', 45, $baseNow + 20);
		$snapAfterTtl = $store->heartbeat($resourceKey, $alice, 'tab_a1', 45, $baseNow + 70);
		expect($snapAfterTtl['coEditors'])->toBeEmpty();

		// 8. FormSchemaSerializer includes presenceKey & presenceEndpoint on root forms and omits on fragments
		$form = wire('modules')->get('InputfieldForm');
		$serializedRoot = $workspace->serializeForm($form, [
			'presenceKey' => $resourceKey,
		]);
		$serializedFragment = $workspace->serializeForm($form, [
			'isFragment' => true,
			'presenceKey' => $resourceKey,
		]);
		expect($serializedRoot['presenceKey'])->toBe($resourceKey)
			->and($serializedRoot['presenceEndpoint'])->toContain('/_react/presence')
			->and($serializedFragment['presenceKey'])->toBeNull();
	} finally {
		$path = $store->filePath($resourceKey);
		if ($path !== '' && is_file($path)) {
			@unlink($path);
		}
		$workspace->workspaces()->unregister('presence-space');
	}
});

test('WorkspacePreferenceStore supports 1-12 column Bento widget spans and FormSchemaSerializer serializes colspan and range controls', function (): void {
	/** @var React $workspace */
	$workspace = wire('react');
	$store = $workspace->workspacePreferences();

	$editor = new User();
	wire($editor);
	$editor->id = 999415;
	$editor->name = 'bento-span-editor';

	$workspace->registerWorkspace([
		'id' => 'bento-ws',
		'title' => 'Bento Space',
		'url' => '/processwire/setup/bento/',
		'accessCallback' => static fn(): bool => true,
	]);
	$workspace->registerWidget([
		'id' => 'bento-widget-alpha',
		'workspaceId' => 'bento-ws',
		'title' => 'Alpha Telemetry',
		'size' => '4',
	]);

	try {
		$widgetDef = $workspace->widgets()->get('bento-widget-alpha');
		expect($widgetDef?->size)->toBe('4');

		$afterSpan = $workspace->handleWorkspacePrefsAction([
			'action' => 'resize_widget',
			'widgetId' => 'bento-widget-alpha',
			'size' => '8',
		], false, $editor);
		expect($afterSpan['ok'])->toBeTrue()
			->and($afterSpan['preferences']['widgetSizes']['bento-widget-alpha'] ?? null)->toBe('8');

		// Out-of-bounds spans (0 and 13) are ignored, keeping '8'
		$store->setWidgetSize('bento-widget-alpha', '0', $editor);
		$store->setWidgetSize('bento-widget-alpha', '13', $editor);
		expect($store->load($editor)['widgetSizes']['bento-widget-alpha'] ?? null)->toBe('8');

		// Preset import accepts '1'..'12' alongside semantic tokens
		$importRes = $workspace->handleWorkspacePrefsAction([
			'action' => 'import_layout',
			'preset' => [
				'layout' => [
					'widgetSizes' => [
						'bento-widget-alpha' => '9',
						'invalid-span' => '15',
					],
				],
			],
		], false, $editor);
		expect($importRes['ok'])->toBeTrue()
			->and($importRes['preferences']['widgetSizes'])->toBe(['bento-widget-alpha' => '9']);

		// FormSchemaSerializer: native InputfieldInteger with colspan / range metadata + declarative definitions
		$form = wire('modules')->get('InputfieldForm');
		/** @var \ProcessWire\InputfieldInteger $colSpanIf */
		$colSpanIf = wire('modules')->get('InputfieldInteger');
		$colSpanIf->attr('name', 'layout_span');
		$colSpanIf->label = 'Column Span';
		$colSpanIf->attr('data-rw-control', 'colspan');
		$colSpanIf->attr('data-rw-value-mode', 'percent');
		$colSpanIf->set('colSpan', 4);
		$colSpanIf->val(50);
		$form->add($colSpanIf);

		/** @var \ProcessWire\InputfieldInteger $rangeIf */
		$rangeIf = wire('modules')->get('InputfieldInteger');
		$rangeIf->attr('name', 'opacity_pct');
		$rangeIf->label = 'Opacity';
		$rangeIf->attr('data-rw-control', 'range');
		$rangeIf->set('min', 0);
		$rangeIf->set('max', 100);
		$rangeIf->val(80);
		$form->add($rangeIf);

		$serialized = $workspace->serializeForm($form);
		expect($serialized['fields'])->toHaveCount(2)
			->and($serialized['fields'][0]['type'])->toBe('colspan')
			->and($serialized['fields'][0]['valueMode'])->toBe('percent')
			->and($serialized['fields'][0]['colSpan'])->toBe(4)
			->and($serialized['fields'][1]['type'])->toBe('range');

		$decl = $workspace->serializeFormDefinitions([
			[
				'name' => 'col_width',
				'type' => 'colspan',
				'valueMode' => 'columns',
				'colSpan' => 6,
				'defaultValue' => 6,
			],
		]);
		expect($decl['fields'][0]['type'])->toBe('colspan')
			->and($decl['fields'][0]['colSpan'])->toBe(6)
			->and($decl['fields'][0]['valueMode'])->toBe('columns');
	} finally {
		$store->reset($editor);
		$workspace->widgets()->unregister('bento-widget-alpha');
		$workspace->workspaces()->unregister('bento-ws');
	}
});

test('AdminThemeUikit Konkat color scheme CSS strips unclosed comments, applies custom CSS safely, exposes useInputFocus, and syncs adminDarkMode bidirectionally', function (): void {
	$pw = wire();
	$modules = $pw->modules;
	$users = $pw->users;
	$workspace = React::instance();

	$origThemeConfig = $modules->getConfig('AdminThemeUikit');
	$superuser = $users->get('superuser') ?: $pw->user;
	$prevUser = $pw->user;
	$origDarkMeta = $superuser instanceof \ProcessWire\User ? $superuser->meta('adminDarkMode') : null;

	try {
		if ($superuser instanceof \ProcessWire\User && (int) $superuser->id > 0) {
			$users->setCurrentUser($superuser);
		}

		$modules->saveConfig('AdminThemeUikit', array_merge(is_array($origThemeConfig) ? $origThemeConfig : [], [
			'themeName' => 'default',
			'defaultStyleName' => 'auto',
			'defaultToggles' => ['useInputFocus'],
			'defaultMainColor' => 'green',
			'defaultMainColorCustom' => '#eb1d61',
			'defaultMainColorCustomDark' => '#eb1d61',
			'defaultCustomCss' => ":root { --pw-notes-background: #fef9c3; } </style><script>alert(1)</script>",
		]));

		$css = $workspace->theme()->resolveAdminColorSchemeCss();

		// 1. No unclosed CSS comments may swallow the appended --pw-main-color override
		expect(substr_count($css, '/*'))->toBe(substr_count($css, '*/'))
			->and($css)->toContain(':root { --pw-main-color: #14ae85; }')
			->and($css)->toContain('--pw-notes-background: #fef9c3;')
			->and(strtolower($css))->not->toContain('</style>');

		// 2. Strip all closed comments and confirm #14ae85 is the last active --pw-main-color rule
		$uncommentedCss = (string) preg_replace('~/\*.*?\*/~s', '', $css);
		preg_match_all('/--pw-main-color\s*:\s*([^;\}]+)/', $uncommentedCss, $matches);
		$activeMainColors = array_map('trim', $matches[1] ?? []);
		expect(end($activeMainColors))->toBe('#14ae85');

		// 3. Root view data exposes useInputFocus and syncs with user adminDarkMode meta
		if ($superuser instanceof \ProcessWire\User && (int) $superuser->id > 0) {
			$setLight = $workspace->handleWorkspacePrefsAction([
				'action' => 'set_theme_mode',
				'themeMode' => 'light',
			], false, $superuser);

			expect($setLight['ok'])->toBeTrue()
				->and($setLight['themeMode'] ?? null)->toBe('light')
				->and((int) $superuser->meta('adminDarkMode'))->toBe(0);

			$rootLight = $workspace->buildInertiaRootViewData('Workspace');
			expect($rootLight['themeMode'])->toBe('light')
				->and($rootLight['useInputFocus'] ?? null)->toBeTrue();

			// Simulate switching to Dark mode in classic AdminThemeUikit
			$superuser->meta('adminDarkMode', 1);
			$rootDark = $workspace->buildInertiaRootViewData('Workspace');
			expect($rootDark['themeMode'])->toBe('dark');

			// Switch back to Auto/System from Workspace
			$setSystem = $workspace->handleWorkspacePrefsAction([
				'action' => 'set_theme_mode',
				'themeMode' => 'system',
			], false, $superuser);
			expect($setSystem['ok'])->toBeTrue()
				->and($setSystem['themeMode'] ?? null)->toBe('system')
				->and((int) $superuser->meta('adminDarkMode'))->toBe(-1);
		}
	} finally {
		if (is_array($origThemeConfig)) {
			$modules->saveConfig('AdminThemeUikit', $origThemeConfig);
		}
		if ($superuser instanceof \ProcessWire\User && (int) $superuser->id > 0) {
			if ($origDarkMeta === null) {
				$superuser->meta()->remove('adminDarkMode');
			} else {
				$superuser->meta('adminDarkMode', $origDarkMeta);
			}
		}
		if ($prevUser instanceof \ProcessWire\User) {
			$users->setCurrentUser($prevUser);
		}
	}
});

test('ProcessReact executes Setup > Module inline via EmbeddedAdminPageResponse for any AdminTheme and Admin > Workspace via views/admin.php', function (): void {
	/** @var React $react */
	$react = wire('react');
	$input = wire('input');
	$users = wire('users');
	$pages = wire('pages');
	$config = wire('config');

	$prevUser = wire('user');
	$prevPage = wire('page');
	$prevWsGet = $input->get->ws;
	$prevShellHeader = $_SERVER['HTTP_X_REACT_SHELL'] ?? null;

	$superuser = $users->get('name=admin');
	if (!$superuser instanceof \ProcessWire\User || !$superuser->id) {
		$superuser = $users->find('roles=superuser, include=all, limit=1')->first();
	}
	$adminPage = $pages->get('template=admin, name=setup, include=all');
	if (!$adminPage instanceof \ProcessWire\Page || !$adminPage->id) {
		$adminPage = $pages->get(2);
	}

	$demoProcess = new class extends ProcessReact {
		public function getWorkspaceDefinition(): WorkspaceDefinition
		{
			return WorkspaceDefinition::fromArray([
				'id' => 'dual-demo',
				'title' => 'Dual Context Demo',
				'description' => 'Dual shell test module.',
				'icon' => 'layers',
				'url' => '/processwire/setup/dual-demo/',
				'process' => 'ProcessDualDemo',
				'permission' => 'page-edit',
			]);
		}

		public function getModuleScriptAssets(): array
		{
			return ['/site/modules/DualDemo/dist/DualDemo.js'];
		}
	};
	wire($demoProcess);

	try {
		if ($superuser instanceof \ProcessWire\User && $superuser->id) {
			$users->setCurrentUser($superuser);
		}
		if ($adminPage instanceof \ProcessWire\Page && $adminPage->id) {
			wire()->wire('page', $adminPage);
		}

		$react->setWorkspaceHubEnabled(true);
		unset($input->get->ws, $_SERVER['HTTP_X_REACT_SHELL']);

		// 1. Default access (Setup > Module, no ws=1): shellMode === 'admin', shouldEmbedInClassicAdmin(false) === true
		expect($react->resolveShellMode($demoProcess))->toBe('admin')
			->and($demoProcess->shouldEmbedInClassicAdmin(false))->toBeTrue()
			->and($demoProcess->inertiaRootView())->toEndWith('/views/admin.php');

		// Simulate pre-queued module script BEFORE ReactInertia.js
		$config->scripts->removeAll();
		$config->scripts->add('/wire/modules/Jquery/JqueryCore/JqueryCore.js');
		$config->scripts->add('/site/modules/DualDemo/dist/EarlyPlugin.js');
		$demoProcess->inertia()->resetState();

		$embeddedResponse = new \Totoglu\React\Inertia\EmbeddedAdminPageResponse(
			$demoProcess->inertia(),
			'Demo/DualView',
			['title' => 'Dual Context Demo'],
			$adminPage instanceof \ProcessWire\Page ? $adminPage : null,
			$demoProcess
		);
		$adminPayload = $embeddedResponse->toPageObject();
		expect($adminPayload['props']['workspace']['shellMode'] ?? null)->toBe('admin')
			->and($demoProcess->inertia()->getActiveResponse())->toBeNull();

		$embeddedHtml = $embeddedResponse->toOutput();
		expect($embeddedHtml)
			->toContain('data-rw-process-host="admin"')
			->toContain('<div id="app"></div>')
			->toContain('<script type="application/json" data-page="app">')
			->not->toContain('<!DOCTYPE html>');

		// Verify ReactInertia.js is guaranteed to precede all /site/modules/ scripts in $config->scripts
		$orderedScripts = array_values(iterator_to_array($config->scripts));
		$jqIndex = null;
		$runtimeIndex = null;
		$earlyPluginIndex = null;
		$moduleIndex = null;
		foreach ($orderedScripts as $idx => $sUrl) {
			if (str_contains((string) $sUrl, 'JqueryCore.js')) {
				$jqIndex = $idx;
			}
			if (str_contains((string) $sUrl, 'ReactInertia.js')) {
				$runtimeIndex = $idx;
			}
			if (str_contains((string) $sUrl, 'EarlyPlugin.js')) {
				$earlyPluginIndex = $idx;
			}
			if (str_contains((string) $sUrl, 'DualDemo.js')) {
				$moduleIndex = $idx;
			}
		}
		expect($jqIndex)->not->toBeNull()
			->and($runtimeIndex)->not->toBeNull()
			->and($earlyPluginIndex)->not->toBeNull()
			->and($moduleIndex)->not->toBeNull()
			->and($jqIndex)->toBeLessThan($runtimeIndex)
			->and($runtimeIndex)->toBeLessThan($earlyPluginIndex)
			->and($runtimeIndex)->toBeLessThan($moduleIndex);

		// 2. Workspace access (?ws=1): shellMode === 'workspace', shouldEmbedInClassicAdmin(false) === false, renders standalone views/admin.php
		$input->get->ws = '1';
		expect($react->resolveShellMode($demoProcess))->toBe('workspace')
			->and($demoProcess->shouldEmbedInClassicAdmin(false))->toBeFalse();

		$wsResponse = $demoProcess->inertiaRender('Demo/DualView', ['title' => 'Dual Context Demo']);
		$wsPayload = $wsResponse->toPageObject();
		expect($wsPayload['props']['workspace']['shellMode'] ?? null)->toBe('workspace');

		$wsHtml = $wsResponse->toOutput();
		expect($wsHtml)
			->toContain('<!DOCTYPE html>')
			->toContain('data-rw-shell-mode="workspace"');

		// 3. withWorkspaceQuery() / withoutWorkspaceQuery() manage ws=1 only on local admin module URLs
		$adminBase = rtrim((string) ($config->urls->admin ?: '/processwire/'), '/') . '/';
		expect($react->withWorkspaceQuery($adminBase . 'setup/catalog-demo/mappings/'))
			->toBe($adminBase . 'setup/catalog-demo/mappings/?ws=1')
			->and($react->withWorkspaceQuery($adminBase . 'setup/catalog-demo/edit/?type=redirects#top'))
			->toBe($adminBase . 'setup/catalog-demo/edit/?type=redirects&ws=1#top')
			->and($react->withWorkspaceQuery($adminBase))
			->toBe($adminBase)
			->and($react->withWorkspaceQuery($react->resolveLauncherUrl()))
			->toBe($react->resolveLauncherUrl())
			->and($react->withWorkspaceQuery($adminBase . 'setup/catalog-demo/?export=csv'))
			->toBe($adminBase . 'setup/catalog-demo/?export=csv')
			->and($react->withoutWorkspaceQuery($adminBase . 'setup/payments/?ws=1'))
			->toBe($adminBase . 'setup/payments/')
			->and($react->withoutWorkspaceQuery($adminBase . 'setup/payments/?tab=orders&ws=1#top'))
			->toBe($adminBase . 'setup/payments/?tab=orders#top')
			->and($react->withoutWorkspaceQuery('https://external.example' . $adminBase . 'setup/payments/?ws=1'))
			->toBe('https://external.example' . $adminBase . 'setup/payments/?ws=1')
			->and($react->withoutWorkspaceQuery('/frontend-page/?ws=1'))
			->toBe('/frontend-page/?ws=1');

		// 3b. WorkspaceRegistry::resolveUrl() & buildInertiaSharedContext() strip ?ws=1 from registered URLs
		$react->registerWorkspace([
			'id' => 'ws-leak-probe',
			'title' => 'WS Leak Probe',
			'description' => 'Probe URL normalization.',
			'icon' => 'credit-card',
			'url' => $adminBase . 'setup/ws-leak-probe/?ws=1&tab=ledger',
			'permission' => 'page-edit',
		]);
		expect($react->workspaces()->resolveUrl('ws-leak-probe'))
			->toBe($adminBase . 'setup/ws-leak-probe/?tab=ledger');

		unset($input->get->ws, $_SERVER['HTTP_X_REACT_SHELL']);
		$probeDef = $react->workspaces()->get('ws-leak-probe');
		$adminShared = $react->buildInertiaSharedContext($demoProcess, $probeDef);
		expect($adminShared['shellMode'] ?? null)->toBe('admin')
			->and($adminShared['activeWorkspace']['url'] ?? null)->toBe($adminBase . 'setup/ws-leak-probe/?tab=ledger');
		$matchedProbe = null;
		foreach (($adminShared['workspaces'] ?? []) as $wsEntry) {
			if (($wsEntry['id'] ?? '') === 'ws-leak-probe') {
				$matchedProbe = $wsEntry;
				break;
			}
		}
		expect($matchedProbe['url'] ?? null)->toBe($adminBase . 'setup/ws-leak-probe/?tab=ledger');
		$react->workspaces()->unregister('ws-leak-probe');

		// 3c. views/admin.php derives data-rw-shell-mode from props.workspace.shellMode instead of hardcoding workspace
		$templateFile = new \ProcessWire\TemplateFile(dirname(__DIR__, 2) . '/views/admin.php');
		wire($templateFile);
		$templateFile->setArray([
			'locale' => 'en',
			'title' => 'Admin View Check',
			'themeMode' => 'light',
			'colorSchemeCss' => '',
			'themeCss' => '',
			'head' => '',
			'styles' => [],
			'scripts' => [],
			'inertia' => $demoProcess->inertia(),
			'pageObject' => [
				'component' => 'Demo/DualView',
				'props' => ['workspace' => ['shellMode' => 'admin']],
				'url' => $adminBase . 'setup/catalog-demo/',
				'version' => '1',
			],
		]);
		expect((string) $templateFile->render())->toContain('data-rw-shell-mode="admin"');

		$templateFile->set('pageObject', [
			'component' => 'Demo/DualView',
			'props' => ['workspace' => ['shellMode' => 'workspace']],
			'url' => $adminBase . 'setup/catalog-demo/?ws=1',
			'version' => '1',
		]);
		expect((string) $templateFile->render())->toContain('data-rw-shell-mode="workspace"');

		// 4. When ProcessReactWorkspace is uninstalled, even ?ws=1 resolves cleanly to 'admin' mode
		$react->setWorkspaceHubEnabled(false);
		expect($react->resolveShellMode($demoProcess))->toBe('admin');

		// 5. ProcessReact::___executeNavJSON() normalizes empty / './' URLs and buildAdminNavJSON() emits valid vector icons, separators, and entity-safe labels
		$navTestProcess = new RwNavDemoProcessFixture();
		wire($navTestProcess);

		$navData = $navTestProcess->executeNavJSON(['getArray' => true]);
		expect($navData)->toBeArray()
			->and($navData['url'] ?? '')->toStartWith('/')
			->and($navData['add']['url'] ?? '')->toBe('edit/')
			->and($navData['add']['label'] ?? '')->toBe('New &amp; Item')
			->and($navData['add']['icon'] ?? '')->toBe('rwv--circle-plus')
			->and($navData['list'] ?? [])->toHaveCount(3)
			->and($navData['list'][0]['url'] ?? '')->toStartWith('/')
			->and($navData['list'][0]['className'] ?? '')->toBe('')
			->and($navData['list'][0]['icon'] ?? '')->toBe('rwv--layout-dashboard')
			->and($navData['list'][1]['url'] ?? '')->toBe('rules/')
			->and($navData['list'][1]['label'] ?? '')->toBe('Rules &amp; Defaults <small>4 &amp; 2</small>')
			->and($navData['list'][1]['className'] ?? '')->toBe('separator')
			->and($navData['list'][1]['icon'] ?? '')->toBe('rwv--adjustments-horizontal')
			->and($navData['list'][2]['icon'] ?? '')->toBe('rwv--database');

		$navJsonStr = $navTestProcess->executeNavJSON();
		expect($navJsonStr)->toBeString();
		$decodedNav = json_decode((string) $navJsonStr, true, 16, JSON_THROW_ON_ERROR);
		expect($decodedNav['list'][0]['url'] ?? '')->toStartWith('/');

		// Direct parent ProcessReact::___executeNavJSON() normalization of empty and './' items
		$rawNormalizeProc = new RwRawNavDemoProcessFixture();
		wire($rawNormalizeProc);
		$rawNav = $rawNormalizeProc->executeNavJSON(['getArray' => true]);
		expect($rawNav['list'][0]['url'] ?? '')->toStartWith('/')
			->and($rawNav['list'][1]['url'] ?? '')->toStartWith('/')
			->and($rawNav['list'][2]['url'] ?? '')->toBe('sub/');
	} finally {
		$react->setWorkspaceHubEnabled(null);
		if ($prevWsGet === null) {
			unset($input->get->ws);
		} else {
			$input->get->ws = $prevWsGet;
		}
		if ($prevShellHeader === null) {
			unset($_SERVER['HTTP_X_REACT_SHELL']);
		} else {
			$_SERVER['HTTP_X_REACT_SHELL'] = $prevShellHeader;
		}
		if ($prevPage instanceof \ProcessWire\Page) {
			wire()->wire('page', $prevPage);
		}
		if ($prevUser instanceof \ProcessWire\User) {
			$users->setCurrentUser($prevUser);
		}
	}
});

test('FieldIntegrationHooks::unregister() and React::forgetDeferredRegistrations() detach lifecycle and deferred module hooks cleanly', function (): void {
	/** @var React $react */
	$react = wire('react');
	$pw = \ProcessWire\ProcessWire::getCurrentInstance();
	$textFieldtype = $pw->fieldtypes->get('FieldtypeText');
	expect($textFieldtype)->not->toBeNull();

	$sleepBefore = count($textFieldtype->getHooks('sleepValue'));
	$isolatedHooks = new \Totoglu\React\Hook\FieldIntegrationHooks($react);
	$pw->wire($isolatedHooks);

	try {
		$isolatedHooks->register();
		$isolatedHooks->register(); // idempotent second call
		expect(count($textFieldtype->getHooks('sleepValue')))->toBe($sleepBefore + 1);
	} finally {
		$isolatedHooks->unregister();
		$isolatedHooks->unregister(); // idempotent unregister
	}
	expect(count($textFieldtype->getHooks('sleepValue')))->toBe($sleepBefore);

	$firedWorkspace = 0;
	$firedWidget = 0;
	$probe = new class extends \ProcessWire\Wire {};
	$pw->wire($probe);
	$isolatedReact = new \ProcessWire\React();
	$pw->wire($isolatedReact);
	$wsBefore = count($isolatedReact->getHooks('registerWorkspaces'));
	$wdBefore = count($isolatedReact->getHooks('registerWidgets'));

	try {
		\ProcessWire\React::deferModuleRegistration(
			$probe,
			static function () use (&$firedWorkspace): void {
				$firedWorkspace++;
			},
			static function () use (&$firedWidget): void {
				$firedWidget++;
			},
		);
		expect(count($isolatedReact->getHooks('registerWorkspaces')))->toBe($wsBefore + 1)
			->and(count($isolatedReact->getHooks('registerWidgets')))->toBe($wdBefore + 1);
	} finally {
		\ProcessWire\React::forgetDeferredRegistrations($probe);
	}

	$isolatedReact->workspaces();
	$isolatedReact->widgets();

	expect($firedWorkspace)->toBe(0)
		->and($firedWidget)->toBe(0)
		->and(count($isolatedReact->getHooks('registerWorkspaces')))->toBe($wsBefore)
		->and(count($isolatedReact->getHooks('registerWidgets')))->toBe($wdBefore);
});

test('WorkspacePreferenceStore flock mutation preserves keys, EditPresenceStore preserves file inode on leave(), and WorkspaceLauncherProcess::___uninstall() preserves standalone React preferences', function (): void {
	/** @var React $react */
	$react = wire('react');
	$user = wire('user');
	$prefStore = $react->workspacePreferences();
	$presenceStore = new \Totoglu\React\Workspace\EditPresenceStore();
	wire($presenceStore);

	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$resourceKey = 'presence-lock-inode-' . $suffix;

	try {
		// 1. Sequential/interleaved locked mutations preserve unrelated preference keys
		$prefStore->reset($user);
		$prefStore->setThemeMode('dark', $user);
		$prefStore->setThemePreset('ocean', $user);
		$prefStore->setShellLayout('sidebar', $user);
		$prefStore->setSidebarCollapsed(true, $user);
		$prefStore->toggleFavorite('orders-ws', $user);

		$loaded = $prefStore->load($user);
		expect($loaded['themeMode'])->toBe('dark')
			->and($loaded['themePreset'])->toBe('ocean')
			->and($loaded['shellLayout'])->toBe('sidebar')
			->and($loaded['sidebarCollapsed'])->toBeTrue()
			->and($loaded['favorites'])->toBe(['orders-ws']);

		// 2. EditPresenceStore::leave() truncates to '{}' in place under LOCK_EX without unlinking inode
		$presenceStore->heartbeat($resourceKey, $user, 'tab-inode');
		$lockPath = $presenceStore->filePath($resourceKey);
		expect(is_file($lockPath))->toBeTrue();
		clearstatcache(true, $lockPath);
		$inodeBeforeLeave = fileinode($lockPath);

		$presenceStore->leave($resourceKey, $user, 'tab-inode');
		clearstatcache(true, $lockPath);
		expect(is_file($lockPath))->toBeTrue()
			->and(fileinode($lockPath))->toBe($inodeBeforeLeave)
			->and(trim((string) file_get_contents($lockPath)))->toBe('{}');

		// 3. WorkspaceLauncherProcess::___uninstall() leaves standalone React preference files intact
		$launcher = new RwLauncherFixture();
		wire($launcher);
		$launcher->___uninstall();

		$afterUninstall = $prefStore->load($user);
		expect($afterUninstall['themeMode'])->toBe('dark')
			->and($afterUninstall['themePreset'])->toBe('ocean')
			->and($afterUninstall['favorites'])->toBe(['orders-ws']);
	} finally {
		$prefStore->reset($user);
		$lockPath = $presenceStore->filePath($resourceKey);
		if (is_file($lockPath)) {
			unlink($lockPath);
		}
	}
});

