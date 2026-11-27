<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Condition\ConditionEvaluator;
use Totoglu\React\Condition\ConditionNormalizer;
use Totoglu\React\Inertia\InputfieldReact;
use Totoglu\React\Support\IslandMarkup;

/**
 * InputfieldReactCondition
 *
 * Dual-mode Inertia + React ProcessWire Inputfield (`extends InputfieldReact`) providing a
 * visual rule and condition builder with categorized searchable field pickers, AND/OR group logic,
 * optional group negation (`NOT`), value-or-field target comparisons, and live expression previews.
 *
 * Stores and serializes canonical 2-level `{ match, groups: [{ id, match, negate?, rules }] }` trees.
 *
 * @property array<int, array<string, mixed>>|string $conditionFields Available source/target field descriptors
 * @property array<string, mixed>|null $conditionFieldsSource Optional dynamic field-source descriptor
 * @property bool $allowFieldComparison Allow `Value | Field` right-hand target comparisons (default: true)
 * @property bool $allowNegate Allow `NOT` negation toggle on condition groups (default: true)
 * @property bool $showSummary Display the live human-readable condition summary bar (default: true)
 * @property string $layout Responsive layout preset (`auto`, `inline`, `compact`)
 * @property int $maxGroups Optional upper cap on groups (0 = default ConditionNormalizer::MAX_GROUPS)
 * @property int $maxRulesPerGroup Optional upper cap on rules per group (0 = default ConditionNormalizer::MAX_RULES_PER_GROUP)
 * @property string $emptyMessage Optional empty-state message shown when zero groups are configured
 * @property bool $readOnly Render the builder in read-only mode
 */
class InputfieldReactCondition extends InputfieldReact implements InputfieldHasArrayValue
{
	public const bool INERTIA_IS_CONDITION_FIELD = true;

	public function __construct()
	{
		parent::__construct();
		$this->set('conditionFields', []);
		$this->set('conditionFieldsSource', null);
		$this->set('allowFieldComparison', true);
		$this->set('allowNegate', true);
		$this->set('showSummary', true);
		$this->set('allowRawExpression', false);
		$this->set('showLabel', false);
		$this->set('heading', '');
		$this->set('layout', 'auto');
		$this->set('maxGroups', 0);
		$this->set('maxRulesPerGroup', 0);
		$this->set('emptyMessage', '');
		$this->set('readOnly', false);
		$this->setAttribute('value', [
			'match' => 'all',
			'groups' => [],
		]);
	}

	public function inertiaComponent(): string
	{
		return 'InputfieldReactCondition';
	}

	/**
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		return React::instance($this)->resolveModuleAssetUrl('InputfieldReactCondition.js');
	}

	/**
	 * Determine whether a ProcessWire `Field` uses `InputfieldReactCondition` (`FieldtypeText` or `FieldtypeTextarea`).
	 */
	public static function isConditionField(Field $field): bool
	{
		if (!$field->type instanceof FieldtypeText) {
			return false;
		}
		$cls = strtolower(trim((string) ($field->get('inputfieldClass') ?? '')));

		return $cls === 'inputfieldreactcondition';
	}

	/**
	 * Normalize arbitrary condition tree input into `{match: 'all'|'any', groups: [...]}`.
	 *
	 * @return array{match: string, groups: list<array<string, mixed>>}
	 */
	public static function normalizeValue(mixed $value): array
	{
		return ConditionNormalizer::normalizeTree($value);
	}

	/**
	 * Encode a condition tree as canonical JSON (`""` when empty).
	 */
	public static function encodeJson(mixed $value): string
	{
		return ConditionNormalizer::encodeTree($value);
	}

	/**
	 * Evaluate a condition tree against a context array or lazy callable resolver.
	 *
	 * @param array<string, mixed>|callable(string): mixed $context
	 * @param array{
	 *   emptyResult?: bool,
	 *   caseSensitive?: bool,
	 *   fieldAliases?: array<string, string>,
	 *   customOperators?: array<string, callable(mixed, mixed, array<string, mixed>, bool): bool>
	 * } $options
	 */
	public static function evaluate(mixed $value, array|callable $context, array $options = []): bool
	{
		return ConditionEvaluator::evaluate($value, $context, $options);
	}

	/**
	 * Render entity-escaped summary markup for Lister / `markupValue()` / `renderValue()` fallbacks.
	 *
	 * @param list<array<string, mixed>> $fieldSpecs
	 */
	public static function renderConditionMarkup(mixed $value, array $fieldSpecs = [], string $property = ''): string
	{
		return ConditionNormalizer::renderSummaryMarkup($value, $fieldSpecs, $property);
	}

	/**
	 * @return array{match: string, groups: list<array<string, mixed>>}
	 */
	public function getNormalizedTree(): array
	{
		return ConditionNormalizer::normalizeTree($this->attr('value'));
	}

	/**
	 * Normalize any array/JSON `conditionFields` configured on this `Inputfield`.
	 *
	 * @return list<array<string, mixed>>
	 */
	public function getNormalizedFieldSpecs(): array
	{
		return ConditionNormalizer::normalizeFieldSpecs($this->getSetting('conditionFields'));
	}

	protected function serializeValueForHiddenInput(mixed $value): string
	{
		return ConditionNormalizer::encodeTree($value);
	}

	/**
	 * Override default Inertia prop value with normalized rule tree and declarative builder options.
	 *
	 * @return array<string, mixed>
	 */
	public function toInertiaProp(): array
	{
		$prop = parent::toInertiaProp();
		$data = $this->inertiaWithData();
		$prop['props'] = $data;
		$prop['value'] = $data['value'];

		return $prop;
	}

	/**
	 * @return array<string, mixed>
	 */
	public function inertiaWithData(): array
	{
		$rawId = $this->stringAttr('id');
		$inputName = $this->stringAttr('name');
		$inputId = $rawId !== '' ? $rawId : ($inputName !== '' ? 'Inputfield_' . $inputName : '');
		$rawLayout = strtolower(trim((string) $this->getSetting('layout')));
		$layout = in_array($rawLayout, ['auto', 'inline', 'compact'], true) ? $rawLayout : 'auto';
		$tree = $this->getNormalizedTree();
		$fields = $this->getNormalizedFieldSpecs();
		$rawSource = $this->getSetting('conditionFieldsSource');
		$source = is_array($rawSource) ? $rawSource : null;
		$allowComparison = $this->getSetting('allowFieldComparison') !== null
			? (bool) $this->getSetting('allowFieldComparison')
			: true;
		$allowNegate = $this->getSetting('allowNegate') !== null
			? (bool) $this->getSetting('allowNegate')
			: true;
		$showSummary = $this->getSetting('showSummary') !== null
			? (bool) $this->getSetting('showSummary')
			: true;
		$maxGroups = max(0, min(ConditionNormalizer::MAX_GROUPS, (int) $this->getSetting('maxGroups')));
		$maxRulesPerGroup = max(0, min(ConditionNormalizer::MAX_RULES_PER_GROUP, (int) $this->getSetting('maxRulesPerGroup')));
		$emptyMsg = trim((string) $this->getSetting('emptyMessage'));

		return [
			'controlType' => 'condition_builder',
			'id' => $inputId,
			'name' => $inputName,
			'label' => (string) $this->label,
			'description' => (string) $this->description,
			'required' => (bool) $this->getSetting('required'),
			'disabled' => !empty($this->attr('disabled')),
			'readOnly' => $this->isEffectivelyReadOnly(),
			'value' => $tree,
			'conditionFields' => $fields,
			'conditionFieldsSource' => $source,
			'allowFieldComparison' => $allowComparison,
			'allowNegate' => $allowNegate,
			'showSummary' => $showSummary,
			'allowRawExpression' => (bool) $this->getSetting('allowRawExpression'),
			'showLabel' => (bool) $this->getSetting('showLabel'),
			'heading' => trim((string) $this->getSetting('heading')),
			'layout' => $layout,
			'maxGroups' => $maxGroups,
			'maxRulesPerGroup' => $maxRulesPerGroup,
			'emptyMessage' => $emptyMsg,
		];
	}

	/**
	 * Render read-only Inertia island with entity-escaped summary markup fallback.
	 */
	public function ___renderValue(): string
	{
		$payload = $this->inertia()->resolver->resolveValue($this->toInertiaProp());
		$data = is_array($payload) ? $payload : $this->toInertiaProp();
		$data['readOnly'] = true;
		if (isset($data['props']) && is_array($data['props'])) {
			$data['props']['readOnly'] = true;
		}

		$component = is_string($data['component'] ?? null) ? $data['component'] : $this->inertiaComponent();

		return IslandMarkup::render($component, $data, [
			'class' => 'pw-inertia-inputfield-island',
			'data-readonly' => 'true',
		], ConditionNormalizer::renderSummaryMarkup($this->getNormalizedTree(), $this->getNormalizedFieldSpecs()));
	}

	/**
	 * Process submitted condition tree (`{name}` JSON string, array, or flat expression).
	 */
	public function ___processInput(WireInputData $input): self
	{
		if ($this->isInputProcessingLocked()) {
			return $this;
		}

		$name = $this->stringAttr('name');
		if ($name === '' || $input[$name] === null) {
			return $this;
		}

		$normalized = ConditionNormalizer::normalizeTree($input[$name]);

		$allowNegate = (bool) $this->getSetting('allowNegate');
		if (!$allowNegate) {
			$hadDisallowedNegate = false;
			foreach ($normalized['groups'] as &$group) {
				if (!empty($group['negate'])) {
					unset($group['negate']);
					$hadDisallowedNegate = true;
				}
			}
			unset($group);
			if ($hadDisallowedNegate) {
				$this->error($this->_('Group negation is not permitted on this condition field.'));
			}
		}

		$allowFieldComparison = (bool) $this->getSetting('allowFieldComparison');
		if (!$allowFieldComparison) {
			$hadDisallowedFieldCmp = false;
			foreach ($normalized['groups'] as &$group) {
				if (!is_array($group['rules'] ?? null)) {
					continue;
				}
				foreach ($group['rules'] as &$rule) {
					if (
						($rule['valueSource'] ?? '') === 'field'
						|| ($rule['valueType'] ?? '') === 'field'
					) {
						unset($rule['valueSource'], $rule['valueType']);
						$rule['value'] = null;
						$hadDisallowedFieldCmp = true;
					}
				}
				unset($rule);
			}
			unset($group);
			if ($hadDisallowedFieldCmp) {
				$this->error($this->_('Field-to-field comparison is not permitted on this condition field.'));
			}
		}

		$maxGroups = max(0, min(ConditionNormalizer::MAX_GROUPS, (int) $this->getSetting('maxGroups')));
		if ($maxGroups > 0 && count($normalized['groups']) > $maxGroups) {
			$this->error(sprintf(
				$this->_('Maximum of %d condition group(s) allowed.'),
				$maxGroups
			));
			$normalized['groups'] = array_slice($normalized['groups'], 0, $maxGroups);
		}

		$maxRulesPerGroup = max(0, min(ConditionNormalizer::MAX_RULES_PER_GROUP, (int) $this->getSetting('maxRulesPerGroup')));
		if ($maxRulesPerGroup > 0) {
			$rulesClipped = false;
			foreach ($normalized['groups'] as &$group) {
				if (is_array($group['rules'] ?? null) && count($group['rules']) > $maxRulesPerGroup) {
					$rulesClipped = true;
					$group['rules'] = array_slice($group['rules'], 0, $maxRulesPerGroup);
				}
			}
			unset($group);
			if ($rulesClipped) {
				$this->error(sprintf(
					$this->_('Maximum of %d rule(s) per condition group allowed.'),
					$maxRulesPerGroup
				));
			}
		}

		if ((bool) $this->getSetting('required') && ConditionNormalizer::isEmptyTree($normalized)) {
			$this->error($this->_('At least one condition rule is required.'));
		}

		$previous = $this->getNormalizedTree();
		if ($normalized !== $previous) {
			if (!$this->trackChanges()) {
				$this->setTrackChanges(true);
			}
			$this->setAttribute('value', $normalized);
			$this->trackChange('value', $previous, $normalized);
		}

		return $this;
	}

	/**
	 * Field configuration settings in ProcessWire Admin (`Setup > Fields`).
	 */
	public function ___getConfigInputfields(): InputfieldWrapper
	{
		$inputfields = parent::___getConfigInputfields();
		$modules = $this->wire()->modules;

		/** @var InputfieldTextarea|null $fieldsConfig */
		$fieldsConfig = $modules->get('InputfieldTextarea');
		if ($fieldsConfig) {
			$fieldsConfig->attr('name', 'conditionFields');
			$fieldsConfig->label = $this->_('Condition Field Catalog (JSON)');
			$fieldsConfig->description = $this->_('Optional JSON array of source/target field descriptors (`key`, `label`, `type`, optional `group`, `options`, `operators`).');
			$rawFields = $this->getSetting('conditionFields');
			if (is_array($rawFields) && $rawFields !== []) {
				$encodedFields = json_encode($rawFields, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
				$fieldsConfig->val(is_string($encodedFields) ? $encodedFields : '');
			} elseif (is_string($rawFields)) {
				$fieldsConfig->val($rawFields);
			}
			$fieldsConfig->rows = 4;
			$inputfields->add($fieldsConfig);
		}

		/** @var InputfieldSelect|null $layoutField */
		$layoutField = $modules->get('InputfieldSelect');
		if ($layoutField) {
			$layoutField->attr('name', 'layout');
			$layoutField->label = $this->_('Layout Density');
			$layoutField->addOptions([
				'auto' => $this->_('Auto (Responsive Container)'),
				'inline' => $this->_('Inline Grid'),
				'compact' => $this->_('Compact Stacked'),
			]);
			$curLayout = strtolower(trim((string) ($this->getSetting('layout') ?: 'auto')));
			$layoutField->val(in_array($curLayout, ['auto', 'inline', 'compact'], true) ? $curLayout : 'auto');
			$layoutField->columnWidth = 34;
			$inputfields->add($layoutField);
		}

		/** @var InputfieldInteger|null $maxGroupsField */
		$maxGroupsField = $modules->get('InputfieldInteger');
		if ($maxGroupsField) {
			$maxGroupsField->attr('name', 'maxGroups');
			$maxGroupsField->label = $this->_('Maximum Groups (0 = unlimited)');
			$maxGroupsField->val((int) $this->getSetting('maxGroups'));
			$maxGroupsField->columnWidth = 33;
			$inputfields->add($maxGroupsField);
		}

		/** @var InputfieldInteger|null $maxRulesField */
		$maxRulesField = $modules->get('InputfieldInteger');
		if ($maxRulesField) {
			$maxRulesField->attr('name', 'maxRulesPerGroup');
			$maxRulesField->label = $this->_('Max Rules per Group (0 = unlimited)');
			$maxRulesField->val((int) $this->getSetting('maxRulesPerGroup'));
			$maxRulesField->columnWidth = 33;
			$inputfields->add($maxRulesField);
		}

		$checkboxes = [
			'allowFieldComparison' => $this->_('Allow Value-or-Field Target Comparison'),
			'allowNegate' => $this->_('Allow Group NOT Negation'),
			'showSummary' => $this->_('Show Live Expression Summary Bar'),
		];
		foreach ($checkboxes as $cbName => $cbLabel) {
			/** @var InputfieldCheckbox|null $cb */
			$cb = $modules->get('InputfieldCheckbox');
			if ($cb) {
				$cb->attr('name', $cbName);
				$cb->label = $cbLabel;
				$checked = $this->getSetting($cbName) !== null ? (bool) $this->getSetting($cbName) : true;
				$cb->attr('checked', $checked ? 'checked' : '');
				$cb->columnWidth = 33;
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
			'conditionFields',
			'allowFieldComparison',
			'allowNegate',
			'showSummary',
			'allowRawExpression',
			'showLabel',
			'heading',
			'layout',
			'maxGroups',
			'maxRulesPerGroup',
			'emptyMessage',
		]);
	}
}
