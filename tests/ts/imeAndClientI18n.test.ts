import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTranslations, t } from '../../resources/ts/lib/i18n';
import { CommandInput } from '../../resources/ts/ui/primitives/Command';
import { DropdownMenu } from '../../resources/ts/ui/primitives/DropdownMenu';
import { ICON_RADIUS_OPTIONS } from '../../resources/ts/icons/iconTypes';
import { O2MRelationView } from '../../resources/ts/fields/controls/relation/O2MRelationView';
import { PickerDrawerRelationWidget } from '../../resources/ts/fields/controls/relation/PickerDrawerRelationWidget';
import { SelectAndMultiRelationWidget } from '../../resources/ts/fields/controls/relation/SelectAndMultiRelationWidget';
import { AutocompleteAndMorphWidget } from '../../resources/ts/fields/controls/relation/AutocompleteAndMorphWidget';
import { TransferRelationWidget } from '../../resources/ts/fields/controls/relation/TransferRelationWidget';
import { TreeSelectRelationWidget } from '../../resources/ts/fields/controls/relation/TreeSelectRelationWidget';
import { SelectedItemsStack } from '../../resources/ts/fields/controls/relation/SelectedItemsStack';
import { LinkField } from '../../resources/ts/fields/controls/LinkField';
import { DataTableCanvas } from '../../resources/ts/viewports/DataTableCanvas';
import { DataCardsCanvas } from '../../resources/ts/viewports/DataCardsCanvas';
import { renderViewportCellValue } from '../../resources/ts/viewports/ViewportCellRenderer';
import type { useSortableList } from '../../resources/ts/ui';
import type { ViewportState } from '../../resources/ts/viewports/types';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const TS_ROOT = resolve(THIS_DIR, '../../resources/ts');

function readTsSource(relPath: string): string {
	return readFileSync(resolve(TS_ROOT, relPath), 'utf8');
}

function makeViewportState(): ViewportState {
	return {
		componentId: 'vp_i18n_test',
		viewMode: 'table',
		selectable: true,
		columns: {
			title: { label: 'Title', primary: true },
		},
		records: [
			{
				id: '101',
				title: 'Alpha Record',
			},
		],
		selectedIds: [],
		rowActions: [
			{ key: 'edit', label: 'Edit' },
		],
	};
}

describe('IME Composition Guards & Client i18n Wiring', () => {
	beforeEach(() => {
		registerTranslations('core', {}, 'en');
	});

	afterEach(() => {
		registerTranslations('core', {}, 'en');
	});

	it('skips CommandInput keydown handling when IME is composing or keyCode is 229', () => {
		const onKeyDown = vi.fn();
		let capturedHandler: ((e: React.KeyboardEvent<HTMLInputElement>) => void) | undefined;

		function Probe(): React.ReactElement {
			const node = CommandInput({ onKeyDown, placeholder: 'Search...' });
			const children = React.Children.toArray(
				(node.props as { children?: React.ReactNode }).children
			);
			const inputEl = children.find(
				(child): child is React.ReactElement<{ onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void }> =>
					React.isValidElement(child) && child.type === 'input'
			);
			capturedHandler = inputEl?.props.onKeyDown;
			return node;
		}

		renderToStaticMarkup(React.createElement(Probe));
		expect(typeof capturedHandler).toBe('function');

		const composingPrevent = vi.fn();
		capturedHandler?.({
			key: 'Enter',
			keyCode: 13,
			defaultPrevented: false,
			nativeEvent: { isComposing: true },
			preventDefault: composingPrevent,
		} as unknown as React.KeyboardEvent<HTMLInputElement>);
		expect(onKeyDown).not.toHaveBeenCalled();
		expect(composingPrevent).not.toHaveBeenCalled();

		const key229Prevent = vi.fn();
		capturedHandler?.({
			key: 'Process',
			keyCode: 229,
			defaultPrevented: false,
			nativeEvent: { isComposing: false },
			preventDefault: key229Prevent,
		} as unknown as React.KeyboardEvent<HTMLInputElement>);
		expect(onKeyDown).not.toHaveBeenCalled();
		expect(key229Prevent).not.toHaveBeenCalled();

		capturedHandler?.({
			key: 'ArrowDown',
			keyCode: 40,
			defaultPrevented: false,
			nativeEvent: { isComposing: false },
			preventDefault: vi.fn(),
		} as unknown as React.KeyboardEvent<HTMLInputElement>);
		expect(onKeyDown).toHaveBeenCalledTimes(1);
	});

	it('contains IME composition guards across all 8 interactive keyboard widgets', () => {
		const reactWidgetFiles = [
			'ui/primitives/Command.tsx',
			'layout/CommandPaletteModal.tsx',
			'layout/ModuleSwitcher.tsx',
			'fields/controls/relation/SelectAndMultiRelationWidget.tsx',
			'fields/controls/relation/AutocompleteAndMorphWidget.tsx',
			'fields/controls/TagsField.tsx',
		];

		for (const file of reactWidgetFiles) {
			const src = readTsSource(file);
			expect(src, `${file} missing React IME guard`).toContain(
				'e.nativeEvent.isComposing || e.keyCode === 229'
			);
		}

		const cbSrc = readTsSource('fields/controls/ConditionBuilderField.tsx');
		const cbMatches = cbSrc.match(/e\.nativeEvent\.isComposing \|\| e\.keyCode === 229/g) ?? [];
		expect(cbMatches.length).toBeGreaterThanOrEqual(2);

		const slashSrc = readTsSource('tiptap/canvas/SlashCommandMenu.tsx');
		const slashMatches = slashSrc.match(/event\.isComposing \|\| event\.keyCode === 229/g) ?? [];
		expect(slashMatches.length).toBeGreaterThanOrEqual(2);
	});

	it('resolves O2MRelationView and relation widget strings via registerTranslations + t()', () => {
		const noOwnerEn = renderToStaticMarkup(
			React.createElement(O2MRelationView, {
				widget: 'table',
				initialItems: [],
				resourceLabel: 'Articles',
				resourceIcon: 'file-text',
				ownerId: 0,
				foreignField: 'author',
				creatable: true,
				allowLink: true,
				allowUnlink: true,
				editableLink: false,
				refreshTick: 0,
				callEndpoint: async () => ({ ok: true, items: [] }),
				onOpenQuickCreate: () => {},
			})
		);
		expect(noOwnerEn).toContain('Save this record first before adding or linking related records.');

		registerTranslations(
			'core',
			{
				common: { refresh: 'Yenile' },
				relation: {
					saveBeforeO2m: 'Önce bu kaydı kaydedin.',
					filterIncoming: 'Gelen {resource} filtrele...',
					linkExisting: 'Mevcut Bağla',
					createNew: 'Yeni Oluştur',
					unlink: 'Bağlantıyı Kaldır',
					unlinkNamed: '{label} bağlantısını kaldır',
					noResults: 'Eşleşen öğe bulunamadı.',
					filterOptions: 'Seçenekleri filtrele...',
					searchToSelect: 'Seçmek için arayın...',
				},
			},
			'tr'
		);

		const noOwnerTr = renderToStaticMarkup(
			React.createElement(O2MRelationView, {
				widget: 'table',
				initialItems: [],
				resourceLabel: 'Makaleler',
				resourceIcon: 'file-text',
				ownerId: 0,
				foreignField: 'author',
				creatable: true,
				allowLink: true,
				allowUnlink: true,
				editableLink: false,
				refreshTick: 0,
				callEndpoint: async () => ({ ok: true, items: [] }),
				onOpenQuickCreate: () => {},
			})
		);
		expect(noOwnerTr).toContain('Önce bu kaydı kaydedin.');

		const withOwnerTr = renderToStaticMarkup(
			React.createElement(O2MRelationView, {
				widget: 'table',
				initialItems: [{ key: '10', value: 10, label: 'İlk Yazı' }],
				resourceLabel: 'Makaleler',
				resourceIcon: 'file-text',
				ownerId: 42,
				foreignField: 'author',
				creatable: true,
				allowLink: true,
				allowUnlink: true,
				editableLink: false,
				refreshTick: 0,
				callEndpoint: async () => ({ ok: true, items: [] }),
				onOpenQuickCreate: () => {},
			})
		);
		expect(withOwnerTr).toContain('Gelen Makaleler filtrele...');
		expect(withOwnerTr).toContain('Yenile');
		expect(withOwnerTr).toContain('Mevcut Bağla');
		expect(withOwnerTr).toContain('Yeni Oluştur');
		expect(withOwnerTr).toContain('title="Bağlantıyı Kaldır"');
		expect(withOwnerTr).toContain('aria-label="İlk Yazı bağlantısını kaldır"');

		const autocompleteTr = renderToStaticMarkup(
			React.createElement(AutocompleteAndMorphWidget, {
				cardinality: 'm2o',
				multiple: false,
				scalarValue: '',
				multiValues: [],
				maxItems: 0,
				allowCustom: false,
				creatable: false,
				editableLink: false,
				disabled: false,
				resourceMeta: { handle: 'pages', label: 'Pages', icon: 'file', searchable: true },
				resources: [],
				allowedResources: [],
				sortable: [],
				isSortable: false,
				resolveItem: () => null,
				callEndpoint: async () => ({ ok: true, items: [] }),
				onCommitScalar: () => {},
				onCommitMulti: () => {},
				onOpenQuickCreate: () => {},
			})
		);
		expect(autocompleteTr).toContain('placeholder="Seçmek için arayın..."');

		const selectSrc = readTsSource('fields/controls/relation/SelectAndMultiRelationWidget.tsx');
		expect(selectSrc).toContain("placeholder={t('relation.filterOptions', 'Filter options...')}");
		const selectHtml = renderToStaticMarkup(
			React.createElement(SelectAndMultiRelationWidget, {
				cardinality: 'm2o',
				multiple: false,
				options: [],
				loading: false,
				scalarValue: '',
				multiValues: [],
				maxItems: 0,
				allowCustom: false,
				creatable: false,
				editableLink: false,
				disabled: false,
				resourceMeta: { handle: 'pages', label: 'Pages', icon: 'file', searchable: true },
				sortable: [],
				isSortable: false,
				resolveItem: () => null,
				onCommitScalar: () => {},
				onCommitMulti: () => {},
				onOpenQuickCreate: () => {},
			})
		);
		expect(selectHtml).toContain('role="combobox"');
	});

	it('resolves LinkField type labels and placeholders dynamically via t()', () => {
		const enHtml = renderToStaticMarkup(
			React.createElement(LinkField, {
				controlType: 'link',
				id: 'f_link_en',
				name: 'cta_link',
				value: { type: 'url', url: '' },
				linkConfig: { types: ['page', 'url', 'email'] },
			})
		);
		expect(enHtml).toContain('>Page</option>');
		expect(enHtml).toContain('>URL</option>');
		expect(enHtml).toContain('>Email</option>');
		expect(enHtml).toContain('placeholder="https://example.com, /path/, or #section"');

		registerTranslations(
			'core',
			{
				link: {
					type: {
						page: 'Sayfa',
						url: 'Bağlantı Adresi',
						email: 'E-posta',
					},
					placeholder: {
						url: 'https://ornek.com, /yol/ veya #bolum',
						page: 'Başlık veya yol ile sayfa ara...',
					},
				},
			},
			'tr'
		);

		const trUrlHtml = renderToStaticMarkup(
			React.createElement(LinkField, {
				controlType: 'link',
				id: 'f_link_tr',
				name: 'cta_link',
				value: { type: 'url', url: '' },
				linkConfig: { types: ['page', 'url', 'email'] },
			})
		);
		expect(trUrlHtml).toContain('>Sayfa</option>');
		expect(trUrlHtml).toContain('>Bağlantı Adresi</option>');
		expect(trUrlHtml).toContain('>E-posta</option>');
		expect(trUrlHtml).toContain('placeholder="https://ornek.com, /yol/ veya #bolum"');

		const trPageHtml = renderToStaticMarkup(
			React.createElement(LinkField, {
				controlType: 'link',
				id: 'f_link_tr_page',
				name: 'cta_link_page',
				value: { type: 'page', pageId: 0 },
				linkConfig: { types: ['page', 'url'] },
			})
		);
		expect(trPageHtml).toContain('placeholder="Başlık veya yol ile sayfa ara..."');
	});

	it('resolves ViewportCellRenderer, DataTableCanvas, and DataCardsCanvas labels via t()', () => {
		registerTranslations(
			'core',
			{
				viewport: {
					locked: 'Kilitli',
					selectRow: '{label} satırını seç',
					actionsForRow: '{label} için işlemler',
				},
			},
			'tr'
		);

		const cellHtml = renderToStaticMarkup(
			React.createElement(
				'div',
				null,
				renderViewportCellValue({
					record: { id: '101', title: 'Korumalı Kayıt', _locked: true },
					colKey: 'title',
					colDef: { label: 'Title', primary: true },
					options: { isPrimaryColumn: true },
					editingCell: null,
					setEditingCell: () => {},
					hasDedicatedIconColumn: false,
					hasDedicatedThumbColumn: false,
					onToggleField: () => {},
					onUpdateField: () => {},
				})
			)
		);
		expect(cellHtml).toContain('title="Kilitli"');

		const state = makeViewportState();
		const sharedCanvasProps = {
			state,
			busy: false,
			dispatch: () => {},
			resolveRecordActions: () => [{ key: 'edit', label: 'Edit' }],
			onRequestConfirm: () => {},
			renderCellValue: (rec: Record<string, unknown>, colKey: string) =>
				React.createElement('span', null, String(rec[colKey] ?? '')),
		};

		const tableHtml = renderToStaticMarkup(
			React.createElement(DataTableCanvas, sharedCanvasProps)
		);
		expect(tableHtml).toContain('aria-label="Alpha Record satırını seç"');
		expect(tableHtml).toContain('aria-label="Alpha Record için işlemler"');

		const cardsHtml = renderToStaticMarkup(
			React.createElement(DataCardsCanvas, sharedCanvasProps)
		);
		expect(cardsHtml).toContain('aria-label="Alpha Record satırını seç"');
		expect(cardsHtml).toContain('aria-label="Alpha Record için işlemler"');

		const fallbackBoolHtml = renderToStaticMarkup(
			React.createElement(
				'div',
				null,
				renderViewportCellValue({
					record: { id: '102', is_featured: true },
					colKey: 'is_featured',
					colDef: { label: '', type: 'boolean', editable: true },
					editingCell: null,
					setEditingCell: () => {},
					hasDedicatedIconColumn: false,
					hasDedicatedThumbColumn: false,
					onToggleField: () => {},
					onUpdateField: () => {},
				})
			)
		);
		expect(fallbackBoolHtml).toContain('aria-label="is_featured"');

		const fallbackInputHtml = renderToStaticMarkup(
			React.createElement(
				'div',
				null,
				renderViewportCellValue({
					record: { id: '103', subtitle: 'Draft' },
					colKey: 'subtitle',
					colDef: { label: '', editable: true },
					editingCell: { id: '103', field: 'subtitle', value: 'Draft' },
					setEditingCell: () => {},
					hasDedicatedIconColumn: false,
					hasDedicatedThumbColumn: false,
					onToggleField: () => {},
					onUpdateField: () => {},
				})
			)
		);
		expect(fallbackInputHtml).toContain('aria-label="subtitle"');

		const fallbackSelectHtml = renderToStaticMarkup(
			React.createElement(
				'div',
				null,
				renderViewportCellValue({
					record: { id: '104', stage: 'open' },
					colKey: 'stage',
					colDef: { label: '', editable: true, options: { open: 'Open', closed: 'Closed' } },
					editingCell: { id: '104', field: 'stage', value: 'open' },
					setEditingCell: () => {},
					hasDedicatedIconColumn: false,
					hasDedicatedThumbColumn: false,
					onToggleField: () => {},
					onUpdateField: () => {},
				})
			)
		);
		expect(fallbackSelectHtml).toContain('aria-label="stage"');
	});

	it('enforces secondary IME composition guards across all remaining interactive editors', () => {
		const singleGuardFiles: Array<[string, number]> = [
			['fields/controls/relation/O2MRelationView.tsx', 1],
			['viewports/ViewportCellRenderer.tsx', 1],
			['fields/controls/RelationField.tsx', 1],
			['tiptap/dialogs/TiptapPwDialogs.tsx', 1],
			['fields/media-studio/MediaEditors.tsx', 1],
			['fields/controls/LinkField.tsx', 1],
			['fields/controls/KeyValueField.tsx', 2],
			['fields/controls/ConditionBuilderField.tsx', 2],
		];

		for (const [file, minCount] of singleGuardFiles) {
			const src = readTsSource(file);
			const matches = src.match(/e\.nativeEvent\.isComposing \|\| e\.keyCode === 229/g) ?? [];
			expect(matches.length, `${file} expected >= ${minCount} IME guards`).toBeGreaterThanOrEqual(minCount);
		}
	});

	it('wires LinkField tel type label and placeholder via t()', () => {
		const enTelHtml = renderToStaticMarkup(
			React.createElement(LinkField, {
				controlType: 'link',
				id: 'f_link_tel_en',
				name: 'cta_tel',
				value: { type: 'tel', url: '' },
				linkConfig: { types: ['page', 'url', 'tel'] },
			})
		);
		expect(enTelHtml).toContain('>Phone</option>');
		expect(enTelHtml).toContain('placeholder="+1 555 010 2030"');

		registerTranslations(
			'core',
			{
				link: {
					type: { tel: 'Telefon' },
					placeholder: { tel: '+90 555 010 2030' },
				},
			},
			'tr'
		);

		const trTelHtml = renderToStaticMarkup(
			React.createElement(LinkField, {
				controlType: 'link',
				id: 'f_link_tel_tr',
				name: 'cta_tel',
				value: { type: 'tel', url: '' },
				linkConfig: { types: ['page', 'url', 'tel'] },
			})
		);
		expect(trTelHtml).toContain('>Telefon</option>');
		expect(trTelHtml).toContain('placeholder="+90 555 010 2030"');
	});

	it('enforces IconField WCAG 4.1.2/2.4.7 attributes and translated radius options', () => {
		const iconFieldSrc = readTsSource('fields/controls/IconField.tsx');
		expect(iconFieldSrc).toContain('role="tablist"');
		expect(iconFieldSrc).toContain('role="tab"');
		expect(iconFieldSrc).toContain("aria-selected={activeTab === 'icons'}");
		expect(iconFieldSrc).toContain("aria-selected={activeTab === 'appearance'}");
		expect(iconFieldSrc).toContain("'tabpanel'");
		expect(iconFieldSrc).toContain("aria-pressed={current.variant === 'outline'}");
		expect(iconFieldSrc).toContain("aria-pressed={current.variant === 'filled'}");
		expect(iconFieldSrc).toContain('aria-pressed={current.radius === opt.value}');
		expect(iconFieldSrc).toContain('focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring');
		expect(iconFieldSrc).toContain('t(opt.labelKey, opt.label)');
		expect(iconFieldSrc).not.toContain('aria-controls={studioId}');

		expect(ICON_RADIUS_OPTIONS.map((opt) => opt.labelKey)).toEqual([
			'icon.radius.none',
			'icon.radius.sm',
			'icon.radius.md',
			'icon.radius.lg',
			'icon.radius.full',
		]);

		registerTranslations(
			'core',
			{
				icon: {
					radius: {
						none: 'Kare',
						sm: 'Küçük',
						md: 'Orta',
						lg: 'Büyük',
						full: 'Daire',
					},
				},
			},
			'tr'
		);
		expect(ICON_RADIUS_OPTIONS.map((opt) => t(opt.labelKey, opt.label))).toEqual([
			'Kare',
			'Küçük',
			'Orta',
			'Büyük',
			'Daire',
		]);
	});

	it('wires remaining relation widgets and DropdownMenu aria-label via t()', () => {
		const noopSortable = {
			activeId: null,
			statusMessage: '',
			getContainerProps: () => ({}),
			getItemProps: () => ({}),
			getHandleProps: () => ({}),
		} as unknown as ReturnType<typeof useSortableList<string>>;

		registerTranslations(
			'core',
			{
				common: {
					change: 'Değiştir',
					clearAll: 'Tümünü temizle',
					collapse: 'Daralt',
					expand: 'Genişlet',
					actions: 'İşlemler',
				},
				relation: {
					allTypes: 'Tüm Türler',
					newResource: 'Yeni {resource}',
					addResource: '{resource} ekle',
					selectResource: '{resource} seç',
					selectResourcePlaceholder: '{resource} seçin...',
					browseResources: 'Kaynaklara Göz At...',
					browseResource: '{resource} Göz At...',
					availableCount: 'Kullanılabilir ({count})',
					addAll: 'Tümünü ekle',
					selectedCount: 'Seçili ({count})',
					removeNamed: '{label} kaldır',
					openNamed: '{label} aç',
					selectFromPageTree: 'Sayfa Ağacından Seç...',
				},
			},
			'tr'
		);

		const morphHtml = renderToStaticMarkup(
			React.createElement(AutocompleteAndMorphWidget, {
				cardinality: 'm2a',
				multiple: false,
				scalarValue: 'articles:10',
				multiValues: [],
				maxItems: 0,
				allowCustom: false,
				creatable: true,
				editableLink: false,
				disabled: false,
				resourceMeta: { handle: 'articles', label: 'Makale', icon: 'file-text', supportsQuickCreate: true },
				resources: [
					{ name: 'articles', label: 'Makale', icon: 'file-text', supportsQuickCreate: true },
					{ name: 'pages', label: 'Sayfa', icon: 'file', supportsQuickCreate: true },
				],
				allowedResources: ['articles', 'pages'],
				sortable: noopSortable,
				isSortable: false,
				resolveItem: () => ({ key: 'articles:10', resource: 'articles', value: 10, label: 'İlk Makale' }),
				callEndpoint: async () => ({ ok: true, items: [] }),
				onCommitScalar: () => {},
				onCommitMulti: () => {},
				onOpenQuickCreate: () => {},
			})
		);
		expect(morphHtml).toContain('>Değiştir</span>');

		const morphEmptyHtml = renderToStaticMarkup(
			React.createElement(AutocompleteAndMorphWidget, {
				cardinality: 'm2a',
				multiple: false,
				scalarValue: '',
				multiValues: [],
				maxItems: 0,
				allowCustom: false,
				creatable: true,
				editableLink: false,
				disabled: false,
				resourceMeta: { handle: 'articles', label: 'Makale', icon: 'file-text', supportsQuickCreate: true },
				resources: [
					{ name: 'articles', label: 'Makale', icon: 'file-text', supportsQuickCreate: true },
					{ name: 'pages', label: 'Sayfa', icon: 'file', supportsQuickCreate: true },
				],
				allowedResources: ['articles', 'pages'],
				sortable: noopSortable,
				isSortable: false,
				resolveItem: () => ({ key: 'articles:10', resource: 'articles', value: 10, label: 'İlk Makale' }),
				callEndpoint: async () => ({ ok: true, items: [] }),
				onCommitScalar: () => {},
				onCommitMulti: () => {},
				onOpenQuickCreate: () => {},
			})
		);
		expect(morphEmptyHtml).toContain('Tüm Türler');
		expect(morphEmptyHtml).toContain('aria-label="Yeni Makale"');

		const selectHtml = renderToStaticMarkup(
			React.createElement(SelectAndMultiRelationWidget, {
				cardinality: 'm2o',
				multiple: false,
				options: [],
				loading: false,
				scalarValue: '',
				multiValues: [],
				maxItems: 0,
				allowCustom: false,
				creatable: true,
				editableLink: false,
				disabled: false,
				resourceMeta: { handle: 'articles', label: 'Makale', icon: 'file-text' },
				sortable: noopSortable,
				isSortable: false,
				resolveItem: () => ({ key: 'articles:0', resource: 'articles', value: 0, label: '' }),
				onCommitScalar: () => {},
				onCommitMulti: () => {},
				onOpenQuickCreate: () => {},
			})
		);
		expect(selectHtml).toContain('aria-label="makale seç"');
		expect(selectHtml).toContain('makale seçin...');
		expect(selectHtml).toContain('aria-label="Yeni Makale"');

		const pickerHtml = renderToStaticMarkup(
			React.createElement(PickerDrawerRelationWidget, {
				cardinality: 'm2o',
				multiple: false,
				scalarValue: '',
				multiValues: [],
				maxItems: 0,
				disabled: false,
				editableLink: false,
				creatable: false,
				resourceMeta: { name: 'articles', label: 'Makale', icon: 'file-text' },
				resources: [],
				allowedResources: [],
				sortable: noopSortable,
				isSortable: false,
				resolveItem: () => ({ key: 'articles:0', resource: 'articles', value: 0, label: '' }),
				callEndpoint: async () => ({ ok: true, items: [] }),
				onCommitScalar: () => {},
				onCommitMulti: () => {},
				onOpenQuickCreate: () => {},
			})
		);
		expect(pickerHtml).toContain('Makale Göz At...');

		const transferHtml = renderToStaticMarkup(
			React.createElement(TransferRelationWidget, {
				options: [{ key: 'a', value: '1', label: 'Birinci' }],
				loading: false,
				selectedValues: ['2'],
				maxItems: 0,
				disabled: false,
				editableLink: false,
				fallbackIcon: 'file',
				resolveItem: () => ({ key: 'b', value: '2', label: 'İkinci' }),
				onChange: () => {},
			})
		);
		expect(transferHtml).toContain('Kullanılabilir (1)');
		expect(transferHtml).toContain('Tümünü ekle');
		expect(transferHtml).toContain('Seçili (1)');
		expect(transferHtml).toContain('Tümünü temizle');
		expect(transferHtml).toContain('aria-label="İkinci kaldır"');

		const treeHtml = renderToStaticMarkup(
			React.createElement(TreeSelectRelationWidget, {
				initialTree: [],
				multiple: false,
				scalarValue: '',
				multiValues: [],
				maxItems: 0,
				disabled: false,
				editableLink: false,
				creatable: false,
				fallbackIcon: 'folder',
				sortable: noopSortable,
				isSortable: false,
				resolveItem: () => ({ key: '0', value: '0', label: '' }),
				callEndpoint: async () => ({ ok: true, items: [] }),
				onCommitScalar: () => {},
				onCommitMulti: () => {},
				onOpenQuickCreate: () => {},
			})
		);
		expect(treeHtml).toContain('Sayfa Ağacından Seç...');

		const stackHtml = renderToStaticMarkup(
			React.createElement(SelectedItemsStack, {
				cardinality: 'm2m',
				values: ['10'],
				disabled: false,
				editableLink: true,
				fallbackIcon: 'file',
				isSortable: false,
				sortable: noopSortable,
				resolveItem: () => ({ key: '10', value: '10', label: 'Öğe A', editUrl: '/admin/page/edit/?id=10' }),
				onRemove: () => {},
			})
		);
		expect(stackHtml).toContain('aria-label="Öğe A kaldır"');
		expect(stackHtml).toContain('aria-label="Öğe A aç"');

		const menuHtml = renderToStaticMarkup(
			React.createElement(DropdownMenu, {
				items: [{ label: 'Düzenle', onClick: () => {} }],
			})
		);
		expect(menuHtml).toContain('aria-label="İşlemler"');
	});

	it('registers Escape listeners in bubble phase with IME and defaultPrevented guards across floating overlays', () => {
		const overlayFiles = [
			'layout/ModuleSwitcher.tsx',
			'fields/schema/InlineFieldSettingsPopover.tsx',
			'fields/controls/relation/AutocompleteAndMorphWidget.tsx',
			'fields/controls/relation/SelectAndMultiRelationWidget.tsx',
			'fields/controls/IconField.tsx',
		];

		for (const file of overlayFiles) {
			const src = readTsSource(file);
			expect(src, `${file} must not register Escape keydown listener in capture phase`).not.toMatch(
				/addEventListener\(\s*'keydown'\s*,\s*[^,)]+,\s*true\s*\)/
			);
			expect(src, `${file} must not remove Escape keydown listener in capture phase`).not.toMatch(
				/removeEventListener\(\s*'keydown'\s*,\s*[^,)]+,\s*true\s*\)/
			);
			expect(src, `${file} must register document keydown listener in bubble phase`).toMatch(
				/document\.addEventListener\(\s*'keydown'\s*,\s*(onKeyDown|handleKeyDown)\s*\)/
			);
			expect(src, `${file} must guard Escape against IME composition and defaultPrevented`).toMatch(
				/\.key\s*!==\s*'Escape'\s*\|\|\s*[a-zA-Z]+\.isComposing\s*\|\|\s*[a-zA-Z]+\.keyCode\s*===\s*229\s*\|\|\s*[a-zA-Z]+\.defaultPrevented/
			);
		}
	});
});
