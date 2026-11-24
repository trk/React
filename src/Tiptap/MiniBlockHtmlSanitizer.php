<?php

declare(strict_types=1);

namespace Totoglu\React\Tiptap;

use Totoglu\React\Security\UrlSanitizer;

/**
 * Schema-driven DOM extractor, flattener (`depth = 1`), and canonical HTML5 serializer
 * for `InputfieldTiptap` editorial mini-blocks.
 *
 * Ensures that:
 * 1. Only mini-blocks explicitly enabled on the current field (`$activeDefinitions`) survive.
 * 2. Nested `[data-tiptap-block]` elements inside another mini-block are unwrapped (`depth = 1` invariant).
 * 3. Every scalar attribute (`data-variant`, `data-title`, `data-align`, `data-prop-*`, `src`, `alt`, `open`)
 *    is validated against its field type / allowlist and canonically escaped.
 * 4. Rich inner prose (`callout`, `details`, `pullquote`, custom `editableBody: true`) passes through the
 *    caller's rich-HTML purifier (`MarkupHTMLPurifier` or `DOMDocument` allowlist) and cleanup toggles.
 */
final class MiniBlockHtmlSanitizer
{
	/**
	 * Allowed `callout` variants.
	 *
	 * @var list<string>
	 */
	private const array CALLOUT_VARIANTS = ['info', 'tip', 'warning', 'danger'];

	/**
	 * Allowed `figure` alignments.
	 *
	 * @var list<string>
	 */
	private const array FIGURE_ALIGNMENTS = ['inline', 'wide', 'full', 'left', 'right'];

	/**
	 * Extract top-level `[data-tiptap-block]` elements from `$html`, replace allowed blocks with
	 * unforgeable per-call `<p>` placeholders, and unwrap disallowed/unknown mini-blocks into plain HTML.
	 *
	 * @param array<string, array<string, mixed>> $activeDefinitions
	 * @param callable(string): string $sanitizeRichHtml
	 * @return array{html: string, replacements: array<string, string>}
	 */
	public static function extractAndSanitize(
		string $html,
		array $activeDefinitions,
		callable $sanitizeRichHtml,
	): array {
		if (!str_contains($html, 'data-tiptap-block')) {
			return [
				'html' => $html,
				'replacements' => [],
			];
		}

		$tokenSeed = bin2hex(random_bytes(8));
		$replacements = [];
		$slotIndex = 0;

		$prevErrors = libxml_use_internal_errors(true);
		try {
			$dom = new \DOMDocument('1.0', 'UTF-8');
			$wrapped = '<?xml encoding="utf-8" ?><div id="__rw_tiptap_mb_root__">' . $html . '</div>';
			$loaded = $dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
			if (!$loaded) {
				return [
					'html' => '',
					'replacements' => [],
				];
			}

			$root = self::locateRootElement($dom, '__rw_tiptap_mb_root__');
			if (!$root instanceof \DOMElement) {
				return [
					'html' => '',
					'replacements' => [],
				];
			}

			$xpath = new \DOMXPath($dom);

			// 1. Enforce flat mini-blocks (`depth = 1`): unwrap any nested `[data-tiptap-block]` inside another `[data-tiptap-block]`
			$nestedList = $xpath->query('.//*[@data-tiptap-block]//*[@data-tiptap-block]', $root);
			if ($nestedList !== false && $nestedList->length > 0) {
				$nestedElements = [];
				foreach ($nestedList as $nestedNode) {
					if ($nestedNode instanceof \DOMElement) {
						$nestedElements[] = $nestedNode;
					}
				}
				for ($i = count($nestedElements) - 1; $i >= 0; $i--) {
					self::unwrapElement($nestedElements[$i]);
				}
			}

			// 2. Process remaining top-level `[data-tiptap-block]` elements
			$blockList = $xpath->query('.//*[@data-tiptap-block]', $root);
			if ($blockList !== false && $blockList->length > 0) {
				$topBlocks = [];
				foreach ($blockList as $blockNode) {
					if ($blockNode instanceof \DOMElement) {
						$topBlocks[] = $blockNode;
					}
				}

				foreach ($topBlocks as $el) {
					$rawName = $el->getAttribute('data-tiptap-block');
					$name = MiniBlockRegistry::sanitizeIdentifier($rawName);

					if ($name === '' || !isset($activeDefinitions[$name])) {
						self::unwrapElement($el);
						continue;
					}

					$canonicalHtml = self::sanitizeBlockElement(
						$dom,
						$el,
						$name,
						$activeDefinitions[$name],
						$sanitizeRichHtml,
					);

					$parent = $el->parentNode;
					if ($parent === null) {
						continue;
					}

					if ($canonicalHtml === '') {
						$parent->removeChild($el);
						continue;
					}

					$token = '__RW_TIPTAP_MB_' . $tokenSeed . '_' . $slotIndex . '__';
					$slotIndex++;
					$replacements[$token] = $canonicalHtml;

					$placeholder = $dom->createElement('p', $token);
					$parent->replaceChild($placeholder, $el);
				}
			}

			$serializedOuter = self::innerHtml($dom, $root);

			return [
				'html' => $serializedOuter,
				'replacements' => $replacements,
			];
		} finally {
			libxml_clear_errors();
			libxml_use_internal_errors($prevErrors);
		}
	}

	/**
	 * Splice sanitized canonical mini-block HTML back in place of `<p>__RW_TIPTAP_MB_...__</p>` placeholders.
	 *
	 * @param array<string, string> $replacements
	 */
	public static function restorePlaceholders(string $html, array $replacements): string
	{
		if ($replacements === [] || $html === '') {
			return $html;
		}

		$result = $html;
		foreach ($replacements as $token => $blockHtml) {
			$quoted = preg_quote($token, '~');
			$replacedParagraph = preg_replace_callback(
				'~<p(?:\s[^>]*)?>\s*' . $quoted . '\s*</p>~iu',
				static fn(): string => $blockHtml,
				$result,
				1,
				$count,
			);
			if (is_string($replacedParagraph) && $count > 0) {
				$result = $replacedParagraph;
			} else {
				$result = str_replace($token, $blockHtml, $result);
			}
		}

		return $result;
	}

	/**
	 * Sanitize an image URL (`src` or custom `image` field): allows `/`, `./`, `../`, `http://`, and `https://` only.
	 */
	public static function sanitizeImageUrl(string $url): string
	{
		$decoded = html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$stripped = (string) preg_replace('/[\x00-\x1F\x7F]+/', '', $decoded);
		$safe = UrlSanitizer::sanitizeHref($stripped);
		if ($safe === '') {
			return '';
		}
		if (
			str_starts_with($safe, '#')
			|| preg_match('/^(?:mailto:|tel:)/i', $safe) === 1
		) {
			return '';
		}

		return $safe;
	}

	/**
	 * Sanitize a single validated `[data-tiptap-block]` DOM element into canonical HTML5.
	 *
	 * @param array<string, mixed> $definition
	 * @param callable(string): string $sanitizeRichHtml
	 */
	private static function sanitizeBlockElement(
		\DOMDocument $dom,
		\DOMElement $el,
		string $name,
		array $definition,
		callable $sanitizeRichHtml,
	): string {
		return match ($name) {
			'callout' => self::sanitizeCallout($dom, $el, $sanitizeRichHtml),
			'figure' => self::sanitizeFigure($dom, $el, $sanitizeRichHtml),
			'details' => self::sanitizeDetails($dom, $el, $sanitizeRichHtml),
			'pullquote' => self::sanitizePullquote($dom, $el, $sanitizeRichHtml),
			default => self::sanitizeCustomBlock($dom, $el, $name, $definition, $sanitizeRichHtml),
		};
	}

	/**
	 * @param callable(string): string $sanitizeRichHtml
	 */
	private static function sanitizeCallout(
		\DOMDocument $dom,
		\DOMElement $el,
		callable $sanitizeRichHtml,
	): string {
		$rawVariant = strtolower(trim($el->getAttribute('data-variant')));
		$variant = in_array($rawVariant, self::CALLOUT_VARIANTS, true) ? $rawVariant : 'info';

		$title = self::sanitizePlainText($el->getAttribute('data-title'), 300);
		$titleAttr = $title !== '' ? ' data-title="' . self::escapeAttr($title) . '"' : '';

		$bodyContainer = self::findFirstChildWithAttr($el, 'data-tiptap-body') ?? $el;
		$bodyHtml = self::sanitizeFlatBody($sanitizeRichHtml(self::innerHtml($dom, $bodyContainer)));

		return '<aside data-tiptap-block="callout" data-variant="' . $variant . '"' . $titleAttr . '>'
			. $bodyHtml
			. '</aside>';
	}

	/**
	 * @param callable(string): string $sanitizeRichHtml
	 */
	private static function sanitizeFigure(
		\DOMDocument $dom,
		\DOMElement $el,
		callable $sanitizeRichHtml,
	): string {
		$rawAlign = strtolower(trim($el->getAttribute('data-align')));
		$align = in_array($rawAlign, self::FIGURE_ALIGNMENTS, true) ? $rawAlign : 'inline';

		$imgs = $el->getElementsByTagName('img');
		$imgEl = ($imgs->length > 0 && $imgs->item(0) instanceof \DOMElement) ? $imgs->item(0) : null;

		$rawSrc = $imgEl instanceof \DOMElement
			? $imgEl->getAttribute('src')
			: $el->getAttribute('data-src');
		$safeSrc = self::sanitizeImageUrl($rawSrc);
		if ($safeSrc === '') {
			return '';
		}

		$rawAlt = $imgEl instanceof \DOMElement
			? $imgEl->getAttribute('alt')
			: $el->getAttribute('data-alt');
		$safeAlt = self::sanitizePlainText($rawAlt, 500);

		$captionHtml = '';
		$captions = $el->getElementsByTagName('figcaption');
		if ($captions->length > 0 && $captions->item(0) instanceof \DOMElement) {
			$captionHtml = self::sanitizeInlineCaption($sanitizeRichHtml(self::innerHtml($dom, $captions->item(0))));
		} elseif ($el->hasAttribute('data-caption')) {
			$plainCaption = self::sanitizePlainText($el->getAttribute('data-caption'), 500);
			$captionHtml = $plainCaption !== '' ? self::escapeHtml($plainCaption) : '';
		}

		$captionMarkup = $captionHtml !== '' ? '<figcaption>' . $captionHtml . '</figcaption>' : '';

		return '<figure data-tiptap-block="figure" data-align="' . $align . '">'
			. '<img src="' . self::escapeAttr($safeSrc) . '" alt="' . self::escapeAttr($safeAlt) . '">'
			. $captionMarkup
			. '</figure>';
	}

	/**
	 * @param callable(string): string $sanitizeRichHtml
	 */
	private static function sanitizeDetails(
		\DOMDocument $dom,
		\DOMElement $el,
		callable $sanitizeRichHtml,
	): string {
		$isOpen = $el->hasAttribute('open');
		$summaryText = '';
		$bodyRawParts = [];

		$bodyContainer = self::findFirstChildWithAttr($el, 'data-tiptap-details-body');

		foreach ($el->childNodes as $child) {
			if ($child instanceof \DOMElement && strtolower($child->tagName) === 'summary') {
				if ($summaryText === '') {
					// Strip headings/tags inside <summary> so screen readers preserve disclosure semantics
					$summaryText = self::sanitizePlainText($child->textContent ?? '', 300);
				}
				continue;
			}
			if ($bodyContainer === null) {
				$saved = $dom->saveHTML($child);
				if (is_string($saved)) {
					$bodyRawParts[] = $saved;
				}
			}
		}

		if ($summaryText === '' && $el->hasAttribute('data-summary')) {
			$summaryText = self::sanitizePlainText($el->getAttribute('data-summary'), 300);
		}
		if ($summaryText === '') {
			$summaryText = 'Details';
		}

		$rawBody = $bodyContainer instanceof \DOMElement
			? self::innerHtml($dom, $bodyContainer)
			: implode('', $bodyRawParts);
		$bodyHtml = self::sanitizeFlatBody($sanitizeRichHtml($rawBody));
		$openAttr = $isOpen ? ' open' : '';

		return '<details data-tiptap-block="details"' . $openAttr . '>'
			. '<summary>' . self::escapeHtml($summaryText) . '</summary>'
			. '<div data-tiptap-details-body="1">' . $bodyHtml . '</div>'
			. '</details>';
	}

	/**
	 * @param callable(string): string $sanitizeRichHtml
	 */
	private static function sanitizePullquote(
		\DOMDocument $dom,
		\DOMElement $el,
		callable $sanitizeRichHtml,
	): string {
		$captionHtml = '';
		$quoteRawParts = [];
		$blockquoteEl = null;

		foreach ($el->childNodes as $child) {
			if ($child instanceof \DOMElement) {
				$childTag = strtolower($child->tagName);
				if ($childTag === 'figcaption') {
					if ($captionHtml === '') {
						$captionHtml = self::sanitizeInlineCaption($sanitizeRichHtml(self::innerHtml($dom, $child)));
					}
					continue;
				}
				if ($childTag === 'blockquote' && $blockquoteEl === null) {
					$blockquoteEl = $child;
					continue;
				}
			}
			$saved = $dom->saveHTML($child);
			if (is_string($saved)) {
				$quoteRawParts[] = $saved;
			}
		}

		if ($captionHtml === '' && $el->hasAttribute('data-citation')) {
			$plainCitation = self::sanitizePlainText($el->getAttribute('data-citation'), 300);
			$captionHtml = $plainCitation !== '' ? self::escapeHtml($plainCitation) : '';
		}

		$rawQuote = $blockquoteEl instanceof \DOMElement
			? self::innerHtml($dom, $blockquoteEl)
			: implode('', $quoteRawParts);
		$quoteHtml = self::sanitizeFlatBody($sanitizeRichHtml($rawQuote));
		$captionMarkup = $captionHtml !== '' ? '<figcaption>' . $captionHtml . '</figcaption>' : '';

		return '<figure data-tiptap-block="pullquote">'
			. '<blockquote data-tiptap-quote="1">' . $quoteHtml . '</blockquote>'
			. $captionMarkup
			. '</figure>';
	}

	/**
	 * @param array<string, mixed> $definition
	 * @param callable(string): string $sanitizeRichHtml
	 */
	private static function sanitizeCustomBlock(
		\DOMDocument $dom,
		\DOMElement $el,
		string $name,
		array $definition,
		callable $sanitizeRichHtml,
	): string {
		$rawTag = isset($definition['tag']) && is_string($definition['tag'])
			? strtolower(trim($definition['tag']))
			: 'div';
		$tag = in_array($rawTag, MiniBlockRegistry::ALLOWED_CUSTOM_TAGS, true) ? $rawTag : 'div';
		$editableBody = !empty($definition['editableBody']);

		$attrPairs = [
			'data-tiptap-block="' . self::escapeAttr($name) . '"',
		];
		$atomSummaryParts = [];

		$fields = isset($definition['fields']) && is_array($definition['fields'])
			? $definition['fields']
			: [];

		foreach ($fields as $field) {
			if (!is_array($field)) {
				continue;
			}
			$attrName = isset($field['attr']) && is_string($field['attr']) ? trim($field['attr']) : '';
			$fieldType = isset($field['type']) && is_string($field['type']) ? $field['type'] : 'text';
			if ($attrName === '' || preg_match('/^data-prop-[a-z0-9_-]+$/', $attrName) !== 1) {
				continue;
			}

			$hasRaw = $el->hasAttribute($attrName);
			$rawValue = $hasRaw
				? $el->getAttribute($attrName)
				: (is_scalar($field['default'] ?? null) ? (string) ($field['default'] === true ? '1' : ($field['default'] === false ? '0' : $field['default'])) : '');

			$cleanVal = match ($fieldType) {
				'url' => self::sanitizeLinkUrl($rawValue),
				'image' => self::sanitizeImageUrl($rawValue),
				'select' => self::sanitizeSelectOption($rawValue, is_array($field['options'] ?? null) ? $field['options'] : [], (string) ($field['default'] ?? '')),
				'toggle' => in_array(strtolower(trim($rawValue)), ['1', 'true', 'yes', 'on'], true) ? '1' : '0',
				'textarea' => self::sanitizeMultilineText($rawValue, 4000),
				default => self::sanitizePlainText($rawValue, 500),
			};

			$attrPairs[] = $attrName . '="' . self::escapeAttr($cleanVal) . '"';

			if (!$editableBody && $cleanVal !== '' && ($fieldType === 'text' || $fieldType === 'textarea')) {
				$atomSummaryParts[] = $cleanVal;
			}
		}

		$innerMarkup = '';
		if ($editableBody) {
			$bodyContainer = self::findFirstChildWithAttr($el, 'data-tiptap-body') ?? $el;
			$bodyHtml = self::sanitizeFlatBody($sanitizeRichHtml(self::innerHtml($dom, $bodyContainer)));
			$innerMarkup = '<div data-tiptap-body="1">' . $bodyHtml . '</div>';
		} elseif ($atomSummaryParts !== []) {
			$first = self::escapeHtml($atomSummaryParts[0]);
			$rest = array_slice($atomSummaryParts, 1);
			$restEscaped = array_map([self::class, 'escapeHtml'], $rest);
			$innerMarkup = '<div data-tiptap-atom="1"><p><strong>' . $first . '</strong>'
				. ($restEscaped !== [] ? ' <span>' . implode(' · ', $restEscaped) . '</span>' : '')
				. '</p></div>';
		}

		return '<' . $tag . ' ' . implode(' ', $attrPairs) . '>' . $innerMarkup . '</' . $tag . '>';
	}

	private static function sanitizeLinkUrl(string $url): string
	{
		$decoded = html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$stripped = (string) preg_replace('/[\x00-\x1F\x7F]+/', '', $decoded);

		return UrlSanitizer::sanitizeHref($stripped);
	}

	/**
	 * @param array<string, string> $options
	 */
	private static function sanitizeSelectOption(string $rawValue, array $options, string $default): string
	{
		$trimmed = trim($rawValue);
		if ($options === []) {
			return self::sanitizePlainText($trimmed, 120);
		}
		if (array_key_exists($trimmed, $options)) {
			return $trimmed;
		}
		if ($default !== '' && array_key_exists($default, $options)) {
			return $default;
		}

		return (string) array_key_first($options);
	}

	private static function sanitizePlainText(string $raw, int $maxLength): string
	{
		if ($raw === '') {
			return '';
		}
		$withoutActive = (string) preg_replace('~<(script|style)\b[^>]*>.*?</\1>~is', ' ', $raw);
		$stripped = strip_tags($withoutActive);
		$normalized = (string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $stripped);
		$collapsed = trim((string) preg_replace('/\s+/u', ' ', $normalized));

		if ($collapsed !== '' && mb_strlen($collapsed, 'UTF-8') > $maxLength) {
			return mb_substr($collapsed, 0, $maxLength, 'UTF-8');
		}

		return $collapsed;
	}

	private static function sanitizeMultilineText(string $raw, int $maxLength): string
	{
		if ($raw === '') {
			return '';
		}
		$withoutActive = (string) preg_replace('~<(script|style)\b[^>]*>.*?</\1>~is', '', $raw);
		$stripped = strip_tags($withoutActive);
		$normalized = str_replace(["\r\n", "\r"], "\n", $stripped);
		$normalized = (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', '', $normalized);
		$trimmed = trim($normalized);

		if ($trimmed !== '' && mb_strlen($trimmed, 'UTF-8') > $maxLength) {
			return mb_substr($trimmed, 0, $maxLength, 'UTF-8');
		}

		return $trimmed;
	}

	private static function sanitizeFlatBody(string $sanitizedHtml): string
	{
		$trimmed = trim($sanitizedHtml);
		if ($trimmed === '') {
			return '<p></p>';
		}
		// Ensure nested `<details>` or `data-tiptap-*` markers never survive inside flat bodies
		$clean = (string) preg_replace('~</?(?:details|summary)\b[^>]*>~i', '', $trimmed);
		$clean = (string) preg_replace('~\s+data-tiptap-[a-z0-9_-]+(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>"\']+))?~i', '', $clean);
		$clean = trim($clean);

		if ($clean === '') {
			return '<p></p>';
		}
		if (!str_starts_with($clean, '<')) {
			return '<p>' . $clean . '</p>';
		}

		return $clean;
	}

	private static function sanitizeInlineCaption(string $sanitizedHtml): string
	{
		$trimmed = trim($sanitizedHtml);
		if ($trimmed === '') {
			return '';
		}
		// Unwrap single outer <p>...</p> added by HTMLPurifier so <figcaption> contains clean inline HTML
		if (preg_match('~^<p>(.*)</p>$~is', $trimmed, $m) === 1 && !str_contains($m[1], '<p')) {
			$trimmed = trim($m[1]);
		}
		$inlineOnly = strip_tags($trimmed, '<a><strong><b><em><i><u><s><code><mark><span><sub><sup>');

		return trim($inlineOnly);
	}

	private static function findFirstChildWithAttr(\DOMElement $parent, string $attrName): ?\DOMElement
	{
		foreach ($parent->childNodes as $child) {
			if ($child instanceof \DOMElement && $child->hasAttribute($attrName)) {
				return $child;
			}
		}

		return null;
	}

	private static function unwrapElement(\DOMElement $el): void
	{
		$parent = $el->parentNode;
		if ($parent === null) {
			return;
		}
		// Drop internal atom preview shells so disabled atom blocks do not leak synthetic markup
		$atoms = [];
		foreach ($el->getElementsByTagName('*') as $desc) {
			if ($desc instanceof \DOMElement && $desc->hasAttribute('data-tiptap-atom')) {
				$atoms[] = $desc;
			}
		}
		foreach ($atoms as $atom) {
			$atom->parentNode?->removeChild($atom);
		}
		while ($el->firstChild !== null) {
			$parent->insertBefore($el->firstChild, $el);
		}
		$parent->removeChild($el);
	}

	private static function locateRootElement(\DOMDocument $dom, string $id): ?\DOMElement
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

	private static function innerHtml(\DOMDocument $dom, \DOMElement $el): string
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

	private static function escapeAttr(string $val): string
	{
		return htmlspecialchars($val, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
	}

	private static function escapeHtml(string $val): string
	{
		return htmlspecialchars($val, ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8');
	}
}
