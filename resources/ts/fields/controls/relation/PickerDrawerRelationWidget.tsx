import React, { useEffect, useMemo, useState } from 'react';
import { t } from '../../../lib/i18n';
import { cn, DynamicIcon } from '../../../lib/utils';
import { Badge, Button, Input, Sheet, type useSortableList } from '../../../ui';
import type { RelationItemData, RelationResourceDescriptor } from '../../types';
import { SelectedItemsStack } from './SelectedItemsStack';
import {
	itemStoredToken,
	QuickEditButton,
	RelationItemVisual,
	type RelationCallEndpointFn,
} from './typesAndHelpers';

export function PickerDrawerRelationWidget({
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
	callEndpoint: RelationCallEndpointFn;
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
