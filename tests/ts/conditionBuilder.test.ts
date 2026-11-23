import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
	ConditionBuilderFieldControl,
	createEmptyConditionGroup,
	createEmptyConditionRule,
	getOperatorsForConditionFieldType,
	normalizeConditionBuilderValue,
} from '../../resources/ts/fields/controls/ConditionBuilderField';
import { prefetchSchemaControls } from '../../resources/ts/fields/schema/fieldControlRegistry';
import { validateFieldWithValibot } from '../../resources/ts/fields/validation';
import type { ConditionFieldSpec, SchemaFormPayload } from '../../resources/ts/fields/types';

const SAMPLE_FIELDS: ConditionFieldSpec[] = [
	{ key: 'customer_email', label: 'Customer Email', type: 'text' },
	{ key: 'subtotal', label: 'Order Subtotal', type: 'number' },
	{
		key: 'tier',
		label: 'Customer Tier',
		type: 'select',
		options: [
			{ value: 'standard', label: 'Standard' },
			{ value: 'vip', label: 'VIP' },
		],
	},
	{ key: 'tax_exempt', label: 'Tax Exempt', type: 'boolean' },
	{
		key: 'shipping_country',
		label: 'Shipping Country',
		type: 'country',
		options: [
			{ value: 'TR', label: 'TR — Türkiye' },
			{ value: 'US', label: 'US — United States' },
		],
	},
	{
		key: 'currency',
		label: 'Currency',
		type: 'currency',
		options: [
			{ value: 'EUR', label: 'EUR — Euro' },
			{ value: 'USD', label: 'USD — US Dollar' },
		],
	},
	{ key: 'signup_date', label: 'Signup Date', type: 'date' },
];

describe('ConditionBuilderField normalization and operators', () => {
	it('normalizes empty, malformed, and JSON string condition values to the canonical shape', () => {
		expect(normalizeConditionBuilderValue(null, SAMPLE_FIELDS)).toEqual({
			match: 'all',
			groups: [],
		});
		expect(normalizeConditionBuilderValue('invalid-json', SAMPLE_FIELDS)).toEqual({
			match: 'all',
			groups: [],
		});

		const parsed = normalizeConditionBuilderValue(
			JSON.stringify({
				match: 'any',
				groups: [
					{
						id: 'g1',
						match: 'all',
						rules: [
							{ id: 'r1', field: 'subtotal', operator: 'gte', value: 100 },
							{ field: 'tax_exempt', operator: 'is_true' },
						],
					},
					'bad-group-entry',
				],
			}),
			SAMPLE_FIELDS,
		);

		expect(parsed).toEqual({
			match: 'any',
			groups: [
				{
					id: 'g1',
					match: 'all',
					rules: [
						{ id: 'r1', field: 'subtotal', operator: 'gte', value: 100 },
						{ id: 'rule_1_2', field: 'tax_exempt', operator: 'is_true', value: null },
					],
				},
			],
		});
	});

	it('provides appropriate default and custom operators for all 7 field types', () => {
		expect(getOperatorsForConditionFieldType('text')).toContain('contains');
		expect(getOperatorsForConditionFieldType('number')).toContain('between');
		expect(getOperatorsForConditionFieldType('select')).toEqual([
			'eq',
			'neq',
			'in',
			'not_in',
			'is_empty',
			'is_not_empty',
		]);
		expect(getOperatorsForConditionFieldType('boolean')).toEqual(['is_true', 'is_false']);
		expect(getOperatorsForConditionFieldType('country')).toContain('in');
		expect(getOperatorsForConditionFieldType('currency')).toContain('neq');
		expect(getOperatorsForConditionFieldType('date')).toContain('on_or_after');
		expect(getOperatorsForConditionFieldType('text', ['eq', 'eq', 'neq'])).toEqual(['eq', 'neq']);
	});

	it('creates deterministic empty groups and rules from conditionFields', () => {
		const rule = createEmptyConditionRule('r_new', SAMPLE_FIELDS);
		expect(rule).toEqual({
			id: 'r_new',
			field: 'customer_email',
			operator: 'eq',
			value: '',
		});

		const group = createEmptyConditionGroup('g_new', 'r_first', SAMPLE_FIELDS);
		expect(group.id).toBe('g_new');
		expect(group.match).toBe('all');
		expect(group.rules).toHaveLength(1);
		expect(group.rules[0]?.id).toBe('r_first');
	});
});

describe('ConditionBuilderField rendering, WCAG accessibility, and runtime isolation', () => {
	it('renders WCAG labels, semantic classes, hidden form input, and suppresses hidden input in inlinePortal', () => {
		const value = {
			match: 'all' as const,
			groups: [
				{
					id: 'grp_1',
					match: 'any' as const,
					rules: [
						{ id: 'r_1', field: 'subtotal', operator: 'between', value: [50, 200] },
						{ id: 'r_2', field: 'shipping_country', operator: 'in', value: ['TR'] },
						{ id: 'r_3', field: 'tax_exempt', operator: 'is_true', value: null },
					],
				},
			],
		};

		const standaloneHtml = renderToStaticMarkup(
			React.createElement(ConditionBuilderFieldControl, {
				controlType: 'condition_builder',
				id: 'rules_field',
				name: 'eligibility_rules',
				label: 'Eligibility Rules',
				value,
				conditionFields: SAMPLE_FIELDS,
			}),
		);

		expect(standaloneHtml).toContain('data-rw-control="condition_builder"');
		expect(standaloneHtml).toContain('role="group"');
		expect(standaloneHtml).toContain('aria-label="Eligibility Rules"');
		expect(standaloneHtml).toContain('<input type="hidden" name="eligibility_rules"');
		expect(standaloneHtml).toContain('<fieldset');
		expect(standaloneHtml).toContain('<legend');
		expect(standaloneHtml).toContain('<span>Add group</span>');
		expect(standaloneHtml).not.toContain('aria-label="Add condition group"');
		expect(standaloneHtml).toContain('aria-label="Remove condition group 1"');
		expect(standaloneHtml).toContain('<span>Add rule</span>');
		expect(standaloneHtml).not.toContain('aria-label="Add rule to group 1"');
		expect(standaloneHtml).toContain('aria-label="Remove rule 1 in group 1"');
		expect(standaloneHtml).toContain('aria-label="Remove TR — Türkiye"');
		expect(standaloneHtml).toContain('bg-card');
		expect(standaloneHtml).toContain('border-border');
		expect(standaloneHtml).not.toContain('uk-');

		const portalHtml = renderToStaticMarkup(
			React.createElement(ConditionBuilderFieldControl, {
				controlType: 'condition_builder',
				id: 'rules_field',
				name: 'eligibility_rules',
				value,
				conditionFields: SAMPLE_FIELDS,
				inlinePortal: true,
			}),
		);

		expect(portalHtml).not.toContain('<input type="hidden"');
	});

	it('prefetches ReactExtraFields chunk when a schema contains a condition_builder field', () => {
		const ensureExtraFieldsLoaded = vi.fn().mockResolvedValue(undefined);
		const ensureFileFieldLoaded = vi.fn().mockResolvedValue(undefined);
		const prevRuntime = (globalThis as { window?: unknown }).window;

		(globalThis as unknown as { window: Record<string, unknown> }).window = {
			ReactWorkspaceRuntime: {
				ensureExtraFieldsLoaded,
				ensureFileFieldLoaded,
			},
		};

		try {
			const payload: SchemaFormPayload = {
				id: 'promo_rules',
				method: 'post',
				action: '/save',
				fields: [
					{
						name: 'conditions',
						type: 'condition_builder',
						label: 'Eligibility Conditions',
						conditionFields: SAMPLE_FIELDS,
					},
				],
			};

			prefetchSchemaControls(payload);
			expect(ensureExtraFieldsLoaded).toHaveBeenCalledTimes(1);
			expect(ensureFileFieldLoaded).not.toHaveBeenCalled();
		} finally {
			if (prevRuntime === undefined) {
				delete (globalThis as unknown as { window?: unknown }).window;
			} else {
				(globalThis as unknown as { window: unknown }).window = prevRuntime;
			}
		}
	});

	it('validates required and minItems/maxItems constraints on condition_builder values without triggering keyvalue errors', () => {
		const requiredFieldDef = {
			name: 'rules',
			type: 'condition_builder' as const,
			label: 'Discount Rules',
			required: true,
			minItems: 1,
		};

		const emptyErr = validateFieldWithValibot(
			requiredFieldDef,
			{ match: 'all', groups: [] },
			{ rules: { match: 'all', groups: [] } },
		);
		expect(emptyErr).not.toBeNull();

		const emptyGroupRulesVal = {
			match: 'all',
			groups: [{ id: 'g1', match: 'all', rules: [] }],
		};
		const emptyRulesErr = validateFieldWithValibot(
			requiredFieldDef,
			emptyGroupRulesVal,
			{ rules: emptyGroupRulesVal },
		);
		expect(emptyRulesErr).not.toBeNull();

		const boundedFieldDef = {
			name: 'rules',
			type: 'condition_builder' as const,
			label: 'Discount Rules',
			minItems: 2,
			maxItems: 2,
		};

		const oneRuleVal = {
			match: 'all',
			groups: [
				{
					id: 'g1',
					match: 'all',
					rules: [{ id: 'r1', field: 'subtotal', operator: 'gte', value: 100 }],
				},
			],
		};
		expect(
			validateFieldWithValibot(boundedFieldDef, oneRuleVal, { rules: oneRuleVal }),
		).toContain('at least 2');

		const twoRulesVal = {
			match: 'all',
			groups: [
				{
					id: 'g1',
					match: 'all',
					rules: [{ id: 'r1', field: 'subtotal', operator: 'gte', value: 100 }],
				},
				{
					id: 'g2',
					match: 'any',
					rules: [{ id: 'r2', field: 'tax_exempt', operator: 'is_true', value: null }],
				},
			],
		};
		expect(
			validateFieldWithValibot(boundedFieldDef, twoRulesVal, { rules: twoRulesVal }),
		).toBeNull();

		const threeRulesVal = {
			match: 'all',
			groups: [
				{
					id: 'g1',
					match: 'all',
					rules: [
						{ id: 'r1', field: 'subtotal', operator: 'gte', value: 100 },
						{ id: 'r2', field: 'tier', operator: 'eq', value: 'vip' },
						{ id: 'r3', field: 'tax_exempt', operator: 'is_true', value: null },
					],
				},
			],
		};
		expect(
			validateFieldWithValibot(boundedFieldDef, threeRulesVal, { rules: threeRulesVal }),
		).toContain('at most 2');
	});
});
