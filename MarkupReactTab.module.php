<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\Inertia\Contracts\InertiaSerializable;
use Totoglu\Inertia\InteractWithInertia;
use Totoglu\React\Inertia\InteractWithReactTranslations;

/**
 * Tabbed Fieldset Container Markup Module (`MarkupReactTab`).
 *
 * Acts as an accessible WAI-ARIA tabbed interface (`line`, `segmented`, or `vertical`)
 * backed by `MarkupReactTab` (`dist/MarkupReactTab.js`) and `React` Inertia runtime,
 * while remaining compatible with `InputfieldWrapper` / `InputfieldForm` hierarchies.
 *
 * Can be used in two ways:
 * 1. **Tab Group Container:** Add child `MarkupReactTab` panes via `$tabs->addTab('general', 'General', 'sliders')`
 *    or `$tabs->add($childTab)`.
 * 2. **Single Tab Pane:** Created via `addTab()` or `type: tab` in a schema;
 *    holds standard ProcessWire `Inputfield` children.
 *
 * @property string $variant Visual tab style: `'line'` (default), `'segmented'` (compact pill bar), or `'vertical'`
 * @property string $activeTab Name or ID of the initially active tab pane
 * @property string $badge Optional badge text displayed on this tab button
 * @property bool $active Whether this tab pane is explicitly marked as active
 * @property bool $lazyLoad Whether inactive tab panes defer DOM mounting until opened
 * @property string $group Optional tab group identifier when grouping sibling tabs
 */
class MarkupReactTab extends InputfieldFieldset implements InertiaSerializable
{
	use InteractWithInertia;
	use InteractWithReactTranslations;

	/**
	 * Supported visual variants for the tab bar.
	 *
	 * @var list<string>
	 */
	public const VARIANTS = [
		'line',
		'segmented',
		'vertical',
	];

	/**
	 * Internal flag set while a parent `MarkupReactTab` group is rendering this instance as a child pane.
	 */
	private bool $renderingAsPane = false;

	/**
	 * Guard preventing redundant recursive `renderReady()` traversals across a single render lifecycle.
	 */
	private bool $renderReadyDone = false;

	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => __('React Tab Viewport & Container', __FILE__),
			'version' => 10,
			'summary' => __('Organize fields and panels into accessible tabs (line, segmented, or vertical layout).', __FILE__),
			'author' => 'Iskender TOTOGLU @trk @ukyo',
			'icon' => 'folder-o',
			'requires' => [
				'PHP>=8.4',
				'ProcessWire>=3.0.271',
				'Inertia',
				'React',
			],
		];
	}

	public function __construct()
	{
		parent::__construct();

		$this->set('variant', 'line');
		$this->set('activeTab', '');
		$this->set('badge', '');
		$this->set('active', false);
		$this->set('lazyLoad', true);
		$this->set('group', '');
		$this->collapsed = Inputfield::collapsedNever;
		$this->skipLabel = Inputfield::skipLabelMarkup | Inputfield::skipLabelBlank;
		$this->addClass('InputfieldHeaderHidden pw-rw-tab-group-field', 'wrapClass');
		$this->renderReadyDone = false;
	}

	public function init(): void
	{
		parent::init();

		$this->set('variant', 'line');
		$this->set('activeTab', '');
		$this->set('badge', '');
		$this->set('active', false);
		$this->set('lazyLoad', true);
		$this->set('group', '');
		$this->collapsed = Inputfield::collapsedNever;
		$this->skipLabel = Inputfield::skipLabelMarkup | Inputfield::skipLabelBlank;
		$this->addClass('InputfieldHeaderHidden pw-rw-tab-group-field', 'wrapClass');
		$this->renderReadyDone = false;
	}

	public function __clone()
	{
		parent::__clone();
		$this->renderingAsPane = false;
		$this->renderReadyDone = false;
	}

	/**
	 * Tab containers are structural layout wrappers and should never be treated as empty
	 * by ProcessWire's `InputfieldWrapper::___render()` auto-collapse checks.
	 */
	public function isEmpty(): bool
	{
		return false;
	}

	/**
	 * Create, wire, and append a child `MarkupReactTab` pane to this tab group container.
	 */
	public function addTab(
		string $name,
		string $label = '',
		string $icon = '',
		string $description = '',
		string $badge = '',
	): self {
		$modules = $this->wire()->modules;
		/** @var self|null $tab */
		$tab = $modules->get('MarkupReactTab');
		if (!$tab instanceof self) {
			$tab = new self();
			$this->wire($tab);
		}

		$cleanName = trim($name) !== '' ? trim($name) : ('tab_' . ($this->children()->count() + 1));
		$tab->attr('id+name', $cleanName);
		$tab->label = trim($label) !== ''
			? trim($label)
			: ucwords(str_replace(['_', '-'], ' ', $cleanName));

		if (trim($icon) !== '') {
			$tab->icon = trim($icon);
		}
		if (trim($description) !== '') {
			$tab->description = trim($description);
		}
		if (trim($badge) !== '') {
			$tab->set('badge', trim($badge));
		}

		$spacing = (int) ($this->getSetting('columnWidthSpacing') ?: ($this->wire()->config->inputfieldColumnWidthSpacing ?? 0));
		$tab->set('columnWidthSpacing', $spacing);
		$tab->set('lazyLoad', null);

		$this->add($tab);

		return $tab;
	}

	/**
	 * Configure tab panes and container properties fluently.
	 *
	 * @param list<array<string, mixed>>|array<string, mixed> $tabs
	 * @param array<string, mixed> $props
	 */
	public function configure(array $tabs = [], array $props = []): self
	{
		if ($tabs !== [] && !array_is_list($tabs) && $props === []) {
			$props = $tabs;
			$tabs = isset($props['tabs']) && is_array($props['tabs']) ? array_values($props['tabs']) : [];
		}

		foreach ($props as $key => $value) {
			if (!is_string($key) || $key === 'tabs') {
				continue;
			}
			if ($key === 'id' || $key === 'name') {
				$this->attr($key, (string) $value);
			} else {
				$this->set($key, $value);
			}
		}

		$tabNum = 0;
		foreach ($tabs as $tabSpec) {
			$tabNum++;
			if (!is_array($tabSpec)) {
				continue;
			}
			$name = trim((string) ($tabSpec['name'] ?? $tabSpec['id'] ?? ('tab_' . $tabNum)));
			$label = (string) ($tabSpec['label'] ?? $tabSpec['title'] ?? $name);
			$icon = (string) ($tabSpec['icon'] ?? '');
			$description = (string) ($tabSpec['description'] ?? '');
			$badge = (string) ($tabSpec['badge'] ?? '');
			$pane = $this->addTab($name, $label, $icon, $description, $badge);
			if (array_key_exists('lazyLoad', $tabSpec)) {
				$pane->set('lazyLoad', (bool) $tabSpec['lazyLoad']);
			}
		}

		return $this;
	}

	/**
	 * Whether this `MarkupReactTab` acts as a group container holding child `MarkupReactTab` panes.
	 */
	public function hasTabChildren(): bool
	{
		foreach ($this->children() as $child) {
			if ($child instanceof self) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Count validation errors across all descendant `Inputfield`s inside this tab pane.
	 */
	public function countErrors(): int
	{
		$count = count($this->getErrors());
		foreach ($this->getAll() as $descendant) {
			if (!$descendant instanceof Inputfield || $descendant instanceof InputfieldWrapper) {
				continue;
			}
			if (
				$descendant->getErrors() === []
				&& (
					$descendant->hasClass('InputfieldStateError', 'wrapClass')
					|| str_contains((string) $descendant->getSetting('wrapClass'), 'InputfieldStateError')
				)
			) {
				$count++;
			}
		}

		return $count;
	}

	private function stringAttr(string $key): string
	{
		$val = $this->attr($key);

		return is_scalar($val) ? trim((string) $val) : '';
	}

	/**
	 * Process input across child tab panes, skipping any pane whose client-side lazy marker
	 * (`pw_tab_lazy_<domId> === '1'`) indicates its `<template>` was never hydrated in the browser.
	 */
	public function ___processInput(WireInputData $input): self
	{
		if ($this->renderingAsPane || !$this->hasTabChildren()) {
			parent::___processInput($input);

			return $this;
		}

		$rawGroupId = $this->stringAttr('id') ?: ($this->stringAttr('name') ?: 'pw_tab_group');
		$groupId = (string) preg_replace('/[^a-zA-Z0-9_-]/', '_', $rawGroupId);
		$panes = $this->collectRenderablePanes();

		$groupLazyLoad = (bool) $this->getSetting('lazyLoad');

		foreach ($panes as $idx => $pane) {
			$rawKey = $pane->stringAttr('name') ?: ($pane->stringAttr('id') ?: ('tab_' . ($idx + 1)));
			$cleanKey = (string) preg_replace('/[^a-zA-Z0-9_-]/', '_', $rawKey);
			$domId = $groupId . '__' . $cleanKey;
			$lazyMarker = $input['pw_tab_lazy_' . $domId] ?? null;
			$paneLazySetting = $pane->getSetting('lazyLoad');
			$canBeLazy = $paneLazySetting !== null ? (bool) $paneLazySetting : $groupLazyLoad;

			if ($canBeLazy && (string) $lazyMarker === '1') {
				$pane->setQuietly('_pwTabUnloaded', true);
				foreach ($pane->getAll(['withWrappers' => true]) as $descendant) {
					if (!$descendant instanceof Inputfield) {
						continue;
					}
					$descendant->setQuietly('_pwTabUnloaded', true);
					if (
						!$descendant instanceof InputfieldWrapper
						&& (bool) $descendant->getSetting('required')
						&& trim((string) $descendant->getSetting('requiredIf')) === ''
						&& trim((string) $descendant->getSetting('showIf')) === ''
						&& $descendant->isEmpty()
					) {
						$reqMsg = (string) ($descendant->getSetting('requiredLabel') ?: $this->requiredLabel);
						$descendant->error($reqMsg !== '' ? $reqMsg : 'Missing required value');
					}
				}
				continue;
			}

			$pane->setQuietly('_pwTabUnloaded', false);
			foreach ($pane->getAll(['withWrappers' => true]) as $descendant) {
				if ($descendant instanceof Inputfield) {
					$descendant->setQuietly('_pwTabUnloaded', false);
				}
			}

			$prevRendering = $pane->renderingAsPane;
			$pane->renderingAsPane = true;
			try {
				$pane->processInput($input);
			} finally {
				$pane->renderingAsPane = $prevRendering;
			}
		}

		return $this;
	}

	/**
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		return React::instance($this)->resolveModuleAssetUrl('MarkupReactTab.js');
	}

	/**
	 * Prepare assets and outer header visibility before rendering.
	 *
	 * @param Inputfield|null $parent
	 * @param bool $renderValueMode
	 */
	public function renderReady(?Inputfield $parent = null, $renderValueMode = false): bool
	{
		if ($this->renderReadyDone) {
			return true;
		}
		$this->renderReadyDone = true;

		$config = $this->wire()->config;

		if (!$this->renderingAsPane) {
			$this->addClass('pw-rw-tab-group-field', 'wrapClass');
			if (trim((string) $this->label) === '') {
				$this->collapsed = Inputfield::collapsedNever;
				$this->skipLabel = Inputfield::skipLabelMarkup;
				$this->addClass('InputfieldHeaderHidden', 'wrapClass');
			}
		}

		$spacing = (int) ($this->getSetting('columnWidthSpacing') ?: ($config->inputfieldColumnWidthSpacing ?? 0));
		$this->set('columnWidthSpacing', $spacing);

		foreach ($this->children() as $child) {
			if ($child instanceof InputfieldWrapper) {
				$child->set('columnWidthSpacing', $spacing);
			}
			if ($child instanceof self) {
				$child->renderingAsPane = true;
			}
		}

		if (!$this->renderingAsPane) {
			foreach ($this->getAll(['withWrappers' => true]) as $descendant) {
				if ($descendant instanceof InputfieldWrapper) {
					$descendant->set('columnWidthSpacing', $spacing);
				}
				if ($descendant instanceof self) {
					$descendant->renderingAsPane = true;
				}
				if ($descendant instanceof Inputfield) {
					$descendant->renderReady($this, $renderValueMode);
				}
			}
		}

		$result = parent::renderReady($parent, $renderValueMode);

		if (!$this->renderingAsPane) {
			$this->enqueueInertiaIslandAssets();
			$result = true;
		}

		return $result;
	}

	/**
	 * @return array<string, mixed>
	 */
	public function inertiaShared(): array
	{
		return $this->buildReactTranslationSharedProps();
	}

	public function inertiaComponent(): string
	{
		return 'MarkupReactTab';
	}

	/**
	 * @param array<string, mixed> $pageObject
	 * @return array<string, mixed>
	 */
	public function inertiaViewData(array $pageObject = []): array
	{
		$workspace = React::instance($this);

		return [
			'scripts' => $workspace->resolveInertiaScriptAssets($this->getModuleScriptAssets()),
			'styles' => $workspace->resolveInertiaStyleAssets(),
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	public function inertiaWithData(): array
	{
		return $this->buildTabbedPayload(false);
	}

	/**
	 * @return array<string, mixed>
	 */
	public function toInertiaProp(): array
	{
		return [
			'component' => $this->inertiaComponent(),
			'id' => $this->stringAttr('id'),
			'name' => $this->stringAttr('name'),
			'label' => (string) $this->label,
			'description' => (string) $this->description,
			'notes' => (string) $this->notes,
			'icon' => (string) $this->icon,
			'props' => $this->inertiaWithData(),
		];
	}

	/**
	 * Render either the React island mount node (when acting as a tab group or standalone tab)
	 * or the inner `InputfieldWrapper` grid (when rendered as a child pane by a parent `MarkupReactTab`).
	 */
	public function ___render(): string
	{
		if ($this->renderingAsPane) {
			return parent::___render() . "\n";
		}

		$panes = $this->collectRenderablePanes();
		if ($panes === []) {
			return '';
		}

		return $this->renderTabbedIsland(false, $panes);
	}

	/**
	 * Render in read-only value mode (`renderValue()`).
	 */
	public function ___renderValue(): string
	{
		if ($this->renderingAsPane) {
			return parent::___renderValue() . "\n";
		}

		$panes = $this->collectRenderablePanes();
		if ($panes === []) {
			return '';
		}

		return $this->renderTabbedIsland(true, $panes);
	}

	/**
	 * Render this tab's inner `InputfieldWrapper` children as a pane body.
	 */
	public function renderPaneBody(bool $renderValueMode = false): string
	{
		$prev = $this->renderingAsPane;
		$this->renderingAsPane = true;

		try {
			$spacing = (int) ($this->getSetting('columnWidthSpacing') ?: ($this->wire()->config->inputfieldColumnWidthSpacing ?? 0));
			$this->set('columnWidthSpacing', $spacing);

			return $renderValueMode ? parent::___renderValue() : parent::___render();
		} finally {
			$this->renderingAsPane = $prev;
		}
	}

	/**
	 * Collect the list of `MarkupReactTab` panes to render.
	 *
	 * - If this instance contains child `MarkupReactTab` items, each child is a pane (any loose non-tab children
	 *   preceding the first tab are grouped into an implicit first pane).
	 * - If this instance has no child `MarkupReactTab` items, this instance itself is rendered as a single-tab pane.
	 *
	 * @return list<self>
	 */
	public function collectRenderablePanes(): array
	{
		if (!$this->hasTabChildren()) {
			return $this->children()->count() > 0 ? [$this] : [];
		}

		$panes = [];
		/** @var list<Inputfield> $looseFields */
		$looseFields = [];

		foreach (clone $this->children() as $child) {
			if ($child instanceof self) {
				if ($looseFields !== []) {
					$implicitTab = new self();
					$this->wire($implicitTab);
					$implicitTab->attr('id+name', ($this->stringAttr('id') ?: 'pw_tabs') . '_general');
					$implicitTab->label = $this->_('General');
					$implicitTab->set('columnWidthSpacing', (int) $this->getSetting('columnWidthSpacing'));
					$implicitTab->setQuietly('_rwImplicitGeneralPane', true);
					$implicitTab->renderingAsPane = true;
					$this->insertBefore($implicitTab, $child);
					foreach ($looseFields as $loose) {
						$implicitTab->add($loose);
					}
					$panes[] = $implicitTab;
					$looseFields = [];
				}
				$panes[] = $child;
			} elseif ($child instanceof Inputfield) {
				if ($panes !== []) {
					$panes[count($panes) - 1]->add($child);
				} else {
					$looseFields[] = $child;
				}
			}
		}

		return $panes;
	}

	/**
	 * Build the structured tab group and pane payload consumed by `MarkupReactTab.tsx`.
	 *
	 * @param list<self>|null $precollectedPanes
	 * @return array<string, mixed>
	 */
	protected function buildTabbedPayload(bool $renderValueMode = false, ?array $precollectedPanes = null): array
	{
		$rawVariant = strtolower(trim((string) $this->getSetting('variant')));
		$variant = in_array($rawVariant, self::VARIANTS, true) ? $rawVariant : 'line';

		$rawGroupId = $this->stringAttr('id') ?: ($this->stringAttr('name') ?: 'pw_tab_group');
		$groupId = (string) preg_replace('/[^a-zA-Z0-9_-]/', '_', $rawGroupId);

		$panes = $precollectedPanes ?? $this->collectRenderablePanes();
		$configuredActive = trim((string) $this->getSetting('activeTab'));
		$activeIndex = 0;
		$firstErrorIndex = null;
		$explicitActiveIndex = null;

		/** @var list<array{pane: self, key: string, domId: string, label: string, icon: string, badge: string, errors: int, showIf: string}> $paneMeta */
		$paneMeta = [];

		foreach ($panes as $idx => $pane) {
			$rawKey = $pane->stringAttr('name') ?: ($pane->stringAttr('id') ?: ('tab_' . ($idx + 1)));
			$cleanKey = (string) preg_replace('/[^a-zA-Z0-9_-]/', '_', $rawKey);
			$domId = $groupId . '__' . $cleanKey;
			$label = trim((string) $pane->label) !== ''
				? trim((string) $pane->label)
				: ucwords(str_replace(['_', '-'], ' ', $rawKey));
			$icon = trim(str_replace(['fa-', 'icon-'], '', (string) $pane->icon));
			$badge = trim((string) $pane->getSetting('badge'));
			$errors = $renderValueMode ? 0 : $pane->countErrors();
			$showIf = trim((string) $pane->getSetting('showIf'));

			if ($errors > 0 && $firstErrorIndex === null) {
				$firstErrorIndex = $idx;
			}
			if (
				$explicitActiveIndex === null
				&& (
					(bool) $pane->getSetting('active') === true
					|| ($configuredActive !== '' && ($configuredActive === $rawKey || $configuredActive === $cleanKey || $configuredActive === $label))
				)
			) {
				$explicitActiveIndex = $idx;
			}

			$paneMeta[] = [
				'pane' => $pane,
				'key' => $cleanKey,
				'domId' => $domId,
				'label' => $label,
				'icon' => $icon,
				'badge' => $badge,
				'errors' => $errors,
				'showIf' => $showIf,
			];
		}

		if ($firstErrorIndex !== null) {
			$activeIndex = $firstErrorIndex;
		} elseif ($explicitActiveIndex !== null) {
			$activeIndex = $explicitActiveIndex;
		}

		$groupLabel = trim((string) $this->label) !== '' ? trim((string) $this->label) : $this->_('Sections');
		$groupLazyLoad = !$renderValueMode && (bool) $this->getSetting('lazyLoad');
		$activeKey = $paneMeta[$activeIndex]['key'] ?? '';

		$panesOut = [];
		foreach ($paneMeta as $idx => $meta) {
			$isActive = $idx === $activeIndex;
			$hasErrors = $meta['errors'] > 0;
			$pane = $meta['pane'];
			$paneLazySetting = $pane->getSetting('lazyLoad');
			$isPaneLazy = !$renderValueMode && !$isActive && !$hasErrors && ($paneLazySetting !== null ? (bool) $paneLazySetting : $groupLazyLoad);

			$desc = $pane !== $this ? trim((string) $pane->description) : '';
			$notes = $pane !== $this ? trim((string) $pane->notes) : '';
			$errorLabel = $hasErrors
				? sprintf($this->_n('%d validation error', '%d validation errors', $meta['errors']), $meta['errors'])
				: '';

			$panesOut[] = [
				'key' => $meta['key'],
				'domId' => $meta['domId'],
				'label' => $meta['label'],
				'icon' => $meta['icon'],
				'badge' => $meta['badge'],
				'errors' => $meta['errors'],
				'errorLabel' => $errorLabel,
				'showIf' => $meta['showIf'],
				'lazy' => $isPaneLazy,
				'active' => $isActive,
				'description' => $desc,
				'notes' => $notes,
				'contentHtml' => $pane->renderPaneBody($renderValueMode),
			];
		}

		return [
			'groupId' => $groupId,
			'label' => $groupLabel,
			'variant' => $variant,
			'activeTab' => $activeKey,
			'activeIndex' => $activeIndex,
			'errorLock' => $firstErrorIndex !== null,
			'lazyLoad' => $groupLazyLoad,
			'readOnly' => $renderValueMode,
			'panes' => $panesOut,
		];
	}

	/**
	 * Render the clean React island mount node for `MarkupReactTab`.
	 *
	 * @param list<self>|null $panes
	 */
	private function renderTabbedIsland(bool $renderValueMode, ?array $panes = null): string
	{
		$this->renderReady(null, $renderValueMode);

		$payload = [
			'component' => $this->inertiaComponent(),
			'id' => $this->stringAttr('id'),
			'name' => $this->stringAttr('name'),
			'label' => (string) $this->label,
			'description' => (string) $this->description,
			'notes' => (string) $this->notes,
			'icon' => (string) $this->icon,
			'readOnly' => $renderValueMode,
			'props' => $this->buildTabbedPayload($renderValueMode, $panes),
		];

		$jsonProps = json_encode(
			$payload,
			JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_INVALID_UTF8_SUBSTITUTE
		);
		$encodedProps = htmlspecialchars(
			is_string($jsonProps) ? $jsonProps : '{}',
			ENT_QUOTES | ENT_SUBSTITUTE,
			'UTF-8'
		);
		$readOnlyAttr = $renderValueMode ? ' data-readonly="true"' : '';

		return '<div data-inertia-island="MarkupReactTab" data-react-island="MarkupReactTab"' . $readOnlyAttr . ' data-props="' . $encodedProps . '"></div>';
	}

	/**
	 * Configure `variant`, `badge`, and `lazyLoad` settings when used in ProcessWire Field/Template configuration.
	 */
	public function ___getConfigInputfields(): InputfieldWrapper
	{
		$inputfields = parent::___getConfigInputfields();
		$modules = $this->wire()->modules;

		/** @var InputfieldSelect|null $variantField */
		$variantField = $modules->get('InputfieldSelect');
		if ($variantField instanceof InputfieldSelect) {
			$variantField->attr('name', 'variant');
			$variantField->label = $this->_('Tab Bar Style Variant');
			$variantField->addOption('line', $this->_('Line (Standard Tabs)'));
			$variantField->addOption('segmented', $this->_('Segmented (Compact Pill Bar)'));
			$variantField->addOption('vertical', $this->_('Vertical (Side Navigation)'));
			$variantField->val((string) ($this->getSetting('variant') ?: 'line'));
			$variantField->columnWidth = 34;
			$inputfields->add($variantField);
		}

		/** @var InputfieldText|null $badgeField */
		$badgeField = $modules->get('InputfieldText');
		if ($badgeField instanceof InputfieldText) {
			$badgeField->attr('name', 'badge');
			$badgeField->label = $this->_('Tab Badge Text');
			$badgeField->val((string) $this->getSetting('badge'));
			$badgeField->columnWidth = 33;
			$inputfields->add($badgeField);
		}

		/** @var InputfieldCheckbox|null $lazyField */
		$lazyField = $modules->get('InputfieldCheckbox');
		if ($lazyField instanceof InputfieldCheckbox) {
			$lazyField->attr('name', 'lazyLoad');
			$lazyField->label = $this->_('Load Inactive Tabs on Demand');
			$lazyField->description = $this->_('Wait to render hidden tab contents until the editor opens that tab.');
			$lazyField->autocheck = 1;
			$lazyField->val((int) ((bool) $this->getSetting('lazyLoad')));
			$lazyField->columnWidth = 33;
			$inputfields->add($lazyField);
		}

		return $inputfields;
	}

	/**
	 * Allow overriding tab style, badge, and lazy-loading per-template context (`Setup > Templates > [Template] > Field`).
	 *
	 * @param Field $field
	 * @return array<int, string>
	 */
	public function ___getConfigAllowContext($field): array
	{
		return array_merge(parent::___getConfigAllowContext($field), [
			'variant',
			'badge',
			'lazyLoad',
		]);
	}
}
