import type React from 'react';

export interface ViewportColumn {
	label: string;
	primary?: boolean;
	sortable?: boolean;
	align?: 'left' | 'center' | 'right';
	valign?: 'top' | 'middle' | 'bottom';
	width?: string;
	type?: string;
	showLabel?: boolean;
	shape?: 'rounded' | 'circle' | 'video';
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

export interface ViewportQuickEditSpec {
	recordId: string;
	title: string;
	formSchema: Record<string, unknown>;
	scriptAssets?: string[];
	styleAssets?: string[];
	editUrl?: string;
}

export interface ViewportModeMeta {
	icon?: string;
	label?: string;
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
	viewModeMeta?: Record<string, ViewportModeMeta>;
	modeState?: Record<string, unknown>;
	viewScripts?: Record<string, string[]>;
	viewStyles?: Record<string, string[]>;
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
	trashCount?: number;
	isTrashView?: boolean;
	supportsTrash?: boolean;
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
	quickEdit?: ViewportQuickEditSpec | null;
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

export interface ViewportPillOption {
	key: string;
	label: string;
	count?: number;
	icon?: string;
}
