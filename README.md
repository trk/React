# React

Shared **React 19 + Inertia.js v3 + Tailwind CSS v4** UI runtime, admin shell (`ProcessReact`), form & media inputfields, rich text editor, vector icon engine, interactive data viewports, and optional `ProcessReactWorkspace` (`Admin > Workspace`) hub for ProcessWire.

![React](https://raw.githubusercontent.com/trk/React/refs/heads/main/preview.jpg)

`React` maps ProcessWire's `--pw-*` admin color scheme variables directly to semantic CSS design tokens (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`) and exposes a strictly modular client runtime (`ReactInertia.js` + `ReactInertia.css` core, plus per-submodule isolated bundles loaded only on pages where each companion module or field is active) shared across full-page admin workspaces, classic ProcessWire admin forms (`ProcessPageEdit`, `ProcessTemplate`, `ProcessField`, `ProcessModule`), and frontend Inertia islands — without adding an empty menu item to the ProcessWire admin bar unless the optional `ProcessReactWorkspace` hub module is explicitly installed.

---

## Requirements

- **PHP:** `>= 8.4`
- **ProcessWire:** `>= 3.0.271`
- **Required Module:** `Inertia` (`Totoglu\Inertia`)

---

## Installation

```bash
composer require trk/processwire-react
php vendor/bin/wire module:install --name=React --json
# Optional unified Admin > Workspace dashboard & cross-module switcher:
php vendor/bin/wire module:install --name=ProcessReactWorkspace --json
```

Installing `React` registers the runtime and installs all 14 companion UI, `Inputfield`, and `Markup` modules (`ProcessReactWorkspace` remains optional):

| Module | Role |
|---|---|
| `MarkupReactTable` | Interactive sortable, filterable, inline-editable data table viewport (`ReactWorkspace/Table`) |
| `MarkupReactCards` | Interactive responsive card grid viewport (`ReactWorkspace/Cards`) |
| `MarkupReactTab` | Accessible WAI-ARIA tab container and lazy tab pane fieldset (`line`, `segmented`, `vertical`) |
| `InputfieldReactKeyValue` | Repeatable associative key-value pair Inputfield (`FieldtypeText` / `FieldtypeTextarea` & `<SchemaForm />`) |
| `InputfieldReactLink` | Polymorphic destination & isolated media link Inputfield (`page`, `entry`, `url`, `email`, `tel`, `file`, `image`, `video`) |
| `InputfieldReactIcon` | Searchable 6,500+ vector icon selector (`Outline` & `Filled`) with optional size, stroke, color, and badge appearance controls |
| `InputfieldReactM2O` | Many-to-One single resource relational Inputfield (`page`, `template`, `field`, `user`, `role`, `permission`, `language`, `module`, or custom) |
| `InputfieldReactM2M` | Many-to-Many multi-resource sortable relational Inputfield |
| `InputfieldReactO2M` | One-to-Many reverse incoming relation panel with inline Quick Create, Link, and Unlink |
| `InputfieldReactM2A` | Many-to-Any polymorphic `<resource>:<id>` relational Inputfield |
| `InputfieldTiptap` | Full-width Tiptap v3 (`ProseMirror`) rich text editor Inputfield with native ProcessWire page/file/anchor link & `Pageimage` `-is` variation/crop/alignment modals, drag-and-drop upload, inline resize, editorial mini-blocks, HTML sanitization, and multi-language tabs |
| `TextformatterTiptapMiniBlocks` | Output-formatting Textformatter rendering `[data-tiptap-block]` elements through `./site/templates/tiptap/{name}.php` when present |
| `InputfieldReactFile` | AJAX drag-and-drop file upload, sorting, replacement, multi-language description, tag, and custom metadata Inputfield |
| `InputfieldReactImage` | Image studio Inputfield with focal point + zoom, crop/rotate/flip, color palette extraction, multi-language alt text, and tags |

---

## Quick Start

### 1. Building a Dual-Context Admin Module (`ProcessReact`)

Extend `Totoglu\React\Inertia\ProcessReact` in your `Process` module. From a single React component, `ProcessReact` automatically executes inside ProcessWire's active `AdminTheme` (`wire/core/admin.php` -> `Process::execute` via `EmbeddedAdminPageResponse`) when accessed from `Setup > <Module>` (`shellMode === 'admin'`), and inside the full-screen Workspace shell (`views/admin.php`) when accessed from `Admin > Workspace` (`?ws=1`, `shellMode === 'workspace'`). Register its workspace card and optional dashboard widgets lazily via `React::deferModuleRegistration()`:

```php
<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Inertia\ProcessReact;

class ProcessCatalog extends ProcessReact
{
	public function init(): void
	{
		parent::init();

		React::deferModuleRegistration(
			$this,
			function (React $react): void {
				$react->workspaces()->register([
					'id' => 'catalog',
					'title' => $this->_('Catalog'),
					'description' => $this->_('Manage products, pricing tiers, and inventory.'),
					'icon' => 'shopping-bag',
					'process' => 'ProcessCatalog',
					'component' => 'Catalog/Workspace',
					'category' => $this->_('Commerce'),
					'order' => 20,
					'permission' => 'catalog-view',
					'statsCallback' => function (): array {
						$pages = $this->wire()->pages;
						return [
							[
								'label' => $this->_('Products'),
								'value' => (string) $pages->count('template=product'),
								'tone' => 'primary',
							],
						];
					},
				]);
			},
			function (React $react): void {
				$react->widgets()->register([
					'id' => 'catalog-overview',
					'workspaceId' => 'catalog',
					'title' => $this->_('Catalog Overview'),
					'icon' => 'shopping-bag',
					'size' => 'md',
					'dataCallback' => function (): array {
						$pages = $this->wire()->pages;
						return [
							'metrics' => [
								[
									'label' => $this->_('Products'),
									'value' => (string) $pages->count('template=product'),
									'tone' => 'primary',
								],
							],
						];
					},
				]);
			}
		);
	}

	public function ___execute(): string
	{
		$react = React::instance($this);

		return (string) $this->inertiaRender('Catalog/Workspace', [
			'table' => $react->configureTable('pages:template=product, limit=25', [
				'title' => $this->_('Products'),
				'columns' => [
					'title' => $this->_('Title'),
					'modified' => $this->_('Modified'),
					'status' => $this->_('Status'),
				],
				'sortableColumns' => ['title', 'modified', 'status'],
				'quickEditEnabled' => true,
				'exportEnabled' => true,
			]),
		]);
	}
}
```

### 2. Rendering Interactive Data Viewports as Standalone Islands

```php
<?php

declare(strict_types=1);

namespace ProcessWire;

$react = React::instance($this);

echo $react->renderTable('pages:template=basic-page, limit=20', [
	'title' => $this->_('Site Pages'),
	'columns' => [
		'title' => $this->_('Title'),
		'path' => $this->_('Path'),
		'modified' => $this->_('Modified'),
		'status' => $this->_('Status'),
	],
]);

echo $react->renderCards('pages:template=basic-page, limit=12', [
	'title' => $this->_('Page Directory'),
]);
```

### 3. Rendering Vector Icons & Reading Formatted `InputfieldReactIcon` Values

Attach `InputfieldReactIcon` to any `FieldtypeText` field under `Setup > Fields > Details > Inputfield Type > React Icon`:

```php
<?php

declare(strict_types=1);

namespace ProcessWire;

/** @var Page $page */
$icon = $page->hero_icon; // ReactIconValue when $page->of(true)
if (!$icon->isEmpty()) {
	echo $icon; // Inline <svg> or styled <span class="rw-icon-badge">
}

// Or render any icon directly via IconManager:
$icons = React::instance()->icons();
echo $icons->renderSvg('sparkles', [
	'variant' => 'filled',
	'size' => 24,
	'color' => '#0d9488',
]);
```

---

## Configuration

Configure global settings under `Modules > Configure > React`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `defaultTheme` | `string` | `'system'` | Fallback theme mode (`'system'`, `'light'`, `'dark'`) when not overridden by `AdminThemeUikit` or user preferences. |
| `enableKeyboardShortcuts` | `bool` | `true` | Enables `Cmd/Ctrl+K` command palette and keyboard navigation shortcuts across workspaces. |
| `adminReturnLabel` | `string` | `'Panel'` | Localized label displayed on the top-left button returning from a Workspace to the classic ProcessWire Admin. |
| `useReactMediaFields` | `bool` | `false` | Automatically upgrades standard `InputfieldImage` and `InputfieldFile` fields on Pages (including Repeaters) to `InputfieldReactImage` and `InputfieldReactFile`. |
| `enableAdminVectorIcons` | `bool` | `true` | Injects a non-destructive `Vector Icon` selector below ProcessWire's native Icon field on `Setup > Templates` and `Setup > Fields` (plus `page_icon` support), rendering assigned icons via CSS `mask-image`. |
| `adminIconPreviewSize` | `int` | `28` | Preview icon size in pixels (`16`–`64`) on `Edit Template` and `Edit Field` screens. |

---

## Hooks & Events

All discovery registries fire only on demand when first accessed:

```php
<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Media\MediaGateway;
use Totoglu\React\Relation\RelationResourceRegistry;

// Register a custom relational resource adapter lazily
React::deferRelationRegistration(
	$this,
	function (RelationResourceRegistry $relations): void {
		$relations->register(new CustomProductResourceAdapter());
	}
);

// Register a custom entity media host adapter lazily
React::deferMediaHostRegistration(
	$this,
	function (MediaGateway $mediaGateway): void {
		$mediaGateway->registerHostAdapter(new CustomEntityMediaHostAdapter());
	}
);

// Register custom editorial mini-blocks for InputfieldTiptap
$wire->addHookAfter('InputfieldTiptap::registerMiniBlocks', function (HookEvent $event): void {
	$blocks = is_array($event->return) ? $event->return : [];
	$blocks['metric_card'] = [
		'label' => 'Metric Card',
		'icon' => 'chart-bar',
		'editableBody' => false,
		'fields' => [
			'value' => ['type' => 'text', 'label' => 'Metric Value', 'required' => true],
			'caption' => ['type' => 'text', 'label' => 'Caption'],
		],
	];
	$event->return = $blocks;
});
```

Hookable methods on `React`:
- `___initWorkspaceRegistry(WorkspaceRegistry $registry): void`
- `___registerWorkspaces(WorkspaceRegistry $registry): void`
- `___getWorkspaceDefinitions(): array`
- `___initWidgetRegistry(WorkspaceWidgetRegistry $registry): void`
- `___registerWidgets(WorkspaceWidgetRegistry $registry): void`
- `___getWidgetDefinitions(): array`
- `___initProviderRegistry(ProviderRegistry $registry): void`
- `___registerProviders(ProviderRegistry $registry): void`
- `___initRelationRegistry(RelationResourceRegistry $registry): void`
- `___registerRelationResources(RelationResourceRegistry $registry): void`
- `___registerMediaHosts(MediaGateway $mediaGateway): void`
- `___translations(): array`

---

## Internal Endpoints & Multi-Language Packs

`React` registers seven URL hooks and ships synchronized `en, tr, de, fr, es, ru` CSV translation packs (`languages/*.csv`) delivered via locale-scoped Inertia `OnceProp` keys:

| Endpoint | Purpose |
|---|---|
| `/_react/viewport` | HMAC-signed viewport query, sorting, filtering, view preferences, inline/quick editing, bulk actions, and exports |
| `/_react/workspace-prefs` | Per-user Workspace Dashboard favorites, Bento widget spans (`1..12`), layout JSON import/export, and theme mode |
| `/_react/presence` | Concurrent co-editor heartbeats and stale-form remote-save notifications |
| `/_react/relation` | HMAC-signed relational search, hierarchical tree loading, hydration, and `O2M` link/unlink/quick-create mutations |
| `/_react/media` | HMAC-signed multipart file/image upload, replacement, crop/rotate/flip transforms, and palette inspection |
| `/_react/tiptap` | HMAC-signed rich-text page/file/anchor link lookup and `Pageimage` variation/crop/upload gateway |
| `/_react/icons` | Read-only `GET` paginated vector icon catalog search (`action=query`) and microtask batch SVG hydration (`action=hydrate`) |

---

## Security & Permissions

- **Workspace RBAC (`React::checkAccess`):** Guest users are always denied (`403`). Non-superusers gain access to `/processwire/workspace/` only when they hold permission for at least one registered workspace (`WorkspaceRegistry::canAccess()`).
- **Tamper-Proof Signed Envelopes (`SignedTokenCodec`):** Viewport (`stateToken`), relation (`relationToken`), and media (`mediaToken`) tokens are signed with **HMAC-SHA256** derived from `$config->userAuthSalt`, bound to the authenticated `$user->id` (`uid`), and expire after 24 hours (`iat` TTL). Cross-endpoint token replay is cryptographically rejected via distinct domain prefixes.
- **CSRF Enforcement:** Every state-changing request across `/_react/viewport`, `/_react/workspace-prefs`, `/_react/presence`, `/_react/relation`, and `/_react/media` validates ProcessWire's `$session->CSRF` token (`X-CSRF-TOKEN`, `X-XSRF-TOKEN`, or form token).
- **Content, SVG & Media Sanitization:** `InputfieldTiptap` enforces `MarkupHTMLPurifier` with a deterministic DOM allowlist fallback stripping scripts, `svg`/`math` payloads, event handlers, and unsafe protocols; `MediaGateway` blocks active SVG uploads by default and enforces field-level `editable()` RBAC and `maxFiles` bounds; `IconManager` restricts inline SVG primitives to geometry tags (`path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`) and strict `#hex` / `var(--*)` color patterns.
