import type React from 'react';
import { ConditionBuilderFieldControl } from '../fields/controls/ConditionBuilderField';

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;
type PageComponent = React.ComponentType<Record<string, unknown>>;

runtime?.__provideFieldControl?.('ConditionBuilderFieldControl', ConditionBuilderFieldControl);
runtime?.registerPages?.({
	InputfieldReactCondition: ConditionBuilderFieldControl as unknown as PageComponent,
});
runtime?.registerIslands?.({
	InputfieldReactCondition: ConditionBuilderFieldControl as unknown as PageComponent,
});

export { ConditionBuilderFieldControl };
export default ConditionBuilderFieldControl;
