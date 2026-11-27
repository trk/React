<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\Language;
use ProcessWire\Languages;
use ProcessWire\Page;
use ProcessWire\Permission;
use ProcessWire\Role;
use ProcessWire\Template;
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

test('AccessGuard::canEditFieldByLanguage enforces page-edit-lang-* permissions and restores active user', function (): void {
	$pw = wire();
	$modules = $pw->modules;
	$fields = $pw->fields;
	$fieldgroups = $pw->fieldgroups;
	$templates = $pw->templates;
	$pages = $pw->pages;
	$users = $pw->users;
	$roles = $pw->roles;
	$permissions = $pw->permissions;
	$languages = $pw->languages;

	if (!$languages instanceof Languages || $languages->count() < 2) {
		$this->markTestSkipped('Requires LanguageSupport with at least 2 languages.');
	}

	$defaultLang = $languages->getDefault();
	$altLang = null;
	foreach ($languages as $langCandidate) {
		if ($langCandidate instanceof Language && !$langCandidate->isDefault() && $langCandidate->name !== '') {
			$altLang = $langCandidate;
			break;
		}
	}
	if (!$defaultLang instanceof Language || !$altLang instanceof Language) {
		$this->markTestSkipped('Requires default and secondary languages.');
	}

	$superId = (int) ($pw->config->superUserPageID ?: 41);
	/** @var User $superUser */
	$superUser = $users->get($superId);
	$prevUser = $users->getCurrentUser();
	$suffix = bin2hex(random_bytes(3));

	$baseField = null;
	$altField = null;
	$plainField = null;
	$langField = null;
	$fg = null;
	$tpl = null;
	$page = null;
	$role = null;
	$user = null;
	$createdPerms = [];

	try {
		$users->setCurrentUser($superUser);

		foreach (['page-edit-lang-none', 'page-edit-lang-default', 'page-edit-lang-' . $altLang->name] as $permName) {
			if (!$permissions->has($permName)) {
				$perm = $permissions->add($permName);
				$perm->save();
				$createdPerms[] = $perm;
			}
		}

		$baseField = new Field();
		$baseField->type = $modules->get('FieldtypeText');
		$baseField->name = 'ag_note_' . $suffix;
		$fields->save($baseField);

		$altField = new Field();
		$altField->type = $modules->get('FieldtypeText');
		$altField->name = 'ag_note_' . $suffix . '_' . $altLang->name;
		$fields->save($altField);

		$plainField = new Field();
		$plainField->type = $modules->get('FieldtypeText');
		$plainField->name = 'ag_plain_' . $suffix;
		$fields->save($plainField);

		$fg = new Fieldgroup();
		$fg->name = 'ag_fg_' . $suffix;
		$fg->add($fields->get('title'));
		$fg->add($baseField);
		$fg->add($altField);
		$fg->add($plainField);
		if ($modules->isInstalled('FieldtypeTextLanguage')) {
			$langField = new Field();
			$langField->type = $modules->get('FieldtypeTextLanguage');
			$langField->name = 'ag_lang_' . $suffix;
			$fields->save($langField);
			$fg->add($langField);
		}
		$fieldgroups->save($fg);

		$tpl = new Template();
		$tpl->name = 'ag_tpl_' . $suffix;
		$tpl->fieldgroup = $fg;
		$templates->save($tpl);

		$page = new Page();
		$page->template = $tpl;
		$page->parent = $pages->get(1);
		$page->name = 'ag-page-' . $suffix;
		$page->title = 'AccessGuard Page';
		$pages->save($page);

		$role = $roles->add('ag-role-' . $suffix);
		foreach (['page-view', 'page-edit', 'page-edit-lang-default'] as $pName) {
			$pObj = $permissions->get($pName);
			if ($pObj instanceof Permission && $pObj->id > 0) {
				$role->addPermission($pObj);
			}
		}
		$role->save();

		$user = $users->add('ag-user-' . $suffix);
		$user->pass = 'AgTest!123';
		$user->addRole('guest');
		$user->addRole($role);
		$user->save();

		$refPerms = new \ReflectionProperty($languages, 'pageEditPermissions');
		$refEditable = new \ReflectionProperty($languages, 'editableCache');
		$refPerms->setValue($languages, null);
		$refEditable->setValue($languages, []);

		// Superuser can edit every field
		expect(AccessGuard::canEditFieldByLanguage($pw, $page, $plainField, $superUser))->toBeTrue();

		// FieldtypeLanguageInterface bypasses single-lang gate for non-superuser
		if ($langField instanceof Field) {
			expect(AccessGuard::canEditFieldByLanguage($pw, $page, $langField, $user))->toBeTrue();
		}

		// User has page-edit-lang-default, lacks page-edit-lang-{alt} and page-edit-lang-none
		expect(AccessGuard::canEditFieldByLanguage($pw, $page, $baseField, $user))->toBeTrue()
			->and(AccessGuard::canEditFieldByLanguage($pw, $page, $altField, $user))->toBeFalse()
			->and(AccessGuard::canEditFieldByLanguage($pw, $page, $plainField, $user))->toBeFalse()
			->and((int) $pw->user->id)->toBe((int) $superUser->id);

		// Grant page-edit-lang-none and page-edit-lang-{alt} -> both become editable
		foreach (['page-edit-lang-none', 'page-edit-lang-' . $altLang->name] as $grantName) {
			$grantPerm = $permissions->get($grantName);
			if ($grantPerm instanceof Permission && $grantPerm->id > 0) {
				$role->addPermission($grantPerm);
			}
		}
		$role->save();
		$pages->uncacheAll();
		$user = $users->get((int) $user->id);
		$refPerms->setValue($languages, null);
		$refEditable->setValue($languages, []);

		expect(AccessGuard::canEditFieldByLanguage($pw, $page, $altField, $user))->toBeTrue()
			->and(AccessGuard::canEditFieldByLanguage($pw, $page, $plainField, $user))->toBeTrue();
	} finally {
		$users->setCurrentUser($superUser);
		if ($page instanceof Page && $page->id > 0) {
			try { $pages->delete($page, true); } catch (\Throwable) {}
		}
		if ($user instanceof User && $user->id > 0) {
			try { $users->delete($user, true); } catch (\Throwable) {}
		}
		if ($role instanceof Role && $role->id > 0) {
			try { $roles->delete($role); } catch (\Throwable) {}
		}
		foreach ($createdPerms as $perm) {
			if ($perm instanceof Permission && $perm->id > 0) {
				try { $permissions->delete($perm); } catch (\Throwable) {}
			}
		}
		$refPerms = new \ReflectionProperty($languages, 'pageEditPermissions');
		$refEditable = new \ReflectionProperty($languages, 'editableCache');
		$refPerms->setValue($languages, null);
		$refEditable->setValue($languages, []);
		if ($tpl instanceof Template && $tpl->id > 0) {
			try { $templates->delete($tpl); } catch (\Throwable) {}
		}
		if ($fg instanceof Fieldgroup && $fg->id > 0) {
			try { $fieldgroups->delete($fg); } catch (\Throwable) {}
		}
		foreach ([$langField, $altField, $baseField, $plainField] as $fld) {
			if ($fld instanceof Field && $fld->id > 0) {
				try { $fields->delete($fld); } catch (\Throwable) {}
			}
		}
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
	}
});
