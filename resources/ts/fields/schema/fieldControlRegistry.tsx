import React from 'react';
import {
	AsmSelectField,
	CalculationField,
	CheckboxesField,
	CheckboxField,
	DateRangeField,
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
	| 'RelationFieldControl'
	| 'ColorFieldControl'
	| 'TagsFieldControl'
	| 'ComboboxFieldControl'
	| 'PhoneFieldControl'
	| 'UnitNumberFieldControl'
	| 'SegmentedFieldControl'
	| 'SpacingFieldControl'
	| 'OtpFieldControl'
	| 'PasswordFieldControl'
	| 'MarkdownFieldControl'
	| 'ConditionBuilderFieldControl';

function resolveRuntimeFieldComponent(
	controlKey: RuntimeFieldControlKey
): React.ComponentType<Record<string, unknown>> | undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}
	return (
		window.ReactWorkspaceRuntime?.Fields as unknown as
			| Record<string, React.ComponentType<Record<string, unknown>> | undefined>
			| undefined
	)?.[controlKey];
}

export function RuntimeFieldControl({
	controlKey,
	skeletonClass,
	controlProps,
}: {
	controlKey: RuntimeFieldControlKey;
	skeletonClass: string;
	controlProps: Record<string, unknown>;
}): React.ReactElement {
	// Pin the resolved LazyWrapper/Component reference on mount so replacing `FieldsProxy[controlKey]` after async bundle load never swaps element identity mid-interaction.
	const [pinned, setPinned] = React.useState<{
		key: RuntimeFieldControlKey;
		Component: React.ComponentType<Record<string, unknown>> | undefined;
	}>(() => ({
		key: controlKey,
		Component: resolveRuntimeFieldComponent(controlKey),
	}));

	if (pinned.key !== controlKey || !pinned.Component) {
		const latest = resolveRuntimeFieldComponent(controlKey);
		if (pinned.key !== controlKey || latest !== pinned.Component) {
			setPinned({ key: controlKey, Component: latest });
		}
	}

	const Resolved = pinned.key === controlKey ? pinned.Component : resolveRuntimeFieldComponent(controlKey);
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
				ensureCalendarLoaded?: () => Promise<void>;
				ensureExtraFieldsLoaded?: () => Promise<void>;
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
			} else if (
				rawType === 'date' ||
				rawType === 'time' ||
				rawType === 'datetime' ||
				rawType === 'daterange' ||
				rawType === 'date_range' ||
				rawType === 'date-range' ||
				rawType === 'inputfielddatetime'
			) {
				needed.add('calendar');
			} else if (
				rawType === 'color' ||
				rawType === 'tags' ||
				rawType === 'texttags' ||
				rawType === 'text_tags' ||
				rawType === 'text-tags' ||
				rawType === 'inputfieldtexttags' ||
				rawType === 'combobox' ||
				rawType === 'searchable_select' ||
				rawType === 'searchable-select' ||
				rawType === 'phone' ||
				rawType === 'phone_number' ||
				rawType === 'phone-number' ||
				rawType === 'country' ||
				rawType === 'country_code' ||
				rawType === 'country-code' ||
				rawType === 'countries' ||
				rawType === 'timezone' ||
				rawType === 'time_zone' ||
				rawType === 'time-zone' ||
				rawType === 'tz' ||
				rawType === 'currency_code' ||
				rawType === 'currency-code' ||
				rawType === 'currencycode' ||
				rawType === 'iso_currency' ||
				rawType === 'iso-currency' ||
				rawType === 'unit_number' ||
				rawType === 'unit-number' ||
				rawType === 'unitnumber' ||
				rawType === 'currency' ||
				rawType === 'money' ||
				rawType === 'segmented' ||
				rawType === 'button_group' ||
				rawType === 'button-group' ||
				rawType === 'spacing' ||
				rawType === 'box_spacing' ||
				rawType === 'box-spacing' ||
				rawType === 'padding' ||
				rawType === 'margin' ||
				rawType === 'dimensions' ||
				rawType === 'otp' ||
				rawType === 'pin' ||
				rawType === 'verification_code' ||
				rawType === 'verification-code' ||
				rawType === 'totp' ||
				rawType === 'password' ||
				rawType === 'password_strength' ||
				rawType === 'password-strength' ||
				rawType === 'new_password' ||
				rawType === 'new-password' ||
				rawType === 'markdown' ||
				rawType === 'md' ||
				rawType === 'markdown_editor' ||
				rawType === 'markdown-editor' ||
				(rawType.includes('textarea') && String(f.editorMode || '').toLowerCase() === 'markdown') ||
				rawType === 'condition_builder' ||
				rawType === 'condition-builder' ||
				rawType === 'conditionbuilder'
			) {
				needed.add('extra');
			}
			visitFieldList(f.fields);
			visitFieldList(f.children);
			visitFieldList(f.tabs);
			visitFieldList(f.steps);
		}
	};

	const rootRec = schema as unknown as Record<string, unknown>;
	visitFieldList(schema.fields);
	visitFieldList(schema.belowTabsFields);
	visitFieldList(schema.tabs);
	visitFieldList(rootRec.steps);

	if (needed.has('keyvalue')) void rt.ensureKeyValueLoaded?.();
	if (needed.has('relation')) void rt.ensureRelationFieldLoaded?.();
	if (needed.has('link')) void rt.ensureLinkFieldLoaded?.();
	if (needed.has('icon')) void rt.ensureIconFieldLoaded?.();
	if (needed.has('image')) void rt.ensureImageFieldLoaded?.();
	if (needed.has('file')) void rt.ensureFileFieldLoaded?.();
	if (needed.has('tab')) void rt.ensureTabLoaded?.();
	if (needed.has('calendar')) void rt.ensureCalendarLoaded?.();
	if (needed.has('extra')) void rt.ensureExtraFieldsLoaded?.();
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
		case 'daterange':
			return <DateRangeField {...props} />;
		case 'color':
			return (
				<RuntimeFieldControl
					controlKey="ColorFieldControl"
					skeletonClass="h-9"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'tags':
			return (
				<RuntimeFieldControl
					controlKey="TagsFieldControl"
					skeletonClass="h-9"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'combobox':
			return (
				<RuntimeFieldControl
					controlKey="ComboboxFieldControl"
					skeletonClass="h-9"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'phone':
			return (
				<RuntimeFieldControl
					controlKey="PhoneFieldControl"
					skeletonClass="h-9"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'unit_number':
			return (
				<RuntimeFieldControl
					controlKey="UnitNumberFieldControl"
					skeletonClass="h-9"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'segmented':
			return (
				<RuntimeFieldControl
					controlKey="SegmentedFieldControl"
					skeletonClass="h-9"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'spacing':
			return (
				<RuntimeFieldControl
					controlKey="SpacingFieldControl"
					skeletonClass="h-24"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'otp':
			return (
				<RuntimeFieldControl
					controlKey="OtpFieldControl"
					skeletonClass="h-9"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'password':
			return (
				<RuntimeFieldControl
					controlKey="PasswordFieldControl"
					skeletonClass="h-24"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'markdown':
			return (
				<RuntimeFieldControl
					controlKey="MarkdownFieldControl"
					skeletonClass="h-32"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
		case 'condition_builder':
			return (
				<RuntimeFieldControl
					controlKey="ConditionBuilderFieldControl"
					skeletonClass="h-32"
					controlProps={props as unknown as Record<string, unknown>}
				/>
			);
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
		case 'range_slider':
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
