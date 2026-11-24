import { resolveFieldState } from '../shared';
import type { SchemaFieldDefinition, SchemaFormPayload } from '../types';

export function isMediaSchemaField(field: SchemaFieldDefinition): boolean {
	if (field.isImage || field.isFile) {
		return true;
	}
	const rawType = String(field.type || field.inputfieldClass || '').toLowerCase();
	return (
		rawType === 'file' ||
		rawType === 'files' ||
		rawType === 'image' ||
		rawType === 'images' ||
		rawType === 'media' ||
		rawType === 'react_file' ||
		rawType === 'react_image' ||
		rawType === 'inputfieldfile' ||
		rawType === 'inputfieldimage' ||
		rawType === 'inputfieldreactfile' ||
		rawType === 'inputfieldreactimage'
	);
}

export function isMediaValueEmpty(val: unknown): boolean {
	if (val === undefined || val === null || val === '') {
		return true;
	}
	return Array.isArray(val) && val.length === 0;
}

export function valuesShallowEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) {
		return true;
	}
	if (typeof a !== typeof b || a === null || b === null) {
		return false;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
			return false;
		}
		return a.every((item, idx) => valuesShallowEqual(item, b[idx]));
	}
	if (typeof a === 'object') {
		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		const aKeys = Object.keys(aObj);
		const bKeys = Object.keys(bObj);
		if (aKeys.length !== bKeys.length) {
			return false;
		}
		return aKeys.every((k) => Object.prototype.hasOwnProperty.call(bObj, k) && valuesShallowEqual(aObj[k], bObj[k]));
	}
	return false;
}

export function extractFieldsInitialValues(
	fields: SchemaFieldDefinition[],
	target: Record<string, unknown>
): void {
	for (const f of fields) {
		const isMedia = isMediaSchemaField(f);
		if (f.name && (target[f.name] === undefined || (isMedia && isMediaValueEmpty(target[f.name])))) {
			const rawType = String(f.type || f.inputfieldClass || '').toLowerCase();
			const isMultiValue =
				Boolean(f.multiple) ||
				rawType === 'checkboxes' ||
				rawType === 'asmselect' ||
				rawType === 'multiselect' ||
				rawType === 'tags' ||
				rawType === 'texttags' ||
				rawType === 'text_tags' ||
				rawType === 'text-tags' ||
				rawType === 'repeater';
			if (isMedia) {
				if (Array.isArray(f.value) && f.value.length > 0) {
					target[f.name] = f.value;
				} else if (typeof f.value === 'string' && f.value.trim() !== '') {
					target[f.name] = f.value;
				} else if (Array.isArray(f.files) && f.files.length > 0) {
					target[f.name] = f.files.map((item) => item.name).filter((name) => Boolean(name));
				} else if (f.value !== undefined) {
					target[f.name] = f.value;
				}
			} else if (isMultiValue && f.values !== undefined) {
				target[f.name] = f.values;
			} else if (f.value !== undefined) {
				target[f.name] = f.value;
			} else if (f.values !== undefined) {
				target[f.name] = Array.isArray(f.values) ? (f.values[0] ?? '') : f.values;
			} else if (f.defaultValue !== undefined) {
				target[f.name] = f.defaultValue;
			} else if (f.checked !== undefined) {
				target[f.name] = f.checked ? (f.checkedValue || '1') : '';
			}
		}
		const rawLanguages = f.i18n?.languages ?? f.languages;
		if (!isMedia && f.name && (f.useLanguages || f.i18n?.enabled) && Array.isArray(rawLanguages)) {
			for (const lang of rawLanguages) {
				const langKey = lang.inputName || (lang.isDefault ? f.name : `${f.name}__${lang.id}`);
				if (target[langKey] === undefined && lang.value !== undefined) {
					target[langKey] = lang.value;
				}
				if (lang.isDefault && target[f.name] === undefined && lang.value !== undefined) {
					target[f.name] = lang.value;
				}
			}
		}
		if (Array.isArray(f.fields)) {
			extractFieldsInitialValues(f.fields, target);
		} else if (f.fields && typeof f.fields === 'object') {
			extractFieldsInitialValues(Object.values(f.fields), target);
		}
		if (Array.isArray(f.children)) {
			extractFieldsInitialValues(f.children, target);
		}
		if (Array.isArray(f.tabs)) {
			for (const t of f.tabs) {
				extractFieldsInitialValues(t.fields || [], target);
			}
		}
	}
}

export function extractSchemaInitialValues(
	schema: SchemaFormPayload,
	extraValues?: Record<string, unknown>
): Record<string, unknown> {
	const seeded: Record<string, unknown> = {
		...(schema.defaultValues || {}),
		...(schema.values || {}),
		...(extraValues || {}),
	};
	for (const h of schema.hiddenInputs || []) {
		if (h.name && seeded[h.name] === undefined) {
			seeded[h.name] = h.value;
		}
	}
	extractFieldsInitialValues(schema.fields || [], seeded);
	extractFieldsInitialValues(schema.belowTabsFields || [], seeded);
	for (const tab of schema.tabs || []) {
		extractFieldsInitialValues(tab.fields || [], seeded);
	}
	return seeded;
}

export function collectFieldsIntoMap(
	fields: SchemaFieldDefinition[] | undefined,
	map: Map<string, SchemaFieldDefinition>
): void {
	if (!Array.isArray(fields)) {
		return;
	}
	for (const f of fields) {
		if (f.name && !map.has(f.name)) {
			map.set(f.name, f);
		}
		if (Array.isArray(f.fields)) {
			collectFieldsIntoMap(f.fields, map);
		} else if (f.fields && typeof f.fields === 'object') {
			collectFieldsIntoMap(
				Object.entries(f.fields).map(([name, def]) => ({ ...def, name: def.name || name })),
				map
			);
		}
		if (Array.isArray(f.children)) {
			collectFieldsIntoMap(f.children, map);
		}
		if (Array.isArray(f.tabs)) {
			for (const t of f.tabs) {
				collectFieldsIntoMap(t.fields, map);
			}
		}
	}
}

export function hasVisibleNonInlineFields(
	fields: SchemaFieldDefinition[] | undefined,
	values: Record<string, unknown>,
	errors: Record<string, string>,
	scopePrefix?: string
): boolean {
	if (!Array.isArray(fields) || fields.length === 0) {
		return false;
	}
	for (const f of fields) {
		if (!resolveFieldState(f, values, scopePrefix).visible) {
			continue;
		}
		if (f.name && errors[f.name]) {
			return true;
		}
		if (Array.isArray(f.tabs) && f.tabs.length > 0) {
			if (
				f.tabs.some(
					(pane) =>
						resolveFieldState(pane, values, scopePrefix).visible &&
						hasVisibleNonInlineFields(pane.fields, values, errors, scopePrefix)
				)
			) {
				return true;
			}
			continue;
		}
		const nested = Array.isArray(f.fields)
			? f.fields
			: f.fields && typeof f.fields === 'object'
				? Object.entries(f.fields).map(([name, def]) => ({ ...def, name: def.name || name }))
				: Array.isArray(f.children)
					? f.children
					: null;
		if (nested && nested.length > 0) {
			if (hasVisibleNonInlineFields(nested, values, errors, scopePrefix)) {
				return true;
			}
			continue;
		}
		if (!f.inlineHidden) {
			return true;
		}
	}
	return false;
}
