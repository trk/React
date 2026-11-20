import type React from 'react';
import type {
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

export type {
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
