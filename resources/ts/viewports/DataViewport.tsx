import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGatewayJson, useKeyboardShortcuts } from '../hooks';
import { t } from '../lib/i18n';
import { visitSameModuleHref } from '../lib/inertia-bridge';
import { cn, DynamicIcon, sanitizeHref, sanitizeSameOriginUrl } from '../lib/utils';
import {
	Badge,
	buildViewportActionItems,
	Button,
	ConfirmDialog,
	resolvePrimaryColumnKey,
	StatCard,
} from '../ui';
import type {
	RenderCellOptions,
	ViewportColumn,
	ViewportRowAction,
	ViewportState,
} from './types';
import { renderViewportCellValue } from './ViewportCellRenderer';
import { ViewportPaginationBar } from './ViewportPaginationBar';
import { ViewportQuickEditSheet } from './ViewportQuickEditSheet';
import {
	ensureViewportModeScriptLoaded,
	ensureViewportModeStylesLoaded,
	getViewport,
	registerViewport,
	subscribeViewportRegistry,
} from './ViewportRegistry';
import { ViewportToolbar } from './ViewportToolbar';
import { ViewportExportControl } from './viewportShared';

export type {
	ViewportColumn,
	ViewportFilter,
	ViewportBulkAction,
	ViewportRowAction,
	ViewportCreateAction,
	ViewportToolbarAction,
	ViewportSummaryCard,
	ViewportModeMeta,
	ViewportState,
	RenderCellOptions,
	ViewportCanvasProps,
} from './types';
export { registerViewport, getViewport, buildViewportActionItems };

function isViewportStateCandidate(obj: unknown): obj is Record<string, unknown> {
	return (
		Boolean(obj) &&
		typeof obj === 'object' &&
		('columns' in (obj as object) ||
			'records' in (obj as object) ||
			'items' in (obj as object) ||
			'stateToken' in (obj as object))
	);
}

function normalizeViewportProps(raw: Record<string, unknown>): ViewportState {
	const nestedState = raw.state as Record<string, unknown> | undefined;
	const nestedConfig = raw.config as Record<string, unknown> | undefined;
	const unwrapped = (
		raw.viewport && typeof raw.viewport === 'object'
			? raw.viewport
			: nestedState?.props && typeof nestedState.props === 'object'
				? nestedState.props
				: isViewportStateCandidate(raw.state)
					? raw.state
					: nestedConfig?.props && typeof nestedConfig.props === 'object'
						? nestedConfig.props
						: isViewportStateCandidate(raw.config)
							? raw.config
							: isViewportStateCandidate(raw.props)
								? raw.props
								: raw
	) as Record<string, unknown>;

	const viewMode = String(raw.mode || unwrapped.viewMode || unwrapped.mode || 'table');
	return {
		...unwrapped,
		componentId: String(unwrapped.componentId || unwrapped.id || raw.id || 'rw_viewport'),
		endpoint: (unwrapped.endpoint || raw.endpoint) as string | undefined,
		viewMode,
		columns: (unwrapped.columns || {}) as Record<string, ViewportColumn>,
		records: Array.isArray(unwrapped.records)
			? (unwrapped.records as Array<Record<string, unknown>>)
			: Array.isArray(unwrapped.items)
				? (unwrapped.items as Array<Record<string, unknown>>)
				: [],
	} as ViewportState;
}

export const DataViewport: React.FC<ViewportState | Record<string, unknown>> = (rawInitialProps) => {
	const initialProps = React.useMemo(
		() => normalizeViewportProps(rawInitialProps as Record<string, unknown>),
		[rawInitialProps]
	);
	const [state, setState] = useState<ViewportState>(initialProps);
	const prevInitialPropsRef = useRef<ViewportState>(initialProps);
	const [busy, setBusy] = useState(false);
	const [searchInput, setSearchInput] = useState(initialProps.searchQuery || '');
	const searchInputRef = useRef(searchInput);
	searchInputRef.current = searchInput;
	const rootRef = useRef<HTMLDivElement | null>(null);
	const searchFieldRef = useRef<HTMLInputElement | null>(null);
	const [editingCell, setEditingCell] = useState<{ id: string; field: string; value: string } | null>(null);
	const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const dispatchSeqRef = useRef(0);

	const subscribeViewportStore = useCallback((onStoreChange: () => void) => {
		const unsubLocal = subscribeViewportRegistry(onStoreChange);
		const unsubscribeRuntime =
			typeof window !== 'undefined' && typeof window.ReactWorkspaceRuntime?.subscribeViewportModes === 'function'
				? window.ReactWorkspaceRuntime.subscribeViewportModes(onStoreChange)
				: undefined;
		return () => {
			unsubLocal();
			unsubscribeRuntime?.();
		};
	}, []);

	useEffect(() => {
		const mode = (state.viewMode || 'table').toLowerCase();
		if (state.viewStyles?.[mode]?.length) {
			ensureViewportModeStylesLoaded(mode, state.viewStyles);
		}
		if (!getViewport(mode)) {
			if (state.viewScripts?.[mode]?.length) {
				ensureViewportModeScriptLoaded(mode, state.viewScripts);
			} else {
				void window.ReactWorkspaceRuntime?.ensureViewportModeLoaded?.(mode);
			}
		}
	}, [state.viewMode, state.viewScripts, state.viewStyles]);

	useEffect(() => {
		const prev = prevInitialPropsRef.current;
		if (
			prev === initialProps ||
			(prev.componentId === initialProps.componentId &&
				prev.stateToken === initialProps.stateToken &&
				prev.records === initialProps.records &&
				prev.viewMode === initialProps.viewMode &&
				prev.searchQuery === initialProps.searchQuery &&
				prev.page === initialProps.page &&
				prev.activeView === initialProps.activeView &&
				prev.isTrashView === initialProps.isTrashView &&
				prev.trashCount === initialProps.trashCount)
		) {
			return;
		}
		prevInitialPropsRef.current = initialProps;
		setState(initialProps);
		setSearchInput(initialProps.searchQuery || '');
	}, [initialProps]);

	useEffect(() => {
		if (state.download && state.download.content && typeof window !== 'undefined') {
			try {
				const blob = new Blob([state.download.content], {
					type: state.download.mime || 'text/plain;charset=utf-8',
				});
				const url = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = url;
				link.download = state.download.filename || 'export.csv';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				URL.revokeObjectURL(url);
			} catch {
				// Ignore download errors in headless test environments
			}
		}
	}, [state.download]);

	const dispatch = useCallback(
		async (action: string, payload: Record<string, unknown> = {}) => {
			const safeEndpoint = sanitizeSameOriginUrl(state.endpoint);
			if (!safeEndpoint || !state.stateToken) {
				return;
			}
			if (searchDebounceRef.current) {
				clearTimeout(searchDebounceRef.current);
				searchDebounceRef.current = null;
			}
			const seq = ++dispatchSeqRef.current;
			const sentSearchQuery =
				action === 'search'
					? String(payload.query ?? '')
					: action === 'reset_filters'
						? ''
						: state.searchQuery || '';
			setBusy(true);
			try {
				const resolvedCsrfSource = state.csrf?.value ? { csrf: state.csrf } : undefined;
				const res = await fetchGatewayJson<{
					ok?: boolean;
					viewport?: ViewportState;
					error?: string;
					message?: string;
				}>(safeEndpoint, {
					method: 'POST',
					csrfSource: resolvedCsrfSource,
					payload: {
						stateToken: state.stateToken,
						action,
						payload,
						state: {
							searchQuery: state.searchQuery,
							filterValues: state.filterValues,
							sortField: state.sortField,
							sortDirection: state.sortDirection,
							page: state.page,
							limit: state.limit,
							selectedIds: state.selectedIds,
							hiddenColumns: state.hiddenColumns,
							activeView: state.activeView,
							viewMode: state.viewMode,
							modeState: state.modeState,
							quickEditRecordId: state.quickEditRecordId,
						},
					},
				});

				if (seq !== dispatchSeqRef.current) {
					return;
				}
				const json = res.data;
				if (res.ok && json && json.ok && json.viewport) {
					setState(json.viewport);
					if (
						action === 'reset_filters' ||
						action === 'select_view' ||
						searchInputRef.current === sentSearchQuery
					) {
						setSearchInput(json.viewport.searchQuery || '');
					}
					if (typeof rawInitialProps?.onMutate === 'function') {
						(rawInitialProps.onMutate as (nextState: ViewportState, act: string) => void)(
							json.viewport,
							action
						);
					}
				} else if (res.status === 0 && !json) {
					setState((prev) => ({
						...prev,
						notice: {
							message: t('viewport.networkError', 'Network error while updating this list.'),
							type: 'error',
						},
					}));
				} else {
					const errorMessage =
						typeof json?.error === 'string' && json.error.trim() !== ''
							? json.error
							: typeof json?.message === 'string' && json.message.trim() !== ''
								? json.message
								: res.error || `Request failed (${res.status || 'error'}).`;
					setState((prev) => ({
						...prev,
						...(json?.viewport && typeof json.viewport === 'object' ? json.viewport : {}),
						notice: {
							message: errorMessage,
							type: 'error',
						},
					}));
				}
			} finally {
				if (seq === dispatchSeqRef.current) {
					setBusy(false);
				}
			}
		},
		[state, rawInitialProps]
	);

	const resolveRecordActions = useCallback(
		(record: Record<string, unknown>): ViewportRowAction[] => {
			const recId = String(record.id ?? '');
			if (recId && state.rowActionsByRecord && state.rowActionsByRecord[recId]) {
				return state.rowActionsByRecord[recId];
			}
			return state.rowActions || [];
		},
		[state.rowActions, state.rowActionsByRecord]
	);

	const visibleColsForVisuals = React.useMemo(
		() =>
			state.displayColumns && Object.keys(state.displayColumns).length > 0
				? state.displayColumns
				: state.columns || {},
		[state.displayColumns, state.columns]
	);
	const primaryColKey = React.useMemo(
		() => resolvePrimaryColumnKey(visibleColsForVisuals),
		[visibleColsForVisuals]
	);
	const hasDedicatedIconColumn = React.useMemo(
		() =>
			Object.entries(visibleColsForVisuals).some(
				([k, d]) => k !== primaryColKey && (k === 'icon' || d.type === 'icon')
			),
		[visibleColsForVisuals, primaryColKey]
	);
	const hasDedicatedThumbColumn = React.useMemo(
		() =>
			Object.entries(visibleColsForVisuals).some(
				([k, d]) =>
					k !== primaryColKey &&
					(k === 'thumb' || k === 'image' || d.type === 'media' || d.type === 'image')
			),
		[visibleColsForVisuals, primaryColKey]
	);

	const renderCellValue = useCallback(
		(
			record: Record<string, unknown>,
			colKey: string,
			colDef: ViewportColumn,
			options?: RenderCellOptions
		): React.ReactNode =>
			renderViewportCellValue({
				record,
				colKey,
				colDef,
				options,
				dense: state.dense,
				editingCell,
				setEditingCell,
				hasDedicatedIconColumn,
				hasDedicatedThumbColumn,
				onToggleField: (id, field) => {
					void dispatch('toggle_field', { id, field });
				},
				onUpdateField: (id, field, value) => {
					void dispatch('update_field', { id, field, value });
				},
			}),
		[dispatch, editingCell, hasDedicatedIconColumn, hasDedicatedThumbColumn, state.dense]
	);

	const [pendingDeleteView, setPendingDeleteView] = useState<{ key: string; label: string } | null>(null);
	const [pendingBulkConfirm, setPendingBulkConfirm] = useState<{
		key: string;
		label: string;
		confirm: string;
		danger: boolean;
	} | null>(null);
	const [pendingActionConfirm, setPendingActionConfirm] = useState<{
		actionType: 'row_action' | 'toolbar_action' | 'empty_trash';
		key: string;
		recordId?: string;
		label: string;
		confirm: string;
		danger: boolean;
	} | null>(null);

	const handleRequestRowConfirm = useCallback(
		(
			act: { key: string; label: string; confirm?: string; variant?: string; tone?: string },
			recordId: string,
			recordLabel: string
		) => {
			setPendingActionConfirm({
				actionType: 'row_action',
				key: act.key,
				recordId,
				label: recordLabel ? `${act.label}: ${recordLabel}` : act.label,
				confirm: act.confirm || '',
				danger: act.variant === 'danger' || act.tone === 'danger',
			});
		},
		[]
	);

	const activeViewMode = (state.viewMode || 'table').toLowerCase();
	const ActiveCanvas = React.useSyncExternalStore(
		subscribeViewportStore,
		() => getViewport(activeViewMode),
		() => getViewport(activeViewMode)
	);
	const bulkEntries = Object.entries(state.bulkActions || {});
	const selectedCount = (state.selectedIds || []).length;

	useEffect(() => {
		const committedQuery = state.searchQuery || '';
		if (searchInput === committedQuery) {
			return;
		}
		searchDebounceRef.current = setTimeout(() => {
			searchDebounceRef.current = null;
			void dispatch('search', { query: searchInput });
		}, 240);
		return () => {
			if (searchDebounceRef.current) {
				clearTimeout(searchDebounceRef.current);
				searchDebounceRef.current = null;
			}
		};
	}, [searchInput, state.searchQuery, dispatch]);

	const createHref = React.useMemo(() => {
		if (state.showCreateButton === false) {
			return '';
		}
		const actionHref = Array.isArray(state.createActions)
			? state.createActions
					.map((act) => (act?.href ? sanitizeHref(act.href) : ''))
					.find((href) => href !== '') || ''
			: '';
		return actionHref || sanitizeHref(state.createUrl);
	}, [state.showCreateButton, state.createActions, state.createUrl]);

	const hasCreateAction =
		state.showCreateButton !== false &&
		(createHref !== '' || (Array.isArray(state.createActions) && state.createActions.length > 0));

	useKeyboardShortcuts([
		{
			id: 'viewport.focusSearch',
			keys: '/',
			label: t('shortcuts.focusSearch', 'Focus search input'),
			group: 'viewport',
			when: state.showToolbar !== false,
			handler: () => {
				const input = searchFieldRef.current;
				if (input) {
					input.focus();
					input.select();
				}
			},
		},
		{
			id: 'viewport.newRecord',
			keys: 'n',
			label: t('shortcuts.newRecord', 'Create new item'),
			group: 'viewport',
			when: hasCreateAction,
			handler: () => {
				const trigger = rootRef.current?.querySelector<HTMLElement>(
					'[data-rw-viewport-create], [data-rw-row-actions-trigger="viewport-create"]'
				);
				if (trigger) {
					trigger.click();
					return;
				}
				if (createHref) {
					if (!visitSameModuleHref(createHref) && typeof window !== 'undefined') {
						window.location.assign(createHref);
					}
				}
			},
		},
		{
			id: 'viewport.refresh',
			keys: 'r',
			label: t('shortcuts.refreshView', 'Refresh view'),
			group: 'viewport',
			when: Boolean(state.endpoint && state.stateToken),
			handler: () => {
				void dispatch('refresh');
			},
		},
	]);

	return (
		<div ref={rootRef} className="space-y-4" data-viewport-id={state.componentId} data-viewport-mode={state.viewMode}>
			{/* Summary KPI Cards */}
			{state.summaryCards && state.summaryCards.length > 0 && (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{state.summaryCards.map((card, i) => (
						<StatCard
							key={card.key || i}
							label={card.label}
							value={card.value}
							icon={card.icon}
							caption={card.trend}
						/>
					))}
				</div>
			)}

			{/* Notice Banner */}
			{state.notice && state.notice.message && (
				<div
					role={state.notice.type === 'error' ? 'alert' : 'status'}
					className={cn(
						'flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs font-medium',
						state.notice.type === 'error'
							? 'border-destructive/30 bg-destructive/10 text-destructive'
							: state.notice.type === 'warning'
								? 'border-warning/25 bg-warning/12 text-warning'
								: 'border-success/25 bg-success/12 text-success'
					)}
				>
					<span>{state.notice.message}</span>
					<button
						type="button"
						onClick={() => setState((prev) => ({ ...prev, notice: undefined }))}
						aria-label={t('common.dismiss', 'Dismiss')}
						className="inline-flex size-6 pointer-coarse:size-9 shrink-0 items-center justify-center rounded hover:bg-foreground/10 cursor-pointer"
					>
						<DynamicIcon name="x" className="size-3.5" />
					</button>
				</div>
			)}

			<ViewportToolbar
				state={state}
				busy={busy}
				searchInput={searchInput}
				searchInputRef={searchFieldRef}
				onSearchInputChange={setSearchInput}
				onSubmitSearch={(query) => {
					if (searchDebounceRef.current) {
						clearTimeout(searchDebounceRef.current);
						searchDebounceRef.current = null;
					}
					if (query !== searchInput) {
						setSearchInput(query);
					}
					void dispatch('search', { query });
				}}
				onResetFilters={() => {
					if (searchDebounceRef.current) {
						clearTimeout(searchDebounceRef.current);
						searchDebounceRef.current = null;
					}
					void dispatch('reset_filters');
				}}
				dispatch={dispatch}
				onRequestDeleteView={setPendingDeleteView}
				onRequestToolbarConfirm={setPendingActionConfirm}
			/>

			{state.isTrashView && (
				<div
					data-rw-viewport-trash-bar=""
					className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-2.5 text-xs"
				>
					<div className="flex items-center gap-2 text-foreground">
						<DynamicIcon name="trash-2" className="size-4 text-destructive shrink-0" />
						<span className="font-medium">
							{t(
								'viewport.viewingTrash',
								{ count: state.trashCount ?? 0 },
								'Viewing Trash ({count}) — use row actions or bulk selection to Restore or Delete Permanently.'
							)}
						</span>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="xs"
							icon="arrow-left"
							disabled={busy}
							onClick={() => void dispatch('filter', { key: 'status', value: '' })}
						>
							{t('viewport.backToActive', 'Back to Active Items')}
						</Button>
						{!state.locked && (state.trashCount ?? 0) > 0 ? (
							<Button
								type="button"
								variant="destructive"
								size="xs"
								icon="trash-x"
								disabled={busy}
								onClick={() =>
									setPendingActionConfirm({
										actionType: 'empty_trash',
										key: 'empty_trash',
										label: t('viewport.emptyTrash', 'Empty Trash'),
										confirm: t(
											'viewport.emptyTrashConfirm',
											{ count: state.trashCount ?? 0 },
											'Permanently delete all {count} trashed record(s)? This cannot be undone.'
										),
										danger: true,
									})
								}
							>
								{t('viewport.emptyTrash', 'Empty Trash')}
							</Button>
						) : null}
					</div>
				</div>
			)}

			{selectedCount > 0 && (bulkEntries.length > 0 || Boolean(state.exportEnabled)) && (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
					<div className="flex items-center gap-2 text-xs font-medium">
						<Badge variant="default">{t('viewport.selectedCount', { count: selectedCount }, '{count} selected')}</Badge>
						<button
							type="button"
							onClick={() => dispatch('clear_selection')}
							className="text-muted-foreground hover:text-foreground underline cursor-pointer"
						>
							{t('media.clearSelection', 'Clear selection')}
						</button>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						{bulkEntries.map(([bKey, bDef]) => (
							<Button
								key={bKey}
								variant={bDef.variant === 'danger' ? 'destructive' : 'secondary'}
								size="xs"
								icon={bDef.icon}
								disabled={busy}
								onClick={() => {
									if (bDef.confirm) {
										setPendingBulkConfirm({
											key: bKey,
											label: bDef.label,
											confirm: bDef.confirm,
											danger: bDef.variant === 'danger',
										});
										return;
									}
									void dispatch('bulk_action', {
										bulkAction: bKey,
										ids: state.selectedIds,
									});
								}}
							>
								{bDef.label}
							</Button>
						))}
						{state.exportEnabled ? (
							<ViewportExportControl state={state} busy={busy} dispatch={dispatch} selectedOnly />
						) : null}
					</div>
				</div>
			)}

			{ActiveCanvas ? (
				<ActiveCanvas
					state={state}
					busy={busy}
					dispatch={dispatch}
					resolveRecordActions={resolveRecordActions}
					onRequestConfirm={handleRequestRowConfirm}
					renderCellValue={renderCellValue}
				/>
			) : (
				<div
					role="status"
					aria-busy="true"
					aria-label={t('common.loading', 'Loading...')}
					className="h-32 w-full motion-safe:animate-pulse rounded-lg border border-border bg-muted/20"
					data-rw-lazy-chunk={`Viewport.${activeViewMode}`}
				/>
			)}

			{state.showPagination !== false && (
				<ViewportPaginationBar
					page={state.page || 1}
					totalPages={state.totalPages || 1}
					total={state.total || 0}
					busy={busy}
					onPageChange={(nextPage) => {
						void dispatch('page', { page: nextPage });
					}}
				/>
			)}

			{pendingDeleteView ? (
				<ConfirmDialog
					open={Boolean(pendingDeleteView)}
					onOpenChange={(nextOpen) => {
						if (!nextOpen) {
							setPendingDeleteView(null);
						}
					}}
					variant="danger"
					icon="trash-2"
					requireAcknowledge={false}
					title={t('viewport.deleteSavedView', 'Delete saved view')}
					description={t(
						'viewport.deleteSavedViewConfirm',
						{ label: pendingDeleteView.label },
						'Delete the saved view "{label}"?'
					)}
					confirmLabel={t('common.delete', 'Delete')}
					loading={busy}
					onConfirm={() => {
						const targetKey = pendingDeleteView.key;
						setPendingDeleteView(null);
						void dispatch('delete_view', { view: targetKey });
					}}
				/>
			) : null}

			{pendingBulkConfirm ? (
				<ConfirmDialog
					open={Boolean(pendingBulkConfirm)}
					onOpenChange={(nextOpen) => {
						if (!nextOpen) {
							setPendingBulkConfirm(null);
						}
					}}
					variant={pendingBulkConfirm.danger ? 'danger' : 'warning'}
					requireAcknowledge={false}
					title={pendingBulkConfirm.label}
					description={pendingBulkConfirm.confirm}
					confirmLabel={pendingBulkConfirm.label}
					loading={busy}
					onConfirm={() => {
						const actionKey = pendingBulkConfirm.key;
						setPendingBulkConfirm(null);
						void dispatch('bulk_action', {
							bulkAction: actionKey,
							ids: state.selectedIds,
						});
					}}
				/>
			) : null}

			{pendingActionConfirm ? (
				<ConfirmDialog
					open={Boolean(pendingActionConfirm)}
					onOpenChange={(nextOpen) => {
						if (!nextOpen) {
							setPendingActionConfirm(null);
						}
					}}
					variant={pendingActionConfirm.danger ? 'danger' : 'warning'}
					icon={pendingActionConfirm.danger ? 'trash-2' : undefined}
					requireAcknowledge={false}
					title={pendingActionConfirm.label}
					description={pendingActionConfirm.confirm}
					confirmLabel={
						pendingActionConfirm.danger
							? t('common.delete', 'Delete')
							: pendingActionConfirm.label
					}
					loading={busy}
					onConfirm={() => {
						const target = pendingActionConfirm;
						setPendingActionConfirm(null);
						if (target.actionType === 'empty_trash') {
							void dispatch('empty_trash');
						} else if (target.actionType === 'toolbar_action') {
							void dispatch('toolbar_action', { toolbarAction: target.key });
						} else if (target.recordId) {
							void dispatch('row_action', { rowAction: target.key, id: target.recordId });
						}
					}}
				/>
			) : null}

			<ViewportQuickEditSheet
				quickEdit={state.quickEdit}
				busy={busy}
				onClose={() => {
					void dispatch('close_quick_edit');
				}}
				onSave={(formData) => {
					void dispatch('save_quick_edit', {
						id: state.quickEdit?.recordId,
						formData,
					});
				}}
			/>
		</div>
	);
};

export const DataTable: React.FC<ViewportState> = (props) => (
	<DataViewport {...props} viewMode={props.viewMode || 'table'} />
);

export const DataCards: React.FC<ViewportState> = (props) => (
	<DataViewport {...props} viewMode={props.viewMode || 'cards'} />
);
