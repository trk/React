/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { getReactWorkspaceRuntime } from '../runtime';
import {
	SchemaForm,
	SchemaField,
	SchemaFormContext,
	useSchemaFormContext,
	evaluateSafeMathFormula,
	evaluateShowIfCondition,
	resolveScopedFieldValue,
	countNestedErrors,
	validateFieldWithValibot,
	validateSchemaTree,
	valibot,
} from '../fields/SchemaForm';

const runtime = getReactWorkspaceRuntime();
const { registerPages, registerIslands } = runtime;

const Fields = {
	SchemaForm,
	SchemaField,
	SchemaFormContext,
	useSchemaFormContext,
	evaluateSafeMathFormula,
	evaluateShowIfCondition,
	resolveScopedFieldValue,
	countNestedErrors,
	validateFieldWithValibot,
	validateSchemaTree,
	valibot,
};

runtime.__provideFields(Fields);

registerPages({
	'ReactWorkspace/SchemaForm': SchemaForm,
	SchemaForm,
});

registerIslands({
	'ReactWorkspace/SchemaForm': SchemaForm,
	SchemaForm,
});
