<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\InputfieldForm;
use ProcessWire\InputfieldPassword;
use ProcessWire\InputfieldReactIcon;
use ProcessWire\InputfieldReactLink;
use ProcessWire\InputfieldText;
use ProcessWire\InputfieldTiptap;
use ProcessWire\Language;
use ProcessWire\Languages;
use ProcessWire\Page;
use ProcessWire\Pagefiles;
use ProcessWire\Pageimage;
use ProcessWire\Pageimages;
use ProcessWire\Permission;
use ProcessWire\React;
use ProcessWire\Role;
use ProcessWire\Template;
use ProcessWire\User;
use ProcessWire\WireDatabaseException;
use ProcessWire\WireException;
use ProcessWire\WireFilesException;
use ProcessWire\WireInputData;
use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Data\ReactPageResult;
use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Icon\IconManager;
use Totoglu\React\Inertia\EmbeddedAdminPageResponse;
use Totoglu\React\Media\MediaGateway;
use Totoglu\React\Media\MediaHostAdapterInterface;
use Totoglu\React\Media\PageLinkMediaHostAdapter;
use Totoglu\React\Media\UploadedFileValidator;
use Totoglu\React\Provider\PagesDataProvider;
use Totoglu\React\Security\AccessGuard;
use Totoglu\React\Security\SignedTokenCodec;
use Totoglu\React\Security\UrlSanitizer;
use Totoglu\React\Tiptap\TiptapMediaLinkGateway;
use Totoglu\React\Workspace\WorkspacePreferenceStore;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
});

test('UploadedFileValidator, MediaGateway staging, and UrlSanitizer block polyglot/XSS SVG and decompression bombs', function (): void {
	$validator = new UploadedFileValidator();
	wire($validator);

	$tmpDir = sys_get_temp_dir() . '/rw-upload-sec-' . bin2hex(random_bytes(4));
	mkdir($tmpDir, 0775, true);

	try {
		// 1. HTML / script MIME masquerading as .png
		$fakePng = $tmpDir . '/evil.png';
		file_put_contents($fakePng, "<!DOCTYPE html><html><script>alert(1)</script></html>");
		expect($validator->validate($fakePng, 'png', true, true))->not->toBeNull();

		// 2. Raster bomb: PNG header claiming 20000 x 1000 dimensions (> MAX_RASTER_AXIS 16384)
		$bombPng = $tmpDir . '/bomb.png';
		$ihdr = pack('N2C5', 20000, 1000, 8, 2, 0, 0, 0);
		$pngBytes = "\x89PNG\r\n\x1a\n"
			. pack('N', 13) . 'IHDR' . $ihdr . pack('N', crc32('IHDR' . $ihdr))
			. pack('N', 0) . 'IEND' . pack('N', crc32('IEND'));
		file_put_contents($bombPng, $pngBytes);
		expect($validator->validate($bombPng, 'png', true, true))->not->toBeNull();

		// 3. Valid tiny 1x1 PNG passes cleanly
		$validPng = $tmpDir . '/ok.png';
		$png1x1 = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', true);
		file_put_contents($validPng, (string) $png1x1);
		expect($validator->validate($validPng, 'png', true, true))->toBeNull();

		// 4. SVG attack variants blocked by DOMDocument validator
		$evilSvgs = [
			'doctype' => '<!DOCTYPE svg [<!ENTITY xxe "test">]><svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>',
			'pi' => '<?xml-stylesheet href="http://evil.example/x.xsl"?><svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>',
			'script' => '<svg xmlns="http://www.w3.org/2000/svg"><svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script></svg>',
			'foreignObject' => '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">xss</div></foreignObject></svg>',
			'handler' => '<svg xmlns="http://www.w3.org/2000/svg"><handler>alert(1)</handler></svg>',
			'styleTag' => '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.example/a.css);</style></svg>',
			'onAttr' => '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="5"/></svg>',
			'animateHref' => '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" to="javascript:alert(1)"/></svg>',
			'externalHref' => '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/sprite.svg#a"/></svg>',
		];
		foreach ($evilSvgs as $case => $markup) {
			$svgPath = $tmpDir . "/{$case}.svg";
			file_put_contents($svgPath, $markup);
			expect($validator->validate($svgPath, 'svg', true, true))
				->not->toBeNull("Failed to block SVG attack case: {$case}");
		}

		// 5. Benign SVG passes cleanly
		$cleanSvg = $tmpDir . '/clean.svg';
		file_put_contents($cleanSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12h16"/></svg>');
		expect($validator->validate($cleanSvg, 'svg', true, true))->toBeNull();

		// 6. UrlSanitizer::sanitizeImageSrc blocks namespaced SVG and handler/style payloads
		expect(UrlSanitizer::sanitizeImageSrc('data:image/svg+xml,' . rawurlencode('<svg><svg:script>alert(1)</svg:script></svg>')))->toBe('')
			->and(UrlSanitizer::sanitizeImageSrc('data:image/svg+xml,' . rawurlencode('<svg><handler>x</handler></svg>')))->toBe('')
			->and(UrlSanitizer::sanitizeImageSrc('data:image/svg+xml,' . rawurlencode('<svg><style>*{}</style></svg>')))->toBe('');
	} finally {
		foreach (glob($tmpDir . '/*') ?: [] as $f) {
			if (is_file($f)) {
				unlink($f);
			}
		}
		if (is_dir($tmpDir)) {
			rmdir($tmpDir);
		}
	}
});

test('SignedTokenCodec separates keys by domain and ReactGatewayRouter enforces signed presenceToken and safe error masking', function (): void {
	/** @var React $react */
	$react = wire('react');
	$codec = new SignedTokenCodec();
	wire($codec);

	$vpToken = $codec->encode(['uid' => 41, 'k' => 'v'], 'viewport');
	expect($codec->decode($vpToken, 41, SignedTokenCodec::DEFAULT_TTL, 'viewport'))->toBeArray()
		->and($codec->decode($vpToken, 41, SignedTokenCodec::DEFAULT_TTL, 'relation'))->toBeNull()
		->and($codec->decode($vpToken, 41, SignedTokenCodec::DEFAULT_TTL, 'presence'))->toBeNull();

	$superId = (int) (wire('config')->superUserPageID ?: 41);
	/** @var User $superUser */
	$superUser = wire('users')->get($superId);

	// Missing presenceToken -> 403
	$missingTokRes = $react->handlePresenceAction([
		'_requestMethod' => 'POST',
		'action' => 'heartbeat',
		'resourceKey' => 'page:1',
		'clientId' => 'c1',
	], false, $superUser);
	expect($missingTokRes['ok'])->toBeFalse()->and($missingTokRes['status'])->toBe(403);

	// Forged / mismatched resourceKey -> 403
	$tokReadOnly = $react->issuePresenceToken('page:1', false, $superUser);
	$mismatchRes = $react->handlePresenceAction([
		'_requestMethod' => 'POST',
		'action' => 'heartbeat',
		'resourceKey' => 'page:2',
		'presenceToken' => $tokReadOnly,
		'clientId' => 'c1',
	], false, $superUser);
	expect($mismatchRes['ok'])->toBeFalse()->and($mismatchRes['status'])->toBe(403);

	// action=saved denied when token has canMarkSaved=false
	$savedDeniedRes = $react->handlePresenceAction([
		'_requestMethod' => 'POST',
		'action' => 'saved',
		'resourceKey' => 'page:1',
		'presenceToken' => $tokReadOnly,
		'clientId' => 'c1',
	], false, $superUser);
	expect($savedDeniedRes['ok'])->toBeFalse()->and($savedDeniedRes['status'])->toBe(403);

	// Valid presenceToken with canMarkSaved=true succeeds cleanly
	$tokWritable = $react->issuePresenceToken('page:1', true, $superUser);
	$okRes = $react->handlePresenceAction([
		'_requestMethod' => 'POST',
		'action' => 'saved',
		'resourceKey' => 'page:1',
		'presenceToken' => $tokWritable,
		'clientId' => 'c1',
	], false, $superUser);
	expect($okRes['ok'])->toBeTrue()->and($okRes['status'])->toBe(200);

	// clean up presence file created for page:1
	$react->presence()->leave('page:1', $superUser, 'c1');

	// Non-debug gateway exception masking excludes WireDatabaseException / WireFilesException
	$prevDebug = (bool) wire('config')->debug;
	wire('config')->debug = false;
	$isolatedReact = new React();
	wire($isolatedReact);
	$isolatedReact->relations()->register(new class extends \Totoglu\React\Relation\Resource\AbstractRelationResource {
		public function name(): string { return 'rw_boom_probe'; }
		public function label(): string { return 'Boom Probe'; }
		public function icon(): string { return 'alert-circle'; }
		public function defaultValueField(): string { return 'id'; }
		public function count(array $options = []): int { return 0; }
		public function query(array $params = [], array $options = []): array
		{
			$q = (string) ($params['q'] ?? '');
			if ($q === 'db') {
				throw new WireDatabaseException('SELECT * FROM users_secret');
			}
			if ($q === 'file') {
				throw new WireFilesException('/var/www/secret/path');
			}
			throw new WireException('Friendly domain validation error');
		}
		public function hydrate(array $values, array $options = []): array { return []; }
	});
	try {
		$boomTok = $isolatedReact->relationSigner()->sign(['cardinality' => 'm2o', 'resource' => 'rw_boom_probe'], $superId);
		$dbRes = $isolatedReact->handleRelationAction([
			'_requestMethod' => 'POST',
			'action' => 'search',
			'relationToken' => $boomTok,
			'q' => 'db',
		], false, $superUser);
		$fileRes = $isolatedReact->handleRelationAction([
			'_requestMethod' => 'POST',
			'action' => 'search',
			'relationToken' => $boomTok,
			'q' => 'file',
		], false, $superUser);
		$domainRes = $isolatedReact->handleRelationAction([
			'_requestMethod' => 'POST',
			'action' => 'search',
			'relationToken' => $boomTok,
			'q' => 'domain',
		], false, $superUser);

		expect((string) ($dbRes['error'] ?? ''))->not->toContain('users_secret')
			->and((string) ($fileRes['error'] ?? ''))->not->toContain('/var/www/secret')
			->and((string) ($domainRes['error'] ?? ''))->toBe('Friendly domain validation error');
	} finally {
		wire('config')->debug = $prevDebug;
	}

	// RelationResourceRegistry::hydrateMorphTokens fails closed when allowedResources is empty
	expect($react->relations()->hydrateMorphTokens(['page:1'], []))->toBe([]);
});

test('FormSchemaSerializer redacts InputfieldPassword and emits signed presenceToken; PagesDataProvider enforces RBAC and redaction', function (): void {
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	/** @var User $superUser */
	$superUser = wire('users')->get($superId);
	$prevUser = wire('user');
	wire('users')->setCurrentUser($superUser);
	try {
		/** @var InputfieldForm $form */
		$form = new InputfieldForm();
		wire($form);
		/** @var InputfieldPassword $pass */
		$pass = wire('modules')->get('InputfieldPassword');
		$pass->attr('name', 'api_secret_pass');
		$pass->label = 'API Password';
		$pass->attr('value', 'SuperSecret123!');
		$form->add($pass);

		$serializer = new FormSchemaSerializer();
		wire($serializer);
		$schema = $serializer->serialize($form, [
			'presenceKey' => 'record:99',
			'canMarkSaved' => true,
		]);

		expect($schema['presenceKey'] ?? null)->toBe('record:99')
			->and($schema['presenceToken'] ?? '')->not->toBe('')
			->and($schema['fields'][0]['inputType'] ?? null)->toBe('password')
			->and($schema['fields'][0]['isSecret'] ?? null)->toBeTrue()
			->and($schema['fields'][0]['secretMasked'] ?? null)->toBeTrue()
			->and($schema['fields'][0]['value'] ?? null)->toBe('')
			->and($schema['fields'][0]['defaultValue'] ?? null)->toBe('');

		// Non-superuser export cap and PagesDataProvider::mutate() RBAC / of() restoration
		$pagesProvider = new PagesDataProvider('template=home', []);
		wire($pagesProvider);
		$refMaxScan = new \ReflectionMethod($pagesProvider, 'export');
		expect($refMaxScan->isPublic())->toBeTrue();

		// Protected system page mutation blocked (root id=1 and adminRootPageID publish/trash/delete)
		$adminRootId = (string) (wire('config')->adminRootPageID ?: 2);
		expect($pagesProvider->mutate('trash', ['1', $adminRootId]))->toBe(0);
	} finally {
		if ($prevUser instanceof User && $prevUser->id > 0) {
			wire('users')->setCurrentUser($prevUser);
		}
	}
});

test('TiptapMediaLinkGateway enforces projected resize bounds and PageResourceAdapter rejects numeric template IDs and family mismatches', function (): void {
	/** @var React $react */
	$react = wire('react');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	/** @var User $superUser */
	$superUser = wire('users')->get($superId);

	// 1. PageResourceAdapter quickCreate rejects numeric template IDs
	$adapter = $react->relations()->get('page');
	expect(static fn () => $adapter->quickCreate([
		'title' => 'Test Numeric Tpl',
		'parentId' => 1,
		'template' => '1',
	], ['creatable' => true], $superUser))->toThrow(\ProcessWire\WireException::class);

	// 2. TiptapMediaLinkGateway resize rejects dimensions exceeding MAX_RASTER_AXIS (16384) with 422 before creating variation
	$home = wire('pages')->get(1);
	$tiptapToken = $react->tiptap()->sign([
		'pageId' => (int) $home->id,
		'urlType' => 'relative',
	], $superId);

	$resizeSuffix = bin2hex(random_bytes(4));
	$resizeTmpDir = sys_get_temp_dir() . '/rw-tiptap-axis-' . $resizeSuffix;
	mkdir($resizeTmpDir, 0775, true);
	$resizeImgField = null;
	$resizeFg = null;
	$resizeTpl = null;
	$resizePage = null;

	try {
		$fields = wire('fields');
		$fieldgroups = wire('fieldgroups');
		$templates = wire('templates');
		$pages = wire('pages');

		$resizeImgField = new Field();
		$resizeImgField->type = wire('modules')->get('FieldtypeImage');
		$resizeImgField->name = 'rw_axis_img_' . $resizeSuffix;
		$resizeImgField->extensions = 'png jpg';
		$fields->save($resizeImgField);

		$resizeFg = new Fieldgroup();
		$resizeFg->name = 'rw_axis_tpl_' . $resizeSuffix;
		$resizeFg->add($fields->get('title'));
		$resizeFg->add($resizeImgField);
		$fieldgroups->save($resizeFg);

		$resizeTpl = new Template();
		$resizeTpl->name = 'rw_axis_tpl_' . $resizeSuffix;
		$resizeTpl->fieldgroup = $resizeFg;
		$templates->save($resizeTpl);

		$resizePage = new Page();
		$resizePage->template = $resizeTpl;
		$resizePage->parent = $home;
		$resizePage->name = 'rw-axis-page-' . $resizeSuffix;
		$resizePage->title = 'Axis Probe';
		$pages->save($resizePage);

		$png1x1 = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
		$probePng = $resizeTmpDir . '/axis-probe.png';
		file_put_contents($probePng, $png1x1);
		$resizePage->of(false);
		$resizePage->getUnformatted($resizeImgField->name)->add($probePng);
		$pages->save($resizePage);

		$resizeOverRes = $react->handleTiptapAction([
			'_requestMethod' => 'POST',
			'action' => 'resize',
			'tiptapToken' => $tiptapToken,
			'pageId' => (int) $resizePage->id,
			'fieldName' => $resizeImgField->name,
			'file' => 'axis-probe.png',
			'width' => MediaGateway::MAX_RASTER_AXIS + 1,
		], false, $superUser);
		expect($resizeOverRes['ok'] ?? true)->toBeFalse()
			->and($resizeOverRes['status'] ?? null)->toBe(422);
	} finally {
		if ($resizePage instanceof Page && $resizePage->id > 0) {
			try {
				wire('pages')->delete($resizePage, true);
			} catch (\Throwable) {
			}
		}
		if ($resizeTpl instanceof Template && $resizeTpl->id > 0) {
			try {
				wire('templates')->delete($resizeTpl);
			} catch (\Throwable) {
			}
		}
		if ($resizeFg instanceof Fieldgroup && $resizeFg->id > 0) {
			try {
				wire('fieldgroups')->delete($resizeFg);
			} catch (\Throwable) {
			}
		}
		if ($resizeImgField instanceof Field && $resizeImgField->id > 0) {
			try {
				wire('fields')->delete($resizeImgField);
			} catch (\Throwable) {
			}
		}
		foreach (glob($resizeTmpDir . '/*') ?: [] as $f) {
			if (is_file($f)) {
				@unlink($f);
			}
		}
		if (is_dir($resizeTmpDir)) {
			@rmdir($resizeTmpDir);
		}
	}
});

test('React lifecycle: ___upgrade(), WorkspacePreferenceStore::reconcile() zero-write fast path & pruning', function (): void {
	/** @var React $react */
	$react = wire('react');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	/** @var User $superUser */
	$superUser = wire('users')->get($superId);

	$prefStore = $react->workspacePreferences();
	$prefStore->reset($superUser);
	$prefFile = $prefStore->filePath($superUser);
	$prefStore->setThemeMode('light', $superUser);
	clearstatcache(true, $prefFile);
	$mtimeBefore = filemtime($prefFile);
	$prefStore->reconcile(['orders-ws' => ['id' => 'orders-ws']], null, $superUser);
	clearstatcache(true, $prefFile);
	expect(filemtime($prefFile))->toBe($mtimeBefore);

	// Reconcile prunes favorited workspaces absent from accessibleWorkspaces
	$prefStore->toggleFavorite('orders-ws', $superUser);
	$prefStore->toggleFavorite('revoked-ws', $superUser);
	$reconciled = $prefStore->reconcile(['orders-ws' => ['id' => 'orders-ws']], null, $superUser);
	expect($reconciled['favorites'])->toBe(['orders-ws']);
	$prefStore->reset($superUser);

	// ___upgrade runs cleanly on isolated React instance
	$scratchReact = new React();
	wire($scratchReact);
	$scratchReact->___upgrade(33, 34);
	expect($scratchReact->shellLayouts()->has('topbar'))->toBeTrue();
});

test('Cycle 2 hardening regressions: URL sanitizer, password redaction, condition markup, provider sort/of(), Tiptap/Media RBAC & masking', function (): void {
	/** @var React $react */
	$react = wire('react');
	$pages = wire('pages');
	$users = wire('users');
	$fields = wire('fields');
	$fieldgroups = wire('fieldgroups');
	$templates = wire('templates');
	$modules = wire('modules');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	/** @var User $superUser */
	$superUser = $users->get($superId);
	$prevUser = wire('user');
	$prevDebug = (bool) wire('config')->debug;

	$suffix = bin2hex(random_bytes(4));
	$tmpDir = sys_get_temp_dir() . '/rw-cycle2-' . $suffix;
	mkdir($tmpDir, 0775, true);

	$probeUser = null;
	$mutPage = null;

	try {
		// 1. UrlSanitizer blocks SVG animation, meta refresh, and percent-encoded newline scheme evasion
		expect(UrlSanitizer::sanitizeImageSrc('data:image/svg+xml;utf8,' . rawurlencode('<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>')))->toBe('')
			->and(UrlSanitizer::sanitizeImageSrc('data:image/svg+xml;utf8,' . rawurlencode('<svg><meta http-equiv="refresh"/></svg>')))->toBe('')
			->and(UrlSanitizer::sanitizeImageSrc('data:image/svg+xml;utf8,<svg><a href="java%0ascript:alert(1)">x</a></svg>'))->toBe('');

		// 2. FormSchemaSerializer redacts InputfieldText when attr(type=password) with or without rwControl=password
		$users->setCurrentUser($superUser);
		$serializer = new FormSchemaSerializer();
		wire($serializer);
		/** @var InputfieldForm $pwForm */
		$pwForm = new InputfieldForm();
		wire($pwForm);

		/** @var InputfieldText $plainTypePw */
		$plainTypePw = $modules->get('InputfieldText');
		$plainTypePw->attr('name', 'plain_type_pw');
		$plainTypePw->attr('type', 'password');
		$plainTypePw->val('TopSecretTextValue!');
		$pwForm->add($plainTypePw);

		/** @var InputfieldText $ctrlTypePw */
		$ctrlTypePw = $modules->get('InputfieldText');
		$ctrlTypePw->attr('name', 'ctrl_type_pw');
		$ctrlTypePw->attr('type', 'password');
		$ctrlTypePw->set('rwControl', 'password');
		$ctrlTypePw->val('AnotherSecretValue!');
		$pwForm->add($ctrlTypePw);

		$pwSchema = $serializer->serialize($pwForm);
		$pwByName = [];
		foreach ($pwSchema['fields'] as $node) {
			if (is_array($node) && isset($node['name'])) {
				$pwByName[(string) $node['name']] = $node;
			}
		}
		expect($pwByName['plain_type_pw']['value'] ?? 'FAIL')->toBe('')
			->and($pwByName['plain_type_pw']['defaultValue'] ?? 'FAIL')->toBe('')
			->and($pwByName['ctrl_type_pw']['value'] ?? 'FAIL')->toBe('')
			->and($pwByName['ctrl_type_pw']['defaultValue'] ?? 'FAIL')->toBe('');

		// 3. ReactControlRegistry::renderTextMarkupValue() resolves rwConditionFields labels
		$condField = new Field();
		wire($condField);
		$condField->name = 'cond_markup_probe';
		$condField->set('rwControl', 'condition_builder');
		$condField->set('rwConditionFields', [
			['key' => 'plan', 'label' => 'Account Plan', 'type' => 'text'],
		]);
		$condJson = (string) json_encode([
			'match' => 'all',
			'groups' => [
				[
					'id' => 'g1',
					'match' => 'all',
					'rules' => [
						['field' => 'plan', 'operator' => 'eq', 'value' => 'pro'],
					],
				],
			],
		]);
		$condRegistry = $react->controls();
		$condMarkup = $condRegistry->renderTextMarkupValue($condField, $condJson);
		expect((string) $condMarkup)->toContain('Account Plan')
			->and((string) $condMarkup)->toContain('pro');

		// 4. PagesDataProvider default sort=id and mutate() output-formatting state preservation
		$baseTpl = $templates->get('page') ?: $templates->get('home');
		expect($baseTpl)->toBeInstanceOf(Template::class);
		$pagesProvider = new PagesDataProvider('template=' . $baseTpl->name, []);
		wire($pagesProvider);
		$refBuild = new \ReflectionMethod($pagesProvider, 'buildSelectorParts');
		$builtParts = $refBuild->invoke($pagesProvider, [
			'sortBy' => '',
			'sortDir' => 'asc',
			'statusFilter' => 'published',
		]);
		expect($builtParts)->toContain('sort=id')
			->and($builtParts)->toContain('status<1024');

		$mutPage = new Page();
		$mutPage->template = $baseTpl;
		$mutPage->parent = $pages->get(1);
		$mutPage->name = 'rw-mutate-of-' . $suffix;
		$mutPage->title = 'Mutate OF Probe';
		$pages->save($mutPage);
		$mutPage->of(true);
		expect($pagesProvider->mutate('draft', [(string) $mutPage->id]))->toBe(1)
			->and($mutPage->of())->toBeTrue();

		// 5. TiptapMediaLinkGateway RBAC: non-superuser denied admin/trash asset access and unauthorized editPageId URL
		$probeUser = $users->add('rw-tiptap-probe-' . $suffix);
		$probeUser->pass = 'ProbePass123!@#';
		$probeUser->save();
		$users->setCurrentUser($probeUser);

		$tiptapGw = $react->tiptap();
		$adminRootId = (int) (wire('config')->adminRootPageID ?: 2);
		$trashPageId = (int) (wire('config')->trashPageID ?: 7);
		$probeToken = $tiptapGw->sign(['pageId' => 1, 'editPageId' => $adminRootId, 'readOnly' => false], (int) $probeUser->id);
		$adminImgRes = $tiptapGw->handleAction([
			'action' => 'images',
			'tiptapToken' => $probeToken,
			'pageId' => $adminRootId,
		], false, $probeUser);
		expect($adminImgRes['ok'])->toBeFalse()->and($adminImgRes['status'])->toBe(403);

		$refCanRead = new \ReflectionMethod($tiptapGw, 'canReadPageAssets');
		expect($refCanRead->invoke($tiptapGw, $pages->get($adminRootId), $probeUser))->toBeFalse()
			->and($refCanRead->invoke($tiptapGw, $pages->get($trashPageId), $probeUser))->toBeFalse();

		$pagesRes = $tiptapGw->handleAction([
			'action' => 'pages',
			'tiptapToken' => $probeToken,
			'editPageId' => $adminRootId,
			'q' => 'Home',
		], false, $probeUser);
		expect($pagesRes['ok'])->toBeTrue();

		// 6. ReactGatewayRouter::respondJsonGuarded() masks WireDatabaseException / WireFilesException when config->debug is false
		$users->setCurrentUser($superUser);
		wire('config')->debug = false;
		$gatewayRouter = $react->gateway();
		$refGuarded = new \ReflectionMethod($gatewayRouter, 'respondJsonGuarded');
		$prevHttpCode = http_response_code();
		try {
			$dbMaskedJson = (string) $refGuarded->invoke(
				$gatewayRouter,
				static function (): array {
					throw new WireDatabaseException('SELECT * FROM internal_media_secret');
				},
				'Test media error',
				'Media request failed.'
			);
			$dbDecoded = json_decode($dbMaskedJson, true);
			expect($dbDecoded['ok'] ?? null)->toBeFalse()
				->and($dbDecoded['error'] ?? null)->toBe('Media request failed.')
				->and($dbMaskedJson)->not->toContain('internal_media_secret');

			$safeDomainJson = (string) $refGuarded->invoke(
				$gatewayRouter,
				static function (): array {
					throw new WireException('Validation message safe for client');
				},
				'Test domain error',
				'Media request failed.'
			);
			$safeDecoded = json_decode($safeDomainJson, true);
			expect($safeDecoded['ok'] ?? null)->toBeFalse()
				->and($safeDecoded['error'] ?? null)->toBe('Validation message safe for client');
		} finally {
			if (is_int($prevHttpCode) && $prevHttpCode > 0) {
				http_response_code($prevHttpCode);
			}
		}

		// 7. Cycle 3 regressions: array payload['field'] in PagesDataProvider::mutate, EditPresenceStore::leave() absent-file no-op,
		// SignedTokenCodec domain separation, and non-cropping proportional ImageSizer fit in TiptapMediaLinkGateway::executeUpload()
		$users->setCurrentUser($superUser);
		expect($pagesProvider->mutate('update_field', [(string) $mutPage->id], ['field' => ['nested'], 'value' => 'x']))->toBe(0);

		$absentKey = 'absent-resource-' . $suffix;
		$presenceStore = $react->presence();
		$presencePath = $presenceStore->filePath($absentKey);
		if ($presencePath !== '' && is_file($presencePath)) {
			@unlink($presencePath);
		}
		$presenceStore->leave($absentKey, $superUser, 'c1');
		expect($presencePath !== '' && file_exists($presencePath))->toBeFalse();

		$vpStateToken = $react->table()->signViewportState([
			'viewportClass' => 'MarkupReactTable',
			'resource' => 'pages:template=' . $baseTpl->name,
			'kind' => 'page',
		]);
		expect($react->table()->verifyViewportState($vpStateToken))->toBeArray()
			->and($react->relationSigner()->verify($vpStateToken, $superId))->toBeNull()
			->and($react->media()->verify($vpStateToken, $superId))->toBeNull()
			->and($react->tiptap()->verify($vpStateToken, $superId))->toBeNull();

		$imgField = new Field();
		$imgField->type = $modules->get('FieldtypeImage');
		$imgField->name = 'rw_tt_prop_' . $suffix;
		$imgField->set('extensions', 'png');
		$imgField->set('maxWidth', 200);
		$imgField->set('maxHeight', 200);
		$fields->save($imgField);

		$imgFg = new Fieldgroup();
		$imgFg->name = 'rw_tt_prop_tpl_' . $suffix;
		$imgFg->add('title');
		$imgFg->add($imgField);
		$fieldgroups->save($imgFg);

		$imgTpl = new Template();
		$imgTpl->name = $imgFg->name;
		$imgTpl->fieldgroup = $imgFg;
		$templates->save($imgTpl);

		$imgPage = new Page();
		$imgPage->template = $imgTpl;
		$imgPage->parent = $pages->get(1);
		$imgPage->name = 'rw-tt-prop-' . $suffix;
		$imgPage->title = 'Tiptap Proportional Fit Probe';
		$pages->save($imgPage);

		$widePng = $tmpDir . '/wide.png';
		$gdWide = imagecreatetruecolor(400, 200);
		$bgWide = imagecolorallocate($gdWide, 40, 120, 200);
		imagefilledrectangle($gdWide, 0, 0, 400, 200, $bgWide);
		imagepng($gdWide, $widePng);

		$ttTok = $react->tiptap()->sign([
			'pageId' => (int) $imgPage->id,
			'editPageId' => (int) $imgPage->id,
			'uploadFieldName' => $imgField->name,
			'imageFields' => [$imgField->name],
			'readOnly' => false,
		], $superId);

		$ttUpRes = $react->handleTiptapAction([
			'action' => 'upload',
			'tiptapToken' => $ttTok,
			'pageId' => (int) $imgPage->id,
			'fieldName' => $imgField->name,
			'_requestMethod' => 'POST',
		], false, $superUser, [
			'file' => [
				'name' => 'wide.png',
				'type' => 'image/png',
				'tmp_name' => $widePng,
				'error' => UPLOAD_ERR_OK,
				'size' => filesize($widePng),
			],
		]);
		expect($ttUpRes['ok'] ?? false)->toBeTrue();
		$uploadedItem = $ttUpRes['uploaded'][0] ?? [];
		expect((int) ($uploadedItem['width'] ?? 0))->toBe(200)
			->and((int) ($uploadedItem['height'] ?? 0))->toBe(100);
	} finally {
		if (isset($imgPage) && $imgPage instanceof Page && $imgPage->id) {
			try { $pages->delete($imgPage, true); } catch (\Throwable) {}
		}
		if (isset($imgTpl) && $imgTpl instanceof Template && $imgTpl->id) {
			try { $templates->delete($imgTpl); } catch (\Throwable) {}
		}
		if (isset($imgFg) && $imgFg instanceof Fieldgroup && $imgFg->id) {
			try { $fieldgroups->delete($imgFg); } catch (\Throwable) {}
		}
		if (isset($imgField) && $imgField instanceof Field && $imgField->id) {
			try { $fields->delete($imgField); } catch (\Throwable) {}
		}
		wire('config')->debug = $prevDebug;
		$users->setCurrentUser($superUser);
		if ($mutPage instanceof Page && $mutPage->id) {
			try { $pages->delete($mutPage, true); } catch (\Throwable) {}
		}
		if ($probeUser instanceof User && $probeUser->id) {
			try { $users->delete($probeUser, true); } catch (\Throwable) {}
		}
		foreach (glob($tmpDir . '/*') ?: [] as $f) {
			if (is_file($f)) {
				@unlink($f);
			}
		}
		if (is_dir($tmpDir)) {
			@rmdir($tmpDir);
		}
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
	}
});

test('Cycle 4 hardening regressions: MediaGateway upload/replace rollback, Tiptap maxFiles=1 overwrite & resize RBAC, EditPresenceStore lock retention, PagesDataProvider selector parsing, and password redaction', function (): void {
	$react = React::instance();
	$pages = wire('pages');
	$fields = wire('fields');
	$fieldgroups = wire('fieldgroups');
	$templates = wire('templates');
	$modules = wire('modules');
	$users = wire('users');
	$roles = wire('roles');
	$permissions = wire('permissions');

	$prevUser = $users->getCurrentUser();
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	/** @var User $superUser */
	$superUser = $users->get($superId);
	expect($superUser)->toBeInstanceOf(User::class);
	$users->setCurrentUser($superUser);

	$suffix = bin2hex(random_bytes(3));
	$tmpDir = sys_get_temp_dir() . '/rw-cycle4-' . $suffix;
	mkdir($tmpDir, 0775, true);

	$imgField = null;
	$singleField = null;
	$fg = null;
	$tpl = null;
	$page = null;
	$probeRole = null;
	$probeUser = null;
	$createdPerms = [];

	try {
		// 1. MediaGateway::isPhysicalPageHost() distinguishes template-backed DB pages from virtual Page subclasses
		$virtualPage = new class extends Page {
			public function __construct()
			{
				parent::__construct();
				$this->settings['id'] = 999123;
			}
		};
		expect(MediaGateway::isPhysicalPageHost($pages->get(1)))->toBeTrue()
			->and(MediaGateway::isPhysicalPageHost($pages->newNullPage()))->toBeFalse()
			->and(MediaGateway::isPhysicalPageHost($virtualPage))->toBeFalse();

		// 2. MediaGateway::executeUpload & executeReplace atomicity and sort-order rollback
		$singleField = new Field();
		$singleField->type = $modules->get('FieldtypeImage');
		$singleField->name = 'rw_c4_single_' . $suffix;
		$singleField->set('extensions', 'png');
		$singleField->set('maxFiles', 1);
		$singleField->set('overwrite', 1);
		$singleField->set('minWidth', 300);
		$fields->save($singleField);

		$imgField = new Field();
		$imgField->type = $modules->get('FieldtypeImage');
		$imgField->name = 'rw_c4_multi_' . $suffix;
		$imgField->set('extensions', 'png');
		$imgField->set('maxFiles', 0);
		$imgField->set('minWidth', 300);
		$fields->save($imgField);

		$fg = new Fieldgroup();
		$fg->name = 'rw_c4_tpl_' . $suffix;
		$fg->add('title');
		$fg->add($singleField);
		$fg->add($imgField);
		$fieldgroups->save($fg);

		$tpl = new Template();
		$tpl->name = $fg->name;
		$tpl->fieldgroup = $fg;
		$templates->save($tpl);

		$page = new Page();
		$page->template = $tpl;
		$page->parent = $pages->get(1);
		$page->name = 'rw-c4-media-' . $suffix;
		$page->title = 'Cycle 4 Media Probe';
		$pages->save($page);

		$makePng = static function (string $path, int $w, int $h) {
			$im = imagecreatetruecolor($w, $h);
			$c = imagecolorallocate($im, 30, 140, 120);
			imagefilledrectangle($im, 0, 0, $w, $h, $c);
			imagepng($im, $path);
		};

		$singleHero = $tmpDir . '/single_hero.png';
		$validFirst = $tmpDir . '/alpha.png';
		$validSecond = $tmpDir . '/beta.png';
		$tooSmall = $tmpDir . '/single_hero.png';
		$tooSmallOther = $tmpDir . '/tiny.png';
		$validGamma = $tmpDir . '/gamma.png';
		$makePng($singleHero, 320, 200);
		$makePng($validFirst, 320, 200);
		$makePng($validSecond, 340, 200);
		$makePng($tooSmallOther, 100, 100);
		$makePng($validGamma, 360, 200);

		$page->of(false);
		$page->getUnformatted($singleField->name)->add($singleHero);
		$page->getUnformatted($imgField->name)->add($validFirst);
		$page->getUnformatted($imgField->name)->add($validSecond);
		$pages->save($page);

		$existingSingle = $page->getUnformatted($singleField->name)->first();
		expect($existingSingle)->not->toBeNull();
		$origSingleSize = filesize($existingSingle->filename());

		// Overwrite upload with same basename that violates minWidth must NOT destroy the existing file
		$makePng($tooSmall, 100, 100);
		$mediaGw = $react->media();
		$singleToken = $mediaGw->sign([
			'kind' => 'page',
			'pageId' => (int) $page->id,
			'fieldName' => $singleField->name,
			'isImage' => true,
			'maxFiles' => 1,
			'extensions' => ['png'],
		], $superId);
		$badUploadRes = $mediaGw->handleAction([
			'action' => 'upload',
			'mediaToken' => $singleToken,
			'_requestMethod' => 'POST',
		], false, $superUser, [
			'file' => [
				'name' => 'single_hero.png',
				'type' => 'image/png',
				'tmp_name' => $tooSmall,
				'error' => UPLOAD_ERR_OK,
				'size' => filesize($tooSmall),
			],
		]);
		expect($badUploadRes['ok'] ?? true)->toBeFalse()
			->and($badUploadRes['status'] ?? 0)->toBe(422)
			->and(is_file($existingSingle->filename()))->toBeTrue()
			->and(filesize($existingSingle->filename()))->toBe($origSingleSize);

		// Replace on multi field at index 0: both pre-validation rejection and save-time rollback preserve ['alpha.png', 'beta.png'] order
		$multiToken = $mediaGw->sign([
			'kind' => 'page',
			'pageId' => (int) $page->id,
			'fieldName' => $imgField->name,
			'isImage' => true,
			'maxFiles' => 0,
			'extensions' => ['png'],
		], $superId);
		$badReplaceRes = $mediaGw->handleAction([
			'action' => 'replace',
			'mediaToken' => $multiToken,
			'fileName' => 'alpha.png',
			'_requestMethod' => 'POST',
		], false, $superUser, [
			'file' => [
				'name' => 'tiny.png',
				'type' => 'image/png',
				'tmp_name' => $tooSmallOther,
				'error' => UPLOAD_ERR_OK,
				'size' => filesize($tooSmallOther),
			],
		]);
		expect($badReplaceRes['ok'] ?? true)->toBeFalse();

		$throwOnceHookId = wire()->addHookBefore('Pages::saveFieldReady', null, static function (\ProcessWire\HookEvent $event) use (&$throwOnceHookId): void {
			if (is_string($throwOnceHookId) && $throwOnceHookId !== '') {
				$event->wire()->removeHook($throwOnceHookId);
				$throwOnceHookId = '';
			}
			throw new \RuntimeException('Simulated save failure for rollback probe');
		});
		$rollbackReplaceRes = $mediaGw->handleAction([
			'action' => 'replace',
			'mediaToken' => $multiToken,
			'fileName' => 'alpha.png',
			'_requestMethod' => 'POST',
		], false, $superUser, [
			'file' => [
				'name' => 'gamma.png',
				'type' => 'image/png',
				'tmp_name' => $validGamma,
				'error' => UPLOAD_ERR_OK,
				'size' => filesize($validGamma),
			],
		]);
		if (is_string($throwOnceHookId) && $throwOnceHookId !== '') {
			wire()->removeHook($throwOnceHookId);
		}
		expect($rollbackReplaceRes['ok'] ?? true)->toBeFalse();
		$pages->uncacheAll();
		$reloaded = $pages->get((int) $page->id);
		$reloadedNames = array_values(array_map(
			static fn($item): string => (string) $item->basename(),
			iterator_to_array($reloaded->getUnformatted($imgField->name)),
		));
		expect($reloadedNames)->toBe(['alpha.png', 'beta.png']);

		// 3. TiptapMediaLinkGateway::executeUpload() caps batch to 1 on maxFiles=1 + overwrite
		$oneA = $tmpDir . '/one_a.png';
		$oneB = $tmpDir . '/one_b.png';
		$makePng($oneA, 320, 200);
		$makePng($oneB, 340, 200);
		$ttToken = $react->tiptap()->sign([
			'pageId' => (int) $page->id,
			'editPageId' => (int) $page->id,
			'uploadFieldName' => $singleField->name,
			'imageFields' => [$singleField->name],
			'readOnly' => false,
		], $superId);
		$ttMultiRes = $react->handleTiptapAction([
			'action' => 'upload',
			'tiptapToken' => $ttToken,
			'pageId' => (int) $page->id,
			'fieldName' => $singleField->name,
			'_requestMethod' => 'POST',
		], false, $superUser, [
			'files' => [
				'name' => ['one_a.png', 'one_b.png'],
				'type' => ['image/png', 'image/png'],
				'tmp_name' => [$oneA, $oneB],
				'error' => [UPLOAD_ERR_OK, UPLOAD_ERR_OK],
				'size' => [filesize($oneA), filesize($oneB)],
			],
		]);
		expect($ttMultiRes['ok'] ?? false)->toBeTrue()
			->and(count($ttMultiRes['uploaded'] ?? []))->toBe(1);

		// 4. TiptapMediaLinkGateway::executeResize() enforces field-level edit RBAC on restricted image field
		$pageEditPerm = $permissions->get('page-edit');
		if (!$pageEditPerm instanceof Permission || !$pageEditPerm->id) {
			$pageEditPerm = $permissions->add('page-edit');
			$createdPerms[] = $pageEditPerm;
		}
		$probeRole = $roles->add('rw-c4-role-' . $suffix);
		$probeRole->addPermission($pageEditPerm);
		$probeRole->save();

		$tpl->useRoles = 1;
		$tpl->roles = [(int) $probeRole->id];
		$tpl->editRoles = [(int) $probeRole->id];
		$templates->save($tpl);

		$guestRole = $roles->get('guest');
		$imgField->useRoles = 1;
		$imgField->viewRoles = [$guestRole instanceof Role && $guestRole->id ? (int) $guestRole->id : 37];
		$imgField->editRoles = [$roles->get('superuser')?->id ?: 38];
		$fields->save($imgField);

		$probeUser = $users->add('rw-c4-probe-' . $suffix);
		$probeUser->pass = 'Cycle4Probe!123';
		$probeUser->addRole($probeRole);
		$probeUser->save();
		$users->setCurrentUser($probeUser);

		$pages->uncacheAll();
		$probePage = $pages->get((int) $page->id);
		$probeTtToken = $react->tiptap()->sign([
			'pageId' => (int) $probePage->id,
			'editPageId' => (int) $probePage->id,
			'imageFields' => [$imgField->name],
			'readOnly' => false,
		], (int) $probeUser->id);
		$deniedResize = $react->handleTiptapAction([
			'action' => 'resize',
			'tiptapToken' => $probeTtToken,
			'pageId' => (int) $probePage->id,
			'file' => 'alpha.png',
			'width' => 160,
			'_requestMethod' => 'POST',
		], false, $probeUser);
		expect($deniedResize['ok'] ?? true)->toBeFalse()
			->and($deniedResize['status'] ?? 0)->toBe(403);

		// 5. EditPresenceStore::pruneExpiredFiles() removes expired file while keeping .lock inode intact
		$users->setCurrentUser($superUser);
		$presenceStore = $react->presence();
		$pruneKey = 'prune-lock-' . $suffix;
		$presenceStore->heartbeat($pruneKey, $superUser, 'c1', 60, time() - 1000);
		$prunePath = $presenceStore->filePath($pruneKey);
		expect($prunePath)->not->toBe('')
			->and(is_file($prunePath))->toBeTrue();
		touch($prunePath, time() - 7200);
		$removedCount = $presenceStore->pruneExpiredFiles(time(), 60);
		expect($removedCount)->toBeGreaterThanOrEqual(1)
			->and(is_file($prunePath))->toBeFalse()
			->and(is_file($prunePath . '.lock'))->toBeTrue();

		// 6. PagesDataProvider nested subselector & quoted sort= parsing
		$nestedProvider = new PagesDataProvider('template=' . $tpl->name . ', children=[foo=[bar], sort=title], title*="a, sort=b"', []);
		wire($nestedProvider);
		$refBuild = new \ReflectionMethod($nestedProvider, 'buildSelectorParts');
		$nestedParts = $refBuild->invoke($nestedProvider, ['sortBy' => '', 'sortDir' => 'asc', 'statusFilter' => 'published']);
		expect($nestedParts)->toContain('sort=id');

		$topSortProvider = new PagesDataProvider('template=' . $tpl->name . ', sort=title', []);
		wire($topSortProvider);
		$topSortParts = $refBuild->invoke($topSortProvider, ['sortBy' => '', 'sortDir' => 'asc', 'statusFilter' => 'published']);
		expect($topSortParts)->not->toContain('sort=id');

		// 7. FormSchemaSerializer redacts rwControl='password' on InputfieldText and declarative resetValue
		$pwForm = new InputfieldForm();
		$pwForm->attr('name', 'c4_pw_form');
		/** @var InputfieldText $pwTxt */
		$pwTxt = $modules->get('InputfieldText');
		$pwTxt->attr('id+name', 'txt_pw');
		$pwTxt->label = 'Account Secret';
		$pwTxt->set('rwControl', 'password');
		$pwTxt->val('PlaintextSecretValue');
		$pwForm->add($pwTxt);

		$serializer = $react->forms();
		$serializedForm = $serializer->serialize($pwForm);
		$txtNode = null;
		foreach ($serializedForm['fields'] as $fn) {
			if (($fn['name'] ?? '') === 'txt_pw') {
				$txtNode = $fn;
				break;
			}
		}
		expect($txtNode)->toBeArray()
			->and($txtNode['value'] ?? null)->toBe('')
			->and($txtNode['defaultValue'] ?? null)->toBe('')
			->and($serializedForm['values']['txt_pw'] ?? null)->toBe('');

		$declPw = $serializer->serializeDefinitions([
			[
				'name' => 'decl_pw',
				'type' => 'password',
				'label' => 'Password',
				'default' => 'LeakyResetDefault',
				'resetValue' => 'LeakyResetDefault',
			],
		]);
		expect($declPw['values']['decl_pw'] ?? null)->toBe('')
			->and($declPw['fields'][0]['value'] ?? null)->toBe('')
			->and(array_key_exists('resetValue', $declPw['fields'][0]))->toBeFalse();
	} finally {
		$users->setCurrentUser($superUser);
		if ($page instanceof Page && $page->id) {
			try { $pages->delete($page, true); } catch (\Throwable) {}
		}
		if ($probeUser instanceof User && $probeUser->id) {
			try { $users->delete($probeUser, true); } catch (\Throwable) {}
		}
		if ($probeRole instanceof Role && $probeRole->id) {
			try { $roles->delete($probeRole); } catch (\Throwable) {}
		}
		if ($tpl instanceof Template && $tpl->id) {
			try { $templates->delete($tpl); } catch (\Throwable) {}
		}
		if ($fg instanceof Fieldgroup && $fg->id) {
			try { $fieldgroups->delete($fg); } catch (\Throwable) {}
		}
		if ($singleField instanceof Field && $singleField->id) {
			try { $fields->delete($singleField); } catch (\Throwable) {}
		}
		if ($imgField instanceof Field && $imgField->id) {
			try { $fields->delete($imgField); } catch (\Throwable) {}
		}
		foreach ($createdPerms as $perm) {
			if ($perm instanceof Permission && $perm->id) {
				try { $permissions->delete($perm); } catch (\Throwable) {}
			}
		}
		foreach (glob($tmpDir . '/*') ?: [] as $f) {
			if (is_file($f)) {
				@unlink($f);
			}
		}
		if (is_dir($tmpDir)) {
			@rmdir($tmpDir);
		}
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
	}
});

test('Cycle 5 regressions: multilingual password redaction, title/image field-level RBAC in providers & relation items, and Tiptap filedata rollback', function (): void {
	$modules = wire('modules');
	$fields = wire('fields');
	$templates = wire('templates');
	$fieldgroups = wire('fieldgroups');
	$pages = wire('pages');
	$users = wire('users');
	$roles = wire('roles');
	$languages = wire('languages');
	/** @var React $react */
	$react = $modules->get('React');

	$prevUser = $users->getCurrentUser();
	$superUser = $users->get('roles=superuser');
	if ($superUser instanceof User && $superUser->id > 0) {
		$users->setCurrentUser($superUser);
	}

	$suffix = bin2hex(random_bytes(3));
	$titleField = $fields->get('title');
	$origTitleUseRoles = $titleField instanceof Field ? (int) $titleField->useRoles : 0;
	$origTitleViewRoles = $titleField instanceof Field ? (array) $titleField->viewRoles : [];

	$imgField = null;
	$fg = null;
	$tpl = null;
	$page = null;
	$probeRole = null;
	$probeUser = null;
	$tmpDir = sys_get_temp_dir() . '/rw-c5-reg-' . $suffix;
	mkdir($tmpDir, 0775, true);

	try {
		// 1. FormSchemaSerializer: native InputfieldPassword resets/languages and declarative useLanguages password slots redacted
		$serializer = $react->forms();
		$pwForm = new InputfieldForm();
		$pwForm->attr('name', 'c5_pw_form');
		/** @var InputfieldPassword $nativePw */
		$nativePw = $modules->get('InputfieldPassword');
		$nativePw->attr('id+name', 'native_pw');
		$nativePw->label = 'Password';
		$nativePw->set('resetValue', 'LeakyResetPass!');
		$pwForm->add($nativePw);

		$serializedPw = $serializer->serialize($pwForm);
		$pwNode = null;
		foreach ($serializedPw['fields'] as $node) {
			if (($node['name'] ?? '') === 'native_pw') {
				$pwNode = $node;
				break;
			}
		}
		expect($pwNode)->toBeArray()
			->and(array_key_exists('resetValue', $pwNode))->toBeFalse();

		$langPassValues = ['default' => 'SecretDefault123'];
		$langInputs = ['decl_ml_pw'];
		if ($languages !== null) {
			foreach ($languages as $langItem) {
				if ($langItem instanceof Language && !$langItem->isDefault()) {
					$langPassValues[$langItem->name] = 'SecretLang123';
					$langInputs[] = 'decl_ml_pw__' . $langItem->id;
				}
			}
		}
		$declMlPw = $serializer->serializeDefinitions([
			[
				'name' => 'decl_ml_pw',
				'type' => 'password',
				'label' => 'Multi-Lang Password',
				'useLanguages' => true,
				'value' => $langPassValues,
				'resetValue' => 'SecretDefault123',
			],
		]);
		foreach ($langInputs as $lk) {
			expect($declMlPw['values'][$lk] ?? null)->toBe('');
		}
		expect(array_key_exists('resetValue', $declMlPw['fields'][0]))->toBeFalse();
		foreach ((array) ($declMlPw['fields'][0]['languages'] ?? []) as $lt) {
			expect($lt['value'] ?? null)->toBe('');
		}

		// 2. PagesDataProvider & PageResourceAdapter: title & image field-level useRoles=1 gating
		$imgField = new Field();
		$imgField->type = $modules->get('FieldtypeImage');
		$imgField->name = 'rw_c5_img_' . $suffix;
		$imgField->maxFiles = 2;
		$imgField->extensions = 'png jpg';
		$imgField->save();

		$fg = new Fieldgroup();
		$fg->name = 'rw_c5_fg_' . $suffix;
		if ($titleField instanceof Field) {
			$fg->add($titleField);
		}
		$fg->add($imgField);
		$fg->save();

		$tpl = new Template();
		$tpl->name = 'rw_c5_tpl_' . $suffix;
		$tpl->fieldgroup = $fg;
		$tpl->save();

		$page = new Page();
		$page->template = $tpl;
		$page->parent = $pages->get('/');
		$page->name = 'rw-c5-page-' . $suffix;
		$page->title = 'TopSecretTitle-' . $suffix;
		$page->save();

		$png1x1 = (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', true);
		$seedPath = $tmpDir . '/c5-sample.png';
		file_put_contents($seedPath, $png1x1);
		$page->of(false);
		$imgCollection = $page->getUnformatted($imgField->name);
		$imgCollection->add($seedPath);
		$firstImg = $imgCollection->first();
		$firstImg->description = 'Original Desc';
		$firstImg->tags = 'origtag';
		$firstImg->set('filedata', ['customNote' => 'preserved']);
		$page->save();

		// Verify TiptapMediaLinkGateway::rollbackAddedImages restores filedata + descriptions
		$bakFile = $tmpDir . '/c5-bak.png';
		file_put_contents($bakFile, $png1x1);
		$extraFile = $tmpDir . '/c5-extra.png';
		file_put_contents($extraFile, $png1x1);
		$imgCollection->add($extraFile);
		$extraImg = $imgCollection->last();
		$refRollback = new \ReflectionMethod(\Totoglu\React\Tiptap\TiptapMediaLinkGateway::class, 'rollbackAddedImages');
		$refRollback->invoke(null, $imgCollection, [$extraImg], [[
			'path' => $bakFile,
			'description' => 'Restored Desc',
			'tags' => 'restoredtag',
			'focus' => '50 50 0',
			'filedata' => ['customNote' => 'restored-custom'],
		]]);
		$restoredLast = $imgCollection->last();
		expect($restoredLast->description)->toBe('Restored Desc')
			->and($restoredLast->tags)->toBe('restoredtag')
			->and($restoredLast->get('filedata'))->toBe(['customNote' => 'restored-custom']);

		$probeRole = $roles->add('rw-c5-role-' . $suffix);
		$probeRole->save();
		$probeUser = $users->add('rw-c5-user-' . $suffix);
		$probeUser->pass = 'Cycle5Probe!123';
		$probeUser->addRole($probeRole);
		$probeUser->save();

		$superRole = $roles->get('superuser');
		$superRoleId = $superRole instanceof Role && $superRole->id ? (int) $superRole->id : 38;
		if ($titleField instanceof Field) {
			$fg->setFieldContextArray((int) $titleField->id, [
				'useRoles' => 1,
				'viewRoles' => [$superRoleId],
			]);
			$fg->saveContext();
			// Apply in-memory only (never save global core title field to shared DB) for selector-level checks
			$titleField->useRoles = 1;
			$titleField->viewRoles = [$superRoleId];
		}
		$imgField->useRoles = 1;
		$imgField->viewRoles = [$superRoleId];
		$fields->save($imgField);

		$users->setCurrentUser($probeUser);
		$pages->uncacheAll();
		$restrictedPage = $pages->get((int) $page->id);

		$provider = new PagesDataProvider('template=' . $tpl->name . ', id=' . $page->id, [
			'columns' => ['title' => ['label' => 'Title'], $imgField->name => ['label' => 'Img']],
			'thumbField' => $imgField->name,
		]);
		wire($provider);
		$refBuildParts = new \ReflectionMethod($provider, 'buildSelectorParts');
		$searchParts = $refBuildParts->invoke($provider, ['search' => 'TopSecret', 'statusFilter' => 'all']);
		expect(implode(', ', $searchParts))->toContain('name%=TopSecret')
			->and(implode(', ', $searchParts))->not->toContain('title|name%=TopSecret');

		$refBuildRec = new \ReflectionMethod($provider, 'buildRecordFromPage');
		$depthCache = [];
		$rec = $refBuildRec->invokeArgs($provider, [$restrictedPage, '/admin', false, &$depthCache]);
		expect($rec->title)->toBe($restrictedPage->name);

		$pageAdapter = new \Totoglu\React\Relation\Resource\PageResourceAdapter();
		wire($pageAdapter);
		$refToItem = new \ReflectionMethod($pageAdapter, 'toRelationItem');
		/** @var \Totoglu\React\Relation\RelationItem $relItem */
		$relItem = $refToItem->invoke($pageAdapter, $restrictedPage, []);
		expect($relItem->label)->toBe($restrictedPage->name)
			->and($relItem->thumbUrl)->toBe('');
		$queriedItems = $pageAdapter->query(['q' => 'TopSecret'], ['template' => $tpl->name]);
		expect($queriedItems['items'] ?? [])->toBe([]);

		// 3. Cycle 6: text + inputType=password, isSecret=false, FieldtypePassword+isSecret redaction, collectPageFiles level > 4, and executeUpload backup rollback
		$mixedPw = $serializer->serializeDefinitions([
			[
				'name' => 'text_pw',
				'type' => 'text',
				'inputType' => 'password',
				'label' => 'Text Password',
				'value' => 'LeakyTextPw!',
				'resetValue' => 'LeakyTextReset!',
			],
			[
				'name' => 'false_secret_pw',
				'type' => 'password',
				'label' => 'False Secret Password',
				'isSecret' => false,
				'value' => 'LeakyFalseSecret!',
			],
		]);
		expect($mixedPw['values']['text_pw'] ?? null)->toBe('')
			->and($mixedPw['fields'][0]['value'] ?? null)->toBe('')
			->and(array_key_exists('resetValue', $mixedPw['fields'][0]))->toBeFalse()
			->and($mixedPw['values']['false_secret_pw'] ?? null)->toBe('')
			->and($mixedPw['fields'][1]['value'] ?? null)->toBe('');

		$refFallbackHidden = new \ReflectionMethod($react->controls(), 'buildFallbackHiddenInputsHtml');
		$hiddenPwHtml = (string) $refFallbackHidden->invoke($react->controls(), [
			'kind' => 'control',
			'type' => 'text',
			'inputType' => 'password',
			'name' => 'hidden_text_pw',
			'value' => 'ShouldBeBlanked',
		]);
		expect($hiddenPwHtml)->toContain('name="hidden_text_pw" value=""')
			->and($hiddenPwHtml)->not->toContain('ShouldBeBlanked');

		$refCollectFiles = new \ReflectionMethod(\Totoglu\React\Tiptap\TiptapMediaLinkGateway::class, 'collectPageFiles');
		expect($refCollectFiles->invoke($react->tiptap(), $page, '', 5))->toBe([]);

		// Restore single-file FieldtypeImage backup if executeUpload overwrite fails post-staging
		$users->setCurrentUser($superUser);
		$imgField->maxFiles = 1;
		$imgField->save();
		$pages->uncacheAll();
		$singleUploadPage = $pages->get((int) $page->id);
		$singleUploadPage->of(false);
		$badImg = $tmpDir . '/corrupt-overwrite.png';
		file_put_contents($badImg, $png1x1);
		$mockImgField = $modules->get('InputfieldImage');
		$mockImgField->attr('name', $imgField->name);
		$mockImgField->maxFiles = 1;
		$mockImgField->extensions = 'png jpg';
		$mockImgField->minWidth = 500;
		$uploadRes = (new \ReflectionMethod(MediaGateway::class, 'executeUpload'))->invoke(
			$react->media(),
			['kind' => 'page', 'page' => $singleUploadPage, 'fieldName' => $imgField->name, 'adapter' => null],
			['maxFiles' => 1, 'overwrite' => true, 'isImage' => true, 'minWidth' => 500],
			$singleUploadPage->getUnformatted($imgField->name),
			$mockImgField,
			$imgField->name,
			true,
			['files' => ['name' => 'c5-sample.png', 'tmp_name' => $badImg, 'type' => 'image/png', 'error' => 0, 'size' => strlen($png1x1)]]
		);
		expect($uploadRes['ok'] ?? true)->toBeFalse()
			->and($singleUploadPage->getUnformatted($imgField->name)->count())->toBe(1);
	} finally {
		if ($superUser instanceof User && $superUser->id > 0) {
			$users->setCurrentUser($superUser);
		}
		if ($titleField instanceof Field && $titleField->id) {
			$titleField->useRoles = $origTitleUseRoles;
			$titleField->viewRoles = $origTitleViewRoles;
		}
		if ($page instanceof Page && $page->id) {
			try { $pages->delete($page, true); } catch (\Throwable) {}
		}
		if ($probeUser instanceof User && $probeUser->id) {
			try { $users->delete($probeUser, true); } catch (\Throwable) {}
		}
		if ($probeRole instanceof Role && $probeRole->id) {
			try { $roles->delete($probeRole); } catch (\Throwable) {}
		}
		if ($tpl instanceof Template && $tpl->id) {
			try { $templates->delete($tpl); } catch (\Throwable) {}
		}
		if ($fg instanceof Fieldgroup && $fg->id) {
			try { $fieldgroups->delete($fg); } catch (\Throwable) {}
		}
		if ($imgField instanceof Field && $imgField->id) {
			try { $fields->delete($imgField); } catch (\Throwable) {}
		}
		foreach (glob($tmpDir . '/*') ?: [] as $f) {
			if (is_file($f)) {
				@unlink($f);
			}
		}
		if (is_dir($tmpDir)) {
			@rmdir($tmpDir);
		}
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
	}
});

test('Cycle 7 regressions: subtree delete guard, Tiptap quick-edit & raw update guard, mediaToken resize RBAC, SVG style obfuscation, lock races, single theme tokens, and tree unpublished RBAC', function (): void {
	$modules = wire('modules');
	$fields = wire('fields');
	$templates = wire('templates');
	$fieldgroups = wire('fieldgroups');
	$pages = wire('pages');
	$users = wire('users');
	$roles = wire('roles');
	$permissions = wire('permissions');
	/** @var React $react */
	$react = $modules->get('React');

	$prevUser = $users->getCurrentUser();
	$superUser = $users->get('roles=superuser');
	if ($superUser instanceof User && $superUser->id > 0) {
		$users->setCurrentUser($superUser);
	}

	$suffix = bin2hex(random_bytes(3));
	$tmpDir = sys_get_temp_dir() . '/rw-c7-reg-' . $suffix;
	mkdir($tmpDir, 0775, true);

	$titleField = $fields->get('title');
	$tiptapField = null;
	$imgField = null;
	$fg = null;
	$tpl = null;
	$parentPage = null;
	$protectedChild = null;
	$unpubChild = null;
	$probeRole = null;
	$probeUser = null;
	$origImageSelectCfg = $modules->getConfig('ProcessPageEditImageSelect');

	try {
		$tiptapField = new Field();
		$tiptapField->type = $modules->get('FieldtypeTextarea');
		$tiptapField->name = 'rw_c7_tiptap_' . $suffix;
		$tiptapField->set('inputfieldClass', 'InputfieldTiptap');
		$tiptapField->save();

		$imgField = new Field();
		$imgField->type = $modules->get('FieldtypeImage');
		$imgField->name = 'rw_c7_img_' . $suffix;
		$imgField->maxFiles = 2;
		$imgField->extensions = 'png jpg';
		$imgField->save();

		$fg = new Fieldgroup();
		$fg->name = 'rw_c7_fg_' . $suffix;
		if ($titleField instanceof Field) {
			$fg->add($titleField);
		}
		$fg->add($tiptapField);
		$fg->add($imgField);
		$fg->save();

		$tpl = new Template();
		$tpl->name = 'rw_c7_tpl_' . $suffix;
		$tpl->fieldgroup = $fg;
		$tpl->save();

		$parentPage = new Page();
		$parentPage->template = $tpl;
		$parentPage->parent = $pages->get('/');
		$parentPage->name = 'rw-c7-parent-' . $suffix;
		$parentPage->title = 'Parent ' . $suffix;
		$parentPage->set($tiptapField->name, '<p>Initial</p>');
		$parentPage->save();

		$protectedChild = new Page();
		$protectedChild->template = $tpl;
		$protectedChild->parent = $parentPage;
		$protectedChild->name = 'rw-c7-child-' . $suffix;
		$protectedChild->title = 'Protected Child';
		$protectedChild->addStatus(Page::statusSystem);
		$protectedChild->save();

		$unpubChild = new Page();
		$unpubChild->template = $tpl;
		$unpubChild->parent = $parentPage;
		$unpubChild->name = 'rw-c7-unpub-' . $suffix;
		$unpubChild->title = 'Unpublished Child';
		$unpubChild->addStatus(Page::statusUnpublished);
		$unpubChild->save();

		// 1. PagesDataProvider::mutate('delete') refuses recursive delete when a child is protected/non-deleteable
		$provider = new PagesDataProvider('template=' . $tpl->name, []);
		wire($provider);
		expect($provider->mutate('delete', [(string) $parentPage->id]))->toBe(0)
			->and($pages->count('id=' . (int) $parentPage->id . ', include=all'))->toBe(1)
			->and($pages->count('id=' . (int) $protectedChild->id . ', include=all'))->toBe(1);

		// 2. OP_UPDATE_FIELD rejects direct InputfieldTiptap mutation; saveQuickEdit() without _rw_quick_edit_form sanitizes via TiptapContentPolicy
		$rawWriteCount = $provider->mutate(
			\Totoglu\React\Contract\ReactDataProviderInterface::OP_UPDATE_FIELD,
			[(string) $parentPage->id],
			['field' => $tiptapField->name, 'value' => '<p>Bypass</p><script>alert(1)</script>']
		);
		expect($rawWriteCount)->toBe(0);
		$pages->uncacheAll();
		expect((string) $pages->get((int) $parentPage->id)->getUnformatted($tiptapField->name))->toBe('<p>Initial</p>');

		$qeSave = $provider->saveQuickEdit((string) $parentPage->id, [
			$tiptapField->name => '<p>Clean</p><script>alert(1)</script><p onclick="evil()">Safe</p>',
		]);
		expect($qeSave['ok'] ?? false)->toBeTrue();
		$pages->uncacheAll();
		$savedHtml = (string) $pages->get((int) $parentPage->id)->getUnformatted($tiptapField->name);
		expect($savedHtml)->toContain('Clean')
			->and($savedHtml)->toContain('Safe')
			->and($savedHtml)->not->toContain('<script')
			->and($savedHtml)->not->toContain('onclick');

		$badFieldSave = $provider->saveQuickEdit((string) $parentPage->id, [
			'nonexistent_field' => 'tamper',
		]);
		expect($badFieldSave['ok'] ?? true)->toBeFalse();

		// 3. TiptapMediaLinkGateway::executeResize() with mediaToken enforces useImageEditor/page-edit-images and findOriginalPageimageOnPage() skips skipFields
		$png1x1 = (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', true);
		$imgPath = $tmpDir . '/c7-img.png';
		file_put_contents($imgPath, $png1x1);
		$parentPage = $pages->get((int) $parentPage->id);
		$parentPage->of(false);
		$parentPage->getUnformatted($imgField->name)->add($imgPath);
		$parentPage->save();
		$uploadedImg = $parentPage->getUnformatted($imgField->name)->first();

		$superTiToken = $react->tiptap()->sign([
			'editPageId' => (int) $parentPage->id,
			'imageFields' => [$imgField->name],
			'readOnly' => false,
		], (int) $superUser->id);
		$noEditorToken = $react->media()->sign([
			'kind' => 'page',
			'pageId' => (int) $parentPage->id,
			'fieldName' => $imgField->name,
			'isImage' => true,
			'useImageEditor' => false,
		], (int) $superUser->id);
		$deniedByFlag = $react->handleTiptapAction([
			'action' => 'resize',
			'tiptapToken' => $superTiToken,
			'mediaToken' => $noEditorToken,
			'file' => $uploadedImg->basename,
			'width' => 1,
			'_requestMethod' => 'POST',
		], false, $superUser);
		expect($deniedByFlag['ok'] ?? true)->toBeFalse()
			->and($deniedByFlag['status'] ?? 0)->toBe(403);

		$probeRole = $roles->add('rw-c7-role-' . $suffix);
		$viewPerm = $permissions->get('page-view');
		$editPerm = $permissions->get('page-edit');
		if ($viewPerm->id) {
			$probeRole->addPermission($viewPerm);
		}
		if ($editPerm->id) {
			$probeRole->addPermission($editPerm);
		}
		$probeRole->save();
		$probeUser = $users->add('rw-c7-user-' . $suffix);
		$probeUser->pass = 'Cycle7Probe!123';
		$probeUser->addRole($probeRole);
		$probeUser->save();

		if ($permissions->has('page-edit-images')) {
			$probeTiToken = $react->tiptap()->sign([
				'editPageId' => (int) $parentPage->id,
				'imageFields' => [$imgField->name],
				'readOnly' => false,
			], (int) $probeUser->id);
			$probeMediaToken = $react->media()->sign([
				'kind' => 'page',
				'pageId' => (int) $parentPage->id,
				'fieldName' => $imgField->name,
				'isImage' => true,
				'useImageEditor' => true,
			], (int) $probeUser->id);
			$deniedByPerm = $react->handleTiptapAction([
				'action' => 'resize',
				'tiptapToken' => $probeTiToken,
				'mediaToken' => $probeMediaToken,
				'file' => $uploadedImg->basename,
				'width' => 1,
				'_requestMethod' => 'POST',
			], false, $probeUser);
			expect($deniedByPerm['ok'] ?? true)->toBeFalse()
				->and($deniedByPerm['status'] ?? 0)->toBe(403);
		}

		$modules->saveConfig('ProcessPageEditImageSelect', array_merge(is_array($origImageSelectCfg) ? $origImageSelectCfg : [], [
			'skipFields' => $imgField->name,
		]));
		$refFindOrig = new \ReflectionMethod(\Totoglu\React\Tiptap\TiptapMediaLinkGateway::class, 'findOriginalPageimageOnPage');
		expect($refFindOrig->invoke($react->tiptap(), $parentPage, $uploadedImg->basename))->toBeNull();
		$modules->saveConfig('ProcessPageEditImageSelect', is_array($origImageSelectCfg) ? $origImageSelectCfg : []);
		expect($refFindOrig->invoke($react->tiptap(), $parentPage, $uploadedImg->basename))->toBeInstanceOf(\ProcessWire\Pageimage::class);

		// 4. UploadedFileValidator rejects obfuscated SVG inline styles
		$validator = new UploadedFileValidator();
		wire($validator);
		$commentSvg = $tmpDir . '/comment-style.svg';
		$hexSvg = $tmpDir . '/hex-style.svg';
		$escapeSvg = $tmpDir . '/escape-style.svg';
		$safeSvg = $tmpDir . '/safe-style.svg';
		file_put_contents($commentSvg, '<svg xmlns="http://www.w3.org/2000/svg"><rect style="background: u/*x*/rl(https://evil.test)"/></svg>');
		file_put_contents($hexSvg, '<svg xmlns="http://www.w3.org/2000/svg"><rect style="background: \75rl(https://evil.test)"/></svg>');
		file_put_contents($escapeSvg, '<svg xmlns="http://www.w3.org/2000/svg"><rect style="width: e\xpression(alert(1))"/></svg>');
		file_put_contents($safeSvg, '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill: #fff; stroke: url(#grad1)"/></svg>');
		expect($validator->validate($commentSvg, 'svg', true, true))->not->toBeNull()
			->and($validator->validate($hexSvg, 'svg', true, true))->not->toBeNull()
			->and($validator->validate($escapeSvg, 'svg', true, true))->not->toBeNull()
			->and($validator->validate($safeSvg, 'svg', true, true))->toBeNull();

		// 5. EditPresenceStore inode-safe lock handling & WorkspacePreferenceStore::reset() zero orphan .lock
		$presenceStore = $react->presence();
		$presenceKey = 'c7-presence-' . $suffix;
		$nowTs = time();
		$snap = $presenceStore->heartbeat($presenceKey, $superUser, 'c7-client', 60, $nowTs);
		$pFile = $presenceStore->filePath($presenceKey);
		expect($snap['resourceKey'])->toBe($presenceKey)
			->and(is_file($pFile . '.lock'))->toBeTrue();
		$presenceStore->leave($presenceKey, $superUser, 'c7-client', 60, $nowTs + 1);
		if (is_file($pFile . '.lock')) {
			@touch($pFile . '.lock', $nowTs - 7200);
			$presenceStore->pruneExpiredFiles($nowTs, 60);
		}
		expect(is_file($pFile . '.lock'))->toBeFalse();

		$prefStore = $react->workspacePreferences();
		$prefDir = $prefStore->directoryPath();
		$probePrefJson = $prefDir . (int) $probeUser->id . '.json';
		$probePrefLock = $prefDir . (int) $probeUser->id . '.lock';
		if (is_file($probePrefJson)) {
			@unlink($probePrefJson);
		}
		if (is_file($probePrefLock)) {
			@unlink($probePrefLock);
		}
		$resetRes = $prefStore->reset($probeUser);
		expect($resetRes['userId'] ?? 0)->toBe((int) $probeUser->id)
			->and(is_file($probePrefLock))->toBeFalse()
			->and(is_file($probePrefJson))->toBeFalse();

		// 6. EmbeddedAdminPageResponse + React::ready() emit at most ONE id="rw-theme-tokens"
		$prevPage = wire('page');
		$prevAdminTheme = wire('adminTheme');
		$prevScripts = array_values(iterator_to_array(wire('config')->scripts));
		$prevStyles = array_values(iterator_to_array(wire('config')->styles));
		$adminSetupPage = $pages->get('template=admin, name=setup, include=all');
		$testTheme = $prevAdminTheme instanceof \ProcessWire\AdminTheme
			? $prevAdminTheme
			: $modules->get('AdminThemeUikit');
		if ($testTheme instanceof \ProcessWire\AdminTheme && $adminSetupPage instanceof Page && $adminSetupPage->id > 0) {
			wire()->wire('page', $adminSetupPage);
			wire()->wire('adminTheme', $testTheme);
			try {
				$react->inertia()->resetState();
				$embedded = (new \Totoglu\React\Inertia\EmbeddedAdminPageResponse(
					$react->inertia(),
					'Demo/Page',
					['title' => 'Theme Dedupe'],
					$adminSetupPage
				))->withViewData('themeCss', ':root { --rw-probe: 1; }');
				$embedded->toOutput();
				$react->ready();
				$embeddedSecond = (new \Totoglu\React\Inertia\EmbeddedAdminPageResponse(
					$react->inertia(),
					'Demo/Page',
					['title' => 'Theme Dedupe 2'],
					$adminSetupPage
				))->withViewData('themeCss', ':root { --rw-probe: 2; }');
				$embeddedSecond->toOutput();
				$headStr = (string) ($testTheme->getExtraMarkup()['head'] ?? '');
				expect(substr_count($headStr, 'id="rw-theme-tokens"'))->toBe(1);
			} finally {
				if ($prevPage instanceof Page) {
					wire()->wire('page', $prevPage);
				}
				if ($prevAdminTheme instanceof \ProcessWire\AdminTheme) {
					wire()->wire('adminTheme', $prevAdminTheme);
				} else {
					wire()->fuel->remove('adminTheme');
				}
				wire('config')->scripts->removeAll();
				foreach ($prevScripts as $sUrl) {
					wire('config')->scripts->add($sUrl);
				}
				wire('config')->styles->removeAll();
				foreach ($prevStyles as $stUrl) {
					wire('config')->styles->add($stUrl);
				}
			}
		}

		// 7. PageResourceAdapter::tree() does not add include=unpublished without page-edit
		if ($editPerm->id) {
			$probeRole->removePermission($editPerm);
			$probeRole->save();
		}
		$users->setCurrentUser($probeUser);
		$pageAdapter = new \Totoglu\React\Relation\Resource\PageResourceAdapter();
		wire($pageAdapter);
		$treeWithoutEdit = $pageAdapter->tree((int) $parentPage->id, ['allowUnpub' => true]);
		$idsWithoutEdit = array_map(static fn ($item): string => (string) $item->value, $treeWithoutEdit);
		expect($idsWithoutEdit)->not->toContain((string) $unpubChild->id);

		$users->setCurrentUser($superUser);
		$treeWithEdit = $pageAdapter->tree((int) $parentPage->id, ['allowUnpub' => true]);
		$idsWithEdit = array_map(static fn ($item): string => (string) $item->value, $treeWithEdit);
		expect($idsWithEdit)->toContain((string) $unpubChild->id);
	} finally {
		if ($superUser instanceof User && $superUser->id > 0) {
			$users->setCurrentUser($superUser);
		}
		$modules->saveConfig('ProcessPageEditImageSelect', is_array($origImageSelectCfg) ? $origImageSelectCfg : []);
		if ($protectedChild instanceof Page && $protectedChild->id > 0) {
			$protectedChild->of(false);
			$protectedChild->addStatus(Page::statusSystemOverride);
			$protectedChild->removeStatus(Page::statusSystem);
			$protectedChild->removeStatus(Page::statusSystemOverride);
			$protectedChild->save();
			try { $pages->delete($protectedChild, true); } catch (\Throwable) {}
		}
		if ($unpubChild instanceof Page && $unpubChild->id > 0) {
			try { $pages->delete($unpubChild, true); } catch (\Throwable) {}
		}
		if ($parentPage instanceof Page && $parentPage->id > 0) {
			try { $pages->delete($parentPage, true); } catch (\Throwable) {}
		}
		if ($probeUser instanceof User && $probeUser->id > 0) {
			try { $users->delete($probeUser, true); } catch (\Throwable) {}
		}
		if ($probeRole instanceof Role && $probeRole->id > 0) {
			try { $roles->delete($probeRole); } catch (\Throwable) {}
		}
		if ($tpl instanceof Template && $tpl->id > 0) {
			try { $templates->delete($tpl); } catch (\Throwable) {}
		}
		if ($fg instanceof Fieldgroup && $fg->id > 0) {
			try { $fieldgroups->delete($fg); } catch (\Throwable) {}
		}
		foreach ([$tiptapField, $imgField] as $tmpField) {
			if ($tmpField instanceof Field && $tmpField->id > 0) {
				try { $fields->delete($tmpField); } catch (\Throwable) {}
			}
		}
		foreach (glob($tmpDir . '/*') ?: [] as $f) {
			if (is_file($f)) {
				@unlink($f);
			}
		}
		if (is_dir($tmpDir)) {
			@rmdir($tmpDir);
		}
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
	}
});

test('Cycle 8 regressions: preference reset symlink guard, page-edit-lang-none, Tiptap guest fail-closed, IconManager config/value, admin head deduplication, and viewport i18n defaults', function (): void {
	/** @var React $react */
	$react = wire('react');
	$pages = wire('pages');
	$users = wire('users');
	$roles = wire('roles');
	$permissions = wire('permissions');
	$fields = wire('fields');
	$fieldgroups = wire('fieldgroups');
	$templates = wire('templates');
	$modules = wire('modules');
	$languages = wire('languages');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	/** @var User $superUser */
	$superUser = $users->get($superId);
	$prevUser = wire('user');
	$prevCachePath = (string) wire('config')->paths->cache;

	$suffix = bin2hex(random_bytes(4));
	$tmpDir = sys_get_temp_dir() . '/rw-cycle8-' . $suffix;
	mkdir($tmpDir, 0775, true);

	$plainField = null;
	$fg = null;
	$tpl = null;
	$testPage = null;
	$probeRole = null;
	$probeUser = null;
	$createdLangNonePerm = null;

	try {
		// 1. WorkspacePreferenceStore::reset() refuses symlinked directory and symlinked lockfile without unlinking $path
		$store = new WorkspacePreferenceStore();
		wire($store);

		$symlinkTarget = $tmpDir . '/outside-target';
		file_put_contents($symlinkTarget, 'do-not-touch');

		// 1a. Symlinked lockfile
		$cacheA = $tmpDir . '/cache-a/';
		$wsDirA = $cacheA . 'React/workspaces/';
		mkdir($wsDirA, 0775, true);
		wire('config')->paths->cache = $cacheA;
		$uid = (int) $superUser->id;
		$jsonA = $wsDirA . $uid . '.json';
		$lockA = $wsDirA . $uid . '.lock';
		file_put_contents($jsonA, (string) json_encode(['themeMode' => 'dark']));
		@symlink($symlinkTarget, $lockA);
		$resA = $store->reset($superUser);
		expect($resA['userId'])->toBe($uid)
			->and($resA['themeMode'])->toBe('')
			->and(is_file($jsonA))->toBeTrue();

		// 1b. Symlinked directory
		$realDirB = $tmpDir . '/real-ws-dir/';
		mkdir($realDirB, 0775, true);
		$jsonB = $realDirB . $uid . '.json';
		$lockB = $realDirB . $uid . '.lock';
		file_put_contents($jsonB, (string) json_encode(['themeMode' => 'light']));
		$cacheB = $tmpDir . '/cache-b/';
		mkdir($cacheB . 'React', 0775, true);
		@symlink(rtrim($realDirB, '/'), $cacheB . 'React/workspaces');
		wire('config')->paths->cache = $cacheB;
		$resB = $store->reset($superUser);
		expect($resB['userId'])->toBe($uid)
			->and($resB['themeMode'])->toBe('')
			->and(is_file($jsonB))->toBeTrue()
			->and(file_exists($lockB))->toBeFalse();

		wire('config')->paths->cache = $prevCachePath;

		// 2. PagesDataProvider::canWriteField() / mutate('update_field') / saveQuickEdit() enforce page-edit-lang-none
		if ($languages instanceof Languages) {
			$users->setCurrentUser($superUser);
			if (!$permissions->has('page-edit-lang-none')) {
				$createdLangNonePerm = $permissions->add('page-edit-lang-none');
				$createdLangNonePerm->save();
			}
			$refPerms = new \ReflectionProperty($languages, 'pageEditPermissions');
			$refEditable = new \ReflectionProperty($languages, 'editableCache');
			$refPerms->setValue($languages, null);
			$refEditable->setValue($languages, []);

			$plainField = new Field();
			$plainField->type = $modules->get('FieldtypeText');
			$plainField->name = 'rw_c8_plain_' . $suffix;
			$plainField->label = 'Plain Text';
			$fields->save($plainField);

			$fg = new Fieldgroup();
			$fg->name = 'rw_c8_tpl_' . $suffix;
			$fg->add($fields->get('title'));
			$fg->add($plainField);
			$fieldgroups->save($fg);

			$tpl = new Template();
			$tpl->name = $fg->name;
			$tpl->fieldgroup = $fg;
			$templates->save($tpl);

			$testPage = new Page();
			$testPage->template = $tpl;
			$testPage->parent = $pages->get(1);
			$testPage->name = 'rw-c8-page-' . $suffix;
			$testPage->title = 'Cycle 8 Page';
			$testPage->set($plainField->name, 'Original');
			$pages->save($testPage);

			$probeRole = $roles->add('rw-c8-role-' . $suffix);
			foreach (['page-view', 'page-edit'] as $permName) {
				$permObj = $permissions->get($permName);
				if ($permObj instanceof Permission && $permObj->id > 0) {
					$probeRole->addPermission($permObj);
				}
			}
			$probeRole->save();

			$tpl->useRoles = 1;
			$tpl->set('roles', [(int) $roles->getGuestRole()->id, (int) $probeRole->id]);
			$tpl->set('editRoles', [(int) $probeRole->id]);
			$templates->save($tpl);

			$probeUser = $users->add('rw-c8-user-' . $suffix);
			$probeUser->pass = 'Cycle8Probe!123';
			$probeUser->addRole('guest');
			$probeUser->addRole($probeRole);
			$probeUser->save();

			$pages->uncacheAll();
			$testPage = $pages->get((int) $testPage->id);
			$probeUser = $users->get((int) $probeUser->id);
			$users->setCurrentUser($probeUser);
			$refEditable->setValue($languages, []);
			$provider = new PagesDataProvider('template=' . $tpl->name, []);
			wire($provider);
			$refCanWrite = new \ReflectionMethod($provider, 'canWriteField');

			expect($testPage->editable($plainField->name))->toBeTrue()
				->and($languages->editable('none'))->toBeFalse()
				->and($refCanWrite->invoke($provider, $testPage, $plainField->name, true))->toBeFalse()
				->and($provider->mutate(
					ReactDataProviderInterface::OP_UPDATE_FIELD,
					[(string) $testPage->id],
					['field' => $plainField->name, 'value' => 'Blocked']
				))->toBe(0);

			$deniedQe = $provider->saveQuickEdit((string) $testPage->id, [
				$plainField->name => 'Blocked',
			]);
			expect($deniedQe['ok'] ?? true)->toBeFalse();

			$users->setCurrentUser($superUser);
			$langNonePerm = $permissions->get('page-edit-lang-none');
			if ($langNonePerm instanceof Permission && $langNonePerm->id > 0) {
				$probeRole->addPermission($langNonePerm);
				$probeRole->save();
			}
			$pages->uncacheAll();
			$superUser = $users->get($superId);
			$probeUser = $users->get((int) $probeUser->id);
			$testPage = $pages->get((int) $testPage->id);
			$users->setCurrentUser($probeUser);
			$refPerms->setValue($languages, null);
			$refEditable->setValue($languages, []);

			expect($languages->editable('none'))->toBeTrue()
				->and($refCanWrite->invoke($provider, $testPage, $plainField->name, true))->toBeTrue()
				->and($provider->mutate(
					ReactDataProviderInterface::OP_UPDATE_FIELD,
					[(string) $testPage->id],
					['field' => $plainField->name, 'value' => 'AllowedMutate']
				))->toBe(1);

			$allowedQe = $provider->saveQuickEdit((string) $testPage->id, [
				$plainField->name => 'AllowedQuickEdit',
			]);
			expect($allowedQe['ok'] ?? false)->toBeTrue();
			$pages->uncacheAll();
			expect((string) $pages->get((int) $testPage->id)->getUnformatted($plainField->name))->toBe('AllowedQuickEdit');
		}

		// 3. InputfieldTiptap::___isLanguageEditable() fails closed for guest without $hasPage
		if ($languages instanceof Languages) {
			$defaultLang = $languages->getDefault();
			if ($defaultLang instanceof Language && $defaultLang->id > 0) {
				$users->setCurrentUser($users->getGuestUser());
				/** @var InputfieldTiptap $tiptap */
				$tiptap = $modules->get('InputfieldTiptap');
				expect($tiptap->isLanguageEditable($defaultLang))->toBeFalse();
			}
		}

		// 4. IconManager::buildControlConfig() & resolveControlValue() consistency across InputfieldReactIcon & FormSchemaSerializer
		$users->setCurrentUser($superUser);
		$rootUrl = (string) (wire('config')->urls->root ?: '/');

		/** @var InputfieldReactIcon $iconInput */
		$iconInput = $modules->get('InputfieldReactIcon');
		$iconInput->attr('name', 'my_icon');
		$iconInput->set('allowCustomization', false);
		$iconInput->set('iconPrefixMode', 'vector');
		$iconInput->set('previewSize', 32);
		$iconInput->attr('value', 'star');

		$expectedCfg = IconManager::buildControlConfig([
			'allowCustomization' => false,
			'iconPrefixMode' => 'vector',
			'previewSize' => 32,
		], $rootUrl);
		$expectedVal = IconManager::resolveControlValue('star', $expectedCfg);

		$form = new InputfieldForm();
		wire($form);
		$form->add($iconInput);
		$serializer = new FormSchemaSerializer();
		wire($serializer);
		$formSchema = $serializer->serialize($form);
		$defSchema = $serializer->serializeDefinitions([
			[
				'type' => 'icon',
				'name' => 'my_icon',
				'allowCustomization' => false,
				'prefixMode' => 'vector',
				'previewSize' => 32,
				'value' => 'star',
			],
		]);

		expect($iconInput->buildIconConfig())->toBe($expectedCfg)
			->and($iconInput->toInertiaProp()['value'])->toBe($expectedVal)
			->and($formSchema['fields'][0]['iconConfig'])->toBe($expectedCfg)
			->and($formSchema['fields'][0]['value'])->toBe($expectedVal)
			->and($defSchema['fields'][0]['iconConfig'])->toBe($expectedCfg)
			->and($defSchema['fields'][0]['value'])->toBe($expectedVal)
			->and($expectedVal)->toBe('rwv--star');

		// 5. EmbeddedAdminPageResponse deduplicates pw-color-scheme-tokens and rw-admin-shell-bootstrap
		$prevPage = wire('page');
		$prevAdminTheme = wire('adminTheme');
		$prevScripts = array_values(iterator_to_array(wire('config')->scripts));
		$prevStyles = array_values(iterator_to_array(wire('config')->styles));
		$adminSetupPage = $pages->get('template=admin, name=setup, include=all');
		$testTheme = $prevAdminTheme instanceof \ProcessWire\AdminTheme
			? $prevAdminTheme
			: $modules->get('AdminThemeUikit');
		if ($testTheme instanceof \ProcessWire\AdminTheme && $adminSetupPage instanceof Page && $adminSetupPage->id > 0) {
			wire()->wire('page', $adminSetupPage);
			wire()->wire('adminTheme', $testTheme);
			try {
				$react->inertia()->resetState();
				$first = (new EmbeddedAdminPageResponse(
					$react->inertia(),
					'Demo/Page',
					['title' => 'Dedupe 1'],
					$adminSetupPage
				))->withViewData('colorSchemeCss', ':root { --pw-c8-probe: 1; }');
				$first->toOutput();
				$second = (new EmbeddedAdminPageResponse(
					$react->inertia(),
					'Demo/Page',
					['title' => 'Dedupe 2'],
					$adminSetupPage
				))->withViewData('colorSchemeCss', ':root { --pw-c8-probe: 2; }');
				$second->toOutput();
				$headStr = (string) ($testTheme->getExtraMarkup()['head'] ?? '');
				expect(substr_count($headStr, 'id="pw-color-scheme-tokens"'))->toBe(1)
					->and(substr_count($headStr, 'id="rw-admin-shell-bootstrap"'))->toBe(1);
			} finally {
				if ($prevPage instanceof Page) {
					wire()->wire('page', $prevPage);
				}
				if ($prevAdminTheme instanceof \ProcessWire\AdminTheme) {
					wire()->wire('adminTheme', $prevAdminTheme);
				} else {
					wire()->fuel->remove('adminTheme');
				}
				wire('config')->scripts->removeAll();
				foreach ($prevScripts as $sUrl) {
					wire('config')->scripts->add($sUrl);
				}
				wire('config')->styles->removeAll();
				foreach ($prevStyles as $stUrl) {
					wire('config')->styles->add($stUrl);
				}
			}
		}

		// 6. MarkupReactViewport default emptyTitle, emptyMessage, and searchPlaceholder return ''
		$table = $react->table();
		expect($table->emptyTitle)->toBe('')
			->and($table->emptyMessage)->toBe('')
			->and($table->searchPlaceholder)->toBe('');
		$table->emptyTitle = 'Custom';
		$table->emptyMessage = 'Custom msg';
		$table->searchPlaceholder = 'Custom search';
		$table->resetViewportState();
		expect($table->emptyTitle)->toBe('')
			->and($table->emptyMessage)->toBe('')
			->and($table->searchPlaceholder)->toBe('');
	} finally {
		wire('config')->paths->cache = $prevCachePath;
		if ($superUser instanceof User && $superUser->id > 0) {
			$users->setCurrentUser($superUser);
		}
		if ($testPage instanceof Page && $testPage->id > 0) {
			try { $pages->delete($testPage, true); } catch (\Throwable) {}
		}
		if ($probeUser instanceof User && $probeUser->id > 0) {
			try { $users->delete($probeUser, true); } catch (\Throwable) {}
		}
		if ($probeRole instanceof Role && $probeRole->id > 0) {
			try { $roles->delete($probeRole); } catch (\Throwable) {}
		}
		if ($createdLangNonePerm instanceof Permission && $createdLangNonePerm->id > 0) {
			try { $permissions->delete($createdLangNonePerm); } catch (\Throwable) {}
		}
		if ($languages instanceof Languages) {
			$refPerms = new \ReflectionProperty($languages, 'pageEditPermissions');
			$refEditable = new \ReflectionProperty($languages, 'editableCache');
			$refPerms->setValue($languages, null);
			$refEditable->setValue($languages, []);
		}
		if ($tpl instanceof Template && $tpl->id > 0) {
			try { $templates->delete($tpl); } catch (\Throwable) {}
		}
		if ($fg instanceof Fieldgroup && $fg->id > 0) {
			try { $fieldgroups->delete($fg); } catch (\Throwable) {}
		}
		if ($plainField instanceof Field && $plainField->id > 0) {
			try { $fields->delete($plainField); } catch (\Throwable) {}
		}
		$cleanTree = static function (string $dirPath) use (&$cleanTree): void {
			if (!is_dir($dirPath)) {
				return;
			}
			foreach (scandir($dirPath) ?: [] as $entry) {
				if ($entry === '.' || $entry === '..') {
					continue;
				}
				$full = $dirPath . '/' . $entry;
				if (is_link($full) || is_file($full)) {
					@unlink($full);
				} elseif (is_dir($full)) {
					$cleanTree($full);
				}
			}
			@rmdir($dirPath);
		};
		$cleanTree($tmpDir);
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
	}
});

test('Cycle 9 regressions: AccessGuard::canEditFieldByLanguage, media/tiptap page-edit-lang-none, link-media symlink containment, and tel catalog keys', function (): void {
	/** @var React $react */
	$react = wire('react');
	$pages = wire('pages');
	$fields = wire('fields');
	$fieldgroups = wire('fieldgroups');
	$templates = wire('templates');
	$modules = wire('modules');
	$users = wire('users');
	$roles = wire('roles');
	$permissions = wire('permissions');
	$languages = wire('languages');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	/** @var User $superUser */
	$superUser = $users->get($superId);
	$prevUser = wire('user');

	$suffix = bin2hex(random_bytes(4));
	$tmpDir = sys_get_temp_dir() . '/rw-cycle9-' . $suffix;
	mkdir($tmpDir, 0775, true);

	$summaryBaseField = null;
	$summaryAltField = null;
	$plainField = null;
	$imgField = null;
	$linkField = null;
	$fg = null;
	$tpl = null;
	$testPage = null;
	$probeRole = null;
	$probeUser = null;
	$createdPerms = [];

	try {
		// 1. AccessGuard::canEditFieldByLanguage(), PagesDataProvider, MediaGateway, PageLinkMediaHostAdapter, TiptapMediaLinkGateway
		if ($languages instanceof Languages) {
			$users->setCurrentUser($superUser);
			$defaultLang = $languages->getDefault();
			$altLang = null;
			foreach ($languages as $langCandidate) {
				if ($langCandidate instanceof Language && !$langCandidate->isDefault() && $langCandidate->name !== '') {
					$altLang = $langCandidate;
					break;
				}
			}

			if ($defaultLang instanceof Language && $altLang instanceof Language) {
				$permNames = [
					'page-edit-lang-none',
					'page-edit-lang-default',
					'page-edit-lang-' . $altLang->name,
					'page-edit-images',
				];
				foreach ($permNames as $pName) {
					if (!$permissions->has($pName)) {
						$created = $permissions->add($pName);
						$created->save();
						$createdPerms[] = $created;
					}
				}

				$refPerms = new \ReflectionProperty($languages, 'pageEditPermissions');
				$refEditable = new \ReflectionProperty($languages, 'editableCache');
				$refPerms->setValue($languages, null);
				$refEditable->setValue($languages, []);

				$summaryBaseField = new Field();
				$summaryBaseField->type = $modules->get('FieldtypeText');
				$summaryBaseField->name = 'rw_c9_sum_' . $suffix;
				$summaryBaseField->label = 'Summary Default';
				$fields->save($summaryBaseField);

				$summaryAltField = new Field();
				$summaryAltField->type = $modules->get('FieldtypeText');
				$summaryAltField->name = $summaryBaseField->name . '_' . $altLang->name;
				$summaryAltField->label = 'Summary Alt';
				$fields->save($summaryAltField);

				$plainField = new Field();
				$plainField->type = $modules->get('FieldtypeText');
				$plainField->name = 'rw_c9_plain_' . $suffix;
				$plainField->label = 'Plain Text';
				$fields->save($plainField);

				$imgField = new Field();
				$imgField->type = $modules->get('FieldtypeImage');
				$imgField->name = 'rw_c9_img_' . $suffix;
				$imgField->label = 'Single Image';
				$imgField->set('extensions', 'png jpg');
				$imgField->set('maxFiles', 5);
				$fields->save($imgField);

				$linkField = new Field();
				$linkField->type = $modules->get('FieldtypeText');
				$linkField->name = 'rw_c9_lnk_' . $suffix;
				$linkField->label = 'Link Media';
				$linkField->set('inputfieldClass', 'InputfieldReactLink');
				$linkField->set('linkTypes', ['page', 'url', 'file', 'image', 'email', 'tel']);
				$linkField->set('mediaProfiles', ['image' => ['extensions' => ['png', 'jpg']], 'file' => ['extensions' => ['pdf']]]);
				$fields->save($linkField);

				$fg = new Fieldgroup();
				$fg->name = 'rw_c9_tpl_' . $suffix;
				$fg->add($fields->get('title'));
				$fg->add($summaryBaseField);
				$fg->add($summaryAltField);
				$fg->add($plainField);
				$fg->add($imgField);
				$fg->add($linkField);
				$fieldgroups->save($fg);

				$tpl = new Template();
				$tpl->name = $fg->name;
				$tpl->fieldgroup = $fg;
				$templates->save($tpl);

				$testPage = new Page();
				$testPage->template = $tpl;
				$testPage->parent = $pages->get(1);
				$testPage->name = 'rw-c9-page-' . $suffix;
				$testPage->title = 'Cycle 9 Page';
				$testPage->set($summaryBaseField->name, 'Default text');
				$testPage->set($summaryAltField->name, 'Alt text');
				$testPage->set($plainField->name, 'Plain text');
				$pages->save($testPage);

				// Add a real 1x1 PNG to the single-language image field for executeResize() checks
				$samplePng = $tmpDir . '/sample.png';
				$pngData = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
				file_put_contents($samplePng, $pngData);
				$testPage->of(false);
				$testPage->getUnformatted($imgField->name)->add($samplePng);
				$pages->save($testPage);

				// Editor role with page-edit + page-edit-images + page-edit-lang-none + page-edit-lang-{alt} (NO page-edit-lang-default)
				$probeRole = $roles->add('rw-c9-role-' . $suffix);
				foreach (['page-view', 'page-edit', 'page-edit-images', 'page-edit-lang-none', 'page-edit-lang-' . $altLang->name] as $pName) {
					$permObj = $permissions->get($pName);
					if ($permObj instanceof Permission && $permObj->id > 0) {
						$probeRole->addPermission($permObj);
					}
				}
				$probeRole->save();

				$tpl->useRoles = 1;
				$tpl->set('roles', [(int) $roles->getGuestRole()->id, (int) $probeRole->id]);
				$tpl->set('editRoles', [(int) $probeRole->id]);
				$templates->save($tpl);

				$probeUser = $users->add('rw-c9-user-' . $suffix);
				$probeUser->pass = 'Cycle9Probe!123';
				$probeUser->addRole('guest');
				$probeUser->addRole($probeRole);
				$probeUser->save();

				$pages->uncacheAll();
				$testPage = $pages->get((int) $testPage->id);
				$probeUser = $users->get((int) $probeUser->id);
				$users->setCurrentUser($probeUser);
				$refEditable->setValue($languages, []);

				$provider = new PagesDataProvider('template=' . $tpl->name, []);
				wire($provider);
				$refCanWrite = new \ReflectionMethod($provider, 'canWriteField');

				// Default-language base field of alternate pair enforces $languages->editable($defaultLang), NOT 'none'
				expect(AccessGuard::canEditFieldByLanguage(wire(), $testPage, $summaryBaseField, $probeUser))->toBeFalse()
					->and(AccessGuard::canEditFieldByLanguage(wire(), $testPage, $summaryAltField, $probeUser))->toBeTrue()
					->and(AccessGuard::canEditFieldByLanguage(wire(), $testPage, $plainField, $probeUser))->toBeTrue()
					->and($refCanWrite->invoke($provider, $testPage, $summaryBaseField->name, true))->toBeFalse()
					->and($refCanWrite->invoke($provider, $testPage, $summaryAltField->name, true))->toBeTrue()
					->and($refCanWrite->invoke($provider, $testPage, $plainField->name, true))->toBeTrue();

				// Switch permissions: grant page-edit-lang-default and revoke page-edit-lang-none
				$users->setCurrentUser($superUser);
				$nonePerm = $permissions->get('page-edit-lang-none');
				$defaultPerm = $permissions->get('page-edit-lang-default');
				if ($nonePerm instanceof Permission && $nonePerm->id > 0) {
					$probeRole->removePermission($nonePerm);
				}
				if ($defaultPerm instanceof Permission && $defaultPerm->id > 0) {
					$probeRole->addPermission($defaultPerm);
				}
				$probeRole->save();

				$pages->uncacheAll();
				$testPage = $pages->get((int) $testPage->id);
				$probeUser = $users->get((int) $probeUser->id);
				$users->setCurrentUser($probeUser);
				$refPerms->setValue($languages, null);
				$refEditable->setValue($languages, []);

				expect(AccessGuard::canEditFieldByLanguage(wire(), $testPage, $summaryBaseField, $probeUser))->toBeTrue()
					->and(AccessGuard::canEditFieldByLanguage(wire(), $testPage, $imgField, $probeUser))->toBeFalse()
					->and(AccessGuard::canEditFieldByLanguage(wire(), $testPage, $linkField, $probeUser))->toBeFalse();

				// MediaGateway::resolveTargetContext() & buildEnvelopeFromInputfield() enforce page-edit-lang-none
				$mediaGw = $react->media();
				$refMediaTarget = new \ReflectionMethod($mediaGw, 'resolveTargetContext');
				$deniedMediaTarget = $refMediaTarget->invoke($mediaGw, [
					'kind' => 'page',
					'pageId' => (int) $testPage->id,
					'rootPageId' => (int) $testPage->id,
					'fieldName' => $imgField->name,
				], $probeUser, true);
				expect($deniedMediaTarget['ok'] ?? true)->toBeFalse()
					->and($deniedMediaTarget['status'] ?? 0)->toBe(403);

				$imgInputfield = $imgField->getInputfield($testPage);
				$builtEnv = $mediaGw->buildEnvelopeFromInputfield($imgInputfield, true, $imgField->name, ['png', 'jpg'], false);
				expect($builtEnv)->toBeArray()
					->and($builtEnv['readOnly'] ?? false)->toBeTrue();

				// PageLinkMediaHostAdapter::resolveTargetContext() enforces page-edit-lang-none
				$linkAdapter = new PageLinkMediaHostAdapter();
				wire($linkAdapter);
				$deniedLinkTarget = $linkAdapter->resolveTargetContext([
					'kind' => PageLinkMediaHostAdapter::KIND,
					'pageId' => (int) $testPage->id,
					'rootPageId' => (int) $testPage->id,
					'fieldName' => $linkField->name,
					'mediaProfile' => 'image',
				], $probeUser, true);
				expect($deniedLinkTarget['ok'] ?? true)->toBeFalse()
					->and($deniedLinkTarget['status'] ?? 0)->toBe(403);

				// TiptapMediaLinkGateway enforces page-edit-lang-none across assembleClientContext, resolveUploadImageField, executeResize
				$tiptapGw = $react->tiptap();
				$refAssemble = new \ReflectionMethod($tiptapGw, 'assembleClientContext');
				$deniedTiptapCtx = $refAssemble->invoke($tiptapGw, $testPage, 'title', [$imgField->name], false);
				expect($deniedTiptapCtx['canUploadImages'])->toBeFalse()
					->and($deniedTiptapCtx['uploadFieldName'])->toBe('');

				$refResolveUpload = new \ReflectionMethod($tiptapGw, 'resolveUploadImageField');
				expect($refResolveUpload->invoke($tiptapGw, $testPage, [$imgField->name], '', $probeUser))->toBeNull();

				$refExecResize = new \ReflectionMethod($tiptapGw, 'executeResize');
				$pageImageItem = $testPage->getUnformatted($imgField->name)->first();
				$deniedResize = $refExecResize->invoke($tiptapGw, [
					'pageId' => (int) $testPage->id,
					'editPageId' => (int) $testPage->id,
					'fieldName' => 'title',
					'imageFields' => [$imgField->name],
					'readOnly' => false,
				], [
					'pageId' => (int) $testPage->id,
					'file' => $pageImageItem->basename(),
					'width' => 1,
				], $probeUser);
				expect($deniedResize['ok'] ?? true)->toBeFalse()
					->and($deniedResize['status'] ?? 0)->toBe(403);

				// Restore page-edit-lang-none and verify media/tiptap edit access succeeds
				$users->setCurrentUser($superUser);
				if ($nonePerm instanceof Permission && $nonePerm->id > 0) {
					$probeRole->addPermission($nonePerm);
					$probeRole->save();
				}
				$pages->uncacheAll();
				$testPage = $pages->get((int) $testPage->id);
				$probeUser = $users->get((int) $probeUser->id);
				$users->setCurrentUser($probeUser);
				$refPerms->setValue($languages, null);
				$refEditable->setValue($languages, []);

				$allowedMediaTarget = $refMediaTarget->invoke($mediaGw, [
					'kind' => 'page',
					'pageId' => (int) $testPage->id,
					'rootPageId' => (int) $testPage->id,
					'fieldName' => $imgField->name,
				], $probeUser, true);
				$allowedLinkTarget = $linkAdapter->resolveTargetContext([
					'kind' => PageLinkMediaHostAdapter::KIND,
					'pageId' => (int) $testPage->id,
					'rootPageId' => (int) $testPage->id,
					'fieldName' => $linkField->name,
					'mediaProfile' => 'image',
				], $probeUser, true);
				$allowedUploadField = $refResolveUpload->invoke($tiptapGw, $testPage, [$imgField->name], '', $probeUser);
				expect($allowedMediaTarget['ok'] ?? false)->toBeTrue()
					->and($allowedLinkTarget['ok'] ?? false)->toBeTrue()
					->and($allowedUploadField)->toBeInstanceOf(Field::class);

				// 2. MediaGateway::resolveLinkSelectedMedia() rejects symlinked link-media file and symlinked directory
				$users->setCurrentUser($superUser);
				$outsideFile = $tmpDir . '/outside.png';
				file_put_contents($outsideFile, $pngData);
				$linkDir = PageLinkMediaHostAdapter::directoryPathFor($testPage, $linkField->name);
				if (!is_dir($linkDir)) {
					mkdir($linkDir, 0775, true);
				}
				@symlink($outsideFile, $linkDir . 'evil.png');
				expect($mediaGw->resolveLinkSelectedMedia($testPage, $linkField->name, 'evil.png'))->toBeNull();
				@unlink($linkDir . 'evil.png');

				$realLinkDir = $tmpDir . '/real-link-dir';
				mkdir($realLinkDir, 0775, true);
				file_put_contents($realLinkDir . '/real.png', $pngData);
				@rmdir(rtrim($linkDir, '/\\'));
				@symlink($realLinkDir, rtrim($linkDir, '/\\'));
				expect($mediaGw->resolveLinkSelectedMedia($testPage, $linkField->name, 'real.png'))->toBeNull();
				@unlink(rtrim($linkDir, '/\\'));
			}
		}

		// 3. TranslationCatalogService exposes link.type.tel, link.placeholder.tel, and Cycle 9 client keys
		$users->setCurrentUser($superUser);
		$coreCatalog = $react->resolveModuleTranslations($react);
		expect($coreCatalog)->toHaveKey('link.type.tel', 'Phone')
			->and($coreCatalog)->toHaveKey('link.placeholder.tel', '+1 555 010 2030')
			->and($coreCatalog)->toHaveKey('common.copyFailed', 'Copy failed')
			->and($coreCatalog)->toHaveKey('common.expand', 'Expand')
			->and($coreCatalog)->toHaveKey('common.collapse', 'Collapse')
			->and($coreCatalog)->toHaveKey('icon.radius.full', 'Circle')
			->and($coreCatalog)->toHaveKey('relation.allTypes', 'All Types');
	} finally {
		$users->setCurrentUser($superUser);
		if ($testPage instanceof Page && $testPage->id > 0) {
			try { $pages->delete($testPage, true); } catch (\Throwable) {}
		}
		if ($probeUser instanceof User && $probeUser->id > 0) {
			try { $users->delete($probeUser, true); } catch (\Throwable) {}
		}
		if ($probeRole instanceof Role && $probeRole->id > 0) {
			try { $roles->delete($probeRole); } catch (\Throwable) {}
		}
		foreach ($createdPerms as $perm) {
			if ($perm instanceof Permission && $perm->id > 0) {
				try { $permissions->delete($perm); } catch (\Throwable) {}
			}
		}
		if ($languages instanceof Languages) {
			$refPerms = new \ReflectionProperty($languages, 'pageEditPermissions');
			$refEditable = new \ReflectionProperty($languages, 'editableCache');
			$refPerms->setValue($languages, null);
			$refEditable->setValue($languages, []);
		}
		if ($tpl instanceof Template && $tpl->id > 0) {
			try { $templates->delete($tpl); } catch (\Throwable) {}
		}
		if ($fg instanceof Fieldgroup && $fg->id > 0) {
			try { $fieldgroups->delete($fg); } catch (\Throwable) {}
		}
		foreach ([$linkField, $imgField, $plainField, $summaryAltField, $summaryBaseField] as $fld) {
			if ($fld instanceof Field && $fld->id > 0) {
				try { $fields->delete($fld); } catch (\Throwable) {}
			}
		}
		$cleanTree = static function (string $dirPath) use (&$cleanTree): void {
			if (!is_dir($dirPath)) {
				return;
			}
			foreach (scandir($dirPath) ?: [] as $entry) {
				if ($entry === '.' || $entry === '..') {
					continue;
				}
				$full = $dirPath . '/' . $entry;
				if (is_link($full) || is_file($full)) {
					@unlink($full);
				} elseif (is_dir($full)) {
					$cleanTree($full);
				}
			}
			@rmdir($dirPath);
		};
		$cleanTree($tmpDir);
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
	}
});

test('PagesDataProvider::saveQuickEdit preserves default language on partial secondary update, InputfieldReactLink honors standalone lang perms, and TiptapMediaLinkGateway scopes page-edit-images', function (): void {
	/** @var React $react */
	$react = wire('react');
	$pages = wire('pages');
	$fields = wire('fields');
	$fieldgroups = wire('fieldgroups');
	$templates = wire('templates');
	$modules = wire('modules');
	$users = wire('users');
	$roles = wire('roles');
	$permissions = wire('permissions');
	$languages = wire('languages');
	$prevUser = $users->getCurrentUser();
	$superId = (int) wire('config')->superUserPageID ?: 41;
	$superUser = $users->get($superId);
	$prevSuperLang = $superUser instanceof User ? $superUser->language : null;

	$suffix = bin2hex(random_bytes(3));
	$tmpDir = sys_get_temp_dir() . '/rw-p1-fix-' . $suffix;
	mkdir($tmpDir, 0775, true);

	$imgField = null;
	$fg = null;
	$tpl = null;
	$testPage = null;
	$probeRole = null;
	$probeUser = null;
	$standaloneRole = null;
	$standaloneUser = null;
	$createdPerms = [];

	try {
		$users->setCurrentUser($superUser);

		$imgField = new Field();
		$imgField->type = $modules->get('FieldtypeImage');
		$imgField->name = 'rw_p1_img_' . $suffix;
		$imgField->label = 'P1 Test Image';
		$imgField->set('extensions', 'png jpg');
		$imgField->set('maxFiles', 5);
		$fields->save($imgField);

		$fg = new Fieldgroup();
		$fg->name = 'rw_p1_tpl_' . $suffix;
		$fg->add($fields->get('title'));
		$fg->add($imgField);
		$fieldgroups->save($fg);

		$tpl = new Template();
		$tpl->name = $fg->name;
		$tpl->fieldgroup = $fg;
		$templates->save($tpl);

		$testPage = new Page();
		$testPage->template = $tpl;
		$testPage->parent = $pages->get(1);
		$testPage->name = 'rw-p1-page-' . $suffix;
		$testPage->title = 'Default English Title';
		$pages->save($testPage);

		$samplePng = $tmpDir . '/sample.png';
		$pngData = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
		file_put_contents($samplePng, (string) $pngData);
		$testPage->of(false);
		$testPage->getUnformatted($imgField->name)->add($samplePng);
		$pages->save($testPage);

		if ($languages instanceof Languages) {
			$defaultLang = $languages->getDefault();
			$altLang = null;
			foreach ($languages as $langCandidate) {
				if ($langCandidate instanceof Language && !$langCandidate->isDefault() && $langCandidate->name !== '') {
					$altLang = $langCandidate;
					break;
				}
			}

			if ($defaultLang instanceof Language && $altLang instanceof Language) {
				foreach (['page-edit-lang-default', 'page-edit-lang-' . $altLang->name] as $pName) {
					if (!$permissions->has($pName)) {
						$created = $permissions->add($pName);
						$created->save();
						$createdPerms[] = $created;
					}
				}

				$refPerms = new \ReflectionProperty($languages, 'pageEditPermissions');
				$refEditable = new \ReflectionProperty($languages, 'editableCache');
				$refPerms->setValue($languages, null);
				$refEditable->setValue($languages, []);

				// 1. PagesDataProvider::saveQuickEdit() partial secondary-language update while user->language is non-default
				$titleField = $fields->get('title');
				if ($titleField instanceof Field && (bool) $titleField->getInputfield($testPage)->getSetting('useLanguages')) {
					$testPage->of(false);
					$testPage->setLanguageValue($defaultLang, 'title', 'Default English Title');
					$testPage->setLanguageValue($altLang, 'title', 'Initial Alt Title');
					$pages->save($testPage);

					$superUser->language = $altLang;
					$provider = new PagesDataProvider('template=' . $tpl->name, []);
					wire($provider);

					$qeResult = $provider->saveQuickEdit((string) $testPage->id, [
						'title__' . (int) $altLang->id => 'Updated Alt Title',
					]);
					expect($qeResult['ok'] ?? false)->toBeTrue();

					$pages->uncacheAll();
					$reloaded = $pages->get((int) $testPage->id);
					expect((string) $reloaded->getLanguageValue($defaultLang, 'title'))->toBe('Default English Title')
						->and((string) $reloaded->getLanguageValue($altLang, 'title'))->toBe('Updated Alt Title');

					if ($prevSuperLang instanceof Language) {
						$superUser->language = $prevSuperLang;
					}
					$testPage = $reloaded;
				}

				// 2. InputfieldReactLink::___processInput() preserves default labels/alt without page-edit when hasPage is unset,
				// while reverting uneditable languages and enforcing Languages::editable() when hasPage is bound
				$standaloneRole = $roles->add('rw-p1-link-role-' . $suffix);
				foreach (['page-view', 'page-edit-lang-default'] as $pName) {
					$permObj = $permissions->get($pName);
					if ($permObj instanceof Permission && $permObj->id > 0) {
						$standaloneRole->addPermission($permObj);
					}
				}
				$standaloneRole->save();

				$standaloneUser = $users->add('rw-p1-link-user-' . $suffix);
				$standaloneUser->pass = 'LinkProbe!123';
				$standaloneUser->addRole('guest');
				$standaloneUser->addRole($standaloneRole);
				$standaloneUser->save();

				$pages->uncacheAll();
				$standaloneUser = $users->get((int) $standaloneUser->id);
				$testPage = $pages->get((int) $testPage->id);
				$users->setCurrentUser($standaloneUser);
				$refPerms->setValue($languages, null);
				$refEditable->setValue($languages, []);

				/** @var InputfieldReactLink $standaloneLink */
				$standaloneLink = $modules->get('InputfieldReactLink');
				$standaloneLink->attr('name', 'cta_link');
				$standaloneLink->set('linkTypes', ['url', 'image']);
				$standaloneLink->set('mediaProfiles', ['image' => ['extensions' => ['png', 'jpg']]]);
				$standaloneLink->attr('value', [
					'type' => 'image',
					'url' => '/site/assets/files/1/old.png',
					'label' => 'Old Default Label',
					'alt' => 'Old Default Alt',
					'labels' => [
						'default' => 'Old Default Label',
						(string) $altLang->id => 'Old Alt Label',
					],
				]);

				expect($standaloneLink->isLanguageEditable($defaultLang))->toBeTrue()
					->and($standaloneLink->isLanguageEditable($altLang))->toBeFalse();

				$standalonePost = [
					'cta_link' => json_encode([
						'type' => 'image',
						'url' => '/site/assets/files/1/new.png',
						'label' => 'New Default Label',
						'alt' => 'New Default Alt',
						'labels' => [
							'default' => 'New Default Label',
							(string) $altLang->id => 'Blocked Alt Label',
						],
					], JSON_THROW_ON_ERROR),
				];
				$standaloneLink->processInput(new WireInputData($standalonePost));

				$standaloneVal = $standaloneLink->attr('value');
				expect($standaloneVal)->toBeArray()
					->and($standaloneVal['label'] ?? '')->toBe('New Default Label')
					->and($standaloneVal['alt'] ?? '')->toBe('New Default Alt')
					->and($standaloneVal['labels']['default'] ?? '')->toBe('New Default Label')
					->and($standaloneVal['labels'][(string) $altLang->id] ?? '')->toBe('Old Alt Label');

				/** @var InputfieldReactLink $boundLink */
				$boundLink = $modules->get('InputfieldReactLink');
				$boundLink->attr('name', 'bound_link');
				$boundLink->set('hasPage', $testPage);
				$boundLink->set('linkTypes', ['url', 'image']);
				$boundLink->set('mediaProfiles', ['image' => ['extensions' => ['png', 'jpg']]]);
				$boundLink->attr('value', [
					'type' => 'image',
					'url' => '/site/assets/files/1/old.png',
					'label' => 'Bound Old Label',
					'alt' => 'Bound Old Alt',
					'labels' => [
						'default' => 'Bound Old Label',
						(string) $altLang->id => 'Bound Alt Label',
					],
				]);

				expect($boundLink->isLanguageEditable($defaultLang))->toBeFalse();

				$boundPost = [
					'bound_link' => json_encode([
						'type' => 'image',
						'url' => '/site/assets/files/1/new.png',
						'label' => 'Tampered Bound Label',
						'alt' => 'Tampered Bound Alt',
						'labels' => [
							'default' => 'Tampered Bound Label',
							(string) $altLang->id => 'Tampered Alt Label',
						],
					], JSON_THROW_ON_ERROR),
				];
				$boundLink->processInput(new WireInputData($boundPost));

				$boundVal = $boundLink->attr('value');
				expect($boundVal)->toBeArray()
					->and($boundVal['label'] ?? '')->toBe('Bound Old Label')
					->and($boundVal['alt'] ?? '')->toBe('Bound Old Alt')
					->and($boundVal['labels']['default'] ?? '')->toBe('Bound Old Label')
					->and($boundVal['labels'][(string) $altLang->id] ?? '')->toBe('Bound Alt Label');
			}
		}

		// 3. TiptapMediaLinkGateway::resolveUploadImageField() / listEditableUploadFields() respect $masterPage context
		//    (template-revoked page-edit-images) and executeResize() allows non-page MediaHostAdapterInterface hosts
		$users->setCurrentUser($superUser);
		foreach (['page-edit-images', 'page-edit-lang-none'] as $pName) {
			if (!$permissions->has($pName)) {
				$created = $permissions->add($pName);
				$created->save();
				$createdPerms[] = $created;
			}
		}

		$probeRole = $roles->add('rw-p1-img-role-' . $suffix);
		foreach (['page-view', 'page-edit', 'page-edit-images', 'page-edit-lang-none'] as $pName) {
			$permObj = $permissions->get($pName);
			if ($permObj instanceof Permission && $permObj->id > 0) {
				$probeRole->addPermission($permObj);
			}
		}
		$probeRole->save();

		$editImagesPerm = $permissions->get('page-edit-images');
		$tpl->useRoles = 1;
		$tpl->set('roles', [(int) $roles->getGuestRole()->id, (int) $probeRole->id]);
		$tpl->set('editRoles', [(int) $probeRole->id]);
		if ($editImagesPerm instanceof Permission && $editImagesPerm->id > 0) {
			$tpl->set('rolesPermissions', [(string) $probeRole->id => [((int) $editImagesPerm->id) * -1]]);
		}
		$templates->save($tpl);

		$probeUser = $users->add('rw-p1-img-user-' . $suffix);
		$probeUser->pass = 'ImgProbe!123';
		$probeUser->addRole('guest');
		$probeUser->addRole($probeRole);
		$probeUser->save();

		$pages->uncacheAll();
		$testPage = $pages->get((int) $testPage->id);
		$probeUser = $users->get((int) $probeUser->id);
		if ($languages instanceof Languages) {
			$refPerms = new \ReflectionProperty($languages, 'pageEditPermissions');
			$refEditable = new \ReflectionProperty($languages, 'editableCache');
			$refPerms->setValue($languages, null);
			$refEditable->setValue($languages, []);
		}

		$tiptapGw = $react->tiptap();
		$refResolveUpload = new \ReflectionMethod($tiptapGw, 'resolveUploadImageField');
		$refListUpload = new \ReflectionMethod($tiptapGw, 'listEditableUploadFields');

		expect($probeUser->hasPermission('page-edit-images'))->toBeTrue()
			->and($probeUser->hasPermission('page-edit-images', $testPage))->toBeFalse()
			->and($refResolveUpload->invoke($tiptapGw, $testPage, [$imgField->name], '', $probeUser))->toBeNull()
			->and($refListUpload->invoke($tiptapGw, $testPage, [$imgField->name], [], $probeUser))->toBe([]);

		// Non-page MediaHostAdapterInterface host is not rejected by page-edit-images check in executeResize()
		$hostKind = 'rw_p1_host_' . $suffix;
		/** @var Pageimages $pageImagesCollection */
		$pageImagesCollection = $testPage->getUnformatted($imgField->name);
		/** @var Pageimage $pageImageItem */
		$pageImageItem = $pageImagesCollection->first();
		$mediaGw = $react->media();
		$mediaGw->registerHostAdapter(new class($hostKind, $pageImagesCollection) implements MediaHostAdapterInterface {
			public function __construct(
				private string $hostKind,
				private Pagefiles $collection,
			) {
			}

			public function kind(): string
			{
				return $this->hostKind;
			}

			public function buildEnvelope(\ProcessWire\Inputfield $inputfield, mixed $hostPage, string $dataFieldName, string $inputName, array $common): ?array
			{
				return null;
			}

			public function resolveTargetContext(array $envelope, User $user, bool $requireEdit): array
			{
				return [
					'ok' => true,
					'kind' => $this->hostKind,
					'pagefiles' => $this->collection,
					'rootPage' => null,
				];
			}

			public function persistPagefiles(array $resolved, Pagefiles $pagefiles, int $maxFiles): void
			{
			}
		});

		$targetUser = $standaloneUser instanceof User && $standaloneUser->id > 0 ? $standaloneUser : $probeUser;
		$mediaToken = $mediaGw->sign([
			'kind' => $hostKind,
			'fieldName' => $imgField->name,
			'inputName' => $imgField->name,
			'readOnly' => false,
		], (int) $targetUser->id);

		$refExecResize = new \ReflectionMethod($tiptapGw, 'executeResize');
		$resizeResult = $refExecResize->invoke($tiptapGw, [
			'readOnly' => false,
		], [
			'mediaToken' => $mediaToken,
			'file' => $pageImageItem->basename(),
			'width' => 1,
		], $targetUser);

		expect($resizeResult['ok'] ?? false)->toBeTrue()
			->and($resizeResult['status'] ?? 200)->not->toBe(403);
	} finally {
		$users->setCurrentUser($superUser);
		if ($superUser instanceof User && $prevSuperLang instanceof Language) {
			$superUser->language = $prevSuperLang;
		}
		if ($testPage instanceof Page && $testPage->id > 0) {
			try { $pages->delete($testPage, true); } catch (\Throwable) {}
		}
		foreach ([$probeUser, $standaloneUser] as $u) {
			if ($u instanceof User && $u->id > 0) {
				try { $users->delete($u, true); } catch (\Throwable) {}
			}
		}
		foreach ([$probeRole, $standaloneRole] as $r) {
			if ($r instanceof Role && $r->id > 0) {
				try { $roles->delete($r); } catch (\Throwable) {}
			}
		}
		foreach ($createdPerms as $perm) {
			if ($perm instanceof Permission && $perm->id > 0) {
				try { $permissions->delete($perm); } catch (\Throwable) {}
			}
		}
		if ($languages instanceof Languages) {
			$refPerms = new \ReflectionProperty($languages, 'pageEditPermissions');
			$refEditable = new \ReflectionProperty($languages, 'editableCache');
			$refPerms->setValue($languages, null);
			$refEditable->setValue($languages, []);
		}
		if ($tpl instanceof Template && $tpl->id > 0) {
			try { $templates->delete($tpl); } catch (\Throwable) {}
		}
		if ($fg instanceof Fieldgroup && $fg->id > 0) {
			try { $fieldgroups->delete($fg); } catch (\Throwable) {}
		}
		if ($imgField instanceof Field && $imgField->id > 0) {
			try { $fields->delete($imgField); } catch (\Throwable) {}
		}
		foreach (glob($tmpDir . '/*') ?: [] as $f) {
			if (is_file($f)) {
				@unlink($f);
			}
		}
		if (is_dir($tmpDir)) {
			@rmdir($tmpDir);
		}
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
	}
});

test('Hardening regression lock: page_link page-edit-images, SVG namespace/attr/url guards, Tiptap title context oracle, island PropResolver/entity encoding, and Viewport client-safe errors', function (): void {
	/** @var React $react */
	$react = wire('react');
	$pw = wire();
	$pages = $pw->pages;
	$fields = $pw->fields;
	$fieldgroups = $pw->fieldgroups;
	$templates = $pw->templates;
	$modules = $pw->modules;
	$users = $pw->users;
	$roles = $pw->roles;
	$permissions = $pw->permissions;
	$config = $pw->config;

	$prevUser = $users->getCurrentUser();
	$superId = (int) ($config->superUserPageID ?: 41);
	/** @var User $superUser */
	$superUser = $users->get($superId);
	$prevDebug = $config->debug;

	$suffix = bin2hex(random_bytes(3));
	$tmpDir = sys_get_temp_dir() . '/rw-batch-lock-' . $suffix;
	mkdir($tmpDir, 0775, true);

	$linkField = null;
	$fg = null;
	$tpl = null;
	$ctxFg = null;
	$ctxTpl = null;
	$testPage = null;
	$ctxPage = null;
	$editorRole = null;
	$editorUser = null;
	$createdPerms = [];

	try {
		$users->setCurrentUser($superUser);

		// 1. SVG hardening: non-SVG element namespace, non-allowlisted attribute namespace, direct src/srcdoc/action/formaction, and non-fragment url()
		$validator = new UploadedFileValidator();
		wire($validator);
		$badSvgs = [
			'<svg xmlns="http://www.w3.org/2000/svg"><div xmlns="http://www.w3.org/1999/xhtml"/></svg>',
			'<svg xmlns="http://www.w3.org/2000/svg" xmlns:evil="https://evil.test"><rect evil:attr="1"/></svg>',
			'<svg xmlns="http://www.w3.org/2000/svg"><image src="https://evil.test/x"/></svg>',
			'<svg xmlns="http://www.w3.org/2000/svg"><rect srcdoc="<b>x</b>"/></svg>',
			'<svg xmlns="http://www.w3.org/2000/svg"><rect action="https://evil.test/a"/></svg>',
			'<svg xmlns="http://www.w3.org/2000/svg"><rect formaction="https://evil.test/b"/></svg>',
			'<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://evil.test/x)"/></svg>',
		];
		foreach ($badSvgs as $idx => $svgBody) {
			$svgPath = $tmpDir . '/bad-' . $idx . '.svg';
			file_put_contents($svgPath, $svgBody);
			expect($validator->validateSvgFile($svgPath, 'bad-' . $idx . '.svg'))->not->toBeNull();
		}
		$validSvgPath = $tmpDir . '/valid.svg';
		file_put_contents($validSvgPath, '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="grad"/></defs><rect fill="url(#grad)"/><a xlink:href="#grad"><circle r="4"/></a></svg>');
		expect($validator->validateSvgFile($validSvgPath, 'valid.svg'))->toBeNull();

		// 2. page_link page-edit-images RBAC across FormSchemaSerializer, MediaGateway, and TiptapMediaLinkGateway
		foreach (['page-edit-images', 'page-edit-lang-none', 'page-edit-lang-default'] as $pName) {
			if (!$permissions->has($pName)) {
				$perm = $permissions->add($pName);
				$perm->save();
				$createdPerms[] = $perm;
			}
		}

		$linkField = new Field();
		$linkField->type = $modules->get('FieldtypeText');
		$linkField->name = 'rw_link_img_' . $suffix;
		$linkField->label = 'Link Media RBAC';
		$linkField->set('inputfieldClass', 'InputfieldReactLink');
		$linkField->set('linkTypes', ['page', 'url', 'image']);
		$fields->save($linkField);

		$fg = new Fieldgroup();
		$fg->name = 'rw_link_fg_' . $suffix;
		$fg->add($fields->get('title'));
		$fg->add($linkField);
		$fieldgroups->save($fg);

		$editorRole = $roles->add('rw-link-noimg-' . $suffix);
		foreach (['page-view', 'page-edit', 'page-edit-lang-none', 'page-edit-lang-default'] as $pName) {
			$pObj = $permissions->get($pName);
			if ($pObj instanceof Permission && $pObj->id > 0) {
				$editorRole->addPermission($pObj);
			}
		}
		$editorRole->save();

		$tpl = new Template();
		$tpl->name = $fg->name;
		$tpl->fieldgroup = $fg;
		$tpl->useRoles = 1;
		$tpl->roles = [(int) $roles->getGuestRole()->id, (int) $editorRole->id];
		$tpl->editRoles = [(int) $editorRole->id];
		$templates->save($tpl);

		$testPage = new Page();
		$testPage->template = $tpl;
		$testPage->parent = $pages->get(1);
		$testPage->name = 'rw-link-page-' . $suffix;
		$testPage->title = 'Link RBAC Host';
		$pages->save($testPage);

		$pngData = (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
		$linkDir = PageLinkMediaHostAdapter::directoryPathFor($testPage, $linkField->name);
		if (!is_dir($linkDir)) {
			mkdir($linkDir, 0775, true);
		}
		file_put_contents($linkDir . 'sample.png', $pngData);
		$testPage->setAndSave($linkField->name, json_encode(['type' => 'image', 'file' => 'sample.png'], JSON_THROW_ON_ERROR));

		$editorUser = $users->add('rw-link-noimg-user-' . $suffix);
		$editorUser->pass = 'LinkNoImg!123';
		$editorUser->addRole('guest');
		$editorUser->addRole($editorRole);
		$editorUser->save();

		$pages->uncacheAll();
		$testPage = $pages->get((int) $testPage->id);
		$editorUser = $users->get((int) $editorUser->id);
		$users->setCurrentUser($editorUser);

		$serializer = new FormSchemaSerializer();
		wire($serializer);
		$linkInputfield = $linkField->getInputfield($testPage);
		expect($linkInputfield)->toBeInstanceOf(InputfieldReactLink::class);
		$serializedNode = $serializer->serializeInputfieldNode($linkInputfield);
		$imgToken = (string) ($serializedNode['linkConfig']['mediaProfiles']['image']['mediaToken'] ?? '');
		expect($imgToken)->not->toBe('');

		$mediaGw = $react->media();
		$verifiedEnv = $mediaGw->verify($imgToken, (int) $editorUser->id);
		expect($verifiedEnv)->toBeArray()
			->and($verifiedEnv['useImageEditor'] ?? null)->toBeFalse();

		$forgedToken = $mediaGw->sign([
			'kind' => PageLinkMediaHostAdapter::KIND,
			'pageId' => (int) $testPage->id,
			'rootPageId' => (int) $testPage->id,
			'fieldName' => $linkField->name,
			'inputName' => $linkField->name,
			'mediaProfile' => 'image',
			'isImage' => true,
			'useImageEditor' => true,
			'readOnly' => false,
		], (int) $editorUser->id);

		$transformRes = $mediaGw->handleAction([
			'action' => 'transform',
			'mediaToken' => $forgedToken,
			'targetName' => 'sample.png',
			'operations' => ['rotate' => 90],
		], false, $editorUser);
		expect($transformRes['ok'] ?? true)->toBeFalse()
			->and($transformRes['status'] ?? 0)->toBe(403);

		$tiptapGw = $react->tiptap();
		$refExecResize = new \ReflectionMethod($tiptapGw, 'executeResize');
		$resizeRes = $refExecResize->invoke($tiptapGw, [
			'readOnly' => false,
		], [
			'mediaToken' => $forgedToken,
			'file' => 'sample.png',
			'width' => 1,
		], $editorUser);
		expect($resizeRes['ok'] ?? true)->toBeFalse()
			->and($resizeRes['status'] ?? 0)->toBe(403);

		// Grant page-edit-images -> FormSchemaSerializer enables useImageEditor in signed token
		$users->setCurrentUser($superUser);
		$imgEditPerm = $permissions->get('page-edit-images');
		if ($imgEditPerm instanceof Permission && $imgEditPerm->id > 0) {
			$editorRole->addPermission($imgEditPerm);
			$editorRole->save();
		}
		$pages->uncacheAll();
		$testPage = $pages->get((int) $testPage->id);
		$editorUser = $users->get((int) $editorUser->id);
		$users->setCurrentUser($editorUser);
		$allowedNode = $serializer->serializeInputfieldNode($linkField->getInputfield($testPage));
		$allowedToken = (string) ($allowedNode['linkConfig']['mediaProfiles']['image']['mediaToken'] ?? '');
		expect($allowedToken)->not->toBe('');
		$allowedVerified = $mediaGw->verify($allowedToken, (int) $editorUser->id);
		expect($allowedVerified)->toBeArray()
			->and($allowedVerified['useImageEditor'] ?? false)->toBeTrue();

		// 3. TiptapMediaLinkGateway::executePagesQuery() enforces template-context title useRoles & falls back sort=name, sort=id
		$users->setCurrentUser($superUser);
		$titleField = $fields->get('title');
		$ctxFg = new Fieldgroup();
		$ctxFg->name = 'rw_tt_ctx_' . $suffix;
		$ctxFg->add($titleField);
		$fieldgroups->save($ctxFg);

		$ctxTpl = new Template();
		$ctxTpl->name = $ctxFg->name;
		$ctxTpl->fieldgroup = $ctxFg;
		$templates->save($ctxTpl);

		$superRoleId = (int) ($roles->get('superuser')->id ?: 38);
		$ctxFg->setFieldContextArray((int) $titleField->id, [
			'useRoles' => 1,
			'viewRoles' => [$superRoleId],
		]);
		$ctxFg->saveContext();

		$ctxPage = new Page();
		$ctxPage->template = $ctxTpl;
		$ctxPage->parent = $pages->get(1);
		$ctxPage->name = 'aaa-hidden-ctx-' . $suffix;
		$ctxPage->title = 'SecretContextTitle' . $suffix;
		$pages->save($ctxPage);

		$users->setCurrentUser($editorUser);
		$capturedSelectors = [];
		$findHookId = $pw->addHookBefore('Pages::find', static function (\ProcessWire\HookEvent $event) use (&$capturedSelectors): void {
			$rawSel = $event->arguments(0);
			if (is_string($rawSel) && str_contains($rawSel, 'limit=')) {
				$capturedSelectors[] = $rawSel;
			}
		});
		try {
			$refPagesQuery = new \ReflectionMethod($tiptapGw, 'executePagesQuery');
			$searchOut = $refPagesQuery->invoke($tiptapGw, ['editPageId' => (int) $ctxPage->id], ['q' => 'SecretContextTitle' . $suffix, 'limit' => 10], $editorUser);
			$browseOut = $refPagesQuery->invoke($tiptapGw, ['editPageId' => (int) $ctxPage->id], ['parentId' => 1, 'limit' => 10], $editorUser);
			expect($searchOut['items'] ?? ['nonempty'])->toBe([])
				->and($browseOut['ok'] ?? false)->toBeTrue()
				->and($capturedSelectors[0] ?? '')->not->toContain('title|name%=')
				->and($capturedSelectors[0] ?? '')->toContain('sort=name, sort=id')
				->and($capturedSelectors[1] ?? '')->not->toContain('sort=title')
				->and($capturedSelectors[1] ?? '')->toContain('sort=name, sort=id');
		} finally {
			$pw->removeHook($findHookId);
		}

		// 4. Inertia::withoutEntityEncoding + PropResolver + data-readonly="true" parity on islands
		$users->setCurrentUser($superUser);
		$prevEntityEncode = function_exists('ProcessWire\\__') ? \ProcessWire\__(true, 'entityEncode', true) : null;
		try {
			$vpTable = $react->configureTable([['id' => 1, 'name' => 'Alpha & Beta']]);
			$vpTable->with('lazyProbe', static fn(): string => $react->_('R&D'));
			$vpHtml = $vpTable->render();
			expect($vpHtml)->toContain('R\\u0026D')
				->and($vpHtml)->not->toContain('R\\u0026amp;D')
				->and($vpHtml)->not->toContain('R&amp;D');

			foreach (['InputfieldReactImage', 'InputfieldReactFile', 'InputfieldTiptap', 'InputfieldReactLink', 'InputfieldReactKeyValue', 'InputfieldReactCondition'] as $ifClass) {
				$ifObj = $modules->get($ifClass);
				$ifObj->attr('name', 'probe_' . strtolower($ifClass));
				$ifObj->with('lazyFlag', static fn(): string => $react->_('A&B'));
				$roHtml = $ifObj->renderValue();
				expect($roHtml)->toContain('data-readonly="true"')
					->and($roHtml)->toContain('A\\u0026B')
					->and($roHtml)->not->toContain('A\\u0026amp;B')
					->and($roHtml)->not->toContain('A&amp;B');
			}

			$tabGroup = $modules->get('MarkupReactTab');
			$tabGroup->attr('name', 'probe_tabs');
			$pane = $tabGroup->addTab('tab_one', 'General');
			$paneText = $modules->get('InputfieldText');
			$paneText->attr('name', 'pane_field');
			$pane->add($paneText);
			$tabHtml = $tabGroup->render();
			expect($tabHtml)->toContain('data-inertia-island="MarkupReactTab"');

			$bridgeInput = $modules->get('InputfieldText');
			$bridgeInput->attr('name', 'bridge_island_probe');
			$bridgeInput->set('rwControl', 'rating');
			$bridgeHtml = (string) $react->controls()->renderControlIsland($bridgeInput, false);
			expect($bridgeHtml)->toContain('data-rw-bridge-control="rating"');
		} finally {
			if (function_exists('ProcessWire\\__') && $prevEntityEncode !== null) {
				\ProcessWire\__(true, 'entityEncode', $prevEntityEncode);
			}
		}

		// 5. ReactGatewayRouter::handleViewportAction() surfaces client-safe exceptions and masks DB exceptions when debug=false
		$config->debug = false;
		$vpTestProvId = 'vp_err_' . $suffix . ':probe';
		$vpTestProv = new class($vpTestProvId) implements ReactDataProviderInterface {
			public ?\Throwable $throwException = null;

			public function __construct(private string $pid) {}
			public function id(): string { return $this->pid; }
			public function title(): string { return 'Err Probe'; }
			public function columns(): array { return []; }
			public function sortableColumns(): array { return []; }
			public function statusOptions(): array { return []; }
			public function isLocked(): bool { return false; }
			public function query(array $criteria = []): ReactPageResult { return new ReactPageResult([], 0, 1, 25); }
			public function mutate(string $operation, array $ids, array $payload = []): int
			{
				if ($this->throwException !== null) {
					throw $this->throwException;
				}
				return 0;
			}
		};
		$react->providers()->register($vpTestProvId, $vpTestProv);
		$vpErrInst = $react->configureTable($vpTestProvId);
		$vpStateToken = $vpErrInst->signViewportState();

		$vpTestProv->throwException = new WireException('Safe viewport hint');
		$safeErrRes = $react->gateway()->handleViewportAction([
			'stateToken' => $vpStateToken,
			'action' => 'bulk_action',
			'bulkAction' => 'op_a',
			'ids' => ['1'],
		], false);
		expect($safeErrRes['ok'] ?? true)->toBeFalse()
			->and($safeErrRes['status'] ?? 0)->toBe(422)
			->and($safeErrRes['error'] ?? '')->toBe('Safe viewport hint');

		$vpTestProv->throwException = new WireDatabaseException('SQL error on secret_table');
		$dbErrRes = $react->gateway()->handleViewportAction([
			'stateToken' => $vpStateToken,
			'action' => 'bulk_action',
			'bulkAction' => 'op_a',
			'ids' => ['1'],
		], false);
		expect($dbErrRes['ok'] ?? true)->toBeFalse()
			->and($dbErrRes['status'] ?? 0)->toBe(422)
			->and($dbErrRes['error'] ?? '')->toBe('Viewport action failed.');
	} finally {
		$config->debug = $prevDebug;
		$users->setCurrentUser($superUser);
		foreach ([$ctxPage, $testPage] as $p) {
			if ($p instanceof Page && $p->id > 0) {
				try { $pages->delete($p, true); } catch (\Throwable) {}
			}
		}
		if ($editorUser instanceof User && $editorUser->id > 0) {
			try { $users->delete($editorUser, true); } catch (\Throwable) {}
		}
		if ($editorRole instanceof Role && $editorRole->id > 0) {
			try { $roles->delete($editorRole); } catch (\Throwable) {}
		}
		foreach ($createdPerms as $perm) {
			if ($perm instanceof Permission && $perm->id > 0) {
				try { $permissions->delete($perm); } catch (\Throwable) {}
			}
		}
		foreach ([$ctxTpl, $tpl] as $t) {
			if ($t instanceof Template && $t->id > 0) {
				try { $templates->delete($t); } catch (\Throwable) {}
			}
		}
		foreach ([$ctxFg, $fg] as $fgrp) {
			if ($fgrp instanceof Fieldgroup && $fgrp->id > 0) {
				try { $fieldgroups->delete($fgrp); } catch (\Throwable) {}
			}
		}
		if ($linkField instanceof Field && $linkField->id > 0) {
			try { $fields->delete($linkField); } catch (\Throwable) {}
		}
		foreach (glob($tmpDir . '/*') ?: [] as $f) {
			if (is_file($f)) {
				@unlink($f);
			}
		}
		if (is_dir($tmpDir)) {
			@rmdir($tmpDir);
		}
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
	}
});
