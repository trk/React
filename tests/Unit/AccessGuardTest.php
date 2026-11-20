<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\User;
use Totoglu\React\Security\AccessGuard;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
});

test('AccessGuard rejects guest, unsaved, and guest-named users and accepts real accounts', function (): void {
	$guestId = (int) (wire('config')->guestUserPageID ?: 40);
	$guest = wire('users')->get($guestId);
	expect($guest)->toBeInstanceOf(User::class)
		->and(AccessGuard::isAuthenticated($guest))->toBeFalse()
		->and(AccessGuard::isAuthenticatedOrSuperuser($guest))->toBeFalse();

	$unsaved = new User();
	wire($unsaved);
	expect(AccessGuard::isAuthenticated($unsaved))->toBeFalse();

	$guestNamed = new User();
	wire($guestNamed);
	$guestNamed->id = 987001;
	$guestNamed->name = 'guest';
	expect(AccessGuard::isAuthenticated($guestNamed))->toBeFalse();

	$editor = new User();
	wire($editor);
	$editor->id = 987002;
	$editor->name = 'rw-access-editor';
	expect(AccessGuard::isAuthenticated($editor))->toBeTrue()
		->and(AccessGuard::isAuthenticatedOrSuperuser($editor))->toBeTrue();

	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superuser = wire('users')->get($superId);
	expect($superuser)->toBeInstanceOf(User::class)
		->and(AccessGuard::isAuthenticatedOrSuperuser($superuser))->toBeTrue();
});

test('React gateways, registries, and stores delegate guest checks to AccessGuard instead of duplicating them', function (): void {
	$moduleRoot = dirname(__DIR__, 2);
	$files = [
		'React.module.php',
		'src/Form/FormSchemaSerializer.php',
		'src/Media/MediaGateway.php',
		'src/Tiptap/TiptapMediaLinkGateway.php',
		'src/Workspace/EditPresenceStore.php',
		'src/Workspace/WorkspacePreferenceStore.php',
		'src/Workspace/WorkspaceRegistry.php',
		'src/Workspace/WorkspaceWidgetRegistry.php',
	];
	foreach ($files as $file) {
		$contents = (string) file_get_contents($moduleRoot . '/' . $file);
		expect($contents)->toContain('AccessGuard::')
			->and($contents)->not->toContain('guestUserPageID');
	}
});
