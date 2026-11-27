<?php

declare(strict_types=1);

namespace Totoglu\React\Tiptap;

/**
 * Shared HTML5/UTF-8 `DOMDocument` fragment parser, root locator, and serializer
 * for `TiptapContentPolicy`, `MiniBlockHtmlSanitizer`, and `MiniBlockRenderer`.
 */
final class DomFragmentHelper
{
	/**
	 * Parse an HTML fragment inside a synthetic UTF-8 wrapper element, invoke `$callback($dom, $root)`,
	 * and guarantee libxml error state restoration even if an exception occurs.
	 *
	 * @template T
	 * @param callable(\DOMDocument, \DOMElement): T $callback
	 * @param T $fallback
	 * @return T
	 */
	public static function withFragment(string $html, string $rootId, callable $callback, mixed $fallback = ''): mixed
	{
		$prevErrors = libxml_use_internal_errors(true);
		try {
			$dom = new \DOMDocument('1.0', 'UTF-8');
			$wrapped = '<?xml encoding="utf-8" ?><div id="' . $rootId . '">' . $html . '</div>';
			if (!$dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET)) {
				return $fallback;
			}

			$root = self::locateRootElement($dom, $rootId);
			if (!$root instanceof \DOMElement) {
				return $fallback;
			}

			return $callback($dom, $root);
		} finally {
			libxml_clear_errors();
			libxml_use_internal_errors($prevErrors);
		}
	}

	/**
	 * Locate the synthetic wrapper root element by `id` (with XPath fallback).
	 */
	public static function locateRootElement(\DOMDocument $dom, string $id): ?\DOMElement
	{
		$root = $dom->getElementById($id);
		if ($root instanceof \DOMElement) {
			return $root;
		}

		$xpath = new \DOMXPath($dom);
		$found = $xpath->query('//*[@id="' . $id . '"]');

		return ($found !== false && $found->length > 0 && $found->item(0) instanceof \DOMElement)
			? $found->item(0)
			: null;
	}

	/**
	 * Serialize the inner HTML of `$el` without its enclosing wrapper tag.
	 */
	public static function innerHtml(\DOMDocument $dom, \DOMElement $el): string
	{
		$buffer = '';
		foreach ($el->childNodes as $child) {
			$saved = $dom->saveHTML($child);
			if (is_string($saved)) {
				$buffer .= $saved;
			}
		}

		return $buffer;
	}

	/**
	 * Find the first direct child element of `$parent` carrying `$attrName`.
	 */
	public static function findFirstChildWithAttr(\DOMElement $parent, string $attrName): ?\DOMElement
	{
		foreach ($parent->childNodes as $child) {
			if ($child instanceof \DOMElement && $child->hasAttribute($attrName)) {
				return $child;
			}
		}

		return null;
	}

	/**
	 * Unwrap `$el` in place by hoisting all child nodes to its parent, optionally removing `[data-tiptap-atom]` placeholders.
	 */
	public static function unwrapElement(\DOMElement $el, bool $stripAtoms = false): void
	{
		$parent = $el->parentNode;
		if ($parent === null) {
			return;
		}

		if ($stripAtoms) {
			$atoms = [];
			foreach ($el->getElementsByTagName('*') as $desc) {
				if ($desc instanceof \DOMElement && $desc->hasAttribute('data-tiptap-atom')) {
					$atoms[] = $desc;
				}
			}
			foreach ($atoms as $atom) {
				$atom->parentNode?->removeChild($atom);
			}
		}

		while ($el->firstChild !== null) {
			$parent->insertBefore($el->firstChild, $el);
		}
		$parent->removeChild($el);
	}
}
