<?php

declare(strict_types=1);

namespace Totoglu\React\Theme;

use ProcessWire\React;
use ProcessWire\User;
use ProcessWire\Wire;
use Totoglu\React\Security\AccessGuard;

/**
 * Central theme service for every React admin surface.
 *
 * Resolves the Light/Dark/System mode (synchronized per user between `{user-id}.json`
 * and `AdminThemeUikit` `adminDarkMode`), extracts ProcessWire's `--pw-*` color scheme,
 * and compiles the user's selected theme preset (or site-wide default / validated custom tokens)
 * into a single scoped stylesheet applied to standalone Workspaces, embedded module panels,
 * portaled overlays, and classic Inputfield islands alike.
 */
final class ThemeManager extends Wire
{
	/**
	 * Selector list receiving the active theme tokens. Doubled `:root` raises specificity above the
	 * module's own surface defaults so the central theme wins regardless of stylesheet order.
	 */
	private const string TOKEN_SCOPE = ':root:root, :root:root :is(body:has([data-rw-app-shell]), [data-rw-app-shell], [data-rw-portal-overlay], #_rw_portal_root, [data-rw-surface="elevated"], dialog[data-rw-modal-dialog], dialog[data-rw-sheet-dialog], dialog[data-rw-drawer-dialog], dialog[data-rw-command-dialog], dialog[data-rw-inspector-sheet], dialog[data-rw-tiptap-dialog])';

	/**
	 * Selector list receiving dark-only custom tokens when no light override exists.
	 */
	private const string DARK_TOKEN_SCOPE = ':root.dark:root, :root.dark:root :is(body:has([data-rw-app-shell]), [data-rw-app-shell], [data-rw-portal-overlay], #_rw_portal_root, [data-rw-surface="elevated"], dialog[data-rw-modal-dialog], dialog[data-rw-sheet-dialog], dialog[data-rw-drawer-dialog], dialog[data-rw-command-dialog], dialog[data-rw-inspector-sheet], dialog[data-rw-tiptap-dialog]), body.dark-theme:has([data-rw-app-shell]), body.dark-theme :is([data-rw-app-shell], [data-rw-portal-overlay], #_rw_portal_root, [data-rw-surface="elevated"], dialog[data-rw-modal-dialog], dialog[data-rw-sheet-dialog], dialog[data-rw-drawer-dialog], dialog[data-rw-command-dialog], dialog[data-rw-inspector-sheet], dialog[data-rw-tiptap-dialog])';

	/**
	 * Semantic tokens derived from the base palette when a theme does not set them explicitly.
	 *
	 * @var array<string, string>
	 */
	private const array DERIVED_TOKENS = [
		'card' => 'var(--background)',
		'card-foreground' => 'var(--foreground)',
		'popover' => 'var(--card)',
		'popover-foreground' => 'var(--card-foreground)',
		'secondary' => 'var(--muted)',
		'secondary-foreground' => 'var(--foreground)',
		'accent' => 'var(--muted)',
		'accent-foreground' => 'var(--foreground)',
		'destructive-foreground' => 'oklch(0.985 0 0)',
		'ring' => 'var(--primary)',
		'sidebar' => 'var(--card)',
		'sidebar-foreground' => 'var(--card-foreground)',
		'sidebar-primary' => 'var(--primary)',
		'sidebar-primary-foreground' => 'var(--primary-foreground)',
		'sidebar-accent' => 'var(--accent)',
		'sidebar-accent-foreground' => 'var(--accent-foreground)',
		'sidebar-border' => 'var(--border)',
		'sidebar-ring' => 'var(--ring)',
	];

	/**
	 * Module-specific surface tokens always mapped onto the active theme palette.
	 *
	 * @var array<string, string>
	 */
	private const array SURFACE_TOKENS = [
		'primary-ink' => 'color-mix(in oklab, var(--primary) 70%, var(--foreground))',
		'destructive-solid' => 'var(--destructive)',
		'input-surface' => 'var(--background)',
		'button-bg' => 'var(--primary)',
		'button-fg' => 'var(--primary-foreground)',
		'button-border' => 'transparent',
		'button-hover-bg' => 'color-mix(in oklab, var(--primary) 88%, var(--foreground))',
		'button-hover-fg' => 'var(--primary-foreground)',
		'button-hover-border' => 'transparent',
		'button-muted-bg' => 'var(--secondary)',
		'button-muted-fg' => 'var(--secondary-foreground)',
		'masthead' => 'var(--card)',
		'masthead-foreground' => 'var(--muted-foreground)',
		'masthead-active' => 'var(--foreground)',
		'masthead-border' => 'var(--border)',
		'radius-button' => 'calc(var(--radius) - 2px)',
	];

	public function __construct(private readonly React $react)
	{
		parent::__construct();
	}

	/**
	 * Resolve the site-wide default theme preset configured on the `React` module.
	 */
	public function siteDefaultPreset(): ThemePreset
	{
		return ThemePreset::fromInput($this->react->get('themePreset'));
	}

	/**
	 * Resolve the user's raw personal color preset override from `{user-id}.json` (empty string when inheriting site default).
	 */
	public function userPresetOverride(?User $user = null): string
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticatedOrSuperuser($resolvedUser)) {
			return '';
		}

		$prefs = $this->react->workspacePreferences()->load($resolvedUser);
		$rawPreset = (string) ($prefs['themePreset'] ?? '');
		if ($rawPreset === '') {
			return '';
		}

		$candidate = ThemePreset::tryFrom($rawPreset);
		if ($candidate === null) {
			return '';
		}
		if ($candidate === ThemePreset::Custom && !$this->hasValidCustomTokens()) {
			return '';
		}

		return $candidate->value;
	}

	/**
	 * Resolve the effective theme preset for `$user`, preferring their personal `{user-id}.json` override
	 * and falling back to the site-wide default (`siteDefaultPreset()`).
	 */
	public function activePreset(?User $user = null): ThemePreset
	{
		$override = $this->userPresetOverride($user);
		if ($override !== '') {
			$candidate = ThemePreset::tryFrom($override);
			if ($candidate !== null) {
				return $candidate;
			}
		}

		return $this->siteDefaultPreset();
	}

	/**
	 * Whether custom CSS tokens configured on the module satisfy all required variables.
	 */
	public function hasValidCustomTokens(): bool
	{
		$raw = trim((string) $this->react->get('themeCustomTokens'));
		if ($raw === '') {
			return false;
		}
		$parser = new ThemeTokenParser();

		return $parser->isComplete($parser->parse($raw));
	}

	/**
	 * Resolve the light/dark token maps of the active theme (empty when `Native` or invalid custom tokens).
	 *
	 * @return array{light: array<string, string>, dark: array<string, string>}
	 */
	public function activeTokens(?User $user = null): array
	{
		$preset = $this->activePreset($user);
		if ($preset !== ThemePreset::Custom) {
			return $preset->tokens();
		}

		$parser = new ThemeTokenParser();
		$tokens = $parser->parse((string) $this->react->get('themeCustomTokens'));

		return $parser->isComplete($tokens) ? $tokens : ['light' => [], 'dark' => []];
	}

	/**
	 * Compile the active theme for `$user` into a scoped stylesheet (empty string for the `Native` theme).
	 */
	public function resolveThemeTokenCss(?User $user = null): string
	{
		return $this->compileTokens($this->activeTokens($user));
	}

	/**
	 * Compile light/dark token maps into a single `light-dark()` based declaration block
	 * plus scoped dark-only token overrides when dark mode defines extra variables.
	 *
	 * @param array{light: array<string, string>, dark: array<string, string>} $tokens
	 */
	public function compileTokens(array $tokens): string
	{
		if ($tokens['light'] === [] && $tokens['dark'] === []) {
			return '';
		}

		$colorTokens = array_flip(ThemeTokenParser::COLOR_TOKENS);
		$blocks = [];

		if ($tokens['light'] !== []) {
			$declarations = [];
			foreach ($tokens['light'] as $name => $lightValue) {
				$darkValue = $tokens['dark'][$name] ?? null;
				$declarations[$name] = isset($colorTokens[$name]) && $darkValue !== null && $darkValue !== $lightValue
					? "light-dark({$lightValue}, {$darkValue})"
					: $lightValue;
			}
			foreach (self::DERIVED_TOKENS as $name => $value) {
				$declarations[$name] ??= $value;
			}
			foreach (self::SURFACE_TOKENS as $name => $value) {
				$declarations[$name] = $value;
			}

			$lines = [];
			foreach ($declarations as $name => $value) {
				$lines[] = "\t--{$name}: {$value};";
			}
			$blocks[] = self::TOKEN_SCOPE . " {\n" . implode("\n", $lines) . "\n}";
		}

		$darkOnlyLines = [];
		foreach ($tokens['dark'] as $name => $darkValue) {
			if (!array_key_exists($name, $tokens['light'])) {
				$darkOnlyLines[] = "\t--{$name}: {$darkValue};";
			}
		}
		if ($darkOnlyLines !== []) {
			$blocks[] = self::DARK_TOKEN_SCOPE . " {\n" . implode("\n", $darkOnlyLines) . "\n}";
		}

		return implode("\n\n", $blocks);
	}

	/**
	 * Resolve the active Light/Dark/System theme mode synchronized with `AdminThemeUikit`
	 * (`$config->AdminThemeUikit['noDarkMode']`, `$user->meta('adminDarkMode')`, `{user-id}.json['themeMode']`, `defaultStyleName`, and `defaultTheme`).
	 */
	public function resolveEffectiveThemeMode(?User $user = null): string
	{
		$wire = $this->wire();
		$adminSettings = $wire->config->AdminThemeUikit;
		if (is_array($adminSettings) && !empty($adminSettings['noDarkMode'])) {
			return 'light';
		}

		$resolvedUser = $user ?? $wire->user;
		if (AccessGuard::isAuthenticatedOrSuperuser($resolvedUser)) {
			try {
				$darkMeta = $resolvedUser->meta('adminDarkMode');
				if ($darkMeta === 1 || $darkMeta === '1') {
					return 'dark';
				}
				if ($darkMeta === 0 || $darkMeta === '0') {
					return 'light';
				}
				if ($darkMeta === -1 || $darkMeta === '-1') {
					return 'system';
				}
			} catch (\Throwable) {
				// Fall through to workspace preference JSON / module defaults
			}

			$storedMode = (string) ($this->react->workspacePreferences()->load($resolvedUser)['themeMode'] ?? '');
			if (in_array($storedMode, ['light', 'dark', 'system'], true)) {
				return $storedMode;
			}
		}

		try {
			$themeConfig = $wire->modules->getConfig('AdminThemeUikit');
			if (is_array($themeConfig) && isset($themeConfig['defaultStyleName']) && is_string($themeConfig['defaultStyleName'])) {
				$styleName = strtolower(trim($themeConfig['defaultStyleName']));
				if ($styleName === 'dark' || $styleName === 'light') {
					return $styleName;
				}
			}
		} catch (\Throwable) {
			// Fall through to the module defaultTheme
		}

		$fallback = (string) ($this->react->get('defaultTheme') ?: 'system');

		return in_array($fallback, ['light', 'dark', 'system'], true) ? $fallback : 'system';
	}

	/**
	 * Determine whether `AdminThemeUikit` has the `useInputFocus` toggle enabled.
	 */
	public function resolveAdminUseInputFocus(): bool
	{
		try {
			$themeConfig = $this->wire()->modules->getConfig('AdminThemeUikit');
			if (is_array($themeConfig) && is_array($themeConfig['defaultToggles'] ?? null)) {
				return in_array('useInputFocus', $themeConfig['defaultToggles'], true);
			}
		} catch (\Throwable) {
			return false;
		}

		return false;
	}

	/**
	 * Extract ProcessWire's `--pw-*` color scheme CSS variables from `AdminThemeUikit`
	 * (`themes/default/admin-custom.css`, `defaultCustomCssFile`, `defaultMainColor`, and `defaultCustomCss`)
	 * so full-page Workspaces inherit the selected admin palette without loading UIkit CSS or jQuery.
	 */
	public function resolveAdminColorSchemeCss(): string
	{
		$wire = $this->wire();
		$config = $wire->config;
		$rootPath = rtrim((string) ($config->paths->root ?: dirname(__DIR__, 5)), '/');

		$mainColor = 'red';
		$customLight = '';
		$customDark = '';
		$use2Colors = false;
		$customCssFile = '';
		$customInlineCss = '';

		try {
			$themeConfig = $wire->modules->getConfig('AdminThemeUikit');
			if (is_array($themeConfig)) {
				if (!empty($themeConfig['defaultMainColor']) && is_string($themeConfig['defaultMainColor'])) {
					$mainColor = strtolower($themeConfig['defaultMainColor']);
				}
				if (!empty($themeConfig['defaultMainColorCustom']) && is_string($themeConfig['defaultMainColorCustom'])) {
					$customLight = trim($themeConfig['defaultMainColorCustom']);
				}
				if (!empty($themeConfig['defaultMainColorCustomDark']) && is_string($themeConfig['defaultMainColorCustomDark'])) {
					$customDark = trim($themeConfig['defaultMainColorCustomDark']);
				}
				if (is_array($themeConfig['defaultToggles'] ?? null)) {
					$use2Colors = in_array('use2Colors', $themeConfig['defaultToggles'], true);
				}
				if (!empty($themeConfig['defaultCustomCssFile']) && is_string($themeConfig['defaultCustomCssFile'])) {
					$customCssFile = trim($themeConfig['defaultCustomCssFile']);
				}
				if (!empty($themeConfig['defaultCustomCss']) && is_string($themeConfig['defaultCustomCss'])) {
					$customInlineCss = trim($themeConfig['defaultCustomCss']);
				}
			}
		} catch (\Throwable) {
			// Keep default classic color scheme
		}

		$baseCss = '';
		$baseFile = "{$rootPath}/wire/modules/AdminTheme/AdminThemeUikit/themes/default/admin-custom.css";
		if (is_file($baseFile) && is_readable($baseFile)) {
			$contents = (string) file_get_contents($baseFile);
			if ($contents !== '') {
				$strippedFonts = (string) preg_replace('/@font-face\s*\{[^}]*\}/s', '', $contents);
				$baseCss = self::sanitizeInlineStyleSheet($strippedFonts);
			}
		}

		if ($baseCss === '') {
			$baseCss = ":root {\n\tcolor-scheme: light dark;\n\t--pw-main-color: #eb1d61;\n\t--pw-text-color: light-dark(#111, white);\n\t--pw-muted-color: light-dark(rgba(0, 0, 0, 0.55), rgba(255, 255, 255, 0.6));\n\t--pw-border-color: light-dark(rgba(0, 0, 0, 0.16), #444);\n\t--pw-main-background: light-dark(#eee, #222);\n\t--pw-inputs-background: light-dark(#f8f8f8, #161616);\n\t--pw-blocks-background: light-dark(white, black);\n\t--pw-button-background: light-dark(var(--pw-text-color), var(--pw-main-color));\n\t--pw-button-color: light-dark(var(--pw-blocks-background), var(--pw-text-color));\n\t--pw-button-border: transparent;\n\t--pw-button-muted-background: light-dark(#737373, #404040);\n\t--pw-button-muted-color: light-dark(var(--pw-blocks-background), var(--pw-text-color));\n\t--pw-button-muted-border: transparent;\n\t--pw-button-hover-background: light-dark(var(--pw-main-color), var(--pw-text-color));\n\t--pw-button-hover-color: var(--pw-blocks-background);\n\t--pw-button-hover-border: transparent;\n\t--pw-menu-item-background-hover: var(--pw-main-background);\n\t--pw-masthead-background: var(--pw-blocks-background);\n\t--pw-masthead-active-color: var(--pw-text-color);\n\t--pw-masthead-text-color: var(--pw-muted-color);\n\t--pw-masthead-border-color: var(--pw-border-color);\n\t--pw-masthead-logo-color: var(--pw-main-color);\n\t--pw-masthead-menu-item-background-hover: var(--pw-menu-item-background-hover);\n\t--pw-masthead-input-background: var(--pw-inputs-background);\n\t--pw-masthead-input-color: var(--pw-text-color);\n\t--pw-masthead-input-border: var(--pw-border-color);\n\t--pw-modal-color: rgba(0, 0, 0, 0.7);\n\t--pw-error-inline-text-color: light-dark(#cd0a0a, #ff7171);\n\t--pw-code-color: light-dark(#0173b0, #e7e695);\n\t--pw-code-background: light-dark(var(--pw-inputs-background), #3c3c3c5e);\n\t--pw-alert-text-color: var(--pw-text-color);\n\t--pw-alert-primary: var(--pw-main-background);\n\t--pw-alert-warning: light-dark(#fff0be, #d57f00);\n\t--pw-alert-success: light-dark(#c1e7cd, #139472);\n\t--pw-alert-danger: light-dark(#fee6e6, #8a1919);\n\t--pw-notes-background: light-dark(#ffd, #bdbdbd33);\n\t--pw-button-radius: 99999px;\n\t--pw-input-radius: 0;\n}";
		}

		$chunks = [$baseCss];

		if ($customCssFile !== '' && !str_contains($customCssFile, '//') && !str_contains($customCssFile, "\0")) {
			$realRoot = realpath($rootPath);
			$rawSkinPath = $rootPath . '/' . ltrim($customCssFile, '/');
			$candidateSkin = !is_link($rawSkinPath) ? realpath($rawSkinPath) : false;
			if (
				$realRoot !== false
				&& $candidateSkin !== false
				&& str_starts_with($candidateSkin, $realRoot . DIRECTORY_SEPARATOR)
				&& strtolower(pathinfo($candidateSkin, PATHINFO_EXTENSION)) === 'css'
				&& is_file($candidateSkin)
				&& is_readable($candidateSkin)
			) {
				$skinCss = self::sanitizeInlineStyleSheet((string) file_get_contents($candidateSkin));
				if ($skinCss !== '') {
					$chunks[] = $skinCss;
				}
			}
		}

		$mainColors = [
			'red' => '#eb1d61',
			'green' => '#14ae85',
			'blue' => '#2380e6',
			'custom' => $customLight !== '' ? $customLight : '#eb1d61',
		];
		$mainColorCode = $mainColors[$mainColor] ?? $mainColors['red'];
		if (preg_match('/^#[0-9a-fA-F]{3,8}$/', $mainColorCode) === 1) {
			if ($mainColor === 'custom' && $use2Colors && preg_match('/^#[0-9a-fA-F]{3,8}$/', $customDark) === 1) {
				$chunks[] = ":root { --pw-main-color: light-dark({$mainColorCode}, {$customDark}); }";
			} else {
				$chunks[] = ":root { --pw-main-color: {$mainColorCode}; }";
			}
		}

		if ($customInlineCss !== '') {
			$cleanInline = self::sanitizeInlineStyleSheet($customInlineCss);
			if ($cleanInline !== '') {
				$chunks[] = $cleanInline;
			}
		}

		return implode("\n", $chunks);
	}

	/**
	 * Strip CSS block comments (including trailing unclosed `/*` comments) outside quoted strings
	 * and neutralize `</style` sequences so inline `<style>` injection is safe and uncorrupted.
	 */
	public static function sanitizeInlineStyleSheet(string $css): string
	{
		$withoutComments = (string) preg_replace(
			'~("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')|/\*.*?(?:\*/|$)~s',
			'$1',
			$css
		);
		$safe = (string) preg_replace('~<\s*/\s*style~i', '<\\/style', $withoutComments);

		return trim($safe);
	}
}
