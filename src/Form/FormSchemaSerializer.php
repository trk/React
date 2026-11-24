<?php

declare(strict_types=1);

namespace Totoglu\React\Form;

use ProcessWire\Inputfield;
use ProcessWire\InputfieldCheckbox;
use ProcessWire\InputfieldDatetime;
use ProcessWire\InputfieldFile;
use ProcessWire\InputfieldForm;
use ProcessWire\InputfieldHasArrayValue;
use ProcessWire\InputfieldHidden;
use ProcessWire\InputfieldImage;
use ProcessWire\InputfieldMarkup;
use ProcessWire\InputfieldPage;
use ProcessWire\InputfieldReactIcon;
use ProcessWire\InputfieldReactKeyValue;
use ProcessWire\InputfieldReactLink;
use ProcessWire\InputfieldReactM2A;
use ProcessWire\InputfieldReactM2M;
use ProcessWire\InputfieldReactM2O;
use ProcessWire\InputfieldReactO2M;
use ProcessWire\InputfieldSelect;
use ProcessWire\InputfieldSubmit;
use ProcessWire\InputfieldTextarea;
use ProcessWire\InputfieldText;
use ProcessWire\InputfieldTiptap;
use ProcessWire\InputfieldToggle;
use ProcessWire\InputfieldWrapper;
use ProcessWire\Language;
use ProcessWire\MarkupReactTab;
use ProcessWire\Page;
use ProcessWire\Pagefile;
use ProcessWire\Pagefiles;
use ProcessWire\React;
use ProcessWire\SelectableOption;
use ProcessWire\Wire;
use Totoglu\React\Icon\IconManager;
use Totoglu\React\Inertia\InputfieldReact;
use Totoglu\React\Media\PageLinkMediaHostAdapter;
use Totoglu\React\Relation\AbstractInputfieldReactRelation;
use Totoglu\React\Support\IntlCatalog;
use Totoglu\React\Tiptap\TiptapContentPolicy;
use Totoglu\React\Security\AccessGuard;

/**
 * FormSchemaSerializer
 *
 * Serializes a ProcessWire `InputfieldForm` / `InputfieldWrapper` tree or declarative field
 * definitions into a structured `ReactWorkspace/SchemaForm` JSON payload so forms, tabs, sections,
 * grid widths, conditional visibility (`showIf` / `requiredIf`), and field controls can be
 * rendered 100% by React without ProcessWire's `<ul class="Inputfields">` wrapper.
 */
class FormSchemaSerializer extends Wire
{
	/**
	 * Serialize an `InputfieldForm` or `InputfieldWrapper` into a `SchemaForm` prop array.
	 *
	 * @param array<string, mixed> $options
	 * @return array<string, mixed>
	 */
	public function serialize(InputfieldWrapper $wrapper, array $options = []): array
	{
		$this->serializeDepth++;
		try {
			return $this->serializeWrapperPayload($wrapper, $options);
		} finally {
			$this->serializeDepth = max(0, $this->serializeDepth - 1);
		}
	}

	/**
	 * @param array<string, mixed> $options
	 * @return array<string, mixed>
	 */
	private function serializeWrapperPayload(InputfieldWrapper $wrapper, array $options = []): array
	{
		if (isset($options['deleteTab']) && is_array($options['deleteTab']) && ($options['deleteTab']['enabled'] ?? true) !== false) {
			$this->appendDeleteTab($wrapper, $options['deleteTab']);
		}

		$isForm = $wrapper instanceof InputfieldForm;
		$isFragment = array_key_exists('isFragment', $options)
			? (bool) $options['isFragment']
			: !$isForm;

		$wrapId = $this->strAttr($wrapper, 'id');
		$wrapName = $this->strAttr($wrapper, 'name');
		$wrapAction = $this->strAttr($wrapper, 'action');
		$wrapMethod = $this->strAttr($wrapper, 'method');
		$wrapEncType = $this->strAttr($wrapper, 'enctype');
		$formId = trim((string) ($options['id'] ?? ($wrapId !== '' ? $wrapId : ($wrapName !== '' ? $wrapName : 'rw-schema-form'))));
		$formName = trim((string) ($options['name'] ?? ($wrapName !== '' ? $wrapName : $formId)));
		$action = trim((string) ($options['action'] ?? ($isForm ? ($wrapAction !== '' ? $wrapAction : './') : '')));
		$method = strtolower(trim((string) ($options['method'] ?? ($isForm ? ($wrapMethod !== '' ? $wrapMethod : 'post') : 'post'))));
		$encType = trim((string) ($options['encType'] ?? ($isForm ? $wrapEncType : '')));

		$wrapClasses = $this->strAttr($wrapper, 'class');
		$dirtyGuard = array_key_exists('dirtyGuard', $options)
			? (bool) $options['dirtyGuard']
			: ($wrapper->attr('data-rw-dirty-guard') === '1' || str_contains($wrapClasses, 'InputfieldFormConfirm'));

		/** @var list<array{id?: string, name: string, value: string}> $hiddenInputs */
		$hiddenInputs = [];
		if (!$isFragment && $isForm && $formName !== '') {
			$hiddenInputs[] = [
				'name' => '_InputfieldForm',
				'value' => $formName,
			];
		}
		if (isset($options['hiddenInputs']) && is_array($options['hiddenInputs'])) {
			foreach ($options['hiddenInputs'] as $hKey => $hVal) {
				if (is_array($hVal) && isset($hVal['name'])) {
					$hiddenInputs[] = [
						'id' => isset($hVal['id']) ? (string) $hVal['id'] : '',
						'name' => (string) $hVal['name'],
						'value' => (string) ($hVal['value'] ?? ''),
					];
				} elseif (is_string($hKey) && $hKey !== '' && (is_scalar($hVal) || $hVal === null)) {
					$hiddenInputs[] = [
						'name' => $hKey,
						'value' => (string) ($hVal ?? ''),
					];
				}
			}
		}

		/** @var array<string, mixed> $values */
		$values = isset($options['values']) && is_array($options['values']) ? $options['values'] : [];
		/** @var array<string, string> $errors */
		$errors = isset($options['errors']) && is_array($options['errors']) ? $options['errors'] : [];

		/** @var list<array<string, mixed>> $tabs */
		$tabs = [];
		/** @var list<array<string, mixed>> $fields */
		$fields = [];
		/** @var list<array<string, mixed>> $belowTabsFields */
		$belowTabsFields = [];
		/** @var list<array<string, mixed>> $submits */
		$submits = [];

		$hasFileField = false;

		foreach ($wrapper->children() as $child) {
			if (!$child instanceof Inputfield) {
				continue;
			}

			if ($child instanceof InputfieldHidden) {
				$hName = $this->strAttr($child, 'name');
				if ($hName !== '') {
					$hVal = $this->strAttr($child, 'value');
					$hiddenInputs[] = [
						'id' => $this->strAttr($child, 'id'),
						'name' => $hName,
						'value' => $hVal,
					];
					$values[$hName] = $hVal;
				}
				continue;
			}

			if (!$isFragment && $child instanceof InputfieldSubmit) {
				$submits[] = $this->serializeSubmitField($child);
				continue;
			}

			if ($this->isWireTabWrapper($child)) {
				/** @var InputfieldWrapper $child */
				if ((int) ($child->collapsed ?? 0) === Inputfield::collapsedHidden) {
					continue;
				}
				$childId = $this->strAttr($child, 'id');
				$childName = $this->strAttr($child, 'name');
				$childTitle = $this->strAttr($child, 'title');
				$tabId = $childId !== '' ? $childId : ($childName !== '' ? $childName : ('tab_' . count($tabs)));
				$tabLabel = html_entity_decode(
					trim($childTitle !== '' ? $childTitle : ((string) ($child->label ?: $tabId))),
					ENT_QUOTES,
					'UTF-8'
				);
				$confirmDelete = (bool) $child->get('confirmDelete')
					|| $this->findDataAttribute($child->getAttributes(), 'confirm-delete') === '1'
					|| str_contains(strtolower($tabId), 'delete');
				$tabConditions = $this->extractConditionsFromInputfield($child);
				$tabIcon = $this->normalizeIcon((string) (
					$child->icon
					?? $child->getSetting('icon')
					?? $this->findDataAttribute($child->getAttributes(), 'icon', '')
					?? ''
				));
				$tabCollapsed = $this->isCollapsed($child);
				$isSystemTab = (bool) $child->get('systemTab') || $this->findDataAttribute($child->getAttributes(), 'rw-system-tab') === '1';

				$hasHoistableGroup = false;
				foreach ($child->children() as $subChild) {
					if ($subChild instanceof Inputfield && $this->isTopLevelHoistableTabGroup($subChild)) {
						$hasHoistableGroup = true;
						break;
					}
				}

				if ($hasHoistableGroup) {
					$looseFields = [];
					$hoistedTabs = [];

					foreach ($child->children() as $subChild) {
						if (!$subChild instanceof Inputfield) {
							continue;
						}
						if ($subChild instanceof InputfieldHidden) {
							$hName = $this->strAttr($subChild, 'name');
							if ($hName !== '') {
								$hVal = $this->strAttr($subChild, 'value');
								$hiddenInputs[] = [
									'id' => $this->strAttr($subChild, 'id'),
									'name' => $hName,
									'value' => $hVal,
								];
								$values[$hName] = $hVal;
							}
							continue;
						}

						if ($this->isTopLevelHoistableTabGroup($subChild)) {
							/** @var MarkupReactTab $subChild */
							$serializedGroup = $this->serializeTabGroup(
								$subChild,
								$hiddenInputs,
								$values,
								$errors,
								$hasFileField,
							);
							foreach (($serializedGroup['tabs'] ?? []) as $hoistedPane) {
								if (is_array($hoistedPane)) {
									$hoistedTabs[] = $hoistedPane;
								}
							}
							continue;
						}

						$serializedSub = $this->serializeInputfield(
							$subChild,
							$hiddenInputs,
							$values,
							$errors,
							$hasFileField,
						);
						if ($serializedSub !== null) {
							if ((bool) $subChild->get('_rwBelowTabs')) {
								$belowTabsFields[] = $serializedSub;
							} else {
								$looseFields[] = $serializedSub;
							}
						}
					}

					if (
						$hoistedTabs !== []
						&& $looseFields !== []
						&& array_all(
							$looseFields,
							static fn(array $f): bool => ($f['control'] ?? '') === 'hidden' || ($f['type'] ?? '') === 'hidden'
						)
					) {
						$firstPaneFields = is_array($hoistedTabs[0]['fields'] ?? null)
							? $hoistedTabs[0]['fields']
							: [];
						$hoistedTabs[0]['fields'] = array_merge($looseFields, $firstPaneFields);
						$looseFields = [];
					}

					if ($looseFields !== []) {
						$tabs[] = [
							'id' => $tabId,
							'name' => $childName !== '' ? $childName : $tabId,
							'label' => $tabLabel,
							'icon' => $tabIcon,
							'description' => (string) ($child->description ?? ''),
							'notes' => (string) ($child->notes ?? ''),
							'collapsed' => $tabCollapsed,
							'confirmDelete' => $confirmDelete,
							'systemTab' => $isSystemTab,
							'showIf' => $tabConditions['show'],
							'hideIf' => $tabConditions['hide'],
							'conditions' => $tabConditions,
							'fields' => $looseFields,
						];
					}

					foreach ($hoistedTabs as $hoistedPane) {
						$tabs[] = $hoistedPane;
					}

					continue;
				}

				$tabFields = $this->serializeChildren(
					$child,
					$hiddenInputs,
					$values,
					$errors,
					$hasFileField,
					$belowTabsFields,
				);

				$tabs[] = [
					'id' => $tabId,
					'name' => $childName !== '' ? $childName : $tabId,
					'label' => $tabLabel,
					'icon' => $tabIcon,
					'description' => (string) ($child->description ?? ''),
					'notes' => (string) ($child->notes ?? ''),
					'collapsed' => $tabCollapsed,
					'confirmDelete' => $confirmDelete,
					'systemTab' => $isSystemTab,
					'showIf' => $tabConditions['show'],
					'hideIf' => $tabConditions['hide'],
					'conditions' => $tabConditions,
					'fields' => $tabFields,
				];
				continue;
			}

			$serialized = $this->serializeInputfield(
				$child,
				$hiddenInputs,
				$values,
				$errors,
				$hasFileField,
			);
			if ($serialized !== null) {
				if ((bool) $child->get('_rwBelowTabs')) {
					$belowTabsFields[] = $serialized;
				} else {
					$fields[] = $serialized;
				}
			}
		}

		if ($hasFileField && $encType === '') {
			$encType = 'multipart/form-data';
		}

		$this->attachSiblingMediaFieldsToTiptap($tabs, $fields);

		$csrf = null;
		if (!$isFragment) {
			try {
				$sessionCsrf = $this->wire()->session->CSRF;
				$tokenName = (string) $sessionCsrf->getTokenName();
				$tokenValue = (string) $sessionCsrf->getTokenValue();
				if ($tokenName !== '' && $tokenValue !== '') {
					$csrf = [
						'name' => $tokenName,
						'value' => $tokenValue,
					];
				}
			} catch (\Throwable) {
				$csrf = null;
			}
		}

		$presenceKey = trim((string) ($options['presenceKey'] ?? $wrapper->attr('data-rw-presence-key') ?? ''));
		$rootUrl = rtrim((string) ($this->wire()->config->urls->root ?: '/'), '/');
		$presenceEndpoint = !$isFragment && $presenceKey !== ''
			? trim((string) ($options['presenceEndpoint'] ?? ($rootUrl . '/_react/presence')))
			: '';

		$surfaceRaw = strtolower(trim((string) ($options['surface'] ?? $wrapper->attr('data-rw-surface') ?? '')));
		$surface = $surfaceRaw === 'card' ? 'card' : null;
		$tabsLayout = $this->normalizeTabsLayout($options['tabsLayout'] ?? $wrapper->attr('data-rw-tabs-layout'));

		return [
			'id' => $formId,
			'name' => $formName,
			'action' => $action,
			'method' => $method,
			'encType' => $encType,
			'isFragment' => $isFragment,
			'dirtyGuard' => $dirtyGuard,
			'surface' => $surface,
			'tabsLayout' => $tabsLayout,
			'presenceKey' => !$isFragment && $presenceKey !== '' ? $presenceKey : null,
			'presenceEndpoint' => $presenceEndpoint !== '' ? $presenceEndpoint : null,
			'csrf' => $csrf,
			'hiddenInputs' => $hiddenInputs,
			'tabs' => $tabs,
			'fields' => $fields,
			'belowTabsFields' => $belowTabsFields,
			'submits' => $submits,
			'defaultValues' => $values,
			'values' => $values,
			'errors' => $errors,
		];
	}

	/**
	 * Serialize declarative field definitions (`list<array<string, mixed>|object>`) into a `SchemaForm` prop array.
	 *
	 * @param iterable<mixed> $definitions
	 * @param array<string, mixed> $options
	 * @return array<string, mixed>
	 */
	public function serializeDefinitions(iterable $definitions, array $options = []): array
	{
		$this->serializeDepth++;
		try {
			return $this->serializeDefinitionsPayload($definitions, $options);
		} finally {
			$this->serializeDepth = max(0, $this->serializeDepth - 1);
		}
	}

	/**
	 * @param iterable<mixed> $definitions
	 * @param array<string, mixed> $options
	 * @return array<string, mixed>
	 */
	private function serializeDefinitionsPayload(iterable $definitions, array $options = []): array
	{
		$formId = trim((string) ($options['id'] ?? 'rw-schema-form'));
		$formName = trim((string) ($options['name'] ?? $formId));
		$action = trim((string) ($options['action'] ?? './'));
		$method = strtolower(trim((string) ($options['method'] ?? 'post')));
		$encType = trim((string) ($options['encType'] ?? ''));
		$isFragment = (bool) ($options['isFragment'] ?? false);
		$dirtyGuard = (bool) ($options['dirtyGuard'] ?? false);

		/** @var array<string, mixed> $values */
		$values = isset($options['values']) && is_array($options['values']) ? $options['values'] : [];
		/** @var array<string, string> $errors */
		$errors = isset($options['errors']) && is_array($options['errors']) ? $options['errors'] : [];
		/** @var list<array{id?: string, name: string, value: string}> $hiddenInputs */
		$hiddenInputs = [];
		if (isset($options['hiddenInputs']) && is_array($options['hiddenInputs'])) {
			foreach ($options['hiddenInputs'] as $hKey => $hVal) {
				if (is_array($hVal) && isset($hVal['name'])) {
					$hiddenInputs[] = [
						'id' => isset($hVal['id']) ? (string) $hVal['id'] : '',
						'name' => (string) $hVal['name'],
						'value' => (string) ($hVal['value'] ?? ''),
					];
				} elseif (is_string($hKey) && $hKey !== '' && (is_scalar($hVal) || $hVal === null)) {
					$hiddenInputs[] = [
						'name' => $hKey,
						'value' => (string) ($hVal ?? ''),
					];
				}
			}
		}

		$fields = [];
		$hasFile = false;

		foreach ($definitions as $defKey => $def) {
			$raw = is_object($def) && method_exists($def, 'toArray')
				? $def->toArray()
				: (is_array($def) ? $def : []);
			if (!is_array($raw) || $raw === []) {
				continue;
			}

			$fallbackName = is_string($defKey) && !ctype_digit($defKey) ? $defKey : '';
			$name = trim((string) ($raw['name'] ?? $raw['field_key'] ?? $fallbackName));
			$rawType = strtolower(trim((string) ($raw['type'] ?? $raw['field_type'] ?? 'text')));
			if ($name === '') {
				continue;
			}

			$isLanguageTypeAlias = str_ends_with($rawType, '_language') || str_ends_with($rawType, '-language');
			$type = $isLanguageTypeAlias
				? (string) preg_replace('/[_-]language$/', '', $rawType)
				: $rawType;
			if ($type === '') {
				$type = 'text';
			}

			$useLanguages = $isLanguageTypeAlias
				|| !empty($raw['useLanguages'])
				|| !empty($raw['translatable'])
				|| !empty($raw['multilang'])
				|| !empty($raw['i18n']['enabled']);
			$inheritLanguage = array_key_exists('inheritLanguage', $raw)
				? (bool) $raw['inheritLanguage']
				: (array_key_exists('inheritLanguage', is_array($raw['i18n'] ?? null) ? $raw['i18n'] : [])
					? (bool) $raw['i18n']['inheritLanguage']
					: true);

			$isMediaField = self::isMediaControlType($type, $raw);
			$val = $values[$name] ?? $raw['value'] ?? $raw['defaultValue'] ?? $raw['default'] ?? $raw['default_value'] ?? '';
			if ($isMediaField && ($val === '' || $val === [])) {
				$derivedFiles = self::extractFileNamesFromMediaList($raw['files'] ?? null);
				if ($derivedFiles !== []) {
					$val = $derivedFiles;
				}
			}
			$langTabs = [];
			if ($useLanguages) {
				$langTabs = $this->extractDeclarativeLanguageValues($name, $raw, $isMediaField ? '' : $val, $values);
				if (!$isMediaField) {
					if ($langTabs !== []) {
						foreach ($langTabs as $langTab) {
							$values[$langTab['inputName']] = $langTab['value'];
							if ($langTab['isDefault']) {
								$val = $langTab['value'];
							}
						}
					} elseif (is_array($val)) {
						$val = (string) ($val['default'] ?? reset($val) ?: '');
					}
				}
			}
			$values[$name] = $val;

			$err = (string) ($errors[$name] ?? $raw['error'] ?? '');
			if ($err !== '') {
				$errors[$name] = $err;
			}

			if ($type === 'hidden') {
				$hiddenInputs[] = [
					'id' => (string) ($raw['id'] ?? 'Inputfield_' . $name),
					'name' => $name,
					'value' => is_scalar($val) ? (string) $val : '',
				];
				continue;
			}

			if ($type === 'file' || $type === 'image' || $type === 'images' || $type === 'files') {
				$hasFile = true;
			}

			$rawExtensions = $raw['allowedExtensions'] ?? $raw['allowed_extensions'] ?? $raw['extensions'] ?? [];
			$extensionsList = is_array($rawExtensions)
				? array_values(array_filter(array_map(static fn($e): string => ltrim(strtolower(trim((string) $e)), '.'), $rawExtensions)))
				: (is_string($rawExtensions) && trim($rawExtensions) !== ''
					? array_values(array_filter(preg_split('/[\s,]+/', strtolower(trim($rawExtensions))) ?: []))
					: []);
			$acceptStr = $extensionsList !== []
				? implode(',', array_map(static fn(string $ext): string => '.' . $ext, $extensionsList))
				: (string) ($raw['accept'] ?? (($type === 'image' || $type === 'images') ? 'image/*' : ''));
			$maxFiles = max(0, (int) ($raw['maxFiles'] ?? $raw['max_files'] ?? $raw['maxItems'] ?? $raw['max_items'] ?? (($type === 'images' || $type === 'files') ? 0 : 1)));

			$rawOptionsInput = $raw['options']
				?? $raw['comboboxOptions']
				?? $raw['combobox_options']
				?? $raw['segmentedOptions']
				?? $raw['segmented_options']
				?? null;
			$normalizedOptions = is_array($rawOptionsInput)
				? $this->normalizeOptionItems($rawOptionsInput)
				: [];

			$subfields = [];
			if (isset($raw['subfields']) && is_array($raw['subfields'])) {
				foreach ($raw['subfields'] as $sub) {
					if (is_array($sub) && isset($sub['name'])) {
						$subConditions = $this->extractConditionsFromRaw($sub);
						$subValidation = $this->normalizeValidationRules($sub, $subConditions);
						$subfields[] = [
							'name' => (string) $sub['name'],
							'type' => (string) ($sub['type'] ?? 'text'),
							'label' => (string) ($sub['label'] ?? $sub['name']),
							'placeholder' => (string) ($sub['placeholder'] ?? ''),
							'required' => !empty($subValidation['required']),
							'width' => (int) ($sub['width'] ?? $sub['columnWidth'] ?? 100),
							'options' => isset($sub['options']) && is_array($sub['options']) ? $sub['options'] : [],
							'conditions' => $subConditions,
							'validation' => $subValidation,
						];
					}
				}
			}

			$conditions = $this->extractConditionsFromRaw($raw);
			$validation = $this->normalizeValidationRules($raw, $conditions);
			$connection = $this->extractConnectionFromRaw($raw, $type, $val, $langTabs);

			if ($type === 'link') {
				$rawLinkCfg = isset($raw['linkConfig']) && is_array($raw['linkConfig'])
					? array_merge($raw, $raw['linkConfig'])
					: $raw;
				$linkBase = [
					'kind' => 'control',
					'id' => (string) ($raw['id'] ?? 'Inputfield_' . $name),
					'name' => $name,
					'label' => (string) ($raw['label'] ?? $name),
					'description' => (string) ($raw['description'] ?? ''),
					'notes' => (string) ($raw['notes'] ?? ''),
					'icon' => $this->normalizeIcon((string) ($raw['icon'] ?? '')),
					'required' => !empty($validation['required']),
					'disabled' => !empty($raw['disabled']),
					'readOnly' => !empty($raw['readOnly']) || !empty($raw['readonly']),
					'width' => max(8, min(100, (int) ($raw['width'] ?? $raw['columnWidth'] ?? $raw['column_width'] ?? 100))),
					'colSpan' => is_numeric($raw['colSpan'] ?? $raw['col_span'] ?? null) ? max(1, min(12, (int) ($raw['colSpan'] ?? $raw['col_span']))) : null,
					'placeholder' => (string) ($raw['placeholder'] ?? ''),
					'inlineSettings' => self::normalizeStringList($raw['inlineSettings'] ?? $raw['inline_settings'] ?? []),
					'inlineHidden' => !empty($raw['inlineHidden']) || !empty($raw['inline_hidden']),
					'showIf' => $conditions['show'],
					'hideIf' => $conditions['hide'],
					'enableIf' => $conditions['enable'],
					'disableIf' => $conditions['disable'],
					'requiredIf' => $conditions['require'],
					'conditions' => $conditions,
					'validation' => $validation,
					'stepIndex' => (int) ($raw['stepIndex'] ?? $raw['step_index'] ?? 1),
					'stepTitle' => (string) ($raw['stepTitle'] ?? $raw['step_title'] ?? ''),
					'error' => $err,
				];
				$rawReset = $raw['resetValue'] ?? ($raw['default'] ?? null);
				if ($rawReset !== null) {
					$linkBase['resetValue'] = $rawReset;
				}
				$serializedLink = $this->serializeLinkControl(
					$linkBase,
					$rawLinkCfg,
					$val,
					!empty($linkBase['readOnly']) || !empty($linkBase['disabled'])
				);
				$values[$name] = $serializedLink['value'];
				$fields[] = $serializedLink;
				continue;
			}

			if (in_array($type, ['icon', 'react_icon', 'inputfieldreacticon'], true)) {
				$rawIconCfg = isset($raw['iconConfig']) && is_array($raw['iconConfig'])
					? array_merge($raw, $raw['iconConfig'])
					: $raw;
				$flags = IconManager::resolveCustomizationFlags($rawIconCfg);
				$rawPrefix = strtolower(trim((string) ($rawIconCfg['prefixMode'] ?? $rawIconCfg['iconPrefixMode'] ?? 'none')));
				$prefixMode = in_array($rawPrefix, ['none', 'vector', 'fa'], true) ? $rawPrefix : 'none';
				$rootUrl = rtrim((string) ($this->wire()->config->urls->root ?: '/'), '/');
				$iconCfg = array_merge($flags, [
					'previewSize' => IconManager::clampSize($rawIconCfg['previewSize'] ?? null, 20),
					'prefixMode' => $prefixMode,
					'endpoint' => (string) ($rawIconCfg['endpoint'] ?? ($rootUrl . '/_react/icons')),
					'totalIcons' => IconManager::loadCatalog()['totalVariants'],
				]);
				$normIcon = IconManager::normalizeValue($val);
				$iconValue = $flags['allowCustomization']
					? ($normIcon['name'] !== '' ? $normIcon : '')
					: IconManager::encodeForStorage($normIcon, $flags, $prefixMode);

				$iconNode = [
					'kind' => 'control',
					'type' => 'icon',
					'id' => (string) ($raw['id'] ?? 'Inputfield_' . $name),
					'name' => $name,
					'label' => (string) ($raw['label'] ?? $name),
					'description' => (string) ($raw['description'] ?? ''),
					'notes' => (string) ($raw['notes'] ?? ''),
					'icon' => $this->normalizeIcon((string) ($raw['icon'] ?? '')),
					'required' => !empty($validation['required']),
					'disabled' => !empty($raw['disabled']),
					'readOnly' => !empty($raw['readOnly']) || !empty($raw['readonly']),
					'width' => max(8, min(100, (int) ($raw['width'] ?? $raw['columnWidth'] ?? $raw['column_width'] ?? 100))),
					'colSpan' => is_numeric($raw['colSpan'] ?? $raw['col_span'] ?? null) ? max(1, min(12, (int) ($raw['colSpan'] ?? $raw['col_span']))) : null,
					'placeholder' => (string) ($raw['placeholder'] ?? ''),
					'defaultValue' => $iconValue,
					'value' => $iconValue,
					'iconConfig' => $iconCfg,
					'inlineSettings' => self::normalizeStringList($raw['inlineSettings'] ?? $raw['inline_settings'] ?? []),
					'inlineHidden' => !empty($raw['inlineHidden']) || !empty($raw['inline_hidden']),
					'showIf' => $conditions['show'],
					'hideIf' => $conditions['hide'],
					'enableIf' => $conditions['enable'],
					'disableIf' => $conditions['disable'],
					'requiredIf' => $conditions['require'],
					'conditions' => $conditions,
					'validation' => $validation,
					'stepIndex' => (int) ($raw['stepIndex'] ?? $raw['step_index'] ?? 1),
					'stepTitle' => (string) ($raw['stepTitle'] ?? $raw['step_title'] ?? ''),
					'error' => $err,
				];
				$rawIconReset = $raw['resetValue'] ?? ($raw['default'] ?? null);
				if ($rawIconReset !== null) {
					$iconNode['resetValue'] = $rawIconReset;
				}
				$values[$name] = $iconValue;
				$fields[] = $iconNode;
				continue;
			}

			if (in_array($type, ['relation', 'm2o', 'm2m', 'o2m', 'm2a', 'page'], true)) {
				$fields[] = $this->serializeDeclarativeRelation(
					$name,
					$type,
					$raw,
					$val,
					$err,
					$conditions,
					$validation,
					$values,
				);
				continue;
			}

			$controlType = $this->canonicalControlType($type);
			if ($controlType === 'range' && (!empty($raw['dual']) || strtolower(trim((string) ($raw['rangeMode'] ?? $raw['range_mode'] ?? ''))) === 'dual')) {
				$controlType = 'range_slider';
			}
			if ($controlType === 'textarea' && strtolower(trim((string) ($raw['editorMode'] ?? $raw['editor_mode'] ?? ''))) === 'markdown') {
				$controlType = 'markdown';
			}
			if ($controlType === 'daterange') {
				$val = $this->normalizeDateRangeValue($val);
				$values[$name] = $val;
			} elseif ($controlType === 'tags') {
				$val = $this->normalizeTagListValue($val);
				$values[$name] = $val;
			} elseif ($controlType === 'unit_number') {
				$fallbackUnit = $this->resolveUnitNumberFallbackUnit($raw, $type);
				$val = $this->normalizeUnitNumberValue($val, $fallbackUnit);
				$values[$name] = $val;
			} elseif ($controlType === 'spacing') {
				$fallbackUnit = trim((string) ($raw['defaultUnit'] ?? $raw['default_unit'] ?? 'px')) ?: 'px';
				$val = $this->normalizeSpacingValue($val, $fallbackUnit);
				$values[$name] = $val;
			} elseif ($controlType === 'range_slider') {
				$val = $this->normalizeRangeSliderValue($val);
				$values[$name] = $val;
			} elseif ($controlType === 'condition_builder') {
				$useLanguages = false;
				$langTabs = [];
				$val = $this->normalizeConditionBuilderValue($val);
				$values[$name] = $val;
			}
			$kvRows = [];
			if ($controlType === 'keyvalue') {
				$useLanguages = false;
				$langTabs = [];
				$allowEmptyVals = array_key_exists('allowEmptyValues', $raw)
					? (bool) $raw['allowEmptyValues']
					: (array_key_exists('allow_empty_values', $raw) ? (bool) $raw['allow_empty_values'] : true);
				$val = InputfieldReactKeyValue::normalizeValue($val, $allowEmptyVals);
				$values[$name] = $val;
				foreach ($val as $kvKey => $kvVal) {
					$kvRows[] = [
						'key' => (string) $kvKey,
						'value' => is_bool($kvVal) ? ($kvVal ? '1' : '0') : (string) $kvVal,
					];
				}
			}
			$tiptapConfig = null;
			if ($controlType === 'tiptap') {
				$tiptapHtmlValues = [];
				if (is_scalar($val) && (string) $val !== '') {
					$tiptapHtmlValues[] = (string) $val;
				}
				foreach ($langTabs as $langTab) {
					if (!is_array($langTab)) {
						continue;
					}
					$langVal = $langTab['value'] ?? '';
					if (is_scalar($langVal) && (string) $langVal !== '') {
						$tiptapHtmlValues[] = (string) $langVal;
					}
				}
				$tiptapConfig = TiptapContentPolicy::resolveEditorSettings(
					$raw,
					$this,
					[],
					$name,
					$tiptapHtmlValues,
				);
				$tiptapConfig['pwContext'] = React::instance($this)->tiptap()->buildDeclarativeContext(
					$raw,
					$name,
					$options,
				);
			}
			$rawColSpan = $raw['colSpan'] ?? $raw['col_span'] ?? null;
			$colSpan = is_numeric($rawColSpan) ? max(1, min(12, (int) $rawColSpan)) : null;
			$valueMode = (string) ($raw['valueMode'] ?? $raw['value_mode'] ?? '');
			$slugFrom = $connection !== null && ($connection['type'] ?? '') === 'slug'
				? (string) ($connection['sourceField'] ?? '')
				: '';
			$slugLocked = $connection !== null && ($connection['type'] ?? '') === 'slug'
				? !empty($connection['lockWhenPopulated'])
				: false;
			$formula = $connection !== null && ($connection['type'] ?? '') === 'calculation'
				? (string) ($connection['formula'] ?? '')
				: (string) ($raw['formula'] ?? '');
			$precision = $connection !== null && ($connection['type'] ?? '') === 'calculation'
				? (int) ($connection['precision'] ?? 2)
				: (int) ($raw['precision'] ?? 2);

			$defaultInputType = match ($controlType) {
				'email', 'url', 'tel', 'phone' => $controlType === 'phone' ? 'tel' : $controlType,
				'range', 'colspan' => 'range',
				'date' => 'date',
				'time' => 'time',
				'datetime' => 'datetime-local',
				default => 'text',
			};

			$fieldNode = [
				'kind' => 'control',
				'type' => $controlType,
				'inputType' => (string) ($raw['inputType'] ?? $defaultInputType),
				'id' => (string) ($raw['id'] ?? 'Inputfield_' . $name),
				'name' => $name,
				'label' => (string) ($raw['label'] ?? $name),
				'checkboxLabel' => (string) ($raw['checkboxLabel'] ?? $raw['label2'] ?? $raw['label'] ?? ''),
				'description' => (string) ($raw['description'] ?? ''),
				'notes' => (string) ($raw['notes'] ?? ''),
				'icon' => $this->normalizeIcon((string) ($raw['icon'] ?? '')),
				'required' => !empty($validation['required']),
				'disabled' => !empty($raw['disabled']),
				'readOnly' => !empty($raw['readOnly']) || !empty($raw['readonly']),
				'width' => max(8, min(100, (int) ($raw['width'] ?? $raw['columnWidth'] ?? $raw['column_width'] ?? 100))),
				'colSpan' => $colSpan,
				'valueMode' => $valueMode !== '' ? $valueMode : null,
				'placeholder' => (string) ($raw['placeholder'] ?? ''),
				'defaultValue' => $val,
				'value' => $val,
				'checked' => (bool) ($val === true || $val === 1 || $val === '1' || $val === 'true'),
				'options' => $normalizedOptions,
				'min' => $validation['min'] ?? null,
				'max' => $validation['max'] ?? null,
				'step' => $validation['step'] ?? null,
				'minLength' => (int) ($validation['minLength'] ?? 0),
				'maxLength' => (int) ($validation['maxLength'] ?? 0),
				'pattern' => $validation['pattern'] ?? null,
				'rows' => (int) ($raw['rows'] ?? 4),
				'formula' => $formula,
				'precision' => $precision,
				'slugFrom' => $slugFrom !== '' ? $slugFrom : null,
				'slugSeparator' => $connection !== null && ($connection['type'] ?? '') === 'slug' ? (string) ($connection['separator'] ?? '-') : '-',
				'slugLocked' => $slugLocked,
				'connection' => $connection,
				'useLanguages' => $useLanguages,
				'languages' => $langTabs,
				'i18n' => $useLanguages ? [
					'enabled' => true,
					'inheritLanguage' => $inheritLanguage,
					'languages' => $langTabs,
				] : null,
				'maxStars' => (int) ($raw['maxStars'] ?? 5),
				'minItems' => (int) ($validation['minItems'] ?? $raw['minItems'] ?? $raw['min_items'] ?? $raw['minRows'] ?? 0),
				'maxItems' => (int) ($validation['maxItems'] ?? $raw['maxItems'] ?? $raw['max_items'] ?? ($controlType === 'keyvalue' ? 0 : ($raw['maxRows'] ?? 0))),
				'minRows' => (int) ($validation['minItems'] ?? $raw['minRows'] ?? $raw['minItems'] ?? 0),
				'maxRows' => (int) ($validation['maxItems'] ?? $raw['maxRows'] ?? $raw['maxItems'] ?? 10),
				'keyLabel' => $controlType === 'keyvalue' ? (string) ($raw['keyLabel'] ?? $raw['key_label'] ?? '') : null,
				'valueLabel' => $controlType === 'keyvalue' ? (string) ($raw['valueLabel'] ?? $raw['value_label'] ?? '') : null,
				'keyPlaceholder' => $controlType === 'keyvalue' ? (string) ($raw['keyPlaceholder'] ?? $raw['key_placeholder'] ?? $raw['keyLabel'] ?? $raw['key_label'] ?? '') : null,
				'valuePlaceholder' => $controlType === 'keyvalue' ? (string) ($raw['valuePlaceholder'] ?? $raw['value_placeholder'] ?? $raw['valueLabel'] ?? $raw['value_label'] ?? '') : null,
				'addLabel' => $controlType === 'keyvalue' ? (string) ($raw['addLabel'] ?? $raw['add_label'] ?? '') : null,
				'removeLabel' => $controlType === 'keyvalue' ? (string) ($raw['removeLabel'] ?? $raw['remove_label'] ?? '') : null,
				'keyPattern' => $controlType === 'keyvalue' ? ($validation['keyPattern'] ?? $raw['keyPattern'] ?? $raw['key_pattern'] ?? null) : null,
				'keyPatternMessage' => $controlType === 'keyvalue'
					? ((is_array($validation['messages'] ?? null) ? ($validation['messages']['keyPattern'] ?? null) : null) ?? $raw['keyPatternMessage'] ?? $raw['key_pattern_message'] ?? null)
					: null,
				'allowEmptyValues' => $controlType === 'keyvalue'
					? (array_key_exists('allowEmptyValues', $raw) ? (bool) $raw['allowEmptyValues'] : (array_key_exists('allow_empty_values', $raw) ? (bool) $raw['allow_empty_values'] : true))
					: null,
				'kvRows' => $controlType === 'keyvalue' ? $kvRows : null,
				'subfields' => $subfields,
				'isFile' => in_array($type, ['file', 'files', 'image', 'images'], true),
				'isImage' => in_array($type, ['image', 'images'], true),
				'accept' => $acceptStr,
				'extensions' => $extensionsList,
				'maxFiles' => $maxFiles,
				'maxFilesize' => (int) ($validation['maxFilesize'] ?? $raw['maxFilesize'] ?? $raw['maxFileSize'] ?? 0),
				'multiple' => $maxFiles !== 1 && (!array_key_exists('multiple', $raw) || (bool) $raw['multiple']),
				'descriptionRows' => (int) ($raw['descriptionRows'] ?? 1),
				'useTags' => !empty($raw['useTags']),
				'tagsPredefinedOnly' => !empty($raw['tagsPredefinedOnly']) || (is_int($raw['useTags'] ?? null) && (($raw['useTags'] & 8) !== 0 && ($raw['useTags'] & 1) === 0)),
				'tagsList' => self::normalizeMediaTokenList($raw['tagsList'] ?? $raw['tags_list'] ?? [], false),
				'focusMode' => ($raw['focusMode'] ?? null) === false || ($raw['focusMode'] ?? null) === 0 || ($raw['focusMode'] ?? null) === '0'
					? 'off'
					: (in_array(strtolower(trim((string) ($raw['focusMode'] ?? ''))), ['on', 'zoom', 'off'], true)
						? strtolower(trim((string) $raw['focusMode']))
						: (in_array($type, ['image', 'images'], true) ? 'on' : 'off')),
				'minWidth' => (int) ($raw['minWidth'] ?? $raw['min_width'] ?? 0),
				'minHeight' => (int) ($raw['minHeight'] ?? $raw['min_height'] ?? 0),
				'maxWidth' => (int) ($raw['maxWidth'] ?? $raw['max_width'] ?? 0),
				'maxHeight' => (int) ($raw['maxHeight'] ?? $raw['max_height'] ?? 0),
				'maxReject' => !empty($raw['maxReject']) || !empty($raw['max_reject']),
				'dimensionsByAspectRatio' => !empty($raw['dimensionsByAspectRatio']) || !empty($raw['dimensions_by_aspect_ratio']),
				'clientQuality' => max(10, min(100, (int) ($raw['clientQuality'] ?? $raw['client_quality'] ?? 90))),
				'resizeServer' => !empty($raw['resizeServer']) || !empty($raw['resize_server']),
				'useImageEditor' => array_key_exists('useImageEditor', $raw) ? !empty($raw['useImageEditor']) : in_array($type, ['image', 'images'], true),
				'gridMode' => in_array(strtolower(trim((string) ($raw['gridMode'] ?? $raw['grid_mode'] ?? 'grid'))), ['list', 'table'], true) ? 'table' : 'grid',
				'noUpload' => !empty($raw['noUpload']) || !empty($raw['no_upload']),
				'overwrite' => !empty($raw['overwrite']),
				'uploadUrl' => (string) ($raw['uploadUrl'] ?? ''),
				'uploadFieldName' => (string) ($raw['uploadFieldName'] ?? $name),
				'mediaEndpoint' => (string) ($raw['mediaEndpoint'] ?? ''),
				'mediaToken' => (string) ($raw['mediaToken'] ?? ''),
				'files' => isset($raw['files']) && is_array($raw['files']) ? $raw['files'] : [],
				'showIf' => $conditions['show'],
				'hideIf' => $conditions['hide'],
				'enableIf' => $conditions['enable'],
				'disableIf' => $conditions['disable'],
				'requiredIf' => $conditions['require'],
				'conditions' => $conditions,
				'validation' => $validation,
				'stepIndex' => (int) ($raw['stepIndex'] ?? $raw['step_index'] ?? 1),
				'stepTitle' => (string) ($raw['stepTitle'] ?? $raw['step_title'] ?? ''),
				'inlineSettings' => self::normalizeStringList($raw['inlineSettings'] ?? $raw['inline_settings'] ?? []),
				'inlineHidden' => !empty($raw['inlineHidden']) || !empty($raw['inline_hidden']),
				'tiptapConfig' => $tiptapConfig,
				'error' => $err,
			];
			$rawNodeReset = $raw['resetValue'] ?? ($raw['default'] ?? null);
			if ($rawNodeReset !== null) {
				$fieldNode['resetValue'] = $rawNodeReset;
			}

			if (array_key_exists('isSecret', $raw) || $type === 'secret') {
				$isSecretDecl = array_key_exists('isSecret', $raw) ? !empty($raw['isSecret']) : true;
				$secretAutogenRaw = $raw['secretAutoGenerate']
					?? $raw['secret_auto_generate']
					?? $raw['autoGenerate']
					?? $raw['auto_generate']
					?? true;
				$fieldNode = array_merge(
					$fieldNode,
					$this->resolveSecretSerializationMeta(
						$isSecretDecl,
						$raw['secretMasked'] ?? $raw['secret_masked'] ?? $raw['masked'] ?? false,
						$raw['secretPrefix'] ?? $raw['secret_prefix'] ?? $raw['prefix'] ?? '',
						$raw['secretBytes'] ?? $raw['secret_bytes'] ?? $raw['bytes'] ?? 32,
						$secretAutogenRaw,
					),
				);
			}

			$this->applyExtendedControlOptions($controlType, $fieldNode, $raw, $type);

			$fields[] = $fieldNode;
		}

		if ($hasFile && $encType === '') {
			$encType = 'multipart/form-data';
		}

		$submits = isset($options['submits']) && is_array($options['submits'])
			? $options['submits']
			: (!$isFragment ? [[
				'id' => $formId . '_submit',
				'name' => (string) ($options['submitName'] ?? 'submit'),
				'label' => (string) ($options['submitLabel'] ?? $this->_('Submit')),
				'icon' => $this->normalizeIcon((string) ($options['submitIcon'] ?? 'check')),
				'header' => false,
				'danger' => false,
				'actions' => [],
			]] : []);

		$csrf = null;
		if (!$isFragment) {
			try {
				$sessionCsrf = $this->wire()->session->CSRF;
				$tokenName = (string) $sessionCsrf->getTokenName();
				$tokenValue = (string) $sessionCsrf->getTokenValue();
				if ($tokenName !== '' && $tokenValue !== '') {
					$csrf = [
						'name' => $tokenName,
						'value' => $tokenValue,
					];
				}
			} catch (\Throwable) {
				$csrf = null;
			}
		}

		$presenceKey = trim((string) ($options['presenceKey'] ?? ''));
		$rootUrl = rtrim((string) ($this->wire()->config->urls->root ?: '/'), '/');
		$presenceEndpoint = !$isFragment && $presenceKey !== ''
			? trim((string) ($options['presenceEndpoint'] ?? ($rootUrl . '/_react/presence')))
			: '';

		$emptyTabs = [];
		$this->attachSiblingMediaFieldsToTiptap($emptyTabs, $fields);

		$surfaceRaw = strtolower(trim((string) ($options['surface'] ?? '')));
		$surface = $surfaceRaw === 'card' ? 'card' : null;
		$tabsLayout = $this->normalizeTabsLayout($options['tabsLayout'] ?? null);

		return [
			'id' => $formId,
			'name' => $formName,
			'action' => $action,
			'method' => $method,
			'encType' => $encType,
			'isFragment' => $isFragment,
			'dirtyGuard' => $dirtyGuard,
			'surface' => $surface,
			'tabsLayout' => $tabsLayout,
			'presenceKey' => !$isFragment && $presenceKey !== '' ? $presenceKey : null,
			'presenceEndpoint' => $presenceEndpoint !== '' ? $presenceEndpoint : null,
			'csrf' => $csrf,
			'hiddenInputs' => $hiddenInputs,
			'tabs' => [],
			'fields' => $fields,
			'submits' => $submits,
			'defaultValues' => $values,
			'values' => $values,
			'errors' => $errors,
		];
	}

	/**
	 * Collect sibling `image` / `file` controls bearing a signed `mediaToken` across `$tabs` and `$fields`
	 * and attach them to any `tiptap` control's `pwContext.hostMediaFields` so non-Page entity hosts
	 * (such as `MediaHostAdapterInterface` entries) work seamlessly inside Tiptap's link & image dialogs.
	 *
	 * @param list<array<string, mixed>> $tabs
	 * @param list<array<string, mixed>> $fields
	 */
	private function attachSiblingMediaFieldsToTiptap(array &$tabs, array &$fields): void
	{
		$mediaFields = [];
		$collect = function (array $nodes) use (&$collect, &$mediaFields): void {
			foreach ($nodes as $node) {
				if (!is_array($node)) {
					continue;
				}
				$kind = (string) ($node['kind'] ?? '');
				$type = (string) ($node['type'] ?? '');
				if ($kind === 'control' && ($type === 'image' || $type === 'file')) {
					$token = trim((string) ($node['mediaToken'] ?? ''));
					$fName = trim((string) ($node['name'] ?? ''));
					if ($token !== '' && $fName !== '') {
						$mediaFields[] = [
							'name' => $fName,
							'label' => (string) ($node['label'] ?? $fName),
							'isImage' => $type === 'image' || !empty($node['isImage']),
							'mediaToken' => $token,
							'noUpload' => !empty($node['noUpload']) || !empty($node['readOnly']),
						];
					}
				} elseif ($kind === 'island' && in_array((string) ($node['component'] ?? ''), ['InputfieldReactImage', 'InputfieldReactFile'], true)) {
					$props = is_array($node['props'] ?? null) ? $node['props'] : [];
					$nestedProps = is_array($props['props'] ?? null) ? $props['props'] : $props;
					$token = trim((string) ($nestedProps['mediaToken'] ?? $props['mediaToken'] ?? ''));
					$fName = trim((string) ($props['name'] ?? $node['name'] ?? ''));
					if ($token !== '' && $fName !== '') {
						$isImg = ($node['component'] ?? '') === 'InputfieldReactImage' || !empty($nestedProps['isImage']);
						$mediaFields[] = [
							'name' => $fName,
							'label' => (string) ($node['label'] ?? $props['label'] ?? $fName),
							'isImage' => $isImg,
							'mediaToken' => $token,
							'noUpload' => !empty($nestedProps['noUpload']) || !empty($props['readOnly']),
						];
					}
				}
				if (isset($node['fields']) && is_array($node['fields'])) {
					$collect($node['fields']);
				}
				if (isset($node['tabs']) && is_array($node['tabs'])) {
					$collect($node['tabs']);
				}
			}
		};

		$collect($tabs);
		$collect($fields);
		if ($mediaFields === []) {
			return;
		}

		$inject = function (array &$nodes) use (&$inject, $mediaFields): void {
			foreach ($nodes as &$node) {
				if (!is_array($node)) {
					continue;
				}
				if (($node['kind'] ?? '') === 'control' && ($node['type'] ?? '') === 'tiptap') {
					if (!isset($node['tiptapConfig']) || !is_array($node['tiptapConfig'])) {
						$node['tiptapConfig'] = [];
					}
					if (!isset($node['tiptapConfig']['pwContext']) || !is_array($node['tiptapConfig']['pwContext'])) {
						$node['tiptapConfig']['pwContext'] = [];
					}
					$node['tiptapConfig']['pwContext']['hostMediaFields'] = $mediaFields;
					if (empty($node['tiptapConfig']['pwContext']['canUploadImages']) && empty($node['readOnly']) && empty($node['disabled'])) {
						foreach ($mediaFields as $mf) {
							if (!empty($mf['isImage']) && empty($mf['noUpload'])) {
								$node['tiptapConfig']['pwContext']['canUploadImages'] = true;
								break;
							}
						}
					}
				}
				if (isset($node['fields']) && is_array($node['fields'])) {
					$inject($node['fields']);
				}
				if (isset($node['tabs']) && is_array($node['tabs'])) {
					$inject($node['tabs']);
				}
			}
			unset($node);
		};

		$inject($tabs);
		$inject($fields);
	}

	/**
	 * Determine whether an `Inputfield` is a top-level `WireTab` wrapper.
	 */
	private function strAttr(Inputfield $inputfield, string $key): string
	{
		$val = $inputfield->attr($key);

		return is_scalar($val) ? (string) $val : '';
	}

	private function isWireTabWrapper(Inputfield $inputfield): bool
	{
		if (!$inputfield instanceof InputfieldWrapper || $inputfield instanceof MarkupReactTab) {
			return false;
		}
		$classAttr = $this->strAttr($inputfield, 'class');
		$wrapClass = (string) ($inputfield->wrapClass ?? '');

		return str_contains($classAttr, 'WireTab')
			|| str_contains($wrapClass, 'WireTab')
			|| str_contains($classAttr, 'pw-tab-pane');
	}

	/**
	 * Determine whether an `Inputfield` is a top-level `MarkupReactTab` group whose panes
	 * should be hoisted into the main form tab bar unless explicitly configured as an inline tab group.
	 */
	private function isTopLevelHoistableTabGroup(Inputfield $inputfield): bool
	{
		if (!$inputfield instanceof MarkupReactTab) {
			return false;
		}
		if ((bool) ($inputfield->get('_rwInlineTabGroup') || $inputfield->get('inline'))) {
			return false;
		}
		$variant = strtolower(trim((string) ($inputfield->get('variant') ?: 'line')));
		if ($variant !== 'line') {
			return false;
		}
		$groupIdent = $this->strAttr($inputfield, 'name') ?: $this->strAttr($inputfield, 'id');
		if ($groupIdent !== '' && preg_match('/^(?:rwtabgrp_|rwtab_|tabgrp_|tab_)/i', $groupIdent) === 1) {
			return true;
		}
		foreach ($inputfield->children() as $child) {
			if ($child instanceof MarkupReactTab) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Serialize the child `Inputfield`s of an `InputfieldWrapper`.
	 *
	 * @param list<array{id?: string, name: string, value: string}> $hiddenInputs
	 * @param array<string, mixed> $values
	 * @param array<string, string> $errors
	 * @param list<array<string, mixed>>|null $belowTabsFields
	 * @return list<array<string, mixed>>
	 */
	private function serializeChildren(
		InputfieldWrapper $wrapper,
		array &$hiddenInputs,
		array &$values,
		array &$errors,
		bool &$hasFileField,
		?array &$belowTabsFields = null,
	): array {
		$items = [];
		foreach ($wrapper->children() as $child) {
			if (!$child instanceof Inputfield) {
				continue;
			}
			if ($child instanceof InputfieldHidden) {
				$hName = $this->strAttr($child, 'name');
				if ($hName !== '') {
					$hVal = $this->strAttr($child, 'value');
					$hId = $this->strAttr($child, 'id');
					$hiddenEntry = ['id' => $hId, 'name' => $hName, 'value' => $hVal];
					$hiddenInputs[] = $hiddenEntry;
					$values[$hName] = $hVal;
				}
				continue;
			}

			$serialized = $this->serializeInputfield(
				$child,
				$hiddenInputs,
				$values,
				$errors,
				$hasFileField,
			);
			if ($serialized !== null) {
				if ($belowTabsFields !== null && (bool) $child->get('_rwBelowTabs')) {
					$belowTabsFields[] = $serialized;
				} else {
					$items[] = $serialized;
				}
			}
		}

		return $items;
	}

	private int $serializeDepth = 0;

	/**
	 * Report whether `FormSchemaSerializer` is currently inside a serialization pass.
	 */
	public function isSerializing(): bool
	{
		return $this->serializeDepth > 0;
	}

	/**
	 * Serialize a single standalone `Inputfield` into its `SchemaForm` node representation.
	 *
	 * @return array<string, mixed>
	 */
	public function serializeInputfieldNode(Inputfield $inputfield): array
	{
		$hiddenInputs = [];
		$values = [];
		$errors = [];
		$hasFileField = false;

		$this->serializeDepth++;
		try {
			return $this->serializeInputfield($inputfield, $hiddenInputs, $values, $errors, $hasFileField) ?? [];
		} finally {
			$this->serializeDepth = max(0, $this->serializeDepth - 1);
		}
	}

	/**
	 * Serialize a single `Inputfield` into a `SchemaForm` node.
	 *
	 * @param list<array{id?: string, name: string, value: string}> $hiddenInputs
	 * @param array<string, mixed> $values
	 * @param array<string, string> $errors
	 * @return array<string, mixed>|null
	 */
	private function serializeInputfield(
		Inputfield $inputfield,
		array &$hiddenInputs,
		array &$values,
		array &$errors,
		bool &$hasFileField,
	): ?array {
		if ((int) ($inputfield->collapsed ?? 0) === Inputfield::collapsedHidden) {
			return null;
		}

		if ($inputfield instanceof MarkupReactTab) {
			return $this->serializeTabGroup($inputfield, $hiddenInputs, $values, $errors, $hasFileField);
		}

		if ($inputfield instanceof InputfieldMarkup && $inputfield->children()->count() === 0) {
			return $this->serializeMarkupField($inputfield, $hiddenInputs, $values, $errors);
		}

		if ($inputfield instanceof InputfieldWrapper) {
			return $this->serializeSection($inputfield, $hiddenInputs, $values, $errors, $hasFileField);
		}

		if ($inputfield instanceof InputfieldSubmit) {
			return array_merge(
				['kind' => 'control', 'type' => 'submit'],
				$this->serializeSubmitField($inputfield),
			);
		}

		// Custom Inputfields exposing an embedded InputfieldWrapper (e.g. embedded blueprint fields)
		if (method_exists($inputfield, 'getEmbeddedFormWrapper')) {
			$embWrapper = $inputfield->getEmbeddedFormWrapper();
			if ($embWrapper instanceof InputfieldWrapper) {
				$embFields = $this->serializeChildren($embWrapper, $hiddenInputs, $values, $errors, $hasFileField);
				$hideWrap = (bool) $inputfield->get('hideWrap') || trim((string) $inputfield->get('embeddedStyle')) === 'inline';

				return array_merge($this->extractCommonFieldMeta($inputfield, $errors), [
					'kind' => 'section',
					'hideWrap' => $hideWrap,
					'collapsed' => $this->isCollapsed($inputfield),
					'fields' => $embFields,
				]);
			}
		}

		if ($inputfield instanceof InputfieldReactKeyValue) {
			$kvData = $inputfield->inertiaWithData();
			$common = $this->extractCommonFieldMeta($inputfield, $errors);
			$attrs = $inputfield->getAttributes();
			$isDynamicReadOnly = (bool) $inputfield->get('_rwDynamicReadOnly');
			$isLockedCollapsed = in_array((int) ($inputfield->collapsed ?? 0), [Inputfield::collapsedNoLocked, Inputfield::collapsedYesLocked], true);
			$disabled = !$isDynamicReadOnly && !empty($attrs['disabled']);
			$readOnly = $isLockedCollapsed || (!$isDynamicReadOnly && !empty($kvData['readOnly']));
			$validation = $this->extractValidationFromInputfield($inputfield, $common);
			$fieldName = (string) ($common['name'] !== '' ? $common['name'] : ($kvData['name'] ?? $inputfield->attr('name') ?? ''));
			$kvVal = is_array($kvData['value'] ?? null) ? $kvData['value'] : [];
			if ($fieldName !== '') {
				$values[$fieldName] = $kvVal;
			}

			return array_merge($common, [
				'kind' => 'control',
				'type' => 'keyvalue',
				'name' => $fieldName,
				'defaultValue' => $kvVal,
				'value' => $kvVal,
				'rows' => $kvData['rows'] ?? [],
				'keyLabel' => $kvData['keyLabel'] ?? 'Key',
				'valueLabel' => $kvData['valueLabel'] ?? 'Value',
				'keyPlaceholder' => $kvData['keyPlaceholder'] ?? $kvData['keyLabel'] ?? 'Key',
				'valuePlaceholder' => $kvData['valuePlaceholder'] ?? $kvData['valueLabel'] ?? 'Value',
				'addLabel' => $kvData['addLabel'] ?? 'Add Row',
				'removeLabel' => $kvData['removeLabel'] ?? 'Remove row',
				'minItems' => (int) ($kvData['minItems'] ?? $validation['minItems'] ?? 0),
				'maxItems' => (int) ($kvData['maxItems'] ?? $validation['maxItems'] ?? 0),
				'keyPattern' => $kvData['keyPattern'] ?? $validation['keyPattern'] ?? null,
				'keyPatternMessage' => $kvData['keyPatternMessage'] ?? (is_array($validation['messages'] ?? null) ? ($validation['messages']['keyPattern'] ?? null) : null),
				'allowEmptyValues' => array_key_exists('allowEmptyValues', $kvData) ? (bool) $kvData['allowEmptyValues'] : true,
				'disabled' => $disabled,
				'readOnly' => $readOnly,
				'validation' => $validation,
			]);
		}

		if ($inputfield instanceof InputfieldReactLink) {
			$common = $this->extractCommonFieldMeta($inputfield, $errors);
			$attrs = $inputfield->getAttributes();
			$isDynamicReadOnly = (bool) $inputfield->get('_rwDynamicReadOnly');
			$isLockedCollapsed = in_array((int) ($inputfield->collapsed ?? 0), [Inputfield::collapsedNoLocked, Inputfield::collapsedYesLocked], true);
			$disabled = !$isDynamicReadOnly && !empty($attrs['disabled']);
			$readOnly = $isLockedCollapsed || (!$isDynamicReadOnly && $inputfield->isEffectivelyReadOnly());
			$validation = $this->extractValidationFromInputfield($inputfield, $common);
			$fieldName = (string) ($common['name'] !== '' ? $common['name'] : ($inputfield->attr('name') ?? ''));
			$rawLinkCfg = $inputfield->buildRawLinkConfig();
			$rawLinkVal = $inputfield->get('linkValue') ?? $inputfield->getNormalizedLink();
			$base = array_merge($common, [
				'kind' => 'control',
				'name' => $fieldName,
				'disabled' => $disabled,
				'readOnly' => $readOnly,
				'validation' => $validation,
			]);
			$serializedLink = $this->serializeLinkControl(
				$base,
				$rawLinkCfg,
				$rawLinkVal,
				$readOnly || $disabled,
				$inputfield,
			);
			if ($fieldName !== '') {
				$values[$fieldName] = $serializedLink['value'];
			}

			return $serializedLink;
		}

		if ($inputfield instanceof InputfieldReactIcon) {
			$common = $this->extractCommonFieldMeta($inputfield, $errors);
			$attrs = $inputfield->getAttributes();
			$isDynamicReadOnly = (bool) $inputfield->get('_rwDynamicReadOnly');
			$isLockedCollapsed = in_array((int) ($inputfield->collapsed ?? 0), [Inputfield::collapsedNoLocked, Inputfield::collapsedYesLocked], true);
			$disabled = !$isDynamicReadOnly && !empty($attrs['disabled']);
			$readOnly = $isLockedCollapsed || (!$isDynamicReadOnly && $inputfield->isEffectivelyReadOnly());
			$validation = $this->extractValidationFromInputfield($inputfield, $common);
			$fieldName = (string) ($common['name'] !== '' ? $common['name'] : ($inputfield->attr('name') ?? ''));
			$iconCfg = $inputfield->buildIconConfig();
			$normIcon = IconManager::normalizeValue($inputfield->attr('value'));
			$iconVal = $iconCfg['allowCustomization']
				? ($normIcon['name'] !== '' ? $normIcon : '')
				: IconManager::encodeForStorage($normIcon, $iconCfg, $iconCfg['prefixMode']);
			if ($fieldName !== '') {
				$values[$fieldName] = $iconVal;
			}

			return array_merge($common, [
				'kind' => 'control',
				'type' => 'icon',
				'name' => $fieldName,
				'placeholder' => (string) ($attrs['placeholder'] ?? ''),
				'defaultValue' => $iconVal,
				'value' => $iconVal,
				'iconConfig' => $iconCfg,
				'disabled' => $disabled,
				'readOnly' => $readOnly,
				'validation' => $validation,
			]);
		}

		if ($inputfield instanceof AbstractInputfieldReactRelation) {
			$relData = $inputfield->inertiaWithData();
			$common = $this->extractCommonFieldMeta($inputfield, $errors);
			$validation = $this->extractValidationFromInputfield($inputfield, $common);
			$fieldName = (string) ($common['name'] !== '' ? $common['name'] : ($relData['name'] ?? ''));
			$relVal = $relData['value'] ?? (!empty($relData['multiple']) ? [] : '');
			if ($fieldName !== '' && ($relData['cardinality'] ?? '') !== 'o2m') {
				$values[$fieldName] = $relVal;
			}

			return array_merge($common, $relData, [
				'kind' => 'control',
				'type' => 'relation',
				'name' => $fieldName,
				'defaultValue' => $relVal,
				'value' => $relVal,
				'values' => is_array($relVal) ? $relVal : [],
				'validation' => $validation,
			]);
		}

		if ($inputfield instanceof InputfieldTiptap) {
			$ttData = $inputfield->inertiaWithData();
			$isDynamicReadOnly = (bool) $inputfield->get('_rwDynamicReadOnly');
			$isLockedCollapsed = in_array((int) ($inputfield->collapsed ?? 0), [Inputfield::collapsedNoLocked, Inputfield::collapsedYesLocked], true);
			if ($isDynamicReadOnly && !$isLockedCollapsed) {
				$ttData['disabled'] = false;
				$ttData['readOnly'] = (bool) $inputfield->getSetting('readOnly');
			} elseif ($isLockedCollapsed) {
				$ttData['readOnly'] = true;
			}
			$common = $this->extractCommonFieldMeta($inputfield, $errors);
			$validation = $this->extractValidationFromInputfield($inputfield, $common);
			$fieldName = (string) ($common['name'] !== '' ? $common['name'] : ($ttData['name'] ?? ''));
			$ttVal = (string) ($ttData['value'] ?? '');
			if ($fieldName !== '') {
				$values[$fieldName] = $ttVal;
			}
			if (!empty($ttData['useLanguages']) && isset($ttData['languages']) && is_array($ttData['languages'])) {
				foreach ($ttData['languages'] as $langEntry) {
					if (is_array($langEntry) && !empty($langEntry['inputName'])) {
						$values[(string) $langEntry['inputName']] = (string) ($langEntry['value'] ?? '');
					}
				}
			}

			return array_merge($common, $ttData, [
				'kind' => 'control',
				'type' => 'tiptap',
				'name' => $fieldName,
				'defaultValue' => $ttVal,
				'value' => $ttVal,
				'charCount' => !empty($ttData['showCount']),
				'charMax' => (int) ($ttData['maxLength'] ?? 0),
				'i18n' => !empty($ttData['useLanguages']) ? [
					'enabled' => true,
					'inheritLanguage' => $inputfield->get('inheritLanguage') !== null
						? (bool) $inputfield->get('inheritLanguage')
						: true,
					'languages' => $ttData['languages'],
				] : null,
				'validation' => $validation,
			]);
		}

		if ($inputfield instanceof InputfieldReact) {
			$inputfield->renderReady(null, false);
			$directIsland = $inputfield->toSchemaFormIsland();
			if (is_array($directIsland) && isset($directIsland['component'])) {
				return array_merge($this->extractCommonFieldMeta($inputfield, $errors), [
					'kind' => 'island',
					'component' => (string) $directIsland['component'],
					'props' => isset($directIsland['props']) && is_array($directIsland['props']) ? $directIsland['props'] : [],
				]);
			}

			$rendered = $inputfield->render();
			$cmpAttrPos = strpos($rendered, 'data-inertia-island="');
			$tagStart = $cmpAttrPos !== false ? strrpos(substr($rendered, 0, $cmpAttrPos), '<') : false;
			$openTagEnd = $tagStart !== false ? strpos($rendered, '>', $tagStart) : false;
			$rootTag = ($tagStart !== false && $openTagEnd !== false)
				? substr($rendered, $tagStart, $openTagEnd - $tagStart + 1)
				: '';
			$cmpStart = strpos($rootTag, 'data-inertia-island="');
			$propsStart = strpos($rootTag, 'data-props="');
			if ($cmpStart !== false && $propsStart !== false) {
				$cmpValOffset = $cmpStart + strlen('data-inertia-island="');
				$cmpEnd = strpos($rootTag, '"', $cmpValOffset);
				$propsValOffset = $propsStart + strlen('data-props="');
				$propsEnd = strpos($rootTag, '"', $propsValOffset);
				if ($cmpEnd !== false && $propsEnd !== false) {
					$rawCmp = substr($rootTag, $cmpValOffset, $cmpEnd - $cmpValOffset);
					$rawProps = substr($rootTag, $propsValOffset, $propsEnd - $propsValOffset);
					$decodedProps = json_decode(html_entity_decode($rawProps, ENT_QUOTES, 'UTF-8'), true, 32);

					return array_merge($this->extractCommonFieldMeta($inputfield, $errors), [
						'kind' => 'island',
						'component' => html_entity_decode($rawCmp, ENT_QUOTES, 'UTF-8'),
						'props' => is_array($decodedProps) ? $decodedProps : [],
					]);
				}
			}

			return array_merge($this->extractCommonFieldMeta($inputfield, $errors), [
				'kind' => 'markup',
				'html' => $rendered,
			]);
		}

		$shortClass = $this->shortClassName($inputfield);

		if ($inputfield instanceof InputfieldMarkup) {
			return $this->serializeMarkupField($inputfield, $hiddenInputs, $values, $errors);
		}

		if ($inputfield instanceof InputfieldFile || $shortClass === 'InputfieldFile' || $shortClass === 'InputfieldImage') {
			$hasFileField = true;
		}

		$control = $this->serializeNativeControl($inputfield, $errors);
		if ($control !== null) {
			$fieldName = (string) ($control['name'] ?? '');
			if ($fieldName !== '') {
				$ctrlType = (string) ($control['type'] ?? '');
				$isMediaField = self::isMediaControlType($ctrlType, $control);
				$isMultiValue = !empty($control['multiple']) || in_array($ctrlType, ['checkboxes', 'asmselect', 'multiselect', 'repeater'], true);
				if ($ctrlType === 'checkbox') {
					$values[$fieldName] = !empty($control['checked']) ? '1' : '';
				} elseif ($isMultiValue && isset($control['values']) && is_array($control['values'])) {
					$values[$fieldName] = $control['values'];
				} else {
					$values[$fieldName] = $control['value'] ?? '';
				}
				if ($isMediaField && ($values[$fieldName] === '' || $values[$fieldName] === [])) {
					$derivedFiles = self::extractFileNamesFromMediaList($control['files'] ?? null);
					if ($derivedFiles !== []) {
						$values[$fieldName] = $derivedFiles;
					}
				}
				if (!$isMediaField && !empty($control['useLanguages']) && isset($control['languages']) && is_array($control['languages'])) {
					foreach ($control['languages'] as $langEntry) {
						if (!is_array($langEntry)) {
							continue;
						}
						$langInputName = (string) ($langEntry['inputName'] ?? '');
						if ($langInputName !== '') {
							$values[$langInputName] = (string) ($langEntry['value'] ?? '');
						}
					}
				}
				if (in_array($ctrlType, ['image', 'file'], true) && isset($control['files']) && is_array($control['files'])) {
					foreach ($control['files'] as $mediaFileItem) {
						if (!is_array($mediaFileItem) || !isset($mediaFileItem['customValues']) || !is_array($mediaFileItem['customValues'])) {
							continue;
						}
						foreach ($mediaFileItem['customValues'] as $cfKey => $cfVal) {
							if (is_string($cfKey) && $cfKey !== '') {
								$values[$cfKey] = $cfVal;
							}
						}
					}
				}
			}

			return $control;
		}

		$fallbackHtml = $inputfield->render();
		$this->extractHiddenInputsFromHtml($fallbackHtml, $hiddenInputs, $values);

		return array_merge($this->extractCommonFieldMeta($inputfield, $errors), [
			'kind' => 'markup',
			'html' => $fallbackHtml,
		]);
	}

	/**
	 * Serialize a `MarkupReactTab` group or standalone tab pane.
	 *
	 * @param list<array{id?: string, name: string, value: string}> $hiddenInputs
	 * @param array<string, mixed> $values
	 * @param array<string, string> $errors
	 * @return array<string, mixed>
	 */
	private function serializeTabGroup(
		MarkupReactTab $tabField,
		array &$hiddenInputs,
		array &$values,
		array &$errors,
		bool &$hasFileField,
	): array {
		$children = $tabField->children();
		$hasChildTabPanes = false;
		foreach ($children as $child) {
			if ($child instanceof MarkupReactTab) {
				$hasChildTabPanes = true;
				break;
			}
		}

		$panes = $hasChildTabPanes ? $children : [$tabField];
		$tabs = [];
		$firstId = '';

		foreach ($panes as $idx => $pane) {
			if (!$pane instanceof MarkupReactTab) {
				continue;
			}
			if ((int) ($pane->collapsed ?? 0) === Inputfield::collapsedHidden) {
				continue;
			}
			$rawName = $this->strAttr($pane, 'name') ?: ($this->strAttr($pane, 'id') ?: ('tab_' . $idx));
			$tabId = (string) preg_replace('/[^a-zA-Z0-9_-]/', '_', $rawName);
			if ($firstId === '') {
				$firstId = $tabId;
			}
			$badgeRaw = $pane->get('badge');
			$badge = ($badgeRaw !== null && $badgeRaw !== '' && $badgeRaw !== false)
				? (is_numeric($badgeRaw) ? (int) $badgeRaw : (string) $badgeRaw)
				: null;

			$paneFields = $this->serializeChildren($pane, $hiddenInputs, $values, $errors, $hasFileField);
			$paneLabel = trim((string) ($pane->getSetting('label') ?: $pane->label ?: $rawName));
			$paneConditions = $this->extractConditionsFromInputfield($pane);
			$confirmDelete = (bool) $pane->get('confirmDelete')
				|| $this->findDataAttribute($pane->getAttributes(), 'confirm-delete') === '1'
				|| str_contains(strtolower($tabId), 'delete');

			$tabs[] = [
				'id' => $tabId,
				'name' => $rawName,
				'label' => $paneLabel,
				'icon' => $this->normalizeIcon((string) ($pane->icon ?: '')),
				'badge' => $badge,
				'description' => (string) ($pane->description ?? ''),
				'notes' => (string) ($pane->notes ?? ''),
				'collapsed' => $this->isCollapsed($pane),
				'showIf' => $paneConditions['show'],
				'hideIf' => $paneConditions['hide'],
				'conditions' => $paneConditions,
				'confirmDelete' => $confirmDelete,
				'fields' => $paneFields,
			];
		}

		$requestedActive = trim((string) ($tabField->get('activeTab') ?? ''));
		$activeTab = $firstId;
		if ($requestedActive !== '') {
			$cleanReq = (string) preg_replace('/[^a-zA-Z0-9_-]/', '_', $requestedActive);
			foreach ($tabs as $t) {
				if ($t['id'] === $cleanReq || $t['name'] === $requestedActive || str_ends_with((string) $t['id'], '_' . $cleanReq)) {
					$activeTab = (string) $t['id'];
					break;
				}
			}
		}

		$rawVariant = strtolower(trim((string) ($tabField->get('variant') ?? 'line')));
		$variant = in_array($rawVariant, ['line', 'segmented', 'pills', 'vertical'], true) ? $rawVariant : 'line';

		return array_merge($this->extractCommonFieldMeta($tabField, $errors), [
			'kind' => 'tabs',
			'variant' => $variant,
			'activeTab' => $activeTab,
			'tabs' => $tabs,
		]);
	}

	/**
	 * Serialize an `InputfieldWrapper` section.
	 *
	 * @param list<array{id?: string, name: string, value: string}> $hiddenInputs
	 * @param array<string, mixed> $values
	 * @param array<string, string> $errors
	 * @return array<string, mixed>
	 */
	private function serializeSection(
		InputfieldWrapper $section,
		array &$hiddenInputs,
		array &$values,
		array &$errors,
		bool &$hasFileField,
	): array {
		$children = $this->serializeChildren($section, $hiddenInputs, $values, $errors, $hasFileField);

		return array_merge($this->extractCommonFieldMeta($section, $errors), [
			'kind' => 'section',
			'collapsed' => $this->isCollapsed($section),
			'fields' => $children,
		]);
	}

	/**
	 * Serialize an `InputfieldSubmit` control and any dropdown action items.
	 *
	 * @return array<string, mixed>
	 */
	private function serializeSubmitField(InputfieldSubmit $inputfield): array
	{
		$attrs = $inputfield->getAttributes();
		$name = (string) ($attrs['name'] ?? 'submit');
		$id = (string) ($attrs['id'] ?? ('Inputfield_' . $name));
		$label = (string) ($attrs['value'] ?? $inputfield->label ?: 'Save');
		$classAttr = (string) ($attrs['class'] ?? '');
		$isDanger = str_contains($classAttr, 'danger') || str_contains($name, 'delete');

		$actions = [];
		try {
			$ref = new \ReflectionProperty($inputfield, 'dropdownItems');
			$rawItems = $ref->getValue($inputfield);
			if (is_array($rawItems)) {
				foreach ($rawItems as $item) {
					if (!is_array($item)) {
						continue;
					}
					$val = (string) ($item['value'] ?? '');
					if ($val === '') {
						continue;
					}
					$actions[] = [
						'value' => $val,
						'label' => html_entity_decode(strip_tags((string) ($item['label'] ?? $val)), ENT_QUOTES, 'UTF-8'),
						'icon' => $this->normalizeIcon((string) ($item['icon'] ?? '')),
					];
				}
			}
		} catch (\Throwable) {
			// Ignore if dropdownItems is unavailable
		}

		$conditions = $this->extractConditionsFromInputfield($inputfield);

		return [
			'id' => $id,
			'name' => $name,
			'label' => $label,
			'icon' => $this->normalizeIcon((string) ($inputfield->icon ?? '')),
			'header' => (bool) ($inputfield->getSetting('header') || $inputfield->get('header') || $inputfield->get('showInHeader') || str_contains($classAttr, 'pw-head-button')),
			'danger' => $isDanger,
			'disabled' => !empty($attrs['disabled']),
			'showIf' => $conditions['show'],
			'hideIf' => $conditions['hide'],
			'enableIf' => $conditions['enable'],
			'disableIf' => $conditions['disable'],
			'conditions' => $conditions,
			'actions' => $actions,
		];
	}

	/**
	 * Serialize a native ProcessWire `Inputfield` into a `ReactWorkspaceInputfield` control node.
	 *
	 * @param array<string, string> $errors
	 * @return array<string, mixed>|null
	 */
	private function serializeNativeControl(Inputfield $inputfield, array &$errors): ?array
	{
		$shortClass = $this->shortClassName($inputfield);
		$attrs = $inputfield->getAttributes();
		$name = (string) ($attrs['name'] ?? $inputfield->attr('name') ?? '');
		$id = (string) ($attrs['id'] ?? ($name !== '' ? 'Inputfield_' . $name : ''));

		$common = $this->extractCommonFieldMeta($inputfield, $errors);
		$isDynamicReadOnly = (bool) $inputfield->get('_rwDynamicReadOnly');
		$isLockedCollapsed = in_array((int) ($inputfield->collapsed ?? 0), [Inputfield::collapsedNoLocked, Inputfield::collapsedYesLocked], true);
		$disabled = !$isDynamicReadOnly && !empty($attrs['disabled']);
		$readOnly = $isLockedCollapsed || (!$isDynamicReadOnly && (!empty($attrs['readonly']) || (bool) $inputfield->getSetting('readOnly') || str_contains((string) ($inputfield->wrapClass ?? ''), 'readonly')));
		$placeholder = (string) ($attrs['placeholder'] ?? $inputfield->getSetting('placeholder') ?? '');
		$maxlength = (int) ($attrs['maxlength'] ?? $inputfield->getSetting('maxlength') ?? 0);
		$minlength = (int) ($attrs['minlength'] ?? $attrs['data-minlength'] ?? $inputfield->getSetting('minlength') ?? 0);
		$useLanguages = (bool) $inputfield->getSetting('useLanguages');
		$inheritLanguage = $inputfield->get('inheritLanguage') !== null
			? (bool) $inputfield->get('inheritLanguage')
			: true;

		$prefix = (string) $this->findDataAttribute($attrs, 'affix-prefix', '');
		$suffix = (string) $this->findDataAttribute($attrs, 'affix-suffix', '');
		$hasCharCount = $this->findDataAttribute($attrs, 'char-count') === '1'
			|| ((int) ($inputfield->getSetting('showCount') ?? 0)) > 0;
		$charMax = (int) $this->findDataAttribute($attrs, 'char-max', (string) $maxlength);
		$langTabs = $useLanguages ? $this->extractLanguageValues($inputfield) : [];

		$base = array_merge($common, [
			'kind' => 'control',
			'id' => $id,
			'name' => $name,
			'disabled' => $disabled,
			'readOnly' => $readOnly,
			'placeholder' => $placeholder,
			'maxLength' => $charMax > 0 ? $charMax : $maxlength,
			'minLength' => $minlength,
			'charCount' => $hasCharCount,
			'prefix' => $prefix,
			'suffix' => $suffix,
			'useLanguages' => $useLanguages,
			'languages' => $langTabs,
			'i18n' => $useLanguages ? [
				'enabled' => true,
				'inheritLanguage' => $inheritLanguage,
				'languages' => $langTabs,
			] : null,
		]);

		$control = null;

		if ($inputfield instanceof InputfieldTextarea || $shortClass === 'InputfieldTextarea') {
			$rwTextareaControl = $this->canonicalControlType($this->resolveInputfieldRwControl($inputfield, $attrs));
			$val = (string) ($attrs['value'] ?? $inputfield->val() ?? '');

			if ($rwTextareaControl === 'signature') {
				$control = array_merge($base, [
					'type' => 'signature',
					'defaultValue' => $val,
					'value' => $val,
				]);
			} elseif ($rwTextareaControl === 'condition_builder') {
				$normalizedCb = $this->normalizeConditionBuilderValue($inputfield->val() ?? $val);
				$control = array_merge($base, [
					'type' => 'condition_builder',
					'defaultValue' => $normalizedCb,
					'value' => $normalizedCb,
				]);
				$this->applyExtendedControlOptions('condition_builder', $control, $this->collectInputfieldExtendedBag($inputfield, $attrs), $rwTextareaControl);
			} elseif ($rwTextareaControl === 'repeater') {
				$rawRepeaterVal = $inputfield->val();
				$decodedRows = [];
				if (is_array($rawRepeaterVal)) {
					$decodedRows = array_values(array_filter($rawRepeaterVal, 'is_array'));
				} elseif (trim($val) !== '') {
					$parsedJson = json_decode($val, true, 32);
					if (is_array($parsedJson)) {
						$decodedRows = array_values(array_filter($parsedJson, 'is_array'));
					}
				}
				$rawSubfields = $inputfield->get('subfields');
				$subfields = [];
				if (is_array($rawSubfields)) {
					foreach ($rawSubfields as $sub) {
						if (is_array($sub) && isset($sub['name'])) {
							$subfields[] = [
								'name' => (string) $sub['name'],
								'type' => (string) ($sub['type'] ?? 'text'),
								'label' => (string) ($sub['label'] ?? $sub['name']),
								'placeholder' => (string) ($sub['placeholder'] ?? ''),
								'required' => !empty($sub['required']),
								'width' => (int) ($sub['width'] ?? 100),
								'options' => isset($sub['options']) && is_array($sub['options']) ? $sub['options'] : [],
							];
						}
					}
				}
				$control = array_merge($base, [
					'type' => 'repeater',
					'defaultValue' => $decodedRows,
					'value' => $decodedRows,
					'values' => $decodedRows,
					'subfields' => $subfields,
					'minRows' => (int) ($inputfield->get('minRows') ?? 0),
					'maxRows' => (int) ($inputfield->get('maxRows') ?? 25),
				]);
			} else {
				$codeLang = (string) $this->findDataAttribute($attrs, 'code-editor', '');
				$explicitMode = strtolower((string) ($inputfield->get('editorMode') ?? ''));
				$isMarkdown = $rwTextareaControl === 'markdown' || $this->findDataAttribute($attrs, 'md-editor') === '1' || $explicitMode === 'markdown';
				$isJson = $this->findDataAttribute($attrs, 'json-editor') === '1' || $explicitMode === 'json';
				$rows = (int) ($attrs['rows'] ?? $inputfield->getSetting('rows') ?? 5);

				$control = array_merge($base, [
					'type' => $isMarkdown ? 'markdown' : 'textarea',
					'defaultValue' => $val,
					'value' => $val,
					'rows' => $rows > 0 ? $rows : 5,
					'monospace' => !$isMarkdown && ($codeLang !== '' || $isJson || str_contains((string) ($attrs['class'] ?? ''), 'mono')),
					'editorMode' => $isMarkdown ? 'markdown' : ($isJson ? 'json' : ($codeLang !== '' ? 'code' : 'plain')),
					'codeLanguage' => $codeLang,
				]);
				if ($isMarkdown) {
					$this->applyExtendedControlOptions('markdown', $control, $this->collectInputfieldExtendedBag($inputfield, $attrs));
				}
			}
		} elseif ($inputfield instanceof InputfieldDatetime || $shortClass === 'InputfieldDatetime') {
			$rwDateControl = $this->canonicalControlType($this->resolveInputfieldRwControl($inputfield, $attrs));
			$rawVal = $attrs['value'] ?? $inputfield->val() ?? '';
			$dtBag = $this->collectInputfieldExtendedBag($inputfield, $attrs);

			if ($rwDateControl === 'daterange') {
				$normalizedRange = $this->normalizeDateRangeValue($rawVal);
				$control = array_merge($base, [
					'type' => 'daterange',
					'inputType' => 'text',
					'defaultValue' => $normalizedRange,
					'value' => $normalizedRange,
				]);
				$this->applyExtendedControlOptions('daterange', $control, $dtBag, $rwDateControl);
			} else {
				$dateFormat = (string) ($inputfield->getSetting('dateInputFormat') ?? 'Y-m-d');
				$timeFormat = trim((string) ($inputfield->getSetting('timeInputFormat') ?? ''));
				$hasTime = $timeFormat !== '';
				$hasDate = trim($dateFormat) !== '';
				if ($rwDateControl === 'time') {
					$hasDate = false;
					$hasTime = true;
				} elseif ($rwDateControl === 'date') {
					$hasDate = true;
					$hasTime = false;
				} elseif ($rwDateControl === 'datetime') {
					$hasDate = true;
					$hasTime = true;
				}

				if ($timeFormat !== '' && !array_key_exists('showSeconds', $dtBag) && !array_key_exists('show_seconds', $dtBag) && str_contains($timeFormat, 's')) {
					$dtBag['showSeconds'] = true;
				}
				if ($timeFormat !== '' && !array_key_exists('hourFormat', $dtBag) && !array_key_exists('hour_format', $dtBag) && preg_match('/[hgaA]/', $timeFormat) === 1) {
					$dtBag['hourFormat'] = '12h';
				}

				$resolvedDateType = ($hasDate && $hasTime) ? 'datetime' : ($hasTime && !$hasDate ? 'time' : 'date');
				$resolvedHtmlType = ($hasDate && $hasTime) ? 'datetime-local' : ($hasTime && !$hasDate ? 'time' : 'date');
				$showSeconds = !empty($dtBag['showSeconds'] ?? $dtBag['show_seconds'] ?? null);

				$formattedVal = '';
				if (is_int($rawVal) && $rawVal > 0) {
					$formattedVal = date(
						$resolvedDateType === 'datetime'
							? ($showSeconds ? 'Y-m-d\TH:i:s' : 'Y-m-d\TH:i')
							: ($resolvedDateType === 'time' ? ($showSeconds ? 'H:i:s' : 'H:i') : 'Y-m-d'),
						$rawVal,
					);
				} elseif (is_string($rawVal) && trim($rawVal) !== '') {
					$trimmed = trim($rawVal);
					if ($hasDate && $hasTime && preg_match('/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/', $trimmed) === 1) {
						$formattedVal = substr((string) preg_replace('/\s+/', 'T', $trimmed), 0, $showSeconds ? 19 : 16);
					} else {
						$formattedVal = $trimmed;
					}
				}

				$minDateAttr = $attrs['min'] ?? $inputfield->getSetting('minDate') ?? null;
				$maxDateAttr = $attrs['max'] ?? $inputfield->getSetting('maxDate') ?? null;

				$control = array_merge($base, [
					'type' => $resolvedDateType,
					'inputType' => $resolvedHtmlType,
					'defaultValue' => $formattedVal,
					'value' => $formattedVal,
					'min' => $minDateAttr !== null && $minDateAttr !== '' ? (string) $minDateAttr : null,
					'max' => $maxDateAttr !== null && $maxDateAttr !== '' ? (string) $maxDateAttr : null,
				]);
				$this->applyExtendedControlOptions($resolvedDateType, $control, $dtBag, $rwDateControl);
			}
		} elseif ($inputfield instanceof InputfieldToggle || $shortClass === 'InputfieldToggle') {
			$rawVal = $attrs['value'] ?? $inputfield->val() ?? 0;
			$useOther = (bool) $inputfield->getSetting('useOther');
			$yesLabel = (string) ($inputfield->getSetting('yesLabel') ?: $this->_('Yes'));
			$noLabel = (string) ($inputfield->getSetting('noLabel') ?: $this->_('No'));
			$otherLabel = (string) ($inputfield->getSetting('otherLabel') ?: $this->_('Other'));

			$options = [
				['value' => '1', 'label' => $yesLabel],
				['value' => '0', 'label' => $noLabel],
			];
			if ($useOther) {
				$options[] = ['value' => '2', 'label' => $otherLabel];
			}
			if ((bool) $inputfield->getSetting('useReverse')) {
				$options = array_reverse($options);
			}

			$valStr = is_scalar($rawVal) && (string) $rawVal !== '' ? (string) $rawVal : '0';
			$control = array_merge($base, [
				'type' => 'toggle',
				'defaultValue' => $valStr,
				'value' => $valStr,
				'options' => $options,
			]);
		} elseif ($inputfield instanceof InputfieldCheckbox || $shortClass === 'InputfieldCheckbox') {
			$checked = ($inputfield instanceof InputfieldCheckbox && $inputfield->isChecked())
				|| ($attrs['checked'] ?? '') === 'checked'
				|| (string) ($attrs['value'] ?? '') === (string) ($inputfield->getSetting('checkedValue') ?? '1');
			$checkedValue = (string) ($inputfield->getSetting('checkedValue') ?: '1');
			$checkboxLabel = trim((string) ($inputfield->getSetting('label2') ?: $inputfield->getSetting('checkboxLabel') ?: $inputfield->label ?: ''));
			$isConfirmDelete = $this->findDataAttribute($attrs, 'rw-confirm-delete') === '1'
				|| $this->findDataAttribute($attrs, 'confirm-delete') === '1'
				|| ($base['name'] ?? '') === 'delete_page';

			$control = array_merge($base, [
				'type' => 'checkbox',
				'defaultValue' => $checked ? $checkedValue : '',
				'checked' => $checked,
				'checkedValue' => $checkedValue,
				'checkboxLabel' => $checkboxLabel,
			], $isConfirmDelete ? ['confirmDelete' => true] : []);
		} elseif ($inputfield instanceof InputfieldPage || $shortClass === 'InputfieldPage') {
			$control = $this->serializeNativePageControl($inputfield, $base);
		} elseif (
			$inputfield instanceof InputfieldSelect
			|| in_array($shortClass, [
				'InputfieldSelect',
				'InputfieldRadios',
				'InputfieldCheckboxes',
				'InputfieldAsmSelect',
				'InputfieldSelectMultiple',
				'InputfieldTextTags',
			], true)
		) {
			$rawSelectControl = $this->resolveInputfieldRwControl($inputfield, $attrs);
			$rwSelectControl = $this->canonicalControlType($rawSelectControl);
			$isMultiple = $inputfield instanceof InputfieldHasArrayValue
				|| in_array($shortClass, ['InputfieldCheckboxes', 'InputfieldAsmSelect', 'InputfieldSelectMultiple', 'InputfieldTextTags'], true)
				|| (bool) ($inputfield->get('multiple') ?? $inputfield->getSetting('multiple'));
			$variant = match (true) {
				$rwSelectControl === 'segmented' => 'segmented',
				$rwSelectControl === 'combobox' => 'combobox',
				$rwSelectControl === 'tags', $shortClass === 'InputfieldTextTags' => 'tags',
				$shortClass === 'InputfieldRadios' => 'radios',
				$shortClass === 'InputfieldCheckboxes' => 'checkboxes',
				$shortClass === 'InputfieldAsmSelect' => 'asmselect',
				$shortClass === 'InputfieldSelectMultiple' => 'multiselect',
				default => $isMultiple ? 'multiselect' : 'select',
			};
			if ($variant === 'tags') {
				$isMultiple = true;
			} elseif ($variant === 'radios' || $variant === 'select') {
				$isMultiple = false;
			}

			$rawVal = $attrs['value'] ?? $inputfield->val();
			$selectedValues = [];
			if ($variant === 'tags') {
				$delimiter = (string) ($inputfield->getSetting('delimiter') ?? ($shortClass === 'InputfieldTextTags' ? ' ' : ','));
				$selectedValues = $this->normalizeTagListValue($rawVal, $delimiter);
			} elseif ($rawVal instanceof SelectableOption) {
				$selectedValues[] = (string) $rawVal->id;
			} elseif (is_iterable($rawVal)) {
				foreach ($rawVal as $v) {
					if ($v instanceof SelectableOption) {
						$selectedValues[] = (string) $v->id;
					} elseif (is_scalar($v)) {
						$selectedValues[] = (string) $v;
					}
				}
			} elseif (is_scalar($rawVal) && (string) $rawVal !== '') {
				$selectedValues[] = (string) $rawVal;
			}

			$options = $this->extractSelectOptions($inputfield);
			$optionColumns = (int) ($inputfield->getSetting('optionColumns') ?? 0);
			$selectBag = in_array($variant, ['tags', 'combobox', 'segmented'], true)
				? $this->collectInputfieldExtendedBag($inputfield, $attrs)
				: [];
			if ($variant === 'combobox' || $variant === 'segmented') {
				$rawStructuredOpts = $variant === 'segmented'
					? ($selectBag['segmentedOptions'] ?? $selectBag['comboboxOptions'] ?? $selectBag['options'] ?? null)
					: ($selectBag['comboboxOptions'] ?? $selectBag['segmentedOptions'] ?? $selectBag['options'] ?? null);
				if (is_array($rawStructuredOpts) && $rawStructuredOpts !== []) {
					$options = $this->mergeStructuredSelectOptions($options, $this->normalizeOptionItems($rawStructuredOpts));
				}
			}

			$control = array_merge($base, [
				'type' => $variant,
				'multiple' => $isMultiple,
				'defaultValue' => $isMultiple ? $selectedValues : ($selectedValues[0] ?? ''),
				'value' => ($variant === 'tags' || ($isMultiple && in_array($variant, ['combobox', 'segmented'], true)))
					? $selectedValues
					: ($selectedValues[0] ?? ''),
				'values' => $selectedValues,
				'options' => $options,
				'optionColumns' => $optionColumns,
			]);
			if (in_array($variant, ['tags', 'combobox', 'segmented'], true)) {
				if ($variant === 'tags') {
					$tagsList = self::normalizeMediaTokenList($selectBag['tagsList'] ?? $selectBag['suggestions'] ?? [], false);
					if ($tagsList !== []) {
						$selectBag['suggestions'] = $tagsList;
					}
					$allowUserTags = $inputfield->getSetting('allowUserTags');
					if ($allowUserTags !== null && !array_key_exists('allowCustom', $selectBag)) {
						$selectBag['allowCustom'] = (bool) $allowUserTags;
					}
				}
				$this->applyExtendedControlOptions($variant, $control, $selectBag, $rawSelectControl);
			}
		} elseif (in_array($shortClass, ['InputfieldInteger', 'InputfieldFloat', 'InputfieldDecimal'], true)) {
			$rawVal = $attrs['value'] ?? $inputfield->val() ?? '';
			$min = $attrs['min'] ?? $inputfield->getSetting('min');
			$max = $attrs['max'] ?? $inputfield->getSetting('max');
			$step = $attrs['step'] ?? $inputfield->getSetting('step') ?? ($shortClass === 'InputfieldInteger' ? '1' : 'any');
			$valStr = is_scalar($rawVal) ? (string) $rawVal : '';
			$rawRwControl = $this->resolveInputfieldRwControl($inputfield, $attrs);
			$rwControl = $this->canonicalControlType($rawRwControl);
			$rawInputType = strtolower((string) ($attrs['type'] ?? $inputfield->get('inputType') ?? ''));
			$valueMode = (string) (
				$this->findDataAttribute($attrs, 'rw-value-mode', '')
				?: ($inputfield->get('valueMode') ?? '')
			);
			$resolvedType = match (true) {
				$rwControl === 'colspan', $rawInputType === 'colspan' => 'colspan',
				$rwControl === 'range', $rawInputType === 'range' => 'range',
				$rwControl === 'range_slider' => 'range_slider',
				$rwControl === 'unit_number' => 'unit_number',
				$rwControl === 'rating' => 'rating',
				$rwControl === 'calculation' => 'calculation',
				default => 'number',
			};

			$extraNumericProps = [];
			$normalizedNumericVal = $valStr;
			$numBag = in_array($resolvedType, ['range_slider', 'unit_number'], true)
				? $this->collectInputfieldExtendedBag($inputfield, $attrs)
				: [];
			if ($resolvedType === 'rating') {
				$extraNumericProps['maxStars'] = max(2, min(10, (int) ($inputfield->get('maxStars') ?: $max ?: 5)));
			} elseif ($resolvedType === 'calculation') {
				$rawFormula = $inputfield->get('formula') ?? $inputfield->getSetting('formula') ?? $this->findDataAttribute($attrs, 'formula');
				$rawPrec = $inputfield->get('precision') ?? $inputfield->getSetting('precision') ?? $this->findDataAttribute($attrs, 'precision');
				$extraNumericProps['formula'] = is_scalar($rawFormula) ? (string) $rawFormula : '';
				$extraNumericProps['precision'] = is_numeric($rawPrec) ? (int) $rawPrec : 2;
			} elseif ($resolvedType === 'range_slider') {
				$normalizedNumericVal = $this->normalizeRangeSliderValue($rawVal);
			} elseif ($resolvedType === 'unit_number') {
				$fallbackUnit = $this->resolveUnitNumberFallbackUnit($numBag, $rawRwControl);
				$normalizedNumericVal = $this->normalizeUnitNumberValue($rawVal, $fallbackUnit);
			}

			$control = array_merge($base, [
				'type' => $resolvedType,
				'inputType' => in_array($resolvedType, ['range', 'colspan', 'range_slider'], true) ? 'range' : 'number',
				'defaultValue' => $normalizedNumericVal,
				'value' => $normalizedNumericVal,
				'min' => $min !== null && $min !== '' ? (string) $min : null,
				'max' => $max !== null && $max !== '' ? (string) $max : null,
				'step' => (string) $step,
				'valueMode' => $valueMode !== '' ? $valueMode : null,
			], $extraNumericProps);
			if (in_array($resolvedType, ['range_slider', 'unit_number'], true)) {
				$this->applyExtendedControlOptions($resolvedType, $control, $numBag, $rawRwControl);
			}
		} elseif (
			$inputfield instanceof InputfieldText
			|| in_array($shortClass, ['InputfieldText', 'InputfieldEmail', 'InputfieldURL', 'InputfieldPageTitle', 'InputfieldName'], true)
		) {
			$rawTextControl = $this->resolveInputfieldRwControl($inputfield, $attrs);
			$rwTextControl = $this->canonicalControlType($rawTextControl);
			if ($rwTextControl === 'link') {
				$rawLinkCfg = $inputfield->get('linkConfig');
				$rawLinkVal = $inputfield->get('linkValue') ?? $attrs['value'] ?? $inputfield->val();
				$control = $this->serializeLinkControl(
					$base,
					is_array($rawLinkCfg) ? $rawLinkCfg : [],
					$rawLinkVal,
					$readOnly || $disabled,
					$inputfield,
				);
			} elseif (in_array($rwTextControl, [
				'date',
				'time',
				'datetime',
				'phone',
				'color',
				'combobox',
				'segmented',
				'tags',
				'daterange',
				'unit_number',
				'spacing',
				'otp',
				'password',
				'range_slider',
				'markdown',
				'rating',
				'signature',
				'calculation',
				'condition_builder',
			], true)) {
				$control = $this->serializeExtendedTextInputfield($inputfield, $attrs, $base, $rwTextControl, $rawTextControl);
			} else {
				$rawType = strtolower((string) ($attrs['type'] ?? ''));
				if ($rawType === '') {
					$rawType = match ($shortClass) {
						'InputfieldEmail' => 'email',
						'InputfieldURL' => 'url',
						default => 'text',
					};
				}

				$slugFrom = (string) (
					$this->findDataAttribute($attrs, 'slug-from', '')
					?: $this->findDataAttribute($attrs, 'slug-source', '')
					?: ($inputfield->get('slugFrom') ?? $inputfield->get('connectedField') ?? '')
				);
				$slugSeparator = (string) ($this->findDataAttribute($attrs, 'slug-separator', '') ?: ($inputfield->get('slugSeparator') ?? '-'));
				$valStr = (string) ($attrs['value'] ?? $inputfield->val() ?? '');
				$allSlugPopulated = $useLanguages && $langTabs !== []
					? array_all($langTabs, static fn(array $lt): bool => trim((string) ($lt['value'] ?? '')) !== '')
					: trim($valStr) !== '';
				$slugLocked = $this->findDataAttribute($attrs, 'slug-locked') === '1'
					|| (bool) $inputfield->get('slugLocked')
					|| ($slugFrom !== '' && $allSlugPopulated);
				$secretMaskedAttr = $this->findDataAttribute($attrs, 'secret-masked');
				$isSecret = $secretMaskedAttr !== null || (bool) $inputfield->get('isSecret') || $rawType === 'password';
				$secretMeta = $this->resolveSecretSerializationMeta(
					$isSecret,
					$secretMaskedAttr ?? ($rawType === 'password' ? true : $inputfield->get('secretMasked')),
					$this->findDataAttribute($attrs, 'secret-prefix') ?? $inputfield->get('secretPrefix'),
					$this->findDataAttribute($attrs, 'secret-bytes') ?? $inputfield->get('secretBytes'),
					$this->findDataAttribute($attrs, 'secret-autogen')
						?? $inputfield->get('secretAutoGenerate')
						?? $inputfield->get('autoGenerate'),
				);

				$rawPattern = trim((string) ($attrs['pattern'] ?? $inputfield->getSetting('pattern') ?? ''));

				$control = array_merge($base, [
					'type' => 'text',
					'inputType' => $rawType,
					'defaultValue' => $valStr,
					'value' => $valStr,
					'pattern' => $rawPattern !== '' ? $rawPattern : null,
					'slugFrom' => $slugFrom !== '' ? $slugFrom : null,
					'slugSeparator' => $slugSeparator !== '' ? $slugSeparator : '-',
					'slugLocked' => $slugLocked,
				], $secretMeta);
			}
		} elseif ($inputfield instanceof InputfieldFile || $shortClass === 'InputfieldFile' || $shortClass === 'InputfieldImage') {
			$isImage = $inputfield instanceof InputfieldImage || $shortClass === 'InputfieldImage';
			$control = $this->serializeMediaField($inputfield, $base, $isImage);
		}

		if ($control === null) {
			return null;
		}

		$connection = $this->extractConnectionFromInputfield($inputfield, $control);
		$validation = $this->extractValidationFromInputfield($inputfield, $control);
		$control['connection'] = $connection;
		$control['validation'] = $validation;

		return $control;
	}

	/**
	 * Public entry point to serialize a standalone `InputfieldFile` / `InputfieldImage` (e.g. `InputfieldReactImage`
	 * or `InputfieldReactFile`) into its complete React island / `SchemaForm` prop payload.
	 *
	 * @return array<string, mixed>
	 */
	public function serializeMediaInputfield(Inputfield $inputfield, bool $isImage): array
	{
		$errors = [];
		$base = array_merge($this->extractCommonFieldMeta($inputfield, $errors), [
			'kind' => 'control',
		]);
		$control = $this->serializeMediaField($inputfield, $base, $isImage);
		$connection = $this->extractConnectionFromInputfield($inputfield, $control);
		$validation = $this->extractValidationFromInputfield($inputfield, $control);
		$control['connection'] = $connection;
		$control['validation'] = $validation;

		return $control;
	}

	/**
	 * Normalize string or array token lists (`extensions`, `tagsList`) without triggering PHP array-to-string notices.
	 *
	 * @return list<string>
	 */
	public static function normalizeMediaTokenList(mixed $raw, bool $lowercase = true): array
	{
		$tokens = [];
		$append = static function (string $value) use (&$tokens, $lowercase): void {
			foreach (preg_split('/[\s,]+/', trim($value)) ?: [] as $part) {
				$clean = $lowercase ? ltrim(strtolower($part), '.') : $part;
				if ($clean !== '' && !in_array($clean, $tokens, true)) {
					$tokens[] = $clean;
				}
			}
		};

		if (is_array($raw)) {
			foreach ($raw as $item) {
				if (is_scalar($item)) {
					$append((string) $item);
				}
			}
		} elseif (is_scalar($raw)) {
			$append((string) $raw);
		}

		return $tokens;
	}

	/**
	 * Serialize a ProcessWire `InputfieldFile` or `InputfieldImage` into a structured `file` / `image` control node.
	 *
	 * @param array<string, mixed> $base
	 * @return array<string, mixed>
	 */
	private function serializeMediaField(Inputfield $inputfield, array $base, bool $isImage): array
	{
		$name = (string) ($base['name'] ?? $inputfield->attr('name') ?? '');
		$gateway = React::instance($this)->media();
		$maxFiles = $gateway->resolveInputfieldMaxFiles($inputfield);
		$maxFilesize = (int) ($inputfield->getSetting('maxFilesize') ?? 0);
		$descriptionRows = (int) ($inputfield->getSetting('descriptionRows') ?? 1);
		$useTagsMode = (int) ($inputfield->getSetting('useTags') ?? 0);
		$useTags = $useTagsMode > 0;
		$tagsPredefinedOnly = ($useTagsMode & 8) !== 0 && ($useTagsMode & 1) === 0;
		$overwrite = (bool) $inputfield->getSetting('overwrite');
		$noUpload = (bool) $inputfield->getSetting('noUpload');
		$noLang = (bool) $inputfield->getSetting('noLang');
		$isReadOnly = !empty($base['readOnly']) || !empty($base['disabled']) || (bool) $inputfield->getSetting('readOnly');

		$tagsList = self::normalizeMediaTokenList(
			$inputfield->getSetting('tagsList') ?? ($inputfield->hasField?->get('tagsList') ?? ''),
			false,
		);

		$rawFocusSetting = $inputfield->getSetting('focusMode');
		if ($rawFocusSetting === false || $rawFocusSetting === 0 || $rawFocusSetting === '0') {
			$focusMode = 'off';
		} else {
			$rawFocusMode = strtolower(trim(is_scalar($rawFocusSetting) ? (string) $rawFocusSetting : ($isImage ? 'on' : 'off')));
			$focusMode = in_array($rawFocusMode, ['on', 'zoom', 'off'], true) ? $rawFocusMode : ($isImage ? 'on' : 'off');
		}

		$maxWidth = (int) ($inputfield->getSetting('maxWidth') ?? 0);
		$maxHeight = (int) ($inputfield->getSetting('maxHeight') ?? 0);
		$minWidth = (int) ($inputfield->getSetting('minWidth') ?? 0);
		$minHeight = (int) ($inputfield->getSetting('minHeight') ?? 0);
		$maxReject = (bool) $inputfield->getSetting('maxReject');
		$dimensionsByAspectRatio = (bool) $inputfield->getSetting('dimensionsByAspectRatio');
		$clientQuality = max(10, min(100, (int) ($inputfield->getSetting('clientQuality') ?? 90)));
		$resizeServer = (bool) $inputfield->getSetting('resizeServer');
		$useImageEditor = $isImage && ((int) ($inputfield->getSetting('useImageEditor') ?? 1) > 0);
		$rawGridSetting = $inputfield->getSetting('gridMode');
		$rawGridMode = strtolower(trim(is_scalar($rawGridSetting) ? (string) $rawGridSetting : 'grid'));
		$gridMode = ($rawGridMode === 'list' || $rawGridMode === 'table') ? 'table' : 'grid';
		$rawGridRatioSetting = $inputfield->getSetting('gridRatio') ?? $inputfield->hasField?->get('gridRatio') ?? '4:3';
		$rawGridRatio = strtolower(trim(is_scalar($rawGridRatioSetting) ? (string) $rawGridRatioSetting : '4:3'));
		$gridRatio = in_array($rawGridRatio, ['auto', '1:1', '4:3', '16:9', '3:4', '21:9'], true) ? $rawGridRatio : '4:3';
		$minFiles = max(0, (int) (
			$inputfield->getSetting('minFiles')
			?? $inputfield->getSetting('minItems')
			?? $inputfield->hasField?->get('minFiles')
			?? $inputfield->hasField?->get('minItems')
			?? 0
		));

		$extensions = $gateway->resolveAllowedExtensions($inputfield, [], $isImage);
		$accept = $extensions !== []
			? implode(',', array_map(static fn(string $ext): string => '.' . ltrim($ext, '.'), $extensions))
			: ($isImage ? 'image/*' : '');

		$val = $inputfield->val();
		$postUrl = '';
		$dataFieldName = $name;
		$hostPage = null;

		if ($val instanceof Pagefiles || $val instanceof Pagefile) {
			$hostPage = $val->page;
			if ($hostPage !== null && method_exists($hostPage, 'editUrl')) {
				try {
					$postUrl = (string) $hostPage->editUrl();
				} catch (\Throwable) {
					$postUrl = '';
				}
			}
			if ($val->field !== null && (string) $val->field->name !== '') {
				$dataFieldName = (string) $val->field->name;
			}
		} else {
			$hostPage = $inputfield->hasPage;
			if ($hostPage !== null && method_exists($hostPage, 'editUrl')) {
				try {
					$postUrl = (string) $hostPage->editUrl();
				} catch (\Throwable) {
					$postUrl = '';
				}
			}
			$hasField = $inputfield->hasField;
			if ($hasField instanceof \ProcessWire\Field && (string) $hasField->name !== '') {
				$dataFieldName = (string) $hasField->name;
			} elseif (is_string($hasField) && $hasField !== '') {
				$dataFieldName = $hasField;
			}
		}

		$isPhysicalPageHost = $hostPage instanceof \ProcessWire\Page
			&& !($hostPage instanceof \ProcessWire\NullPage)
			&& (int) $hostPage->id > 0
			&& !method_exists($hostPage, 'getEntryUuid');

		$user = $this->wire()->user;
		if ($useImageEditor && $isPhysicalPageHost && !$user->isSuperuser()) {
			$permissions = $this->wire()->permissions;
			$rootPage = $hostPage;
			while ($rootPage instanceof \ProcessWire\RepeaterPage) {
				$forPage = $rootPage->getForPage();
				if (!$forPage instanceof \ProcessWire\Page || $forPage->id <= 0) {
					break;
				}
				$rootPage = $forPage;
			}
			if ($permissions->has('page-edit-images') && !$user->hasPermission('page-edit-images', $rootPage)) {
				$useImageEditor = false;
			}
		}

		$languages = !$noLang ? $this->wire()->languages : null;
		$files = [];
		if ($val instanceof Pagefiles) {
			$files = $gateway->serializeCollection($val, $inputfield, $name, $noLang, false);
		} elseif ($val instanceof Pagefile) {
			$files = [$gateway->serializeMediaItem($val, $inputfield, $name, 0, $noLang, true)];
		}

		$hasCustomFields = false;
		foreach ($files as $fItem) {
			if (!empty($fItem['customFields'])) {
				$hasCustomFields = true;
				break;
			}
		}
		if (!$hasCustomFields) {
			if ($val instanceof Pagefiles) {
				try {
					$hasCustomFields = $val->getFieldsTemplate() !== null;
				} catch (\Throwable) {
					$hasCustomFields = false;
				}
			} elseif ($inputfield->hasField instanceof \ProcessWire\Field && (string) $inputfield->hasField->name !== '') {
				$hasCustomFields = $this->wire()->templates->get('field-' . $inputfield->hasField->name) !== null;
			}
		}

		$rootUrl = rtrim((string) ($this->wire()->config->urls->root ?: '/'), '/') . '/';
		$mediaEndpoint = $rootUrl . '_react/media';
		$mediaToken = '';
		$mediaOwnerId = '';
		if (AccessGuard::isAuthenticated($user)) {
			$envelope = $gateway->buildEnvelopeFromInputfield($inputfield, $isImage, $name, $extensions, $isReadOnly);
			if ($envelope !== null) {
				$mediaToken = $gateway->sign($envelope, (int) $user->id);
				$mediaOwnerId = (string) ($envelope['entryUuid'] ?? $envelope['ownerId'] ?? '');
			}
		}

		$langTabs = [];
		if (is_iterable($languages)) {
			foreach ($languages as $lang) {
				if (!$lang instanceof Language) {
					continue;
				}
				$isDef = $lang->isDefault();
				$langId = (int) $lang->id;
				$langEditable = true;
				if ($isPhysicalPageHost && is_object($languages) && method_exists($languages, 'editable')) {
					try {
						$langEditable = (bool) $languages->editable($lang);
					} catch (\Throwable) {
						$langEditable = true;
					}
				}
				$langTabs[] = [
					'id' => $langId,
					'name' => (string) $lang->name,
					'title' => (string) ($lang->get('title|name') ?: $lang->name),
					'isDefault' => $isDef,
					'editable' => $langEditable,
					'inputName' => $isDef ? $name : "{$name}__{$langId}",
					'value' => '',
				];
			}
		}

		$fileNames = array_values(array_map(static fn(array $f): string => (string) $f['name'], $files));

		return array_merge($base, [
			'type' => $isImage ? 'image' : 'file',
			'isFile' => true,
			'isImage' => $isImage,
			'accept' => $accept,
			'extensions' => $extensions,
			'minFiles' => $minFiles,
			'maxFiles' => $maxFiles,
			'maxFilesize' => $maxFilesize,
			'multiple' => $maxFiles !== 1 && ($inputfield->getSetting('multiple') !== false),
			'overwrite' => $overwrite,
			'noUpload' => $noUpload,
			'descriptionRows' => $descriptionRows,
			'useTags' => $useTags,
			'tagsPredefinedOnly' => $tagsPredefinedOnly,
			'tagsList' => $tagsList,
			'focusMode' => $focusMode,
			'maxWidth' => $maxWidth,
			'maxHeight' => $maxHeight,
			'minWidth' => $minWidth,
			'minHeight' => $minHeight,
			'maxReject' => $maxReject,
			'dimensionsByAspectRatio' => $dimensionsByAspectRatio,
			'clientQuality' => $clientQuality,
			'resizeServer' => $resizeServer,
			'useImageEditor' => $useImageEditor,
			'gridMode' => $gridMode,
			'gridRatio' => $gridRatio,
			'hasCustomFields' => $hasCustomFields,
			'uploadUrl' => $postUrl,
			'uploadFieldName' => $dataFieldName !== '' ? $dataFieldName : $name,
			'mediaEndpoint' => $mediaEndpoint,
			'mediaToken' => $mediaToken,
			'ownerId' => $mediaOwnerId !== '' ? $mediaOwnerId : null,
			'files' => $files,
			'useLanguages' => count($langTabs) > 1,
			'languages' => count($langTabs) > 1 ? $langTabs : [],
			'defaultValue' => $fileNames,
			'value' => $fileNames,
		]);
	}

	/**
	 * Extract common metadata (`id`, `name`, `label`, `description`, `notes`, `icon`, `required`, `width`, `showIf`, `requiredIf`, `conditions`, `error`) from an `Inputfield`.
	 *
	 * @param array<string, string> $errors
	 * @return array<string, mixed>
	 */
	private function extractCommonFieldMeta(Inputfield $inputfield, array &$errors): array
	{
		$attrs = $inputfield->getAttributes();
		$name = (string) ($attrs['name'] ?? $inputfield->attr('name') ?? '');
		$id = (string) ($attrs['id'] ?? ($name !== '' ? 'Inputfield_' . $name : ''));
		$width = (int) ($inputfield->getSetting('columnWidth') ?? 100);
		if ($width <= 0 || $width > 100) {
			$width = 100;
		}
		$rawColSpan = $inputfield->getSetting('colSpan') ?? $inputfield->get('colSpan') ?? $this->findDataAttribute($attrs, 'col-span');
		$colSpan = is_numeric($rawColSpan) ? max(1, min(12, (int) $rawColSpan)) : null;

		$fieldErrors = [];
		foreach ($inputfield->getErrors() as $err) {
			$cleanErr = trim(strip_tags((string) $err));
			if ($cleanErr !== '') {
				$fieldErrors[] = $cleanErr;
			}
		}
		if ($name !== '' && isset($errors[$name]) && $errors[$name] !== '' && !in_array($errors[$name], $fieldErrors, true)) {
			$fieldErrors[] = $errors[$name];
		}
		$errorStr = implode(' ', $fieldErrors);
		if ($name !== '' && $errorStr !== '') {
			$errors[$name] = $errorStr;
		}

		$rawLabel = (string) ($inputfield->getSetting('label') ?? '');
		$skipLabelFlags = (int) ($inputfield->skipLabel ?? 0);
		$suppressFallbackLabel = $inputfield instanceof MarkupReactTab
			|| (($skipLabelFlags & (Inputfield::skipLabelHeader | Inputfield::skipLabelMarkup | Inputfield::skipLabelBlank)) !== 0);
		$label = $suppressFallbackLabel ? $rawLabel : (string) ($rawLabel !== '' ? $rawLabel : ($inputfield->label ?? ''));
		if ($label !== '' && preg_match('/^(?:rwtabgrp_|rwtab_|tabgrp_|tab_)/i', $label) === 1) {
			$label = '';
		}

		$conditions = $this->extractConditionsFromInputfield($inputfield);
		$inlineSettings = self::normalizeStringList(
			$inputfield->getSetting('inlineSettings')
				?? $inputfield->get('inlineSettings')
				?? $this->findDataAttribute($attrs, 'inline-settings', '')
		);
		$inlineHidden = (bool) (
			$inputfield->getSetting('inlineHidden')
			?? $inputfield->get('inlineHidden')
			?? ($this->findDataAttribute($attrs, 'inline-hidden') === '1')
		);
		$noWrap = (bool) (
			$inputfield->getSetting('noWrap')
			?? $inputfield->get('noWrap')
			?? ($this->findDataAttribute($attrs, 'no-wrap') === '1')
		);

		$meta = [
			'id' => $id,
			'name' => $name,
			'label' => $label,
			'description' => (string) ($inputfield->description ?? ''),
			'notes' => (string) ($inputfield->notes ?? ''),
			'detail' => (string) ($inputfield->detail ?? ''),
			'icon' => $this->normalizeIcon((string) ($inputfield->icon ?? '')),
			'required' => (bool) $inputfield->getSetting('required') || $conditions['require'] !== '',
			'width' => $width,
			'colSpan' => $colSpan,
			'collapsed' => $this->isCollapsed($inputfield),
			'noWrap' => $noWrap,
			'inlineSettings' => $inlineSettings,
			'inlineHidden' => $inlineHidden,
			'showIf' => $conditions['show'],
			'hideIf' => $conditions['hide'],
			'enableIf' => $conditions['enable'],
			'disableIf' => $conditions['disable'],
			'requiredIf' => $conditions['require'],
			'conditions' => $conditions,
			'error' => $errorStr,
		];
		$resetValue = $inputfield->getSetting('resetValue') ?? $inputfield->get('resetValue');
		if ($resetValue !== null) {
			$meta['resetValue'] = $resetValue;
		}

		return $meta;
	}

	/**
	 * Normalize a condition specification (selector string, `['field' => ..., 'operator' => ..., 'value' => ...]`,
	 * list of rule objects, or associative `['field' => 'value']` map) into a ProcessWire selector string.
	 */
	public static function normalizeConditionExpression(mixed $raw): string
	{
		if (is_string($raw)) {
			return trim($raw);
		}
		if (!is_array($raw) || $raw === []) {
			return '';
		}

		$formatSingleRule = static function (string $field, string $op, mixed $val): string {
			$cleanField = trim($field);
			if ($cleanField === '') {
				return '';
			}
			$cleanOp = trim($op);
			if ($cleanOp === '' || $cleanOp === '==' || $cleanOp === '===') {
				$cleanOp = '=';
			} elseif ($cleanOp === '!==') {
				$cleanOp = '!=';
			}
			if (is_array($val)) {
				$valStr = implode('|', array_map(
					static fn($item): string => is_bool($item) ? ($item ? '1' : '0') : (string) $item,
					$val
				));
			} elseif (is_bool($val)) {
				$valStr = $val ? '1' : '0';
			} elseif ($val === null) {
				$valStr = '';
			} else {
				$valStr = (string) $val;
			}

			return $cleanField . $cleanOp . $valStr;
		};

		if (isset($raw['field']) && is_string($raw['field'])) {
			return $formatSingleRule(
				$raw['field'],
				isset($raw['operator']) && is_string($raw['operator']) ? $raw['operator'] : '=',
				$raw['value'] ?? ''
			);
		}

		$clauses = [];
		if (array_is_list($raw)) {
			foreach ($raw as $entry) {
				if (is_string($entry) && trim($entry) !== '') {
					$clauses[] = trim($entry);
				} elseif (is_array($entry) && isset($entry['field']) && is_string($entry['field'])) {
					$built = $formatSingleRule(
						$entry['field'],
						isset($entry['operator']) && is_string($entry['operator']) ? $entry['operator'] : '=',
						$entry['value'] ?? ''
					);
					if ($built !== '') {
						$clauses[] = $built;
					}
				}
			}

			return implode(', ', $clauses);
		}

		foreach ($raw as $fieldKey => $expectedVal) {
			if (!is_string($fieldKey) || trim($fieldKey) === '') {
				continue;
			}
			$built = $formatSingleRule($fieldKey, '=', $expectedVal);
			if ($built !== '') {
				$clauses[] = $built;
			}
		}

		return implode(', ', $clauses);
	}

	/**
	 * Extract normalized conditional state expressions (`show`, `hide`, `enable`, `disable`, `require`) from a declarative field array.
	 *
	 * @param array<string, mixed> $raw
	 * @return array{show: string, hide: string, enable: string, disable: string, require: string}
	 */
	private function extractConditionsFromRaw(array $raw): array
	{
		$condMap = isset($raw['conditions']) && is_array($raw['conditions']) ? $raw['conditions'] : [];

		$rawShow = $condMap['show'] ?? $condMap['showIf'] ?? $raw['show'] ?? $raw['showIf'] ?? $raw['show_if'] ?? '';
		$rawHide = $condMap['hide'] ?? $condMap['hideIf'] ?? $raw['hide'] ?? $raw['hideIf'] ?? $raw['hide_if'] ?? '';
		$rawEnable = $condMap['enable'] ?? $condMap['enableIf'] ?? $raw['enable'] ?? $raw['enableIf'] ?? $raw['enable_if'] ?? '';
		$rawDisable = $condMap['disable']
			?? $condMap['disableIf']
			?? $condMap['readOnlyIf']
			?? $raw['disable']
			?? $raw['disableIf']
			?? $raw['disable_if']
			?? $raw['readOnlyIf']
			?? $raw['read_only_if']
			?? '';
		$rawRequire = $condMap['require']
			?? $condMap['requiredIf']
			?? $raw['require']
			?? $raw['requiredIf']
			?? $raw['required_if']
			?? (is_string($raw['required'] ?? null) && !in_array(strtolower(trim($raw['required'])), ['0', '1', 'true', 'false'], true) ? $raw['required'] : '');

		return [
			'show' => self::normalizeConditionExpression($rawShow),
			'hide' => self::normalizeConditionExpression($rawHide),
			'enable' => self::normalizeConditionExpression($rawEnable),
			'disable' => self::normalizeConditionExpression($rawDisable),
			'require' => self::normalizeConditionExpression($rawRequire),
		];
	}

	/**
	 * Extract normalized conditional state expressions (`show`, `hide`, `enable`, `disable`, `require`) from a ProcessWire `Inputfield`.
	 *
	 * @return array{show: string, hide: string, enable: string, disable: string, require: string}
	 */
	private function extractConditionsFromInputfield(Inputfield $inputfield): array
	{
		$attrs = $inputfield->getAttributes();
		$condMap = $inputfield->get('_rwConditions') ?? $inputfield->get('conditions');
		$condArr = is_array($condMap) ? $condMap : [];

		$rawShow = $condArr['show']
			?? $condArr['showIf']
			?? $inputfield->getSetting('showIf')
			?? $inputfield->get('showIf')
			?? $inputfield->get('show')
			?? $this->findDataAttribute($attrs, 'show-if', '')
			?? '';
		$rawHide = $condArr['hide']
			?? $condArr['hideIf']
			?? $inputfield->getSetting('hideIf')
			?? $inputfield->get('hideIf')
			?? $inputfield->get('hide')
			?? $this->findDataAttribute($attrs, 'hide-if', '')
			?? '';
		$rawEnable = $condArr['enable']
			?? $condArr['enableIf']
			?? $inputfield->getSetting('enableIf')
			?? $inputfield->get('enableIf')
			?? $inputfield->get('enable')
			?? $this->findDataAttribute($attrs, 'enable-if', '')
			?? '';
		$rawDisable = $condArr['disable']
			?? $condArr['disableIf']
			?? $condArr['readOnlyIf']
			?? $inputfield->getSetting('disableIf')
			?? $inputfield->getSetting('readOnlyIf')
			?? $inputfield->get('disableIf')
			?? $inputfield->get('readOnlyIf')
			?? $inputfield->get('disable')
			?? $this->findDataAttribute($attrs, 'disable-if', '')
			?? $this->findDataAttribute($attrs, 'readonly-if', '')
			?? '';
		$rawRequire = $condArr['require']
			?? $condArr['requiredIf']
			?? $inputfield->getSetting('requiredIf')
			?? $inputfield->get('requiredIf')
			?? $inputfield->get('require')
			?? $this->findDataAttribute($attrs, 'required-if', '')
			?? '';

		return [
			'show' => self::normalizeConditionExpression($rawShow),
			'hide' => self::normalizeConditionExpression($rawHide),
			'enable' => self::normalizeConditionExpression($rawEnable),
			'disable' => self::normalizeConditionExpression($rawDisable),
			'require' => self::normalizeConditionExpression($rawRequire),
		];
	}

	/**
	 * Normalize `valibot` validation rules from a declarative field specification.
	 *
	 * Supports both flat rules (`minLength: 3`) and structured rule objects (`minLength: ['value' => 3, 'message' => 'Too short']`).
	 *
	 * @param array<string, mixed> $raw
	 * @param array{show: string, hide: string, enable: string, disable: string, require: string} $conditions
	 * @return array<string, mixed>
	 */
	public function normalizeValidationRules(array $raw, array $conditions = ['show' => '', 'hide' => '', 'enable' => '', 'disable' => '', 'require' => '']): array
	{
		$nestedRules = [];
		if (isset($raw['rules']) && is_array($raw['rules'])) {
			$nestedRules = array_merge($nestedRules, $raw['rules']);
		}
		if (isset($raw['validation']) && is_array($raw['validation'])) {
			$nestedRules = array_merge($nestedRules, $raw['validation']);
		}

		/** @var array<string, string> $messages */
		$messages = [];
		if (isset($raw['messages']) && is_array($raw['messages'])) {
			foreach ($raw['messages'] as $mk => $mv) {
				if (is_string($mk) && is_scalar($mv) && trim((string) $mv) !== '') {
					$messages[$mk] = trim((string) $mv);
				}
			}
		}
		if (isset($nestedRules['messages']) && is_array($nestedRules['messages'])) {
			foreach ($nestedRules['messages'] as $mk => $mv) {
				if (is_string($mk) && is_scalar($mv) && trim((string) $mv) !== '') {
					$messages[$mk] = trim((string) $mv);
				}
			}
		}

		$unwrapRule = static function (string $ruleKey, mixed $candidate) use (&$messages): mixed {
			if (is_array($candidate) && array_key_exists('value', $candidate)) {
				if (isset($candidate['message']) && is_scalar($candidate['message']) && trim((string) $candidate['message']) !== '') {
					$messages[$ruleKey] = trim((string) $candidate['message']);
				}
				return $candidate['value'];
			}
			return $candidate;
		};

		$pickRule = static function (string $canonicalKey, array $aliases) use ($nestedRules, $raw, $unwrapRule): mixed {
			foreach ($aliases as $alias) {
				if (array_key_exists($alias, $nestedRules)) {
					return $unwrapRule($canonicalKey, $nestedRules[$alias]);
				}
			}
			foreach ($aliases as $alias) {
				if (array_key_exists($alias, $raw)) {
					return $unwrapRule($canonicalKey, $raw[$alias]);
				}
			}
			return null;
		};

		$rawReq = $pickRule('required', ['required']);
		$required = false;
		if (is_string($rawReq)) {
			$trimmedReq = trim($rawReq);
			$lowerReq = strtolower($trimmedReq);
			if ($lowerReq === 'true' || $trimmedReq === '1') {
				$required = true;
			} elseif ($lowerReq !== 'false' && $trimmedReq !== '0' && $trimmedReq !== '') {
				$required = true;
				if (!str_contains($trimmedReq, '=') && !str_contains($trimmedReq, '>') && !str_contains($trimmedReq, '<')) {
					$messages['required'] = $trimmedReq;
				}
			}
		} else {
			$required = (bool) $rawReq;
		}
		if ($conditions['require'] !== '') {
			$required = true;
		}

		$minLengthRaw = $pickRule('minLength', ['minLength', 'minlength', 'min_length']);
		$maxLengthRaw = $pickRule('maxLength', ['maxLength', 'maxlength', 'max_length']);
		$lengthRaw = $pickRule('length', ['length', 'exactLength']);
		$minRaw = $pickRule('min', ['min', 'minValue', 'min_value']);
		$maxRaw = $pickRule('max', ['max', 'maxValue', 'max_value']);
		$stepRaw = $pickRule('step', ['step']);
		$patternRaw = $pickRule('pattern', ['pattern', 'regex', 'validationRegex', 'validation_regex']);
		$formatRaw = $pickRule('format', ['format', 'validator']);

		$supportedFormats = [
			'email', 'url', 'uuid', 'ip', 'ipv4', 'ipv6',
			'isoDate', 'isoDateTime', 'isoTime', 'hexColor',
			'slug', 'alpha', 'alphanumeric', 'numeric', 'digits', 'json', 'creditCard',
		];
		$format = is_string($formatRaw) && trim($formatRaw) !== '' ? trim($formatRaw) : null;
		if ($format === null) {
			foreach ($supportedFormats as $fmtKey) {
				$flagCand = $nestedRules[$fmtKey] ?? $raw[$fmtKey] ?? null;
				if ($flagCand === true || $flagCand === 1 || $flagCand === '1') {
					$format = $fmtKey;
					break;
				}
				if (is_string($flagCand) && trim($flagCand) !== '' && strtolower(trim($flagCand)) !== 'false') {
					$format = $fmtKey;
					$messages['format'] = trim($flagCand);
					$messages[$fmtKey] = trim($flagCand);
					break;
				}
				if (is_array($flagCand) && !empty($flagCand['value'])) {
					$format = $fmtKey;
					if (isset($flagCand['message']) && is_scalar($flagCand['message'])) {
						$messages['format'] = trim((string) $flagCand['message']);
						$messages[$fmtKey] = trim((string) $flagCand['message']);
					}
					break;
				}
			}
		}
		if ($format === null) {
			$fieldType = strtolower(trim((string) ($raw['type'] ?? $raw['field_type'] ?? '')));
			$inputType = strtolower(trim((string) ($raw['inputType'] ?? '')));
			$editorMode = strtolower(trim((string) ($raw['editorMode'] ?? '')));
			if ($fieldType === 'email' || $inputType === 'email') {
				$format = 'email';
			} elseif ($fieldType === 'url' || $inputType === 'url') {
				$format = 'url';
			} elseif ($fieldType === 'slug') {
				$format = 'slug';
			} elseif ($fieldType === 'json' || $editorMode === 'json') {
				$format = 'json';
			}
		}

		$normalizeStringList = static function (mixed $cand): ?array {
			if (is_string($cand) && trim($cand) !== '') {
				return array_values(array_filter(array_map('trim', explode(',', $cand)), static fn(string $s): bool => $s !== ''));
			}
			if (is_array($cand) && $cand !== []) {
				$out = [];
				foreach ($cand as $item) {
					if (is_scalar($item) && trim((string) $item) !== '') {
						$out[] = trim((string) $item);
					}
				}
				return $out !== [] ? $out : null;
			}
			return null;
		};

		$startsWithRaw = $pickRule('startsWith', ['startsWith', 'starts_with']);
		$endsWithRaw = $pickRule('endsWith', ['endsWith', 'ends_with']);
		$includesRaw = $pickRule('includes', ['includes', 'contains']);
		$excludesRaw = $pickRule('excludes', ['excludes', 'notContains', 'not_contains']);
		$inRaw = $pickRule('in', ['in', 'oneOf', 'enum', 'allowedValues']);
		$notInRaw = $pickRule('notIn', ['notIn', 'notOneOf', 'disallowedValues']);

		$equalsFieldRaw = $pickRule('equalsField', ['equalsField', 'sameAs', 'matchField', 'match_field', 'confirmed']);
		$differentFromRaw = $pickRule('differentFrom', ['differentFrom', 'different_from', 'notMatchField']);
		$gtFieldRaw = $pickRule('gtField', ['gtField', 'gt_field']);
		$gteFieldRaw = $pickRule('gteField', ['gteField', 'gte_field', 'afterField', 'minField']);
		$ltFieldRaw = $pickRule('ltField', ['ltField', 'lt_field']);
		$lteFieldRaw = $pickRule('lteField', ['lteField', 'lte_field', 'beforeField', 'maxField']);

		$minItemsRaw = $pickRule('minItems', ['minItems', 'minRows', 'minFiles', 'min_items', 'min_rows']);
		$maxItemsRaw = $pickRule('maxItems', ['maxItems', 'maxRows', 'maxFiles', 'max_items', 'max_rows', 'max_files']);
		$keyPatternRaw = $pickRule('keyPattern', ['keyPattern', 'key_pattern']);
		$keyPatternMsgRaw = $nestedRules['keyPatternMessage'] ?? $raw['keyPatternMessage'] ?? $raw['key_pattern_message'] ?? null;
		if (is_scalar($keyPatternMsgRaw) && trim((string) $keyPatternMsgRaw) !== '' && !isset($messages['keyPattern'])) {
			$messages['keyPattern'] = trim((string) $keyPatternMsgRaw);
		}
		$maxFilesizeRaw = $pickRule('maxFilesize', ['maxFilesize', 'maxFileSize', 'max_file_size']);
		if ($maxFilesizeRaw === null && isset($raw['max_file_size_kb']) && (int) $raw['max_file_size_kb'] > 0) {
			$maxFilesizeRaw = (int) $raw['max_file_size_kb'] * 1024;
		}
		$validateIfRaw = $pickRule('validateIf', ['validateIf', 'validate_if']);

		return [
			'required' => $required,
			'requiredIf' => $conditions['require'],
			'validateIf' => self::normalizeConditionExpression($validateIfRaw),
			'minLength' => $minLengthRaw !== null && is_numeric($minLengthRaw) && (int) $minLengthRaw > 0 ? (int) $minLengthRaw : null,
			'maxLength' => $maxLengthRaw !== null && is_numeric($maxLengthRaw) && (int) $maxLengthRaw > 0 ? (int) $maxLengthRaw : null,
			'length' => $lengthRaw !== null && is_numeric($lengthRaw) && (int) $lengthRaw > 0 ? (int) $lengthRaw : null,
			'min' => $minRaw !== null && $minRaw !== '' ? (is_numeric($minRaw) ? 0 + $minRaw : (string) $minRaw) : null,
			'max' => $maxRaw !== null && $maxRaw !== '' ? (is_numeric($maxRaw) ? 0 + $maxRaw : (string) $maxRaw) : null,
			'step' => $stepRaw !== null && $stepRaw !== '' ? (is_numeric($stepRaw) ? 0 + $stepRaw : (string) $stepRaw) : null,
			'pattern' => is_string($patternRaw) && trim($patternRaw) !== '' ? trim($patternRaw) : null,
			'keyPattern' => is_string($keyPatternRaw) && trim($keyPatternRaw) !== '' ? trim($keyPatternRaw) : null,
			'format' => $format,
			'startsWith' => is_string($startsWithRaw) && $startsWithRaw !== '' ? $startsWithRaw : null,
			'endsWith' => is_string($endsWithRaw) && $endsWithRaw !== '' ? $endsWithRaw : null,
			'includes' => is_string($includesRaw) && $includesRaw !== '' ? $includesRaw : null,
			'excludes' => is_string($excludesRaw) && $excludesRaw !== '' ? $excludesRaw : null,
			'in' => $normalizeStringList($inRaw),
			'notIn' => $normalizeStringList($notInRaw),
			'equalsField' => is_string($equalsFieldRaw) && trim($equalsFieldRaw) !== '' ? trim($equalsFieldRaw) : null,
			'differentFrom' => is_string($differentFromRaw) && trim($differentFromRaw) !== '' ? trim($differentFromRaw) : null,
			'gtField' => is_string($gtFieldRaw) && trim($gtFieldRaw) !== '' ? trim($gtFieldRaw) : null,
			'gteField' => is_string($gteFieldRaw) && trim($gteFieldRaw) !== '' ? trim($gteFieldRaw) : null,
			'ltField' => is_string($ltFieldRaw) && trim($ltFieldRaw) !== '' ? trim($ltFieldRaw) : null,
			'lteField' => is_string($lteFieldRaw) && trim($lteFieldRaw) !== '' ? trim($lteFieldRaw) : null,
			'minItems' => $minItemsRaw !== null && is_numeric($minItemsRaw) && (int) $minItemsRaw > 0 ? (int) $minItemsRaw : null,
			'maxItems' => $maxItemsRaw !== null && is_numeric($maxItemsRaw) && (int) $maxItemsRaw > 0 ? (int) $maxItemsRaw : null,
			'maxFilesize' => $maxFilesizeRaw !== null && is_numeric($maxFilesizeRaw) && (int) $maxFilesizeRaw > 0 ? (int) $maxFilesizeRaw : null,
			'messages' => $messages,
		];
	}

	/**
	 * Extract normalized `valibot` validation rules from a native ProcessWire `Inputfield` and its serialized control metadata.
	 *
	 * @param array<string, mixed> $control
	 * @return array<string, mixed>
	 */
	private function extractValidationFromInputfield(Inputfield $inputfield, array $control): array
	{
		$rawRules = $inputfield->get('_rwValidation') ?? $inputfield->get('validation') ?? $inputfield->get('rules');
		$rulesArr = is_array($rawRules) ? $rawRules : [];

		$mergedRaw = array_merge($control, [
			'required' => $control['required'] ?? false,
			'minLength' => $control['minLength'] ?? null,
			'maxLength' => $control['maxLength'] ?? null,
			'min' => $control['min'] ?? null,
			'max' => $control['max'] ?? null,
			'step' => $control['step'] ?? null,
			'pattern' => $control['pattern'] ?? null,
			'keyPattern' => $inputfield->get('keyPattern') ?? $inputfield->getSetting('keyPattern') ?? ($control['keyPattern'] ?? null),
			'keyPatternMessage' => $inputfield->get('keyPatternMessage') ?? $inputfield->getSetting('keyPatternMessage') ?? ($control['keyPatternMessage'] ?? null),
			'minItems' => $inputfield->get('minItems')
				?? $inputfield->getSetting('minItems')
				?? $inputfield->get('minFiles')
				?? $inputfield->getSetting('minFiles')
				?? ($control['minFiles'] ?? null),
			'maxItems' => $inputfield->get('maxItems') ?? $inputfield->getSetting('maxItems') ?? ($control['maxFiles'] ?? null),
			'maxFilesize' => $control['maxFilesize'] ?? null,
			'differentFrom' => $inputfield->get('differentFrom') ?? null,
			'equalsField' => $inputfield->get('equalsField') ?? $inputfield->get('sameAs') ?? $inputfield->get('matchField') ?? null,
			'gtField' => $inputfield->get('gtField') ?? null,
			'gteField' => $inputfield->get('gteField') ?? $inputfield->get('afterField') ?? null,
			'ltField' => $inputfield->get('ltField') ?? null,
			'lteField' => $inputfield->get('lteField') ?? $inputfield->get('beforeField') ?? null,
			'validateIf' => $inputfield->get('validateIf') ?? null,
			'validation' => $rulesArr,
		]);

		$rawConds = is_array($control['conditions'] ?? null) ? $control['conditions'] : null;
		$conditions = $rawConds !== null
			? [
				'show' => (string) ($rawConds['show'] ?? ''),
				'hide' => (string) ($rawConds['hide'] ?? ''),
				'enable' => (string) ($rawConds['enable'] ?? ''),
				'disable' => (string) ($rawConds['disable'] ?? ''),
				'require' => (string) ($rawConds['require'] ?? ''),
			]
			: $this->extractConditionsFromInputfield($inputfield);

		return $this->normalizeValidationRules($mergedRaw, $conditions);
	}

	/**
	 * Extract connected field metadata (`slug` or `calculation`) from a declarative field specification.
	 *
	 * @param array<string, mixed> $raw
	 * @param list<array{id: int, name: string, title: string, isDefault: bool, inputName: string, value: string}> $langTabs
	 * @return array<string, mixed>|null
	 */
	private function extractConnectionFromRaw(array $raw, string $type, mixed $currentVal, array $langTabs = []): ?array
	{
		$connMap = isset($raw['connection']) && is_array($raw['connection']) ? $raw['connection'] : [];
		$connType = strtolower(trim((string) ($connMap['type'] ?? '')));

		$slugSource = trim((string) (
			$connMap['sourceField']
			?? $connMap['from']
			?? $raw['slugFrom']
			?? $raw['from']
			?? $raw['connectedField']
			?? ($type === 'slug' ? 'title' : '')
		));

		if ($connType === 'slug' || $slugSource !== '') {
			$hasInitialVal = $langTabs !== []
				? array_all($langTabs, static fn(array $lt): bool => trim((string) ($lt['value'] ?? '')) !== '')
				: (is_scalar($currentVal) && trim((string) $currentVal) !== '');
			$lockWhenPopulated = array_key_exists('lockWhenPopulated', $connMap)
				? ((bool) $connMap['lockWhenPopulated'] && $hasInitialVal)
				: (array_key_exists('slugLocked', $raw) ? (bool) $raw['slugLocked'] : $hasInitialVal);

			return [
				'type' => 'slug',
				'sourceField' => $slugSource !== '' ? $slugSource : 'title',
				'separator' => (string) ($connMap['separator'] ?? $raw['slugSeparator'] ?? $raw['separator'] ?? '-'),
				'maxLength' => max(1, (int) ($connMap['maxLength'] ?? $raw['maxLength'] ?? $raw['maxlength'] ?? 128)),
				'lockWhenPopulated' => $lockWhenPopulated,
				'lowercase' => array_key_exists('lowercase', $connMap) ? (bool) $connMap['lowercase'] : true,
			];
		}

		$formula = trim((string) ($connMap['formula'] ?? $raw['formula'] ?? ''));
		if ($connType === 'calculation' || $type === 'calculation' || $formula !== '') {
			return [
				'type' => 'calculation',
				'formula' => $formula,
				'precision' => (int) ($connMap['precision'] ?? $raw['precision'] ?? 2),
			];
		}

		return null;
	}

	/**
	 * Extract connected field metadata (`slug` or `calculation`) from a native ProcessWire `Inputfield`.
	 *
	 * @param array<string, mixed> $control
	 * @return array<string, mixed>|null
	 */
	private function extractConnectionFromInputfield(Inputfield $inputfield, array $control): ?array
	{
		$rawConn = $inputfield->get('_rwConnection') ?? $inputfield->get('connection');
		if (is_array($rawConn) && isset($rawConn['type'])) {
			return $rawConn;
		}

		$slugFrom = trim((string) ($control['slugFrom'] ?? ''));
		if ($slugFrom !== '') {
			return [
				'type' => 'slug',
				'sourceField' => $slugFrom,
				'separator' => (string) ($control['slugSeparator'] ?? '-'),
				'maxLength' => max(1, (int) (($control['maxLength'] ?? 0) > 0 ? $control['maxLength'] : 128)),
				'lockWhenPopulated' => !empty($control['slugLocked']),
				'lowercase' => true,
			];
		}

		$formula = trim((string) ($control['formula'] ?? $inputfield->get('formula') ?? ''));
		if ($formula !== '') {
			return [
				'type' => 'calculation',
				'formula' => $formula,
				'precision' => (int) ($control['precision'] ?? $inputfield->get('precision') ?? 2),
			];
		}

		return null;
	}

	/**
	 * Extract language tab entries for a declarative multilingual field definition.
	 *
	 * @param array<string, mixed> $raw
	 * @param array<string, mixed> $values
	 * @return list<array{id: int, name: string, title: string, isDefault: bool, inputName: string, value: string}>
	 */
	private function extractDeclarativeLanguageValues(string $fieldName, array $raw, mixed $rawVal, array $values): array
	{
		$valMap = is_array($rawVal) ? $rawVal : [];

		if (isset($raw['languages']) && is_array($raw['languages']) && $raw['languages'] !== []) {
			$customTabs = [];
			foreach ($raw['languages'] as $idx => $langItem) {
				if (!is_array($langItem)) {
					continue;
				}
				$langId = (int) ($langItem['id'] ?? ($idx + 1));
				$langName = (string) ($langItem['name'] ?? ($idx === 0 ? 'default' : 'lang_' . $langId));
				$isDefault = array_key_exists('isDefault', $langItem) ? (bool) $langItem['isDefault'] : ($idx === 0 || $langName === 'default');
				$inputName = $isDefault ? $fieldName : "{$fieldName}__{$langId}";
				$resolvedVal = $values[$inputName]
					?? $langItem['value']
					?? ($isDefault ? ($valMap['default'] ?? (is_scalar($rawVal) ? $rawVal : '')) : ($valMap[(string) $langId] ?? $valMap[$langName] ?? ''));
				$customTabs[] = [
					'id' => $langId,
					'name' => $langName,
					'title' => (string) ($langItem['title'] ?? $langItem['label'] ?? strtoupper($langName)),
					'isDefault' => $isDefault,
					'editable' => array_key_exists('editable', $langItem) ? (bool) $langItem['editable'] : true,
					'inputName' => $inputName,
					'inputId' => (string) ($langItem['inputId'] ?? ('Inputfield_' . $inputName)),
					'value' => is_scalar($resolvedVal) ? (string) $resolvedVal : '',
				];
			}
			if ($customTabs !== []) {
				return $customTabs;
			}
		}

		$languages = $this->wire()->languages;
		if (!is_iterable($languages)) {
			return [];
		}

		$result = [];
		foreach ($languages as $lang) {
			if (!$lang instanceof Language) {
				continue;
			}
			$isDefault = $lang->isDefault();
			$langId = (int) $lang->id;
			$langName = (string) $lang->name;
			$inputName = $isDefault ? $fieldName : "{$fieldName}__{$langId}";
			$editable = is_object($languages) && method_exists($languages, 'editable') ? (bool) $languages->editable($lang) : true;
			$resolvedVal = $values[$inputName]
				?? ($isDefault
					? ($valMap['default'] ?? $valMap[$langName] ?? (is_scalar($rawVal) ? $rawVal : ''))
					: ($valMap[(string) $langId] ?? $valMap[$langName] ?? ''));

			$result[] = [
				'id' => $langId,
				'name' => $langName,
				'title' => (string) ($lang->get('title|name') ?: $langName),
				'isDefault' => $isDefault,
				'editable' => $editable,
				'inputName' => $inputName,
				'inputId' => 'Inputfield_' . $inputName,
				'value' => is_scalar($resolvedVal) ? (string) $resolvedVal : '',
			];
		}

		return $result;
	}

	/**
	 * Serialize an `InputfieldMarkup` node (static HTML, collapsible/async section, or `danger_zone`).
	 *
	 * @param list<array{id?: string, name: string, value: string}> $hiddenInputs
	 * @param array<string, mixed> $values
	 * @param array<string, string> $errors
	 * @return array<string, mixed>
	 */
	private function serializeMarkupField(
		InputfieldMarkup $inputfield,
		array &$hiddenInputs,
		array &$values,
		array $errors,
	): array {
		$common = $this->extractCommonFieldMeta($inputfield, $errors);
		$rawDangerZone = $inputfield->get('rwDangerZone');
		if (is_array($rawDangerZone) && $rawDangerZone !== []) {
			$dangerZone = [
				'title' => (string) ($rawDangerZone['title'] ?? ''),
				'confirmInputName' => (string) ($rawDangerZone['confirmInputName'] ?? '_delete_confirm'),
			];
			foreach ([
				'description',
				'buttonLabel',
				'dialogTitle',
				'dialogDescription',
				'acknowledgeLabel',
				'confirmLabel',
				'confirmInputValue',
				'blockedMessage',
				'referenceCountField',
				'referenceWarningTemplate',
			] as $strKey) {
				if (isset($rawDangerZone[$strKey]) && is_string($rawDangerZone[$strKey]) && $rawDangerZone[$strKey] !== '') {
					$dangerZone[$strKey] = $rawDangerZone[$strKey];
				}
			}
			if (array_key_exists('blocked', $rawDangerZone)) {
				$dangerZone['blocked'] = (bool) $rawDangerZone['blocked'];
			}

			return array_merge($common, [
				'kind' => 'danger_zone',
				'dangerZone' => $dangerZone,
			]);
		}

		$html = $inputfield->render();
		$this->extractHiddenInputsFromHtml($html, $hiddenInputs, $values);

		$payload = array_merge($common, [
			'kind' => 'markup',
			'isFile' => false,
			'html' => $html,
		]);

		if ((bool) $inputfield->get('rwCollapsible') || !empty($common['collapsed'])) {
			$payload['collapsible'] = true;
		}
		$asyncUrl = trim((string) $inputfield->get('rwAsyncUrl'));
		if ($asyncUrl !== '') {
			$payload['asyncUrl'] = $asyncUrl;
			$rawAsyncMode = strtolower(trim((string) $inputfield->get('rwAsyncMode')));
			$payload['asyncMode'] = $rawAsyncMode === 'mount' ? 'mount' : 'expand';
		}
		if ((bool) $inputfield->get('rwHideWhenEmpty')) {
			$payload['hideWhenEmpty'] = true;
		}
		$badge = trim((string) $inputfield->get('rwBadge'));
		if ($badge !== '') {
			$payload['badge'] = $badge;
		}
		if (strtolower(trim((string) $inputfield->get('rwSurface'))) === 'plain') {
			$payload['surface'] = 'plain';
		}
		$appendHtml = (string) $inputfield->get('rwAppendHtml');
		if ($appendHtml !== '') {
			$payload['appendHtml'] = $appendHtml;
		}

		return $payload;
	}

	/**
	 * Determine whether an `Inputfield` is configured to start collapsed.
	 */
	private function isCollapsed(Inputfield $inputfield): bool
	{
		$collapsed = (int) ($inputfield->getSetting('collapsed') ?? 0);
		if (in_array($collapsed, [
			Inputfield::collapsedYes,
			Inputfield::collapsedYesAjax,
			Inputfield::collapsedYesLocked,
		], true)) {
			return true;
		}
		if ($collapsed === Inputfield::collapsedBlank && $inputfield->isEmpty()) {
			return true;
		}

		return false;
	}

	/**
	 * Extract `<input type="hidden" name="..." value="...">` tags embedded in raw HTML fragments.
	 *
	 * @param list<array{id?: string, name: string, value: string}> $hiddenInputs
	 * @param array<string, mixed> $values
	 */
	private function extractHiddenInputsFromHtml(string $html, array &$hiddenInputs, array &$values): void
	{
		if (stripos($html, 'hidden') === false) {
			return;
		}

		$seenNames = [];
		foreach ($hiddenInputs as $existing) {
			if (is_array($existing) && isset($existing['name']) && is_string($existing['name']) && $existing['name'] !== '') {
				$seenNames[$existing['name']] = true;
			}
		}

		if (preg_match_all('/<input\b[^>]*>/i', $html, $matches) > 0) {
			foreach ($matches[0] as $tag) {
				if (preg_match('/\btype\s*=\s*(?:["\']hidden["\']|hidden\b)/i', $tag) !== 1) {
					continue;
				}
				if (preg_match('/\bname\s*=\s*["\']([^"\']+)["\']/i', $tag, $nameMatch) !== 1) {
					continue;
				}
				$hName = html_entity_decode($nameMatch[1], ENT_QUOTES, 'UTF-8');
				if ($hName === '' || str_ends_with($hName, '[]') || isset($seenNames[$hName])) {
					continue;
				}
				$hVal = '';
				if (preg_match('/\bvalue\s*=\s*["\']([^"\']*)["\']/i', $tag, $valMatch) === 1) {
					$hVal = html_entity_decode($valMatch[1], ENT_QUOTES, 'UTF-8');
				}
				$seenNames[$hName] = true;
				$hiddenInputs[] = [
					'name' => $hName,
					'value' => $hVal,
				];
				$values[$hName] = $hVal;
			}
		}
	}

	/**
	 * Find a `data-*` attribute matching `$suffix` (e.g. `data-rw-affix-prefix` or `data-*-affix-prefix`).
	 *
	 * @param array<string, mixed> $attrs
	 */
	private function findDataAttribute(array $attrs, string $suffix, ?string $default = null): ?string
	{
		$directKey = 'data-rw-' . $suffix;
		if (isset($attrs[$directKey])) {
			return (string) $attrs[$directKey];
		}

		$needle = '-' . $suffix;
		foreach ($attrs as $key => $val) {
			$k = (string) $key;
			if (str_starts_with($k, 'data-') && str_ends_with($k, $needle)) {
				return (string) $val;
			}
		}

		return $default;
	}

	/**
	 * Normalize secret-control metadata from either Inputfield attributes or declarative definitions.
	 *
	 * @return array{
	 *     isSecret: bool,
	 *     secretMasked: bool,
	 *     secretPrefix: string,
	 *     secretBytes: int,
	 *     secretAutoGenerate: bool
	 * }
	 */
	private function resolveSecretSerializationMeta(
		bool $isSecret,
		mixed $maskedRaw,
		mixed $prefixRaw,
		mixed $bytesRaw,
		mixed $autogenRaw,
	): array {
		$parseBool = static function (mixed $raw, bool $default): bool {
			if ($raw === null || $raw === '') {
				return $default;
			}
			if (is_bool($raw)) {
				return $raw;
			}
			if (is_int($raw) || is_float($raw)) {
				return (int) $raw !== 0;
			}
			$norm = strtolower(trim((string) $raw));
			if (in_array($norm, ['0', 'false', 'no', 'off'], true)) {
				return false;
			}
			if (in_array($norm, ['1', 'true', 'yes', 'on'], true)) {
				return true;
			}
			return $default;
		};

		$bytesInt = is_numeric($bytesRaw) ? (int) $bytesRaw : 32;
		$bytesClamped = max(8, min(128, $bytesInt > 0 ? $bytesInt : 32));

		return [
			'isSecret' => $isSecret,
			'secretMasked' => $isSecret && $parseBool($maskedRaw, false),
			'secretPrefix' => $isSecret && is_scalar($prefixRaw) ? (string) $prefixRaw : '',
			'secretBytes' => $isSecret ? $bytesClamped : 32,
			'secretAutoGenerate' => $isSecret ? $parseBool($autogenRaw, true) : true,
		];
	}

	/**
	 * Map alias control names onto canonical `SchemaForm` control types.
	 */
	private function canonicalControlType(string $type): string
	{
		return ReactControlRegistry::canonicalControlType($type);
	}

	/**
	 * Resolve an explicit `data-rw-control` attribute or `rwControl` setting from a ProcessWire `Inputfield`.
	 *
	 * @param array<string, mixed> $attrs
	 */
	private function resolveInputfieldRwControl(Inputfield $inputfield, array $attrs): string
	{
		return strtolower(trim((string) (
			$this->findDataAttribute($attrs, 'control', '')
			?: $this->findDataAttribute($attrs, 'rw-control', '')
			?: ($inputfield->get('rwControl') ?? '')
		)));
	}

	/**
	 * Normalize associative or structured option lists into `SchemaForm` option entries.
	 *
	 * @param array<mixed, mixed> $rawOptions
	 * @return list<array<string, mixed>>
	 */
	private function normalizeOptionItems(array $rawOptions): array
	{
		$normalizedOptions = [];
		foreach ($rawOptions as $optKey => $optVal) {
			if (is_array($optVal) && isset($optVal['value'])) {
				$optEntry = [
					'value' => (string) $optVal['value'],
					'label' => (string) ($optVal['label'] ?? $optVal['value']),
					'disabled' => !empty($optVal['disabled']),
				];
				if (!empty($optVal['icon']) && is_string($optVal['icon'])) {
					$optEntry['icon'] = $this->normalizeIcon($optVal['icon']);
				}
				if (isset($optVal['description']) && is_string($optVal['description']) && $optVal['description'] !== '') {
					$optEntry['description'] = $optVal['description'];
				}
				if (isset($optVal['subtitle']) && is_string($optVal['subtitle']) && $optVal['subtitle'] !== '') {
					$optEntry['subtitle'] = $optVal['subtitle'];
				}
				if (isset($optVal['group']) && is_string($optVal['group']) && $optVal['group'] !== '') {
					$optEntry['group'] = $optVal['group'];
				}
				$normalizedOptions[] = $optEntry;
			} else {
				$normalizedOptions[] = [
					'value' => (string) $optKey,
					'label' => (string) $optVal,
				];
			}
		}

		return $normalizedOptions;
	}

	/**
	 * Normalize tag values into a deduplicated-order list of non-empty strings.
	 *
	 * @return list<string>
	 */
	private function normalizeTagListValue(mixed $val, string $delimiter = ''): array
	{
		if (is_string($val)) {
			$trimmed = trim($val);
			if ($trimmed === '') {
				return [];
			}
			$parts = $delimiter !== ''
				? explode($delimiter === 'c' ? ',' : $delimiter, $trimmed)
				: (preg_split('/[,;\r\n]+/', $trimmed) ?: []);
			return array_values(array_filter(array_map('trim', $parts), static fn(string $s): bool => $s !== ''));
		}
		if (is_array($val)) {
			return array_values(array_filter(
				array_map(static fn(mixed $item): string => is_scalar($item) ? trim((string) $item) : '', $val),
				static fn(string $s): bool => $s !== '',
			));
		}
		return [];
	}

	/**
	 * Normalize a `daterange` value (`['from', 'to']`, JSON string, or `YYYY-MM-DD..YYYY-MM-DD`).
	 */
	private function normalizeDateRangeValue(mixed $val): mixed
	{
		if (is_string($val)) {
			$trimmedRange = trim($val);
			if ($trimmedRange !== '' && str_starts_with($trimmedRange, '{')) {
				$decodedRange = json_decode($trimmedRange, true);
				if (is_array($decodedRange)) {
					$val = $decodedRange;
				}
			} elseif ($trimmedRange !== '' && preg_match('/^(\d{4}-\d{2}-\d{2})\s*(?:\.\.|\/|–)\s*(\d{4}-\d{2}-\d{2})$/', $trimmedRange, $rangeMatch) === 1) {
				return ['from' => $rangeMatch[1], 'to' => $rangeMatch[2]];
			}
		}
		if (is_array($val)) {
			$fromStr = trim((string) ($val['from'] ?? ''));
			$toStr = trim((string) ($val['to'] ?? ''));
			return ($fromStr !== '' || $toStr !== '') ? ['from' => $fromStr, 'to' => $toStr] : '';
		}
		return $val;
	}

	/**
	 * Normalize a `unit_number` value (`{value, unit}`, numeric scalar, JSON string, or `<number><unit>`).
	 */
	private function normalizeUnitNumberValue(mixed $val, string $fallbackUnit): mixed
	{
		if (is_string($val) && trim($val) !== '' && str_starts_with(trim($val), '{')) {
			$decodedUnit = json_decode(trim($val), true);
			if (is_array($decodedUnit)) {
				$val = $decodedUnit;
			}
		}
		if (is_array($val)) {
			$numCandidate = $val['value'] ?? null;
			$numNorm = is_numeric($numCandidate) ? (0 + $numCandidate) : null;
			$unitNorm = trim((string) ($val['unit'] ?? $fallbackUnit)) ?: $fallbackUnit;
			return $numNorm !== null ? ['value' => $numNorm, 'unit' => $unitNorm] : '';
		}
		if (is_int($val) || is_float($val)) {
			return ['value' => $val, 'unit' => $fallbackUnit];
		}
		if (is_string($val) && trim($val) !== '' && preg_match('/^(-?\d+(?:\.\d+)?)\s*([A-Za-z%]+)?$/', trim($val), $um) === 1) {
			$parsedNum = str_contains($um[1], '.') ? (float) $um[1] : (int) $um[1];
			return ['value' => $parsedNum, 'unit' => trim((string) ($um[2] ?? $fallbackUnit)) ?: $fallbackUnit];
		}
		return $val;
	}

	/**
	 * Normalize a `spacing` value (`{top, right, bottom, left, unit, linked}`, JSON, CSS shorthand, or scalar).
	 */
	private function normalizeSpacingValue(mixed $val, string $fallbackUnit): mixed
	{
		$extractSpacingToken = static function (string $tok): array {
			$tr = trim($tok);
			if ($tr === '') {
				return ['val' => '', 'unit' => ''];
			}
			if (strtolower($tr) === 'auto') {
				return ['val' => 'auto', 'unit' => ''];
			}
			if (preg_match('/^(-?\d+(?:\.\d+)?)\s*(px|rem|em|%|vw|vh|pt|ch)?$/i', $tr, $sm) === 1) {
				return ['val' => $sm[1], 'unit' => isset($sm[2]) ? strtolower($sm[2]) : ''];
			}
			return ['val' => $tr, 'unit' => ''];
		};
		if (is_string($val) && trim($val) !== '' && str_starts_with(trim($val), '{')) {
			$decodedSpacing = json_decode(trim($val), true);
			if (is_array($decodedSpacing)) {
				$val = $decodedSpacing;
			}
		}
		if (is_array($val)) {
			$tTok = $extractSpacingToken((string) ($val['top'] ?? ''));
			$rTok = $extractSpacingToken((string) ($val['right'] ?? ''));
			$bTok = $extractSpacingToken((string) ($val['bottom'] ?? ''));
			$lTok = $extractSpacingToken((string) ($val['left'] ?? ''));
			$unitNorm = trim((string) ($val['unit'] ?? $fallbackUnit)) ?: $fallbackUnit;
			$linked = array_key_exists('linked', $val)
				? (bool) $val['linked']
				: ($tTok['val'] !== '' && $tTok['val'] === $rTok['val'] && $rTok['val'] === $bTok['val'] && $bTok['val'] === $lTok['val']);
			return [
				'top' => $tTok['val'],
				'right' => $rTok['val'],
				'bottom' => $bTok['val'],
				'left' => $lTok['val'],
				'unit' => $unitNorm,
				'linked' => $linked,
			];
		}
		if (is_string($val) && trim($val) !== '') {
			$tokens = preg_split('/\s+/', trim($val)) ?: [];
			$parsedTokens = array_map($extractSpacingToken, array_slice($tokens, 0, 4));
			$detectedUnit = $fallbackUnit;
			foreach ($parsedTokens as $pt) {
				if ($pt['unit'] !== '') {
					$detectedUnit = $pt['unit'];
					break;
				}
			}
			$cnt = count($parsedTokens);
			$tVal = $parsedTokens[0]['val'] ?? '';
			$rVal = $cnt === 1 ? $tVal : ($parsedTokens[1]['val'] ?? '');
			$bVal = $cnt === 1 ? $tVal : ($cnt === 2 ? $tVal : ($parsedTokens[2]['val'] ?? ''));
			$lVal = $cnt === 1 ? $tVal : ($cnt <= 3 ? $rVal : ($parsedTokens[3]['val'] ?? ''));
			return [
				'top' => $tVal,
				'right' => $rVal,
				'bottom' => $bVal,
				'left' => $lVal,
				'unit' => $detectedUnit,
				'linked' => $cnt === 1 || ($tVal !== '' && $tVal === $rVal && $rVal === $bVal && $bVal === $lVal),
			];
		}
		if (is_int($val) || is_float($val)) {
			$nStr = (string) $val;
			return ['top' => $nStr, 'right' => $nStr, 'bottom' => $nStr, 'left' => $nStr, 'unit' => $fallbackUnit, 'linked' => true];
		}
		return '';
	}

	/**
	 * Normalize a dual `range_slider` value (`{min, max}`, JSON string, or `min..max` string).
	 */
	private function normalizeRangeSliderValue(mixed $val): mixed
	{
		$parseNumericToken = static function (mixed $candidate): int|float|null {
			if (is_int($candidate) || is_float($candidate)) {
				return $candidate;
			}
			if (is_string($candidate) && is_numeric(trim($candidate))) {
				$tr = trim($candidate);
				return str_contains($tr, '.') ? (float) $tr : (int) $tr;
			}
			return null;
		};
		if (is_string($val) && trim($val) !== '' && (str_starts_with(trim($val), '{') || str_starts_with(trim($val), '['))) {
			$decodedRange = json_decode(trim($val), true);
			if (is_array($decodedRange)) {
				$val = $decodedRange;
			}
		}
		if (is_array($val)) {
			$rawMin = $val['min'] ?? $val['from'] ?? $val[0] ?? null;
			$rawMax = $val['max'] ?? $val['to'] ?? $val[1] ?? null;
			$numMin = $parseNumericToken($rawMin);
			$numMax = $parseNumericToken($rawMax);
			return ($numMin !== null && $numMax !== null) ? ['min' => $numMin, 'max' => $numMax] : '';
		}
		if (is_string($val) && trim($val) !== '' && preg_match('/^(-?\d+(?:\.\d+)?)\s*(?:\.\.|–|—|,|-)\s*(-?\d+(?:\.\d+)?)$/', trim($val), $rm) === 1) {
			$numMin = str_contains($rm[1], '.') ? (float) $rm[1] : (int) $rm[1];
			$numMax = str_contains($rm[2], '.') ? (float) $rm[2] : (int) $rm[2];
			return ['min' => $numMin, 'max' => $numMax];
		}
		return $val;
	}

	/**
	 * Normalize a condition builder rule tree into `{match: 'all'|'any', groups: [...]}`.
	 *
	 * @return array{match: string, groups: list<array{id: string, match: string, rules: list<array{id: string, field: string, operator: string, value: mixed}>}>}
	 */
	private function normalizeConditionBuilderValue(mixed $val): array
	{
		if (is_string($val)) {
			$trimmed = trim($val);
			if ($trimmed === '' || $trimmed === '[]') {
				$val = [];
			} else {
				$decoded = json_decode($trimmed, true);
				$val = is_array($decoded) ? $decoded : [];
			}
		}

		if (!is_array($val)) {
			return [
				'match' => 'all',
				'groups' => [],
			];
		}

		$rootMatch = is_string($val['match'] ?? null) && strtolower(trim($val['match'])) === 'any'
			? 'any'
			: 'all';
		$rawGroups = is_array($val['groups'] ?? null) ? $val['groups'] : [];
		$groups = [];
		$gIdx = 0;

		foreach ($rawGroups as $rawGroup) {
			if (!is_array($rawGroup)) {
				continue;
			}
			$gIdx++;
			$groupId = is_string($rawGroup['id'] ?? null) && trim($rawGroup['id']) !== ''
				? trim($rawGroup['id'])
				: 'grp_' . $gIdx;
			$groupMatch = is_string($rawGroup['match'] ?? null) && strtolower(trim($rawGroup['match'])) === 'any'
				? 'any'
				: 'all';
			$rawRules = is_array($rawGroup['rules'] ?? null) ? $rawGroup['rules'] : [];
			$rules = [];
			$rIdx = 0;

			foreach ($rawRules as $rawRule) {
				if (!is_array($rawRule)) {
					continue;
				}
				$rIdx++;
				$ruleId = is_string($rawRule['id'] ?? null) && trim($rawRule['id']) !== ''
					? trim($rawRule['id'])
					: 'rule_' . $gIdx . '_' . $rIdx;
				$fieldKey = is_scalar($rawRule['field'] ?? null) ? trim((string) $rawRule['field']) : '';
				$operator = is_scalar($rawRule['operator'] ?? null) && trim((string) $rawRule['operator']) !== ''
					? trim((string) $rawRule['operator'])
					: 'eq';
				$rules[] = [
					'id' => $ruleId,
					'field' => $fieldKey,
					'operator' => $operator,
					'value' => array_key_exists('value', $rawRule) ? $rawRule['value'] : null,
				];
			}

			$groups[] = [
				'id' => $groupId,
				'match' => $groupMatch,
				'rules' => $rules,
			];
		}

		return [
			'match' => $rootMatch,
			'groups' => $groups,
		];
	}

	/**
	 * Normalize declarative `conditionFields` definitions for `condition_builder` controls.
	 *
	 * @return list<array<string, mixed>>
	 */
	private function normalizeConditionFields(mixed $rawFields): array
	{
		if (is_string($rawFields)) {
			$trimmed = trim($rawFields);
			if ($trimmed === '') {
				return [];
			}
			$decoded = json_decode($trimmed, true);
			$rawFields = is_array($decoded) ? $decoded : [];
		}

		if (!is_array($rawFields)) {
			return [];
		}

		$allowedTypes = ['text', 'number', 'select', 'boolean', 'country', 'currency', 'date'];
		$seenKeys = [];
		$normalized = [];

		foreach ($rawFields as $entry) {
			if (!is_array($entry)) {
				continue;
			}
			$key = is_scalar($entry['key'] ?? null) ? trim((string) $entry['key']) : '';
			if ($key === '' || isset($seenKeys[$key])) {
				continue;
			}
			$seenKeys[$key] = true;

			$label = is_scalar($entry['label'] ?? null) && trim((string) $entry['label']) !== ''
				? trim((string) $entry['label'])
				: $key;
			$rawType = is_scalar($entry['type'] ?? null) ? strtolower(trim((string) $entry['type'])) : 'text';
			$type = in_array($rawType, $allowedTypes, true) ? $rawType : 'text';

			$spec = [
				'key' => $key,
				'label' => $label,
				'type' => $type,
			];

			if (isset($entry['options']) && is_array($entry['options'])) {
				$opts = [];
				foreach ($this->normalizeOptionItems($entry['options']) as $optItem) {
					$opts[] = [
						'value' => (string) ($optItem['value'] ?? ''),
						'label' => (string) ($optItem['label'] ?? $optItem['value'] ?? ''),
					];
				}
				if ($opts !== []) {
					$spec['options'] = $opts;
				}
			} elseif ($type === 'country') {
				$opts = [];
				foreach ($this->normalizeOptionItems(IntlCatalog::countryOptions()) as $optItem) {
					$opts[] = [
						'value' => (string) ($optItem['value'] ?? ''),
						'label' => (string) ($optItem['label'] ?? $optItem['value'] ?? ''),
					];
				}
				$spec['options'] = $opts;
			} elseif ($type === 'currency') {
				$opts = [];
				foreach ($this->normalizeOptionItems(IntlCatalog::currencyOptions()) as $optItem) {
					$opts[] = [
						'value' => (string) ($optItem['value'] ?? ''),
						'label' => (string) ($optItem['label'] ?? $optItem['value'] ?? ''),
					];
				}
				$spec['options'] = $opts;
			}

			if (isset($entry['operators']) && is_array($entry['operators'])) {
				$ops = self::normalizeStringList($entry['operators']);
				if ($ops !== []) {
					$spec['operators'] = $ops;
				}
			}

			$normalized[] = $spec;
		}

		return $normalized;
	}

	/**
	 * Resolve canonical unit-number fallback unit from explicit settings or currency variant hints.
	 *
	 * @param array<string, mixed> $raw
	 */
	private function resolveUnitNumberFallbackUnit(array $raw, string $explicitType = ''): string
	{
		$unitVariant = strtolower(trim((string) ($raw['unitVariant'] ?? $raw['unit_variant'] ?? '')));
		$explicitCurrency = is_scalar($raw['currency'] ?? null) ? trim((string) $raw['currency']) : '';
		$isCurrencyMode = $explicitType === 'currency'
			|| $explicitType === 'money'
			|| $unitVariant === 'currency'
			|| $explicitCurrency !== ''
			|| isset($raw['currencies']);

		$unitsSource = $raw['units'] ?? $raw['currencies'] ?? null;
		$firstUnit = '';
		if (is_array($unitsSource)) {
			foreach ($unitsSource as $unitCandidate) {
				$cleanCandidate = trim((string) $unitCandidate);
				if ($cleanCandidate !== '') {
					$firstUnit = $cleanCandidate;
					break;
				}
			}
		}

		foreach ([$raw['defaultUnit'] ?? null, $raw['default_unit'] ?? null, $explicitCurrency, $firstUnit] as $candidate) {
			$clean = is_scalar($candidate) ? trim((string) $candidate) : '';
			if ($clean !== '') {
				return $clean;
			}
		}

		return $isCurrencyMode ? 'EUR' : 'px';
	}

	/**
	 * Merge structured option metadata (`icon`, `description`, `subtitle`, `group`, `disabled`) onto base select options.
	 *
	 * @param list<array<string, mixed>> $baseOptions
	 * @param list<array<string, mixed>> $structuredOptions
	 * @return list<array<string, mixed>>
	 */
	private function mergeStructuredSelectOptions(array $baseOptions, array $structuredOptions): array
	{
		if ($baseOptions === []) {
			return $structuredOptions;
		}
		$byValue = [];
		foreach ($structuredOptions as $entry) {
			if (isset($entry['value'])) {
				$byValue[(string) $entry['value']] = $entry;
			}
		}
		if ($byValue === []) {
			return $baseOptions;
		}

		$merged = [];
		foreach ($baseOptions as $opt) {
			$valKey = (string) ($opt['value'] ?? '');
			if ($valKey !== '' && isset($byValue[$valKey])) {
				$rich = $byValue[$valKey];
				foreach (['icon', 'description', 'subtitle', 'group'] as $metaKey) {
					if (!empty($rich[$metaKey])) {
						$opt[$metaKey] = $rich[$metaKey];
					}
				}
				if (!empty($rich['disabled'])) {
					$opt['disabled'] = true;
				}
				if (isset($rich['label']) && is_string($rich['label']) && $rich['label'] !== '' && ($opt['label'] ?? '') === '') {
					$opt['label'] = $rich['label'];
				}
			}
			$merged[] = $opt;
		}

		return $merged;
	}

	/**
	 * Collect extended React control settings from an `Inputfield` or `data-rw-*` attributes.
	 *
	 * @param array<string, mixed> $attrs
	 * @return array<string, mixed>
	 */
	private function collectInputfieldExtendedBag(Inputfield $inputfield, array $attrs): array
	{
		$bag = [];
		$keys = [
			'datetimeMode', 'hourFormat', 'minuteStep', 'showSeconds', 'timezone',
			'weekStartsOn', 'displayFormat', 'presets', 'numberOfMonths', 'minTime', 'maxTime',
			'swatches', 'allowAlpha', 'clearable',
			'suggestions', 'tagsList', 'allowDuplicates', 'allowCustom', 'delimiter', 'maxItems', 'maxSelectedItems',
			'emptyText', 'comboboxOptions', 'segmentedOptions', 'options', 'multiple',
			'defaultCountry', 'preferredCountries', 'phoneCountries', 'only', 'exclude', 'preferred', 'regions', 'includeOffset',
			'units', 'currencies', 'defaultUnit', 'unitVariant', 'currency', 'locale', 'precision',
			'iconOnly', 'fullWidth', 'useDeselect',
			'sides', 'allowAuto', 'allowNegative',
			'otpLength', 'length', 'otpMode', 'otpSeparatorAfter', 'mask',
			'showStrength', 'showRequirements', 'allowGenerate', 'requireUppercase',
			'requireLowercase', 'requireNumber', 'requireSymbol', 'confirmPassword', 'autoComplete',
			'rangeMode', 'dual', 'minDistance',
			'previewMode', 'allowSplit', 'showToolbar',
			'maxStars', 'formula',
			'conditionFields', 'condition_fields',
		];
		foreach ($keys as $key) {
			$val = $inputfield->data($key);
			if ($val === null) {
				$settingVal = $inputfield->getSetting($key);
				if (!$settingVal instanceof Wire) {
					$val = $settingVal;
				}
			}
			if ($val instanceof Wire) {
				$val = null;
			}
			if ($val !== null) {
				$bag[$key] = $val;
				continue;
			}
			$kebab = strtolower((string) preg_replace('/([a-z])([A-Z])/', '$1-$2', $key));
			$attrVal = $this->findDataAttribute($attrs, $kebab);
			if ($attrVal === null) {
				continue;
			}
			$trimmed = trim($attrVal);
			if ($trimmed !== '' && ($trimmed[0] === '[' || $trimmed[0] === '{')) {
				$decoded = json_decode($trimmed, true);
				if (is_array($decoded)) {
					$bag[$key] = $decoded;
					continue;
				}
			}
			$lower = strtolower($trimmed);
			$bag[$key] = match ($lower) {
				'true', '1' => true,
				'false', '0' => false,
				default => $attrVal,
			};
		}
		return $bag;
	}

	/**
	 * Apply type-specific extended control options onto a serialized control node.
	 *
	 * @param array<string, mixed> $fieldNode
	 * @param array<string, mixed> $raw
	 */
	private function applyExtendedControlOptions(string $controlType, array &$fieldNode, array $raw, string $explicitType = ''): void
	{
		if (in_array($controlType, ['date', 'time', 'datetime', 'daterange'], true)) {
			$rawDatetimeMode = $raw['datetimeMode'] ?? $raw['datetime_mode'] ?? null;
			if (is_string($rawDatetimeMode) && in_array($rawDatetimeMode, ['picker', 'html', 'text'], true)) {
				$fieldNode['datetimeMode'] = $rawDatetimeMode;
			}
			$rawHourFormat = $raw['hourFormat'] ?? $raw['hour_format'] ?? null;
			if (is_string($rawHourFormat) && in_array($rawHourFormat, ['24h', '12h'], true)) {
				$fieldNode['hourFormat'] = $rawHourFormat;
			}
			$rawMinuteStep = $raw['minuteStep'] ?? $raw['minute_step'] ?? null;
			if ($rawMinuteStep !== null) {
				$fieldNode['minuteStep'] = max(1, min(30, (int) $rawMinuteStep));
			}
			if (array_key_exists('showSeconds', $raw) || array_key_exists('show_seconds', $raw)) {
				$fieldNode['showSeconds'] = !empty($raw['showSeconds'] ?? $raw['show_seconds'] ?? null);
			}
			$rawTimezone = trim((string) ($raw['timezone'] ?? ''));
			if ($rawTimezone !== '') {
				$fieldNode['timezone'] = $rawTimezone;
			}
			$rawWeekStartsOn = $raw['weekStartsOn'] ?? $raw['week_starts_on'] ?? null;
			if ($rawWeekStartsOn !== null) {
				$fieldNode['weekStartsOn'] = max(0, min(6, (int) $rawWeekStartsOn));
			}
			$rawDisplayFormat = trim((string) ($raw['displayFormat'] ?? $raw['display_format'] ?? ''));
			if ($rawDisplayFormat !== '') {
				$fieldNode['displayFormat'] = $rawDisplayFormat;
			}
			if (array_key_exists('presets', $raw)) {
				$fieldNode['presets'] = (bool) $raw['presets'];
			}
			$rawNumberOfMonths = $raw['numberOfMonths'] ?? $raw['number_of_months'] ?? null;
			if ($rawNumberOfMonths !== null) {
				$fieldNode['numberOfMonths'] = max(1, min(3, (int) $rawNumberOfMonths));
			}
			$rawMinTime = trim((string) ($raw['minTime'] ?? $raw['min_time'] ?? ''));
			if ($rawMinTime !== '') {
				$fieldNode['minTime'] = $rawMinTime;
			}
			$rawMaxTime = trim((string) ($raw['maxTime'] ?? $raw['max_time'] ?? ''));
			if ($rawMaxTime !== '') {
				$fieldNode['maxTime'] = $rawMaxTime;
			}
		}

		if ($controlType === 'color') {
			if (isset($raw['swatches']) && is_array($raw['swatches'])) {
				$fieldNode['swatches'] = array_values(array_filter(array_map('strval', $raw['swatches']), static fn(string $s): bool => trim($s) !== ''));
			}
			if (array_key_exists('allowAlpha', $raw) || array_key_exists('allow_alpha', $raw)) {
				$fieldNode['allowAlpha'] = !empty($raw['allowAlpha'] ?? $raw['allow_alpha'] ?? null);
			}
			if (array_key_exists('clearable', $raw)) {
				$fieldNode['clearable'] = (bool) $raw['clearable'];
			}
		} elseif ($controlType === 'tags') {
			$rawSuggestions = $raw['suggestions'] ?? $raw['tagsList'] ?? $raw['tags_list'] ?? null;
			if (is_array($rawSuggestions)) {
				$fieldNode['suggestions'] = array_values(array_filter(array_map('strval', $rawSuggestions), static fn(string $s): bool => trim($s) !== ''));
			} elseif (is_string($rawSuggestions) && trim($rawSuggestions) !== '') {
				$fieldNode['suggestions'] = self::normalizeMediaTokenList($rawSuggestions, false);
			}
			if (array_key_exists('allowDuplicates', $raw) || array_key_exists('allow_duplicates', $raw)) {
				$fieldNode['allowDuplicates'] = !empty($raw['allowDuplicates'] ?? $raw['allow_duplicates'] ?? null);
			}
			if (array_key_exists('allowCustom', $raw) || array_key_exists('allow_custom', $raw)) {
				$fieldNode['allowCustom'] = (bool) ($raw['allowCustom'] ?? $raw['allow_custom'] ?? false);
			}
			$rawMaxItems = $raw['maxItems'] ?? $raw['max_items'] ?? $raw['maxSelectedItems'] ?? null;
			if (is_numeric($rawMaxItems) && (int) $rawMaxItems > 0) {
				$fieldNode['maxItems'] = (int) $rawMaxItems;
			}
		} elseif ($controlType === 'phone') {
			$rawDefaultCountry = strtoupper(trim((string) ($raw['defaultCountry'] ?? $raw['default_country'] ?? '')));
			if ($rawDefaultCountry !== '') {
				$fieldNode['defaultCountry'] = $rawDefaultCountry;
			}
			$preferredList = self::normalizeStringList($raw['preferredCountries'] ?? $raw['preferred_countries'] ?? $raw['preferred'] ?? []);
			if ($preferredList !== []) {
				$fieldNode['preferredCountries'] = $preferredList;
			}
			if (array_key_exists('clearable', $raw)) {
				$fieldNode['clearable'] = (bool) $raw['clearable'];
			}
			$rawPhoneCountries = $raw['phoneCountries'] ?? $raw['phone_countries'] ?? null;
			if (is_array($rawPhoneCountries) && $rawPhoneCountries !== []) {
				$fieldNode['phoneCountries'] = array_values($rawPhoneCountries);
			} else {
				$onlyList = self::normalizeStringList($raw['only'] ?? []);
				$excludeList = self::normalizeStringList($raw['exclude'] ?? []);
				$fieldNode['phoneCountries'] = IntlCatalog::phoneCountryItems($onlyList, $excludeList, $preferredList);
			}
		} elseif ($controlType === 'combobox') {
			if (array_key_exists('clearable', $raw)) {
				$fieldNode['clearable'] = (bool) $raw['clearable'];
			}
			$rawEmptyText = $raw['emptyText'] ?? $raw['empty_text'] ?? null;
			if ($rawEmptyText !== null) {
				$fieldNode['emptyText'] = (string) $rawEmptyText;
			}
			if (array_key_exists('allowCustom', $raw) || array_key_exists('allow_custom', $raw)) {
				$fieldNode['allowCustom'] = !empty($raw['allowCustom'] ?? $raw['allow_custom'] ?? null);
			}
			$lowerExplicit = strtolower(trim($explicitType));
			if (array_key_exists('multiple', $raw)) {
				$fieldNode['multiple'] = !empty($raw['multiple']);
			} elseif ($lowerExplicit === 'countries') {
				$fieldNode['multiple'] = true;
			}
			if (empty($fieldNode['options'])) {
				$onlyList = self::normalizeStringList($raw['only'] ?? []);
				$excludeList = self::normalizeStringList($raw['exclude'] ?? []);
				$preferredList = self::normalizeStringList($raw['preferred'] ?? $raw['preferredCountries'] ?? $raw['preferred_countries'] ?? []);
				if (in_array($lowerExplicit, ['country', 'country_code', 'country-code', 'countries'], true)) {
					$fieldNode['options'] = $this->normalizeOptionItems(IntlCatalog::countryOptions($onlyList, $excludeList, $preferredList));
				} elseif (in_array($lowerExplicit, ['timezone', 'time_zone', 'time-zone', 'tz'], true)) {
					$regionsList = self::normalizeStringList($raw['regions'] ?? []);
					$includeOffset = !array_key_exists('includeOffset', $raw) && !array_key_exists('include_offset', $raw)
						? true
						: !empty($raw['includeOffset'] ?? $raw['include_offset'] ?? false);
					$fieldNode['options'] = $this->normalizeOptionItems(IntlCatalog::timezoneOptions($regionsList, $includeOffset));
				} elseif (in_array($lowerExplicit, ['currency_code', 'currency-code', 'currencycode', 'iso_currency', 'iso-currency'], true)) {
					$fieldNode['options'] = $this->normalizeOptionItems(IntlCatalog::currencyOptions($onlyList, $excludeList, $preferredList));
				}
			}
		} elseif ($controlType === 'unit_number') {
			$rawUnits = $raw['units'] ?? $raw['currencies'] ?? null;
			if (is_array($rawUnits)) {
				$fieldNode['units'] = array_values(array_filter(array_map('strval', $rawUnits), static fn(string $s): bool => trim($s) !== ''));
			} elseif (is_string($rawUnits) && trim($rawUnits) !== '') {
				$fieldNode['units'] = self::normalizeMediaTokenList($rawUnits, false);
			}
			$rawDefaultUnit = trim((string) ($raw['defaultUnit'] ?? $raw['default_unit'] ?? ''));
			if ($rawDefaultUnit !== '') {
				$fieldNode['defaultUnit'] = $rawDefaultUnit;
			}
			$rawUnitVariant = strtolower(trim((string) ($raw['unitVariant'] ?? $raw['unit_variant'] ?? '')));
			$rawExplicitCurrency = is_scalar($raw['currency'] ?? null) ? trim((string) $raw['currency']) : '';
			$isCurrencyVariant = $rawUnitVariant === 'currency'
				|| $explicitType === 'currency'
				|| $explicitType === 'money'
				|| $rawExplicitCurrency !== ''
				|| isset($raw['currencies']);
			if ($rawUnitVariant !== '') {
				$fieldNode['unitVariant'] = $rawUnitVariant;
			} elseif ($isCurrencyVariant) {
				$fieldNode['unitVariant'] = 'currency';
			}
			$unitFallback = ($fieldNode['units'][0] ?? '');
			$rawCurrency = $rawExplicitCurrency !== ''
				? $rawExplicitCurrency
				: ($isCurrencyVariant ? ($rawDefaultUnit !== '' ? $rawDefaultUnit : ($unitFallback !== '' ? $unitFallback : 'EUR')) : '');
			if ($rawCurrency !== '') {
				$fieldNode['currency'] = $rawCurrency;
			}
			if (isset($raw['precision']) && is_numeric($raw['precision'])) {
				$fieldNode['precision'] = max(0, min(10, (int) $raw['precision']));
			}
			$rawLocale = trim((string) ($raw['locale'] ?? ''));
			if ($rawLocale !== '') {
				$fieldNode['locale'] = $rawLocale;
			}
		} elseif ($controlType === 'segmented') {
			if (array_key_exists('iconOnly', $raw) || array_key_exists('icon_only', $raw)) {
				$fieldNode['iconOnly'] = !empty($raw['iconOnly'] ?? $raw['icon_only'] ?? null);
			}
			if (array_key_exists('fullWidth', $raw) || array_key_exists('full_width', $raw)) {
				$fieldNode['fullWidth'] = !empty($raw['fullWidth'] ?? $raw['full_width'] ?? null);
			}
			if (array_key_exists('useDeselect', $raw) || array_key_exists('use_deselect', $raw)) {
				$fieldNode['useDeselect'] = !empty($raw['useDeselect'] ?? $raw['use_deselect'] ?? null);
			}
		} elseif ($controlType === 'spacing') {
			if (isset($raw['units']) && is_array($raw['units'])) {
				$fieldNode['units'] = array_values(array_filter(array_map('strval', $raw['units']), static fn(string $s): bool => trim($s) !== ''));
			}
			$rawDefaultUnit = trim((string) ($raw['defaultUnit'] ?? $raw['default_unit'] ?? ''));
			if ($rawDefaultUnit !== '') {
				$fieldNode['defaultUnit'] = $rawDefaultUnit;
			}
			if (isset($raw['sides']) && is_array($raw['sides'])) {
				$fieldNode['sides'] = array_values(array_filter(array_map('strval', $raw['sides']), static fn(string $s): bool => in_array($s, ['top', 'right', 'bottom', 'left'], true)));
			}
			if (array_key_exists('allowAuto', $raw) || array_key_exists('allow_auto', $raw)) {
				$fieldNode['allowAuto'] = !empty($raw['allowAuto'] ?? $raw['allow_auto'] ?? null);
			}
			if (array_key_exists('allowNegative', $raw) || array_key_exists('allow_negative', $raw)) {
				$fieldNode['allowNegative'] = !empty($raw['allowNegative'] ?? $raw['allow_negative'] ?? null);
			}
			if (array_key_exists('clearable', $raw)) {
				$fieldNode['clearable'] = (bool) $raw['clearable'];
			}
		} elseif ($controlType === 'otp') {
			$rawOtpLen = $raw['otpLength'] ?? $raw['otp_length'] ?? $raw['length'] ?? null;
			if (is_numeric($rawOtpLen)) {
				$fieldNode['otpLength'] = max(4, min(12, (int) $rawOtpLen));
			}
			$rawOtpMode = strtolower(trim((string) ($raw['otpMode'] ?? $raw['otp_mode'] ?? '')));
			if (in_array($rawOtpMode, ['numeric', 'alphanumeric'], true)) {
				$fieldNode['otpMode'] = $rawOtpMode;
			}
			$rawSep = $raw['otpSeparatorAfter'] ?? $raw['otp_separator_after'] ?? null;
			if (is_numeric($rawSep)) {
				$fieldNode['otpSeparatorAfter'] = max(0, (int) $rawSep);
			}
			if (array_key_exists('mask', $raw)) {
				$fieldNode['mask'] = !empty($raw['mask']);
			}
			if (array_key_exists('clearable', $raw)) {
				$fieldNode['clearable'] = (bool) $raw['clearable'];
			}
		} elseif ($controlType === 'password') {
			if (array_key_exists('showStrength', $raw) || array_key_exists('show_strength', $raw)) {
				$fieldNode['showStrength'] = (bool) ($raw['showStrength'] ?? $raw['show_strength'] ?? false);
			}
			if (array_key_exists('showRequirements', $raw) || array_key_exists('show_requirements', $raw)) {
				$fieldNode['showRequirements'] = (bool) ($raw['showRequirements'] ?? $raw['show_requirements'] ?? false);
			}
			if (array_key_exists('allowGenerate', $raw) || array_key_exists('allow_generate', $raw)) {
				$fieldNode['allowGenerate'] = !empty($raw['allowGenerate'] ?? $raw['allow_generate'] ?? null);
			}
			if (array_key_exists('requireUppercase', $raw) || array_key_exists('require_uppercase', $raw)) {
				$fieldNode['requireUppercase'] = (bool) ($raw['requireUppercase'] ?? $raw['require_uppercase'] ?? false);
			}
			if (array_key_exists('requireLowercase', $raw) || array_key_exists('require_lowercase', $raw)) {
				$fieldNode['requireLowercase'] = (bool) ($raw['requireLowercase'] ?? $raw['require_lowercase'] ?? false);
			}
			if (array_key_exists('requireNumber', $raw) || array_key_exists('require_number', $raw)) {
				$fieldNode['requireNumber'] = (bool) ($raw['requireNumber'] ?? $raw['require_number'] ?? false);
			}
			if (array_key_exists('requireSymbol', $raw) || array_key_exists('require_symbol', $raw)) {
				$fieldNode['requireSymbol'] = !empty($raw['requireSymbol'] ?? $raw['require_symbol'] ?? null);
			}
			if (array_key_exists('confirmPassword', $raw) || array_key_exists('confirm_password', $raw)) {
				$fieldNode['confirmPassword'] = !empty($raw['confirmPassword'] ?? $raw['confirm_password'] ?? null);
			}
			$rawAutoComplete = $raw['autoComplete'] ?? $raw['auto_complete'] ?? null;
			if ($rawAutoComplete !== null) {
				$fieldNode['autoComplete'] = (string) $rawAutoComplete;
			}
		} elseif ($controlType === 'range_slider') {
			$fieldNode['rangeMode'] = 'dual';
			$fieldNode['dual'] = true;
			$rawMinDist = $raw['minDistance'] ?? $raw['min_distance'] ?? null;
			if (is_numeric($rawMinDist)) {
				$fieldNode['minDistance'] = str_contains((string) $rawMinDist, '.') ? (float) $rawMinDist : (int) $rawMinDist;
			}
		} elseif ($controlType === 'markdown') {
			$rawPreviewMode = strtolower(trim((string) ($raw['previewMode'] ?? $raw['preview_mode'] ?? '')));
			if (in_array($rawPreviewMode, ['write', 'preview', 'split'], true)) {
				$fieldNode['previewMode'] = $rawPreviewMode;
			}
			if (array_key_exists('allowSplit', $raw) || array_key_exists('allow_split', $raw)) {
				$fieldNode['allowSplit'] = (bool) ($raw['allowSplit'] ?? $raw['allow_split'] ?? false);
			}
			if (array_key_exists('showToolbar', $raw) || array_key_exists('show_toolbar', $raw)) {
				$fieldNode['showToolbar'] = (bool) ($raw['showToolbar'] ?? $raw['show_toolbar'] ?? false);
			}
		} elseif ($controlType === 'condition_builder') {
			$rawConditionFields = $raw['conditionFields'] ?? $raw['condition_fields'] ?? null;
			if ($rawConditionFields !== null) {
				$fieldNode['conditionFields'] = $this->normalizeConditionFields($rawConditionFields);
			} elseif (!isset($fieldNode['conditionFields'])) {
				$fieldNode['conditionFields'] = [];
			}
		}
	}

	/**
	 * Serialize an `InputfieldText` configured via `rwControl` onto a rich extended control node.
	 *
	 * @param array<string, mixed> $attrs
	 * @param array<string, mixed> $base
	 * @return array<string, mixed>
	 */
	private function serializeExtendedTextInputfield(
		Inputfield $inputfield,
		array $attrs,
		array $base,
		string $controlType,
		string $explicitControl = '',
	): array {
		$bag = $this->collectInputfieldExtendedBag($inputfield, $attrs);
		$rawVal = $attrs['value'] ?? $inputfield->val() ?? '';
		$valStr = is_scalar($rawVal) ? (string) $rawVal : '';
		$min = $attrs['min'] ?? $inputfield->getSetting('min');
		$max = $attrs['max'] ?? $inputfield->getSetting('max');
		$step = $attrs['step'] ?? $inputfield->getSetting('step');
		$fallbackUnit = $this->resolveUnitNumberFallbackUnit($bag, $explicitControl);

		$control = match ($controlType) {
			'date', 'time', 'datetime' => array_merge($base, [
				'type' => $controlType,
				'inputType' => $controlType === 'datetime' ? 'datetime-local' : $controlType,
				'defaultValue' => $valStr,
				'value' => $valStr,
				'min' => $min !== null && $min !== '' ? (string) $min : null,
				'max' => $max !== null && $max !== '' ? (string) $max : null,
			]),
			'combobox', 'segmented' => (function () use ($base, $controlType, $rawVal, $valStr, $bag, $explicitControl): array {
				$isMulti = !empty($bag['multiple']) || strtolower(trim($explicitControl)) === 'countries';
				$multiVals = [];
				if ($isMulti) {
					if (is_string($rawVal) && str_starts_with(trim($rawVal), '[')) {
						$decodedMulti = json_decode(trim($rawVal), true);
						if (is_array($decodedMulti)) {
							$multiVals = $this->normalizeTagListValue($decodedMulti);
						}
					} else {
						$multiVals = $this->normalizeTagListValue($rawVal);
					}
				}
				$rawOptions = $controlType === 'segmented'
					? ($bag['segmentedOptions'] ?? $bag['comboboxOptions'] ?? $bag['options'] ?? null)
					: ($bag['comboboxOptions'] ?? $bag['segmentedOptions'] ?? $bag['options'] ?? null);
				return array_merge($base, [
					'type' => $controlType,
					'multiple' => $isMulti,
					'defaultValue' => $isMulti ? $multiVals : $valStr,
					'value' => $isMulti ? $multiVals : $valStr,
					'values' => $isMulti ? $multiVals : ($valStr !== '' ? [$valStr] : []),
					'options' => $this->normalizeOptionItems(is_array($rawOptions) ? $rawOptions : []),
				]);
			})(),
			'phone' => array_merge($base, [
				'type' => 'phone',
				'inputType' => 'tel',
				'defaultValue' => $valStr,
				'value' => $valStr,
			]),
			'tags' => (function () use ($base, $rawVal, &$bag): array {
				$delimiter = (string) ($bag['delimiter'] ?? ',');
				$tagsArr = $this->normalizeTagListValue($rawVal, $delimiter);
				if (isset($bag['tagsList']) && !isset($bag['suggestions'])) {
					$bag['suggestions'] = self::normalizeMediaTokenList($bag['tagsList'], false);
				}
				return array_merge($base, [
					'type' => 'tags',
					'multiple' => true,
					'defaultValue' => $tagsArr,
					'value' => $tagsArr,
					'values' => $tagsArr,
					'options' => [],
				]);
			})(),
			'daterange' => (function () use ($base, $rawVal): array {
				$rangeVal = $this->normalizeDateRangeValue($rawVal);
				return array_merge($base, [
					'type' => 'daterange',
					'inputType' => 'text',
					'defaultValue' => $rangeVal,
					'value' => $rangeVal,
				]);
			})(),
			'unit_number' => (function () use ($base, $rawVal, $fallbackUnit, $min, $max, $step): array {
				$unitVal = $this->normalizeUnitNumberValue($rawVal, $fallbackUnit);
				return array_merge($base, [
					'type' => 'unit_number',
					'inputType' => 'number',
					'defaultValue' => $unitVal,
					'value' => $unitVal,
					'min' => $min !== null && $min !== '' ? (string) $min : null,
					'max' => $max !== null && $max !== '' ? (string) $max : null,
					'step' => $step !== null && $step !== '' ? (string) $step : null,
				]);
			})(),
			'spacing' => (function () use ($base, $rawVal, $fallbackUnit, $min, $max, $step): array {
				$spacingVal = $this->normalizeSpacingValue($rawVal, $fallbackUnit);
				return array_merge($base, [
					'type' => 'spacing',
					'inputType' => 'text',
					'defaultValue' => $spacingVal,
					'value' => $spacingVal,
					'min' => $min !== null && $min !== '' ? (string) $min : null,
					'max' => $max !== null && $max !== '' ? (string) $max : null,
					'step' => $step !== null && $step !== '' ? (string) $step : null,
				]);
			})(),
			'range_slider' => (function () use ($base, $rawVal, $min, $max, $step): array {
				$sliderVal = $this->normalizeRangeSliderValue($rawVal);
				return array_merge($base, [
					'type' => 'range_slider',
					'inputType' => 'range',
					'defaultValue' => $sliderVal,
					'value' => $sliderVal,
					'min' => $min !== null && $min !== '' ? (string) $min : null,
					'max' => $max !== null && $max !== '' ? (string) $max : null,
					'step' => $step !== null && $step !== '' ? (string) $step : null,
				]);
			})(),
			'password' => (function () use ($attrs, $base, $valStr): array {
				$secretMasked = $this->findDataAttribute($attrs, 'secret-masked');
				return array_merge($base, [
					'type' => 'password',
					'inputType' => 'password',
					'defaultValue' => $valStr,
					'value' => $valStr,
					'isSecret' => $secretMasked !== null,
					'secretMasked' => $secretMasked === '1',
				]);
			})(),
			'markdown' => array_merge($base, [
				'type' => 'markdown',
				'defaultValue' => $valStr,
				'value' => $valStr,
				'editorMode' => 'markdown',
				'rows' => max(3, (int) ($attrs['rows'] ?? $inputfield->getSetting('rows') ?? 6)),
			]),
			'rating' => array_merge($base, [
				'type' => 'rating',
				'inputType' => 'number',
				'defaultValue' => $valStr,
				'value' => $valStr,
				'maxStars' => max(2, min(10, (int) ($bag['maxStars'] ?? $max ?: 5))),
				'min' => $min !== null && $min !== '' ? (string) $min : null,
				'max' => $max !== null && $max !== '' ? (string) $max : null,
			]),
			'calculation' => array_merge($base, [
				'type' => 'calculation',
				'inputType' => 'number',
				'defaultValue' => $valStr,
				'value' => $valStr,
				'formula' => is_scalar($bag['formula'] ?? null) ? (string) $bag['formula'] : '',
				'precision' => is_numeric($bag['precision'] ?? null) ? (int) $bag['precision'] : 2,
			]),
			'condition_builder' => (function () use ($base, $rawVal): array {
				$normalizedCb = $this->normalizeConditionBuilderValue($rawVal);
				return array_merge($base, [
					'type' => 'condition_builder',
					'defaultValue' => $normalizedCb,
					'value' => $normalizedCb,
				]);
			})(),
			default => array_merge($base, [
				'type' => $controlType,
				'inputType' => 'text',
				'defaultValue' => $valStr,
				'value' => $valStr,
			]),
		};

		$this->applyExtendedControlOptions($controlType, $control, $bag, $explicitControl);

		return $control;
	}

	/**
	 * Extract language tab entries for a multilingual `Inputfield`.
	 *
	 * @return list<array{id: int, name: string, title: string, isDefault: bool, inputName: string, value: string}>
	 */
	private function extractLanguageValues(Inputfield $inputfield): array
	{
		$languages = $this->wire()->languages;
		if (!is_iterable($languages)) {
			return [];
		}

		$attrs = $inputfield->getAttributes();
		$fieldName = (string) ($attrs['name'] ?? $inputfield->attr('name') ?? '');
		$fieldId = (string) ($attrs['id'] ?? ($fieldName !== '' ? 'Inputfield_' . $fieldName : ''));
		$result = [];

		foreach ($languages as $lang) {
			if (!$lang instanceof Language) {
				continue;
			}
			$isDefault = $lang->isDefault();
			$langId = (int) $lang->id;
			$valKey = $isDefault ? 'value' : "value{$langId}";
			$val = $attrs[$valKey] ?? $inputfield->get($valKey) ?? ($isDefault ? $inputfield->val() : '');
			$editable = is_object($languages) && method_exists($languages, 'editable') ? (bool) $languages->editable($lang) : true;

			$result[] = [
				'id' => $langId,
				'name' => (string) $lang->name,
				'title' => (string) ($lang->get('title|name') ?: $lang->name),
				'isDefault' => $isDefault,
				'editable' => $editable,
				'inputName' => $isDefault ? $fieldName : "{$fieldName}__{$langId}",
				'inputId' => $isDefault ? $fieldId : "{$fieldId}__{$langId}",
				'value' => is_scalar($val) ? (string) $val : '',
			];
		}

		return $result;
	}

	/**
	 * Extract options and optgroups from an `InputfieldSelect` or derivative.
	 *
	 * @return list<array{value: string, label: string, disabled?: bool, group?: string}>
	 */
	private function extractSelectOptions(Inputfield $inputfield): array
	{
		if (!method_exists($inputfield, 'getOptions')) {
			return [];
		}

		$rawOptions = $inputfield->getOptions();
		if (!is_array($rawOptions)) {
			return [];
		}

		$optionAttrs = method_exists($inputfield, 'getOptionAttributes') ? $inputfield->getOptionAttributes() : [];
		$result = [];

		$buildOptionEntry = function (string $valStr, string $label, ?string $group = null) use ($optionAttrs): array {
			$attrs = is_array($optionAttrs[$valStr] ?? null) ? $optionAttrs[$valStr] : [];
			$entry = [
				'value' => $valStr,
				'label' => $label,
				'disabled' => !empty($attrs['disabled']),
			];
			if ($group !== null) {
				$entry['group'] = $group;
			}
			foreach (['data-icon' => 'icon', 'data-description' => 'description', 'data-subtitle' => 'subtitle'] as $attrKey => $propKey) {
				if (isset($attrs[$attrKey]) && is_string($attrs[$attrKey]) && $attrs[$attrKey] !== '') {
					$entry[$propKey] = $propKey === 'icon' ? $this->normalizeIcon($attrs[$attrKey]) : $attrs[$attrKey];
				}
			}
			return $entry;
		};

		foreach ($rawOptions as $key => $labelOrGroup) {
			if (is_array($labelOrGroup)) {
				$groupLabel = (string) $key;
				foreach ($labelOrGroup as $subVal => $subLabel) {
					$result[] = $buildOptionEntry((string) $subVal, (string) $subLabel, $groupLabel);
				}
			} else {
				$result[] = $buildOptionEntry((string) $key, (string) $labelOrGroup);
			}
		}

		return $result;
	}

	/**
	 * Serialize a declarative relation field (`relation`, `m2o`, `m2m`, `o2m`, `m2a`, `page`) into a `SchemaForm` control node.
	 *
	 * @param array<string, mixed> $raw
	 * @param array<string, string> $conditions
	 * @param array<string, mixed> $validation
	 * @param array<string, mixed> $values
	 * @return array<string, mixed>
	 */
	private function serializeDeclarativeRelation(
		string $name,
		string $type,
		array $raw,
		mixed $val,
		string $err,
		array $conditions,
		array $validation,
		array &$values,
	): array {
		$cardinality = strtolower(trim((string) ($raw['cardinality'] ?? '')));
		if (!in_array($cardinality, ['m2o', 'm2m', 'o2m', 'm2a'], true)) {
			$cardinality = match ($type) {
				'm2m', 'o2m', 'm2a' => $type,
				default => !empty($raw['multiple']) ? 'm2m' : 'm2o',
			};
		}

		$helper = match ($cardinality) {
			'm2m' => new InputfieldReactM2M(),
			'o2m' => new InputfieldReactO2M(),
			'm2a' => new InputfieldReactM2A(),
			default => new InputfieldReactM2O(),
		};
		if ($this->wire() !== null) {
			$this->wire($helper);
		}

		$helper->attr('name', $name);
		$helper->attr('id', (string) ($raw['id'] ?? ('Inputfield_' . $name)));

		$settingKeys = [
			'resource',
			'targetResource',
			'allowedResources',
			'dependsResourceMap',
			'dependsOn',
			'dependsParam',
			'valueField',
			'widget',
			'layout',
			'selector',
			'templates',
			'templateIds',
			'parentId',
			'fieldtypes',
			'roles',
			'prefix',
			'implements',
			'blueprintType',
			'includeSystem',
			'excludeGuest',
			'excludeSuperuser',
			'allowUnpub',
			'allowCustom',
			'creatable',
			'createParentId',
			'createTemplate',
			'editableLink',
			'allowLink',
			'allowUnlink',
			'foreignField',
			'ownerId',
			'multiple',
			'sortable',
			'minItems',
			'maxItems',
			'optionColumns',
			'placeholder',
			'limit',
		];

		foreach ($settingKeys as $settingKey) {
			if (array_key_exists($settingKey, $raw)) {
				$helper->set($settingKey, $raw[$settingKey]);
			}
		}

		if (!array_key_exists('resource', $raw) && $type === 'page') {
			$helper->set('resource', 'page');
		}
		if (!empty($raw['readOnly']) || !empty($raw['readonly']) || !empty($raw['disabled'])) {
			$helper->set('readOnly', true);
		}
		if (isset($validation['minItems']) && !array_key_exists('minItems', $raw)) {
			$helper->set('minItems', (int) $validation['minItems']);
		}
		if (isset($validation['maxItems']) && !array_key_exists('maxItems', $raw)) {
			$helper->set('maxItems', (int) $validation['maxItems']);
		}

		if ($cardinality !== 'o2m') {
			$helper->attr('value', $val);
		}

		$relData = $helper->inertiaWithData();
		$relVal = $relData['value'] ?? (!empty($relData['multiple']) ? [] : '');
		if ($cardinality !== 'o2m') {
			$values[$name] = $relVal;
		} else {
			unset($values[$name]);
		}

		return array_merge($relData, [
			'kind' => 'control',
			'type' => 'relation',
			'id' => (string) ($raw['id'] ?? ('Inputfield_' . $name)),
			'name' => $name,
			'label' => (string) ($raw['label'] ?? $name),
			'description' => (string) ($raw['description'] ?? ''),
			'notes' => (string) ($raw['notes'] ?? ''),
			'icon' => $this->normalizeIcon((string) ($raw['icon'] ?? '')),
			'required' => !empty($validation['required']),
			'disabled' => !empty($raw['disabled']),
			'readOnly' => !empty($raw['readOnly']) || !empty($raw['readonly']) || !empty($relData['readOnly']),
			'width' => max(10, min(100, (int) ($raw['width'] ?? $raw['columnWidth'] ?? $raw['column_width'] ?? 100))),
			'placeholder' => (string) ($raw['placeholder'] ?? $relData['placeholder'] ?? ''),
			'defaultValue' => $relVal,
			'value' => $relVal,
			'values' => is_array($relVal) ? $relVal : [],
			'showIf' => $conditions['show'],
			'hideIf' => $conditions['hide'],
			'enableIf' => $conditions['enable'],
			'disableIf' => $conditions['disable'],
			'requiredIf' => $conditions['require'],
			'conditions' => $conditions,
			'validation' => $validation,
			'stepIndex' => (int) ($raw['stepIndex'] ?? $raw['step_index'] ?? 1),
			'stepTitle' => (string) ($raw['stepTitle'] ?? $raw['step_title'] ?? ''),
			'error' => $err,
		]);
	}

	/**
	 * Convert a native ProcessWire `InputfieldPage` into a `type: 'relation'` control node.
	 *
	 * @param array<string, mixed> $base
	 * @return array<string, mixed>
	 */
	private function serializeNativePageControl(Inputfield $inputfield, array $base): array
	{
		$delegate = null;
		if ($inputfield instanceof InputfieldPage) {
			try {
				$delegate = $inputfield->getInputfield();
			} catch (\Throwable) {
				$delegate = null;
			}
		}

		if ($delegate instanceof AbstractInputfieldReactRelation) {
			$name = (string) ($base['name'] ?? $inputfield->attr('name') ?? '');
			if ($name !== '') {
				$delegate->attr('name', $name);
			}
			foreach (['resource', 'widget', 'valueField', 'excludeGuest', 'excludeSuperuser', 'includeSystem', 'allowUnpub', 'creatable', 'editableLink', 'placeholder'] as $relKey) {
				$parentVal = $inputfield->getSetting($relKey) ?? $inputfield->get($relKey);
				if ($parentVal !== null && $parentVal !== '') {
					$delegate->set($relKey, $parentVal);
				}
			}
			if (!empty($base['readOnly']) || !empty($base['disabled'])) {
				$delegate->set('readOnly', true);
			}
			$relData = $delegate->inertiaWithData();
			$relVal = $relData['value'] ?? (!empty($relData['multiple']) ? [] : '');

			return array_merge($base, $relData, [
				'type' => 'relation',
				'name' => $name,
				'defaultValue' => $relVal,
				'value' => $relVal,
				'values' => is_array($relVal) ? $relVal : [],
			]);
		}

		$configuredClass = trim((string) ($inputfield->getSetting('inputfield') ?: $inputfield->get('inputfield') ?: ''));
		if ($configuredClass === '' && $delegate instanceof Inputfield) {
			$configuredClass = $this->shortClassName($delegate);
		}

		$derefAsPage = $inputfield->getSetting('derefAsPage') ?? $inputfield->get('derefAsPage');
		$isMultiple = false;
		if ($delegate instanceof Inputfield) {
			$isMultiple = $delegate instanceof InputfieldHasArrayValue
				|| in_array($configuredClass, ['InputfieldCheckboxes', 'InputfieldAsmSelect', 'InputfieldSelectMultiple', 'InputfieldPageListSelectMultiple'], true);
			if ($configuredClass === 'InputfieldPageAutocomplete' || $configuredClass === 'InputfieldTextTags') {
				$maxSelected = (int) ($delegate->getSetting('maxSelectedItems') ?? $inputfield->getSetting('maxSelectedItems') ?? 0);
				$isMultiple = $derefAsPage !== null ? ((int) $derefAsPage === 0 && $maxSelected !== 1) : ($maxSelected !== 1);
			}
		} elseif ($derefAsPage !== null) {
			$isMultiple = (int) $derefAsPage === 0;
		} else {
			$isMultiple = in_array($configuredClass, [
				'InputfieldCheckboxes',
				'InputfieldAsmSelect',
				'InputfieldSelectMultiple',
				'InputfieldPageListSelectMultiple',
				'InputfieldReactM2M',
			], true);
		}

		$helper = $isMultiple ? new InputfieldReactM2M() : new InputfieldReactM2O();
		if ($this->wire() !== null) {
			$this->wire($helper);
		}

		$name = (string) ($base['name'] ?? $inputfield->attr('name') ?? '');
		$helper->attr('name', $name);
		$helper->attr('id', (string) ($base['id'] ?? ('Inputfield_' . $name)));
		$explicitResource = trim((string) ($inputfield->getSetting('resource') ?? $inputfield->get('resource') ?? ''));
		$helper->set('resource', $explicitResource !== '' ? $explicitResource : 'page');
		$helper->set('parent_id', (int) ($inputfield->getSetting('parent_id') ?? $inputfield->get('parent_id') ?? 0));
		$helper->set('template_id', (int) ($inputfield->getSetting('template_id') ?? $inputfield->get('template_id') ?? 0));
		$tplIds = $inputfield->getSetting('template_ids') ?? $inputfield->get('template_ids');
		if (is_array($tplIds)) {
			$helper->set('template_ids', $tplIds);
		}

		$selector = trim((string) (
			$inputfield->getSetting('findPagesSelector')
			?: $inputfield->get('findPagesSelector')
			?: $inputfield->getSetting('findPagesSelect')
			?: $inputfield->get('findPagesSelect')
			?: ''
		));
		if ($selector !== '') {
			$helper->set('findPagesSelector', $selector);
			if ($explicitResource === '' && preg_match('/\btemplate\s*=\s*user\b/i', $selector) === 1) {
				$helper->set('resource', 'user');
				$helper->set('excludeGuest', false);
			}
		}
		$excludeGuestSetting = $inputfield->getSetting('excludeGuest') ?? $inputfield->get('excludeGuest');
		if ($excludeGuestSetting !== null) {
			$helper->set('excludeGuest', (bool) $excludeGuestSetting);
		}

		$helper->set('allowUnpub', (bool) ($inputfield->getSetting('allowUnpub') ?? $inputfield->get('allowUnpub')));
		$helper->set('addable', (bool) ($inputfield->getSetting('addable') ?? $inputfield->get('addable')));
		$helper->set('readOnly', !empty($base['readOnly']) || !empty($base['disabled']));
		$helper->set('placeholder', (string) ($base['placeholder'] ?? ''));

		$hasPage = $inputfield->getSetting('hasPage') ?? $inputfield->get('hasPage');
		if ($hasPage !== null) {
			$helper->set('hasPage', $hasPage);
		}

		$mappedWidget = match ($configuredClass) {
			'InputfieldPageListSelect', 'InputfieldPageListSelectMultiple' => 'treeselect',
			'InputfieldPageAutocomplete' => $isMultiple ? 'multiautocomplete' : 'autocomplete',
			'InputfieldCheckboxes' => 'checkboxes',
			'InputfieldRadios' => 'radios',
			'InputfieldAsmSelect', 'InputfieldSelectMultiple', 'InputfieldTextTags' => 'multiselect',
			'InputfieldSelect' => 'select',
			default => 'auto',
		};
		$helper->set('widget', $mappedWidget);
		if ($delegate instanceof Inputfield && $mappedWidget === 'checkboxes') {
			$helper->set('optionColumns', (int) ($delegate->getSetting('optionColumns') ?? 0));
		}

		$helper->setAttribute('value', $inputfield->attr('value'));
		$relData = $helper->inertiaWithData();
		$relVal = $relData['value'] ?? ($isMultiple ? [] : '');

		return array_merge($base, $relData, [
			'type' => 'relation',
			'name' => $name,
			'defaultValue' => $relVal,
			'value' => $relVal,
			'values' => is_array($relVal) ? $relVal : [],
		]);
	}

	/**
	 * Serialize a polymorphic `type: 'link'` control node with signed `relationTokens`, per-profile `mediaTokens`,
	 * and hydrated initial target/media metadata.
	 *
	 * @param array<string, mixed> $base
	 * @param array<string, mixed> $rawConfig
	 * @return array<string, mixed>
	 */
	private function serializeLinkControl(
		array $base,
		array $rawConfig,
		mixed $rawVal,
		bool $isReadOnly,
		?Inputfield $sourceInputfield = null,
	): array {
		$workspace = React::instance($this);
		$relations = $workspace->relations();
		$signer = $workspace->relationSigner();
		$gateway = $workspace->media();

		$builtInScalarTypes = ['url', 'email', 'tel'];
		$configuredTypes = self::normalizeStringList($rawConfig['types'] ?? $rawConfig['linkTypes'] ?? []);
		if ($configuredTypes === []) {
			$configuredTypes = InputfieldReactLink::DEFAULT_TYPES;
		}

		$mediaProfiles = InputfieldReactLink::normalizeMediaProfiles(
			$rawConfig['media'] ?? $rawConfig['mediaProfiles'] ?? '',
			$configuredTypes,
		);

		$typeLabels = isset($rawConfig['typeLabels']) && is_array($rawConfig['typeLabels']) ? $rawConfig['typeLabels'] : [];
		foreach ($mediaProfiles as $pKey => $pDef) {
			if (!isset($typeLabels[$pKey]) || trim((string) $typeLabels[$pKey]) === '') {
				$typeLabels[$pKey] = $pDef['label'];
			}
		}

		$types = [];
		foreach ($configuredTypes as $t) {
			$cleanType = strtolower(trim($t));
			if ($cleanType === 'anchor') {
				$cleanType = 'url';
			}
			if ($cleanType === '' || in_array($cleanType, $types, true)) {
				continue;
			}
			if (
				in_array($cleanType, $builtInScalarTypes, true)
				|| isset($mediaProfiles[$cleanType])
				|| $relations->has($cleanType)
				|| isset($typeLabels[$cleanType])
			) {
				$types[] = $cleanType;
			}
		}
		foreach (array_keys($mediaProfiles) as $pKey) {
			if (!in_array($pKey, $types, true)) {
				$types[] = $pKey;
			}
		}
		if ($types === []) {
			$types = ['url'];
		}

		$defaultType = strtolower(trim((string) ($rawConfig['defaultType'] ?? $types[0])));
		if ($defaultType === 'anchor') {
			$defaultType = 'url';
		}
		if (!in_array($defaultType, $types, true)) {
			$defaultType = $types[0];
		}

		$normVal = self::normalizeLinkPayload($rawVal, $defaultType);
		if (!in_array($normVal['type'], $types, true)) {
			$normVal['type'] = $defaultType;
		}

		$selector = isset($rawConfig['selector']) && is_string($rawConfig['selector']) ? trim($rawConfig['selector']) : '';
		$templates = self::normalizeStringList($rawConfig['templates'] ?? []);
		$parentId = isset($rawConfig['parentId']) && is_numeric($rawConfig['parentId']) ? max(0, (int) $rawConfig['parentId']) : 0;
		$blueprintType = isset($rawConfig['blueprintType']) && is_string($rawConfig['blueprintType']) ? trim($rawConfig['blueprintType']) : '';

		$relationTokens = [];
		$envelopesByType = [];
		foreach ($types as $t) {
			if (!$relations->has($t)) {
				continue;
			}
			$env = [
				'cardinality' => 'm2o',
				'resource' => $t,
				'readOnly' => $isReadOnly,
				'limit' => 25,
			];
			if ($selector !== '') {
				$env['selector'] = $selector;
			}
			if ($t === 'page') {
				if ($templates !== []) {
					$env['templates'] = $templates;
				}
				if ($parentId > 0) {
					$env['parentId'] = $parentId;
				}
			} elseif ($blueprintType !== '') {
				$env['blueprintType'] = $blueprintType;
			}
			$envelopesByType[$t] = $env;
			$relationTokens[$t] = $signer->sign($env);
		}

		$selectedTarget = null;
		$activeType = $normVal['type'];
		if ($relations->has($activeType) && isset($envelopesByType[$activeType])) {
			$targetIdentifier = $activeType === 'page'
				? ($normVal['pageId'] > 0 ? (string) $normVal['pageId'] : '')
				: $normVal['entryId'];
			if ($targetIdentifier !== '') {
				try {
					$hydrated = $relations->get($activeType)->hydrate([$targetIdentifier], $envelopesByType[$activeType]);
					if (isset($hydrated[0])) {
						$selectedTarget = $hydrated[0]->toArray();
					}
				} catch (\Throwable) {
					$selectedTarget = null;
				}
			}
		}

		$ownerId = isset($rawConfig['ownerId']) && is_string($rawConfig['ownerId']) ? trim($rawConfig['ownerId']) : '';
		if ($ownerId === '' && $sourceInputfield instanceof Inputfield) {
			$hostCandidate = $sourceInputfield->hasPage;
			if ($hostCandidate instanceof Page && method_exists($hostCandidate, 'getEntryUuid')) {
				$ownerId = trim((string) $hostCandidate->getEntryUuid());
			}
		}

		$inputName = (string) ($base['name'] ?? ($sourceInputfield?->attr('name') ?? ''));
		$currentUid = (int) $this->wire()->user->id;
		$serializedProfiles = [];
		foreach ($mediaProfiles as $pKey => $pDef) {
			$mediaToken = '';
			$baseMediaEnv = null;
			if ($sourceInputfield instanceof Inputfield) {
				$baseMediaEnv = $gateway->buildEnvelopeFromInputfield(
					$sourceInputfield,
					(bool) $pDef['isImage'],
					$inputName,
					$pDef['extensions'],
					$isReadOnly,
				);
			}
			if (!is_array($baseMediaEnv) && $ownerId !== '' && $gateway->hasHostAdapter('entry')) {
				$declFieldName = isset($rawConfig['fieldName']) && is_string($rawConfig['fieldName']) && trim($rawConfig['fieldName']) !== ''
					? trim($rawConfig['fieldName'])
					: $inputName;
				$baseMediaEnv = [
					'kind' => 'entry',
					'entryUuid' => $ownerId,
					'entryType' => isset($rawConfig['entryType']) && is_string($rawConfig['entryType']) ? trim($rawConfig['entryType']) : '',
					'fieldName' => $declFieldName,
					'inputName' => $inputName,
					'readOnly' => $isReadOnly,
				];
			}
			if (is_array($baseMediaEnv)) {
				if ($ownerId === '' && !empty($baseMediaEnv['entryUuid']) && is_string($baseMediaEnv['entryUuid'])) {
					$ownerId = trim($baseMediaEnv['entryUuid']);
				}
				$profileEnv = array_merge($baseMediaEnv, [
					'mediaProfile' => $pKey,
					'isImage' => (bool) $pDef['isImage'],
					'extensions' => $pDef['extensions'],
					'maxFiles' => 1,
					'maxFilesize' => (int) $pDef['maxFilesize'],
					'useImageEditor' => (bool) $pDef['isImage'],
				]);
				$mediaToken = $gateway->sign($profileEnv, $currentUid);
			}
			$serializedProfiles[$pKey] = [
				'key' => $pDef['key'],
				'kind' => $pDef['kind'],
				'isImage' => $pDef['isImage'],
				'isVideo' => $pDef['isVideo'],
				'label' => $pDef['label'],
				'icon' => $pDef['icon'],
				'extensions' => $pDef['extensions'],
				'accept' => $pDef['accept'],
				'maxFilesize' => $pDef['maxFilesize'],
				'mediaToken' => $mediaToken,
			];
		}

		$selectedMedia = null;
		if (isset($mediaProfiles[$activeType])) {
			$rawMediaRef = $normVal['file'] !== '' ? $normVal['file'] : $normVal['url'];
			if ($rawMediaRef !== '') {
				$bn = basename($rawMediaRef);
				$ext = strtolower(pathinfo($bn, PATHINFO_EXTENSION));
				$mediaUrl = '';
				$thumbUrl = '';
				$sizeBytes = 0;
				$width = 0;
				$height = 0;

				if (!str_contains($rawMediaRef, '/') && $bn !== '' && $sourceInputfield instanceof Inputfield) {
					$hostPage = $sourceInputfield->hasPage;
					if (!$hostPage instanceof Page || (int) $hostPage->id <= 0) {
						$proc = $this->wire()->process;
						if ($proc instanceof \ProcessWire\WirePageEditor) {
							try {
								$cand = $proc->getPage();
								if ($cand instanceof Page && $cand->id > 0) {
									$hostPage = $cand;
								}
							} catch (\Throwable) {
								$hostPage = null;
							}
						}
					}
					$diskDir = '';
					$urlDir = '';
					if ($hostPage instanceof Page && method_exists($hostPage, 'getEntryUuid')) {
						$diskDir = rtrim($hostPage->filesManager()->path(), '/') . '/';
						$urlDir = rtrim($hostPage->filesManager()->url(), '/') . '/';
					} elseif ($hostPage instanceof Page && $hostPage->id > 0) {
						$hasField = $sourceInputfield->hasField;
						$explicitDataField = $sourceInputfield->get('_rwDataFieldName');
						$fName = $hasField instanceof \ProcessWire\Field
							? (string) $hasField->name
							: (is_string($explicitDataField) && $explicitDataField !== ''
								? $explicitDataField
								: (string) preg_replace('/_repeater\d+$/', '', $inputName));
						$diskDir = PageLinkMediaHostAdapter::directoryPathFor($hostPage, $fName);
						$urlDir = PageLinkMediaHostAdapter::directoryUrlFor($hostPage, $fName);
					}
					if ($diskDir !== '' && is_file($diskDir . $bn)) {
						$mediaUrl = $urlDir . rawurlencode($bn);
						$sizeBytes = (int) (@filesize($diskDir . $bn) ?: 0);
						if ($mediaProfiles[$activeType]['isImage']) {
							$thumbUrl = $mediaUrl;
							if ($ext !== 'svg') {
								$dims = @getimagesize($diskDir . $bn);
								if (is_array($dims)) {
									$width = (int) $dims[0];
									$height = (int) $dims[1];
								}
							}
						}
					}
				}

				if ($mediaUrl === '' && (str_contains($rawMediaRef, '/') || str_starts_with($rawMediaRef, 'http'))) {
					$mediaUrl = $rawMediaRef;
					if ($mediaProfiles[$activeType]['isImage']) {
						$thumbUrl = $rawMediaRef;
					}
				}

				$selectedMedia = [
					'name' => $bn !== '' ? $bn : $rawMediaRef,
					'url' => $mediaUrl,
					'thumbUrl' => $thumbUrl,
					'ext' => $ext,
					'size' => $sizeBytes,
					'width' => $width,
					'height' => $height,
				];
			}
		}

		$featureFlags = InputfieldReactLink::normalizeFeatureFlags($rawConfig);
		$langTabs = [];
		$languages = $this->wire()->languages;
		$needsLanguages = $mediaProfiles !== [] || $featureFlags['enableLabel'] || $featureFlags['enableAriaLabel'];
		if ($needsLanguages && is_iterable($languages)) {
			foreach ($languages as $lang) {
				if (!$lang instanceof Language) {
					continue;
				}
				$isDef = $lang->isDefault();
				$langId = (int) $lang->id;
				$isEditable = is_object($languages) && method_exists($languages, 'editable')
					? (bool) $languages->editable($lang)
					: true;
				$langTabs[] = [
					'id' => $langId,
					'name' => (string) $lang->name,
					'title' => (string) ($lang->get('title|name') ?: $lang->name),
					'isDefault' => $isDef,
					'editable' => $isEditable,
					'inputName' => $isDef ? $inputName : "{$inputName}__{$langId}",
					'value' => '',
				];
			}
		}

		$rootUrl = rtrim((string) ($this->wire()->config->urls->root ?: '/'), '/') . '/';
		$linkConfig = array_merge(
			[
				'types' => $types,
				'defaultType' => $defaultType,
			],
			$featureFlags,
			[
				'relationEndpoint' => $rootUrl . '_react/relation',
				'relationTokens' => $relationTokens,
				'selectedTarget' => $selectedTarget,
				'mediaEndpoint' => $rootUrl . '_react/media',
				'mediaProfiles' => $serializedProfiles,
				'selectedMedia' => $selectedMedia,
				'ownerId' => $ownerId,
				'typeLabels' => $typeLabels,
				'languages' => count($langTabs) > 1 ? $langTabs : [],
			],
		);

		$result = array_merge($base, [
			'type' => 'link',
			'defaultValue' => $normVal,
			'value' => $normVal,
			'linkConfig' => $linkConfig,
		]);
		if ($ownerId !== '') {
			$result['ownerId'] = $ownerId;
		}

		return $result;
	}

	/**
	 * Normalize a raw link value into a canonical associative array for `SchemaForm`.
	 *
	 * @return array{
	 *   type: string,
	 *   pageId: int,
	 *   entryType: string,
	 *   entryId: string,
	 *   url: string,
	 *   file: string,
	 *   query: string,
	 *   anchor: string,
	 *   label: string,
	 *   ariaLabel: string,
	 *   target: string,
	 *   rel: string,
	 *   labels?: array<string, string>,
	 *   ariaLabels?: array<string, string>,
	 *   alt?: string,
	 *   descriptions?: array<string, string>,
	 *   focus?: string,
	 *   tags?: string
	 * }
	 */
	private static function normalizeLinkPayload(mixed $raw, string $defaultType = 'url'): array
	{
		return InputfieldReactLink::normalizeValue($raw, $defaultType);
	}

	/**
	 * Normalize a comma/space/pipe-separated string or string array into `list<string>`.
	 *
	 * @return list<string>
	 */
	private static function normalizeStringList(mixed $raw): array
	{
		if (is_string($raw)) {
			$raw = preg_split('/[\s,|]+/', trim($raw), -1, PREG_SPLIT_NO_EMPTY) ?: [];
		}
		if (!is_array($raw)) {
			return [];
		}
		$out = [];
		foreach ($raw as $item) {
			if (is_string($item)) {
				$clean = trim($item);
				if ($clean !== '' && !in_array($clean, $out, true)) {
					$out[] = $clean;
				}
			}
		}

		return $out;
	}

	/**
	 * Append a ProcessWire-native `Delete` confirmation tab (`data-confirm-delete="1"`) to an existing
	 * record's `InputfieldWrapper`, promoting flat single-pane forms into `[Configuration | Delete]`.
	 *
	 * @param array<string, mixed> $config
	 */
	public function appendDeleteTab(InputfieldWrapper $form, array $config = []): void
	{
		$confirmName = trim((string) ($config['name'] ?? '_delete_confirm'));
		if ($confirmName === '' || $form->getChildByName($confirmName) !== null || $this->hasConfirmDeleteTab($form)) {
			return;
		}

		$modules = $this->wire()->modules;
		$tabLabel = trim((string) ($config['tabLabel'] ?? $this->_('Delete')));
		$tabIcon = trim((string) ($config['tabIcon'] ?? 'trash'));
		$fieldLabel = trim((string) ($config['label'] ?? $this->_('Confirm Deletion')));
		$typeLabel = trim((string) ($config['typeLabel'] ?? $this->_('record')));
		$checkboxLabel = trim((string) ($config['checkboxLabel'] ?? sprintf($this->_('Permanently delete this %s on save'), $typeLabel)));
		$isRestricted = (bool) ($config['restricted'] ?? false);
		$restrictedDesc = trim((string) ($config['restrictedDescription'] ?? ''));
		$defaultDesc = trim((string) ($config['description'] ?? $this->_('Check this box and click Save to permanently delete this record. This action cannot be undone.')));
		$generalLabel = trim((string) ($config['generalLabel'] ?? $this->_('Configuration')));
		$generalIcon = trim((string) ($config['generalIcon'] ?? 'adjustments-horizontal'));

		/** @var InputfieldCheckbox $confirm */
		$confirm = $modules->get('InputfieldCheckbox');
		$confirm->attr('id+name', $confirmName);
		$confirm->attr('data-rw-confirm-delete', '1');
		$confirm->label = $fieldLabel;
		$confirm->icon = $tabIcon;
		$confirm->label2 = $checkboxLabel;
		if ($isRestricted) {
			$confirm->description = $restrictedDesc !== '' ? $restrictedDesc : $defaultDesc;
			$confirm->attr('disabled', 'disabled');
		} else {
			$confirm->description = $defaultDesc;
		}

		$existingTabGroup = null;
		$hasWireTabs = false;
		$firstSubmit = null;
		foreach ($form->children() as $child) {
			if ($child instanceof InputfieldSubmit && $firstSubmit === null) {
				$firstSubmit = $child;
			}
			if ($existingTabGroup === null && $child instanceof MarkupReactTab) {
				$existingTabGroup = $child;
			}
			if ($child instanceof Inputfield && $this->isWireTabWrapper($child)) {
				$hasWireTabs = true;
			}
		}

		if ($hasWireTabs && !$existingTabGroup instanceof MarkupReactTab) {
			$deleteWireTab = new InputfieldWrapper();
			$this->wire($deleteWireTab);
			$deleteWireTab->attr('id+name', '_tab_delete');
			$deleteWireTab->attr('title', $tabLabel);
			$deleteWireTab->attr('data-confirm-delete', '1');
			$deleteWireTab->set('confirmDelete', true);
			$deleteWireTab->icon = $tabIcon;
			$deleteWireTab->addClass('WireTab');
			$deleteWireTab->add($confirm);

			if ($firstSubmit instanceof InputfieldSubmit) {
				$form->insertBefore($deleteWireTab, $firstSubmit);
			} else {
				$form->add($deleteWireTab);
			}

			return;
		}

		/** @var MarkupReactTab|null $deletePane */
		$deletePane = $modules->get('MarkupReactTab');
		if (!$deletePane instanceof MarkupReactTab) {
			$deletePane = new MarkupReactTab();
			$this->wire($deletePane);
		}
		$deletePane->attr('id+name', '_tab_delete');
		$deletePane->attr('data-confirm-delete', '1');
		$deletePane->set('confirmDelete', true);
		$deletePane->label = $tabLabel;
		$deletePane->icon = $tabIcon;
		$deletePane->add($confirm);

		if ($existingTabGroup instanceof MarkupReactTab) {
			$existingTabGroup->add($deletePane);

			return;
		}

		/** @var MarkupReactTab|null $tabGroup */
		$tabGroup = $modules->get('MarkupReactTab');
		if (!$tabGroup instanceof MarkupReactTab) {
			$tabGroup = new MarkupReactTab();
			$this->wire($tabGroup);
		}
		$tabGroup->attr('id+name', 'rwtabgrp_editor');
		$tabGroup->set('variant', 'line');

		/** @var MarkupReactTab|null $configPane */
		$configPane = $modules->get('MarkupReactTab');
		if (!$configPane instanceof MarkupReactTab) {
			$configPane = new MarkupReactTab();
			$this->wire($configPane);
		}
		$configPane->attr('id+name', '_tab_general');
		$configPane->label = $generalLabel;
		$configPane->icon = $generalIcon;

		$movable = [];
		foreach ($form->children() as $child) {
			if ($child instanceof InputfieldSubmit) {
				continue;
			}
			if (!$child instanceof Inputfield || $child instanceof InputfieldHidden) {
				continue;
			}
			$movable[] = $child;
		}
		foreach ($movable as $field) {
			$form->remove($field);
			$configPane->add($field);
		}

		$tabGroup->add($configPane);
		$tabGroup->add($deletePane);
		if ($firstSubmit instanceof InputfieldSubmit) {
			$form->insertBefore($tabGroup, $firstSubmit);
		} else {
			$form->add($tabGroup);
		}
	}

	/**
	 * Determine whether a wrapper already carries a `Delete` confirmation tab (`data-confirm-delete="1"` or `confirmDelete`).
	 */
	private function hasConfirmDeleteTab(InputfieldWrapper $form): bool
	{
		foreach ($form->children() as $child) {
			if (!$child instanceof Inputfield) {
				continue;
			}
			if ($this->isWireTabWrapper($child)) {
				if ((bool) $child->get('confirmDelete') || $this->findDataAttribute($child->getAttributes(), 'confirm-delete') === '1') {
					return true;
				}
				continue;
			}
			if ($child instanceof MarkupReactTab) {
				if ((bool) $child->get('confirmDelete') || $this->findDataAttribute($child->getAttributes(), 'confirm-delete') === '1') {
					return true;
				}
				foreach ($child->children() as $pane) {
					if ($pane instanceof MarkupReactTab && ((bool) $pane->get('confirmDelete') || $this->findDataAttribute($pane->getAttributes(), 'confirm-delete') === '1')) {
						return true;
					}
				}
			}
		}

		return false;
	}

	/**
	 * Determine whether a declarative or serialized control represents a file/image media field.
	 *
	 * Media controls use `languages` for per-file descriptions/alt text rather than the primary filename array.
	 *
	 * @param array<string, mixed> $control
	 */
	private static function isMediaControlType(string $type, array $control = []): bool
	{
		if (!empty($control['isImage']) || !empty($control['isFile'])) {
			return true;
		}

		$normalized = strtolower(trim($type));
		return in_array($normalized, [
			'file',
			'files',
			'image',
			'images',
			'media',
			'react_file',
			'react_image',
			'inputfieldfile',
			'inputfieldimage',
			'inputfieldreactfile',
			'inputfieldreactimage',
		], true);
	}

	/**
	 * Extract non-empty filenames from a serialized `files` entry list.
	 *
	 * @return list<string>
	 */
	private static function extractFileNamesFromMediaList(mixed $files): array
	{
		if (!is_array($files)) {
			return [];
		}

		$names = [];
		foreach ($files as $entry) {
			if (!is_array($entry)) {
				continue;
			}
			$fileName = (string) ($entry['name'] ?? '');
			if ($fileName !== '') {
				$names[] = $fileName;
			}
		}

		return $names;
	}

	private function shortClassName(object $obj): string
	{
		$class = $obj::class;
		$pos = strrpos($class, '\\');

		return $pos !== false ? substr($class, $pos + 1) : $class;
	}

	private function normalizeIcon(string $icon): string
	{
		$trimmed = trim($icon);
		if ($trimmed === '') {
			return '';
		}
		$restored = str_ireplace(IconManager::ADMIN_SAFE_REPLACEMENT, 'fa-', $trimmed);
		if (str_starts_with($restored, 'fa-' . IconManager::ADMIN_PREFIX)) {
			return substr($restored, strlen('fa-' . IconManager::ADMIN_PREFIX));
		}
		if (str_starts_with($restored, IconManager::ADMIN_PREFIX)) {
			return substr($restored, strlen(IconManager::ADMIN_PREFIX));
		}
		if (str_starts_with($restored, 'fa-')) {
			return substr($restored, 3);
		}

		return $restored;
	}

	private function normalizeTabsLayout(mixed $raw): ?string
	{
		if (!is_string($raw) && !is_numeric($raw)) {
			return null;
		}
		$normalized = strtolower(trim((string) $raw));
		if ($normalized === 'vertical' || $normalized === 'horizontal') {
			return $normalized;
		}

		return null;
	}
}
