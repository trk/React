<?php

declare(strict_types=1);

namespace Totoglu\React\Provider;

use Closure;
use ProcessWire\Wire;
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
	ReactCalendarProvider,
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

	private string $stageField;

	/**
	 * @var array<string, string>
	 */
	private array $stageOptions;

	private string $dateStartField;

	private string $dateEndField;

	private bool $locked;

	private string $laneField = '';

	/**
	 * @var array<string, string>
	 */
	private array $laneOptions = [];

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
	 * @var array<string, array{label: string, icon?: string, layout?: 'table'|'cards'|'kanban'|'calendar', columns?: list<string>, sort?: string, groupBy?: string, search?: string, statusFilter?: string, fieldFilters?: array<string, string>}>
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

	private string $stageSummaryField = '';

	/**
	 * @var Closure(list<ReactRecord>): array<string, bool>|null
	 */
	private ?Closure $conflictsResolver = null;

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
		$this->stageField = 'stage';
		$this->stageOptions = [
			'todo' => $this->_('To Do'),
			'in_progress' => $this->_('In Progress'),
			'done' => $this->_('Done'),
		];
		$this->dateStartField = 'start_date';
		$this->dateEndField = 'end_date';
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
		if (isset($options['conflicts']) && $options['conflicts'] instanceof Closure) {
			$this->conflictsResolver = $options['conflicts'];
			unset($options['conflicts']);
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
			$normalizedCols = [];
			$schemas = [];
			foreach ($options['columns'] as $k => $v) {
				if (is_int($k)) {
					$colKey = is_array($v) ? (string) ($v['key'] ?? '') : (string) $v;
					if ($colKey !== '') {
						$label = is_array($v)
							? (string) ($v['label'] ?? ucfirst(str_replace('_', ' ', $colKey)))
							: ucfirst(str_replace('_', ' ', $colKey));
						$normalizedCols[$colKey] = $label;
						if (is_array($v)) {
							$schemas[$colKey] = array_replace($v, ['label' => $label]);
						}
					}
				} else {
					$colKey = (string) $k;
					$label = is_array($v)
						? (string) ($v['label'] ?? ucfirst(str_replace('_', ' ', $colKey)))
						: (string) $v;
					$normalizedCols[$colKey] = $label;
					if (is_array($v)) {
						$schemas[$colKey] = array_replace($v, ['label' => $label]);
					}
				}
			}
			$this->columns = $normalizedCols;
			if ($schemas !== []) {
				$this->columnSchemas = array_replace($this->columnSchemas, $schemas);
			}
			if (!array_key_exists('sortableColumns', $options)) {
				$this->sortableColumns = array_keys($this->columns);
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
		if (array_key_exists('stageField', $options)) {
			$this->stageField = (string) $options['stageField'];
			if ($this->stageField === '' && !array_key_exists('stageOptions', $options)) {
				$this->stageOptions = [];
			}
		}
		if (is_array($options['stageOptions'] ?? null)) {
			$this->stageOptions = $options['stageOptions'];
		}
		if (array_key_exists('dateStartField', $options)) {
			$this->dateStartField = (string) $options['dateStartField'];
		}
		if (array_key_exists('dateEndField', $options)) {
			$this->dateEndField = (string) $options['dateEndField'];
		}
		if (array_key_exists('locked', $options)) {
			$this->locked = (bool) $options['locked'];
		}
		if (array_key_exists('laneField', $options)) {
			$this->laneField = (string) $options['laneField'];
		}
		if (is_array($options['laneOptions'] ?? null)) {
			$this->laneOptions = $options['laneOptions'];
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
		if (array_key_exists('stageSummaryField', $options)) {
			$this->stageSummaryField = (string) $options['stageSummaryField'];
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

	public function stageField(): string
	{
		return $this->stageField;
	}

	public function stageOptions(string $field = ''): array
	{
		return $this->stageOptions;
	}

	public function dateStartField(): string
	{
		return $this->dateStartField;
	}

	public function dateEndField(): string
	{
		return $this->dateEndField;
	}

	public function isLocked(): bool
	{
		return $this->locked;
	}

	public function bulkEditableFields(): array
	{
		return $this->bulkFields;
	}

	public function supportsDateShift(): bool
	{
		return $this->dateStartField !== '';
	}

	public function queryWindow(array $criteria, string $startIso, string $endIso): array
	{
		return $this->query(array_merge($criteria, [
			'dateFrom' => $startIso,
			'dateTo' => $endIso,
			'pageNum' => 1,
			'limit' => 10000,
		]))->items;
	}

	public function laneField(): string
	{
		return $this->laneField;
	}

	public function laneOptions(): array
	{
		return $this->laneOptions;
	}

	/**
	 * @param list<ReactRecord> $records
	 * @return array<string, bool>
	 */
	public function conflicts(array $records): array
	{
		if ($this->conflictsResolver instanceof Closure) {
			/** @var array<string, bool> $res */
			$res = ($this->conflictsResolver)($records);

			return $res;
		}

		$conflicts = [];
		$explicit = $this->options['conflicts'] ?? null;
		if (is_array($explicit)) {
			foreach ($explicit as $k => $v) {
				if (is_int($k) && is_scalar($v)) {
					$conflicts[(string) $v] = true;
				} elseif ((bool) $v) {
					$conflicts[(string) $k] = true;
				}
			}
		}

		$noOverlap = $this->options['noOverlap'] ?? $this->options['conflictScope'] ?? null;
		if ($noOverlap === null && ($this->options['detectLaneConflicts'] ?? false) && $this->laneField !== '') {
			$noOverlap = [$this->laneField];
		}

		if ($noOverlap !== null && $noOverlap !== false) {
			/** @var list<string> $scopeFields */
			$scopeFields = [];
			if (is_string($noOverlap) && $noOverlap !== '') {
				$scopeFields = [$noOverlap];
			} elseif (is_array($noOverlap)) {
				$scopeFields = array_values(array_filter(array_map('strval', $noOverlap)));
			}

			$count = count($records);
			for ($i = 0; $i < $count; $i++) {
				$a = $records[$i];
				$startA = substr($a->startDate, 0, 10);
				$endA = substr($a->endDate !== '' ? $a->endDate : $a->startDate, 0, 10);
				if ($startA === '') {
					continue;
				}
				if ($endA === '' || strcmp($endA, $startA) < 0) {
					$endA = $startA;
				}

				$scopeA = [];
				$skipA = false;
				foreach ($scopeFields as $sf) {
					$sv = trim((string) $a->getValue($sf, ''));
					if ($sv === '') {
						$skipA = true;
						break;
					}
					$scopeA[$sf] = $sv;
				}
				if ($skipA) {
					continue;
				}

				for ($j = $i + 1; $j < $count; $j++) {
					$b = $records[$j];
					$startB = substr($b->startDate, 0, 10);
					$endB = substr($b->endDate !== '' ? $b->endDate : $b->startDate, 0, 10);
					if ($startB === '') {
						continue;
					}
					if ($endB === '' || strcmp($endB, $startB) < 0) {
						$endB = $startB;
					}

					$sameScope = true;
					foreach ($scopeFields as $sf) {
						if (trim((string) $b->getValue($sf, '')) !== $scopeA[$sf]) {
							$sameScope = false;
							break;
						}
					}
					if (!$sameScope) {
						continue;
					}

					if (strcmp($startA, $endB) <= 0 && strcmp($endA, $startB) >= 0) {
						$conflicts[$a->id] = true;
						$conflicts[$b->id] = true;
					}
				}
			}
		}

		return $conflicts;
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

	public function stageSummaryField(): ?string
	{
		if ($this->stageSummaryField !== '') {
			return $this->stageSummaryField;
		}
		if ($this->summaries !== []) {
			return (string) array_key_first($this->summaries);
		}

		return null;
	}

	public function computeStageSummaries(array $criteria = []): array
	{
		$field = $this->stageSummaryField();
		if ($field === null || $field === '' || $this->stageField === '') {
			return [];
		}

		$aggDef = $this->summaries[$field] ?? 'sum';
		$type = is_array($aggDef)
			? strtolower(trim((string) ($aggDef['op'] ?? $aggDef['type'] ?? 'sum')))
			: strtolower(trim((string) $aggDef));
		if (!in_array($type, ['sum', 'avg', 'min', 'max', 'count'], true)) {
			$type = 'sum';
		}
		$prefix = is_array($aggDef) ? (string) ($aggDef['prefix'] ?? '') : '';
		$suffix = is_array($aggDef) ? (string) ($aggDef['suffix'] ?? '') : '';
		$label = is_array($aggDef) && isset($aggDef['label']) && (string) $aggDef['label'] !== ''
			? (string) $aggDef['label']
			: ($this->columns[$field] ?? ucfirst(str_replace('_', ' ', $field)));

		$result = $this->query(array_merge($criteria, [
			'pageNum' => 1,
			'limit' => 100000,
		]));

		/** @var array<string, list<float>> $byStageNums */
		$byStageNums = [];
		/** @var array<string, int> $byStageCounts */
		$byStageCounts = [];
		foreach (array_keys($this->stageOptions) as $stageKey) {
			$byStageNums[(string) $stageKey] = [];
			$byStageCounts[(string) $stageKey] = 0;
		}

		foreach ($result->items as $rec) {
			$stageKey = $rec->stage !== '' ? $rec->stage : (string) $rec->getValue($this->stageField, '');
			if ($stageKey === '') {
				continue;
			}
			if (!isset($byStageNums[$stageKey])) {
				$byStageNums[$stageKey] = [];
				$byStageCounts[$stageKey] = 0;
			}
			$byStageCounts[$stageKey]++;
			$rawVal = $rec->getValue($field);
			if (is_int($rawVal) || is_float($rawVal) || (is_string($rawVal) && is_numeric($rawVal))) {
				$byStageNums[$stageKey][] = (float) $rawVal;
			}
		}

		$out = [];
		foreach ($byStageCounts as $stageKey => $cnt) {
			$nums = $byStageNums[$stageKey] ?? [];
			if ($type === 'count') {
				$out[$stageKey] = [
					'field' => $field,
					'type' => 'count',
					'label' => $label,
					'formatted' => $prefix . (string) $cnt . $suffix,
					'raw' => $cnt,
					'count' => $cnt,
				];
				continue;
			}
			if ($nums === []) {
				$out[$stageKey] = [
					'field' => $field,
					'type' => $type,
					'label' => $label,
					'formatted' => $prefix . '0' . $suffix,
					'raw' => 0,
					'count' => $cnt,
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

			$out[$stageKey] = [
				'field' => $field,
				'type' => $type,
				'label' => $label,
				'formatted' => $prefix . $formattedNum . $suffix,
				'raw' => $rounded,
				'count' => $cnt,
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
		if (isset($context['stage']) && (string) $context['stage'] !== '') {
			$stageVal = (string) $context['stage'];
			$row['stage'] = $stageVal;
			if ($this->stageField !== '') {
				$row[$this->stageField] = $stageVal;
			}
		}
		if (isset($context['date']) && (string) $context['date'] !== '') {
			$dateVal = (string) $context['date'];
			$row['start_date'] = $dateVal;
			$row['end_date'] = $dateVal;
			if ($this->dateStartField !== '') {
				$row[$this->dateStartField] = $dateVal;
			}
			if ($this->dateEndField !== '') {
				$row[$this->dateEndField] = $dateVal;
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
			$stage = $this->stageField !== ''
				? (string) ($row[$this->stageField] ?? $row['stage'] ?? array_key_first($this->stageOptions) ?? '')
				: '';
			$startDate = $this->dateStartField !== ''
				? (string) ($row[$this->dateStartField] ?? $row['start_date'] ?? $row['date'] ?? '')
				: '';
			$endDate = $this->dateEndField !== ''
				? (string) ($row[$this->dateEndField] ?? $row['end_date'] ?? $startDate)
				: $startDate;
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
				stage: $stage,
				startDate: $startDate,
				endDate: $endDate,
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

		$allRecords = $this->normalizeRecords($editUrl);
		$trashCount = 0;
		foreach ($allRecords as $rec) {
			if ($rec->isTrash()) {
				$trashCount++;
			}
		}

		$filtered = array_filter($allRecords, static function (ReactRecord $rec) use ($search, $statusFilter, $fieldFilters, $dateFrom, $dateTo): bool {
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

			$recStart = $rec->startDate;
			$recEnd = $rec->endDate !== '' ? $rec->endDate : $recStart;
			if ($dateFrom !== '' && ($recEnd === '' || strcmp($recEnd, $dateFrom) < 0)) {
				return false;
			}
			if ($dateTo !== '' && ($recStart === '' || strcmp($recStart, $dateTo) > 0)) {
				return false;
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
				case 'move_stage':
					$targetStage = (string) ($payload['stage'] ?? '');
					$groupField = trim((string) ($payload['groupField'] ?? ''));
					$groupVal = (string) ($payload['groupVal'] ?? '');
					if ($targetStage !== '') {
						$arr[$this->stageField] = $targetStage;
						$arr['stage'] = $targetStage;
						if ($groupField !== '' && $groupField !== $this->stageField) {
							$arr[$groupField] = ($groupVal === '_unassigned_' || $groupVal === '__unassigned__') ? '' : $groupVal;
						}
						$this->items[$idx] = $arr;
						$affected++;
					}
					break;
				case 'reschedule':
					$startKey = $this->dateStartField !== '' ? $this->dateStartField : 'start_date';
					$endKey = $this->dateEndField !== '' ? $this->dateEndField : 'end_date';
					$curStart = substr((string) ($arr[$startKey] ?? $arr['start_date'] ?? $arr['date'] ?? ''), 0, 10);
					$curEnd = substr((string) ($arr[$endKey] ?? $arr['end_date'] ?? $curStart), 0, 10);
					$targetDate = substr(trim((string) ($payload['targetDate'] ?? $payload['startDate'] ?? '')), 0, 10);
					$fromDate = substr(trim((string) ($payload['fromDate'] ?? '')), 0, 10);
					$explicitEnd = substr(trim((string) ($payload['endDate'] ?? '')), 0, 10);
					$laneField = trim((string) ($payload['laneField'] ?? ''));
					$laneVal = (string) ($payload['laneVal'] ?? '');

					if ($targetDate !== '') {
						$newStart = $targetDate;
						$newEnd = $explicitEnd !== '' ? $explicitEnd : $targetDate;
						$anchorDate = $fromDate !== '' ? $fromDate : $curStart;
						if (($explicitEnd === '' || $explicitEnd === $targetDate) && $curStart !== '' && $curEnd !== '' && $anchorDate !== '') {
							$anchorTs = strtotime($anchorDate);
							$targetTs = strtotime($targetDate);
							$startTs = strtotime($curStart);
							$endTs = strtotime($curEnd);
							if ($anchorTs !== false && $targetTs !== false && $startTs !== false && $endTs !== false) {
								$deltaDays = (int) round(($targetTs - $anchorTs) / 86400);
								$sign = $deltaDays >= 0 ? "+{$deltaDays} days" : "{$deltaDays} days";
								$shiftedStartTs = strtotime($curStart . ' ' . $sign);
								$shiftedEndTs = strtotime($curEnd . ' ' . $sign);
								if ($shiftedStartTs !== false && $shiftedEndTs !== false) {
									$newStart = date('Y-m-d', $shiftedStartTs);
									$newEnd = date('Y-m-d', $shiftedEndTs);
								}
							}
						}
						if (strcmp($newEnd, $newStart) < 0) {
							$newEnd = $newStart;
						}
						$arr[$startKey] = $newStart;
						$arr['start_date'] = $newStart;
						$arr[$endKey] = $newEnd;
						$arr['end_date'] = $newEnd;
						if ($laneField !== '' && $laneVal !== '_all_') {
							$arr[$laneField] = ($laneVal === '_unassigned_' || $laneVal === '__unassigned__') ? '' : $laneVal;
						}
						$this->items[$idx] = $arr;
						$affected++;
					}
					break;
				case ReactDataProviderInterface::OP_RESIZE_SPAN:
					$startKey = $this->dateStartField !== '' ? $this->dateStartField : 'start_date';
					$endKey = $this->dateEndField !== '' ? $this->dateEndField : 'end_date';
					$targetStartDate = substr(trim((string) ($payload['startDate'] ?? '')), 0, 10);
					$curStart = $targetStartDate !== ''
						? $targetStartDate
						: substr((string) ($arr[$startKey] ?? $arr['start_date'] ?? $arr['date'] ?? ''), 0, 10);
					$targetEndDate = substr(trim((string) ($payload['endDate'] ?? $payload['targetEndDate'] ?? '')), 0, 10);
					if ($targetEndDate !== '' && ($curStart === '' || strcmp($targetEndDate, $curStart) >= 0)) {
						if ($targetStartDate !== '') {
							$arr[$startKey] = $targetStartDate;
							$arr['start_date'] = $targetStartDate;
						}
						$arr[$endKey] = $targetEndDate;
						$arr['end_date'] = $targetEndDate;
						$this->items[$idx] = $arr;
						$affected++;
					}
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
				case 'shift_dates':
					$days = (int) ($payload['days'] ?? $payload['shiftDays'] ?? 0);
					if ($days !== 0) {
						$sign = $days > 0 ? "+{$days} days" : "{$days} days";
						$startKey = $this->dateStartField !== '' ? $this->dateStartField : 'start_date';
						$endKey = $this->dateEndField !== '' ? $this->dateEndField : 'end_date';
						$curStart = (string) ($arr[$startKey] ?? $arr['start_date'] ?? $arr['date'] ?? '');
						$curEnd = (string) ($arr[$endKey] ?? $arr['end_date'] ?? $curStart);
						if ($curStart !== '') {
							$tsStart = strtotime($curStart . ' ' . $sign);
							if ($tsStart !== false) {
								$newStart = date('Y-m-d', $tsStart);
								$arr[$startKey] = $newStart;
								$arr['start_date'] = $newStart;
							}
						}
						if ($curEnd !== '') {
							$tsEnd = strtotime($curEnd . ' ' . $sign);
							if ($tsEnd !== false) {
								$newEnd = date('Y-m-d', $tsEnd);
								$arr[$endKey] = $newEnd;
								$arr['end_date'] = $newEnd;
							}
						}
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
