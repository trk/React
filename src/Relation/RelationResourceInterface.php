<?php

declare(strict_types=1);

namespace Totoglu\React\Relation;

/**
 * RelationResourceInterface
 *
 * Contract implemented by every relational target resource adapter (`page`, `template`,
 * `field`, `user`, `role`, `permission`, `language`, `module`, and third-party adapters).
 */
interface RelationResourceInterface
{
	/**
	 * Canonical lowercase resource identifier (e.g. `'page'`, `'template'`, `'field'`).
	 */
	public function name(): string;

	/**
	 * Human-readable singular resource label (e.g. `'Page'`, `'Template'`, `'Field'`).
	 */
	public function label(): string;

	/**
	 * Default vector icon slug for this resource.
	 */
	public function icon(): string;

	/**
	 * Default value attribute stored when `valueField` is not explicitly configured (`'id'` or `'name'`).
	 */
	public function defaultValueField(): string;

	/**
	 * Whether this resource exposes a hierarchical parent-child tree (`tree()`).
	 */
	public function supportsTree(): bool;

	/**
	 * Whether this resource supports inline Quick Create (`quickCreate()`).
	 */
	public function supportsQuickCreate(): bool;

	/**
	 * Search and paginate candidate items matching `$params` and server-signed `$config`.
	 *
	 * Supported `$params` keys:
	 * - `q` (string): Search query
	 * - `page` (int): 1-based page number
	 * - `limit` (int): Items per page
	 * - `dependsValue` (mixed): Current value of a sibling field watched via `dependsOn`
	 * - `exclude` (list<string|int>): Values to omit
	 *
	 * @param array<string, mixed> $params
	 * @param array<string, mixed> $config
	 * @return array{items: list<RelationItem>, total: int, hasMore: bool}
	 */
	public function query(array $params = [], array $config = []): array;

	/**
	 * Return direct child items under `$parentId` (`0` or `''` for root level) for `treeselect` controls.
	 *
	 * @param array<string, mixed> $config
	 * @return list<RelationItem>
	 */
	public function tree(string|int $parentId = 0, array $config = []): array;

	/**
	 * Hydrate an array of stored scalar values (`id`, `name`, `path`) into `RelationItem` instances,
	 * preserving the input order where possible.
	 *
	 * @param list<string|int> $values
	 * @param array<string, mixed> $config
	 * @return list<RelationItem>
	 */
	public function hydrate(array $values, array $config = []): array;

	/**
	 * Return the total candidate count under `$config` (used for `widget: 'auto'` threshold resolution).
	 *
	 * @param array<string, mixed> $config
	 */
	public function count(array $config = []): int;

	/**
	 * Query incoming One-to-Many (`O2M`) records referencing `$ownerId` via `$foreignField`.
	 *
	 * @param array<string, mixed> $params
	 * @param array<string, mixed> $config
	 * @return array{items: list<RelationItem>, total: int, hasMore: bool}
	 */
	public function queryReverse(string|int $ownerId, string $foreignField, array $params = [], array $config = []): array;

	/**
	 * Create a minimal new target record inline when `creatable` is enabled and RBAC permits.
	 *
	 * @param array<string, mixed> $payload
	 * @param array<string, mixed> $config
	 */
	public function quickCreate(array $payload, array $config = []): RelationItem;

	/**
	 * Link an existing target record (`$targetValue`) to `$ownerId` via `$foreignField` (`O2M` link action).
	 *
	 * @param array<string, mixed> $config
	 */
	public function link(string|int $ownerId, string $foreignField, string|int $targetValue, array $config = []): bool;

	/**
	 * Unlink an existing target record (`$targetValue`) from `$ownerId` via `$foreignField` (`O2M` unlink action).
	 *
	 * @param array<string, mixed> $config
	 */
	public function unlink(string|int $ownerId, string $foreignField, string|int $targetValue, array $config = []): bool;
}
