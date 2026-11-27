import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
	badgeRadiusCssValue,
	clampIconSize,
	clampIconStrokeWidth,
	cleanIconIdentifier,
	formatIconLabel,
	ICON_ALIASES,
	normalizeIconValue,
	POPULAR_ICONS,
	resolveIconCustomizationFlags,
	sanitizeIconColor,
	sanitizeIconRadius,
	sanitizeIconVariant,
	serializeIconValueForInput,
} from '../../resources/ts/icons/iconTypes';
import { DynamicIcon, normalizeIconName, resolveCanonicalIconName } from '../../resources/ts/lib/utils';
import { queryIcons, renderSvgString, requestHydration } from '../../resources/ts/entries/ReactIcons';
import { IconFieldControl, renderTupleNodes } from '../../resources/ts/fields/controls/IconField';

describe('Centralized Vector Icon Utilities & Customization Model', () => {
	it('cleans icon class prefixes and formats human-friendly labels without raw slugs', () => {
		expect(cleanIconIdentifier('fa-sparkles')).toBe('sparkles');
		expect(cleanIconIdentifier('fas fa-compass')).toBe('compass');
		expect(cleanIconIdentifier('rwv--layout-dashboard')).toBe('layout-dashboard');
		expect(cleanIconIdentifier('rwv--brand-whatsapp')).toBe('brand-whatsapp');
		expect(cleanIconIdentifier('ti ti-arrow-right')).toBe('arrow-right');
		expect(cleanIconIdentifier('fa-rwv--rwvreplaced-bed')).toBe('fa-bed');
		expect(cleanIconIdentifier('rwv--so' + 'rwvreplaced-bed')).toBe('sofa-bed');
		expect(cleanIconIdentifier('uk-icon-anchor')).toBe('anchor');
		expect(cleanIconIdentifier('LayoutDashboard')).toBe('layout-dashboard');
		expect(normalizeIconName('rwv--sparkles')).toBe('sparkles');

		expect(formatIconLabel('brand-whatsapp')).toBe('WhatsApp');
		expect(formatIconLabel('brand-github')).toBe('GitHub');
		expect(formatIconLabel('a-large-small')).toBe('A Large Small');
		expect(formatIconLabel('arrow-right')).toBe('Arrow Right');
	});

	it('maps FontAwesome and shorthand identifiers cleanly and parses filled suffixes', () => {
		expect(normalizeIconValue('whatsapp').name).toBe('brand-whatsapp');
		expect(normalizeIconValue('fa-cog').name).toBe('settings');
		expect(normalizeIconValue('layers').name).toBe('stack-2');
		expect(normalizeIconValue('zap').name).toBe('bolt');

		const scalarFilled = normalizeIconValue('heart:filled');
		expect(scalarFilled.name).toBe('heart');
		expect(scalarFilled.variant).toBe('filled');

		const dashFilled = normalizeIconValue('rwv--star-filled');
		expect(dashFilled.name).toBe('star');
		expect(dashFilled.variant).toBe('filled');
	});

	it('sanitizes variants, colors, sizes, stroke widths, and badge radii strictly against injection', () => {
		expect(sanitizeIconVariant('filled')).toBe('filled');
		expect(sanitizeIconVariant('solid')).toBe('filled');
		expect(sanitizeIconVariant('outline')).toBe('outline');
		expect(sanitizeIconVariant('unknown')).toBe('outline');

		expect(sanitizeIconColor('#10b981')).toBe('#10b981');
		expect(sanitizeIconColor('var(--primary)')).toBe('var(--primary)');
		expect(sanitizeIconColor('currentColor')).toBe('');
		expect(sanitizeIconColor('red;background:url(javascript:alert(1))')).toBe('');
		expect(sanitizeIconColor('expression(alert(1))')).toBe('');

		expect(clampIconSize(8, 24)).toBe(12);
		expect(clampIconSize(500, 24)).toBe(96);
		expect(clampIconSize('32', 24)).toBe(32);
		expect(clampIconSize('nan', 24)).toBe(24);

		expect(clampIconStrokeWidth(0.2, 2)).toBe(1);
		expect(clampIconStrokeWidth(9, 2)).toBe(3);
		expect(clampIconStrokeWidth(1.75, 2)).toBe(1.75);

		expect(sanitizeIconRadius('full')).toBe('full');
		expect(sanitizeIconRadius('invalid-radius')).toBe('md');
		expect(badgeRadiusCssValue('full')).toBe('9999px');
	});

	it('resolves master and granular customization flags and serializes scalar vs JSON payloads', () => {
		const off = resolveIconCustomizationFlags({ allowCustomization: false });
		expect(off.allowCustomization).toBe(false);
		expect(off.allowVariant).toBe(false);

		const val = normalizeIconValue({
			name: 'fa-sparkles',
			variant: 'filled',
			size: 32,
			color: '#0284c7',
			strokeWidth: 1.5,
			background: '#e0f2fe',
			radius: 'full',
		});

		expect(serializeIconValueForInput(val, off, 'none')).toBe('sparkles-filled');
		expect(serializeIconValueForInput(val, off, 'vector')).toBe('rwv--sparkles-filled');

		const partial = resolveIconCustomizationFlags({
			allowCustomization: true,
			allowVariant: true,
			allowSize: true,
			allowColor: true,
			allowStrokeWidth: false,
			allowBackground: false,
		});
		const encoded = serializeIconValueForInput(val, partial);
		const parsed = JSON.parse(encoded);
		expect(parsed).toEqual({
			name: 'sparkles',
			variant: 'filled',
			size: 32,
			color: '#0284c7',
			strokeWidth: 2,
			background: '',
			radius: 'md',
		});
	});

	it('renders DynamicIcon for both scalar names and customized JSON badge payloads', () => {
		const scalarHtml = renderToStaticMarkup(React.createElement(DynamicIcon, { name: 'anchor' }));
		expect(scalarHtml).toContain('<svg');

		const customJson = JSON.stringify({
			name: 'anchor',
			variant: 'outline',
			size: 30,
			color: '#16a34a',
			strokeWidth: 1.5,
			background: '#dcfce7',
			radius: 'full',
		});
		const badgeHtml = renderToStaticMarkup(React.createElement(DynamicIcon, { name: customJson }));
		expect(badgeHtml).toContain('rw-icon-badge');
		expect(badgeHtml).toContain('border-radius:9999px');
		expect(badgeHtml).toContain('width="30"');
		expect(badgeHtml).toContain('stroke-width="1.5"');

		expect(Object.keys(ICON_ALIASES).length).toBeGreaterThan(200);
		expect(resolveCanonicalIconName('sliders-horizontal')).toBe('adjustments-horizontal');
		expect(resolveCanonicalIconName('arrow-left-right')).toBe('arrows-left-right');
		expect(resolveCanonicalIconName('list-plus')).toBe('playlist-add');
		expect(resolveCanonicalIconName('columns')).toBe('columns');
		expect(resolveCanonicalIconName('{"name":"layers","variant":"filled"}')).toBe('stack-2-filled');
		expect(POPULAR_ICONS.length).toBeGreaterThanOrEqual(20);

		const clientSvg = renderSvgString('sparkles', { className: 'extra-cls' });
		expect(clientSvg).toContain('class="rw-icon rw-icon-sparkles extra-cls"');
		expect(clientSvg).not.toContain('ti ti-');
	});

	it('schedules subsequent microtask batches when hydrating more than 80 distinct icons', async () => {
		const originalFetch = globalThis.fetch;
		const requestedUrls: string[] = [];
		try {
			globalThis.fetch = (async (input: RequestInfo | URL) => {
				requestedUrls.push(String(input));
				return {
					ok: true,
					json: async () => ({ icons: {} }),
				} as Response;
			}) as typeof fetch;

			for (let i = 0; i < 120; i += 1) {
				requestHydration(`batch-test-icon-${i}`);
			}

			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(requestedUrls.length).toBe(2);
			const firstNames = new URLSearchParams(requestedUrls[0].split('?')[1] ?? '').get('names')?.split(',') ?? [];
			const secondNames = new URLSearchParams(requestedUrls[1].split('?')[1] ?? '').get('names')?.split(',') ?? [];
			expect(firstNames).toHaveLength(80);
			expect(secondNames).toHaveLength(40);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('strips unsafe SVG tags, on* handlers, dangerouslySetInnerHTML, href/xlink:href, and unsafe style URIs in ReactIcons and IconField', async () => {
		const originalFetch = globalThis.fetch;
		try {
			globalThis.fetch = (async () =>
				new Response(
					JSON.stringify({
						ok: true,
						total: 1,
						offset: 0,
						limit: 96,
						hasMore: false,
						items: [
							{
								name: 'xss-probe',
								label: 'XSS Probe',
								category: 'general',
								hasFilled: false,
								outline: [
									[
										'path',
										{
											d: 'M4 4h16v16H4z',
											onclick: 'alert(1)',
											OnLoad: 'alert(2)',
											dangerouslySetInnerHTML: 'bad',
											href: 'javascript:alert(3)',
											'xlink:href': 'data:text/html,<script>',
											style: 'background:url(javascript:alert(4))',
											'123bad': 'nope',
										},
									],
									['script', { src: 'evil.js' }],
									['foreignObject', { width: '10' }],
								],
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)) as typeof fetch;

			await queryIcons({ q: 'xss-probe' });
			const svg = renderSvgString('xss-probe');
			expect(svg).toContain('<path d="M4 4h16v16H4z"/>');
			expect(svg).not.toContain('onclick');
			expect(svg).not.toContain('OnLoad');
			expect(svg).not.toContain('dangerouslySetInnerHTML');
			expect(svg).not.toContain('href=');
			expect(svg).not.toContain('xlink:href');
			expect(svg).not.toContain('javascript:');
			expect(svg).not.toContain('<script');
			expect(svg).not.toContain('<foreignObject');
		} finally {
			globalThis.fetch = originalFetch;
		}

		const renderedNodesHtml = renderToStaticMarkup(
			React.createElement(
				'svg',
				null,
				renderTupleNodes([
					[
						'path',
						{
							d: 'M2 2h20',
							onmouseover: 'alert(1)',
							dangerouslySetInnerHTML: 'nope',
							href: 'javascript:alert(1)',
							'xlink:href': '#evil',
							style: 'fill:url(data:image/svg+xml;base64,PHN2Zz4=)',
						},
					],
					['script', { type: 'text/javascript' }],
				])
			)
		);
		expect(renderedNodesHtml).toContain('<path d="M2 2h20"></path>');
		expect(renderedNodesHtml).not.toContain('onmouseover');
		expect(renderedNodesHtml).not.toContain('href');
		expect(renderedNodesHtml).not.toContain('style');
		expect(renderedNodesHtml).not.toContain('<script');
	});

	it('renders IconFieldControl empty trigger with custom placeholder matching accessible name (WCAG 2.5.3)', () => {
		const html = renderToStaticMarkup(
			React.createElement(IconFieldControl, {
				controlType: 'icon',
				id: 'f_icon',
				name: 'icon',
				value: '',
				placeholder: 'Choose badge icon',
			})
		);
		expect(html).toContain('Choose badge icon');
		expect(html).not.toContain('aria-label="Select an icon..."');
	});
});
