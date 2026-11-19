<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

use Totoglu\React\Data\ReactRecord;

/**
 * Optional provider capability for unpaginated calendar date windows and timeline lanes.
 */
interface ReactCalendarProvider
{
	/**
	 * Query all records intersecting `[$startIso, $endIso]` (unpaginated window for Calendar/Timeline).
	 *
	 * @param array<string, mixed> $criteria
	 * @return list<ReactRecord>
	 */
	public function queryWindow(array $criteria, string $startIso, string $endIso): array;

	/**
	 * Optional grouping field for Timeline horizontal lanes (e.g., room/resource/assignee).
	 */
	public function laneField(): string;

	/**
	 * Lane options (`laneKey => label`).
	 *
	 * @return array<string, string>
	 */
	public function laneOptions(): array;

	/**
	 * Detect scheduling conflicts among the given records in the active calendar window.
	 *
	 * Returns a map of conflicting record IDs (`[recordId => true]`).
	 *
	 * @param list<ReactRecord> $records
	 * @return array<string, bool>
	 */
	public function conflicts(array $records): array;
}
