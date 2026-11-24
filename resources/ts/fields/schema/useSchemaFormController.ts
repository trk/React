import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { markHostFormDirty, useKeyboardShortcuts } from '../../hooks';
import { t } from '../../lib/i18n';
import { countNestedErrors, resolveFieldState } from '../shared';
import type {
	SchemaFieldAdornment,
	SchemaFieldDefinition,
	SchemaFormPayload,
	SchemaFormProps,
} from '../types';
import {
	validateFieldWithValibot,
	validateSchemaTree,
	type RegisteredBlockFieldSpec,
	type RegisteredFragmentSpec,
	type SchemaValidationResult,
} from '../validation';
import { prefetchSchemaControls } from './fieldControlRegistry';
import {
	useSchemaFormContext,
	type BridgedSchemaFormElement,
	type SchemaFormContextValue,
} from './SchemaFormContext';
import { resolveTabPaneSlot } from './SchemaLayoutNodes';
import {
	collectFieldsIntoMap,
	extractSchemaInitialValues,
	hasVisibleNonInlineFields,
	valuesShallowEqual,
} from './schemaValueUtils';

export function useSchemaFormController(props: SchemaFormProps) {
	const instanceId = useId();
	const containerRef = useRef<HTMLElement | null>(null);
	const parentCtx = useSchemaFormContext(containerRef);
	const parentCtxRef = useRef(parentCtx);
	parentCtxRef.current = parentCtx;

	const schema: SchemaFormPayload = useMemo(() => {
		if (props.schema) {
			return props.schema;
		}
		const normalizedFields: SchemaFieldDefinition[] = Array.isArray(props.fields)
			? props.fields
			: props.fields && typeof props.fields === 'object'
				? Object.entries(props.fields).map(([name, def]) => ({
						...def,
						name: def.name || name,
					}))
				: [];

		return {
			id: props.id || 'rw-schema-form',
			name: props.name || props.id || 'rw-schema-form',
			action: props.action || './',
			method: props.method || 'post',
			encType: props.encType || '',
			isFragment: props.isFragment ?? false,
			dirtyGuard: props.dirtyGuard ?? !Boolean(props.isFragment),
			surface: props.surface ?? null,
			tabsLayout: props.tabsLayout ?? null,
			presenceKey: props.presenceKey ?? null,
			presenceEndpoint: props.presenceEndpoint ?? null,
			csrf: props.csrf ?? null,
			hiddenInputs: props.hiddenInputs ?? [],
			tabs: props.tabs ?? [],
			fields: normalizedFields,
			belowTabsFields: props.belowTabsFields ?? [],
			submits: props.submits ?? [],
			values: props.values ?? {},
			errors: props.errors ?? {},
		};
	}, [props]);

	const scopePrefix =
		props.scopePrefix || (schema as SchemaFormPayload & { scopePrefix?: string }).scopePrefix || undefined;
	const isAttachedFragment = Boolean(schema.isFragment && parentCtx);

	const initialValues = useMemo(
		() => extractSchemaInitialValues(schema, props.values),
		[schema, props.values]
	);

	const [localValues, setLocalValues] = useState<Record<string, unknown>>(initialValues);
	const localValuesRef = useRef<Record<string, unknown>>(localValues);
	localValuesRef.current = localValues;
	const prevSeededValuesRef = useRef<Record<string, unknown>>(initialValues);
	const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
	const clientErrorsRef = useRef<Record<string, string>>(clientErrors);
	clientErrorsRef.current = clientErrors;
	const onChangeRef = useRef(props.onChange);
	onChangeRef.current = props.onChange;
	const onFieldChangeRef = useRef(props.onFieldChange);
	onFieldChangeRef.current = props.onFieldChange;
	const [isDirtyLocal, setIsDirtyLocal] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isSubmittingRef = useRef(false);
	const setSubmittingState = useCallback((next: boolean) => {
		isSubmittingRef.current = next;
		setIsSubmitting(next);
	}, []);

	const registeredFragmentsRef = useRef<Map<string, RegisteredFragmentSpec>>(new Map());
	const registeredBlocksRef = useRef<Map<string, RegisteredBlockFieldSpec>>(new Map());

	const registerParentFragment = parentCtx?.registerFragment;

	// Sync incoming schema.values / props.values changes (including external Preset updates)
	useEffect(() => {
		prefetchSchemaControls(schema);
	}, [schema]);

	useEffect(() => {
		const nextSeeded = extractSchemaInitialValues(schema, props.values);
		const prevSeeded = prevSeededValuesRef.current;
		prevSeededValuesRef.current = nextSeeded;
		if (Object.keys(nextSeeded).length === 0) {
			return;
		}
		const activeParentBatch = parentCtxRef.current?.setValuesBatch;
		if (isAttachedFragment && activeParentBatch) {
			const changedKeys: Record<string, unknown> = {};
			let hasExternalDelta = false;
			for (const [k, v] of Object.entries(nextSeeded)) {
				if (!valuesShallowEqual(prevSeeded[k], v)) {
					changedKeys[k] = v;
					hasExternalDelta = true;
				}
			}
			if (hasExternalDelta) {
				activeParentBatch(changedKeys, true);
			} else {
				activeParentBatch(nextSeeded, false);
			}
		} else {
			setLocalValues((prev) => {
				let changed = false;
				const merged = { ...prev };
				for (const [k, v] of Object.entries(nextSeeded)) {
					if (merged[k] === undefined || !valuesShallowEqual(prevSeeded[k], v)) {
						if (!valuesShallowEqual(merged[k], v)) {
							merged[k] = v;
							changed = true;
						}
					}
				}
				if (changed) {
					localValuesRef.current = merged;
				}
				return changed ? merged : prev;
			});
		}
	}, [schema, props.values, isAttachedFragment]);

	const skipRequiredFieldNames = useMemo<string[]>(() => {
		if (!props.fieldAdornments) {
			return [];
		}
		const keys: string[] = [];
		for (const [key, adorn] of Object.entries(props.fieldAdornments)) {
			if (adorn?.boundOverlay) {
				keys.push(key);
			}
		}
		return keys;
	}, [props.fieldAdornments]);

	// Register this fragment with the parent SchemaForm when rendered inside a parent form (e.g., embedded block body)
	useEffect(() => {
		if (!isAttachedFragment || !registerParentFragment) {
			return;
		}
		return registerParentFragment({
			fragmentId: `${schema.id || 'frag'}_${instanceId}`,
			scopePrefix,
			schema,
			skipRequiredFields: skipRequiredFieldNames,
		});
	}, [isAttachedFragment, registerParentFragment, schema, scopePrefix, instanceId, skipRequiredFieldNames]);

	const values = useMemo(
		() => (isAttachedFragment && parentCtx ? { ...initialValues, ...parentCtx.values } : localValues),
		[isAttachedFragment, parentCtx, initialValues, localValues]
	);

	const conditionValues = useMemo<Record<string, unknown>>(() => {
		if (!props.fieldAdornments) {
			return values;
		}
		const cleanPrefix = scopePrefix ? scopePrefix.replace(/_+$/, '') : '';
		let patched: Record<string, unknown> | null = null;
		const isStaticValEmpty = (v: unknown): boolean => {
			if (v === undefined || v === null || v === '') {
				return true;
			}
			if (Array.isArray(v)) {
				return v.length === 0;
			}
			if (typeof v === 'object') {
				const vObj = v as Record<string, unknown>;
				if ('url' in vObj || 'href' in vObj || 'pageId' in vObj || 'entryId' in vObj || 'file' in vObj) {
					return (
						!String(vObj.url || '').trim() &&
						!String(vObj.href || '').trim() &&
						!Number(vObj.pageId || 0) &&
						!String(vObj.entryId || '').trim() &&
						!String(vObj.file || '').trim()
					);
				}
			}
			return false;
		};
		for (const [key, adorn] of Object.entries(props.fieldAdornments)) {
			if (!adorn || adorn.conditionValue === undefined) {
				continue;
			}
			const scopedKey = cleanPrefix && !key.startsWith(`${cleanPrefix}_`) ? `${cleanPrefix}_${key}` : key;
			const existingScoped = values[scopedKey];
			const existingShort = values[key];
			if (isStaticValEmpty(existingScoped) && isStaticValEmpty(existingShort)) {
				if (!patched) {
					patched = { ...values };
				}
				patched[key] = adorn.conditionValue;
				if (scopedKey !== key) {
					patched[scopedKey] = adorn.conditionValue;
				}
			}
		}
		return patched || values;
	}, [values, props.fieldAdornments, scopePrefix]);

	const errors = useMemo<Record<string, string>>(() => {
		if (isAttachedFragment && parentCtx) {
			return {
				...(schema.errors || {}),
				...parentCtx.errors,
			};
		}
		return {
			...(schema.errors || {}),
			...clientErrors,
		};
	}, [isAttachedFragment, parentCtx, schema.errors, clientErrors]);

	const topTabs = useMemo(() => schema.tabs || [], [schema.tabs]);
	const visibleTopTabs = useMemo(
		() =>
			topTabs.filter((tab) => {
				if (!resolveFieldState(tab, conditionValues, scopePrefix).visible) {
					return false;
				}
				const slot = resolveTabPaneSlot(props.tabSlots, tab);
				if (slot?.before || slot?.after) {
					return true;
				}
				return (
					(tab.fields || []).length === 0 ||
					hasVisibleNonInlineFields(tab.fields, conditionValues, errors, scopePrefix)
				);
			}),
		[topTabs, conditionValues, errors, scopePrefix, props.tabSlots]
	);
	const rootFields = useMemo(() => schema.fields || [], [schema.fields]);
	const belowTabsFields = useMemo(() => schema.belowTabsFields || [], [schema.belowTabsFields]);
	const fieldsByName = useMemo<ReadonlyMap<string, SchemaFieldDefinition>>(() => {
		const map = new Map<string, SchemaFieldDefinition>();
		if (parentCtx?.fieldsByName) {
			for (const [k, v] of parentCtx.fieldsByName.entries()) {
				map.set(k, v);
			}
		}
		collectFieldsIntoMap(rootFields, map);
		collectFieldsIntoMap(belowTabsFields, map);
		for (const tab of topTabs) {
			collectFieldsIntoMap(tab.fields, map);
		}
		return map;
	}, [parentCtx?.fieldsByName, rootFields, belowTabsFields, topTabs]);
	const submits = useMemo(() => schema.submits || [], [schema.submits]);

	const topTabStorageKey = useMemo(() => {
		if (schema.isFragment || typeof window === 'undefined') {
			return '';
		}
		return `rw_top_tab:${window.location.pathname}${window.location.search}:${schema.id || schema.name || 'form'}`;
	}, [schema.isFragment, schema.id, schema.name]);

	const [activeTopTabId, setActiveTopTabIdState] = useState<string>(() => {
		if (topTabStorageKey && typeof window !== 'undefined') {
			try {
				const saved = window.sessionStorage.getItem(topTabStorageKey);
				if (saved && topTabs.some((t) => t.id === saved)) {
					return saved;
				}
			} catch {
				// Ignore storage access errors
			}
		}
		return visibleTopTabs[0]?.id || topTabs[0]?.id || '';
	});

	const setActiveTopTabId = useCallback(
		(nextTabId: string) => {
			setActiveTopTabIdState(nextTabId);
			if (topTabStorageKey && typeof window !== 'undefined') {
				try {
					window.sessionStorage.setItem(topTabStorageKey, nextTabId);
				} catch {
					// Ignore storage access errors
				}
			}
		},
		[topTabStorageKey]
	);

	useEffect(() => {
		const firstTab = visibleTopTabs[0];
		if (firstTab && !visibleTopTabs.some((t) => t.id === activeTopTabId)) {
			setActiveTopTabId(firstTab.id);
		}
	}, [visibleTopTabs, activeTopTabId, setActiveTopTabId]);

	// Automatically switch to the first top-level tab with server-side validation errors only when server errors change
	const serverErrorSig = useMemo(() => JSON.stringify(schema.errors || {}), [schema.errors]);
	const lastServerErrorSigRef = useRef<string>('');
	useEffect(() => {
		if (serverErrorSig === lastServerErrorSigRef.current) {
			return;
		}
		lastServerErrorSigRef.current = serverErrorSig;
		const serverErrors = schema.errors || {};
		if (visibleTopTabs.length <= 1 || Object.keys(serverErrors).length === 0) {
			return;
		}
		const activeTab = visibleTopTabs.find((t) => t.id === activeTopTabId);
		const activeErrs = activeTab ? countNestedErrors(activeTab.fields || [], serverErrors) : 0;
		if (activeErrs > 0) {
			return;
		}
		const firstErrTab = visibleTopTabs.find(
			(t) => countNestedErrors(t.fields || [], serverErrors) > 0
		);
		if (firstErrTab && firstErrTab.id !== activeTopTabId) {
			setActiveTopTabId(firstErrTab.id);
		}
	}, [serverErrorSig, schema.errors, visibleTopTabs, activeTopTabId, setActiveTopTabId]);

	const steps = useMemo(() => {
		const map = new Map<number, { index: number; title: string; fields: SchemaFieldDefinition[] }>();
		for (const f of rootFields) {
			const idx = f.stepIndex && f.stepIndex > 0 ? f.stepIndex : 1;
			const existing = map.get(idx);
			if (existing) {
				existing.fields.push(f);
			} else {
				map.set(idx, {
					index: idx,
					title: f.stepTitle || `Step ${idx}`,
					fields: [f],
				});
			}
		}
		return Array.from(map.values()).sort((a, b) => a.index - b.index);
	}, [rootFields]);

	const isMultiStep = steps.length > 1;
	const [activeStepIndex, setActiveStepIndex] = useState<number>(() => steps[0]?.index || 1);

	const [headButtonsTarget, setHeadButtonsTarget] = useState<HTMLElement | null>(null);
	useEffect(() => {
		if (schema.isFragment || typeof document === 'undefined') {
			return;
		}
		const resolveTarget = (): boolean => {
			const target = document.querySelector<HTMLElement>('[data-rw-head-buttons]');
			if (target) {
				setHeadButtonsTarget((prev) => {
					if (prev !== target) {
						target.innerHTML = '';
					}
					return target;
				});
				return true;
			}
			return false;
		};
		if (resolveTarget()) {
			return;
		}
		if (typeof MutationObserver === 'undefined' || !document.body) {
			return;
		}
		const observer = new MutationObserver(() => {
			if (resolveTarget()) {
				observer.disconnect();
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [schema.isFragment]);

	// Dirty guard (`beforeunload`), live dirty event (`rw:schema-form-dirty`), and Cmd/Ctrl+S save shortcut
	const isDirty = isAttachedFragment && parentCtx ? parentCtx.isDirty : isDirtyLocal;
	const isSelfDispatchingDirtyRef = useRef(false);
	useEffect(() => {
		if (schema.isFragment || typeof window === 'undefined') {
			return;
		}
		isSelfDispatchingDirtyRef.current = true;
		try {
			window.dispatchEvent(
				new CustomEvent('rw:schema-form-dirty', {
					detail: {
						formId: schema.id,
						isDirty: Boolean(isDirty),
						dirtyGuard: Boolean(schema.dirtyGuard),
					},
				})
			);
		} finally {
			isSelfDispatchingDirtyRef.current = false;
		}
		return () => {
			isSelfDispatchingDirtyRef.current = true;
			try {
				window.dispatchEvent(
					new CustomEvent('rw:schema-form-dirty', {
						detail: { formId: schema.id, isDirty: false, dirtyGuard: false },
					})
				);
			} finally {
				isSelfDispatchingDirtyRef.current = false;
			}
		};
	}, [schema.isFragment, schema.id, schema.dirtyGuard, isDirty]);

	useEffect(() => {
		if (schema.isFragment || typeof window === 'undefined') {
			return;
		}
		const onExternalDirtyClear = (ev: Event) => {
			if (isSelfDispatchingDirtyRef.current) {
				return;
			}
			const detail = (
				ev as CustomEvent<{ formId?: string; isDirty?: boolean }>
			).detail;
			if (schema.id && detail?.formId === schema.id && detail?.isDirty === false) {
				setIsDirtyLocal(false);
			}
		};
		window.addEventListener('rw:schema-form-dirty', onExternalDirtyClear);
		return () => window.removeEventListener('rw:schema-form-dirty', onExternalDirtyClear);
	}, [schema.isFragment, schema.id]);

	const triggerFormSubmit = useCallback((submitBtn?: HTMLButtonElement | null): void => {
		const formEl = containerRef.current;
		if (!(formEl instanceof HTMLFormElement) || !formEl.isConnected) {
			return;
		}
		if (submitBtn && typeof formEl.requestSubmit === 'function') {
			formEl.requestSubmit(submitBtn);
		} else if (typeof formEl.requestSubmit === 'function') {
			formEl.requestSubmit();
		} else {
			formEl.submit();
		}
	}, []);

	const saveAndExitTarget = useMemo(() => {
		if (schema.isFragment || submits.length === 0) {
			return null;
		}
		for (const sub of submits) {
			if (sub.disabled) {
				continue;
			}
			if (Array.isArray(sub.actions)) {
				const exitAction = sub.actions.find(
					(act) =>
						act.type !== 'link' &&
						/exit|close/i.test(`${act.value} ${act.label}`) &&
						!/delete|discard/i.test(`${act.value} ${act.label}`)
				);
				if (exitAction) {
					return { submit: sub, actionValue: exitAction.value };
				}
			}
			if (
				/exit|close/i.test(`${sub.name} ${sub.label}`) &&
				!/delete|discard/i.test(`${sub.name} ${sub.label}`)
			) {
				return { submit: sub, actionValue: null as string | null };
			}
		}
		return null;
	}, [schema.isFragment, submits]);

	useKeyboardShortcuts([
		{
			id: 'forms.save',
			keys: 'mod+s',
			label: t('shortcuts.saveForm', 'Save form'),
			group: 'forms',
			when: !schema.isFragment && submits.length > 0,
			allowInInputs: true,
			handler: () => {
				const formEl = containerRef.current;
				if (!(formEl instanceof HTMLFormElement) || !formEl.isConnected) {
					return;
				}
				const primarySubmitBtn = formEl.querySelector<HTMLButtonElement>(
					'button[type="submit"]:not([disabled])'
				);
				triggerFormSubmit(primarySubmitBtn);
			},
		},
		{
			id: 'forms.saveAndExit',
			keys: 'mod+shift+s',
			label: t('shortcuts.saveAndExit', 'Save & exit form'),
			group: 'forms',
			when: saveAndExitTarget !== null,
			allowInInputs: true,
			handler: () => {
				const formEl = containerRef.current;
				if (!(formEl instanceof HTMLFormElement) || !formEl.isConnected || !saveAndExitTarget) {
					return;
				}
				if (saveAndExitTarget.actionValue !== null) {
					const targetDropdownId = `${saveAndExitTarget.submit.id}_dropdown_value`;
					const hiddenInput =
						Array.from(formEl.querySelectorAll<HTMLInputElement>('input[type="hidden"]')).find(
							(el) => el.id === targetDropdownId
						) ??
						formEl.querySelector<HTMLInputElement>('input[type="hidden"][name="_action_value"]');
					if (hiddenInput) {
						hiddenInput.value = saveAndExitTarget.actionValue;
					}
				}
				const targetBtn =
					Array.from(formEl.querySelectorAll<HTMLButtonElement>('button[type="submit"]:not([disabled])')).find(
						(btn) =>
							btn.id === saveAndExitTarget.submit.id ||
							btn.name === saveAndExitTarget.submit.name
					) ?? formEl.querySelector<HTMLButtonElement>('button[type="submit"]:not([disabled])');
				triggerFormSubmit(targetBtn);
			},
		},
	]);

	useEffect(() => {
		if (schema.isFragment || !schema.dirtyGuard || !isDirty || typeof window === 'undefined') {
			return;
		}
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (isSubmittingRef.current) {
				return;
			}
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	}, [schema.isFragment, schema.dirtyGuard, isDirty]);

	const focusFirstInvalidField = useCallback((firstErrorField: string | null) => {
		if (!firstErrorField || typeof document === 'undefined') {
			return;
		}
		window.setTimeout(() => {
			const rootEl = containerRef.current || document;
			const fieldWrap =
				rootEl.querySelector<HTMLElement>(`[data-field-name="${CSS.escape(firstErrorField)}"]`) ||
				rootEl.querySelector<HTMLElement>(`[name="${CSS.escape(firstErrorField)}"]`);
			if (fieldWrap) {
				fieldWrap.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
				const focusable =
					fieldWrap.matches('input, textarea, select')
						? fieldWrap
						: fieldWrap.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, button');
				focusable?.focus?.();
			}
		}, 40);
	}, []);

	const applyValidationResult = useCallback(
		(result: SchemaValidationResult): SchemaValidationResult => {
			setClientErrors(result.errors);
			if (!result.valid) {
				if (result.failedTabIds.length > 0 && visibleTopTabs.some((t) => result.failedTabIds.includes(t.id))) {
					const targetTab = visibleTopTabs.find((t) => result.failedTabIds.includes(t.id));
					if (targetTab) {
						setActiveTopTabId(targetTab.id);
					}
				}
				props.onValidationError?.(result.errors);
				focusFirstInvalidField(result.firstErrorField);
			}
			return result;
		},
		[visibleTopTabs, props.onValidationError, focusFirstInvalidField, setActiveTopTabId]
	);

	const validateAll = useCallback((): SchemaValidationResult => {
		if (isAttachedFragment && parentCtx) {
			return parentCtx.validateAll();
		}
		const result = validateSchemaTree(schema, localValues, {
			scopePrefix,
			skipRequiredFields: skipRequiredFieldNames,
			registeredFragments: registeredFragmentsRef.current.values(),
			registeredBlocks: registeredBlocksRef.current.values(),
		});
		return applyValidationResult(result);
	}, [isAttachedFragment, parentCtx, schema, localValues, scopePrefix, skipRequiredFieldNames, applyValidationResult]);

	const validateStep = useCallback(
		(stepIndex: number): SchemaValidationResult => {
			if (isAttachedFragment && parentCtx) {
				return parentCtx.validateStep(stepIndex);
			}
			const result = validateSchemaTree(schema, localValues, {
				stepIndex,
				scopePrefix,
			});
			return applyValidationResult(result);
		},
		[isAttachedFragment, parentCtx, schema, localValues, scopePrefix, applyValidationResult]
	);

	const setValuesBatch = useCallback(
		(patch: Record<string, unknown>, markDirty = false) => {
			const activeParent = parentCtxRef.current;
			if (isAttachedFragment && activeParent) {
				activeParent.setValuesBatch(patch, markDirty);
				return;
			}
			setLocalValues((prev) => {
				let changed = false;
				const next = { ...prev };
				for (const [k, v] of Object.entries(patch)) {
					if ((next[k] === undefined || markDirty) && !valuesShallowEqual(next[k], v)) {
						next[k] = v;
						changed = true;
					}
				}
				if (changed) {
					localValuesRef.current = next;
				}
				if (markDirty && changed) {
					setIsDirtyLocal(true);
				}
				return changed ? next : prev;
			});
		},
		[isAttachedFragment]
	);

	const setFieldError = useCallback(
		(name: string, message: string | null) => {
			const activeParent = parentCtxRef.current;
			if (isAttachedFragment && activeParent) {
				activeParent.setFieldError(name, message);
				return;
			}
			setClientErrors((prev) => {
				if (!message) {
					if (!(name in prev)) {
						return prev;
					}
					const copy = { ...prev };
					delete copy[name];
					return copy;
				}
				return { ...prev, [name]: message };
			});
		},
		[isAttachedFragment]
	);

	// Clear stale required client errors immediately when a field becomes dynamically bound
	useEffect(() => {
		if (skipRequiredFieldNames.length === 0) {
			return;
		}
		const cleanPrefix = scopePrefix ? scopePrefix.replace(/_+$/, '') : '';
		for (const key of skipRequiredFieldNames) {
			const scopedKey = cleanPrefix && !key.startsWith(`${cleanPrefix}_`) ? `${cleanPrefix}_${key}` : key;
			if (errors[scopedKey]) {
				setFieldError(scopedKey, null);
			}
			if (scopedKey !== key && errors[key]) {
				setFieldError(key, null);
			}
		}
	}, [skipRequiredFieldNames, scopePrefix, errors, setFieldError]);

	const updateFieldValue = useCallback(
		(name: string, nextVal: unknown, fieldDef?: SchemaFieldDefinition, fieldScopePrefix?: string): Record<string, unknown> | void => {
			if (!name) {
				return;
			}
			const activeParent = parentCtxRef.current;
			if (isAttachedFragment && activeParent) {
				const updatedParent = activeParent.updateFieldValue(
					name,
					nextVal,
					fieldDef,
					fieldScopePrefix || scopePrefix
				);
				const nextParentValues = updatedParent ?? { ...activeParent.values, [name]: nextVal };
				onFieldChangeRef.current?.(name, nextVal, nextParentValues);
				onChangeRef.current?.(nextParentValues);
				return nextParentValues;
			}

			const next = { ...localValuesRef.current, [name]: nextVal };
			localValuesRef.current = next;
			setLocalValues(next);
			setIsDirtyLocal(true);
			if (schema.isFragment) {
				markHostFormDirty(containerRef.current);
			}

			const currentErrors = clientErrorsRef.current;
			const ownerFieldName = fieldDef?.name || name;
			if (fieldDef && (props.validateOnChange || currentErrors[ownerFieldName] || currentErrors[name])) {
				const ownerVal = ownerFieldName in next ? next[ownerFieldName] : undefined;
				const err = validateFieldWithValibot(
					fieldDef,
					ownerVal,
					next,
					fieldScopePrefix || scopePrefix
				);
				setFieldError(ownerFieldName, err);
				if (name !== ownerFieldName && currentErrors[name]) {
					setFieldError(name, null);
				}
			} else if (currentErrors[name]) {
				setFieldError(name, null);
			}
			// Clear any repeater subfield errors for this field when edited
			const repeaterPrefix = `${name}[`;
			const hasSubErr = Object.keys(currentErrors).some((k) => k.startsWith(repeaterPrefix));
			if (hasSubErr) {
				setClientErrors((curr) => {
					const cleaned: Record<string, string> = {};
					for (const [k, v] of Object.entries(curr)) {
						if (!k.startsWith(repeaterPrefix)) {
							cleaned[k] = v;
						}
					}
					return cleaned;
				});
			}

			onFieldChangeRef.current?.(name, nextVal, next);
			onChangeRef.current?.(next);
			return next;
		},
		[isAttachedFragment, scopePrefix, schema.isFragment, props.validateOnChange, setFieldError]
	);

	const registerFragment = useCallback(
		(spec: RegisteredFragmentSpec) => {
			if (isAttachedFragment && parentCtx) {
				return parentCtx.registerFragment(spec);
			}
			registeredFragmentsRef.current.set(spec.fragmentId, spec);
			return () => {
				registeredFragmentsRef.current.delete(spec.fragmentId);
			};
		},
		[isAttachedFragment, parentCtx]
	);

	const registerBlockField = useCallback(
		(spec: RegisteredBlockFieldSpec) => {
			if (isAttachedFragment && parentCtx) {
				return parentCtx.registerBlockField(spec);
			}
			registeredBlocksRef.current.set(spec.fieldKey, spec);
			return () => {
				registeredBlocksRef.current.delete(spec.fieldKey);
			};
		},
		[isAttachedFragment, parentCtx]
	);

	const contextValue = useMemo<SchemaFormContextValue>(() => {
		if (isAttachedFragment && parentCtx) {
			return {
				...parentCtx,
				scopePrefix: scopePrefix || parentCtx.scopePrefix,
				fieldsByName,
			};
		}
		return {
			values: localValues,
			errors,
			isDirty,
			scopePrefix,
			fieldsByName,
			updateFieldValue,
			setValuesBatch,
			setFieldError,
			registerFragment,
			registerBlockField,
			validateAll,
			validateStep,
		};
	}, [
		isAttachedFragment,
		parentCtx,
		localValues,
		errors,
		isDirty,
		scopePrefix,
		fieldsByName,
		updateFieldValue,
		setValuesBatch,
		setFieldError,
		registerFragment,
		registerBlockField,
		validateAll,
		validateStep,
	]);

	// Bridge context onto DOM container so isolated island roots mounted via `createRoot` can join
	useEffect(() => {
		const el = containerRef.current as BridgedSchemaFormElement | null;
		if (!el) {
			return;
		}
		el.__rwSchemaFormContext = contextValue;
		if (el.__rwSchemaFormListeners) {
			for (const listener of el.__rwSchemaFormListeners) {
				listener(contextValue);
			}
		}
		const ancestorForm = el.closest<BridgedSchemaFormElement>('[data-rw-schema-form]');
		if (ancestorForm && ancestorForm !== el && !ancestorForm.__rwSchemaFormContext) {
			ancestorForm.__rwSchemaFormContext = contextValue;
			if (ancestorForm.__rwSchemaFormListeners) {
				for (const listener of ancestorForm.__rwSchemaFormListeners) {
					listener(contextValue);
				}
			}
		}
	}, [contextValue]);

	// When rendered as a standalone fragment inside a classic ProcessWire HTML `<form>`, hook its native submit for validation
	useEffect(() => {
		if (!schema.isFragment || isAttachedFragment || props.validateOnSubmit === false) {
			return;
		}
		const el = containerRef.current;
		const hostForm = el?.closest<HTMLFormElement>('form');
		if (!hostForm || hostForm.hasAttribute('data-rw-schema-form')) {
			return;
		}
		const prevCount = Number(hostForm.getAttribute('data-rw-novalidate-refs') || '0');
		if (prevCount === 0) {
			hostForm.setAttribute('data-rw-orig-novalidate', hostForm.noValidate ? '1' : '0');
			hostForm.noValidate = true;
		}
		hostForm.setAttribute('data-rw-novalidate-refs', String(prevCount + 1));

		const onNativeSubmit = (e: SubmitEvent) => {
			const submitter = e.submitter as HTMLButtonElement | HTMLInputElement | null;
			const isBypassValidation = Boolean(
				(submitter?.name && /delete|discard|restore_revision|trash|unpublish/i.test(submitter.name)) ||
					submitter?.hasAttribute('formnovalidate') ||
					hostForm.getAttribute('data-rw-skip-validate') === '1'
			);
			if (isBypassValidation) {
				isSubmittingRef.current = true;
				return;
			}
			const result = validateAll();
			if (!result.valid) {
				isSubmittingRef.current = false;
				e.preventDefault();
				e.stopPropagation();
			} else {
				isSubmittingRef.current = true;
				window.queueMicrotask(() => {
					if (e.defaultPrevented) {
						isSubmittingRef.current = false;
					}
				});
			}
		};
		hostForm.addEventListener('submit', onNativeSubmit);
		return () => {
			hostForm.removeEventListener('submit', onNativeSubmit);
			const nextCount = Math.max(0, Number(hostForm.getAttribute('data-rw-novalidate-refs') || '1') - 1);
			if (nextCount === 0) {
				const orig = hostForm.getAttribute('data-rw-orig-novalidate');
				hostForm.noValidate = orig === '1';
				hostForm.removeAttribute('data-rw-novalidate-refs');
				hostForm.removeAttribute('data-rw-orig-novalidate');
			} else {
				hostForm.setAttribute('data-rw-novalidate-refs', String(nextCount));
			}
		};
	}, [schema.isFragment, isAttachedFragment, props.validateOnSubmit, validateAll]);

	const notifySettingDomChanged = useCallback((targetFieldName?: string) => {
		if (typeof window === 'undefined' || !targetFieldName) {
			return;
		}
		window.requestAnimationFrame(() => {
			const root = containerRef.current;
			if (!root) {
				return;
			}
			const fieldWrap =
				root.querySelector<HTMLElement>(`[data-field-name="${CSS.escape(targetFieldName)}"]`) ?? root;
			fieldWrap.dispatchEvent(new Event('input', { bubbles: true }));
			fieldWrap.dispatchEvent(new Event('change', { bubbles: true }));
		});
	}, []);

	const handleSettingFieldChange = useCallback(
		(targetField: SchemaFieldDefinition, val: unknown) => {
			updateFieldValue(targetField.name, val, targetField, scopePrefix);
			notifySettingDomChanged(targetField.name);
		},
		[updateFieldValue, scopePrefix, notifySettingDomChanged]
	);

	const handleNamedSettingChange = useCallback(
		(ownerField: SchemaFieldDefinition, targetName: string, val: unknown) => {
			updateFieldValue(targetName || ownerField.name, val, ownerField, scopePrefix);
			notifySettingDomChanged(ownerField.name || targetName);
		},
		[updateFieldValue, scopePrefix, notifySettingDomChanged]
	);

	const resolveFieldAdornment = useCallback(
		(fieldName?: string): SchemaFieldAdornment | undefined => {
			if (!fieldName || !props.fieldAdornments) {
				return undefined;
			}
			if (props.fieldAdornments[fieldName]) {
				return props.fieldAdornments[fieldName];
			}
			const cleanPrefix = scopePrefix ? scopePrefix.replace(/_+$/, '') : '';
			if (cleanPrefix && fieldName.startsWith(`${cleanPrefix}_`)) {
				const shortName = fieldName.slice(cleanPrefix.length + 1);
				if (shortName && props.fieldAdornments[shortName]) {
					return props.fieldAdornments[shortName];
				}
			}
			return undefined;
		},
		[props.fieldAdornments, scopePrefix]
	);

	const confirmDeleteFieldNames = useMemo(() => {
		const names = new Set<string>(['delete_page']);
		const collect = (list?: SchemaFieldDefinition[]) => {
			if (!Array.isArray(list)) {
				return;
			}
			for (const field of list) {
				if (!field) {
					continue;
				}
				if (field.confirmDelete && field.name) {
					names.add(field.name);
				}
				if (Array.isArray(field.children)) {
					collect(field.children);
				}
				if (Array.isArray(field.fields)) {
					collect(field.fields);
				} else if (field.fields && typeof field.fields === 'object') {
					collect(Object.values(field.fields));
				}
				if (Array.isArray(field.tabs)) {
					for (const subTab of field.tabs) {
						collect(subTab.fields);
					}
				}
			}
		};
		collect(Array.isArray(schema.fields) ? schema.fields : undefined);
		collect(Array.isArray(schema.belowTabsFields) ? schema.belowTabsFields : undefined);
		if (Array.isArray(schema.tabs)) {
			for (const tab of schema.tabs) {
				if (tab.confirmDelete && Array.isArray(tab.fields)) {
					for (const f of tab.fields) {
						if (f?.name && (f.type === 'checkbox' || f.confirmDelete)) {
							names.add(f.name);
						}
					}
				}
				collect(tab.fields);
			}
		}
		return Array.from(names);
	}, [schema.fields, schema.belowTabsFields, schema.tabs]);

	const hasConfirmedDelete = confirmDeleteFieldNames.some((name) => {
		const val = values[name];
		return Boolean(val && val !== '0' && val !== 'false');
	});

	return {
		instanceId,
		containerRef,
		schema,
		scopePrefix,
		values,
		conditionValues,
		errors,
		topTabs,
		visibleTopTabs,
		rootFields,
		belowTabsFields,
		fieldsByName,
		submits,
		activeTopTabId,
		setActiveTopTabId,
		steps,
		isMultiStep,
		activeStepIndex,
		setActiveStepIndex,
		headButtonsTarget,
		isDirty,
		setIsDirtyLocal,
		isSubmitting,
		setSubmittingState,
		validateAll,
		validateStep,
		updateFieldValue,
		contextValue,
		handleSettingFieldChange,
		handleNamedSettingChange,
		resolveFieldAdornment,
		hasConfirmedDelete,
	};
}
