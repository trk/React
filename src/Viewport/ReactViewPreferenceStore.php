<?php

declare(strict_types=1);

namespace Totoglu\React\Viewport;

use ProcessWire\WireData;

/**
 * ReactViewPreferenceStore
 *
 * Persists per-user, per-viewport view preferences (active view mode, hidden columns,
 * sort field/direction, page size, and user-saved filter presets) inside the user's
 * ProcessWire session (`ReactViewPrefs`), with optional `$user->meta()` persistence
 * for authenticated users so saved views survive across logins.
 */
class ReactViewPreferenceStore extends WireData
{
	private const SESSION_NAMESPACE = 'ReactViewPrefs';
	private const USER_META_PREFIX = 'react_view_prefs_';
	private const int MAX_SAVED_VIEWS = 50;
	private const int MAX_STORAGE_KEY_LENGTH = 80;

	/**
	 * Load persisted view preferences for a viewport.
	 *
	 * @return array{
	 *   activeView?: string,
	 *   viewMode?: string,
	 *   hiddenColumns?: list<string>,
	 *   sortField?: string,
	 *   sortDirection?: string,
	 *   limit?: int,
	 *   savedViews?: array<string, array{label: string, filters: array<string, mixed>, searchQuery?: string, sortField?: string, sortDirection?: string, viewMode?: string, hiddenColumns?: list<string>}>
	 * }
	 */
	public function load(MarkupReactViewport $component): array
	{
		return self::readPreferences($this, $this->storageKey($component));
	}

	/**
	 * Save updated view preferences for a viewport.
	 *
	 * @param array<string, mixed> $prefs
	 */
	public function save(MarkupReactViewport $component, array $prefs): void
	{
		$key = $this->storageKey($component);
		$user = $this->wire()->user;
		$current = null;
		if ($user->isLoggedin()) {
			try {
				$freshMeta = $user->meta(self::USER_META_PREFIX . $key);
				if (is_array($freshMeta)) {
					$current = $freshMeta;
				}
			} catch (\Throwable) {
				$current = null;
			}
		}
		if ($current === null) {
			$current = $this->load($component);
		}
		$merged = array_replace($current, $prefs);

		$this->wire()->session->setFor(self::SESSION_NAMESPACE, $key, $merged);

		if ($user->isLoggedin() && !(bool) $this->wire()->config->demo) {
			try {
				$user->meta(self::USER_META_PREFIX . $key, $merged);
			} catch (\Throwable) {
				// Ignore if user meta table is unavailable
			}
		}
	}

	/**
	 * Persist the current active view and column/sort preferences from the viewport state.
	 */
	public function setActiveView(MarkupReactViewport $component, string $viewKey): void
	{
		$this->save($component, [
			'activeView' => substr($viewKey, 0, 128),
			'viewMode' => $component->viewMode,
			'hiddenColumns' => array_values($component->hiddenColumns),
			'sortField' => $component->sortField,
			'sortDirection' => $component->sortDirection,
			'limit' => $component->limit,
		]);
	}

	/**
	 * Save a named custom filter/sort/column preset for the current user.
	 */
	public function savePreset(MarkupReactViewport $component, string $key, string $label): void
	{
		$prefs = $this->load($component);
		$savedViews = isset($prefs['savedViews']) && is_array($prefs['savedViews']) ? $prefs['savedViews'] : [];

		$sanitizedKey = substr((string) preg_replace('/[^a-zA-Z0-9_-]/', '_', strtolower(trim($key))), 0, 64);
		$cleanKey = $sanitizedKey !== '' ? $sanitizedKey : ('view_' . substr(md5($label), 0, 8));
		if (!array_key_exists($cleanKey, $savedViews) && count($savedViews) >= self::MAX_SAVED_VIEWS) {
			$savedViews = array_slice($savedViews, -(self::MAX_SAVED_VIEWS - 1), null, true);
		}
		$trimmedLabel = mb_substr(trim($label), 0, 120);
		$savedViews[$cleanKey] = [
			'label' => $trimmedLabel !== '' ? $trimmedLabel : $cleanKey,
			'filters' => $component->filterValues,
			'searchQuery' => $component->searchQuery,
			'sortField' => $component->sortField,
			'sortDirection' => $component->sortDirection,
			'viewMode' => $component->viewMode,
			'hiddenColumns' => array_values($component->hiddenColumns),
		];

		$prefs['savedViews'] = $savedViews;
		$prefs['activeView'] = 'saved:' . $cleanKey;
		$this->save($component, $prefs);
	}

	/**
	 * Delete a user-saved preset by key.
	 */
	public function deletePreset(MarkupReactViewport $component, string $key): void
	{
		$cleanKey = str_starts_with($key, 'saved:') ? substr($key, 6) : $key;
		$prefs = $this->load($component);
		if (isset($prefs['savedViews'][$cleanKey])) {
			unset($prefs['savedViews'][$cleanKey]);
		}
		if (($prefs['activeView'] ?? '') === 'saved:' . $cleanKey) {
			$prefs['activeView'] = 'all';
		}
		$this->save($component, $prefs);
	}

	private function storageKey(MarkupReactViewport $component): string
	{
		$raw = $component->componentId !== ''
			? $component->componentId
			: ($component->provider !== '' ? $component->provider : $component->className());

		return self::normalizeStorageKey($raw);
	}

	private static function normalizeStorageKey(string $raw): string
	{
		$clean = (string) preg_replace('/[^a-zA-Z0-9_-]/', '_', $raw);
		if ($clean === '') {
			return 'default';
		}
		if (strlen($clean) <= self::MAX_STORAGE_KEY_LENGTH) {
			return $clean;
		}

		return substr($clean, 0, 56) . '_' . substr(hash('sha256', $raw), 0, 16);
	}

	/**
	 * Static helper to read persisted session/user view preferences by provider or key string.
	 *
	 * @return array<string, mixed>
	 */
	public static function getSessionViewPreferences(\ProcessWire\Wire $context, string $providerKey): array
	{
		return self::readPreferences($context, self::normalizeStorageKey($providerKey));
	}

	/**
	 * @return array{
	 *   activeView?: string,
	 *   viewMode?: string,
	 *   hiddenColumns?: list<string>,
	 *   sortField?: string,
	 *   sortDirection?: string,
	 *   limit?: int,
	 *   savedViews?: array<string, array{label: string, filters: array<string, mixed>, searchQuery?: string, sortField?: string, sortDirection?: string, viewMode?: string, hiddenColumns?: list<string>}>
	 * }
	 */
	private static function readPreferences(\ProcessWire\Wire $context, string $key): array
	{
		$session = $context->wire()->session;
		$cached = $session->getFor(self::SESSION_NAMESPACE, $key);
		if (is_array($cached)) {
			return $cached;
		}

		$user = $context->wire()->user;
		if ($user->isLoggedin()) {
			try {
				$meta = $user->meta(self::USER_META_PREFIX . $key);
				if (is_array($meta)) {
					$session->setFor(self::SESSION_NAMESPACE, $key, $meta);

					return $meta;
				}
			} catch (\Throwable) {
				// Ignore if user meta table is unavailable
			}
		}

		return [];
	}
}
