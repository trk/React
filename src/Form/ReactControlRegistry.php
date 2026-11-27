<?php

declare(strict_types=1);

namespace Totoglu\React\Form;

use DateTimeImmutable;
use ProcessWire\Field;
use ProcessWire\FieldtypeDatetime;
use ProcessWire\FieldtypeDecimal;
use ProcessWire\FieldtypeFloat;
use ProcessWire\FieldtypeInteger;
use ProcessWire\FieldtypeOptions;
use ProcessWire\FieldtypeText;
use ProcessWire\FieldtypeTextarea;
use ProcessWire\HookEvent;
use ProcessWire\Inertia;
use ProcessWire\Inputfield;
use ProcessWire\InputfieldCheckbox;
use ProcessWire\InputfieldDatetime;
use ProcessWire\InputfieldFieldset;
use ProcessWire\InputfieldHasArrayValue;
use ProcessWire\InputfieldHidden;
use ProcessWire\InputfieldSelect;
use ProcessWire\InputfieldSubmit;
use ProcessWire\InputfieldText;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Language;
use ProcessWire\Languages;
use ProcessWire\LanguagesValueInterface;
use ProcessWire\React;
use ProcessWire\Wire;
use ProcessWire\WireInputData;
use Stringable;
use Totoglu\React\Condition\ConditionNormalizer;
use Totoglu\React\Inertia\InputfieldReact;
use Totoglu\React\Support\IntlCatalog;
use Totoglu\React\Support\IslandMarkup;

/**
 * Coordinates the universal classic `Inputfield` <-> React control bridge (`rwControl` /
 * `data-rw-control`), including `Setup > Fields` configuration panels, per-bundle lazy asset
 * resolution, classic POST normalization, and `FieldtypeText` storage/markup formatting.
 */
final class ReactControlRegistry extends Wire
{
	public const EXTRA_ISLAND = 'ReactWorkspace/ExtraFieldControl';
	public const CORE_ISLAND = 'ReactWorkspace/FieldControl';
	public const CONDITION_ISLAND = 'InputfieldReactCondition';

	/** @var list<string> */
	public const EXTRA_CONTROLS = [
		'phone',
		'color',
		'tags',
		'combobox',
		'unit_number',
		'segmented',
		'spacing',
		'otp',
		'password',
		'markdown',
	];

	/** @var list<string> */
	public const CORE_CONTROLS = [
		'date',
		'time',
		'datetime',
		'daterange',
		'range',
		'range_slider',
		'colspan',
		'rating',
		'signature',
		'calculation',
		'toggle',
		'repeater',
	];

	/** @var list<string> */
	public const EXPLICIT_TEXT_VARIANTS = [
		'slug',
		'secret',
	];

	/** @var list<string> */
	private const JSON_OBJECT_CONTROLS = [
		'unit_number',
		'spacing',
		'range_slider',
		'daterange',
		'condition_builder',
	];

	/** @var list<string> */
	private const CALENDAR_CONTROLS = [
		'date',
		'time',
		'datetime',
		'daterange',
	];

	/** @var array<string, string> */
	private const FIELD_SETTING_MAP = [
		'rwDefaultCountry' => 'defaultCountry',
		'rwPreferredCountries' => 'preferredCountries',
		'rwOnlyCountries' => 'only',
		'rwExcludeCountries' => 'exclude',
		'rwTimezoneRegions' => 'regions',
		'rwTimezoneIncludeOffset' => 'includeOffset',
		'rwSwatches' => 'swatches',
		'rwAllowAlpha' => 'allowAlpha',
		'rwClearable' => 'clearable',
		'rwSuggestions' => 'suggestions',
		'rwAllowCustom' => 'allowCustom',
		'rwAllowDuplicates' => 'allowDuplicates',
		'rwDelimiter' => 'delimiter',
		'rwMaxItems' => 'maxItems',
		'rwUnits' => 'units',
		'rwDefaultUnit' => 'defaultUnit',
		'rwCurrency' => 'currency',
		'rwPrecision' => 'precision',
		'rwLocale' => 'locale',
		'rwMultiple' => 'multiple',
		'rwSegmentedIconOnly' => 'iconOnly',
		'rwSegmentedFullWidth' => 'fullWidth',
		'rwUseDeselect' => 'useDeselect',
		'rwSpacingSides' => 'sides',
		'rwAllowAuto' => 'allowAuto',
		'rwAllowNegative' => 'allowNegative',
		'rwOtpLength' => 'otpLength',
		'rwOtpMode' => 'otpMode',
		'rwOtpSeparatorAfter' => 'otpSeparatorAfter',
		'rwOtpMask' => 'mask',
		'rwShowStrength' => 'showStrength',
		'rwShowRequirements' => 'showRequirements',
		'rwAllowGenerate' => 'allowGenerate',
		'rwRequireUppercase' => 'requireUppercase',
		'rwRequireLowercase' => 'requireLowercase',
		'rwRequireNumber' => 'requireNumber',
		'rwRequireSymbol' => 'requireSymbol',
		'rwConfirmPassword' => 'confirmPassword',
		'rwPreviewMode' => 'previewMode',
		'rwAllowSplit' => 'allowSplit',
		'rwShowToolbar' => 'showToolbar',
		'rwDatetimeMode' => 'datetimeMode',
		'rwHourFormat' => 'hourFormat',
		'rwMinuteStep' => 'minuteStep',
		'rwShowSeconds' => 'showSeconds',
		'rwWeekStartsOn' => 'weekStartsOn',
		'rwPresets' => 'presets',
		'rwNumberOfMonths' => 'numberOfMonths',
		'rwMinTime' => 'minTime',
		'rwMaxTime' => 'maxTime',
		'rwMinDistance' => 'minDistance',
		'rwMaxStars' => 'maxStars',
		'rwFormula' => 'formula',
		'rwValueMode' => 'valueMode',
		'rwConditionFields' => 'conditionFields',
		'rwAllowFieldComparison' => 'allowFieldComparison',
		'rwAllowNegate' => 'allowNegate',
		'rwShowSummary' => 'showSummary',
		'rwLayout' => 'layout',
		'rwMaxGroups' => 'maxGroups',
		'rwMaxRulesPerGroup' => 'maxRulesPerGroup',
	];

	/** @var list<string> */
	private const TOKEN_LIST_FIELD_SETTINGS = [
		'rwPreferredCountries',
		'rwOnlyCountries',
		'rwExcludeCountries',
		'rwTimezoneRegions',
		'rwSwatches',
		'rwSuggestions',
		'rwUnits',
		'rwSpacingSides',
	];

	/** @var list<string> */
	private const BOOL_FIELD_SETTINGS = [
		'rwTimezoneIncludeOffset',
		'rwAllowAlpha',
		'rwClearable',
		'rwAllowCustom',
		'rwAllowDuplicates',
		'rwMultiple',
		'rwSegmentedIconOnly',
		'rwSegmentedFullWidth',
		'rwUseDeselect',
		'rwAllowAuto',
		'rwAllowNegative',
		'rwOtpMask',
		'rwShowStrength',
		'rwShowRequirements',
		'rwAllowGenerate',
		'rwRequireUppercase',
		'rwRequireLowercase',
		'rwRequireNumber',
		'rwRequireSymbol',
		'rwConfirmPassword',
		'rwAllowSplit',
		'rwShowToolbar',
		'rwShowSeconds',
		'rwPresets',
		'rwSlugLocked',
		'rwSecretMasked',
		'rwSecretAutogen',
		'rwAllowFieldComparison',
		'rwAllowNegate',
		'rwShowSummary',
	];

	/** @var list<string> */
	private const INT_FIELD_SETTINGS = [
		'rwMaxItems',
		'rwPrecision',
		'rwOtpLength',
		'rwOtpSeparatorAfter',
		'rwMinuteStep',
		'rwWeekStartsOn',
		'rwNumberOfMonths',
		'rwMaxStars',
		'rwSlugMaxLength',
		'rwMaxGroups',
		'rwMaxRulesPerGroup',
	];

	public function __construct(private React $react)
	{
		parent::__construct();
	}

	/**
	 * Normalize an explicit `rwControl` name or alias onto its canonical `SchemaForm` control type.
	 */
	public static function canonicalControlType(string $type): string
	{
		return match (strtolower(trim($type))) {
			'slug', 'secret' => 'text',
			'col_span', 'col-span' => 'colspan',
			'slider' => 'range',
			'range_slider', 'range-slider', 'dual_range', 'dual-range', 'minmax' => 'range_slider',
			'date_range', 'date-range' => 'daterange',
			'texttags', 'text_tags', 'text-tags', 'inputfieldtexttags' => 'tags',
			'searchable_select', 'searchable-select',
			'country', 'country_code', 'country-code', 'countries',
			'timezone', 'time_zone', 'time-zone', 'tz',
			'currency_code', 'currency-code', 'currencycode', 'iso_currency', 'iso-currency' => 'combobox',
			'phone_number', 'phone-number' => 'phone',
			'unit-number', 'unitnumber', 'currency', 'money' => 'unit_number',
			'button_group', 'button-group' => 'segmented',
			'spacing', 'box_spacing', 'box-spacing', 'padding', 'margin', 'dimensions' => 'spacing',
			'otp', 'pin', 'verification_code', 'verification-code', 'totp' => 'otp',
			'password', 'password_strength', 'password-strength', 'new_password', 'new-password' => 'password',
			'markdown', 'md', 'markdown_editor', 'markdown-editor' => 'markdown',
			'condition_builder', 'condition-builder', 'conditionbuilder' => 'condition_builder',
			'keyvalue', 'key_value', 'key-value', 'inputfieldreactkeyvalue', 'inputfieldkeyvalue' => 'keyvalue',
			'richtext', 'richtext_language', 'richtext-language', 'richtextlanguage',
			'tiptap', 'tiptap_language', 'tiptap-language', 'tiptaplanguage', 'inputfieldtiptap',
			'html', 'html_language', 'html-language',
			'wysiwyg', 'wysiwyg_language', 'wysiwyg-language' => 'tiptap',
			default => strtolower(trim($type)),
		};
	}

	/**
	 * Resolve the raw `rwControl` / `data-rw-control` opt-in token declared on an `Inputfield`.
	 */
	public function resolveExplicitControl(Inputfield $inputfield): string
	{
		if ($this->isExcludedInputfield($inputfield)) {
			return '';
		}

		$attrs = $inputfield->getAttributes();
		$raw = $attrs['data-rw-control']
			?? $inputfield->get('rwControl')
			?? $inputfield->getSetting('rwControl')
			?? '';

		if (!is_scalar($raw)) {
			return '';
		}

		return strtolower(trim((string) $raw));
	}

	/**
	 * Determine whether an `Inputfield` explicitly opts into the universal React control bridge.
	 *
	 * @return array{explicit: string, canonical: string, island: string, isExtra: bool, isCondition: bool, needsCalendar: bool}|null
	 */
	public function resolveControlBridge(Inputfield $inputfield): ?array
	{
		$explicit = $this->resolveExplicitControl($inputfield);
		if ($explicit === '') {
			return null;
		}

		$canonical = self::canonicalControlType($explicit);
		$isCondition = $canonical === 'condition_builder';
		$isExtra = in_array($canonical, self::EXTRA_CONTROLS, true);
		$isCore = in_array($canonical, self::CORE_CONTROLS, true)
			|| in_array($explicit, self::EXPLICIT_TEXT_VARIANTS, true);

		if (!$isCondition && !$isExtra && !$isCore) {
			return null;
		}

		$datetimeMode = strtolower(trim((string) (
			$inputfield->get('datetimeMode')
			?? $inputfield->attr('data-rw-datetime-mode')
			?? $inputfield->attr('data-datetime-mode')
			?? 'picker'
		)));
		$needsCalendar = in_array($canonical, self::CALENDAR_CONTROLS, true)
			&& $datetimeMode !== 'html'
			&& $datetimeMode !== 'text';

		return [
			'explicit' => $explicit,
			'canonical' => $canonical,
			'island' => $isCondition
				? self::CONDITION_ISLAND
				: ($isExtra ? self::EXTRA_ISLAND : self::CORE_ISLAND),
			'isExtra' => $isExtra,
			'isCondition' => $isCondition,
			'needsCalendar' => $needsCalendar,
		];
	}

	/**
	 * Enqueue the minimal required JS/CSS assets for a bridged `Inputfield`.
	 */
	public function enqueueAssetsForInputfield(Inputfield $inputfield): void
	{
		$bridge = $this->resolveControlBridge($inputfield);
		if ($bridge === null) {
			return;
		}

		$this->enqueueAssetsForBridge($bridge);
	}

	/**
	 * Enqueue the exact bundle(s) required for an already-resolved control bridge descriptor.
	 *
	 * @param array{explicit: string, canonical: string, island: string, isExtra: bool, isCondition?: bool, needsCalendar: bool} $bridge
	 */
	public function enqueueAssetsForBridge(array $bridge): void
	{
		$config = $this->wire()->config;

		foreach ($this->react->resolveInertiaStyleAssets() as $styleUrl) {
			$config->styles->add($styleUrl);
		}
		if ($bridge['needsCalendar']) {
			foreach ($this->react->resolveModuleAssetUrl('ReactCalendar.css') as $calStyleUrl) {
				$config->styles->add($calStyleUrl);
			}
		}

		$extraScripts = !empty($bridge['isCondition'])
			? $this->react->resolveModuleAssetUrl('InputfieldReactCondition.js')
			: ($bridge['isExtra']
				? $this->react->resolveModuleAssetUrl('ReactExtraFields.js')
				: $this->react->resolveModuleAssetUrl('SchemaForm.js'));

		if ($bridge['needsCalendar']) {
			$extraScripts = array_merge($extraScripts, $this->react->resolveModuleAssetUrl('ReactCalendar.js'));
		}

		foreach ($this->react->resolveInertiaScriptAssets($extraScripts) as $scriptUrl) {
			$config->scripts->add($scriptUrl);
		}
	}

	/**
	 * Render the interactive React control island replacing classic `<input>` / `<select>` markup.
	 * Returns `null` when the `Inputfield` is excluded or not opted in via `rwControl`.
	 */
	public function renderControlIsland(Inputfield $inputfield, bool $renderValueMode = false): ?string
	{
		if ($this->react->forms()->isSerializing()) {
			return null;
		}

		$bridge = $this->resolveControlBridge($inputfield);
		if ($bridge === null) {
			return null;
		}

		$this->enqueueAssetsForBridge($bridge);

		$modules = $this->wire()->modules;
		$languages = $this->wire()->languages;
		if (
			(bool) $inputfield->getSetting('useLanguages')
			&& $modules->isInstalled('LanguageSupport')
			&& $languages instanceof Languages
		) {
			/** @var list<Language> $langList */
			$langList = [];
			foreach ($languages as $langItem) {
				if ($langItem instanceof Language) {
					$langList[] = $langItem;
				}
			}

			if (count($langList) >= 2) {
				$langSupport = $modules->get('LanguageSupport');
				$langTabs = $modules->isInstalled('LanguageTabs') ? $modules->get('LanguageTabs') : null;
				$rawId = $inputfield->attr('id');
				$rawName = $inputfield->attr('name');
				$origId = is_scalar($rawId) ? (string) $rawId : '';
				$origName = is_scalar($rawName) ? (string) $rawName : '';
				$origValue = $inputfield->attr('value');
				$restoreAttrVal = is_array($origValue) || is_bool($origValue) || is_int($origValue) || is_string($origValue)
					? $origValue
					: (is_float($origValue) ? (string) $origValue : '');
				$origRequired = (bool) $inputfield->required;
				$trackChanges = $inputfield->trackChanges();
				$inputfield->setTrackChanges(false);

				$hasTabs = is_object($langTabs)
					&& method_exists($langTabs, 'resetTabs')
					&& method_exists($langTabs, 'addTab')
					&& method_exists($langTabs, 'renderTabs');
				if ($hasTabs) {
					$langTabs->resetTabs();
				}

				$out = '';
				try {
					$inputfield->setQuietly('useLanguages', false);
					foreach ($langList as $language) {
						$languageId = (int) $language->id;
						$languages->setLanguage($language);
						if ($language->isDefault()) {
							$targetId = $origId;
							$inputfield->attr('id', $origId);
							$inputfield->attr('name', $origName);
							$inputfield->setAttribute('value', $restoreAttrVal);
						} else {
							$targetId = $origId . '__' . $languageId;
							$inputfield->attr('id', $targetId);
							$inputfield->attr('name', $origName . '__' . $languageId);
							$inputfield->required = false;
							$langVal = $inputfield->get('value' . $languageId);
							$langAttrVal = is_array($langVal) || is_bool($langVal) || is_int($langVal) || is_string($langVal)
								? $langVal
								: (is_scalar($langVal) ? (string) $langVal : '');
							$inputfield->setAttribute('value', $langAttrVal);
						}

						$langHtml = $this->renderSingleControlIsland($inputfield, $bridge, $renderValueMode);
						$languages->unsetLanguage();
						if ($langHtml === null) {
							return null;
						}

						if (is_object($langSupport) && method_exists($langSupport, 'wrapInputfieldOutput')) {
							$out .= (string) $langSupport->wrapInputfieldOutput($langHtml, $targetId, $language);
						} else {
							$out .= $langHtml;
						}
						if ($hasTabs) {
							$langTabs->addTab($inputfield, $language);
						}
					}

					if ($hasTabs) {
						$out = (string) $langTabs->renderTabs($inputfield, $out);
					}
					$inputfield->setQuietly('_rwRestoreUseLanguages', true);

					return $out;
				} finally {
					$languages->unsetLanguage();
					$inputfield->attr('name', $origName);
					$inputfield->attr('id', $origId);
					$inputfield->setAttribute('value', $restoreAttrVal);
					$inputfield->required = $origRequired;
					$inputfield->setTrackChanges($trackChanges);
					if (!$inputfield->get('_rwRestoreUseLanguages')) {
						$inputfield->setQuietly('useLanguages', true);
					}
				}
			}
		}

		return $this->renderSingleControlIsland($inputfield, $bridge, $renderValueMode);
	}

	/**
	 * Render a single non-tabbed React control island node for the given `Inputfield`.
	 *
	 * @param array{explicit: string, canonical: string, island: string, isExtra: bool, isCondition?: bool, needsCalendar: bool} $bridge
	 */
	private function renderSingleControlIsland(Inputfield $inputfield, array $bridge, bool $renderValueMode): ?string
	{
		$serializer = $this->react->forms();
		$inertia = $this->react->inertia();
		$node = Inertia::withoutEntityEncoding(function () use ($serializer, $inertia, $inputfield): array {
			$serialized = $serializer->serializeInputfieldNode($inputfield);
			if ($serialized === [] || ($serialized['kind'] ?? '') !== 'control') {
				return $serialized;
			}
			$resolved = $inertia->resolver->resolveValue($serialized);

			return is_array($resolved) ? $resolved : $serialized;
		});
		if ($node === [] || ($node['kind'] ?? '') !== 'control') {
			return null;
		}

		if ($this->wire()->modules->isInstalled('LanguageSupport')) {
			$node['useLanguages'] = false;
			$node['languages'] = [];
			$node['i18n'] = null;
		}

		$node['renderValueMode'] = $renderValueMode;
		if ($renderValueMode) {
			$node['readOnly'] = true;
		}
		if (($node['explicitControl'] ?? '') === '') {
			$node['explicitControl'] = $bridge['explicit'];
		}

		$fallbackHtml = $renderValueMode ? '' : $this->buildFallbackHiddenInputsHtml($node);

		return IslandMarkup::render(
			$bridge['island'],
			['control' => $node],
			[
				'class' => 'rw-control-island-host',
				'data-rw-bridge-control' => $bridge['canonical'],
				'data-rw-bridge-variant' => $bridge['explicit'],
			],
			$fallbackHtml,
		);
	}

	/**
	 * Append a collapsed-by-default `React Control` configuration fieldset to supported
	 * standard ProcessWire `Field` edit screens (`Setup > Fields`).
	 */
	public function buildFieldConfigInputfields(Field $field, InputfieldWrapper $wrapper): void
	{
		if ($wrapper->getChildByName('rwControlFieldset') instanceof Inputfield) {
			return;
		}

		$fieldtype = $field->type;
		if ($fieldtype === null) {
			return;
		}

		$inputfieldClass = strtolower(trim((string) ($field->get('inputfieldClass') ?? '')));
		if (str_starts_with($inputfieldClass, 'inputfieldreact') || $inputfieldClass === 'inputfieldtiptap') {
			return;
		}

		$compatibleOptions = $this->resolveCompatibleControlOptions($fieldtype);
		if ($compatibleOptions === []) {
			return;
		}

		$modules = $this->wire()->modules;
		$sanitizer = $this->wire()->sanitizer;
		$currentControl = $this->normalizeStoredControlValue((string) ($field->get('rwControl') ?? ''));
		if ($currentControl !== '' && !isset($compatibleOptions[$currentControl])) {
			$compatibleOptions[$currentControl] = ucfirst(str_replace('_', ' ', $currentControl));
		}

		/** @var InputfieldFieldset $fieldset */
		$fieldset = $modules->get('InputfieldFieldset');
		$fieldset->name = 'rwControlFieldset';
		$fieldset->label = $this->_('React Control');
		$fieldset->description = $this->_('Render this field with an enhanced React control in Page Edit, User Edit, and React Workspaces.');
		$fieldset->collapsed = $currentControl !== '' ? Inputfield::collapsedNo : Inputfield::collapsedYes;
		$fieldset->icon = 'sliders';

		/** @var InputfieldSelect $controlSelect */
		$controlSelect = $modules->get('InputfieldSelect');
		$controlSelect->name = 'rwControl';
		$controlSelect->label = $this->_('Control Variant');
		$controlSelect->description = $this->_('Leave empty to use the native ProcessWire Inputfield rendering.');
		$controlSelect->addOption('', $this->_('Native Inputfield (Default)'));
		foreach ($compatibleOptions as $val => $label) {
			$controlSelect->addOption($val, $label);
		}
		$controlSelect->attr('value', $currentControl);
		$fieldset->add($controlSelect);

		$allowedKeys = array_keys($compatibleOptions);

		$addOptionField = function (
			string $moduleName,
			string $name,
			string $label,
			array $targetControls,
			string $description = '',
			array $extra = [],
		) use ($fieldset, $field, $modules, $allowedKeys): void {
			$matched = array_values(array_intersect($targetControls, $allowedKeys));
			if ($matched === []) {
				return;
			}
			$f = $modules->get($moduleName);
			if (!$f instanceof Inputfield) {
				return;
			}
			$f->name = $name;
			$f->label = $label;
			if ($description !== '') {
				$f->description = $description;
			}
			$f->showIf = 'rwControl=' . implode('|', $matched);

			if (isset($extra['columnWidth'])) {
				$f->columnWidth = (int) $extra['columnWidth'];
			}
			if (isset($extra['options']) && is_array($extra['options']) && $f instanceof InputfieldSelect) {
				foreach ($extra['options'] as $optVal => $optLabel) {
					$f->addOption((string) $optVal, (string) $optLabel);
				}
			}

			$stored = $field->get($name);
			if ($f instanceof InputfieldCheckbox) {
				$checkedVal = !empty($extra['default']) && $stored === null ? (bool) $extra['default'] : !empty($stored);
				$f->attr('checked', $checkedVal ? 'checked' : '');
				$f->attr('value', 1);
			} else {
				if (is_array($stored)) {
					$storedStr = implode(', ', array_map('strval', $stored));
				} elseif ($stored !== null) {
					$storedStr = (string) $stored;
				} else {
					$storedStr = (string) ($extra['default'] ?? '');
				}
				$f->attr('value', $storedStr);
			}

			if (isset($extra['placeholder'])) {
				$f->attr('placeholder', (string) $extra['placeholder']);
			}

			$fieldset->add($f);
		};

		// Combobox / Segmented shared
		if (!$fieldtype instanceof FieldtypeOptions) {
			$addOptionField(
				'InputfieldCheckbox',
				'rwMultiple',
				$this->_('Allow Multiple Selection'),
				['combobox', 'segmented'],
				'',
				['columnWidth' => 33],
			);
		}
		$addOptionField(
			'InputfieldCheckbox',
			'rwSegmentedFullWidth',
			$this->_('Full Width Segments'),
			['segmented'],
			'',
			['columnWidth' => 33],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwSegmentedIconOnly',
			$this->_('Icons Only'),
			['segmented'],
			'',
			['columnWidth' => 34],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwUseDeselect',
			$this->_('Allow Deselecting Active Segment'),
			['segmented'],
			'',
			['columnWidth' => 34],
		);

		// Phone options
		$addOptionField(
			'InputfieldText',
			'rwDefaultCountry',
			$this->_('Default Country (ISO2)'),
			['phone'],
			$this->_('Two-letter ISO country code selected by default (e.g. TR, US, DE).'),
			['columnWidth' => 50, 'placeholder' => 'TR'],
		);
		$addOptionField(
			'InputfieldText',
			'rwPreferredCountries',
			$this->_('Preferred Countries'),
			['phone', 'country', 'countries', 'currency_code'],
			$this->_('Comma-separated ISO codes pinned at the top (e.g. US, GB, DE).'),
			['columnWidth' => 50, 'placeholder' => 'US, GB, DE'],
		);
		$addOptionField(
			'InputfieldText',
			'rwOnlyCountries',
			$this->_('Restrict to Countries / Currencies'),
			['phone', 'country', 'countries', 'currency_code'],
			$this->_('Optional comma-separated whitelist of ISO codes.'),
			['columnWidth' => 50],
		);
		$addOptionField(
			'InputfieldText',
			'rwExcludeCountries',
			$this->_('Exclude Countries / Currencies'),
			['phone', 'country', 'countries', 'currency_code'],
			$this->_('Optional comma-separated blacklist of ISO codes.'),
			['columnWidth' => 50],
		);

		// Timezone options
		$addOptionField(
			'InputfieldText',
			'rwTimezoneRegions',
			$this->_('Timezone Regions'),
			['timezone'],
			$this->_('Optional comma-separated region prefixes (e.g. Europe, America, Asia).'),
			['columnWidth' => 50, 'placeholder' => 'Europe, America'],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwTimezoneIncludeOffset',
			$this->_('Include UTC Offset Labels'),
			['timezone'],
			$this->_('Append UTC offset hints (e.g. UTC+03:00) in timezone option labels.'),
			['columnWidth' => 50, 'default' => true],
		);

		// Color options
		$addOptionField(
			'InputfieldText',
			'rwSwatches',
			$this->_('Preset Swatches'),
			['color'],
			$this->_('Comma-separated hex swatch colors (e.g. #0f172a, #2563eb, #16a34a).'),
			['columnWidth' => 50],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwAllowAlpha',
			$this->_('Allow Alpha Channel'),
			['color'],
			'',
			['columnWidth' => 25],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwClearable',
			$this->_('Allow Clearing Selection'),
			['phone', 'color', 'combobox', 'country', 'countries', 'timezone', 'currency_code', 'spacing', 'otp'],
			'',
			['columnWidth' => 25],
		);

		// Tags options
		$addOptionField(
			'InputfieldText',
			'rwSuggestions',
			$this->_('Tag Suggestions'),
			['tags'],
			$this->_('Comma-separated autocomplete suggestions.'),
			['columnWidth' => 50],
		);
		$addOptionField(
			'InputfieldText',
			'rwDelimiter',
			$this->_('Storage Delimiter'),
			['tags'],
			$this->_('Separator when stored as a text string (default `,`).'),
			['columnWidth' => 25, 'placeholder' => ','],
		);
		$addOptionField(
			'InputfieldInteger',
			'rwMaxItems',
			$this->_('Maximum Items'),
			['tags', 'combobox', 'countries'],
			'',
			['columnWidth' => 25],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwAllowCustom',
			$this->_('Allow Custom Entries'),
			['tags', 'combobox'],
			'',
			['columnWidth' => 50, 'default' => true],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwAllowDuplicates',
			$this->_('Allow Duplicate Tags'),
			['tags'],
			'',
			['columnWidth' => 50],
		);

		// Unit number / Currency / Spacing options
		$addOptionField(
			'InputfieldText',
			'rwUnits',
			$this->_('Units / Currencies List'),
			['unit_number', 'currency', 'spacing'],
			$this->_('Comma-separated unit or currency codes (e.g. px, rem, % or EUR, USD, TRY).'),
			['columnWidth' => 50, 'placeholder' => 'px, rem, %'],
		);
		$addOptionField(
			'InputfieldText',
			'rwDefaultUnit',
			$this->_('Default Unit'),
			['unit_number', 'currency', 'spacing'],
			'',
			['columnWidth' => 25],
		);
		$addOptionField(
			'InputfieldText',
			'rwCurrency',
			$this->_('Currency Code'),
			['currency', 'unit_number'],
			$this->_('Default ISO currency code when using the currency variant (e.g. EUR).'),
			['columnWidth' => 25],
		);
		$addOptionField(
			'InputfieldInteger',
			'rwPrecision',
			$this->_('Decimal Precision'),
			['unit_number', 'currency', 'calculation'],
			'',
			['columnWidth' => 33],
		);
		$addOptionField(
			'InputfieldText',
			'rwLocale',
			$this->_('Display Locale'),
			['unit_number', 'currency'],
			$this->_('Optional BCP 47 locale (e.g. en-US, de-DE).'),
			['columnWidth' => 33],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwAllowAuto',
			$this->_('Allow `auto` Keyword'),
			['spacing'],
			'',
			['columnWidth' => 33],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwAllowNegative',
			$this->_('Allow Negative Values'),
			['spacing'],
			'',
			['columnWidth' => 34],
		);

		// OTP / Password options
		$addOptionField(
			'InputfieldInteger',
			'rwOtpLength',
			$this->_('OTP Digit Count'),
			['otp'],
			'',
			['columnWidth' => 25, 'default' => '6'],
		);
		$addOptionField(
			'InputfieldSelect',
			'rwOtpMode',
			$this->_('OTP Character Mode'),
			['otp'],
			'',
			[
				'columnWidth' => 25,
				'options' => [
					'numeric' => $this->_('Numeric Only'),
					'alphanumeric' => $this->_('Alphanumeric'),
				],
			],
		);
		$addOptionField(
			'InputfieldInteger',
			'rwOtpSeparatorAfter',
			$this->_('Separator After Slot'),
			['otp'],
			'',
			['columnWidth' => 25],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwOtpMask',
			$this->_('Mask Input Slots'),
			['otp'],
			'',
			['columnWidth' => 25],
		);

		$addOptionField(
			'InputfieldCheckbox',
			'rwShowStrength',
			$this->_('Show Strength Meter'),
			['password'],
			'',
			['columnWidth' => 33, 'default' => true],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwShowRequirements',
			$this->_('Show Checklist'),
			['password'],
			'',
			['columnWidth' => 33],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwAllowGenerate',
			$this->_('Show Password Generator'),
			['password'],
			'',
			['columnWidth' => 34],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwRequireUppercase',
			$this->_('Require Uppercase Letter'),
			['password'],
			'',
			['columnWidth' => 25],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwRequireLowercase',
			$this->_('Require Lowercase Letter'),
			['password'],
			'',
			['columnWidth' => 25],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwRequireNumber',
			$this->_('Require Number'),
			['password'],
			'',
			['columnWidth' => 25],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwRequireSymbol',
			$this->_('Require Symbol'),
			['password'],
			'',
			['columnWidth' => 25],
		);

		// Markdown options
		$addOptionField(
			'InputfieldSelect',
			'rwPreviewMode',
			$this->_('Initial Markdown Mode'),
			['markdown'],
			'',
			[
				'columnWidth' => 34,
				'options' => [
					'write' => $this->_('Write'),
					'split' => $this->_('Split View'),
					'preview' => $this->_('Preview'),
				],
			],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwAllowSplit',
			$this->_('Enable Split Preview'),
			['markdown'],
			'',
			['columnWidth' => 33, 'default' => true],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwShowToolbar',
			$this->_('Show Formatting Toolbar'),
			['markdown'],
			'',
			['columnWidth' => 33, 'default' => true],
		);

		// Date / Time / Datetime / DateRange options
		$addOptionField(
			'InputfieldSelect',
			'rwDatetimeMode',
			$this->_('Date Picker UI Mode'),
			['date', 'time', 'datetime', 'daterange'],
			'',
			[
				'columnWidth' => 34,
				'options' => [
					'picker' => $this->_('Calendar Popover'),
					'html' => $this->_('Native HTML Input'),
					'text' => $this->_('Plain Text Input'),
				],
			],
		);
		$addOptionField(
			'InputfieldSelect',
			'rwHourFormat',
			$this->_('Clock Format'),
			['time', 'datetime'],
			'',
			['columnWidth' => 33, 'options' => ['24h' => '24h', '12h' => '12h']],
		);
		$addOptionField(
			'InputfieldInteger',
			'rwMinuteStep',
			$this->_('Minute Step'),
			['time', 'datetime'],
			'',
			['columnWidth' => 33],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwShowSeconds',
			$this->_('Show Seconds'),
			['time', 'datetime'],
			'',
			['columnWidth' => 33],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwPresets',
			$this->_('Show Quick Range Presets'),
			['daterange'],
			'',
			['columnWidth' => 33],
		);
		$addOptionField(
			'InputfieldInteger',
			'rwNumberOfMonths',
			$this->_('Calendar Months'),
			['daterange'],
			'',
			['columnWidth' => 34],
		);

		// Range Slider / Rating / Calculation / ColSpan / Slug / Secret
		$addOptionField(
			'InputfieldText',
			'rwMinDistance',
			$this->_('Minimum Handle Distance'),
			['range_slider'],
			'',
			['columnWidth' => 50],
		);
		$addOptionField(
			'InputfieldInteger',
			'rwMaxStars',
			$this->_('Maximum Stars'),
			['rating'],
			'',
			['columnWidth' => 50, 'default' => '5'],
		);
		$addOptionField(
			'InputfieldText',
			'rwFormula',
			$this->_('Calculation Formula'),
			['calculation'],
			$this->_('Arithmetic formula referencing sibling field names (e.g. `price * qty`).'),
			['columnWidth' => 66],
		);
		$addOptionField(
			'InputfieldSelect',
			'rwValueMode',
			$this->_('Column Span Mode'),
			['colspan'],
			'',
			[
				'columnWidth' => 50,
				'options' => [
					'columns' => $this->_('Columns (1-12)'),
					'percent' => $this->_('Percentage (%)'),
				],
			],
		);
		$addOptionField(
			'InputfieldText',
			'rwSlugFrom',
			$this->_('Slug Source Field'),
			['slug'],
			$this->_('Field name watched for automatic URL slug generation.'),
			['columnWidth' => 40],
		);
		$addOptionField(
			'InputfieldText',
			'rwSlugSeparator',
			$this->_('Slug Separator'),
			['slug'],
			'',
			['columnWidth' => 20, 'placeholder' => '-'],
		);
		$addOptionField(
			'InputfieldInteger',
			'rwSlugMaxLength',
			$this->_('Slug Max Length'),
			['slug'],
			'',
			['columnWidth' => 20],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwSlugLocked',
			$this->_('Lock Auto-Sync When Populated'),
			['slug'],
			'',
			['columnWidth' => 20],
		);
		$addOptionField(
			'InputfieldText',
			'rwSecretPrefix',
			$this->_('Generated Secret Prefix'),
			['secret'],
			'',
			['columnWidth' => 34],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwSecretMasked',
			$this->_('Mask Secret by Default'),
			['secret'],
			'',
			['columnWidth' => 33, 'default' => true],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwSecretAutogen',
			$this->_('Show Generate Secret Button'),
			['secret'],
			'',
			['columnWidth' => 33, 'default' => true],
		);

		// Condition Builder options
		$addOptionField(
			'InputfieldTextarea',
			'rwConditionFields',
			$this->_('Condition Field Specifications (JSON)'),
			['condition_builder'],
			$this->_('Optional JSON array of {key, label, type, group, options} definitions for available condition source/target fields.'),
			['columnWidth' => 100, 'rows' => 4],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwAllowFieldComparison',
			$this->_('Allow Field-to-Field Comparison'),
			['condition_builder'],
			$this->_('Allow rules to compare a source field against another field in the list.'),
			['columnWidth' => 33],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwAllowNegate',
			$this->_('Allow Group Negation (NOT)'),
			['condition_builder'],
			'',
			['columnWidth' => 33, 'default' => true],
		);
		$addOptionField(
			'InputfieldCheckbox',
			'rwShowSummary',
			$this->_('Show Live Rule Summary'),
			['condition_builder'],
			'',
			['columnWidth' => 34, 'default' => true],
		);
		$addOptionField(
			'InputfieldSelect',
			'rwLayout',
			$this->_('Builder Layout'),
			['condition_builder'],
			'',
			[
				'columnWidth' => 34,
				'options' => [
					'auto' => $this->_('Auto (Container Responsive)'),
					'inline' => $this->_('Inline Row'),
					'compact' => $this->_('Compact Stacked'),
				],
			],
		);
		$addOptionField(
			'InputfieldInteger',
			'rwMaxGroups',
			$this->_('Max Condition Groups'),
			['condition_builder'],
			'',
			['columnWidth' => 33],
		);
		$addOptionField(
			'InputfieldInteger',
			'rwMaxRulesPerGroup',
			$this->_('Max Rules Per Group'),
			['condition_builder'],
			'',
			['columnWidth' => 33],
		);

		$sanitizedId = $sanitizer->name('rwControlFieldset');
		if ($sanitizedId !== '') {
			$fieldset->attr('id', 'Inputfield_' . $sanitizedId);
		}

		$wrapper->add($fieldset);
	}

	/**
	 * Copy `Field` `rwControl` and `rw*` settings onto native ProcessWire `Inputfield`
	 * instances created inside `Field::getInputfield()` (native Inputfields otherwise drop custom keys).
	 */
	public function applyFieldSettingsToInputfield(Field $field, Inputfield $inputfield): void
	{
		if ($this->isExcludedInputfield($inputfield)) {
			return;
		}

		$rwControl = $this->normalizeStoredControlValue((string) ($field->get('rwControl') ?? ''));
		if ($rwControl === '') {
			return;
		}

		$inputfield->set('rwControl', $rwControl);
		$inputfield->attr('data-rw-control', $rwControl);

		if ($rwControl === 'countries') {
			$inputfield->set('multiple', true);
		}
		if ($rwControl === 'currency' || $rwControl === 'money') {
			$inputfield->set('unitVariant', 'currency');
		}

		foreach (self::FIELD_SETTING_MAP as $fieldKey => $inputKey) {
			$val = $field->get($fieldKey);
			if ($val === null || $val === '') {
				continue;
			}

			if (in_array($fieldKey, self::BOOL_FIELD_SETTINGS, true)) {
				$boolVal = !empty($val);
				$inputfield->set($inputKey, $boolVal);
				continue;
			}

			if (in_array($fieldKey, self::INT_FIELD_SETTINGS, true)) {
				if (is_numeric($val)) {
					$inputfield->set($inputKey, (int) $val);
				}
				continue;
			}

			if (in_array($fieldKey, self::TOKEN_LIST_FIELD_SETTINGS, true)) {
				$tokens = is_array($val)
					? array_values(array_filter(array_map(static fn(mixed $v): string => is_scalar($v) ? trim((string) $v) : '', $val), static fn(string $s): bool => $s !== ''))
					: (is_scalar($val) ? $this->splitTokenList((string) $val) : []);
				if ($tokens !== []) {
					$inputfield->set($inputKey, $tokens);
				}
				continue;
			}

			if ($fieldKey === 'rwMinDistance' && is_numeric($val)) {
				$str = trim((string) $val);
				$inputfield->set($inputKey, str_contains($str, '.') ? (float) $str : (int) $str);
				continue;
			}

			if ($fieldKey === 'rwConditionFields') {
				$rawFields = is_array($val)
					? $val
					: (is_string($val) ? json_decode(trim($val), true) : null);
				if (is_array($rawFields)) {
					$normalizedFields = ConditionNormalizer::normalizeFieldSpecs($rawFields);
					if ($normalizedFields !== []) {
						$inputfield->set($inputKey, $normalizedFields);
					}
				}
				continue;
			}

			$inputfield->set($inputKey, $val);
		}

		$slugFrom = trim((string) ($field->get('rwSlugFrom') ?? ''));
		if ($slugFrom !== '') {
			$inputfield->set('slugFrom', $slugFrom);
			$inputfield->attr('data-slug-from', $slugFrom);
			$sep = trim((string) ($field->get('rwSlugSeparator') ?? '-')) ?: '-';
			$inputfield->set('slugSeparator', $sep);
			$inputfield->attr('data-slug-separator', $sep);
			if ($field->get('rwSlugLocked') !== null) {
				$inputfield->set('slugLocked', !empty($field->get('rwSlugLocked')));
			}
			$maxLen = $field->get('rwSlugMaxLength');
			if (is_numeric($maxLen) && (int) $maxLen > 0) {
				$inputfield->set('slugMaxLength', (int) $maxLen);
			}
		}

		if ($rwControl === 'secret') {
			$inputfield->set('isSecret', true);
			$masked = $field->get('rwSecretMasked');
			$isMasked = $masked === null ? true : !empty($masked);
			$inputfield->set('secretMasked', $isMasked);
			$inputfield->attr('data-secret-masked', $isMasked ? '1' : '0');
			$prefix = trim((string) ($field->get('rwSecretPrefix') ?? ''));
			if ($prefix !== '') {
				$inputfield->set('secretPrefix', $prefix);
				$inputfield->attr('data-secret-prefix', $prefix);
			}
			$autogen = $field->get('rwSecretAutogen');
			$isAutogen = $autogen === null ? true : !empty($autogen);
			$inputfield->set('secretAutoGenerate', $isAutogen);
			$inputfield->attr('data-secret-autogen', $isAutogen ? '1' : '0');
		}
	}

	/**
	 * Normalize posted form input before classic `Inputfield::___processInput()` executes,
	 * bridging array submissions, `{name}_present` empty clears, and ISO datetime formatting.
	 */
	public function normalizeProcessInput(HookEvent $event): void
	{
		$inputfield = $event->object;
		$input = $event->arguments(0);
		if (!$inputfield instanceof Inputfield || !$input instanceof WireInputData) {
			return;
		}

		$bridge = $this->resolveControlBridge($inputfield);
		if ($bridge === null) {
			return;
		}

		$rawName = $inputfield->attr('name');
		$name = is_scalar($rawName) ? trim((string) $rawName) : '';
		if ($name === '') {
			return;
		}

		$keys = [$name];
		$languages = $this->wire()->languages;
		if ((bool) $inputfield->getSetting('useLanguages') && is_iterable($languages)) {
			foreach ($languages as $lang) {
				if ($lang instanceof Language && !$lang->isDefault()) {
					$keys[] = $name . '__' . (int) $lang->id;
				}
			}
		}

		$canonical = $bridge['canonical'];
		$delimiter = (string) ($inputfield->getSetting('delimiter') ?? ',');
		if ($delimiter === '') {
			$delimiter = ',';
		}

		foreach ($keys as $key) {
			$rawSubmitted = $input->get($key);
			$hasPresentMarker = $input->get($key . '_present') !== null;

			if ($inputfield instanceof InputfieldDatetime) {
				if (is_string($rawSubmitted) && trim($rawSubmitted) !== '') {
					$normalizedDt = $this->normalizeDatetimeSubmission($inputfield, trim($rawSubmitted));
					if ($normalizedDt !== null) {
						$input->set($key, $normalizedDt);
					}
				}
				continue;
			}

			if ($inputfield instanceof InputfieldSelect) {
				if ($inputfield instanceof InputfieldHasArrayValue) {
					if ($rawSubmitted === null && $hasPresentMarker) {
						$input->set($key, []);
					} elseif (is_string($rawSubmitted)) {
						$tokens = $this->splitTokenList($rawSubmitted);
						$input->set($key, $tokens);
					}
				} elseif (is_array($rawSubmitted)) {
					$first = reset($rawSubmitted);
					$input->set($key, is_scalar($first) ? (string) $first : '');
				}
				continue;
			}

			if ($inputfield instanceof InputfieldText && !$inputfield instanceof InputfieldHasArrayValue) {
				if (is_array($rawSubmitted)) {
					if (in_array($canonical, self::JSON_OBJECT_CONTROLS, true)) {
						$input->set($key, (string) json_encode($rawSubmitted, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
					} else {
						$cleanItems = [];
						foreach ($rawSubmitted as $item) {
							if (!is_scalar($item)) {
								continue;
							}
							$trimmed = trim((string) $item);
							if ($trimmed !== '') {
								$cleanItems[] = $trimmed;
							}
						}
						$input->set($key, implode($delimiter, $cleanItems));
					}
				} elseif ($rawSubmitted === null && $hasPresentMarker) {
					$input->set($key, '');
				}
			}
		}
	}

	/**
	 * Convert associative arrays into canonical JSON/delimited strings before `FieldtypeText::___sleepValue()`.
	 */
	public function handleFieldtypeTextSleepValue(Field $field, mixed $value): ?string
	{
		if ($value instanceof LanguagesValueInterface) {
			return null;
		}

		$rwControl = $this->normalizeStoredControlValue((string) ($field->get('rwControl') ?? ''));
		if ($rwControl === '' || !is_array($value)) {
			return null;
		}

		$canonical = self::canonicalControlType($rwControl);
		if (in_array($canonical, self::JSON_OBJECT_CONTROLS, true)) {
			return (string) json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
		}

		$delimiter = (string) ($field->get('rwDelimiter') ?? ',');
		if ($delimiter === '') {
			$delimiter = ',';
		}

		$cleanItems = [];
		foreach ($value as $item) {
			if (!is_scalar($item)) {
				continue;
			}
			$trimmed = trim((string) $item);
			if ($trimmed !== '') {
				$cleanItems[] = $trimmed;
			}
		}

		return implode($delimiter, $cleanItems);
	}

	/**
	 * Decode structured JSON strings into arrays on formatted `FieldtypeText` page reads (`of(true)`).
	 * Returns `[true, $decoded]` when the caller should replace the event return, or `[false, null]` otherwise.
	 *
	 * @return array{0: bool, 1: mixed}
	 */
	public function handleFieldtypeTextFormatValue(Field $field, mixed $value): array
	{
		if ($value instanceof LanguagesValueInterface || !is_string($value) || trim($value) === '') {
			return [false, null];
		}

		$rwControl = $this->normalizeStoredControlValue((string) ($field->get('rwControl') ?? ''));
		if ($rwControl === '') {
			return [false, null];
		}

		$canonical = self::canonicalControlType($rwControl);
		if (!in_array($canonical, self::JSON_OBJECT_CONTROLS, true)) {
			return [false, null];
		}

		$trimmed = trim($value);
		if ($trimmed[0] !== '{' && $trimmed[0] !== '[') {
			return [false, null];
		}

		$decoded = json_decode($trimmed, true);
		if (!is_array($decoded)) {
			return [false, null];
		}

		return [true, $decoded];
	}

	/**
	 * Render safe HTML markup previews for `rwControl`-enhanced `FieldtypeText` fields in admin listers.
	 */
	public function renderTextMarkupValue(Field $field, mixed $rawValue, string $property = ''): ?string
	{
		$rwControl = $this->normalizeStoredControlValue((string) ($field->get('rwControl') ?? ''));
		if ($rwControl === '') {
			return null;
		}

		if ($rawValue instanceof LanguagesValueInterface) {
			$rawValue = $rawValue instanceof Stringable ? (string) $rawValue : '';
		}

		$sanitizer = $this->wire()->sanitizer;
		$canonical = self::canonicalControlType($rwControl);

		if ($canonical === 'password' || $rwControl === 'secret') {
			$hasSecret = is_scalar($rawValue) && trim((string) $rawValue) !== '';

			return $hasSecret
				? '<span class="pw-rw-masked" aria-label="' . $sanitizer->entities($this->_('Masked value')) . '">••••••••</span>'
				: '';
		}

		if ($rawValue === null || $rawValue === '') {
			return '';
		}

		if ($canonical === 'color' && is_scalar($rawValue)) {
			$color = trim((string) $rawValue);
			if ($color === '') {
				return '';
			}
			$safe = $sanitizer->entities($color);
			$cssBackground = preg_match('/^(?:#[0-9a-fA-F]{3,8}|(?:rgb|hsl)a?\([0-9.,%\s\/]+\))$/', $color) === 1
				? $color
				: 'transparent';

			return '<span class="rw-color-preview" style="display:inline-flex;align-items:center;gap:6px">'
				. '<span style="display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid rgba(0,0,0,.2);background:' . $cssBackground . '"></span>'
				. '<code>' . $safe . '</code></span>';
		}

		if ($rwControl === 'country' && is_scalar($rawValue)) {
			$code = strtoupper(trim((string) $rawValue));
			$name = $code !== '' ? IntlCatalog::countryName($code) : '';

			return $name !== '' ? $sanitizer->entities($name . ' (' . $code . ')') : $sanitizer->entities($code);
		}

		if ($rwControl === 'currency_code' && is_scalar($rawValue)) {
			$code = strtoupper(trim((string) $rawValue));
			$name = $code !== '' ? IntlCatalog::currencyName($code) : '';

			return $name !== '' ? $sanitizer->entities($code . ' — ' . $name) : $sanitizer->entities($code);
		}

		if ($canonical === 'tags' || $rwControl === 'countries' || (in_array($canonical, ['combobox', 'segmented'], true) && (bool) $field->get('rwMultiple'))) {
			$delimiter = (string) ($field->get('rwDelimiter') ?? ',');
			$items = is_array($rawValue)
				? array_values(array_filter(array_map('strval', $rawValue), static fn(string $v): bool => trim($v) !== ''))
				: $this->splitTokenList((string) $rawValue, $delimiter ?: ',');
			if ($items === []) {
				return '';
			}

			$badges = array_map(static function (string $item) use ($sanitizer, $rwControl): string {
				$label = $rwControl === 'countries'
					? (IntlCatalog::countryName(strtoupper($item)) ?: strtoupper($item))
					: $item;

				return '<span style="display:inline-block;padding:1px 6px;margin:1px 3px 1px 0;border-radius:4px;background:rgba(100,116,139,.14);font-size:12px">'
					. $sanitizer->entities($label)
					. '</span>';
			}, $items);

			return implode('', $badges);
		}

		if (in_array($canonical, self::JSON_OBJECT_CONTROLS, true)) {
			$arr = is_array($rawValue) ? $rawValue : (is_string($rawValue) ? json_decode(trim($rawValue), true) : null);
			if (!is_array($arr)) {
				return is_scalar($rawValue) ? $sanitizer->entities((string) $rawValue) : '';
			}

			if ($property !== '' && isset($arr[$property]) && is_scalar($arr[$property])) {
				return $sanitizer->entities((string) $arr[$property]);
			}

			return match ($canonical) {
				'unit_number' => $sanitizer->entities(trim(((string) ($arr['value'] ?? '')) . ' ' . ((string) ($arr['unit'] ?? '')))),
				'spacing' => $sanitizer->entities(trim(sprintf(
					'%s %s %s %s %s',
					(string) ($arr['top'] ?? '0'),
					(string) ($arr['right'] ?? '0'),
					(string) ($arr['bottom'] ?? '0'),
					(string) ($arr['left'] ?? '0'),
					(string) ($arr['unit'] ?? ''),
				))),
				'range_slider' => $sanitizer->entities(((string) ($arr['min'] ?? '')) . ' – ' . ((string) ($arr['max'] ?? ''))),
				'daterange' => $sanitizer->entities(((string) ($arr['from'] ?? '')) . ' – ' . ((string) ($arr['to'] ?? ''))),
				'condition_builder' => ConditionNormalizer::renderSummaryMarkup(
					$arr,
					ConditionNormalizer::normalizeFieldSpecs($field->get('rwConditionFields') ?? $field->get('conditionFields')),
					$property
				),
			};
		}

		if (is_scalar($rawValue)) {
			return $sanitizer->entities((string) $rawValue);
		}

		return null;
	}

	/**
	 * Build compatible `rwControl` select options for a given ProcessWire `Fieldtype` instance.
	 *
	 * @return array<string, string>
	 */
	public function resolveCompatibleControlOptions(object $fieldtype): array
	{
		if ($fieldtype instanceof FieldtypeTextarea) {
			return [
				'markdown' => $this->_('Markdown Editor'),
				'signature' => $this->_('Signature Pad'),
				'condition_builder' => $this->_('Condition Rule Builder'),
			];
		}

		if ($fieldtype instanceof FieldtypeInteger) {
			return [
				'rating' => $this->_('Star Rating'),
				'range' => $this->_('Range Slider'),
				'colspan' => $this->_('Grid Column Span'),
				'calculation' => $this->_('Calculated Number'),
			];
		}

		if ($fieldtype instanceof FieldtypeDecimal || $fieldtype instanceof FieldtypeFloat) {
			return [
				'range' => $this->_('Range Slider'),
				'rating' => $this->_('Star Rating'),
				'calculation' => $this->_('Calculated Number'),
			];
		}

		if ($fieldtype instanceof FieldtypeDatetime) {
			return [
				'date' => $this->_('Date Picker'),
				'time' => $this->_('Time Picker'),
				'datetime' => $this->_('Date & Time Picker'),
			];
		}

		if ($fieldtype instanceof FieldtypeOptions) {
			return [
				'combobox' => $this->_('Searchable Combobox'),
				'segmented' => $this->_('Segmented Control'),
				'tags' => $this->_('Tags Chips'),
			];
		}

		if ($fieldtype instanceof FieldtypeText) {
			return [
				'phone' => $this->_('International Phone (E.164)'),
				'country' => $this->_('Country Selector (Single)'),
				'countries' => $this->_('Country Selector (Multiple)'),
				'timezone' => $this->_('Timezone Selector'),
				'currency_code' => $this->_('Currency Code (ISO 4217)'),
				'color' => $this->_('Color Swatch & Alpha Picker'),
				'tags' => $this->_('Tags Input'),
				'combobox' => $this->_('Searchable Combobox'),
				'segmented' => $this->_('Segmented Control'),
				'unit_number' => $this->_('Unit + Number'),
				'currency' => $this->_('Money / Currency Amount'),
				'spacing' => $this->_('4-Side Box Spacing'),
				'otp' => $this->_('OTP / PIN Slots'),
				'password' => $this->_('Password Strength Input'),
				'date' => $this->_('Date Picker'),
				'time' => $this->_('Time Picker'),
				'datetime' => $this->_('Date & Time Picker'),
				'daterange' => $this->_('Date Range Picker'),
				'range_slider' => $this->_('Dual Range Slider'),
				'rating' => $this->_('Star Rating'),
				'slug' => $this->_('Auto-Synced URL Slug'),
				'secret' => $this->_('Masked Secret Token'),
				'condition_builder' => $this->_('Condition Rule Builder'),
			];
		}

		return [];
	}

	private function isExcludedInputfield(Inputfield $inputfield): bool
	{
		return $inputfield instanceof InputfieldReact
			|| $inputfield instanceof InputfieldWrapper
			|| $inputfield instanceof InputfieldSubmit
			|| $inputfield instanceof InputfieldHidden
			|| $inputfield->className() === 'InputfieldTiptap'
			|| $inputfield->attr('data-rw-native-only') === '1'
			|| (bool) $inputfield->get('_rwNativeOnly');
	}

	private function normalizeStoredControlValue(string $raw): string
	{
		return strtolower(trim($raw));
	}

	/**
	 * Build lightweight hidden fallback inputs inside the unmounted island host so form POSTs
	 * succeed immediately if submitted before client JS hydrates or when native dependencies inspect DOM.
	 *
	 * @param array<string, mixed> $node
	 */
	private function buildFallbackHiddenInputsHtml(array $node): string
	{
		$name = (string) ($node['name'] ?? '');
		if ($name === '' || !empty($node['disabled'])) {
			return '';
		}

		$sanitizer = $this->wire()->sanitizer;
		$escName = $sanitizer->entities($name);
		$val = $node['value'] ?? $node['defaultValue'] ?? '';
		$type = (string) ($node['type'] ?? '');
		$isMulti = !empty($node['multiple']) || $type === 'tags';

		if ($isMulti && is_array($val)) {
			$out = '<input type="hidden" name="' . $escName . '_present" value="1">';
			foreach ($val as $item) {
				if (is_scalar($item)) {
					$out .= '<input type="hidden" name="' . $escName . '[]" value="' . $sanitizer->entities((string) $item) . '">';
				}
			}

			return $out;
		}

		if (is_array($val)) {
			$encoded = (string) json_encode($val, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

			return '<input type="hidden" name="' . $escName . '" value="' . $sanitizer->entities($encoded) . '">';
		}

		$strVal = is_scalar($val) ? (string) $val : '';
		$isPasswordInput = $type === 'password'
			|| ($type === 'text' && strtolower((string) ($node['inputType'] ?? '')) === 'password');
		if ($isPasswordInput && empty($node['isSecret'])) {
			$strVal = '';
		}
		if ($type === 'checkbox') {
			return !empty($node['checked'])
				? '<input type="hidden" name="' . $escName . '" value="' . $sanitizer->entities((string) ($node['checkedValue'] ?? '1')) . '">'
				: '';
		}

		return '<input type="hidden" name="' . $escName . '" value="' . $sanitizer->entities($strVal) . '">';
	}

	/**
	 * Normalize ISO date/time submissions from React controls into the configured `InputfieldDatetime` format.
	 */
	private function normalizeDatetimeSubmission(InputfieldDatetime $inputfield, string $submitted): ?string
	{
		$dateFormat = trim((string) ($inputfield->getSetting('dateInputFormat') ?? ''));
		$timeFormat = trim((string) ($inputfield->getSetting('timeInputFormat') ?? ''));
		$targetFormat = trim($dateFormat . ($timeFormat !== '' ? ' ' . $timeFormat : ''));

		if (preg_match('/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)$/', $submitted, $matches) === 1) {
			if ($targetFormat === '' || $targetFormat === 'Y-m-d H:i' || $targetFormat === 'Y-m-d H:i:s') {
				return $matches[1] . ' ' . $matches[2];
			}
			$dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $matches[1] . ' ' . (strlen($matches[2]) === 5 ? $matches[2] . ':00' : $matches[2]));
			return $dt instanceof DateTimeImmutable ? $dt->format($targetFormat) : ($matches[1] . ' ' . $matches[2]);
		}

		if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $submitted) === 1 && $dateFormat !== '' && $dateFormat !== 'Y-m-d') {
			$dt = DateTimeImmutable::createFromFormat('!Y-m-d', $submitted);
			return $dt instanceof DateTimeImmutable ? $dt->format($dateFormat) : null;
		}

		if (preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $submitted) === 1 && $timeFormat !== '' && $timeFormat !== 'H:i' && $timeFormat !== 'H:i:s') {
			$padded = strlen($submitted) === 5 ? $submitted . ':00' : $submitted;
			$dt = DateTimeImmutable::createFromFormat('H:i:s', $padded);
			return $dt instanceof DateTimeImmutable ? $dt->format($timeFormat) : null;
		}

		return null;
	}

	/**
	 * @return list<string>
	 */
	private function splitTokenList(string $raw, string $delimiter = ','): array
	{
		$trimmed = trim($raw);
		if ($trimmed === '') {
			return [];
		}

		if ($trimmed[0] === '[') {
			$decoded = json_decode($trimmed, true);
			if (is_array($decoded)) {
				return array_values(array_filter(array_map(static fn(mixed $v): string => is_scalar($v) ? trim((string) $v) : '', $decoded), static fn(string $s): bool => $s !== ''));
			}
		}

		$parts = ($delimiter === '' || $delimiter === ',')
			? preg_split('/[\r\n,]+/', $trimmed)
			: explode($delimiter, $trimmed);
		if (!is_array($parts)) {
			return [];
		}

		return array_values(array_filter(array_map(static fn(string $v): string => trim($v), $parts), static fn(string $s): bool => $s !== ''));
	}
}
