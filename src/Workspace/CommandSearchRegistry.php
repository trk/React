<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

use ProcessWire\NullPage;
use ProcessWire\Page;
use ProcessWire\Template;
use ProcessWire\User;
use ProcessWire\Wire;
use Totoglu\React\Security\AccessGuard;
use Totoglu\React\Security\UrlSanitizer;

/**
 * Extensible, RBAC-scoped registry of command palette search providers (`/_react/command-search`).
 *
 * Modules register search callbacks lazily via `React::deferCommandSearchRegistration()`.
 */
final class CommandSearchRegistry extends Wire
{
	public const string ID_PATTERN = '/^[a-z0-9_-]{1,64}$/';

	/**
	 * @var array<string, array{
	 *     id: string,
	 *     label: string,
	 *     permission: string,
	 *     order: int,
	 *     searchFn: callable
	 * }>
	 */
	private array $providers = [];

	private bool $defaultsBooted = false;

	/**
	 * Register or update a command search provider callback.
	 *
	 * @param callable $searchFn Callback receiving `(string $query, User $user, int $limit): iterable`
	 * @param array{permission?: string, label?: string, order?: int} $options
	 */
	public function register(string $id, callable $searchFn, array $options = []): self
	{
		$this->bootDefaults();

		$cleanId = strtolower(trim($id));
		if ($cleanId === '' || preg_match(self::ID_PATTERN, $cleanId) !== 1) {
			return $this;
		}

		$permission = is_string($options['permission'] ?? null) ? trim($options['permission']) : '';
		$label = is_string($options['label'] ?? null) ? self::sanitizePlainText($options['label'], 80) : '';
		$order = isset($options['order']) && is_numeric($options['order']) ? (int) $options['order'] : 100;

		$this->providers[$cleanId] = [
			'id' => $cleanId,
			'label' => $label,
			'permission' => $permission,
			'order' => $order,
			'searchFn' => $searchFn,
		];

		return $this;
	}

	/**
	 * Remove a registered command search provider by ID.
	 */
	public function unregister(string $id): self
	{
		$this->bootDefaults();
		unset($this->providers[strtolower(trim($id))]);

		return $this;
	}

	/**
	 * Determine whether a command search provider ID is registered.
	 */
	public function has(string $id): bool
	{
		$this->bootDefaults();
		$cleanId = strtolower(trim($id));

		return $cleanId !== '' && isset($this->providers[$cleanId]);
	}

	/**
	 * Return registered provider IDs sorted by `order` ASC.
	 *
	 * @return list<string>
	 */
	public function providerIds(): array
	{
		$this->bootDefaults();

		return array_keys($this->sortedProviders());
	}

	/**
	 * Execute eligible command search providers and return normalized, sanitized result items.
	 *
	 * @return list<array{
	 *     id: string,
	 *     label: string,
	 *     subtitle: string,
	 *     badge: string,
	 *     group: string,
	 *     icon: string,
	 *     href: string,
	 *     isInertia: bool
	 * }>
	 */
	public function search(string $query, ?User $user = null, int $limit = 16, int $perProviderLimit = 5): array
	{
		$this->bootDefaults();

		$q = trim($query);
		if (mb_strlen($q, 'UTF-8') < 2) {
			return [];
		}
		$q = mb_substr($q, 0, 80, 'UTF-8');

		$resolvedUser = $user ?? $this->wire()->user;
		if (!$resolvedUser instanceof User || !AccessGuard::isAuthenticatedOrSuperuser($resolvedUser)) {
			return [];
		}

		$totalCap = min(20, max(1, $limit));
		$providerCap = min(5, max(1, $perProviderLimit));
		$isSuperuser = (bool) $resolvedUser->isSuperuser();
		$defaultGroup = $this->_('Records');

		$users = $this->wire()->users;
		$previousUser = $this->wire()->user;
		$switchedUser = false;
		if ($previousUser !== $resolvedUser) {
			$users->setCurrentUser($resolvedUser);
			$switchedUser = true;
		}

		$results = [];

		try {
			foreach ($this->sortedProviders() as $providerId => $provider) {
				if (count($results) >= $totalCap) {
					break;
				}

				$requiredPermission = $provider['permission'];
				if ($requiredPermission !== '' && !$isSuperuser && !$resolvedUser->hasPermission($requiredPermission)) {
					continue;
				}

				try {
					$rawItems = ($provider['searchFn'])($q, $resolvedUser, $providerCap);
				} catch (\Throwable) {
					continue;
				}

				if (!is_iterable($rawItems)) {
					continue;
				}

				$fallbackGroup = $provider['label'] !== '' ? $provider['label'] : $defaultGroup;
				$providerCount = 0;

				foreach ($rawItems as $rawItem) {
					if (!is_array($rawItem)) {
						continue;
					}

					$normalized = $this->normalizeItem($rawItem, $providerId, $providerCount, $fallbackGroup);
					if ($normalized === null) {
						continue;
					}

					$results[] = $normalized;
					$providerCount++;

					if ($providerCount >= $providerCap || count($results) >= $totalCap) {
						break;
					}
				}
			}
		} finally {
			if ($switchedUser) {
				$users->setCurrentUser($previousUser);
			}
		}

		return $results;
	}

	/**
	 * @return array<string, array{
	 *     id: string,
	 *     label: string,
	 *     permission: string,
	 *     order: int,
	 *     searchFn: callable
	 * }>
	 */
	private function sortedProviders(): array
	{
		$items = $this->providers;
		uasort($items, static fn(array $a, array $b): int => $a['order'] <=> $b['order']);

		return $items;
	}

	/**
	 * @param array<string, mixed> $raw
	 * @return array{
	 *     id: string,
	 *     label: string,
	 *     subtitle: string,
	 *     badge: string,
	 *     group: string,
	 *     icon: string,
	 *     href: string,
	 *     isInertia: bool
	 * }|null
	 */
	private function normalizeItem(array $raw, string $providerId, int $index, string $fallbackGroup): ?array
	{
		$label = is_string($raw['label'] ?? null) || is_numeric($raw['label'] ?? null)
			? self::sanitizePlainText((string) $raw['label'], 120)
			: '';
		if ($label === '') {
			return null;
		}

		$rawHref = is_string($raw['href'] ?? null) ? $raw['href'] : '';
		$safeHref = UrlSanitizer::sanitizeSameOriginUrl($rawHref);
		if ($safeHref === '') {
			return null;
		}

		$rawId = is_string($raw['id'] ?? null) || is_numeric($raw['id'] ?? null)
			? trim((string) $raw['id'])
			: '';
		$id = $rawId !== '' ? mb_substr($rawId, 0, 120, 'UTF-8') : ($providerId . '-' . $index);

		$subtitle = is_string($raw['subtitle'] ?? null) || is_numeric($raw['subtitle'] ?? null)
			? self::sanitizePlainText((string) $raw['subtitle'], 140)
			: '';

		$badge = is_string($raw['badge'] ?? null) || is_numeric($raw['badge'] ?? null)
			? self::sanitizePlainText((string) $raw['badge'], 40)
			: '';

		$group = is_string($raw['group'] ?? null) ? self::sanitizePlainText($raw['group'], 80) : '';
		if ($group === '') {
			$group = $fallbackGroup !== '' ? $fallbackGroup : 'Records';
		}

		$rawIcon = is_string($raw['icon'] ?? null) ? strtolower(trim($raw['icon'])) : '';
		$icon = preg_match('/^[a-z0-9-]+$/', $rawIcon) === 1 ? $rawIcon : 'file-text';

		$isInertia = array_key_exists('isInertia', $raw) ? (bool) $raw['isInertia'] : true;

		return [
			'id' => $id,
			'label' => $label,
			'subtitle' => $subtitle,
			'badge' => $badge,
			'group' => $group,
			'icon' => $icon,
			'href' => $safeHref,
			'isInertia' => $isInertia,
		];
	}

	private static function sanitizePlainText(string $raw, int $maxLength): string
	{
		$decoded = html_entity_decode($raw, ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$stripped = strip_tags($decoded);
		$collapsed = (string) preg_replace('/\s+/u', ' ', trim($stripped));
		if ($collapsed === '') {
			return '';
		}

		return mb_substr($collapsed, 0, $maxLength, 'UTF-8');
	}

	private function bootDefaults(): void
	{
		if ($this->defaultsBooted) {
			return;
		}
		$this->defaultsBooted = true;

		$this->register('pages', function (string $query, User $user, int $limit): array {
			$wire = $this->wire();
			$pages = $wire->pages;
			$sanitizer = $wire->sanitizer;
			$config = $wire->config;

			$adminId = (int) ($config->adminRootPageID ?: 2);
			$trashId = (int) ($config->trashPageID ?: 7);
			$http404Id = (int) ($config->http404PageID ?: 27);
			$adminUrl = rtrim((string) ($config->urls->admin ?: '/processwire/'), '/') . '/';

			$selector = sprintf(
				'title|name%%=%s, has_parent!=%d, has_parent!=%d, id!=%d|%d|%d, include=unpublished, limit=10',
				$sanitizer->selectorValue($query),
				$adminId,
				$trashId,
				$adminId,
				$trashId,
				$http404Id
			);

			$found = $pages->find($selector);
			$items = [];
			foreach ($found as $p) {
				if (!$p instanceof Page || $p instanceof NullPage || !$p->editable()) {
					continue;
				}
				$tpl = $p->template instanceof Template ? $p->template : null;
				$tplBadge = '';
				if ($tpl !== null) {
					$tplLabel = trim((string) $tpl->label);
					$tplBadge = $tplLabel !== '' ? $tplLabel : (string) $tpl->name;
				}
				$rawTitle = trim((string) $p->getUnformatted('title'));
				if ($rawTitle === '') {
					$rawTitle = trim((string) ($p->title ?: $p->name));
				}
				$items[] = [
					'id' => 'page-' . (int) $p->id,
					'label' => $rawTitle,
					'subtitle' => (string) $p->path,
					'badge' => $tplBadge,
					'icon' => 'file-text',
					'href' => $adminUrl . 'page/edit/?id=' . (int) $p->id,
					'isInertia' => false,
				];
				if (count($items) >= $limit) {
					break;
				}
			}

			return $items;
		}, [
			'permission' => 'page-edit',
			'label' => $this->_('Pages'),
			'order' => 900,
		]);
	}
}
