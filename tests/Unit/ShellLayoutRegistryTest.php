<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\HookEvent;
use ProcessWire\React;
use ProcessWire\Wire;
use Totoglu\React\Theme\ThemePreset;
use Totoglu\React\Workspace\ShellLayout;
use Totoglu\React\Workspace\ShellLayoutRegistry;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
});

test('ShellLayout enum normalizes untrusted inputs and exposes canonical metadata', function (): void {
	expect(ShellLayout::values())->toBe(['topbar', 'sidebar'])
		->and(ShellLayout::tryFromNormalized(ShellLayout::Sidebar))->toBe(ShellLayout::Sidebar)
		->and(ShellLayout::tryFromNormalized('  SIDEBAR '))->toBe(ShellLayout::Sidebar)
		->and(ShellLayout::tryFromNormalized('Topbar'))->toBe(ShellLayout::Topbar)
		->and(ShellLayout::tryFromNormalized('unknown-layout'))->toBeNull()
		->and(ShellLayout::tryFromNormalized(123))->toBeNull()
		->and(ShellLayout::tryFromNormalized(null))->toBeNull()
		->and(ShellLayout::fromInput('sidebar'))->toBe(ShellLayout::Sidebar)
		->and(ShellLayout::fromInput('invalid'))->toBe(ShellLayout::Topbar)
		->and(ShellLayout::fromInput(null))->toBe(ShellLayout::Topbar)
		->and(ShellLayout::Topbar->label())->toBe('Top Bar')
		->and(ShellLayout::Topbar->icon())->toBe('layout-navbar')
		->and(ShellLayout::Topbar->supportsCollapse())->toBeFalse()
		->and(ShellLayout::Sidebar->label())->toBe('Sidebar')
		->and(ShellLayout::Sidebar->icon())->toBe('layout-sidebar')
		->and(ShellLayout::Sidebar->supportsCollapse())->toBeTrue();
});

test('ShellLayoutRegistry registers built-in topbar/sidebar layouts, supports custom layouts, sorts deterministically, and rejects reserved or invalid IDs', function (): void {
	$registry = new ShellLayoutRegistry();
	wire()->wire($registry);

	expect($registry->defaultId())->toBe('topbar')
		->and($registry->has('topbar'))->toBeTrue()
		->and($registry->has('SIDEBAR'))->toBeTrue()
		->and($registry->has('default'))->toBeFalse()
		->and($registry->get('topbar'))->toBe([
			'id' => 'topbar',
			'label' => 'Top Bar',
			'labelKey' => 'shell.layoutTopbar',
			'description' => 'Horizontal top navigation bar with inline workspace links and section tabs.',
			'descriptionKey' => 'shell.layoutTopbarDesc',
			'icon' => 'layout-navbar',
			'supportsCollapse' => false,
			'order' => 10,
		])
		->and($registry->get('sidebar'))->toBe([
			'id' => 'sidebar',
			'label' => 'Sidebar',
			'labelKey' => 'shell.layoutSidebar',
			'description' => 'Collapsible left navigation sidebar with module switcher and account footer.',
			'descriptionKey' => 'shell.layoutSidebarDesc',
			'icon' => 'layout-sidebar',
			'supportsCollapse' => true,
			'order' => 20,
		]);

	// Reject reserved 'default', empty strings, and invalid characters
	$registry->register('default', ['label' => 'Reserved']);
	$registry->register('', ['label' => 'Empty']);
	$registry->register('bad layout!', ['label' => 'Invalid Chars']);
	$registry->register(str_repeat('a', 41), ['label' => 'Too Long']);

	expect($registry->has('default'))->toBeFalse()
		->and($registry->has(''))->toBeFalse()
		->and($registry->has('bad layout!'))->toBeFalse()
		->and(array_keys($registry->all()))->toBe(['topbar', 'sidebar']);

	// Register custom layouts with mixed orders and verify sorting (order ASC, id ASC) + icon/entity sanitization
	$registry->register('compact_rail', [
		'label' => 'Compact &amp; Minimal',
		'labelKey' => 'custom.compactRail',
		'description' => 'Ultra-compact rail',
		'descriptionKey' => 'custom.compactRailDesc',
		'icon' => 'fa-columns',
		'supportsCollapse' => true,
		'order' => 15,
	]);
	$registry->register('alpha-dock', [
		'order' => 15,
	]);
	$registry->register('zen-canvas', [
		'label' => 'Zen Canvas',
		'order' => 5,
	]);

	expect(array_keys($registry->all()))->toBe(['zen-canvas', 'topbar', 'alpha-dock', 'compact_rail', 'sidebar'])
		->and($registry->get('compact_rail')['label'] ?? null)->toBe('Compact & Minimal')
		->and($registry->get('compact_rail')['icon'] ?? null)->toBe('columns')
		->and($registry->get('alpha-dock')['label'] ?? null)->toBe('Alpha dock')
		->and($registry->options())->toBe([
			'zen-canvas' => 'Zen Canvas',
			'topbar' => 'Top Bar',
			'alpha-dock' => 'Alpha dock',
			'compact_rail' => 'Compact & Minimal',
			'sidebar' => 'Sidebar',
		])
		->and(array_column($registry->toArray(), 'id'))->toBe(['zen-canvas', 'topbar', 'alpha-dock', 'compact_rail', 'sidebar']);
});

test('React::deferShellLayoutRegistration and React::registerShellLayouts hook execute lazily and support already-resolved instances', function (): void {
	$pw = wire();
	$prevReact = $pw->fuel->get('react');

	$freshReact = new React();
	$pw->wire($freshReact);
	$pw->fuel->set('react', $freshReact);
	$pw->modules->set('React', $freshReact);

	$hookCalls = 0;
	$deferredCalls = 0;

	$hookId = $pw->addHookAfter('React::registerShellLayouts', function (HookEvent $event) use (&$hookCalls): void {
		$hookCalls++;
		$registry = $event->arguments(0);
		if ($registry instanceof ShellLayoutRegistry) {
			$registry->register('split-pane', [
				'label' => 'Split Pane',
				'icon' => 'layout-columns',
				'order' => 30,
			]);
		}
	});

	$helperModule = new class extends Wire {};
	$pw->wire($helperModule);

	try {
		React::deferShellLayoutRegistration($helperModule, function (ShellLayoutRegistry $registry) use (&$deferredCalls): void {
			$deferredCalls++;
			$registry->register('dock-bottom', [
				'label' => 'Bottom Dock',
				'order' => 40,
			]);
		});

		// Before shellLayouts() is accessed, zero hook or registrar callbacks have run
		expect($freshReact->isShellLayoutsResolved())->toBeFalse()
			->and($hookCalls)->toBe(0)
			->and($deferredCalls)->toBe(0);

		$registry = $freshReact->shellLayouts();
		expect($freshReact->isShellLayoutsResolved())->toBeTrue()
			->and($hookCalls)->toBe(1)
			->and($deferredCalls)->toBe(1)
			->and($registry->has('split-pane'))->toBeTrue()
			->and($registry->has('dock-bottom'))->toBeTrue();

		// Subsequent shellLayouts() calls reuse the resolved singleton without re-invoking hooks
		$freshReact->shellLayouts();
		expect($hookCalls)->toBe(1)
			->and($deferredCalls)->toBe(1);

		// Calling deferShellLayoutRegistration after resolution invokes the registrar immediately
		$lateModule = new class extends Wire {};
		$pw->wire($lateModule);
		$lateCalls = 0;
		React::deferShellLayoutRegistration($lateModule, function (ShellLayoutRegistry $reg) use (&$lateCalls): void {
			$lateCalls++;
			$reg->register('late-focus', ['label' => 'Late Focus', 'order' => 50]);
		});

		expect($lateCalls)->toBe(1)
			->and($registry->has('late-focus'))->toBeTrue();
	} finally {
		$pw->removeHook($hookId);
		if ($prevReact instanceof React) {
			$pw->fuel->set('react', $prevReact);
			$pw->modules->set('React', $prevReact);
		}
	}
});

test('ThemePreset built-in palettes define distinct recessed sidebar and sidebar-accent tokens in light and dark modes', function (): void {
	$react = React::instance();
	$origPreset = $react->get('themePreset');

	try {
		foreach ([
			ThemePreset::Neutral,
			ThemePreset::Slate,
			ThemePreset::Stone,
			ThemePreset::Ocean,
			ThemePreset::Indigo,
			ThemePreset::Teal,
		] as $preset) {
			$tokens = $preset->tokens();
			expect($tokens['light'])->toHaveKey('sidebar')
				->and($tokens['light'])->toHaveKey('sidebar-accent')
				->and($tokens['dark'])->toHaveKey('sidebar')
				->and($tokens['dark'])->toHaveKey('sidebar-accent')
				->and($tokens['light']['sidebar'])->not->toBe($tokens['light']['background'])
				->and($tokens['dark']['sidebar'])->not->toBe($tokens['dark']['background'])
				->and($tokens['light']['sidebar-accent'])->not->toBe($tokens['light']['sidebar'])
				->and($tokens['dark']['sidebar-accent'])->not->toBe($tokens['dark']['sidebar']);

			$react->set('themePreset', $preset->value);
			$css = $react->theme()->resolveThemeTokenCss();
			expect($css)->toContain('--sidebar: light-dark(')
				->and($css)->toContain('--sidebar-accent: light-dark(');
		}
	} finally {
		$react->set('themePreset', $origPreset);
	}
});
