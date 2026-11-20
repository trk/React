<?php

declare(strict_types=1);

namespace Totoglu\React\Viewport;

use Closure;
use ProcessWire\PageArray;
use ProcessWire\React;
use Totoglu\Inertia\MarkupInertia;
use Totoglu\React\Contract\ReactBulkFieldsProvider;
use Totoglu\React\Contract\ReactCalendarProvider;
use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Contract\ReactExportProvider;
use Totoglu\React\Contract\ReactFieldSchemaProvider;
use Totoglu\React\Contract\ReactQuickEditProvider;
use Totoglu\React\Contract\ReactRecordActionsProvider;
use Totoglu\React\Contract\ReactReorderProvider;
use Totoglu\React\Contract\ReactSummaryProvider;
use Totoglu\React\Contract\ReactViewsProvider;
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
	 * Active viewport layout mode (`table`, `cards`, `kanban`, `calendar`).
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
	 * Kanban stage grouping field and stage definitions.
	 */
	public string $groupByField = '';

	/**
	 * @var array<string, array{label: string, variant?: string, limit?: int}>
	 */
	public array $stages = [];

	/**
	 * Calendar date field, end date field, active month/year, and sub-view (`month`, `week`, `agenda`, `timeline`).
	 */
	public string $dateField = '';
	public string $endDateField = '';
	public int $month = 0;
	public int $year = 0;
	public string $calendarView = 'month';

	/**
	 * Quick-Edit slide-over drawer / modal state.
	 */
	public bool $quickEditEnabled = true;
	public string $quickEditUrl = '';
	public string $quickEditRecordId = '';

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
	 * Default viewport layout mode (`table`, `cards`, `kanban`, `calendar`).
	 */
	protected function defaultViewMode(): string
	{
		return 'table';
	}

	/**
	 * Return the active viewport layout mode (`table`, `cards`, `kanban`, `calendar`).
	 */
	public function viewportMode(): string
	{
		return $this->viewMode;
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
	 * Shift calendar start/end dates by `$days` across multiple records.
	 *
	 * @param list<string> $ids
	 * @return array<string, mixed>
	 */
	public function bulkShiftDates(int $days, array $ids = []): array
	{
		$targetIds = $ids !== [] ? $ids : $this->selectedIds;
		$provider = $this->resolveDataProvider();
		if ($days !== 0 && $targetIds !== [] && $provider !== null && !$provider->isLocked()) {
			$modified = $provider->mutate(ReactDataProviderInterface::OP_SHIFT_DATES, $targetIds, [
				'days' => $days,
			]);
			$this->noticeMessage = sprintf($this->_('Shifted dates on %d record(s).'), $modified);
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
	 * Move a record to a new Kanban stage via the bound provider.
	 *
	 * @return array<string, mixed>
	 */
	public function moveStage(string $id, string $stage, ?int $position = null, string $groupField = '', string $groupVal = ''): array
	{
		return $this->executeAction('move_stage', [
			'id' => $id,
			'stage' => $stage,
			'position' => $position,
			'groupField' => $groupField,
			'groupVal' => $groupVal,
		]);
	}

	/**
	 * Reschedule a calendar record to a new start date (and optional resource lane) via the bound provider.
	 *
	 * @return array<string, mixed>
	 */
	public function moveCalendarDate(
		string $id,
		string $newDate,
		string $fromDate = '',
		string $laneField = '',
		string $laneVal = '',
	): array {
		return $this->executeAction('reschedule', [
			'id' => $id,
			'targetDate' => $newDate,
			'startDate' => $newDate,
			'date' => $newDate,
			'fromDate' => $fromDate,
			'laneField' => $laneField,
			'laneVal' => $laneVal,
		]);
	}

	/**
	 * Resize a multi-day calendar record span (`endDate` or `startDate` .. `endDate`) via the bound provider.
	 *
	 * @return array<string, mixed>
	 */
	public function resizeCalendarSpan(string $id, string $newStartOrEndDate, string $newEndDate = ''): array
	{
		$targetEnd = $newEndDate !== '' ? $newEndDate : $newStartOrEndDate;

		return $this->executeAction('resize_span', [
			'id' => $id,
			'startDate' => $newEndDate !== '' ? $newStartOrEndDate : '',
			'endDate' => $targetEnd,
			'targetEndDate' => $targetEnd,
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
		$this->groupByField = '';
		$this->stages = [];
		$this->dateField = '';
		$this->endDateField = '';
		$this->month = 0;
		$this->year = 0;
		$this->calendarView = 'month';
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

		if ($this->groupByField === '') {
			$this->groupByField = $provider->stageField();
		}
		if ($this->stages === [] && $this->groupByField !== '') {
			foreach ($provider->stageOptions($this->groupByField) as $sKey => $sLabel) {
				$this->stages[(string) $sKey] = [
					'label' => (string) $sLabel,
					'variant' => 'neutral',
				];
			}
		}
		if ($this->dateField === '') {
			$this->dateField = $provider->dateStartField();
		}
		if ($this->endDateField === '') {
			$this->endDateField = $provider->dateEndField();
		}

		// Determine allowed view modes based on provider capabilities and installed modules
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

		if ($this->viewMode === 'calendar' && $provider instanceof ReactCalendarProvider) {
			$month = $this->month >= 1 && $this->month <= 12 ? $this->month : (int) date('n');
			$year = $this->year >= 1970 && $this->year <= 2100 ? $this->year : (int) date('Y');
			$startIso = sprintf('%04d-%02d-01', $year, $month);
			$daysInMonth = (int) date('t', mktime(0, 0, 0, $month, 1, $year) ?: time());
			$endIso = sprintf('%04d-%02d-%02d', $year, $month, $daysInMonth);
			$windowRecords = $provider->queryWindow($criteria, $startIso, $endIso);
			$this->reactRecords = $windowRecords;
			$this->records = array_map(
				fn(ReactRecord $r): array => $this->serializeReactRecord($r),
				$windowRecords
			);
			$this->total = count($this->records);
			$this->totalPages = 1;

			return;
		}

		$result = $provider->query($criteria);
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
	 * Resolve the active Kanban stage grouping field from viewport config or bound provider.
	 */
	protected function stageField(): string
	{
		if ($this->groupByField !== '') {
			return $this->groupByField;
		}

		return $this->resolveDataProvider()?->stageField() ?? '';
	}

	/**
	 * Resolve the active Calendar start date field from viewport config or bound provider.
	 */
	protected function dateStartField(): string
	{
		if ($this->dateField !== '') {
			return $this->dateField;
		}

		return $this->resolveDataProvider()?->dateStartField() ?? '';
	}

	/**
	 * Resolve available viewport layout modes gated by provider capabilities and installed viewport modules.
	 *
	 * @return list<string>
	 */
	protected function resolveAvailableViewModes(): array
	{
		$modules = $this->wire()->modules;
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
					$modName = (string) ($registered[$cleanMode]['module'] ?? '');
					$capability = (string) ($registered[$cleanMode]['capability'] ?? '');
					if ($modName === '' || !$modules->isInstalled($modName)) {
						continue;
					}
					$capSatisfied = match ($capability) {
						'stage' => $this->stageField() !== '',
						'dateStart' => $this->dateStartField() !== '',
						default => true,
					};
					if ($capSatisfied) {
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
			$modName = (string) ($meta['module'] ?? '');
			$capability = (string) ($meta['capability'] ?? '');
			if ($modName === '' || !$modules->isInstalled($modName)) {
				continue;
			}
			$capSatisfied = match ($capability) {
				'stage' => $this->stageField() !== '',
				'dateStart' => $this->dateStartField() !== '',
				default => true,
			};
			if ($capSatisfied && !in_array($regMode, $modes, true)) {
				$modes[] = $regMode;
			}
		}

		foreach ($this->allowedViewModes as $customMode) {
			$cleanMode = strtolower(trim((string) $customMode));
			if ($cleanMode === '') {
				continue;
			}
			if (in_array($cleanMode, $modes, true)) {
				continue;
			}
			if (isset($registered[$cleanMode])) {
				$modName = (string) ($registered[$cleanMode]['module'] ?? '');
				$capability = (string) ($registered[$cleanMode]['capability'] ?? '');
				if ($modName === '' || !$modules->isInstalled($modName)) {
					continue;
				}
				$capSatisfied = match ($capability) {
					'stage' => $this->stageField() !== '',
					'dateStart' => $this->dateStartField() !== '',
					default => true,
				};
				if (!$capSatisfied) {
					continue;
				}
				$modes[] = $cleanMode;
				continue;
			}
			if ($modules->isInstalled((string) $customMode)) {
				$modes[] = $cleanMode;
			}
		}

		return $modes;
	}

	/**
	 * Build the `$criteria` array expected by `ReactDataProviderInterface::query()`.
	 *
	 * @return array<string, mixed>
	 */
	protected function buildQueryCriteria(): array
	{
		$fieldFilters = [];
		$statusFilter = $this->statusFilter;

		foreach ($this->filterValues as $k => $v) {
			if ($v === '' || $v === null) {
				continue;
			}
			if ($k === 'status') {
				$statusFilter = (string) $v;
			} else {
				$fieldFilters[(string) $k] = (string) $v;
			}
		}

		$sortBy = $this->sortField !== ''
			? ($this->sortDirection === 'desc' ? '-' . $this->sortField : $this->sortField)
			: '';

		if ($this->activeView !== '' && $this->activeView !== 'all') {
			if (str_starts_with($this->activeView, 'saved:')) {
				$savedKey = substr($this->activeView, 6);
				$preset = $this->savedViews[$savedKey] ?? null;
				if (is_array($preset)) {
					foreach (($preset['filters'] ?? []) as $pk => $pv) {
						if ($pk === 'status') {
							$statusFilter = $statusFilter !== '' ? $statusFilter : (string) $pv;
						} elseif (!isset($fieldFilters[$pk])) {
							$fieldFilters[(string) $pk] = (string) $pv;
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

		$effectiveLimit = $this->viewMode === 'kanban' || $this->viewMode === 'calendar'
			? max($this->limit, 500)
			: max(1, $this->limit);

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
			'_stage' => $record->stage,
			'_startDate' => $record->startDate,
			'_endDate' => $record->endDate,
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

		foreach ($record->formatted as $colKey => $formattedVal) {
			if (!array_key_exists($colKey, $row)) {
				$row[$colKey] = $formattedVal;
			}
		}

		if ($this->groupByField !== '' && !isset($row[$this->groupByField]) && $record->stage !== '') {
			$row[$this->groupByField] = $record->stage;
		}
		if ($this->dateField !== '' && !isset($row[$this->dateField]) && $record->startDate !== '') {
			$row[$this->dateField] = $record->startDate;
		}
		if ($this->endDateField !== '' && !isset($row[$this->endDateField]) && $record->endDate !== '') {
			$row[$this->endDateField] = $record->endDate;
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
	 * Validate `field`, `groupField`, and `laneField` inside `move_stage`, `reschedule`, and `resize_span` payloads.
	 *
	 * @param array<string, mixed> $mutationPayload
	 */
	private function validateStageAndLanePayload(
		string $op,
		array $mutationPayload,
		?ReactDataProviderInterface $provider,
	): bool {
		if ($op === ReactDataProviderInterface::OP_MOVE_STAGE) {
			$effectiveStageField = $this->stageField();
			$field = trim((string) ($mutationPayload['field'] ?? ''));
			$groupField = trim((string) ($mutationPayload['groupField'] ?? ''));
			if (
				$field !== ''
				&& $field !== $effectiveStageField
				&& $field !== $this->groupByField
				&& !$this->isFieldEditable($field)
			) {
				return false;
			}
			if (
				$groupField !== ''
				&& $groupField !== $this->groupBy
				&& $groupField !== $effectiveStageField
				&& !($provider instanceof ReactCalendarProvider && $groupField === $provider->laneField())
				&& !$this->isFieldEditable($groupField)
			) {
				return false;
			}
		}

		if ($op === ReactDataProviderInterface::OP_RESCHEDULE || $op === ReactDataProviderInterface::OP_RESIZE_SPAN) {
			$laneField = trim((string) ($mutationPayload['laneField'] ?? ''));
			if (
				$laneField !== ''
				&& !($provider instanceof ReactCalendarProvider && $laneField === $provider->laneField())
				&& $laneField !== $this->groupBy
				&& !$this->isFieldEditable($laneField)
			) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Execute an interactive viewport action (`search`, `filter`, `sort`, `page`, `bulk_action`,
	 * `row_action`, `update_field`, `toggle_field`, `move_stage`, `reorder`, `reschedule`,
	 * `resize_span`, `save_quick_edit`, `export`, etc.) and reload the viewport state.
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
				if (isset($payload['filters']) && is_array($payload['filters'])) {
					foreach ($payload['filters'] as $k => $v) {
						if (!is_string($k) || $k === '') {
							continue;
						}
						if ($v === '' || $v === null) {
							unset($this->filterValues[$k]);
						} else {
							$this->filterValues[$k] = $v;
						}
					}
				} else {
					$key = trim((string) ($payload['key'] ?? ''));
					$val = $payload['value'] ?? '';
					if ($key !== '') {
						if ($val === '') {
							unset($this->filterValues[$key]);
						} else {
							$this->filterValues[$key] = $val;
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
						$this->filterValues = is_array($preset['filters'] ?? null) ? $preset['filters'] : [];
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
				} elseif (!$this->validateStageAndLanePayload($bulkKey, $mutationPayload, $provider)) {
					$actionError = 'Field is not editable';
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
				} elseif (!$this->validateStageAndLanePayload($actionKey, $payload, $provider)) {
					$actionError = 'Field is not editable';
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

			case 'move_stage':
				if ($isLocked) {
					$actionError = 'Viewport is locked';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$id = trim((string) ($payload['id'] ?? ''));
				$stage = trim((string) ($payload['stage'] ?? ''));
				$effectiveStageField = $this->stageField();
				$field = trim((string) ($payload['field'] ?? $this->groupByField));
				if (!$this->validateStageAndLanePayload(ReactDataProviderInterface::OP_MOVE_STAGE, $payload, $provider)) {
					$actionError = 'Field is not editable';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$position = isset($payload['position']) ? (int) $payload['position'] : null;
				if ($id !== '' && $stage !== '' && $provider !== null) {
					$provider->mutate(ReactDataProviderInterface::OP_MOVE_STAGE, [$id], array_replace($payload, [
						'field' => $field !== '' ? $field : ($effectiveStageField !== '' ? $effectiveStageField : 'stage'),
						'stage' => $stage,
						'position' => $position,
					]));
					$this->noticeMessage = $this->_('Updated stage.');
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

			case 'set_calendar_view':
			case 'navigate_month':
				$month = (int) ($payload['month'] ?? ($this->month > 0 ? $this->month : (int) date('n')));
				$year = (int) ($payload['year'] ?? ($this->year > 0 ? $this->year : (int) date('Y')));
				$dir = (string) ($payload['direction'] ?? '');
				if ($dir === 'prev') {
					$month--;
					if ($month < 1) {
						$month = 12;
						$year--;
					}
				} elseif ($dir === 'next') {
					$month++;
					if ($month > 12) {
						$month = 1;
						$year++;
					}
				} elseif ($dir === 'today') {
					$month = (int) date('n');
					$year = (int) date('Y');
				}
				$this->month = max(1, min(12, $month));
				$this->year = max(1970, min(2100, $year));
				if (isset($payload['calendarView']) && in_array($payload['calendarView'], ['month', 'week', 'agenda', 'timeline'], true)) {
					$this->calendarView = (string) $payload['calendarView'];
				}
				break;

			case 'reschedule':
			case 'resize_span':
				if ($isLocked) {
					$actionError = 'Viewport is locked';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$checkOp = $action === 'resize_span'
					? ReactDataProviderInterface::OP_RESIZE_SPAN
					: ReactDataProviderInterface::OP_RESCHEDULE;
				if (!$this->validateStageAndLanePayload($checkOp, $payload, $provider)) {
					$actionError = 'Field is not editable';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$id = trim((string) ($payload['id'] ?? ''));
				$startDate = trim((string) ($payload['startDate'] ?? $payload['targetDate'] ?? $payload['date'] ?? ''));
				$endDate = isset($payload['endDate']) && is_string($payload['endDate']) ? trim($payload['endDate']) : $startDate;
				$dateRequired = $action === 'resize_span' ? $endDate : $startDate;
				if ($id !== '' && $dateRequired !== '' && $provider !== null) {
					$mutationOp = $action === 'resize_span'
						? ReactDataProviderInterface::OP_RESIZE_SPAN
						: ReactDataProviderInterface::OP_RESCHEDULE;
					try {
						$provider->mutate($mutationOp, [$id], array_replace($payload, [
							'startDate' => $startDate,
							'targetDate' => $startDate,
							'endDate' => $endDate !== '' ? $endDate : $startDate,
							'targetEndDate' => $endDate !== '' ? $endDate : $startDate,
							'date' => $startDate,
						]));
						$this->noticeMessage = $action === 'resize_span'
							? $this->_('Updated item dates.')
							: $this->_('Rescheduled item.');
						$this->noticeType = 'success';
					} catch (\ProcessWire\WirePermissionException $e) {
						throw $e;
					} catch (\ProcessWire\WireException $e) {
						$this->noticeMessage = $e->getMessage();
						$this->noticeType = 'error';
					}
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
				break;

			case 'close_quick_edit':
				$this->quickEditRecordId = '';
				break;

			case 'save_quick_edit':
				if ($isLocked || !$this->quickEditEnabled) {
					$actionError = $isLocked ? 'Viewport is locked' : 'Quick edit is not enabled';
					$this->noticeMessage = $actionError;
					$this->noticeType = 'error';
					break;
				}
				$id = trim((string) ($payload['id'] ?? $this->quickEditRecordId));
				$values = isset($payload['values']) && is_array($payload['values']) ? $payload['values'] : [];
				if ($id !== '' && $values !== [] && $provider !== null) {
					foreach ($values as $fKey => $fVal) {
						if (!is_string($fKey) || $fKey === '' || str_starts_with($fKey, '_')) {
							continue;
						}
						if (!$this->isFieldEditable($fKey, true)) {
							$actionError = 'Field is not editable';
							$this->noticeMessage = $actionError;
							$this->noticeType = 'error';
							break 2;
						}
					}

					if ($provider instanceof ReactQuickEditProvider && $provider->supportsQuickEdit()) {
						$result = $provider->saveQuickEdit($id, $values);
						$this->noticeMessage = (string) ($result['message'] ?? $this->_('Record updated.'));
						$this->noticeType = ($result['ok'] ?? true) ? 'success' : 'error';
						if (($result['ok'] ?? true) === true) {
							$this->quickEditRecordId = '';
						}
					} else {
						foreach ($values as $fKey => $fVal) {
							if (!is_string($fKey) || $fKey === '' || str_starts_with($fKey, '_')) {
								continue;
							}
							$provider->mutate(ReactDataProviderInterface::OP_UPDATE_FIELD, [$id], [
								'field' => $fKey,
								'value' => $fVal,
							]);
						}
						$this->noticeMessage = $this->_('Record updated.');
						$this->noticeType = 'success';
						$this->quickEditRecordId = '';
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
				$allowedExportFormats = array_map('strtolower', $this->exportFormats);
				if (
					$this->exportEnabled
					&& $provider !== null
					&& ($allowedExportFormats === [] || in_array($format, $allowedExportFormats, true))
				) {
					$exported = $this->generateExportPayload($provider, $format);
					$this->downloadFilename = $exported['filename'];
					$this->downloadContent = $exported['content'];
					$this->downloadMime = $exported['mime'];
					$this->noticeMessage = sprintf($this->_('Exported %s.'), $exported['filename']);
					$this->noticeType = 'success';
				}
				break;
		}

		$mutatingMetadataActions = [
			'row_action',
			'bulk_action',
			'toolbar_action',
			'quick_create',
			'save_quick_edit',
			'toggle_field',
			'update_field',
			'move_stage',
		];
		if ($provider !== null && $actionError === '' && in_array($action, $mutatingMetadataActions, true)) {
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
				$rowActionsMap[$reactRec->id] = $provider->recordActions($reactRec);
			}
		}

		$quickEdit = $this->resolveQuickEditState($provider);
		$kanbanStages = $this->viewMode === 'kanban' || $this->stages !== []
			? $this->resolveKanbanStages($provider)
			: [];
		$calendarState = $this->viewMode === 'calendar' || $this->month > 0
			? $this->resolveCalendarState($provider)
			: null;

		$csrfName = '';
		$csrfValue = '';
		try {
			$csrf = $this->wire()->session->CSRF;
			$csrfName = (string) $csrf->getTokenName();
			$csrfValue = (string) $csrf->getTokenValue();
		} catch (\Throwable) {
			// Ignore if session CSRF is unavailable in CLI
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
			'viewScripts' => $this->resolveViewScriptsMap(),
			'viewStyles' => $this->resolveViewStylesMap(),
			'columns' => $this->columns,
			'displayColumns' => $displayColumns,
			'hiddenColumns' => array_values($this->hiddenColumns),
			'records' => $this->records,
			'filters' => $this->filters,
			'filterValues' => $this->filterValues,
			'bulkActions' => $this->bulkActions,
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
			'groupByField' => $this->groupByField,
			'stages' => $kanbanStages,
			'dateField' => $this->dateField,
			'endDateField' => $this->endDateField,
			'calendar' => $calendarState,
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
			'groupByField' => $this->groupByField,
			'stages' => $this->stages,
			'dateField' => $this->dateField,
			'endDateField' => $this->endDateField,
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
	 * Map each allowed viewport mode (`table`, `cards`, `kanban`, `calendar`, etc.)
	 * to its standalone script asset URLs so `<DataViewport />` can load view modes on demand.
	 *
	 * @return array<string, list<string>>
	 */
	protected function resolveViewScriptsMap(): array
	{
		return $this->resolveViewAssetMap(true);
	}

	/**
	 * Map each allowed viewport mode (`table`, `cards`, `kanban`, `calendar`, etc.)
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
	 * Resolve Quick-Edit schema and values when a record is open in the drawer/modal.
	 *
	 * @return array{recordId: string, record: array<string, mixed>, fields: array<string, array<string, mixed>>}|null
	 */
	protected function resolveQuickEditState(?ReactDataProviderInterface $provider): ?array
	{
		if (!$this->quickEditEnabled || $this->locked || $this->quickEditRecordId === '') {
			return null;
		}

		$editableMap = $this->inlineEditableFields;
		if ($provider instanceof ReactFieldSchemaProvider) {
			$editableMap = array_replace($provider->inlineEditableFields(), $editableMap);
		}

		$fields = [];
		foreach ($this->columns as $colKey => $colDef) {
			if ($colKey === 'id') {
				continue;
			}
			$fields[(string) $colKey] = [
				'label' => (string) ($colDef['label'] ?? $colKey),
				'type' => (string) ($colDef['type'] ?? 'text'),
				'options' => is_array($colDef['options'] ?? null) ? $colDef['options'] : [],
				'editable' => (bool) ($colDef['editable'] ?? isset($editableMap[$colKey])),
			];
		}

		foreach ($editableMap as $fKey => $fDef) {
			if ($fKey === 'id') {
				continue;
			}
			$existing = $fields[(string) $fKey] ?? [];
			$fields[(string) $fKey] = [
				'label' => (string) ($fDef['label'] ?? $existing['label'] ?? ucfirst(str_replace('_', ' ', (string) $fKey))),
				'type' => (string) ($fDef['type'] ?? $existing['type'] ?? 'text'),
				'options' => is_array($fDef['options'] ?? null)
					? $fDef['options']
					: (is_array($existing['options'] ?? null) ? $existing['options'] : []),
				'editable' => true,
			];
		}

		if ($this->quickEditRecordId === '__new__') {
			if (!isset($fields['title'])) {
				$fields = array_replace([
					'title' => [
						'label' => $this->_('Title'),
						'type' => 'text',
						'options' => [],
						'editable' => true,
					],
				], $fields);
			}

			$blankRecord = ['id' => '__new__', 'title' => ''];
			foreach (array_keys($fields) as $fKey) {
				$blankRecord[(string) $fKey] = '';
			}

			return [
				'recordId' => '__new__',
				'record' => $blankRecord,
				'fields' => $fields,
			];
		}

		foreach ($this->records as $row) {
			if ((string) ($row['id'] ?? '') === $this->quickEditRecordId) {
				return [
					'recordId' => $this->quickEditRecordId,
					'record' => $row,
					'fields' => $fields,
				];
			}
		}

		return null;
	}

	/**
	 * Resolve Kanban stage columns and grouped records.
	 *
	 * @return list<array{key: string, label: string, variant: string, limit: int, count: int, summary?: string, records: list<array<string, mixed>>}>
	 */
	protected function resolveKanbanStages(?ReactDataProviderInterface $provider = null): array
	{
		$field = $this->groupByField !== '' ? $this->groupByField : 'stage';
		$stageDefs = $this->stages;

		if ($stageDefs === [] && $provider !== null) {
			foreach ($provider->stageOptions($field) as $optKey => $optLabel) {
				$stageDefs[(string) $optKey] = [
					'label' => (string) $optLabel,
					'variant' => 'neutral',
				];
			}
		}

		if ($stageDefs === []) {
			foreach ($this->records as $row) {
				$val = trim((string) ($row['_stage'] ?? $row[$field] ?? 'default'));
				$key = $val !== '' ? $val : 'default';
				if (!isset($stageDefs[$key])) {
					$stageDefs[$key] = [
						'label' => ucfirst(str_replace(['_', '-'], ' ', $key)),
						'variant' => 'neutral',
					];
				}
			}
		}

		$stageSummaries = $provider instanceof ReactSummaryProvider
			? $provider->computeStageSummaries($this->buildQueryCriteria())
			: [];

		/** @var array<string, array{key: string, label: string, variant: string, limit: int, count: int, summary?: string, records: list<array<string, mixed>>}> $grouped */
		$grouped = [];
		foreach ($stageDefs as $stageKey => $def) {
			$sk = (string) $stageKey;
			$grouped[$sk] = [
				'key' => $sk,
				'label' => (string) ($def['label'] ?? $sk),
				'variant' => (string) ($def['variant'] ?? 'neutral'),
				'limit' => (int) ($def['limit'] ?? 0),
				'count' => 0,
				'summary' => isset($stageSummaries[$sk]['formatted']) ? (string) $stageSummaries[$sk]['formatted'] : '',
				'records' => [],
			];
		}

		foreach ($this->records as $row) {
			$stageVal = (string) ($row['_stage'] ?? $row[$field] ?? '');
			if (!isset($grouped[$stageVal])) {
				$firstKey = array_key_first($grouped);
				if ($firstKey === null || !isset($grouped[$firstKey])) {
					$fallbackKey = $stageVal !== '' ? $stageVal : 'default';
					$grouped[$fallbackKey] = [
						'key' => $fallbackKey,
						'label' => ucfirst($fallbackKey),
						'variant' => 'neutral',
						'limit' => 0,
						'count' => 1,
						'summary' => '',
						'records' => [$row],
					];
				} else {
					$grouped[$firstKey]['records'][] = $row;
					$grouped[$firstKey]['count']++;
				}
				continue;
			}
			$grouped[$stageVal]['records'][] = $row;
			$grouped[$stageVal]['count']++;
		}

		return array_values($grouped);
	}

	/**
	 * Resolve Calendar month/year metadata, conflicts, lanes, and date-indexed events.
	 *
	 * @return array<string, mixed>
	 */
	protected function resolveCalendarState(?ReactDataProviderInterface $provider = null): array
	{
		$month = $this->month >= 1 && $this->month <= 12 ? $this->month : (int) date('n');
		$year = $this->year >= 1970 && $this->year <= 2100 ? $this->year : (int) date('Y');
		$firstDayTs = mktime(0, 0, 0, $month, 1, $year) ?: time();
		$daysInMonth = (int) date('t', $firstDayTs);
		$firstDayOfWeek = (int) date('N', $firstDayTs);
		$monthLabel = date('F Y', $firstDayTs);

		$field = $this->dateField !== '' ? $this->dateField : 'start_date';
		$endField = $this->endDateField;
		$eventsByDate = [];
		$conflicts = $provider instanceof ReactCalendarProvider ? $provider->conflicts($this->reactRecords) : [];

		foreach ($this->records as $row) {
			$rawStart = trim((string) ($row['_startDate'] ?? $row[$field] ?? $row['created'] ?? ''));
			if ($rawStart === '') {
				continue;
			}
			$startTs = is_numeric($rawStart) ? (int) $rawStart : strtotime($rawStart);
			if ($startTs === false || $startTs <= 0) {
				continue;
			}

			$startDate = date('Y-m-d', $startTs);
			$endDate = $startDate;
			$rawEnd = trim((string) ($row['_endDate'] ?? ($endField !== '' ? ($row[$endField] ?? '') : '')));
			if ($rawEnd !== '') {
				$endTs = is_numeric($rawEnd) ? (int) $rawEnd : strtotime($rawEnd);
				if ($endTs !== false && $endTs >= $startTs) {
					$endDate = date('Y-m-d', $endTs);
				}
			}

			$recId = (string) ($row['id'] ?? '');
			$cursorTs = strtotime($startDate) ?: $startTs;
			$limitTs = min(strtotime($endDate) ?: $startTs, $cursorTs + (60 * 86400));
			while ($cursorTs <= $limitTs) {
				$dayKey = date('Y-m-d', $cursorTs);
				$eventsByDate[$dayKey][] = array_replace($row, [
					'_startDate' => $startDate,
					'_endDate' => $endDate,
					'_isMultiDay' => $startDate !== $endDate,
					'_hasConflict' => !empty($conflicts[$recId]),
				]);
				$cursorTs = strtotime('+1 day', $cursorTs) ?: ($limitTs + 1);
			}
		}

		return [
			'month' => $month,
			'year' => $year,
			'monthLabel' => $monthLabel,
			'calendarView' => $this->calendarView,
			'dateField' => $field,
			'endDateField' => $endField,
			'daysInMonth' => $daysInMonth,
			'firstDayOfWeek' => $firstDayOfWeek,
			'eventsByDate' => $eventsByDate,
			'laneField' => $provider instanceof ReactCalendarProvider ? $provider->laneField() : '',
			'laneOptions' => $provider instanceof ReactCalendarProvider ? $provider->laneOptions() : [],
			'conflicts' => $conflicts,
		];
	}

	/**
	 * Generate CSV or JSON export content for the active filter set.
	 *
	 * @return array{filename: string, content: string, mime: string}
	 */
	protected function generateExportPayload(ReactDataProviderInterface $provider, string $format): array
	{
		$exportFormat = in_array($format, ['csv', 'json'], true) ? $format : 'csv';
		$criteria = $this->buildQueryCriteria();

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
