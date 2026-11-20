import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { evaluateSafeMathFormula } from '../../resources/ts/fields/controls/CalculationField';
import {
	CompactMediaLockedBar,
	formatFocusPoint,
	parseFocusPoint,
	stripAdminCacheBuster,
} from '../../resources/ts/fields/media';
import {
	extractSchemaInitialValues,
	formatInlineSettingSummaryChip,
	getNeutralSettingValue,
} from '../../resources/ts/fields/SchemaForm';
import {
	LINK_INLINE_SETTING_PREFIX,
	applyLinkSettingPatches,
	buildLinkInlineSettingFields,
	createEmptyLinkValue,
	evaluateShowIfCondition,
	getLocalizedLinkText,
	normalizeLinkConfigFlags,
	setLocalizedLinkText,
} from '../../resources/ts/fields/shared';
import { hasTranslation, ingestTranslationPayload, registerTranslations, t, translate } from '../../resources/ts/lib/i18n';
import { getCsrfToken, normalizeIconName, sanitizeHref } from '../../resources/ts/lib/utils';
import { Dialog, Sheet, Switch } from '../../resources/ts/ui';
import {
	clampColSpan,
	colSpanToPercent,
	formatColSpanHint,
	percentToColSpan,
} from '../../resources/ts/ui/column-span-slider';
import { moveArrayItem, projectTreeReorder } from '../../resources/ts/ui/sortable';

describe('Runtime Utilities, Formula Engine, i18n, Sortable Tree & Media Helpers', () => {
	it('sanitizes untrusted hrefs against protocol-relative, control-char, and XSS URI schemes', () => {
		expect(sanitizeHref('/admin/workspace/')).toBe('/admin/workspace/');
		expect(sanitizeHref('#section-2')).toBe('#section-2');
		expect(sanitizeHref('./edit?id=5')).toBe('./edit?id=5');
		expect(sanitizeHref('../parent')).toBe('../parent');
		expect(sanitizeHref('https://processwire.com/docs/')).toBe('https://processwire.com/docs/');
		expect(sanitizeHref('mailto:team@example.com')).toBe('mailto:team@example.com');
		expect(sanitizeHref('tel:+905551112233')).toBe('tel:+905551112233');

		expect(sanitizeHref('javascript:alert(1)')).toBe('');
		expect(sanitizeHref('  JaVaScRiPt:alert(1) ')).toBe('');
		expect(sanitizeHref('data:text/html,<script>alert(1)</script>')).toBe('');
		expect(sanitizeHref('vbscript:msgbox(1)')).toBe('');
		expect(sanitizeHref('//evil.example.com/steal')).toBe('');
		expect(sanitizeHref('/\\evil.example.com')).toBe('');
		expect(sanitizeHref('\\evil.example.com')).toBe('');
		expect(sanitizeHref('http:///evil.example.com')).toBe('');
		expect(sanitizeHref('https://\\evil.example.com')).toBe('');
		expect(sanitizeHref('/valid\x00null')).toBe('');
	});

	it('normalizes FontAwesome, UIkit, and PascalCase icon names cleanly', () => {
		expect(normalizeIconName('fa-CheckCircle')).toBe('check-circle');
		expect(normalizeIconName('uk-icon-folder_open')).toBe('folder-open');
		expect(normalizeIconName('')).toBe('cube');
	});

	it('evaluates arithmetic formulas without eval() and handles precedence, parens, scoping, and zero division', () => {
		expect(evaluateSafeMathFormula('{qty} * ({price} + {tax}) - 5', { qty: 3, price: 10, tax: 2 }, 2)).toBe(
			'31.00'
		);
		expect(evaluateSafeMathFormula('-{discount} + 100', { discount: 15 }, 0)).toBe('85');
		expect(evaluateSafeMathFormula('{items} * 25', { items: ['a', 'b', 'c'] }, 0)).toBe('75');
		expect(evaluateSafeMathFormula('{total} / 0', { total: 50 }, 2)).toBe('0.00');
		expect(evaluateSafeMathFormula('{missing} * 10', {}, 1)).toBe('0.0');
		expect(evaluateSafeMathFormula('{unit} * 4', { row_0_unit: 12.5 }, 1, 'row_0')).toBe('50.0');
		// Scientific notation numbers (1e-7) must never be corrupted into `1 - 7 = -6`
		expect(evaluateSafeMathFormula('{tiny} * 10000000', { tiny: 0.0000001 }, 2)).toBe('1.00');
		// Malicious / unknown function calls fail closed to 0 instead of silently evaluating arguments
		expect(evaluateSafeMathFormula('alert(1) + {qty}', { qty: 9 }, 0)).toBe('0');
	});

	it('manages i18n namespaces, parameter interpolation, fallback resolution, and locale invalidation', () => {
		ingestTranslationPayload({
			i18nLocale: 'en',
			i18n: {
				core: {
					greeting: 'Hello {name}!',
					sharedOnly: 'Core Shared Label',
				},
			},
			'i18n.customMod': {
				nested: {
					title: 'Saved {count} records',
				},
			},
		});

		expect(t('greeting', { name: 'Ada' })).toBe('Hello Ada!');
		expect(translate('customMod', 'nested.title', { count: 4 })).toBe('Saved 4 records');
		expect(translate('customMod', 'sharedOnly')).toBe('Core Shared Label');
		expect(hasTranslation('customMod', 'nested.title')).toBe(true);
		expect(translate('customMod', 'nonExistent', 'Fallback Copy')).toBe('Fallback Copy');

		// Locale switch clears stale cached namespaces
		registerTranslations('core', { greeting: 'Merhaba {name}!' }, 'tr');
		expect(hasTranslation('customMod', 'nested.title')).toBe(false);
		expect(t('greeting', { name: 'Deniz' })).toBe('Merhaba Deniz!');
	});

	it('reorders arrays and hierarchical trees while clamping maxDepth and moving subtrees intact', () => {
		const arr = ['a', 'b', 'c', 'd'];
		expect(moveArrayItem(arr, 1, 3)).toEqual(['a', 'c', 'd', 'b']);
		expect(moveArrayItem(arr, -1, 2)).toEqual(['a', 'b', 'c', 'd']);
		expect(arr).toEqual(['a', 'b', 'c', 'd']); // immutable

		const tree = [
			{ id: 'root1', depth: 0, parentId: null },
			{ id: 'child1', depth: 1, parentId: 'root1' },
			{ id: 'grand1', depth: 2, parentId: 'child1' },
			{ id: 'root2', depth: 0, parentId: null },
		];

		// First root node cannot be indented deeper than depth 0
		const invalidRootIndent = projectTreeReorder(tree, 'root1', 0, 2, 3);
		expect(invalidRootIndent?.newDepth).toBe(0);

		// Move root1 (with child1 + grand1) below root2 and indent under root2 -> maxDepth=3 clamps root1 to depth 0 because subtree height is 2!
		const clampedMove = projectTreeReorder(tree, 'root1', 4, 1, 3);
		expect(clampedMove?.newDepth).toBe(0);
		expect(clampedMove?.items.map((n) => n.id)).toEqual(['root2', 'root1', 'child1', 'grand1']);
	});

	it('converts 12-column spans and percentages and normalizes media focus/cache-buster URLs', () => {
		expect(clampColSpan('sm')).toBe(4);
		expect(clampColSpan('md')).toBe(6);
		expect(clampColSpan('lg')).toBe(8);
		expect(clampColSpan('full')).toBe(12);
		expect(clampColSpan(99)).toBe(12);
		expect(colSpanToPercent(4)).toBe(33);
		expect(percentToColSpan(33)).toBe(4);
		expect(formatColSpanHint(6)).toBe('Half');

		expect(parseFocusPoint('25.44 75.19 15')).toEqual({ top: 25.4, left: 75.2, zoom: 15 });
		expect(parseFocusPoint('')).toEqual({ top: 50, left: 50, zoom: 0 });
		expect(formatFocusPoint({ top: -10, left: 120, zoom: 80 })).toBe('0 100 50');

		expect(stripAdminCacheBuster('/site/assets/files/1/hero.jpg?nc=1700000&v=2#crop')).toBe(
			'/site/assets/files/1/hero.jpg?v=2#crop'
		);
		expect(stripAdminCacheBuster('/site/assets/files/1/hero.jpg?nc=1700000')).toBe(
			'/site/assets/files/1/hero.jpg'
		);
	});

	it('wires accessible label associations on Switch, Dialog, and Sheet primitives automatically', () => {
		const switchHtml = renderToStaticMarkup(
			React.createElement(Switch, {
				checked: true,
				onCheckedChange: () => {},
				label: 'Enable caching',
			})
		);
		const idMatch = switchHtml.match(/<button[^>]*\bid="([^"]+)"/);
		const forMatch = switchHtml.match(/<label[^>]*\bfor="([^"]+)"/);
		expect(idMatch?.[1]).toBeTruthy();
		expect(forMatch?.[1]).toBe(idMatch?.[1]);

		const dialogHtml = renderToStaticMarkup(
			React.createElement(Dialog, {
				open: true,
				onOpenChange: () => {},
				title: 'Import Layout',
				description: 'Select preset JSON.',
			})
		);
		expect(dialogHtml).toContain('aria-labelledby=');
		expect(dialogHtml).toContain('aria-describedby=');

		const sheetHtml = renderToStaticMarkup(
			React.createElement(Sheet, {
				open: true,
				onOpenChange: () => {},
				title: 'Link Records',
				subtitle: 'Attach items',
			})
		);
		expect(sheetHtml).toContain('aria-labelledby=');
		expect(sheetHtml).toContain('aria-describedby=');
	});

	it('blocks unsafe URLs before firing safeRouter.post/delete onStart and rejects prototype-pollution keys in i18n', async () => {
		const { safeRouter } = await import('../../resources/ts/lib/inertia-bridge');
		const { registerTranslations, hasTranslation } = await import('../../resources/ts/lib/i18n');

		let started = false;
		safeRouter.post('javascript:alert(1)', { a: 1 }, { onStart: () => { started = true; } });
		safeRouter.post('https://evil.example.com/steal', { a: 1 }, { onStart: () => { started = true; } });
		safeRouter.delete('http:///evil.example.com', { a: 1 }, { onStart: () => { started = true; } });
		expect(started).toBe(false);

		registerTranslations('sec_test', JSON.parse('{"__proto__":{"polluted":"yes"},"safeKey":"Hello"}'));
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		expect(hasTranslation('sec_test', 'safeKey')).toBe(true);
		expect(hasTranslation('sec_test', '__proto__.polluted')).toBe(false);

		const { sanitizeAssetUrl, sanitizeSameOriginUrl } = await import('../../resources/ts/lib/utils');
		expect(sanitizeSameOriginUrl('/_react/viewport')).toBe('/_react/viewport');
		expect(sanitizeSameOriginUrl('https://evil.example.com/_react/viewport')).toBe('');
		expect(sanitizeSameOriginUrl('//evil.example.com/_react/viewport')).toBe('');
		expect(sanitizeSameOriginUrl('mailto:admin@example.com')).toBe('');
		expect(sanitizeAssetUrl('/site/modules/ProcessReactWorkspace/dist/ReactLayout.js')).toBe(
			'/site/modules/ProcessReactWorkspace/dist/ReactLayout.js'
		);
		expect(sanitizeAssetUrl('https://evil.example.com/pwn.js')).toBe('');
		expect(sanitizeAssetUrl('data:text/javascript,alert(1)')).toBe('');

		const { sanitizeSignatureDataUrl } = await import('../../resources/ts/fields/controls/SignatureField');
		expect(sanitizeSignatureDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(
			'data:image/png;base64,iVBORw0KGgo='
		);
		expect(sanitizeSignatureDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe('');
		expect(sanitizeSignatureDataUrl('https://evil.example.com/beacon.png')).toBe('');
	});

	it('enforces accessible ARIA roles/labels on field controls and sanitizes media LQIP, hex colors, and dot-path traversal', async () => {
		const { RatingField } = await import('../../resources/ts/fields/controls/RatingField');
		const { CheckboxField } = await import('../../resources/ts/fields/controls/CheckboxField');
		const { AsmSelectField } = await import('../../resources/ts/fields/controls/AsmSelectField');
		const { MultiSelectField } = await import('../../resources/ts/fields/controls/MultiSelectField');
		const { hydrateStudioMediaItems } = await import('../../resources/ts/fields/media');
		const { resolveScopedFieldValue } = await import('../../resources/ts/fields/shared');

		const ratingHtml = renderToStaticMarkup(
			React.createElement(RatingField, {
				controlType: 'rating',
				id: 'Inputfield_score',
				name: 'score',
				label: 'Quality Score',
				value: 3,
				maxStars: 5,
			})
		);
		expect(ratingHtml).toContain('role="radiogroup"');
		expect(ratingHtml).toContain('aria-label="Quality Score"');
		expect(ratingHtml).toContain('role="radio"');
		expect(ratingHtml).toContain('aria-checked="true"');

		const checkboxHtml = renderToStaticMarkup(
			React.createElement(CheckboxField, {
				controlType: 'checkbox',
				id: 'Inputfield_featured',
				name: 'featured',
				label: 'Featured Post',
				checked: true,
			})
		);
		expect(checkboxHtml).toContain('role="switch"');
		expect(checkboxHtml).toContain('aria-label="Featured Post"');

		const asmHtml = renderToStaticMarkup(
			React.createElement(AsmSelectField, {
				controlType: 'asmselect',
				id: 'Inputfield_tags',
				name: 'tags',
				label: 'Assigned Tags',
				value: ['news'],
				options: [
					{ value: 'news', label: 'News' },
					{ value: 'events', label: 'Events' },
				],
			})
		);
		expect(asmHtml).toContain('aria-label="Assigned Tags"');

		const multiHtml = renderToStaticMarkup(
			React.createElement(MultiSelectField, {
				controlType: 'multiselect',
				id: 'Inputfield_cats',
				name: 'cats',
				label: 'Categories',
				value: ['b'],
				options: [
					{ value: 'a', label: 'Alpha' },
					{ value: 'b', label: 'Beta' },
				],
			})
		);
		expect(multiHtml).toContain('aria-pressed="false"');
		expect(multiHtml).toContain('aria-pressed="true"');

		const hydrated = hydrateStudioMediaItems([
			{
				id: 'img_1',
				name: 'hero.webp',
				basename: 'hero.webp',
				ext: 'webp',
				size: 1024,
				url: 'javascript:alert(1)',
				thumbUrl: '/site/assets/files/1/hero.200x0.webp',
				dominantColor: 'red; background:url(//evil.example/x)',
				palette: ['#1a2b3c', 'expression(alert(1))', '#fff'],
				lqip: 'https://evil.example/track);color:red',
			},
			{
				id: 'img_2',
				name: 'safe.webp',
				basename: 'safe.webp',
				ext: 'webp',
				size: 2048,
				url: '/site/assets/files/1/safe.webp',
				dominantColor: '#0f172a',
				lqip: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=',
			},
		]);
		expect(hydrated[0]?.url).toBe('');
		expect(hydrated[0]?.thumbUrl).toBe('/site/assets/files/1/hero.200x0.webp');
		expect(hydrated[0]?.dominantColor).toBeUndefined();
		expect(hydrated[0]?.palette).toEqual(['#1a2b3c', '#fff']);
		expect(hydrated[0]?.lqip).toBeUndefined();
		expect(hydrated[1]?.dominantColor).toBe('#0f172a');
		expect(hydrated[1]?.lqip).toContain('data:image/webp;base64,');

		expect(resolveScopedFieldValue({ meta: { title: 'OK' } }, 'meta.title')).toBe('OK');
		expect(resolveScopedFieldValue({ meta: { title: 'OK' } }, 'meta.__proto__.toString')).toBe('');
		expect(resolveScopedFieldValue({ meta: { title: 'OK' } }, 'meta.constructor.name')).toBe('');

		const { Tabs, TabsList, TabsTrigger, TabsContent } = await import('../../resources/ts/ui');
		const tabsHtml = renderToStaticMarkup(
			React.createElement(
				Tabs,
				{ defaultValue: 'general' },
				React.createElement(
					TabsList,
					null,
					React.createElement(TabsTrigger, { value: 'general' }, 'General'),
					React.createElement(TabsTrigger, { value: 'advanced' }, 'Advanced')
				),
				React.createElement(TabsContent, { value: 'general' }, React.createElement('p', null, 'Pane 1')),
				React.createElement(TabsContent, { value: 'advanced' }, React.createElement('p', null, 'Pane 2'))
			)
		);
		expect(tabsHtml).toContain('aria-controls=');
		expect(tabsHtml).toContain('aria-labelledby=');
		expect(tabsHtml).toContain('tabindex="0"');
		expect(tabsHtml).toContain('tabindex="-1"');

		const { SubmitField } = await import('../../resources/ts/fields/controls/SubmitField');
		const submitHtml = renderToStaticMarkup(
			React.createElement(SubmitField, {
				controlType: 'submit',
				id: 'Inputfield_submit_save',
				name: 'submit_save',
				submit: {
					value: 'Save',
					label: 'Save',
					dropdownItems: [{ value: 'save_exit', label: 'Save + Exit' }],
				},
			})
		);
		expect(submitHtml).toContain('aria-haspopup="menu"');
		expect(submitHtml).toContain('aria-expanded="false"');
	});

	it('renders adaptive single-line vs multi-line cell alignment, column modifiers, copy controls, and cards parity in DataViewport', async () => {
		const { DataViewport, registerViewport } = await import('../../resources/ts/viewports/DataViewport');
		const { DataTableCanvas } = await import('../../resources/ts/viewports/DataTableCanvas');
		const { DataCardsCanvas } = await import('../../resources/ts/viewports/DataCardsCanvas');
		registerViewport('table', DataTableCanvas);
		registerViewport('cards', DataCardsCanvas);

		const baseProps = {
			componentId: 'gateways_vp',
			title: 'Payment Gateways',
			viewMode: 'table',
			columns: {
				title: { label: 'Gateway', sortable: true },
				endpoint: { label: 'Webhook', mono: true, copyable: true, truncate: 18 },
				volume: { label: 'Volume', align: 'right' as const, tabular: true, nowrap: true },
				status: { label: 'Status' },
			},
			records: [
				{
					id: 'gw_single',
					title: 'Single Line Gateway',
					_icon: 'credit-card',
					_editUrl: '/admin/gateways/edit/1',
					endpoint: 'https://api.example.com/v1/webhooks/stripe-live',
					volume: '€48,200',
					status: 'Published',
					_statusVariant: 'success',
					_statusLabel: 'Published',
				},
				{
					id: 'gw_multi',
					title: 'Multi Line Gateway',
					_icon: 'globe',
					_subtitle: '/checkout/global · EUR / USD',
					_badges: [
						{ label: 'Default', variant: 'primary' },
						{ label: '3DS', variant: 'secondary' },
						{ label: 'Recurring', variant: 'outline' },
						{ label: 'Instant', variant: 'outline' },
					],
					_editUrl: '/admin/gateways/edit/2',
					endpoint: {
						icon: 'link',
						label: 'webhooks.example.com/global-checkout-endpoint',
						href: 'https://webhooks.example.com/global-checkout-endpoint',
						external: true,
						copyValue: 'whsec_live_123',
					},
					volume: '€129,000',
					status: 'Published',
					_statusVariant: 'success',
					_statusLabel: 'Published',
				},
			],
		};

		const tableHtml = renderToStaticMarkup(React.createElement(DataViewport, baseProps));

		// Scrollable region semantics + vertical-align middle default
		expect(tableHtml).toContain('role="region"');
		expect(tableHtml).toContain('aria-label="Payment Gateways"');
		expect(tableHtml).toContain('data-rw-viewport-table=""');
		expect(tableHtml).toContain('data-valign="middle"');

		// Single-line icon+text cell centers items without multiline flag, while multi-line cell switches to items-start + mt-0.5
		expect(tableHtml).toContain('data-rw-cell-multiline="true"');
		expect(tableHtml).toContain('items-center justify-start gap-2.5');
		expect(tableHtml).toContain('items-start justify-start gap-2.5');
		expect(tableHtml).toContain('mt-0.5');

		// Truncation + tooltip + copy button live status outside button + badge overflow (+1) + tabular-nums right alignment
		expect(tableHtml).toContain('https://api.exampl…');
		expect(tableHtml).toContain('title="https://api.example.com/v1/webhooks/stripe-live"');
		expect(tableHtml).toContain('data-rw-copy-btn=""');
		expect(tableHtml).toContain('role="status" data-rw-copy-tip=""');
		expect(tableHtml).toContain('+1');
		expect(tableHtml).toContain('tabular-nums whitespace-nowrap');

		// rowValign="top" switches cells to data-valign="top" and align-top
		const topAlignedHtml = renderToStaticMarkup(
			React.createElement(DataViewport, { ...baseProps, rowValign: 'top' })
		);
		expect(topAlignedHtml).toContain('data-valign="top"');
		expect(topAlignedHtml).toContain('align-top');

		// Cards mode renders identical icon, subtitle, badges, and secondary cells cleanly
		const cardsHtml = renderToStaticMarkup(
			React.createElement(DataViewport, { ...baseProps, viewMode: 'cards' })
		);
		expect(cardsHtml).toContain('Single Line Gateway');
		expect(cardsHtml).toContain('Multi Line Gateway');
		expect(cardsHtml).toContain('/checkout/global · EUR / USD');
		expect(cardsHtml).toContain('+1');
	});

	it('adapts AppShell between classic admin mode and full-screen workspace mode from a single component', async () => {
		const { AppShell } = await import('../../resources/ts/layout/AppShell');
		const { withWorkspaceShellUrl } = await import('../../resources/ts/lib/inertia-bridge');

		expect(withWorkspaceShellUrl('/processwire/setup/wire-seo/', true)).toBe(
			'/processwire/setup/wire-seo/?ws=1'
		);
		expect(withWorkspaceShellUrl('/processwire/setup/wire-seo/edit/?type=redirects#top', true)).toBe(
			'/processwire/setup/wire-seo/edit/?type=redirects&ws=1#top'
		);
		expect(withWorkspaceShellUrl('/processwire/workspace/', true)).toBe('/processwire/workspace/');
		expect(withWorkspaceShellUrl('/processwire/', true)).toBe('/processwire/');
		expect(withWorkspaceShellUrl('/processwire/setup/wire-seo/?export=csv', true)).toBe(
			'/processwire/setup/wire-seo/?export=csv'
		);

		const baseWorkspace = {
			appName: 'ProcessWire',
			adminUrl: '/processwire/',
			adminReturnLabel: 'Panel',
			launcherUrl: '/processwire/workspace/',
			themeMode: 'light' as const,
			user: { id: 41, name: 'admin', email: 'admin@example.com', isSuperuser: true },
			activeWorkspace: {
				id: 'seo',
				title: 'SEO',
				description: 'Search settings',
				icon: 'line-chart',
				category: 'Marketing',
				url: '/processwire/setup/wire-seo/',
				permission: 'wire-seo-admin',
				order: 10,
				badge: '',
				stats: [],
			},
			workspaces: [],
		};

		const adminModeHtml = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace: { ...baseWorkspace, shellMode: 'admin' },
					title: 'SEO',
					subtitle: 'Manage search metadata.',
					icon: 'line-chart',
				},
				React.createElement('div', null, 'Module Body')
			)
		);

		expect(adminModeHtml).toContain('data-rw-app-shell="admin"');
		expect(adminModeHtml).not.toContain('data-rw-admin-return');
		expect(adminModeHtml).toContain('data-rw-open-in-workspace');
		expect(adminModeHtml).toContain('href="/processwire/setup/wire-seo/?ws=1"');
		expect(adminModeHtml).toContain('data-rw-app-main=""');

		const standaloneNoHubHtml = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace: { ...baseWorkspace, shellMode: 'admin', launcherUrl: '' },
					title: 'SEO',
				},
				React.createElement('div', null, 'Module Body')
			)
		);
		expect(standaloneNoHubHtml).toContain('data-rw-app-shell="admin"');
		expect(standaloneNoHubHtml).not.toContain('data-rw-open-in-workspace');

		const workspaceModeHtml = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace: { ...baseWorkspace, shellMode: 'workspace' },
					title: 'SEO',
				},
				React.createElement('div', null, 'Module Body')
			)
		);
		expect(workspaceModeHtml).toContain('data-rw-app-shell=""');
		expect(workspaceModeHtml).toContain('data-rw-admin-return');
		expect(workspaceModeHtml).not.toContain('data-rw-open-in-workspace');
		expect(workspaceModeHtml).toContain('<main data-rw-app-main=""');
	});

	it('renders Dialog and ConfirmDialog with uncollided header, body, and footer zones', async () => {
		const { Dialog, ConfirmDialog } = await import('../../resources/ts/ui');

		const contentDialogHtml = renderToStaticMarkup(
			React.createElement(
				Dialog,
				{
					open: true,
					onClose: () => {},
					title: 'Import Dashboard Layout',
					description: 'Paste a workspace preset JSON payload below.',
					icon: 'upload',
					tone: 'primary',
					footer: React.createElement('button', { type: 'button' }, 'Apply'),
				},
				React.createElement('textarea', { 'aria-label': 'JSON' })
			)
		);
		expect(contentDialogHtml).toContain('data-rw-modal-dialog=""');
		expect(contentDialogHtml).toContain('data-rw-dialog-header=""');
		expect(contentDialogHtml).toContain('data-rw-dialog-body=""');
		expect(contentDialogHtml).toContain('data-rw-dialog-footer=""');
		expect(contentDialogHtml).toContain('aria-label="Close"');

		const compactConfirmHtml = renderToStaticMarkup(
			React.createElement(ConfirmDialog, {
				open: true,
				onOpenChange: () => {},
				title: 'Unsaved changes',
				description: 'Leaving or reloading this page will discard the edits you have not saved.',
				confirmLabel: 'Discard & Leave',
				variant: 'danger',
				requireAcknowledge: false,
				onConfirm: () => {},
			})
		);
		expect(compactConfirmHtml).toContain('data-rw-dialog-header=""');
		expect(compactConfirmHtml).not.toContain('data-rw-dialog-body=""');
		expect(compactConfirmHtml).toContain('data-rw-dialog-footer=""');
		expect(compactConfirmHtml).not.toContain('aria-label="Close"');
		expect(compactConfirmHtml).toContain('max-w-[26rem]');
		expect(compactConfirmHtml).toContain('Discard &amp; Leave');

		const ackConfirmHtml = renderToStaticMarkup(
			React.createElement(ConfirmDialog, {
				open: true,
				onOpenChange: () => {},
				title: 'Reset Layout',
				description: 'Restore the default widget grid.',
				variant: 'danger',
				requireAcknowledge: true,
				onConfirm: () => {},
			})
		);
		expect(ackConfirmHtml).toContain('data-rw-dialog-body=""');
		expect(ackConfirmHtml).toContain('max-w-[28rem]');
		expect(ackConfirmHtml).toContain('type="checkbox"');
	});

	it('getCsrfToken resolves top-level csrf, workspace.csrf fallback, and empty fallback', () => {
		expect(getCsrfToken({ csrf: { name: 'TOKEN_A', value: 'val-123' }, workspace: { csrf: { name: 'TOKEN_B', value: 'val-456' } } })).toEqual({
			name: 'TOKEN_A',
			value: 'val-123',
		});

		expect(getCsrfToken({ csrf: null, workspace: { csrf: { name: 'TOKEN_B', value: 'val-456' } } })).toEqual({
			name: 'TOKEN_B',
			value: 'val-456',
		});

		expect(getCsrfToken({ csrf: { name: '', value: 'missing-name' } })).toEqual({
			name: 'TOKEN',
			value: '',
		});
		expect(getCsrfToken(null)).toEqual({
			name: 'TOKEN',
			value: '',
		});
	});

	it('DataViewport expands toolbar search when unfiltered and RecordHeader supports auto-dirty mode', async () => {
		const { DataViewport } = await import('../../resources/ts/viewports/DataViewport');
		const { RecordHeader } = await import('../../resources/ts/layout/AppShell');

		const noFilterHtml = renderToStaticMarkup(
			React.createElement(DataViewport, {
				componentId: 'vp_no_filters',
				title: 'Layouts',
				viewMode: 'table',
				columns: { title: { label: 'Title' } },
				records: [{ id: 'l_1', title: 'Default' }],
			})
		);
		expect(noFilterHtml).toContain('data-rw-viewport-actions="" class="flex w-full flex-wrap items-center gap-2 shrink-0 sm:flex-1"');
		expect(noFilterHtml).toContain('class="relative min-w-0 flex-1 sm:flex-1"');

		const withFiltersHtml = renderToStaticMarkup(
			React.createElement(DataViewport, {
				componentId: 'vp_with_filters',
				title: 'Catalog',
				viewMode: 'cards',
				columns: { title: { label: 'Title' } },
				records: [{ id: 'c_1', title: 'Hero' }],
				filters: {
					category: {
						label: 'Category',
						type: 'select',
						display: 'pills',
						options: { hero: 'Hero' },
					},
				},
			})
		);
		expect(withFiltersHtml).toContain('sm:ml-auto sm:w-auto');
		expect(withFiltersHtml).toContain('sm:w-56 sm:flex-none');

		const autoRecordHeaderHtml = renderToStaticMarkup(
			React.createElement(RecordHeader, {
				title: 'Default',
				backHref: '../layouts/',
				backLabel: 'Layouts',
			})
		);
		expect(autoRecordHeaderHtml).toContain('data-rw-record-header=""');
		expect(autoRecordHeaderHtml).not.toContain('data-rw-record-status="dirty"');

		const dirtyRecordHeaderHtml = renderToStaticMarkup(
			React.createElement(RecordHeader, {
				title: 'Default',
				dirty: true,
			})
		);
		expect(dirtyRecordHeaderHtml).toContain('data-rw-record-status="dirty"');
	});

	it('preserves media filenames across extractSchemaInitialValues and keeps dependent conditions unlocked', () => {
		const populated = extractSchemaInitialValues({
			values: {
				hero_image: '',
				hover_image: '',
			},
			fields: [
				{
					name: 'hero_image',
					type: 'image',
					isImage: true,
					useLanguages: true,
					value: '',
					files: [
						{
							name: 'modified-fleet-01.jpg',
							basename: 'modified-fleet-01.jpg',
							ext: 'jpg',
							size: 2048,
							url: '/site/assets/files/1/modified-fleet-01.jpg',
						},
					],
					languages: [
						{ id: 1010, name: 'default', title: 'English', isDefault: true, inputName: 'hero_image', value: '' },
						{ id: 1011, name: 'tr', title: 'Türkçe', isDefault: false, inputName: 'hero_image__1011', value: '' },
					],
				},
				{
					name: 'hover_image',
					type: 'image',
					isImage: true,
					enableIf: 'hero_image!=0|',
					value: [],
					files: [],
				},
			],
		});

		expect(populated.hero_image).toEqual(['modified-fleet-01.jpg']);
		expect(evaluateShowIfCondition('hero_image!=0|', populated)).toBe(true);

		const emptyState = extractSchemaInitialValues({
			values: {},
			fields: [
				{
					name: 'hero_image',
					type: 'image',
					isImage: true,
					useLanguages: true,
					value: [],
					files: [],
					languages: [
						{ id: 1010, name: 'default', title: 'English', isDefault: true, inputName: 'hero_image', value: '' },
					],
				},
			],
		});

		expect(emptyState.hero_image).toEqual([]);
		expect(evaluateShowIfCondition('hero_image!=0|', emptyState)).toBe(false);
	});

	it('formats inline settings summary chips and resolves neutral setting reset values cleanly', () => {
		const toggleField = {
			name: 'bordered',
			type: 'toggle',
			label: 'Subtle Frame Border',
			options: [
				{ value: '0', label: 'No' },
				{ value: '1', label: 'Yes' },
			],
		};
		expect(formatInlineSettingSummaryChip(toggleField, '1')).toBe('Subtle Frame…');
		expect(formatInlineSettingSummaryChip(toggleField, '0')).toBeNull();
		expect(getNeutralSettingValue(toggleField)).toBe('0');

		const customToggleField = {
			name: 'loading_mode',
			type: 'toggle',
			label: 'Loading',
			options: [
				{ value: 'lazy', label: 'Lazy' },
				{ value: 'eager', label: 'Eager' },
			],
		};
		expect(formatInlineSettingSummaryChip(customToggleField, 'eager')).toBe('eager');
		expect(getNeutralSettingValue(customToggleField)).toBe('lazy');

		const widthField = {
			name: 'width',
			type: 'integer',
			label: 'Width (px)',
		};
		expect(formatInlineSettingSummaryChip(widthField, '800')).toBe('800px');
		expect(formatInlineSettingSummaryChip(widthField, 'auto')).toBeNull();
		expect(formatInlineSettingSummaryChip(widthField, 'default')).toBeNull();
		expect(getNeutralSettingValue(widthField)).toBe('');

		const radiusField = {
			name: 'rounded',
			type: 'select',
			label: 'Media Corner Radius',
			options: [
				{ value: 'none', label: 'None' },
				{ value: 'full', label: 'Pill / Circle' },
			],
		};
		expect(formatInlineSettingSummaryChip(radiusField, 'full')).toBe('full');
		expect(formatInlineSettingSummaryChip(radiusField, 'none')).toBeNull();
		expect(getNeutralSettingValue(radiusField)).toBe('none');
	});

	it('renders media-specific locked vs read-only states in CompactMediaLockedBar', () => {
		const disabledImageHtml = renderToStaticMarkup(
			React.createElement(CompactMediaLockedBar, { isImage: true, isDisabled: true })
		);
		expect(disabledImageHtml).toContain('data-rw-media-locked="disabled"');
		expect(disabledImageHtml).toContain('aria-disabled="true"');
		expect(disabledImageHtml).toContain('Image upload is locked.');

		const disabledFileHtml = renderToStaticMarkup(
			React.createElement(CompactMediaLockedBar, { isImage: false, isDisabled: true })
		);
		expect(disabledFileHtml).toContain('data-rw-media-locked="disabled"');
		expect(disabledFileHtml).toContain('File upload is locked.');

		const readOnlyHtml = renderToStaticMarkup(
			React.createElement(CompactMediaLockedBar, { isImage: true, isDisabled: false })
		);
		expect(readOnlyHtml).toContain('data-rw-media-locked="readonly"');
		expect(readOnlyHtml).toContain('No items selected.');
	});

	it('builds 4 technical link inline settings and manages multi-language link label/ariaLabel safely', () => {
		const flags = normalizeLinkConfigFlags({
			enableLabel: 0 as unknown as boolean,
			enableAriaLabel: true,
			enableTarget: true,
			enableRel: true,
			enableAnchor: true,
			enableQuery: true,
		});
		expect(flags).toEqual({
			enableLabel: false,
			enableAriaLabel: true,
			enableTarget: true,
			enableRel: true,
			enableAnchor: true,
			enableQuery: true,
		});

		const emptyMeta = buildLinkInlineSettingFields(
			{ enableLabel: true, enableAriaLabel: true },
			createEmptyLinkValue('url'),
			false
		);
		expect(emptyMeta.isTargetEmpty).toBe(true);
		expect(emptyMeta.fields.every((f) => f.disabled === true)).toBe(true);
		expect(emptyMeta.fields.map((f) => f.name)).toEqual([
			`${LINK_INLINE_SETTING_PREFIX}target`,
			`${LINK_INLINE_SETTING_PREFIX}rel`,
			`${LINK_INLINE_SETTING_PREFIX}anchor`,
			`${LINK_INLINE_SETTING_PREFIX}query`,
		]);

		const telMeta = buildLinkInlineSettingFields(
			undefined,
			{ type: 'tel', url: '+905551112233' },
			false
		);
		expect(telMeta.isTargetEmpty).toBe(false);
		expect(telMeta.fields.every((f) => f.disabled === false)).toBe(true);
		expect(telMeta.fields.map((f) => f.name)).toEqual([
			`${LINK_INLINE_SETTING_PREFIX}target`,
			`${LINK_INLINE_SETTING_PREFIX}rel`,
		]);

		const populatedMeta = buildLinkInlineSettingFields(
			undefined,
			{ type: 'url', url: 'https://example.com' },
			false
		);
		const patched = applyLinkSettingPatches(
			populatedMeta.normLink,
			{
				[`${LINK_INLINE_SETTING_PREFIX}target`]: '_blank',
				[`${LINK_INLINE_SETTING_PREFIX}anchor`]: '#hero',
				[`${LINK_INLINE_SETTING_PREFIX}query`]: '?ref=nav',
			},
			populatedMeta.flags
		);
		expect(patched.target).toBe('_blank');
		expect(patched.rel).toBe('noopener noreferrer');
		expect(patched.anchor).toBe('hero');
		expect(patched.query).toBe('ref=nav');

		const targetDef = populatedMeta.fields.find((f) => f.name === `${LINK_INLINE_SETTING_PREFIX}target`)!;
		expect(formatInlineSettingSummaryChip(targetDef, '_self')).toBeNull();
		expect(formatInlineSettingSummaryChip(targetDef, '_blank')).toBe('New tab');

		// Multi-language helpers preserve typing spaces and omit empty secondary maps cleanly
		const defLang = { id: 1010, name: 'default', title: 'English', isDefault: true, editable: true, inputName: 'l', value: '' };
		const trLang = { id: 1025, name: 'tr', title: 'Türkçe', isDefault: false, editable: true, inputName: 'l__1025', value: '' };
		const defStep = setLocalizedLinkText('', undefined, defLang, 'Explore ', true);
		expect(defStep).toEqual({ value: 'Explore ', map: undefined });
		expect(getLocalizedLinkText(defStep.value, defStep.map, trLang)).toBe('');

		const trStep = setLocalizedLinkText(defStep.value, defStep.map, trLang, 'İleri ', true);
		expect(trStep).toEqual({
			value: 'Explore ',
			map: { default: 'Explore ', '1025': 'İleri ' },
		});
		expect(getLocalizedLinkText(trStep.value, trStep.map, trLang)).toBe('İleri ');

		const clearedTr = setLocalizedLinkText(trStep.value, trStep.map, trLang, '', true);
		expect(clearedTr).toEqual({ value: 'Explore ', map: undefined });
	});
});
