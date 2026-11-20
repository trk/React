<?php

declare(strict_types=1);

namespace Totoglu\React\Hook;

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\FieldtypeFile;
use ProcessWire\FieldtypeImage;
use ProcessWire\FieldtypeLanguageInterface;
use ProcessWire\FieldtypeText;
use ProcessWire\FieldtypeTextarea;
use ProcessWire\HookEvent;
use ProcessWire\Inputfield;
use ProcessWire\InputfieldReactIcon;
use ProcessWire\InputfieldReactKeyValue;
use ProcessWire\InputfieldReactLink;
use ProcessWire\InputfieldSelect;
use ProcessWire\InputfieldTiptap;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Page;
use ProcessWire\React;
use ProcessWire\Template;
use ProcessWire\Wire;
use Totoglu\React\Icon\IconManager;
use Totoglu\React\Media\PageLinkMediaHostAdapter;

/**
 * FieldIntegrationHooks
 *
 * Manages ProcessWire core field/template/process/language lifecycle hooks registered by `React`:
 * Fieldtype widget options, JSON sleep/format/markup handling, optional native File/Image replacement,
 * rich-text language wrapper coordination, workspace redirect preservation, and Admin Vector Icons.
 */
final class FieldIntegrationHooks extends Wire
{
	private bool $registered = false;
	private bool $executingProcessController = false;

	public function __construct(private React $react)
	{
		parent::__construct();
	}

	/**
	 * Register all ProcessWire core lifecycle and field hooks once.
	 */
	public function register(): void
	{
		if ($this->registered) {
			return;
		}
		$this->registered = true;

		$wire = $this->wire();
		$wire->addHookAfter('FieldtypeTextarea::getFieldSetups', $this, 'hookFieldtypeTextareaGetFieldSetups');
		$wire->addHookBefore('InputfieldPage::getConfigInputfields', $this, 'hookInputfieldPageClasses');
		$wire->addHookBefore('InputfieldPage::getInputfield', $this, 'hookInputfieldPageClasses');
		$wire->addHookAfter('FieldtypeFile::getConfigInputfields', $this, 'hookFieldtypeFileConfigInputfields');
		$wire->addHookAfter('FieldtypeText::getConfigInputfields', $this, 'hookFieldtypeTextConfigInputfields');
		$wire->addHookBefore('FieldtypeText::sleepValue', $this, 'hookFieldtypeTextSleepValue');
		$wire->addHookBefore('FieldtypeText::formatValue', $this, 'hookFieldtypeTextFormatValue');
		$wire->addHookBefore('FieldtypeText::markupValue', $this, 'hookFieldtypeTextMarkupValue');
		$wire->addHookBefore('Field::getInputfield', $this, 'hookFieldBeforeGetInputfield');
		$wire->addHookAfter('Field::getInputfield', $this, 'hookFieldAfterGetInputfield');
		$wire->addHookAfter('Pages::saved', $this, 'hookPagesSavedLinkMedia');
		$wire->addHookAfter('ProcessField::buildEditForm, ProcessTemplate::buildEditForm', $this, 'hookAdminIconBuildEditForm');
		$wire->addHookBefore('Fields::save', $this, 'hookAdminIconFieldSave');
		$wire->addHookBefore('Fields::saveFieldgroupContext', $this, 'hookAdminIconFieldContextSave');
		$wire->addHookBefore('Templates::save', $this, 'hookAdminIconTemplateSave');
		$wire->addHookAfter('Pages::saved', $this, 'hookAdminIconPageSaved');
		$wire->addHookBefore('Session::redirect', $this, 'hookSessionRedirectPreserveWorkspace');
		$wire->addHookBefore('ProcessController::execute', $this, 'hookBeforeProcessControllerExecute');
		$wire->addHookAfter('ProcessController::execute', $this, 'hookAfterProcessControllerExecute');
		$wire->addHookAfter('Page::render', $this, 'hookAfterProcessControllerExecute');
		$wire->addHookAfter('Inputfield::render', $this, 'hookTiptapPauseLanguageSupportWrap', ['priority' => '50.0']);
		$wire->addHookAfter('Inputfield::render', $this, 'hookTiptapRestoreLanguageSupportWrap', ['priority' => '150.0']);
		$wire->addHookAfter('Inputfield::renderValue', $this, 'hookTiptapPauseLanguageSupportWrap', ['priority' => '50.0']);
		$wire->addHookAfter('Inputfield::renderValue', $this, 'hookTiptapRestoreLanguageSupportWrap', ['priority' => '150.0']);
	}

	/**
	 * Track entry into ProcessWire's native `ProcessController::execute` (`wire/core/admin.php`).
	 */
	public function hookBeforeProcessControllerExecute(HookEvent $event): void
	{
		$this->executingProcessController = true;
	}

	/**
	 * Reset `ProcessController::execute` execution tracking after execution or page render completes.
	 */
	public function hookAfterProcessControllerExecute(HookEvent $event): void
	{
		$this->executingProcessController = false;
	}

	/**
	 * Determine whether ProcessWire is currently inside `ProcessController::execute`.
	 */
	public function isExecutingProcessController(): bool
	{
		return $this->executingProcessController;
	}

	/**
	 * Preserve `?ws=1` across `$session->redirect()` calls executed from within Workspace mode.
	 */
	public function hookSessionRedirectPreserveWorkspace(HookEvent $event): void
	{
		if (!$this->react->isWorkspaceHubInstalled() || !$this->react->isWorkspaceContextRequest()) {
			return;
		}

		$rawUrl = $event->arguments(0);
		if (!is_string($rawUrl) || trim($rawUrl) === '') {
			return;
		}

		$updated = $this->react->withWorkspaceQuery($rawUrl);
		if ($updated !== $rawUrl) {
			$event->arguments(0, $updated);
		}
	}

	/**
	 * Prevent `LanguageSupport::hookInputfieldAfterRender` (priority 100) from duplicating
	 * `InputfieldTiptap`'s self-contained multi-language React island and hidden inputs.
	 */
	public function hookTiptapPauseLanguageSupportWrap(HookEvent $event): void
	{
		$inputfield = $event->object;
		if ($inputfield instanceof InputfieldTiptap && $inputfield->getSetting('useLanguages')) {
			$inputfield->setQuietly('_tiptapRestoreUseLanguages', true);
			$inputfield->setQuietly('useLanguages', false);
		}
	}

	/**
	 * Restore `useLanguages` immediately after `LanguageSupport::hookInputfieldAfterRender` runs.
	 */
	public function hookTiptapRestoreLanguageSupportWrap(HookEvent $event): void
	{
		$inputfield = $event->object;
		if ($inputfield instanceof InputfieldTiptap && $inputfield->get('_tiptapRestoreUseLanguages')) {
			$inputfield->setQuietly('useLanguages', true);
			$inputfield->setQuietly('_tiptapRestoreUseLanguages', null);
		}
	}

	/**
	 * Register `Tiptap` (`InputfieldTiptap` + `contentTypeHTML`) in `FieldtypeTextarea::getFieldSetups`.
	 */
	public function hookFieldtypeTextareaGetFieldSetups(HookEvent $event): void
	{
		$fieldtype = $event->object;
		if (!$fieldtype instanceof FieldtypeTextarea) {
			return;
		}
		$cls = $fieldtype->className();
		if ($cls !== 'FieldtypeTextarea' && $cls !== 'FieldtypeTextareaLanguage') {
			return;
		}
		if (!$this->wire()->modules->isInstalled('InputfieldTiptap')) {
			return;
		}
		$setups = $event->return;
		if (!is_array($setups)) {
			return;
		}
		$setups['Tiptap'] = [
			'title' => 'Tiptap',
			'inputfieldClass' => 'InputfieldTiptap',
			'contentType' => FieldtypeTextarea::contentTypeHTML,
			'textformatters' => [],
		];
		$event->return = $setups;
	}

	/**
	 * Expose `InputfieldReactM2O` and `InputfieldReactM2M` in ProcessWire's `InputfieldPage` widget selector (`Setup > Fields`).
	 */
	public function hookInputfieldPageClasses(HookEvent $event): void
	{
		$pageField = $event->object;
		if (!$pageField instanceof Inputfield) {
			return;
		}
		$classes = $pageField->get('inputfieldClasses');
		$list = is_array($classes) ? $classes : [];
		foreach (['InputfieldReactM2O', 'InputfieldReactM2M'] as $cls) {
			if (!in_array($cls, $list, true)) {
				$list[] = $cls;
			}
		}
		$pageField->set('inputfieldClasses', $list);
	}

	/**
	 * Filter `InputfieldReactImage` out of non-image `FieldtypeFile` `inputfieldClass` dropdown options.
	 */
	public function hookFieldtypeFileConfigInputfields(HookEvent $event): void
	{
		$fieldtype = $event->object;
		$wrapper = $event->return;
		if (!$fieldtype instanceof FieldtypeFile || !$wrapper instanceof InputfieldWrapper) {
			return;
		}
		if ($fieldtype instanceof FieldtypeImage) {
			return;
		}

		$select = $wrapper->getChildByName('inputfieldClass');
		if ($select instanceof InputfieldSelect) {
			$select->removeOption('InputfieldReactImage');
		}
	}

	/**
	 * Expose `InputfieldReactKeyValue`, `InputfieldReactLink`, and `InputfieldReactIcon` in `FieldtypeText` / `FieldtypeTextarea`.
	 */
	public function hookFieldtypeTextConfigInputfields(HookEvent $event): void
	{
		$fieldtype = $event->object;
		$field = $event->arguments(0);
		$wrapper = $event->return;
		if (
			!$fieldtype instanceof FieldtypeText
			|| $fieldtype instanceof FieldtypeLanguageInterface
			|| !in_array($fieldtype->className(), ['FieldtypeText', 'FieldtypeTextarea'], true)
			|| !$wrapper instanceof InputfieldWrapper
		) {
			return;
		}

		$select = $wrapper->getChildByName('inputfieldClass');
		if (!$select instanceof InputfieldSelect) {
			return;
		}

		$modules = $this->wire()->modules;
		if ($modules->isInstalled('InputfieldReactKeyValue')) {
			$info = InputfieldReactKeyValue::getModuleInfo();
			$title = (string) ($info['title'] ?? 'React Key-Value Pairs');
			$summary = (string) ($info['summary'] ?? '');
			if ($fieldtype->className() === 'FieldtypeText') {
				$label = $summary !== '' ? "{$title} [span.detail] - {$summary} [/span]" : $title;
				$select->addOption('InputfieldReactKeyValue', $label);
			} else {
				$select->addOption('InputfieldReactKeyValue', $title);
			}

			if ($field instanceof Field && InputfieldReactKeyValue::isKeyValueField($field)) {
				$select->val('InputfieldReactKeyValue');
			}
		}

		if ($modules->isInstalled('InputfieldReactLink')) {
			$linkInfo = InputfieldReactLink::getModuleInfo();
			$linkTitle = (string) ($linkInfo['title'] ?? 'React Link & Media Target');
			$linkSummary = (string) ($linkInfo['summary'] ?? '');
			if ($fieldtype->className() === 'FieldtypeText') {
				$linkLabel = $linkSummary !== '' ? "{$linkTitle} [span.detail] - {$linkSummary} [/span]" : $linkTitle;
				$select->addOption('InputfieldReactLink', $linkLabel);
			} else {
				$select->addOption('InputfieldReactLink', $linkTitle);
			}

			if ($field instanceof Field && InputfieldReactLink::isLinkField($field)) {
				$select->val('InputfieldReactLink');
			}
		}

		if ($modules->isInstalled('InputfieldReactIcon')) {
			$iconInfo = InputfieldReactIcon::getModuleInfo();
			$iconTitle = (string) ($iconInfo['title'] ?? 'React Icon');
			$iconSummary = (string) ($iconInfo['summary'] ?? '');
			if ($fieldtype->className() === 'FieldtypeText') {
				$iconLabel = $iconSummary !== '' ? "{$iconTitle} [span.detail] - {$iconSummary} [/span]" : $iconTitle;
				$select->addOption('InputfieldReactIcon', $iconLabel);
			} else {
				$select->addOption('InputfieldReactIcon', $iconTitle);
			}

			if ($field instanceof Field && InputfieldReactIcon::isIconField($field)) {
				$select->val('InputfieldReactIcon');
			}
		}
	}

	/**
	 * Serialize structured `FieldtypeText` / `FieldtypeTextarea` React Inputfield values before DB sleep.
	 */
	public function hookFieldtypeTextSleepValue(HookEvent $event): void
	{
		$field = $event->arguments(1);
		if (
			!$field instanceof Field
			|| $field->type instanceof FieldtypeLanguageInterface
		) {
			return;
		}

		$cls = strtolower(trim((string) ($field->get('inputfieldClass') ?? '')));
		if ($cls === 'inputfieldreactkeyvalue') {
			$allowEmpty = $field->get('allowEmptyValues') !== null ? (bool) $field->get('allowEmptyValues') : true;
			$event->replace = true;
			$event->return = InputfieldReactKeyValue::encodeJsonObject($event->arguments(2), $allowEmpty);
			return;
		}

		if ($cls === 'inputfieldreactlink') {
			$defType = (string) ($field->get('defaultType') ?: 'page');
			$event->replace = true;
			$event->return = InputfieldReactLink::encodeJsonObject($event->arguments(2), $defType);
			return;
		}

		if ($cls === 'inputfieldreacticon') {
			$event->replace = true;
			$event->return = InputfieldReactIcon::encodeStorageValue($event->arguments(2), $field);
		}
	}

	/**
	 * Format `FieldtypeText` / `FieldtypeTextarea` React Inputfield values when `$page->of()` is enabled.
	 */
	public function hookFieldtypeTextFormatValue(HookEvent $event): void
	{
		$field = $event->arguments(1);
		if (
			!$field instanceof Field
			|| $field->type instanceof FieldtypeLanguageInterface
		) {
			return;
		}

		$cls = strtolower(trim((string) ($field->get('inputfieldClass') ?? '')));
		if ($cls === 'inputfieldreactkeyvalue') {
			$allowEmpty = $field->get('allowEmptyValues') !== null ? (bool) $field->get('allowEmptyValues') : true;
			$event->replace = true;
			$event->return = InputfieldReactKeyValue::normalizeValue($event->arguments(2), $allowEmpty);
			return;
		}

		if ($cls === 'inputfieldreactlink') {
			$page = $event->arguments(0);
			$event->replace = true;
			$event->return = InputfieldReactLink::resolveValue(
				$event->arguments(2),
				$page instanceof Page ? $page : null,
				$field,
			);
			return;
		}

		if ($cls === 'inputfieldreacticon') {
			$event->replace = true;
			$event->return = InputfieldReactIcon::resolveValue($event->arguments(2));
		}
	}

	/**
	 * Render clean HTML summary markup for `InputfieldReactKeyValue`, `InputfieldReactLink`, and `InputfieldReactIcon` Page fields.
	 */
	public function hookFieldtypeTextMarkupValue(HookEvent $event): void
	{
		$field = $event->arguments(1);
		if (
			!$field instanceof Field
			|| $field->type instanceof FieldtypeLanguageInterface
		) {
			return;
		}

		$cls = strtolower(trim((string) ($field->get('inputfieldClass') ?? '')));
		if (!in_array($cls, ['inputfieldreactkeyvalue', 'inputfieldreactlink', 'inputfieldreacticon'], true)) {
			return;
		}

		$page = $event->arguments(0);
		$rawValue = $event->arguments(2);
		if ($rawValue === null && $page instanceof Page) {
			$rawValue = $page->getUnformatted($field->name);
		}
		$property = (string) ($event->arguments(3) ?? '');

		if ($cls === 'inputfieldreactkeyvalue') {
			$event->replace = true;
			$event->return = InputfieldReactKeyValue::renderPairsMarkup($rawValue, $property);
			return;
		}

		if ($cls === 'inputfieldreactlink') {
			$event->replace = true;
			$event->return = InputfieldReactLink::renderLinkMarkup(
				$rawValue,
				$page instanceof Page ? $page : null,
				$field,
				$property,
			);
			return;
		}

		$event->replace = true;
		$event->return = InputfieldReactIcon::renderIconMarkup($rawValue, $property);
	}

	/**
	 * Clean up superseded or removed `links/{fieldName}/` media files whenever a `Page` with `InputfieldReactLink` fields is saved.
	 */
	public function hookPagesSavedLinkMedia(HookEvent $event): void
	{
		$page = $event->arguments(0);
		if (!$page instanceof Page || $page->id <= 0 || !$page->template instanceof Template) {
			return;
		}
		foreach ($page->template->fieldgroup as $field) {
			if (!$field instanceof Field || !$field->type instanceof FieldtypeText) {
				continue;
			}
			if (strtolower(trim((string) ($field->get('inputfieldClass') ?? ''))) === 'inputfieldreactlink') {
				PageLinkMediaHostAdapter::syncSavedPageLinkMedia(
					$page,
					$field,
					$page->getUnformatted($field->name),
				);
			}
		}
	}

	/**
	 * Upgrade default `InputfieldImage` / `InputfieldFile` instances on Pages when `useReactMediaFields` is enabled.
	 */
	public function hookFieldBeforeGetInputfield(HookEvent $event): void
	{
		if (!(bool) $this->react->get('useReactMediaFields')) {
			return;
		}

		$field = $event->object;
		if (!$field instanceof Field || !$field->type instanceof FieldtypeFile) {
			return;
		}

		$configured = trim((string) ($field->get('inputfieldClass') ?? ''));
		$isImageField = $field->type instanceof FieldtypeImage;

		if ($isImageField) {
			if ($configured !== '' && $configured !== 'InputfieldImage') {
				return;
			}
			$targetClass = 'InputfieldReactImage';
		} else {
			if ($configured !== '' && $configured !== 'InputfieldFile') {
				return;
			}
			$targetClass = 'InputfieldReactFile';
		}

		$modules = $this->wire()->modules;
		if (!$modules->isInstalled($targetClass)) {
			return;
		}

		$field->setQuietly('_rwOrigInputfieldClass', $field->get('inputfieldClass'));
		$field->setQuietly('_rwSwappedInputfieldClass', true);
		$field->setQuietly('inputfieldClass', $targetClass);
	}

	/**
	 * Restore `$field->inputfieldClass` immediately after `Field::getInputfield` finishes.
	 */
	public function hookFieldAfterGetInputfield(HookEvent $event): void
	{
		$field = $event->object;
		if (!$field instanceof Field || !$field->get('_rwSwappedInputfieldClass')) {
			return;
		}

		$orig = $field->get('_rwOrigInputfieldClass');
		$field->setQuietly('inputfieldClass', $orig);
		$field->setQuietly('_rwSwappedInputfieldClass', null);
		$field->setQuietly('_rwOrigInputfieldClass', null);
	}

	/**
	 * Inject an `InputfieldReactIcon` (`vectorIcon`) selector below ProcessWire's native `icon` / `pageLabelIcon`
	 * field on `ProcessField` and `ProcessTemplate` edit screens.
	 */
	public function hookAdminIconBuildEditForm(HookEvent $event): void
	{
		if (!(bool) $this->react->get('enableAdminVectorIcons')) {
			return;
		}

		$wrapper = $event->return;
		if (!$wrapper instanceof InputfieldWrapper) {
			return;
		}
		if ($wrapper->getChildByName('vectorIcon') !== null) {
			return;
		}

		$input = $this->wire()->input;
		$modules = $this->wire()->modules;
		$obj = $event->object;
		$objClass = is_object($obj) ? (method_exists($obj, 'className') ? (string) $obj->className() : get_class($obj)) : '';

		if ($objClass === 'ProcessField' || str_ends_with($objClass, '\\ProcessField')) {
			$iconFieldName = 'icon';
			$item = (is_object($obj) && method_exists($obj, 'getField')) ? $obj->getField() : null;
			if (!$item instanceof Field) {
				$itemId = (int) ($input->post('id') ?: $input->get('id'));
				$item = $itemId > 0 ? $this->wire()->fields->get($itemId) : null;
			}
			if (!$item instanceof Field || (int) $item->id <= 0) {
				return;
			}
		} else {
			$iconFieldName = 'pageLabelIcon';
			$itemId = (int) ($input->post('id') ?: $input->get('id'));
			$item = $itemId > 0 ? $this->wire()->templates->get($itemId) : null;
			if (!$item instanceof Template || (int) $item->id <= 0) {
				return;
			}
		}

		$iconField = $wrapper->getChildByName($iconFieldName);
		if (!$iconField instanceof Inputfield) {
			return;
		}
		$iconField->showIf = "vectorIcon=''";

		if ($modules->isInstalled('InputfieldReactIcon')) {
			/** @var InputfieldReactIcon $vectorIconField */
			$vectorIconField = $modules->get('InputfieldReactIcon');
		} else {
			$vectorIconField = new InputfieldReactIcon();
			$this->wire($vectorIconField);
		}

		$rawCurrent = $item->get('vectorIcon');
		$currentPrefixed = is_string($rawCurrent) ? IconManager::toAdminPrefixedValue($rawCurrent) : '';

		$vectorIconField->attr('name', 'vectorIcon');
		$vectorIconField->label = $this->_('Vector Icon');
		$vectorIconField->description = $this->_('Select a vector icon. When populated, this overrides the standard ProcessWire icon above.');
		$vectorIconField->icon = $currentPrefixed !== '' ? IconManager::sanitizeAdminIconClass($currentPrefixed) : 'puzzle-piece';
		$vectorIconField->set('iconPrefixMode', 'vector');
		$vectorIconField->set('allowCustomization', false);
		$vectorIconField->set('previewSize', IconManager::clampSize($this->react->get('adminIconPreviewSize'), 22));
		$vectorIconField->attr('value', $currentPrefixed);
		$vectorIconField->collapsed = Inputfield::collapsedBlank;

		$wrapper->insertAfter($vectorIconField, $iconField);
	}

	/**
	 * Before `Fields::save`: sync `$field->vectorIcon` into `$field->icon` (`rwv--*`) and regenerate `VectorIcons.css`.
	 */
	public function hookAdminIconFieldSave(HookEvent $event): void
	{
		if (!(bool) $this->react->get('enableAdminVectorIcons')) {
			return;
		}

		$field = $event->arguments(0);
		if (!$field instanceof Field) {
			return;
		}

		$rawVector = $field->get('vectorIcon');
		$input = $this->wire()->input;
		if (
			$input->requestMethod('POST')
			&& isset($_POST['vectorIcon'])
			&& (int) ($input->post('id') ?: $input->get('id')) === (int) $field->id
		) {
			$rawVector = (string) $_POST['vectorIcon'];
		}

		if ($rawVector === null) {
			return;
		}

		$prefixed = IconManager::toAdminPrefixedValue($rawVector);
		$currentIcon = (string) $field->getIcon(false);
		if ($prefixed !== '') {
			$targetIcon = IconManager::sanitizeAdminIconClass($prefixed);
			$needsCss = $currentIcon !== $targetIcon
				|| $field->isChanged('vectorIcon')
				|| !is_file($this->react->icons()->getAdminCssPath());
			$field->set('vectorIcon', $prefixed);
			$field->set('icon', $targetIcon);
			if ($needsCss) {
				$this->react->icons()->generateAdminCss();
			}
			return;
		}

		if ($field->isChanged('vectorIcon') || IconManager::isAdminVectorIcon($currentIcon)) {
			$field->set('vectorIcon', '');
			if (IconManager::isAdminVectorIcon($currentIcon)) {
				$field->set('icon', '');
			}
			$this->react->icons()->generateAdminCss();
		}
	}

	/**
	 * Before `Fields::saveFieldgroupContext`: sync template-context `vectorIcon` overrides and regenerate `VectorIcons.css`.
	 */
	public function hookAdminIconFieldContextSave(HookEvent $event): void
	{
		if (!(bool) $this->react->get('enableAdminVectorIcons')) {
			return;
		}

		$field = $event->arguments(0);
		$fieldgroup = $event->arguments(1);
		if (!$field instanceof Field || !$fieldgroup instanceof Fieldgroup) {
			return;
		}

		$rawVector = $field->get('vectorIcon');
		$input = $this->wire()->input;
		if (
			$input->requestMethod('POST')
			&& isset($_POST['vectorIcon'])
			&& (int) ($input->post('id') ?: $input->get('id')) === (int) $field->id
		) {
			$rawVector = (string) $_POST['vectorIcon'];
		}

		if ($rawVector === null) {
			return;
		}

		$prefixed = IconManager::toAdminPrefixedValue($rawVector);
		if ($prefixed !== '') {
			$field->set('vectorIcon', $prefixed);
			$field->set('icon', IconManager::sanitizeAdminIconClass($prefixed));
			$fieldgroup->setFieldContextArray($field->id, array_merge(
				$fieldgroup->getFieldContextArray($field->id),
				[
					'vectorIcon' => $prefixed,
					'icon' => IconManager::sanitizeAdminIconClass($prefixed),
				],
			));
			$this->react->icons()->generateAdminCss();
			return;
		}

		$ctx = $fieldgroup->getFieldContextArray($field->id);
		if (!empty($ctx['vectorIcon']) || (isset($ctx['icon']) && is_string($ctx['icon']) && IconManager::isAdminVectorIcon($ctx['icon']))) {
			unset($ctx['vectorIcon']);
			if (isset($ctx['icon']) && is_string($ctx['icon']) && IconManager::isAdminVectorIcon($ctx['icon'])) {
				unset($ctx['icon']);
			}
			$fieldgroup->setFieldContextArray($field->id, $ctx);
			$field->set('vectorIcon', '');
			$this->react->icons()->generateAdminCss();
		}
	}

	/**
	 * Before `Templates::save`: sync `$template->vectorIcon` and regenerate `VectorIcons.css`.
	 */
	public function hookAdminIconTemplateSave(HookEvent $event): void
	{
		if (!(bool) $this->react->get('enableAdminVectorIcons')) {
			return;
		}

		$template = $event->arguments(0);
		if (!$template instanceof Template) {
			return;
		}

		$rawVector = $template->get('vectorIcon');
		$input = $this->wire()->input;
		if (
			$input->requestMethod('POST')
			&& isset($_POST['vectorIcon'])
			&& (int) ($input->post('id') ?: $input->get('id')) === (int) $template->id
		) {
			$rawVector = (string) $_POST['vectorIcon'];
		}

		if ($rawVector === null) {
			return;
		}

		$prevVector = is_string($template->get('vectorIcon')) ? trim((string) $template->get('vectorIcon')) : '';
		$prefixed = IconManager::toAdminPrefixedValue($rawVector);

		if ($prefixed !== '') {
			$template->set('vectorIcon', $prefixed);
			$template->setIcon(IconManager::sanitizeAdminIconClass($prefixed));
			if ($prevVector !== $prefixed || !is_file($this->react->icons()->getAdminCssPath())) {
				$this->react->icons()->generateAdminCss();
			}
			return;
		}

		$currentTplIcon = (string) $template->getIcon(false);
		if ($prevVector !== '' || IconManager::isAdminVectorIcon($currentTplIcon)) {
			$template->set('vectorIcon', '');
			if (IconManager::isAdminVectorIcon($currentTplIcon)) {
				$template->setIcon('');
				$template->pageLabelField = trim((string) $template->pageLabelField);
			}
			$this->react->icons()->generateAdminCss();
		}
	}

	/**
	 * After `Pages::saved`: regenerate `VectorIcons.css` when an `admin` page updates a `page_icon` vector icon value.
	 */
	public function hookAdminIconPageSaved(HookEvent $event): void
	{
		if (!(bool) $this->react->get('enableAdminVectorIcons')) {
			return;
		}

		$page = $event->arguments(0);
		$changes = $event->arguments(1);
		if (!$page instanceof Page || !$page->template instanceof Template || $page->template->name !== 'admin') {
			return;
		}
		if (is_array($changes) && !in_array('page_icon', $changes, true) && !isset($changes['page_icon'])) {
			return;
		}
		$this->react->icons()->generateAdminCss();
	}
}
