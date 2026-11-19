<?php

declare(strict_types=1);

namespace Totoglu\React\Media;

use ProcessWire\Inputfield;
use ProcessWire\Pagefiles;
use ProcessWire\User;

/**
 * Pluggable media host adapter contract for `MediaGateway`.
 *
 * Allows upper-layer entity or DTO modules to participate in `InputfieldReactImage`,
 * `InputfieldReactFile`, `FormSchemaSerializer`, and `/_react/media` without introducing
 * upward module references inside `React`.
 */
interface MediaHostAdapterInterface
{
	/**
	 * Unique lowercase host kind identifier stored in signed `mediaToken` envelopes (e.g. `'entry'`).
	 */
	public function kind(): string;

	/**
	 * Inspect an `Inputfield` and its `$hostPage` object; return a signable envelope array
	 * (including `'kind' => $this->kind()`) when owned by this adapter, or `null` otherwise.
	 *
	 * @param array<string, mixed> $common
	 * @return array<string, mixed>|null
	 */
	public function buildEnvelope(
		Inputfield $inputfield,
		mixed $hostPage,
		string $dataFieldName,
		string $inputName,
		array $common,
	): ?array;

	/**
	 * Resolve and authorize a target context for `/_react/media` actions.
	 *
	 * Must return `['ok' => true, 'kind' => $this->kind(), 'fieldName' => string, 'pagefiles' => Pagefiles, 'inputfield' => InputfieldFile, ...]`
	 * on success, or `['ok' => false, 'status' => int, 'error' => string]` on failure.
	 *
	 * @param array<string, mixed> $envelope
	 * @return array<string, mixed>
	 */
	public function resolveTargetContext(array $envelope, User $user, bool $requireEdit): array;

	/**
	 * Persist mutated `$pagefiles` back to the custom entity host.
	 *
	 * @param array<string, mixed> $resolved
	 */
	public function persistPagefiles(array $resolved, Pagefiles $pagefiles, int $maxFiles): void;
}
