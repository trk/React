<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

/**
 * Optional provider capability exposing saved view presets.
 */
interface ReactViewsProvider
{
	/**
	 * Named view presets shown as tabs or pills in the filter bar.
	 *
	 * @return array<string, array{
	 *   label: string,
	 *   icon?: string,
	 *   layout?: 'table'|'cards'|'kanban'|'calendar',
	 *   columns?: list<string>,
	 *   sort?: string,
	 *   groupBy?: string
	 * }>
	 */
	public function savedViews(): array;
}
