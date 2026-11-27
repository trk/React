import React, { createContext, useContext, useEffect, useState } from 'react';
import type {
	SchemaFieldAdornment,
	SchemaFieldDefinition,
	SchemaFieldProps,
} from '../types';
import type {
	RegisteredBlockFieldSpec,
	RegisteredBlockItemSpec,
	RegisteredFragmentSpec,
	SchemaValidationResult,
} from '../validation';

export type SchemaFieldComponentProps = SchemaFieldProps & {
	formValues?: Record<string, unknown>;
	conditionValues?: Record<string, unknown>;
	allErrors?: Record<string, string>;
	errorMessage?: string;
	isDynamicallyRequired?: boolean;
	isDynamicallyDisabled?: boolean;
	scopePrefix?: string;
	fieldsByName?: ReadonlyMap<string, SchemaFieldDefinition>;
	suppressInlineSettings?: boolean;
	inlinePortal?: boolean;
	adornment?: SchemaFieldAdornment;
	onNamedChange?: (targetName: string, value: unknown) => void;
	onSettingFieldChange?: (targetField: SchemaFieldDefinition, value: unknown) => void;
	onNamedSettingChange?: (ownerField: SchemaFieldDefinition, targetName: string, value: unknown) => void;
};

export interface SchemaFormContextValue {
	values: Record<string, unknown>;
	errors: Record<string, string>;
	isDirty: boolean;
	scopePrefix?: string;
	fieldsByName?: ReadonlyMap<string, SchemaFieldDefinition>;
	updateFieldValue: (
		name: string,
		value: unknown,
		fieldDef?: SchemaFieldDefinition,
		scopePrefix?: string
	) => Record<string, unknown> | void;
	setValuesBatch: (patch: Record<string, unknown>, markDirty?: boolean) => void;
	setFieldError: (name: string, message: string | null) => void;
	registerFragment: (spec: RegisteredFragmentSpec) => () => void;
	registerBlockField: (spec: RegisteredBlockFieldSpec) => () => void;
	blocksVersion?: number;
	getRegisteredBlocks?: (fieldKey: string) => ReadonlyArray<RegisteredBlockItemSpec>;
	notifyBlocksChanged?: (fieldKey: string) => void;
	validateAll: () => SchemaValidationResult;
	validateStep: (stepIndex: number) => SchemaValidationResult;
}

export const SchemaFormContext: React.Context<SchemaFormContextValue | null> =
	(typeof window !== 'undefined' &&
		((window as unknown as { ReactWorkspaceRuntime?: { Fields?: { SchemaFormContext?: unknown } } })
			.ReactWorkspaceRuntime?.Fields?.SchemaFormContext as
			| React.Context<SchemaFormContextValue | null>
			| undefined)) ||
	createContext<SchemaFormContextValue | null>(null);

export type BridgedSchemaFormElement = HTMLElement & {
	__rwSchemaFormContext?: SchemaFormContextValue;
	__rwSchemaFormListeners?: Set<(ctx: SchemaFormContextValue) => void>;
};

/**
 * Resolves the enclosing `SchemaFormContext` either from React context or from the
 * closest `[data-rw-schema-form]` DOM ancestor (bridging across island roots).
 */
export function useSchemaFormContext(
	hostRef?: React.RefObject<HTMLElement | null>
): SchemaFormContextValue | null {
	const reactCtx = useContext(SchemaFormContext);
	const [domCtx, setDomCtx] = useState<SchemaFormContextValue | null>(null);

	useEffect(() => {
		if (reactCtx || !hostRef?.current) {
			return;
		}
		const formEl = hostRef.current.parentElement?.closest<BridgedSchemaFormElement>('[data-rw-schema-form]');
		if (!formEl) {
			return;
		}
		if (formEl.__rwSchemaFormContext) {
			setDomCtx((prev) => (prev === formEl.__rwSchemaFormContext ? prev : formEl.__rwSchemaFormContext!));
		}
		if (!formEl.__rwSchemaFormListeners) {
			formEl.__rwSchemaFormListeners = new Set();
		}
		const listener = (nextCtx: SchemaFormContextValue) => {
			setDomCtx(nextCtx);
		};
		formEl.__rwSchemaFormListeners.add(listener);
		return () => {
			formEl.__rwSchemaFormListeners?.delete(listener);
		};
	}, [reactCtx, hostRef]);

	return reactCtx || domCtx;
}
