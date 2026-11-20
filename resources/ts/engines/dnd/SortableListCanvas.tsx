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
	type DragStartEvent,
} from '@dnd-kit/core';
import {
	horizontalListSortingStrategy,
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { t } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { PortalRoot, SortableStatusRegion } from '../../ui';
import { moveArrayItem } from './helpers';

export interface SortableListItemRenderContext {
	id: string;
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
		'data-sortable-id': string;
	};
}

export interface SortableListCanvasProps<T> {
	items: readonly T[];
	getId: (item: T) => string;
	getLabel?: (item: T, index: number) => string;
	axis?: 'vertical' | 'horizontal' | 'grid';
	disabled?: boolean;
	className?: string;
	dragOverlayClassName?: string;
	renderItem: (item: T, ctx: SortableListItemRenderContext) => React.ReactNode;
	renderOverlay?: (item: T) => React.ReactNode;
	onReorder: (
		nextItems: T[],
		meta: { movedId: string; fromIndex: number; toIndex: number },
	) => void;
	activationDistance?: number;
}

interface SortableRowProps<T> {
	item: T;
	id: string;
	index: number;
	disabled: boolean;
	renderItem: (item: T, ctx: SortableListItemRenderContext) => React.ReactNode;
}

function SortableListRow<T>({
	item,
	id,
	index,
	disabled,
	renderItem,
}: SortableRowProps<T>): React.ReactNode {
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

	const ctx: SortableListItemRenderContext = {
		id,
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
			'data-sortable-id': id,
		},
	};

	return <>{renderItem(item, ctx)}</>;
}

/**
 * Accessible pointer + keyboard sortable container backed by `@dnd-kit/sortable`
 * with workspace portal DragOverlay support.
 */
export function SortableListCanvas<T>({
	items,
	getId,
	getLabel,
	axis = 'vertical',
	disabled = false,
	className,
	dragOverlayClassName,
	renderItem,
	renderOverlay,
	onReorder,
	activationDistance = 5,
}: SortableListCanvasProps<T>): React.ReactElement {
	const [activeId, setActiveId] = useState<string | null>(null);
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

	const itemIds = useMemo(() => items.map((item) => getId(item)), [items, getId]);

	const strategy =
		axis === 'horizontal'
			? horizontalListSortingStrategy
			: axis === 'grid'
				? rectSortingStrategy
				: verticalListSortingStrategy;

	const activeIndex = activeId ? itemIds.indexOf(activeId) : -1;
	const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;

	const handleDragStart = (event: DragStartEvent) => {
		const id = String(event.active.id);
		setActiveId(id);
		const idx = itemIds.indexOf(id);
		const item = idx >= 0 ? items[idx] : undefined;
		if (item !== undefined) {
			const label = getLabel ? getLabel(item, idx) : id;
			setStatusMessage(t('dnd.pickedUp', { label }, 'Picked up {label}'));
		}
	};

	const handleDragEnd = (event: DragEndEvent) => {
		setActiveId(null);
		const { active, over } = event;
		if (!over) {
			setStatusMessage(t('dnd.dragCancelled', 'Drag cancelled'));
			return;
		}
		const fromId = String(active.id);
		const toId = String(over.id);
		if (fromId === toId) {
			return;
		}
		const fromIndex = itemIds.indexOf(fromId);
		const toIndex = itemIds.indexOf(toId);
		if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
			return;
		}
		const movedItem = items[fromIndex];
		const label = movedItem !== undefined && getLabel ? getLabel(movedItem, fromIndex) : fromId;
		const nextItems = moveArrayItem(items, fromIndex, toIndex);
		onReorder(nextItems, {
			movedId: fromId,
			fromIndex,
			toIndex,
		});
		setStatusMessage(
			t(
				'dnd.movedToPosition',
				{
					label,
					position: toIndex + 1,
					total: items.length,
				},
				'Moved {label} to position {position} of {total}'
			),
		);
	};

	const handleDragCancel = (_event: DragCancelEvent) => {
		setActiveId(null);
		setStatusMessage(t('dnd.dragCancelled', 'Drag cancelled'));
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<SortableContext items={itemIds} strategy={strategy} disabled={disabled}>
				<div className={cn(className)} data-rw-dnd-list="" data-axis={axis}>
					{items.map((item, index) => {
						const id = itemIds[index] ?? getId(item);
						return (
							<SortableListRow
								key={id}
								item={item}
								id={id}
								index={index}
								disabled={disabled}
								renderItem={renderItem}
							/>
						);
					})}
				</div>
			</SortableContext>
			<PortalRoot ssrFallback={false}>
				<DragOverlay className={cn('pointer-events-none', dragOverlayClassName)}>
					{activeItem !== undefined
						? renderOverlay
							? renderOverlay(activeItem)
							: activeIndex >= 0
								? renderItem(activeItem, {
										id: activeId ?? '',
										index: activeIndex,
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
											'data-sortable-id': activeId ?? '',
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
