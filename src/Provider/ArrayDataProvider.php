<?php

declare(strict_types=1);

namespace Totoglu\React\Provider;

use Closure;
use ProcessWire\Wire;
use Totoglu\React\Contract\ReactBulkFieldsProvider;
use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Contract\ReactExportProvider;
use Totoglu\React\Contract\ReactFieldSchemaProvider;
use Totoglu\React\Contract\ReactQuickEditProvider;
use Totoglu\React\Contract\ReactRecordActionsProvider;
use Totoglu\React\Contract\ReactReorderProvider;
use Totoglu\React\Contract\ReactSummaryProvider;
use Totoglu\React\Contract\ReactViewsProvider;
use Totoglu\React\Data\ReactColumn;
use Totoglu\React\Data\ReactPageResult;
use Totoglu\React\Data\ReactRecord;
use Totoglu\React\Viewport\MarkupReactViewport;

/**
 * In-memory array / closure adapter implementing `ReactDataProviderInterface`.
 *
 * Powers telemetry tables, configuration lists, and unit/feature test fixtures without touching a database.
 */
final class ArrayDataProvider extends Wire implements
	ReactDataProviderInterface,
	ReactBulkFieldsProvider,
	ReactFieldSchemaProvider,
	ReactViewsProvider,
	ReactExportProvider,
	ReactSummaryProvider,
	ReactQuickEditProvider,
	ReactRecordActionsProvider,
	ReactReorderProvider
{
	/**
	 * @var list<array<string, mixed>|ReactRecord>
	 */
	private array $items = [];

	/**
	 * @var Closure(): list<array<string, mixed>|ReactRecord>|null
	 */
	private ?Closure $itemsLoader = null;

	private string $title;

	/**
	 * @var array<string, string>
	 */
	private array $columns;

	/**
	 * @var array<string, array<string, mixed>>
	 */
	private array $columnSchemas = [];

	/**
	 * @var list<string>
	 */
	private array $sortableColumns;

	/**
	 * @var array<string, string>
	 */
	private array $statusOptions;

	private bool $locked;

	/**
	 * @var array<string, array{label: string, options: array<string, string>}>
	 */
	private array $bulkFields = [];

	/**
	 * @var list<string>|array<string, bool>
	 */
	private array $htmlColumns = [];

	/**
	 * @var array<string, array{label: string, type: 'select'|'boolean'|'text'|'date', options?: array<string, string>}>
	 */
	private array $filterableFields = [];

	/**
	 * @var array<string, string>
	 */
	private array $groupableFields = [];

	/**
	 * @var array<string, string>
	 */
	private array $availableColumns = [];

	/**
	 * @var array<string, array{type: 'select'|'text'|'number'|'date'|'email'|'url'|'toggle'|'boolean', label?: string, options?: array<string, string>, step?: string}>
	 */
	private array $inlineEditableFields = [];

	/**
	 * @var array<string, array{label: string, icon?: string, layout?: string, columns?: list<string>, sort?: string, groupBy?: string, search?: string, statusFilter?: string, fieldFilters?: array<string, string>}>
	 */
	private array $savedViews = [];

	/**
	 * @var list<string>
	 */
	private array $exportFormats = [];

	/**
	 * @var array<string, string|array<string, mixed>>
	 */
	private array $summaries = [];

	private bool $quickEdit = false;

	/**
	 * @var Closure(string, array<string, mixed>): array{ok: bool, message?: string, errors?: array<string, string>}|null
	 */
	private ?Closure $quickEditSaver = null;

	/**
	 * @var list<array{key: string, label: string, icon?: string, tone?: 'default'|'primary'|'danger'|'warning'|'success', href?: string, confirm?: string}>
	 */
	private array $recordActions = [];

	/**
	 * @var array{url: string, label: string, modal?: bool}|null
	 */
	private ?array $createAction = null;

	private bool $sortable = false;

	/**
	 * @var array<string, mixed>
	 */
	private array $options = [];

	/**
	 * @var Closure(string, list<string>, array<string, mixed>, list<array<string, mixed>>): list<array<string, mixed>>|null
	 */
	private ?Closure $mutator = null;

	/**
	 * @param list<array<string, mixed>|ReactRecord>|Closure(): list<array<string, mixed>|ReactRecord> $items
	 * @param array<string, mixed> $options
	 */
	public function __construct(
		private readonly string $id,
		array|Closure $items = [],
		array $options = [],
	) {
		parent::__construct();
		if ($items instanceof Closure) {
			$this->itemsLoader = $items;
		} else {
			$this->items = array_values($items);
		}
		$this->title = $this->_('Records');
		$this->columns = ['title' => $this->_('Title'), 'status' => $this->_('Status')];
		$this->sortableColumns = array_keys($this->columns);
		$this->statusOptions = [
			'published' => $this->_('Published'),
			'draft' => $this->_('Draft'),
			'trash' => $this->_('Trash'),
		];
		$this->locked = false;
		$this->applyOptions($options);
	}

	/**
	 * Apply or override provider configuration options (used on initial resolve and after viewport round-trip hydration).
	 *
	 * @param array<string, mixed> $options
	 */
	public function applyOptions(array $options): self
	{
		if (isset($options['mutator']) && $options['mutator'] instanceof Closure) {
			$this->mutator = $options['mutator'];
			unset($options['mutator']);
		}
		if (isset($options['quickEditSaver']) && $options['quickEditSaver'] instanceof Closure) {
			$this->quickEditSaver = $options['quickEditSaver'];
			$this->quickEdit = true;
			unset($options['quickEditSaver']);
		}
		if (is_array($options['items'] ?? null) && $this->items === [] && $this->itemsLoader === null) {
			$this->items = array_values($options['items']);
		}
		unset($options['items']);

		$this->options = array_merge($this->options, $options);

		if (array_key_exists('title', $options) && (string) $options['title'] !== '') {
			$this->title = (string) $options['title'];
		}
		if (is_array($options['columns'] ?? null) && $options['columns'] !== []) {
			$split = ReactColumn::splitColumnsAndSchemas($options['columns']);
			$this->columns = $split['columns'];
			if ($split['schemas'] !== []) {
				$this->columnSchemas = array_replace($this->columnSchemas, $split['schemas']);
			}
			if (!array_key_exists('sortableColumns', $options)) {
				$this->sortableColumns = array_values(array_filter(
					array_keys($this->columns),
					fn(string $colKey): bool => !ReactColumn::isVisualType((string) ($this->columnSchemas[$colKey]['type'] ?? ''))
						&& ($this->columnSchemas[$colKey]['sortable'] ?? true) !== false
				));
			}
		}
		if (is_array($options['columnSchemas'] ?? null)) {
			foreach ($options['columnSchemas'] as $ck => $cv) {
				if (is_string($ck) && is_array($cv)) {
					$this->columnSchemas[$ck] = array_replace($this->columnSchemas[$ck] ?? [], $cv);
				}
			}
		}
		if (is_array($options['sortableColumns'] ?? null)) {
			$this->sortableColumns = array_values(array_map('strval', $options['sortableColumns']));
		}
		if (is_array($options['statusOptions'] ?? null)) {
			$this->statusOptions = $options['statusOptions'];
		}
		if (array_key_exists('locked', $options)) {
			$this->locked = (bool) $options['locked'];
		}
		if (is_array($options['bulkFields'] ?? null)) {
			$this->bulkFields = $options['bulkFields'];
		}
		if (is_array($options['htmlColumns'] ?? null)) {
			$this->htmlColumns = $options['htmlColumns'];
		}
		if (is_array($options['filterableFields'] ?? null)) {
			$this->filterableFields = $options['filterableFields'];
		}
		$groupOpts = $options['groupableFields'] ?? $options['groupableColumns'] ?? null;
		if (is_array($groupOpts)) {
			$normalizedGroup = [];
			foreach ($groupOpts as $gk => $gv) {
				if (is_int($gk)) {
					$colKey = (string) $gv;
					$normalizedGroup[$colKey] = $this->columns[$colKey] ?? ucfirst(str_replace('_', ' ', $colKey));
				} else {
					$normalizedGroup[(string) $gk] = (string) $gv;
				}
			}
			$this->groupableFields = $normalizedGroup;
		}
		if (is_array($options['availableColumns'] ?? null)) {
			$normalizedAvail = [];
			foreach ($options['availableColumns'] as $k => $v) {
				if (is_int($k)) {
					$colKey = (string) $v;
					$normalizedAvail[$colKey] = ucfirst(str_replace('_', ' ', $colKey));
				} else {
					$normalizedAvail[(string) $k] = (string) $v;
				}
			}
			$this->availableColumns = $normalizedAvail;
		}
		if (is_array($options['inlineEditableFields'] ?? null)) {
			$this->inlineEditableFields = $options['inlineEditableFields'];
		}
		if (is_array($options['savedViews'] ?? null)) {
			$this->savedViews = $options['savedViews'];
		}
		if (is_array($options['exportFormats'] ?? null)) {
			$this->exportFormats = array_values(array_map('strval', $options['exportFormats']));
		}
		if (is_array($options['summaries'] ?? null)) {
			$this->summaries = $options['summaries'];
		}
		if (array_key_exists('quickEdit', $options)) {
			$this->quickEdit = (bool) $options['quickEdit'];
		}
		if (is_array($options['recordActions'] ?? null)) {
			$this->recordActions = array_values($options['recordActions']);
		}
		if (array_key_exists('createAction', $options)) {
			if (is_array($options['createAction']) && isset($options['createAction']['url'], $options['createAction']['label'])) {
				$safeCreateUrl = \Totoglu\React\Security\UrlSanitizer::sanitizeHref((string) $options['createAction']['url']);
				if ($safeCreateUrl !== '') {
					$actionCfg = [
						'url' => $safeCreateUrl,
						'label' => (string) $options['createAction']['label'],
					];
					if (array_key_exists('modal', $options['createAction'])) {
						$actionCfg['modal'] = (bool) $options['createAction']['modal'];
					}
					$this->createAction = $actionCfg;
				} else {
					$this->createAction = null;
				}
			} else {
				$this->createAction = null;
			}
		}
		if (array_key_exists('sortable', $options)) {
			$this->sortable = (bool) $options['sortable'];
		}

		return $this;
	}

	/**
	 * Read a provider option by key.
	 */
	public function option(string $key, mixed $default = null): mixed
	{
		return $this->options[$key] ?? $default;
	}

	/**
	 * Return all applied provider options.
	 *
	 * @return array<string, mixed>
	 */
	public function options(): array
	{
		return $this->options;
	}

	public function id(): string
	{
		return $this->id;
	}

	public function title(): string
	{
		return $this->title;
	}

	public function columns(): array
	{
		return $this->columns;
	}

	public function sortableColumns(): array
	{
		return $this->sortableColumns;
	}

	public function statusOptions(): array
	{
		return $this->statusOptions;
	}

	public function isLocked(): bool
	{
		return $this->locked;
	}

	public function bulkEditableFields(): array
	{
		return $this->bulkFields;
	}

	/**
	 * Find a normalized record by ID.
	 */
	public function findById(string $id): ?ReactRecord
	{
		foreach ($this->normalizeRecords() as $rec) {
			if ($rec->id === $id) {
				return $rec;
			}
		}

		return null;
	}

	public function filterableFields(): array
	{
		return $this->filterableFields;
	}

	public function groupableFields(): array
	{
		return $this->groupableFields;
	}

	public function availableColumns(): array
	{
		return $this->availableColumns !== [] ? $this->availableColumns : $this->columns;
	}

	/**
	 * @return array<string, array<string, mixed>>
	 */
	public function columnSchemas(): array
	{
		return $this->columnSchemas;
	}

	public function inlineEditableFields(): array
	{
		return $this->inlineEditableFields;
	}

	public function savedViews(): array
	{
		return $this->savedViews;
	}

	public function exportFormats(): array
	{
		return $this->exportFormats;
	}

	public function export(string $format, array $criteria = []): array
	{
		$fmt = strtolower(trim($format));
		if ($fmt === '') {
			$fmt = $this->exportFormats[0] ?? 'csv';
		}

		$result = $this->query(array_merge($criteria, [
			'pageNum' => 1,
			'limit' => 100000,
		]));
		$cols = $this->columns;
		$slug = (string) preg_replace('/[^a-zA-Z0-9_-]/', '-', $this->id);

		if ($fmt === 'json') {
			$rows = [];
			foreach ($result->items as $rec) {
				$row = ['id' => $rec->id];
				foreach (array_keys($cols) as $colKey) {
					$row[$colKey] = $rec->getDisplayValue($colKey);
				}
				$rows[] = $row;
			}

			return [
				'filename' => $slug . '.json',
				'contentType' => 'application/json; charset=UTF-8',
				'body' => (string) json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
			];
		}

		$lines = [];
		$headers = array_merge(['id'], array_keys($cols));
		$lines[] = implode(',', array_map(static fn (string $h): string => '"' . str_replace('"', '""', MarkupReactViewport::sanitizeCsvCell($h)) . '"', $headers));
		foreach ($result->items as $rec) {
			$vals = [MarkupReactViewport::sanitizeCsvCell((string) $rec->id)];
			foreach (array_keys($cols) as $colKey) {
				$vals[] = MarkupReactViewport::sanitizeCsvCell((string) $rec->getDisplayValue($colKey));
			}
			$lines[] = implode(',', array_map(static fn (string $v): string => '"' . str_replace('"', '""', $v) . '"', $vals));
		}

		return [
			'filename' => $slug . '.csv',
			'contentType' => 'text/csv; charset=UTF-8',
			'body' => implode("\n", $lines) . "\n",
		];
	}

	public function summaryConfig(): array
	{
		$out = [];
		foreach ($this->summaries as $colKey => $aggDef) {
			if (is_array($aggDef)) {
				$out[$colKey] = strtolower(trim((string) ($aggDef['op'] ?? $aggDef['type'] ?? 'sum')));
			} else {
				$out[$colKey] = strtolower(trim((string) $aggDef));
			}
		}

		return $out;
	}

	public function computeSummaries(array $criteria = []): array
	{
		if ($this->summaries === []) {
			return [];
		}

		$result = $this->query(array_merge($criteria, [
			'pageNum' => 1,
			'limit' => 100000,
		]));
		$items = $result->items;
		$out = [];

		foreach ($this->summaries as $colKey => $aggDef) {
			$type = is_array($aggDef)
				? strtolower(trim((string) ($aggDef['op'] ?? $aggDef['type'] ?? 'sum')))
				: strtolower(trim((string) $aggDef));
			if (!in_array($type, ['sum', 'avg', 'min', 'max', 'count'], true)) {
				continue;
			}
			$prefix = is_array($aggDef) ? (string) ($aggDef['prefix'] ?? '') : '';
			$suffix = is_array($aggDef) ? (string) ($aggDef['suffix'] ?? '') : '';
			$label = is_array($aggDef) && isset($aggDef['label']) && (string) $aggDef['label'] !== ''
				? (string) $aggDef['label']
				: match ($type) {
					'sum' => $this->_('Sum'),
					'avg' => $this->_('Avg'),
					'min' => $this->_('Min'),
					'max' => $this->_('Max'),
					default => $this->_('Count'),
				};

			if ($type === 'count') {
				$cnt = count($items);
				$out[$colKey] = [
					'type' => 'count',
					'label' => $label,
					'formatted' => $prefix . (string) $cnt . $suffix,
					'raw' => $cnt,
				];
				continue;
			}

			$nums = [];
			foreach ($items as $rec) {
				$rawVal = $rec->getValue($colKey);
				if (is_int($rawVal) || is_float($rawVal) || (is_string($rawVal) && is_numeric($rawVal))) {
					$nums[] = (float) $rawVal;
				}
			}

			if ($nums === []) {
				$out[$colKey] = [
					'type' => $type,
					'label' => $label,
					'formatted' => $prefix . '0' . $suffix,
					'raw' => 0,
				];
				continue;
			}

			$raw = match ($type) {
				'sum' => array_sum($nums),
				'avg' => array_sum($nums) / count($nums),
				'min' => min($nums),
				'max' => max($nums),
			};
			$rounded = round($raw, 2);
			$formattedNum = floor($rounded) === $rounded
				? number_format($rounded, 0, '.', ',')
				: number_format($rounded, 2, '.', ',');

			$out[$colKey] = [
				'type' => $type,
				'label' => $label,
				'formatted' => $prefix . $formattedNum . $suffix,
				'raw' => $rounded,
			];
		}

		return $out;
	}

	public function supportsQuickEdit(): bool
	{
		return $this->quickEdit;
	}

	public function saveQuickEdit(string $id, array $input): array
	{
		if ($this->locked) {
			return ['ok' => false, 'message' => $this->_('Provider is locked.')];
		}

		if ($this->quickEditSaver instanceof Closure) {
			return ($this->quickEditSaver)($id, $input);
		}

		$title = trim((string) ($input['title'] ?? ''));
		if ($title === '') {
			return [
				'ok' => false,
				'message' => $this->_('Title is required.'),
				'errors' => ['title' => $this->_('Title is required.')],
			];
		}

		if ($id === '__new__') {
			$newId = 'item_' . (count($this->items) + 1);
			$row = ['id' => $newId, 'title' => $title, 'status' => 1];
			foreach ($input as $k => $v) {
				if (is_string($k) && $k !== '' && !str_starts_with($k, '_token') && !str_starts_with($k, 'TOKEN') && $k !== 'itemId') {
					$row[$k] = $v;
				}
			}
			$this->items[] = $row;

			return ['ok' => true, 'message' => $this->_('Created record.')];
		}

		foreach ($this->items as $idx => $row) {
			$arr = $row instanceof ReactRecord ? $row->values : (is_array($row) ? $row : []);
			$itemId = (string) ($arr['id'] ?? ($row instanceof ReactRecord ? $row->id : ($idx + 1)));
			if ($itemId !== $id) {
				continue;
			}
			$arr['title'] = $title;
			foreach ($input as $k => $v) {
				if (is_string($k) && $k !== '' && !str_starts_with($k, '_token') && !str_starts_with($k, 'TOKEN') && $k !== 'itemId') {
					$arr[$k] = $v;
				}
			}
			$this->items[$idx] = $arr;

			return ['ok' => true, 'message' => $this->_('Saved record.')];
		}

		return ['ok' => false, 'message' => $this->_('Record not found.')];
	}

	public function createQuickRecord(string $title, array $context = []): ?string
	{
		$cleanTitle = trim($title);
		if ($this->locked || $cleanTitle === '') {
			return null;
		}

		$newId = 'item_' . (count($this->items) + 1);
		$row = [
			'id' => $newId,
			'title' => $cleanTitle,
			'status' => 1,
		];
		foreach ($context as $ctxKey => $ctxVal) {
			if (is_string($ctxKey) && $ctxKey !== '' && $ctxKey !== 'id' && $ctxKey !== 'title' && is_scalar($ctxVal) && (string) $ctxVal !== '') {
				$row[$ctxKey] = (string) $ctxVal;
			}
		}
		$this->items[] = $row;

		return $newId;
	}

	public function recordActions(ReactRecord $record): array
	{
		return $this->recordActions;
	}

	public function createAction(): ?array
	{
		return $this->createAction;
	}

	public function isSortable(): bool
	{
		return $this->sortable;
	}

	/**
	 * Normalize all stored items into `ReactRecord` objects.
	 *
	 * @return list<ReactRecord>
	 */
	private function normalizeRecords(string $editUrlBase = ''): array
	{
		if ($this->itemsLoader !== null && $this->items === []) {
			$loaded = ($this->itemsLoader)();
			if (is_array($loaded)) {
				$this->items = array_values($loaded);
			}
		}

		$records = [];
		foreach ($this->items as $idx => $row) {
			if ($row instanceof ReactRecord) {
				$records[] = $row;
				continue;
			}
			if (!is_array($row)) {
				continue;
			}

			$id = (string) ($row['id'] ?? ($idx + 1));
			$title = (string) ($row['title'] ?? $row['label'] ?? $row['name'] ?? $id);
			$name = (string) ($row['name'] ?? $id);
			$status = (int) ($row['status'] ?? ReactRecord::STATUS_PUBLISHED);
			$statusVariant = (string) ($row['statusVariant'] ?? match (true) {
				($status & ReactRecord::STATUS_TRASH) === ReactRecord::STATUS_TRASH => 'danger',
				($status & ReactRecord::STATUS_DRAFT) === ReactRecord::STATUS_DRAFT => 'warning',
				default => 'success',
			});
			$statusLabel = (string) ($row['statusLabel'] ?? match ($statusVariant) {
				'danger' => $this->_('Trash'),
				'warning' => $this->_('Draft'),
				default => $this->_('Published'),
			});
			$editUrl = (string) ($row['editUrl'] ?? ($editUrlBase !== '' ? rtrim($editUrlBase, '/') . '/?id=' . rawurlencode($id) : ''));

			/** @var array<string, string> $formatted */
			$formatted = is_array($row['formatted'] ?? null) ? $row['formatted'] : [];
			$rowHtmlColumns = is_array($row['htmlColumns'] ?? null) ? $row['htmlColumns'] : $this->htmlColumns;

			$rawIcon = $row['_icon'] ?? $row['icon'] ?? '';
			$recordIcon = is_string($rawIcon) || is_array($rawIcon) ? $rawIcon : '';

			$rawThumb = $row['_thumb'] ?? $row['thumb'] ?? null;
			$recordThumb = null;
			if (is_array($rawThumb) && isset($rawThumb['src']) && is_string($rawThumb['src']) && trim($rawThumb['src']) !== '') {
				$recordThumb = [
					'src' => trim($rawThumb['src']),
					'alt' => (string) ($rawThumb['alt'] ?? $title),
					'count' => max(1, (int) ($rawThumb['count'] ?? 1)),
				];
			} elseif (is_string($rawThumb) && trim($rawThumb) !== '') {
				$recordThumb = [
					'src' => trim($rawThumb),
					'alt' => $title,
					'count' => 1,
				];
			}

			/** @var list<array{label: string, variant?: string, dot?: bool}> $recordBadges */
			$recordBadges = [];
			$rawBadges = $row['_badges'] ?? $row['badges'] ?? null;
			if (is_array($rawBadges)) {
				foreach ($rawBadges as $b) {
					if (is_string($b) && trim($b) !== '') {
						$recordBadges[] = ['label' => trim($b)];
					} elseif (is_array($b) && isset($b['label']) && is_scalar($b['label']) && trim((string) $b['label']) !== '') {
						$badgeItem = ['label' => trim((string) $b['label'])];
						if (isset($b['variant']) && is_string($b['variant'])) {
							$badgeItem['variant'] = $b['variant'];
						}
						if (isset($b['dot'])) {
							$badgeItem['dot'] = (bool) $b['dot'];
						}
						$recordBadges[] = $badgeItem;
					}
				}
			}

			/** @var array<string, array<string, mixed>> $recordCells */
			$recordCells = [];
			$rawCells = $row['_cells'] ?? $row['cells'] ?? null;
			if (is_array($rawCells)) {
				foreach ($rawCells as $cellKey => $cellVal) {
					if (is_string($cellKey) && is_array($cellVal)) {
						$recordCells[$cellKey] = $cellVal;
					}
				}
			}

			$records[] = new ReactRecord(
				id: $id,
				title: $title,
				name: $name,
				status: $status,
				statusVariant: $statusVariant,
				statusLabel: $statusLabel,
				values: $row,
				formatted: $formatted,
				editUrl: $editUrl,
				viewUrl: (string) ($row['viewUrl'] ?? ''),
				depth: (int) ($row['depth'] ?? 0),
				sort: (int) ($row['sort'] ?? $idx),
				created: (int) ($row['created'] ?? 0),
				modified: (int) ($row['modified'] ?? 0),
				hasDraft: (bool) ($row['hasDraft'] ?? false),
				raw: $row,
				subtitle: (string) ($row['_subtitle'] ?? $row['subtitle'] ?? ''),
				thumbHtml: (string) ($row['thumbHtml'] ?? ''),
				formattedIsHtml: (bool) ($row['formattedIsHtml'] ?? false),
				htmlColumns: $rowHtmlColumns,
				parentId: (string) ($row['parentId'] ?? ''),
				isEditableField: is_array($row['isEditableField'] ?? null) ? $row['isEditableField'] : [],
				icon: $recordIcon,
				thumb: $recordThumb,
				badges: $recordBadges,
				cells: $recordCells,
			);
		}

		return $records;
	}

	public function query(array $criteria = []): ReactPageResult
	{
		$activeView = trim((string) ($criteria['activeView'] ?? ''));
		$viewMeta = ($activeView !== '' && isset($this->savedViews[$activeView]) && is_array($this->savedViews[$activeView]))
			? $this->savedViews[$activeView]
			: [];

		$search = strtolower(trim((string) ($criteria['search'] ?? '')));
		if ($search === '' && isset($viewMeta['search'])) {
			$search = strtolower(trim((string) $viewMeta['search']));
		}

		$statusFilter = strtolower(trim((string) ($criteria['statusFilter'] ?? '')));
		if ($statusFilter === '' && isset($viewMeta['statusFilter'])) {
			$statusFilter = strtolower(trim((string) $viewMeta['statusFilter']));
		}

		/** @var array<string, string> $fieldFilters */
		$fieldFilters = is_array($criteria['fieldFilters'] ?? null) ? $criteria['fieldFilters'] : [];
		if (is_array($viewMeta['fieldFilters'] ?? null)) {
			foreach ($viewMeta['fieldFilters'] as $vfKey => $vfVal) {
				if (!isset($fieldFilters[$vfKey]) || $fieldFilters[$vfKey] === '') {
					$fieldFilters[(string) $vfKey] = (string) $vfVal;
				}
			}
		}

		$dateFrom = trim((string) ($criteria['dateFrom'] ?? ''));
		$dateTo = trim((string) ($criteria['dateTo'] ?? ''));
		$sortBy = trim((string) ($criteria['sortBy'] ?? ''));
		if ($sortBy === '' && isset($viewMeta['sort'])) {
			$sortBy = trim((string) $viewMeta['sort']);
		}
		$pageNum = max(1, (int) ($criteria['pageNum'] ?? 1));
		$limit = max(1, (int) ($criteria['limit'] ?? 25));
		$editUrl = (string) ($criteria['editUrl'] ?? '');

		/** @var array<string, bool>|null $idFilterMap */
		$idFilterMap = null;
		if (isset($criteria['ids']) && is_array($criteria['ids']) && $criteria['ids'] !== []) {
			$idFilterMap = [];
			foreach ($criteria['ids'] as $rawId) {
				if (is_scalar($rawId)) {
					$cleanId = trim((string) $rawId);
					if ($cleanId !== '') {
						$idFilterMap[$cleanId] = true;
					}
				}
			}
		}

		$allRecords = $this->normalizeRecords($editUrl);
		$trashCount = 0;
		foreach ($allRecords as $rec) {
			if ($rec->isTrash()) {
				$trashCount++;
			}
		}

		$dateCol = trim((string) ($this->options['dateField'] ?? ''));
		$filtered = array_filter($allRecords, static function (ReactRecord $rec) use ($search, $statusFilter, $fieldFilters, $dateFrom, $dateTo, $dateCol, $idFilterMap): bool {
			if ($idFilterMap !== null && !isset($idFilterMap[$rec->id])) {
				return false;
			}
			if ($statusFilter === 'trash') {
				if (!$rec->isTrash()) {
					return false;
				}
			} else {
				if ($rec->isTrash()) {
					return false;
				}
				if ($statusFilter === 'published' && $rec->isDraft()) {
					return false;
				}
				if (($statusFilter === 'draft' || $statusFilter === 'unpublished') && !$rec->isDraft()) {
					return false;
				}
			}

			if ($search !== '') {
				$haystack = strtolower($rec->title . ' ' . $rec->name . ' ' . implode(' ', array_map(
					static fn (mixed $v): string => is_scalar($v) ? (string) $v : '',
					$rec->values
				)));
				if (!str_contains($haystack, $search)) {
					return false;
				}
			}

			foreach ($fieldFilters as $fKey => $fVal) {
				$fVal = trim((string) $fVal);
				if ($fVal === '') {
					continue;
				}
				if ((string) $rec->getValue($fKey, '') !== $fVal) {
					return false;
				}
			}

			if ($dateCol !== '' && ($dateFrom !== '' || $dateTo !== '')) {
				$recDate = substr((string) $rec->getValue($dateCol, ''), 0, 10);
				if ($dateFrom !== '' && ($recDate === '' || strcmp($recDate, $dateFrom) < 0)) {
					return false;
				}
				if ($dateTo !== '' && ($recDate === '' || strcmp($recDate, $dateTo) > 0)) {
					return false;
				}
			}

			return true;
		});

		$filtered = array_values($filtered);

		if ($sortBy !== '') {
			$desc = str_starts_with($sortBy, '-');
			$col = ltrim($sortBy, '-');
			usort($filtered, static function (ReactRecord $a, ReactRecord $b) use ($col, $desc): int {
				$va = $col === 'sort' ? $a->sort : $a->getValue($col, '');
				$vb = $col === 'sort' ? $b->sort : $b->getValue($col, '');
				if (is_numeric($va) && is_numeric($vb)) {
					$cmp = (float) $va <=> (float) $vb;
				} else {
					$cmp = strnatcasecmp((string) $va, (string) $vb);
				}

				return $desc ? -$cmp : $cmp;
			});
		} elseif ($this->sortable) {
			usort($filtered, static fn (ReactRecord $a, ReactRecord $b): int => $a->sort <=> $b->sort);
		}

		$total = count($filtered);
		$offset = ($pageNum - 1) * $limit;
		$sliced = array_slice($filtered, $offset, $limit);

		return new ReactPageResult(
			items: $sliced,
			total: $total,
			pageNum: $pageNum,
			limit: $limit,
			trashCount: $trashCount,
		);
	}

	public function mutate(string $operation, array $ids, array $payload = []): int
	{
		if ($this->locked) {
			return 0;
		}

		if ($operation === ReactDataProviderInterface::OP_EMPTY_TRASH) {
			$affected = 0;
			$keptItems = [];
			foreach ($this->items as $row) {
				$arr = $row instanceof ReactRecord ? $row->values : (is_array($row) ? $row : []);
				$status = (int) ($arr['status'] ?? ($row instanceof ReactRecord ? $row->status : 1));
				if (($status & ReactRecord::STATUS_TRASH) === ReactRecord::STATUS_TRASH) {
					$affected++;
				} else {
					$keptItems[] = $row;
				}
			}
			$this->items = $keptItems;
			if ($this->mutator !== null) {
				$rawRows = array_map(
					static fn (array|ReactRecord $r): array => $r instanceof ReactRecord ? $r->values : $r,
					$this->items
				);
				$this->items = ($this->mutator)($operation, $ids, $payload, $rawRows);
			}

			return $affected;
		}

		if ($ids === []) {
			return 0;
		}

		if ($operation === ReactDataProviderInterface::OP_REORDER) {
			$orderedIds = array_values(array_map('strval', $ids));
			$byId = [];
			$rest = [];
			foreach ($this->items as $idx => $row) {
				$arr = $row instanceof ReactRecord ? $row->values : (is_array($row) ? $row : []);
				$itemId = (string) ($arr['id'] ?? ($row instanceof ReactRecord ? $row->id : ($idx + 1)));
				if (in_array($itemId, $orderedIds, true)) {
					$byId[$itemId] = $arr;
				} else {
					$rest[] = $arr;
				}
			}
			$reordered = [];
			$sortOrder = 0;
			foreach ($orderedIds as $oid) {
				if (isset($byId[$oid])) {
					$itemArr = $byId[$oid];
					$itemArr['sort'] = $sortOrder++;
					$reordered[] = $itemArr;
				}
			}
			foreach ($rest as $restArr) {
				$restArr['sort'] = $sortOrder++;
				$reordered[] = $restArr;
			}
			$this->items = $reordered;
			$affected = count($byId);
			if ($this->mutator !== null) {
				$this->items = ($this->mutator)($operation, $ids, $payload, $this->items);
			}

			return $affected;
		}

		if ($operation === ReactDataProviderInterface::OP_MOVE) {
			$targetId = (string) $ids[0];
			$direction = strtolower(trim((string) ($payload['direction'] ?? '')));
			$rows = [];
			$foundIdx = -1;
			foreach ($this->items as $idx => $row) {
				$arr = $row instanceof ReactRecord ? $row->values : (is_array($row) ? $row : []);
				$itemId = (string) ($arr['id'] ?? ($row instanceof ReactRecord ? $row->id : ($idx + 1)));
				if ($itemId === $targetId) {
					$foundIdx = count($rows);
				}
				$rows[] = $arr;
			}
			$swapIdx = $direction === 'up' ? $foundIdx - 1 : ($direction === 'down' ? $foundIdx + 1 : -1);
			if ($foundIdx >= 0 && $swapIdx >= 0 && $swapIdx < count($rows)) {
				$tmp = $rows[$foundIdx];
				$rows[$foundIdx] = $rows[$swapIdx];
				$rows[$swapIdx] = $tmp;
				foreach ($rows as $sIdx => $rArr) {
					$rows[$sIdx]['sort'] = $sIdx;
				}
				$this->items = $rows;
				if ($this->mutator !== null) {
					$this->items = ($this->mutator)($operation, $ids, $payload, $this->items);
				}

				return 1;
			}

			return 0;
		}

		$idMap = array_fill_keys(array_map('strval', $ids), true);
		$affected = 0;
		$clonedRows = [];
		$deletedIndices = [];

		foreach ($this->items as $idx => $row) {
			$arr = $row instanceof ReactRecord ? $row->values : (is_array($row) ? $row : []);
			$itemId = (string) ($arr['id'] ?? ($row instanceof ReactRecord ? $row->id : ($idx + 1)));
			if (!isset($idMap[$itemId])) {
				continue;
			}

			switch ($operation) {
				case 'publish':
					$arr['status'] = 1;
					$arr['statusVariant'] = 'success';
					$arr['statusLabel'] = 'Published';
					$this->items[$idx] = $arr;
					$affected++;
					break;
				case 'draft':
					$arr['status'] = 2;
					$arr['statusVariant'] = 'warning';
					$arr['statusLabel'] = 'Draft';
					$this->items[$idx] = $arr;
					$affected++;
					break;
				case 'toggle_status':
					$curStatus = (int) ($arr['status'] ?? 1);
					$isCurrentlyDraft = ($curStatus & ReactRecord::STATUS_DRAFT) === ReactRecord::STATUS_DRAFT;
					$arr['status'] = $isCurrentlyDraft ? 1 : 2;
					$arr['statusVariant'] = $isCurrentlyDraft ? 'success' : 'warning';
					$arr['statusLabel'] = $isCurrentlyDraft ? 'Published' : 'Draft';
					$this->items[$idx] = $arr;
					$affected++;
					break;
				case 'trash':
					$arr['status'] = 8;
					$arr['statusVariant'] = 'danger';
					$arr['statusLabel'] = 'Trash';
					$this->items[$idx] = $arr;
					$affected++;
					break;
				case 'restore':
					$arr['status'] = 1;
					$arr['statusVariant'] = 'success';
					$arr['statusLabel'] = 'Published';
					$this->items[$idx] = $arr;
					$affected++;
					break;
				case 'delete':
					$deletedIndices[$idx] = true;
					$affected++;
					break;
				case 'duplicate':
					$copy = $arr;
					$copy['id'] = $itemId . '_copy';
					$copy['title'] = ((string) ($arr['title'] ?? $itemId)) . ' (Copy)';
					$clonedRows[] = $copy;
					$affected++;
					break;
				case 'update_field':
					$field = (string) ($payload['field'] ?? '');
					$val = $payload['value'] ?? '';
					if ($field !== '') {
						$arr[$field] = $val;
						$this->items[$idx] = $arr;
						$affected++;
					}
					break;
				case 'toggle_field':
					$field = (string) ($payload['field'] ?? '');
					if ($field !== '') {
						$curVal = $arr[$field] ?? false;
						$isTruthy = $curVal === true || $curVal === 1 || $curVal === '1' || $curVal === 'true';
						$arr[$field] = $isTruthy ? '0' : '1';
						$this->items[$idx] = $arr;
						$affected++;
					}
					break;
			}
		}

		if ($deletedIndices !== []) {
			$remainingItems = [];
			foreach ($this->items as $idx => $existingItem) {
				if (!isset($deletedIndices[$idx])) {
					$remainingItems[] = $existingItem;
				}
			}
			$this->items = $remainingItems;
		}
		foreach ($clonedRows as $clonedRow) {
			$this->items[] = $clonedRow;
		}

		if ($this->mutator !== null) {
			$rawRows = array_map(
				static fn (array|ReactRecord $r): array => $r instanceof ReactRecord ? $r->values : $r,
				$this->items
			);
			$this->items = ($this->mutator)($operation, $ids, $payload, $rawRows);
		}

		return $affected;
	}
}
