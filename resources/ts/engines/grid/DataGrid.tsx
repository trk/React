import React, { useMemo, useRef, useState } from 'react';
import {
	columnResizingFeature,
	columnSizingFeature,
	columnVisibilityFeature,
	createExpandedRowModel,
	createSortedRowModel,
	flexRender,
	rowExpandingFeature,
	rowSelectionFeature,
	rowSortingFeature,
	sortFns,
	tableFeatures,
	useTable,
	type ColumnDef,
	type ColumnVisibilityState,
	type ExpandedState,
	type Row,
	type RowSelectionState,
	type SortingState,
	type Updater,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Checkbox, EmptyState, Skeleton } from '../../ui';
import type {
	DataGridColumn,
	DataGridColumnVisibilityState,
	DataGridExpandedState,
	DataGridProps,
	DataGridRowSelectionState,
	DataGridSortingState,
} from './types';

const DATA_GRID_FEATURES = tableFeatures({
	rowSortingFeature,
	rowSelectionFeature,
	columnVisibilityFeature,
	columnSizingFeature,
	columnResizingFeature,
	rowExpandingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns,
	expandedRowModel: createExpandedRowModel(),
});

type GridFeatures = typeof DATA_GRID_FEATURES;

interface ColumnRenderMeta {
	align?: 'left' | 'center' | 'right';
	headerClassName?: string;
	cellClassName?: string;
}

function resolveUpdater<T>(updater: Updater<T>, prev: T): T {
	return typeof updater === 'function' ? (updater as (old: T) => T)(prev) : updater;
}

function normalizeRowSelection(raw?: DataGridRowSelectionState): RowSelectionState {
	if (!raw) {
		return {};
	}
	const out: RowSelectionState = {};
	for (const [k, v] of Object.entries(raw)) {
		if (v) {
			out[k] = true;
		}
	}
	return out;
}

export function DataGrid<TData extends Record<string, unknown>>({
	data,
	columns,
	getRowId,
	getSubRows,
	renderSubRow,
	loading = false,
	loadingRows = 5,
	emptyTitle,
	emptyDescription,
	emptyIcon = 'inbox',
	emptyAction,
	dense = false,
	stickyHeader = false,
	maxHeight,
	virtualized = false,
	estimateRowHeight = 42,
	overscan = 8,
	manualSorting = false,
	sorting: controlledSorting,
	onSortingChange,
	enableRowSelection = false,
	rowSelection: controlledRowSelection,
	onRowSelectionChange,
	columnVisibility: controlledVisibility,
	onColumnVisibilityChange,
	expanded: controlledExpanded,
	onExpandedChange,
	enableColumnResizing = false,
	onRowClick,
	rowClassName,
	ariaLabel,
	className,
}: DataGridProps<TData>): React.ReactElement {
	const [internalSorting, setInternalSorting] = useState<DataGridSortingState>([]);
	const [internalSelection, setInternalSelection] = useState<DataGridRowSelectionState>({});
	const [internalVisibility, setInternalVisibility] = useState<DataGridColumnVisibilityState>({});
	const [internalExpanded, setInternalExpanded] = useState<DataGridExpandedState>({});
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);

	const activeSorting = (controlledSorting ?? internalSorting) as SortingState;
	const activeSelection = useMemo(
		() => normalizeRowSelection(controlledRowSelection ?? internalSelection),
		[controlledRowSelection, internalSelection]
	);
	const activeVisibility = (controlledVisibility ?? internalVisibility) as ColumnVisibilityState;
	const activeExpanded = (controlledExpanded ?? internalExpanded) as ExpandedState;

	const colMetaById = useMemo(() => {
		const map = new Map<string, ColumnRenderMeta>();
		columns.forEach((col, idx) => {
			const resolvedId = col.id || col.accessorKey || `col_${idx}`;
			map.set(resolvedId, {
				align: col.align,
				headerClassName: col.headerClassName,
				cellClassName: col.cellClassName,
			});
		});
		return map;
	}, [columns]);

	const tableColumns = useMemo<Array<ColumnDef<GridFeatures, TData>>>(() => {
		return columns.map((col: DataGridColumn<TData>, idx: number): ColumnDef<GridFeatures, TData> => {
			const resolvedId = col.id || col.accessorKey || `col_${idx}`;
			const base: ColumnDef<GridFeatures, TData> = {
				id: resolvedId,
				accessorFn: col.accessorFn
					? (row, rowIndex) => col.accessorFn!(row, rowIndex)
					: col.accessorKey
						? (row) => row[col.accessorKey!]
						: () => undefined,
				enableSorting: Boolean(col.sortable),
				enableHiding: col.enableHiding ?? true,
				enableResizing: col.enableResizing ?? enableColumnResizing,
				size: col.size,
				minSize: col.minSize,
				maxSize: col.maxSize,
				header: ({ column }) => {
					const sorted = column.getIsSorted();
					if (typeof col.header === 'function') {
						return col.header({ columnId: resolvedId, sorted });
					}
					return col.header;
				},
				cell: ({ row, getValue }) => {
					const val = getValue();
					if (col.cell) {
						return col.cell({
							row: row.original,
							rowIndex: row.index,
							value: val,
							isSelected: row.getIsSelected(),
							isExpanded: row.getIsExpanded(),
							canExpand: row.getCanExpand() || Boolean(renderSubRow),
							toggleExpanded: () => row.toggleExpanded(),
						});
					}
					if (val === null || val === undefined) {
						return '—';
					}
					return String(val);
				},
			};
			return base;
		});
	}, [columns, enableColumnResizing, renderSubRow]);

	const table = useTable({
		features: DATA_GRID_FEATURES,
		data,
		columns: tableColumns,
		getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
		getSubRows: getSubRows ? (row) => getSubRows(row) : undefined,
		getRowCanExpand: renderSubRow ? () => true : undefined,
		manualSorting,
		enableRowSelection,
		enableColumnResizing,
		columnResizeMode: 'onChange',
		state: {
			sorting: activeSorting,
			rowSelection: activeSelection,
			columnVisibility: activeVisibility,
			expanded: activeExpanded,
		},
		onSortingChange: (updater) => {
			const next = resolveUpdater(updater, activeSorting) as DataGridSortingState;
			if (controlledSorting === undefined) {
				setInternalSorting(next);
			}
			onSortingChange?.(next);
		},
		onRowSelectionChange: (updater) => {
			const nextRaw = resolveUpdater(updater, activeSelection);
			const next: DataGridRowSelectionState = { ...nextRaw };
			if (controlledRowSelection === undefined) {
				setInternalSelection(next);
			}
			onRowSelectionChange?.(next);
		},
		onColumnVisibilityChange: (updater) => {
			const next = resolveUpdater(updater, activeVisibility);
			if (controlledVisibility === undefined) {
				setInternalVisibility(next);
			}
			onColumnVisibilityChange?.(next);
		},
		onExpandedChange: (updater) => {
			const next = resolveUpdater(updater, activeExpanded) as DataGridExpandedState;
			if (controlledExpanded === undefined) {
				setInternalExpanded(next);
			}
			onExpandedChange?.(next);
		},
	});

	const rows = table.getRowModel().rows;
	const rowVirtualizer = useVirtualizer({
		count: virtualized ? rows.length : 0,
		getScrollElement: () => scrollContainerRef.current,
		estimateSize: () => estimateRowHeight,
		overscan,
		enabled: virtualized,
	});

	const visibleColCount = table.getVisibleLeafColumns().length + (enableRowSelection ? 1 : 0);

	if (loading && data.length === 0) {
		const skeletonCount = Math.max(1, loadingRows);
		return (
			<div
				className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}
				data-rw-grid-loading=""
			>
				<div className="space-y-2 p-3">
					{Array.from({ length: skeletonCount }).map((_, idx) => (
						<Skeleton key={idx} className="h-8 w-full rounded-md" />
					))}
				</div>
			</div>
		);
	}

	if (!loading && data.length === 0) {
		return (
			<div className={cn(className)}>
				<EmptyState
					icon={emptyIcon}
					title={emptyTitle || t('viewport.noItemsYet', 'No items yet')}
					description={emptyDescription ?? ''}
					action={emptyAction}
				/>
			</div>
		);
	}

	const virtualItems = virtualized ? rowVirtualizer.getVirtualItems() : [];
	const totalVirtualSize = virtualized ? rowVirtualizer.getTotalSize() : 0;
	const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
	const paddingBottom =
		virtualItems.length > 0
			? Math.max(0, totalVirtualSize - (virtualItems[virtualItems.length - 1]?.end ?? 0))
			: 0;

	const rowsToRender: Array<Row<GridFeatures, TData>> = virtualized
		? virtualItems
				.map((vi) => rows[vi.index])
				.filter((r): r is Row<GridFeatures, TData> => Boolean(r))
		: rows;

	const headerCellPad = dense ? 'px-2.5 py-1.5' : 'px-3.5 py-2';
	const bodyCellPad = dense ? 'px-2.5 py-1.5' : 'px-3.5 py-2.5';

	return (
		<div
			ref={scrollContainerRef}
			role="region"
			aria-label={ariaLabel || t('grid.dataGridRegion', 'Data grid')}
			tabIndex={0}
			style={
				maxHeight !== undefined
					? { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }
					: undefined
			}
			className={cn(
				'overflow-auto rounded-lg border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
				className
			)}
		>
			<table
				data-rw-grid=""
				data-rw-table=""
				data-virtualized={virtualized ? '1' : undefined}
				className={cn('w-full border-collapse text-left', dense ? 'text-xs' : 'text-sm')}
			>
				<thead className={cn(stickyHeader && 'sticky top-0 z-10 bg-muted/95 backdrop-blur-xs')}>
					{table.getHeaderGroups().map((headerGroup) => (
						<tr
							key={headerGroup.id}
							className="border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
						>
							{enableRowSelection ? (
								<th scope="col" className={cn('w-10 text-center align-middle', headerCellPad)}>
									<Checkbox
										checked={table.getIsAllRowsSelected()}
										indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
										onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
										aria-label={t('viewport.selectAllRows', 'Select all rows')}
										className="justify-center"
									/>
								</th>
							) : null}
							{headerGroup.headers.map((header) => {
								const colMeta = colMetaById.get(header.column.id);
								const canSort = header.column.getCanSort();
								const sorted = header.column.getIsSorted();
								const alignClass =
									colMeta?.align === 'right'
										? 'text-right'
										: colMeta?.align === 'center'
											? 'text-center'
											: 'text-left';

								return (
									<th
										key={header.id}
										scope="col"
										aria-sort={
											canSort && sorted
												? sorted === 'desc'
													? 'descending'
													: 'ascending'
												: undefined
										}
										style={
											enableColumnResizing || header.column.columnDef.size
												? { width: `${header.getSize()}px` }
												: undefined
										}
										className={cn(
											'relative align-middle font-semibold whitespace-nowrap select-none',
											headerCellPad,
											alignClass,
											colMeta?.headerClassName
										)}
									>
										{canSort ? (
											<button
												type="button"
												onClick={header.column.getToggleSortingHandler()}
												className={cn(
													'inline-flex items-center gap-1 hover:text-foreground cursor-pointer',
													colMeta?.align === 'right' && 'ml-auto'
												)}
											>
												<span>
													{header.isPlaceholder
														? null
														: flexRender(header.column.columnDef.header, header.getContext())}
												</span>
												<DynamicIcon
													name={
														sorted === 'desc'
															? 'chevron-down'
															: sorted === 'asc'
																? 'chevron-up'
																: 'chevrons-up-down'
													}
													className={cn('size-3', !sorted && 'opacity-45')}
													aria-hidden="true"
												/>
											</button>
										) : header.isPlaceholder ? null : (
											flexRender(header.column.columnDef.header, header.getContext())
										)}
										{enableColumnResizing && header.column.getCanResize() ? (
											<div
												onMouseDown={header.getResizeHandler()}
												onTouchStart={header.getResizeHandler()}
												role="separator"
												aria-orientation="vertical"
												aria-label={t('grid.resizeColumn', 'Resize column')}
												className={cn(
													'absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/50',
													header.column.getIsResizing() && 'bg-primary'
												)}
											/>
										) : null}
									</th>
								);
							})}
						</tr>
					))}
				</thead>
				<tbody className="divide-y divide-border/70">
					{paddingTop > 0 ? (
						<tr aria-hidden="true">
							<td colSpan={visibleColCount} style={{ height: `${paddingTop}px`, padding: 0 }} />
						</tr>
					) : null}
					{rowsToRender.map((row) => {
						const isSelected = row.getIsSelected();
						const isExpanded = row.getIsExpanded();
						return (
							<React.Fragment key={row.id}>
								<tr
									data-state={isSelected ? 'selected' : undefined}
									onClick={
										onRowClick
											? () => onRowClick(row.original, row.index)
											: undefined
									}
									className={cn(
										'transition-colors hover:bg-muted/35',
										isSelected && 'bg-primary/6',
										onRowClick && 'cursor-pointer',
										rowClassName?.(row.original, row.index)
									)}
								>
									{enableRowSelection ? (
										<td
											onClick={(e) => e.stopPropagation()}
											className={cn('w-10 text-center align-middle', bodyCellPad)}
										>
											<Checkbox
												checked={isSelected}
												disabled={!row.getCanSelect()}
												onCheckedChange={(checked) => row.toggleSelected(checked)}
												aria-label={t('grid.selectRow', 'Select row')}
												className="justify-center"
											/>
										</td>
									) : null}
									{row.getVisibleCells().map((cell) => {
										const colMeta = colMetaById.get(cell.column.id);
										const alignClass =
											colMeta?.align === 'right'
												? 'text-right'
												: colMeta?.align === 'center'
													? 'text-center'
													: 'text-left';
										return (
											<td
												key={cell.id}
												className={cn('align-middle text-foreground', bodyCellPad, alignClass, colMeta?.cellClassName)}
											>
												{flexRender(cell.column.columnDef.cell, cell.getContext())}
											</td>
										);
									})}
								</tr>
								{renderSubRow && isExpanded ? (
									<tr className="bg-muted/20">
										<td colSpan={visibleColCount} className="p-3">
											{renderSubRow(row.original)}
										</td>
									</tr>
								) : null}
							</React.Fragment>
						);
					})}
					{paddingBottom > 0 ? (
						<tr aria-hidden="true">
							<td colSpan={visibleColCount} style={{ height: `${paddingBottom}px`, padding: 0 }} />
						</tr>
					) : null}
				</tbody>
			</table>
		</div>
	);
}
