<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

use ProcessWire\React;
use ProcessWire\User;
use ProcessWire\Wire;
use Totoglu\React\Security\AccessGuard;

/**
 * Central registry for `ProcessReactWorkspace` dashboard widgets registered by admin modules.
 *
 * Enforces RBAC permission filtering, verifies parent workspace availability, and resolves live widget data payloads.
 */
final class WorkspaceWidgetRegistry extends Wire
{
	/** @var array<string, WorkspaceWidgetDefinition> */
	private array $definitions = [];

	/**
	 * Register or update a dashboard widget definition.
	 *
	 * @param WorkspaceWidgetDefinition|array<string, mixed> $definition
	 */
	public function register(WorkspaceWidgetDefinition|array $definition): self
	{
		$def = $definition instanceof WorkspaceWidgetDefinition
			? $definition
			: WorkspaceWidgetDefinition::fromArray($definition);

		if ($def->id === '' || $def->title === '') {
			return $this;
		}

		$this->definitions[$def->id] = $def;

		return $this;
	}

	/**
	 * Remove a widget definition by ID.
	 */
	public function unregister(string $id): self
	{
		$cleanId = strtolower(trim($id));
		unset($this->definitions[$cleanId]);
		\ProcessWire\React::forgetSharedWidget($cleanId);

		return $this;
	}

	/**
	 * Determine whether a widget ID is registered.
	 */
	public function has(string $id): bool
	{
		$cleanId = strtolower(trim($id));

		return isset($this->definitions[$cleanId]);
	}

	/**
	 * Retrieve a registered `WorkspaceWidgetDefinition` by ID.
	 */
	public function get(string $id): ?WorkspaceWidgetDefinition
	{
		$cleanId = strtolower(trim($id));

		return $this->definitions[$cleanId] ?? null;
	}

	/**
	 * Return all registered widget definitions sorted by `order` ASC, then `title` ASC.
	 *
	 * @return array<string, WorkspaceWidgetDefinition>
	 */
	public function all(): array
	{
		$items = $this->definitions;
		uasort($items, static function (WorkspaceWidgetDefinition $a, WorkspaceWidgetDefinition $b): int {
			if ($a->order !== $b->order) {
				return $a->order <=> $b->order;
			}

			return strcasecmp($a->title, $b->title);
		});

		return $items;
	}

	/**
	 * Determine whether `$user` has access to `$definition` (and its parent workspace when specified).
	 */
	public function canAccess(WorkspaceWidgetDefinition|string $definition, ?User $user = null): bool
	{
		$def = is_string($definition) ? $this->get($definition) : $definition;
		if (!$def instanceof WorkspaceWidgetDefinition) {
			return false;
		}

		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticatedOrSuperuser($resolvedUser)) {
			return false;
		}

		// If tied to a parent workspace, ensure that workspace is still registered and accessible
		if ($def->workspaceId !== '') {
			$workspace = React::instance($this);
			$workspaces = $workspace->workspaces();
			if (!$workspaces->has($def->workspaceId) || !$workspaces->canAccess($def->workspaceId, $resolvedUser)) {
				return false;
			}
		}

		if ($def->accessCallback !== null) {
			try {
				return (bool) ($def->accessCallback)($resolvedUser, $this);
			} catch (\Throwable) {
				return false;
			}
		}

		if ($resolvedUser->isSuperuser()) {
			return true;
		}

		if ($def->permission !== '') {
			return (bool) $resolvedUser->hasPermission($def->permission);
		}

		if ($def->workspaceId !== '') {
			return true;
		}

		return false;
	}

	/**
	 * Resolve the data payload for a widget definition.
	 *
	 * @return array<string, mixed>
	 */
	public function resolveData(WorkspaceWidgetDefinition|string $definition, ?User $user = null): array
	{
		$def = is_string($definition) ? $this->get($definition) : $definition;
		if (!$def instanceof WorkspaceWidgetDefinition) {
			return WorkspaceWidgetDefinition::normalizeData([]);
		}

		if ($def->dataCallback !== null) {
			$resolvedUser = $user ?? $this->wire()->user;
			try {
				$dynamic = ($def->dataCallback)($resolvedUser, $this);
				if (is_array($dynamic)) {
					return WorkspaceWidgetDefinition::normalizeData($dynamic);
				}
			} catch (\Throwable) {
				// Ignore widget data callback exceptions and fall back to static data
			}
		}

		return $def->data;
	}

	/**
	 * Return all widgets accessible to `$user` with resolved data payloads and parent workspace metadata.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public function accessible(?User $user = null): array
	{
		$result = [];
		$workspace = React::instance($this);
		$workspaces = $workspace->workspaces();

		foreach ($this->all() as $id => $def) {
			if (!$this->canAccess($def, $user)) {
				continue;
			}

			$wsTitle = '';
			$wsUrl = '';
			if ($def->workspaceId !== '') {
				$wsDef = $workspaces->get($def->workspaceId);
				if ($wsDef instanceof WorkspaceDefinition) {
					$wsTitle = $wsDef->title;
					$wsUrl = $workspaces->resolveUrl($wsDef);
				}
			}

			$data = $this->resolveData($def, $user);
			$result[$id] = $def->toArray($data, $wsTitle, $wsUrl);
		}

		return $result;
	}
}
