import React, { useContext, useMemo, useRef, useState } from 'react';
import { cn, DynamicIcon } from '../../lib/utils';
import { HeadingField, SubmitField } from '../controls';
import {
	applyLinkSettingPatches,
	buildLinkInlineSettingFields,
	FieldNotes,
	FieldStatusRow,
	normalizeOptions,
	readInitialSyncedLanguageId,
} from '../shared';
import type {
	InputfieldLanguageItem,
	InputfieldSubmitDropdownItem,
	ReactInputfieldProps,
	SchemaFieldDefinition,
} from '../types';
import { renderFieldControl, RuntimeFieldControl } from './fieldControlRegistry';
import { InlineFieldSettingsPopover } from './InlineFieldSettingsPopover';
import { SchemaFormContext, type SchemaFieldComponentProps } from './SchemaFormContext';

export const SchemaField: React.FC<SchemaFieldComponentProps> = ({
	field,
	value,
	onChange,
	onNamedChange,
	onSettingFieldChange,
	onNamedSettingChange,
	formValues,
	conditionValues,
	allErrors,
	errorMessage,
	isDynamicallyRequired,
	isDynamicallyDisabled,
	scopePrefix,
	fieldsByName,
	suppressInlineSettings,
	inlinePortal,
	adornment,
}) => {
	const schemaCtx = useContext(SchemaFormContext);
	const effectiveFieldsByName = fieldsByName ?? schemaCtx?.fieldsByName;
	const rawType = (field.type || field.inputfieldClass || 'text').toLowerCase();
	const options = useMemo(() => normalizeOptions(field.options), [field.options]);
	const fieldId = field.id || `Inputfield_${field.name}`;
	const isRequired = isDynamicallyRequired !== undefined ? Boolean(isDynamicallyRequired) : Boolean(field.required);
	const isReadOnly = Boolean(field.readOnly ?? field.readonly);
	const isDisabled = Boolean(field.disabled || isDynamicallyDisabled);
	const resolvedError =
		errorMessage || field.error || (field.errors && field.errors.length > 0 ? field.errors.join(' ') : '');

	const rawLanguages = field.i18n?.languages ?? field.languages;
	const hasLanguages = Boolean(
		(field.useLanguages || field.i18n?.enabled) && Array.isArray(rawLanguages) && rawLanguages.length > 0
	);
	const rawLanguagesRef = useRef(rawLanguages);
	rawLanguagesRef.current = rawLanguages;
	const langSignature =
		hasLanguages && Array.isArray(rawLanguages)
			? rawLanguages
					.map((lang) => {
						const langInputName =
							lang.inputName || (lang.isDefault ? field.name : `${field.name}__${lang.id}`);
						const liveLangVal = formValues
							? langInputName in formValues
								? formValues[langInputName]
								: lang.isDefault && field.name in formValues
									? formValues[field.name]
									: lang.value
							: lang.value;
						return `${lang.id}:${langInputName}:${lang.editable !== false ? '1' : '0'}:${String(liveLangVal ?? '')}`;
					})
					.join('\u0000')
			: '';
	const languages = useMemo<InputfieldLanguageItem[] | undefined>(() => {
		const currentRaw = rawLanguagesRef.current;
		if (!hasLanguages || !Array.isArray(currentRaw)) {
			return undefined;
		}
		return currentRaw.map((lang) => {
			const langInputName =
				lang.inputName || (lang.isDefault ? field.name : `${field.name}__${lang.id}`);
			const liveLangVal = formValues
				? langInputName in formValues
					? formValues[langInputName]
					: lang.isDefault && field.name in formValues
						? formValues[field.name]
						: lang.value
				: lang.value;
			return {
				id: lang.id,
				name: lang.name,
				title: lang.title,
				isDefault: lang.isDefault,
				editable: lang.editable !== false,
				inputName: langInputName,
				inputId: lang.inputId || (lang.isDefault ? fieldId : `${fieldId}__${lang.id}`),
				value: String(liveLangVal ?? ''),
			};
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hasLanguages, langSignature, field.name, fieldId]);

	const [activeLangId, setActiveLangId] = useState<number>(() =>
		readInitialSyncedLanguageId(languages)
	);

	const descriptionId = field.description ? `${fieldId}__desc` : undefined;
	const notesId = field.notes ? `${fieldId}__notes` : undefined;
	const errorId = resolvedError ? `${fieldId}__err` : undefined;
	const describedBy = [descriptionId, errorId, notesId].filter(Boolean).join(' ') || undefined;

	if (rawType === 'heading') {
		return (
			<HeadingField
				controlType="heading"
				id={fieldId}
				name={field.name}
				label={field.label}
				description={field.description}
			/>
		);
	}

	if (rawType === 'submit') {
		const dropdownItems: InputfieldSubmitDropdownItem[] = (field.actions || []).map((a) => ({
			type: a.type ?? 'value',
			value: a.value,
			label: a.label,
			icon: a.icon,
		}));
		return (
			<div className="pt-1" data-field-name={field.name}>
				<SubmitField
					controlType="submit"
					id={fieldId}
					name={field.name}
					value={field.label || String(value ?? 'Submit')}
					disabled={isDisabled}
					submit={{
						type: 'submit',
						value: field.label || 'Submit',
						label: field.label || 'Submit',
						icon: field.icon,
						danger: field.danger,
						header: field.header,
						dropdownInputName: '_action_value',
						dropdownSubmit: true,
						dropdownRequired: false,
						dropdownItems,
					}}
				/>
			</div>
		);
	}

	const currentVal = value !== undefined ? value : (field.values ?? field.value ?? field.defaultValue ?? '');
	const linkInlineMeta =
		!suppressInlineSettings && (rawType === 'link' || Boolean(field.linkConfig))
			? buildLinkInlineSettingFields(field.linkConfig ?? undefined, currentVal, isDisabled)
			: null;

	const hasInlineSettings =
		!suppressInlineSettings &&
		((Array.isArray(field.inlineSettings) && field.inlineSettings.length > 0) ||
			(linkInlineMeta !== null && linkInlineMeta.fields.length > 0));

	const inlineSettingsNode = hasInlineSettings ? (
		<InlineFieldSettingsPopover
			ownerLabel={field.label || field.name || 'Field'}
			settingNames={field.inlineSettings || []}
			fieldsByName={effectiveFieldsByName}
			formValues={formValues ?? schemaCtx?.values}
			conditionValues={conditionValues}
			allErrors={allErrors ?? schemaCtx?.errors}
			scopePrefix={scopePrefix ?? schemaCtx?.scopePrefix}
			disabled={isDisabled}
			extraFields={linkInlineMeta?.fields}
			extraValues={linkInlineMeta?.values}
			FieldRenderer={SchemaField}
			onUpdateSetting={(targetField, nextVal) => {
				if (onSettingFieldChange) {
					onSettingFieldChange(targetField, nextVal);
				} else if (schemaCtx?.updateFieldValue) {
					schemaCtx.updateFieldValue(targetField.name, nextVal, targetField, scopePrefix ?? schemaCtx.scopePrefix);
				} else if (onNamedChange) {
					onNamedChange(targetField.name, nextVal);
				}
			}}
			onNamedSettingChange={(ownerField, targetName, nextVal) => {
				if (onNamedSettingChange) {
					onNamedSettingChange(ownerField, targetName, nextVal);
				} else if (schemaCtx?.updateFieldValue) {
					schemaCtx.updateFieldValue(targetName || ownerField.name, nextVal, ownerField, scopePrefix ?? schemaCtx.scopePrefix);
				} else if (onNamedChange) {
					onNamedChange(targetName || ownerField.name, nextVal);
				}
			}}
			onUpdateExtraFields={
				linkInlineMeta
					? (patches) => {
							onChange(applyLinkSettingPatches(linkInlineMeta.normLink, patches, linkInlineMeta.flags));
						}
					: undefined
			}
		/>
	) : null;

	const hasBoundOverlay = Boolean(adornment?.boundOverlay);
	const effectiveRequired = hasBoundOverlay ? false : isRequired;
	const headerRightNode =
		adornment?.labelAction || inlineSettingsNode ? (
			<div className="flex items-center gap-1.5">
				{adornment?.labelAction}
				{inlineSettingsNode}
			</div>
		) : null;

	if (rawType.includes('keyvalue') || rawType === 'key-value' || rawType === 'key_value') {
		return (
			<div
				className="space-y-1.5"
				data-field-name={field.name}
				data-field-error={resolvedError ? '1' : undefined}
			>
				{field.label || headerRightNode ? (
					<div
						data-rw-field-slot="label"
						className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
					>
						{field.label ? (
							<label htmlFor={fieldId} className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
								{field.icon ? <DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" /> : null}
								<span>{field.label}</span>
								{effectiveRequired ? <span className="text-destructive">*</span> : null}
							</label>
						) : <span />}
						{headerRightNode}
					</div>
				) : null}
				{field.description ? (
					<p id={descriptionId} data-rw-field-slot="description" className="text-xs text-muted-foreground leading-relaxed">
						{field.description}
					</p>
				) : null}
				{hasBoundOverlay ? <div data-rw-field-slot="bound-overlay">{adornment?.boundOverlay}</div> : null}
				<div
					data-rw-field-slot="input"
					hidden={hasBoundOverlay || undefined}
					aria-hidden={hasBoundOverlay ? 'true' : undefined}
					className={hasBoundOverlay ? 'hidden' : undefined}
				>
					<RuntimeFieldControl
						controlKey="KeyValueFieldControl"
						skeletonClass="h-24"
						controlProps={{
							id: fieldId,
							name: field.name,
							scopePrefix: scopePrefix ?? schemaCtx?.scopePrefix,
							value: value !== undefined ? value : (field.value ?? field.defaultValue),
							rows: field.kvRows ?? (Array.isArray(field.rows) ? field.rows : undefined),
							onChange,
							keyLabel: field.keyLabel,
							valueLabel: field.valueLabel,
							keyPlaceholder: field.keyPlaceholder,
							valuePlaceholder: field.valuePlaceholder,
							addLabel: field.addLabel,
							removeLabel: field.removeLabel,
							minItems: field.minItems,
							maxItems: field.maxItems,
							keyPattern: field.keyPattern,
							keyPatternMessage: field.keyPatternMessage,
							allowEmptyValues: field.allowEmptyValues,
							required: effectiveRequired,
							readOnly: isReadOnly,
							disabled: isDisabled || isReadOnly,
							error: resolvedError,
						}}
					/>
				</div>
				<SchemaFieldFooter notes={field.notes} notesId={notesId} error={resolvedError} errorId={errorId} />
			</div>
		);
	}

	if (
		rawType === 'relation' ||
		rawType === 'm2o' ||
		rawType === 'm2m' ||
		rawType === 'o2m' ||
		rawType === 'm2a' ||
		rawType.includes('inputfieldreactm2') ||
		rawType.includes('inputfieldreacto2m')
	) {
		return (
			<div
				className="space-y-1.5"
				data-field-name={field.name}
				data-field-error={resolvedError ? '1' : undefined}
			>
				{field.label || headerRightNode ? (
					<div
						data-rw-field-slot="label"
						className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
					>
						{field.label ? (
							<label htmlFor={fieldId} className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
								{field.icon ? <DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" /> : null}
								<span>{field.label}</span>
								{effectiveRequired ? <span className="text-destructive">*</span> : null}
							</label>
						) : <span />}
						{headerRightNode}
					</div>
				) : null}
				{field.description ? (
					<p id={descriptionId} data-rw-field-slot="description" className="text-xs text-muted-foreground leading-relaxed">
						{field.description}
					</p>
				) : null}
				{hasBoundOverlay ? <div data-rw-field-slot="bound-overlay">{adornment?.boundOverlay}</div> : null}
				<div
					hidden={hasBoundOverlay || undefined}
					aria-hidden={hasBoundOverlay ? 'true' : undefined}
					className={hasBoundOverlay ? 'hidden' : undefined}
				>
					<RuntimeFieldControl
						controlKey="RelationFieldControl"
						skeletonClass="h-9"
						controlProps={{
							...field,
							id: fieldId,
							name: field.name,
							value: value !== undefined ? value : (field.value ?? field.defaultValue),
							readOnly: isReadOnly,
							disabled: isDisabled || isReadOnly,
							required: effectiveRequired,
							error: resolvedError,
							errorId,
							formValues,
							scopePrefix,
							onChange,
						}}
					/>
				</div>
				<FieldNotes notes={field.notes} id={notesId} />
			</div>
		);
	}

	const mappedControlType = (): ReactInputfieldProps['controlType'] => {
		if (rawType === 'link' || field.linkConfig) {
			return 'link';
		}
		if (
			rawType === 'icon' ||
			rawType === 'react_icon' ||
			rawType === 'inputfieldreacticon' ||
			field.iconConfig
		) {
			return 'icon';
		}
		if (
			rawType === 'colspan' ||
			rawType === 'col_span' ||
			rawType === 'col-span' ||
			field.inputType === 'colspan'
		) {
			return 'colspan';
		}
		if (rawType === 'range' || rawType === 'slider' || field.inputType === 'range') {
			return 'range';
		}
		if (rawType === 'rating') return 'rating';
		if (rawType === 'signature') return 'signature';
		if (rawType === 'calculation') return 'calculation';
		if (rawType === 'repeater') return 'repeater';
		if (
			rawType === 'image' ||
			rawType === 'images' ||
			rawType === 'inputfieldimage' ||
			rawType === 'inputfieldreactimage' ||
			rawType === 'react_image' ||
			field.isImage
		) {
			return 'image';
		}
		if (
			rawType === 'file' ||
			rawType === 'files' ||
			rawType === 'inputfieldfile' ||
			rawType === 'inputfieldreactfile' ||
			rawType === 'react_file'
		) {
			return 'file';
		}
		if (rawType === 'radios' || rawType === 'radio') return 'radios';
		if (rawType === 'checkboxes') return 'checkboxes';
		if (rawType === 'asmselect') return 'asmselect';
		if (rawType === 'multiselect' || rawType === 'selectmultiple') return 'multiselect';
		if (rawType === 'toggle') return 'toggle';
		if (
			rawType === 'checkbox' ||
			rawType === 'consent' ||
			rawType === 'switch' ||
			rawType === 'boolean' ||
			rawType === 'bool'
		) {
			return 'checkbox';
		}
		if (rawType.includes('select') || (options.length > 0 && !rawType.includes('text'))) {
			return 'select';
		}
		if (
			rawType === 'tiptap' ||
			rawType === 'tiptap_language' ||
			rawType === 'tiptap-language' ||
			rawType === 'inputfieldtiptap' ||
			rawType === 'richtext' ||
			rawType === 'richtext_language' ||
			rawType === 'richtext-language'
		) {
			return 'tiptap';
		}
		if (
			rawType.includes('textarea') ||
			rawType.includes('markdown') ||
			rawType.includes('code') ||
			rawType.includes('json')
		) {
			return 'textarea';
		}
		if (rawType === 'datetime' || rawType === 'date' || rawType === 'time') {
			return 'datetime';
		}
		if (rawType === 'number' || rawType === 'integer' || rawType === 'float' || rawType === 'decimal') {
			return 'number';
		}
		if (rawType === 'email') return 'email';
		if (rawType === 'url') return 'url';
		if (rawType === 'tel') return 'tel';
		return 'text';
	};

	const controlType = mappedControlType();
	const controlRendersOwnStatusRow =
		controlType === 'text' ||
		controlType === 'email' ||
		controlType === 'url' ||
		controlType === 'tel' ||
		controlType === 'number' ||
		controlType === 'textarea' ||
		controlType === 'asmselect' ||
		controlType === 'link' ||
		controlType === 'file' ||
		controlType === 'image';

	const connection = field.connection;
	const resolvedSlugFrom =
		connection?.type === 'slug' ? connection.sourceField : field.slugFrom || undefined;
	const resolvedSlugSeparator =
		connection?.type === 'slug' ? connection.separator : field.slugSeparator;
	const resolvedSlugMaxLength =
		connection?.type === 'slug' ? connection.maxLength : field.maxLength;
	const resolvedSlugLocked =
		connection?.type === 'slug' ? connection.lockWhenPopulated : field.slugLocked;
	const resolvedFormula =
		connection?.type === 'calculation' ? connection.formula : field.formula;
	const resolvedPrecision =
		connection?.type === 'calculation' ? connection.precision : field.precision;

	const isChecked =
		controlType === 'checkbox'
			? Boolean(
					value !== undefined
						? value && value !== '0' && value !== 'false'
						: field.checked ?? (field.value && field.value !== '0')
				)
			: undefined;

	const activeLangInputId =
		languages && languages.length > 1
			? languages.find((l) => l.id === activeLangId)?.inputId || fieldId
			: fieldId;

	return (
		<div
			className="space-y-1.5"
			data-field-name={field.name}
			data-field-error={resolvedError ? '1' : undefined}
		>
			{field.label ? (
				headerRightNode ? (
					<div
						data-rw-field-slot="label"
						className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
					>
						<label
							htmlFor={activeLangInputId}
							className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground"
						>
							{field.icon ? (
								<DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" />
							) : null}
							<span>{field.label}</span>
							{effectiveRequired ? <span className="text-destructive">*</span> : null}
						</label>
						{headerRightNode}
					</div>
				) : (
					<label
						htmlFor={activeLangInputId}
						data-rw-field-slot="label"
						className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground"
					>
						{field.icon ? (
							<DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" />
						) : null}
						<span>{field.label}</span>
						{effectiveRequired ? <span className="text-destructive">*</span> : null}
					</label>
				)
			) : headerRightNode ? (
				<div data-rw-field-slot="label" className="flex justify-end">{headerRightNode}</div>
			) : null}

			{field.description ? (
				<p id={descriptionId} data-rw-field-slot="description" className="text-xs text-muted-foreground leading-relaxed">
					{field.description}
				</p>
			) : null}

			{hasBoundOverlay ? <div data-rw-field-slot="bound-overlay">{adornment?.boundOverlay}</div> : null}

			<div
				hidden={hasBoundOverlay || undefined}
				aria-hidden={hasBoundOverlay ? 'true' : undefined}
				className={hasBoundOverlay ? 'hidden' : undefined}
			>
				{renderFieldControl({
					controlType,
					id: fieldId,
					name: field.name,
					label: field.label,
					description: field.description,
					inputType: field.inputType,
					value: currentVal,
					checked: isChecked,
					checkedValue: field.checkedValue || '1',
					checkboxLabel: field.checkboxLabel || field.label,
					readOnly: isReadOnly,
					disabled: isDisabled,
					required: effectiveRequired,
					error: resolvedError || undefined,
					errorId,
					describedBy,
					placeholder: field.placeholder,
					min: field.min,
					max: field.max,
					step: field.step,
					minLength: field.minLength,
					maxLength: field.maxLength,
					pattern: field.pattern,
					rows: field.rows,
					mono: field.monospace,
					editorMode: field.editorMode,
					codeLanguage: field.codeLanguage,
					affixPrefix: field.prefix,
					affixSuffix: field.suffix,
					showCount: Boolean(field.showCount || field.charCount),
					slugFrom: resolvedSlugFrom,
					slugSeparator: resolvedSlugSeparator,
					slugMaxLength: resolvedSlugMaxLength,
					slugLocked: resolvedSlugLocked,
					secret: field.isSecret
						? {
								masked: Boolean(field.secretMasked),
								prefix: '',
								bytes: 32,
								autogen: true,
							}
						: undefined,
					languages,
					activeLangId: languages && languages.length > 1 ? activeLangId : undefined,
					onSelectLanguage: languages && languages.length > 1 ? setActiveLangId : undefined,
					hideLanguageTabs: false,
					options,
					optionColumns: field.optionColumns,
					datetime:
						controlType === 'datetime'
							? {
									mode: 'text',
									htmlType: field.inputType || 'date',
									dateFormat: 'Y-m-d',
									timeFormat:
										field.inputType === 'datetime-local' || field.inputType === 'time' ? 'H:i' : '',
									hasTime: field.inputType === 'datetime-local' || field.inputType === 'time',
									formattedValue: String(currentVal ?? ''),
									dateValue: String(currentVal ?? ''),
									timeValue: '',
								}
							: undefined,
					maxStars: field.maxStars,
					valueMode: field.valueMode,
					formula: resolvedFormula,
					precision: resolvedPrecision,
					formValues,
					scopePrefix,
					subfields: field.subfields,
					subErrors: allErrors,
					minRows: field.minRows,
					maxRows: field.maxRows,
					accept: field.accept,
					extensions: field.extensions,
					maxFiles: field.maxFiles,
					maxFilesize: field.maxFilesize,
					multiple: field.multiple,
					descriptionRows: field.descriptionRows,
					useTags: field.useTags,
					tagsList: field.tagsList,
					tagsPredefinedOnly: field.tagsPredefinedOnly,
					noUpload: field.noUpload,
					overwrite: field.overwrite,
					uploadUrl: field.uploadUrl,
					uploadFieldName: field.uploadFieldName,
					mediaEndpoint: field.mediaEndpoint,
					mediaToken: field.mediaToken,
					ownerId: field.ownerId,
					focusMode: field.focusMode,
					maxWidth: field.maxWidth,
					maxHeight: field.maxHeight,
					minWidth: field.minWidth,
					minHeight: field.minHeight,
					maxReject: field.maxReject,
					dimensionsByAspectRatio: field.dimensionsByAspectRatio,
					clientQuality: field.clientQuality,
					resizeServer: field.resizeServer,
					useImageEditor: field.useImageEditor,
					gridMode: field.gridMode,
					gridRatio: field.gridRatio,
					minFiles: field.minFiles,
					hasCustomFields: field.hasCustomFields,
					files: field.files,
					tiptapConfig: field.tiptapConfig || undefined,
					linkConfig: field.linkConfig || undefined,
					inlineOptionsInHeader: controlType === 'link' ? true : undefined,
					inlinePortal,
					iconConfig:
						field.iconConfig ||
						(controlType === 'icon'
							? {
									allowCustomization: Boolean(field.allowCustomization),
									allowVariant: field.allowVariant,
									allowSize: field.allowSize,
									allowColor: field.allowColor,
									allowStrokeWidth: field.allowStrokeWidth,
									allowBackground: field.allowBackground,
									previewSize: field.previewSize,
									prefixMode: field.iconPrefixMode,
								}
							: undefined),
					onValueChange: (changedName, nextVal) => {
						if (changedName && changedName !== field.name && onNamedChange) {
							onNamedChange(changedName, nextVal);
						} else {
							onChange(nextVal);
						}
					},
				})}
			</div>

			{!controlRendersOwnStatusRow || hasBoundOverlay ? (
				<FieldStatusRow error={resolvedError} errorId={errorId} />
			) : null}
			<FieldNotes notes={field.notes} id={notesId} />
		</div>
	);
};

export function SchemaFieldHeader({
	field,
	className,
}: {
	field: SchemaFieldDefinition;
	className?: string;
}) {
	return (
		<>
			{field.label ? (
				<div
					data-rw-field-slot="label"
					className={cn(
						'flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground',
						className
					)}
				>
					{field.icon ? (
						<DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" />
					) : null}
					<span>{field.label}</span>
					{field.required ? <span className="text-destructive">*</span> : null}
				</div>
			) : null}
			{field.description ? (
				<p data-rw-field-slot="description" className="text-xs text-muted-foreground leading-relaxed">
					{field.description}
				</p>
			) : null}
		</>
	);
}

export function SchemaFieldFooter({
	notes,
	notesId,
	error,
	errorId,
}: {
	notes?: string;
	notesId?: string;
	error?: string;
	errorId?: string;
}) {
	return (
		<>
			<FieldStatusRow error={error} errorId={errorId} />
			<FieldNotes notes={notes} id={notesId} />
		</>
	);
}
