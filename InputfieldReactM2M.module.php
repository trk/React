<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Relation\AbstractInputfieldReactRelation;

/**
 * InputfieldReactM2M
 *
 * Standalone Many-to-Many (`M2M`) React + Inertia Inputfield for selecting and sorting multiple
 * target ProcessWire or registered resources (`page`, `template`, `field`, `user`, `role`, `permission`,
 * `language`, `module`, or custom resources).
 *
 * Compatible with:
 * - `FieldtypePage` / `InputfieldPage` (*Multiple page selection (sortable)*)
 * - `FieldtypeText` / `FieldtypeTextarea` (`inputfieldClass`, seamlessly serializes JSON array string)
 * - Module configuration forms and `React` `<SchemaForm />`
 */
class InputfieldReactM2M extends AbstractInputfieldReactRelation implements
	InputfieldHasArrayValue,
	InputfieldHasSortableValue,
	InputfieldSupportsArrayValue,
	InputfieldSupportsPageSelector,
	InputfieldPageListSelection
{
	private const int MAX_JSON_BYTES = 524288;
	private const int MAX_JSON_DEPTH = 16;
	private const int HARD_MAX_ITEMS = 2000;

	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => __('React Relation (M2M — Multiple)', __FILE__),
			'version' => 30,
			'summary' => __('Select and reorder multiple related records using multi-select, checkboxes, autocomplete, tree picker, dual-list transfer, or a slide-out browser.', __FILE__),
			'author' => 'Iskender TOTOGLU @trk @ukyo',
			'icon' => 'sitemap',
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
		$this->set('sortable', true);
		$this->set('minItems', 0);
		$this->set('maxItems', 0);
		$this->set('optionColumns', 0);
		$this->setAttribute('value', []);
	}

	public function cardinality(): string
	{
		return 'm2m';
	}

	public function inertiaComponent(): string
	{
		return 'InputfieldReactM2M';
	}

	/**
	 * Normalize `PageArray`, `Page`, JSON array string, pipe/comma string, or array into a deduplicated `list<int|string>`.
	 *
	 * @return list<int|string>
	 */
	public static function normalizeValue(mixed $value, string $valueField = ''): array
	{
		if ($value instanceof NullPage || $value === null || $value === '' || $value === false) {
			return [];
		}

		if ($value instanceof Page) {
			$single = InputfieldReactM2O::normalizeValue($value, $valueField);
			return $single !== '' ? [$single] : [];
		}

		if ($value instanceof PageArray) {
			$items = [];
			foreach ($value as $p) {
				if ($p instanceof Page) {
					$norm = InputfieldReactM2O::normalizeValue($p, $valueField);
					if ($norm !== '') {
						$items[] = $norm;
					}
				}
			}
			return array_values(array_unique($items, SORT_REGULAR));
		}

		if (is_string($value)) {
			if (strlen($value) > self::MAX_JSON_BYTES) {
				return [];
			}
			$trimmed = trim($value);
			if ($trimmed === '' || $trimmed === '[]' || $trimmed === 'null') {
				return [];
			}
			if (str_starts_with($trimmed, '[')) {
				$decoded = json_decode($trimmed, true, self::MAX_JSON_DEPTH);
				if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
					return [];
				}
				$value = $decoded;
			} else {
				$value = preg_split('/[|,]+/', $trimmed) ?: [];
			}
		}

		if (!is_array($value)) {
			$single = InputfieldReactM2O::normalizeValue($value, $valueField);
			return $single !== '' ? [$single] : [];
		}

		$out = [];
		$seen = [];
		foreach ($value as $item) {
			if (count($out) >= self::HARD_MAX_ITEMS) {
				break;
			}
			$norm = InputfieldReactM2O::normalizeValue($item, $valueField);
			$key = (string) $norm;
			if ($key === '' || isset($seen[$key])) {
				continue;
			}
			$seen[$key] = true;
			$out[] = $norm;
		}

		return $out;
	}

	/**
	 * @return list<int|string>
	 */
	public function getArrayValue(): array
	{
		$vf = trim((string) ($this->getSetting('valueField') ?? ''));

		return self::normalizeValue($this->attributes['value'] ?? [], $vf);
	}

	/**
	 * @param array<int|string, mixed> $value
	 */
	public function setArrayValue(array $value): void
	{
		$this->setAttribute('value', $value);
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

	/**
	 * Return JSON string when directly persisted by `FieldtypeText` / `FieldtypeTextarea` so
	 * ProcessWire's text field sanitizer never triggers array-to-string conversion warnings.
	 *
	 * @param string $key
	 */
	public function getAttribute($key): mixed
	{
		$raw = parent::getAttribute($key);
		if ($key === 'value' && $this->isBoundToTextFieldtype()) {
			$list = is_array($raw) ? $raw : self::normalizeValue($raw);
			return $list === [] ? '' : (string) json_encode($list, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
		}

		return $raw;
	}

	public function isEmpty(): bool
	{
		return $this->getArrayValue() === [];
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
		$next = $input[$name] !== null ? self::normalizeValue($input[$name], $vf) : [];

		$maxItems = max(0, (int) $this->getSetting('maxItems'));
		if ($maxItems > 0 && count($next) > $maxItems) {
			$next = array_slice($next, 0, $maxItems);
		}

		$previous = $this->getArrayValue();
		if ($next !== $previous) {
			$this->trackChange('value', $previous, $next);
		}
		$this->setAttribute('value', $next);

		$minItems = max(0, (int) $this->getSetting('minItems'));
		if ($minItems > 0 && count($next) < $minItems && ($this->required || $next !== [])) {
			$this->error(sprintf($this->_('Please select at least %d item(s).'), $minItems));
		}

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
					'auto' => $this->_('Auto (MultiSelect <= 30 items, else MultiAutocomplete)'),
					'multiselect' => $this->_('Sortable MultiSelect (AsmSelect style)'),
					'checkboxes' => $this->_('MultiCheckbox Grid (Search + Select All)'),
					'multiautocomplete' => $this->_('MultiAutocomplete Chips'),
					'treeselect' => $this->_('Hierarchical Multi-TreeSelect (Pages)'),
					'transfer' => $this->_('Dual-List Shuttle / Transfer'),
					'picker' => $this->_('Drawer Table/Card Picker'),
				]);
				$widgetField->val((string) ($this->getSetting('widget') ?: 'auto'));
				$widgetField->columnWidth = 33;
				$inputfields->add($widgetField);
			}

			$this->appendBaseRelationConfigFields($inputfields, true);

			/** @var InputfieldCheckbox|null $sortableField */
			$sortableField = $modules->get('InputfieldCheckbox');
			if ($sortableField !== null) {
				$sortableField->attr('name', 'sortable');
				$sortableField->label = $this->_('Allow Drag / Reorder');
				$sortableField->attr('checked', (bool) ($this->getSetting('sortable') ?? true) ? 'checked' : '');
				$sortableField->columnWidth = 25;
				$inputfields->add($sortableField);
			}

			/** @var InputfieldInteger|null $minField */
			$minField = $modules->get('InputfieldInteger');
			if ($minField !== null) {
				$minField->attr('name', 'minItems');
				$minField->label = $this->_('Minimum Items');
				$minField->val((int) $this->getSetting('minItems'));
				$minField->columnWidth = 25;
				$inputfields->add($minField);
			}

			/** @var InputfieldInteger|null $maxField */
			$maxField = $modules->get('InputfieldInteger');
			if ($maxField !== null) {
				$maxField->attr('name', 'maxItems');
				$maxField->label = $this->_('Maximum Items (0 = Unlimited)');
				$maxField->val((int) $this->getSetting('maxItems'));
				$maxField->columnWidth = 25;
				$inputfields->add($maxField);
			}

			/** @var InputfieldInteger|null $colsField */
			$colsField = $modules->get('InputfieldInteger');
			if ($colsField !== null) {
				$colsField->attr('name', 'optionColumns');
				$colsField->label = $this->_('Checkbox Columns (0 = Auto)');
				$colsField->val((int) $this->getSetting('optionColumns'));
				$colsField->columnWidth = 25;
				$inputfields->add($colsField);
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
			'sortable',
			'minItems',
			'maxItems',
			'optionColumns',
		]);
	}
}
