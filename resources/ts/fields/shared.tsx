import React from 'react';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../lib/utils';
import type {
	InputfieldLanguageItem,
	InputfieldMediaItem,
	InputfieldOptionItem,
	SchemaConditionSpec,
	SchemaFieldConditions,
	SchemaFieldDefinition,
	SchemaFieldOption,
	SchemaFieldValidationRules,
} from './types';

const SLUG_CHAR_MAP: Record<string, string> = {
	ç: 'c',
	Ç: 'c',
	ğ: 'g',
	Ğ: 'g',
	ı: 'i',
	I: 'i',
	İ: 'i',
	ö: 'o',
	Ö: 'o',
	ş: 's',
	Ş: 's',
	ü: 'u',
	Ü: 'u',
	ä: 'ae',
	Ä: 'ae',
	ß: 'ss',
};

export function slugifyText(raw: string, separator = '-', maxLen = 128): string {
	const sep = separator === '_' ? '_' : '-';
	let out = '';
	for (const ch of raw) {
		out += SLUG_CHAR_MAP[ch] ?? ch;
	}
	out = out
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, sep)
		.replace(new RegExp(`^\\${sep}+|\\${sep}+$`, 'g'), '');
	if (maxLen > 0 && out.length > maxLen) {
		out = out.slice(0, maxLen).replace(new RegExp(`\\${sep}+$`, 'g'), '');
	}
	return out;
}

export function generateRandomHex(bytes: number): string {
	const safeBytes = Math.max(8, Math.min(128, bytes || 32));
	const arr = new Uint8Array(safeBytes);
	if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
		window.crypto.getRandomValues(arr);
	} else {
		for (let i = 0; i < safeBytes; i++) {
			arr[i] = Math.floor(Math.random() * 256);
		}
	}
	return Array.from(arr)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export function dispatchDomChange(el: HTMLElement | null | undefined): void {
	if (!el || typeof Event === 'undefined') {
		return;
	}
	el.dispatchEvent(new Event('input', { bubbles: true }));
	el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function flattenOptions(options: InputfieldOptionItem[] = []): Array<{
	value: string;
	label: string;
	disabled?: boolean;
	group?: string;
}> {
	const flat: Array<{ value: string; label: string; disabled?: boolean; group?: string }> = [];
	for (const opt of options) {
		if (Array.isArray(opt.optgroup)) {
			for (const sub of opt.optgroup) {
				flat.push({
					value: String(sub.value),
					label: sub.label,
					disabled: sub.disabled,
					group: opt.label,
				});
			}
		} else {
			flat.push({
				value: String(opt.value),
				label: opt.label,
				disabled: opt.disabled,
				group: opt.group,
			});
		}
	}
	return flat;
}

export function normalizeOptions(
	options?: Record<string, string> | SchemaFieldOption[]
): InputfieldOptionItem[] {
	if (!options) {
		return [];
	}
	if (Array.isArray(options)) {
		return options.map((opt) => ({
			value: String(opt.value),
			label: String(opt.label),
			disabled: opt.disabled,
			group: opt.group,
		}));
	}
	return Object.entries(options).map(([value, label]) => ({
		value,
		label: String(label),
	}));
}

const GRID_SPAN_CLASSES: Record<number, string> = {
	1: 'col-span-12 md:col-span-1',
	2: 'col-span-12 md:col-span-2',
	3: 'col-span-12 md:col-span-3',
	4: 'col-span-12 md:col-span-4',
	5: 'col-span-12 md:col-span-5',
	6: 'col-span-12 md:col-span-6',
	7: 'col-span-12 md:col-span-7',
	8: 'col-span-12 md:col-span-8',
	9: 'col-span-12 md:col-span-9',
	10: 'col-span-12 md:col-span-10',
	11: 'col-span-12 md:col-span-11',
	12: 'col-span-12',
};

export function resolveGridSpanClass(width?: number, colSpan?: number): string {
	if (typeof colSpan === 'number' && Number.isFinite(colSpan) && colSpan >= 1 && colSpan <= 12) {
		return GRID_SPAN_CLASSES[Math.round(colSpan)] || 'col-span-12';
	}
	const w = width && width > 0 && width <= 100 ? width : 100;
	const span = Math.max(1, Math.min(12, Math.round((w / 100) * 12)));
	return GRID_SPAN_CLASSES[span] || 'col-span-12';
}

export function resolveScopedFieldValue(
	values: Record<string, unknown>,
	rawKey: string,
	scopePrefix?: string
): unknown {
	const key = rawKey.trim();
	if (!key) {
		return '';
	}

	const lookupDirect = (targetKey: string): { found: boolean; value: unknown } => {
		if (scopePrefix) {
			const cleanPrefix = scopePrefix.replace(/_+$/, '');
			if (cleanPrefix) {
				const scopedKey = `${cleanPrefix}_${targetKey}`;
				if (scopedKey in values) {
					return { found: true, value: values[scopedKey] };
				}
			}
			if (`${scopePrefix}${targetKey}` in values) {
				return { found: true, value: values[`${scopePrefix}${targetKey}`] };
			}
			if (targetKey in values) {
				return { found: true, value: values[targetKey] };
			}
			return { found: false, value: '' };
		}
		if (targetKey in values) {
			return { found: true, value: values[targetKey] };
		}
		if (/^(?:weblock|rwblock)_/.test(targetKey)) {
			return { found: false, value: '' };
		}
		for (const [k, v] of Object.entries(values)) {
			if (!/^(?:weblock|rwblock)_/.test(k) && k.endsWith(`_${targetKey}`)) {
				return { found: true, value: v };
			}
		}
		return { found: false, value: '' };
	};

	const direct = lookupDirect(key);
	if (direct.found) {
		return direct.value;
	}

	const dotIdx = key.indexOf('.');
	if (dotIdx > 0 && dotIdx < key.length - 1) {
		const rootKey = key.slice(0, dotIdx);
		const subSegments = key.slice(dotIdx + 1).split('.').filter(Boolean);
		const rootLookup = lookupDirect(rootKey);
		if (!rootLookup.found) {
			return '';
		}
		let current: unknown = rootLookup.value;
		if (typeof current === 'string' && current.trim().startsWith('{')) {
			try {
				current = JSON.parse(current.trim());
			} catch {
				return '';
			}
		}
		for (const seg of subSegments) {
			if (
				current === null ||
				current === undefined ||
				typeof current !== 'object' ||
				seg === '__proto__' ||
				seg === 'constructor' ||
				seg === 'prototype' ||
				!Object.prototype.hasOwnProperty.call(current, seg)
			) {
				return '';
			}
			current = (current as Record<string, unknown>)[seg];
		}
		return current !== undefined && current !== null ? current : '';
	}

	return '';
}

export function isLinkValueObject(val: unknown): val is Record<string, unknown> {
	if (val === null || typeof val !== 'object' || Array.isArray(val)) {
		return false;
	}
	const rec = val as Record<string, unknown>;
	return (
		typeof rec.type === 'string' &&
		('pageId' in rec || 'url' in rec || 'entryId' in rec || 'file' in rec || 'anchor' in rec)
	);
}

export function isLinkFieldValueEmpty(val: unknown): boolean {
	if (val === null || val === undefined) {
		return true;
	}
	if (typeof val === 'string') {
		const trimmed = val.trim();
		if (trimmed === '') {
			return true;
		}
		if (trimmed.startsWith('{')) {
			try {
				const parsed = JSON.parse(trimmed);
				if (isLinkValueObject(parsed)) {
					return isLinkFieldValueEmpty(parsed);
				}
			} catch {
				// Treat non-JSON string as plain URL
			}
		}
		return false;
	}
	if (!isLinkValueObject(val)) {
		return true;
	}
	const type = String(val.type || 'url').toLowerCase().trim();
	if (type === 'page') {
		return !(Number(val.pageId) > 0);
	}
	if (type === 'entry') {
		return String(val.entryId ?? '').trim() === '';
	}
	if (type === 'anchor') {
		return String(val.anchor ?? val.url ?? '').replace(/^#+/, '').trim() === '';
	}
	if (type === 'tel') {
		return String(val.url ?? '').replace(/[^0-9]+/g, '') === '';
	}
	if (type === 'email') {
		return String(val.url ?? '').trim() === '';
	}
	if (type === 'url') {
		return String(val.url ?? '').trim() === '' && String(val.anchor ?? '').trim() === '';
	}
	return (
		String(val.file ?? '').trim() === '' &&
		String(val.url ?? '').trim() === '' &&
		String(val.entryId ?? '').trim() === '' &&
		!(Number(val.pageId) > 0)
	);
}

function evaluateSingleClause(
	clause: string,
	values: Record<string, unknown>,
	scopePrefix?: string
): boolean {
	const trimmed = clause.trim();
	if (!trimmed) {
		return true;
	}

	const match = trimmed.match(/^([a-zA-Z0-9_|.]+)\s*(!=|\*=|\^=|\$=|>=|<=|=|>|<)\s*(.*)$/);
	if (!match) {
		const bareNegated = trimmed.startsWith('!');
		const bareKey = (bareNegated ? trimmed.slice(1) : trimmed).trim();
		if (/^[a-zA-Z0-9_.]+$/.test(bareKey)) {
			const bareVal = resolveScopedFieldValue(values, bareKey, scopePrefix);
			const isTruthy = Array.isArray(bareVal)
				? bareVal.length > 0
				: isLinkValueObject(bareVal)
					? !isLinkFieldValueEmpty(bareVal)
					: bareVal !== null && bareVal !== undefined && bareVal !== false && bareVal !== '' && bareVal !== 0 && bareVal !== '0';
			return bareNegated ? !isTruthy : isTruthy;
		}
		return true;
	}

	const [, lhsRaw = '', operator = '=', rhsRaw = ''] = match;
	const fieldKeys = lhsRaw.split('|').map((k) => k.trim()).filter(Boolean);
	const expectedAlternatives = rhsRaw
		.replace(/^["']|["']$/g, '')
		.split('|')
		.map((v) => v.trim());

	return fieldKeys.some((fieldKey) => {
		const isCountCheck = fieldKey.endsWith('.count');
		const baseKey = isCountCheck ? fieldKey.slice(0, -6) : fieldKey;
		const actualRaw = resolveScopedFieldValue(values, baseKey, scopePrefix);

		const actualList: string[] = Array.isArray(actualRaw)
			? actualRaw.map((v) => String(v))
			: isLinkValueObject(actualRaw)
				? [isLinkFieldValueEmpty(actualRaw) ? '' : '1']
				: actualRaw === true
					? ['1']
					: actualRaw === false || actualRaw === null || actualRaw === undefined
						? ['']
						: [String(actualRaw)];

		const compareValue = isCountCheck
			? String(Array.isArray(actualRaw) ? actualRaw.length : actualList[0] ? 1 : 0)
			: actualList[0] ?? '';

		switch (operator) {
			case '=':
				return expectedAlternatives.some((exp) =>
					exp === ''
						? actualList.every((v) => v === '' || v === '0')
						: actualList.includes(exp) || (exp === '1' && compareValue === 'true')
				);
			case '!=':
				return expectedAlternatives.every((exp) =>
					exp === ''
						? actualList.some((v) => v !== '' && v !== '0')
						: !actualList.includes(exp)
				);
			case '*=':
				return expectedAlternatives.some((exp) =>
					actualList.some((v) => v.toLowerCase().includes(exp.toLowerCase()))
				);
			case '^=':
				return expectedAlternatives.some((exp) =>
					actualList.some((v) => v.toLowerCase().startsWith(exp.toLowerCase()))
				);
			case '$=':
				return expectedAlternatives.some((exp) =>
					actualList.some((v) => v.toLowerCase().endsWith(exp.toLowerCase()))
				);
			case '>':
				return parseFloat(compareValue || '0') > parseFloat(expectedAlternatives[0] || '0');
			case '<':
				return parseFloat(compareValue || '0') < parseFloat(expectedAlternatives[0] || '0');
			case '>=':
				return parseFloat(compareValue || '0') >= parseFloat(expectedAlternatives[0] || '0');
			case '<=':
				return parseFloat(compareValue || '0') <= parseFloat(expectedAlternatives[0] || '0');
			default:
				return true;
		}
	});
}

export function normalizeConditionExpressionToString(
	spec: SchemaConditionSpec | undefined | null
): string {
	if (!spec) {
		return '';
	}
	if (typeof spec === 'string') {
		return spec.trim();
	}
	const formatRule = (field: string, operator = '=', val: unknown = ''): string => {
		const cleanField = field.trim();
		if (!cleanField) {
			return '';
		}
		const cleanOp =
			operator === '==' || operator === '===' || !operator.trim()
				? '='
				: operator === '!=='
					? '!='
					: operator.trim();
		const valStr = Array.isArray(val)
			? val.map((item) => (typeof item === 'boolean' ? (item ? '1' : '0') : String(item))).join('|')
			: typeof val === 'boolean'
				? val
					? '1'
					: '0'
				: val === null || val === undefined
					? ''
					: String(val);
		return `${cleanField}${cleanOp}${valStr}`;
	};
	if (Array.isArray(spec)) {
		return (spec as unknown[])
			.map((entry) => {
				if (typeof entry === 'string') {
					return entry.trim();
				}
				if (entry && typeof entry === 'object' && 'field' in entry && typeof entry.field === 'string') {
					const clause = entry as { field: string; operator?: string; value?: unknown };
					return formatRule(clause.field, clause.operator ?? '=', clause.value ?? '');
				}
				return '';
			})
			.filter(Boolean)
			.join(', ');
	}
	if (typeof spec === 'object') {
		const specRec = spec as Record<string, unknown>;
		if (typeof specRec.field === 'string') {
			return formatRule(
				specRec.field,
				typeof specRec.operator === 'string' ? specRec.operator : '=',
				specRec.value ?? ''
			);
		}
		return Object.entries(spec)
			.map(([key, val]) => formatRule(key, '=', val))
			.filter(Boolean)
			.join(', ');
	}
	return '';
}

export function evaluateCondition(
	spec: SchemaConditionSpec | undefined | null,
	values: Record<string, unknown>,
	scopePrefix?: string
): boolean {
	const expression = normalizeConditionExpressionToString(spec);
	if (!expression) {
		return true;
	}
	const clauses = expression
		.split(',')
		.map((c) => c.trim())
		.filter(Boolean);
	return clauses.every((clause) => evaluateSingleClause(clause, values, scopePrefix));
}

export function evaluateShowIfCondition(
	expression: SchemaConditionSpec | undefined,
	values: Record<string, unknown>,
	scopePrefix?: string
): boolean {
	return evaluateCondition(expression, values, scopePrefix);
}

export function resolveFieldState(
	node: {
		showIf?: string;
		hideIf?: string;
		enableIf?: string;
		disableIf?: string;
		requiredIf?: string;
		required?: boolean;
		disabled?: boolean;
		readonly?: boolean;
		readOnly?: boolean;
		conditions?: SchemaFieldConditions;
		validation?: SchemaFieldValidationRules;
		rules?: SchemaFieldValidationRules;
	},
	values: Record<string, unknown>,
	scopePrefix?: string
): {
	visible: boolean;
	enabled: boolean;
	disabled: boolean;
	required: boolean;
} {
	const cond = node.conditions ?? {};
	const valRules = node.validation ?? {};

	const showExpr = normalizeConditionExpressionToString(cond.show ?? node.showIf);
	const hideExpr = normalizeConditionExpressionToString(cond.hide ?? node.hideIf);
	const enableExpr = normalizeConditionExpressionToString(cond.enable ?? node.enableIf);
	const disableExpr = normalizeConditionExpressionToString(cond.disable ?? node.disableIf);

	const rawReqIf =
		cond.require ??
		node.requiredIf ??
		(typeof valRules.requiredIf === 'object' && valRules.requiredIf !== null
			? valRules.requiredIf.value
			: valRules.requiredIf);
	const requireExpr = normalizeConditionExpressionToString(rawReqIf);

	const visible =
		(!showExpr || evaluateCondition(showExpr, values, scopePrefix)) &&
		(!hideExpr || !evaluateCondition(hideExpr, values, scopePrefix));

	const staticallyDisabled = Boolean(node.disabled || node.readOnly || node.readonly);
	const disabledByEnable = enableExpr !== '' && !evaluateCondition(enableExpr, values, scopePrefix);
	const disabledByDisable = disableExpr !== '' && evaluateCondition(disableExpr, values, scopePrefix);
	const disabled = staticallyDisabled || disabledByEnable || disabledByDisable;

	const rawRequiredRule =
		typeof valRules.required === 'object' && valRules.required !== null
			? valRules.required.value
			: valRules.required;
	const baseRequired = Boolean(node.required || rawRequiredRule);
	const required =
		visible &&
		!disabled &&
		(requireExpr !== ''
			? evaluateCondition(requireExpr, values, scopePrefix)
			: baseRequired);

	return {
		visible,
		enabled: !disabled,
		disabled,
		required,
	};
}

export function countNestedErrors(
	fields: SchemaFieldDefinition[],
	errors: Record<string, string>
): number {
	let count = 0;
	const errorKeys = Object.keys(errors).filter((k) => Boolean(errors[k]));
	for (const f of fields) {
		if (f.error || (f.name && errors[f.name])) {
			count++;
		}
		if (f.name) {
			const repeaterPrefix = `${f.name}[`;
			const weBlockPrefix = `weblock_${f.name}_`;
			const rwBlockPrefix = `rwblock_${f.name}_`;
			for (const errKey of errorKeys) {
				if (
					errKey !== f.name &&
					(errKey.startsWith(repeaterPrefix) ||
						errKey.startsWith(weBlockPrefix) ||
						errKey.startsWith(rwBlockPrefix))
				) {
					count++;
				}
			}
		}
		if (Array.isArray(f.fields)) {
			count += countNestedErrors(f.fields, errors);
		} else if (f.fields && typeof f.fields === 'object') {
			count += countNestedErrors(Object.values(f.fields), errors);
		}
		if (Array.isArray(f.children)) {
			count += countNestedErrors(f.children, errors);
		}
		if (Array.isArray(f.tabs)) {
			for (const t of f.tabs) {
				count += countNestedErrors(t.fields || [], errors);
			}
		}
	}
	return count;
}

export const LANGUAGE_SELECT_ALL_EVENT = 'wk:language-tab-select-all';

let isSyncingLanguageBroadcast = false;
let lastLanguageBroadcastId = 0;
let lastLanguageBroadcastTs = 0;
let lastSyncedGlobalLangId = 0;

export function resolveIsoLangAttr(langName?: string | null): string | undefined {
	const clean = String(langName ?? '').trim();
	if (!clean || clean.toLowerCase() === 'default') {
		return undefined;
	}
	return /^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})?$/i.test(clean) ? clean : undefined;
}

export function resolveLanguageSyncScope(el: HTMLElement | null): HTMLFormElement | null {
	if (!el) {
		return null;
	}
	return el.closest('form');
}

function readLangTabsDcCookie(): { langId: number; requestId: string } | null {
	if (typeof document === 'undefined' || !document.cookie) {
		return null;
	}
	const match = /(?:^|;\s*)langTabsDC=([^;]+)/.exec(document.cookie);
	if (!match?.[1]) {
		return null;
	}
	const decoded = decodeURIComponent(match[1]);
	const dashIdx = decoded.indexOf('-');
	if (dashIdx <= 0) {
		return null;
	}
	const langId = Number(decoded.slice(0, dashIdx));
	const requestId = decoded.slice(dashIdx + 1);
	return Number.isFinite(langId) && langId > 0 ? { langId, requestId } : null;
}

interface ProcessWireLangTabsWindow {
	ProcessWire?: {
		config?: {
			LanguageTabs?: {
				requestId?: unknown;
				activeTab?: number;
			};
		};
	};
	jQuery?: (el: Element | Document) => {
		trigger: (evt: string) => void;
		on: (events: string, selector: string, handler: (this: Element) => void) => void;
	};
	__rwNativeLangTabsBridgeBound?: boolean;
	__rwNativeLangTabsJqBound?: boolean;
}

export function readInitialSyncedLanguageId(
	languages: InputfieldLanguageItem[] | undefined
): number {
	if (!languages || languages.length === 0) {
		return 0;
	}
	if (lastSyncedGlobalLangId > 0 && languages.some((l) => l.id === lastSyncedGlobalLangId)) {
		return lastSyncedGlobalLangId;
	}
	if (typeof window !== 'undefined') {
		const pwCfg = (window as unknown as ProcessWireLangTabsWindow).ProcessWire?.config?.LanguageTabs;
		const cookieData = readLangTabsDcCookie();
		if (
			cookieData &&
			(!pwCfg?.requestId || cookieData.requestId === String(pwCfg.requestId)) &&
			languages.some((l) => l.id === cookieData.langId)
		) {
			return cookieData.langId;
		}
		const activeLang =
			pwCfg && typeof pwCfg.activeTab === 'number' && pwCfg.activeTab >= 0
				? languages[pwCfg.activeTab]
				: undefined;
		if (activeLang) {
			return activeLang.id;
		}
	}
	const def = languages.find((l) => l.isDefault) ?? languages[0];
	return def ? def.id : 0;
}

function syncNativeProcessWireLanguageTabs(langId: number, hostForm: HTMLFormElement | null): void {
	if (typeof document === 'undefined' || langId <= 0) {
		return;
	}
	const root: ParentNode = hostForm || document;
	const anchors = Array.from(
		root.querySelectorAll<HTMLAnchorElement>(`a.langTab${langId}, .langTabs a[data-lang="${langId}"]`)
	);
	const jq = typeof window !== 'undefined' ? (window as unknown as ProcessWireLangTabsWindow).jQuery : undefined;

	for (const anchor of anchors) {
		const parentLi = anchor.closest('li');
		if (
			parentLi?.classList.contains('uk-active') ||
			parentLi?.classList.contains('ui-tabs-active') ||
			parentLi?.classList.contains('ui-state-active')
		) {
			continue;
		}
		const href = anchor.getAttribute('href') || '';
		if (href.startsWith('#')) {
			const targetPanel = document.getElementById(href.slice(1));
			if (targetPanel?.classList.contains('LanguageSupportCurrent')) {
				continue;
			}
		}
		if (jq) {
			jq(anchor).trigger('click');
		} else {
			anchor.click();
		}
	}

	const pwCfg =
		typeof window !== 'undefined'
			? (window as unknown as ProcessWireLangTabsWindow).ProcessWire?.config?.LanguageTabs
			: undefined;
	if (pwCfg?.requestId && typeof document !== 'undefined') {
		try {
			document.cookie = `langTabsDC=${langId}-${encodeURIComponent(String(pwCfg.requestId))}; path=/; SameSite=Lax`;
		} catch {
			// Ignore restricted cookie environments
		}
	}
}

export function ensureNativeLanguageTabsBridge(): void {
	if (
		typeof window === 'undefined' ||
		typeof document === 'undefined' ||
		typeof document.addEventListener !== 'function' ||
		typeof window.addEventListener !== 'function'
	) {
		return;
	}
	const win = window as unknown as ProcessWireLangTabsWindow;
	if (win.__rwNativeLangTabsBridgeBound) {
		return;
	}
	win.__rwNativeLangTabsBridgeBound = true;

	const emitFromNativeAnchor = (anchor: Element | null) => {
		if (!anchor || isSyncingLanguageBroadcast) {
			return;
		}
		const attrLang = anchor.getAttribute('data-lang');
		const classMatch = !attrLang ? /\blangTab(\d+)\b/.exec(anchor.className || '') : null;
		const langId = Number(attrLang || classMatch?.[1] || 0);
		if (!Number.isFinite(langId) || langId <= 0) {
			return;
		}
		const now = Date.now();
		if (lastLanguageBroadcastId === langId && now - lastLanguageBroadcastTs < 240) {
			return;
		}
		lastLanguageBroadcastId = langId;
		lastLanguageBroadcastTs = now;
		lastSyncedGlobalLangId = langId;
		const hostForm = anchor.closest('form');
		window.dispatchEvent(
			new CustomEvent(LANGUAGE_SELECT_ALL_EVENT, {
				detail: {
					langId,
					scope: hostForm,
					form: hostForm,
					source: 'pw-native',
				},
			})
		);
	};

	document.addEventListener('dblclick', (e) => {
		const target = e.target instanceof Element ? e.target : null;
		const anchor = target?.closest('a.langTabLink, .langTabs a[data-lang]') ?? null;
		if (anchor) {
			emitFromNativeAnchor(anchor);
		}
	});

	const bindJqueryBridge = () => {
		const jq = win.jQuery;
		if (!jq || win.__rwNativeLangTabsJqBound) {
			return;
		}
		win.__rwNativeLangTabsJqBound = true;
		jq(document).on(
			'dblclicklangtab.rwLangBridge',
			'a.langTabLink, .langTabs a[data-lang]',
			function (this: Element) {
				emitFromNativeAnchor(this);
			}
		);
	};

	bindJqueryBridge();
	if (!win.__rwNativeLangTabsJqBound) {
		document.addEventListener('DOMContentLoaded', bindJqueryBridge, { once: true });
		window.addEventListener('load', bindJqueryBridge, { once: true });
	}
}

export function broadcastLanguageSync(langId: number, sourceEl: HTMLElement | null): void {
	if (
		typeof window === 'undefined' ||
		typeof window.dispatchEvent !== 'function' ||
		!Number.isFinite(langId) ||
		langId <= 0
	) {
		return;
	}
	ensureNativeLanguageTabsBridge();
	const now = Date.now();
	if (lastLanguageBroadcastId === langId && now - lastLanguageBroadcastTs < 240) {
		return;
	}
	lastLanguageBroadcastId = langId;
	lastLanguageBroadcastTs = now;
	lastSyncedGlobalLangId = langId;

	const hostForm = resolveLanguageSyncScope(sourceEl);
	isSyncingLanguageBroadcast = true;
	try {
		window.dispatchEvent(
			new CustomEvent(LANGUAGE_SELECT_ALL_EVENT, {
				detail: {
					langId,
					scope: hostForm,
					form: hostForm,
					source: 'react',
				},
			})
		);
		syncNativeProcessWireLanguageTabs(langId, hostForm);
	} finally {
		window.setTimeout(() => {
			isSyncingLanguageBroadcast = false;
		}, 280);
	}
}

export function scrollTabIntoView(tabEl: HTMLElement | null): void {
	if (!tabEl || typeof tabEl.scrollIntoView !== 'function') {
		return;
	}
	try {
		tabEl.scrollIntoView({
			block: 'nearest',
			inline: 'nearest',
			container: 'nearest',
		} as ScrollIntoViewOptions);
	} catch {
		tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
}

export function navigateTablistByKey(
	event: React.KeyboardEvent<HTMLElement>,
	orientation: 'horizontal' | 'vertical' = 'horizontal'
): void {
	const listEl = event.currentTarget;
	const tabs = Array.from(
		listEl.querySelectorAll<HTMLButtonElement>(':scope > [role="tab"]:not(:disabled)')
	);
	if (tabs.length <= 1) {
		return;
	}

	const focusedTab = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[role="tab"]');
	const currentIndex = focusedTab ? tabs.indexOf(focusedTab) : -1;
	if (currentIndex === -1) {
		return;
	}

	const isRtl =
		orientation === 'horizontal' &&
		(listEl.matches(':dir(rtl)') ||
			(typeof document !== 'undefined' && document.documentElement.dir === 'rtl'));

	let nextIndex = -1;
	if (event.key === 'Home') {
		nextIndex = 0;
	} else if (event.key === 'End') {
		nextIndex = tabs.length - 1;
	} else if (orientation === 'vertical') {
		if (event.key === 'ArrowDown') {
			nextIndex = (currentIndex + 1) % tabs.length;
		} else if (event.key === 'ArrowUp') {
			nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
		}
	} else {
		const forwardKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
		const backwardKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
		if (event.key === forwardKey) {
			nextIndex = (currentIndex + 1) % tabs.length;
		} else if (event.key === backwardKey) {
			nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
		}
	}

	if (nextIndex === -1 || nextIndex === currentIndex) {
		return;
	}

	const targetTab = tabs[nextIndex];
	if (!targetTab) {
		return;
	}
	event.preventDefault();
	targetTab.focus();
	targetTab.click();
	scrollTabIntoView(targetTab);
}

export function SearchableTabPanel({
	id,
	labelledBy,
	isActive,
	searchableWhenHidden = true,
	onRevealMatch,
	className,
	tabIndex,
	dataAttributes,
	children,
}: {
	id?: string;
	labelledBy?: string;
	isActive: boolean;
	searchableWhenHidden?: boolean;
	onRevealMatch?: () => void;
	className?: string;
	tabIndex?: number;
	dataAttributes?: Record<string, string | undefined>;
	children: React.ReactNode;
}): React.ReactElement {
	const panelRef = React.useRef<HTMLDivElement | null>(null);
	const onRevealRef = React.useRef(onRevealMatch);
	onRevealRef.current = onRevealMatch;

	React.useEffect(() => {
		const el = panelRef.current;
		if (!el) {
			return;
		}
		if (isActive) {
			el.removeAttribute('hidden');
			return;
		}
		const supportsUntilFound =
			searchableWhenHidden &&
			typeof HTMLElement !== 'undefined' &&
			'onbeforematch' in HTMLElement.prototype;

		if (supportsUntilFound) {
			el.setAttribute('hidden', 'until-found');
			const handleBeforeMatch = () => {
				onRevealRef.current?.();
			};
			el.addEventListener('beforematch', handleBeforeMatch);
			return () => {
				el.removeEventListener('beforematch', handleBeforeMatch);
			};
		}

		el.setAttribute('hidden', '');
		return undefined;
	}, [isActive, searchableWhenHidden]);

	return (
		<div
			ref={panelRef}
			id={id}
			role="tabpanel"
			aria-labelledby={labelledBy}
			tabIndex={isActive ? tabIndex : undefined}
			hidden={!isActive || undefined}
			className={className}
			{...(dataAttributes ?? {})}
		>
			{children}
		</div>
	);
}

export function LanguageTabsBar({
	languages,
	activeLangId,
	values,
	onSelect,
	expandedAll = false,
	onToggleExpandAll,
	rightSlot,
	ariaLabel = 'Languages',
	dataAttributes,
	className,
}: {
	languages: InputfieldLanguageItem[];
	activeLangId: number;
	values: Record<number, string>;
	onSelect: (langId: number) => void;
	expandedAll?: boolean;
	onToggleExpandAll?: () => void;
	rightSlot?: React.ReactNode;
	ariaLabel?: string;
	dataAttributes?: Record<string, string | undefined>;
	className?: string;
}): React.ReactElement {
	const barRef = React.useRef<HTMLDivElement | null>(null);
	const onSelectRef = React.useRef(onSelect);
	onSelectRef.current = onSelect;
	const lastSingleSwitchRef = React.useRef<{ langId: number; ts: number }>({ langId: 0, ts: 0 });

	React.useEffect(() => {
		ensureNativeLanguageTabsBridge();
		if (typeof window === 'undefined') {
			return;
		}
		const handleSelectAll = (event: Event) => {
			const detail = (
				event as CustomEvent<{
					langId: number;
					scope?: Element | null;
					form?: HTMLFormElement | null;
				}>
			).detail;
			if (!detail || typeof detail.langId !== 'number') {
				return;
			}
			const ownForm = resolveLanguageSyncScope(barRef.current);
			const incomingForm = detail.form ?? (detail.scope instanceof HTMLFormElement ? detail.scope : null);
			if (incomingForm && ownForm && incomingForm !== ownForm) {
				return;
			}
			if (languages.some((l) => l.id === detail.langId)) {
				onSelectRef.current(detail.langId);
			}
		};
		window.addEventListener(LANGUAGE_SELECT_ALL_EVENT, handleSelectAll);
		return () => window.removeEventListener(LANGUAGE_SELECT_ALL_EVENT, handleSelectAll);
	}, [languages]);

	return (
		<div
			ref={barRef}
			className={cn(
				'flex min-w-0 items-center justify-between gap-2 border-b border-border/80',
				className
			)}
		>
			{!expandedAll ? (
				<div
					data-rw-tablist=""
					data-variant="pw-lang"
					data-rw-lang-tabs=""
					role="tablist"
					aria-label={ariaLabel}
					onKeyDown={(e) => navigateTablistByKey(e, 'horizontal')}
					{...(dataAttributes ?? {})}
				>
					{languages.map((lang) => {
						const isActive = lang.id === activeLangId;
						const hasVal = Boolean((values[lang.id] ?? '').trim());
						return (
							<button
								key={lang.id}
								type="button"
								role="tab"
								aria-selected={isActive}
								tabIndex={isActive ? 0 : -1}
								data-lang-id={lang.id}
								data-lang-name={lang.name}
								data-lang-filled={hasVal ? 'true' : undefined}
								data-lang-empty={!hasVal ? 'true' : undefined}
								title={t('form.languageTabSwitchHint', 'Click to switch this field · Double-click to switch all fields')}
								onClick={(e) => {
									scrollTabIntoView(e.currentTarget);
									if (!isActive) {
										lastSingleSwitchRef.current = { langId: lang.id, ts: Date.now() };
										onSelect(lang.id);
										if (e.detail >= 2 && !e.altKey) {
											broadcastLanguageSync(lang.id, e.currentTarget);
										}
										return;
									}
									const justSwitched =
										lastSingleSwitchRef.current.langId === lang.id &&
										Date.now() - lastSingleSwitchRef.current.ts < 320 &&
										e.detail < 2;
									if (!justSwitched && !e.altKey) {
										broadcastLanguageSync(lang.id, e.currentTarget);
									}
								}}
								onDoubleClick={(e) => {
									if (e.altKey) {
										return;
									}
									onSelect(lang.id);
									broadcastLanguageSync(lang.id, e.currentTarget);
								}}
								className={cn(lang.editable === false && 'opacity-60')}
							>
								<span>{lang.title || lang.name}</span>
								<span
									aria-hidden="true"
									className={cn(
										'size-1 rounded-full',
										hasVal ? 'bg-primary/85' : 'bg-muted-foreground/30'
									)}
								/>
							</button>
						);
					})}
				</div>
			) : (
				<span className="py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground select-none">
					{ariaLabel} ({languages.length})
				</span>
			)}

			{rightSlot || onToggleExpandAll ? (
				<div className="inline-flex shrink-0 items-center gap-1.5 pb-0.5">
					{rightSlot}
					{onToggleExpandAll ? (
						<button
							type="button"
							aria-pressed={expandedAll}
							aria-label={expandedAll ? 'Collapse to language tabs' : 'Expand all languages'}
							title={expandedAll ? 'Collapse to language tabs' : 'Expand all languages'}
							data-rw-lang-expand-toggle=""
							onClick={onToggleExpandAll}
							className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring cursor-pointer pointer-coarse:size-8"
						>
							<DynamicIcon
								name={expandedAll ? 'folder-open' : 'folder'}
								className="size-3.5"
								aria-hidden="true"
							/>
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export function CharacterCountBadge({
	current,
	max,
}: {
	current: number;
	max: number;
}): React.ReactElement {
	const isOver = max > 0 && current > max;
	const isNear = max > 0 && !isOver && current >= Math.floor(max * 0.9);
	const label = max > 0 ? `${current} / ${max}` : String(current);

	return (
		<span
			data-rw-char-counter=""
			data-rw-char-max={String(max)}
			className={cn(
				'inline-flex items-center font-mono text-[11px] leading-4 tabular-nums select-none',
				isOver
					? 'font-semibold text-destructive'
					: isNear
						? 'font-medium text-warning'
						: 'text-muted-foreground'
			)}
		>
			{label}
		</span>
	);
}

export function FieldStatusRow({
	error,
	errorId,
	right,
	className,
}: {
	error?: string | null;
	errorId?: string;
	right?: React.ReactNode;
	className?: string;
}): React.ReactElement | null {
	const cleanError = typeof error === 'string' ? error.trim() : '';
	const hasRight = right !== null && right !== undefined && right !== false && right !== '';
	if (!cleanError && !hasRight) {
		return null;
	}

	return (
		<div
			data-rw-field-slot="status"
			className={cn('flex flex-wrap items-start justify-between gap-x-3 gap-y-1', className)}
		>
			{cleanError ? (
				<p
					id={errorId}
					role="alert"
					className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-destructive"
				>
					<DynamicIcon name="alert-circle" className="size-3.5 shrink-0" aria-hidden="true" />
					<span className="break-words">{cleanError}</span>
				</p>
			) : (
				<span />
			)}
			{hasRight ? (
				<div className="ml-auto inline-flex shrink-0 items-center gap-1.5">{right}</div>
			) : null}
		</div>
	);
}

export function FieldNotes({
	notes,
	id,
	className,
}: {
	notes?: string | null;
	id?: string;
	className?: string;
}): React.ReactElement | null {
	const cleanNotes = typeof notes === 'string' ? notes.trim() : '';
	if (!cleanNotes) {
		return null;
	}

	return (
		<p
			id={id}
			data-rw-field-slot="notes"
			className={cn('text-[11px] text-muted-foreground/85 leading-relaxed', className)}
		>
			{cleanNotes}
		</p>
	);
}

export function formatMediaBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return '0 B';
	}
	const units = ['B', 'KB', 'MB', 'GB'];
	const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
	const value = bytes / Math.pow(1024, idx);
	return `${value >= 10 || idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
}

export function assignInputFiles(input: HTMLInputElement | null, files: File[]): void {
	if (!input || typeof DataTransfer === 'undefined') {
		return;
	}
	try {
		const dt = new DataTransfer();
		files.forEach((f) => dt.items.add(f));
		input.files = dt.files;
	} catch {
		// Ignore environments where DataTransfer assignment is restricted
	}
}

export interface ManagedMediaItem extends InputfieldMediaItem {
	deleted?: boolean;
}

export function MediaItemFilename({ item, isDeleted }: { item: ManagedMediaItem; isDeleted: boolean }) {
	const safeUrl = sanitizeHref(item.url);
	const cls = cn(
		'block text-xs font-semibold text-foreground truncate max-w-[320px]',
		safeUrl && 'hover:text-primary hover:underline',
		isDeleted && 'line-through text-muted-foreground'
	);
	return safeUrl ? (
		<a href={safeUrl} target="_blank" rel="noopener noreferrer" className={cls}>
			{item.basename || item.name}
		</a>
	) : (
		<span className={cls}>{item.basename || item.name}</span>
	);
}
