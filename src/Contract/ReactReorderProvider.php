<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

/**
 * Optional provider capability indicating whether manual drag-sort is supported.
 */
interface ReactReorderProvider
{
	/**
	 * Whether manual drag-sort (`sort=sort` + `reorderRows`) is supported.
	 */
	public function isSortable(): bool;
}
