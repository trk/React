import { markHostFormDirty } from '../hooks';
import type {
	InputfieldOptionItem,
	ReactControlType,
	ReactInputfieldProps,
	SchemaFieldDefinition,
	SchemaFieldOption,
} from './types';

export interface StandaloneControlPayload {
	control?: SchemaFieldDefinition;
}

const CONTROL_ALIASES: Record<string, string> = {
	slug: 'text',
	secret: 'text',
	col_span: 'colspan',
	'col-span': 'colspan',
	slider: 'range',
	'range-slider': 'range_slider',
	dual_range: 'range_slider',
	'dual-range': 'range_slider',
	minmax: 'range_slider',
	date_range: 'daterange',
	'date-range': 'daterange',
	texttags: 'tags',
	text_tags: 'tags',
	'text-tags': 'tags',
	inputfieldtexttags: 'tags',
	searchable_select: 'combobox',
	'searchable-select': 'combobox',
	country: 'combobox',
	country_code: 'combobox',
	'country-code': 'combobox',
	countries: 'combobox',
	timezone: 'combobox',
	time_zone: 'combobox',
	'time-zone': 'combobox',
	tz: 'combobox',
	currency_code: 'combobox',
	'currency-code': 'combobox',
	currencycode: 'combobox',
	iso_currency: 'combobox',
	'iso-currency': 'combobox',
	phone_number: 'phone',
	'phone-number': 'phone',
	'unit-number': 'unit_number',
	unitnumber: 'unit_number',
	currency: 'unit_number',
	money: 'unit_number',
	button_group: 'segmented',
	'button-group': 'segmented',
	box_spacing: 'spacing',
	'box-spacing': 'spacing',
	padding: 'spacing',
	margin: 'spacing',
	dimensions: 'spacing',
	pin: 'otp',
	verification_code: 'otp',
	'verification-code': 'otp',
	totp: 'otp',
	password_strength: 'password',
	'password-strength': 'password',
	new_password: 'password',
	'new-password': 'password',
	md: 'markdown',
	markdown_editor: 'markdown',
	'markdown-editor': 'markdown',
	'condition-builder': 'condition_builder',
	conditionbuilder: 'condition_builder',
};

/**
 * Normalize raw `rwControl` / `data-rw-control` tokens onto canonical `SchemaForm` control names.
 */
export function resolveCanonicalControlType(rawType?: string | null): string {
	const key = String(rawType ?? '').trim().toLowerCase();
	return CONTROL_ALIASES[key] ?? key;
}

/**
 * Unwrap an island host prop payload into its underlying `SchemaFieldDefinition`.
 */
export function resolveStandaloneFieldDefinition(
	rawProps: (StandaloneControlPayload & Partial<SchemaFieldDefinition>) & Record<string, unknown>,
): SchemaFieldDefinition {
	if (rawProps.control && typeof rawProps.control === 'object') {
		return rawProps.control;
	}
	return rawProps as unknown as SchemaFieldDefinition;
}

/**
 * Normalize associative or array option structures into `InputfieldOptionItem[]`.
 */
export function normalizeStandaloneOptions(
	rawOptions: SchemaFieldDefinition['options'],
): InputfieldOptionItem[] {
	if (!rawOptions) {
		return [];
	}
	if (Array.isArray(rawOptions)) {
		return rawOptions.map((item: SchemaFieldOption) => ({
			value: String(item.value ?? ''),
			label: String(item.label ?? item.value ?? ''),
			...(item.disabled ? { disabled: true } : {}),
			...(item.group ? { group: String(item.group) } : {}),
			...(item.icon ? { icon: String(item.icon) } : {}),
			...(item.description ? { description: String(item.description) } : {}),
		}));
	}
	return Object.entries(rawOptions).map(([value, label]) => ({
		value: String(value),
		label: String(label ?? value),
	}));
}

/**
 * Translate a serialized `SchemaFieldDefinition` (plus explicit overrides) into `ReactInputfieldProps`.
 */
export function buildStandaloneControlProps(
	field: SchemaFieldDefinition,
	currentValue: unknown,
	overrides: Partial<ReactInputfieldProps> & {
		renderValueMode?: boolean;
		onValueChange?: (name: string, value: unknown) => void;
	} = {},
): ReactInputfieldProps {
	const rawRecord = field as SchemaFieldDefinition & Record<string, unknown>;
	const rawType = String(field.type ?? rawRecord.explicitControl ?? 'text').toLowerCase();
	const controlType = (overrides.controlType ??
		resolveCanonicalControlType(rawType)) as ReactControlType;
	const name = String(overrides.name ?? field.name ?? '');
	const id = String(overrides.id ?? field.id ?? (name !== '' ? `Inputfield_${name}` : ''));
	const readOnly = Boolean(
		overrides.readOnly ?? overrides.renderValueMode ?? field.readOnly ?? field.readonly,
	);
	const renderValueMode = Boolean(
		overrides.renderValueMode ?? rawRecord.renderValueMode,
	);
	const conn = field.connection;
	const slugFrom =
		overrides.slugFrom ??
		(conn?.type === 'slug' ? (conn.sourceField ?? undefined) : field.slugFrom || undefined);

	const rawSecret = rawRecord.secret;
	const secret =
		rawSecret && typeof rawSecret === 'object'
			? (rawSecret as ReactInputfieldProps['secret'])
			: field.isSecret
				? {
						masked: Boolean(field.secretMasked),
						prefix: typeof field.secretPrefix === 'string' ? field.secretPrefix : '',
						bytes: typeof field.secretBytes === 'number' && field.secretBytes > 0 ? field.secretBytes : 32,
						autogen: field.secretAutoGenerate !== false,
					}
				: undefined;

	const isDateControl =
		controlType === 'datetime' ||
		controlType === 'date' ||
		controlType === 'time' ||
		controlType === 'daterange';
	const datetime =
		rawRecord.datetime !== undefined
			? (rawRecord.datetime as ReactInputfieldProps['datetime'])
			: isDateControl
				? (() => {
						const htmlType =
							controlType === 'time'
								? 'time'
								: controlType === 'date'
									? 'date'
									: controlType === 'daterange'
										? 'daterange'
										: field.inputType || 'datetime-local';
						const hasTime =
							controlType === 'time' ||
							(controlType === 'datetime' && htmlType !== 'date');
						return {
							mode: field.datetimeMode || 'picker',
							htmlType,
							dateFormat: 'Y-m-d',
							timeFormat: hasTime ? 'H:i' : '',
							hasTime,
							formattedValue: String(currentValue ?? ''),
							dateValue: String(currentValue ?? ''),
							timeValue: '',
							dateMin: typeof field.min === 'string' && /^\d{4}-\d{2}-\d{2}/.test(field.min) ? field.min : undefined,
							dateMax: typeof field.max === 'string' && /^\d{4}-\d{2}-\d{2}/.test(field.max) ? field.max : undefined,
							timeMin: field.minTime,
							timeMax: field.maxTime,
							timeStep: field.minuteStep,
							hourFormat: field.hourFormat,
							minuteStep: field.minuteStep,
							showSeconds: field.showSeconds,
							timezone: field.timezone,
							weekStartsOn: field.weekStartsOn,
							displayFormat: field.displayFormat,
							presets: field.presets,
							numberOfMonths: field.numberOfMonths,
						};
					})()
				: undefined;

	return {
		...(field as unknown as Partial<ReactInputfieldProps>),
		controlType,
		fieldClass: field.inputfieldClass,
		id,
		name,
		value: currentValue,
		renderValueMode,
		readOnly,
		disabled: Boolean(overrides.disabled ?? field.disabled),
		required: Boolean(overrides.required ?? field.required),
		mono: Boolean(field.monospace ?? rawRecord.mono),
		affixPrefix: field.prefix ?? (rawRecord.affixPrefix as string | undefined),
		affixSuffix: field.suffix ?? (rawRecord.affixSuffix as string | undefined),
		showCount: Boolean(field.showCount ?? field.charCount),
		checkedValue: field.checkedValue || '1',
		checkboxLabel: field.checkboxLabel || field.label,
		slugFrom,
		slugSeparator: conn?.type === 'slug' ? conn.separator : field.slugSeparator,
		slugMaxLength: (rawRecord.slugMaxLength as number | undefined) ?? (conn?.type === 'slug' ? conn.maxLength : field.maxLength),
		slugLocked: conn?.type === 'slug' ? conn.lockWhenPopulated : field.slugLocked,
		formula: conn?.type === 'calculation' ? conn.formula : field.formula,
		precision: conn?.type === 'calculation' ? conn.precision : field.precision,
		secret,
		datetime,
		currency:
			field.currency ??
			(rawType === 'currency' || rawType === 'money' || field.unitVariant === 'currency'
				? field.defaultUnit || 'EUR'
				: undefined),
		tiptapConfig: field.tiptapConfig || undefined,
		linkConfig: field.linkConfig || undefined,
		languages: Array.isArray(field.languages)
			? field.languages.map((lang) => ({
					id: Number(lang.id),
					name: String(lang.name),
					title: String(lang.title),
					isDefault: Boolean(lang.isDefault),
					editable: lang.editable !== false,
					inputName: String(lang.inputName ?? ''),
					inputId: String(lang.inputId ?? ''),
					value: String(lang.value ?? ''),
				}))
			: undefined,
		options: overrides.options ?? normalizeStandaloneOptions(field.options),
		multiple: Boolean(field.multiple),
		...overrides,
	};
}

/**
 * Notify ProcessWire classic `Inputfield` wrappers and hidden DOM inputs whenever a standalone control changes.
 */
export function notifyStandaloneHostChanged(
	hostEl: HTMLElement | null | undefined,
	fieldName: string,
): void {
	if (!hostEl || typeof window === 'undefined') {
		return;
	}
	markHostFormDirty(hostEl);
	const notifyHiddenInputs = () => {
		if (!hostEl.isConnected) {
			return;
		}
		const jq = (window as unknown as { jQuery?: (el: Element) => { trigger?: (evt: string) => void } }).jQuery;
		for (const inputEl of Array.from(hostEl.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]'))) {
			if (fieldName !== '' && inputEl.name !== fieldName && inputEl.name !== `${fieldName}[]`) {
				continue;
			}
			inputEl.dispatchEvent(new Event('input', { bubbles: true }));
			inputEl.dispatchEvent(new Event('change', { bubbles: true }));
			if (typeof jq === 'function') {
				try {
					jq(inputEl).trigger?.('change');
				} catch {
					// Ignore optional jQuery errors
				}
			}
		}
	};
	if (typeof queueMicrotask === 'function') {
		queueMicrotask(notifyHiddenInputs);
	} else {
		window.setTimeout(notifyHiddenInputs, 0);
	}
}
