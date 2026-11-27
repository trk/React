<?php

declare(strict_types=1);

namespace Totoglu\React\Media;

use ProcessWire\Inertia;
use ProcessWire\Inputfield;
use ProcessWire\Pagefile;
use ProcessWire\Pagefiles;
use ProcessWire\React;
use ProcessWire\WireInputData;
use Totoglu\Inertia\InteractWithInertia;
use Totoglu\React\Inertia\InteractWithReactTranslations;
use Totoglu\React\Support\IslandMarkup;

/**
 * Shared Inertia island, serialization, and server-side input guard behavior
 * for `InputfieldReactFile` and `InputfieldReactImage`.
 */
trait InteractWithReactMediaInputfield
{
	use InteractWithInertia;
	use InteractWithReactTranslations;

	/**
	 * Whether this Inputfield represents an image studio control (`true`) or generic file control (`false`).
	 */
	abstract protected function isReactImageField(): bool;

	/**
	 * Default DOM element ID fallback when no explicit `id` attribute is assigned.
	 */
	protected function defaultReactMediaInputId(): string
	{
		return $this->isReactImageField() ? 'react_image_input' : 'react_file_input';
	}

	public function react(): React
	{
		return React::instance($this);
	}

	/**
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		$workspace = $this->react();
		$entryFile = $this->isReactImageField() ? 'InputfieldReactImage.js' : 'InputfieldReactFile.js';

		return array_values(array_unique(array_merge(
			$workspace->resolveModuleAssetUrl('ReactMedia.js'),
			$workspace->resolveModuleAssetUrl($entryFile),
		)));
	}

	/**
	 * @return list<string>
	 */
	public function getModuleStyleAssets(): array
	{
		return $this->react()->resolveModuleAssetUrl('ReactMedia.css');
	}

	/**
	 * @return array<string, mixed>
	 */
	public function inertiaShared(): array
	{
		return $this->buildReactTranslationSharedProps();
	}

	/**
	 * @param array<string, mixed> $pageObject
	 * @return array<string, mixed>
	 */
	public function inertiaViewData(array $pageObject = []): array
	{
		$workspace = $this->react();

		return [
			'scripts' => $workspace->resolveInertiaScriptAssets($this->getModuleScriptAssets()),
			'styles' => $workspace->resolveInertiaStyleAssets($this->getModuleStyleAssets()),
		];
	}

	/**
	 * Determine whether this media Inputfield is currently locked against mutations.
	 */
	public function isReactMediaReadOnly(): bool
	{
		if ((bool) $this->getSetting('readOnly') || (bool) $this->renderValueMode) {
			return true;
		}
		$collapsed = (int) ($this->collapsed ?? 0);
		if (in_array($collapsed, [Inputfield::collapsedNoLocked, Inputfield::collapsedYesLocked], true)) {
			return true;
		}
		$isDynamicReadOnly = (bool) $this->get('_rwDynamicReadOnly');
		if ($isDynamicReadOnly) {
			return false;
		}
		$attrs = $this->getAttributes();

		return !empty($attrs['disabled']) || !empty($attrs['readonly']);
	}

	/**
	 * @return array<string, mixed>
	 */
	public function inertiaWithData(): array
	{
		$serialized = $this->react()->forms()->serializeMediaInputfield($this, $this->isReactImageField());
		$attrs = $this->getAttributes();
		$isReadOnly = !empty($serialized['readOnly']) || $this->isReactMediaReadOnly();

		$serialized['readOnly'] = $isReadOnly;
		$serialized['disabled'] = !empty($attrs['disabled']);

		return $serialized;
	}

	/**
	 * @return array<string, mixed>
	 */
	public function toInertiaProp(): array
	{
		$data = $this->inertiaWithData();

		return array_merge($data, [
			'component' => $this->inertiaComponent(),
			'errors' => array_values(array_map('strval', $this->getErrors())),
			'props' => array_merge($this->getInertiaProps(), $data),
		]);
	}

	public function renderReady(?Inputfield $parent = null, $renderValueMode = false): bool
	{
		$this->checkFormEnctype();
		$result = str_contains(static::class, "\0")
			? false
			: (bool) Inputfield::renderReady($parent, (bool) $renderValueMode);

		return $this->enqueueInertiaIslandAssets() || $result;
	}

	public function ___render(): string
	{
		$val = $this->val();
		if ($val instanceof Pagefiles) {
			$this->renderListReady($val);
		}

		$inertia = $this->inertia();
		$inertia->ensureXsrfCookie();

		$data = Inertia::withoutEntityEncoding(function () use ($inertia): array {
			$payload = $inertia->resolver->resolveValue($this->toInertiaProp());

			return is_array($payload) ? $payload : $this->toInertiaProp();
		});

		$id = (string) ($data['id'] ?? ($this->attr('id') ?: $this->defaultReactMediaInputId()));
		$name = (string) ($data['name'] ?? $this->attr('name'));
		$uploadUrl = (string) ($data['uploadUrl'] ?? '');
		$uploadFieldName = (string) ($data['uploadFieldName'] ?? $name);
		$component = $this->inertiaComponent();

		return IslandMarkup::render($component, $data, [
			'class' => 'pw-inertia-inputfield-island',
			'data-input-id' => $id,
			'data-input-name' => $name !== '' ? $name : null,
			'data-fieldname' => $uploadFieldName !== '' ? $uploadFieldName : null,
			'data-posturl' => $uploadUrl !== '' ? $uploadUrl : null,
		]);
	}

	public function ___renderValue(): string
	{
		$inertia = $this->inertia();
		$prevMode = $this->renderValueMode;
		$this->renderValueMode = true;
		try {
			$data = Inertia::withoutEntityEncoding(function () use ($inertia): array {
				$payload = $inertia->resolver->resolveValue($this->toInertiaProp());

				return is_array($payload) ? $payload : $this->toInertiaProp();
			});
		} finally {
			$this->renderValueMode = $prevMode;
		}
		$data['readOnly'] = true;
		if (isset($data['props']) && is_array($data['props'])) {
			$data['props']['readOnly'] = true;
		}

		return IslandMarkup::render($this->inertiaComponent(), $data, [
			'class' => 'pw-inertia-inputfield-island',
			'data-readonly' => 'true',
		]);
	}

	public function ___processInput(WireInputData $input): static
	{
		if ((bool) $this->wire()->config->demo || $this->isReactMediaReadOnly()) {
			return $this;
		}

		$rawName = $this->attr('name');
		$name = is_scalar($rawName) ? (string) $rawName : '';
		$noUpload = (bool) $this->getSetting('noUpload');
		$savedFilesSlot = null;
		$hadFilesSlot = false;

		if ($noUpload && $name !== '' && isset($_FILES[$name])) {
			$hadFilesSlot = true;
			$savedFilesSlot = $_FILES[$name];
			unset($_FILES[$name]);
		}

		try {
			parent::___processInput($input);
		} finally {
			if ($hadFilesSlot) {
				$_FILES[$name] = $savedFilesSlot;
			}
		}

		$this->enforcePredefinedTagsPolicy();

		$minFiles = max(0, (int) (
			$this->getSetting('minFiles')
			?? $this->getSetting('minItems')
			?? $this->hasField?->get('minFiles')
			?? $this->hasField?->get('minItems')
			?? 0
		));
		$valAfter = $this->val();
		if ($minFiles > 0 && $valAfter instanceof Pagefiles && $valAfter->count() < $minFiles) {
			$this->error(sprintf($this->_('Please select at least %d item(s).'), $minFiles));
		}

		return $this;
	}

	/**
	 * When `useTags` is set to predefined-only (`useTags & 8` without `useTags & 1`),
	 * filter submitted `Pagefile::$tags` against the configured `tagsList`.
	 */
	protected function enforcePredefinedTagsPolicy(): void
	{
		$useTagsMode = (int) ($this->getSetting('useTags') ?? 0);
		$isPredefinedOnly = ($useTagsMode & 8) !== 0 && ($useTagsMode & 1) === 0;
		if (!$isPredefinedOnly) {
			return;
		}

		$val = $this->val();
		if (!$val instanceof Pagefiles) {
			return;
		}

		$rawTagsList = $this->getSetting('tagsList') ?? ($this->hasField?->get('tagsList') ?? '');
		$allowedMap = [];
		$tokens = is_array($rawTagsList)
			? $rawTagsList
			: (preg_split('/[\s,]+/', trim((string) $rawTagsList)) ?: []);
		foreach ($tokens as $tok) {
			$clean = trim((string) $tok);
			if ($clean !== '') {
				$allowedMap[strtolower($clean)] = $clean;
			}
		}

		foreach ($val as $pagefile) {
			if (!$pagefile instanceof Pagefile) {
				continue;
			}
			$currentRaw = trim((string) ($pagefile->tags ?? ''));
			if ($currentRaw === '') {
				continue;
			}
			$submittedTokens = preg_split('/[\s,]+/', $currentRaw) ?: [];
			$filtered = [];
			foreach ($submittedTokens as $subTok) {
				$key = strtolower(trim($subTok));
				if ($key !== '' && isset($allowedMap[$key]) && !in_array($allowedMap[$key], $filtered, true)) {
					$filtered[] = $allowedMap[$key];
				}
			}
			$nextTags = implode(' ', $filtered);
			if ($nextTags !== $currentRaw) {
				$pagefile->tags = $nextTags;
				$this->trackChange('value');
			}
		}
	}
}
