<?php

declare(strict_types=1);

namespace Totoglu\React\Relation\Resource;

use Totoglu\React\Relation\RelationItem;

/**
 * ModuleResourceAdapter
 *
 * Relational resource adapter for installed ProcessWire `Module` classes (`resource: 'module'`).
 * Supports filtering by `prefix` (e.g. `'Textformatter'`, `'Inputfield'`, `'Process'`) or `implements`.
 */
final class ModuleResourceAdapter extends AbstractRelationResource
{
	public function name(): string
	{
		return 'module';
	}

	public function label(): string
	{
		return $this->_('Module');
	}

	public function icon(): string
	{
		return 'plug';
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

		foreach ($this->collectModules($config) as $modInfo) {
			$item = $this->toRelationItem($modInfo, $config);
			if (!$this->matchesQuery($q, [$item->label, $modInfo['name'], $item->subtitle])) {
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

		$valueField = $this->resolveValueField($config);
		$indexed = [];
		foreach ($this->collectModules($config) as $modInfo) {
			if ($valueField === 'id') {
				if ($modInfo['id'] > 0) {
					$indexed[(string) $modInfo['id']] = $modInfo;
				}
			} else {
				$indexed[$modInfo['name']] = $modInfo;
			}
		}

		$items = [];
		foreach ($values as $rawVal) {
			$key = trim((string) $rawVal);
			if ($key !== '' && isset($indexed[$key])) {
				$items[] = $this->toRelationItem($indexed[$key], $config);
			}
		}

		return $items;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	public function count(array $config = []): int
	{
		return count($this->collectModules($config));
	}

	/**
	 * @param array<string, mixed> $config
	 * @return list<array{id: int, name: string, title: string, summary: string, icon: string}>
	 */
	private function collectModules(array $config): array
	{
		$modules = $this->wire()->modules;

		$prefixes = $this->normalizeStringList($config['prefix'] ?? []);
		$implementsList = $this->normalizeStringList($config['implements'] ?? []);
		$list = [];

		foreach ($modules as $module) {
			$className = is_object($module) ? (method_exists($module, 'className') ? (string) $module->className() : $module::class) : (string) $module;
			if (str_contains($className, '\\')) {
				$className = substr($className, strrpos($className, '\\') + 1);
			}
			if ($className === '' || preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $className) !== 1) {
				continue;
			}

			if ($prefixes !== []) {
				$matchedPrefix = false;
				foreach ($prefixes as $pfx) {
					if (str_starts_with($className, $pfx)) {
						$matchedPrefix = true;
						break;
					}
				}
				if (!$matchedPrefix) {
					continue;
				}
			}

			if ($implementsList !== []) {
				if (!class_exists('ProcessWire\\' . $className, false) && !class_exists($className, false)) {
					try {
						$modules->includeModule($className);
					} catch (\Throwable) {
						continue;
					}
				}
				$fqcn = class_exists('ProcessWire\\' . $className, false)
					? 'ProcessWire\\' . $className
					: (class_exists($className, false) ? $className : '');
				if ($fqcn === '') {
					continue;
				}
				$ifaces = class_implements($fqcn) ?: [];
				$shortIfaces = array_map(
					static fn(string $i): string => str_contains($i, '\\') ? substr($i, strrpos($i, '\\') + 1) : $i,
					array_values($ifaces)
				);
				if (array_intersect($implementsList, array_merge(array_values($ifaces), $shortIfaces)) === []) {
					continue;
				}
			}

			$info = $modules->getModuleInfo($className);
			$modId = (int) $modules->getModuleID($className);
			$list[] = [
				'id' => $modId,
				'name' => $className,
				'title' => trim((string) ($info['title'] ?? $className)),
				'summary' => trim((string) ($info['summary'] ?? '')),
				'icon' => trim((string) ($info['icon'] ?? 'plug')),
			];
		}

		usort(
			$list,
			static fn(array $a, array $b): int => strcasecmp($a['name'], $b['name'])
		);

		return $list;
	}

	/**
	 * @param array{id: int, name: string, title: string, summary: string, icon: string} $modInfo
	 * @param array<string, mixed> $config
	 */
	private function toRelationItem(array $modInfo, array $config): RelationItem
	{
		$valueField = $this->resolveValueField($config);
		$value = $valueField === 'id' ? $modInfo['id'] : $modInfo['name'];

		return new RelationItem(
			value: $value,
			resource: 'module',
			resourceLabel: $this->label(),
			label: $modInfo['title'] !== '' && $modInfo['title'] !== $modInfo['name']
				? "{$modInfo['title']} ({$modInfo['name']})"
				: $modInfo['name'],
			subtitle: $modInfo['summary'] !== '' ? $modInfo['summary'] : $modInfo['name'],
			badge: $modInfo['name'],
			icon: $modInfo['icon'] !== '' ? $modInfo['icon'] : 'plug',
			status: 'published',
			meta: [
				'id' => $modInfo['id'],
				'name' => $modInfo['name'],
			],
		);
	}
}
