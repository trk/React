<?php

declare(strict_types=1);

namespace Totoglu\React\Viewport;

use Closure;
use ProcessWire\PageArray;
use ProcessWire\React;
use Totoglu\Inertia\MarkupInertia;
use Totoglu\React\Contract\ReactBulkFieldsProvider;
use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Contract\ReactExportProvider;
use Totoglu\React\Contract\ReactFieldSchemaProvider;
use Totoglu\React\Contract\ReactQuickEditProvider;
use Totoglu\React\Contract\ReactRecordActionsProvider;
use Totoglu\React\Contract\ReactReorderProvider;
use Totoglu\React\Contract\ReactSummaryProvider;
use Totoglu\React\Contract\ReactViewsProvider;
use Totoglu\React\Data\ReactPageResult;
use Totoglu\React\Data\ReactRecord;
use Totoglu\React\Inertia\InteractWithReactTranslations;
use Totoglu\React\Security\UrlSanitizer;
use Totoglu\React\Support\IslandMarkup;

/**
 * Base ProcessWire Markup module (`extends MarkupInertia`) for all `React` and downstream
 * interactive React data viewports (`MarkupReactTable`, `MarkupReactCards`, and custom viewports).
 *
 * Works in both execution modes:
 * 1. **Full Inertia Page Mode**: Pass `$viewport->configure($provider, $props)` directly as a prop
 *    inside `$this->inertiaRender('...', ['viewport' => $table->configure(...)])`.
 *    `PageResponse` serializes `toInertiaProp()` and merges `inertiaViewData()` (`ReactInertia.js/css`
 *    plus any module-specific scripts/styles).
 * 2. **Classic ProcessWire Island Mode**: Call `$table->render($provider, $props)` inside any classic
 *    ProcessWire admin page or frontend template. Renders a `<div data-inertia-island="..." data-react-island="..." data-props="...">`
 *    container and registers the required runtime scripts/styles in `$config->scripts` and `$config->styles`.
 *
 * @method string render(string|array<int|string, mixed>|\Closure|PageArray|ReactDataProviderInterface $provider = '', array<string, mixed> $props = [])
 */
abstract class MarkupReactViewport extends MarkupInertia
{
	use InteractWithReactTranslations;
	public string $componentId = '';

	/**
	 * Registered provider descriptor in `React::instance()->providers()` (e.g., `'pages:template=basic-page'`, `'entries:blog_post'`).
	 */
	public string $provider = '';

	/**
	 * Options forwarded to `ProviderRegistry::resolve($provider, $providerOptions)`.
	 *
	 * @var array<string, mixed>
	 */
	public array $providerOptions = [];

	/**
	 * Optional human-readable viewport title override.
	 */
	public string $title = '';

	/**
	 * Ad-hoc array dataset when `$provider` is empty and no direct `ReactDataProviderInterface` is bound.
	 *
	 * @var list<array<string, mixed>|ReactRecord>
	 */
	public array $items = [];

	/**
	 * Normalized column schema map: `['title' => ['label' => 'Title', 'sortable' => true, 'type' => 'text', 'editable' => true]]`.
	 *
	 * @var array<string, array<string, mixed>>
	 */
	public array $columns = [];

	/**
	 * Inline-editable field schema definitions (`['status' => ['type' => 'select', 'label' => 'Status', 'options' => [...]]]`).
	 *
	 * @var array<string, array<string, mixed>>
	 */
	public array $inlineEditableFields = [];

	/**
	 * Hydrated row records serialized for React.
	 *
	 * @var list<array<string, mixed>>
	 */
	public array $records = [];

	/**
	 * Raw `ReactRecord` objects from the latest provider query.
	 *
	 * @var list<ReactRecord>
	 */
	protected array $reactRecords = [];

	/**
	 * Filter definitions: `['status' => ['label' => 'Status', 'options' => ['published' => 'Published']]]`.
	 *
	 * @var array<string, array{label: string, type?: string, display?: string, options: array<string, string>, counts?: array<string, int>, icons?: array<string, string>, totalCount?: int}>
	 */
	public array $filters = [];

	/**
	 * Active filter values map (`statusFilter` + `fieldFilters`).
	 *
	 * @var array<string, mixed>
	 */
	public array $filterValues = [];

	public string $statusFilter = '';
	public string $dateFrom = '';
	public string $dateTo = '';

	/**
	 * Bulk actions map: `['publish' => ['label' => 'Publish'], 'trash' => ['label' => 'Trash', 'variant' => 'danger']]`.
	 *
	 * @var array<string, array{label: string, icon?: string, variant?: string, confirm?: string}>
	 */
	public array $bulkActions = [];

	/**
	 * Per-row action definitions.
	 *
	 * @var list<array{key: string, label: string, icon?: string, variant?: string, href?: string, confirm?: string}>
	 */
	public array $rowActions = [];

	public string $emptyTitle = 'No records found';
	public string $emptyMessage = 'Try adjusting your search or filter criteria.';
	public string $emptyIcon = 'inbox';
	public string $emptyActionLabel = '';
	public string $emptyActionUrl = '';
	public string $searchPlaceholder = 'Search records...';
	public string $searchQuery = '';
	public string $sortField = '';
	public string $sortDirection = 'asc';
	public string $groupBy = '';
	public int $pageNum = 1;
	public int $limit = 25;
	public int $total = 0;
	public int $totalPages = 1;
	public int $trashCount = 0;

	/**
	 * Currently selected row IDs for bulk operations.
	 *
	 * @var list<string>
	 */
	public array $selectedIds = [];

	/**
	 * Hidden column keys for the current user/view.
	 *
	 * @var list<string>
	 */
	public array $hiddenColumns = [];

	/**
	 * Named view tabs / presets from provider (`ReactViewsProvider::savedViews()`).
	 *
	 * @var array<string, array<string, mixed>>
	 */
	public array $views = [];

	public string $activeView = 'all';

	/**
	 * User-saved filter presets loaded from `ReactViewPreferenceStore`.
	 *
	 * @var array<string, array{label: string, filters: array<string, mixed>, searchQuery?: string, sortField?: string, sortDirection?: string, viewMode?: string, hiddenColumns?: list<string>}>
	 */
	public array $savedViews = [];

	/**
	 * Active viewport layout mode (`table`, `cards`, or a registered pluggable mode).
	 */
	public string $viewMode = 'table';

	/**
	 * Allowed layout modes for switcher buttons in the toolbar.
	 *
	 * @var list<string>
	 */
	public array $allowedViewModes = ['table', 'cards'];

	/**
	 * Whether `$allowedViewModes` was explicitly pinned by the caller.
	 */
	public bool $explicitViewModes = false;

	/**
	 * Optional multi-option primary create menu items (`New Template Layout`, `New Global Layout`, etc.).
	 *
	 * @var list<array{key?: string, label: string, href?: string, icon?: string, dataAttrs?: array<string, string>}>
	 */
	public array $createActions = [];

	/**
	 * Optional secondary toolbar action buttons (`Sync Used Categories`, etc.).
	 *
	 * @var list<array{key: string, label: string, href?: string, icon?: string, variant?: string, badge?: string, confirm?: string, dataAttrs?: array<string, string>}>
	 */
	public array $toolbarActions = [];

	/**
	 * Summary KPI cards / column summaries rendered above or below the viewport.
	 *
	 * @var list<array{key?: string, label: string, value: string|int|float, trend?: string, trendDirection?: string, variant?: string, icon?: string}>
	 */
	public array $summaryCards = [];

	/**
	 * Active pluggable mode state bag serialized to `modeState` and forwarded to delegates.
	 *
	 * @var array<string, mixed>
	 */
	public array $modeState = [];

	/**
	 * Cached hydrated peer delegates keyed by normalized mode.
	 *
	 * @var array<string, self>
	 */
	private array $resolvedModeDelegates = [];

	/**
	 * Quick-Edit modal state.
	 */
	public bool $quickEditEnabled = true;
	public string $quickEditUrl = '';
	public string $quickEditRecordId = '';

	/**
	 * Field-level validation errors from the most recent Quick Edit submission.
	 *
	 * @var array<string, string>
	 */
	private array $quickEditErrors = [];

	/**
	 * Export & drag-and-drop reorder flags.
	 */
	public bool $exportEnabled = true;

	/**
	 * @var list<string>
	 */
	public array $exportFormats = ['csv', 'json'];
	public bool $reorderEnabled = false;
	public bool $locked = false;

	public bool $selectable = true;
	public bool $dense = false;
	public string $rowValign = 'middle';
	public bool $showToolbar = true;
	public bool $showFilterBar = true;
	public bool $showPagination = true;
	public bool $showCreateButton = true;
	public bool $saveViewEnabled = true;
	public bool $columnPickerEnabled = true;
	public string $createLabel = '';
	public string $createUrl = '';
	public string $createModalTarget = '';
	public string $editUrl = '';

	public string $noticeMessage = '';
	public string $noticeType = 'success';

	/**
	 * Transient export download payload populated when `executeAction('export')` runs.
	 */
	public string $downloadFilename = '';
	public string $downloadContent = '';
	public string $downloadMime = '';

	protected ?ReactDataProviderInterface $dataProvider = null;

	public function init(): void
	{
		parent::init();
		$this->viewMode = $this->defaultViewMode();
	}

	/**
	 * Default viewport layout mode (`table`, `cards`, or custom mode).
	 */
	protected function defaultViewMode(): string
	{
		return 'table';
	}

	/**
	 * Return the active viewport layout mode.
	 */
	public function viewportMode(): string
	{
		return $this->viewMode;
	}

	/**
	 * Whether this viewport mode supports the given data provider.
	 */
	public function modeSupportsProvider(ReactDataProviderInterface $provider): bool
	{
		return true;
	}

	/**
	 * Extra mutating action names owned by this pluggable mode that require POST + CSRF validation.
	 *
	 * @return list<string>
	 */
	public function modeMutatingActions(): array
	{
		return [];
	}

	/**
	 * All extra mutating action names active for this viewport and its current mode delegate.
	 *
	 * @return list<string>
	 */
	public function allMutatingActions(): array
	{
		$delegate = $this->resolveModeDelegate();

		return array_values(array_unique(array_merge(
			$this->modeMutatingActions(),
			$delegate !== null ? $delegate->modeMutatingActions() : [],
		)));
	}

	/**
	 * Mutable state keys accepted from client round-trips for this pluggable mode.
	 *
	 * @return list<string>
	 */
	public function modeMutableStateKeys(): array
	{
		return [];
	}

	/**
	 * All mutable state keys accepted for this viewport and its current or registered mode delegates.
	 *
	 * @return list<string>
	 */
	public function allMutableStateKeys(): array
	{
		$keys = $this->modeMutableStateKeys();
		$delegate = $this->resolveModeDelegate();
		if ($delegate !== null) {
			$keys = array_merge($keys, $delegate->modeMutableStateKeys());
		}

		return array_values(array_unique($keys));
	}

	/**
	 * Extra mode-specific properties to include inside the signed HMAC state envelope.
	 *
	 * @return array<string, mixed>
	 */
	public function modeSignedState(): array
	{
		return [];
	}

	/**
	 * Restore mode-specific properties from decoded state/modeState envelopes.
	 *
	 * @param array<string, mixed> $state
	 */
	public function applyModeSignedState(array $state): void
	{
	}

	/**
	 * Export volatile runtime state from a peer mode delegate back to `$modeState`.
	 *
	 * @return array<string, mixed>
	 */
	public function modeStateExport(): array
	{
		return [];
	}

	/**
	 * Configure mode-specific defaults or provider metadata during `loadFromProvider()`.
	 */
	public function modeConfigureOptions(ReactDataProviderInterface $provider): void
	{
	}

	/**
	 * Override effective query limit for this pluggable mode when loading records.
	 */
	public function modeQueryLimit(int $defaultLimit): int
	{
		return max(1, $defaultLimit);
	}

	/**
	 * Override record loading for this pluggable mode, or return `null` to run standard `$provider->query($criteria)`.
	 *
	 * @param array<string, mixed> $criteria
	 */
	public function modeLoadRecords(ReactDataProviderInterface $provider, array $criteria): ?ReactPageResult
	{
		return null;
	}

	/**
	 * Execute a mode-owned action. Return `null` when unhandled so standard viewport actions run.
	 *
	 * @param array<string, mixed> $payload
	 * @return array{handled: bool, notice?: string, noticeType?: string, error?: string, refreshMetadata?: bool}|null
	 */
	public function modeExecuteAction(string $action, array $payload, ?ReactDataProviderInterface $provider): ?array
	{
		return null;
	}

	/**
	 * Enrich serialized `modeState` props sent to React for this pluggable mode.
	 *
	 * @param list<array<string, mixed>> $records
	 * @return array<string, mixed>
	 */
	public function modeInertiaData(?ReactDataProviderInterface $provider, array $records): array
	{
		return [];
	}

	/**
	 * Hydrate this peer delegate instance from the parent/host viewport state.
	 */
	public function hydrateFromPeer(self $source): void
	{
		$this->componentId = $source->componentId;
		$this->provider = $source->provider;
		$this->providerOptions = $source->providerOptions;
		$this->title = $source->title;
		$this->items = $source->items;
		$this->columns = $source->columns;
		$this->filters = $source->filters;
		$this->filterValues = $source->filterValues;
		$this->statusFilter = $source->statusFilter;
		$this->dateFrom = $source->dateFrom;
		$this->dateTo = $source->dateTo;
		$this->bulkActions = $source->bulkActions;
		$this->rowActions = $source->rowActions;
		$this->inlineEditableFields = $source->inlineEditableFields;
		$this->searchQuery = $source->searchQuery;
		$this->sortField = $source->sortField;
		$this->sortDirection = $source->sortDirection;
		$this->groupBy = $source->groupBy;
		$this->pageNum = $source->pageNum;
		$this->limit = $source->limit;
		$this->total = $source->total;
		$this->totalPages = $source->totalPages;
		$this->trashCount = $source->trashCount;
		$this->selectedIds = $source->selectedIds;
		$this->hiddenColumns = $source->hiddenColumns;
		$this->views = $source->views;
		$this->activeView = $source->activeView;
		$this->savedViews = $source->savedViews;
		$this->viewMode = $source->viewMode;
		$this->allowedViewModes = $source->allowedViewModes;
		$this->explicitViewModes = $source->explicitViewModes;
		$this->createActions = $source->createActions;
		$this->toolbarActions = $source->toolbarActions;
		$this->summaryCards = $source->summaryCards;
		$this->quickEditEnabled = $source->quickEditEnabled;
		$this->quickEditUrl = $source->quickEditUrl;
		$this->quickEditRecordId = $source->quickEditRecordId;
		$this->reorderEnabled = $source->reorderEnabled;
		$this->locked = $source->locked;
		$this->editUrl = $source->editUrl;
		$this->records = $source->records;
		$this->reactRecords = $source->reactRecords;
		$this->modeState = $source->modeState;
		$this->dataProvider = $source->resolveDataProvider();

		foreach ($source->providerOptions as $optKey => $optVal) {
			if (is_string($optKey) && property_exists($this, $optKey) && !property_exists(self::class, $optKey)) {
				$this->{$optKey} = $optVal;
			}
		}
		foreach ($source->modeState as $stateKey => $stateVal) {
			if (is_string($stateKey) && property_exists($this, $stateKey) && !property_exists(self::class, $stateKey)) {
				$this->{$stateKey} = $stateVal;
			}
		}
		if ($source->modeState !== []) {
			$this->applyModeSignedState($source->modeState);
		}
	}

	/**
	 * Resolve and hydrate the installed pluggable delegate viewport for `$mode` (or active `$this->viewMode`).
	 */
	protected function resolveModeDelegate(?string $mode = null): ?self
	{
		$cleanMode = strtolower(trim($mode ?? $this->viewMode));
		if (
			$cleanMode === ''
			|| in_array($cleanMode, ['table', 'cards'], true)
			|| $cleanMode === strtolower(trim($this->defaultViewMode()))
		) {
			return null;
		}

		$registered = $this->react()->getRegisteredViewportModes();
		$modName = trim((string) ($registered[$cleanMode]['module'] ?? ''));
		if ($modName === '' || !$this->wire()->modules->isInstalled($modName)) {
			return null;
		}

		if (isset($this->resolvedModeDelegates[$cleanMode])) {
			$delegate = $this->resolvedModeDelegates[$cleanMode];
			$delegate->hydrateFromPeer($this);

			return $delegate;
		}

		try {
			$delegate = $this->react()->viewport($cleanMode);
		} catch (\Throwable) {
			return null;
		}
		if (get_class($delegate) === get_class($this)) {
			return null;
		}

		$delegate->hydrateFromPeer($this);
		$this->resolvedModeDelegates[$cleanMode] = $delegate;

		return $delegate;
	}

	/**
	 * Hydrate the viewport from its bound provider.
	 */
	public function mount(): static
	{
		$this->loadFromProvider();

		$availableModes = $this->resolveAvailableViewModes();
		$registeredModes = $this->react()->getRegisteredViewportModes();
		$modules = $this->wire()->modules;
		foreach ($registeredModes as $modeKey => $meta) {
			$moduleName = (string) ($meta['module'] ?? '');
			if ($moduleName !== '' && in_array($modeKey, $availableModes, true) && $modules->isInstalled($moduleName)) {
				$modules->get($moduleName);
			}
		}

		return $this;
	}

	/**
	 * Toggle publish/draft status on a single record via the bound provider.
	 *
	 * @return array<string, mixed>
	 */
	public function toggleStatus(string $id): array
	{
		return $this->executeAction('row_action', [
			'rowAction' => ReactDataProviderInterface::OP_TOGGLE_STATUS,
			'id' => $id,
		]);
	}

	/**
	 * Delete or trash a single record via the bound provider.
	 *
	 * @return array<string, mixed>
	 */
	public function deleteItem(string $id): array
	{
		return $this->executeAction('row_action', [
			'rowAction' => ReactDataProviderInterface::OP_DELETE,
			'id' => $id,
		]);
	}

	/**
	 * Duplicate/clone a single record via the bound provider.
	 *
	 * @return array<string, mixed>
	 */
	public function cloneItem(string $id): array
	{
		return $this->executeAction('row_action', [
			'rowAction' => ReactDataProviderInterface::OP_DUPLICATE,
			'id' => $id,
		]);
	}

	/**
	 * Move a record to trash via the bound provider.
	 *
	 * @return array<string, mixed>
	 */
	public function trashItem(string $id): array
	{
		return $this->executeAction('row_action', [
			'rowAction' => ReactDataProviderInterface::OP_TRASH,
			'id' => $id,
		]);
	}

	/**
	 * Restore a trashed record via the bound provider.
	 *
	 * @return array<string, mixed>
	 */
	public function restoreItem(string $id): array
	{
		return $this->executeAction('row_action', [
			'rowAction' => ReactDataProviderInterface::OP_RESTORE,
			'id' => $id,
		]);
	}

	/**
	 * Permanently empty trash via the bound provider.
	 *
	 * @return array<string, mixed>
	 */
	public function emptyTrash(): array
	{
		$provider = $this->resolveDataProvider();
		if ($provider !== null && !$provider->isLocked()) {
			$provider->mutate(ReactDataProviderInterface::OP_EMPTY_TRASH, ['__all__']);
			$this->noticeMessage = $this->_('Emptied trash.');
			$this->refreshProviderMetadataAfterMutation($provider);
		}
		$this->loadFromProvider();

		return $this->toInertiaProp();
	}

	/**
	 * Execute a bulk operation (`publish`, `draft`, `trash`, `restore`, `lock`, `unlock`, `delete`) on record IDs.
	 *
	 * @param list<string> $ids
	 * @return array<string, mixed>
	 */
	public function bulkAction(string $action, array $ids = []): array
	{
		return $this->executeAction('bulk_action', [
			'bulkAction' => $action,
			'ids' => $ids !== [] ? $ids : $this->selectedIds,
		]);
	}

	/**
	 * Update a field across multiple records.
	 *
	 * @param list<string> $ids
	 * @return array<string, mixed>
	 */
	public function bulkUpdateField(string $field, mixed $value, array $ids = []): array
	{
		$targetIds = $ids !== [] ? $ids : $this->selectedIds;
		$provider = $this->resolveDataProvider();
		if ($field !== '' && $targetIds !== [] && $provider !== null && !$provider->isLocked()) {
			$modified = $provider->mutate(ReactDataProviderInterface::OP_UPDATE_FIELD, $targetIds, [
				'field' => $field,
				'value' => $value,
			]);
			$this->noticeMessage = sprintf($this->_('Updated %d record(s).'), $modified);
			$this->refreshProviderMetadataAfterMutation($provider);
		}
		$this->loadFromProvider();

		return $this->toInertiaProp();
	}

	/**
	 * Inline update a single field on a record.
	 *
	 * @return array<string, mixed>
	 */
	public function quickUpdateField(string $id, string $field, mixed $value): array
	{
		return $this->executeAction('update_field', [
			'id' => $id,
			'field' => $field,
			'value' => $value,
		]);
	}

	/**
	 * Toggle a boolean field on a record.
	 *
	 * @return array<string, mixed>
	 */
	public function toggleField(string $id, string $field): array
	{
		return $this->executeAction('toggle_field', [
			'id' => $id,
			'field' => $field,
		]);
	}

	/**
	 * Reorder records by ordered ID list.
	 *
	 * @param list<string> $orderedIds
	 * @return array<string, mixed>
	 */
	public function reorderItems(array $orderedIds): array
	{
		return $this->executeAction('reorder', [
			'orderedIds' => $orderedIds,
		]);
	}

	/**
	 * Move a record one position up or down among its siblings.
	 *
	 * @return array<string, mixed>
	 */
	public function moveItem(string $id, string $direction = 'up'): array
	{
		return $this->executeAction('row_action', [
			'rowAction' => ReactDataProviderInterface::OP_MOVE,
			'id' => $id,
			'direction' => $direction,
		]);
	}

	/**
	 * Default Inertia component / island name for this viewport.
	 */
	public function inertiaComponent(): string
	{
		return 'ReactWorkspace/Viewport';
	}

	/**
	 * Return module-specific script URLs to load after `ReactInertia.js`.
	 *
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		return [];
	}

	/**
	 * Return module-specific stylesheet URLs to load after `ReactInertia.css`.
	 *
	 * @return list<string>
	 */
	public function getModuleStyleAssets(): array
	{
		return [];
	}

	/**
	 * Resolve the wired `React` module instance.
	 */
	public function react(): React
	{
		return React::instance($this);
	}

	/**
	 * Bind a direct `ReactDataProviderInterface` instance.
	 */
	public function setDataProvider(ReactDataProviderInterface $provider): static
	{
		$this->dataProvider = $provider;
		if ($this->provider === '') {
			$this->provider = $provider->id();
		}

		return $this;
	}

	/**
	 * Reset mutable viewport properties to their defaults before configuring a new render pass.
	 */
	public function resetViewportState(): static
	{
		$this->componentId = '';
		$this->provider = '';
		$this->providerOptions = [];
		$this->title = '';
		$this->items = [];
		$this->columns = [];
		$this->inlineEditableFields = [];
		$this->records = [];
		$this->reactRecords = [];
		$this->filters = [];
		$this->filterValues = [];
		$this->statusFilter = '';
		$this->dateFrom = '';
		$this->dateTo = '';
		$this->bulkActions = [];
		$this->rowActions = [];
		$this->emptyTitle = 'No records found';
		$this->emptyMessage = 'Try adjusting your search or filter criteria.';
		$this->emptyIcon = 'inbox';
		$this->emptyActionLabel = '';
		$this->emptyActionUrl = '';
		$this->searchPlaceholder = 'Search records...';
		$this->searchQuery = '';
		$this->sortField = '';
		$this->sortDirection = 'asc';
		$this->groupBy = '';
		$this->pageNum = 1;
		$this->limit = 25;
		$this->total = 0;
		$this->totalPages = 1;
		$this->trashCount = 0;
		$this->selectedIds = [];
		$this->hiddenColumns = [];
		$this->views = [];
		$this->activeView = 'all';
		$this->savedViews = [];
		$this->viewMode = $this->defaultViewMode();
		$this->allowedViewModes = ['table', 'cards'];
		$this->explicitViewModes = false;
		$this->createActions = [];
		$this->toolbarActions = [];
		$this->summaryCards = [];
		$this->modeState = [];
		$this->resolvedModeDelegates = [];
		$this->quickEditEnabled = true;
		$this->quickEditUrl = '';
		$this->quickEditRecordId = '';
		$this->exportEnabled = true;
		$this->exportFormats = ['csv', 'json'];
		$this->reorderEnabled = false;
		$this->locked = false;
		$this->selectable = true;
		$this->dense = false;
		$this->rowValign = 'middle';
		$this->showToolbar = true;
		$this->showFilterBar = true;
		$this->showPagination = true;
		$this->showCreateButton = true;
		$this->saveViewEnabled = true;
		$this->columnPickerEnabled = true;
		$this->createLabel = '';
		$this->createUrl = '';
		$this->createModalTarget = '';
		$this->editUrl = '';
		$this->noticeMessage = '';
		$this->noticeType = 'success';
		$this->downloadFilename = '';
		$this->downloadContent = '';
		$this->downloadMime = '';
		$this->dataProvider = null;
		$this->inertiaProps = [];

		return $this;
	}

	/**
	 * Populate viewport properties from an associative configuration array.
	 *
	 * @param array<string, mixed> $props
	 */
	public function fill(array $props = []): static
	{
		if (isset($props['dataProvider']) && $props['dataProvider'] instanceof ReactDataProviderInterface) {
			$this->setDataProvider($props['dataProvider']);
			unset($props['dataProvider']);
		}

		foreach ($props as $key => $value) {
			if (!is_string($key) || $key === '' || str_starts_with($key, '_')) {
				continue;
			}
			if ($key === 'columns' && is_array($value)) {
				$this->columns = $this->normalizeColumnsMap($value);
				$this->providerOptions['columns'] = $value;
				continue;
			}
			if ($key === 'providerOptions' && is_array($value)) {
				$this->providerOptions = array_replace($this->providerOptions, $value);
				continue;
			}
			if ($key === 'editUrl') {
				$this->editUrl = (string) $value;
				if ($this->editUrl !== '') {
					$this->providerOptions['editUrl'] = $this->editUrl;
				}
				continue;
			}
			if ($key === 'rowValign') {
				$cleanValign = strtolower(trim((string) $value));
				$this->rowValign = in_array($cleanValign, ['top', 'middle', 'bottom'], true) ? $cleanValign : 'middle';
				continue;
			}
			if ($key === 'allowedViewModes' && is_array($value)) {
				$this->allowedViewModes = array_values(array_filter(
					array_map(static fn(mixed $m): string => is_scalar($m) ? strtolower(trim((string) $m)) : '', $value),
					static fn(string $m): bool => $m !== ''
				));
				if (!array_key_exists('explicitViewModes', $props)) {
					$this->explicitViewModes = true;
				}
				continue;
			}
			if (property_exists($this, $key)) {
				$this->{$key} = $value;
				if ($key === 'modeState' && is_array($value)) {
					$this->applyModeSignedState($value);
				}
			} else {
				$this->providerOptions[$key] = $value;
			}
		}

		if ($this->editUrl !== '') {
			$this->providerOptions['editUrl'] = $this->editUrl;
		} elseif (isset($this->providerOptions['editUrl']) && is_string($this->providerOptions['editUrl']) && $this->providerOptions['editUrl'] !== '') {
			$this->editUrl = $this->providerOptions['editUrl'];
		}

		return $this;
	}

	/**
	 * Configure the viewport with a provider and properties and hydrate its initial state.
	 * Returns `$this` so it can be passed directly as an Inertia prop or chained into `->render()`.
	 *
	 * @param string|array<int|string, mixed>|Closure|PageArray|ReactDataProviderInterface $provider
	 * @param array<string, mixed> $props
	 */
	public function configure(string|array|Closure|PageArray|ReactDataProviderInterface $provider = '', array $props = []): static
	{
		if ($provider !== '' || $props !== []) {
			$this->resetViewportState();
		}

		$normalizedProps = $this->normalizeRenderProps($provider, $props);
		$this->fill($normalizedProps);

		if ($this->componentId === '') {
			$seed = $this->provider !== '' ? $this->provider : $this->className();
			$this->componentId = strtolower(preg_replace('/[^a-zA-Z0-9_-]/', '-', $seed) ?: 'viewport');
		}

		$this->loadFromProvider();

		return $this;
	}

	/**
	 * Normalize `$provider` and `$props` arguments into a flat props array.
	 *
	 * @param string|array<int|string, mixed>|Closure|PageArray|ReactDataProviderInterface $provider
	 * @param array<string, mixed> $props
	 * @return array<string, mixed>
	 */
	protected function normalizeRenderProps(
		string|array|Closure|PageArray|ReactDataProviderInterface $provider = '',
		array $props = [],
	): array {
		if ($provider instanceof ReactDataProviderInterface) {
			$props['dataProvider'] = $provider;

			return $props;
		}

		if ($provider instanceof PageArray || $provider instanceof Closure) {
			$resolved = $this->react()->providers()->resolve($provider, $props);
			$props['dataProvider'] = $resolved;

			return $props;
		}

		if (is_array($provider)) {
			if ($props === [] && !array_is_list($provider)) {
				$assoc = [];
				foreach ($provider as $k => $v) {
					$assoc[(string) $k] = $v;
				}

				return $assoc;
			}

			$props['items'] = $provider;

			return $props;
		}

		if ($provider !== '') {
			$props['provider'] = $provider;
		}

		return $props;
	}

	/**
	 * Render the interactive viewport as an HTML island for classic ProcessWire admin/frontend pages.
	 * Also supports passing `$viewport->configure($provider, $props)` directly as an Inertia prop.
	 *
	 * @param string|array<int|string, mixed>|Closure|PageArray|ReactDataProviderInterface $provider
	 * @param array<string, mixed> $props
	 */
	public function ___render(
		string|array|Closure|PageArray|ReactDataProviderInterface $provider = '',
		array $props = [],
	): string {
		if (
			$provider !== ''
			|| $props !== []
			|| ($this->records === [] && $this->columns === [])
			|| ($this->provider !== '' && ($this->dataProvider === null || $this->dataProvider->id() !== $this->provider))
		) {
			$this->configure($provider, $props);
		}

		$this->renderReady();

		return IslandMarkup::render($this->inertiaComponent(), $this->toInertiaProp(), [
			'id' => $this->componentId !== '' ? 'rw-viewport-' . $this->componentId : null,
		]);
	}

	public function inertiaShared(): array
	{
		return $this->buildReactTranslationSharedProps();
	}

	/**
	 * Provide `ReactInertia.js` and `ReactInertia.css` (plus subclass module assets)
	 * so both full-page Inertia and classic island rendering include them automatically.
	 *
	 * @param array<string, mixed> $pageObject
	 * @return array<string, mixed>
	 */
	public function inertiaViewData(array $pageObject = []): array
	{
		$workspace = $this->react();

		return [
			'scripts' => $workspace->resolveInertiaScriptAssets($this->getModuleScriptAssets()),
			'styles' => $workspace->resolveInertiaStyleAssets($this->getModuleStyleAssets()),
		];
	}

	/**
	 * Resolve the active `ReactDataProviderInterface` instance from direct injection,
	 * `React::instance()->providers()`, or inline `$this->items`.
	 */
	public function resolveDataProvider(): ?ReactDataProviderInterface
	{
		if ($this->dataProvider !== null) {
			if ($this->provider !== '' && $this->dataProvider->id() !== $this->provider) {
				$this->dataProvider = null;
				$this->columns = [];
				$this->records = [];
			} else {
				if ($this->providerOptions !== [] && method_exists($this->dataProvider, 'applyOptions')) {
					$this->dataProvider->applyOptions($this->providerOptions);
				}

				return $this->dataProvider;
			}
		}

		if ($this->provider !== '') {
			try {
				$resolved = $this->react()->providers()->resolve($this->provider, $this->providerOptions);
				$this->dataProvider = $resolved;

				return $resolved;
			} catch (\ProcessWire\WirePermissionException $e) {
				throw $e;
			} catch (\Throwable) {
				// Fallback to inline items if registry cannot resolve descriptor
			}
		}

		if ($this->items !== []) {
			$resolved = $this->react()->providers()->resolve($this->items, $this->providerOptions);
			$this->dataProvider = $resolved;

			return $this->dataProvider;
		}

		return null;
	}

	/**
	 * Hydrate columns, filters, views, summary cards, and paginated records from the data provider.
	 */
	public function loadFromProvider(): void
	{
		$this->applyViewPreferences();

		$provider = $this->resolveDataProvider();
		if ($provider === null) {
			$this->total = count($this->records);
			$this->totalPages = max(1, (int) ceil($this->total / max(1, $this->limit)));

			return;
		}

		if ($this->title === '') {
			$this->title = $provider->title();
		}
		$this->locked = $this->locked || $provider->isLocked();
		if ($this->locked) {
			$this->selectable = false;
			$this->quickEditEnabled = false;
		}

		// Hydrate columns from provider (`availableColumns` + `columns` + `sortableColumns` + `inlineEditableFields` + optional `columnSchemas`)
		$providerCols = $provider instanceof ReactFieldSchemaProvider
			? $provider->availableColumns()
			: $provider->columns();
		/** @var array<string, array<string, mixed>> $providerColSchemas */
		$providerColSchemas = method_exists($provider, 'columnSchemas')
			? (array) $provider->columnSchemas()
			: [];
		$defaultVisibleCols = array_keys($provider->columns());
		$sortableCols = $provider->sortableColumns();
		$editableFields = $provider instanceof ReactFieldSchemaProvider ? $provider->inlineEditableFields() : [];
		$this->inlineEditableFields = array_replace($editableFields, $this->inlineEditableFields);

		if ($this->columns === []) {
			$normalized = [];
			foreach ($providerCols as $colKey => $colLabel) {
				$strKey = (string) $colKey;
				$editDef = $this->inlineEditableFields[$strKey] ?? null;
				$schemaMeta = is_array($providerColSchemas[$strKey] ?? null) ? $providerColSchemas[$strKey] : [];
				$inlineMeta = is_array($colLabel) ? $colLabel : [];
				$mergedMeta = array_replace($schemaMeta, $inlineMeta);
				$normalized[$strKey] = array_replace($mergedMeta, [
					'label' => is_array($colLabel) ? (string) ($colLabel['label'] ?? $strKey) : (string) $colLabel,
					'sortable' => isset($mergedMeta['sortable'])
						? (bool) $mergedMeta['sortable']
						: in_array($strKey, $sortableCols, true),
					'type' => is_array($editDef)
						? (string) ($editDef['type'] ?? $mergedMeta['type'] ?? 'text')
						: (string) ($mergedMeta['type'] ?? 'text'),
					'editable' => !$this->locked && is_array($editDef),
					'options' => is_array($editDef) && is_array($editDef['options'] ?? null)
						? $editDef['options']
						: (is_array($mergedMeta['options'] ?? null) ? $mergedMeta['options'] : []),
				]);
				if (!in_array($strKey, $defaultVisibleCols, true) && !in_array($strKey, $this->hiddenColumns, true)) {
					$this->hiddenColumns[] = $strKey;
				}
			}
			$this->columns = $normalized;
		} else {
			foreach ($this->columns as $colKey => $colDef) {
				$schemaMeta = is_array($providerColSchemas[$colKey] ?? null) ? $providerColSchemas[$colKey] : [];
				if ($schemaMeta !== []) {
					$this->columns[$colKey] = array_replace($schemaMeta, $colDef);
					$colDef = $this->columns[$colKey];
				}
				$editDef = $this->inlineEditableFields[$colKey] ?? null;
				if (is_array($editDef)) {
					if (!array_key_exists('editable', $colDef)) {
						$this->columns[$colKey]['editable'] = !$this->locked;
					}
					if (!isset($colDef['type']) && isset($editDef['type'])) {
						$this->columns[$colKey]['type'] = (string) $editDef['type'];
					}
					if (empty($colDef['options']) && is_array($editDef['options'] ?? null)) {
						$this->columns[$colKey]['options'] = $editDef['options'];
					}
				}
			}
		}

		// Hydrate filters (`status` + `filterableFields`)
		if ($this->filters === []) {
			$this->filters = $this->resolveProviderFilters($provider);
		}

		// Hydrate default bulk actions when not locked
		if ($this->bulkActions === [] && !$this->locked) {
			$this->bulkActions = [
				ReactDataProviderInterface::OP_PUBLISH => [
					'label' => $this->_('Publish'),
					'icon' => 'check-circle',
				],
				ReactDataProviderInterface::OP_DRAFT => [
					'label' => $this->_('Set Draft'),
					'icon' => 'file-minus',
				],
				ReactDataProviderInterface::OP_TRASH => [
					'label' => $this->_('Move to Trash'),
					'icon' => 'trash-2',
					'variant' => 'danger',
					'confirm' => $this->_('Move selected records to trash?'),
				],
			];
		}

		if ($this->views === [] && $provider instanceof ReactViewsProvider) {
			$this->views = $provider->savedViews();
		}
		if ($provider instanceof ReactReorderProvider) {
			$this->reorderEnabled = $provider->isSortable();
		}
		if ($this->exportEnabled) {
			if ($provider instanceof ReactExportProvider) {
				$formats = $provider->exportFormats();
				if ($formats !== []) {
					$this->exportFormats = $formats;
				} else {
					$this->exportEnabled = false;
				}
			} else {
				$this->exportEnabled = false;
			}
		}
		if (!$this->showCreateButton) {
			$this->createUrl = '';
			$this->createLabel = '';
			$this->createActions = [];
		} else {
			if ($provider instanceof ReactRecordActionsProvider && $this->createUrl === '') {
				$createAct = $provider->createAction();
				if (is_array($createAct)) {
					$this->createUrl = (string) ($createAct['url'] ?? '');
					$this->createLabel = (string) ($createAct['label'] ?? $this->_('Create New'));
				}
			}
			if ($this->createActions === [] && method_exists($provider, 'createActions')) {
				/** @var list<array{key?: string, label: string, href?: string, icon?: string, dataAttrs?: array<string, string>}> $providerCreateActions */
				$providerCreateActions = (array) $provider->createActions();
				$this->createActions = array_values($providerCreateActions);
			}
		}
		if (method_exists($provider, 'toolbarActions')) {
			/** @var list<array{key: string, label: string, href?: string, icon?: string, variant?: string, badge?: string, confirm?: string, dataAttrs?: array<string, string>}> $providerToolbarActions */
			$providerToolbarActions = (array) $provider->toolbarActions();
			$this->toolbarActions = array_values($providerToolbarActions);
		}

		$this->modeConfigureOptions($provider);
		$delegate = $this->resolveModeDelegate();
		if ($delegate !== null) {
			$delegate->modeConfigureOptions($provider);
			$this->modeState = array_replace($this->modeState, $delegate->modeStateExport());
		}

		// Determine allowed view modes based on registered contracts, mode delegates, and installed modules
		$this->allowedViewModes = $this->resolveAvailableViewModes();

		$criteria = $this->buildQueryCriteria();

		if ($provider instanceof ReactSummaryProvider && $this->summaryCards === []) {
			$computed = $provider->computeSummaries($criteria);
			foreach ($computed as $colKey => $sumData) {
				$this->summaryCards[] = [
					'key' => (string) $colKey,
					'label' => (string) ($sumData['label'] ?? $colKey),
					'value' => (string) ($sumData['formatted'] ?? $sumData['raw'] ?? '0'),
				];
			}
		}

		$modeResult = $delegate !== null
			? $delegate->modeLoadRecords($provider, $criteria)
			: $this->modeLoadRecords($provider, $criteria);
		$result = $modeResult ?? $provider->query($criteria);
		$this->reactRecords = $result->items;
		$this->records = array_map(
			fn(ReactRecord $r): array => $this->serializeReactRecord($r),
			$result->items
		);
		$this->total = $result->total;
		$this->pageNum = $result->pageNum;
		$this->totalPages = $result->totalPages();
		$this->trashCount = $result->trashCount;
	}

	/**
	 * Determine whether a registered pluggable mode supports the active provider.
	 *
	 * @param array{module?: string, contract?: string, icon?: string, label?: string} $meta
	 */
	private function isRegisteredModeEligible(string $mode, array $meta, ?ReactDataProviderInterface $provider): bool
	{
		$modules = $this->wire()->modules;
		$modName = trim((string) ($meta['module'] ?? ''));
		if ($modName === '' || !$modules->isInstalled($modName)) {
			return false;
		}
		if ($provider === null) {
			return true;
		}

		$contract = trim((string) ($meta['contract'] ?? ''));
		if ($contract !== '') {
			if (!interface_exists($contract) || !$provider instanceof $contract) {
				return false;
			}
		}

		$delegate = strtolower(trim($this->defaultViewMode())) === $mode
			? $this
			: $this->resolveModeDelegate($mode);

		return $delegate === null || $delegate->modeSupportsProvider($provider);
	}

	/**
	 * Resolve available viewport layout modes gated by provider contracts and installed viewport modules.
	 *
	 * @return list<string>
	 */
	protected function resolveAvailableViewModes(): array
	{
		$modules = $this->wire()->modules;
		$provider = $this->resolveDataProvider();
		$registered = $this->react()->getRegisteredViewportModes();

		if ($this->explicitViewModes && $this->allowedViewModes !== []) {
			$pinned = [];
			foreach ($this->allowedViewModes as $customMode) {
				$cleanMode = strtolower(trim((string) $customMode));
				if ($cleanMode === '' || in_array($cleanMode, $pinned, true)) {
					continue;
				}
				if (in_array($cleanMode, ['table', 'cards'], true)) {
					$pinned[] = $cleanMode;
					continue;
				}
				if (isset($registered[$cleanMode])) {
					if ($this->isRegisteredModeEligible($cleanMode, $registered[$cleanMode], $provider)) {
						$pinned[] = $cleanMode;
					}
					continue;
				}
				if ($modules->isInstalled((string) $customMode)) {
					$pinned[] = $cleanMode;
				}
			}

			return $pinned !== [] ? $pinned : ['table'];
		}

		$modes = ['table', 'cards'];

		foreach ($registered as $regMode => $meta) {
			if ($this->isRegisteredModeEligible($regMode, $meta, $provider) && !in_array($regMode, $modes, true)) {
				$modes[] = $regMode;
			}
		}

		foreach ($this->allowedViewModes as $customMode) {
			$cleanMode = strtolower(trim((string) $customMode));
			if ($cleanMode === '' || in_array($cleanMode, $modes, true)) {
				continue;
			}
			if (isset($registered[$cleanMode])) {
				if ($this->isRegisteredModeEligible($cleanMode, $registered[$cleanMode], $provider)) {
					$modes[] = $cleanMode;
				}
				continue;
			}
			if ($modules->isInstalled((string) $customMode)) {
				$modes[] = $cleanMode;
			}
		}

		return $modes;
	}

	/**
	 * Resolve allowlisted client filter keys declared via filters, `providerOptions['filterableFields']`,
	 * column `filterable`/`filter` schemas, or `ReactFieldSchemaProvider::filterableFields()`.
	 *
	 * @return array<string, true>
	 */
	protected function resolveAllowedClientFilterKeys(): array
	{
		/** @var array<string, true> $allowed */
		$allowed = ['status' => true];

		foreach (array_keys($this->filters) as $filterKey) {
			$clean = trim((string) $filterKey);
			if ($clean !== '') {
				$allowed[$clean] = true;
			}
		}

		$rawFilterable = $this->providerOptions['filterableFields'] ?? null;
		if (is_array($rawFilterable)) {
			foreach ($rawFilterable as $k => $v) {
				$key = is_int($k)
					? (is_array($v) ? (string) ($v['key'] ?? $v['name'] ?? '') : (string) $v)
					: (string) $k;
				$clean = trim($key);
				if ($clean !== '') {
					$allowed[$clean] = true;
				}
			}
		}

		foreach ($this->columns as $colKey => $colDef) {
			if (is_array($colDef) && (!empty($colDef['filterable']) || !empty($colDef['filter']))) {
				$clean = trim((string) $colKey);
				if ($clean !== '') {
					$allowed[$clean] = true;
				}
			}
		}

		$provider = $this->resolveDataProvider();
		if ($provider instanceof ReactFieldSchemaProvider) {
			foreach ($provider->filterableFields() as $fKey => $fDef) {
				$clean = is_int($fKey)
					? (is_array($fDef) ? trim((string) ($fDef['key'] ?? $fDef['name'] ?? '')) : trim((string) $fDef))
					: trim((string) $fKey);
				if ($clean !== '') {
					$allowed[$clean] = true;
				}
			}
		}

		return $allowed;
	}

	/**
	 * Build the `$criteria` array expected by `ReactDataProviderInterface::query()`.
	 *
	 * @return array<string, mixed>
	 */
	protected function buildQueryCriteria(): array
	{
		$allowedFilterKeys = $this->resolveAllowedClientFilterKeys();
		$filteredValues = [];
		$fieldFilters = [];
		$statusFilter = $this->statusFilter;

		foreach ($this->filterValues as $k => $v) {
			$cleanKey = trim((string) $k);
			if ($cleanKey === '' || !isset($allowedFilterKeys[$cleanKey]) || $v === '' || $v === null) {
				continue;
			}
			$filteredValues[$cleanKey] = $v;
			if ($cleanKey === 'status') {
				$statusFilter = (string) $v;
			} else {
				$fieldFilters[$cleanKey] = (string) $v;
			}
		}
		$this->filterValues = $filteredValues;

		$sortBy = $this->sortField !== ''
			? ($this->sortDirection === 'desc' ? '-' . $this->sortField : $this->sortField)
			: '';

		if ($this->activeView !== '' && $this->activeView !== 'all') {
			if (str_starts_with($this->activeView, 'saved:')) {
				$savedKey = substr($this->activeView, 6);
				$preset = $this->savedViews[$savedKey] ?? null;
				if (is_array($preset)) {
					foreach (($preset['filters'] ?? []) as $pk => $pv) {
						$cleanPk = trim((string) $pk);
						if ($cleanPk === '' || !isset($allowedFilterKeys[$cleanPk])) {
							continue;
						}
						if ($cleanPk === 'status') {
							$statusFilter = $statusFilter !== '' ? $statusFilter : (string) $pv;
						} elseif (!isset($fieldFilters[$cleanPk])) {
							$fieldFilters[$cleanPk] = (string) $pv;
						}
					}
				}
			} elseif (isset($this->views[$this->activeView]) && is_array($this->views[$this->activeView])) {
				$viewDef = $this->views[$this->activeView];
				if (isset($viewDef['fieldFilters']) && is_array($viewDef['fieldFilters'])) {
					$fieldFilters = array_replace($viewDef['fieldFilters'], $fieldFilters);
				}
				if (isset($viewDef['filters']) && is_array($viewDef['filters'])) {
					$fieldFilters = array_replace($viewDef['filters'], $fieldFilters);
				}
				if ($sortBy === '' && !empty($viewDef['sort'])) {
					$sortBy = (string) $viewDef['sort'];
				}
			}
		}

		$delegate = $this->resolveModeDelegate();
		$effectiveLimit = $delegate !== null
			? $delegate->modeQueryLimit($this->limit)
			: $this->modeQueryLimit($this->limit);

		return [
			'search' => $this->searchQuery,
			'statusFilter' => $statusFilter,
			'fieldFilters' => $fieldFilters,
			'dateFrom' => $this->dateFrom,
			'dateTo' => $this->dateTo,
			'sortBy' => $sortBy,
			'groupBy' => $this->groupBy,
			'activeView' => $this->activeView,
			'pageNum' => max(1, $this->pageNum),
			'limit' => $effectiveLimit,
			'editUrl' => $this->editUrl,
		];
	}

	/**
	 * Convert a `ReactRecord` DTO into a flat associative array for React viewports.
	 *
	 * @return array<string, mixed>
	 */
	protected function serializeReactRecord(ReactRecord $record): array
	{
		$resolvedThumb = self::resolveRecordThumb($record);
		$row = array_replace($record->values, [
			'id' => $record->id,
			'title' => $record->title,
			'name' => $record->name,
			'status' => $record->statusLabel,
			'_statusMask' => $record->status,
			'_statusVariant' => $record->statusVariant,
			'_statusLabel' => $record->statusLabel,
			'_editUrl' => $record->editUrl,
			'_viewUrl' => $record->viewUrl,
			'_subtitle' => $record->subtitle,
			'_hasDraft' => $record->hasDraft,
			'hasDraft' => $record->hasDraft,
			'_locked' => $record->isLocked(),
			'_depth' => $record->depth,
			'_sort' => $record->sort,
			'_formatted' => $record->formatted,
		]);

		if ($record->icon !== '' && $record->icon !== []) {
			$row['_icon'] = $record->icon;
		}
		if ($resolvedThumb !== null) {
			$row['_thumb'] = $resolvedThumb;
		}
		if ($record->badges !== []) {
			$row['_badges'] = $record->badges;
		}
		if ($record->cells !== []) {
			$row['_cells'] = $record->cells;
		}
		if ($record->meta !== []) {
			$row['_meta'] = $record->meta;
		}

		foreach ($record->formatted as $colKey => $formattedVal) {
			if (!array_key_exists($colKey, $row)) {
				$row[$colKey] = $formattedVal;
			}
		}

		return $row;
	}

	/**
	 * Resolve a sanitized `{ src, darkSrc?, alt, count, aspect? }` thumbnail descriptor from `ReactRecord::$thumb` or `$thumbHtml`.
	 *
	 * @return array{src: string, darkSrc?: string, alt: string, count: int, aspect?: string}|null
	 */
	protected static function resolveRecordThumb(ReactRecord $record): ?array
	{
		if (is_array($record->thumb)) {
			$safeSrc = UrlSanitizer::sanitizeImageSrc((string) ($record->thumb['src'] ?? ''));
			if ($safeSrc !== '') {
				$out = [
					'src' => $safeSrc,
					'alt' => (string) ($record->thumb['alt'] ?? $record->title),
					'count' => max(1, (int) ($record->thumb['count'] ?? 1)),
				];
				$rawDark = isset($record->thumb['darkSrc']) && is_string($record->thumb['darkSrc'])
					? UrlSanitizer::sanitizeImageSrc($record->thumb['darkSrc'])
					: '';
				if ($rawDark !== '') {
					$out['darkSrc'] = $rawDark;
				}
				$rawAspect = isset($record->thumb['aspect']) && is_string($record->thumb['aspect'])
					? strtolower(trim($record->thumb['aspect']))
					: '';
				if ($rawAspect === 'video' || $rawAspect === 'square') {
					$out['aspect'] = $rawAspect;
				}

				return $out;
			}
		}

		if ($record->thumbHtml !== '' && preg_match('/\bsrc="([^"]+)"/i', $record->thumbHtml, $srcMatch) === 1) {
			$decodedSrc = html_entity_decode($srcMatch[1], ENT_QUOTES, 'UTF-8');
			$safeSrc = UrlSanitizer::sanitizeImageSrc($decodedSrc);
			if ($safeSrc !== '') {
				$alt = $record->title;
				if (preg_match('/\balt="([^"]*)"/i', $record->thumbHtml, $altMatch) === 1) {
					$alt = html_entity_decode($altMatch[1], ENT_QUOTES, 'UTF-8');
				}
				$count = 1;
				if (preg_match('/>\+(\d+)</', $record->thumbHtml, $cntMatch) === 1) {
					$count = 1 + max(0, (int) $cntMatch[1]);
				}

				return [
					'src' => $safeSrc,
					'alt' => $alt,
					'count' => $count,
				];
			}
		}

		return null;
	}

	/**
	 * Normalize shorthand `['title' => 'Title']` or full column definitions into standard column schemas.
	 *
	 * @param array<int|string, mixed> $rawColumns
	 * @return array<string, array<string, mixed>>
	 */
	protected function normalizeColumnsMap(array $rawColumns): array
	{
		$normalized = [];
		foreach ($rawColumns as $k => $v) {
			if (is_int($k) && is_string($v)) {
				$normalized[$v] = [
					'label' => ucfirst(str_replace('_', ' ', $v)),
					'sortable' => true,
				];
			} elseif (is_string($k) && is_string($v)) {
				$normalized[$k] = [
					'label' => $v,
					'sortable' => true,
				];
			} elseif (is_string($k) && is_array($v)) {
				$normalized[$k] = array_replace([
					'label' => (string) ($v['label'] ?? ucfirst(str_replace('_', ' ', $k))),
					'sortable' => (bool) ($v['sortable'] ?? true),
				], $v);
			}
		}

		return $normalized;
	}

	/**
	 * Load persisted view preferences from `ReactViewPreferenceStore`.
	 */
	protected function applyViewPreferences(): void
	{
		$store = $this->preferenceStore();
		if ($store === null) {
			return;
		}

		$prefs = $store->load($this);
		if (isset($prefs['savedViews']) && is_array($prefs['savedViews'])) {
			$this->savedViews = $prefs['savedViews'];
		}
		if ($this->hiddenColumns === [] && isset($prefs['hiddenColumns']) && is_array($prefs['hiddenColumns'])) {
			$this->hiddenColumns = array_values(array_map('strval', $prefs['hiddenColumns']));
		}
		if ($this->activeView === 'all' && isset($prefs['activeView']) && is_string($prefs['activeView']) && $prefs['activeView'] !== '') {
			$this->activeView = $prefs['activeView'];
		}
		if ($this->sortField === '' && isset($prefs['sortField']) && is_string($prefs['sortField'])) {
			$this->sortField = $prefs['sortField'];
		}
		if (isset($prefs['sortDirection']) && in_array($prefs['sortDirection'], ['asc', 'desc'], true)) {
			$this->sortDirection = $prefs['sortDirection'];
		}
	}

	protected function preferenceStore(): ?ReactViewPreferenceStore
	{
		try {
			$store = new ReactViewPreferenceStore();
			$this->wire($store);

			return $store;
		} catch (\Throwable) {
			return null;
		}
	}

	/**
	 * Determine whether `$field` is allowed for inline or quick-edit mutation.
	 */
	protected function isFieldEditable(string $field, bool $allowTitle = false): bool
	{
		if ($field === '') {
			return false;
		}
		if ($allowTitle && $field === 'title') {
			return true;
		}
		if (isset($this->inlineEditableFields[$field])) {
			return true;
		}
		if (isset($this->columns[$field]) && !empty($this->columns[$field]['editable'])) {
			return true;
		}

		return false;
	}

	/**
	 * Determine whether `$field` is allowed for bulk field mutation (`isFieldEditable()` or declared in `bulkEditableFields()`).
	 */
	protected function isBulkFieldEditable(string $field, ?ReactDataProviderInterface $provider): bool
	{
		if ($this->isFieldEditable($field)) {
			return true;
		}
		if ($field === '' || !$provider instanceof ReactBulkFieldsProvider) {
			return false;
		}

		foreach ($provider->bulkEditableFields() as $key => $spec) {
			if (is_string($key) && $key === $field) {
				return true;
			}
			if (is_array($spec) && (string) ($spec['name'] ?? '') === $field) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Execute an interactive viewport action (`search`, `filter`, `sort`, `page`, `bulk_action`,
	 * `row_action`, `update_field`, `toggle_field`, `reorder`, `save_quick_edit`, `export`,
	 * or pluggable mode actions) and reload the viewport state.
	 *
	 * @param array<string, mixed> $payload
	 * @return array<string, mixed> Updated Inertia viewport prop payload
	 */
	public function executeAction(string $action, array $payload = []): array
	{
		$this->noticeMessage = '';
		$this->downloadFilename = '';
		$this->downloadContent = '';
		$this->downloadMime = '';
		$actionError = '';

		$provider = $this->resolveDataProvider();
		if ($provider instanceof ReactFieldSchemaProvider) {
			$this->inlineEditableFields = array_replace($provider->inlineEditableFields(), $this->inlineEditableFields);
		}
		if ($this->columns === [] && $provider !== null) {
			$this->loadFromProvider();
		}
		$isLocked = $this->locked || ($provider !== null && $provider->isLocked());
		$store = $this->preferenceStore();
		$refreshModeMetadata = false;

		$delegate = $this->resolveModeDelegate();
		$modeResult = $delegate !== null
			? $delegate->modeExecuteAction($action, $payload, $provider)
			: $this->modeExecuteAction($action, $payload, $provider);

		if (is_array($modeResult) && !empty($modeResult['handled'])) {
			if (isset($modeResult['error']) && is_string($modeResult['error']) && $modeResult['error'] !== '') {
				$actionError = $modeResult['error'];
				$this->noticeMessage = $actionError;
				$this->noticeType = 'error';
			} else {
				if (isset($modeResult['notice']) && is_string($modeResult['notice']) && $modeResult['notice'] !== '') {
					$this->noticeMessage = $modeResult['notice'];
					$this->noticeType = (string) ($modeResult['noticeType'] ?? 'success');
				}
				if (!empty($modeResult['refreshMetadata'])) {
					$refreshModeMetadata = true;
				}
			}
			if ($delegate !== null) {
				$this->modeState = array_replace($this->modeState, $delegate->modeStateExport());
			}
		} else {
			switch ($action) {
			case 'fetch':
			case 'refresh':
				break;

			case 'search':
				$this->searchQuery = trim((string) ($payload['query'] ?? $payload['searchQuery'] ?? ''));
				$this->pageNum = 1;
				$this->selectedIds = [];
				break;

			case 'filter':
				$allowedFilterKeys = $this->resolveAllowedClientFilterKeys();
				if (isset($payload['filters']) && is_array($payload['filters'])) {
					foreach ($payload['filters'] as $k => $v) {
						if (!is_string($k)) {
							continue;
						}
						$cleanKey = trim($k);
						if ($cleanKey === '' || !isset($allowedFilterKeys[$cleanKey])) {
							continue;
						}
						if ($v === '' || $v === null) {
							unset($this->filterValues[$cleanKey]);
							if ($cleanKey === 'status') {
								$this->statusFilter = '';
							}
						} else {
							$this->filterValues[$cleanKey] = $v;
							if ($cleanKey === 'status') {
								$this->statusFilter = trim((string) $v);
							}
						}
					}
				} else {
					$key = trim((string) ($payload['key'] ?? ''));
					$val = $payload['value'] ?? null;
					if ($key !== '' && isset($allowedFilterKeys[$key])) {
						if ($val === '' || $val === null) {
							unset($this->filterValues[$key]);
							if ($key === 'status') {
								$this->statusFilter = '';
							}
						} else {
							$this->filterValues[$key] = $val;
							if ($key === 'status') {
								$this->statusFilter = trim((string) $val);
							}
						}
					}
				}
				$this->pageNum = 1;
				$this->selectedIds = [];
				break;

			case 'reset_filters':
				$this->searchQuery = '';
				$this->statusFilter = '';
				$this->filterValues = [];
				$this->activeView = 'all';
				$this->pageNum = 1;
				$this->selectedIds = [];
				$store?->setActiveView($this, 'all');
				break;

			case 'sort':
				$field = trim((string) ($payload['field'] ?? ''));
				if ($field !== '') {
					if (isset($payload['direction']) && in_array($payload['direction'], ['asc', 'desc'], true)) {
						$this->sortDirection = (string) $payload['direction'];
					} elseif ($this->sortField === $field) {
						$this->sortDirection = $this->sortDirection === 'asc' ? 'desc' : 'asc';
					} else {
						$this->sortDirection = 'asc';
					}
					$this->sortField = $field;
					$this->pageNum = 1;
					$store?->setActiveView($this, $this->activeView);
				}
				break;

			case 'page':
			case 'paginate':
				if (isset($payload['limit'])) {
					$this->limit = max(1, min(500, (int) $payload['limit']));
				}
				$this->pageNum = max(1, (int) ($payload['page'] ?? $payload['pageNum'] ?? 1));
				$this->selectedIds = [];
				break;

			case 'select_row':
				$id = (string) ($payload['id'] ?? '');
				if ($id !== '') {
					$existing = array_map('strval', $this->selectedIds);
					if (in_array($id, $existing, true)) {
						$this->selectedIds = array_values(array_filter(
							$this->selectedIds,
							static fn($v): bool => (string) $v !== $id
						));
					} else {
						$this->selectedIds[] = $id;
					}
				}
				break;

			case 'select_all':
				if (isset($payload['ids']) && is_array($payload['ids'])) {
					$this->selectedIds = array_values(array_map('strval', $payload['ids']));
				}
				break;

			case 'clear_selection':
				$this->selectedIds = [];
				break;

			case 'switch_view_mode':
				$mode = strtolower(trim((string) ($payload['mode'] ?? '')));
				$availableModes = $this->resolveAvailableViewModes();
				if ($mode === '' || !in_array($mode, $availableModes, true)) {
					$actionError = 'Unsupported viewport mode.';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$this->viewMode = $mode;
				$store?->setActiveView($this, $this->activeView);
				break;

			case 'select_view':
				$viewKey = trim((string) ($payload['view'] ?? 'all'));
				$this->activeView = $viewKey !== '' ? $viewKey : 'all';
				$this->pageNum = 1;
				$this->selectedIds = [];
				if (str_starts_with($this->activeView, 'saved:')) {
					$savedKey = substr($this->activeView, 6);
					$preset = $this->savedViews[$savedKey] ?? null;
					if (is_array($preset)) {
						$allowedFilterKeys = $this->resolveAllowedClientFilterKeys();
						$filteredPreset = [];
						if (is_array($preset['filters'] ?? null)) {
							foreach ($preset['filters'] as $pk => $pv) {
								$cleanPk = trim((string) $pk);
								if ($cleanPk !== '' && isset($allowedFilterKeys[$cleanPk])) {
									$filteredPreset[$cleanPk] = $pv;
								}
							}
						}
						$this->filterValues = $filteredPreset;
						$this->searchQuery = (string) ($preset['searchQuery'] ?? '');
						if (!empty($preset['sortField'])) {
							$this->sortField = (string) $preset['sortField'];
						}
						if (!empty($preset['sortDirection'])) {
							$this->sortDirection = (string) $preset['sortDirection'];
						}
					}
				} else {
					$this->filterValues = [];
				}
				$store?->setActiveView($this, $this->activeView);
				break;

			case 'save_view':
				$label = trim((string) ($payload['label'] ?? ''));
				if ($label !== '' && $store !== null) {
					$allowedFilterKeys = $this->resolveAllowedClientFilterKeys();
					$this->filterValues = array_filter(
						$this->filterValues,
						static fn(mixed $val, mixed $key): bool => is_string($key) && isset($allowedFilterKeys[trim($key)]),
						ARRAY_FILTER_USE_BOTH,
					);
					$store->savePreset($this, $label, $label);
					$prefs = $store->load($this);
					$this->savedViews = is_array($prefs['savedViews'] ?? null) ? $prefs['savedViews'] : [];
					$this->activeView = (string) ($prefs['activeView'] ?? $this->activeView);
					$this->noticeMessage = sprintf($this->_('Saved view "%s".'), $label);
					$this->noticeType = 'success';
				}
				break;

			case 'delete_view':
				$viewKey = trim((string) ($payload['view'] ?? ''));
				if ($viewKey !== '' && $store !== null) {
					$store->deletePreset($this, $viewKey);
					$prefs = $store->load($this);
					$this->savedViews = is_array($prefs['savedViews'] ?? null) ? $prefs['savedViews'] : [];
					$this->activeView = (string) ($prefs['activeView'] ?? 'all');
					$this->filterValues = [];
				}
				break;

			case 'toggle_column':
				$col = trim((string) ($payload['column'] ?? ''));
				if ($col !== '') {
					if (in_array($col, $this->hiddenColumns, true)) {
						$this->hiddenColumns = array_values(array_filter(
							$this->hiddenColumns,
							static fn(string $c): bool => $c !== $col
						));
					} else {
						$this->hiddenColumns[] = $col;
					}
					$store?->setActiveView($this, $this->activeView);
				}
				break;

			case 'reset_columns':
				$this->hiddenColumns = [];
				$store?->setActiveView($this, $this->activeView);
				break;

			case 'bulk_action':
				if ($isLocked) {
					$actionError = 'Viewport is locked';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$bulkKey = trim((string) ($payload['bulkAction'] ?? $payload['key'] ?? ''));
				$ids = isset($payload['ids']) && is_array($payload['ids'])
					? array_slice(array_values(array_map('strval', $payload['ids'])), 0, 500)
					: array_slice(array_values(array_map('strval', $this->selectedIds)), 0, 500);
				$mutationPayload = isset($payload['fields']) && is_array($payload['fields'])
					? $payload['fields']
					: $payload;

				if ($bulkKey === ReactDataProviderInterface::OP_UPDATE_FIELD || $bulkKey === ReactDataProviderInterface::OP_TOGGLE_FIELD) {
					$targetField = trim((string) ($mutationPayload['field'] ?? $payload['field'] ?? ''));
					if ($targetField === '' || !$this->isBulkFieldEditable($targetField, $provider)) {
						$actionError = 'Field is not editable';
						$this->noticeMessage = $actionError;
						$this->noticeType = 'error';
						break;
					}
				} elseif (($bulkKey === ReactDataProviderInterface::OP_REORDER || $bulkKey === ReactDataProviderInterface::OP_MOVE) && !$this->reorderEnabled) {
					$actionError = 'Reordering is not enabled';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}

				if ($bulkKey !== '' && $ids !== [] && $provider !== null) {
					$modified = $provider->mutate($bulkKey, $ids, $mutationPayload);
					$this->noticeMessage = sprintf($this->_('Updated %d record(s).'), $modified);
					$this->noticeType = 'success';
					$this->selectedIds = [];
				}
				break;

			case 'row_action':
				if ($isLocked) {
					$actionError = 'Viewport is locked';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$nestedAction = isset($payload['action']) && is_string($payload['action']) && $payload['action'] !== 'row_action'
					? $payload['action']
					: null;
				$actionKey = trim((string) ($payload['rowAction'] ?? $payload['key'] ?? $nestedAction ?? ''));
				$id = trim((string) ($payload['id'] ?? ''));
				if ($actionKey === ReactDataProviderInterface::OP_UPDATE_FIELD || $actionKey === ReactDataProviderInterface::OP_TOGGLE_FIELD) {
					$targetField = trim((string) ($payload['field'] ?? ''));
					if ($targetField === '' || !$this->isFieldEditable($targetField)) {
						$actionError = 'Field is not editable';
						$this->noticeMessage = $actionError;
						$this->noticeType = 'error';
						break;
					}
				} elseif (($actionKey === ReactDataProviderInterface::OP_REORDER || $actionKey === ReactDataProviderInterface::OP_MOVE) && !$this->reorderEnabled) {
					$actionError = 'Reordering is not enabled';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				if ($actionKey !== '' && $id !== '' && $provider !== null) {
					$modified = $provider->mutate($actionKey, [$id], $payload);
					$customNotice = method_exists($provider, 'consumeLastNotice') ? $provider->consumeLastNotice() : null;
					if (is_string($customNotice) && $customNotice !== '') {
						$this->noticeMessage = $customNotice;
					} elseif ($modified > 0) {
						$this->noticeMessage = match ($actionKey) {
							ReactDataProviderInterface::OP_TOGGLE_STATUS => $this->_('Toggled record status.'),
							ReactDataProviderInterface::OP_DUPLICATE, 'clone' => $this->_('Item duplicated.'),
							ReactDataProviderInterface::OP_TRASH => $this->_('Moved to trash.'),
							ReactDataProviderInterface::OP_RESTORE => $this->_('Restored from trash.'),
							ReactDataProviderInterface::OP_DELETE => $this->_('Deleted permanently.'),
							default => $this->_('Changes saved.'),
						};
					} else {
						$this->noticeMessage = $this->_('No changes made.');
					}
					$this->noticeType = 'success';
				}
				break;

			case 'toolbar_action':
				if ($isLocked) {
					$actionError = 'Viewport is locked';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$toolbarKey = trim((string) ($payload['toolbarAction'] ?? $payload['key'] ?? ''));
				if ($toolbarKey !== '' && $provider !== null) {
					$modified = $provider->mutate('toolbar:' . $toolbarKey, [], $payload);
					$customNotice = method_exists($provider, 'consumeLastNotice') ? $provider->consumeLastNotice() : null;
					if (is_string($customNotice) && $customNotice !== '') {
						$this->noticeMessage = $customNotice;
					} elseif ($modified > 0) {
						$this->noticeMessage = sprintf($this->_('Updated %d record(s).'), $modified);
					} else {
						$this->noticeMessage = $this->_('No changes made.');
					}
					$this->noticeType = 'success';
				}
				break;

			case 'update_field':
				if ($isLocked) {
					$actionError = 'Viewport is locked';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$id = trim((string) ($payload['id'] ?? ''));
				$field = trim((string) ($payload['field'] ?? ''));
				$val = $payload['value'] ?? '';
				if ($field === '' || !$this->isFieldEditable($field)) {
					$actionError = 'Field is not editable';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				if ($id !== '' && $provider !== null) {
					$provider->mutate(ReactDataProviderInterface::OP_UPDATE_FIELD, [$id], [
						'field' => $field,
						'value' => $val,
					]);
					$this->noticeMessage = $this->_('Field updated.');
					$this->noticeType = 'success';
				}
				break;

			case 'toggle_field':
				if ($isLocked) {
					$actionError = 'Viewport is locked';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$id = trim((string) ($payload['id'] ?? ''));
				$field = trim((string) ($payload['field'] ?? ''));
				if ($field === '' || !$this->isFieldEditable($field)) {
					$actionError = 'Field is not editable';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				if ($id !== '' && $provider !== null) {
					$provider->mutate(ReactDataProviderInterface::OP_TOGGLE_FIELD, [$id], [
						'field' => $field,
					]);
					$this->noticeMessage = $this->_('Field toggled.');
					$this->noticeType = 'success';
				}
				break;

			case 'reorder':
				if ($isLocked) {
					$actionError = 'Viewport is locked';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				if (!$this->reorderEnabled) {
					$actionError = 'Reordering is not enabled';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$orderedIds = isset($payload['orderedIds']) && is_array($payload['orderedIds'])
					? array_slice(array_values(array_map('strval', $payload['orderedIds'])), 0, 500)
					: [];
				if ($orderedIds !== [] && $provider !== null) {
					$provider->mutate(ReactDataProviderInterface::OP_REORDER, $orderedIds, $payload);
					$this->noticeMessage = $this->_('Order updated.');
					$this->noticeType = 'success';
				}
				break;

			case 'open_quick_edit':
				if (!$this->quickEditEnabled || $isLocked) {
					$actionError = $isLocked ? 'Viewport is locked' : 'Quick edit is not enabled';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$this->quickEditRecordId = trim((string) ($payload['id'] ?? ''));
				$this->quickEditErrors = [];
				break;

			case 'close_quick_edit':
				$this->quickEditRecordId = '';
				$this->quickEditErrors = [];
				break;

			case 'empty_trash':
				if ($isLocked) {
					$actionError = 'Viewport is locked';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				if ($provider !== null) {
					$deletedCount = $provider->mutate(ReactDataProviderInterface::OP_EMPTY_TRASH, ['__all__']);
					$this->selectedIds = [];
					$this->pageNum = 1;
					$this->noticeMessage = $deletedCount > 0
						? sprintf($this->_('Emptied trash (%d record(s) deleted).'), $deletedCount)
						: $this->_('Trash is already empty.');
					$this->noticeType = 'success';
				}
				break;

			case 'save_quick_edit':
				if ($isLocked || !$this->quickEditEnabled) {
					$actionError = $isLocked ? 'Viewport is locked' : 'Quick edit is not enabled';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$id = trim((string) ($payload['id'] ?? $this->quickEditRecordId));
				$submitted = isset($payload['formData']) && is_array($payload['formData'])
					? $payload['formData']
					: (isset($payload['values']) && is_array($payload['values']) ? $payload['values'] : []);
				$isFullForm = !empty($submitted['_rw_quick_edit_form']);
				if ($id !== '' && $submitted !== [] && $provider !== null) {
					$this->quickEditRecordId = $id;
					$hasFormProvider = method_exists($provider, 'resolveQuickEditForm');

					if (
						$hasFormProvider
						&& $isFullForm
						&& $provider instanceof ReactQuickEditProvider
						&& $provider->supportsQuickEdit()
					) {
						$result = $provider->saveQuickEdit($id, $submitted);
					} else {
						$quickEditSpec = $this->resolveQuickEditState($provider);
						$schemaMeta = is_array($quickEditSpec['formSchema'] ?? null)
							? $this->extractQuickEditSchemaFieldMeta($quickEditSpec['formSchema'])
							: ['editable' => [], 'checkboxes' => [], 'useLanguages' => []];

						/** @var array<string, mixed> $cleanValues */
						$cleanValues = [];
						foreach ($submitted as $fKey => $fVal) {
							if (!is_string($fKey) || $fKey === '' || str_starts_with($fKey, '_')) {
								continue;
							}
							if ($isFullForm && preg_match('/^(.+)__(\d+)$/', $fKey, $langMatch) === 1) {
								$baseField = $langMatch[1];
								$langIdKey = $langMatch[2];
								if (!empty($schemaMeta['useLanguages'][$baseField])) {
									if (!isset($cleanValues[$baseField]) || !is_array($cleanValues[$baseField])) {
										$cleanValues[$baseField] = [];
									}
									$cleanValues[$baseField][$langIdKey] = $fVal;
									continue;
								}
							}
							if (isset($schemaMeta['editable'][$fKey]) || $this->isFieldEditable($fKey, true)) {
								if ($isFullForm && !empty($schemaMeta['useLanguages'][$fKey])) {
									$existingMap = isset($cleanValues[$fKey]) && is_array($cleanValues[$fKey])
										? $cleanValues[$fKey]
										: [];
									$existingMap['default'] = $fVal;
									$cleanValues[$fKey] = $existingMap;
								} else {
									$cleanValues[$fKey] = $fVal;
								}
								continue;
							}
							$actionError = 'Field is not editable';
							$this->noticeMessage = $actionError;
							$this->noticeType = 'error';
							break 2;
						}

						if ($isFullForm && !$hasFormProvider) {
							foreach ($schemaMeta['checkboxes'] as $checkboxField) {
								if (!array_key_exists($checkboxField, $cleanValues)) {
									$cleanValues[$checkboxField] = 0;
								}
							}
						}

						if ($provider instanceof ReactQuickEditProvider && $provider->supportsQuickEdit()) {
							$result = $provider->saveQuickEdit($id, $cleanValues);
						} else {
							foreach ($cleanValues as $fKey => $fVal) {
								$provider->mutate(ReactDataProviderInterface::OP_UPDATE_FIELD, [$id], [
									'field' => $fKey,
									'value' => $fVal,
								]);
							}
							$result = [
								'ok' => true,
								'message' => $this->_('Record updated.'),
							];
						}
					}

					$isSavedOk = ($result['ok'] ?? true) === true;
					$this->noticeMessage = (string) (
						$result['message'] ?? ($isSavedOk ? $this->_('Record updated.') : $this->_('Unable to update record.'))
					);
					$this->noticeType = $isSavedOk ? 'success' : 'error';
					if ($isSavedOk) {
						$this->quickEditRecordId = '';
						$this->quickEditErrors = [];
					} else {
						$actionError = $this->noticeMessage;
						$rawErrors = is_array($result['errors'] ?? null) ? $result['errors'] : [];
						$normalizedErrors = [];
						foreach ($rawErrors as $errField => $errMessage) {
							if (is_string($errField) && $errField !== '' && is_scalar($errMessage) && trim((string) $errMessage) !== '') {
								$normalizedErrors[$errField] = trim((string) $errMessage);
							}
						}
						$this->quickEditErrors = $normalizedErrors;
					}
				}
				break;

			case 'quick_create':
				if ($isLocked) {
					$actionError = 'Viewport is locked';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$title = trim((string) ($payload['title'] ?? ''));
				if ($title !== '' && $provider instanceof ReactQuickEditProvider) {
					$createdId = $provider->createQuickRecord($title, $payload);
					if ($createdId !== null && $createdId !== '') {
						$this->noticeMessage = sprintf($this->_('Created "%s".'), $title);
						$this->noticeType = 'success';
					}
				}
				break;

			case 'export':
				$format = strtolower(trim((string) ($payload['format'] ?? 'csv')));
				$exportIds = [];
				if (isset($payload['ids']) && is_array($payload['ids'])) {
					foreach ($payload['ids'] as $rawExportId) {
						if (is_scalar($rawExportId)) {
							$cleanExportId = trim((string) $rawExportId);
							if ($cleanExportId !== '') {
								$exportIds[] = $cleanExportId;
							}
						}
					}
					$exportIds = array_values(array_unique($exportIds));
				}
				$allowedExportFormats = array_map('strtolower', $this->exportFormats);
				if (
					$this->exportEnabled
					&& $provider !== null
					&& ($allowedExportFormats === [] || in_array($format, $allowedExportFormats, true))
				) {
					$exported = $this->generateExportPayload($provider, $format, $exportIds);
					$this->downloadFilename = $exported['filename'];
					$this->downloadContent = $exported['content'];
					$this->downloadMime = $exported['mime'];
					$this->noticeMessage = sprintf($this->_('Exported %s.'), $exported['filename']);
					$this->noticeType = 'success';
				}
				break;
			}
		}

		$mutatingMetadataActions = [
			'row_action',
			'bulk_action',
			'toolbar_action',
			'empty_trash',
			'quick_create',
			'save_quick_edit',
			'toggle_field',
			'update_field',
		];
		if ($provider !== null && $actionError === '' && ($refreshModeMetadata || in_array($action, $mutatingMetadataActions, true))) {
			$this->refreshProviderMetadataAfterMutation($provider);
		}

		$this->loadFromProvider();

		$prop = $this->toInertiaProp();
		if ($actionError !== '') {
			$prop['ok'] = false;
			$prop['error'] = $actionError;
		}

		return $prop;
	}

	/**
	 * Serialize this viewport directly as a flat React viewport state dictionary for Inertia props.
	 *
	 * @return array<string, mixed>
	 */
	public function toInertiaProp(): array
	{
		return $this->getInertiaProps();
	}

	/**
	 * Build the full viewport state payload for React (`<DataViewport />`, `<DataTable />`,
	 * `<DataCards />`, and custom viewports).
	 *
	 * @return array<string, mixed>
	 */
	public function inertiaWithData(): array
	{
		if ($this->records === [] && $this->columns === [] && ($this->provider !== '' || $this->dataProvider !== null || $this->items !== [])) {
			$this->loadFromProvider();
		}

		$provider = $this->resolveDataProvider();
		$displayColumns = $this->resolveDisplayColumns();
		$bulkFieldSchemas = $provider instanceof ReactBulkFieldsProvider ? $provider->bulkEditableFields() : [];

		$rowActionsMap = [];
		if ($provider instanceof ReactRecordActionsProvider) {
			foreach ($this->reactRecords as $reactRec) {
				$actions = $provider->recordActions($reactRec);
				if ($this->locked) {
					$actions = array_values(array_filter(
						$actions,
						static fn(array $act): bool => isset($act['href']) && trim($act['href']) !== ''
					));
				}
				$rowActionsMap[$reactRec->id] = $actions;
			}
		}

		$quickEdit = $this->resolveQuickEditState($provider);
		$delegate = $this->resolveModeDelegate();
		$computedModeData = $delegate !== null
			? $delegate->modeInertiaData($provider, $this->records)
			: $this->modeInertiaData($provider, $this->records);
		$modeStatePayload = array_replace($this->modeState, $computedModeData);
		$viewModeMeta = $this->resolveViewModeMeta();

		$csrfName = '';
		$csrfValue = '';
		try {
			$csrf = $this->wire()->session->CSRF;
			$csrfName = (string) $csrf->getTokenName();
			$csrfValue = (string) $csrf->getTokenValue();
		} catch (\Throwable) {
			// Ignore if session CSRF is unavailable in CLI
		}

		$activeStatusFilter = strtolower(trim((string) ($this->filterValues['status'] ?? $this->statusFilter)));
		$isTrashView = $activeStatusFilter === 'trash';
		$supportsTrash = isset($this->filters['status']['options'])
			&& is_array($this->filters['status']['options'])
			&& array_key_exists('trash', $this->filters['status']['options']);
		$effectiveBulkActions = $this->bulkActions;
		if ($isTrashView && !$this->locked && $effectiveBulkActions !== []) {
			$effectiveBulkActions = [
				ReactDataProviderInterface::OP_RESTORE => [
					'label' => $this->_('Restore'),
					'icon' => 'arrow-back-up',
				],
				ReactDataProviderInterface::OP_DELETE => [
					'label' => $this->_('Delete Permanently'),
					'icon' => 'trash-2',
					'variant' => 'danger',
					'confirm' => $this->_('Permanently delete selected records? This cannot be undone.'),
				],
			];
		}

		$rootUrl = rtrim((string) ($this->wire()->config->urls->root ?: '/'), '/');

		return array_replace([
			'component' => $this->inertiaComponent(),
			'viewportClass' => $this->className(),
			'componentId' => $this->componentId !== '' ? $this->componentId : 'viewport',
			'title' => $this->title,
			'endpoint' => $rootUrl . '/_react/viewport',
			'stateToken' => $this->signViewportState(),
			'csrf' => [
				'name' => $csrfName,
				'value' => $csrfValue,
			],
			'provider' => $this->provider,
			'viewMode' => $this->viewMode,
			'allowedViewModes' => array_values($this->allowedViewModes),
			'viewModeMeta' => $viewModeMeta,
			'modeState' => $modeStatePayload,
			'viewScripts' => $this->resolveViewScriptsMap(),
			'viewStyles' => $this->resolveViewStylesMap(),
			'columns' => $this->columns,
			'displayColumns' => $displayColumns,
			'hiddenColumns' => array_values($this->hiddenColumns),
			'records' => $this->records,
			'filters' => $this->filters,
			'filterValues' => $this->filterValues,
			'bulkActions' => $effectiveBulkActions,
			'bulkFieldSchemas' => $bulkFieldSchemas,
			'rowActions' => $this->rowActions,
			'rowActionsByRecord' => $rowActionsMap,
			'views' => $this->views,
			'savedViews' => $this->savedViews,
			'activeView' => $this->activeView,
			'summaryCards' => $this->summaryCards,
			'searchQuery' => $this->searchQuery,
			'searchPlaceholder' => $this->searchPlaceholder,
			'sortField' => $this->sortField,
			'sortDirection' => $this->sortDirection,
			'page' => $this->pageNum,
			'limit' => $this->limit,
			'total' => $this->total,
			'totalPages' => $this->totalPages,
			'trashCount' => $this->trashCount,
			'isTrashView' => $isTrashView,
			'supportsTrash' => $supportsTrash,
			'selectedIds' => array_values(array_map('strval', $this->selectedIds)),
			'selectable' => $this->selectable && !$this->locked,
			'locked' => $this->locked,
			'dense' => $this->dense,
			'rowValign' => $this->rowValign,
			'showToolbar' => $this->showToolbar,
			'showFilterBar' => $this->showFilterBar,
			'showPagination' => $this->showPagination,
			'saveViewEnabled' => $this->saveViewEnabled,
			'columnPickerEnabled' => $this->columnPickerEnabled,
			'reorderEnabled' => $this->reorderEnabled,
			'exportEnabled' => $this->exportEnabled,
			'exportFormats' => array_values($this->exportFormats),
			'quickEditEnabled' => $this->quickEditEnabled && !$this->locked,
			'quickEditUrl' => $this->quickEditUrl,
			'quickEditRecordId' => $this->quickEditRecordId,
			'quickEdit' => $quickEdit,
			'showCreateButton' => $this->showCreateButton,
			'createLabel' => $this->createLabel,
			'createUrl' => $this->createUrl,
			'createActions' => array_values($this->createActions),
			'toolbarActions' => array_values($this->toolbarActions),
			'createModalTarget' => $this->createModalTarget,
			'editUrl' => $this->editUrl,
			'emptyTitle' => $this->emptyTitle,
			'emptyMessage' => $this->emptyMessage,
			'emptyIcon' => $this->emptyIcon,
			'emptyActionLabel' => $this->emptyActionLabel,
			'emptyActionUrl' => $this->emptyActionUrl,
			'notice' => $this->noticeMessage !== '' ? [
				'message' => $this->noticeMessage,
				'type' => $this->noticeType,
			] : null,
			'download' => $this->downloadContent !== '' ? [
				'filename' => $this->downloadFilename,
				'content' => $this->downloadContent,
				'mime' => $this->downloadMime,
			] : null,
		], $this->inertiaProps);
	}

	/**
	 * Sign the immutable viewport configuration so `/_react/viewport` can reconstruct
	 * and verify the viewport instance without trusting client-supplied provider strings.
	 */
	public function signViewportState(): string
	{
		$safeOptions = [];
		foreach ($this->providerOptions as $optKey => $optVal) {
			if (!$optVal instanceof Closure && !is_object($optVal)) {
				$safeOptions[$optKey] = $optVal;
			}
		}

		$safeViews = [];
		foreach ($this->views as $vKey => $vDef) {
			if (is_array($vDef)) {
				$cleanDef = [];
				foreach ($vDef as $dk => $dv) {
					if (!$dv instanceof Closure && !is_object($dv)) {
						$cleanDef[$dk] = $dv;
					}
				}
				$safeViews[$vKey] = $cleanDef;
			}
		}

		$safeFilters = [];
		foreach ($this->filters as $fKey => $fDef) {
			if (is_array($fDef)) {
				$cleanFilter = [];
				foreach ($fDef as $fk => $fv) {
					if (!$fv instanceof Closure && !is_object($fv)) {
						$cleanFilter[$fk] = $fv;
					}
				}
				$safeFilters[$fKey] = $cleanFilter;
			}
		}

		$safeBulkActions = [];
		foreach ($this->bulkActions as $bKey => $bDef) {
			if (is_array($bDef)) {
				$cleanBulk = [];
				foreach ($bDef as $bk => $bv) {
					if (!$bv instanceof Closure && !is_object($bv)) {
						$cleanBulk[$bk] = $bv;
					}
				}
				$safeBulkActions[$bKey] = $cleanBulk;
			}
		}

		$delegate = $this->resolveModeDelegate();
		$modeSigned = $delegate !== null ? $delegate->modeSignedState() : $this->modeSignedState();

		$envelope = [
			'viewportClass' => $this->className(),
			'componentId' => $this->componentId,
			'provider' => $this->provider,
			'providerOptions' => $safeOptions,
			'columns' => $this->columns,
			'views' => $safeViews,
			'filters' => $safeFilters,
			'bulkActions' => $safeBulkActions,
			'inlineEditableFields' => $this->inlineEditableFields,
			'title' => $this->title,
			'viewMode' => $this->viewMode,
			'allowedViewModes' => array_values($this->allowedViewModes),
			'explicitViewModes' => $this->explicitViewModes,
			'groupBy' => $this->groupBy,
			'modeState' => array_replace($this->modeState, $modeSigned),
			'limit' => $this->limit,
			'selectable' => $this->selectable,
			'locked' => $this->locked,
			'dense' => $this->dense,
			'rowValign' => $this->rowValign,
			'reorderEnabled' => $this->reorderEnabled,
			'quickEditEnabled' => $this->quickEditEnabled,
			'exportEnabled' => $this->exportEnabled,
			'exportFormats' => array_values($this->exportFormats),
			'saveViewEnabled' => $this->saveViewEnabled,
			'columnPickerEnabled' => $this->columnPickerEnabled,
			'searchPlaceholder' => $this->searchPlaceholder,
			'showToolbar' => $this->showToolbar,
			'showFilterBar' => $this->showFilterBar,
			'showPagination' => $this->showPagination,
			'showCreateButton' => $this->showCreateButton,
			'createLabel' => $this->createLabel,
			'createUrl' => $this->createUrl,
			'createActions' => array_values($this->createActions),
			'toolbarActions' => array_values($this->toolbarActions),
			'createModalTarget' => $this->createModalTarget,
			'editUrl' => $this->editUrl,
			'emptyTitle' => $this->emptyTitle,
			'emptyMessage' => $this->emptyMessage,
			'emptyIcon' => $this->emptyIcon,
			'emptyActionLabel' => $this->emptyActionLabel,
			'emptyActionUrl' => $this->emptyActionUrl,
			'typ' => 'viewport',
			'uid' => (int) $this->wire()->user->id,
		];

		return React::instance($this)->tokenCodec()->encode($envelope);
	}

	/**
	 * Verify and decode a signed viewport state token.
	 *
	 * @return array<string, mixed>|null
	 */
	public function verifyViewportState(string $token): ?array
	{
		$currentUserId = (int) $this->wire()->user->id;
		$decoded = React::instance($this)->tokenCodec()->decode($token, $currentUserId);
		if (
			$decoded === null
			|| ($decoded['typ'] ?? '') !== 'viewport'
			|| !isset($decoded['viewportClass'])
		) {
			return null;
		}

		return $decoded;
	}

	/**
	 * Cached standalone script asset URLs keyed by `"{mode}|{registeredModule}"`.
	 *
	 * @var array<string, list<string>>
	 */
	private static array $viewScriptsCache = [];

	/**
	 * Cached standalone stylesheet asset URLs keyed by `"{mode}|{registeredModule}"`.
	 *
	 * @var array<string, list<string>>
	 */
	private static array $viewStylesCache = [];

	/**
	 * Resolve toolbar metadata (`icon`, `label`) for allowed and registered viewport layout modes.
	 *
	 * @return array<string, array{icon: string, label: string}>
	 */
	protected function resolveViewModeMeta(): array
	{
		$metaMap = [
			'table' => [
				'icon' => 'table',
				'label' => $this->_('Table'),
			],
			'cards' => [
				'icon' => 'layout-grid',
				'label' => $this->_('Cards'),
			],
		];

		$registered = $this->react()->getRegisteredViewportModes();
		foreach ($registered as $modeKey => $reg) {
			$icon = trim((string) ($reg['icon'] ?? ''));
			$label = trim((string) ($reg['label'] ?? ''));
			if ($icon !== '' || $label !== '') {
				$metaMap[$modeKey] = [
					'icon' => $icon !== '' ? $icon : 'layout-grid',
					'label' => $label !== '' ? $label : ucfirst($modeKey),
				];
			}
		}

		return $metaMap;
	}

	/**
	 * Map each allowed viewport mode (`table`, `cards`, or registered custom modes)
	 * to its standalone script asset URLs so `<DataViewport />` can load view modes on demand.
	 *
	 * @return array<string, list<string>>
	 */
	protected function resolveViewScriptsMap(): array
	{
		return $this->resolveViewAssetMap(true);
	}

	/**
	 * Map each allowed viewport mode (`table`, `cards`, or registered custom modes)
	 * to its standalone stylesheet asset URLs so dynamically switched view modes load their delta CSS on demand.
	 *
	 * @return array<string, list<string>>
	 */
	protected function resolveViewStylesMap(): array
	{
		return $this->resolveViewAssetMap(false);
	}

	/**
	 * @return array<string, list<string>>
	 */
	private function resolveViewAssetMap(bool $scripts): array
	{
		$map = [];
		$workspace = $this->react();
		$registered = $workspace->getRegisteredViewportModes();
		$modes = array_values(array_unique(array_merge([$this->viewMode], $this->allowedViewModes)));
		foreach ($modes as $mode) {
			$cleanMode = strtolower(trim((string) $mode));
			if ($cleanMode === '') {
				continue;
			}
			$cacheKey = $cleanMode . '|' . ($registered[$cleanMode]['module'] ?? '');
			if ($scripts && array_key_exists($cacheKey, self::$viewScriptsCache)) {
				if (self::$viewScriptsCache[$cacheKey] !== []) {
					$map[$cleanMode] = self::$viewScriptsCache[$cacheKey];
				}
				continue;
			}
			if (!$scripts && array_key_exists($cacheKey, self::$viewStylesCache)) {
				if (self::$viewStylesCache[$cacheKey] !== []) {
					$map[$cleanMode] = self::$viewStylesCache[$cacheKey];
				}
				continue;
			}
			try {
				$vp = $workspace->viewport($cleanMode);
				$assets = $scripts ? array_values($vp->getModuleScriptAssets()) : array_values($vp->getModuleStyleAssets());
				if ($scripts) {
					self::$viewScriptsCache[$cacheKey] = $assets;
				} else {
					self::$viewStylesCache[$cacheKey] = $assets;
				}
				if ($assets !== []) {
					$map[$cleanMode] = $assets;
				}
			} catch (\Throwable) {
				if ($scripts) {
					self::$viewScriptsCache[$cacheKey] = [];
				} else {
					self::$viewStylesCache[$cacheKey] = [];
				}
			}
		}

		return $map;
	}

	/**
	 * Return visible columns excluding `$this->hiddenColumns`.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	protected function resolveDisplayColumns(): array
	{
		$visible = [];
		foreach ($this->columns as $key => $col) {
			if (in_array((string) $key, $this->hiddenColumns, true)) {
				continue;
			}
			$visible[$key] = $col;
		}

		return $visible !== [] ? $visible : $this->columns;
	}

	/**
	 * Build normalized filter definitions (`statusOptions()` + `filterableFields()`) from `$provider`.
	 *
	 * @return array<string, array{label: string, type?: string, display?: string, options: array<string, string>, counts?: array<string, int>, icons?: array<string, string>, totalCount?: int}>
	 */
	protected function resolveProviderFilters(ReactDataProviderInterface $provider): array
	{
		$resolved = [];
		$statusOpts = $provider->statusOptions();
		if ($statusOpts !== []) {
			$resolved['status'] = [
				'label' => $this->_('Status'),
				'type' => 'select',
				'options' => $statusOpts,
			];
		}

		if ($provider instanceof ReactFieldSchemaProvider) {
			foreach ($provider->filterableFields() as $fKey => $fDef) {
				/** @var array<string, string> $options */
				$options = is_array($fDef['options'] ?? null) ? $fDef['options'] : [];
				$entry = [
					'label' => (string) ($fDef['label'] ?? $fKey),
					'type' => (string) ($fDef['type'] ?? 'select'),
					'options' => $options,
				];
				if (isset($fDef['display']) && is_string($fDef['display']) && $fDef['display'] !== '') {
					$entry['display'] = $fDef['display'];
				}
				if (isset($fDef['counts']) && is_array($fDef['counts'])) {
					/** @var array<string, int> $counts */
					$counts = array_map('intval', $fDef['counts']);
					$entry['counts'] = $counts;
				}
				if (isset($fDef['icons']) && is_array($fDef['icons'])) {
					/** @var array<string, string> $icons */
					$icons = array_map('strval', $fDef['icons']);
					$entry['icons'] = $icons;
				}
				if (isset($fDef['totalCount']) && is_numeric($fDef['totalCount'])) {
					$entry['totalCount'] = (int) $fDef['totalCount'];
				}
				$resolved[(string) $fKey] = $entry;
			}
		}

		return $resolved;
	}

	/**
	 * Refresh provider-contributed `views` and `filters` metadata (including pill counts) after mutating actions.
	 */
	private function refreshProviderMetadataAfterMutation(ReactDataProviderInterface $provider): void
	{
		if ($provider instanceof ReactViewsProvider) {
			$freshViews = $provider->savedViews();
			if ($freshViews !== []) {
				$this->views = $freshViews;
			}
		}

		$freshFilters = $this->resolveProviderFilters($provider);
		if ($provider instanceof ReactFieldSchemaProvider) {
			$this->filters = $freshFilters;
		} elseif ($freshFilters !== []) {
			$this->filters = array_replace($this->filters, $freshFilters);
		}
	}

	/**
	 * Resolve Quick-Edit SchemaForm payload when a record is open in the Quick Edit modal.
	 *
	 * @return array{
	 *   recordId: string,
	 *   title: string,
	 *   formSchema: array<string, mixed>,
	 *   scriptAssets?: list<string>,
	 *   styleAssets?: list<string>,
	 *   editUrl?: string
	 * }|null
	 */
	protected function resolveQuickEditState(?ReactDataProviderInterface $provider): ?array
	{
		if (!$this->quickEditEnabled || $this->locked || $this->quickEditRecordId === '') {
			return null;
		}

		if ($provider !== null && method_exists($provider, 'resolveQuickEditForm')) {
			$providerForm = $provider->resolveQuickEditForm($this->quickEditRecordId, [
				'editUrl' => $this->editUrl,
				'errors' => $this->quickEditErrors,
			]);
			if (is_array($providerForm) && isset($providerForm['formSchema']) && is_array($providerForm['formSchema'])) {
				/** @var array<string, mixed> $formSchema */
				$formSchema = $providerForm['formSchema'];
				$formSchema['submits'] = [];
				$formSchema['dirtyGuard'] = false;

				$spec = [
					'recordId' => $this->quickEditRecordId,
					'title' => (string) ($providerForm['title'] ?? $this->quickEditRecordId),
					'formSchema' => $formSchema,
				];
				if (!empty($providerForm['scriptAssets']) && is_array($providerForm['scriptAssets'])) {
					$spec['scriptAssets'] = array_values(array_map('strval', $providerForm['scriptAssets']));
				}
				if (!empty($providerForm['styleAssets']) && is_array($providerForm['styleAssets'])) {
					$spec['styleAssets'] = array_values(array_map('strval', $providerForm['styleAssets']));
				}
				$resolvedEditUrl = trim((string) ($providerForm['editUrl'] ?? ''));
				if ($resolvedEditUrl !== '') {
					$spec['editUrl'] = $resolvedEditUrl;
				}

				return $spec;
			}
		}

		$editableMap = $this->inlineEditableFields;
		if ($provider instanceof ReactFieldSchemaProvider) {
			$editableMap = array_replace($provider->inlineEditableFields(), $editableMap);
		}

		$extraMetaKeys = ['rows', 'step', 'min', 'max', 'placeholder', 'required', 'monospace'];
		$fields = [];
		foreach ($this->columns as $colKey => $colDef) {
			if ($colKey === 'id') {
				continue;
			}
			$spec = [
				'label' => (string) ($colDef['label'] ?? $colKey),
				'type' => (string) ($colDef['type'] ?? 'text'),
				'options' => is_array($colDef['options'] ?? null) ? $colDef['options'] : [],
				'editable' => (bool) ($colDef['editable'] ?? ($colKey === 'title' || isset($editableMap[$colKey]))),
				'useLanguages' => (bool) ($colDef['useLanguages'] ?? false),
			];
			foreach ($extraMetaKeys as $metaKey) {
				if (array_key_exists($metaKey, $colDef)) {
					$spec[$metaKey] = $colDef[$metaKey];
				}
			}
			$fields[(string) $colKey] = $spec;
		}

		foreach ($editableMap as $fKey => $fDef) {
			if ($fKey === 'id') {
				continue;
			}
			$existing = $fields[(string) $fKey] ?? [];
			$spec = [
				'label' => (string) ($fDef['label'] ?? $existing['label'] ?? ucfirst(str_replace('_', ' ', (string) $fKey))),
				'type' => (string) ($fDef['type'] ?? $existing['type'] ?? 'text'),
				'options' => is_array($fDef['options'] ?? null)
					? $fDef['options']
					: (is_array($existing['options'] ?? null) ? $existing['options'] : []),
				'editable' => true,
				'useLanguages' => (bool) ($fDef['useLanguages'] ?? $existing['useLanguages'] ?? false),
			];
			foreach ($extraMetaKeys as $metaKey) {
				if (array_key_exists($metaKey, $fDef)) {
					$spec[$metaKey] = $fDef[$metaKey];
				} elseif (array_key_exists($metaKey, $existing)) {
					$spec[$metaKey] = $existing[$metaKey];
				}
			}
			$fields[(string) $fKey] = $spec;
		}

		$targetRecord = null;
		if ($this->quickEditRecordId === '__new__') {
			if (!isset($fields['title'])) {
				$fields = array_replace([
					'title' => [
						'label' => $this->_('Title'),
						'type' => 'text',
						'options' => [],
						'editable' => true,
						'useLanguages' => false,
					],
				], $fields);
			}
			$targetRecord = ['id' => '__new__', 'title' => ''];
			foreach (array_keys($fields) as $fKey) {
				$targetRecord[(string) $fKey] = '';
			}
		} else {
			foreach ($this->records as $row) {
				if ((string) ($row['id'] ?? '') === $this->quickEditRecordId) {
					/** @var array<string, mixed> $typedRow */
					$typedRow = $row;
					$targetRecord = $typedRow;
					break;
				}
			}
		}

		if ($targetRecord === null) {
			return null;
		}

		$editableFields = array_filter($fields, static fn(array $fSpec): bool => !empty($fSpec['editable']));
		$targetFields = $editableFields !== [] ? $editableFields : $fields;

		$definitions = [];
		$values = [];
		foreach ($targetFields as $fKey => $fSpec) {
			$rawType = strtolower(trim((string) ($fSpec['type'] ?? 'text')));
			$mappedType = $rawType === 'boolean' ? 'checkbox' : ($rawType !== '' ? $rawType : 'text');
			$def = [
				'name' => (string) $fKey,
				'label' => (string) ($fSpec['label'] ?? $fKey),
				'type' => $mappedType,
				'options' => is_array($fSpec['options'] ?? null) ? $fSpec['options'] : [],
				'useLanguages' => !empty($fSpec['useLanguages']),
			];
			foreach ($extraMetaKeys as $metaKey) {
				if (array_key_exists($metaKey, $fSpec)) {
					$def[$metaKey] = $fSpec[$metaKey];
				}
			}
			$rawVal = $targetRecord[$fKey] ?? '';
			$values[(string) $fKey] = $rawVal;
			$definitions[] = $def;
		}

		$safeFormSuffix = preg_replace('/[^a-zA-Z0-9_-]/', '_', $this->quickEditRecordId) ?: 'record';
		$formSchema = React::instance($this)->serializeFormDefinitions($definitions, [
			'id' => 'rw_quick_edit_' . $safeFormSuffix,
			'dirtyGuard' => false,
			'values' => $values,
			'errors' => $this->quickEditErrors,
		]);
		$formSchema['submits'] = [];
		$formSchema['dirtyGuard'] = false;

		$rawTitle = $this->quickEditRecordId === '__new__'
			? $this->_('New Item')
			: ($targetRecord['title'] ?? $targetRecord['label'] ?? $targetRecord['name'] ?? $this->quickEditRecordId);
		if (is_array($rawTitle)) {
			$firstScalar = reset($rawTitle);
			$titleText = is_scalar($firstScalar) ? trim((string) $firstScalar) : $this->quickEditRecordId;
		} elseif (is_scalar($rawTitle)) {
			$titleText = trim((string) $rawTitle);
		} else {
			$titleText = $this->quickEditRecordId;
		}

		$spec = [
			'recordId' => $this->quickEditRecordId,
			'title' => $titleText !== '' ? $titleText : $this->quickEditRecordId,
			'formSchema' => $formSchema,
		];
		$recordEditUrl = UrlSanitizer::sanitizeHref((string) ($targetRecord['_editUrl'] ?? $targetRecord['editUrl'] ?? ''), true);
		if ($recordEditUrl !== '') {
			$spec['editUrl'] = $recordEditUrl;
		}

		return $spec;
	}

	/**
	 * Extract editable field names, checkbox field names, and multi-language field flags from a serialized SchemaForm.
	 *
	 * @param array<string, mixed> $formSchema
	 * @return array{editable: array<string, true>, checkboxes: list<string>, useLanguages: array<string, true>}
	 */
	private function extractQuickEditSchemaFieldMeta(array $formSchema): array
	{
		$editable = [];
		$checkboxes = [];
		$useLanguages = [];

		$walk = static function (array $items) use (&$walk, &$editable, &$checkboxes, &$useLanguages): void {
			foreach ($items as $item) {
				if (!is_array($item)) {
					continue;
				}
				if (isset($item['fields']) && is_array($item['fields'])) {
					$walk($item['fields']);
				}
				if (isset($item['children']) && is_array($item['children'])) {
					$walk($item['children']);
				}
				$name = trim((string) ($item['name'] ?? ''));
				if ($name === '' || ($item['kind'] ?? 'control') !== 'control') {
					continue;
				}
				if (empty($item['disabled']) && empty($item['readOnly'])) {
					$editable[$name] = true;
				}
				if (!empty($item['useLanguages'])) {
					$useLanguages[$name] = true;
				}
				$type = strtolower(trim((string) ($item['type'] ?? 'text')));
				if (in_array($type, ['checkbox', 'boolean', 'switch'], true)) {
					$checkboxes[] = $name;
				}
			}
		};

		if (isset($formSchema['fields']) && is_array($formSchema['fields'])) {
			$walk($formSchema['fields']);
		}
		if (isset($formSchema['tabs']) && is_array($formSchema['tabs'])) {
			$walk($formSchema['tabs']);
		}

		return [
			'editable' => $editable,
			'checkboxes' => array_values(array_unique($checkboxes)),
			'useLanguages' => $useLanguages,
		];
	}

	/**
	 * Generate CSV or JSON export content for the active filter set or selected record IDs.
	 *
	 * @param list<string> $ids
	 * @return array{filename: string, content: string, mime: string}
	 */
	protected function generateExportPayload(ReactDataProviderInterface $provider, string $format, array $ids = []): array
	{
		$exportFormat = in_array($format, ['csv', 'json'], true) ? $format : 'csv';
		$criteria = $this->buildQueryCriteria();
		if ($ids !== []) {
			$criteria['ids'] = $ids;
		}

		if ($provider instanceof ReactExportProvider) {
			$exported = $provider->export($exportFormat, $criteria);

			return [
				'filename' => (string) ($exported['filename'] ?? "export.{$exportFormat}"),
				'content' => (string) ($exported['body'] ?? ''),
				'mime' => (string) ($exported['contentType'] ?? ($exportFormat === 'json' ? 'application/json' : 'text/csv; charset=utf-8')),
			];
		}

		$slug = preg_replace('/[^a-zA-Z0-9_-]/', '-', $this->componentId ?: 'records') ?: 'records';
		$result = $provider->query(array_replace($criteria, ['pageNum' => 1, 'limit' => 5000]));
		$cols = $this->resolveDisplayColumns();

		if ($exportFormat === 'json') {
			$rows = array_map(fn(ReactRecord $r): array => $this->serializeReactRecord($r), $result->items);

			return [
				'filename' => "{$slug}.json",
				'content' => (string) json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
				'mime' => 'application/json; charset=UTF-8',
			];
		}

		$fh = fopen('php://temp', 'r+');
		if ($fh === false) {
			return ['filename' => "{$slug}.csv", 'content' => '', 'mime' => 'text/csv'];
		}

		$headers = ['id'];
		foreach (array_keys($cols) as $colKey) {
			$headers[] = self::sanitizeCsvCell((string) $colKey);
		}
		fputcsv($fh, $headers, ',', '"', '\\');

		foreach ($result->items as $rec) {
			$line = [self::sanitizeCsvCell((string) $rec->id)];
			foreach (array_keys($cols) as $colKey) {
				$line[] = self::sanitizeCsvCell((string) $rec->getDisplayValue((string) $colKey));
			}
			fputcsv($fh, $line, ',', '"', '\\');
		}

		rewind($fh);
		$csv = (string) stream_get_contents($fh);
		fclose($fh);

		return [
			'filename' => "{$slug}.csv",
			'content' => $csv,
			'mime' => 'text/csv; charset=utf-8',
		];
	}

	/**
	 * Neutralize spreadsheet formula injection characters (`=`, `+`, `-`, `@`, `\t`, `\r`, `\n`)
	 * at the start of a CSV cell value (CWE-1236).
	 *
	 * Prepends a single quote (`'`) if the value or its trimmed prefix starts with a formula trigger,
	 * while preserving legitimate negative numeric literals (e.g. `-42`, `-3.14`).
	 */
	public static function sanitizeCsvCell(string $value): string
	{
		if ($value === '') {
			return '';
		}

		$dangerous = ['=', '+', '-', '@', "\t", "\r", "\n"];
		$trimmedFirst = ltrim($value, " \t\r\n")[0] ?? '';

		if ($trimmedFirst !== '' && in_array($trimmedFirst, $dangerous, true)) {
			if ($trimmedFirst === '-' && preg_match('/^-[0-9]+(\.[0-9]+)?$/', trim($value)) === 1) {
				return $value;
			}
			return "'" . $value;
		}

		if (in_array($value[0], $dangerous, true)) {
			if ($value[0] === '-' && preg_match('/^-[0-9]+(\.[0-9]+)?$/', $value) === 1) {
				return $value;
			}
			return "'" . $value;
		}

		return $value;
	}
}
