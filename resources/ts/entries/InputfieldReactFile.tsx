import type React from 'react';
import { FileFieldControl } from '../fields/controls/FileField';

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;
type PageComponent = React.ComponentType<Record<string, unknown>>;

runtime?.__provideFieldControl?.('FileFieldControl', FileFieldControl);
runtime?.registerPages?.({
	InputfieldReactFile: FileFieldControl as unknown as PageComponent,
});
runtime?.registerIslands?.({
	InputfieldReactFile: FileFieldControl as unknown as PageComponent,
});

export { FileFieldControl };
export default FileFieldControl;
