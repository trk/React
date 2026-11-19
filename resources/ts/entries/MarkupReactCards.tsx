import { DataCardsCanvas } from '../viewports/DataCardsCanvas';

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;

runtime?.registerViewport?.('cards', DataCardsCanvas);
runtime?.__provideViewportCanvas?.('cards', DataCardsCanvas, {
	DataCardsCanvas,
});

export { DataCardsCanvas };
export default DataCardsCanvas;
