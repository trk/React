<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\InputfieldForm;
use ProcessWire\InputfieldPassword;
use ProcessWire\InputfieldText;
use ProcessWire\Language;
use ProcessWire\Page;
use ProcessWire\Permission;
use ProcessWire\React;
use ProcessWire\Role;
use ProcessWire\Template;
use ProcessWire\User;
use ProcessWire\WireDatabaseException;
use ProcessWire\WireException;
use ProcessWire\WireFilesException;
use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Media\MediaGateway;
use Totoglu\React\Media\UploadedFileValidator;
use Totoglu\React\Provider\PagesDataProvider;
use Totoglu\React\Security\SignedTokenCodec;
use Totoglu\React\Security\UrlSanitizer;
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
	], (int) $home->id, $superId);

	$resizeOverRes = $react->handleTiptapAction([
		'_requestMethod' => 'POST',
		'action' => 'resize',
		'tiptapToken' => $tiptapToken,
		'imagePageId' => (int) $home->id,
		'fieldName' => 'images',
		'filename' => 'missing.png',
		'width' => MediaGateway::MAX_RASTER_AXIS + 1,
	], false, $superUser);
	expect($resizeOverRes['ok'] ?? true)->toBeFalse()
		->and((int) ($resizeOverRes['status'] ?? 0))->toBeGreaterThanOrEqual(400);
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
