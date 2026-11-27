import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
	ConditionBuilder,
	ConditionBuilderFieldControl,
	createEmptyConditionGroup,
	createEmptyConditionRule,
	evaluateConditionTree,
	formatConditionSummary,
	getOperatorsForConditionFieldType,
	normalizeConditionBuilderValue,
	serializeConditionToExpression,
} from '../../resources/ts/fields/controls/ConditionBuilderField';
import {
	parseConditionStringToObject,
	resolveSourceFieldSpecs,
	resolveTargetFieldSpecs,
} from '../../resources/ts/fields/conditionEngine';
import { resolveDynamicBlockFields } from '../../resources/ts/fields/shared';
import type { SchemaFormContextValue } from '../../resources/ts/fields/types';
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

	it('prefetches InputfieldReactCondition chunk (and not ReactExtraFields) when a schema contains a condition_builder field', () => {
		const ensureConditionFieldLoaded = vi.fn().mockResolvedValue(undefined);
		const ensureExtraFieldsLoaded = vi.fn().mockResolvedValue(undefined);
		const ensureFileFieldLoaded = vi.fn().mockResolvedValue(undefined);
		const prevRuntime = (globalThis as { window?: unknown }).window;

		(globalThis as unknown as { window: Record<string, unknown> }).window = {
			ReactWorkspaceRuntime: {
				ensureConditionFieldLoaded,
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
			expect(ensureConditionFieldLoaded).toHaveBeenCalledTimes(1);
			expect(ensureExtraFieldsLoaded).not.toHaveBeenCalled();
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

	it('evaluates condition trees across operators, negate groups, field-to-field targets, dot paths, and custom resolvers', () => {
		const ctx = {
			title: 'Enterprise Plan',
			subtotal: 250,
			min_total: 100,
			tier: 'vip',
			created_at: '2026-06-15',
			active: true,
			note: '',
			customer: { country: 'TR' },
		};

		expect(evaluateConditionTree({ match: 'all', groups: [] }, ctx)).toBe(true);
		expect(
			evaluateConditionTree({ match: 'all', groups: [] }, ctx, { emptyResult: false }),
		).toBe(false);

		const tree = {
			match: 'all',
			groups: [
				{
					id: 'g1',
					match: 'all',
					rules: [
						{ id: 'r1', field: 'title', operator: 'starts_with', value: 'enter' },
						{ id: 'r2', field: 'subtotal', operator: 'gt', value: 'min_total', valueSource: 'field' as const },
						{ id: 'r3', field: 'tier', operator: 'in', value: ['gold', 'vip'] },
						{ id: 'r4', field: 'created_at', operator: 'between', value: ['2026-06-01', '2026-06-30'] },
						{ id: 'r5', field: 'customer.country', operator: 'eq', value: 'TR' },
						{ id: 'r6', field: 'active', operator: 'is_true', value: null },
						{ id: 'r7', field: 'note', operator: 'is_empty', value: null },
					],
				},
				{
					id: 'g2',
					match: 'any',
					negate: true,
					rules: [
						{ id: 'r8', field: 'subtotal', operator: 'lt', value: 10 },
					],
				},
			],
		};

		expect(evaluateConditionTree(tree, ctx)).toBe(true);
		expect(
			evaluateConditionTree(
				tree,
				(key) => (key === 'subtotal' ? 5 : (ctx as Record<string, unknown>)[key]),
			),
		).toBe(false);

		expect(
			evaluateConditionTree(
				{
					match: 'all',
					groups: [
						{
							id: 'g_custom',
							match: 'all',
							rules: [{ id: 'rc', field: 'title', operator: 'exact_ci', value: 'enterprise plan' }],
						},
					],
				},
				ctx,
				{
					customOperators: {
						exact_ci: (actual, expected) =>
							String(actual).toLowerCase() === String(expected).toLowerCase(),
					},
				},
			),
		).toBe(true);
	});

	it('formats human condition summaries, filters sourceOnly/targetOnly fields, and renders compact/NOT UI SSR', () => {
		const categorized: ConditionFieldSpec[] = [
			{
				key: 'customer_email',
				label: 'Email',
				type: 'text',
				group: 'Customer',
				icon: 'mail',
				sourceOnly: true,
			},
			{
				key: 'subtotal',
				label: 'Subtotal',
				type: 'number',
				group: 'Order',
				comparableTypes: ['number'],
			},
			{
				key: 'budget_cap',
				label: 'Budget Cap',
				type: 'number',
				group: 'Order',
				targetOnly: true,
			},
			{
				key: 'status',
				label: 'Status',
				type: 'select',
				group: 'Order',
			},
		];

		expect(resolveSourceFieldSpecs(categorized).map((f) => f.key)).toEqual([
			'customer_email',
			'subtotal',
			'status',
		]);
		expect(
			resolveTargetFieldSpecs(categorized, 'subtotal', categorized[1]).map((f) => f.key),
		).toEqual(['budget_cap']);

		const tree = {
			match: 'all',
			groups: [
				{
					id: 'g1',
					match: 'any',
					negate: true,
					rules: [
						{ id: 'r1', field: 'subtotal', operator: 'gt', value: 'budget_cap', valueSource: 'field' as const },
					],
				},
			],
		};

		const summary = formatConditionSummary(tree, categorized);
		expect(summary).toContain('NOT');
		expect(summary).toContain('Subtotal');
		expect(summary).toContain('{Budget Cap}');

		const compactHtml = renderToStaticMarkup(
			React.createElement(ConditionBuilderFieldControl, {
				controlType: 'condition_builder',
				id: 'compact_cond',
				name: 'compact_cond',
				value: tree,
				conditionFields: categorized,
				allowNegate: true,
				showSummary: true,
				layout: 'compact',
			}),
		);
		expect(compactHtml).toContain('data-rw-layout="compact"');
		expect(compactHtml).toContain('data-rw-condition-summary="1"');
		expect(compactHtml).toContain('Negate group 1');
	});

	it('supports standalone controlled props without id/name/controlType, visible headings, allowRawExpression, and allowCustomValue', () => {
		const standaloneHtml = renderToStaticMarkup(
			React.createElement(ConditionBuilder, {
				value: {
					match: 'all',
					groups: [
						{
							id: 'g1',
							match: 'all',
							rules: [
								{ id: 'r1', field: 'plan', operator: 'eq', value: 'custom_partner' },
								{ id: 'r2', field: 'plan', operator: 'in', value: ['pro', 'custom_tier'] },
							],
						},
					],
				},
				onChange: vi.fn(),
				heading: 'Eligibility Predicate',
				allowRawExpression: true,
				conditionFields: [
					{
						key: 'plan',
						label: 'Plan',
						type: 'select',
						allowCustomValue: true,
						options: [
							{ value: 'free', label: 'Free' },
							{ value: 'pro', label: 'Pro' },
						],
					},
				],
			}),
		);

		expect(standaloneHtml).not.toContain('<input type="hidden"');
		expect(standaloneHtml).toContain('data-rw-condition-heading="1"');
		expect(standaloneHtml).toContain('Eligibility Predicate');
		expect(standaloneHtml).toContain('data-rw-condition-mode-toggle="1"');
		expect(standaloneHtml).toContain('role="group"');
		expect(standaloneHtml).toContain('aria-pressed=');
		expect(standaloneHtml).toContain('focus-visible:ring-2');
		expect(standaloneHtml).not.toContain('role="radiogroup"');
		expect(standaloneHtml).toContain('value="custom_partner"');
		expect(standaloneHtml).toContain('aria-label="Add custom value"');

		const showLabelHtml = renderToStaticMarkup(
			React.createElement(ConditionBuilder, {
				label: 'Visibility Heading',
				showLabel: true,
				value: { match: 'all', groups: [] },
				conditionFields: [],
			}),
		);
		expect(showLabelHtml).toContain('data-rw-condition-heading="1"');
		expect(showLabelHtml).toContain('Visibility Heading');
	});

	it('resolves DynamicBlockOptionsSource with optionsKey, typeMap, fallbackToTextWhenNoOptions, and allowCustomKey', () => {
		const mockCtx = {
			blocksVersion: 1,
			values: {},
			getRegisteredBlocks: () => [
				{
					id: 'blk_1',
					type: 'choice_block',
					prefix: 'f1',
					values: {
						field_key: 'plan_choice',
						field_label: 'Plan Choice',
						field_type: 'radios',
						choices_list: 'free=Free\npro=Pro',
						allow_other: '1',
					},
				},
				{
					id: 'blk_2',
					type: 'empty_choice_block',
					prefix: 'f2',
					values: {
						field_key: 'custom_note',
						field_label: 'Custom Note',
						field_type: 'segmented',
						choices_list: '',
					},
				},
				{
					id: 'blk_3',
					type: 'rating_block',
					prefix: 'f3',
					values: {
						field_key: 'nps',
						field_label: 'NPS Score',
						field_type: 'rating',
					},
				},
			],
		} as unknown as SchemaFormContextValue;

		const resolved = resolveDynamicBlockFields(
			{
				blockField: 'fields',
				valueKey: 'field_key',
				labelKey: 'field_label',
				typeKey: 'field_type',
				optionsKey: 'choices_list',
				allowCustomKey: 'allow_other',
				fallbackToTextWhenNoOptions: true,
				typeMap: {
					radios: 'select',
					segmented: 'select',
					rating: 'number',
					consent: 'boolean',
				},
			},
			mockCtx,
		);

		expect(resolved).toEqual([
			{
				key: 'plan_choice',
				label: 'Plan Choice (plan_choice)',
				type: 'select',
				options: [
					{ value: 'free', label: 'Free' },
					{ value: 'pro', label: 'Pro' },
				],
				allowCustomValue: true,
			},
			{
				key: 'custom_note',
				label: 'Custom Note (custom_note)',
				type: 'text',
			},
			{
				key: 'nps',
				label: 'NPS Score (nps)',
				type: 'number',
			},
		]);
	});

	it('parses pipe-delimited expressions, serializes flat expressions losslessly, and supports allowWildcards', () => {
		const parsedPipe = parseConditionStringToObject('plan=pro|enterprise, status!=draft|archived');
		expect(parsedPipe).toEqual({
			match: 'all',
			groups: [
				{
					id: 'grp_1',
					match: 'all',
					rules: [
						{ id: 'rule_1_1', field: 'plan', operator: 'in', value: ['pro', 'enterprise'] },
						{ id: 'rule_1_2', field: 'status', operator: 'not_in', value: ['draft', 'archived'] },
					],
				},
			],
		});

		const treeForRoundTrip = normalizeConditionBuilderValue(parsedPipe);
		expect(serializeConditionToExpression(treeForRoundTrip)).toBe(
			'plan=pro|enterprise, status!=draft|archived',
		);

		expect(
			serializeConditionToExpression({
				match: 'any',
				groups: [
					{
						id: 'g1',
						match: 'all',
						rules: [
							{ id: 'r1', field: 'tier', operator: 'eq', value: 'vip' },
							{ id: 'r2', field: 'total', operator: 'gte', value: 100 },
						],
					},
					{
						id: 'g2',
						match: 'all',
						rules: [{ id: 'r3', field: 'override', operator: 'is_true', value: null }],
					},
				],
			}),
		).toBe('tier=vip, total>=100; override=1');

		expect(
			serializeConditionToExpression({
				match: 'all',
				groups: [
					{
						id: 'g1',
						match: 'all',
						negate: true,
						rules: [{ id: 'r1', field: 'tier', operator: 'eq', value: 'vip' }],
					},
				],
			}),
		).toBeNull();

		expect(
			serializeConditionToExpression({
				match: 'all',
				groups: [
					{
						id: 'g1',
						match: 'all',
						rules: [{ id: 'r1', field: 'score', operator: 'between', value: [10, 20] }],
					},
				],
			}),
		).toBeNull();

		// Wildcard evaluation
		const wildcardTree = {
			match: 'all',
			groups: [
				{
					id: 'g1',
					match: 'all',
					rules: [{ id: 'r1', field: 'email', operator: 'eq', value: '*@acme.com' }],
				},
			],
		};

		expect(evaluateConditionTree(wildcardTree, { email: 'alice@ACME.com' }, { allowWildcards: true })).toBe(true);
		expect(evaluateConditionTree(wildcardTree, { email: 'alice@acme.com' }, { allowWildcards: false })).toBe(false);
		expect(
			evaluateConditionTree(
				wildcardTree,
				{ email: 'alice@ACME.com' },
				{ allowWildcards: true, caseSensitive: true },
			),
		).toBe(false);
		// Linear time check on backtracking-heavy pattern
		expect(
			evaluateConditionTree(
				{
					match: 'all',
					groups: [
						{
							id: 'g_perf',
							match: 'all',
							rules: [{ id: 'r_perf', field: 'code', operator: 'eq', value: '*a*a*a*b' }],
						},
					],
				},
				{ code: `${'a'.repeat(500)}c` },
				{ allowWildcards: true },
			),
		).toBe(false);
	});

	it('renders ConditionFieldPicker search combobox outside role=listbox with role=group headers and focus-visible rings', async () => {
		const { ConditionBuilderField } = await import('../../resources/ts/fields/controls/ConditionBuilderField');
		const { renderToStaticMarkup } = await import('react-dom/server');
		const React = await import('react');

		const html = renderToStaticMarkup(
			React.createElement(ConditionBuilderField, {
				id: 'cond_a11y_check',
				name: 'cond_a11y_check',
				label: 'Visibility Rules',
				allowNegate: true,
				allowFieldComparison: true,
				conditionFields: [
					{ key: 'plan', label: 'Plan Tier', type: 'select', group: 'Account', options: [{ value: 'pro', label: 'Pro' }] },
					{ key: 'seats', label: 'Seats', type: 'number', group: 'Account' },
				],
				value: {
					match: 'all',
					groups: [
						{
							id: 'g_a11y',
							match: 'all',
							negate: false,
							rules: [{ id: 'r_a11y', field: 'plan', operator: 'eq', value: 'pro', valueSource: 'manual' }],
						},
					],
				},
			}),
		);
		expect(html).toContain('aria-haspopup="dialog"');
		expect(html).toContain('focus-visible:ring-2');
	});
});
