/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { getReactWorkspaceRuntime } from '../runtime';
import {
	SchemaForm,
	SchemaField,
	FieldControlIsland,
	SchemaFormContext,
	useSchemaFormContext,
	evaluateSafeMathFormula,
	evaluateShowIfCondition,
	navigateTablistByKey,
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
	FieldControlIsland,
	SchemaFormContext,
	useSchemaFormContext,
	evaluateSafeMathFormula,
	evaluateShowIfCondition,
	navigateTablistByKey,
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
	'ReactWorkspace/FieldControl': FieldControlIsland,
	SchemaForm,
});
