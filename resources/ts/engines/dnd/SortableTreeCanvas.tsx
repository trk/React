import React, { useMemo, useState } from 'react';
import {
	closestCenter,
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragCancelEvent,
	type DragEndEvent,
	type DragMoveEvent,
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
import {
	projectTreeReorder,
	type ProjectedTreeReorder,
	type TreeSortableNodeSpec,
} from './helpers';

export interface SortableTreeItemRenderContext {
	id: string;
	index: number;
	depth: number;
	projectedDepth: number | null;
	isDragging: boolean;
	isOver: boolean;
	disabled: boolean;
	indentWidth: number;
	stepDepth: (delta: -1 | 1) => void;
	handleProps: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		ref: (el: HTMLButtonElement | null) => void;
	};
	itemProps: {
		ref: (el: HTMLElement | null) => void;
		style: React.CSSProperties;
		'data-dragging'?: string;
		'data-tree-id': string;
		'data-tree-depth': number;
	};
}

export interface SortableTreeCanvasProps<T extends TreeSortableNodeSpec> {
	items: readonly T[];
	getLabel?: (item: T, index: number) => string;
	indentWidth?: number;
	maxDepth?: number;
	disabled?: boolean;
	className?: string;
	dragOverlayClassName?: string;
	renderItem: (item: T, ctx: SortableTreeItemRenderContext) => React.ReactNode;
	renderOverlay?: (item: T) => React.ReactNode;
	onTreeReorder: (result: ProjectedTreeReorder<T>) => void;
	activationDistance?: number;
}

function computeTreeProjection<T extends TreeSortableNodeSpec>(
	items: readonly T[],
	activeId: string | null,
	overId: string | null,
	offsetLeft: number,
	indentWidth: number,
	maxDepth: number,
): ProjectedTreeReorder<T> | null {
	if (!activeId) {
		return null;
	}
	const activeIndex = items.findIndex((item) => item.id === activeId);
	if (activeIndex === -1) {
		return null;
	}
	const overIndex = overId ? items.findIndex((item) => item.id === overId) : activeIndex;
	const resolvedOverIndex = overIndex === -1 ? activeIndex : overIndex;
	const insertGapIndex =
		resolvedOverIndex > activeIndex ? resolvedOverIndex + 1 : resolvedOverIndex;
	const safeIndent = Math.max(12, indentWidth);
	const depthDelta = Math.round(offsetLeft / safeIndent);
	return projectTreeReorder(items, activeId, insertGapIndex, depthDelta, maxDepth);
}

interface TreeRowProps<T extends TreeSortableNodeSpec> {
	item: T;
	index: number;
	projectedDepth: number | null;
	disabled: boolean;
	indentWidth: number;
	stepDepth: (id: string, index: number, delta: -1 | 1) => void;
	renderItem: (item: T, ctx: SortableTreeItemRenderContext) => React.ReactNode;
}

function SortableTreeRow<T extends TreeSortableNodeSpec>({
	item,
	index,
	projectedDepth,
	disabled,
	indentWidth,
	stepDepth,
	renderItem,
}: TreeRowProps<T>): React.ReactNode {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
		isOver,
	} = useSortable({ id: item.id, disabled });

	const effectiveDepth = projectedDepth !== null ? projectedDepth : item.depth;
	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		paddingLeft: effectiveDepth * indentWidth,
	};

	const rawAttrs = attributes as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>;
	const rawListeners = listeners as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>;
	const upstreamOnKeyDown = rawListeners?.onKeyDown;

	const ctx: SortableTreeItemRenderContext = {
		id: item.id,
		index,
		depth: item.depth,
		projectedDepth,
		isDragging,
		isOver,
		disabled,
		indentWidth,
		stepDepth: (delta) => stepDepth(item.id, index, delta),
		handleProps: {
			ref: (el) => {
				setActivatorNodeRef(el);
			},
			...rawAttrs,
			...rawListeners,
			onKeyDown: (e) => {
				if (!disabled && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey) {
					if (rawAttrs?.['aria-pressed'] !== true) {
						e.preventDefault();
						stepDepth(item.id, index, e.key === 'ArrowRight' ? 1 : -1);
						return;
					}
				}
				upstreamOnKeyDown?.(e);
			},
		},
		itemProps: {
			ref: setNodeRef,
			style,
			'data-dragging': isDragging ? '1' : undefined,
			'data-tree-id': item.id,
			'data-tree-depth': effectiveDepth,
		},
	};

	return <>{renderItem(item, ctx)}</>;
}

/**
 * Flat-array hierarchical tree sortable container combining `@dnd-kit/sortable`
 * with `projectTreeReorder` depth projection and arrow-key indent/outdent controls.
 */
export function SortableTreeCanvas<T extends TreeSortableNodeSpec>({
	items,
	getLabel,
	indentWidth = 24,
	maxDepth = 5,
	disabled = false,
	className,
	dragOverlayClassName,
	renderItem,
	renderOverlay,
	onTreeReorder,
	activationDistance = 5,
}: SortableTreeCanvasProps<T>): React.ReactElement {
	const [activeId, setActiveId] = useState<string | null>(null);
	const [overId, setOverId] = useState<string | null>(null);
	const [offsetLeft, setOffsetLeft] = useState(0);
	const [statusMessage, setStatusMessage] = useState('');

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

	const itemIds = useMemo(() => items.map((item) => item.id), [items]);
	const projection = useMemo(
		() => computeTreeProjection(items, activeId, overId, offsetLeft, indentWidth, maxDepth),
		[items, activeId, overId, offsetLeft, indentWidth, maxDepth],
	);

	const activeIndex = activeId ? itemIds.indexOf(activeId) : -1;
	const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;

	const resetDragState = () => {
		setActiveId(null);
		setOverId(null);
		setOffsetLeft(0);
	};

	const stepDepth = (id: string, index: number, delta: -1 | 1) => {
		const projected = projectTreeReorder(items, id, index, delta, maxDepth);
		if (!projected || !projected.changed) {
			return;
		}
		const targetItem = items[index];
		const label = targetItem && getLabel ? getLabel(targetItem, index) : id;
		onTreeReorder(projected);
		setStatusMessage(
			t(
				'dnd.movedToLevel',
				{
					label,
					level: projected.newDepth + 1,
				},
				'Moved {label} to level {level}'
			),
		);
	};

	const handleDragStart = (event: DragStartEvent) => {
		const id = String(event.active.id);
		setActiveId(id);
		setOverId(id);
		setOffsetLeft(0);
		const idx = itemIds.indexOf(id);
		const item = idx >= 0 ? items[idx] : undefined;
		if (item) {
			const label = getLabel ? getLabel(item, idx) : id;
			setStatusMessage(t('dnd.pickedUp', { label }, 'Picked up {label}'));
		}
	};

	const handleDragMove = (event: DragMoveEvent) => {
		setOffsetLeft(event.delta.x);
	};

	const handleDragOver = (event: DragOverEvent) => {
		setOverId(event.over ? String(event.over.id) : null);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const finalActiveId = String(event.active.id);
		const finalOverId = event.over ? String(event.over.id) : null;
		const finalProjection = computeTreeProjection(
			items,
			finalActiveId,
			finalOverId,
			event.delta.x,
			indentWidth,
			maxDepth,
		);
		resetDragState();

		if (!finalOverId) {
			setStatusMessage(t('dnd.dragCancelled', 'Drag cancelled'));
			return;
		}
		if (!finalProjection || !finalProjection.changed) {
			return;
		}
		const idx = itemIds.indexOf(finalActiveId);
		const movedItem = idx >= 0 ? items[idx] : undefined;
		const label = movedItem && getLabel ? getLabel(movedItem, idx) : finalActiveId;
		onTreeReorder(finalProjection);
		setStatusMessage(
			t(
				'dnd.movedToPositionAndLevel',
				{
					label,
					position: finalProjection.newIndex + 1,
					level: finalProjection.newDepth + 1,
				},
				'Moved {label} to position {position}, level {level}'
			),
		);
	};

	const handleDragCancel = (_event: DragCancelEvent) => {
		resetDragState();
		setStatusMessage(t('dnd.dragCancelled', 'Drag cancelled'));
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragMove={handleDragMove}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<SortableContext items={itemIds} strategy={verticalListSortingStrategy} disabled={disabled}>
				<div className={cn('flex flex-col', className)} data-rw-dnd-tree="">
					{items.map((item, index) => (
						<SortableTreeRow
							key={item.id}
							item={item}
							index={index}
							projectedDepth={activeId === item.id && projection ? projection.newDepth : null}
							disabled={disabled}
							indentWidth={indentWidth}
							stepDepth={stepDepth}
							renderItem={renderItem}
						/>
					))}
				</div>
			</SortableContext>
			<PortalRoot ssrFallback={false}>
				<DragOverlay className={cn('pointer-events-none', dragOverlayClassName)}>
					{activeItem
						? renderOverlay
							? renderOverlay(activeItem)
							: activeIndex >= 0
								? renderItem(activeItem, {
										id: activeItem.id,
										index: activeIndex,
										depth: activeItem.depth,
										projectedDepth: projection ? projection.newDepth : activeItem.depth,
										isDragging: true,
										isOver: false,
										disabled,
										indentWidth,
										stepDepth: () => {},
										handleProps: {
											ref: () => {},
										},
										itemProps: {
											ref: () => {},
											style: {},
											'data-dragging': '1',
											'data-tree-id': activeItem.id,
											'data-tree-depth': projection ? projection.newDepth : activeItem.depth,
										},
									})
								: null
						: null}
				</DragOverlay>
			</PortalRoot>
			<SortableStatusRegion message={statusMessage} />
		</DndContext>
	);
}
