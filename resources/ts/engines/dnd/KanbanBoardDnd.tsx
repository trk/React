import React, { useMemo, useRef, useState } from 'react';
import {
	closestCorners,
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
	type DragCancelEvent,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
} from '@dnd-kit/core';
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { t } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { PortalRoot, SortableStatusRegion } from '../../ui';
import { resolveKanbanMove, type KanbanColumnSpec, type KanbanMoveEvent } from './helpers';

export interface KanbanBoardColumn<TItem = unknown> extends KanbanColumnSpec<TItem> {
	title?: string;
}

export interface KanbanItemRenderContext {
	id: string;
	columnId: string;
	index: number;
	isDragging: boolean;
	isOver: boolean;
	disabled: boolean;
	handleProps: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		ref: (el: HTMLButtonElement | null) => void;
	};
	itemProps: {
		ref: (el: HTMLElement | null) => void;
		style: React.CSSProperties;
		'data-dragging'?: string;
		'data-kanban-item-id': string;
	};
}

export interface KanbanBoardDndProps<
	TItem,
	TCol extends KanbanBoardColumn<TItem> = KanbanBoardColumn<TItem>,
> {
	columns: readonly TCol[];
	getItemId: (item: TItem) => string;
	getItemLabel?: (item: TItem) => string;
	disabled?: boolean;
	className?: string;
	columnClassName?: string;
	columnBodyClassName?: string;
	dragOverlayClassName?: string;
	renderColumnHeader?: (column: TCol, ctx: { isOver: boolean }) => React.ReactNode;
	renderColumnFooter?: (column: TCol) => React.ReactNode;
	renderItem: (item: TItem, ctx: KanbanItemRenderContext) => React.ReactNode;
	renderOverlay?: (item: TItem, columnId: string) => React.ReactNode;
	onColumnsChange: (nextColumns: TCol[], event: KanbanMoveEvent) => void;
	activationDistance?: number;
}

function findItemPosition<TItem, TCol extends KanbanBoardColumn<TItem>>(
	columns: readonly TCol[],
	getItemId: (item: TItem) => string,
	itemId: string,
): { columnIndex: number; columnId: string; index: number; item: TItem } | null {
	for (let c = 0; c < columns.length; c += 1) {
		const col = columns[c];
		if (!col) {
			continue;
		}
		const idx = col.items.findIndex((item) => getItemId(item) === itemId);
		if (idx !== -1) {
			const item = col.items[idx];
			if (item !== undefined) {
				return { columnIndex: c, columnId: col.id, index: idx, item };
			}
		}
	}
	return null;
}

function findColumnIdForTarget<TItem, TCol extends KanbanBoardColumn<TItem>>(
	columns: readonly TCol[],
	getItemId: (item: TItem) => string,
	targetId: string,
): string | null {
	const directCol = columns.find((col) => col.id === targetId);
	if (directCol) {
		return directCol.id;
	}
	const pos = findItemPosition(columns, getItemId, targetId);
	return pos ? pos.columnId : null;
}

function mapResolvedToColumns<TItem, TCol extends KanbanBoardColumn<TItem>>(
	template: readonly TCol[],
	resolved: readonly KanbanColumnSpec<TItem>[],
): TCol[] {
	return template.map((col, idx) => {
		const match = resolved[idx];
		return {
			...col,
			items: match ? [...match.items] : [...col.items],
		};
	});
}

interface KanbanCardProps<TItem> {
	item: TItem;
	id: string;
	columnId: string;
	index: number;
	disabled: boolean;
	renderItem: (item: TItem, ctx: KanbanItemRenderContext) => React.ReactNode;
}

function KanbanCardRow<TItem>({
	item,
	id,
	columnId,
	index,
	disabled,
	renderItem,
}: KanbanCardProps<TItem>): React.ReactNode {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
		isOver,
	} = useSortable({ id, disabled });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const ctx: KanbanItemRenderContext = {
		id,
		columnId,
		index,
		isDragging,
		isOver,
		disabled,
		handleProps: {
			ref: (el) => {
				setActivatorNodeRef(el);
			},
			...(attributes as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>),
			...(listeners as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>),
		},
		itemProps: {
			ref: setNodeRef,
			style,
			'data-dragging': isDragging ? '1' : undefined,
			'data-kanban-item-id': id,
		},
	};

	return <>{renderItem(item, ctx)}</>;
}

interface KanbanColumnContainerProps<TItem, TCol extends KanbanBoardColumn<TItem>> {
	column: TCol;
	getItemId: (item: TItem) => string;
	disabled: boolean;
	columnClassName?: string;
	columnBodyClassName?: string;
	renderColumnHeader?: (column: TCol, ctx: { isOver: boolean }) => React.ReactNode;
	renderColumnFooter?: (column: TCol) => React.ReactNode;
	renderItem: (item: TItem, ctx: KanbanItemRenderContext) => React.ReactNode;
}

function KanbanColumnContainer<TItem, TCol extends KanbanBoardColumn<TItem>>({
	column,
	getItemId,
	disabled,
	columnClassName,
	columnBodyClassName,
	renderColumnHeader,
	renderColumnFooter,
	renderItem,
}: KanbanColumnContainerProps<TItem, TCol>): React.ReactElement {
	const { setNodeRef, isOver } = useDroppable({
		id: column.id,
		disabled,
	});

	const itemIds = useMemo(
		() => column.items.map((item) => getItemId(item)),
		[column.items, getItemId],
	);

	return (
		<div
			ref={setNodeRef}
			data-rw-kanban-column={column.id}
			data-over={isOver ? '1' : undefined}
			className={cn(
				'flex min-w-0 flex-col rounded-lg border border-border bg-muted/25 p-2 transition-colors',
				isOver && 'border-primary/45 bg-primary/5',
				columnClassName,
			)}
		>
			{renderColumnHeader ? renderColumnHeader(column, { isOver }) : null}
			<SortableContext items={itemIds} strategy={verticalListSortingStrategy} disabled={disabled}>
				<div className={cn('flex min-h-12 flex-col gap-2', columnBodyClassName)}>
					{column.items.map((item, idx) => {
						const id = itemIds[idx] ?? getItemId(item);
						return (
							<KanbanCardRow
								key={id}
								item={item}
								id={id}
								columnId={column.id}
								index={idx}
								disabled={disabled}
								renderItem={renderItem}
							/>
						);
					})}
				</div>
			</SortableContext>
			{renderColumnFooter ? renderColumnFooter(column) : null}
		</div>
	);
}

/**
 * Multi-column Kanban drag-and-drop board with live cross-column preview,
 * workspace portal DragOverlay, and immutable commit notification.
 */
export function KanbanBoardDnd<
	TItem,
	TCol extends KanbanBoardColumn<TItem> = KanbanBoardColumn<TItem>,
>({
	columns,
	getItemId,
	getItemLabel,
	disabled = false,
	className,
	columnClassName,
	columnBodyClassName,
	dragOverlayClassName,
	renderColumnHeader,
	renderColumnFooter,
	renderItem,
	renderOverlay,
	onColumnsChange,
	activationDistance = 5,
}: KanbanBoardDndProps<TItem, TCol>): React.ReactElement {
	const [activeId, setActiveId] = useState<string | null>(null);
	const [draftColumns, setDraftColumns] = useState<TCol[] | null>(null);
	const [statusMessage, setStatusMessage] = useState('');
	const dragStartColumnsRef = useRef<readonly TCol[]>(columns);

	const visibleColumns = draftColumns ?? columns;

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: activationDistance,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const activeMatch = activeId
		? findItemPosition(visibleColumns, getItemId, activeId)
		: null;

	const handleDragStart = (event: DragStartEvent) => {
		const id = String(event.active.id);
		const snapshot = columns.map((col) => ({ ...col, items: [...col.items] })) as TCol[];
		dragStartColumnsRef.current = snapshot;
		setDraftColumns(snapshot);
		setActiveId(id);
		const pos = findItemPosition(snapshot, getItemId, id);
		if (pos) {
			const label = getItemLabel ? getItemLabel(pos.item) : id;
			setStatusMessage(t('dnd.pickedUp', { label }, 'Picked up {label}'));
		}
	};

	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event;
		if (!over) {
			return;
		}
		const draggedId = String(active.id);
		const overId = String(over.id);
		if (draggedId === overId) {
			return;
		}
		setDraftColumns((current) => {
			const working = current ?? (columns as TCol[]);
			const fromColId = findColumnIdForTarget(working, getItemId, draggedId);
			const toColId = findColumnIdForTarget(working, getItemId, overId);
			if (!fromColId || !toColId || fromColId === toColId) {
				return current;
			}
			const resolved = resolveKanbanMove(working, getItemId, draggedId, overId);
			if (!resolved) {
				return current;
			}
			return mapResolvedToColumns(working, resolved.columns);
		});
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const draggedId = String(event.active.id);
		const overId = event.over ? String(event.over.id) : null;
		const startSnapshot = dragStartColumnsRef.current;
		const currentWorking = draftColumns ?? columns;

		setActiveId(null);
		setDraftColumns(null);

		if (!overId) {
			setStatusMessage(t('dnd.dragCancelled', 'Drag cancelled'));
			return;
		}

		const finalResolved = resolveKanbanMove(currentWorking, getItemId, draggedId, overId);
		const finalColumns = finalResolved
			? mapResolvedToColumns(currentWorking, finalResolved.columns)
			: mapResolvedToColumns(currentWorking, currentWorking);

		const startPos = findItemPosition(startSnapshot, getItemId, draggedId);
		const endPos = findItemPosition(finalColumns, getItemId, draggedId);
		if (!startPos || !endPos) {
			return;
		}

		if (startPos.columnId === endPos.columnId && startPos.index === endPos.index) {
			return;
		}

		const moveEvent: KanbanMoveEvent = {
			itemId: draggedId,
			fromColumnId: startPos.columnId,
			toColumnId: endPos.columnId,
			fromIndex: startPos.index,
			toIndex: endPos.index,
			sameColumn: startPos.columnId === endPos.columnId,
		};

		const label = getItemLabel ? getItemLabel(endPos.item) : draggedId;
		setStatusMessage(
			t(
				'dnd.movedToPositionShort',
				{
					label,
					position: endPos.index + 1,
				},
				'Moved {label} to position {position}'
			),
		);
		onColumnsChange(finalColumns, moveEvent);
	};

	const handleDragCancel = (_event: DragCancelEvent) => {
		setActiveId(null);
		setDraftColumns(null);
		setStatusMessage(t('dnd.dragCancelled', 'Drag cancelled'));
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCorners}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<div
				className={cn('grid gap-3', className)}
				data-rw-kanban-board=""
			>
				{visibleColumns.map((column) => (
					<KanbanColumnContainer
						key={column.id}
						column={column}
						getItemId={getItemId}
						disabled={disabled}
						columnClassName={columnClassName}
						columnBodyClassName={columnBodyClassName}
						renderColumnHeader={renderColumnHeader}
						renderColumnFooter={renderColumnFooter}
						renderItem={renderItem}
					/>
				))}
			</div>
			<PortalRoot ssrFallback={false}>
				<DragOverlay className={cn('pointer-events-none', dragOverlayClassName)}>
					{activeMatch
						? renderOverlay
							? renderOverlay(activeMatch.item, activeMatch.columnId)
							: renderItem(activeMatch.item, {
									id: activeId ?? '',
									columnId: activeMatch.columnId,
									index: activeMatch.index,
									isDragging: true,
									isOver: false,
									disabled,
									handleProps: {
										ref: () => {},
									},
									itemProps: {
										ref: () => {},
										style: {},
										'data-dragging': '1',
										'data-kanban-item-id': activeId ?? '',
									},
								})
						: null}
				</DragOverlay>
			</PortalRoot>
			<SortableStatusRegion message={statusMessage} />
		</DndContext>
	);
}
