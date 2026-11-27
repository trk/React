<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

use PDO;
use ProcessWire\Page;
use ProcessWire\Template;
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

	/** @var array<int, string> */
	private array $processUrlByModuleId = [];

	private bool $processUrlsPreloaded = false;

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
		if ($def->process !== '') {
			$this->processUrlsPreloaded = false;
		}

		return $this;
	}

	/**
	 * Remove a workspace definition by ID.
	 */
	public function unregister(string $id): self
	{
		$cleanId = strtolower(trim($id));
		unset($this->definitions[$cleanId], $this->resolvedUrlCache[$cleanId]);
		\ProcessWire\React::forgetSharedWorkspace($cleanId, $this->wire());

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
			if ($targetClass !== '' && method_exists($targetClass, 'checkAccess')) {
				try {
					return (bool) $targetClass::checkAccess(['user' => $resolvedUser]);
				} catch (\Throwable) {
					return false;
				}
			}
			if ($modules->isInstalled($def->process)) {
				$info = $modules->getModuleInfo($def->process);
				$perm = is_array($info) && isset($info['permission']) ? trim((string) $info['permission']) : '';
				if ($perm !== '') {
					return (bool) $resolvedUser->hasPermission($perm);
				}
			}
			if ($targetClass !== '' && method_exists($targetClass, 'getModuleInfo')) {
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
			return \ProcessWire\React::instance($this)->withoutWorkspaceQuery($def->url);
		}

		if (isset($this->resolvedUrlCache[$def->id])) {
			return $this->resolvedUrlCache[$def->id];
		}

		$adminRoot = rtrim((string) ($this->wire()->config->urls->admin ?: '/processwire/'), '/') . '/';
		$url = '';

		if ($def->process !== '') {
			$url = $this->resolveProcessUrlByName($def->process);
			if ($url === '') {
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
		$url = $this->resolveProcessUrlByName('ProcessReactWorkspace');
		if ($url !== '') {
			return $url;
		}

		return $adminRoot . 'workspace/';
	}

	/**
	 * Resolve the admin page URL for `$processName`, batch-preloading all registered process pages
	 * in one SQL query + one `Pages::getById()` call to prevent N+1 lookups across workspaces.
	 */
	private function resolveProcessUrlByName(string $processName): string
	{
		$modules = $this->wire()->modules;

		try {
			$moduleId = (int) $modules->getModuleID($processName);
		} catch (\Throwable) {
			return '';
		}
		if ($moduleId <= 0) {
			return '';
		}

		$this->preloadProcessAdminUrls();
		if (isset($this->processUrlByModuleId[$moduleId])) {
			return $this->processUrlByModuleId[$moduleId];
		}

		$page = $this->findProcessAdminPage($moduleId);
		if ($page instanceof Page && (int) $page->id > 0) {
			$url = (string) $page->url;
			$this->processUrlByModuleId[$moduleId] = $url;

			return $url;
		}

		return '';
	}

	/**
	 * Batch-load all registered workspace admin page URLs in a single indexed SQL lookup + `Pages::getById()`.
	 */
	private function preloadProcessAdminUrls(): void
	{
		if ($this->processUrlsPreloaded) {
			return;
		}
		$this->processUrlsPreloaded = true;

		$modules = $this->wire()->modules;
		$processNames = ['ProcessReactWorkspace' => true];
		foreach ($this->definitions as $def) {
			if ($def->process !== '') {
				$processNames[$def->process] = true;
			}
		}

		$moduleIds = [];
		foreach (array_keys($processNames) as $procName) {
			try {
				$modId = (int) $modules->getModuleID($procName);
			} catch (\Throwable) {
				$modId = 0;
			}
			if ($modId > 0 && !isset($this->processUrlByModuleId[$modId])) {
				$moduleIds[] = $modId;
			}
		}
		$moduleIds = array_values(array_unique($moduleIds));
		if ($moduleIds === []) {
			return;
		}

		$adminTemplate = $this->wire()->templates->get('admin');
		if (!$adminTemplate instanceof Template || (int) $adminTemplate->id <= 0) {
			return;
		}

		try {
			$database = $this->wire()->database;
			$fieldProcessTable = $database->escapeTable('field_process');
			$pagesTable = $database->escapeTable('pages');
			$placeholders = implode(', ', array_fill(0, count($moduleIds), '?'));
			$stmt = $database->prepare(
				"SELECT fp.data AS module_id, p.id AS page_id"
				. " FROM {$fieldProcessTable} fp"
				. " INNER JOIN {$pagesTable} p ON p.id = fp.pages_id"
				. " WHERE p.templates_id = ? AND fp.data IN ({$placeholders})"
				. " ORDER BY p.id ASC"
			);
			$stmt->bindValue(1, (int) $adminTemplate->id, PDO::PARAM_INT);
			foreach ($moduleIds as $idx => $modId) {
				$stmt->bindValue($idx + 2, $modId, PDO::PARAM_INT);
			}
			$database->execute($stmt);

			/** @var array<int, int> $pageIdByModuleId */
			$pageIdByModuleId = [];
			while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
				if (!is_array($row)) {
					continue;
				}
				$mId = (int) ($row['module_id'] ?? 0);
				$pId = (int) ($row['page_id'] ?? 0);
				if ($mId > 0 && $pId > 0 && !isset($pageIdByModuleId[$mId])) {
					$pageIdByModuleId[$mId] = $pId;
				}
			}

			if ($pageIdByModuleId === []) {
				return;
			}

			$loadedPages = $this->wire()->pages->getById(array_values(array_unique($pageIdByModuleId)), $adminTemplate);
			/** @var array<int, string> $urlByPageId */
			$urlByPageId = [];
			foreach ($loadedPages as $adminPage) {
				if ($adminPage instanceof Page && (int) $adminPage->id > 0) {
					$urlByPageId[(int) $adminPage->id] = (string) $adminPage->url;
				}
			}

			foreach ($pageIdByModuleId as $mId => $pId) {
				if (isset($urlByPageId[$pId])) {
					$this->processUrlByModuleId[$mId] = $urlByPageId[$pId];
				}
			}
		} catch (\Throwable) {
			// Fall back lazily to per-page lookup when schema tables are unavailable
		}
	}

	/**
	 * Locate the installed ProcessWire admin `Page` assigned to `$moduleId`.
	 */
	private function findProcessAdminPage(int $moduleId): ?Page
	{
		$pages = $this->wire()->pages;

		try {
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

		$info = $modules->isInstalled($processName) ? $modules->getModuleInfoVerbose($processName) : [];
		if ((!is_array($info) || empty($info['page'])) && $targetClass !== '' && method_exists($targetClass, 'getModuleInfo')) {
			try {
				/** @var array<string, mixed> $info */
				$info = $targetClass::getModuleInfo();
			} catch (\Throwable) {
				$info = [];
			}
		}
		if (is_array($info) && isset($info['page']) && is_array($info['page'])) {
			$pageName = trim((string) ($info['page']['name'] ?? ''));
			$parent = trim((string) ($info['page']['parent'] ?? ''), '/');
			if ($pageName !== '') {
				return $parent !== ''
					? $adminRoot . $parent . '/' . $pageName . '/'
					: $adminRoot . $pageName . '/';
			}
		}

		return '';
	}
}
