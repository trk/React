<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Relation\AbstractInputfieldReactRelation;
use Totoglu\React\Relation\RelationResourceRegistry;

/**
 * InputfieldReactM2A
 *
 * Standalone Many-to-Any (`M2A`) Polymorphic Relational React + Inertia Inputfield.
 * Allows selecting single or multiple heterogeneous resources (`allowedResources`, e.g.
 * `['page', 'template', 'user']` or custom registered resources) stored as canonical
 * URI tokens (`"<resource>:<value>"`, e.g. `"page:1042"`, `"template:blog-post"`).
 */
class InputfieldReactM2A extends AbstractInputfieldReactRelation implements
	InputfieldSupportsArrayValue,
	InputfieldHasSortableValue
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
			'title' => __('React Relation (M2A — Multi-Type)', __FILE__),
			'version' => 30,
			'summary' => __('Select and organize related items across multiple resource types (such as pages, entries, or users) in one field.', __FILE__),
			'author' => 'Iskender TOTOGLU @trk @ukyo',
			'icon' => 'random',
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
		$this->set('allowedResources', ['page', 'template']);
		$this->set('multiple', true);
		$this->set('sortable', true);
		$this->set('minItems', 0);
		$this->set('maxItems', 0);
		$this->set('widget', 'morph');
		$this->setAttribute('value', []);
	}

	public function cardinality(): string
	{
		return 'm2a';
	}

	public function inertiaComponent(): string
	{
		return 'InputfieldReactM2A';
	}

	/**
	 * Normalize polymorphic input (`"page:1042"`, `['resource' => 'page', 'value' => 1042]`, JSON array, etc.)
	 * into canonical `"<resource>:<value>"` token(s).
	 *
	 * @param list<string> $allowedResources
	 * @return list<string>
	 */
	public static function normalizeMorphList(mixed $value, array $allowedResources = []): array
	{
		if ($value === null || $value === '' || $value === false || $value instanceof NullPage) {
			return [];
		}

		if ($value instanceof Page) {
			return (int) $value->id > 0 ? ['page:' . (int) $value->id] : [];
		}

		if (is_string($value)) {
			if (strlen($value) > self::MAX_JSON_BYTES) {
				return [];
			}
			$trimmed = trim($value);
			if ($trimmed === '' || $trimmed === '[]' || $trimmed === 'null') {
				return [];
			}
			if (str_starts_with($trimmed, '[') || str_starts_with($trimmed, '{')) {
				$decoded = json_decode($trimmed, true, self::MAX_JSON_DEPTH);
				if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
					return [];
				}
				$value = isset($decoded['resource']) ? [$decoded] : $decoded;
			} else {
				$value = array_map('trim', explode(',', $trimmed));
			}
		}

		if (!is_array($value)) {
			return [];
		}

		if (isset($value['resource']) && array_key_exists('value', $value)) {
			$value = [$value];
		}

		$allowedSet = [];
		foreach ($allowedResources as $res) {
			$clean = RelationResourceRegistry::normalizeResourceAlias((string) $res);
			if ($clean !== '') {
				$allowedSet[$clean] = true;
			}
		}

		$tokens = [];
		$seen = [];
		foreach ($value as $item) {
			if (count($tokens) >= self::HARD_MAX_ITEMS) {
				break;
			}
			$token = '';
			if (is_array($item) && isset($item['resource']) && isset($item['value']) && is_scalar($item['value'])) {
				$res = RelationResourceRegistry::normalizeResourceAlias((string) $item['resource']);
				$val = trim((string) $item['value']);
				if ($res !== '' && $val !== '') {
					$token = "{$res}:{$val}";
				}
			} elseif (is_string($item) || is_int($item)) {
				$rawStr = trim((string) $item);
				if (str_contains($rawStr, ':')) {
					[$rawRes, $rawVal] = explode(':', $rawStr, 2);
					$res = RelationResourceRegistry::normalizeResourceAlias($rawRes);
					$val = trim($rawVal);
					if ($res !== '' && $val !== '') {
						$token = "{$res}:{$val}";
					}
				}
			}

			if ($token === '' || isset($seen[$token])) {
				continue;
			}

			[$tokenRes] = explode(':', $token, 2);
			if ($allowedSet !== [] && !isset($allowedSet[$tokenRes])) {
				continue;
			}

			$seen[$token] = true;
			$tokens[] = $token;
		}

		return $tokens;
	}

	/**
	 * @return list<string>
	 */
	public function getArrayValue(): array
	{
		$allowed = $this->normalizeListSetting($this->getSetting('allowedResources'));

		return self::normalizeMorphList($this->attributes['value'] ?? [], $allowed);
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
			$allowed = $this->normalizeListSetting($this->getSetting('allowedResources'));
			$list = self::normalizeMorphList($value, $allowed);
			$isMultiple = (bool) ($this->getSetting('multiple') ?? true);
			$value = $isMultiple ? $list : ($list[0] ?? '');
		}

		return parent::setAttribute($key, $value);
	}

	/**
	 * @param string $key
	 */
	public function getAttribute($key): mixed
	{
		$raw = parent::getAttribute($key);
		if ($key === 'value') {
			$isMultiple = (bool) ($this->getSetting('multiple') ?? true);
			if (!$isMultiple) {
				if (is_array($raw)) {
					return (string) ($raw[0] ?? '');
				}
				return is_scalar($raw) ? (string) $raw : '';
			}
			if ($this->isBoundToTextFieldtype()) {
				$list = is_array($raw) ? $raw : $this->getArrayValue();
				return $list === [] ? '' : (string) json_encode($list, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
			}
			return is_array($raw) ? $raw : $this->getArrayValue();
		}

		return $raw;
	}

	public function isEmpty(): bool
	{
		return $this->getArrayValue() === [];
	}

	protected function serializeValueForProps(mixed $value): mixed
	{
		$allowed = $this->normalizeListSetting($this->getSetting('allowedResources'));
		$list = self::normalizeMorphList($value, $allowed);
		$isMultiple = (bool) ($this->getSetting('multiple') ?? true);

		return $isMultiple ? $list : ($list[0] ?? '');
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

		$allowed = $this->normalizeListSetting($this->getSetting('allowedResources'));
		$list = $input[$name] !== null ? self::normalizeMorphList($input[$name], $allowed) : [];

		$maxItems = max(0, (int) $this->getSetting('maxItems'));
		if ($maxItems > 0 && count($list) > $maxItems) {
			$list = array_slice($list, 0, $maxItems);
		}

		$isMultiple = (bool) ($this->getSetting('multiple') ?? true);
		$next = $isMultiple ? $list : ($list[0] ?? '');
		$previous = $isMultiple ? $this->getArrayValue() : (string) ($this->getArrayValue()[0] ?? '');

		if ($next !== $previous) {
			$this->trackChange('value', $previous, $next);
		}
		$this->setAttribute('value', $next);

		$minItems = max(0, (int) $this->getSetting('minItems'));
		if ($isMultiple && $minItems > 0 && count($list) < $minItems && ($this->required || $list !== [])) {
			$this->error(sprintf($this->_('Please select at least %d item(s).'), $minItems));
		}

		return $this;
	}

	public function ___getConfigInputfields(): InputfieldWrapper
	{
		$inputfields = parent::___getConfigInputfields();
		$modules = $this->wire()->modules;

		/** @var InputfieldCheckboxes|null $allowedField */
		$allowedField = $modules->get('InputfieldCheckboxes');
		if ($allowedField !== null) {
			$allowedField->attr('name', 'allowedResources');
			$allowedField->label = $this->_('Allowed Target Resources');
			foreach ($this->react()->relations()->describeResources() as $desc) {
				$allowedField->addOption($desc['name'], sprintf('%s (%s)', $desc['label'], $desc['name']));
			}
			$allowedField->val($this->normalizeListSetting($this->getSetting('allowedResources')));
			$allowedField->optionColumns = 3;
			$allowedField->columnWidth = 66;
			$inputfields->add($allowedField);
		}

		/** @var InputfieldSelect|null $widgetField */
		$widgetField = $modules->get('InputfieldSelect');
		if ($widgetField !== null) {
			$widgetField->attr('name', 'widget');
			$widgetField->label = $this->_('Selection Interface');
			$widgetField->addOptions([
				'morph' => $this->_('Search Box with Resource Tabs'),
				'morph-picker' => $this->_('Slide-Out Picker Drawer with Resource Tabs'),
			]);
			$widgetField->val((string) ($this->getSetting('widget') ?: 'morph'));
			$widgetField->columnWidth = 34;
			$inputfields->add($widgetField);
		}

		/** @var InputfieldCheckbox|null $multiField */
		$multiField = $modules->get('InputfieldCheckbox');
		if ($multiField !== null) {
			$multiField->attr('name', 'multiple');
			$multiField->label = $this->_('Allow Multiple References');
			$multiField->attr('checked', (bool) ($this->getSetting('multiple') ?? true) ? 'checked' : '');
			$multiField->columnWidth = 34;
			$inputfields->add($multiField);
		}

		/** @var InputfieldCheckbox|null $sortableField */
		$sortableField = $modules->get('InputfieldCheckbox');
		if ($sortableField !== null) {
			$sortableField->attr('name', 'sortable');
			$sortableField->label = $this->_('Allow Reordering');
			$sortableField->attr('checked', (bool) ($this->getSetting('sortable') ?? true) ? 'checked' : '');
			$sortableField->columnWidth = 33;
			$inputfields->add($sortableField);
		}

		/** @var InputfieldInteger|null $maxField */
		$maxField = $modules->get('InputfieldInteger');
		if ($maxField !== null) {
			$maxField->attr('name', 'maxItems');
			$maxField->label = $this->_('Maximum Items (0 = Unlimited)');
			$maxField->val((int) $this->getSetting('maxItems'));
			$maxField->columnWidth = 33;
			$inputfields->add($maxField);
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
			'allowedResources',
			'multiple',
			'sortable',
			'minItems',
			'maxItems',
		]);
	}
}
