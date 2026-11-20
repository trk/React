import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { fetchGatewayJson } from '../../hooks';
import { t } from '../../lib/i18n';
import {
	Badge,
	Button,
	Dialog,
	Input,
	SortableStatusRegion,
	useSortableList,
} from '../../ui';
import { dispatchDomChange, FieldStatusRow, resolveScopedFieldValue } from '../shared';
import type { RelationItemData, RelationResourceDescriptor } from '../types';
import { AutocompleteAndMorphWidget } from './relation/AutocompleteAndMorphWidget';
import { CheckboxesRelationWidget, RadioRelationWidget } from './relation/ChoiceRelationWidgets';
import { O2MRelationView } from './relation/O2MRelationView';
import { PickerDrawerRelationWidget } from './relation/PickerDrawerRelationWidget';
import { SelectAndMultiRelationWidget } from './relation/SelectAndMultiRelationWidget';
import { TransferRelationWidget } from './relation/TransferRelationWidget';
import { TreeSelectRelationWidget } from './relation/TreeSelectRelationWidget';
import {
	itemStoredToken,
	makeFallbackItem,
	normalizeMultiValues,
	normalizeScalarValue,
	QuickEditButton,
	RelationItemVisual,
	toStringValue,
	type RelationEndpointResponse,
	type RelationFieldProps,
} from './relation/typesAndHelpers';

export type { RelationFieldProps };

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
			_mutating = false,
			signal?: AbortSignal
		): Promise<RelationEndpointResponse> => {
			if (!relationToken) {
				return { ok: false, error: 'Missing relationToken.' };
			}
			const res = await fetchGatewayJson<RelationEndpointResponse>(endpoint, {
				method: 'POST',
				payload: {
					relationToken,
					dependsValue: effectiveDependsValue,
					...payload,
				},
				signal,
			});
			const json = res.data ?? {
				ok: false,
				error: res.error || 'Invalid server response.',
			};
			if (Array.isArray(json.items)) {
				mergeItemsIntoCache(json.items);
			}
			if (json.item) {
				mergeItemsIntoCache([json.item]);
			}
			if (!res.ok && json.ok !== false) {
				return {
					...json,
					ok: false,
					error: res.error || json.error || 'Request failed.',
				};
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
		const missing = activeTokens.filter((tok) => !itemCache[tok]);
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
				setO2mRefreshTick((tick) => tick + 1);
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
