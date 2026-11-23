import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextField, toSafeHtmlPatternAttr } from '../../resources/ts/fields/controls/TextField';
import { ToggleField } from '../../resources/ts/fields/controls/ToggleField';
import {
	evaluateCondition,
	evaluateShowIfCondition,
	lookupScopedFieldValue,
	resolveFieldState,
} from '../../resources/ts/fields/shared';
import { validateFieldWithValibot, validateSchemaTree } from '../../resources/ts/fields/validation';
import type { SchemaFieldDefinition, SchemaFormPayload } from '../../resources/ts/fields/types';

describe('SchemaForm Valibot Validation & Conditional Engine', () => {
	it('evaluates ProcessWire showIf / requiredIf operators including OR, AND, count, and scopePrefix', () => {
		const values = {
			status: 'published',
			tags: ['news', 'featured'],
			guest_count: 6,
			rep_0_kind: 'custom',
			rep_0_custom_label: '',
		};

		expect(evaluateShowIfCondition('status=published|archived', values)).toBe(true);
		expect(evaluateShowIfCondition('status!=published', values)).toBe(false);
		expect(evaluateShowIfCondition('tags.count>1, guest_count>=6', values)).toBe(true);
		expect(evaluateShowIfCondition('status*=pub', values)).toBe(true);
		expect(evaluateShowIfCondition('status^=pub, status$=shed', values)).toBe(true);
		expect(evaluateShowIfCondition('kind=custom', values, 'rep_0')).toBe(true);

		const scopedField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'text',
			name: 'rep_0_custom_label',
			label: 'Custom Label',
			showIf: 'kind=custom',
			requiredIf: 'kind=custom',
		};
		const state = resolveFieldState(scopedField, values, 'rep_0');
		expect(state.visible).toBe(true);
		expect(state.required).toBe(true);
		expect(validateFieldWithValibot(scopedField, '', values, 'rep_0')).toContain('required');
	});

	it('skips validation when field is hidden via showIf or disabled via disableIf', () => {
		const hiddenField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'email',
			name: 'contact_email',
			label: 'Contact Email',
			required: true,
			showIf: 'enable_contact=1',
		};

		expect(validateFieldWithValibot(hiddenField, '', { enable_contact: '0' })).toBeNull();
		expect(validateFieldWithValibot(hiddenField, 'not-an-email', { enable_contact: '0' })).toBeNull();
		expect(validateFieldWithValibot(hiddenField, 'not-an-email', { enable_contact: '1' })).not.toBeNull();
	});

	it('enforces email, url, min/max, pattern, ReDoS guard, and cross-field rules', () => {
		const emailField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'email',
			name: 'email',
			label: 'Email',
			required: true,
		};
		expect(validateFieldWithValibot(emailField, 'invalid-email', { email: 'invalid-email' })).not.toBeNull();
		expect(validateFieldWithValibot(emailField, 'ops@example.com', { email: 'ops@example.com' })).toBeNull();

		const redosField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'text',
			name: 'code',
			label: 'Code',
			validation: {
				pattern: '^(a+)+$',
			},
		};
		// Unsafe nested quantifier regex is neutralized by compileFlexibleRegex in <25ms without freezing the main thread
		const startMs = performance.now();
		expect(
			validateFieldWithValibot(redosField, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa!', {
				code: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa!',
			})
		).toBeNull();
		expect(performance.now() - startMs).toBeLessThan(25);

		const safePatternField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'text',
			name: 'sku',
			label: 'SKU',
			validation: {
				pattern: '/^[A-Z]{3}-[0-9]{4}$/',
			},
		};
		expect(validateFieldWithValibot(safePatternField, 'bad', { sku: 'bad' })).not.toBeNull();
		expect(validateFieldWithValibot(safePatternField, 'PRD-2026', { sku: 'PRD-2026' })).toBeNull();

		const barePatternField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'text',
			name: 'serial',
			label: 'Serial',
			pattern: '^[A-Z]{2}[0-9]{2}$',
		};
		expect(validateFieldWithValibot(barePatternField, 'no', { serial: 'no' })).not.toBeNull();
		expect(validateFieldWithValibot(barePatternField, 'AB42', { serial: 'AB42' })).toBeNull();

		const confirmField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'text',
			name: 'password_confirm',
			label: 'Confirm Password',
			validation: {
				equalsField: 'password',
			},
		};
		expect(
			validateFieldWithValibot(confirmField, 'wrong', { password: 'secret', password_confirm: 'wrong' })
		).toContain('match');
		expect(
			validateFieldWithValibot(confirmField, 'secret', { password: 'secret', password_confirm: 'secret' })
		).toBeNull();
	});

	it('auto-derives slug connection values and validates multi-language fallback values', () => {
		const slugField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'text',
			name: 'slug',
			label: 'Slug',
			required: true,
			slugFrom: 'title',
		};
		expect(validateFieldWithValibot(slugField, '', { title: 'Hello World', slug: '' })).toBeNull();
		expect(validateFieldWithValibot(slugField, '', { title: '', slug: '' })).toContain('required');

		const i18nField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'text',
			name: 'headline',
			label: 'Headline',
			required: true,
			useLanguages: true,
			languages: [
				{ id: 1010, name: 'default', title: 'EN', isDefault: true, inputName: 'headline', value: 'Default Ready' },
				{ id: 1020, name: 'tr', title: 'TR', isDefault: false, inputName: 'headline__1020', value: '' },
			],
		};
		expect(validateFieldWithValibot(i18nField, '', {})).toBeNull();
	});

	it('validates nested tabs, wizard steps, and registered block collections with ancestor propagation', () => {
		const schema: SchemaFormPayload = {
			id: 'test_form',
			name: 'test_form',
			tabs: [
				{
					id: 'tab_general',
					label: 'General',
					fields: [{ kind: 'control', type: 'text', name: 'title', label: 'Title', required: true }],
				},
				{
					id: 'tab_seo',
					label: 'SEO',
					fields: [{ kind: 'control', type: 'text', name: 'meta_title', label: 'Meta Title', required: true }],
				},
			],
			fields: [
				{ kind: 'control', type: 'text', name: 'step1_name', label: 'Step 1 Name', required: true, stepIndex: 1 },
				{ kind: 'control', type: 'text', name: 'step2_goal', label: 'Step 2 Goal', required: true, stepIndex: 2 },
			],
		};

		// Step-scoped validation checks only step 1
		const step1Result = validateSchemaTree(
			schema,
			{ step1_name: 'Valid Step 1', step2_goal: '' },
			{ stepIndex: 1 }
		);
		expect(step1Result.valid).toBe(true);

		let reportedFailedIds: string[] = [];
		const fullResult = validateSchemaTree(
			schema,
			{
				title: 'Ready',
				meta_title: '',
				step1_name: 'Done',
				step2_goal: 'Done',
				weblock_parent1_child1_cta: '',
			},
			{
				registeredBlocks: [
					{
						fieldName: 'content_blocks',
						label: 'Content Blocks',
						minItems: 1,
						getBlocks: () => [
							{
								id: 'block_parent',
								status: 1,
								prefix: 'weblock_parent1',
								schema: { fields: [] },
							},
							{
								id: 'block_child',
								status: 1,
								prefix: 'weblock_parent1_child1',
								schema: {
									fields: [
										{
											kind: 'control',
											type: 'text',
											name: 'weblock_parent1_child1_cta',
											label: 'CTA Label',
											required: true,
										},
									],
								},
							},
							{
								id: 'block_hidden',
								status: 2048, // unpublished -> skipped
								prefix: 'weblock_hidden',
								schema: {
									fields: [
										{
											kind: 'control',
											type: 'text',
											name: 'weblock_hidden_req',
											label: 'Hidden Required',
											required: true,
										},
									],
								},
							},
						],
						onValidationResult: (failedIds) => {
							reportedFailedIds = failedIds;
						},
					},
				],
			}
		);

		expect(fullResult.valid).toBe(false);
		expect(fullResult.failedTabIds).toContain('tab_seo');
		expect(fullResult.failedTabIds).not.toContain('tab_general');
		expect(fullResult.failedBlockIds).toContain('block_child');
		// Ancestor block auto-expands when child block fails
		expect(fullResult.failedBlockIds).toContain('block_parent');
		expect(fullResult.failedBlockIds).not.toContain('block_hidden');
		expect(reportedFailedIds).toEqual(expect.arrayContaining(['block_parent', 'block_child']));
	});

	it('distinguishes empty strings from missing keys via lookupScopedFieldValue and evaluates JSON link strings, localized maps, and boolean expressions', () => {
		const emptyExplicit = lookupScopedFieldValue({ prefix_opt: '' }, 'opt', 'prefix');
		const missingKey = lookupScopedFieldValue({}, 'opt', 'prefix');
		expect(emptyExplicit).toEqual({ found: true, value: '' });
		expect(missingKey).toEqual({ found: false, value: undefined });

		const emptyLinkJson = JSON.stringify({ type: 'page', pageId: 0, url: '', entryId: '', file: '' });
		const filledLinkJson = JSON.stringify({ type: 'url', pageId: 0, url: 'https://example.com' });
		expect(evaluateCondition('cta', { cta: emptyLinkJson })).toBe(false);
		expect(evaluateCondition('!cta', { cta: emptyLinkJson })).toBe(true);
		expect(evaluateCondition('cta', { cta: filledLinkJson })).toBe(true);
		expect(evaluateCondition('cta!=0|', { cta: emptyLinkJson })).toBe(false);
		expect(evaluateCondition('cta!=0|', { cta: filledLinkJson })).toBe(true);

		expect(evaluateCondition('caption', { caption: { default: '', tr: '' } })).toBe(false);
		expect(evaluateCondition('caption', { caption: { default: '', tr: 'Merhaba' } })).toBe(true);

		const values = {
			media: { type: 'image', pageId: 0, url: '', file: 'hero.jpg' },
			media_align: 'left',
			locked: '0',
			badge_mode: 'pill',
		};
		expect(
			evaluateCondition("media && (media_align == 'left' || media_align == 'right')", values)
		).toBe(true);
		expect(
			evaluateCondition("media && (media_align == 'left' || media_align == 'right')", {
				...values,
				media_align: 'top',
			})
		).toBe(false);
		expect(evaluateCondition("!(locked == '1' || badge_mode == 'none')", values)).toBe(true);
		expect(
			evaluateCondition("!(locked == '1' || badge_mode == 'none')", { ...values, locked: '1' })
		).toBe(false);

		const stateField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'text',
			name: 'alt_caption',
			label: 'Alt Caption',
			required: true,
			requiredIf: "badge_mode == 'pill'",
			showIf: "media && media.type == 'image'",
			hideIf: "media_align == 'hidden'",
			enableIf: "media_align == 'left' || media_align == 'right'",
			disableIf: "locked == '1'",
		};

		const unlockedRequired = resolveFieldState(stateField, values);
		expect(unlockedRequired).toEqual({
			visible: true,
			enabled: true,
			disabled: false,
			required: true,
		});

		const notRequired = resolveFieldState(stateField, { ...values, badge_mode: 'none' });
		expect(notRequired.visible).toBe(true);
		expect(notRequired.enabled).toBe(true);
		expect(notRequired.required).toBe(false);

		const disabledClearsRequired = resolveFieldState(stateField, { ...values, locked: '1' });
		expect(disabledClearsRequired.disabled).toBe(true);
		expect(disabledClearsRequired.required).toBe(false);
		expect(validateFieldWithValibot(stateField, '', { ...values, locked: '1' })).toBeNull();
	});

	it('validates daterange required, partial completeness, invalid dates, ordering, and min/max bounds', () => {
		const rangeField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'daterange',
			name: 'booking_window',
			label: 'Booking Window',
			required: true,
			min: '2026-11-01',
			max: '2026-12-31',
		};

		expect(validateFieldWithValibot(rangeField, '', { booking_window: '' })).toContain('required');
		expect(
			validateFieldWithValibot(rangeField, { from: '', to: '' }, { booking_window: { from: '', to: '' } })
		).toContain('required');
		expect(
			validateFieldWithValibot(rangeField, { from: '2026-11-15', to: '' }, { booking_window: { from: '2026-11-15', to: '' } })
		).toContain('both');
		expect(
			validateFieldWithValibot(
				rangeField,
				{ from: '2026-02-30', to: '2026-11-22' },
				{ booking_window: { from: '2026-02-30', to: '2026-11-22' } }
			)
		).toContain('valid dates');
		expect(
			validateFieldWithValibot(
				rangeField,
				{ from: '2026-11-25', to: '2026-11-20' },
				{ booking_window: { from: '2026-11-25', to: '2026-11-20' } }
			)
		).toContain('on or after the start date');
		expect(
			validateFieldWithValibot(
				rangeField,
				{ from: '2026-10-20', to: '2026-11-10' },
				{ booking_window: { from: '2026-10-20', to: '2026-11-10' } }
			)
		).toContain('2026-11-01');
		expect(
			validateFieldWithValibot(
				rangeField,
				{ from: '2026-11-10', to: '2027-01-05' },
				{ booking_window: { from: '2026-11-10', to: '2027-01-05' } }
			)
		).toContain('2026-12-31');
		expect(
			validateFieldWithValibot(
				rangeField,
				{ from: '2026-11-15', to: '2026-11-22' },
				{ booking_window: { from: '2026-11-15', to: '2026-11-22' } }
			)
		).toBeNull();
	});

	it('validates unit_number/currency bounds & unit allowlists and color formats', () => {
		const currencyField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'currency',
			name: 'rate',
			label: 'Base Rate',
			required: true,
			min: 100,
			max: 5000,
			units: ['EUR', 'USD'],
		};

		expect(validateFieldWithValibot(currencyField, '', { rate: '' })).toContain('required');
		expect(validateFieldWithValibot(currencyField, { value: null, unit: 'EUR' }, { rate: { value: null, unit: 'EUR' } })).toContain('required');
		expect(validateFieldWithValibot(currencyField, { value: 50, unit: 'EUR' }, { rate: { value: 50, unit: 'EUR' } })).toContain('at least 100');
		expect(validateFieldWithValibot(currencyField, { value: 6000, unit: 'EUR' }, { rate: { value: 6000, unit: 'EUR' } })).toContain('at most 5000');
		expect(validateFieldWithValibot(currencyField, { value: 500, unit: 'JPY' }, { rate: { value: 500, unit: 'JPY' } })).toContain('unit');
		expect(validateFieldWithValibot(currencyField, { value: 500, unit: 'EUR' }, { rate: { value: 500, unit: 'EUR' } })).toBeNull();

		const colorField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'color',
			name: 'brand',
			label: 'Brand Color',
		};
		expect(validateFieldWithValibot(colorField, '', { brand: '' })).toBeNull();
		expect(validateFieldWithValibot(colorField, 'not-a-color', { brand: 'not-a-color' })).toContain('valid hex');
		expect(validateFieldWithValibot(colorField, '#eb1d61', { brand: '#eb1d61' })).toBeNull();
		expect(validateFieldWithValibot(colorField, '#eb1d6180', { brand: '#eb1d6180' })).toBeNull();
		expect(validateFieldWithValibot(colorField, 'rgba(235, 29, 97, 0.5)', { brand: 'rgba(235, 29, 97, 0.5)' })).toBeNull();
	});

	it('validates Package 3 spacing, dual range_slider, otp, and password policy rules', () => {
		const spacingField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'spacing',
			name: 'padding',
			label: 'Padding',
			required: true,
			max: 64,
			units: ['px', 'rem'],
			allowAuto: false,
		};
		expect(
			validateFieldWithValibot(
				spacingField,
				{ top: '', right: '', bottom: '', left: '', unit: 'px' },
				{ padding: { top: '', right: '', bottom: '', left: '', unit: 'px' } }
			)
		).toContain('required');
		expect(
			validateFieldWithValibot(
				spacingField,
				{ top: 'auto', right: '16', bottom: '16', left: '16', unit: 'px' },
				{ padding: { top: 'auto', right: '16', bottom: '16', left: '16', unit: 'px' } }
			)
		).toContain('auto');
		expect(
			validateFieldWithValibot(
				spacingField,
				{ top: '-8', right: '16', bottom: '16', left: '16', unit: 'px' },
				{ padding: { top: '-8', right: '16', bottom: '16', left: '16', unit: 'px' } }
			)
		).toContain('negative');
		expect(
			validateFieldWithValibot(
				spacingField,
				{ top: '96', right: '16', bottom: '16', left: '16', unit: 'px' },
				{ padding: { top: '96', right: '16', bottom: '16', left: '16', unit: 'px' } }
			)
		).toContain('at most 64');
		expect(
			validateFieldWithValibot(
				spacingField,
				{ top: '16', right: '24', bottom: '16', left: '24', unit: 'rem' },
				{ padding: { top: '16', right: '24', bottom: '16', left: '24', unit: 'rem' } }
			)
		).toBeNull();

		const dualRangeField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'range_slider',
			name: 'budget',
			label: 'Budget',
			min: 0,
			max: 1000,
			minDistance: 50,
		};
		expect(validateFieldWithValibot(dualRangeField, { min: 400, max: 200 }, { budget: { min: 400, max: 200 } })).toContain('minimum');
		expect(validateFieldWithValibot(dualRangeField, { min: 500, max: 520 }, { budget: { min: 500, max: 520 } })).toContain('span of at least 50');
		expect(validateFieldWithValibot(dualRangeField, { min: 100, max: 1200 }, { budget: { min: 100, max: 1200 } })).toContain('at most 1000');
		expect(validateFieldWithValibot(dualRangeField, { min: 120, max: 480 }, { budget: { min: 120, max: 480 } })).toBeNull();

		const otpField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'otp',
			name: 'otp_code',
			label: 'Verification Code',
			otpLength: 6,
			otpMode: 'numeric',
			required: true,
		};
		expect(validateFieldWithValibot(otpField, '12ab34', { otp_code: '12ab34' })).toContain('digits');
		expect(validateFieldWithValibot(otpField, '123', { otp_code: '123' })).toContain('6 characters');
		expect(validateFieldWithValibot(otpField, '482910', { otp_code: '482910' })).toBeNull();

		const passwordField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'password',
			name: 'pw',
			label: 'Password',
			minLength: 10,
			requireSymbol: true,
			required: true,
		};
		expect(validateFieldWithValibot(passwordField, 'short', { pw: 'short' })).toContain('10 characters');
		expect(validateFieldWithValibot(passwordField, 'longlowercase1!', { pw: 'longlowercase1!' })).toContain('uppercase');
		expect(validateFieldWithValibot(passwordField, 'LongPasswordNoSym1', { pw: 'LongPasswordNoSym1' })).toContain('symbol');
		expect(validateFieldWithValibot(passwordField, 'ValidPass2026!', { pw: 'ValidPass2026!' })).toBeNull();
	});

	it('normalizes HTML pattern attributes for Chromium V8 /v safety and sanitizes ToggleField radio IDs', () => {
		expect(toSafeHtmlPatternAttr('')).toBeUndefined();
		expect(toSafeHtmlPatternAttr('/^[A-Z]{3}-[0-9]{4}$/')).toBe('^[A-Z]{3}-[0-9]{4}$');
		expect(toSafeHtmlPatternAttr('/^[a-z]+$/u')).toBe('^[a-z]+$');
		expect(toSafeHtmlPatternAttr('/^[a-z]+$/i')).toBeUndefined();
		expect(toSafeHtmlPatternAttr('^[a-z0-9_-]+$')).toBeUndefined();

		const unsafePatternHtml = renderToStaticMarkup(
			React.createElement(TextField, {
				id: 'Inputfield_slug',
				name: 'slug',
				type: 'text',
				value: 'alpha-1',
				pattern: '^[a-z0-9_-]+$',
			})
		);
		expect(unsafePatternHtml).not.toContain('pattern=');

		const pcrePatternHtml = renderToStaticMarkup(
			React.createElement(TextField, {
				id: 'Inputfield_sku',
				name: 'sku',
				type: 'text',
				value: 'PRD-2026',
				pattern: '/^[A-Z]{3}-[0-9]{4}$/',
			})
		);
		expect(pcrePatternHtml).toContain('pattern="^[A-Z]{3}-[0-9]{4}$"');

		const toggleHtml = renderToStaticMarkup(
			React.createElement(ToggleField, {
				id: 'Inputfield_mode',
				name: 'mode',
				type: 'toggle',
				value: 'yes / fast',
				options: [
					{ value: 'yes / fast', label: 'Fast' },
					{ value: 'no', label: 'Standard' },
				],
			})
		);
		expect(toggleHtml).toContain('id="Inputfield_mode_yes___fast"');
		expect(toggleHtml).toContain('for="Inputfield_mode_yes___fast"');
	});
});
