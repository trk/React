<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Relation\AbstractInputfieldReactRelation;

/**
 * InputfieldReactO2M
 *
 * Standalone One-to-Many (`O2M`) Reverse Relational React + Inertia Inputfield.
 * Displays and manages incoming child/related records (`targetResource`) whose `foreignField`
 * points to the current `ownerId` (automatically resolved from the edited `Page` or entry).
 *
 * Requires zero database column on the owner record — mutations (`quick_create`, `o2m_link`,
 * `o2m_unlink`) are executed directly against `/_react/relation` with HMAC + CSRF verification.
 */
class InputfieldReactO2M extends AbstractInputfieldReactRelation
{
	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => __('React Relation (O2M — Reverse / Incoming)', __FILE__),
			'version' => 10,
			'summary' => __('Display and manage records linking back to this item (as a table, cards, or list), with quick create, link, and unlink actions.', __FILE__),
			'author' => 'Iskender TOTOGLU @trk @ukyo',
			'icon' => 'exchange',
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
		$this->set('targetResource', 'page');
		$this->set('foreignField', '');
		$this->set('ownerId', '');
		$this->set('layout', 'subtable');
		$this->set('widget', 'subtable');
		$this->set('allowLink', true);
		$this->set('allowUnlink', true);
		$this->set('creatable', true);
		$this->setAttribute('value', '');
	}

	public function cardinality(): string
	{
		return 'o2m';
	}

	public function inertiaComponent(): string
	{
		return 'InputfieldReactO2M';
	}

	public function isEmpty(): bool
	{
		return false;
	}

	/**
	 * O2M reverse fields own no column on the host form; `processInput` is an intentional no-op.
	 */
	public function ___processInput(WireInputData $input): self
	{
		return $this;
	}

	public function ___getConfigInputfields(): InputfieldWrapper
	{
		$inputfields = parent::___getConfigInputfields();
		$modules = $this->wire()->modules;

		/** @var InputfieldSelect|null $targetRes */
		$targetRes = $modules->get('InputfieldSelect');
		if ($targetRes !== null) {
			$targetRes->attr('name', 'targetResource');
			$targetRes->label = $this->_('Related Resource');
			foreach ($this->react()->relations()->describeResources() as $desc) {
				$targetRes->addOption($desc['name'], sprintf('%s (%s)', $desc['label'], $desc['name']));
			}
			$targetRes->val((string) ($this->getSetting('targetResource') ?: 'page'));
			$targetRes->columnWidth = 34;
			$inputfields->add($targetRes);
		}

		/** @var InputfieldText|null $foreignField */
		$foreignField = $modules->get('InputfieldText');
		if ($foreignField !== null) {
			$foreignField->attr('name', 'foreignField');
			$foreignField->label = $this->_('Link Field on Related Resource');
			$foreignField->description = $this->_('Field on the related resource that points back to this record.');
			$foreignField->val((string) $this->getSetting('foreignField'));
			$foreignField->columnWidth = 33;
			$inputfields->add($foreignField);
		}

		/** @var InputfieldSelect|null $layoutField */
		$layoutField = $modules->get('InputfieldSelect');
		if ($layoutField !== null) {
			$layoutField->attr('name', 'layout');
			$layoutField->label = $this->_('Display Layout');
			$layoutField->addOptions([
				'subtable' => $this->_('Compact Subtable'),
				'cards' => $this->_('Cards Grid'),
				'list' => $this->_('Compact List'),
			]);
			$layoutField->val((string) ($this->getSetting('layout') ?: 'subtable'));
			$layoutField->columnWidth = 33;
			$inputfields->add($layoutField);
		}

		$this->appendBaseRelationConfigFields($inputfields, false);

		/** @var InputfieldCheckbox|null $linkField */
		$linkField = $modules->get('InputfieldCheckbox');
		if ($linkField !== null) {
			$linkField->attr('name', 'allowLink');
			$linkField->label = $this->_('Allow Linking Existing Records');
			$linkField->attr('checked', (bool) ($this->getSetting('allowLink') ?? true) ? 'checked' : '');
			$linkField->columnWidth = 50;
			$inputfields->add($linkField);
		}

		/** @var InputfieldCheckbox|null $unlinkField */
		$unlinkField = $modules->get('InputfieldCheckbox');
		if ($unlinkField !== null) {
			$unlinkField->attr('name', 'allowUnlink');
			$unlinkField->label = $this->_('Allow Unlinking Records');
			$unlinkField->attr('checked', (bool) ($this->getSetting('allowUnlink') ?? true) ? 'checked' : '');
			$unlinkField->columnWidth = 50;
			$inputfields->add($unlinkField);
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
			'targetResource',
			'foreignField',
			'layout',
			'allowLink',
			'allowUnlink',
		]);
	}
}
