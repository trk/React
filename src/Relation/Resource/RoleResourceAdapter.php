<?php

declare(strict_types=1);

namespace Totoglu\React\Relation\Resource;

use ProcessWire\NullPage;
use ProcessWire\Role;
use Totoglu\React\Relation\RelationItem;

/**
 * RoleResourceAdapter
 *
 * Relational resource adapter for ProcessWire RBAC `Role` definitions (`resource: 'role'`).
 */
final class RoleResourceAdapter extends AbstractRelationResource
{
	public function name(): string
	{
		return 'role';
	}

	public function label(): string
	{
		return $this->_('Role');
	}

	public function icon(): string
	{
		return 'shield';
	}

	public function defaultValueField(): string
	{
		return 'name';
	}

	/**
	 * @param array<string, mixed> $params
	 * @param array<string, mixed> $config
	 * @return array{items: list<RelationItem>, total: int, hasMore: bool}
	 */
	public function query(array $params = [], array $config = []): array
	{
		$q = trim((string) ($params['q'] ?? ''));
		$items = [];

		foreach ($this->collectRoles($config) as $role) {
			$item = $this->toRelationItem($role, $config);
			if (!$this->matchesQuery($q, [$item->label, (string) $role->name, $item->subtitle])) {
				continue;
			}
			$items[] = $item;
		}

		return $this->paginateItems($items, $params, $config);
	}

	/**
	 * @param list<string|int> $values
	 * @param array<string, mixed> $config
	 * @return list<RelationItem>
	 */
	public function hydrate(array $values, array $config = []): array
	{
		if ($values === []) {
			return [];
		}
		$roles = $this->wire()->roles;

		$valueField = $this->resolveValueField($config);
		$excludeGuest = !empty($config['excludeGuest']);
		$excludeSuperuser = !empty($config['excludeSuperuser']);
		$items = [];
		foreach ($values as $rawVal) {
			$strVal = trim((string) $rawVal);
			if ($strVal === '' || $strVal === '0') {
				continue;
			}
			if ($valueField === 'id') {
				if (!ctype_digit($strVal)) {
					continue;
				}
				$role = $roles->get((int) $strVal);
			} else {
				if (ctype_digit($strVal)) {
					continue;
				}
				$role = $roles->get('name=' . $this->sanitizeSelectorValue($strVal));
			}
			if ($role instanceof Role && !$role instanceof NullPage && (int) $role->id > 0) {
				$roleName = (string) $role->name;
				if (($excludeGuest && $roleName === 'guest') || ($excludeSuperuser && $roleName === 'superuser')) {
					continue;
				}
				$items[] = $this->toRelationItem($role, $config);
			}
		}

		return $items;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	public function count(array $config = []): int
	{
		return count($this->collectRoles($config));
	}

	/**
	 * @param array<string, mixed> $config
	 * @return list<Role>
	 */
	private function collectRoles(array $config): array
	{
		$roles = $this->wire()->roles;

		$excludeGuest = !empty($config['excludeGuest']);
		$excludeSuperuser = !empty($config['excludeSuperuser']);
		$list = [];

		foreach ($roles as $role) {
			if (!$role instanceof Role || $role instanceof NullPage || (int) $role->id <= 0) {
				continue;
			}
			$roleName = (string) $role->name;
			if ($excludeGuest && $roleName === 'guest') {
				continue;
			}
			if ($excludeSuperuser && $roleName === 'superuser') {
				continue;
			}
			$list[] = $role;
		}

		usort(
			$list,
			static fn(Role $a, Role $b): int => strcasecmp((string) $a->name, (string) $b->name)
		);

		return $list;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	private function toRelationItem(Role $role, array $config): RelationItem
	{
		$valueField = $this->resolveValueField($config);
		$value = $valueField === 'id' ? (int) $role->id : (string) $role->name;

		$permCount = is_iterable($role->permissions) ? count($role->permissions) : 0;
		$title = trim((string) ($role->title ?: $role->name));
		$user = $this->wire()->user;
		$adminUrl = rtrim((string) ($this->wire()->config->urls->admin ?: '/processwire/'), '/');
		$editUrl = $user->isSuperuser()
			? "{$adminUrl}/access/roles/edit/?id=" . (int) $role->id
			: '';

		return new RelationItem(
			value: $value,
			resource: 'role',
			resourceLabel: $this->label(),
			label: $title,
			subtitle: sprintf($this->_('%d permissions'), $permCount),
			badge: (string) $role->name,
			icon: 'shield',
			status: 'published',
			editUrl: $editUrl,
			meta: [
				'id' => (int) $role->id,
				'name' => (string) $role->name,
				'permissionCount' => $permCount,
			],
		);
	}
}
