import type React from 'react';
import { LinkFieldControl } from '../fields/controls/LinkField';

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;
type PageComponent = React.ComponentType<Record<string, unknown>>;

runtime?.__provideFieldControl?.('LinkFieldControl', LinkFieldControl);
runtime?.registerPages?.({
	InputfieldReactLink: LinkFieldControl as unknown as PageComponent,
});
runtime?.registerIslands?.({
	InputfieldReactLink: LinkFieldControl as unknown as PageComponent,
});

export { LinkFieldControl };
export default LinkFieldControl;
