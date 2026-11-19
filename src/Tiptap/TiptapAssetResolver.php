<?php

declare(strict_types=1);

namespace Totoglu\React\Tiptap;

/**
 * Resolves the minimal ordered `Tiptap*` asset packs required for an `InputfieldTiptap` instance.
 *
 * Combines the selected preset (`core`, `editor`, `canvas`, `blocks`), explicit toolbar/feature
 * customizations, and HTML markers in existing field values so legacy or switched fields never
 * silently drop tables, images, task lists, anchors, or inline editorial blocks.
 */
final class TiptapAssetResolver
{
	public const string BUNDLE_CORE = 'core';
	public const string BUNDLE_EDITOR = 'editor';
	public const string BUNDLE_CANVAS = 'canvas';
	public const string BUNDLE_BLOCKS = 'blocks';
	public const string BUNDLE_DIALOGS = 'dialogs';

	public const string SCRIPT_CORE = 'TiptapCore.js';
	public const string SCRIPT_EDITOR = 'TiptapEditor.js';
	public const string SCRIPT_CANVAS = 'TiptapCanvas.js';
	public const string SCRIPT_BLOCKS = 'TiptapBlocks.js';
	public const string SCRIPT_DIALOGS = 'TiptapDialogs.js';
	public const string STYLE_CORE = 'TiptapCore.css';

	/**
	 * @var list<string>
	 */
	public const array ALL_INITIAL_BUNDLES = [
		self::BUNDLE_CORE,
		self::BUNDLE_EDITOR,
		self::BUNDLE_CANVAS,
		self::BUNDLE_BLOCKS,
	];

	/**
	 * Toolbar tokens requiring `TiptapEditor.js`.
	 *
	 * @var list<string>
	 */
	public const array EDITOR_TOOLBAR_TOKENS = [
		'highlight',
		'subscript',
		'superscript',
		'alignleft',
		'aligncenter',
		'alignright',
		'alignjustify',
		'tasklist',
		'anchor',
		'image',
		'table',
	];

	/**
	 * @var array<string, string>
	 */
	public const array BUNDLE_SCRIPT_MAP = [
		self::BUNDLE_CORE => self::SCRIPT_CORE,
		self::BUNDLE_EDITOR => self::SCRIPT_EDITOR,
		self::BUNDLE_CANVAS => self::SCRIPT_CANVAS,
		self::BUNDLE_BLOCKS => self::SCRIPT_BLOCKS,
		self::BUNDLE_DIALOGS => self::SCRIPT_DIALOGS,
	];

	/**
	 * Resolve initial capability bundles (`core` plus optional `editor`, `canvas`, `blocks`).
	 * `dialogs` (`TiptapDialogs.js`) is strictly on-demand and never included in initial bundles.
	 *
	 * @param array<string, mixed> $resolvedSettings
	 * @param list<string> $htmlValues
	 * @return list<string>
	 */
	public static function resolveBundles(array $resolvedSettings, array $htmlValues = []): array
	{
		$preset = TiptapPresetCatalog::normalizePreset($resolvedSettings['preset'] ?? TiptapPresetCatalog::PRESET_EDITOR);
		$features = is_array($resolvedSettings['features'] ?? null) ? $resolvedSettings['features'] : [];
		$toolbarGroups = is_array($resolvedSettings['toolbarGroups'] ?? null) ? $resolvedSettings['toolbarGroups'] : [];
		$bubbleGroups = is_array($resolvedSettings['bubbleGroups'] ?? null) ? $resolvedSettings['bubbleGroups'] : [];
		$inlineMode = (int) ($resolvedSettings['inlineMode'] ?? 0);
		$slashMenu = !empty($resolvedSettings['slashMenu']);
		$miniBlocks = is_array($resolvedSettings['miniBlocks'] ?? null) ? $resolvedSettings['miniBlocks'] : [];
		$preservedMiniBlocks = is_array($resolvedSettings['preservedMiniBlocks'] ?? null) ? $resolvedSettings['preservedMiniBlocks'] : [];

		$tokens = self::flattenGroupTokens($toolbarGroups, $bubbleGroups);

		$needsEditor = in_array($preset, [TiptapPresetCatalog::PRESET_EDITOR, TiptapPresetCatalog::PRESET_BLOCKS], true)
			|| self::hasAnyToken($tokens, self::EDITOR_TOOLBAR_TOKENS)
			|| in_array('imgUpload', $features, true)
			|| in_array('imgResize', $features, true)
			|| self::htmlRequiresEditorPack($htmlValues);

		$hasBubbleControls = ($inlineMode > 0 || in_array('bubbleMenu', $features, true)) && $bubbleGroups !== [];
		$needsCanvas = in_array($preset, [TiptapPresetCatalog::PRESET_CANVAS, TiptapPresetCatalog::PRESET_BLOCKS], true)
			|| $inlineMode > 0
			|| $slashMenu
			|| in_array('slashMenu', $features, true)
			|| in_array('blockHandles', $features, true)
			|| $hasBubbleControls;

		$needsBlocks = $preset === TiptapPresetCatalog::PRESET_BLOCKS
			|| $miniBlocks !== []
			|| $preservedMiniBlocks !== []
			|| in_array('insertblock', $tokens, true)
			|| self::htmlHasMiniBlocks($htmlValues);

		$bundles = [self::BUNDLE_CORE];
		if ($needsEditor) {
			$bundles[] = self::BUNDLE_EDITOR;
		}
		if ($needsCanvas) {
			$bundles[] = self::BUNDLE_CANVAS;
		}
		if ($needsBlocks) {
			$bundles[] = self::BUNDLE_BLOCKS;
		}

		return $bundles;
	}

	/**
	 * Extract catalog-known mini-block names referenced in existing HTML that are not currently
	 * in `$activeMiniBlocks`, allowing editors to preserve existing blocks cleanly.
	 *
	 * @param list<string> $htmlValues
	 * @param list<string> $activeMiniBlocks
	 * @param array<string, array<string, mixed>> $catalog
	 * @return list<string>
	 */
	public static function extractPreservedMiniBlockNames(
		array $htmlValues,
		array $activeMiniBlocks,
		array $catalog,
	): array {
		if ($htmlValues === [] || $catalog === []) {
			return [];
		}

		$activeLookup = array_fill_keys($activeMiniBlocks, true);
		$preserved = [];
		foreach ($htmlValues as $html) {
			if (!is_string($html) || $html === '' || !str_contains($html, 'data-tiptap-block')) {
				continue;
			}
			if (preg_match_all('/\bdata-tiptap-block\s*=\s*["\']([a-z0-9_-]+)["\']/i', $html, $matches) > 0) {
				foreach ($matches[1] as $rawName) {
					$name = strtolower(trim($rawName));
					if ($name !== '' && !isset($activeLookup[$name]) && isset($catalog[$name]) && !in_array($name, $preserved, true)) {
						$preserved[] = $name;
					}
				}
			}
		}

		return $preserved;
	}

	/**
	 * Convert a resolved bundle list into ordered script filenames relative to `dist/`.
	 *
	 * @param list<string> $bundles
	 * @return list<string>
	 */
	public static function resolveScriptFilenames(array $bundles): array
	{
		$normalized = [];
		foreach (self::ALL_INITIAL_BUNDLES as $bundleKey) {
			if ($bundleKey === self::BUNDLE_CORE || in_array($bundleKey, $bundles, true)) {
				$normalized[] = self::BUNDLE_SCRIPT_MAP[$bundleKey];
			}
		}

		return $normalized;
	}

	/**
	 * Return ordered style filenames relative to `dist/`.
	 *
	 * @return list<string>
	 */
	public static function resolveStyleFilenames(): array
	{
		return [self::STYLE_CORE];
	}

	/**
	 * @param array<mixed> $toolbarGroups
	 * @param array<mixed> $bubbleGroups
	 * @return list<string>
	 */
	private static function flattenGroupTokens(array $toolbarGroups, array $bubbleGroups): array
	{
		$tokens = [];
		foreach ([$toolbarGroups, $bubbleGroups] as $groupList) {
			foreach ($groupList as $group) {
				if (!is_array($group)) {
					continue;
				}
				foreach ($group as $token) {
					if (is_string($token) && $token !== '') {
						$tokens[] = $token;
					}
				}
			}
		}

		return $tokens;
	}

	/**
	 * @param list<string> $haystack
	 * @param list<string> $needles
	 */
	private static function hasAnyToken(array $haystack, array $needles): bool
	{
		foreach ($haystack as $token) {
			if (in_array($token, $needles, true)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * @param list<string> $htmlValues
	 */
	private static function htmlRequiresEditorPack(array $htmlValues): bool
	{
		foreach ($htmlValues as $html) {
			if (!is_string($html) || trim($html) === '') {
				continue;
			}
			if (preg_match('/<(?:table|img|figure|mark|sub|sup)\b|data-type\s*=\s*["\']task(?:List|Item)["\']|text-align\s*:|<a\b[^>]*\b(?:id|name)\s*=/i', $html) === 1) {
				return true;
			}
		}

		return false;
	}

	/**
	 * @param list<string> $htmlValues
	 */
	private static function htmlHasMiniBlocks(array $htmlValues): bool
	{
		foreach ($htmlValues as $html) {
			if (is_string($html) && $html !== '' && str_contains($html, 'data-tiptap-block')) {
				return true;
			}
		}

		return false;
	}
}
