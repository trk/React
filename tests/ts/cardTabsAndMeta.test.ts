import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ResponsiveTabBar } from '../../resources/ts/ui';
import { SchemaForm } from '../../resources/ts/fields/SchemaForm';
import { scrollTabIntoView } from '../../resources/ts/fields/schemaRuntimeHelpers';
import {
	SchemaMarkupNode,
	applyMarkupCopyFeedback,
	copyMarkupText,
} from '../../resources/ts/fields/schema/SchemaLayoutNodes';
import type { SchemaFormPayload } from '../../resources/ts/fields/types';
import { CORE_UI_ICON_NODES } from '../../resources/ts/icons/coreUiIcons';
import { DynamicIcon } from '../../resources/ts/lib/utils';

function makeTabbedSchema(surface: 'card' | 'plain' | null, tabs: SchemaFormPayload['tabs']): SchemaFormPayload {
	return {
		id: 'rw_card_tabs_test',
		name: 'rw_card_tabs_test',
		action: './',
		method: 'post',
		surface,
		tabs,
		fields: [],
		submits: [{ id: 'submit_save', name: 'submit_save', label: 'Save', icon: 'check' }],
		values: { title: 'Hello', show_extra: '0' },
		errors: {},
	};
}

describe('SchemaForm Card Tabs-Over-Card & SchemaMarkupNode Copy Feedback', () => {
	it('renders [data-rw-tablist][data-rw-card-tabs="above"] outside and immediately before [data-rw-form-card] when surface="card" and 2+ tabs are visible', () => {
		const schema = makeTabbedSchema('card', [
			{
				id: 'tab_content',
				label: 'Content',
				icon: 'file-text',
				fields: [{ kind: 'control', id: 'f_title', name: 'title', type: 'text', label: 'Title' }],
			},
			{
				id: 'tab_settings',
				label: 'Settings',
				icon: 'settings',
				fields: [{ kind: 'control', id: 'f_slug', name: 'slug', type: 'text', label: 'Slug' }],
			},
			{
				id: 'tab_delete',
				label: 'Delete',
				icon: 'trash',
				confirmDelete: true,
				fields: [{ kind: 'control', id: 'f_del', name: '_delete_confirm', type: 'checkbox', label: 'Confirm' }],
			},
		]);

		const html = renderToStaticMarkup(React.createElement(SchemaForm, { schema }));

		const tablistIdx = html.indexOf('data-rw-card-tabs="above"');
		const cardIdx = html.indexOf('data-rw-form-card=""');
		const panelIdx = html.indexOf('id="tab_content"');
		const actionsIdx = html.indexOf('data-rw-form-actions=""');

		expect(tablistIdx).toBeGreaterThan(-1);
		expect(cardIdx).toBeGreaterThan(tablistIdx);
		expect(panelIdx).toBeGreaterThan(cardIdx);
		expect(actionsIdx).toBeGreaterThan(panelIdx);

		expect(html).toContain('data-rw-tablist=""');
		expect(html).toContain('data-rw-confirm-delete-tab="1"');
		expect(html).toContain('@container/rw-form min-w-0');
		expect(html).toContain('rounded-t-none');
		expect(html).toContain('rounded-b-xl');
		expect(html).toContain('border-t-0');
		expect(html).toContain('space-y-4');
	});

	it('renders regular rounded [data-rw-form-card] without data-rw-card-tabs="above" when surface="card" has 1 visible tab', () => {
		const singleTabSchema = makeTabbedSchema('card', [
			{
				id: 'tab_only',
				label: 'Content',
				fields: [{ kind: 'control', id: 'f_title', name: 'title', type: 'text', label: 'Title' }],
			},
			{
				id: 'tab_hidden',
				label: 'Extra',
				showIf: 'show_extra=1',
				fields: [{ kind: 'control', id: 'f_extra', name: 'extra', type: 'text', label: 'Extra' }],
			},
		]);

		const html = renderToStaticMarkup(React.createElement(SchemaForm, { schema: singleTabSchema }));

		expect(html).toContain('data-rw-form-card=""');
		expect(html).not.toContain('data-rw-card-tabs="above"');
		expect(html).not.toContain('role="tablist"');
		expect(html).not.toContain('rounded-t-none');
		expect(html).not.toContain('border-t-0');
	});

	it('preserves inline tablist placement without card wrapper when surface is not "card"', () => {
		const plainSchema = makeTabbedSchema('plain', [
			{
				id: 'tab_one',
				label: 'General',
				fields: [{ kind: 'control', id: 'f_title', name: 'title', type: 'text', label: 'Title' }],
			},
			{
				id: 'tab_two',
				label: 'Settings',
				fields: [{ kind: 'control', id: 'f_slug', name: 'slug', type: 'text', label: 'Slug' }],
			},
		]);

		const html = renderToStaticMarkup(React.createElement(SchemaForm, { schema: plainSchema }));

		expect(html).toContain('data-rw-tablist=""');
		expect(html).not.toContain('data-rw-card-tabs="above"');
		expect(html).not.toContain('data-rw-form-card=""');
		expect(html).toContain('id="tab_one"');
	});

	it('renders SchemaMarkupNode with polite aria-live status and handles [data-copy-text] safely across missing/present clipboard APIs', async () => {
		const html = renderToStaticMarkup(
			React.createElement(SchemaMarkupNode, {
				field: {
					kind: 'markup',
					name: 'record_meta',
					label: 'Record Info',
					html: '<div data-rw-meta-grid=""><div data-rw-meta-item=""><span data-rw-meta-label="">UUID</span><span data-rw-meta-value=""><code>0193</code><button type="button" data-rw-meta-copy="" data-copy-text="0193" title="Copy UUID"><span data-rw-copy-label="">Copy UUID</span></button></span></div></div>',
				},
			})
		);

		expect(html).toContain('data-rw-meta-grid=""');
		expect(html).toContain('data-copy-text="0193"');
		expect(html).toContain('role="status"');
		expect(html).toContain('aria-live="polite"');

		// 1. Missing navigator.clipboard fails closed cleanly without throwing
		const originalNavigator = globalThis.navigator;
		try {
			Object.defineProperty(globalThis, 'navigator', {
				value: undefined,
				configurable: true,
			});
			await expect(copyMarkupText('0193-test')).resolves.toBe(false);

			// 2. Rejecting navigator.clipboard.writeText fails closed cleanly without throwing
			Object.defineProperty(globalThis, 'navigator', {
				value: {
					clipboard: {
						writeText: async () => {
							throw new Error('Clipboard denied');
						},
					},
				},
				configurable: true,
			});
			await expect(copyMarkupText('0193-test')).resolves.toBe(false);

			// 3. Working navigator.clipboard.writeText succeeds and passes copied text
			const written: string[] = [];
			Object.defineProperty(globalThis, 'navigator', {
				value: {
					clipboard: {
						writeText: async (text: string) => {
							written.push(text);
						},
					},
				},
				configurable: true,
			});
			await expect(copyMarkupText('0193-test')).resolves.toBe(true);
			expect(written).toEqual(['0193-test']);
		} finally {
			Object.defineProperty(globalThis, 'navigator', {
				value: originalNavigator,
				configurable: true,
			});
		}

		// 4. applyMarkupCopyFeedback toggles data-copied="1", swaps title + [data-rw-copy-label], and resets after 1500ms
		vi.useFakeTimers();
		try {
			const makeFakeEl = (initialAttrs: Record<string, string>, initialText = '') => {
				const attrs = new Map<string, string>(Object.entries(initialAttrs));
				return {
					isConnected: true,
					childElementCount: 0,
					textContent: initialText,
					attrs,
					getAttribute: (k: string) => attrs.get(k) ?? null,
					setAttribute: (k: string, v: string) => attrs.set(k, v),
					removeAttribute: (k: string) => attrs.delete(k),
					hasAttribute: (k: string) => attrs.has(k),
					querySelector: () => null,
				};
			};

			const labelEl = makeFakeEl({}, 'Copy UUID');
			const buttonEl = makeFakeEl({ title: 'Copy UUID' }, '');
			buttonEl.childElementCount = 1;
			buttonEl.querySelector = (() => labelEl) as () => null;

			const timersMap = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
			applyMarkupCopyFeedback(buttonEl as unknown as HTMLElement, 'Copied', timersMap);

			expect(buttonEl.getAttribute('data-copied')).toBe('1');
			expect(buttonEl.getAttribute('title')).toBe('Copied');
			expect(labelEl.textContent).toBe('Copied');

			vi.advanceTimersByTime(1500);

			expect(buttonEl.getAttribute('data-copied')).toBeNull();
			expect(buttonEl.getAttribute('title')).toBe('Copy UUID');
			expect(labelEl.textContent).toBe('Copy UUID');
		} finally {
			vi.useRealTimers();
		}
	});

	it('ships semantic token CSS contracts for card tabs, metadata grid, reference list, and revision table', () => {
		const cssPath = resolve(import.meta.dirname, '../../resources/css/entries/ReactInertia.css');
		const css = readFileSync(cssPath, 'utf8');

		expect(css).toContain('[data-rw-tablist][data-rw-card-tabs="above"]');
		expect(css).toContain('[data-rw-meta-grid]');
		expect(css).toContain('[data-rw-meta-item]');
		expect(css).toContain('[data-rw-meta-label]');
		expect(css).toContain('[data-rw-meta-value]');
		expect(css).toContain('[data-rw-meta-copy]');
		expect(css).toContain('[data-copied="1"]');
		expect(css).toContain('[data-rw-ref-list]');
		expect(css).toContain('[data-rw-ref-item]');
		expect(css).toContain('[data-rw-rev-table]');
		expect(css).toContain('[data-rw-diff-pill]');
		expect(css).toContain('minmax(min(100%, 14rem), 1fr)');
		expect(css).toContain(
			':is(#pw-content-head, #breadcrumbs, #headline):not([data-rw-app-shell] *, [data-rw-schema-form] *, [data-rw-portal-overlay] *, #_rw_shield *)'
		);
	});

	it('scrolls overflowing tablist horizontally to reveal active tab without calling vertical scrollIntoView', () => {
		let verticalScrollCalled = false;
		const tablistMock = {
			scrollWidth: 640,
			clientWidth: 320,
			scrollLeft: 0,
			matches: () => false,
			getBoundingClientRect: () => ({ left: 0, right: 320, width: 320 }),
		};
		const offscreenTabMock = {
			offsetLeft: 480,
			offsetWidth: 120,
			closest: (sel: string) => (sel.includes('data-rw-tablist') ? tablistMock : null),
			getBoundingClientRect: () => ({ left: 480, right: 600, width: 120 }),
			scrollIntoView: () => {
				verticalScrollCalled = true;
			},
		};

		scrollTabIntoView(offscreenTabMock as unknown as HTMLElement, 'center');
		// Centering 120px tab at left=480 inside 320px viewport wants 380 -> clamped to maxScroll (320)
		expect(tablistMock.scrollLeft).toBe(320);
		expect(verticalScrollCalled).toBe(false);

		// Centering a middle tab (left=240 relative to scrollLeft=0, width=100) in 320px viewport sets scrollLeft=130
		tablistMock.scrollLeft = 0;
		const midTabMock = {
			offsetLeft: 240,
			offsetWidth: 100,
			closest: () => tablistMock,
			getBoundingClientRect: () => ({ left: 240, right: 340, width: 100 }),
			scrollIntoView: () => {
				verticalScrollCalled = true;
			},
		};
		scrollTabIntoView(midTabMock as unknown as HTMLElement, 'center');
		expect(tablistMock.scrollLeft).toBe(130);
		expect(verticalScrollCalled).toBe(false);
	});

	it('preloads EntryEditorTabs core icons synchronously without cube fallback', () => {
		const keys = Object.keys(CORE_UI_ICON_NODES);
		expect(keys).toEqual([...keys].sort());

		const cubeMarkup = renderToStaticMarkup(React.createElement(DynamicIcon, { name: 'cube' }));
		for (const iconName of ['info-circle', 'message', 'settings', 'toggle-right'] as const) {
			expect(CORE_UI_ICON_NODES[iconName]).toBeDefined();
			const html = renderToStaticMarkup(React.createElement(DynamicIcon, { name: iconName }));
			expect(html).toContain('<svg');
			expect(html).not.toBe(cubeMarkup);
		}
	});

	it('renders tab notes, pane notes, and field notes with full WCAG AA text-muted-foreground contrast and error bag counts', () => {
		const schema: SchemaFormPayload = {
			id: 'rw_notes_contrast_test',
			name: 'rw_notes_contrast_test',
			action: './',
			method: 'post',
			surface: 'card',
			tabs: [
				{
					id: 'tab_content',
					label: 'Content',
					notes: 'Tab note visible on Content',
					fields: [
						{
							kind: 'control',
							id: 'f_title',
							name: 'title',
							type: 'text',
							label: 'Title',
							notes: 'Field note for Title',
						},
						{
							kind: 'tabs',
							id: 'sub_tabs',
							tabs: [
								{
									id: 'sub_a',
									label: 'Details Pane',
									notes: 'Pane note for Details',
									fields: [
										{ kind: 'control', id: 'f_code', name: 'code', type: 'text', label: 'Code' },
									],
								},
								{
									id: 'sub_b',
									label: 'Extra Pane',
									fields: [],
								},
							],
						},
					],
				},
				{
					id: 'tab_settings',
					label: 'Settings',
					fields: [{ kind: 'control', id: 'f_slug', name: 'slug', type: 'text', label: 'Slug' }],
				},
			],
			fields: [],
			submits: [{ id: 'submit_save', name: 'submit_save', label: 'Save', header: true }],
			values: { title: 'Hello', code: '', slug: '' },
			errors: { slug: 'Slug is invalid' },
		};

		const html = renderToStaticMarkup(
			React.createElement(SchemaForm, { schema, hideFooterWhenPortaled: true })
		);

		expect(html).toContain('Tab note visible on Content');
		expect(html).toContain('Pane note for Details');
		expect(html).toContain('Field note for Title');
		expect(html).not.toContain('text-muted-foreground/80');
		expect(html).not.toContain('text-muted-foreground/85');
		// Primary submit footer always renders outside card at bottom-left even when hideFooterWhenPortaled is passed
		expect(html).toContain('data-rw-form-actions=""');
		expect(html).toContain('justify-start');
	});

	it('collapses overflowing horizontal tabs into sibling More menu outside role=tablist and highlights active overflow tab + error badge', () => {
		const cssPath = resolve(import.meta.dirname, '../../resources/css/entries/ReactInertia.css');
		const css = readFileSync(cssPath, 'utf8');
		expect(css).toContain('[data-rw-tabs-more][data-overflow-active="1"]');
		expect(css).toContain('[data-rw-tablist][data-rw-form-tabs-layout="vertical"]');

		const html = renderToStaticMarkup(
			React.createElement(ResponsiveTabBar, {
				items: [
					{ id: 't1', btnId: 'btn-t1', label: 'General', errorCount: 0 },
					{ id: 't2', btnId: 'btn-t2', label: 'Details', errorCount: 0 },
					{ id: 't3', btnId: 'btn-t3', label: 'SEO Meta', errorCount: 1 },
					{ id: 't4', btnId: 'btn-t4', label: 'Security', errorCount: 2, confirmDelete: true },
				],
				activeId: 't3',
				ariaLabel: 'Entry sections',
				variant: 'line',
				aboveCard: true,
				maxVisible: 2,
				onSelect: () => {},
			})
		);

		expect(html).toContain('data-rw-card-tabs="above"');
		expect(html).toContain('id="btn-t1"');
		expect(html).toContain('id="btn-t2"');
		expect(html).toMatch(/id="btn-t1"[^>]*tabindex="0"/);
		expect(html).toMatch(/id="btn-t2"[^>]*tabindex="-1"/);
		expect(html).toContain('data-rw-tabs-more=""');
		expect(html).toContain('data-overflow-active="1"');
		expect(html).toContain('id="btn-t3"');
		expect(html).toContain('SEO Meta');
		expect(html).toContain('+2');
		expect(html).toContain('>3<');

		// Overflow trigger must be a sibling OUTSIDE [role="tablist"] for WCAG aria-required-children compliance
		const tablistOpen = html.indexOf('role="tablist"');
		const tablistClose = html.indexOf('</div>', tablistOpen);
		const moreBtn = html.indexOf('data-rw-tabs-more=""');
		expect(tablistOpen).toBeGreaterThan(-1);
		expect(moreBtn).toBeGreaterThan(tablistClose);
	});

	it('renders top-level vertical tabs on card and plain surfaces with delete divider and omits tablist for single tab', () => {
		const buildSchema = (surface: 'card' | 'plain', singleTab = false): SchemaFormPayload => ({
			id: `rw_vtabs_${surface}_${singleTab ? 'one' : 'many'}`,
			name: 'Vertical Tabs Form',
			action: './',
			method: 'post',
			surface,
			tabsLayout: 'vertical',
			tabs: singleTab
				? [
						{
							id: 'tab_only',
							label: 'Only Tab',
							fields: [{ kind: 'control', id: 'f_a', name: 'a', type: 'text', label: 'A' }],
						},
					]
				: [
						{
							id: 'tab_content',
							label: 'Content',
							icon: 'file-text',
							fields: [{ kind: 'control', id: 'f_title', name: 'title', type: 'text', label: 'Title' }],
						},
						{
							id: 'tab_seo',
							label: 'SEO',
							icon: 'search',
							fields: [{ kind: 'control', id: 'f_meta', name: 'meta', type: 'text', label: 'Meta' }],
						},
						{
							id: 'tab_delete',
							label: 'Delete',
							icon: 'trash',
							confirmDelete: true,
							fields: [
								{
									kind: 'control',
									id: 'f_del',
									name: '_delete',
									type: 'checkbox',
									label: 'Confirm delete',
									confirmDelete: true,
								},
							],
						},
					],
			fields: [],
			submits: [],
			values: { title: 'Sample', meta: '', _delete: false },
			errors: { meta: 'Meta required' },
		});

		const cardHtml = renderToStaticMarkup(React.createElement(SchemaForm, { schema: buildSchema('card') }));
		expect(cardHtml).toContain('data-rw-form-card=""');
		expect(cardHtml).toContain('data-rw-tabs-layout="vertical"');
		expect(cardHtml).not.toContain('data-rw-card-tabs="above"');
		expect(cardHtml).toContain('aria-orientation="vertical"');
		expect(cardHtml).toContain('data-rw-form-tabs-layout="vertical"');
		expect(cardHtml).toContain('data-rw-delete-divider="1"');
		expect(cardHtml).toContain('<aside');

		const plainHtml = renderToStaticMarkup(React.createElement(SchemaForm, { schema: buildSchema('plain') }));
		expect(plainHtml).not.toContain('data-rw-form-card=""');
		expect(plainHtml).toContain('data-rw-tabs-layout="vertical"');
		expect(plainHtml).toContain('aria-orientation="vertical"');
		expect(plainHtml).toContain('<aside');

		const singleHtml = renderToStaticMarkup(React.createElement(SchemaForm, { schema: buildSchema('card', true) }));
		expect(singleHtml).not.toContain('role="tablist"');
		expect(singleHtml).not.toContain('aria-orientation="vertical"');
	});
});
