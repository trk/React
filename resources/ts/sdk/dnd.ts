import type {
	DndEngineModule,
	DragCancelEvent,
	DragEndEvent,
	DragMoveEvent,
	DragOverEvent,
	DragStartEvent,
	ProjectedTreeReorder,
	SortableListCanvasProps,
	SortableListItemRenderContext,
	SortableTreeCanvasProps,
	SortableTreeItemRenderContext,
	TreeSortableNodeSpec,
	UniqueIdentifier,
} from '../engines/dnd';
import { requireReactRuntime } from './optional';

export const Dnd = requireReactRuntime().Dnd;

export const { SortableListCanvas, SortableTreeCanvas } = Dnd;

export function ensureDndLoaded(): Promise<void> {
	return requireReactRuntime().ensureDndLoaded();
}

export function getDndEngine(): DndEngineModule | null {
	return requireReactRuntime().Dnd.getModule();
}

export function useDndEngine(): DndEngineModule | null {
	const runtime = requireReactRuntime();
	const { useEffect, useSyncExternalStore } = runtime.React;
	const engine = useSyncExternalStore(
		runtime.Dnd.subscribe,
		runtime.Dnd.getModule,
		runtime.Dnd.getModule,
	);
	useEffect(() => {
		if (!runtime.Dnd.isLoaded()) {
			void runtime.ensureDndLoaded();
		}
	}, [runtime]);
	return engine;
}

export type {
	DndEngineModule,
	DragCancelEvent,
	DragEndEvent,
	DragMoveEvent,
	DragOverEvent,
	DragStartEvent,
	ProjectedTreeReorder,
	SortableListCanvasProps,
	SortableListItemRenderContext,
	SortableTreeCanvasProps,
	SortableTreeItemRenderContext,
	TreeSortableNodeSpec,
	UniqueIdentifier,
};
