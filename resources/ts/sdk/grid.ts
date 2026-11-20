import type {
	DataGridCellContext,
	DataGridColumn,
	DataGridColumnVisibilityState,
	DataGridExpandedState,
	DataGridHeaderContext,
	DataGridProps,
	DataGridRowSelectionState,
	DataGridSortingItem,
	DataGridSortingState,
	GridEngineModule,
} from '../engines/grid';
import { requireReactRuntime } from './optional';

export const Grid = requireReactRuntime().Grid;

export const { DataGrid } = Grid;

export function ensureGridLoaded(): Promise<void> {
	return requireReactRuntime().ensureGridLoaded();
}

export function getGridEngine(): GridEngineModule | null {
	return requireReactRuntime().Grid.getModule();
}

export function useGridEngine(): GridEngineModule | null {
	const runtime = requireReactRuntime();
	const { useEffect, useSyncExternalStore } = runtime.React;
	const engine = useSyncExternalStore(
		runtime.Grid.subscribe,
		runtime.Grid.getModule,
		runtime.Grid.getModule,
	);
	useEffect(() => {
		if (!runtime.Grid.isLoaded()) {
			void runtime.ensureGridLoaded();
		}
	}, [runtime]);
	return engine;
}

export type {
	DataGridCellContext,
	DataGridColumn,
	DataGridColumnVisibilityState,
	DataGridExpandedState,
	DataGridHeaderContext,
	DataGridProps,
	DataGridRowSelectionState,
	DataGridSortingItem,
	DataGridSortingState,
	GridEngineModule,
};
