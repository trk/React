import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeSameOriginUrl } from '../lib/utils';
import { Badge, Button, Card, CardContent } from '../ui';
import {
	AsmSelectField,
	CalculationField,
	CheckboxesField,
	CheckboxField,
	DatetimeField,
	HeadingField,
	MultiSelectField,
	RadiosField,
	RangeField,
	RatingField,
	RepeaterField,
	SelectField,
	SignatureField,
	SubmitField,
	TextareaField,
	TextField,
	TiptapField,
	ToggleField,
} from './controls';
import {
	countNestedErrors,
	ensureNativeLanguageTabsBridge,
	FieldNotes,
	FieldStatusRow,
	navigateTablistByKey,
	normalizeOptions,
	readInitialSyncedLanguageId,
	resolveFieldState,
	resolveGridSpanClass,
	resolveScopedFieldValue,
	scrollTabIntoView,
	SearchableTabPanel,
} from './shared';
import type {
	InputfieldLanguageItem,
	InputfieldSubmitDropdownItem,
	ReactInputfieldProps,
	SchemaFieldAdornment,
	SchemaFieldDefinition,
	SchemaFieldProps,
	SchemaFormPayload,
	SchemaFormProps,
	SchemaTabPaneDefinition,
} from './types';
import {
	valibot,
	validateFieldWithValibot,
	validateSchemaTree,
	type RegisteredBlockFieldSpec,
	type RegisteredFragmentSpec,
	type SchemaValidationResult,
} from './validation';

import type { MediaCustomFieldRenderer } from './mediaUtils';

export * from './types';
export * from './shared';
export * from './mediaUtils';
export * from './controls';
export * from './validation';
export { valibot };

type RuntimeFieldControlKey =
	| 'FileFieldControl'
	| 'IconFieldControl'
	| 'ImageFieldControl'
	| 'KeyValueFieldControl'
	| 'LinkFieldControl'
	| 'RelationFieldControl';

function RuntimeFieldControl({
	controlKey,
	skeletonClass,
	controlProps,
}: {
	controlKey: RuntimeFieldControlKey;
	skeletonClass: string;
	controlProps: Record<string, unknown>;
}): React.ReactElement {
	const Resolved =
		typeof window !== 'undefined'
			? (
					window.ReactWorkspaceRuntime?.Fields as unknown as
						| Record<string, React.ComponentType<Record<string, unknown>> | undefined>
						| undefined
				)?.[controlKey]
			: undefined;
	if (Resolved) {
		return <Resolved {...controlProps} />;
	}
	return (
		<div
			className={`w-full rounded-md border border-border bg-muted/20 ${skeletonClass}`}
			data-rw-lazy-chunk={`SchemaForm.${controlKey}`}
		/>
	);
}

function prefetchSchemaControls(schema: SchemaFormPayload): void {
	if (typeof window === 'undefined') {
		return;
	}
	const rt = window.ReactWorkspaceRuntime as
		| {
				ensureKeyValueLoaded?: () => Promise<void>;
				ensureIconFieldLoaded?: () => Promise<void>;
				ensureLinkFieldLoaded?: () => Promise<void>;
				ensureFileFieldLoaded?: () => Promise<void>;
				ensureImageFieldLoaded?: () => Promise<void>;
				ensureRelationFieldLoaded?: () => Promise<void>;
				ensureTabLoaded?: () => Promise<void>;
		  }
		| undefined;
	if (!rt) {
		return;
	}

	const needed = new Set<string>();
	const visitFieldList = (items: unknown): void => {
		if (!Array.isArray(items)) {
			return;
		}
		for (const item of items) {
			if (!item || typeof item !== 'object') {
				continue;
			}
			const f = item as Record<string, unknown>;
			const rawType = String(f.type || f.inputType || f.inputfieldClass || '').toLowerCase();
			const kind = String(f.kind || '').toLowerCase();
			if (kind === 'tabs' || rawType === 'tabs' || rawType === 'markupreacttab') {
				needed.add('tab');
			}
			if (kind === 'island' && f.island && typeof f.island === 'object') {
				const islandComp = String((f.island as Record<string, unknown>).component || '');
				if (islandComp === 'MarkupReactTab') needed.add('tab');
				if (islandComp === 'InputfieldReactKeyValue') needed.add('keyvalue');
				if (islandComp === 'InputfieldReactIcon' || islandComp === 'ReactWorkspace/Icon') needed.add('icon');
				if (islandComp === 'InputfieldReactLink') needed.add('link');
				if (islandComp === 'InputfieldReactFile') needed.add('file');
				if (islandComp === 'InputfieldReactImage') needed.add('image');
				if (islandComp.startsWith('InputfieldReactM2') || islandComp === 'InputfieldReactO2M') needed.add('relation');
			}
			if (rawType === 'keyvalue' || rawType === 'kv' || rawType === 'inputfieldreactkeyvalue') {
				needed.add('keyvalue');
			} else if (
				rawType === 'relation' ||
				rawType === 'm2o' ||
				rawType === 'm2m' ||
				rawType === 'o2m' ||
				rawType === 'm2a' ||
				rawType.includes('inputfieldreactm2') ||
				rawType.includes('inputfieldreacto2m')
			) {
				needed.add('relation');
			} else if (rawType === 'link' || Boolean(f.linkConfig)) {
				needed.add('link');
			} else if (
				rawType === 'icon' ||
				rawType === 'react_icon' ||
				rawType === 'inputfieldreacticon' ||
				Boolean(f.iconConfig)
			) {
				needed.add('icon');
			} else if (
				rawType === 'image' ||
				rawType === 'images' ||
				rawType === 'inputfieldimage' ||
				rawType === 'inputfieldreactimage' ||
				rawType === 'react_image' ||
				Boolean(f.isImage)
			) {
				needed.add('image');
			} else if (
				rawType === 'file' ||
				rawType === 'files' ||
				rawType === 'inputfieldfile' ||
				rawType === 'inputfieldreactfile' ||
				rawType === 'react_file'
			) {
				needed.add('file');
			}
			visitFieldList(f.fields);
			visitFieldList(f.children);
			visitFieldList(f.tabs);
			visitFieldList(f.steps);
		}
	};

	const rootRec = schema as unknown as Record<string, unknown>;
	visitFieldList(schema.fields);
	visitFieldList(schema.tabs);
	visitFieldList(rootRec.steps);

	if (needed.has('keyvalue')) void rt.ensureKeyValueLoaded?.();
	if (needed.has('relation')) void rt.ensureRelationFieldLoaded?.();
	if (needed.has('link')) void rt.ensureLinkFieldLoaded?.();
	if (needed.has('icon')) void rt.ensureIconFieldLoaded?.();
	if (needed.has('image')) void rt.ensureImageFieldLoaded?.();
	if (needed.has('file')) void rt.ensureFileFieldLoaded?.();
	if (needed.has('tab')) void rt.ensureTabLoaded?.();
}

function renderFieldControl(props: ReactInputfieldProps): React.ReactElement {
	switch (props.controlType) {
		case 'text':
		case 'email':
		case 'url':
		case 'tel':
		case 'number':
			return <TextField {...props} />;
		case 'link':
			return (
				<RuntimeFieldControl
					controlKey="LinkFieldControl"
					skeletonClass="h-9"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'icon':
			return (
				<RuntimeFieldControl
					controlKey="IconFieldControl"
					skeletonClass="h-9"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'textarea':
			return <TextareaField {...props} />;
		case 'tiptap':
			return <TiptapField {...props} />;
		case 'datetime':
		case 'date':
		case 'time':
			return <DatetimeField {...props} />;
		case 'checkbox':
		case 'consent':
			return <CheckboxField {...props} />;
		case 'toggle':
			return <ToggleField {...props} />;
		case 'select':
			return <SelectField {...props} />;
		case 'radios':
			return <RadiosField {...props} />;
		case 'checkboxes':
			return <CheckboxesField {...props} />;
		case 'asmselect':
			return <AsmSelectField {...props} />;
		case 'multiselect':
			return <MultiSelectField {...props} />;
		case 'range':
		case 'colspan':
			return <RangeField {...props} />;
		case 'rating':
			return <RatingField {...props} />;
		case 'signature':
			return <SignatureField {...props} />;
		case 'calculation':
			return <CalculationField {...props} />;
		case 'repeater':
			return <RepeaterField {...props} />;
		case 'file':
			return (
				<RuntimeFieldControl
					controlKey="FileFieldControl"
					skeletonClass="h-24"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'image':
			return (
				<RuntimeFieldControl
					controlKey="ImageFieldControl"
					skeletonClass="h-24"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'heading':
			return <HeadingField {...props} />;
		case 'submit':
			return <SubmitField {...props} />;
		default:
			return <TextField {...props} />;
	}
}

/* ============================================================================
 * Hierarchical SchemaForm Context (Root Form <-> Nested Blocks / Fragments)
 * ========================================================================== */

export interface SchemaFormContextValue {
	values: Record<string, unknown>;
	errors: Record<string, string>;
	isDirty: boolean;
	scopePrefix?: string;
	fieldsByName?: ReadonlyMap<string, SchemaFieldDefinition>;
	updateFieldValue: (name: string, value: unknown, fieldDef?: SchemaFieldDefinition, scopePrefix?: string) => void;
	setValuesBatch: (patch: Record<string, unknown>, markDirty?: boolean) => void;
	setFieldError: (name: string, message: string | null) => void;
	registerFragment: (spec: RegisteredFragmentSpec) => () => void;
	registerBlockField: (spec: RegisteredBlockFieldSpec) => () => void;
	validateAll: () => SchemaValidationResult;
	validateStep: (stepIndex: number) => SchemaValidationResult;
}

export const SchemaFormContext: React.Context<SchemaFormContextValue | null> =
	(typeof window !== 'undefined' &&
		((window as unknown as { ReactWorkspaceRuntime?: { Fields?: { SchemaFormContext?: unknown } } })
			.ReactWorkspaceRuntime?.Fields?.SchemaFormContext as
			| React.Context<SchemaFormContextValue | null>
			| undefined)) ||
	createContext<SchemaFormContextValue | null>(null);

type BridgedSchemaFormElement = HTMLElement & {
	__rwSchemaFormContext?: SchemaFormContextValue;
	__rwSchemaFormListeners?: Set<(ctx: SchemaFormContextValue) => void>;
};

/**
 * Resolves the enclosing `SchemaFormContext` either from React context or from the
 * closest `[data-rw-schema-form]` DOM ancestor (bridging across island roots).
 */
export function useSchemaFormContext(
	hostRef?: React.RefObject<HTMLElement | null>
): SchemaFormContextValue | null {
	const reactCtx = useContext(SchemaFormContext);
	const [domCtx, setDomCtx] = useState<SchemaFormContextValue | null>(null);

	useEffect(() => {
		if (reactCtx || !hostRef?.current) {
			return;
		}
		const formEl = hostRef.current.parentElement?.closest<BridgedSchemaFormElement>('[data-rw-schema-form]');
		if (!formEl) {
			return;
		}
		if (formEl.__rwSchemaFormContext) {
			setDomCtx((prev) => (prev === formEl.__rwSchemaFormContext ? prev : formEl.__rwSchemaFormContext!));
		}
		if (!formEl.__rwSchemaFormListeners) {
			formEl.__rwSchemaFormListeners = new Set();
		}
		const listener = (nextCtx: SchemaFormContextValue) => {
			setDomCtx(nextCtx);
		};
		formEl.__rwSchemaFormListeners.add(listener);
		return () => {
			formEl.__rwSchemaFormListeners?.delete(listener);
		};
	}, [reactCtx, hostRef]);

	return reactCtx || domCtx;
}

function extractFieldsInitialValues(
	fields: SchemaFieldDefinition[],
	target: Record<string, unknown>
): void {
	for (const f of fields) {
		if (f.name && target[f.name] === undefined) {
			const rawType = String(f.type || f.inputfieldClass || '').toLowerCase();
			const isMultiValue =
				Boolean(f.multiple) ||
				rawType === 'checkboxes' ||
				rawType === 'asmselect' ||
				rawType === 'multiselect' ||
				rawType === 'repeater';
			if (isMultiValue && f.values !== undefined) {
				target[f.name] = f.values;
			} else if (f.value !== undefined) {
				target[f.name] = f.value;
			} else if (f.values !== undefined) {
				target[f.name] = Array.isArray(f.values) ? (f.values[0] ?? '') : f.values;
			} else if (f.defaultValue !== undefined) {
				target[f.name] = f.defaultValue;
			} else if (f.checked !== undefined) {
				target[f.name] = f.checked ? (f.checkedValue || '1') : '';
			} else if (
				Array.isArray(f.files) &&
				(rawType === 'file' ||
					rawType === 'files' ||
					rawType === 'image' ||
					rawType === 'images' ||
					f.isImage ||
					f.isFile)
			) {
				target[f.name] = f.files.map((item) => item.name);
			}
		}
		const rawLanguages = f.i18n?.languages ?? f.languages;
		if (f.name && (f.useLanguages || f.i18n?.enabled) && Array.isArray(rawLanguages)) {
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
	for (const tab of schema.tabs || []) {
		extractFieldsInitialValues(tab.fields || [], seeded);
	}
	return seeded;
}

function collectFieldsIntoMap(
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

function hasVisibleNonInlineFields(
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

function formatInlineSettingSummaryChip(
	bf: SchemaFieldDefinition,
	rawVal: unknown
): string | null {
	const rawType = String(bf.type || bf.inputfieldClass || 'text').toLowerCase();
	const isBool =
		rawType === 'checkbox' ||
		rawType === 'consent' ||
		rawType === 'switch' ||
		rawType === 'boolean' ||
		rawType === 'bool';
	if (isBool) {
		const truthy = rawVal === true || rawVal === 1 || rawVal === '1';
		if (!truthy) {
			return null;
		}
		const shortLabel = (bf.label || bf.name || '').trim();
		return shortLabel ? (shortLabel.length > 12 ? `${shortLabel.slice(0, 11)}…` : shortLabel) : null;
	}
	if (rawVal === null || rawVal === undefined || typeof rawVal === 'object') {
		return null;
	}
	const valStr = String(rawVal).trim();
	if (
		valStr === '' ||
		valStr === '0' ||
		valStr === 'false' ||
		valStr === 'none' ||
		valStr === 'auto' ||
		valStr === 'normal' ||
		valStr === 'inherit'
	) {
		return null;
	}
	const lowerName = (bf.name || '').toLowerCase();
	if (
		lowerName === 'html_element' ||
		lowerName.endsWith('_html_element') ||
		lowerName.endsWith('_tag')
	) {
		return valStr.toUpperCase();
	}
	if (valStr.length <= 12) {
		return valStr;
	}
	const opts = normalizeOptions(bf.options);
	const matched = opts.find((o) => o.value === valStr);
	const candidate = matched ? matched.label.trim() : valStr;
	return candidate.length > 12 ? `${candidate.slice(0, 11)}…` : candidate;
}

const InlineFieldSettingsPopover: React.FC<{
	ownerLabel: string;
	settingNames: string[];
	fieldsByName?: ReadonlyMap<string, SchemaFieldDefinition>;
	formValues?: Record<string, unknown>;
	conditionValues?: Record<string, unknown>;
	allErrors?: Record<string, string>;
	scopePrefix?: string;
	disabled?: boolean;
	onUpdateSetting: (targetField: SchemaFieldDefinition, nextValue: unknown) => void;
}> = ({
	ownerLabel,
	settingNames,
	fieldsByName,
	formValues = {},
	conditionValues,
	allErrors = {},
	scopePrefix,
	disabled,
	onUpdateSetting,
}) => {
	const effectiveConditionValues = conditionValues ?? formValues;
	const resolvedFields = useMemo(() => {
		if (!fieldsByName || settingNames.length === 0) {
			return [];
		}
		const cleanPrefix = scopePrefix ? scopePrefix.replace(/_+$/, '') : '';
		const seen = new Set<string>();
		const out: SchemaFieldDefinition[] = [];
		for (const rawKey of settingNames) {
			const key = rawKey.trim();
			if (!key) {
				continue;
			}
			const candidate =
				fieldsByName.get(key) ||
				(cleanPrefix ? fieldsByName.get(`${cleanPrefix}_${key}`) : undefined);
			if (candidate && candidate.name && !seen.has(candidate.name)) {
				seen.add(candidate.name);
				out.push(candidate);
			}
		}
		return out;
	}, [fieldsByName, settingNames, scopePrefix]);

	const visibleFields = useMemo(
		() => resolvedFields.filter((bf) => resolveFieldState(bf, effectiveConditionValues, scopePrefix).visible),
		[resolvedFields, effectiveConditionValues, scopePrefix]
	);

	const summaryChips = useMemo(() => {
		const chips: string[] = [];
		for (const bf of visibleFields) {
			if (chips.length >= 3) {
				break;
			}
			const raw =
				bf.name in formValues
					? formValues[bf.name]
					: resolveScopedFieldValue(formValues, bf.name, scopePrefix) ||
						bf.value ||
						bf.defaultValue;
			const chip = formatInlineSettingSummaryChip(bf, raw);
			if (chip) {
				chips.push(chip);
			}
		}
		return chips;
	}, [visibleFields, formValues, scopePrefix]);

	const hasBoundError = useMemo(
		() => resolvedFields.some((bf) => bf.name && Boolean(allErrors[bf.name])),
		[resolvedFields, allErrors]
	);

	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const panelRef = useRef<HTMLDivElement | null>(null);
	const panelId = useId();
	const [pos, setPos] = useState<{ top: number; left: number; width: number; flipTop: boolean }>({
		top: 0,
		left: 0,
		width: 320,
		flipTop: false,
	});

	const refreshPosition = useCallback(() => {
		const el = triggerRef.current;
		if (!el || typeof window === 'undefined') {
			return;
		}
		const rect = el.getBoundingClientRect();
		const gap = 6;
		const margin = 12;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const width = Math.min(340, Math.max(240, vw - margin * 2));
		const estimatedHeight = Math.min(440, 64 + visibleFields.length * 76);
		const spaceBelow = vh - rect.bottom - margin;
		const spaceAbove = rect.top - margin;
		const flipTop = spaceBelow < estimatedHeight + gap && spaceAbove > spaceBelow;
		const left = Math.max(margin, Math.min(rect.right - width, vw - width - margin));
		const top = flipTop ? Math.max(margin, rect.top - gap) : rect.bottom + gap;
		setPos({ top, left, width, flipTop });
	}, [visibleFields.length]);

	useEffect(() => {
		if (!open) {
			return;
		}
		refreshPosition();
		const handlePointerDown = (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (!target) {
				return;
			}
			if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
				return;
			}
			if (target instanceof Element && target.closest('[data-rw-portal-overlay]')) {
				return;
			}
			setOpen(false);
		};
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				setOpen(false);
				triggerRef.current?.focus();
			}
		};
		const handleReposition = () => refreshPosition();
		document.addEventListener('mousedown', handlePointerDown);
		document.addEventListener('keydown', handleKeyDown);
		window.addEventListener('resize', handleReposition);
		window.addEventListener('scroll', handleReposition, true);
		return () => {
			document.removeEventListener('mousedown', handlePointerDown);
			document.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('resize', handleReposition);
			window.removeEventListener('scroll', handleReposition, true);
		};
	}, [open, refreshPosition]);

	if (visibleFields.length === 0) {
		return null;
	}

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				disabled={disabled}
				aria-expanded={open}
				aria-controls={panelId}
				aria-label={`${ownerLabel} display settings`}
				data-rw-inline-settings-trigger=""
				onClick={() => setOpen((prev) => !prev)}
				className={cn(
					'inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed',
					hasBoundError
						? 'border-destructive/60 bg-destructive/10 text-destructive'
						: open
							? 'border-primary/50 bg-primary/10 text-foreground'
							: 'border-border/80 bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/80 hover:text-foreground'
				)}
			>
				{hasBoundError ? <span className="size-1.5 rounded-full bg-destructive shrink-0" /> : null}
				{summaryChips.length > 0 ? (
					<span className="font-mono text-[10px] leading-none tracking-tight text-foreground/90">
						{summaryChips.join(' · ')}
					</span>
				) : null}
				<DynamicIcon name="sliders-horizontal" className="size-3 shrink-0" />
			</button>

			{open && typeof document !== 'undefined'
				? createPortal(
						<div
							ref={panelRef}
							id={panelId}
							data-rw-portal-overlay=""
							style={{
								position: 'fixed',
								top: pos.top,
								left: pos.left,
								width: pos.width,
								transform: pos.flipTop ? 'translateY(-100%)' : undefined,
								zIndex: 9998,
							}}
							className="max-h-[min(28rem,calc(100vh-24px))] overflow-y-auto rounded-xl border border-border bg-popover p-3.5 text-popover-foreground shadow-lg"
						>
							<div className="mb-3 flex items-center justify-between border-b border-border pb-2">
								<span className="text-xs font-semibold text-foreground">
									{ownerLabel} Settings
								</span>
								<button
									type="button"
									aria-label={t('form.closeFieldSettings', 'Close field settings')}
									onClick={() => {
										setOpen(false);
										triggerRef.current?.focus();
									}}
									className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
								>
									<DynamicIcon name="x" className="size-3.5" />
								</button>
							</div>

							<div className="space-y-3">
								{visibleFields.map((bf) => {
									const bfState = resolveFieldState(bf, effectiveConditionValues, scopePrefix);
									const bfVal =
										bf.name in formValues
											? formValues[bf.name]
											: resolveScopedFieldValue(formValues, bf.name, scopePrefix);
									return (
										<SchemaField
											key={bf.name}
											field={{
												...bf,
												id: `${bf.id || bf.name}__inline`,
												inlineSettings: undefined,
											}}
											value={bfVal !== '' ? bfVal : bf.name in formValues ? formValues[bf.name] : undefined}
											formValues={formValues}
											allErrors={allErrors}
											errorMessage={bf.name ? allErrors[bf.name] : undefined}
											isDynamicallyRequired={bfState.required}
											isDynamicallyDisabled={bfState.disabled}
											scopePrefix={scopePrefix}
											suppressInlineSettings
											onChange={(nextVal) => onUpdateSetting(bf, nextVal)}
										/>
									);
								})}
							</div>
						</div>,
						document.body
					)
				: null}
		</>
	);
};

/* ============================================================================
 * Single Schema Field Renderer (<Field> wrapper + ReactInputfield)
 * ========================================================================== */

export const SchemaField: React.FC<
	SchemaFieldProps & {
		formValues?: Record<string, unknown>;
		conditionValues?: Record<string, unknown>;
		allErrors?: Record<string, string>;
		errorMessage?: string;
		isDynamicallyRequired?: boolean;
		isDynamicallyDisabled?: boolean;
		scopePrefix?: string;
		fieldsByName?: ReadonlyMap<string, SchemaFieldDefinition>;
		suppressInlineSettings?: boolean;
		adornment?: SchemaFieldAdornment;
		onNamedChange?: (targetName: string, value: unknown) => void;
		onSettingFieldChange?: (targetField: SchemaFieldDefinition, value: unknown) => void;
	}
> = ({
	field,
	value,
	onChange,
	onNamedChange,
	onSettingFieldChange,
	formValues,
	conditionValues,
	allErrors,
	errorMessage,
	isDynamicallyRequired,
	isDynamicallyDisabled,
	scopePrefix,
	fieldsByName,
	suppressInlineSettings,
	adornment,
}) => {
	const schemaCtx = useContext(SchemaFormContext);
	const effectiveFieldsByName = fieldsByName ?? schemaCtx?.fieldsByName;
	const rawType = (field.type || field.inputfieldClass || 'text').toLowerCase();
	const options = useMemo(() => normalizeOptions(field.options), [field.options]);
	const fieldId = field.id || `Inputfield_${field.name}`;
	const isRequired = Boolean(field.required || isDynamicallyRequired);
	const isReadOnly = Boolean(field.readOnly ?? field.readonly);
	const isDisabled = Boolean(field.disabled || isDynamicallyDisabled);
	const resolvedError =
		errorMessage || field.error || (field.errors && field.errors.length > 0 ? field.errors.join(' ') : '');

	const rawLanguages = field.i18n?.languages ?? field.languages;
	const hasLanguages = Boolean(
		(field.useLanguages || field.i18n?.enabled) && Array.isArray(rawLanguages) && rawLanguages.length > 0
	);
	const rawLanguagesRef = useRef(rawLanguages);
	rawLanguagesRef.current = rawLanguages;
	const langSignature =
		hasLanguages && Array.isArray(rawLanguages)
			? rawLanguages
					.map((lang) => {
						const langInputName =
							lang.inputName || (lang.isDefault ? field.name : `${field.name}__${lang.id}`);
						const liveLangVal = formValues
							? langInputName in formValues
								? formValues[langInputName]
								: lang.isDefault && field.name in formValues
									? formValues[field.name]
									: lang.value
							: lang.value;
						return `${lang.id}:${langInputName}:${lang.editable !== false ? '1' : '0'}:${String(liveLangVal ?? '')}`;
					})
					.join('\u0000')
			: '';
	const languages = useMemo<InputfieldLanguageItem[] | undefined>(() => {
		const currentRaw = rawLanguagesRef.current;
		if (!hasLanguages || !Array.isArray(currentRaw)) {
			return undefined;
		}
		return currentRaw.map((lang) => {
			const langInputName =
				lang.inputName || (lang.isDefault ? field.name : `${field.name}__${lang.id}`);
			const liveLangVal = formValues
				? langInputName in formValues
					? formValues[langInputName]
					: lang.isDefault && field.name in formValues
						? formValues[field.name]
						: lang.value
				: lang.value;
			return {
				id: lang.id,
				name: lang.name,
				title: lang.title,
				isDefault: lang.isDefault,
				editable: lang.editable !== false,
				inputName: langInputName,
				inputId: lang.inputId || (lang.isDefault ? fieldId : `${fieldId}__${lang.id}`),
				value: String(liveLangVal ?? ''),
			};
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hasLanguages, langSignature, field.name, fieldId]);

	const [activeLangId, setActiveLangId] = useState<number>(() =>
		readInitialSyncedLanguageId(languages)
	);

	const descriptionId = field.description ? `${fieldId}__desc` : undefined;
	const notesId = field.notes ? `${fieldId}__notes` : undefined;
	const errorId = resolvedError ? `${fieldId}__err` : undefined;
	const describedBy = [descriptionId, errorId, notesId].filter(Boolean).join(' ') || undefined;

	if (rawType === 'heading') {
		return (
			<HeadingField
				controlType="heading"
				id={fieldId}
				name={field.name}
				label={field.label}
				description={field.description}
			/>
		);
	}

	if (rawType === 'submit') {
		const dropdownItems: InputfieldSubmitDropdownItem[] = (field.actions || []).map((a) => ({
			type: a.type ?? 'value',
			value: a.value,
			label: a.label,
			icon: a.icon,
		}));
		return (
			<div className="pt-1" data-field-name={field.name}>
				<SubmitField
					controlType="submit"
					id={fieldId}
					name={field.name}
					value={field.label || String(value ?? 'Submit')}
					disabled={isDisabled}
					submit={{
						type: 'submit',
						value: field.label || 'Submit',
						label: field.label || 'Submit',
						icon: field.icon,
						danger: field.danger,
						header: field.header,
						dropdownInputName: '_action_value',
						dropdownSubmit: true,
						dropdownRequired: false,
						dropdownItems,
					}}
				/>
			</div>
		);
	}

	const inlineSettingsNode =
		!suppressInlineSettings && Array.isArray(field.inlineSettings) && field.inlineSettings.length > 0 ? (
			<InlineFieldSettingsPopover
				ownerLabel={field.label || field.name || 'Field'}
				settingNames={field.inlineSettings}
				fieldsByName={effectiveFieldsByName}
				formValues={formValues ?? schemaCtx?.values}
				conditionValues={conditionValues}
				allErrors={allErrors ?? schemaCtx?.errors}
				scopePrefix={scopePrefix ?? schemaCtx?.scopePrefix}
				disabled={isDisabled}
				onUpdateSetting={(targetField, nextVal) => {
					if (onSettingFieldChange) {
						onSettingFieldChange(targetField, nextVal);
					} else if (schemaCtx?.updateFieldValue) {
						schemaCtx.updateFieldValue(targetField.name, nextVal, targetField, scopePrefix ?? schemaCtx.scopePrefix);
					} else if (onNamedChange) {
						onNamedChange(targetField.name, nextVal);
					}
				}}
			/>
		) : null;

	const hasBoundOverlay = Boolean(adornment?.boundOverlay);
	const effectiveRequired = hasBoundOverlay ? false : isRequired;
	const headerRightNode =
		adornment?.labelAction || inlineSettingsNode ? (
			<div className="flex items-center gap-1.5">
				{adornment?.labelAction}
				{inlineSettingsNode}
			</div>
		) : null;

	if (rawType.includes('keyvalue') || rawType === 'key-value' || rawType === 'key_value') {
		return (
			<div
				className="space-y-1.5"
				data-field-name={field.name}
				data-field-error={resolvedError ? '1' : undefined}
			>
				{field.label || headerRightNode ? (
					<div
						data-rw-field-slot="label"
						className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
					>
						{field.label ? (
							<label htmlFor={fieldId} className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
								{field.icon ? <DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" /> : null}
								<span>{field.label}</span>
								{effectiveRequired ? <span className="text-destructive">*</span> : null}
							</label>
						) : <span />}
						{headerRightNode}
					</div>
				) : null}
				{field.description ? (
					<p id={descriptionId} data-rw-field-slot="description" className="text-xs text-muted-foreground leading-relaxed">
						{field.description}
					</p>
				) : null}
				{hasBoundOverlay ? <div data-rw-field-slot="bound-overlay">{adornment?.boundOverlay}</div> : null}
				<div
					data-rw-field-slot="input"
					hidden={hasBoundOverlay || undefined}
					aria-hidden={hasBoundOverlay ? 'true' : undefined}
					className={hasBoundOverlay ? 'hidden' : undefined}
				>
					<RuntimeFieldControl
						controlKey="KeyValueFieldControl"
						skeletonClass="h-24"
						controlProps={{
							id: fieldId,
							name: field.name,
							scopePrefix: scopePrefix ?? schemaCtx?.scopePrefix,
							value: value !== undefined ? value : (field.value ?? field.defaultValue),
							rows: field.kvRows ?? (Array.isArray(field.rows) ? field.rows : undefined),
							onChange,
							keyLabel: field.keyLabel,
							valueLabel: field.valueLabel,
							keyPlaceholder: field.keyPlaceholder,
							valuePlaceholder: field.valuePlaceholder,
							addLabel: field.addLabel,
							removeLabel: field.removeLabel,
							minItems: field.minItems,
							maxItems: field.maxItems,
							keyPattern: field.keyPattern,
							keyPatternMessage: field.keyPatternMessage,
							allowEmptyValues: field.allowEmptyValues,
							required: effectiveRequired,
							readOnly: isReadOnly,
							disabled: isDisabled || isReadOnly,
							error: resolvedError,
						}}
					/>
				</div>
				<SchemaFieldFooter notes={field.notes} notesId={notesId} error={resolvedError} errorId={errorId} />
			</div>
		);
	}

	if (
		rawType === 'relation' ||
		rawType === 'm2o' ||
		rawType === 'm2m' ||
		rawType === 'o2m' ||
		rawType === 'm2a' ||
		rawType.includes('inputfieldreactm2') ||
		rawType.includes('inputfieldreacto2m')
	) {
		return (
			<div
				className="space-y-1.5"
				data-field-name={field.name}
				data-field-error={resolvedError ? '1' : undefined}
			>
				{field.label || headerRightNode ? (
					<div
						data-rw-field-slot="label"
						className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
					>
						{field.label ? (
							<label htmlFor={fieldId} className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
								{field.icon ? <DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" /> : null}
								<span>{field.label}</span>
								{effectiveRequired ? <span className="text-destructive">*</span> : null}
							</label>
						) : <span />}
						{headerRightNode}
					</div>
				) : null}
				{field.description ? (
					<p id={descriptionId} data-rw-field-slot="description" className="text-xs text-muted-foreground leading-relaxed">
						{field.description}
					</p>
				) : null}
				{hasBoundOverlay ? <div data-rw-field-slot="bound-overlay">{adornment?.boundOverlay}</div> : null}
				<div
					hidden={hasBoundOverlay || undefined}
					aria-hidden={hasBoundOverlay ? 'true' : undefined}
					className={hasBoundOverlay ? 'hidden' : undefined}
				>
					<RuntimeFieldControl
						controlKey="RelationFieldControl"
						skeletonClass="h-9"
						controlProps={{
							...field,
							id: fieldId,
							name: field.name,
							value: value !== undefined ? value : (field.value ?? field.defaultValue),
							readOnly: isReadOnly,
							disabled: isDisabled || isReadOnly,
							required: effectiveRequired,
							error: resolvedError,
							errorId,
							formValues,
							scopePrefix,
							onChange,
						}}
					/>
				</div>
				<FieldNotes notes={field.notes} id={notesId} />
			</div>
		);
	}

	const mappedControlType = (): ReactInputfieldProps['controlType'] => {
		if (rawType === 'link' || field.linkConfig) {
			return 'link';
		}
		if (
			rawType === 'icon' ||
			rawType === 'react_icon' ||
			rawType === 'inputfieldreacticon' ||
			field.iconConfig
		) {
			return 'icon';
		}
		if (
			rawType === 'colspan' ||
			rawType === 'col_span' ||
			rawType === 'col-span' ||
			field.inputType === 'colspan'
		) {
			return 'colspan';
		}
		if (rawType === 'range' || rawType === 'slider' || field.inputType === 'range') {
			return 'range';
		}
		if (rawType === 'rating') return 'rating';
		if (rawType === 'signature') return 'signature';
		if (rawType === 'calculation') return 'calculation';
		if (rawType === 'repeater') return 'repeater';
		if (
			rawType === 'image' ||
			rawType === 'images' ||
			rawType === 'inputfieldimage' ||
			rawType === 'inputfieldreactimage' ||
			rawType === 'react_image' ||
			field.isImage
		) {
			return 'image';
		}
		if (
			rawType === 'file' ||
			rawType === 'files' ||
			rawType === 'inputfieldfile' ||
			rawType === 'inputfieldreactfile' ||
			rawType === 'react_file'
		) {
			return 'file';
		}
		if (rawType === 'radios' || rawType === 'radio') return 'radios';
		if (rawType === 'checkboxes') return 'checkboxes';
		if (rawType === 'asmselect') return 'asmselect';
		if (rawType === 'multiselect' || rawType === 'selectmultiple') return 'multiselect';
		if (rawType === 'toggle') return 'toggle';
		if (
			rawType === 'checkbox' ||
			rawType === 'consent' ||
			rawType === 'switch' ||
			rawType === 'boolean' ||
			rawType === 'bool'
		) {
			return 'checkbox';
		}
		if (rawType.includes('select') || (options.length > 0 && !rawType.includes('text'))) {
			return 'select';
		}
		if (
			rawType === 'tiptap' ||
			rawType === 'tiptap_language' ||
			rawType === 'tiptap-language' ||
			rawType === 'inputfieldtiptap' ||
			rawType === 'richtext' ||
			rawType === 'richtext_language' ||
			rawType === 'richtext-language'
		) {
			return 'tiptap';
		}
		if (
			rawType.includes('textarea') ||
			rawType.includes('markdown') ||
			rawType.includes('code') ||
			rawType.includes('json')
		) {
			return 'textarea';
		}
		if (rawType === 'datetime' || rawType === 'date' || rawType === 'time') {
			return 'datetime';
		}
		if (rawType === 'number' || rawType === 'integer' || rawType === 'float' || rawType === 'decimal') {
			return 'number';
		}
		if (rawType === 'email') return 'email';
		if (rawType === 'url') return 'url';
		if (rawType === 'tel') return 'tel';
		return 'text';
	};

	const controlType = mappedControlType();
	const controlRendersOwnStatusRow =
		controlType === 'text' ||
		controlType === 'email' ||
		controlType === 'url' ||
		controlType === 'tel' ||
		controlType === 'number' ||
		controlType === 'textarea' ||
		controlType === 'asmselect' ||
		controlType === 'link' ||
		controlType === 'file' ||
		controlType === 'image';

	const connection = field.connection;
	const resolvedSlugFrom =
		connection?.type === 'slug' ? connection.sourceField : field.slugFrom || undefined;
	const resolvedSlugSeparator =
		connection?.type === 'slug' ? connection.separator : field.slugSeparator;
	const resolvedSlugMaxLength =
		connection?.type === 'slug' ? connection.maxLength : field.maxLength;
	const resolvedSlugLocked =
		connection?.type === 'slug' ? connection.lockWhenPopulated : field.slugLocked;
	const resolvedFormula =
		connection?.type === 'calculation' ? connection.formula : field.formula;
	const resolvedPrecision =
		connection?.type === 'calculation' ? connection.precision : field.precision;

	const currentVal = value !== undefined ? value : (field.values ?? field.value ?? field.defaultValue ?? '');
	const isChecked =
		controlType === 'checkbox'
			? Boolean(
					value !== undefined
						? value && value !== '0' && value !== 'false'
						: field.checked ?? (field.value && field.value !== '0')
				)
			: undefined;

	const activeLangInputId =
		languages && languages.length > 1
			? languages.find((l) => l.id === activeLangId)?.inputId || fieldId
			: fieldId;

	return (
		<div
			className="space-y-1.5"
			data-field-name={field.name}
			data-field-error={resolvedError ? '1' : undefined}
		>
			{field.label ? (
				headerRightNode ? (
					<div
						data-rw-field-slot="label"
						className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
					>
						<label
							htmlFor={activeLangInputId}
							className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground"
						>
							{field.icon ? (
								<DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" />
							) : null}
							<span>{field.label}</span>
							{effectiveRequired ? <span className="text-destructive">*</span> : null}
						</label>
						{headerRightNode}
					</div>
				) : (
					<label
						htmlFor={activeLangInputId}
						data-rw-field-slot="label"
						className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground"
					>
						{field.icon ? (
							<DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" />
						) : null}
						<span>{field.label}</span>
						{effectiveRequired ? <span className="text-destructive">*</span> : null}
					</label>
				)
			) : headerRightNode ? (
				<div data-rw-field-slot="label" className="flex justify-end">{headerRightNode}</div>
			) : null}

			{field.description ? (
				<p id={descriptionId} data-rw-field-slot="description" className="text-xs text-muted-foreground leading-relaxed">
					{field.description}
				</p>
			) : null}

			{hasBoundOverlay ? <div data-rw-field-slot="bound-overlay">{adornment?.boundOverlay}</div> : null}

			<div
				hidden={hasBoundOverlay || undefined}
				aria-hidden={hasBoundOverlay ? 'true' : undefined}
				className={hasBoundOverlay ? 'hidden' : undefined}
			>
				{renderFieldControl({
					controlType,
					id: fieldId,
					name: field.name,
					label: field.label,
					description: field.description,
					inputType: field.inputType,
					value: currentVal,
					checked: isChecked,
					checkedValue: field.checkedValue || '1',
					checkboxLabel: field.checkboxLabel || field.label,
					readOnly: isReadOnly,
					disabled: isDisabled,
					required: effectiveRequired,
				error: resolvedError || undefined,
				errorId,
				describedBy,
				placeholder: field.placeholder,
				min: field.min,
				max: field.max,
				step: field.step,
				minLength: field.minLength,
				maxLength: field.maxLength,
				pattern: field.pattern,
				rows: field.rows,
				mono: field.monospace,
				editorMode: field.editorMode,
				codeLanguage: field.codeLanguage,
				affixPrefix: field.prefix,
				affixSuffix: field.suffix,
				showCount: Boolean(field.showCount || field.charCount),
				slugFrom: resolvedSlugFrom,
				slugSeparator: resolvedSlugSeparator,
				slugMaxLength: resolvedSlugMaxLength,
				slugLocked: resolvedSlugLocked,
				secret: field.isSecret
					? {
							masked: Boolean(field.secretMasked),
							prefix: '',
							bytes: 32,
							autogen: true,
						}
					: undefined,
				languages,
				activeLangId: languages && languages.length > 1 ? activeLangId : undefined,
				onSelectLanguage: languages && languages.length > 1 ? setActiveLangId : undefined,
				hideLanguageTabs: false,
				options,
				optionColumns: field.optionColumns,
				datetime:
					controlType === 'datetime'
						? {
								mode: 'text',
								htmlType: field.inputType || 'date',
								dateFormat: 'Y-m-d',
								timeFormat:
									field.inputType === 'datetime-local' || field.inputType === 'time' ? 'H:i' : '',
								hasTime: field.inputType === 'datetime-local' || field.inputType === 'time',
								formattedValue: String(currentVal ?? ''),
								dateValue: String(currentVal ?? ''),
								timeValue: '',
							}
						: undefined,
				maxStars: field.maxStars,
				valueMode: field.valueMode,
				formula: resolvedFormula,
				precision: resolvedPrecision,
				formValues,
				scopePrefix,
				subfields: field.subfields,
				subErrors: allErrors,
				minRows: field.minRows,
				maxRows: field.maxRows,
				accept: field.accept,
				extensions: field.extensions,
				maxFiles: field.maxFiles,
				maxFilesize: field.maxFilesize,
				multiple: field.multiple,
				descriptionRows: field.descriptionRows,
				useTags: field.useTags,
				tagsList: field.tagsList,
				tagsPredefinedOnly: field.tagsPredefinedOnly,
				noUpload: field.noUpload,
				overwrite: field.overwrite,
				uploadUrl: field.uploadUrl,
				uploadFieldName: field.uploadFieldName,
				mediaEndpoint: field.mediaEndpoint,
				mediaToken: field.mediaToken,
				ownerId: field.ownerId,
				focusMode: field.focusMode,
				maxWidth: field.maxWidth,
				maxHeight: field.maxHeight,
				minWidth: field.minWidth,
				minHeight: field.minHeight,
				maxReject: field.maxReject,
				dimensionsByAspectRatio: field.dimensionsByAspectRatio,
				clientQuality: field.clientQuality,
				resizeServer: field.resizeServer,
				useImageEditor: field.useImageEditor,
				gridMode: field.gridMode,
				gridRatio: field.gridRatio,
				minFiles: field.minFiles,
				hasCustomFields: field.hasCustomFields,
				files: field.files,
				tiptapConfig: field.tiptapConfig || undefined,
				linkConfig: field.linkConfig || undefined,
				iconConfig:
					field.iconConfig ||
					(controlType === 'icon'
						? {
								allowCustomization: Boolean(field.allowCustomization),
								allowVariant: field.allowVariant,
								allowSize: field.allowSize,
								allowColor: field.allowColor,
								allowStrokeWidth: field.allowStrokeWidth,
								allowBackground: field.allowBackground,
								previewSize: field.previewSize,
								prefixMode: field.iconPrefixMode,
							}
						: undefined),
				onValueChange: (changedName, nextVal) => {
					if (changedName && changedName !== field.name && onNamedChange) {
						onNamedChange(changedName, nextVal);
					} else {
						onChange(nextVal);
					}
				},
				})}
			</div>

			{!controlRendersOwnStatusRow || hasBoundOverlay ? (
				<FieldStatusRow error={resolvedError} errorId={errorId} />
			) : null}
			<FieldNotes notes={field.notes} id={notesId} />
		</div>
	);
};

/* ============================================================================
 * Island & Markup Field Mount Containers
 * ========================================================================== */

function SchemaFieldHeader({
	field,
	className,
}: {
	field: SchemaFieldDefinition;
	className?: string;
}) {
	return (
		<>
			{field.label ? (
				<div
					data-rw-field-slot="label"
					className={cn(
						'flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground',
						className
					)}
				>
					{field.icon ? (
						<DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" />
					) : null}
					<span>{field.label}</span>
					{field.required ? <span className="text-destructive">*</span> : null}
				</div>
			) : null}
			{field.description ? (
				<p data-rw-field-slot="description" className="text-xs text-muted-foreground leading-relaxed">
					{field.description}
				</p>
			) : null}
		</>
	);
}

function SchemaFieldFooter({
	notes,
	notesId,
	error,
	errorId,
}: {
	notes?: string;
	notesId?: string;
	error?: string;
	errorId?: string;
}) {
	return (
		<>
			<FieldStatusRow error={error} errorId={errorId} />
			<FieldNotes notes={notes} id={notesId} />
		</>
	);
}

function SchemaIslandNode({
	field,
	errorMessage,
	formValues,
	conditionValues,
	allErrors,
	isDynamicallyRequired,
	isDynamicallyDisabled,
	scopePrefix,
	fieldsByName,
	adornment,
	onSettingFieldChange,
}: {
	field: SchemaFieldDefinition;
	errorMessage?: string;
	formValues?: Record<string, unknown>;
	conditionValues?: Record<string, unknown>;
	allErrors?: Record<string, string>;
	isDynamicallyRequired?: boolean;
	isDynamicallyDisabled?: boolean;
	scopePrefix?: string;
	fieldsByName?: ReadonlyMap<string, SchemaFieldDefinition>;
	adornment?: SchemaFieldAdornment;
	onSettingFieldChange?: (targetField: SchemaFieldDefinition, value: unknown) => void;
}) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const schemaCtx = useSchemaFormContext(hostRef);
	const resolvedError = errorMessage || field.error || '';
	const isRequired = Boolean(field.required || isDynamicallyRequired);
	const isDisabled = Boolean(field.disabled || field.readonly || field.readOnly || isDynamicallyDisabled);
	const effectiveFieldsByName = fieldsByName ?? schemaCtx?.fieldsByName;
	const serializedProps = useMemo(() => JSON.stringify(field.props || {}), [field.props]);
	const [, setRegistryTick] = useState(0);
	const islandFieldId = field.id || `Inputfield_${field.name}`;
	const islandErrorId = resolvedError ? `${islandFieldId}__err` : undefined;
	const islandNotesId = field.notes ? `${islandFieldId}__notes` : undefined;

	const InlineIslandComponent =
		typeof window !== 'undefined' && field.component
			? window.ReactWorkspaceRuntime?.getIsland?.(field.component)
			: undefined;

	useEffect(() => {
		if (typeof window === 'undefined' || !window.ReactWorkspaceRuntime?.subscribeIslands) {
			return;
		}
		return window.ReactWorkspaceRuntime.subscribeIslands(() => {
			setRegistryTick((t) => t + 1);
		});
	}, []);

	useEffect(() => {
		if (InlineIslandComponent) {
			return;
		}
		const el = hostRef.current;
		if (el && typeof window !== 'undefined') {
			window.ReactWorkspaceRuntime?.mountIslands(el.parentElement || el);
		}
	}, [field.component, serializedProps, InlineIslandComponent]);

	const inlineSettingsNode =
		Array.isArray(field.inlineSettings) && field.inlineSettings.length > 0 ? (
			<InlineFieldSettingsPopover
				ownerLabel={field.label || field.name || 'Field'}
				settingNames={field.inlineSettings}
				fieldsByName={effectiveFieldsByName}
				formValues={formValues ?? schemaCtx?.values}
				conditionValues={conditionValues}
				allErrors={allErrors ?? schemaCtx?.errors}
				scopePrefix={scopePrefix ?? schemaCtx?.scopePrefix}
				disabled={isDisabled}
				onUpdateSetting={(targetField, nextVal) => {
					if (onSettingFieldChange) {
						onSettingFieldChange(targetField, nextVal);
					} else if (schemaCtx?.updateFieldValue) {
						schemaCtx.updateFieldValue(
							targetField.name,
							nextVal,
							targetField,
							scopePrefix ?? schemaCtx.scopePrefix
						);
					}
				}}
			/>
		) : null;

	const hasBoundOverlay = Boolean(adornment?.boundOverlay);
	const effectiveRequired = hasBoundOverlay ? false : isRequired;
	const headerRightNode =
		adornment?.labelAction || inlineSettingsNode ? (
			<div className="flex items-center gap-1.5">
				{adornment?.labelAction}
				{inlineSettingsNode}
			</div>
		) : null;

	return (
		<div
			className={field.noWrap ? 'space-y-1.5' : 'space-y-2'}
			data-field-name={field.name}
			data-field-no-wrap={field.noWrap ? '1' : undefined}
			data-field-error={resolvedError ? '1' : undefined}
		>
			{!field.noWrap ? (
				<>
					{field.label || headerRightNode ? (
						<div
							data-rw-field-slot="label"
							className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
						>
							{field.label ? (
								<div className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
									{field.icon ? (
										<DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" />
									) : null}
									<span>{field.label}</span>
									{effectiveRequired ? <span className="text-destructive">*</span> : null}
								</div>
							) : (
								<span />
							)}
							{headerRightNode}
						</div>
					) : null}
					{field.description ? (
						<p data-rw-field-slot="description" className="text-xs text-muted-foreground leading-relaxed">
							{field.description}
						</p>
					) : null}
				</>
			) : headerRightNode ? (
				<div data-rw-field-slot="label" className="flex justify-end">{headerRightNode}</div>
			) : null}
			{hasBoundOverlay ? <div data-rw-field-slot="bound-overlay">{adornment?.boundOverlay}</div> : null}
			<div
				data-rw-field-slot="input"
				hidden={hasBoundOverlay || undefined}
				aria-hidden={hasBoundOverlay ? 'true' : undefined}
				className={hasBoundOverlay ? 'hidden' : undefined}
			>
				{InlineIslandComponent ? (
					<InlineIslandComponent {...(field.props || {})} />
				) : (
					<div
						ref={hostRef}
						data-inertia-island={field.component}
						data-react-island={field.component}
						data-props={serializedProps}
					/>
				)}
			</div>
			<SchemaFieldFooter
				notes={field.noWrap ? undefined : field.notes}
				notesId={islandNotesId}
				error={resolvedError}
				errorId={islandErrorId}
			/>
		</div>
	);
}

function SchemaMarkupNode({ field, errorMessage }: { field: SchemaFieldDefinition; errorMessage?: string }) {
	const htmlRef = useRef<HTMLDivElement | null>(null);
	const resolvedError = errorMessage || field.error || '';

	useEffect(() => {
		const el = htmlRef.current;
		if (el && typeof window !== 'undefined') {
			window.ReactWorkspaceRuntime?.mountIslands(el);
		}
	}, [field.html]);

	return (
		<div
			className={cn(
				field.noWrap ? 'space-y-2' : 'space-y-2 rounded-lg border border-border/70 bg-muted/15 p-3',
				resolvedError && 'border-destructive/40 bg-destructive/4'
			)}
			data-field-name={field.name}
			data-field-error={resolvedError ? '1' : undefined}
		>
			{!field.noWrap ? <SchemaFieldHeader field={field} className="border-b border-border pb-2" /> : null}
			<div
				ref={htmlRef}
				className="text-xs text-foreground"
				onClick={(e) => {
					const copyVal = (e.target as HTMLElement | null)
						?.closest<HTMLElement>('[data-copy-text]')
						?.getAttribute('data-copy-text');
					if (copyVal) {
						void navigator.clipboard?.writeText(copyVal);
					}
				}}
				dangerouslySetInnerHTML={{ __html: field.html || '' }}
			/>
			<SchemaFieldFooter notes={field.notes} error={resolvedError} />
		</div>
	);
}

/* ============================================================================
 * Section & Inline Tab Group Containers
 * ========================================================================== */

function SchemaSectionNode({
	field,
	renderFieldsGrid,
	errors,
}: {
	field: SchemaFieldDefinition;
	renderFieldsGrid: (items: SchemaFieldDefinition[]) => React.ReactNode;
	errors: Record<string, string>;
}) {
	const childFields = Array.isArray(field.fields)
		? field.fields
		: field.fields && typeof field.fields === 'object'
			? Object.entries(field.fields).map(([name, def]) => ({ ...def, name: def.name || name }))
			: Array.isArray(field.children)
				? field.children
				: [];
	const errorCount = useMemo(() => countNestedErrors(childFields, errors), [childFields, errors]);
	const [collapsed, setCollapsed] = useState<boolean>(() =>
		errorCount > 0 ? false : Boolean(field.collapsed)
	);
	const sectionBodyId = useId().replace(/:/g, '');

	// Automatically expand collapsed section when a nested field fails validation
	useEffect(() => {
		if (errorCount > 0 && collapsed) {
			setCollapsed(false);
		}
	}, [errorCount, collapsed]);

	if (field.hideWrap) {
		return <div className="col-span-12">{renderFieldsGrid(childFields)}</div>;
	}

	return (
		<Card className="overflow-hidden border-border shadow-2xs" data-field-name={field.name}>
			{field.label ? (
				<button
					type="button"
					aria-expanded={!collapsed}
					aria-controls={`rw-sec-body-${sectionBodyId}`}
					onClick={() => setCollapsed((prev) => !prev)}
					className="flex w-full items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/50 cursor-pointer"
				>
					<div className="min-w-0">
						<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
							{field.icon ? (
								<DynamicIcon name={field.icon} className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
							) : null}
							<span>{field.label}</span>
							{errorCount > 0 ? <Badge variant="destructive">{errorCount}</Badge> : null}
						</div>
						{field.description ? (
							<p className="mt-0.5 text-xs text-muted-foreground">{field.description}</p>
						) : null}
					</div>
					<DynamicIcon
						name={collapsed ? 'chevron-down' : 'chevron-up'}
						className="size-4 text-muted-foreground shrink-0"
						aria-hidden="true"
					/>
				</button>
			) : null}
			<CardContent id={`rw-sec-body-${sectionBodyId}`} className={cn('p-4', collapsed && 'hidden')}>
				{renderFieldsGrid(childFields)}
			</CardContent>
		</Card>
	);
}

function resolveTabPaneSlot(
	tabSlots: SchemaFormProps['tabSlots'],
	pane: SchemaTabPaneDefinition
): { before?: React.ReactNode; after?: React.ReactNode } | undefined {
	if (!tabSlots) {
		return undefined;
	}
	if (pane.id && tabSlots[pane.id]) {
		return tabSlots[pane.id];
	}
	if (pane.name && tabSlots[pane.name]) {
		return tabSlots[pane.name];
	}
	const tailMatch = pane.id?.match(/(?:^|_)tab_([a-z0-9_]+)$/i);
	if (tailMatch && tailMatch[1]) {
		const slug = tailMatch[1].toLowerCase();
		if (tabSlots[slug]) {
			return tabSlots[slug];
		}
	}
	const labelSlug = (pane.label || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	if (labelSlug && tabSlots[labelSlug]) {
		return tabSlots[labelSlug];
	}
	return undefined;
}

function SchemaTabsGroupNode({
	field,
	values,
	errors,
	scopePrefix,
	tabSlots,
	renderFieldsGrid,
}: {
	field: SchemaFieldDefinition;
	values: Record<string, unknown>;
	errors: Record<string, string>;
	scopePrefix?: string;
	tabSlots?: SchemaFormProps['tabSlots'];
	renderFieldsGrid: (items: SchemaFieldDefinition[]) => React.ReactNode;
}) {
	const allPanes = useMemo(() => field.tabs ?? [], [field.tabs]);
	const visiblePanes = useMemo(
		() =>
			allPanes.filter((pane) => {
				if (!resolveFieldState(pane, values, scopePrefix).visible) {
					return false;
				}
				const slot = resolveTabPaneSlot(tabSlots, pane);
				if (slot?.before || slot?.after) {
					return true;
				}
				return (
					(pane.fields || []).length === 0 ||
					hasVisibleNonInlineFields(pane.fields, values, errors, scopePrefix)
				);
			}),
		[allPanes, values, errors, scopePrefix, tabSlots]
	);

	const tabStorageKey = useMemo(() => {
		if (typeof window === 'undefined') {
			return '';
		}
		return `rw_tab_group:${window.location.pathname}${window.location.search}:${scopePrefix || ''}:${field.id || field.name || 'tabs'}`;
	}, [scopePrefix, field.id, field.name]);

	const [activeTabId, setActiveTabId] = useState<string>(() => {
		if (tabStorageKey && typeof window !== 'undefined') {
			try {
				const saved = window.sessionStorage.getItem(tabStorageKey);
				const savedPane = saved ? allPanes.find((p) => p.id === saved) : undefined;
				if (savedPane && !savedPane.confirmDelete) {
					return savedPane.id;
				}
			} catch {
				// Ignore storage access errors
			}
		}
		return field.activeTab || visiblePanes[0]?.id || allPanes[0]?.id || '';
	});

	const updateActiveTab = useCallback(
		(nextTabId: string, skipPersist = false) => {
			setActiveTabId(nextTabId);
			if (!skipPersist && tabStorageKey && typeof window !== 'undefined') {
				try {
					window.sessionStorage.setItem(tabStorageKey, nextTabId);
				} catch {
					// Ignore storage access errors
				}
			}
		},
		[tabStorageKey]
	);

	const resolvedActiveId = useMemo(() => {
		if (visiblePanes.some((p) => p.id === activeTabId)) {
			return activeTabId;
		}
		return visiblePanes[0]?.id || '';
	}, [visiblePanes, activeTabId]);

	// Automatically switch to the first visible pane containing validation errors only when errors change
	const errorSig = useMemo(() => JSON.stringify(errors || {}), [errors]);
	const lastErrorSigRef = useRef<string>('');
	useEffect(() => {
		if (errorSig === lastErrorSigRef.current) {
			return;
		}
		lastErrorSigRef.current = errorSig;
		if (visiblePanes.length <= 1 || Object.keys(errors || {}).length === 0) {
			return;
		}
		const activePane = visiblePanes.find((p) => p.id === resolvedActiveId);
		const activeErrors = activePane ? countNestedErrors(activePane.fields || [], errors) : 0;
		if (activeErrors > 0) {
			return;
		}
		const firstErrorPane = visiblePanes.find(
			(p) => countNestedErrors(p.fields || [], errors) > 0
		);
		if (firstErrorPane && firstErrorPane.id !== activeTabId) {
			updateActiveTab(firstErrorPane.id);
		}
	}, [errorSig, errors, visiblePanes, resolvedActiveId, activeTabId, updateActiveTab]);

	const rawVariant = String(field.variant || 'line').toLowerCase();
	const isSegmented = rawVariant === 'segmented' || rawVariant === 'pills';
	const isVertical = rawVariant === 'vertical';
	const groupDomId = useId().replace(/:/g, '');
	const resolvedVariant = isVertical ? 'vertical' : isSegmented ? 'segmented' : 'line';

	return (
		<div className="space-y-3" data-field-name={field.name}>
			{field.label ? (
				<div className="text-xs font-semibold text-foreground">{field.label}</div>
			) : null}

			<div
				className={cn(
					isVertical ? 'grid grid-cols-1 gap-6 md:grid-cols-12' : 'space-y-3.5'
				)}
				data-variant={resolvedVariant}
			>
				<div
					role="tablist"
					aria-label={field.label || 'Sections'}
					aria-orientation={isVertical ? 'vertical' : 'horizontal'}
					data-rw-tablist=""
					data-variant={resolvedVariant}
					onKeyDown={(e) => navigateTablistByKey(e, isVertical ? 'vertical' : 'horizontal')}
					className={cn(
						isVertical
							? 'flex flex-col gap-1 border-border md:col-span-3 md:border-r md:pr-4'
							: isSegmented
								? 'inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-muted/50 p-1'
								: 'flex items-center gap-1 border-b border-border'
					)}
				>
					{visiblePanes.map((pane) => {
						const isActive = pane.id === resolvedActiveId;
						const errCount = countNestedErrors(pane.fields || [], errors);
						const tabBtnId = `rw-tab-${groupDomId}-${pane.id}`;
						const tabPanelId = `rw-panel-${groupDomId}-${pane.id}`;
						return (
							<button
								key={pane.id}
								id={tabBtnId}
								type="button"
								role="tab"
								aria-selected={isActive}
								aria-controls={tabPanelId}
								tabIndex={isActive ? 0 : -1}
								data-rw-confirm-delete-tab={pane.confirmDelete ? '1' : undefined}
								style={
									pane.confirmDelete
										? ({ '--tab-accent': 'var(--destructive)' } as React.CSSProperties)
										: undefined
								}
								onClick={(e) => {
									updateActiveTab(pane.id, Boolean(pane.confirmDelete));
									scrollTabIntoView(e.currentTarget);
								}}
								className={cn(
									'inline-flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									isSegmented || isVertical
										? cn(
												'rounded-md px-3 py-1.5',
												isVertical && 'w-full justify-start text-left',
												isActive
													? pane.confirmDelete
														? 'bg-background text-destructive shadow-2xs'
														: 'bg-background text-foreground shadow-2xs'
													: pane.confirmDelete
														? 'text-muted-foreground hover:text-destructive'
														: 'text-muted-foreground hover:text-foreground'
											)
										: cn(
												'px-3.5 py-2.5',
												isActive
													? pane.confirmDelete
														? 'text-destructive'
														: 'text-foreground'
													: pane.confirmDelete
														? 'text-muted-foreground hover:text-destructive'
														: 'text-muted-foreground hover:text-foreground'
											),
									errCount > 0 && 'text-destructive'
								)}
							>
								{pane.icon ? <DynamicIcon name={pane.icon} className="size-3.5 shrink-0" /> : null}
								<span>{pane.label}</span>
								{pane.badge !== undefined && pane.badge !== null && pane.badge !== '' ? (
									<Badge variant="secondary" mono>
										{pane.badge}
									</Badge>
								) : null}
								{errCount > 0 ? <Badge variant="destructive">{errCount}</Badge> : null}
							</button>
						);
					})}
				</div>

				<div className={cn('min-w-0', isVertical && 'md:col-span-9')}>
					{allPanes.map((pane) => {
						const isVisible = resolveFieldState(pane, values, scopePrefix).visible;
						const isActive = isVisible && pane.id === resolvedActiveId;
						const tabBtnId = `rw-tab-${groupDomId}-${pane.id}`;
						const tabPanelId = `rw-panel-${groupDomId}-${pane.id}`;
						const paneSlot = resolveTabPaneSlot(tabSlots, pane);
						return (
							<SearchableTabPanel
								key={pane.id}
								id={tabPanelId}
								labelledBy={tabBtnId}
								isActive={isActive}
								searchableWhenHidden={isVisible}
								onRevealMatch={() => updateActiveTab(pane.id)}
							>
								<div className="space-y-3.5">
									{paneSlot?.before}
									{pane.description ? (
										<p className="text-xs text-muted-foreground">{pane.description}</p>
									) : null}
									{renderFieldsGrid(pane.fields || [])}
									{paneSlot?.after}
									{pane.notes ? (
										<p className="text-[11px] text-muted-foreground/80">{pane.notes}</p>
									) : null}
								</div>
							</SearchableTabPanel>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/* ============================================================================
 * SchemaForm (Valibot Schema & State Engine for Root Forms, Nested Fragments & Blocks)
 * ========================================================================== */

export const SchemaForm: React.FC<SchemaFormProps> = (props) => {
	const instanceId = useId();
	const containerRef = useRef<HTMLElement | null>(null);
	const parentCtx = useSchemaFormContext(containerRef);

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
			presenceKey: props.presenceKey ?? null,
			presenceEndpoint: props.presenceEndpoint ?? null,
			csrf: props.csrf ?? null,
			hiddenInputs: props.hiddenInputs ?? [],
			tabs: props.tabs ?? [],
			fields: normalizedFields,
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
	const prevSeededValuesRef = useRef<Record<string, unknown>>(initialValues);
	const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
	const [isDirtyLocal, setIsDirtyLocal] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isSubmittingRef = useRef(false);
	const setSubmittingState = useCallback((next: boolean) => {
		isSubmittingRef.current = next;
		setIsSubmitting(next);
	}, []);

	const registeredFragmentsRef = useRef<Map<string, RegisteredFragmentSpec>>(new Map());
	const registeredBlocksRef = useRef<Map<string, RegisteredBlockFieldSpec>>(new Map());

	const setParentValuesBatch = parentCtx?.setValuesBatch;
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
		if (isAttachedFragment && setParentValuesBatch) {
			const changedKeys: Record<string, unknown> = {};
			let hasExternalDelta = false;
			for (const [k, v] of Object.entries(nextSeeded)) {
				if (prevSeeded[k] !== v) {
					changedKeys[k] = v;
					hasExternalDelta = true;
				}
			}
			if (hasExternalDelta) {
				setParentValuesBatch(changedKeys, true);
			} else {
				setParentValuesBatch(nextSeeded, false);
			}
		} else {
			setLocalValues((prev) => {
				let changed = false;
				const merged = { ...prev };
				for (const [k, v] of Object.entries(nextSeeded)) {
					if (merged[k] === undefined || prevSeeded[k] !== v) {
						if (merged[k] !== v) {
							merged[k] = v;
							changed = true;
						}
					}
				}
				return changed ? merged : prev;
			});
		}
	}, [schema, props.values, isAttachedFragment, setParentValuesBatch]);

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
	const fieldsByName = useMemo<ReadonlyMap<string, SchemaFieldDefinition>>(() => {
		const map = new Map<string, SchemaFieldDefinition>();
		if (parentCtx?.fieldsByName) {
			for (const [k, v] of parentCtx.fieldsByName.entries()) {
				map.set(k, v);
			}
		}
		collectFieldsIntoMap(rootFields, map);
		for (const tab of topTabs) {
			collectFieldsIntoMap(tab.fields, map);
		}
		return map;
	}, [parentCtx?.fieldsByName, rootFields, topTabs]);
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
	useEffect(() => {
		if (schema.isFragment || typeof window === 'undefined') {
			return;
		}
		window.dispatchEvent(
			new CustomEvent('rw:schema-form-dirty', {
				detail: {
					formId: schema.id,
					isDirty: Boolean(isDirty),
					dirtyGuard: Boolean(schema.dirtyGuard),
				},
			})
		);
		return () => {
			window.dispatchEvent(
				new CustomEvent('rw:schema-form-dirty', {
					detail: { formId: schema.id, isDirty: false, dirtyGuard: false },
				})
			);
		};
	}, [schema.isFragment, schema.id, schema.dirtyGuard, isDirty]);

	useEffect(() => {
		if (schema.isFragment || submits.length === 0 || typeof window === 'undefined') {
			return;
		}
		const handleSaveShortcut = (e: KeyboardEvent) => {
			if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 's') {
				return;
			}
			const activeEl = document.activeElement as HTMLElement | null;
			if (activeEl?.closest('dialog[open]')) {
				return;
			}
			const formEl = containerRef.current;
			if (!(formEl instanceof HTMLFormElement) || !formEl.isConnected) {
				return;
			}
			e.preventDefault();
			const primarySubmitBtn = formEl.querySelector<HTMLButtonElement>(
				'button[type="submit"]:not([disabled])'
			);
			if (typeof formEl.requestSubmit === 'function') {
				formEl.requestSubmit(primarySubmitBtn || undefined);
			} else {
				formEl.submit();
			}
		};
		window.addEventListener('keydown', handleSaveShortcut);
		return () => window.removeEventListener('keydown', handleSaveShortcut);
	}, [schema.isFragment, submits.length]);

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
			if (isAttachedFragment && parentCtx) {
				parentCtx.setValuesBatch(patch, markDirty);
				return;
			}
			setLocalValues((prev) => {
				let changed = false;
				const next = { ...prev };
				for (const [k, v] of Object.entries(patch)) {
					if (next[k] === undefined || markDirty) {
						next[k] = v;
						changed = true;
					}
				}
				if (markDirty && changed) {
					setIsDirtyLocal(true);
				}
				return changed ? next : prev;
			});
		},
		[isAttachedFragment, parentCtx]
	);

	const setFieldError = useCallback(
		(name: string, message: string | null) => {
			if (isAttachedFragment && parentCtx) {
				parentCtx.setFieldError(name, message);
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
		[isAttachedFragment, parentCtx]
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
		(name: string, nextVal: unknown, fieldDef?: SchemaFieldDefinition, fieldScopePrefix?: string) => {
			if (!name) {
				return;
			}
			if (isAttachedFragment && parentCtx) {
				parentCtx.updateFieldValue(name, nextVal, fieldDef, fieldScopePrefix || scopePrefix);
				props.onChange?.({ ...parentCtx.values, [name]: nextVal });
				return;
			}
			setIsDirtyLocal(true);
			setLocalValues((prev) => {
				const next = { ...prev, [name]: nextVal };
				const ownerFieldName = fieldDef?.name || name;
				if (fieldDef && (props.validateOnChange || clientErrors[ownerFieldName] || clientErrors[name])) {
					const ownerVal = ownerFieldName in next ? next[ownerFieldName] : undefined;
					const err = validateFieldWithValibot(
						fieldDef,
						ownerVal,
						next,
						fieldScopePrefix || scopePrefix
					);
					setFieldError(ownerFieldName, err);
					if (name !== ownerFieldName && clientErrors[name]) {
						setFieldError(name, null);
					}
				} else if (clientErrors[name]) {
					setFieldError(name, null);
				}
				// Clear any repeater subfield errors for this field when edited
				const repeaterPrefix = `${name}[`;
				const hasSubErr = Object.keys(clientErrors).some((k) => k.startsWith(repeaterPrefix));
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
				props.onChange?.(next);
				return next;
			});
		},
		[isAttachedFragment, parentCtx, scopePrefix, props.validateOnChange, props.onChange, clientErrors, setFieldError]
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
				(submitter?.name && /delete|discard|restore_revision/i.test(submitter.name)) ||
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

	const handleSettingFieldChange = useCallback(
		(targetField: SchemaFieldDefinition, val: unknown) => {
			updateFieldValue(targetField.name, val, targetField, scopePrefix);
			if (typeof window !== 'undefined' && targetField.name) {
				window.requestAnimationFrame(() => {
					const root = containerRef.current;
					const hiddenControl = root?.querySelector<HTMLElement>(
						`[data-field-name="${CSS.escape(targetField.name)}"] input, [data-field-name="${CSS.escape(targetField.name)}"] select, [data-field-name="${CSS.escape(targetField.name)}"] textarea`
					);
					if (hiddenControl) {
						hiddenControl.dispatchEvent(new Event('input', { bubbles: true }));
						hiddenControl.dispatchEvent(new Event('change', { bubbles: true }));
					}
				});
			}
		},
		[updateFieldValue, scopePrefix]
	);

	const resolveFieldAdornment = (fieldName?: string): SchemaFieldAdornment | undefined => {
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
	};

	const renderFieldNode = (field: SchemaFieldDefinition, idx: number): React.ReactNode => {
		const fieldState = resolveFieldState(field, conditionValues, scopePrefix);
		if (!fieldState.visible) {
			return null;
		}

		const isDynamicallyRequired = fieldState.required;
		const isDynamicallyDisabled = fieldState.disabled;
		const spanClass = resolveGridSpanClass(field.width ?? field.columnWidth, field.colSpan);
		const key = field.id || field.name || `node_${idx}`;

		if (field.kind === 'tabs' || (Array.isArray(field.tabs) && field.tabs.length > 0)) {
			return (
				<div key={key} className={spanClass}>
					<SchemaTabsGroupNode
						field={field}
						values={conditionValues}
						errors={errors}
						scopePrefix={scopePrefix}
						tabSlots={props.tabSlots}
						renderFieldsGrid={renderFieldsGrid}
					/>
				</div>
			);
		}

		if (
			field.kind === 'section' ||
			(Array.isArray(field.fields) && field.fields.length > 0) ||
			(field.fields && typeof field.fields === 'object' && Object.keys(field.fields).length > 0) ||
			(Array.isArray(field.children) && field.children.length > 0)
		) {
			return (
				<div key={key} className={spanClass}>
					<SchemaSectionNode
						field={field}
						renderFieldsGrid={renderFieldsGrid}
						errors={errors}
					/>
				</div>
			);
		}

		if (field.kind === 'island' && field.component) {
			return (
				<div key={key} className={spanClass}>
					<SchemaIslandNode
						field={field}
						errorMessage={field.name ? errors[field.name] : undefined}
						formValues={values}
						conditionValues={conditionValues}
						allErrors={errors}
						isDynamicallyRequired={isDynamicallyRequired}
						isDynamicallyDisabled={isDynamicallyDisabled}
						scopePrefix={scopePrefix}
						fieldsByName={fieldsByName}
						adornment={resolveFieldAdornment(field.name)}
						onSettingFieldChange={handleSettingFieldChange}
					/>
				</div>
			);
		}

		if (field.kind === 'markup') {
			return (
				<div key={key} className={spanClass}>
					<SchemaMarkupNode field={field} errorMessage={field.name ? errors[field.name] : undefined} />
				</div>
			);
		}

		const resolvedVal = field.name ? resolveScopedFieldValue(values, field.name, scopePrefix) : undefined;
		const isHiddenInlineSetting = Boolean(field.inlineHidden && !(field.name && errors[field.name]));

		return (
			<div
				key={key}
				className={isHiddenInlineSetting ? 'hidden' : spanClass}
				aria-hidden={isHiddenInlineSetting ? 'true' : undefined}
			>
				<SchemaField
					field={isHiddenInlineSetting ? { ...field, inlineSettings: undefined } : field}
					value={field.name in values ? values[field.name] : resolvedVal !== '' ? resolvedVal : undefined}
					formValues={values}
					conditionValues={conditionValues}
					allErrors={errors}
					errorMessage={field.name ? errors[field.name] : undefined}
					isDynamicallyRequired={isDynamicallyRequired}
					isDynamicallyDisabled={isDynamicallyDisabled}
					scopePrefix={scopePrefix}
					fieldsByName={fieldsByName}
					suppressInlineSettings={isHiddenInlineSetting}
					adornment={isHiddenInlineSetting ? undefined : resolveFieldAdornment(field.name)}
					onChange={(val) => updateFieldValue(field.name, val, field, scopePrefix)}
					onNamedChange={(targetName, val) => updateFieldValue(targetName, val, field, scopePrefix)}
					onSettingFieldChange={handleSettingFieldChange}
				/>
			</div>
		);
	};

	function renderFieldsGrid(items: SchemaFieldDefinition[]): React.ReactNode {
		return (
			<div className={cn('grid grid-cols-12', schema.isFragment ? 'gap-3.5' : 'gap-4')}>
				{items.map((field, idx) => renderFieldNode(field, idx))}
			</div>
		);
	}

	const renderSubmitButtons = (isHeaderClone = false) => {
		const visibleSubmits = submits.filter(
			(sub) =>
				(!isHeaderClone || sub.header) &&
				resolveFieldState(sub, values, scopePrefix).visible
		);
		if (visibleSubmits.length === 0) {
			return null;
		}
		return (
			<div className="flex flex-wrap items-center gap-2">
				{visibleSubmits.map((sub) => {
					const subState = resolveFieldState(sub, values, scopePrefix);
					const dropdownItems: InputfieldSubmitDropdownItem[] = (sub.actions || []).map((a) => ({
						type: (a.type as 'value' | 'link' | undefined) ?? 'value',
						value: a.value,
						label: a.label,
						icon: a.icon,
					}));
					return (
						<SubmitField
							key={`${sub.id}_${isHeaderClone ? 'head' : 'foot'}`}
							controlType="submit"
							id={isHeaderClone ? `${sub.id}_head` : sub.id}
							name={sub.name}
							formId={isHeaderClone ? schema.id : undefined}
							value={sub.label}
							disabled={subState.disabled || isSubmitting}
							submit={{
								type: 'submit',
								value: sub.label,
								label: sub.label,
								icon: sub.icon,
								danger: sub.danger,
								small: isHeaderClone ? true : undefined,
								header: sub.header,
								dropdownInputName: '_action_value',
								dropdownSubmit: true,
								dropdownRequired: false,
								dropdownItems,
							}}
						/>
					);
				})}
			</div>
		);
	};

	const RuntimeEditPresenceBanner =
		typeof window !== 'undefined'
			? window.ReactWorkspaceRuntime?.Layout?.EditPresenceBanner
			: undefined;
	const resolvedPresenceKey = !schema.isFragment
		? (props.presenceKey ?? schema.presenceKey ?? null)
		: null;
	const resolvedPresenceEndpoint = !schema.isFragment
		? (props.presenceEndpoint ?? schema.presenceEndpoint ?? null)
		: null;
	const useCardSurface =
		!schema.isFragment &&
		(props.card === true || props.surface === 'card' || schema.surface === 'card');
	const confirmDeleteFieldNames = React.useMemo(() => {
		const names = new Set<string>(['delete_page', '_wb_delete_confirm', '_we_delete_confirm']);
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
	}, [schema.fields, schema.tabs]);
	const hasConfirmedDelete = confirmDeleteFieldNames.some((name) => {
		const val = values[name];
		return Boolean(val && val !== '0' && val !== 'false');
	});

	const fieldsAndTabsContent = (
		<>
			{topTabs.length > 0 ? (
				<div className={schema.isFragment ? 'space-y-3.5' : 'space-y-5'}>
					{visibleTopTabs.length > 1 ? (
						<div
							role="tablist"
							aria-label={schema.name || 'Sections'}
							data-rw-tablist=""
							data-variant="line"
							onKeyDown={(e) => navigateTablistByKey(e, 'horizontal')}
							className="flex items-center gap-1 border-b border-border"
						>
							{visibleTopTabs.map((tab) => {
								const isActive = tab.id === activeTopTabId;
								const errCount = countNestedErrors(tab.fields || [], errors);
								const topTabBtnId = `rw-toptab-${instanceId.replace(/:/g, '')}-${tab.id}`;
								return (
									<button
										key={tab.id}
										id={topTabBtnId}
										type="button"
										role="tab"
										aria-selected={isActive}
										tabIndex={isActive ? 0 : -1}
										data-rw-confirm-delete-tab={tab.confirmDelete ? '1' : undefined}
										style={
											tab.confirmDelete
												? ({ '--tab-accent': 'var(--destructive)' } as React.CSSProperties)
												: undefined
										}
										onClick={(e) => {
											setActiveTopTabId(tab.id);
											scrollTabIntoView(e.currentTarget);
										}}
										className={cn(
											'inline-flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
											schema.isFragment ? 'px-3 py-2' : 'px-4 py-2.5',
											isActive
												? tab.confirmDelete
													? 'text-destructive'
													: 'text-foreground'
												: tab.confirmDelete
													? 'text-muted-foreground hover:text-destructive'
													: 'text-muted-foreground hover:text-foreground',
											errCount > 0 && 'text-destructive'
										)}
									>
										{tab.icon ? <DynamicIcon name={tab.icon} className="size-3.5 shrink-0" /> : null}
										<span>{tab.label}</span>
										{tab.badge !== undefined && tab.badge !== null && tab.badge !== '' ? (
											<Badge variant="secondary" mono>
												{tab.badge}
											</Badge>
										) : null}
										{errCount > 0 ? <Badge variant="destructive">{errCount}</Badge> : null}
									</button>
								);
							})}
						</div>
					) : null}

					{topTabs.map((tab) => {
						const isVisible = resolveFieldState(tab, values, scopePrefix).visible;
						const isActive = isVisible && tab.id === activeTopTabId;
						const topTabBtnId = `rw-toptab-${instanceId.replace(/:/g, '')}-${tab.id}`;
						const tabSlot = resolveTabPaneSlot(props.tabSlots, tab);
						return (
							<SearchableTabPanel
								key={tab.id}
								id={tab.id}
								labelledBy={topTabBtnId}
								isActive={isActive}
								searchableWhenHidden={isVisible}
								onRevealMatch={() => setActiveTopTabId(tab.id)}
							>
								<div className={schema.isFragment ? 'space-y-3.5' : 'space-y-4'}>
									{tabSlot?.before}
									{tab.description ? (
										<p className="text-xs text-muted-foreground">{tab.description}</p>
									) : null}
									{renderFieldsGrid(tab.fields || [])}
									{tabSlot?.after}
									{tab.notes ? (
										<p className="text-[11px] text-muted-foreground/80">{tab.notes}</p>
									) : null}
								</div>
							</SearchableTabPanel>
						);
					})}
				</div>
			) : null}

			{rootFields.length > 0 ? (
				isMultiStep ? (
					<div className="space-y-4">
						<div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
							{steps.map((step, sIdx) => {
								const isCurrent = step.index === activeStepIndex;
								const stepErrCount = countNestedErrors(step.fields, errors);
								return (
									<button
										key={step.index}
										type="button"
										onClick={() => {
											if (step.index > activeStepIndex && props.validateOnSubmit !== false) {
												const stepCheck = validateStep(activeStepIndex);
												if (!stepCheck.valid) {
													return;
												}
											}
											setActiveStepIndex(step.index);
										}}
										className={cn(
											'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
											isCurrent
												? 'bg-primary text-primary-foreground'
												: 'bg-muted text-muted-foreground hover:text-foreground'
										)}
									>
										<span className="font-mono text-[11px]">{sIdx + 1}.</span>
										<span>{step.title}</span>
										{stepErrCount > 0 ? <Badge variant="destructive">{stepErrCount}</Badge> : null}
									</button>
								);
							})}
						</div>

						{steps.map((step) => (
							<div
								key={step.index}
								className={cn(step.index !== activeStepIndex && 'hidden')}
							>
								{renderFieldsGrid(step.fields)}
							</div>
						))}

						<div className="flex items-center justify-between pt-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={activeStepIndex <= (steps[0]?.index ?? 0)}
								onClick={() => {
									const curPos = steps.findIndex((s) => s.index === activeStepIndex);
									const prevStep = curPos > 0 ? steps[curPos - 1] : undefined;
									if (prevStep) {
										setActiveStepIndex(prevStep.index);
									}
								}}
							>
								{t('form.previousStep', 'Previous')}
							</Button>
							{activeStepIndex < (steps[steps.length - 1]?.index ?? -1) ? (
								<Button
									type="button"
									size="sm"
									onClick={() => {
										if (props.validateOnSubmit !== false) {
											const stepCheck = validateStep(activeStepIndex);
											if (!stepCheck.valid) {
												return;
											}
										}
										const curPos = steps.findIndex((s) => s.index === activeStepIndex);
										const nextStep = curPos >= 0 ? steps[curPos + 1] : undefined;
										if (nextStep) {
											setActiveStepIndex(nextStep.index);
										}
									}}
								>
									{t('form.nextStep', 'Next Step')}
								</Button>
							) : null}
						</div>
					</div>
				) : (
					renderFieldsGrid(rootFields)
				)
			) : null}
		</>
	);

	const bodyContent = (
		<>
			{resolvedPresenceKey && RuntimeEditPresenceBanner ? (
				<RuntimeEditPresenceBanner
					resourceKey={resolvedPresenceKey}
					endpoint={resolvedPresenceEndpoint}
					dirty={Boolean(isDirty)}
				/>
			) : null}

			{schema.csrf ? (
				<input type="hidden" name={schema.csrf.name} value={schema.csrf.value} />
			) : null}

			{(schema.hiddenInputs || []).map((h, i) => (
				<input
					key={`${h.name}_${i}`}
					type="hidden"
					id={h.id || undefined}
					name={h.name}
					value={h.value}
				/>
			))}

			{useCardSurface ? (
				<Card data-rw-form-card="" className="p-5 space-y-5">
					{fieldsAndTabsContent}
				</Card>
			) : (
				fieldsAndTabsContent
			)}

			{!schema.isFragment && (submits.length > 0 || (props.onSubmit && props.submitLabel)) ? (
				<div
					data-rw-form-actions=""
					className={cn(
						'flex flex-wrap items-center justify-between gap-3',
						!useCardSurface && 'border-t border-border pt-4'
					)}
				>
					{submits.length > 0 ? (
						renderSubmitButtons(false)
					) : props.onSubmit && props.submitLabel ? (
						<Button type="submit" icon="save" disabled={isSubmitting}>
							{props.submitLabel}
						</Button>
					) : null}
				</div>
			) : null}

			{headButtonsTarget && submits.some((s) => s.header)
				? createPortal(renderSubmitButtons(true), headButtonsTarget)
				: null}
		</>
	);

	const wrappedContent = (
		<SchemaFormContext.Provider value={contextValue}>
			{bodyContent}
		</SchemaFormContext.Provider>
	);

	if (schema.isFragment) {
		return (
			<div
				ref={(el) => {
					containerRef.current = el;
				}}
				className={cn('space-y-4', props.className)}
				data-rw-schema-fragment=""
				data-rw-scope-prefix={scopePrefix || undefined}
			>
				{wrappedContent}
			</div>
		);
	}

	const safeFormAction = sanitizeSameOriginUrl(schema.action || './') || './';

	return (
		<form
			ref={(el) => {
				containerRef.current = el;
			}}
			id={schema.id}
			name={schema.name}
			action={safeFormAction}
			method={schema.method || 'post'}
			encType={schema.encType || undefined}
			noValidate={props.validateOnSubmit !== false}
			onSubmit={(e) => {
				const submitter = (e.nativeEvent as SubmitEvent).submitter as
					| HTMLButtonElement
					| HTMLInputElement
					| null;
				const isBypassValidation = Boolean(
					hasConfirmedDelete ||
						(submitter?.name && /delete|discard|restore_revision/i.test(submitter.name)) ||
						submitter?.hasAttribute('formnovalidate') ||
						e.currentTarget.getAttribute('data-rw-skip-validate') === '1'
				);
				if (props.validateOnSubmit !== false && !isBypassValidation) {
					const check = validateAll();
					if (!check.valid) {
						setSubmittingState(false);
						if (visibleTopTabs.length > 1) {
							const activeTab = visibleTopTabs.find((tab) => tab.id === activeTopTabId);
							const activeTabErrors = activeTab ? countNestedErrors(activeTab.fields || [], check.errors) : 0;
							if (activeTabErrors === 0) {
								const firstTabWithErrors = visibleTopTabs.find(
									(tab) => countNestedErrors(tab.fields || [], check.errors) > 0
								);
								if (firstTabWithErrors) {
									setActiveTopTabId(firstTabWithErrors.id);
								}
							}
						}
						e.preventDefault();
						e.stopPropagation();
						return;
					}
				}
				setSubmittingState(true);
				if (props.onSubmit) {
					e.preventDefault();
					let pendingSubmit: unknown;
					try {
						pendingSubmit = props.onSubmit(values);
					} catch (submitErr) {
						setSubmittingState(false);
						throw submitErr;
					}
					if (pendingSubmit && typeof (pendingSubmit as Promise<unknown>).finally === 'function') {
						void (pendingSubmit as Promise<unknown>).finally(() => {
							setSubmittingState(false);
						});
					} else {
						setSubmittingState(false);
					}
					return;
				}
				const inertiaRuntime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime?.Inertia : undefined;
				const inertiaRouter = inertiaRuntime?.router;
				const hasInertiaApp =
					typeof inertiaRuntime?.isInertiaAppActive === 'function'
						? inertiaRuntime.isInertiaAppActive()
						: typeof document !== 'undefined' && Boolean(document.getElementById('app')?.getAttribute('data-page'));
				if (inertiaRouter && hasInertiaApp) {
					e.preventDefault();
					const formEl = e.currentTarget;
					const formData = new FormData(formEl);
					if (submitter && submitter.name && !formData.has(submitter.name)) {
						formData.append(submitter.name, submitter.value || '1');
					} else if (!submitter && submits[0]?.name && !formData.has(submits[0].name)) {
						formData.append(submits[0].name, submits[0].label || '1');
					}
					const method = (schema.method || 'post').toLowerCase();
					const rawAction = safeFormAction;
					const targetUrl =
						rawAction === './' || rawAction === ''
							? window.location.pathname + window.location.search
							: rawAction;
					const resetSubmitting = () => {
						setSubmittingState(false);
					};
					const handleSavedSuccess = () => {
						setIsDirtyLocal(false);
						if (resolvedPresenceKey && typeof window !== 'undefined') {
							window.dispatchEvent(
								new CustomEvent('rw:schema-form-saved', {
									detail: { resourceKey: resolvedPresenceKey },
								})
							);
						}
					};
					if (method === 'get') {
						const params: Record<string, string> = {};
						formData.forEach((v, k) => {
							if (typeof v === 'string') {
								params[k] = v;
							}
						});
						inertiaRouter.get(targetUrl, params, {
							preserveScroll: true,
							preserveState: false,
							onSuccess: handleSavedSuccess,
							onFinish: resetSubmitting,
							onError: resetSubmitting,
							onCancel: resetSubmitting,
						});
					} else {
						inertiaRouter.post(targetUrl, formData, {
							forceFormData: true,
							preserveScroll: true,
							preserveState: false,
							onSuccess: handleSavedSuccess,
							onFinish: resetSubmitting,
							onError: resetSubmitting,
							onCancel: resetSubmitting,
						});
					}
					return;
				}
				if (typeof window !== 'undefined') {
					window.queueMicrotask(() => {
						if (e.defaultPrevented) {
							setSubmittingState(false);
						}
					});
				}
			}}
			className={cn(useCardSurface ? 'space-y-4' : 'space-y-5', props.className)}
			data-rw-schema-form={schema.id}
		>
			{wrappedContent}
		</form>
	);
};

const schemaMediaCustomFieldRenderer: MediaCustomFieldRenderer = ({
	field,
	value,
	values,
	onChange,
	disabled,
}) => (
	<SchemaField
		field={disabled ? { ...field, disabled: true, readOnly: true } : field}
		value={value}
		formValues={values}
		onChange={(nextVal) => onChange(field.name, nextVal)}
		onNamedChange={(targetName, nextVal) => onChange(targetName, nextVal)}
	/>
);

if (typeof window !== 'undefined') {
	window.ReactWorkspaceRuntime?.__setMediaCustomFieldRenderer?.(schemaMediaCustomFieldRenderer);
	ensureNativeLanguageTabsBridge();
}

