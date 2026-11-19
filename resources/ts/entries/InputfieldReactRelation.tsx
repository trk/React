import type React from 'react';
import { RelationFieldControl } from '../fields/controls/RelationField';

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;
type PageComponent = React.ComponentType<Record<string, unknown>>;

runtime?.__provideFieldControl?.('RelationFieldControl', RelationFieldControl);
runtime?.registerPages?.({
	InputfieldReactM2O: RelationFieldControl as unknown as PageComponent,
	InputfieldReactM2M: RelationFieldControl as unknown as PageComponent,
	InputfieldReactO2M: RelationFieldControl as unknown as PageComponent,
	InputfieldReactM2A: RelationFieldControl as unknown as PageComponent,
});
runtime?.registerIslands?.({
	InputfieldReactM2O: RelationFieldControl as unknown as PageComponent,
	InputfieldReactM2M: RelationFieldControl as unknown as PageComponent,
	InputfieldReactO2M: RelationFieldControl as unknown as PageComponent,
	InputfieldReactM2A: RelationFieldControl as unknown as PageComponent,
});

export { RelationFieldControl };
export default RelationFieldControl;
