import React from 'react';
import { t } from '../lib/i18n';
import { cn, DynamicIcon } from '../lib/utils';
import {
	buildViewportActionItems,
	DropdownMenu,
	EmptyState,
	isVisualOnlyColumn,
	resolvePrimaryColumnKey,
	SortableHandle,
	SortableStatusRegion,
	useSortableList,
} from '../ui';
import { renderViewportCreateTrigger } from './viewportShared';
import type { ViewportCanvasProps } from './DataViewport';

/* ============================================================================
 * Built-in Table Canvas (ReactWorkspace/Table)
 * ========================================================================== */

export const DataTableCanvas: React.FC<ViewportCanvasProps> = ({
	state,
	busy,
	dispatch,
	resolveRecordActions,
	onRequestConfirm,
	renderCellValue,
}) => {
	const cols = state.displayColumns && Object.keys(state.displayColumns).length > 0
		? state.displayColumns
		: state.columns || {};
	const colEntries = Object.entries(cols);
	const records = state.records || [];
	const selectedIds = state.selectedIds || [];
	const allIds = records.map((r) => String(r.id ?? ''));
	const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
	const canReorder = Boolean(
		state.reorderEnabled &&
			!state.locked &&
			!state.searchQuery &&
			(!state.sortField || state.sortField === 'sort') &&
			records.length > 1
	);

	const tableSortable = useSortableList<Record<string, unknown>>({
		items: records,
		getId: (r) => String(r.id ?? ''),
		getLabel: (r, idx) => String(r.title || r.label || r.name || r.id || `Row ${idx + 1}`),
		axis: 'vertical',
		disabled: !canReorder || busy,
		onReorder: (nextRecords) => {
			void dispatch('reorder', {
				orderedIds: nextRecords.map((r) => String(r.id ?? '')),
			});
		},
	});

	if (records.length === 0) {
		const isUnfilteredEmpty =
			!state.searchQuery &&
			Object.keys(state.filterValues || {}).length === 0 &&
			(!state.activeView || state.activeView === 'all');
		const emptyCta = isUnfilteredEmpty
			? renderViewportCreateTrigger(state, 'viewport-empty-create', true)
			: null;
		return (
			<EmptyState
				icon={state.emptyIcon || 'inbox'}
				title={state.emptyTitle || t('viewport.noItemsYet', 'No items yet')}
				description={state.emptyMessage || t('viewport.emptySearchHint', 'Try changing your search or filters.')}
				action={emptyCta ?? undefined}
			/>
		);
	}

	const rowMenuMap = records.map((record) =>
		buildViewportActionItems(record, resolveRecordActions(record), state, dispatch, onRequestConfirm)
	);
	const hasAnyRowActions = rowMenuMap.some((items) => items.length > 0);
	const tableRowValign = state.rowValign || 'middle';
	const auxValignClass = tableRowValign === 'top' ? 'align-top pt-2.5' : 'align-middle';
	const auxDataValign = tableRowValign === 'top' ? 'top' : 'middle';
	const primaryColKey = resolvePrimaryColumnKey(cols);
	const regionLabel = (state.title || state.componentId || 'Table').trim();

	return (
		<div
			role="region"
			aria-label={regionLabel}
			tabIndex={0}
			className="overflow-x-auto rounded-lg border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
		>
			<SortableStatusRegion message={tableSortable.statusMessage} />
			<table
				data-rw-table=""
				data-rw-viewport-table=""
				className={cn('w-full border-collapse text-left text-sm', state.dense ? 'text-xs' : 'text-sm')}
			>
				<thead>
					<tr className="border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
						{canReorder && (
							<th scope="col" className="w-9 px-2 py-2 text-center align-middle">
								<span className="sr-only">{t('viewport.orderColumn', 'Order')}</span>
							</th>
						)}
						{state.selectable !== false && (
							<th scope="col" className="w-10 px-3 py-2 text-center align-middle">
								<input
									type="checkbox"
									className="size-4 rounded border-border accent-primary cursor-pointer align-middle"
									checked={allSelected}
									onChange={() =>
										dispatch(allSelected ? 'clear_selection' : 'select_all', {
											ids: allSelected ? [] : allIds,
										})
									}
									aria-label={t('viewport.selectAllRows', 'Select all rows')}
								/>
							</th>
						)}
						{colEntries.map(([colKey, colDef]) => {
							const isSorted = state.sortField === colKey;
							const isCompactVisual = isVisualOnlyColumn(colKey, colDef) && !colDef.showLabel;
							const defaultVisualWidthClass =
								!colDef.width && isCompactVisual
									? colDef.type === 'icon'
										? 'w-13'
										: 'w-15'
									: undefined;
							const alignClass =
								colDef.align === 'right'
									? 'text-right'
									: colDef.align === 'center'
										? 'text-center'
										: 'text-left';

							return (
								<th
									key={colKey}
									scope="col"
									aria-sort={
										colDef.sortable && isSorted
											? state.sortDirection === 'desc'
												? 'descending'
												: 'ascending'
											: undefined
									}
									style={colDef.width ? { width: colDef.width } : undefined}
									className={cn(
										isCompactVisual ? 'px-2.5' : 'px-3.5',
										'py-2 align-middle font-semibold whitespace-nowrap select-none',
										defaultVisualWidthClass,
										alignClass
									)}
								>
									{colDef.sortable ? (
										<button
											type="button"
											onClick={() => dispatch('sort', { field: colKey })}
											className={cn(
												'inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground cursor-pointer',
												colDef.align === 'right' && 'ml-auto'
											)}
										>
											<span className={colDef.label ? undefined : 'sr-only'}>
												{colDef.label || colKey}
											</span>
											<DynamicIcon
												name={
													isSorted
														? state.sortDirection === 'desc'
															? 'chevron-down'
															: 'chevron-up'
														: 'chevrons-up-down'
												}
												aria-hidden="true"
												className={cn('size-3.5', isSorted ? 'text-primary' : 'opacity-45')}
											/>
										</button>
									) : (
										<span className={colDef.label ? undefined : 'sr-only'}>
											{colDef.label || colKey}
										</span>
									)}
								</th>
							);
						})}
						{hasAnyRowActions && (
							<th
								scope="col"
								className="sticky right-0 z-10 w-16 border-l border-border/60 bg-muted px-3 py-2 text-right align-middle whitespace-nowrap shadow-[-8px_0_12px_-8px_rgb(0_0_0/0.25)]"
							>
								{t('common.actions', 'Actions')}
							</th>
						)}
					</tr>
				</thead>
				<tbody
					{...(canReorder ? tableSortable.getContainerProps() : {})}
					className="divide-y divide-border"
				>
					{records.map((record, idx) => {
						const recordId = String(record.id ?? idx);
						const isSelected = selectedIds.includes(recordId);
						const menuItems = rowMenuMap[idx] || [];
						const rowLabel = String(record.title || record.label || record.name || recordId);
						const recordDepth = Math.max(
							0,
							Math.min(5, Number(record._depth ?? record.depth ?? 0) || 0)
						);

						return (
							<tr
								key={recordId}
								{...(canReorder ? tableSortable.getItemProps(record) : {})}
								className={cn(
									'group transition-colors hover:bg-muted/35',
									isSelected && 'bg-primary/5',
									busy && 'opacity-70'
								)}
							>
								{canReorder && (
									<td data-valign={auxDataValign} className={cn('w-9 px-2 py-2 text-center', auxValignClass)}>
										<SortableHandle
											size="xs"
											{...tableSortable.getHandleProps(record, idx)}
										/>
									</td>
								)}
								{state.selectable !== false && (
									<td data-valign={auxDataValign} className={cn('px-3 py-2 text-center', auxValignClass)}>
										<input
											type="checkbox"
											className="size-4 rounded border-border accent-primary cursor-pointer align-middle"
											checked={isSelected}
											onChange={() => dispatch('select_row', { id: recordId })}
											aria-label={`Select ${rowLabel}`}
										/>
									</td>
								)}
								{colEntries.map(([colKey, colDef]) => {
									const isPrimaryCol = colKey === primaryColKey;
									const isCompactVisual = isVisualOnlyColumn(colKey, colDef) && !colDef.showLabel;
									const alignClass =
										colDef.align === 'right'
											? 'text-right'
											: colDef.align === 'center'
												? 'text-center'
												: 'text-left';
									const effectiveValign = colDef.valign || tableRowValign;
									const valignClass =
										effectiveValign === 'top'
											? 'align-top'
											: effectiveValign === 'bottom'
												? 'align-bottom'
												: 'align-middle';
									const cellNode = renderCellValue(record, colKey, colDef, {
										isPrimaryColumn: isPrimaryCol,
									});

									return (
										<td
											key={colKey}
											data-valign={effectiveValign}
											style={
												isPrimaryCol && recordDepth > 0
													? { paddingLeft: `${0.875 + recordDepth * 1.25}rem` }
													: undefined
											}
											className={cn(
												isCompactVisual ? 'px-2.5' : 'px-3.5',
												state.dense ? 'py-1.5' : 'py-2.5',
												alignClass,
												valignClass
											)}
										>
											{cellNode}
										</td>
									);
								})}
								{hasAnyRowActions && (
									<td
										data-valign={auxDataValign}
										className={cn(
											'sticky right-0 z-10 border-l border-border/60 bg-card px-3 py-2 text-right whitespace-nowrap shadow-[-8px_0_12px_-8px_rgb(0_0_0/0.2)] transition-colors group-hover:bg-muted',
											auxValignClass
										)}
									>
										<DropdownMenu
											items={menuItems}
											triggerAriaLabel={`Actions for ${rowLabel}`}
											triggerDataAttr={recordId}
											disabled={busy}
										/>
									</td>
								)}
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
};
