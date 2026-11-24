<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Inputfield;
use ProcessWire\Module;
use ProcessWire\Modules;
use ProcessWire\Page;
use ProcessWire\Pagefiles;
use ProcessWire\ProcessWire;
use ProcessWire\React;
use ProcessWire\User;
use ProcessWire\Wire;
use ProcessWire\WireData;
use ProcessWire\WirePermissionException;
use Totoglu\React\Icon\IconManager;
use Totoglu\React\Media\MediaGateway;
use Totoglu\React\Media\MediaHostAdapterInterface;
use Totoglu\React\Provider\ArrayDataProvider;
use Totoglu\React\Provider\ProviderRegistry;
use Totoglu\React\Relation\Resource\AbstractRelationResource;
use Totoglu\React\Relation\RelationResourceRegistry;
use Totoglu\React\Workspace\CommandSearchRegistry;
use Totoglu\React\Workspace\WorkspaceRegistry;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

if (!class_exists('RwCapabilitySpyModules', false)) {
	class RwCapabilitySpyModules extends Modules
	{
		private Modules $delegate;

		/** @var array<string, array<string, mixed>> */
		public array $extraInfo = [];

		/** @var array<string, Module> */
		public array $extraModules = [];

		/** @var array<string, int> */
		public array $pullCounts = [];

		/** @var list<array{name: string, options: array<string, mixed>}> */
		public array $getModuleCalls = [];

		/** @var array<string, bool> */
		public array $initializedModules = [];

		public function __construct(Modules $delegate)
		{
			$this->delegate = $delegate;
		}

		public function getModuleInfo($class, array $options = [])
		{
			if ($class === '*') {
				$base = $this->delegate->getModuleInfo('*', $options);
				if (!is_array($base)) {
					$base = [];
				}
				foreach ($this->extraInfo as $id => $info) {
					$base[$id] = $info;
				}

				return $base;
			}
			foreach ($this->extraInfo as $info) {
				if (($info['name'] ?? '') === $class) {
					return $info;
				}
			}

			return $this->delegate->getModuleInfo($class, $options);
		}

		public function isInstalled($class)
		{
			if (is_string($class) && isset($this->extraModules[$class])) {
				return true;
			}

			return $this->delegate->isInstalled($class);
		}

		public function getModule($key, array $options = [])
		{
			if (is_string($key) && isset($this->extraModules[$key])) {
				$this->getModuleCalls[] = ['name' => $key, 'options' => $options];
				$this->pullCounts[$key] = ($this->pullCounts[$key] ?? 0) + 1;

				$mod = $this->extraModules[$key];
				$info = [];
				foreach ($this->extraInfo as $candidate) {
					if (($candidate['name'] ?? '') === $key) {
						$info = $candidate;
						break;
					}
				}
				if (empty($options['noPermissionCheck']) && !empty($info['permission'])) {
					$user = $this->wire()->user;
					if (!$user instanceof User || !$user->hasPermission((string) $info['permission'])) {
						throw new WirePermissionException('Permission denied for ' . $key);
					}
				}
				if (empty($this->initializedModules[$key]) && empty($options['noInit'])) {
					$this->initializedModules[$key] = true;
					if (method_exists($mod, 'init')) {
						$mod->init();
					}
				}

				return $mod;
			}

			return $this->delegate->getModule($key, $options);
		}

		public function isSingular($module)
		{
			return $this->delegate->isSingular($module);
		}
	}
}

if (!class_exists('RwTestCapabilityModule', false)) {
	class RwTestCapabilityModule extends WireData implements Module
	{
		public int $initCount = 0;

		/** @var \Closure(self): void */
		private \Closure $onInit;

		/**
		 * @param \Closure(self): void $onInit
		 */
		public function __construct(\Closure $onInit)
		{
			parent::__construct();
			$this->onInit = $onInit;
		}

		public static function getModuleInfo(): array
		{
			return ['title' => 'Capability Probe', 'version' => 1, 'autoload' => false];
		}

		public function init(): void
		{
			$this->initCount++;
			($this->onInit)($this);
		}
	}
}

function rwRunCleanBootSubprocess(string $phpCode): array
{
	$root = dirname(__DIR__, 5);
	$fullCode = str_replace(
		['__ROOT__'],
		[var_export($root, true)],
		"require __ROOT__ . '/wire/core/ProcessWire.php';\n"
		. "\$config = \\ProcessWire\\ProcessWire::buildConfig(__ROOT__);\n"
		. "\$wire = new \\ProcessWire\\ProcessWire(\$config);\n"
		. $phpCode
	);

	$spec = [
		0 => ['pipe', 'r'],
		1 => ['pipe', 'w'],
		2 => ['pipe', 'w'],
	];
	$proc = proc_open([PHP_BINARY, '-r', $fullCode], $spec, $pipes, $root);
	if (!is_resource($proc)) {
		throw new \RuntimeException('Failed to spawn clean-boot PHP subprocess');
	}
	fclose($pipes[0]);
	$stdout = (string) stream_get_contents($pipes[1]);
	$stderr = (string) stream_get_contents($pipes[2]);
	fclose($pipes[1]);
	fclose($pipes[2]);
	$exit = proc_close($proc);

	return ['exit' => $exit, 'stdout' => $stdout, 'stderr' => $stderr];
}

beforeEach(function (): void {
	bootReactForTesting();
});

test('React pullCapabilities discovers all 7 subsystems idempotently from cached module info and bypasses permission checks', function (): void {
	$pw = wire();
	$origModules = $pw->modules;
	$origReact = $pw->fuel->get('react');
	$origUser = $pw->user;

	$spy = new RwCapabilitySpyModules($origModules);
	$pw->wire($spy);

	$isolated = new React();
	$pw->wire($isolated);

	$createdModules = [];

	try {
		$pw->fuel->remove('modules');
		$pw->fuel->set('modules', $spy);
		$pw->fuel->set('react', $isolated);

		// Multi-capability module (workspace + commandSearch + icons) with permission guard
		$multiMod = new RwTestCapabilityModule(static function (RwTestCapabilityModule $mod): void {
			IconManager::registerAdminIcons(['compass']);
			React::deferModuleRegistration(
				$mod,
				static function (React $react): void {
					$react->registerWorkspace([
						'id' => 'cap-multi-ws',
						'title' => 'Multi Cap Workspace',
						'url' => '/processwire/setup/cap-multi/',
					]);
				},
				static function (React $react): void {
					$react->registerWidget([
						'id' => 'cap-multi-widget',
						'workspaceId' => 'cap-multi-ws',
						'title' => 'Multi Widget',
					]);
				},
			);
			React::deferCommandSearchRegistration($mod, static function (CommandSearchRegistry $reg): void {
				$reg->register('cap-multi-search', static fn (): array => [
					['id' => 'hit-1', 'label' => 'Multi Hit', 'url' => '/processwire/setup/cap-multi/'],
				]);
			});
		});
		$pw->wire($multiMod);
		$createdModules[] = $multiMod;

		// Providers + Relations + Media + ViewportModes module
		$domainMod = new RwTestCapabilityModule(static function (RwTestCapabilityModule $mod): void {
			React::deferProviderRegistration($mod, static function (ProviderRegistry $reg): void {
				$reg->register('cap_items', new ArrayDataProvider('cap_items', [['id' => '1', 'title' => 'One']]));
			});
			React::deferRelationRegistration($mod, static function (RelationResourceRegistry $reg): void {
				$reg->register(new class extends AbstractRelationResource {
					public function name(): string { return 'cap_rel'; }
					public function label(): string { return 'Cap Rel'; }
					public function icon(): string { return 'tag'; }
					public function defaultValueField(): string { return 'id'; }
					public function count(array $options = []): int { return 0; }
					public function query(array $params = [], array $options = []): array { return ['items' => [], 'total' => 0, 'hasMore' => false]; }
					public function hydrate(array $values, array $options = []): array { return []; }
				});
			});
			React::deferMediaHostRegistration($mod, static function (MediaGateway $gw): void {
				$gw->registerHostAdapter(new class implements MediaHostAdapterInterface {
					public function kind(): string { return 'cap_host'; }
					public function buildEnvelope(Inputfield $inputfield, mixed $hostPage, string $dataFieldName, string $inputName, array $common): ?array { return null; }
					public function resolveTargetContext(array $envelope, User $user, bool $requireEdit): array { return ['ok' => false, 'status' => 404, 'error' => 'none']; }
					public function persistPagefiles(array $resolved, Pagefiles $pagefiles, int $maxFiles): void {}
				});
			});
			React::deferViewportModeRegistration($mod, static function (React $react): void {
				$react->registerViewportMode('capboard', 'MarkupCapBoard', '', ['icon' => 'layout-kanban', 'label' => 'Cap Board']);
			});
		});
		$pw->wire($domainMod);
		$createdModules[] = $domainMod;

		$spy->extraInfo = [
			999901 => [
				'name' => 'CapMultiStubModule',
				'version' => 10,
				'permission' => 'superuser-only-cap-perm',
				'reactCapabilities' => ['workspace', 'icons', 'commandSearch'],
			],
			999902 => [
				'name' => 'CapDomainStubModule',
				'version' => 20,
				'reactCapabilities' => ['providers', 'relations', 'media', 'viewportModes'],
			],
		];
		$spy->extraModules = [
			'CapMultiStubModule' => $multiMod,
			'CapDomainStubModule' => $domainMod,
		];

		// 1. discoverCapabilityModules() indexes all 7 capabilities without instantiating either module
		$discovered = $isolated->discoverCapabilityModules();
		expect($discovered)->toHaveKeys(React::CAPABILITIES)
			->and($discovered['workspace'])->toContain('CapMultiStubModule')
			->and($discovered['icons'])->toContain('CapMultiStubModule')
			->and($discovered['commandSearch'])->toContain('CapMultiStubModule')
			->and($discovered['providers'])->toContain('CapDomainStubModule')
			->and($discovered['relations'])->toContain('CapDomainStubModule')
			->and($discovered['media'])->toContain('CapDomainStubModule')
			->and($discovered['viewportModes'])->toContain('CapDomainStubModule')
			->and($multiMod->initCount)->toBe(0)
			->and($domainMod->initCount)->toBe(0);

		// 2. Switch to guest user — pullCapabilities must still succeed via noPermissionCheck => true
		$guest = $pw->users->getGuestUser();
		$pw->users->setCurrentUser($guest);

		$wsRegistry = $isolated->workspaces();
		$wdRegistry = $isolated->widgets();
		$csRegistry = $isolated->commandSearch();
		$isolated->pullCapabilities('icons');

		expect($wsRegistry->has('cap-multi-ws'))->toBeTrue()
			->and($wdRegistry->has('cap-multi-widget'))->toBeTrue()
			->and($csRegistry->has('cap-multi-search'))->toBeTrue()
			->and($multiMod->initCount)->toBe(1)
			->and($spy->pullCounts['CapMultiStubModule'] ?? 0)->toBe(1);

		// Second call to pullCapabilities('workspace') / ('icons') / ('commandSearch') is completely idempotent
		expect($isolated->pullCapabilities('workspace'))->toBe([])
			->and($isolated->pullCapabilities('icons'))->toBe([])
			->and($isolated->pullCapabilities('commandSearch'))->toBe([])
			->and($spy->pullCounts['CapMultiStubModule'] ?? 0)->toBe(1);

		// 3. Domain capabilities pull CapDomainStubModule once across providers, relations, media, and viewportModes
		$providers = $isolated->providers();
		$relations = $isolated->relations();
		$media = $isolated->media();
		$modes = $isolated->getRegisteredViewportModes();

		expect($providers->has('cap_items'))->toBeTrue()
			->and($relations->has('cap_rel'))->toBeTrue()
			->and($media->getHostAdapter('cap_host'))->not->toBeNull()
			->and($modes)->toHaveKey('capboard')
			->and($modes['capboard']['module'])->toBe('MarkupCapBoard')
			->and($isolated->isViewportModesResolved())->toBeTrue()
			->and($domainMod->initCount)->toBe(1)
			->and($spy->pullCounts['CapDomainStubModule'] ?? 0)->toBe(1);

		// Verify every getModule call used noPermissionCheck => true, noInstall => true, noThrow => true
		foreach ($spy->getModuleCalls as $call) {
			expect($call['options']['noPermissionCheck'] ?? false)->toBeTrue()
				->and($call['options']['noInstall'] ?? false)->toBeTrue()
				->and($call['options']['noThrow'] ?? false)->toBeTrue();
		}

		// 4. resetCapabilityCache() clears memoized discovery
		$isolated->resetCapabilityCache();
		expect($isolated->discoverCapabilityModules()['viewportModes'])->toContain('CapDomainStubModule');
	} finally {
		foreach ($createdModules as $m) {
			React::forgetDeferredRegistrations($m);
		}
		React::forgetSharedWorkspace('cap-multi-ws');
		React::forgetSharedWidget('cap-multi-widget');
		$isolated->hooks()->unregister();
		$pw->fuel->remove('modules');
		$pw->fuel->set('modules', $origModules, true);
		$pw->fuel->set('react', $origReact);
		if ($origUser instanceof User) {
			$pw->users->setCurrentUser($origUser);
		}
	}
});

test('IconManager stamps rw-cap-sig, pulls icons capability on generateAdminCss, and avoids clobbering on partial registered subsets', function (): void {
	$pw = wire();
	$origModules = $pw->modules;
	$origReact = $pw->fuel->get('react');
	$origAssetsPath = (string) $pw->config->paths->assets;
	$tmpAssets = sys_get_temp_dir() . '/rw-cap-icon-test-' . bin2hex(random_bytes(4));
	mkdir($tmpAssets, 0777, true);

	$spy = new RwCapabilitySpyModules($origModules);
	$pw->wire($spy);

	$isolated = new React();
	$pw->wire($isolated);

	$iconMod = new RwTestCapabilityModule(static function (): void {
		IconManager::registerAdminIcons(['compass', 'anchor']);
	});
	$pw->wire($iconMod);

	try {
		$pw->config->paths->assets = rtrim($tmpAssets, '/') . '/';
		$pw->fuel->remove('modules');
		$pw->fuel->set('modules', $spy);
		$pw->fuel->set('react', $isolated);

		$spy->extraInfo = [
			999903 => [
				'name' => 'CapIconStubModule',
				'version' => 7,
				'reactCapabilities' => ['icons'],
			],
		];
		$spy->extraModules = [
			'CapIconStubModule' => $iconMod,
		];

		$icons = $isolated->icons();
		$cssPath = $icons->ensureAdminCss();
		expect(is_file($cssPath))->toBeTrue()
			->and($iconMod->initCount)->toBe(1);

		$css = (string) file_get_contents($cssPath);
		expect($css)->toContain('rw-cap-sig:')
			->and($css)->toContain('rw-reg-sig:')
			->and($css)->toContain('rw-count:')
			->and($css)->toContain('.fa-rwv--compass')
			->and($css)->toContain('.fa-rwv--anchor');

		// Simulate a fresh request with a different IconManager instance and a subset/mismatch of rw-reg-sig
		// where the generated CSS already satisfies all currently registered icons and matching rw-cap-sig:
		$freshIcons = new IconManager();
		$pw->wire($freshIcons);
		$contentsWithDifferentRegSig = preg_replace('/rw-reg-sig:[a-z0-9]+/', 'rw-reg-sig:0000000000000000000000000000000000000000', $css);
		file_put_contents($cssPath, (string) $contentsWithDifferentRegSig);

		$mtimeBefore = filemtime($cssPath);
		$ensured = $freshIcons->ensureAdminCss();
		expect($ensured)->toBe($cssPath)
			->and((string) file_get_contents($cssPath))->toContain('.fa-rwv--compass')
			->and((string) file_get_contents($cssPath))->toContain('rw-reg-sig:0000000000000000000000000000000000000000')
			->and($mtimeBefore)->toBeInt();

		// Now register a brand-new icon mid-request -> revision bump forces rebuild containing new + pulled icons
		IconManager::registerAdminIcons(['rocket']);
		$freshIcons->ensureAdminCss();
		$rebuiltCss = (string) file_get_contents($cssPath);
		expect($rebuiltCss)->toContain('.fa-rwv--rocket')
			->and($rebuiltCss)->toContain('.fa-rwv--compass')
			->and($rebuiltCss)->not->toContain('rw-reg-sig:0000000000000000000000000000000000000000');
	} finally {
		$isolated->hooks()->unregister();
		$pw->config->paths->assets = $origAssetsPath;
		$pw->fuel->remove('modules');
		$pw->fuel->set('modules', $origModules, true);
		$pw->fuel->set('react', $origReact);
		$pw->files->rmdir($tmpAssets, true);
	}
});

test('React::deferViewportModeRegistration defers, resolves on getRegisteredViewportModes, and detaches cleanly', function (): void {
	$pw = wire();
	$origReact = $pw->fuel->get('react');
	$freshReact = new React();
	$pw->wire($freshReact);
	$probe = new WireData();
	$pw->wire($probe);

	try {
		$pw->fuel->set('react', $freshReact);
		$runs = 0;

		React::deferViewportModeRegistration($probe, static function (React $react) use ($freshReact, &$runs): void {
			if ($react !== $freshReact) {
				return;
			}
			$runs++;
			$react->registerViewportMode('timeline', 'MarkupTimeline', '', ['icon' => 'clock', 'label' => 'Timeline']);
		});

		expect($runs)->toBe(0)
			->and($freshReact->isViewportModesResolved())->toBeFalse();

		$modes = $freshReact->getRegisteredViewportModes();
		expect($runs)->toBe(1)
			->and($freshReact->isViewportModesResolved())->toBeTrue()
			->and($modes)->toHaveKey('timeline')
			->and($modes['timeline']['module'])->toBe('MarkupTimeline');

		// Detaching deferred registrations removes React::registerViewportModes hooks cleanly
		$lateProbe = new WireData();
		$pw->wire($lateProbe);
		$beforeHooks = count($freshReact->getHooks('registerViewportModes'));
		$lateReact = new React();
		$pw->wire($lateReact);
		$pw->fuel->set('react', $lateReact);
		React::deferViewportModeRegistration($lateProbe, static function (): void {});
		expect(count($lateReact->getHooks('registerViewportModes')))->toBe($beforeHooks + 1);
		React::forgetDeferredRegistrations($lateProbe);
		expect(count($lateReact->getHooks('registerViewportModes')))->toBe($beforeHooks);
	} finally {
		React::forgetDeferredRegistrations($probe);
		$pw->fuel->set('react', $origReact);
	}
});

test('React gates FieldIntegrationHooks off frontend requests while keeping autoload, /_react/* path hooks, admin ready(), and gateway() intact', function (): void {
	$pw = wire();
	$origReact = $pw->fuel->get('react');
	$origPage = $pw->page;
	$config = $pw->config;
	$adminUrl = rtrim((string) ($config->urls->admin ?: '/processwire/'), '/') . '/';

	$isolated = new React();
	$pw->wire($isolated);
	$homePage = $pw->pages->get(1);

	try {
		if ($homePage instanceof Page && $homePage->id > 0) {
			$pw->fuel->set('page', $homePage);
		}

		// 1. Metadata & autoload flag remain true so ModulesLoader.php:81-90 never emits dependency warnings
		$info = React::getModuleInfo();
		expect($info['autoload'] ?? null)->toBeTrue()
			->and($info['singular'] ?? null)->toBeTrue()
			->and($isolated->isAutoload())->toBeTrue();

		// 2. Path / CLI / prefix-boundary gating checks
		expect($isolated->shouldRegisterFieldHooks('/', false))->toBeFalse()
			->and($isolated->shouldRegisterFieldHooks('/articles/hello/', false))->toBeFalse()
			->and($isolated->shouldRegisterFieldHooks('/processwire-news/', false))->toBeFalse()
			->and($isolated->shouldRegisterFieldHooks($adminUrl, false))->toBeTrue()
			->and($isolated->shouldRegisterFieldHooks($adminUrl . 'page/edit/', false))->toBeTrue()
			->and($isolated->shouldRegisterFieldHooks('/_react/viewport', false))->toBeTrue()
			->and($isolated->shouldRegisterFieldHooks('/_react/icons', false))->toBeTrue()
			->and($isolated->shouldRegisterFieldHooks('/', true))->toBeTrue();

		// 3. Frontend ready() does NOT register FieldIntegrationHooks and isExecutingProcessController() does not allocate them
		expect($isolated->hooks()->isRegistered())->toBeFalse()
			->and($isolated->isExecutingProcessController())->toBeFalse();
		$isolated->ready();
		expect($isolated->hooks()->isRegistered())->toBeFalse();

		// 4. Admin template ready() registers FieldIntegrationHooks idempotently
		$adminPage = $pw->pages->get('template=admin, include=all');
		if ($adminPage instanceof Page && $adminPage->id > 0) {
			$pw->fuel->set('page', $adminPage);
			$isolated->ready();
			expect($isolated->hooks()->isRegistered())->toBeTrue();
		}

		// 5. gateway() also ensures FieldIntegrationHooks are registered
		$isolated->hooks()->unregister();
		expect($isolated->hooks()->isRegistered())->toBeFalse();
		$isolated->gateway();
		expect($isolated->hooks()->isRegistered())->toBeTrue();
	} finally {
		$isolated->hooks()->unregister();
		$pw->fuel->set('react', $origReact);
		if ($origPage instanceof Page) {
			$pw->fuel->set('page', $origPage);
		}
	}
});

test('Clean-boot frontend ProcessWire instance keeps FieldIntegrationHooks unregistered, registers /_react/* hooks, and emits zero ModulesLoader warnings', function (): void {
	$res = rwRunCleanBootSubprocess(<<<'PHP'
$wire->config->debug = true;
$react = $wire->modules->offsetGet('React');
$reactLoaded = $react instanceof \ProcessWire\React;
$hooksProp = new \ReflectionProperty($react, 'fieldHooks');
$fieldHooksInstance = $hooksProp->getValue($react);
$warnings = array_merge(
	is_array($wire->warnings(false)) ? $wire->warnings(false) : [],
	is_array($wire->log->getLines('modules', ['limit' => 20])) ? $wire->log->getLines('modules', ['limit' => 20]) : []
);
// Also simulate a non-CLI frontend shouldRegisterFieldHooks() check
$frontendShouldRegister = $react->shouldRegisterFieldHooks('/', false);
$consoleLoaded = !($wire->modules->offsetGet('ProcessWireConsole') instanceof \ProcessWire\ModulePlaceholder)
	&& class_exists(\ProcessWire\ProcessWireConsole::class, false);
$exportLoaded = !($wire->modules->offsetGet('ProcessReactExportProfile') instanceof \ProcessWire\ModulePlaceholder)
	&& class_exists(\ProcessWire\ProcessReactExportProfile::class, false);
echo json_encode([
	'react_loaded' => $reactLoaded,
	'field_hooks_allocated_on_cli' => $fieldHooksInstance !== null,
	'frontend_should_register' => $frontendShouldRegister,
	'has_viewport_path_hook' => $wire->hooks->hasPathHooks('/_react/viewport'),
	'has_icons_path_hook' => $wire->hooks->hasPathHooks('/_react/icons'),
	'console_loaded' => $consoleLoaded,
	'export_loaded' => $exportLoaded,
	'warnings' => $warnings,
], JSON_THROW_ON_ERROR);
PHP);

	expect($res['exit'])->toBe(0, 'Subprocess failed: ' . $res['stderr'])
		->and($res['stderr'])->toBe('');
	$data = json_decode($res['stdout'], true, 16, JSON_THROW_ON_ERROR);
	expect($data['react_loaded'] ?? null)->toBeTrue()
		->and($data['frontend_should_register'] ?? null)->toBeFalse()
		->and($data['has_viewport_path_hook'] ?? null)->toBeTrue()
		->and($data['has_icons_path_hook'] ?? null)->toBeTrue()
		->and($data['console_loaded'] ?? null)->toBeFalse()
		->and($data['export_loaded'] ?? null)->toBeFalse();

	foreach ((array) ($data['warnings'] ?? []) as $warning) {
		expect((string) $warning)->not->toContain('requires a non-autoload module')
			->and((string) $warning)->not->toContain('requires a conditionally autoloaded module');
	}
});

test('WorkspaceRegistry::accessible batch-preloads Process admin page URLs without N+1 queries', function (): void {
	$pw = wire();
	bootReactForTesting();
	$su = $pw->users->find('roles=superuser, include=all, limit=1')->first();
	expect($su)->toBeInstanceOf(User::class);

	$registry = new WorkspaceRegistry();
	$pw->wire($registry);

	$processes = ['ProcessContacts', 'ProcessEntries', 'ProcessPages', 'ProcessModule', 'ProcessUsers'];
	foreach ($processes as $idx => $procName) {
		$registry->register([
			'id' => 'ws-' . $idx,
			'title' => 'Workspace ' . $idx,
			'process' => $procName,
			'accessCallback' => static fn(): bool => true,
		]);
	}

	$db = $pw->database;
	$prevDebug = $pw->config->debug;
	$pw->config->debug = true;
	$db->setDebugMode(true);
	$q0 = count($db->queryLog());

	try {
		$resolved = $registry->accessible($su, '', false);
		$launcher = $registry->launcherUrl();
	} finally {
		$queries = array_slice($db->queryLog(), $q0);
		$pw->config->debug = $prevDebug;
	}

	expect($resolved)->toHaveCount(count($processes))
		->and($launcher)->toBeString()->not->toBe('');

	foreach ($processes as $idx => $procName) {
		$modId = (int) $pw->modules->getModuleID($procName);
		$expectedPage = $modId > 0 ? $pw->pages->get("template=admin, process={$modId}, include=all") : null;
		$expectedUrl = ($expectedPage instanceof Page && $expectedPage->id > 0)
			? (string) $expectedPage->url
			: '';
		if ($expectedUrl !== '') {
			expect($resolved['ws-' . $idx]['url'] ?? '')->toBe($expectedUrl);
		}
	}

	$processLookupQueries = array_filter(
		$queries,
		static fn(mixed $q): bool => str_contains((string) $q, 'field_process')
	);
	expect(count($processLookupQueries))->toBeLessThanOrEqual(1);
});
