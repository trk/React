<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Hook\FieldIntegrationHooks;
use Totoglu\React\Http\ReactGatewayRouter;
use Totoglu\React\I18n\TranslationCatalogService;
use Totoglu\React\Icon\IconManager;
use Totoglu\React\Media\MediaGateway;
use Totoglu\React\Media\PageLinkMediaHostAdapter;
use Totoglu\React\Provider\ProviderRegistry;
use Totoglu\React\Relation\RelationResourceRegistry;
use Totoglu\React\Relation\RelationStateSigner;
use Totoglu\React\Security\AccessGuard;
use Totoglu\React\Security\SignedTokenCodec;
use Totoglu\React\Support\IslandMarkup;
use Totoglu\React\Theme\ThemeManager;
use Totoglu\React\Theme\ThemePreset;
use Totoglu\React\Theme\ThemeTokenParser;
use Totoglu\React\Tiptap\TiptapMediaLinkGateway;
use Totoglu\React\Viewport\MarkupReactViewport;
use Totoglu\React\Workspace\EditPresenceStore;
use Totoglu\React\Workspace\WorkspaceDefinition;
use Totoglu\React\Workspace\WorkspaceLauncherProcess;
use Totoglu\React\Workspace\WorkspacePreferenceStore;
use Totoglu\React\Workspace\WorkspaceRegistry;
use Totoglu\React\Workspace\WorkspaceWidgetDefinition;
use Totoglu\React\Workspace\WorkspaceWidgetRegistry;

/**
 * React
 *
 * Shared React 19 + Inertia v3 + Tailwind CSS v4 UI runtime, admin shell (`ProcessReact`),
 * interactive Data Viewports (`MarkupReactTable`, `MarkupReactCards`, `MarkupReactTab`),
 * rich text editor (`InputfieldTiptap`), vector icon catalog, and `InputfieldReact*` foundation
 * for ProcessWire, with optional `ProcessReactWorkspace` (`Admin > Workspace`) hub support.
 *
 * @method void registerWorkspaces(WorkspaceRegistry $registry)
 * @method void initWorkspaceRegistry(WorkspaceRegistry $registry)
 * @method list<WorkspaceDefinition|array<string, mixed>> getWorkspaceDefinitions()
 * @method void registerWidgets(WorkspaceWidgetRegistry $registry)
 * @method void initWidgetRegistry(WorkspaceWidgetRegistry $registry)
 * @method list<WorkspaceWidgetDefinition|array<string, mixed>> getWidgetDefinitions()
 * @method void registerProviders(ProviderRegistry $registry)
 * @method void initProviderRegistry(ProviderRegistry $registry)
 * @method void registerRelationResources(RelationResourceRegistry $registry)
 * @method void initRelationRegistry(RelationResourceRegistry $registry)
 * @method void registerMediaHosts(MediaGateway $mediaGateway)
 * @method array<string, mixed> translations()
 * @method void install()
 * @method void uninstall()
 */
class React extends WireData implements Module, ConfigurableModule
{
	public const int VERSION = 20;

	/** @var array<string, WorkspaceDefinition> */
	private static array $sharedWorkspaces = [];

	/** @var array<string, WorkspaceWidgetDefinition> */
	private static array $sharedWidgets = [];

	/** @var array<string, array{module: string, capability: string}> */
	private static array $sharedViewportModes = [];

	/** @var array<string, list<string>> */
	private static array $moduleAssetUrlCache = [];

	private ?WorkspaceRegistry $workspaceRegistry = null;
	private ?WorkspaceWidgetRegistry $widgetRegistry = null;
	private ?WorkspacePreferenceStore $preferenceStore = null;
	private ?EditPresenceStore $presenceStore = null;
	private ?ProviderRegistry $providerRegistry = null;
	private ?RelationResourceRegistry $relationRegistry = null;
	private ?RelationStateSigner $relationStateSigner = null;
	private ?SignedTokenCodec $tokenCodec = null;
	private ?MediaGateway $mediaGateway = null;
	private ?TiptapMediaLinkGateway $tiptapGateway = null;
	private ?FormSchemaSerializer $formSerializer = null;
	private ?IconManager $iconManager = null;
	private ?ThemeManager $themeManager = null;
	private ?ReactGatewayRouter $gatewayRouter = null;
	private ?TranslationCatalogService $i18nService = null;
	private ?FieldIntegrationHooks $fieldHooks = null;
	private ?string $cachedLauncherUrl = null;
	private ?string $cachedLauncherAdminUrl = null;
	private ?bool $workspaceHubEnabledOverride = null;
	/** @var array<string, array{module: string, capability: string}> */
	private array $registeredViewportModes = [];
	private bool $workspacesResolved = false;
	private bool $widgetsResolved = false;
	private bool $providersResolved = false;
	private bool $relationsResolved = false;
	private bool $mediaHostsResolved = false;

	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => 'React',
			'version' => 20,
			'summary' => 'Shared React 19 + Inertia v3 + Tailwind CSS v4 runtime, admin shell, form controls, rich text editor, vector icons, and interactive data viewports for ProcessWire.',
			'href' => 'https://github.com/trk/React',
			'author' => 'Iskender TOTOGLU @trk @ukyo',
			'icon' => 'bolt',
			'singular' => true,
			'autoload' => true,
			'requires' => [
				'PHP>=8.4',
				'ProcessWire>=3.0.271',
				'Inertia',
			],
			'installs' => [
				'MarkupReactTable',
				'MarkupReactCards',
				'MarkupReactTab',
				'InputfieldReactKeyValue',
				'InputfieldReactLink',
				'InputfieldReactIcon',
				'InputfieldReactM2O',
				'InputfieldReactM2M',
				'InputfieldReactO2M',
				'InputfieldReactM2A',
				'InputfieldTiptap',
				'TextformatterTiptapMiniBlocks',
				'InputfieldReactFile',
				'InputfieldReactImage',
			],
		];
	}

	/**
	 * Default module configuration values.
	 *
	 * @return array<string, mixed>
	 */
	public static function getDefaultConfig(): array
	{
		return [
			'defaultTheme' => 'system',
			'themePreset' => 'native',
			'themeCustomTokens' => '',
			'enableKeyboardShortcuts' => true,
			'adminReturnLabel' => 'Panel',
			'useReactMediaFields' => false,
			'enableAdminVectorIcons' => true,
			'adminIconPreviewSize' => 28,
		];
	}

	public function __construct()
	{
		parent::__construct();
		$this->wire()->classLoader->addNamespace('Totoglu\\React', __DIR__ . '/src/');
		foreach (self::getDefaultConfig() as $key => $value) {
			$this->set($key, $value);
		}
	}

	/**
	 * Ensure ProcessWire autoloads `React` on boot so registries, viewports,
	 * and `/_react/*` URL hooks are active across all admin and frontend requests.
	 */
	public function isAutoload(): bool
	{
		return true;
	}

	/**
	 * Dynamic RBAC check for admin workspace features (`/_react/presence` and `ProcessReactWorkspace`):
	 * grants access when the user is a superuser or has access to at least one registered workspace.
	 *
	 * @param array<string, mixed> $data
	 */
	public static function checkAccess(array $data = []): bool
	{
		$user = isset($data['user']) && $data['user'] instanceof User ? $data['user'] : wireInstance()->user;
		if (!$user instanceof User) {
			return false;
		}
		if ($user->isSuperuser()) {
			return true;
		}
		if (!AccessGuard::isAuthenticated($user)) {
			return false;
		}

		try {
			$react = self::instance($user);

			return $react->workspaces()->accessible($user) !== [];
		} catch (\Throwable) {
			return false;
		}
	}

	/**
	 * Static helper to resolve the wired `React` singleton from any context.
	 */
	public static function instance(?Wire $context = null): self
	{
		$w = $context !== null ? $context->wire() : wireInstance();
		$react = $w->react;
		if ($react instanceof self) {
			return $react;
		}

		try {
			$inst = $w->modules->getModule('React', ['noPermissionCheck' => true]);
			if ($inst instanceof self) {
				return $inst;
			}
		} catch (\Throwable) {
			// Fallback to standalone instance during early boot or isolated unit tests
		}

		$fallback = new self();
		$w->wire($fallback);
		$fallback->init();

		return $fallback;
	}

	/**
	 * Return the wired `Inertia` module instance.
	 */
	public function inertia(): Inertia
	{
		$inst = $this->wire()->inertia;
		if ($inst instanceof Inertia) {
			return $inst;
		}

		/** @var Inertia $mod */
		$mod = $this->wire()->modules->get('Inertia');

		return $mod;
	}

	/**
	 * Return the `/_react/*` HTTP gateway router singleton.
	 */
	public function gateway(): ReactGatewayRouter
	{
		if ($this->gatewayRouter === null) {
			$this->gatewayRouter = new ReactGatewayRouter($this);
			$this->wire($this->gatewayRouter);
		}

		return $this->gatewayRouter;
	}

	/**
	 * Return the translation catalog and i18n service singleton.
	 */
	public function i18n(): TranslationCatalogService
	{
		if ($this->i18nService === null) {
			$this->i18nService = new TranslationCatalogService($this);
			$this->wire($this->i18nService);
		}

		return $this->i18nService;
	}

	/**
	 * Return the ProcessWire field/template/admin-icon hook coordinator singleton.
	 */
	public function hooks(): FieldIntegrationHooks
	{
		if ($this->fieldHooks === null) {
			$this->fieldHooks = new FieldIntegrationHooks($this);
			$this->wire($this->fieldHooks);
		}

		return $this->fieldHooks;
	}

	/**
	 * Return the shared HMAC-SHA256 `SignedTokenCodec` singleton.
	 */
	public function tokenCodec(): SignedTokenCodec
	{
		if ($this->tokenCodec === null) {
			$this->tokenCodec = new SignedTokenCodec();
			$this->wire($this->tokenCodec);
		}

		return $this->tokenCodec;
	}

	/**
	 * Override whether the optional `ProcessReactWorkspace` hub is treated as installed (used in tests).
	 */
	public function setWorkspaceHubEnabled(?bool $enabled): self
	{
		$this->workspaceHubEnabledOverride = $enabled;
		$this->cachedLauncherUrl = null;
		$this->cachedLauncherAdminUrl = null;

		return $this;
	}

	/**
	 * Determine whether the optional `ProcessReactWorkspace` (`Admin > Workspace`) hub module is installed.
	 */
	public function isWorkspaceHubInstalled(): bool
	{
		if ($this->workspaceHubEnabledOverride !== null) {
			return $this->workspaceHubEnabledOverride;
		}

		return $this->wire()->modules->isInstalled('ProcessReactWorkspace');
	}

	public function wired(): void
	{
		parent::wired();
		$this->wire('react', $this);
	}

	public function init(): void
	{
		$wire = $this->wire();
		$wire->set('react', $this);

		$wire->addHook('/_react/viewport', $this, 'handleViewportRequest');
		$wire->addHook('/_react/workspace-prefs', $this, 'handleWorkspacePrefsRequest');
		$wire->addHook('/_react/presence', $this, 'handlePresenceRequest');
		$wire->addHook('/_react/relation', $this, 'handleRelationRequest');
		$wire->addHook('/_react/media', $this, 'handleMediaRequest');
		$wire->addHook('/_react/tiptap', $this, 'handleTiptapRequest');
		$wire->addHook('/_react/icons', $this, 'handleIconsRequest');

		$this->hooks()->register();
	}

	/**
	 * Determine whether ProcessWire is currently inside `ProcessController::execute`.
	 */
	public function isExecutingProcessController(): bool
	{
		return $this->hooks()->isExecutingProcessController();
	}

	/**
	 * Resolve the active shell execution mode (`'workspace'` or `'admin'`) for a `ProcessReact` request.
	 */
	public function resolveShellMode(?Process $process = null): string
	{
		if ($process instanceof WorkspaceLauncherProcess) {
			return 'workspace';
		}

		if (!$this->isWorkspaceHubInstalled()) {
			return 'admin';
		}

		return $this->isWorkspaceContextRequest() ? 'workspace' : 'admin';
	}

	/**
	 * Determine whether the current HTTP request carries an active Workspace shell context.
	 */
	public function isWorkspaceContextRequest(): bool
	{
		$input = $this->wire()->input;
		if ((string) $input->get('ws') === '1' || (string) $input->post('_rw_ws') === '1') {
			return true;
		}
		if ((int) $input->get('modal') === 1 || (string) $input->post('_rw_modal') === '1') {
			return false;
		}

		$shellHeader = strtolower(trim((string) ($_SERVER['HTTP_X_REACT_SHELL'] ?? '')));
		if ($shellHeader === 'workspace') {
			return true;
		}
		if ($shellHeader === 'admin') {
			return false;
		}

		$isInertiaHeader = strtolower(trim((string) ($_SERVER['HTTP_X_INERTIA'] ?? ''))) === 'true';
		if ($isInertiaHeader) {
			$referer = trim((string) ($_SERVER['HTTP_REFERER'] ?? ''));
			if ($referer !== '') {
				$parts = parse_url($referer);
				if (is_array($parts)) {
					$queryStr = (string) ($parts['query'] ?? '');
					if ($queryStr !== '') {
						parse_str($queryStr, $queryParams);
						if (($queryParams['ws'] ?? null) === '1') {
							return true;
						}
					}
					$refPath = rtrim((string) ($parts['path'] ?? ''), '/') . '/';
					$launcherPath = rtrim((string) parse_url($this->resolveLauncherUrl(), PHP_URL_PATH), '/') . '/';
					if ($launcherPath !== '/' && $refPath === $launcherPath) {
						return true;
					}
				}
			}
		}

		return false;
	}

	/**
	 * Append `ws=1` to a local ProcessWire admin module URL when appropriate.
	 */
	public function withWorkspaceQuery(string $url): string
	{
		$trimmed = trim($url);
		if (
			$trimmed === ''
			|| str_starts_with($trimmed, '#')
			|| preg_match('/^(?:javascript|mailto|tel|data|blob):/i', $trimmed) === 1
		) {
			return $url;
		}

		$config = $this->wire()->config;
		$parts = parse_url($trimmed);
		if (!is_array($parts)) {
			return $url;
		}

		if (isset($parts['host']) && $parts['host'] !== '') {
			$currentHost = strtolower((string) ($config->httpHost ?: ''));
			$targetHost = strtolower((string) $parts['host']) . (isset($parts['port']) ? ':' . (int) $parts['port'] : '');
			if ($currentHost !== '' && $targetHost !== $currentHost && strtolower((string) $parts['host']) !== $currentHost) {
				return $url;
			}
		}

		$queryStr = (string) ($parts['query'] ?? '');
		if ($queryStr !== '') {
			parse_str($queryStr, $queryParams);
			if (
				array_key_exists('ws', $queryParams)
				|| ($queryParams['modal'] ?? null) === '1'
				|| isset($queryParams['export'])
				|| isset($queryParams['download_token'])
			) {
				return $url;
			}
		}

		$path = (string) ($parts['path'] ?? '');
		$adminUrl = rtrim((string) ($config->urls->admin ?: '/processwire/'), '/') . '/';
		$launcherPath = rtrim((string) parse_url($this->resolveLauncherUrl(), PHP_URL_PATH), '/') . '/';
		$normalizedPath = $path !== '' ? rtrim($path, '/') . '/' : '';

		if ($normalizedPath !== '') {
			if (
				!str_starts_with($normalizedPath, $adminUrl)
				|| $normalizedPath === $adminUrl
				|| $normalizedPath === $launcherPath
				|| str_starts_with($normalizedPath, $adminUrl . 'login/')
				|| str_contains($normalizedPath, '/_react/')
			) {
				return $url;
			}
		}

		$fragment = isset($parts['fragment']) && $parts['fragment'] !== '' ? '#' . $parts['fragment'] : '';
		$withoutFragment = isset($parts['fragment'])
			? substr($trimmed, 0, (int) strpos($trimmed, '#'))
			: $trimmed;
		$separator = str_contains($withoutFragment, '?') ? '&' : '?';

		return $withoutFragment . $separator . 'ws=1' . $fragment;
	}

	/**
	 * Resolve the admin URL of the optional `ProcessReactWorkspace` (`Admin > Workspace`) hub page.
	 */
	public function resolveLauncherUrl(): string
	{
		$config = $this->wire()->config;
		$pages = $this->wire()->pages;
		$adminUrl = (string) ($config->urls->admin ?: '/processwire/');

		if ($this->cachedLauncherUrl === null || $this->cachedLauncherAdminUrl !== $adminUrl) {
			$resolvedLauncher = rtrim($adminUrl, '/') . '/workspace/';
			try {
				$wsPage = $pages->get('template=admin, name=workspace, include=all');
				if ($wsPage instanceof Page && $wsPage->id > 0) {
					$resolvedLauncher = (string) $wsPage->url;
				}
			} catch (\Throwable) {
				// Keep default launcher URL
			}
			$this->cachedLauncherAdminUrl = $adminUrl;
			$this->cachedLauncherUrl = $resolvedLauncher;
		}

		return $this->cachedLauncherUrl;
	}

	/**
	 * Read and decode a JSON request body with strict byte-size and nesting-depth bounds.
	 *
	 * @return array<string, mixed>|null
	 */
	public function readJsonRequestBody(int $maxBytes = 2097152, int $maxDepth = 64): ?array
	{
		return $this->gateway()->decodeJsonRequestBody(
			fn(int $limit): string => $this->readRawInputStream($limit),
			$maxBytes,
			$maxDepth,
		);
	}

	/**
	 * Read at most `$limit` bytes from `php://input`.
	 */
	protected function readRawInputStream(int $limit): string
	{
		$raw = @file_get_contents('php://input', false, null, 0, max(1, $limit));

		return is_string($raw) ? $raw : '';
	}

	/**
	 * Return the `FormSchemaSerializer` singleton for converting `InputfieldWrapper` trees or field definitions
	 * into `ReactWorkspace/SchemaForm` JSON schemas.
	 */
	public function forms(): FormSchemaSerializer
	{
		if ($this->formSerializer === null) {
			$this->formSerializer = new FormSchemaSerializer();
			$this->wire($this->formSerializer);
		}

		return $this->formSerializer;
	}

	/**
	 * Determine whether `MediaGateway` has already run `registerMediaHosts` discovery hooks on this instance.
	 */
	public function isMediaHostsResolved(): bool
	{
		return $this->mediaHostsResolved;
	}

	/**
	 * Defer a module's `MediaHostAdapterInterface` registration until `media()` is actually requested.
	 *
	 * @param callable(MediaGateway, self): void $registrar
	 */
	public static function deferMediaHostRegistration(Wire $module, callable $registrar): void
	{
		$module->addHookAfter('React::registerMediaHosts', static function (HookEvent $event) use ($registrar): void {
			$react = $event->object;
			$gateway = $event->arguments(0);
			if ($react instanceof self && $gateway instanceof MediaGateway) {
				$registrar($gateway, $react);
			}
		});

		$existing = $module->wire()->fuel->get('react');
		if ($existing instanceof self && $existing->isMediaHostsResolved()) {
			$registrar($existing->media(), $existing);
		}
	}

	/**
	 * Hookable lifecycle method for upper-layer modules to register custom `MediaHostAdapterInterface` adapters.
	 */
	public function ___registerMediaHosts(MediaGateway $gateway): void
	{
		$gateway->registerHostAdapter(new PageLinkMediaHostAdapter());
	}

	/**
	 * Return the `MediaGateway` singleton for signing `mediaToken` envelopes and executing `/_react/media` actions.
	 */
	public function media(): MediaGateway
	{
		if ($this->mediaGateway === null) {
			$gateway = new MediaGateway();
			$this->wire($gateway);
			$this->mediaGateway = $gateway;
		} else {
			$gateway = $this->mediaGateway;
		}

		if (!$this->mediaHostsResolved) {
			$this->mediaHostsResolved = true;
			$this->registerMediaHosts($gateway);
		}

		return $gateway;
	}

	/**
	 * Return the `TiptapMediaLinkGateway` singleton powering `/_react/tiptap`.
	 */
	public function tiptap(): TiptapMediaLinkGateway
	{
		if ($this->tiptapGateway === null) {
			$gateway = new TiptapMediaLinkGateway();
			$this->wire($gateway);
			$this->tiptapGateway = $gateway;
		}

		return $this->tiptapGateway;
	}

	/**
	 * Serialize an `InputfieldForm` or `InputfieldWrapper` into a `ReactWorkspace/SchemaForm` JSON schema array.
	 *
	 * @param array<string, mixed> $options
	 * @return array<string, mixed>
	 */
	public function serializeForm(InputfieldWrapper $form, array $options = []): array
	{
		return $this->forms()->serialize($form, $options);
	}

	/**
	 * Serialize declarative field definitions into a `ReactWorkspace/SchemaForm` JSON schema array.
	 *
	 * @param iterable<mixed> $definitions
	 * @param array<string, mixed> $options
	 * @return array<string, mixed>
	 */
	public function serializeFormDefinitions(iterable $definitions, array $options = []): array
	{
		return $this->forms()->serializeDefinitions($definitions, $options);
	}

	/**
	 * Return the centralized `IconManager` singleton for vector SVG rendering, value normalization, and Admin CSS generation.
	 */
	public function icons(): IconManager
	{
		if ($this->iconManager === null) {
			$this->iconManager = new IconManager();
			$this->wire($this->iconManager);
		}

		return $this->iconManager;
	}

	/**
	 * Return the central `ThemeManager` resolving theme mode, admin color scheme, and the site-wide theme preset.
	 */
	public function theme(): ThemeManager
	{
		if ($this->themeManager === null) {
			$this->themeManager = new ThemeManager($this);
			$this->wire($this->themeManager);
		}

		return $this->themeManager;
	}

	public function ready(): void
	{
		$page = $this->wire()->page;
		if (!$page instanceof Page || !$page->template instanceof Template || $page->template->name !== 'admin') {
			return;
		}

		$adminTheme = $this->wire()->adminTheme;
		if ($adminTheme instanceof AdminTheme) {
			$themeCss = $this->theme()->resolveThemeTokenCss($this->wire()->user);
			if ($themeCss !== '') {
				$adminTheme->addExtraMarkup('head', '<style id="rw-theme-tokens">' . $themeCss . '</style>');
			}
		}

		if ((bool) $this->get('enableAdminVectorIcons') && $this->icons()->hasActiveAdminCss()) {
			$config = $this->wire()->config;
			$config->styles->add($config->versionUrl($this->icons()->getAdminCssUrl(), true));
		}
	}

	/**
	 * Register a pluggable viewport layout mode (`kanban`, `calendar`, etc.) backed by an installed module.
	 *
	 * @param string $capability Optional provider capability gate (`'stage'`, `'dateStart'`, or `''`)
	 */
	public function registerViewportMode(string $mode, string $moduleName, string $capability = ''): void
	{
		$cleanMode = strtolower(trim($mode));
		$cleanModule = trim($moduleName);
		if ($cleanMode === '' || $cleanModule === '') {
			return;
		}
		if (str_starts_with($cleanModule, 'ProcessWire\\')) {
			$cleanModule = substr($cleanModule, strlen('ProcessWire\\'));
		}
		$cleanCap = in_array($capability, ['stage', 'dateStart', ''], true) ? $capability : '';
		$entry = [
			'module' => $cleanModule,
			'capability' => $cleanCap,
		];
		$this->registeredViewportModes[$cleanMode] = $entry;
		self::$sharedViewportModes[$cleanMode] = $entry;
	}

	/**
	 * Return all registered pluggable viewport layout modes (`mode => ['module' => ..., 'capability' => ...]`).
	 *
	 * @return array<string, array{module: string, capability: string}>
	 */
	public function getRegisteredViewportModes(): array
	{
		return array_replace(self::$sharedViewportModes, $this->registeredViewportModes);
	}

	/**
	 * Resolve a `ReactDataProviderInterface` instance from a descriptor, `PageArray`, array, or `Closure`.
	 *
	 * @param string|array<int|string, mixed>|\Closure|PageArray|ReactDataProviderInterface $source
	 * @param array<string, mixed> $options
	 */
	public function provider(
		string|array|\Closure|PageArray|ReactDataProviderInterface $source,
		array $options = [],
	): ReactDataProviderInterface {
		return $this->providers()->resolve($source, $options);
	}

	/**
	 * Resolve a `MarkupReactViewport` instance by mode (`'table'`, `'cards'`, or custom module class).
	 */
	public function viewport(string $mode = 'table'): MarkupReactViewport
	{
		$normalized = strtolower(trim($mode));
		$registered = $this->getRegisteredViewportModes();
		if (isset($registered[$normalized]['module']) && $registered[$normalized]['module'] !== '') {
			return $this->resolveViewportInstance($registered[$normalized]['module']);
		}

		return match ($normalized) {
			'cards', 'card', 'markupreactcards' => $this->cards(),
			'table', '', 'markupreacttable' => $this->table(),
			default => $this->resolveViewportInstance(
				str_starts_with($normalized, 'markupreact')
					? $mode
					: 'MarkupReact' . ucfirst($normalized)
			),
		};
	}

	/**
	 * Return a fresh `MarkupReactTable` instance.
	 */
	public function table(): MarkupReactTable
	{
		$modules = $this->wire()->modules;
		if ($modules->isInstalled('MarkupReactTable')) {
			$mod = $modules->get('MarkupReactTable');
			if ($mod instanceof MarkupReactTable) {
				return clone $mod;
			}
		}

		$table = new MarkupReactTable();
		$this->wire($table);
		$table->init();

		return $table;
	}

	/**
	 * Return a fresh `MarkupReactCards` instance.
	 */
	public function cards(): MarkupReactCards
	{
		$modules = $this->wire()->modules;
		if ($modules->isInstalled('MarkupReactCards')) {
			$mod = $modules->get('MarkupReactCards');
			if ($mod instanceof MarkupReactCards) {
				return clone $mod;
			}
		}

		$cards = new MarkupReactCards();
		$this->wire($cards);
		$cards->init();

		return $cards;
	}

	/**
	 * Return a fresh `MarkupReactTab` instance.
	 */
	public function tabs(): MarkupReactTab
	{
		$modules = $this->wire()->modules;
		if ($modules->isInstalled('MarkupReactTab')) {
			$mod = $modules->get('MarkupReactTab');
			if ($mod instanceof MarkupReactTab) {
				return clone $mod;
			}
		}

		$tabs = new MarkupReactTab();
		$this->wire($tabs);
		$tabs->init();

		return $tabs;
	}

	/**
	 * Configure and return a `MarkupReactTable` instance.
	 *
	 * @param string|array<int|string, mixed>|\Closure|PageArray|ReactDataProviderInterface $provider
	 * @param array<string, mixed> $props
	 */
	public function configureTable(
		string|array|\Closure|PageArray|ReactDataProviderInterface $provider = '',
		array $props = [],
	): MarkupReactTable {
		return $this->table()->configure($provider, $props);
	}

	/**
	 * Configure and return a `MarkupReactCards` instance.
	 *
	 * @param string|array<int|string, mixed>|\Closure|PageArray|ReactDataProviderInterface $provider
	 * @param array<string, mixed> $props
	 */
	public function configureCards(
		string|array|\Closure|PageArray|ReactDataProviderInterface $provider = '',
		array $props = [],
	): MarkupReactCards {
		return $this->cards()->configure($provider, $props);
	}

	/**
	 * Render a `MarkupReactTable` React Island HTML string.
	 *
	 * @param string|array<int|string, mixed>|\Closure|PageArray|ReactDataProviderInterface $provider
	 * @param array<string, mixed> $props
	 */
	public function renderTable(
		string|array|\Closure|PageArray|ReactDataProviderInterface $provider = '',
		array $props = [],
	): string {
		return $this->table()->render($provider, $props);
	}

	/**
	 * Render a `MarkupReactCards` React Island HTML string.
	 *
	 * @param string|array<int|string, mixed>|\Closure|PageArray|ReactDataProviderInterface $provider
	 * @param array<string, mixed> $props
	 */
	public function renderCards(
		string|array|\Closure|PageArray|ReactDataProviderInterface $provider = '',
		array $props = [],
	): string {
		return $this->cards()->render($provider, $props);
	}

	/**
	 * Render a `MarkupReactTab` React Island HTML string.
	 *
	 * @param list<array<string, mixed>> $tabs
	 * @param array<string, mixed> $props
	 */
	public function renderTabs(array $tabs = [], array $props = []): string
	{
		return $this->tabs()->configure($tabs, $props)->render();
	}

	public function handleViewportRequest(HookEvent $event): string
	{
		return $this->gateway()->handleViewportRequest($event);
	}

	/**
	 * Execute a signed viewport action and return the structured response array.
	 *
	 * @param array<string, mixed> $requestPayload
	 * @return array{ok: bool, status?: int, error?: string, viewport?: array<string, mixed>}
	 */
	public function handleViewportAction(array $requestPayload, bool $enforceCsrf = false): array
	{
		return $this->gateway()->handleViewportAction($requestPayload, $enforceCsrf);
	}

	protected function resolveViewportInstance(string $viewportClass): MarkupReactViewport
	{
		return $this->gateway()->resolveViewportInstance($viewportClass);
	}

	/**
	 * Verify CSRF token (`X-CSRF-TOKEN`, `X-XSRF-TOKEN`, or form payload token) for mutating `/_react/*` requests.
	 *
	 * @param array<string, mixed> $requestPayload
	 */
	public function verifyRequestCsrf(array $requestPayload): bool
	{
		return $this->gateway()->verifyRequestCsrf($requestPayload);
	}

	/**
	 * Determine whether the `WorkspaceRegistry` has already run discovery hooks on this instance.
	 */
	public function isWorkspacesResolved(): bool
	{
		return $this->workspacesResolved;
	}

	/**
	 * Determine whether the `WorkspaceWidgetRegistry` has already run discovery hooks on this instance.
	 */
	public function isWidgetsResolved(): bool
	{
		return $this->widgetsResolved;
	}

	public static function forgetSharedWorkspace(string $id): void
	{
		unset(self::$sharedWorkspaces[strtolower(trim($id))]);
	}

	public static function forgetSharedWidget(string $id): void
	{
		unset(self::$sharedWidgets[strtolower(trim($id))]);
	}

	/**
	 * Defer a module's workspace and dashboard widget registration until `workspaces()` or `widgets()` is requested.
	 *
	 * @param callable(self): void|null $workspaceRegistrar
	 * @param callable(self): void|null $widgetRegistrar
	 */
	public static function deferModuleRegistration(
		Wire $module,
		?callable $workspaceRegistrar = null,
		?callable $widgetRegistrar = null,
	): void {
		if ($workspaceRegistrar !== null) {
			$module->addHookAfter('React::registerWorkspaces', static function (HookEvent $event) use ($workspaceRegistrar): void {
				$react = $event->object;
				if ($react instanceof self) {
					$workspaceRegistrar($react);
				}
			});
		}

		if ($widgetRegistrar !== null) {
			$module->addHookAfter('React::registerWidgets', static function (HookEvent $event) use ($widgetRegistrar): void {
				$react = $event->object;
				if ($react instanceof self) {
					$widgetRegistrar($react);
				}
			});
		}

		$existing = $module->wire()->fuel->get('react');
		if ($existing instanceof self) {
			if ($workspaceRegistrar !== null && $existing->isWorkspacesResolved()) {
				$workspaceRegistrar($existing);
			}
			if ($widgetRegistrar !== null && $existing->isWidgetsResolved()) {
				$widgetRegistrar($existing);
			}
		}
	}

	/**
	 * Return the `WorkspaceRegistry` singleton and trigger workspace discovery hooks once.
	 */
	public function workspaces(): WorkspaceRegistry
	{
		if ($this->workspaceRegistry === null) {
			$registry = new WorkspaceRegistry();
			$this->wire($registry);
			$this->workspaceRegistry = $registry;
		} else {
			$registry = $this->workspaceRegistry;
		}

		if (!$this->workspacesResolved) {
			$this->workspacesResolved = true;
			foreach (self::$sharedWorkspaces as $sharedDef) {
				$registry->register($sharedDef);
			}
			$this->initWorkspaceRegistry($registry);
			$this->registerWorkspaces($registry);
			foreach ($this->getWorkspaceDefinitions() as $def) {
				if ($def instanceof WorkspaceDefinition || is_array($def)) {
					$registry->register($def);
				}
			}
		}

		return $registry;
	}

	/**
	 * Register an application workspace with `ProcessReactWorkspace`.
	 *
	 * @param WorkspaceDefinition|array<string, mixed> $definition
	 */
	public function registerWorkspace(WorkspaceDefinition|array $definition): self
	{
		$def = $definition instanceof WorkspaceDefinition
			? $definition
			: WorkspaceDefinition::fromArray($definition);

		if ($def->id !== '' && $def->title !== '') {
			self::$sharedWorkspaces[$def->id] = $def;
		}

		if ($this->workspaceRegistry !== null) {
			$this->workspaceRegistry->register($def);
		}

		return $this;
	}

	public function ___initWorkspaceRegistry(WorkspaceRegistry $registry): void {}

	public function ___registerWorkspaces(WorkspaceRegistry $registry): void {}

	/**
	 * @return list<WorkspaceDefinition|array<string, mixed>>
	 */
	public function ___getWorkspaceDefinitions(): array
	{
		return [];
	}

	/**
	 * Return the `WorkspaceWidgetRegistry` singleton and trigger widget discovery hooks once.
	 */
	public function widgets(): WorkspaceWidgetRegistry
	{
		if ($this->widgetRegistry === null) {
			$registry = new WorkspaceWidgetRegistry();
			$this->wire($registry);
			$this->widgetRegistry = $registry;
		} else {
			$registry = $this->widgetRegistry;
		}

		if (!$this->widgetsResolved) {
			$this->widgetsResolved = true;
			foreach (self::$sharedWidgets as $sharedWidget) {
				$registry->register($sharedWidget);
			}
			$this->initWidgetRegistry($registry);
			$this->registerWidgets($registry);
			foreach ($this->getWidgetDefinitions() as $def) {
				if ($def instanceof WorkspaceWidgetDefinition || is_array($def)) {
					$registry->register($def);
				}
			}
		}

		return $registry;
	}

	/**
	 * Register a dashboard widget with `ProcessReactWorkspace`.
	 *
	 * @param WorkspaceWidgetDefinition|array<string, mixed> $definition
	 */
	public function registerWidget(WorkspaceWidgetDefinition|array $definition): self
	{
		$def = $definition instanceof WorkspaceWidgetDefinition
			? $definition
			: WorkspaceWidgetDefinition::fromArray($definition);

		if ($def->id !== '' && $def->title !== '') {
			self::$sharedWidgets[$def->id] = $def;
		}

		if ($this->widgetRegistry !== null) {
			$this->widgetRegistry->register($def);
		}

		return $this;
	}

	public function ___initWidgetRegistry(WorkspaceWidgetRegistry $registry): void {}

	public function ___registerWidgets(WorkspaceWidgetRegistry $registry): void {}

	/**
	 * @return list<WorkspaceWidgetDefinition|array<string, mixed>>
	 */
	public function ___getWidgetDefinitions(): array
	{
		return [];
	}

	/**
	 * Return the file-backed per-user `WorkspacePreferenceStore`.
	 */
	public function workspacePreferences(): WorkspacePreferenceStore
	{
		if ($this->preferenceStore === null) {
			$this->preferenceStore = new WorkspacePreferenceStore();
			$this->wire($this->preferenceStore);
		}

		return $this->preferenceStore;
	}

	public function handleWorkspacePrefsRequest(HookEvent $event): string
	{
		return $this->gateway()->handleWorkspacePrefsRequest($event);
	}

	/**
	 * @param array<string, mixed> $requestPayload
	 * @return array{ok: bool, status?: int, error?: string, preferences?: array<string, mixed>, themeMode?: string, themePreset?: string, themeCss?: string, preset?: array<string, mixed>}
	 */
	public function handleWorkspacePrefsAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array
	{
		return $this->gateway()->handleWorkspacePrefsAction($requestPayload, $enforceCsrf, $user);
	}

	/**
	 * Return the file-backed `EditPresenceStore` for concurrent edit awareness and remote-save tracking.
	 */
	public function presence(): EditPresenceStore
	{
		if ($this->presenceStore === null) {
			$this->presenceStore = new EditPresenceStore();
			$this->wire($this->presenceStore);
		}

		return $this->presenceStore;
	}

	public function handlePresenceRequest(HookEvent $event): string
	{
		return $this->gateway()->handlePresenceRequest($event);
	}

	/**
	 * @param array<string, mixed> $requestPayload
	 * @return array{ok: bool, status?: int, error?: string, presence?: array<string, mixed>}
	 */
	public function handlePresenceAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array
	{
		return $this->gateway()->handlePresenceAction($requestPayload, $enforceCsrf, $user);
	}

	/**
	 * Notify active co-editors that `$resourceKey` was saved on the server.
	 */
	public function notifyResourceSaved(string $resourceKey, ?User $user = null): void
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticated($resolvedUser)) {
			return;
		}

		$store = $this->presence();
		$cleanKey = $store->sanitizeResourceKey($resourceKey);
		if ($cleanKey === '') {
			return;
		}

		$path = $store->filePath($cleanKey);
		if ($path !== '' && is_file($path)) {
			$store->markSaved($cleanKey, $resolvedUser);
		}
	}

	/**
	 * Resolve the localized Admin Return Button label (default: `Panel`).
	 */
	public function resolveAdminReturnLabel(?User $user = null): string
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if (isset($resolvedUser->language) && $resolvedUser->language instanceof Language) {
			$lang = $resolvedUser->language;
			if ((int) $lang->id > 0 && !$lang->isDefault()) {
				$langValue = trim((string) ($this->get('adminReturnLabel__' . (int) $lang->id) ?? ''));
				if ($langValue !== '') {
					return html_entity_decode($langValue, ENT_QUOTES | ENT_HTML5, 'UTF-8');
				}
			}
		}

		$defaultVal = trim((string) ($this->get('adminReturnLabel') ?? ''));
		if ($defaultVal !== '') {
			return html_entity_decode($defaultVal, ENT_QUOTES | ENT_HTML5, 'UTF-8');
		}

		return html_entity_decode($this->_('Panel'), ENT_QUOTES | ENT_HTML5, 'UTF-8');
	}

	/**
	 * Return the `ProviderRegistry` singleton and trigger `React::registerProviders` once.
	 */
	public function providers(): ProviderRegistry
	{
		if ($this->providerRegistry === null) {
			$registry = new ProviderRegistry();
			$this->wire($registry);
			$this->providerRegistry = $registry;
		} else {
			$registry = $this->providerRegistry;
		}

		if (!$this->providersResolved) {
			$this->providersResolved = true;
			$this->initProviderRegistry($registry);
			$this->registerProviders($registry);
		}

		return $registry;
	}

	public function isProvidersResolved(): bool
	{
		return $this->providersResolved;
	}

	/**
	 * @param callable(ProviderRegistry, self): void $registrar
	 */
	public static function deferProviderRegistration(Wire $module, callable $registrar): void
	{
		$module->addHookAfter('React::registerProviders', static function (HookEvent $event) use ($registrar): void {
			$react = $event->object;
			$registry = $event->arguments(0);
			if ($react instanceof self && $registry instanceof ProviderRegistry) {
				$registrar($registry, $react);
			}
		});

		$existing = $module->wire()->fuel->get('react');
		if ($existing instanceof self && $existing->isProvidersResolved()) {
			$registrar($existing->providers(), $existing);
		}
	}

	public function ___initProviderRegistry(ProviderRegistry $registry): void {}

	public function ___registerProviders(ProviderRegistry $registry): void {}

	public function handleMediaRequest(HookEvent $event): string
	{
		return $this->gateway()->handleMediaRequest($event);
	}

	/**
	 * @param array<string, mixed> $requestPayload
	 * @param array<string, mixed>|null $uploadedFiles
	 * @return array<string, mixed>
	 */
	public function handleMediaAction(
		array $requestPayload,
		bool $enforceCsrf = false,
		?User $user = null,
		?array $uploadedFiles = null,
	): array {
		return $this->gateway()->handleMediaAction($requestPayload, $enforceCsrf, $user, $uploadedFiles);
	}

	public function handleTiptapRequest(HookEvent $event): string
	{
		return $this->gateway()->handleTiptapRequest($event);
	}

	/**
	 * @param array<string, mixed> $requestPayload
	 * @param array<string, mixed>|null $uploadedFiles
	 * @return array<string, mixed>
	 */
	public function handleTiptapAction(
		array $requestPayload,
		bool $enforceCsrf = false,
		?User $user = null,
		?array $uploadedFiles = null,
	): array {
		return $this->gateway()->handleTiptapAction($requestPayload, $enforceCsrf, $user, $uploadedFiles);
	}

	public function handleIconsRequest(HookEvent $event): string
	{
		return $this->gateway()->handleIconsRequest($event);
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	public function handleIconsAction(array $params): array
	{
		return $this->gateway()->handleIconsAction($params);
	}

	public function isRelationsResolved(): bool
	{
		return $this->relationsResolved;
	}

	/**
	 * @param callable(RelationResourceRegistry, self): void $registrar
	 */
	public static function deferRelationRegistration(Wire $module, callable $registrar): void
	{
		$module->addHookAfter('React::registerRelationResources', static function (HookEvent $event) use ($registrar): void {
			$react = $event->object;
			$registry = $event->arguments(0);
			if ($react instanceof self && $registry instanceof RelationResourceRegistry) {
				$registrar($registry, $react);
			}
		});

		$existing = $module->wire()->fuel->get('react');
		if ($existing instanceof self && $existing->isRelationsResolved()) {
			$registrar($existing->relations(), $existing);
		}
	}

	/**
	 * Return the `RelationResourceRegistry` singleton and trigger `registerRelationResources` once.
	 */
	public function relations(): RelationResourceRegistry
	{
		if ($this->relationRegistry === null) {
			$registry = new RelationResourceRegistry();
			$this->wire($registry);
			$this->relationRegistry = $registry;
		} else {
			$registry = $this->relationRegistry;
		}

		if (!$this->relationsResolved) {
			$this->relationsResolved = true;
			$this->initRelationRegistry($registry);
			$this->registerRelationResources($registry);
		}

		return $registry;
	}

	/**
	 * Return the `RelationStateSigner` singleton for signing and verifying `relationToken` envelopes.
	 */
	public function relationSigner(): RelationStateSigner
	{
		if ($this->relationStateSigner === null) {
			$this->relationStateSigner = new RelationStateSigner();
			$this->wire($this->relationStateSigner);
		}

		return $this->relationStateSigner;
	}

	public function ___initRelationRegistry(RelationResourceRegistry $registry): void {}

	public function ___registerRelationResources(RelationResourceRegistry $registry): void {}

	public function handleRelationRequest(HookEvent $event): string
	{
		return $this->gateway()->handleRelationRequest($event);
	}

	/**
	 * @param array<string, mixed> $requestPayload
	 * @return array<string, mixed>
	 */
	public function handleRelationAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array
	{
		return $this->gateway()->handleRelationAction($requestPayload, $enforceCsrf, $user);
	}

	/**
	 * Render a standalone React Island and register `ReactInertia.js` / `ReactInertia.css`.
	 *
	 * @param array<string, mixed> $props
	 * @param list<string> $extraScripts
	 * @param list<string> $extraStyles
	 */
	public function renderIsland(
		string $component,
		array $props = [],
		array $extraScripts = [],
		array $extraStyles = [],
	): string {
		$config = $this->wire()->config;
		foreach ($this->resolveInertiaStyleAssets($extraStyles) as $styleUrl) {
			$config->styles->add($styleUrl);
		}
		foreach ($this->resolveInertiaScriptAssets($extraScripts) as $scriptUrl) {
			$config->scripts->add($scriptUrl);
		}

		return IslandMarkup::render($component, $props);
	}

	public function ___install(): void
	{
	}

	public function ___uninstall(): void
	{
		$w = $this->wire();
		$w->session->removeFor('ReactViewPrefs', true);
		$db = $w->database;
		try {
			$stmt = $db->prepare('DELETE FROM `pages_meta` WHERE `name` LIKE :prefix');
			$stmt->bindValue(':prefix', 'react_view_prefs_%');
			$stmt->execute();
		} catch (\Throwable $e) {
			$w->log->error('React uninstall cleanup error: ' . $e->getMessage());
		}
		$this->presence()->purgeAll();
		$this->workspacePreferences()->purgeAll();
		$files = $w->files;
		$assetsPath = (string) $w->config->paths->assets;
		if ($assetsPath !== '') {
			$iconCssDir = rtrim($assetsPath, '/') . '/vector-icons';
			if (is_dir($iconCssDir)) {
				$files->rmdir($iconCssDir, true);
			}
			$cacheRootDir = rtrim($assetsPath, '/') . '/cache/React';
			if (is_dir($cacheRootDir)) {
				$files->rmdir($cacheRootDir, true);
			}
		}
		self::$sharedWorkspaces = [];
		self::$sharedWidgets = [];
		self::$sharedViewportModes = [];
		self::$moduleAssetUrlCache = [];
		$this->registeredViewportModes = [];
		$this->providerRegistry = null;
		$this->relationRegistry = null;
		$this->relationStateSigner = null;
		$this->tokenCodec = null;
		$this->mediaGateway = null;
		$this->mediaHostsResolved = false;
		$this->formSerializer = null;
		$this->iconManager = null;
		$this->themeManager = null;
		$this->gatewayRouter = null;
		$this->i18nService = null;
		$this->fieldHooks = null;
		$this->cachedLauncherUrl = null;
		$this->cachedLauncherAdminUrl = null;
		$this->workspaceHubEnabledOverride = null;
		$this->workspaceRegistry = null;
		$this->widgetRegistry = null;
		$this->preferenceStore = null;
		$this->presenceStore = null;
		$w->fuel->remove('react');
	}

	/**
	 * Resolve a versioned `dist/<filename>` URL for `React`.
	 *
	 * @return list<string>
	 */
	public function resolveModuleAssetUrl(string $filename): array
	{
		$config = $this->wire()->config;
		$moduleUrl = rtrim((string) ($config->urls->siteModules ?: '/site/modules/'), '/') . '/React/';
		$cleanFile = ltrim($filename, '/');
		$cacheKey = $moduleUrl . $cleanFile;
		if (isset(self::$moduleAssetUrlCache[$cacheKey])) {
			return self::$moduleAssetUrlCache[$cacheKey];
		}

		$version = (string) (self::getModuleInfo()['version'] ?? self::VERSION);
		$filePath = __DIR__ . '/dist/' . $cleanFile;
		$ver = is_file($filePath) ? (string) filemtime($filePath) : $version;

		return self::$moduleAssetUrlCache[$cacheKey] = [$moduleUrl . 'dist/' . $cleanFile . '?v=' . $ver];
	}

	/**
	 * Return the ordered list of script URLs (`dist/ReactInertia.js` followed by explicit `$extraScripts`).
	 *
	 * @param list<string> $extraScripts
	 * @return list<string>
	 */
	public function resolveInertiaScriptAssets(array $extraScripts = []): array
	{
		return array_values(array_unique(array_filter(array_merge(
			$this->resolveModuleAssetUrl('ReactInertia.js'),
			$extraScripts
		))));
	}

	/**
	 * Return the ordered list of stylesheet URLs (`dist/ReactInertia.css` followed by explicit `$extraStyles`).
	 *
	 * @param list<string> $extraStyles
	 * @return list<string>
	 */
	public function resolveInertiaStyleAssets(array $extraStyles = []): array
	{
		return array_values(array_unique(array_filter(array_merge(
			$this->resolveModuleAssetUrl('ReactInertia.css'),
			$extraStyles
		))));
	}

	/**
	 * Build the shared `workspace` context payload injected into all `ProcessReact` Inertia responses.
	 *
	 * @return array<string, mixed>
	 */
	public function buildInertiaSharedContext(?Process $process = null, ?WorkspaceDefinition $activeWorkspace = null): array
	{
		$config = $this->wire()->config;
		$user = $this->wire()->user;

		$adminUrl = (string) ($config->urls->admin ?: '/processwire/');
		$hubActive = $this->isWorkspaceHubInstalled() || ($process instanceof WorkspaceLauncherProcess);
		$shellMode = $this->resolveShellMode($process);

		$launcherUrl = '';
		$launcherScripts = [];
		$accessible = [];

		if ($hubActive) {
			$launcherUrl = $this->resolveLauncherUrl();
			$launcherScripts = $this->resolveModuleAssetUrl('ProcessReactWorkspace.js');

			$accessibleMap = $this->workspaces()->accessible($user, '', false);
			$accessible = array_values($accessibleMap);
			$preferences = $this->workspacePreferences()->reconcile(
				$accessibleMap,
				null,
				$user
			);

			if ($activeWorkspace === null && $process !== null) {
				$processClass = $process->className();
				$matchedDef = $this->workspaces()->get($processClass);
				if ($matchedDef instanceof WorkspaceDefinition) {
					$activeWorkspace = $matchedDef;
				}
			}
		} else {
			$preferences = $this->workspacePreferences()->load($user);
		}

		$themeService = $this->theme();
		$themeMode = $themeService->resolveEffectiveThemeMode($user);

		$rootUrl = rtrim((string) ($config->urls->root ?: '/'), '/');
		$userProfile = $this->resolveUserAccountProfile($user, $adminUrl, $rootUrl);

		return [
			'appName' => (string) ($config->httpHost ?: 'ProcessWire'),
			'adminUrl' => $adminUrl,
			'adminReturnLabel' => $this->resolveAdminReturnLabel($user),
			'shellMode' => $shellMode,
			'launcherComponent' => $hubActive ? 'ReactWorkspace/WorkspaceLauncher' : '',
			'launcherUrl' => $launcherUrl,
			'launcherScripts' => $launcherScripts,
			'prefsEndpoint' => $rootUrl . '/_react/workspace-prefs',
			'presenceEndpoint' => $rootUrl . '/_react/presence',
			'themeMode' => $themeMode,
			'themePreset' => $themeService->activePreset($user)->value,
			'userThemePreset' => $themeService->userPresetOverride($user),
			'siteDefaultThemePreset' => $themeService->siteDefaultPreset()->value,
			'hasCustomThemeTokens' => $themeService->hasValidCustomTokens(),
			'useInputFocus' => $themeService->resolveAdminUseInputFocus(),
			'enableKeyboardShortcuts' => (bool) $this->get('enableKeyboardShortcuts'),
			'user' => [
				'id' => (int) $user->id,
				'name' => (string) ($user->name ?: 'guest'),
				'label' => $userProfile['label'],
				'email' => (string) $user->email,
				'avatarUrl' => $userProfile['avatarUrl'],
				'avatarIcon' => $userProfile['avatarIcon'],
				'viewSiteUrl' => $userProfile['viewSiteUrl'],
				'profileUrl' => $userProfile['profileUrl'],
				'logoutUrl' => $userProfile['logoutUrl'],
				'isSuperuser' => (bool) $user->isSuperuser(),
			],
			'activeWorkspace' => $activeWorkspace?->toArray(),
			'workspaces' => $accessible,
			'preferences' => $preferences,
		];
	}

	/**
	 * Resolve display label, avatar URL/icon, and ProcessWire core account links for `$user`,
	 * matching `AdminThemeFramework::___getUserNavArray()` and `AdminThemeUikit::renderUserLabel()`.
	 *
	 * @return array{label: string, avatarUrl: string, avatarIcon: string, viewSiteUrl: string, profileUrl: string, logoutUrl: string}
	 */
	private function resolveUserAccountProfile(User $user, string $adminUrl, string $rootUrl): array
	{
		$wire = $this->wire();
		$fields = $wire->fields;
		$userName = (string) ($user->name ?: 'guest');
		$userLabel = '';
		$userAvatar = '';

		try {
			$themeConfig = $wire->modules->getConfig('AdminThemeUikit');
			if (is_array($themeConfig)) {
				if (isset($themeConfig['userLabel']) && is_string($themeConfig['userLabel'])) {
					$userLabel = $themeConfig['userLabel'];
				}
				if (isset($themeConfig['userAvatar']) && is_string($themeConfig['userAvatar'])) {
					$userAvatar = trim($themeConfig['userAvatar']);
				}
			}
		} catch (\Throwable) {
			// Fall back to user name defaults
		}

		if ($userLabel === '') {
			$resolvedLabel = ucfirst($userName);
		} elseif (str_contains($userLabel, '{')) {
			$resolvedLabel = $userLabel;
			if (str_contains($resolvedLabel, '{Name}')) {
				$resolvedLabel = str_replace('{Name}', ucfirst($userName), $resolvedLabel);
			}
			if (str_contains($resolvedLabel, '{name}')) {
				$resolvedLabel = str_replace('{name}', $userName, $resolvedLabel);
			}
			if (str_contains($resolvedLabel, '{')) {
				$resolvedLabel = strip_tags((string) $user->getText($resolvedLabel, false, true));
			}
		} else {
			$resolvedLabel = strip_tags($userLabel);
		}
		$resolvedLabel = trim($resolvedLabel) !== '' ? trim($resolvedLabel) : ucfirst($userName);

		$avatarUrl = '';
		$avatarIcon = 'user-circle';
		if ($userAvatar === 'gravatar') {
			$email = trim((string) $user->email);
			if ($email !== '') {
				$avatarUrl = 'https://www.gravatar.com/avatar/' . md5(strtolower($email)) . '?s=80&d=mm&r=g';
			}
		} elseif (str_starts_with($userAvatar, 'icon.')) {
			$parsedIcon = trim(substr($userAvatar, 5));
			if ($parsedIcon !== '') {
				$avatarIcon = $parsedIcon;
			}
		} elseif (str_contains($userAvatar, ':')) {
			$parts = explode(':', $userAvatar, 2);
			$fieldId = (int) ($parts[0] ?? 0);
			$fieldName = trim((string) ($parts[1] ?? ''));
			$field = $fieldName !== '' ? $fields->get($fieldName) : null;
			if (!$field instanceof Field || !$field->type instanceof FieldtypeImage) {
				$byId = $fieldId > 0 ? $fields->get($fieldId) : null;
				$field = $byId instanceof Field ? $byId : null;
			}
			if ($field instanceof Field && $field->type instanceof FieldtypeImage) {
				$val = $user->getUnformatted($field->name);
				if ($val instanceof Pageimages) {
					$val = $val->first();
				}
				if ($val instanceof Pageimage) {
					$avatarUrl = (string) $val->size(60, 60)->url;
				}
			}
		}

		$normalizedAdmin = rtrim($adminUrl !== '' ? $adminUrl : '/processwire/', '/') . '/';
		$normalizedRoot = $rootUrl === '' ? '/' : ($rootUrl . '/');

		return [
			'label' => $resolvedLabel,
			'avatarUrl' => $avatarUrl,
			'avatarIcon' => $avatarIcon,
			'viewSiteUrl' => $normalizedRoot,
			'profileUrl' => $user->hasPermission('profile-edit') ? $normalizedAdmin . 'profile/' : '',
			'logoutUrl' => $normalizedAdmin . 'login/logout/',
		];
	}

	/**
	 * Core translation namespace identifier shared across all workspace shells, viewports, and form controls.
	 */
	public function translationNamespace(): string
	{
		return 'core';
	}

	/**
	 * Return core static UI translations parsed natively by ProcessWire's LanguageParser.
	 *
	 * @return array<string, mixed>
	 */
	public function ___translations(): array
	{
		return $this->i18n()->coreTranslations();
	}

	public function resolveActiveLocale(): string
	{
		return $this->i18n()->resolveActiveLocale();
	}

	public function resolveTranslationNamespace(object $source): string
	{
		return $this->i18n()->resolveTranslationNamespace($source);
	}

	/**
	 * @return array<string, string>
	 */
	public function resolveModuleTranslations(object $source): array
	{
		return $this->i18n()->resolveModuleTranslations($source);
	}

	/**
	 * @param array<int|string, mixed> $entries
	 * @return array<string, string>
	 */
	public static function flattenTranslationCatalog(array $entries, string $prefix = ''): array
	{
		return TranslationCatalogService::flattenTranslationCatalog($entries, $prefix);
	}

	/**
	 * @return array<string, mixed>
	 */
	public function buildInertiaI18nSharedProps(?object $host = null): array
	{
		return $this->i18n()->buildInertiaI18nSharedProps($host);
	}

	/**
	 * Build the Root View data array consumed by `site/modules/React/views/admin.php`.
	 *
	 * @param list<string> $extraScripts
	 * @param list<string> $extraStyles
	 * @return array<string, mixed>
	 */
	public function buildInertiaRootViewData(
		string $title = 'Workspace',
		array $extraScripts = [],
		array $extraStyles = [],
	): array {
		$locale = $this->resolveActiveLocale();
		$user = $this->wire()->user;
		$themeMode = $this->theme()->resolveEffectiveThemeMode($user);

		return [
			'locale' => $locale,
			'title' => $title,
			'themeMode' => $themeMode,
			'useInputFocus' => $this->theme()->resolveAdminUseInputFocus(),
			'colorSchemeCss' => $this->theme()->resolveAdminColorSchemeCss(),
			'themeCss' => $this->theme()->resolveThemeTokenCss($user),
			'styles' => $this->resolveInertiaStyleAssets($extraStyles),
			'scripts' => $this->resolveInertiaScriptAssets($extraScripts),
		];
	}

	/**
	 * Build the module configuration screen in ProcessWire Admin (`Modules > Configure > React`).
	 */
	public function getModuleConfigInputfields(InputfieldWrapper $inputfields): InputfieldWrapper
	{
		$modules = $this->wire()->modules;

		/** @var InputfieldSelect $theme */
		$theme = $modules->get('InputfieldSelect');
		$theme->attr('name', 'defaultTheme');
		$theme->label = $this->_('Default Theme Mode');
		$theme->description = $this->_('Select the default color theme for React admin pages and data views.');
		$theme->addOptions([
			'system' => $this->_('System Preference (Auto)'),
			'light' => $this->_('Light Mode'),
			'dark' => $this->_('Dark Mode'),
		]);
		$theme->val((string) ($this->get('defaultTheme') ?: 'system'));
		$theme->columnWidth = 50;
		$inputfields->add($theme);

		/** @var InputfieldSelect $themePreset */
		$themePreset = $modules->get('InputfieldSelect');
		$themePreset->attr('name', 'themePreset');
		$themePreset->label = $this->_('Default Theme Preset');
		$themePreset->description = $this->_('Default color theme applied across React workspaces, embedded module panels, overlays, and form controls when a user has not selected a personal theme scheme in their Workspace account menu.');
		$themePreset->required = true;
		$themePreset->addOptions([
			ThemePreset::Native->value => $this->_('ProcessWire Native (Admin Color Scheme)'),
			ThemePreset::Neutral->value => $this->_('Neutral'),
			ThemePreset::Slate->value => $this->_('Slate'),
			ThemePreset::Ocean->value => $this->_('Ocean'),
			ThemePreset::Emerald->value => $this->_('Emerald'),
			ThemePreset::Violet->value => $this->_('Violet'),
			ThemePreset::Rose->value => $this->_('Rose'),
			ThemePreset::Amber->value => $this->_('Amber'),
			ThemePreset::Custom->value => $this->_('Custom Theme Tokens'),
		]);
		$themePreset->val($this->theme()->siteDefaultPreset()->value);
		$themePreset->columnWidth = 50;
		$inputfields->add($themePreset);

		/** @var InputfieldTextarea $customTokens */
		$customTokens = $modules->get('InputfieldTextarea');
		$customTokens->attr('name', 'themeCustomTokens');
		$customTokens->label = $this->_('Custom Theme Tokens (CSS)');
		$customTokens->description = $this->_('Paste Tailwind CSS v4 theme variables (`:root { ... }` for light mode and `.dark { ... }` for dark mode). Only recognized color, radius, font, and shadow tokens with safe values are applied; everything else is ignored.');
		$customTokens->attr('rows', 12);
		$customTokens->showIf = 'themePreset=' . ThemePreset::Custom->value;
		$customTokens->val((string) $this->get('themeCustomTokens'));
		$tokenParser = new ThemeTokenParser();
		if (
			$this->theme()->siteDefaultPreset() === ThemePreset::Custom
			&& !$tokenParser->isComplete($tokenParser->parse((string) $this->get('themeCustomTokens')))
		) {
			$customTokens->error($this->_('Custom theme tokens must define at least --background, --foreground, --primary, and --primary-foreground. The native admin theme is used until they are valid.'));
		}
		$inputfields->add($customTokens);

		/** @var InputfieldCheckbox $shortcuts */
		$shortcuts = $modules->get('InputfieldCheckbox');
		$shortcuts->attr('name', 'enableKeyboardShortcuts');
		$shortcuts->label = $this->_('Enable Keyboard Shortcuts');
		$shortcuts->description = $this->_('Enable Cmd/Ctrl+K command palette, shortcut help dialog (?), form save shortcuts, viewport shortcuts, and keyboard navigation inside React workspaces.');
		$shortcuts->attr('checked', (bool) $this->get('enableKeyboardShortcuts') ? 'checked' : '');
		$shortcuts->columnWidth = 50;
		$inputfields->add($shortcuts);

		/** @var InputfieldText $returnLabel */
		$returnLabel = $modules->get('InputfieldText');
		$returnLabel->attr('name', 'adminReturnLabel');
		$returnLabel->label = $this->_('Admin Return Button Label');
		$returnLabel->description = $this->_('Label displayed on the top-left button that returns from a Workspace to the main Admin panel (default: Panel). Supports multi-language values.');
		$returnLabel->useLanguages = true;
		$returnLabel->val((string) ($this->get('adminReturnLabel') ?: 'Panel'));
		$languages = $this->wire()->languages;
		if ($languages !== null) {
			foreach ($languages as $lang) {
				if ($lang instanceof Page && (method_exists($lang, 'isDefault') ? !$lang->isDefault() : $lang->name !== 'default')) {
					$returnLabel->set('value' . (int) $lang->id, (string) ($this->get('adminReturnLabel__' . (int) $lang->id) ?? ''));
				}
			}
		}
		$inputfields->add($returnLabel);

		/** @var InputfieldCheckbox $reactMedia */
		$reactMedia = $modules->get('InputfieldCheckbox');
		$reactMedia->attr('name', 'useReactMediaFields');
		$reactMedia->label = $this->_('Use React Image & File Editors on Pages');
		$reactMedia->description = $this->_('Automatically upgrade standard Image and File fields on Pages (including Repeaters) to use the React Image and React File editors while keeping existing stored data unchanged.');
		$reactMedia->notes = $this->_('Individual fields can also select React Image or React File under Setup > Fields > Details > Inputfield Type.');
		$reactMedia->attr('checked', (bool) $this->get('useReactMediaFields') ? 'checked' : '');
		$inputfields->add($reactMedia);

		/** @var InputfieldCheckbox $adminIcons */
		$adminIcons = $modules->get('InputfieldCheckbox');
		$adminIcons->attr('name', 'enableAdminVectorIcons');
		$adminIcons->label = $this->_('Enable Vector Icons for ProcessWire Templates, Fields & Admin Pages');
		$adminIcons->description = $this->_('Adds a Vector Icon picker below the standard Icon field on Setup > Templates and Setup > Fields (as well as admin page settings), showing your chosen icon in crisp vector quality across the admin panel.');
		$adminIcons->attr('checked', (bool) $this->get('enableAdminVectorIcons') ? 'checked' : '');
		$adminIcons->columnWidth = 70;
		$inputfields->add($adminIcons);

		/** @var InputfieldInteger $adminIconSize */
		$adminIconSize = $modules->get('InputfieldInteger');
		$adminIconSize->attr('name', 'adminIconPreviewSize');
		$adminIconSize->label = $this->_('Admin Icon Picker Preview Size (px)');
		$adminIconSize->description = $this->_('Preview icon size on Edit Template and Edit Field screens (16–64).');
		$adminIconSize->val(IconManager::clampSize($this->get('adminIconPreviewSize'), 28));
		$adminIconSize->showIf = 'enableAdminVectorIcons=1';
		$adminIconSize->columnWidth = 30;
		$inputfields->add($adminIconSize);

		return $inputfields;
	}
}
