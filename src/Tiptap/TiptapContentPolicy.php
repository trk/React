<?php

declare(strict_types=1);

namespace Totoglu\React\Tiptap;

use ProcessWire\Field;
use ProcessWire\InputfieldTiptap;
use ProcessWire\Module;
use ProcessWire\Modules;
use ProcessWire\Wire;
use Totoglu\React\Security\UrlSanitizer;

/**
 * Deep server policy module for `InputfieldTiptap` HTML sanitization, configuration resolution,
 * emptiness detection, plain-text length calculation, and full-text search extraction.
 *
 * Encapsulates all ProseMirror / HTMLPurifier / DOM allowlist / mini-block rules behind a small,
 * context-independent interface shared across ProcessWire Page fields, FormSchemaSerializer,
 * Inertia providers, and downstream CMS/block engines.
 */
final class TiptapContentPolicy
{
	public const int TOGGLE_CLEAN_DIV = 2;
	public const int TOGGLE_CLEAN_P = 4;
	public const int TOGGLE_CLEAN_NBSP = 8;
	public const int TOGGLE_REMOVE_STYLES = 16;
	public const int MAX_HTML_BYTES = 4_194_304;

	public const string DEFAULT_TOOLBAR = 'styles | bold italic underline strike code highlight | alignleft aligncenter alignright | bullist numlist tasklist blockquote codeblock | link image table hr | removeformat source | undo redo';
	public const string DEFAULT_BUBBLE_TOOLBAR = 'bold italic underline strike code highlight | link removeformat';

	/**
	 * @var list<string>
	 */
	public const array RICH_TEXT_TYPES = [
		'tiptap',
		'tiptap_language',
		'tiptap-language',
		'tiptaplanguage',
		'inputfieldtiptap',
		'richtext',
		'richtext_language',
		'richtext-language',
		'richtextlanguage',
		'html',
		'html_language',
		'html-language',
		'wysiwyg',
		'wysiwyg_language',
		'wysiwyg-language',
		'tinymce',
		'tinymce_language',
		'tinymce-language',
		'tinymcelanguage',
		'inputfieldtinymce',
		'ckeditor',
		'inputfieldckeditor',
	];

	/**
	 * Canonical toolbar item identifiers supported by `InputfieldTiptap`.
	 *
	 * @var list<string>
	 */
	public const array ALL_TOOLBAR_TOKENS = [
		'|',
		'styles',
		'paragraph',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'bold',
		'italic',
		'underline',
		'strike',
		'code',
		'highlight',
		'subscript',
		'superscript',
		'alignleft',
		'aligncenter',
		'alignright',
		'alignjustify',
		'bullist',
		'numlist',
		'tasklist',
		'blockquote',
		'codeblock',
		'link',
		'unlink',
		'anchor',
		'image',
		'table',
		'hr',
		'insertblock',
		'removeformat',
		'source',
		'fullscreen',
		'undo',
		'redo',
	];

	/**
	 * @var list<string>
	 */
	public const array DEFAULT_FEATURES = [
		'toolbar',
		'stickybars',
		'bubbleMenu',
		'statusbar',
		'spellcheck',
		'purifier',
		'pasteFilter',
		'sourceCode',
		'imgUpload',
		'imgResize',
	];

	/**
	 * Canonical feature flags queried via `useFeature($name)`.
	 *
	 * @var list<string>
	 */
	public const array ALL_FEATURES = [
		'toolbar',
		'stickybars',
		'bubbleMenu',
		'statusbar',
		'spellcheck',
		'purifier',
		'pasteFilter',
		'sourceCode',
		'imgUpload',
		'imgResize',
		'slashMenu',
		'blockHandles',
	];

	/**
	 * Canonical heading levels allowed in `headlines`.
	 *
	 * @var list<string>
	 */
	public const array ALL_HEADLINES = [
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
	];

	/**
	 * @var array<string, bool>
	 */
	private static array $resolvingFields = [];

	/**
	 * Cached isolated `MarkupHTMLPurifier` instances keyed by `Modules` container.
	 *
	 * @var \WeakMap<Modules, object>|null
	 */
	private static ?\WeakMap $purifierCache = null;

	/**
	 * Cached probe `InputfieldTiptap` instances keyed by `Modules` container for catalog discovery.
	 *
	 * @var \WeakMap<Modules, InputfieldTiptap>|null
	 */
	private static ?\WeakMap $catalogProbeCache = null;

	/**
	 * Determine whether a declarative/blueprint field type represents rich HTML text.
	 */
	public static function isRichTextType(string $type): bool
	{
		return in_array(strtolower(trim($type)), self::RICH_TEXT_TYPES, true);
	}

	/**
	 * Resolve effective editor configuration across module defaults, `settingsField` inheritance,
	 * and explicit field/blueprint overrides.
	 *
	 * @param array<string, mixed> $overrides
	 * @param array<string, array<string, mixed>> $catalog
	 * @param list<string> $htmlValues
	 * @return array{
	 *   preset: string,
	 *   toolbar: string,
	 *   toolbarGroups: list<list<string>>,
	 *   bubbleToolbar: string,
	 *   bubbleGroups: list<list<string>>,
	 *   headlines: list<string>,
	 *   features: list<string>,
	 *   toggles: list<int>,
	 *   height: int,
	 *   maxHeight: int,
	 *   inlineMode: int,
	 *   slashMenu: bool,
	 *   miniBlocks: list<string>,
	 *   preservedMiniBlocks: list<string>,
	 *   miniBlockDefs: array<string, array<string, mixed>>,
	 *   imageFields: list<string>,
	 *   extraCSS: string,
	 *   bundles: list<string>
	 * }
	 */
	public static function resolveEditorSettings(
		array $overrides = [],
		?Wire $context = null,
		array $catalog = [],
		string $ownFieldName = '',
		array $htmlValues = [],
	): array {
		$resolvedCatalog = $catalog !== [] ? $catalog : self::resolveCatalog($context);

		$state = [
			'preset' => TiptapPresetCatalog::PRESET_EDITOR,
			'toolbar' => self::DEFAULT_TOOLBAR,
			'bubbleToolbar' => self::DEFAULT_BUBBLE_TOOLBAR,
			'headlines' => ['h2', 'h3', 'h4'],
			'features' => self::DEFAULT_FEATURES,
			'toggles' => [self::TOGGLE_CLEAN_P, self::TOGGLE_REMOVE_STYLES],
			'height' => 260,
			'maxHeight' => 640,
			'inlineMode' => 0,
			'slashMenu' => null,
			'miniBlocks' => [],
			'imageFields' => [],
			'extraCSS' => '',
		];

		// Layer 2: Module-level configuration + defaultsJSON
		$moduleConfig = $context?->wire()->modules->getConfig('InputfieldTiptap');
		if (is_array($moduleConfig)) {
			$state = self::mergeSettingsLayer($state, $moduleConfig, $resolvedCatalog);
			$modJson = trim((string) ($moduleConfig['defaultsJSON'] ?? ''));
			if ($modJson !== '') {
				$state = self::applyJsonOverlay($state, $modJson, $resolvedCatalog);
			}
		}

		$overrideDefaultsJson = trim((string) ($overrides['defaultsJSON'] ?? ''));
		if (
			$overrideDefaultsJson !== ''
			&& (!is_array($moduleConfig) || $overrideDefaultsJson !== trim((string) ($moduleConfig['defaultsJSON'] ?? '')))
		) {
			$state = self::applyJsonOverlay($state, $overrideDefaultsJson, $resolvedCatalog);
		}

		// Layer 3: Optional inherited `settingsField`
		$inheritFieldName = trim((string) ($overrides['settingsField'] ?? ''));
		if (
			$inheritFieldName !== ''
			&& $inheritFieldName !== $ownFieldName
			&& !isset(self::$resolvingFields[$inheritFieldName])
		) {
			self::$resolvingFields[$inheritFieldName] = true;
			try {
				$sourceField = $context?->wire()->fields->get($inheritFieldName);
				if ($sourceField instanceof Field) {
					$fieldData = $sourceField->getArray();
					$state = self::mergeSettingsLayer($state, $fieldData, $resolvedCatalog);
					$inheritedJson = trim((string) ($fieldData['settingsJSON'] ?? ''));
					if ($inheritedJson !== '') {
						$state = self::applyJsonOverlay($state, $inheritedJson, $resolvedCatalog);
					}
				}
			} finally {
				unset(self::$resolvingFields[$inheritFieldName]);
			}
		}

		// Layer 4: Explicit field / blueprint overrides (nested `tiptapConfig` supported seamlessly)
		$nestedCfg = isset($overrides['tiptapConfig']) && is_array($overrides['tiptapConfig'])
			? $overrides['tiptapConfig']
			: [];
		$mergedOverrides = $nestedCfg !== [] ? array_replace($nestedCfg, $overrides) : $overrides;
		$state = self::mergeSettingsLayer($state, $mergedOverrides, $resolvedCatalog);

		$fieldJson = trim((string) ($mergedOverrides['settingsJSON'] ?? ''));
		if ($fieldJson !== '') {
			$state = self::applyJsonOverlay($state, $fieldJson, $resolvedCatalog);
		}

		return self::finalizeEditorState($state, $resolvedCatalog, $htmlValues);
	}

	/**
	 * Sanitize rich HTML according to resolved or raw `InputfieldTiptap` settings.
	 *
	 * Preserves enabled flat `[data-tiptap-block]` structures, `<mark>` (including nested `<span>`),
	 * and `taskList` / `taskItem` items while stripping all XSS vectors. If `MarkupHTMLPurifier` is
	 * unavailable or throws, falls back deterministically to `sanitizeHtmlWithoutPurifier()` rather
	 * than wiping user content.
	 *
	 * @param array<string, mixed> $settingsOrResolved
	 * @param callable(string): string|null $purifierRunner
	 */
	public static function sanitizeHtml(
		string $html,
		array $settingsOrResolved = [],
		?Wire $context = null,
		?callable $purifierRunner = null,
	): string {
		$trimmed = trim($html);
		if ($trimmed === '' || strlen($trimmed) > self::MAX_HTML_BYTES) {
			return '';
		}

		$resolved = (isset($settingsOrResolved['miniBlockDefs']) && is_array($settingsOrResolved['miniBlockDefs'])
			&& isset($settingsOrResolved['features']) && is_array($settingsOrResolved['features'])
			&& isset($settingsOrResolved['toggles']) && is_array($settingsOrResolved['toggles']))
			? $settingsOrResolved
			: self::resolveEditorSettings($settingsOrResolved, $context);

		$activeMiniBlocks = is_array($resolved['miniBlockDefs'] ?? null) ? $resolved['miniBlockDefs'] : [];
		$clean = self::stripExecutableTags($trimmed);
		if (trim($clean) === '') {
			return '';
		}

		try {
			$extracted = MiniBlockHtmlSanitizer::extractAndSanitize(
				$clean,
				$activeMiniBlocks,
				static fn(string $innerHtml): string => self::cleanRichHtmlFragment($innerHtml, $resolved, $context, $purifierRunner),
			);

			$cleanOuter = self::cleanRichHtmlFragment($extracted['html'], $resolved, $context, $purifierRunner);
			$restored = MiniBlockHtmlSanitizer::restorePlaceholders($cleanOuter, $extracted['replacements']);

			return trim($restored);
		} catch (\Throwable $e) {
			$context?->wire()->log->error('InputfieldTiptap purifier error: ' . $e->getMessage());

			return '';
		}
	}

	/**
	 * Determine whether a rich HTML string is semantically empty (e.g. `<p><br></p>`, `<p>&nbsp;</p>`,
	 * or an empty callout wrapper with no text, media, or non-empty custom props).
	 */
	public static function isEmptyHtml(string $html): bool
	{
		$trimmed = trim($html);
		if ($trimmed === '') {
			return true;
		}

		if (preg_match('~<(?:img|hr|iframe|video|audio|embed|object|table)\b~i', $trimmed) === 1) {
			return false;
		}
		if (preg_match('~<a\b[^>]*\b(?:id|name)\s*=\s*(["\'])(?!\1)\s*[A-Za-z]~i', $trimmed) === 1) {
			return false;
		}

		// Non-empty custom mini-block data-prop-* attribute or callout title counts as content
		if (str_contains($trimmed, 'data-tiptap-block')) {
			if (preg_match('/\bdata-prop-[a-z0-9-]+\s*=\s*(["\'])(?!\1)[^\r\n]*?\1/i', $trimmed) === 1) {
				return false;
			}
			if (preg_match('/\bdata-title\s*=\s*(["\'])(?!\1)\s*\S.*?\1/is', $trimmed) === 1) {
				return false;
			}
		}

		$withoutExec = self::stripExecutableTags($trimmed);
		$decoded = html_entity_decode(strip_tags($withoutExec), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$normalized = str_replace(["\u{00A0}", "\u{200B}", "\u{FEFF}"], ' ', $decoded);

		return trim($normalized) === '';
	}

	/**
	 * Compute visible character count matching Tiptap's `CharacterCount` / ProseMirror `doc.textContent`.
	 */
	public static function plainTextLength(string $html): int
	{
		$trimmed = trim($html);
		if ($trimmed === '') {
			return 0;
		}

		$withoutExec = self::stripExecutableTags($trimmed);
		// Remove pretty-printed whitespace purely between block tags so `<p>a</p>\n<p>b</p>` matches ProseMirror
		$compactBetweenBlocks = (string) preg_replace(
			'~(</(?:p|h[1-6]|li|ul|ol|blockquote|pre|div|aside|section|figure|figcaption|details|summary|tr|td|th)>)\s+(<)~i',
			'$1$2',
			$withoutExec,
		);
		$text = html_entity_decode(strip_tags($compactBetweenBlocks), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$text = str_replace("\u{00A0}", ' ', $text);

		return mb_strlen($text, 'UTF-8');
	}

	/**
	 * Extract clean, space-normalized plain text for full-text search indexing, previews, and labels.
	 * Includes visible prose as well as mini-block `data-title`, `alt`, and `data-prop-*` text values.
	 */
	public static function extractSearchableText(string $html): string
	{
		$trimmed = trim($html);
		if ($trimmed === '' || strlen($trimmed) > self::MAX_HTML_BYTES) {
			return '';
		}

		$withoutExec = self::stripExecutableTags($trimmed);
		$attrFragments = [];

		if (str_contains($withoutExec, 'data-tiptap-block') || stripos($withoutExec, 'alt=') !== false) {
			if (preg_match_all('/\b(?:data-title|alt|data-prop-[a-z0-9-]+)\s*=\s*(["\'])(.*?)\1/is', $withoutExec, $matches) > 0) {
				foreach ($matches[2] as $rawAttrVal) {
					$decodedAttr = trim(html_entity_decode($rawAttrVal, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
					if ($decodedAttr !== '' && $decodedAttr !== '0' && $decodedAttr !== '1') {
						$attrFragments[] = $decodedAttr;
					}
				}
			}
		}

		$spaced = (string) preg_replace(
			'~<(?:br\b[^>]*/?|/(?:p|h[1-6]|li|blockquote|pre|div|aside|section|figure|figcaption|details|summary|tr|td|th))>~i',
			' ',
			$withoutExec,
		);
		$plain = html_entity_decode(strip_tags($spaced), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		if ($attrFragments !== []) {
			$plain .= ' ' . implode(' ', $attrFragments);
		}
		$plain = str_replace("\u{00A0}", ' ', $plain);
		$collapsed = (string) preg_replace('/\s+/u', ' ', $plain);

		return trim($collapsed);
	}

	/**
	 * Sanitize custom editor CSS to prevent `<style>` breakout (including unclosed tags),
	 * CSS hex-escaped `@import` / `expression()` / `javascript:` vectors.
	 */
	public static function sanitizeExtraCss(string $css): string
	{
		$clean = trim(str_replace("\0", '', $css));
		if ($clean === '') {
			return '';
		}

		// Decode CSS hex escape sequences (`\69 ` -> `i`) for inspection/normalization before keyword filtering
		$clean = (string) preg_replace_callback(
			'/\\\\([0-9a-fA-F]{1,6})\s?/',
			static function (array $m): string {
				$code = (int) hexdec($m[1]);
				if ($code <= 0 || $code > 0x10FFFF || ($code >= 0xD800 && $code <= 0xDFFF)) {
					return '';
				}

				return mb_chr($code, 'UTF-8') ?: '';
			},
			$clean,
		);
		// Strip remaining CSS backslash escapes inside identifiers (`e\xpression`)
		$clean = (string) preg_replace('/\\\\([^0-9a-fA-F\r\n])/', '$1', $clean);

		// Iteratively strip CSS comments (`/* ... */` and unclosed `/*`) before tag & keyword filtering
		do {
			$prevComments = $clean;
			$clean = (string) preg_replace('~/\*.*?\*/~s', '', $clean);
			$clean = (string) preg_replace('~/\*.*$~s', '', $clean);
		} while ($clean !== $prevComments);

		// Iteratively strip embedded `<script>` / `<style>` elements and any remaining tag openers so obfuscation cannot reassemble tags
		do {
			$prev = $clean;
			$clean = (string) preg_replace('~<(script|style)\b[^>]*>.*?</\1>~is', '', $clean);
			$clean = (string) preg_replace('~<\s*/+\s*(?:style|script)\b[^>]*>?~is', '', $clean);
			$clean = (string) preg_replace('~<\s*/?\s*(?:style|script)\b[^>]*>?~is', '', $clean);
			$clean = (string) preg_replace('~<\s*/+~i', '', $clean);
			$clean = str_ireplace(['</', '<style', '<script'], '', $clean);
		} while ($clean !== $prev);
		$clean = str_replace('<', '', $clean);
		$clean = (string) preg_replace('/@import\b[^;]*(?:;|$)/i', '', $clean);
		$clean = (string) preg_replace('/expression\s*\([^;{}]*\)/i', 'none', $clean);
		$clean = (string) preg_replace('/expression\s*\(/i', 'blocked(', $clean);
		$clean = (string) preg_replace('/-moz-binding\s*:[^;]*(?:;|$)/i', '', $clean);
		$clean = (string) preg_replace('/behavior\s*:[^;]*(?:;|$)/i', '', $clean);
		$clean = (string) preg_replace('/url\s*\(\s*[\'"]?\s*(?:javascript\s*:|vbscript\s*:|data\s*:\s*(?:text\/html|image\/svg\+xml|application\/xhtml))/i', 'url(about:blank#', $clean);

		return trim($clean);
	}

	/**
	 * Purify HTML via an isolated `MarkupHTMLPurifier` instance while preserving `<mark>` (with nested spans)
	 * and Tiptap task-list attributes in any attribute order.
	 */
	public static function runHtmlPurifier(string $html, ?Wire $context = null): string
	{
		$modules = $context?->wire()->modules;
		if (!$modules instanceof Modules || !$modules->isInstalled('MarkupHTMLPurifier')) {
			throw new \RuntimeException('MarkupHTMLPurifier module is not installed.');
		}

		if (self::$purifierCache === null) {
			self::$purifierCache = new \WeakMap();
		}

		$purifier = self::$purifierCache[$modules] ?? null;
		if ($purifier === null) {
			/** @var Module|Wire|null $instance */
			$instance = $modules->get('MarkupHTMLPurifier');
			if ($instance === null || !method_exists($instance, 'purify')) {
				throw new \RuntimeException('MarkupHTMLPurifier module is unavailable.');
			}
			if (method_exists($instance, 'set')) {
				$allowedTargets = ['_blank', '_self', '_parent', '_top'];
				$allowedRels = ['nofollow', 'noopener', 'noreferrer', 'sponsored', 'ugc', 'external'];
				$linkCfg = $modules->getModuleConfigData('ProcessPageEditLink');
				if (is_array($linkCfg)) {
					foreach (explode("\n", (string) ($linkCfg['targetOptions'] ?? '')) as $tLine) {
						$cleanT = trim($tLine, "+ \t\r\n");
						if ($cleanT !== '' && preg_match('/^[A-Za-z0-9_-]+$/', $cleanT) === 1 && !in_array($cleanT, $allowedTargets, true)) {
							$allowedTargets[] = $cleanT;
						}
					}
					foreach (explode("\n", (string) ($linkCfg['relOptions'] ?? '')) as $rLine) {
						$cleanR = trim($rLine, "+ \t\r\n");
						if ($cleanR !== '' && preg_match('/^[A-Za-z0-9_-]+$/', $cleanR) === 1 && !in_array($cleanR, $allowedRels, true)) {
							$allowedRels[] = $cleanR;
						}
					}
				}
				$instance->set('Attr.AllowedFrameTargets', $allowedTargets);
				$instance->set('Attr.AllowedRel', $allowedRels);
				$instance->set('Attr.EnableID', true);
			}
			self::$purifierCache[$modules] = $instance;
			$purifier = $instance;
		}

		$hasMark = stripos($html, '<mark') !== false;
		$hasTask = stripos($html, 'taskList') !== false || stripos($html, 'taskItem') !== false;
		$hasEmptyAnchor = preg_match('~<a\b[^>]*\b(?:id|name)\s*=~i', $html) === 1;

		$prepared = $html;
		if ($hasEmptyAnchor) {
			$prepared = (string) preg_replace_callback(
				'~<a\b([^>]*?)>\s*</a>~i',
				static function (array $m): string {
					if (preg_match('/\bhref\s*=/i', $m[1]) === 1) {
						return $m[0];
					}
					if (preg_match('/\b(?:id|name)\s*=\s*["\']([A-Za-z][A-Za-z0-9_.:-]{0,127})["\']/i', $m[1], $idMatch) === 1) {
						$safeId = $idMatch[1];
						if (!str_starts_with(strtolower($safeId), '__rw_')) {
							return '<span class="rw-tiptap-anchor-token-' . $safeId . '">&#8203;</span>';
						}
					}

					return $m[0];
				},
				$prepared,
			);
		}
		if ($hasMark) {
			$prepared = (string) preg_replace('~<mark\b[^>]*>~i', '<span class="rw-tiptap-mark">', $prepared);
			$prepared = str_ireplace('</mark>', '</span>', $prepared);
		}
		if ($hasTask) {
			$prepared = (string) preg_replace_callback(
				'~<ul\b([^>]*)>~i',
				static function (array $m): string {
					if (preg_match('/\bdata-type\s*=\s*["\']taskList["\']/i', $m[1]) === 1) {
						return '<ul class="rw-tiptap-tasklist">';
					}

					return $m[0];
				},
				$prepared,
			);
			$prepared = (string) preg_replace_callback(
				'~<li\b([^>]*)>~i',
				static function (array $m): string {
					if (preg_match('/\bdata-type\s*=\s*["\']taskItem["\']/i', $m[1]) !== 1) {
						return $m[0];
					}
					$checked = preg_match('/\bdata-checked\s*=\s*["\']true["\']/i', $m[1]) === 1 ? 'true' : 'false';

					return '<li class="rw-tiptap-taskitem-' . $checked . '">';
				},
				$prepared,
			);
		}

		$purified = method_exists($purifier, 'purify') ? (string) $purifier->purify($prepared) : '';

		if ($hasMark && str_contains($purified, 'rw-tiptap-mark')) {
			$purified = self::restoreMarkElements($purified);
		}

		if ($hasTask) {
			$purified = str_replace(
				[
					'class="rw-tiptap-tasklist"',
					'class="rw-tiptap-taskitem-true"',
					'class="rw-tiptap-taskitem-false"',
				],
				[
					'data-type="taskList"',
					'data-type="taskItem" data-checked="true"',
					'data-type="taskItem" data-checked="false"',
				],
				$purified,
			);
		}

		if ($hasEmptyAnchor && str_contains($purified, 'rw-tiptap-anchor-token-')) {
			$purified = (string) preg_replace(
				'~<span\s+class="rw-tiptap-anchor-token-([A-Za-z][A-Za-z0-9_.:-]{0,127})">(?:&#8203;|\x{200B}|\s)*</span>~iu',
				'<a id="$1"></a>',
				$purified,
			);
		}

		return $purified;
	}

	/**
	 * Deterministic `DOMDocument` allowlist HTML sanitizer used when `purifier` is disabled or unavailable.
	 */
	public static function sanitizeHtmlWithoutPurifier(string $html): string
	{
		if (trim($html) === '') {
			return '';
		}

		$cleanInput = self::stripExecutableTags($html);
		if (trim($cleanInput) === '') {
			return '';
		}

		$allowedTags = [
			'p' => true, 'br' => true, 'hr' => true, 'div' => true, 'span' => true,
			'strong' => true, 'b' => true, 'em' => true, 'i' => true, 'u' => true,
			's' => true, 'del' => true, 'ins' => true, 'sub' => true, 'sup' => true,
			'mark' => true, 'code' => true, 'pre' => true, 'blockquote' => true,
			'ul' => true, 'ol' => true, 'li' => true,
			'h1' => true, 'h2' => true, 'h3' => true, 'h4' => true, 'h5' => true, 'h6' => true,
			'a' => true, 'img' => true, 'figure' => true, 'figcaption' => true,
			'table' => true, 'thead' => true, 'tbody' => true, 'tfoot' => true,
			'tr' => true, 'th' => true, 'td' => true, 'colgroup' => true, 'col' => true,
		];
		$dropEntirelyTags = [
			'script' => true, 'style' => true, 'svg' => true, 'math' => true,
			'iframe' => true, 'object' => true, 'embed' => true, 'applet' => true,
			'form' => true, 'input' => true, 'button' => true, 'select' => true, 'textarea' => true,
			'meta' => true, 'base' => true, 'link' => true, 'frame' => true, 'frameset' => true,
			'template' => true, 'noscript' => true,
		];

		$prevErrors = libxml_use_internal_errors(true);
		try {
			$dom = new \DOMDocument('1.0', 'UTF-8');
			$wrapped = '<?xml encoding="utf-8" ?><div id="__rw_tiptap_root__">' . $cleanInput . '</div>';
			if (!$dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET)) {
				return '';
			}

			$root = DomFragmentHelper::locateRootElement($dom, '__rw_tiptap_root__');
			if (!$root instanceof \DOMElement) {
				return '';
			}

			$allNodes = $root->getElementsByTagName('*');
			$elements = [];
			foreach ($allNodes as $node) {
				if ($node instanceof \DOMElement) {
					$elements[] = $node;
				}
			}

			for ($i = count($elements) - 1; $i >= 0; $i--) {
				$el = $elements[$i];
				$tag = strtolower($el->tagName);
				$parent = $el->parentNode;
				if ($parent === null) {
					continue;
				}

				if (isset($dropEntirelyTags[$tag])) {
					$parent->removeChild($el);
					continue;
				}

				if (!isset($allowedTags[$tag])) {
					while ($el->firstChild !== null) {
						$parent->insertBefore($el->firstChild, $el);
					}
					$parent->removeChild($el);
					continue;
				}

				$styleAlignTags = [
					'p' => true, 'div' => true, 'h1' => true, 'h2' => true, 'h3' => true, 'h4' => true,
					'h5' => true, 'h6' => true, 'blockquote' => true, 'pre' => true, 'li' => true,
					'td' => true, 'th' => true, 'figure' => true, 'figcaption' => true, 'table' => true,
				];
				/** @var list<\DOMAttr> $attrsToRemove */
				$attrsToRemove = [];
				$attrsToUpdate = [];
				$resolvedTarget = '';
				$resolvedRelTokens = [];
				foreach ($el->attributes as $attr) {
					if (!$attr instanceof \DOMAttr) {
						continue;
					}
					$attrName = strtolower($attr->name);

					if ($attrName === 'id' || $attrName === 'name') {
						$allowAnchorAttr = ($attrName === 'id' && ($tag === 'a' || preg_match('/^h[1-6]$/', $tag) === 1))
							|| ($attrName === 'name' && $tag === 'a');
						$cleanAnchor = trim($attr->value);
						if (
							!$allowAnchorAttr
							|| preg_match('/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/', $cleanAnchor) !== 1
							|| str_starts_with(strtolower($cleanAnchor), '__rw_')
						) {
							$attrsToRemove[] = $attr;
						} else {
							$attrsToUpdate[$attr->name] = $cleanAnchor;
						}
						continue;
					}

					if ($attrName === 'class') {
						$cleanClasses = [];
						foreach (preg_split('/\s+/', trim($attr->value)) ?: [] as $clsToken) {
							if (
								$clsToken !== ''
								&& preg_match('/^[A-Za-z0-9_:-]{1,80}$/', $clsToken) === 1
								&& !str_starts_with(strtolower($clsToken), 'rw-tiptap-anchor-token')
								&& !in_array($clsToken, $cleanClasses, true)
							) {
								$cleanClasses[] = $clsToken;
							}
						}
						if ($cleanClasses === []) {
							$attrsToRemove[] = $attr;
						} else {
							$attrsToUpdate[$attr->name] = implode(' ', $cleanClasses);
						}
						continue;
					}

					if ($attrName === 'title') {
						$cleanTitle = trim((string) preg_replace('/[\x00-\x1F\x7F]+/', '', $attr->value));
						if ($cleanTitle === '') {
							$attrsToRemove[] = $attr;
						} else {
							$attrsToUpdate[$attr->name] = $cleanTitle;
						}
						continue;
					}

					if ($attrName === 'dir') {
						$cleanDir = strtolower(trim($attr->value));
						if (in_array($cleanDir, ['ltr', 'rtl', 'auto'], true)) {
							$attrsToUpdate[$attr->name] = $cleanDir;
						} else {
							$attrsToRemove[] = $attr;
						}
						continue;
					}

					if ($attrName === 'lang') {
						$cleanLang = trim($attr->value);
						if (preg_match('/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/', $cleanLang) === 1) {
							$attrsToUpdate[$attr->name] = $cleanLang;
						} else {
							$attrsToRemove[] = $attr;
						}
						continue;
					}

					if ($attrName === 'style') {
						$rawStyle = trim($attr->value);
						if (
							isset($styleAlignTags[$tag])
							&& preg_match('/^text-align\s*:\s*(left|center|right|justify)\s*;?$/i', $rawStyle, $alignMatch) === 1
						) {
							$attrsToUpdate[$attr->name] = 'text-align: ' . strtolower($alignMatch[1]);
						} else {
							$attrsToRemove[] = $attr;
						}
						continue;
					}

					if ($attrName === 'src') {
						if ($tag !== 'img') {
							$attrsToRemove[] = $attr;
							continue;
						}
						$safeSrc = MiniBlockHtmlSanitizer::sanitizeImageUrl($attr->value);
						if ($safeSrc === '') {
							$attrsToRemove[] = $attr;
						} else {
							$attrsToUpdate[$attr->name] = $safeSrc;
						}
						continue;
					}

					if ($attrName === 'alt') {
						if ($tag !== 'img') {
							$attrsToRemove[] = $attr;
						} else {
							$attrsToUpdate[$attr->name] = (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/', '', $attr->value);
						}
						continue;
					}

					if ($attrName === 'loading') {
						$cleanLoading = strtolower(trim($attr->value));
						if ($tag === 'img' && in_array($cleanLoading, ['lazy', 'eager'], true)) {
							$attrsToUpdate[$attr->name] = $cleanLoading;
						} else {
							$attrsToRemove[] = $attr;
						}
						continue;
					}

					if ($attrName === 'decoding') {
						$cleanDecoding = strtolower(trim($attr->value));
						if ($tag === 'img' && in_array($cleanDecoding, ['async', 'sync', 'auto'], true)) {
							$attrsToUpdate[$attr->name] = $cleanDecoding;
						} else {
							$attrsToRemove[] = $attr;
						}
						continue;
					}

					if ($attrName === 'href') {
						if ($tag !== 'a') {
							$attrsToRemove[] = $attr;
							continue;
						}
						$decodedUri = html_entity_decode($attr->value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
						$strippedUri = (string) preg_replace('/[\x00-\x1F\x7F]+/', '', $decodedUri);
						$safeUri = UrlSanitizer::sanitizeHref($strippedUri);
						if ($safeUri === '') {
							$attrsToRemove[] = $attr;
						} else {
							$attrsToUpdate[$attr->name] = $safeUri;
						}
						continue;
					}

					if ($attrName === 'target') {
						$cleanTarget = trim($attr->value);
						if ($tag !== 'a' || preg_match('/^_[A-Za-z0-9_-]{1,32}$/', $cleanTarget) !== 1) {
							$attrsToRemove[] = $attr;
						} else {
							$resolvedTarget = $cleanTarget;
							$attrsToUpdate[$attr->name] = $cleanTarget;
						}
						continue;
					}

					if ($attrName === 'rel') {
						if ($tag !== 'a') {
							$attrsToRemove[] = $attr;
							continue;
						}
						foreach (preg_split('/\s+/', strtolower(trim($attr->value))) ?: [] as $relToken) {
							if ($relToken !== '' && preg_match('/^[a-z0-9_-]{1,40}$/', $relToken) === 1 && !in_array($relToken, $resolvedRelTokens, true)) {
								$resolvedRelTokens[] = $relToken;
							}
						}
						if ($resolvedRelTokens === []) {
							$attrsToRemove[] = $attr;
						}
						continue;
					}

					if ($attrName === 'width' || $attrName === 'height') {
						$cleanDim = trim($attr->value);
						if (in_array($tag, ['img', 'table', 'td', 'th', 'col'], true) && preg_match('/^[1-9][0-9]{0,4}%?$/', $cleanDim) === 1) {
							$attrsToUpdate[$attr->name] = $cleanDim;
						} else {
							$attrsToRemove[] = $attr;
						}
						continue;
					}

					if ($attrName === 'colspan' || $attrName === 'rowspan') {
						$cleanSpan = trim($attr->value);
						if (in_array($tag, ['td', 'th'], true) && preg_match('/^[1-9][0-9]{0,2}$/', $cleanSpan) === 1) {
							$attrsToUpdate[$attr->name] = $cleanSpan;
						} else {
							$attrsToRemove[] = $attr;
						}
						continue;
					}

					if ($attrName === 'scope') {
						$cleanScope = strtolower(trim($attr->value));
						if ($tag === 'th' && in_array($cleanScope, ['row', 'col', 'rowgroup', 'colgroup'], true)) {
							$attrsToUpdate[$attr->name] = $cleanScope;
						} else {
							$attrsToRemove[] = $attr;
						}
						continue;
					}

					if ($attrName === 'data-type' || $attrName === 'data-checked') {
						$allowedTaskAttr = ($tag === 'ul' && $attrName === 'data-type' && $attr->value === 'taskList')
							|| ($tag === 'li' && $attrName === 'data-type' && $attr->value === 'taskItem')
							|| ($tag === 'li' && $attrName === 'data-checked' && ($attr->value === 'true' || $attr->value === 'false'));
						if (!$allowedTaskAttr) {
							$attrsToRemove[] = $attr;
						}
						continue;
					}

					// Strip every unrecognized or unallowlisted attribute by default
					$attrsToRemove[] = $attr;
				}

				if ($tag === 'a') {
					if ($resolvedTarget === '_blank') {
						foreach (['noopener', 'noreferrer'] as $secRel) {
							if (!in_array($secRel, $resolvedRelTokens, true)) {
								$resolvedRelTokens[] = $secRel;
							}
						}
					}
					if ($resolvedRelTokens !== []) {
						$attrsToUpdate['rel'] = implode(' ', $resolvedRelTokens);
					}
				}

				foreach ($attrsToRemove as $rmAttr) {
					$el->removeAttributeNode($rmAttr);
				}
				foreach ($attrsToUpdate as $upName => $upVal) {
					$el->setAttribute($upName, $upVal);
				}
			}

			$serialized = '';
			foreach ($root->childNodes as $child) {
				$serialized .= (string) $dom->saveHTML($child);
			}

			return trim($serialized);
		} finally {
			libxml_clear_errors();
			libxml_use_internal_errors($prevErrors);
		}
	}

	/**
	 * @param array<string, mixed> $resolved
	 * @param callable(string): string|null $purifierRunner
	 */
	private static function cleanRichHtmlFragment(
		string $fragment,
		array $resolved,
		?Wire $context,
		?callable $purifierRunner = null,
	): string {
		$clean = self::stripExecutableTags($fragment);
		if (trim($clean) === '') {
			return '';
		}

		$toggles = is_array($resolved['toggles'] ?? null) ? $resolved['toggles'] : [];
		$features = is_array($resolved['features'] ?? null) ? $resolved['features'] : [];

		if (in_array('purifier', $features, true)) {
			try {
				$clean = $purifierRunner !== null
					? $purifierRunner($clean)
					: self::runHtmlPurifier($clean, $context);
			} catch (\Throwable) {
				$clean = self::sanitizeHtmlWithoutPurifier($clean);
			}
		} else {
			$clean = self::sanitizeHtmlWithoutPurifier($clean);
		}

		if (in_array(self::TOGGLE_CLEAN_DIV, $toggles, true)) {
			$clean = (string) preg_replace('~</?div\b[^>]*>~i', '', $clean);
		}

		if (in_array(self::TOGGLE_CLEAN_NBSP, $toggles, true)) {
			$clean = str_replace(['&nbsp;', '&#160;', "\u{00A0}"], ' ', $clean);
		}

		if (in_array(self::TOGGLE_REMOVE_STYLES, $toggles, true)) {
			$clean = (string) preg_replace_callback(
				'/\s+style\s*=\s*(["\'])(.*?)\1/is',
				static function (array $matches): string {
					$rawStyle = trim($matches[2]);
					if (preg_match('/^text-align\s*:\s*(left|center|right|justify)\s*;?$/i', $rawStyle, $alignMatch) === 1) {
						return ' style="text-align: ' . strtolower($alignMatch[1]) . '"';
					}

					return '';
				},
				$clean,
			);
		}

		if (in_array(self::TOGGLE_CLEAN_P, $toggles, true)) {
			$clean = (string) preg_replace('~<p(?:\s[^>]*)?>(?:\s|&nbsp;|&#160;|&#xA0;|<br\s*/?>)*</p>~iu', '', $clean);
		}

		return trim($clean);
	}

	private static function stripExecutableTags(string $html): string
	{
		$clean = (string) preg_replace(
			'~<(script|style|svg|math|iframe|object|embed|applet|form|meta|base|link)\b[^>]*>.*?</\1>~is',
			'',
			$html,
		);

		return (string) preg_replace(
			'~<(script|style|svg|math|iframe|object|embed|applet|form|meta|base|link)\b[^>]*/?>~is',
			'',
			$clean,
		);
	}

	/**
	 * Convert `<span class="rw-tiptap-mark">...</span>` back into `<mark>...</mark>` via DOM traversal
	 * so arbitrarily nested `<span>` children are preserved intact.
	 */
	private static function restoreMarkElements(string $html): string
	{
		return DomFragmentHelper::withFragment(
			$html,
			'__rw_tiptap_mark_root__',
			static function (\DOMDocument $dom, \DOMElement $root) use ($html): string {
				$xpath = new \DOMXPath($dom);
				$spans = $xpath->query('.//span[@class="rw-tiptap-mark"]', $root);
				if ($spans === false || $spans->length === 0) {
					return $html;
				}

				$nodes = [];
				foreach ($spans as $node) {
					if ($node instanceof \DOMElement) {
						$nodes[] = $node;
					}
				}

				for ($i = count($nodes) - 1; $i >= 0; $i--) {
					$span = $nodes[$i];
					$parent = $span->parentNode;
					if ($parent === null) {
						continue;
					}
					$mark = $dom->createElement('mark');
					while ($span->firstChild !== null) {
						$mark->appendChild($span->firstChild);
					}
					$parent->replaceChild($mark, $span);
				}

				return DomFragmentHelper::innerHtml($dom, $root);
			},
			$html,
		);
	}

	/**
	 * @return array<string, array<string, mixed>>
	 */
	private static function resolveCatalog(?Wire $context): array
	{
		$modules = $context?->wire()->modules;
		if ($modules instanceof Modules && $modules->isInstalled('InputfieldTiptap')) {
			if (self::$catalogProbeCache === null) {
				self::$catalogProbeCache = new \WeakMap();
			}
			$mod = self::$catalogProbeCache[$modules] ?? null;
			if (!$mod instanceof InputfieldTiptap) {
				$resolvedMod = $modules->get('InputfieldTiptap');
				if ($resolvedMod instanceof InputfieldTiptap) {
					self::$catalogProbeCache[$modules] = $resolvedMod;
					$mod = $resolvedMod;
				}
			}
			if ($mod instanceof InputfieldTiptap) {
				return $mod->getAvailableMiniBlocks();
			}
		}

		$builtIns = MiniBlockRegistry::builtInDefinitions();
		$dir = MiniBlockRegistry::resolveDirectory($context);
		$discovered = $dir !== '' ? MiniBlockRegistry::discoverFromDirectory($dir) : [];

		return array_replace($builtIns, $discovered);
	}

	/**
	 * Parse a space/comma-separated toolbar string (`|` separates groups) into clean token groups.
	 *
	 * @return list<list<string>>
	 */
	public static function parseToolbarGroups(string $toolbar): array
	{
		$trimmed = trim($toolbar);
		if ($trimmed === '' || strtolower($trimmed) === 'none' || strtolower($trimmed) === 'false') {
			return [];
		}
		if (strtolower($trimmed) === 'default') {
			$trimmed = self::DEFAULT_TOOLBAR;
		}

		$normalized = str_replace([',', "\r\n", "\n", "\t"], ' ', $trimmed);
		$rawSegments = explode('|', $normalized);
		$allowedLookup = array_fill_keys(self::ALL_TOOLBAR_TOKENS, true);

		$groups = [];
		foreach ($rawSegments as $segment) {
			$tokens = preg_split('/\s+/', trim($segment)) ?: [];
			$group = [];
			foreach ($tokens as $token) {
				$clean = strtolower(trim($token));
				if ($clean === '' || $clean === '|') {
					continue;
				}
				$mapped = match ($clean) {
					'formatselect', 'blocks', 'heading', 'headings' => 'styles',
					'strikethrough', 'del' => 'strike',
					'hilitecolor', 'backcolor', 'mark' => 'highlight',
					'justifyleft', 'left' => 'alignleft',
					'justifycenter', 'center' => 'aligncenter',
					'justifyright', 'right' => 'alignright',
					'justifyfull', 'justify' => 'alignjustify',
					'unorderedlist', 'ul' => 'bullist',
					'orderedlist', 'ol' => 'numlist',
					'checklist', 'tasks', 'todo' => 'tasklist',
					'quote' => 'blockquote',
					'pre', 'codesample' => 'codeblock',
					'horizontalrule', 'divider' => 'hr',
					'pwlink' => 'link',
					'pwimage' => 'image',
					'clearformat', 'clean' => 'removeformat',
					'codeview', 'html' => 'source',
					'maximize' => 'fullscreen',
					default => $clean,
				};
				if (isset($allowedLookup[$mapped]) && !in_array($mapped, $group, true)) {
					$group[] = $mapped;
				}
			}
			if ($group !== []) {
				$groups[] = $group;
			}
		}

		return $groups;
	}

	/**
	 * @param mixed $raw
	 * @return list<string>
	 */
	public static function normalizeHeadlines(mixed $raw): array
	{
		$items = is_string($raw)
			? (preg_split('/[\s,|]+/', strtolower(trim($raw))) ?: [])
			: (is_array($raw) ? $raw : []);

		$valid = [];
		foreach ($items as $item) {
			$tag = strtolower(trim((string) $item));
			if (preg_match('/^[1-6]$/', $tag) === 1) {
				$tag = 'h' . $tag;
			}
			if (in_array($tag, self::ALL_HEADLINES, true) && !in_array($tag, $valid, true)) {
				$valid[] = $tag;
			}
		}

		return $valid !== [] ? $valid : ['h2', 'h3', 'h4'];
	}

	/**
	 * @param mixed $raw
	 * @return list<string>
	 */
	public static function normalizeFeatures(mixed $raw): array
	{
		if (!is_array($raw) && !is_string($raw)) {
			return self::ALL_FEATURES;
		}
		$items = is_string($raw)
			? (preg_split('/[\s,|]+/', trim($raw)) ?: [])
			: $raw;

		$valid = [];
		foreach ($items as $item) {
			$feat = trim((string) $item);
			if (in_array($feat, self::ALL_FEATURES, true) && !in_array($feat, $valid, true)) {
				$valid[] = $feat;
			}
		}

		return $valid;
	}

	/**
	 * @param mixed $raw
	 * @return list<int>
	 */
	public static function normalizeToggles(mixed $raw): array
	{
		if (!is_array($raw)) {
			return [];
		}
		$allowed = [
			self::TOGGLE_CLEAN_DIV,
			self::TOGGLE_CLEAN_P,
			self::TOGGLE_CLEAN_NBSP,
			self::TOGGLE_REMOVE_STYLES,
		];
		$valid = [];
		foreach ($raw as $item) {
			$flag = (int) $item;
			if (in_array($flag, $allowed, true) && !in_array($flag, $valid, true)) {
				$valid[] = $flag;
			}
		}

		return $valid;
	}

	/**
	 * @param mixed $raw
	 * @return list<string>
	 */
	public static function normalizeImageFields(mixed $raw): array
	{
		$items = is_array($raw)
			? $raw
			: (is_string($raw) ? (preg_split('/[\s,]+/', trim($raw)) ?: []) : []);
		$valid = [];
		foreach ($items as $item) {
			if (!is_scalar($item)) {
				continue;
			}
			$clean = trim((string) $item);
			if ($clean === 'x') {
				return ['x'];
			}
			if ($clean !== '' && preg_match('/^[A-Za-z][A-Za-z0-9_]{0,63}$/', $clean) === 1 && !in_array($clean, $valid, true)) {
				$valid[] = $clean;
			}
		}

		return $valid;
	}

	/**
	 * Finalize layered Tiptap settings state into the canonical editor configuration array.
	 *
	 * @param array<string, mixed> $state
	 * @param array<string, array<string, mixed>> $catalog
	 * @param list<string> $htmlValues
	 * @return array{
	 *   preset: string,
	 *   toolbar: string,
	 *   toolbarGroups: list<list<string>>,
	 *   bubbleToolbar: string,
	 *   bubbleGroups: list<list<string>>,
	 *   headlines: list<string>,
	 *   features: list<string>,
	 *   toggles: list<int>,
	 *   height: int,
	 *   maxHeight: int,
	 *   inlineMode: int,
	 *   slashMenu: bool,
	 *   miniBlocks: list<string>,
	 *   preservedMiniBlocks: list<string>,
	 *   miniBlockDefs: array<string, array<string, mixed>>,
	 *   imageFields: list<string>,
	 *   extraCSS: string,
	 *   bundles: list<string>
	 * }
	 */
	public static function finalizeEditorState(
		array $state,
		array $catalog = [],
		array $htmlValues = [],
	): array {
		$preset = TiptapPresetCatalog::normalizePreset($state['preset'] ?? TiptapPresetCatalog::PRESET_EDITOR);
		$toolbarGroups = self::parseToolbarGroups((string) $state['toolbar']);
		$bubbleGroups = self::parseToolbarGroups((string) $state['bubbleToolbar']);

		/** @var list<string> $selectedMiniBlocks */
		$selectedMiniBlocks = is_array($state['miniBlocks']) ? $state['miniBlocks'] : [];
		$activeDefs = [];
		$activeNames = [];
		foreach ($selectedMiniBlocks as $bName) {
			if (isset($catalog[$bName])) {
				$activeDefs[$bName] = $catalog[$bName];
				$activeNames[] = $bName;
			}
		}

		$preservedMiniBlocks = TiptapAssetResolver::extractPreservedMiniBlockNames($htmlValues, $activeNames, $catalog);
		foreach ($preservedMiniBlocks as $preservedName) {
			if (isset($catalog[$preservedName])) {
				$activeDefs[$preservedName] = $catalog[$preservedName];
			}
		}

		$featureSlash = in_array('slashMenu', $state['features'], true);
		$slashMenuEnabled = $state['slashMenu'] !== null
			? (bool) $state['slashMenu']
			: ($featureSlash || $activeNames !== []);

		$inlineMode = max(0, min(1, (int) $state['inlineMode']));
		/** @var list<string> $resolvedFeatures */
		$resolvedFeatures = $state['features'];
		if ($inlineMode > 0 && $bubbleGroups !== [] && !in_array('bubbleMenu', $resolvedFeatures, true)) {
			$resolvedFeatures[] = 'bubbleMenu';
		}

		$final = [
			'preset' => $preset,
			'toolbar' => (string) $state['toolbar'],
			'toolbarGroups' => $toolbarGroups,
			'bubbleToolbar' => (string) $state['bubbleToolbar'],
			'bubbleGroups' => $bubbleGroups,
			'headlines' => $state['headlines'],
			'features' => $resolvedFeatures,
			'toggles' => $state['toggles'],
			'height' => max(0, min(2000, (int) $state['height'])),
			'maxHeight' => max(0, min(4000, (int) $state['maxHeight'])),
			'inlineMode' => $inlineMode,
			'slashMenu' => $slashMenuEnabled,
			'miniBlocks' => $activeNames,
			'preservedMiniBlocks' => $preservedMiniBlocks,
			'miniBlockDefs' => $activeDefs,
			'imageFields' => self::normalizeImageFields($state['imageFields'] ?? []),
			'extraCSS' => self::sanitizeExtraCss((string) $state['extraCSS']),
		];
		$final['bundles'] = TiptapAssetResolver::resolveBundles($final, $htmlValues);

		return $final;
	}

	/**
	 * @param array<string, mixed> $state
	 * @param array<string, mixed> $layer
	 * @param array<string, array<string, mixed>> $catalog
	 * @return array<string, mixed>
	 */
	public static function mergeSettingsLayer(array $state, array $layer, array $catalog = []): array
	{
		if (array_key_exists('preset', $layer) && is_scalar($layer['preset'])) {
			$candidate = TiptapPresetCatalog::normalizePreset($layer['preset'], '');
			$currentPreset = TiptapPresetCatalog::normalizePreset($state['preset'] ?? TiptapPresetCatalog::PRESET_EDITOR);
			if ($candidate !== '' && $candidate !== $currentPreset) {
				$def = TiptapPresetCatalog::definition($candidate);
				$state['preset'] = $candidate;
				$state['toolbar'] = $def['toolbar'];
				$state['bubbleToolbar'] = $def['bubbleToolbar'];
				$state['headlines'] = $def['headlines'];
				$state['features'] = $def['features'];
				$state['height'] = $def['height'];
				$state['maxHeight'] = $def['maxHeight'];
				$state['inlineMode'] = $def['inlineMode'];
				$state['slashMenu'] = $def['slashMenu'] > 0
					? true
					: ($candidate === TiptapPresetCatalog::PRESET_CORE ? false : null);
				$state['miniBlocks'] = MiniBlockRegistry::normalizeSelection($def['miniBlocks'], $catalog);
			}
		}
		if (array_key_exists('toolbar', $layer) && is_string($layer['toolbar'])) {
			$val = trim($layer['toolbar']);
			$state['toolbar'] = strtolower($val) === 'default' ? self::DEFAULT_TOOLBAR : $val;
		}
		if (array_key_exists('bubbleToolbar', $layer) && is_string($layer['bubbleToolbar'])) {
			$val = trim($layer['bubbleToolbar']);
			$state['bubbleToolbar'] = strtolower($val) === 'default' ? self::DEFAULT_BUBBLE_TOOLBAR : $val;
		}
		if (array_key_exists('headlines', $layer) && ($layer['headlines'] !== null && $layer['headlines'] !== '')) {
			$state['headlines'] = self::normalizeHeadlines($layer['headlines']);
		}
		if (array_key_exists('features', $layer) && (is_array($layer['features']) || is_string($layer['features']))) {
			$state['features'] = self::normalizeFeatures($layer['features']);
		}
		if (array_key_exists('toggles', $layer) && is_array($layer['toggles'])) {
			$state['toggles'] = self::normalizeToggles($layer['toggles']);
		}
		if (array_key_exists('height', $layer) && is_numeric($layer['height'])) {
			$state['height'] = (int) $layer['height'];
		}
		if (array_key_exists('maxHeight', $layer) && is_numeric($layer['maxHeight'])) {
			$state['maxHeight'] = (int) $layer['maxHeight'];
		}
		if (array_key_exists('inlineMode', $layer) && is_numeric($layer['inlineMode'])) {
			$state['inlineMode'] = (int) $layer['inlineMode'];
		}
		if (array_key_exists('slashMenu', $layer) && $layer['slashMenu'] !== null && $layer['slashMenu'] !== '') {
			if (is_bool($layer['slashMenu'])) {
				$state['slashMenu'] = $layer['slashMenu'];
			} elseif (is_numeric($layer['slashMenu'])) {
				$intVal = (int) $layer['slashMenu'];
				if ($intVal !== 0 || $state['slashMenu'] !== null) {
					$state['slashMenu'] = $intVal > 0;
				}
			} elseif (is_string($layer['slashMenu'])) {
				$lower = strtolower(trim($layer['slashMenu']));
				if (in_array($lower, ['true', '1', 'yes', 'on'], true)) {
					$state['slashMenu'] = true;
				} elseif (in_array($lower, ['false', '0', 'no', 'off'], true)) {
					$state['slashMenu'] = false;
				}
			}
		}
		if (array_key_exists('miniBlocks', $layer) && $layer['miniBlocks'] !== null) {
			$state['miniBlocks'] = MiniBlockRegistry::normalizeSelection($layer['miniBlocks'], $catalog);
		}
		if (array_key_exists('imageFields', $layer) && $layer['imageFields'] !== null) {
			$state['imageFields'] = self::normalizeImageFields($layer['imageFields']);
		}
		if (array_key_exists('extraCSS', $layer) && is_string($layer['extraCSS']) && trim($layer['extraCSS']) !== '') {
			$state['extraCSS'] = trim($layer['extraCSS']);
		}

		return $state;
	}

	/**
	 * @param array<string, mixed> $state
	 * @param array<string, array<string, mixed>> $catalog
	 * @return array<string, mixed>
	 */
	public static function applyJsonOverlay(array $state, string $json, array $catalog = []): array
	{
		$decoded = json_decode($json, true, 32);
		if (!is_array($decoded)) {
			return $state;
		}

		foreach (['replace_preset', 'preset'] as $presetKey) {
			if (array_key_exists($presetKey, $decoded)) {
				$state = self::mergeSettingsLayer($state, ['preset' => $decoded[$presetKey]], $catalog);
			}
		}

		foreach ($decoded as $rawKey => $val) {
			if (!is_string($rawKey) || $rawKey === '' || $rawKey === 'preset' || $rawKey === 'replace_preset') {
				continue;
			}
			$mode = 'replace';
			$key = $rawKey;
			if (str_starts_with($rawKey, 'replace_')) {
				$key = substr($rawKey, 8);
			} elseif (str_starts_with($rawKey, 'add_')) {
				$mode = 'add';
				$key = substr($rawKey, 4);
			} elseif (str_starts_with($rawKey, 'append_')) {
				$mode = 'add';
				$key = substr($rawKey, 7);
			}

			if ($mode === 'add') {
				if (($key === 'toolbar' || $key === 'bubbleToolbar') && is_string($val) && trim($val) !== '') {
					$existing = trim((string) ($state[$key] ?? ''));
					$state[$key] = $existing !== '' ? ($existing . ' | ' . trim($val)) : trim($val);
				} elseif ($key === 'features') {
					$added = self::normalizeFeatures($val);
					$state['features'] = array_values(array_unique(array_merge($state['features'], $added)));
				} elseif ($key === 'headlines') {
					$added = self::normalizeHeadlines($val);
					$state['headlines'] = array_values(array_unique(array_merge($state['headlines'], $added)));
				} elseif ($key === 'miniBlocks') {
					$added = MiniBlockRegistry::normalizeSelection($val, $catalog);
					$state['miniBlocks'] = array_values(array_unique(array_merge($state['miniBlocks'] ?? [], $added)));
				} elseif ($key === 'imageFields') {
					$added = self::normalizeImageFields($val);
					$state['imageFields'] = array_values(array_unique(array_merge($state['imageFields'] ?? [], $added)));
				} elseif ($key === 'extraCSS' && is_string($val) && trim($val) !== '') {
					$state['extraCSS'] = trim(((string) ($state['extraCSS'] ?? '')) . "\n" . trim($val));
				}
				continue;
			}

			$state = self::mergeSettingsLayer($state, [$key => $val], $catalog);
		}

		return $state;
	}
}
