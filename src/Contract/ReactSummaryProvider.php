<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

/**
 * Optional provider capability exposing column footer summaries and kanban stage aggregates.
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

	/**
	 * Optional numeric field summed per Kanban column header.
	 */
	public function stageSummaryField(): ?string;

	/**
	 * Compute per-stage metric summaries across the active criteria for Kanban column headers.
	 *
	 * @param array<string, mixed> $criteria
	 * @return array<string, array{field: string, type: string, label: string, formatted: string, raw: float|int, count: int}>
	 */
	public function computeStageSummaries(array $criteria = []): array;
}
