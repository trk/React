import React from 'react';
import {
	AsmSelectField,
	CalculationField,
	CheckboxesField,
	CheckboxField,
	DatetimeField,
	HeadingField,
	MultiSelectField,
	RadiosField,
	RangeField,
	RatingField,
	RepeaterField,
	SelectField,
	SignatureField,
	SubmitField,
	TextareaField,
	TextField,
	TiptapField,
	ToggleField,
} from '../controls';
import type { ReactInputfieldProps, SchemaFormPayload } from '../types';

export type RuntimeFieldControlKey =
	| 'FileFieldControl'
	| 'IconFieldControl'
	| 'ImageFieldControl'
	| 'KeyValueFieldControl'
	| 'LinkFieldControl'
	| 'RelationFieldControl';

export function RuntimeFieldControl({
	controlKey,
	skeletonClass,
	controlProps,
}: {
	controlKey: RuntimeFieldControlKey;
	skeletonClass: string;
	controlProps: Record<string, unknown>;
}): React.ReactElement {
	const Resolved =
		typeof window !== 'undefined'
			? (
					window.ReactWorkspaceRuntime?.Fields as unknown as
						| Record<string, React.ComponentType<Record<string, unknown>> | undefined>
						| undefined
				)?.[controlKey]
			: undefined;
	if (Resolved) {
		return <Resolved {...controlProps} />;
	}
	return (
		<div
			className={`w-full rounded-md border border-border bg-muted/20 ${skeletonClass}`}
			data-rw-lazy-chunk={`SchemaForm.${controlKey}`}
		/>
	);
}

export function prefetchSchemaControls(schema: SchemaFormPayload): void {
	if (typeof window === 'undefined') {
		return;
	}
	const rt = window.ReactWorkspaceRuntime as
		| {
				ensureKeyValueLoaded?: () => Promise<void>;
				ensureIconFieldLoaded?: () => Promise<void>;
				ensureLinkFieldLoaded?: () => Promise<void>;
				ensureFileFieldLoaded?: () => Promise<void>;
				ensureImageFieldLoaded?: () => Promise<void>;
				ensureRelationFieldLoaded?: () => Promise<void>;
				ensureTabLoaded?: () => Promise<void>;
		  }
		| undefined;
	if (!rt) {
		return;
	}

	const needed = new Set<string>();
	const visitFieldList = (items: unknown): void => {
		if (!Array.isArray(items)) {
			return;
		}
		for (const item of items) {
			if (!item || typeof item !== 'object') {
				continue;
			}
			const f = item as Record<string, unknown>;
			const rawType = String(f.type || f.inputType || f.inputfieldClass || '').toLowerCase();
			const kind = String(f.kind || '').toLowerCase();
			if (kind === 'tabs' || rawType === 'tabs' || rawType === 'markupreacttab') {
				needed.add('tab');
			}
			if (kind === 'island' && f.island && typeof f.island === 'object') {
				const islandComp = String((f.island as Record<string, unknown>).component || '');
				if (islandComp === 'MarkupReactTab') needed.add('tab');
				if (islandComp === 'InputfieldReactKeyValue') needed.add('keyvalue');
				if (islandComp === 'InputfieldReactIcon' || islandComp === 'ReactWorkspace/Icon') needed.add('icon');
				if (islandComp === 'InputfieldReactLink') needed.add('link');
				if (islandComp === 'InputfieldReactFile') needed.add('file');
				if (islandComp === 'InputfieldReactImage') needed.add('image');
				if (islandComp.startsWith('InputfieldReactM2') || islandComp === 'InputfieldReactO2M') needed.add('relation');
			}
			if (rawType === 'keyvalue' || rawType === 'kv' || rawType === 'inputfieldreactkeyvalue') {
				needed.add('keyvalue');
			} else if (
				rawType === 'relation' ||
				rawType === 'm2o' ||
				rawType === 'm2m' ||
				rawType === 'o2m' ||
				rawType === 'm2a' ||
				rawType.includes('inputfieldreactm2') ||
				rawType.includes('inputfieldreacto2m')
			) {
				needed.add('relation');
			} else if (rawType === 'link' || Boolean(f.linkConfig)) {
				needed.add('link');
			} else if (
				rawType === 'icon' ||
				rawType === 'react_icon' ||
				rawType === 'inputfieldreacticon' ||
				Boolean(f.iconConfig)
			) {
				needed.add('icon');
			} else if (
				rawType === 'image' ||
				rawType === 'images' ||
				rawType === 'inputfieldimage' ||
				rawType === 'inputfieldreactimage' ||
				rawType === 'react_image' ||
				Boolean(f.isImage)
			) {
				needed.add('image');
			} else if (
				rawType === 'file' ||
				rawType === 'files' ||
				rawType === 'inputfieldfile' ||
				rawType === 'inputfieldreactfile' ||
				rawType === 'react_file'
			) {
				needed.add('file');
			}
			visitFieldList(f.fields);
			visitFieldList(f.children);
			visitFieldList(f.tabs);
			visitFieldList(f.steps);
		}
	};

	const rootRec = schema as unknown as Record<string, unknown>;
	visitFieldList(schema.fields);
	visitFieldList(schema.tabs);
	visitFieldList(rootRec.steps);

	if (needed.has('keyvalue')) void rt.ensureKeyValueLoaded?.();
	if (needed.has('relation')) void rt.ensureRelationFieldLoaded?.();
	if (needed.has('link')) void rt.ensureLinkFieldLoaded?.();
	if (needed.has('icon')) void rt.ensureIconFieldLoaded?.();
	if (needed.has('image')) void rt.ensureImageFieldLoaded?.();
	if (needed.has('file')) void rt.ensureFileFieldLoaded?.();
	if (needed.has('tab')) void rt.ensureTabLoaded?.();
}

export function renderFieldControl(props: ReactInputfieldProps): React.ReactElement {
	switch (props.controlType) {
		case 'text':
		case 'email':
		case 'url':
		case 'tel':
		case 'number':
			return <TextField {...props} />;
		case 'link':
			return (
				<RuntimeFieldControl
					controlKey="LinkFieldControl"
					skeletonClass="h-9"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'icon':
			return (
				<RuntimeFieldControl
					controlKey="IconFieldControl"
					skeletonClass="h-9"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'textarea':
			return <TextareaField {...props} />;
		case 'tiptap':
			return <TiptapField {...props} />;
		case 'datetime':
		case 'date':
		case 'time':
			return <DatetimeField {...props} />;
		case 'checkbox':
		case 'consent':
			return <CheckboxField {...props} />;
		case 'toggle':
			return <ToggleField {...props} />;
		case 'select':
			return <SelectField {...props} />;
		case 'radios':
			return <RadiosField {...props} />;
		case 'checkboxes':
			return <CheckboxesField {...props} />;
		case 'asmselect':
			return <AsmSelectField {...props} />;
		case 'multiselect':
			return <MultiSelectField {...props} />;
		case 'range':
		case 'colspan':
			return <RangeField {...props} />;
		case 'rating':
			return <RatingField {...props} />;
		case 'signature':
			return <SignatureField {...props} />;
		case 'calculation':
			return <CalculationField {...props} />;
		case 'repeater':
			return <RepeaterField {...props} />;
		case 'file':
			return (
				<RuntimeFieldControl
					controlKey="FileFieldControl"
					skeletonClass="h-24"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'image':
			return (
				<RuntimeFieldControl
					controlKey="ImageFieldControl"
					skeletonClass="h-24"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'heading':
			return <HeadingField {...props} />;
		case 'submit':
			return <SubmitField {...props} />;
		default:
			return <TextField {...props} />;
	}
}
