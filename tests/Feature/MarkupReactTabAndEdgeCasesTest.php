<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\InputfieldCheckbox;
use ProcessWire\InputfieldReactLink;
use ProcessWire\InputfieldText;
use ProcessWire\InputfieldTiptap;
use ProcessWire\MarkupReactTab;
use ProcessWire\MarkupReactTable;
use ProcessWire\Page;
use ProcessWire\React;
use ProcessWire\Template;
use ProcessWire\User;
use ProcessWire\WireInputData;
use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Viewport\ReactViewPreferenceStore;
use Totoglu\React\Workspace\EditPresenceStore;
use Totoglu\React\Workspace\WorkspacePreferenceStore;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	$this->previousUser = \ProcessWire\wire()->user;
	$superuser = \ProcessWire\wire()->users->get((int) \ProcessWire\wire()->config->superUserPageID);
	if ($superuser && $superuser->id) {
		\ProcessWire\wire()->users->setCurrentUser($superuser);
	}
	$this->cleanupPages = [];
	$this->cleanupTemplates = [];
	$this->cleanupFieldgroups = [];
	$this->cleanupFields = [];
	$this->cleanupFiles = [];
	$this->cleanupDirs = [];
});

afterEach(function (): void {
	$pages = \ProcessWire\wire()->pages;
	$templates = \ProcessWire\wire()->templates;
	$fieldgroups = \ProcessWire\wire()->fieldgroups;
	$fields = \ProcessWire\wire()->fields;
	$files = \ProcessWire\wire()->files;
	$classesDir = rtrim((string) \ProcessWire\wire()->config->paths->classes, '/') . '/';

	foreach (array_reverse($this->cleanupPages ?? []) as $page) {
		if ($page instanceof Page && $page->id) {
			try {
				$pages->delete($page, true);
			} catch (\Throwable) {
			}
		}
	}
	foreach (array_reverse($this->cleanupTemplates ?? []) as $tpl) {
		if ($tpl instanceof Template && $tpl->id) {
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
	foreach (array_reverse($this->cleanupFieldgroups ?? []) as $fg) {
		if ($fg instanceof Fieldgroup && $fg->id) {
			try {
				$fieldgroups->delete($fg);
			} catch (\Throwable) {
			}
		}
	}
	foreach (array_reverse($this->cleanupFields ?? []) as $field) {
		if ($field instanceof Field && $field->id) {
			try {
				$fields->delete($field);
			} catch (\Throwable) {
			}
		}
	}
	foreach ($this->cleanupFiles ?? [] as $filePath) {
		if (is_string($filePath) && is_file($filePath)) {
			@unlink($filePath);
		}
	}
	foreach ($this->cleanupDirs ?? [] as $dirPath) {
		if (is_string($dirPath) && is_dir($dirPath)) {
			try {
				$files->rmdir($dirPath, true);
			} catch (\Throwable) {
			}
		}
	}
	if (isset($this->previousUser) && $this->previousUser instanceof User && $this->previousUser->id > 0) {
		try {
			\ProcessWire\wire()->users->setCurrentUser($this->previousUser);
		} catch (\Throwable) {
		}
	}
});

test('MarkupReactTab configures panes, counts nested errors, skips unloaded lazy panes on processInput, and exposes typed config fields', function (): void {
	$modules = \ProcessWire\wire()->modules;

	/** @var MarkupReactTab $tabs */
	$tabs = new MarkupReactTab();
	\ProcessWire\wire($tabs);
	$tabs->init();
	$tabs->configure(
		[
			['name' => 'general', 'label' => 'General <Info>', 'icon' => 'file-text', 'badge' => '3'],
			['name' => 'advanced', 'label' => 'Advanced Settings', 'lazyLoad' => true],
		],
		[
			'id' => 'e2e_edge_tabs',
			'name' => 'e2e_edge_tabs',
			'variant' => 'segmented',
			'activeTab' => 'general',
		],
	);

	expect($tabs->isEmpty())->toBeFalse()
		->and($tabs->hasTabChildren())->toBeTrue();

	$panes = iterator_to_array($tabs->children());
	expect($panes)->toHaveCount(2);

	/** @var MarkupReactTab $generalPane */
	$generalPane = $panes[0];
	/** @var MarkupReactTab $advancedPane */
	$advancedPane = $panes[1];

	/** @var InputfieldText $titleInput */
	$titleInput = $modules->get('InputfieldText');
	$titleInput->attr('name', 'tab_title');
	$titleInput->val('Initial Title');
	$generalPane->add($titleInput);

	/** @var InputfieldText $secretInput */
	$secretInput = $modules->get('InputfieldText');
	$secretInput->attr('name', 'tab_secret');
	$secretInput->val('Preserved Secret');
	$secretInput->error('Validation warning on advanced tab');
	$advancedPane->add($secretInput);

	expect($generalPane->countErrors())->toBe(0)
		->and($advancedPane->countErrors())->toBe(1)
		->and($tabs->countErrors())->toBe(1);

	// Unloaded lazy pane (`pw_tab_lazy_e2e_edge_tabs__advanced = '1'`) must NOT overwrite `tab_secret` with empty input!
	$rawUnloadedPost = [
		'tab_title' => 'Updated General Title',
		'pw_tab_lazy_e2e_edge_tabs__general' => '0',
		'pw_tab_lazy_e2e_edge_tabs__advanced' => '1',
	];
	$postData = new WireInputData($rawUnloadedPost);
	$tabs->processInput($postData);

	expect($titleInput->val())->toBe('Updated General Title')
		->and($secretInput->val())->toBe('Preserved Secret')
		->and($advancedPane->get('_pwTabUnloaded'))->toBeTrue();

	// Once hydrated (`pw_tab_lazy_e2e_edge_tabs__advanced = '0'`), `tab_secret` updates normally
	$rawHydratedPost = [
		'tab_title' => 'Updated General Title',
		'tab_secret' => 'Updated Secret Value',
		'pw_tab_lazy_e2e_edge_tabs__general' => '0',
		'pw_tab_lazy_e2e_edge_tabs__advanced' => '0',
	];
	$hydratedPost = new WireInputData($rawHydratedPost);
	$tabs->processInput($hydratedPost);
	expect($secretInput->val())->toBe('Updated Secret Value')
		->and($advancedPane->get('_pwTabUnloaded'))->toBeFalse();

	// Forged lazy marker on a pane with lazyLoad=false is ignored, and empty required fields inside unloaded lazy panes cannot bypass validation
	$generalPane->set('lazyLoad', false);
	$rawForgedEager = [
		'tab_title' => 'Eagerly Updated',
		'pw_tab_lazy_e2e_edge_tabs__general' => '1',
		'pw_tab_lazy_e2e_edge_tabs__advanced' => '1',
	];
	$forgedEagerPost = new WireInputData($rawForgedEager);
	$tabs->processInput($forgedEagerPost);
	expect($titleInput->val())->toBe('Eagerly Updated');

	/** @var InputfieldText $emptyRequired */
	$emptyRequired = $modules->get('InputfieldText');
	$emptyRequired->attr('name', 'tab_mandatory_empty');
	$emptyRequired->required = true;
	$emptyRequired->val('');
	$advancedPane->add($emptyRequired);

	$rawEmptyReqPost = [
		'tab_title' => 'Eagerly Updated',
		'pw_tab_lazy_e2e_edge_tabs__advanced' => '1',
	];
	$tabs->processInput(new WireInputData($rawEmptyReqPost));
	expect($emptyRequired->getErrors(true))->not->toBe([]);

	// Verify Inertia prop serialization & HTML island rendering escape angle brackets safely
	$prop = $tabs->toInertiaProp();
	expect($prop['component'])->toBe('MarkupReactTab')
		->and($prop['props']['variant'])->toBe('segmented')
		->and($prop['props']['panes'])->toHaveCount(2);

	$html = $tabs->render();
	expect($html)->toContain('data-inertia-island="MarkupReactTab"')
		->not->toContain('<Info>');

	// Verify getConfigInputfields sets integer autocheck=1 on lazyLoad checkbox
	$cfgFields = $tabs->getConfigInputfields();
	$lazyCfg = $cfgFields->getChildByName('lazyLoad');
	expect($lazyCfg)->toBeInstanceOf(InputfieldCheckbox::class)
		->and($lazyCfg->autocheck)->toBe(1);
});

test('PageLinkMediaHostAdapter executes live upload and image rotation via MediaGateway without Pagefiles::save crash', function (): void {
	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$tmpDir = sys_get_temp_dir() . '/rw_link_gw_' . $suffix;
	mkdir($tmpDir, 0777, true);
	$this->cleanupDirs[] = $tmpDir;

	$linkField = new Field();
	$linkField->type = \ProcessWire\wire()->modules->get('FieldtypeText');
	$linkField->name = 'rw_edge_link_' . $suffix;
	$linkField->set('inputfieldClass', 'InputfieldReactLink');
	$linkField->set('linkTypes', ['page', 'url', 'file', 'image']);
	$linkField->set('mediaProfiles', "file: pdf txt\nimage: png jpg webp");
	\ProcessWire\wire()->fields->save($linkField);
	$this->cleanupFields[] = $linkField;

	$fg = new Fieldgroup();
	$fg->name = 'rw_tpl_link_gw_' . $suffix;
	$fg->add('title');
	$fg->add($linkField);
	\ProcessWire\wire()->fieldgroups->save($fg);
	$this->cleanupFieldgroups[] = $fg;

	$tpl = new Template();
	$tpl->name = $fg->name;
	$tpl->fieldgroup = $fg;
	\ProcessWire\wire()->templates->save($tpl);
	$this->cleanupTemplates[] = $tpl;

	$page = new Page();
	$page->template = $tpl;
	$page->parent = \ProcessWire\wire()->pages->get(1);
	$page->name = 'rw-link-gw-' . $suffix;
	$page->title = 'Link Media Host';
	$page->save();
	$this->cleanupPages[] = $page;

	/** @var InputfieldReactLink $inputfield */
	$inputfield = $linkField->getInputfield($page);
	expect($inputfield)->toBeInstanceOf(InputfieldReactLink::class);

	$serializer = new FormSchemaSerializer();
	\ProcessWire\wire($serializer);
	$serializedNode = $serializer->serializeInputfieldNode($inputfield);
	$imageMediaToken = (string) ($serializedNode['linkConfig']['mediaProfiles']['image']['mediaToken'] ?? '');
	expect($imageMediaToken)->not->toBe('');

	// Create valid 160x120 PNG
	$pngPath = $tmpDir . '/banner.png';
	$im = imagecreatetruecolor(160, 120);
	$fill = imagecolorallocate($im, 25, 110, 210);
	imagefilledrectangle($im, 0, 0, 160, 120, $fill);
	imagepng($im, $pngPath);

	$gateway = React::instance()->media();
	$uploadRes = $gateway->handleAction(
		['action' => 'upload', 'mediaToken' => $imageMediaToken],
		false,
		\ProcessWire\wire()->user,
		[
			'files' => [
				'name' => ['banner.png'],
				'type' => ['image/png'],
				'tmp_name' => [$pngPath],
				'error' => [UPLOAD_ERR_OK],
				'size' => [filesize($pngPath)],
			],
		],
	);

	expect($uploadRes['ok'])->toBeTrue((string) json_encode($uploadRes))
		->and($uploadRes['status'])->toBe(200)
		->and($uploadRes['items'])->toHaveCount(1)
		->and($uploadRes['items'][0]['width'])->toBe(160)
		->and($uploadRes['items'][0]['height'])->toBe(120);

	$uploadedHash = (string) $uploadRes['items'][0]['hash'];

	// Rotate 90 degrees via MediaGateway -> persists cleanly via PageLinkMediaHostAdapter::persistPagefiles
	$rotateRes = $gateway->handleAction(
		[
			'action' => 'transform',
			'operation' => 'rotate',
			'degrees' => 90,
			'targetHash' => $uploadedHash,
			'mediaToken' => $imageMediaToken,
		],
		false,
		\ProcessWire\wire()->user,
	);

	expect($rotateRes['ok'])->toBeTrue((string) json_encode($rotateRes))
		->and($rotateRes['item']['width'])->toBe(120)
		->and($rotateRes['item']['height'])->toBe(160);
});

test('cross-endpoint HMAC tokens cannot be replayed across viewport, relation, and media gateways', function (): void {
	$workspace = React::instance();
	$currentUser = \ProcessWire\wire()->user;

	/** @var MarkupReactTable $table */
	$table = $workspace->viewport('table')->configure([
		['id' => '1', 'title' => 'Alpha'],
	]);
	$viewportToken = $table->signViewportState();

	$relationToken = $workspace->relationSigner()->sign([
		'resource' => 'template',
		'cardinality' => 'm2o',
	], (int) $currentUser->id);

	$mediaToken = $workspace->media()->sign([
		'kind' => 'page',
		'isImage' => false,
		'pageId' => 1,
		'fieldName' => 'nonexistent_field',
		'inputName' => 'nonexistent_field',
	], (int) $currentUser->id);

	// Replay relationToken & mediaToken against /_react/viewport
	$vpFromRel = $workspace->handleViewportAction(['action' => 'refresh', 'stateToken' => $relationToken], false);
	$vpFromMedia = $workspace->handleViewportAction(['action' => 'refresh', 'stateToken' => $mediaToken], false);
	expect($vpFromRel['status'])->toBeGreaterThanOrEqual(400)
		->and($vpFromMedia['status'])->toBeGreaterThanOrEqual(400);

	// Replay viewportToken & mediaToken against /_react/relation
	$relFromVp = $workspace->handleRelationAction(['action' => 'search', 'relationToken' => $viewportToken], false);
	$relFromMedia = $workspace->handleRelationAction(['action' => 'search', 'relationToken' => $mediaToken], false);
	expect($relFromVp['ok'])->toBeFalse()
		->and($relFromMedia['ok'])->toBeFalse();

	// Replay viewportToken & relationToken against /_react/media
	$medFromVp = $workspace->media()->handleAction(['action' => 'upload', 'mediaToken' => $viewportToken], false, $currentUser);
	$medFromRel = $workspace->media()->handleAction(['action' => 'upload', 'mediaToken' => $relationToken], false, $currentUser);
	expect($medFromVp['ok'])->toBeFalse()
		->and($medFromVp['status'])->toBeGreaterThanOrEqual(400)
		->and($medFromRel['ok'])->toBeFalse()
		->and($medFromRel['status'])->toBeGreaterThanOrEqual(400);
});

test('preference and presence stores self-heal corrupted JSON cache files and InputfieldTiptap::set chains fluently', function (): void {
	$cacheBase = \ProcessWire\wire()->config->paths->cache . 'React/';
	$prefsDir = $cacheBase . 'workspaces/';
	if (!is_dir($prefsDir)) {
		mkdir($prefsDir, 0777, true);
	}

	// 1. Corrupted WorkspacePreferenceStore JSON file self-heals to clean defaults
	$fakeUserId = 99887766;
	$corruptPrefsFile = $prefsDir . $fakeUserId . '.json';
	file_put_contents($corruptPrefsFile, '{broken-json-payload');
	$this->cleanupFiles[] = $corruptPrefsFile;

	$fakeUser = new User();
	\ProcessWire\wire($fakeUser);
	$fakeUser->id = $fakeUserId;

	$prefStore = new WorkspacePreferenceStore();
	\ProcessWire\wire($prefStore);
	$loadedPrefs = $prefStore->load($fakeUser);
	expect($loadedPrefs)->toBeArray()
		->and($loadedPrefs['favorites'] ?? [])->toBe([]);

	// 2. Corrupted EditPresenceStore JSON lock file self-heals on heartbeat
	$presenceDir = $cacheBase . 'presence/';
	if (!is_dir($presenceDir)) {
		mkdir($presenceDir, 0777, true);
	}
	$resourceKey = 'edge:corrupt:' . bin2hex(random_bytes(4));
	$presenceFile = $presenceDir . hash('sha256', $resourceKey) . '.json';
	file_put_contents($presenceFile, "\xFF\xFE{not-utf8-json");
	$this->cleanupFiles[] = $presenceFile;

	$presenceStore = new EditPresenceStore();
	\ProcessWire\wire($presenceStore);
	$snapshot = $presenceStore->heartbeat($resourceKey, $fakeUser, 'tab_abc');
	expect($snapshot['resourceKey'])->toBe($resourceKey)
		->and($snapshot['coEditors'])->toBe([]);

	// 3. ReactViewPreferenceStore saves, loads, and deletes presets cleanly
	/** @var MarkupReactTable $table */
	$vpComponentId = 'edge_vp_prefs_' . bin2hex(random_bytes(3));
	$table = React::instance()->viewport('table')->configure(
		[['id' => '1', 'title' => 'Item']],
		['componentId' => $vpComponentId],
	);
	$table->searchQuery = 'pending';
	$viewStore = new ReactViewPreferenceStore();
	\ProcessWire\wire($viewStore);
	try {
		$viewStore->savePreset($table, 'Active Records!', 'Active Records');
		$saved = $viewStore->load($table);
		expect($saved['activeView'] ?? '')->toBe('saved:active_records_')
			->and($saved['savedViews']['active_records_']['searchQuery'] ?? '')->toBe('pending');

		$viewStore->deletePreset($table, 'saved:active_records_');
		$afterDelete = $viewStore->load($table);
		expect($afterDelete['activeView'] ?? '')->toBe('all')
			->and($afterDelete['savedViews'] ?? [])->toBe([]);
	} finally {
		$metaUser = \ProcessWire\wire()->user;
		if ($metaUser->isLoggedin()) {
			$metaUser->meta()->remove('react_view_prefs_' . $vpComponentId);
		}
		\ProcessWire\wire()->session->removeFor('ReactViewPrefs', $vpComponentId);
	}

	// 4. InputfieldTiptap::set() returns $this (InputfieldTiptap) cleanly
	$tiptap = new InputfieldTiptap();
	\ProcessWire\wire($tiptap);
	$tiptap->init();
	expect($tiptap->set('height', 360))->toBe($tiptap)
		->and($tiptap->get('height'))->toBe(360);
});
