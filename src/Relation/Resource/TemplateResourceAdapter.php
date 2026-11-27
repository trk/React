<?php

declare(strict_types=1);

namespace Totoglu\React\Relation\Resource;

use ProcessWire\Template;
use Totoglu\React\Relation\RelationItem;

/**
 * TemplateResourceAdapter
 *
 * Relational resource adapter for ProcessWire `Template` definitions (`resource: 'template'`).
 */
final class TemplateResourceAdapter extends AbstractRelationResource
{
	public function name(): string
	{
		return 'template';
	}

	public function label(): string
	{
		return $this->_('Template');
	}

	public function icon(): string
	{
		return 'layers';
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

		foreach ($this->collectTemplates($config) as $tpl) {
			$item = $this->toRelationItem($tpl, $config);
			if (!$this->matchesQuery($q, [$item->label, (string) $tpl->name, $item->subtitle, $item->badge])) {
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
		$templates = $this->wire()->templates;

		$valueField = $this->resolveValueField($config);
		$includeSystem = !empty($config['includeSystem']);
		$allowedTags = $this->normalizeStringList($config['tags'] ?? []);
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
				$key = (int) $strVal;
			} else {
				if (ctype_digit($strVal)) {
					continue;
				}
				$key = $strVal;
			}
			$tpl = $templates->get($key);
			if ($tpl instanceof Template && (int) $tpl->id > 0 && $this->matchesTemplateScope($tpl, $includeSystem, $allowedTags)) {
				$items[] = $this->toRelationItem($tpl, $config);
			}
		}

		return $items;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	public function count(array $config = []): int
	{
		return count($this->collectTemplates($config));
	}

	/**
	 * @param list<string> $allowedTags
	 */
	private function matchesTemplateScope(Template $tpl, bool $includeSystem, array $allowedTags): bool
	{
		$isSystem = ((int) $tpl->flags & Template::flagSystem) !== 0;
		if ($isSystem && !$includeSystem) {
			return false;
		}
		if ($allowedTags !== []) {
			$tplTags = $this->normalizeStringList((string) ($tpl->tags ?? ''));
			if (array_intersect($allowedTags, $tplTags) === []) {
				return false;
			}
		}

		return true;
	}

	/**
	 * @param array<string, mixed> $config
	 * @return list<Template>
	 */
	private function collectTemplates(array $config): array
	{
		$templates = $this->wire()->templates;

		$includeSystem = !empty($config['includeSystem']);
		$allowedTags = $this->normalizeStringList($config['tags'] ?? []);
		$list = [];

		foreach ($templates as $tpl) {
			if (!$tpl instanceof Template || !$this->matchesTemplateScope($tpl, $includeSystem, $allowedTags)) {
				continue;
			}
			$list[] = $tpl;
		}

		usort(
			$list,
			static fn(Template $a, Template $b): int => strcasecmp((string) ($a->getLabel() ?: $a->name), (string) ($b->getLabel() ?: $b->name))
				?: strcmp((string) $a->name, (string) $b->name)
		);

		return $list;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	private function toRelationItem(Template $tpl, array $config): RelationItem
	{
		$valueField = $this->resolveValueField($config);
		$value = $valueField === 'id' ? (int) $tpl->id : (string) $tpl->name;

		$label = trim((string) ($tpl->getLabel() ?: $tpl->name));
		$fieldCount = $tpl->fieldgroup !== null ? $tpl->fieldgroup->count() : 0;
		$subtitle = sprintf($this->_('%s · %d fields'), (string) $tpl->name, $fieldCount);
		$icon = trim((string) ($tpl->getIcon() ?: 'layers'));

		$user = $this->wire()->user;
		$adminUrl = rtrim((string) ($this->wire()->config->urls->admin ?: '/processwire/'), '/');
		$editUrl = $user->isSuperuser()
			? "{$adminUrl}/setup/template/edit?id=" . (int) $tpl->id
			: '';

		return new RelationItem(
			value: $value,
			resource: 'template',
			resourceLabel: $this->label(),
			label: $label,
			subtitle: $subtitle,
			badge: (string) $tpl->name,
			icon: $icon,
			status: (((int) $tpl->flags & Template::flagSystem) !== 0) ? 'system' : 'published',
			editUrl: $editUrl,
			meta: [
				'id' => (int) $tpl->id,
				'name' => (string) $tpl->name,
				'fieldCount' => $fieldCount,
			],
		);
	}
}
