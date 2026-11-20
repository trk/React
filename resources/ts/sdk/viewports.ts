import type {
	RenderCellOptions,
	ViewportBulkAction,
	ViewportCalendarState,
	ViewportCanvasProps,
	ViewportColumn,
	ViewportCreateAction,
	ViewportFilter,
	ViewportKanbanStage,
	ViewportRowAction,
	ViewportState,
	ViewportSummaryCard,
	ViewportToolbarAction,
} from '../viewports/DataViewport';
import { getViewport, registerViewport } from './core';
import { requireReactRuntime } from './optional';
import {
	buildViewportActionItems,
	type ViewportActionDescriptor,
	type ViewportBadgeSpec,
	type ViewportThumbSpec,
} from './ui';

export const Viewports = requireReactRuntime().Viewports;

export const {
	DataViewport,
	DataTable,
	DataCards,
	DataTableCanvas,
	DataCardsCanvas,
} = Viewports;

export {
	buildViewportActionItems,
	getViewport,
	registerViewport,
};

export type DataViewportProps = ViewportState | Record<string, unknown>;

export type {
	RenderCellOptions,
	ViewportActionDescriptor,
	ViewportBadgeSpec,
	ViewportBulkAction,
	ViewportCalendarState,
	ViewportCanvasProps,
	ViewportColumn,
	ViewportCreateAction,
	ViewportFilter,
	ViewportKanbanStage,
	ViewportRowAction,
	ViewportState,
	ViewportSummaryCard,
	ViewportThumbSpec,
	ViewportToolbarAction,
};
