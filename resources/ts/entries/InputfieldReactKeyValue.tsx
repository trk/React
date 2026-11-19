import type React from 'react';
import { KeyValueFieldControl } from '../fields/controls/KeyValueField';

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;
type PageComponent = React.ComponentType<Record<string, unknown>>;

runtime?.__provideFieldControl?.('KeyValueFieldControl', KeyValueFieldControl);
runtime?.registerPages?.({
	InputfieldReactKeyValue: KeyValueFieldControl as unknown as PageComponent,
});
runtime?.registerIslands?.({
	InputfieldReactKeyValue: KeyValueFieldControl as unknown as PageComponent,
});

export { KeyValueFieldControl };
export default KeyValueFieldControl;
