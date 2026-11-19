import { DataTableCanvas } from '../viewports/DataTableCanvas';

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;

runtime?.registerViewport?.('table', DataTableCanvas);
runtime?.__provideViewportCanvas?.('table', DataTableCanvas, {
	DataTableCanvas,
});

export { DataTableCanvas };
export default DataTableCanvas;
