import { describe, expect, it } from 'vitest';
import { evaluateShowIfCondition, resolveFieldState } from '../../resources/ts/fields/shared';
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
});
