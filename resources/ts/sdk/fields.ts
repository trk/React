import type React from 'react';
import type {
	ConditionBuilderFieldProps,
	ConditionBuilderValue,
	ConditionCustomOperatorFn,
	ConditionFieldOption,
	ConditionFieldSpec,
	ConditionFieldType,
	ConditionGroupItem,
	ConditionMatchMode,
	ConditionRuleItem,
	DynamicBlockOptionsSource,
	EvaluateConditionOptions,
	FormatConditionSummaryLabels,
	IconFieldConfig,
	InputfieldLanguageItem,
	InputfieldMediaItem,
	InputfieldOptionItem,
	LinkFieldConfig,
	LinkFieldValue,
	ReactInputfieldProps,
	RelationItemData,
	RelationResourceDescriptor,
	SchemaConditionSpec,
	SchemaFieldAdornment,
	SchemaFieldDefinition,
	SchemaFieldProps,
	SchemaFormContextValue,
	SchemaFormPayload,
	SchemaFormProps,
	SchemaTabPaneDefinition,
	SchemaValidationResult,
} from '../fields/SchemaForm';
import {
	DEFAULT_OPERATORS_BY_TYPE,
	UNARY_OPERATORS,
	createEmptyConditionGroup,
	createEmptyConditionRule,
	evaluateConditionTree,
	formatConditionSummary,
	getOperatorsForConditionFieldType,
	normalizeConditionBuilderValue,
	resolveSourceFieldSpecs,
	resolveTargetFieldSpecs,
	serializeConditionToExpression,
} from '../fields/conditionEngine';
import { requireReactRuntime } from './optional';

export const Fields = requireReactRuntime().Fields;

export const {
	SchemaForm,
	SchemaField,
	SchemaFormContext,
	useSchemaFormContext,
	FileFieldControl,
	IconFieldControl,
	ImageFieldControl,
	KeyValueFieldControl,
	LinkFieldControl,
	RelationFieldControl,
	ColorFieldControl,
	TagsFieldControl,
	ComboboxFieldControl,
	PhoneFieldControl,
	UnitNumberFieldControl,
	SegmentedFieldControl,
	SpacingFieldControl,
	OtpFieldControl,
	PasswordFieldControl,
	MarkdownFieldControl,
	ConditionBuilderFieldControl,
	ConditionBuilder,
	ExtraFieldControlIsland,
	FieldControlIsland,
	SchemaTabContainer,
} = Fields;

export function evaluateShowIfCondition(
	expression: SchemaConditionSpec | undefined,
	values: Record<string, unknown>,
	scopePrefix?: string
): boolean {
	const fn = requireReactRuntime().Fields.evaluateShowIfCondition;
	return typeof fn === 'function' ? fn(expression, values, scopePrefix) : true;
}

export function navigateTablistByKey(
	event: React.KeyboardEvent<HTMLElement>,
	orientation: 'horizontal' | 'vertical' = 'horizontal'
): void {
	const fn = requireReactRuntime().Fields.navigateTablistByKey;
	if (typeof fn === 'function') {
		fn(event, orientation);
	}
}

export function resolveScopedFieldValue(
	values: Record<string, unknown>,
	rawKey: string,
	scopePrefix?: string
): unknown {
	const fn = requireReactRuntime().Fields.resolveScopedFieldValue;
	return typeof fn === 'function' ? fn(values, rawKey, scopePrefix) : values[rawKey];
}

export function evaluateSafeMathFormula(
	formula: string,
	values: Record<string, unknown>,
	precision = 2,
	scopePrefix?: string
): string {
	const fn = requireReactRuntime().Fields.evaluateSafeMathFormula;
	return typeof fn === 'function' ? fn(formula, values, precision, scopePrefix) : '';
}

export function countNestedErrors(
	fields: SchemaFieldDefinition[],
	errors: Record<string, string>
): number {
	const fn = requireReactRuntime().Fields.countNestedErrors;
	return typeof fn === 'function' ? fn(fields, errors) : 0;
}

export function validateFieldWithValibot(
	field: SchemaFieldDefinition,
	rawVal: unknown,
	allValues: Record<string, unknown>,
	scopePrefix?: string
): string | null {
	const fn = requireReactRuntime().Fields.validateFieldWithValibot;
	return typeof fn === 'function' ? fn(field, rawVal, allValues, scopePrefix) : null;
}

export function validateSchemaTree(
	schema: SchemaFormPayload,
	values: Record<string, unknown>,
	options?: Parameters<(typeof Fields)['validateSchemaTree']>[2]
): SchemaValidationResult {
	const fn = requireReactRuntime().Fields.validateSchemaTree;
	return typeof fn === 'function'
		? fn(schema, values, options)
		: { valid: true, errors: {}, failedTabIds: [], failedBlockIds: [], firstErrorField: null };
}

export function ensureFieldsLoaded(): Promise<void> {
	return requireReactRuntime().ensureFieldsLoaded();
}

export {
	DEFAULT_OPERATORS_BY_TYPE,
	UNARY_OPERATORS,
	createEmptyConditionGroup,
	createEmptyConditionRule,
	evaluateConditionTree,
	formatConditionSummary,
	getOperatorsForConditionFieldType,
	normalizeConditionBuilderValue,
	resolveSourceFieldSpecs,
	resolveTargetFieldSpecs,
	serializeConditionToExpression,
};

export type {
	ConditionBuilderFieldProps,
	ConditionBuilderValue,
	ConditionCustomOperatorFn,
	ConditionFieldOption,
	ConditionFieldSpec,
	ConditionFieldType,
	ConditionGroupItem,
	ConditionMatchMode,
	ConditionRuleItem,
	DynamicBlockOptionsSource,
	EvaluateConditionOptions,
	FormatConditionSummaryLabels,
	IconFieldConfig,
	InputfieldLanguageItem,
	InputfieldMediaItem,
	InputfieldOptionItem,
	LinkFieldConfig,
	LinkFieldValue,
	ReactInputfieldProps,
	RelationItemData,
	RelationResourceDescriptor,
	SchemaConditionSpec,
	SchemaFieldAdornment,
	SchemaFieldDefinition,
	SchemaFieldProps,
	SchemaFormContextValue,
	SchemaFormPayload,
	SchemaFormProps,
	SchemaTabPaneDefinition,
	SchemaValidationResult,
};
