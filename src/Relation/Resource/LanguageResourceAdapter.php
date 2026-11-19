<?php

declare(strict_types=1);

namespace Totoglu\React\Relation\Resource;

use ProcessWire\Language;
use ProcessWire\NullPage;
use Totoglu\React\Relation\RelationItem;

/**
 * LanguageResourceAdapter
 *
 * Relational resource adapter for installed ProcessWire `Language` entities (`resource: 'language'`).
 */
final class LanguageResourceAdapter extends AbstractRelationResource
{
	public function name(): string
	{
		return 'language';
	}

	public function label(): string
	{
		return $this->_('Language');
	}

	public function icon(): string
	{
		return 'globe';
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
		$q = trim((string) ($params['q'] ?? ''));
		$items = [];

		foreach ($this->collectLanguages() as $lang) {
			$item = $this->toRelationItem($lang, $config);
			if (!$this->matchesQuery($q, [$item->label, (string) $lang->name, $item->badge])) {
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
		$languages = $this->wire()->languages;
		if (!is_iterable($languages) || $values === []) {
			return [];
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
			} elseif (ctype_digit($strVal)) {
				continue;
			}
			foreach ($languages as $lang) {
				if (!$lang instanceof Language || $lang instanceof NullPage || (int) $lang->id <= 0) {
					continue;
				}
				$matched = $valueField === 'name'
					? ((string) $lang->name === $strVal)
					: ((string) $lang->id === $strVal);
				if ($matched) {
					$items[] = $this->toRelationItem($lang, $config);
					break;
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
		return count($this->collectLanguages());
	}

	/**
	 * @return list<Language>
	 */
	private function collectLanguages(): array
	{
		$languages = $this->wire()->languages;
		if (!is_iterable($languages)) {
			return [];
		}

		$list = [];
		foreach ($languages as $lang) {
			if ($lang instanceof Language && !$lang instanceof NullPage && (int) $lang->id > 0) {
				$list[] = $lang;
			}
		}

		return $list;
	}

	/**
	 * @param array<string, mixed> $config
	 */
	private function toRelationItem(Language $lang, array $config): RelationItem
	{
		$valueField = $this->resolveValueField($config);
		$value = $valueField === 'name' ? (string) $lang->name : (int) $lang->id;
		$title = trim((string) ($lang->get('title|name') ?: $lang->name));

		return new RelationItem(
			value: $value,
			resource: 'language',
			resourceLabel: $this->label(),
			label: $title,
			subtitle: $lang->isDefault() ? $this->_('Default language') : (string) $lang->name,
			badge: (string) $lang->name,
			icon: 'globe',
			status: 'published',
			meta: [
				'id' => (int) $lang->id,
				'name' => (string) $lang->name,
				'isDefault' => $lang->isDefault(),
			],
		);
	}
}
