<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

/**
 * Optional provider capability exposing bulk-editable fields.
 */
interface ReactBulkFieldsProvider
{
	/**
	 * Fields editable in the bulk bar's "Set Field..." action.
	 *
	 * @return array<string, array{label: string, options: array<string, string>}>
	 */
	public function bulkEditableFields(): array;
}
