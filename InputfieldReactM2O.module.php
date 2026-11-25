<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Relation\AbstractInputfieldReactRelation;

/**
 * InputfieldReactM2O
 *
 * Standalone Many-to-One (`M2O`) React + Inertia Inputfield for selecting a single target
 * ProcessWire or registered resource (`page`, `template`, `field`, `user`, `role`, `permission`,
 * `language`, `module`, or custom resources).
 *
 * Compatible with:
 * - `FieldtypePage` / `InputfieldPage` (*Single page selection*)
 * - `FieldtypeText` / `FieldtypeTextarea` / `FieldtypeInteger` (`inputfieldClass`)
 * - Module configuration forms and `React` `<SchemaForm />`
 */
class InputfieldReactM2O extends AbstractInputfieldReactRelation implements InputfieldSupportsPageSelector, InputfieldPageListSelection
{
	private const int MAX_VALUE_LENGTH = 4096;

	public function __construct()
	{
		parent::__construct();
		$this->setAttribute('value', '');
	}

	public function cardinality(): string
	{
		return 'm2o';
	}

	public function inertiaComponent(): string
	{
		return 'InputfieldReactM2O';
	}

	/**
	 * Normalize arbitrary scalar, `Page`, `PageArray`, or single-element array into a clean scalar (`int|string`).
	 */
	public static function normalizeValue(mixed $value, string $valueField = ''): int|string
	{
		if ($value instanceof NullPage) {
			return '';
		}
		if ($value instanceof Page) {
			if ((int) $value->id <= 0) {
				return '';
			}
			return match ($valueField) {
				'name' => (string) $value->name,
				'path', 'url' => (string) $value->path,
				default => (int) $value->id,
			};
		}
		if ($value instanceof PageArray) {
			$first = $value->first();
			return $first instanceof Page ? self::normalizeValue($first, $valueField) : '';
		}
		if (is_array($value)) {
			if (isset($value['value']) && is_scalar($value['value'])) {
				return self::normalizeValue($value['value'], $valueField);
			}
			$first = reset($value);
			return $first !== false ? self::normalizeValue($first, $valueField) : '';
		}
		if (is_int($value)) {
			return $value > 0 ? $value : '';
		}
		if (is_scalar($value)) {
			$rawStr = (string) $value;
			if (strlen($rawStr) > self::MAX_VALUE_LENGTH) {
				return '';
			}
			$trimmed = trim($rawStr);
			if ($trimmed === '' || $trimmed === '0' || $trimmed === 'null') {
				return '';
			}
			if (($valueField === 'id' || $valueField === '') && ctype_digit($trimmed) && (int) $trimmed > 0) {
				return (int) $trimmed;
			}
			return $trimmed;
		}

		return '';
	}

	/**
	 * @param string|array<string, mixed> $key
	 * @param mixed $value
	 */
	public function setAttribute($key, $value): self
	{
		if ($key === 'value') {
			$vf = trim((string) ($this->getSetting('valueField') ?? ''));
			$value = self::normalizeValue($value, $vf);
		}

		return parent::setAttribute($key, $value);
	}

	public function isEmpty(): bool
	{
		$val = $this->attr('value');

		return $val === '' || $val === null || $val === 0 || $val === '0';
	}

	protected function serializeValueForProps(mixed $value): mixed
	{
		$vf = trim((string) ($this->getSetting('valueField') ?? ''));

		return self::normalizeValue($value, $vf);
	}

	public function ___processInput(WireInputData $input): self
	{
		if ($this->isInputProcessingLocked()) {
			return $this;
		}

		$name = $this->stringAttr('name');
		if ($name === '') {
			return $this;
		}

		$wasPresent = $input["{$name}_present"] !== null || $input[$name] !== null;
		if (!$wasPresent) {
			return $this;
		}

		$vf = trim((string) ($this->getSetting('valueField') ?? ''));
		$raw = $input[$name] ?? '';
		$next = self::normalizeValue($raw, $vf);
		$previous = self::normalizeValue($this->attr('value'), $vf);

		if ((string) $next !== (string) $previous) {
			$this->trackChange('value', $previous, $next);
		}
		$this->setAttribute('value', $next);

		return $this;
	}

	public function ___getConfigInputfields(): InputfieldWrapper
	{
		$inputfields = parent::___getConfigInputfields();
		$modules = $this->wire()->modules;

		if ($modules !== null) {
			/** @var InputfieldSelect|null $widgetField */
			$widgetField = $modules->get('InputfieldSelect');
			if ($widgetField !== null) {
				$widgetField->attr('name', 'widget');
				$widgetField->label = $this->_('UI Selection Widget');
				$widgetField->addOptions([
					'auto' => $this->_('Auto (Smart adaptation by item count & hierarchy)'),
					'select' => $this->_('Select Dropdown'),
					'radios' => $this->_('Radio List'),
					'radio-cards' => $this->_('Radio Cards (Rich subtitle & icon)'),
					'autocomplete' => $this->_('Autocomplete Search Combobox'),
					'treeselect' => $this->_('Hierarchical TreeSelect (Pages)'),
					'picker' => $this->_('Drawer Table/Card Picker'),
				]);
				$widgetField->val((string) ($this->getSetting('widget') ?: 'auto'));
				$widgetField->columnWidth = 33;
				$inputfields->add($widgetField);
			}
		}

		$this->appendBaseRelationConfigFields($inputfields, true);

		return $inputfields;
	}
}
