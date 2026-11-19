import React, { useState, useEffect, useCallback, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, getCsrfToken, sanitizeAssetUrl, sanitizeHref, sanitizeSameOriginUrl } from '../lib/utils';
import {
	Button,
	Badge,
	BadgeGroup,
	ConfirmDialog,
	CopyValueButton,
	Input,
	RecordLeadingVisual,
	Select,
	Switch,
	StatCard,
	applyTextTruncate,
	isViewportCellObject,
	normalizeViewportBadges,
	normalizeViewportThumb,
	resolveRecordVisuals,
	useModalDialogController,
	type BadgeProps,
	type ViewportCellObject,
} from '../ui';
import { renderViewportCreateTrigger, ViewportLink } from './viewportShared';

/* ============================================================================
 * Viewport Types & Pluggable Mode Registry
 * ========================================================================== */

export interface ViewportColumn {
	label: string;
	sortable?: boolean;
	align?: 'left' | 'center' | 'right';
	valign?: 'top' | 'middle' | 'bottom';
	width?: string;
	type?: string;
	editable?: boolean;
	mono?: boolean;
	tabular?: boolean;
	nowrap?: boolean;
	truncate?: boolean | number;
	copyable?: boolean;
	subtitleMono?: boolean;
	maxBadges?: number;
	options?: Record<string, string>;
	badgeVariants?: Record<string, string>;
}

export interface ViewportFilter {
	label: string;
	type?: string;
	display?: 'select' | 'pills' | string;
	options: Record<string, string>;
	counts?: Record<string, number>;
	icons?: Record<string, string>;
	totalCount?: number;
}

export interface ViewportBulkAction {
	label: string;
	icon?: string;
	variant?: string;
	confirm?: string;
}

export interface ViewportRowAction {
	key: string;
	label: string;
	icon?: string;
	variant?: string;
	tone?: string;
	href?: string;
	confirm?: string;
}

export interface ViewportCreateAction {
	key?: string;
	label: string;
	href?: string;
	icon?: string;
	dataAttrs?: Record<string, string>;
}

export interface ViewportToolbarAction {
	key: string;
	label: string;
	href?: string;
	icon?: string;
	variant?: string;
	badge?: string;
	confirm?: string;
	dataAttrs?: Record<string, string>;
}

export interface ViewportSummaryCard {
	key?: string;
	label: string;
	value: string | number;
	trend?: string;
	trendDirection?: 'up' | 'down' | 'neutral';
	variant?: string;
	icon?: string;
	filter?: Record<string, unknown>;
}

export interface ViewportKanbanStage {
	key: string;
	label: string;
	variant?: string;
	limit?: number;
	count: number;
	records: Array<Record<string, unknown>>;
}

export interface ViewportCalendarState {
	month: number;
	year: number;
	monthLabel: string;
	calendarView: 'month' | 'week' | 'agenda' | 'timeline' | string;
	dateField: string;
	endDateField: string;
	daysInMonth: number;
	firstDayOfWeek: number;
	eventsByDate: Record<string, Array<Record<string, unknown>>>;
	laneField?: string;
	laneOptions?: Record<string, string>;
	conflicts?: Record<string, boolean>;
}

export interface ViewportState {
	component?: string;
	viewportClass?: string;
	componentId: string;
	title?: string;
	endpoint?: string;
	stateToken?: string;
	csrf?: {
		name: string;
		value: string;
	};
	provider?: string;
	viewMode: string;
	allowedViewModes?: string[];
	viewScripts?: Record<string, string[]>;
	columns: Record<string, ViewportColumn>;
	displayColumns?: Record<string, ViewportColumn>;
	hiddenColumns?: string[];
	fieldSchemas?: Record<string, Record<string, unknown>>;
	records: Array<Record<string, unknown>>;
	filters?: Record<string, ViewportFilter>;
	filterValues?: Record<string, unknown>;
	bulkActions?: Record<string, ViewportBulkAction>;
	bulkFieldSchemas?: Record<string, Record<string, unknown>>;
	rowActions?: ViewportRowAction[];
	rowActionsByRecord?: Record<string, ViewportRowAction[]>;
	views?: Record<string, { label: string; icon?: string; count?: number; filters?: Record<string, unknown> }>;
	savedViews?: Record<string, { label: string; filters: Record<string, unknown> }>;
	activeView?: string;
	summaryCards?: ViewportSummaryCard[];
	searchQuery?: string;
	searchPlaceholder?: string;
	sortField?: string;
	sortDirection?: 'asc' | 'desc' | string;
	page?: number;
	limit?: number;
	total?: number;
	totalPages?: number;
	selectedIds?: string[];
	selectable?: boolean;
	dense?: boolean;
	rowValign?: 'top' | 'middle' | 'bottom';
	showToolbar?: boolean;
	showFilterBar?: boolean;
	showPagination?: boolean;
	saveViewEnabled?: boolean;
	columnPickerEnabled?: boolean;
	reorderEnabled?: boolean;
	locked?: boolean;
	exportEnabled?: boolean;
	exportFormats?: string[];
	quickEditEnabled?: boolean;
	quickEditUrl?: string;
	quickEditRecordId?: string;
	quickEdit?: {
		recordId: string;
		record: Record<string, unknown>;
		fields: Record<string, { label: string; type?: string; options?: Record<string, string> }>;
	} | null;
	showCreateButton?: boolean;
	createLabel?: string;
	createUrl?: string;
	createActions?: ViewportCreateAction[];
	toolbarActions?: ViewportToolbarAction[];
	createModalTarget?: string;
	editUrl?: string;
	onMutate?: (nextState: ViewportState, action: string) => void;
	emptyTitle?: string;
	emptyMessage?: string;
	emptyIcon?: string;
	emptyActionLabel?: string;
	emptyActionUrl?: string;
	groupByField?: string;
	stages?: ViewportKanbanStage[];
	dateField?: string;
	endDateField?: string;
	calendar?: ViewportCalendarState | null;
	notice?: {
		message: string;
		type: 'success' | 'error' | 'warning' | 'info' | string;
	} | null;
	download?: {
		filename: string;
		content: string;
		mime: string;
	} | null;
}

export interface RenderCellOptions {
	isPrimaryColumn?: boolean;
	suppressRecordVisuals?: boolean;
}

export interface ViewportCanvasProps {
	state: ViewportState;
	busy: boolean;
	dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void>;
	resolveRecordActions: (record: Record<string, unknown>) => ViewportRowAction[];
	onRequestConfirm?: (
		act: { key: string; label: string; confirm?: string; variant?: string; tone?: string },
		recordId: string,
		recordLabel: string
	) => void;
	renderCellValue: (
		record: Record<string, unknown>,
		colKey: string,
		colDef: ViewportColumn,
		options?: RenderCellOptions
	) => React.ReactNode;
}

interface ViewportPillOption {
	key: string;
	label: string;
	count?: number;
	icon?: string;
}

interface ViewportPillStripProps {
	items: ViewportPillOption[];
	activeKey: string;
	ariaLabel: string;
	onSelect: (key: string) => void;
}

const ViewportPillStrip: React.FC<ViewportPillStripProps> = ({
	items,
	activeKey,
	ariaLabel,
	onSelect,
}) => {
	const stripRef = useRef<HTMLDivElement | null>(null);
	const measureRef = useRef<HTMLDivElement | null>(null);
	const moreMeasureRef = useRef<HTMLSpanElement | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [visibleCount, setVisibleCount] = useState<number>(() => Math.min(5, items.length));
	const [menuOpen, setMenuOpen] = useState(false);
	const [menuSearch, setMenuSearch] = useState('');
	const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

	const recomputeLayout = useCallback(() => {
		const container = stripRef.current;
		const measureHost = measureRef.current;
		if (!container || !measureHost) {
			return;
		}
		const availableWidth = container.clientWidth;
		if (availableWidth <= 0) {
			return;
		}
		const itemEls = Array.from(measureHost.querySelectorAll<HTMLElement>('[data-pill-measure]'));
		const widths = itemEls.map((el) => Math.ceil(el.getBoundingClientRect().width));
		if (widths.length === 0) {
			return;
		}
		const gap = 6;
		const totalItems = items.length;

		if (totalItems <= 5) {
			const fullWidth =
				widths.reduce((acc, w) => acc + w, 0) + Math.max(0, totalItems - 1) * gap;
			if (fullWidth <= availableWidth) {
				setVisibleCount((prev) => (prev === totalItems ? prev : totalItems));
				return;
			}
		}

		const moreBtnWidth = Math.max(
			88,
			Math.ceil(moreMeasureRef.current?.getBoundingClientRect().width ?? 94)
		);
		const maxInline = Math.min(5, Math.max(1, totalItems - 1));
		let used = 0;
		let count = 0;
		for (let i = 0; i < maxInline; i++) {
			const w = widths[i] ?? 0;
			const needed = (count > 0 ? gap : 0) + w;
			if (used + needed + gap + moreBtnWidth <= availableWidth) {
				used += needed;
				count++;
			} else {
				break;
			}
		}
		const nextCount = count;
		setVisibleCount((prev) => (prev === nextCount ? prev : nextCount));
	}, [items, activeKey]);

	useEffect(() => {
		recomputeLayout();
		const container = stripRef.current;
		if (!container || typeof ResizeObserver === 'undefined') {
			return;
		}
		const observer = new ResizeObserver(() => recomputeLayout());
		observer.observe(container);
		window.addEventListener('resize', recomputeLayout);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', recomputeLayout);
		};
	}, [recomputeLayout]);

	const inlineItems = items.slice(0, visibleCount);
	const overflowItems = items.slice(visibleCount);
	const activeOverflowItem = overflowItems.find((item) => item.key === activeKey);

	useEffect(() => {
		if (overflowItems.length === 0 && menuOpen) {
			setMenuOpen(false);
		}
	}, [overflowItems.length, menuOpen]);

	const updateMenuPosition = useCallback(() => {
		const trigger = triggerRef.current;
		if (!trigger || typeof window === 'undefined') {
			return;
		}
		const rect = trigger.getBoundingClientRect();
		const menuWidth = 224;
		const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8);
		setMenuPos({
			top: Math.round(rect.bottom + 6),
			left: Math.max(8, Math.min(Math.round(rect.left), maxLeft)),
		});
	}, []);

	useEffect(() => {
		if (!menuOpen || typeof document === 'undefined') {
			return;
		}
		updateMenuPosition();
		const onMouseDown = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (
				target &&
				!triggerRef.current?.contains(target) &&
				!menuRef.current?.contains(target)
			) {
				setMenuOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.stopPropagation();
				setMenuOpen(false);
				triggerRef.current?.focus();
			}
		};
		document.addEventListener('mousedown', onMouseDown);
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('resize', updateMenuPosition);
		window.addEventListener('scroll', updateMenuPosition, true);
		return () => {
			document.removeEventListener('mousedown', onMouseDown);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('resize', updateMenuPosition);
			window.removeEventListener('scroll', updateMenuPosition, true);
		};
	}, [menuOpen, updateMenuPosition]);

	if (items.length === 0) {
		return null;
	}

	const filteredOverflow = menuSearch.trim()
		? overflowItems.filter((item) =>
				item.label.toLowerCase().includes(menuSearch.trim().toLowerCase())
			)
		: overflowItems;

	const portalRoot =
		typeof document !== 'undefined'
			? (triggerRef.current?.closest('dialog') as HTMLElement | null) || document.body
			: null;

	return (
		<>
			{/* Compact native select below md (< 768px) */}
			<div className="w-full sm:w-48 md:hidden">
				<Select
					aria-label={ariaLabel}
					data-rw-viewport-pill-select=""
					value={activeKey}
					onChange={(e) => onSelect(e.target.value)}
					className="h-8 w-full text-xs"
				>
					{items.map((item) => (
						<option key={item.key || '__all__'} value={item.key}>
							{item.count !== undefined ? `${item.label} (${item.count})` : item.label}
						</option>
					))}
				</Select>
			</div>

			{/* Measured single-line pill strip with +N overflow menu at md+ (>= 768px) */}
			<div
				ref={stripRef}
				role="group"
				aria-label={ariaLabel}
				data-rw-viewport-pills=""
				className="relative hidden min-w-0 flex-1 items-center gap-1.5 overflow-hidden md:flex"
			>
				{inlineItems.map((item) => {
					const isActive = item.key === activeKey;
					return (
						<button
							key={item.key || '__all__'}
							type="button"
							aria-pressed={isActive}
							onClick={() => onSelect(isActive && item.key !== '' && items[0]?.key === '' ? '' : item.key)}
							className={cn(
								'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								isActive
									? 'border-foreground bg-foreground text-background shadow-2xs'
									: 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
							)}
						>
							{item.icon ? <DynamicIcon name={item.icon} className="size-3.5 shrink-0" aria-hidden="true" /> : null}
							<span>{item.label}</span>
							{item.count !== undefined ? (
								<span
									className={cn(
										'inline-flex min-w-4.5 items-center justify-center rounded px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums',
										isActive
											? 'bg-background/20 text-background'
											: 'bg-muted text-muted-foreground'
									)}
								>
									{item.count}
								</span>
							) : null}
						</button>
					);
				})}

				{overflowItems.length > 0 && (
					<button
						ref={triggerRef}
						type="button"
						aria-haspopup="menu"
						aria-expanded={menuOpen}
						data-rw-viewport-pill-overflow=""
						onClick={() => {
							setMenuSearch('');
							setMenuOpen((prev) => !prev);
						}}
						className={cn(
							'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							activeOverflowItem
								? 'border-foreground bg-foreground text-background shadow-2xs'
								: 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
						)}
					>
						{activeOverflowItem ? (
							<>
								{activeOverflowItem.icon ? (
									<DynamicIcon name={activeOverflowItem.icon} className="size-3.5 shrink-0" aria-hidden="true" />
								) : null}
								<span className="max-w-28 truncate">{activeOverflowItem.label}</span>
							</>
						) : (
							<span>{t('common.more', 'More')}</span>
						)}
						<span
							className={cn(
								'inline-flex min-w-4.5 items-center justify-center rounded px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums',
								activeOverflowItem
									? 'bg-background/20 text-background'
									: 'bg-muted text-muted-foreground'
							)}
						>
							+{overflowItems.length}
						</span>
						<DynamicIcon name="chevron-down" className="size-3 opacity-75" aria-hidden="true" />
					</button>
				)}

				{/* Offscreen non-focusable measurement row */}
				<div
					ref={measureRef}
					aria-hidden="true"
					className="pointer-events-none invisible fixed -top-[9999px] left-0 flex items-center gap-1.5 whitespace-nowrap"
				>
					{items.map((item) => (
						<span
							key={item.key || '__all__'}
							data-pill-measure=""
							className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap"
						>
							{item.icon ? <span className="inline-block size-3.5 shrink-0" /> : null}
							<span>{item.label}</span>
							{item.count !== undefined ? (
								<span className="inline-flex min-w-4.5 items-center justify-center rounded px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums">
									{item.count}
								</span>
							) : null}
						</span>
					))}
					<span
						ref={moreMeasureRef}
						data-pill-more-measure=""
						className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap"
					>
						{activeOverflowItem?.icon ? <span className="inline-block size-3.5 shrink-0" /> : null}
						<span className="max-w-28 truncate">
							{activeOverflowItem ? activeOverflowItem.label : t('common.more', 'More')}
						</span>
						<span className="inline-flex min-w-4.5 items-center justify-center rounded px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums">
							+{items.length}
						</span>
						<span className="inline-block size-3" />
					</span>
				</div>
			</div>

			{menuOpen &&
				portalRoot &&
				createPortal(
					<div
						ref={menuRef}
						role="menu"
						data-rw-viewport-pill-menu=""
						data-rw-portal-overlay=""
						style={{ position: 'fixed', top: `${menuPos.top}px`, left: `${menuPos.left}px` }}
						className="z-[140] w-56 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
					>
						{overflowItems.length >= 5 && (
							<div className="mb-1 px-1 pt-0.5">
								<Input
									aria-label={t('viewport.filterOptions', 'Filter options...')}
									value={menuSearch}
									onChange={(e) => setMenuSearch(e.target.value)}
									placeholder={t('viewport.filterOptions', 'Filter options...')}
									className="h-7 text-xs"
									autoFocus
								/>
							</div>
						)}
						<div className="max-h-64 space-y-0.5 overflow-y-auto">
							{filteredOverflow.map((item) => {
								const isActive = item.key === activeKey;
								return (
									<button
										key={item.key || '__all__'}
										type="button"
										role="menuitemradio"
										aria-checked={isActive}
										onClick={() => {
											onSelect(
												isActive && item.key !== '' && items[0]?.key === ''
													? ''
													: item.key
											);
											setMenuOpen(false);
										}}
										className={cn(
											'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer',
											isActive
												? 'bg-primary/12 text-primary-ink font-semibold'
												: 'text-popover-foreground hover:bg-muted'
										)}
									>
										<span className="inline-flex min-w-0 items-center gap-2 truncate">
											{item.icon ? (
												<DynamicIcon name={item.icon} className="size-3.5 shrink-0" aria-hidden="true" />
											) : null}
											<span className="truncate">{item.label}</span>
										</span>
										{item.count !== undefined ? (
											<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
												{item.count}
											</span>
										) : null}
									</button>
								);
							})}
							{filteredOverflow.length === 0 && (
								<div className="px-2.5 py-2 text-center text-xs text-muted-foreground">
									{t('common.noMatches', 'No matching options')}
								</div>
							)}
						</div>
					</div>,
					portalRoot
				)}
		</>
	);
};

const viewportRegistry = new Map<string, React.ComponentType<ViewportCanvasProps>>();
const viewportListeners = new Set<() => void>();
const injectedViewportScripts = new Set<string>();

export function registerViewport(mode: string, component: React.ComponentType<ViewportCanvasProps>): void {
	viewportRegistry.set(mode.toLowerCase(), component);
	if (
		typeof window !== 'undefined' &&
		window.ReactWorkspaceRuntime?.registerViewport &&
		window.ReactWorkspaceRuntime.registerViewport !== registerViewport
	) {
		window.ReactWorkspaceRuntime.registerViewport(mode, component);
	}
	viewportListeners.forEach((listener) => listener());
}

export function getViewport(mode: string): React.ComponentType<ViewportCanvasProps> | undefined {
	return (
		viewportRegistry.get(mode.toLowerCase()) ||
		(typeof window !== 'undefined' &&
		window.ReactWorkspaceRuntime?.getViewport &&
		window.ReactWorkspaceRuntime.getViewport !== getViewport
			? window.ReactWorkspaceRuntime.getViewport(mode)
			: undefined)
	);
}

function ensureViewportModeScriptLoaded(mode: string, viewScripts?: Record<string, string[]>): void {
	if (typeof document === 'undefined' || !viewScripts) {
		return;
	}
	const key = mode.toLowerCase();
	const scripts = viewScripts[key] || [];
	for (const src of scripts) {
		const safeSrc = sanitizeAssetUrl(src);
		if (!safeSrc) {
			continue;
		}
		const cleanSrc = safeSrc.split('?')[0] || safeSrc;
		const exists = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).some(
			(el) => ((el.getAttribute('src') || '').split('?')[0] || '') === cleanSrc
		);
		if (!exists && !injectedViewportScripts.has(cleanSrc)) {
			injectedViewportScripts.add(cleanSrc);
			const script = document.createElement('script');
			script.type = 'module';
			script.src = safeSrc;
			document.head.appendChild(script);
		}
	}
}

/* ============================================================================
 * Row / Card Action Menu Builder
 * ========================================================================== */

import { buildViewportActionItems } from '../ui';
export { buildViewportActionItems };

/* ============================================================================
 * Universal DataViewport Shell (Toolbar, Filters, Saved Views, QuickEdit, Pager)
 * ========================================================================== */

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
	const [busy, setBusy] = useState(false);
	const [searchInput, setSearchInput] = useState(initialProps.searchQuery || '');
	const searchInputRef = useRef(searchInput);
	searchInputRef.current = searchInput;
	const [editingCell, setEditingCell] = useState<{ id: string; field: string; value: string } | null>(null);
	const [quickEditValues, setQuickEditValues] = useState<Record<string, unknown>>({});
	const [showColumnPicker, setShowColumnPicker] = useState(false);
	const [newViewLabel, setNewViewLabel] = useState('');
	const [showSaveViewInput, setShowSaveViewInput] = useState(false);
	const [, setRegistryVersion] = useState(0);
	const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const dispatchSeqRef = useRef(0);

	useEffect(() => {
		const onRegister = () => setRegistryVersion((v) => v + 1);
		viewportListeners.add(onRegister);
		const unsubscribeRuntime =
			typeof window !== 'undefined' && typeof window.ReactWorkspaceRuntime?.subscribeViewportModes === 'function'
				? window.ReactWorkspaceRuntime.subscribeViewportModes(onRegister)
				: undefined;
		return () => {
			viewportListeners.delete(onRegister);
			unsubscribeRuntime?.();
		};
	}, []);

	useEffect(() => {
		const mode = (state.viewMode || 'table').toLowerCase();
		if (!getViewport(mode)) {
			if (state.viewScripts?.[mode]?.length) {
				ensureViewportModeScriptLoaded(mode, state.viewScripts);
			} else {
				void window.ReactWorkspaceRuntime?.ensureViewportModeLoaded?.(mode);
			}
		}
	}, [state.viewMode, state.viewScripts]);

	useEffect(() => {
		setState(initialProps);
		setSearchInput(initialProps.searchQuery || '');
	}, [initialProps]);

	useEffect(() => {
		if (state.quickEdit?.record) {
			setQuickEditValues({ ...state.quickEdit.record });
		} else {
			setQuickEditValues({});
		}
	}, [state.quickEdit]);

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
				const headers: Record<string, string> = {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					'X-Requested-With': 'XMLHttpRequest',
				};
				const resolvedCsrf = state.csrf?.value ? state.csrf : getCsrfToken();
				if (resolvedCsrf?.value) {
					headers['X-CSRF-Token'] = resolvedCsrf.value;
				}

				const response = await fetch(safeEndpoint, {
					method: 'POST',
					headers,
					body: JSON.stringify({
						stateToken: state.stateToken,
						csrf: resolvedCsrf,
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
							month: state.calendar?.month,
							year: state.calendar?.year,
							calendarView: state.calendar?.calendarView,
							quickEditRecordId: state.quickEditRecordId,
						},
					}),
				});

				let json: {
					ok?: boolean;
					viewport?: ViewportState;
					error?: string;
					message?: string;
				} | null = null;
				try {
					json = (await response.json()) as {
						ok?: boolean;
						viewport?: ViewportState;
						error?: string;
						message?: string;
					};
				} catch {
					json = null;
				}
				if (seq !== dispatchSeqRef.current) {
					return;
				}
				if (response.ok && json && json.ok && json.viewport) {
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
				} else {
					const errorMessage =
						typeof json?.error === 'string' && json.error.trim() !== ''
							? json.error
							: typeof json?.message === 'string' && json.message.trim() !== ''
								? json.message
								: `Request failed (${response.status || 'error'}).`;
					setState((prev) => ({
						...prev,
						...(json?.viewport && typeof json.viewport === 'object' ? json.viewport : {}),
						notice: {
							message: errorMessage,
							type: 'error',
						},
					}));
				}
			} catch {
				if (seq !== dispatchSeqRef.current) {
					return;
				}
				setState((prev) => ({
					...prev,
					notice: {
						message: t('viewport.networkError', 'Network error while updating this list.'),
						type: 'error',
					},
				}));
			} finally {
				if (seq === dispatchSeqRef.current) {
					setBusy(false);
				}
			}
		},
		[state]
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
	const hasDedicatedIconColumn = React.useMemo(
		() =>
			Object.entries(visibleColsForVisuals).some(
				([k, d], i) => i > 0 && (k === 'icon' || d.type === 'icon')
			),
		[visibleColsForVisuals]
	);
	const hasDedicatedThumbColumn = React.useMemo(
		() =>
			Object.entries(visibleColsForVisuals).some(
				([k, d], i) => i > 0 && (k === 'thumb' || k === 'image' || d.type === 'media' || d.type === 'image')
			),
		[visibleColsForVisuals]
	);

	const renderCellValue = useCallback(
		(
			record: Record<string, unknown>,
			colKey: string,
			colDef: ViewportColumn,
			options?: RenderCellOptions
		): React.ReactNode => {
			const recordId = String(record.id ?? '');
			const rawVal = record[colKey];
			const colType = colDef.type || 'text';
			const isPrimaryCol = Boolean(options?.isPrimaryColumn);
			const justifyCls =
				colDef.align === 'right'
					? 'justify-end'
					: colDef.align === 'center'
						? 'justify-center'
						: 'justify-start';

			if (colType === 'boolean' || colType === 'toggle' || colType === 'switch') {
				const checked = Boolean(rawVal && rawVal !== '0' && rawVal !== 'false');
				if (colDef.editable) {
					return (
						<Switch
							checked={checked}
							aria-label={colDef.label}
							onCheckedChange={() => dispatch('toggle_field', { id: recordId, field: colKey })}
						/>
					);
				}
				return (
					<Badge variant={checked ? 'success' : 'secondary'}>
						{checked ? t('common.yes', 'Yes') : t('common.no', 'No')}
					</Badge>
				);
			}

			if (colKey === 'status' && record._statusVariant && !colDef.editable) {
				const statusLabel = String(record._statusLabel || rawVal || '—');
				return (
					<Badge variant={record._statusVariant as BadgeProps['variant']} dot>
						{statusLabel}
					</Badge>
				);
			}

			const recordCells =
				record._cells && typeof record._cells === 'object'
					? (record._cells as Record<string, unknown>)
					: null;
			const cellFromMap = recordCells ? recordCells[colKey] : undefined;
			const isIconValueObj =
				rawVal !== null &&
				typeof rawVal === 'object' &&
				!Array.isArray(rawVal) &&
				typeof (rawVal as Record<string, unknown>).name === 'string' &&
				('svg' in (rawVal as Record<string, unknown>) ||
					'variant' in (rawVal as Record<string, unknown>) ||
					'set' in (rawVal as Record<string, unknown>));

			const cellObj: ViewportCellObject | null = isViewportCellObject(cellFromMap)
				? cellFromMap
				: isViewportCellObject(rawVal)
					? rawVal
					: isIconValueObj
						? {
								icon: rawVal as Record<string, unknown>,
								label: String((rawVal as Record<string, unknown>).name || ''),
							}
						: null;

			if (colType === 'badge' || colType === 'status' || colDef.badgeVariants) {
				const explicitBadges = normalizeViewportBadges(cellObj?.badges ?? cellObj?.badge);
				if (explicitBadges.length > 0) {
					return <BadgeGroup badges={explicitBadges} maxVisible={cellObj?.maxBadges ?? colDef.maxBadges ?? 3} />;
				}
				if (Array.isArray(rawVal)) {
					const mapped = normalizeViewportBadges(
						rawVal.map((item) => {
							const key = String(item ?? '');
							return {
								label: colDef.options?.[key] ?? key,
								variant: (colDef.badgeVariants?.[key] as BadgeProps['variant']) || 'secondary',
							};
						})
					);
					return mapped.length > 0 ? (
						<BadgeGroup badges={mapped} maxVisible={colDef.maxBadges ?? 3} />
					) : (
						<span className="text-muted-foreground">—</span>
					);
				}
				const strVal = String(rawVal ?? '');
				const label = cellObj?.label ?? colDef.options?.[strVal] ?? strVal;
				const variantMap = colDef.badgeVariants || {};
				const badgeVariant = (variantMap[strVal] as BadgeProps['variant']) || 'secondary';
				return <Badge variant={badgeVariant}>{label || '—'}</Badge>;
			}

			if (colDef.editable && editingCell?.id === recordId && editingCell?.field === colKey) {
				const editScalar =
					rawVal !== null && typeof rawVal === 'object'
						? String(cellObj?.label ?? cellObj?.title ?? '')
						: String(rawVal ?? '');
				if (colDef.options && Object.keys(colDef.options).length > 0) {
					return (
						<Select
							aria-label={colDef.label}
							value={editingCell.value}
							onChange={(e) => {
								const nextVal = e.target.value;
								setEditingCell(null);
								dispatch('update_field', { id: recordId, field: colKey, value: nextVal });
							}}
							onBlur={() => setEditingCell(null)}
							autoFocus
							className="h-7 text-xs"
						>
							{Object.entries(colDef.options).map(([optKey, optLabel]) => (
								<option key={optKey} value={optKey}>
									{optLabel}
								</option>
							))}
						</Select>
					);
				}

				return (
					<Input
						aria-label={colDef.label}
						value={editingCell.value}
						onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
						onBlur={() => {
							const nextVal = editingCell.value;
							setEditingCell(null);
							if (nextVal !== editScalar) {
								dispatch('update_field', { id: recordId, field: colKey, value: nextVal });
							}
						}}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								const nextVal = editingCell.value;
								setEditingCell(null);
								dispatch('update_field', { id: recordId, field: colKey, value: nextVal });
							} else if (e.key === 'Escape') {
								setEditingCell(null);
							}
						}}
						autoFocus
						className="h-7 text-xs"
					/>
				);
			}

			if (colType === 'icon') {
				const iconPayload = cellObj?.icon ?? (rawVal !== null && rawVal !== '' ? rawVal : undefined);
				if (iconPayload === undefined || iconPayload === '') {
					return <span className="text-muted-foreground">—</span>;
				}
				const iconLabel =
					cellObj?.label ??
					(typeof rawVal === 'string' && !rawVal.trim().startsWith('{')
						? rawVal.trim()
						: isIconValueObj
							? String((rawVal as Record<string, unknown>).name || '')
							: '');
				return (
					<span className={cn('inline-flex min-w-0 items-center gap-2', justifyCls)}>
						<RecordLeadingVisual icon={iconPayload as string | Record<string, unknown>} size="sm" />
						{iconLabel ? (
							<span className={cn('truncate', (cellObj?.mono ?? colDef.mono) && 'font-mono text-xs')}>
								{iconLabel}
							</span>
						) : null}
					</span>
				);
			}

			if (colType === 'media' || colType === 'image') {
				const mediaThumb = normalizeViewportThumb(
					cellObj?.thumb ?? rawVal,
					String(record.title || record.name || colDef.label)
				);
				if (!mediaThumb) {
					return <span className="text-muted-foreground">—</span>;
				}
				return (
					<span className={cn('inline-flex min-w-0 items-center gap-2', justifyCls)}>
						<RecordLeadingVisual thumb={mediaThumb} size={state.dense ? 'sm' : 'md'} />
						{cellObj?.label ? <span className="truncate text-xs">{cellObj.label}</span> : null}
					</span>
				);
			}

			const recordFormatted =
				record._formatted && typeof record._formatted === 'object'
					? (record._formatted as Record<string, unknown>)
					: null;
			const formattedVal = recordFormatted?.[colKey];
			const plainFormatted =
				typeof formattedVal === 'string' && !formattedVal.includes('<')
					? formattedVal
					: undefined;

			const optionMappedLabel =
				colDef.options && rawVal !== undefined ? colDef.options[String(rawVal)] : undefined;

			const displayStr: string =
				cellObj?.label !== undefined
					? String(cellObj.label || '—')
					: cellObj?.title !== undefined
						? String(cellObj.title || '—')
						: optionMappedLabel !== undefined
							? optionMappedLabel
							: plainFormatted !== undefined && plainFormatted !== ''
								? plainFormatted
								: rawVal === null || rawVal === undefined || rawVal === ''
									? '—'
									: typeof rawVal === 'object'
										? JSON.stringify(rawVal)
										: String(rawVal);

			const recVisuals =
				isPrimaryCol && !options?.suppressRecordVisuals
					? resolveRecordVisuals(record, {
							hasDedicatedIconColumn,
							hasDedicatedThumbColumn,
						})
					: null;

			const thumb =
				normalizeViewportThumb(cellObj?.thumb, displayStr) ?? (recVisuals ? recVisuals.thumb : null);
			const icon = cellObj?.icon ?? (!thumb && recVisuals ? recVisuals.icon : undefined);
			const rawSubtitle = (cellObj?.subtitle ?? (recVisuals ? recVisuals.subtitle : ''))?.trim() || '';
			const subtitle = rawSubtitle !== '' && rawSubtitle !== displayStr ? rawSubtitle : '';
			const badges = [
				...normalizeViewportBadges(cellObj?.badges ?? cellObj?.badge),
				...(recVisuals ? recVisuals.badges : []),
			];
			const locked = Boolean(recVisuals?.locked);

			const primaryEditHref =
				isPrimaryCol &&
				!colDef.editable &&
				typeof record._editUrl === 'string' &&
				record._editUrl !== ''
					? sanitizeHref(record._editUrl)
					: '';
			const explicitHref = sanitizeHref(
				cellObj?.href || (colType === 'link' && typeof rawVal === 'string' ? rawVal : '')
			);
			const resolvedHref = explicitHref || primaryEditHref;
			const isExternal = Boolean(
				cellObj?.external || (explicitHref !== '' && colType === 'link' && /^https?:\/\//i.test(explicitHref))
			);

			const copyEnabled = Boolean(cellObj?.copyable ?? cellObj?.copyValue ?? colDef.copyable);
			const copyScalarFallback =
				rawVal !== null && rawVal !== undefined && rawVal !== '' && typeof rawVal !== 'object'
					? String(rawVal)
					: displayStr !== '—'
						? displayStr
						: '';
			const copyValue =
				typeof cellObj?.copyValue === 'string' && cellObj.copyValue !== ''
					? cellObj.copyValue
					: copyEnabled && displayStr !== '—'
						? copyScalarFallback
						: '';

			const isMono = Boolean(cellObj?.mono ?? (colDef.mono || colType === 'code'));
			const isTabular = Boolean(cellObj?.tabular ?? colDef.tabular);
			const isNowrap = Boolean(cellObj?.nowrap ?? colDef.nowrap);
			const truncateSpec = cellObj?.truncate ?? colDef.truncate;
			const {
				display: truncatedLabel,
				truncated: showFullTitleTooltip,
				cssTruncate,
			} = applyTextTruncate(displayStr, truncateSpec);

			const textModifierClasses = cn(
				isMono && 'font-mono text-xs',
				isTabular && 'tabular-nums',
				isNowrap && 'whitespace-nowrap',
				cssTruncate && 'inline-block max-w-96 truncate align-bottom'
			);

			const hasLeading = Boolean(thumb || (icon !== undefined && icon !== ''));
			const hasSubtitle = subtitle !== '';
			const hasComposition =
				hasLeading || hasSubtitle || badges.length > 0 || copyValue !== '' || resolvedHref !== '' || locked;

			if (colDef.editable && !hasLeading && !hasSubtitle && badges.length === 0 && copyValue === '' && !locked) {
				const editableRawScalar =
					rawVal !== null && typeof rawVal === 'object' ? displayStr : String(rawVal ?? '');
				return (
					<button
						type="button"
						onClick={() =>
							setEditingCell({
								id: recordId,
								field: colKey,
								value: editableRawScalar,
							})
						}
						className={cn(
							'group inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-muted text-left cursor-pointer',
							textModifierClasses
						)}
						title={t('viewport.clickToEditInline', 'Click to edit inline')}
					>
						<span>{truncatedLabel}</span>
						<DynamicIcon
							name="edit-3"
							className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-80 pointer-coarse:opacity-60"
						/>
					</button>
				);
			}

			if (!hasComposition) {
				return (
					<span title={showFullTitleTooltip ? displayStr : undefined} className={textModifierClasses}>
						{truncatedLabel}
					</span>
				);
			}

			const editableRawScalar =
				rawVal !== null && typeof rawVal === 'object' ? displayStr : String(rawVal ?? '');
			const primaryNode = colDef.editable ? (
				<button
					type="button"
					onClick={() =>
						setEditingCell({
							id: recordId,
							field: colKey,
							value: editableRawScalar,
						})
					}
					className={cn(
						'group inline-flex min-w-0 items-center gap-1.5 rounded px-1 -mx-1 hover:bg-muted text-left cursor-pointer',
						isPrimaryCol && 'font-medium text-foreground',
						textModifierClasses
					)}
					title={t('viewport.clickToEditInline', 'Click to edit inline')}
				>
					<span className="truncate">{truncatedLabel}</span>
					<DynamicIcon
						name="edit-3"
						className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-80 pointer-coarse:opacity-60"
					/>
				</button>
			) : resolvedHref && displayStr !== '—' ? (
				<ViewportLink
					href={resolvedHref}
					external={isExternal}
					target={isExternal ? '_blank' : undefined}
					rel={isExternal ? 'noopener noreferrer' : undefined}
					title={showFullTitleTooltip ? displayStr : undefined}
					className={cn(
						'inline-flex min-w-0 items-center gap-1 hover:text-primary hover:underline',
						isPrimaryCol ? 'font-medium text-foreground' : 'text-primary',
						textModifierClasses
					)}
				>
					<span className={cn(cssTruncate && 'truncate')}>{truncatedLabel}</span>
					{isExternal ? <DynamicIcon name="external-link" className="size-3 shrink-0 opacity-70" /> : null}
				</ViewportLink>
			) : (
				<span
					title={showFullTitleTooltip ? displayStr : undefined}
					className={cn(isPrimaryCol && 'font-medium text-foreground', textModifierClasses)}
				>
					{truncatedLabel}
				</span>
			);

			const showPrimaryRow = !(thumb && (displayStr === '' || displayStr === '—') && badges.length === 0 && copyValue === '');

			return (
				<div
					data-rw-cell-media={hasLeading ? '' : undefined}
					data-rw-cell-multiline={hasSubtitle ? 'true' : undefined}
					data-rw-cell-copyable={copyValue !== '' ? '' : undefined}
					className={cn(
						'flex min-w-0',
						hasSubtitle ? 'items-start' : 'items-center',
						justifyCls,
						hasLeading ? (thumb ? 'gap-3' : 'gap-2.5') : 'gap-1.5'
					)}
				>
					{hasLeading ? (
						<RecordLeadingVisual
							thumb={thumb}
							icon={icon}
							multiline={hasSubtitle}
							size={state.dense ? 'sm' : 'md'}
						/>
					) : null}
					{showPrimaryRow || hasSubtitle ? (
						<div
							className={cn(
								'min-w-0',
								colDef.align === 'right' && 'text-right',
								colDef.align === 'center' && 'text-center'
							)}
						>
							{showPrimaryRow ? (
								<div className={cn('flex flex-wrap items-center gap-1.5 min-w-0', justifyCls)}>
									{primaryNode}
									{locked ? (
										<span
											title="Locked"
											className="inline-flex shrink-0 text-muted-foreground"
										>
											<DynamicIcon name="lock" className="size-3.5" />
										</span>
									) : null}
									{badges.length > 0 ? (
										<BadgeGroup
											badges={badges}
											maxVisible={cellObj?.maxBadges ?? colDef.maxBadges ?? 3}
											compact
										/>
									) : null}
									{copyValue !== '' ? (
										<CopyValueButton value={copyValue} subjectLabel={displayStr} />
									) : null}
								</div>
							) : null}
							{hasSubtitle ? (
								<div
									title={subtitle}
									className={cn(
										'mt-0.5 truncate text-xs font-normal text-muted-foreground',
										(cellObj?.subtitleMono ?? colDef.subtitleMono) && 'font-mono text-[11px]'
									)}
								>
									{subtitle}
								</div>
							) : null}
						</div>
					) : null}
				</div>
			);
		},
		[dispatch, editingCell, hasDedicatedIconColumn, hasDedicatedThumbColumn, state.dense]
	);

	const quickEditTitleId = useId();
	const quickEditOpen = Boolean(state.quickEdit);
	const quickEditDialogRef = useRef<HTMLDialogElement | null>(null);
	const handleQuickEditOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) {
				void dispatch('close_quick_edit');
			}
		},
		[dispatch]
	);
	const quickEditCtrl = useModalDialogController(
		quickEditDialogRef,
		quickEditOpen,
		handleQuickEditOpenChange
	);

	const columnPickerRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (!showColumnPicker || typeof document === 'undefined') {
			return;
		}
		const onMouseDown = (e: MouseEvent) => {
			if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
				setShowColumnPicker(false);
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				setShowColumnPicker(false);
			}
		};
		document.addEventListener('mousedown', onMouseDown);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onMouseDown);
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [showColumnPicker]);

	const [pendingDeleteView, setPendingDeleteView] = useState<{ key: string; label: string } | null>(null);
	const [pendingBulkConfirm, setPendingBulkConfirm] = useState<{
		key: string;
		label: string;
		confirm: string;
		danger: boolean;
	} | null>(null);
	const [pendingActionConfirm, setPendingActionConfirm] = useState<{
		actionType: 'row_action' | 'toolbar_action';
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
	const ActiveCanvas = getViewport(activeViewMode);
	const viewsEntries = Object.entries(state.views || {});
	const savedViewsEntries = Object.entries(state.savedViews || {});
	const filterEntries = Object.entries(state.filters || {});
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

	const showSavedViewsBar =
		state.saveViewEnabled !== false && (viewsEntries.length > 0 || savedViewsEntries.length > 0);
	const inlineViewPillItems: ViewportPillOption[] =
		state.saveViewEnabled === false && viewsEntries.length > 0
			? viewsEntries.map(([vKey, vDef]) => ({
					key: vKey,
					label: vDef.label,
					count: vDef.count,
					icon: vDef.icon,
				}))
			: [];
	const pillFilterEntries =
		state.showFilterBar !== false
			? filterEntries.filter(([, fDef]) => fDef.display === 'pills')
			: [];
	const selectFilterEntries =
		state.showFilterBar !== false
			? filterEntries.filter(([, fDef]) => fDef.display !== 'pills')
			: [];
	const hasResetButton = Boolean(
		state.searchQuery || (state.filterValues && Object.keys(state.filterValues).length > 0)
	);
	const hasPillFilters = inlineViewPillItems.length > 0 || pillFilterEntries.length > 0;
	const hasLeftFilters =
		hasPillFilters || selectFilterEntries.length > 0 || hasResetButton;

	return (
		<div className="space-y-4" data-viewport-id={state.componentId} data-viewport-mode={state.viewMode}>
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

			{/* Views & Saved Presets Bar */}
			{showSavedViewsBar && (
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
					<div className="flex flex-wrap items-center gap-1">
						{viewsEntries.map(([vKey, vDef]) => {
							const isActive = (state.activeView || 'all') === vKey;
							return (
								<Button
									key={vKey}
									variant={isActive ? 'default' : 'ghost'}
									size="xs"
									icon={vDef.icon}
									onClick={() => dispatch('select_view', { view: vKey })}
								>
									<span>{vDef.label}</span>
									{vDef.count !== undefined && (
										<Badge variant={isActive ? 'secondary' : 'muted'} className="ml-1 px-1.5 py-0">
											{vDef.count}
										</Badge>
									)}
								</Button>
							);
						})}
						{savedViewsEntries.map(([sKey, sDef]) => {
							const fullKey = `saved:${sKey}`;
							const isActive = state.activeView === fullKey;
							return (
								<div key={fullKey} className="inline-flex items-center gap-0.5">
									<Button
										variant={isActive ? 'default' : 'outline'}
										size="xs"
										icon="bookmark"
										onClick={() => dispatch('select_view', { view: fullKey })}
									>
										{sDef.label}
									</Button>
									<button
										type="button"
										onClick={() => setPendingDeleteView({ key: fullKey, label: sDef.label })}
										className="inline-flex min-h-6 min-w-6 pointer-coarse:min-h-9 pointer-coarse:min-w-9 items-center justify-center rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
										aria-label={t('viewport.deleteSavedView', 'Delete saved view')}
										title={t('viewport.deleteSavedView', 'Delete saved view')}
									>
										<DynamicIcon name="x" className="size-3" />
									</button>
								</div>
							);
						})}
					</div>

					<div className="flex items-center gap-1.5">
						{showSaveViewInput ? (
							<div className="flex items-center gap-1">
								<Input
									aria-label={t('viewport.presetNamePlaceholder', 'Preset name...')}
									value={newViewLabel}
									onChange={(e) => setNewViewLabel(e.target.value)}
									placeholder={t('viewport.presetNamePlaceholder', 'Preset name...')}
									className="h-7 w-36 text-xs"
								/>
								<Button
									size="xs"
									onClick={() => {
										if (newViewLabel.trim()) {
											dispatch('save_view', { label: newViewLabel.trim() });
											setNewViewLabel('');
											setShowSaveViewInput(false);
										}
									}}
								>
									{t('common.save', 'Save')}
								</Button>
								<Button variant="ghost" size="xs" onClick={() => setShowSaveViewInput(false)}>
									{t('common.cancel', 'Cancel')}
								</Button>
							</div>
						) : (
							<Button
								variant="ghost"
								size="xs"
								icon="bookmark-plus"
								onClick={() => setShowSaveViewInput(true)}
							>
								{t('viewport.saveView', 'Save View')}
							</Button>
						)}
					</div>
				</div>
			)}

			{/* Primary Toolbar & Filter Bar */}
			{state.showToolbar !== false && (
				<div
					data-rw-viewport-toolbar=""
					className={cn(
						'flex flex-wrap items-center justify-between gap-2.5',
						hasPillFilters && 'md:flex-nowrap'
					)}
				>
					{hasLeftFilters && (
						<div
							data-rw-viewport-filters=""
							className={cn(
								'flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-1',
								hasPillFilters && 'md:flex-nowrap'
							)}
						>
							{inlineViewPillItems.length > 0 && (
								<ViewportPillStrip
									items={inlineViewPillItems}
									activeKey={state.activeView || inlineViewPillItems[0]?.key || 'all'}
									ariaLabel={t('viewport.filterViews', 'Filter view')}
									onSelect={(vKey) => {
										void dispatch('select_view', { view: vKey });
									}}
								/>
							)}

							{pillFilterEntries.map(([fKey, fDef]) => {
								const optionItems: ViewportPillOption[] = [
									{
										key: '',
										label: t('common.all', 'All'),
										count: fDef.totalCount,
									},
									...Object.entries(fDef.options || {}).map(([optKey, optLabel]) => ({
										key: optKey,
										label: optLabel,
										count: fDef.counts?.[optKey],
										icon: fDef.icons?.[optKey],
									})),
								];
								return (
									<ViewportPillStrip
										key={fKey}
										items={optionItems}
										activeKey={String(state.filterValues?.[fKey] ?? '')}
										ariaLabel={fDef.label}
										onSelect={(val) => {
											void dispatch('filter', { key: fKey, value: val });
										}}
									/>
								);
							})}

							{selectFilterEntries.map(([fKey, fDef]) => (
								<Select
									key={fKey}
									aria-label={fDef.label}
									value={String(state.filterValues?.[fKey] ?? '')}
									onChange={(e) =>
										dispatch('filter', { key: fKey, value: e.target.value })
									}
									className="h-8 w-full shrink-0 text-xs sm:w-auto sm:min-w-32 sm:max-w-48"
								>
									<option value="">
										{fDef.label}: {t('common.all', 'All')}
									</option>
									{Object.entries(fDef.options || {}).map(([optKey, optLabel]) => (
										<option key={optKey} value={optKey}>
											{optLabel}
										</option>
									))}
								</Select>
							))}

							{hasResetButton && (
								<Button
									variant="ghost"
									size="xs"
									icon="rotate-ccw"
									className="shrink-0"
									onClick={() => {
										if (searchDebounceRef.current) {
											clearTimeout(searchDebounceRef.current);
											searchDebounceRef.current = null;
										}
										void dispatch('reset_filters');
									}}
								>
									{t('common.reset', 'Reset')}
								</Button>
							)}
						</div>
					)}

					<div
						data-rw-viewport-actions=""
						className={cn(
							'flex w-full flex-wrap items-center gap-2 shrink-0',
							hasLeftFilters ? 'sm:ml-auto sm:w-auto' : 'sm:flex-1'
						)}
					>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								if (searchDebounceRef.current) {
									clearTimeout(searchDebounceRef.current);
									searchDebounceRef.current = null;
								}
								void dispatch('search', { query: searchInput });
							}}
							className={cn(
								'relative min-w-0 flex-1',
								hasLeftFilters ? 'sm:w-56 sm:flex-none' : 'sm:flex-1'
							)}
						>
							<Input
								type="search"
								aria-label={state.searchPlaceholder || t('viewport.searchPlaceholder', 'Search records...')}
								value={searchInput}
								onChange={(e) => setSearchInput(e.target.value)}
								placeholder={state.searchPlaceholder || t('viewport.searchPlaceholderShort', 'Search...')}
								className="h-8 pl-8 pr-7 text-xs [&::-webkit-search-cancel-button]:hidden"
							/>
							<DynamicIcon
								name="search"
								className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground"
							/>
							{searchInput && (
								<button
									type="button"
									aria-label={t('common.clear', 'Clear')}
									onClick={() => {
										if (searchDebounceRef.current) {
											clearTimeout(searchDebounceRef.current);
											searchDebounceRef.current = null;
										}
										setSearchInput('');
										void dispatch('search', { query: '' });
									}}
									className="absolute right-2 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
								>
									<DynamicIcon name="x" className="size-3.5" />
								</button>
							)}
						</form>

						{/* View Mode Switcher */}
						{state.allowedViewModes && state.allowedViewModes.length > 1 && (
							<div className="inline-flex shrink-0 items-center rounded-md border border-border bg-card p-0.5">
								{state.allowedViewModes.map((mode) => {
									const isActive = state.viewMode === mode;
									const iconName =
										mode === 'table'
											? 'table'
											: mode === 'cards'
												? 'layout-grid'
												: mode === 'kanban'
													? 'columns'
													: 'calendar';
									return (
										<button
											key={mode}
											type="button"
											onClick={() => dispatch('switch_view_mode', { mode })}
											onMouseEnter={() => {
												const target = mode.toLowerCase();
												if (!getViewport(target)) {
													if (state.viewScripts?.[target]?.length) {
														ensureViewportModeScriptLoaded(target, state.viewScripts);
													} else {
														void window.ReactWorkspaceRuntime?.ensureViewportModeLoaded?.(target);
													}
												}
											}}
											onFocus={() => {
												const target = mode.toLowerCase();
												if (!getViewport(target)) {
													if (state.viewScripts?.[target]?.length) {
														ensureViewportModeScriptLoaded(target, state.viewScripts);
													} else {
														void window.ReactWorkspaceRuntime?.ensureViewportModeLoaded?.(target);
													}
												}
											}}
											className={cn(
												'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium capitalize transition-colors cursor-pointer',
												isActive
													? 'bg-primary text-primary-foreground'
													: 'text-muted-foreground hover:text-foreground'
											)}
										>
											<DynamicIcon name={iconName} className="size-3.5" />
											<span>{mode}</span>
										</button>
									);
								})}
							</div>
						)}

						{/* Column Picker */}
						{state.columnPickerEnabled !== false && Object.keys(state.columns || {}).length > 1 && (
							<div ref={columnPickerRef} className="relative shrink-0">
								<Button
									variant="outline"
									size="sm"
									icon="sliders-horizontal"
									aria-expanded={showColumnPicker}
									onClick={() => setShowColumnPicker((v) => !v)}
								>
									{t('viewport.columns', 'Columns')}
								</Button>
								{showColumnPicker && (
									<div className="absolute right-0 z-30 mt-1.5 w-52 rounded-lg border border-border bg-popover p-2 shadow-lg">
										<div className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-semibold uppercase text-muted-foreground">
											<span>{t('viewport.toggleColumns', 'Toggle Columns')}</span>
											<button
												type="button"
												onClick={() => dispatch('reset_columns')}
												className="text-primary hover:underline cursor-pointer"
											>
												{t('common.reset', 'Reset')}
											</button>
										</div>
										<div className="space-y-1">
											{Object.entries(state.columns || {}).map(([colKey, colDef]) => {
												const isHidden = (state.hiddenColumns || []).includes(colKey);
												return (
													<label
														key={colKey}
														className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted cursor-pointer"
													>
														<input
															type="checkbox"
															checked={!isHidden}
															onChange={() =>
																dispatch('toggle_column', { column: colKey })
															}
															className="size-3.5 rounded border-border accent-primary"
														/>
														<span className="truncate">{colDef.label}</span>
													</label>
												);
											})}
										</div>
									</div>
								)}
							</div>
						)}

						{/* Export */}
						{state.exportEnabled && (
							<Button
								variant="outline"
								size="sm"
								icon="download"
								className="shrink-0"
								onClick={() => dispatch('export', { format: 'csv' })}
							>
								{t('common.export', 'Export')}
							</Button>
						)}

						{/* Secondary Toolbar Actions */}
						{Array.isArray(state.toolbarActions) &&
							state.toolbarActions.map((tAct) => {
								if (!tAct || !tAct.label) {
									return null;
								}
								const safeHref = tAct.href ? sanitizeHref(tAct.href) : '';
								if (safeHref) {
									return (
										<ViewportLink
											key={tAct.key}
											href={safeHref}
											{...(tAct.dataAttrs || {})}
											className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:border-primary hover:bg-muted/70"
										>
											{tAct.icon ? <DynamicIcon name={tAct.icon} className="size-3.5" /> : null}
											<span>{tAct.label}</span>
											{tAct.badge ? (
												<Badge variant="secondary" mono className="px-1.5 py-0 text-[10px]">
													{tAct.badge}
												</Badge>
											) : null}
										</ViewportLink>
									);
								}
								const isDanger = tAct.variant === 'danger' || tAct.variant === 'destructive';
								return (
									<Button
										key={tAct.key}
										type="button"
										variant={isDanger ? 'destructive' : 'outline'}
										size="sm"
										icon={tAct.icon}
										disabled={busy}
										className="shrink-0"
										{...(tAct.dataAttrs || {})}
										onClick={() => {
											if (tAct.confirm) {
												setPendingActionConfirm({
													actionType: 'toolbar_action',
													key: tAct.key,
													label: tAct.label,
													confirm: tAct.confirm,
													danger: isDanger,
												});
												return;
											}
											void dispatch('toolbar_action', { toolbarAction: tAct.key });
										}}
									>
										<span>{tAct.label}</span>
										{tAct.badge ? (
											<Badge variant="secondary" mono className="ml-1 px-1.5 py-0 text-[10px]">
												{tAct.badge}
											</Badge>
										) : null}
									</Button>
								);
							})}

						{/* Create CTA (Single Link or Multi-Action Dropdown) */}
						{renderViewportCreateTrigger(state, 'viewport-create', false)}
					</div>
				</div>
			)}

			{/* Bulk Action Bar */}
			{selectedCount > 0 && bulkEntries.length > 0 && (
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
					</div>
				</div>
			)}

			{/* Active Viewport Canvas */}
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

			{/* Windowed Pagination */}
			{state.showPagination !== false && (state.totalPages || 1) > 1 && (
				<div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-muted-foreground">
					<div>
						{t('viewport.pageSummary', { page: state.page || 1, totalPages: state.totalPages || 1 }, 'Page {page} of {totalPages}')}{' '}
						({t('viewport.totalItems', { count: state.total || 0 }, '{count} items')})
					</div>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="xs"
							disabled={busy || (state.page || 1) <= 1}
							onClick={() => dispatch('page', { page: (state.page || 1) - 1 })}
						>
							{t('viewport.previousPage', 'Previous')}
						</Button>
						<Button
							variant="outline"
							size="xs"
							disabled={busy || (state.page || 1) >= (state.totalPages || 1)}
							onClick={() => dispatch('page', { page: (state.page || 1) + 1 })}
						>
							{t('viewport.nextPage', 'Next')}
						</Button>
					</div>
				</div>
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
						if (target.actionType === 'toolbar_action') {
							void dispatch('toolbar_action', { toolbarAction: target.key });
						} else if (target.recordId) {
							void dispatch('row_action', { rowAction: target.key, id: target.recordId });
						}
					}}
				/>
			) : null}

			{/* Quick-Edit Modal / Drawer (Native Top-Layer <dialog>) */}
			{state.quickEdit && typeof document !== 'undefined'
				? createPortal(
						<dialog
							ref={quickEditDialogRef}
							data-rw-sheet-dialog=""
							data-rw-portal-overlay=""
							aria-labelledby={quickEditTitleId}
							{...({ closedby: 'any' } as Record<string, string>)}
							onPointerDown={quickEditCtrl.handlePointerDown}
							onPointerUp={quickEditCtrl.handlePointerUp}
							onClose={quickEditCtrl.handleClose}
							style={{ ['--rw-sheet-max-w' as string]: '28rem' }}
							className="text-card-foreground"
						>
							<div className="flex items-center justify-between gap-3 border-b border-border/75 px-6 py-4 shrink-0">
								<div className="min-w-0">
									<h2 id={quickEditTitleId} className="truncate text-[15px] font-semibold tracking-tight text-foreground">
										{state.quickEdit.recordId === '__new__'
											? t('viewport.newItem', 'New Item')
											: t(
													'viewport.quickEditTitle',
													{
														title: String(
															state.quickEdit.record?.title ||
																state.quickEdit.record?.label ||
																state.quickEdit.record?.name ||
																state.quickEdit.recordId
														),
													},
													'Quick Edit: {title}'
												)}
									</h2>
									<p className="mt-0.5 text-xs text-muted-foreground">
										{t('viewport.quickEditSubtitle', 'Edit key fields without leaving this list.')}
									</p>
								</div>
								<Button
									variant="ghost"
									size="icon"
									icon="x"
									aria-label={t('common.close', 'Close')}
									onClick={() => dispatch('close_quick_edit')}
								/>
							</div>

							<div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-6">
								{Object.entries(state.quickEdit.fields || {}).map(([fKey, fDef]) => {
									const val = quickEditValues[fKey] ?? '';
									const quickFieldId = `${quickEditTitleId}-${fKey}`;
									return (
										<div key={fKey} className="space-y-1.5">
											<label htmlFor={quickFieldId} className="block text-xs font-medium text-foreground">
												{fDef.label}
											</label>
											{fDef.options && Object.keys(fDef.options).length > 0 ? (
												<Select
													id={quickFieldId}
													value={String(val)}
													onChange={(e) =>
														setQuickEditValues({
															...quickEditValues,
															[fKey]: e.target.value,
														})
													}
												>
													{Object.entries(fDef.options).map(([oKey, oLabel]) => (
														<option key={oKey} value={oKey}>
															{oLabel}
														</option>
													))}
												</Select>
											) : (
												<Input
													id={quickFieldId}
													value={String(val)}
													onChange={(e) =>
														setQuickEditValues({
															...quickEditValues,
															[fKey]: e.target.value,
														})
													}
												/>
											)}
										</div>
									);
								})}
							</div>

							<div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-border/75 bg-muted/30 px-6 py-3.5">
								<Button variant="outline" size="sm" disabled={busy} onClick={() => dispatch('close_quick_edit')}>
									{t('common.cancel', 'Cancel')}
								</Button>
								<Button
									size="sm"
									disabled={busy}
									onClick={() =>
										dispatch('save_quick_edit', {
											id: state.quickEdit?.recordId,
											values: quickEditValues,
										})
									}
								>
									{t('viewport.saveChanges', 'Save Changes')}
								</Button>
							</div>
						</dialog>,
						document.body
					)
				: null}
		</div>
	);
};

export const DataTable: React.FC<ViewportState> = (props) => (
	<DataViewport {...props} viewMode={props.viewMode || 'table'} />
);

export const DataCards: React.FC<ViewportState> = (props) => (
	<DataViewport {...props} viewMode={props.viewMode || 'cards'} />
);
