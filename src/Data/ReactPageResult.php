<?php

declare(strict_types=1);

namespace Totoglu\React\Data;

/**
 * Paginated query result envelope returned by `ReactDataProviderInterface::query()`.
 */
final readonly class ReactPageResult
{
	/**
	 * @param list<ReactRecord> $items
	 */
	public function __construct(
		public array $items,
		public int $total,
		public int $pageNum = 1,
		public int $limit = 25,
		public int $trashCount = 0,
	) {
	}

	public function totalPages(): int
	{
		if ($this->limit <= 0) {
			return 1;
		}

		return max(1, (int) ceil($this->total / $this->limit));
	}
}
