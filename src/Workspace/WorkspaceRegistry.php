<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

use ProcessWire\Page;
use ProcessWire\User;
use ProcessWire\Wire;
use Totoglu\React\Security\AccessGuard;

/**
 * Central registry for `ProcessReactWorkspace` admin workspaces.
 *
 * Manages workspace registration, RBAC permission filtering per user, and automatic Process admin URL resolution.
 */
final class WorkspaceRegistry extends Wire
{
	/** @var array<string, WorkspaceDefinition> */
	private array $definitions = [];

	/** @var array<string, string> */
	private array $resolvedUrlCache = [];

	/**
	 * Register or update a workspace definition in the registry.
	 *
	 * @param WorkspaceDefinition|array<string, mixed> $definition
	 */
	public function register(WorkspaceDefinition|array $definition): self
	{
		$def = $definition instanceof WorkspaceDefinition
			? $definition
			: WorkspaceDefinition::fromArray($definition);

		if ($def->id === '' || $def->title === '') {
			return $this;
		}

		$this->definitions[$def->id] = $def;
		unset($this->resolvedUrlCache[$def->id]);

		return $this;
	}

	/**
	 * Remove a workspace definition by ID.
	 */
	public function unregister(string $id): self
	{
		$cleanId = strtolower(trim($id));
		unset($this->definitions[$cleanId], $this->resolvedUrlCache[$cleanId]);
		\ProcessWire\React::forgetSharedWorkspace($cleanId);

		return $this;
	}

	/**
	 * Determine whether a workspace ID is registered.
	 */
	public function has(string $id): bool
	{
		$cleanId = strtolower(trim($id));

		return isset($this->definitions[$cleanId]);
	}

	/**
	 * Retrieve a registered `WorkspaceDefinition` by ID or Process class name.
	 */
	public function get(string $idOrProcess): ?WorkspaceDefinition
	{
		$clean = trim($idOrProcess);
		$lower = strtolower($clean);
		if (isset($this->definitions[$lower])) {
			return $this->definitions[$lower];
		}

		$shortProcess = str_starts_with($clean, 'ProcessWire\\')
			? substr($clean, strlen('ProcessWire\\'))
			: $clean;

		foreach ($this->definitions as $def) {
			if (strcasecmp($def->process, $shortProcess) === 0 || strcasecmp($def->component, $clean) === 0) {
				return $def;
			}
		}

		return null;
	}

	/**
	 * Return all registered workspace definitions sorted by `order` ASC, then `title` ASC.
	 *
	 * @return array<string, WorkspaceDefinition>
	 */
	public function all(): array
	{
		$items = $this->definitions;
		uasort($items, static function (WorkspaceDefinition $a, WorkspaceDefinition $b): int {
			if ($a->order !== $b->order) {
				return $a->order <=> $b->order;
			}

			return strcasecmp($a->title, $b->title);
		});

		return $items;
	}

	/**
	 * Determine whether `$user` (or the current ProcessWire user) has permission to access `$definition`.
	 */
	public function canAccess(WorkspaceDefinition|string $definition, ?User $user = null): bool
	{
		$def = is_string($definition) ? $this->get($definition) : $definition;
		if (!$def instanceof WorkspaceDefinition) {
			return false;
		}

		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticatedOrSuperuser($resolvedUser)) {
			return false;
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

		if ($def->process !== '' && preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $def->process) === 1) {
			$fqcn = 'ProcessWire\\' . $def->process;
			$modules = $this->wire()->modules;
			if (!class_exists($fqcn, false) && !class_exists($def->process, false) && $modules->isInstalled($def->process)) {
				try {
					$modules->includeModule($def->process);
				} catch (\Throwable) {
					// Fall back to module info metadata below
				}
			}
			$targetClass = class_exists($fqcn, false)
				? $fqcn
				: (class_exists($def->process, false) ? $def->process : '');
			if ($targetClass !== '') {
				if (method_exists($targetClass, 'checkAccess')) {
					try {
						return (bool) $targetClass::checkAccess(['user' => $resolvedUser]);
					} catch (\Throwable) {
						return false;
					}
				}
				if (method_exists($targetClass, 'getModuleInfo')) {
					try {
						/** @var array<string, mixed> $info */
						$info = $targetClass::getModuleInfo();
						$perm = isset($info['permission']) ? trim((string) $info['permission']) : '';
						if ($perm !== '') {
							return (bool) $resolvedUser->hasPermission($perm);
						}
					} catch (\Throwable) {
						return false;
					}
				}
			} elseif ($modules->isInstalled($def->process)) {
				$info = $modules->getModuleInfo($def->process);
				$perm = is_array($info) && isset($info['permission']) ? trim((string) $info['permission']) : '';
				if ($perm !== '') {
					return (bool) $resolvedUser->hasPermission($perm);
				}
			}
		}

		return false;
	}

	/**
	 * Return all workspaces accessible to `$user` with resolved admin URLs and live module statistics.
	 *
	 * @return array<string, array{
	 *     id: string,
	 *     title: string,
	 *     description: string,
	 *     icon: string,
	 *     logoUrl: string,
	 *     process: string,
	 *     url: string,
	 *     permission: string,
	 *     category: string,
	 *     badge: string,
	 *     order: int,
	 *     component: string,
	 *     stats: list<array{label: string, value: string, tone: string}>
	 * }>
	 */
	public function accessible(?User $user = null, string $searchQuery = '', bool $includeStats = true): array
	{
		$needle = mb_strtolower(trim($searchQuery));
		$result = [];

		foreach ($this->all() as $id => $def) {
			if (!$this->canAccess($def, $user)) {
				continue;
			}

			if ($needle !== '') {
				$haystack = mb_strtolower($def->title . ' ' . $def->description . ' ' . $def->category . ' ' . $def->id);
				if (!str_contains($haystack, $needle)) {
					continue;
				}
			}

			$url = $this->resolveUrl($def);
			$stats = $includeStats ? $this->resolveStats($def, $user) : $def->stats;
			$result[$id] = $def->toArray($url, $stats);
		}

		return $result;
	}

	/**
	 * Resolve concise module statistics for a `WorkspaceDefinition`.
	 *
	 * @return list<array{label: string, value: string, tone: string}>
	 */
	public function resolveStats(WorkspaceDefinition|string $definition, ?User $user = null): array
	{
		$def = is_string($definition) ? $this->get($definition) : $definition;
		if (!$def instanceof WorkspaceDefinition) {
			return [];
		}

		if ($def->statsCallback !== null) {
			$resolvedUser = $user ?? $this->wire()->user;
			try {
				$dynamic = ($def->statsCallback)($resolvedUser, $this);
				if (is_array($dynamic)) {
					return WorkspaceDefinition::normalizeStats($dynamic);
				}
			} catch (\Throwable) {
				// Ignore stat evaluation errors and fall back to static stats
			}
		}

		return $def->stats;
	}

	/**
	 * Resolve the admin URL for a `WorkspaceDefinition` from its explicit `url` or Process module page.
	 */
	public function resolveUrl(WorkspaceDefinition|string $definition): string
	{
		$def = is_string($definition) ? $this->get($definition) : $definition;
		if (!$def instanceof WorkspaceDefinition) {
			return '';
		}

		if ($def->url !== '') {
			return $def->url;
		}

		if (isset($this->resolvedUrlCache[$def->id])) {
			return $this->resolvedUrlCache[$def->id];
		}

		$adminRoot = rtrim((string) ($this->wire()->config->urls->admin ?: '/processwire/'), '/') . '/';
		$url = '';

		if ($def->process !== '') {
			$page = $this->findProcessAdminPage($def->process);
			if ($page instanceof Page && (int) $page->id > 0) {
				$url = (string) $page->url;
			} else {
				$url = $this->resolveFallbackProcessUrl($def->process, $adminRoot);
			}
		}

		if ($url === '') {
			$url = $adminRoot . 'setup/' . rawurlencode($def->id) . '/';
		}

		$this->resolvedUrlCache[$def->id] = $url;

		return $url;
	}

	/**
	 * Resolve the URL of the `ProcessReactWorkspace` (`Admin > Workspace`) launcher page when installed or available.
	 */
	public function launcherUrl(): string
	{
		$adminRoot = rtrim((string) ($this->wire()->config->urls->admin ?: '/processwire/'), '/') . '/';
		$page = $this->findProcessAdminPage('ProcessReactWorkspace');
		if ($page instanceof Page && (int) $page->id > 0) {
			return (string) $page->url;
		}

		return $adminRoot . 'workspace/';
	}

	/**
	 * Locate the installed ProcessWire admin `Page` assigned to `$processName`.
	 */
	private function findProcessAdminPage(string $processName): ?Page
	{
		$modules = $this->wire()->modules;
		$pages = $this->wire()->pages;

		try {
			$moduleId = (int) $modules->getModuleID($processName);
			if ($moduleId <= 0) {
				return null;
			}
			$page = $pages->get("template=admin, process={$moduleId}, include=all");
			if ($page instanceof Page && (int) $page->id > 0) {
				return $page;
			}
		} catch (\Throwable) {
			return null;
		}

		return null;
	}

	/**
	 * Derive a deterministic fallback admin URL from `Process::getModuleInfo()['page']` metadata.
	 */
	private function resolveFallbackProcessUrl(string $processName, string $adminRoot): string
	{
		if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $processName) !== 1) {
			return '';
		}
		$fqcn = 'ProcessWire\\' . $processName;
		$modules = $this->wire()->modules;
		if (!class_exists($fqcn, false) && !class_exists($processName, false) && $modules->isInstalled($processName)) {
			try {
				$modules->includeModule($processName);
			} catch (\Throwable) {
				// Ignore and use default
			}
		}
		$targetClass = class_exists($fqcn, false)
			? $fqcn
			: (class_exists($processName, false) ? $processName : '');

		if ($targetClass !== '' && method_exists($targetClass, 'getModuleInfo')) {
			try {
				/** @var array<string, mixed> $info */
				$info = $targetClass::getModuleInfo();
				if (isset($info['page']) && is_array($info['page'])) {
					$pageName = trim((string) ($info['page']['name'] ?? ''));
					$parent = trim((string) ($info['page']['parent'] ?? ''), '/');
					if ($pageName !== '') {
						return $parent !== ''
							? $adminRoot . $parent . '/' . $pageName . '/'
							: $adminRoot . $pageName . '/';
					}
				}
			} catch (\Throwable) {
				// Ignore and use default
			}
		}

		return '';
	}
}
