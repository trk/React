<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\AdminTheme;
use ProcessWire\InputfieldSelect;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Page;
use ProcessWire\React;
use ProcessWire\User;
use Totoglu\React\Inertia\EmbeddedAdminPageResponse;
use Totoglu\React\Inertia\ProcessReact;
use Totoglu\React\Workspace\WorkspaceDefinition;
use Totoglu\React\Workspace\WorkspacePreferenceStore;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

if (!class_exists('RwShellLayoutTestProcess', false)) {
	class RwShellLayoutTestProcess extends ProcessReact
	{
		public static function getModuleInfo(): array
		{
			return ['title' => 'Shell Test Process', 'version' => 1];
		}

		public function getWorkspaceDefinition(): WorkspaceDefinition
		{
			return WorkspaceDefinition::fromArray([
				'id' => 'rw-shell-test',
				'title' => 'Shell Test Process',
				'description' => 'Named fixture process for shell layout verification.',
				'icon' => 'layout-sidebar',
				'url' => '/processwire/setup/rw-shell-test/',
				'process' => 'RwShellLayoutTestProcess',
				'permission' => 'page-edit',
			]);
		}

		public function getModuleScriptAssets(): array
		{
			return [];
		}
	}
}

beforeEach(function (): void {
	bootReactForTesting();
	$react = React::instance();
	$this->origDefaultShellLayout = $react->get('defaultShellLayout');
	$this->origModuleConfig = wire('modules')->getConfig('React');
	$this->prevUser = wire('user');

	$store = $react->workspacePreferences();
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superuser = wire('users')->get($superId);
	if ($superuser instanceof User && $superuser->id > 0) {
		wire('users')->setCurrentUser($superuser);
	}
	$this->superPrefPath = $superuser instanceof User ? $store->filePath($superuser) : '';
	$this->superPrefBackup = ($this->superPrefPath !== '' && is_file($this->superPrefPath))
		? (string) file_get_contents($this->superPrefPath)
		: null;
	if ($this->superPrefPath !== '' && is_file($this->superPrefPath)) {
		@unlink($this->superPrefPath);
	}
});

afterEach(function (): void {
	$react = React::instance();
	$react->set('defaultShellLayout', $this->origDefaultShellLayout);
	wire('modules')->saveConfig('React', is_array($this->origModuleConfig) ? $this->origModuleConfig : []);

	$store = $react->workspacePreferences();
	foreach ([987701, 987702] as $syntheticId) {
		$u = new User();
		wire($u);
		$u->id = $syntheticId;
		$store->reset($u);
	}

	if ($this->superPrefPath !== '') {
		if ($this->superPrefBackup === null) {
			if (is_file($this->superPrefPath)) {
				unlink($this->superPrefPath);
			}
		} else {
			file_put_contents($this->superPrefPath, $this->superPrefBackup);
		}
	}

	if (isset($this->prevUser) && $this->prevUser instanceof User && $this->prevUser->id > 0) {
		wire('users')->setCurrentUser($this->prevUser);
	}
});

test('WorkspacePreferenceStore persists, sanitizes, reconciles, exports, imports, and resets shellLayout and sidebarCollapsed', function (): void {
	$react = React::instance();
	$store = $react->workspacePreferences();

	$editor = new User();
	wire($editor);
	$editor->id = 987701;
	$editor->name = 'rw-shell-pref-editor';
	$store->reset($editor);

	$initial = $store->load($editor);
	expect($initial['shellLayout'])->toBe('')
		->and($initial['sidebarCollapsed'])->toBeFalse()
		->and(WorkspacePreferenceStore::DEFAULT_PREFERENCES['shellLayout'])->toBe('')
		->and(WorkspacePreferenceStore::DEFAULT_PREFERENCES['sidebarCollapsed'])->toBeFalse();

	$afterLayout = $store->setShellLayout('SIDEBAR', $editor);
	expect($afterLayout['shellLayout'])->toBe('sidebar');

	$afterCollapse = $store->setSidebarCollapsed(true, $editor);
	expect($afterCollapse['sidebarCollapsed'])->toBeTrue()
		->and($afterCollapse['shellLayout'])->toBe('sidebar');

	// Reserved 'default' and malformed JSON values sanitize safely
	$cleared = $store->setShellLayout('default', $editor);
	expect($cleared['shellLayout'])->toBe('');

	$store->savePreferences([
		'shellLayout' => 'bad layout!',
		'sidebarCollapsed' => 'not-a-bool',
	], $editor);
	$sanitized = $store->load($editor);
	expect($sanitized['shellLayout'])->toBe('')
		->and($sanitized['sidebarCollapsed'])->toBeFalse();

	// Reconcile preserves shellLayout & sidebarCollapsed across both widgetless and widgeted calls
	$store->savePreferences([
		'favorites' => ['entries', 'stale-mod'],
		'shellLayout' => 'sidebar',
		'sidebarCollapsed' => true,
	], $editor);
	$reconciled = $store->reconcile(['entries' => ['id' => 'entries', 'title' => 'Entries']], null, $editor);
	expect($reconciled['favorites'])->toBe(['entries'])
		->and($reconciled['shellLayout'])->toBe('sidebar')
		->and($reconciled['sidebarCollapsed'])->toBeTrue();

	// Export and import preset JSON retain shellLayout & sidebarCollapsed (both full envelope and layout-only flat import)
	$exported = $store->exportPreset(['entries' => ['id' => 'entries', 'title' => 'Entries']], [], $editor);
	expect($exported['schema'])->toBe(WorkspacePreferenceStore::PRESET_SCHEMA)
		->and($exported['layout']['shellLayout'])->toBe('sidebar')
		->and($exported['layout']['sidebarCollapsed'])->toBeTrue();

	$reset = $store->reset($editor);
	expect($reset['shellLayout'])->toBe('')
		->and($reset['sidebarCollapsed'])->toBeFalse()
		->and(is_file($store->filePath($editor)))->toBeFalse();

	$imported = $store->importPreset($exported, $editor);
	expect($imported['shellLayout'])->toBe('sidebar')
		->and($imported['sidebarCollapsed'])->toBeTrue();

	$flatImported = $store->importPreset(['shellLayout' => 'topbar', 'sidebarCollapsed' => false], $editor);
	expect($flatImported['shellLayout'])->toBe('topbar')
		->and($flatImported['sidebarCollapsed'])->toBeFalse();
});

test('React::resolveEffectiveShellLayout enforces user override > site default > topbar precedence and exposes shell config and shared context', function (): void {
	$react = React::instance();
	$store = $react->workspacePreferences();

	expect(React::getDefaultConfig()['defaultShellLayout'])->toBe('topbar');

	// Verify module config InputfieldSelect exposes defaultShellLayout with registered layout options
	$wrapper = new InputfieldWrapper();
	wire()->wire($wrapper);
	$react->getModuleConfigInputfields($wrapper);
	$layoutInput = $wrapper->getChildByName('defaultShellLayout');
	expect($layoutInput)->toBeInstanceOf(InputfieldSelect::class);
	if ($layoutInput instanceof InputfieldSelect) {
		expect(array_keys($layoutInput->getOptions()))->toContain('topbar', 'sidebar');
	}

	$editor = new User();
	wire($editor);
	$editor->id = 987701;
	$editor->name = 'rw-shell-prec-editor';
	$store->reset($editor);

	// 1. Default config fallback ('topbar')
	$react->set('defaultShellLayout', 'invalid-configured-layout');
	expect($react->siteDefaultShellLayout())->toBe('topbar')
		->and($react->resolveEffectiveShellLayout($editor))->toBe('topbar');

	// 2. Site default changed to 'sidebar' -> user without override inherits 'sidebar'
	$react->set('defaultShellLayout', 'sidebar');
	expect($react->siteDefaultShellLayout())->toBe('sidebar')
		->and($react->userShellLayoutOverride($editor))->toBe('')
		->and($react->resolveEffectiveShellLayout($editor))->toBe('sidebar');

	// 3. User sets personal override to 'topbar' -> personal override wins over site default 'sidebar'
	$store->setShellLayout('topbar', $editor);
	expect($react->userShellLayoutOverride($editor))->toBe('topbar')
		->and($react->resolveEffectiveShellLayout($editor))->toBe('topbar');

	// 4. Unregistered/stale user override falls back cleanly to site default
	$store->setShellLayout('retired-custom-shell', $editor);
	expect($react->userShellLayoutOverride($editor))->toBe('')
		->and($react->resolveEffectiveShellLayout($editor))->toBe('sidebar');

	// 5. Guest users always inherit site default and never collapse sidebar
	$guest = wire('users')->getGuestUser();
	expect($react->userShellLayoutOverride($guest))->toBe('')
		->and($react->resolveEffectiveShellLayout($guest))->toBe('sidebar')
		->and($react->resolveSidebarCollapsed($guest))->toBeFalse();

	// 6. Shared Inertia context, Root View data, and SSR output reflect active layout & collapsed state
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superuser = wire('users')->get($superId);
	$store->setShellLayout('topbar', $superuser);
	$store->setSidebarCollapsed(true, $superuser);

	$shared = $react->buildInertiaSharedContext();
	expect($shared['shellLayout'])->toBe('topbar')
		->and($shared['userShellLayout'])->toBe('topbar')
		->and($shared['siteDefaultShellLayout'])->toBe('sidebar')
		->and($shared['sidebarCollapsed'])->toBeTrue()
		->and(array_column($shared['availableShellLayouts'], 'id'))->toBe(['topbar', 'sidebar']);

	$rootView = $react->buildInertiaRootViewData('Shell Test');
	expect($rootView['shellLayout'])->toBe('topbar')
		->and($rootView['sidebarCollapsed'])->toBeTrue();

	// Verify EmbeddedAdminPageResponse head bootstrap & views/admin.php emit matching SSR attributes
	$proc = new RwShellLayoutTestProcess();
	wire()->wire($proc);
	$react->setWorkspaceHubEnabled(false);
	$prevConfigScripts = array_values(iterator_to_array(wire()->config->scripts));
	$prevConfigStyles = array_values(iterator_to_array(wire()->config->styles));
	try {
		$adminPage = wire()->pages->get('template=admin, name=setup, include=all');
		$proc->inertia()->resetState();
		$embeddedResponse = new EmbeddedAdminPageResponse(
			$proc->inertia(),
			'Demo/Shell',
			['title' => 'Shell Test'],
			$adminPage instanceof Page && $adminPage->id ? $adminPage : null,
			$proc
		);
		$embeddedHtml = $embeddedResponse->toOutput();
		$adminTheme = wire()->adminTheme;
		$headCombined = $embeddedHtml;
		if ($adminTheme instanceof AdminTheme) {
			$extras = $adminTheme->getExtraMarkup();
			$headCombined .= is_string($extras['head'] ?? null) ? (string) $extras['head'] : '';
		}
		expect($headCombined)->toContain('data-rw-shell-layout')
			->and($headCombined)->toContain('"topbar"')
			->and($headCombined)->toContain('data-rw-sidebar-collapsed')
			->and($headCombined)->toContain('"true"');
	} finally {
		$proc->inertia()->resetState();
		$react->setWorkspaceHubEnabled(null);
		wire()->config->scripts->removeAll();
		foreach ($prevConfigScripts as $scriptUrl) {
			wire()->config->scripts->add($scriptUrl);
		}
		wire()->config->styles->removeAll();
		foreach ($prevConfigStyles as $styleUrl) {
			wire()->config->styles->add($styleUrl);
		}
	}

	$viewsAdmin = (string) file_get_contents(dirname(__DIR__, 2) . '/views/admin.php');
	expect($viewsAdmin)->toContain('data-rw-shell-layout=')
		->and($viewsAdmin)->toContain('data-rw-sidebar-collapsed=');
});

test('ReactGatewayRouter set_shell_layout and set_sidebar_collapsed validate inputs, enforce CSRF/POST/auth, and persist per user', function (): void {
	$react = React::instance();
	$react->set('defaultShellLayout', 'topbar');

	$editorRole = null;
	foreach (wire('roles') as $candidateRole) {
		if ($candidateRole->name !== 'guest' && $candidateRole->hasPermission('page-edit')) {
			$editorRole = $candidateRole;
			break;
		}
	}
	$editor = new User();
	wire($editor);
	$editor->id = 987701;
	$editor->name = 'rw-gateway-editor';
	if ($editorRole && $editorRole->id) {
		$editor->addRole($editorRole);
	} else {
		$editor->addRole('superuser');
	}

	$peer = new User();
	wire($peer);
	$peer->id = 987702;
	$peer->name = 'rw-gateway-peer';

	// 1. Valid set_shell_layout -> sidebar
	$savedSidebar = $react->handleWorkspacePrefsAction([
		'action' => 'set_shell_layout',
		'shellLayout' => 'sidebar',
		'_requestMethod' => 'POST',
	], false, $editor);
	expect($savedSidebar['ok'])->toBeTrue()
		->and($savedSidebar['status'] ?? null)->toBe(200)
		->and($savedSidebar['shellLayout'] ?? null)->toBe('sidebar')
		->and($savedSidebar['userShellLayout'] ?? null)->toBe('sidebar')
		->and($savedSidebar['siteDefaultShellLayout'] ?? null)->toBe('topbar')
		->and($savedSidebar['sidebarCollapsed'] ?? null)->toBeFalse()
		->and(array_column($savedSidebar['availableShellLayouts'] ?? [], 'id'))->toBe(['topbar', 'sidebar'])
		->and($react->resolveEffectiveShellLayout($editor))->toBe('sidebar')
		->and($react->resolveEffectiveShellLayout($peer))->toBe('topbar');

	// 2. Clearing override with '' reverts to site default ('topbar', or 'sidebar' if site default changes)
	$react->set('defaultShellLayout', 'sidebar');
	$clearedToSite = $react->handleWorkspacePrefsAction([
		'action' => 'set_shell_layout',
		'shellLayout' => '',
		'_requestMethod' => 'POST',
	], false, $editor);
	expect($clearedToSite['ok'])->toBeTrue()
		->and($clearedToSite['userShellLayout'] ?? null)->toBe('')
		->and($clearedToSite['siteDefaultShellLayout'] ?? null)->toBe('sidebar')
		->and($clearedToSite['shellLayout'] ?? null)->toBe('sidebar');

	// 3. Invalid shellLayout payloads return 422
	foreach (['unknown-layout', 'bad space!', ['array']] as $badLayout) {
		$invalidRes = $react->handleWorkspacePrefsAction([
			'action' => 'set_shell_layout',
			'shellLayout' => $badLayout,
			'_requestMethod' => 'POST',
		], false, $editor);
		expect($invalidRes['ok'])->toBeFalse()
			->and($invalidRes['status'] ?? null)->toBe(422);
	}

	// 4. Valid & invalid set_sidebar_collapsed
	$collapseTrue = $react->handleWorkspacePrefsAction([
		'action' => 'set_sidebar_collapsed',
		'collapsed' => true,
		'_requestMethod' => 'POST',
	], false, $editor);
	expect($collapseTrue['ok'])->toBeTrue()
		->and($collapseTrue['sidebarCollapsed'] ?? null)->toBeTrue()
		->and($react->resolveSidebarCollapsed($editor))->toBeTrue()
		->and($react->resolveSidebarCollapsed($peer))->toBeFalse();

	$collapseFalse = $react->handleWorkspacePrefsAction([
		'action' => 'set_sidebar_collapsed',
		'sidebarCollapsed' => '0',
		'_requestMethod' => 'POST',
	], false, $editor);
	expect($collapseFalse['ok'])->toBeTrue()
		->and($collapseFalse['sidebarCollapsed'] ?? null)->toBeFalse()
		->and($react->resolveSidebarCollapsed($editor))->toBeFalse();

	foreach (['maybe', null, 2] as $badBool) {
		$badCollapse = $react->handleWorkspacePrefsAction([
			'action' => 'set_sidebar_collapsed',
			'collapsed' => $badBool,
			'_requestMethod' => 'POST',
		], false, $editor);
		expect($badCollapse['ok'])->toBeFalse()
			->and($badCollapse['status'] ?? null)->toBe(422);
	}

	// 5. Security guards: CSRF required (419), POST required (405), guest rejected (403)
	$prevHeader = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
	try {
		unset($_SERVER['HTTP_X_CSRF_TOKEN']);
		$missingCsrf = $react->handleWorkspacePrefsAction([
			'action' => 'set_shell_layout',
			'shellLayout' => 'sidebar',
			'_requestMethod' => 'POST',
		], true, $editor);
		expect($missingCsrf['ok'])->toBeFalse()
			->and($missingCsrf['status'] ?? null)->toBe(419);

		$csrfValue = (string) wire('session')->CSRF->getTokenValue();
		$_SERVER['HTTP_X_CSRF_TOKEN'] = $csrfValue;
		$withCsrf = $react->handleWorkspacePrefsAction([
			'action' => 'set_shell_layout',
			'shellLayout' => 'topbar',
			'_requestMethod' => 'POST',
		], true, $editor);
		expect($withCsrf['ok'])->toBeTrue()
			->and($withCsrf['shellLayout'] ?? null)->toBe('topbar');
	} finally {
		if ($prevHeader === null) {
			unset($_SERVER['HTTP_X_CSRF_TOKEN']);
		} else {
			$_SERVER['HTTP_X_CSRF_TOKEN'] = $prevHeader;
		}
	}

	$getMethodDenied = $react->handleWorkspacePrefsAction([
		'action' => 'set_shell_layout',
		'shellLayout' => 'sidebar',
		'_requestMethod' => 'GET',
	], false, $editor);
	expect($getMethodDenied['ok'])->toBeFalse()
		->and($getMethodDenied['status'] ?? null)->toBe(405);

	$guest = wire('users')->getGuestUser();
	$guestLayoutDenied = $react->handleWorkspacePrefsAction([
		'action' => 'set_shell_layout',
		'shellLayout' => 'sidebar',
		'_requestMethod' => 'POST',
	], false, $guest);
	expect($guestLayoutDenied['ok'])->toBeFalse()
		->and($guestLayoutDenied['status'] ?? null)->toBe(403);

	$guestCollapseDenied = $react->handleWorkspacePrefsAction([
		'action' => 'set_sidebar_collapsed',
		'collapsed' => true,
		'_requestMethod' => 'POST',
	], false, $guest);
	expect($guestCollapseDenied['ok'])->toBeFalse()
		->and($guestCollapseDenied['status'] ?? null)->toBe(403);
});
