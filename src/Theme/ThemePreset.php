<?php

declare(strict_types=1);

namespace Totoglu\React\Theme;

/**
 * Built-in central theme presets for every React admin surface.
 *
 * `Native` keeps ProcessWire's own admin color scheme (`--pw-*` tokens), `Custom` applies
 * site-provided theme tokens, and every other case ships a curated light/dark token palette.
 */
enum ThemePreset: string
{
	case Native = 'native';
	case Neutral = 'neutral';
	case Slate = 'slate';
	case Stone = 'stone';
	case Ocean = 'ocean';
	case Indigo = 'indigo';
	case Teal = 'teal';
	case Custom = 'custom';

	/**
	 * Resolve a preset from an untrusted identifier, falling back to `Native`.
	 */
	public static function fromInput(mixed $value): self
	{
		return is_string($value) ? (self::tryFrom(strtolower(trim($value))) ?? self::Native) : self::Native;
	}

	/**
	 * Curated light/dark token palette for built-in presets (empty for `Native` and `Custom`).
	 *
	 * @return array{light: array<string, string>, dark: array<string, string>}
	 */
	public function tokens(): array
	{
		return match ($this) {
			self::Native, self::Custom => ['light' => [], 'dark' => []],
			self::Neutral => self::neutralBase(),
			self::Slate => self::slateBase(),
			self::Stone => self::stoneBase(),
			self::Ocean => self::withAccent(
				self::slateBase(),
				['oklch(0.49 0.155 256)', 'oklch(0.985 0.003 248)'],
				['oklch(0.68 0.148 252)', 'oklch(0.145 0.032 262)']
			),
			self::Indigo => self::withAccent(
				self::slateBase(),
				['oklch(0.475 0.16 272)', 'oklch(0.985 0.003 264)'],
				['oklch(0.695 0.142 272)', 'oklch(0.145 0.032 265)']
			),
			self::Teal => self::withAccent(
				self::slateBase(),
				['oklch(0.485 0.078 202)', 'oklch(0.985 0.003 202)'],
				['oklch(0.715 0.105 200)', 'oklch(0.145 0.024 204)']
			),
		};
	}

	/**
	 * @return array{light: array<string, string>, dark: array<string, string>}
	 */
	private static function neutralBase(): array
	{
		return [
			'light' => [
				'background' => 'oklch(1 0 0)',
				'foreground' => 'oklch(0.145 0 0)',
				'card' => 'oklch(1 0 0)',
				'card-foreground' => 'oklch(0.145 0 0)',
				'popover' => 'oklch(1 0 0)',
				'popover-foreground' => 'oklch(0.145 0 0)',
				'primary' => 'oklch(0.205 0 0)',
				'primary-foreground' => 'oklch(0.985 0 0)',
				'secondary' => 'oklch(0.97 0 0)',
				'secondary-foreground' => 'oklch(0.205 0 0)',
				'muted' => 'oklch(0.97 0 0)',
				'muted-foreground' => 'oklch(0.556 0 0)',
				'accent' => 'oklch(0.97 0 0)',
				'accent-foreground' => 'oklch(0.205 0 0)',
				'destructive' => 'oklch(0.577 0.245 27.325)',
				'destructive-foreground' => 'oklch(0.985 0 0)',
				'border' => 'oklch(0.922 0 0)',
				'input' => 'oklch(0.922 0 0)',
				'ring' => 'oklch(0.708 0 0)',
				'sidebar' => 'oklch(0.985 0 0)',
				'sidebar-accent' => 'oklch(0.955 0 0)',
				'radius' => '0.625rem',
			],
			'dark' => [
				'background' => 'oklch(0.145 0 0)',
				'foreground' => 'oklch(0.985 0 0)',
				'card' => 'oklch(0.205 0 0)',
				'card-foreground' => 'oklch(0.985 0 0)',
				'popover' => 'oklch(0.205 0 0)',
				'popover-foreground' => 'oklch(0.985 0 0)',
				'primary' => 'oklch(0.922 0 0)',
				'primary-foreground' => 'oklch(0.205 0 0)',
				'secondary' => 'oklch(0.269 0 0)',
				'secondary-foreground' => 'oklch(0.985 0 0)',
				'muted' => 'oklch(0.269 0 0)',
				'muted-foreground' => 'oklch(0.708 0 0)',
				'accent' => 'oklch(0.269 0 0)',
				'accent-foreground' => 'oklch(0.985 0 0)',
				'destructive' => 'oklch(0.704 0.191 22.216)',
				'destructive-foreground' => 'oklch(0.985 0 0)',
				'border' => 'oklch(1 0 0 / 10%)',
				'input' => 'oklch(1 0 0 / 15%)',
				'ring' => 'oklch(0.556 0 0)',
				'sidebar' => 'oklch(0.178 0 0)',
				'sidebar-accent' => 'oklch(0.245 0 0)',
			],
		];
	}

	/**
	 * @return array{light: array<string, string>, dark: array<string, string>}
	 */
	private static function slateBase(): array
	{
		return [
			'light' => [
				'background' => 'oklch(1 0 0)',
				'foreground' => 'oklch(0.129 0.042 264.695)',
				'card' => 'oklch(1 0 0)',
				'card-foreground' => 'oklch(0.129 0.042 264.695)',
				'popover' => 'oklch(1 0 0)',
				'popover-foreground' => 'oklch(0.129 0.042 264.695)',
				'primary' => 'oklch(0.208 0.042 265.755)',
				'primary-foreground' => 'oklch(0.984 0.003 247.858)',
				'secondary' => 'oklch(0.968 0.007 247.896)',
				'secondary-foreground' => 'oklch(0.208 0.042 265.755)',
				'muted' => 'oklch(0.968 0.007 247.896)',
				'muted-foreground' => 'oklch(0.554 0.046 257.417)',
				'accent' => 'oklch(0.968 0.007 247.896)',
				'accent-foreground' => 'oklch(0.208 0.042 265.755)',
				'destructive' => 'oklch(0.577 0.245 27.325)',
				'destructive-foreground' => 'oklch(0.984 0.003 247.858)',
				'border' => 'oklch(0.929 0.013 255.508)',
				'input' => 'oklch(0.929 0.013 255.508)',
				'ring' => 'oklch(0.704 0.04 256.788)',
				'sidebar' => 'oklch(0.984 0.003 247.858)',
				'sidebar-accent' => 'oklch(0.948 0.009 250)',
				'radius' => '0.625rem',
			],
			'dark' => [
				'background' => 'oklch(0.129 0.042 264.695)',
				'foreground' => 'oklch(0.984 0.003 247.858)',
				'card' => 'oklch(0.208 0.042 265.755)',
				'card-foreground' => 'oklch(0.984 0.003 247.858)',
				'popover' => 'oklch(0.208 0.042 265.755)',
				'popover-foreground' => 'oklch(0.984 0.003 247.858)',
				'primary' => 'oklch(0.929 0.013 255.508)',
				'primary-foreground' => 'oklch(0.208 0.042 265.755)',
				'secondary' => 'oklch(0.279 0.041 260.031)',
				'secondary-foreground' => 'oklch(0.984 0.003 247.858)',
				'muted' => 'oklch(0.279 0.041 260.031)',
				'muted-foreground' => 'oklch(0.704 0.04 256.788)',
				'accent' => 'oklch(0.279 0.041 260.031)',
				'accent-foreground' => 'oklch(0.984 0.003 247.858)',
				'destructive' => 'oklch(0.704 0.191 22.216)',
				'destructive-foreground' => 'oklch(0.984 0.003 247.858)',
				'border' => 'oklch(1 0 0 / 10%)',
				'input' => 'oklch(1 0 0 / 15%)',
				'ring' => 'oklch(0.551 0.027 264.364)',
				'sidebar' => 'oklch(0.175 0.042 265.2)',
				'sidebar-accent' => 'oklch(0.248 0.041 262)',
			],
		];
	}

	/**
	 * @return array{light: array<string, string>, dark: array<string, string>}
	 */
	private static function stoneBase(): array
	{
		return [
			'light' => [
				'background' => 'oklch(0.992 0.002 84.5)',
				'foreground' => 'oklch(0.147 0.004 49.25)',
				'card' => 'oklch(1 0 0)',
				'card-foreground' => 'oklch(0.147 0.004 49.25)',
				'popover' => 'oklch(1 0 0)',
				'popover-foreground' => 'oklch(0.147 0.004 49.25)',
				'primary' => 'oklch(0.216 0.006 56.043)',
				'primary-foreground' => 'oklch(0.985 0.001 106.423)',
				'secondary' => 'oklch(0.968 0.004 78)',
				'secondary-foreground' => 'oklch(0.216 0.006 56.043)',
				'muted' => 'oklch(0.968 0.004 78)',
				'muted-foreground' => 'oklch(0.515 0.013 58.071)',
				'accent' => 'oklch(0.968 0.004 78)',
				'accent-foreground' => 'oklch(0.216 0.006 56.043)',
				'destructive' => 'oklch(0.577 0.245 27.325)',
				'destructive-foreground' => 'oklch(0.985 0.001 106.423)',
				'border' => 'oklch(0.923 0.006 67)',
				'input' => 'oklch(0.923 0.006 67)',
				'ring' => 'oklch(0.709 0.01 56.259)',
				'sidebar' => 'oklch(0.982 0.003 80)',
				'sidebar-accent' => 'oklch(0.948 0.005 74)',
				'radius' => '0.625rem',
			],
			'dark' => [
				'background' => 'oklch(0.147 0.004 49.25)',
				'foreground' => 'oklch(0.985 0.001 106.423)',
				'card' => 'oklch(0.216 0.006 56.043)',
				'card-foreground' => 'oklch(0.985 0.001 106.423)',
				'popover' => 'oklch(0.216 0.006 56.043)',
				'popover-foreground' => 'oklch(0.985 0.001 106.423)',
				'primary' => 'oklch(0.923 0.003 48.717)',
				'primary-foreground' => 'oklch(0.216 0.006 56.043)',
				'secondary' => 'oklch(0.268 0.007 34.298)',
				'secondary-foreground' => 'oklch(0.985 0.001 106.423)',
				'muted' => 'oklch(0.268 0.007 34.298)',
				'muted-foreground' => 'oklch(0.709 0.01 56.259)',
				'accent' => 'oklch(0.268 0.007 34.298)',
				'accent-foreground' => 'oklch(0.985 0.001 106.423)',
				'destructive' => 'oklch(0.704 0.191 22.216)',
				'destructive-foreground' => 'oklch(0.985 0.001 106.423)',
				'border' => 'oklch(1 0 0 / 10%)',
				'input' => 'oklch(1 0 0 / 15%)',
				'ring' => 'oklch(0.553 0.013 58.071)',
				'sidebar' => 'oklch(0.182 0.005 52)',
				'sidebar-accent' => 'oklch(0.248 0.007 42)',
			],
		];
	}

	/**
	 * Apply an accent primary color pair (and matching ring) to a base palette.
	 *
	 * @param array{light: array<string, string>, dark: array<string, string>} $base
	 * @param array{0: string, 1: string} $light Primary and primary-foreground for light mode
	 * @param array{0: string, 1: string} $dark Primary and primary-foreground for dark mode
	 * @return array{light: array<string, string>, dark: array<string, string>}
	 */
	private static function withAccent(array $base, array $light, array $dark): array
	{
		$base['light']['primary'] = $light[0];
		$base['light']['primary-foreground'] = $light[1];
		$base['light']['ring'] = $light[0];
		$base['dark']['primary'] = $dark[0];
		$base['dark']['primary-foreground'] = $dark[1];
		$base['dark']['ring'] = $dark[0];

		return $base;
	}
}
