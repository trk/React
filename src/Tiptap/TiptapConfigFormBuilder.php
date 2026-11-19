<?php

declare(strict_types=1);

namespace Totoglu\React\Tiptap;

use ProcessWire\Field;
use ProcessWire\FieldtypeImage;
use ProcessWire\InputfieldAsmSelect;
use ProcessWire\InputfieldCheckboxes;
use ProcessWire\InputfieldFieldset;
use ProcessWire\InputfieldInteger;
use ProcessWire\InputfieldMarkup;
use ProcessWire\InputfieldRadios;
use ProcessWire\InputfieldSelect;
use ProcessWire\InputfieldText;
use ProcessWire\InputfieldTextarea;
use ProcessWire\InputfieldTiptap;
use ProcessWire\InputfieldWrapper;
use function ProcessWire\__;

/**
 * Builds the module-wide and per-field configuration forms for `InputfieldTiptap`.
 *
 * Exposes selectable editor profiles (`core`, `editor`, `canvas`, `blocks`) with live preset
 * hydration in ProcessWire field/module config forms while preserving full per-control customization.
 */
final class TiptapConfigFormBuilder
{
	/**
	 * Append per-field Tiptap settings under `Setup > Fields > [Field] > Input`.
	 */
	public static function buildFieldConfigInputfields(
		InputfieldTiptap $inputfield,
		InputfieldWrapper $inputfields,
	): InputfieldWrapper {
		$modules = $inputfield->wire()->modules;

		/** @var InputfieldFieldset $fieldset */
		$fieldset = $modules->get('InputfieldFieldset');
		$fieldset->label = self::str(__('Tiptap Rich Text Editor', __FILE__));
		$fieldset->icon = 'align-left';

		self::appendSharedEditorConfigFields($inputfield, $fieldset, false);

		$fieldsApi = $inputfield->wire()->fields;
		if ($fieldsApi !== null) {
			/** @var InputfieldSelect $fInherit */
			$fInherit = $modules->get('InputfieldSelect');
			$fInherit->attr('name', 'settingsField');
			$fInherit->label = self::str(__('Inherit Settings From Field', __FILE__));
			$fInherit->description = self::str(__('Optionally inherit Tiptap toolbar, headline, and feature settings from another Tiptap field.', __FILE__));
			$fInherit->columnWidth = 50;
			$fInherit->addOption('', self::str(__('None (configure on this field)', __FILE__)));
			$rawFieldName = $inputfield->attr('name');
			$ownName = is_scalar($rawFieldName) ? (string) $rawFieldName : '';
			foreach ($fieldsApi as $candidate) {
				if (!$candidate instanceof Field || $candidate->name === $ownName) {
					continue;
				}
				if ((string) $candidate->get('inputfieldClass') === $inputfield->className()) {
					$fInherit->addOption($candidate->name, $candidate->getLabel() . " ({$candidate->name})");
				}
			}
			$fInherit->val((string) ($inputfield->getSetting('settingsField') ?? ''));
			$fieldset->add($fInherit);
		}

		/** @var InputfieldTextarea $fJson */
		$fJson = $modules->get('InputfieldTextarea');
		$fJson->attr('name', 'settingsJSON');
		$fJson->label = self::str(__('Custom Settings JSON', __FILE__));
		$fJson->description = self::str(__('Optional JSON overrides for this field. Supports `replace_*` and `add_*` / `append_*` prefixes (e.g. `{"add_toolbar": "subscript superscript"}`).', __FILE__));
		$fJson->rows = 3;
		$fJson->columnWidth = 50;
		$fJson->val((string) ($inputfield->getSetting('settingsJSON') ?? ''));
		$fieldset->add($fJson);

		$inputfields->add($fieldset);

		return $inputfields;
	}

	/**
	 * Append module-wide default configuration fields (`Modules > Configure > InputfieldTiptap`).
	 */
	public static function buildModuleConfigInputfields(
		InputfieldTiptap $inputfield,
		InputfieldWrapper $inputfields,
	): void {
		$modules = $inputfield->wire()->modules;

		/** @var InputfieldFieldset $fieldset */
		$fieldset = $modules->get('InputfieldFieldset');
		$fieldset->label = self::str(__('Default Tiptap Editor Settings', __FILE__));
		$fieldset->description = self::str(__('These defaults apply to all Tiptap fields unless overridden on an individual field.', __FILE__));
		$fieldset->icon = 'sliders';

		self::appendSharedEditorConfigFields($inputfield, $fieldset, true);

		/** @var InputfieldTextarea $fDefaultsJson */
		$fDefaultsJson = $modules->get('InputfieldTextarea');
		$fDefaultsJson->attr('name', 'defaultsJSON');
		$fDefaultsJson->label = self::str(__('Module Defaults JSON', __FILE__));
		$fDefaultsJson->description = self::str(__('Optional global JSON overrides merged into all Tiptap instances before per-field settings.', __FILE__));
		$fDefaultsJson->rows = 3;
		$fDefaultsJson->columnWidth = 50;
		$fDefaultsJson->val((string) ($inputfield->get('defaultsJSON') ?? ''));
		$fieldset->add($fDefaultsJson);

		/** @var InputfieldTextarea $fExtraCss */
		$fExtraCss = $modules->get('InputfieldTextarea');
		$fExtraCss->attr('name', 'extraCSS');
		$fExtraCss->label = self::str(__('Extra Editor Content CSS', __FILE__));
		$fExtraCss->description = self::str(__('Optional CSS rules applied to `.rw-tiptap-prose` inside the editor.', __FILE__));
		$fExtraCss->rows = 3;
		$fExtraCss->columnWidth = 50;
		$fExtraCss->val((string) ($inputfield->get('extraCSS') ?? ''));
		$fieldset->add($fExtraCss);

		$inputfields->add($fieldset);
	}

	/**
	 * Build shared configuration Inputfields used by both module-level and field-level config forms.
	 */
	private static function appendSharedEditorConfigFields(
		InputfieldTiptap $inputfield,
		InputfieldWrapper $container,
		bool $isModuleConfig,
	): void {
		$modules = $inputfield->wire()->modules;
		$defaults = InputfieldTiptap::getDefaultConfig();

		$readVal = static function (string $key) use ($inputfield, $isModuleConfig, $defaults): mixed {
			$val = $isModuleConfig ? $inputfield->get($key) : $inputfield->getSetting($key);

			return $val ?? ($defaults[$key] ?? null);
		};

		/** @var InputfieldRadios $fPreset */
		$fPreset = $modules->get('InputfieldRadios');
		$fPreset->attr('name', 'preset');
		$fPreset->label = self::str(__('Editor Profile & Asset Bundle', __FILE__));
		$fPreset->description = self::str(__('Choose an editor profile to tailor UI complexity and load only the JavaScript capability packs needed by this field. Customizing tools or blocks below remains supported.', __FILE__));
		$fPreset->addOption(
			TiptapPresetCatalog::PRESET_CORE,
			self::str(__('Core — Minimal formatted text, lists, and links (loads Core runtime only)', __FILE__)),
		);
		$fPreset->addOption(
			TiptapPresetCatalog::PRESET_EDITOR,
			self::str(__('Editor — Classic CMS toolbar, tables, image studio, alignment, and source view', __FILE__)),
		);
		$fPreset->addOption(
			TiptapPresetCatalog::PRESET_CANVAS,
			self::str(__('Canvas — Chromeless document surface with "/" slash menu, bubble bar, and block handles', __FILE__)),
		);
		$fPreset->addOption(
			TiptapPresetCatalog::PRESET_BLOCKS,
			self::str(__('Blocks — Full editorial suite with inline content blocks and custom block templates', __FILE__)),
		);
		$fPreset->val(TiptapPresetCatalog::normalizePreset($readVal('preset')));
		$container->add($fPreset);

		/** @var InputfieldTextarea $fToolbar */
		$fToolbar = $modules->get('InputfieldTextarea');
		$fToolbar->attr('name', 'toolbar');
		$fToolbar->label = self::str(__('Toolbar Buttons', __FILE__));
		$fToolbar->description = self::str(__('Space-separated toolbar tools; use `|` to separate button groups.', __FILE__));
		$fToolbar->notes = self::str(__('Available tools:', __FILE__)) . ' `' . implode(' ', array_diff(InputfieldTiptap::ALL_TOOLBAR_TOKENS, ['|'])) . '`';
		$fToolbar->rows = 2;
		$fToolbar->val((string) $readVal('toolbar'));
		$container->add($fToolbar);

		/** @var InputfieldText $fBubble */
		$fBubble = $modules->get('InputfieldText');
		$fBubble->attr('name', 'bubbleToolbar');
		$fBubble->label = self::str(__('Bubble Selection Toolbar', __FILE__));
		$fBubble->description = self::str(__('Floating inline toolbar shown when text is selected. Leave blank to disable.', __FILE__));
		$fBubble->val((string) $readVal('bubbleToolbar'));
		$container->add($fBubble);

		/** @var InputfieldCheckboxes $fHeadlines */
		$fHeadlines = $modules->get('InputfieldCheckboxes');
		$fHeadlines->attr('name', 'headlines');
		$fHeadlines->label = self::str(__('Allowed Heading Levels', __FILE__));
		$fHeadlines->optionColumns = 6;
		$fHeadlines->columnWidth = 50;
		foreach (InputfieldTiptap::ALL_HEADLINES as $hTag) {
			$fHeadlines->addOption($hTag, strtoupper($hTag));
		}
		$fHeadlines->val(TiptapContentPolicy::normalizeHeadlines($readVal('headlines')));
		$container->add($fHeadlines);

		/** @var InputfieldRadios $fInline */
		$fInline = $modules->get('InputfieldRadios');
		$fInline->attr('name', 'inlineMode');
		$fInline->label = self::str(__('Editor Display Mode', __FILE__));
		$fInline->columnWidth = 50;
		$fInline->addOption(0, self::str(__('Framed editor with top bar', __FILE__)));
		$fInline->addOption(1, self::str(__('Inline chromeless editor (bubble toolbar focus)', __FILE__)));
		$fInline->val((int) $readVal('inlineMode'));
		$container->add($fInline);

		/** @var InputfieldCheckboxes $fFeatures */
		$fFeatures = $modules->get('InputfieldCheckboxes');
		$fFeatures->attr('name', 'features');
		$fFeatures->label = self::str(__('Editor Features', __FILE__));
		$fFeatures->columnWidth = 50;
		$fFeatures->addOption('toolbar', self::str(__('Show top formatting toolbar', __FILE__)));
		$fFeatures->addOption('stickybars', self::str(__('Sticky top toolbar when scrolling', __FILE__)));
		$fFeatures->addOption('bubbleMenu', self::str(__('Floating selection bubble toolbar', __FILE__)));
		$fFeatures->addOption('statusbar', self::str(__('Bottom word & character count bar', __FILE__)));
		$fFeatures->addOption('spellcheck', self::str(__('Enable browser spellcheck', __FILE__)));
		$fFeatures->addOption('purifier', self::str(__('Server-side HTML Purifier on save', __FILE__)));
		$fFeatures->addOption('pasteFilter', self::str(__('Clean pasted markup via editor schema', __FILE__)));
		$fFeatures->addOption('sourceCode', self::str(__('Allow HTML source code toggle', __FILE__)));
		$fFeatures->addOption('imgUpload', self::str(__('Drag-and-drop & paste image upload', __FILE__)));
		$fFeatures->addOption('imgResize', self::str(__('Interactive inline image resizing', __FILE__)));
		$fFeatures->addOption('slashMenu', self::str(__('Enable "/" slash command menu', __FILE__)));
		$fFeatures->addOption('blockHandles', self::str(__('Show canvas block handles (+ / drag & block actions)', __FILE__)));
		$fFeatures->val(TiptapContentPolicy::normalizeFeatures($readVal('features')));
		$container->add($fFeatures);

		$fieldsApi = $inputfield->wire()->fields;
		if ($fieldsApi !== null) {
			/** @var InputfieldAsmSelect $fImageFields */
			$fImageFields = $modules->get('InputfieldAsmSelect');
			$fImageFields->attr('name', 'imageFields');
			$fImageFields->label = self::str(__('Image Upload Target Fields', __FILE__));
			$fImageFields->description = self::str(__('Optionally restrict which image fields accept drag-and-drop or modal uploads. Leave empty to auto-detect multi-image fields on the edited page.', __FILE__));
			$fImageFields->columnWidth = 50;
			$fImageFields->addOption('x', self::str(__('Disable direct image uploads', __FILE__)));
			foreach ($fieldsApi as $imgCandidate) {
				if ($imgCandidate instanceof Field && $imgCandidate->type instanceof FieldtypeImage) {
					$fImageFields->addOption($imgCandidate->name, $imgCandidate->getLabel() . " ({$imgCandidate->name})");
				}
			}
			$fImageFields->val(TiptapContentPolicy::normalizeImageFields($readVal('imageFields')));
			$container->add($fImageFields);
		}

		/** @var InputfieldCheckboxes $fMiniBlocks */
		$fMiniBlocks = $modules->get('InputfieldCheckboxes');
		$fMiniBlocks->attr('name', 'miniBlocks');
		$fMiniBlocks->label = self::str(__('Inline Content Blocks (Optional)', __FILE__));
		$fMiniBlocks->description = self::str(__('Select inline content blocks editors can insert via the "/" slash menu or toolbar.', __FILE__));
		$fMiniBlocks->notes = self::str(__('Add custom inline content blocks in ./site/tiptap/*.yaml or register them in PHP.', __FILE__));
		$catalog = $inputfield->getAvailableMiniBlocks();
		foreach ($catalog as $bName => $bDef) {
			$suffix = ($bDef['kind'] ?? '') === 'custom' ? " [{$bName}]" : '';
			$fMiniBlocks->addOption($bName, (string) ($bDef['label'] ?? $bName) . $suffix);
		}
		$fMiniBlocks->val(MiniBlockRegistry::normalizeSelection($readVal('miniBlocks'), $catalog));
		$container->add($fMiniBlocks);

		/** @var InputfieldCheckboxes $fToggles */
		$fToggles = $modules->get('InputfieldCheckboxes');
		$fToggles->attr('name', 'toggles');
		$fToggles->label = self::str(__('Markup Cleanup Toggles', __FILE__));
		$fToggles->columnWidth = 50;
		$fToggles->addOption(InputfieldTiptap::toggleCleanDiv, self::str(__('Remove <div> wrapper tags', __FILE__)));
		$fToggles->addOption(InputfieldTiptap::toggleCleanP, self::str(__('Remove empty <p> paragraphs', __FILE__)));
		$fToggles->addOption(InputfieldTiptap::toggleCleanNbsp, self::str(__('Convert &nbsp; entities to regular spaces', __FILE__)));
		$fToggles->addOption(InputfieldTiptap::toggleRemoveStyles, self::str(__('Remove inline style attributes (preserves text-align)', __FILE__)));
		$fToggles->val(TiptapContentPolicy::normalizeToggles($readVal('toggles')));
		$container->add($fToggles);

		/** @var InputfieldInteger $fHeight */
		$fHeight = $modules->get('InputfieldInteger');
		$fHeight->attr('name', 'height');
		$fHeight->label = self::str(__('Minimum Height (px)', __FILE__));
		$fHeight->description = self::str(__('Set `0` to size automatically from field `rows`.', __FILE__));
		$fHeight->columnWidth = 50;
		$fHeight->val((int) $readVal('height'));
		$container->add($fHeight);

		/** @var InputfieldInteger $fMaxHeight */
		$fMaxHeight = $modules->get('InputfieldInteger');
		$fMaxHeight->attr('name', 'maxHeight');
		$fMaxHeight->label = self::str(__('Maximum Height (px)', __FILE__));
		$fMaxHeight->description = self::str(__('Set `0` for unlimited auto-growing height.', __FILE__));
		$fMaxHeight->columnWidth = 50;
		$fMaxHeight->val((int) $readVal('maxHeight'));
		$container->add($fMaxHeight);

		/** @var InputfieldMarkup $fSyncScript */
		$fSyncScript = $modules->get('InputfieldMarkup');
		$fSyncScript->attr('name', '_tiptap_preset_sync');
		$fSyncScript->skipLabel = 4;
		$fSyncScript->collapsed = 0;
		$fSyncScript->wrapAttr('hidden', 'hidden');
		$presetsJson = json_encode(
			TiptapPresetCatalog::allDefinitions(),
			JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR
		);
		$fSyncScript->attr('value', self::buildPresetSyncScript($presetsJson));
		$container->add($fSyncScript);
	}

	/**
	 * @param string|array<mixed> $value
	 */
	private static function str(string|array $value): string
	{
		return is_string($value) ? $value : '';
	}

	private static function buildPresetSyncScript(string $presetsJson): string
	{
		return <<<HTML
<script data-rw-tiptap-preset-sync="1">
(function () {
	var presets = {$presetsJson};
	document.addEventListener('change', function (evt) {
		var target = evt.target;
		if (!target || target.name !== 'preset' || !target.checked) {
			return;
		}
		var def = presets[target.value];
		var form = target.closest('form');
		if (!def || !form) {
			return;
		}
		var setText = function (name, val) {
			var el = form.querySelector('[name="' + name + '"]');
			if (el) {
				el.value = String(val == null ? '' : val);
			}
		};
		var setRadio = function (name, val) {
			var radios = form.querySelectorAll('input[type="radio"][name="' + name + '"]');
			for (var i = 0; i < radios.length; i++) {
				radios[i].checked = radios[i].value === String(val);
			}
		};
		var setChecks = function (name, values) {
			var allowed = Array.isArray(values) ? values.map(String) : [];
			var boxes = form.querySelectorAll('input[type="checkbox"][name="' + name + '[]"]');
			for (var i = 0; i < boxes.length; i++) {
				boxes[i].checked = allowed.indexOf(boxes[i].value) !== -1;
			}
		};
		setText('toolbar', def.toolbar);
		setText('bubbleToolbar', def.bubbleToolbar);
		setText('height', def.height);
		setText('maxHeight', def.maxHeight);
		setRadio('inlineMode', def.inlineMode);
		setChecks('headlines', def.headlines);
		setChecks('features', def.features);
		setChecks('miniBlocks', def.miniBlocks);
	});
})();
</script>
HTML;
	}
}
