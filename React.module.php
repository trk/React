<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Form\ReactControlRegistry;
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
use Totoglu\React\Tiptap\MiniBlockRegistry;
use Totoglu\React\Tiptap\TiptapMediaLinkGateway;
use Totoglu\React\Viewport\MarkupReactViewport;
use Totoglu\React\Workspace\CommandSearchRegistry;
use Totoglu\React\Workspace\EditPresenceStore;
use Totoglu\React\Workspace\ShellLayout;
use Totoglu\React\Workspace\ShellLayoutRegistry;
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
 * @method void registerWidgets(WorkspaceWidgetRegistry $registry)
 * @method void registerProviders(ProviderRegistry $registry)
 * @method void registerRelationResources(RelationResourceRegistry $registry)
 * @method void registerMediaHosts(MediaGateway $mediaGateway)
 * @method void registerLinkResolvers()
 * @method void registerShellLayouts(ShellLayoutRegistry $registry)
 * @method void registerCommandSearch(CommandSearchRegistry $registry)
 * @method void registerViewportModes()
 * @method array<string, mixed> translations()
 * @method void install()
 * @method void upgrade(int|string $fromVersion, int|string $toVersion)
 * @method void uninstall()
 */
class React extends WireData implements Module, ConfigurableModule
{
	/** @var list<string> */
	public const array CAPABILITIES = [
		'workspace',
		'icons',
		'commandSearch',
		'providers',
		'relations',
		'linkResolvers',
		'media',
		'viewportModes',
	];

	/** @var \WeakMap<ProcessWire, array<string, WorkspaceDefinition>>|null */
	private static ?\WeakMap $sharedWorkspaces = null;

	/** @var \WeakMap<ProcessWire, array<string, WorkspaceWidgetDefinition>>|null */
	private static ?\WeakMap $sharedWidgets = null;

	/** @var \WeakMap<ProcessWire, array<string, array{module: string, contract: string, icon: string, label: string}>>|null */
	private static ?\WeakMap $sharedViewportModes = null;

	/** @var array<string, list<string>> */
	private static array $moduleAssetUrlCache = [];
	/** @var \WeakMap<Wire, list<string>>|null */
	private static ?\WeakMap $deferredModuleHooks = null;

	private ?WorkspaceRegistry $workspaceRegistry = null;
	private ?WorkspaceWidgetRegistry $widgetRegistry = null;
	private ?ShellLayoutRegistry $shellLayoutRegistry = null;
	private ?CommandSearchRegistry $commandSearchRegistry = null;
	private ?WorkspacePreferenceStore $preferenceStore = null;
	private ?EditPresenceStore $presenceStore = null;
	private ?ProviderRegistry $providerRegistry = null;
	private ?RelationResourceRegistry $relationRegistry = null;
	private ?RelationStateSigner $relationStateSigner = null;
	private ?SignedTokenCodec $tokenCodec = null;
	private ?MediaGateway $mediaGateway = null;
	private ?TiptapMediaLinkGateway $tiptapGateway = null;
	private ?FormSchemaSerializer $formSerializer = null;
	private ?ReactControlRegistry $controlRegistry = null;
	private ?IconManager $iconManager = null;
	private ?ThemeManager $themeManager = null;
	private ?ReactGatewayRouter $gatewayRouter = null;
	private ?TranslationCatalogService $i18nService = null;
	private ?FieldIntegrationHooks $fieldHooks = null;
	private ?string $cachedLauncherUrl = null;
	private ?string $cachedLauncherAdminUrl = null;
	private ?bool $workspaceHubEnabledOverride = null;
	/** @var array<string, array{module: string, contract: string, icon: string, label: string}> */
	private array $registeredViewportModes = [];
	/** @var array<string, callable(array<string, mixed>, array<string, mixed>): ?array<string, mixed>> */
	private array $linkResolvers = [];
	/** @var list<string> */
	private array $urlHookIds = [];
	private bool $hooksRegistered = false;
	private bool $workspacesResolved = false;
	private bool $widgetsResolved = false;
	private bool $shellLayoutsResolved = false;
	private bool $commandSearchResolved = false;
	private bool $providersResolved = false;
	private bool $relationsResolved = false;
	private bool $mediaHostsResolved = false;
	private bool $viewportModesResolved = false;
	private bool $linkResolversResolved = false;
	/** @var array<string, list<string>>|null */
	private ?array $capabilityModulesIndex = null;
	/** @var array<string, bool> */
	private array $pulledCapabilities = [];
	/** @var array<string, bool> */
	private array $pulledCapabilityModules = [];

	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => 'React',
			'version' => 37,
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
				'InputfieldReactCondition',
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
			'defaultShellLayout' => ShellLayout::Topbar->value,
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
		$this->hooks()->register();
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
		$this->wire()->classLoader->addNamespace('Totoglu\\React', __DIR__ . '/src/');
		$this->wire('react', $this);
	}

	public function init(): void
	{
		$wire = $this->wire();
		$wire->set('react', $this);

		if (!$this->hooksRegistered) {
			$this->hooksRegistered = true;
			$this->urlHookIds = [
				(string) $wire->addHook('/_react/viewport', $this, 'handleViewportRequest'),
				(string) $wire->addHook('/_react/workspace-prefs', $this, 'handleWorkspacePrefsRequest'),
				(string) $wire->addHook('/_react/presence', $this, 'handlePresenceRequest'),
				(string) $wire->addHook('/_react/relation', $this, 'handleRelationRequest'),
				(string) $wire->addHook('/_react/media', $this, 'handleMediaRequest'),
				(string) $wire->addHook('/_react/tiptap', $this, 'handleTiptapRequest'),
				(string) $wire->addHook('/_react/icons', $this, 'handleIconsRequest'),
				(string) $wire->addHook('/_react/command-search', $this, 'handleCommandSearchRequest'),
			];
		}

		$this->hooks()->registerDataHooks();
		if ($this->shouldRegisterFieldHooks()) {
			$this->hooks()->registerAdminHooks();
		}
	}

	/**
	 * Determine whether ProcessWire field/template/admin-icon hooks should register on the current request.
	 */
	public function shouldRegisterFieldHooks(?string $requestPath = null, ?bool $isCli = null): bool
	{
		$wire = $this->wire();
		$config = $wire->config;
		$cli = $isCli ?? ((bool) $config->cli || PHP_SAPI === 'cli');
		if ($cli) {
			return true;
		}

		$adminTemplates = $config->adminTemplates;
		$adminTemplateNames = is_array($adminTemplates) && $adminTemplates !== []
			? array_map('strval', $adminTemplates)
			: ['admin'];

		$page = $wire->page;
		if (
			$page instanceof Page
			&& $page->template instanceof Template
			&& in_array($page->template->name, $adminTemplateNames, true)
		) {
			return true;
		}

		$rawPath = $requestPath;
		if ($rawPath === null) {
			$parsed = parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
			$rawPath = is_string($parsed) ? $parsed : '';
		}
		$normalizedPath = $rawPath !== '' ? rtrim($rawPath, '/') . '/' : '';
		if ($normalizedPath === '') {
			return false;
		}

		$adminUrl = rtrim((string) ($config->urls->admin ?: '/processwire/'), '/') . '/';
		if (str_starts_with($normalizedPath, $adminUrl)) {
			return true;
		}

		$rootPrefix = rtrim((string) ($config->urls->root ?: '/'), '/');
		$reactGatewayPrefix = ($rootPrefix === '' ? '' : $rootPrefix) . '/_react/';

		return str_starts_with($normalizedPath, $reactGatewayPrefix);
	}

	/**
	 * Determine whether ProcessWire is currently inside `ProcessController::execute`.
	 */
	public function isExecutingProcessController(): bool
	{
		return $this->fieldHooks !== null && $this->fieldHooks->isExecutingProcessController();
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
	 * Determine whether parsed URL parts reference the current ProcessWire host (or a relative URL).
	 *
	 * @param array{scheme?: string, host?: string, port?: int, user?: string, pass?: string, path?: string, query?: string, fragment?: string} $parts
	 */
	private function isLocalUrlHost(array $parts, Config $config): bool
	{
		if (!isset($parts['host']) || $parts['host'] === '') {
			return true;
		}

		$currentHost = strtolower((string) ($config->httpHost ?: ''));
		if ($currentHost === '') {
			return true;
		}

		$host = strtolower((string) $parts['host']);
		$targetHost = $host . (isset($parts['port']) ? ':' . (int) $parts['port'] : '');

		return $targetHost === $currentHost || $host === $currentHost;
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

		if (!$this->isLocalUrlHost($parts, $config)) {
			return $url;
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

		$hashPos = strpos($trimmed, '#');
		$fragment = isset($parts['fragment']) && $parts['fragment'] !== '' ? '#' . $parts['fragment'] : '';
		$withoutFragment = $hashPos !== false ? substr($trimmed, 0, $hashPos) : $trimmed;
		$separator = str_contains($withoutFragment, '?') ? '&' : '?';

		return $withoutFragment . $separator . 'ws=1' . $fragment;
	}

	/**
	 * Strip the `ws` workspace-mode query parameter from a local ProcessWire admin module URL
	 * while preserving all other query parameters and fragments.
	 */
	public function withoutWorkspaceQuery(string $url): string
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

		if (!$this->isLocalUrlHost($parts, $config)) {
			return $url;
		}

		$queryStr = (string) ($parts['query'] ?? '');
		if ($queryStr === '') {
			return $url;
		}

		parse_str($queryStr, $queryParams);
		if (!array_key_exists('ws', $queryParams)) {
			return $url;
		}

		$path = (string) ($parts['path'] ?? '');
		$adminUrl = rtrim((string) ($config->urls->admin ?: '/processwire/'), '/') . '/';
		$normalizedPath = $path !== '' ? rtrim($path, '/') . '/' : '';
		if ($normalizedPath !== '' && !str_starts_with($normalizedPath, $adminUrl)) {
			return $url;
		}

		unset($queryParams['ws']);

		$hashPos = strpos($trimmed, '#');
		$withoutFragment = $hashPos !== false ? substr($trimmed, 0, $hashPos) : $trimmed;
		$qPos = strpos($withoutFragment, '?');
		$baseBeforeQuery = $qPos !== false ? substr($withoutFragment, 0, $qPos) : $withoutFragment;
		$fragment = isset($parts['fragment']) && $parts['fragment'] !== '' ? '#' . $parts['fragment'] : '';
		$querySuffix = $queryParams !== []
			? '?' . http_build_query($queryParams, '', '&', PHP_QUERY_RFC3986)
			: '';

		return $baseBeforeQuery . $querySuffix . $fragment;
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
	 * Return the `ReactControlRegistry` singleton bridging classic `Inputfield` controls (`rwControl`)
	 * to standalone React control islands, `Setup > Fields` configuration panels, and `FieldtypeText` formatters.
	 */
	public function controls(): ReactControlRegistry
	{
		if ($this->controlRegistry === null) {
			$this->controlRegistry = new ReactControlRegistry($this);
			$this->wire($this->controlRegistry);
		}

		return $this->controlRegistry;
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
		self::recordDeferredHook($module, (string) $module->addHookAfter(
			'React::registerMediaHosts',
			static function (HookEvent $event) use ($registrar): void {
				$react = $event->object;
				$gateway = $event->arguments(0);
				if ($react instanceof self && $gateway instanceof MediaGateway) {
					$registrar($gateway, $react);
				}
			},
		));

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
			$this->pullCapabilities('media');
			if (!$this->isMediaHostsResolved()) {
				$this->mediaHostsResolved = true;
				$this->registerMediaHosts($gateway);
			}
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
		$wire = $this->wire();
		$page = $wire->page;
		$adminTemplates = $wire->config->adminTemplates;
		$adminTemplateNames = is_array($adminTemplates) && $adminTemplates !== []
			? array_map('strval', $adminTemplates)
			: ['admin'];
		if (!$page instanceof Page || !$page->template instanceof Template || !in_array($page->template->name, $adminTemplateNames, true)) {
			return;
		}

		$this->hooks()->register();

		$adminTheme = $this->wire()->adminTheme;
		if ($adminTheme instanceof AdminTheme) {
			$existingHead = (string) ($adminTheme->getExtraMarkup()['head'] ?? '');
			if (!str_contains($existingHead, 'id="rw-theme-tokens"')) {
				$themeCss = $this->theme()->resolveThemeTokenCss($this->wire()->user);
				if ($themeCss !== '') {
					$cspNonceRaw = $wire->config->get('cspNonce');
					$cspNonce = is_string($cspNonceRaw) ? trim($cspNonceRaw) : '';
					$nonceAttr = $cspNonce !== ''
						? ' nonce="' . $wire->sanitizer->entities($cspNonce) . '"'
						: '';
					$safeThemeCss = (string) preg_replace('~<\s*/\s*style~i', '<\\/style', $themeCss);
					$adminTheme->addExtraMarkup('head', '<style id="rw-theme-tokens"' . $nonceAttr . '>' . $safeThemeCss . '</style>');
				}
			}
		}

		if ((bool) $this->get('enableAdminVectorIcons') && $this->icons()->hasActiveAdminCss()) {
			$config = $this->wire()->config;
			$config->styles->add($config->versionUrl($this->icons()->getAdminCssUrl(), true));
		}
	}

	/**
	 * Register a pluggable viewport layout mode backed by an installed module.
	 *
	 * @param string $mode Normalized layout mode key
	 * @param string $moduleName Target ProcessWire `MarkupReactViewport` module class name
	 * @param string $providerContract Optional FQCN of a provider contract interface required for automatic mode eligibility
	 * @param array{icon?: string, label?: string} $meta Optional toolbar display metadata (`icon`, `label`)
	 */
	public function registerViewportMode(string $mode, string $moduleName, string $providerContract = '', array $meta = []): void
	{
		$cleanMode = strtolower(trim($mode));
		$cleanModule = trim($moduleName);
		if ($cleanMode === '' || $cleanModule === '') {
			return;
		}
		if (str_starts_with($cleanModule, 'ProcessWire\\')) {
			$cleanModule = substr($cleanModule, strlen('ProcessWire\\'));
		}
		$cleanContract = ltrim(trim($providerContract), '\\');
		$entry = [
			'module' => $cleanModule,
			'contract' => $cleanContract,
			'icon' => is_string($meta['icon'] ?? null) ? trim($meta['icon']) : '',
			'label' => is_string($meta['label'] ?? null) ? trim($meta['label']) : '',
		];
		$this->registeredViewportModes[$cleanMode] = $entry;
		$w = $this->wire();
		$vpMap = self::sharedViewportModesMap();
		$bucket = $vpMap[$w] ?? [];
		$bucket[$cleanMode] = $entry;
		$vpMap[$w] = $bucket;
	}

	/**
	 * Determine whether pluggable viewport modes have already run `React::registerViewportModes` hooks on this instance.
	 */
	public function isViewportModesResolved(): bool
	{
		return $this->viewportModesResolved;
	}

	/**
	 * Defer a module's pluggable viewport layout mode registration until `getRegisteredViewportModes()` is requested.
	 *
	 * @param callable(self): void $registrar
	 */
	public static function deferViewportModeRegistration(Wire $module, callable $registrar): void
	{
		self::recordDeferredHook($module, (string) $module->addHookAfter(
			'React::registerViewportModes',
			static function (HookEvent $event) use ($registrar): void {
				$react = $event->object;
				if ($react instanceof self) {
					$registrar($react);
				}
			},
		));

		$existing = $module->wire()->fuel->get('react');
		if ($existing instanceof self && $existing->isViewportModesResolved()) {
			$registrar($existing);
		}
	}

	/**
	 * Hookable lifecycle method for modules to register pluggable viewport layout modes.
	 */
	public function ___registerViewportModes(): void {}

	/**
	 * Return all registered pluggable viewport layout modes.
	 *
	 * @return array<string, array{module: string, contract: string, icon: string, label: string}>
	 */
	public function getRegisteredViewportModes(): array
	{
		if (!$this->viewportModesResolved) {
			$this->pullCapabilities('viewportModes');
			if (!$this->isViewportModesResolved()) {
				$this->viewportModesResolved = true;
				$this->registerViewportModes();
			}
		}

		$shared = self::$sharedViewportModes !== null
			? (self::$sharedViewportModes[$this->wire()] ?? [])
			: [];

		return array_replace($shared, $this->registeredViewportModes);
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

	private static function resolveStaticWire(?ProcessWire $wire = null): ?ProcessWire
	{
		if ($wire instanceof ProcessWire) {
			return $wire;
		}
		$current = ProcessWire::getCurrentInstance();

		return $current instanceof ProcessWire ? $current : null;
	}

	/**
	 * @return \WeakMap<ProcessWire, array<string, WorkspaceDefinition>>
	 */
	private static function sharedWorkspacesMap(): \WeakMap
	{
		if (self::$sharedWorkspaces === null) {
			/** @var \WeakMap<ProcessWire, array<string, WorkspaceDefinition>> $map */
			$map = new \WeakMap();
			self::$sharedWorkspaces = $map;
		}

		return self::$sharedWorkspaces;
	}

	/**
	 * @return \WeakMap<ProcessWire, array<string, WorkspaceWidgetDefinition>>
	 */
	private static function sharedWidgetsMap(): \WeakMap
	{
		if (self::$sharedWidgets === null) {
			/** @var \WeakMap<ProcessWire, array<string, WorkspaceWidgetDefinition>> $map */
			$map = new \WeakMap();
			self::$sharedWidgets = $map;
		}

		return self::$sharedWidgets;
	}

	/**
	 * @return \WeakMap<ProcessWire, array<string, array{module: string, contract: string, icon: string, label: string}>>
	 */
	private static function sharedViewportModesMap(): \WeakMap
	{
		if (self::$sharedViewportModes === null) {
			/** @var \WeakMap<ProcessWire, array<string, array{module: string, contract: string, icon: string, label: string}>> $map */
			$map = new \WeakMap();
			self::$sharedViewportModes = $map;
		}

		return self::$sharedViewportModes;
	}

	public static function forgetSharedWorkspace(string $id, ?ProcessWire $wire = null): void
	{
		$w = self::resolveStaticWire($wire);
		if ($w === null || self::$sharedWorkspaces === null || !isset(self::$sharedWorkspaces[$w])) {
			return;
		}
		$bucket = self::$sharedWorkspaces[$w];
		unset($bucket[strtolower(trim($id))]);
		self::$sharedWorkspaces[$w] = $bucket;
	}

	public static function forgetSharedWidget(string $id, ?ProcessWire $wire = null): void
	{
		$w = self::resolveStaticWire($wire);
		if ($w === null || self::$sharedWidgets === null || !isset(self::$sharedWidgets[$w])) {
			return;
		}
		$bucket = self::$sharedWidgets[$w];
		unset($bucket[strtolower(trim($id))]);
		self::$sharedWidgets[$w] = $bucket;
	}

	public static function forgetSharedViewportMode(string $mode, ?ProcessWire $wire = null): void
	{
		$w = self::resolveStaticWire($wire);
		if ($w === null || self::$sharedViewportModes === null || !isset(self::$sharedViewportModes[$w])) {
			return;
		}
		$bucket = self::$sharedViewportModes[$w];
		unset($bucket[strtolower(trim($mode))]);
		self::$sharedViewportModes[$w] = $bucket;
	}

	/**
	 * @return \WeakMap<Wire, list<string>>
	 */
	private static function deferredHooksMap(): \WeakMap
	{
		if (self::$deferredModuleHooks === null) {
			/** @var \WeakMap<Wire, list<string>> $map */
			$map = new \WeakMap();
			self::$deferredModuleHooks = $map;
		}

		return self::$deferredModuleHooks;
	}

	private static function recordDeferredHook(Wire $module, string $hookId): void
	{
		$map = self::deferredHooksMap();
		$existing = $map[$module] ?? [];
		$existing[] = $hookId;
		$map[$module] = $existing;
	}

	/**
	 * Detach any deferred registration hooks previously attached for a module via `defer*Registration()`.
	 */
	public static function forgetDeferredRegistrations(Wire $module): void
	{
		$map = self::$deferredModuleHooks;
		if ($map === null || !isset($map[$module])) {
			return;
		}
		$hookIds = $map[$module];
		if ($hookIds !== []) {
			$module->removeHook($hookIds);
		}
		unset($map[$module]);
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
			self::recordDeferredHook($module, (string) $module->addHookAfter(
				'React::registerWorkspaces',
				static function (HookEvent $event) use ($workspaceRegistrar): void {
					$react = $event->object;
					if ($react instanceof self) {
						$workspaceRegistrar($react);
					}
				},
			));
		}

		if ($widgetRegistrar !== null) {
			self::recordDeferredHook($module, (string) $module->addHookAfter(
				'React::registerWidgets',
				static function (HookEvent $event) use ($widgetRegistrar): void {
					$react = $event->object;
					if ($react instanceof self) {
						$widgetRegistrar($react);
					}
				},
			));
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
	 * Return cached capability module map (`[capability => list<moduleName>]`) using `Modules::getModuleInfo('*')`
	 * (`moduleInfoCache`) without including or instantiating capability module PHP files.
	 *
	 * @return array<string, list<string>>
	 */
	public function discoverCapabilityModules(): array
	{
		if ($this->capabilityModulesIndex !== null) {
			return $this->capabilityModulesIndex;
		}

		$index = [];
		foreach (self::CAPABILITIES as $cap) {
			$index[$cap] = [];
		}

		$modules = $this->wire()->modules;
		$allInfo = $modules->getModuleInfo('*');

		if (!is_array($allInfo)) {
			return $this->capabilityModulesIndex = $index;
		}

		foreach ($allInfo as $info) {
			if (!is_array($info)) {
				continue;
			}
			$modName = isset($info['name']) && is_string($info['name']) ? trim($info['name']) : '';
			if ($modName === '' || $modName === 'React' || !$modules->isInstalled($modName)) {
				continue;
			}
			$caps = $info['reactCapabilities'] ?? null;
			if (!is_array($caps)) {
				continue;
			}
			foreach ($caps as $cap) {
				if (!is_string($cap)) {
					continue;
				}
				$cleanCap = trim($cap);
				if (!isset($index[$cleanCap])) {
					continue;
				}
				if (!in_array($modName, $index[$cleanCap], true)) {
					$index[$cleanCap][] = $modName;
				}
			}
		}

		foreach ($index as $cap => $modNames) {
			sort($modNames);
			$index[$cap] = $modNames;
		}

		return $this->capabilityModulesIndex = $index;
	}

	/**
	 * Lazily load installed modules declaring `$capability` in `getModuleInfo()['reactCapabilities']`.
	 * Uses `noPermissionCheck => true, noInstall => true, noThrow => true` so unprivileged admin or guest
	 * contexts never trigger `WirePermissionException`, while registries still enforce per-item RBAC.
	 *
	 * @return list<string> Module class names instantiated/pulled during this call
	 */
	public function pullCapabilities(string $capability): array
	{
		$cleanCap = trim($capability);
		if ($cleanCap === '' || !in_array($cleanCap, self::CAPABILITIES, true)) {
			return [];
		}
		if (isset($this->pulledCapabilities[$cleanCap])) {
			return [];
		}
		$this->pulledCapabilities[$cleanCap] = true;

		$modules = $this->wire()->modules;
		$candidates = $this->discoverCapabilityModules()[$cleanCap] ?? [];
		$pulled = [];

		foreach ($candidates as $moduleName) {
			if (isset($this->pulledCapabilityModules[$moduleName])) {
				continue;
			}
			$this->pulledCapabilityModules[$moduleName] = true;
			if (!$modules->isInstalled($moduleName)) {
				continue;
			}
			try {
				$mod = $modules->getModule($moduleName, [
					'noPermissionCheck' => true,
					'noInstall' => true,
					'noThrow' => true,
				]);
				if ($mod instanceof Module) {
					$pulled[] = $moduleName;
				}
			} catch (\Throwable $e) {
				$this->wire()->log->error(sprintf('React capability discovery failed for %s: %s', $moduleName, $e->getMessage()));
			}
		}

		return $pulled;
	}

	/**
	 * Reset cached capability discovery and pull-state flags (used on uninstall or cache refresh).
	 */
	public function resetCapabilityCache(): void
	{
		$this->capabilityModulesIndex = null;
		$this->pulledCapabilities = [];
		$this->pulledCapabilityModules = [];
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
			$this->pullCapabilities('workspace');
			if (!$this->isWorkspacesResolved()) {
				$this->workspacesResolved = true;
				$sharedWorkspaces = self::$sharedWorkspaces !== null
					? (self::$sharedWorkspaces[$this->wire()] ?? [])
					: [];
				foreach ($sharedWorkspaces as $sharedDef) {
					$registry->register($sharedDef);
				}
				$this->registerWorkspaces($registry);
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
			$w = $this->wire();
			$wsMap = self::sharedWorkspacesMap();
			$bucket = $wsMap[$w] ?? [];
			$bucket[$def->id] = $def;
			$wsMap[$w] = $bucket;
		}

		if ($this->workspaceRegistry !== null) {
			$this->workspaceRegistry->register($def);
		}

		return $this;
	}

	public function ___registerWorkspaces(WorkspaceRegistry $registry): void {}

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
			$this->pullCapabilities('workspace');
			if (!$this->isWidgetsResolved()) {
				$this->widgetsResolved = true;
				$sharedWidgets = self::$sharedWidgets !== null
					? (self::$sharedWidgets[$this->wire()] ?? [])
					: [];
				foreach ($sharedWidgets as $sharedWidget) {
					$registry->register($sharedWidget);
				}
				$this->registerWidgets($registry);
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
			$w = $this->wire();
			$wdMap = self::sharedWidgetsMap();
			$bucket = $wdMap[$w] ?? [];
			$bucket[$def->id] = $def;
			$wdMap[$w] = $bucket;
		}

		if ($this->widgetRegistry !== null) {
			$this->widgetRegistry->register($def);
		}

		return $this;
	}

	public function ___registerWidgets(WorkspaceWidgetRegistry $registry): void {}

	/**
	 * Determine whether the `ShellLayoutRegistry` has already run `React::registerShellLayouts` hooks on this instance.
	 */
	public function isShellLayoutsResolved(): bool
	{
		return $this->shellLayoutsResolved;
	}

	/**
	 * Defer a module's custom shell layout registration until `shellLayouts()` is requested.
	 *
	 * @param callable(ShellLayoutRegistry, self): void $registrar
	 */
	public static function deferShellLayoutRegistration(Wire $module, callable $registrar): void
	{
		self::recordDeferredHook($module, (string) $module->addHookAfter(
			'React::registerShellLayouts',
			static function (HookEvent $event) use ($registrar): void {
				$react = $event->object;
				$registry = $event->arguments(0);
				if ($react instanceof self && $registry instanceof ShellLayoutRegistry) {
					$registrar($registry, $react);
				}
			},
		));

		$existing = $module->wire()->fuel->get('react');
		if ($existing instanceof self && $existing->isShellLayoutsResolved()) {
			$registrar($existing->shellLayouts(), $existing);
		}
	}

	/**
	 * Hookable lifecycle method for modules to register custom workspace shell layouts.
	 */
	public function ___registerShellLayouts(ShellLayoutRegistry $registry): void {}

	/**
	 * Return the `ShellLayoutRegistry` singleton and trigger `React::registerShellLayouts` once.
	 */
	public function shellLayouts(): ShellLayoutRegistry
	{
		if ($this->shellLayoutRegistry === null) {
			$registry = new ShellLayoutRegistry();
			$this->wire($registry);
			$this->shellLayoutRegistry = $registry;
		} else {
			$registry = $this->shellLayoutRegistry;
		}

		if (!$this->shellLayoutsResolved) {
			$hubActive = $this->isWorkspaceHubInstalled() || ($this->wire()->process instanceof WorkspaceLauncherProcess);
			if ($hubActive) {
				$this->pullCapabilities('workspace');
			}
			if (!$this->isShellLayoutsResolved()) {
				$this->shellLayoutsResolved = true;
				$this->registerShellLayouts($registry);
			}
		}

		return $registry;
	}

	/**
	 * Determine whether the `CommandSearchRegistry` has already run `React::registerCommandSearch` hooks on this instance.
	 */
	public function isCommandSearchResolved(): bool
	{
		return $this->commandSearchResolved;
	}

	/**
	 * Defer a module's command palette search provider registration until `commandSearch()` is requested.
	 *
	 * @param callable(CommandSearchRegistry, self): void $registrar
	 */
	public static function deferCommandSearchRegistration(Wire $module, callable $registrar): void
	{
		self::recordDeferredHook($module, (string) $module->addHookAfter(
			'React::registerCommandSearch',
			static function (HookEvent $event) use ($registrar): void {
				$react = $event->object;
				$registry = $event->arguments(0);
				if ($react instanceof self && $registry instanceof CommandSearchRegistry) {
					$registrar($registry, $react);
				}
			},
		));

		$existing = $module->wire()->fuel->get('react');
		if ($existing instanceof self && $existing->isCommandSearchResolved()) {
			$registrar($existing->commandSearch(), $existing);
		}
	}

	/**
	 * Hookable lifecycle method for modules to register command palette search providers.
	 */
	public function ___registerCommandSearch(CommandSearchRegistry $registry): void {}

	/**
	 * Return the `CommandSearchRegistry` singleton and trigger `React::registerCommandSearch` once.
	 */
	public function commandSearch(): CommandSearchRegistry
	{
		if ($this->commandSearchRegistry === null) {
			$registry = new CommandSearchRegistry();
			$this->wire($registry);
			$this->commandSearchRegistry = $registry;
		} else {
			$registry = $this->commandSearchRegistry;
		}

		if (!$this->commandSearchResolved) {
			$this->pullCapabilities('commandSearch');
			if (!$this->isCommandSearchResolved()) {
				$this->commandSearchResolved = true;
				$this->registerCommandSearch($registry);
			}
		}

		return $registry;
	}

	/**
	 * Resolve the site-wide default shell layout ID configured on the `React` module.
	 */
	public function siteDefaultShellLayout(): string
	{
		$raw = $this->get('defaultShellLayout');
		$candidate = is_string($raw) ? strtolower(trim($raw)) : '';
		$registry = $this->shellLayouts();
		if ($candidate !== '' && $registry->has($candidate)) {
			return $candidate;
		}

		return $registry->defaultId();
	}

	/**
	 * Resolve the user's personal shell layout override from `{user-id}.json`
	 * (empty string when inheriting the site-wide default).
	 */
	public function userShellLayoutOverride(?User $user = null): string
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticatedOrSuperuser($resolvedUser)) {
			return '';
		}

		$prefs = $this->workspacePreferences()->load($resolvedUser);
		$rawLayout = strtolower(trim((string) ($prefs['shellLayout'] ?? '')));
		if ($rawLayout === '' || $rawLayout === 'default') {
			return '';
		}

		return $this->shellLayouts()->has($rawLayout) ? $rawLayout : '';
	}

	/**
	 * Resolve the effective shell layout ID for `$user`, preferring their personal override
	 * and falling back to `siteDefaultShellLayout()`.
	 */
	public function resolveEffectiveShellLayout(?User $user = null): string
	{
		$override = $this->userShellLayoutOverride($user);
		if ($override !== '') {
			return $override;
		}

		return $this->siteDefaultShellLayout();
	}

	/**
	 * Resolve whether `$user` prefers the sidebar shell layout collapsed into icon-rail mode.
	 */
	public function resolveSidebarCollapsed(?User $user = null): bool
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticatedOrSuperuser($resolvedUser)) {
			return false;
		}

		$prefs = $this->workspacePreferences()->load($resolvedUser);

		return (bool) ($prefs['sidebarCollapsed'] ?? false);
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
	 * @return array{
	 *     ok: bool,
	 *     status?: int,
	 *     error?: string,
	 *     preferences?: array<string, mixed>,
	 *     themeMode?: string,
	 *     themePreset?: string,
	 *     userThemePreset?: string,
	 *     siteDefaultThemePreset?: string,
	 *     themeCss?: string,
	 *     shellLayout?: string,
	 *     userShellLayout?: string,
	 *     siteDefaultShellLayout?: string,
	 *     sidebarCollapsed?: bool,
	 *     availableShellLayouts?: list<array<string, mixed>>,
	 *     preset?: array<string, mixed>
	 * }
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
	 * Issue a user-bound HMAC-SHA256 signed token authorizing `/_react/presence` actions on `$resourceKey`.
	 */
	public function issuePresenceToken(string $resourceKey, bool $canMarkSaved = true, ?User $user = null): string
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticated($resolvedUser)) {
			return '';
		}

		$cleanKey = $this->presence()->sanitizeResourceKey($resourceKey);
		if ($cleanKey === '') {
			return '';
		}

		return $this->tokenCodec()->encode([
			'typ' => 'presence',
			'uid' => (int) $resolvedUser->id,
			'resourceKey' => $cleanKey,
			'canMarkSaved' => $canMarkSaved,
		], 'presence');
	}

	/**
	 * Verify a signed `presenceToken` against the active user and return its decoded claims or `null`.
	 *
	 * @return array{resourceKey: string, canMarkSaved: bool, uid: int, iat: int}|null
	 */
	public function verifyPresenceToken(string $token, ?User $user = null): ?array
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticated($resolvedUser)) {
			return null;
		}

		$decoded = $this->tokenCodec()->decode($token, (int) $resolvedUser->id, SignedTokenCodec::DEFAULT_TTL, 'presence');
		if (!is_array($decoded) || ($decoded['typ'] ?? '') !== 'presence') {
			return null;
		}

		$cleanKey = $this->presence()->sanitizeResourceKey((string) ($decoded['resourceKey'] ?? ''));
		if ($cleanKey === '') {
			return null;
		}

		return [
			'resourceKey' => $cleanKey,
			'canMarkSaved' => !empty($decoded['canMarkSaved']),
			'uid' => (int) $decoded['uid'],
			'iat' => (int) $decoded['iat'],
		];
	}

	/**
	 * Register a custom link target resolver callback for a non-builtin link `type`.
	 *
	 * @param callable(array<string, mixed>, array<string, mixed>): (array<string, mixed>|null) $resolver
	 */
	public function registerLinkResolver(string $type, ?callable $resolver): self
	{
		$cleanType = strtolower(trim($type));
		if ($cleanType !== '') {
			if ($resolver === null) {
				unset($this->linkResolvers[$cleanType]);
			} else {
				$this->linkResolvers[$cleanType] = $resolver;
			}
		}

		return $this;
	}

	/**
	 * Hookable lifecycle method for extension modules to register custom link target resolvers.
	 */
	public function ___registerLinkResolvers(): void {}

	public function isLinkResolversResolved(): bool
	{
		return $this->linkResolversResolved;
	}

	/**
	 * Defer a module's custom link target resolver registration until `resolveCustomLink()` or `linkResolverTypes()` is requested.
	 *
	 * @param callable(self): void $registrar
	 */
	public static function deferLinkResolverRegistration(Wire $module, callable $registrar): void
	{
		self::recordDeferredHook($module, (string) $module->addHookAfter(
			'React::registerLinkResolvers',
			static function (HookEvent $event) use ($registrar): void {
				$react = $event->object;
				if ($react instanceof self) {
					$registrar($react);
				}
			},
		));

		$existing = $module->wire()->fuel->get('react');
		if ($existing instanceof self && $existing->isLinkResolversResolved()) {
			$registrar($existing);
		}
	}

	/**
	 * Pull capability modules and resolve custom link target resolvers once per instance.
	 */
	private function ensureLinkResolversResolved(): void
	{
		if ($this->linkResolversResolved) {
			return;
		}

		$explicit = $this->linkResolvers;
		$this->pullCapabilities('linkResolvers');
		$this->pullCapabilities('relations');
		if (!$this->isLinkResolversResolved()) {
			$this->linkResolversResolved = true;
			$this->registerLinkResolvers();
		}
		if ($explicit !== []) {
			$this->linkResolvers = array_merge($this->linkResolvers, $explicit);
		}
	}

	/**
	 * Resolve a custom non-builtin link target type via registered link resolvers.
	 *
	 * @param array<string, mixed> $normalized
	 * @param array<string, mixed> $options
	 * @return array<string, mixed>|null
	 */
	public function resolveCustomLink(string $type, array $normalized, array $options = []): ?array
	{
		$cleanType = strtolower(trim($type));
		if ($cleanType === '') {
			return null;
		}
		$this->ensureLinkResolversResolved();

		$resolver = $this->linkResolvers[$cleanType] ?? null;
		if ($resolver === null) {
			return null;
		}

		$resolved = $resolver($normalized, $options);

		return is_array($resolved) ? $resolved : null;
	}

	/**
	 * Return canonical lowercase link target types registered by extension resolvers.
	 *
	 * @return list<string>
	 */
	public function linkResolverTypes(): array
	{
		$this->ensureLinkResolversResolved();

		return array_values(array_map('strval', array_keys($this->linkResolvers)));
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
			$this->pullCapabilities('providers');
			if (!$this->isProvidersResolved()) {
				$this->providersResolved = true;
				$this->registerProviders($registry);
			}
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
		self::recordDeferredHook($module, (string) $module->addHookAfter(
			'React::registerProviders',
			static function (HookEvent $event) use ($registrar): void {
				$react = $event->object;
				$registry = $event->arguments(0);
				if ($react instanceof self && $registry instanceof ProviderRegistry) {
					$registrar($registry, $react);
				}
			},
		));

		$existing = $module->wire()->fuel->get('react');
		if ($existing instanceof self && $existing->isProvidersResolved()) {
			$registrar($existing->providers(), $existing);
		}
	}

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

	public function handleCommandSearchRequest(HookEvent $event): string
	{
		return $this->gateway()->handleCommandSearchRequest($event);
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	public function handleCommandSearchAction(array $params, ?User $user = null): array
	{
		return $this->gateway()->handleCommandSearchAction($params, $user);
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
		self::recordDeferredHook($module, (string) $module->addHookAfter(
			'React::registerRelationResources',
			static function (HookEvent $event) use ($registrar): void {
				$react = $event->object;
				$registry = $event->arguments(0);
				if ($react instanceof self && $registry instanceof RelationResourceRegistry) {
					$registrar($registry, $react);
				}
			},
		));

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
			$this->pullCapabilities('relations');
			if (!$this->isRelationsResolved()) {
				$this->relationsResolved = true;
				$this->registerRelationResources($registry);
			}
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

	public function ___install(): void {}

	/**
	 * Install any missing companion sub-modules declared in `getModuleInfo()['installs']` on upgrade.
	 *
	 * @param int|string $fromVersion
	 * @param int|string $toVersion
	 */
	public function ___upgrade($fromVersion, $toVersion): void
	{
		$modules = $this->wire()->modules;
		$info = self::getModuleInfo();
		$installs = is_array($info['installs'] ?? null) ? $info['installs'] : [];
		foreach ($installs as $companion) {
			if (!is_string($companion) || $companion === '' || $modules->isInstalled($companion)) {
				continue;
			}
			try {
				$modules->install($companion);
			} catch (\Throwable $e) {
				$this->wire()->log->error("React upgrade could not install companion {$companion}: " . $e->getMessage());
			}
		}
	}

	public function ___uninstall(): void
	{
		$w = $this->wire();
		if ($this->urlHookIds !== []) {
			$w->removeHook($this->urlHookIds);
			$this->urlHookIds = [];
		}
		$this->hooksRegistered = false;
		if ($this->fieldHooks !== null) {
			$this->fieldHooks->unregister();
		}
		if (self::$deferredModuleHooks !== null) {
			/** @var list<array{0: Wire, 1: list<string>}> $toRemove */
			$toRemove = [];
			foreach (self::$deferredModuleHooks as $module => $hookIds) {
				if ($module->wire() === $w) {
					$toRemove[] = [$module, $hookIds];
				}
			}
			foreach ($toRemove as [$module, $hookIds]) {
				if ($hookIds !== []) {
					$module->removeHook($hookIds);
				}
				unset(self::$deferredModuleHooks[$module]);
			}
		}

		$w->session->removeFor('ReactViewPrefs', true);
		$db = $w->database;
		try {
			$table = $db->escapeTable('pages_meta');
			$col = $db->escapeCol('name');
			$stmt = $db->prepare("DELETE FROM {$table} WHERE {$col} LIKE :prefix ESCAPE '!'");
			$stmt->bindValue(':prefix', 'react!_view!_prefs!_%');
			$stmt->execute();
		} catch (\Throwable $e) {
			$w->log->error('React uninstall cleanup error: ' . $e->getMessage());
		}
		$this->presence()->purgeAll();
		$this->workspacePreferences()->purgeAll();
		$files = $w->files;
		$assetsPath = (string) $w->config->paths->assets;
		$assetsCacheReactDir = '';
		if ($assetsPath !== '') {
			$iconCssDir = rtrim($assetsPath, '/\\') . '/vector-icons';
			if (!is_link(rtrim($iconCssDir, '/\\')) && is_dir($iconCssDir)) {
				$files->rmdir($iconCssDir, true);
			}
			$assetsCacheReactDir = rtrim($assetsPath, '/\\') . '/cache/React';
			if (!is_link(rtrim($assetsCacheReactDir, '/\\')) && is_dir($assetsCacheReactDir)) {
				$files->rmdir($assetsCacheReactDir, true);
			}
		}
		$configCachePath = rtrim((string) $w->config->paths->cache, '/\\');
		if ($configCachePath !== '') {
			$configCacheReactDir = $configCachePath . '/React';
			if (
				$configCacheReactDir !== $assetsCacheReactDir
				&& !is_link($configCacheReactDir)
				&& is_dir($configCacheReactDir)
			) {
				$files->rmdir($configCacheReactDir, true);
			}
		}
		MarkupReactViewport::resetCache();
		MiniBlockRegistry::resetCache();
		IconManager::resetCache($w);
		if (self::$sharedWorkspaces !== null) {
			unset(self::$sharedWorkspaces[$w]);
		}
		if (self::$sharedWidgets !== null) {
			unset(self::$sharedWidgets[$w]);
		}
		if (self::$sharedViewportModes !== null) {
			unset(self::$sharedViewportModes[$w]);
		}
		self::$moduleAssetUrlCache = [];
		$this->registeredViewportModes = [];
		$this->linkResolvers = [];
		$this->linkResolversResolved = false;
		$this->relationStateSigner = null;
		$this->tokenCodec = null;
		$this->mediaGateway = null;
		$this->tiptapGateway = null;
		$this->mediaHostsResolved = false;
		$this->formSerializer = null;
		$this->controlRegistry = null;
		$this->iconManager = null;
		$this->themeManager = null;
		$this->gatewayRouter = null;
		$this->i18nService = null;
		$this->fieldHooks = null;
		$this->cachedLauncherUrl = null;
		$this->cachedLauncherAdminUrl = null;
		$this->workspaceHubEnabledOverride = null;
		$this->workspaceRegistry = null;
		$this->workspacesResolved = false;
		$this->widgetRegistry = null;
		$this->widgetsResolved = false;
		$this->providerRegistry = null;
		$this->providersResolved = false;
		$this->relationRegistry = null;
		$this->relationsResolved = false;
		$this->shellLayoutRegistry = null;
		$this->shellLayoutsResolved = false;
		$this->commandSearchRegistry = null;
		$this->commandSearchResolved = false;
		$this->viewportModesResolved = false;
		$this->resetCapabilityCache();
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

		$rawVersion = self::getModuleInfo()['version'] ?? 1;
		$version = is_scalar($rawVersion) ? (string) $rawVersion : '1';
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
		$resolvedActiveWorkspace = null;
		if ($activeWorkspace instanceof WorkspaceDefinition) {
			$resolvedActiveUrl = $hubActive
				? $this->workspaces()->resolveUrl($activeWorkspace)
				: ($activeWorkspace->url !== '' ? $this->withoutWorkspaceQuery($activeWorkspace->url) : null);
			$resolvedActiveWorkspace = $activeWorkspace->toArray($resolvedActiveUrl);
		}

		$userShellLayout = $this->userShellLayoutOverride($user);
		$siteDefaultShellLayout = $this->siteDefaultShellLayout();
		$effectiveShellLayout = $userShellLayout !== '' ? $userShellLayout : $siteDefaultShellLayout;

		return [
			'appName' => (string) ($config->httpHost ?: 'ProcessWire'),
			'adminUrl' => $adminUrl,
			'adminReturnLabel' => $this->resolveAdminReturnLabel($user),
			'shellMode' => $shellMode,
			'shellLayout' => $effectiveShellLayout,
			'userShellLayout' => $userShellLayout,
			'siteDefaultShellLayout' => $siteDefaultShellLayout,
			'sidebarCollapsed' => $this->resolveSidebarCollapsed($user),
			'availableShellLayouts' => $this->shellLayouts()->toArray(),
			'launcherComponent' => $hubActive ? 'ReactWorkspace/WorkspaceLauncher' : '',
			'launcherUrl' => $launcherUrl,
			'launcherScripts' => $launcherScripts,
			'prefsEndpoint' => $rootUrl . '/_react/workspace-prefs',
			'presenceEndpoint' => $rootUrl . '/_react/presence',
			'commandSearchEndpoint' => $rootUrl . '/_react/command-search',
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
			'activeWorkspace' => $resolvedActiveWorkspace,
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
			'shellLayout' => $this->resolveEffectiveShellLayout($user),
			'sidebarCollapsed' => $this->resolveSidebarCollapsed($user),
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
		$theme->set('rwControl', 'segmented');
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
			ThemePreset::Stone->value => $this->_('Stone'),
			ThemePreset::Ocean->value => $this->_('Ocean'),
			ThemePreset::Indigo->value => $this->_('Indigo'),
			ThemePreset::Teal->value => $this->_('Teal'),
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

		/** @var InputfieldSelect $defaultShellLayout */
		$defaultShellLayout = $modules->get('InputfieldSelect');
		$defaultShellLayout->attr('name', 'defaultShellLayout');
		$defaultShellLayout->label = $this->_('Default Shell Layout');
		$defaultShellLayout->description = $this->_('Default workspace navigation shell layout applied across React workspaces when a user has not selected a personal layout override in their account menu.');
		$defaultShellLayout->required = true;
		foreach ($this->shellLayouts()->all() as $layoutMeta) {
			$defaultShellLayout->addOption($layoutMeta['id'], $layoutMeta['label']);
		}
		$defaultShellLayout->val($this->siteDefaultShellLayout());
		$defaultShellLayout->columnWidth = 50;
		$inputfields->add($defaultShellLayout);

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
