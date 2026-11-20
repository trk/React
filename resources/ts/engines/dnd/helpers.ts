import {
	moveArrayItem,
	projectTreeReorder,
	type ProjectedTreeReorder,
	type TreeSortableNodeSpec,
} from '../../ui';

export {
	moveArrayItem,
	projectTreeReorder,
	type ProjectedTreeReorder,
	type TreeSortableNodeSpec,
};

export interface KanbanColumnSpec<TItem = unknown> {
	id: string;
	items: readonly TItem[];
}

export interface KanbanMoveEvent {
	itemId: string;
	fromColumnId: string;
	toColumnId: string;
	fromIndex: number;
	toIndex: number;
	sameColumn: boolean;
}

export interface KanbanMoveResolution<TItem = unknown> {
	columns: KanbanColumnSpec<TItem>[];
	event: KanbanMoveEvent;
}

/**
 * Computes the next immutable column state and normalized move event for a
 * within-column reorder or cross-column card transfer.
 */
export function resolveKanbanMove<TItem>(
	columns: readonly KanbanColumnSpec<TItem>[],
	getItemId: (item: TItem) => string,
	activeId: string,
	overId: string,
): KanbanMoveResolution<TItem> | null {
	if (activeId === overId) {
		return null;
	}

	let fromColumnIndex = -1;
	let fromIndex = -1;
	for (let colIdx = 0; colIdx < columns.length; colIdx += 1) {
		const column = columns[colIdx];
		if (!column) {
			continue;
		}
		const itemIdx = column.items.findIndex((item) => getItemId(item) === activeId);
		if (itemIdx !== -1) {
			fromColumnIndex = colIdx;
			fromIndex = itemIdx;
			break;
		}
	}

	if (fromColumnIndex === -1 || fromIndex === -1) {
		return null;
	}

	const sourceColumn = columns[fromColumnIndex];
	if (!sourceColumn) {
		return null;
	}
	const movedItem = sourceColumn.items[fromIndex];
	if (movedItem === undefined) {
		return null;
	}

	let toColumnIndex = -1;
	let toIndex = -1;
	let droppedOnColumnContainer = false;

	for (let colIdx = 0; colIdx < columns.length; colIdx += 1) {
		const column = columns[colIdx];
		if (!column) {
			continue;
		}
		const itemIdx = column.items.findIndex((item) => getItemId(item) === overId);
		if (itemIdx !== -1) {
			toColumnIndex = colIdx;
			toIndex = itemIdx;
			break;
		}
	}

	if (toColumnIndex === -1) {
		const containerIdx = columns.findIndex((column) => column.id === overId);
		if (containerIdx === -1) {
			return null;
		}
		const container = columns[containerIdx];
		if (!container) {
			return null;
		}
		toColumnIndex = containerIdx;
		toIndex = container.items.length;
		droppedOnColumnContainer = true;
	}

	const targetColumn = columns[toColumnIndex];
	if (!targetColumn) {
		return null;
	}

	if (fromColumnIndex === toColumnIndex) {
		const effectiveToIndex = droppedOnColumnContainer
			? Math.max(0, sourceColumn.items.length - 1)
			: toIndex;
		if (fromIndex === effectiveToIndex) {
			return null;
		}
		const reorderedItems = moveArrayItem(sourceColumn.items, fromIndex, effectiveToIndex);
		const nextColumns = columns.map((column, idx) =>
			idx === fromColumnIndex
				? { ...column, items: reorderedItems }
				: { ...column, items: [...column.items] },
		);
		return {
			columns: nextColumns,
			event: {
				itemId: activeId,
				fromColumnId: sourceColumn.id,
				toColumnId: targetColumn.id,
				fromIndex,
				toIndex: effectiveToIndex,
				sameColumn: true,
			},
		};
	}

	const nextSourceItems = sourceColumn.items.filter((_, idx) => idx !== fromIndex);
	const clampedTargetIndex = Math.max(0, Math.min(toIndex, targetColumn.items.length));
	const nextTargetItems = [...targetColumn.items];
	nextTargetItems.splice(clampedTargetIndex, 0, movedItem);

	const nextColumns = columns.map((column, idx) => {
		if (idx === fromColumnIndex) {
			return { ...column, items: nextSourceItems };
		}
		if (idx === toColumnIndex) {
			return { ...column, items: nextTargetItems };
		}
		return { ...column, items: [...column.items] };
	});

	return {
		columns: nextColumns,
		event: {
			itemId: activeId,
			fromColumnId: sourceColumn.id,
			toColumnId: targetColumn.id,
			fromIndex,
			toIndex: clampedTargetIndex,
			sameColumn: false,
		},
	};
}
