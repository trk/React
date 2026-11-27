<?php

declare(strict_types=1);

namespace Totoglu\React\Theme;

/**
 * Parses and validates Tailwind CSS v4 theme token stylesheets (`:root { ... }` and `.dark { ... }`)
 * into a strict allowlist of design token values.
 *
 * Only recognized custom properties with safe values survive; selectors, at-rules, `url()`,
 * `@import`, escape sequences, and markup-breaking characters are discarded so the resulting
 * tokens can be emitted into an inline `<style>` element without CSS or HTML injection risk.
 */
final class ThemeTokenParser
{
	public const int MAX_SOURCE_BYTES = 65536;

	public const int MAX_VALUE_LENGTH = 240;

	/**
	 * Color tokens combined into `light-dark()` when both light and dark values exist.
	 *
	 * @var list<string>
	 */
	public const array COLOR_TOKENS = [
		'background',
		'foreground',
		'card',
		'card-foreground',
		'popover',
		'popover-foreground',
		'primary',
		'primary-foreground',
		'secondary',
		'secondary-foreground',
		'muted',
		'muted-foreground',
		'accent',
		'accent-foreground',
		'destructive',
		'destructive-foreground',
		'border',
		'input',
		'ring',
		'chart-1',
		'chart-2',
		'chart-3',
		'chart-4',
		'chart-5',
		'sidebar',
		'sidebar-foreground',
		'sidebar-primary',
		'sidebar-primary-foreground',
		'sidebar-accent',
		'sidebar-accent-foreground',
		'sidebar-border',
		'sidebar-ring',
		'shadow-color',
	];

	/**
	 * Non-color tokens emitted with their light (base) value only.
	 *
	 * @var list<string>
	 */
	public const array SCALAR_TOKENS = [
		'radius',
		'font-sans',
		'font-serif',
		'font-mono',
		'letter-spacing',
		'tracking-normal',
		'spacing',
		'shadow-2xs',
		'shadow-xs',
		'shadow-sm',
		'shadow',
		'shadow-md',
		'shadow-lg',
		'shadow-xl',
		'shadow-2xl',
	];

	/**
	 * Minimum tokens a custom theme must provide to be considered valid.
	 *
	 * @var list<string>
	 */
	public const array REQUIRED_TOKENS = [
		'background',
		'foreground',
		'primary',
		'primary-foreground',
	];

	/**
	 * Parse a theme stylesheet into allowlisted light and dark token maps.
	 *
	 * @return array{light: array<string, string>, dark: array<string, string>}
	 */
	public function parse(string $css): array
	{
		$light = [];
		$dark = [];
		if ($css === '' || strlen($css) > self::MAX_SOURCE_BYTES) {
			return ['light' => $light, 'dark' => $dark];
		}

		$withoutComments = (string) preg_replace('~/\*.*?(?:\*/|$)~s', '', $css);
		$extracted = $this->extractDarkMediaBlocks($withoutComments);
		$remaining = $extracted['remaining'];

		foreach ($extracted['darkBodies'] as $darkMediaBody) {
			if (preg_match_all('/([^{};]*)\{([^{}]*)\}/', $darkMediaBody, $darkBlocks, PREG_SET_ORDER) !== false) {
				foreach ($darkBlocks as $darkBlock) {
					$selector = strtolower(trim($darkBlock[1]));
					if (
						$selector !== ''
						&& !str_starts_with($selector, '@')
						&& $this->classifySelector($selector) !== null
					) {
						$dark = array_replace($dark, $this->parseDeclarations($darkBlock[2]));
					}
				}
			}
		}

		if (preg_match_all('/([^{};]*)\{([^{}]*)\}/', $remaining, $blocks, PREG_SET_ORDER) === false) {
			return ['light' => $light, 'dark' => $dark];
		}

		foreach ($blocks as $block) {
			$mode = $this->classifySelector(strtolower(trim($block[1])));
			if ($mode === 'light') {
				$light = array_replace($light, $this->parseDeclarations($block[2]));
			} elseif ($mode === 'dark') {
				$dark = array_replace($dark, $this->parseDeclarations($block[2]));
			}
		}

		return ['light' => $light, 'dark' => $dark];
	}

	/**
	 * Extract `@media (...)` blocks containing `prefers-color-scheme: dark` cleanly before top-level selector scanning
	 * so nested `:root { ... }` inside dark media queries never overwrite light-mode tokens.
	 *
	 * @return array{remaining: string, darkBodies: list<string>}
	 */
	private function extractDarkMediaBlocks(string $css): array
	{
		$remaining = '';
		$darkBodies = [];
		$length = strlen($css);
		$offset = 0;

		while ($offset < $length) {
			if (preg_match('/@media\b([^{}]*)\{/i', $css, $match, PREG_OFFSET_CAPTURE, $offset) !== 1) {
				$remaining .= substr($css, $offset);
				break;
			}

			$matchStart = (int) $match[0][1];
			$openBracePos = $matchStart + strlen($match[0][0]) - 1;
			$condition = strtolower(trim($match[1][0]));

			$depth = 1;
			$cursor = $openBracePos + 1;
			while ($cursor < $length && $depth > 0) {
				$ch = $css[$cursor];
				if ($ch === '{') {
					$depth++;
				} elseif ($ch === '}') {
					$depth--;
				}
				$cursor++;
			}

			if ($depth !== 0) {
				$remaining .= substr($css, $offset);
				break;
			}

			$body = substr($css, $openBracePos + 1, ($cursor - 1) - ($openBracePos + 1));
			if (preg_match('/prefers-color-scheme\s*:\s*dark\b/', $condition) === 1) {
				$remaining .= substr($css, $offset, $matchStart - $offset);
				$darkBodies[] = $body;
			} else {
				$remaining .= substr($css, $offset, $cursor - $offset);
			}

			$offset = $cursor;
		}

		return [
			'remaining' => $remaining,
			'darkBodies' => $darkBodies,
		];
	}

	/**
	 * Determine whether the parsed token maps satisfy the minimum required tokens.
	 *
	 * @param array{light: array<string, string>, dark: array<string, string>} $tokens
	 */
	public function isComplete(array $tokens): bool
	{
		foreach (self::REQUIRED_TOKENS as $required) {
			if (!array_key_exists($required, $tokens['light'])) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Validate a single token value against the safe CSS value grammar.
	 */
	public function isSafeValue(string $value): bool
	{
		$trimmed = trim($value);
		if ($trimmed === '' || strlen($trimmed) > self::MAX_VALUE_LENGTH) {
			return false;
		}
		if (preg_match('/[^a-zA-Z0-9#%.,()\s\-+\/*"\'_]/', $trimmed) === 1) {
			return false;
		}
		if (preg_match('/\b(?:url|image|image-set|expression|element|attr|env)\s*\(/i', $trimmed) === 1) {
			return false;
		}
		if (str_contains($trimmed, '/*') || str_contains($trimmed, '*/')) {
			return false;
		}
		if (substr_count($trimmed, '"') % 2 !== 0 || substr_count($trimmed, "'") % 2 !== 0) {
			return false;
		}

		return substr_count($trimmed, '(') === substr_count($trimmed, ')');
	}

	private function classifySelector(string $selector): ?string
	{
		if ($selector === '' || str_starts_with($selector, '@')) {
			return null;
		}
		$withoutNot = (string) preg_replace('/:not\([^)]*\)/i', '', $selector);
		if (preg_match('/\.dark\b|\[data-theme=["\']?dark["\']?\]|\[data-mode=["\']?dark["\']?\]/', $withoutNot) === 1) {
			return 'dark';
		}
		if (preg_match('/(?:^|[\s,]):root\b|(?:^|[\s,])html\b|\.light\b/', $withoutNot) === 1) {
			return 'light';
		}

		return null;
	}

	/**
	 * @return array<string, string>
	 */
	private function parseDeclarations(string $body): array
	{
		$allowed = array_flip(array_merge(self::COLOR_TOKENS, self::SCALAR_TOKENS));
		$declarations = [];
		foreach (explode(';', $body) as $rawDeclaration) {
			$colonPos = strpos($rawDeclaration, ':');
			if ($colonPos === false) {
				continue;
			}
			$property = strtolower(trim(substr($rawDeclaration, 0, $colonPos)));
			if (!str_starts_with($property, '--')) {
				continue;
			}
			$name = substr($property, 2);
			if (!isset($allowed[$name])) {
				continue;
			}
			$value = trim(substr($rawDeclaration, $colonPos + 1));
			if ($this->isSafeValue($value)) {
				$declarations[$name] = (string) preg_replace('/\s+/', ' ', $value);
			}
		}

		return $declarations;
	}
}
