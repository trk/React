<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

/**
 * Optional provider capability exposing bulk-editable fields and calendar date shifting support.
 */
interface ReactBulkFieldsProvider
{
	/**
	 * Fields editable in the bulk bar's "Set Field..." action.
	 *
	 * @return array<string, array{label: string, options: array<string, string>}>
	 */
	public function bulkEditableFields(): array;

	/**
	 * Whether the provider supports `mutate('shift_dates', $ids, ['days' => $n])`.
	 */
	public function supportsDateShift(): bool;
}
