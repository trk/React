<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

use Totoglu\React\Data\ReactPageResult;

/**
 * Seam interface decoupling `React` viewports (`MarkupReactTable`, `MarkupReactCards`, and custom `MarkupReactViewport` modules)
 * from the underlying storage engine (ProcessWire `Pages`, in-memory arrays/telemetry, or external registries).
 */
interface ReactDataProviderInterface
{
	public const OP_PUBLISH = 'publish';
	public const OP_DRAFT = 'draft';
	public const OP_TRASH = 'trash';
	public const OP_RESTORE = 'restore';
	public const OP_DELETE = 'delete';
	public const OP_DUPLICATE = 'duplicate';
	public const OP_LOCK = 'lock';
	public const OP_UNLOCK = 'unlock';
	public const OP_REORDER = 'reorder';
	public const OP_MOVE_STAGE = 'move_stage';
	public const OP_RESCHEDULE = 'reschedule';
	public const OP_UPDATE_FIELD = 'update_field';
	public const OP_SHIFT_DATES = 'shift_dates';
	public const OP_EMPTY_TRASH = 'empty_trash';
	public const OP_TOGGLE_STATUS = 'toggle_status';
	public const OP_TOGGLE_FIELD = 'toggle_field';
	public const OP_MOVE = 'move';
	public const OP_RESIZE_SPAN = 'resize_span';

	/**
	 * Unique provider descriptor (e.g., `'pages:template=basic-page'`, `'array:queues'`).
	 */
	public function id(): string;

	/**
	 * Human-readable collection title.
	 */
	public function title(): string;

	/**
	 * Default columns map (`columnKey => columnLabel`).
	 *
	 * @return array<string, string>
	 */
	public function columns(): array;

	/**
	 * List of column keys that support sorting (`queryToggleSort`).
	 *
	 * @return list<string>
	 */
	public function sortableColumns(): array;

	/**
	 * Status filter dropdown options (`statusKey => label`).
	 *
	 * @return array<string, string>
	 */
	public function statusOptions(): array;

	/**
	 * Field key used for Kanban stages (e.g., `'status'` or a select field name).
	 */
	public function stageField(): string;

	/**
	 * Kanban board stage columns (`stageValue => stageLabel`).
	 *
	 * @return array<string, string>
	 */
	public function stageOptions(string $field = ''): array;

	/**
	 * Field key used for Calendar event start date.
	 */
	public function dateStartField(): string;

	/**
	 * Field key used for Calendar event end date.
	 */
	public function dateEndField(): string;

	/**
	 * Whether mutations and bulk checkboxes are locked/read-only.
	 */
	public function isLocked(): bool;

	/**
	 * Execute a filtered, sorted, paginated query and return normalized `ReactRecord` items.
	 *
	 * @param array{
	 *   search?: string,
	 *   statusFilter?: string,
	 *   fieldFilters?: array<string, string>,
	 *   dateFrom?: string,
	 *   dateTo?: string,
	 *   sortBy?: string,
	 *   groupBy?: string,
	 *   activeView?: string,
	 *   parentMode?: string,
	 *   pageNum?: int,
	 *   limit?: int,
	 *   editUrl?: string
	 * } $criteria
	 */
	public function query(array $criteria = []): ReactPageResult;

	/**
	 * Execute a row or bulk mutation on the given record IDs.
	 *
	 * Supported operations: `'publish'`, `'draft'`, `'trash'`, `'restore'`, `'delete'`,
	 * `'duplicate'`, `'lock'`, `'unlock'`, `'reorder'`, `'move_stage'`, `'reschedule'`,
	 * `'update_field'`, `'shift_dates'`.
	 *
	 * @param list<string> $ids
	 * @param array<string, mixed> $payload
	 * @return int Number of modified records
	 */
	public function mutate(string $operation, array $ids, array $payload = []): int;
}
