<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

/**
 * Optional provider capability exposing column footer summaries.
 */
interface ReactSummaryProvider
{
	/**
	 * Footer summary configuration (`colKey => 'sum'|'avg'|'min'|'max'|'count'`).
	 *
	 * @return array<string, string>
	 */
	public function summaryConfig(): array;

	/**
	 * Compute formatted summary values across the full filtered set (or current page).
	 *
	 * @param array<string, mixed> $criteria
	 * @return array<string, array{type: string, label: string, formatted: string, raw: float|int}>
	 */
	public function computeSummaries(array $criteria = []): array;
}
