<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

/**
 * Optional provider capability exposing collection export payloads.
 */
interface ReactExportProvider
{
	/**
	 * Supported export format keys (e.g., `['csv', 'json']`).
	 *
	 * @return list<string>
	 */
	public function exportFormats(): array;

	/**
	 * Stream or return an export payload for the active criteria.
	 *
	 * @param array<string, mixed> $criteria
	 * @return array{filename: string, contentType: string, body: string}
	 */
	public function export(string $format, array $criteria = []): array;
}
