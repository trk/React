<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Icon\IconManager;
use Totoglu\React\Media\MediaGateway;
use Totoglu\React\Media\PageLinkMediaHostAdapter;
use Totoglu\React\Provider\ProviderRegistry;
use Totoglu\React\Relation\RelationItem;
use Totoglu\React\Relation\RelationResourceRegistry;
use Totoglu\React\Relation\RelationStateSigner;
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
	public const int VERSION = 10;

	/** @var array<string, WorkspaceDefinition> */
	private static array $sharedWorkspaces = [];

	/** @var array<string, WorkspaceWidgetDefinition> */
	private static array $sharedWidgets = [];

	/** @var array<string, array{module: string, capability: string}> */
	private static array $sharedViewportModes = [];

	/**
	 * Cached per-file and global phrase maps loaded from `<ModuleDir>/languages/{locale}.csv`.
	 *
	 * @var array<string, array{byFile: array<string, array<string, string>>, global: array<string, string>}>
	 */
	private static array $moduleCsvCatalogs = [];

	/** @var array<string, list<string>> */
	private static array $moduleAssetUrlCache = [];

	private ?WorkspaceRegistry $workspaceRegistry = null;
	private ?WorkspaceWidgetRegistry $widgetRegistry = null;
	private ?WorkspacePreferenceStore $preferenceStore = null;
	private ?EditPresenceStore $presenceStore = null;
	private ?ProviderRegistry $providerRegistry = null;
	private ?RelationResourceRegistry $relationRegistry = null;
	private ?RelationStateSigner $relationStateSigner = null;
	private ?MediaGateway $mediaGateway = null;
	private ?TiptapMediaLinkGateway $tiptapGateway = null;
	private ?FormSchemaSerializer $formSerializer = null;
	private ?IconManager $iconManager = null;
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
	private bool $executingProcessController = false;

	/**
	 * Actions on `/_react/relation` that mutate server state and require CSRF validation.
	 *
	 * @var list<string>
	 */
	private const MUTATING_RELATION_ACTIONS = [
		'quick_create',
		'o2m_link',
		'o2m_unlink',
	];

	/**
	 * Actions on `/_react/viewport` that mutate server state or user preferences and require CSRF validation.
	 *
	 * @var list<string>
	 */
	private const MUTATING_VIEWPORT_ACTIONS = [
		'bulk_action',
		'row_action',
		'toolbar_action',
		'update_field',
		'toggle_field',
		'move_stage',
		'reorder',
		'reschedule',
		'resize_span',
		'quick_create',
		'save_quick_edit',
		'save_view',
		'delete_view',
		'toggle_column',
		'reset_columns',
		'export',
		'sort',
		'switch_view_mode',
		'select_view',
		'reset_filters',
	];

	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => 'React',
			'version' => 10,
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
		$guestId = (int) ($user->wire()->config->guestUserPageID ?: 40);
		$isGuest = $user->isGuest() || ((int) $user->id === $guestId) || ($user->name === 'guest');
		if ($isGuest || (int) $user->id <= 0) {
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
		$this->wire()->set('react', $this);

		$this->wire()->addHook('/_react/viewport', $this, 'handleViewportRequest');
		$this->wire()->addHook('/_react/workspace-prefs', $this, 'handleWorkspacePrefsRequest');
		$this->wire()->addHook('/_react/presence', $this, 'handlePresenceRequest');
		$this->wire()->addHook('/_react/relation', $this, 'handleRelationRequest');
		$this->wire()->addHook('/_react/media', $this, 'handleMediaRequest');
		$this->wire()->addHook('/_react/tiptap', $this, 'handleTiptapRequest');
		$this->wire()->addHook('/_react/icons', $this, 'handleIconsRequest');
		$this->wire()->addHookAfter('FieldtypeTextarea::getFieldSetups', $this, 'hookFieldtypeTextareaGetFieldSetups');
		$this->wire()->addHookBefore('InputfieldPage::getConfigInputfields', $this, 'hookInputfieldPageClasses');
		$this->wire()->addHookBefore('InputfieldPage::getInputfield', $this, 'hookInputfieldPageClasses');
		$this->wire()->addHookAfter('FieldtypeFile::getConfigInputfields', $this, 'hookFieldtypeFileConfigInputfields');
		$this->wire()->addHookAfter('FieldtypeText::getConfigInputfields', $this, 'hookFieldtypeTextConfigInputfields');
		$this->wire()->addHookBefore('FieldtypeText::sleepValue', $this, 'hookFieldtypeTextSleepValue');
		$this->wire()->addHookBefore('FieldtypeText::formatValue', $this, 'hookFieldtypeTextFormatValue');
		$this->wire()->addHookBefore('FieldtypeText::markupValue', $this, 'hookFieldtypeTextMarkupValue');
		$this->wire()->addHookBefore('Field::getInputfield', $this, 'hookFieldBeforeGetInputfield');
		$this->wire()->addHookAfter('Field::getInputfield', $this, 'hookFieldAfterGetInputfield');
		$this->wire()->addHookAfter('Pages::saved', $this, 'hookPagesSavedLinkMedia');
		$this->wire()->addHookAfter('ProcessField::buildEditForm, ProcessTemplate::buildEditForm', $this, 'hookAdminIconBuildEditForm');
		$this->wire()->addHookBefore('Fields::save', $this, 'hookAdminIconFieldSave');
		$this->wire()->addHookBefore('Fields::saveFieldgroupContext', $this, 'hookAdminIconFieldContextSave');
		$this->wire()->addHookBefore('Templates::save', $this, 'hookAdminIconTemplateSave');
		$this->wire()->addHookAfter('Pages::saved', $this, 'hookAdminIconPageSaved');
		$this->wire()->addHookBefore('Session::redirect', $this, 'hookSessionRedirectPreserveWorkspace');
		$this->wire()->addHookBefore('ProcessController::execute', $this, 'hookBeforeProcessControllerExecute');
		$this->wire()->addHookAfter('ProcessController::execute', $this, 'hookAfterProcessControllerExecute');
		$this->wire()->addHookAfter('Page::render', $this, 'hookAfterProcessControllerExecute');
		$this->wire()->addHookAfter('Inputfield::render', $this, 'hookTiptapPauseLanguageSupportWrap', ['priority' => '50.0']);
		$this->wire()->addHookAfter('Inputfield::render', $this, 'hookTiptapRestoreLanguageSupportWrap', ['priority' => '150.0']);
		$this->wire()->addHookAfter('Inputfield::renderValue', $this, 'hookTiptapPauseLanguageSupportWrap', ['priority' => '50.0']);
		$this->wire()->addHookAfter('Inputfield::renderValue', $this, 'hookTiptapRestoreLanguageSupportWrap', ['priority' => '150.0']);
	}

	/**
	 * Track entry into ProcessWire's native `ProcessController::execute` (`wire/core/admin.php`).
	 */
	public function hookBeforeProcessControllerExecute(HookEvent $event): void
	{
		$this->executingProcessController = true;
	}

	/**
	 * Reset `ProcessController::execute` execution tracking after execution or page render completes.
	 */
	public function hookAfterProcessControllerExecute(HookEvent $event): void
	{
		$this->executingProcessController = false;
	}

	/**
	 * Determine whether ProcessWire is currently inside `ProcessController::execute`.
	 */
	public function isExecutingProcessController(): bool
	{
		return $this->executingProcessController;
	}

	/**
	 * Preserve `?ws=1` across `$session->redirect()` calls executed from within Workspace mode
	 * (`Admin > Workspace`), mirroring ProcessWire core's `_hookSessionRedirectModal` behavior.
	 */
	public function hookSessionRedirectPreserveWorkspace(HookEvent $event): void
	{
		if (!$this->isWorkspaceHubInstalled() || !$this->isWorkspaceContextRequest()) {
			return;
		}

		$rawUrl = $event->arguments(0);
		if (!is_string($rawUrl) || trim($rawUrl) === '') {
			return;
		}

		$updated = $this->withWorkspaceQuery($rawUrl);
		if ($updated !== $rawUrl) {
			$event->arguments(0, $updated);
		}
	}

	/**
	 * Resolve the active shell execution mode (`'workspace'` or `'admin'`) for a `ProcessReact` request.
	 *
	 * - `'workspace'`: Full-screen Workspace shell (`views/admin.php`) when rendering `ProcessReactWorkspace`
	 *   itself or when `ProcessReactWorkspace` is installed and the request entered via Workspace (`?ws=1`,
	 *   `_rw_ws=1`, `X-React-Shell: workspace`, or an `X-Inertia` SPA visit originating from Workspace).
	 * - `'admin'`: Classic ProcessWire Admin Process mode (`views/admin-process.php`) retaining ProcessWire's
	 *   top `#pw-mastheads` navigation bar while rendering the clean module-specific React panel below it.
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
		if ($input !== null) {
			if ((string) $input->get('ws') === '1' || (string) $input->post('_rw_ws') === '1') {
				return true;
			}
			if ((int) $input->get('modal') === 1 || (string) $input->post('_rw_modal') === '1' || (string) $input->post('_we_modal') === '1') {
				return false;
			}
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
			if (array_key_exists('ws', $queryParams) || ($queryParams['modal'] ?? null) === '1' || isset($queryParams['export']) || isset($queryParams['download_token'])) {
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
	 * Prevent `LanguageSupport::hookInputfieldAfterRender` (priority 100) from duplicating
	 * `InputfieldTiptap`'s self-contained multi-language React island and hidden inputs.
	 */
	public function hookTiptapPauseLanguageSupportWrap(HookEvent $event): void
	{
		$inputfield = $event->object;
		if ($inputfield instanceof InputfieldTiptap && $inputfield->getSetting('useLanguages')) {
			$inputfield->setQuietly('_tiptapRestoreUseLanguages', true);
			$inputfield->setQuietly('useLanguages', false);
		}
	}

	/**
	 * Restore `useLanguages` immediately after `LanguageSupport::hookInputfieldAfterRender` runs.
	 */
	public function hookTiptapRestoreLanguageSupportWrap(HookEvent $event): void
	{
		$inputfield = $event->object;
		if ($inputfield instanceof InputfieldTiptap && $inputfield->get('_tiptapRestoreUseLanguages')) {
			$inputfield->setQuietly('useLanguages', true);
			$inputfield->setQuietly('_tiptapRestoreUseLanguages', null);
		}
	}

	/**
	 * Read and decode a JSON request body with strict byte-size and nesting-depth bounds.
	 *
	 * @return array<string, mixed>|null
	 */
	public function readJsonRequestBody(int $maxBytes = 2097152, int $maxDepth = 64): ?array
	{
		$safeMaxBytes = max(1, $maxBytes);
		if (isset($_SERVER['CONTENT_LENGTH']) && is_numeric($_SERVER['CONTENT_LENGTH']) && (int) $_SERVER['CONTENT_LENGTH'] > $safeMaxBytes) {
			return null;
		}

		$rawBody = $this->readRawInputStream($safeMaxBytes + 1);
		if ($rawBody === '' || strlen($rawBody) > $safeMaxBytes) {
			return null;
		}

		$decoded = json_decode($rawBody, true, max(1, $maxDepth));

		return is_array($decoded) ? $decoded : null;
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
	 * Return the `TiptapMediaLinkGateway` singleton powering `/_react/tiptap` page/file/image selection,
	 * `-is` variation generation, and drag-and-drop image uploads.
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

	public function ready(): void
	{
		if (!(bool) $this->get('enableAdminVectorIcons')) {
			return;
		}

		$page = $this->wire()->page;
		$config = $this->wire()->config;
		if (
			$page instanceof Page
			&& $page->template instanceof Template
			&& $page->template->name === 'admin'
			&& $this->icons()->hasActiveAdminCss()
		) {
			$cssUrl = $this->icons()->getAdminCssUrl();
			$config->styles->add($config->versionUrl($cssUrl, true));
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
	 * Configure and return a `MarkupReactTable` instance ready for Inertia prop serialization (`InertiaSerializable`) or `->render()`.
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
	 * Configure and return a `MarkupReactCards` instance ready for Inertia prop serialization (`InertiaSerializable`) or `->render()`.
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

	/**
	 * Emit standard security headers and JSON-encode an API gateway response.
	 *
	 * @param array<string, mixed> $response
	 */
	private function respondJson(array $response, string $cacheControl = 'no-store'): string
	{
		if (!headers_sent()) {
			header('Content-Type: application/json; charset=UTF-8');
			header('X-Content-Type-Options: nosniff');
			if ($cacheControl !== '') {
				header('Cache-Control: ' . $cacheControl);
			}
		}

		$status = (int) ($response['status'] ?? (!empty($response['ok']) ? 200 : 400));
		unset($response['status']);
		http_response_code($status);

		return (string) json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	}

	/**
	 * Handle JSON viewport requests sent to `/_react/viewport`.
	 */
	public function handleViewportRequest(HookEvent $event): string
	{
		$payload = $this->readJsonRequestBody() ?? [];

		if ($payload === []) {
			$post = $this->wire()->input->post->getArray();
			if (is_array($post) && $post !== []) {
				$payload = $post;
			}
		}

		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST')));

		return $this->respondJson($this->handleViewportAction($payload, true));
	}

	/**
	 * Execute a signed viewport action and return the structured response array.
	 *
	 * @param array<string, mixed> $requestPayload
	 * @return array{ok: bool, status?: int, error?: string, viewport?: array<string, mixed>}
	 */
	public function handleViewportAction(array $requestPayload, bool $enforceCsrf = false): array
	{
		$user = $this->wire()->user;
		$guestId = (int) ($this->wire()->config->guestUserPageID ?: 40);
		if (
			$user->isGuest()
			|| (int) $user->id <= 0
			|| (int) $user->id === $guestId
		) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Authentication required.',
			];
		}

		$stateToken = trim((string) ($requestPayload['stateToken'] ?? ''));
		$action = trim((string) ($requestPayload['action'] ?? 'fetch'));
		$actionPayload = isset($requestPayload['payload']) && is_array($requestPayload['payload'])
			? $requestPayload['payload']
			: $requestPayload;

		if (in_array($action, self::MUTATING_VIEWPORT_ACTIONS, true)) {
			$reqMethod = strtoupper(trim((string) ($requestPayload['_requestMethod'] ?? (PHP_SAPI !== 'cli' ? ($_SERVER['REQUEST_METHOD'] ?? '') : ''))));
			if ($reqMethod !== '' && $reqMethod !== 'POST') {
				return [
					'ok' => false,
					'status' => 405,
					'error' => 'Method not allowed. POST required.',
				];
			}
			if ((bool) $this->wire()->config->demo) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => 'Mutations are disabled in demo mode.',
				];
			}
		}

		if ($stateToken === '') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => 'Missing viewport stateToken.',
			];
		}

		$verifier = $this->table();
		$envelope = $verifier->verifyViewportState($stateToken);
		if ($envelope === null) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Invalid or expired viewport stateToken.',
			];
		}

		if ($enforceCsrf && in_array($action, self::MUTATING_VIEWPORT_ACTIONS, true)) {
			if (!$this->verifyRequestCsrf($requestPayload)) {
				return [
					'ok' => false,
					'status' => 419,
					'error' => 'CSRF token validation failed.',
				];
			}
		}

		$viewportClass = (string) ($envelope['viewportClass'] ?? 'MarkupReactTable');
		$viewport = $this->resolveViewportInstance($viewportClass);
		$viewport->resetViewportState();
		$viewport->fill($envelope);

		$clientState = isset($requestPayload['state']) && is_array($requestPayload['state'])
			? $requestPayload['state']
			: [];
		$allowedMutableStateKeys = [
			'searchQuery',
			'filterValues',
			'sortField',
			'sortDirection',
			'page',
			'limit',
			'selectedIds',
			'hiddenColumns',
			'activeView',
			'viewMode',
			'month',
			'year',
			'calendarView',
			'quickEditRecordId',
		];
		$safeClientState = [];
		foreach ($allowedMutableStateKeys as $stateKey) {
			if (array_key_exists($stateKey, $clientState)) {
				if ($stateKey === 'page') {
					$safeClientState['pageNum'] = max(1, (int) $clientState[$stateKey]);
				} elseif ($stateKey === 'viewMode') {
					$candidateMode = strtolower(trim((string) $clientState[$stateKey]));
					$allowedModes = is_array($envelope['allowedViewModes'] ?? null) ? $envelope['allowedViewModes'] : ['table', 'cards'];
					if ($candidateMode !== '' && in_array($candidateMode, $allowedModes, true)) {
						$safeClientState['viewMode'] = $candidateMode;
					}
				} else {
					$safeClientState[$stateKey] = $clientState[$stateKey];
				}
			}
		}
		if ($safeClientState !== []) {
			$viewport->fill($safeClientState);
		}

		try {
			$updatedViewport = $viewport->executeAction($action, $actionPayload);
		} catch (WirePermissionException $e) {
			throw $e;
		} catch (\Throwable $e) {
			$this->wire()->log->error('React viewport error: ' . $e->getMessage());
			$isSafe = $e instanceof WireException || (bool) $this->wire()->config->debug;

			return [
				'ok' => false,
				'status' => 422,
				'error' => $isSafe ? $e->getMessage() : 'Viewport action failed.',
			];
		}

		if (isset($updatedViewport['ok']) && $updatedViewport['ok'] === false) {
			return [
				'ok' => false,
				'status' => 422,
				'error' => (string) ($updatedViewport['error'] ?? 'Viewport action failed.'),
				'viewport' => $updatedViewport,
			];
		}

		return [
			'ok' => true,
			'status' => 200,
			'viewport' => $updatedViewport,
		];
	}

	/**
	 * Resolve a `MarkupReactViewport` module instance by short class name.
	 */
	protected function resolveViewportInstance(string $viewportClass): MarkupReactViewport
	{
		$shortName = str_contains($viewportClass, '\\')
			? substr($viewportClass, strrpos($viewportClass, '\\') + 1)
			: $viewportClass;

		$modules = $this->wire()->modules;
		if ($shortName !== '') {
			try {
				if ($modules->isInstalled($shortName)) {
					$mod = $modules->get($shortName);
					if ($mod instanceof MarkupReactViewport) {
						return clone $mod;
					}
				}
			} catch (\Throwable) {
				// Fallback below
			}
		}

		$cleanClass = ltrim(trim($viewportClass), '\\');
		$candidates = [];
		if ($cleanClass !== '' && str_contains($cleanClass, '\\') && preg_match('/^[A-Za-z_][A-Za-z0-9_\\\\]*$/', $cleanClass) === 1) {
			$candidates[] = $cleanClass;
		}
		if ($shortName !== '' && preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $shortName) === 1) {
			$candidates[] = 'ProcessWire\\' . $shortName;
		}

		foreach ($candidates as $fqcn) {
			if (class_exists($fqcn) && is_subclass_of($fqcn, MarkupReactViewport::class)) {
				$rc = new \ReflectionClass($fqcn);
				if (!$rc->isAbstract() && !$rc->isInterface() && !$rc->isTrait()) {
					/** @var MarkupReactViewport $inst */
					$inst = $rc->newInstance();
					$this->wire($inst);
					$inst->init();

					return $inst;
				}
			}
		}

		if ($shortName === 'MarkupReactCards') {
			return $this->cards();
		}

		return $this->table();
	}

	/**
	 * Verify CSRF token (`X-CSRF-TOKEN`, `X-XSRF-TOKEN`, or form payload token) for mutating `/_react/*` requests.
	 *
	 * @param array<string, mixed> $requestPayload
	 */
	public function verifyRequestCsrf(array $requestPayload): bool
	{
		try {
			$csrf = $this->wire()->session->CSRF;
			$expectedName = (string) $csrf->getTokenName();
			$expectedValue = (string) $csrf->getTokenValue();
			if ($expectedValue === '') {
				return false;
			}

			$headerValue = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
			if ($headerValue !== '' && hash_equals($expectedValue, $headerValue)) {
				return true;
			}

			$xsrfValue = trim((string) ($_SERVER['HTTP_X_XSRF_TOKEN'] ?? ''));
			if ($xsrfValue !== '') {
				$decodedXsrf = rawurldecode($xsrfValue);
				if (hash_equals($expectedValue, $xsrfValue) || hash_equals($expectedValue, $decodedXsrf)) {
					return true;
				}
			}

			if (isset($requestPayload['csrf']) && is_array($requestPayload['csrf'])) {
				$suppliedValue = (string) ($requestPayload['csrf']['value'] ?? '');
				if ($suppliedValue !== '' && hash_equals($expectedValue, $suppliedValue)) {
					return true;
				}
			}

			if ($expectedName !== '' && isset($requestPayload[$expectedName])) {
				$suppliedValue = (string) $requestPayload[$expectedName];
				if ($suppliedValue !== '' && hash_equals($expectedValue, $suppliedValue)) {
					return true;
				}
			}

			return (bool) $csrf->hasValidToken('', false);
		} catch (\Throwable) {
			return false;
		}
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

	/**
	 * Remove a workspace definition from the static shared cache when unregistered.
	 */
	public static function forgetSharedWorkspace(string $id): void
	{
		unset(self::$sharedWorkspaces[strtolower(trim($id))]);
	}

	/**
	 * Remove a widget definition from the static shared cache when unregistered.
	 */
	public static function forgetSharedWidget(string $id): void
	{
		unset(self::$sharedWidgets[strtolower(trim($id))]);
	}

	/**
	 * Defer a module's workspace and dashboard widget registration until `workspaces()` or `widgets()` is actually requested.
	 *
	 * Ensures downstream `Wire*` modules do not allocate or evaluate workspace/widget definitions on regular
	 * frontend, API, or non-workspace requests, while immediately syncing if a registry has already been resolved.
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

	/**
	 * Hookable lifecycle method invoked when the `WorkspaceRegistry` is initialized.
	 */
	public function ___initWorkspaceRegistry(WorkspaceRegistry $registry): void {}

	/**
	 * Hookable lifecycle method for external modules to register or customize workspaces.
	 */
	public function ___registerWorkspaces(WorkspaceRegistry $registry): void {}

	/**
	 * Hookable method returning workspace definitions (`list<WorkspaceDefinition|array<string, mixed>>`).
	 *
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

	/**
	 * Hookable lifecycle method invoked when the `WorkspaceWidgetRegistry` is initialized.
	 */
	public function ___initWidgetRegistry(WorkspaceWidgetRegistry $registry): void {}

	/**
	 * Hookable lifecycle method for external modules to register dashboard widgets.
	 */
	public function ___registerWidgets(WorkspaceWidgetRegistry $registry): void {}

	/**
	 * Hookable method returning dashboard widget definitions (`list<WorkspaceWidgetDefinition|array<string, mixed>>`).
	 *
	 * @return list<WorkspaceWidgetDefinition|array<string, mixed>>
	 */
	public function ___getWidgetDefinitions(): array
	{
		return [];
	}

	/**
	 * Return the file-backed per-user `WorkspacePreferenceStore` (`site/assets/cache/React/workspaces/{user-id}.json`).
	 */
	public function workspacePreferences(): WorkspacePreferenceStore
	{
		if ($this->preferenceStore === null) {
			$this->preferenceStore = new WorkspacePreferenceStore();
			$this->wire($this->preferenceStore);
		}

		return $this->preferenceStore;
	}

	/**
	 * Handle JSON workspace preference mutations sent to `/_react/workspace-prefs`.
	 */
	public function handleWorkspacePrefsRequest(HookEvent $event): string
	{
		$user = $this->wire()->user;
		if ($user->isGuest()) {
			return $this->respondJson([
				'ok' => false,
				'status' => 403,
				'error' => 'Authentication required.',
			]);
		}

		$payload = $this->readJsonRequestBody() ?? [];

		if ($payload === []) {
			$post = $this->wire()->input->post->getArray();
			if (is_array($post) && $post !== []) {
				$payload = $post;
			}
		}

		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST')));

		return $this->respondJson($this->handleWorkspacePrefsAction($payload, true, $user));
	}

	/**
	 * Execute a workspace preference action (`toggle_favorite`, `set_favorites`, `toggle_widget`, `reorder_widgets`, `resize_widget`, `set_theme_mode`, `export_layout`, `import_layout`, `save`, `reset`)
	 * and return the reconciled preference state.
	 *
	 * @param array<string, mixed> $requestPayload
	 * @return array{ok: bool, status?: int, error?: string, preferences?: array<string, mixed>}
	 */
	public function handleWorkspacePrefsAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if ($resolvedUser->isGuest() || (int) $resolvedUser->id <= 0) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Authentication required.',
			];
		}

		$reqMethod = strtoupper(trim((string) ($requestPayload['_requestMethod'] ?? (PHP_SAPI !== 'cli' ? ($_SERVER['REQUEST_METHOD'] ?? '') : ''))));
		if ($reqMethod !== '' && $reqMethod !== 'POST') {
			return [
				'ok' => false,
				'status' => 405,
				'error' => 'Method not allowed. POST required.',
			];
		}

		if ($enforceCsrf && !$this->verifyRequestCsrf($requestPayload)) {
			return [
				'ok' => false,
				'status' => 419,
				'error' => 'CSRF token validation failed.',
			];
		}

		$action = strtolower(trim((string) ($requestPayload['action'] ?? 'save')));
		if ($action === '') {
			$action = 'save';
		}
		$allowedPrefActions = [
			'save',
			'toggle_favorite',
			'set_favorites',
			'toggle_widget',
			'reorder_widgets',
			'resize_widget',
			'reset',
			'export_layout',
			'import_layout',
			'set_theme_mode',
		];
		if (!in_array($action, $allowedPrefActions, true)) {
			return [
				'ok' => false,
				'status' => 422,
				'error' => 'Unsupported workspace preference action.',
			];
		}
		if ($action !== 'export_layout' && (bool) $this->wire()->config->demo) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Mutations are disabled in demo mode.',
			];
		}
		$store = $this->workspacePreferences();

		if ($action === 'import_layout') {
			$rawPreset = $requestPayload['preset'] ?? $requestPayload;
			if (is_string($rawPreset)) {
				if (strlen($rawPreset) > 65536) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => 'Dashboard layout preset exceeds maximum size.',
					];
				}
				$decodedPreset = json_decode($rawPreset, true, 16);
				if (json_last_error() !== JSON_ERROR_NONE || !is_array($decodedPreset)) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => 'Invalid JSON format in dashboard layout preset.',
					];
				}
				$rawPreset = $decodedPreset;
			}
			if (!is_array($rawPreset)) {
				return [
					'ok' => false,
					'status' => 422,
					'error' => 'Dashboard layout preset must be a JSON object.',
				];
			}

			try {
				$store->importPreset($rawPreset, $resolvedUser);
			} catch (\InvalidArgumentException $e) {
				return [
					'ok' => false,
					'status' => 422,
					'error' => $e->getMessage(),
				];
			}
		} elseif ($action === 'set_theme_mode') {
			$rawMode = strtolower(trim((string) ($requestPayload['themeMode'] ?? 'system')));
			if ($rawMode === 'auto') {
				$rawMode = 'system';
			}
			if (!in_array($rawMode, ['light', 'dark', 'system'], true)) {
				return [
					'ok' => false,
					'status' => 422,
					'error' => 'Invalid themeMode value.',
				];
			}
			$adminSettings = $this->wire()->config->AdminThemeUikit;
			if (is_array($adminSettings) && !empty($adminSettings['noDarkMode'])) {
				$rawMode = 'light';
			}
			$metaValue = match ($rawMode) {
				'dark' => 1,
				'light' => 0,
				default => -1,
			};
			$resolvedUser->meta('adminDarkMode', $metaValue);
		} elseif ($action !== 'export_layout') {
			match ($action) {
				'toggle_favorite' => $store->toggleFavorite((string) ($requestPayload['workspaceId'] ?? ''), $resolvedUser),
				'set_favorites' => $store->savePreferences(['favorites' => is_array($requestPayload['favorites'] ?? null) ? $requestPayload['favorites'] : []], $resolvedUser),
				'toggle_widget' => $store->toggleWidgetVisibility(
					(string) ($requestPayload['widgetId'] ?? ''),
					array_key_exists('visible', $requestPayload) ? (bool) $requestPayload['visible'] : null,
					$resolvedUser
				),
				'reorder_widgets' => $store->reorderWidgets(is_array($requestPayload['widgetOrder'] ?? null) ? $requestPayload['widgetOrder'] : [], $resolvedUser),
				'resize_widget' => $store->setWidgetSize(
					(string) ($requestPayload['widgetId'] ?? ''),
					(string) ($requestPayload['size'] ?? 'md'),
					$resolvedUser
				),
				'reset' => $store->reset($resolvedUser),
				default => $store->savePreferences($requestPayload, $resolvedUser),
			};
		}

		$accessibleWorkspaces = $this->workspaces()->accessible($resolvedUser);
		$accessibleWidgets = $this->widgets()->accessible($resolvedUser);
		$reconciled = $store->reconcile($accessibleWorkspaces, $accessibleWidgets, $resolvedUser);

		$response = [
			'ok' => true,
			'status' => 200,
			'preferences' => $reconciled,
			'themeMode' => $this->resolveEffectiveThemeMode($resolvedUser),
		];

		if ($action === 'export_layout') {
			$response['preset'] = $store->exportPreset($accessibleWorkspaces, $accessibleWidgets, $resolvedUser);
		}

		return $response;
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

	/**
	 * Handle JSON concurrent edit presence requests sent to `/_react/presence`.
	 */
	public function handlePresenceRequest(HookEvent $event): string
	{
		$user = $this->wire()->user;
		if ($user->isGuest() || !self::checkAccess(['user' => $user])) {
			return $this->respondJson([
				'ok' => false,
				'status' => 403,
				'error' => 'Workspace access required.',
			]);
		}

		$payload = $this->readJsonRequestBody() ?? [];

		if ($payload === []) {
			$post = $this->wire()->input->post->getArray();
			if (is_array($post) && $post !== []) {
				$payload = $post;
			}
		}

		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST')));

		return $this->respondJson($this->handlePresenceAction($payload, true, $user));
	}

	/**
	 * Execute a concurrent edit presence action (`heartbeat`, `leave`, `saved`) and return active co-editors and latest save state.
	 *
	 * @param array<string, mixed> $requestPayload
	 * @return array{ok: bool, status?: int, error?: string, presence?: array<string, mixed>}
	 */
	public function handlePresenceAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if ($resolvedUser->isGuest() || (int) $resolvedUser->id <= 0 || !self::checkAccess(['user' => $resolvedUser])) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Workspace access required.',
			];
		}

		$reqMethod = strtoupper(trim((string) ($requestPayload['_requestMethod'] ?? (PHP_SAPI !== 'cli' ? ($_SERVER['REQUEST_METHOD'] ?? '') : ''))));
		if ($reqMethod !== '' && $reqMethod !== 'POST') {
			return [
				'ok' => false,
				'status' => 405,
				'error' => 'Method not allowed. POST required.',
			];
		}

		if ($enforceCsrf && !$this->verifyRequestCsrf($requestPayload)) {
			return [
				'ok' => false,
				'status' => 419,
				'error' => 'CSRF token validation failed.',
			];
		}

		if ((bool) $this->wire()->config->demo) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Mutations are disabled in demo mode.',
			];
		}

		$store = $this->presence();
		$resourceKey = $store->sanitizeResourceKey((string) ($requestPayload['resourceKey'] ?? ''));
		if ($resourceKey === '') {
			return [
				'ok' => false,
				'status' => 422,
				'error' => 'Missing or invalid resourceKey.',
			];
		}

		$action = strtolower(trim((string) ($requestPayload['action'] ?? 'heartbeat')));
		if ($action === '') {
			$action = 'heartbeat';
		}
		if (!in_array($action, ['heartbeat', 'leave', 'saved'], true)) {
			return [
				'ok' => false,
				'status' => 422,
				'error' => 'Unsupported presence action.',
			];
		}
		$clientId = (string) ($requestPayload['clientId'] ?? '');

		$snapshot = match ($action) {
			'leave' => $store->leave($resourceKey, $resolvedUser, $clientId),
			'saved' => $store->markSaved($resourceKey, $resolvedUser, $clientId),
			default => $store->heartbeat($resourceKey, $resolvedUser, $clientId),
		};

		return [
			'ok' => true,
			'status' => 200,
			'presence' => $snapshot,
		];
	}

	/**
	 * Notify active co-editors that `$resourceKey` was saved on the server.
	 *
	 * Zero overhead when idle: only touches presence files that already exist on disk for active editor sessions.
	 */
	public function notifyResourceSaved(string $resourceKey, ?User $user = null): void
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if ($resolvedUser->isGuest() || (int) $resolvedUser->id <= 0) {
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

	/**
	 * Determine whether the `ProviderRegistry` has already run discovery hooks on this instance.
	 */
	public function isProvidersResolved(): bool
	{
		return $this->providersResolved;
	}

	/**
	 * Defer a module's data provider registration until `providers()` is actually requested.
	 *
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

	/**
	 * Hookable lifecycle method invoked when a `ProviderRegistry` is initialized.
	 */
	public function ___initProviderRegistry(ProviderRegistry $registry): void {}

	/**
	 * Hookable lifecycle method for external modules to register named `ReactDataProviderInterface` factories.
	 */
	public function ___registerProviders(ProviderRegistry $registry): void {}

	/**
	 * Expose `InputfieldReactM2O` and `InputfieldReactM2M` in ProcessWire's `InputfieldPage` widget selector (`Setup > Fields`).
	 */
	public function hookInputfieldPageClasses(HookEvent $event): void
	{
		$pageField = $event->object;
		if (!$pageField instanceof Inputfield) {
			return;
		}
		$classes = $pageField->get('inputfieldClasses');
		$list = is_array($classes) ? $classes : [];
		foreach (['InputfieldReactM2O', 'InputfieldReactM2M'] as $cls) {
			if (!in_array($cls, $list, true)) {
				$list[] = $cls;
			}
		}
		$pageField->set('inputfieldClasses', $list);
	}

	/**
	 * Filter `InputfieldReactImage` out of `FieldtypeFile` (non-image) `inputfieldClass` dropdown options
	 * so `React Image` appears exclusively on `FieldtypeImage` fields while `React File` appears on `FieldtypeFile`.
	 */
	public function hookFieldtypeFileConfigInputfields(HookEvent $event): void
	{
		$fieldtype = $event->object;
		$wrapper = $event->return;
		if (!$fieldtype instanceof FieldtypeFile || !$wrapper instanceof InputfieldWrapper) {
			return;
		}
		if ($fieldtype instanceof FieldtypeImage) {
			return;
		}

		$select = $wrapper->getChildByName('inputfieldClass');
		if ($select instanceof InputfieldSelect) {
			$select->removeOption('InputfieldReactImage');
		}
	}

	/**
	 * Expose `InputfieldReactKeyValue` in `FieldtypeText` and `FieldtypeTextarea` `inputfieldClass` selectors
	 * (`Setup > Fields > Details`) for single-language text/textarea fields.
	 */
	public function hookFieldtypeTextConfigInputfields(HookEvent $event): void
	{
		$fieldtype = $event->object;
		$field = $event->arguments(0);
		$wrapper = $event->return;
		if (
			!$fieldtype instanceof FieldtypeText
			|| $fieldtype instanceof FieldtypeLanguageInterface
			|| !in_array($fieldtype->className(), ['FieldtypeText', 'FieldtypeTextarea'], true)
			|| !$wrapper instanceof InputfieldWrapper
		) {
			return;
		}

		$select = $wrapper->getChildByName('inputfieldClass');
		if (!$select instanceof InputfieldSelect) {
			return;
		}

		$modules = $this->wire()->modules;
		if ($modules->isInstalled('InputfieldReactKeyValue')) {
			$info = InputfieldReactKeyValue::getModuleInfo();
			$title = (string) ($info['title'] ?? 'React Key-Value Pairs');
			$summary = (string) ($info['summary'] ?? '');
			if ($fieldtype->className() === 'FieldtypeText') {
				$label = $summary !== '' ? "{$title} [span.detail] - {$summary} [/span]" : $title;
				$select->addOption('InputfieldReactKeyValue', $label);
			} else {
				$select->addOption('InputfieldReactKeyValue', $title);
			}

			if ($field instanceof Field && InputfieldReactKeyValue::isKeyValueField($field)) {
				$select->val('InputfieldReactKeyValue');
			}
		}

		if ($modules->isInstalled('InputfieldReactLink')) {
			$linkInfo = InputfieldReactLink::getModuleInfo();
			$linkTitle = (string) ($linkInfo['title'] ?? 'React Link & Media Target');
			$linkSummary = (string) ($linkInfo['summary'] ?? '');
			if ($fieldtype->className() === 'FieldtypeText') {
				$linkLabel = $linkSummary !== '' ? "{$linkTitle} [span.detail] - {$linkSummary} [/span]" : $linkTitle;
				$select->addOption('InputfieldReactLink', $linkLabel);
			} else {
				$select->addOption('InputfieldReactLink', $linkTitle);
			}

			if ($field instanceof Field && InputfieldReactLink::isLinkField($field)) {
				$select->val('InputfieldReactLink');
			}
		}

		if ($modules->isInstalled('InputfieldReactIcon')) {
			$iconInfo = InputfieldReactIcon::getModuleInfo();
			$iconTitle = (string) ($iconInfo['title'] ?? 'React Icon');
			$iconSummary = (string) ($iconInfo['summary'] ?? '');
			if ($fieldtype->className() === 'FieldtypeText') {
				$iconLabel = $iconSummary !== '' ? "{$iconTitle} [span.detail] - {$iconSummary} [/span]" : $iconTitle;
				$select->addOption('InputfieldReactIcon', $iconLabel);
			} else {
				$select->addOption('InputfieldReactIcon', $iconTitle);
			}

			if ($field instanceof Field && InputfieldReactIcon::isIconField($field)) {
				$select->val('InputfieldReactIcon');
			}
		}
	}

	/**
	 * Serialize associative arrays, `\stdClass`, or JSON strings on `FieldtypeText` / `FieldtypeTextarea`
	 * fields using `InputfieldReactKeyValue` or `InputfieldReactLink` into canonical JSON strings before database storage.
	 */
	public function hookFieldtypeTextSleepValue(HookEvent $event): void
	{
		$field = $event->arguments(1);
		if (
			!$field instanceof Field
			|| $field->type instanceof FieldtypeLanguageInterface
		) {
			return;
		}

		$cls = strtolower(trim((string) ($field->get('inputfieldClass') ?? '')));
		if ($cls === 'inputfieldreactkeyvalue') {
			$allowEmpty = $field->get('allowEmptyValues') !== null ? (bool) $field->get('allowEmptyValues') : true;
			$event->replace = true;
			$event->return = InputfieldReactKeyValue::encodeJsonObject($event->arguments(2), $allowEmpty);
			return;
		}

		if ($cls === 'inputfieldreactlink') {
			$defType = (string) ($field->get('defaultType') ?: 'page');
			$event->replace = true;
			$event->return = InputfieldReactLink::encodeJsonObject($event->arguments(2), $defType);
			return;
		}

		if ($cls === 'inputfieldreacticon') {
			$event->replace = true;
			$event->return = InputfieldReactIcon::encodeStorageValue($event->arguments(2), $field);
		}
	}

	/**
	 * Format `FieldtypeText` / `FieldtypeTextarea` fields using `InputfieldReactKeyValue`, `InputfieldReactLink`,
	 * or `InputfieldReactIcon` when `$page->of()` is enabled, bypassing `TextformatterEntities` JSON quote corruption.
	 */
	public function hookFieldtypeTextFormatValue(HookEvent $event): void
	{
		$field = $event->arguments(1);
		if (
			!$field instanceof Field
			|| $field->type instanceof FieldtypeLanguageInterface
		) {
			return;
		}

		$cls = strtolower(trim((string) ($field->get('inputfieldClass') ?? '')));
		if ($cls === 'inputfieldreactkeyvalue') {
			$allowEmpty = $field->get('allowEmptyValues') !== null ? (bool) $field->get('allowEmptyValues') : true;
			$event->replace = true;
			$event->return = InputfieldReactKeyValue::normalizeValue($event->arguments(2), $allowEmpty);
			return;
		}

		if ($cls === 'inputfieldreactlink') {
			$page = $event->arguments(0);
			$event->replace = true;
			$event->return = InputfieldReactLink::resolveValue(
				$event->arguments(2),
				$page instanceof Page ? $page : null,
				$field,
			);
			return;
		}

		if ($cls === 'inputfieldreacticon') {
			$event->replace = true;
			$event->return = InputfieldReactIcon::resolveValue($event->arguments(2));
		}
	}

	/**
	 * Render clean HTML summary markup for `InputfieldReactKeyValue`, `InputfieldReactLink`, and `InputfieldReactIcon`
	 * Page fields in ProcessWire Admin Lister, PageList, and `$page->markupValue()`.
	 */
	public function hookFieldtypeTextMarkupValue(HookEvent $event): void
	{
		$field = $event->arguments(1);
		if (
			!$field instanceof Field
			|| $field->type instanceof FieldtypeLanguageInterface
		) {
			return;
		}

		$cls = strtolower(trim((string) ($field->get('inputfieldClass') ?? '')));
		if (!in_array($cls, ['inputfieldreactkeyvalue', 'inputfieldreactlink', 'inputfieldreacticon'], true)) {
			return;
		}

		$page = $event->arguments(0);
		$rawValue = $event->arguments(2);
		if ($rawValue === null && $page instanceof Page) {
			$rawValue = $page->getUnformatted($field->name);
		}
		$property = (string) ($event->arguments(3) ?? '');

		if ($cls === 'inputfieldreactkeyvalue') {
			$event->replace = true;
			$event->return = InputfieldReactKeyValue::renderPairsMarkup($rawValue, $property);
			return;
		}

		if ($cls === 'inputfieldreactlink') {
			$event->replace = true;
			$event->return = InputfieldReactLink::renderLinkMarkup(
				$rawValue,
				$page instanceof Page ? $page : null,
				$field,
				$property,
			);
			return;
		}

		$event->replace = true;
		$event->return = InputfieldReactIcon::renderIconMarkup($rawValue, $property);
	}

	/**
	 * Clean up superseded or removed `links/{fieldName}/` media files whenever a `Page` with `InputfieldReactLink` fields is saved.
	 */
	public function hookPagesSavedLinkMedia(HookEvent $event): void
	{
		$page = $event->arguments(0);
		if (!$page instanceof Page || $page->id <= 0 || !$page->template instanceof Template) {
			return;
		}
		foreach ($page->template->fieldgroup as $field) {
			if (!$field instanceof Field || !$field->type instanceof FieldtypeText) {
				continue;
			}
			if (strtolower(trim((string) ($field->get('inputfieldClass') ?? ''))) === 'inputfieldreactlink') {
				PageLinkMediaHostAdapter::syncSavedPageLinkMedia(
					$page,
					$field,
					$page->getUnformatted($field->name),
				);
			}
		}
	}

	/**
	 * When `useReactMediaFields` is enabled in module configuration, transparently upgrade default
	 * `InputfieldImage` / `InputfieldFile` instances on Pages to `InputfieldReactImage` / `InputfieldReactFile`
	 * while preserving every `Field` setting, Repeater context, and custom `fileSchema` configuration.
	 */
	public function hookFieldBeforeGetInputfield(HookEvent $event): void
	{
		if (!(bool) $this->get('useReactMediaFields')) {
			return;
		}

		$field = $event->object;
		if (!$field instanceof Field || !$field->type instanceof FieldtypeFile) {
			return;
		}

		$configured = trim((string) ($field->get('inputfieldClass') ?? ''));
		$isImageField = $field->type instanceof FieldtypeImage;

		if ($isImageField) {
			if ($configured !== '' && $configured !== 'InputfieldImage') {
				return;
			}
			$targetClass = 'InputfieldReactImage';
		} else {
			if ($configured !== '' && $configured !== 'InputfieldFile') {
				return;
			}
			$targetClass = 'InputfieldReactFile';
		}

		$modules = $this->wire()->modules;
		if (!$modules->isInstalled($targetClass)) {
			return;
		}

		$field->setQuietly('_rwOrigInputfieldClass', $field->get('inputfieldClass'));
		$field->setQuietly('_rwSwappedInputfieldClass', true);
		$field->setQuietly('inputfieldClass', $targetClass);
	}

	/**
	 * Restore `$field->inputfieldClass` immediately after `Field::getInputfield` finishes so the in-memory
	 * `Field` definition is never mutated if later saved.
	 */
	public function hookFieldAfterGetInputfield(HookEvent $event): void
	{
		$field = $event->object;
		if (!$field instanceof Field || !$field->get('_rwSwappedInputfieldClass')) {
			return;
		}

		$orig = $field->get('_rwOrigInputfieldClass');
		$field->setQuietly('inputfieldClass', $orig);
		$field->setQuietly('_rwSwappedInputfieldClass', null);
		$field->setQuietly('_rwOrigInputfieldClass', null);
	}

	/**
	 * Inject an `InputfieldReactIcon` (`lucideIcon`) selector directly below ProcessWire's native `icon` / `pageLabelIcon`
	 * field on `ProcessField` and `ProcessTemplate` edit screens.
	 * When `lucideIcon` is empty, ProcessWire's native `InputfieldIcon` remains visible (`showIf="lucideIcon=''"`);
	 * when populated, `lucideIcon` overrides the template/field icon via `LucideIcons.css` `mask-image`.
	 */
	public function hookAdminIconBuildEditForm(HookEvent $event): void
	{
		if (!(bool) $this->get('enableAdminVectorIcons')) {
			return;
		}

		$wrapper = $event->return;
		if (!$wrapper instanceof InputfieldWrapper) {
			return;
		}
		if ($wrapper->getChildByName('lucideIcon') !== null) {
			return;
		}

		$input = $this->wire()->input;
		$modules = $this->wire()->modules;
		$obj = $event->object;
		$objClass = is_object($obj) ? (method_exists($obj, 'className') ? (string) $obj->className() : get_class($obj)) : '';

		if ($objClass === 'ProcessField' || str_ends_with($objClass, '\\ProcessField')) {
			$iconFieldName = 'icon';
			$item = (is_object($obj) && method_exists($obj, 'getField')) ? $obj->getField() : null;
			if (!$item instanceof Field) {
				$itemId = (int) ($input->post('id') ?: $input->get('id'));
				$item = $itemId > 0 ? $this->wire()->fields->get($itemId) : null;
			}
			if (!$item instanceof Field || (int) $item->id <= 0) {
				return;
			}
		} else {
			$iconFieldName = 'pageLabelIcon';
			$itemId = (int) ($input->post('id') ?: $input->get('id'));
			$item = $itemId > 0 ? $this->wire()->templates->get($itemId) : null;
			if (!$item instanceof Template || (int) $item->id <= 0) {
				return;
			}
		}

		$iconField = $wrapper->getChildByName($iconFieldName);
		if (!$iconField instanceof Inputfield) {
			return;
		}
		$iconField->showIf = "lucideIcon=''";

		if ($modules->isInstalled('InputfieldReactIcon')) {
			/** @var InputfieldReactIcon $vectorIconField */
			$vectorIconField = $modules->get('InputfieldReactIcon');
		} else {
			$vectorIconField = new InputfieldReactIcon();
			$this->wire($vectorIconField);
		}

		$rawCurrent = $item->get('lucideIcon');
		$currentPrefixed = is_string($rawCurrent) ? IconManager::toAdminPrefixedValue($rawCurrent) : '';

		$vectorIconField->attr('name', 'lucideIcon');
		$vectorIconField->label = $this->_('Vector Icon');
		$vectorIconField->description = $this->_('Select a vector icon. When populated, this overrides the standard ProcessWire icon above.');
		$vectorIconField->icon = $currentPrefixed !== '' ? IconManager::sanitizeAdminIconClass($currentPrefixed) : 'puzzle-piece';
		$vectorIconField->set('iconPrefixMode', 'lucide');
		$vectorIconField->set('allowCustomization', false);
		$vectorIconField->set('previewSize', IconManager::clampSize($this->get('adminIconPreviewSize'), 22));
		$vectorIconField->attr('value', $currentPrefixed);
		$vectorIconField->collapsed = Inputfield::collapsedBlank;

		$wrapper->insertAfter($vectorIconField, $iconField);
	}

	/**
	 * Before `Fields::save`: sync `$field->lucideIcon` into `$field->icon` (`lucide--*`) and regenerate `LucideIcons.css`.
	 */
	public function hookAdminIconFieldSave(HookEvent $event): void
	{
		if (!(bool) $this->get('enableAdminVectorIcons')) {
			return;
		}

		$field = $event->arguments(0);
		if (!$field instanceof Field) {
			return;
		}

		$rawLucide = $field->get('lucideIcon');
		$input = $this->wire()->input;
		if (
			$input->requestMethod('POST')
			&& isset($_POST['lucideIcon'])
			&& (int) ($input->post('id') ?: $input->get('id')) === (int) $field->id
		) {
			$rawLucide = (string) $_POST['lucideIcon'];
		}

		if ($rawLucide === null) {
			return;
		}

		$prefixed = IconManager::toAdminPrefixedValue($rawLucide);
		$currentIcon = (string) $field->getIcon(false);
		if ($prefixed !== '') {
			$targetIcon = IconManager::sanitizeAdminIconClass($prefixed);
			$needsCss = $currentIcon !== $targetIcon
				|| $field->isChanged('lucideIcon')
				|| !is_file($this->icons()->getAdminCssPath());
			$field->set('lucideIcon', $prefixed);
			$field->set('icon', $targetIcon);
			if ($needsCss) {
				$this->icons()->generateAdminCss();
			}
			return;
		}

		if ($field->isChanged('lucideIcon') || IconManager::isAdminVectorIcon($currentIcon)) {
			$field->set('lucideIcon', '');
			if (IconManager::isAdminVectorIcon($currentIcon)) {
				$field->set('icon', '');
			}
			$this->icons()->generateAdminCss();
		}
	}

	/**
	 * Before `Fields::saveFieldgroupContext`: sync template-context `lucideIcon` overrides and regenerate `LucideIcons.css`.
	 */
	public function hookAdminIconFieldContextSave(HookEvent $event): void
	{
		if (!(bool) $this->get('enableAdminVectorIcons')) {
			return;
		}

		$field = $event->arguments(0);
		$fieldgroup = $event->arguments(1);
		if (!$field instanceof Field || !$fieldgroup instanceof Fieldgroup) {
			return;
		}

		$rawLucide = $field->get('lucideIcon');
		$input = $this->wire()->input;
		if (
			$input->requestMethod('POST')
			&& isset($_POST['lucideIcon'])
			&& (int) ($input->post('id') ?: $input->get('id')) === (int) $field->id
		) {
			$rawLucide = (string) $_POST['lucideIcon'];
		}

		if ($rawLucide === null) {
			return;
		}

		$prefixed = IconManager::toAdminPrefixedValue($rawLucide);
		if ($prefixed !== '') {
			$field->set('lucideIcon', $prefixed);
			$field->set('icon', IconManager::sanitizeAdminIconClass($prefixed));
			$fieldgroup->setFieldContextArray($field->id, array_merge(
				$fieldgroup->getFieldContextArray($field->id),
				[
					'lucideIcon' => $prefixed,
					'icon' => IconManager::sanitizeAdminIconClass($prefixed),
				],
			));
			$this->icons()->generateAdminCss();
			return;
		}

		$ctx = $fieldgroup->getFieldContextArray($field->id);
		if (!empty($ctx['lucideIcon']) || (isset($ctx['icon']) && is_string($ctx['icon']) && IconManager::isAdminVectorIcon($ctx['icon']))) {
			unset($ctx['lucideIcon']);
			if (isset($ctx['icon']) && is_string($ctx['icon']) && IconManager::isAdminVectorIcon($ctx['icon'])) {
				unset($ctx['icon']);
			}
			$fieldgroup->setFieldContextArray($field->id, $ctx);
			$field->set('lucideIcon', '');
			$this->icons()->generateAdminCss();
		}
	}

	/**
	 * Before `Templates::save`: read `lucideIcon` from POST (on `ProcessTemplate::executeSave`) or `$template->get('lucideIcon')`,
	 * update `$template->setIcon(...)`, and regenerate `LucideIcons.css`.
	 */
	public function hookAdminIconTemplateSave(HookEvent $event): void
	{
		if (!(bool) $this->get('enableAdminVectorIcons')) {
			return;
		}

		$template = $event->arguments(0);
		if (!$template instanceof Template) {
			return;
		}

		$rawLucide = $template->get('lucideIcon');
		$input = $this->wire()->input;
		if (
			$input->requestMethod('POST')
			&& isset($_POST['lucideIcon'])
			&& (int) ($input->post('id') ?: $input->get('id')) === (int) $template->id
		) {
			$rawLucide = (string) $_POST['lucideIcon'];
		}

		if ($rawLucide === null) {
			return;
		}

		$prevLucide = is_string($template->get('lucideIcon')) ? trim((string) $template->get('lucideIcon')) : '';
		$prefixed = IconManager::toAdminPrefixedValue($rawLucide);

		if ($prefixed !== '') {
			$template->set('lucideIcon', $prefixed);
			$template->setIcon(IconManager::sanitizeAdminIconClass($prefixed));
			if ($prevLucide !== $prefixed || !is_file($this->icons()->getAdminCssPath())) {
				$this->icons()->generateAdminCss();
			}
			return;
		}

		$currentTplIcon = (string) $template->getIcon(false);
		if ($prevLucide !== '' || IconManager::isAdminVectorIcon($currentTplIcon)) {
			$template->set('lucideIcon', '');
			if (IconManager::isAdminVectorIcon($currentTplIcon)) {
				$template->setIcon('');
				$template->pageLabelField = trim((string) $template->pageLabelField);
			}
			$this->icons()->generateAdminCss();
		}
	}

	/**
	 * After `Pages::saved`: regenerate `LucideIcons.css` when an `admin` page updates a `page_icon` vector icon value.
	 */
	public function hookAdminIconPageSaved(HookEvent $event): void
	{
		if (!(bool) $this->get('enableAdminVectorIcons')) {
			return;
		}

		$page = $event->arguments(0);
		$changes = $event->arguments(1);
		if (!$page instanceof Page || !$page->template instanceof Template || $page->template->name !== 'admin') {
			return;
		}
		if (is_array($changes) && !in_array('page_icon', $changes, true) && !isset($changes['page_icon'])) {
			return;
		}
		$this->icons()->generateAdminCss();
	}

	/**
	 * Handle multipart/JSON media requests sent to `/_react/media`.
	 */
	public function handleMediaRequest(HookEvent $event): string
	{
		$payload = [];
		$contentType = strtolower(trim((string) ($_SERVER['CONTENT_TYPE'] ?? '')));
		if (str_contains($contentType, 'application/json')) {
			$payload = $this->readJsonRequestBody() ?? [];
		}

		if ($payload === []) {
			$post = $this->wire()->input->post->getArray();
			if (is_array($post) && $post !== []) {
				$payload = $post;
			} elseif (!str_contains($contentType, 'application/json') && !str_contains($contentType, 'multipart/form-data')) {
				$payload = $this->readJsonRequestBody() ?? [];
			}
		}

		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST')));

		return $this->respondJson($this->handleMediaAction($payload, true));
	}

	/**
	 * Execute a signed media action (`upload`, `replace`, `transform`, `inspect`) via `MediaGateway`.
	 *
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
		return $this->media()->handleAction($requestPayload, $enforceCsrf, $user, $uploadedFiles);
	}

	/**
	 * Register `Tiptap` (`InputfieldTiptap` + `contentTypeHTML`) in `FieldtypeTextarea::getFieldSetups`
	 * when `InputfieldTiptap` is installed so new rich-text fields configure HTML link/image QA automatically.
	 */
	public function hookFieldtypeTextareaGetFieldSetups(HookEvent $event): void
	{
		$fieldtype = $event->object;
		if (!$fieldtype instanceof FieldtypeTextarea) {
			return;
		}
		$cls = $fieldtype->className();
		if ($cls !== 'FieldtypeTextarea' && $cls !== 'FieldtypeTextareaLanguage') {
			return;
		}
		if (!$this->wire()->modules->isInstalled('InputfieldTiptap')) {
			return;
		}
		$setups = $event->return;
		if (!is_array($setups)) {
			return;
		}
		$setups['Tiptap'] = [
			'title' => 'Tiptap',
			'inputfieldClass' => 'InputfieldTiptap',
			'contentType' => FieldtypeTextarea::contentTypeHTML,
			'textformatters' => [],
		];
		$event->return = $setups;
	}

	/**
	 * Handle `GET` / `POST` editor link, image, variation, and upload requests sent to `/_react/tiptap`.
	 */
	public function handleTiptapRequest(HookEvent $event): string
	{
		$reqMethod = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));
		$payload = [];
		$get = $this->wire()->input->get->getArray();
		if (is_array($get) && $get !== []) {
			$payload = $get;
		}

		if ($reqMethod !== 'GET' && $reqMethod !== 'HEAD') {
			$contentType = strtolower(trim((string) ($_SERVER['CONTENT_TYPE'] ?? '')));
			$bodyData = [];
			if (str_contains($contentType, 'application/json')) {
				$bodyData = $this->readJsonRequestBody() ?? [];
			}
			if ($bodyData === []) {
				$post = $this->wire()->input->post->getArray();
				if (is_array($post) && $post !== []) {
					$bodyData = $post;
				} elseif (!str_contains($contentType, 'application/json') && !str_contains($contentType, 'multipart/form-data')) {
					$bodyData = $this->readJsonRequestBody() ?? [];
				}
			}
			if ($bodyData !== []) {
				$payload = array_merge($payload, $bodyData);
			}
		}

		$payload['_requestMethod'] = $reqMethod;

		return $this->respondJson($this->handleTiptapAction($payload, true));
	}

	/**
	 * Execute a signed Tiptap link/media action (`pages`, `files`, `images`, `inspectImage`, `resize`, `upload`).
	 *
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
		return $this->tiptap()->handleAction($requestPayload, $enforceCsrf, $user, $uploadedFiles);
	}

	/**
	 * Handle read-only vector icon catalog queries and microtask hydration requests sent to `/_react/icons`.
	 */
	public function handleIconsRequest(HookEvent $event): string
	{
		$get = $this->wire()->input->get->getArray();
		$payload = is_array($get) ? $get : [];
		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));

		return $this->respondJson($this->handleIconsAction($payload), 'public, max-age=3600');
	}

	/**
	 * Execute a read-only `/_react/icons` action (`query` or `hydrate`).
	 *
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	public function handleIconsAction(array $params): array
	{
		$reqMethod = strtoupper(trim((string) ($params['_requestMethod'] ?? 'GET')));
		if ($reqMethod !== '' && $reqMethod !== 'GET' && $reqMethod !== 'HEAD') {
			return [
				'ok' => false,
				'status' => 405,
				'error' => 'Method not allowed. GET required.',
			];
		}

		$action = strtolower(trim((string) ($params['action'] ?? 'query')));
		if ($action === 'hydrate') {
			$rawNames = substr(trim((string) ($params['names'] ?? '')), 0, 4096);
			$parts = $rawNames !== ''
				? array_values(array_filter(array_map('trim', explode(',', $rawNames)), static fn(string $s): bool => $s !== ''))
				: [];

			return [
				'ok' => true,
				'status' => 200,
				'icons' => $this->icons()->hydrateIcons($parts),
			];
		}

		$query = substr(trim((string) ($params['q'] ?? '')), 0, 120);
		$category = substr(trim((string) ($params['category'] ?? 'all')), 0, 80);
		$style = substr(trim((string) ($params['style'] ?? 'all')), 0, 20);
		$offset = is_numeric($params['offset'] ?? null) ? max(0, min(10000, (int) $params['offset'])) : 0;
		$limit = is_numeric($params['limit'] ?? null) ? max(1, min(200, (int) $params['limit'])) : 96;
		$includeMeta = !empty($params['meta']);

		$res = $this->icons()->queryCatalog($query, $category, $style, $offset, $limit, $includeMeta);
		$res['status'] = 200;

		return $res;
	}

	/**
	 * Determine whether the `RelationResourceRegistry` has already run discovery hooks on this instance.
	 */
	public function isRelationsResolved(): bool
	{
		return $this->relationsResolved;
	}

	/**
	 * Defer a module's relation resource registration until `relations()` is actually requested.
	 *
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

	/**
	 * Hookable lifecycle method invoked when a `RelationResourceRegistry` is initialized.
	 */
	public function ___initRelationRegistry(RelationResourceRegistry $registry): void {}

	/**
	 * Hookable lifecycle method for external modules to register custom `RelationResourceInterface` adapters.
	 */
	public function ___registerRelationResources(RelationResourceRegistry $registry): void {}

	/**
	 * Handle JSON relation requests sent to `/_react/relation`.
	 */
	public function handleRelationRequest(HookEvent $event): string
	{
		$payload = $this->readJsonRequestBody() ?? [];

		if ($payload === []) {
			$input = $this->wire()->input;
			$post = $input->post->getArray();
			if (is_array($post) && $post !== []) {
				$payload = $post;
			} else {
				$get = $input->get->getArray();
				if (is_array($get) && $get !== []) {
					$payload = $get;
				}
			}
		}

		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST')));

		return $this->respondJson($this->handleRelationAction($payload, true));
	}

	/**
	 * Execute a signed relation action (`search`, `tree`, `hydrate`, `o2m_list`, `quick_create`, `o2m_link`, `o2m_unlink`).
	 *
	 * @param array<string, mixed> $requestPayload
	 * @return array<string, mixed>
	 */
	public function handleRelationAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array
	{
		$resolvedUser = $user ?? $this->wire()->user;
		$guestId = (int) ($this->wire()->config->guestUserPageID ?: 40);
		if (
			$resolvedUser->isGuest()
			|| (int) $resolvedUser->id <= 0
			|| (int) $resolvedUser->id === $guestId
		) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Authentication required.',
			];
		}

		$token = trim((string) ($requestPayload['relationToken'] ?? ''));
		if ($token === '') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => 'Missing relationToken.',
			];
		}

		$config = $this->relationSigner()->verify($token, (int) $resolvedUser->id);
		if ($config === null) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Invalid or expired relationToken.',
			];
		}

		$action = strtolower(trim((string) ($requestPayload['action'] ?? 'search')));
		if (in_array($action, self::MUTATING_RELATION_ACTIONS, true)) {
			$reqMethod = strtoupper(trim((string) ($requestPayload['_requestMethod'] ?? (PHP_SAPI !== 'cli' ? ($_SERVER['REQUEST_METHOD'] ?? '') : ''))));
			if ($reqMethod !== '' && $reqMethod !== 'POST') {
				return [
					'ok' => false,
					'status' => 405,
					'error' => 'Method not allowed. POST required.',
				];
			}
			if ((bool) $this->wire()->config->demo) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => 'Mutations are disabled in demo mode.',
				];
			}
			if (!empty($config['readOnly'])) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => 'Relation field is read-only.',
				];
			}
			if ($enforceCsrf && !$this->verifyRequestCsrf($requestPayload)) {
				return [
					'ok' => false,
					'status' => 419,
					'error' => 'CSRF token validation failed.',
				];
			}
		}

		$registry = $this->relations();
		$cardinality = strtolower((string) ($config['cardinality'] ?? 'm2o'));
		$dependsValue = $requestPayload['dependsValue'] ?? null;

		// Resolve dynamic resource switching via `dependsResourceMap` (e.g. `source_kind=page -> template`, `source_kind=entry -> blueprint`)
		$activeResource = strtolower(trim((string) ($config['resource'] ?? 'page')));
		$dependsMap = is_array($config['dependsResourceMap'] ?? null) ? $config['dependsResourceMap'] : [];
		if ($dependsMap !== [] && is_scalar($dependsValue)) {
			$depKey = trim((string) $dependsValue);
			if ($depKey !== '' && isset($dependsMap[$depKey]) && is_string($dependsMap[$depKey])) {
				$activeResource = strtolower(trim($dependsMap[$depKey]));
			}
		}

		$allowedResources = is_array($config['allowedResources'] ?? null)
			? array_values(array_map(static fn($r): string => strtolower(trim((string) $r)), $config['allowedResources']))
			: [];

		// Optional client-selected resource tab inside M2A (strictly validated against signed `allowedResources`)
		$requestedResource = strtolower(trim((string) ($requestPayload['resource'] ?? '')));
		if ($requestedResource !== '' && $requestedResource !== '_all') {
			if ($cardinality === 'm2a') {
				if ($allowedResources !== [] && !in_array($requestedResource, $allowedResources, true)) {
					return [
						'ok' => false,
						'status' => 403,
						'error' => 'Requested resource is not permitted for this polymorphic field.',
					];
				}
				$activeResource = $requestedResource;
			} elseif ($dependsMap !== [] && in_array($requestedResource, array_values($dependsMap), true)) {
				$activeResource = $requestedResource;
			}
		}

		$users = $this->wire()->users;
		$previousUser = $this->wire()->user;
		$switchedUser = false;
		if ((int) $previousUser->id !== (int) $resolvedUser->id) {
			$users->setCurrentUser($resolvedUser);
			$switchedUser = true;
		}

		try {
			if ($action === 'search') {
				$queryParams = [
					'q' => mb_substr(trim((string) ($requestPayload['q'] ?? '')), 0, 250),
					'page' => max(1, (int) ($requestPayload['page'] ?? 1)),
					'limit' => max(1, min(100, (int) ($requestPayload['limit'] ?? $config['limit'] ?? 25))),
					'dependsValue' => $dependsValue,
					'exclude' => is_array($requestPayload['exclude'] ?? null) ? array_slice($requestPayload['exclude'], 0, 500) : [],
				];

				if ($cardinality === 'm2a' && ($requestedResource === '' || $requestedResource === '_all')) {
					$targets = $allowedResources !== [] ? $allowedResources : [$activeResource];
					$mergedItems = [];
					$totalCount = 0;
					$hasMoreAny = false;
					$perResourceLimit = max(5, (int) ceil($queryParams['limit'] / max(1, count($targets))));
					foreach ($targets as $resName) {
						if (!$registry->has($resName)) {
							continue;
						}
						$sub = $registry->get($resName)->query(
							array_replace($queryParams, ['limit' => $perResourceLimit]),
							$config
						);
						foreach ($sub['items'] as $item) {
							$mergedItems[] = $item->toArray();
						}
						$totalCount += $sub['total'];
						$hasMoreAny = $hasMoreAny || $sub['hasMore'];
					}

					return [
						'ok' => true,
						'status' => 200,
						'resource' => '_all',
						'items' => $mergedItems,
						'total' => $totalCount,
						'hasMore' => $hasMoreAny,
					];
				}

				if (!$registry->has($activeResource)) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => sprintf('Unknown relation resource "%s".', $activeResource),
					];
				}

				$res = $registry->get($activeResource)->query($queryParams, $config);

				return [
					'ok' => true,
					'status' => 200,
					'resource' => $activeResource,
					'items' => array_map(static fn(RelationItem $i): array => $i->toArray(), $res['items']),
					'total' => $res['total'],
					'hasMore' => $res['hasMore'],
				];
			}

			if ($action === 'tree') {
				if (!$registry->has($activeResource)) {
					return ['ok' => false, 'status' => 422, 'error' => 'Unknown relation resource.'];
				}
				$parentId = $requestPayload['parentId'] ?? ($config['parentId'] ?? 0);
				$nodes = $registry->get($activeResource)->tree(
					is_numeric($parentId) ? (int) $parentId : (string) $parentId,
					$config
				);

				return [
					'ok' => true,
					'status' => 200,
					'items' => array_map(static fn(RelationItem $i): array => $i->toArray(), $nodes),
				];
			}

			if ($action === 'hydrate') {
				$rawValues = is_array($requestPayload['values'] ?? null) ? array_slice($requestPayload['values'], 0, 500) : [];
				if ($cardinality === 'm2a') {
					$tokens = array_values(array_map('strval', $rawValues));
					$items = $registry->hydrateMorphTokens($tokens, $allowedResources, $config);
				} else {
					if (!$registry->has($activeResource)) {
						return ['ok' => false, 'status' => 422, 'error' => 'Unknown relation resource.'];
					}
					$cleanVals = [];
					foreach ($rawValues as $rv) {
						if (is_int($rv) || is_string($rv)) {
							$cleanVals[] = $rv;
						}
					}
					$items = $registry->get($activeResource)->hydrate($cleanVals, $config);
					if ($items === [] && $cleanVals !== [] && $dependsMap !== []) {
						foreach (array_unique(array_values($dependsMap)) as $altRes) {
							$altName = strtolower(trim((string) $altRes));
							if ($altName === '' || $altName === $activeResource || !$registry->has($altName)) {
								continue;
							}
							$items = $registry->get($altName)->hydrate($cleanVals, $config);
							if ($items !== []) {
								break;
							}
						}
					}
				}

				return [
					'ok' => true,
					'status' => 200,
					'items' => array_map(static fn(RelationItem $i): array => $i->toArray(), $items),
				];
			}

			if ($action === 'o2m_list') {
				$targetRes = strtolower(trim((string) ($config['targetResource'] ?? $activeResource)));
				$ownerId = $config['ownerId'] ?? ($requestPayload['ownerId'] ?? '');
				$foreignField = trim((string) ($config['foreignField'] ?? ''));
				if (!$registry->has($targetRes) || $ownerId === '' || $ownerId === 0 || $foreignField === '') {
					return ['ok' => true, 'status' => 200, 'items' => [], 'total' => 0, 'hasMore' => false];
				}
				$res = $registry->get($targetRes)->queryReverse(
					is_int($ownerId) ? $ownerId : (string) $ownerId,
					$foreignField,
					[
						'q' => trim((string) ($requestPayload['q'] ?? '')),
						'page' => max(1, (int) ($requestPayload['page'] ?? 1)),
						'limit' => max(1, min(100, (int) ($requestPayload['limit'] ?? $config['limit'] ?? 25))),
					],
					$config
				);

				return [
					'ok' => true,
					'status' => 200,
					'items' => array_map(static fn(RelationItem $i): array => $i->toArray(), $res['items']),
					'total' => $res['total'],
					'hasMore' => $res['hasMore'],
				];
			}

			if ($action === 'quick_create') {
				if (empty($config['creatable'])) {
					return ['ok' => false, 'status' => 403, 'error' => 'Inline creation is not enabled for this field.'];
				}
				$createRes = $cardinality === 'o2m'
					? strtolower(trim((string) ($config['targetResource'] ?? $activeResource)))
					: $activeResource;
				if (!$registry->has($createRes)) {
					return ['ok' => false, 'status' => 422, 'error' => 'Unknown relation resource.'];
				}
				$createPayload = is_array($requestPayload['payload'] ?? null) ? $requestPayload['payload'] : $requestPayload;
				$created = $registry->get($createRes)->quickCreate($createPayload, $config);

				return [
					'ok' => true,
					'status' => 200,
					'item' => $created->toArray(),
				];
			}

			if ($action === 'o2m_link' || $action === 'o2m_unlink') {
				if ($cardinality !== 'o2m') {
					return [
						'ok' => false,
						'status' => 403,
						'error' => 'O2M relation action requires cardinality o2m.',
					];
				}
				if ($action === 'o2m_link' && array_key_exists('allowLink', $config) && !$config['allowLink']) {
					return ['ok' => false, 'status' => 403, 'error' => 'Linking existing records is not enabled for this field.'];
				}
				if ($action === 'o2m_unlink' && array_key_exists('allowUnlink', $config) && !$config['allowUnlink']) {
					return ['ok' => false, 'status' => 403, 'error' => 'Unlinking records is not enabled for this field.'];
				}
				$targetRes = strtolower(trim((string) ($config['targetResource'] ?? $activeResource)));
				$ownerId = $config['ownerId'] ?? '';
				$foreignField = trim((string) ($config['foreignField'] ?? ''));
				$targetVal = $requestPayload['targetValue'] ?? ($requestPayload['id'] ?? '');
				if (!$registry->has($targetRes) || $ownerId === '' || $ownerId === 0 || $foreignField === '' || $targetVal === '') {
					return ['ok' => false, 'status' => 422, 'error' => 'Missing ownerId, foreignField, or targetValue.'];
				}

				$adapter = $registry->get($targetRes);
				$cleanOwner = is_int($ownerId) ? $ownerId : (string) $ownerId;
				$cleanTarget = is_int($targetVal) ? $targetVal : (string) $targetVal;
				$ok = $action === 'o2m_link'
					? $adapter->link($cleanOwner, $foreignField, $cleanTarget, $config)
					: $adapter->unlink($cleanOwner, $foreignField, $cleanTarget, $config);

				if (!$ok) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => 'Operation denied or failed.',
					];
				}

				$refreshed = $adapter->queryReverse($cleanOwner, $foreignField, ['page' => 1, 'limit' => $config['limit'] ?? 25], $config);

				return [
					'ok' => true,
					'status' => 200,
					'items' => array_map(static fn(RelationItem $i): array => $i->toArray(), $refreshed['items']),
					'total' => $refreshed['total'],
					'hasMore' => $refreshed['hasMore'],
				];
			}

			return [
				'ok' => false,
				'status' => 400,
				'error' => sprintf('Unsupported relation action "%s".', $action),
			];
		} catch (\Throwable $e) {
			$isClientException = $e instanceof WireException
				|| $e instanceof \InvalidArgumentException
				|| $e instanceof \DomainException;
			if (!$isClientException) {
				$this->wire()->log->error('React relation error: ' . $e->getMessage());
			}
			$isSafeClientException = $isClientException || (bool) $this->wire()->config->debug;

			return [
				'ok' => false,
				'status' => 422,
				'error' => $isSafeClientException ? $e->getMessage() : $this->_('Relation request failed.'),
			];
		} finally {
			if ($switchedUser) {
				$users->setCurrentUser($previousUser);
			}
		}
	}

	/**
	 * Render a standalone React Island `<div data-inertia-island="..." data-react-island="..." data-props="...">`
	 * and register `ReactInertia.js` / `ReactInertia.css` in ProcessWire `$config->scripts` and `$config->styles`.
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

		$safeComponent = $this->wire()->sanitizer->entities($component);
		$jsonProps = json_encode(
			$props,
			JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_INVALID_UTF8_SUBSTITUTE
		);
		$encodedProps = htmlspecialchars(
			is_string($jsonProps) ? $jsonProps : '{}',
			ENT_QUOTES | ENT_SUBSTITUTE,
			'UTF-8'
		);

		return sprintf(
			'<div data-inertia-island="%s" data-react-island="%s" data-props="%s"></div>',
			$safeComponent,
			$safeComponent,
			$encodedProps
		);
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
			$iconCssDir = rtrim($assetsPath, '/') . '/lucide-icons';
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
		self::$moduleCsvCatalogs = [];
		self::$moduleAssetUrlCache = [];
		$this->registeredViewportModes = [];
		$this->providerRegistry = null;
		$this->relationRegistry = null;
		$this->relationStateSigner = null;
		$this->mediaGateway = null;
		$this->mediaHostsResolved = false;
		$this->formSerializer = null;
		$this->iconManager = null;
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
	 * When the optional `ProcessReactWorkspace` (`Admin > Workspace`) hub module is installed,
	 * includes `launcherUrl`, `launcherScripts`, and the user's accessible `workspaces`.
	 * When `ProcessReactWorkspace` is not installed, omits the cross-module hub navigation so
	 * downstream `ProcessReact` modules execute cleanly as standalone ProcessWire admin pages.
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

		$themeMode = $this->resolveEffectiveThemeMode($user);

		$rootUrl = rtrim((string) ($config->urls->root ?: '/'), '/');

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
			'useInputFocus' => $this->resolveAdminUseInputFocus(),
			'enableKeyboardShortcuts' => (bool) $this->get('enableKeyboardShortcuts'),
			'user' => [
				'id' => (int) $user->id,
				'name' => (string) ($user->name ?: 'guest'),
				'email' => (string) $user->email,
				'isSuperuser' => (bool) $user->isSuperuser(),
			],
			'activeWorkspace' => $activeWorkspace?->toArray(),
			'workspaces' => $accessible,
			'preferences' => $preferences,
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
		return [
			'common' => [
				'save' => $this->_('Save'),
				'saving' => $this->_('Saving...'),
				'cancel' => $this->_('Cancel'),
				'close' => $this->_('Close'),
				'done' => $this->_('Done'),
				'open' => $this->_('Open'),
				'apply' => $this->_('Apply'),
				'applying' => $this->_('Applying...'),
				'executing' => $this->_('Executing...'),
				'reset' => $this->_('Reset'),
				'refresh' => $this->_('Refresh'),
				'refreshing' => $this->_('Refreshing...'),
				'reload' => $this->_('Reload'),
				'search' => $this->_('Search'),
				'clear' => $this->_('Clear'),
				'create' => $this->_('Create'),
				'edit' => $this->_('Edit'),
				'delete' => $this->_('Delete'),
				'remove' => $this->_('Remove'),
				'dismiss' => $this->_('Dismiss'),
				'confirm' => $this->_('Confirm'),
				'confirmExecute' => $this->_('Confirm & Execute'),
				'confirmAcknowledge' => $this->_('I understand the impact of this operation and wish to proceed.'),
				'copy' => $this->_('Copy'),
				'copied' => $this->_('Copied'),
				'copyCommand' => $this->_('Copy command'),
				'export' => $this->_('Export'),
				'import' => $this->_('Import'),
				'loading' => $this->_('Loading...'),
				'actions' => $this->_('Actions'),
				'languages' => $this->_('Languages'),
				'error' => $this->_('Error'),
				'warning' => $this->_('Warning'),
				'notice' => $this->_('Notice'),
				'all' => $this->_('All'),
				'none' => $this->_('None'),
				'yes' => $this->_('Yes'),
				'no' => $this->_('No'),
				'more' => $this->_('More'),
				'noMatches' => $this->_('No matching options'),
				'unavailable' => $this->_('Unavailable'),
			],
			'shell' => [
				'workspace' => $this->_('Workspace'),
				'workspaces' => $this->_('Workspaces'),
				'workspaceDashboard' => $this->_('Workspace Dashboard'),
				'workspaceDashboardSubtitle' => $this->_('All modules, favorites, and customizable dashboard widgets'),
				'currentWorkspaceSection' => $this->_('Current workspace section'),
				'workspaceNavigation' => $this->_('Workspace navigation'),
				'navigation' => $this->_('Navigation'),
				'openNavigationMenu' => $this->_('Open workspace navigation menu'),
				'closeNavigationMenu' => $this->_('Close navigation menu'),
				'searchWorkspaces' => $this->_('Search workspaces...'),
				'searchWorkspacesLabel' => $this->_('Search workspaces'),
				'findWorkspace' => $this->_('Find workspace...'),
				'noMatchingWorkspaces' => $this->_('No matching workspaces'),
				'noMatchingDestinations' => $this->_('No matching destinations found.'),
				'more' => $this->_('More'),
				'quickJump' => $this->_('Quick Jump'),
				'quickSwitcher' => $this->_('Quick Switcher'),
				'quickSwitcherShortcut' => $this->_('Quick Switcher (Cmd/Ctrl+K)'),
				'jumpPlaceholder' => $this->_('Jump to workspace or section...'),
				'returnToAdmin' => $this->_('Panel'),
				'returnToTarget' => $this->_('Return to {target}'),
				'openInWorkspace' => $this->_('Open in Workspace'),
				'openInWorkspaceTooltip' => $this->_('Switch to full-screen Workspace view'),
				'themeLight' => $this->_('Light'),
				'themeDark' => $this->_('Dark'),
				'themeSystem' => $this->_('System'),
				'toggleTheme' => $this->_('Toggle theme'),
				'themeModeTooltip' => $this->_('Theme mode: {mode} (click to switch)'),
				'keyboardShortcuts' => $this->_('Keyboard shortcuts'),
				'dismissErrors' => $this->_('Dismiss errors'),
				'dismissWarnings' => $this->_('Dismiss warnings'),
				'dismissNotices' => $this->_('Dismiss notices'),
			],
			'launcher' => [
				'title' => $this->_('Workspace'),
				'subtitle' => $this->_('Quick overview, live status cards, and all admin workspaces.'),
				'overview' => $this->_('Overview'),
				'operationalOverview' => $this->_('Operational Overview'),
				'directory' => $this->_('All Workspaces'),
				'moduleDirectory' => $this->_('Module Directory'),
				'moduleCategoryDefault' => $this->_('Module'),
				'favorites' => $this->_('Favorites'),
				'pinned' => $this->_('Pinned'),
				'pinnedShortcuts' => $this->_('Pinned Shortcuts'),
				'pinToTopBar' => $this->_('Pin to top bar'),
				'unpinFromTopBar' => $this->_('Unpin from top bar'),
				'pinWorkspace' => $this->_('Pin {title}'),
				'unpinWorkspace' => $this->_('Unpin {title}'),
				'customize' => $this->_('Customize'),
				'customizeLayout' => $this->_('Customize Layout'),
				'doneCustomizing' => $this->_('Done Customizing'),
				'exportLayout' => $this->_('Export Layout'),
				'exportJson' => $this->_('Export JSON'),
				'importLayout' => $this->_('Import Layout'),
				'importLayoutDescription' => $this->_('Apply a saved workspace layout preset (.json) to update your pinned shortcuts, widget order, widths, and visibility.'),
				'importLayoutJsonLabel' => $this->_('Workspace layout preset JSON'),
				'importJson' => $this->_('Import JSON'),
				'applyLayout' => $this->_('Apply Layout'),
				'chooseJsonFile' => $this->_('Choose JSON File'),
				'resetLayout' => $this->_('Reset Layout'),
				'resetDefault' => $this->_('Reset Default'),
				'resetDefaultLayout' => $this->_('Reset Default Layout'),
				'resetDefaultConfirmNotice' => $this->_('Reset your pinned shortcuts, widget order, widths, and hidden widget settings back to defaults?'),
				'chooseWidgets' => $this->_('Choose Widgets'),
				'hiddenWidgetsCount' => $this->_('{count} hidden widget(s)'),
				'hideWidget' => $this->_('Hide widget from dashboard'),
				'hideWidgetNamed' => $this->_('Hide {title}'),
				'toggleWidgetVisibility' => $this->_('Show {title}'),
				'directoryPrompt' => $this->_('Looking for a specific capability or administration tool?'),
				'browseAllModules' => $this->_('Browse all {count} modules'),
				'noWidgetsTitle' => $this->_('No live widgets registered'),
				'noWidgetsDescription' => $this->_('Installed modules have not registered live summary widgets yet. Open the Module Directory to launch any workspace.'),
				'allWidgetsHiddenTitle' => $this->_('All dashboard widgets are hidden'),
				'allWidgetsHiddenDescription' => $this->_('You have hidden all widgets for your profile. Re-enable widgets or reset your layout to view live module status.'),
				'openDirectory' => $this->_('Open Module Directory'),
				'openWorkspaceNamed' => $this->_('Open {title}'),
				'searchModulesPlaceholder' => $this->_('Search modules by name, capability, or topic...'),
				'noWorkspacesFound' => $this->_('No matching workspaces found.'),
				'noMatchingModules' => $this->_('No matching modules found'),
				'noMatchingModulesDescription' => $this->_('No installed module matched your current search or category filter.'),
				'noWorkspacesAvailable' => $this->_('No workspaces available'),
				'noWorkspacesAvailableDescription' => $this->_('Install or enable a workspace module to access it here.'),
				'resetFilter' => $this->_('Reset Filter'),
			],
			'presence' => [
				'justNow' => $this->_('just now'),
				'secondsAgo' => $this->_('{seconds}s ago'),
				'minutesAgo' => $this->_('{minutes}m ago'),
				'updatedBy' => $this->_('Updated by {user}'),
				'remoteSaveNotice' => $this->_('This record was saved in another session while you had it open. Reload the latest version before saving to avoid overwriting those changes.'),
				'reloadLatest' => $this->_('Reload Latest'),
				'dismissWarning' => $this->_('Dismiss remote save warning'),
				'editingSingle' => $this->_('is currently editing this record ({age}).'),
				'editingMultiple' => $this->_('are currently editing this record.'),
				'coordinateHint' => $this->_('Coordinate changes before saving'),
			],
			'viewport' => [
				'searchPlaceholder' => $this->_('Search records...'),
				'searchPlaceholderShort' => $this->_('Search...'),
				'filters' => $this->_('Filters'),
				'filterViews' => $this->_('Filter view'),
				'filterOptions' => $this->_('Filter options...'),
				'clearFilters' => $this->_('Clear filters'),
				'columns' => $this->_('Columns'),
				'toggleColumns' => $this->_('Toggle Columns'),
				'resetColumns' => $this->_('Reset columns'),
				'savedViews' => $this->_('Saved Views'),
				'saveView' => $this->_('Save View'),
				'deleteSavedView' => $this->_('Delete saved view'),
				'deleteSavedViewConfirm' => $this->_('Delete the saved view "{label}"?'),
				'presetNamePlaceholder' => $this->_('Preset name...'),
				'bulkActions' => $this->_('Bulk actions'),
				'selectAllRows' => $this->_('Select all rows'),
				'selectedCount' => $this->_('{count} selected'),
				'orderColumn' => $this->_('Order'),
				'clickToEditInline' => $this->_('Click to edit inline'),
				'emptyTitle' => $this->_('No records found'),
				'emptyDescription' => $this->_('Try adjusting your search or filter criteria.'),
				'noItemsYet' => $this->_('No items yet'),
				'emptySearchHint' => $this->_('Try changing your search or filters.'),
				'networkError' => $this->_('Network error while updating this list.'),
				'previousPage' => $this->_('Previous'),
				'nextPage' => $this->_('Next'),
				'pageSummary' => $this->_('Page {page} of {totalPages}'),
				'totalItems' => $this->_('{count} items'),
				'newItem' => $this->_('New Item'),
				'quickEdit' => $this->_('Quick Edit'),
				'quickEditTitle' => $this->_('Quick Edit: {title}'),
				'quickEditSubtitle' => $this->_('Edit key fields without leaving this list.'),
				'saveChanges' => $this->_('Save Changes'),
			],
			'form' => [
				'required' => $this->_('Required'),
				'unsavedChanges' => $this->_('You have unsaved changes.'),
				'unsavedChangesTitle' => $this->_('Unsaved changes'),
				'discardUnsavedNotice' => $this->_('Leaving or reloading this page will discard the edits you have not saved.'),
				'discardAndLeave' => $this->_('Discard & Leave'),
				'previousStep' => $this->_('Previous'),
				'nextStep' => $this->_('Next Step'),
				'validationErrors' => $this->_('Please review the highlighted fields.'),
				'addRow' => $this->_('Add item'),
				'noItemsSelected' => $this->_('No items selected.'),
				'searchRelations' => $this->_('Search items...'),
				'selectPlaceholder' => $this->_('Select...'),
				'quickColumnPresets' => $this->_('Quick column presets'),
				'closeFieldSettings' => $this->_('Close field settings'),
				'languageTabSwitchHint' => $this->_('Click to switch this field · Double-click to switch all fields'),
				'now' => $this->_('Now'),
				'today' => $this->_('Today'),
				'clearDate' => $this->_('Clear date'),
				'copySecret' => $this->_('Copy secret'),
				'generateNewSecret' => $this->_('Generate new secret'),
				'generate' => $this->_('Generate'),
				'moreSubmitActions' => $this->_('More submit actions'),
				'signaturePad' => $this->_('Signature pad'),
				'signAboveHint' => $this->_('Sign above inside the pad'),
			],
			'keyvalue' => [
				'key' => $this->_('Key'),
				'value' => $this->_('Value'),
				'addRow' => $this->_('Add Row'),
				'removeRow' => $this->_('Remove row'),
				'removeRowNamed' => $this->_('Remove {key}'),
				'removeRowIndexed' => $this->_('Remove row {index}'),
				'keyForRow' => $this->_('{label} for row {index}'),
				'valueForRow' => $this->_('{label} for {key}'),
				'valueForRowIndexed' => $this->_('{label} for row {index}'),
				'moveUp' => $this->_('Move row {index} up'),
				'moveDown' => $this->_('Move row {index} down'),
				'duplicateKey' => $this->_('Duplicate key "{key}". Each key must be unique.'),
				'reservedKey' => $this->_('"{key}" is a reserved key name.'),
				'invalidKeyPattern' => $this->_('"{key}" does not match the required key format.'),
				'pairCount' => $this->_('{count} pair(s)'),
				'pairCountMax' => $this->_('{count} / {max}'),
				'emptyPairs' => $this->_('No key-value pairs'),
			],
			'relation' => [
				'selectItem' => $this->_('Select item...'),
				'selectItems' => $this->_('Select items...'),
				'noResults' => $this->_('No matching items found.'),
				'noMatchingPages' => $this->_('No matching pages found.'),
				'noSelectablePages' => $this->_('No selectable pages found.'),
				'loadingOptions' => $this->_('Loading options...'),
				'filterOptions' => $this->_('Filter options...'),
				'filterAvailableItems' => $this->_('Filter available items'),
				'filterAvailablePlaceholder' => $this->_('Filter available...'),
				'filterSelectedItems' => $this->_('Filter selected items'),
				'filterSelectedPlaceholder' => $this->_('Filter selected...'),
				'searchPagesHierarchy' => $this->_('Search pages or browse hierarchy below...'),
				'searchModalPlaceholder' => $this->_('Search by title, slug, ID, or path...'),
				'moveUp' => $this->_('Move up'),
				'moveDown' => $this->_('Move down'),
				'quickCreate' => $this->_('Quick create'),
				'creating' => $this->_('Creating...'),
				'createAndSelect' => $this->_('Create & Select'),
				'titleLabel' => $this->_('Title'),
				'slugLabel' => $this->_('Name / Slug (optional)'),
				'referenceColumn' => $this->_('Reference'),
				'typeStatusColumn' => $this->_('Type / Status'),
				'linkExisting' => $this->_('Link existing'),
				'unlink' => $this->_('Unlink'),
				'unlinkNamed' => $this->_('Unlink {label}'),
			],
			'media' => [
				'dropImages' => $this->_('Click to choose images, paste, or drag and drop'),
				'dropFiles' => $this->_('Click to choose files, paste, or drag and drop'),
				'chooseImage' => $this->_('Choose image'),
				'chooseFile' => $this->_('Choose file'),
				'chooseImages' => $this->_('Choose images'),
				'chooseFiles' => $this->_('Choose files'),
				'dropOrPaste' => $this->_('Drop or paste'),
				'dropToUpload' => $this->_('Drop to upload'),
				'dropToReplace' => $this->_('Drop file to replace'),
				'addImages' => $this->_('Add images'),
				'addFiles' => $this->_('Add files'),
				'replace' => $this->_('Replace'),
				'replacing' => $this->_('Replacing...'),
				'uploading' => $this->_('Uploading {count} item(s)...'),
				'uploadProgress' => $this->_('Uploading {name} ({percent}%)'),
				'uploadFailed' => $this->_('Upload failed.'),
				'maxSizeHint' => $this->_('Max {size}'),
				'maxFilesHint' => $this->_('Up to {count} items'),
				'maxFilesReached' => $this->_('Maximum file limit ({max}) reached.'),
				'singleReplaceLimit' => $this->_('Only one file can be dropped when replacing an item.'),
				'singleLimitHint' => $this->_('Single item'),
				'itemCount' => $this->_('{count} item(s)'),
				'viewGrid' => $this->_('Grid view'),
				'viewTable' => $this->_('Table view'),
				'dragToReorder' => $this->_('Drag or use arrow keys to reorder {name}'),
				'inspectorTitle' => $this->_('Edit Media Details'),
				'inspectorDescription' => $this->_('Configure alt text, multi-language descriptions, tags, focal point, crop, and metadata.'),
				'tabDetails' => $this->_('Details'),
				'tabFocus' => $this->_('Focal Point'),
				'tabStudio' => $this->_('Crop & Transform'),
				'tabCustom' => $this->_('Custom Fields'),
				'altLabelImage' => $this->_('Alt text / description'),
				'altLabelFile' => $this->_('Description'),
				'altPlaceholderImage' => $this->_('Describe this image for screen readers and SEO...'),
				'altPlaceholderFile' => $this->_('Add file description...'),
				'missingAlt' => $this->_('Missing alt'),
				'langProgress' => $this->_('{filled}/{total} langs'),
				'showAllLanguages' => $this->_('All languages'),
				'compactLanguages' => $this->_('Single tab'),
				'tagsLabel' => $this->_('Tags'),
				'tagsPlaceholder' => $this->_('Type a tag and press Enter...'),
				'suggestedTags' => $this->_('Suggested tags'),
				'selectSuggestedTag' => $this->_('Select a tag below...'),
				'inspectorSections' => $this->_('Inspector sections'),
				'initCropSelection' => $this->_('Select crop area'),
				'focusPoint' => $this->_('Focal point'),
				'focusHint' => $this->_('Click anywhere on the image to set the focal point used by smart crops.'),
				'focusPosition' => $this->_('Top {top}% · Left {left}%'),
				'zoomLabel' => $this->_('Zoom'),
				'resetFocus' => $this->_('Center focus'),
				'cropPreviews' => $this->_('Smart crop previews'),
				'cropRatioFree' => $this->_('Free'),
				'cropRatioOriginal' => $this->_('Original'),
				'applyCrop' => $this->_('Apply crop'),
				'clearSelection' => $this->_('Clear selection'),
				'rotateLeft' => $this->_('Rotate -90°'),
				'rotateRight' => $this->_('Rotate +90°'),
				'rotate180' => $this->_('Rotate 180°'),
				'flipHorizontal' => $this->_('Flip horizontal'),
				'flipVertical' => $this->_('Flip vertical'),
				'transforming' => $this->_('Applying image transform...'),
				'studioHint' => $this->_('Drag on the image to select a crop area, or use quick rotate and flip actions.'),
				'dimensions' => $this->_('Dimensions'),
				'fileSize' => $this->_('File size'),
				'extension' => $this->_('Format'),
				'colorPalette' => $this->_('Extracted palette'),
				'analyzeColors' => $this->_('Extract colors'),
				'copiedColor' => $this->_('Copied {hex}'),
				'copyUrl' => $this->_('Copy URL'),
				'copiedUrl' => $this->_('URL copied'),
				'openOriginal' => $this->_('Open original'),
				'downloadOriginal' => $this->_('Download'),
				'moreActions' => $this->_('More actions'),
				'cancelUpload' => $this->_('Cancel upload'),
				'cropMoveHandle' => $this->_('Crop selection. Drag to move, or use arrow keys to nudge.'),
				'cropMovedStatus' => $this->_('Crop selection updated'),
				'pendingUpload' => $this->_('Pending save'),
				'markedForDeletion' => $this->_('Marked for deletion'),
				'undoDelete' => $this->_('Undo'),
				'removeFile' => $this->_('Remove {name}'),
				'editAsset' => $this->_('Inspect & edit {name}'),
				'previousAsset' => $this->_('Previous item'),
				'nextAsset' => $this->_('Next item'),
				'tablePreview' => $this->_('File'),
				'tableMetadata' => $this->_('Alt / Description'),
				'tableTags' => $this->_('Tags'),
				'tableSize' => $this->_('Info'),
			],
			'link' => [
				'typeLabel' => $this->_('Link type'),
				'chooseImage' => $this->_('Choose image'),
				'chooseVideo' => $this->_('Choose video'),
				'chooseFile' => $this->_('Choose file'),
				'dropHint' => $this->_('Drop'),
				'uploadProgress' => $this->_('Upload progress'),
				'cancelUpload' => $this->_('Cancel upload'),
				'openMedia' => $this->_('Open {name}'),
				'replaceMedia' => $this->_('Replace {name}'),
				'replaceFile' => $this->_('Replace file'),
				'clearMedia' => $this->_('Remove {name}'),
				'removeFile' => $this->_('Remove file'),
				'clearTarget' => $this->_('Clear selected target'),
				'searchEntries' => $this->_('Search entries'),
				'searchPages' => $this->_('Search pages'),
				'cancelSearch' => $this->_('Cancel search'),
				'emailTarget' => $this->_('Email address'),
				'phoneTarget' => $this->_('Phone number'),
				'urlTarget' => $this->_('Link URL or #anchor'),
				'clearUrl' => $this->_('Clear link target'),
				'labelInput' => $this->_('Link label'),
				'labelPlaceholder' => $this->_('Link label (optional)'),
				'optionsButton' => $this->_('Link options'),
				'searching' => $this->_('Searching...'),
				'noResults' => $this->_('No matching items found.'),
				'optionsHeading' => $this->_('Link Options'),
				'closeOptions' => $this->_('Close link options'),
				'openTarget' => $this->_('Open Target'),
				'targetSelf' => $this->_('Same tab (_self)'),
				'targetBlank' => $this->_('New tab (_blank)'),
				'anchorFragment' => $this->_('Anchor Fragment (#)'),
				'queryParams' => $this->_('Query Parameters (?)'),
				'titleAttribute' => $this->_('Title Attribute'),
				'titlePlaceholder' => $this->_('Accessible link title (optional)'),
				'relAttribute' => $this->_('Rel Attribute'),
				'invalidPhone' => $this->_('Phone number may only contain digits (0-9) and an optional leading + sign.'),
				'invalidEmail' => $this->_('Enter a valid email address.'),
				'unsafeUrl' => $this->_('Unsafe URL protocol is not allowed.'),
				'mediaUnavailable' => $this->_('Media upload context is not available for this field.'),
				'invalidMedia' => $this->_('Selected file is not supported.'),
				'uploadFailed' => $this->_('Failed to upload file.'),
				'editMedia' => $this->_('Edit media details & alt text for {name}'),
				'editMediaDetails' => $this->_('Edit media details, alt text & focal point'),
				'newTabBadge' => $this->_('New tab'),
				'titleBadge' => $this->_('title'),
			],
			'icon' => [
				'selected' => $this->_('Selected icon'),
				'selectPlaceholder' => $this->_('Select an icon...'),
				'customize' => $this->_('Customize'),
				'clear' => $this->_('Clear icon'),
				'resetStyle' => $this->_('Reset Style'),
				'size' => $this->_('Size (px)'),
				'strokeWidth' => $this->_('Stroke Width'),
				'color' => $this->_('Icon Color'),
				'colorAuto' => $this->_('Auto (currentColor)'),
				'customColor' => $this->_('Custom icon hex color'),
				'background' => $this->_('Badge Background & Shape'),
				'bgNone' => $this->_('No background'),
				'customBg' => $this->_('Custom badge hex color'),
				'pickerTitle' => $this->_('Icons'),
				'tabIcons' => $this->_('Icons'),
				'tabAppearance' => $this->_('Appearance'),
				'searchPlaceholder' => $this->_('Search icons...'),
				'searchCountPlaceholder' => $this->_('Search {count} icons'),
				'categoryFilter' => $this->_('Category'),
				'allCategories' => $this->_('All categories'),
				'styleFilter' => $this->_('Style'),
				'styleAll' => $this->_('All styles'),
				'styleOutline' => $this->_('Outline'),
				'styleFilled' => $this->_('Filled'),
				'popular' => $this->_('Popular'),
				'allIcons' => $this->_('All icons'),
				'noMatches' => $this->_('No matching icons found.'),
				'countSingular' => $this->_('icon'),
				'countPlural' => $this->_('icons'),
			],
		];
	}

	/**
	 * Resolve the active user locale code (`'en'` for default/unconfigured language).
	 */
	public function resolveActiveLocale(): string
	{
		$user = $this->wire()->user;
		if (isset($user->language) && $user->language instanceof Page && $user->language->id) {
			$langName = trim((string) $user->language->name);
			if ($langName !== '' && $langName !== 'default') {
				return $langName;
			}
		}

		return 'en';
	}

	/**
	 * Resolve a safe, dot-free translation namespace key for a module or component object.
	 */
	public function resolveTranslationNamespace(object $source): string
	{
		if ($source === $this) {
			return 'core';
		}

		if (method_exists($source, 'translationNamespace')) {
			$raw = trim((string) $source->translationNamespace());
			if ($raw !== '' && !str_contains($raw, '@anonymous')) {
				return (string) preg_replace('/[^A-Za-z0-9_-]/', '_', $raw);
			}
		}

		$class = $source::class;
		if (str_contains($class, '@anonymous')) {
			$ref = new \ReflectionClass($source);
			$parent = $ref->getParentClass();
			$base = $parent !== false ? $parent->getShortName() : 'Module';

			return $base . '_Anonymous';
		}

		if ($source instanceof Wire) {
			$className = trim($source->className());
			if ($className !== '' && !str_contains($className, '@anonymous')) {
				return (string) preg_replace('/[^A-Za-z0-9_-]/', '_', $className);
			}
		}

		$short = ($pos = strrpos($class, '\\')) !== false ? substr($class, $pos + 1) : $class;

		return (string) preg_replace('/[^A-Za-z0-9_-]/', '_', $short);
	}

	/**
	 * Resolve and flatten static UI translations contributed by `$source` (`translations()` / `___translations()`).
	 *
	 * ProcessWire's native `LanguageTranslator` and `WireHooks` overrides run first;
	 * if an active non-English locale has a companion `<ModuleDir>/languages/{locale}.csv` pack that has
	 * not yet been imported into ProcessWire's database, untranslated phrases fall back to that CSV pack.
	 *
	 * @return array<string, string>
	 */
	public function resolveModuleTranslations(object $source): array
	{
		if (!method_exists($source, 'translations') && !method_exists($source, '___translations')) {
			return [];
		}

		$raw = is_callable([$source, 'translations']) ? $source->translations() : [];
		if (!is_array($raw) || $raw === []) {
			return [];
		}

		$flat = self::flattenTranslationCatalog($raw);
		if ($flat === []) {
			return [];
		}

		return $this->applyModuleCsvFallback($source, $flat);
	}

	/**
	 * Apply per-module `languages/{locale}.csv` fallback for any phrase still equal to its English source.
	 *
	 * @param array<string, string> $flat
	 * @return array<string, string>
	 */
	private function applyModuleCsvFallback(object $source, array $flat): array
	{
		$locale = strtolower(trim($this->resolveActiveLocale()));
		if ($locale === '' || $locale === 'en' || preg_match('/^[a-z0-9_-]+$/', $locale) !== 1) {
			return $flat;
		}

		$ref = new \ReflectionClass($source);
		$classFile = $ref->getFileName();
		if (!is_string($classFile) || $classFile === '') {
			return $flat;
		}

		$csvPath = self::findModuleLanguageCsv($classFile, $locale);
		if ($csvPath === null) {
			return $flat;
		}

		$catalog = self::loadModuleLanguageCsv($csvPath);
		if ($catalog['global'] === []) {
			return $flat;
		}

		$fileKey = basename($classFile);
		$fileMap = $catalog['byFile'][$fileKey] ?? [];

		foreach ($flat as $key => $val) {
			if (isset($fileMap[$val])) {
				$flat[$key] = $fileMap[$val];
			} elseif (isset($catalog['global'][$val])) {
				$flat[$key] = $catalog['global'][$val];
			}
		}

		return $flat;
	}

	/**
	 * Locate `<ModuleDir>/languages/{locale}.csv` starting from `$classFile`.
	 */
	private static function findModuleLanguageCsv(string $classFile, string $locale): ?string
	{
		if (preg_match('/^[a-zA-Z0-9_-]{1,32}$/', $locale) !== 1) {
			return null;
		}
		$dir = dirname($classFile);
		for ($depth = 0; $depth < 4; $depth++) {
			$langDir = $dir . '/languages';
			$candidate = $langDir . '/' . $locale . '.csv';
			if (!is_link($langDir) && !is_link($candidate) && is_file($candidate) && is_readable($candidate)) {
				$realLangDir = realpath($langDir);
				$realCandidate = realpath($candidate);
				if (
					$realLangDir !== false
					&& $realCandidate !== false
					&& str_starts_with($realCandidate, rtrim($realLangDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)
				) {
					return $realCandidate;
				}
			}
			$parent = dirname($dir);
			if ($parent === $dir || basename($dir) === 'modules') {
				break;
			}
			$dir = $parent;
		}

		return null;
	}

	/**
	 * Parse and cache a ProcessWire `LanguagePorter` CSV pack (`en,{locale},description,file,hash`).
	 *
	 * @return array{byFile: array<string, array<string, string>>, global: array<string, string>}
	 */
	private static function loadModuleLanguageCsv(string $csvPath): array
	{
		if (isset(self::$moduleCsvCatalogs[$csvPath])) {
			return self::$moduleCsvCatalogs[$csvPath];
		}

		$byFile = [];
		$global = [];
		$fp = @fopen($csvPath, 'rb');
		if (is_resource($fp)) {
			try {
				$header = fgetcsv($fp, 0, ',', '"', '\\');
				if (is_array($header)) {
					while (($row = fgetcsv($fp, 0, ',', '"', '\\')) !== false) {
						$enText = (string) ($row[0] ?? '');
						$localized = (string) ($row[1] ?? '');
						if ($enText === '' || $localized === '') {
							continue;
						}
						$rowFile = basename(str_replace('\\', '/', (string) ($row[3] ?? '')));
						if ($rowFile !== '') {
							$byFile[$rowFile][$enText] = $localized;
						}
						if (!isset($global[$enText])) {
							$global[$enText] = $localized;
						}
					}
				}
			} finally {
				fclose($fp);
			}
		}

		return self::$moduleCsvCatalogs[$csvPath] = [
			'byFile' => $byFile,
			'global' => $global,
		];
	}

	/**
	 * Flatten nested associative translation maps into dot-notation string keys.
	 *
	 * @param array<int|string, mixed> $entries
	 * @return array<string, string>
	 */
	public static function flattenTranslationCatalog(array $entries, string $prefix = ''): array
	{
		$flat = [];
		foreach ($entries as $key => $value) {
			if (!is_string($key)) {
				continue;
			}
			$cleanKey = trim($key);
			if ($cleanKey === '') {
				continue;
			}
			$fullKey = $prefix === '' ? $cleanKey : ($prefix . '.' . $cleanKey);
			if (is_array($value) && !array_is_list($value)) {
				foreach (self::flattenTranslationCatalog($value, $fullKey) as $nestedKey => $nestedVal) {
					$flat[$nestedKey] = $nestedVal;
				}
			} elseif (is_string($value) || is_int($value) || is_float($value)) {
				$flat[$fullKey] = html_entity_decode((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
			}
		}

		return $flat;
	}

	/**
	 * Build shared Inertia `OnceProp` (and classic island `$config->js('InertiaShared')`) translation props.
	 *
	 * Uses locale-scoped `OnceProp` keys (`rw_i18n:{locale}:{namespace}`) so:
	 *  - Subsequent Inertia navigations within the same module send 0 bytes (`X-Inertia-Except-Once-Props`).
	 *  - Cross-module Inertia navigations fetch only the newly visited module's dictionary once.
	 *  - Language switches automatically invalidate the client's `exceptOnce` key and load the new locale.
	 *
	 * @return array<string, mixed>
	 */
	public function buildInertiaI18nSharedProps(?object $host = null): array
	{
		$locale = $this->resolveActiveLocale();
		$inertia = $this->inertia();

		$shared = [
			'i18nLocale' => fn(): string => $this->resolveActiveLocale(),
			'i18n.core' => $inertia->once(fn(): array => $this->resolveModuleTranslations($this))
				->as("rw_i18n:{$locale}:core"),
		];

		if ($host instanceof Process) {
			$shared['i18n.InputfieldTiptap'] = $inertia->once(function (): array {
				$modules = $this->wire()->modules;
				$tiptap = $modules->isInstalled('InputfieldTiptap')
					? $modules->getModule('InputfieldTiptap', ['noPermissionCheck' => true])
					: null;
				if (!is_object($tiptap)) {
					$tiptap = new InputfieldTiptap();
					$this->wire($tiptap);
				}

				return $this->resolveModuleTranslations($tiptap);
			})->as("rw_i18n:{$locale}:InputfieldTiptap");
		}

		if ($host !== null && $host !== $this) {
			$ns = $this->resolveTranslationNamespace($host);
			if ($ns !== '' && $ns !== 'core') {
				$shared['i18n.' . $ns] = $inertia->once(fn(): array => $this->resolveModuleTranslations($host))
					->as("rw_i18n:{$locale}:{$ns}");
			}
		}

		return $shared;
	}

	/**
	 * Build the Root View data array (`locale`, `title`, `themeMode`, `useInputFocus`, `colorSchemeCss`, `styles`, `scripts`)
	 * consumed by `site/modules/React/views/admin.php`.
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
		$themeMode = $this->resolveEffectiveThemeMode($user);

		return [
			'locale' => $locale,
			'title' => $title,
			'themeMode' => $themeMode,
			'useInputFocus' => $this->resolveAdminUseInputFocus(),
			'colorSchemeCss' => $this->resolveAdminColorSchemeCss(),
			'styles' => $this->resolveInertiaStyleAssets($extraStyles),
			'scripts' => $this->resolveInertiaScriptAssets($extraScripts),
		];
	}

	/**
	 * Resolve the active Light/Dark/System theme mode synchronized with `AdminThemeUikit`
	 * (`$config->AdminThemeUikit['noDarkMode']`, `$user->meta('adminDarkMode')`, `defaultStyleName`, and `defaultTheme`).
	 */
	public function resolveEffectiveThemeMode(?User $user = null): string
	{
		$config = $this->wire()->config;
		$adminSettings = $config->AdminThemeUikit;
		if (is_array($adminSettings) && !empty($adminSettings['noDarkMode'])) {
			return 'light';
		}

		$resolvedUser = $user ?? $this->wire()->user;
		if (!$resolvedUser->isGuest() && (int) $resolvedUser->id > 0) {
			try {
				$darkMeta = $resolvedUser->meta('adminDarkMode');
				if ($darkMeta === 1 || $darkMeta === '1') {
					return 'dark';
				}
				if ($darkMeta === 0 || $darkMeta === '0') {
					return 'light';
				}
				if ($darkMeta === -1 || $darkMeta === '-1') {
					return 'system';
				}
			} catch (\Throwable) {
				// Fall through to module defaults
			}
		}

		$modules = $this->wire()->modules;
		try {
			$themeConfig = $modules->getConfig('AdminThemeUikit');
			if (is_array($themeConfig) && isset($themeConfig['defaultStyleName']) && is_string($themeConfig['defaultStyleName'])) {
				$styleName = strtolower(trim($themeConfig['defaultStyleName']));
				if ($styleName === 'dark' || $styleName === 'light') {
					return $styleName;
				}
			}
		} catch (\Throwable) {
			// Fall through to workspace defaultTheme
		}

		$fallback = (string) ($this->get('defaultTheme') ?: 'system');

		return in_array($fallback, ['light', 'dark', 'system'], true) ? $fallback : 'system';
	}

	/**
	 * Determine whether `AdminThemeUikit` has the `useInputFocus` toggle enabled.
	 */
	public function resolveAdminUseInputFocus(): bool
	{
		$modules = $this->wire()->modules;
		try {
			$themeConfig = $modules->getConfig('AdminThemeUikit');
			if (is_array($themeConfig) && is_array($themeConfig['defaultToggles'] ?? null)) {
				return in_array('useInputFocus', $themeConfig['defaultToggles'], true);
			}
		} catch (\Throwable) {
			return false;
		}

		return false;
	}

	/**
	 * Strip CSS block comments (including trailing unclosed `/*` comments) outside quoted strings
	 * and neutralize `</style` sequences so inline `<style>` injection is safe and uncorrupted.
	 */
	private function sanitizeInlineStyleSheet(string $css): string
	{
		$withoutComments = (string) preg_replace(
			'~("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')|/\*.*?(?:\*/|$)~s',
			'$1',
			$css
		);
		$safe = (string) preg_replace('~<\s*/\s*style~i', '<\\/style', $withoutComments);

		return trim($safe);
	}

	/**
	 * Extract ProcessWire's `--pw-*` color scheme CSS variables from `AdminThemeUikit`
	 * (`themes/default/admin-custom.css`, `defaultCustomCssFile`, `defaultMainColor`, and `defaultCustomCss`)
	 * so full-page `ProcessReact` Inertia workspaces inherit the user's selected color palette
	 * without loading UIkit CSS or jQuery.
	 */
	public function resolveAdminColorSchemeCss(): string
	{
		$config = $this->wire()->config;
		$modules = $this->wire()->modules;
		$rootPath = rtrim((string) ($config->paths->root ?: dirname(__DIR__, 3)), '/');

		$mainColor = 'red';
		$customLight = '';
		$customDark = '';
		$use2Colors = false;
		$customCssFile = '';
		$customInlineCss = '';

		try {
			$themeConfig = $modules->getConfig('AdminThemeUikit');
			if (is_array($themeConfig)) {
				if (!empty($themeConfig['defaultMainColor']) && is_string($themeConfig['defaultMainColor'])) {
					$mainColor = strtolower($themeConfig['defaultMainColor']);
				}
				if (!empty($themeConfig['defaultMainColorCustom']) && is_string($themeConfig['defaultMainColorCustom'])) {
					$customLight = trim($themeConfig['defaultMainColorCustom']);
				}
				if (!empty($themeConfig['defaultMainColorCustomDark']) && is_string($themeConfig['defaultMainColorCustomDark'])) {
					$customDark = trim($themeConfig['defaultMainColorCustomDark']);
				}
				if (is_array($themeConfig['defaultToggles'] ?? null)) {
					$use2Colors = in_array('use2Colors', $themeConfig['defaultToggles'], true);
				}
				if (!empty($themeConfig['defaultCustomCssFile']) && is_string($themeConfig['defaultCustomCssFile'])) {
					$customCssFile = trim($themeConfig['defaultCustomCssFile']);
				}
				if (!empty($themeConfig['defaultCustomCss']) && is_string($themeConfig['defaultCustomCss'])) {
					$customInlineCss = trim($themeConfig['defaultCustomCss']);
				}
			}
		} catch (\Throwable) {
			// Keep default classic color scheme
		}

		$candidates = [
			"{$rootPath}/wire/modules/AdminTheme/AdminThemeUikit/themes/default/admin-custom.css",
		];

		$baseCss = '';
		foreach ($candidates as $path) {
			if (is_file($path) && is_readable($path)) {
				$contents = (string) file_get_contents($path);
				if ($contents !== '') {
					$strippedFonts = (string) preg_replace('/@font-face\s*\{[^}]*\}/s', '', $contents);
					$baseCss = $this->sanitizeInlineStyleSheet($strippedFonts);
					break;
				}
			}
		}

		if ($baseCss === '') {
			$baseCss = ":root {\n\tcolor-scheme: light dark;\n\t--pw-main-color: #eb1d61;\n\t--pw-text-color: light-dark(#111, white);\n\t--pw-muted-color: light-dark(rgba(0, 0, 0, 0.55), rgba(255, 255, 255, 0.6));\n\t--pw-border-color: light-dark(rgba(0, 0, 0, 0.16), #444);\n\t--pw-main-background: light-dark(#eee, #222);\n\t--pw-inputs-background: light-dark(#f8f8f8, #161616);\n\t--pw-blocks-background: light-dark(white, black);\n\t--pw-button-background: light-dark(var(--pw-text-color), var(--pw-main-color));\n\t--pw-button-color: light-dark(var(--pw-blocks-background), var(--pw-text-color));\n\t--pw-button-border: transparent;\n\t--pw-button-muted-background: light-dark(#737373, #404040);\n\t--pw-button-muted-color: light-dark(var(--pw-blocks-background), var(--pw-text-color));\n\t--pw-button-muted-border: transparent;\n\t--pw-button-hover-background: light-dark(var(--pw-main-color), var(--pw-text-color));\n\t--pw-button-hover-color: var(--pw-blocks-background);\n\t--pw-button-hover-border: transparent;\n\t--pw-menu-item-background-hover: var(--pw-main-background);\n\t--pw-masthead-background: var(--pw-blocks-background);\n\t--pw-masthead-active-color: var(--pw-text-color);\n\t--pw-masthead-text-color: var(--pw-muted-color);\n\t--pw-masthead-border-color: var(--pw-border-color);\n\t--pw-masthead-logo-color: var(--pw-main-color);\n\t--pw-masthead-menu-item-background-hover: var(--pw-menu-item-background-hover);\n\t--pw-masthead-input-background: var(--pw-inputs-background);\n\t--pw-masthead-input-color: var(--pw-text-color);\n\t--pw-masthead-input-border: var(--pw-border-color);\n\t--pw-modal-color: rgba(0, 0, 0, 0.7);\n\t--pw-error-inline-text-color: light-dark(#cd0a0a, #ff7171);\n\t--pw-code-color: light-dark(#0173b0, #e7e695);\n\t--pw-code-background: light-dark(var(--pw-inputs-background), #3c3c3c5e);\n\t--pw-alert-text-color: var(--pw-text-color);\n\t--pw-alert-primary: var(--pw-main-background);\n\t--pw-alert-warning: light-dark(#fff0be, #d57f00);\n\t--pw-alert-success: light-dark(#c1e7cd, #139472);\n\t--pw-alert-danger: light-dark(#fee6e6, #8a1919);\n\t--pw-notes-background: light-dark(#ffd, #bdbdbd33);\n\t--pw-button-radius: 99999px;\n\t--pw-input-radius: 0;\n}";
		}

		$chunks = [$baseCss];

		if ($customCssFile !== '' && !str_contains($customCssFile, '//') && !str_contains($customCssFile, "\0")) {
			$realRoot = realpath($rootPath);
			$rawSkinPath = $rootPath . '/' . ltrim($customCssFile, '/');
			$candidateSkin = !is_link($rawSkinPath) ? realpath($rawSkinPath) : false;
			if (
				$realRoot !== false
				&& $candidateSkin !== false
				&& str_starts_with($candidateSkin, $realRoot . DIRECTORY_SEPARATOR)
				&& strtolower(pathinfo($candidateSkin, PATHINFO_EXTENSION)) === 'css'
				&& is_file($candidateSkin)
				&& is_readable($candidateSkin)
			) {
				$skinCss = $this->sanitizeInlineStyleSheet((string) file_get_contents($candidateSkin));
				if ($skinCss !== '') {
					$chunks[] = $skinCss;
				}
			}
		}

		$mainColors = [
			'red' => '#eb1d61',
			'green' => '#14ae85',
			'blue' => '#2380e6',
			'custom' => $customLight !== '' ? $customLight : '#eb1d61',
		];
		$mainColorCode = $mainColors[$mainColor] ?? $mainColors['red'];
		if (str_starts_with($mainColorCode, '#') && ctype_alnum(ltrim($mainColorCode, '#'))) {
			if ($mainColor === 'custom' && $use2Colors && str_starts_with($customDark, '#') && ctype_alnum(ltrim($customDark, '#'))) {
				$chunks[] = ":root { --pw-main-color: light-dark({$mainColorCode}, {$customDark}); }";
			} else {
				$chunks[] = ":root { --pw-main-color: {$mainColorCode}; }";
			}
		}

		if ($customInlineCss !== '') {
			$cleanInline = $this->sanitizeInlineStyleSheet($customInlineCss);
			if ($cleanInline !== '') {
				$chunks[] = $cleanInline;
			}
		}

		return implode("\n", $chunks);
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

		/** @var InputfieldCheckbox $shortcuts */
		$shortcuts = $modules->get('InputfieldCheckbox');
		$shortcuts->attr('name', 'enableKeyboardShortcuts');
		$shortcuts->label = $this->_('Enable Keyboard Shortcuts');
		$shortcuts->description = $this->_('Enable Cmd/Ctrl+K command palette and keyboard navigation inside React workspaces.');
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
