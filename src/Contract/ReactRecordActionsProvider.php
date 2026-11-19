<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

use Totoglu\React\Data\ReactRecord;

/**
 * Optional provider capability for custom per-record row actions and header CTA buttons.
 */
interface ReactRecordActionsProvider
{
	/**
	 * Custom or standard row action descriptors for a record.
	 *
	 * @return list<array{
	 *   key: string,
	 *   label: string,
	 *   icon?: string,
	 *   tone?: 'default'|'primary'|'success'|'warning'|'danger',
	 *   href?: string,
	 *   confirm?: string
	 * }>
	 */
	public function recordActions(ReactRecord $record): array;

	/**
	 * Primary create button URL (and optional label/modal flag) for the collection header.
	 *
	 * @return array{url: string, label: string, modal?: bool}|null
	 */
	public function createAction(): ?array;
}
