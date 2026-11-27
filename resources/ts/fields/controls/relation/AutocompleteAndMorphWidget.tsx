import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { t } from '../../../lib/i18n';
import { cn, DynamicIcon } from '../../../lib/utils';
import { Badge, Button, Input, type useSortableList } from '../../../ui';
import type { RelationItemData, RelationResourceDescriptor } from '../../types';
import { SelectedItemsStack } from './SelectedItemsStack';
import {
	itemStoredToken,
	makeFallbackItem,
	QuickEditButton,
	RelationItemVisual,
	type RelationCallEndpointFn,
} from './typesAndHelpers';

export function AutocompleteAndMorphWidget({
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
	callEndpoint: RelationCallEndpointFn;
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
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listboxId = useId();

	useEffect(() => {
		if (!open) return;
		const onDocClick = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || e.defaultPrevented) {
				return;
			}
			const target = e.target instanceof Element ? e.target : null;
			const dialog = target?.closest('dialog[open], [role="dialog"], [role="alertdialog"]') ?? null;
			if (dialog && (!wrapRef.current || !dialog.contains(wrapRef.current))) {
				return;
			}
			const overlay = target?.closest('[data-rw-portal-overlay]') ?? null;
			if (overlay && (!wrapRef.current || (!overlay.contains(wrapRef.current) && !wrapRef.current.contains(overlay)))) {
				return;
			}
			if (wrapRef.current?.querySelector('dialog[open], [role="dialog"], [role="alertdialog"], [data-rw-portal-overlay]')) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			setOpen(false);
			inputRef.current?.focus();
		};
		document.addEventListener('mousedown', onDocClick);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onDocClick);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [open]);

	const loadMoreAbortRef = useRef<AbortController | null>(null);
	const searchGenRef = useRef<number>(0);

	useEffect(() => {
		if (!open || disabled) {
			loadMoreAbortRef.current?.abort();
			loadMoreAbortRef.current = null;
			return;
		}
		searchGenRef.current += 1;
		loadMoreAbortRef.current?.abort();
		loadMoreAbortRef.current = null;
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
				.finally(() => {
					if (!ctrl.signal.aborted) {
						setLoading(false);
					}
				});
		}, 200);

		return () => {
			window.clearTimeout(timer);
			ctrl.abort();
			loadMoreAbortRef.current?.abort();
			loadMoreAbortRef.current = null;
		};
	}, [open, query, morphTab, dependsValue, cardinality, disabled, callEndpoint]);

	const loadMore = () => {
		if (loading || !hasMore) return;
		const nextPage = page + 1;
		loadMoreAbortRef.current?.abort();
		const ctrl = new AbortController();
		loadMoreAbortRef.current = ctrl;
		const gen = searchGenRef.current;
		setLoading(true);
		callEndpoint(
			{
				action: 'search',
				q: query,
				page: nextPage,
				resource: cardinality === 'm2a' ? morphTab : undefined,
			},
			false,
			ctrl.signal
		)
			.then((res) => {
				if (ctrl.signal.aborted || gen !== searchGenRef.current) {
					return;
				}
				if (res?.ok && Array.isArray(res.items)) {
					setResults((prev) => [...prev, ...(res.items ?? [])]);
					setHasMore(Boolean(res.hasMore));
					setPage(nextPage);
				}
			})
			.catch(() => {})
			.finally(() => {
				if (!ctrl.signal.aborted && gen === searchGenRef.current) {
					setLoading(false);
				}
			});
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
						<div className="flex min-w-0 flex-1 items-center gap-2">
							<RelationItemVisual item={selectedSingle} fallbackIcon={resourceMeta.icon} size="sm" />
							{cardinality === 'm2a' ? (
								<Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase shrink-0">
									{selectedSingle.resourceLabel || selectedSingle.resource}
								</Badge>
							) : null}
							<span className="min-w-0 flex-1 truncate font-medium text-foreground">{selectedSingle.label}</span>
							{selectedSingle.subtitle ? (
								<span className="hidden @md/rw-rel:inline max-w-[35%] truncate font-mono text-[11px] text-muted-foreground">
									{selectedSingle.subtitle}
								</span>
							) : null}
							{selectedSingle.badge &&
							!(
								cardinality === 'm2a' &&
								selectedSingle.badge.trim().toLowerCase() ===
									String(selectedSingle.resourceLabel || selectedSingle.resource || '')
										.trim()
										.toLowerCase()
							) ? (
								<Badge variant="secondary" className="hidden @sm/rw-rel:inline-flex px-1.5 py-0 text-[10px] font-normal shrink-0">
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
										aria-label={t('common.change', 'Change')}
										title={t('common.change', 'Change')}
										className="h-6 px-1.5 @xs/rw-rel:px-2 text-[11px]"
									>
										<DynamicIcon name="refresh-cw" className="size-3 @xs/rw-rel:hidden" aria-hidden="true" />
										<span className="hidden @xs/rw-rel:inline">{t('common.change', 'Change')}</span>
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
							aria-pressed={morphTab === '_all'}
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
							{t('relation.allTypes', 'All Types')}
						</button>
						{morphTabs.map((tab) => (
							<button
								key={tab.name}
								type="button"
								aria-pressed={morphTab === tab.name}
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
								<DynamicIcon name={tab.icon} className="size-3" aria-hidden="true" />
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
								ref={inputRef}
								role="combobox"
								aria-autocomplete="list"
								aria-expanded={open && !inputLocked}
								aria-controls={
									open &&
									!inputLocked &&
									(visibleResults.length > 0 || (allowCustom && query.trim() !== ''))
										? listboxId
										: undefined
								}
								aria-activedescendant={
									open && !inputLocked && activeIdx >= 0 && visibleResults[activeIdx]
										? `${listboxId}-opt-${activeIdx}`
										: undefined
								}
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
									if (e.nativeEvent.isComposing || e.keyCode === 229) {
										return;
									}
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
									} else if (e.key === 'Escape' && open) {
										e.preventDefault();
										e.stopPropagation();
										setOpen(false);
									}
								}}
								placeholder={
									atLimit && multiple
										? t('tags.limitReached', 'Maximum items reached')
										: placeholder || t('relation.searchToSelect', 'Search to select...')
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
										title={t('relation.newResource', { resource: resourceMeta.label }, 'New {resource}')}
										aria-label={t('relation.newResource', { resource: resourceMeta.label }, 'New {resource}')}
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
									title={t('relation.newResource', { resource: tabMeta.label }, 'New {resource}')}
									aria-label={t('relation.newResource', { resource: tabMeta.label }, 'New {resource}')}
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
						{visibleResults.length > 0 || (allowCustom && query.trim() !== '') ? (
							<div
								id={listboxId}
								role="listbox"
								aria-label={placeholder || resourceMeta.label}
								className="max-h-64 overflow-y-auto space-y-0.5"
							>
								{visibleResults.map((item, idx) => {
									const tok = itemStoredToken(item, cardinality);
									const isHighlighted = idx === activeIdx;
									return (
										<button
											key={item.key || tok}
											id={`${listboxId}-opt-${idx}`}
											type="button"
											role="option"
											aria-selected={isHighlighted}
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
												{item.badge &&
												!(
													cardinality === 'm2a' &&
													item.badge.trim().toLowerCase() ===
														String(item.resourceLabel || item.resource || '')
															.trim()
															.toLowerCase()
												) ? (
													<Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
														{item.badge}
													</Badge>
												) : null}
												{item.status === 'unpublished' ? (
													<Badge variant="outline" className="px-1.5 py-0 text-[10px] text-warning">
														{t('relation.unpublishedShort', 'Unpub')}
													</Badge>
												) : null}
											</div>
										</button>
									);
								})}

								{allowCustom && query.trim() !== '' ? (
									<button
										id={`${listboxId}-opt-custom`}
										type="button"
										role="option"
										aria-selected={false}
										onClick={commitCustom}
										className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-left text-xs hover:bg-muted"
									>
										<DynamicIcon name="plus" className="size-3.5 text-primary shrink-0" />
										<span>
											{t('combobox.customValueHint', 'Use custom value')}: <strong className="font-mono">{query.trim()}</strong>
										</span>
									</button>
								) : null}
							</div>
						) : null}

						{visibleResults.length === 0 && !loading && (!allowCustom || !query.trim()) ? (
							<div role="status" className="px-2.5 py-3 text-center text-xs text-muted-foreground">
								{t('relation.noResults', 'No matching records found.')}
							</div>
						) : null}

						{loading ? (
							<div role="status" className="px-2.5 py-2 text-center text-xs text-muted-foreground">
								{t('link.searching', 'Searching...')}
							</div>
						) : null}

						{hasMore && !loading ? (
							<button
								type="button"
								onClick={loadMore}
								className="w-full rounded-md py-1.5 text-center text-[11px] font-medium text-primary hover:bg-muted"
							>
								{t('relation.loadMoreResults', 'Load more results...')}
							</button>
						) : null}
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
