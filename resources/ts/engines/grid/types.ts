import type React from 'react';

export interface DataGridSortingItem {
	id: string;
	desc: boolean;
}

export type DataGridSortingState = DataGridSortingItem[];
export type DataGridRowSelectionState = Record<string, boolean>;
export type DataGridColumnVisibilityState = Record<string, boolean>;
export type DataGridExpandedState = true | Record<string, boolean>;

export interface DataGridHeaderContext {
	columnId: string;
	sorted: false | 'asc' | 'desc';
}

export interface DataGridCellContext<TData> {
	row: TData;
	rowIndex: number;
	value: unknown;
	isSelected: boolean;
	isExpanded: boolean;
	canExpand: boolean;
	toggleExpanded: () => void;
}

export interface DataGridColumn<TData extends Record<string, unknown> = Record<string, unknown>> {
	id?: string;
	accessorKey?: keyof TData & string;
	accessorFn?: (row: TData, index: number) => unknown;
	header: React.ReactNode | ((ctx: DataGridHeaderContext) => React.ReactNode);
	cell?: (ctx: DataGridCellContext<TData>) => React.ReactNode;
	sortable?: boolean;
	align?: 'left' | 'center' | 'right';
	size?: number;
	minSize?: number;
	maxSize?: number;
	enableHiding?: boolean;
	enableResizing?: boolean;
	headerClassName?: string;
	cellClassName?: string;
}

export interface DataGridProps<TData extends Record<string, unknown> = Record<string, unknown>> {
	data: TData[];
	columns: Array<DataGridColumn<TData>>;
	getRowId?: (row: TData, index: number) => string;
	getSubRows?: (row: TData) => TData[] | undefined;
	renderSubRow?: (row: TData) => React.ReactNode;
	loading?: boolean;
	loadingRows?: number;
	emptyTitle?: string;
	emptyDescription?: string;
	emptyIcon?: string;
	emptyAction?: React.ReactNode;
	dense?: boolean;
	stickyHeader?: boolean;
	maxHeight?: number | string;
	virtualized?: boolean;
	estimateRowHeight?: number;
	overscan?: number;
	manualSorting?: boolean;
	sorting?: DataGridSortingState;
	onSortingChange?: (next: DataGridSortingState) => void;
	enableRowSelection?: boolean;
	rowSelection?: DataGridRowSelectionState;
	onRowSelectionChange?: (next: DataGridRowSelectionState) => void;
	columnVisibility?: DataGridColumnVisibilityState;
	onColumnVisibilityChange?: (next: DataGridColumnVisibilityState) => void;
	expanded?: DataGridExpandedState;
	onExpandedChange?: (next: DataGridExpandedState) => void;
	enableColumnResizing?: boolean;
	onRowClick?: (row: TData, index: number) => void;
	rowClassName?: (row: TData, index: number) => string | undefined;
	ariaLabel?: string;
	className?: string;
}
