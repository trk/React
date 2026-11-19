<?php

declare(strict_types=1);

namespace Totoglu\React\Tiptap;

/**
 * Canonical `InputfieldTiptap` editor profile catalog (`core`, `editor`, `canvas`, `blocks`).
 *
 * Each preset provides a balanced toolbar, bubble menu, feature flags, height, and inline
 * configuration while remaining fully customizable at module, field, and template-context layers.
 */
final class TiptapPresetCatalog
{
	public const string PRESET_CORE = 'core';
	public const string PRESET_EDITOR = 'editor';
	public const string PRESET_CANVAS = 'canvas';
	public const string PRESET_BLOCKS = 'blocks';

	/**
	 * @var list<string>
	 */
	public const array ALL_PRESETS = [
		self::PRESET_CORE,
		self::PRESET_EDITOR,
		self::PRESET_CANVAS,
		self::PRESET_BLOCKS,
	];

	public const string CORE_TOOLBAR = 'styles | bold italic underline strike code | bullist numlist blockquote | link unlink | removeformat | undo redo';
	public const string BLOCKS_TOOLBAR = 'styles | bold italic underline strike code highlight | alignleft aligncenter alignright | bullist numlist tasklist blockquote codeblock | link image table hr insertblock | removeformat source | undo redo';
	public const string CANVAS_BUBBLE_TOOLBAR = 'bold italic underline strike code | link removeformat';

	public static function normalizePreset(mixed $raw, string $fallback = self::PRESET_EDITOR): string
	{
		if (!is_scalar($raw)) {
			return $fallback;
		}
		$clean = strtolower(trim((string) $raw));

		return in_array($clean, self::ALL_PRESETS, true) ? $clean : $fallback;
	}

	/**
	 * Return the canonical configuration layer for a named preset.
	 *
	 * @return array{
	 *   preset: string,
	 *   toolbar: string,
	 *   bubbleToolbar: string,
	 *   headlines: list<string>,
	 *   features: list<string>,
	 *   height: int,
	 *   maxHeight: int,
	 *   inlineMode: int,
	 *   slashMenu: int,
	 *   miniBlocks: list<string>
	 * }
	 */
	public static function definition(string $preset): array
	{
		$normalized = self::normalizePreset($preset);

		return match ($normalized) {
			self::PRESET_CORE => [
				'preset' => self::PRESET_CORE,
				'toolbar' => self::CORE_TOOLBAR,
				'bubbleToolbar' => '',
				'headlines' => ['h2', 'h3', 'h4'],
				'features' => ['toolbar', 'statusbar', 'spellcheck', 'purifier', 'pasteFilter'],
				'height' => 180,
				'maxHeight' => 480,
				'inlineMode' => 0,
				'slashMenu' => 0,
				'miniBlocks' => [],
			],
			self::PRESET_CANVAS => [
				'preset' => self::PRESET_CANVAS,
				'toolbar' => '',
				'bubbleToolbar' => self::CANVAS_BUBBLE_TOOLBAR,
				'headlines' => ['h1', 'h2', 'h3', 'h4'],
				'features' => [
					'bubbleMenu',
					'statusbar',
					'spellcheck',
					'purifier',
					'pasteFilter',
					'slashMenu',
					'blockHandles',
				],
				'height' => 320,
				'maxHeight' => 0,
				'inlineMode' => 1,
				'slashMenu' => 1,
				'miniBlocks' => [],
			],
			self::PRESET_BLOCKS => [
				'preset' => self::PRESET_BLOCKS,
				'toolbar' => self::BLOCKS_TOOLBAR,
				'bubbleToolbar' => TiptapContentPolicy::DEFAULT_BUBBLE_TOOLBAR,
				'headlines' => ['h1', 'h2', 'h3', 'h4'],
				'features' => [
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
				],
				'height' => 320,
				'maxHeight' => 0,
				'inlineMode' => 0,
				'slashMenu' => 1,
				'miniBlocks' => MiniBlockRegistry::BUILTIN_NAMES,
			],
			default => [
				'preset' => self::PRESET_EDITOR,
				'toolbar' => TiptapContentPolicy::DEFAULT_TOOLBAR,
				'bubbleToolbar' => TiptapContentPolicy::DEFAULT_BUBBLE_TOOLBAR,
				'headlines' => ['h2', 'h3', 'h4'],
				'features' => TiptapContentPolicy::DEFAULT_FEATURES,
				'height' => 260,
				'maxHeight' => 640,
				'inlineMode' => 0,
				'slashMenu' => 0,
				'miniBlocks' => [],
			],
		};
	}

	/**
	 * Return all preset definitions keyed by preset name (for module/field configuration forms).
	 *
	 * @return array<string, array{
	 *   preset: string,
	 *   toolbar: string,
	 *   bubbleToolbar: string,
	 *   headlines: list<string>,
	 *   features: list<string>,
	 *   height: int,
	 *   maxHeight: int,
	 *   inlineMode: int,
	 *   slashMenu: int,
	 *   miniBlocks: list<string>
	 * }>
	 */
	public static function allDefinitions(): array
	{
		$all = [];
		foreach (self::ALL_PRESETS as $preset) {
			$all[$preset] = self::definition($preset);
		}

		return $all;
	}
}
