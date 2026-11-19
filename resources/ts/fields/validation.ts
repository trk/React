import {
	any,
	array,
	boolean,
	check,
	creditCard,
	custom,
	digits,
	email,
	endsWith,
	excludes,
	hexColor,
	includes,
	ip,
	ipv4,
	ipv6,
	isoDate,
	isoDateTime,
	isoTime,
	length,
	maxLength,
	maxValue,
	minLength,
	minValue,
	nullable,
	number,
	object,
	optional,
	parse,
	pipe,
	regex,
	safeParse,
	slug,
	startsWith,
	string,
	unknown as valibotUnknown,
	url,
	uuid,
	type BaseIssue,
	type PipeItem,
} from 'valibot';
import {
	evaluateCondition,
	isLinkFieldValueEmpty,
	isLinkValueObject,
	resolveFieldState,
	resolveScopedFieldValue,
	slugifyText,
} from './shared';
import {
	isRichHtmlEmpty,
	isRichTextFieldType,
	plainTextLength,
} from '../tiptap/tiptapPolicy';
import type {
	InputfieldRepeaterSubfield,
	SchemaFieldDefinition,
	SchemaFieldValidationRules,
	SchemaFormPayload,
	SchemaTabPaneDefinition,
} from './types';

export const valibot = {
	any,
	array,
	boolean,
	check,
	creditCard,
	custom,
	digits,
	email,
	endsWith,
	excludes,
	hexColor,
	includes,
	ip,
	ipv4,
	ipv6,
	isoDate,
	isoDateTime,
	isoTime,
	length,
	maxLength,
	maxValue,
	minLength,
	minValue,
	nullable,
	number,
	object,
	optional,
	parse,
	pipe,
	regex,
	safeParse,
	slug,
	startsWith,
	string,
	unknown: valibotUnknown,
	url,
	uuid,
};

const v = valibot;

export interface RegisteredBlockItemSpec {
	id: string;
	type: string;
	title: string;
	prefix: string;
	status: number;
	collapsed: boolean;
	schema?: SchemaFormPayload | Record<string, unknown> | null;
	values?: Record<string, unknown>;
	skipRequiredFields?: string[];
}

export interface RegisteredBlockFieldSpec {
	fieldKey: string;
	fieldName: string;
	label?: string;
	minItems?: number;
	maxItems?: number;
	readOnly?: boolean;
	getBlocks: () => RegisteredBlockItemSpec[];
	onValidationResult?: (failedBlockIds: string[], fieldError?: string) => void;
}

export interface RegisteredFragmentSpec {
	fragmentId: string;
	scopePrefix?: string;
	schema: SchemaFormPayload;
	skipRequiredFields?: string[];
}

export interface SchemaValidationResult {
	valid: boolean;
	errors: Record<string, string>;
	firstErrorField: string | null;
	failedTabIds: string[];
	failedBlockIds: string[];
}

function isEmptyFieldValue(val: unknown, controlType: string): boolean {
	if (val === null || val === undefined) {
		return true;
	}
	if (isRichTextFieldType(controlType)) {
		return isRichHtmlEmpty(val);
	}
	if (controlType === 'link' || isLinkValueObject(val)) {
		return isLinkFieldValueEmpty(val);
	}
	if (controlType === 'checkbox' || controlType === 'consent' || controlType === 'toggle') {
		return val === false || val === '' || val === '0' || val === 0;
	}
	if (Array.isArray(val)) {
		return val.length === 0;
	}
	if (typeof val === 'object') {
		return Object.keys(val).length === 0;
	}
	return String(val).trim() === '';
}

function unwrapRule<T = unknown>(rule: T | { value: T; message?: string } | undefined | null): T | undefined {
	if (rule === undefined || rule === null) {
		return undefined;
	}
	if (typeof rule === 'object' && !Array.isArray(rule) && 'value' in (rule as Record<string, unknown>)) {
		return (rule as { value: T }).value;
	}
	return rule as T;
}

function getRuleMessage(
	rules: SchemaFieldValidationRules,
	ruleKey: keyof SchemaFieldValidationRules | string,
	fallback: string
): string {
	const rawRule = (rules as Record<string, unknown>)[ruleKey];
	if (
		rawRule &&
		typeof rawRule === 'object' &&
		!Array.isArray(rawRule) &&
		typeof (rawRule as { message?: unknown }).message === 'string' &&
		(rawRule as { message: string }).message.trim()
	) {
		return (rawRule as { message: string }).message.trim();
	}
	if (rules.messages && typeof rules.messages[ruleKey] === 'string' && rules.messages[ruleKey].trim()) {
		return rules.messages[ruleKey].trim();
	}
	return fallback;
}

function toComparableNumber(val: unknown): number | null {
	if (typeof val === 'number' && Number.isFinite(val)) {
		return val;
	}
	if (typeof val === 'string') {
		const trimmed = val.trim();
		if (!trimmed) {
			return null;
		}
		const num = Number(trimmed);
		if (Number.isFinite(num)) {
			return num;
		}
		const parsedDate = Date.parse(trimmed);
		if (Number.isFinite(parsedDate)) {
			return parsedDate;
		}
	}
	return null;
}

const NESTED_QUANTIFIER_RE = /(?:\+|\*|\{[0-9,]+\})\??\s*\)\s*(?:\+|\*|\?|\{[0-9,]+\})/;

function compileFlexibleRegex(rawPattern: string): RegExp | null {
	const trimmed = rawPattern.trim();
	if (!trimmed || trimmed.length > 512 || trimmed.includes('\0')) {
		return null;
	}
	const delimited = trimmed.match(/^([/#~!])([\s\S]*)\1([gimsuy]*)$/);
	const body = delimited ? (delimited[2] ?? '') : trimmed;
	if (!body || NESTED_QUANTIFIER_RE.test(body)) {
		return null;
	}
	try {
		if (delimited) {
			return new RegExp(body, (delimited[3] ?? '').replace(/g|y/g, ''));
		}
		return new RegExp(trimmed, 'u');
	} catch {
		return null;
	}
}

/**
 * Builds a dynamic `valibot` schema for a single `SchemaFieldDefinition` and validates its current value.
 */
export function validateFieldWithValibot(
	field: SchemaFieldDefinition,
	rawVal: unknown,
	allValues: Record<string, unknown>,
	scopePrefix?: string
): string | null {
	const state = resolveFieldState(field, allValues, scopePrefix);
	if (!state.visible || state.disabled) {
		return null;
	}

	const rules: SchemaFieldValidationRules = field.validation ?? {};
	const label = field.label || field.name || 'This field';
	const rawType = (field.type || field.inputfieldClass || 'text').toLowerCase();

	if (field.cardinality === 'o2m' || rawType === 'o2m' || rawType === 'inputfieldreacto2m') {
		return null;
	}

	// Check multi-language default value if value is empty but language values exist in `allValues`
	let effectiveVal = rawVal;
	const i18nLangs = field.i18n?.languages ?? field.languages;
	if (
		(effectiveVal === undefined || effectiveVal === '') &&
		(field.useLanguages || field.i18n?.enabled) &&
		Array.isArray(i18nLangs) &&
		i18nLangs.length > 0
	) {
		const defaultLang = i18nLangs.find((l) => l.isDefault) || i18nLangs[0];
		if (defaultLang) {
			const langKey =
				(defaultLang as { inputName?: string }).inputName ||
				(defaultLang.isDefault ? field.name : `${field.name}__${defaultLang.id}`);
			if (langKey in allValues) {
				effectiveVal = allValues[langKey];
			} else if (defaultLang.value) {
				effectiveVal = defaultLang.value;
			}
		}
	}

	// File/image fields: consider initial server files only when state has not yet recorded a value
	if (
		(rawType === 'file' || rawType === 'files' || rawType === 'image' || rawType === 'images' || field.isImage || field.isFile) &&
		effectiveVal === undefined &&
		Array.isArray(field.files) &&
		field.files.length > 0
	) {
		effectiveVal = field.files.map((f) => f.name);
	}

	const slugSourceField =
		field.connection?.type === 'slug'
			? field.connection.sourceField
			: field.slugFrom || undefined;
	if (slugSourceField && isEmptyFieldValue(effectiveVal, rawType)) {
		const rawSource = resolveScopedFieldValue(allValues, slugSourceField, scopePrefix);
		const sourceStr =
			typeof rawSource === 'string'
				? rawSource
				: rawSource !== null && rawSource !== undefined && typeof rawSource !== 'object'
					? String(rawSource)
					: '';
		if (sourceStr.trim() !== '') {
			const sep =
				(field.connection?.type === 'slug' ? field.connection.separator : field.slugSeparator) ||
				'-';
			const maxL =
				(field.connection?.type === 'slug' ? field.connection.maxLength : field.maxLength) ||
				128;
			const autoSlug = slugifyText(sourceStr, sep, maxL);
			if (autoSlug !== '') {
				effectiveVal = autoSlug;
			}
		}
	}

	const configuredMinItems = Number(
		unwrapRule(rules.minItems) ?? field.minItems ?? field.minFiles ?? field.minRows ?? 0
	);
	const empty = isEmptyFieldValue(effectiveVal, rawType);
	if (empty) {
		if (!state.required) {
			if (configuredMinItems > 0) {
				const validateIfExprOnEmpty = unwrapRule(rules.validateIf);
				if (validateIfExprOnEmpty && !evaluateCondition(validateIfExprOnEmpty, allValues, scopePrefix)) {
					return null;
				}
				return getRuleMessage(rules, 'minItems', `${label} requires at least ${configuredMinItems} item(s).`);
			}
			return null;
		}
		const reqMsgKey = (field.conditions?.require || field.requiredIf || unwrapRule(rules.requiredIf))
			? 'requiredIf'
			: 'required';
		return getRuleMessage(rules, reqMsgKey, getRuleMessage(rules, 'required', `${label} is required.`));
	}

	const validateIfExpr = unwrapRule(rules.validateIf);
	if (validateIfExpr && !evaluateCondition(validateIfExpr, allValues, scopePrefix)) {
		return null;
	}

	// Cross-field rules (`equalsField`, `differentFrom`, `gtField`, `gteField`, `ltField`, `lteField`)
	const eqField = unwrapRule(rules.equalsField);
	if (eqField && typeof eqField === 'string' && eqField.trim()) {
		const otherVal = resolveScopedFieldValue(allValues, eqField.trim(), scopePrefix);
		if (String(effectiveVal ?? '') !== String(otherVal ?? '')) {
			return getRuleMessage(rules, 'equalsField', `${label} must match ${eqField.trim()}.`);
		}
	}

	const diffField = unwrapRule(rules.differentFrom);
	if (diffField && typeof diffField === 'string' && diffField.trim()) {
		const otherVal = resolveScopedFieldValue(allValues, diffField.trim(), scopePrefix);
		if (String(otherVal ?? '') !== '' && String(effectiveVal ?? '') === String(otherVal ?? '')) {
			return getRuleMessage(rules, 'differentFrom', `${label} must be different from ${diffField.trim()}.`);
		}
	}

	const crossComparisons: Array<{ key: 'gtField' | 'gteField' | 'ltField' | 'lteField'; op: string }> = [
		{ key: 'gtField', op: '>' },
		{ key: 'gteField', op: '>=' },
		{ key: 'ltField', op: '<' },
		{ key: 'lteField', op: '<=' },
	];
	for (const cmp of crossComparisons) {
		const targetField = unwrapRule(rules[cmp.key]);
		if (!targetField || typeof targetField !== 'string' || !targetField.trim()) {
			continue;
		}
		const otherRaw = resolveScopedFieldValue(allValues, targetField.trim(), scopePrefix);
		const selfNum = toComparableNumber(effectiveVal);
		const otherNum = toComparableNumber(otherRaw);
		if (selfNum === null || otherNum === null) {
			continue;
		}
		if (cmp.key === 'gtField' && !(selfNum > otherNum)) {
			return getRuleMessage(rules, 'gtField', `${label} must be greater than ${targetField.trim()}.`);
		}
		if (cmp.key === 'gteField' && !(selfNum >= otherNum)) {
			return getRuleMessage(rules, 'gteField', `${label} must be greater than or equal to ${targetField.trim()}.`);
		}
		if (cmp.key === 'ltField' && !(selfNum < otherNum)) {
			return getRuleMessage(rules, 'ltField', `${label} must be less than ${targetField.trim()}.`);
		}
		if (cmp.key === 'lteField' && !(selfNum <= otherNum)) {
			return getRuleMessage(rules, 'lteField', `${label} must be less than or equal to ${targetField.trim()}.`);
		}
	}

	// Array / Multi-select / KeyValue / Repeater / Relation / Media count constraints
	if (Array.isArray(effectiveVal)) {
		const minItems = Number(unwrapRule(rules.minItems) ?? field.minItems ?? field.minFiles ?? field.minRows ?? field.min ?? 0);
		const maxItems = Number(unwrapRule(rules.maxItems) ?? field.maxItems ?? field.maxRows ?? field.maxFiles ?? 0);
		const actions: PipeItem<unknown[], unknown[], BaseIssue<unknown>>[] = [];
		if (minItems > 0) {
			actions.push(
				v.minLength(
					minItems,
					getRuleMessage(rules, 'minItems', `${label} requires at least ${minItems} item(s).`)
				)
			);
		}
		if (maxItems > 0) {
			actions.push(
				v.maxLength(
					maxItems,
					getRuleMessage(rules, 'maxItems', `${label} allows at most ${maxItems} item(s).`)
				)
			);
		}
		if (actions.length > 0) {
			const arrSchema = v.pipe(v.array(valibotUnknown()), ...actions);
			const parsed = v.safeParse(arrSchema, effectiveVal);
			if (!parsed.success) {
				return parsed.issues[0]?.message || `${label} is invalid.`;
			}
		}
		return null;
	}

	// Associative Key-Value object validation (`minItems`, `maxItems`, `keyPattern`, reserved keys)
	const isKeyValueType =
		rawType === 'keyvalue' ||
		rawType === 'key_value' ||
		rawType === 'key-value' ||
		rawType.includes('keyvalue');
	if (
		isKeyValueType ||
		(effectiveVal && typeof effectiveVal === 'object' && !Array.isArray(effectiveVal) && !isLinkValueObject(effectiveVal))
	) {
		const kvObj =
			effectiveVal && typeof effectiveVal === 'object' && !Array.isArray(effectiveVal)
				? (effectiveVal as Record<string, unknown>)
				: {};
		const ownKeys = Object.getOwnPropertyNames(kvObj).filter((k) => k.trim() !== '');
		for (const k of ownKeys) {
			if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
				return getRuleMessage(rules, 'keyPattern', `${label} cannot use reserved key "${k}".`);
			}
		}

		const minItems = Number(unwrapRule(rules.minItems) ?? field.minItems ?? field.minRows ?? 0);
		const maxItems = Number(unwrapRule(rules.maxItems) ?? field.maxItems ?? 0);
		if (minItems > 0 && ownKeys.length < minItems) {
			return getRuleMessage(rules, 'minItems', `${label} requires at least ${minItems} item(s).`);
		}
		if (maxItems > 0 && ownKeys.length > maxItems) {
			return getRuleMessage(rules, 'maxItems', `${label} allows at most ${maxItems} item(s).`);
		}

		const keyPatternStr = unwrapRule(rules.keyPattern) ?? field.keyPattern;
		if (typeof keyPatternStr === 'string' && keyPatternStr.trim() !== '') {
			const reg = compileFlexibleRegex(keyPatternStr);
			if (!reg) {
				return (
					(field.keyPatternMessage && field.keyPatternMessage.trim()) ||
					getRuleMessage(rules, 'keyPattern', `${label} has an invalid key validation regex pattern.`)
				);
			}
			for (const k of ownKeys) {
				if (!reg.test(k)) {
					return (
						(field.keyPatternMessage && field.keyPatternMessage.trim()) ||
						getRuleMessage(rules, 'keyPattern', `${label} contains an invalid key "${k}".`)
					);
				}
			}
		}
		return null;
	}

	// Structured link field validation
	if (rawType === 'link' || isLinkValueObject(effectiveVal)) {
		const linkObj = isLinkValueObject(effectiveVal) ? effectiveVal : null;
		if (!linkObj) {
			return null;
		}
		const linkType = String(linkObj.type || 'url').toLowerCase().trim();
		const linkUrl = String(linkObj.url || '').trim();
		if (linkType === 'email' && linkUrl !== '') {
			const emailCheck = v.safeParse(
				v.pipe(v.string(), v.email(getRuleMessage(rules, 'format', `${label} must be a valid email address.`))),
				linkUrl.replace(/^mailto:/i, '').trim()
			);
			if (!emailCheck.success) {
				return emailCheck.issues[0]?.message || `${label} must be a valid email address.`;
			}
		}
		if (linkType === 'tel' && linkUrl !== '') {
			const cleanTel = linkUrl.replace(/^tel:/i, '').trim();
			if (!/^\+?[0-9]+$/.test(cleanTel)) {
				return getRuleMessage(
					rules,
					'format',
					`${label} may only contain digits (0-9) and an optional leading + sign.`
				);
			}
		}
		if (
			(linkType === 'url' || linkType === 'file' || linkType === 'image' || linkType === 'video') &&
			/^\s*(?:javascript|vbscript|data):/i.test(linkUrl || String(linkObj.file || ''))
		) {
			return getRuleMessage(rules, 'format', `${label} contains an unsafe URL protocol.`);
		}
		return null;
	}

	// Numeric validation via valibot
	const minRule = unwrapRule(rules.min) ?? field.min;
	const maxRule = unwrapRule(rules.max) ?? field.max;
	const stepRule = unwrapRule(rules.step) ?? field.step;
	const formatRule = unwrapRule(rules.format) ?? (rawType === 'email' || field.inputType === 'email' ? 'email' : rawType === 'url' || field.inputType === 'url' ? 'url' : '');

	if (
		rawType === 'number' ||
		rawType === 'integer' ||
		rawType === 'int' ||
		rawType === 'float' ||
		rawType === 'decimal' ||
		rawType === 'rating' ||
		formatRule === 'numeric'
	) {
		const numVal = typeof effectiveVal === 'number' ? effectiveVal : Number(String(effectiveVal).trim());
		const actions: PipeItem<number, number, BaseIssue<unknown>>[] = [
			v.custom<number>(
				(input) => typeof input === 'number' && Number.isFinite(input),
				getRuleMessage(rules, 'format', `${label} must be a valid number.`)
			),
		];
		if (rawType === 'integer' || rawType === 'int') {
			actions.push(
				v.custom<number>(
					(input) => Number.isInteger(input),
					getRuleMessage(rules, 'format', `${label} must be a whole number.`)
				)
			);
		}
		if (minRule !== null && minRule !== undefined && minRule !== '') {
			const minNum = Number(minRule);
			if (Number.isFinite(minNum)) {
				actions.push(
					v.minValue(minNum, getRuleMessage(rules, 'min', `${label} must be at least ${minNum}.`))
				);
			}
		}
		if (maxRule !== null && maxRule !== undefined && maxRule !== '') {
			const maxNum = Number(maxRule);
			if (Number.isFinite(maxNum)) {
				actions.push(
					v.maxValue(maxNum, getRuleMessage(rules, 'max', `${label} must be at most ${maxNum}.`))
				);
			}
		}
		if (stepRule !== null && stepRule !== undefined && stepRule !== '' && stepRule !== 'any') {
			const stepNum = Number(stepRule);
			if (Number.isFinite(stepNum) && stepNum > 0) {
				const baseOffset = minRule !== null && minRule !== undefined && minRule !== '' && Number.isFinite(Number(minRule)) ? Number(minRule) : 0;
				actions.push(
					v.check<number, string>(
						(input) => {
							const quotient = (input - baseOffset) / stepNum;
							return Math.abs(quotient - Math.round(quotient)) < 1e-7;
						},
						getRuleMessage(rules, 'step', `${label} must be a multiple of ${stepNum}.`)
					)
				);
			}
		}
		const numSchema = v.pipe(
			v.number(getRuleMessage(rules, 'format', `${label} must be a valid number.`)),
			...actions
		);
		const parsed = v.safeParse(numSchema, numVal);
		if (!parsed.success) {
			return parsed.issues[0]?.message || `${label} is invalid.`;
		}
		return null;
	}

	// String validation via valibot (text, email, url, slug, uuid, textarea, etc.)
	if (typeof effectiveVal === 'string' || typeof effectiveVal === 'number') {
		const strVal = String(effectiveVal).trim();
		const actions: PipeItem<string, string, BaseIssue<unknown>>[] = [];

		if (formatRule) {
			switch (formatRule) {
				case 'email':
					actions.push(v.email(getRuleMessage(rules, 'format', `${label} must be a valid email address.`)));
					break;
				case 'url':
					actions.push(v.url(getRuleMessage(rules, 'format', `${label} must be a valid URL.`)));
					break;
				case 'uuid':
					actions.push(v.uuid(getRuleMessage(rules, 'format', `${label} must be a valid UUID.`)));
					break;
				case 'ip':
					actions.push(v.ip(getRuleMessage(rules, 'format', `${label} must be a valid IP address.`)));
					break;
				case 'ipv4':
					actions.push(v.ipv4(getRuleMessage(rules, 'format', `${label} must be a valid IPv4 address.`)));
					break;
				case 'ipv6':
					actions.push(v.ipv6(getRuleMessage(rules, 'format', `${label} must be a valid IPv6 address.`)));
					break;
				case 'isoDate':
					actions.push(v.isoDate(getRuleMessage(rules, 'format', `${label} must be a valid ISO date (YYYY-MM-DD).`)));
					break;
				case 'isoDateTime':
					actions.push(v.isoDateTime(getRuleMessage(rules, 'format', `${label} must be a valid ISO date-time.`)));
					break;
				case 'isoTime':
					actions.push(v.isoTime(getRuleMessage(rules, 'format', `${label} must be a valid time (HH:MM).`)));
					break;
				case 'hexColor':
					actions.push(v.hexColor(getRuleMessage(rules, 'format', `${label} must be a valid hex color.`)));
					break;
				case 'slug':
					actions.push(v.slug(getRuleMessage(rules, 'format', `${label} must be a valid URL slug.`)));
					break;
				case 'digits':
					actions.push(v.digits(getRuleMessage(rules, 'format', `${label} must contain only digits.`)));
					break;
				case 'creditCard':
					actions.push(v.creditCard(getRuleMessage(rules, 'format', `${label} must be a valid credit card number.`)));
					break;
				case 'alpha':
					actions.push(
						v.regex(/^\p{L}+$/u, getRuleMessage(rules, 'format', `${label} must contain only letters.`))
					);
					break;
				case 'alphanumeric':
					actions.push(
						v.regex(/^[\p{L}\p{N}]+$/u, getRuleMessage(rules, 'format', `${label} must contain only letters and numbers.`))
					);
					break;
				case 'json':
					actions.push(
						v.check<string, string>((input) => {
							try {
								const parsedJson = JSON.parse(input);
								return typeof parsedJson === 'object' && parsedJson !== null;
							} catch {
								return false;
							}
						}, getRuleMessage(rules, 'format', `${label} must contain valid JSON.`))
					);
					break;
			}
		}

		const isRichText = isRichTextFieldType(rawType);
		const exactLen = Number(unwrapRule(rules.length) ?? 0);
		if (exactLen > 0) {
			actions.push(
				isRichText
					? v.check<string, string>(
							(input) => plainTextLength(input) === exactLen,
							getRuleMessage(rules, 'length', `${label} must be exactly ${exactLen} characters.`)
						)
					: v.length(exactLen, getRuleMessage(rules, 'length', `${label} must be exactly ${exactLen} characters.`))
			);
		}

		const minLen = Number(unwrapRule(rules.minLength) ?? field.minLength ?? 0);
		if (minLen > 0) {
			actions.push(
				isRichText
					? v.check<string, string>(
							(input) => plainTextLength(input) >= minLen,
							getRuleMessage(rules, 'minLength', `${label} must be at least ${minLen} characters.`)
						)
					: v.minLength(minLen, getRuleMessage(rules, 'minLength', `${label} must be at least ${minLen} characters.`))
			);
		}

		const maxLen = Number(unwrapRule(rules.maxLength) ?? field.maxLength ?? 0);
		if (maxLen > 0) {
			actions.push(
				isRichText
					? v.check<string, string>(
							(input) => plainTextLength(input) <= maxLen,
							getRuleMessage(rules, 'maxLength', `${label} must not exceed ${maxLen} characters.`)
						)
					: v.maxLength(maxLen, getRuleMessage(rules, 'maxLength', `${label} must not exceed ${maxLen} characters.`))
			);
		}

		const patternStr = unwrapRule(rules.pattern) ?? field.pattern;
		if (patternStr && typeof patternStr === 'string' && patternStr.trim() !== '') {
			const reg = compileFlexibleRegex(patternStr);
			if (reg) {
				actions.push(v.regex(reg, getRuleMessage(rules, 'pattern', `${label} format is invalid.`)));
			}
		}

		const startsWithStr = unwrapRule(rules.startsWith);
		if (typeof startsWithStr === 'string' && startsWithStr !== '') {
			actions.push(
				v.startsWith(startsWithStr, getRuleMessage(rules, 'startsWith', `${label} must start with "${startsWithStr}".`))
			);
		}

		const endsWithStr = unwrapRule(rules.endsWith);
		if (typeof endsWithStr === 'string' && endsWithStr !== '') {
			actions.push(
				v.endsWith(endsWithStr, getRuleMessage(rules, 'endsWith', `${label} must end with "${endsWithStr}".`))
			);
		}

		const includesStr = unwrapRule(rules.includes);
		if (typeof includesStr === 'string' && includesStr !== '') {
			actions.push(
				v.includes(includesStr, getRuleMessage(rules, 'includes', `${label} must include "${includesStr}".`))
			);
		}

		const excludesStr = unwrapRule(rules.excludes);
		if (typeof excludesStr === 'string' && excludesStr !== '') {
			actions.push(
				v.excludes(excludesStr, getRuleMessage(rules, 'excludes', `${label} must not include "${excludesStr}".`))
			);
		}

		const inRaw = unwrapRule(rules.in);
		if (inRaw !== undefined) {
			const inList = Array.isArray(inRaw)
				? inRaw.map(String)
				: typeof inRaw === 'string'
					? inRaw.split(',').map((s) => s.trim()).filter(Boolean)
					: [];
			if (inList.length > 0) {
				actions.push(
					v.check<string, string>(
						(input) => inList.includes(input),
						getRuleMessage(rules, 'in', `${label} must be one of: ${inList.join(', ')}.`)
					)
				);
			}
		}

		const notInRaw = unwrapRule(rules.notIn);
		if (notInRaw !== undefined) {
			const notInList = Array.isArray(notInRaw)
				? notInRaw.map(String)
				: typeof notInRaw === 'string'
					? notInRaw.split(',').map((s) => s.trim()).filter(Boolean)
					: [];
			if (notInList.length > 0) {
				actions.push(
					v.check<string, string>(
						(input) => !notInList.includes(input),
						getRuleMessage(rules, 'notIn', `${label} cannot be one of: ${notInList.join(', ')}.`)
					)
				);
			}
		}

		if (actions.length > 0) {
			const strSchema = v.pipe(v.string(), ...actions);
			const parsed = v.safeParse(strSchema, strVal);
			if (!parsed.success) {
				return parsed.issues[0]?.message || `${label} is invalid.`;
			}
		}
	}

	return null;
}

function validateRepeaterSubfields(
	field: SchemaFieldDefinition,
	rows: unknown,
	errors: Record<string, string>
): void {
	const subfields: InputfieldRepeaterSubfield[] = Array.isArray(field.subfields) ? field.subfields : [];
	if (subfields.length === 0) {
		return;
	}
	const rowList: Array<Record<string, unknown>> = Array.isArray(rows)
		? rows.filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
		: [];
	const rules = field.validation ?? {};
	const minRows = Number(unwrapRule(rules.minItems) ?? field.minRows ?? 0);
	const maxRows = Number(unwrapRule(rules.maxItems) ?? field.maxRows ?? 0);
	const label = field.label || field.name;

	if (minRows > 0 && rowList.length < minRows) {
		errors[field.name] = getRuleMessage(rules, 'minItems', `${label} requires at least ${minRows} row(s).`);
	} else if (maxRows > 0 && rowList.length > maxRows) {
		errors[field.name] = getRuleMessage(rules, 'maxItems', `${label} allows at most ${maxRows} row(s).`);
	}

	rowList.forEach((row, rowIdx) => {
		if (!row || typeof row !== 'object') {
			return;
		}
		for (const sub of subfields) {
			const cellKey = `${field.name}[${rowIdx}][${sub.name}]`;
			const cellVal = row[sub.name];
			const subErrors = validateFieldWithValibot(
				{
					name: cellKey,
					label: `${sub.label || sub.name} (#${rowIdx + 1})`,
					type: sub.type || 'text',
					required: sub.required,
					conditions: sub.conditions,
					validation: sub.validation,
				},
				cellVal,
				row
			);
			if (subErrors) {
				errors[cellKey] = subErrors;
				if (!errors[field.name]) {
					errors[field.name] = subErrors;
				}
			}
		}
	});
}

function normalizeChildFields(
	fields?: SchemaFieldDefinition[] | Record<string, SchemaFieldDefinition>
): SchemaFieldDefinition[] {
	if (!fields) {
		return [];
	}
	if (Array.isArray(fields)) {
		return fields;
	}
	if (typeof fields === 'object') {
		return Object.entries(fields).map(([name, def]) => ({
			...def,
			name: def.name || name,
		}));
	}
	return [];
}

function isFieldSkippedRequired(
	fieldName: string,
	scopePrefix: string | undefined,
	skipRequiredFields?: ReadonlySet<string>
): boolean {
	if (!skipRequiredFields || skipRequiredFields.size === 0 || !fieldName) {
		return false;
	}
	if (skipRequiredFields.has(fieldName)) {
		return true;
	}
	const cleanPrefix = scopePrefix ? scopePrefix.replace(/_+$/, '') : '';
	if (cleanPrefix && fieldName.startsWith(`${cleanPrefix}_`)) {
		const shortName = fieldName.slice(cleanPrefix.length + 1);
		if (shortName && skipRequiredFields.has(shortName)) {
			return true;
		}
	}
	return false;
}

function stripFieldRequiredConstraints(
	field: SchemaFieldDefinition,
	includeMinItems = true
): SchemaFieldDefinition {
	return {
		...field,
		required: false,
		requiredIf: undefined,
		...(includeMinItems
			? {
					minItems: undefined,
					minFiles: undefined,
					minRows: undefined,
				}
			: {}),
		conditions: field.conditions ? { ...field.conditions, require: undefined } : undefined,
		validation: field.validation
			? {
					...field.validation,
					required: false,
					requiredIf: undefined,
					...(includeMinItems ? { minItems: undefined } : {}),
				}
			: undefined,
	};
}

/**
 * Recursively validates a list of `SchemaFieldDefinition` nodes (including nested sections, inline tabs, and repeaters).
 */
export function validateFieldNodesRecursive(
	fields: SchemaFieldDefinition[],
	values: Record<string, unknown>,
	errors: Record<string, string>,
	failedTabIds: Set<string>,
	scopePrefix?: string,
	enclosingTabId?: string,
	skipRequiredFields?: ReadonlySet<string>
): void {
	for (const field of fields) {
		const fieldState = resolveFieldState(field, values, scopePrefix);
		if (!fieldState.visible || fieldState.disabled) {
			continue;
		}

		// Inline tabs group
		if (field.kind === 'tabs' || (Array.isArray(field.tabs) && field.tabs.length > 0)) {
			for (const pane of field.tabs || []) {
				const paneState = resolveFieldState(pane, values, scopePrefix);
				if (!paneState.visible || paneState.disabled) {
					continue;
				}
				validateFieldNodesRecursive(
					pane.fields || [],
					values,
					errors,
					failedTabIds,
					scopePrefix,
					pane.id || enclosingTabId,
					skipRequiredFields
				);
			}
			continue;
		}

		// Nested section / fieldset
		const sectionChildren = normalizeChildFields(field.fields).concat(
			Array.isArray(field.children) ? field.children : []
		);
		if (field.kind === 'section' || sectionChildren.length > 0) {
			validateFieldNodesRecursive(
				sectionChildren,
				values,
				errors,
				failedTabIds,
				scopePrefix,
				enclosingTabId,
				skipRequiredFields
			);
			continue;
		}

		if (field.kind === 'markup' || field.type === 'heading' || field.type === 'submit') {
			continue;
		}

		if (!field.name) {
			continue;
		}

		let fieldVal = values[field.name] ?? field.value ?? field.defaultValue;
		const existingVal = field.name in values ? values[field.name] : undefined;
		if (
			(field.type === 'image' || field.type === 'file') &&
			!(Array.isArray(existingVal) && existingVal.length > 0) &&
			(fieldVal === undefined || fieldVal === null || fieldVal === '' || (Array.isArray(fieldVal) && fieldVal.length === 0))
		) {
			const fieldExtra = field as SchemaFieldDefinition & {
				items?: unknown[];
				props?: { files?: unknown[] };
			};
			const preloadedFiles =
				(Array.isArray(field.files) && field.files.length > 0 ? field.files : null) ||
				(Array.isArray(fieldExtra.items) && fieldExtra.items.length > 0 ? fieldExtra.items : null) ||
				(Array.isArray(fieldExtra.props?.files) && fieldExtra.props.files.length > 0
					? fieldExtra.props.files
					: null);
			if (preloadedFiles) {
				fieldVal = preloadedFiles;
			}
		}
		const skipRequired = isFieldSkippedRequired(field.name, scopePrefix, skipRequiredFields);
		const effectiveField = skipRequired ? stripFieldRequiredConstraints(field, true) : field;
		let err = validateFieldWithValibot(effectiveField, fieldVal, values, scopePrefix);
		if (!err && (field.useLanguages || field.i18n?.enabled)) {
			const i18nLangs = field.i18n?.languages ?? field.languages;
			if (Array.isArray(i18nLangs)) {
				for (const lang of i18nLangs) {
					if (lang.isDefault) {
						continue;
					}
					const langKey = lang.inputName || `${field.name}__${lang.id}`;
					const langVal = langKey in values ? values[langKey] : lang.value;
					if (typeof langVal === 'string' && langVal.trim() !== '') {
						const langErr = validateFieldWithValibot(
							stripFieldRequiredConstraints(field, false),
							langVal,
							values,
							scopePrefix
						);
						if (langErr) {
							err = `${langErr} (${lang.title || lang.name})`;
							break;
						}
					}
				}
			}
		}
		if (err) {
			errors[field.name] = err;
			if (enclosingTabId) {
				failedTabIds.add(enclosingTabId);
			}
		}

		const rawType = (field.type || field.inputfieldClass || '').toLowerCase();
		if (rawType === 'repeater' || (Array.isArray(field.subfields) && field.subfields.length > 0)) {
			const beforeCount = Object.keys(errors).length;
			validateRepeaterSubfields(field, fieldVal, errors);
			if (Object.keys(errors).length > beforeCount && enclosingTabId) {
				failedTabIds.add(enclosingTabId);
			}
		}
	}
}

/**
 * Validates an entire `SchemaFormPayload` tree, including top-level tabs, root fields,
 * registered nested fragments, and dynamic block collections (`RegisteredBlockFieldSpec`).
 */
export function validateSchemaTree(
	schema: SchemaFormPayload,
	values: Record<string, unknown>,
	options?: {
		stepIndex?: number;
		scopePrefix?: string;
		skipRequiredFields?: Iterable<string>;
		registeredBlocks?: Iterable<RegisteredBlockFieldSpec>;
		registeredFragments?: Iterable<RegisteredFragmentSpec>;
	}
): SchemaValidationResult {
	const errors: Record<string, string> = {};
	const failedTabIds = new Set<string>();
	const failedBlockIds = new Set<string>();
	const scopePrefix = options?.scopePrefix;
	const stepFilter = options?.stepIndex;
	const rootSkipRequired = options?.skipRequiredFields
		? new Set(options.skipRequiredFields)
		: undefined;

	// 1. Validate top-level tabs (when not filtering to a single wizard step)
	if (stepFilter === undefined) {
		const topTabs: SchemaTabPaneDefinition[] = Array.isArray(schema.tabs) ? schema.tabs : [];
		for (const tab of topTabs) {
			const tabState = resolveFieldState(tab, values, scopePrefix);
			if (!tabState.visible || tabState.disabled) {
				continue;
			}
			validateFieldNodesRecursive(
				tab.fields || [],
				values,
				errors,
				failedTabIds,
				scopePrefix,
				tab.id,
				rootSkipRequired
			);
		}
	}

	// 2. Validate root fields (filtered by stepIndex if validating a wizard step)
	const rootFields = (schema.fields || []).filter((f) => {
		if (stepFilter === undefined) {
			return true;
		}
		const fStep = f.stepIndex && f.stepIndex > 0 ? f.stepIndex : 1;
		return fStep === stepFilter;
	});
	validateFieldNodesRecursive(rootFields, values, errors, failedTabIds, scopePrefix, undefined, rootSkipRequired);

	// 3. Validate registered nested fragments (e.g. embedded schemas)
	if (options?.registeredFragments && stepFilter === undefined) {
		for (const frag of options.registeredFragments) {
			const fragScope = frag.scopePrefix || scopePrefix;
			const fragSkip = frag.skipRequiredFields?.length ? new Set(frag.skipRequiredFields) : undefined;
			validateFieldNodesRecursive(
				frag.schema.fields || [],
				values,
				errors,
				failedTabIds,
				fragScope,
				undefined,
				fragSkip
			);
			for (const tab of frag.schema.tabs || []) {
				const tabState = resolveFieldState(tab, values, fragScope);
				if (!tabState.visible || tabState.disabled) {
					continue;
				}
				validateFieldNodesRecursive(
					tab.fields || [],
					values,
					errors,
					failedTabIds,
					fragScope,
					tab.id,
					fragSkip
				);
			}
		}
	}

	// 4. Validate registered nested block collections (`RegisteredBlockFieldSpec`)
	if (options?.registeredBlocks && stepFilter === undefined) {
		const blockFieldsList = Array.from(options.registeredBlocks);
		const evaluatedByField = new Map<
			RegisteredBlockFieldSpec,
			{ blocks: RegisteredBlockItemSpec[]; failedIds: Set<string>; fieldError?: string }
		>();

		for (const blockField of blockFieldsList) {
			if (blockField.readOnly) {
				continue;
			}
			const blocks = blockField.getBlocks();
			const minItems = Number(blockField.minItems || 0);
			const maxItems = Number(blockField.maxItems || 0);
			const label = blockField.label || blockField.fieldName || 'Blocks';
			let fieldBlockError: string | undefined;

			if (minItems > 0 && blocks.length < minItems) {
				fieldBlockError = `${label} requires at least ${minItems} block(s).`;
				errors[blockField.fieldName] = fieldBlockError;
			} else if (maxItems > 0 && blocks.length > maxItems) {
				fieldBlockError = `${label} allows at most ${maxItems} block(s).`;
				errors[blockField.fieldName] = fieldBlockError;
			}

			const thisFieldFailedSet = new Set<string>();
			for (const block of blocks) {
				// Skip unpublished/hidden blocks (status !== 1)
				if (block.status !== 1) {
					continue;
				}
				const blockSchema = block.schema;
				if (!blockSchema) {
					continue;
				}
				const defaultValuesObj =
					blockSchema.defaultValues && typeof blockSchema.defaultValues === 'object'
						? (blockSchema.defaultValues as Record<string, unknown>)
						: {};
				const valuesObj =
					blockSchema.values && typeof blockSchema.values === 'object'
						? (blockSchema.values as Record<string, unknown>)
						: {};
				const mergedValues: Record<string, unknown> = {
					...defaultValuesObj,
					...valuesObj,
					...(block.values || {}),
					...values,
				};
				const blockErrors: Record<string, string> = {};
				const blockSkip = block.skipRequiredFields?.length ? new Set(block.skipRequiredFields) : undefined;
				const blockTabs = Array.isArray(blockSchema.tabs) ? blockSchema.tabs : [];
				for (const tab of blockTabs) {
					const tabState = resolveFieldState(tab, mergedValues, block.prefix);
					if (!tabState.visible || tabState.disabled) {
						continue;
					}
					validateFieldNodesRecursive(
						tab.fields || [],
						mergedValues,
						blockErrors,
						failedTabIds,
						block.prefix,
						tab.id,
						blockSkip
					);
				}
				const blockFields = normalizeChildFields(
					blockSchema.fields as SchemaFieldDefinition[] | Record<string, SchemaFieldDefinition> | undefined
				);
				validateFieldNodesRecursive(
					blockFields,
					mergedValues,
					blockErrors,
					failedTabIds,
					block.prefix,
					undefined,
					blockSkip
				);

				const blockErrorKeys = Object.keys(blockErrors);
				if (blockErrorKeys.length > 0) {
					failedBlockIds.add(block.id);
					thisFieldFailedSet.add(block.id);
					for (const [k, msg] of Object.entries(blockErrors)) {
						errors[k] = msg;
					}
				}
			}

			evaluatedByField.set(blockField, {
				blocks,
				failedIds: thisFieldFailedSet,
				fieldError: fieldBlockError,
			});
		}

		// Propagate nested descendant block/field errors up to enclosing ancestor blocks so collapsed parents auto-expand
		const allErrorKeys = Object.keys(errors);
		if (allErrorKeys.length > 0) {
			for (const [, entry] of evaluatedByField) {
				for (const block of entry.blocks) {
					if (block.status !== 1 || entry.failedIds.has(block.id) || !block.prefix) {
						continue;
					}
					const hasDescendantErr = allErrorKeys.some(
						(errKey) =>
							errKey.startsWith(`${block.prefix}_`) ||
							(errKey.startsWith('weblock_') && errKey.includes(`_${block.prefix}_`))
					);
					if (hasDescendantErr) {
						entry.failedIds.add(block.id);
						failedBlockIds.add(block.id);
					}
				}
			}
		}

		for (const [blockField, entry] of evaluatedByField) {
			blockField.onValidationResult?.(Array.from(entry.failedIds), entry.fieldError);
		}
	}

	const errorKeys = Object.keys(errors);
	return {
		valid: errorKeys.length === 0,
		errors,
		firstErrorField: errorKeys[0] || null,
		failedTabIds: Array.from(failedTabIds),
		failedBlockIds: Array.from(failedBlockIds),
	};
}
