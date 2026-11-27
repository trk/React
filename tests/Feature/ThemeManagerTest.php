<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\React;
use ProcessWire\User;
use Totoglu\React\Theme\ThemeManager;
use Totoglu\React\Theme\ThemePreset;
use Totoglu\React\Theme\ThemeTokenParser;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
	$react = React::instance();
	$this->origPreset = $react->get('themePreset');
	$this->origCustomTokens = $react->get('themeCustomTokens');
	$this->origModuleConfig = wire('modules')->getConfig('React');

	$store = $react->workspacePreferences();
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superuser = wire('users')->get($superId);
	$this->superPrefPath = $superuser instanceof User ? $store->filePath($superuser) : '';
	$this->superPrefBackup = ($this->superPrefPath !== '' && is_file($this->superPrefPath))
		? (string) file_get_contents($this->superPrefPath)
		: null;
	if ($this->superPrefPath !== '' && is_file($this->superPrefPath)) {
		@unlink($this->superPrefPath);
	}
	$this->superDarkMetaBackup = $superuser instanceof User ? $superuser->meta('adminDarkMode') : null;
});

afterEach(function (): void {
	$react = React::instance();
	$react->set('themePreset', $this->origPreset);
	$react->set('themeCustomTokens', $this->origCustomTokens);
	wire('modules')->saveConfig('React', is_array($this->origModuleConfig) ? $this->origModuleConfig : []);

	$store = $react->workspacePreferences();
	foreach ([987654, 987655] as $syntheticId) {
		$u = new User();
		wire($u);
		$u->id = $syntheticId;
		$store->reset($u);
	}

	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superuser = wire('users')->get($superId);
	if ($superuser instanceof User) {
		if ($this->superDarkMetaBackup === null) {
			$superuser->meta()->remove('adminDarkMode');
		} else {
			$superuser->meta('adminDarkMode', $this->superDarkMetaBackup);
		}
	}
	if ($this->superPrefPath !== '') {
		if ($this->superPrefBackup === null) {
			if (is_file($this->superPrefPath)) {
				unlink($this->superPrefPath);
			}
		} else {
			file_put_contents($this->superPrefPath, $this->superPrefBackup);
		}
	}
});

test('React exposes a single central ThemeManager instance and defaults to the native admin theme', function (): void {
	$react = React::instance();
	$react->set('themePreset', 'native');

	expect($react->theme())->toBeInstanceOf(ThemeManager::class)
		->and($react->theme())->toBe($react->theme())
		->and($react->theme()->activePreset())->toBe(ThemePreset::Native)
		->and($react->theme()->resolveThemeTokenCss())->toBe('')
		->and(React::getDefaultConfig()['themePreset'])->toBe('native')
		->and(React::getDefaultConfig()['themeCustomTokens'])->toBe('');
});

test('built-in presets compile into scoped light-dark token stylesheets with derived surface tokens', function (): void {
	$react = React::instance();

	foreach (ThemePreset::cases() as $preset) {
		if ($preset === ThemePreset::Native || $preset === ThemePreset::Custom) {
			continue;
		}
		$react->set('themePreset', $preset->value);
		$css = $react->theme()->resolveThemeTokenCss();
		expect($css)->toStartWith(':root:root, :root:root :is(')
			->and($css)->toContain('[data-rw-app-shell]')
			->and($css)->toContain('[data-rw-portal-overlay]')
			->and($css)->toContain('#_rw_portal_root')
			->and($css)->toContain('[data-rw-surface="elevated"]')
			->and($css)->toContain('--background: light-dark(')
			->and($css)->toContain('--primary: ')
			->and($css)->toContain('--primary-foreground: ')
			->and($css)->toContain('--radius: 0.625rem;')
			->and($css)->toContain('--button-bg: var(--primary);')
			->and($css)->toContain('--masthead: var(--card);')
			->and($css)->toContain('--sidebar-primary: var(--primary);')
			->and($css)->not->toContain('<');
	}

	$react->set('themePreset', 'not-a-preset');
	expect($react->theme()->activePreset())->toBe(ThemePreset::Native)
		->and($react->theme()->resolveThemeTokenCss())->toBe('');
});

test('ThemeTokenParser keeps only allowlisted tokens with safe values and rejects injection vectors', function (): void {
	$parser = new ThemeTokenParser();
	$source = <<<'CSS'
/* exported theme */
@import url("https://evil.example/x.css");
:root {
	--background: oklch(1 0 0);
	--foreground: oklch(0.145 0 0);
	--primary: oklch(0.546 0.245 262.881);
	--primary-foreground: oklch(0.985 0 0);
	--radius: 0.5rem;
	--font-sans: "Inter", ui-sans-serif, system-ui;
	--card: url(javascript:alert(1));
	--muted: oklch(0.97 0 0) </style><script>alert(1)</script>;
	--accent: expression(alert(1));
	--unknown-token: red;
	color: red;
}
.dark {
	--background: oklch(0.145 0 0);
	--primary: oklch(0.623 0.214 259.815);
	--border: oklch(1 0 0 / 10%);
}
@theme inline {
	--color-background: var(--background);
}
CSS;

	$tokens = $parser->parse($source);

	expect($tokens['light'])->toBe([
		'background' => 'oklch(1 0 0)',
		'foreground' => 'oklch(0.145 0 0)',
		'primary' => 'oklch(0.546 0.245 262.881)',
		'primary-foreground' => 'oklch(0.985 0 0)',
		'radius' => '0.5rem',
		'font-sans' => '"Inter", ui-sans-serif, system-ui',
	])
		->and($tokens['dark'])->toBe([
			'background' => 'oklch(0.145 0 0)',
			'primary' => 'oklch(0.623 0.214 259.815)',
			'border' => 'oklch(1 0 0 / 10%)',
		])
		->and($parser->isComplete($tokens))->toBeTrue()
		->and($parser->isSafeValue('url(x)'))->toBeFalse()
		->and($parser->isSafeValue('"unbalanced'))->toBeFalse()
		->and($parser->isSafeValue('calc(var(--radius) - 2px)'))->toBeTrue()
		->and($parser->parse(str_repeat('a', ThemeTokenParser::MAX_SOURCE_BYTES + 1)))->toBe(['light' => [], 'dark' => []]);

	$incomplete = $parser->parse(':root { --background: oklch(1 0 0); }');
	expect($parser->isComplete($incomplete))->toBeFalse();

	$mediaDarkCss = <<<'CSS'
:root {
	--background: #ffffff;
	--foreground: #111111;
	--primary: #2563eb;
	--primary-foreground: #ffffff;
	--radius: 0.5rem;
}
@media (prefers-color-scheme: dark) {
	:root {
		--background: #09090b;
		--sidebar-accent: #18181b;
	}
}
CSS;
	$mediaParsed = $parser->parse($mediaDarkCss);
	expect($mediaParsed['light']['background'])->toBe('#ffffff')
		->and($mediaParsed['dark']['background'])->toBe('#09090b')
		->and($mediaParsed['dark']['sidebar-accent'])->toBe('#18181b');
});

test('custom theme tokens compile only when complete and emit dark-only tokens under dark scope', function (): void {
	$react = React::instance();
	$react->set('themePreset', 'custom');

	$react->set('themeCustomTokens', ':root { --background: oklch(1 0 0); }');
	expect($react->theme()->resolveThemeTokenCss())->toBe('');

	$react->set('themeCustomTokens', ':root { --background: #ffffff; --foreground: #111111; --primary: #2563eb; --primary-foreground: #ffffff; --radius: 0.75rem; } .dark { --background: #0b0b0c; --primary: #3b82f6; --chart-1: #60a5fa; }');
	$css = $react->theme()->resolveThemeTokenCss();
	expect($css)->toContain('--background: light-dark(#ffffff, #0b0b0c);')
		->and($css)->toContain('--primary: light-dark(#2563eb, #3b82f6);')
		->and($css)->toContain('--foreground: #111111;')
		->and($css)->toContain('--radius: 0.75rem;')
		->and($css)->toContain('--card: var(--background);')
		->and($css)->toContain(':root.dark:root')
		->and($css)->toContain('--chart-1: #60a5fa;');
});

test('root view data, shared context, and workspace preference responses carry the central theme', function (): void {
	$react = React::instance();
	$react->set('themePreset', 'ocean');

	$rootView = $react->buildInertiaRootViewData('Workspace');
	$shared = $react->buildInertiaSharedContext();

	expect($rootView['themeCss'] ?? '')->toContain('--primary: light-dark(oklch(0.49 0.155 256), oklch(0.68 0.148 252));')
		->and($shared['themePreset'] ?? null)->toBe('ocean')
		->and($shared['hasCustomThemeTokens'] ?? null)->toBeFalse();

	$react->set('themeCustomTokens', ':root { --background: #ffffff; --foreground: #111111; --primary: #2563eb; --primary-foreground: #ffffff; --radius: 0.5rem; }');
	$sharedWithCustom = $react->buildInertiaSharedContext();
	expect($sharedWithCustom['hasCustomThemeTokens'] ?? null)->toBeTrue();

	$viewFile = dirname(__DIR__, 2) . '/views/admin.php';
	expect((string) file_get_contents($viewFile))->toContain('id="rw-theme-tokens"');
});

test('set_theme_preset persists per-user overrides without overwriting site default, supports reset, and rejects guests/invalid presets', function (): void {
	$react = React::instance();
	$react->set('themePreset', 'ocean');
	$users = wire('users');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superuser = $users->get($superId);
	expect($superuser)->toBeInstanceOf(User::class);

	$saved = $react->handleWorkspacePrefsAction([
		'action' => 'set_theme_preset',
		'themePreset' => 'indigo',
		'_requestMethod' => 'POST',
	], false, $superuser);

	expect($saved['ok'])->toBeTrue()
		->and($saved['themePreset'] ?? null)->toBe('indigo')
		->and($saved['userThemePreset'] ?? null)->toBe('indigo')
		->and($saved['siteDefaultThemePreset'] ?? null)->toBe('ocean')
		->and($saved['themeCss'] ?? '')->toContain('oklch(0.475 0.16 272)')
		->and($react->theme()->siteDefaultPreset())->toBe(ThemePreset::Ocean)
		->and($react->theme()->userPresetOverride($superuser))->toBe('indigo')
		->and($react->theme()->activePreset($superuser))->toBe(ThemePreset::Indigo);

	$invalid = $react->handleWorkspacePrefsAction([
		'action' => 'set_theme_preset',
		'themePreset' => 'neon-unknown',
		'_requestMethod' => 'POST',
	], false, $superuser);
	expect($invalid['ok'])->toBeFalse()->and($invalid['status'])->toBe(422);

	foreach (['rose', 'amber'] as $retired) {
		expect(ThemePreset::fromInput($retired))->toBe(ThemePreset::Native);
		$retiredRes = $react->handleWorkspacePrefsAction([
			'action' => 'set_theme_preset',
			'themePreset' => $retired,
			'_requestMethod' => 'POST',
		], false, $superuser);
		expect($retiredRes['ok'])->toBeFalse()->and($retiredRes['status'])->toBe(422);
	}

	$react->set('themeCustomTokens', '');
	$customWithoutTokens = $react->handleWorkspacePrefsAction([
		'action' => 'set_theme_preset',
		'themePreset' => 'custom',
		'_requestMethod' => 'POST',
	], false, $superuser);
	expect($customWithoutTokens['ok'])->toBeFalse()->and($customWithoutTokens['status'])->toBe(422);

	$editorRole = null;
	foreach (wire('roles') as $candidateRole) {
		if ($candidateRole->name !== 'guest' && $candidateRole->hasPermission('page-edit')) {
			$editorRole = $candidateRole;
			break;
		}
	}
	$editor = new User();
	wire($editor);
	$editor->id = 987654;
	$editor->name = 'rw-theme-editor';
	if ($editorRole && $editorRole->id) {
		$editor->addRole($editorRole);
	} else {
		$editor->addRole('superuser');
	}

	$peer = new User();
	wire($peer);
	$peer->id = 987655;
	$peer->name = 'rw-theme-peer';

	$editorSaved = $react->handleWorkspacePrefsAction([
		'action' => 'set_theme_preset',
		'themePreset' => 'teal',
		'_requestMethod' => 'POST',
	], false, $editor);
	expect($editorSaved['ok'])->toBeTrue()
		->and($editorSaved['userThemePreset'] ?? null)->toBe('teal')
		->and($editorSaved['themePreset'] ?? null)->toBe('teal')
		->and($editorSaved['siteDefaultThemePreset'] ?? null)->toBe('ocean')
		->and($react->theme()->activePreset($editor))->toBe(ThemePreset::Teal)
		->and($react->theme()->activePreset($peer))->toBe(ThemePreset::Ocean);

	// Clearing user override reverts seamlessly to site default
	$resetToSite = $react->handleWorkspacePrefsAction([
		'action' => 'set_theme_preset',
		'themePreset' => '',
		'_requestMethod' => 'POST',
	], false, $editor);
	expect($resetToSite['ok'])->toBeTrue()
		->and($resetToSite['userThemePreset'] ?? null)->toBe('')
		->and($resetToSite['themePreset'] ?? null)->toBe('ocean')
		->and($react->theme()->activePreset($editor))->toBe(ThemePreset::Ocean);

	// Guest requests remain forbidden
	$guest = $users->getGuestUser();
	$guestDenied = $react->handleWorkspacePrefsAction([
		'action' => 'set_theme_preset',
		'themePreset' => 'slate',
		'_requestMethod' => 'POST',
	], false, $guest);
	expect($guestDenied['ok'])->toBeFalse()->and($guestDenied['status'])->toBe(403);
});

test('ThemeTokenParser emits :not(.dark) root selectors for light-only custom tokens and ThemeManager rejects nested light-dark()', function (): void {
	$parser = new \Totoglu\React\Theme\ThemeTokenParser();
	$parsed = $parser->parse(
		':root { --background: #ffffff; --foreground: #111111; --primary: #2563eb; --primary-foreground: #ffffff; }'
	);
	expect($parsed['light'])->toHaveKey('primary', '#2563eb')
		->and($parsed['dark'])->toBe([]);

	$react = React::instance();
	$prevCustom = (string) $react->get('themeCustomTokens');
	$prevPreset = (string) $react->get('themePreset');
	try {
		$react->set('themePreset', 'custom');
		$react->set('themeCustomTokens', ':root { --background: #ffffff; --foreground: #111111; --primary: #2563eb; --primary-foreground: #ffffff; }');
		$lightCss = $react->theme()->compileTokens($parsed);
		expect($lightCss)->toContain('--primary: #2563eb;')
			->and($lightCss)->not->toContain('.dark');

		$nestedParsed = $parser->parse(':root { --background: #ffffff; --foreground: #111111; --primary: light-dark(#111, #eee); --primary-foreground: #ffffff; }');
		$nestedParsed['dark']['primary'] = '#eeeeee';
		$compiledNested = $react->theme()->compileTokens($nestedParsed);
		expect($compiledNested)->toContain('--primary: light-dark(#111, #eee);')
			->and($compiledNested)->not->toContain('light-dark(light-dark(');
	} finally {
		$react->set('themePreset', $prevPreset);
		$react->set('themeCustomTokens', $prevCustom);
	}
});
