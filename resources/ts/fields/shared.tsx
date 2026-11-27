import React from 'react';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../lib/utils';
import type {
	ConditionFieldOption,
	ConditionFieldSpec,
	ConditionFieldType,
	DynamicBlockOptionsSource,
	InputfieldLanguageItem,
	InputfieldMediaItem,
	InputfieldOptionItem,
	LinkFieldConfig,
	LinkFieldValue,
	SchemaFieldConditions,
	SchemaFieldDefinition,
	SchemaFieldOption,
	SchemaFieldValidationRules,
} from './types';
import type { SchemaFormContextValue } from './schema/SchemaFormContext';
import {
	evaluateCondition,
	evaluateShowIfCondition,
	isLinkFieldValueEmpty,
	isLinkValueObject,
	lookupScopedFieldValue,
	navigateTablistByKey,
	normalizeConditionExpressionToString,
	resolveScopedFieldValue,
	scrollTabIntoView,
} from './schemaRuntimeHelpers';

export {
	ResponsiveTabBar,
	type ResponsiveTabBarProps,
	type ResponsiveTabItem,
} from '../ui';

export {
	evaluateCondition,
	evaluateShowIfCondition,
	isLinkFieldValueEmpty,
	isLinkValueObject,
	lookupScopedFieldValue,
	navigateTablistByKey,
	normalizeConditionExpressionToString,
	resolveScopedFieldValue,
	scrollTabIntoView,
};

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
			icon: opt.icon,
			description: opt.description,
		}));
	}
	return Object.entries(options).map(([value, label]) => ({
		value,
		label: String(label),
	}));
}

const GRID_SPAN_CLASSES: Record<number, string> = {
	1: 'min-w-0 col-span-12 @2xl/rw-grid:col-span-1',
	2: 'min-w-0 col-span-12 @2xl/rw-grid:col-span-2',
	3: 'min-w-0 col-span-12 @2xl/rw-grid:col-span-3',
	4: 'min-w-0 col-span-12 @xl/rw-grid:col-span-4',
	5: 'min-w-0 col-span-12 @lg/rw-grid:col-span-5',
	6: 'min-w-0 col-span-12 @lg/rw-grid:col-span-6',
	7: 'min-w-0 col-span-12 @lg/rw-grid:col-span-7',
	8: 'min-w-0 col-span-12 @xl/rw-grid:col-span-8',
	9: 'min-w-0 col-span-12 @2xl/rw-grid:col-span-9',
	10: 'min-w-0 col-span-12 @2xl/rw-grid:col-span-10',
	11: 'min-w-0 col-span-12 @2xl/rw-grid:col-span-11',
	12: 'min-w-0 col-span-12',
};

export function resolveGridSpanClass(width?: number, colSpan?: number): string {
	if (typeof colSpan === 'number' && Number.isFinite(colSpan) && colSpan >= 1 && colSpan <= 12) {
		return GRID_SPAN_CLASSES[Math.round(colSpan)] || 'min-w-0 col-span-12';
	}
	const w = width && width > 0 && width <= 100 ? width : 100;
	const span = Math.max(1, Math.min(12, Math.round((w / 100) * 12)));
	return GRID_SPAN_CLASSES[span] || 'min-w-0 col-span-12';
}

export function sanitizePhoneInput(raw: string, stripDanglingPlus = false): string {
	const stripped = raw.replace(/^tel:/i, '').trim();
	if (stripped === '') {
		return '';
	}
	const hasLeadingPlus = stripped.startsWith('+');
	const digitsOnly = stripped.replace(/[^0-9]+/g, '');
	if (digitsOnly === '') {
		return !stripDanglingPlus && hasLeadingPlus ? '+' : '';
	}
	return (hasLeadingPlus ? '+' : '') + digitsOnly;
}

export function createEmptyLinkValue(defaultType = 'url'): LinkFieldValue {
	return {
		type: defaultType === 'anchor' ? 'url' : defaultType,
		pageId: 0,
		resourceType: '',
		resourceId: '',
		url: '',
		file: '',
		query: '',
		anchor: '',
		label: '',
		ariaLabel: '',
		target: '_self',
		rel: '',
	};
}

export function normalizeLinkFieldValue(raw: unknown, defaultType = 'url'): LinkFieldValue {
	const safeDefault = defaultType === 'anchor' ? 'url' : defaultType;
	const empty = createEmptyLinkValue(safeDefault);
	if (raw === null || raw === undefined) {
		return empty;
	}
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '') {
			return empty;
		}
		if (trimmed.startsWith('{')) {
			try {
				const decoded = JSON.parse(trimmed);
				if (isLinkValueObject(decoded)) {
					return normalizeLinkFieldValue(decoded, safeDefault);
				}
			} catch {
				// Fall through to plain string parsing
			}
		}
		if (/^mailto:/i.test(trimmed)) {
			return { ...empty, type: 'email', url: trimmed.slice(7).trim() };
		}
		if (/^tel:/i.test(trimmed)) {
			return { ...empty, type: 'tel', url: sanitizePhoneInput(trimmed.slice(4), true) };
		}
		return { ...empty, type: 'url', url: trimmed };
	}
	if (typeof raw !== 'object' || Array.isArray(raw)) {
		return empty;
	}
	const rec = raw as Record<string, unknown>;
	let rawType =
		typeof rec.type === 'string' && rec.type.trim() !== ''
			? rec.type.trim().toLowerCase()
			: safeDefault;
	let urlVal =
		rec.url !== undefined && rec.url !== null
			? String(rec.url).trim()
			: '';
	let anchorVal =
		rec.anchor !== undefined && rec.anchor !== null
			? String(rec.anchor).trim().replace(/^#+/, '')
			: '';

	if (rawType === 'anchor') {
		rawType = 'url';
		if (urlVal === '' && anchorVal !== '') {
			urlVal = `#${anchorVal}`;
			anchorVal = '';
		}
	} else if (rawType === 'tel') {
		urlVal = sanitizePhoneInput(urlVal, true);
	} else if (rawType === 'email') {
		urlVal = urlVal.replace(/^mailto:/i, '').trim();
	}

	const rawTarget = typeof rec.target === 'string' ? rec.target.trim() : '_self';
	const rawAriaLabel = rec.ariaLabel;
	const parseLangTextMap = (rawMap: unknown, defVal: string): Record<string, string> | undefined => {
		const clean: Record<string, string> = {};
		let hasNonDefault = false;
		if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
			for (const [k, v] of Object.entries(rawMap as Record<string, unknown>)) {
				if (typeof v === 'string' && v.trim() !== '' && /^[a-zA-Z0-9_-]{1,32}$/.test(k)) {
					clean[k] = v;
					if (k !== 'default') {
						hasNonDefault = true;
					}
				}
			}
		}
		if (defVal.trim() !== '') {
			clean.default = defVal;
		}
		return hasNonDefault ? clean : undefined;
	};
	let labelVal = rec.label !== undefined && rec.label !== null ? String(rec.label) : '';
	const labelsMap = parseLangTextMap(rec.labels, labelVal);
	if (labelVal === '' && labelsMap?.default) {
		labelVal = labelsMap.default;
	}
	let ariaLabelVal =
		rawAriaLabel !== undefined && rawAriaLabel !== null ? String(rawAriaLabel) : '';
	const ariaLabelsMap = parseLangTextMap(rec.ariaLabels, ariaLabelVal);
	if (ariaLabelVal === '' && ariaLabelsMap?.default) {
		ariaLabelVal = ariaLabelsMap.default;
	}
	const out: LinkFieldValue = {
		type: rawType,
		pageId: Number.isFinite(Number(rec.pageId))
			? Math.max(0, Math.trunc(Number(rec.pageId)))
			: 0,
		resourceType:
			typeof rec.resourceType === 'string'
				? rec.resourceType.trim()
				: '',
		resourceId:
			rec.resourceId !== undefined && rec.resourceId !== null
				? String(rec.resourceId).trim()
				: '',
		url: urlVal,
		file: rec.file !== undefined && rec.file !== null ? String(rec.file).trim() : '',
		query:
			rec.query !== undefined && rec.query !== null
				? String(rec.query).trim().replace(/^\?+/, '')
				: '',
		anchor: anchorVal,
		label: labelVal,
		ariaLabel: ariaLabelVal,
		target: rawTarget === '_blank' ? '_blank' : '_self',
		rel: rec.rel !== undefined && rec.rel !== null ? String(rec.rel) : '',
	};
	if (labelsMap) {
		out.labels = labelsMap;
	}
	if (ariaLabelsMap) {
		out.ariaLabels = ariaLabelsMap;
	}
	if (typeof rec.alt === 'string' && rec.alt.trim() !== '') {
		out.alt = rec.alt.trim();
	}
	if (rec.descriptions && typeof rec.descriptions === 'object' && !Array.isArray(rec.descriptions)) {
		const descs: Record<string, string> = {};
		for (const [k, v] of Object.entries(rec.descriptions as Record<string, unknown>)) {
			if (typeof v === 'string' && v.trim() !== '') {
				descs[k] = v;
			}
		}
		if (Object.keys(descs).length > 0) {
			out.descriptions = descs;
			if (!out.alt && descs.default) {
				out.alt = descs.default.trim();
			}
		}
	}
	if (typeof rec.focus === 'string' && rec.focus.trim() !== '') {
		out.focus = rec.focus.trim();
	} else if (rec.focus && typeof rec.focus === 'object' && !Array.isArray(rec.focus)) {
		const fObj = rec.focus as Record<string, unknown>;
		const top = Number(fObj.top);
		const left = Number(fObj.left);
		const zoom = Number(fObj.zoom);
		if (Number.isFinite(top) && Number.isFinite(left)) {
			const safeTop = Math.max(0, Math.min(100, Math.round(top * 10) / 10));
			const safeLeft = Math.max(0, Math.min(100, Math.round(left * 10) / 10));
			const safeZoom = Number.isFinite(zoom) ? Math.max(0, Math.min(50, Math.round(zoom))) : 0;
			if (!(safeTop === 50 && safeLeft === 50 && safeZoom === 0)) {
				out.focus = `${safeTop} ${safeLeft} ${safeZoom}`;
			}
		}
	}
	if (typeof rec.tags === 'string' && rec.tags.trim() !== '') {
		out.tags = rec.tags.trim();
	}
	return out;
}

export function getLocalizedLinkText(
	defaultText: string,
	map: Record<string, string> | undefined,
	lang: InputfieldLanguageItem | undefined
): string {
	if (lang && !lang.isDefault) {
		const byId = map?.[String(lang.id)];
		if (typeof byId === 'string') {
			return byId;
		}
		const byName = map?.[lang.name];
		if (typeof byName === 'string') {
			return byName;
		}
		return '';
	}
	if (defaultText !== '') {
		return defaultText;
	}
	return typeof map?.default === 'string' ? map.default : '';
}

export function setLocalizedLinkText(
	defaultText: string,
	map: Record<string, string> | undefined,
	lang: InputfieldLanguageItem | undefined,
	nextValue: string,
	hasMultiLang: boolean
): { value: string; map?: Record<string, string> } {
	const nextMap: Record<string, string> = { ...(map ?? {}) };
	if (!hasMultiLang || !lang || lang.isDefault) {
		if (nextValue.trim() !== '') {
			nextMap.default = nextValue;
		} else {
			delete nextMap.default;
		}
		const hasNonDefault = Object.entries(nextMap).some(
			([k, v]) => k !== 'default' && typeof v === 'string' && v.trim() !== ''
		);
		return {
			value: nextValue,
			map: hasNonDefault ? nextMap : undefined,
		};
	}
	const langKey = String(lang.id);
	if (defaultText !== '' && !nextMap.default) {
		nextMap.default = defaultText;
	}
	if (nextValue !== '') {
		nextMap[langKey] = nextValue;
	} else {
		delete nextMap[langKey];
	}
	const hasAnyNonDefault = Object.entries(nextMap).some(
		([k, v]) => k !== 'default' && typeof v === 'string' && v !== ''
	);
	return {
		value: defaultText,
		map: hasAnyNonDefault ? nextMap : undefined,
	};
}

export const LINK_INLINE_SETTING_PREFIX = '__rw_link_opt__';

export interface LinkFeatureFlags {
	enableLabel: boolean;
	enableAriaLabel: boolean;
	enableTarget: boolean;
	enableRel: boolean;
	enableAnchor: boolean;
	enableQuery: boolean;
}

export function normalizeLinkConfigFlags(raw?: Partial<LinkFieldConfig> | null): LinkFeatureFlags {
	const rec = (raw ?? {}) as Record<string, unknown>;
	const flag = (key: string): boolean => {
		const v = rec[key];
		return v !== false && v !== 0 && v !== '0' && v !== '';
	};
	return {
		enableLabel: flag('enableLabel'),
		enableAriaLabel: flag('enableAriaLabel'),
		enableTarget: flag('enableTarget'),
		enableRel: flag('enableRel'),
		enableAnchor: flag('enableAnchor'),
		enableQuery: flag('enableQuery'),
	};
}

export function buildLinkInlineSettingFields(
	linkConfig: Partial<LinkFieldConfig> | undefined,
	rawVal: unknown,
	ownerDisabled: boolean,
	ownerFieldName?: string
): {
	fields: SchemaFieldDefinition[];
	values: Record<string, unknown>;
	normLink: LinkFieldValue;
	isTargetEmpty: boolean;
	flags: LinkFeatureFlags;
} {
	const flags = normalizeLinkConfigFlags(linkConfig);
	const normLink = normalizeLinkFieldValue(rawVal, linkConfig?.defaultType || 'page');
	const isTargetEmpty = isLinkFieldValueEmpty(normLink);
	const locked = Boolean(ownerDisabled || isTargetEmpty);
	const isHashOnlyUrl = normLink.type === 'url' && normLink.url.trim().startsWith('#');
	const canHaveAnchor =
		normLink.type !== 'tel' && normLink.type !== 'email' && !isHashOnlyUrl;
	const isBuiltInScalarOrMedia =
		normLink.type === 'page' ||
		normLink.type === 'anchor' ||
		normLink.type === 'tel' ||
		normLink.type === 'email' ||
		normLink.type === 'url' ||
		normLink.type === 'file' ||
		normLink.type === 'image' ||
		normLink.type === 'video';
	const isRelationType =
		!isBuiltInScalarOrMedia && Boolean(linkConfig?.relationTokens?.[normLink.type]);
	const canHaveQuery =
		normLink.type === 'page' ||
		(isRelationType && normLink.type !== 'tel' && normLink.type !== 'email') ||
		(normLink.type === 'url' && !isHashOnlyUrl);

	const fields: SchemaFieldDefinition[] = [];
	const values: Record<string, unknown> = {};
	const cleanOwner = ownerFieldName ? ownerFieldName.replace(/[^a-zA-Z0-9_-]/g, '_') : '';

	const pushField = (key: keyof LinkFieldValue, def: Omit<SchemaFieldDefinition, 'kind' | 'name' | 'disabled'>) => {
		const name = `${LINK_INLINE_SETTING_PREFIX}${key}`;
		fields.push({
			...def,
			kind: 'control',
			id: cleanOwner ? `${cleanOwner}__link_opt_${key}` : undefined,
			name,
			disabled: locked,
		});
		values[name] = normLink[key] ?? '';
	};

	if (flags.enableTarget) {
		pushField('target', {
			type: 'select',
			label: t('link.openTarget', 'Open Target'),
			width: 50,
			options: [
				{ value: '_self', label: t('link.targetSelf', 'Same tab (_self)') },
				{ value: '_blank', label: t('link.targetBlank', 'New tab (_blank)') },
			],
		});
	}
	if (flags.enableRel) {
		pushField('rel', {
			type: 'text',
			label: t('link.relAttribute', 'Rel Attribute'),
			placeholder: normLink.target === '_blank' ? 'noopener noreferrer' : 'nofollow sponsored',
			width: 50,
		});
	}
	if (flags.enableAnchor && canHaveAnchor) {
		pushField('anchor', {
			type: 'text',
			label: t('link.anchorFragment', 'Anchor Fragment (#)'),
			placeholder: 'section-id',
			width: 50,
		});
	}
	if (flags.enableQuery && canHaveQuery) {
		pushField('query', {
			type: 'text',
			label: t('link.queryParams', 'Query Parameters (?)'),
			placeholder: 'utm_source=hero&ref=cta',
			width: 50,
		});
	}

	return { fields, values, normLink, isTargetEmpty, flags };
}

export function applyLinkSettingPatches(
	currentLink: LinkFieldValue,
	patches: Record<string, unknown>,
	flags?: Partial<LinkFeatureFlags>
): LinkFieldValue {
	const next: LinkFieldValue = { ...currentLink };
	let hasTargetPatch = false;
	let hasRelPatch = false;
	for (const [key, rawVal] of Object.entries(patches)) {
		const cleanKey = key.startsWith(LINK_INLINE_SETTING_PREFIX)
			? key.slice(LINK_INLINE_SETTING_PREFIX.length)
			: key;
		const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal);
		if (cleanKey === 'target') {
			hasTargetPatch = true;
			next.target = strVal === '_blank' ? '_blank' : '_self';
		} else if (cleanKey === 'rel') {
			hasRelPatch = true;
			next.rel = strVal;
		} else if (cleanKey === 'anchor') {
			next.anchor = strVal.replace(/^#+/, '');
		} else if (cleanKey === 'query') {
			next.query = strVal.replace(/^\?+/, '');
		}
	}
	if (
		hasTargetPatch &&
		currentLink.target !== '_blank' &&
		next.target === '_blank' &&
		!hasRelPatch &&
		flags?.enableRel !== false &&
		!next.rel.trim()
	) {
		next.rel = 'noopener noreferrer';
	}
	return next;
}

export const INLINE_SETTING_NEUTRAL_VALUES = new Set([
	'',
	'0',
	'false',
	'no',
	'none',
	'auto',
	'normal',
	'inherit',
	'default',
	'_self',
]);

export function formatInlineSettingSummaryChip(
	bf: SchemaFieldDefinition,
	rawVal: unknown
): string | null {
	const rawType = String(bf.type || bf.inputfieldClass || 'text').toLowerCase();
	const opts = normalizeOptions(bf.options);
	const isBinaryToggle =
		rawType === 'toggle' &&
		(opts.length === 0 ||
			opts.every(
				(o) =>
					INLINE_SETTING_NEUTRAL_VALUES.has(String(o.value).trim().toLowerCase()) ||
					String(o.value).trim().toLowerCase() === '1' ||
					String(o.value).trim().toLowerCase() === 'true' ||
					String(o.value).trim().toLowerCase() === 'yes'
			));
	const isBool =
		rawType === 'checkbox' ||
		rawType === 'consent' ||
		rawType === 'switch' ||
		rawType === 'boolean' ||
		rawType === 'bool' ||
		isBinaryToggle;
	if (isBool) {
		const norm = typeof rawVal === 'string' ? rawVal.trim().toLowerCase() : rawVal;
		const truthy = norm === true || norm === 1 || norm === '1' || norm === 'true' || norm === 'yes';
		if (!truthy) {
			return null;
		}
		const shortLabel = (bf.label || bf.name || '').trim();
		return shortLabel
			? shortLabel.length > 14
				? `${shortLabel.slice(0, 13).trimEnd()}…`
				: shortLabel
			: null;
	}
	if (rawVal === null || rawVal === undefined || typeof rawVal === 'object') {
		return null;
	}
	const valStr = String(rawVal).trim();
	if (INLINE_SETTING_NEUTRAL_VALUES.has(valStr.toLowerCase())) {
		return null;
	}
	const lowerName = (bf.name || '').toLowerCase();
	if (lowerName === `${LINK_INLINE_SETTING_PREFIX}anchor`) {
		const frag = `#${valStr.replace(/^#+/, '')}`;
		return frag.length > 14 ? `${frag.slice(0, 13).trimEnd()}…` : frag;
	}
	if (lowerName === `${LINK_INLINE_SETTING_PREFIX}query`) {
		const qry = `?${valStr.replace(/^\?+/, '')}`;
		return qry.length > 14 ? `${qry.slice(0, 13).trimEnd()}…` : qry;
	}
	if (lowerName === `${LINK_INLINE_SETTING_PREFIX}target` && valStr === '_blank') {
		return t('link.newTabBadge', 'New tab');
	}
	if (
		lowerName === 'html_element' ||
		lowerName.endsWith('_html_element') ||
		lowerName.endsWith('_tag')
	) {
		return valStr.toUpperCase();
	}
	const lowerLabel = (bf.label || '').toLowerCase();
	const hasPxUnit =
		lowerLabel.includes('(px)') ||
		lowerName.endsWith('_px') ||
		lowerName === 'width' ||
		lowerName === 'height' ||
		lowerName.endsWith('_width') ||
		lowerName.endsWith('_height');
	if (hasPxUnit && /^-?\d+(\.\d+)?$/.test(valStr)) {
		const withUnit = `${valStr}px`;
		return withUnit.length > 14 ? `${withUnit.slice(0, 13).trimEnd()}…` : withUnit;
	}
	if (valStr.length <= 14) {
		return valStr;
	}
	const matched = opts.find((o) => o.value === valStr);
	const candidate = matched ? matched.label.trim() : valStr;
	return candidate.length > 14 ? `${candidate.slice(0, 13).trimEnd()}…` : candidate;
}

export function isCompactPopoverField(bf: SchemaFieldDefinition): boolean {
	const rawType = String(bf.type || bf.inputfieldClass || 'text').toLowerCase();
	if (
		rawType === 'select' ||
		rawType === 'integer' ||
		rawType === 'float' ||
		rawType === 'number' ||
		rawType === 'checkbox' ||
		rawType === 'toggle' ||
		rawType === 'switch' ||
		rawType === 'boolean' ||
		rawType === 'bool' ||
		rawType === 'consent' ||
		rawType === 'color' ||
		rawType === 'date' ||
		rawType === 'time' ||
		rawType === 'datetime'
	) {
		return true;
	}
	if (rawType === 'radios') {
		return normalizeOptions(bf.options).length <= 3;
	}
	return rawType === 'text' && typeof bf.width === 'number' && bf.width <= 50;
}

export function getNeutralSettingValue(bf: SchemaFieldDefinition): unknown {
	const rawType = String(bf.type || bf.inputfieldClass || 'text').toLowerCase();
	if (bf.resetValue !== undefined && bf.resetValue !== null) {
		if (
			rawType === 'checkbox' ||
			rawType === 'consent' ||
			rawType === 'switch' ||
			rawType === 'boolean' ||
			rawType === 'bool'
		) {
			const checkedVal = bf.checkedValue || '1';
			return bf.resetValue === true || bf.resetValue === 1 || bf.resetValue === '1' || bf.resetValue === 'true'
				? checkedVal
				: '';
		}
		if (
			Boolean(bf.multiple) ||
			rawType === 'checkboxes' ||
			rawType === 'asmselect' ||
			rawType === 'multiselect' ||
			rawType === 'repeater'
		) {
			return Array.isArray(bf.resetValue)
				? bf.resetValue.map((item) => String(item ?? ''))
				: bf.resetValue === ''
					? []
					: [String(bf.resetValue)];
		}
		if (rawType === 'toggle') {
			if (typeof bf.resetValue === 'boolean') {
				return bf.resetValue ? '1' : '0';
			}
			return String(bf.resetValue);
		}
		return typeof bf.resetValue === 'boolean'
			? bf.resetValue
				? '1'
				: '0'
			: bf.resetValue;
	}
	if (
		rawType === 'checkbox' ||
		rawType === 'consent' ||
		rawType === 'switch' ||
		rawType === 'boolean' ||
		rawType === 'bool'
	) {
		return '';
	}
	if (
		Boolean(bf.multiple) ||
		rawType === 'checkboxes' ||
		rawType === 'asmselect' ||
		rawType === 'multiselect' ||
		rawType === 'repeater'
	) {
		return [];
	}
	if (rawType === 'toggle' || rawType === 'select' || rawType === 'radios') {
		const opts = normalizeOptions(bf.options);
		const neutralMatch = opts.find((o) =>
			INLINE_SETTING_NEUTRAL_VALUES.has(String(o.value).trim().toLowerCase())
		);
		if (neutralMatch) {
			return neutralMatch.value;
		}
		const firstOpt = opts[0];
		if (firstOpt) {
			return firstOpt.value;
		}
		return rawType === 'toggle' ? '0' : '';
	}
	return '';
}

export function inlineSettingValuesEqual(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
			return false;
		}
		return a.every((item, idx) => String(item ?? '') === String(b[idx] ?? ''));
	}
	return String(a ?? '') === String(b ?? '');
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
			const escapedName = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const scopedBlockRe = new RegExp(`^[a-z]{2,12}block_${escapedName}_`);
			for (const errKey of errorKeys) {
				if (errKey !== f.name && (errKey.startsWith(repeaterPrefix) || scopedBlockRe.test(errKey))) {
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
			className={cn('text-[11px] text-muted-foreground leading-relaxed', className)}
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
		'block text-xs font-semibold text-foreground truncate w-full max-w-full',
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

function mapRawTypeToConditionFieldType(rawType: string): ConditionFieldType {
	const t = rawType.trim().toLowerCase();
	if (
		t === 'number' ||
		t === 'integer' ||
		t === 'float' ||
		t === 'decimal' ||
		t === 'range' ||
		t === 'range_slider' ||
		t === 'unit_number' ||
		t === 'rating' ||
		t === 'calculation' ||
		t === 'opinion_scale'
	) {
		return 'number';
	}
	if (t === 'date' || t === 'datetime') {
		return 'date';
	}
	if (t === 'boolean' || t === 'toggle' || t === 'checkbox' || t === 'consent') {
		return 'boolean';
	}
	if (
		t === 'select' ||
		t === 'combobox' ||
		t === 'segmented' ||
		t === 'radios' ||
		t === 'checkboxes' ||
		t === 'multiselect' ||
		t === 'cards'
	) {
		return 'select';
	}
	if (t === 'currency') {
		return 'currency';
	}
	if (t === 'country') {
		return 'country';
	}
	return 'text';
}

function parseBlockScalar(raw: unknown): string {
	if (typeof raw === 'string') {
		return raw.trim();
	}
	if (typeof raw === 'number' || typeof raw === 'boolean') {
		return String(raw);
	}
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		const rec = raw as Record<string, unknown>;
		if (typeof rec.default === 'string' && rec.default.trim() !== '') {
			return rec.default.trim();
		}
		for (const v of Object.values(rec)) {
			if (typeof v === 'string' && v.trim() !== '') {
				return v.trim();
			}
		}
	}
	return '';
}

function parseBlockOptions(raw: unknown): ConditionFieldOption[] | undefined {
	if (typeof raw === 'string' && raw.trim() !== '') {
		const items: ConditionFieldOption[] = [];
		for (const line of raw.split(/\r?\n/)) {
			const clean = line.trim();
			if (!clean) {
				continue;
			}
			const sepIdx = clean.indexOf('=');
			if (sepIdx > 0) {
				const val = clean.slice(0, sepIdx).trim();
				const lbl = clean.slice(sepIdx + 1).trim() || val;
				if (val !== '') {
					items.push({ value: val, label: lbl });
				}
			} else {
				items.push({ value: clean, label: clean });
			}
		}
		return items.length > 0 ? items : undefined;
	}
	if (Array.isArray(raw)) {
		const items: ConditionFieldOption[] = [];
		for (const entry of raw) {
			if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
				const rec = entry as Record<string, unknown>;
				const val = parseBlockScalar(rec.value ?? rec.key);
				const lbl = parseBlockScalar(rec.label) || val;
				if (val !== '') {
					items.push({ value: val, label: lbl });
				}
			}
		}
		return items.length > 0 ? items : undefined;
	}
	return undefined;
}

/**
 * Resolve field metadata dynamically from registered blocks in the enclosing `SchemaForm`.
 */
export function resolveDynamicBlockFields(
	source: DynamicBlockOptionsSource | undefined,
	schemaCtx: SchemaFormContextValue | null | undefined,
	formValues?: Record<string, unknown>,
	scopePrefix?: string,
): ConditionFieldSpec[] {
	if (!source?.blockField || !schemaCtx?.getRegisteredBlocks) {
		return [];
	}

	const blocks = schemaCtx.getRegisteredBlocks(source.blockField);
	if (!blocks || blocks.length === 0) {
		return [];
	}

	const liveValues = schemaCtx.values ?? formValues ?? {};
	const cleanSelfPrefix = scopePrefix ? scopePrefix.replace(/_+$/, '') : '';
	const seen = new Set<string>();
	const result: ConditionFieldSpec[] = [];

	for (const blk of blocks) {
		if (Array.isArray(source.blockTypes) && source.blockTypes.length > 0 && !source.blockTypes.includes(blk.type)) {
			continue;
		}
		const cleanBlkPrefix = blk.prefix ? blk.prefix.replace(/_+$/, '') : '';
		if (source.excludeSelf && cleanSelfPrefix && cleanBlkPrefix === cleanSelfPrefix) {
			continue;
		}

		const readAttr = (attrKey: string): unknown => {
			if (cleanBlkPrefix) {
				const scopedKey = `${cleanBlkPrefix}_${attrKey}`;
				if (scopedKey in liveValues && liveValues[scopedKey] !== undefined) {
					return liveValues[scopedKey];
				}
			}
			return blk.values?.[attrKey];
		};

		const rawValueKey = parseBlockScalar(readAttr(source.valueKey));
		if (!rawValueKey || seen.has(rawValueKey)) {
			continue;
		}

		const rawTypeStr = source.typeKey ? parseBlockScalar(readAttr(source.typeKey)) : 'text';
		if (
			Array.isArray(source.excludeTypes) &&
			source.excludeTypes.length > 0 &&
			rawTypeStr !== '' &&
			source.excludeTypes.includes(rawTypeStr.toLowerCase())
		) {
			continue;
		}

		seen.add(rawValueKey);
		const rawLabel = source.labelKey ? parseBlockScalar(readAttr(source.labelKey)) : '';
		const options = parseBlockOptions(readAttr(source.optionsKey ?? 'options'));
		const normalizedTypeKey = rawTypeStr.trim().toLowerCase();
		let mappedType =
			(normalizedTypeKey !== '' && source.typeMap?.[normalizedTypeKey]) ||
			mapRawTypeToConditionFieldType(rawTypeStr);
		if (
			mappedType === 'select' &&
			source.fallbackToTextWhenNoOptions &&
			(!options || options.length === 0)
		) {
			mappedType = 'text';
		}

		let allowCustomValue = false;
		if (source.allowCustomKey) {
			const rawCustom = readAttr(source.allowCustomKey);
			allowCustomValue =
				rawCustom === true ||
				rawCustom === 1 ||
				rawCustom === '1' ||
				(typeof rawCustom === 'string' && rawCustom.trim().toLowerCase() === 'true');
		}

		result.push({
			key: rawValueKey,
			label: rawLabel !== '' && rawLabel !== rawValueKey ? `${rawLabel} (${rawValueKey})` : rawValueKey,
			type: mappedType,
			...(options ? { options } : {}),
			...(allowCustomValue ? { allowCustomValue: true } : {}),
		});
	}

	return result;
}
