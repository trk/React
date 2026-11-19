import type React from 'react';
import { IconFieldControl } from '../fields/controls/IconField';

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;
type PageComponent = React.ComponentType<Record<string, unknown>>;

runtime?.__provideFieldControl?.('IconFieldControl', IconFieldControl);
runtime?.registerPages?.({
	InputfieldReactIcon: IconFieldControl as unknown as PageComponent,
	'ReactWorkspace/Icon': IconFieldControl as unknown as PageComponent,
});
runtime?.registerIslands?.({
	InputfieldReactIcon: IconFieldControl as unknown as PageComponent,
	'ReactWorkspace/Icon': IconFieldControl as unknown as PageComponent,
});

export { IconFieldControl };
export default IconFieldControl;
