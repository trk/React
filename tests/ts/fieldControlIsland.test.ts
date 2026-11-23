import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
	buildStandaloneControlProps,
	resolveCanonicalControlType,
} from '../../resources/ts/fields/controlProps';
import { ExtraFieldControlIsland } from '../../resources/ts/fields/controls/ExtraFieldControlIsland';
import { FieldControlIsland } from '../../resources/ts/fields/schema/FieldControlIsland';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MODULE_DIR = path.resolve(THIS_DIR, '../..');

describe('Standalone React Control Islands & Props Normalization', () => {
	it('normalizes canonical control aliases and standalone props cleanly', () => {
		expect(resolveCanonicalControlType('phone_number')).toBe('phone');
		expect(resolveCanonicalControlType('country')).toBe('combobox');
		expect(resolveCanonicalControlType('countries')).toBe('combobox');
		expect(resolveCanonicalControlType('timezone')).toBe('combobox');
		expect(resolveCanonicalControlType('currency_code')).toBe('combobox');
		expect(resolveCanonicalControlType('currency')).toBe('unit_number');
		expect(resolveCanonicalControlType('money')).toBe('unit_number');
		expect(resolveCanonicalControlType('box_spacing')).toBe('spacing');
		expect(resolveCanonicalControlType('button_group')).toBe('segmented');
		expect(resolveCanonicalControlType('condition-builder')).toBe('condition_builder');
		expect(resolveCanonicalControlType('range-slider')).toBe('range_slider');
		expect(resolveCanonicalControlType('slug')).toBe('text');
		expect(resolveCanonicalControlType('secret')).toBe('text');

		const dateProps = buildStandaloneControlProps(
			{
				name: 'event_dt',
				type: 'datetime',
				datetimeMode: 'picker',
				hourFormat: '24h',
				minuteStep: 15,
			},
			'2026-06-15T14:30',
		);
		expect(dateProps.controlType).toBe('datetime');
		expect(dateProps.datetime?.mode).toBe('picker');
		expect(dateProps.datetime?.hasTime).toBe(true);
		expect(dateProps.datetime?.minuteStep).toBe(15);

		const secretProps = buildStandaloneControlProps(
			{
				name: 'api_token',
				type: 'text',
				isSecret: true,
				secretMasked: true,
				secretPrefix: 'pk_',
				secretBytes: 16,
				maxLength: 96,
			},
			'pk_test_123',
		);
		expect(secretProps.controlType).toBe('text');
		expect(secretProps.secret).toEqual({
			masked: true,
			prefix: 'pk_',
			bytes: 16,
			autogen: true,
		});
		expect(secretProps.slugMaxLength).toBe(96);
	});

	it('renders ExtraFieldControlIsland for phone, combobox, color, tags, segmented multi, and read-only mode', () => {
		const phoneHtml = renderToStaticMarkup(
			React.createElement(ExtraFieldControlIsland, {
				control: {
					id: 'Inputfield_phone',
					name: 'auth_profile_phone',
					type: 'phone',
					value: '+905321234567',
					defaultCountry: 'TR',
					phoneCountries: [{ code: 'TR', name: 'Turkey', dial: '90' }],
				},
			}),
		);
		expect(phoneHtml).toContain('data-rw-standalone-control="phone"');
		expect(phoneHtml).toContain('data-rw-control="phone"');
		expect(phoneHtml).toContain('name="auth_profile_phone"');
		expect(phoneHtml).toContain('value="+905321234567"');

		const comboboxMultiHtml = renderToStaticMarkup(
			React.createElement(ExtraFieldControlIsland, {
				control: {
					id: 'Inputfield_countries',
					name: 'allowed_countries',
					type: 'combobox',
					multiple: true,
					value: ['TR', 'DE'],
					options: [
						{ value: 'TR', label: 'Turkey' },
						{ value: 'DE', label: 'Germany' },
					],
				},
			}),
		);
		expect(comboboxMultiHtml).toContain('data-rw-standalone-control="combobox"');
		expect(comboboxMultiHtml).toContain('name="allowed_countries_present"');
		expect(comboboxMultiHtml).toContain('name="allowed_countries[]"');

		const segmentedMultiHtml = renderToStaticMarkup(
			React.createElement(ExtraFieldControlIsland, {
				control: {
					id: 'Inputfield_days',
					name: 'active_days',
					type: 'segmented',
					multiple: true,
					value: ['mon', 'wed'],
					options: [
						{ value: 'mon', label: 'Mon' },
						{ value: 'wed', label: 'Wed' },
					],
				},
			}),
		);
		expect(segmentedMultiHtml).toContain('name="active_days_present"');
		expect(segmentedMultiHtml).toContain('name="active_days[]"');

		const colorRoHtml = renderToStaticMarkup(
			React.createElement(ExtraFieldControlIsland, {
				control: {
					id: 'Inputfield_brand',
					name: 'brand_color',
					type: 'color',
					value: '#2563eb',
					renderValueMode: true,
					readOnly: true,
				},
			}),
		);
		expect(colorRoHtml).toContain('data-rw-control="color"');
	});

	it('renders FieldControlIsland for rating, range_slider, calculation, slug, and calendar controls', () => {
		const ratingHtml = renderToStaticMarkup(
			React.createElement(FieldControlIsland, {
				control: {
					id: 'Inputfield_stars',
					name: 'stars',
					type: 'rating',
					value: '4',
					maxStars: 5,
				},
			}),
		);
		expect(ratingHtml).toContain('data-rw-standalone-control="rating"');
		expect(ratingHtml).toContain('name="stars"');

		const calcHtml = renderToStaticMarkup(
			React.createElement(FieldControlIsland, {
				control: {
					id: 'Inputfield_total',
					name: 'total',
					type: 'calculation',
					formula: 'price * qty',
					precision: 2,
					value: '0',
				},
			}),
		);
		expect(calcHtml).toContain('data-rw-standalone-control="calculation"');
		expect(calcHtml).toContain('data-rw-control="calculation"');
		expect(calcHtml).toContain('name="total"');

		const dateHtml = renderToStaticMarkup(
			React.createElement(FieldControlIsland, {
				control: {
					id: 'Inputfield_due',
					name: 'due_date',
					type: 'date',
					value: '2026-06-01',
				},
			}),
		);
		expect(dateHtml).toContain('data-rw-standalone-control="date"');
		expect(dateHtml).toContain('name="due_date"');
	});

	it('registers ExtraFieldControl in ReactExtraFields.js and FieldControl in SchemaForm.js cleanly', () => {
		const distDir = path.join(MODULE_DIR, 'dist');
		const g = globalThis as unknown as Record<string, unknown>;
		const prevWin = g.window;
		const provided: Record<string, unknown> = {};
		const registeredIslands: Record<string, unknown> = {};

		g.window = {
			ReactWorkspaceRuntime: {
				React,
				ReactDOM: {},
				ReactDOMClient: {},
				jsxRuntime: {},
				Inertia: {},
				UI: new Proxy(
					{},
					{
						get: () => () => null,
					},
				),
				Hooks: new Proxy(
					{},
					{
						get: () => () => undefined,
					},
				),
				Utils: {
					cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
					DynamicIcon: () => null,
					t: (_k: string, fallback = '') => fallback,
					translate: (_k: string, fallback = '') => fallback,
					sanitizeHref: (u: string) => u,
					sanitizeSameOriginUrl: (u: string) => u,
				},
				__provideFields: (fields: Record<string, unknown>) => Object.assign(provided, fields),
				registerIslands: (islands: Record<string, unknown>) =>
					Object.assign(registeredIslands, islands),
				registerPages: () => undefined,
			},
		};

		try {
			vm.runInThisContext(fs.readFileSync(path.join(distDir, 'ReactExtraFields.js'), 'utf8'), {
				filename: 'ReactExtraFields.js',
			});
			expect(typeof provided.ExtraFieldControlIsland).toBe('function');
			expect(typeof registeredIslands['ReactWorkspace/ExtraFieldControl']).toBe('function');
			expect(provided.SchemaForm).toBeUndefined();

			vm.runInThisContext(fs.readFileSync(path.join(distDir, 'SchemaForm.js'), 'utf8'), {
				filename: 'SchemaForm.js',
			});
			expect(typeof provided.FieldControlIsland).toBe('function');
			expect(typeof registeredIslands['ReactWorkspace/FieldControl']).toBe('function');
			expect(typeof provided.SchemaForm).toBe('function');
		} finally {
			if (prevWin === undefined) {
				delete g.window;
			} else {
				g.window = prevWin;
			}
		}
	});
});
