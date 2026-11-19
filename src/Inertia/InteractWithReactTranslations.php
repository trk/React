<?php // __(file-not-translatable)

declare(strict_types=1);

namespace Totoglu\React\Inertia;

use ProcessWire\React;
use ProcessWire\Wire;
use ReflectionClass;

/**
 * InteractWithReactTranslations
 *
 * Shared static UI translation contract for `ProcessReact`, `InputfieldReact`,
 * `MarkupReactViewport`, `MarkupReactTab`, and `InputfieldTiptap`.
 *
 * Downstream modules may override either `public function ___translations(): array` (hookable
 * via ProcessWire's `WireHooks` system) or `public function translations(): array` directly,
 * returning flat or nested associative string maps resolved via `$this->_('...')` with
 * companion `languages/{en,tr,de,fr,es,ru}.csv` packs.
 *
 * @method array<string, mixed> translations()
 */
trait InteractWithReactTranslations
{
	/**
	 * Return the translation catalog namespace identifier for this module/component.
	 */
	public function translationNamespace(): string
	{
		$class = $this::class;
		if (str_contains($class, '@anonymous')) {
			$ref = new ReflectionClass($this);
			$parent = $ref->getParentClass();
			$base = $parent !== false ? $parent->getShortName() : 'Module';

			return $base . '_Anonymous';
		}

		if ($this instanceof Wire) {
			$className = trim($this->className());
			if ($className !== '' && !str_contains($className, '@anonymous')) {
				return (string) preg_replace('/[^A-Za-z0-9_-]/', '_', $className);
			}
		}

		$short = ($pos = strrpos($class, '\\')) !== false ? substr($class, $pos + 1) : $class;

		return (string) preg_replace('/[^A-Za-z0-9_-]/', '_', $short);
	}

	/**
	 * Return static UI translations contributed by this module.
	 *
	 * Supports flat keys (`['toolbar.bold' => $this->_('Bold')]`) as well as nested
	 * associative groups (`['toolbar' => ['bold' => $this->_('Bold')]]`), which are
	 * normalized into dot-notation keys automatically.
	 *
	 * @return array<string, mixed>
	 */
	public function ___translations(): array
	{
		return [];
	}

	/**
	 * Build the shared Inertia `OnceProp` (and classic island `$config->js('InertiaShared')`)
	 * translation map for `core` plus this module's namespace.
	 *
	 * @return array<string, mixed>
	 */
	protected function buildReactTranslationSharedProps(): array
	{
		$workspace = React::instance($this instanceof Wire ? $this : null);

		return $workspace->buildInertiaI18nSharedProps($this);
	}
}
