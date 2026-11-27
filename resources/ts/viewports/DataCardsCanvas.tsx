import React from 'react';
import { t } from '../lib/i18n';
import { cn, sanitizeHref } from '../lib/utils';
import {
	buildViewportActionItems,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	DropdownMenu,
	EmptyState,
	isViewportCellObject,
	isVisualOnlyColumn,
	normalizeViewportThumb,
	RecordLeadingVisual,
	resolvePrimaryColumnKey,
	resolveRecordVisuals,
	SortableHandle,
	SortableStatusRegion,
	useRwDarkTheme,
	useSortableList,
} from '../ui';
import { renderViewportCreateTrigger, ViewportLink } from './viewportShared';
import type { ViewportCanvasProps } from './DataViewport';

/* ============================================================================
 * Built-in Cards Canvas (ReactWorkspace/Cards)
 * ========================================================================== */

export const DataCardsCanvas: React.FC<ViewportCanvasProps> = ({
	state,
	busy,
	dispatch,
	resolveRecordActions,
	onRequestConfirm,
	renderCellValue,
}) => {
	const isDark = useRwDarkTheme();
	const cols = state.displayColumns && Object.keys(state.displayColumns).length > 0
		? state.displayColumns
		: state.columns || {};
	const colEntries = Object.entries(cols);
	const records = state.records || [];
	const selectedIds = state.selectedIds || [];
	const canReorder = Boolean(
		state.reorderEnabled &&
			!state.locked &&
			!state.searchQuery &&
			(!state.sortField || state.sortField === 'sort') &&
			records.length > 1
	);

	const cardsSortable = useSortableList<Record<string, unknown>>({
		items: records,
		getId: (r) => String(r.id ?? ''),
		getLabel: (r, idx) => String(r.title || r.label || r.name || r.id || t('viewport.cardNumber', { number: idx + 1 }, 'Card {number}')),
		axis: 'grid',
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
				icon={state.emptyIcon || 'th-large'}
				title={state.emptyTitle || t('viewport.noItemsYet', 'No items yet')}
				description={state.emptyMessage || t('viewport.emptySearchHint', 'Try changing your search or filters.')}
				action={emptyCta ?? undefined}
			/>
		);
	}

	const primaryColKey = resolvePrimaryColumnKey(cols);
	const primaryColDef = cols[primaryColKey] || { label: t('viewport.defaultTitleLabel', 'Title') };
	const secondaryCols = colEntries.filter(
		([k, d]) => k !== primaryColKey && !isVisualOnlyColumn(k, d)
	);
	const imageColEntry = colEntries.find(([, d]) => d.type === 'image' || d.type === 'media');
	const iconColEntry = colEntries.find(([, d]) => d.type === 'icon');

	return (
		<>
			<SortableStatusRegion message={cardsSortable.statusMessage} />
			<div
				{...(canReorder ? cardsSortable.getContainerProps() : {})}
				className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3"
			>
				{records.map((record, idx) => {
					const recordId = String(record.id ?? idx);
					const isSelected = selectedIds.includes(recordId);
					const menuItems = buildViewportActionItems(
						record,
						resolveRecordActions(record),
						state,
						dispatch,
						onRequestConfirm
					);
					const rowLabel = String(record.title || record.label || record.name || recordId);
					const cardVisuals = resolveRecordVisuals(record);
					const cardEditHref = typeof record._editUrl === 'string' ? sanitizeHref(record._editUrl) : '';
					const recordCells =
						record._cells && typeof record._cells === 'object'
							? (record._cells as Record<string, unknown>)
							: null;

					const imageColKey = imageColEntry?.[0];
					const imageColShape = imageColEntry?.[1]?.shape;
					const imageColCell =
						imageColKey && recordCells && isViewportCellObject(recordCells[imageColKey])
							? recordCells[imageColKey]
							: imageColKey && isViewportCellObject(record[imageColKey])
								? record[imageColKey]
								: null;
					const colThumb = imageColKey
						? normalizeViewportThumb(imageColCell?.thumb ?? record[imageColKey], rowLabel)
						: null;
					const cardThumb = cardVisuals.thumb ?? colThumb;
					const videoThumb =
						cardThumb && (cardThumb.aspect === 'video' || imageColShape === 'video')
							? cardThumb
							: null;
					const inlineThumb = videoThumb ? null : cardThumb;

					const iconColKey = iconColEntry?.[0];
					const iconColCell =
						iconColKey && recordCells && isViewportCellObject(recordCells[iconColKey])
							? recordCells[iconColKey]
							: iconColKey && isViewportCellObject(record[iconColKey])
								? record[iconColKey]
								: null;
					const colIconRaw = iconColKey ? iconColCell?.icon ?? record[iconColKey] : undefined;
					const colIcon =
						colIconRaw !== undefined && colIconRaw !== null && colIconRaw !== ''
							? (colIconRaw as string | Record<string, unknown>)
							: undefined;
					const cardIcon = cardVisuals.icon ?? colIcon;
					const showCardIconSlot = Boolean(cardIcon && !inlineThumb);

					const primaryCellObj =
						recordCells && isViewportCellObject(recordCells[primaryColKey])
							? recordCells[primaryColKey]
							: isViewportCellObject(record[primaryColKey])
								? record[primaryColKey]
								: null;
					const hasCardHeaderSubtitle = Boolean(
						(primaryCellObj?.subtitle && primaryCellObj.subtitle.trim() !== '') ||
							(typeof record._subtitle === 'string' && record._subtitle.trim() !== '') ||
							(typeof record.subtitle === 'string' && record.subtitle.trim() !== '')
					);

					const videoBannerImg = videoThumb ? (
						<img
							src={isDark && videoThumb.darkSrc ? videoThumb.darkSrc : videoThumb.src}
							alt=""
							width={640}
							height={360}
							loading="lazy"
							decoding="async"
							data-rw-preview-scheme={isDark ? 'dark' : 'light'}
							className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02] motion-reduce:transition-none motion-reduce:hover:scale-100"
						/>
					) : null;

					return (
						<Card
							key={recordId}
							{...(canReorder ? cardsSortable.getItemProps(record) : {})}
							className={cn(
								'flex flex-col justify-between overflow-hidden transition-[border-color,box-shadow,background-color,opacity] hover:border-primary/40',
								isSelected && 'ring-2 ring-primary/40 border-primary',
								busy && 'opacity-70'
							)}
						>
							{videoThumb ? (
								cardEditHref ? (
									<ViewportLink
										href={cardEditHref}
										tabIndex={-1}
										aria-hidden="true"
										data-rw-card-media="banner"
										className="relative block aspect-[16/9] w-full overflow-hidden border-b border-border/60 bg-muted/40"
									>
										{videoBannerImg}
									</ViewportLink>
								) : (
									<div
										data-rw-card-media="banner"
										className="relative aspect-[16/9] w-full overflow-hidden border-b border-border/60 bg-muted/40"
									>
										{videoBannerImg}
									</div>
								)
							) : null}
							<CardHeader className="p-4 pb-2">
								<div
									className={cn(
										'flex justify-between gap-2',
										hasCardHeaderSubtitle ? 'items-start' : 'items-center'
									)}
								>
									<div
										className={cn(
											'flex min-w-0 flex-1 gap-2.5',
											hasCardHeaderSubtitle ? 'items-start' : 'items-center'
										)}
									>
										{canReorder && (
											<SortableHandle
												size="xs"
												{...cardsSortable.getHandleProps(record, idx)}
											/>
										)}
										{state.selectable !== false && (
											<input
												type="checkbox"
												className={cn(
													'size-4 rounded border-border accent-primary cursor-pointer shrink-0',
													hasCardHeaderSubtitle && 'mt-0.5'
												)}
												checked={isSelected}
												onChange={() => dispatch('select_row', { id: recordId })}
												aria-label={t('viewport.selectRow', { label: rowLabel }, 'Select {label}')}
											/>
										)}
										{inlineThumb ? (
											<div
												data-rw-card-media="thumb"
												className={cn('shrink-0', hasCardHeaderSubtitle && 'mt-0.5')}
											>
												<RecordLeadingVisual
													thumb={inlineThumb}
													shape={imageColShape}
													size="md"
												/>
											</div>
										) : showCardIconSlot ? (
											<div
												data-rw-card-icon=""
												className={cn('shrink-0', hasCardHeaderSubtitle && 'mt-0.5')}
											>
												<RecordLeadingVisual icon={cardIcon} size="md" />
											</div>
										) : null}
										<CardTitle className="min-w-0 flex-1 text-sm font-semibold leading-5">
											{renderCellValue(record, primaryColKey, primaryColDef, {
												isPrimaryColumn: true,
												suppressRecordVisuals: true,
											})}
										</CardTitle>
									</div>
									{menuItems.length > 0 ? (
										<DropdownMenu
											items={menuItems}
											triggerAriaLabel={t('viewport.actionsForRow', { label: rowLabel }, 'Actions for {label}')}
											triggerDataAttr={recordId}
											disabled={busy}
										/>
									) : null}
								</div>
							</CardHeader>
							{(() => {
								const rawDesc = record._description ?? record.description;
								const cardDescription =
									!secondaryCols.some(([k]) => k === 'description') &&
									typeof rawDesc === 'string'
										? rawDesc.trim()
										: '';
								if (cardDescription === '' && secondaryCols.length === 0) {
									return null;
								}
								return (
									<CardContent className="space-y-2.5 p-4 pt-1.5 text-xs">
										{cardDescription !== '' && (
											<p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
												{cardDescription}
											</p>
										)}
										{secondaryCols.length > 0 && (
											<dl className="grid grid-cols-2 gap-x-3 gap-y-2">
												{secondaryCols.map(([colKey, colDef]) => (
													<div key={colKey} className="min-w-0 overflow-hidden">
														<dt className="truncate text-[11px] text-muted-foreground">
															{colDef.label}
														</dt>
														<dd className="mt-0.5 min-w-0 truncate font-medium text-foreground [&_a]:max-w-full [&_a]:truncate [&_button]:max-w-full [&_button]:truncate">
															{renderCellValue(record, colKey, { ...colDef, align: 'left' })}
														</dd>
													</div>
												))}
											</dl>
										)}
									</CardContent>
								);
							})()}
						</Card>
					);
				})}
			</div>
		</>
	);
};
