# 04 — Viewports & Data Providers

Guide to rendering interactive tables, card grids, and pluggable viewports (`MarkupReactViewport`, `MarkupReactTable`, `MarkupReactCards`), implementing `Totoglu\React\Contract\*` capability adapters, styling `ReactRecord` cells/thumbnails, and understanding the signed `/_react/viewport` action lifecycle.

---

## Execution Modes & Bundle Separation

[`MarkupReactViewport`](../src/Viewport/MarkupReactViewport.php#L41-L110) (`extends Totoglu\Inertia\MarkupInertia`) powers both built-in viewports (`MarkupReactTable`, `MarkupReactCards`) and downstream custom viewports in two execution modes:

1. **Full Inertia Page Prop (`$react->configureTable()` / `$react->configureCards()`):** Passed directly as an Inertia prop inside `$this->inertiaRender(...)`. `toInertiaProp()` serializes the configured records, column schemas, filter strips, view modes, and signed `stateToken`, while `inertiaViewData()` injects `ReactInertia.js/css`, `ReactViewports.js`, and the viewport module's canvas script (`MarkupReactTable.js` or `MarkupReactCards.js`).
2. **Classic ProcessWire Island (`$react->renderTable()` / `$react->renderCards()`):** Called inside classic `AdminTheme` templates, frontend templates, or `InputfieldMarkup` panels via `___render()` ([MarkupReactViewport.php](../src/Viewport/MarkupReactViewport.php#L848)). Outputs a canonical `<div data-inertia-island="..." data-react-island="..." data-props="...">` mount element and registers scripts/styles cleanly in `$config->scripts` and `$config->styles`.

### Pluggable Viewport Modes & Lazy Adapter Bundles

Core `ReactInertia.js` and `ReactViewports.js` ship only the shared viewport shell (`DataViewport`, toolbar with `/` search, `n` new, `r` refresh shortcuts, pill filters, saved views, pagination). Mode canvases stay cleanly isolated:
- `MarkupReactTable.module.php` -> `dist/MarkupReactTable.js` (`DataTableCanvas`)
- `MarkupReactCards.module.php` -> `dist/MarkupReactCards.js` (`DataCardsCanvas`)
- Optional interactive layout engines (`dist/ReactGrid.js`, `dist/ReactDnd.js`, `dist/ReactCalendar.js` + `dist/ReactCalendar.css`) load dynamically on demand via `viewScripts` and `viewStyles`.
- Extension modules can register additional layout modes via [`$react->registerViewportMode(string $mode, string $moduleName, string $providerContract = '', array $meta = [])`](../React.module.php#L719).

---

## `ProviderRegistry` & Built-in Sources

[`ProviderRegistry`](../src/Provider/ProviderRegistry.php#L17-L95) resolves string descriptors, arrays, closures, `PageArray` objects, or `ReactDataProviderInterface` instances passed to `configure()` or `render()`:

| Descriptor / Source | Adapter Class | Key Features |
|---|---|---|
| `'pages:<selector>'` or `PageArray` | [`PagesDataProvider`](../src/Provider/PagesDataProvider.php#L28-L135) | Runs selector queries with bounded top-level pagination (`stripTopLevelPaginationClauses()`), enforces ProcessWire `viewable()`/`editable()` RBAC, supports `columnSchemas()`, `iconField`, `thumbField`, `subtitleField`, `showTemplateIcon`, and mutates statuses (`OP_PUBLISH`, `OP_DRAFT`, `OP_TRASH`, `OP_RESTORE`, `OP_DELETE`, `OP_LOCK`, `OP_UNLOCK`). |
| `'array:<id>'` or `array` / `Closure` | [`ArrayDataProvider`](../src/Provider/ArrayDataProvider.php#L28-L180) | Wraps in-memory or dynamic array datasets with uniform filtering, sorting, pagination, `columnSchemas()`, and record/cell visual descriptors. |
| Custom `'namespace:key'` | Custom `ReactDataProviderInterface` | Register lazily via `React::deferProviderRegistration($this, function (ProviderRegistry $providers): void { $providers->registerFactory('custom:', ...); })` ([React.module.php](../React.module.php#L1479)). |

```php
<?php

declare(strict_types=1);

namespace ProcessWire;

$react = React::instance($this);

echo $react->renderTable('pages:template=basic-page, sort=-modified, limit=25', [
	'title' => $this->_('Site Pages'),
	'providerOptions' => [
		'showTemplateIcon' => true,
		'subtitleField' => 'path',
	],
	'columns' => [
		'title' => $this->_('Title'),
		'modified' => $this->_('Modified'),
		'status' => $this->_('Status'),
	],
	'sortableColumns' => ['title', 'modified', 'status'],
	'quickEditEnabled' => true,
	'exportEnabled' => true,
]);
```

---

## Capability Contracts (`Totoglu\React\Contract`)

Every provider must implement `ReactDataProviderInterface` ([ReactDataProviderInterface.php](../src/Contract/ReactDataProviderInterface.php#L15-L75)), and can opt into any combination of the **8 optional capability interfaces** in [`src/Contract/`](../src/Contract/) to unlock specialized UI affordances (while downstream modules can define additional contract interfaces gated via `React::registerViewportMode()`):

| Contract Interface | Methods Required | UI Capabilities Unlocked |
|---|---|---|
| `ReactDataProviderInterface` | `id()`, `title()`, `columns()`, `sortableColumns()`, `statusOptions()`, `isLocked()`, `query()`, `mutate()`, `OP_*` constants | Core viewport dataset querying, status filtering, and record mutations |
| `ReactFieldSchemaProvider` | `filterableFields()`, `groupableFields()`, `availableColumns()`, `inlineEditableFields()` | Dynamic filter dropdowns/pills, group-by selectors, column visibility toggles, inline cell editing |
| `ReactBulkFieldsProvider` | `bulkEditableFields()` | Bulk field edit drawer actions across selected rows |
| `ReactQuickEditProvider` | `supportsQuickEdit()`, `saveQuickEdit()`, `createQuickRecord()` | Slide-over Quick Edit sheet (`open_quick_edit` / `save_quick_edit`) and Quick Create modal (`quick_create`) |
| `ReactRecordActionsProvider` | `recordActions(ReactRecord $record)`, `createAction()` | Per-row action menus and primary toolbar create button / multi-option `createActions` |
| `ReactSummaryProvider` | `summaryConfig()`, `computeSummaries()` | KPI footer/header totals (`sum`, `avg`, counts) |
| `ReactViewsProvider` | `savedViews()` | Preset system filter views shown in the viewport view switcher |
| `ReactReorderProvider` | `isSortable()` | Drag-and-drop row/card reordering (`OP_REORDER` / `OP_MOVE`) |
| `ReactExportProvider` | `exportFormats()`, `export()` | Streaming/structured exports alongside formula-injection-safe CSV (`MarkupReactViewport::sanitizeCsvCell()`) |

---

## `ReactRecord` DTO & Column Presentation Schemas

[`ReactRecord`](../src/Data/ReactRecord.php#L15-L86) provides a strict immutable payload shared across table rows, cards, and custom viewports:

- **Canonical Bitmask Statuses:** `STATUS_PUBLISHED = 1`, `STATUS_UNPUBLISHED = 2`, `STATUS_DRAFT = 2`, `STATUS_HIDDEN = 4`, `STATUS_TRASH = 8`, `STATUS_LOCKED = 16`.
- **Visual Descriptors:**
  - `icon`: leading vector icon name or `ReactIconValue` array payload.
  - `thumb`: `array{src: string, darkSrc?: string, alt?: string, count?: int, aspect?: string}|null` rendered safely (replacing ad-hoc HTML strings where structured descriptors are supplied).
  - `subtitle`, `badges` (`label`, `variant`, `dot`), `isEditableField` (`colKey => bool`).
  - `cells`: structured per-column overrides supporting `icon`, `thumb`, `label`, `href`, `external`, `copyValue`, `subtitle`, `subtitleMono`, `badges`, `maxBadges`, `mono`, `tabular`, `nowrap`, `truncate`.
- **Column & Filter Configuration Options (`MarkupReactViewport`):**
  - Column schemas accept presentation hints (`type`, `align`, `valign`, `mono`, `tabular`, `nowrap`, `truncate`, `copyable`, `subtitleMono`, `maxBadges`), paired with table-level `rowValign` (`'middle' | 'top' | 'bottom'`).
  - Filter definitions support `display => 'pills'` with optional `counts`, `icons`, and `totalCount`.
  - Toolbar controls honor `allowedViewModes`, `saveViewEnabled`, `columnPickerEnabled`, `toolbarActions`, and multi-option `createActions` ([API.md](../API.md#L185)).

---

## Signed Action Lifecycle (`/_react/viewport`) & Saved Preferences

When a user sorts, filters, switches view modes, edits inline, triggers bulk actions, or exports data, the React client posts `{ stateToken, action, state, payload }` to `/_react/viewport` ([ReactGatewayRouter.php](../src/Http/ReactGatewayRouter.php#L232-L390)):

1. **Authentication & Method Checks:** Rejects unauthenticated guests (`403`). If `$action` is in [`ReactGatewayRouter::MUTATING_VIEWPORT_ACTIONS`](../src/Http/ReactGatewayRouter.php#L44-L65), enforces `POST` (`405`), rejects `$config->demo === true` (`403`), and validates ProcessWire's `$session->CSRF` token (`419`).
2. **Signed `stateToken` Verification:** `verifyViewportState()` decodes the HMAC-SHA256 envelope bound to the current `$user->id` (`typ = 'viewport'`), instantiates the target viewport class (`MarkupReactTable`, `MarkupReactCards`, etc.), refills allowed client state keys (`searchQuery`, `filterValues`, `sortField`, `sortDirection`, `page`, `limit`, `selectedIds`, `hiddenColumns`, `activeView`, `viewMode`, `quickEditRecordId`, plus any active pluggable mode keys declared via `modeMutableStateKeys()`), and dispatches `executeAction($action, $actionPayload)`.
3. **CSV Formula Neutralization:** Exports sanitize cells via [`MarkupReactViewport::sanitizeCsvCell()`](../src/Viewport/MarkupReactViewport.php#L2976) to neutralize spreadsheet formula injection triggers.
4. **Per-User Preference Persistence (`ReactViewPreferenceStore`):** Column visibility, active view mode, page size, sort state, and user-saved filter presets are cached in session (`ReactViewPrefs`) and persisted to `$user->meta('react_view_prefs_*')` whenever `config->demo` is false ([ReactViewPreferenceStore.php](../src/Viewport/ReactViewPreferenceStore.php#L17-L84)).

---

## Related Links

- Previous: [03 — Inputfields, Forms & Rich Text (`InputfieldTiptap`)](./03-inputfields-forms-and-tiptap.md)
- Next: [05 — Frontend Runtime, Typed SDK, i18n & Security](./05-frontend-runtime-sdk-and-security.md)
- Signatures: [API Reference §9](../API.md#L183-L189)
