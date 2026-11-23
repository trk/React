<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\ProcessReactWorkspace;
use ProcessWire\User;
use ProcessWire\Wire404Exception;
use ProcessWire\WirePermissionException;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

/**
 * Decode the Inertia `<script type="application/json" data-page="app">` payload from rendered HTML.
 *
 * @return array<string, mixed>
 */
function rwUiShowcaseExtractPageJson(string $html): array
{
	if (preg_match('/<script\b[^>]*\bdata-page="app"[^>]*>(.*?)<\/script>/s', $html, $matches) !== 1) {
		return [];
	}

	$decoded = json_decode($matches[1], true);

	return is_array($decoded) ? $decoded : [];
}

/**
 * Resolve a superuser account for UiShowcase feature assertions.
 */
function rwUiShowcaseResolveSuperuser(): User
{
	$users = wire('users');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$admin = $users->get($superId);
	if (!$admin instanceof User || !$admin->id) {
		$admin = $users->get('roles=superuser');
	}
	if (!$admin instanceof User || !$admin->id) {
		throw new RuntimeException('No superuser account found in test environment.');
	}

	return $admin;
}

test('UI Showcase enforces strict superuser + debug mode access control and hides launcher link otherwise', function (): void {
	bootReactForTesting();
	$pw = wire();
	$config = $pw->config;
	$users = $pw->users;
	$input = $pw->input;

	$prevUser = $users->getCurrentUser();
	$prevDebug = (bool) $config->debug;
	$prevSegments = $input->urlSegments();
	$prevGet = [];
	foreach (['sample', 'section', 'theme', 'embed'] as $key) {
		$prevGet[$key] = $input->get->offsetExists($key) ? $input->get->get($key) : null;
	}

	try {
		$proc = new ProcessReactWorkspace();
		$pw->wire($proc);
		$proc->init();

		// 1. Even as superuser, debug=false denies access and hides debugShowcaseUrl on Launcher
		$users->setCurrentUser(rwUiShowcaseResolveSuperuser());
		$config->debug = false;

		$input->setUrlSegments([]);
		$launcherHtml = (string) $proc->execute();
		$launcherPage = rwUiShowcaseExtractPageJson($launcherHtml);
		expect($launcherPage['props']['debugShowcaseUrl'] ?? null)->toBe('')
			->and($launcherHtml)->not->toContain('/ui-showcase/');

		$input->setUrlSegment(1, 'ui-showcase');
		expect(static fn(): string => (string) $proc->executeUiShowcase())
			->toThrow(WirePermissionException::class);

		// 2. Even with debug=true, guest user is denied access and never receives /ui-showcase/ URL
		$config->debug = true;
		$users->setCurrentUser($users->getGuestUser());

		$input->setUrlSegments([]);
		$guestLauncherHtml = (string) $proc->execute();
		$guestLauncherPage = rwUiShowcaseExtractPageJson($guestLauncherHtml);
		expect($guestLauncherPage['props']['debugShowcaseUrl'] ?? null)->toBe('');

		$input->setUrlSegment(1, 'ui-showcase');
		expect(static fn(): string => (string) $proc->executeUiShowcase())
			->toThrow(WirePermissionException::class);
	} finally {
		$config->debug = $prevDebug;
		$users->setCurrentUser($prevUser);
		$input->setUrlSegments($prevSegments);
		foreach ($prevGet as $key => $val) {
			if ($val === null) {
				$input->get->offsetUnset($key);
			} else {
				$input->get->set($key, $val);
			}
		}
	}
});

test('UI Showcase isolates submodule scripts/styles from Workspace Dashboard and renders valid Inertia props', function (): void {
	bootReactForTesting();
	$pw = wire();
	$config = $pw->config;
	$users = $pw->users;
	$input = $pw->input;

	$prevUser = $users->getCurrentUser();
	$prevDebug = (bool) $config->debug;
	$prevSegments = $input->urlSegments();
	$prevGet = [];
	foreach (['sample', 'section', 'theme', 'embed'] as $key) {
		$prevGet[$key] = $input->get->offsetExists($key) ? $input->get->get($key) : null;
	}

	try {
		$users->setCurrentUser(rwUiShowcaseResolveSuperuser());
		$config->debug = true;

		$proc = new ProcessReactWorkspace();
		$pw->wire($proc);
		$proc->init();

		// 1. Standard dashboard request loads ONLY ProcessReactWorkspace.js and zero showcase assets
		$input->setUrlSegments([]);
		$dashboardScripts = implode("\n", $proc->getModuleScriptAssets());
		$dashboardStyles = $proc->getModuleStyleAssets();

		expect($dashboardScripts)->toContain('ProcessReactWorkspace.js')
			->and($dashboardScripts)->not->toContain('ReactUiShowcase.js')
			->and($dashboardScripts)->not->toContain('ReactExtraFields.js')
			->and($dashboardStyles)->toBe([]);

		$launcherHtml = (string) $proc->execute();
		$launcherPage = rwUiShowcaseExtractPageJson($launcherHtml);
		expect((string) ($launcherPage['props']['debugShowcaseUrl'] ?? ''))->toEndWith('/ui-showcase/')
			->and((string) ($launcherPage['props']['debugShowcaseLabel'] ?? ''))->not->toBe('');

		// 2. UI Showcase route isolates and loads showcase + field + Tiptap bundles on demand
		$input->setUrlSegment(1, 'ui-showcase');
		$input->get->offsetUnset('sample');
		$showcaseScripts = implode("\n", $proc->getModuleScriptAssets());
		$showcaseStyles = implode("\n", $proc->getModuleStyleAssets());

		expect($proc->inertiaFullPageAdmin())->toBeTrue()
			->and($showcaseScripts)->toContain('ReactUiShowcase.js')
			->and($showcaseScripts)->toContain('SchemaForm.js')
			->and($showcaseScripts)->toContain('ReactExtraFields.js')
			->and($showcaseScripts)->toContain('ReactMedia.js')
			->and($showcaseScripts)->toContain('InputfieldReactImage.js')
			->and($showcaseScripts)->toContain('InputfieldReactFile.js')
			->and($showcaseScripts)->toContain('InputfieldReactLink.js')
			->and($showcaseScripts)->toContain('InputfieldReactRelation.js')
			->and($showcaseScripts)->toContain('MarkupReactTable.js')
			->and($showcaseScripts)->toContain('MarkupReactCards.js')
			->and($showcaseScripts)->toContain('TiptapCore.js')
			->and($showcaseScripts)->toContain('TiptapEditor.js')
			->and($showcaseStyles)->toContain('ReactMedia.css')
			->and($showcaseStyles)->toContain('TiptapCore.css');

		// 3. Query parameters pass validated props and normalize invalid section/theme to safe defaults
		$input->get->set('section', 'links');
		$input->get->set('theme', 'dark');
		$input->get->set('embed', '1');
		$showcaseHtml = (string) $proc->executeUiShowcase();
		$showcasePage = rwUiShowcaseExtractPageJson($showcaseHtml);
		$props = is_array($showcasePage['props'] ?? null) ? $showcasePage['props'] : [];

		expect($showcasePage['component'] ?? null)->toBe('ReactWorkspace/UiShowcase')
			->and($props['embedded'] ?? null)->toBeTrue()
			->and($props['initialSection'] ?? null)->toBe('links')
			->and($props['initialTheme'] ?? null)->toBe('dark')
			->and((string) ($props['sampleBaseUrl'] ?? ''))->toEndWith('?sample=');

		$input->get->set('section', 'not-a-section');
		$input->get->set('theme', 'ultraviolet');
		$input->get->set('embed', '0');
		$fallbackPage = rwUiShowcaseExtractPageJson((string) $proc->executeUiShowcase());
		$fallbackProps = is_array($fallbackPage['props'] ?? null) ? $fallbackPage['props'] : [];

		expect($fallbackProps['embedded'] ?? null)->toBeFalse()
			->and($fallbackProps['initialSection'] ?? null)->toBe('all')
			->and($fallbackProps['initialTheme'] ?? null)->toBe('auto');
	} finally {
		$config->debug = $prevDebug;
		$users->setCurrentUser($prevUser);
		$input->setUrlSegments($prevSegments);
		foreach ($prevGet as $key => $val) {
			if ($val === null) {
				$input->get->offsetUnset($key);
			} else {
				$input->get->set($key, $val);
			}
		}
	}
});

test('UI Showcase serves safe deterministic SVGs for all 6 sample variants and 404s on unknown variants', function (): void {
	bootReactForTesting();
	$pw = wire();
	$config = $pw->config;
	$users = $pw->users;
	$input = $pw->input;

	$prevUser = $users->getCurrentUser();
	$prevDebug = (bool) $config->debug;
	$prevSegments = $input->urlSegments();
	$prevSample = $input->get->offsetExists('sample') ? $input->get->get('sample') : null;

	try {
		$users->setCurrentUser(rwUiShowcaseResolveSuperuser());
		$config->debug = true;
		$input->setUrlSegment(1, 'ui-showcase');

		$proc = new ProcessReactWorkspace();
		$pw->wire($proc);
		$proc->init();

		foreach (['landscape', 'portrait', 'square', 'wide', 'avatar', 'video'] as $variant) {
			$input->get->set('sample', $variant);
			expect($proc->inertiaFullPageAdmin())->toBeFalse();
			$svg = (string) $proc->executeUiShowcase();
			expect($svg)->toContain('<svg ')
				->and($svg)->toContain('</svg>')
				->and(strtolower($svg))->not->toContain('<script');
		}

		$input->get->set('sample', 'malicious-unknown');
		expect(static fn(): string => (string) $proc->executeUiShowcase())
			->toThrow(Wire404Exception::class);
	} finally {
		$config->debug = $prevDebug;
		$users->setCurrentUser($prevUser);
		$input->setUrlSegments($prevSegments);
		if ($prevSample === null) {
			$input->get->offsetUnset('sample');
		} else {
			$input->get->set('sample', $prevSample);
		}
	}
});
