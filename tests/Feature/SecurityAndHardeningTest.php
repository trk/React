<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\HookEvent;
use ProcessWire\Inputfield;
use ProcessWire\InputfieldMarkup;
use ProcessWire\InputfieldPage;
use ProcessWire\InputfieldReactM2A;
use ProcessWire\InputfieldReactM2M;
use ProcessWire\InputfieldReactM2O;
use ProcessWire\InputfieldReactO2M;
use ProcessWire\InputfieldTiptap;
use ProcessWire\InputfieldWrapper;
use ProcessWire\MarkupReactTab;
use ProcessWire\Page;
use ProcessWire\React;
use ProcessWire\Role;
use ProcessWire\Template;
use ProcessWire\User;
use ProcessWire\WireException;
use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Form\FormSchemaSerializer;
use Totoglu\React\Inertia\InputfieldReact;
use Totoglu\React\Provider\ArrayDataProvider;
use Totoglu\React\Provider\PagesDataProvider;
use Totoglu\React\Relation\RelationStateSigner;
use Totoglu\React\Security\SignedTokenCodec;
use Totoglu\React\Security\UrlSanitizer;
use Totoglu\React\Viewport\MarkupReactViewport;
use Totoglu\React\Viewport\ReactViewPreferenceStore;
use Totoglu\React\Workspace\WorkspaceDefinition;
use Totoglu\React\Workspace\WorkspaceWidgetDefinition;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
	$this->previousUser = wire('user');
	$this->previousSalt = (string) (wire('config')->userAuthSalt ?? '');
	$this->previousMethod = $_SERVER['REQUEST_METHOD'] ?? null;
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superUser = wire('users')->get($superId);
	if ($superUser instanceof User && $superUser->id > 0) {
		wire('users')->setCurrentUser($superUser);
	}
});

afterEach(function (): void {
	if (isset($this->previousSalt)) {
		wire('config')->userAuthSalt = $this->previousSalt;
	}
	if ($this->previousMethod === null) {
		unset($_SERVER['REQUEST_METHOD']);
	} else {
		$_SERVER['REQUEST_METHOD'] = $this->previousMethod;
	}
	if (isset($this->previousUser) && $this->previousUser instanceof User && $this->previousUser->id > 0) {
		wire('users')->setCurrentUser($this->previousUser);
	}
});

test('ProcessReactWorkspace exposes registerViewportMode and getRegisteredViewportModes seam and MarkupReactViewport resolves modes without string-concatenation hacks', function (): void {
	$workspace = React::instance();

	$viewportSrc = (string) file_get_contents(dirname(__DIR__, 2) . '/src/Viewport/MarkupReactViewport.php');
	expect($viewportSrc)->not->toContain("'MarkupReact' .")
		->and($viewportSrc)->not->toContain('"MarkupReact" .');

	$workspace->registerViewportMode('reorder_mode', 'MarkupReactTable', \Totoglu\React\Contract\ReactReorderProvider::class, [
		'icon' => 'columns',
		'label' => 'Ordered',
	]);
	$workspace->registerViewportMode('summary_mode', 'MarkupReactCards', \Totoglu\React\Contract\ReactSummaryProvider::class);
	$workspace->registerViewportMode('matrix_test', 'MarkupReactTable', '');
	$workspace->registerViewportMode('missing_mod_mode', 'NonExistentViewportModXyz', '');

	$registered = $workspace->getRegisteredViewportModes();
	expect($registered)->toHaveKey('reorder_mode')
		->and($registered['reorder_mode'])->toBe([
			'module' => 'MarkupReactTable',
			'contract' => \Totoglu\React\Contract\ReactReorderProvider::class,
			'icon' => 'columns',
			'label' => 'Ordered',
		])
		->and($registered['summary_mode']['module'])->toBe('MarkupReactCards')
		->and($registered['matrix_test']['module'])->toBe('MarkupReactTable');

	// Provider without ReactReorderProvider or ReactSummaryProvider only gets table, cards, and contract='' installed modes
	$plainProvider = new class extends \ProcessWire\Wire implements ReactDataProviderInterface {
		public function id(): string { return 'plain:seam'; }
		public function title(): string { return 'Plain'; }
		public function columns(): array { return ['title' => 'Title']; }
		public function sortableColumns(): array { return []; }
		public function statusOptions(): array { return []; }
		public function isLocked(): bool { return false; }
		public function mutate(string $operation, array $ids, array $payload = []): int { return 0; }
		public function query(array $criteria = []): \Totoglu\React\Data\ReactPageResult {
			return new \Totoglu\React\Data\ReactPageResult([
				new \Totoglu\React\Data\ReactRecord(id: '1', title: 'Plain Item'),
			], 1, 1, 25);
		}
	};
	wire($plainProvider);
	$plainTable = $workspace->configureTable($plainProvider);
	$plainProp = $plainTable->toInertiaProp();
	expect($plainProp['allowedViewModes'])->toContain('table', 'cards', 'matrix_test')
		->and($plainProp['allowedViewModes'])->not->toContain('reorder_mode')
		->and($plainProp['allowedViewModes'])->not->toContain('summary_mode')
		->and($plainProp['allowedViewModes'])->not->toContain('missing_mod_mode');

	// Provider implementing ReactReorderProvider + ReactSummaryProvider enables contract-gated registered modes and emits viewModeMeta
	$richProvider = new ArrayDataProvider(
		id: 'array:mode_seam_test',
		items: [
			['id' => '1', 'title' => 'Ordered Card'],
		],
	);
	wire($richProvider);
	$richTable = $workspace->configureTable($richProvider);
	$richTable->mount();
	$richProp = $richTable->toInertiaProp();
	expect($richProp['allowedViewModes'])->toContain('table', 'cards', 'reorder_mode', 'summary_mode', 'matrix_test')
		->and($richProp['allowedViewModes'])->not->toContain('missing_mod_mode')
		->and($richProp['viewModeMeta']['reorder_mode'])->toBe(['icon' => 'columns', 'label' => 'Ordered']);
});

test('SignedTokenCodec, MarkupReactViewport, and RelationStateSigner reject weak userAuthSalt and enforce iat + 24h TTL', function (): void {
	$workspace = React::instance();
	$table = $workspace->configureTable([['id' => '1', 'title' => 'Salt Check']]);
	$signer = $workspace->relationSigner();
	$uid = (int) wire('user')->id;

	// Weak/empty userAuthSalt MUST throw WireException — never fall back to __FILE__ hash!
	wire('config')->userAuthSalt = '';
	expect(fn () => $table->signViewportState())->toThrow(WireException::class)
		->and(fn () => $signer->sign(['cardinality' => 'm2o', 'resource' => 'template'], $uid))->toThrow(WireException::class);

	wire('config')->userAuthSalt = 'short_salt_15ch';
	expect(fn () => $table->signViewportState())->toThrow(WireException::class)
		->and(fn () => $signer->sign(['cardinality' => 'm2o', 'resource' => 'template'], $uid))->toThrow(WireException::class);

	wire('config')->userAuthSalt = 'strong_production_salt_value_32chars!';
	$validViewportToken = $table->signViewportState();
	$decodedViewport = $table->verifyViewportState($validViewportToken);
	expect($decodedViewport)->toBeArray()
		->and($decodedViewport['iat'] ?? null)->toBeInt();

	$validRelationToken = $signer->sign(['cardinality' => 'm2o', 'resource' => 'template'], $uid);
	$decodedRelation = $signer->verify($validRelationToken, $uid);
	expect($decodedRelation)->toBeArray()
		->and($decodedRelation['iat'] ?? null)->toBeInt();

	// Expired tokens (> 86400s old) and missing-iat tokens MUST be rejected
	$codec = new SignedTokenCodec();
	wire($codec);
	$expiredViewportToken = $codec->encode([
		'viewportClass' => 'MarkupReactTable',
		'uid' => $uid,
		'iat' => time() - 86401,
	]);
	$missingIatToken = $codec->encodeRawWithoutTimestampForTest ?? null;
	// Craft a properly HMAC-signed token without `iat` using userAuthSalt directly
	$noIatJson = (string) json_encode(['cardinality' => 'm2o', 'resource' => 'template', 'uid' => $uid]);
	$noIatB64 = rtrim(strtr(base64_encode($noIatJson), '+/', '-_'), '=');
	$noIatSig = hash_hmac('sha256', $noIatB64, (string) wire('config')->userAuthSalt);
	$signedWithoutIat = $noIatB64 . '.' . $noIatSig;

	$expiredRelationJson = (string) json_encode([
		'cardinality' => 'm2o',
		'resource' => 'template',
		'uid' => $uid,
		'iat' => time() - 90000,
	]);
	$expiredRelB64 = rtrim(strtr(base64_encode($expiredRelationJson), '+/', '-_'), '=');
	$expiredRelSig = hash_hmac('sha256', $expiredRelB64, (string) wire('config')->userAuthSalt);
	$expiredRelToken = $expiredRelB64 . '.' . $expiredRelSig;

	expect($table->verifyViewportState($expiredViewportToken))->toBeNull()
		->and($signer->verify($signedWithoutIat, $uid))->toBeNull()
		->and($signer->verify($expiredRelToken, $uid))->toBeNull();
});

test('readOnly relations force non-mutating flags before signing relationToken and handleRelationAction blocks readOnly and GET mutations', function (): void {
	$workspace = React::instance();
	$modules = wire('modules');
	$uid = (int) wire('user')->id;

	// 1. Standalone relation Inputfield in locked / renderValueMode state
	$o2m = new InputfieldReactO2M();
	wire($o2m);
	$o2m->attr('name', 'locked_children');
	$o2m->set('targetResource', 'page');
	$o2m->set('foreignField', 'parent_id');
	$o2m->set('ownerId', 1);
	$o2m->set('creatable', 1);
	$o2m->set('allowLink', 1);
	$o2m->set('allowUnlink', 1);
	$o2m->collapsed = Inputfield::collapsedNoLocked;

	$o2mProps = $o2m->inertiaWithData();
	expect($o2mProps['readOnly'])->toBeTrue()
		->and($o2mProps['creatable'])->toBeFalse()
		->and($o2mProps['allowLink'])->toBeFalse()
		->and($o2mProps['allowUnlink'])->toBeFalse();

	$verifiedLockedConfig = $workspace->relationSigner()->verify((string) $o2mProps['relationToken'], $uid);
	expect($verifiedLockedConfig)->toBeArray()
		->and($verifiedLockedConfig['readOnly'])->toBeTrue()
		->and($verifiedLockedConfig['creatable'])->toBeFalse()
		->and($verifiedLockedConfig['allowLink'])->toBeFalse()
		->and($verifiedLockedConfig['allowUnlink'])->toBeFalse();

	// 2. FormSchemaSerializer forces readOnly flags on static readOnly/disabled while preserving _rwDynamicReadOnly
	$wrapper = new InputfieldWrapper();
	wire($wrapper);
	$m2oStatic = new InputfieldReactM2O();
	wire($m2oStatic);
	$m2oStatic->attr('name', 'static_readonly_rel');
	$m2oStatic->attr('readonly', 'readonly');
	$m2oStatic->set('resource', 'page');
	$m2oStatic->set('creatable', 1);
	$wrapper->add($m2oStatic);

	$m2oDyn = new InputfieldReactM2O();
	wire($m2oDyn);
	$m2oDyn->attr('name', 'dyn_readonly_rel');
	$m2oDyn->attr('disabled', 'disabled');
	$m2oDyn->attr('readonly', 'readonly');
	$m2oDyn->set('resource', 'page');
	$m2oDyn->set('creatable', 1);
	$m2oDyn->setQuietly('_rwDynamicReadOnly', true);
	$wrapper->add($m2oDyn);

	$serialized = $workspace->serializeForm($wrapper);
	$relNode = $serialized['fields'][0];
	$verifiedFormToken = $workspace->relationSigner()->verify((string) $relNode['relationToken'], $uid);
	expect($relNode['readOnly'])->toBeTrue()
		->and($relNode['creatable'])->toBeFalse()
		->and($verifiedFormToken['readOnly'] ?? false)->toBeTrue()
		->and($verifiedFormToken['creatable'] ?? true)->toBeFalse();

	$dynNode = $serialized['fields'][1];
	expect($dynNode['readOnly'])->toBeFalse();

	$decl = $workspace->serializeFormDefinitions([
		[
			'name' => 'decl_readonly_o2m',
			'type' => 'o2m',
			'targetResource' => 'page',
			'foreignField' => 'parent_id',
			'ownerId' => 1,
			'readOnly' => true,
			'creatable' => true,
			'allowLink' => true,
			'allowUnlink' => true,
		],
	]);
	$declNode = $decl['fields'][0];
	$verifiedDeclToken = $workspace->relationSigner()->verify((string) $declNode['relationToken'], $uid);
	expect($declNode['readOnly'])->toBeTrue()
		->and($declNode['creatable'])->toBeFalse()
		->and($declNode['allowLink'])->toBeFalse()
		->and($declNode['allowUnlink'])->toBeFalse()
		->and($verifiedDeclToken['readOnly'] ?? false)->toBeTrue();

	// 3. Even if a signed token has readOnly=true alongside creatable=true/allowLink=true, handleRelationAction rejects all MUTATING_RELATION_ACTIONS
	$contradictoryReadOnlyToken = $workspace->relationSigner()->sign([
		'cardinality' => 'o2m',
		'resource' => 'page',
		'readOnly' => true,
		'creatable' => true,
		'allowLink' => true,
		'allowUnlink' => true,
		'ownerId' => 1,
		'foreignField' => 'parent_id',
	], $uid);

	foreach (['quick_create', 'o2m_link', 'o2m_unlink'] as $mutAction) {
		$res = $workspace->handleRelationAction([
			'action' => $mutAction,
			'relationToken' => $contradictoryReadOnlyToken,
			'targetValue' => 1,
			'payload' => ['title' => 'Blocked'],
		], false);
		expect($res['ok'])->toBeFalse()
			->and($res['status'])->toBe(403);
	}

	// 4. Explicit HTTP GET method rejects mutating relation actions with 405
	$writableToken = $workspace->relationSigner()->sign([
		'cardinality' => 'm2o',
		'resource' => 'page',
		'creatable' => true,
		'createParentId' => 1,
	], $uid);
	$getMutRes = $workspace->handleRelationAction([
		'_requestMethod' => 'GET',
		'action' => 'quick_create',
		'relationToken' => $writableToken,
		'payload' => ['title' => 'No GET Mutations'],
	], false);
	expect($getMutRes['ok'])->toBeFalse()
		->and($getMutRes['status'])->toBe(405);
});

test('PageResourceAdapter enforces cardinality=o2m for o2m_link/o2m_unlink, ownerPage editable/non-admin/non-trash checks, and targetPage scope constraints', function (): void {
	$workspace = React::instance();
	$uid = (int) wire('user')->id;

	// 1. M2O token attempting o2m_link or o2m_unlink is rejected with 403
	$m2oToken = $workspace->relationSigner()->sign([
		'cardinality' => 'm2o',
		'resource' => 'page',
		'allowLink' => true,
		'allowUnlink' => true,
		'ownerId' => 1,
		'foreignField' => 'parent_id',
	], $uid);

	expect($workspace->handleRelationAction([
		'action' => 'o2m_link',
		'relationToken' => $m2oToken,
		'targetValue' => 1,
	], false)['status'])->toBe(403);

	expect($workspace->handleRelationAction([
		'action' => 'o2m_unlink',
		'relationToken' => $m2oToken,
		'targetValue' => 1,
	], false)['status'])->toBe(403);

	// 2. Admin-root ownerPage rejected in mutatePageReference & quickCreate
	/** @var \Totoglu\React\Relation\Resource\PageResourceAdapter $pageAdapter */
	$pageAdapter = $workspace->relations()->get('page');
	$adminRootId = (int) (wire('config')->adminRootPageID ?: 2);

	expect(fn () => $pageAdapter->link($adminRootId, 'parent_id', 1, ['allowLink' => true]))
		->toThrow(WireException::class);

	// 3. Unprivileged non-superuser without editable() on ownerPage rejected
	$unprivUser = new User();
	wire($unprivUser);
	$unprivUser->id = 999501;
	$unprivUser->name = 'unpriv-rel-viewer';
	$guestRole = wire('roles')->get('guest');
	if ($guestRole instanceof Role) {
		$unprivUser->addRole($guestRole);
	}
	$prevUser = wire('user');
	wire('users')->setCurrentUser($unprivUser);
	try {
		expect(fn () => $pageAdapter->link(1, 'parent_id', 1, ['allowLink' => true]))
			->toThrow(WireException::class)
			->and(fn () => $pageAdapter->quickCreate(['title' => 'Nope'], ['creatable' => true, 'ownerId' => 1, 'parentId' => 1]))
			->toThrow(WireException::class);
	} finally {
		wire('users')->setCurrentUser($prevUser);
	}

	// 4. Target page outside signed template constraint rejected in link
	expect(fn () => $pageAdapter->link(1, 'parent_id', 1, [
		'allowLink' => true,
		'templates' => ['non_existent_allowed_tpl_xyz'],
	]))->toThrow(WireException::class);
});

test('handleViewportAction rejects guests with 403, enforces CSRF on export/sort/switch_view_mode/select_view/reset_filters, and validates switch_view_mode against resolveAvailableViewModes', function (): void {
	$workspace = React::instance();
	$provider = new ArrayDataProvider(
		id: 'array:vp_sec_hardening',
		items: [
			['id' => '1', 'title' => 'Row One', 'status' => 1],
		],
		options: [
			'columns' => ['title' => 'Title', 'status' => 'Status'],
			'exportFormats' => ['csv'],
		],
	);
	wire($provider);
	$workspace->providers()->register('array:vp_sec_hardening', $provider);

	$table = $workspace->configureTable('array:vp_sec_hardening');
	$prop = $table->toInertiaProp();
	$stateToken = (string) $prop['stateToken'];

	// 1. Guest user rejected with 403 before any action runs
	$guestUser = wire('users')->getGuestUser();
	$prevUser = wire('user');
	if ($guestUser instanceof User) {
		wire('users')->setCurrentUser($guestUser);
		try {
			$guestRes = $workspace->handleViewportAction([
				'stateToken' => $stateToken,
				'action' => 'fetch',
			]);
			expect($guestRes['ok'])->toBeFalse()
				->and($guestRes['status'])->toBe(403);
		} finally {
			wire('users')->setCurrentUser($prevUser);
		}
	}

	// 2. Newly hardened actions require CSRF when enforceCsrf=true
	foreach (['export', 'sort', 'switch_view_mode', 'select_view', 'reset_filters'] as $csrfAction) {
		$denied = $workspace->handleViewportAction([
			'stateToken' => $stateToken,
			'action' => $csrfAction,
			'csrf' => ['name' => 'TOKEN', 'value' => 'bad_token'],
			'payload' => ['mode' => 'cards', 'field' => 'title', 'format' => 'csv', 'view' => 'all'],
		], true);
		expect($denied['ok'])->toBeFalse("Expected {$csrfAction} to fail closed without valid CSRF")
			->and($denied['status'])->toBe(419);
	}

	// 3. Explicit GET request on mutating viewport action fails with 405
	$getDenied = $workspace->handleViewportAction([
		'_requestMethod' => 'GET',
		'stateToken' => $stateToken,
		'action' => 'sort',
		'payload' => ['field' => 'title'],
	], false);
	expect($getDenied['ok'])->toBeFalse()
		->and($getDenied['status'])->toBe(405);

	// 4. switch_view_mode rejects unavailable/arbitrary viewMode and accepts 'cards'
	$invalidModeRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'switch_view_mode',
		'payload' => ['mode' => 'unregistered_arbitrary_mode'],
	], false);
	expect($invalidModeRes['ok'])->toBeFalse()
		->and($invalidModeRes['status'])->toBe(422);

	$validModeRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'switch_view_mode',
		'payload' => ['mode' => 'cards'],
	], false);
	expect($validModeRes['ok'])->toBeTrue()
		->and($validModeRes['viewport']['viewMode'])->toBe('cards');
});

test('PagesDataProvider::buildSelectorString uses include=all only for superuser and include=unpublished for page-edit non-superusers', function (): void {
	$provider = new PagesDataProvider('template=basic-page');
	wire($provider);

	// Superuser -> include=all
	$superSelector = $provider->buildSelectorString();
	expect($superSelector)->toContain('include=all');

	// Non-superuser with page-edit -> include=unpublished (NOT include=all!)
	$editorRole = new Role();
	wire($editorRole);
	$editorRole->id = 999601;
	$editorRole->name = 'test-page-editor-role';
	$pageEditPerm = wire('permissions')->get('page-edit');
	if ($pageEditPerm && $pageEditPerm->id) {
		$editorRole->addPermission($pageEditPerm);
	}

	$editorUser = new class extends User {
		public function isSuperuser(): bool
		{
			return false;
		}

		public function hasPermission($name, $context = null): bool
		{
			return (string) $name === 'page-edit';
		}
	};
	wire($editorUser);
	$editorUser->id = 999602;
	$editorUser->name = 'test-editor-user';

	$prevUser = wire('user');
	wire('users')->setCurrentUser($editorUser);
	try {
		$editorSelector = $provider->buildSelectorString();
		expect($editorSelector)->toContain('include=unpublished')
			->and($editorSelector)->not->toContain('include=all');
	} finally {
		wire('users')->setCurrentUser($prevUser);
	}
});

test('InputfieldTiptap::cleanHtmlValue falls back to deterministic DOM allowlist when purifier fails or context is null and strips entity-encoded URI schemes, svg, math, and event handlers', function (): void {
	// 1. Fallback sanitizer (`purifier` disabled) neutralizes entity-encoded javascript:, <svg>, <math>, and on* handlers
	/** @var InputfieldTiptap $tiptapNoPurifier */
	$tiptapNoPurifier = new InputfieldTiptap();
	wire($tiptapNoPurifier);
	$tiptapNoPurifier->set('features', ['toolbar', 'bubbleMenu']); // purifier intentionally omitted
	$tiptapNoPurifier->set('toggles', []);

	$maliciousHtml = '<p><a href="java&#x73;cript:alert(1)">Hex Bypass</a>'
		. ' <a href="&#106;&#97;vascript:alert(2)">Dec Bypass</a>'
		. ' <a href="data:text/html,<script>alert(3)</script>">Data URI</a>'
		. ' <a href="https://processwire.com/docs/">Safe Docs</a></p>'
		. '<svg onload="alert(4)"><circle cx="10" cy="10" r="5"/></svg>'
		. '<math><mtext><script>alert(5)</script></mtext></math>'
		. '<img src="/site/assets/files/1/photo.jpg" onerror="alert(6)" alt="Photo">';

	$cleaned = $tiptapNoPurifier->cleanHtmlValue($maliciousHtml);
	expect($cleaned)->not->toContain('javascript:')
		->and($cleaned)->not->toContain('java&#')
		->and($cleaned)->not->toContain('data:text/html')
		->and($cleaned)->not->toContain('<svg')
		->and($cleaned)->not->toContain('<math')
		->and($cleaned)->not->toContain('onload')
		->and($cleaned)->not->toContain('onerror')
		->and($cleaned)->toContain('https://processwire.com/docs/')
		->and($cleaned)->toContain('src="/site/assets/files/1/photo.jpg"');

	// 2. When purifier IS enabled and MarkupHTMLPurifier throws or context is null, fallback DOM allowlist sanitizes XSS without wiping safe prose
	$tiptapFallback = new class extends InputfieldTiptap {
		protected function runHtmlPurifier(string $html): string
		{
			throw new \RuntimeException('Simulated Purifier failure');
		}
	};
	wire($tiptapFallback);
	$tiptapFallback->set('features', ['toolbar', 'purifier']);
	$fallbackOut = $tiptapFallback->cleanHtmlValue('<p onclick="evil()">Safe fallback prose</p><script>alert(1)</script><a href="javascript:boom()">Bad</a>');
	expect($fallbackOut)->toContain('<p>Safe fallback prose</p>')
		->and($fallbackOut)->not->toContain('<script')
		->and($fallbackOut)->not->toContain('onclick')
		->and($fallbackOut)->not->toContain('javascript:');

	$nullContextOut = \Totoglu\React\Tiptap\TiptapContentPolicy::sanitizeHtml(
		'<p>Contextless safe text</p><script>evil()</script>',
		['features' => ['purifier'], 'toggles' => []],
		null
	);
	expect($nullContextOut)->toBe('<p>Contextless safe text</p>');
});

test('Server-side URL protocol sanitization and JSON_HEX_TAG | JSON_HEX_AMP protect all HTML-embedded JSON islands', function (): void {
	$workspace = React::instance();

	// 1. WorkspaceDefinition & WorkspaceWidgetDefinition sanitize unsafe schemes
	$badWs = WorkspaceDefinition::fromArray([
		'id' => 'bad-scheme-ws',
		'title' => 'Bad Scheme',
		'url' => 'javascript:alert(1)',
		'logoUrl' => 'data:text/html,<script>alert(1)</script>',
	]);
	expect($badWs->url)->toBe('')
		->and($badWs->logoUrl)->toBe('');

	$goodWs = WorkspaceDefinition::fromArray([
		'id' => 'good-scheme-ws',
		'title' => 'Good Scheme',
		'url' => '/processwire/setup/good/',
		'logoUrl' => 'https://example.com/logo.png',
	]);
	expect($goodWs->url)->toBe('/processwire/setup/good/')
		->and($goodWs->logoUrl)->toBe('https://example.com/logo.png');

	$badWidget = WorkspaceWidgetDefinition::fromArray([
		'id' => 'bad-widget',
		'title' => 'Bad Widget',
		'workspaceId' => 'good-scheme-ws',
		'data' => [
			'items' => [
				['id' => '1', 'title' => 'Evil Item', 'href' => 'javascript:evil()'],
				['id' => '2', 'title' => 'Protocol Rel', 'href' => '//attacker.example/phish'],
				['id' => '3', 'title' => 'Safe Item', 'href' => '/admin/safe/'],
			],
			'actions' => [
				['label' => 'Evil Act', 'href' => 'vbscript:msgbox(1)'],
				['label' => 'Safe Act', 'href' => 'mailto:ops@example.com'],
			],
		],
	]);
	$resolvedWidgetData = $workspace->widgets()->resolveData($badWidget);
	expect($resolvedWidgetData['items'][0]['href'])->toBe('')
		->and($resolvedWidgetData['items'][1]['href'])->toBe('')
		->and($resolvedWidgetData['items'][2]['href'])->toBe('/admin/safe/')
		->and($resolvedWidgetData['actions'])->toHaveCount(1)
		->and($resolvedWidgetData['actions'][0]['href'])->toBe('mailto:ops@example.com');

	// 2. JSON_HEX_TAG | JSON_HEX_AMP in HTML-embedded JSON across all 5 PHP island renderers
	$xssPayload = '</script><script>alert(1)&boom</script>';

	$islandHtml = $workspace->renderIsland('Test/Island', ['danger' => $xssPayload]);
	expect($islandHtml)->not->toContain('</script>')
		->and($islandHtml)->toContain('\u003C');

	$tableHtml = $workspace->renderTable([['id' => '1', 'title' => $xssPayload]]);
	expect($tableHtml)->not->toContain('</script>')
		->and($tableHtml)->toContain('\u003C');

	$tabsHtml = $workspace->renderTabs([['id' => 't1', 'label' => $xssPayload, 'content' => 'ok']]);
	expect($tabsHtml)->not->toContain('</script>')
		->and($tabsHtml)->toContain('\u003C');

	/** @var InputfieldTiptap $tiptap */
	$tiptap = wire('modules')->get('InputfieldTiptap');
	$tiptap->attr('name', 'hex_body');
	$tiptap->label = $xssPayload;
	$tiptapHtml = $tiptap->render();
	expect($tiptapHtml)->not->toContain('</script>')
		->and($tiptapHtml)->toContain('\u003C');

	$reactInput = new class extends InputfieldReact {
		public function inertiaComponent(): string
		{
			return 'Test/HexInput';
		}
	};
	wire($reactInput);
	$reactInput->attr('name', 'hex_input');
	$reactInput->label = $xssPayload;
	$reactInputHtml = $reactInput->render();
	$reactInputValHtml = $reactInput->renderValue();
	expect($reactInputHtml)->not->toContain('</script>')
		->and($reactInputHtml)->toContain('\u003C')
		->and($reactInputValHtml)->not->toContain('</script>')
		->and($reactInputValHtml)->toContain('\u003C');
});

test('Removed viewport-specific OP_* constants stay absent from React core contracts, FormSchemaSerializer extracts hidden inputs, and dead methods are removed', function (): void {
	// 1. Removed mode-specific OP_* constants stay off ReactDataProviderInterface while OP_UPDATE_FIELD stays functional
	expect(defined(ReactDataProviderInterface::class . '::OP_RESIZE'))->toBeFalse()
		->and(defined(ReactDataProviderInterface::class . '::OP_RESIZE_SPAN'))->toBeFalse()
		->and(defined(ReactDataProviderInterface::class . '::OP_MOVE_STAGE'))->toBeFalse()
		->and(defined(ReactDataProviderInterface::class . '::OP_RESCHEDULE'))->toBeFalse()
		->and(defined(ReactDataProviderInterface::class . '::OP_SHIFT_DATES'))->toBeFalse()
		->and(ReactDataProviderInterface::OP_UPDATE_FIELD)->toBe('update_field');

	$arrayProvider = new ArrayDataProvider(
		id: 'array:update_field_test',
		items: [
			[
				'id' => 'ev_1',
				'title' => 'Conference',
			],
		],
	);
	wire($arrayProvider);
	$modified = $arrayProvider->mutate(ReactDataProviderInterface::OP_UPDATE_FIELD, ['ev_1'], [
		'field' => 'title',
		'value' => 'Updated Conference',
	]);
	expect($modified)->toBe(1)
		->and($arrayProvider->findById('ev_1')?->title)->toBe('Updated Conference');

	// 2. FormSchemaSerializer extracts deduplicated hidden inputs from InputfieldMarkup HTML
	$wrapper = new InputfieldWrapper();
	wire($wrapper);
	/** @var InputfieldMarkup $markup */
	$markup = wire('modules')->get('InputfieldMarkup');
	$markup->attr('name', 'hidden_carrier');
	$markup->attr(
		'value',
		'<div>Info</div>'
		. '<input type="hidden" name="custom_token_a" value="alpha_123" />'
		. '<input value="beta_456" name="custom_token_b" type="hidden">'
		. '<input type="hidden" name="custom_token_a" value="duplicate_ignored" />'
	);
	$wrapper->add($markup);

	$serializer = new FormSchemaSerializer();
	wire($serializer);
	$schema = $serializer->serialize($wrapper);
	$byName = [];
	foreach ($schema['hiddenInputs'] as $hi) {
		$byName[$hi['name']] = $hi['value'];
	}
	expect($byName)->toHaveKey('custom_token_a', 'alpha_123')
		->and($byName)->toHaveKey('custom_token_b', 'beta_456');

	// 3. Zero-caller unused PHP methods removed while keeping active sibling contracts
	expect(method_exists(React::class, 'setReactProcess'))->toBeFalse()
		->and(method_exists(React::class, 'withReactProcess'))->toBeFalse()
		->and(method_exists(React::class, 'isReactProcess'))->toBeFalse()
		->and(method_exists(ReactViewPreferenceStore::class, 'saveSessionViewPreferences'))->toBeFalse()
		->and(method_exists(ReactViewPreferenceStore::class, 'getSessionViewPreferences'))->toBeTrue();
});

test('Compiled frontend bundles execute under strict CSP (--disallow-code-generation-from-strings) and enforce sanitizeHref, safe arithmetic CalculationField, generic scopePrefix, and invariant useSchemaFormContext', function (): void {
	$distDir = dirname(__DIR__, 2) . '/dist';
	$nodeBin = trim((string) shell_exec('command -v node'));
	expect($nodeBin)->not->toBe('');

	$script = <<<'JS'
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const distDir = process.argv[1];

// Minimal DOM shim for loading self-contained runtime bundles
const stubEl = {
	matches: () => false,
	querySelectorAll: () => [],
	querySelector: () => null,
	appendChild: () => {},
	removeChild: () => {},
	addEventListener: () => {},
	removeEventListener: () => {},
	getAttribute: () => null,
	setAttribute: () => {},
	removeAttribute: () => {},
	hasAttribute: () => false,
	classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
	dataset: {},
	style: {},
};
globalThis.HTMLElement = class HTMLElement {};
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.history = { state: null, scrollRestoration: 'auto', pushState: () => {}, replaceState: () => {} };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
globalThis.localStorage = globalThis.sessionStorage;
globalThis.location = { href: 'http://localhost/admin/', origin: 'http://localhost', pathname: '/admin/', search: '', hash: '' };
globalThis.document = {
	readyState: 'loading',
	body: stubEl,
	head: stubEl,
	documentElement: stubEl,
	getElementById: () => null,
	querySelector: () => null,
	querySelectorAll: () => [],
	createElement: () => ({ ...stubEl, style: {} }),
	addEventListener: () => {},
	removeEventListener: () => {},
};

for (const file of [
	'ReactInertia.js',
	'ReactLayout.js',
	'ReactViewports.js',
	'ReactIcons.js',
	'MarkupReactTable.js',
	'MarkupReactCards.js',
	'MarkupReactTab.js',
	'InputfieldReactKeyValue.js',
	'InputfieldReactIcon.js',
	'InputfieldReactLink.js',
	'ReactMedia.js',
	'InputfieldReactFile.js',
	'InputfieldReactImage.js',
	'InputfieldReactRelation.js',
]) {
	vm.runInThisContext(fs.readFileSync(path.join(distDir, file), 'utf8'), { filename: file });
}

const rt = globalThis.ReactWorkspaceRuntime;
const ctxBefore = rt.Fields.SchemaFormContext;
const hookBefore = rt.Fields.useSchemaFormContext;
const kvBeforeSchema = rt.Fields.KeyValueFieldControl;
const tabBeforeSchema = rt.Fields.SchemaTabContainer;
const relBeforeSchema = rt.Fields.RelationFieldControl;
const linkBeforeSchema = rt.Fields.LinkFieldControl;
const iconBeforeSchema = rt.Fields.IconFieldControl;
const fileBeforeSchema = rt.Fields.FileFieldControl;
const imageBeforeSchema = rt.Fields.ImageFieldControl;

vm.runInThisContext(fs.readFileSync(path.join(distDir, 'SchemaForm.js'), 'utf8'), { filename: 'SchemaForm.js' });

const ctxAfter = rt.Fields.SchemaFormContext;
const hookAfter = rt.Fields.useSchemaFormContext;
const nonClobberPreserved = (
	rt.Fields.KeyValueFieldControl === kvBeforeSchema && typeof kvBeforeSchema === 'function' &&
	rt.Fields.SchemaTabContainer === tabBeforeSchema && typeof tabBeforeSchema === 'function' &&
	rt.Fields.RelationFieldControl === relBeforeSchema && typeof relBeforeSchema === 'function' &&
	rt.Fields.LinkFieldControl === linkBeforeSchema && typeof linkBeforeSchema === 'function' &&
	rt.Fields.IconFieldControl === iconBeforeSchema && typeof iconBeforeSchema === 'function' &&
	rt.Fields.FileFieldControl === fileBeforeSchema && typeof fileBeforeSchema === 'function' &&
	rt.Fields.ImageFieldControl === imageBeforeSchema && typeof imageBeforeSchema === 'function'
);

// Verify strict CSP blocks eval / new Function in this process
let evalBlocked = false;
try {
	new Function('return 1 + 1')();
} catch (err) {
	evalBlocked = err instanceof EvalError;
}

const s = rt.Utils.sanitizeHref;
const sanitizeChecks = {
	js: s('javascript:alert(1)'),
	ctrlJs: s('\t\nJaVaScRiPt:alert(1)'),
	data: s('data:text/html,<script>alert(1)</script>'),
	vb: s('vbscript:msgbox(1)'),
	protoRel: s('//evil.example.com/x'),
	relSlash: s('/admin/page/edit/?id=10'),
	dotSlash: s('./?id=10'),
	dotDot: s('../list/'),
	hash: s('#section-a'),
	https: s('https://processwire.com/docs/'),
	mailto: s('mailto:dev@example.com'),
	tel: s('tel:+15550199'),
};

globalThis.location.href = 'http://localhost/admin/';
rt.Inertia.safeRouter.visit('javascript:alert(1)');
rt.Inertia.safeRouter.visit('//evil.example.com/phish');
rt.Inertia.safeRouter.get('javascript:alert(1)');
rt.Inertia.safeRouter.get('/\\evil.example.com/phish');
const hrefAfterBlockedNav = globalThis.location.href;
rt.Inertia.safeRouter.get('/admin/safe-dest/', { tab: 'seo' });
const hrefAfterSafeNav = globalThis.location.href;

const scopedVal = rt.Fields.resolveScopedFieldValue(
	{ custom_block_9_price: 25, custom_block_9_qty: 4 },
	'price',
	'custom_block_9_'
);

const calcScoped = rt.Fields.evaluateSafeMathFormula(
	'({price} * {qty}) - {discount} + (-5) + (10 % 3)',
	{
		custom_block_9_price: '25',
		custom_block_9_qty: '4',
		custom_block_9_discount: '10',
	},
	2,
	'custom_block_9_'
);
const calcDivZero = rt.Fields.evaluateSafeMathFormula('{price} / 0', { price: '50' }, 2);
const calcInvalid = rt.Fields.evaluateSafeMathFormula('((10 + 5)', {}, 2);

const schemaFieldEl = rt.React.createElement(rt.Fields.SchemaField, {
	field: {
		id: 'f_total',
		name: 'custom_block_9_total',
		label: 'Total',
		type: 'calculation',
		formula: '({price} * {qty})',
		precision: 2,
	},
});

const hasTableViewport = typeof rt.getViewport('table') === 'function';
const hasCardsViewport = typeof rt.getViewport('cards') === 'function';
const hasAppShell = typeof rt.Layout.AppShell === 'function';

process.stdout.write(JSON.stringify({
	evalBlocked,
	sameContextRef: ctxBefore === ctxAfter && Boolean(ctxBefore),
	sameHookRef: hookBefore === hookAfter && typeof hookBefore === 'function',
	nonClobberPreserved,
	noLegacyViewportGlobal: rt.__registerViewportMode === undefined && rt.__getViewportMode === undefined,
	noRhfExport: rt.Fields.useFormContext === undefined && rt.Fields.Controller === undefined,
	sanitizeChecks,
	scopedVal,
	calcScoped,
	calcDivZero,
	calcInvalid,
	hasTableViewport,
	hasCardsViewport,
	hasAppShell,
	schemaFieldCreated: Boolean(schemaFieldEl),
	hrefAfterBlockedNav,
	hrefAfterSafeNav,
}));
process.exit(0);
JS;

	$cmd = escapeshellarg($nodeBin)
		. ' --disallow-code-generation-from-strings -e '
		. escapeshellarg($script)
		. ' '
		. escapeshellarg($distDir);
	$rawOut = (string) shell_exec($cmd);
	$decoded = json_decode($rawOut, true);

	expect($decoded)->toBeArray()
		->and($decoded['evalBlocked'])->toBeTrue()
		->and($decoded['sameContextRef'])->toBeTrue()
		->and($decoded['sameHookRef'])->toBeTrue()
		->and($decoded['nonClobberPreserved'])->toBeTrue()
		->and($decoded['noLegacyViewportGlobal'])->toBeTrue()
		->and($decoded['noRhfExport'])->toBeTrue()
		->and($decoded['scopedVal'])->toBe(25)
		->and($decoded['calcScoped'])->toBe('86.00')
		->and($decoded['calcDivZero'])->toBe('0.00')
		->and($decoded['calcInvalid'])->toBe('0.00')
		->and($decoded['hasTableViewport'])->toBeTrue()
		->and($decoded['hasCardsViewport'])->toBeTrue()
		->and($decoded['hasAppShell'])->toBeTrue()
		->and($decoded['schemaFieldCreated'])->toBeTrue()
		->and($decoded['sanitizeChecks']['js'])->toBe('')
		->and($decoded['sanitizeChecks']['ctrlJs'])->toBe('')
		->and($decoded['sanitizeChecks']['data'])->toBe('')
		->and($decoded['sanitizeChecks']['vb'])->toBe('')
		->and($decoded['sanitizeChecks']['protoRel'])->toBe('')
		->and($decoded['sanitizeChecks']['relSlash'])->toBe('/admin/page/edit/?id=10')
		->and($decoded['sanitizeChecks']['dotSlash'])->toBe('./?id=10')
		->and($decoded['sanitizeChecks']['dotDot'])->toBe('../list/')
		->and($decoded['sanitizeChecks']['hash'])->toBe('#section-a')
		->and($decoded['sanitizeChecks']['https'])->toBe('https://processwire.com/docs/')
		->and($decoded['sanitizeChecks']['mailto'])->toBe('mailto:dev@example.com')
		->and($decoded['sanitizeChecks']['tel'])->toBe('tel:+15550199')
		->and($decoded['hrefAfterBlockedNav'])->toBe('http://localhost/admin/')
		->and($decoded['hrefAfterSafeNav'])->toBe('/admin/safe-dest/?tab=seo');
});

test('Standard 6-slot form field anatomy, pw-lang underline tabs, and native LanguageTabs bridge ship in compiled bundles', function (): void {
	$distDir = dirname(__DIR__, 2) . '/dist';
	$css = (string) file_get_contents($distDir . '/ReactInertia.css');
	$schemaBundle = (string) file_get_contents($distDir . '/SchemaForm.js');
	$tiptapBundle = (string) file_get_contents($distDir . '/TiptapCore.js');

	expect($css)->toContain('[data-rw-tablist][data-variant=pw-lang]')
		->and($css)->toContain('Highlight')
		->and($schemaBundle)->toContain('data-rw-field-slot')
		->and($schemaBundle)->toContain('dblclicklangtab.rwLangBridge')
		->and($schemaBundle)->toContain('wk:language-tab-select-all')
		->and($schemaBundle)->toContain('data-rw-lang-expand-toggle')
		->and($schemaBundle)->not->toContain('supportsInlineHeaderLangBar')
		->and($schemaBundle)->not->toContain('validateIncomingMediaFiles')
		->and($schemaBundle)->not->toContain('MediaUploadDropzone')
		->and($tiptapBundle)->toContain('data-rw-tiptap-lang-tabs')
		->and($tiptapBundle)->toContain('dblclicklangtab.rwLangBridge');
});

test('Audit hardening: bounded JSON reader, relation hydrate scope confinement, link/URL protocol-relative guards, PageLinkMediaHostAdapter fail-closed rootPage, JSON_INVALID_UTF8_SUBSTITUTE, and fast-path island serialization', function (): void {
	$workspace = React::instance();
	$uid = (int) wire('user')->id;

	// 1. Bounded readJsonRequestBody enforces maxBytes and maxDepth
	$makeBoundedWs = static function (string $body): React {
		$ws = new class ($body) extends React {
			public function __construct(private string $mockBody)
			{
				parent::__construct();
			}

			protected function readRawInputStream(int $limit): string
			{
				return substr($this->mockBody, 0, $limit);
			}
		};
		wire($ws);

		return $ws;
	};

	expect($makeBoundedWs('{"action":"save","ok":true}')->readJsonRequestBody(1024, 8))
		->toBe(['action' => 'save', 'ok' => true])
		->and($makeBoundedWs(str_repeat(' ', 500) . '{"a":1}')->readJsonRequestBody(128, 8))->toBeNull();

	$deepJson = str_repeat('[', 70) . '1' . str_repeat(']', 70);
	expect($makeBoundedWs($deepJson)->readJsonRequestBody(65536, 64))->toBeNull();

	// 2. InputfieldReactLink::sanitizeHref & UrlSanitizer reject protocol-relative //, /\, \, and control-char schemes
	expect(\ProcessWire\InputfieldReactLink::sanitizeHref('//evil.example.com/phish'))->toBe('')
		->and(\ProcessWire\InputfieldReactLink::sanitizeHref('/\\evil.example.com/phish'))->toBe('')
		->and(\ProcessWire\InputfieldReactLink::sanitizeHref('\\evil.example.com/phish'))->toBe('')
		->and(\ProcessWire\InputfieldReactLink::sanitizeHref("java\x09script:alert(1)"))->toBe('')
		->and(\ProcessWire\InputfieldReactLink::sanitizeHref('blob :https://evil.example.com'))->toBe('')
		->and(\ProcessWire\InputfieldReactLink::sanitizeHref('http:///evil.example.com'))->toBe('')
		->and(\ProcessWire\InputfieldReactLink::sanitizeHref('/safe/internal/path/'))->toBe('/safe/internal/path/')
		->and(\ProcessWire\InputfieldReactLink::sanitizeHref('https://processwire.com/'))->toBe('https://processwire.com/')
		->and(\Totoglu\React\Security\UrlSanitizer::sanitizeHref('/\\evil.example.com'))->toBe('');

	// 3. Relation adapters enforce signed config scope on hydrate() and preserve input order
	$pageAdapter = $workspace->relations()->get('page');
	$adminId = (int) (wire('config')->adminRootPageID ?: 2);
	expect($pageAdapter->hydrate([$adminId, 1], ['templates' => ['home']]))->toHaveCount(1)
		->and((int) $pageAdapter->hydrate([$adminId, 1], ['templates' => ['home']])[0]->value)->toBe(1)
		->and($pageAdapter->hydrate([1], ['templates' => ['non_existent_tpl_xyz']]))->toBe([]);

	$tplAdapter = $workspace->relations()->get('template');
	expect($tplAdapter->hydrate(['admin'], ['includeSystem' => false]))->toBe([])
		->and($tplAdapter->hydrate(['admin'], ['includeSystem' => true]))->toHaveCount(1)
		->and($tplAdapter->hydrate(['home'], ['tags' => ['non_matching_tag_xyz']]))->toBe([]);

	$fieldAdapter = $workspace->relations()->get('field');
	expect($fieldAdapter->hydrate(['title'], ['fieldtypes' => ['FieldtypeImage']]))->toBe([])
		->and($fieldAdapter->hydrate(['title'], ['fieldtypes' => ['FieldtypePageTitle', 'PageTitle']]))->toHaveCount(1);

	$userAdapter = $workspace->relations()->get('user');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	expect($userAdapter->hydrate([$superId], ['roles' => ['non_existent_role_xyz']]))->toBe([])
		->and($userAdapter->hydrate([$superId], ['roles' => ['superuser']]))->toHaveCount(1);

	// 4. PageLinkMediaHostAdapter fails closed when rootPageId does not exist
	$linkField = new \ProcessWire\Field();
	wire($linkField);
	$linkField->type = wire('modules')->get('FieldtypeText');
	$linkField->name = 'rw_audit_link_probe';
	$linkField->set('inputfieldClass', 'InputfieldReactLink');
	wire('fields')->save($linkField);
	try {
		$linkAdapter = new \Totoglu\React\Media\PageLinkMediaHostAdapter();
		wire($linkAdapter);
		$badRootCtx = $linkAdapter->resolveTargetContext([
			'pageId' => 1,
			'rootPageId' => 99999999,
			'fieldName' => 'rw_audit_link_probe',
			'mediaProfile' => 'file',
		], wire('user'), true);
		expect($badRootCtx['ok'])->toBeFalse()
			->and($badRootCtx['status'])->toBe(403);
	} finally {
		wire('fields')->delete($linkField);
	}

	// 5. Invalid UTF-8 bytes in data-props survive via JSON_INVALID_UTF8_SUBSTITUTE and InputfieldReact fast-path skips render()
	$badUtf8 = "Valid prefix \xC3\x28 suffix";
	expect($workspace->renderIsland('Audit/Utf8', ['text' => $badUtf8]))->toContain('Valid prefix')
		->and($workspace->renderTable([['id' => '1', 'title' => $badUtf8]]))->toContain('Valid prefix')
		->and($workspace->renderTabs([['id' => 't1', 'label' => $badUtf8]]))->toContain('Valid prefix');

	$fastIslandField = new class extends InputfieldReact {
		public int $renderCalls = 0;

		public function inertiaComponent(): string
		{
			return 'Audit/FastIsland';
		}

		public function inertiaWithData(): array
		{
			return ['token' => 'direct_no_html_roundtrip'];
		}
	};
	wire($fastIslandField);
	$fastIslandField->attr('name', 'fast_island');
	expect($fastIslandField->renderValue())->toContain('data-readonly="true"');

	$directMeta = $fastIslandField->toSchemaFormIsland();
	expect($directMeta)->toBeArray()
		->and($directMeta['component'])->toBe('Audit/FastIsland')
		->and($directMeta['props']['props']['token'] ?? null)->toBe('direct_no_html_roundtrip');

	$wrapper = new InputfieldWrapper();
	wire($wrapper);
	$wrapper->add($fastIslandField);
	$serializedSchema = $workspace->serializeForm($wrapper);
	expect($serializedSchema['fields'][0]['kind'] ?? null)->toBe('island')
		->and($serializedSchema['fields'][0]['component'] ?? null)->toBe('Audit/FastIsland')
		->and(array_key_exists('fallbackHtml', $serializedSchema['fields'][0]))->toBeFalse();

	// 6. PagesDataProvider::formatColumn skips $page->get() for 1-arg closures while passing ($page, $raw) to 2-arg closures
	$pagesProvider = new PagesDataProvider('id=1', [
		'columns' => [
			'title' => 'Title',
			'computed_1arg' => 'Computed 1-Arg',
			'name_2arg' => 'Name 2-Arg',
		],
	]);
	wire($pagesProvider);
	$pagesProvider->formatColumn('computed_1arg', static fn (Page $p): string => 'id:' . (int) $p->id);
	$pagesProvider->formatColumn('name_2arg', static fn (Page $p, mixed $raw): string => 'p:' . (int) $p->id . ':' . (string) $raw);
	$qRes = $pagesProvider->query();
	expect($qRes->items)->toHaveCount(1)
		->and($qRes->items[0]->getDisplayValue('computed_1arg'))->toBe('id:1')
		->and(array_key_exists('computed_1arg', $qRes->items[0]->values))->toBeFalse()
		->and($qRes->items[0]->getDisplayValue('name_2arg'))->toBe('p:1:');
});

test('PagesDataProvider protects core system pages from destructive or status-disabling mutations and cache stores reject symlinks', function (): void {
	$prevUser = wire('user');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superUser = wire('users')->get($superId);
	if ($superUser instanceof User && $superUser->id > 0) {
		wire('users')->setCurrentUser($superUser);
	}

	try {
		$provider = new PagesDataProvider('id>1');
		wire($provider);

		$http404Id = (int) (wire('config')->http404PageID ?: 27);
		$trashId = (int) (wire('config')->trashPageID ?: 7);
		$guestId = (int) (wire('config')->guestUserPageID ?: 40);

		foreach (['trash', 'delete', 'draft', 'toggle_status', 'unlock'] as $op) {
			$affected = $provider->mutate($op, [$http404Id, $trashId, $guestId, $superId]);
			expect($affected)->toBe(0);
		}

		$http404 = wire('pages')->get($http404Id);
		if ($http404 instanceof Page && $http404->id > 0) {
			expect($http404->isUnpublished())->toBeFalse()
				->and($http404->isTrash())->toBeFalse();

			$http404Query = new PagesDataProvider("id={$http404Id}");
			wire($http404Query);
			$res404 = $http404Query->query();
			if ($res404->items !== []) {
				$actionKeys = array_map(static fn (array $a): string => $a['key'], $http404Query->recordActions($res404->items[0]));
				expect($actionKeys)->not->toContain('trash')
					->and($actionKeys)->not->toContain('delete')
					->and($actionKeys)->not->toContain('toggle_status');
			}
		}

		// Symlink guard on EditPresenceStore & WorkspacePreferenceStore write paths
		$presence = React::instance()->presence();
		$testKey = 'audit:symlink-test-' . uniqid('', true);
		$targetFile = $presence->filePath($testKey);
		$dir = $presence->directoryPath();
		if (!is_dir($dir)) {
			@mkdir($dir, 0755, true);
		}
		$realDummy = sys_get_temp_dir() . '/rw_symlink_dummy_' . uniqid('', true) . '.json';
		file_put_contents($realDummy, '{"untouched":true}');
		if (@symlink($realDummy, $targetFile) && $superUser instanceof User) {
			try {
				$snap = $presence->heartbeat($testKey, $superUser, 'tab_1');
				expect($snap['coEditors'])->toBe([])
					->and((string) file_get_contents($realDummy))->toBe('{"untouched":true}');
			} finally {
				@unlink($targetFile);
			}
		}
		$prefStore = React::instance()->workspacePreferences();
		$prefDir = $prefStore->directoryPath();
		if (!is_dir($prefDir)) {
			@mkdir($prefDir, 0755, true);
		}
		$fakePrefTarget = $prefDir . '999999999.json';
		$fakeUser = new User();
		wire($fakeUser);
		$fakeUser->id = 999999999;
		$fakeUser->name = 'audit_tmp_user';
		if (@symlink($realDummy, $fakePrefTarget)) {
			try {
				$prefStore->savePreferences(['favorites' => ['tampered']], $fakeUser);
				expect((string) file_get_contents($realDummy))->toBe('{"untouched":true}');
			} finally {
				@unlink($fakePrefTarget);
			}
		}
		@unlink($realDummy);

		// Verify canonical Boost skill & PHPStan Level 8 config
		$moduleDir = dirname(__DIR__, 2);
		$skillFile = $moduleDir . '/.agents/skills/pw-react/SKILL.md';
		$phpstanNeon = (string) file_get_contents($moduleDir . '/phpstan.neon');
		expect(is_file($skillFile))->toBeTrue()
			->and((string) file_get_contents($skillFile))->toContain('description: "Use when ')
			->and($phpstanNeon)->toContain('level: 8');

		// Verify PageLinkFilesManager implements hookable ___path() & ___url()
		$homePage = wire('pages')->get(1);
		if ($homePage instanceof Page && $homePage->id > 0) {
			$virtualHost = new \Totoglu\React\Media\PageLinkVirtualHost($homePage, 'cta_link');
			$fm = $virtualHost->filesManager();
			expect($fm)->toBeInstanceOf(\Totoglu\React\Media\PageLinkFilesManager::class)
				->and($fm->path())->toEndWith('/links/cta_link/')
				->and($fm->url())->toEndWith('/links/cta_link/');
		}

		// Verify PagesDataProvider strips top-level limit/start from baseSelector without corrupting sub-selectors
		$pagedProvider = new PagesDataProvider('template=basic-page, items=[limit=5], start=10, limit=12');
		wire($pagedProvider);
		$builtSelector = $pagedProvider->buildSelectorString();
		expect($builtSelector)->toContain('items=[limit=5]')
			->and($builtSelector)->toContain('start=0, limit=12')
			->and(substr_count($builtSelector, 'start='))->toBe(1);

		// Verify RoleResourceAdapter & PermissionResourceAdapter reject numeric page IDs when valueField=name
		$roleAdapter = React::instance()->relations()->get('role');
		$permAdapter = React::instance()->relations()->get('permission');
		$superRole = wire('roles')->get('superuser');
		$pageEditPerm = wire('permissions')->get('page-edit');
		if ($superRole && (int) $superRole->id > 0) {
			expect($roleAdapter->hydrate([(string) $superRole->id], ['valueField' => 'name']))->toBe([])
				->and($roleAdapter->hydrate([(string) $superRole->id], ['valueField' => 'id']))->toHaveCount(1);
		}
		if ($pageEditPerm && (int) $pageEditPerm->id > 0) {
			expect($permAdapter->hydrate([(string) $pageEditPerm->id], ['valueField' => 'name']))->toBe([])
				->and($permAdapter->hydrate([(string) $pageEditPerm->id], ['valueField' => 'id']))->toHaveCount(1);
		}

		// Verify locked collapsedNoLocked state blocks tampering on InputfieldReactM2O, M2M, M2A, Icon, and Tiptap
		$lockedM2O = new \ProcessWire\InputfieldReactM2O();
		wire($lockedM2O);
		$lockedM2O->attr('name', 'locked_m2o');
		$lockedM2O->collapsed = \ProcessWire\Inputfield::collapsedNoLocked;
		$lockedM2O->setAttribute('value', 1);
		$tamperIn = new \ProcessWire\WireInputData();
		$tamperIn->setArray(['locked_m2o' => '27', 'locked_m2o_present' => '1']);
		$lockedM2O->processInput($tamperIn);
		expect($lockedM2O->attr('value'))->toBe(1);

		// Verify strict `typ` token domain requirement (zero fallback when `typ` is omitted)
		$codec = new SignedTokenCodec();
		wire($codec);
		$currentUid = (int) wire('user')->id;
		$typelessToken = $codec->encode([
			'viewportClass' => 'MarkupReactTable',
			'resource' => 'template',
			'kind' => 'page',
			'uid' => $currentUid,
		]);
		$verifyTable = React::instance()->table();
		expect($verifyTable->verifyViewportState($typelessToken))->toBeNull()
			->and($codec->decode(str_repeat('a', 70000) . '.deadbeef'))->toBeNull()
			->and(React::instance()->relationSigner()->verify($typelessToken, $currentUid))->toBeNull()
			->and(React::instance()->media()->verify($typelessToken, $currentUid))->toBeNull();

		// Verify HTTP GET rejection (405) on /_react/workspace-prefs & /_react/presence, and $config->demo rejection (403)
		$ws = React::instance();
		expect($ws->handleWorkspacePrefsAction(['_requestMethod' => 'GET', 'action' => 'reset'], false, $superUser)['status'])->toBe(405)
			->and($ws->handlePresenceAction(['_requestMethod' => 'GET', 'resourceKey' => 'page:1'], false, $superUser)['status'])->toBe(405);

		$prevDemo = wire('config')->demo;
		wire('config')->demo = true;
		try {
			$vpToken = $verifyTable->signViewportState();
			$relToken = $ws->relationSigner()->sign(['cardinality' => 'm2o', 'resource' => 'page', 'creatable' => true], $currentUid);
			$mediaToken = $ws->media()->sign(['kind' => 'page', 'pageId' => 1, 'fieldName' => 'images'], $currentUid);
			expect($ws->handleViewportAction(['_requestMethod' => 'POST', 'action' => 'bulk_action', 'stateToken' => $vpToken], false)['status'])->toBe(403)
				->and($ws->handleRelationAction(['_requestMethod' => 'POST', 'action' => 'quick_create', 'relationToken' => $relToken], false, $superUser)['status'])->toBe(403)
				->and($ws->media()->handleAction(['_requestMethod' => 'POST', 'action' => 'upload', 'mediaToken' => $mediaToken], false, $superUser)['status'])->toBe(403)
				->and($ws->handleWorkspacePrefsAction(['_requestMethod' => 'POST', 'action' => 'reset'], false, $superUser)['status'])->toBe(403)
				->and($ws->handlePresenceAction(['_requestMethod' => 'POST', 'action' => 'heartbeat', 'resourceKey' => 'page:1'], false, $superUser)['status'])->toBe(403);
		} finally {
			wire('config')->demo = $prevDemo;
		}

		// Verify strict action allowlists on /_react/workspace-prefs and /_react/presence
		expect($ws->handleWorkspacePrefsAction(['_requestMethod' => 'POST', 'action' => 'unknown_action'], false, $superUser)['status'])->toBe(422)
			->and($ws->handlePresenceAction(['_requestMethod' => 'POST', 'action' => 'unknown_action', 'resourceKey' => 'page:1'], false, $superUser)['status'])->toBe(422)
			->and(\Totoglu\React\Security\UrlSanitizer::sanitizeHref('http:///evil.example.com'))->toBe('')
			->and(\Totoglu\React\Security\UrlSanitizer::sanitizeHref('https://\\evil.example.com'))->toBe('');

		// Verify ModuleResourceAdapter resolves `implements` across installed ProcessWire\* modules and enforces valueField on hydrate()
		$modAdapter = $ws->relations()->get('module');
		$arrayValueModules = $modAdapter->query([], [
			'prefix' => 'InputfieldReact',
			'implements' => 'InputfieldHasArrayValue',
			'valueField' => 'name',
		]);
		$foundModNames = array_map(static fn($item): string => (string) $item->value, $arrayValueModules['items']);
		expect($foundModNames)->toContain('InputfieldReactM2M')
			->toContain('InputfieldReactKeyValue');
		$m2mModId = (int) wire('modules')->getModuleID('InputfieldReactM2M');
		if ($m2mModId > 0) {
			expect($modAdapter->hydrate([(string) $m2mModId], ['valueField' => 'name']))->toBe([])
				->and($modAdapter->hydrate([(string) $m2mModId], ['valueField' => 'id']))->toHaveCount(1);
		}

		// Verify InputfieldReactLink::resolveValue invokes hooked Page::localUrl when LanguageSupportPageNames is active
		$languages = wire('languages');
		if ($languages instanceof \ProcessWire\Languages && $languages->count() > 0) {
			$defaultLang = $languages->getDefault();
			if ($defaultLang instanceof \ProcessWire\Language) {
				$resolvedHome = \ProcessWire\InputfieldReactLink::resolveValue(
					['type' => 'page', 'pageId' => 1],
					wire('pages')->get(1),
					null,
					$defaultLang,
				);
				expect($resolvedHome['href'])->not->toBe('');
			}
		}

		// Verify User, Template, Field, and Language adapters reject numeric IDs on hydrate() when valueField=name
		$userAdapter = $ws->relations()->get('user');
		$tplAdapter = $ws->relations()->get('template');
		$fieldAdapter = $ws->relations()->get('field');
		$langAdapter = $ws->relations()->get('language');
		expect($userAdapter->hydrate([(string) $superUser->id], ['valueField' => 'name']))->toBe([])
			->and($userAdapter->hydrate([(string) $superUser->id], ['valueField' => 'id']))->toHaveCount(1);

		$homeTpl = wire('templates')->get('home');
		if ($homeTpl instanceof \ProcessWire\Template && (int) $homeTpl->id > 0) {
			expect($tplAdapter->hydrate([(string) $homeTpl->id], ['valueField' => 'name']))->toBe([])
				->and($tplAdapter->hydrate([(string) $homeTpl->id], ['valueField' => 'id']))->toHaveCount(1);
		}
		$titleField = wire('fields')->get('title');
		if ($titleField instanceof Field && (int) $titleField->id > 0) {
			expect($fieldAdapter->hydrate([(string) $titleField->id], ['valueField' => 'name']))->toBe([])
				->and($fieldAdapter->hydrate([(string) $titleField->id], ['valueField' => 'id']))->toHaveCount(1);
		}
		if ($languages instanceof \ProcessWire\Languages && $languages->count() > 0) {
			$defLang = $languages->getDefault();
			if ($defLang instanceof \ProcessWire\Language && (int) $defLang->id > 0) {
				expect($langAdapter->hydrate([(string) $defLang->id], ['valueField' => 'name']))->toBe([])
					->and($langAdapter->hydrate([(string) $defLang->id], ['valueField' => 'id']))->toHaveCount(1);
			}
		}

		// Verify PageResourceAdapter strips top-level limit/start from signed selector in count() and query()
		$pageAdapter = $ws->relations()->get('page');
		$unboundedCount = $pageAdapter->count(['selector' => 'id>=1, include=all']);
		$strippedLimitCount = $pageAdapter->count(['selector' => 'id>=1, include=all, limit=1, start=0']);
		expect($strippedLimitCount)->toBe($unboundedCount);

		// Verify handleRelationAction & MediaGateway::handleAction scope ProcessWire RBAC to explicit $user parameter
		$unprivilegedName = 'rw_sec_unpriv_' . bin2hex(random_bytes(3));
		$unprivilegedUser = wire('users')->add($unprivilegedName);
		$unprivilegedUser->pass = 'RwSec!Pass987654';
		$unprivilegedUser->save();
		try {
			// Ambient wire('user') is still $superUser; passing $unprivilegedUser must NOT leak superuser RBAC
			$userRelToken = $ws->relationSigner()->sign([
				'cardinality' => 'm2o',
				'resource' => 'user',
			], (int) $unprivilegedUser->id);
			$relSearchAsUnpriv = $ws->handleRelationAction([
				'action' => 'search',
				'relationToken' => $userRelToken,
			], false, $unprivilegedUser);
			expect($relSearchAsUnpriv['ok'])->toBeTrue()
				->and($relSearchAsUnpriv['items'])->toBe([])
				->and((int) wire('user')->id)->toBe((int) $superUser->id);

			// MediaGateway rejects field not attached to target page template even for superuser
			$detachedFieldToken = $ws->media()->sign([
				'kind' => 'page',
				'pageId' => 1,
				'fieldName' => 'nonexistent_media_field_xyz',
			], (int) $superUser->id);
			$detachedRes = $ws->media()->handleAction([
				'_requestMethod' => 'POST',
				'action' => 'inspect',
				'mediaToken' => $detachedFieldToken,
			], false, $superUser);
			expect($detachedRes['ok'])->toBeFalse()
				->and($detachedRes['status'])->toBe(400);
		} finally {
			if ($unprivilegedUser instanceof User && $unprivilegedUser->id > 0) {
				wire('users')->delete($unprivilegedUser);
			}
		}

		// Verify MarkupReactViewport enforces viewport-level locked, quickEditEnabled, exportFormats, and field editability allowlists
		$vpSecProvider = new \Totoglu\React\Provider\ArrayDataProvider(
			id: 'array:vp_sec_guards',
			items: [
				['id' => 'row_1', 'title' => 'Alpha', 'label_note' => 'note', 'secret' => 'keep'],
			],
			options: [
				'columns' => ['title' => 'Title', 'label_note' => 'Note'],
				'inlineEditableFields' => [
					'label_note' => ['type' => 'text', 'label' => 'Note'],
				],
				'exportFormats' => ['csv'],
			],
		);
		$ws->providers()->register('array:vp_sec_guards', $vpSecProvider);

		$lockedVp = $ws->configureTable('array:vp_sec_guards', ['locked' => true]);
		$lockedVpToken = (string) $lockedVp->toInertiaProp()['stateToken'];
		$lockedMutateRes = $ws->handleViewportAction([
			'_requestMethod' => 'POST',
			'stateToken' => $lockedVpToken,
			'action' => 'update_field',
			'payload' => ['id' => 'row_1', 'field' => 'label_note', 'value' => 'tamper'],
		], false);
		expect($lockedMutateRes['ok'])->toBeFalse()
			->and($lockedMutateRes['error'])->toBe('Viewport is locked');

		$guardedVp = $ws->configureTable('array:vp_sec_guards', [
			'quickEditEnabled' => false,
			'exportFormats' => ['csv'],
		]);
		$guardedVpToken = (string) $guardedVp->toInertiaProp()['stateToken'];

		$quickEditBlocked = $ws->handleViewportAction([
			'_requestMethod' => 'POST',
			'stateToken' => $guardedVpToken,
			'action' => 'save_quick_edit',
			'payload' => ['id' => 'row_1', 'values' => ['title' => 'Tampered']],
		], false);
		expect($quickEditBlocked['ok'])->toBeFalse()
			->and($quickEditBlocked['error'])->toBe('Quick edit is not enabled');

		$fieldTamper = $ws->handleViewportAction([
			'_requestMethod' => 'POST',
			'stateToken' => $guardedVpToken,
			'action' => 'update_field',
			'payload' => ['id' => 'row_1', 'field' => 'secret', 'value' => 'pwned'],
		], false);
		expect($fieldTamper['ok'])->toBeFalse()
			->and($fieldTamper['error'])->toBe('Field is not editable')
			->and($vpSecProvider->findById('row_1')?->values['secret'])->toBe('keep');

		$rowTamper = $ws->handleViewportAction([
			'_requestMethod' => 'POST',
			'stateToken' => $guardedVpToken,
			'action' => 'row_action',
			'payload' => ['id' => 'row_1', 'rowAction' => 'update_field', 'field' => 'secret', 'value' => 'pwned'],
		], false);
		expect($rowTamper['ok'])->toBeFalse()
			->and($rowTamper['error'])->toBe('Field is not editable')
			->and($vpSecProvider->findById('row_1')?->values['secret'])->toBe('keep');

		$bulkTamper = $ws->handleViewportAction([
			'_requestMethod' => 'POST',
			'stateToken' => $guardedVpToken,
			'action' => 'bulk_action',
			'payload' => ['bulkAction' => 'update_field', 'ids' => ['row_1'], 'fields' => ['field' => 'secret', 'value' => 'pwned']],
		], false);
		expect($bulkTamper['ok'])->toBeFalse()
			->and($bulkTamper['error'])->toBe('Field is not editable')
			->and($vpSecProvider->findById('row_1')?->values['secret'])->toBe('keep');

		$pageRelAdapter = $ws->relations()->get('page');
		expect($pageRelAdapter->hydrate(['1'], ['valueField' => 'name']))->toBe([])
			->and($pageRelAdapter->hydrate(['1'], ['valueField' => 'path']))->toBe([])
			->and($pageRelAdapter->hydrate(['/'], ['valueField' => 'id']))->toBe([])
			->and($pageRelAdapter->hydrate(['/'], ['valueField' => 'path']))->toHaveCount(1);

		$disallowedExport = $ws->handleViewportAction([
			'_requestMethod' => 'POST',
			'stateToken' => $guardedVpToken,
			'action' => 'export',
			'payload' => ['format' => 'json'],
		], false);
		expect($disallowedExport['viewport']['download'] ?? null)->toBeNull();

		$allowedExport = $ws->handleViewportAction([
			'_requestMethod' => 'POST',
			'stateToken' => $guardedVpToken,
			'action' => 'export',
			'payload' => ['format' => 'csv'],
		], false);
		expect($allowedExport['viewport']['download'] ?? null)->toBeArray()
			->and($allowedExport['viewport']['download']['filename'] ?? '')->toContain('.csv');

		// Verify MiniBlockRegistry::discoverFromDirectory blocks symlinked blueprint files and symlinked directories
		$tmpRoot = sys_get_temp_dir() . '/rw_mb_sec_' . bin2hex(random_bytes(4));
		$validMbDir = $tmpRoot . '/tiptap';
		$outsideFile = $tmpRoot . '/outside_evil.php';
		$symlinkDir = $tmpRoot . '/tiptap_symlink';
		@mkdir($validMbDir, 0777, true);
		try {
			file_put_contents($validMbDir . '/safe_card.php', "<?php return ['label' => 'Safe Card', 'fields' => ['headline' => ['type' => 'text']]];");
			file_put_contents($outsideFile, "<?php return ['label' => 'Evil Symlink Block', 'fields' => ['pwn' => ['type' => 'text']]];");
			@symlink($outsideFile, $validMbDir . '/evil_block.php');
			@symlink($validMbDir, $symlinkDir);

			$discovered = \Totoglu\React\Tiptap\MiniBlockRegistry::discoverFromDirectory($validMbDir);
			expect($discovered)->toHaveKey('safe_card')
				->and($discovered)->not->toHaveKey('evil_block')
				->and(\Totoglu\React\Tiptap\MiniBlockRegistry::discoverFromDirectory($symlinkDir))->toBe([]);
		} finally {
			@unlink($validMbDir . '/evil_block.php');
			@unlink($validMbDir . '/safe_card.php');
			@unlink($outsideFile);
			@unlink($symlinkDir);
			@rmdir($validMbDir);
			@rmdir($tmpRoot);
		}

		// Verify relation and icon normalizers reject oversized payloads, malformed JSON, and excessive item counts
		wire('modules')->get('InputfieldReactM2M');
		wire('modules')->get('InputfieldReactM2A');
		expect(InputfieldReactM2O::normalizeValue(str_repeat('a', 5000)))->toBe('')
			->and(InputfieldReactM2M::normalizeValue('[malformed_json'))->toBe([])
			->and(InputfieldReactM2M::normalizeValue(str_repeat('1,', 300_000)))->toBe([])
			->and(count(InputfieldReactM2M::normalizeValue(range(1, 2500))))->toBe(2000)
			->and(InputfieldReactM2A::normalizeMorphList('[malformed_json'))->toBe([])
			->and(InputfieldReactM2A::normalizeMorphList(str_repeat('page:1,', 100_000)))->toBe([])
			->and(count(InputfieldReactM2A::normalizeMorphList(array_map(static fn(int $i): string => "page:{$i}", range(1, 2500)))))->toBe(2000)
			->and(\Totoglu\React\Icon\IconManager::normalizeValue('{"heart')['name'])->toBe('');

		// Verify Role, Permission, and Language adapters reject non-numeric names when valueField=id
		expect($roleAdapter->hydrate(['superuser'], ['valueField' => 'id']))->toBe([])
			->and($permAdapter->hydrate(['page-edit'], ['valueField' => 'id']))->toBe([])
			->and($langAdapter->hydrate(['default'], ['valueField' => 'id']))->toBe([]);

		// Verify MediaGateway::validateSafeSvgFile blocks control-char entity javascript:, xml-stylesheet XSLT, <link>, and SMIL <set attributeName="onload">
		$svgReflector = new \ReflectionMethod(\Totoglu\React\Media\MediaGateway::class, 'validateSafeSvgFile');
		$svgGateway = $ws->media();
		$svgTmpDir = sys_get_temp_dir() . '/rw_svg_sec_' . bin2hex(random_bytes(4));
		@mkdir($svgTmpDir, 0777, true);
		try {
			$svgPayloads = [
				'tab_js.svg' => '<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#x09;script:alert(1)"><rect width="10" height="10"/></a></svg>',
				'xslt.svg' => '<?xml-stylesheet type="text/xsl" href="https://evil.example.com/xss.xsl"?><svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
				'smil_onload.svg' => '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="onload" to="alert(1)"/></svg>',
				'link_css.svg' => '<svg xmlns="http://www.w3.org/2000/svg"><link rel="stylesheet" href="https://evil.example.com/x.css"/></svg>',
			];
			foreach ($svgPayloads as $svgName => $svgXml) {
				$svgFile = $svgTmpDir . '/' . $svgName;
				file_put_contents($svgFile, $svgXml);
				expect($svgReflector->invoke($svgGateway, $svgFile, $svgName))->not->toBeNull();
				@unlink($svgFile);
			}
			$cleanSvgFile = $svgTmpDir . '/clean.svg';
			file_put_contents($cleanSvgFile, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>');
			expect($svgReflector->invoke($svgGateway, $cleanSvgFile, 'clean.svg'))->toBeNull();
			@unlink($cleanSvgFile);
		} finally {
			@rmdir($svgTmpDir);
		}

		// Verify TiptapContentPolicy::sanitizeHtml enforces MAX_HTML_BYTES ceiling
		expect(\Totoglu\React\Tiptap\TiptapContentPolicy::sanitizeHtml(
			'<p>' . str_repeat('x', \Totoglu\React\Tiptap\TiptapContentPolicy::MAX_HTML_BYTES + 32) . '</p>',
		))->toBe('');

		// Verify RelationResourceRegistry::hydrateMorphTokens rejects cross-mode IDs and InputfieldReactM2A::normalizeMorphList resolves plural aliases
		if ($superRole && (int) $superRole->id > 0) {
			$mixedMorph = $ws->relations()->hydrateMorphTokens(
				['role:superuser', 'role:' . (int) $superRole->id],
				['role'],
				['valueField' => 'name'],
			);
			expect($mixedMorph)->toHaveCount(1)
				->and($mixedMorph[0]->value)->toBe('superuser');
		}
		expect(InputfieldReactM2A::normalizeMorphList(['pages:1', 'templates:home'], ['pages', 'templates']))
			->toBe(['page:1', 'template:home'])
			->and(InputfieldReactM2A::normalizeMorphList(['page:1'], ['pages']))
			->toBe(['page:1']);
	} finally {
		if ($prevUser instanceof User && $prevUser->id > 0) {
			wire('users')->setCurrentUser($prevUser);
		}
	}
});

test('PagesDataProvider and MarkupReactViewport block selector directive injection and prevent non-superuser restricted total count leaks', function (): void {
	$pw = wire();
	$modules = $pw->modules;
	$fields = $pw->fields;
	$fieldgroups = $pw->fieldgroups;
	$templates = $pw->templates;
	$pages = $pw->pages;
	$users = $pw->users;
	/** @var React $workspace */
	$workspace = wire('react');

	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$tagFieldName = 'rw_sec_tag_' . $suffix;
	$openTplName = 'rw_open_tpl_' . $suffix;
	$lockedTplName = 'rw_locked_tpl_' . $suffix;
	$editorUserName = 'rw_sec_editor_' . $suffix;
	$editorRoleName = 'rw_sec_role_' . $suffix;

	$tagField = null;
	$openFg = null;
	$lockedFg = null;
	$openTpl = null;
	$lockedTpl = null;
	$editorUser = null;
	$editorRole = null;
	$createdPages = [];
	$prevUser = $users->getCurrentUser();

	try {
		$tagField = new Field();
		$tagField->type = $modules->get('FieldtypeText');
		$tagField->name = $tagFieldName;
		$tagField->label = 'Security Tag';
		$fields->save($tagField);

		$openFg = new Fieldgroup();
		$openFg->name = $openTplName;
		$openFg->add($fields->get('title'));
		$openFg->add($tagField);
		$fieldgroups->save($openFg);

		$openTpl = new Template();
		$openTpl->name = $openTplName;
		$openTpl->fieldgroup = $openFg;
		$templates->save($openTpl);

		$lockedFg = new Fieldgroup();
		$lockedFg->name = $lockedTplName;
		$lockedFg->add($fields->get('title'));
		$lockedFg->add($tagField);
		$fieldgroups->save($lockedFg);

		$lockedTpl = new Template();
		$lockedTpl->name = $lockedTplName;
		$lockedTpl->fieldgroup = $lockedFg;
		$lockedTpl->useRoles = 1;
		$lockedTpl->setRoles([]);
		$templates->save($lockedTpl);

		$editorRole = $pw->roles->add($editorRoleName);
		$pageEditPerm = $pw->permissions->get('page-edit');
		if ($pageEditPerm && $pageEditPerm->id) {
			$editorRole->addPermission($pageEditPerm);
		}
		$pw->roles->save($editorRole);

		$openTpl->useRoles = 1;
		$guestRole = $pw->roles->get('guest');
		$openRoles = [$editorRole];
		if ($guestRole && $guestRole->id) {
			$openRoles[] = $guestRole;
		}
		$openTpl->setRoles($openRoles, 'view');
		$openTpl->setRoles([$editorRole], 'edit');
		$templates->save($openTpl);

		$editorUser = $users->add($editorUserName);
		$editorUser->addRole('guest');
		$editorUser->addRole($editorRole);
		$users->save($editorUser);

		// Create 2 restricted pages BEFORE 2 open pages so chunking/pagination ordering is non-trivial
		foreach ([$lockedTpl, $lockedTpl, $openTpl, $openTpl] as $idx => $pTpl) {
			$p = new Page();
			$p->template = $pTpl;
			$p->parent = $pages->get(1);
			$p->name = "sec-item-{$idx}-{$suffix}";
			$p->title = "Sec Item {$idx}";
			$p->set($tagFieldName, $idx < 3 ? 'alpha' : 'beta');
			$pages->save($p);
			$createdPages[] = $p;
		}

		$providerId = 'pages:template=' . $openTplName . '|' . $lockedTplName;
		$providerOptions = [
			'columns' => ['title' => 'Title', $tagFieldName => 'Tag', 'status' => 'Status'],
			'sortableColumns' => ['title', 'id'],
			'filterableFields' => [
				$tagFieldName => [
					'label' => 'Security Tag',
					'type' => 'select',
					'options' => ['alpha' => 'Alpha', 'beta' => 'Beta'],
				],
			],
		];

		$provider = new PagesDataProvider('template=' . $openTplName . '|' . $lockedTplName, $providerOptions);
		wire($provider);
		$workspace->providers()->register($providerId, $provider);

		// Switch to non-superuser lacking access to $lockedTpl
		$users->setCurrentUser($editorUser);

		// 1. Direct buildSelectorString() strips reserved directives and system fields while keeping allowlisted fields
		$builtSelector = $provider->buildSelectorString([
			'fieldFilters' => [
				'check_access' => '0',
				'include' => 'all',
				'limit' => '0',
				'start' => '0',
				'template' => $lockedTplName,
				'email' => 'admin@example.com',
				'pass' => 'secret',
				$tagFieldName => 'alpha',
			],
		]);
		expect($builtSelector)->toContain($tagFieldName . '=alpha')
			->and($builtSelector)->not->toContain('check_access=0')
			->and($builtSelector)->not->toContain('include=all')
			->and($builtSelector)->not->toContain('limit=0')
			->and($builtSelector)->not->toContain('email=')
			->and($builtSelector)->not->toContain('pass=');

		// 2. Non-superuser query returns ONLY viewable/editable pages and never leaks restricted total count
		$unfilteredRes = $provider->query(['limit' => 1, 'pageNum' => 1, 'sortBy' => 'id']);
		expect($unfilteredRes->total)->toBe(2)
			->and($unfilteredRes->items)->toHaveCount(1)
			->and($unfilteredRes->items[0]->title)->toBe('Sec Item 2');

		// 3. MarkupReactViewport ignores client-injected filterValues & action=filter keys, counts only accessible pages,
		//    allows declared filters, and preserves server-signed view presets
		$vp = $workspace->configureTable($provider, [
			'filters' => [
				$tagFieldName => [
					'label' => 'Tag',
					'type' => 'select',
					'options' => ['alpha' => 'Alpha', 'beta' => 'Beta'],
				],
			],
			'views' => [
				'alpha_preset' => [
					'label' => 'Alpha Only',
					'fieldFilters' => [$tagFieldName => 'alpha'],
				],
			],
		]);
		$stateToken = (string) ($vp->toInertiaProp()['stateToken'] ?? '');

		$injectedStateRes = $workspace->handleViewportAction([
			'stateToken' => $stateToken,
			'action' => 'fetch',
			'state' => [
				'filterValues' => [
					'check_access' => '0',
					'include' => 'all',
					'limit' => '0',
					'template' => $lockedTplName,
					'email' => 'x@y.z',
					$tagFieldName => 'alpha',
				],
			],
		]);
		expect($injectedStateRes['ok'])->toBeTrue()
			->and($injectedStateRes['viewport']['total'])->toBe(1)
			->and($injectedStateRes['viewport']['records'][0]['title'])->toBe('Sec Item 2')
			->and($injectedStateRes['viewport']['filterValues'])->toBe([$tagFieldName => 'alpha']);

		$injectedFilterRes = $workspace->handleViewportAction([
			'stateToken' => $stateToken,
			'action' => 'filter',
			'payload' => [
				'filters' => [
					'include' => 'all',
					'check_access' => '0',
					$tagFieldName => 'beta',
				],
			],
		]);
		expect($injectedFilterRes['ok'])->toBeTrue()
			->and($injectedFilterRes['viewport']['total'])->toBe(1)
			->and($injectedFilterRes['viewport']['records'][0]['title'])->toBe('Sec Item 3')
			->and($injectedFilterRes['viewport']['filterValues'])->toBe([$tagFieldName => 'beta']);

		$csrf = $pw->session->CSRF;
		$signedViewRes = $workspace->handleViewportAction([
			'stateToken' => $stateToken,
			'action' => 'select_view',
			'payload' => ['view' => 'alpha_preset'],
			'_requestMethod' => 'POST',
			(string) $csrf->getTokenName() => (string) $csrf->getTokenValue(),
		], true);
		expect($signedViewRes['ok'])->toBeTrue()
			->and($signedViewRes['viewport']['total'])->toBe(1)
			->and($signedViewRes['viewport']['records'][0]['title'])->toBe('Sec Item 2');
	} finally {
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
		foreach (array_reverse($createdPages) as $p) {
			if ($p->id > 0) {
				try {
					$pages->delete($p, true);
				} catch (\Throwable) {
				}
			}
		}
		$classesDir = rtrim((string) wire('config')->paths->classes, '/') . '/';
		foreach ([$openTpl, $lockedTpl] as $t) {
			if ($t instanceof Template && $t->id > 0) {
				$pascal = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', (string) $t->name)));
				try {
					$templates->delete($t);
				} catch (\Throwable) {
				}
				$classFile = $classesDir . $pascal . 'Page.php';
				if (is_file($classFile)) {
					unlink($classFile);
				}
			}
		}
		foreach ([$openFg, $lockedFg] as $g) {
			if ($g instanceof Fieldgroup && $g->id > 0) {
				try {
					$fieldgroups->delete($g);
				} catch (\Throwable) {
				}
			}
		}
		if ($tagField instanceof Field && $tagField->id > 0) {
			try {
				$fields->delete($tagField);
			} catch (\Throwable) {
			}
		}
		if ($editorUser instanceof User && $editorUser->id > 0) {
			try {
				$users->delete($editorUser, true);
			} catch (\Throwable) {
			}
		}
		if ($editorRole instanceof Role && $editorRole->id > 0) {
			try {
				$pw->roles->delete($editorRole);
			} catch (\Throwable) {
			}
		}
	}
});

test('MediaGateway::executeTransform masks raw exceptions when debug=false and UrlSanitizer rejects empty hosts when allowBareRelative=false', function (): void {
	expect(UrlSanitizer::sanitizeHref('https://:80/', false))->toBe('')
		->and(UrlSanitizer::sanitizeHref('https://', false))->toBe('')
		->and(UrlSanitizer::sanitizeHref('http://:8080/path', false))->toBe('')
		->and(UrlSanitizer::sanitizeHref('https://example.com:8080/ok', false))->toBe('https://example.com:8080/ok');

	$pw = wire();
	$modules = $pw->modules;
	$fields = $pw->fields;
	$fieldgroups = $pw->fieldgroups;
	$templates = $pw->templates;
	$pages = $pw->pages;
	/** @var React $workspace */
	$workspace = wire('react');

	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$imgFieldName = 'rw_mg_mask_img_' . $suffix;
	$tplName = 'rw_mg_mask_tpl_' . $suffix;
	$imgField = null;
	$fg = null;
	$tpl = null;
	$hostPage = null;
	$tmpDir = sys_get_temp_dir() . '/rw_mg_mask_' . $suffix;
	mkdir($tmpDir, 0777, true);
	$prevDebug = (bool) $pw->config->debug;

	try {
		$imgField = new Field();
		$imgField->type = $modules->get('FieldtypeImage');
		$imgField->name = $imgFieldName;
		$imgField->label = 'Media Image';
		$imgField->set('extensions', 'png');
		$fields->save($imgField);

		$fg = new Fieldgroup();
		$fg->name = $tplName;
		$fg->add($fields->get('title'));
		$fg->add($imgField);
		$fieldgroups->save($fg);

		$tpl = new Template();
		$tpl->name = $tplName;
		$tpl->fieldgroup = $fg;
		$templates->save($tpl);

		$hostPage = new Page();
		$hostPage->template = $tpl;
		$hostPage->parent = $pages->get(1);
		$hostPage->name = 'mg-mask-host-' . $suffix;
		$hostPage->title = 'Media Mask Host';
		$pages->save($hostPage);

		$pngPath = $tmpDir . '/sample.png';
		$gd = imagecreatetruecolor(32, 24);
		$fill = imagecolorallocate($gd, 80, 120, 200);
		imagefilledrectangle($gd, 0, 0, 32, 24, $fill);
		imagepng($gd, $pngPath);

		$hostPage->of(false);
		$hostPage->getUnformatted($imgFieldName)->add($pngPath);
		$hostPage->save($imgFieldName);
		$savedImg = $hostPage->getUnformatted($imgFieldName)->first();
		expect($savedImg)->not->toBeNull();
		// Overwrite persisted disk image with unrecognized binary bytes so ImageSizer throws a WireException during rotate
		file_put_contents((string) $savedImg->filename(), 'corrupt-binary-data');

		$token = $workspace->media()->sign([
			'kind' => 'page',
			'isImage' => true,
			'pageId' => (int) $hostPage->id,
			'rootPageId' => (int) $hostPage->id,
			'fieldName' => $imgFieldName,
			'extensions' => ['png'],
		], (int) $pw->user->id);

		$csrf = $pw->session->CSRF;
		$payload = [
			'action' => 'transform',
			'mediaToken' => $token,
			'operation' => 'rotate',
			'degrees' => 90,
			'targetName' => 'sample.png',
			'_requestMethod' => 'POST',
			(string) $csrf->getTokenName() => (string) $csrf->getTokenValue(),
		];

		$pw->config->debug = false;
		$maskedRes = $workspace->handleMediaAction($payload, true);
		expect($maskedRes['ok'])->toBeFalse()
			->and($maskedRes['status'])->toBe(500)
			->and($maskedRes['error'])->toBe('Image transformation failed.')
			->and((string) $maskedRes['error'])->not->toContain('not a recognized image');

		$pw->config->debug = true;
		$debugRes = $workspace->handleMediaAction($payload, true);
		expect($debugRes['ok'])->toBeFalse()
			->and($debugRes['status'])->toBe(500)
			->and((string) $debugRes['error'])->toContain('not a recognized image');
	} finally {
		$pw->config->debug = $prevDebug;
		if ($hostPage instanceof Page && $hostPage->id > 0) {
			try {
				$pages->delete($hostPage, true);
			} catch (\Throwable) {
			}
		}
		$classesDir = rtrim((string) wire('config')->paths->classes, '/') . '/';
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
		if ($fg instanceof Fieldgroup && $fg->id > 0) {
			try {
				$fieldgroups->delete($fg);
			} catch (\Throwable) {
			}
		}
		if ($imgField instanceof Field && $imgField->id > 0) {
			try {
				$fields->delete($imgField);
			} catch (\Throwable) {
			}
		}
		if (is_dir($tmpDir)) {
			foreach (glob($tmpDir . '/*') ?: [] as $f) {
				if (is_file($f)) {
					unlink($f);
				}
			}
			rmdir($tmpDir);
		}
	}
});

test('PagesDataProvider enforces field-level useRoles view RBAC and handles statusFilter published without leaking drafts', function (): void {
	$pw = wire();
	$modules = $pw->modules;
	$fields = $pw->fields;
	$fieldgroups = $pw->fieldgroups;
	$templates = $pw->templates;
	$pages = $pw->pages;
	$users = $pw->users;
	$roles = $pw->roles;

	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$publicFieldName = 'rw_rbac_pub_' . $suffix;
	$secretFieldName = 'rw_rbac_sec_' . $suffix;
	$iconFieldName = 'rw_rbac_ico_' . $suffix;
	$thumbFieldName = 'rw_rbac_img_' . $suffix;
	$tplName = 'rw_rbac_tpl_' . $suffix;
	$roleName = 'rw_rbac_role_' . $suffix;
	$userName = 'rw_rbac_user_' . $suffix;
	$tmpDir = sys_get_temp_dir() . '/rw_pdp_rbac_' . $suffix;
	if (!is_dir($tmpDir)) {
		mkdir($tmpDir, 0775, true);
	}

	$publicField = null;
	$secretField = null;
	$iconField = null;
	$thumbField = null;
	$fg = null;
	$tpl = null;
	$editorRole = null;
	$editorUser = null;
	$createdPages = [];
	$prevUser = $users->getCurrentUser();
	$superId = (int) ($pw->config->superUserPageID ?: 41);
	$superUser = $users->get($superId);

	try {
		$editorRole = $roles->add($roleName);
		$pageEditPerm = $pw->permissions->get('page-edit');
		if ($pageEditPerm && $pageEditPerm->id) {
			$editorRole->addPermission($pageEditPerm);
		}
		$roles->save($editorRole);

		$guestRole = $roles->get('guest');
		$publicField = new Field();
		$publicField->type = $modules->get('FieldtypeText');
		$publicField->name = $publicFieldName;
		$publicField->label = 'Public Summary';
		$fields->save($publicField);

		$secretField = new Field();
		$secretField->type = $modules->get('FieldtypeText');
		$secretField->name = $secretFieldName;
		$secretField->label = 'Confidential Salary';
		$secretField->useRoles = 1;
		$secretField->viewRoles = [$superId];
		$secretField->editRoles = [$superId];
		$fields->save($secretField);

		$iconField = new Field();
		$iconField->type = $modules->get('FieldtypeText');
		$iconField->name = $iconFieldName;
		$iconField->label = 'Restricted Icon';
		$iconField->useRoles = 1;
		$iconField->viewRoles = [$superId];
		$iconField->editRoles = [$superId];
		$fields->save($iconField);

		$thumbField = new Field();
		$thumbField->type = $modules->get('FieldtypeImage');
		$thumbField->name = $thumbFieldName;
		$thumbField->label = 'Restricted Photo';
		$thumbField->maxFiles = 1;
		$thumbField->useRoles = 1;
		$thumbField->viewRoles = [$superId];
		$thumbField->editRoles = [$superId];
		$fields->save($thumbField);

		$fg = new Fieldgroup();
		$fg->name = $tplName;
		$fg->add($fields->get('title'));
		$fg->add($publicField);
		$fg->add($secretField);
		$fg->add($iconField);
		$fg->add($thumbField);
		$fieldgroups->save($fg);

		$tpl = new Template();
		$tpl->name = $tplName;
		$tpl->fieldgroup = $fg;
		$tpl->useRoles = 1;
		$viewRoles = [$editorRole];
		if ($guestRole && $guestRole->id) {
			$viewRoles[] = $guestRole;
		}
		$tpl->setRoles($viewRoles, 'view');
		$tpl->setRoles([$editorRole], 'edit');
		$templates->save($tpl);

		$editorUser = $users->add($userName);
		$editorUser->addRole('guest');
		$editorUser->addRole($editorRole);
		$users->save($editorUser);

		$pngPath = $tmpDir . '/secret.png';
		$gd = imagecreatetruecolor(16, 16);
		$fill = imagecolorallocate($gd, 40, 140, 200);
		imagefilledrectangle($gd, 0, 0, 16, 16, $fill);
		imagepng($gd, $pngPath);

		$makePage = static function (string $name, string $title, int $status) use (
			$pages,
			$tpl,
			$publicFieldName,
			$secretFieldName,
			$iconFieldName,
			$thumbFieldName,
			$pngPath
		): Page {
			$p = new Page();
			$p->template = $tpl;
			$p->parent = $pages->get(1);
			$p->name = $name;
			$p->title = $title;
			$p->status = $status;
			$p->set($publicFieldName, 'Public Note');
			$p->set($secretFieldName, 'TOP-SECRET-VALUE');
			$p->set($iconFieldName, 'shield-lock');
			$pages->save($p);
			$p->of(false);
			$p->getUnformatted($thumbFieldName)->add($pngPath);
			$p->save($thumbFieldName);
			return $p;
		};

		$publishedPage = $makePage("rbac-pub-{$suffix}", 'Published Item', Page::statusOn);
		$draftPage = $makePage("rbac-draft-{$suffix}", 'Draft Item', Page::statusUnpublished);
		$hiddenPage = $makePage("rbac-hidden-{$suffix}", 'Hidden Item', Page::statusHidden);
		$trashedPage = $makePage("rbac-trash-{$suffix}", 'Trashed Item', Page::statusOn);
		$pages->trash($trashedPage);
		$createdPages = [$publishedPage, $draftPage, $hiddenPage, $trashedPage];

		$providerOptions = [
			'columns' => [
				'title' => ['label' => 'Title'],
				$publicFieldName => ['label' => 'Public'],
				$secretFieldName => ['label' => 'Secret'],
			],
			'subtitleField' => $secretFieldName,
			'iconField' => $iconFieldName,
			'thumbField' => $thumbFieldName,
		];
		$provider = new PagesDataProvider("template={$tplName}", $providerOptions);
		wire($provider);

		// 1. Non-superuser editor cannot read restricted field columns/meta or use restricted field as filter oracle
		$users->setCurrentUser($editorUser);
		$editorPublishedRes = $provider->query([
			'statusFilter' => 'published',
			'limit' => 20,
		]);
		expect($editorPublishedRes->total)->toBe(1)
			->and($editorPublishedRes->items)->toHaveCount(1);
		$editorRow = $editorPublishedRes->items[0];
		expect((int) $editorRow->id)->toBe((int) $publishedPage->id)
			->and($editorRow->title)->toBe('Published Item')
			->and($editorRow->values[$publicFieldName])->toBe('Public Note')
			->and($editorRow->values[$secretFieldName])->toBe('')
			->and($editorRow->formatted)->not->toHaveKey($secretFieldName)
			->and($editorRow->subtitle)->toBe('')
			->and($editorRow->icon)->toBe('')
			->and($editorRow->thumb)->toBeNull()
			->and($editorRow->thumbHtml)->toBe('');

		// Filtering by restricted field fails closed (oracle blocked)
		$oracleSelector = $provider->buildSelectorString([
			'fieldFilters' => [$secretFieldName => 'NON-EXISTENT-VALUE'],
		]);
		expect($oracleSelector)->not->toContain($secretFieldName . '=');
		$oracleProbe = $provider->query([
			'fieldFilters' => [$secretFieldName => 'NON-EXISTENT-VALUE'],
			'limit' => 20,
		]);
		$noFilterBaseline = $provider->query(['limit' => 20]);
		expect($oracleProbe->total)->toBe($noFilterBaseline->total)
			->and($oracleProbe->total)->toBeGreaterThan(0);

		// 2. Superuser can filter statusFilter='published' cleanly (no drafts/hidden/trash leaked) and sees restricted fields
		if ($superUser instanceof User && $superUser->id > 0) {
			$users->setCurrentUser($superUser);
		}
		$superPublishedRes = $provider->query([
			'statusFilter' => 'published',
			'limit' => 20,
		]);
		expect($superPublishedRes->total)->toBe(1)
			->and($superPublishedRes->items)->toHaveCount(1);
		$superRow = $superPublishedRes->items[0];
		expect((int) $superRow->id)->toBe((int) $publishedPage->id)
			->and($superRow->values[$secretFieldName])->toBe('TOP-SECRET-VALUE')
			->and($superRow->subtitle)->toBe('TOP-SECRET-VALUE')
			->and($superRow->icon['name'] ?? null)->toBe('shield-lock')
			->and((string) ($superRow->thumb['src'] ?? ''))->toContain('secret.');
	} finally {
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
		foreach ($createdPages as $cp) {
			if ($cp instanceof Page && $cp->id > 0) {
				try {
					$pages->delete($cp, true);
				} catch (\Throwable) {
				}
			}
		}
		$classesDir = rtrim((string) wire('config')->paths->classes, '/') . '/';
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
		if ($fg instanceof Fieldgroup && $fg->id > 0) {
			try {
				$fieldgroups->delete($fg);
			} catch (\Throwable) {
			}
		}
		foreach ([$thumbField, $iconField, $secretField, $publicField] as $f) {
			if ($f instanceof Field && $f->id > 0) {
				try {
					$fields->delete($f);
				} catch (\Throwable) {
				}
			}
		}
		if ($editorUser instanceof User && $editorUser->id > 0) {
			try {
				$users->delete($editorUser);
			} catch (\Throwable) {
			}
		}
		if ($editorRole instanceof Role && $editorRole->id > 0) {
			try {
				$roles->delete($editorRole);
			} catch (\Throwable) {
			}
		}
		if (is_dir($tmpDir)) {
			foreach (glob($tmpDir . '/*') ?: [] as $f) {
				if (is_file($f)) {
					unlink($f);
				}
			}
			rmdir($tmpDir);
		}
	}
});
