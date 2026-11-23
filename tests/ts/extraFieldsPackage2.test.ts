import React from 'react';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
	ColorField,
	normalizeHexColor,
	parseColorWithAlpha,
	rgbaToHex,
} from '../../resources/ts/fields/controls/ColorField';
import {
	mergeUniqueTags,
	normalizeTagsValue,
	parseTagsInput,
	TagsField,
} from '../../resources/ts/fields/controls/TagsField';
import { ComboboxField } from '../../resources/ts/fields/controls/ComboboxField';
import {
	formatDecimalNumber,
	normalizeUnitNumberValue,
	UnitNumberField,
} from '../../resources/ts/fields/controls/UnitNumberField';
import { SegmentedField } from '../../resources/ts/fields/controls/SegmentedField';
import { TextField } from '../../resources/ts/fields/controls/TextField';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const MODULE_DIR = resolve(THIS_DIR, '../..');

describe('Package 2 Extended Form Controls (Color, Tags, Combobox, UnitNumber, Segmented)', () => {
	it('normalizes hex/rgba colors, tags lists, and unit-number payloads accurately', () => {
		expect(normalizeHexColor('f0a')).toBe('#ff00aa');
		expect(normalizeHexColor('#3B82F6')).toBe('#3b82f6');
		expect(normalizeHexColor('invalid')).toBe('');

		expect(parseColorWithAlpha('#eb1d61')).toEqual({ hex6: '#eb1d61', alpha: 100 });
		expect(parseColorWithAlpha('rgba(235, 29, 97, 0.5)')).toEqual({ hex6: '#eb1d61', alpha: 50 });
		expect(rgbaToHex('#eb1d61', 100)).toBe('#eb1d61');
		expect(rgbaToHex('#eb1d61', 50)).toBe('#eb1d6180');

		expect(parseTagsInput('alpha, beta;\ngamma')).toEqual(['alpha', 'beta', 'gamma']);
		expect(normalizeTagsValue('["one","two"]')).toEqual(['one', 'two']);
		expect(
			mergeUniqueTags(['Alpha'], ['alpha', 'Beta', 'Gamma'], {
				maxItems: 2,
			})
		).toEqual(['Alpha', 'Beta']);
		expect(
			mergeUniqueTags([], ['PHP', 'unknown'], {
				allowed: ['php', 'typescript'],
			})
		).toEqual(['php']);

		expect(normalizeUnitNumberValue('24px', 'rem')).toEqual({ value: 24, unit: 'px' });
		expect(normalizeUnitNumberValue(15, 'EUR')).toEqual({ value: 15, unit: 'EUR' });
		expect(normalizeUnitNumberValue('', 'px')).toEqual({ value: null, unit: 'px' });
		expect(formatDecimalNumber(1250.5, { locale: 'en-US', precision: 2 })).toBe('1,250.50');
	});

	it('renders accessible control names in SSR and omits hidden mirrors when inlinePortal is true', () => {
		const colorPrimary = renderToStaticMarkup(
			React.createElement(ColorField, {
				controlType: 'color',
				id: 'f_color',
				name: 'accent_color',
				value: '#eb1d61',
			})
		);
		expect(colorPrimary).toContain('data-rw-control="color"');
		expect(colorPrimary).toContain('name="accent_color"');

		const colorRoInline = renderToStaticMarkup(
			React.createElement(ColorField, {
				controlType: 'color',
				id: 'f_color_ro',
				name: 'accent_color',
				value: '#eb1d61',
				readOnly: true,
				inlinePortal: true,
			})
		);
		expect(colorRoInline).not.toContain('type="hidden"');

		const tagsPrimary = renderToStaticMarkup(
			React.createElement(TagsField, {
				controlType: 'tags',
				id: 'f_tags',
				name: 'post_tags',
				value: ['news', 'featured'],
			})
		);
		expect(tagsPrimary).toContain('data-rw-control="tags"');
		expect(tagsPrimary).toContain('name="post_tags[]"');

		const tagsInline = renderToStaticMarkup(
			React.createElement(TagsField, {
				controlType: 'tags',
				id: 'f_tags_inline',
				name: 'post_tags',
				value: ['news'],
				inlinePortal: true,
			})
		);
		expect(tagsInline).not.toContain('type="hidden"');

		const comboboxPrimary = renderToStaticMarkup(
			React.createElement(ComboboxField, {
				controlType: 'combobox',
				id: 'f_cbx',
				name: 'template_kind',
				value: 'article',
				options: [{ value: 'article', label: 'Article' }],
			})
		);
		expect(comboboxPrimary).toContain('data-rw-control="combobox"');
		expect(comboboxPrimary).toContain('name="template_kind"');

		const comboboxInline = renderToStaticMarkup(
			React.createElement(ComboboxField, {
				controlType: 'combobox',
				id: 'f_cbx_inline',
				name: 'template_kind',
				value: 'article',
				inlinePortal: true,
				options: [{ value: 'article', label: 'Article' }],
			})
		);
		expect(comboboxInline).not.toContain('name="template_kind"');

		const unitPrimary = renderToStaticMarkup(
			React.createElement(UnitNumberField, {
				controlType: 'unit_number',
				id: 'f_unit',
				name: 'gap_size',
				value: { value: 24, unit: 'px' },
			})
		);
		expect(unitPrimary).toContain('data-rw-control="unit-number"');
		expect(unitPrimary).toContain('name="gap_size"');

		const unitInline = renderToStaticMarkup(
			React.createElement(UnitNumberField, {
				controlType: 'unit_number',
				id: 'f_unit_inline',
				name: 'gap_size',
				value: { value: 24, unit: 'px' },
				inlinePortal: true,
			})
		);
		expect(unitInline).not.toContain('type="hidden"');

		const segPrimary = renderToStaticMarkup(
			React.createElement(SegmentedField, {
				controlType: 'segmented',
				id: 'f_seg',
				name: 'align_mode',
				value: 'grid',
				options: [{ value: 'grid', label: 'Grid' }],
			})
		);
		expect(segPrimary).toContain('data-rw-control="segmented"');
		expect(segPrimary).toContain('name="align_mode"');

		const segInline = renderToStaticMarkup(
			React.createElement(SegmentedField, {
				controlType: 'segmented',
				id: 'f_seg_inline',
				name: 'align_mode',
				value: 'grid',
				inlinePortal: true,
				options: [{ value: 'grid', label: 'Grid' }],
			})
		);
		expect(segInline).not.toContain('type="hidden"');

		const unitCurrencyVariant = renderToStaticMarkup(
			React.createElement(UnitNumberField, {
				controlType: 'unit_number',
				id: 'f_unit_currency',
				name: 'deposit',
				unitVariant: 'currency',
				value: { value: 450, unit: 'EUR' },
			})
		);
		expect(unitCurrencyVariant).toContain('<option value="EUR"');
		expect(unitCurrencyVariant).toContain('<option value="USD"');
		expect(unitCurrencyVariant).toContain('<option value="TRY"');
		expect(unitCurrencyVariant).toContain('<option value="GBP"');

		const segMultiple = renderToStaticMarkup(
			React.createElement(SegmentedField, {
				controlType: 'segmented',
				id: 'f_seg_multi',
				name: 'features',
				multiple: true,
				value: ['wifi', 'ac'],
				options: [
					{ value: 'wifi', label: 'Wi-Fi' },
					{ value: 'solar', label: 'Solar' },
					{ value: 'ac', label: 'AC' },
				],
			})
		);
		expect(segMultiple).toContain('role="group"');
		expect(segMultiple).toContain('name="features[]"');
		expect(segMultiple).toContain('aria-pressed="true"');
	});

	it('renders secret Generate button strictly when secret.autogen !== false', () => {
		const withoutAutogen = renderToStaticMarkup(
			React.createElement(TextField, {
				id: 'api_key',
				name: 'api_key',
				label: 'External API Key',
				controlType: 'text',
				value: 'qd_1234',
				secret: { masked: true, prefix: 'qd_', bytes: 24, autogen: false },
			})
		);
		expect(withoutAutogen).toContain('Reveal secret');
		expect(withoutAutogen).toContain('Copy secret');
		expect(withoutAutogen).not.toContain('Generate new secret');

		const withAutogen = renderToStaticMarkup(
			React.createElement(TextField, {
				id: 'signing_key',
				name: 'signing_key',
				label: 'Signing Key',
				controlType: 'text',
				value: 'wh_1234',
				secret: { masked: true, prefix: 'wh_', bytes: 32, autogen: true },
			})
		);
		expect(withAutogen).toContain('Generate new secret');
	});

	it('hydrates ReactExtraFields.js controls lazily under strict CSP without eval', () => {
		const distDir = resolve(MODULE_DIR, 'dist');
		const inspectScript = `
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function makeStubEl(tag = 'div') {
	return {
		tagName: String(tag).toUpperCase(),
		href: '',
		rel: '',
		src: '',
		async: false,
		attributes: {},
		matches: () => false,
		querySelectorAll: () => [],
		querySelector: () => null,
		appendChild: (c) => c,
		removeChild: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		getAttribute: (k) => (k === 'href' ? '' : null),
		setAttribute: () => {},
		removeAttribute: () => {},
		hasAttribute: () => false,
		classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
		dataset: {},
		style: {},
	};
}

globalThis.HTMLElement = class HTMLElement {};
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.history = { state: null, scrollRestoration: 'auto', pushState: () => {}, replaceState: () => {} };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
globalThis.localStorage = globalThis.sessionStorage;
globalThis.location = { href: 'http://localhost/admin/', origin: 'http://localhost', pathname: '/admin/', search: '', hash: '' };
globalThis.document = {
	readyState: 'loading',
	body: makeStubEl('body'),
	head: makeStubEl('head'),
	documentElement: makeStubEl('html'),
	getElementById: () => null,
	querySelector: () => null,
	querySelectorAll: () => [],
	createElement: (tag) => makeStubEl(tag),
	addEventListener: () => {},
	removeEventListener: () => {},
};

const distDir = process.argv[1];
vm.runInThisContext(fs.readFileSync(path.join(distDir, 'ReactInertia.js'), 'utf8'), { filename: 'ReactInertia.js' });
const rt = globalThis.ReactWorkspaceRuntime;
const lazyColor = rt.Fields.ColorFieldControl;
const hasLoaderBefore = typeof rt.ensureExtraFieldsLoaded === 'function';

vm.runInThisContext(fs.readFileSync(path.join(distDir, 'ReactExtraFields.js'), 'utf8'), { filename: 'ReactExtraFields.js' });

console.log(JSON.stringify({
	hasLoaderBefore,
	colorReplaced: typeof rt.Fields.ColorFieldControl === 'function' && rt.Fields.ColorFieldControl !== lazyColor,
	hasTags: typeof rt.Fields.TagsFieldControl === 'function',
	hasCombobox: typeof rt.Fields.ComboboxFieldControl === 'function',
	hasUnitNumber: typeof rt.Fields.UnitNumberFieldControl === 'function',
	hasSegmented: typeof rt.Fields.SegmentedFieldControl === 'function',
}));
`;
		const raw = execFileSync(
			process.execPath,
			['--disallow-code-generation-from-strings', '-e', inspectScript, distDir],
			{ cwd: MODULE_DIR, encoding: 'utf8' }
		);
		const result = JSON.parse(raw.trim()) as Record<string, boolean>;
		expect(result).toEqual({
			hasLoaderBefore: true,
			colorReplaced: true,
			hasTags: true,
			hasCombobox: true,
			hasUnitNumber: true,
			hasSegmented: true,
		});
	});
});
