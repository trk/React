<?php

declare(strict_types=1);

namespace Totoglu\React\Tiptap;

use ProcessWire\Field;
use ProcessWire\Page;
use ProcessWire\Wire;
use Totoglu\React\Security\UrlSanitizer;

/**
 * Frontend PHP template renderer and structured Headless/Inertia segment extractor
 * for `InputfieldTiptap` flat editorial mini-blocks.
 *
 * When `./site/templates/tiptap/{name}.php` (or `{kebab-name}.php`) exists, that template
 * receives `$block`, `$name`, `$props`, `$body`, `$page`, and `$field`. Otherwise the clean
 * semantic HTML5 stored in the field is preserved untouched.
 */
final class MiniBlockRenderer
{
	/**
	 * Render mini-blocks inside `$html` using optional `./site/templates/tiptap/{name}.php` overrides.
	 *
	 * @param array<string, array<string, mixed>> $catalog
	 */
	public static function render(
		string $html,
		?Page $page = null,
		?Field $field = null,
		?Wire $context = null,
		array $catalog = [],
	): string {
		if ($html === '' || !str_contains($html, 'data-tiptap-block')) {
			return $html;
		}

		$templatesDir = self::resolveTemplatesDirectory($context);
		if ($templatesDir === '' || !is_dir($templatesDir)) {
			return $html;
		}

		$resolvedCatalog = $catalog !== [] ? $catalog : self::resolveDefaultCatalog($context);
		$tokenSeed = bin2hex(random_bytes(8));
		$replacements = [];
		$slotIndex = 0;

		$prevErrors = libxml_use_internal_errors(true);
		try {
			$dom = new \DOMDocument('1.0', 'UTF-8');
			$wrapped = '<?xml encoding="utf-8" ?><div id="__rw_tiptap_render_root__">' . $html . '</div>';
			if (!$dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET)) {
				return $html;
			}

			$root = self::locateRootElement($dom, '__rw_tiptap_render_root__');
			if (!$root instanceof \DOMElement) {
				return $html;
			}

			$xpath = new \DOMXPath($dom);
			$blockNodes = $xpath->query('.//*[@data-tiptap-block]', $root);
			if ($blockNodes === false || $blockNodes->length === 0) {
				return $html;
			}

			$elements = [];
			foreach ($blockNodes as $node) {
				if ($node instanceof \DOMElement && !self::hasMiniBlockAncestor($node, $root)) {
					$elements[] = $node;
				}
			}

			foreach ($elements as $el) {
				$name = MiniBlockRegistry::sanitizeIdentifier($el->getAttribute('data-tiptap-block'));
				if ($name === '') {
					continue;
				}

				$templateFile = self::locateTemplateFile($templatesDir, $name);
				if ($templateFile === null) {
					continue;
				}

				$blockPayload = self::parseBlockElement($dom, $el, $name, $resolvedCatalog[$name] ?? null);
				$rendered = self::renderTemplateFile($templateFile, $blockPayload, $page, $field, $context);

				$token = '__RW_TIPTAP_RENDER_' . $tokenSeed . '_' . $slotIndex . '__';
				$slotIndex++;
				$replacements[$token] = $rendered;

				$parent = $el->parentNode;
				if ($parent !== null) {
					$placeholder = $dom->createTextNode($token);
					$parent->replaceChild($placeholder, $el);
				}
			}

			if ($replacements === []) {
				return $html;
			}

			$serialized = self::innerHtml($dom, $root);
			foreach ($replacements as $token => $renderedBlock) {
				$serialized = str_replace($token, $renderedBlock, $serialized);
			}

			return $serialized;
		} finally {
			libxml_clear_errors();
			libxml_use_internal_errors($prevErrors);
		}
	}

	/**
	 * Extract ordered rich-HTML and structured `miniBlock` segments for React / Inertia / Headless rendering.
	 *
	 * @param array<string, array<string, mixed>> $catalog
	 * @return list<array<string, mixed>>
	 */
	public static function extractBlocks(string $html, ?Wire $context = null, array $catalog = []): array
	{
		$trimmed = trim($html);
		if ($trimmed === '') {
			return [];
		}

		if (!str_contains($trimmed, 'data-tiptap-block')) {
			return [
				[
					'type' => 'html',
					'html' => $trimmed,
				],
			];
		}

		$resolvedCatalog = $catalog !== [] ? $catalog : self::resolveDefaultCatalog($context);

		$prevErrors = libxml_use_internal_errors(true);
		try {
			$dom = new \DOMDocument('1.0', 'UTF-8');
			$wrapped = '<?xml encoding="utf-8" ?><div id="__rw_tiptap_extract_root__">' . $trimmed . '</div>';
			if (!$dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET)) {
				return [
					[
						'type' => 'html',
						'html' => $trimmed,
					],
				];
			}

			$root = self::locateRootElement($dom, '__rw_tiptap_extract_root__');
			if (!$root instanceof \DOMElement) {
				return [
					[
						'type' => 'html',
						'html' => $trimmed,
					],
				];
			}

			$segments = [];
			$htmlBuffer = '';

			$flushHtml = static function () use (&$segments, &$htmlBuffer): void {
				$chunk = trim($htmlBuffer);
				if ($chunk !== '') {
					$segments[] = [
						'type' => 'html',
						'html' => $chunk,
					];
				}
				$htmlBuffer = '';
			};

			foreach ($root->childNodes as $child) {
				if ($child instanceof \DOMElement && $child->hasAttribute('data-tiptap-block')) {
					$name = MiniBlockRegistry::sanitizeIdentifier($child->getAttribute('data-tiptap-block'));
					if ($name !== '') {
						$flushHtml();
						$parsed = self::parseBlockElement($dom, $child, $name, $resolvedCatalog[$name] ?? null);
						$segments[] = [
							'type' => 'miniBlock',
							'name' => $parsed['name'],
							'kind' => $parsed['kind'],
							'tag' => $parsed['tag'],
							'props' => $parsed['props'],
							'body' => $parsed['body'],
							'html' => $parsed['html'],
						];
						continue;
					}
				}

				$saved = $dom->saveHTML($child);
				if (is_string($saved)) {
					$htmlBuffer .= $saved;
				}
			}

			$flushHtml();

			return $segments;
		} finally {
			libxml_clear_errors();
			libxml_use_internal_errors($prevErrors);
		}
	}

	/**
	 * Resolve `./site/templates/tiptap/` directory (supporting `$config->tiptapTemplatesPath` override).
	 */
	public static function resolveTemplatesDirectory(?Wire $context = null): string
	{
		$config = $context?->wire()->config;
		if ($config !== null) {
			$override = $config->get('tiptapTemplatesPath');
			if (is_string($override) && trim($override) !== '') {
				return rtrim(trim($override), '/\\') . '/';
			}
			$templatesPath = (string) ($config->paths->templates ?? '');
			if ($templatesPath !== '') {
				return rtrim($templatesPath, '/\\') . '/tiptap/';
			}
		}

		return '';
	}

	/**
	 * @return array<string, array<string, mixed>>
	 */
	private static function resolveDefaultCatalog(?Wire $context): array
	{
		$builtIns = MiniBlockRegistry::builtInDefinitions();
		$dir = MiniBlockRegistry::resolveDirectory($context);
		$discovered = $dir !== '' ? MiniBlockRegistry::discoverFromDirectory($dir) : [];

		return array_replace($builtIns, $discovered);
	}

	private static function locateTemplateFile(string $templatesDir, string $safeName): ?string
	{
		$trimmedDir = rtrim($templatesDir, '/\\');
		if ($trimmedDir === '' || is_link($trimmedDir)) {
			return null;
		}
		$realBase = realpath($trimmedDir);
		if ($realBase === false) {
			return null;
		}
		$realBasePrefix = rtrim($realBase, '/\\') . DIRECTORY_SEPARATOR;

		$candidates = array_unique([
			$safeName . '.php',
			str_replace('_', '-', $safeName) . '.php',
		]);

		foreach ($candidates as $fileName) {
			if (basename($fileName) !== $fileName) {
				continue;
			}
			$fullPath = $realBasePrefix . $fileName;
			$realCandidate = (!is_link($fullPath) && is_file($fullPath)) ? realpath($fullPath) : false;
			if ($realCandidate !== false && str_starts_with($realCandidate, $realBasePrefix)) {
				return $realCandidate;
			}
		}

		return null;
	}

	/**
	 * @param array<string, mixed>|null $definition
	 * @return array{name: string, kind: string, tag: string, props: array<string, mixed>, body: string, html: string, definition: array<string, mixed>|null}
	 */
	private static function parseBlockElement(
		\DOMDocument $dom,
		\DOMElement $el,
		string $name,
		?array $definition,
	): array {
		$tag = strtolower($el->tagName);
		$outerHtml = (string) ($dom->saveHTML($el) ?: '');
		$kind = is_array($definition) && isset($definition['kind']) && is_string($definition['kind'])
			? $definition['kind']
			: (in_array($name, MiniBlockRegistry::BUILTIN_NAMES, true) ? 'builtin' : 'custom');

		$props = [];
		$body = '';

		if ($name === 'callout') {
			$props['variant'] = $el->getAttribute('data-variant') !== '' ? $el->getAttribute('data-variant') : 'info';
			$props['title'] = $el->getAttribute('data-title');
			$bodyNode = self::findFirstChildWithAttr($el, 'data-tiptap-body') ?? $el;
			$body = trim(self::innerHtml($dom, $bodyNode));
		} elseif ($name === 'figure') {
			$imgs = $el->getElementsByTagName('img');
			$img = ($imgs->length > 0 && $imgs->item(0) instanceof \DOMElement) ? $imgs->item(0) : null;
			$captions = $el->getElementsByTagName('figcaption');
			$caption = ($captions->length > 0 && $captions->item(0) instanceof \DOMElement) ? $captions->item(0) : null;
			$props['src'] = $img instanceof \DOMElement ? MiniBlockHtmlSanitizer::sanitizeImageUrl($img->getAttribute('src')) : '';
			$props['alt'] = $img instanceof \DOMElement ? $img->getAttribute('alt') : '';
			$props['align'] = $el->getAttribute('data-align') !== '' ? $el->getAttribute('data-align') : 'inline';
			$props['caption'] = $caption instanceof \DOMElement ? trim(self::innerHtml($dom, $caption)) : '';
		} elseif ($name === 'details') {
			$summaryText = '';
			foreach ($el->childNodes as $child) {
				if ($child instanceof \DOMElement && strtolower($child->tagName) === 'summary') {
					$summaryText = trim($child->textContent ?? '');
					break;
				}
			}
			$bodyNode = self::findFirstChildWithAttr($el, 'data-tiptap-details-body');
			$props['summary'] = $summaryText;
			$props['open'] = $el->hasAttribute('open');
			$body = $bodyNode instanceof \DOMElement ? trim(self::innerHtml($dom, $bodyNode)) : '';
		} elseif ($name === 'pullquote') {
			$quoteEl = null;
			$captionEl = null;
			foreach ($el->childNodes as $child) {
				if ($child instanceof \DOMElement) {
					$childTag = strtolower($child->tagName);
					if ($childTag === 'blockquote' && $quoteEl === null) {
						$quoteEl = $child;
					} elseif ($childTag === 'figcaption' && $captionEl === null) {
						$captionEl = $child;
					}
				}
			}
			$props['citation'] = $captionEl instanceof \DOMElement ? trim(self::innerHtml($dom, $captionEl)) : '';
			$body = $quoteEl instanceof \DOMElement ? trim(self::innerHtml($dom, $quoteEl)) : '';
		} else {
			$declaredFields = is_array($definition['fields'] ?? null) ? $definition['fields'] : [];
			if ($declaredFields !== []) {
				foreach ($declaredFields as $fSpec) {
					if (!is_array($fSpec) || !isset($fSpec['name'], $fSpec['attr'])) {
						continue;
					}
					$fName = (string) $fSpec['name'];
					$fAttr = (string) $fSpec['attr'];
					$fType = (string) ($fSpec['type'] ?? 'text');
					$rawVal = $el->getAttribute($fAttr);
					$props[$fName] = match ($fType) {
						'toggle' => in_array(strtolower(trim($rawVal)), ['1', 'true', 'yes', 'on'], true),
						'url' => UrlSanitizer::sanitizeHref($rawVal),
						'image' => MiniBlockHtmlSanitizer::sanitizeImageUrl($rawVal),
						default => $rawVal,
					};
				}
			} else {
				foreach ($el->attributes as $attr) {
					if ($attr instanceof \DOMAttr && str_starts_with($attr->name, 'data-prop-')) {
						$propKey = str_replace('-', '_', substr($attr->name, 10));
						$props[$propKey] = $attr->value;
					}
				}
			}

			$bodyNode = self::findFirstChildWithAttr($el, 'data-tiptap-body');
			if ($bodyNode instanceof \DOMElement) {
				$body = trim(self::innerHtml($dom, $bodyNode));
			}
		}

		return [
			'name' => $name,
			'kind' => $kind,
			'tag' => $tag,
			'props' => $props,
			'body' => $body,
			'html' => $outerHtml,
			'definition' => $definition,
		];
	}

	/**
	 * @param array{name: string, kind: string, tag: string, props: array<string, mixed>, body: string, html: string, definition: array<string, mixed>|null} $block
	 */
	private static function renderTemplateFile(
		string $templateFile,
		array $block,
		?Page $page,
		?Field $field,
		?Wire $context,
	): string {
		$vars = [
			'block' => $block,
			'name' => $block['name'],
			'props' => $block['props'],
			'body' => $block['body'],
			'page' => $page,
			'field' => $field,
		];

		$files = $context?->wire()->files;
		if ($files !== null) {
			return (string) $files->render($templateFile, $vars, [
				'allowDotDot' => false,
				'allowedPaths' => [dirname($templateFile)],
			]);
		}

		$isolated = static function (
			string $__file,
			array $block,
			string $name,
			array $props,
			string $body,
			?Page $page,
			?Field $field,
		): string {
			ob_start();
			try {
				include $__file;

				return (string) ob_get_clean();
			} catch (\Throwable $e) {
				ob_end_clean();
				throw $e;
			}
		};

		return $isolated(
			$templateFile,
			$block,
			$block['name'],
			$block['props'],
			$block['body'],
			$page,
			$field,
		);
	}

	private static function hasMiniBlockAncestor(\DOMElement $el, \DOMElement $root): bool
	{
		$cursor = $el->parentNode;
		while ($cursor instanceof \DOMElement && $cursor !== $root) {
			if ($cursor->hasAttribute('data-tiptap-block')) {
				return true;
			}
			$cursor = $cursor->parentNode;
		}

		return false;
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
}
