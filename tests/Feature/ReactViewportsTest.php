<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\Language;
use ProcessWire\Languages;
use ProcessWire\MarkupReactCards;
use ProcessWire\MarkupReactTable;
use ProcessWire\Page;
use ProcessWire\React;
use ProcessWire\Template;
use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Data\ReactPageResult;
use Totoglu\React\Data\ReactRecord;
use Totoglu\React\Provider\ArrayDataProvider;
use Totoglu\React\Provider\PagesDataProvider;
use Totoglu\React\Viewport\MarkupReactViewport;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
	$users = wire()->users;
	$this->previousUser = wire()->user;
	$superuser = $users->get('id=41');
	if ($superuser && $superuser->id) {
		$users->setCurrentUser($superuser);
	}
});

afterEach(function (): void {
	if (isset($this->previousUser) && $this->previousUser) {
		wire()->users->setCurrentUser($this->previousUser);
	}
});

test('MarkupReactTable and MarkupReactCards extend MarkupInertia and support both Inertia prop serialization and classic island rendering', function (): void {
	$workspace = React::instance();

	$provider = new ArrayDataProvider(
		id: 'array:charters',
		items: [
			[
				'id' => 'c_1',
				'title' => 'Aegean Odyssey',
				'name' => 'aegean-odyssey',
				'status' => 1,
				'stage' => 'todo',
				'price' => '€14,000',
				'start_date' => '2026-11-10',
				'end_date' => '2026-11-17',
				'editUrl' => '/admin/charters/edit/c_1',
			],
			[
				'id' => 'c_2',
				'title' => 'Lycian Coast Expedition',
				'name' => 'lycian-coast',
				'status' => 2,
				'stage' => 'in_progress',
				'price' => '€21,500',
				'start_date' => '2026-11-18',
				'end_date' => '2026-11-25',
				'editUrl' => '/admin/charters/edit/c_2',
			],
		],
		options: [
			'title' => 'Charter Fleet',
			'columns' => ['title' => 'Vessel', 'price' => 'Rate', 'status' => 'Status'],
		],
	);
	wire($provider);
	$workspace->providers()->register('array:charters', $provider);

	expect($workspace->viewport('table'))->toBeInstanceOf(MarkupReactTable::class)
		->and($workspace->viewport('cards'))->toBeInstanceOf(MarkupReactCards::class)
		->and($workspace->viewport('table'))->toBeInstanceOf(MarkupReactViewport::class)
		->and($workspace->viewport('table'))->toBeInstanceOf(\Totoglu\Inertia\MarkupInertia::class);

	// 1. Direct Inertia Prop Mode
	$configuredTable = $workspace->configureTable('array:charters');
	$tableProp = $configuredTable->toInertiaProp();

	expect($tableProp['component'])->toBe('ReactWorkspace/Table')
		->and($tableProp['viewMode'])->toBe('table')
		->and($tableProp['total'])->toBe(2)
		->and($tableProp['records'][0]['title'])->toBe('Aegean Odyssey')
		->and($tableProp['records'][1]['title'])->toBe('Lycian Coast Expedition')
		->and($tableProp['stateToken'])->not->toBeEmpty();

	// 2. Classic Island HTML Mode
	$tableHtml = $workspace->renderTable('array:charters');
	expect($tableHtml)
		->toContain('data-inertia-island="ReactWorkspace/Table"')
		->toContain('data-react-island="ReactWorkspace/Table"')
		->toContain('Aegean Odyssey')
		->toContain('Lycian Coast Expedition');

	$cardsHtml = $workspace->renderCards('array:charters');
	expect($cardsHtml)
		->toContain('data-inertia-island="ReactWorkspace/Cards"')
		->toContain('data-react-island="ReactWorkspace/Cards"')
		->toContain('Aegean Odyssey');
});

test('MarkupReactViewport and React::handleViewportAction execute search, filter, sort, saved views, column toggles, field updates, bulk actions, and exports with HMAC state verification', function (): void {
	$workspace = React::instance();

	$provider = new ArrayDataProvider(
		id: 'array:tasks',
		items: [
			[
				'id' => 't_1',
				'title' => 'Alpha Inspection',
				'status' => 1,
				'stage' => 'todo',
				'priority' => 10,
				'region' => 'aegean',
				'start_date' => '2026-11-05',
			],
			[
				'id' => 't_2',
				'title' => 'Beta Provisioning',
				'status' => 1,
				'stage' => 'todo',
				'priority' => 30,
				'region' => 'marmaris',
				'start_date' => '2026-11-06',
			],
		],
		options: [
			'title' => 'Operations',
			'columns' => ['title' => 'Task', 'priority' => 'Priority', 'status' => 'Status'],
			'availableColumns' => ['title' => 'Task', 'priority' => 'Priority', 'region' => 'Region', 'status' => 'Status'],
			'filterableFields' => [
				'region' => ['label' => 'Region', 'type' => 'select', 'options' => ['aegean' => 'Aegean', 'marmaris' => 'Marmaris']],
			],
			'inlineEditableFields' => [
				'title' => ['type' => 'text', 'label' => 'Task'],
				'featured' => ['type' => 'toggle', 'label' => 'Featured'],
			],
			'exportFormats' => ['csv', 'json'],
		],
	);
	wire($provider);
	$workspace->providers()->register('array:tasks', $provider);

	$table = $workspace->configureTable('array:tasks');
	$initialProp = $table->toInertiaProp();
	$stateToken = (string) $initialProp['stateToken'];

	// Rejects missing or tampered stateToken
	$badRes = $workspace->handleViewportAction(['stateToken' => $stateToken . 'tampered', 'action' => 'fetch']);
	expect($badRes['ok'])->toBeFalse()
		->and($badRes['status'])->toBe(403);

	// 1. Search via handleViewportAction
	$searchRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'search',
		'payload' => ['query' => 'Beta'],
	]);
	expect($searchRes['ok'])->toBeTrue()
		->and($searchRes['viewport']['total'])->toBe(1)
		->and($searchRes['viewport']['records'][0]['id'])->toBe('t_2');

	// 2. Sort descending by priority
	$sortRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'sort',
		'payload' => ['field' => 'priority', 'direction' => 'desc'],
	]);
	expect($sortRes['ok'])->toBeTrue()
		->and($sortRes['viewport']['records'][0]['id'])->toBe('t_2')
		->and($sortRes['viewport']['records'][1]['id'])->toBe('t_1');

	// 3. Filter by region
	$filterRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'filter',
		'payload' => ['key' => 'region', 'value' => 'aegean'],
	]);
	expect($filterRes['ok'])->toBeTrue()
		->and($filterRes['viewport']['total'])->toBe(1)
		->and($filterRes['viewport']['records'][0]['id'])->toBe('t_1');

	// 4. Save custom view preset and delete it
	$saveViewRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'save_view',
		'state' => ['filterValues' => ['region' => 'aegean']],
		'payload' => ['label' => 'Aegean Tasks'],
	]);
	expect($saveViewRes['ok'])->toBeTrue()
		->and($saveViewRes['viewport']['savedViews'])->toHaveKey('aegean_tasks')
		->and($saveViewRes['viewport']['activeView'])->toBe('saved:aegean_tasks');

	$delViewRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'delete_view',
		'payload' => ['view' => 'saved:aegean_tasks'],
	]);
	expect($delViewRes['ok'])->toBeTrue()
		->and($delViewRes['viewport']['savedViews'])->not->toHaveKey('aegean_tasks');

	// 5. Inline field update (`update_field`)
	$updateRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'update_field',
		'payload' => ['id' => 't_1', 'field' => 'title', 'value' => 'Alpha Updated'],
	]);
	expect($updateRes['ok'])->toBeTrue()
		->and($provider->findById('t_1')?->title)->toBe('Alpha Updated');

	// 6. Editable toggle_field action and modeState/viewModeMeta envelope fields
	$toggleRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'toggle_field',
		'payload' => ['id' => 't_1', 'field' => 'featured'],
	]);
	expect($toggleRes['ok'])->toBeTrue();

	$propCheck = $toggleRes['viewport'];
	expect($propCheck)->toHaveKey('viewModeMeta')
		->and($propCheck)->toHaveKey('modeState');

	// 7. Bulk action (`draft`)
	$bulkRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'bulk_action',
		'payload' => ['bulkAction' => 'draft', 'ids' => ['t_1', 't_2']],
	]);
	expect($bulkRes['ok'])->toBeTrue()
		->and($provider->query(['statusFilter' => 'draft'])->total)->toBe(2);

	// 8. Export CSV & JSON
	$exportRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'export',
		'payload' => ['format' => 'csv'],
	]);
	expect($exportRes['ok'])->toBeTrue()
		->and($exportRes['viewport']['download']['filename'] ?? '')->toContain('.csv')
		->and($exportRes['viewport']['download']['content'] ?? '')->toContain('Alpha Updated');
});

test('Direct PageArray, Closure, and inline Array datasets render cleanly in MarkupReactTable', function (): void {
	$workspace = React::instance();

	$homePages = wire('pages')->find('id=1');
	$pageTable = $workspace->configureTable($homePages, [
		'title' => 'Root Pages',
		'columns' => ['title' => 'Title', 'name' => 'Slug'],
	]);
	$prop = $pageTable->toInertiaProp();
	expect($prop['total'])->toBe(1)
		->and($prop['records'][0]['id'])->toBe('1');

	$closureTable = $workspace->configureTable(
		fn () => [
			['id' => 'row_1', 'title' => 'Custom Row A', 'region' => 'Aegean', 'status' => 1],
			['id' => 'row_2', 'title' => 'Custom Row B', 'region' => 'Mediterranean', 'status' => 1],
		],
		[
			'title' => 'Custom Closure Table',
			'columns' => ['title' => 'Title', 'region' => 'Region', 'status' => 'Status'],
		]
	);
	$closureProp = $closureTable->toInertiaProp();
	expect($closureProp['total'])->toBe(2)
		->and($closureProp['records'][0]['title'])->toBe('Custom Row A');
});

test('verifyRequestCsrf fails closed on mutating actions when CSRF is enforced and token is missing or invalid', function (): void {
	$workspace = React::instance();

	$provider = new ArrayDataProvider(
		id: 'array:csrf_test',
		items: [
			['id' => 'r_1', 'title' => 'Protected Row', 'status' => 1],
		],
		options: [
			'columns' => ['title' => 'Title', 'status' => 'Status'],
			'inlineEditableFields' => [
				'title' => ['type' => 'text', 'label' => 'Title'],
			],
		],
	);
	wire($provider);
	$workspace->providers()->register('array:csrf_test', $provider);

	$table = $workspace->configureTable('array:csrf_test');
	$stateToken = (string) $table->toInertiaProp()['stateToken'];

	// Mutating action with enforceCsrf=true and missing/invalid CSRF must fail closed with 419
	$rejected = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'update_field',
		'csrf' => ['name' => 'TOKEN', 'value' => 'invalid_csrf_value'],
		'payload' => ['id' => 'r_1', 'field' => 'title', 'value' => 'Tampered'],
	], true);

	expect($rejected['ok'])->toBeFalse()
		->and($rejected['status'])->toBe(419)
		->and($provider->findById('r_1')?->title)->toBe('Protected Row');
});

test('MarkupReactViewport enforces editable field allowlist on update_field, toggle_field, and save_quick_edit and resolves quickEdit state for inlineEditableFields and __new__', function (): void {
	$workspace = React::instance();

	$provider = new ArrayDataProvider(
		id: 'array:allowlist_test',
		items: [
			[
				'id' => 'item_1',
				'title' => 'Allowed Title',
				'secret_role' => 'user',
				'notes' => 'Initial note',
				'status' => 1,
			],
			[
				'id' => 'item_2',
				'title' => 'Second Record',
				'secret_role' => 'editor',
				'notes' => 'Second note',
				'status' => 1,
			],
		],
		options: [
			'columns' => [
				'title' => 'Title',
				'secret_role' => 'Role',
				'status' => 'Status',
			],
			'inlineEditableFields' => [
				'title' => ['type' => 'text', 'label' => 'Title'],
				'notes' => ['type' => 'textarea', 'label' => 'Internal Notes'],
			],
			'quickEdit' => true,
			'exportFormats' => ['csv', 'json'],
		],
	);
	wire($provider);
	$workspace->providers()->register('array:allowlist_test', $provider);

	$table = $workspace->configureTable('array:allowlist_test', ['exportEnabled' => true]);
	$stateToken = (string) $table->toInertiaProp()['stateToken'];

	// 1. Disallowed field in update_field is rejected with Field is not editable
	$disallowedRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'update_field',
		'payload' => ['id' => 'item_1', 'field' => 'secret_role', 'value' => 'superuser'],
	]);
	expect($disallowedRes['ok'])->toBeFalse()
		->and($disallowedRes['error'])->toBe('Field is not editable')
		->and($provider->findById('item_1')?->getValue('secret_role'))->toBe('user');

	// 1b. Bypassing update_field/toggle_field via row_action or bulk_action is also blocked, and reorder requires reorderEnabled
	$rowBypassRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'row_action',
		'payload' => ['rowAction' => 'update_field', 'id' => 'item_1', 'field' => 'secret_role', 'value' => 'superuser'],
	]);
	expect($rowBypassRes['ok'])->toBeFalse()
		->and($rowBypassRes['error'])->toBe('Field is not editable')
		->and($provider->findById('item_1')?->getValue('secret_role'))->toBe('user');

	$bulkBypassRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'bulk_action',
		'payload' => ['bulkAction' => 'toggle_field', 'ids' => ['item_1'], 'field' => 'secret_role'],
	]);
	expect($bulkBypassRes['ok'])->toBeFalse()
		->and($bulkBypassRes['error'])->toBe('Field is not editable');

	$reorderBlockedRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'reorder',
		'payload' => ['orderedIds' => ['item_1']],
	]);
	expect($reorderBlockedRes['ok'])->toBeFalse()
		->and($reorderBlockedRes['error'])->toBe('Reordering is not enabled');

	// Verify viewport() returns distinct cloned instances rather than mutating the singular module singleton
	$vpA = $workspace->viewport('table');
	$vpB = $workspace->viewport('table');
	expect($vpA)->not->toBe($vpB);

	// 2. Allowed field in inlineEditableFields succeeds
	$allowedRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'update_field',
		'payload' => ['id' => 'item_1', 'field' => 'notes', 'value' => 'Updated note'],
	]);
	expect($allowedRes['ok'])->toBeTrue()
		->and($provider->findById('item_1')?->getValue('notes'))->toBe('Updated note');

	// 3. open_quick_edit builds SchemaForm payload from merged columns and inlineEditableFields
	$openEditRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'open_quick_edit',
		'payload' => ['id' => 'item_1'],
	]);
	$openEditFields = array_column((array) ($openEditRes['viewport']['quickEdit']['formSchema']['fields'] ?? []), null, 'name');
	expect($openEditRes['ok'])->toBeTrue()
		->and($openEditRes['viewport']['quickEdit']['recordId'])->toBe('item_1')
		->and($openEditRes['viewport']['quickEdit']['title'])->toBe('Allowed Title')
		->and($openEditFields)->toHaveKey('title')
		->and($openEditFields)->toHaveKey('notes')
		->and($openEditFields['notes']['type'] ?? null)->toBe('textarea');

	// 4. open_quick_edit with '__new__' builds a blank SchemaForm payload
	$openCreateRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'open_quick_edit',
		'payload' => ['id' => '__new__'],
	]);
	$openCreateFields = array_column((array) ($openCreateRes['viewport']['quickEdit']['formSchema']['fields'] ?? []), null, 'name');
	expect($openCreateRes['ok'])->toBeTrue()
		->and($openCreateRes['viewport']['quickEdit']['recordId'])->toBe('__new__')
		->and($openCreateRes['viewport']['quickEdit']['formSchema']['id'] ?? null)->toBe('rw_quick_edit___new__')
		->and($openCreateFields)->toHaveKey('title')
		->and($openCreateFields)->toHaveKey('notes');

	// 5. save_quick_edit accepts formData payload, surfaces validation errors cleanly, and saves valid edits
	$invalidSaveRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'save_quick_edit',
		'payload' => [
			'id' => 'item_1',
			'formData' => [
				'_rw_quick_edit_form' => '1',
				'notes' => 'Should fail without title',
			],
		],
	]);
	expect($invalidSaveRes['ok'])->toBeFalse()
		->and($invalidSaveRes['viewport']['quickEdit']['recordId'] ?? null)->toBe('item_1')
		->and($invalidSaveRes['viewport']['quickEdit']['formSchema']['errors']['title'] ?? '')->not->toBe('');

	$saveFormRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'save_quick_edit',
		'payload' => [
			'id' => 'item_1',
			'formData' => [
				'_rw_quick_edit_form' => '1',
				'title' => 'Allowed Title Updated',
				'notes' => 'FormData saved note',
			],
		],
	]);
	expect($saveFormRes['ok'])->toBeTrue()
		->and($saveFormRes['viewport']['quickEdit'] ?? null)->toBeNull()
		->and($provider->findById('item_1')?->getValue('notes'))->toBe('FormData saved note')
		->and($provider->findById('item_1')?->title)->toBe('Allowed Title Updated');

	// 6. export respects ids filtering for selection-scoped exports
	$selectedExportRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'export',
		'payload' => [
			'format' => 'json',
			'ids' => ['item_2'],
		],
	]);
	expect($selectedExportRes['ok'])->toBeTrue();
	$exportedRows = json_decode((string) ($selectedExportRes['viewport']['download']['content'] ?? '[]'), true);
	expect($exportedRows)->toBeArray()
		->and(count($exportedRows))->toBe(1)
		->and($exportedRows[0]['id'] ?? null)->toBe('item_2');
});

test('MarkupReactViewport::sanitizeCsvCell neutralizes formula injection triggers (CWE-1236)', function (): void {
	// 1. Direct formula triggers
	expect(MarkupReactViewport::sanitizeCsvCell('=SUM(1+1)'))->toBe("'=SUM(1+1)")
		->and(MarkupReactViewport::sanitizeCsvCell("=cmd|' /C calc'!A0"))->toBe("'=cmd|' /C calc'!A0")
		->and(MarkupReactViewport::sanitizeCsvCell('+12345'))->toBe("'+12345")
		->and(MarkupReactViewport::sanitizeCsvCell('@evil'))->toBe("'@evil")
		->and(MarkupReactViewport::sanitizeCsvCell("\t=1+1"))->toBe("'\t=1+1")
		->and(MarkupReactViewport::sanitizeCsvCell("\r=1+1"))->toBe("'\r=1+1")
		->and(MarkupReactViewport::sanitizeCsvCell("\n=1+1"))->toBe("'\n=1+1");

	// 2. Whitespace-prefixed formula triggers
	expect(MarkupReactViewport::sanitizeCsvCell('   =cmd'))->toBe("'   =cmd")
		->and(MarkupReactViewport::sanitizeCsvCell(" \t +123"))->toBe("' \t +123")
		->and(MarkupReactViewport::sanitizeCsvCell('  @SUM(1)'))->toBe("'  @SUM(1)")
		->and(MarkupReactViewport::sanitizeCsvCell(" \r -cmd"))->toBe("' \r -cmd")
		->and(MarkupReactViewport::sanitizeCsvCell(" \n =2+5"))->toBe("' \n =2+5")
		->and(MarkupReactViewport::sanitizeCsvCell('-SUM(A1:A10)'))->toBe("'-SUM(A1:A10)");

	// 3. Safe values and legitimate negative numbers
	expect(MarkupReactViewport::sanitizeCsvCell('-500'))->toBe('-500')
		->and(MarkupReactViewport::sanitizeCsvCell('-12.34'))->toBe('-12.34')
		->and(MarkupReactViewport::sanitizeCsvCell(' -500 '))->toBe(' -500 ')
		->and(MarkupReactViewport::sanitizeCsvCell('safe_title'))->toBe('safe_title')
		->and(MarkupReactViewport::sanitizeCsvCell('12345'))->toBe('12345')
		->and(MarkupReactViewport::sanitizeCsvCell(''))->toBe('')
		->and(MarkupReactViewport::sanitizeCsvCell('   '))->toBe('   ')
		->and(MarkupReactViewport::sanitizeCsvCell('hello=world'))->toBe('hello=world');
});

test('MarkupReactViewport CSV export neutralizes formula injection in exported cell values (SEC-M5-01)', function (): void {
	$workspace = React::instance();

	$provider = new ArrayDataProvider(
		id: 'sec_test',
		items: [
			[
				'id' => 'row_1',
				'title' => "=cmd|' /C calc'!A0",
				'formula_plus' => '+12345',
				'formula_at' => '@HYPERLINK("http://attacker.com")',
				'formula_tab' => "\t=2+2",
				'negative_num' => '-42.5',
				'safe_text' => 'Normal product',
			],
		],
		options: [
			'title' => 'Security Audit Export Test',
			'columns' => [
				'title' => 'Title',
				'formula_plus' => 'Plus Formula',
				'formula_at' => 'At Formula',
				'formula_tab' => 'Tab Formula',
				'negative_num' => 'Negative Num',
				'safe_text' => 'Safe Text',
			],
			'exportFormats' => ['csv', 'json'],
		],
	);
	wire($provider);
	$workspace->providers()->register('array:sec_test', $provider);

	$table = $workspace->configureTable('array:sec_test', [
		'componentId' => 'sec_m5_test',
	]);

	$stateToken = (string) $table->toInertiaProp()['stateToken'];
	$exportRes = $workspace->handleViewportAction([
		'stateToken' => $stateToken,
		'action' => 'export',
		'payload' => ['format' => 'csv'],
	]);

	expect($exportRes['ok'])->toBeTrue();
	$csv = $exportRes['viewport']['download']['content'] ?? '';

	// Verify all formula triggers are prepended with single quote
	expect($csv)->toContain("'=cmd|' /C calc'!A0")
		->and($csv)->toContain("'+12345")
		->and($csv)->toContain("'@HYPERLINK")
		->and($csv)->toContain("'\t=2+2")
		->and($csv)->toContain('-42.5')
		->and($csv)->toContain('Normal product');
});

test('MarkupReactViewport fallback CSV exporter neutralizes formula injection', function (): void {
	$viewport = new class extends MarkupReactViewport {
		public function testExport(ReactDataProviderInterface $provider, string $format = 'csv'): array {
			$this->columns = [
				'title' => 'Title',
				'formula_plus' => 'Plus',
				'formula_at' => 'At',
				'formula_tab' => 'Tab',
				'negative_num' => 'Negative',
				'safe_text' => 'Safe',
			];

			return $this->generateExportPayload($provider, $format);
		}
	};
	wire($viewport);

	// A provider implementing only ReactDataProviderInterface (without ReactExportProvider)
	$mockProvider = new class extends \ProcessWire\Wire implements ReactDataProviderInterface {
		public function id(): string { return 'mock:sec'; }
		public function title(): string { return 'Mock'; }
		public function columns(): array { return []; }
		public function sortableColumns(): array { return []; }
		public function statusOptions(): array { return []; }
		public function isLocked(): bool { return false; }
		public function mutate(string $operation, array $ids, array $payload = []): int { return 0; }
		public function query(array $criteria = []): ReactPageResult {
			$rec = new ReactRecord(
				id: 'rec_1',
				title: "=cmd|' /C calc'!A0",
				name: '+12345',
				values: [
					'title' => "=cmd|' /C calc'!A0",
					'formula_plus' => '+12345',
					'formula_at' => '@evil',
					'formula_tab' => "\t=2+2",
					'negative_num' => '-99.5',
					'safe_text' => 'ProcessWire CMS',
				],
			);

			return new ReactPageResult([$rec], 1, 1, 25);
		}
		public function findById(string|int $id): ?ReactRecord { return null; }
	};
	wire($mockProvider);

	$res = $viewport->testExport($mockProvider, 'csv');
	$csv = $res['content'];

	expect($csv)->toContain("'=cmd|' /C calc'!A0")
		->and($csv)->toContain("'+12345")
		->and($csv)->toContain("'@evil")
		->and($csv)->toContain("'\t=2+2")
		->and($csv)->toContain('-99.5')
		->and($csv)->toContain('ProcessWire CMS');
});

test('MarkupReactViewport forwards editUrl to providerOptions, honors showCreateButton=false, and persists create/edit/empty URLs in stateToken', function (): void {
	$workspace = React::instance();

	$seenOptions = [];
	$workspace->providers()->registerFactory('custom', function (string $target, array $options) use (&$seenOptions): ReactDataProviderInterface {
		$seenOptions = $options;
		$editBase = (string) ($options['editUrl'] ?? '/fallback/edit/');

		$provider = new ArrayDataProvider(
			id: 'custom:' . $target,
			items: [
				[
					'id' => 'item_1',
					'title' => 'First Redirect',
					'status' => 1,
					'editUrl' => $editBase . '?id=item_1',
				],
			],
			options: [
				'title' => 'Redirects',
				'columns' => ['title' => 'Rule'],
				'createAction' => [
					'label' => 'Add Redirect',
					'url' => $editBase . '?new=1',
				],
			],
		);
		wire($provider);

		return $provider;
	});

	$table = $workspace->configureTable('custom:redirects', [
		'editUrl' => '/61admin/setup/seo/edit/',
		'emptyActionLabel' => 'Add Redirect',
		'emptyActionUrl' => '/61admin/setup/seo/edit/?new=1',
	]);
	$prop = $table->toInertiaProp();

	expect($seenOptions['editUrl'] ?? '')->toBe('/61admin/setup/seo/edit/')
		->and($prop['showCreateButton'])->toBeTrue()
		->and($prop['createUrl'])->toBe('/61admin/setup/seo/edit/?new=1')
		->and($prop['records'][0]['_editUrl'])->toBe('/61admin/setup/seo/edit/?id=item_1')
		->and($prop['emptyActionUrl'])->toBe('/61admin/setup/seo/edit/?new=1');

	$roundTrip = $workspace->handleViewportAction([
		'stateToken' => (string) $prop['stateToken'],
		'action' => 'search',
		'payload' => ['query' => 'First'],
	]);
	expect($roundTrip['ok'])->toBeTrue()
		->and($roundTrip['viewport']['createUrl'])->toBe('/61admin/setup/seo/edit/?new=1')
		->and($roundTrip['viewport']['records'][0]['_editUrl'])->toBe('/61admin/setup/seo/edit/?id=item_1')
		->and($roundTrip['viewport']['emptyActionUrl'])->toBe('/61admin/setup/seo/edit/?new=1');

	// Verify showCreateButton = false suppresses createUrl and createLabel, and exportEnabled = false suppresses export
	$readOnlyTable = $workspace->configureTable('custom:logs', [
		'editUrl' => '/61admin/setup/seo/edit/',
		'showCreateButton' => false,
		'exportEnabled' => false,
	]);
	$readOnlyProp = $readOnlyTable->toInertiaProp();
	expect($readOnlyProp['showCreateButton'])->toBeFalse()
		->and($readOnlyProp['createUrl'])->toBe('')
		->and($readOnlyProp['createLabel'])->toBe('')
		->and($readOnlyProp['exportEnabled'])->toBeFalse();
});

test('MarkupReactTable and MarkupReactCards serialize rich column schemas, record icons, sanitized thumbnails, badges, structured cells, and rowValign across HMAC round-trips', function (): void {
	$workspace = React::instance();

	$provider = new ArrayDataProvider(
		id: 'array:gateways_rich',
		items: [
			[
				'id' => 'gw_1',
				'title' => 'Primary Payment Gateway',
				'name' => 'primary-gateway',
				'icon' => 'credit-card',
				'subtitle' => '/checkout/primary · EUR',
				'thumbHtml' => '<span class="media"><img src="/site/assets/files/1/card.webp" alt="Card Preview"><span class="cnt">+2</span></span>',
				'badges' => [
					['label' => 'Default', 'variant' => 'primary', 'dot' => true],
					'Live',
				],
				'webhook' => [
					'icon' => 'link',
					'label' => '/webhooks/primary',
					'href' => 'https://example.com/webhooks/primary',
					'external' => true,
					'copyValue' => 'https://example.com/webhooks/primary',
				],
				'volume' => 42500,
				'status' => 1,
			],
			[
				'id' => 'gw_xss',
				'title' => 'Untrusted Thumb Row',
				'thumb' => [
					'src' => 'javascript:alert(1)',
					'alt' => 'Blocked',
				],
				'webhook' => '/webhooks/fallback',
				'volume' => 1200,
				'status' => 1,
			],
		],
		options: [
			'title' => 'Payment Gateways',
			'columns' => [
				'title' => ['label' => 'Gateway', 'valign' => 'top'],
				'webhook' => ['label' => 'Endpoint', 'mono' => true, 'copyable' => true, 'truncate' => 28],
				'volume' => ['label' => 'Volume', 'align' => 'right', 'tabular' => true, 'nowrap' => true],
				'status' => 'Status',
			],
			'exportFormats' => ['csv', 'json'],
		],
	);
	wire($provider);
	$workspace->providers()->register('array:gateways_rich', $provider);

	$table = $workspace->configureTable('array:gateways_rich', [
		'rowValign' => 'top',
		'dense' => true,
	]);
	$prop = $table->toInertiaProp();

	expect($prop['rowValign'])->toBe('top')
		->and($prop['dense'])->toBeTrue()
		->and($prop['columns']['webhook']['mono'])->toBeTrue()
		->and($prop['columns']['webhook']['copyable'])->toBeTrue()
		->and($prop['columns']['webhook']['truncate'])->toBe(28)
		->and($prop['columns']['volume']['align'])->toBe('right')
		->and($prop['columns']['volume']['tabular'])->toBeTrue()
		->and($prop['records'][0]['_icon'])->toBe('credit-card')
		->and($prop['records'][0]['_subtitle'])->toBe('/checkout/primary · EUR')
		->and($prop['records'][0]['_thumb'])->toBe([
			'src' => '/site/assets/files/1/card.webp',
			'alt' => 'Card Preview',
			'count' => 3,
		])
		->and($prop['records'][0]['_badges'])->toHaveCount(2)
		->and($prop['records'][1])->not->toHaveKey('_thumb');

	// Verify CSV export extracts structured cell label cleanly instead of dumping associative keys
	$exported = $workspace->handleViewportAction([
		'stateToken' => (string) $prop['stateToken'],
		'action' => 'export',
		'payload' => ['format' => 'csv'],
	]);
	expect($exported['ok'])->toBeTrue()
		->and($exported['viewport']['rowValign'])->toBe('top')
		->and($exported['viewport']['dense'])->toBeTrue()
		->and($exported['viewport']['download']['content'])->toContain('/webhooks/primary')
		->and($exported['viewport']['download']['content'])->not->toContain('https://example.com/webhooks/primary');
});

test('React::deferProviderRegistration defers before resolution and executes immediately once resolved', function (): void {
	$origReact = wire('react');
	$freshReact = new React();
	wire($freshReact);
	$freshReact->wired();
	$freshReact->init();

	$deferredRuns = 0;
	$immediateRuns = 0;

	try {
		wire()->fuel->set('react', $freshReact);
		expect($freshReact->isProvidersResolved())->toBeFalse();

		React::deferProviderRegistration(
			$freshReact,
			static function (\Totoglu\React\Provider\ProviderRegistry $registry, React $target) use ($freshReact, &$deferredRuns): void {
				if ($target !== $freshReact) {
					return;
				}
				$deferredRuns++;
				$registry->register('deferred_demo:items', new ArrayDataProvider('deferred_demo:items', [], ['title' => 'Deferred Demo']));
			}
		);

		expect($deferredRuns)->toBe(0)
			->and($freshReact->isProvidersResolved())->toBeFalse();

		$registry = $freshReact->providers();
		expect($freshReact->isProvidersResolved())->toBeTrue()
			->and($deferredRuns)->toBe(1)
			->and($registry->has('deferred_demo:items'))->toBeTrue();

		React::deferProviderRegistration(
			$freshReact,
			static function (\Totoglu\React\Provider\ProviderRegistry $reg, React $target) use ($freshReact, &$immediateRuns): void {
				if ($target !== $freshReact) {
					return;
				}
				$immediateRuns++;
				$reg->register('immediate_demo:items', new ArrayDataProvider('immediate_demo:items', [], ['title' => 'Immediate Demo']));
			}
		);

		expect($immediateRuns)->toBe(1)
			->and($registry->has('immediate_demo:items'))->toBeTrue();
	} finally {
		wire()->fuel->set('react', $origReact);
	}
});

test('MarkupReactViewport persists pill filter/toolbar config over HMAC stateToken and refreshes views & filter counts after mutation', function (): void {
	$workspace = bootReactForTesting();

	$dynamicProvider = new class extends \ProcessWire\Wire implements
		ReactDataProviderInterface,
		\Totoglu\React\Contract\ReactFieldSchemaProvider,
		\Totoglu\React\Contract\ReactViewsProvider,
		\Totoglu\React\Contract\ReactRecordActionsProvider {
		/** @var array<string, array{id: string, title: string, category: string}> */
		private array $rows = [
			'item_1' => ['id' => 'item_1', 'title' => 'Hero Banner', 'category' => 'hero'],
			'item_2' => ['id' => 'item_2', 'title' => 'Split Hero', 'category' => 'hero'],
			'item_3' => ['id' => 'item_3', 'title' => 'FAQ Accordion', 'category' => 'content'],
		];

		public function id(): string { return 'dynamic_meta:items'; }
		public function title(): string { return 'Dynamic Widgets'; }
		public function columns(): array { return ['title' => 'Title', 'category' => 'Category']; }
		public function sortableColumns(): array { return ['title']; }
		public function statusOptions(): array { return []; }
		public function isLocked(): bool { return false; }

		public function query(array $criteria = []): ReactPageResult
		{
			$catFilter = (string) ($criteria['fieldFilters']['category'] ?? '');
			$items = [];
			foreach ($this->rows as $row) {
				if ($catFilter !== '' && $row['category'] !== $catFilter) {
					continue;
				}
				$items[] = new ReactRecord(
					id: $row['id'],
					title: $row['title'],
					values: ['category' => $row['category']],
				);
			}

			return new ReactPageResult($items, count($items), 1, 25);
		}

		public function mutate(string $operation, array $ids, array $payload = []): int
		{
			if (!in_array($operation, [ReactDataProviderInterface::OP_DELETE, ReactDataProviderInterface::OP_TRASH], true)) {
				return 0;
			}
			$removed = 0;
			foreach ($ids as $id) {
				if (isset($this->rows[$id])) {
					unset($this->rows[$id]);
					$removed++;
				}
			}

			return $removed;
		}

		public function filterableFields(): array
		{
			$counts = ['hero' => 0, 'content' => 0];
			foreach ($this->rows as $row) {
				$counts[$row['category']] = ($counts[$row['category']] ?? 0) + 1;
			}

			return [
				'category' => [
					'label' => 'Category',
					'type' => 'select',
					'display' => 'pills',
					'options' => ['hero' => 'Hero', 'content' => 'Content'],
					'counts' => $counts,
					'icons' => ['hero' => 'layout', 'content' => 'file-text'],
					'totalCount' => count($this->rows),
				],
			];
		}

		public function groupableFields(): array { return []; }
		public function availableColumns(): array { return ['title' => 'Title', 'category' => 'Category']; }
		public function inlineEditableFields(): array { return []; }

		public function savedViews(): array
		{
			$heroCount = count(array_filter($this->rows, static fn(array $r): bool => $r['category'] === 'hero'));

			return [
				'all' => ['label' => 'All', 'count' => count($this->rows)],
				'hero' => ['label' => 'Hero', 'count' => $heroCount],
			];
		}

		public function recordActions(ReactRecord $record): array
		{
			return [
				['key' => 'delete', 'label' => 'Delete', 'tone' => 'danger'],
			];
		}

		public function createAction(): ?array { return null; }
	};

	$workspace->providers()->register('dynamic_meta:items', $dynamicProvider);

	$vp = $workspace->configureTable('dynamic_meta:items', [
		'componentId' => 'vp-meta-refresh',
		'saveViewEnabled' => false,
		'columnPickerEnabled' => false,
		'searchPlaceholder' => 'Filter widgets...',
		'showToolbar' => true,
		'showFilterBar' => true,
		'showPagination' => true,
	]);

	$prop = $vp->mount()->toInertiaProp();
	expect($prop['saveViewEnabled'])->toBeFalse()
		->and($prop['columnPickerEnabled'])->toBeFalse()
		->and($prop['searchPlaceholder'])->toBe('Filter widgets...')
		->and($prop['showToolbar'])->toBeTrue()
		->and($prop['showFilterBar'])->toBeTrue()
		->and($prop['showPagination'])->toBeTrue()
		->and($prop['filters']['category']['display'])->toBe('pills')
		->and($prop['filters']['category']['counts'])->toBe(['hero' => 2, 'content' => 1])
		->and($prop['filters']['category']['icons'])->toBe(['hero' => 'layout', 'content' => 'file-text'])
		->and($prop['filters']['category']['totalCount'])->toBe(3)
		->and($prop['views']['all']['count'])->toBe(3)
		->and($prop['views']['hero']['count'])->toBe(2);

	$filtered = $workspace->handleViewportAction([
		'stateToken' => (string) $prop['stateToken'],
		'action' => 'filter',
		'payload' => ['key' => 'category', 'value' => 'hero'],
	]);
	expect($filtered['ok'])->toBeTrue()
		->and($filtered['viewport']['total'])->toBe(2)
		->and($filtered['viewport']['saveViewEnabled'])->toBeFalse()
		->and($filtered['viewport']['columnPickerEnabled'])->toBeFalse()
		->and($filtered['viewport']['searchPlaceholder'])->toBe('Filter widgets...')
		->and($filtered['viewport']['showToolbar'])->toBeTrue()
		->and($filtered['viewport']['showFilterBar'])->toBeTrue()
		->and($filtered['viewport']['showPagination'])->toBeTrue()
		->and($filtered['viewport']['filters']['category']['display'])->toBe('pills');

	$afterDelete = $workspace->handleViewportAction([
		'stateToken' => (string) $filtered['viewport']['stateToken'],
		'action' => 'row_action',
		'state' => ['filterValues' => ['category' => 'hero']],
		'payload' => ['rowAction' => 'delete', 'id' => 'item_1'],
	]);
	expect($afterDelete['ok'])->toBeTrue()
		->and($afterDelete['viewport']['total'])->toBe(1)
		->and($afterDelete['viewport']['filters']['category']['counts'])->toBe(['hero' => 1, 'content' => 1])
		->and($afterDelete['viewport']['filters']['category']['totalCount'])->toBe(2)
		->and($afterDelete['viewport']['views']['all']['count'])->toBe(2)
		->and($afterDelete['viewport']['views']['hero']['count'])->toBe(1);
});

test('MarkupReactViewport pluggable mode hooks enforce POST/CSRF via ReactGatewayRouter and round-trip modeState', function (): void {
	if (!class_exists('ProcessWire\\RwTestCustomModeViewport', false)) {
		eval(<<<'PHP'
namespace ProcessWire;
use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Viewport\MarkupReactViewport;
class RwTestCustomModeViewport extends MarkupReactViewport {
	public string $customCursor = 'initial';
	protected function defaultViewMode(): string { return 'custom_board'; }
	public function modeMutatingActions(): array { return ['custom_mutate']; }
	public function modeMutableStateKeys(): array { return ['customCursor']; }
	public function modeSignedState(): array { return ['customCursor' => $this->customCursor]; }
	public function applyModeSignedState(array $state): void {
		if (isset($state['customCursor']) && is_string($state['customCursor'])) {
			$this->customCursor = $state['customCursor'];
		}
	}
	public function modeExecuteAction(string $action, array $payload, ?ReactDataProviderInterface $provider): ?array {
		if ($action !== 'custom_mutate') {
			return null;
		}
		$this->customCursor = (string) ($payload['cursor'] ?? 'next');
		return ['handled' => true, 'notice' => 'Custom mutated'];
	}
	public function modeInertiaData(?ReactDataProviderInterface $provider, array $records): array {
		return ['customCursor' => $this->customCursor];
	}
}
PHP
		);
	}
	$workspace = React::instance();

	/** @var \ProcessWire\RwTestCustomModeViewport $customModeViewport */
	$customModeViewport = new \ProcessWire\RwTestCustomModeViewport();
	wire($customModeViewport);
	$customModeViewport->init();

	$prop = $customModeViewport->configure([
		['id' => 'r1', 'title' => 'Row 1'],
	])->toInertiaProp();

	expect($prop['modeState']['customCursor'] ?? null)->toBe('initial');

	// Verify base ReactGatewayRouter rejects GET on custom mode's mutating action and checks CSRF when enforced
	expect($customModeViewport->allMutatingActions())->toContain('custom_mutate')
		->and($customModeViewport->allMutableStateKeys())->toContain('customCursor');

	$getBlocked = $workspace->handleViewportAction([
		'_requestMethod' => 'GET',
		'stateToken' => (string) $prop['stateToken'],
		'action' => 'custom_mutate',
		'state' => ['customCursor' => 'from_client'],
		'payload' => ['cursor' => 'done'],
	], true);
	expect($getBlocked['ok'])->toBeFalse()
		->and($getBlocked['status'])->toBe(405);

	$csrfBlocked = $workspace->handleViewportAction([
		'_requestMethod' => 'POST',
		'stateToken' => (string) $prop['stateToken'],
		'action' => 'custom_mutate',
		'payload' => ['cursor' => 'done'],
	], true);
	expect($csrfBlocked['ok'])->toBeFalse()
		->and($csrfBlocked['status'])->toBe(419);

	$mutated = $customModeViewport->executeAction('custom_mutate', ['cursor' => 'step_2']);
	expect($mutated['modeState']['customCursor'] ?? null)->toBe('step_2')
		->and($mutated['notice']['message'] ?? null)->toBe('Custom mutated');
});

test('MarkupReactViewport trash view exposes trashCount, restore/delete bulkActions, empty_trash CSRF enforcement, and PagesDataProvider trashCount/emptyTrash', function (): void {
	$workspace = React::instance();
	$table = $workspace->viewport('table');
	$pages = wire('pages');
	$templates = wire('templates');
	$tpl = $templates->get('page');
	expect($tpl)->not->toBeNull();

	$root = $pages->get('/');
	$p1 = $pages->new([
		'template' => $tpl,
		'parent' => $root,
		'title' => 'React Trash Item One ' . uniqid(),
	]);
	$p2 = $pages->new([
		'template' => $tpl,
		'parent' => $root,
		'title' => 'React Trash Item Two ' . uniqid(),
	]);
	expect($p1->id)->toBeGreaterThan(0)->and($p2->id)->toBeGreaterThan(0);

	try {
		$pages->trash($p1);
		$provider = new \Totoglu\React\Provider\PagesDataProvider('id=' . $p1->id . '|' . $p2->id);
		wire($provider);

		$prop = $table->configure($provider)->toInertiaProp();
		expect($prop['supportsTrash'] ?? false)->toBeTrue()
			->and($prop['trashCount'] ?? 0)->toBe(1)
			->and($prop['isTrashView'] ?? true)->toBeFalse()
			->and(array_keys($prop['bulkActions'] ?? []))->toContain('publish', 'draft', 'trash');

		$trashRes = $workspace->handleViewportAction([
			'stateToken' => (string) $prop['stateToken'],
			'action' => 'filter',
			'payload' => ['key' => 'status', 'value' => 'trash'],
		]);
		expect($trashRes['ok'])->toBeTrue()
			->and($trashRes['viewport']['isTrashView'] ?? false)->toBeTrue()
			->and($trashRes['viewport']['total'] ?? 0)->toBe(1)
			->and($trashRes['viewport']['trashCount'] ?? 0)->toBe(1)
			->and(array_keys($trashRes['viewport']['bulkActions'] ?? []))->toBe(['restore', 'delete']);

		// GET and missing-CSRF POST must be rejected on empty_trash
		$getEmptyBlocked = $workspace->handleViewportAction([
			'_requestMethod' => 'GET',
			'stateToken' => (string) $trashRes['viewport']['stateToken'],
			'action' => 'empty_trash',
		], true);
		expect($getEmptyBlocked['ok'])->toBeFalse()->and($getEmptyBlocked['status'])->toBe(405);

		$csrfEmptyBlocked = $workspace->handleViewportAction([
			'_requestMethod' => 'POST',
			'stateToken' => (string) $trashRes['viewport']['stateToken'],
			'action' => 'empty_trash',
		], true);
		expect($csrfEmptyBlocked['ok'])->toBeFalse()->and($csrfEmptyBlocked['status'])->toBe(419);

		// Empty Trash removes the trashed page and drops trashCount to 0
		$emptied = $workspace->handleViewportAction([
			'stateToken' => (string) $trashRes['viewport']['stateToken'],
			'action' => 'empty_trash',
			'state' => ['filterValues' => ['status' => 'trash']],
		]);
		expect($emptied['ok'])->toBeTrue()
			->and($emptied['viewport']['trashCount'] ?? -1)->toBe(0)
			->and($emptied['viewport']['total'] ?? -1)->toBe(0);
	} finally {
		foreach ([$p1->id, $p2->id] as $pid) {
			$reloaded = $pages->get((int) $pid);
			if ($reloaded instanceof Page && $reloaded->id > 0) {
				$pages->delete($reloaded, true);
			}
		}
	}
});

test('PagesDataProvider::resolveQuickEditForm serializes native Inputfields, saves via processInput, and scopes exports by ids', function (): void {
	$fields = wire()->fields;
	$fieldgroups = wire()->fieldgroups;
	$templates = wire()->templates;
	$pages = wire()->pages;
	$langs = wire()->languages;

	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$createdFields = [];
	$fg = null;
	$tpl = null;
	$p = null;
	$p2 = null;

	try {
		$useLangs = $langs instanceof Languages && $langs->count() > 1;
		$textareaFt = $useLangs && wire()->modules->isInstalled('FieldtypeTextareaLanguage')
			? 'FieldtypeTextareaLanguage'
			: 'FieldtypeTextarea';

		$notesField = new Field();
		$notesField->type = wire()->modules->get($textareaFt);
		$notesField->name = 'qe_notes_' . $suffix;
		$notesField->label = 'Notes';
		$notesField->set('rows', 6);
		$notesField->save();
		$createdFields[] = $notesField;

		$emailField = new Field();
		$emailField->type = wire()->modules->get('FieldtypeEmail');
		$emailField->name = 'qe_email_' . $suffix;
		$emailField->label = 'Contact Email';
		$emailField->save();
		$createdFields[] = $emailField;

		$countField = new Field();
		$countField->type = wire()->modules->get('FieldtypeInteger');
		$countField->name = 'qe_count_' . $suffix;
		$countField->label = 'Count';
		$countField->save();
		$createdFields[] = $countField;

		$flagField = new Field();
		$flagField->type = wire()->modules->get('FieldtypeCheckbox');
		$flagField->name = 'qe_flag_' . $suffix;
		$flagField->label = 'Featured Flag';
		$flagField->save();
		$createdFields[] = $flagField;

		$fg = new Fieldgroup();
		$fg->name = 'qe_fg_' . $suffix;
		$titleField = $fields->get('title');
		if ($titleField instanceof Field) {
			$fg->add($titleField);
		}
		foreach ($createdFields as $cf) {
			$fg->add($cf);
		}
		$fg->save();

		$tpl = new Template();
		$tpl->name = 'qe_tpl_' . $suffix;
		$tpl->fieldgroup = $fg;
		$tpl->save();

		$home = $pages->get(1);
		$p = new Page();
		$p->template = $tpl;
		$p->parent = $home;
		$p->name = 'qe-page-' . $suffix;
		$p->title = 'Quick Edit Page';
		$p->set($notesField->name, "Line A\nLine B");
		$p->set($emailField->name, 'team@example.com');
		$p->set($countField->name, 42);
		$p->set($flagField->name, 1);
		$p->save();

		$p2 = new Page();
		$p2->template = $tpl;
		$p2->parent = $home;
		$p2->name = 'qe-page-2-' . $suffix;
		$p2->title = 'Second Export Page';
		$p2->save();

		$provider = new PagesDataProvider("template={$tpl->name}");
		wire($provider);

		$qeForm = $provider->resolveQuickEditForm((string) $p->id);
		expect($qeForm)->toBeArray()
			->and($qeForm['title'] ?? null)->toBe('Quick Edit Page')
			->and($qeForm['editUrl'] ?? '')->toContain('id=' . $p->id);

		$schemaFields = array_column((array) ($qeForm['formSchema']['fields'] ?? []), null, 'name');
		expect($schemaFields)->toHaveKey('title')
			->and($schemaFields)->toHaveKey($notesField->name)
			->and($schemaFields)->toHaveKey($emailField->name)
			->and($schemaFields)->toHaveKey($countField->name)
			->and($schemaFields)->toHaveKey($flagField->name)
			->and($schemaFields)->not->toHaveKey('delete_page')
			->and($schemaFields)->not->toHaveKey('status')
			->and($schemaFields)->not->toHaveKey('parent_id')
			->and($schemaFields[$notesField->name]['type'] ?? null)->toBe('textarea')
			->and($schemaFields[$notesField->name]['rows'] ?? null)->toBe(6)
			->and($schemaFields[$emailField->name]['inputType'] ?? null)->toBe('email')
			->and($schemaFields[$countField->name]['type'] ?? null)->toBe('number')
			->and($schemaFields[$flagField->name]['type'] ?? null)->toBe('checkbox')
			->and((bool) ($schemaFields[$flagField->name]['checked'] ?? false))->toBeTrue();

		$formPost = [
			'_rw_quick_edit_form' => '1',
			'title' => 'Quick Edit Page Updated',
			$notesField->name => "Line C\nLine D",
			$emailField->name => 'updated@example.com',
			$countField->name => '99',
			// Omit $flagField->name to verify HTML FormData unchecked checkbox resets to 0
		];
		$secondaryLang = null;
		if ($useLangs && $textareaFt === 'FieldtypeTextareaLanguage') {
			$defLang = $langs->getDefault();
			foreach ($langs as $langItem) {
				if ($langItem instanceof Language && !$langItem->isDefault()) {
					$secondaryLang = $langItem;
					break;
				}
			}
			expect($schemaFields[$notesField->name]['useLanguages'] ?? false)->toBeTrue()
				->and($qeForm['formSchema']['values'][$notesField->name] ?? null)->toBe("Line A\nLine B");
			if ($defLang instanceof Language && $secondaryLang instanceof Language) {
				$formPost[$notesField->name . '__' . $secondaryLang->id] = "Satir C\nSatir D";
			}
		}

		$saveResult = $provider->saveQuickEdit((string) $p->id, $formPost);
		expect($saveResult['ok'] ?? false)->toBeTrue();

		$pages->uncacheAll();
		$reloaded = $pages->get((int) $p->id);
		expect((string) $reloaded->title)->toBe('Quick Edit Page Updated')
			->and((string) $reloaded->getUnformatted($notesField->name))->toBe("Line C\nLine D")
			->and((string) $reloaded->getUnformatted($emailField->name))->toBe('updated@example.com')
			->and((int) $reloaded->getUnformatted($countField->name))->toBe(99)
			->and((int) $reloaded->getUnformatted($flagField->name))->toBe(0);
		if ($secondaryLang instanceof Language) {
			expect((string) $reloaded->getLanguageValue($secondaryLang, $notesField->name))->toBe("Satir C\nSatir D");
		}

		// Verify PagesDataProvider query supports ids scoping for selection exports
		$scopedResult = $provider->query(['ids' => [(string) $p2->id]]);
		expect($scopedResult->total)->toBe(1)
			->and(count($scopedResult->items))->toBe(1)
			->and($scopedResult->items[0]->id)->toBe((string) $p2->id);
	} finally {
		foreach ([$p, $p2] as $pageCandidate) {
			if ($pageCandidate instanceof Page && $pageCandidate->id > 0) {
				$pages->delete($pageCandidate, true);
			}
		}
		if ($tpl instanceof Template && $tpl->id > 0) {
			$templates->delete($tpl);
		}
		if ($fg instanceof Fieldgroup && $fg->id > 0) {
			$fieldgroups->delete($fg);
		}
		foreach ($createdFields as $cf) {
			if ($cf instanceof Field && $cf->id > 0) {
				$fields->delete($cf);
			}
		}
	}
});

test('MarkupReactTable and MarkupReactCards are non-singular and isolate state across direct $modules->get() calls', function (): void {
	$modules = wire()->modules;

	$tableInfo = $modules->getModuleInfoVerbose('MarkupReactTable', ['noCache' => true]);
	$cardsInfo = $modules->getModuleInfoVerbose('MarkupReactCards', ['noCache' => true]);
	expect($tableInfo['singular'] ?? null)->toBeFalse()
		->and($tableInfo['autoload'] ?? null)->toBeFalse()
		->and($cardsInfo['singular'] ?? null)->toBeFalse()
		->and($cardsInfo['autoload'] ?? null)->toBeFalse()
		->and($modules->isSingular('MarkupReactTable'))->toBeFalse()
		->and($modules->isSingular('MarkupReactCards'))->toBeFalse();

	/** @var MarkupReactTable $t1 */
	$t1 = $modules->get('MarkupReactTable');
	/** @var MarkupReactTable $t2 */
	$t2 = $modules->get('MarkupReactTable');
	expect($t1)->toBeInstanceOf(MarkupReactTable::class)
		->and($t2)->toBeInstanceOf(MarkupReactTable::class)
		->and($t1)->not->toBe($t2);

	$providerA = new ArrayDataProvider(
		id: 'array:alpha_tasks',
		items: [
			['id' => 'a1', 'title' => 'Alpha One', 'region' => 'aegean', 'priority' => 10],
			['id' => 'a2', 'title' => 'Beta Task', 'region' => 'aegean', 'priority' => 30],
			['id' => 'a3', 'title' => 'Beta Secondary', 'region' => 'med', 'priority' => 20],
		],
		options: [
			'columns' => ['title' => 'Task', 'priority' => 'Priority'],
			'filterableFields' => ['region' => ['label' => 'Region', 'type' => 'select', 'options' => ['aegean' => 'Aegean', 'med' => 'Med']]],
		],
	);
	$providerB = new ArrayDataProvider(
		id: 'array:beta_notes',
		items: [
			['id' => 'b1', 'title' => 'Zeta Only'],
		],
		options: [
			'columns' => ['title' => 'Note'],
		],
	);

	$t1->configure($providerA, [
		'componentId' => 'tbl-alpha',
		'searchQuery' => 'Beta',
		'sortField' => 'priority',
		'sortDirection' => 'desc',
		'pageNum' => 1,
		'limit' => 5,
		'filterValues' => ['region' => 'aegean'],
		'columns' => ['title' => 'Task', 'priority' => 'Priority'],
		'filters' => ['region' => ['label' => 'Region', 'type' => 'select', 'options' => ['aegean' => 'Aegean', 'med' => 'Med']]],
	]);

	$t2->configure($providerB, [
		'componentId' => 'tbl-beta',
		'searchQuery' => '',
		'sortField' => 'title',
		'sortDirection' => 'asc',
		'pageNum' => 1,
		'limit' => 10,
		'columns' => ['title' => 'Note'],
	]);

	$prop1 = $t1->toInertiaProp();
	$prop2 = $t2->toInertiaProp();
	$html1 = $t1->render();
	$html2 = $t2->render();

	expect($prop1['componentId'])->toBe('tbl-alpha')
		->and($prop2['componentId'])->toBe('tbl-beta')
		->and($prop1['provider'])->toBe('array:alpha_tasks')
		->and($prop2['provider'])->toBe('array:beta_notes')
		->and($prop1['searchQuery'] ?? null)->toBe('Beta')
		->and($prop1['sortField'] ?? null)->toBe('priority')
		->and($prop1['sortDirection'] ?? null)->toBe('desc')
		->and($prop1['filterValues']['region'] ?? null)->toBe('aegean')
		->and($prop1['limit'] ?? null)->toBe(5)
		->and($prop1['total'] ?? null)->toBe(1)
		->and($prop1['columns']['title']['label'] ?? null)->toBe('Task')
		->and($prop1['records'][0]['id'] ?? null)->toBe('a2')
		->and($prop2['total'] ?? null)->toBe(1)
		->and($prop2['records'][0]['id'] ?? null)->toBe('b1')
		->and($html1)->toContain('tbl-alpha')
		->and($html1)->not->toContain('tbl-beta')
		->and($html2)->toContain('tbl-beta')
		->and($html2)->not->toContain('tbl-alpha');

	/** @var MarkupReactCards $c1 */
	$c1 = $modules->get('MarkupReactCards');
	/** @var MarkupReactCards $c2 */
	$c2 = $modules->get('MarkupReactCards');
	expect($c1)->toBeInstanceOf(MarkupReactCards::class)
		->and($c2)->toBeInstanceOf(MarkupReactCards::class)
		->and($c1)->not->toBe($c2);

	$c1->configure($providerA, [
		'componentId' => 'cards-alpha',
		'searchQuery' => 'Aegean',
		'sortField' => 'priority',
		'sortDirection' => 'desc',
		'limit' => 2,
		'columns' => ['title' => 'Fleet'],
	]);
	$c2->configure($providerB, [
		'componentId' => 'cards-beta',
		'searchQuery' => '',
		'sortField' => 'title',
		'limit' => 12,
		'columns' => ['title' => 'Cards'],
	]);

	$cProp1 = $c1->toInertiaProp();
	$cProp2 = $c2->toInertiaProp();
	$cHtml1 = $c1->render();
	$cHtml2 = $c2->render();

	expect($cProp1['componentId'])->toBe('cards-alpha')
		->and($cProp2['componentId'])->toBe('cards-beta')
		->and($cProp1['provider'])->toBe('array:alpha_tasks')
		->and($cProp2['provider'])->toBe('array:beta_notes')
		->and($cProp1['searchQuery'] ?? null)->toBe('Aegean')
		->and($cProp1['limit'] ?? null)->toBe(2)
		->and($cProp1['records'][0]['id'] ?? null)->toBe('a2')
		->and($cProp2['limit'] ?? null)->toBe(12)
		->and($cProp2['records'][0]['id'] ?? null)->toBe('b1')
		->and($cHtml1)->toContain('cards-alpha')
		->and($cHtml2)->toContain('cards-beta');
});
