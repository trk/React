import type React from 'react';
import { ImageFieldControl } from '../fields/controls/ImageField';

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;
type PageComponent = React.ComponentType<Record<string, unknown>>;

runtime?.__provideFieldControl?.('ImageFieldControl', ImageFieldControl);
runtime?.registerPages?.({
	InputfieldReactImage: ImageFieldControl as unknown as PageComponent,
});
runtime?.registerIslands?.({
	InputfieldReactImage: ImageFieldControl as unknown as PageComponent,
});

export { ImageFieldControl };
export default ImageFieldControl;
