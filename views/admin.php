<?php

declare(strict_types=1);

namespace ProcessWire;

/**
 * React Standalone Inertia Admin Root View (`shellMode === 'workspace'`)
 *
 * Renders the HTML document shell for full-screen `ProcessReactWorkspace` and
 * Workspace-entered `ProcessReact` views without loading classic ProcessWire
 * `AdminThemeUikit`, `JqueryCore`, or `JqueryUI` assets.
 *
 * Inherits ONLY ProcessWire's `--pw-*` UI color scheme tokens, mapped cleanly into standard
 * Tailwind CSS v4 semantic variables (`--background`, `--foreground`, `--primary`, etc.).
 *
 * @var string $locale
 * @var string $title
 * @var string $themeMode
 * @var string|null $shellLayout
 * @var bool|null $sidebarCollapsed
 * @var bool|null $useInputFocus
 * @var string $colorSchemeCss
 * @var string $themeCss
 * @var string $head
 * @var list<string> $styles
 * @var list<string> $scripts
 * @var Inertia $inertia
 * @var array<string, mixed> $pageObject
 */

$sanitizer = $this->wire()->sanitizer;
$safeLocale = $sanitizer->entities($locale ?? 'en');
$rawTitle = html_entity_decode((string) ($title ?? 'Workspace'), ENT_QUOTES | ENT_HTML5, 'UTF-8');
$safeTitle = $sanitizer->entities($rawTitle);
$resolvedThemeMode = in_array($themeMode ?? 'system', ['light', 'dark', 'system'], true)
	? (string) $themeMode
	: 'system';
$htmlThemeClass = $resolvedThemeMode === 'dark'
	? 'dark'
	: ($resolvedThemeMode === 'light' ? 'light' : '');
$bodyClasses = array_values(array_filter([
	$resolvedThemeMode === 'dark'
		? 'dark-theme'
		: ($resolvedThemeMode === 'light' ? 'light-theme' : 'auto-theme'),
	!empty($useInputFocus) ? 'pw-use-input-focus' : '',
]));
$bodyThemeClass = implode(' ', $bodyClasses);
$adminRootAttr = (string) ($this->wire()->config->urls->admin ?: '/processwire/');
$reactInst = $this->wire()->fuel->get('react');
$launcherPathAttr = $reactInst instanceof React
	? (string) (parse_url($reactInst->resolveLauncherUrl(), PHP_URL_PATH) ?: '')
	: '';
$rawShellLayout = is_string($shellLayout ?? null)
	? strtolower(trim((string) $shellLayout))
	: ($reactInst instanceof React ? $reactInst->resolveEffectiveShellLayout($this->wire()->user) : 'topbar');
$resolvedShellLayout = preg_match('/^[a-z0-9_-]{1,40}$/', $rawShellLayout) === 1 ? $rawShellLayout : 'topbar';
$resolvedSidebarCollapsed = isset($sidebarCollapsed)
	? (bool) $sidebarCollapsed
	: ($reactInst instanceof React ? $reactInst->resolveSidebarCollapsed($this->wire()->user) : false);
$sidebarCollapsedAttr = $resolvedSidebarCollapsed ? 'true' : 'false';
$uikitFontDir = rtrim((string) $this->wire()->config->paths->modules, '/') . '/AdminTheme/AdminThemeUikit/themes/default/fonts';
$uikitFontUrlBase = is_dir($uikitFontDir)
	? rtrim((string) $this->wire()->config->urls->modules, '/') . '/AdminTheme/AdminThemeUikit/themes/default/fonts'
	: '';
?>
<!DOCTYPE html>
<html lang="<?= $safeLocale ?>" class="<?= $sanitizer->entities($htmlThemeClass) ?>" data-theme-mode="<?= $sanitizer->entities($resolvedThemeMode) ?>" data-rw-shell-mode="workspace" data-rw-shell-layout="<?= $sanitizer->entities($resolvedShellLayout) ?>" data-rw-sidebar-collapsed="<?= $sidebarCollapsedAttr ?>" data-rw-admin-root="<?= $sanitizer->entities($adminRootAttr) ?>" data-rw-launcher-path="<?= $sanitizer->entities($launcherPathAttr) ?>">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<link rel="icon" href="data:," />
	<title inertia><?= $safeTitle ?> &mdash; ProcessWire</title>
<?php if ($uikitFontUrlBase !== '') { ?>
	<style id="pw-inter-font">
		@font-face { font-display: swap; font-family: "Inter"; font-style: normal; font-weight: 400; src: url("<?= $sanitizer->entities($uikitFontUrlBase . '/Inter-Regular.woff2') ?>") format("woff2"); }
		@font-face { font-display: swap; font-family: "Inter"; font-style: italic; font-weight: 400; src: url("<?= $sanitizer->entities($uikitFontUrlBase . '/Inter-Italic.woff2') ?>") format("woff2"); }
		@font-face { font-display: swap; font-family: "Inter"; font-style: normal; font-weight: 600; src: url("<?= $sanitizer->entities($uikitFontUrlBase . '/Inter-SemiBold.woff2') ?>") format("woff2"); }
		@font-face { font-display: swap; font-family: "Inter"; font-style: italic; font-weight: 600; src: url("<?= $sanitizer->entities($uikitFontUrlBase . '/Inter-SemiBoldItalic.woff2') ?>") format("woff2"); }
	</style>
<?php } ?>
<?php if (!empty($colorSchemeCss)) { ?>
	<style id="pw-color-scheme-tokens"><?= (string) preg_replace('~<\s*/\s*style~i', '<\\/style', (string) $colorSchemeCss) ?></style>
<?php } ?>
<?php if (!empty($themeCss)) { ?>
	<style id="rw-theme-tokens"><?= (string) preg_replace('~<\s*/\s*style~i', '<\\/style', (string) $themeCss) ?></style>
<?php } ?>
<?php if (!empty($styles) && is_array($styles)) { ?>
<?php foreach ($styles as $styleUrl) { ?>
	<link rel="stylesheet" href="<?= $sanitizer->entities((string) $styleUrl) ?>" />
<?php } ?>
<?php } ?>
<?php if (!empty($head)) { ?>
	<?= $head . "\n" ?>
<?php } ?>
	<script>
		(function () {
			try {
				var d = document.documentElement;
				var mode = d.getAttribute('data-theme-mode') || 'system';
				var isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
				d.classList.toggle('dark', isDark);
				d.classList.toggle('light', !isDark);
				localStorage.setItem('react-workspace-theme-mode', mode);
				var layout = d.getAttribute('data-rw-shell-layout') || 'topbar';
				var collapsed = d.getAttribute('data-rw-sidebar-collapsed') === 'true' ? 'true' : 'false';
				d.setAttribute('data-rw-shell-layout', layout);
				d.setAttribute('data-rw-sidebar-collapsed', collapsed);
			} catch (e) {}
		})();
	</script>
</head>
<body class="min-h-screen bg-background text-foreground antialiased selection:bg-primary selection:text-primary-foreground <?= $sanitizer->entities($bodyThemeClass) ?>">
	<?= $inertia->app($pageObject) . "\n" ?>
<?php if (!empty($scripts) && is_array($scripts)) { ?>
<?php foreach ($scripts as $scriptUrl) { ?>
	<script type="module" src="<?= $sanitizer->entities((string) $scriptUrl) ?>"></script>
<?php } ?>
<?php } ?>
</body>
</html>
