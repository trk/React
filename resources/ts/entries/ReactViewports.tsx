import type React from 'react';
import {
	DataViewport,
	DataTable,
	DataCards,
	buildViewportActionItems,
	registerViewport,
	getViewport,
} from '../viewports/DataViewport';

type PageComponent = React.ComponentType<Record<string, unknown>>;

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;

const viewportExports = {
	DataViewport,
	DataTable,
	DataCards,
	buildViewportActionItems,
	registerViewport,
	getViewport,
};

runtime?.__provideViewports?.(viewportExports as never);

runtime?.registerPages?.({
	'ReactWorkspace/Viewport': DataViewport as PageComponent,
	MarkupReactViewport: DataViewport as PageComponent,
	'ReactWorkspace/Table': DataTable as unknown as PageComponent,
	MarkupReactTable: DataTable as unknown as PageComponent,
	'ReactWorkspace/Cards': DataCards as unknown as PageComponent,
	MarkupReactCards: DataCards as unknown as PageComponent,
});

runtime?.registerIslands?.({
	'ReactWorkspace/Viewport': DataViewport as PageComponent,
	MarkupReactViewport: DataViewport as PageComponent,
	'ReactWorkspace/Table': DataTable as unknown as PageComponent,
	MarkupReactTable: DataTable as unknown as PageComponent,
	'ReactWorkspace/Cards': DataCards as unknown as PageComponent,
	MarkupReactCards: DataCards as unknown as PageComponent,
});

export {
	DataViewport,
	DataTable,
	DataCards,
	buildViewportActionItems,
	registerViewport,
	getViewport,
};
export default viewportExports;
