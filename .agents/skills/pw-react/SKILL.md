---
name: pw-react
description: "Use when building full-page ProcessWire admin workspaces with ProcessReact or InteractWithReact, configuring optional ProcessReactWorkspace hub integration, authoring React Inputfields (InputfieldReact, InputfieldReactIcon, InputfieldReactLink, InputfieldReactKeyValue, InputfieldReactImage, InputfieldReactFile, InputfieldReactM2O/M2M/O2M/M2A, InputfieldTiptap), serializing forms via FormSchemaSerializer, or rendering MarkupReactTable, MarkupReactCards, and MarkupReactTab viewports."
category: admin-ui
risk: safe
source: processwire-boost
date_added: "2026-11-18"
---

# React (`ProcessWire\React` & Optional `ProcessWire\ProcessReactWorkspace`)

Shared React 19 + Inertia v3 + Tailwind CSS v4 UI runtime (`--pw-*` semantic tokens), admin shell (`ProcessReact`), dual-mode form/media/relation/icon/rich-text `Inputfield`s, interactive data viewports, and optional `ProcessReactWorkspace` (`Admin > Workspace`) hub (`site/modules/React/`).

For complete class and method signatures, read `site/modules/React/API.md`, and for architectural boundaries and multi-shell/Vite build details, read `site/modules/React/docs/ARCHITECTURE.md` and `site/modules/React/AGENTS.md`.

## 1. Execution Workflow & Completion Criteria

1. **Verify active modules and schema:**
   - Run `pw_module_list` and `pw_schema_read` (MCP) or `php vendor/bin/wire module:list --json` to confirm `Inertia` and `React` are installed (`ProcessReactWorkspace` is optional).
   - _Criterion:_ Downstream modules list `'React'` (never `'ProcessReactWorkspace'`) in `requires` so they operate both standalone (`Setup > <Module>`) and inside the optional `Workspace` hub.
2. **Register workspaces, widgets, shell layouts, command search providers, providers, relations, and media hosts lazily:**
   - Inside an `autoload` module's `init()` / `ready()`, wrap registrations in `React::deferModuleRegistration()`, `deferShellLayoutRegistration()`, `deferCommandSearchRegistration()`, `deferProviderRegistration()`, `deferRelationRegistration()`, or `deferMediaHostRegistration()`.
   - _Criterion:_ Zero workspace stat queries, widget callbacks, or adapter instantiations run on frontend or unrelated admin requests, and zero `\ReflectionProperty` workarounds are used.
3. **Extend `ProcessReact` for dual-context admin modules and `MarkupReactViewport` / `FormSchemaSerializer` for views:**
   - Extend `Totoglu\React\Inertia\ProcessReact`, return `$this->inertiaRender('Module/Workspace', [...])` wrapped in `<AppShell>`, and expose module UI strings from `public function ___translations(): array`.
   - `ProcessReact` automatically adapts the same single React view to both entry contexts: opening via `Setup > <Module>` runs natively through `wire/core/admin.php` (`Process::execute` + `EmbeddedAdminPageResponse`, `shellMode: 'admin'`) inside whichever `AdminTheme` is active (`AdminThemeUikit`, `AdminThemeDefault`, `AdminThemeReno`, or custom `AdminTheme`) with an `"Open in Workspace"` switch when `ProcessReactWorkspace` is installed, whereas opening via `Admin > Workspace` (`?ws=1`) renders the full-screen Workspace shell (`views/admin.php`, `shellMode: 'workspace'`).
   - _Criterion:_ Every `POST`/`PUT`/`DELETE` mutation validates `$this->wire()->session->CSRF` and checks `$user->hasPermission(...)` / `$page->editable()`.
4. **Verify types, bundles, and accessibility sequentially:**
   - Run PHPStan Level 8, `npm run build`, Pest (`php vendor/bin/wire test`), and Playwright (`php vendor/bin/wire test:e2e --module=<ModuleName>`).
   - _Criterion:_ Zero runtime console/page errors and zero WCAG 2.1 AA violations.

---

## 2. Canonical Recipes

### Full-Page Admin Workspace (`ProcessReact` + Lazy Registration)

```php
<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Inertia\ProcessReact;

class ProcessInventory extends ProcessReact
{
	public static function getModuleInfo(): array
	{
		return [
			'title' => 'Inventory',
			'version' => 10,
			'summary' => 'Inventory management workspace.',
			'permission' => 'inventory-manage',
			'page' => [
				'name' => 'inventory',
				'parent' => 'setup',
				'title' => 'Inventory',
			],
			'requires' => [
				'PHP>=8.4',
				'ProcessWire>=3.0.271',
				'Inertia',
				'React',
			],
		];
	}

	public function init(): void
	{
		parent::init();

		React::deferModuleRegistration(
			$this,
			function (React $react): void {
				$react->workspaces()->register([
					'id' => 'inventory',
					'title' => $this->_('Inventory'),
					'description' => $this->_('Manage stock levels and warehouses.'),
					'icon' => 'package',
					'process' => 'ProcessInventory',
					'permission' => 'inventory-manage',
					'statsCallback' => function (): array {
						$pages = $this->wire()->pages;
						return [
							[
								'label' => $this->_('Items'),
								'value' => (string) $pages->count('template=inventory-item'),
								'tone' => 'primary',
							],
						];
					},
				]);
			}
		);

		React::deferCommandSearchRegistration(
			$this,
			function (\Totoglu\React\Workspace\CommandSearchRegistry $registry): void {
				$registry->register('inventory-items', function (string $query, User $user, int $limit): array {
					$pages = $this->wire()->pages;
					$sanitizer = $this->wire()->sanitizer;
					$adminUrl = rtrim((string) $this->wire()->config->urls->admin, '/') . '/';
					$matches = $pages->find("template=inventory-item, title%={$sanitizer->selectorValue($query)}, limit={$limit}");
					$items = [];
					foreach ($matches as $item) {
						if ($item->editable()) {
							$items[] = [
								'id' => 'inv-' . $item->id,
								'label' => (string) $item->title,
								'subtitle' => (string) $item->path,
								'badge' => $this->_('Inventory'),
								'group' => $this->_('Inventory Items'),
								'icon' => 'package',
								'href' => $adminUrl . 'inventory/edit/?id=' . (int) $item->id,
								'isInertia' => true,
							];
						}
					}
					return $items;
				}, [
					'permission' => 'inventory-manage',
					'label' => $this->_('Inventory Items'),
					'order' => 100,
				]);
			}
		);
	}

	public function ___execute(): string
	{
		$react = $this->react();

		return (string) $this->inertiaRender('Inventory/Index', [
			'viewport' => $react->configureTable('pages:template=inventory-item, sort=-modified', [
				'title' => $this->_('Inventory Items'),
				'columns' => [
					'title' => $this->_('Title'),
					'sku' => $this->_('SKU'),
					'modified' => $this->_('Updated'),
					'status' => $this->_('Status'),
				],
				'sortableColumns' => ['title', 'modified', 'status'],
				'exportEnabled' => true,
			]),
		]);
	}

	/**
	 * @return array<string, mixed>
	 */
	public function ___translations(): array
	{
		return [
			'inventory' => [
				'heading' => $this->_('Inventory'),
				'empty' => $this->_('No inventory items found.'),
			],
		];
	}
}
```

### Serializing Native or Declarative Forms (`FormSchemaSerializer`)

```php
<?php

declare(strict_types=1);

namespace ProcessWire;

$react = React::instance($this);

// Native ProcessWire InputfieldWrapper -> SchemaForm JSON schema (with card surface & native Delete tab)
$form = $this->wire()->modules->get('InputfieldForm');
$schema = $react->serializeForm($form, [
	'action' => './save/',
	'dirtyGuard' => true,
	'surface' => 'card',
	'deleteTab' => !$isNew ? [
		'name' => '_delete_confirm',
		'typeLabel' => $this->_('Item'),
	] : null,
]);

// Declarative array definitions -> SchemaForm JSON schema
// Canonical controls: text, textarea, number, email, url, tel, date, time, datetime,
// daterange, color, tags, combobox, unit_number (or currency / unitVariant: 'currency'),
// segmented, spacing, range, range_slider, colspan, otp, password, markdown, rating,
// signature, calculation, select, radios, checkboxes, asmselect, multiselect, checkbox,
// toggle, repeater, keyvalue, link, icon, relation (m2o/m2m/o2m/m2a), file, image, tiptap.
$declarativeSchema = $react->serializeFormDefinitions([
	[
		'name' => 'title',
		'type' => 'text',
		'label' => $this->_('Title'),
		'required' => true,
		'width' => 50,
	],
	[
		'name' => 'icon',
		'type' => 'icon',
		'label' => $this->_('Icon'),
		'allowCustomization' => true,
		'width' => 50,
	],
	[
		'name' => 'deposit',
		'type' => 'unit_number',
		'unitVariant' => 'currency',
		'label' => $this->_('Deposit'),
		'units' => ['EUR', 'USD', 'GBP'],
		'defaultUnit' => 'EUR',
		'precision' => 2,
		'width' => 50,
	],
	[
		'name' => 'cta_link',
		'type' => 'link',
		'label' => $this->_('Call to Action'),
		'linkTypes' => ['page', 'url', 'email', 'tel', 'file'],
	],
]);
```

For native ProcessWire `Inputfield`s serialized through `$react->serializeForm($form)` **or rendered directly on classic ProcessWire Page Edit / User Edit / `Setup > Fields` forms**, set `$field->set('rwControl', '<canonical_type>')` (e.g. `time`, `date`, `datetime`, `daterange`, `color`, `tags`, `combobox`, `phone`, `country`, `countries`, `timezone`, `currency_code`, `unit_number` with `'unitVariant' => 'currency'` or `'currency'`, `segmented`, `spacing`, `range`, `range_slider`, `colspan`, `otp`, `password`, `markdown`, `rating`, `signature`, `calculation`, `toggle`, `slug`, `secret`, `condition_builder`) along with extended control props (`swatches`, `allowAlpha`, `suggestions`, `comboboxOptions`, `segmentedOptions`, `defaultCountry`, `preferredCountries`, `phoneCountries`, `only`, `exclude`, `preferred`, `regions`, `includeOffset`, `units`, `currencies`, `defaultUnit`, `unitVariant`, `currency`, `precision`, `locale`, `hourFormat`, `minuteStep`, `showSeconds`, `timezone`, `minTime`, `maxTime`, `multiple`, `secretPrefix`, `secretBytes`, `secretAutoGenerate`) and `Totoglu\React\Support\IntlCatalog` (`countryOptions`, `phoneCountryItems`, `normalizePhoneE164`, `isValidPhoneE164`, `currencyOptions`, `timezoneOptions`). Compatible standard Fieldtypes (`FieldtypeText`, `FieldtypeTextarea`, `FieldtypeInteger`, `FieldtypeFloat`, `FieldtypeDecimal`, `FieldtypeDatetime`, `FieldtypeOptions`) also expose a `React Control` (`rwControlFieldset`) configuration panel directly in `Setup > Fields`; classic renders automatically hydrate via `ReactControlRegistry` (`ReactWorkspace/ExtraFieldControl` in `ReactExtraFields.js` without `SchemaForm.js`, or `ReactWorkspace/FieldControl` in `SchemaForm.js`).

### Concurrent Co-Editor Presence Notification

```php
<?php

declare(strict_types=1);

namespace ProcessWire;

// After persisting an entity or singleton record in a POST handler:
React::instance($this)->notifyResourceSaved(
	'inventory:item:' . (int) $itemPage->id,
	$this->wire()->user
);
```

---

## 3. Bundled Companion Modules & Subsystems

| Module / Class | Purpose |
|---|---|
| `MarkupReactTable` / `MarkupReactCards` | HMAC-signed interactive data viewports (`/_react/viewport`) supporting search, filters, saved views, inline editing, quick-edit drawer, bulk actions, and CSV/JSON export (`PagesDataProvider` & `ArrayDataProvider`). Loads `ReactViewports.js` plus only the active canvas bundle (`MarkupReactTable.js` or `MarkupReactCards.js`), fetching alternate mode canvases lazily on demand. |
| `MarkupReactTab` | Accessible WAI-ARIA tabbed container (`line`, `segmented`, `vertical`) with `lazyLoad`, error-count badges, and `showIf`. Loads only its standalone `MarkupReactTab.js` bundle. |
| `InputfieldReactIcon` & `IconManager` | Searchable `6,545`-icon vector picker (`Outline` & `Filled`), `ReactIconValue` formatted output, and non-destructive Admin `Template`/`Field` vector icon overrides. Loads `InputfieldReactIcon.js` + `ReactIcons.js`. |
| `InputfieldReactImage` & `InputfieldReactFile` | AJAX media studio (`/_react/media`) with focal point + zoom, crop/rotate/flip, dominant color & palette inspection, multi-language descriptions, tags, and per-file `fileSchema`. Loads shared `ReactMedia.js` + `ReactMedia.css` alongside the lean `InputfieldReactImage.js` or `InputfieldReactFile.js` bundle. |
| `InputfieldReactLink` | Polymorphic destination & isolated media link field (`page`, `entry`, `url` with `#anchor`, strict `tel`, `email`, and `file`/`image`/`video` profiles). Loads `InputfieldReactLink.js`, enqueues `ReactMedia.css` only when media types are configured, and fetches `ReactMedia.js` lazily only when inspecting media files. |
| `InputfieldReactKeyValue` | Associative `Record<string, string>` editor with `minItems`, `maxItems`, ReDoS-safe `keyPattern`, and TSV paste. Loads only `InputfieldReactKeyValue.js`. |
| `InputfieldReactM2O` / `M2M` / `O2M` / `M2A` | Relational pickers (`/_react/relation`) over `page`, `template`, `field`, `user`, `role`, `permission`, `language`, `module`, or custom `RelationResourceInterface` adapters via shared `InputfieldReactRelation.js`. |
| `InputfieldTiptap` & `TextformatterTiptapMiniBlocks` | Full-width Tiptap v3 (`ProseMirror`) rich text editor (`FieldtypeTextarea::getFieldSetups` `Tiptap` profile) with selectable presets (`core`, `editor`, `canvas`, `blocks`) and dynamic bundle loading (`TiptapCore.css` + `TiptapCore.js`, optional `TiptapEditor.js` / `TiptapCanvas.js` / `TiptapBlocks.js`, on-demand `TiptapDialogs.js`, without pulling `SchemaForm.js`), layered `defaultsJSON` / `settingsField` / `settingsJSON`, native `<dialog>` ProcessWire page/file/anchor link & `Pageimage` `-is` variation/crop/alignment modals (`/_react/tiptap`), drag-and-drop `imgUpload`, inline `imgResize`, chromeless `bubbleToolbar`, left-gutter `blockHandles` (`+` insert, pointer drag-and-drop reorder, popover Block Actions), flat `[data-tiptap-block]` mini-blocks, and `TiptapContentPolicy` sanitization. |

---

## 4. Client Runtime, Typed SDK (`@pw/react/*`), Central Theme & UX Standards

- **Shell Navigation (`TopbarShellLayout` / `SidebarShellLayout`) & Typed SDK (`@pw/react/*`):** `TopbarShellLayout` shows up to `5` favorite-sorted inline workspace links alongside a `+N` `"More"` overflow `ModuleSwitcher` popover, whereas `SidebarShellLayout` pins the collapsible rail (`Cmd/Ctrl+B`) and desktop bottom `UserAccountMenu`. Downstream extension modules compile with `defineWireModuleConfig(import.meta.dirname, { jsx: 'automatic', tailwind: true })` and import directly from typed subpaths: `@pw/react/core` (React hooks, Inertia router/`Link`, `DynamicIcon`, `cn`, `registerPages`/`registerIslands`), `@pw/react/ui` (`Button`, `Badge`, `Card`, `Dialog`, `Sheet`, `ConfirmDialog`, `Tabs`, `Input`, `Select`, `Switch`, `DropdownMenu`, `CliBox` with `wrap`, `EmptyState`, sortable/overlay helpers), `@pw/react/layout` (`AppShell`, `TopbarShellLayout`, `SidebarShellLayout`, `ModuleSwitcher`, `UserAccountMenu`, `RecordHeader`, `EditPresenceBanner`, `CommandPaletteItem`, `registerShellLayout`, `getShellLayout`, `listShellLayouts`, `resolveShellLayoutDefinition`, `useShellLayout`, plus grouped Command Palette 2.0 actions for Shell Layout, Sidebar collapse, Color Scheme, nested sections, and `/_react/command-search` record results), `@pw/react/viewports` (`DataViewport`, lazy `viewScripts`/`viewStyles` loading, `/`/`n`/`r` keyboard shortcuts), `@pw/react/fields` (`SchemaForm`, lazy field controls, `mod+s`/`mod+shift+s` shortcuts, condition helpers), `@pw/react/hooks` (`useTranslations`, `useTheme`, `useKeyboardShortcuts`, `KeyboardShortcutsProvider`, `useRegisteredKeyboardShortcuts`, `formatShortcutKeys`, `getCsrfToken`, gateway helpers), and optional `@pw/react/{dnd,grid,calendar,optional}` adapters. Shared media components live in `dist/ReactMedia.js` (`window.ReactMediaRuntime`) and `dist/ReactMedia.css`, loaded only on pages using media Inputfields or interactive media inspection; Tiptap addon resolution lives inside `dist/TiptapCore.js` via `window.ReactTiptapRuntime.ensureBundles()`.
- **Semantic Tokens (`ReactInertia.css`), Delta CSS, Central Theme (`ThemeManager`) & Multi-Shell Navigation (`ShellLayoutRegistry`):** `ReactInertia.css` maps ProcessWire `--pw-*` variables into semantic tokens (`--background`, `--foreground`, `--card`, `--primary`, `--primary-ink`, `--primary-foreground`, `--muted`, `--border`, `--destructive`, `--success`, `--warning`, plus distinct `--sidebar*` preset surface tokens) with WCAG 2.1 AA contrast across light and dark modes, without scanning sibling modules. It also ships domain-agnostic surface/markup contracts consumed by `SchemaForm`, revision viewers, and `SchemaMarkupNode`: `[data-rw-card-tabs="above"]` (flush top tablist strip rendered directly above `<Card data-rw-form-card="">` when `surface === 'card'` has 2+ visible tabs), responsive `[data-rw-meta-grid]` / `[data-rw-meta-item]` / `[data-rw-meta-label]` / `[data-rw-meta-value]` / `[data-rw-meta-copy]` (paired with `SchemaMarkupNode` `[data-copy-text]` `1500ms` `data-copied="1"` + polite `aria-live` clipboard feedback), `[data-rw-ref-list]` / `[data-rw-ref-item]`, `[data-rw-rev-table]` / `[data-rw-diff-pill]`, and light/dark WCAG 2.1 AA diff selectors `[data-rw-diff-ins]`, `[data-rw-diff-del]`, `[data-rw-diff-code]`, `[data-rw-diff-line="add|del|ctx"]`, `[data-rw-diff-gap]`, `[data-rw-diff-lang-unchanged]`. Site-wide theme (`native`, `neutral`, `slate`, `stone`, `ocean`, `indigo`, `teal`, `custom`) and `defaultShellLayout` (`topbar`, `sidebar`, or registered custom layout ID) defaults live in `React` module config, while authenticated users override `themeMode`, `themePreset`, `shellLayout` (or reset to site default), and `sidebarCollapsed` in per-user `{user-id}.json` preferences via the unified account dropdown, Command Palette 2.0, and `/_react/workspace-prefs` (`set_theme_mode`, `set_theme_preset`, `set_shell_layout`, `set_sidebar_collapsed`). Register additional server/client shell layouts and command search providers lazily with `React::deferShellLayoutRegistration()`, `React::deferCommandSearchRegistration()`, and `@pw/react/layout`'s `registerShellLayout()`. Downstream modules import `site/modules/React/resources/css/module-delta.css` in their entry CSS so `resources/tailwind-layers.mjs` emits module-only delta utilities into ordered `@layer utilities.*` sub-layers.
- **Zero Layout Shift & Rhythm:** Align side-by-side form controls (`width` / `columnWidth` / `colSpan`) to consistent input heights and spacing rhythm; render drawers, popovers, and inspector panels as overlays (`Sheet` / `Dialog`) so opening them never pushes form content downward.
- **Actionable UX Copy & States:** Write jargon-free, user-oriented labels, `EmptyState` guidance, loading, saving/optimistic, and validation error messages that tell the user what to do next without leaking internal class or third-party library names.
- **WCAG 2.1 AA & Keyboard Mastery:** Enforce at least `4.5:1` contrast on small text and active button/tab states, explicit `<label>` bindings on every form input, `aria-label` on every icon-only button, focus trap + focus restoration on modals/drawers, and consistent keyboard shortcuts (`Cmd/Ctrl+K` Quick Switcher, `Cmd/Ctrl+B` toggle collapsible sidebar, `?` / `Cmd/Ctrl+/` Keyboard Shortcuts Help, `Alt+1..9` tabs, `Alt+Left` back, `mod+s` / `mod+shift+s` form save, `/` / `n` / `r` viewports, `g w` / `g a` navigation chords, and `Escape`). Audit UI components with `impeccable detect --json` when available.
- **Signed State & Native `LanguageTranslator` Parity:** Sign client-roundtripped viewport/relation/media state envelopes with HMAC (`SignedTokenCodec`), reject `guest` users (`403`) on workspace endpoints, declare module strings in `___translations()` resolved directly via ProcessWire's native `LanguageTranslator` (`Setup > Languages`, with zero runtime CSV file fallback), and keep `languages/{en,tr,de,fr,es,ru}.csv` `LanguagePorter` import packs synchronized with intact `{placeholder}` / `%s` tokens.

---

## 5. Anti-Patterns & Loophole Closing

- ❌ **Calling `$react->workspaces()->register()` eagerly inside `init()` on `autoload => true` modules:** Evaluates workspace/widget closures on every frontend request. Always use `React::deferModuleRegistration($this, ...)`, and clean up with `React::forgetSharedWorkspace()`, `React::forgetSharedWidget()`, and `React::forgetDeferredRegistrations($this)` inside `___uninstall()`.
- ❌ **Hardcoding raw hex colors or `text-primary` on subtle `bg-primary/10` pills:** Fails WCAG 2.1 AA `4.5:1` contrast when `--pw-main-color` is a mid-tone accent. Use semantic tokens (`bg-primary text-primary-foreground` for solid pills, `bg-primary/12 text-primary-ink` for subtle pills, `bg-[var(--button-bg)] text-[var(--button-fg)]` via `<Button>`).
- ❌ **Rendering user-supplied `href` attributes without `sanitizeHref()` / `UrlSanitizer::sanitizeHref()`:** Allows `javascript:` / `data:` XSS vectors. Always pass untrusted links through `sanitizeHref()`.
- ❌ **Skipping `<?php // __(file-not-translatable)` on line 1 of PHP test files:** Causes `LanguagePorter` to extract test fixture strings into `languages/*.csv`. Every PHP file under `tests/` must begin with `<?php // __(file-not-translatable)`.
