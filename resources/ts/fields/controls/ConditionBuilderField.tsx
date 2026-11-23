import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Button, Input, Select } from '../../ui';
import type {
	ConditionBuilderValue,
	ConditionFieldOption,
	ConditionFieldSpec,
	ConditionFieldType,
	ConditionGroupItem,
	ConditionMatchMode,
	ConditionRuleItem,
	ReactInputfieldProps,
} from '../types';

const DEFAULT_OPERATORS_BY_TYPE: Record<ConditionFieldType, readonly string[]> = {
	text: ['eq', 'neq', 'contains', 'not_contains', 'starts_with', 'ends_with', 'in', 'not_in', 'is_empty', 'is_not_empty'],
	number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'not_in', 'is_empty', 'is_not_empty'],
	select: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
	boolean: ['is_true', 'is_false'],
	country: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
	currency: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
	date: ['eq', 'neq', 'before', 'on_or_before', 'after', 'on_or_after', 'between', 'is_empty', 'is_not_empty'],
};

const UNARY_OPERATORS = new Set<string>(['is_empty', 'is_not_empty', 'is_true', 'is_false']);

function getOperatorLabel(operator: string): string {
	switch (operator) {
		case 'eq':
			return t('conditionBuilder.op.eq', 'Equals');
		case 'neq':
			return t('conditionBuilder.op.neq', 'Does not equal');
		case 'contains':
			return t('conditionBuilder.op.contains', 'Contains');
		case 'not_contains':
			return t('conditionBuilder.op.notContains', 'Does not contain');
		case 'starts_with':
			return t('conditionBuilder.op.startsWith', 'Starts with');
		case 'ends_with':
			return t('conditionBuilder.op.endsWith', 'Ends with');
		case 'gt':
			return t('conditionBuilder.op.gt', 'Greater than');
		case 'gte':
			return t('conditionBuilder.op.gte', 'Greater than or equal');
		case 'lt':
			return t('conditionBuilder.op.lt', 'Less than');
		case 'lte':
			return t('conditionBuilder.op.lte', 'Less than or equal');
		case 'between':
			return t('conditionBuilder.op.between', 'Between');
		case 'in':
			return t('conditionBuilder.op.in', 'Is one of');
		case 'not_in':
			return t('conditionBuilder.op.notIn', 'Is not one of');
		case 'before':
			return t('conditionBuilder.op.before', 'Before');
		case 'on_or_before':
			return t('conditionBuilder.op.onOrBefore', 'On or before');
		case 'after':
			return t('conditionBuilder.op.after', 'After');
		case 'on_or_after':
			return t('conditionBuilder.op.onOrAfter', 'On or after');
		case 'is_true':
			return t('conditionBuilder.op.isTrue', 'Is true');
		case 'is_false':
			return t('conditionBuilder.op.isFalse', 'Is false');
		case 'is_empty':
			return t('conditionBuilder.op.isEmpty', 'Is empty');
		case 'is_not_empty':
			return t('conditionBuilder.op.isNotEmpty', 'Is not empty');
		default:
			return operator.replace(/[_-]+/g, ' ');
	}
}

export function getOperatorsForConditionFieldType(
	fieldType: ConditionFieldType,
	customOperators?: string[],
): string[] {
	if (Array.isArray(customOperators) && customOperators.length > 0) {
		const normalized: string[] = [];
		for (const op of customOperators) {
			const clean = String(op).trim();
			if (clean !== '' && !normalized.includes(clean)) {
				normalized.push(clean);
			}
		}
		if (normalized.length > 0) {
			return normalized;
		}
	}

	const defaults = DEFAULT_OPERATORS_BY_TYPE[fieldType] ?? DEFAULT_OPERATORS_BY_TYPE.text;
	return [...defaults];
}

function normalizeMatchMode(raw: unknown): ConditionMatchMode {
	return typeof raw === 'string' && raw.trim().toLowerCase() === 'any' ? 'any' : 'all';
}

function parseRawConditionValue(raw: unknown): Record<string, unknown> | null {
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '' || trimmed === '[]') {
			return null;
		}
		try {
			const decoded = JSON.parse(trimmed) as unknown;
			if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
				return decoded as Record<string, unknown>;
			}
		} catch {
			return null;
		}
		return null;
	}

	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		return raw as Record<string, unknown>;
	}

	return null;
}

export function normalizeConditionBuilderValue(
	raw: unknown,
	fields: ConditionFieldSpec[] = [],
): ConditionBuilderValue {
	const parsed = parseRawConditionValue(raw);
	if (!parsed) {
		return { match: 'all', groups: [] };
	}

	const fieldMap = new Map<string, ConditionFieldSpec>();
	for (const spec of fields) {
		fieldMap.set(spec.key, spec);
	}

	const rawGroups = Array.isArray(parsed.groups) ? parsed.groups : [];
	const groups: ConditionGroupItem[] = [];

	rawGroups.forEach((rawGroup, groupIndex) => {
		if (!rawGroup || typeof rawGroup !== 'object' || Array.isArray(rawGroup)) {
			return;
		}
		const groupObj = rawGroup as Record<string, unknown>;
		const groupId =
			typeof groupObj.id === 'string' && groupObj.id.trim() !== ''
				? groupObj.id.trim()
				: `grp_${groupIndex + 1}`;
		const rawRules = Array.isArray(groupObj.rules) ? groupObj.rules : [];
		const rules: ConditionRuleItem[] = [];

		rawRules.forEach((rawRule, ruleIndex) => {
			if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
				return;
			}
			const ruleObj = rawRule as Record<string, unknown>;
			const ruleId =
				typeof ruleObj.id === 'string' && ruleObj.id.trim() !== ''
					? ruleObj.id.trim()
					: `rule_${groupIndex + 1}_${ruleIndex + 1}`;
			const fieldKey =
				typeof ruleObj.field === 'string' ? ruleObj.field.trim() : '';
			const spec = fieldMap.get(fieldKey);
			const allowedOps = getOperatorsForConditionFieldType(
				spec?.type ?? 'text',
				spec?.operators,
			);
			const rawOp = typeof ruleObj.operator === 'string' ? ruleObj.operator.trim() : '';
			const operator = rawOp !== '' ? rawOp : (allowedOps[0] ?? 'eq');

			rules.push({
				id: ruleId,
				field: fieldKey,
				operator,
				value: ruleObj.value === undefined ? null : ruleObj.value,
			});
		});

		groups.push({
			id: groupId,
			match: normalizeMatchMode(groupObj.match),
			rules,
		});
	});

	return {
		match: normalizeMatchMode(parsed.match),
		groups,
	};
}

export function createEmptyConditionRule(
	id: string,
	fields: ConditionFieldSpec[] = [],
): ConditionRuleItem {
	const firstField = fields[0];
	const fieldKey = firstField?.key ?? '';
	const operators = getOperatorsForConditionFieldType(
		firstField?.type ?? 'text',
		firstField?.operators,
	);
	const operator = operators[0] ?? 'eq';

	return {
		id,
		field: fieldKey,
		operator,
		value: defaultRuleValueForOperator(operator, firstField?.type ?? 'text'),
	};
}

export function createEmptyConditionGroup(
	groupId: string,
	firstRuleId: string,
	fields: ConditionFieldSpec[] = [],
): ConditionGroupItem {
	return {
		id: groupId,
		match: 'all',
		rules: fields.length > 0 ? [createEmptyConditionRule(firstRuleId, fields)] : [],
	};
}

function defaultRuleValueForOperator(operator: string, fieldType: ConditionFieldType): unknown {
	if (UNARY_OPERATORS.has(operator)) {
		return null;
	}
	if (operator === 'between') {
		return ['', ''];
	}
	if (operator === 'in' || operator === 'not_in') {
		return [];
	}
	if (fieldType === 'boolean') {
		return false;
	}
	return '';
}

function normalizeConditionFields(
	rawFields?: ConditionFieldSpec[],
	propsBag?: Record<string, unknown>,
): ConditionFieldSpec[] {
	const source = Array.isArray(rawFields)
		? rawFields
		: Array.isArray(propsBag?.conditionFields)
			? (propsBag.conditionFields as ConditionFieldSpec[])
			: [];

	const seen = new Set<string>();
	const result: ConditionFieldSpec[] = [];

	for (const entry of source) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const key = typeof entry.key === 'string' ? entry.key.trim() : '';
		if (key === '' || seen.has(key)) {
			continue;
		}
		seen.add(key);

		const rawType = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : 'text';
		const type: ConditionFieldType =
			rawType === 'number' ||
			rawType === 'select' ||
			rawType === 'boolean' ||
			rawType === 'country' ||
			rawType === 'currency' ||
			rawType === 'date'
				? rawType
				: 'text';

		const options: ConditionFieldOption[] | undefined = Array.isArray(entry.options)
			? entry.options
					.filter(
						(opt): opt is ConditionFieldOption =>
							Boolean(opt) && typeof opt === 'object' && typeof opt.value === 'string',
					)
					.map((opt) => ({
						value: opt.value,
						label:
							typeof opt.label === 'string' && opt.label.trim() !== ''
								? opt.label
								: opt.value,
					}))
			: undefined;

		const operators = Array.isArray(entry.operators)
			? entry.operators.map((op) => String(op).trim()).filter((op) => op !== '')
			: undefined;

		result.push({
			key,
			label:
				typeof entry.label === 'string' && entry.label.trim() !== ''
					? entry.label.trim()
					: key,
			type,
			...(options ? { options } : {}),
			...(operators && operators.length > 0 ? { operators } : {}),
		});
	}

	return result;
}

interface CommaListValueInputProps {
	id: string;
	value: unknown;
	disabled: boolean;
	isNumeric: boolean;
	ariaLabel: string;
	placeholder: string;
	onCommit: (next: unknown) => void;
}

function CommaListValueInput({
	id,
	value,
	disabled,
	isNumeric,
	ariaLabel,
	placeholder,
	onCommit,
}: CommaListValueInputProps): React.ReactElement {
	const formattedExternal = useMemo(() => {
		if (!Array.isArray(value)) {
			return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
		}
		return value.map((item) => String(item)).join(', ');
	}, [value]);

	const [draft, setDraft] = useState<string>(formattedExternal);
	const lastExternalRef = useRef<string>(formattedExternal);

	useEffect(() => {
		if (formattedExternal !== lastExternalRef.current) {
			lastExternalRef.current = formattedExternal;
			setDraft(formattedExternal);
		}
	}, [formattedExternal]);

	const parseDraft = (rawText: string): unknown[] => {
		const tokens = rawText
			.split(',')
			.map((token) => token.trim())
			.filter((token) => token !== '');

		if (!isNumeric) {
			return tokens;
		}

		return tokens.map((token) => {
			const parsed = Number(token);
			return Number.isFinite(parsed) ? parsed : token;
		});
	};

	const commitDraft = (rawText: string) => {
		const parsed = parseDraft(rawText);
		const normalizedSig = parsed.map((item) => String(item)).join(', ');
		lastExternalRef.current = normalizedSig;
		onCommit(parsed);
	};

	return (
		<Input
			id={id}
			type="text"
			value={draft}
			disabled={disabled}
			aria-label={ariaLabel}
			placeholder={placeholder}
			onChange={(e) => {
				const nextText = e.target.value;
				setDraft(nextText);
				commitDraft(nextText);
			}}
			onBlur={() => {
				setDraft(parseDraft(draft).map((item) => String(item)).join(', '));
			}}
		/>
	);
}

interface RuleValueEditorProps {
	baseId: string;
	rule: ConditionRuleItem;
	spec: ConditionFieldSpec | undefined;
	disabled: boolean;
	onChange: (nextValue: unknown) => void;
}

function RuleValueEditor({
	baseId,
	rule,
	spec,
	disabled,
	onChange,
}: RuleValueEditorProps): React.ReactElement {
	const fieldType: ConditionFieldType = spec?.type ?? 'text';
	const options = spec?.options ?? [];
	const fieldLabel = spec?.label ?? (rule.field || t('conditionBuilder.valueLabel', 'Value'));

	if (UNARY_OPERATORS.has(rule.operator)) {
		return (
			<div
				className="flex h-9 items-center rounded-md border border-dashed border-border bg-muted/20 px-3 text-xs text-muted-foreground"
				aria-label={t('conditionBuilder.noValueNeeded', 'No comparison value required')}
			>
				{t('conditionBuilder.noValueNeededShort', 'No value needed')}
			</div>
		);
	}

	if (rule.operator === 'between') {
		const pair = Array.isArray(rule.value) ? rule.value : ['', ''];
		const startRaw = pair[0] !== null && pair[0] !== undefined ? String(pair[0]) : '';
		const endRaw = pair[1] !== null && pair[1] !== undefined ? String(pair[1]) : '';
		const inputType = fieldType === 'date' ? 'date' : fieldType === 'number' ? 'number' : 'text';

		const parseBound = (raw: string): unknown => {
			if (fieldType === 'number') {
				if (raw.trim() === '') {
					return '';
				}
				const num = Number(raw);
				return Number.isFinite(num) ? num : raw;
			}
			return raw;
		};

		return (
			<div className="grid grid-cols-2 gap-1.5">
				<Input
					id={`${baseId}-min`}
					type={inputType}
					value={startRaw}
					disabled={disabled}
					aria-label={t(
						'conditionBuilder.rangeMinAria',
						{ field: fieldLabel },
						'{field} minimum',
					)}
					placeholder={t('conditionBuilder.minPlaceholder', 'Min')}
					onChange={(e) => onChange([parseBound(e.target.value), parseBound(endRaw)])}
				/>
				<Input
					id={`${baseId}-max`}
					type={inputType}
					value={endRaw}
					disabled={disabled}
					aria-label={t(
						'conditionBuilder.rangeMaxAria',
						{ field: fieldLabel },
						'{field} maximum',
					)}
					placeholder={t('conditionBuilder.maxPlaceholder', 'Max')}
					onChange={(e) => onChange([parseBound(startRaw), parseBound(e.target.value)])}
				/>
			</div>
		);
	}

	if (rule.operator === 'in' || rule.operator === 'not_in') {
		if (options.length > 0) {
			const selectedValues = Array.isArray(rule.value)
				? rule.value.map((item) => String(item))
				: typeof rule.value === 'string' && rule.value.trim() !== ''
					? [rule.value.trim()]
					: [];

			const optionLabelMap = new Map(options.map((opt) => [opt.value, opt.label]));
			const availableOptions = options.filter((opt) => !selectedValues.includes(opt.value));

			return (
				<div className="space-y-1.5">
					{selectedValues.length > 0 ? (
						<div className="flex flex-wrap gap-1">
							{selectedValues.map((val) => {
								const optLabel = optionLabelMap.get(val) ?? val;
								return (
									<Badge
										key={val}
										variant="secondary"
										className="gap-1 pr-1 font-normal"
									>
										<span>{optLabel}</span>
										<button
											type="button"
											disabled={disabled}
											aria-label={t(
												'conditionBuilder.removeValueOption',
												{ label: optLabel },
												'Remove {label}',
											)}
											onClick={() =>
												onChange(selectedValues.filter((item) => item !== val))
											}
											className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
										>
											<DynamicIcon name="x" size={12} />
										</button>
									</Badge>
								);
							})}
						</div>
					) : null}

					<Select
						id={`${baseId}-add-option`}
						value=""
						disabled={disabled || availableOptions.length === 0}
						aria-label={t(
							'conditionBuilder.addValueOptionAria',
							{ field: fieldLabel },
							'{field} add value',
						)}
						onChange={(e) => {
							const picked = e.target.value;
							if (picked !== '' && !selectedValues.includes(picked)) {
								onChange([...selectedValues, picked]);
							}
						}}
					>
						<option value="">
							{availableOptions.length > 0
								? t('conditionBuilder.selectOptionAdd', 'Select value to add...')
								: t('conditionBuilder.allOptionsSelected', 'All options selected')}
						</option>
						{availableOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</Select>
				</div>
			);
		}

		return (
			<CommaListValueInput
				id={`${baseId}-list`}
				value={rule.value}
				disabled={disabled}
				isNumeric={fieldType === 'number'}
				ariaLabel={t(
					'conditionBuilder.commaValuesAria',
					{ field: fieldLabel },
					'{field} comma-separated values',
				)}
				placeholder={t('conditionBuilder.commaPlaceholder', 'val1, val2, ...')}
				onCommit={onChange}
			/>
		);
	}

	if (fieldType === 'boolean') {
		const boolVal =
			rule.value === true || rule.value === 'true' || rule.value === 1 || rule.value === '1'
				? 'true'
				: rule.value === false ||
					  rule.value === 'false' ||
					  rule.value === 0 ||
					  rule.value === '0'
					? 'false'
					: '';
		return (
			<Select
				id={`${baseId}-bool`}
				value={boolVal}
				disabled={disabled}
				aria-label={t(
					'conditionBuilder.booleanValueAria',
					{ field: fieldLabel },
					'{field} boolean value',
				)}
				onChange={(e) => {
					const raw = e.target.value;
					if (raw === 'true') {
						onChange(true);
					} else if (raw === 'false') {
						onChange(false);
					} else {
						onChange(null);
					}
				}}
			>
				<option value="">{t('form.selectPlaceholder', 'Select...')}</option>
				<option value="true">{t('conditionBuilder.trueLabel', 'True')}</option>
				<option value="false">{t('conditionBuilder.falseLabel', 'False')}</option>
			</Select>
		);
	}

	if (
		(fieldType === 'select' || fieldType === 'country' || fieldType === 'currency') &&
		options.length > 0
	) {
		const currentStr =
			rule.value !== null && rule.value !== undefined ? String(rule.value) : '';
		return (
			<Select
				id={`${baseId}-select`}
				value={currentStr}
				disabled={disabled}
				aria-label={t(
					'conditionBuilder.valueAria',
					{ field: fieldLabel },
					'{field} value',
				)}
				onChange={(e) => onChange(e.target.value)}
			>
				<option value="">{t('form.selectPlaceholder', 'Select...')}</option>
				{options.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</Select>
		);
	}

	if (fieldType === 'number') {
		const numStr =
			rule.value !== null && rule.value !== undefined ? String(rule.value) : '';
		return (
			<Input
				id={`${baseId}-number`}
				type="number"
				step="any"
				value={numStr}
				disabled={disabled}
				aria-label={t(
					'conditionBuilder.numericValueAria',
					{ field: fieldLabel },
					'{field} numeric value',
				)}
				placeholder="0"
				onChange={(e) => {
					const raw = e.target.value;
					if (raw.trim() === '') {
						onChange('');
						return;
					}
					const parsed = Number(raw);
					onChange(Number.isFinite(parsed) ? parsed : raw);
				}}
			/>
		);
	}

	if (fieldType === 'date') {
		const dateStr =
			rule.value !== null && rule.value !== undefined ? String(rule.value) : '';
		return (
			<Input
				id={`${baseId}-date`}
				type="date"
				value={dateStr}
				disabled={disabled}
				aria-label={t(
					'conditionBuilder.dateValueAria',
					{ field: fieldLabel },
					'{field} date value',
				)}
				onChange={(e) => onChange(e.target.value)}
			/>
		);
	}

	const textStr = rule.value !== null && rule.value !== undefined ? String(rule.value) : '';
	const placeholder =
		fieldType === 'country'
			? 'US'
			: fieldType === 'currency'
				? 'USD'
				: t('conditionBuilder.valuePlaceholder', 'Enter value...');

	return (
		<Input
			id={`${baseId}-text`}
			type="text"
			value={textStr}
			disabled={disabled}
			aria-label={t(
				'conditionBuilder.valueAria',
				{ field: fieldLabel },
				'{field} value',
			)}
			placeholder={placeholder}
			onChange={(e) => onChange(e.target.value)}
		/>
	);
}

export function ConditionBuilderField(props: ReactInputfieldProps): React.ReactElement {
	const baseId = useId();
	const seqRef = useRef<number>(0);
	const nextId = (prefix: string): string => {
		seqRef.current += 1;
		return `${prefix}_${seqRef.current}`;
	};

	const conditionFields = useMemo(
		() => normalizeConditionFields(props.conditionFields, props.props),
		[props.conditionFields, props.props],
	);

	const fieldMap = useMemo(() => {
		const map = new Map<string, ConditionFieldSpec>();
		for (const spec of conditionFields) {
			map.set(spec.key, spec);
		}
		return map;
	}, [conditionFields]);

	const normalized = useMemo(
		() => normalizeConditionBuilderValue(props.value, conditionFields),
		[props.value, conditionFields],
	);

	const isLocked = Boolean(props.disabled || props.readOnly);
	const hasError = Boolean(props.error || (props.errors && props.errors.length > 0));
	const totalRulesCount = normalized.groups.reduce((sum, g) => sum + g.rules.length, 0);

	const commit = (next: ConditionBuilderValue) => {
		if (isLocked) {
			return;
		}
		props.onValueChange?.(props.name, next);
	};

	const handleRootMatchChange = (mode: ConditionMatchMode) => {
		commit({
			...normalized,
			match: mode,
		});
	};

	const handleAddGroup = () => {
		const newGroup = createEmptyConditionGroup(
			nextId('grp'),
			nextId('rule'),
			conditionFields,
		);
		commit({
			...normalized,
			groups: [...normalized.groups, newGroup],
		});
	};

	const handleRemoveGroup = (groupId: string) => {
		commit({
			...normalized,
			groups: normalized.groups.filter((g) => g.id !== groupId),
		});
	};

	const handleGroupMatchChange = (groupId: string, mode: ConditionMatchMode) => {
		commit({
			...normalized,
			groups: normalized.groups.map((g) => (g.id === groupId ? { ...g, match: mode } : g)),
		});
	};

	const handleAddRule = (groupId: string) => {
		const newRule = createEmptyConditionRule(nextId('rule'), conditionFields);
		commit({
			...normalized,
			groups: normalized.groups.map((g) =>
				g.id === groupId ? { ...g, rules: [...g.rules, newRule] } : g,
			),
		});
	};

	const handleRemoveRule = (groupId: string, ruleId: string) => {
		commit({
			...normalized,
			groups: normalized.groups.map((g) =>
				g.id === groupId
					? { ...g, rules: g.rules.filter((r) => r.id !== ruleId) }
					: g,
			),
		});
	};

	const handleRuleFieldChange = (groupId: string, ruleId: string, nextFieldKey: string) => {
		const nextSpec = fieldMap.get(nextFieldKey);
		const allowedOperators = getOperatorsForConditionFieldType(
			nextSpec?.type ?? 'text',
			nextSpec?.operators,
		);
		const nextOperator = allowedOperators[0] ?? 'eq';
		const nextVal = defaultRuleValueForOperator(nextOperator, nextSpec?.type ?? 'text');

		commit({
			...normalized,
			groups: normalized.groups.map((g) =>
				g.id !== groupId
					? g
					: {
							...g,
							rules: g.rules.map((r) =>
								r.id === ruleId
									? {
											...r,
											field: nextFieldKey,
											operator: nextOperator,
											value: nextVal,
										}
									: r,
							),
						},
			),
		});
	};

	const handleRuleOperatorChange = (groupId: string, ruleId: string, nextOperator: string) => {
		commit({
			...normalized,
			groups: normalized.groups.map((g) =>
				g.id !== groupId
					? g
					: {
							...g,
							rules: g.rules.map((r) => {
								if (r.id !== ruleId) {
									return r;
								}
								const spec = fieldMap.get(r.field);
								const fieldType = spec?.type ?? 'text';
								let nextValue = r.value;

								if (UNARY_OPERATORS.has(nextOperator)) {
									nextValue = null;
								} else if (nextOperator === 'between') {
									nextValue =
										Array.isArray(r.value) && r.value.length === 2
											? r.value
											: ['', ''];
								} else if (nextOperator === 'in' || nextOperator === 'not_in') {
									nextValue = Array.isArray(r.value)
										? r.value
										: r.value !== null &&
											  r.value !== undefined &&
											  String(r.value).trim() !== ''
											? [r.value]
											: [];
								} else if (
									UNARY_OPERATORS.has(r.operator) ||
									r.operator === 'between' ||
									r.operator === 'in' ||
									r.operator === 'not_in'
								) {
									nextValue = defaultRuleValueForOperator(nextOperator, fieldType);
								}

								return {
									...r,
									operator: nextOperator,
									value: nextValue,
								};
							}),
						},
			),
		});
	};

	const handleRuleValueChange = (groupId: string, ruleId: string, nextValue: unknown) => {
		commit({
			...normalized,
			groups: normalized.groups.map((g) =>
				g.id !== groupId
					? g
					: {
							...g,
							rules: g.rules.map((r) =>
								r.id === ruleId ? { ...r, value: nextValue } : r,
							),
						},
			),
		});
	};

	const rootMatchSelectId = `${baseId}-root-match`;
	const regionAriaLabel =
		typeof props.label === 'string' && props.label.trim() !== ''
			? props.label.trim()
			: t('conditionBuilder.regionLabel', 'Condition builder');

	return (
		<div
			role="group"
			aria-label={regionAriaLabel}
			className={cn(
				'min-w-0 space-y-3 rounded-lg border border-border bg-card p-3',
				hasError && 'border-destructive',
			)}
			data-rw-control="condition_builder"
			aria-invalid={hasError ? true : undefined}
			aria-describedby={props.describedBy}
		>
			{props.inlinePortal ? null : (
				<input
					type="hidden"
					name={props.name}
					value={JSON.stringify(normalized)}
				/>
			)}

			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
				<div className="flex flex-wrap items-center gap-2">
					<label
						htmlFor={rootMatchSelectId}
						className="text-xs font-medium text-muted-foreground"
					>
						{t('conditionBuilder.rootMatchLabel', 'Match groups')}
					</label>
					<Select
						id={rootMatchSelectId}
						value={normalized.match}
						disabled={isLocked}
						className="h-8 w-auto min-w-[140px] text-xs"
						onChange={(e) =>
							handleRootMatchChange(
								e.target.value === 'any' ? 'any' : 'all',
							)
						}
					>
						<option value="all">
							{t('conditionBuilder.matchAll', 'All (AND)')}
						</option>
						<option value="any">
							{t('conditionBuilder.matchAny', 'Any (OR)')}
						</option>
					</Select>
					<Badge variant="outline" className="text-[11px] font-normal tabular-nums">
						{normalized.groups.length}{' '}
						{normalized.groups.length === 1
							? t('conditionBuilder.groupSingular', 'group')
							: t('conditionBuilder.groupPlural', 'groups')}{' '}
						· {totalRulesCount}{' '}
						{totalRulesCount === 1
							? t('conditionBuilder.ruleSingular', 'rule')
							: t('conditionBuilder.rulePlural', 'rules')}
					</Badge>
				</div>

				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={isLocked || conditionFields.length === 0}
					onClick={handleAddGroup}
					className="gap-1.5"
				>
					<DynamicIcon name="plus" size={14} />
					<span>{t('conditionBuilder.addGroup', 'Add group')}</span>
				</Button>
			</div>

			{conditionFields.length === 0 ? (
				<div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
					{t(
						'conditionBuilder.noFieldsConfigured',
						'No condition fields configured.',
					)}
				</div>
			) : normalized.groups.length === 0 ? (
				<div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
					{t(
						'conditionBuilder.emptyGroups',
						'No condition groups configured yet. Add a group to constrain when this applies.',
					)}
				</div>
			) : (
				<div className="space-y-3">
					{normalized.groups.map((group, groupIndex) => {
						const groupMatchId = `${baseId}-grp-${group.id}-match`;
						const groupHeadingId = `${baseId}-grp-${group.id}-heading`;
						return (
							<fieldset
								key={group.id}
								aria-labelledby={groupHeadingId}
								className="min-w-0 space-y-2.5 rounded-md border border-border bg-muted/20 p-3"
							>
								<legend id={groupHeadingId} className="sr-only">
									{t(
										'conditionBuilder.groupLegend',
										{ index: groupIndex + 1 },
										'Condition group {index}',
									)}
								</legend>

								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="flex flex-wrap items-center gap-2">
										<span className="text-xs font-semibold text-foreground">
											{t(
												'conditionBuilder.groupTitle',
												{ index: groupIndex + 1 },
												'Group #{index}',
											)}
										</span>
										<label
											htmlFor={groupMatchId}
											className="text-xs text-muted-foreground"
										>
											{t('conditionBuilder.groupMatchLabel', 'Match rules')}
										</label>
										<Select
											id={groupMatchId}
											value={group.match}
											disabled={isLocked}
											className="h-8 w-auto min-w-[130px] text-xs"
											onChange={(e) =>
												handleGroupMatchChange(
													group.id,
													e.target.value === 'any' ? 'any' : 'all',
												)
											}
										>
											<option value="all">
												{t('conditionBuilder.matchAll', 'All (AND)')}
											</option>
											<option value="any">
												{t('conditionBuilder.matchAny', 'Any (OR)')}
											</option>
										</Select>
									</div>

									<div className="flex items-center gap-1.5">
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={isLocked}
											onClick={() => handleAddRule(group.id)}
											className="gap-1"
										>
											<DynamicIcon name="plus" size={13} />
											<span>{t('conditionBuilder.addRule', 'Add rule')}</span>
										</Button>

										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={isLocked}
											aria-label={t(
												'conditionBuilder.removeGroupAria',
												{ index: groupIndex + 1 },
												'Remove condition group {index}',
											)}
											onClick={() => handleRemoveGroup(group.id)}
											className="text-muted-foreground hover:text-destructive"
										>
											<DynamicIcon name="trash" size={14} />
										</Button>
									</div>
								</div>

								{group.rules.length === 0 ? (
									<div className="rounded border border-dashed border-border bg-card px-3 py-2 text-xs text-muted-foreground">
										{t(
											'conditionBuilder.emptyGroupRules',
											'No rules in this group yet.',
										)}
									</div>
								) : (
									<div className="space-y-2">
										{group.rules.map((rule, ruleIndex) => {
											const ruleBaseId = `${baseId}-grp-${group.id}-rule-${rule.id}`;
											const fieldSelectId = `${ruleBaseId}-field`;
											const operatorSelectId = `${ruleBaseId}-op`;
											const activeSpec = fieldMap.get(rule.field);
											const baseOperators = getOperatorsForConditionFieldType(
												activeSpec?.type ?? 'text',
												activeSpec?.operators,
											);
											const operatorList =
												rule.operator && !baseOperators.includes(rule.operator)
													? [rule.operator, ...baseOperators]
													: baseOperators;

											return (
												<div
													key={rule.id}
													className="grid grid-cols-1 items-start gap-2 rounded border border-border bg-card p-2 md:grid-cols-[minmax(160px,1.2fr)_minmax(150px,1fr)_minmax(180px,1.6fr)_auto]"
												>
													<div className="min-w-0 space-y-1">
														<label
															htmlFor={fieldSelectId}
															className="block text-[11px] font-medium text-muted-foreground"
														>
															{t('conditionBuilder.fieldLabel', 'Field')}
														</label>
														<Select
															id={fieldSelectId}
															value={rule.field}
															disabled={isLocked}
															onChange={(e) =>
																handleRuleFieldChange(
																	group.id,
																	rule.id,
																	e.target.value,
																)
															}
														>
															{rule.field === '' ? (
																<option value="">
																	{t('form.selectPlaceholder', 'Select...')}
																</option>
															) : null}
															{rule.field !== '' && !fieldMap.has(rule.field) ? (
																<option value={rule.field}>
																	{rule.field}
																</option>
															) : null}
															{conditionFields.map((spec) => (
																<option key={spec.key} value={spec.key}>
																	{spec.label}
																</option>
															))}
														</Select>
													</div>

													<div className="min-w-0 space-y-1">
														<label
															htmlFor={operatorSelectId}
															className="block text-[11px] font-medium text-muted-foreground"
														>
															{t('conditionBuilder.operatorLabel', 'Operator')}
														</label>
														<Select
															id={operatorSelectId}
															value={rule.operator}
															disabled={isLocked}
															onChange={(e) =>
																handleRuleOperatorChange(
																	group.id,
																	rule.id,
																	e.target.value,
																)
															}
														>
															{operatorList.map((op) => (
																<option key={op} value={op}>
																	{getOperatorLabel(op)}
																</option>
															))}
														</Select>
													</div>

													<div className="min-w-0 space-y-1">
														<span className="block text-[11px] font-medium text-muted-foreground">
															{t('conditionBuilder.valueLabel', 'Value')}
														</span>
														<RuleValueEditor
															baseId={ruleBaseId}
															rule={rule}
															spec={activeSpec}
															disabled={isLocked}
															onChange={(val) =>
																handleRuleValueChange(
																	group.id,
																	rule.id,
																	val,
																)
															}
														/>
													</div>

													<div className="flex items-end justify-end md:pt-5">
														<Button
															type="button"
															variant="ghost"
															size="sm"
															disabled={isLocked}
															aria-label={t(
																'conditionBuilder.removeRuleAria',
																{ rule: ruleIndex + 1, group: groupIndex + 1 },
																'Remove rule {rule} in group {group}',
															)}
															onClick={() =>
																handleRemoveRule(group.id, rule.id)
															}
															className="text-muted-foreground hover:text-destructive"
														>
															<DynamicIcon name="trash" size={14} />
														</Button>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</fieldset>
						);
					})}
				</div>
			)}
		</div>
	);
}

export const ConditionBuilderFieldControl = ConditionBuilderField;
