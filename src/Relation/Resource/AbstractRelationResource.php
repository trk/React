<?php

declare(strict_types=1);

namespace Totoglu\React\Relation\Resource;

use ProcessWire\Wire;
use ProcessWire\WireException;
use Totoglu\React\Relation\RelationItem;
use Totoglu\React\Relation\RelationResourceInterface;

/**
 * AbstractRelationResource
 *
 * Base adapter with shared pagination, search matching, value extraction, and safe default stubs
 * for non-hierarchical or non-creatable ProcessWire system resources.
 */
abstract class AbstractRelationResource extends Wire implements RelationResourceInterface
{
	public function supportsTree(): bool
	{
		return false;
	}

	public function supportsQuickCreate(): bool
	{
		return false;
	}

	/**
	 * @param array<string, mixed> $config
	 * @return list<RelationItem>
	 */
	public function tree(string|int $parentId = 0, array $config = []): array
	{
		return [];
	}

	/**
	 * @param array<string, mixed> $params
	 * @param array<string, mixed> $config
	 * @return array{items: list<RelationItem>, total: int, hasMore: bool}
	 */
	public function queryReverse(string|int $ownerId, string $foreignField, array $params = [], array $config = []): array
	{
		return ['items' => [], 'total' => 0, 'hasMore' => false];
	}

	/**
	 * @param array<string, mixed> $payload
	 * @param array<string, mixed> $config
	 */
	public function quickCreate(array $payload, array $config = []): RelationItem
	{
		throw new WireException(sprintf($this->_('Resource "%s" does not support inline quick creation.'), $this->name()));
	}

	/**
	 * @param array<string, mixed> $config
	 */
	public function link(string|int $ownerId, string $foreignField, string|int $targetValue, array $config = []): bool
	{
		return false;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	public function unlink(string|int $ownerId, string $foreignField, string|int $targetValue, array $config = []): bool
	{
		return false;
	}

	/**
	 * Resolve the active `valueField` (`'id'`, `'name'`, `'path'`) from `$config`.
	 *
	 * @param array<string, mixed> $config
	 */
	protected function resolveValueField(array $config): string
	{
		$vf = strtolower(trim((string) ($config['valueField'] ?? '')));

		return $vf !== '' ? $vf : $this->defaultValueField();
	}

	/**
	 * Sanitize a value for safe interpolation inside a ProcessWire selector clause.
	 */
	protected function sanitizeSelectorValue(string $value): string
	{
		return $this->wire()->sanitizer->selectorValue($value);
	}

	/**
	 * Case-insensitive substring match across multiple candidate text fields.
	 *
	 * @param list<string> $haystacks
	 */
	protected function matchesQuery(string $query, array $haystacks): bool
	{
		$needle = mb_strtolower(trim($query));
		if ($needle === '') {
			return true;
		}

		foreach ($haystacks as $haystack) {
			if ($haystack !== '' && str_contains(mb_strtolower($haystack), $needle)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Paginate an in-memory list of `RelationItem` instances.
	 *
	 * @param list<RelationItem> $allItems
	 * @param array<string, mixed> $params
	 * @param array<string, mixed> $config
	 * @return array{items: list<RelationItem>, total: int, hasMore: bool}
	 */
	protected function paginateItems(array $allItems, array $params = [], array $config = []): array
	{
		$exclude = [];
		if (isset($params['exclude']) && is_array($params['exclude'])) {
			foreach ($params['exclude'] as $ex) {
				if (is_scalar($ex) && (string) $ex !== '') {
					$exclude[(string) $ex] = true;
				}
			}
		}

		if ($exclude !== []) {
			$allItems = array_values(array_filter(
				$allItems,
				static fn(RelationItem $item): bool => !isset($exclude[(string) $item->value])
			));
		}

		$total = count($allItems);
		$page = max(1, (int) ($params['page'] ?? 1));
		$limit = max(1, min(200, (int) ($params['limit'] ?? $config['limit'] ?? 50)));
		$offset = ($page - 1) * $limit;
		$sliced = array_slice($allItems, $offset, $limit);

		return [
			'items' => $sliced,
			'total' => $total,
			'hasMore' => ($offset + count($sliced)) < $total,
		];
	}

	/**
	 * Normalize a mixed comma-separated string or array into a clean string list.
	 *
	 * @return list<string>
	 */
	protected function normalizeStringList(mixed $raw): array
	{
		if (is_string($raw)) {
			$parts = preg_split('/[\s,|]+/', trim($raw)) ?: [];
			return array_values(array_filter(array_map('trim', $parts), static fn(string $s): bool => $s !== ''));
		}

		if (is_array($raw)) {
			$out = [];
			foreach ($raw as $item) {
				if (is_scalar($item) && trim((string) $item) !== '') {
					$out[] = trim((string) $item);
				}
			}
			return array_values(array_unique($out));
		}

		return [];
	}
}
