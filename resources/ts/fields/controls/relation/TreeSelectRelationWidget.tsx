import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../../lib/i18n';
import { cn, DynamicIcon } from '../../../lib/utils';
import { Badge, Button, type useSortableList } from '../../../ui';
import type { RelationItemData } from '../../types';
import { SelectedItemsStack } from './SelectedItemsStack';
import {
	isRelationItemDisabled,
	QuickEditButton,
	RelationItemVisual,
	resolveRelationItemKey,
	resolveRelationNodeId,
	resolveRelationNumChildren,
	type RelationCallEndpointFn,
} from './typesAndHelpers';

const MAX_TREE_DEPTH = 24;

export function TreeSelectRelationWidget({
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
	callEndpoint: RelationCallEndpointFn;
	onCommitScalar: (val: string, item?: RelationItemData) => void;
	onCommitMulti: (vals: string[], items?: RelationItemData[]) => void;
	onOpenQuickCreate: (resourceOverride?: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [rootNodes, setRootNodes] = useState<RelationItemData[]>(initialTree);
	const [rootLoaded, setRootLoaded] = useState<boolean>(() => initialTree.length > 0);
	const [childrenMap, setChildrenMap] = useState<Record<string, RelationItemData[]>>({});
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [loadingNode, setLoadingNode] = useState<Record<string, boolean>>({});
	const [searchQuery, setSearchQuery] = useState('');
	const [searchResults, setSearchResults] = useState<RelationItemData[]>([]);
	const [searching, setSearching] = useState(false);

	const treeGenRef = useRef<number>(0);
	const nodeAbortMapRef = useRef<Map<string, AbortController>>(new Map());
	const inFlightNodesRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		return () => {
			treeGenRef.current += 1;
			for (const ctrl of nodeAbortMapRef.current.values()) {
				ctrl.abort();
			}
			nodeAbortMapRef.current.clear();
			inFlightNodesRef.current.clear();
		};
	}, []);

	const prevTreeDependsRef = useRef<string | undefined>(dependsValue);
	useEffect(() => {
		if (prevTreeDependsRef.current !== dependsValue) {
			prevTreeDependsRef.current = dependsValue;
			treeGenRef.current += 1;
			for (const ctrl of nodeAbortMapRef.current.values()) {
				ctrl.abort();
			}
			nodeAbortMapRef.current.clear();
			inFlightNodesRef.current.clear();
			setRootNodes([]);
			setRootLoaded(false);
			setChildrenMap({});
			setExpanded({});
			setLoadingNode({});
			setSearchResults([]);
		}
	}, [dependsValue]);

	useEffect(() => {
		if (!open || rootLoaded) return;
		const ctrl = new AbortController();
		const gen = treeGenRef.current;
		callEndpoint({ action: 'tree' }, false, ctrl.signal)
			.then((res) => {
				if (ctrl.signal.aborted || gen !== treeGenRef.current) return;
				if (res?.ok && Array.isArray(res.items)) {
					setRootNodes(res.items);
				}
				setRootLoaded(true);
			})
			.catch(() => {
				if (!ctrl.signal.aborted && gen === treeGenRef.current) {
					setRootLoaded(true);
				}
			});
		return () => ctrl.abort();
	}, [open, rootLoaded, callEndpoint]);

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
				.finally(() => {
					if (!ctrl.signal.aborted) {
						setSearching(false);
					}
				});
		}, 200);
		return () => {
			window.clearTimeout(timer);
			ctrl.abort();
		};
	}, [searchQuery, callEndpoint]);

	const toggleExpand = (node: RelationItemData) => {
		const nodeId = resolveRelationNodeId(node);
		if (!nodeId) return;
		const nextOpen = !expanded[nodeId];
		setExpanded((prev) => ({ ...prev, [nodeId]: nextOpen }));
		if (
			nextOpen &&
			node.hasChildren &&
			childrenMap[nodeId] === undefined &&
			!inFlightNodesRef.current.has(nodeId)
		) {
			nodeAbortMapRef.current.get(nodeId)?.abort();
			const ctrl = new AbortController();
			nodeAbortMapRef.current.set(nodeId, ctrl);
			inFlightNodesRef.current.add(nodeId);
			const gen = treeGenRef.current;
			setLoadingNode((prev) => ({ ...prev, [nodeId]: true }));
			callEndpoint({ action: 'tree', parentId: nodeId }, false, ctrl.signal)
				.then((res) => {
					if (ctrl.signal.aborted || gen !== treeGenRef.current) return;
					if (res?.ok && Array.isArray(res.items)) {
						setChildrenMap((prev) => ({ ...prev, [nodeId]: res.items ?? [] }));
					}
				})
				.catch(() => {})
				.finally(() => {
					inFlightNodesRef.current.delete(nodeId);
					if (nodeAbortMapRef.current.get(nodeId) === ctrl) {
						nodeAbortMapRef.current.delete(nodeId);
					}
					if (gen === treeGenRef.current) {
						setLoadingNode((prev) => ({ ...prev, [nodeId]: false }));
					}
				});
		}
	};

	const selectedSet = useMemo(
		() => new Set(multiple ? multiValues : scalarValue ? [scalarValue] : []),
		[multiple, multiValues, scalarValue]
	);

	const toggleSelect = (node: RelationItemData) => {
		if (disabled || isRelationItemDisabled(node)) return;
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

	const renderTreeNodes = (
		nodes: RelationItemData[],
		depth = 0,
		ancestors: ReadonlySet<string> = new Set()
	): React.ReactNode => {
		if (depth >= MAX_TREE_DEPTH) {
			return null;
		}
		return nodes.map((node) => {
			const nodeId = resolveRelationNodeId(node);
			if (nodeId !== '' && ancestors.has(nodeId)) {
				return null;
			}
			const tok = String(node.value);
			const itemKey = resolveRelationItemKey(node);
			const nodeDisabled = isRelationItemDisabled(node);
			const numChildren = resolveRelationNumChildren(node);
			const isExp = nodeId !== '' && Boolean(expanded[nodeId]);
			const isBusy = nodeId !== '' && Boolean(loadingNode[nodeId]);
			const isSelected = selectedSet.has(tok);
			const subNodes = nodeId !== '' ? childrenMap[nodeId] || [] : [];
			const canExpand = Boolean(node.hasChildren && nodeId !== '');
			const nextAncestors = new Set(ancestors);
			if (nodeId !== '') {
				nextAncestors.add(nodeId);
			}

			return (
				<div key={itemKey}>
					<div
						style={{ paddingLeft: `${depth * 16 + 6}px` }}
						className={cn(
							'flex items-center justify-between gap-2 rounded-md py-1 pr-2 text-xs transition-colors',
							isSelected ? 'bg-primary/10 font-semibold text-foreground' : 'hover:bg-muted/70 text-foreground'
						)}
					>
						<div className="flex items-center gap-1.5 min-w-0">
							{canExpand ? (
								<button
									type="button"
									onClick={() => toggleExpand(node)}
									aria-expanded={isExp}
									className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
									aria-label={isExp ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
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
								disabled={disabled || nodeDisabled}
								aria-pressed={isSelected}
								onClick={() => toggleSelect(node)}
								className="flex items-center gap-1.5 min-w-0 text-left disabled:opacity-50 cursor-pointer"
							>
								<DynamicIcon
									name={canExpand ? (isExp ? 'folder-open' : 'folder') : node.icon || fallbackIcon}
									className="size-3.5 text-muted-foreground shrink-0"
								/>
								<span className="truncate">{node.label}</span>
								{numChildren > 0 ? (
									<span className="text-[10px] text-muted-foreground tabular-nums">
										({numChildren})
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
					{canExpand && isExp && subNodes.length > 0 && depth + 1 < MAX_TREE_DEPTH
						? renderTreeNodes(subNodes, depth + 1, nextAncestors)
						: null}
				</div>
			);
		});
	};

	const selectedSingle = !multiple && scalarValue ? resolveItem(scalarValue) : undefined;

	return (
		<div className="@container/rw-rel min-w-0 space-y-1.5">
			<div data-rw-field-slot="input" className="space-y-2">
				{!multiple && selectedSingle ? (
					<div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-input-surface px-3 text-xs shadow-2xs">
						<div className="flex min-w-0 flex-1 items-center gap-2">
							<RelationItemVisual item={selectedSingle} fallbackIcon={fallbackIcon} size="sm" />
							<span className="min-w-0 flex-1 truncate font-medium text-foreground">{selectedSingle.label}</span>
							{selectedSingle.subtitle ? (
								<span className="hidden @md/rw-rel:inline max-w-[38%] truncate font-mono text-[11px] text-muted-foreground">
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
							aria-expanded={open}
							onClick={() => setOpen((o) => !o)}
						>
							{open
								? t('relation.hidePageTree', 'Hide Page Tree')
								: placeholder ||
									(selectedSingle || multiValues.length > 0
										? t('relation.browseTree', 'Browse Tree...')
										: t('relation.selectFromPageTree', 'Select from Page Tree...'))}
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
						<div className="flex items-center gap-2 border-b border-border bg-muted/20 px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring">
							<DynamicIcon name="search" className="size-3.5 shrink-0 text-muted-foreground" />
							<input
								type="search"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								aria-label={t('link.searchPages', 'Search pages')}
								placeholder={t('relation.searchPagesHierarchy', 'Search pages or browse hierarchy below...')}
								data-rw-bare-input=""
								className="h-6 w-full border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
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
													key={resolveRelationItemKey(item)}
													type="button"
													disabled={isRelationItemDisabled(item)}
													aria-pressed={isSelected}
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
