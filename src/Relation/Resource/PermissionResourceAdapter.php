<?php

declare(strict_types=1);

namespace Totoglu\React\Relation\Resource;

use ProcessWire\NullPage;
use ProcessWire\Permission;
use Totoglu\React\Relation\RelationItem;

/**
 * PermissionResourceAdapter
 *
 * Relational resource adapter for ProcessWire RBAC `Permission` definitions (`resource: 'permission'`).
 */
final class PermissionResourceAdapter extends AbstractRelationResource
{
	public function name(): string
	{
		return 'permission';
	}

	public function label(): string
	{
		return $this->_('Permission');
	}

	public function icon(): string
	{
		return 'key';
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

		foreach ($this->collectPermissions($config) as $perm) {
			$item = $this->toRelationItem($perm, $config);
			if (!$this->matchesQuery($q, [$item->label, (string) $perm->name, $item->subtitle])) {
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
		$permissions = $this->wire()->permissions;

		$valueField = $this->resolveValueField($config);
		$prefixes = $this->normalizeStringList($config['prefix'] ?? []);
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
				$perm = $permissions->get((int) $strVal);
			} else {
				if (ctype_digit($strVal)) {
					continue;
				}
				$perm = $permissions->get('name=' . $this->sanitizeSelectorValue($strVal));
			}
			if ($perm instanceof Permission && !$perm instanceof NullPage && (int) $perm->id > 0) {
				if ($prefixes !== []) {
					$permName = (string) $perm->name;
					$matchedPrefix = false;
					foreach ($prefixes as $pfx) {
						if (str_starts_with($permName, $pfx)) {
							$matchedPrefix = true;
							break;
						}
					}
					if (!$matchedPrefix) {
						continue;
					}
				}
				$items[] = $this->toRelationItem($perm, $config);
			}
		}

		return $items;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	public function count(array $config = []): int
	{
		return count($this->collectPermissions($config));
	}

	/**
	 * @param array<string, mixed> $config
	 * @return list<Permission>
	 */
	private function collectPermissions(array $config): array
	{
		$permissions = $this->wire()->permissions;

		$prefixes = $this->normalizeStringList($config['prefix'] ?? []);
		$list = [];

		foreach ($permissions as $perm) {
			if (!$perm instanceof Permission || $perm instanceof NullPage || (int) $perm->id <= 0) {
				continue;
			}
			$permName = (string) $perm->name;
			if ($prefixes !== []) {
				$matchedPrefix = false;
				foreach ($prefixes as $pfx) {
					if (str_starts_with($permName, $pfx)) {
						$matchedPrefix = true;
						break;
					}
				}
				if (!$matchedPrefix) {
					continue;
				}
			}
			$list[] = $perm;
		}

		usort(
			$list,
			static fn(Permission $a, Permission $b): int => strcasecmp((string) $a->name, (string) $b->name)
		);

		return $list;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	private function toRelationItem(Permission $perm, array $config): RelationItem
	{
		$valueField = $this->resolveValueField($config);
		$value = $valueField === 'id' ? (int) $perm->id : (string) $perm->name;

		$title = trim((string) ($perm->getUnformatted('title') ?: $perm->title ?: ''));
		$permName = (string) $perm->name;
		$user = $this->wire()->user;
		$adminUrl = rtrim((string) ($this->wire()->config->urls->admin ?: '/processwire/'), '/');
		$editUrl = $user->isSuperuser()
			? "{$adminUrl}/access/permissions/edit/?id=" . (int) $perm->id
			: '';

		return new RelationItem(
			value: $value,
			resource: 'permission',
			resourceLabel: $this->label(),
			label: $title !== '' ? "{$permName} — {$title}" : $permName,
			subtitle: $title !== '' ? $title : $permName,
			badge: $permName,
			icon: 'key',
			status: 'published',
			editUrl: $editUrl,
			meta: [
				'id' => (int) $perm->id,
				'name' => $permName,
			],
		);
	}
}
