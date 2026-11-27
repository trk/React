# React API Reference

Developer and AI agent reference for `ProcessWire\React`, the optional `ProcessWire\ProcessReactWorkspace` hub module, the 15 companion ProcessWire modules, and the `Totoglu\React` namespace. For architectural overview and subsystem guides, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and [docs/README.md](./docs/README.md).

---

## 1. Core Module (`ProcessWire\React`) & Optional Hub (`ProcessWire\ProcessReactWorkspace`)

`React` extends `ProcessWire\WireData` and implements `Module`, `ConfigurableModule`. Autoloaded (`singular => true, autoload => true`), defines no admin page, registered in ProcessWire Fuel as `$wire->react`, and registers `Totoglu\React` -> `__DIR__ . '/src/'` in `React::__construct()`.

`ProcessReactWorkspace` (`extends Totoglu\React\Workspace\WorkspaceLauncherProcess` -> `ProcessReact`, `autoload => false`) is shipped in the same directory as an **optional** `Process` module (`Admin > Workspace`, `/processwire/workspace/`). Downstream `ProcessReact` modules require only `'React'` and operate standalone when `ProcessReactWorkspace` is not installed, or join the unified workspace hub and widget dashboard automatically when `ProcessReactWorkspace` is installed.

### Static Constants & Lifecycle Methods
- `React::getModuleInfo()['version']` (`int`) — Canonical release version read from module metadata; companion submodules maintain independent `getModuleInfo()['version']` values that bump together with `React` only when the submodule itself changes.
- `React::CAPABILITIES` (`list<string>`) — Supported pull-discovery subsystem keys: `['workspace', 'icons', 'commandSearch', 'providers', 'relations', 'linkResolvers', 'media', 'viewportModes']`.
- `React::instance(?Wire $context = null): self` — Resolves the wired singleton from `$wire->react` or `$modules->getModule('React', ['noPermissionCheck' => true])`.
- `React::checkAccess(array $data = []): bool` — Grants access to `/_react/presence` and `/processwire/workspace/` for superusers or authenticated users who can access at least one registered workspace.
- `$react->isWorkspaceHubInstalled(): bool` — Returns `true` when the optional `ProcessReactWorkspace` hub module is installed.
- `$react->discoverCapabilityModules(): array` — Indexes installed modules declaring `'reactCapabilities'` in cached `getModuleInfo('*')` metadata (`moduleInfoCache`) without including or instantiating module files.
- `$react->pullCapabilities(string $capability): array` — Lazily loads installed modules declaring `$capability` via `getModule($moduleName, ['noPermissionCheck' => true, 'noInstall' => true, 'noThrow' => true])` once per capability/module.
- `$react->resetCapabilityCache(): void` — Clears cached capability index and pull-state flags.
- `$react->shouldRegisterFieldHooks(?string $requestPath = null, ?bool $isCli = null): bool` — Gates `FieldIntegrationHooks` registration off frontend HTTP requests while keeping CLI, admin pages, and `/_react/*` routes active.
- `React::deferModuleRegistration(Wire $module, ?callable $workspaceRegistrar = null, ?callable $widgetRegistrar = null): void` — Defers workspace and widget registration until `workspaces()` or `widgets()` is requested.
- `React::deferShellLayoutRegistration(Wire $module, callable $registrar): void` — Defers custom `ShellLayoutRegistry` descriptor registration until `shellLayouts()` is requested (hooks `React::registerShellLayouts`).
- `React::deferCommandSearchRegistration(Wire $module, callable $registrar): void` — Defers `CommandSearchRegistry` provider registration until `commandSearch()` is requested (hooks `React::registerCommandSearch`).
- `React::deferProviderRegistration(Wire $module, callable $registrar): void` — Defers `ReactDataProviderInterface` factory registration until `providers()` is requested.
- `React::deferRelationRegistration(Wire $module, callable $registrar): void` — Defers `RelationResourceInterface` registration until `relations()` is requested.
- `React::deferMediaHostRegistration(Wire $module, callable $registrar): void` — Defers `MediaHostAdapterInterface` registration until `media()` is requested.
- `React::deferViewportModeRegistration(Wire $module, callable $registrar): void` — Defers pluggable viewport layout mode registration until `getRegisteredViewportModes()` is requested (hooks `React::registerViewportModes`).
- `React::deferLinkResolverRegistration(Wire $module, callable $registrar): void` — Defers custom link resolver registration until `resolveCustomLink()` or `linkResolverTypes()` is requested (hooks `React::registerLinkResolvers`).
- `React::forgetSharedWorkspace(string $id): void` / `React::forgetSharedWidget(string $id): void` / `React::forgetSharedViewportMode(string $mode): void` / `React::forgetDeferredRegistrations(Wire $module): void` — Removes shared workspace, widget, and viewport mode registrations and detaches deferred `React::defer*Registration()` hooks on module uninstall.

### Hookable & Extension Methods (`React.module.php`)
Direct registration helpers and ProcessWire hookable extension points (`___*`) exposed by `ProcessWire\React`:

- `public function registerWorkspace(WorkspaceDefinition|array $definition): self` — Registers an application workspace descriptor with `ProcessReactWorkspace`.
- `public function registerWidget(WorkspaceWidgetDefinition|array $definition): self` — Registers a dashboard widget descriptor with `ProcessReactWorkspace`.
- `public function registerViewportMode(string $mode, string $moduleName, string $providerContract = '', array $meta = []): void` — Registers a pluggable viewport layout mode backed by a `MarkupReactViewport` module class.
- `public function isViewportModesResolved(): bool` / `public function ___registerViewportModes(): void` / `public function getRegisteredViewportModes(): array` — Pulls `'viewportModes'` capability modules, triggers `React::registerViewportModes`, and returns all registered pluggable viewport modes (`array<string, array{module: string, contract: string, icon: string, label: string}>`).
- `public function ___registerMediaHosts(MediaGateway $gateway): void` — Registers built-in `PageLinkMediaHostAdapter` and lets modules attach custom `MediaHostAdapterInterface` hosts.
- `public function ___registerWorkspaces(WorkspaceRegistry $registry): void` — Lifecycle hook invoked once when `workspaces()` builds the `WorkspaceRegistry`.
- `public function ___registerWidgets(WorkspaceWidgetRegistry $registry): void` — Lifecycle hook invoked once when `widgets()` builds the `WorkspaceWidgetRegistry`.
- `public function ___registerShellLayouts(ShellLayoutRegistry $registry): void` — Hookable extension point invoked once when `shellLayouts()` builds the shell layout registry.
- `public function ___registerCommandSearch(CommandSearchRegistry $registry): void` — Hookable extension point invoked once when `commandSearch()` builds the command palette search registry.
- `public function ___registerProviders(ProviderRegistry $registry): void` — Lifecycle hook invoked once when `providers()` initializes `ReactDataProviderInterface` factories.
- `public function ___registerRelationResources(RelationResourceRegistry $registry): void` — Lifecycle hook invoked once when `relations()` initializes `RelationResourceInterface` adapters.
- `public function ___registerLinkResolvers(): void` / `public function isLinkResolversResolved(): bool` / `public function linkResolverTypes(): array` / `public function registerLinkResolver(string $type, ?callable $resolver): self` / `public function resolveCustomLink(string $type, array $normalized, array $options = []): ?array` — Domain-agnostic custom link resolver hook and registry consumed by `InputfieldReactLink::resolveValue()`.
- `public function issuePresenceToken(string $resourceKey, bool $canMarkSaved = true, ?User $user = null): string` / `public function verifyPresenceToken(string $token, ?User $user = null): ?array` — Issues and verifies domain-separated HMAC-SHA256 `presenceToken` envelopes bound to `$user->id` and `resourceKey`.
- `public function ___upgrade($fromVersion, $toVersion): void` — Automatically installs any missing companion modules declared in `getModuleInfo()['installs']` on module upgrades.
- `public function ___install(): void` / `public function ___uninstall(): void` — Module installation and cleanup hooks (`___uninstall()` removes URL hooks, `pages_meta` view prefs, session state, presence/preference caches, and `site/assets/vector-icons/`).
- `public function ___translations(): array` — Hookable translation catalog returned via `$this->i18n()->coreTranslations()` for ProcessWire `LanguageParser`.

### Service Accessors
- `$react->workspaces(): WorkspaceRegistry`
- `$react->widgets(): WorkspaceWidgetRegistry`
- `$react->shellLayouts(): ShellLayoutRegistry`
- `$react->commandSearch(): CommandSearchRegistry`
- `$react->workspacePreferences(): WorkspacePreferenceStore`
- `$react->presence(): EditPresenceStore`
- `$react->providers(): ProviderRegistry`
- `$react->provider(string|array|\Closure|PageArray|ReactDataProviderInterface $source, array $options = []): ReactDataProviderInterface`
- `$react->relations(): RelationResourceRegistry`
- `$react->relationSigner(): RelationStateSigner`
- `$react->media(): MediaGateway`
- `$react->forms(): FormSchemaSerializer`
- `$react->icons(): IconManager`
- `$react->theme(): ThemeManager`
- `$react->gateway(): ReactGatewayRouter`
- `$react->i18n(): TranslationCatalogService`
- `$react->hooks(): FieldIntegrationHooks`
- `$react->controls(): ReactControlRegistry`
- `$react->tokenCodec(): SignedTokenCodec`

### Viewport, Form & Island Helpers
- `$react->viewport(string $mode = 'table'): MarkupReactViewport`
- `$react->table(): MarkupReactTable` / `$react->configureTable(string|array|\Closure|PageArray|ReactDataProviderInterface $provider = '', array $props = []): MarkupReactTable` / `$react->renderTable(string|array|\Closure|PageArray|ReactDataProviderInterface $provider = '', array $props = []): string`
- `$react->cards(): MarkupReactCards` / `$react->configureCards(string|array|\Closure|PageArray|ReactDataProviderInterface $provider = '', array $props = []): MarkupReactCards` / `$react->renderCards(string|array|\Closure|PageArray|ReactDataProviderInterface $provider = '', array $props = []): string`
- `$react->tabs(): MarkupReactTab` / `$react->renderTabs(array $tabs = [], array $props = []): string`
- `$react->serializeForm(InputfieldWrapper $form, array $options = []): array`
- `$react->serializeFormDefinitions(iterable $definitions, array $options = []): array`
- `$react->renderIsland(string $component, array $props = [], array $extraScripts = [], array $extraStyles = []): string`
- `$react->notifyResourceSaved(string $resourceKey, ?User $user = null): void`

### Gateway Action Handlers
- `$react->handleViewportAction(array $requestPayload, bool $enforceCsrf = false): array` (`/_react/viewport`)
- `$react->handleWorkspacePrefsAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array` (`/_react/workspace-prefs`)
- `$react->handlePresenceAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array` (`/_react/presence`)
- `$react->handleRelationAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array` (`/_react/relation`)
- `$react->handleMediaAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null, ?array $uploadedFiles = null): array` (`/_react/media`)
- `$react->handleTiptapAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null, ?array $uploadedFiles = null): array` (`/_react/tiptap`)
- `$react->handleIconsAction(array $params): array` (`/_react/icons`, `GET` `action=query` | `action=hydrate`)
- `$react->handleCommandSearchAction(array $params, ?User $user = null): array` (`/_react/command-search`, `GET` `q` query for workspace-authorized or `page-edit` users, `Cache-Control: no-store, private`)
- `$react->readJsonRequestBody(int $maxBytes = 2097152, int $maxDepth = 64): ?array`
- `$react->verifyRequestCsrf(array $requestPayload): bool`

### Theme, Shell Mode, Assets & `i18n` Helpers
- `$react->resolveShellMode(?Process $process = null): string` — Returns `'workspace'` (for `ProcessReactWorkspace` or `?ws=1` / `_rw_ws=1` / `X-React-Shell: workspace` requests when `ProcessReactWorkspace` is installed) or `'admin'` (classic `Setup > <Module>` access or when `ProcessReactWorkspace` is not installed).
- `$react->isWorkspaceContextRequest(): bool` — Detects active Workspace context across GET/POST/Inertia headers and `Referer`.
- `$react->withWorkspaceQuery(string $url): string` — Appends `ws=1` to local admin module URLs (automatically applied across `$session->redirect()` calls originating from Workspace mode).
- `$react->withoutWorkspaceQuery(string $url): string` — Strips the `ws` workspace-mode query parameter from local admin module URLs while preserving all other query parameters and fragments.
- `$react->resolveLauncherUrl(): string` — Resolves the canonical URL of the `Admin > Workspace` hub page.
- `$react->isShellLayoutsResolved(): bool` / `$react->shellLayouts(): ShellLayoutRegistry` — Returns the lazy registry of `Totoglu\React\Workspace\ShellLayout` built-ins (`topbar` order `10`, `sidebar` order `20`) and registered custom shell descriptors (backing `Totoglu\React\Workspace\ShellLayoutRegistry::register()`, `has()`, `get()`, `all()`, `options()`, `toArray()`, `defaultId()`).
- `$react->isCommandSearchResolved(): bool` / `$react->commandSearch(): CommandSearchRegistry` — Returns the lazy RBAC-scoped `Totoglu\React\Workspace\CommandSearchRegistry` (`register()`, `unregister()`, `has()`, `providerIds()`, `search()`, default `'pages'` `page-edit` provider at order `900` checking `$page->editable()`, query bounds `2..80`, caps `5`/`20`, exception isolation, and `UrlSanitizer::sanitizeSameOriginUrl()` enforcement).
- `$react->siteDefaultShellLayout(): string` / `$react->userShellLayoutOverride(?User $user = null): string` / `$react->resolveEffectiveShellLayout(?User $user = null): string` — Resolves effective shell layout with precedence: user override (`{user-id}.json`) > site `defaultShellLayout` config > `'topbar'`.
- `$react->resolveSidebarCollapsed(?User $user = null): bool` — Resolves the authenticated user's persisted sidebar collapsed rail flag.
- `$react->resolveModuleAssetUrl(string $filename): array`
- `$react->resolveInertiaScriptAssets(array $extraScripts = []): array`
- `$react->resolveInertiaStyleAssets(array $extraStyles = []): array`
- `$react->buildInertiaSharedContext(?Process $process = null, ?WorkspaceDefinition $activeWorkspace = null): array` — Includes user account menu fields (`user.{label,avatarUrl,avatarIcon,viewSiteUrl,profileUrl,logoutUrl}`), `commandSearchEndpoint`, `userThemePreset`, `siteDefaultThemePreset`, `shellLayout`, `userShellLayout`, `siteDefaultShellLayout`, `sidebarCollapsed`, `availableShellLayouts`, and active shell metadata.
- `$react->buildInertiaI18nSharedProps(?object $host = null): array`
- `$react->buildInertiaRootViewData(string $title = 'Workspace', array $extraScripts = [], array $extraStyles = []): array` — Includes `themeMode`, `colorSchemeCss`, and the compiled central `themeCss`.
- `$react->resolveActiveLocale(): string`
- `$react->resolveModuleTranslations(object $source): array`
- `React::flattenTranslationCatalog(array $entries, string $prefix = ''): array`

### Central Theme (`Totoglu\React\Theme`) & Shell Preferences
Site-wide default theme settings (`themePreset`, `themeCustomTokens`, `defaultShellLayout`) live in `React` module config, while authenticated users can override `themeMode` (`light` | `dark` | `system`), `themePreset`, `shellLayout` (or reset back to the site default), and `sidebarCollapsed` in per-user `{user-id}.json` preferences (`WorkspacePreferenceStore`). `ThemePreset` includes distinct `--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, and `--sidebar-ring` surface tokens alongside `--masthead` tokens. Compiled tokens apply uniformly to standalone Workspaces (`views/admin.php` `<style id="rw-theme-tokens">`), embedded module panels, classic Inputfield islands, and portaled overlays (injected into `AdminTheme` head markup in `React::ready()` or inline fallback).
- `ThemeManager::siteDefaultPreset(): ThemePreset` — Site-wide default configured in `React` module settings (`native`, `neutral`, `slate`, `stone`, `ocean`, `indigo`, `teal`, or `custom`).
- `ThemeManager::userPresetOverride(?User $user = null): string` — Per-user preset override stored in `{user-id}.json` (`''` when inheriting site default).
- `ThemeManager::activePreset(?User $user = null): ThemePreset` — Resolves per-user override first, then site default.
- `ThemeManager::activeTokens(?User $user = null): array{light: array<string, string>, dark: array<string, string>}`
- `ThemeManager::resolveThemeTokenCss(?User $user = null): string` — Scoped `light-dark()` + dark-only token stylesheet (empty for `native` or incomplete custom tokens).
- `ThemeManager::compileTokens(array $tokens): string`
- `ThemeManager::resolveEffectiveThemeMode(?User $user = null): string`
- `ThemeManager::resolveAdminColorSchemeCss(): string`
- `ThemeManager::resolveAdminUseInputFocus(): bool`
- `ThemeTokenParser::parse(string $css): array` — Parses Tailwind CSS v4 theme variables (`:root { ... }`, `.dark { ... }`, `@media (prefers-color-scheme: dark) { :root { ... } }`) into an allowlist of color, radius, font, and shadow tokens (supporting dark-only tokens); rejects `url()`, `expression()`, `@import`, escapes, and markup-breaking characters.
- `/_react/workspace-prefs` `action=set_theme_mode` (`themeMode`) — Available to authenticated admin/workspace users (`React::checkAccess() || page-edit`); persists `themeMode` to `{user-id}.json` and syncs `$user->meta('adminDarkMode')`.
- `/_react/workspace-prefs` `action=set_theme_preset` (`themePreset`) — Available to authenticated admin/workspace users (`React::checkAccess() || page-edit`); persists a personal override in `{user-id}.json` (or clears override on `''` / `'default'`) and returns `userThemePreset`, `siteDefaultThemePreset`, `themePreset`, and `themeCss`.
- `/_react/workspace-prefs` `action=set_shell_layout` (`shellLayout`) — Persists a registered layout ID (`'topbar'`, `'sidebar'`, or custom registered ID) or clears override on `''` / `'default'` (rejects unregistered IDs with `422`), returning `shellLayout`, `userShellLayout`, and `siteDefaultShellLayout`.
- `/_react/workspace-prefs` `action=set_sidebar_collapsed` (`sidebarCollapsed`) — Persists boolean sidebar rail collapse preference for the authenticated user.

### Security & Markup Helpers
- `Totoglu\React\Security\AccessGuard::isAuthenticated(User $user): bool` / `isAuthenticatedOrSuperuser(User $user): bool` / `canEditFieldByLanguage(ProcessWire $wire, Page $page, Field $field, ?User $user = null): bool` — Canonical authentication and language-permission (`page-edit-lang-*` / `page-edit-lang-none`) checks used by all `/_react/*` gateways, providers, registries, and per-user stores.
- `Totoglu\React\Security\UrlSanitizer::sanitizeSameOriginUrl(string $url, string $currentHost = '', ?bool $isHttps = null): string` — Validates site-relative paths (`/`, `./`, `../`) and matching-origin HTTP(S) URLs while rejecting `javascript:`, `data:`, `mailto:`, `tel:`, `#`, protocol-relative (`//`), userinfo, and external origins.
- `Totoglu\React\Support\IslandMarkup::render(string $component, array $props, array $attributes = [], string $innerHtml = ''): string` — Canonical React island mount markup used by every Inputfield, viewport, tab container, and `renderIsland()`.

---

## 2. Inertia Base Classes & Translation Trait (`Totoglu\React\Inertia`)

- **`ProcessReact`** (`abstract class ProcessReact extends Totoglu\Inertia\ProcessInertia implements Module`): Base class for dual-context admin `Process` modules (`Setup > <Module>` native `Process::execute` inside any active `AdminTheme` and `Admin > Workspace` full-screen hub mode from a single React component). Uses `InteractWithReact` and overrides `___executeNavJSON(array $options = []): string|array` so empty/`./` root/Overview flyout item URLs always resolve to a clickable admin process root path.
- **`InteractWithReact`** (trait composing `InteractWithInertia` + `InteractWithReactTranslations`): Runs initial `Setup > <Module>` requests (`shellMode === 'admin'`) natively through ProcessWire's `wire/core/admin.php` -> `Process::execute` lifecycle via `EmbeddedAdminPageResponse` (theme-agnostic across `AdminThemeUikit`, `AdminThemeDefault`, `AdminThemeReno`, and custom `AdminTheme` modules), while running `Admin > Workspace` (`?ws=1`, `shellMode === 'workspace'`) through `views/admin.php` and handling `X-Inertia` SPA transitions in both modes. Also provides `buildAdminNavJSON(array $items, array $options = []): string|array`, `resolveAdminNavIcon(string $icon, string $fallbackIcon = 'circle', bool $requireRegistered = false): string`, and `resolveAdminProcessRootUrl(): string` for consistent `Setup > <Module>` flyout navigation.
- **`EmbeddedAdminPageResponse`** (`final class EmbeddedAdminPageResponse extends Totoglu\Inertia\PageResponse`): Inline `Process::execute` response adapter that enqueues ordered `ReactInertia.css/js` and module scripts into `$config->styles` / `$config->scripts`, injects `--pw-*` tokens via `AdminTheme::addExtraMarkup('head', ...)`, clears redundant classic breadcrumbs/headlines, and returns `<div id="app">` markup without overriding `AdminTheme` output.
- **`InputfieldReact`** (`abstract class InputfieldReact extends Totoglu\Inertia\InputfieldInertia`): Base class for React Inputfields (`InputfieldReactCondition`, `InputfieldReactKeyValue`, `InputfieldReactLink`, `InputfieldReactIcon`, `AbstractInputfieldReactRelation`). Uses `InteractWithReactTranslations` and merges `ReactInertia.css` + `ReactInertia.js` + `getModuleScriptAssets()`.
- **`InteractWithReactTranslations`** (trait): Provides `translationNamespace(): string`, hookable `___translations(): array`, and `buildReactTranslationSharedProps(): array` emitting locale-scoped Inertia `OnceProp` catalogs (`rw_i18n:{locale}:{namespace}`) resolved strictly via ProcessWire's native `LanguageTranslator` (`languages/{locale}.csv` files serve as `LanguagePorter` import packs, with zero runtime CSV file fallback).

---

## 3. Vector Icon System (`InputfieldReactIcon`, `IconManager`, `ReactIconValue`)

### `Totoglu\React\Icon\IconManager`
Loads `dist/vector-icons.json` (`5,491` outline + `1,054` filled = `6,545` vector icons across `41` categories, popular list, search tags, and shorthand icon aliases).

| Method | Signature | Description |
|---|---|---|
| `loadCatalog` | `public static function loadCatalog(): array` | Loads and caches `dist/vector-icons.json` once per PHP worker. |
| `count` / `filledCount` / `totalVariantsCount` | `public function count(): int` | Returns outline family count (`5491`), filled count (`1054`), or combined count (`6545`). |
| `getCategories` | `public function getCategories(): array` | Returns `list<array{id: string, label: string, count: int}>`. |
| `resolveCanonicalName` | `public static function resolveCanonicalName(string $raw): string` | Resolves canonical names, `-filled` / `:filled` suffixes, `rwv--*` prefixes, and shorthand aliases (returns `''` if unknown). |
| `hasIcon` | `public function hasIcon(string $raw): bool` | Checks whether a canonical or aliased icon exists in the catalog. |
| `hasFilledVariant` | `public static function hasFilledVariant(string $raw): bool` | Checks whether the resolved canonical icon exposes a filled variant. |
| `formatLabel` | `public static function formatLabel(string $raw): string` | Formats an icon identifier into a human-friendly label (e.g. `'brand-whatsapp'` -> `'WhatsApp'`). |
| `queryCatalog` | `public function queryCatalog(string $query = '', string $category = 'all', string $style = 'all', int $offset = 0, int $limit = 96, bool $includeMeta = false): array` | Paginated search over names, aliases, and tags with category and style (`all` \| `outline` \| `filled`) filtering. |
| `hydrateIcons` | `public function hydrateIcons(array $rawNames): array` | Returns up to 100 `CatalogEntry` definitions keyed by canonical icon name. |
| `normalizeValue` | `public static function normalizeValue(mixed $raw): array` | Normalizes scalar string, JSON string, array, `\stdClass`, or `ReactIconValue` into `{ name, variant, size, color, strokeWidth, background, radius }`. |
| `encodeForStorage` | `public static function encodeForStorage(mixed $raw, array $rawFlags = [], string $prefixMode = 'none'): string` | Encodes scalar (`sparkles`, `heart-filled`, `rwv--sparkles`) or JSON customization string according to field flags. |
| `renderSvgMarkup` / `renderSvg` | `public static function renderSvgMarkup(mixed $raw, array $overrides = []): string` | Renders sanitized inline `<svg>` markup (`Outline` stroke or `Filled` fill). |
| `renderHtmlMarkup` | `public static function renderHtmlMarkup(mixed $raw, array $overrides = []): string` | Renders inline `<svg>` or `<span class="rw-icon-badge">` HTML when `background` is set. |
| `resolveValueObject` / `resolveValue` | `public function resolveValue(mixed $raw, array $overrides = []): ReactIconValue` | Returns a wired `ReactIconValue` object. |
| `registerAdminIcons` | `public static function registerAdminIcons(array $icons): void` | Registers module/navigation `rwv--*` icons for inclusion in `VectorIcons.css`. |
| `isAdminIconRegistered` | `public static function isAdminIconRegistered(string $raw): bool` | Checks whether a canonical or aliased vector icon is registered for `VectorIcons.css` emission. |
| `isAdminVectorIcon` | `public static function isAdminVectorIcon(string $icon): bool` | Checks whether a `Field` or `Template` icon string belongs to the Admin vector icon system. |
| `generateAdminCss` / `ensureAdminCss` | `public function generateAdminCss(): string` | Pulls `'icons'` capability modules and generates `site/assets/vector-icons/VectorIcons.css` `mask-image` rules (stamped with `rw-reg-sig:`, `rw-cap-sig:`, and `rw-count:`) for Templates, Fields, Admin `page_icon` pages, and registered module icons. |

### `Totoglu\React\Icon\ReactIconValue` (`extends WireData implements \Stringable, \JsonSerializable`)
Properties: `$set` (`'vector'` or `''`), `$name`, `$variant` (`'outline'|'filled'`), `$raw`, `$svg`, `$html`, `$size` (`12..96`), `$color`, `$strokeWidth` (`1.0..3.0`), `$background`, `$radius` (`'none'|'sm'|'md'|'lg'|'full'`), `$customized` (`bool`). Methods: `isEmpty(): bool`, `toArray(): array`, `__toString(): string`.

### `ProcessWire\InputfieldReactIcon` (`extends InputfieldReact`)
Selectable on `FieldtypeText` (`INERTIA_IS_ICON_FIELD = true`). Configurable properties: `allowCustomization` (`bool`), `allowVariant` (`bool`), `allowSize` (`bool`), `allowColor` (`bool`), `allowStrokeWidth` (`bool`), `allowBackground` (`bool`), `previewSize` (`int`), `iconPrefixMode` (`'none'|'vector'|'fa'`), `readOnly` (`bool`). Formats `$page->get($field)` into `ReactIconValue` when `$page->of(true)` while bypassing `TextformatterEntities` JSON corruption.

---

## 4. Media Inputfields & Gateway (`InputfieldReactImage`, `InputfieldReactFile`, `MediaGateway`)

- **`ProcessWire\InputfieldReactImage`** (`extends InputfieldImage implements InertiaSerializable`) & **`ProcessWire\InputfieldReactFile`** (`extends InputfieldFile implements InertiaSerializable`): Use `InteractWithReactMediaInputfield`. Support `ProcessPageEdit` (including Repeaters and `fileSchema` custom fields) and `<SchemaForm />`.
- **`Totoglu\React\Media\UploadedFileValidator` & `MediaGateway`**: `UploadedFileValidator` provides consolidated `finfo_file` MIME inspection, raster dimension/pixel-bomb verification (`MAX_RASTER_AXIS = 16_384`, `MAX_RASTER_PIXELS = 64_000_000`), and strict `DOMDocument` (`LIBXML_NONET`) SVG validation blocking DOCTYPE/ENTITY/PIs, active tags (`script`, `foreignobject`, `iframe`, `embed`, `object`, `applet`, `meta`, `base`, `link`, `handler`, `style`), `on*` attributes, animated dangerous attributes, and unsafe `href`/`xlink:href` URLs. `MediaGateway` signs `mediaToken` envelopes bound to `$user->id` (`host`, `ownerId`, `fieldName`, `extensions`, `maxFiles`, `maxFilesize`, `isImage`), stages uploads in `tempDir` before moving validated files, and handles `upload`, `replace`, `transform` (`crop`, `rotate`, `flip`, `focus`), `inspect` (dominant color & palette via `InterventionImage` when installed), and `clone` at `/_react/media`. Blocks SVG uploads on image fields unless explicitly allowlisted and sanitized against active content.
- **`Totoglu\React\Media\MediaHostAdapterInterface`**: Pluggable host contract (`PageMediaHostAdapter`, `PageLinkMediaHostAdapter`, `PageLinkVirtualHost`, `PageLinkFilesManager`, and downstream entity hosts).

---

## 5. Polymorphic Link Inputfield (`InputfieldReactLink` & `PageLinkMediaHostAdapter`)

- **`ProcessWire\InputfieldReactLink`** (`extends InputfieldReact`, `INERTIA_IS_LINK_FIELD = true`): Supports default target types `page`, `url` (with `#anchor`), strict `tel` (`^\+?[0-9]+$`), `email`, isolated multi-profile media targets (`file`, `image`, `video`, or custom `mediaProfiles` stored under `site/assets/files/{pageId}/links/{fieldName}/` via `PageLinkMediaHostAdapter`), and custom resolver types (e.g., opt-in `record` using canonical `resourceType` and `resourceId` keys registered via `React::registerLinkResolver()` / `React::deferLinkResolverRegistration()`), with customizable `typeLabels` (`array<string, string>`). Normalized link values include `label`, `ariaLabel`, optional multi-language `labels` / `ariaLabels` maps (rendered directly below the destination row once populated and resolved by active `Language`), `target`, `rel`, `anchor`, and `query`, governed by 6 granular config flags (`enableLabel`, `enableAriaLabel`, `enableTarget`, `enableRel`, `enableAnchor`, `enableQuery`).
- Static & instance helpers: `InputfieldReactLink::isLinkField(?Field $field): bool`, `InputfieldReactLink::normalizeFeatureFlags(array $config): array`, `InputfieldReactLink::applyConfigFlags(array $norm, array $config): array`, `InputfieldReactLink::normalizeValue(mixed $value, string $defaultType = 'url'): array`, `InputfieldReactLink::resolveValue(mixed $value, ?Page $ownerPage = null, ?Field $field = null, ?Language $language = null): array`, `InputfieldReactLink::renderLinkMarkup(mixed $value, ?Page $page = null, ?Field $field = null, string $property = ''): string`, and hookable `$inputfield->___isLanguageEditable(Language $lang): bool`.

---

## 6. Key-Value Inputfield, Tabs & Form Schema Serializer

- **`ProcessWire\InputfieldReactKeyValue`** (`extends InputfieldReact`, `INERTIA_IS_KEYVALUE_FIELD = true`): Stores associative JSON objects (`Record<string, string>`) on `FieldtypeText` / `FieldtypeTextarea` with `minItems`, `maxItems`, `keyPattern` (ReDoS-guarded regex), `allowEmptyValues`, and TSV paste support.
- **`ProcessWire\InputfieldReactCondition`** (`extends InputfieldReact implements InputfieldHasArrayValue`, `INERTIA_IS_CONDITION_FIELD = true`): Visual 2-level condition rule builder storing `{ match: 'all'|'any', groups: [{ id, match, negate?, rules: [{ id, field, operator, value, valueSource?: 'field' }] }] }` JSON on `FieldtypeText` / `FieldtypeTextarea` with categorized field picker (`group`, `icon`, `description`, `placeholder`, `sourceOnly`, `targetOnly`, `comparableTypes`, `allowCustomValue`), `allowFieldComparison`, `allowNegate`, `showSummary`, `allowRawExpression`, `showLabel`, `heading`, extensible `DynamicBlockOptionsSource` (`optionsKey`, `typeMap`, `fallbackToTextWhenNoOptions`, `allowCustomKey`), `layout` (`auto`|`inline`|`compact`), `maxGroups`, `maxRulesPerGroup`, `emptyMessage`, and isolated `dist/InputfieldReactCondition.js` bundle.
- **`Totoglu\React\Condition\ConditionNormalizer`** & **`Totoglu\React\Condition\ConditionEvaluator`**: Backend rule tree normalizer (`parseFlatExpression()` supporting `|` pipe lists into `in`/`not_in`, `serializeFlatExpression()`, `normalizeTree()`, `normalizeFieldSpecs()`, `encodeTree()`, `formatHumanSummary()`, `renderSummaryMarkup()`) and domain-agnostic evaluator (`ConditionEvaluator::evaluate($tree, array|callable $context, array $options = []): bool`) supporting all 21 operators + aliases, group `negate`, `valueSource === 'field'`, dot-path lookup, `fieldAliases`, callable resolvers, `allowWildcards`, and `customOperators`.
- **`ProcessWire\MarkupReactTab`** (`extends InputfieldFieldset implements InertiaSerializable`): WAI-ARIA tab group container (`line`, `segmented`, `vertical`) with `addTab()`, `lazyLoad`, error count badges, and `showIf`.
- **`Totoglu\React\Form\FormSchemaSerializer`**: `serialize(InputfieldWrapper $wrapper, array $options = []): array`, `serializeDefinitions(iterable $definitions, array $options = []): array`, and `appendDeleteTab(InputfieldWrapper $form, array $config = []): void` supporting `surface: 'card'|'plain'` (rendering top-level multi-tab navigation flush above `<Card data-rw-form-card="">` via `[data-rw-card-tabs="above"]`), `WireTab` metadata preservation (`icon`, `confirmDelete`, `showIf`/`hideIf`/`conditions`, `collapsed`, skipping `collapsedHidden`), declarative `'deleteTab'` configuration (appending a `WireTab` or `MarkupReactTab` `[Configuration | Delete]` confirmation checkbox processed on `Save` while respecting existing `data-confirm-delete="1"` tabs), `presenceKey` + signed `presenceToken` co-edit banners, `dirtyGuard`, `rwControl` / `data-rw-control` Inputfield opt-ins, and canonical controls `text`, `textarea`, `number`, `email`, `url`, `tel`, `phone` (international calling-code E.164 control backed by `IntlCatalog`), `date`, `time`, `datetime`, `daterange`, `color`, `tags`, `combobox` (plus built-in catalog aliases `country` / `countries`, `timezone`, `currency_code`), `unit_number` (including `unitVariant: 'currency'`, `currency` / `money` alias, `units` / `currencies`, `defaultUnit`, `precision`, `locale`), `segmented` (single and `multiple: true`), `spacing`, `range`, `range_slider`, `colspan`, `otp`, `password`, `markdown`, `condition_builder`, `rating`, `signature`, `calculation`, `select`, `radios`, `checkboxes`, `asmselect`, `multiselect`, `checkbox`, `toggle`, `repeater`, `keyvalue`, `link`, `icon`, `relation` (`m2o`/`m2m`/`o2m`/`m2a`), `file`, `image`, and `tiptap`.
- **`Totoglu\React\Form\ReactControlRegistry`** (`$react->controls()`): Universal classic `Inputfield` <-> React control bridge. Any classic ProcessWire `Inputfield` configured with `rwControl` / `data-rw-control` renders on Page Edit / User Edit / Field Setup as an isolated island (`InputfieldReactCondition` via `dist/InputfieldReactCondition.js` for `condition_builder`; `ReactWorkspace/ExtraFieldControl` via `dist/ReactExtraFields.js` for `phone`, `color`, `tags`, `combobox` / `country` / `countries` / `timezone` / `currency_code`, `unit_number` / `currency`, `segmented`, `spacing`, `otp`, `password`, `markdown`; or `ReactWorkspace/FieldControl` via `dist/SchemaForm.js` + optional `dist/ReactCalendar.{js,css}` for `date`, `time`, `datetime`, `daterange`, `range`, `range_slider`, `colspan`, `rating`, `signature`, `calculation`, `toggle`, `slug`, `secret`, `repeater`), exposes compatible `React Control` panels in `Setup > Fields` (`Field::getConfigInputfields`), forwards `rw*` config onto `Field::getInputfield()`, normalizes array / `{name}_present` clears / ISO datetimes in `Inputfield::processInput`, and handles `FieldtypeText` `sleepValue`, `formatValue`, and `markupValue`.
- **`Totoglu\React\Support\IntlCatalog`**: Shared read-only ISO 3166-1 alpha-2 (`countryOptions()`, `phoneCountryItems()`, `dialCode()`, `isValidCountryCode()`), E.164 (`normalizePhoneE164()`, `isValidPhoneE164()`), ISO 4217 (`currencyOptions()`, `currencySymbol()`, `isValidCurrencyCode()`), and PHP `DateTimeZone::listIdentifiers()` (`timezoneOptions()`, `isValidTimezone()`) catalog helpers.

---

## 7. Rich Text Editor, ProcessWire Link/Image Modals & Editorial Mini-Blocks (`InputfieldTiptap` & `TextformatterTiptapMiniBlocks`)

- **`ProcessWire\InputfieldTiptap`** (`extends InputfieldTextarea implements ConfigurableModule, InertiaSerializable`, `INERTIA_IS_MARKUP_FIELD = true`): Full-width Tiptap v3 (`ProseMirror`) rich text editor registered in `FieldtypeTextarea::getFieldSetups` (`contentTypeHTML`) with selectable profile presets (`preset`: `'core' | 'editor' | 'canvas' | 'blocks'`), layered settings (`defaultsJSON`, `settingsField`, `settingsJSON` with `replace_*` / `add_*` / `append_*`), `toolbar` (including `link`, `unlink`, `anchor`, `image`, `table`, `insertblock`), `bubbleToolbar` (guaranteed in chromeless `inlineMode` unless explicitly disabled), `headlines`, `features` (`imgUpload`, `imgResize`, `slashMenu`, `blockHandles` opt-in), `imageFields`, `miniBlocks`, native top-layer `<dialog>` modals for ProcessWire page/file/anchor links (`ProcessPageEditLink` settings) and `Pageimage` `-is` variation/crop/HiDPI/alignment/caption selection (`ProcessPageEditImageSelect` settings), multi-language tabs enforcing `___isLanguageEditable(Language $lang): bool`, `getModuleStyleAssets()`, and `TiptapContentPolicy` HTML sanitization.
- **`Totoglu\React\Tiptap\TiptapPresetCatalog`** & **`TiptapAssetResolver`**: Define the 4 editor profiles (`core`, `editor`, `canvas`, `blocks`) and resolve minimal ordered capability bundles (`core` plus `editor`, `canvas`, `blocks`, while keeping `dialogs` strictly lazy/on-demand) from preset defaults, explicit toolbar/feature customizations, and HTML markers in existing field values so previously saved fields never lose tables, images, task lists, anchors, or inline content blocks.
- **`Totoglu\React\Tiptap\TiptapConfigFormBuilder`**: Builds the shared module and field configuration forms (`preset` radios with progressive `[data-rw-tiptap-preset-sync]` preset sync, `toolbar`, `bubbleToolbar`, `features` including `blockHandles`, `miniBlocks`, `toggles`, height bounds).
- **`Totoglu\React\Tiptap\TiptapMediaLinkGateway`** (`$react->tiptap()`, `/_react/tiptap`): HMAC-signed (`tiptapToken` via `SignedTokenCodec`, bound to `$user->id`) endpoint serving `pages` (search + hierarchical page tree + multi-language `localUrl($lang)` + `urlType` relative paths), `files`, `images` (Page, `RepeaterPage`, cross-page, and `MediaHostAdapterInterface` `mediaToken` hosts), `inspectImage`, and CSRF-guarded `POST` `resize` (`-is` `Pageimage` variations, crop, rotate/flip, `hidpi`, `noSizeAttrs`) and `upload` (`WireUpload`, `$sanitizer->validateFile()`, raster pixel bounds).
- **`ProcessWire\TextformatterTiptapMiniBlocks`** (`extends Textformatter`): Renders `[data-tiptap-block="{name}"]` nodes via `./site/templates/tiptap/{name}.php` when present, falling back to clean semantic HTML5.
- **`Totoglu\React\Tiptap\MiniBlockRegistry` / `MiniBlockHtmlSanitizer` / `MiniBlockRenderer` / `TiptapContentPolicy` / `DomFragmentHelper`**: Shared UTF-8/HTML5 `DOMDocument` fragment helper (`DomFragmentHelper`), depth-1 flat mini-block invariants, attribute schema validation, ProcessWire `<figure>`/`<figcaption>`, `align_*`, `hidpi`, named `<a id="...">` anchors, plain-text length calculation, and full-text search extraction.

---

## 8. Relational Inputfields (`M2O`, `M2M`, `O2M`, `M2A`) & `/_react/relation`

- **`ProcessWire\InputfieldReactM2O`**, **`InputfieldReactM2M`**, **`InputfieldReactO2M`**, **`InputfieldReactM2A`** (`extends AbstractInputfieldReactRelation`): Standalone relational Inputfields operating with or without `FieldtypePage`.
- **`RelationResourceRegistry` (`$react->relations()`)**: Built-in adapters `page`, `template`, `field`, `user`, `role`, `permission`, `language`, `module`, plus lazy `deferRelationRegistration()` adapters. Supports `dependsOn` and `dependsResourceMap` cascading filters.

---

## 9. Viewports & Data Providers (`MarkupReactViewport`, `MarkupReactTable`, `MarkupReactCards`)

- **`MarkupReactViewport`** (`extends Totoglu\Inertia\MarkupInertia`): Signs `stateToken` via `SignedTokenCodec` (`HMAC-SHA256`) and executes `fetch`, `search`, `filter`, `reset_filters`, `sort`, `page`, `switch_view_mode`, `select_view`, `save_view`, `delete_view`, `toggle_column`, `reset_columns`, `bulk_action`, `row_action`, `toolbar_action`, `update_field`, `toggle_field`, `reorder`, `quick_create`, `open_quick_edit`, `close_quick_edit`, `save_quick_edit`, and `export`, alongside pluggable extension mode hooks (`modeSupportsProvider`, `modeMutatingActions`, `modeMutableStateKeys`, `modeSignedState`, `applyModeSignedState`, `modeConfigureOptions`, `modeQueryLimit`, `modeLoadRecords`, `modeExecuteAction`, `modeInertiaData`). Supports explicit `allowedViewModes`, `viewModeMeta`, `modeState`, `saveViewEnabled` (`bool`), `columnPickerEnabled` (`bool`), responsive `display => 'pills'` filter strips (`counts`, `icons`, `totalCount`), multi-option `createActions`, toolbar-level `toolbarActions`, table-level `rowValign` (`'middle'|'top'|'bottom'`), and column-level presentation schemas (`type`, `primary`, `showLabel`, `shape`, `width`, `align`, `valign`, `mono`, `tabular`, `nowrap`, `truncate`, `copyable`, `subtitleMono`, `maxBadges`).
- **`ReactColumn`** (`Totoglu\React\Data\ReactColumn`): Immutable fluent column builder (`text()`, `icon()`, `image()`, `badge()`, `boolean()`, `code()`, `link()`, `number()`, `date()`, plus `->primary()`, `->shape()`, `->showLabel()`, `->width()`, `->align()`, `->sortable()`, `->truncate()`, `->copyable()`, `->editable()`) accepted in `ArrayDataProvider`, `PagesDataProvider`, `MarkupReactViewport`, and downstream viewport column configurations. Visual columns (`icon`, `image`) render independently of the resolved primary column with size-clamped icons preserving chosen colors/variants/backgrounds and compact defaults.
- **`ReactRecord`** (`Totoglu\React\Data\ReactRecord`): Immutable record DTO supporting `icon` (`string|array`), `thumb` (`array{src: string, darkSrc?: string, aspect?: string, alt?: string, count?: int}|null`), `subtitle`, `badges`, `meta` (`array<string, mixed>` extension bag for pluggable viewport modes), and per-column structured `cells` (`icon`, `thumb`, `label`, `href`, `external`, `copyValue`, `subtitle`, `subtitleMono`, `badges`, `maxBadges`, `mono`, `tabular`, `nowrap`, `truncate`) rendered consistently across `MarkupReactTable`, `MarkupReactCards`, and pluggable viewports.
- **Built-in Providers (`Totoglu\React\Provider`):** `PagesDataProvider` (`pages:...`, implements `ReactExportProvider` for chunked CSV/JSON export, supporting `columnSchemas()`, `iconField`, `thumbField`, `subtitleField`, and `showTemplateIcon`) and `ArrayDataProvider` (`array:...`, supporting `columnSchemas()` and record/cell visual descriptors).
- **Capability Contracts (`Totoglu\React\Contract`):** `ReactDataProviderInterface`, `ReactFieldSchemaProvider`, `ReactBulkFieldsProvider`, `ReactQuickEditProvider`, `ReactRecordActionsProvider`, `ReactSummaryProvider`, `ReactViewsProvider`, `ReactReorderProvider`, `ReactExportProvider`.

---

## 10. Compiled Frontend Bundles (`dist/`), Typed SDK (`@pw/react/*`) & Delta CSS

- **`dist/ReactInertia.js` & `dist/ReactInertia.css`**: Core React 19 + Inertia v3 + Tailwind CSS v4 + `@base-ui/react` UI primitives (`UI`, `DynamicIcon`, `sanitizeHref`, `sanitizeSameOriginUrl`, `sanitizeAssetUrl`, `useTranslations`, `registerPages`, `registerIslands`, `mountIslands`, generic `loadRuntimeScript` / `loadRuntimeStyle` / `preloadRuntimeScript` / `ensureMediaStyleLoaded`, and non-clobbering lazy asset loaders) plus domain-agnostic CSS contracts (`[data-rw-prose-root]`, `[data-rw-table]`, `[data-rw-card-tabs="above"]`, responsive `[data-rw-meta-grid]` / `[data-rw-meta-item]` / `[data-rw-meta-label]` / `[data-rw-meta-value]` / `[data-rw-meta-copy]` with `[data-copied="1"]` feedback, `[data-rw-ref-list]` / `[data-rw-ref-item]`, and `[data-rw-rev-table]` / `[data-rw-diff-pill]` alongside light/dark WCAG 2.1 AA revision diff selectors `[data-rw-diff-ins]`, `[data-rw-diff-del]`, `[data-rw-diff-code]`, `[data-rw-diff-line="add|del|ctx"]`, `[data-rw-diff-gap]`, `[data-rw-diff-lang-unchanged]`). Compiled strictly from `React`'s own source without scanning sibling modules, kept CSP-safe (zero `eval` / `new Function`), and partitioned via `resources/tailwind-layers.mjs` into deterministic cascade sub-layers (`utilities.shorthand`, `utilities.axis`, `utilities.longhand`, `utilities.state`, `utilities.{sm,md,lg,xl,xxl}-*`, `utilities.container-3xs`..`utilities.container-7xl`, `utilities.container`, `utilities.media`).
- **Typed Downstream SDK (`@pw/react/*`) & Delta Stylesheets (`resources/css/module-delta.css`):** Extension modules configure `defineWireModuleConfig(import.meta.dirname, { jsx: 'automatic', tailwind: true })` in `vite.config.ts` and import directly from `@pw/react/core`, `@pw/react/ui`, `@pw/react/layout`, `@pw/react/viewports`, `@pw/react/fields` (`ConditionBuilderFieldControl`, `ConditionBuilder`, `evaluateConditionTree`, `formatConditionSummary`, `normalizeConditionBuilderValue`, `serializeConditionToExpression`, `createEmptyConditionGroup`, `createEmptyConditionRule`, `getOperatorsForConditionFieldType`), `@pw/react/hooks`, `@pw/react/dnd`, `@pw/react/grid`, `@pw/react/calendar`, and `@pw/react/optional` instead of duplicating `window.ReactWorkspaceRuntime` wrappers. Module stylesheets `@import` `site/modules/React/resources/css/module-delta.css` (preflight-free `@tailwind utilities source(none)`) partitioned into the exact same `@layer utilities.*` sub-layers so multiple independent stylesheets compose without cascade-order regressions.
- **`dist/ReactLayout.js`**: Lazy workspace multi-shell runtime bundle exposing `AppShell`, `TopbarShellLayout`, `SidebarShellLayout`, `ModuleSwitcher`, `UserAccountMenu`, `RecordHeader`, `EditPresenceBanner`, `CommandPaletteModal` (grouped sections, nested workspace navigation items, Shell Layout / Sidebar toggle / Color Scheme actions, and debounced 180ms `AbortController` record search via `workspace.commandSearchEndpoint`), `postWorkspacePreferenceAction`, `renderNoticeMarkup`, `useEditPresence`, `registerShellLayout`, `getShellLayout`, `listShellLayouts`, `resolveShellLayoutDefinition`, and `useShellLayout` (plus `ShellLayoutId`, `ShellLayoutDescriptorDto`, `ShellLayoutDefinition`, `ShellLayoutRendererProps`, `CommandPaletteItem` types on `@pw/react/layout` / `window.ReactWorkspaceRuntime.Layout`).
- **`dist/ReactIcons.js` & `dist/vector-icons.json`**: Lightweight (`< 16 kB`) client icon gateway (`window.ProcessWireIcons`) backed by `/_react/icons` and build-time `dist/vector-icons.json`.
- **`dist/ReactViewports.js`**, **`dist/MarkupReactTable.js`**, **`dist/MarkupReactCards.js`**, **`dist/ReactGrid.js`**, **`dist/ReactDnd.js`**, **`dist/ReactCalendar.js` / `dist/ReactCalendar.css`**: Shared viewport shell (`DataViewport`, toolbar with `/` search / `n` new / `r` refresh shortcuts, filters, saved views, pagination) paired with strictly separated mode canvas bundles (`DataTableCanvas` in `MarkupReactTable.js`, `DataCardsCanvas` in `MarkupReactCards.js`, plus optional `@pw/react/{grid,dnd,calendar}` adapters) whose `viewStyles` and `viewScripts` are loaded lazily on demand.
- **`dist/SchemaForm.js` & `dist/ReactExtraFields.js`**: Core `<SchemaForm />` engine (including `ReactWorkspace/FieldControl`), Valibot schema validation, lightweight standard HTML controls, `mod+s` / `mod+shift+s` save shortcuts, and condition evaluator (`< 220 kB`), prefetching only the companion/lazy field bundles present in the schema (`ReactCalendar.{js,css}` and `ReactExtraFields.js`, which also registers `ReactWorkspace/ExtraFieldControl` standalone for classic `Inputfield`s without loading `SchemaForm.js`).
- **Typed SDK Hooks & Shell Primitives (`@pw/react/hooks`, `@pw/react/layout`, `@pw/react/ui`)**: Exposes `useKeyboardShortcuts`, `KeyboardShortcutsProvider`, `useRegisteredKeyboardShortcuts`, `formatShortcutKeys`, `CliBox` (`wrap?: boolean`), unified account dropdown (`Theme`, `Color Scheme`, `Panel Layout` `Top Bar` / `Sidebar` / reset to site default, `Keyboard shortcuts`, `View site`, `Profile`, `Logout`), tenant-style `ModuleSwitcher` (filter, pin toggle, compact `Workspace Hub` / `Panel` footer), collapsible sidebar rail with `mod+b` (`Cmd/Ctrl+B`) shortcut and nested tree / breadcrumb header, and `KeyboardShortcutsDialog` (`?` / `Cmd/Ctrl+/`).
- **Standalone Companion Control Bundles**:
  - `dist/MarkupReactTab.js` (`MarkupReactTab` WAI-ARIA tabs and lazy pane bodies)
  - `dist/InputfieldReactCondition.js` (`InputfieldReactCondition` & `condition_builder` visual condition rule builder)
  - `dist/InputfieldReactKeyValue.js` (`InputfieldReactKeyValue` key-value pair control)
  - `dist/InputfieldReactIcon.js` (`InputfieldReactIcon` vector icon picker popover + appearance controls, paired with `dist/ReactIcons.js`)
  - `dist/InputfieldReactLink.js` (`InputfieldReactLink` polymorphic link selector; loads `ReactMedia.js` and `ReactMedia.css` lazily only when inspecting media files)
  - `dist/ReactMedia.js` & `dist/ReactMedia.css` (`window.ReactMediaRuntime` studio dropzone, inspector `<dialog>` sheet, crop/focus overlay, progress bars, and media card/row styles)
  - `dist/InputfieldReactFile.js` & `dist/InputfieldReactImage.js` (lean file/image controls referencing `window.ReactMediaRuntime` without duplicating shared media UI)
  - `dist/InputfieldReactRelation.js` (`InputfieldReactM2O`, `InputfieldReactM2M`, `InputfieldReactO2M`, `InputfieldReactM2A` relational pickers)
- **`dist/TiptapCore.js` & `dist/TiptapCore.css`**: Core ProseMirror + `@tiptap/core` + `@tiptap/react` + `window.ReactTiptapRuntime` and editor shell/dialog styles (`TiptapCore.css`), loaded on demand whenever `InputfieldTiptap` mounts (without pulling `SchemaForm.js`).
- **`dist/TiptapEditor.js`**, **`dist/TiptapCanvas.js`**, **`dist/TiptapBlocks.js`**: Modular Tiptap capability packs (`table`/`image`/`anchor`/`taskList`/`align`/`highlight`/`sub`/`sup`; `BubbleMenu` + `/` slash command + left-gutter `blockHandles`; flat inline `miniBlocks`) resolved by `TiptapAssetResolver`.
- **`dist/TiptapDialogs.js`**: Strictly lazy on-demand ProcessWire `<dialog>` pack (`TiptapLinkDialog`, `TiptapImageDialog`, `TiptapAnchorDialog`) prefetched on hover/focus and awaited when opened.
- **`dist/ReactUiShowcase.js`**: Superuser + debug-only UI Showcase preview bundle loaded lazily on `/processwire/workspace/ui-showcase/`.
- **`dist/ProcessReactWorkspace.js`**: Workspace Dashboard (`ReactWorkspace/WorkspaceLauncher`) chunk.
