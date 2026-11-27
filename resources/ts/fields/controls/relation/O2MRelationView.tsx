import React, { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../../../lib/i18n';
import { DynamicIcon } from '../../../lib/utils';
import {
	Badge,
	Button,
	Input,
	Sheet,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '../../../ui';
import type { RelationItemData } from '../../types';
import {
	QuickEditButton,
	RelationItemVisual,
	resolveRelationItemKey,
	type RelationCallEndpointFn,
} from './typesAndHelpers';

export function O2MRelationView({
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
	callEndpoint: RelationCallEndpointFn;
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
	const listAbortRef = useRef<AbortController | null>(null);
	const listGenRef = useRef<number>(0);
	const queryRef = useRef<string>(query);
	queryRef.current = query;

	useEffect(() => {
		return () => {
			listGenRef.current += 1;
			listAbortRef.current?.abort();
			listAbortRef.current = null;
		};
	}, []);

	const fetchO2mList = useCallback(
		(searchStr?: string) => {
			if (!hasOwner || !foreignField) return;
			listAbortRef.current?.abort();
			const ctrl = new AbortController();
			listAbortRef.current = ctrl;
			const gen = ++listGenRef.current;
			setLoading(true);
			callEndpoint(
				{ action: 'o2m_list', q: searchStr ?? queryRef.current, page: 1, limit: 50 },
				false,
				ctrl.signal
			)
				.then((res) => {
					if (ctrl.signal.aborted || gen !== listGenRef.current) return;
					if (res?.ok && Array.isArray(res.items)) {
						setItems(res.items);
						setTotal(Number(res.total ?? res.items.length));
					}
				})
				.catch(() => {})
				.finally(() => {
					if (gen === listGenRef.current && !ctrl.signal.aborted) {
						setLoading(false);
					}
				});
		},
		[hasOwner, foreignField, callEndpoint]
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
				{t('relation.saveBeforeO2m', 'Save this record first before adding or linking related records.')}
			</div>
		);
	}

	const linkedValues = new Set(items.map((i) => String(i.value)));

	return (
		<div className="@container/rw-rel min-w-0 space-y-2.5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<Input
						aria-label={t('relation.filterIncoming', { resource: resourceLabel }, 'Filter incoming {resource}...')}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.nativeEvent.isComposing || e.keyCode === 229) {
								return;
							}
							if (e.key === 'Enter') {
								e.preventDefault();
								fetchO2mList(query);
							}
						}}
						placeholder={t('relation.filterIncoming', { resource: resourceLabel }, 'Filter incoming {resource}...')}
						className="h-8 w-full max-w-52 @sm/rw-rel:w-52 text-xs"
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
						{t('common.refresh', 'Refresh')}
					</Button>
					{allowLink ? (
						<Button
							type="button"
							variant="outline"
							size="xs"
							icon="link-2"
							onClick={() => setLinkDrawerOpen(true)}
						>
							{t('relation.linkExisting', 'Link Existing')}
						</Button>
					) : null}
					{creatable ? (
						<Button type="button" variant="outline" size="xs" icon="plus" onClick={onOpenQuickCreate}>
							{t('relation.createNew', 'Create New')}
						</Button>
					) : null}
				</div>
			</div>

			{statusSlot}

			{items.length === 0 ? (
				<div className="rounded-md border border-dashed border-border/70 bg-muted/15 px-3 py-3 text-center text-xs text-muted-foreground">
					{loading ? t('relation.loadingRecords', 'Loading related records...') : t('relation.noResults', 'No matching items found.')}
				</div>
			) : widget === 'cards' ? (
				<div className="grid grid-cols-1 gap-2 @md/rw-rel:grid-cols-2">
					{items.map((item) => (
						<div
							key={resolveRelationItemKey(item)}
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
							key={resolveRelationItemKey(item)}
							className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
						>
							<div className="flex min-w-0 flex-1 items-center gap-2">
								<RelationItemVisual item={item} fallbackIcon={resourceIcon} size="sm" />
								<span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.label}</span>
								{item.subtitle ? (
									<span className="hidden @md/rw-rel:inline max-w-[38%] truncate font-mono text-[11px] text-muted-foreground">
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
								<TableRow key={resolveRelationItemKey(item)}>
									<TableCell className="py-2 text-xs font-medium">
										<div className="flex items-center gap-2">
											<RelationItemVisual item={item} fallbackIcon={resourceIcon} size="sm" />
											<span className="truncate">{item.label}</span>
										</div>
									</TableCell>
									<TableCell className="py-2 font-mono text-[11px] text-muted-foreground">
										{item.subtitle || String(item.value)}
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
													title={t('relation.unlink', 'Unlink')}
													aria-label={t('relation.unlinkNamed', { label: item.label }, 'Unlink {label}')}
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
				title={t('relation.linkExistingTitle', { resource: resourceLabel }, 'Link Existing {resource}')}
				subtitle={t('relation.linkExistingDescription', { resource: resourceLabel }, 'Attach existing {resource} records to this owner.')}
			>
				<div className="space-y-3">
					<Input
						aria-label={t('relation.searchResourcePlaceholder', { resource: resourceLabel }, 'Search {resource}...')}
						value={linkSearch}
						onChange={(e) => setLinkSearch(e.target.value)}
						placeholder={t('relation.searchResourcePlaceholder', { resource: resourceLabel }, 'Search {resource}...')}
						autoFocus
					/>
					<div className="divide-y divide-border rounded-lg border border-border">
						{linkCandidates.map((cand) => {
							const isLinked = linkedValues.has(String(cand.value));
							return (
								<div
									key={resolveRelationItemKey(cand)}
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
											{t('relation.linked', 'Linked')}
										</Badge>
									) : (
										<Button
											type="button"
											variant="outline"
											size="xs"
											disabled={busyTarget === String(cand.value)}
											onClick={() => void handleLinkItem(cand)}
										>
											{t('relation.link', 'Link')}
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
