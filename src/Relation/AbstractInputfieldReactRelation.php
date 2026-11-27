<?php

declare(strict_types=1);

namespace Totoglu\React\Relation;

use ProcessWire\Field;
use ProcessWire\FieldtypeText;
use ProcessWire\Inputfield;
use ProcessWire\InputfieldCheckbox;
use ProcessWire\InputfieldInteger;
use ProcessWire\InputfieldSelect;
use ProcessWire\InputfieldText;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Page;
use ProcessWire\React;
use ProcessWire\WirePageEditor;
use Totoglu\React\Inertia\InputfieldReact;
use Totoglu\React\Security\AccessGuard;

/**
 * AbstractInputfieldReactRelation
 *
 * Shared base class for React standalone relational Inputfields:
 * - `InputfieldReactM2O` (`cardinality: 'm2o'`)
 * - `InputfieldReactM2M` (`cardinality: 'm2m'`)
 * - `InputfieldReactO2M` (`cardinality: 'o2m'`)
 * - `InputfieldReactM2A` (`cardinality: 'm2a'`)
 *
 * Operates without any custom `Fieldtype` across:
 * 1. Classic `ProcessPageEdit` (as an `InputfieldPage` delegate or `FieldtypeText` / `FieldtypeTextarea` `inputfieldClass`)
 * 2. Module configuration forms (`ConfigurableModule`)
 * 3. `React` `<SchemaForm />` (`FormSchemaSerializer`)
 */
abstract class AbstractInputfieldReactRelation extends InputfieldReact
{
	/**
	 * Option count threshold below which `widget: 'auto'` preloads options inline (`select` / `multiselect`).
	 */
	protected const AUTO_INLINE_THRESHOLD = 30;

	/**
	 * Maximum options preloaded inline for static/eager widgets (`select`, `radios`, `checkboxes`, `multiselect`, `transfer`).
	 */
	protected const MAX_EAGER_OPTIONS = 200;

	public function __construct()
	{
		parent::__construct();
		$this->set('resource', 'page');
		$this->set('valueField', '');
		$this->set('widget', 'auto');
		$this->set('selector', '');
		$this->set('templates', []);
		$this->set('templateIds', []);
		$this->set('parentId', 0);
		$this->set('fieldtypes', []);
		$this->set('roles', []);
		$this->set('prefix', '');
		$this->set('implements', '');
		$this->set('blueprintType', '');
		$this->set('includeSystem', false);
		$this->set('excludeGuest', true);
		$this->set('excludeSuperuser', false);
		$this->set('allowUnpub', false);
		$this->set('dependsOn', '');
		$this->set('dependsParam', '');
		$this->set('dependsResourceMap', []);
		$this->set('allowCustom', false);
		$this->set('creatable', false);
		$this->set('createParentId', 0);
		$this->set('createTemplate', '');
		$this->set('editableLink', true);
		$this->set('placeholder', '');
		$this->set('readOnly', false);
		$this->set('limit', 25);
	}

	/**
	 * Return canonical cardinality identifier (`'m2o'`, `'m2m'`, `'o2m'`, `'m2a'`).
	 */
	abstract public function cardinality(): string;

	public function inertiaComponent(): string
	{
		return $this->className();
	}

	/**
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		return React::instance($this)->resolveModuleAssetUrl('InputfieldReactRelation.js');
	}

	/**
	 * Accept `InputfieldSupportsPageSelector` selector assignments from direct PHP callers while
	 * returning `false` on empty probe calls (`setPageSelector('')`) so `InputfieldPage` passes
	 * `parent_id`, `template_id`, `template_ids`, and `findPagesSelector` cleanly without forcing `parent_id=`.
	 */
	public function setPageSelector(mixed $selector): bool
	{
		$str = is_scalar($selector) ? trim((string) $selector) : '';
		if ($str === '') {
			return false;
		}
		$this->set('selector', $str);

		return true;
	}

	/**
	 * Determine whether this Inputfield is currently attached to a `FieldtypeText` / `FieldtypeTextarea` Page field.
	 */
	protected function isBoundToTextFieldtype(): bool
	{
		$ft = $this->getSetting('hasFieldtype') ?? $this->get('hasFieldtype');
		if ($ft instanceof FieldtypeText) {
			return true;
		}

		$field = $this->getSetting('hasField') ?? $this->get('hasField');

		return $field instanceof Field && $field->type instanceof FieldtypeText;
	}

	/**
	 * Resolve the host Page ID when rendered inside `ProcessPageEdit` or attached to `hasPage`.
	 */
	protected function resolveHostPageId(): int
	{
		$hasPage = $this->getSetting('hasPage') ?? $this->get('hasPage');
		if ($hasPage instanceof Page && (int) $hasPage->id > 0) {
			return (int) $hasPage->id;
		}

		$process = $this->wire()->process;
		if ($process instanceof WirePageEditor) {
			$edited = $process->getPage();
			if ($edited instanceof Page && (int) $edited->id > 0) {
				return (int) $edited->id;
			}
		}

		return 0;
	}

	/**
	 * Build the server-side relation configuration array signed into `relationToken`.
	 *
	 * Seamlessly merges both standalone settings (`parentId`, `templateIds`, `selector`)
	 * and `InputfieldPage` delegate settings (`parent_id`, `template_id`, `template_ids`, `findPagesSelector`).
	 *
	 * @return array<string, mixed>
	 */
	public function buildRelationConfig(): array
	{
		$cardinality = $this->cardinality();
		$rawResource = strtolower(trim((string) ($this->getSetting('resource') ?: 'page')));
		if ($cardinality === 'o2m') {
			$targetRes = strtolower(trim((string) ($this->getSetting('targetResource') ?: $rawResource)));
			$rawResource = $targetRes !== '' ? $targetRes : 'page';
		}

		$parentId = (int) ($this->getSetting('parentId') ?: $this->getSetting('parent_id') ?: 0);

		$templateIds = [];
		foreach (['templateIds', 'template_ids', 'template_id'] as $tplKey) {
			$cand = $this->getSetting($tplKey) ?? $this->get($tplKey);
			if (is_numeric($cand) && (int) $cand > 0) {
				$templateIds[] = (int) $cand;
			} elseif (is_array($cand)) {
				foreach ($cand as $item) {
					if (is_numeric($item) && (int) $item > 0) {
						$templateIds[] = (int) $item;
					} elseif (is_string($item) && trim($item) !== '') {
						$templateIds[] = trim($item);
					}
				}
			}
		}
		$templateIds = array_values(array_unique($templateIds));

		$templates = $this->normalizeListSetting($this->getSetting('templates'));
		$selectorParts = [];
		$explicitSelector = trim((string) ($this->getSetting('selector') ?? ''));
		$findPagesSelector = trim((string) ($this->getSetting('findPagesSelector') ?? $this->get('findPagesSelector') ?? ''));
		if ($explicitSelector !== '') {
			$selectorParts[] = $explicitSelector;
		}
		if ($findPagesSelector !== '' && $findPagesSelector !== $explicitSelector) {
			$selectorParts[] = $findPagesSelector;
		}

		$allowedResources = $this->normalizeListSetting($this->getSetting('allowedResources'));
		if ($cardinality === 'm2a' && $allowedResources === []) {
			$allowedResources = ['page', 'template'];
		}

		$dependsResourceMapRaw = $this->getSetting('dependsResourceMap') ?? $this->get('dependsResourceMap');
		$dependsResourceMap = [];
		if (is_array($dependsResourceMapRaw)) {
			foreach ($dependsResourceMapRaw as $depVal => $targetResName) {
				if (is_string($targetResName) && trim($targetResName) !== '') {
					$dependsResourceMap[(string) $depVal] = strtolower(trim($targetResName));
				}
			}
			if ($dependsResourceMap !== []) {
				$allowedResources = array_values(array_unique(array_merge(
					$allowedResources,
					[$rawResource],
					array_values($dependsResourceMap)
				)));
			}
		}

		$ownerId = $this->getSetting('ownerId');
		if (($ownerId === null || $ownerId === '' || $ownerId === 0) && $cardinality === 'o2m') {
			$ownerId = $this->resolveHostPageId();
		}

		$isReadOnly = $this->isEffectivelyReadOnly();

		$creatable = !$isReadOnly && (bool) ($this->getSetting('creatable') || $this->getSetting('addable'));
		$allowLink = !$isReadOnly && (bool) ($this->getSetting('allowLink') ?? true);
		$allowUnlink = !$isReadOnly && (bool) ($this->getSetting('allowUnlink') ?? true);

		return [
			'cardinality' => $cardinality,
			'resource' => $rawResource,
			'allowedResources' => $allowedResources,
			'dependsResourceMap' => $dependsResourceMap,
			'dependsParam' => trim((string) ($this->getSetting('dependsParam') ?? '')),
			'valueField' => trim((string) ($this->getSetting('valueField') ?? '')),
			'selector' => implode(', ', $selectorParts),
			'templateIds' => $templateIds,
			'templates' => $templates,
			'parentId' => $parentId,
			'fieldtypes' => $this->normalizeListSetting($this->getSetting('fieldtypes')),
			'roles' => $this->normalizeListSetting($this->getSetting('roles')),
			'prefix' => trim((string) ($this->getSetting('prefix') ?? '')),
			'implements' => trim((string) ($this->getSetting('implements') ?? '')),
			'blueprintType' => trim((string) ($this->getSetting('blueprintType') ?? '')),
			'includeSystem' => (bool) $this->getSetting('includeSystem'),
			'excludeGuest' => (bool) ($this->getSetting('excludeGuest') ?? true),
			'excludeSuperuser' => (bool) $this->getSetting('excludeSuperuser'),
			'allowUnpub' => (bool) $this->getSetting('allowUnpub'),
			'readOnly' => $isReadOnly,
			'creatable' => $creatable,
			'createParentId' => (int) ($this->getSetting('createParentId') ?: $parentId),
			'createTemplate' => trim((string) ($this->getSetting('createTemplate') ?? '')),
			'allowLink' => $allowLink,
			'allowUnlink' => $allowUnlink,
			'targetResource' => $rawResource,
			'foreignField' => trim((string) ($this->getSetting('foreignField') ?? '')),
			'ownerId' => $ownerId ?? '',
			'limit' => max(5, min(200, (int) ($this->getSetting('limit') ?: 25))),
		];
	}

	/**
	 * Resolve concrete UI widget name from `'auto'` or configured widget alias.
	 *
	 * @param array<string, mixed> $config
	 */
	protected function resolveConcreteWidget(array $config, ?RelationResourceInterface $adapter = null): string
	{
		$cardinality = $this->cardinality();
		$raw = strtolower(trim((string) ($this->getSetting('widget') ?: 'auto')));

		if ($cardinality === 'o2m') {
			$layout = strtolower(trim((string) ($this->getSetting('layout') ?: ($raw !== 'auto' ? $raw : 'subtable'))));
			return in_array($layout, ['subtable', 'cards', 'list'], true) ? $layout : 'subtable';
		}

		if ($cardinality === 'm2a') {
			return in_array($raw, ['morph', 'morph-picker', 'picker'], true)
				? ($raw === 'picker' ? 'morph-picker' : $raw)
				: 'morph';
		}

		if ($raw !== '' && $raw !== 'auto') {
			return match ($raw) {
				'asmselect' => 'multiselect',
				'multicheckbox' => 'checkboxes',
				'radio' => 'radios',
				'tree' => 'treeselect',
				'shuttle' => 'transfer',
				'drawer' => 'picker',
				default => $raw,
			};
		}

		$total = 0;
		if ($adapter !== null) {
			try {
				$total = $adapter->count($config);
			} catch (\Throwable) {
				$total = 0;
			}
		}

		if ($cardinality === 'm2o') {
			if ($total > 0 && $total <= self::AUTO_INLINE_THRESHOLD) {
				return 'select';
			}
			if ($adapter !== null && $adapter->supportsTree() && (int) ($config['parentId'] ?? 0) >= 0 && empty($config['templates']) && empty($config['templateIds'])) {
				return 'treeselect';
			}
			return 'autocomplete';
		}

		if ($total > 0 && $total <= self::AUTO_INLINE_THRESHOLD) {
			return 'multiselect';
		}

		return 'multiautocomplete';
	}

	/**
	 * Build the unified `RelationField` Inertia/SchemaForm data payload.
	 *
	 * @return array<string, mixed>
	 */
	public function inertiaWithData(): array
	{
		$workspace = $this->react();
		$registry = $workspace->relations();
		$signer = $workspace->relationSigner();
		$config = $this->buildRelationConfig();
		$cardinality = $this->cardinality();
		$resourceName = (string) ($config['resource'] ?? 'page');

		$adapter = $registry->has($resourceName) ? $registry->get($resourceName) : null;
		$resolvedWidget = $this->resolveConcreteWidget($config, $adapter);

		$isReadOnly = !empty($config['readOnly']);

		$rawNameAttr = $this->stringAttr('name');
		$rawIdAttr = $this->stringAttr('id');
		$inputName = $rawNameAttr !== '' ? $rawNameAttr : ($rawIdAttr !== '' ? $rawIdAttr : 'pw_relation');
		$normalizedValue = $this->serializeValueForProps($this->attr('value'));

		// Hydrate currently selected items
		$selectedItems = [];
		if ($cardinality === 'm2a') {
			$morphTokens = is_array($normalizedValue)
				? array_values(array_map('strval', $normalizedValue))
				: ($normalizedValue !== '' && $normalizedValue !== null ? [(string) $normalizedValue] : []);
			if ($morphTokens !== []) {
				foreach ($registry->hydrateMorphTokens($morphTokens, $config['allowedResources'] ?? [], $config) as $item) {
					$selectedItems[] = $item->toArray();
				}
			}
		} elseif ($cardinality === 'o2m') {
			$ownerId = $config['ownerId'] ?? '';
			$foreignField = (string) ($config['foreignField'] ?? '');
			if ($adapter !== null && $ownerId !== '' && $ownerId !== 0 && $foreignField !== '') {
				$rev = $adapter->queryReverse($ownerId, $foreignField, ['page' => 1, 'limit' => $config['limit'] ?? 25], $config);
				foreach ($rev['items'] as $item) {
					$selectedItems[] = $item->toArray();
				}
			}
		} elseif ($adapter !== null) {
			/** @var list<int|string> $valList */
			$valList = [];
			$rawCandidates = is_array($normalizedValue)
				? $normalizedValue
				: ($normalizedValue !== '' && $normalizedValue !== null && $normalizedValue !== 0 ? [$normalizedValue] : []);
			foreach ($rawCandidates as $candidate) {
				if (is_int($candidate) || is_string($candidate)) {
					$valList[] = $candidate;
				} elseif (is_scalar($candidate)) {
					$valList[] = (string) $candidate;
				}
			}
			if ($valList !== []) {
				$hydratedItems = $adapter->hydrate($valList, $config);
				if ($hydratedItems === [] && !empty($config['dependsResourceMap']) && is_array($config['dependsResourceMap'])) {
					foreach (array_unique(array_values($config['dependsResourceMap'])) as $altRes) {
						$altName = strtolower(trim((string) $altRes));
						if ($altName === '' || $altName === $resourceName || !$registry->has($altName)) {
							continue;
						}
						$hydratedItems = $registry->get($altName)->hydrate($valList, $config);
						if ($hydratedItems !== []) {
							break;
						}
					}
				}
				foreach ($hydratedItems as $item) {
					$selectedItems[] = $item->toArray();
				}
			}
		}

		// Eagerly preload options for static/bounded widgets when no unresolved `dependsOn` exists
		$dependsOn = trim((string) ($this->getSetting('dependsOn') ?? ''));
		$initialOptions = [];
		$eagerWidgets = ['select', 'radios', 'radio-cards', 'multiselect', 'checkboxes', 'transfer'];
		if ($adapter !== null && $dependsOn === '' && in_array($resolvedWidget, $eagerWidgets, true)) {
			try {
				$queried = $adapter->query(['page' => 1, 'limit' => self::MAX_EAGER_OPTIONS], $config);
				foreach ($queried['items'] as $optItem) {
					$initialOptions[] = $optItem->toArray();
				}
			} catch (\Throwable) {
				$initialOptions = [];
			}
		}

		// Preload root tree level for `treeselect`
		$initialTree = [];
		if ($adapter !== null && $resolvedWidget === 'treeselect' && $adapter->supportsTree()) {
			try {
				foreach ($adapter->tree((int) ($config['parentId'] ?? 0), $config) as $treeItem) {
					$initialTree[] = $treeItem->toArray();
				}
			} catch (\Throwable) {
				$initialTree = [];
			}
		}

		$resourceList = $cardinality === 'm2a'
			? ($config['allowedResources'] ?? [])
			: (!empty($config['dependsResourceMap']) ? array_values(array_unique(array_merge([$resourceName], array_values($config['dependsResourceMap'])))) : [$resourceName]);
		$resourcesMeta = $registry->describeResources($resourceList);
		$anySupportsQuickCreate = $adapter?->supportsQuickCreate() ?? false;
		if (!$anySupportsQuickCreate) {
			foreach ($resourcesMeta as $resMeta) {
				if (!empty($resMeta['supportsQuickCreate'])) {
					$anySupportsQuickCreate = true;
					break;
				}
			}
		}

		$rootUrl = rtrim((string) ($this->wire()->config->urls->root ?: '/'), '/');
		$valueField = trim((string) ($config['valueField'] ?? ''));
		if ($valueField === '' && $adapter !== null) {
			$valueField = $adapter->defaultValueField();
		}

		return [
			'name' => $inputName,
			'cardinality' => $cardinality,
			'resource' => $resourceName,
			'resourceLabel' => $adapter?->label() ?? ucfirst($resourceName),
			'resourceIcon' => $adapter?->icon() ?? 'cube',
			'resources' => $resourcesMeta,
			'allowedResources' => $config['allowedResources'] ?? [],
			'dependsResourceMap' => $config['dependsResourceMap'] ?? [],
			'valueField' => $valueField !== '' ? $valueField : 'id',
			'widget' => $resolvedWidget,
			'configuredWidget' => (string) ($this->getSetting('widget') ?: 'auto'),
			'endpoint' => $rootUrl . '/_react/relation',
			'relationToken' => AccessGuard::isAuthenticated($this->wire()->user) ? $signer->sign($config) : '',
			'value' => $normalizedValue,
			'selectedItems' => $selectedItems,
			'initialOptions' => $initialOptions,
			'initialTree' => $initialTree,
			'multiple' => $cardinality === 'm2m' || ($cardinality === 'm2a' && (bool) ($this->getSetting('multiple') ?? true)),
			'sortable' => (bool) ($this->getSetting('sortable') ?? true),
			'minItems' => max(0, (int) ($this->getSetting('minItems') ?? 0)),
			'maxItems' => max(0, (int) ($this->getSetting('maxItems') ?? 0)),
			'optionColumns' => max(0, (int) ($this->getSetting('optionColumns') ?? 0)),
			'dependsOn' => $dependsOn,
			'allowCustom' => (bool) $this->getSetting('allowCustom'),
			'creatable' => (bool) ($config['creatable'] ?? false) && $anySupportsQuickCreate,
			'editableLink' => (bool) ($this->getSetting('editableLink') ?? true),
			'allowLink' => (bool) ($config['allowLink'] ?? true),
			'allowUnlink' => (bool) ($config['allowUnlink'] ?? true),
			'foreignField' => (string) ($config['foreignField'] ?? ''),
			'ownerId' => $config['ownerId'] ?? '',
			'placeholder' => trim((string) ($this->getSetting('placeholder') ?: $this->attr('placeholder') ?: '')),
			'readOnly' => $isReadOnly,
		];
	}

	/**
	 * Render clean human-readable badges/labels in ProcessWire locked / `renderValue()` contexts.
	 */
	public function ___renderValue(): string
	{
		$prevRenderValue = $this->get('renderValueMode');
		$this->setQuietly('renderValueMode', true);
		try {
			$data = $this->inertiaWithData();
		} finally {
			$this->setQuietly('renderValueMode', $prevRenderValue);
		}
		$items = is_array($data['selectedItems'] ?? null) ? $data['selectedItems'] : [];
		if ($items === []) {
			$raw = $data['value'] ?? '';
			if (is_scalar($raw) && trim((string) $raw) !== '' && (string) $raw !== '0') {
				$safe = htmlspecialchars((string) $raw, ENT_QUOTES, 'UTF-8');
				return "<span class=\"rw-relation-readonly\">{$safe}</span>";
			}
			return '<span class="rw-relation-empty">—</span>';
		}

		$badges = [];
		foreach ($items as $item) {
			if (!is_array($item)) {
				continue;
			}
			$label = htmlspecialchars((string) ($item['label'] ?? $item['value'] ?? ''), ENT_QUOTES, 'UTF-8');
			$resBadge = htmlspecialchars((string) ($item['badge'] ?? $item['resourceLabel'] ?? ''), ENT_QUOTES, 'UTF-8');
			$suffix = $resBadge !== '' ? " <small>({$resBadge})</small>" : '';
			$badges[] = "<span class=\"rw-relation-pill\">{$label}{$suffix}</span>";
		}

		return '<div class="rw-relation-values">' . implode(' ', $badges) . '</div>';
	}

	/**
	 * Shared configuration fields for `Setup > Fields` and standalone Inputfield configuration.
	 */
	protected function appendBaseRelationConfigFields(InputfieldWrapper $inputfields, bool $includeResourceField = true): void
	{
		$modules = $this->wire()->modules;

		if ($includeResourceField) {
			/** @var InputfieldSelect|null $resSelect */
			$resSelect = $modules->get('InputfieldSelect');
			if ($resSelect !== null) {
				$resSelect->attr('name', 'resource');
				$resSelect->label = $this->_('Target Resource');
				$resSelect->description = $this->_('Select the ProcessWire or registered resource this field references.');
				foreach ($this->react()->relations()->describeResources() as $desc) {
					$resSelect->addOption($desc['name'], sprintf('%s (%s)', $desc['label'], $desc['name']));
				}
				$resSelect->val((string) ($this->getSetting('resource') ?: 'page'));
				$resSelect->columnWidth = 34;
				$inputfields->add($resSelect);
			}

			/** @var InputfieldSelect|null $valFieldSelect */
			$valFieldSelect = $modules->get('InputfieldSelect');
			if ($valFieldSelect !== null) {
				$valFieldSelect->attr('name', 'valueField');
				$valFieldSelect->label = $this->_('Stored Value Attribute');
				$valFieldSelect->addOptions([
					'' => $this->_('Resource Default (ID for Page/User, Name for Template/Field/Role)'),
					'id' => $this->_('Numeric / UUID ID (id)'),
					'name' => $this->_('Slug / Machine Name (name)'),
					'path' => $this->_('Page Path (path)'),
				]);
				$valFieldSelect->val((string) $this->getSetting('valueField'));
				$valFieldSelect->columnWidth = 33;
				$inputfields->add($valFieldSelect);
			}
		}

		/** @var InputfieldText|null $selectorField */
		$selectorField = $modules->get('InputfieldText');
		if ($selectorField !== null) {
			$selectorField->attr('name', 'selector');
			$selectorField->label = $this->_('Filter Selector');
			$selectorField->description = $this->_('Optional server-signed ProcessWire selector constraint (e.g. template=blog-post, sort=-created).');
			$selectorField->val((string) $this->getSetting('selector'));
			$selectorField->columnWidth = 50;
			$inputfields->add($selectorField);
		}

		/** @var InputfieldInteger|null $parentIdField */
		$parentIdField = $modules->get('InputfieldInteger');
		if ($parentIdField !== null) {
			$parentIdField->attr('name', 'parentId');
			$parentIdField->label = $this->_('Root Parent Page ID');
			$parentIdField->val((int) $this->getSetting('parentId'));
			$parentIdField->columnWidth = 25;
			$inputfields->add($parentIdField);
		}

		/** @var InputfieldText|null $dependsOnField */
		$dependsOnField = $modules->get('InputfieldText');
		if ($dependsOnField !== null) {
			$dependsOnField->attr('name', 'dependsOn');
			$dependsOnField->label = $this->_('Depends On Field');
			$dependsOnField->description = $this->_('Optional sibling field name for cascading filtering.');
			$dependsOnField->val((string) $this->getSetting('dependsOn'));
			$dependsOnField->columnWidth = 25;
			$inputfields->add($dependsOnField);
		}

		/** @var InputfieldCheckbox|null $creatableField */
		$creatableField = $modules->get('InputfieldCheckbox');
		if ($creatableField !== null) {
			$creatableField->attr('name', 'creatable');
			$creatableField->label = $this->_('Allow Inline Quick Create');
			$creatableField->attr('checked', (bool) $this->getSetting('creatable') ? 'checked' : '');
			$creatableField->columnWidth = 34;
			$inputfields->add($creatableField);
		}

		/** @var InputfieldCheckbox|null $allowCustomField */
		$allowCustomField = $modules->get('InputfieldCheckbox');
		if ($allowCustomField !== null) {
			$allowCustomField->attr('name', 'allowCustom');
			$allowCustomField->label = $this->_('Allow Custom Free-Text Value');
			$allowCustomField->attr('checked', (bool) $this->getSetting('allowCustom') ? 'checked' : '');
			$allowCustomField->columnWidth = 33;
			$inputfields->add($allowCustomField);
		}

		/** @var InputfieldCheckbox|null $editableLinkField */
		$editableLinkField = $modules->get('InputfieldCheckbox');
		if ($editableLinkField !== null) {
			$editableLinkField->attr('name', 'editableLink');
			$editableLinkField->label = $this->_('Show Quick Edit Link');
			$editableLinkField->attr('checked', (bool) ($this->getSetting('editableLink') ?? true) ? 'checked' : '');
			$editableLinkField->columnWidth = 33;
			$inputfields->add($editableLinkField);
		}
	}

	/**
	 * Allow overriding relational settings per-template context (`Setup > Templates > [Template] > Field`).
	 *
	 * @param Field $field
	 * @return array<int, string>
	 */
	public function ___getConfigAllowContext($field): array
	{
		return array_merge(parent::___getConfigAllowContext($field), [
			'resource',
			'valueField',
			'widget',
			'selector',
			'parentId',
			'dependsOn',
			'creatable',
			'allowCustom',
			'editableLink',
		]);
	}

	/**
	 * @return list<string>
	 */
	protected function normalizeListSetting(mixed $raw): array
	{
		if (is_string($raw)) {
			$parts = preg_split('/[\s,|]+/', trim($raw)) ?: [];
			return array_values(array_filter(array_map('trim', $parts), static fn(string $s): bool => $s !== ''));
		}
		if (is_array($raw)) {
			$out = [];
			foreach ($raw as $v) {
				if (is_scalar($v) && trim((string) $v) !== '') {
					$out[] = trim((string) $v);
				}
			}
			return array_values(array_unique($out));
		}

		return [];
	}
}
