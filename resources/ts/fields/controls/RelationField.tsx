import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon, getCsrfToken, sanitizeHref, sanitizeSameOriginUrl } from '../../lib/utils';
import {
	Badge,
	Button,
	Dialog,
	Input,
	Sheet,
	SortableHandle,
	SortableStatusRegion,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	useSortableList,
} from '../../ui';
import { dispatchDomChange, FieldStatusRow, resolveScopedFieldValue } from '../shared';
import type { RelationItemData, RelationResourceDescriptor } from '../types';

export interface RelationFieldProps {
	id?: string;
	name?: string;
	label?: string;
	cardinality?: 'm2o' | 'm2m' | 'o2m' | 'm2a' | string;
	resource?: string;
	resourceLabel?: string;
	resourceIcon?: string;
	resources?: RelationResourceDescriptor[];
	allowedResources?: string[];
	dependsResourceMap?: Record<string, string>;
	valueField?: string;
	widget?: string;
	configuredWidget?: string;
	endpoint?: string;
	relationToken?: string;
	value?: unknown;
	selectedItems?: RelationItemData[];
	initialOptions?: RelationItemData[];
	initialTree?: RelationItemData[];
	multiple?: boolean;
	sortable?: boolean;
	minItems?: number;
	maxItems?: number;
	optionColumns?: number;
	dependsOn?: string;
	allowCustom?: boolean;
	creatable?: boolean;
	editableLink?: boolean;
	allowLink?: boolean;
	allowUnlink?: boolean;
	foreignField?: string;
	ownerId?: string | number;
	placeholder?: string;
	readOnly?: boolean;
	disabled?: boolean;
	required?: boolean;
	formValues?: Record<string, unknown>;
	scopePrefix?: string;
	error?: string;
	errorId?: string;
	onChange?: (next: unknown) => void;
	props?: Record<string, unknown>;
}

function toStringValue(val: unknown): string {
	if (val === null || val === undefined) {
		return '';
	}
	return String(val).trim();
}

function normalizeMultiValues(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		const out: string[] = [];
		for (const v of raw) {
			const s = toStringValue(v);
			if (s !== '' && s !== '0' && !out.includes(s)) {
				out.push(s);
			}
		}
		return out;
	}
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '' || trimmed === '0') {
			return [];
		}
		if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) {
					return normalizeMultiValues(parsed);
				}
			} catch {
				// Fall through to delimiter split
			}
		}
		return trimmed
			.split(/[|,]/)
			.map((s) => s.trim())
			.filter((s) => s !== '' && s !== '0');
	}
	if (typeof raw === 'number' && raw > 0) {
		return [String(raw)];
	}
	return [];
}

function normalizeScalarValue(raw: unknown): string {
	if (Array.isArray(raw)) {
		return raw.length > 0 ? toStringValue(raw[0]) : '';
	}
	const s = toStringValue(raw);
	return s === '0' ? '' : s;
}

function itemStoredToken(item: RelationItemData, cardinality: string): string {
	if (cardinality === 'm2a') {
		return item.key || `${item.resource}:${String(item.value)}`;
	}
	return String(item.value);
}

function makeFallbackItem(token: string, cardinality: string, defaultResource: string): RelationItemData {
	if (cardinality === 'm2a' && token.includes(':')) {
		const idx = token.indexOf(':');
		const res = token.slice(0, idx);
		const val = token.slice(idx + 1);
		return {
			key: token,
			resource: res,
			resourceLabel: res.charAt(0).toUpperCase() + res.slice(1),
			value: val,
			id: val,
			label: val,
			icon: 'link-2',
		};
	}
	return {
		key: `${defaultResource}:${token}`,
		resource: defaultResource,
		value: token,
		id: token,
		label: token,
		icon: 'link-2',
	};
}

function RelationItemVisual({
	item,
	fallbackIcon = 'file-text',
	size = 'sm',
}: {
	item?: RelationItemData;
	fallbackIcon?: string;
	size?: 'xs' | 'sm' | 'md';
}) {
	const boxSize = size === 'xs' ? 'size-4' : size === 'md' ? 'size-7' : 'size-5';
	const iconSize = size === 'xs' ? 'size-3' : size === 'md' ? 'size-4' : 'size-3.5';

	if (item?.thumb) {
		return (
			<img
				src={item.thumb}
				alt=""
				className={cn(boxSize, 'shrink-0 rounded object-cover border border-border/60 bg-muted')}
			/>
		);
	}
	return (
		<span
			className={cn(
				boxSize,
				'inline-flex shrink-0 items-center justify-center rounded bg-muted/70 text-muted-foreground'
			)}
		>
			<DynamicIcon name={item?.icon || fallbackIcon} className={iconSize} />
		</span>
	);
}

function QuickEditButton({ item, enabled }: { item?: RelationItemData; enabled: boolean }) {
	const safeEditUrl = sanitizeHref(item?.editUrl);
	if (!enabled || !safeEditUrl) {
		return null;
	}
	return (
		<a
			href={safeEditUrl}
			target="_blank"
			rel="noopener noreferrer"
			onClick={(e) => e.stopPropagation()}
			title={`Open ${item?.label ?? ''}`}
			aria-label={`Open ${item?.label ?? ''}`}
			className="inline-flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		>
			<DynamicIcon name="external-link" className="size-3.5" />
		</a>
	);
}

export const RelationFieldControl: React.FC<RelationFieldProps> = (rawProps) => {
	const resolved: RelationFieldProps = useMemo(() => {
		const inner =
			rawProps.props && typeof rawProps.props === 'object'
				? { ...rawProps, ...rawProps.props }
				: rawProps;
		// When mounted as a standalone Inertia island (`InputfieldInertia::toInertiaProp()`),
		// relation payload lives inside `rawProps.props` while `value` / `name` may also sit at top level
		if (inner.props && typeof inner.props === 'object' && inner.props !== rawProps.props) {
			return { ...inner, ...inner.props };
		}
		return inner;
	}, [rawProps]);

	const rootRef = useRef<HTMLDivElement | null>(null);
	const hiddenAnchorRef = useRef<HTMLInputElement | null>(null);
	const [isIslandHost, setIsIslandHost] = useState<boolean>(false);

	const cardinality = String(resolved.cardinality || 'm2o').toLowerCase() as 'm2o' | 'm2m' | 'o2m' | 'm2a';
	const isMultiple =
		cardinality === 'm2m' || (cardinality === 'm2a' && resolved.multiple !== false);
	const inputName = String(resolved.name || '');
	const endpoint = String(resolved.endpoint || '/_react/relation');
	const relationToken = String(resolved.relationToken || '');
	const widget = String(resolved.widget || (cardinality === 'o2m' ? 'subtable' : cardinality === 'm2a' ? 'morph' : isMultiple ? 'multiselect' : 'select')).toLowerCase();
	const isReadOnly = Boolean(rawProps.readOnly || resolved.readOnly);
	const isDisabled = Boolean(rawProps.disabled || resolved.disabled || isReadOnly);
	const isSortable = resolved.sortable !== false && isMultiple;
	const maxItems = typeof resolved.maxItems === 'number' && resolved.maxItems > 0 ? resolved.maxItems : 0;
	const optionColumns = typeof resolved.optionColumns === 'number' && resolved.optionColumns > 0 ? resolved.optionColumns : 0;
	const allowCustom = Boolean(resolved.allowCustom);
	const creatable = Boolean(resolved.creatable);
	const editableLink = resolved.editableLink !== false;
	const allowLink = resolved.allowLink !== false;
	const allowUnlink = resolved.allowUnlink !== false;
	const dependsOn = String(resolved.dependsOn || '').trim();
	const dependsResourceMap = resolved.dependsResourceMap || {};
	const resourcesMeta: RelationResourceDescriptor[] = Array.isArray(resolved.resources) ? resolved.resources : [];

	useEffect(() => {
		const parent = rootRef.current?.parentElement;
		const cleanName = inputName.endsWith('[]') ? inputName.slice(0, -2) : inputName;
		if (
			parent &&
			parent.classList.contains('pw-inertia-inputfield-island') &&
			(!cleanName ||
				parent.getAttribute('data-input-name') === cleanName ||
				parent.getAttribute('data-input-name') === inputName)
		) {
			setIsIslandHost(true);
		} else {
			setIsIslandHost(false);
		}
	}, [inputName]);

	// Resolve cascading `dependsOn` value from either `<SchemaForm />` `formValues` or native DOM `<form>` inputs
	const schemaDependsVal = useMemo(() => {
		if (!dependsOn || !rawProps.formValues) {
			return undefined;
		}
		return resolveScopedFieldValue(rawProps.formValues, dependsOn, rawProps.scopePrefix);
	}, [dependsOn, rawProps.formValues, rawProps.scopePrefix]);

	const [domDependsVal, setDomDependsVal] = useState<string>('');
	const [domDependsReady, setDomDependsReady] = useState<boolean>(() => !dependsOn || rawProps.formValues !== undefined);

	useEffect(() => {
		if (!dependsOn || rawProps.formValues !== undefined) {
			setDomDependsReady(true);
			return;
		}
		const readDomValue = () => {
			const form = rootRef.current?.closest('form') || document;
			const target =
				form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
					`[name="${CSS.escape(dependsOn)}"]`
				) ||
				form.querySelector<HTMLInputElement>(`#Inputfield_${CSS.escape(dependsOn)}`);
			if (!target) {
				setDomDependsReady(true);
				return;
			}
			if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
				if (target.type === 'radio') {
					const checkedRadio = form.querySelector<HTMLInputElement>(
						`input[type="radio"][name="${CSS.escape(dependsOn)}"]:checked`
					);
					setDomDependsVal(checkedRadio ? checkedRadio.value : '');
				} else {
					setDomDependsVal(target.checked ? target.value || '1' : '');
				}
			} else {
				setDomDependsVal(target.value || '');
			}
			setDomDependsReady(true);
		};
		readDomValue();
		const hostForm = rootRef.current?.closest('form') || document;
		hostForm.addEventListener('change', readDomValue);
		hostForm.addEventListener('input', readDomValue);
		return () => {
			hostForm.removeEventListener('change', readDomValue);
			hostForm.removeEventListener('input', readDomValue);
		};
	}, [dependsOn, rawProps.formValues]);

	const effectiveDependsValue = useMemo(() => {
		if (!dependsOn) {
			return '';
		}
		const raw = rawProps.formValues !== undefined ? schemaDependsVal : domDependsVal;
		if (Array.isArray(raw)) {
			return raw.map(String).filter(Boolean).join(',');
		}
		return toStringValue(raw);
	}, [dependsOn, rawProps.formValues, schemaDependsVal, domDependsVal]);

	const activeResourceName = useMemo(() => {
		const baseRes = String(resolved.resource || 'page').toLowerCase();
		if (effectiveDependsValue && dependsResourceMap[effectiveDependsValue]) {
			return String(dependsResourceMap[effectiveDependsValue]).toLowerCase();
		}
		return baseRes;
	}, [resolved.resource, effectiveDependsValue, dependsResourceMap]);

	const activeResourceMeta = useMemo(() => {
		const found = resourcesMeta.find((r) => r.name === activeResourceName);
		return {
			name: activeResourceName,
			label: found?.label || resolved.resourceLabel || activeResourceName,
			icon: found?.icon || resolved.resourceIcon || 'file-text',
			supportsQuickCreate: found ? found.supportsQuickCreate : creatable,
		};
	}, [resourcesMeta, activeResourceName, resolved.resourceLabel, resolved.resourceIcon, creatable]);

	// Dictionary of known RelationItemData indexed by stored token (`value` or `resource:value` for m2a)
	const [itemCache, setItemCache] = useState<Record<string, RelationItemData>>(() => {
		const map: Record<string, RelationItemData> = {};
		const seedLists = [
			resolved.selectedItems || [],
			resolved.initialOptions || [],
			resolved.initialTree || [],
		];
		for (const list of seedLists) {
			if (!Array.isArray(list)) continue;
			for (const item of list) {
				if (item && item.value !== undefined) {
					map[itemStoredToken(item, cardinality)] = item;
				}
			}
		}
		return map;
	});

	const mergeItemsIntoCache = useCallback(
		(items: RelationItemData[]) => {
			if (!Array.isArray(items) || items.length === 0) {
				return;
			}
			setItemCache((prev) => {
				let mutated = false;
				const next = { ...prev };
				for (const item of items) {
					if (!item || item.value === undefined) continue;
					const k = itemStoredToken(item, cardinality);
					if (!next[k] || next[k].label !== item.label || next[k].subtitle !== item.subtitle) {
						next[k] = item;
						mutated = true;
					}
				}
				return mutated ? next : prev;
			});
		},
		[cardinality]
	);

	useEffect(() => {
		if (Array.isArray(resolved.selectedItems) && resolved.selectedItems.length > 0) {
			mergeItemsIntoCache(resolved.selectedItems);
		}
	}, [resolved.selectedItems, mergeItemsIntoCache]);

	// Controlled / internal selection state (for M2O, M2M, M2A)
	const rawControlledVal = rawProps.value !== undefined ? rawProps.value : resolved.value;
	const [scalarVal, setScalarVal] = useState<string>(() => normalizeScalarValue(rawControlledVal));
	const [multiVals, setMultiVals] = useState<string[]>(() => normalizeMultiValues(rawControlledVal));

	useEffect(() => {
		if (cardinality === 'o2m') {
			return;
		}
		if (isMultiple) {
			const next = normalizeMultiValues(rawControlledVal);
			setMultiVals((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
		} else {
			const next = normalizeScalarValue(rawControlledVal);
			setScalarVal((prev) => (prev === next ? prev : next));
		}
	}, [rawControlledVal, isMultiple, cardinality]);

	const commitScalar = useCallback(
		(nextVal: string, item?: RelationItemData) => {
			if (isDisabled) return;
			if (item) {
				mergeItemsIntoCache([item]);
			}
			setScalarVal(nextVal);
			rawProps.onChange?.(nextVal);
			window.requestAnimationFrame(() => dispatchDomChange(hiddenAnchorRef.current));
		},
		[isDisabled, mergeItemsIntoCache, rawProps]
	);

	const commitMulti = useCallback(
		(nextVals: string[], items?: RelationItemData[]) => {
			if (isDisabled) return;
			const trimmed = maxItems > 0 ? nextVals.slice(0, maxItems) : nextVals;
			if (items && items.length > 0) {
				mergeItemsIntoCache(items);
			}
			setMultiVals(trimmed);
			rawProps.onChange?.(trimmed);
			window.requestAnimationFrame(() => dispatchDomChange(hiddenAnchorRef.current));
		},
		[isDisabled, maxItems, mergeItemsIntoCache, rawProps]
	);

	const resolveItem = useCallback(
		(token: string): RelationItemData =>
			itemCache[token] || makeFallbackItem(token, cardinality, activeResourceName),
		[itemCache, cardinality, activeResourceName]
	);

	// Remote query helper (`POST /_react/relation` or `GET /_react/relation`)
	const callRelationEndpoint = useCallback(
		async (
			payload: Record<string, unknown>,
			mutating = false,
			signal?: AbortSignal
		): Promise<{
			ok?: boolean;
			error?: string;
			item?: RelationItemData;
			items?: RelationItemData[];
			tree?: RelationItemData[];
			total?: number;
			hasMore?: boolean;
			[key: string]: unknown;
		}> => {
			if (!relationToken) {
				return { ok: false, error: 'Missing relationToken.' };
			}
			const headers: Record<string, string> = {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'X-Requested-With': 'XMLHttpRequest',
			};
			const bodyObj: Record<string, unknown> = {
				relationToken,
				dependsValue: effectiveDependsValue,
				...payload,
			};
			if (mutating) {
				const csrf = getCsrfToken();
				if (csrf.value) {
					headers['X-CSRF-Token'] = csrf.value;
					bodyObj.csrfTokenName = csrf.name;
					bodyObj.csrfTokenValue = csrf.value;
					if (csrf.name) {
						bodyObj[csrf.name] = csrf.value;
					}
				}
			}
			const safeEndpoint = sanitizeSameOriginUrl(endpoint);
			if (!safeEndpoint) {
				return { ok: false, error: 'Invalid relation endpoint.' };
			}
			const res = await fetch(safeEndpoint, {
				method: 'POST',
				headers,
				credentials: 'same-origin',
				body: JSON.stringify(bodyObj),
				signal,
			});
			const json = (await res.json().catch(() => ({ ok: false, error: 'Invalid server response.' }))) as {
				ok?: boolean;
				error?: string;
				item?: RelationItemData;
				items?: RelationItemData[];
				tree?: RelationItemData[];
				total?: number;
				hasMore?: boolean;
				[key: string]: unknown;
			};
			if (Array.isArray(json?.items)) {
				mergeItemsIntoCache(json.items);
			}
			if (json?.item) {
				mergeItemsIntoCache([json.item]);
			}
			return json;
		},
		[endpoint, relationToken, effectiveDependsValue, mergeItemsIntoCache]
	);

	// Eager options state (`select`, `radios`, `radio-cards`, `multiselect`, `checkboxes`, `transfer`)
	const [options, setOptions] = useState<RelationItemData[]>(() =>
		Array.isArray(resolved.initialOptions) ? resolved.initialOptions : []
	);
	const [loadingOptions, setLoadingOptions] = useState<boolean>(false);
	const isEagerWidget = useMemo(
		() => ['select', 'radios', 'radio-cards', 'multiselect', 'checkboxes', 'transfer'].includes(widget),
		[widget]
	);

	const prevDependsRef = useRef<string | null>(null);
	const prevTokenRef = useRef<string>(relationToken);
	useEffect(() => {
		if (!isEagerWidget || !relationToken) {
			return;
		}
		const dependsChanged =
			prevDependsRef.current !== null && prevDependsRef.current !== effectiveDependsValue;
		prevDependsRef.current = effectiveDependsValue;

		const tokenChanged = prevTokenRef.current !== relationToken;
		prevTokenRef.current = relationToken;

		if (
			!tokenChanged &&
			!dependsChanged &&
			!dependsOn &&
			(Array.isArray(resolved.initialOptions) || options.length > 0)
		) {
			return;
		}
		const ctrl = new AbortController();
		setLoadingOptions(true);
		callRelationEndpoint({ action: 'search', q: '', page: 1, limit: 100 }, false, ctrl.signal)
			.then((res) => {
				if (res?.ok && Array.isArray(res.items)) {
					setOptions(res.items);
				}
			})
			.catch(() => {})
			.finally(() => setLoadingOptions(false));

		return () => ctrl.abort();
	}, [isEagerWidget, relationToken, dependsOn, effectiveDependsValue, callRelationEndpoint]);

	// Hydrate any missing selected items if initial payload only carried raw values
	useEffect(() => {
		if (!relationToken || cardinality === 'o2m') {
			return;
		}
		const activeTokens = isMultiple ? multiVals : scalarVal ? [scalarVal] : [];
		const missing = activeTokens.filter((t) => !itemCache[t]);
		if (missing.length === 0) {
			return;
		}
		const ctrl = new AbortController();
		callRelationEndpoint({ action: 'hydrate', values: missing }, false, ctrl.signal).catch(() => {});
		return () => ctrl.abort();
	}, [relationToken, cardinality, isMultiple, multiVals, scalarVal, itemCache, callRelationEndpoint]);

	// Clear stale incompatible selection when a user-driven `dependsResourceMap` switch changes `activeResourceName`
	const prevActiveResourceRef = useRef<string | null>(null);
	useEffect(() => {
		if (!domDependsReady || cardinality === 'o2m' || allowCustom) {
			return;
		}
		if (prevActiveResourceRef.current === null) {
			prevActiveResourceRef.current = activeResourceName;
			return;
		}
		if (prevActiveResourceRef.current !== activeResourceName) {
			prevActiveResourceRef.current = activeResourceName;
			if (isMultiple) {
				if (multiVals.length > 0) {
					commitMulti([]);
				}
			} else if (scalarVal !== '') {
				commitScalar('');
			}
		}
	}, [domDependsReady, activeResourceName, cardinality, allowCustom, isMultiple, multiVals.length, scalarVal, commitMulti, commitScalar]);

	// Quick Create modal state
	const [quickCreateOpen, setQuickCreateOpen] = useState(false);
	const [quickCreateResource, setQuickCreateResource] = useState<string>('');
	const [quickCreateTitle, setQuickCreateTitle] = useState('');
	const [quickCreateSlug, setQuickCreateSlug] = useState('');
	const [quickCreateBusy, setQuickCreateBusy] = useState(false);
	const [quickCreateError, setQuickCreateError] = useState('');
	const [o2mRefreshTick, setO2mRefreshTick] = useState(0);

	const openQuickCreateDialog = useCallback((resourceOverride = '') => {
		setQuickCreateResource(resourceOverride);
		setQuickCreateError('');
		setQuickCreateOpen(true);
	}, []);

	const quickCreateBaseId = useId();
	const quickCreateMeta = useMemo(() => {
		if (quickCreateResource) {
			const found = resourcesMeta.find((r) => r.name === quickCreateResource);
			if (found) {
				return {
					name: found.name,
					label: found.label || found.name,
				};
			}
		}
		return {
			name: activeResourceMeta.name,
			label: activeResourceMeta.label,
		};
	}, [quickCreateResource, resourcesMeta, activeResourceMeta]);

	const handleQuickCreateSubmit = async () => {
		const trimmedTitle = quickCreateTitle.trim();
		if (!trimmedTitle || quickCreateBusy) {
			return;
		}
		setQuickCreateBusy(true);
		setQuickCreateError('');
		try {
			const res = await callRelationEndpoint(
				{
					action: 'quick_create',
					title: trimmedTitle,
					name: quickCreateSlug.trim(),
					...(quickCreateResource ? { resource: quickCreateResource } : {}),
				},
				true
			);
			if (!res?.ok || !res.item) {
				setQuickCreateError(String(res?.error || 'Could not create record.'));
				setQuickCreateBusy(false);
				return;
			}
			const created: RelationItemData = res.item;
			const token = itemStoredToken(created, cardinality);
			if (cardinality === 'o2m') {
				if (resolved.ownerId && resolved.foreignField) {
					await callRelationEndpoint(
						{
							action: 'o2m_link',
							targetValue: created.value,
						},
						true
					);
				}
				setO2mRefreshTick((t) => t + 1);
			} else if (isMultiple) {
				if (!multiVals.includes(token)) {
					commitMulti([...multiVals, token], [created]);
				}
			} else {
				commitScalar(token, created);
			}
			setOptions((prev) => (prev.some((p) => itemStoredToken(p, cardinality) === token) ? prev : [created, ...prev]));
			setQuickCreateTitle('');
			setQuickCreateSlug('');
			setQuickCreateOpen(false);
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.message : '';
			setQuickCreateError(errMsg || 'Quick create failed.');
		} finally {
			setQuickCreateBusy(false);
		}
	};

	// Sortable list controller for multi-value selections
	const sortable = useSortableList<string>({
		items: multiVals,
		getId: (v) => v,
		getLabel: (v) => resolveItem(v).label,
		axis: 'vertical',
		disabled: !isSortable || isDisabled,
		onReorder: (next) => commitMulti(next),
	});

	// Hidden DOM input emission (skips primary input when inside `.pw-inertia-inputfield-island`, which manages its own `data-inertia-input`)
	const renderHiddenInputs = () => {
		if (cardinality === 'o2m' || !inputName) {
			return null;
		}
		const cleanBaseName = inputName.endsWith('[]') ? inputName.slice(0, -2) : inputName;
		return (
			<>
				<input ref={hiddenAnchorRef} type="hidden" name={`${cleanBaseName}_present`} value="1" />
				{!isIslandHost ? (
					isMultiple ? (
						multiVals.length > 0 ? (
							multiVals.map((val) => (
								<input key={val} type="hidden" name={`${cleanBaseName}[]`} value={val} />
							))
						) : (
							<input type="hidden" name={cleanBaseName} value="" />
						)
					) : (
						<input type="hidden" name={cleanBaseName} value={scalarVal} />
					)
				) : null}
			</>
		);
	};

	// Read-only presentation (M2O / M2M / M2A)
	if (isReadOnly && cardinality !== 'o2m') {
		const displayTokens = isMultiple ? multiVals : scalarVal ? [scalarVal] : [];
		if (displayTokens.length === 0) {
			return (
				<div ref={rootRef} data-rw-control="relation" data-cardinality={cardinality}>
					{renderHiddenInputs()}
					<Badge variant="outline" className="text-muted-foreground">
						—
					</Badge>
				</div>
			);
		}
		return (
			<div
				ref={rootRef}
				className="flex flex-wrap items-center gap-1.5"
				data-rw-control="relation"
				data-cardinality={cardinality}
			>
				{renderHiddenInputs()}
				{displayTokens.map((tok) => {
					const item = resolveItem(tok);
					return (
						<Badge key={tok} variant="secondary" className="gap-1.5 px-2.5 py-1 text-xs font-normal">
							<RelationItemVisual item={item} fallbackIcon={activeResourceMeta.icon} size="xs" />
							{cardinality === 'm2a' ? (
								<span className="font-mono text-[10px] uppercase text-muted-foreground">
									{item.resourceLabel || item.resource}:
								</span>
							) : null}
							<span className="font-medium text-foreground">{item.label}</span>
							<QuickEditButton item={item} enabled={editableLink} />
						</Badge>
					);
				})}
			</div>
		);
	}

	const statusSlotNode = resolved.error ? (
		<FieldStatusRow error={resolved.error} errorId={resolved.errorId} />
	) : null;

	return (
		<div
			ref={rootRef}
			className="space-y-1.5"
			data-rw-control="relation"
			data-cardinality={cardinality}
			data-widget={widget}
			data-resource={activeResourceName}
		>
			{renderHiddenInputs()}
			{isSortable ? <SortableStatusRegion message={sortable.statusMessage} /> : null}

			{cardinality === 'o2m' ? (
				<O2MRelationView
					widget={widget}
					initialItems={Array.isArray(resolved.selectedItems) ? resolved.selectedItems : []}
					resourceLabel={activeResourceMeta.label}
					resourceIcon={activeResourceMeta.icon}
					ownerId={resolved.ownerId}
					foreignField={resolved.foreignField || ''}
					creatable={creatable && activeResourceMeta.supportsQuickCreate && !isDisabled}
					allowLink={allowLink && !isDisabled}
					allowUnlink={allowUnlink && !isDisabled}
					editableLink={editableLink}
					refreshTick={o2mRefreshTick}
					statusSlot={statusSlotNode}
					callEndpoint={callRelationEndpoint}
					onOpenQuickCreate={() => openQuickCreateDialog()}
				/>
			) : widget === 'radios' || widget === 'radio-cards' ? (
				<>
					<RadioRelationWidget
						cards={widget === 'radio-cards'}
						options={options}
						loading={loadingOptions}
						value={scalarVal}
						optionColumns={optionColumns}
						disabled={isDisabled}
						required={Boolean(resolved.required)}
						editableLink={editableLink}
						creatable={creatable && activeResourceMeta.supportsQuickCreate}
						fallbackIcon={activeResourceMeta.icon}
						onSelect={(tok, item) => commitScalar(tok, item)}
						onOpenQuickCreate={() => openQuickCreateDialog()}
					/>
					{statusSlotNode}
				</>
			) : widget === 'checkboxes' ? (
				<>
					<CheckboxesRelationWidget
						options={options}
						loading={loadingOptions}
						selectedValues={multiVals}
						optionColumns={optionColumns}
						maxItems={maxItems}
						disabled={isDisabled}
						editableLink={editableLink}
						creatable={creatable && activeResourceMeta.supportsQuickCreate}
						fallbackIcon={activeResourceMeta.icon}
						onChange={(next, items) => commitMulti(next, items)}
						onOpenQuickCreate={() => openQuickCreateDialog()}
					/>
					{statusSlotNode}
				</>
			) : widget === 'transfer' ? (
				<>
					<TransferRelationWidget
						options={options}
						loading={loadingOptions}
						selectedValues={multiVals}
						maxItems={maxItems}
						disabled={isDisabled}
						editableLink={editableLink}
						fallbackIcon={activeResourceMeta.icon}
						resolveItem={resolveItem}
						onChange={(next, items) => commitMulti(next, items)}
					/>
					{statusSlotNode}
				</>
			) : widget === 'treeselect' ? (
				<TreeSelectRelationWidget
					initialTree={Array.isArray(resolved.initialTree) ? resolved.initialTree : []}
					dependsValue={effectiveDependsValue}
					multiple={isMultiple}
					scalarValue={scalarVal}
					multiValues={multiVals}
					maxItems={maxItems}
					disabled={isDisabled}
					editableLink={editableLink}
					creatable={creatable && activeResourceMeta.supportsQuickCreate}
					placeholder={resolved.placeholder}
					fallbackIcon={activeResourceMeta.icon}
					sortable={sortable}
					isSortable={isSortable}
					statusSlot={statusSlotNode}
					resolveItem={resolveItem}
					callEndpoint={callRelationEndpoint}
					onCommitScalar={commitScalar}
					onCommitMulti={commitMulti}
					onOpenQuickCreate={() => openQuickCreateDialog()}
				/>
			) : widget === 'picker' || widget === 'morph-picker' ? (
				<PickerDrawerRelationWidget
					cardinality={cardinality}
					multiple={isMultiple}
					scalarValue={scalarVal}
					multiValues={multiVals}
					maxItems={maxItems}
					disabled={isDisabled}
					editableLink={editableLink}
					creatable={creatable && (cardinality === 'm2a' ? true : activeResourceMeta.supportsQuickCreate)}
					resourceMeta={activeResourceMeta}
					resources={resourcesMeta}
					allowedResources={resolved.allowedResources || []}
					sortable={sortable}
					isSortable={isSortable}
					statusSlot={statusSlotNode}
					resolveItem={resolveItem}
					callEndpoint={callRelationEndpoint}
					onCommitScalar={commitScalar}
					onCommitMulti={commitMulti}
					onOpenQuickCreate={(resOverride) => openQuickCreateDialog(resOverride || '')}
				/>
			) : widget === 'select' || widget === 'multiselect' ? (
				<SelectAndMultiRelationWidget
					cardinality={cardinality}
					multiple={isMultiple}
					options={options}
					loading={loadingOptions}
					scalarValue={scalarVal}
					multiValues={multiVals}
					maxItems={maxItems}
					allowCustom={allowCustom}
					creatable={creatable && activeResourceMeta.supportsQuickCreate}
					editableLink={editableLink}
					disabled={isDisabled}
					placeholder={resolved.placeholder}
					resourceMeta={activeResourceMeta}
					sortable={sortable}
					isSortable={isSortable}
					statusSlot={statusSlotNode}
					resolveItem={resolveItem}
					onCommitScalar={commitScalar}
					onCommitMulti={commitMulti}
					onOpenQuickCreate={() => openQuickCreateDialog()}
				/>
			) : (
				<AutocompleteAndMorphWidget
					cardinality={cardinality}
					multiple={isMultiple}
					scalarValue={scalarVal}
					multiValues={multiVals}
					maxItems={maxItems}
					allowCustom={allowCustom}
					creatable={creatable && (cardinality === 'm2a' ? true : activeResourceMeta.supportsQuickCreate)}
					editableLink={editableLink}
					disabled={isDisabled}
					placeholder={resolved.placeholder}
					resourceMeta={activeResourceMeta}
					resources={resourcesMeta}
					allowedResources={resolved.allowedResources || []}
					dependsValue={effectiveDependsValue}
					sortable={sortable}
					isSortable={isSortable}
					statusSlot={statusSlotNode}
					resolveItem={resolveItem}
					callEndpoint={callRelationEndpoint}
					onCommitScalar={commitScalar}
					onCommitMulti={commitMulti}
					onOpenQuickCreate={(resOverride) => openQuickCreateDialog(resOverride || '')}
				/>
			)}

			<Dialog
				open={quickCreateOpen}
				onOpenChange={setQuickCreateOpen}
				title={`New ${quickCreateMeta.label}`}
				description={`Create a new ${quickCreateMeta.label.toLowerCase()} record and link it immediately.`}
				maxWidth="max-w-md"
				footer={
					<>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setQuickCreateOpen(false)}
							disabled={quickCreateBusy}
						>
							{t('common.cancel', 'Cancel')}
						</Button>
						<Button
							type="button"
							size="sm"
							icon="plus"
							onClick={handleQuickCreateSubmit}
							disabled={quickCreateBusy || !quickCreateTitle.trim()}
						>
							{quickCreateBusy ? t('relation.creating', 'Creating...') : t('relation.createAndSelect', 'Create & Select')}
						</Button>
					</>
				}
			>
				<div className="space-y-3">
					<div className="space-y-1">
						<label htmlFor={`${quickCreateBaseId}-title`} className="text-xs font-semibold text-foreground">{t('relation.titleLabel', 'Title')} *</label>
						<Input
							id={`${quickCreateBaseId}-title`}
							value={quickCreateTitle}
							onChange={(e) => setQuickCreateTitle(e.target.value)}
							placeholder={`Enter ${activeResourceMeta.label.toLowerCase()} title...`}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									void handleQuickCreateSubmit();
								}
							}}
							autoFocus
						/>
					</div>
					<div className="space-y-1">
						<label htmlFor={`${quickCreateBaseId}-slug`} className="text-xs font-semibold text-muted-foreground">{t('relation.slugLabel', 'Name / Slug (optional)')}</label>
						<Input
							id={`${quickCreateBaseId}-slug`}
							value={quickCreateSlug}
							onChange={(e) => setQuickCreateSlug(e.target.value)}
							placeholder="auto-generated-from-title"
							className="font-mono text-xs"
						/>
					</div>
					{quickCreateError ? (
						<p className="text-xs font-medium text-destructive" role="alert">
							{quickCreateError}
						</p>
					) : null}
				</div>
			</Dialog>
		</div>
	);
};

/* ============================================================================
 * Shared Sortable Selected List (M2M & M2A)
 * ========================================================================== */

function SelectedItemsStack({
	cardinality,
	values,
	disabled,
	editableLink,
	fallbackIcon,
	isSortable,
	sortable,
	resolveItem,
	onRemove,
}: {
	cardinality: string;
	values: string[];
	disabled: boolean;
	editableLink: boolean;
	fallbackIcon: string;
	isSortable: boolean;
	sortable: ReturnType<typeof useSortableList<string>>;
	resolveItem: (tok: string) => RelationItemData;
	onRemove: (tok: string) => void;
}) {
	if (values.length === 0) {
		return null;
	}
	return (
		<div
			data-rw-field-slot="selected"
			{...(isSortable ? sortable.getContainerProps() : {})}
			className="divide-y divide-border overflow-hidden rounded-md border border-border bg-muted/15"
		>
			{values.map((tok, idx) => {
				const item = resolveItem(tok);
				return (
					<div
						key={tok}
						{...(isSortable ? sortable.getItemProps(tok) : {})}
						className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/35"
					>
						<div className="flex items-center gap-2 min-w-0">
							{isSortable && !disabled && values.length > 1 ? (
								<SortableHandle size="xs" {...sortable.getHandleProps(tok, idx)} />
							) : null}
							<RelationItemVisual item={item} fallbackIcon={fallbackIcon} size="sm" />
							{cardinality === 'm2a' ? (
								<Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase shrink-0">
									{item.resourceLabel || item.resource}
								</Badge>
							) : null}
							<div className="min-w-0 truncate">
								<span className="font-medium text-foreground">{item.label}</span>
								{item.subtitle ? (
									<span className="ml-2 font-mono text-[11px] text-muted-foreground">
										{item.subtitle}
									</span>
								) : null}
							</div>
							{item.badge ? (
								<Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal shrink-0">
									{item.badge}
								</Badge>
							) : null}
							{item.status === 'unpublished' ? (
								<Badge variant="outline" className="px-1.5 py-0 text-[10px] text-warning shrink-0">
									Unpub
								</Badge>
							) : null}
						</div>
						<div className="inline-flex items-center gap-1 shrink-0">
							<QuickEditButton item={item} enabled={editableLink} />
							{!disabled ? (
								<button
									type="button"
									onClick={() => onRemove(tok)}
									title={`Remove ${item.label}`}
									aria-label={`Remove ${item.label}`}
									className="rounded p-1 text-muted-foreground hover:bg-destructive/12 hover:text-destructive cursor-pointer"
								>
									<DynamicIcon name="x" className="size-3.5" />
								</button>
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
}

/* ============================================================================
 * 1. Select (M2O) & MultiSelect (M2M) — Filterable Eager Dropdown
 * ========================================================================== */

function SelectAndMultiRelationWidget({
	cardinality,
	multiple,
	options,
	loading,
	scalarValue,
	multiValues,
	maxItems,
	allowCustom,
	creatable,
	editableLink,
	disabled,
	placeholder,
	resourceMeta,
	sortable,
	isSortable,
	statusSlot,
	resolveItem,
	onCommitScalar,
	onCommitMulti,
	onOpenQuickCreate,
}: {
	cardinality: string;
	multiple: boolean;
	options: RelationItemData[];
	loading: boolean;
	scalarValue: string;
	multiValues: string[];
	maxItems: number;
	allowCustom: boolean;
	creatable: boolean;
	editableLink: boolean;
	disabled: boolean;
	placeholder?: string;
	resourceMeta: { name: string; label: string; icon: string };
	sortable: ReturnType<typeof useSortableList<string>>;
	isSortable: boolean;
	statusSlot?: React.ReactNode;
	resolveItem: (tok: string) => RelationItemData;
	onCommitScalar: (val: string, item?: RelationItemData) => void;
	onCommitMulti: (vals: string[], items?: RelationItemData[]) => void;
	onOpenQuickCreate: (resourceOverride?: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [filter, setFilter] = useState('');
	const wrapRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const onDocClick = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', onDocClick);
		return () => document.removeEventListener('mousedown', onDocClick);
	}, [open]);

	const selectedSet = useMemo(
		() => new Set(multiple ? multiValues : scalarValue ? [scalarValue] : []),
		[multiple, multiValues, scalarValue]
	);

	const filteredOptions = useMemo(() => {
		const q = filter.trim().toLowerCase();
		return options.filter((opt) => {
			const tok = itemStoredToken(opt, cardinality);
			if (multiple && selectedSet.has(tok)) {
				return false;
			}
			if (!q) return true;
			return (
				opt.label.toLowerCase().includes(q) ||
				String(opt.value).toLowerCase().includes(q) ||
				(opt.subtitle && opt.subtitle.toLowerCase().includes(q)) ||
				(opt.badge && opt.badge.toLowerCase().includes(q))
			);
		});
	}, [options, filter, cardinality, multiple, selectedSet]);

	const selectedSingle = scalarValue ? resolveItem(scalarValue) : undefined;
	const atLimit = multiple && maxItems > 0 && multiValues.length >= maxItems;

	const chooseOption = (item: RelationItemData) => {
		const tok = itemStoredToken(item, cardinality);
		if (multiple) {
			if (!selectedSet.has(tok) && !atLimit) {
				onCommitMulti([...multiValues, tok], [item]);
			}
			setFilter('');
		} else {
			onCommitScalar(tok, item);
			setOpen(false);
			setFilter('');
		}
	};

	const commitCustomFilter = () => {
		const clean = filter.trim();
		if (!clean || !allowCustom) return;
		const customItem = makeFallbackItem(clean, cardinality, resourceMeta.name);
		if (multiple) {
			if (!selectedSet.has(clean) && !atLimit) {
				onCommitMulti([...multiValues, clean], [customItem]);
			}
		} else {
			onCommitScalar(clean, customItem);
			setOpen(false);
		}
		setFilter('');
	};

	const inputDisabled = disabled || atLimit;

	return (
		<div ref={wrapRef} className="space-y-1.5">
			<div data-rw-field-slot="input" className="relative">
				<div className="flex items-center gap-1.5">
					<div
						role="combobox"
						aria-expanded={open}
						tabIndex={inputDisabled ? -1 : 0}
						onClick={() => {
							if (!inputDisabled) setOpen((o) => !o);
						}}
						onKeyDown={(e) => {
							if (inputDisabled) return;
							if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
								e.preventDefault();
								setOpen(true);
							} else if (e.key === 'Escape') {
								setOpen(false);
							}
						}}
						className={cn(
							'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-input-surface px-3 text-xs shadow-2xs transition-colors',
							inputDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-ring/60',
							open && 'border-ring ring-2 ring-ring/20'
						)}
					>
						{!multiple && selectedSingle ? (
							<div className="flex items-center gap-2 min-w-0">
								<RelationItemVisual item={selectedSingle} fallbackIcon={resourceMeta.icon} size="xs" />
								<span className="truncate font-medium text-foreground">{selectedSingle.label}</span>
								{selectedSingle.subtitle ? (
									<span className="truncate font-mono text-[11px] text-muted-foreground">
										{selectedSingle.subtitle}
									</span>
								) : null}
								{selectedSingle.badge ? (
									<Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal shrink-0">
										{selectedSingle.badge}
									</Badge>
								) : null}
							</div>
						) : (
							<span className="truncate text-muted-foreground">
								{loading
									? `Loading ${resourceMeta.label.toLowerCase()} options...`
									: atLimit
										? `Maximum ${maxItems} selected`
										: placeholder ||
											(multiple
												? `+ Add ${resourceMeta.label.toLowerCase()}...`
												: `Select ${resourceMeta.label.toLowerCase()}...`)}
							</span>
						)}

						<div className="flex items-center gap-1 shrink-0">
							{!multiple && selectedSingle && editableLink ? (
								<QuickEditButton item={selectedSingle} enabled={editableLink} />
							) : null}
							{!multiple && scalarValue && !disabled ? (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onCommitScalar('');
									}}
									title={t('media.clearSelection', 'Clear selection')}
									aria-label={t('media.clearSelection', 'Clear selection')}
									className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
								>
									<DynamicIcon name="x" className="size-3.5" />
								</button>
							) : null}
							<DynamicIcon name="chevron-down" className="size-3.5 text-muted-foreground" />
						</div>
					</div>

					{creatable && !inputDisabled ? (
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={() => onOpenQuickCreate()}
							title={`New ${resourceMeta.label}`}
							aria-label={`New ${resourceMeta.label}`}
							className="h-9 w-9 shrink-0"
						>
							<DynamicIcon name="plus" className="size-4" />
						</Button>
					) : null}
				</div>

				{open && !inputDisabled ? (
					<div className="absolute left-0 right-0 z-40 mt-1 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
						{(options.length > 6 || allowCustom || filter !== '') && (
							<div className="mb-1.5 px-0.5">
								<Input
									aria-label={t('relation.filterOptions', 'Filter options...')}
									value={filter}
									onChange={(e) => setFilter(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											const firstOption = filteredOptions[0];
											if (firstOption) {
												chooseOption(firstOption);
											} else if (allowCustom && filter.trim()) {
												commitCustomFilter();
											}
										} else if (e.key === 'Escape') {
											setOpen(false);
										}
									}}
									placeholder={
										allowCustom
											? `Filter or type custom ${resourceMeta.label.toLowerCase()}...`
											: `Filter ${resourceMeta.label.toLowerCase()}...`
									}
									className="h-8 text-xs"
									autoFocus
								/>
							</div>
						)}

						<div className="max-h-60 overflow-y-auto space-y-0.5">
							{filteredOptions.map((opt) => {
								const tok = itemStoredToken(opt, cardinality);
								const isSelected = !multiple && scalarValue === tok;
								return (
									<button
										key={opt.key || tok}
										type="button"
										disabled={opt.disabled}
										onClick={() => chooseOption(opt)}
										className={cn(
											'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
											isSelected
												? 'bg-primary/10 text-foreground font-semibold'
												: 'hover:bg-muted text-foreground',
											opt.disabled && 'opacity-50 pointer-events-none'
										)}
									>
										<div className="flex items-center gap-2 min-w-0">
											<RelationItemVisual item={opt} fallbackIcon={resourceMeta.icon} size="xs" />
											<span className="truncate">{opt.label}</span>
											{opt.subtitle ? (
												<span className="truncate font-mono text-[11px] text-muted-foreground">
													{opt.subtitle}
												</span>
											) : null}
										</div>
										<div className="flex items-center gap-1.5 shrink-0">
											{opt.badge ? (
												<Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
													{opt.badge}
												</Badge>
											) : null}
											{isSelected ? <DynamicIcon name="check" className="size-3.5 text-primary" /> : null}
										</div>
									</button>
								);
							})}

							{allowCustom && filter.trim() !== '' && !options.some((o) => String(o.value) === filter.trim()) ? (
								<button
									type="button"
									onClick={commitCustomFilter}
									className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-muted"
								>
									<DynamicIcon name="plus" className="size-3.5 text-primary shrink-0" />
									<span>
										Use custom value: <strong className="font-mono">{filter.trim()}</strong>
									</span>
								</button>
							) : null}

							{filteredOptions.length === 0 && (!allowCustom || !filter.trim()) ? (
								<div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
									{loading ? 'Loading options...' : 'No matching records found.'}
								</div>
							) : null}
						</div>
					</div>
				) : null}
			</div>

			{statusSlot}

			{multiple ? (
				<SelectedItemsStack
					cardinality={cardinality}
					values={multiValues}
					disabled={disabled}
					editableLink={editableLink}
					fallbackIcon={resourceMeta.icon}
					isSortable={isSortable}
					sortable={sortable}
					resolveItem={resolveItem}
					onRemove={(tok) => onCommitMulti(multiValues.filter((v) => v !== tok))}
				/>
			) : null}
		</div>
	);
}

/* ============================================================================
 * 2. Autocomplete (M2O), MultiAutocomplete (M2M), and Morph (M2A)
 * ========================================================================== */

function AutocompleteAndMorphWidget({
	cardinality,
	multiple,
	scalarValue,
	multiValues,
	maxItems,
	allowCustom,
	creatable,
	editableLink,
	disabled,
	placeholder,
	resourceMeta,
	resources,
	allowedResources,
	dependsValue,
	sortable,
	isSortable,
	statusSlot,
	resolveItem,
	callEndpoint,
	onCommitScalar,
	onCommitMulti,
	onOpenQuickCreate,
}: {
	cardinality: string;
	multiple: boolean;
	scalarValue: string;
	multiValues: string[];
	maxItems: number;
	allowCustom: boolean;
	creatable: boolean;
	editableLink: boolean;
	disabled: boolean;
	placeholder?: string;
	resourceMeta: { name: string; label: string; icon: string };
	resources: RelationResourceDescriptor[];
	allowedResources: string[];
	dependsValue: string;
	sortable: ReturnType<typeof useSortableList<string>>;
	isSortable: boolean;
	statusSlot?: React.ReactNode;
	resolveItem: (tok: string) => RelationItemData;
	callEndpoint: (
		payload: Record<string, unknown>,
		mutating?: boolean,
		signal?: AbortSignal
	) => Promise<{
		ok?: boolean;
		error?: string;
		item?: RelationItemData;
		items?: RelationItemData[];
		tree?: RelationItemData[];
		total?: number;
		hasMore?: boolean;
		[key: string]: unknown;
	}>;
	onCommitScalar: (val: string, item?: RelationItemData) => void;
	onCommitMulti: (vals: string[], items?: RelationItemData[]) => void;
	onOpenQuickCreate: (resourceOverride?: string) => void;
}) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [results, setResults] = useState<RelationItemData[]>([]);
	const [hasMore, setHasMore] = useState(false);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [activeIdx, setActiveIdx] = useState(0);
	const [morphTab, setMorphTab] = useState<string>('_all');
	const wrapRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const onDocClick = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', onDocClick);
		return () => document.removeEventListener('mousedown', onDocClick);
	}, [open]);

	useEffect(() => {
		if (!open || disabled) {
			return;
		}
		const ctrl = new AbortController();
		const timer = window.setTimeout(() => {
			setLoading(true);
			callEndpoint(
				{
					action: 'search',
					q: query,
					page: 1,
					resource: cardinality === 'm2a' ? morphTab : undefined,
				},
				false,
				ctrl.signal
			)
				.then((res) => {
					if (res?.ok && Array.isArray(res.items)) {
						setResults(res.items);
						setHasMore(Boolean(res.hasMore));
						setPage(1);
						setActiveIdx(0);
					}
				})
				.catch(() => {})
				.finally(() => setLoading(false));
		}, 200);

		return () => {
			window.clearTimeout(timer);
			ctrl.abort();
		};
	}, [open, query, morphTab, dependsValue, cardinality, disabled, callEndpoint]);

	const loadMore = () => {
		if (loading || !hasMore) return;
		const nextPage = page + 1;
		setLoading(true);
		callEndpoint({
			action: 'search',
			q: query,
			page: nextPage,
			resource: cardinality === 'm2a' ? morphTab : undefined,
		})
			.then((res) => {
				if (res?.ok && Array.isArray(res.items)) {
					setResults((prev) => [...prev, ...(res.items ?? [])]);
					setHasMore(Boolean(res.hasMore));
					setPage(nextPage);
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	};

	const selectedSet = useMemo(
		() => new Set(multiple ? multiValues : scalarValue ? [scalarValue] : []),
		[multiple, multiValues, scalarValue]
	);

	const visibleResults = useMemo(
		() =>
			results.filter((r) => {
				const tok = itemStoredToken(r, cardinality);
				return !multiple || !selectedSet.has(tok);
			}),
		[results, cardinality, multiple, selectedSet]
	);

	const atLimit = multiple && maxItems > 0 && multiValues.length >= maxItems;
	const selectedSingle = !multiple && scalarValue ? resolveItem(scalarValue) : undefined;

	const selectResult = (item: RelationItemData) => {
		const tok = itemStoredToken(item, cardinality);
		if (multiple) {
			if (!selectedSet.has(tok) && !atLimit) {
				onCommitMulti([...multiValues, tok], [item]);
			}
			setQuery('');
		} else {
			onCommitScalar(tok, item);
			setQuery('');
			setOpen(false);
		}
	};

	const commitCustom = () => {
		const clean = query.trim();
		if (!clean || !allowCustom) return;
		const tok =
			cardinality === 'm2a' && !clean.includes(':')
				? `${morphTab !== '_all' ? morphTab : allowedResources[0] || 'page'}:${clean}`
				: clean;
		const item = makeFallbackItem(tok, cardinality, resourceMeta.name);
		if (multiple) {
			if (!selectedSet.has(tok) && !atLimit) {
				onCommitMulti([...multiValues, tok], [item]);
			}
		} else {
			onCommitScalar(tok, item);
			setOpen(false);
		}
		setQuery('');
	};

	const morphTabs = useMemo(() => {
		if (cardinality !== 'm2a') return [];
		const list = allowedResources.length > 0 ? allowedResources : resources.map((r) => r.name);
		return list.map((name) => {
			const meta = resources.find((r) => r.name === name);
			return {
				name,
				label: meta?.label || name.charAt(0).toUpperCase() + name.slice(1),
				icon: meta?.icon || 'layers',
			};
		});
	}, [cardinality, allowedResources, resources]);

	const inputLocked = disabled || (multiple && atLimit);

	return (
		<div ref={wrapRef} className="space-y-1.5">
			<div data-rw-field-slot="input" className="relative space-y-1.5">
				{!multiple && selectedSingle && !open ? (
					<div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-input-surface px-3 text-xs shadow-2xs">
						<div className="flex items-center gap-2 min-w-0">
							<RelationItemVisual item={selectedSingle} fallbackIcon={resourceMeta.icon} size="sm" />
							{cardinality === 'm2a' ? (
								<Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase shrink-0">
									{selectedSingle.resourceLabel || selectedSingle.resource}
								</Badge>
							) : null}
							<span className="truncate font-medium text-foreground">{selectedSingle.label}</span>
							{selectedSingle.subtitle ? (
								<span className="truncate font-mono text-[11px] text-muted-foreground">
									{selectedSingle.subtitle}
								</span>
							) : null}
							{selectedSingle.badge ? (
								<Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal shrink-0">
									{selectedSingle.badge}
								</Badge>
							) : null}
						</div>
						<div className="flex items-center gap-1 shrink-0">
							<QuickEditButton item={selectedSingle} enabled={editableLink} />
							{!disabled ? (
								<>
									<Button
										type="button"
										variant="ghost"
										size="xs"
										onClick={() => setOpen(true)}
										className="h-6 px-2 text-[11px]"
									>
										Change
									</Button>
									<button
										type="button"
										onClick={() => onCommitScalar('')}
										title={t('common.clear', 'Clear')}
										aria-label={t('common.clear', 'Clear')}
										className="rounded p-1 text-muted-foreground hover:bg-destructive/12 hover:text-destructive cursor-pointer"
									>
										<DynamicIcon name="x" className="size-3.5" />
									</button>
								</>
							) : null}
						</div>
					</div>
				) : null}

				{cardinality === 'm2a' && morphTabs.length > 1 && !inputLocked && (multiple || !selectedSingle || open) ? (
					<div className="flex flex-wrap items-center gap-1">
						<button
							type="button"
							onClick={() => {
								setMorphTab('_all');
								setOpen(true);
							}}
							className={cn(
								'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
								morphTab === '_all'
									? 'border-primary bg-primary/10 text-foreground'
									: 'border-border text-muted-foreground hover:text-foreground'
							)}
						>
							All Types
						</button>
						{morphTabs.map((tab) => (
							<button
								key={tab.name}
								type="button"
								onClick={() => {
									setMorphTab(tab.name);
									setOpen(true);
								}}
								className={cn(
									'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
									morphTab === tab.name
										? 'border-primary bg-primary/10 text-foreground'
										: 'border-border text-muted-foreground hover:text-foreground'
								)}
							>
								<DynamicIcon name={tab.icon} className="size-3" />
								<span>{tab.label}</span>
							</button>
						))}
					</div>
				) : null}

				{(multiple || !selectedSingle || open) ? (
					<div className="flex items-center gap-1.5">
						<div className="relative flex-1">
							<DynamicIcon
								name="search"
								className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								aria-label={placeholder || t('form.searchRelations', 'Search items...')}
								value={query}
								disabled={inputLocked}
								onFocus={() => {
									if (!inputLocked) setOpen(true);
								}}
								onChange={(e) => {
									setQuery(e.target.value);
									setOpen(true);
								}}
								onKeyDown={(e) => {
									if (e.key === 'ArrowDown') {
										e.preventDefault();
										setOpen(true);
										setActiveIdx((i) => Math.min(visibleResults.length - 1, i + 1));
									} else if (e.key === 'ArrowUp') {
										e.preventDefault();
										setActiveIdx((i) => Math.max(0, i - 1));
									} else if (e.key === 'Enter') {
										e.preventDefault();
										if (open && visibleResults[activeIdx]) {
											selectResult(visibleResults[activeIdx]);
										} else if (allowCustom && query.trim()) {
											commitCustom();
										}
									} else if (e.key === 'Escape') {
										setOpen(false);
									}
								}}
								placeholder={
									atLimit && multiple
										? `Maximum ${maxItems} selected`
										: placeholder ||
											(cardinality === 'm2a'
												? 'Search across permitted resources...'
												: `Search ${resourceMeta.label.toLowerCase()}...`)
								}
								className="pl-8 text-xs"
							/>
						</div>

						{(() => {
							if (!creatable || inputLocked) return null;
							if (cardinality !== 'm2a') {
								return (
									<Button
										type="button"
										variant="outline"
										size="icon"
										onClick={() => onOpenQuickCreate()}
										title={`New ${resourceMeta.label}`}
										aria-label={`New ${resourceMeta.label}`}
										className="h-9 w-9 shrink-0"
									>
										<DynamicIcon name="plus" className="size-4" />
									</Button>
								);
							}
							const candidateTab =
								morphTab !== '_all'
									? morphTab
									: allowedResources.filter((n) => resources.find((r) => r.name === n)?.supportsQuickCreate)[0] || '';
							const tabMeta = candidateTab ? resources.find((r) => r.name === candidateTab) : undefined;
							if (!tabMeta?.supportsQuickCreate) return null;
							return (
								<Button
									type="button"
									variant="outline"
									size="icon"
									onClick={() => onOpenQuickCreate(tabMeta.name)}
									title={`New ${tabMeta.label}`}
									aria-label={`New ${tabMeta.label}`}
									className="h-9 w-9 shrink-0"
								>
									<DynamicIcon name="plus" className="size-4" />
								</Button>
							);
						})()}
					</div>
				) : null}

				{open && !inputLocked ? (
					<div className="absolute left-0 right-0 z-40 mt-1 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
						<div className="max-h-64 overflow-y-auto space-y-0.5">
							{visibleResults.map((item, idx) => {
								const tok = itemStoredToken(item, cardinality);
								const isHighlighted = idx === activeIdx;
								return (
									<button
										key={item.key || tok}
										type="button"
										disabled={item.disabled}
										onMouseEnter={() => setActiveIdx(idx)}
										onClick={() => selectResult(item)}
										className={cn(
											'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
											isHighlighted ? 'bg-muted text-foreground' : 'text-foreground hover:bg-muted/60',
											item.disabled && 'opacity-50 pointer-events-none'
										)}
									>
										<div className="flex items-center gap-2 min-w-0">
											<RelationItemVisual item={item} fallbackIcon={resourceMeta.icon} size="sm" />
											{cardinality === 'm2a' ? (
												<Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase shrink-0">
													{item.resourceLabel || item.resource}
												</Badge>
											) : null}
											<div className="min-w-0 truncate">
												<span className="font-medium">{item.label}</span>
												{item.subtitle ? (
													<span className="ml-2 font-mono text-[11px] text-muted-foreground">
														{item.subtitle}
													</span>
												) : null}
											</div>
										</div>
										<div className="flex items-center gap-1.5 shrink-0">
											{item.badge ? (
												<Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
													{item.badge}
												</Badge>
											) : null}
											{item.status === 'unpublished' ? (
												<Badge variant="outline" className="px-1.5 py-0 text-[10px] text-warning">
													Unpub
												</Badge>
											) : null}
										</div>
									</button>
								);
							})}

							{allowCustom && query.trim() !== '' ? (
								<button
									type="button"
									onClick={commitCustom}
									className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-left text-xs hover:bg-muted"
								>
									<DynamicIcon name="plus" className="size-3.5 text-primary shrink-0" />
									<span>
										Use custom value: <strong className="font-mono">{query.trim()}</strong>
									</span>
								</button>
							) : null}

							{visibleResults.length === 0 && !loading && (!allowCustom || !query.trim()) ? (
								<div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
									No matching records found.
								</div>
							) : null}

							{loading ? (
								<div className="px-2.5 py-2 text-center text-xs text-muted-foreground">{t('link.searching', 'Searching...')}</div>
							) : null}

							{hasMore && !loading ? (
								<button
									type="button"
									onClick={loadMore}
									className="w-full rounded-md py-1.5 text-center text-[11px] font-medium text-primary hover:bg-muted"
								>
									Load more results...
								</button>
							) : null}
						</div>
					</div>
				) : null}
			</div>

			{statusSlot}

			{multiple ? (
				<SelectedItemsStack
					cardinality={cardinality}
					values={multiValues}
					disabled={disabled}
					editableLink={editableLink}
					fallbackIcon={resourceMeta.icon}
					isSortable={isSortable}
					sortable={sortable}
					resolveItem={resolveItem}
					onRemove={(tok) => onCommitMulti(multiValues.filter((v) => v !== tok))}
				/>
			) : null}
		</div>
	);
}

/* ============================================================================
 * 3. Radios & Radio Cards (M2O)
 * ========================================================================== */

function RadioRelationWidget({
	cards,
	options,
	loading,
	value,
	optionColumns,
	disabled,
	required,
	editableLink,
	creatable,
	fallbackIcon,
	onSelect,
	onOpenQuickCreate,
}: {
	cards: boolean;
	options: RelationItemData[];
	loading: boolean;
	value: string;
	optionColumns: number;
	disabled: boolean;
	required: boolean;
	editableLink: boolean;
	creatable: boolean;
	fallbackIcon: string;
	onSelect: (tok: string, item?: RelationItemData) => void;
	onOpenQuickCreate: () => void;
}) {
	const gridCols =
		optionColumns === 4
			? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
			: optionColumns === 3
				? 'grid-cols-1 sm:grid-cols-3'
				: optionColumns === 2 || cards
					? 'grid-cols-1 sm:grid-cols-2'
					: 'grid-cols-1';

	const isMultiCol = cards || optionColumns >= 2;

	return (
		<div className="space-y-2">
			{loading && options.length === 0 ? (
				<p className="text-xs text-muted-foreground">{t('relation.loadingOptions', 'Loading options...')}</p>
			) : null}
			<div
				className={cn(
					isMultiCol
						? cn('grid gap-2', gridCols)
						: 'divide-y divide-border overflow-hidden rounded-md border border-border'
				)}
				role="radiogroup"
			>
				{options.map((opt) => {
					const tok = String(opt.value);
					const checked = value === tok;
					return (
						<label
							key={opt.key || tok}
							className={cn(
								'flex items-start justify-between gap-2 px-3 py-2 text-xs transition-colors',
								isMultiCol
									? cn(
											'rounded-md border',
											checked
												? 'border-primary bg-primary/6'
												: 'border-border/80 bg-muted/15 hover:bg-muted/40'
										)
									: checked
										? 'bg-primary/6'
										: 'hover:bg-muted/35',
								(disabled || opt.disabled) ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
							)}
						>
							<div className="flex items-start gap-2.5 min-w-0">
								<input
									type="radio"
									checked={checked}
									disabled={disabled || opt.disabled}
									onChange={() => onSelect(tok, opt)}
									className="mt-0.5 accent-primary"
								/>
								{cards ? <RelationItemVisual item={opt} fallbackIcon={fallbackIcon} size="md" /> : null}
								<div className="min-w-0">
									<div className="font-medium text-foreground truncate">{opt.label}</div>
									{opt.subtitle ? (
										<div className="font-mono text-[11px] text-muted-foreground truncate">
											{opt.subtitle}
										</div>
									) : null}
								</div>
							</div>
							<div className="flex items-center gap-1 shrink-0">
								{opt.badge ? (
									<Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
										{opt.badge}
									</Badge>
								) : null}
								<QuickEditButton item={opt} enabled={editableLink} />
							</div>
						</label>
					);
				})}
			</div>

			<div className="flex items-center gap-2">
				{!required && value && !disabled ? (
					<Button type="button" variant="ghost" size="xs" onClick={() => onSelect('')}>
						Clear selection
					</Button>
				) : null}
				{creatable && !disabled ? (
					<Button type="button" variant="outline" size="xs" icon="plus" onClick={onOpenQuickCreate}>
						Quick Create
					</Button>
				) : null}
			</div>
		</div>
	);
}

/* ============================================================================
 * 4. Checkboxes / MultiCheckbox (M2M)
 * ========================================================================== */

function CheckboxesRelationWidget({
	options,
	loading,
	selectedValues,
	optionColumns,
	maxItems,
	disabled,
	editableLink,
	creatable,
	fallbackIcon,
	onChange,
	onOpenQuickCreate,
}: {
	options: RelationItemData[];
	loading: boolean;
	selectedValues: string[];
	optionColumns: number;
	maxItems: number;
	disabled: boolean;
	editableLink: boolean;
	creatable: boolean;
	fallbackIcon: string;
	onChange: (next: string[], items?: RelationItemData[]) => void;
	onOpenQuickCreate: () => void;
}) {
	const [filter, setFilter] = useState('');
	const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

	const visibleOptions = useMemo(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return options;
		return options.filter(
			(o) =>
				o.label.toLowerCase().includes(q) ||
				String(o.value).toLowerCase().includes(q) ||
				(o.subtitle && o.subtitle.toLowerCase().includes(q))
		);
	}, [options, filter]);

	const gridCols =
		optionColumns === 4
			? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
			: optionColumns === 3
				? 'grid-cols-1 sm:grid-cols-3'
				: optionColumns === 2
					? 'grid-cols-1 sm:grid-cols-2'
					: 'grid-cols-1';

	const toggleOption = (opt: RelationItemData) => {
		const tok = String(opt.value);
		if (selectedSet.has(tok)) {
			onChange(selectedValues.filter((v) => v !== tok));
		} else if (maxItems === 0 || selectedValues.length < maxItems) {
			onChange([...selectedValues, tok], [opt]);
		}
	};

	return (
		<div className="space-y-2">
			{options.length > 6 ? (
				<div className="flex flex-wrap items-center justify-between gap-2">
					<Input
						aria-label={t('relation.filterOptions', 'Filter options...')}
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder={t('relation.filterOptions', 'Filter options...')}
						className="h-8 max-w-xs text-xs"
					/>
					{!disabled ? (
						<div className="flex items-center gap-1.5 text-xs">
							{maxItems === 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="xs"
									onClick={() => {
										const allTokens = visibleOptions
											.filter((o) => !o.disabled)
											.map((o) => String(o.value));
										const merged = Array.from(new Set([...selectedValues, ...allTokens]));
										onChange(merged, visibleOptions);
									}}
								>
									Select all
								</Button>
							) : null}
							{selectedValues.length > 0 ? (
								<Button type="button" variant="ghost" size="xs" onClick={() => onChange([])}>
									Clear ({selectedValues.length})
								</Button>
							) : null}
						</div>
					) : null}
				</div>
			) : null}

			{loading && options.length === 0 ? (
				<p className="text-xs text-muted-foreground">{t('relation.loadingOptions', 'Loading options...')}</p>
			) : null}

			<div
				className={cn(
					'max-h-72 overflow-y-auto',
					optionColumns >= 2
						? cn('grid gap-1.5 pr-1', gridCols)
						: 'divide-y divide-border rounded-md border border-border'
				)}
			>
				{visibleOptions.map((opt) => {
					const tok = String(opt.value);
					const checked = selectedSet.has(tok);
					const lockedByMax = !checked && maxItems > 0 && selectedValues.length >= maxItems;
					return (
						<label
							key={opt.key || tok}
							className={cn(
								'flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs transition-colors',
								optionColumns >= 2
									? cn(
											'rounded-md border',
											checked
												? 'border-primary/60 bg-primary/5'
												: 'border-border/80 bg-muted/15 hover:bg-muted/40'
										)
									: checked
										? 'bg-primary/6'
										: 'hover:bg-muted/35',
								(disabled || opt.disabled || lockedByMax)
									? 'opacity-55 pointer-events-none'
									: 'cursor-pointer'
							)}
						>
							<div className="flex items-center gap-2 min-w-0">
								<input
									type="checkbox"
									checked={checked}
									disabled={disabled || opt.disabled || lockedByMax}
									onChange={() => toggleOption(opt)}
									className="accent-primary"
								/>
								<RelationItemVisual item={opt} fallbackIcon={fallbackIcon} size="xs" />
								<span className="truncate font-medium text-foreground">{opt.label}</span>
								{opt.subtitle ? (
									<span className="truncate font-mono text-[11px] text-muted-foreground">
										{opt.subtitle}
									</span>
								) : null}
							</div>
							<div className="flex items-center gap-1 shrink-0">
								{opt.badge ? (
									<Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
										{opt.badge}
									</Badge>
								) : null}
								<QuickEditButton item={opt} enabled={editableLink} />
							</div>
						</label>
					);
				})}
			</div>

			{creatable && !disabled ? (
				<Button type="button" variant="outline" size="xs" icon="plus" onClick={onOpenQuickCreate}>
					Quick Create
				</Button>
			) : null}
		</div>
	);
}

/* ============================================================================
 * 5. Transfer / Dual-List Shuttle (M2M)
 * ========================================================================== */

function TransferRelationWidget({
	options,
	loading,
	selectedValues,
	maxItems,
	disabled,
	editableLink,
	fallbackIcon,
	resolveItem,
	onChange,
}: {
	options: RelationItemData[];
	loading: boolean;
	selectedValues: string[];
	maxItems: number;
	disabled: boolean;
	editableLink: boolean;
	fallbackIcon: string;
	resolveItem: (tok: string) => RelationItemData;
	onChange: (next: string[], items?: RelationItemData[]) => void;
}) {
	const [leftFilter, setLeftFilter] = useState('');
	const [rightFilter, setRightFilter] = useState('');

	const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

	const available = useMemo(() => {
		const q = leftFilter.trim().toLowerCase();
		return options.filter((o) => {
			if (selectedSet.has(String(o.value))) return false;
			if (!q) return true;
			return o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q);
		});
	}, [options, selectedSet, leftFilter]);

	const chosen = useMemo(() => {
		const q = rightFilter.trim().toLowerCase();
		return selectedValues
			.map((tok) => ({ tok, item: resolveItem(tok) }))
			.filter(({ tok, item }) => !q || item.label.toLowerCase().includes(q) || tok.toLowerCase().includes(q));
	}, [selectedValues, rightFilter, resolveItem]);

	const moveItem = (idx: number, dir: -1 | 1) => {
		const target = idx + dir;
		if (target < 0 || target >= selectedValues.length) return;
		const copy = [...selectedValues];
		const [moved] = copy.splice(idx, 1);
		if (moved === undefined) return;
		copy.splice(target, 0, moved);
		onChange(copy);
	};

	return (
		<div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-md border border-border md:grid-cols-2 md:divide-x md:divide-y-0">
			<div className="flex flex-col">
				<div className="flex items-center justify-between border-b border-border/70 bg-muted/25 px-2.5 py-1.5 text-xs font-semibold text-foreground">
					<span>Available ({available.length})</span>
					{!disabled && available.length > 0 && maxItems === 0 ? (
						<button
							type="button"
							onClick={() =>
								onChange(
									[...selectedValues, ...available.filter((a) => !a.disabled).map((a) => String(a.value))],
									available
								)
							}
							className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
						>
							Add all &rarr;
						</button>
					) : null}
				</div>
				<div className="flex items-center gap-1.5 border-b border-border/60 bg-background/60 px-2.5 py-1">
					<DynamicIcon name="search" className="size-3.5 shrink-0 text-muted-foreground" />
					<input
						type="search"
						value={leftFilter}
						onChange={(e) => setLeftFilter(e.target.value)}
						aria-label={t('relation.filterAvailableItems', 'Filter available items')}
						placeholder={t('relation.filterAvailablePlaceholder', 'Filter available...')}
						data-rw-bare-input=""
						className="uk-form-blank h-6 w-full border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
					/>
				</div>
				<div className="h-52 divide-y divide-border/50 overflow-y-auto">
					{loading && options.length === 0 ? (
						<p className="p-2.5 text-xs text-muted-foreground">{t('common.loading', 'Loading...')}</p>
					) : null}
					{available.map((opt) => {
						const tok = String(opt.value);
						const atLimit = maxItems > 0 && selectedValues.length >= maxItems;
						return (
							<button
								key={opt.key || tok}
								type="button"
								disabled={disabled || opt.disabled || atLimit}
								onClick={() => onChange([...selectedValues, tok], [opt])}
								className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/50 disabled:opacity-50 cursor-pointer"
							>
								<div className="flex items-center gap-2 min-w-0">
									<RelationItemVisual item={opt} fallbackIcon={fallbackIcon} size="xs" />
									<span className="truncate">{opt.label}</span>
								</div>
								<DynamicIcon name="chevron-right" className="size-3.5 text-muted-foreground shrink-0" />
							</button>
						);
					})}
				</div>
			</div>

			<div className="flex flex-col">
				<div className="flex items-center justify-between border-b border-border/70 bg-muted/25 px-2.5 py-1.5 text-xs font-semibold text-foreground">
					<span>Selected ({selectedValues.length})</span>
					{!disabled && selectedValues.length > 0 ? (
						<button
							type="button"
							onClick={() => onChange([])}
							className="text-[11px] font-medium text-destructive hover:underline cursor-pointer"
						>
							Clear all
						</button>
					) : null}
				</div>
				<div className="flex items-center gap-1.5 border-b border-border/60 bg-background/60 px-2.5 py-1">
					<DynamicIcon name="search" className="size-3.5 shrink-0 text-muted-foreground" />
					<input
						type="search"
						value={rightFilter}
						onChange={(e) => setRightFilter(e.target.value)}
						aria-label={t('relation.filterSelectedItems', 'Filter selected items')}
						placeholder={t('relation.filterSelectedPlaceholder', 'Filter selected...')}
						data-rw-bare-input=""
						className="uk-form-blank h-6 w-full border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
					/>
				</div>
				<div className="h-52 divide-y divide-border/50 overflow-y-auto">
					{chosen.map(({ tok, item }) => {
						const realIdx = selectedValues.indexOf(tok);
						return (
							<div
								key={tok}
								className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/35"
							>
								<div className="flex items-center gap-2 min-w-0">
									<RelationItemVisual item={item} fallbackIcon={fallbackIcon} size="xs" />
									<span className="truncate font-medium">{item.label}</span>
								</div>
								<div className="flex items-center gap-0.5 shrink-0">
									{!disabled ? (
										<>
											<button
												type="button"
												onClick={() => moveItem(realIdx, -1)}
												disabled={realIdx <= 0}
												className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
												aria-label={t('relation.moveUp', 'Move up')}
											>
												<DynamicIcon name="arrow-up" className="size-3" />
											</button>
											<button
												type="button"
												onClick={() => moveItem(realIdx, 1)}
												disabled={realIdx >= selectedValues.length - 1}
												className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
												aria-label={t('relation.moveDown', 'Move down')}
											>
												<DynamicIcon name="arrow-down" className="size-3" />
											</button>
										</>
									) : null}
									<QuickEditButton item={item} enabled={editableLink} />
									{!disabled ? (
										<button
											type="button"
											onClick={() => onChange(selectedValues.filter((v) => v !== tok))}
											className="rounded p-0.5 text-muted-foreground hover:text-destructive cursor-pointer"
											aria-label={`Remove ${item.label}`}
										>
											<DynamicIcon name="x" className="size-3.5" />
										</button>
									) : null}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/* ============================================================================
 * 6. TreeSelect — Hierarchical Lazy Page Tree + Search Fallback (M2O & M2M)
 * ========================================================================== */

function TreeSelectRelationWidget({
	initialTree,
	dependsValue,
	multiple,
	scalarValue,
	multiValues,
	maxItems,
	disabled,
	editableLink,
	creatable,
	placeholder,
	fallbackIcon,
	sortable,
	isSortable,
	statusSlot,
	resolveItem,
	callEndpoint,
	onCommitScalar,
	onCommitMulti,
	onOpenQuickCreate,
}: {
	initialTree: RelationItemData[];
	dependsValue?: string;
	multiple: boolean;
	scalarValue: string;
	multiValues: string[];
	maxItems: number;
	disabled: boolean;
	editableLink: boolean;
	creatable: boolean;
	placeholder?: string;
	fallbackIcon: string;
	sortable: ReturnType<typeof useSortableList<string>>;
	isSortable: boolean;
	statusSlot?: React.ReactNode;
	resolveItem: (tok: string) => RelationItemData;
	callEndpoint: (
		payload: Record<string, unknown>,
		mutating?: boolean,
		signal?: AbortSignal
	) => Promise<{
		ok?: boolean;
		error?: string;
		item?: RelationItemData;
		items?: RelationItemData[];
		tree?: RelationItemData[];
		total?: number;
		hasMore?: boolean;
		[key: string]: unknown;
	}>;
	onCommitScalar: (val: string, item?: RelationItemData) => void;
	onCommitMulti: (vals: string[], items?: RelationItemData[]) => void;
	onOpenQuickCreate: (resourceOverride?: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [rootNodes, setRootNodes] = useState<RelationItemData[]>(initialTree);
	const [childrenMap, setChildrenMap] = useState<Record<string, RelationItemData[]>>({});
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [loadingNode, setLoadingNode] = useState<Record<string, boolean>>({});
	const [searchQuery, setSearchQuery] = useState('');
	const [searchResults, setSearchResults] = useState<RelationItemData[]>([]);
	const [searching, setSearching] = useState(false);

	const prevTreeDependsRef = useRef<string | undefined>(dependsValue);
	useEffect(() => {
		if (prevTreeDependsRef.current !== dependsValue) {
			prevTreeDependsRef.current = dependsValue;
			setRootNodes([]);
			setChildrenMap({});
			setExpanded({});
			setSearchResults([]);
		}
	}, [dependsValue]);

	useEffect(() => {
		if (!open || rootNodes.length > 0) return;
		callEndpoint({ action: 'tree' }).then((res) => {
			if (res?.ok && Array.isArray(res.items)) {
				setRootNodes(res.items);
			}
		});
	}, [open, rootNodes.length, callEndpoint]);

	useEffect(() => {
		const q = searchQuery.trim();
		if (!q) {
			setSearchResults([]);
			return;
		}
		const ctrl = new AbortController();
		const timer = window.setTimeout(() => {
			setSearching(true);
			callEndpoint({ action: 'search', q, page: 1, limit: 30 }, false, ctrl.signal)
				.then((res) => {
					if (res?.ok && Array.isArray(res.items)) {
						setSearchResults(res.items);
					}
				})
				.catch(() => {})
				.finally(() => setSearching(false));
		}, 200);
		return () => {
			window.clearTimeout(timer);
			ctrl.abort();
		};
	}, [searchQuery, callEndpoint]);

	const toggleExpand = (node: RelationItemData) => {
		const nodeId = String(node.id);
		const nextOpen = !expanded[nodeId];
		setExpanded((prev) => ({ ...prev, [nodeId]: nextOpen }));
		if (nextOpen && node.hasChildren && !childrenMap[nodeId]) {
			setLoadingNode((prev) => ({ ...prev, [nodeId]: true }));
			callEndpoint({ action: 'tree', parentId: node.id })
				.then((res) => {
					if (res?.ok && Array.isArray(res.items)) {
						setChildrenMap((prev) => ({ ...prev, [nodeId]: res.items ?? [] }));
					}
				})
				.finally(() => setLoadingNode((prev) => ({ ...prev, [nodeId]: false })));
		}
	};

	const selectedSet = useMemo(
		() => new Set(multiple ? multiValues : scalarValue ? [scalarValue] : []),
		[multiple, multiValues, scalarValue]
	);

	const toggleSelect = (node: RelationItemData) => {
		if (disabled || node.disabled) return;
		const tok = String(node.value);
		if (multiple) {
			if (selectedSet.has(tok)) {
				onCommitMulti(multiValues.filter((v) => v !== tok));
			} else if (maxItems === 0 || multiValues.length < maxItems) {
				onCommitMulti([...multiValues, tok], [node]);
			}
		} else {
			onCommitScalar(tok, node);
			setOpen(false);
		}
	};

	const renderTreeNodes = (nodes: RelationItemData[], depth = 0): React.ReactNode =>
		nodes.map((node) => {
			const nodeId = String(node.id);
			const tok = String(node.value);
			const isExp = Boolean(expanded[nodeId]);
			const isBusy = Boolean(loadingNode[nodeId]);
			const isSelected = selectedSet.has(tok);
			const subNodes = childrenMap[nodeId] || [];

			return (
				<div key={node.key || tok}>
					<div
						style={{ paddingLeft: `${depth * 16 + 6}px` }}
						className={cn(
							'flex items-center justify-between gap-2 rounded-md py-1 pr-2 text-xs transition-colors',
							isSelected ? 'bg-primary/10 font-semibold text-foreground' : 'hover:bg-muted/70 text-foreground'
						)}
					>
						<div className="flex items-center gap-1.5 min-w-0">
							{node.hasChildren ? (
								<button
									type="button"
									onClick={() => toggleExpand(node)}
									className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
									aria-label={isExp ? 'Collapse' : 'Expand'}
								>
									<DynamicIcon
										name={isExp ? 'chevron-down' : 'chevron-right'}
										className="size-3.5"
									/>
								</button>
							) : (
								<span className="inline-block w-4" />
							)}

							<button
								type="button"
								disabled={disabled || node.disabled}
								onClick={() => toggleSelect(node)}
								className="flex items-center gap-1.5 min-w-0 text-left disabled:opacity-50 cursor-pointer"
							>
								<DynamicIcon
									name={node.hasChildren ? (isExp ? 'folder-open' : 'folder') : node.icon || fallbackIcon}
									className="size-3.5 text-muted-foreground shrink-0"
								/>
								<span className="truncate">{node.label}</span>
								{node.numChildren ? (
									<span className="text-[10px] text-muted-foreground tabular-nums">
										({node.numChildren})
									</span>
								) : null}
							</button>
						</div>

						<div className="flex items-center gap-1 shrink-0">
							{node.badge ? (
								<Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
									{node.badge}
								</Badge>
							) : null}
							{isSelected ? <DynamicIcon name="check" className="size-3.5 text-primary" /> : null}
						</div>
					</div>
					{isBusy ? (
						<div style={{ paddingLeft: `${(depth + 1) * 16 + 24}px` }} className="py-1 text-[11px] text-muted-foreground">
							Loading children...
						</div>
					) : null}
					{isExp && subNodes.length > 0 ? renderTreeNodes(subNodes, depth + 1) : null}
				</div>
			);
		});

	const selectedSingle = !multiple && scalarValue ? resolveItem(scalarValue) : undefined;

	return (
		<div className="space-y-1.5">
			<div data-rw-field-slot="input" className="space-y-2">
				{!multiple && selectedSingle ? (
					<div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-input-surface px-3 text-xs shadow-2xs">
						<div className="flex items-center gap-2 min-w-0">
							<RelationItemVisual item={selectedSingle} fallbackIcon={fallbackIcon} size="sm" />
							<span className="truncate font-medium text-foreground">{selectedSingle.label}</span>
							{selectedSingle.subtitle ? (
								<span className="truncate font-mono text-[11px] text-muted-foreground">
									{selectedSingle.subtitle}
								</span>
							) : null}
						</div>
						<div className="flex items-center gap-1 shrink-0">
							<QuickEditButton item={selectedSingle} enabled={editableLink} />
							{!disabled ? (
								<button
									type="button"
									onClick={() => onCommitScalar('')}
									className="rounded p-1 text-muted-foreground hover:text-destructive cursor-pointer"
									aria-label={t('common.clear', 'Clear')}
								>
									<DynamicIcon name="x" className="size-3.5" />
								</button>
							) : null}
						</div>
					</div>
				) : null}

				{!disabled ? (
					<div className="flex items-center gap-1.5">
						<Button
							type="button"
							variant="outline"
							size="xs"
							icon="folder"
							onClick={() => setOpen((o) => !o)}
						>
							{open ? 'Hide Page Tree' : placeholder || (selectedSingle || multiValues.length > 0 ? 'Browse Tree...' : 'Select from Page Tree...')}
						</Button>
						{creatable ? (
							<Button type="button" variant="outline" size="xs" icon="plus" onClick={() => onOpenQuickCreate()}>
								New
							</Button>
						) : null}
					</div>
				) : null}

				{open && !disabled ? (
					<div className="overflow-hidden rounded-md border border-border">
						<div className="flex items-center gap-2 border-b border-border bg-muted/20 px-2.5 py-1.5">
							<DynamicIcon name="search" className="size-3.5 shrink-0 text-muted-foreground" />
							<input
								type="search"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								aria-label={t('link.searchPages', 'Search pages')}
								placeholder={t('relation.searchPagesHierarchy', 'Search pages or browse hierarchy below...')}
								data-rw-bare-input=""
								className="uk-form-blank h-6 w-full border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
							/>
						</div>
						<div className="max-h-72 overflow-y-auto p-1.5">
							{searchQuery.trim() ? (
								searching ? (
									<p className="p-2 text-xs text-muted-foreground">{t('link.searching', 'Searching...')}</p>
								) : searchResults.length > 0 ? (
									<div className="space-y-0.5">
										{searchResults.map((item) => {
											const tok = String(item.value);
											const isSelected = selectedSet.has(tok);
											return (
												<button
													key={item.key || tok}
													type="button"
													disabled={item.disabled}
													onClick={() => toggleSelect(item)}
													className={cn(
														'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-muted cursor-pointer',
														isSelected && 'bg-primary/10 font-semibold'
													)}
												>
													<div className="min-w-0 truncate">
														<span>{item.label}</span>
														{item.subtitle ? (
															<span className="ml-2 font-mono text-[11px] text-muted-foreground">
																{item.subtitle}
															</span>
														) : null}
													</div>
													{isSelected ? <DynamicIcon name="check" className="size-3.5 text-primary" /> : null}
												</button>
											);
										})}
									</div>
								) : (
									<p className="p-2 text-xs text-muted-foreground">{t('relation.noMatchingPages', 'No matching pages found.')}</p>
								)
							) : rootNodes.length > 0 ? (
								renderTreeNodes(rootNodes)
							) : (
								<p className="p-2 text-xs text-muted-foreground">{t('relation.noSelectablePages', 'No selectable pages found.')}</p>
							)}
						</div>
					</div>
				) : null}
			</div>

			{statusSlot}

			{multiple ? (
				<SelectedItemsStack
					cardinality="m2m"
					values={multiValues}
					disabled={disabled}
					editableLink={editableLink}
					fallbackIcon={fallbackIcon}
					isSortable={isSortable}
					sortable={sortable}
					resolveItem={resolveItem}
					onRemove={(tok) => onCommitMulti(multiValues.filter((v) => v !== tok))}
				/>
			) : null}
		</div>
	);
}

/* ============================================================================
 * 7. Picker & Morph-Picker Drawer (`<Sheet />`)
 * ========================================================================== */

function PickerDrawerRelationWidget({
	cardinality,
	multiple,
	scalarValue,
	multiValues,
	maxItems,
	disabled,
	editableLink,
	creatable,
	resourceMeta,
	resources,
	allowedResources,
	sortable,
	isSortable,
	statusSlot,
	resolveItem,
	callEndpoint,
	onCommitScalar,
	onCommitMulti,
	onOpenQuickCreate,
}: {
	cardinality: string;
	multiple: boolean;
	scalarValue: string;
	multiValues: string[];
	maxItems: number;
	disabled: boolean;
	editableLink: boolean;
	creatable: boolean;
	resourceMeta: { name: string; label: string; icon: string };
	resources: RelationResourceDescriptor[];
	allowedResources: string[];
	sortable: ReturnType<typeof useSortableList<string>>;
	isSortable: boolean;
	statusSlot?: React.ReactNode;
	resolveItem: (tok: string) => RelationItemData;
	callEndpoint: (
		payload: Record<string, unknown>,
		mutating?: boolean,
		signal?: AbortSignal
	) => Promise<{
		ok?: boolean;
		error?: string;
		item?: RelationItemData;
		items?: RelationItemData[];
		tree?: RelationItemData[];
		total?: number;
		hasMore?: boolean;
		[key: string]: unknown;
	}>;
	onCommitScalar: (val: string, item?: RelationItemData) => void;
	onCommitMulti: (vals: string[], items?: RelationItemData[]) => void;
	onOpenQuickCreate: (resourceOverride?: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [page, setPage] = useState(1);
	const [activeTab, setActiveTab] = useState<string>('_all');
	const [items, setItems] = useState<RelationItemData[]>([]);
	const [total, setTotal] = useState(0);
	const [hasMore, setHasMore] = useState(false);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!open) return;
		const ctrl = new AbortController();
		const timer = window.setTimeout(() => {
			setLoading(true);
			callEndpoint(
				{
					action: 'search',
					q: query,
					page,
					limit: 20,
					resource: cardinality === 'm2a' ? activeTab : undefined,
				},
				false,
				ctrl.signal
			)
				.then((res) => {
					if (res?.ok && Array.isArray(res.items)) {
						setItems(res.items);
						setTotal(Number(res.total || res.items.length));
						setHasMore(Boolean(res.hasMore));
					}
				})
				.catch(() => {})
				.finally(() => setLoading(false));
		}, 180);
		return () => {
			window.clearTimeout(timer);
			ctrl.abort();
		};
	}, [open, query, page, activeTab, cardinality, callEndpoint]);

	const selectedSet = useMemo(
		() => new Set(multiple ? multiValues : scalarValue ? [scalarValue] : []),
		[multiple, multiValues, scalarValue]
	);

	const selectedSingle = !multiple && scalarValue ? resolveItem(scalarValue) : undefined;

	const toggleRow = (item: RelationItemData) => {
		const tok = itemStoredToken(item, cardinality);
		if (multiple) {
			if (selectedSet.has(tok)) {
				onCommitMulti(multiValues.filter((v) => v !== tok));
			} else if (maxItems === 0 || multiValues.length < maxItems) {
				onCommitMulti([...multiValues, tok], [item]);
			}
		} else {
			onCommitScalar(tok, item);
			setOpen(false);
		}
	};

	return (
		<div className="space-y-1.5">
			<div data-rw-field-slot="input" className="space-y-2">
				{!multiple && selectedSingle ? (
					<div className="flex min-h-9 items-center justify-between gap-2 rounded-md border border-input bg-input-surface px-3 py-1.5 text-xs shadow-2xs">
						<div className="flex items-center gap-2 min-w-0">
							<RelationItemVisual item={selectedSingle} fallbackIcon={resourceMeta.icon} size="md" />
							<div className="min-w-0">
								<div className="font-medium text-foreground truncate">{selectedSingle.label}</div>
								{selectedSingle.subtitle ? (
									<div className="font-mono text-[11px] text-muted-foreground truncate">
										{selectedSingle.subtitle}
									</div>
								) : null}
							</div>
						</div>
						<div className="flex items-center gap-1 shrink-0">
							<QuickEditButton item={selectedSingle} enabled={editableLink} />
							{!disabled ? (
								<button
									type="button"
									onClick={() => onCommitScalar('')}
									className="rounded p-1 text-muted-foreground hover:text-destructive cursor-pointer"
									aria-label={t('common.clear', 'Clear')}
								>
									<DynamicIcon name="x" className="size-3.5" />
								</button>
							) : null}
						</div>
					</div>
				) : null}

				{!disabled ? (
					<div className="flex items-center gap-1.5">
						<Button
							type="button"
							variant="outline"
							size="xs"
							icon="search"
							onClick={() => setOpen(true)}
						>
							{cardinality === 'm2a' ? 'Browse Resources...' : `Browse ${resourceMeta.label}...`}
						</Button>
						{(() => {
							if (!creatable) return null;
							if (cardinality !== 'm2a') {
								return (
									<Button type="button" variant="outline" size="xs" icon="plus" onClick={() => onOpenQuickCreate()}>
										New
									</Button>
								);
							}
							const candidateTab =
								activeTab !== '_all'
									? activeTab
									: allowedResources.filter((n) => resources.find((r) => r.name === n)?.supportsQuickCreate)[0] || '';
							const tabMeta = candidateTab ? resources.find((r) => r.name === candidateTab) : undefined;
							if (!tabMeta?.supportsQuickCreate) return null;
							return (
								<Button type="button" variant="outline" size="xs" icon="plus" onClick={() => onOpenQuickCreate(tabMeta.name)}>
									New {tabMeta.label}
								</Button>
							);
						})()}
					</div>
				) : null}
			</div>

			{statusSlot}

			{multiple ? (
				<SelectedItemsStack
					cardinality={cardinality}
					values={multiValues}
					disabled={disabled}
					editableLink={editableLink}
					fallbackIcon={resourceMeta.icon}
					isSortable={isSortable}
					sortable={sortable}
					resolveItem={resolveItem}
					onRemove={(tok) => onCommitMulti(multiValues.filter((v) => v !== tok))}
				/>
			) : null}

			<Sheet
				open={open}
				onOpenChange={setOpen}
				title={cardinality === 'm2a' ? 'Select Resource Items' : `Select ${resourceMeta.label}`}
				subtitle={total > 0 ? `${total} matching record(s)` : undefined}
			>
				<div className="space-y-4">
					{cardinality === 'm2a' && allowedResources.length > 1 ? (
						<div className="flex flex-wrap items-center gap-1.5">
							<Button
								type="button"
								variant={activeTab === '_all' ? 'default' : 'outline'}
								size="xs"
								onClick={() => {
									setActiveTab('_all');
									setPage(1);
								}}
							>
								All
							</Button>
							{allowedResources.map((resName) => {
								const meta = resources.find((r) => r.name === resName);
								return (
									<Button
										key={resName}
										type="button"
										variant={activeTab === resName ? 'default' : 'outline'}
										size="xs"
										onClick={() => {
											setActiveTab(resName);
											setPage(1);
										}}
									>
										{meta?.label || resName}
									</Button>
								);
							})}
						</div>
					) : null}

					<Input
						aria-label={t('relation.searchModalPlaceholder', 'Search by title, slug, ID, or path...')}
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setPage(1);
						}}
						placeholder={t('relation.searchModalPlaceholder', 'Search by title, slug, ID, or path...')}
						autoFocus
					/>

					<div className="divide-y divide-border rounded-lg border border-border">
						{items.map((item) => {
							const tok = itemStoredToken(item, cardinality);
							const checked = selectedSet.has(tok);
							return (
								<button
									key={item.key || tok}
									type="button"
									disabled={item.disabled}
									onClick={() => toggleRow(item)}
									className={cn(
										'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/60 cursor-pointer',
										checked && 'bg-primary/8'
									)}
								>
									<div className="flex items-center gap-2.5 min-w-0">
										<RelationItemVisual item={item} fallbackIcon={resourceMeta.icon} size="md" />
										<div className="min-w-0">
											<div className="flex items-center gap-1.5">
												{cardinality === 'm2a' ? (
													<Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase">
														{item.resourceLabel || item.resource}
													</Badge>
												) : null}
												<span className="font-medium text-foreground truncate">{item.label}</span>
											</div>
											{item.subtitle ? (
												<div className="font-mono text-[11px] text-muted-foreground truncate">
													{item.subtitle}
												</div>
											) : null}
										</div>
									</div>
									<div className="flex items-center gap-2 shrink-0">
										{item.badge ? (
											<Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
												{item.badge}
											</Badge>
										) : null}
										{checked ? (
											<DynamicIcon name="check" className="size-4 text-primary" />
										) : null}
									</div>
								</button>
							);
						})}

						{items.length === 0 ? (
							<div className="p-6 text-center text-xs text-muted-foreground">
								{loading ? 'Loading records...' : 'No records match your search.'}
							</div>
						) : null}
					</div>

					<div className="flex items-center justify-between pt-2">
						<div className="flex items-center gap-1.5">
							<Button
								type="button"
								variant="outline"
								size="xs"
								disabled={page <= 1 || loading}
								onClick={() => setPage((p) => Math.max(1, p - 1))}
							>
								Previous
							</Button>
							<Button
								type="button"
								variant="outline"
								size="xs"
								disabled={!hasMore || loading}
								onClick={() => setPage((p) => p + 1)}
							>
								Next
							</Button>
						</div>
						<Button type="button" size="xs" onClick={() => setOpen(false)}>
							Done {multiple && multiValues.length > 0 ? `(${multiValues.length})` : ''}
						</Button>
					</div>
				</div>
			</Sheet>
		</div>
	);
}

/* ============================================================================
 * 8. O2M Reverse Relation Manager (`subtable`, `cards`, `list`)
 * ========================================================================== */

function O2MRelationView({
	widget,
	initialItems,
	resourceLabel,
	resourceIcon,
	ownerId,
	foreignField,
	creatable,
	allowLink,
	allowUnlink,
	editableLink,
	refreshTick,
	statusSlot,
	callEndpoint,
	onOpenQuickCreate,
}: {
	widget: string;
	initialItems: RelationItemData[];
	resourceLabel: string;
	resourceIcon: string;
	ownerId?: string | number;
	foreignField: string;
	creatable: boolean;
	allowLink: boolean;
	allowUnlink: boolean;
	editableLink: boolean;
	refreshTick: number;
	statusSlot?: React.ReactNode;
	callEndpoint: (
		payload: Record<string, unknown>,
		mutating?: boolean,
		signal?: AbortSignal
	) => Promise<{
		ok?: boolean;
		error?: string;
		item?: RelationItemData;
		items?: RelationItemData[];
		tree?: RelationItemData[];
		total?: number;
		hasMore?: boolean;
		[key: string]: unknown;
	}>;
	onOpenQuickCreate: () => void;
}) {
	const [items, setItems] = useState<RelationItemData[]>(initialItems);
	const [total, setTotal] = useState<number>(initialItems.length);
	const [query, setQuery] = useState('');
	const [loading, setLoading] = useState(false);
	const [linkDrawerOpen, setLinkDrawerOpen] = useState(false);
	const [linkSearch, setLinkSearch] = useState('');
	const [linkCandidates, setLinkCandidates] = useState<RelationItemData[]>([]);
	const [busyTarget, setBusyTarget] = useState<string>('');

	const hasOwner = Boolean(ownerId !== undefined && ownerId !== null && String(ownerId) !== '' && String(ownerId) !== '0');

	const fetchO2mList = useCallback(
		(searchStr = query) => {
			if (!hasOwner || !foreignField) return;
			setLoading(true);
			callEndpoint({ action: 'o2m_list', q: searchStr, page: 1, limit: 50 })
				.then((res) => {
					if (res?.ok && Array.isArray(res.items)) {
						setItems(res.items);
						setTotal(Number(res.total ?? res.items.length));
					}
				})
				.catch(() => {})
				.finally(() => setLoading(false));
		},
		[hasOwner, foreignField, query, callEndpoint]
	);

	useEffect(() => {
		if (refreshTick > 0) {
			fetchO2mList();
		}
	}, [refreshTick, fetchO2mList]);

	useEffect(() => {
		if (!linkDrawerOpen) return;
		const ctrl = new AbortController();
		const timer = window.setTimeout(() => {
			callEndpoint({ action: 'search', q: linkSearch, page: 1, limit: 25 }, false, ctrl.signal).then((res) => {
				if (res?.ok && Array.isArray(res.items)) {
					setLinkCandidates(res.items);
				}
			});
		}, 180);
		return () => {
			window.clearTimeout(timer);
			ctrl.abort();
		};
	}, [linkDrawerOpen, linkSearch, callEndpoint]);

	const handleLinkItem = async (candidate: RelationItemData) => {
		const targetVal = String(candidate.value);
		setBusyTarget(targetVal);
		try {
			const res = await callEndpoint({ action: 'o2m_link', targetValue: candidate.value }, true);
			if (res?.ok) {
				fetchO2mList();
			}
		} finally {
			setBusyTarget('');
		}
	};

	const handleUnlinkItem = async (item: RelationItemData) => {
		const targetVal = String(item.value);
		setBusyTarget(targetVal);
		try {
			const res = await callEndpoint({ action: 'o2m_unlink', targetValue: item.value }, true);
			if (res?.ok) {
				setItems((prev) => prev.filter((p) => String(p.value) !== targetVal));
				setTotal((t) => Math.max(0, t - 1));
			}
		} finally {
			setBusyTarget('');
		}
	};

	if (!hasOwner) {
		return (
			<div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
				Save this record first to manage incoming <strong>{resourceLabel}</strong> relations.
			</div>
		);
	}

	const linkedValues = new Set(items.map((i) => String(i.value)));

	return (
		<div className="space-y-2.5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<Input
						aria-label={`Filter incoming ${resourceLabel.toLowerCase()}...`}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								fetchO2mList(query);
							}
						}}
						placeholder={`Filter incoming ${resourceLabel.toLowerCase()}...`}
						className="h-8 w-52 text-xs"
					/>
					<Badge variant="secondary" className="text-[11px] tabular-nums">
						{total}
					</Badge>
				</div>

				<div className="flex items-center gap-1.5">
					<Button
						type="button"
						variant="ghost"
						size="xs"
						onClick={() => fetchO2mList(query)}
						disabled={loading}
					>
						Refresh
					</Button>
					{allowLink ? (
						<Button
							type="button"
							variant="outline"
							size="xs"
							icon="link-2"
							onClick={() => setLinkDrawerOpen(true)}
						>
							Link Existing
						</Button>
					) : null}
					{creatable ? (
						<Button type="button" variant="outline" size="xs" icon="plus" onClick={onOpenQuickCreate}>
							Create New
						</Button>
					) : null}
				</div>
			</div>

			{statusSlot}

			{items.length === 0 ? (
				<div className="rounded-md border border-dashed border-border/70 bg-muted/15 px-3 py-3 text-center text-xs text-muted-foreground">
					{loading ? 'Loading related records...' : `No related ${resourceLabel.toLowerCase()} records linked yet.`}
				</div>
			) : widget === 'cards' ? (
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{items.map((item) => (
						<div
							key={item.key || String(item.value)}
							className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/15 px-3 py-2"
						>
							<div className="flex items-center gap-2.5 min-w-0">
								<RelationItemVisual item={item} fallbackIcon={resourceIcon} size="md" />
								<div className="min-w-0">
									<div className="font-medium text-xs text-foreground truncate">{item.label}</div>
									{item.subtitle ? (
										<div className="font-mono text-[11px] text-muted-foreground truncate">
											{item.subtitle}
										</div>
									) : null}
								</div>
							</div>
							<div className="flex items-center gap-1 shrink-0">
								<QuickEditButton item={item} enabled={editableLink} />
								{allowUnlink ? (
									<button
										type="button"
										disabled={busyTarget === String(item.value)}
										onClick={() => void handleUnlinkItem(item)}
										title={t('relation.unlink', 'Unlink')}
										aria-label={t('relation.unlinkNamed', { label: item.label }, 'Unlink {label}')}
										className="rounded p-1 text-muted-foreground hover:text-destructive cursor-pointer"
									>
										<DynamicIcon name="unlink" className="size-3.5" />
									</button>
								) : null}
							</div>
						</div>
					))}
				</div>
			) : widget === 'list' ? (
				<div className="divide-y divide-border overflow-hidden rounded-md border border-border">
					{items.map((item) => (
						<div
							key={item.key || String(item.value)}
							className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
						>
							<div className="flex items-center gap-2 min-w-0">
								<RelationItemVisual item={item} fallbackIcon={resourceIcon} size="sm" />
								<span className="truncate font-medium text-foreground">{item.label}</span>
								{item.subtitle ? (
									<span className="truncate font-mono text-[11px] text-muted-foreground">
										{item.subtitle}
									</span>
								) : null}
							</div>
							<div className="flex items-center gap-1 shrink-0">
								<QuickEditButton item={item} enabled={editableLink} />
								{allowUnlink ? (
									<button
										type="button"
										disabled={busyTarget === String(item.value)}
										onClick={() => void handleUnlinkItem(item)}
										aria-label={t('relation.unlink', 'Unlink')}
										title={t('relation.unlink', 'Unlink')}
										className="rounded p-1 text-muted-foreground hover:text-destructive cursor-pointer"
									>
										<DynamicIcon name="unlink" className="size-3.5" />
									</button>
								) : null}
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="rounded-lg border border-border overflow-hidden">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="text-xs">{t('relation.titleLabel', 'Title')}</TableHead>
								<TableHead className="text-xs">{t('relation.referenceColumn', 'Reference')}</TableHead>
								<TableHead className="text-xs">{t('relation.typeStatusColumn', 'Type / Status')}</TableHead>
								<TableHead className="w-20 text-right text-xs">{t('common.actions', 'Actions')}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item) => (
								<TableRow key={item.key || String(item.value)}>
									<TableCell className="py-2 text-xs font-medium">
										<div className="flex items-center gap-2">
											<RelationItemVisual item={item} fallbackIcon={resourceIcon} size="sm" />
											<span className="truncate">{item.label}</span>
										</div>
									</TableCell>
									<TableCell className="py-2 font-mono text-[11px] text-muted-foreground">
										{item.subtitle || String(item.id)}
									</TableCell>
									<TableCell className="py-2">
										<div className="flex items-center gap-1">
											{item.badge ? (
												<Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
													{item.badge}
												</Badge>
											) : null}
											{item.status && item.status !== 'published' ? (
												<Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
													{item.status}
												</Badge>
											) : null}
										</div>
									</TableCell>
									<TableCell className="py-2 text-right">
										<div className="inline-flex items-center justify-end gap-1">
											<QuickEditButton item={item} enabled={editableLink} />
											{allowUnlink ? (
												<button
													type="button"
													disabled={busyTarget === String(item.value)}
													onClick={() => void handleUnlinkItem(item)}
													title="Unlink"
													aria-label={`Unlink ${item.label}`}
													className="rounded p-1 text-muted-foreground hover:text-destructive cursor-pointer"
												>
													<DynamicIcon name="unlink" className="size-3.5" />
												</button>
											) : null}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<Sheet
				open={linkDrawerOpen}
				onOpenChange={setLinkDrawerOpen}
				title={`Link Existing ${resourceLabel}`}
				subtitle={`Attach existing ${resourceLabel.toLowerCase()} records via "${foreignField}"`}
			>
				<div className="space-y-3">
					<Input
						aria-label={`Search ${resourceLabel.toLowerCase()}...`}
						value={linkSearch}
						onChange={(e) => setLinkSearch(e.target.value)}
						placeholder={`Search ${resourceLabel.toLowerCase()}...`}
						autoFocus
					/>
					<div className="divide-y divide-border rounded-lg border border-border">
						{linkCandidates.map((cand) => {
							const isLinked = linkedValues.has(String(cand.value));
							return (
								<div
									key={cand.key || String(cand.value)}
									className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
								>
									<div className="flex items-center gap-2 min-w-0">
										<RelationItemVisual item={cand} fallbackIcon={resourceIcon} size="sm" />
										<div className="min-w-0">
											<div className="font-medium truncate">{cand.label}</div>
											{cand.subtitle ? (
												<div className="font-mono text-[11px] text-muted-foreground truncate">
													{cand.subtitle}
												</div>
											) : null}
										</div>
									</div>
									{isLinked ? (
										<Badge variant="secondary" className="text-[10px]">
											Linked
										</Badge>
									) : (
										<Button
											type="button"
											variant="outline"
											size="xs"
											disabled={busyTarget === String(cand.value)}
											onClick={() => void handleLinkItem(cand)}
										>
											Link
										</Button>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</Sheet>
		</div>
	);
}
