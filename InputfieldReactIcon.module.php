<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Icon\IconManager;
use Totoglu\React\Icon\ReactIconValue;
use Totoglu\React\Inertia\InputfieldReact;

/**
 * InputfieldReactIcon
 *
 * Dual-mode Inertia + React ProcessWire Inputfield (`extends InputfieldReact`) for selecting
 * from the centralized vector icon catalog with optional per-field appearance customization
 * (`variant`, `size`, `color`, `strokeWidth`, `background` badge, and corner `radius`).
 *
 * @property bool $allowCustomization Enable post-selection icon appearance customization (default: `false`)
 * @property bool $allowVariant Allow switching between Outline and Filled variants when customization is enabled (default: `true`)
 * @property bool $allowSize Allow customizing icon pixel size when customization is enabled (default: `true`)
 * @property bool $allowColor Allow customizing icon color when customization is enabled (default: `true`)
 * @property bool $allowStrokeWidth Allow customizing stroke width when customization is enabled (default: `true`)
 * @property bool $allowBackground Allow customizing badge background & corner radius when customization is enabled (default: `true`)
 * @property int $previewSize Preview size in pixels inside the input trigger (default: `20`)
 * @property string $iconPrefixMode Scalar storage prefix mode (`'none'`, `'vector'`, or `'fa'`; default: `'none'`)
 * @property bool $readOnly Render in read-only mode
 */
class InputfieldReactIcon extends InputfieldReact
{
	public const bool INERTIA_IS_ICON_FIELD = true;

	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => __('React Icon', __FILE__),
			'version' => 30,
			'summary' => __('Searchable vector icon picker with optional style, size, color, stroke width, and badge customization.', __FILE__),
			'author' => 'Iskender TOTOGLU @trk @ukyo',
			'icon' => 'puzzle-piece',
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
		$this->set('allowCustomization', false);
		$this->set('allowVariant', true);
		$this->set('allowSize', true);
		$this->set('allowColor', true);
		$this->set('allowStrokeWidth', true);
		$this->set('allowBackground', true);
		$this->set('previewSize', 20);
		$this->set('iconPrefixMode', 'none');
		$this->set('readOnly', false);
		$this->setAttribute('value', '');
	}

	public function inertiaComponent(): string
	{
		return 'InputfieldReactIcon';
	}

	/**
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		$ws = React::instance($this);

		return array_values(array_unique(array_merge(
			$ws->resolveModuleAssetUrl('InputfieldReactIcon.js'),
			$ws->resolveModuleAssetUrl('ReactIcons.js'),
		)));
	}

	/**
	 * Determine whether a ProcessWire `Field` uses `InputfieldReactIcon`.
	 */
	public static function isIconField(?Field $field): bool
	{
		if (!$field instanceof Field || !$field->type instanceof FieldtypeText) {
			return false;
		}
		$cls = strtolower(trim((string) ($field->get('inputfieldClass') ?? '')));

		return $cls === 'inputfieldreacticon';
	}

	/**
	 * Extract customization flag configuration from a `Field` or `Inputfield` instance.
	 *
	 * @return array{
	 *   allowCustomization: bool,
	 *   allowVariant: bool,
	 *   allowSize: bool,
	 *   allowColor: bool,
	 *   allowStrokeWidth: bool,
	 *   allowBackground: bool
	 * }
	 */
	public static function extractFieldFlags(Field|Inputfield|null $source = null): array
	{
		if ($source === null) {
			return IconManager::resolveCustomizationFlags([]);
		}
		$getVal = static fn (string $k): mixed => $source instanceof Inputfield
			? $source->getSetting($k)
			: $source->get($k);

		$master = (bool) $getVal('allowCustomization');
		if (!$master) {
			return IconManager::resolveCustomizationFlags(['allowCustomization' => false]);
		}

		return IconManager::resolveCustomizationFlags([
			'allowCustomization' => true,
			'allowVariant' => $getVal('allowVariant') !== null ? (bool) $getVal('allowVariant') : true,
			'allowSize' => $getVal('allowSize') !== null ? (bool) $getVal('allowSize') : true,
			'allowColor' => $getVal('allowColor') !== null ? (bool) $getVal('allowColor') : true,
			'allowStrokeWidth' => $getVal('allowStrokeWidth') !== null ? (bool) $getVal('allowStrokeWidth') : true,
			'allowBackground' => $getVal('allowBackground') !== null ? (bool) $getVal('allowBackground') : true,
		]);
	}

	/**
	 * Build `iconConfig` payload consumed by `SchemaForm` and standalone `IconFieldControl`.
	 *
	 * @return array{
	 *   allowCustomization: bool,
	 *   allowVariant: bool,
	 *   allowSize: bool,
	 *   allowColor: bool,
	 *   allowStrokeWidth: bool,
	 *   allowBackground: bool,
	 *   previewSize: int,
	 *   prefixMode: string,
	 *   endpoint: string,
	 *   totalIcons: int
	 * }
	 */
	public function buildIconConfig(): array
	{
		$flags = self::extractFieldFlags($this);
		$rawPrefix = strtolower(trim((string) ($this->getSetting('iconPrefixMode') ?? 'none')));
		$prefixMode = in_array($rawPrefix, ['none', 'vector', 'fa'], true) ? $rawPrefix : 'none';
		$rootUrl = rtrim((string) ($this->wire()->config->urls->root ?: '/'), '/');
		$totalVariants = IconManager::loadCatalog()['totalVariants'];

		return array_merge($flags, [
			'previewSize' => IconManager::clampSize($this->getSetting('previewSize'), 20),
			'prefixMode' => $prefixMode,
			'endpoint' => $rootUrl . '/_react/icons',
			'totalIcons' => $totalVariants,
		]);
	}

	/**
	 * Encode raw value for `FieldtypeText::sleepValue` or hidden `<input>`.
	 */
	public static function encodeStorageValue(mixed $value, ?Field $field = null): string
	{
		$flags = $field instanceof Field
			? self::extractFieldFlags($field)
			: ['allowCustomization' => false];
		$prefixMode = 'none';
		if ($field instanceof Field) {
			$rawMode = strtolower(trim((string) ($field->get('iconPrefixMode') ?? 'none')));
			if (in_array($rawMode, ['none', 'vector', 'fa'], true)) {
				$prefixMode = $rawMode;
			}
		}

		return IconManager::encodeForStorage($value, $flags, $prefixMode);
	}

	/**
	 * Resolve a raw `FieldtypeText` value into a formatted `ReactIconValue` object when `$page->of(true)`.
	 */
	public static function resolveValue(mixed $value): ReactIconValue
	{
		$resolved = IconManager::resolveValueObject($value);
		$w = wire();
		if ($w !== null) {
			$w->wire($resolved);
		}

		return $resolved;
	}

	/**
	 * Render summary markup for ProcessWire Lister, table cells, and `$page->markupValue()`.
	 */
	public static function renderIconMarkup(mixed $rawValue, string $property = ''): string
	{
		$val = self::resolveValue($rawValue);
		if ($val->isEmpty()) {
			return '';
		}
		if ($property !== '') {
			$propVal = $val->get($property);
			return is_scalar($propVal) ? htmlspecialchars((string) $propVal, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') : '';
		}

		$label = IconManager::formatLabel((string) $val->name);
		$safeLabel = htmlspecialchars($label !== '' ? $label : (string) $val->name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
		$glyph = $val->customized
			? (string) $val->html
			: IconManager::renderSvgMarkup([
				'name' => (string) $val->name,
				'variant' => (string) $val->variant,
				'size' => 18,
				'strokeWidth' => 2.0,
			]);

		return '<span class="pw-rw-cell-icon" style="display:inline-flex;align-items:center;gap:6px;" title="' . $safeLabel . '">'
			. '<span class="pw-rw-cell-icon-glyph" style="display:inline-flex;align-items:center;">' . $glyph . '</span>'
			. '<span class="pw-rw-cell-icon-label" style="font-size:12px;">' . $safeLabel . '</span>'
			. '</span>';
	}

	protected function serializeValueForHiddenInput(mixed $value): string
	{
		$cfg = $this->buildIconConfig();

		return IconManager::encodeForStorage($value, $cfg, $cfg['prefixMode']);
	}

	/**
	 * @return array<string, mixed>
	 */
	public function toInertiaProp(): array
	{
		$cfg = $this->buildIconConfig();
		$attrs = $this->getAttributes();
		$rawVal = $this->attr('value');
		$norm = IconManager::normalizeValue($rawVal);
		$readOnly = $this->isEffectivelyReadOnly();
		$disabled = !empty($attrs['disabled']) || $readOnly;

		$inputName = $this->stringAttr('name');
		$rawId = $this->stringAttr('id');

		return [
			'component' => $this->inertiaComponent(),
			'id' => $rawId !== '' ? $rawId : ('Inputfield_' . $inputName),
			'name' => $inputName,
			'label' => (string) $this->label,
			'description' => (string) $this->description,
			'placeholder' => (string) ($attrs['placeholder'] ?? ''),
			'required' => (bool) $this->required,
			'readOnly' => $readOnly,
			'disabled' => $disabled,
			'value' => $cfg['allowCustomization']
				? ($norm['name'] !== '' ? $norm : '')
				: IconManager::encodeForStorage($norm, $cfg, $cfg['prefixMode']),
			'iconConfig' => $cfg,
		];
	}

	public function ___processInput(WireInputData $input): self
	{
		if ($this->isInputProcessingLocked()) {
			return $this;
		}

		$name = $this->stringAttr('name');
		if ($name === '' || !isset($input[$name])) {
			return $this;
		}

		$cfg = $this->buildIconConfig();
		$rawSubmitted = $input[$name];
		$encoded = IconManager::encodeForStorage($rawSubmitted, $cfg, $cfg['prefixMode']);
		$norm = IconManager::normalizeValue($rawSubmitted);

		if ($norm['name'] !== '' && IconManager::loadCatalog()['outline'] === []) {
			// Catalog file missing in isolated unit setup: preserve sanitized identifier
		} elseif ($norm['name'] !== '' && IconManager::resolveCanonicalName($norm['name']) === '') {
			$this->error($this->_('Selected icon is not valid.'));
			return $this;
		}

		if ((bool) $this->getSetting('required') && $encoded === '') {
			$this->error($this->_('Please select an icon.'));
		}

		$previous = $this->serializeValueForHiddenInput($this->attr('value'));
		if ($encoded !== $previous) {
			if (!$this->trackChanges()) {
				$this->setTrackChanges(true);
			}
			$this->setAttribute('value', $encoded);
			$this->trackChange('value', $previous, $encoded);
		}

		return $this;
	}

	public function ___getConfigInputfields(): InputfieldWrapper
	{
		$inputfields = parent::___getConfigInputfields();
		$modules = $this->wire()->modules;

		/** @var InputfieldInteger|null $previewField */
		$previewField = $modules->get('InputfieldInteger');
		if ($previewField) {
			$previewField->attr('name', 'previewSize');
			$previewField->label = $this->_('Trigger Preview Size (px)');
			$previewField->description = $this->_('Pixel dimensions for the selected icon preview inside the input button (12–64).');
			$previewField->val(IconManager::clampSize($this->getSetting('previewSize'), 20));
			$previewField->columnWidth = 50;
			$inputfields->add($previewField);
		}

		/** @var InputfieldSelect|null $prefixField */
		$prefixField = $modules->get('InputfieldSelect');
		if ($prefixField) {
			$prefixField->attr('name', 'iconPrefixMode');
			$prefixField->label = $this->_('Stored Name Format');
			$prefixField->description = $this->_('Controls how plain icon names are saved when appearance customization is disabled.');
			$prefixField->addOptions([
				'none' => $this->_('Standard Icon Name (e.g. sparkles)'),
				'vector' => $this->_('Admin CSS Prefix'),
			]);
			$rawMode = strtolower(trim((string) ($this->getSetting('iconPrefixMode') ?: 'none')));
			$prefixField->val(in_array($rawMode, ['none', 'vector'], true) ? $rawMode : 'none');
			$prefixField->set('rwControl', 'segmented');
			$prefixField->columnWidth = 50;
			$inputfields->add($prefixField);
		}

		/** @var InputfieldCheckbox|null $allowCustom */
		$allowCustom = $modules->get('InputfieldCheckbox');
		if ($allowCustom) {
			$allowCustom->attr('name', 'allowCustomization');
			$allowCustom->label = $this->_('Allow Icon Appearance Customization');
			$allowCustom->description = $this->_('When enabled, editors can customize icon style, size, color, stroke width, and badge background after selecting an icon (stored as JSON).');
			$allowCustom->attr('checked', (bool) $this->getSetting('allowCustomization') ? 'checked' : '');
			$inputfields->add($allowCustom);
		}

		$subToggles = [
			'allowVariant' => $this->_('Allow Style Variant (Outline / Filled)'),
			'allowSize' => $this->_('Allow Size Customization (px)'),
			'allowStrokeWidth' => $this->_('Allow Stroke Width Customization'),
			'allowColor' => $this->_('Allow Icon Color Customization'),
			'allowBackground' => $this->_('Allow Badge Background & Radius Customization'),
		];
		foreach ($subToggles as $toggleName => $toggleLabel) {
			/** @var InputfieldCheckbox|null $cb */
			$cb = $modules->get('InputfieldCheckbox');
			if ($cb) {
				$cb->attr('name', $toggleName);
				$cb->label = $toggleLabel;
				$checked = $this->getSetting($toggleName) !== null ? (bool) $this->getSetting($toggleName) : true;
				$cb->attr('checked', $checked ? 'checked' : '');
				$cb->showIf = 'allowCustomization=1';
				$cb->columnWidth = 20;
				$inputfields->add($cb);
			}
		}

		return $inputfields;
	}

	/**
	 * @param Field $field
	 * @return array<int, string>
	 */
	public function ___getConfigAllowContext($field): array
	{
		return array_merge(parent::___getConfigAllowContext($field), [
			'previewSize',
			'iconPrefixMode',
			'allowCustomization',
			'allowVariant',
			'allowSize',
			'allowColor',
			'allowStrokeWidth',
			'allowBackground',
		]);
	}
}
