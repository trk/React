<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Fieldgroup;
use ProcessWire\HookEvent;
use ProcessWire\Page;
use ProcessWire\React;
use ProcessWire\Role;
use ProcessWire\Template;
use ProcessWire\User;
use ProcessWire\Wire;
use Totoglu\React\Security\UrlSanitizer;
use Totoglu\React\Workspace\CommandSearchRegistry;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
});

test('CommandSearchRegistry registers, unregisters, validates IDs, and orders providers deterministically', function (): void {
	$registry = new CommandSearchRegistry();
	wire()->wire($registry);

	expect($registry->has('pages'))->toBeTrue()
		->and($registry->has('nonexistent'))->toBeFalse();

	$registry->register('', static fn(): array => []);
	$registry->register('bad id!', static fn(): array => []);
	$registry->register(str_repeat('x', 65), static fn(): array => []);

	expect($registry->has(''))->toBeFalse()
		->and($registry->has('bad id!'))->toBeFalse()
		->and($registry->providerIds())->toBe(['pages']);

	$registry->register('orders', static fn(): array => [], ['order' => 200, 'label' => 'Orders']);
	$registry->register('articles', static fn(): array => [], ['order' => 50, 'label' => 'Articles']);
	$registry->register('catalog', static fn(): array => [], ['order' => 120, 'label' => 'Catalog']);

	expect($registry->providerIds())->toBe(['articles', 'catalog', 'orders', 'pages']);

	$registry->unregister('catalog');
	expect($registry->has('catalog'))->toBeFalse()
		->and($registry->providerIds())->toBe(['articles', 'orders', 'pages']);
});

test('CommandSearchRegistry enforces query bounds, provider exception isolation, sanitization, and item caps', function (): void {
	$registry = new CommandSearchRegistry();
	wire()->wire($registry);

	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superuser = wire('users')->get($superId);
	expect($superuser)->toBeInstanceOf(User::class);

	$seenQuery = '';
	$invokedOnShort = false;

	$registry->unregister('pages');

	$registry->register('throwing', static function () use (&$invokedOnShort): array {
		$invokedOnShort = true;
		throw new \RuntimeException('Simulated failing provider');
	}, ['order' => 10]);

	$registry->register('captured', static function (string $query) use (&$seenQuery, &$invokedOnShort): array {
		$invokedOnShort = true;
		$seenQuery = $query;
		$longLabel = '<b>Title</b> ' . str_repeat('A', 150);
		$longSub = '<script>x</script>' . str_repeat('B', 160);
		$longBadge = '<i>Tag</i>' . str_repeat('C', 60);

		return [
			[
				'id' => 'xss-item',
				'label' => $longLabel,
				'subtitle' => $longSub,
				'badge' => $longBadge,
				'group' => '',
				'icon' => 'INVALID_ICON!!',
				'href' => '/61admin/records/1',
				'isInertia' => true,
			],
			[
				'id' => 'bad-js',
				'label' => 'Rejected Javascript',
				'href' => 'javascript:alert(1)',
			],
			[
				'id' => 'bad-proto-rel',
				'label' => 'Rejected Protocol Relative',
				'href' => '//evil.test/steal',
			],
			[
				'id' => 'bad-data',
				'label' => 'Rejected Data URI',
				'href' => 'data:text/html,<script>alert(1)</script>',
			],
			[
				'id' => 'bad-origin',
				'label' => 'Rejected External Host',
				'href' => 'https://evil.test/login',
			],
			[
				'id' => 'non-inertia',
				'label' => 'Classic &amp; Direct',
				'subtitle' => 'Plain subtitle',
				'badge' => 'Draft',
				'group' => 'Custom Group',
				'icon' => 'archive',
				'href' => '/61admin/page/edit/?id=5',
				'isInertia' => false,
			],
		];
	}, ['order' => 20, 'label' => 'Captured Records']);

	// Queries shorter than 2 characters return [] without calling providers
	expect($registry->search('', $superuser))->toBe([])
		->and($registry->search(' ', $superuser))->toBe([])
		->and($registry->search('a', $superuser))->toBe([])
		->and($registry->search(' a ', $superuser))->toBe([])
		->and($invokedOnShort)->toBeFalse();

	// Queries exceeding 80 characters are safely truncated to 80 UTF-8 characters
	$longQuery = '   ' . str_repeat('q', 120) . '   ';
	$items = $registry->search($longQuery, $superuser);

	expect(mb_strlen($seenQuery, 'UTF-8'))->toBe(80)
		->and($items)->toHaveCount(2)
		->and($items[0]['id'])->toBe('xss-item')
		->and(mb_strlen($items[0]['label'], 'UTF-8'))->toBe(120)
		->and($items[0]['label'])->not->toContain('<b>')
		->and(mb_strlen($items[0]['subtitle'], 'UTF-8'))->toBe(140)
		->and($items[0]['subtitle'])->not->toContain('<script>')
		->and(mb_strlen($items[0]['badge'], 'UTF-8'))->toBe(40)
		->and($items[0]['badge'])->not->toContain('<i>')
		->and($items[0]['group'])->toBe('Captured Records')
		->and($items[0]['icon'])->toBe('file-text')
		->and($items[0]['isInertia'])->toBeTrue()
		->and($items[1])->toBe([
			'id' => 'non-inertia',
			'label' => 'Classic & Direct',
			'subtitle' => 'Plain subtitle',
			'badge' => 'Draft',
			'group' => 'Custom Group',
			'icon' => 'archive',
			'href' => '/61admin/page/edit/?id=5',
			'isInertia' => false,
		]);

	// Verify per-provider cap <= 5 and total cap <= 20 regardless of larger arguments
	$capRegistry = new CommandSearchRegistry();
	wire()->wire($capRegistry);
	$capRegistry->unregister('pages');

	for ($p = 1; $p <= 6; $p++) {
		$capRegistry->register('bulk-' . $p, static function () use ($p): array {
			$rows = [];
			for ($i = 1; $i <= 8; $i++) {
				$rows[] = [
					'id' => "b{$p}-{$i}",
					'label' => "Bulk {$p} Item {$i}",
					'href' => "/records/{$p}/{$i}",
				];
			}

			return $rows;
		}, ['order' => $p, 'label' => "Bulk {$p}"]);
	}

	$capped = $capRegistry->search('Bulk', $superuser, 50, 10);
	expect($capped)->toHaveCount(20);
	$bulk1Items = array_values(array_filter($capped, static fn(array $r): bool => str_starts_with($r['id'], 'b1-')));
	expect($bulk1Items)->toHaveCount(5);
});

test('UrlSanitizer::sanitizeSameOriginUrl allows same-origin relative/matching URLs and blocks unsafe schemes or hosts', function (): void {
	expect(UrlSanitizer::sanitizeSameOriginUrl('/61admin/page/edit/?id=42'))->toBe('/61admin/page/edit/?id=42')
		->and(UrlSanitizer::sanitizeSameOriginUrl('./items?a=1'))->toBe('./items?a=1')
		->and(UrlSanitizer::sanitizeSameOriginUrl('../overview'))->toBe('../overview')
		->and(UrlSanitizer::sanitizeSameOriginUrl('https://cms.example.test/admin/', 'cms.example.test', true))->toBe('https://cms.example.test/admin/')
		->and(UrlSanitizer::sanitizeSameOriginUrl('http://cms.example.test/admin/', 'cms.example.test', true))->toBe('')
		->and(UrlSanitizer::sanitizeSameOriginUrl('https://evil.test/admin/', 'cms.example.test', true))->toBe('')
		->and(UrlSanitizer::sanitizeSameOriginUrl('https://user:pass@cms.example.test/admin/', 'cms.example.test', true))->toBe('')
		->and(UrlSanitizer::sanitizeSameOriginUrl('//evil.test/hijack', 'cms.example.test', true))->toBe('')
		->and(UrlSanitizer::sanitizeSameOriginUrl('/\\evil.test/hijack'))->toBe('')
		->and(UrlSanitizer::sanitizeSameOriginUrl('javascript:alert(1)'))->toBe('')
		->and(UrlSanitizer::sanitizeSameOriginUrl('data:text/html,<script>alert(1)</script>'))->toBe('')
		->and(UrlSanitizer::sanitizeSameOriginUrl('mailto:admin@example.test'))->toBe('')
		->and(UrlSanitizer::sanitizeSameOriginUrl('tel:+15550100'))->toBe('')
		->and(UrlSanitizer::sanitizeSameOriginUrl('#fragment'))->toBe('');
});

test('CommandSearch gateway and registry enforce guest 403, permission filtering, HTTP GET, and superuser override', function (): void {
	$pw = wire();
	$users = $pw->users;
	$roles = $pw->roles;
	$permissions = $pw->permissions;
	$prevUser = $pw->user;

	$suffix = str_replace('.', '', uniqid('cmdrbac', true));
	$createdRole = null;
	$createdUser = null;
	$createdPerm = null;

	try {
		/** @var React $react */
		$react = React::instance();

		$guest = $users->getGuestUser();
		expect($react->handleCommandSearchAction(['q' => 'alpha', '_requestMethod' => 'GET'], $guest)['status'])->toBe(403)
			->and($react->commandSearch()->search('alpha', $guest))->toBe([]);

		// Synthetic authenticated user with zero roles lacks both workspace access and page-edit
		$unprivileged = new User();
		$pw->wire($unprivileged);
		$unprivileged->id = 989401;
		$unprivileged->name = 'rw-cmd-unpriv-' . $suffix;

		$prevReact = $pw->fuel->get('react');
		$isolatedReact = new React();
		$pw->wire($isolatedReact);
		$pw->fuel->set('react', $isolatedReact);
		try {
			expect($isolatedReact->handleCommandSearchAction(['q' => 'alpha', '_requestMethod' => 'GET'], $unprivileged)['status'])->toBe(403);
		} finally {
			if ($prevReact instanceof React) {
				$pw->fuel->set('react', $prevReact);
			}
		}

		// Superuser with POST gets 405 Method Not Allowed
		$superId = (int) ($pw->config->superUserPageID ?: 41);
		$superuser = $users->get($superId);
		expect($superuser)->toBeInstanceOf(User::class);

		$postRes = $react->handleCommandSearchAction(['q' => 'alpha', '_requestMethod' => 'POST'], $superuser);
		expect($postRes['ok'])->toBeFalse()
			->and($postRes['status'])->toBe(405);

		// Create persisted role + permission to test provider-level RBAC filtering
		$permName = 'rw-cmd-secret-' . $suffix;
		$createdPerm = $permissions->add($permName);
		$createdPerm->title = 'Temp Command Secret';
		$permissions->save($createdPerm);

		$createdRole = $roles->add('rw_cmd_editor_' . $suffix);
		$createdRole->addPermission('page-view');
		$createdRole->addPermission('page-edit');
		$roles->save($createdRole);

		$createdUser = $users->new([
			'name' => 'rw-cmd-editor-' . $suffix,
			'pass' => 'TestPass!12345',
		]);
		$createdUser->addRole($createdRole);
		$users->save($createdUser);

		$registry = new CommandSearchRegistry();
		$pw->wire($registry);
		$registry->unregister('pages');

		$registry->register('public-to-editors', static fn(): array => [
			['id' => 'pub-1', 'label' => 'Shared Match', 'href' => '/shared/1'],
		], ['permission' => 'page-edit', 'order' => 10]);

		$registry->register('restricted-only', static fn(): array => [
			['id' => 'sec-1', 'label' => 'Secret Match', 'href' => '/secret/1'],
		], ['permission' => $permName, 'order' => 20]);

		$editorHits = $registry->search('Match', $createdUser);
		$superHits = $registry->search('Match', $superuser);

		expect(array_column($editorHits, 'id'))->toBe(['pub-1'])
			->and(array_column($superHits, 'id'))->toBe(['pub-1', 'sec-1']);

		$gatewayEditorRes = $react->handleCommandSearchAction(['q' => '   ab   ', '_requestMethod' => 'GET'], $createdUser);
		expect($gatewayEditorRes['ok'])->toBeTrue()
			->and($gatewayEditorRes['status'])->toBe(200)
			->and($gatewayEditorRes['query'])->toBe('ab');
	} finally {
		if ($createdUser instanceof User && $createdUser->id > 0) {
			try {
				$users->delete($createdUser);
			} catch (\Throwable) {
			}
		}
		if ($createdRole instanceof Role && $createdRole->id > 0) {
			try {
				$roles->delete($createdRole);
			} catch (\Throwable) {
			}
		}
		if ($createdPerm !== null && $createdPerm->id > 0) {
			try {
				$permissions->delete($createdPerm);
			} catch (\Throwable) {
			}
		}
		if ($prevUser instanceof User && $prevUser->id > 0) {
			try {
				$users->setCurrentUser($prevUser);
			} catch (\Throwable) {
			}
		}
	}
});

test('built-in pages search provider enforces editable() per-page access and builds classic edit links', function (): void {
	$pw = wire();
	$pages = $pw->pages;
	$fields = $pw->fields;
	$fieldgroups = $pw->fieldgroups;
	$templates = $pw->templates;
	$roles = $pw->roles;
	$users = $pw->users;
	$prevUser = $pw->user;

	$suffix = str_replace('.', '', uniqid('cmdpg', true));
	$createdPages = [];
	$createdTpls = [];
	$createdFgs = [];
	$createdUser = null;
	$createdRole = null;

	try {
		$createdRole = $roles->add('rw_cmd_page_role_' . $suffix);
		$createdRole->addPermission('page-view');
		$createdRole->addPermission('page-edit');
		$roles->save($createdRole);

		$createdUser = $users->new([
			'name' => 'rw-cmd-pguser-' . $suffix,
			'pass' => 'TestPass!12345',
		]);
		$createdUser->addRole($createdRole);
		$users->save($createdUser);

		$guestRole = $roles->getGuestRole();
		$superRole = $roles->get('superuser');

		$titleField = $fields->get('title');
		$fgEditable = new Fieldgroup();
		$fgEditable->name = 'rw_cmd_fg_ed_' . $suffix;
		$fgEditable->add($titleField);
		$fieldgroups->save($fgEditable);
		$createdFgs[] = $fgEditable;

		$fgLocked = new Fieldgroup();
		$fgLocked->name = 'rw_cmd_fg_lk_' . $suffix;
		$fgLocked->add($titleField);
		$fieldgroups->save($fgLocked);
		$createdFgs[] = $fgLocked;

		$editableTpl = new Template();
		$editableTpl->name = 'rw_cmd_tpl_ed_' . $suffix;
		$editableTpl->label = 'Editable Article';
		$editableTpl->fieldgroup = $fgEditable;
		$editableTpl->useRoles = 1;
		$editableTpl->setRoles([$createdRole->id, $guestRole->id], 'view');
		$editableTpl->setRoles([$createdRole->id], 'edit');
		$templates->save($editableTpl);
		$createdTpls[] = $editableTpl;

		$lockedTpl = new Template();
		$lockedTpl->name = 'rw_cmd_tpl_lk_' . $suffix;
		$lockedTpl->label = 'Restricted Vault';
		$lockedTpl->fieldgroup = $fgLocked;
		$lockedTpl->useRoles = 1;
		$lockedTpl->setRoles([$guestRole->id], 'view');
		$lockedTpl->setRoles($superRole instanceof Role ? [$superRole->id] : [], 'edit');
		$templates->save($lockedTpl);
		$createdTpls[] = $lockedTpl;

		$home = $pages->get(1);
		$token = 'CmdProbe' . $suffix;

		$editablePage = $pages->new([
			'template' => $editableTpl,
			'parent' => $home,
			'name' => 'cmd-ed-' . $suffix,
			'title' => $token . ' Editable Item',
		]);
		$createdPages[] = $editablePage;

		$lockedPage = $pages->new([
			'template' => $lockedTpl,
			'parent' => $home,
			'name' => 'cmd-lk-' . $suffix,
			'title' => $token . ' Locked Item',
		]);
		$createdPages[] = $lockedPage;

		$registry = new CommandSearchRegistry();
		$pw->wire($registry);

		$editorResults = $registry->search($token, $createdUser);
		$adminUrl = rtrim((string) ($pw->config->urls->admin ?: '/processwire/'), '/') . '/';

		expect($editorResults)->toHaveCount(1)
			->and($editorResults[0])->toMatchArray([
				'id' => 'page-' . (int) $editablePage->id,
				'label' => $token . ' Editable Item',
				'badge' => 'Editable Article',
				'group' => 'Pages',
				'icon' => 'file-text',
				'href' => $adminUrl . 'page/edit/?id=' . (int) $editablePage->id,
				'isInertia' => false,
			]);

		$superId = (int) ($pw->config->superUserPageID ?: 41);
		$superuser = $users->get($superId);
		$superResults = $registry->search($token, $superuser);
		expect(array_column($superResults, 'id'))->toContain('page-' . (int) $editablePage->id)
			->and(array_column($superResults, 'id'))->toContain('page-' . (int) $lockedPage->id);
	} finally {
		$classesDir = rtrim((string) $pw->config->paths->classes, '/') . '/';
		foreach (array_reverse($createdPages) as $p) {
			if ($p instanceof Page && $p->id > 0) {
				try {
					$pages->delete($p, true);
				} catch (\Throwable) {
				}
			}
		}
		foreach ($createdTpls as $tpl) {
			if ($tpl instanceof Template && $tpl->id > 0) {
				$pascal = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', (string) $tpl->name)));
				try {
					$templates->delete($tpl);
				} catch (\Throwable) {
				}
				$classFile = $classesDir . $pascal . 'Page.php';
				if (is_file($classFile)) {
					unlink($classFile);
				}
			}
		}
		foreach ($createdFgs as $fg) {
			if ($fg instanceof Fieldgroup && $fg->id > 0) {
				try {
					$fieldgroups->delete($fg);
				} catch (\Throwable) {
				}
			}
		}
		if ($createdUser instanceof User && $createdUser->id > 0) {
			try {
				$users->delete($createdUser);
			} catch (\Throwable) {
			}
		}
		if ($createdRole instanceof Role && $createdRole->id > 0) {
			try {
				$roles->delete($createdRole);
			} catch (\Throwable) {
			}
		}
		if ($prevUser instanceof User && $prevUser->id > 0) {
			try {
				$users->setCurrentUser($prevUser);
			} catch (\Throwable) {
			}
		}
	}
});

test('React::deferCommandSearchRegistration and buildInertiaSharedContext expose command search lazily', function (): void {
	$pw = wire();
	$prevReact = $pw->fuel->get('react');
	$prevUser = $pw->user;

	$freshReact = new React();
	$pw->wire($freshReact);
	$pw->fuel->set('react', $freshReact);
	$pw->modules->set('React', $freshReact);

	$hookCalls = 0;
	$deferredCalls = 0;

	$hookId = $pw->addHookAfter('React::registerCommandSearch', function (HookEvent $event) use (&$hookCalls): void {
		$hookCalls++;
		$registry = $event->arguments(0);
		if ($registry instanceof CommandSearchRegistry) {
			$registry->register('hooked-provider', static fn(): array => [
				['id' => 'hk-1', 'label' => 'Hook Hit', 'href' => '/61admin/hook/1'],
			], ['order' => 40, 'label' => 'Hooked']);
		}
	});

	$helperModule = new class extends Wire {};
	$pw->wire($helperModule);

	try {
		React::deferCommandSearchRegistration($helperModule, function (CommandSearchRegistry $registry) use (&$deferredCalls): void {
			$deferredCalls++;
			$registry->register('deferred-provider', static fn(): array => [
				['id' => 'df-1', 'label' => 'Deferred Hit', 'href' => '/61admin/deferred/1'],
			], ['order' => 30, 'label' => 'Deferred']);
		});

		expect($freshReact->isCommandSearchResolved())->toBeFalse()
			->and($hookCalls)->toBe(0)
			->and($deferredCalls)->toBe(0);

		$registry = $freshReact->commandSearch();
		expect($freshReact->isCommandSearchResolved())->toBeTrue()
			->and($hookCalls)->toBe(1)
			->and($deferredCalls)->toBe(1)
			->and($registry->has('hooked-provider'))->toBeTrue()
			->and($registry->has('deferred-provider'))->toBeTrue();

		// Subsequent commandSearch() calls reuse the resolved singleton
		$freshReact->commandSearch();
		expect($hookCalls)->toBe(1)
			->and($deferredCalls)->toBe(1);

		// Calling deferCommandSearchRegistration after resolution fires immediately
		$lateModule = new class extends Wire {};
		$pw->wire($lateModule);
		$lateCalls = 0;
		React::deferCommandSearchRegistration($lateModule, function (CommandSearchRegistry $reg) use (&$lateCalls): void {
			$lateCalls++;
			$reg->register('late-provider', static fn(): array => []);
		});

		expect($lateCalls)->toBe(1)
			->and($registry->has('late-provider'))->toBeTrue();

		$superId = (int) ($pw->config->superUserPageID ?: 41);
		$superuser = $pw->users->get($superId);
		$pw->users->setCurrentUser($superuser);
		$shared = $freshReact->buildInertiaSharedContext();
		expect($shared['commandSearchEndpoint'] ?? '')->toEndWith('/_react/command-search');
	} finally {
		$pw->removeHook($hookId);
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$pw->users->setCurrentUser($prevUser);
		}
		if ($prevReact instanceof React) {
			$pw->fuel->set('react', $prevReact);
			$pw->modules->set('React', $prevReact);
		}
	}
});
