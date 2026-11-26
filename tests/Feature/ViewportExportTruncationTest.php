<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\Field;
use ProcessWire\Fieldgroup;
use ProcessWire\MarkupReactTable;
use ProcessWire\Page;
use ProcessWire\React;
use ProcessWire\Role;
use ProcessWire\Template;
use ProcessWire\User;
use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Contract\ReactExportProvider;
use Totoglu\React\Data\ReactPageResult;
use Totoglu\React\Data\ReactRecord;
use Totoglu\React\Provider\PagesDataProvider;
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

test('MarkupReactViewport fallback export paginates past 250-row query caps without silent truncation', function (): void {
	$totalItems = 310;
	$allRecords = [];
	for ($i = 1; $i <= $totalItems; $i++) {
		$allRecords[] = new ReactRecord(
			id: 'rec_' . $i,
			title: $i === 1 ? '=CMD("calc")' : 'Record ' . $i,
			name: 'record-' . $i,
			values: ['notes' => $i === 2 ? '+1+1' : ($i === 3 ? '@SUM(A1)' : 'ok-"' . $i . '"')],
		);
	}

	$providerKey = 'mock:clamped_' . substr(bin2hex(random_bytes(4)), 0, 8);
	$clampedProvider = new class ($allRecords, $providerKey) implements ReactDataProviderInterface {
		/**
		 * @param list<ReactRecord> $records
		 */
		public function __construct(
			private readonly array $records,
			private readonly string $providerId,
		) {}

		public function id(): string
		{
			return $this->providerId;
		}

		public function title(): string
		{
			return 'Mock Clamped Provider';
		}

		public function columns(): array
		{
			return ['title' => 'Title', 'notes' => 'Notes'];
		}

		public function sortableColumns(): array
		{
			return ['title'];
		}

		public function statusOptions(): array
		{
			return [];
		}

		public function isLocked(): bool
		{
			return true;
		}

		public function filterableFields(): array
		{
			return [];
		}

		public function groupableFields(): array
		{
			return [];
		}

		public function availableColumns(): array
		{
			return ['title' => 'Title', 'notes' => 'Notes'];
		}

		public function query(array $criteria = []): ReactPageResult
		{
			$pageNum = max(1, (int) ($criteria['pageNum'] ?? 1));
			$limit = max(1, min(250, (int) ($criteria['limit'] ?? 25)));
			$offset = ($pageNum - 1) * $limit;

			return new ReactPageResult(
				items: array_slice($this->records, $offset, $limit),
				total: count($this->records),
				pageNum: $pageNum,
				limit: $limit,
			);
		}

		public function mutate(string $operation, array $ids, array $payload = []): int
		{
			return 0;
		}
	};

	$react = React::instance();
	$react->providers()->register($providerKey, $clampedProvider);

	$table = new class extends MarkupReactTable {
		/**
		 * @return array{filename: string, content: string, mime: string}
		 */
		public function exportViaFallback(ReactDataProviderInterface $provider, string $format): array
		{
			return $this->generateExportPayload($provider, $format);
		}
	};
	wire($table);
	$table->provider = $providerKey;
	$table->componentId = 'mock_clamped_export';
	$table->columns = ['title' => 'Title', 'notes' => 'Notes'];

	$csvRes = $table->exportViaFallback($clampedProvider, 'csv');
	$csvBody = $csvRes['content'];
	$lines = array_values(array_filter(explode("\n", str_replace("\r\n", "\n", trim($csvBody)))));
	expect($lines)->toHaveCount($totalItems + 1)
		->and($csvBody)->toContain("'=CMD(")
		->and($csvBody)->toContain("'+1+1")
		->and($csvBody)->toContain("'@SUM(A1)")
		->and($csvBody)->not->toContain('\"1\"');

	$jsonRes = $table->exportViaFallback($clampedProvider, 'json');
	$decodedJson = json_decode($jsonRes['content'], true, 32, JSON_THROW_ON_ERROR);
	expect($decodedJson)->toHaveCount($totalItems)
		->and($decodedJson[0]['id'] ?? null)->toBe('rec_1')
		->and($decodedJson[309]['id'] ?? null)->toBe('rec_310');
});

test('PagesDataProvider implements ReactExportProvider, paginates past 250 pages, enforces RBAC, and neutralizes CSV formulas', function (): void {
	$pw = wire();
	$modules = $pw->modules;
	$fields = $pw->fields;
	$fieldgroups = $pw->fieldgroups;
	$templates = $pw->templates;
	$pages = $pw->pages;
	$users = $pw->users;
	$roles = $pw->roles;

	$suffix = substr(bin2hex(random_bytes(4)), 0, 8);
	$secretFieldName = 'rw_exp_sec_' . $suffix;
	$tplName = 'rw_exp_tpl_' . $suffix;
	$roleName = 'rw_exp_role_' . $suffix;
	$userName = 'rw_exp_user_' . $suffix;

	$secretField = null;
	$fg = null;
	$tpl = null;
	$editorRole = null;
	$editorUser = null;
	$parentPage = null;
	$prevUser = $users->getCurrentUser();
	$superId = (int) ($pw->config->superUserPageID ?: 41);

	try {
		$editorRole = $roles->add($roleName);
		$pageEditPerm = $pw->permissions->get('page-edit');
		if ($pageEditPerm && $pageEditPerm->id) {
			$editorRole->addPermission($pageEditPerm);
		}
		$roles->save($editorRole);

		$guestRole = $roles->get('guest');
		$secretField = new Field();
		$secretField->type = $modules->get('FieldtypeText');
		$secretField->name = $secretFieldName;
		$secretField->label = 'Restricted Export Secret';
		$secretField->useRoles = 1;
		$secretField->viewRoles = [$superId];
		$secretField->editRoles = [$superId];
		$fields->save($secretField);

		$fg = new Fieldgroup();
		$fg->name = $tplName;
		$fg->add($fields->get('title'));
		$fg->add($secretField);
		$fieldgroups->save($fg);

		$tpl = new Template();
		$tpl->name = $tplName;
		$tpl->fieldgroup = $fg;
		$tpl->useRoles = 1;
		$tpl->roles = array_values(array_filter([$guestRole ? (int) $guestRole->id : 0, (int) $editorRole->id]));
		$tpl->editRoles = [(int) $editorRole->id];
		$templates->save($tpl);

		$editorUser = $users->add($userName);
		if ($guestRole) {
			$editorUser->addRole($guestRole);
		}
		$editorUser->addRole($editorRole);
		$users->save($editorUser);

		$containerTpl = $templates->get('page') ?: $templates->get('home');
		$parentPage = $pages->new([
			'template' => $containerTpl,
			'parent' => 1,
			'title' => 'Export Container ' . $suffix,
		]);
		$pages->save($parentPage);

		$totalPages = 260;
		for ($i = 1; $i <= $totalPages; $i++) {
			$p = $pages->new([
				'template' => $tpl,
				'parent' => $parentPage,
				'name' => "item-{$i}-{$suffix}",
				'title' => $i === 1 ? '=2+2' : "Export Item {$i}",
			]);
			$p->set($secretFieldName, "SECRET-{$i}");
			$pages->save($p);
		}

		$provider = new PagesDataProvider("parent={$parentPage->id}, template={$tplName}, sort=id", [
			'title' => 'Export Pages',
			'columns' => [
				'title' => 'Title',
				$secretFieldName => 'Secret',
			],
		]);
		wire($provider);

		expect($provider)->toBeInstanceOf(ReactExportProvider::class)
			->and($provider->exportFormats())->toBe(['csv', 'json']);

		// 1. Superuser sees all 260 rows (> 250 query limit) + secret column
		$superCsv = $provider->export('csv');
		$superLines = array_values(array_filter(explode("\n", str_replace("\r\n", "\n", trim($superCsv['body'])))));
		expect($superLines)->toHaveCount($totalPages + 1)
			->and($superCsv['body'])->toContain("'=2+2")
			->and($superCsv['body'])->toContain('SECRET-260');

		$superJson = json_decode($provider->export('json')['body'], true, 32, JSON_THROW_ON_ERROR);
		expect($superJson)->toHaveCount($totalPages)
			->and($superJson[259][$secretFieldName] ?? null)->toBe('SECRET-260');

		// 2. Editor without field viewRoles exports all 260 pages, but restricted field stays empty
		$users->setCurrentUser($editorUser);
		$editorJson = json_decode($provider->export('json')['body'], true, 32, JSON_THROW_ON_ERROR);
		expect($editorJson)->toHaveCount($totalPages)
			->and($editorJson[0][$secretFieldName] ?? null)->toBe('')
			->and($editorJson[259][$secretFieldName] ?? null)->toBe('');
	} finally {
		if ($prevUser instanceof User && $prevUser->id > 0) {
			$users->setCurrentUser($prevUser);
		}
		if ($parentPage instanceof Page && $parentPage->id > 0) {
			try {
				$pages->delete($parentPage, true);
			} catch (\Throwable) {
			}
		}
		if ($tpl instanceof Template && $tpl->id > 0) {
			try {
				$templates->delete($tpl);
			} catch (\Throwable) {
			}
			$classesDir = rtrim((string) wire('config')->paths->classes, '/') . '/';
			$pascal = str_replace(' ', '', ucwords(str_replace(['-', '_'], ' ', (string) $tpl->name)));
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
		if ($secretField instanceof Field && $secretField->id > 0) {
			try {
				$fields->delete($secretField);
			} catch (\Throwable) {
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
	}
});
