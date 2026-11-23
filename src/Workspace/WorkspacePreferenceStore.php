<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

use ProcessWire\User;
use ProcessWire\Wire;
use Totoglu\React\Security\AccessGuard;
use Totoglu\React\Theme\ThemePreset;

/**
 * File-backed per-user Workspace & Dashboard preference store (`site/assets/cache/React/workspaces/{user-id}.json`).
 *
 * Persists user-specific workspace favorites, widget ordering, hidden widgets, widget column sizes,
 * theme mode (`light`/`dark`/`system`), theme color preset override, shell layout override,
 * and sidebar collapse state, and self-heals when modules or widgets are uninstalled or permissions change.
 */
final class WorkspacePreferenceStore extends Wire
{
	private const CACHE_FOLDER = 'React/workspaces';
	private const int MAX_ID_LENGTH = 128;
	private const int MAX_PREF_ITEMS = 500;
	private const string SHELL_LAYOUT_PATTERN = '/^[a-z0-9_-]{1,40}$/';

	/**
	 * Canonical default per-user workspace preference payload.
	 *
	 * @var array{
	 *     userId: int,
	 *     favorites: list<string>,
	 *     widgetOrder: list<string>,
	 *     hiddenWidgets: list<string>,
	 *     widgetSizes: array<string, string>,
	 *     themeMode: string,
	 *     themePreset: string,
	 *     shellLayout: string,
	 *     sidebarCollapsed: bool,
	 *     updatedAt: string
	 * }
	 */
	public const array DEFAULT_PREFERENCES = [
		'userId' => 0,
		'favorites' => [],
		'widgetOrder' => [],
		'hiddenWidgets' => [],
		'widgetSizes' => [],
		'themeMode' => '',
		'themePreset' => '',
		'shellLayout' => '',
		'sidebarCollapsed' => false,
		'updatedAt' => '',
	];

	/**
	 * Resolve the directory path where per-user JSON files are stored (`site/assets/cache/React/workspaces/`).
	 */
	public function directoryPath(): string
	{
		$cacheRoot = rtrim((string) ($this->wire()->config->paths->cache ?: dirname(__DIR__, 4) . '/assets/cache'), '/\\');

		return $cacheRoot . '/' . self::CACHE_FOLDER . '/';
	}

	/**
	 * Resolve the absolute file path for a user's preference JSON file (`site/assets/cache/React/workspaces/{user-id}.json`).
	 */
	public function filePath(?User $user = null): string
	{
		$userId = $this->resolveUserId($user);
		if ($userId <= 0) {
			return '';
		}

		return $this->directoryPath() . $userId . '.json';
	}

	/**
	 * Load raw persisted preferences for `$user` from `{user-id}.json`.
	 *
	 * @return array{
	 *     userId: int,
	 *     favorites: list<string>,
	 *     widgetOrder: list<string>,
	 *     hiddenWidgets: list<string>,
	 *     widgetSizes: array<string, string>,
	 *     themeMode: string,
	 *     themePreset: string,
	 *     shellLayout: string,
	 *     sidebarCollapsed: bool,
	 *     updatedAt: string
	 * }
	 */
	public function load(?User $user = null): array
	{
		$userId = $this->resolveUserId($user);
		$defaults = array_merge(self::DEFAULT_PREFERENCES, [
			'userId' => $userId,
		]);

		if ($userId <= 0) {
			return $defaults;
		}

		$path = $this->filePath($user);
		if ($path === '' || is_link($path) || !is_file($path) || !is_readable($path)) {
			return $defaults;
		}

		$raw = @file_get_contents($path);
		if (!is_string($raw) || trim($raw) === '') {
			return $defaults;
		}

		$decoded = json_decode($raw, true, 16);
		if (!is_array($decoded)) {
			return $defaults;
		}

		return [
			'userId' => $userId,
			'favorites' => $this->normalizeIdList($decoded['favorites'] ?? []),
			'widgetOrder' => $this->normalizeIdList($decoded['widgetOrder'] ?? []),
			'hiddenWidgets' => $this->normalizeIdList($decoded['hiddenWidgets'] ?? []),
			'widgetSizes' => $this->normalizeSizeMap($decoded['widgetSizes'] ?? []),
			'themeMode' => $this->normalizeThemeModeValue($decoded['themeMode'] ?? ''),
			'themePreset' => $this->normalizeThemePresetValue($decoded['themePreset'] ?? ''),
			'shellLayout' => $this->normalizeShellLayoutValue($decoded['shellLayout'] ?? ''),
			'sidebarCollapsed' => $this->normalizeSidebarCollapsedValue($decoded['sidebarCollapsed'] ?? false),
			'updatedAt' => is_string($decoded['updatedAt'] ?? null) ? $decoded['updatedAt'] : '',
		];
	}

	/**
	 * Reconcile user preferences against currently registered and accessible workspaces and widgets.
	 *
	 * Automatically strips stale workspace or widget IDs (e.g., when a module is uninstalled or access is revoked),
	 * appends newly available widgets in their default order, and persists the cleaned state if stale entries were pruned.
	 * When `$accessibleWidgets` is `null` (non-dashboard navigation requests), widget preferences are preserved as-is
	 * without requiring `WorkspaceWidgetRegistry` discovery or widget callback evaluation.
	 *
	 * @param array<string, mixed> $accessibleWorkspaces
	 * @param array<string, mixed>|null $accessibleWidgets
	 * @return array{
	 *     userId: int,
	 *     favorites: list<string>,
	 *     widgetOrder: list<string>,
	 *     hiddenWidgets: list<string>,
	 *     widgetSizes: array<string, string>,
	 *     themeMode: string,
	 *     themePreset: string,
	 *     shellLayout: string,
	 *     sidebarCollapsed: bool,
	 *     updatedAt: string
	 * }
	 */
	public function reconcile(array $accessibleWorkspaces, ?array $accessibleWidgets = null, ?User $user = null): array
	{
		$prefs = $this->load($user);

		$validWorkspaceIds = [];
		foreach ($accessibleWorkspaces as $key => $ws) {
			$id = is_array($ws) && isset($ws['id']) ? strtolower(trim((string) $ws['id'])) : strtolower(trim((string) $key));
			if ($id !== '') {
				$validWorkspaceIds[$id] = true;
			}
		}

		$favorites = array_values(array_filter(
			$prefs['favorites'],
			static fn(string $id): bool => isset($validWorkspaceIds[$id])
		));

		if ($accessibleWidgets === null) {
			$wasPruned = count($favorites) !== count($prefs['favorites']);
			if ($wasPruned && $prefs['userId'] > 0 && is_file($this->filePath($user))) {
				$this->write($prefs['userId'], [
					'favorites' => $favorites,
					'widgetOrder' => $prefs['widgetOrder'],
					'hiddenWidgets' => $prefs['hiddenWidgets'],
					'widgetSizes' => $prefs['widgetSizes'],
					'themeMode' => $prefs['themeMode'],
					'themePreset' => $prefs['themePreset'],
					'shellLayout' => $prefs['shellLayout'],
					'sidebarCollapsed' => $prefs['sidebarCollapsed'],
				]);
			}

			return [
				'userId' => $prefs['userId'],
				'favorites' => $favorites,
				'widgetOrder' => $prefs['widgetOrder'],
				'hiddenWidgets' => $prefs['hiddenWidgets'],
				'widgetSizes' => $prefs['widgetSizes'],
				'themeMode' => $prefs['themeMode'],
				'themePreset' => $prefs['themePreset'],
				'shellLayout' => $prefs['shellLayout'],
				'sidebarCollapsed' => $prefs['sidebarCollapsed'],
				'updatedAt' => $prefs['updatedAt'],
			];
		}

		$validWidgetIds = [];
		foreach ($accessibleWidgets as $key => $widget) {
			$id = is_array($widget) && isset($widget['id']) ? strtolower(trim((string) $widget['id'])) : strtolower(trim((string) $key));
			if ($id !== '') {
				$validWidgetIds[$id] = true;
			}
		}

		$widgetOrder = array_values(array_filter(
			$prefs['widgetOrder'],
			static fn(string $id): bool => isset($validWidgetIds[$id])
		));

		$hiddenWidgets = array_values(array_filter(
			$prefs['hiddenWidgets'],
			static fn(string $id): bool => isset($validWidgetIds[$id])
		));

		$widgetSizes = [];
		foreach ($prefs['widgetSizes'] as $wId => $size) {
			if (isset($validWidgetIds[$wId])) {
				$widgetSizes[$wId] = $size;
			}
		}

		// Persist cleaned preferences if stale IDs from uninstalled modules were pruned
		$wasPruned = count($favorites) !== count($prefs['favorites'])
			|| count($widgetOrder) !== count($prefs['widgetOrder'])
			|| count($hiddenWidgets) !== count($prefs['hiddenWidgets'])
			|| count($widgetSizes) !== count($prefs['widgetSizes']);

		if ($wasPruned && $prefs['userId'] > 0 && is_file($this->filePath($user))) {
			$this->write($prefs['userId'], [
				'favorites' => $favorites,
				'widgetOrder' => $widgetOrder,
				'hiddenWidgets' => $hiddenWidgets,
				'widgetSizes' => $widgetSizes,
				'themeMode' => $prefs['themeMode'],
				'themePreset' => $prefs['themePreset'],
				'shellLayout' => $prefs['shellLayout'],
				'sidebarCollapsed' => $prefs['sidebarCollapsed'],
			]);
		}

		// Append any newly installed/accessible widgets that aren't in the user's explicit order yet
		$orderedSet = array_flip($widgetOrder);
		foreach (array_keys($validWidgetIds) as $wId) {
			if (!isset($orderedSet[$wId])) {
				$widgetOrder[] = $wId;
			}
		}

		return [
			'userId' => $prefs['userId'],
			'favorites' => $favorites,
			'widgetOrder' => $widgetOrder,
			'hiddenWidgets' => $hiddenWidgets,
			'widgetSizes' => $widgetSizes,
			'themeMode' => $prefs['themeMode'],
			'themePreset' => $prefs['themePreset'],
			'shellLayout' => $prefs['shellLayout'],
			'sidebarCollapsed' => $prefs['sidebarCollapsed'],
			'updatedAt' => $prefs['updatedAt'],
		];
	}

	/**
	 * Toggle a workspace ID in the user's `favorites` list.
	 *
	 * @return array<string, mixed>
	 */
	public function toggleFavorite(string $workspaceId, ?User $user = null): array
	{
		$cleanId = $this->sanitizeId($workspaceId);
		$prefs = $this->load($user);
		if ($cleanId === '' || $prefs['userId'] <= 0) {
			return $prefs;
		}

		$favorites = $prefs['favorites'];
		if (in_array($cleanId, $favorites, true)) {
			$favorites = array_values(array_filter($favorites, static fn(string $id): bool => $id !== $cleanId));
		} else {
			$favorites[] = $cleanId;
		}

		return $this->write($prefs['userId'], array_merge($prefs, ['favorites' => $favorites]));
	}

	/**
	 * Toggle or explicitly set visibility for a dashboard widget.
	 *
	 * @return array<string, mixed>
	 */
	public function toggleWidgetVisibility(string $widgetId, ?bool $visible = null, ?User $user = null): array
	{
		$cleanId = $this->sanitizeId($widgetId);
		$prefs = $this->load($user);
		if ($cleanId === '' || $prefs['userId'] <= 0) {
			return $prefs;
		}

		$hidden = $prefs['hiddenWidgets'];
		$isCurrentlyHidden = in_array($cleanId, $hidden, true);
		$shouldHide = $visible !== null ? !$visible : !$isCurrentlyHidden;

		if ($shouldHide && !$isCurrentlyHidden) {
			$hidden[] = $cleanId;
		} elseif (!$shouldHide && $isCurrentlyHidden) {
			$hidden = array_values(array_filter($hidden, static fn(string $id): bool => $id !== $cleanId));
		}

		return $this->write($prefs['userId'], array_merge($prefs, ['hiddenWidgets' => $hidden]));
	}

	/**
	 * Save a new widget order for `$user`.
	 *
	 * @param array<int, mixed> $widgetOrder
	 * @return array<string, mixed>
	 */
	public function reorderWidgets(array $widgetOrder, ?User $user = null): array
	{
		$prefs = $this->load($user);
		if ($prefs['userId'] <= 0) {
			return $prefs;
		}

		return $this->write($prefs['userId'], array_merge($prefs, [
			'widgetOrder' => $this->normalizeIdList($widgetOrder),
		]));
	}

	/**
	 * Set the display size (`'sm'|'md'|'lg'|'full'` or 12-column span `'1'..'12'`) for a widget.
	 *
	 * @return array<string, mixed>
	 */
	public function setWidgetSize(string $widgetId, string|int $size, ?User $user = null): array
	{
		$cleanId = $this->sanitizeId($widgetId);
		$normSize = $this->normalizeWidgetSizeValue((string) $size);
		$prefs = $this->load($user);
		if ($cleanId === '' || $prefs['userId'] <= 0 || $normSize === null) {
			return $prefs;
		}

		$sizes = $prefs['widgetSizes'];
		$sizes[$cleanId] = $normSize;

		return $this->write($prefs['userId'], array_merge($prefs, ['widgetSizes' => $sizes]));
	}

	/**
	 * Save the per-user theme mode (`'light' | 'dark' | 'system'` or `''`) in `{user-id}.json`.
	 *
	 * @return array<string, mixed>
	 */
	public function setThemeMode(string $mode, ?User $user = null): array
	{
		$prefs = $this->load($user);
		if ($prefs['userId'] <= 0) {
			return $prefs;
		}

		return $this->write($prefs['userId'], array_merge($prefs, [
			'themeMode' => $this->normalizeThemeModeValue($mode),
		]));
	}

	/**
	 * Save the per-user color preset override (or `''` to revert to site default) in `{user-id}.json`.
	 *
	 * @return array<string, mixed>
	 */
	public function setThemePreset(string $preset, ?User $user = null): array
	{
		$prefs = $this->load($user);
		if ($prefs['userId'] <= 0) {
			return $prefs;
		}

		return $this->write($prefs['userId'], array_merge($prefs, [
			'themePreset' => $this->normalizeThemePresetValue($preset),
		]));
	}

	/**
	 * Save the per-user shell layout override (or `''` to revert to site default) in `{user-id}.json`.
	 *
	 * @return array<string, mixed>
	 */
	public function setShellLayout(string $layout, ?User $user = null): array
	{
		$prefs = $this->load($user);
		if ($prefs['userId'] <= 0) {
			return $prefs;
		}

		return $this->write($prefs['userId'], array_merge($prefs, [
			'shellLayout' => $this->normalizeShellLayoutValue($layout),
		]));
	}

	/**
	 * Save the per-user sidebar collapsed state in `{user-id}.json`.
	 *
	 * @return array<string, mixed>
	 */
	public function setSidebarCollapsed(bool $collapsed, ?User $user = null): array
	{
		$prefs = $this->load($user);
		if ($prefs['userId'] <= 0) {
			return $prefs;
		}

		return $this->write($prefs['userId'], array_merge($prefs, [
			'sidebarCollapsed' => $collapsed,
		]));
	}

	/**
	 * Bulk-update multiple preference keys at once (`favorites`, `widgetOrder`, `hiddenWidgets`, `widgetSizes`, `themeMode`, `themePreset`, `shellLayout`, `sidebarCollapsed`).
	 *
	 * @param array<string, mixed> $updates
	 * @return array<string, mixed>
	 */
	public function savePreferences(array $updates, ?User $user = null): array
	{
		$prefs = $this->load($user);
		if ($prefs['userId'] <= 0) {
			return $prefs;
		}

		if (array_key_exists('favorites', $updates)) {
			$prefs['favorites'] = $this->normalizeIdList($updates['favorites']);
		}
		if (array_key_exists('widgetOrder', $updates)) {
			$prefs['widgetOrder'] = $this->normalizeIdList($updates['widgetOrder']);
		}
		if (array_key_exists('hiddenWidgets', $updates)) {
			$prefs['hiddenWidgets'] = $this->normalizeIdList($updates['hiddenWidgets']);
		}
		if (array_key_exists('widgetSizes', $updates)) {
			$prefs['widgetSizes'] = $this->normalizeSizeMap($updates['widgetSizes']);
		}
		if (array_key_exists('themeMode', $updates)) {
			$prefs['themeMode'] = $this->normalizeThemeModeValue($updates['themeMode']);
		}
		if (array_key_exists('themePreset', $updates)) {
			$prefs['themePreset'] = $this->normalizeThemePresetValue($updates['themePreset']);
		}
		if (array_key_exists('shellLayout', $updates)) {
			$prefs['shellLayout'] = $this->normalizeShellLayoutValue($updates['shellLayout']);
		}
		if (array_key_exists('sidebarCollapsed', $updates)) {
			$prefs['sidebarCollapsed'] = $this->normalizeSidebarCollapsedValue($updates['sidebarCollapsed']);
		}

		return $this->write($prefs['userId'], $prefs);
	}

	public const PRESET_SCHEMA = 'processwire.react-workspace.layout.v1';

	/**
	 * Export a portable, versioned dashboard layout preset JSON array for `$user`.
	 *
	 * @param array<string, mixed> $accessibleWorkspaces
	 * @param array<string, mixed>|null $accessibleWidgets
	 * @return array{
	 *     schema: string,
	 *     exportedAt: string,
	 *     layout: array{
	 *         favorites: list<string>,
	 *         widgetOrder: list<string>,
	 *         hiddenWidgets: list<string>,
	 *         widgetSizes: array<string, string>,
	 *         shellLayout: string,
	 *         sidebarCollapsed: bool
	 *     }
	 * }
	 */
	public function exportPreset(array $accessibleWorkspaces, ?array $accessibleWidgets = null, ?User $user = null): array
	{
		$reconciled = $this->reconcile($accessibleWorkspaces, $accessibleWidgets, $user);

		return [
			'schema' => self::PRESET_SCHEMA,
			'exportedAt' => gmdate('c'),
			'layout' => [
				'favorites' => $reconciled['favorites'],
				'widgetOrder' => $reconciled['widgetOrder'],
				'hiddenWidgets' => $reconciled['hiddenWidgets'],
				'widgetSizes' => $reconciled['widgetSizes'],
				'shellLayout' => $reconciled['shellLayout'],
				'sidebarCollapsed' => $reconciled['sidebarCollapsed'],
			],
		];
	}

	/**
	 * Validate and import a dashboard layout preset envelope (or flat layout map) for `$user`.
	 *
	 * @param array<string, mixed> $presetPayload
	 * @return array<string, mixed>
	 * @throws \InvalidArgumentException When no recognized layout keys exist in `$presetPayload`.
	 */
	public function importPreset(array $presetPayload, ?User $user = null): array
	{
		$layout = isset($presetPayload['layout']) && is_array($presetPayload['layout'])
			? $presetPayload['layout']
			: $presetPayload;

		$recognizedKeys = ['favorites', 'widgetOrder', 'hiddenWidgets', 'widgetSizes'];
		$hasRecognized = false;
		foreach ($recognizedKeys as $key) {
			if (array_key_exists($key, $layout) && is_array($layout[$key])) {
				$hasRecognized = true;
				break;
			}
		}
		if (
			!$hasRecognized
			&& (
				(array_key_exists('shellLayout', $layout) && is_string($layout['shellLayout']))
				|| (array_key_exists('sidebarCollapsed', $layout) && is_bool($layout['sidebarCollapsed']))
			)
		) {
			$hasRecognized = true;
		}

		if (!$hasRecognized) {
			throw new \InvalidArgumentException('Invalid dashboard layout preset JSON: expected layout keys (favorites, widgetOrder, hiddenWidgets, or widgetSizes).');
		}

		$updates = [
			'favorites' => array_key_exists('favorites', $layout) ? $this->normalizeIdList($layout['favorites']) : [],
			'widgetOrder' => array_key_exists('widgetOrder', $layout) ? $this->normalizeIdList($layout['widgetOrder']) : [],
			'hiddenWidgets' => array_key_exists('hiddenWidgets', $layout) ? $this->normalizeIdList($layout['hiddenWidgets']) : [],
			'widgetSizes' => array_key_exists('widgetSizes', $layout) ? $this->normalizeSizeMap($layout['widgetSizes']) : [],
		];
		if (array_key_exists('shellLayout', $layout)) {
			$updates['shellLayout'] = $this->normalizeShellLayoutValue($layout['shellLayout']);
		}
		if (array_key_exists('sidebarCollapsed', $layout)) {
			$updates['sidebarCollapsed'] = $this->normalizeSidebarCollapsedValue($layout['sidebarCollapsed']);
		}

		return $this->savePreferences($updates, $user);
	}

	/**
	 * Reset preferences for `$user` and delete their `{user-id}.json` file.
	 *
	 * @return array<string, mixed>
	 */
	public function reset(?User $user = null): array
	{
		$userId = $this->resolveUserId($user);
		$path = $this->filePath($user);
		if ($path !== '' && is_file($path)) {
			@unlink($path);
		}

		return array_merge(self::DEFAULT_PREFERENCES, [
			'userId' => $userId,
		]);
	}

	/**
	 * Remove the entire `site/assets/cache/React/workspaces/` preference directory on module uninstall.
	 */
	public function purgeAll(): void
	{
		$dir = $this->directoryPath();
		if (!is_dir($dir)) {
			return;
		}

		try {
			$this->wire()->files->rmdir($dir, true);

			return;
		} catch (\Throwable) {
			// Fallback below
		}

		foreach (glob($dir . '*.json') ?: [] as $file) {
			if (is_file($file)) {
				@unlink($file);
			}
		}
		@rmdir($dir);
	}

	/**
	 * @param array<string, mixed> $data
	 * @return array{
	 *     userId: int,
	 *     favorites: list<string>,
	 *     widgetOrder: list<string>,
	 *     hiddenWidgets: list<string>,
	 *     widgetSizes: array<string, string>,
	 *     themeMode: string,
	 *     themePreset: string,
	 *     shellLayout: string,
	 *     sidebarCollapsed: bool,
	 *     updatedAt: string
	 * }
	 */
	private function write(int $userId, array $data): array
	{
		$payload = [
			'userId' => $userId,
			'favorites' => $this->normalizeIdList($data['favorites'] ?? []),
			'widgetOrder' => $this->normalizeIdList($data['widgetOrder'] ?? []),
			'hiddenWidgets' => $this->normalizeIdList($data['hiddenWidgets'] ?? []),
			'widgetSizes' => $this->normalizeSizeMap($data['widgetSizes'] ?? []),
			'themeMode' => $this->normalizeThemeModeValue($data['themeMode'] ?? ''),
			'themePreset' => $this->normalizeThemePresetValue($data['themePreset'] ?? ''),
			'shellLayout' => $this->normalizeShellLayoutValue($data['shellLayout'] ?? ''),
			'sidebarCollapsed' => $this->normalizeSidebarCollapsedValue($data['sidebarCollapsed'] ?? false),
			'updatedAt' => gmdate('c'),
		];

		$dir = $this->directoryPath();
		if (!is_dir($dir)) {
			$this->wire()->files->mkdir($dir, true);
		}

		$path = $dir . $userId . '.json';
		if (is_link($path) || is_link(rtrim($dir, '/\\'))) {
			return $payload;
		}
		$encoded = (string) json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		@file_put_contents($path, $encoded, LOCK_EX);

		return $payload;
	}

	private function resolveUserId(?User $user = null): int
	{
		$resolved = $user ?? $this->wire()->user;
		$id = (int) $resolved->id;
		if ($id <= 0 || !AccessGuard::isAuthenticatedOrSuperuser($resolved)) {
			return 0;
		}

		return $id;
	}

	private function sanitizeId(string $raw): string
	{
		$clean = strtolower(trim($raw));

		return substr((string) preg_replace('/[^a-z0-9_-]/', '', $clean), 0, self::MAX_ID_LENGTH);
	}

	/**
	 * @return list<string>
	 */
	private function normalizeIdList(mixed $raw): array
	{
		if (!is_array($raw)) {
			return [];
		}

		$seen = [];
		$list = [];
		foreach ($raw as $val) {
			if (count($list) >= self::MAX_PREF_ITEMS) {
				break;
			}
			if (!is_scalar($val)) {
				continue;
			}
			$clean = $this->sanitizeId((string) $val);
			if ($clean !== '' && !isset($seen[$clean])) {
				$seen[$clean] = true;
				$list[] = $clean;
			}
		}

		return $list;
	}

	/**
	 * @return array<string, string>
	 */
	private function normalizeSizeMap(mixed $raw): array
	{
		if (!is_array($raw)) {
			return [];
		}

		$map = [];
		foreach ($raw as $key => $val) {
			if (count($map) >= self::MAX_PREF_ITEMS && !array_key_exists((string) $key, $map)) {
				break;
			}
			if (!is_scalar($val)) {
				continue;
			}
			$cleanId = $this->sanitizeId((string) $key);
			$normSize = $this->normalizeWidgetSizeValue((string) $val);
			if ($cleanId !== '' && $normSize !== null) {
				$map[$cleanId] = $normSize;
			}
		}

		return $map;
	}

	/**
	 * Normalize a widget size token (`'sm'|'md'|'lg'|'full'` or 12-column span `'1'..'12'`).
	 */
	private function normalizeWidgetSizeValue(string $raw): ?string
	{
		$norm = strtolower(trim($raw));
		if (in_array($norm, ['sm', 'md', 'lg', 'full'], true)) {
			return $norm;
		}
		if (preg_match('/^\d{1,2}$/', $norm) === 1) {
			$span = (int) $norm;
			if ($span >= 1 && $span <= 12) {
				return (string) $span;
			}
		}

		return null;
	}

	private function normalizeThemeModeValue(mixed $raw): string
	{
		if (!is_string($raw) && !is_int($raw)) {
			return '';
		}
		$norm = strtolower(trim((string) $raw));
		if ($norm === 'auto' || $norm === '-1') {
			return 'system';
		}
		if ($norm === '1') {
			return 'dark';
		}
		if ($norm === '0') {
			return 'light';
		}

		return in_array($norm, ['light', 'dark', 'system'], true) ? $norm : '';
	}

	private function normalizeThemePresetValue(mixed $raw): string
	{
		if (!is_string($raw)) {
			return '';
		}
		$norm = strtolower(trim($raw));
		if ($norm === '' || $norm === 'default') {
			return '';
		}
		$preset = ThemePreset::tryFrom($norm);

		return $preset !== null ? $preset->value : '';
	}

	private function normalizeShellLayoutValue(mixed $raw): string
	{
		if (!is_string($raw)) {
			return '';
		}
		$norm = strtolower(trim($raw));
		if ($norm === '' || $norm === 'default') {
			return '';
		}

		return preg_match(self::SHELL_LAYOUT_PATTERN, $norm) === 1 ? $norm : '';
	}

	private function normalizeSidebarCollapsedValue(mixed $raw): bool
	{
		return is_bool($raw) ? $raw : false;
	}
}
