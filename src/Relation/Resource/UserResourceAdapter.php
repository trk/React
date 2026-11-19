<?php

declare(strict_types=1);

namespace Totoglu\React\Relation\Resource;

use ProcessWire\NullPage;
use ProcessWire\Role;
use ProcessWire\Selectors;
use ProcessWire\User;
use Totoglu\React\Provider\PagesDataProvider;
use Totoglu\React\Relation\RelationItem;

/**
 * UserResourceAdapter
 *
 * Relational resource adapter for ProcessWire `User` accounts (`resource: 'user'`).
 * Enforces RBAC so only authorized administrators/editors can query user records,
 * and exposes safe display labels without leaking password hashes or private tokens.
 */
final class UserResourceAdapter extends AbstractRelationResource
{
	public function name(): string
	{
		return 'user';
	}

	public function label(): string
	{
		return $this->_('User');
	}

	public function icon(): string
	{
		return 'user';
	}

	public function defaultValueField(): string
	{
		return 'id';
	}

	/**
	 * @param array<string, mixed> $params
	 * @param array<string, mixed> $config
	 * @return array{items: list<RelationItem>, total: int, hasMore: bool}
	 */
	public function query(array $params = [], array $config = []): array
	{
		if (!$this->canListUsers()) {
			return ['items' => [], 'total' => 0, 'hasMore' => false];
		}
		$users = $this->wire()->users;

		$page = max(1, (int) ($params['page'] ?? 1));
		$limit = max(1, min(100, (int) ($params['limit'] ?? $config['limit'] ?? 25)));
		$start = ($page - 1) * $limit;

		$clauses = $this->buildSelectorClauses($config, $params);
		$q = trim((string) ($params['q'] ?? ''));
		if ($q !== '') {
			$safeQ = $this->sanitizeSelectorValue($q);
			$canViewEmail = $this->canViewUserEmail();
			if (ctype_digit($q) && (int) $q > 0) {
				$clauses[] = ($canViewEmail ? 'id|name|email%=' : 'id|name%=') . $safeQ;
			} else {
				$clauses[] = ($canViewEmail ? 'name|email%=' : 'name%=') . $safeQ;
			}
		}

		if (isset($params['exclude']) && is_array($params['exclude']) && $params['exclude'] !== []) {
			$exIds = [];
			foreach ($params['exclude'] as $ex) {
				if (is_numeric($ex) && (int) $ex > 0) {
					$exIds[] = (int) $ex;
				}
			}
			if ($exIds !== []) {
				$clauses[] = 'id!=' . implode('|', $exIds);
			}
		}

		$clauses[] = 'sort=name';
		$clauses[] = "start={$start}";
		$clauses[] = "limit={$limit}";

		$found = $users->find(implode(', ', $clauses));
		$total = (int) $found->getTotal();

		$items = [];
		foreach ($found as $u) {
			if (!$u instanceof User || $u instanceof NullPage || (int) $u->id <= 0) {
				continue;
			}
			$items[] = $this->toRelationItem($u, $config);
		}

		return [
			'items' => $items,
			'total' => $total,
			'hasMore' => ($start + $found->count()) < $total,
		];
	}

	/**
	 * @param list<string|int> $values
	 * @param array<string, mixed> $config
	 * @return list<RelationItem>
	 */
	public function hydrate(array $values, array $config = []): array
	{
		if ($values === [] || !$this->canListUsers()) {
			return [];
		}
		$users = $this->wire()->users;

		$valueField = $this->resolveValueField($config);
		$guestId = (int) ($this->wire()->config->guestUserPageID ?: 40);
		$excludeGuest = ($config['excludeGuest'] ?? true) !== false;
		$excludeSuperuser = !empty($config['excludeSuperuser']);

		/** @var list<array{type: string, key: string}> $orderedRefs */
		$orderedRefs = [];
		/** @var array<int, int> $ids */
		$ids = [];
		/** @var array<string, string> $names */
		$names = [];

		foreach ($values as $rawVal) {
			$strVal = trim((string) $rawVal);
			if ($strVal === '' || $strVal === '0') {
				continue;
			}
			if (ctype_digit($strVal)) {
				if ($valueField === 'name') {
					continue;
				}
				$id = (int) $strVal;
				if ($id > 0) {
					$orderedRefs[] = ['type' => 'id', 'key' => (string) $id];
					$ids[$id] = $id;
				}
			} else {
				if ($valueField === 'id') {
					continue;
				}
				$orderedRefs[] = ['type' => 'name', 'key' => $strVal];
				$names[$strVal] = $strVal;
			}
		}

		if ($orderedRefs === []) {
			return [];
		}

		$hydrateConfig = $config;
		$rawSelector = trim((string) ($config['selector'] ?? ''));
		if ($rawSelector !== '') {
			$selectors = new Selectors($rawSelector);
			$this->wire($selectors);
			$keptSelectorParts = [];
			foreach ($selectors as $sel) {
				$fields = array_map('strtolower', (array) $sel->fields);
				if (array_intersect($fields, ['limit', 'start', 'sort']) !== []) {
					continue;
				}
				$keptSelectorParts[] = (string) $sel;
			}
			$hydrateConfig['selector'] = implode(', ', $keptSelectorParts);
		}

		$clauses = $this->buildSelectorClauses($hydrateConfig);
		$matchGroups = [];
		if ($ids !== []) {
			$matchGroups[] = 'id=' . implode('|', array_values($ids));
		}
		if ($names !== []) {
			$safeNames = array_map(fn(string $n): string => $this->sanitizeSelectorValue($n), array_values($names));
			$matchGroups[] = 'name=' . implode('|', $safeNames);
		}
		if (count($matchGroups) === 1) {
			$clauses[] = $matchGroups[0];
		} else {
			foreach ($matchGroups as $mg) {
				$clauses[] = "_hydrate_match=({$mg})";
			}
		}

		$found = $users->find(implode(', ', $clauses));
		/** @var array<string, User> $byId */
		$byId = [];
		/** @var array<string, User> $byName */
		$byName = [];

		foreach ($found as $u) {
			if (!$u instanceof User || $u instanceof NullPage || (int) $u->id <= 0) {
				continue;
			}
			if ($excludeGuest && ((int) $u->id === $guestId || $u->isGuest() || (string) $u->name === 'guest')) {
				continue;
			}
			if ($excludeSuperuser && $u->isSuperuser()) {
				continue;
			}
			$byId[(string) (int) $u->id] = $u;
			$byName[(string) $u->name] = $u;
		}

		$items = [];
		foreach ($orderedRefs as $ref) {
			$matched = $ref['type'] === 'id' ? ($byId[$ref['key']] ?? null) : ($byName[$ref['key']] ?? null);
			if ($matched instanceof User) {
				$items[] = $this->toRelationItem($matched, $config);
			}
		}

		return $items;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	public function count(array $config = []): int
	{
		if (!$this->canListUsers()) {
			return 0;
		}

		return (int) $this->wire()->users->count(implode(', ', $this->buildSelectorClauses($config)));
	}

	/**
	 * @param array<string, mixed> $config
	 * @param array<string, mixed> $params
	 * @return list<string>
	 */
	private function buildSelectorClauses(array $config, array $params = []): array
	{
		$clauses = ['include=all'];
		$guestId = (int) ($this->wire()->config->guestUserPageID ?: 40);
		if (($config['excludeGuest'] ?? true) !== false) {
			$clauses[] = "id!={$guestId}";
		}
		if (!empty($config['excludeSuperuser'])) {
			$clauses[] = 'roles!=superuser';
		}

		$roles = $this->normalizeStringList($config['roles'] ?? []);
		$depVal = $params['dependsValue'] ?? null;
		if (is_scalar($depVal) && trim((string) $depVal) !== '' && ($config['dependsParam'] ?? 'role') === 'role') {
			$roles = [trim((string) $depVal)];
		}

		if ($roles !== []) {
			$safeRoles = array_map(fn(string $r): string => $this->sanitizeSelectorValue($r), $roles);
			$clauses[] = 'roles=' . implode('|', $safeRoles);
		}

		[$signedSelector] = PagesDataProvider::stripTopLevelPaginationClauses((string) ($config['selector'] ?? ''));
		if ($signedSelector !== '') {
			$clauses[] = $signedSelector;
		}

		return $clauses;
	}

	private function canListUsers(): bool
	{
		$currentUser = $this->wire()->user;
		if ($currentUser->isGuest() || (int) $currentUser->id <= 0) {
			return false;
		}

		return $currentUser->isSuperuser()
			|| (bool) $currentUser->hasPermission('user-admin')
			|| (bool) $currentUser->hasPermission('page-edit');
	}

	private function canViewUserEmail(): bool
	{
		$currentUser = $this->wire()->user;

		return !$currentUser->isGuest()
			&& ($currentUser->isSuperuser() || (bool) $currentUser->hasPermission('user-admin'));
	}

	/**
	 * @param array<string, mixed> $config
	 */
	private function toRelationItem(User $user, array $config): RelationItem
	{
		$valueField = $this->resolveValueField($config);
		$value = $valueField === 'name' ? (string) $user->name : (int) $user->id;

		$roleNames = [];
		if (is_iterable($user->roles)) {
			foreach ($user->roles as $role) {
				if ($role instanceof Role && (string) $role->name !== 'guest') {
					$roleNames[] = (string) $role->name;
				}
			}
		}

		$showEmail = $this->canViewUserEmail();
		$email = $showEmail ? trim((string) ($user->get('email') ?? '')) : '';

		$adminUrl = rtrim((string) ($this->wire()->config->urls->admin ?: '/processwire/'), '/');
		$editUrl = $showEmail ? "{$adminUrl}/access/users/edit/?id=" . (int) $user->id : '';

		return new RelationItem(
			value: $value,
			resource: 'user',
			resourceLabel: $this->label(),
			label: (string) $user->name,
			subtitle: $email !== '' ? $email : '#' . (int) $user->id,
			badge: $roleNames !== [] ? implode(', ', array_slice($roleNames, 0, 2)) : 'user',
			icon: 'user',
			status: $user->hasStatus(User::statusUnpublished) ? 'unpublished' : 'published',
			editUrl: $editUrl,
			meta: [
				'id' => (int) $user->id,
				'name' => (string) $user->name,
				'roles' => $roleNames,
			],
		);
	}
}
