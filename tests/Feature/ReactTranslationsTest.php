<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\HookEvent;
use ProcessWire\Inertia;
use ProcessWire\InputfieldTiptap;
use ProcessWire\Language;
use ProcessWire\LanguageParser;
use ProcessWire\LanguageTranslator;
use ProcessWire\MarkupReactTab;
use ProcessWire\React;
use ProcessWire\User;
use Totoglu\React\Inertia\InputfieldReact;
use Totoglu\React\Inertia\ProcessReact;
use Totoglu\React\Viewport\MarkupReactViewport;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

if (!class_exists('RwTestOrdersWorkspace', false)) {
	class RwTestOrdersWorkspace extends ProcessReact
	{
		public static function getModuleInfo(): array
		{
			return [
				'title' => 'Orders Workspace Fixture',
				'version' => 1,
			];
		}

		/**
		 * Plain `translations(): array` override returning nested groups.
		 *
		 * @return array<string, mixed>
		 */
		public function translations(): array
		{
			return [
				'orders' => [
					'title' => 'Orders',
					'empty' => 'No orders found.',
				],
				'actions.refund' => 'Issue Refund',
			];
		}

		public function renderOrdersPage(): array
		{
			return $this->inertiaRender('RwTestOrders/Index', [
				'totalOrders' => 12,
			])->toPageObject();
		}
	}
}

if (!class_exists('RwTestBillingWorkspace', false)) {
	class RwTestBillingWorkspace extends ProcessReact
	{
		public static function getModuleInfo(): array
		{
			return [
				'title' => 'Billing Workspace Fixture',
				'version' => 1,
			];
		}

		/**
		 * Hookable `___translations(): array` override.
		 *
		 * @return array<string, mixed>
		 */
		public function ___translations(): array
		{
			return [
				'invoices' => [
					'heading' => 'Invoices',
					'downloadPdf' => 'Download PDF',
				],
			];
		}

		public function renderBillingPage(): array
		{
			return $this->inertiaRender('RwTestBilling/Index', [
				'unpaidCount' => 3,
			])->toPageObject();
		}
	}
}

if (!class_exists('InputfieldRwColorPickerFixture', false)) {
	class InputfieldRwColorPickerFixture extends InputfieldReact
	{
		public function inertiaComponent(): string
		{
			return 'RwTest/ColorPicker';
		}

		/**
		 * @return array<string, mixed>
		 */
		public function translations(): array
		{
			return [
				'picker' => [
					'chooseColor' => 'Choose color',
					'hexPlaceholder' => '#000000',
				],
			];
		}
	}
}

beforeEach(function (): void {
	bootReactForTesting();
	$this->previousUser = wire('user');
	$superId = (int) (wire('config')->superUserPageID ?: 41);
	$superUser = wire('users')->get($superId);
	if ($superUser instanceof User && $superUser->id > 0) {
		$languages = wire('languages');
		if ($languages instanceof \ProcessWire\Languages) {
			$defaultLang = $languages->getDefault();
			if ($defaultLang instanceof Language) {
				$superUser->language = $defaultLang;
			}
		}
		wire('users')->setCurrentUser($superUser);
	}
	/** @var Inertia $inertia */
	$inertia = wire('modules')->get('Inertia');
	$inertia->request->resetFake();
	wire('config')->js('InertiaShared', []);
});

afterEach(function (): void {
	/** @var Inertia $inertia */
	$inertia = wire('modules')->get('Inertia');
	$inertia->request->resetFake();
	if (isset($this->previousUser) && $this->previousUser instanceof User && $this->previousUser->id > 0) {
		wire('users')->setCurrentUser($this->previousUser);
	}
});

test('core and InputfieldTiptap catalogs flatten cleanly and are discoverable by ProcessWire LanguageParser', function (): void {
	/** @var React $workspace */
	$workspace = wire('react');
	/** @var InputfieldTiptap $tiptap */
	$tiptap = wire('modules')->get('InputfieldTiptap');

	expect($workspace->translationNamespace())->toBe('core')
		->and($tiptap->translationNamespace())->toBe('InputfieldTiptap');

	$coreFlat = $workspace->resolveModuleTranslations($workspace);
	$tiptapFlat = $workspace->resolveModuleTranslations($tiptap);

	expect($coreFlat)->toHaveKey('common.save', 'Save')
		->and($coreFlat)->toHaveKey('presence.reloadLatest', 'Reload Latest')
		->and($coreFlat)->toHaveKey('presence.updatedBy', 'Updated by {user}')
		->and($tiptapFlat)->toHaveKey('tools.bold', 'Bold')
		->and($tiptapFlat)->toHaveKey('status.words', '{count} words')
		->and($tiptapFlat)->toHaveKey('editor.copyLanguage', 'Copy {language}');

	$languages = wire('languages');
	if ($languages && count($languages) > 0) {
		/** @var Language $defaultLanguage */
		$defaultLanguage = $languages->getDefault();
		require_once wire('config')->paths->modules . 'LanguageSupport/LanguageTranslator.php';
		require_once wire('config')->paths->modules . 'LanguageSupport/LanguageParser.php';

		$translator = new LanguageTranslator($defaultLanguage);
		wire($translator);

		$workspaceFile = dirname(__DIR__, 2) . '/React.module.php';
		$tiptapFile = dirname(__DIR__, 2) . '/InputfieldTiptap.module.php';

		$workspaceParser = new LanguageParser($translator, $workspaceFile);
		$workspacePhrases = array_values($workspaceParser->getUntranslated());

		$tiptapParser = new LanguageParser($translator, $tiptapFile);
		$tiptapPhrases = array_values($tiptapParser->getUntranslated());

		expect($workspacePhrases)->toContain('Save', 'Reload Latest', 'Updated by {user}', 'Select item...')
			->and($tiptapPhrases)->toContain('Bold', '{count} words', 'Copy {language}');
	}
});

test('ProcessReactWorkspace ships synchronized en, tr, de, fr, es, and ru LanguagePorter CSV packs and resolves all locales', function (): void {
	/** @var React $workspace */
	$workspace = wire('react');
	/** @var InputfieldTiptap $tiptap */
	$tiptap = wire('modules')->get('InputfieldTiptap');

	$languages = wire('languages');
	expect($languages)->not->toBeNull();

	/** @var Language $defaultLanguage */
	$defaultLanguage = $languages->getDefault();
	$exportedCsv = $defaultLanguage->porter->exportCsv([
		'source' => 'site/modules/React/',
		'scope' => 'all',
		'exportTo' => 'string',
	]);

	$parseCsv = static function (string $csvContent): array {
		$fp = fopen('php://temp', 'r+');
		fwrite($fp, $csvContent);
		rewind($fp);
		$header = fgetcsv($fp, 0, ',', '"', '\\');
		$rows = [];
		while (($row = fgetcsv($fp, 0, ',', '"', '\\')) !== false) {
			$rows[] = $row;
		}
		fclose($fp);

		return ['header' => $header, 'rows' => $rows];
	};

	$expected = $parseCsv($exportedCsv);
	expect(count($expected['rows']))->toBeGreaterThanOrEqual(400);

	$langDir = dirname(__DIR__, 2) . '/languages';
	foreach (['en', 'tr', 'de', 'fr', 'es', 'ru'] as $locale) {
		$csvFile = $langDir . '/' . $locale . '.csv';
		expect(is_file($csvFile))->toBeTrue("Missing {$locale}.csv");

		$parsed = $parseCsv((string) file_get_contents($csvFile));
		$expectedHeader = $locale === 'en'
			? ['default', 'en', 'description', 'file', 'hash']
			: ['en', $locale, 'description', 'file', 'hash'];

		expect($parsed['header'])->toBe($expectedHeader)
			->and(count($parsed['rows']))->toBe(count($expected['rows']));

		foreach ($expected['rows'] as $idx => $expRow) {
			$actualRow = $parsed['rows'][$idx];
			expect($actualRow[0])->toBe($expRow[0])
				->and(trim((string) $actualRow[1]))->not->toBe('')
				->and($actualRow[3])->toBe($expRow[3])
				->and($actualRow[4])->toBe($expRow[4]);

			if ($locale === 'en') {
				expect($actualRow[1])->toBe($expRow[0]);
			}

			if (preg_match_all('/\{[a-zA-Z0-9_]+\}/', (string) $expRow[0], $tokenMatches) > 0) {
				foreach ($tokenMatches[0] as $token) {
					expect((string) $actualRow[1])->toContain($token);
				}
			}
		}
	}

	// Verify runtime resolution across tr, de, fr, es, ru
	$origUserLang = wire('user')->get('language');
	$expectedSaveByLocale = [
		'tr' => 'Kaydet',
		'de' => 'Speichern',
		'fr' => 'Enregistrer',
		'es' => 'Guardar',
		'ru' => 'Сохранить',
	];
	$expectedBoldByLocale = [
		'tr' => 'Kalın',
		'de' => 'Fett',
		'fr' => 'Gras',
		'es' => 'Negrita',
		'ru' => 'Полужирный',
	];

	try {
		foreach ($expectedSaveByLocale as $locale => $expectedSave) {
			$fakeLang = new Language();
			wire($fakeLang);
			$fakeLang->id = 990000 + crc32($locale) % 1000;
			$fakeLang->name = $locale;
			wire('user')->set('language', $fakeLang);

			$coreLocalized = $workspace->resolveModuleTranslations($workspace);
			$tiptapLocalized = $workspace->resolveModuleTranslations($tiptap);

			expect($coreLocalized['common.save'])->toBe($expectedSave)
				->and($tiptapLocalized['tools.bold'])->toBe($expectedBoldByLocale[$locale]);
		}
	} finally {
		if ($origUserLang !== null) {
			wire('user')->set('language', $origUserLang);
		}
	}
});

test('___translations() hooks and plain translations() overrides resolve cleanly across module subclasses', function (): void {
	/** @var React $workspace */
	$workspace = wire('react');

	$ordersModule = new RwTestOrdersWorkspace();
	wire($ordersModule);
	$ordersModule->init();

	$billingModule = new RwTestBillingWorkspace();
	wire($billingModule);
	$billingModule->init();

	expect($ordersModule->translationNamespace())->toBe('RwTestOrdersWorkspace')
		->and($workspace->resolveModuleTranslations($ordersModule))->toBe([
			'orders.title' => 'Orders',
			'orders.empty' => 'No orders found.',
			'actions.refund' => 'Issue Refund',
		]);

	$pw = wire();
	$coreHookId = $pw->addHookAfter('React::translations', function (HookEvent $event): void {
		$catalog = is_array($event->return) ? $event->return : [];
		$catalog['common']['save'] = 'Kaydet';
		$catalog['custom'] = ['greeting' => 'Merhaba {name}'];
		$event->return = $catalog;
	});

	$billingHookId = $pw->addHookAfter('RwTestBillingWorkspace::translations', function (HookEvent $event): void {
		$catalog = is_array($event->return) ? $event->return : [];
		$catalog['invoices']['heading'] = 'Faturalar';
		$event->return = $catalog;
	});

	try {
		$mutatedCore = $workspace->resolveModuleTranslations($workspace);
		$mutatedBilling = $workspace->resolveModuleTranslations($billingModule);

		expect($mutatedCore['common.save'])->toBe('Kaydet')
			->and($mutatedCore['custom.greeting'])->toBe('Merhaba {name}')
			->and($mutatedBilling['invoices.heading'])->toBe('Faturalar')
			->and($mutatedBilling['invoices.downloadPdf'])->toBe('Download PDF');
	} finally {
		$pw->removeHook($coreHookId);
		$pw->removeHook($billingHookId);
	}
});

test('Inertia PageResponse emits locale-scoped OnceProp catalogs, skips cached namespaces on SPA visits, and invalidates on locale change', function (): void {
	/** @var Inertia $inertia */
	$inertia = wire('modules')->get('Inertia');
	/** @var React $workspace */
	$workspace = wire('react');
	$activeLocale = $workspace->resolveActiveLocale();

	$ordersModule = new RwTestOrdersWorkspace();
	wire($ordersModule);
	$ordersModule->init();

	$billingModule = new RwTestBillingWorkspace();
	wire($billingModule);
	$billingModule->init();

	// 1. Initial load on Orders workspace: delivers core, InputfieldTiptap, and RwTestOrdersWorkspace
	$initialPage = $ordersModule->renderOrdersPage();

	expect($initialPage['props']['i18nLocale'])->toBe($activeLocale)
		->and($initialPage['props']['i18n']['core']['common.save'])->toBe('Save')
		->and($initialPage['props']['i18n']['InputfieldTiptap']['tools.bold'])->toBe('Bold')
		->and($initialPage['props']['i18n']['RwTestOrdersWorkspace'])->toBe([
			'orders.title' => 'Orders',
			'orders.empty' => 'No orders found.',
			'actions.refund' => 'Issue Refund',
		])
		->and($initialPage['onceProps'])->toHaveKey("rw_i18n:{$activeLocale}:core")
		->and($initialPage['onceProps'])->toHaveKey("rw_i18n:{$activeLocale}:InputfieldTiptap")
		->and($initialPage['onceProps'])->toHaveKey("rw_i18n:{$activeLocale}:RwTestOrdersWorkspace");

	// 2. Subsequent X-Inertia SPA navigation to Billing workspace:
	// Client already has `core`, `InputfieldTiptap`, and `RwTestOrdersWorkspace` in memory.
	// Server MUST skip `core` and `InputfieldTiptap`, while delivering `RwTestBillingWorkspace`!
	$inertia->request->fake([
		'X-Inertia' => 'true',
		'X-Inertia-Except-Once-Props' => implode(',', [
			"rw_i18n:{$activeLocale}:core",
			"rw_i18n:{$activeLocale}:InputfieldTiptap",
			"rw_i18n:{$activeLocale}:RwTestOrdersWorkspace",
		]),
	]);

	$spaBillingPage = $billingModule->renderBillingPage();

	expect($spaBillingPage['props']['i18n'])->toHaveKey('RwTestBillingWorkspace')
		->and($spaBillingPage['props']['i18n'])->not->toHaveKey('core')
		->and($spaBillingPage['props']['i18n'])->not->toHaveKey('InputfieldTiptap')
		->and($spaBillingPage['props']['i18n']['RwTestBillingWorkspace']['invoices.heading'])->toBe('Invoices')
		->and($spaBillingPage['onceProps'])->toHaveKey("rw_i18n:{$activeLocale}:core")
		->and($spaBillingPage['onceProps'])->toHaveKey("rw_i18n:{$activeLocale}:RwTestBillingWorkspace");

	// 3. Locale switch simulation: client still sends old `en` keys in `X-Inertia-Except-Once-Props`,
	// but active locale changes to `tr` -> server invalidates and delivers fresh `tr` OnceProps!
	$pw = wire();
	$origUserLang = wire('user')->get('language');
	$fakeLang = new Language();
	wire($fakeLang);
	$fakeLang->id = 999888;
	$fakeLang->name = 'tr';
	wire('user')->set('language', $fakeLang);

	try {
		$inertia->request->fake([
			'X-Inertia' => 'true',
			'X-Inertia-Except-Once-Props' => 'rw_i18n:en:core,rw_i18n:en:InputfieldTiptap,rw_i18n:en:RwTestBillingWorkspace',
		]);

		$switchedLocalePage = $billingModule->renderBillingPage();
		expect($switchedLocalePage['props']['i18nLocale'])->toBe('tr')
			->and($switchedLocalePage['props']['i18n'])->toHaveKey('core')
			->and($switchedLocalePage['props']['i18n'])->toHaveKey('InputfieldTiptap')
			->and($switchedLocalePage['props']['i18n'])->toHaveKey('RwTestBillingWorkspace')
			->and($switchedLocalePage['onceProps'])->toHaveKey('rw_i18n:tr:core')
			->and($switchedLocalePage['onceProps'])->toHaveKey('rw_i18n:tr:RwTestBillingWorkspace');
	} finally {
		if ($origUserLang !== null) {
			wire('user')->set('language', $origUserLang);
		}
	}
});

test('classic ProcessWire islands merge multiple module translation namespaces into ProcessWire.config.InertiaShared without clobbering', function (): void {
	/** @var InputfieldTiptap $tiptap */
	$tiptap = wire('modules')->get('InputfieldTiptap');
	$tiptap->attr('name', 'body_copy');
	$tiptap->attr('id', 'Inputfield_body_copy');
	$tiptap->renderReady();
	$tiptapHtml = $tiptap->render();

	$picker = new InputfieldRwColorPickerFixture();
	wire($picker);
	$picker->attr('name', 'brand_color');
	$picker->attr('id', 'Inputfield_brand_color');
	$picker->renderReady();
	$pickerHtml = $picker->render();

	/** @var MarkupReactTab $tab */
	$tab = wire('modules')->get('MarkupReactTab');
	$tab->renderReady();

	/** @var React $workspace */
	$workspace = wire('react');
	$tableHtml = $workspace->renderTable([
		['id' => 1, 'title' => 'Sample'],
	]);

	expect($tiptapHtml)->toContain('data-inertia-island="InputfieldTiptap"')
		->and($pickerHtml)->toContain('data-inertia-island="RwTest/ColorPicker"')
		->and($tableHtml)->toContain('data-inertia-island=');

	$shared = wire('config')->js('InertiaShared');
	expect($shared)->toBeArray()
		->and($shared)->toHaveKey('i18nLocale')
		->and($shared)->toHaveKey('i18n.core')
		->and($shared)->toHaveKey('i18n.InputfieldTiptap')
		->and($shared)->toHaveKey('i18n.InputfieldRwColorPickerFixture')
		->and($shared['i18n.core']['common.save'])->toBe('Save')
		->and($shared['i18n.InputfieldTiptap']['tools.bold'])->toBe('Bold')
		->and($shared['i18n.InputfieldRwColorPickerFixture']['picker.chooseColor'])->toBe('Choose color');
});

test('anonymous ProcessReact and MarkupReactViewport subclasses sanitize translationNamespace without dot-notation corruption', function (): void {
	$anonProcess = new class extends ProcessReact {
		public function translations(): array
		{
			return [
				'panel.title' => 'Anonymous Panel',
			];
		}
	};
	wire($anonProcess);
	$anonProcess->init();

	$anonViewport = new class extends MarkupReactViewport {
		protected function viewportType(): string
		{
			return 'custom-grid';
		}

		protected function reactComponent(): string
		{
			return 'Anon/Grid';
		}

		public function translations(): array
		{
			return [
				'grid.empty' => 'Nothing here',
			];
		}
	};
	wire($anonViewport);

	expect($anonProcess->translationNamespace())->toBe('ProcessReact_Anonymous')
		->and($anonProcess->translationNamespace())->not->toContain('.')
		->and($anonViewport->translationNamespace())->toBe('MarkupReactViewport_Anonymous')
		->and($anonViewport->translationNamespace())->not->toContain('.');

	$pageObj = $anonProcess->inertiaRender('Anon/Page')->toPageObject();
	expect($pageObj['props']['i18n']['ProcessReact_Anonymous'])->toBe([
		'panel.title' => 'Anonymous Panel',
	]);
});
