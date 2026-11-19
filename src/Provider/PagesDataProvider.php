<?php

declare(strict_types=1);

namespace Totoglu\React\Provider;

use Closure;
use ProcessWire\Page;
use ProcessWire\PageArray;
use ProcessWire\Pageimage;
use ProcessWire\Pageimages;
use ProcessWire\Selectors;
use ProcessWire\Wire;
use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Contract\ReactRecordActionsProvider;
use Totoglu\React\Contract\ReactReorderProvider;
use Totoglu\React\Data\ReactPageResult;
use Totoglu\React\Data\ReactRecord;
use Totoglu\React\Icon\IconManager;
use Totoglu\React\Icon\ReactIconValue;

/**
 * ProcessWire `Pages` / `PageArray` adapter implementing `ReactDataProviderInterface`.
 *
 * Allows any ProcessWire selector (`pages:template=basic-page`) or `PageArray` instance to be rendered inside
 * `MarkupReactTable`, `MarkupReactCards`, or custom `MarkupReactViewport` modules.
 */
final class PagesDataProvider extends Wire implements ReactDataProviderInterface, ReactRecordActionsProvider, ReactReorderProvider
{
	private string $baseSelector = 'id>1';

	private int $defaultLimit = 25;

	private ?PageArray $pageItems = null;

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

	private string $stageField;

	/**
	 * @var array<string, string>
	 */
	private array $stageOptions;

	private string $dateStartField;

	private string $dateEndField;

	private bool $locked;

	/**
	 * @var array<string, Closure>
	 */
	private array $formatters = [];

	/**
	 * @var array<string, int>
	 */
	private array $formatterArities = [];

	/**
	 * @var list<string>|array<string, bool>
	 */
	private array $htmlColumns = [];

	/**
	 * @var array<string, mixed>
	 */
	private array $options = [];

	/**
	 * @param array<string, mixed> $options
	 */
	public function __construct(
		string|PageArray $source = 'id>1',
		array $options = [],
	) {
		parent::__construct();
		if ($source instanceof PageArray) {
			$this->pageItems = $source;
			$ids = [];
			foreach ($source as $p) {
				if ($p instanceof Page && $p->id > 0) {
					$ids[] = (int) $p->id;
				}
			}
			$this->baseSelector = $ids !== [] ? ('id=' . implode('|', $ids)) : 'id=0';
		} else {
			[$cleanBase, $parsedLimit] = self::stripTopLevelPaginationClauses($source);
			$this->baseSelector = $cleanBase;
			if ($parsedLimit !== null) {
				$this->defaultLimit = $parsedLimit;
			}
		}
		$this->title = $this->_('Pages');
		$this->columns = [
			'title' => $this->_('Title'),
			'name' => $this->_('Name'),
			'modified' => $this->_('Modified'),
			'status' => $this->_('Status'),
		];
		$this->sortableColumns = ['title', 'name', 'created', 'modified', 'sort', 'status'];
		$this->stageField = '';
		$this->stageOptions = [];
		$this->dateStartField = '';
		$this->dateEndField = '';
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
		if (is_array($options['formatters'] ?? null)) {
			foreach ($options['formatters'] as $col => $fn) {
				if ($fn instanceof Closure) {
					$this->formatColumn((string) $col, $fn);
				}
			}
			unset($options['formatters']);
		}

		$this->options = array_merge($this->options, $options);

		if (array_key_exists('title', $options) && (string) $options['title'] !== '') {
			$this->title = (string) $options['title'];
		}
		if (is_array($options['columns'] ?? null) && $options['columns'] !== []) {
			$normalizedCols = [];
			$schemas = [];
			foreach ($options['columns'] as $k => $v) {
				if (is_int($k)) {
					$colKey = is_array($v) ? (string) ($v['key'] ?? $v['name'] ?? '') : (string) $v;
					if ($colKey !== '') {
						$label = is_array($v)
							? (string) ($v['label'] ?? ucfirst(str_replace('_', ' ', $colKey)))
							: ucfirst(str_replace('_', ' ', $colKey));
						$normalizedCols[$colKey] = $label;
						if (is_array($v)) {
							$schemas[$colKey] = array_replace($v, ['label' => $label]);
						}
					}
				} elseif (is_array($v)) {
					$colKey = (string) $k;
					$label = (string) ($v['label'] ?? ucfirst(str_replace('_', ' ', $colKey)));
					$normalizedCols[$colKey] = $label;
					$schemas[$colKey] = array_replace($v, ['label' => $label]);
				} else {
					$normalizedCols[(string) $k] = (string) $v;
				}
			}
			$this->columns = $normalizedCols;
			if ($schemas !== []) {
				$this->columnSchemas = array_replace($this->columnSchemas, $schemas);
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
		if (array_key_exists('stageField', $options)) {
			$this->stageField = (string) $options['stageField'];
			if ($this->stageField === 'status' && !array_key_exists('stageOptions', $options) && $this->stageOptions === []) {
				$this->stageOptions = [
					'published' => $this->_('Published'),
					'unpublished' => $this->_('Draft'),
					'hidden' => $this->_('Hidden'),
				];
			} elseif ($this->stageField === '' && !array_key_exists('stageOptions', $options)) {
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
		if (is_array($options['htmlColumns'] ?? null)) {
			$this->htmlColumns = $options['htmlColumns'];
		}

		return $this;
	}

	/**
	 * Register a column display formatter closure (`fn(Page $page): string` or `fn(Page $page, mixed $raw): string`)
	 * and cache its parameter arity so 1-argument formatters skip `$page->get($column)` lookups.
	 */
	public function formatColumn(string $column, Closure $formatter, bool $isHtml = false): self
	{
		$colKey = trim($column);
		if ($colKey !== '') {
			$this->formatters[$colKey] = $formatter;
			$this->formatterArities[$colKey] = (new \ReflectionFunction($formatter))->getNumberOfParameters();
			if ($isHtml && !in_array($colKey, $this->htmlColumns, true) && !array_key_exists($colKey, $this->htmlColumns)) {
				$this->htmlColumns[] = $colKey;
			}
		}

		return $this;
	}

	public function option(string $key, mixed $default = null): mixed
	{
		return $this->options[$key] ?? $default;
	}

	/**
	 * @return array<string, mixed>
	 */
	public function options(): array
	{
		return $this->options;
	}

	public function id(): string
	{
		return 'pages:' . $this->baseSelector;
	}

	public function title(): string
	{
		return $this->title;
	}

	public function columns(): array
	{
		return $this->columns;
	}

	/**
	 * @return array<string, array<string, mixed>>
	 */
	public function columnSchemas(): array
	{
		return $this->columnSchemas;
	}

	public function sortableColumns(): array
	{
		return $this->sortableColumns;
	}

	public function statusOptions(): array
	{
		return [
			'published' => $this->_('Published'),
			'unpublished' => $this->_('Draft'),
			'hidden' => $this->_('Hidden'),
			'trash' => $this->_('Trash'),
		];
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

	public function isSortable(): bool
	{
		if ($this->locked) {
			return false;
		}
		if (isset($this->options['sortable'])) {
			return (bool) $this->options['sortable'];
		}

		return str_contains($this->baseSelector, 'sort=sort');
	}

	public function createAction(): ?array
	{
		return null;
	}

	public function recordActions(ReactRecord $record): array
	{
		if ($this->locked) {
			return [];
		}

		$p = $record->raw instanceof Page ? $record->raw : null;
		$isSystemProtected = $p !== null ? $this->isProtectedSystemPage($p) : ((int) $record->id <= 1);
		$canEdit = $p !== null ? $p->editable() : true;
		$canTrash = !$isSystemProtected && ($p !== null ? $p->trashable() : ((int) $record->id > 1));
		$canDelete = !$isSystemProtected && ($p !== null ? $p->deleteable() : ((int) $record->id > 1));

		$actions = [];
		if (!$record->isTrash() && $record->editUrl !== '' && $canEdit) {
			$actions[] = [
				'key' => 'edit',
				'label' => $this->_('Edit'),
				'icon' => 'pencil',
				'href' => $record->editUrl,
			];
		}

		if (!$record->isTrash() && $record->viewUrl !== '') {
			$actions[] = [
				'key' => 'view',
				'label' => $this->_('View Page'),
				'icon' => 'external-link',
				'href' => $record->viewUrl,
			];
		}

		if (!$record->isTrash() && !$record->isLocked() && !$isSystemProtected && $canEdit && (int) $record->id > 1) {
			$actions[] = [
				'key' => ReactDataProviderInterface::OP_TOGGLE_STATUS,
				'label' => $record->isPublished() ? $this->_('Unpublish') : $this->_('Publish'),
				'icon' => $record->isPublished() ? 'eye-off' : 'check',
			];
		}

		if (!$record->isTrash() && !$record->isLocked() && $canTrash) {
			$actions[] = [
				'key' => ReactDataProviderInterface::OP_TRASH,
				'label' => $this->_('Move to Trash'),
				'icon' => 'trash-2',
				'tone' => 'danger',
				'variant' => 'danger',
				'confirm' => $this->_('Move this page to the trash?'),
			];
		}

		if ($record->isTrash() && $canDelete) {
			$actions[] = [
				'key' => ReactDataProviderInterface::OP_RESTORE,
				'label' => $this->_('Restore'),
				'icon' => 'rotate-ccw',
			];
			$actions[] = [
				'key' => ReactDataProviderInterface::OP_DELETE,
				'label' => $this->_('Delete Permanently'),
				'icon' => 'trash-2',
				'tone' => 'danger',
				'variant' => 'danger',
				'confirm' => $this->_('Permanently delete this page? This cannot be undone.'),
			];
		}

		return $actions;
	}

	/**
	 * Strip top-level `limit=` and `start=` clauses from a base selector while preserving bracketed sub-selectors.
	 *
	 * @return array{0: string, 1: ?int}
	 */
	public static function stripTopLevelPaginationClauses(string $selector): array
	{
		$trimmed = trim($selector);
		if ($trimmed === '') {
			return ['', null];
		}

		$clauses = [];
		$depth = 0;
		$inSingle = false;
		$inDouble = false;
		$buffer = '';
		$len = strlen($trimmed);

		for ($i = 0; $i < $len; $i++) {
			$ch = $trimmed[$i];
			$prev = $i > 0 ? $trimmed[$i - 1] : '';
			if ($ch === "'" && !$inDouble && $prev !== '\\') {
				$inSingle = !$inSingle;
			} elseif ($ch === '"' && !$inSingle && $prev !== '\\') {
				$inDouble = !$inDouble;
			} elseif (!$inSingle && !$inDouble) {
				if ($ch === '[' || $ch === '(') {
					$depth++;
				} elseif (($ch === ']' || $ch === ')') && $depth > 0) {
					$depth--;
				} elseif ($ch === ',' && $depth === 0) {
					$clauses[] = trim($buffer);
					$buffer = '';
					continue;
				}
			}
			$buffer .= $ch;
		}
		if (trim($buffer) !== '') {
			$clauses[] = trim($buffer);
		}

		$kept = [];
		$parsedLimit = null;
		foreach ($clauses as $clause) {
			if ($clause === '') {
				continue;
			}
			if (preg_match('/^limit\s*=\s*(-?\d+)$/i', $clause, $m) === 1) {
				$rawLimit = (int) $m[1];
				if ($rawLimit > 0) {
					$parsedLimit = max(1, min(250, $rawLimit));
				}
				continue;
			}
			if (preg_match('/^start\s*=\s*-?\d+$/i', $clause) === 1) {
				continue;
			}
			$kept[] = $clause;
		}

		return [implode(', ', $kept), $parsedLimit];
	}

	/**
	 * Build a sanitized ProcessWire selector string from query criteria while enforcing RBAC visibility rules.
	 *
	 * @param array<string, mixed> $criteria
	 */
	public function buildSelectorString(array $criteria = []): string
	{
		$sanitizer = $this->wire()->sanitizer;
		$search = trim((string) ($criteria['search'] ?? ''));
		$statusFilter = strtolower(trim((string) ($criteria['statusFilter'] ?? '')));
		/** @var array<string, string> $fieldFilters */
		$fieldFilters = is_array($criteria['fieldFilters'] ?? null) ? $criteria['fieldFilters'] : [];
		$dateFrom = trim((string) ($criteria['dateFrom'] ?? ''));
		$dateTo = trim((string) ($criteria['dateTo'] ?? ''));
		$sortBy = trim((string) ($criteria['sortBy'] ?? ''));
		$pageNum = max(1, (int) ($criteria['pageNum'] ?? 1));
		$fallbackLimit = isset($this->options['limit']) && (int) $this->options['limit'] > 0
			? (int) $this->options['limit']
			: $this->defaultLimit;
		$limit = max(1, min(250, (int) ($criteria['limit'] ?? $fallbackLimit)));

		$parts = [];
		if (trim($this->baseSelector) !== '') {
			$parts[] = trim($this->baseSelector);
		}

		$user = $this->wire()->user;
		$canViewUnpublished = $user->isSuperuser() || $user->hasPermission('page-edit');

		if ($statusFilter === 'trash' && $canViewUnpublished) {
			$parts[] = 'include=trash';
			$parts[] = 'status>=' . Page::statusTrash;
		} elseif (($statusFilter === 'unpublished' || $statusFilter === 'draft') && $canViewUnpublished) {
			$parts[] = 'include=unpublished';
			$parts[] = 'status&' . Page::statusUnpublished;
		} elseif ($statusFilter === 'hidden' && $canViewUnpublished) {
			$parts[] = 'include=hidden';
			$parts[] = 'status&' . Page::statusHidden;
		} else {
			if ($user->isSuperuser()) {
				$parts[] = 'include=all';
			} elseif ($canViewUnpublished) {
				$parts[] = 'include=unpublished';
			}
			$parts[] = 'status<' . Page::statusTrash;
		}

		if ($search !== '') {
			$safeSearch = $sanitizer->selectorValue($search);
			$parts[] = "title|name%={$safeSearch}";
		}

		foreach ($fieldFilters as $fKey => $fVal) {
			$fVal = trim((string) $fVal);
			if ($fVal === '' || !preg_match('/^[a-zA-Z0-9_]+$/', (string) $fKey)) {
				continue;
			}
			$parts[] = $fKey . '=' . $sanitizer->selectorValue($fVal);
		}

		$dateField = $this->dateStartField();
		if ($dateFrom !== '' && preg_match('/^[a-zA-Z0-9_]+$/', $dateField)) {
			$parts[] = $dateField . '>=' . $sanitizer->selectorValue($dateFrom);
		}
		if ($dateTo !== '' && preg_match('/^[a-zA-Z0-9_]+$/', $dateField)) {
			$parts[] = $dateField . '<=' . $sanitizer->selectorValue($dateTo);
		}

		if ($sortBy !== '') {
			$col = ltrim($sortBy, '-');
			if (in_array($col, $this->sortableColumns, true)) {
				$parts[] = 'sort=' . ($sortBy[0] === '-' ? '-' . $col : $col);
			}
		}

		$start = ($pageNum - 1) * $limit;
		$parts[] = "start={$start}";
		$parts[] = "limit={$limit}";

		return implode(', ', $parts);
	}

	public function query(array $criteria = []): ReactPageResult
	{
		$pages = $this->wire()->pages;
		$config = $this->wire()->config;

		$pageNum = max(1, (int) ($criteria['pageNum'] ?? 1));
		$limit = max(1, min(250, (int) ($criteria['limit'] ?? 25)));

		$selector = $this->buildSelectorString($criteria);
		$found = $pages->find($selector);
		$total = $found->getTotal();

		$adminUrl = rtrim((string) ($config->urls->admin ?: '/processwire'), '/');
		$user = $this->wire()->user;
		$isSuperuser = (bool) $user->isSuperuser();
		/** @var array<int, int> $depthByParentId */
		$depthByParentId = [0 => 0];
		$records = [];

		foreach ($found as $p) {
			if (!$p instanceof Page || !$p->id) {
				continue;
			}
			$isViewable = $p->viewable();
			if (!$isSuperuser && !$isViewable && !$p->editable()) {
				continue;
			}
			$bitStatus = ReactRecord::STATUS_PUBLISHED;
			$variant = 'success';
			$label = $this->_('Published');
			$stage = 'published';

			if ($p->isTrash()) {
				$bitStatus = ReactRecord::STATUS_TRASH;
				$variant = 'danger';
				$label = $this->_('Trash');
				$stage = 'trash';
			} elseif ($p->isUnpublished()) {
				$bitStatus = ReactRecord::STATUS_DRAFT;
				$variant = 'warning';
				$label = $this->_('Draft');
				$stage = 'unpublished';
			} elseif ($p->isHidden()) {
				$bitStatus = ReactRecord::STATUS_HIDDEN;
				$variant = 'warning';
				$label = $this->_('Hidden');
				$stage = 'hidden';
			}
			if ($p->isLocked()) {
				$bitStatus |= ReactRecord::STATUS_LOCKED;
			}

			if ($this->stageField !== '' && $this->stageField !== 'status') {
				$customStage = $p->get($this->stageField);
				if (is_scalar($customStage) && (string) $customStage !== '') {
					$stage = (string) $customStage;
				}
			}

			$values = [];
			$formatted = [];
			/** @var array<string, array<string, mixed>> $cells */
			$cells = [];
			foreach (array_keys($this->columns) as $colKey) {
				$formatter = $this->formatters[$colKey] ?? null;
				if ($formatter !== null) {
					$arity = $this->formatterArities[$colKey] ??= (new \ReflectionFunction($formatter))->getNumberOfParameters();
					if ($arity <= 1) {
						$formattedOut = $formatter($p);
						if (is_array($formattedOut)) {
							$cells[$colKey] = $formattedOut;
							$formatted[$colKey] = (string) ($formattedOut['label'] ?? $formattedOut['title'] ?? '');
						} else {
							$formatted[$colKey] = (string) $formattedOut;
						}
						continue;
					}
				}
				if (in_array($colKey, ['id', 'title', 'name', 'status', 'created', 'modified', 'sort'], true)) {
					if ($formatter !== null) {
						$rawBuiltin = match ($colKey) {
							'id' => (int) $p->id,
							'title' => (string) ($p->title ?: $p->name),
							'name' => (string) $p->name,
							'status' => $bitStatus,
							'created' => (int) $p->created,
							'modified' => (int) $p->modified,
							'sort' => (int) $p->sort,
						};
						$formattedOut = $formatter($p, $rawBuiltin);
						if (is_array($formattedOut)) {
							$cells[$colKey] = $formattedOut;
							$formatted[$colKey] = (string) ($formattedOut['label'] ?? $formattedOut['title'] ?? '');
						} else {
							$formatted[$colKey] = (string) $formattedOut;
						}
					}
					continue;
				}
				$val = $p->get($colKey);
				if ($formatter !== null) {
					$formattedOut = $formatter($p, $val);
					if (is_array($formattedOut)) {
						$cells[$colKey] = $formattedOut;
						$formatted[$colKey] = (string) ($formattedOut['label'] ?? $formattedOut['title'] ?? '');
					} else {
						$formatted[$colKey] = (string) $formattedOut;
					}
				} elseif ($val instanceof ReactIconValue) {
					if (!$val->isEmpty()) {
						$cells[$colKey] = [
							'icon' => $val->toArray(),
							'label' => (string) $val->name,
						];
					}
					$values[$colKey] = (string) $val->raw;
					continue;
				} else {
					$unformattedMedia = $p->getUnformatted($colKey);
					if ($unformattedMedia instanceof Pageimages || $unformattedMedia instanceof Pageimage) {
						$thumbMeta = self::extractPageThumb($unformattedMedia, (string) ($p->title ?: $p->name));
						if ($thumbMeta !== null) {
							$cells[$colKey] = ['thumb' => $thumbMeta];
							$values[$colKey] = $thumbMeta['alt'];
						} else {
							$values[$colKey] = '';
						}
						continue;
					}
				}
				$values[$colKey] = is_scalar($val) ? $val : (string) $val;
			}

			$recordIcon = '';
			$iconFieldOpt = trim((string) ($this->options['iconField'] ?? ''));
			if ($iconFieldOpt !== '') {
				$rawIconField = $p->get($iconFieldOpt);
				if ($rawIconField instanceof ReactIconValue) {
					if (!$rawIconField->isEmpty()) {
						$recordIcon = $rawIconField->toArray();
					}
				} elseif (is_scalar($rawIconField) && trim((string) $rawIconField) !== '') {
					$resolvedIconObj = IconManager::resolveValueObject($rawIconField);
					$recordIcon = !$resolvedIconObj->isEmpty() ? $resolvedIconObj->toArray() : trim((string) $rawIconField);
				}
			} elseif (!empty($this->options['showTemplateIcon'])) {
				$tplIcon = trim((string) $p->getIcon());
				if ($tplIcon !== '') {
					$recordIcon = $tplIcon;
				}
			}

			$recordThumb = null;
			$thumbFieldOpt = trim((string) ($this->options['thumbField'] ?? ''));
			if ($thumbFieldOpt !== '') {
				$recordThumb = self::extractPageThumb($p->getUnformatted($thumbFieldOpt), (string) ($p->title ?: $p->name));
			}

			$recordSubtitle = '';
			$subtitleFieldOpt = trim((string) ($this->options['subtitleField'] ?? ''));
			if ($subtitleFieldOpt !== '') {
				$subVal = $subtitleFieldOpt === 'path' || $subtitleFieldOpt === 'url'
					? $p->url
					: $p->get($subtitleFieldOpt);
				if (is_scalar($subVal)) {
					$recordSubtitle = trim((string) $subVal);
				}
			}

			$startDate = $this->normalizePageDate($p, $this->dateStartField, (int) $p->created);
			$endDate = $this->normalizePageDate($p, $this->dateEndField, (int) $p->modified);
			if ($endDate === '' || $endDate < $startDate) {
				$endDate = $startDate;
			}

			$parentId = (int) $p->parent_id;
			$parentCount = $depthByParentId[$parentId] ??= $p->parents()->count();

			$records[] = new ReactRecord(
				id: (string) $p->id,
				title: (string) ($p->title ?: $p->name),
				name: (string) $p->name,
				status: $bitStatus,
				statusVariant: $variant,
				statusLabel: $label,
				values: $values,
				formatted: $formatted,
				editUrl: "{$adminUrl}/page/edit/?id={$p->id}",
				viewUrl: $isViewable ? (string) $p->url : '',
				depth: max(0, $parentCount - 1),
				sort: (int) $p->sort,
				created: (int) $p->created,
				modified: (int) $p->modified,
				stage: $stage,
				startDate: $startDate,
				endDate: $endDate,
				hasDraft: false,
				raw: $p,
				subtitle: $recordSubtitle,
				htmlColumns: $this->htmlColumns,
				icon: $recordIcon,
				thumb: $recordThumb,
				cells: $cells,
			);
		}

		return new ReactPageResult(
			items: $records,
			total: $total,
			pageNum: $pageNum,
			limit: $limit,
			trashCount: 0,
		);
	}

	/**
	 * Extract a sanitized thumbnail descriptor from an unformatted or formatted ProcessWire image value.
	 *
	 * @return array{src: string, alt: string, count: int}|null
	 */
	private static function extractPageThumb(mixed $media, string $fallbackAlt): ?array
	{
		$first = null;
		$count = 0;
		if ($media instanceof Pageimages) {
			$count = $media->count();
			$candidate = $media->first();
			if ($candidate instanceof Pageimage) {
				$first = $candidate;
			}
		} elseif ($media instanceof Pageimage) {
			$first = $media;
			$count = 1;
		}
		if ($first === null) {
			return null;
		}

		$src = (string) $first->url;
		try {
			if ($first->filename !== '' && is_file($first->filename)) {
				$src = (string) $first->size(72, 72)->url;
			}
		} catch (\Throwable) {
			$src = (string) $first->url;
		}
		if ($src === '') {
			return null;
		}

		$alt = trim((string) $first->description) !== '' ? trim((string) $first->description) : ($fallbackAlt !== '' ? $fallbackAlt : (string) $first->basename);

		return [
			'src' => $src,
			'alt' => $alt,
			'count' => max(1, $count),
		];
	}

	public function mutate(string $operation, array $ids, array $payload = []): int
	{
		if ($this->locked || $ids === [] || (bool) $this->wire()->config->demo) {
			return 0;
		}
		$pages = $this->wire()->pages;

		$affected = 0;
		foreach ($ids as $idx => $rawId) {
			$pageId = (int) $rawId;
			if ($pageId <= 1) {
				continue;
			}
			$p = $pages->get($pageId);
			if (!$p instanceof Page || !$p->id || !$this->matchesBaseScope($p)) {
				continue;
			}
			if (
				$this->isProtectedSystemPage($p)
				&& in_array($operation, ['trash', 'delete', 'draft', 'toggle_status', 'unlock'], true)
			) {
				continue;
			}
			if ($p->isLocked() && $operation !== 'unlock') {
				continue;
			}
			if (!$p->editable()) {
				continue;
			}
			if ($operation === 'delete' && !$p->deleteable()) {
				continue;
			}
			if ($operation === 'trash' && !$p->trashable()) {
				continue;
			}

			$p->of(false);
			switch ($operation) {
				case 'publish':
					if (!$p->publishable()) {
						break;
					}
					$p->removeStatus(Page::statusUnpublished);
					$pages->save($p, ['quiet' => true]);
					$affected++;
					break;
				case 'draft':
					$p->addStatus(Page::statusUnpublished);
					$pages->save($p, ['quiet' => true]);
					$affected++;
					break;
				case 'toggle_status':
					if ($p->isUnpublished()) {
						if (!$p->publishable()) {
							break;
						}
						$p->removeStatus(Page::statusUnpublished);
					} else {
						$p->addStatus(Page::statusUnpublished);
					}
					$pages->save($p, ['quiet' => true]);
					$affected++;
					break;
				case 'lock':
					$p->addStatus(Page::statusLocked);
					$pages->save($p, ['quiet' => true]);
					$affected++;
					break;
				case 'unlock':
					$p->removeStatus(Page::statusLocked);
					$pages->save($p, ['quiet' => true]);
					$affected++;
					break;
				case 'trash':
					$pages->trash($p);
					$affected++;
					break;
				case 'restore':
					if ($p->isTrash()) {
						$pages->restore($p);
						$affected++;
					}
					break;
				case 'delete':
					if ($p->deleteable()) {
						$pages->delete($p, true);
						$affected++;
					}
					break;
				case 'reorder':
					$pages->sort($p, $idx);
					$affected++;
					break;
				case 'move_stage':
					$stage = (string) ($payload['stage'] ?? '');
					$groupField = trim((string) ($payload['groupField'] ?? ''));
					$groupVal = (string) ($payload['groupVal'] ?? '');
					if ($this->stageField === 'status') {
						if ($stage === 'published') {
							if (!$p->publishable()) {
								break;
							}
							$p->removeStatus(Page::statusUnpublished);
							$p->removeStatus(Page::statusHidden);
						} elseif ($stage === 'unpublished' || $stage === 'draft') {
							$p->addStatus(Page::statusUnpublished);
						} elseif ($stage === 'hidden') {
							$p->addStatus(Page::statusHidden);
						}
						$pages->save($p, ['quiet' => true]);
						$affected++;
					} elseif ($stage !== '' && $this->canWriteField($p, $this->stageField)) {
						$p->setAndSave($this->stageField, $stage);
						$affected++;
					}
					if ($groupField !== '' && $groupField !== $this->stageField && $this->canWriteField($p, $groupField)) {
						$p->setAndSave($groupField, ($groupVal === '_unassigned_' || $groupVal === '__unassigned__') ? '' : $groupVal);
					}
					break;
				case 'reschedule':
					$startDate = (string) ($payload['startDate'] ?? $payload['targetDate'] ?? '');
					$endDate = (string) ($payload['endDate'] ?? '');
					$laneField = trim((string) ($payload['laneField'] ?? ''));
					$laneVal = (string) ($payload['laneVal'] ?? '');
					$changed = false;
					if ($startDate !== '' && $this->canWriteField($p, $this->dateStartField)) {
						$p->setAndSave($this->dateStartField, $startDate);
						$changed = true;
					}
					if ($endDate !== '' && $this->dateEndField !== '' && $this->dateEndField !== $this->dateStartField && $this->canWriteField($p, $this->dateEndField)) {
						$p->setAndSave($this->dateEndField, $endDate);
						$changed = true;
					}
					if ($laneField !== '' && $laneVal !== '_all_' && $this->canWriteField($p, $laneField)) {
						$p->setAndSave($laneField, ($laneVal === '_unassigned_' || $laneVal === '__unassigned__') ? '' : $laneVal);
						$changed = true;
					}
					if ($changed) {
						$affected++;
					}
					break;
				case ReactDataProviderInterface::OP_RESIZE_SPAN:
					$targetStartDate = trim((string) ($payload['startDate'] ?? ''));
					$targetEndDate = trim((string) ($payload['endDate'] ?? $payload['targetEndDate'] ?? ''));
					$changed = false;
					if ($targetStartDate !== '' && $this->dateStartField !== '' && $this->canWriteField($p, $this->dateStartField)) {
						$p->setAndSave($this->dateStartField, $targetStartDate);
						$changed = true;
					}
					$curStart = $targetStartDate !== '' ? $targetStartDate : $this->normalizePageDate($p, $this->dateStartField, 0);
					if ($targetEndDate !== '' && $this->dateEndField !== '' && $this->canWriteField($p, $this->dateEndField) && ($curStart === '' || strcmp($targetEndDate, $curStart) >= 0)) {
						$p->setAndSave($this->dateEndField, $targetEndDate);
						$changed = true;
					}
					if ($changed) {
						$affected++;
					}
					break;
				case 'update_field':
					$field = (string) ($payload['field'] ?? '');
					if ($field !== '' && $this->canWriteField($p, $field, true)) {
						$p->setAndSave($field, $payload['value'] ?? '');
						$affected++;
					}
					break;
				case 'toggle_field':
					$field = (string) ($payload['field'] ?? '');
					if ($field !== '' && $this->canWriteField($p, $field)) {
						$curVal = $p->getUnformatted($field);
						$isTruthy = $curVal === true || $curVal === 1 || $curVal === '1' || $curVal === 'true';
						$p->setAndSave($field, $isTruthy ? 0 : 1);
						$affected++;
					}
					break;
				case 'shift_dates':
					$days = (int) ($payload['days'] ?? $payload['shiftDays'] ?? 0);
					if ($days !== 0 && $this->dateStartField !== '') {
						$sign = $days > 0 ? "+{$days} days" : "{$days} days";
						$changed = false;
						foreach (array_unique(array_filter([$this->dateStartField, $this->dateEndField])) as $dField) {
							if ($this->canWriteField($p, $dField)) {
								$curDate = $this->normalizePageDate($p, $dField, 0);
								if ($curDate !== '') {
									$ts = strtotime($curDate . ' ' . $sign);
									if ($ts !== false) {
										$p->setAndSave($dField, date('Y-m-d', $ts));
										$changed = true;
									}
								}
							}
						}
						if ($changed) {
							$affected++;
						}
					}
					break;
			}
		}

		return $affected;
	}

	/**
	 * Verify that `$page` belongs to this provider's configured `PageArray` or `baseSelector` scope.
	 */
	private function matchesBaseScope(Page $page): bool
	{
		if ($this->pageItems !== null) {
			return $this->pageItems->has($page);
		}

		$adminRootId = (int) ($this->wire()->config->adminRootPageID ?: 2);
		$targetsAdmin = str_contains($this->baseSelector, 'template=admin')
			|| str_contains($this->baseSelector, "has_parent={$adminRootId}")
			|| str_contains($this->baseSelector, "parent={$adminRootId}");

		if (!$targetsAdmin && ((int) $page->id === $adminRootId || (int) $page->rootParent?->id === $adminRootId)) {
			return false;
		}

		$rawSelector = trim($this->baseSelector);
		if ($rawSelector === '' || $rawSelector === 'id>1') {
			return (int) $page->id > 1;
		}

		try {
			$selectors = new Selectors($rawSelector);
			$checkClauses = [];
			foreach ($selectors as $sel) {
				$field = is_array($sel->field) ? implode('|', $sel->field) : (string) $sel->field;
				$lower = strtolower(trim($field));
				if (in_array($lower, ['limit', 'start', 'sort', 'include'], true)) {
					continue;
				}
				if ($page->isTrash() && in_array($lower, ['parent', 'parent_id', 'has_parent', 'status'], true)) {
					continue;
				}
				$checkClauses[] = (string) $sel;
			}

			return $checkClauses === [] || $page->matches(implode(', ', $checkClauses));
		} catch (\Throwable) {
			return false;
		}
	}

	/**
	 * Determine whether `$page` is a ProcessWire core/system page protected from destructive or status-disabling mutations.
	 */
	private function isProtectedSystemPage(Page $page): bool
	{
		$id = (int) $page->id;
		if ($id <= 1) {
			return true;
		}
		if ($page->hasStatus(Page::statusSystem) || $page->hasStatus(Page::statusSystemID)) {
			return true;
		}
		$config = $this->wire()->config;
		$systemIds = [
			(int) ($config->adminRootPageID ?: 2),
			(int) ($config->trashPageID ?: 7),
			(int) ($config->http404PageID ?: 27),
			(int) ($config->guestUserPageID ?: 40),
			(int) ($config->superUserPageID ?: 41),
			(int) ($config->usersPageID ?: 29),
			(int) ($config->rolesPageID ?: 30),
			(int) ($config->permissionsPageID ?: 31),
		];
		if (in_array($id, $systemIds, true)) {
			return true;
		}

		return false;
	}

	/**
	 * Enforce field-level ProcessWire editability and block writes to protected system/credential attributes.
	 */
	private function canWriteField(Page $page, string $field, bool $allowTitleAndName = false): bool
	{
		$clean = trim($field);
		if ($clean === '' || preg_match('/^[a-zA-Z0-9_]+$/', $clean) !== 1) {
			return false;
		}

		$blocked = ['id', 'pass', 'roles', 'permissions', 'template', 'templates_id', 'parent', 'parent_id', 'status', 'created', 'modified', 'created_users_id', 'modified_users_id'];
		if (in_array(strtolower($clean), $blocked, true)) {
			return false;
		}

		if ($allowTitleAndName && $clean === 'name') {
			return $page->editable('name');
		}

		return $page->hasField($clean) && $page->editable($clean);
	}

	private function normalizePageDate(Page $page, string $field, int $fallbackTimestamp): string
	{
		if ($field === 'created') {
			return (int) $page->created > 0 ? date('Y-m-d', (int) $page->created) : '';
		}
		if ($field === 'modified') {
			return (int) $page->modified > 0 ? date('Y-m-d', (int) $page->modified) : '';
		}
		if ($field !== '') {
			$raw = $page->getUnformatted($field);
			if (is_int($raw) || (is_string($raw) && ctype_digit($raw))) {
				$ts = (int) $raw;
				if ($ts > 0) {
					return date('Y-m-d', $ts);
				}
			} elseif (is_string($raw) && trim($raw) !== '') {
				$ts = strtotime(trim($raw));
				if ($ts !== false) {
					return date('Y-m-d', $ts);
				}
			}
		}

		return $fallbackTimestamp > 0 ? date('Y-m-d', $fallbackTimestamp) : '';
	}
}
