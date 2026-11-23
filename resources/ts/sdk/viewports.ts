import type {
	RenderCellOptions,
	ViewportBulkAction,
	ViewportCanvasProps,
	ViewportColumn,
	ViewportCreateAction,
	ViewportFilter,
	ViewportModeMeta,
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
	ViewportCanvasProps,
	ViewportColumn,
	ViewportCreateAction,
	ViewportFilter,
	ViewportModeMeta,
	ViewportRowAction,
	ViewportState,
	ViewportSummaryCard,
	ViewportThumbSpec,
	ViewportToolbarAction,
};
