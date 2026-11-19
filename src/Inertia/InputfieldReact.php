<?php

declare(strict_types=1);

namespace Totoglu\React\Inertia;

use ProcessWire\Inputfield;
use ProcessWire\React;
use Totoglu\Inertia\InputfieldInertia;

/**
 * InputfieldReact
 *
 * Base `InputfieldInertia` class for `React` and downstream React Inputfields.
 *
 * Automatically declares `ReactInertia.js` and `ReactInertia.css` (plus optional module-specific
 * scripts/styles via `getModuleScriptAssets()` / `getModuleStyleAssets()`) in `inertiaViewData()`.
 * In both full-page Inertia responses and classic ProcessWire admin pages (`ProcessPageEdit`),
 * `InputfieldInertia` merges `inertiaViewData()` so the `ReactWorkspaceRuntime` island mounter and
 * design-system stylesheet are loaded exactly once.
 */
abstract class InputfieldReact extends InputfieldInertia
{
	use InteractWithReactTranslations;
	/**
	 * Resolve the wired `React` module instance.
	 */
	public function react(): React
	{
		return React::instance($this);
	}

	/**
	 * Return module-specific script URLs to load after `ReactInertia.js`.
	 *
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		return [];
	}

	/**
	 * Return module-specific stylesheet URLs to load after `ReactInertia.css`.
	 *
	 * @return list<string>
	 */
	public function getModuleStyleAssets(): array
	{
		return [];
	}

	public function inertiaShared(): array
	{
		return $this->buildReactTranslationSharedProps();
	}

	/**
	 * Provide `ReactInertia.js` and `ReactInertia.css` (plus module assets) so
	 * `PageResponse` and classic `InputfieldInertia::renderReady()` inject them automatically.
	 *
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
	 * Cached per-class reflection check indicating whether `___render()` is inherited directly from `InputfieldReact`.
	 *
	 * @var array<string, bool>
	 */
	private static array $usesBaseRenderCache = [];

	/**
	 * Optional fast-path for `FormSchemaSerializer`: returns structured island metadata directly
	 * when `___render()` is inherited from `InputfieldReact`, avoiding HTML render/parse round-trips.
	 *
	 * @return array{component: string, props: array<string, mixed>}|null
	 */
	public function toSchemaFormIsland(): ?array
	{
		$usesBaseRender = self::$usesBaseRenderCache[static::class]
			??= ((new \ReflectionMethod($this, '___render'))->getDeclaringClass()->getName() === self::class);
		if (!$usesBaseRender) {
			return null;
		}

		$resolved = $this->inertia()->resolver->resolveValue($this->toInertiaProp());
		$props = is_array($resolved) ? $resolved : $this->toInertiaProp();
		$component = is_string($props['component'] ?? null) && $props['component'] !== ''
			? $props['component']
			: $this->inertiaComponent();

		return [
			'component' => $component,
			'props' => $props,
		];
	}

	protected function stringAttr(string $key): string
	{
		$val = $this->attr($key);

		return is_scalar($val) ? (string) $val : '';
	}

	/**
	 * Determine whether this Inputfield is permanently locked or read-only on the server,
	 * while allowing dynamically unlocked `_rwDynamicReadOnly` / `_weDynamicReadOnly` fields.
	 */
	public function isEffectivelyReadOnly(): bool
	{
		if ((bool) $this->getSetting('readOnly') || (bool) $this->get('readOnly') || (bool) $this->get('renderValueMode')) {
			return true;
		}

		$collapsed = (int) ($this->collapsed ?? 0);
		if (in_array($collapsed, [Inputfield::collapsedNoLocked, Inputfield::collapsedYesLocked], true)) {
			return true;
		}

		$isDynamicReadOnly = (bool) ($this->get('_rwDynamicReadOnly') || $this->get('_weDynamicReadOnly'));
		if ($isDynamicReadOnly) {
			return false;
		}

		return (bool) $this->attr('disabled')
			|| (bool) $this->attr('readonly')
			|| str_contains((string) ($this->wrapClass ?? ''), 'readonly');
	}

	/**
	 * Determine whether incoming POST mutations should be ignored (`$config->demo` or server-locked state).
	 */
	protected function isInputProcessingLocked(): bool
	{
		return (bool) $this->wire()->config->demo || $this->isEffectivelyReadOnly();
	}

	public function ___render(): string
	{
		$payload = $this->inertia()->resolver->resolveValue($this->toInertiaProp());
		$data = is_array($payload) ? $payload : $this->toInertiaProp();

		$name = $this->stringAttr('name');
		$rawId = $this->stringAttr('id');
		$id = $rawId !== '' ? $rawId : ($name !== '' ? $name : 'inertia_input');
		$component = is_string($data['component'] ?? null) ? $data['component'] : $this->inertiaComponent();
		$hiddenVal = $this->serializeValueForHiddenInput($this->attr('value'));

		$safeId = $this->encodeHtmlAttribute($id);
		$safeName = $this->encodeHtmlAttribute($name);
		$safeVal = $this->encodeHtmlAttribute($hiddenVal);
		$safeComponent = $this->encodeHtmlAttribute($component);

		$jsonProps = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_INVALID_UTF8_SUBSTITUTE);
		$safeProps = $this->encodeHtmlAttribute(is_string($jsonProps) ? $jsonProps : '{}');

		$out = '';
		if ($name !== '') {
			$out .= "<input type=\"hidden\" id=\"{$safeId}\" name=\"{$safeName}\" value=\"{$safeVal}\" data-inertia-input=\"{$safeName}\" />";
		}
		$nameAttr = $name !== '' ? " data-input-name=\"{$safeName}\"" : '';
		$out .= "<div class=\"pw-inertia-inputfield-island\" data-inertia-island=\"{$safeComponent}\" data-react-island=\"{$safeComponent}\" data-input-id=\"{$safeId}\"{$nameAttr} data-props=\"{$safeProps}\"></div>";

		return $out;
	}

	public function ___renderValue(): string
	{
		$payload = $this->inertia()->resolver->resolveValue($this->toInertiaProp());
		$data = is_array($payload) ? $payload : $this->toInertiaProp();
		$data['readOnly'] = true;

		$component = is_string($data['component'] ?? null) ? $data['component'] : $this->inertiaComponent();
		$safeComponent = $this->encodeHtmlAttribute($component);

		$jsonProps = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_INVALID_UTF8_SUBSTITUTE);
		$safeProps = $this->encodeHtmlAttribute(is_string($jsonProps) ? $jsonProps : '{}');

		return "<div class=\"pw-inertia-inputfield-island\" data-inertia-island=\"{$safeComponent}\" data-react-island=\"{$safeComponent}\" data-readonly=\"true\" data-props=\"{$safeProps}\"></div>";
	}
}
