<?php

declare(strict_types=1);

namespace Totoglu\React\Contract;

/**
 * Optional provider capability for drawer-based quick editing and inline creation.
 */
interface ReactQuickEditProvider
{
	public function supportsQuickEdit(): bool;

	/**
	 * Save quick-edit payload for record `$id`.
	 *
	 * @param array<string, mixed> $input
	 * @return array{ok: bool, message?: string, errors?: array<string, string>}
	 */
	public function saveQuickEdit(string $id, array $input): array;

	/**
	 * Optional inline quick-create with pluggable viewport mode or filter context.
	 *
	 * @param array<string, mixed> $context
	 */
	public function createQuickRecord(string $title, array $context = []): ?string;
}
