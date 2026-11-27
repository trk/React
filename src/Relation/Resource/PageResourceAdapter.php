<?php

declare(strict_types=1);

namespace Totoglu\React\Relation\Resource;

use ProcessWire\Field;
use ProcessWire\Language;
use ProcessWire\Languages;
use ProcessWire\NullPage;
use ProcessWire\Page;
use ProcessWire\PageArray;
use ProcessWire\Pageimage;
use ProcessWire\Pageimages;
use ProcessWire\Selectors;
use ProcessWire\Template;
use ProcessWire\User;
use ProcessWire\WireException;
use Totoglu\React\Provider\PagesDataProvider;
use Totoglu\React\Relation\RelationItem;

/**
 * PageResourceAdapter
 *
 * Relational resource adapter for ProcessWire `Page` entities (`resource: 'page'`).
 * Supports selector constraints, template/parent filtering, lazy hierarchical `tree()`,
 * `O2M` reverse queries + link/unlink mutations, and RBAC-guarded inline `quickCreate()`.
 */
final class PageResourceAdapter extends AbstractRelationResource
{
	public function name(): string
	{
		return 'page';
	}

	public function label(): string
	{
		return $this->_('Page');
	}

	public function icon(): string
	{
		return 'file-text';
	}

	public function defaultValueField(): string
	{
		return 'id';
	}

	public function supportsTree(): bool
	{
		return true;
	}

	public function supportsQuickCreate(): bool
	{
		return true;
	}

	/**
	 * @param array<string, mixed> $params
	 * @param array<string, mixed> $config
	 * @return array{items: list<RelationItem>, total: int, hasMore: bool}
	 */
	public function query(array $params = [], array $config = []): array
	{
		$pages = $this->wire()->pages;

		$page = max(1, (int) ($params['page'] ?? 1));
		$limit = max(1, min(100, (int) ($params['limit'] ?? $config['limit'] ?? 25)));
		$start = ($page - 1) * $limit;

		$clauses = $this->buildBaseSelectorClauses($config, $params);
		$scopedTemplates = $this->resolveTemplateNames($config);
		$canSearchTitle = $this->isFieldSearchableForUser('title', $scopedTemplates);
		$q = trim((string) ($params['q'] ?? ''));
		if ($q !== '') {
			$safeQ = $this->sanitizeSelectorValue($q);
			if (ctype_digit($q) && (int) $q > 0) {
				$clauses[] = ($canSearchTitle ? 'id|title|name%=' : 'id|name%=') . $safeQ;
			} else {
				$clauses[] = ($canSearchTitle ? 'title|name%=' : 'name%=') . $safeQ;
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

		$hasCustomSort = false;
		foreach ($clauses as $clause) {
			if (str_starts_with(trim($clause), 'sort=')) {
				$hasCustomSort = true;
				break;
			}
		}
		if (!$hasCustomSort) {
			$clauses[] = $canSearchTitle ? 'sort=title, sort=name, sort=id' : 'sort=name, sort=id';
		}

		$user = $this->wire()->user;
		if (!$user->isSuperuser() && $this->hasIncludeClause($clauses)) {
			$readableTotal = 0;
			$items = [];
			foreach ($pages->findMany(implode(', ', $clauses)) as $p) {
				if (!$p instanceof Page || $p instanceof NullPage || !$this->canReadPage($p)) {
					continue;
				}
				if ($readableTotal >= $start && count($items) < $limit) {
					$items[] = $this->toRelationItem($p, $config);
				}
				$readableTotal++;
			}

			return [
				'items' => $items,
				'total' => $readableTotal,
				'hasMore' => ($start + count($items)) < $readableTotal,
			];
		}

		$clauses[] = "start={$start}";
		$clauses[] = "limit={$limit}";

		$selector = implode(', ', $clauses);
		$found = $pages->find($selector);
		$total = (int) $found->getTotal();

		$items = [];
		foreach ($found as $p) {
			if (!$p instanceof Page || $p instanceof NullPage || !$this->canReadPage($p)) {
				continue;
			}
			$items[] = $this->toRelationItem($p, $config);
		}

		return [
			'items' => $items,
			'total' => $total,
			'hasMore' => ($start + $found->count()) < $total,
		];
	}

	/**
	 * @param array<string, mixed> $config
	 * @return list<RelationItem>
	 */
	public function tree(string|int $parentId = 0, array $config = []): array
	{
		$pages = $this->wire()->pages;

		$configuredRootId = (int) ($config['parentId'] ?? 0);
		$resolvedParentId = (int) $parentId;
		if ($resolvedParentId <= 0) {
			$resolvedParentId = $configuredRootId > 0 ? $configuredRootId : 1;
		}

		$parent = $pages->get($resolvedParentId);
		if (!$parent instanceof Page || $parent instanceof NullPage || (int) $parent->id <= 0) {
			return [];
		}

		$adminRootId = (int) ($this->wire()->config->adminRootPageID ?: 2);
		$trashPageId = (int) ($this->wire()->config->trashPageID ?: 7);
		$allowedTemplates = $this->resolveTemplateNames($config);
		$signedSelector = trim((string) ($config['selector'] ?? ''));
		$targetsAdmin = $configuredRootId === $adminRootId
			|| in_array('admin', $allowedTemplates, true)
			|| str_contains($signedSelector, 'has_parent=' . $adminRootId)
			|| str_contains($signedSelector, 'include=all');

		if ($configuredRootId > 0 && $resolvedParentId !== $configuredRootId && !$parent->parents()->has("id={$configuredRootId}")) {
			return [];
		}

		if (
			!$targetsAdmin
			&& (
				$resolvedParentId === $adminRootId
				|| $resolvedParentId === $trashPageId
				|| (int) $parent->rootParent?->id === $adminRootId
				|| $parent->isTrash()
			)
		) {
			return [];
		}

		// When parentId === 0 and no root override was set, include Home (1) or its children cleanly
		$user = $this->wire()->user;
		$allowUnpub = !empty($config['allowUnpub']) && ($user->isSuperuser() || $user->hasPermission('page-edit'));

		$childClauses = [];
		if ($resolvedParentId === 1 && !$targetsAdmin) {
			$childClauses[] = "id!={$adminRootId}|{$trashPageId}";
		}
		if ($allowUnpub) {
			$childClauses[] = 'include=unpublished';
		}
		$childClauses[] = 'limit=250';

		$children = $parent->children(implode(', ', $childClauses));

		$items = [];
		// At root level with no parentId restriction, expose Home page itself if it matches template filter
		if ((int) $parentId === 0 && $configuredRootId === 0 && $this->canReadPage($parent)) {
			$parentTplName = $parent->template instanceof Template ? (string) $parent->template->name : '';
			if ($allowedTemplates === [] || in_array($parentTplName, $allowedTemplates, true)) {
				$homeItem = $this->toRelationItem($parent, $config);
				// Home children are returned alongside or expandable; keep Home selectable without duplicating tree root
				$items[] = new RelationItem(
					value: $homeItem->value,
					resource: $homeItem->resource,
					resourceLabel: $homeItem->resourceLabel,
					label: $homeItem->label,
					subtitle: '/',
					badge: $homeItem->badge,
					icon: 'globe',
					status: $homeItem->status,
					thumbUrl: $homeItem->thumbUrl,
					hasChildren: false,
					parentId: 0,
					editUrl: $homeItem->editUrl,
					viewUrl: $homeItem->viewUrl,
					meta: array_merge($homeItem->meta, ['isHomeRoot' => true]),
				);
			}
		}

		foreach ($children as $child) {
			if (!$child instanceof Page || $child instanceof NullPage || !$this->canReadPage($child)) {
				continue;
			}
			$item = $this->toRelationItem($child, $config);
			$childTplName = $child->template instanceof Template ? (string) $child->template->name : '';
			$matchesTemplate = $allowedTemplates === []
				|| in_array($childTplName, $allowedTemplates, true);

			if (!$matchesTemplate && !$item->hasChildren) {
				continue;
			}
			$items[] = new RelationItem(
				value: $item->value,
				resource: $item->resource,
				resourceLabel: $item->resourceLabel,
				label: $item->label,
				subtitle: $item->subtitle,
				badge: $item->badge,
				icon: $item->icon,
				status: $item->status,
				thumbUrl: $item->thumbUrl,
				hasChildren: $item->hasChildren,
				parentId: $resolvedParentId,
				editUrl: $item->editUrl,
				viewUrl: $item->viewUrl,
				meta: array_merge($item->meta, ['selectable' => $matchesTemplate]),
			);
		}

		return $items;
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
		$pages = $this->wire()->pages;

		$valueField = $this->resolveValueField($config);
		/** @var list<array{type: string, key: string}> $orderedRefs */
		$orderedRefs = [];
		/** @var array<int, int> $ids */
		$ids = [];
		/** @var array<string, string> $paths */
		$paths = [];
		/** @var array<string, string> $names */
		$names = [];

		foreach ($values as $rawVal) {
			if (count($orderedRefs) >= 500) {
				break;
			}
			$strVal = trim((string) $rawVal);
			if ($strVal === '' || $strVal === '0') {
				continue;
			}

			if ($valueField === 'path' || $valueField === 'url') {
				if (ctype_digit($strVal)) {
					continue;
				}
				$cleanPath = '/' . ltrim($strVal, '/');
				$orderedRefs[] = ['type' => 'path', 'key' => $cleanPath];
				$paths[$cleanPath] = $cleanPath;
			} elseif ($valueField === 'name') {
				if (ctype_digit($strVal)) {
					continue;
				}
				$safeName = $this->wire()->sanitizer->pageName($strVal);
				if ($safeName !== '') {
					$orderedRefs[] = ['type' => 'name', 'key' => $safeName];
					$names[$safeName] = $safeName;
				}
			} elseif (ctype_digit($strVal)) {
				$id = (int) $strVal;
				if ($id > 0) {
					$orderedRefs[] = ['type' => 'id', 'key' => (string) $id];
					$ids[$id] = $id;
				}
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

		$clauses = $this->buildBaseSelectorClauses($hydrateConfig);
		$matchGroups = [];
		if ($ids !== []) {
			$matchGroups[] = 'id=' . implode('|', array_values($ids));
		}
		if ($paths !== []) {
			$safePaths = array_map(fn(string $p): string => $this->sanitizeSelectorValue($p), array_values($paths));
			$matchGroups[] = 'path=' . implode('|', $safePaths);
		}
		if ($names !== []) {
			$safeNames = array_map(fn(string $n): string => $this->sanitizeSelectorValue($n), array_values($names));
			$matchGroups[] = 'name=' . implode('|', $safeNames);
		}

		if ($matchGroups !== []) {
			$clauses[] = $matchGroups[0];
		}

		$clauses[] = 'limit=500';
		$found = $pages->find(implode(', ', $clauses));
		/** @var array<string, Page> $byId */
		$byId = [];
		/** @var array<string, Page> $byPath */
		$byPath = [];
		/** @var array<string, Page> $byName */
		$byName = [];

		foreach ($found as $page) {
			if (!$page instanceof Page || $page instanceof NullPage || (int) $page->id <= 0 || !$this->canReadPage($page)) {
				continue;
			}
			$byId[(string) (int) $page->id] = $page;
			$pagePath = (string) $page->path;
			if ($pagePath !== '') {
				$byPath[$pagePath] = $page;
				if ($pagePath !== '/') {
					$byPath[rtrim($pagePath, '/')] = $page;
				}
			}
			$pageName = (string) $page->name;
			if ($pageName !== '' && !isset($byName[$pageName])) {
				$byName[$pageName] = $page;
			}
		}

		$items = [];
		foreach ($orderedRefs as $ref) {
			$matched = match ($ref['type']) {
				'id' => $byId[$ref['key']] ?? null,
				'path' => $byPath[$ref['key']] ?? ($byPath[rtrim($ref['key'], '/') . '/'] ?? null),
				default => $byName[$ref['key']] ?? null,
			};
			if ($matched instanceof Page) {
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
		$clauses = $this->buildBaseSelectorClauses($config);
		$user = $this->wire()->user;
		if (!$user->isSuperuser() && $this->hasIncludeClause($clauses)) {
			$readable = 0;
			foreach ($this->wire()->pages->findMany(implode(', ', $clauses)) as $p) {
				if ($p instanceof Page && !$p instanceof NullPage && $this->canReadPage($p)) {
					$readable++;
				}
			}

			return $readable;
		}

		return (int) $this->wire()->pages->count(implode(', ', $clauses));
	}

	/**
	 * @param array<string, mixed> $params
	 * @param array<string, mixed> $config
	 * @return array{items: list<RelationItem>, total: int, hasMore: bool}
	 */
	public function queryReverse(string|int $ownerId, string $foreignField, array $params = [], array $config = []): array
	{
		$fields = $this->wire()->fields;
		$cleanOwnerId = (int) $ownerId;
		$cleanField = preg_replace('/[^a-zA-Z0-9_]/', '', trim($foreignField)) ?: '';
		if ($cleanOwnerId <= 0 || $cleanField === '' || $fields->get($cleanField) === null) {
			return ['items' => [], 'total' => 0, 'hasMore' => false];
		}

		$mergedConfig = $config;
		$baseSelector = trim((string) ($config['selector'] ?? ''));
		$reverseClause = "{$cleanField}={$cleanOwnerId}";
		$mergedConfig['selector'] = $baseSelector !== '' ? "{$baseSelector}, {$reverseClause}" : $reverseClause;

		return $this->query($params, $mergedConfig);
	}

	/**
	 * @param array<string, mixed> $payload
	 * @param array<string, mixed> $config
	 */
	public function quickCreate(array $payload, array $config = []): RelationItem
	{
		if (empty($config['creatable'])) {
			throw new WireException($this->_('Quick creation is not enabled for this field.'));
		}

		$pages = $this->wire()->pages;
		$templates = $this->wire()->templates;
		$sanitizer = $this->wire()->sanitizer;
		$user = $this->wire()->user;

		$title = $sanitizer->text(trim((string) ($payload['title'] ?? '')));
		if ($title === '') {
			throw new WireException($this->_('Title is required to create a page.'));
		}

		$ownerId = (int) ($config['ownerId'] ?? $payload['ownerId'] ?? 0);
		if ($ownerId > 0) {
			$ownerCandidate = $pages->get($ownerId);
			$this->assertValidOwnerPage($ownerCandidate, $user);
		}

		$configuredCreateParent = (int) ($config['createParentId'] ?? 0);
		$configuredRootId = (int) ($config['parentId'] ?? 0);
		$payloadParentId = (int) ($payload['parentId'] ?? 0);
		$parentId = $configuredCreateParent > 0
			? $configuredCreateParent
			: ($payloadParentId > 0 ? $payloadParentId : ($configuredRootId > 0 ? $configuredRootId : 1));

		$parent = $pages->get($parentId);
		if (!$parent instanceof Page || $parent instanceof NullPage || (int) $parent->id <= 0 || $parent->isTrash()) {
			throw new WireException($this->_('Target parent page does not exist.'));
		}

		$adminRootId = (int) ($this->wire()->config->adminRootPageID ?: 2);
		$trashPageId = (int) ($this->wire()->config->trashPageID ?: 7);
		if (
			$configuredCreateParent !== $adminRootId
			&& $configuredRootId !== $adminRootId
			&& ((int) $parent->id === $adminRootId || (int) $parent->id === $trashPageId || (int) $parent->rootParent?->id === $adminRootId)
		) {
			throw new WireException($this->_('Cannot create pages under system or trash roots.'));
		}

		if ($configuredRootId > 0 && (int) $parent->id !== $configuredRootId && !$parent->parents()->has("id={$configuredRootId}")) {
			throw new WireException($this->_('Selected parent page is outside the allowed hierarchy for this field.'));
		}

		$allowedTemplates = $this->resolveTemplateNames($config);
		$cfgCreateTpl = trim((string) ($config['createTemplate'] ?? ''));
		$payloadTpl = trim((string) ($payload['template'] ?? ''));
		$rawRequestedTpl = $cfgCreateTpl !== ''
			? $cfgCreateTpl
			: ($payloadTpl !== '' ? $payloadTpl : ($allowedTemplates[0] ?? ''));
		if ($rawRequestedTpl === '' && $parent->template instanceof Template && is_array($parent->template->childTemplates) && count($parent->template->childTemplates) === 1) {
			$onlyChildTpl = $templates->get((int) $parent->template->childTemplates[0]);
			if ($onlyChildTpl instanceof Template) {
				$rawRequestedTpl = (string) $onlyChildTpl->name;
			}
		}

		if ($rawRequestedTpl === '') {
			throw new WireException($this->_('A target template must be configured to quick-create pages.'));
		}
		if (ctype_digit($rawRequestedTpl)) {
			throw new WireException($this->_('Numeric template IDs are not permitted for quick create.'));
		}

		$requestedTpl = $sanitizer->name($rawRequestedTpl);
		if ($requestedTpl === '') {
			throw new WireException($this->_('Invalid template specified for quick create.'));
		}
		if ($allowedTemplates !== [] && !in_array($requestedTpl, $allowedTemplates, true)) {
			throw new WireException($this->_('Selected template is not allowed for this relation field.'));
		}

		$tpl = $templates->get($requestedTpl);
		if (!$tpl instanceof Template || ((int) $tpl->flags & Template::flagSystem) !== 0) {
			throw new WireException($this->_('Invalid or system template specified for quick create.'));
		}

		if ((int) $tpl->noParents === 1 || ((int) $tpl->noParents === -1 && $pages->has('template=' . (int) $tpl->id))) {
			throw new WireException($this->_('Selected template does not allow creating pages under a parent.'));
		}
		if (
			is_array($tpl->parentTemplates)
			&& $tpl->parentTemplates !== []
			&& (!$parent->template instanceof Template || !in_array((int) $parent->template->id, array_map('intval', $tpl->parentTemplates), true))
		) {
			throw new WireException($this->_('Selected template is not permitted under the chosen parent template.'));
		}
		if (
			$parent->template instanceof Template
			&& (
				(bool) $parent->template->noChildren
				|| (
					is_array($parent->template->childTemplates)
					&& $parent->template->childTemplates !== []
					&& !in_array((int) $tpl->id, array_map('intval', $parent->template->childTemplates), true)
				)
			)
		) {
			throw new WireException($this->_('Parent template does not allow creating pages of the selected template.'));
		}

		if (!$user->isSuperuser()) {
			$accessTpl = $tpl->useRoles ? $tpl : ($parent->getAccessTemplate('edit') ?? $tpl);
			if (!$parent->addable() || !$user->hasPermission('page-create', $accessTpl)) {
				throw new WireException($this->_('You do not have permission to create pages of this template under the selected parent.'));
			}
			$languages = $this->wire()->languages;
			if ($languages instanceof Languages) {
				$defLang = $languages->getDefault();
				if ($defLang instanceof Language && !$languages->editable($defLang)) {
					throw new WireException($this->_('You do not have permission to edit the default language.'));
				}
			}
		}

		$rawName = trim((string) ($payload['name'] ?? ''));
		$pageName = $sanitizer->pageName($rawName !== '' ? $rawName : $title, true);
		if ($pageName === '') {
			$pageName = 'item-' . time();
		}

		$newPage = $pages->new([
			'template' => $tpl,
			'parent' => $parent,
			'title' => $title,
			'name' => $pages->names()->uniquePageName($pageName, $parent),
		]);

		// If invoked from an O2M field with foreignField + ownerId, pre-bind the owner reference
		$foreignField = preg_replace('/[^a-zA-Z0-9_]/', '', trim((string) ($config['foreignField'] ?? ''))) ?: '';
		$ownerId = (int) ($config['ownerId'] ?? $payload['ownerId'] ?? 0);
		if ($foreignField !== '' && $ownerId > 0 && $tpl->fieldgroup?->hasField($foreignField)) {
			$ownerPage = $pages->get($ownerId);
			if ($ownerPage instanceof Page && !$ownerPage instanceof NullPage && (int) $ownerPage->id > 0) {
				$currentRef = $newPage->get($foreignField);
				if ($currentRef instanceof PageArray) {
					$currentRef->add($ownerPage);
				} else {
					$newPage->set($foreignField, $ownerPage);
				}
			}
		}

		$pages->save($newPage);

		return $this->toRelationItem($newPage, $config);
	}

	/**
	 * @param array<string, mixed> $config
	 */
	public function link(string|int $ownerId, string $foreignField, string|int $targetValue, array $config = []): bool
	{
		return $this->mutatePageReference((int) $ownerId, $foreignField, (int) $targetValue, true, $config);
	}

	/**
	 * @param array<string, mixed> $config
	 */
	public function unlink(string|int $ownerId, string $foreignField, string|int $targetValue, array $config = []): bool
	{
		return $this->mutatePageReference((int) $ownerId, $foreignField, (int) $targetValue, false, $config);
	}

	/**
	 * @param array<string, mixed> $config
	 */
	private function mutatePageReference(int $ownerId, string $foreignField, int $targetId, bool $attach, array $config): bool
	{
		$flagKey = $attach ? 'allowLink' : 'allowUnlink';
		if (array_key_exists($flagKey, $config) && empty($config[$flagKey])) {
			return false;
		}

		$pages = $this->wire()->pages;
		$user = $this->wire()->user;
		$cleanField = preg_replace('/[^a-zA-Z0-9_]/', '', trim($foreignField)) ?: '';
		if ($ownerId <= 0 || $targetId <= 0 || $cleanField === '') {
			return false;
		}

		$ownerPage = $pages->get($ownerId);
		$this->assertValidOwnerPage($ownerPage, $user);

		$targetPage = $pages->get($targetId);
		if (!$targetPage instanceof Page || $targetPage instanceof NullPage || (int) $targetPage->id <= 0) {
			throw new WireException($this->_('Target page does not exist.'));
		}
		$this->assertTargetMatchesScope($targetPage, $user, $cleanField, $config);

		$prevOf = $targetPage->of();
		$targetPage->of(false);
		try {
			$val = $targetPage->get($cleanField);
			if ($val instanceof PageArray) {
				if ($attach) {
					$val->add($ownerPage);
				} else {
					$val->remove($ownerPage);
				}
				$targetPage->set($cleanField, $val);
			} else {
				$targetPage->set($cleanField, $attach ? $ownerPage : $pages->newNullPage());
			}

			return (bool) $targetPage->save($cleanField);
		} finally {
			$targetPage->of($prevOf);
		}
	}

	/**
	 * Validate `$ownerPage` exists, is not in trash or admin root, and is editable by `$user`.
	 */
	private function assertValidOwnerPage(mixed $ownerPage, User $user): void
	{
		if (!$ownerPage instanceof Page || $ownerPage instanceof NullPage || (int) $ownerPage->id <= 0) {
			throw new WireException($this->_('Owner page does not exist.'));
		}
		if ($ownerPage->isTrash()) {
			throw new WireException($this->_('Cannot mutate relations on a trashed owner page.'));
		}
		$adminRootId = (int) ($this->wire()->config->adminRootPageID ?: 2);
		$trashPageId = (int) ($this->wire()->config->trashPageID ?: 7);
		if ((int) $ownerPage->id === $adminRootId || (int) $ownerPage->id === $trashPageId || (int) $ownerPage->rootParent?->id === $adminRootId) {
			throw new WireException($this->_('Cannot mutate relations on system or admin owner pages.'));
		}
		if (!$user->isSuperuser() && !$ownerPage->editable()) {
			throw new WireException($this->_('You do not have permission to edit the owner page.'));
		}
	}

	/**
	 * Validate `$targetPage` satisfies RBAC and signed `$config` scope (`templates`, `parentId`, `selector`).
	 *
	 * @param array<string, mixed> $config
	 */
	private function assertTargetMatchesScope(Page $targetPage, User $user, string $cleanField, array $config): void
	{
		if ($targetPage->isTrash()) {
			throw new WireException($this->_('Cannot link or unlink trashed target pages.'));
		}
		$adminRootId = (int) ($this->wire()->config->adminRootPageID ?: 2);
		$trashPageId = (int) ($this->wire()->config->trashPageID ?: 7);
		$parentId = (int) ($config['parentId'] ?? 0);
		$allowedTemplates = $this->resolveTemplateNames($config);
		$signedSelector = trim((string) ($config['selector'] ?? ''));
		$targetsAdmin = $parentId === $adminRootId
			|| in_array('admin', $allowedTemplates, true)
			|| str_contains($signedSelector, 'has_parent=' . $adminRootId);

		if (
			!$targetsAdmin
			&& (
				(int) $targetPage->id === $adminRootId
				|| (int) $targetPage->id === $trashPageId
				|| (int) $targetPage->rootParent?->id === $adminRootId
				|| ((int) $targetPage->status & (Page::statusSystem | Page::statusSystemID)) !== 0
			)
		) {
			throw new WireException($this->_('Target page is outside the permitted scope.'));
		}
		$targetTpl = $targetPage->template instanceof Template ? $targetPage->template : null;
		if ($targetTpl === null || $targetTpl->fieldgroup === null || !$targetTpl->fieldgroup->hasField($cleanField)) {
			throw new WireException($this->_('Target page does not contain the configured foreign field.'));
		}
		if (!$user->isSuperuser() && !$targetPage->editable($cleanField)) {
			throw new WireException($this->_('You do not have permission to edit the target page relation field.'));
		}
		if ($allowedTemplates !== [] && !in_array((string) $targetTpl->name, $allowedTemplates, true)) {
			throw new WireException($this->_('Target page template is not permitted for this relation field.'));
		}
		if ($parentId > 0 && (int) $targetPage->parent_id !== $parentId && !$targetPage->parents()->has("id={$parentId}")) {
			throw new WireException($this->_('Target page is outside the configured parent hierarchy.'));
		}
		if ($signedSelector !== '') {
			$selectors = new Selectors($signedSelector);
			$this->wire($selectors);
			$filteredParts = [];
			foreach ($selectors as $sel) {
				$fields = array_map('strtolower', (array) $sel->fields);
				if (array_intersect($fields, ['limit', 'start', 'sort', 'include']) !== []) {
					continue;
				}
				$filteredParts[] = (string) $sel;
			}
			if ($filteredParts !== [] && !$targetPage->matches(implode(', ', $filteredParts))) {
				throw new WireException($this->_('Target page does not match the configured selector constraints.'));
			}
		}
	}

	/**
	 * @param array<string, mixed> $config
	 * @param array<string, mixed> $params
	 * @return list<string>
	 */
	private function buildBaseSelectorClauses(array $config, array $params = []): array
	{
		$clauses = [];
		$adminRootId = (int) ($this->wire()->config->adminRootPageID ?: 2);
		$trashPageId = (int) ($this->wire()->config->trashPageID ?: 7);

		$signedTemplates = $this->resolveTemplateNames($config);
		$templateNames = $signedTemplates;
		$parentId = (int) ($config['parentId'] ?? 0);
		[$signedSelector] = PagesDataProvider::stripTopLevelPaginationClauses((string) ($config['selector'] ?? ''));
		$targetsAdmin = $parentId === $adminRootId
			|| in_array('admin', $signedTemplates, true)
			|| str_contains($signedSelector, 'has_parent=' . $adminRootId)
			|| str_contains($signedSelector, 'include=all');

		$dependsParam = trim((string) ($config['dependsParam'] ?? ''));
		$dependsVal = $params['dependsValue'] ?? null;

		if ($dependsVal !== null && $dependsVal !== '') {
			$depStr = is_scalar($dependsVal) ? trim((string) $dependsVal) : '';
			if ($depStr !== '') {
				if ($dependsParam === 'template') {
					if (
						($signedTemplates !== [] && !in_array($depStr, $signedTemplates, true))
						|| (strtolower($depStr) === 'admin' && !$targetsAdmin)
					) {
						return ['id=0'];
					}
					$templateNames = [$depStr];
				} elseif ($dependsParam === 'parent' || $dependsParam === 'parent_id') {
					if (ctype_digit($depStr) && (int) $depStr > 0) {
						$clauses[] = 'has_parent=' . (int) $depStr;
					}
				} elseif ($dependsParam !== '' && preg_match('/^[a-zA-Z0-9_.]+$/', $dependsParam) === 1) {
					$clauses[] = $dependsParam . '=' . $this->sanitizeSelectorValue($depStr);
				}
			}
		}

		if ($templateNames !== []) {
			$safeTpls = array_map(fn(string $t): string => $this->sanitizeSelectorValue($t), $templateNames);
			$clauses[] = 'template=' . implode('|', $safeTpls);
		}

		if ($parentId > 0) {
			$clauses[] = "has_parent={$parentId}";
		}

		if ($signedSelector !== '') {
			$clauses[] = $signedSelector;
		}

		if (!$targetsAdmin) {
			$clauses[] = "has_parent!={$adminRootId}";
			$clauses[] = "has_parent!={$trashPageId}";
			$clauses[] = "id!={$adminRootId}|{$trashPageId}";
		}

		$user = $this->wire()->user;
		if (!str_contains($signedSelector, 'include=')) {
			if (!empty($config['allowUnpub']) && ($user->isSuperuser() || $user->hasPermission('page-edit'))) {
				$clauses[] = 'include=unpublished';
			}
		}

		return $clauses;
	}

	/**
	 * @param list<string> $clauses
	 */
	private function hasIncludeClause(array $clauses): bool
	{
		foreach ($clauses as $clause) {
			if (preg_match('/\binclude\s*=/i', $clause) === 1 || preg_match('/\bcheck_access\s*=\s*0\b/i', $clause) === 1) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check whether `$fieldName` is safe to search/sort on across `$scopedTemplateNames` (or all templates when empty),
	 * inspecting both global `Field::$useRoles` and template-context `Field::$useRoles` overrides.
	 *
	 * @param list<string> $scopedTemplateNames
	 */
	private function isFieldSearchableForUser(string $fieldName, array $scopedTemplateNames = []): bool
	{
		$user = $this->wire()->user;
		if ($user->isSuperuser()) {
			return true;
		}
		$field = $this->wire()->fields->get($fieldName);
		if (!$field instanceof Field) {
			return true;
		}
		if ((bool) $field->useRoles && !$field->viewable(null, $user)) {
			return false;
		}
		$templates = $this->wire()->templates;
		$checkTemplates = [];
		if ($scopedTemplateNames !== []) {
			foreach ($scopedTemplateNames as $tplName) {
				$t = $templates->get($tplName);
				if ($t instanceof Template) {
					$checkTemplates[] = $t;
				}
			}
		} else {
			foreach ($templates as $t) {
				if ($t instanceof Template) {
					$checkTemplates[] = $t;
				}
			}
		}
		foreach ($checkTemplates as $tpl) {
			if ($tpl->fieldgroup === null || !$tpl->fieldgroup->hasField($field)) {
				continue;
			}
			$ctx = $tpl->fieldgroup->getFieldContext($field);
			if ($ctx instanceof Field && (bool) $ctx->useRoles && !$ctx->viewable(null, $user)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * @param array<string, mixed> $config
	 * @return list<string>
	 */
	private function resolveTemplateNames(array $config): array
	{
		$templates = $this->wire()->templates;
		$names = [];

		foreach ($this->normalizeStringList($config['templates'] ?? []) as $tplName) {
			$names[] = $tplName;
		}

		$rawIds = $config['templateIds'] ?? [];
		if (is_numeric($rawIds) && (int) $rawIds > 0) {
			$rawIds = [(int) $rawIds];
		}
		if (is_array($rawIds)) {
			foreach ($rawIds as $tid) {
				if (is_numeric($tid) && (int) $tid > 0) {
					$tpl = $templates->get((int) $tid);
					if ($tpl instanceof Template) {
						$names[] = (string) $tpl->name;
					}
				} elseif (is_string($tid) && trim($tid) !== '') {
					$names[] = trim($tid);
				}
			}
		}

		return array_values(array_unique(array_filter($names, static fn(string $s): bool => $s !== '')));
	}

	private function canReadPage(Page $page): bool
	{
		if ($page->isTrash()) {
			return false;
		}
		if ($this->wire()->user->isSuperuser()) {
			return true;
		}

		return $page->viewable() || $page->editable();
	}

	/**
	 * @param array<string, mixed> $config
	 */
	private function toRelationItem(Page $page, array $config): RelationItem
	{
		$valueField = $this->resolveValueField($config);
		$value = match ($valueField) {
			'name' => (string) $page->name,
			'path', 'url' => (string) $page->path,
			default => (int) $page->id,
		};

		$isSuperuser = (bool) $this->wire()->user->isSuperuser();
		$canViewTitle = $isSuperuser || $page->viewable('title', false);
		$title = $canViewTitle ? trim((string) $page->getUnformatted('title')) : '';
		if ($title === '') {
			$title = $canViewTitle ? trim((string) ($page->title ?: $page->name)) : (string) $page->name;
		}
		$pageTpl = $page->template instanceof Template ? $page->template : null;
		$tplName = $pageTpl !== null ? (string) $pageTpl->name : '';
		$tplIcon = $pageTpl !== null ? trim((string) $pageTpl->getIcon()) : '';
		$icon = $tplIcon !== '' ? $tplIcon : ((int) $page->id === 1 ? 'globe' : 'file-text');

		$status = 'published';
		if ($page->hasStatus(Page::statusUnpublished)) {
			$status = 'unpublished';
		} elseif ($page->hasStatus(Page::statusHidden)) {
			$status = 'hidden';
		}

		$thumbUrl = '';
		if ($pageTpl !== null && $pageTpl->fieldgroup !== null) {
			foreach ($pageTpl->fieldgroup as $field) {
				$ftName = (string) ($field->type?->className() ?? '');
				if ($ftName === 'FieldtypeImage' || str_ends_with($ftName, 'Image')) {
					if (!$isSuperuser && !$page->viewable($field, false)) {
						continue;
					}
					$imgVal = $page->getUnformatted((string) $field->name);
					$firstImg = $imgVal instanceof Pageimages ? $imgVal->first() : ($imgVal instanceof Pageimage ? $imgVal : null);
					if ($firstImg instanceof Pageimage) {
						try {
							$thumbUrl = (string) $firstImg->size(64, 64)->url;
						} catch (\Throwable) {
							$thumbUrl = (string) $firstImg->url;
						}
					}
					break;
				}
			}
		}

		$canEdit = $this->wire()->user->isSuperuser() || $page->editable();
		$editUrl = '';
		if ($canEdit) {
			try {
				$editUrl = (string) $page->editUrl();
			} catch (\Throwable) {
				$editUrl = '';
			}
		}

		$viewUrl = $page->viewable() ? (string) $page->url : '';
		$hasChildren = ((int) $page->numChildren) > 0;

		return new RelationItem(
			value: $value,
			resource: 'page',
			resourceLabel: $this->label(),
			label: $title !== '' ? $title : '#' . (int) $page->id,
			subtitle: (string) $page->path,
			badge: $tplName,
			icon: $icon,
			status: $status,
			thumbUrl: $thumbUrl,
			hasChildren: $hasChildren,
			parentId: (int) ($page->parent_id ?: 0),
			editUrl: $editUrl,
			viewUrl: $viewUrl,
			meta: [
				'id' => (int) $page->id,
				'name' => (string) $page->name,
				'path' => (string) $page->path,
				'template' => $tplName,
				'numChildren' => (int) $page->numChildren,
			],
		);
	}
}
