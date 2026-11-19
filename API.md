# React API Reference

Developer and AI agent reference for `ProcessWire\React`, the optional `ProcessWire\ProcessReactWorkspace` hub module, the 14 companion ProcessWire modules, and the `Totoglu\React` namespace.

---

## 1. Core Module (`ProcessWire\React`) & Optional Hub (`ProcessWire\ProcessReactWorkspace`)

`React` extends `ProcessWire\WireData` and implements `Module`, `ConfigurableModule`. Autoloaded (`singular => true, autoload => true`), defines no admin page, registered in ProcessWire Fuel as `$wire->react`, and registers `Totoglu\React` -> `__DIR__ . '/src/'` in `React::__construct()`.

`ProcessReactWorkspace` (`extends Totoglu\React\Workspace\WorkspaceLauncherProcess` -> `ProcessReact`, `autoload => false`) is shipped in the same directory as an **optional** `Process` module (`Admin > Workspace`, `/processwire/workspace/`). Downstream `ProcessReact` modules require only `'React'` and operate standalone when `ProcessReactWorkspace` is not installed, or join the unified workspace hub and widget dashboard automatically when `ProcessReactWorkspace` is installed.

### Static Constants & Lifecycle Methods
- `React::VERSION` (`int`, `10` = `v0.1.0`) — Canonical module version shared across `React`, `ProcessReactWorkspace`, and its 14 companion modules.
- `React::instance(?Wire $context = null): self` — Resolves the wired singleton from `$wire->react` or `$modules->getModule('React', ['noPermissionCheck' => true])`.
- `React::checkAccess(array $data = []): bool` — Grants access to `/_react/presence` and `/processwire/workspace/` for superusers or authenticated users who can access at least one registered workspace.
- `$react->isWorkspaceHubInstalled(): bool` — Returns `true` when the optional `ProcessReactWorkspace` hub module is installed.
- `React::deferModuleRegistration(Wire $module, ?callable $workspaceRegistrar = null, ?callable $widgetRegistrar = null): void` — Defers workspace and widget registration until `workspaces()` or `widgets()` is requested.
- `React::deferProviderRegistration(Wire $module, callable $registrar): void` — Defers `ReactDataProviderInterface` factory registration until `providers()` is requested.
- `React::deferRelationRegistration(Wire $module, callable $registrar): void` — Defers `RelationResourceInterface` registration until `relations()` is requested.
- `React::deferMediaHostRegistration(Wire $module, callable $registrar): void` — Defers `MediaHostAdapterInterface` registration until `media()` is requested.

### Service Accessors
- `$react->workspaces(): WorkspaceRegistry`
- `$react->widgets(): WorkspaceWidgetRegistry`
- `$react->workspacePreferences(): WorkspacePreferenceStore`
- `$react->presence(): EditPresenceStore`
- `$react->providers(): ProviderRegistry`
- `$react->provider(string|array|\Closure|PageArray|ReactDataProviderInterface $source, array $options = []): ReactDataProviderInterface`
- `$react->relations(): RelationResourceRegistry`
- `$react->relationSigner(): RelationStateSigner`
- `$react->media(): MediaGateway`
- `$react->forms(): FormSchemaSerializer`
- `$react->icons(): IconManager`

### Viewport, Form & Island Helpers
- `$react->viewport(string $mode = 'table'): MarkupReactViewport`
- `$react->table(): MarkupReactTable` / `$react->configureTable($provider = '', array $props = []): MarkupReactTable` / `$react->renderTable($provider = '', array $props = []): string`
- `$react->cards(): MarkupReactCards` / `$react->configureCards($provider = '', array $props = []): MarkupReactCards` / `$react->renderCards($provider = '', array $props = []): string`
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
- `$react->readJsonRequestBody(int $maxBytes = 2097152, int $maxDepth = 64): ?array`
- `$react->verifyRequestCsrf(array $requestPayload): bool`

### Theme, Shell Mode, Assets & `i18n` Helpers
- `$react->resolveShellMode(?Process $process = null): string` — Returns `'workspace'` (for `ProcessReactWorkspace` or `?ws=1` / `_rw_ws=1` / `X-React-Shell: workspace` requests when `ProcessReactWorkspace` is installed) or `'admin'` (classic `Setup > <Module>` access or when `ProcessReactWorkspace` is not installed).
- `$react->isWorkspaceContextRequest(): bool` — Detects active Workspace context across GET/POST/Inertia headers and `Referer`.
- `$react->withWorkspaceQuery(string $url): string` — Appends `ws=1` to local admin module URLs (automatically applied across `$session->redirect()` calls originating from Workspace mode).
- `$react->resolveLauncherUrl(): string` — Resolves the canonical URL of the `Admin > Workspace` hub page.
- `$react->resolveModuleAssetUrl(string $filename): array`
- `$react->resolveInertiaScriptAssets(array $extraScripts = []): array`
- `$react->resolveInertiaStyleAssets(array $extraStyles = []): array`
- `$react->buildInertiaSharedContext(?Process $process = null, ?WorkspaceDefinition $activeWorkspace = null): array`
- `$react->buildInertiaI18nSharedProps(?object $host = null): array`
- `$react->buildInertiaRootViewData(string $title = 'Workspace', array $extraScripts = [], array $extraStyles = []): array`
- `$react->resolveEffectiveThemeMode(?User $user = null): string`
- `$react->resolveAdminColorSchemeCss(): string`
- `$react->resolveAdminUseInputFocus(): bool`
- `$react->resolveActiveLocale(): string`
- `$react->resolveModuleTranslations(object $source): array`
- `React::flattenTranslationCatalog(array $entries, string $prefix = ''): array`

---

## 2. Inertia Base Classes & Translation Trait (`Totoglu\React\Inertia`)

- **`ProcessReact`** (`abstract class ProcessReact extends Totoglu\Inertia\ProcessInertia implements Module`): Base class for dual-context admin `Process` modules (`Setup > <Module>` native `Process::execute` inside any active `AdminTheme` and `Admin > Workspace` full-screen hub mode from a single React component). Uses `InteractWithReact`.
- **`InteractWithReact`** (trait composing `InteractWithInertia` + `InteractWithReactTranslations`): Runs initial `Setup > <Module>` requests (`shellMode === 'admin'`) natively through ProcessWire's `wire/core/admin.php` -> `Process::execute` lifecycle via `EmbeddedAdminPageResponse` (theme-agnostic across `AdminThemeUikit`, `AdminThemeDefault`, `AdminThemeReno`, and custom `AdminTheme` modules), while running `Admin > Workspace` (`?ws=1`, `shellMode === 'workspace'`) through `views/admin.php` and handling `X-Inertia` SPA transitions in both modes.
- **`EmbeddedAdminPageResponse`** (`final class EmbeddedAdminPageResponse extends Totoglu\Inertia\PageResponse`): Inline `Process::execute` response adapter that enqueues ordered `ReactInertia.css/js` and module scripts into `$config->styles` / `$config->scripts`, injects `--pw-*` tokens via `AdminTheme::addExtraMarkup('head', ...)`, clears redundant classic breadcrumbs/headlines, and returns `<div id="app">` markup without overriding `AdminTheme` output.
- **`InputfieldReact`** (`abstract class InputfieldReact extends Totoglu\Inertia\InputfieldInertia`): Base class for React Inputfields (`InputfieldReactKeyValue`, `InputfieldReactLink`, `InputfieldReactIcon`, `AbstractInputfieldReactRelation`). Uses `InteractWithReactTranslations` and merges `ReactInertia.css` + `ReactInertia.js` + `getModuleScriptAssets()`.
- **`InteractWithReactTranslations`** (trait): Provides `translationNamespace(): string`, hookable `___translations(): array`, and `buildReactTranslationSharedProps(): array` emitting locale-scoped Inertia `OnceProp` catalogs (`rw_i18n:{locale}:{namespace}`) with automatic `<ModuleDir>/languages/{locale}.csv` fallback.

---

## 3. Vector Icon System (`InputfieldReactIcon`, `IconManager`, `ReactIconValue`)

### `Totoglu\React\Icon\IconManager`
Loads `dist/vector-icons.json` (`5,491` outline + `1,054` filled = `6,545` vector icons across `41` categories, popular list, search tags, and shorthand icon aliases).

| Method | Signature | Description |
|---|---|---|
| `loadCatalog` | `public static function loadCatalog(): array` | Loads and caches `dist/vector-icons.json` once per PHP worker. |
| `count` / `filledCount` / `totalVariantsCount` | `public function count(): int` | Returns outline family count (`5491`), filled count (`1054`), or combined count (`6545`). |
| `getCategories` | `public function getCategories(): array` | Returns `list<array{id: string, label: string, count: int}>`. |
| `resolveCanonicalName` | `public static function resolveCanonicalName(string $raw): string` | Resolves canonical names, `-filled` / `:filled` suffixes, `lucide--*` prefixes, and shorthand aliases (returns `''` if unknown). |
| `hasIcon` | `public function hasIcon(string $raw): bool` | Checks whether a canonical or aliased icon exists in the catalog. |
| `hasFilledVariant` | `public static function hasFilledVariant(string $raw): bool` | Checks whether the resolved canonical icon exposes a filled variant. |
| `formatLabel` | `public static function formatLabel(string $raw): string` | Formats an icon identifier into a human-friendly label (e.g. `'brand-whatsapp'` -> `'WhatsApp'`). |
| `queryCatalog` | `public function queryCatalog(string $query = '', string $category = 'all', string $style = 'all', int $offset = 0, int $limit = 96, bool $includeMeta = false): array` | Paginated search over names, aliases, and tags with category and style (`all` \| `outline` \| `filled`) filtering. |
| `hydrateIcons` | `public function hydrateIcons(array $rawNames): array` | Returns up to 100 `CatalogEntry` definitions keyed by canonical icon name. |
| `normalizeValue` | `public static function normalizeValue(mixed $raw): array` | Normalizes scalar string, JSON string, array, `\stdClass`, or `ReactIconValue` into `{ name, variant, size, color, strokeWidth, background, radius }`. |
| `encodeForStorage` | `public static function encodeForStorage(mixed $raw, array $rawFlags = [], string $prefixMode = 'none'): string` | Encodes scalar (`sparkles`, `heart-filled`, `lucide--sparkles`) or JSON customization string according to field flags. |
| `renderSvgMarkup` / `renderSvg` | `public static function renderSvgMarkup(mixed $raw, array $overrides = []): string` | Renders sanitized inline `<svg>` markup (`Outline` stroke or `Filled` fill). |
| `renderHtmlMarkup` | `public static function renderHtmlMarkup(mixed $raw, array $overrides = []): string` | Renders inline `<svg>` or `<span class="rw-icon-badge">` HTML when `background` is set. |
| `resolveValueObject` / `resolveValue` | `public function resolveValue(mixed $raw, array $overrides = []): ReactIconValue` | Returns a wired `ReactIconValue` object. |
| `registerAdminIcons` | `public static function registerAdminIcons(array $icons): void` | Registers module/navigation `lucide--*` icons for inclusion in `LucideIcons.css`. |
| `isAdminVectorIcon` | `public static function isAdminVectorIcon(string $icon): bool` | Checks whether a `Field` or `Template` icon string belongs to the Admin vector icon system. |
| `generateAdminCss` / `ensureAdminCss` | `public function generateAdminCss(): string` | Generates `site/assets/lucide-icons/LucideIcons.css` `mask-image` rules for Templates, Fields, Admin `page_icon` pages, and registered module icons. |

### `Totoglu\React\Icon\ReactIconValue` (`extends WireData implements \Stringable, \JsonSerializable`)
Properties: `$set` (`'vector'` or `''`), `$name`, `$variant` (`'outline'|'filled'`), `$raw`, `$svg`, `$html`, `$size` (`12..96`), `$color`, `$strokeWidth` (`1.0..3.0`), `$background`, `$radius` (`'none'|'sm'|'md'|'lg'|'full'`), `$customized` (`bool`). Methods: `isEmpty(): bool`, `toArray(): array`, `__toString(): string`.

### `ProcessWire\InputfieldReactIcon` (`extends InputfieldReact`)
Selectable on `FieldtypeText` (`INERTIA_IS_ICON_FIELD = true`). Configurable properties: `allowCustomization` (`bool`), `allowVariant` (`bool`), `allowSize` (`bool`), `allowColor` (`bool`), `allowStrokeWidth` (`bool`), `allowBackground` (`bool`), `previewSize` (`int`), `iconPrefixMode` (`'none'|'lucide'|'fa'`), `readOnly` (`bool`). Formats `$page->get($field)` into `ReactIconValue` when `$page->of(true)` while bypassing `TextformatterEntities` JSON corruption.

---

## 4. Media Inputfields & Gateway (`InputfieldReactImage`, `InputfieldReactFile`, `MediaGateway`)

- **`ProcessWire\InputfieldReactImage`** (`extends InputfieldImage implements InertiaSerializable`) & **`ProcessWire\InputfieldReactFile`** (`extends InputfieldFile implements InertiaSerializable`): Use `InteractWithReactMediaInputfield`. Support `ProcessPageEdit` (including Repeaters and `fileSchema` custom fields) and `<SchemaForm />`.
- **`Totoglu\React\Media\MediaGateway`**: Signs `mediaToken` envelopes bound to `$user->id` (`host`, `ownerId`, `fieldName`, `extensions`, `maxFiles`, `maxFilesize`, `isImage`) and handles `upload`, `replace`, `transform` (`crop`, `rotate`, `flip`, `focus`), `inspect` (dominant color & palette via `InterventionImage` when installed), and `clone` at `/_react/media`. Blocks SVG uploads on image fields unless explicitly allowlisted and sanitized against active content.
- **`Totoglu\React\Media\MediaHostAdapterInterface`**: Pluggable host contract (`PageMediaHostAdapter`, `PageLinkMediaHostAdapter`, `PageLinkVirtualHost`, `PageLinkFilesManager`, and downstream entity hosts).

---

## 5. Polymorphic Link Inputfield (`InputfieldReactLink` & `PageLinkMediaHostAdapter`)

- **`ProcessWire\InputfieldReactLink`** (`extends InputfieldReact`, `INERTIA_IS_LINK_FIELD = true`): Supports target types `page`, `entry`, `url` (with `#anchor`), strict `tel` (`^\+?[0-9]+$`), `email`, and isolated multi-profile media targets (`file`, `image`, `video`, or custom `mediaProfiles` stored under `site/assets/files/{pageId}/links/{fieldName}/` via `PageLinkMediaHostAdapter`).
- Static helpers: `InputfieldReactLink::isLinkField(?Field $field): bool`, `InputfieldReactLink::normalizeValue(mixed $value, string $defaultType = 'url'): array`, `InputfieldReactLink::resolveValue(mixed $value, ?Page $ownerPage = null, ?Field $field = null, ?Language $language = null): array`, `InputfieldReactLink::renderLinkMarkup(mixed $value, ?Page $page = null, ?Field $field = null, string $property = ''): string`.

---

## 6. Key-Value Inputfield, Tabs & Form Schema Serializer

- **`ProcessWire\InputfieldReactKeyValue`** (`extends InputfieldReact`, `INERTIA_IS_KEYVALUE_FIELD = true`): Stores associative JSON objects (`Record<string, string>`) on `FieldtypeText` / `FieldtypeTextarea` with `minItems`, `maxItems`, `keyPattern` (ReDoS-guarded regex), `allowEmptyValues`, and TSV paste support.
- **`ProcessWire\MarkupReactTab`** (`extends InputfieldFieldset implements InertiaSerializable`): WAI-ARIA tab group container (`line`, `segmented`, `vertical`) with `addTab()`, `lazyLoad`, error count badges, and `showIf`.
- **`Totoglu\React\Form\FormSchemaSerializer`**: `serialize(InputfieldWrapper $wrapper, array $options = []): array`, `serializeDefinitions(iterable $definitions, array $options = []): array`, and `appendDeleteTab(InputfieldWrapper $form, array $config = []): void` supporting `surface: 'card'|'plain'`, declarative `'deleteTab'` configuration (ProcessWire-native `[Configuration | Delete]` confirmation checkbox processed on `Save`), `presenceKey`, `dirtyGuard`, and controls `text`, `textarea`, `number`, `email`, `url`, `tel`, `select`, `radios`, `checkboxes`, `asmselect`, `multiselect`, `checkbox`, `toggle`, `datetime`, `range`, `colspan`, `rating`, `signature`, `calculation`, `repeater`, `keyvalue`, `link`, `icon`, `relation` (`m2o`/`m2m`/`o2m`/`m2a`), `file`, `image`, and `tiptap`.

---

## 7. Rich Text Editor, ProcessWire Link/Image Modals & Editorial Mini-Blocks (`InputfieldTiptap` & `TextformatterTiptapMiniBlocks`)

- **`ProcessWire\InputfieldTiptap`** (`extends InputfieldTextarea implements ConfigurableModule, InertiaSerializable`, `INERTIA_IS_MARKUP_FIELD = true`): Full-width Tiptap v3 (`ProseMirror`) rich text editor registered in `FieldtypeTextarea::getFieldSetups` (`contentTypeHTML`) with selectable profile presets (`preset`: `'core' | 'editor' | 'canvas' | 'blocks'`), layered settings (`defaultsJSON`, `settingsField`, `settingsJSON` with `replace_*` / `add_*` / `append_*`), `toolbar` (including `link`, `unlink`, `anchor`, `image`, `table`, `insertblock`), `bubbleToolbar` (guaranteed in chromeless `inlineMode` unless explicitly disabled), `headlines`, `features` (`imgUpload`, `imgResize`, `slashMenu`, `blockHandles` opt-in), `imageFields`, `miniBlocks`, native top-layer `<dialog>` modals for ProcessWire page/file/anchor links (`ProcessPageEditLink` settings) and `Pageimage` `-is` variation/crop/HiDPI/alignment/caption selection (`ProcessPageEditImageSelect` settings), multi-language tabs enforcing `Languages::editable()`, `getModuleStyleAssets()`, and `TiptapContentPolicy` HTML sanitization.
- **`Totoglu\React\Tiptap\TiptapPresetCatalog`** & **`TiptapAssetResolver`**: Define the 4 editor profiles (`core`, `editor`, `canvas`, `blocks`) and resolve minimal ordered capability bundles (`core` plus `editor`, `canvas`, `blocks`, while keeping `dialogs` strictly lazy/on-demand) from preset defaults, explicit toolbar/feature customizations, and HTML markers in existing field values so legacy fields never lose tables, images, task lists, anchors, or inline content blocks.
- **`Totoglu\React\Tiptap\TiptapConfigFormBuilder`**: Builds the shared module and field configuration forms (`preset` radios with progressive `[data-rw-tiptap-preset-sync]` preset sync, `toolbar`, `bubbleToolbar`, `features` including `blockHandles`, `miniBlocks`, `toggles`, height bounds).
- **`Totoglu\React\Tiptap\TiptapMediaLinkGateway`** (`$react->tiptap()`, `/_react/tiptap`): HMAC-signed (`tiptapToken` via `SignedTokenCodec`, bound to `$user->id`) endpoint serving `pages` (search + hierarchical page tree + multi-language `localUrl($lang)` + `urlType` relative paths), `files`, `images` (Page, `RepeaterPage`, cross-page, and `MediaHostAdapterInterface` `mediaToken` hosts), `inspectImage`, and CSRF-guarded `POST` `resize` (`-is` `Pageimage` variations, crop, rotate/flip, `hidpi`, `noSizeAttrs`) and `upload` (`WireUpload`, `$sanitizer->validateFile()`, raster pixel bounds).
- **`ProcessWire\TextformatterTiptapMiniBlocks`** (`extends Textformatter`): Renders `[data-tiptap-block="{name}"]` nodes via `./site/templates/tiptap/{name}.php` when present, falling back to clean semantic HTML5.
- **`Totoglu\React\Tiptap\MiniBlockRegistry` / `MiniBlockHtmlSanitizer` / `MiniBlockRenderer` / `TiptapContentPolicy`**: Enforce depth-1 flat mini-block invariants, attribute schema validation, ProcessWire `<figure>`/`<figcaption>`, `align_*`, `hidpi`, named `<a id="...">` anchors, plain-text length calculation, and full-text search extraction.

---

## 8. Relational Inputfields (`M2O`, `M2M`, `O2M`, `M2A`) & `/_react/relation`

- **`ProcessWire\InputfieldReactM2O`**, **`InputfieldReactM2M`**, **`InputfieldReactO2M`**, **`InputfieldReactM2A`** (`extends AbstractInputfieldReactRelation`): Standalone relational Inputfields operating with or without `FieldtypePage`.
- **`RelationResourceRegistry` (`$react->relations()`)**: Built-in adapters `page`, `template`, `field`, `user`, `role`, `permission`, `language`, `module`, plus lazy `deferRelationRegistration()` adapters. Supports `dependsOn` and `dependsResourceMap` cascading filters.

---

## 9. Viewports & Data Providers (`MarkupReactViewport`, `MarkupReactTable`, `MarkupReactCards`)

- **`MarkupReactViewport`** (`extends Totoglu\Inertia\MarkupInertia`): Signs `stateToken` via `SignedTokenCodec` (`HMAC-SHA256`) and executes `fetch`, `search`, `filter`, `reset_filters`, `sort`, `page`, `switch_view_mode`, `select_view`, `save_view`, `delete_view`, `toggle_column`, `reset_columns`, `bulk_action`, `row_action`, `toolbar_action`, `update_field`, `toggle_field`, `move_stage`, `reorder`, `reschedule`, `resize_span`, `quick_create`, `open_quick_edit`, `close_quick_edit`, `save_quick_edit`, and `export`. Supports explicit `allowedViewModes`, `saveViewEnabled` (`bool`), `columnPickerEnabled` (`bool`), responsive `display => 'pills'` filter strips (`counts`, `icons`, `totalCount`), multi-option `createActions`, toolbar-level `toolbarActions`, table-level `rowValign` (`'middle'|'top'|'bottom'`), and column-level presentation schemas (`type`, `align`, `valign`, `mono`, `tabular`, `nowrap`, `truncate`, `copyable`, `subtitleMono`, `maxBadges`).
- **`ReactRecord`** (`Totoglu\React\Data\ReactRecord`): Immutable record DTO supporting `icon` (`string|array`), `thumb` (`array{src: string, darkSrc?: string, aspect?: string, alt?: string, count?: int}|null`), `subtitle`, `badges`, and per-column structured `cells` (`icon`, `thumb`, `label`, `href`, `external`, `copyValue`, `subtitle`, `subtitleMono`, `badges`, `maxBadges`, `mono`, `tabular`, `nowrap`, `truncate`) rendered consistently across `MarkupReactTable`, `MarkupReactCards`, and downstream viewports.
- **Built-in Providers (`Totoglu\React\Provider`):** `PagesDataProvider` (`pages:...`, supporting `columnSchemas()`, `iconField`, `thumbField`, `subtitleField`, and `showTemplateIcon`) and `ArrayDataProvider` (`array:...`, supporting `columnSchemas()` and record/cell visual descriptors).
- **Capability Contracts (`Totoglu\React\Contract`):** `ReactDataProviderInterface`, `ReactFieldSchemaProvider`, `ReactBulkFieldsProvider`, `ReactQuickEditProvider`, `ReactRecordActionsProvider`, `ReactSummaryProvider`, `ReactViewsProvider`, `ReactReorderProvider`, `ReactCalendarProvider`, `ReactExportProvider`.

---

## 10. Compiled Frontend Bundles (`dist/` & `window.ReactWorkspaceRuntime`)

- **`dist/ReactInertia.js` & `dist/ReactInertia.css`**: Core React 19 + Inertia v3 + Tailwind CSS v4 UI primitives (`UI`, `DynamicIcon`, `sanitizeHref`, `sanitizeSameOriginUrl`, `sanitizeAssetUrl`, `useTranslations`, `registerPages`, `registerIslands`, `mountIslands`, generic `loadRuntimeScript` / `loadRuntimeStyle` / `preloadRuntimeScript` / `ensureMediaStyleLoaded`, and non-clobbering lazy asset loaders) plus the generic `[data-rw-prose-root]` and `[data-rw-table]` CSS hooks. Kept `< 420 kB` and CSP-safe (zero `eval` / `new Function`), with zero companion-submodule UI, Tiptap addon logic, launcher hardcoding, or submodule CSS rules.
- **`dist/ReactLayout.js`**: Lazy workspace shell bundle (`AppShell`, `RecordHeader`, `useEditPresence`).
- **`dist/ReactIcons.js` & `dist/vector-icons.json`**: Lightweight (`< 15 kB`) client icon gateway (`window.ProcessWireIcons`) backed by `/_react/icons` and build-time `dist/vector-icons.json`.
- **`dist/ReactViewports.js`**, **`dist/MarkupReactTable.js`**, **`dist/MarkupReactCards.js`**: Shared viewport shell (`DataViewport`, toolbar, filters, saved views, pagination) paired with strictly separated mode canvas bundles (`DataTableCanvas` in `MarkupReactTable.js`, `DataCardsCanvas` in `MarkupReactCards.js`) loaded on demand when a viewport mode is active or switched.
- **`dist/SchemaForm.js`**: Core `<SchemaForm />` engine, Valibot schema validation, lightweight standard HTML controls, and condition evaluator (`< 200 kB`); prefetches only the companion field bundles actually present in the schema.
- **Standalone Companion Control Bundles**:
  - `dist/MarkupReactTab.js` (`MarkupReactTab` WAI-ARIA tabs and lazy pane bodies)
  - `dist/InputfieldReactKeyValue.js` (`InputfieldReactKeyValue` key-value pair control)
  - `dist/InputfieldReactIcon.js` (`InputfieldReactIcon` vector icon picker popover + appearance controls, paired with `dist/ReactIcons.js`)
  - `dist/InputfieldReactLink.js` (`InputfieldReactLink` polymorphic link selector; loads `ReactMedia.js` and `ReactMedia.css` lazily only when inspecting media files)
  - `dist/ReactMedia.js` & `dist/ReactMedia.css` (`window.ReactMediaRuntime` studio dropzone, inspector `<dialog>` sheet, crop/focus overlay, progress bars, and media card/row styles)
  - `dist/InputfieldReactFile.js` & `dist/InputfieldReactImage.js` (lean file/image controls referencing `window.ReactMediaRuntime` without duplicating shared media UI)
  - `dist/InputfieldReactRelation.js` (`InputfieldReactM2O`, `InputfieldReactM2M`, `InputfieldReactO2M`, `InputfieldReactM2A` relational pickers)
- **`dist/TiptapCore.js` & `dist/TiptapCore.css`**: Core ProseMirror + `@tiptap/core` + `@tiptap/react` + `window.ReactTiptapRuntime` and editor shell/dialog styles (`TiptapCore.css`), loaded on demand whenever `InputfieldTiptap` mounts (without pulling `SchemaForm.js`).
- **`dist/TiptapEditor.js`**, **`dist/TiptapCanvas.js`**, **`dist/TiptapBlocks.js`**: Modular Tiptap capability packs (`table`/`image`/`anchor`/`taskList`/`align`/`highlight`/`sub`/`sup`; `BubbleMenu` + `/` slash command + left-gutter `blockHandles`; flat inline `miniBlocks`) resolved by `TiptapAssetResolver`.
- **`dist/TiptapDialogs.js`**: Strictly lazy on-demand ProcessWire `<dialog>` pack (`TiptapLinkDialog`, `TiptapImageDialog`, `TiptapAnchorDialog`) prefetched on hover/focus and awaited when opened.
- **`dist/ProcessReactWorkspace.js`**: Workspace Dashboard (`ReactWorkspace/WorkspaceLauncher`) chunk.
