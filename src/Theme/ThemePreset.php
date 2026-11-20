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
	case Ocean = 'ocean';
	case Emerald = 'emerald';
	case Violet = 'violet';
	case Rose = 'rose';
	case Amber = 'amber';
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
			self::Ocean => self::withAccent(
				self::neutralBase(),
				['oklch(0.546 0.245 262.881)', 'oklch(0.985 0 0)'],
				['oklch(0.623 0.214 259.815)', 'oklch(0.985 0 0)']
			),
			self::Emerald => self::withAccent(
				self::neutralBase(),
				['oklch(0.596 0.145 163.225)', 'oklch(0.985 0 0)'],
				['oklch(0.696 0.17 162.48)', 'oklch(0.205 0 0)']
			),
			self::Violet => self::withAccent(
				self::neutralBase(),
				['oklch(0.541 0.281 293.009)', 'oklch(0.985 0 0)'],
				['oklch(0.606 0.25 292.717)', 'oklch(0.985 0 0)']
			),
			self::Rose => self::withAccent(
				self::neutralBase(),
				['oklch(0.586 0.253 17.585)', 'oklch(0.985 0 0)'],
				['oklch(0.645 0.246 16.439)', 'oklch(0.985 0 0)']
			),
			self::Amber => self::withAccent(
				self::neutralBase(),
				['oklch(0.769 0.188 70.08)', 'oklch(0.205 0 0)'],
				['oklch(0.769 0.188 70.08)', 'oklch(0.205 0 0)']
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
