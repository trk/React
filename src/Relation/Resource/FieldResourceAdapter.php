<?php

declare(strict_types=1);

namespace Totoglu\React\Relation\Resource;

use ProcessWire\Field;
use ProcessWire\Template;
use Totoglu\React\Relation\RelationItem;

/**
 * FieldResourceAdapter
 *
 * Relational resource adapter for ProcessWire `Field` definitions (`resource: 'field'`).
 * Supports filtering by `fieldtypes` (`FieldtypeImage`, `Image`, etc.) and cascading `dependsValue`
 * scoping to fields attached to a specific `Template`'s `fieldgroup`.
 */
final class FieldResourceAdapter extends AbstractRelationResource
{
	/**
	 * External scope resolvers (`fn(string $scope, array $config): ?list<RelationItem>`).
	 *
	 * @var array<string, callable(string, array<string, mixed>): ?list<RelationItem>>
	 */
	private array $scopeResolvers = [];

	/**
	 * External field hydrators (`fn(string $fieldName, array $config): ?RelationItem`).
	 *
	 * @var array<string, callable(string, array<string, mixed>): ?RelationItem>
	 */
	private array $hydrateResolvers = [];

	public function registerScopeResolver(string $key, callable $resolver): void
	{
		$this->scopeResolvers[$key] = $resolver;
	}

	public function registerHydrateResolver(string $key, callable $resolver): void
	{
		$this->hydrateResolvers[$key] = $resolver;
	}

	public function unregisterResolvers(string $key): void
	{
		unset($this->scopeResolvers[$key], $this->hydrateResolvers[$key]);
	}

	public function name(): string
	{
		return 'field';
	}

	public function label(): string
	{
		return $this->_('Field');
	}

	public function icon(): string
	{
		return 'sliders-horizontal';
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
		$pinnedTemplate = trim((string) ($config['template'] ?? ''));
		$dependsVal = $params['dependsValue'] ?? null;
		$templateScope = $pinnedTemplate !== ''
			? $pinnedTemplate
			: (is_scalar($dependsVal) ? trim((string) $dependsVal) : '');

		$items = [];
		$bpItems = $templateScope !== '' ? $this->collectBlueprintFieldItems($config, $templateScope) : null;
		if ($bpItems !== null) {
			foreach ($bpItems as $item) {
				if (!$this->matchesQuery($q, [$item->label, (string) $item->value, $item->badge, $item->subtitle])) {
					continue;
				}
				$items[] = $item;
			}

			return $this->paginateItems($items, $params, $config);
		}

		foreach ($this->collectFields($config, $templateScope) as $field) {
			$item = $this->toRelationItem($field, $config, $templateScope);
			if (!$this->matchesQuery($q, [$item->label, (string) $field->name, $item->badge, $item->subtitle])) {
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

		$fields = $this->wire()->fields;
		$templates = $this->wire()->templates;
		$includeSystem = !empty($config['includeSystem']);
		$allowedTypes = array_map('strtolower', $this->normalizeStringList($config['fieldtypes'] ?? []));
		$templateScope = trim((string) ($config['template'] ?? ''));
		$scopedTemplate = null;
		if ($templateScope !== '') {
			$cleanTplName = str_contains($templateScope, ':')
				? substr($templateScope, strpos($templateScope, ':') + 1)
				: $templateScope;
			if ($cleanTplName !== '') {
				$tplCandidate = ctype_digit($cleanTplName) ? $templates->get((int) $cleanTplName) : $templates->get($cleanTplName);
				if ($tplCandidate instanceof Template && $tplCandidate->fieldgroup !== null) {
					$scopedTemplate = $tplCandidate;
				}
			}
		}

		$valueField = $this->resolveValueField($config);
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
			if ($templateScope === '' || $scopedTemplate !== null) {
				$field = $fields->get($key);
				if ($field instanceof Field && (int) $field->id > 0) {
					if ($scopedTemplate !== null && !$scopedTemplate->fieldgroup->hasField($field)) {
						continue;
					}
					if (!$this->matchesFieldScope($field, $includeSystem, $allowedTypes)) {
						continue;
					}
					$items[] = $this->toRelationItem($field, $config, $templateScope);
					continue;
				}
			}
			if (is_string($key)) {
				$bpItem = $this->hydrateBlueprintFieldItem($key, $config);
				if ($bpItem instanceof RelationItem) {
					$items[] = $bpItem;
				}
			}
		}

		return $items;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	public function count(array $config = []): int
	{
		return count($this->collectFields($config, trim((string) ($config['template'] ?? ''))));
	}

	/**
	 * @param list<string> $allowedTypes
	 */
	private function matchesFieldScope(Field $field, bool $includeSystem, array $allowedTypes): bool
	{
		$isSystem = ((int) $field->flags & Field::flagSystem) !== 0;
		if ($isSystem && !$includeSystem && (string) $field->name !== 'title') {
			return false;
		}

		if ($allowedTypes !== []) {
			$ftClass = strtolower((string) ($field->type?->className() ?? ''));
			$shortFt = str_starts_with($ftClass, 'fieldtype') ? substr($ftClass, 9) : $ftClass;
			$baseFt = str_ends_with($ftClass, 'language') ? substr($ftClass, 0, -8) : $ftClass;
			$baseShortFt = str_ends_with($shortFt, 'language') ? substr($shortFt, 0, -8) : $shortFt;
			if (
				!in_array($ftClass, $allowedTypes, true)
				&& !in_array($shortFt, $allowedTypes, true)
				&& !in_array($baseFt, $allowedTypes, true)
				&& !in_array($baseShortFt, $allowedTypes, true)
			) {
				return false;
			}
		}

		return true;
	}

	/**
	 * @param array<string, mixed> $config
	 * @return list<Field>
	 */
	private function collectFields(array $config, string $templateScope = ''): array
	{
		$fields = $this->wire()->fields;
		$templates = $this->wire()->templates;

		$includeSystem = !empty($config['includeSystem']);
		$allowedTypes = array_map('strtolower', $this->normalizeStringList($config['fieldtypes'] ?? []));

		$sourceIterable = $fields;
		$scopedTemplate = null;
		if ($templateScope !== '') {
			// Strip optional morph prefix such as "template:blog-post"
			$cleanTplName = str_contains($templateScope, ':')
				? substr($templateScope, strpos($templateScope, ':') + 1)
				: $templateScope;
			if ($cleanTplName === '') {
				return [];
			}
			$tplCandidate = ctype_digit($cleanTplName) ? $templates->get((int) $cleanTplName) : $templates->get($cleanTplName);
			if (!$tplCandidate instanceof Template || $tplCandidate->fieldgroup === null) {
				return [];
			}
			$scopedTemplate = $tplCandidate;
			$sourceIterable = $tplCandidate->fieldgroup;
		}

		$list = [];
		foreach ($sourceIterable as $field) {
			if (!$field instanceof Field || !$this->matchesFieldScope($field, $includeSystem, $allowedTypes)) {
				continue;
			}

			$list[] = $field;
		}

		if ($scopedTemplate === null) {
			usort(
				$list,
				static fn(Field $a, Field $b): int => strcasecmp((string) $a->name, (string) $b->name)
			);
		}

		return $list;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	private function toRelationItem(Field $field, array $config, string $templateScope = ''): RelationItem
	{
		$valueField = $this->resolveValueField($config);
		$value = $valueField === 'id' ? (int) $field->id : (string) $field->name;

		$templates = $this->wire()->templates;
		$ctxField = $field;
		if ($templateScope !== '') {
			$cleanTplName = str_contains($templateScope, ':')
				? substr($templateScope, strpos($templateScope, ':') + 1)
				: $templateScope;
			if ($cleanTplName !== '') {
				$tpl = ctype_digit($cleanTplName) ? $templates->get((int) $cleanTplName) : $templates->get($cleanTplName);
				if ($tpl instanceof Template && $tpl->fieldgroup !== null) {
					$inCtx = $tpl->fieldgroup->getFieldContext($field);
					if ($inCtx instanceof Field) {
						$ctxField = $inCtx;
					}
				}
			}
		}

		$label = trim((string) ($ctxField->getLabel() ?: $field->name));
		$ftClass = (string) ($field->type?->className() ?? 'Fieldtype');
		$shortType = str_starts_with($ftClass, 'Fieldtype') ? substr($ftClass, 9) : $ftClass;
		$icon = trim((string) ($ctxField->getIcon() ?: 'sliders-horizontal'));

		$user = $this->wire()->user;
		$adminUrl = rtrim((string) ($this->wire()->config->urls->admin ?: '/processwire/'), '/');
		$editUrl = $user->isSuperuser()
			? "{$adminUrl}/setup/field/edit?id=" . (int) $field->id
			: '';

		return new RelationItem(
			value: $value,
			resource: 'field',
			resourceLabel: $this->label(),
			label: $label !== (string) $field->name ? "{$label} ({$field->name})" : (string) $field->name,
			subtitle: $ftClass,
			badge: $shortType,
			icon: $icon,
			status: 'published',
			editUrl: $editUrl,
			meta: [
				'id' => (int) $field->id,
				'name' => (string) $field->name,
				'fieldtype' => $ftClass,
			],
		);
	}

	/**
	 * Resolve matching fields from registered external scope resolvers when `$templateScope`
	 * does not match a ProcessWire `Template`.
	 *
	 * @param array<string, mixed> $config
	 * @return list<RelationItem>|null
	 */
	private function collectBlueprintFieldItems(array $config, string $templateScope): ?array
	{
		if ($this->scopeResolvers === []) {
			return null;
		}
		$templates = $this->wire()->templates;
		$cleanScope = str_contains($templateScope, ':')
			? substr($templateScope, strpos($templateScope, ':') + 1)
			: $templateScope;
		if ($cleanScope === '') {
			return null;
		}
		$tpl = ctype_digit($cleanScope) ? $templates->get((int) $cleanScope) : $templates->get($cleanScope);
		if ($tpl instanceof Template) {
			return null;
		}

		foreach ($this->scopeResolvers as $resolver) {
			$resolved = $resolver($cleanScope, $config);
			if (is_array($resolved)) {
				return $resolved;
			}
		}

		return null;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	private function hydrateBlueprintFieldItem(string $fieldName, array $config): ?RelationItem
	{
		foreach ($this->hydrateResolvers as $resolver) {
			$item = $resolver($fieldName, $config);
			if ($item instanceof RelationItem) {
				return $item;
			}
		}

		return null;
	}
}
