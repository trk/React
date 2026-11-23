<?php // __(file-not-translatable)

declare(strict_types=1);

use ProcessWire\React;
use ProcessWire\WireException;
use ProcessWire\WireInputData;
use Totoglu\React\Data\ReactPageResult;
use Totoglu\React\Data\ReactRecord;
use Totoglu\React\Inertia\InputfieldReact;
use Totoglu\React\Inertia\ProcessReact;
use Totoglu\React\Provider\ArrayDataProvider;
use Totoglu\React\Provider\PagesDataProvider;
use Totoglu\React\Provider\ProviderRegistry;
use function ProcessWire\bootReactForTesting;
use function ProcessWire\wire;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
});

test('ReactRecord and ReactPageResult normalize values, status bitmasks, and pagination bounds cleanly', function (): void {
	$record = new ReactRecord(
		id: 'rec_1',
		title: 'Mediterranean Charter',
		name: 'mediterranean-charter',
		status: 1 | 16,
		statusVariant: 'success',
		statusLabel: 'Published',
		values: [
			'price' => 18500,
			'stage' => 'confirmed',
			'active' => true,
		],
		formatted: [
			'price' => '€18,500',
		],
		editUrl: '/admin/edit/rec_1',
		sort: 5,
		meta: [
			'stage' => 'confirmed',
			'startDate' => '2026-11-01',
			'endDate' => '2026-11-08',
		],
	);

	expect($record->id)->toBe('rec_1')
		->and($record->title)->toBe('Mediterranean Charter')
		->and($record->isLocked())->toBeTrue()
		->and($record->isDraft())->toBeFalse()
		->and($record->isTrash())->toBeFalse()
		->and($record->getValue('price'))->toBe(18500)
		->and($record->getDisplayValue('price'))->toBe('€18,500')
		->and($record->getDisplayValue('active'))->toBe('Yes')
		->and($record->getValue('title'))->toBe('Mediterranean Charter')
		->and($record->getValue('missing', 'fallback'))->toBe('fallback');

	$pageResult = new ReactPageResult(
		items: [$record],
		total: 45,
		pageNum: 2,
		limit: 20,
		trashCount: 3,
	);

	expect($pageResult->totalPages())->toBe(3)
		->and($pageResult->pageNum)->toBe(2)
		->and($pageResult->trashCount)->toBe(3);
});

test('ArrayDataProvider supports search, filtering, sorting, pagination, field updates, and bulk mutations', function (): void {
	$provider = new ArrayDataProvider(
		id: 'array:bookings',
		items: [
			[
				'id' => 'b_1',
				'title' => 'Bodrum Gulet Week',
				'status' => 1,
				'stage' => 'todo',
				'price' => 12000,
				'start_date' => '2026-11-05',
				'end_date' => '2026-11-12',
				'sort' => 1,
			],
			[
				'id' => 'b_2',
				'title' => 'Gocek Catamaran Escape',
				'status' => 2,
				'stage' => 'in_progress',
				'price' => 24000,
				'start_date' => '2026-11-10',
				'end_date' => '2026-11-17',
				'sort' => 2,
			],
			[
				'id' => 'b_3',
				'title' => 'Marmaris Superyacht Charter',
				'status' => 1,
				'stage' => 'in_progress',
				'price' => 65000,
				'start_date' => '2026-11-15',
				'end_date' => '2026-11-22',
				'sort' => 3,
			],
		],
		options: [
			'title' => 'Test Bookings',
			'columns' => ['title' => 'Title', 'price' => 'Price', 'status' => 'Status'],
		],
	);
	wire($provider);

	expect($provider->id())->toBe('array:bookings')
		->and($provider->title())->toBe('Test Bookings');

	$searchRes = $provider->query(['search' => 'Catamaran']);
	expect($searchRes->total)->toBe(1)
		->and($searchRes->items[0]->id)->toBe('b_2');

	$filteredRes = $provider->query([
		'fieldFilters' => ['stage' => 'in_progress'],
		'sortBy' => '-price',
	]);
	expect($filteredRes->total)->toBe(2)
		->and($filteredRes->items[0]->id)->toBe('b_3')
		->and($filteredRes->items[1]->id)->toBe('b_2');

	$draftRes = $provider->query(['statusFilter' => 'draft']);
	expect($draftRes->total)->toBe(1)
		->and($draftRes->items[0]->id)->toBe('b_2');

	expect($provider->mutate('update_field', ['b_1'], ['field' => 'stage', 'value' => 'done']))->toBe(1)
		->and($provider->mutate('publish', ['b_2']))->toBe(1);

	$afterPublish = $provider->query(['statusFilter' => 'published']);
	expect($afterPublish->total)->toBe(3);

	expect($provider->mutate('trash', ['b_3']))->toBe(1)
		->and($provider->query(['statusFilter' => 'trash'])->total)->toBe(1)
		->and($provider->mutate('delete', ['b_3']))->toBe(1)
		->and($provider->query(['statusFilter' => 'trash'])->total)->toBe(0);
});

test('ProviderRegistry resolves built-in pages and array adapters, supports custom factories, and rejects unregistered or bare schemes', function (): void {
	$registry = new ProviderRegistry();
	wire($registry);

	expect($registry)->toBeInstanceOf(ProviderRegistry::class)
		->and($registry->has('pages:id=1'))->toBeTrue()
		->and($registry->has('array:demo'))->toBeTrue()
		->and($registry->has('bare_descriptor'))->toBeFalse()
		->and($registry->has('unregistered:target'))->toBeFalse()
		->and($registry->resolve('pages:id=1'))->toBeInstanceOf(PagesDataProvider::class)
		->and($registry->resolve([['id' => '1', 'title' => 'Inline Row']]))->toBeInstanceOf(ArrayDataProvider::class);

	expect(fn () => $registry->resolve('bare_descriptor'))->toThrow(WireException::class)
		->and(fn () => $registry->resolve('unregistered:target'))->toThrow(WireException::class);

	$registry->registerFactory('custom', fn (string $target, array $options) => new ArrayDataProvider('custom:' . $target, [], $options));
	expect($registry->has('custom:items'))->toBeTrue()
		->and($registry->resolve('custom:items', ['title' => 'Custom Set'])->title())->toBe('Custom Set');

	$workspace = React::instance();
	$pagesProvider = $workspace->provider('pages:id=1');
	expect($pagesProvider->columns())->toHaveKey('title')
		->and($pagesProvider->isLocked())->toBeFalse();
	$pagesResult = $pagesProvider->query(['limit' => 5]);
	expect($pagesResult->total)->toBeGreaterThanOrEqual(1)
		->and($pagesResult->items[0]->id)->toBe('1');
});

test('InputfieldReact and ProcessReact extend Inertia base classes and automatically provide ReactInertia.js/css assets', function (): void {
	$inputfield = new class extends InputfieldReact {
		public function inertiaComponent(): string
		{
			return 'ReactWorkspace/KeyValue';
		}

		public function getModuleScriptAssets(): array
		{
			return ['/site/modules/Custom/CustomField.js'];
		}
	};
	wire($inputfield);
	$inputfield->attr('name', 'meta_tags');
	$inputfield->label = 'Meta Tags';
	$inputfield->val(['region' => 'aegean']);

	$prop = $inputfield->toInertiaProp();
	expect($prop['component'])->toBe('ReactWorkspace/KeyValue')
		->and($prop['name'])->toBe('meta_tags')
		->and($prop['value'])->toBe(['region' => 'aegean']);

	$viewData = $inputfield->inertiaViewData();
	expect($viewData['scripts'])->toBeArray()
		->and(implode(' ', $viewData['scripts']))->toContain('ReactInertia.js')
		->and(implode(' ', $viewData['scripts']))->toContain('/site/modules/Custom/CustomField.js')
		->and(implode(' ', $viewData['styles']))->toContain('ReactInertia.css');

	$html = $inputfield->render();
	expect($html)->toContain('<input type="hidden"')
		->and($html)->toContain('data-inertia-island="ReactWorkspace/KeyValue"');

	$rawPost = ['meta_tags' => '{"region":"marmaris"}'];
	$post = new WireInputData($rawPost);
	$inputfield->processInput($post);
	expect($inputfield->val())->toBe(['region' => 'marmaris'])
		->and($inputfield->isChanged('value'))->toBeTrue();

	expect(is_subclass_of(ProcessReact::class, \Totoglu\Inertia\ProcessInertia::class))->toBeTrue();
});

test('modular dist bundles exist within strict size budgets and isolate CSS/JS per companion submodule', function (): void {
	$moduleDir = dirname(__DIR__, 2);
	$cssFile = $moduleDir . '/dist/ReactInertia.css';
	$mediaCssFile = $moduleDir . '/dist/ReactMedia.css';
	$jsFile = $moduleDir . '/dist/ReactInertia.js';
	$layoutFile = $moduleDir . '/dist/ReactLayout.js';
	$viewportsFile = $moduleDir . '/dist/ReactViewports.js';
	$tableFile = $moduleDir . '/dist/MarkupReactTable.js';
	$cardsFile = $moduleDir . '/dist/MarkupReactCards.js';
	$schemaFormFile = $moduleDir . '/dist/SchemaForm.js';
	$tabFile = $moduleDir . '/dist/MarkupReactTab.js';
	$kvFile = $moduleDir . '/dist/InputfieldReactKeyValue.js';
	$iconFieldFile = $moduleDir . '/dist/InputfieldReactIcon.js';
	$linkFile = $moduleDir . '/dist/InputfieldReactLink.js';
	$mediaJsFile = $moduleDir . '/dist/ReactMedia.js';
	$fileFieldFile = $moduleDir . '/dist/InputfieldReactFile.js';
	$imageFieldFile = $moduleDir . '/dist/InputfieldReactImage.js';
	$relationFile = $moduleDir . '/dist/InputfieldReactRelation.js';
	$launcherFile = $moduleDir . '/dist/ProcessReactWorkspace.js';
	$iconsCatalogFile = $moduleDir . '/dist/ReactIcons.js';
	$tiptapCssFile = $moduleDir . '/dist/TiptapCore.css';
	$tiptapCoreFile = $moduleDir . '/dist/TiptapCore.js';
	$tiptapEditorFile = $moduleDir . '/dist/TiptapEditor.js';
	$tiptapCanvasFile = $moduleDir . '/dist/TiptapCanvas.js';
	$tiptapBlocksFile = $moduleDir . '/dist/TiptapBlocks.js';
	$tiptapDialogsFile = $moduleDir . '/dist/TiptapDialogs.js';
	$gridFile = $moduleDir . '/dist/ReactGrid.js';
	$dndFile = $moduleDir . '/dist/ReactDnd.js';
	$calendarFile = $moduleDir . '/dist/ReactCalendar.js';
	$calendarCssFile = $moduleDir . '/dist/ReactCalendar.css';
	$extraFieldsFile = $moduleDir . '/dist/ReactExtraFields.js';
	$legacyMonolithTiptap = $moduleDir . '/dist/InputfieldTiptap.js';
	$sharedChunks = glob($moduleDir . '/dist/ReactInertia-*.js') ?: [];
	$styleJsLeftovers = glob($moduleDir . '/dist/*.style.js') ?: [];

	expect(is_file($cssFile))->toBeTrue()
		->and(is_file($mediaCssFile))->toBeTrue()
		->and(is_file($jsFile))->toBeTrue()
		->and(is_file($layoutFile))->toBeTrue()
		->and(is_file($viewportsFile))->toBeTrue()
		->and(is_file($tableFile))->toBeTrue()
		->and(is_file($cardsFile))->toBeTrue()
		->and(is_file($schemaFormFile))->toBeTrue()
		->and(is_file($tabFile))->toBeTrue()
		->and(is_file($kvFile))->toBeTrue()
		->and(is_file($iconFieldFile))->toBeTrue()
		->and(is_file($linkFile))->toBeTrue()
		->and(is_file($mediaJsFile))->toBeTrue()
		->and(is_file($fileFieldFile))->toBeTrue()
		->and(is_file($imageFieldFile))->toBeTrue()
		->and(is_file($relationFile))->toBeTrue()
		->and(is_file($launcherFile))->toBeTrue()
		->and(is_file($iconsCatalogFile))->toBeTrue()
		->and(is_file($legacyMonolithTiptap))->toBeFalse()
		->and($sharedChunks)->toBe([])
		->and($styleJsLeftovers)->toBe([])
		->and(is_file($tiptapCssFile))->toBeTrue()
		->and(is_file($tiptapCoreFile))->toBeTrue()
		->and(is_file($tiptapEditorFile))->toBeTrue()
		->and(is_file($tiptapCanvasFile))->toBeTrue()
		->and(is_file($tiptapBlocksFile))->toBeTrue()
		->and(is_file($tiptapDialogsFile))->toBeTrue()
		->and(is_file($gridFile))->toBeTrue()
		->and(is_file($dndFile))->toBeTrue()
		->and(is_file($calendarFile))->toBeTrue()
		->and(is_file($calendarCssFile))->toBeTrue()
		->and(is_file($extraFieldsFile))->toBeTrue()
		->and((int) filesize($jsFile))->toBeLessThan(700_000)
		->and((int) filesize($schemaFormFile))->toBeLessThan(200_000)
		->and((int) filesize($extraFieldsFile))->toBeLessThan(120_000)
		->and((int) filesize($tiptapCoreFile))->toBeLessThan(560_000)
		->and((int) filesize($gridFile))->toBeLessThan(160_000)
		->and((int) filesize($dndFile))->toBeLessThan(120_000)
		->and((int) filesize($calendarFile))->toBeLessThan(160_000)
		->and((int) filesize($calendarCssFile))->toBeLessThan(12_000);

	$cssContents = (string) file_get_contents($cssFile);
	$mediaCssContents = (string) file_get_contents($mediaCssFile);
	$calendarCssContents = (string) file_get_contents($calendarCssFile);
	$baseLayerPos = strpos($cssContents, '@layer base{');
	$mainColorPos = strpos($cssContents, '--pw-main-color:#eb1d61');
	$draggingRulePos = strpos($cssContents, 'html[data-rw-dragging]');
	expect($cssContents)->toContain('--pw-main-color')
		->and($cssContents)->toContain('--background')
		->and($cssContents)->toContain('--foreground')
		->and($cssContents)->toContain('--primary')
		->and($cssContents)->toContain('--input-surface:var(--pw-inputs-background)')
		->and($cssContents)->toContain('--button-bg:var(--pw-button-background)')
		->and($cssContents)->toContain('--button-hover-bg:var(--pw-button-hover-background)')
		->and($cssContents)->toContain('--radius-button:var(--pw-button-radius')
		->and($cssContents)->toContain('--masthead:var(--pw-masthead-background')
		->and($cssContents)->toContain('#_rw_shield')
		->and($cssContents)->toContain('pw-use-input-focus')
		->and($cssContents)->toContain('data-rw-prose-root')
		->and($cssContents)->toContain('data-rw-table')
		->and($cssContents)->not->toContain('.ProseMirror')
		->and($cssContents)->not->toContain('data-rw-tiptap-toolbar')
		->and($cssContents)->not->toContain('data-rw-viewport-table')
		->and($cssContents)->not->toContain('data-rw-inspector-sheet')
		->and($cssContents)->not->toContain('data-rw-crop-stage')
		->and($cssContents)->not->toContain('data-rw-media-card')
		->and($cssContents)->not->toContain('data-rw-media-row')
		->and($cssContents)->not->toContain('data-rw-tiptap-dialog')
		->and($cssContents)->not->toContain('data-rw-calendar')
		->and($calendarCssContents)->toContain('data-rw-calendar')
		->and($calendarCssContents)->toContain('rdp-day_button')
		->and($mediaCssContents)->toContain('data-rw-inspector-sheet')
		->and($mediaCssContents)->toContain('data-rw-crop-stage')
		->and($mediaCssContents)->toContain('data-rw-media-card')
		->and($mediaCssContents)->toContain('data-rw-media-row')
		->and($baseLayerPos)->toBeInt()
		->and($mainColorPos)->toBeInt()
		->and($draggingRulePos)->toBeInt()
		->and($mainColorPos)->toBeGreaterThan($baseLayerPos)
		->and($mainColorPos)->toBeLessThan($draggingRulePos);

	$jsContents = (string) file_get_contents($jsFile);
	$layoutContents = (string) file_get_contents($layoutFile);
	$viewportsContents = (string) file_get_contents($viewportsFile);
	$tableContents = (string) file_get_contents($tableFile);
	$cardsContents = (string) file_get_contents($cardsFile);
	$schemaFormContents = (string) file_get_contents($schemaFormFile);
	$tabContents = (string) file_get_contents($tabFile);
	$kvContents = (string) file_get_contents($kvFile);
	$iconFieldContents = (string) file_get_contents($iconFieldFile);
	$linkContents = (string) file_get_contents($linkFile);
	$mediaJsContents = (string) file_get_contents($mediaJsFile);
	$fileFieldContents = (string) file_get_contents($fileFieldFile);
	$imageFieldContents = (string) file_get_contents($imageFieldFile);
	$relationContents = (string) file_get_contents($relationFile);
	$launcherContents = (string) file_get_contents($launcherFile);
	$tiptapCoreContents = (string) file_get_contents($tiptapCoreFile);
	expect($jsContents)->toContain('ReactWorkspaceRuntime')
		->and($jsContents)->toContain('var(--button-bg)')
		->and($jsContents)->toContain('var(--radius-button)')
		->and($jsContents)->toContain('set_theme_mode')
		->and($jsContents)->toContain('set_theme_preset')
		->and($jsContents)->toContain('PortalRoot')
		->and($jsContents)->toContain('fetchGatewayJson')
		->and($jsContents)->toContain('useTheme')
		->and($jsContents)->toContain('useEditPresence')
		->and($jsContents)->toContain('evaluateShowIfCondition')
		->and($jsContents)->toContain('navigateTablistByKey')
		->and($jsContents)->not->toContain('PresenceHookFiberBridge')
		->and($jsContents)->not->toContain('new Function')
		->and($layoutContents)->toContain('data-rw-user-menu-trigger')
		->and($layoutContents)->toContain('data-rw-theme-mode-option')
		->and($layoutContents)->toContain('data-rw-theme-preset-option')
		->and($layoutContents)->toContain('data-rw-shortcuts-dialog')
		->and($layoutContents)->toContain('useKeyboardShortcuts')
		->and($layoutContents)->toContain('useTheme')
		->and($jsContents)->toContain('ReactLayout.js')
		->and($jsContents)->toContain('ReactViewports.js')
		->and($jsContents)->toContain('MarkupReactTable.js')
		->and($jsContents)->toContain('MarkupReactCards.js')
		->and($jsContents)->toContain('SchemaForm.js')
		->and($jsContents)->toContain('MarkupReactTab.js')
		->and($jsContents)->toContain('InputfieldReactKeyValue.js')
		->and($jsContents)->toContain('InputfieldReactIcon.js')
		->and($jsContents)->toContain('InputfieldReactLink.js')
		->and($jsContents)->toContain('ReactMedia.js')
		->and($jsContents)->toContain('ReactMedia.css')
		->and($jsContents)->toContain('InputfieldReactFile.js')
		->and($jsContents)->toContain('InputfieldReactImage.js')
		->and($jsContents)->toContain('InputfieldReactRelation.js')
		->and($jsContents)->toContain('TiptapCore.js')
		->and($jsContents)->toContain('TiptapCore.css')
		->and($jsContents)->toContain('ReactGrid.js')
		->and($jsContents)->toContain('ReactDnd.js')
		->and($jsContents)->toContain('ReactCalendar.js')
		->and($jsContents)->toContain('ReactCalendar.css')
		->and($jsContents)->not->toContain('useVirtualizer')
		->and($jsContents)->not->toContain('DndContext')
		->and($jsContents)->not->toContain('DayPicker')
		->and($jsContents)->not->toContain('TiptapEditor.js')
		->and($jsContents)->not->toContain('TiptapCanvas.js')
		->and($jsContents)->not->toContain('TiptapBlocks.js')
		->and($jsContents)->not->toContain('TiptapDialogs.js')
		->and($jsContents)->not->toContain('hilitecolor')
		->and($jsContents)->not->toContain('data-tiptap-block')
		->and($jsContents)->not->toContain('blockHandles')
		->and($jsContents)->not->toContain('miniBlocks')
		->and($jsContents)->not->toContain('ProcessReactWorkspace.js')
		->and($jsContents)->not->toContain('WorkspaceLauncher')
		->and($jsContents)->toContain('sanitizeHref')
		->and($jsContents)->not->toContain('__registerViewportMode')
		->and($layoutContents)->toContain('__provideLayout')
		->and($layoutContents)->toContain('__provideInertiaAdapter')
		->and($viewportsContents)->toContain('__provideViewports')
		->and($viewportsContents)->not->toContain('data-rw-viewport-table')
		->and($tableContents)->toContain('data-rw-viewport-table')
		->and($tableContents)->toContain('__provideViewportCanvas')
		->and($cardsContents)->toContain('__provideViewportCanvas')
		->and($cardsContents)->not->toContain('data-rw-viewport-table')
		->and($schemaFormContents)->toContain('__provideFields')
		->and($schemaFormContents)->toContain('useSchemaFormContext')
		->and($schemaFormContents)->toContain('validateSchemaTree')
		->and($schemaFormContents)->not->toContain('AssetInspectorSheet')
		->and($schemaFormContents)->not->toContain('data-rw-kv-row')
		->and($schemaFormContents)->not->toContain('data-rw-icon-popover')
		->and($schemaFormContents)->not->toContain('data-rw-media-card')
		->and($schemaFormContents)->not->toContain('data-rw-relation-control')
		->and($schemaFormContents)->not->toContain('ProseMirror')
		->and($schemaFormContents)->not->toContain('blockHandles')
		->and($schemaFormContents)->not->toContain('TiptapEditor.js')
		->and($schemaFormContents)->not->toContain('useFormContext')
		->and($schemaFormContents)->not->toContain('new Function')
		->and($tabContents)->toContain('__provideFieldControl')
		->and($kvContents)->toContain('__provideFieldControl')
		->and($iconFieldContents)->toContain('__provideFieldControl')
		->and($linkContents)->toContain('__provideFieldControl')
		->and($linkContents)->not->toContain('data-rw-crop-stage')
		->and($mediaJsContents)->toContain('ReactMediaRuntime')
		->and($mediaJsContents)->toContain('data-rw-crop-stage')
		->and($fileFieldContents)->toContain('ReactMediaRuntime')
		->and($fileFieldContents)->not->toContain('data-rw-crop-stage')
		->and($imageFieldContents)->toContain('ReactMediaRuntime')
		->and($imageFieldContents)->not->toContain('data-rw-crop-stage')
		->and($relationContents)->toContain('__provideFieldControl')
		->and($tiptapCoreContents)->toContain('ReactWorkspace/Tiptap')
		->and($tiptapCoreContents)->toContain('ReactTiptapRuntime')
		->and($tiptapCoreContents)->toContain('TiptapEditor.js')
		->and($tiptapCoreContents)->toContain('TiptapCanvas.js')
		->and($tiptapCoreContents)->toContain('TiptapBlocks.js')
		->and($tiptapCoreContents)->toContain('TiptapDialogs.js')
		->and($tiptapCoreContents)->toContain('ensureBundles')
		->and($launcherContents)->toContain('ReactWorkspace/WorkspaceLauncher')
		->and($jsContents)->toContain('ReactWorkspace/Table')
		->and($jsContents)->toContain('ReactWorkspace/Cards')
		->and($jsContents)->toContain('ReactWorkspace/SchemaForm');
});

test('every React companion submodule declares strictly isolated script and style assets', function (): void {
	$modules = wire('modules');

	$tableMod = $modules->get('MarkupReactTable');
	$tableScripts = implode("\n", $tableMod->getModuleScriptAssets());
	expect($tableScripts)->toContain('ReactViewports.js')
		->and($tableScripts)->toContain('MarkupReactTable.js')
		->and($tableScripts)->not->toContain('MarkupReactCards.js')
		->and($tableScripts)->not->toContain('SchemaForm.js');

	$cardsMod = $modules->get('MarkupReactCards');
	$cardsScripts = implode("\n", $cardsMod->getModuleScriptAssets());
	expect($cardsScripts)->toContain('ReactViewports.js')
		->and($cardsScripts)->toContain('MarkupReactCards.js')
		->and($cardsScripts)->not->toContain('MarkupReactTable.js')
		->and($cardsScripts)->not->toContain('SchemaForm.js');

	$tabMod = $modules->get('MarkupReactTab');
	expect(implode("\n", $tabMod->getModuleScriptAssets()))->toContain('MarkupReactTab.js')
		->and(implode("\n", $tabMod->getModuleScriptAssets()))->not->toContain('SchemaForm.js');

	$kvMod = $modules->get('InputfieldReactKeyValue');
	expect(implode("\n", $kvMod->getModuleScriptAssets()))->toContain('InputfieldReactKeyValue.js')
		->and(implode("\n", $kvMod->getModuleScriptAssets()))->not->toContain('SchemaForm.js');

	$iconMod = $modules->get('InputfieldReactIcon');
	$iconScripts = implode("\n", $iconMod->getModuleScriptAssets());
	expect($iconScripts)->toContain('InputfieldReactIcon.js')
		->and($iconScripts)->toContain('ReactIcons.js')
		->and($iconScripts)->not->toContain('SchemaForm.js');

	$linkUrlOnly = $modules->get('InputfieldReactLink');
	$linkUrlOnly->set('linkTypes', ['page', 'url', 'email']);
	expect(implode("\n", $linkUrlOnly->getModuleScriptAssets()))->toContain('InputfieldReactLink.js')
		->and(implode("\n", $linkUrlOnly->getModuleScriptAssets()))->not->toContain('SchemaForm.js')
		->and($linkUrlOnly->getModuleStyleAssets())->toBe([]);

	$linkWithMedia = $modules->get('InputfieldReactLink');
	$linkWithMedia->set('linkTypes', ['page', 'image']);
	expect(implode("\n", $linkWithMedia->getModuleStyleAssets()))->toContain('ReactMedia.css');

	$fileMod = $modules->get('InputfieldReactFile');
	$fileScripts = $fileMod->getModuleScriptAssets();
	expect($fileScripts)->toHaveCount(2)
		->and($fileScripts[0])->toContain('ReactMedia.js')
		->and($fileScripts[1])->toContain('InputfieldReactFile.js')
		->and(implode("\n", $fileMod->getModuleStyleAssets()))->toContain('ReactMedia.css');

	$imageMod = $modules->get('InputfieldReactImage');
	$imageScripts = $imageMod->getModuleScriptAssets();
	expect($imageScripts)->toHaveCount(2)
		->and($imageScripts[0])->toContain('ReactMedia.js')
		->and($imageScripts[1])->toContain('InputfieldReactImage.js')
		->and(implode("\n", $imageMod->getModuleStyleAssets()))->toContain('ReactMedia.css');

	foreach (['InputfieldReactM2O', 'InputfieldReactM2M', 'InputfieldReactO2M', 'InputfieldReactM2A'] as $relClass) {
		$relMod = $modules->get($relClass);
		$relScripts = implode("\n", $relMod->getModuleScriptAssets());
		expect($relScripts)->toContain('InputfieldReactRelation.js')
			->and($relScripts)->not->toContain('SchemaForm.js');
	}
});

test('FormSchemaSerializer serializes InputfieldForm trees and declarative field definitions into SchemaForm payloads while preserving native processInput', function (): void {
	$workspace = React::instance();
	$modules = wire()->modules;

	/** @var \ProcessWire\InputfieldForm $form */
	$form = $modules->get('InputfieldForm');
	$form->attr('id+name', 'vessel_editor_form');
	$form->attr('action', './?id=42');
	$form->attr('method', 'post');

	/** @var \ProcessWire\InputfieldWrapper $generalTab */
	$generalTab = new \ProcessWire\InputfieldWrapper();
	$generalTab->set('wire($this)', wire());
	$generalTab->attr('id+name', 'tab_general');
	$generalTab->attr('title', 'General');
	$generalTab->addClass('WireTab');

	/** @var \ProcessWire\InputfieldText $text */
	$text = $modules->get('InputfieldText');
	$text->attr('id+name', 'vessel_name');
	$text->label = 'Vessel Name';
	$text->required = true;
	$text->columnWidth = 50;
	$text->val('M/Y Serenity');
	$text->set('showCount', 1);
	$text->attr('maxlength', 60);
	$text->attr('data-rw-affix-prefix', 'Yacht:');
	$generalTab->add($text);

	/** @var \ProcessWire\InputfieldText $slug */
	$slug = $modules->get('InputfieldText');
	$slug->attr('id+name', 'vessel_slug');
	$slug->label = 'Slug';
	$slug->columnWidth = 50;
	$slug->attr('data-rw-slug-source', 'vessel_name');
	$slug->val('my-serenity');
	$generalTab->add($slug);

	/** @var \ProcessWire\InputfieldToggle $toggle */
	$toggle = $modules->get('InputfieldToggle');
	$toggle->attr('id+name', 'is_charter_ready');
	$toggle->label = 'Charter Ready';
	$toggle->val(1);
	$generalTab->add($toggle);

	/** @var \ProcessWire\InputfieldReactKeyValue $kv */
	$kv = $modules->get('InputfieldReactKeyValue');
	$kv->attr('id+name', 'specs');
	$kv->label = 'Specifications';
	$kv->val(['Builder' => 'Sanlorenzo']);
	$generalTab->add($kv);

	/** @var \ProcessWire\InputfieldFile $fileField */
	$fileField = $modules->get('InputfieldFile');
	$fileField->attr('id+name', 'brochure_pdf');
	$fileField->label = 'Brochure PDF';
	$fileField->set('extensions', 'pdf zip');
	$fileField->set('maxFiles', 1);
	$generalTab->add($fileField);

	/** @var \ProcessWire\InputfieldImage $imageField */
	$imageField = $modules->get('InputfieldImage');
	$imageField->attr('id+name', 'gallery_photos');
	$imageField->label = 'Gallery Photos';
	$imageField->set('extensions', 'jpg png webp');
	$imageField->set('maxFiles', 5);
	$generalTab->add($imageField);

	$form->add($generalTab);

	/** @var \ProcessWire\InputfieldSubmit $submit */
	$submit = $modules->get('InputfieldSubmit');
	$submit->attr('id+name', 'submit_save');
	$submit->val('Save Record');
	$submit->showInHeader(true);
	$submit->addActionValue('save_and_exit', 'Save + Exit', 'sign-out');
	$form->add($submit);

	$schema = $workspace->serializeForm($form, [
		'errors' => ['vessel_slug' => 'Slug must be unique.'],
	]);

	expect($schema['id'])->toBe('vessel_editor_form')
		->and($schema['encType'])->toBe('multipart/form-data')
		->and($schema['tabs'])->toHaveCount(1)
		->and($schema['tabs'][0]['label'])->toBe('General')
		->and($schema['tabs'][0]['fields'])->toHaveCount(6)
		->and($schema['tabs'][0]['fields'][0]['type'])->toBe('text')
		->and($schema['tabs'][0]['fields'][0]['pattern'])->toBeNull()
		->and($schema['tabs'][0]['fields'][0]['charCount'])->toBeTrue()
		->and($schema['tabs'][0]['fields'][0]['prefix'])->toBe('Yacht:')
		->and($schema['tabs'][0]['fields'][0]['width'])->toBe(50)
		->and($schema['tabs'][0]['fields'][1]['type'])->toBe('text')
		->and($schema['tabs'][0]['fields'][1]['slugFrom'])->toBe('vessel_name')
		->and($schema['tabs'][0]['fields'][1]['error'])->toBe('Slug must be unique.')
		->and($schema['tabs'][0]['fields'][2]['type'])->toBe('toggle')
		->and($schema['tabs'][0]['fields'][3]['kind'])->toBe('control')
		->and($schema['tabs'][0]['fields'][3]['type'])->toBe('keyvalue')
		->and($schema['tabs'][0]['fields'][3]['value'])->toBe(['Builder' => 'Sanlorenzo'])
		->and($schema['tabs'][0]['fields'][4]['kind'])->toBe('control')
		->and($schema['tabs'][0]['fields'][4]['type'])->toBe('file')
		->and($schema['tabs'][0]['fields'][4]['extensions'])->toBe(['pdf', 'zip'])
		->and($schema['tabs'][0]['fields'][4]['accept'])->toBe('.pdf,.zip')
		->and($schema['tabs'][0]['fields'][4]['multiple'])->toBeFalse()
		->and($schema['tabs'][0]['fields'][5]['kind'])->toBe('control')
		->and($schema['tabs'][0]['fields'][5]['type'])->toBe('image')
		->and($schema['tabs'][0]['fields'][5]['isImage'])->toBeTrue()
		->and($schema['tabs'][0]['fields'][5]['extensions'])->toBe(['jpg', 'png', 'webp'])
		->and($schema['tabs'][0]['fields'][5]['maxFiles'])->toBe(5)
		->and($schema['tabs'][0]['fields'][5]['multiple'])->toBeTrue()
		->and($schema['submits'])->toHaveCount(1)
		->and($schema['submits'][0]['header'])->toBeTrue()
		->and($schema['submits'][0]['actions'][0]['value'])->toBe('save_and_exit');

	// Native processInput() remains 100% handled by Inputfield classes
	$rawInput = ['vessel_name' => 'S/Y Albatross'];
	$text->processInput(new WireInputData($rawInput));
	expect($text->val())->toBe('S/Y Albatross');

	// Declarative field definitions serialize cleanly for structured form schemas
	$declarativeSchema = $workspace->serializeFormDefinitions([
		[
			'name' => 'guest_count',
			'type' => 'number',
			'label' => 'Guests',
			'width' => 50,
			'defaultValue' => 8,
		],
		[
			'name' => 'charter_rating',
			'type' => 'rating',
			'label' => 'Rating',
			'width' => 50,
			'maxStars' => 5,
		],
		[
			'name' => 'total_estimate',
			'type' => 'calculation',
			'label' => 'Total Estimate',
			'formula' => '{guest_count} * 250',
			'showIf' => 'guest_count>0',
		],
		[
			'name' => 'crew_list',
			'type' => 'repeater',
			'label' => 'Crew Members',
			'subfields' => [
				['name' => 'full_name', 'type' => 'text', 'label' => 'Full Name'],
				['name' => 'role', 'type' => 'text', 'label' => 'Role'],
			],
		],
	], [
		'id' => 'charter_inquiry_form',
		'submitLabel' => 'Send Inquiry',
	]);

	expect($declarativeSchema['id'])->toBe('charter_inquiry_form')
		->and($declarativeSchema['fields'])->toHaveCount(4)
		->and($declarativeSchema['fields'][1]['type'])->toBe('rating')
		->and($declarativeSchema['fields'][2]['type'])->toBe('calculation')
		->and($declarativeSchema['fields'][2]['formula'])->toBe('{guest_count} * 250')
		->and($declarativeSchema['fields'][3]['type'])->toBe('repeater')
		->and($declarativeSchema['submits'][0]['label'])->toBe('Send Inquiry');

	$dateSchema = $workspace->serializeFormDefinitions([
		[
			'name' => 'event_date',
			'type' => 'date',
			'label' => 'Event Date',
			'defaultValue' => '2026-11-21',
		],
		[
			'name' => 'start_time',
			'type' => 'time',
			'label' => 'Start Time',
			'hourFormat' => '12h',
			'minuteStep' => 15,
			'showSeconds' => true,
		],
		[
			'name' => 'publish_at',
			'type' => 'datetime',
			'label' => 'Publish At',
			'timezone' => 'Europe/Istanbul',
			'datetimeMode' => 'picker',
		],
		[
			'name' => 'charter_dates',
			'type' => 'date_range',
			'label' => 'Charter Window',
			'defaultValue' => '2026-11-15..2026-11-22',
			'presets' => true,
			'numberOfMonths' => 2,
		],
	], [
		'id' => 'schedule_form',
	]);

	expect($dateSchema['fields'])->toHaveCount(4)
		->and($dateSchema['fields'][0]['type'])->toBe('date')
		->and($dateSchema['fields'][0]['inputType'])->toBe('date')
		->and($dateSchema['fields'][1]['type'])->toBe('time')
		->and($dateSchema['fields'][1]['inputType'])->toBe('time')
		->and($dateSchema['fields'][1]['hourFormat'])->toBe('12h')
		->and($dateSchema['fields'][1]['minuteStep'])->toBe(15)
		->and($dateSchema['fields'][1]['showSeconds'])->toBeTrue()
		->and($dateSchema['fields'][2]['type'])->toBe('datetime')
		->and($dateSchema['fields'][2]['inputType'])->toBe('datetime-local')
		->and($dateSchema['fields'][2]['timezone'])->toBe('Europe/Istanbul')
		->and($dateSchema['fields'][2]['datetimeMode'])->toBe('picker')
		->and($dateSchema['fields'][3]['type'])->toBe('daterange')
		->and($dateSchema['fields'][3]['value'])->toBe(['from' => '2026-11-15', 'to' => '2026-11-22'])
		->and($dateSchema['fields'][3]['presets'])->toBeTrue()
		->and($dateSchema['fields'][3]['numberOfMonths'])->toBe(2);

	$extraSchema = $workspace->serializeFormDefinitions([
		[
			'name' => 'accent_color',
			'type' => 'color',
			'label' => 'Accent Color',
			'allowAlpha' => true,
			'swatches' => ['#eb1d61', '#3b82f6'],
			'defaultValue' => '#eb1d61',
		],
		[
			'name' => 'topic_tags',
			'type' => 'tags',
			'label' => 'Topics',
			'suggestions' => ['editorial', 'seo'],
			'defaultValue' => 'editorial, mobile',
		],
		[
			'name' => 'template_kind',
			'type' => 'combobox',
			'label' => 'Template',
			'clearable' => true,
			'options' => [
				['value' => 'article', 'label' => 'Article', 'icon' => 'file-text', 'description' => 'Longform post'],
			],
		],
		[
			'name' => 'base_price',
			'type' => 'currency',
			'label' => 'Price',
			'currency' => 'EUR',
			'defaultValue' => 1250,
		],
		[
			'name' => 'layout_mode',
			'type' => 'segmented',
			'label' => 'Layout',
			'fullWidth' => true,
			'options' => [
				['value' => 'grid', 'label' => 'Grid', 'icon' => 'layout-grid'],
			],
		],
	], [
		'id' => 'extra_fields_form',
	]);

	expect($extraSchema['fields'])->toHaveCount(5)
		->and($extraSchema['fields'][0]['type'])->toBe('color')
		->and($extraSchema['fields'][0]['allowAlpha'])->toBeTrue()
		->and($extraSchema['fields'][1]['type'])->toBe('tags')
		->and($extraSchema['fields'][1]['value'])->toBe(['editorial', 'mobile'])
		->and($extraSchema['fields'][2]['type'])->toBe('combobox')
		->and($extraSchema['fields'][2]['options'][0]['icon'])->toBe('file-text')
		->and($extraSchema['fields'][3]['type'])->toBe('unit_number')
		->and($extraSchema['fields'][3]['currency'])->toBe('EUR')
		->and($extraSchema['fields'][3]['value'])->toBe(['value' => 1250, 'unit' => 'EUR'])
		->and($extraSchema['fields'][4]['type'])->toBe('segmented')
		->and($extraSchema['fields'][4]['fullWidth'])->toBeTrue();

	// Declarative serialization also normalizes Package 3 controls (spacing, otp, password, range_slider, markdown)
	$package3Schema = $workspace->serializeFormDefinitions([
		[
			'name' => 'card_padding',
			'type' => 'spacing',
			'label' => 'Padding',
			'allowAuto' => true,
			'units' => ['px', 'rem'],
			'defaultValue' => '16px 24px',
		],
		[
			'name' => 'otp_code',
			'type' => 'otp',
			'label' => 'OTP Code',
			'otpLength' => 6,
			'otpSeparatorAfter' => 3,
			'mask' => true,
		],
		[
			'name' => 'account_pw',
			'type' => 'password',
			'label' => 'Password',
			'allowGenerate' => true,
			'requireSymbol' => true,
			'confirmPassword' => true,
		],
		[
			'name' => 'price_band',
			'type' => 'range_slider',
			'label' => 'Price Band',
			'min' => 0,
			'max' => 1000,
			'minDistance' => 50,
			'defaultValue' => '120..480',
		],
		[
			'name' => 'release_md',
			'type' => 'markdown',
			'label' => 'Release Notes',
			'allowSplit' => true,
			'previewMode' => 'write',
			'defaultValue' => '# Notes',
		],
	], [
		'id' => 'package3_fields_form',
	]);

	expect($package3Schema['fields'])->toHaveCount(5)
		->and($package3Schema['fields'][0]['type'])->toBe('spacing')
		->and($package3Schema['fields'][0]['allowAuto'])->toBeTrue()
		->and($package3Schema['fields'][0]['value'])->toBe([
			'top' => '16',
			'right' => '24',
			'bottom' => '16',
			'left' => '24',
			'unit' => 'px',
			'linked' => false,
		])
		->and($package3Schema['fields'][1]['type'])->toBe('otp')
		->and($package3Schema['fields'][1]['otpLength'])->toBe(6)
		->and($package3Schema['fields'][1]['otpSeparatorAfter'])->toBe(3)
		->and($package3Schema['fields'][2]['type'])->toBe('password')
		->and($package3Schema['fields'][2]['allowGenerate'])->toBeTrue()
		->and($package3Schema['fields'][2]['confirmPassword'])->toBeTrue()
		->and($package3Schema['fields'][3]['type'])->toBe('range_slider')
		->and($package3Schema['fields'][3]['dual'])->toBeTrue()
		->and($package3Schema['fields'][3]['value'])->toBe(['min' => 120, 'max' => 480])
		->and($package3Schema['fields'][4]['type'])->toBe('markdown')
		->and($package3Schema['fields'][4]['allowSplit'])->toBeTrue();

	// Non-inline MarkupReactTab groups inside a WireTab wrapper hoist into unified top-level tabs without leaking rwtabgrp_* labels
	/** @var \ProcessWire\InputfieldForm $tabbedForm */
	$tabbedForm = $modules->get('InputfieldForm');
	$tabbedForm->attr('id+name', 'ProcessReactForm');

	/** @var \ProcessWire\InputfieldWrapper $contentTab */
	$contentTab = new \ProcessWire\InputfieldWrapper();
	$contentTab->set('wire($this)', wire());
	$contentTab->attr('id+name', 'ProcessReactContent');
	$contentTab->attr('title', 'Content');
	$contentTab->addClass('WireTab');

	/** @var \ProcessWire\MarkupReactTab $tabGroup */
	$tabGroup = $modules->get('MarkupReactTab');
	$tabGroup->attr('id+name', 'rwtabgrp_tab_general');

	/** @var \ProcessWire\MarkupReactTab $paneGeneral */
	$paneGeneral = $modules->get('MarkupReactTab');
	$paneGeneral->attr('id+name', 'rwtab_tab_general');
	$paneGeneral->label = 'General';
	/** @var \ProcessWire\InputfieldText $brandInput */
	$brandInput = $modules->get('InputfieldText');
	$brandInput->attr('id+name', 'brand_name');
	$brandInput->label = 'Brand Name';
	$paneGeneral->add($brandInput);
	$tabGroup->add($paneGeneral);

	/** @var \ProcessWire\MarkupReactTab $paneContact */
	$paneContact = $modules->get('MarkupReactTab');
	$paneContact->attr('id+name', 'rwtab_tab_contact');
	$paneContact->label = 'Contact';
	$tabGroup->add($paneContact);

	$contentTab->add($tabGroup);
	$tabbedForm->add($contentTab);

	/** @var \ProcessWire\InputfieldWrapper $settingsTab */
	$settingsTab = new \ProcessWire\InputfieldWrapper();
	$settingsTab->set('wire($this)', wire());
	$settingsTab->attr('id+name', 'ProcessReactSettings');
	$settingsTab->attr('title', 'Settings');
	$settingsTab->addClass('WireTab');
	$tabbedForm->add($settingsTab);

	$tabbedSchema = $workspace->serializeForm($tabbedForm);
	$tabLabels = array_map(static fn(array $t): string => (string) $t['label'], $tabbedSchema['tabs']);
	expect($tabLabels)->toBe(['General', 'Contact', 'Settings']);

	// Inline MarkupReactTab groups remain inline inside their tab without leaking rwtabgrp_* as a label
	/** @var \ProcessWire\MarkupReactTab $inlineGroup */
	$inlineGroup = $modules->get('MarkupReactTab');
	$inlineGroup->attr('id+name', 'rwtabgrp_inline_group');
	$inlineGroup->setQuietly('_rwInlineTabGroup', true);
	$inlineGroup->add($paneGeneral);
	$settingsTab->add($inlineGroup);

	$inlineSchema = $workspace->serializeForm($tabbedForm);
	expect($inlineSchema['tabs'][2]['label'])->toBe('Settings')
		->and($inlineSchema['tabs'][2]['fields'][0]['kind'])->toBe('tabs')
		->and($inlineSchema['tabs'][2]['fields'][0]['label'])->toBe('');

	// InputfieldMarkup (which extends InputfieldWrapper in ProcessWire core) serializes as kind=markup with rendered HTML
	/** @var \ProcessWire\InputfieldMarkup $infoMarkup */
	$infoMarkup = $modules->get('InputfieldMarkup');
	$infoMarkup->attr('id+name', 'ProcessReactInfo');
	$infoMarkup->label = 'Info';
	$infoMarkup->attr('value', '<div class="rw-info-grid"><span>UUIDv5</span></div>');
	$settingsTab->add($infoMarkup);

	$markupSchema = $workspace->serializeForm($tabbedForm);
	expect($markupSchema['tabs'][2]['fields'][1]['kind'])->toBe('markup')
		->and($markupSchema['tabs'][2]['fields'][1]['label'])->toBe('Info')
		->and($markupSchema['tabs'][2]['fields'][1]['html'])->toContain('UUIDv5');

	// Canonical valibot schema transformation: conditions (show, hide, enable, disable, require), validation rules, connected slug, and i18n
	$valibotSchema = $workspace->serializeFormDefinitions([
		[
			'name' => 'headline',
			'type' => 'text_language',
			'label' => 'Headline',
			'defaultValue' => 'Aegean Luxury Charter',
			'inheritLanguage' => true,
			'languages' => [
				['id' => 1010, 'name' => 'default', 'title' => 'English', 'isDefault' => true, 'value' => 'Aegean Luxury Charter'],
				['id' => 1012, 'name' => 'tr', 'title' => 'Türkçe', 'isDefault' => false, 'value' => 'Ege Lüks Yat Kiralama'],
			],
			'validation' => [
				'required' => ['value' => true, 'message' => 'Headline is mandatory.'],
				'minLength' => ['value' => 5, 'message' => 'Headline is too short.'],
				'maxLength' => 120,
			],
		],
		[
			'name' => 'slug',
			'type' => 'slug',
			'label' => 'URL Slug',
			'from' => 'headline',
			'slugSeparator' => '-',
			'maxLength' => 80,
			'conditions' => [
				'show' => ['field' => 'status', 'operator' => '!=', 'value' => 'archived'],
				'hide' => 'is_internal=1',
				'enable' => ['status' => 'draft'],
				'disable' => 'lock_slug=1',
				'require' => 'status=published',
			],
			'validation' => [
				'format' => 'slug',
				'startsWith' => 'aegean',
				'notIn' => ['admin', 'login'],
			],
		],
		[
			'name' => 'confirm_email',
			'type' => 'email',
			'label' => 'Confirm Email',
			'validation' => [
				'email' => true,
				'equalsField' => 'primary_email',
				'messages' => [
					'equalsField' => 'Confirmation email must match primary email.',
				],
			],
		],
	], [
		'id' => 'canonical_validation_form',
	]);

	expect($valibotSchema['defaultValues']['headline'])->toBe('Aegean Luxury Charter')
		->and($valibotSchema['defaultValues']['headline__1012'])->toBe('Ege Lüks Yat Kiralama')
		->and($valibotSchema['fields'][0])->not->toHaveKey('rules')
		->and($valibotSchema['fields'][0]['useLanguages'])->toBeTrue()
		->and($valibotSchema['fields'][0]['i18n']['enabled'])->toBeTrue()
		->and($valibotSchema['fields'][0]['i18n']['inheritLanguage'])->toBeTrue()
		->and($valibotSchema['fields'][0]['i18n']['languages'])->toHaveCount(2)
		->and($valibotSchema['fields'][0]['validation']['required'])->toBeTrue()
		->and($valibotSchema['fields'][0]['validation']['minLength'])->toBe(5)
		->and($valibotSchema['fields'][0]['validation']['messages']['required'])->toBe('Headline is mandatory.')
		->and($valibotSchema['fields'][0]['validation']['messages']['minLength'])->toBe('Headline is too short.')
		->and($valibotSchema['fields'][1]['slugFrom'])->toBe('headline')
		->and($valibotSchema['fields'][1]['connection']['type'])->toBe('slug')
		->and($valibotSchema['fields'][1]['connection']['sourceField'])->toBe('headline')
		->and($valibotSchema['fields'][1]['connection']['separator'])->toBe('-')
		->and($valibotSchema['fields'][1]['connection']['maxLength'])->toBe(80)
		->and($valibotSchema['fields'][1]['conditions']['show'])->toBe('status!=archived')
		->and($valibotSchema['fields'][1]['conditions']['hide'])->toBe('is_internal=1')
		->and($valibotSchema['fields'][1]['conditions']['enable'])->toBe('status=draft')
		->and($valibotSchema['fields'][1]['conditions']['disable'])->toBe('lock_slug=1')
		->and($valibotSchema['fields'][1]['conditions']['require'])->toBe('status=published')
		->and($valibotSchema['fields'][1]['validation']['format'])->toBe('slug')
		->and($valibotSchema['fields'][1]['validation']['startsWith'])->toBe('aegean')
		->and($valibotSchema['fields'][1]['validation']['notIn'])->toBe(['admin', 'login'])
		->and($valibotSchema['fields'][2]['validation']['format'])->toBe('email')
		->and($valibotSchema['fields'][2]['validation']['equalsField'])->toBe('primary_email')
		->and($valibotSchema['fields'][2]['validation']['messages']['equalsField'])->toBe('Confirmation email must match primary email.');
});

it('serializes single-select InputfieldSelect values as scalar strings and multi-select values as arrays', function (): void {
	/** @var \ProcessWire\Modules $modules */
	$modules = wire('modules');
	$serializer = new \Totoglu\React\Form\FormSchemaSerializer($modules);

	/** @var \ProcessWire\InputfieldForm $form */
	$form = $modules->get('InputfieldForm');
	$form->attr('id', 'select_scalar_test_form');

	/** @var \ProcessWire\InputfieldSelect $singleSelect */
	$singleSelect = $modules->get('InputfieldSelect');
	$singleSelect->attr('name', 'category');
	$singleSelect->label = 'Category';
	$singleSelect->addOption('general', 'General');
	$singleSelect->addOption('sales', 'Sales');
	$singleSelect->attr('value', 'sales');
	$form->add($singleSelect);

	/** @var \ProcessWire\InputfieldCheckboxes $multiCheck */
	$multiCheck = $modules->get('InputfieldCheckboxes');
	$multiCheck->attr('name', 'tags');
	$multiCheck->label = 'Tags';
	$multiCheck->addOption('news', 'News');
	$multiCheck->addOption('featured', 'Featured');
	$multiCheck->attr('value', ['news', 'featured']);
	$form->add($multiCheck);

	$schema = $serializer->serialize($form);

	expect($schema['values']['category'])->toBe('sales')
		->and($schema['defaultValues']['category'])->toBe('sales')
		->and($schema['values']['tags'])->toBe(['news', 'featured']);
});

it('exposes per-record dropdown actions in PagesDataProvider and maps all module vector icons in utils.tsx', function (): void {
	$provider = new PagesDataProvider('template=home');
	wire($provider);

	$homeRecord = new \Totoglu\React\Data\ReactRecord(
		id: '1',
		title: 'Home',
		status: 1,
		editUrl: '/processwire/page/edit/?id=1',
		viewUrl: '/',
		values: ['url' => '/'],
	);
	$actions = $provider->recordActions($homeRecord);

	$actionKeys = array_column($actions, 'key');
	expect($actionKeys)->toContain('edit')
		->and($actionKeys)->toContain('view')
		->and($actionKeys)->not->toContain('trash'); // Home page (id=1) is protected from trash

	$regularRecord = new \Totoglu\React\Data\ReactRecord(
		id: '1042',
		title: 'Sample Page',
		status: 1,
		editUrl: '/processwire/page/edit/?id=1042',
		viewUrl: '/sample/',
		values: ['url' => '/sample/'],
	);
	$regularActions = $provider->recordActions($regularRecord);
	$regularKeys = array_column($regularActions, 'key');
	expect($regularKeys)->toContain('edit')
		->and($regularKeys)->toContain('toggle_status')
		->and($regularKeys)->toContain('trash');

	$aliasesSrc = (string) file_get_contents(dirname(__DIR__, 2) . '/resources/ts/icons/faAliases.ts');
	$coreIconsSrc = (string) file_get_contents(dirname(__DIR__, 2) . '/resources/ts/icons/coreUiIcons.ts');
	$combinedIconSrc = $aliasesSrc . "\n" . $coreIconsSrc;
	foreach (['chevrons-up-down', 'clone', 'table', 'bookmark-plus', 'sliders-horizontal', 'more-horizontal'] as $iconKey) {
		expect($combinedIconSrc)->toMatch('/[\'"]?' . preg_quote($iconKey, '/') . '[\'"]?\s*:/');
	}
});

it('implements ReactReorderProvider on PagesDataProvider and exposes shared drag-and-drop sortable primitives', function (): void {
	$defaultProvider = new PagesDataProvider('template=basic-page');
	wire($defaultProvider);
	expect($defaultProvider)->toBeInstanceOf(\Totoglu\React\Contract\ReactReorderProvider::class)
		->and($defaultProvider->isSortable())->toBeFalse();

	$manualSortProvider = new PagesDataProvider('parent=/, sort=sort');
	wire($manualSortProvider);
	expect($manualSortProvider->isSortable())->toBeTrue();

	$explicitSortableProvider = new PagesDataProvider('template=basic-page', ['sortable' => true]);
	wire($explicitSortableProvider);
	expect($explicitSortableProvider->isSortable())->toBeTrue();

	$lockedProvider = new PagesDataProvider('parent=/, sort=sort', ['locked' => true]);
	wire($lockedProvider);
	expect($lockedProvider->isSortable())->toBeFalse();

	$sortableTsPath = dirname(__DIR__, 2) . '/resources/ts/ui/sortable.tsx';
	$sortableSrc = (string) file_get_contents($sortableTsPath);
	expect($sortableSrc)->toContain('export function moveArrayItem')
		->and($sortableSrc)->toContain('export function projectTreeReorder')
		->and($sortableSrc)->toContain('export const SortableHandle')
		->and($sortableSrc)->toContain('export function SortableStatusRegion')
		->and($sortableSrc)->toContain('export function useSortableList');

	$cssPath = dirname(__DIR__, 2) . '/resources/css/entries/ReactInertia.css';
	$cssSrc = (string) file_get_contents($cssPath);
	$deltaCssPath = dirname(__DIR__, 2) . '/resources/css/module-delta.css';
	$deltaCssSrc = (string) file_get_contents($deltaCssPath);
	$distCssPath = dirname(__DIR__, 2) . '/dist/ReactInertia.css';
	$distCss = (string) file_get_contents($distCssPath);
	expect($cssSrc)->toContain('[data-rw-sortable-handle]')
		->and($cssSrc)->toContain('touch-action: none;')
		->and($cssSrc)->toContain('-webkit-user-select: none;')
		->and($cssSrc)->toContain('[data-drop="vertical"]::before')
		->and($cssSrc)->not->toContain('@source "../../../../*')
		->and(is_file($deltaCssPath))->toBeTrue()
		->and($deltaCssSrc)->toContain('@tailwind utilities source(none);')
		->and($distCss)->toContain('@layer utilities.md-longhand');

	/** @var \ProcessWire\MarkupReactTab $tabMod */
	$tabMod = wire()->modules->get('MarkupReactTab');
	$dummyField = new \ProcessWire\Field();
	wire($dummyField);
	$tabVersion = \ProcessWire\MarkupReactTab::getModuleInfo()['version'] ?? null;
	$reactVersion = \ProcessWire\React::getModuleInfo()['version'] ?? null;
	expect($tabVersion)->toBeInt()->toBeGreaterThan(0)
		->and($reactVersion)->toBeInt()->toBeGreaterThanOrEqual($tabVersion)
		->and($tabMod->getConfigAllowContext($dummyField))->toContain('variant', 'badge', 'lazyLoad');

	// Verify PagesDataProvider::mutate() confines scope and blocks protected system property writes
	$scopedProvider = new PagesDataProvider('template=non_existent_scope_tpl_xyz');
	wire($scopedProvider);
	$adminId = (int) (wire()->config->adminRootPageID ?: 2);
	expect($scopedProvider->mutate('draft', [$adminId]))->toBe(0)
		->and($defaultProvider->mutate('update_field', [$adminId], ['field' => 'status', 'value' => 1]))->toBe(0)
		->and($defaultProvider->mutate('update_field', [1], ['field' => 'pass', 'value' => 'hacked']))->toBe(0);

	// Verify InteractWithReact::inertiaFullPageAdmin() opts out on native download/export/modal routes
	$probeHost = new class extends \ProcessWire\Wire {
		use \Totoglu\React\Inertia\InteractWithReact;
	};
	wire($probeHost);
	$input = wire()->input;
	$origSeg1 = $input->urlSegment1;
	try {
		$input->setUrlSegment(1, '');
		expect($probeHost->inertiaFullPageAdmin())->toBeTrue();

		$input->setUrlSegment(1, 'download-backup');
		expect($probeHost->inertiaFullPageAdmin())->toBeFalse();
		$input->setUrlSegment(1, '');

		$input->get->set('export', 'csv');
		expect($probeHost->inertiaFullPageAdmin())->toBeFalse();
		$input->get->remove('export');

		$input->get->set('download_token', 'tok_abc123');
		expect($probeHost->inertiaFullPageAdmin())->toBeFalse();
		$input->get->remove('download_token');

		$input->post->set('_rw_modal', '1');
		expect($probeHost->inertiaFullPageAdmin())->toBeFalse();
		$input->post->remove('_rw_modal');
	} finally {
		$input->setUrlSegment(1, (string) $origSeg1);
		$input->get->remove('export');
		$input->get->remove('download_token');
		$input->post->remove('_rw_modal');
	}
});

test('FormSchemaSerializer deleteTab and appendDeleteTab normalize flat and tabbed forms safely', function (): void {
	$serializer = new \Totoglu\React\Form\FormSchemaSerializer();
	$modules = wire('modules');

	// 1. Flat InputfieldForm with deleteTab promotes into [Configuration | Delete] before submit
	/** @var \ProcessWire\InputfieldForm $flatForm */
	$flatForm = $modules->get('InputfieldForm');
	$flatForm->attr('id', 'wb-test-flat-form');

	/** @var \ProcessWire\InputfieldText $titleField */
	$titleField = $modules->get('InputfieldText');
	$titleField->attr('name', 'title');
	$titleField->label = 'Title';
	$flatForm->add($titleField);

	/** @var \ProcessWire\InputfieldSubmit $submitField */
	$submitField = $modules->get('InputfieldSubmit');
	$submitField->attr('name', 'submit_save');
	$submitField->attr('value', 'Save');
	$flatForm->add($submitField);

	$serializedFlat = $serializer->serialize($flatForm, [
		'surface' => 'card',
		'deleteTab' => [
			'name' => '_wb_delete_confirm',
			'typeLabel' => 'Widget',
			'restricted' => false,
		],
	]);

	expect($serializedFlat['surface'])->toBe('card')
		->and($serializedFlat['submits'])->toHaveCount(1)
		->and($serializedFlat['submits'][0]['name'])->toBe('submit_save')
		->and($serializedFlat['fields'])->toHaveCount(1)
		->and($serializedFlat['fields'][0]['tabs'])->toHaveCount(2)
		->and($serializedFlat['fields'][0]['tabs'][0]['id'])->toBe('_tab_general')
		->and($serializedFlat['fields'][0]['tabs'][0]['confirmDelete'])->toBeFalse()
		->and($serializedFlat['fields'][0]['tabs'][1]['id'])->toBe('_tab_delete')
		->and($serializedFlat['fields'][0]['tabs'][1]['confirmDelete'])->toBeTrue()
		->and($serializedFlat['fields'][0]['tabs'][1]['fields'][0]['name'])->toBe('_wb_delete_confirm')
		->and($serializedFlat['fields'][0]['tabs'][1]['fields'][0]['confirmDelete'])->toBeTrue()
		->and($serializedFlat['fields'][0]['tabs'][1]['fields'][0]['disabled'] ?? false)->toBeFalse();

	// 2. Existing MarkupReactTab group appends Delete pane cleanly and stays idempotent
	/** @var \ProcessWire\InputfieldForm $tabbedForm */
	$tabbedForm = $modules->get('InputfieldForm');
	$tabbedForm->attr('id', 'wb-test-tabbed-form');

	/** @var \ProcessWire\MarkupReactTab $tabGroup */
	$tabGroup = $modules->get('MarkupReactTab');
	$tabGroup->attr('id+name', 'rwtabgrp_custom');
	$tabGroup->set('variant', 'line');

	/** @var \ProcessWire\MarkupReactTab $firstTab */
	$firstTab = $modules->get('MarkupReactTab');
	$firstTab->attr('id+name', '_tab_general');
	$firstTab->label = 'General';

	/** @var \ProcessWire\InputfieldText $handleField */
	$handleField = $modules->get('InputfieldText');
	$handleField->attr('name', 'handle');
	$handleField->label = 'Handle';
	$firstTab->add($handleField);
	$tabGroup->add($firstTab);
	$tabbedForm->add($tabGroup);

	$deleteConfig = [
		'name' => '_wb_delete_confirm',
		'restricted' => true,
		'restrictedDescription' => 'This record is currently in use.',
	];
	$serializer->appendDeleteTab($tabbedForm, $deleteConfig);
	$serializer->appendDeleteTab($tabbedForm, $deleteConfig);

	$serializedTabbed = $serializer->serialize($tabbedForm);
	expect($serializedTabbed['fields'])->toHaveCount(1)
		->and($serializedTabbed['fields'][0]['tabs'])->toHaveCount(2)
		->and($serializedTabbed['fields'][0]['tabs'][0]['id'])->toBe('_tab_general')
		->and($serializedTabbed['fields'][0]['tabs'][1]['id'])->toBe('_tab_delete')
		->and($serializedTabbed['fields'][0]['tabs'][1]['confirmDelete'])->toBeTrue()
		->and($serializedTabbed['fields'][0]['tabs'][1]['fields'][0]['confirmDelete'])->toBeTrue()
		->and($serializedTabbed['fields'][0]['tabs'][1]['fields'][0]['disabled'])->toBeTrue()
		->and($serializedTabbed['fields'][0]['tabs'][1]['fields'][0]['description'])->toContain('currently in use');

	// 3. WireTab wrappers preserve icon, confirmDelete, showIf, collapsed and integrate cleanly with appendDeleteTab
	/** @var \ProcessWire\InputfieldForm $wireTabForm */
	$wireTabForm = $modules->get('InputfieldForm');
	$wireTabForm->attr('id+name', 'rw_wiretab_meta_form');

	$wtGeneral = new \ProcessWire\InputfieldWrapper();
	$wtGeneral->set('wire($this)', wire());
	$wtGeneral->attr('id+name', '_tab_wire_general');
	$wtGeneral->attr('title', 'General');
	$wtGeneral->icon = 'file-text';
	$wtGeneral->addClass('WireTab');
	/** @var \ProcessWire\InputfieldText $wtTitle */
	$wtTitle = $modules->get('InputfieldText');
	$wtTitle->attr('id+name', 'title');
	$wtTitle->label = 'Title';
	$wtGeneral->add($wtTitle);
	$wireTabForm->add($wtGeneral);

	$wtAdvanced = new \ProcessWire\InputfieldWrapper();
	$wtAdvanced->set('wire($this)', wire());
	$wtAdvanced->attr('id+name', '_tab_wire_advanced');
	$wtAdvanced->attr('title', 'Advanced');
	$wtAdvanced->icon = 'sliders';
	$wtAdvanced->set('showIf', 'title!=""');
	$wtAdvanced->collapsed = \ProcessWire\Inputfield::collapsedYes;
	$wtAdvanced->addClass('WireTab');
	$wireTabForm->add($wtAdvanced);

	$wtHidden = new \ProcessWire\InputfieldWrapper();
	$wtHidden->set('wire($this)', wire());
	$wtHidden->attr('id+name', '_tab_wire_hidden');
	$wtHidden->attr('title', 'Hidden');
	$wtHidden->collapsed = \ProcessWire\Inputfield::collapsedHidden;
	$wtHidden->addClass('WireTab');
	$wireTabForm->add($wtHidden);

	$wtSubmit = $modules->get('InputfieldSubmit');
	$wtSubmit->attr('id+name', 'submit_save');
	$wtSubmit->attr('value', 'Save');
	$wireTabForm->add($wtSubmit);

	$serializedWireTabs = $serializer->serialize($wireTabForm, [
		'surface' => 'card',
		'deleteTab' => [
			'name' => '_wt_delete_confirm',
			'typeLabel' => 'Item',
		],
	]);

	expect($serializedWireTabs['tabs'])->toHaveCount(3)
		->and($serializedWireTabs['tabs'][0]['id'])->toBe('_tab_wire_general')
		->and($serializedWireTabs['tabs'][0]['icon'])->toBe('file-text')
		->and($serializedWireTabs['tabs'][0]['confirmDelete'])->toBeFalse()
		->and($serializedWireTabs['tabs'][0]['collapsed'])->toBeFalse()
		->and($serializedWireTabs['tabs'][1]['id'])->toBe('_tab_wire_advanced')
		->and($serializedWireTabs['tabs'][1]['icon'])->toBe('sliders')
		->and($serializedWireTabs['tabs'][1]['showIf'])->toBe('title!=""')
		->and($serializedWireTabs['tabs'][1]['collapsed'])->toBeTrue()
		->and($serializedWireTabs['tabs'][2]['id'])->toBe('_tab_delete')
		->and($serializedWireTabs['tabs'][2]['icon'])->toBe('trash')
		->and($serializedWireTabs['tabs'][2]['confirmDelete'])->toBeTrue()
		->and($serializedWireTabs['tabs'][2]['fields'][0]['name'])->toBe('_wt_delete_confirm');

	// Existing WireTab carrying data-confirm-delete="1" is preserved without appending a second delete tab
	/** @var \ProcessWire\InputfieldForm $explicitDeleteWireForm */
	$explicitDeleteWireForm = $modules->get('InputfieldForm');
	$explicitDeleteWireForm->attr('id+name', 'rw_wiretab_explicit_delete_form');
	$wtContent = new \ProcessWire\InputfieldWrapper();
	$wtContent->set('wire($this)', wire());
	$wtContent->attr('id+name', 'ContentTab');
	$wtContent->attr('title', 'Content');
	$wtContent->addClass('WireTab');
	$explicitDeleteWireForm->add($wtContent);

	$wtExplicitDelete = new \ProcessWire\InputfieldWrapper();
	$wtExplicitDelete->set('wire($this)', wire());
	$wtExplicitDelete->attr('id+name', 'DangerZoneTab');
	$wtExplicitDelete->attr('title', 'Remove');
	$wtExplicitDelete->attr('data-confirm-delete', '1');
	$wtExplicitDelete->icon = 'trash';
	$wtExplicitDelete->addClass('WireTab');
	$explicitDeleteWireForm->add($wtExplicitDelete);

	$serializedExplicitDelete = $serializer->serialize($explicitDeleteWireForm, [
		'deleteTab' => ['name' => '_wt_delete_confirm'],
	]);
	expect($serializedExplicitDelete['tabs'])->toHaveCount(2)
		->and($serializedExplicitDelete['tabs'][1]['id'])->toBe('DangerZoneTab')
		->and($serializedExplicitDelete['tabs'][1]['confirmDelete'])->toBeTrue()
		->and($serializedExplicitDelete['tabs'][1]['icon'])->toBe('trash');
});

test('FormSchemaSerializer maps rwControl extended native Inputfields with 1:1 SchemaForm fidelity', function (): void {
	$modules = wire()->modules;
	$modules->get('React');
	$serializer = new \Totoglu\React\Form\FormSchemaSerializer();
	wire($serializer);

	/** @var \ProcessWire\InputfieldForm $form */
	$form = $modules->get('InputfieldForm');
	$form->attr('id+name', 'rw_extended_native_form');

	/** @var \ProcessWire\InputfieldText $colorField */
	$colorField = $modules->get('InputfieldText');
	$colorField->attr('id+name', 'brand_color');
	$colorField->label = 'Color';
	$colorField->set('rwControl', 'color');
	$colorField->set('swatches', ['#64748b', '#2563eb']);
	$colorField->set('allowAlpha', true);
	$colorField->set('clearable', false);
	$colorField->val('#2563eb');
	$form->add($colorField);

	/** @var \ProcessWire\InputfieldText $customComboField */
	$customComboField = $modules->get('InputfieldText');
	$customComboField->attr('id+name', 'country_code');
	$customComboField->label = 'Country';
	$customComboField->set('rwControl', 'combobox');
	$customComboField->set('comboboxOptions', ['TR' => 'Türkiye', 'GR' => 'Greece']);
	$customComboField->set('allowCustom', true);
	$customComboField->set('clearable', true);
	$customComboField->val('TR');
	$form->add($customComboField);

	/** @var \ProcessWire\InputfieldSelect $segmentedField */
	$segmentedField = $modules->get('InputfieldSelect');
	$segmentedField->attr('id+name', 'scope');
	$segmentedField->label = 'Scope';
	$segmentedField->set('rwControl', 'segmented');
	$segmentedField->set('fullWidth', true);
	$segmentedField->addOption('both', 'Contacts & Orgs', ['data-icon' => 'users']);
	$segmentedField->addOption('contact', 'Contacts');
	$segmentedField->val('both');
	$form->add($segmentedField);

	/** @var \ProcessWire\InputfieldSelect $strictComboField */
	$strictComboField = $modules->get('InputfieldSelect');
	$strictComboField->attr('id+name', 'stabilizers');
	$strictComboField->label = 'Stabilizers';
	$strictComboField->set('rwControl', 'combobox');
	$strictComboField->set('clearable', true);
	$strictComboField->addOption('zero_speed', 'Zero-Speed');
	$strictComboField->val('zero_speed');
	$form->add($strictComboField);

	/** @var \ProcessWire\InputfieldTextarea $markdownField */
	$markdownField = $modules->get('InputfieldTextarea');
	$markdownField->attr('id+name', 'internal_notes');
	$markdownField->label = 'Notes';
	$markdownField->set('rwControl', 'markdown');
	$markdownField->set('previewMode', 'split');
	$markdownField->set('allowSplit', true);
	$markdownField->set('showToolbar', true);
	$markdownField->val('## Notes');
	$form->add($markdownField);

	/** @var \ProcessWire\InputfieldText $dateRangeField */
	$dateRangeField = $modules->get('InputfieldText');
	$dateRangeField->attr('id+name', 'charter_window');
	$dateRangeField->label = 'Window';
	$dateRangeField->set('rwControl', 'daterange');
	$dateRangeField->val('2026-07-01..2026-07-15');
	$form->add($dateRangeField);

	/** @var \ProcessWire\InputfieldText $unitField */
	$unitField = $modules->get('InputfieldText');
	$unitField->attr('id+name', 'deposit_amount');
	$unitField->label = 'Deposit';
	$unitField->set('rwControl', 'unit_number');
	$unitField->set('units', ['EUR', 'USD']);
	$unitField->set('defaultUnit', 'EUR');
	$unitField->val('5000 EUR');
	$form->add($unitField);

	/** @var \ProcessWire\InputfieldText $spacingField */
	$spacingField = $modules->get('InputfieldText');
	$spacingField->attr('id+name', 'box_pad');
	$spacingField->label = 'Padding';
	$spacingField->set('rwControl', 'spacing');
	$spacingField->set('defaultUnit', 'rem');
	$spacingField->val('1.5rem 2rem');
	$form->add($spacingField);

	/** @var \ProcessWire\InputfieldText $otpField */
	$otpField = $modules->get('InputfieldText');
	$otpField->attr('id+name', 'verify_code');
	$otpField->label = 'OTP';
	$otpField->set('rwControl', 'otp');
	$otpField->set('otpLength', 6);
	$otpField->set('otpMode', 'numeric');
	$otpField->set('otpSeparatorAfter', 3);
	$form->add($otpField);

	/** @var \ProcessWire\InputfieldText $passwordField */
	$passwordField = $modules->get('InputfieldText');
	$passwordField->attr('id+name', 'api_pass');
	$passwordField->label = 'Secret';
	$passwordField->set('rwControl', 'password');
	$passwordField->set('showStrength', true);
	$passwordField->set('requireSymbol', true);
	$form->add($passwordField);

	/** @var \ProcessWire\InputfieldText $sliderField */
	$sliderField = $modules->get('InputfieldText');
	$sliderField->attr('id+name', 'budget_band');
	$sliderField->label = 'Budget Band';
	$sliderField->set('rwControl', 'range_slider');
	$sliderField->set('min', 10);
	$sliderField->set('max', 100);
	$sliderField->val('20..80');
	$form->add($sliderField);

	$payload = $serializer->serialize($form);
	$byName = [];
	foreach ($payload['fields'] as $node) {
		if (is_array($node) && isset($node['name'])) {
			$byName[(string) $node['name']] = $node;
		}
	}

	expect($byName['brand_color']['type'])->toBe('color')
		->and($byName['brand_color']['swatches'])->toBe(['#64748b', '#2563eb'])
		->and($byName['brand_color']['allowAlpha'])->toBeTrue()
		->and($byName['brand_color']['clearable'])->toBeFalse()
		->and($byName['country_code']['type'])->toBe('combobox')
		->and($byName['country_code']['allowCustom'])->toBeTrue()
		->and($byName['country_code']['clearable'])->toBeTrue()
		->and($byName['country_code']['options'])->toBe([
			['value' => 'TR', 'label' => 'Türkiye'],
			['value' => 'GR', 'label' => 'Greece'],
		])
		->and($byName['scope']['type'])->toBe('segmented')
		->and($byName['scope']['fullWidth'])->toBeTrue()
		->and($byName['scope']['options'][0]['icon'])->toBe('users')
		->and($byName['stabilizers']['type'])->toBe('combobox')
		->and($byName['stabilizers']['clearable'])->toBeTrue()
		->and($byName['internal_notes']['type'])->toBe('markdown')
		->and($byName['internal_notes']['editorMode'])->toBe('markdown')
		->and($byName['internal_notes']['previewMode'])->toBe('split')
		->and($byName['internal_notes']['allowSplit'])->toBeTrue()
		->and($byName['internal_notes']['showToolbar'])->toBeTrue()
		->and($byName['charter_window']['type'])->toBe('daterange')
		->and($byName['charter_window']['value'])->toBe(['from' => '2026-07-01', 'to' => '2026-07-15'])
		->and($byName['deposit_amount']['type'])->toBe('unit_number')
		->and($byName['deposit_amount']['units'])->toBe(['EUR', 'USD'])
		->and($byName['deposit_amount']['value'])->toBe(['value' => 5000, 'unit' => 'EUR'])
		->and($byName['box_pad']['type'])->toBe('spacing')
		->and($byName['box_pad']['value'])->toBe([
			'top' => '1.5',
			'right' => '2',
			'bottom' => '1.5',
			'left' => '2',
			'unit' => 'rem',
			'linked' => false,
		])
		->and($byName['verify_code']['type'])->toBe('otp')
		->and($byName['verify_code']['otpLength'])->toBe(6)
		->and($byName['verify_code']['otpMode'])->toBe('numeric')
		->and($byName['verify_code']['otpSeparatorAfter'])->toBe(3)
		->and($byName['api_pass']['type'])->toBe('password')
		->and($byName['api_pass']['isSecret'])->toBeFalse()
		->and($byName['api_pass']['showStrength'])->toBeTrue()
		->and($byName['api_pass']['requireSymbol'])->toBeTrue()
		->and($byName['budget_band']['type'])->toBe('range_slider')
		->and($byName['budget_band']['dual'])->toBeTrue()
		->and($byName['budget_band']['value'])->toBe(['min' => 20, 'max' => 80]);

	// Verify canonical time/date/datetime, unitVariant currency, segmented multiple, and structured select metadata parity
	/** @var \ProcessWire\InputfieldForm $canonicalForm */
	$canonicalForm = $modules->get('InputfieldForm');
	$canonicalForm->attr('id+name', 'rw_canonical_parity_form');

	/** @var \ProcessWire\InputfieldDatetime $dtTimeField */
	$dtTimeField = $modules->get('InputfieldDatetime');
	$dtTimeField->attr('id+name', 'shift_start');
	$dtTimeField->label = 'Shift Start';
	$dtTimeField->set('rwControl', 'time');
	$dtTimeField->set('dateInputFormat', '');
	$dtTimeField->set('timeInputFormat', 'H:i:s');
	$dtTimeField->set('minuteStep', 10);
	$dtTimeField->set('timezone', 'Europe/Istanbul');
	$dtTimeField->set('minTime', '08:00');
	$dtTimeField->set('maxTime', '18:00');
	$dtTimeField->val('09:30:15');
	$canonicalForm->add($dtTimeField);

	/** @var \ProcessWire\InputfieldText $textDateField */
	$textDateField = $modules->get('InputfieldText');
	$textDateField->attr('id+name', 'publish_day');
	$textDateField->label = 'Publish Day';
	$textDateField->set('rwControl', 'date');
	$textDateField->set('weekStartsOn', 1);
	$textDateField->val('2026-11-21');
	$canonicalForm->add($textDateField);

	/** @var \ProcessWire\InputfieldText $currencyTextField */
	$currencyTextField = $modules->get('InputfieldText');
	$currencyTextField->attr('id+name', 'charter_fee');
	$currencyTextField->label = 'Charter Fee';
	$currencyTextField->set('rwControl', 'unit_number');
	$currencyTextField->set('unitVariant', 'currency');
	$currencyTextField->set('currencies', ['EUR', 'USD', 'GBP']);
	$currencyTextField->set('precision', 2);
	$currencyTextField->val('1500');
	$canonicalForm->add($currencyTextField);

	/** @var \ProcessWire\InputfieldFloat $currencyFloatField */
	$currencyFloatField = $modules->get('InputfieldFloat');
	$currencyFloatField->attr('id+name', 'security_bond');
	$currencyFloatField->label = 'Security Bond';
	$currencyFloatField->set('rwControl', 'currency');
	$currencyFloatField->val(250);
	$canonicalForm->add($currencyFloatField);

	/** @var \ProcessWire\InputfieldCheckboxes $multiSegField */
	$multiSegField = $modules->get('InputfieldCheckboxes');
	$multiSegField->attr('id+name', 'amenities');
	$multiSegField->label = 'Amenities';
	$multiSegField->set('rwControl', 'segmented');
	$multiSegField->addOption('wifi', 'Wi-Fi');
	$multiSegField->addOption('ac', 'Air Conditioning');
	$multiSegField->set('segmentedOptions', [
		['value' => 'wifi', 'label' => 'Wi-Fi', 'icon' => 'wifi', 'description' => 'High-speed satellite link'],
		['value' => 'ac', 'label' => 'Air Conditioning', 'icon' => 'wind'],
	]);
	$multiSegField->val(['wifi', 'ac']);
	$canonicalForm->add($multiSegField);

	/** @var \ProcessWire\InputfieldSelect $richComboField */
	$richComboField = $modules->get('InputfieldSelect');
	$richComboField->attr('id+name', 'cabin_layout');
	$richComboField->label = 'Cabin Layout';
	$richComboField->set('rwControl', 'combobox');
	$richComboField->addOption('master', 'Master Suite');
	$richComboField->set('comboboxOptions', [
		['value' => 'master', 'label' => 'Master Suite', 'icon' => 'bed', 'description' => 'Full-beam lower deck'],
	]);
	$richComboField->val('master');
	$canonicalForm->add($richComboField);

	$canonicalPayload = $serializer->serialize($canonicalForm);
	$canonicalByName = [];
	foreach ($canonicalPayload['fields'] as $node) {
		if (is_array($node) && isset($node['name'])) {
			$canonicalByName[(string) $node['name']] = $node;
		}
	}

	expect($canonicalByName['shift_start']['type'])->toBe('time')
		->and($canonicalByName['shift_start']['inputType'])->toBe('time')
		->and($canonicalByName['shift_start']['showSeconds'])->toBeTrue()
		->and($canonicalByName['shift_start']['minuteStep'])->toBe(10)
		->and($canonicalByName['shift_start']['timezone'])->toBe('Europe/Istanbul')
		->and($canonicalByName['shift_start']['minTime'])->toBe('08:00')
		->and($canonicalByName['shift_start']['maxTime'])->toBe('18:00')
		->and($canonicalByName['publish_day']['type'])->toBe('date')
		->and($canonicalByName['publish_day']['inputType'])->toBe('date')
		->and($canonicalByName['publish_day']['weekStartsOn'])->toBe(1)
		->and($canonicalByName['charter_fee']['type'])->toBe('unit_number')
		->and($canonicalByName['charter_fee']['unitVariant'])->toBe('currency')
		->and($canonicalByName['charter_fee']['currency'])->toBe('EUR')
		->and($canonicalByName['charter_fee']['units'])->toBe(['EUR', 'USD', 'GBP'])
		->and($canonicalByName['charter_fee']['precision'])->toBe(2)
		->and($canonicalByName['charter_fee']['value'])->toBe(['value' => 1500, 'unit' => 'EUR'])
		->and($canonicalByName['security_bond']['type'])->toBe('unit_number')
		->and($canonicalByName['security_bond']['unitVariant'])->toBe('currency')
		->and($canonicalByName['security_bond']['currency'])->toBe('EUR')
		->and($canonicalByName['security_bond']['value'])->toBe(['value' => 250.0, 'unit' => 'EUR'])
		->and($canonicalByName['amenities']['type'])->toBe('segmented')
		->and($canonicalByName['amenities']['multiple'])->toBeTrue()
		->and($canonicalByName['amenities']['value'])->toBe(['wifi', 'ac'])
		->and($canonicalByName['amenities']['options'][0]['icon'])->toBe('wifi')
		->and($canonicalByName['amenities']['options'][0]['description'])->toBe('High-speed satellite link')
		->and($canonicalByName['cabin_layout']['type'])->toBe('combobox')
		->and($canonicalByName['cabin_layout']['options'][0]['icon'])->toBe('bed')
		->and($canonicalByName['cabin_layout']['options'][0]['description'])->toBe('Full-beam lower deck');

	$declUnitVariant = $serializer->serializeDefinitions([
		[
			'name' => 'deposit',
			'type' => 'unit_number',
			'unitVariant' => 'currency',
			'label' => 'Deposit',
			'defaultValue' => 450,
		],
		[
			'name' => 'guard_time',
			'type' => 'time',
			'label' => 'Guard Time',
			'showSeconds' => null,
			'minuteStep' => null,
		],
		[
			'name' => 'guard_pw',
			'type' => 'password',
			'label' => 'Guard Password',
			'showStrength' => null,
			'allowGenerate' => null,
			'requireUppercase' => null,
			'requireLowercase' => null,
			'requireNumber' => null,
			'requireSymbol' => null,
			'confirmPassword' => null,
			'autoComplete' => null,
		],
		[
			'name' => 'guard_md',
			'type' => 'markdown',
			'label' => 'Guard Markdown',
			'allowSplit' => null,
			'showToolbar' => null,
		],
	], ['id' => 'decl_unit_variant']);
	expect($declUnitVariant['fields'][0]['type'])->toBe('unit_number')
		->and($declUnitVariant['fields'][0]['unitVariant'])->toBe('currency')
		->and($declUnitVariant['fields'][0]['currency'])->toBe('EUR')
		->and($declUnitVariant['fields'][0]['value'])->toBe(['value' => 450, 'unit' => 'EUR'])
		->and($declUnitVariant['fields'][1]['showSeconds'])->toBeFalse()
		->and($declUnitVariant['fields'][2]['showStrength'])->toBeFalse()
		->and($declUnitVariant['fields'][2]['allowGenerate'])->toBeFalse()
		->and($declUnitVariant['fields'][3]['allowSplit'])->toBeFalse()
		->and($declUnitVariant['fields'][3]['showToolbar'])->toBeFalse();
});

test('IntlCatalog and FormSchemaSerializer serialize phone, country, countries, timezone, and currency_code while keeping currency monetary', function (): void {
	$countries = \Totoglu\React\Support\IntlCatalog::countryOptions([], ['AQ'], ['TR', 'GR']);
	expect(array_key_first($countries))->toBe('TR')
		->and($countries)->toHaveKey('GR', 'GR — Greece')
		->and($countries)->toHaveKey('HR', 'HR — Croatia')
		->and($countries)->not->toHaveKey('AQ');

	expect(\Totoglu\React\Support\IntlCatalog::dialCode('HR'))->toBe('385')
		->and(\Totoglu\React\Support\IntlCatalog::dialCode('CY'))->toBe('357')
		->and(\Totoglu\React\Support\IntlCatalog::normalizePhoneE164('091 123 4567', 'HR'))->toBe('+385911234567')
		->and(\Totoglu\React\Support\IntlCatalog::normalizePhoneE164('+44 (0) 20 7946 0199'))->toBe('+4402079460199')
		->and(\Totoglu\React\Support\IntlCatalog::isValidPhoneE164('+905325551234'))->toBeTrue()
		->and(\Totoglu\React\Support\IntlCatalog::isValidCountryCode('TR'))->toBeTrue()
		->and(\Totoglu\React\Support\IntlCatalog::isValidCountryCode('ZZ'))->toBeFalse()
		->and(\Totoglu\React\Support\IntlCatalog::isValidTimezone('Europe/Istanbul'))->toBeTrue()
		->and(\Totoglu\React\Support\IntlCatalog::isValidTimezone('Mars/Phobos'))->toBeFalse()
		->and(\Totoglu\React\Support\IntlCatalog::isValidCurrencyCode('EUR'))->toBeTrue()
		->and(\Totoglu\React\Support\IntlCatalog::currencySymbol('TRY'))->toBe('₺');

	$eurZones = \Totoglu\React\Support\IntlCatalog::timezoneOptions(['Europe', 'UTC']);
	expect($eurZones)->toHaveKey('Europe/Istanbul')
		->and($eurZones)->toHaveKey('UTC')
		->and($eurZones)->not->toHaveKey('America/New_York');

	/** @var \ProcessWire\React $react */
	wire('modules')->get('React');
	$serializer = new \Totoglu\React\Form\FormSchemaSerializer();
	wire($serializer);
	$payload = $serializer->serializeDefinitions([
		[
			'name' => 'phone',
			'type' => 'phone',
			'label' => 'Phone',
			'defaultCountry' => 'tr',
			'preferredCountries' => ['TR', 'GB'],
			'value' => '+905325551234',
		],
		[
			'name' => 'country',
			'type' => 'country',
			'label' => 'Country',
			'only' => ['TR', 'HR', 'GR'],
			'preferred' => ['TR'],
		],
		[
			'name' => 'service_countries',
			'type' => 'countries',
			'label' => 'Service Countries',
			'value' => ['TR', 'HR'],
		],
		[
			'name' => 'tz',
			'type' => 'timezone',
			'label' => 'Timezone',
			'regions' => ['Europe', 'UTC'],
		],
		[
			'name' => 'curr_code',
			'type' => 'currency_code',
			'label' => 'Currency Code',
			'only' => ['EUR', 'USD', 'TRY'],
			'preferred' => ['TRY'],
		],
		[
			'name' => 'amount',
			'type' => 'currency',
			'label' => 'Monetary Amount',
			'defaultValue' => ['value' => 100, 'unit' => 'EUR'],
		],
	], ['id' => 'intl_decl_test']);

	$byName = [];
	foreach ($payload['fields'] as $node) {
		if (is_array($node) && isset($node['name'])) {
			$byName[(string) $node['name']] = $node;
		}
	}

	expect($byName['phone']['type'])->toBe('phone')
		->and($byName['phone']['inputType'])->toBe('tel')
		->and($byName['phone']['defaultCountry'])->toBe('TR')
		->and($byName['phone']['preferredCountries'])->toBe(['TR', 'GB'])
		->and(count($byName['phone']['phoneCountries']))->toBeGreaterThan(200)
		->and($byName['country']['type'])->toBe('combobox')
		->and($byName['country']['multiple'])->toBeFalse()
		->and(array_column($byName['country']['options'], 'value'))->toBe(['TR', 'HR', 'GR'])
		->and($byName['service_countries']['type'])->toBe('combobox')
		->and($byName['service_countries']['multiple'])->toBeTrue()
		->and(count($byName['service_countries']['options']))->toBeGreaterThan(200)
		->and($byName['tz']['type'])->toBe('combobox')
		->and($byName['tz']['options'][0]['label'])->toContain('UTC')
		->and($byName['curr_code']['type'])->toBe('combobox')
		->and(array_column($byName['curr_code']['options'], 'value'))->toBe(['TRY', 'EUR', 'USD'])
		->and($byName['amount']['type'])->toBe('unit_number')
		->and($byName['amount']['unitVariant'])->toBe('currency');

	$modulesApi = wire('modules');
	/** @var \ProcessWire\InputfieldForm $unitForm */
	$unitForm = $modulesApi->get('InputfieldForm');
	/** @var \ProcessWire\InputfieldText $unitInput */
	$unitInput = $modulesApi->get('InputfieldText');
	$unitInput->name = 'charter_price';
	$unitInput->label = 'Charter Price';
	$unitInput->set('rwControl', 'unit_number');
	$unitInput->set('unitVariant', 'currency');
	$unitInput->set('units', ['EUR', 'USD', 'TRY']);
	$unitInput->set('defaultUnit', 'EUR');
	$unitForm->add($unitInput);

	$serializedUnitForm = $serializer->serialize($unitForm);
	$unitField = $serializedUnitForm['fields'][0] ?? [];
	expect($unitField['type'] ?? null)->toBe('unit_number')
		->and($unitField['unitVariant'] ?? null)->toBe('currency')
		->and($unitField['currency'] ?? null)->toBe('EUR');
});

test('FormSchemaSerializer preserves secretPrefix, secretBytes, and secretAutoGenerate across native and declarative forms', function () {
	$modules = \ProcessWire\wire('modules');
	$modules->get('React');
	$serializer = new \Totoglu\React\Form\FormSchemaSerializer();
	\ProcessWire\wire($serializer);

	/** @var \ProcessWire\InputfieldForm $form */
	$form = $modules->get('InputfieldForm');
	$form->attr('id+name', 'rw_secret_meta_form');

	/** @var \ProcessWire\InputfieldText $thirdPartySecret */
	$thirdPartySecret = $modules->get('InputfieldText');
	$thirdPartySecret->attr('id+name', 'third_party_key');
	$thirdPartySecret->label = 'Third-Party Key';
	$thirdPartySecret->attr('data-rw-secret-masked', '1');
	$thirdPartySecret->attr('data-rw-secret-prefix', 'wh_');
	$thirdPartySecret->attr('data-rw-secret-bytes', '24');
	$thirdPartySecret->attr('data-rw-secret-autogen', '0');
	$thirdPartySecret->val('wh_live_123');
	$form->add($thirdPartySecret);

	$serializedNative = $serializer->serialize($form);
	$nativeByName = [];
	foreach ($serializedNative['fields'] as $node) {
		if (is_array($node) && isset($node['name'])) {
			$nativeByName[(string) $node['name']] = $node;
		}
	}

	expect($nativeByName['third_party_key']['isSecret'])->toBeTrue()
		->and($nativeByName['third_party_key']['secretMasked'])->toBeTrue()
		->and($nativeByName['third_party_key']['secretPrefix'])->toBe('wh_')
		->and($nativeByName['third_party_key']['secretBytes'])->toBe(24)
		->and($nativeByName['third_party_key']['secretAutoGenerate'])->toBeFalse();

	$serializedDecl = $serializer->serializeDefinitions([
		[
			'name' => 'qdrant_api_key',
			'type' => 'secret',
			'label' => 'Qdrant API Key',
			'autoGenerate' => false,
			'secretMasked' => true,
			'secretPrefix' => 'qd_',
			'secretBytes' => 16,
		],
		[
			'name' => 'local_secret',
			'type' => 'text',
			'label' => 'Local Token',
			'isSecret' => true,
			'secretAutoGenerate' => true,
		],
	], ['id' => 'rw_secret_decl_form']);

	$declByName = [];
	foreach ($serializedDecl['fields'] as $node) {
		if (is_array($node) && isset($node['name'])) {
			$declByName[(string) $node['name']] = $node;
		}
	}

	expect($declByName['qdrant_api_key']['type'])->toBe('text')
		->and($declByName['qdrant_api_key']['isSecret'])->toBeTrue()
		->and($declByName['qdrant_api_key']['secretMasked'])->toBeTrue()
		->and($declByName['qdrant_api_key']['secretPrefix'])->toBe('qd_')
		->and($declByName['qdrant_api_key']['secretBytes'])->toBe(16)
		->and($declByName['qdrant_api_key']['secretAutoGenerate'])->toBeFalse()
		->and($declByName['local_secret']['isSecret'])->toBeTrue()
		->and($declByName['local_secret']['secretAutoGenerate'])->toBeTrue();
});

it('supports configurable createAction and editUrlBuilder on PagesDataProvider', function (): void {
	$default = new PagesDataProvider('id=1');
	wire($default);
	expect($default->createAction())->toBeNull();

	$explicit = new PagesDataProvider('id=1', [
		'createAction' => [
			'url' => '/admin/page/add/?parent_id=1',
			'label' => 'Create Record',
			'modal' => true,
		],
	]);
	wire($explicit);
	expect($explicit->createAction())->toBe([
		'url' => '/admin/page/add/?parent_id=1',
		'label' => 'Create Record',
		'modal' => true,
	]);

	$unsafe = new PagesDataProvider('id=1', [
		'createAction' => [
			'url' => 'javascript:alert(1)',
			'label' => 'Unsafe',
		],
	]);
	wire($unsafe);
	expect($unsafe->createAction())->toBeNull();

	$declarative = new PagesDataProvider('id=1', [
		'createParentId' => 1,
		'createTemplate' => 'home',
		'createLabel' => 'New Subpage',
		'createModal' => false,
		'editUrlBuilder' => static fn (\ProcessWire\Page $page): string => '/custom-admin/edit/?page=' . $page->id,
	]);
	wire($declarative);
	$homeTpl = wire('templates')->get('home');
	$expectedUrl = rtrim((string) (wire('config')->urls->admin ?: '/processwire'), '/')
		. '/page/add/?parent_id=1'
		. ($homeTpl instanceof \ProcessWire\Template && $homeTpl->id > 0 ? '&template_id=' . $homeTpl->id : '');

	expect($declarative->createAction())->toBe([
		'url' => $expectedUrl,
		'label' => 'New Subpage',
		'modal' => false,
	]);
	expect(array_key_exists('editUrlBuilder', $declarative->options()))->toBeFalse();

	$result = $declarative->query(['limit' => 5]);
	expect($result->items)->not->toBeEmpty()
		->and($result->items[0]->editUrl)->toBe('/custom-admin/edit/?page=1');

	$locked = new PagesDataProvider('id=1', [
		'locked' => true,
		'createAction' => ['url' => '/admin/page/add/?parent_id=1', 'label' => 'Blocked'],
		'createParentId' => 1,
	]);
	wire($locked);
	expect($locked->createAction())->toBeNull();
});

test('MarkupReactTable filters non-href mutation row actions when locked is true', function (): void {
	$provider = new class extends \ProcessWire\Wire implements \Totoglu\React\Contract\ReactDataProviderInterface, \Totoglu\React\Contract\ReactRecordActionsProvider {
		public function id(): string
		{
			return 'custom:audit-sample';
		}

		public function title(): string
		{
			return 'Audit Sample';
		}

		public function columns(): array
		{
			return ['title' => 'Title'];
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
			return false;
		}

		public function query(array $criteria = []): ReactPageResult
		{
			return new ReactPageResult([
				new ReactRecord(
					id: 'audit-1',
					title: 'Immutable Event',
					name: 'immutable-event',
					status: ReactRecord::STATUS_PUBLISHED,
					statusVariant: 'success',
					statusLabel: 'Published',
					values: ['title' => 'Immutable Event'],
					editUrl: '/admin/setup/inspect/?id=audit-1',
				),
			], 1, 1, 25, 0);
		}

		public function mutate(string $operation, array $ids, array $payload = []): int
		{
			return 0;
		}

		public function recordActions(ReactRecord $record): array
		{
			return [
				[
					'key' => 'edit',
					'label' => 'Inspect',
					'icon' => 'eye',
					'href' => $record->editUrl,
				],
				[
					'key' => 'trash',
					'label' => 'Move to Trash',
					'icon' => 'trash',
					'tone' => 'danger',
				],
			];
		}

		public function createAction(): ?array
		{
			return ['url' => '/admin/setup/inspect/?new=1', 'label' => 'New Item'];
		}
	};
	wire($provider);

	/** @var React $react */
	$react = wire('react');
	$tableProp = $react->configureTable($provider, [
		'locked' => true,
		'showCreateButton' => false,
		'exportEnabled' => false,
	])->toInertiaProp();

	expect($tableProp['locked'] ?? null)->toBeTrue()
		->and($tableProp['selectable'] ?? null)->toBeFalse()
		->and($tableProp['quickEditEnabled'] ?? null)->toBeFalse()
		->and($tableProp['showCreateButton'] ?? null)->toBeFalse()
		->and($tableProp['createUrl'] ?? null)->toBe('')
		->and($tableProp['bulkActions'] ?? null)->toBe([])
		->and($tableProp['rowActionsByRecord']['audit-1'] ?? null)->toBe([
			[
				'key' => 'edit',
				'label' => 'Inspect',
				'icon' => 'eye',
				'href' => '/admin/setup/inspect/?id=audit-1',
			],
		]);
});

test('FormSchemaSerializer normalizes and emits tabsLayout across wrapper and declarative forms', function (): void {
	$serializer = new \Totoglu\React\Form\FormSchemaSerializer();
	$modules = wire('modules');

	/** @var \ProcessWire\InputfieldForm $form */
	$form = $modules->get('InputfieldForm');
	$form->attr('id', 'rw-tabs-layout-wrapper');
	$form->attr('data-rw-tabs-layout', 'vertical');

	/** @var \ProcessWire\InputfieldText $textField */
	$textField = $modules->get('InputfieldText');
	$textField->attr('name', 'headline');
	$textField->label = 'Headline';
	$form->add($textField);

	$fromAttr = $serializer->serialize($form, ['surface' => 'card']);
	$fromOptionOverride = $serializer->serialize($form, ['surface' => 'card', 'tabsLayout' => 'horizontal']);
	$fromInvalid = $serializer->serialize($form, ['tabsLayout' => 'diagonal']);
	$fromDefinitions = $serializer->serializeDefinitions([
		['name' => 'title', 'type' => 'text', 'label' => 'Title'],
	], [
		'surface' => 'card',
		'tabsLayout' => 'Vertical',
	]);

	expect($fromAttr['tabsLayout'] ?? null)->toBe('vertical')
		->and($fromOptionOverride['tabsLayout'] ?? null)->toBe('horizontal')
		->and(array_key_exists('tabsLayout', $fromInvalid))->toBeTrue()
		->and($fromInvalid['tabsLayout'])->toBeNull()
		->and($fromDefinitions['tabsLayout'] ?? null)->toBe('vertical');
});
