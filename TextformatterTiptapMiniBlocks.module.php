<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Tiptap\MiniBlockRenderer;

/**
 * TextformatterTiptapMiniBlocks
 *
 * Optional output-formatting Textformatter for `FieldtypeTextarea` / `FieldtypeTextareaLanguage`
 * fields using `InputfieldTiptap`. Renders `[data-tiptap-block="{name}"]` elements through
 * `./site/templates/tiptap/{name}.php` when present and preserves clean semantic HTML5 otherwise.
 */
class TextformatterTiptapMiniBlocks extends Textformatter implements Module
{
	/**
	 * Cached mini-block catalog for the current instance.
	 *
	 * @var array<string, array<string, mixed>>|null
	 */
	private ?array $catalogCache = null;

	/**
	 * Format field value with full `Page` and `Field` context.
	 *
	 * @param Page $page
	 * @param Field $field
	 * @param string|mixed $value
	 */
	public function formatValue(Page $page, Field $field, &$value): void
	{
		if (!is_string($value) || $value === '' || !str_contains($value, 'data-tiptap-block')) {
			return;
		}

		$catalog = $this->resolveCatalog();
		$value = MiniBlockRenderer::render($value, $page, $field, $this, $catalog);
	}

	/**
	 * Format standalone HTML string by reference.
	 *
	 * @param string $str
	 */
	public function format(&$str): void
	{
		if (!is_string($str) || $str === '' || !str_contains($str, 'data-tiptap-block')) {
			return;
		}

		$catalog = $this->resolveCatalog();
		$str = MiniBlockRenderer::render($str, null, null, $this, $catalog);
	}

	/**
	 * @return array<string, array<string, mixed>>
	 */
	private function resolveCatalog(): array
	{
		if ($this->catalogCache !== null) {
			return $this->catalogCache;
		}

		$modules = $this->wire()->modules;
		if ($modules->isInstalled('InputfieldTiptap')) {
			$tiptap = $modules->get('InputfieldTiptap');
			if ($tiptap instanceof InputfieldTiptap) {
				$this->catalogCache = $tiptap->getAvailableMiniBlocks();

				return $this->catalogCache;
			}
		}

		$this->catalogCache = [];

		return $this->catalogCache;
	}
}
