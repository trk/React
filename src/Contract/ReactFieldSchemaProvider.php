<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

/**
 * Optional provider capability exposing filterable field metadata, grouping, and column options.
 */
interface ReactFieldSchemaProvider
{
	/**
	 * Filterable field metadata for advanced filter dropdowns.
	 *
	 * @return array<string, array{
	 *   label: string,
	 *   type: 'select'|'boolean'|'text'|'date',
	 *   options?: array<string, string>
	 * }>
	 */
	public function filterableFields(): array;

	/**
	 * Fields eligible for row grouping (`groupBy` dropdown).
	 *
	 * @return array<string, string> `fieldKey => label`
	 */
	public function groupableFields(): array;

	/**
	 * All optional columns a user may toggle on/off in the column chooser.
	 *
	 * @return array<string, string> `colKey => label`
	 */
	public function availableColumns(): array;

	/**
	 * Columns eligible for inline editing in `MarkupReactTable` rows and Quick Edit sheets.
	 *
	 * @return array<string, array{
	 *   type: 'select'|'radios'|'text'|'textarea'|'markdown'|'number'|'range'|'date'|'datetime-local'|'time'|'email'|'url'|'tel'|'color'|'toggle'|'checkbox'|'boolean',
	 *   label?: string,
	 *   options?: array<string, string>,
	 *   step?: string,
	 *   min?: string,
	 *   max?: string,
	 *   rows?: int,
	 *   monospace?: bool,
	 *   placeholder?: string,
	 *   required?: bool
	 * }>
	 */
	public function inlineEditableFields(): array;
}
