<?php

declare(strict_types=1);

namespace Totoglu\React\Provider;

use Closure;
use ProcessWire\Field;
use ProcessWire\FieldtypeCheckbox;
use ProcessWire\FieldtypeDatetime;
use ProcessWire\FieldtypeLanguageInterface;
use ProcessWire\Inputfield;
use ProcessWire\InputfieldForm;
use ProcessWire\InputfieldHidden;
use ProcessWire\InputfieldSubmit;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Language;
use ProcessWire\Languages;
use ProcessWire\NoticeError;
use ProcessWire\Page;
use ProcessWire\PageArray;
use ProcessWire\Pageimage;
use ProcessWire\Pageimages;
use ProcessWire\React;
use ProcessWire\Selectors;
use ProcessWire\Template;
use ProcessWire\Wire;
use ProcessWire\WireInputData;
use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Contract\ReactQuickEditProvider;
use Totoglu\React\Contract\ReactRecordActionsProvider;
use Totoglu\React\Contract\ReactReorderProvider;
use Totoglu\React\Data\ReactColumn;
use Totoglu\React\Data\ReactPageResult;
use Totoglu\React\Data\ReactRecord;
use Totoglu\React\Icon\IconManager;
use Totoglu\React\Icon\ReactIconValue;
use Totoglu\React\Security\UrlSanitizer;

/**
 * ProcessWire `Pages` / `PageArray` adapter implementing `ReactDataProviderInterface`.
 *
 * Allows any ProcessWire selector (`pages:template=basic-page`) or `PageArray` instance to be rendered inside
 * `MarkupReactTable`, `MarkupReactCards`, or custom `MarkupReactViewport` modules.
 */
final class PagesDataProvider extends Wire implements ReactDataProviderInterface, ReactQuickEditProvider, ReactRecordActionsProvider, ReactReorderProvider
{
	/**
	 * Reserved ProcessWire selector directives and sensitive system properties blocked from client `fieldFilters`.
	 *
	 * @var array<string, true>
	 */
	private const array RESERVED_FILTER_KEYS = [
		'include' => true,
		'check_access' => true,
		'status' => true,
		'limit' => true,
		'start' => true,
		'sort' => true,
		'get_total' => true,
		'find_all' => true,
		'id' => true,
		'parent' => true,
		'parent_id' => true,
		'has_parent' => true,
		'template' => true,
		'templates_id' => true,
		'pass' => true,
		'roles' => true,
		'permissions' => true,
		'email' => true,
		'children' => true,
		'num_children' => true,
		'fieldgroup' => true,
		'created_users_id' => true,
		'modified_users_id' => true,
	];

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

	private bool $locked;

	/**
	 * @var array<string, Closure>
	 */
	private array $formatters = [];

	/**
	 * @var array<string, int>
	 */
	private array $formatterArities = [];

	private ?Closure $editUrlBuilder = null;

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

		if (($options['editUrlBuilder'] ?? null) instanceof Closure) {
			$this->editUrlBuilder = $options['editUrlBuilder'];
			unset($options['editUrlBuilder']);
		}

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
		if ($this->locked) {
			return null;
		}

		$rawAction = $this->options['createAction'] ?? null;
		if (is_array($rawAction) && isset($rawAction['url'])) {
			$safeUrl = UrlSanitizer::sanitizeHref((string) $rawAction['url'], true);
			if ($safeUrl === '') {
				return null;
			}
			$rawLabel = is_string($rawAction['label'] ?? null) ? trim($rawAction['label']) : '';
			$action = [
				'url' => $safeUrl,
				'label' => $rawLabel !== '' ? $rawLabel : $this->_('Add New'),
			];
			if (array_key_exists('modal', $rawAction)) {
				$action['modal'] = (bool) $rawAction['modal'];
			}

			return $action;
		}

		$rawParentId = $this->options['createParentId'] ?? null;
		$parentId = is_int($rawParentId) || (is_string($rawParentId) && ctype_digit(trim($rawParentId)))
			? (int) $rawParentId
			: 0;
		if ($parentId > 0) {
			$parent = $this->wire()->pages->get($parentId);
			if ($parent instanceof Page && $parent->id > 0 && $parent->addable()) {
				$adminUrl = rtrim((string) ($this->wire()->config->urls->admin ?: '/processwire'), '/');
				$addUrl = "{$adminUrl}/page/add/?parent_id={$parent->id}";

				$tplOpt = $this->options['createTemplate'] ?? null;
				$tpl = null;
				if ($tplOpt instanceof Template) {
					$tpl = $tplOpt;
				} elseif (is_int($tplOpt) || (is_string($tplOpt) && trim($tplOpt) !== '')) {
					$candidate = $this->wire()->templates->get($tplOpt);
					if ($candidate instanceof Template) {
						$tpl = $candidate;
					}
				}
				if ($tpl instanceof Template && $tpl->id > 0) {
					$addUrl .= '&template_id=' . $tpl->id;
				}

				$rawLabel = is_string($this->options['createLabel'] ?? null) ? trim($this->options['createLabel']) : '';
				$action = [
					'url' => $addUrl,
					'label' => $rawLabel !== '' ? $rawLabel : $this->_('Add New'),
				];
				if (array_key_exists('createModal', $this->options)) {
					$action['modal'] = (bool) $this->options['createModal'];
				}

				return $action;
			}
		}

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
	 * Check whether `$fieldName` is viewable on `$page` for the active user, enforcing `$field->useRoles` RBAC.
	 */
	private function isFieldViewableOnPage(Page $page, string $fieldName, bool $isSuperuser): bool
	{
		if ($isSuperuser) {
			return true;
		}
		$cleanName = trim($fieldName);
		if ($cleanName === '') {
			return false;
		}
		$field = $this->wire()->fields->get($cleanName);
		if (!$field instanceof Field) {
			return true;
		}
		$template = $page->template;
		$contextField = $template instanceof Template && $template->fieldgroup !== null
			? $template->fieldgroup->getFieldContext($field)
			: null;
		$effectiveField = $contextField instanceof Field ? $contextField : $field;
		if (!(bool) $effectiveField->useRoles) {
			return true;
		}

		return (bool) $page->viewable($field, false);
	}

	/**
	 * Resolve allowlisted non-reserved queryable field keys permitted inside `criteria['fieldFilters']`.
	 *
	 * @return array<string, true>
	 */
	private function resolveAllowedFilterKeys(): array
	{
		$candidates = [];
		$rawFilterable = $this->options['filterableFields'] ?? null;
		if (is_array($rawFilterable) && $rawFilterable !== []) {
			foreach ($rawFilterable as $k => $v) {
				if (is_int($k)) {
					$key = is_array($v) ? (string) ($v['key'] ?? $v['name'] ?? '') : (string) $v;
				} else {
					$key = (string) $k;
				}
				if ($key !== '') {
					$candidates[] = $key;
				}
			}
		} else {
			foreach (array_keys($this->columns) as $colKey) {
				$candidates[] = (string) $colKey;
			}
		}

		$fields = $this->wire()->fields;
		$user = $this->wire()->user;
		$isSuperuser = (bool) $user->isSuperuser();
		/** @var array<string, true> $allowed */
		$allowed = [];
		foreach ($candidates as $candidate) {
			$key = trim($candidate);
			if ($key === '' || preg_match('/^[a-zA-Z0-9_]+$/', $key) !== 1) {
				continue;
			}
			$lower = strtolower($key);
			if (isset(self::RESERVED_FILTER_KEYS[$lower])) {
				continue;
			}
			$fieldObj = $fields->get($key);
			if (
				!in_array($lower, ['title', 'name', 'created', 'modified', 'published'], true)
				&& !$fieldObj instanceof Field
			) {
				continue;
			}
			if (!$isSuperuser && $fieldObj instanceof Field && (bool) $fieldObj->useRoles && !$fieldObj->viewable(null, $user)) {
				continue;
			}
			$allowed[$key] = true;
		}

		return $allowed;
	}

	/**
	 * Build a sanitized ProcessWire selector string from query criteria while enforcing RBAC visibility rules.
	 *
	 * @param array<string, mixed> $criteria
	 */
	public function buildSelectorString(array $criteria = []): string
	{
		return implode(', ', $this->buildSelectorParts($criteria, true));
	}

	/**
	 * Build sanitized ProcessWire selector clause fragments from query criteria.
	 *
	 * @param array<string, mixed> $criteria
	 * @return list<string>
	 */
	private function buildSelectorParts(array $criteria = [], bool $includePagination = true): array
	{
		$sanitizer = $this->wire()->sanitizer;
		$search = trim((string) ($criteria['search'] ?? ''));
		$statusFilter = strtolower(trim((string) ($criteria['statusFilter'] ?? '')));
		/** @var array<string, mixed> $fieldFilters */
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
			$parts = $this->pageItems !== null
				? [$this->baseSelector]
				: $this->buildTrashScopeClauses();
			$parts[] = 'include=trash';
			$parts[] = 'status>=' . Page::statusTrash;
		} elseif (($statusFilter === 'unpublished' || $statusFilter === 'draft') && $canViewUnpublished) {
			$parts[] = 'include=unpublished';
			$parts[] = 'status&' . Page::statusUnpublished;
		} elseif ($statusFilter === 'hidden' && $canViewUnpublished) {
			$parts[] = 'include=hidden';
			$parts[] = 'status&' . Page::statusHidden;
		} elseif ($statusFilter === 'published') {
			$parts[] = 'status<' . Page::statusHidden;
		} else {
			if ($user->isSuperuser()) {
				$parts[] = 'include=all';
			} elseif ($canViewUnpublished) {
				$parts[] = 'include=unpublished';
			}
			$parts[] = 'status<' . Page::statusTrash;
		}

		if (isset($criteria['ids']) && is_array($criteria['ids']) && $criteria['ids'] !== []) {
			$cleanIds = [];
			foreach ($criteria['ids'] as $rawId) {
				if (is_int($rawId) && $rawId > 0) {
					$cleanIds[] = $rawId;
				} elseif (is_string($rawId) && ctype_digit(trim($rawId)) && (int) trim($rawId) > 0) {
					$cleanIds[] = (int) trim($rawId);
				}
			}
			$cleanIds = array_values(array_unique($cleanIds));
			$parts[] = $cleanIds !== [] ? ('id=' . implode('|', $cleanIds)) : 'id=0';
		}

		if ($search !== '') {
			$safeSearch = $sanitizer->selectorValue($search);
			$parts[] = "title|name%={$safeSearch}";
		}

		if ($fieldFilters !== []) {
			$allowedFilterKeys = $this->resolveAllowedFilterKeys();
			foreach ($fieldFilters as $fKey => $fVal) {
				$cleanKey = trim((string) $fKey);
				$cleanVal = is_scalar($fVal) ? trim((string) $fVal) : '';
				if ($cleanKey === '' || $cleanVal === '' || !isset($allowedFilterKeys[$cleanKey])) {
					continue;
				}
				$parts[] = $cleanKey . '=' . $sanitizer->selectorValue($cleanVal);
			}
		}

		$dateField = trim((string) ($this->options['dateField'] ?? ''));
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

		if ($includePagination) {
			$start = ($pageNum - 1) * $limit;
			$parts[] = "start={$start}";
			$parts[] = "limit={$limit}";
		}

		return $parts;
	}

	public function query(array $criteria = []): ReactPageResult
	{
		$pages = $this->wire()->pages;
		$config = $this->wire()->config;

		$pageNum = max(1, (int) ($criteria['pageNum'] ?? 1));
		$fallbackLimit = isset($this->options['limit']) && (int) $this->options['limit'] > 0
			? (int) $this->options['limit']
			: $this->defaultLimit;
		$limit = max(1, min(250, (int) ($criteria['limit'] ?? $fallbackLimit)));

		$adminUrl = rtrim((string) ($config->urls->admin ?: '/processwire'), '/');
		$user = $this->wire()->user;
		$isSuperuser = (bool) $user->isSuperuser();
		$baseParts = $this->buildSelectorParts($criteria, false);
		/** @var list<Page> $matchedPages */
		$matchedPages = [];
		$total = 0;

		if ($isSuperuser) {
			$selectorParts = $baseParts;
			$start = ($pageNum - 1) * $limit;
			$selectorParts[] = "start={$start}";
			$selectorParts[] = "limit={$limit}";
			$found = $pages->find(implode(', ', $selectorParts));
			$total = $found->getTotal();
			foreach ($found as $p) {
				if ($p instanceof Page && $p->id) {
					$matchedPages[] = $p;
				}
			}
		} else {
			$sliceStart = ($pageNum - 1) * $limit;
			$sliceEnd = $sliceStart + $limit;
			$chunkSize = max(100, $limit);
			$maxScan = 5000;
			$scanOffset = 0;

			while ($scanOffset < $maxScan) {
				$chunkParts = $baseParts;
				$chunkParts[] = "start={$scanOffset}";
				$chunkParts[] = "limit={$chunkSize}";
				$chunk = $pages->find(implode(', ', $chunkParts));
				$chunkCount = $chunk->count();
				if ($chunkCount === 0) {
					break;
				}
				foreach ($chunk as $p) {
					if (!$p instanceof Page || !$p->id) {
						continue;
					}
					if (!$p->viewable() && !$p->editable()) {
						continue;
					}
					if ($total >= $sliceStart && $total < $sliceEnd) {
						$matchedPages[] = $p;
					}
					$total++;
				}
				$scanOffset += $chunkCount;
				if ($chunkCount < $chunkSize || $scanOffset >= $chunk->getTotal()) {
					break;
				}
			}
		}

		/** @var array<int, int> $depthByParentId */
		$depthByParentId = [0 => 0];
		$records = [];

		foreach ($matchedPages as $p) {
			$isViewable = $p->viewable();
			$bitStatus = ReactRecord::STATUS_PUBLISHED;
			$variant = 'success';
			$label = $this->_('Published');

			if ($p->isTrash()) {
				$bitStatus = ReactRecord::STATUS_TRASH;
				$variant = 'danger';
				$label = $this->_('Trash');
			} elseif ($p->isUnpublished()) {
				$bitStatus = ReactRecord::STATUS_DRAFT;
				$variant = 'warning';
				$label = $this->_('Draft');
			} elseif ($p->isHidden()) {
				$bitStatus = ReactRecord::STATUS_HIDDEN;
				$variant = 'warning';
				$label = $this->_('Hidden');
			}
			if ($p->isLocked()) {
				$bitStatus |= ReactRecord::STATUS_LOCKED;
			}

			$values = [];
			$formatted = [];
			/** @var array<string, array<string, mixed>> $cells */
			$cells = [];
			foreach (array_keys($this->columns) as $colKey) {
				if (!$this->isFieldViewableOnPage($p, (string) $colKey, $isSuperuser)) {
					$values[$colKey] = '';
					continue;
				}
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
			if ($iconFieldOpt !== '' && $this->isFieldViewableOnPage($p, $iconFieldOpt, $isSuperuser)) {
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
			if ($thumbFieldOpt !== '' && $this->isFieldViewableOnPage($p, $thumbFieldOpt, $isSuperuser)) {
				$recordThumb = self::extractPageThumb($p->getUnformatted($thumbFieldOpt), (string) ($p->title ?: $p->name));
			}

			$recordSubtitle = '';
			$subtitleFieldOpt = trim((string) ($this->options['subtitleField'] ?? ''));
			if ($subtitleFieldOpt !== '') {
				if ($subtitleFieldOpt === 'path' || $subtitleFieldOpt === 'url') {
					$subVal = $p->url;
				} elseif ($this->isFieldViewableOnPage($p, $subtitleFieldOpt, $isSuperuser)) {
					$subVal = $p->get($subtitleFieldOpt);
				} else {
					$subVal = '';
				}
				if (is_scalar($subVal)) {
					$recordSubtitle = trim((string) $subVal);
				}
			}

			$parentId = (int) $p->parent_id;
			$parentCount = $depthByParentId[$parentId] ??= $p->parents()->count();

			$recordEditUrl = $this->editUrlBuilder instanceof Closure
				? UrlSanitizer::sanitizeHref((string) ($this->editUrlBuilder)($p), true)
				: "{$adminUrl}/page/edit/?id={$p->id}";

			$recordTitle = $this->isFieldViewableOnPage($p, 'title', $isSuperuser)
				? (string) ($p->title ?: $p->name)
				: (string) $p->name;

			$records[] = new ReactRecord(
				id: (string) $p->id,
				title: $recordTitle,
				name: (string) $p->name,
				status: $bitStatus,
				statusVariant: $variant,
				statusLabel: $label,
				values: $values,
				formatted: $formatted,
				editUrl: $recordEditUrl,
				viewUrl: $isViewable ? (string) $p->url : '',
				depth: max(0, $parentCount - 1),
				sort: (int) $p->sort,
				created: (int) $p->created,
				modified: (int) $p->modified,
				hasDraft: false,
				raw: $p,
				subtitle: $recordSubtitle,
				htmlColumns: $this->htmlColumns,
				icon: $recordIcon,
				thumb: $recordThumb,
				cells: $cells,
			);
		}

		$trashCount = 0;
		$canViewUnpublished = $user->isSuperuser() || $user->hasPermission('page-edit');
		if ($canViewUnpublished) {
			if ($this->pageItems !== null) {
				foreach ($this->pageItems as $itemPage) {
					if (
						$itemPage instanceof Page
						&& $itemPage->id > 1
						&& $itemPage->isTrash()
						&& !$this->isProtectedSystemPage($itemPage)
						&& ($isSuperuser || $itemPage->viewable() || $itemPage->editable())
					) {
						$trashCount++;
					}
				}
			} elseif ($isSuperuser) {
				$trashParts = $this->buildTrashScopeClauses();
				$trashParts[] = 'include=trash';
				$trashParts[] = 'status>=' . Page::statusTrash;
				$trashCount = $pages->count(implode(', ', $trashParts));
			} else {
				$trashBaseParts = $this->buildTrashScopeClauses();
				$trashBaseParts[] = 'include=trash';
				$trashBaseParts[] = 'status>=' . Page::statusTrash;
				$trashScanOffset = 0;
				$trashChunkSize = 250;
				while ($trashScanOffset < 5000) {
					$trashParts = $trashBaseParts;
					$trashParts[] = "start={$trashScanOffset}";
					$trashParts[] = "limit={$trashChunkSize}";
					$trashChunk = $pages->find(implode(', ', $trashParts));
					$trashChunkCount = $trashChunk->count();
					if ($trashChunkCount === 0) {
						break;
					}
					foreach ($trashChunk as $tp) {
						if (
							$tp instanceof Page
							&& $tp->id > 1
							&& !$this->isProtectedSystemPage($tp)
							&& ($tp->viewable() || $tp->editable())
						) {
							$trashCount++;
						}
					}
					$trashScanOffset += $trashChunkCount;
					if ($trashChunkCount < $trashChunkSize || $trashScanOffset >= $trashChunk->getTotal()) {
						break;
					}
				}
			}
		}

		return new ReactPageResult(
			items: $records,
			total: $total,
			pageNum: $pageNum,
			limit: $limit,
			trashCount: $trashCount,
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
		if ($this->locked || (bool) $this->wire()->config->demo) {
			return 0;
		}
		$pages = $this->wire()->pages;

		if ($operation === ReactDataProviderInterface::OP_EMPTY_TRASH) {
			$user = $this->wire()->user;
			if (!$user->isSuperuser() && !$user->hasPermission('page-delete')) {
				return 0;
			}
			$deleted = 0;
			if ($this->pageItems !== null) {
				foreach ($this->pageItems as $candidate) {
					if (
						$candidate instanceof Page
						&& $candidate->id > 1
						&& $candidate->isTrash()
						&& !$this->isProtectedSystemPage($candidate)
						&& $candidate->deleteable()
					) {
						$pages->delete($candidate, true);
						$deleted++;
					}
				}

				return $deleted;
			}

			$trashParts = $this->buildTrashScopeClauses();
			$trashParts[] = 'include=trash';
			$trashParts[] = 'status>=' . Page::statusTrash;
			$trashParts[] = 'limit=100';
			foreach ($pages->findMany(implode(', ', $trashParts)) as $candidate) {
				if (
					$candidate instanceof Page
					&& $candidate->id > 1
					&& $candidate->isTrash()
					&& !$this->isProtectedSystemPage($candidate)
					&& $candidate->deleteable()
				) {
					$pages->delete($candidate, true);
					$deleted++;
				}
			}
			if ($deleted > 0) {
				$pages->uncacheAll();
			}

			return $deleted;
		}

		if ($ids === []) {
			return 0;
		}

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
				case 'update_field':
					$field = (string) ($payload['field'] ?? '');
					if ($field !== '' && $this->canWriteField($p, $field, true)) {
						$rawVal = $payload['value'] ?? '';
						$fieldObj = $p->getField($field);
						$fieldTypeObj = $fieldObj?->type;
						$fieldTypeClass = $fieldTypeObj !== null ? $fieldTypeObj->className() : '';
						$langs = $this->wire()->languages;
						if (is_array($rawVal) && $fieldTypeObj instanceof FieldtypeLanguageInterface && $langs instanceof Languages) {
							foreach ($rawVal as $langKey => $langVal) {
								$targetLang = is_int($langKey) || ctype_digit($langKey)
									? $langs->get((int) $langKey)
									: $langs->get($langKey);
								if ($targetLang instanceof Language && $targetLang->id > 0 && $targetLang->editable() && is_scalar($langVal)) {
									$p->setLanguageValue($targetLang, $field, (string) $langVal);
								}
							}
							$pages->save($p, ['quiet' => true]);
						} elseif ($fieldTypeObj instanceof FieldtypeLanguageInterface && is_scalar($rawVal) && $langs instanceof Languages) {
							$defLang = $langs->getDefault();
							if ($defLang instanceof Language && $defLang->id > 0 && $defLang->editable()) {
								$p->setLanguageValue($defLang, $field, (string) $rawVal);
								$pages->save($p, ['quiet' => true]);
							} else {
								$p->setAndSave($field, (string) $rawVal);
							}
						} elseif ($fieldTypeObj instanceof FieldtypeCheckbox || $fieldTypeClass === 'FieldtypeToggle') {
							$boolStr = is_bool($rawVal)
								? ($rawVal ? '1' : '0')
								: strtolower(trim(is_scalar($rawVal) ? (string) $rawVal : ''));
							$p->setAndSave($field, in_array($boolStr, ['1', 'true', 'yes', 'on'], true) ? 1 : 0);
						} elseif ($fieldTypeObj instanceof FieldtypeDatetime && is_string($rawVal)) {
							$trimmedDate = trim($rawVal);
							if ($trimmedDate === '') {
								$p->setAndSave($field, '');
							} elseif (ctype_digit($trimmedDate)) {
								$p->setAndSave($field, (int) $trimmedDate);
							} else {
								$parsedTs = strtotime(str_replace('T', ' ', $trimmedDate));
								$p->setAndSave($field, $parsedTs !== false ? $parsedTs : $trimmedDate);
							}
						} else {
							$p->setAndSave($field, $rawVal);
						}
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
			}
		}

		if ($affected > 0) {
			$pages->uncacheAll();
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

	public function supportsQuickEdit(): bool
	{
		return !$this->locked;
	}

	public function createQuickRecord(string $title, array $context = []): ?string
	{
		return null;
	}

	/**
	 * Build a `SchemaForm` payload from the page's actual ProcessWire `Inputfield` tree
	 * (`$page->getInputfields()`) so Quick Edit renders native multi-language tabs, textareas,
	 * selects, toggles, relations, media, and rich-text controls.
	 *
	 * @param array{editUrl?: string, errors?: array<string, string>} $context
	 * @return array{
	 *   title: string,
	 *   formSchema: array<string, mixed>,
	 *   scriptAssets: list<string>,
	 *   styleAssets: list<string>,
	 *   editUrl: string
	 * }|null
	 */
	public function resolveQuickEditForm(string $recordId, array $context = []): ?array
	{
		if ($this->locked || $recordId === '__new__' || !ctype_digit($recordId)) {
			return null;
		}

		$p = $this->wire()->pages->get((int) $recordId);
		if (!$p instanceof Page || !$p->id || !$this->matchesBaseScope($p) || $this->isProtectedSystemPage($p) || !$p->editable()) {
			return null;
		}

		/** @var array<string, string> $errors */
		$errors = [];
		if (isset($context['errors']) && is_array($context['errors'])) {
			foreach ($context['errors'] as $errField => $errMsg) {
				if (is_string($errField) && $errField !== '' && is_scalar($errMsg)) {
					$errors[$errField] = trim((string) $errMsg);
				}
			}
		}

		$built = $this->buildQuickEditPageForm($p, true, $errors);
		$formSchema = React::instance($this)->serializeForm($built['form'], [
			'errors' => $errors,
			'dirtyGuard' => false,
		]);
		$formSchema['submits'] = [];
		$formSchema['dirtyGuard'] = false;

		$adminUrl = rtrim((string) ($this->wire()->config->urls->admin ?: '/processwire'), '/');
		$recordEditUrl = $this->editUrlBuilder instanceof Closure
			? UrlSanitizer::sanitizeHref((string) ($this->editUrlBuilder)($p), true)
			: "{$adminUrl}/page/edit/?id={$p->id}";

		return [
			'title' => (string) ($p->title ?: $p->name),
			'formSchema' => $formSchema,
			'scriptAssets' => $built['scriptAssets'],
			'styleAssets' => $built['styleAssets'],
			'editUrl' => $recordEditUrl,
		];
	}

	/**
	 * @inheritDoc
	 */
	public function saveQuickEdit(string $id, array $input): array
	{
		$config = $this->wire()->config;
		if ($this->locked || (bool) $config->demo) {
			return ['ok' => false, 'message' => $this->_('Quick edit is locked.')];
		}
		if (!ctype_digit($id)) {
			return ['ok' => false, 'message' => $this->_('Invalid page identifier.')];
		}

		$pages = $this->wire()->pages;
		$p = $pages->get((int) $id);
		if (!$p instanceof Page || !$p->id || !$this->matchesBaseScope($p) || $this->isProtectedSystemPage($p) || !$p->editable()) {
			return ['ok' => false, 'message' => $this->_('Page is protected or not editable.')];
		}

		if (!empty($input['_rw_quick_edit_form'])) {
			$postData = $input;
			unset($postData['_rw_quick_edit_form']);
			$built = $this->buildQuickEditPageForm($p, false, []);
			$wireInput = new WireInputData($postData);
			$built['form']->processInput($wireInput);

			/** @var array<string, string> $errors */
			$errors = [];
			$this->collectQuickEditErrors($built['form'], $errors);
			$this->clearWireErrorNotices();
			if ($errors !== []) {
				return [
					'ok' => false,
					'message' => $this->_('Please fix the highlighted errors.'),
					'errors' => $errors,
				];
			}

			$languages = $this->wire()->languages;
			$prevOf = $p->of();
			$p->of(false);
			try {
				foreach ($built['fields'] as $fieldName => $inputfield) {
					if (!$inputfield->isChanged()) {
						continue;
					}
					if (!$this->canWriteField($p, $fieldName, true) || !$p->editable($fieldName, false)) {
						continue;
					}
					if ($languages instanceof Languages && $inputfield->getSetting('useLanguages')) {
						$valObj = $p->get($fieldName);
						if (is_object($valObj) && method_exists($valObj, 'setFromInputfield')) {
							$cloned = clone $valObj;
							$cloned->setFromInputfield($inputfield);
							$p->set($fieldName, $cloned);
						} else {
							$p->set($fieldName, $inputfield->val());
						}
					} else {
						$p->set($fieldName, $inputfield->val());
					}
				}
				$pages->save($p);
				$pages->uncacheAll();
			} finally {
				$p->of($prevOf);
			}

			return [
				'ok' => true,
				'message' => $this->_('Page updated.'),
			];
		}

		/** @var array<string, mixed> $validated */
		$validated = [];
		foreach ($input as $fKey => $fVal) {
			if (!is_string($fKey) || $fKey === '' || str_starts_with($fKey, '_')) {
				continue;
			}
			if (!$this->canWriteField($p, $fKey, true)) {
				return ['ok' => false, 'message' => $this->_('Field is not editable.')];
			}
			$validated[$fKey] = $fVal;
		}

		foreach ($validated as $fKey => $fVal) {
			$this->mutate(ReactDataProviderInterface::OP_UPDATE_FIELD, [$id], [
				'field' => $fKey,
				'value' => $fVal,
			]);
		}

		return [
			'ok' => true,
			'message' => $this->_('Page updated.'),
		];
	}

	/**
	 * Build a filtered `InputfieldForm` containing editable content fields for `$p`, optionally warming field assets.
	 *
	 * @param array<string, string> $errors
	 * @return array{
	 *   form: InputfieldForm,
	 *   fields: array<string, Inputfield>,
	 *   scriptAssets: list<string>,
	 *   styleAssets: list<string>
	 * }
	 */
	private function buildQuickEditPageForm(Page $p, bool $warmAssets, array $errors = []): array
	{
		$modules = $this->wire()->modules;
		$config = $this->wire()->config;

		/** @var InputfieldForm $form */
		$form = $modules->get('InputfieldForm');
		$form->attr('id', 'rw_quick_edit_page_' . $p->id);
		$form->attr('name', 'rw_quick_edit_page_' . $p->id);
		$form->attr('method', 'post');
		$form->set('protectCSRF', false);
		$form->set('columnWidthSpacing', (int) $config->inputfieldColumnWidthSpacing);

		/** @var array<string, Inputfield> $editableFields */
		$editableFields = [];
		$prevOf = $p->of();
		$p->of(false);
		try {
			$pageFields = $p->getInputfields();
			if ($pageFields instanceof InputfieldWrapper) {
				$this->pruneQuickEditInputfields($pageFields, $p, $editableFields);
				foreach ($pageFields->children() as $child) {
					if (!$child instanceof Inputfield) {
						continue;
					}
					$pageFields->remove($child);
					$form->add($child);
				}
			}
			$form->resetTrackChanges(true);
		} finally {
			$p->of($prevOf);
		}

		foreach ($errors as $errField => $errMessage) {
			$targetField = $form->getChildByName($errField);
			if ($targetField instanceof Inputfield) {
				$targetField->getErrors(true);
				$targetField->error($errMessage);
			}
		}
		if ($errors !== []) {
			$this->clearWireErrorNotices();
		}

		$scriptAssets = [];
		$styleAssets = [];
		if ($warmAssets) {
			$beforeScripts = [];
			foreach ($config->scripts as $s) {
				$beforeScripts[(string) $s] = true;
			}
			$beforeStyles = [];
			foreach ($config->styles as $s) {
				$beforeStyles[(string) $s] = true;
			}

			$form->renderReady(null, false);
			foreach ($form->getAll(['withWrappers' => true]) as $child) {
				if ($child instanceof Inputfield) {
					$child->renderReady($form, false);
				}
			}

			foreach ($config->scripts as $s) {
				$url = (string) $s;
				if (!isset($beforeScripts[$url]) && self::isQuickEditDynamicAsset($url)) {
					$scriptAssets[] = $url;
				}
			}
			foreach ($config->styles as $s) {
				$url = (string) $s;
				if (!isset($beforeStyles[$url]) && self::isQuickEditDynamicAsset($url)) {
					$styleAssets[] = $url;
				}
			}
		}

		return [
			'form' => $form,
			'fields' => $editableFields,
			'scriptAssets' => array_values(array_unique($scriptAssets)),
			'styleAssets' => array_values(array_unique($styleAssets)),
		];
	}

	/**
	 * Recursively remove system/protected/non-editable fields and empty wrappers from `$wrapper`.
	 *
	 * @param array<string, Inputfield> $editableFields
	 */
	private function pruneQuickEditInputfields(InputfieldWrapper $wrapper, Page $p, array &$editableFields): void
	{
		$blocked = [
			'id',
			'pass',
			'roles',
			'permissions',
			'template',
			'templates_id',
			'parent',
			'parent_id',
			'status',
			'created',
			'modified',
			'created_users_id',
			'modified_users_id',
			'delete_page',
			'sortfield',
			'sortfield_reverse',
			'_pw_page_name',
			'_page_meta',
		];

		foreach ($wrapper->children() as $child) {
			if (!$child instanceof Inputfield) {
				continue;
			}
			$rawName = $child->attr('name');
			$name = is_scalar($rawName) ? trim((string) $rawName) : '';
			$lowerName = strtolower($name);
			if (
				$child instanceof InputfieldSubmit
				|| $child instanceof InputfieldHidden
				|| strtolower($child->className()) === 'inputfieldbutton'
				|| ($name !== '' && (
					in_array($lowerName, $blocked, true)
					|| str_starts_with($lowerName, 'submit_')
					|| str_starts_with($lowerName, '_after_submit_')
				))
			) {
				$wrapper->remove($child);
				continue;
			}

			if ($child instanceof InputfieldWrapper) {
				$this->pruneQuickEditInputfields($child, $p, $editableFields);
				if ($child->children()->count() === 0) {
					$wrapper->remove($child);
				}
				continue;
			}

			if ($name === '' || !$p->editable($name, false) || !$this->canWriteField($p, $name, true)) {
				$wrapper->remove($child);
				continue;
			}

			$child->resetTrackChanges(true);
			$editableFields[$name] = $child;
		}
	}

	/**
	 * @param array<string, string> $errors
	 */
	private function collectQuickEditErrors(InputfieldWrapper $wrapper, array &$errors): void
	{
		foreach ($wrapper->children() as $child) {
			if (!$child instanceof Inputfield) {
				continue;
			}
			if ($child instanceof InputfieldWrapper) {
				$this->collectQuickEditErrors($child, $errors);
			}
			$fieldErrors = $child->getErrors(true);
			if ($fieldErrors !== []) {
				$rawName = $child->attr('name');
				$name = is_scalar($rawName) ? trim((string) $rawName) : '';
				if ($name !== '') {
					$errors[$name] = implode(' ', array_map('strval', $fieldErrors));
				}
			}
		}
	}

	private function clearWireErrorNotices(): void
	{
		$notices = $this->wire()->notices;
		if ($notices === null) {
			return;
		}
		foreach ($notices as $notice) {
			if ($notice instanceof NoticeError) {
				$notices->remove($notice);
			}
		}
	}

	private static function isQuickEditDynamicAsset(string $url): bool
	{
		return str_contains($url, '/site/modules/')
			&& preg_match('~/(?:ReactInertia|ReactViewports)\.(?:js|css)(?:$|\?)~i', $url) !== 1;
	}

	/**
	 * Build selector clauses for trashed pages by stripping parent/status constraints
	 * that change when ProcessWire moves a trashed page under `/trash/`.
	 *
	 * @return list<string>
	 */
	private function buildTrashScopeClauses(): array
	{
		$clauses = [];
		$rawSelector = trim($this->baseSelector);
		if ($rawSelector !== '') {
			try {
				$selectors = new Selectors($rawSelector);
				foreach ($selectors as $sel) {
					$field = is_array($sel->field) ? implode('|', $sel->field) : (string) $sel->field;
					$lower = strtolower(trim($field));
					if (in_array($lower, ['parent', 'parent_id', 'has_parent', 'status', 'limit', 'start', 'sort', 'include'], true)) {
						continue;
					}
					$clauses[] = (string) $sel;
				}
			} catch (\Throwable) {
				$clauses[] = $rawSelector;
			}
		}

		return $clauses;
	}
}
