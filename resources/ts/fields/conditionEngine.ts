import type {
	ConditionBuilderValue,
	ConditionFieldOption,
	ConditionFieldSpec,
	ConditionFieldType,
	ConditionGroupItem,
	ConditionMatchMode,
	ConditionRuleItem,
} from './types';

export const UNARY_OPERATORS: ReadonlySet<string> = new Set([
	'is_empty',
	'is_not_empty',
	'is_true',
	'is_false',
]);

export const DEFAULT_OPERATORS_BY_TYPE: Record<ConditionFieldType, string[]> = {
	text: [
		'eq',
		'neq',
		'contains',
		'not_contains',
		'starts_with',
		'ends_with',
		'in',
		'not_in',
		'is_empty',
		'is_not_empty',
	],
	number: [
		'eq',
		'neq',
		'gt',
		'gte',
		'lt',
		'lte',
		'between',
		'in',
		'not_in',
		'is_empty',
		'is_not_empty',
	],
	select: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
	boolean: ['is_true', 'is_false'],
	country: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
	currency: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'is_not_empty'],
	date: [
		'eq',
		'neq',
		'before',
		'on_or_before',
		'after',
		'on_or_after',
		'between',
		'is_empty',
		'is_not_empty',
	],
};

export const SYMBOL_OPERATOR_MAP: Record<string, string> = {
	'=': 'eq',
	'!=': 'neq',
	'*=': 'contains',
	'!*=': 'not_contains',
	'^=': 'starts_with',
	'$=': 'ends_with',
	'>=': 'gte',
	'<=': 'lte',
	'>': 'gt',
	'<': 'lt',
};

export const OPERATOR_DEFAULT_LABELS: Record<string, string> = {
	eq: 'Equals',
	neq: 'Does not equal',
	contains: 'Contains',
	not_contains: 'Does not contain',
	starts_with: 'Starts with',
	ends_with: 'Ends with',
	gt: 'Greater than',
	gte: 'Greater than or equal',
	lt: 'Less than',
	lte: 'Less than or equal',
	between: 'Between',
	in: 'Is one of',
	not_in: 'Is not one of',
	before: 'Before',
	on_or_before: 'On or before',
	after: 'After',
	on_or_after: 'On or after',
	is_true: 'Is true',
	is_false: 'Is false',
	is_empty: 'Is empty',
	is_not_empty: 'Is not empty',
};

export function getOperatorsForConditionFieldType(
	type: ConditionFieldType,
	customOperators?: string[],
): string[] {
	if (Array.isArray(customOperators) && customOperators.length > 0) {
		return Array.from(
			new Set(
				customOperators
					.map((op) => (typeof op === 'string' ? op.trim() : ''))
					.filter((op) => op !== ''),
			),
		);
	}
	return DEFAULT_OPERATORS_BY_TYPE[type] ?? DEFAULT_OPERATORS_BY_TYPE.text;
}

export function normalizeMatchMode(raw: unknown): ConditionMatchMode {
	return String(raw ?? '').trim().toLowerCase() === 'any' ? 'any' : 'all';
}

export function defaultRuleValueForOperator(operator: string, fieldType: ConditionFieldType): unknown {
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

export function parseConditionStringToObject(expr: string): Record<string, unknown> | null {
	const orGroupsRaw = expr
		.split(/\s*;\s*/)
		.map((part) => part.trim())
		.filter((part) => part !== '');
	if (orGroupsRaw.length === 0) {
		return null;
	}

	const groups: Array<Record<string, unknown>> = [];
	let totalRules = 0;

	for (let gIdx = 0; gIdx < orGroupsRaw.length; gIdx += 1) {
		const rawGroupExpr = orGroupsRaw[gIdx];
		if (!rawGroupExpr) {
			continue;
		}
		const clauses = rawGroupExpr
			.split(/\s*,\s*/)
			.map((part) => part.trim())
			.filter((part) => part !== '');
		if (clauses.length === 0) {
			continue;
		}
		const rules: Array<Record<string, unknown>> = [];
		for (let rIdx = 0; rIdx < clauses.length; rIdx += 1) {
			const clauseStr = clauses[rIdx];
			if (!clauseStr) {
				continue;
			}
			const match = clauseStr.match(
				/^([a-zA-Z0-9_.]+)\s*(!\*=|!=|\*=|\^=|\$=|>=|<=|=|>|<)\s*(.*)$/,
			);
			if (!match) {
				return null;
			}
			const field = match[1] ?? '';
			const sym = match[2] ?? '=';
			const rawExp = (match[3] ?? '').trim().replace(/^["']|["']$/g, '');
			let operator = SYMBOL_OPERATOR_MAP[sym] ?? 'eq';
			let value: unknown = rawExp;
			let valueSource: 'field' | undefined;

			if (sym === '=' && rawExp.toLowerCase() === 'empty') {
				operator = 'is_empty';
				value = null;
			} else if (sym === '!=' && rawExp.toLowerCase() === 'empty') {
				operator = 'is_not_empty';
				value = null;
			} else {
				const refMatch = rawExp.match(/^\{([a-zA-Z0-9_.]+)\}$/);
				if (refMatch) {
					valueSource = 'field';
					value = refMatch[1];
				} else if ((sym === '=' || sym === '!=') && rawExp.includes('|')) {
					const pipeTokens = rawExp
						.split('|')
						.map((token) => token.trim())
						.filter((token) => token !== '');
					if (pipeTokens.length >= 2) {
						operator = sym === '=' ? 'in' : 'not_in';
						value = pipeTokens;
					}
				}
			}

			totalRules += 1;
			rules.push({
				id: `rule_${gIdx + 1}_${rIdx + 1}`,
				field,
				operator,
				value,
				...(valueSource === 'field' ? { valueSource: 'field' } : {}),
			});
		}

		if (rules.length > 0) {
			groups.push({
				id: `grp_${gIdx + 1}`,
				match: 'all',
				rules,
			});
		}
	}

	if (totalRules === 0 || groups.length === 0) {
		return null;
	}

	return {
		match: groups.length > 1 ? 'any' : 'all',
		groups,
	};
}

function parseRawConditionValue(raw: unknown): Record<string, unknown> | null {
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '' || trimmed === '[]') {
			return null;
		}
		if (trimmed.startsWith('{')) {
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
		return parseConditionStringToObject(trimmed);
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
			const fieldKey = typeof ruleObj.field === 'string' ? ruleObj.field.trim() : '';
			const spec = fieldMap.get(fieldKey);
			const allowedOps = getOperatorsForConditionFieldType(
				spec?.type ?? 'text',
				spec?.operators,
			);
			const rawOp = typeof ruleObj.operator === 'string' ? ruleObj.operator.trim() : '';
			const operator = rawOp !== '' ? rawOp : (allowedOps[0] ?? 'eq');
			const normalizedValue = ruleObj.value === undefined ? null : ruleObj.value;
			const isFieldSource =
				typeof ruleObj.valueSource === 'string' &&
				ruleObj.valueSource.trim().toLowerCase() === 'field' &&
				!UNARY_OPERATORS.has(operator) &&
				operator !== 'between' &&
				operator !== 'in' &&
				operator !== 'not_in' &&
				typeof normalizedValue === 'string';

			rules.push({
				id: ruleId,
				field: fieldKey,
				operator,
				value: normalizedValue,
				...(isFieldSource ? { valueSource: 'field' as const } : {}),
			});
		});

		groups.push({
			id: groupId,
			match: normalizeMatchMode(groupObj.match),
			...(groupObj.negate === true ? { negate: true } : {}),
			rules,
		});
	});

	return {
		match: normalizeMatchMode(parsed.match),
		groups,
	};
}

function normalizeConditionFieldType(rawType: unknown): ConditionFieldType {
	const t = typeof rawType === 'string' ? rawType.trim().toLowerCase() : 'text';
	if (
		t === 'number' ||
		t === 'select' ||
		t === 'boolean' ||
		t === 'country' ||
		t === 'currency' ||
		t === 'date'
	) {
		return t;
	}
	return 'text';
}

export function normalizeConditionFields(
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

		const type = normalizeConditionFieldType(entry.type);

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
						...(typeof opt.description === 'string' && opt.description.trim() !== ''
							? { description: opt.description.trim() }
							: {}),
					}))
			: undefined;

		const operators = Array.isArray(entry.operators)
			? entry.operators.map((op) => String(op).trim()).filter((op) => op !== '')
			: undefined;

		const comparableTypes = Array.isArray(entry.comparableTypes)
			? Array.from(new Set(entry.comparableTypes.map((ct) => normalizeConditionFieldType(ct))))
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
			...(typeof entry.group === 'string' && entry.group.trim() !== ''
				? { group: entry.group.trim() }
				: {}),
			...(typeof entry.icon === 'string' && entry.icon.trim() !== ''
				? { icon: entry.icon.trim() }
				: {}),
			...(typeof entry.description === 'string' && entry.description.trim() !== ''
				? { description: entry.description.trim() }
				: {}),
			...(typeof entry.placeholder === 'string' && entry.placeholder.trim() !== ''
				? { placeholder: entry.placeholder.trim() }
				: {}),
			...(entry.sourceOnly === true ? { sourceOnly: true } : {}),
			...(entry.targetOnly === true ? { targetOnly: true } : {}),
			...(comparableTypes && comparableTypes.length > 0 ? { comparableTypes } : {}),
			...(entry.allowCustomValue === true ? { allowCustomValue: true } : {}),
		});
	}

	return result;
}

const REVERSE_SYMBOL_OPERATOR_MAP: Record<string, string> = {
	...Object.fromEntries(
		Object.entries(SYMBOL_OPERATOR_MAP).map(([sym, op]) => [op, sym]),
	),
	after: '>',
	on_or_after: '>=',
	before: '<',
	on_or_before: '<=',
};

function serializeFlatRule(rule: ConditionRuleItem): string | null {
	const field = typeof rule.field === 'string' ? rule.field.trim() : '';
	if (!/^[a-zA-Z0-9_.]+$/.test(field)) {
		return null;
	}
	const op = String(rule.operator || 'eq').trim().toLowerCase();
	const isFieldSource = rule.valueSource === 'field';

	if (op === 'is_empty') return `${field}=empty`;
	if (op === 'is_not_empty') return `${field}!=empty`;
	if (op === 'is_true') return `${field}=1`;
	if (op === 'is_false') return `${field}=0`;

	if (op === 'in' || op === 'not_in') {
		const sym = op === 'in' ? '=' : '!=';
		if (isFieldSource) {
			const target = typeof rule.value === 'string' ? rule.value.trim() : '';
			return /^[a-zA-Z0-9_.]+$/.test(target) ? `${field}${sym}{${target}}` : null;
		}
		if (!Array.isArray(rule.value) || rule.value.length === 0) {
			return null;
		}
		const tokens: string[] = [];
		for (const item of rule.value) {
			if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') {
				return null;
			}
			const tok = String(item).trim();
			if (tok === '' || /[|,;"]/.test(tok)) {
				return null;
			}
			tokens.push(tok);
		}
		return tokens.length > 0 ? `${field}${sym}${tokens.join('|')}` : null;
	}

	const sym = REVERSE_SYMBOL_OPERATOR_MAP[op];
	if (!sym) {
		return null;
	}

	if (isFieldSource) {
		const target = typeof rule.value === 'string' ? rule.value.trim() : '';
		return /^[a-zA-Z0-9_.]+$/.test(target) ? `${field}${sym}{${target}}` : null;
	}

	if (
		rule.value !== null &&
		rule.value !== undefined &&
		typeof rule.value !== 'string' &&
		typeof rule.value !== 'number' &&
		typeof rule.value !== 'boolean'
	) {
		return null;
	}
	const strVal =
		rule.value === null || rule.value === undefined
			? ''
			: typeof rule.value === 'boolean'
				? rule.value
					? '1'
					: '0'
				: String(rule.value);
	if (/[,;"]/.test(strVal)) {
		return null;
	}
	const needsQuotes =
		strVal === '' ||
		strVal.trim() !== strVal ||
		((sym === '=' || sym === '!=') && strVal.toLowerCase() === 'empty');
	return `${field}${sym}${needsQuotes ? `"${strVal}"` : strVal}`;
}

/**
 * Serialize a canonical 2-level `ConditionBuilderValue` back into a flat expression string
 * (`a=1, b>=2; c=3`), or return `null` when constructs cannot be represented losslessly
 * (such as `negate`, OR rules inside an AND root, `between`, or comma-containing values).
 */
export function serializeConditionToExpression(value: ConditionBuilderValue): string | null {
	const normalized = normalizeConditionBuilderValue(value);
	if (normalized.groups.length === 0) {
		return '';
	}

	if (normalized.match === 'all') {
		const clauses: string[] = [];
		for (const group of normalized.groups) {
			if (group.negate) {
				return null;
			}
			if (group.match === 'any' && group.rules.length > 1) {
				return null;
			}
			for (const rule of group.rules) {
				const encoded = serializeFlatRule(rule);
				if (encoded === null) {
					return null;
				}
				clauses.push(encoded);
			}
		}
		return clauses.join(', ');
	}

	const branches: string[] = [];
	for (const group of normalized.groups) {
		if (group.negate) {
			return null;
		}
		if (group.rules.length === 0) {
			continue;
		}
		if (group.match === 'any') {
			for (const rule of group.rules) {
				const encoded = serializeFlatRule(rule);
				if (encoded === null) {
					return null;
				}
				branches.push(encoded);
			}
		} else {
			const clauses: string[] = [];
			for (const rule of group.rules) {
				const encoded = serializeFlatRule(rule);
				if (encoded === null) {
					return null;
				}
				clauses.push(encoded);
			}
			if (clauses.length > 0) {
				branches.push(clauses.join(', '));
			}
		}
	}

	return branches.join('; ');
}

export function resolveSourceFieldSpecs(fields: ConditionFieldSpec[]): ConditionFieldSpec[] {
	return fields.filter((spec) => spec.targetOnly !== true);
}

export function resolveTargetFieldSpecs(
	fields: ConditionFieldSpec[],
	sourceFieldKey: string,
	sourceSpec?: ConditionFieldSpec,
): ConditionFieldSpec[] {
	const comparable = sourceSpec?.comparableTypes;
	return fields.filter((candidate) => {
		if (candidate.sourceOnly === true) {
			return false;
		}
		if (candidate.key === sourceFieldKey) {
			return false;
		}
		if (comparable && comparable.length > 0 && !comparable.includes(candidate.type)) {
			return false;
		}
		return true;
	});
}

export function createEmptyConditionRule(
	id: string,
	fields: ConditionFieldSpec[] = [],
): ConditionRuleItem {
	const sources = resolveSourceFieldSpecs(fields);
	const firstField = sources[0] ?? fields[0];
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
		rules: [createEmptyConditionRule(firstRuleId, fields)],
	};
}

export type ConditionCustomOperatorFn = (
	actual: unknown,
	expected: unknown,
	rule: ConditionRuleItem,
	caseSensitive: boolean,
) => boolean;

export interface EvaluateConditionOptions {
	emptyResult?: boolean;
	caseSensitive?: boolean;
	allowWildcards?: boolean;
	fieldAliases?: Record<string, string>;
	customOperators?: Record<string, ConditionCustomOperatorFn>;
}

function canonicalOperatorName(raw: string): string {
	const normalized = raw.trim().toLowerCase();
	if (normalized === 'equals') {
		return 'eq';
	}
	if (normalized === 'not_equals' || normalized === 'ne') {
		return 'neq';
	}
	if (normalized === 'not_empty') {
		return 'is_not_empty';
	}
	return normalized;
}

function resolveContextValue(
	key: string,
	context: Record<string, unknown> | ((k: string) => unknown),
	fieldAliases: Record<string, string>,
): unknown {
	const resolvedKey = fieldAliases[key] ?? key;

	if (typeof context === 'function') {
		return context(resolvedKey);
	}

	if (Object.prototype.hasOwnProperty.call(context, resolvedKey)) {
		return context[resolvedKey];
	}

	if (resolvedKey !== key && Object.prototype.hasOwnProperty.call(context, key)) {
		return context[key];
	}

	if (resolvedKey.includes('.')) {
		let cursor: unknown = context;
		for (const segment of resolvedKey.split('.')) {
			if (
				cursor &&
				typeof cursor === 'object' &&
				!Array.isArray(cursor) &&
				Object.prototype.hasOwnProperty.call(cursor, segment)
			) {
				cursor = (cursor as Record<string, unknown>)[segment];
				continue;
			}
			return null;
		}
		return cursor;
	}

	return null;
}

function toFiniteNumber(val: unknown): number | null {
	if (typeof val === 'number') {
		return Number.isFinite(val) ? val : null;
	}
	if (typeof val === 'string') {
		const trimmed = val.trim();
		if (trimmed !== '') {
			const parsed = Number(trimmed);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}
	}
	return null;
}

function toBooleanValue(val: unknown, fallback: boolean | null): boolean | null {
	if (typeof val === 'boolean') {
		return val;
	}
	if (typeof val === 'number') {
		if (val === 1) return true;
		if (val === 0) return false;
		return fallback;
	}
	if (typeof val === 'string') {
		const lower = val.trim().toLowerCase();
		if (lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on') {
			return true;
		}
		if (lower === '0' || lower === 'false' || lower === 'no' || lower === 'off' || lower === '') {
			return false;
		}
	}
	return fallback;
}

function toStringScalar(val: unknown): string {
	if (val === null || val === undefined) {
		return '';
	}
	if (typeof val === 'boolean') {
		return val ? '1' : '0';
	}
	if (typeof val === 'string' || typeof val === 'number') {
		return String(val);
	}
	return '';
}

function toTimestampMs(val: unknown): number | null {
	if (typeof val === 'number') {
		return Number.isFinite(val) ? val : null;
	}
	if (val instanceof Date) {
		const t = val.getTime();
		return Number.isFinite(t) ? t : null;
	}
	if (typeof val === 'string') {
		const trimmed = val.trim();
		if (trimmed === '') {
			return null;
		}
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			const num = Number(trimmed);
			return Number.isFinite(num) ? num : null;
		}
		const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (isoMatch) {
			return Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
		}
		const parsed = Date.parse(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function toComparableList(val: unknown): unknown[] {
	if (Array.isArray(val)) {
		return val.filter((item) => item !== null && item !== undefined && String(item).trim() !== '');
	}
	if (typeof val === 'string') {
		const trimmed = val.trim();
		if (trimmed === '') {
			return [];
		}
		return trimmed
			.split(/\s*,\s*/)
			.map((p) => p.trim())
			.filter((p) => p !== '');
	}
	if (val === null || val === undefined) {
		return [];
	}
	return [val];
}

function matchWildcard(text: string, pattern: string, caseSensitive: boolean): boolean {
	const t = Array.from(caseSensitive ? text : text.toLowerCase());
	const p = Array.from(caseSensitive ? pattern : pattern.toLowerCase());
	let ti = 0;
	let pi = 0;
	let starIdx = -1;
	let matchIdx = 0;

	while (ti < t.length) {
		if (pi < p.length && p[pi] === t[ti]) {
			ti += 1;
			pi += 1;
		} else if (pi < p.length && p[pi] === '*') {
			starIdx = pi;
			matchIdx = ti;
			pi += 1;
		} else if (starIdx !== -1) {
			pi = starIdx + 1;
			matchIdx += 1;
			ti = matchIdx;
		} else {
			return false;
		}
	}

	while (pi < p.length && p[pi] === '*') {
		pi += 1;
	}

	return pi === p.length;
}

function scalarEquals(
	a: unknown,
	b: unknown,
	caseSensitive: boolean,
	allowWildcards = false,
): boolean {
	if (a === null || a === undefined || b === null || b === undefined) {
		return (a === null || a === undefined) && (b === null || b === undefined);
	}
	if (typeof a === 'boolean' || typeof b === 'boolean') {
		const ba = toBooleanValue(a, null);
		const bb = toBooleanValue(b, null);
		return ba !== null && ba === bb;
	}
	if (allowWildcards && typeof b === 'string' && b.includes('*')) {
		return matchWildcard(toStringScalar(a), b, caseSensitive);
	}
	const numA = toFiniteNumber(a);
	const numB = toFiniteNumber(b);
	if (numA !== null && numB !== null) {
		return Math.abs(numA - numB) < 1e-9;
	}
	const strA = toStringScalar(a);
	const strB = toStringScalar(b);
	return caseSensitive ? strA === strB : strA.toLowerCase() === strB.toLowerCase();
}

function opEquals(
	actual: unknown,
	expected: unknown,
	caseSensitive: boolean,
	allowWildcards = false,
): boolean {
	if (Array.isArray(actual)) {
		if (Array.isArray(expected)) {
			return opIn(actual, expected, caseSensitive, allowWildcards);
		}
		return actual.some((item) => scalarEquals(item, expected, caseSensitive, allowWildcards));
	}
	return scalarEquals(actual, expected, caseSensitive, allowWildcards);
}

function opContains(actual: unknown, expected: unknown, caseSensitive: boolean): boolean {
	if (Array.isArray(actual)) {
		return actual.some(
			(item) => scalarEquals(item, expected, caseSensitive) || opContains(item, expected, caseSensitive),
		);
	}
	const needle = toStringScalar(expected);
	if (needle === '') {
		return false;
	}
	const haystack = toStringScalar(actual);
	return caseSensitive
		? haystack.includes(needle)
		: haystack.toLowerCase().includes(needle.toLowerCase());
}

function opStartsWith(actual: unknown, expected: unknown, caseSensitive: boolean): boolean {
	const prefix = toStringScalar(expected);
	if (prefix === '') {
		return false;
	}
	const haystack = toStringScalar(actual);
	return caseSensitive
		? haystack.startsWith(prefix)
		: haystack.toLowerCase().startsWith(prefix.toLowerCase());
}

function opEndsWith(actual: unknown, expected: unknown, caseSensitive: boolean): boolean {
	const suffix = toStringScalar(expected);
	if (suffix === '') {
		return false;
	}
	const haystack = toStringScalar(actual);
	return caseSensitive
		? haystack.endsWith(suffix)
		: haystack.toLowerCase().endsWith(suffix.toLowerCase());
}

function opCompareNumeric(
	actual: unknown,
	expected: unknown,
	op: '>' | '>=' | '<' | '<=',
): boolean {
	const numA = toFiniteNumber(actual);
	const numB = toFiniteNumber(expected);
	if (numA === null || numB === null) {
		return false;
	}
	switch (op) {
		case '>':
			return numA > numB;
		case '>=':
			return numA >= numB;
		case '<':
			return numA < numB;
		case '<=':
			return numA <= numB;
	}
}

function opBetween(actual: unknown, expected: unknown): boolean {
	if (!Array.isArray(expected) || expected.length < 2) {
		return false;
	}
	const minRaw = expected[0];
	const maxRaw = expected[1];

	const numA = toFiniteNumber(actual);
	const numMin = toFiniteNumber(minRaw);
	const numMax = toFiniteNumber(maxRaw);
	if (numA !== null && numMin !== null && numMax !== null) {
		const lo = Math.min(numMin, numMax);
		const hi = Math.max(numMin, numMax);
		return numA >= lo && numA <= hi;
	}

	const tsA = toTimestampMs(actual);
	const tsMin = toTimestampMs(minRaw);
	const tsMax = toTimestampMs(maxRaw);
	if (tsA !== null && tsMin !== null && tsMax !== null) {
		const lo = Math.min(tsMin, tsMax);
		const hi = Math.max(tsMin, tsMax);
		return tsA >= lo && tsA <= hi;
	}

	return false;
}

function opIn(
	actual: unknown,
	expected: unknown,
	caseSensitive: boolean,
	allowWildcards = false,
): boolean {
	const candidates = toComparableList(expected);
	if (candidates.length === 0) {
		return false;
	}
	if (Array.isArray(actual)) {
		return actual.some((item) =>
			candidates.some((cand) => scalarEquals(item, cand, caseSensitive, allowWildcards)),
		);
	}
	return candidates.some((cand) => scalarEquals(actual, cand, caseSensitive, allowWildcards));
}

function opDateCompare(
	actual: unknown,
	expected: unknown,
	op: '<' | '<=' | '>' | '>=',
): boolean {
	const tsA = toTimestampMs(actual);
	const tsB = toTimestampMs(expected);
	if (tsA === null || tsB === null) {
		return false;
	}
	switch (op) {
		case '<':
			return tsA < tsB;
		case '<=':
			return tsA <= tsB;
		case '>':
			return tsA > tsB;
		case '>=':
			return tsA >= tsB;
	}
}

function opIsEmpty(actual: unknown): boolean {
	if (actual === null || actual === undefined) {
		return true;
	}
	if (Array.isArray(actual)) {
		return actual.length === 0;
	}
	if (typeof actual === 'boolean' || typeof actual === 'number') {
		return false;
	}
	if (typeof actual === 'string') {
		return actual.trim() === '';
	}
	return false;
}

export function evaluateConditionTree(
	tree: unknown,
	context: Record<string, unknown> | ((key: string) => unknown),
	options: EvaluateConditionOptions = {},
): boolean {
	const normalized = normalizeConditionBuilderValue(tree);
	const emptyResult = options.emptyResult !== undefined ? options.emptyResult : true;
	const caseSensitive = Boolean(options.caseSensitive);
	const allowWildcards = Boolean(options.allowWildcards);
	const fieldAliases = options.fieldAliases ?? {};
	const customOperators = options.customOperators ?? {};

	if (normalized.groups.length === 0) {
		return emptyResult;
	}

	const groupResults: boolean[] = [];

	for (const group of normalized.groups) {
		if (!group.rules || group.rules.length === 0) {
			continue;
		}
		const groupAny = group.match === 'any';
		const ruleResults: boolean[] = [];

		for (const rule of group.rules) {
			const fieldKey = rule.field.trim();
			if (fieldKey === '') {
				ruleResults.push(false);
				continue;
			}
			const operator = canonicalOperatorName(rule.operator || 'eq');
			const actual = resolveContextValue(fieldKey, context, fieldAliases);
			let expected: unknown = rule.value;
			if (rule.valueSource === 'field') {
				const targetKey = typeof expected === 'string' ? expected.trim() : '';
				expected = targetKey !== '' ? resolveContextValue(targetKey, context, fieldAliases) : null;
			}

			const customFn = customOperators[operator];
			if (typeof customFn === 'function') {
				ruleResults.push(Boolean(customFn(actual, expected, rule, caseSensitive)));
				continue;
			}

			let matched = false;
			switch (operator) {
				case 'eq':
					matched = opEquals(actual, expected, caseSensitive, allowWildcards);
					break;
				case 'neq':
					matched = !opEquals(actual, expected, caseSensitive, allowWildcards);
					break;
				case 'contains':
					matched = opContains(actual, expected, caseSensitive);
					break;
				case 'not_contains':
					matched = !opContains(actual, expected, caseSensitive);
					break;
				case 'starts_with':
					matched = opStartsWith(actual, expected, caseSensitive);
					break;
				case 'ends_with':
					matched = opEndsWith(actual, expected, caseSensitive);
					break;
				case 'gt':
					matched = opCompareNumeric(actual, expected, '>');
					break;
				case 'gte':
					matched = opCompareNumeric(actual, expected, '>=');
					break;
				case 'lt':
					matched = opCompareNumeric(actual, expected, '<');
					break;
				case 'lte':
					matched = opCompareNumeric(actual, expected, '<=');
					break;
				case 'between':
					matched = opBetween(actual, expected);
					break;
				case 'in':
					matched = opIn(actual, expected, caseSensitive, allowWildcards);
					break;
				case 'not_in':
					matched = !opIn(actual, expected, caseSensitive, allowWildcards);
					break;
				case 'before':
					matched = opDateCompare(actual, expected, '<');
					break;
				case 'on_or_before':
					matched = opDateCompare(actual, expected, '<=');
					break;
				case 'after':
					matched = opDateCompare(actual, expected, '>');
					break;
				case 'on_or_after':
					matched = opDateCompare(actual, expected, '>=');
					break;
				case 'is_true':
					matched = toBooleanValue(actual, false) === true;
					break;
				case 'is_false':
					matched = toBooleanValue(actual, true) === false;
					break;
				case 'is_empty':
					matched = opIsEmpty(actual);
					break;
				case 'is_not_empty':
					matched = !opIsEmpty(actual);
					break;
				default:
					matched = false;
					break;
			}
			ruleResults.push(matched);
		}

		if (ruleResults.length === 0) {
			continue;
		}
		let groupMatched = groupAny
			? ruleResults.some(Boolean)
			: ruleResults.every(Boolean);
		if (group.negate) {
			groupMatched = !groupMatched;
		}
		groupResults.push(groupMatched);
	}

	if (groupResults.length === 0) {
		return emptyResult;
	}

	return normalized.match === 'any'
		? groupResults.some(Boolean)
		: groupResults.every(Boolean);
}

export interface FormatConditionSummaryLabels {
	andLabel?: string;
	orLabel?: string;
	notLabel?: string;
	emptyLabel?: string;
	translateOperator?: (operator: string) => string;
}

function formatSummaryRuleValue(
	rule: ConditionRuleItem,
	fieldMap: Map<string, ConditionFieldSpec>,
): string {
	if (UNARY_OPERATORS.has(rule.operator)) {
		return '';
	}
	if (rule.valueSource === 'field') {
		const targetKey = typeof rule.value === 'string' ? rule.value.trim() : '';
		const targetSpec = fieldMap.get(targetKey);
		return `{${targetSpec?.label ?? (targetKey || '…')}}`;
	}
	const spec = fieldMap.get(rule.field);
	const optLabel = (rawVal: unknown): string => {
		const str = typeof rawVal === 'boolean' ? (rawVal ? 'True' : 'False') : toStringScalar(rawVal);
		const found = spec?.options?.find((opt) => opt.value === str);
		return found?.label ?? str;
	};

	if (rule.operator === 'between') {
		const pair = Array.isArray(rule.value) ? rule.value : ['', ''];
		const a = toStringScalar(pair[0]) || '…';
		const b = toStringScalar(pair[1]) || '…';
		return `${a} – ${b}`;
	}
	if (Array.isArray(rule.value)) {
		const items = rule.value.map((v) => optLabel(v)).filter((s) => s !== '');
		return items.length > 0 ? `[${items.join(', ')}]` : '[]';
	}
	const resolved = optLabel(rule.value);
	return resolved !== '' ? resolved : '""';
}

export function formatConditionSummary(
	tree: unknown,
	fields: ConditionFieldSpec[] = [],
	labels: FormatConditionSummaryLabels = {},
): string {
	const normalized = normalizeConditionBuilderValue(tree, fields);
	const fieldMap = new Map<string, ConditionFieldSpec>();
	for (const spec of fields) {
		fieldMap.set(spec.key, spec);
	}

	const andGlue = ` ${labels.andLabel ?? 'AND'} `;
	const orGlue = ` ${labels.orLabel ?? 'OR'} `;
	const notPrefix = labels.notLabel ?? 'NOT';
	const opLabelFn =
		labels.translateOperator ??
		((op: string) => (OPERATOR_DEFAULT_LABELS[op] ?? op).toLowerCase());

	const groupStrings: string[] = [];

	for (const group of normalized.groups) {
		if (group.rules.length === 0) {
			continue;
		}
		const ruleStrings = group.rules.map((rule) => {
			const spec = fieldMap.get(rule.field);
			const fieldLabel = spec?.label ?? (rule.field || '?');
			const opText = opLabelFn(rule.operator);
			const valText = formatSummaryRuleValue(rule, fieldMap);
			return valText !== '' ? `${fieldLabel} ${opText} ${valText}` : `${fieldLabel} ${opText}`;
		});

		const inner = ruleStrings.join(group.match === 'any' ? orGlue : andGlue);
		const needsParens = normalized.groups.length > 1 || Boolean(group.negate) || ruleStrings.length > 1;
		const grouped = needsParens && (normalized.groups.length > 1 || Boolean(group.negate))
			? `(${inner})`
			: inner;
		groupStrings.push(group.negate ? `${notPrefix} ${grouped}` : grouped);
	}

	if (groupStrings.length === 0) {
		return labels.emptyLabel ?? '';
	}

	return groupStrings.join(normalized.match === 'any' ? orGlue : andGlue);
}
