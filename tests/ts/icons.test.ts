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
import { renderSvgString } from '../../resources/ts/entries/ReactIcons';

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
});
