import type React from 'react';

export interface InputfieldLanguageItem {
	id: number;
	name: string;
	title: string;
	isDefault: boolean;
	editable: boolean;
	inputName: string;
	inputId: string;
	value: string;
}

export interface InputfieldOptionItem {
	value: string;
	label: string;
	disabled?: boolean;
	group?: string;
	icon?: string;
	description?: string;
	optgroup?: Array<{
		value: string;
		label: string;
		disabled?: boolean;
		icon?: string;
		description?: string;
	}>;
}

export interface InputfieldRepeaterSubfield {
	name: string;
	type?: string;
	label: string;
	placeholder?: string;
	required?: boolean;
	width?: number;
	options?: Array<{ value: string; label: string }>;
	conditions?: SchemaFieldConditions;
	validation?: SchemaFieldValidationRules;
}

export interface SchemaConditionClause {
	field: string;
	operator?: string;
	value?: unknown;
}

export type SchemaConditionSpec =
	| string
	| SchemaConditionClause
	| SchemaConditionClause[]
	| Record<string, unknown>;

export interface SchemaFieldConditions {
	show?: SchemaConditionSpec;
	hide?: SchemaConditionSpec;
	enable?: SchemaConditionSpec;
	disable?: SchemaConditionSpec;
	require?: SchemaConditionSpec;
}

export type SchemaValidationFormat =
	| 'email'
	| 'url'
	| 'uuid'
	| 'ip'
	| 'ipv4'
	| 'ipv6'
	| 'isoDate'
	| 'isoDateTime'
	| 'isoTime'
	| 'hexColor'
	| 'slug'
	| 'alpha'
	| 'alphanumeric'
	| 'numeric'
	| 'digits'
	| 'json'
	| 'creditCard'
	| string;

export interface SchemaFieldValidationRules {
	required?: boolean | { value: boolean; message?: string };
	requiredIf?: string | { value: string; message?: string };
	validateIf?: string | { value: string; message?: string };
	minLength?: number | { value: number; message?: string };
	maxLength?: number | { value: number; message?: string };
	length?: number | { value: number; message?: string };
	min?: number | string | { value: number | string; message?: string };
	max?: number | string | { value: number | string; message?: string };
	step?: number | string | { value: number | string; message?: string };
	pattern?: string | { value: string; message?: string };
	keyPattern?: string | { value: string; message?: string };
	format?: SchemaValidationFormat | { value: SchemaValidationFormat; message?: string };
	startsWith?: string | { value: string; message?: string };
	endsWith?: string | { value: string; message?: string };
	includes?: string | { value: string; message?: string };
	excludes?: string | { value: string; message?: string };
	in?: string[] | string | { value: string[] | string; message?: string };
	notIn?: string[] | string | { value: string[] | string; message?: string };
	equalsField?: string | { value: string; message?: string };
	differentFrom?: string | { value: string; message?: string };
	gtField?: string | { value: string; message?: string };
	gteField?: string | { value: string; message?: string };
	ltField?: string | { value: string; message?: string };
	lteField?: string | { value: string; message?: string };
	minItems?: number | { value: number; message?: string };
	maxItems?: number | { value: number; message?: string };
	maxFilesize?: number | { value: number; message?: string };
	extensions?: string[] | { value: string[]; message?: string };
	messages?: Record<string, string>;
}

export interface SchemaFieldConnection {
	type: 'slug' | 'calculation' | string;
	sourceField?: string;
	separator?: string;
	maxLength?: number;
	lockWhenPopulated?: boolean;
	formula?: string;
	precision?: number;
}

export interface SchemaFieldI18n {
	enabled: boolean;
	inheritLanguage?: boolean;
	languages: InputfieldLanguageItem[];
}

export interface InputfieldSecretConfig {
	masked: boolean;
	prefix: string;
	bytes: number;
	autogen: boolean;
}

export interface InputfieldDatetimeConfig {
	mode: string;
	htmlType: string;
	dateFormat: string;
	timeFormat: string;
	hasTime: boolean;
	formattedValue: string;
	dateValue: string;
	timeValue: string;
	dateMin?: string;
	dateMax?: string;
	dateStep?: number;
	timeMin?: string;
	timeMax?: string;
	timeStep?: number;
	hourFormat?: '24h' | '12h';
	minuteStep?: number;
	showSeconds?: boolean;
	timezone?: string;
	weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
	displayFormat?: string;
	presets?: boolean;
	numberOfMonths?: number;
}

export interface InputfieldSubmitDropdownItem {
	type: 'value' | 'link' | string;
	value: string;
	label: string;
	icon?: string;
}

export interface InputfieldSubmitConfig {
	type: string;
	value: string;
	label: string;
	icon?: string;
	secondary?: boolean;
	danger?: boolean;
	header?: boolean;
	small?: boolean;
	dropdownInputName: string;
	dropdownSubmit: boolean;
	dropdownRequired: boolean;
	dropdownItems: InputfieldSubmitDropdownItem[];
}

export interface InputfieldMediaItem {
	id: string;
	hash: string;
	name: string;
	basename: string;
	basenameNoExt?: string;
	ext: string;
	url: string;
	thumbUrl?: string;
	size: number;
	filesizeStr: string;
	description: string;
	descriptions?: Record<string, string>;
	tags: string;
	sort: number;
	isTemp?: boolean;
	width?: number;
	height?: number;
	focus?: string;
	dominantColor?: string;
	palette?: string[];
	lqip?: string;
	customFields?: SchemaFieldDefinition[];
	customValues?: Record<string, unknown>;
}

export interface LinkFieldValue {
	type: string;
	pageId: number;
	resourceType: string;
	resourceId: string;
	url: string;
	file: string;
	query: string;
	anchor: string;
	label: string;
	ariaLabel: string;
	target: string;
	rel: string;
	labels?: Record<string, string>;
	ariaLabels?: Record<string, string>;
	alt?: string;
	descriptions?: Record<string, string>;
	focus?: string;
	tags?: string;
}

export interface LinkMediaProfile {
	key: string;
	kind: 'image' | 'video' | 'file' | string;
	isImage: boolean;
	isVideo: boolean;
	label: string;
	icon: string;
	extensions: string[];
	accept: string;
	maxFilesize: number;
	mediaToken: string;
}

export interface LinkSelectedMedia {
	name: string;
	url: string;
	thumbUrl?: string;
	ext?: string;
	size?: number;
	width?: number;
	height?: number;
}

export interface LinkFieldConfig {
	types: string[];
	defaultType: string;
	enableLabel: boolean;
	enableAriaLabel: boolean;
	enableTarget: boolean;
	enableRel: boolean;
	enableAnchor: boolean;
	enableQuery: boolean;
	relationEndpoint: string;
	relationTokens: Record<string, string>;
	selectedTarget?: RelationItemData | Record<string, unknown> | null;
	mediaEndpoint?: string;
	mediaProfiles?: Record<string, LinkMediaProfile>;
	selectedMedia?: LinkSelectedMedia | null;
	ownerId?: string;
	typeLabels?: Record<string, string>;
	languages?: InputfieldLanguageItem[];
}

export interface IconFieldConfig {
	allowCustomization?: boolean;
	allowVariant?: boolean;
	allowSize?: boolean;
	allowColor?: boolean;
	allowStrokeWidth?: boolean;
	allowBackground?: boolean;
	previewSize?: number;
	prefixMode?: 'none' | 'vector' | 'fa';
	endpoint?: string;
	totalIcons?: number;
}

export interface PhoneCountryItem {
	code: string;
	name: string;
	dial: string;
}

export type ReactControlType =
	| 'text'
	| 'email'
	| 'url'
	| 'tel'
	| 'phone'
	| 'link'
	| 'icon'
	| 'number'
	| 'textarea'
	| 'tiptap'
	| 'datetime'
	| 'date'
	| 'time'
	| 'daterange'
	| 'color'
	| 'tags'
	| 'combobox'
	| 'unit_number'
	| 'segmented'
	| 'spacing'
	| 'otp'
	| 'password'
	| 'range_slider'
	| 'markdown'
	| 'condition_builder'
	| 'checkbox'
	| 'consent'
	| 'toggle'
	| 'select'
	| 'radios'
	| 'checkboxes'
	| 'asmselect'
	| 'multiselect'
	| 'range'
	| 'colspan'
	| 'rating'
	| 'signature'
	| 'calculation'
	| 'repeater'
	| 'file'
	| 'image'
	| 'heading'
	| 'submit';

export type ConditionMatchMode = 'all' | 'any';

export type ConditionFieldType =
	| 'text'
	| 'number'
	| 'select'
	| 'boolean'
	| 'country'
	| 'currency'
	| 'date';

export interface DynamicBlockOptionsSource {
	blockField: string;
	blockTypes?: string[];
	valueKey: string;
	labelKey?: string;
	typeKey?: string;
	optionsKey?: string;
	typeMap?: Record<string, ConditionFieldType>;
	fallbackToTextWhenNoOptions?: boolean;
	allowCustomKey?: string;
	excludeTypes?: string[];
	excludeSelf?: boolean;
}

export interface ConditionFieldOption {
	value: string;
	label: string;
	description?: string;
}

export interface ConditionFieldSpec {
	key: string;
	label: string;
	type: ConditionFieldType;
	options?: ConditionFieldOption[];
	operators?: string[];
	group?: string;
	icon?: string;
	description?: string;
	placeholder?: string;
	sourceOnly?: boolean;
	targetOnly?: boolean;
	comparableTypes?: ConditionFieldType[];
	allowCustomValue?: boolean;
}

export interface ConditionRuleItem {
	id: string;
	field: string;
	operator: string;
	value: unknown;
	valueSource?: 'manual' | 'field';
}

export interface ConditionGroupItem {
	id: string;
	match: ConditionMatchMode;
	negate?: boolean;
	rules: ConditionRuleItem[];
}

export interface ConditionBuilderValue {
	match: ConditionMatchMode;
	groups: ConditionGroupItem[];
}

export interface ReactInputfieldProps {
	controlType: ReactControlType;
	fieldClass?: string;
	id: string;
	name: string;
	label?: string;
	description?: string;
	inputType?: string;
	value?: unknown;
	renderValueMode?: boolean;
	readOnly?: boolean;
	disabled?: boolean;
	required?: boolean;
	placeholder?: string;
	min?: string | number | null;
	max?: string | number | null;
	step?: string | number | null;
	minLength?: number | null;
	maxLength?: number | null;
	pattern?: string | null;
	size?: number | null;
	rows?: number;
	mono?: boolean;
	editorMode?: 'plain' | 'markdown' | 'json' | 'code';
	codeLanguage?: string;
	className?: string;
	dataAttributes?: Record<string, string>;
	affixPrefix?: string;
	affixSuffix?: string;
	showCount?: boolean;
	slugFrom?: string;
	slugSeparator?: string;
	slugMaxLength?: number;
	slugLocked?: boolean;
	secret?: InputfieldSecretConfig;
	languages?: InputfieldLanguageItem[];
	activeLangId?: number;
	onSelectLanguage?: (langId: number) => void;
	hideLanguageTabs?: boolean;
	options?: InputfieldOptionItem[];
	optionColumns?: number;
	checked?: boolean;
	checkedValue?: string;
	uncheckedValue?: string;
	checkboxLabel?: string;
	useDeselect?: boolean;
	useVertical?: boolean;
	datetime?: InputfieldDatetimeConfig;
	datetimeMode?: 'picker' | 'html' | 'text';
	hourFormat?: '24h' | '12h';
	minuteStep?: number;
	showSeconds?: boolean;
	timezone?: string;
	weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
	displayFormat?: string;
	presets?: boolean;
	numberOfMonths?: number;
	minTime?: string;
	maxTime?: string;
	swatches?: string[];
	allowAlpha?: boolean;
	clearable?: boolean;
	allowDuplicates?: boolean;
	suggestions?: string[];
	emptyText?: string;
	allowCustom?: boolean;
	maxItems?: number;
	units?: string[];
	defaultUnit?: string;
	unitVariant?: 'currency' | string;
	currency?: string;
	locale?: string;
	defaultCountry?: string;
	preferredCountries?: string[];
	phoneCountries?: PhoneCountryItem[];
	iconOnly?: boolean;
	fullWidth?: boolean;
	sides?: Array<'top' | 'right' | 'bottom' | 'left'>;
	allowAuto?: boolean;
	allowNegative?: boolean;
	otpLength?: number;
	otpMode?: 'numeric' | 'alphanumeric';
	otpSeparatorAfter?: number;
	mask?: boolean;
	showStrength?: boolean;
	showRequirements?: boolean;
	allowGenerate?: boolean;
	requireUppercase?: boolean;
	requireLowercase?: boolean;
	requireNumber?: boolean;
	requireSymbol?: boolean;
	confirmPassword?: boolean;
	autoComplete?: string;
	rangeMode?: 'single' | 'dual';
	dual?: boolean;
	minDistance?: number;
	previewMode?: 'write' | 'preview' | 'split';
	allowSplit?: boolean;
	showToolbar?: boolean;
	submit?: InputfieldSubmitConfig;
	maxStars?: number;
	valueMode?: 'columns' | 'percent' | string;
	formula?: string;
	precision?: number;
	formValues?: Record<string, unknown>;
	scopePrefix?: string;
	subfields?: InputfieldRepeaterSubfield[];
	subErrors?: Record<string, string>;
	minRows?: number;
	maxRows?: number;
	accept?: string;
	extensions?: string[];
	minFiles?: number;
	maxFiles?: number;
	maxFilesize?: number;
	multiple?: boolean;
	descriptionRows?: number;
	useTags?: boolean;
	tagsList?: string[];
	tagsPredefinedOnly?: boolean;
	noUpload?: boolean;
	overwrite?: boolean;
	uploadUrl?: string;
	uploadFieldName?: string;
	mediaEndpoint?: string;
	mediaToken?: string;
	ownerId?: string | number;
	focusMode?: 'off' | 'on' | 'zoom' | string;
	maxWidth?: number;
	maxHeight?: number;
	minWidth?: number;
	minHeight?: number;
	maxReject?: boolean;
	dimensionsByAspectRatio?: boolean;
	clientQuality?: number;
	resizeServer?: boolean;
	useImageEditor?: boolean;
	gridMode?: 'grid' | 'left' | 'list' | 'table' | string;
	gridRatio?: 'auto' | '1:1' | '4:3' | '16:9' | '3:4' | '21:9' | string;
	hasCustomFields?: boolean;
	files?: InputfieldMediaItem[];
	tiptapConfig?: Record<string, unknown> & {
		preset?: 'core' | 'editor' | 'canvas' | 'blocks' | string;
		bundles?: string[];
		preservedMiniBlocks?: string[];
	};
	linkConfig?: LinkFieldConfig;
	inlineOptionsInHeader?: boolean;
	inlinePortal?: boolean;
	iconConfig?: IconFieldConfig;
	conditionFields?: ConditionFieldSpec[];
	conditionFieldsSource?: DynamicBlockOptionsSource;
	dynamicOptionsFromBlocks?: DynamicBlockOptionsSource;
	allowFieldComparison?: boolean;
	allowNegate?: boolean;
	showSummary?: boolean;
	layout?: 'auto' | 'inline' | 'compact';
	maxGroups?: number;
	maxRulesPerGroup?: number;
	emptyMessage?: string;
	showLabel?: boolean;
	heading?: string;
	allowRawExpression?: boolean;
	formId?: string;
	error?: string;
	errorId?: string;
	describedBy?: string;
	errors?: string[];
	props?: Record<string, unknown>;
	onValueChange?: (name: string, value: unknown) => void;
}

export interface SchemaFieldOption {
	value: string;
	label: string;
	disabled?: boolean;
	group?: string;
	icon?: string;
	description?: string;
}

export interface RelationItemData {
	key: string;
	resource: string;
	resourceLabel?: string;
	value: string | number;
	id: string | number;
	label: string;
	subtitle?: string;
	badge?: string;
	icon?: string;
	thumb?: string;
	status?: string;
	editUrl?: string;
	viewUrl?: string;
	hasChildren?: boolean;
	numChildren?: number;
	parentId?: string | number;
	disabled?: boolean;
	meta?: Record<string, unknown>;
}

export interface RelationResourceDescriptor {
	name: string;
	label: string;
	icon: string;
	defaultValueField: string;
	supportsTree: boolean;
	supportsQuickCreate: boolean;
}

export interface SchemaDangerZoneConfig {
	title: string;
	description?: string;
	buttonLabel?: string;
	dialogTitle?: string;
	dialogDescription?: string;
	acknowledgeLabel?: string;
	confirmLabel?: string;
	confirmInputName: string;
	confirmInputValue?: string;
	blocked?: boolean;
	blockedMessage?: string;
	referenceCountField?: string;
	referenceWarningTemplate?: string;
}

export interface SchemaFieldDefinition {
	kind?: 'control' | 'section' | 'tabs' | 'island' | 'markup' | 'danger_zone';
	id?: string;
	name: string;
	type?: string;
	inputType?: string;
	inputfieldClass?: string;
	label?: string;
	checkboxLabel?: string;
	description?: string;
	notes?: string;
	detail?: string;
	icon?: string;
	required?: boolean;
	disabled?: boolean;
	readonly?: boolean;
	readOnly?: boolean;
	width?: number;
	columnWidth?: number;
	colSpan?: number;
	collapsed?: boolean;
	hideWrap?: boolean;
	noWrap?: boolean;
	collapsible?: boolean;
	asyncUrl?: string;
	asyncMode?: 'expand' | 'mount';
	hideWhenEmpty?: boolean;
	badge?: string;
	surface?: 'card' | 'plain';
	appendHtml?: string;
	dangerZone?: SchemaDangerZoneConfig;
	placeholder?: string;
	value?: unknown;
	values?: string[];
	checked?: boolean;
	checkedValue?: string;
	defaultValue?: unknown;
	resetValue?: unknown;
	options?: Record<string, string> | SchemaFieldOption[];
	optionColumns?: number;
	min?: string | number | null;
	max?: string | number | null;
	step?: string | number | null;
	minLength?: number;
	maxLength?: number;
	charCount?: boolean;
	showCount?: boolean;
	prefix?: string;
	suffix?: string;
	pattern?: string | null;
	rows?: number;
	monospace?: boolean;
	editorMode?: 'plain' | 'markdown' | 'json' | 'code';
	codeLanguage?: string;
	slugFrom?: string | null;
	slugSeparator?: string;
	slugLocked?: boolean;
	connection?: SchemaFieldConnection | null;
	isSecret?: boolean;
	secretMasked?: boolean;
	secretPrefix?: string;
	secretBytes?: number;
	secretAutoGenerate?: boolean;
	useLanguages?: boolean;
	languages?: Array<{
		id: number;
		name: string;
		title: string;
		isDefault: boolean;
		editable?: boolean;
		inputName?: string;
		inputId?: string;
		value: string;
	}>;
	i18n?: SchemaFieldI18n | null;
	maxStars?: number;
	valueMode?: 'columns' | 'percent' | string;
	formula?: string;
	precision?: number;
	subfields?: InputfieldRepeaterSubfield[];
	minRows?: number;
	maxRows?: number;
	accept?: string;
	extensions?: string[];
	minFiles?: number;
	maxFiles?: number;
	maxFilesize?: number;
	multiple?: boolean;
	descriptionRows?: number;
	useTags?: boolean;
	overwrite?: boolean;
	uploadUrl?: string;
	uploadFieldName?: string;
	files?: InputfieldMediaItem[];
	isImage?: boolean;
	showIf?: string;
	hideIf?: string;
	enableIf?: string;
	disableIf?: string;
	requiredIf?: string;
	conditions?: SchemaFieldConditions;
	validation?: SchemaFieldValidationRules;
	stepIndex?: number;
	stepTitle?: string;
	error?: string;
	errors?: string[];
	children?: SchemaFieldDefinition[];
	fields?: Record<string, SchemaFieldDefinition> | SchemaFieldDefinition[];
	tabs?: SchemaTabPaneDefinition[];
	variant?: 'line' | 'segmented' | 'pills' | 'vertical' | string;
	activeTab?: string;
	component?: string;
	props?: Record<string, unknown>;
	html?: string;
	isFile?: boolean;
	header?: boolean;
	danger?: boolean;
	confirmDelete?: boolean;
	actions?: Array<{ type?: 'value' | 'link' | string; value: string; label: string; icon?: string }>;
	blocks?: Record<string, { label: string; icon?: string; fields?: Record<string, SchemaFieldDefinition> }>;
	keyLabel?: string;
	valueLabel?: string;
	keyPlaceholder?: string;
	valuePlaceholder?: string;
	addLabel?: string;
	removeLabel?: string;
	keyPattern?: string | null;
	keyPatternMessage?: string | null;
	allowEmptyValues?: boolean;
	kvRows?: Array<{ key: string; value: string }>;
	minItems?: number;
	maxItems?: number;
	cardinality?: 'm2o' | 'm2m' | 'o2m' | 'm2a' | string;
	resource?: string;
	resourceLabel?: string;
	resourceIcon?: string;
	resources?: RelationResourceDescriptor[];
	allowedResources?: string[];
	dependsResourceMap?: Record<string, string>;
	valueField?: string;
	widget?: string;
	configuredWidget?: string;
	endpoint?: string;
	relationToken?: string;
	selectedItems?: RelationItemData[];
	initialOptions?: RelationItemData[];
	initialTree?: RelationItemData[];
	sortable?: boolean;
	dependsOn?: string;
	allowCustom?: boolean;
	creatable?: boolean;
	editableLink?: boolean;
	allowLink?: boolean;
	allowUnlink?: boolean;
	foreignField?: string;
	ownerId?: string | number;
	tiptapConfig?: (Record<string, unknown> & {
		preset?: 'core' | 'editor' | 'canvas' | 'blocks' | string;
		bundles?: string[];
		preservedMiniBlocks?: string[];
	}) | null;
	tagsList?: string[];
	tagsPredefinedOnly?: boolean;
	noUpload?: boolean;
	mediaEndpoint?: string;
	mediaToken?: string;
	focusMode?: 'off' | 'on' | 'zoom' | string;
	maxWidth?: number;
	maxHeight?: number;
	minWidth?: number;
	minHeight?: number;
	maxReject?: boolean;
	dimensionsByAspectRatio?: boolean;
	clientQuality?: number;
	resizeServer?: boolean;
	useImageEditor?: boolean;
	gridMode?: 'grid' | 'left' | 'list' | 'table' | string;
	gridRatio?: 'auto' | '1:1' | '4:3' | '16:9' | '3:4' | '21:9' | string;
	hasCustomFields?: boolean;
	linkConfig?: LinkFieldConfig | null;
	iconConfig?: IconFieldConfig | null;
	allowCustomization?: boolean;
	allowVariant?: boolean;
	allowSize?: boolean;
	allowColor?: boolean;
	allowStrokeWidth?: boolean;
	allowBackground?: boolean;
	previewSize?: number;
	iconPrefixMode?: 'none' | 'vector' | 'fa';
	inlineSettings?: string[];
	inlineHidden?: boolean;
	datetimeMode?: 'picker' | 'html' | 'text';
	hourFormat?: '24h' | '12h';
	minuteStep?: number;
	showSeconds?: boolean;
	timezone?: string;
	weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
	displayFormat?: string;
	presets?: boolean;
	numberOfMonths?: number;
	minTime?: string;
	maxTime?: string;
	swatches?: string[];
	allowAlpha?: boolean;
	clearable?: boolean;
	allowDuplicates?: boolean;
	suggestions?: string[];
	emptyText?: string;
	units?: string[];
	defaultUnit?: string;
	unitVariant?: 'currency' | string;
	currency?: string;
	locale?: string;
	defaultCountry?: string;
	preferredCountries?: string[];
	phoneCountries?: PhoneCountryItem[];
	iconOnly?: boolean;
	fullWidth?: boolean;
	useDeselect?: boolean;
	sides?: Array<'top' | 'right' | 'bottom' | 'left'>;
	allowAuto?: boolean;
	allowNegative?: boolean;
	otpLength?: number;
	otpMode?: 'numeric' | 'alphanumeric';
	otpSeparatorAfter?: number;
	mask?: boolean;
	showStrength?: boolean;
	showRequirements?: boolean;
	allowGenerate?: boolean;
	requireUppercase?: boolean;
	requireLowercase?: boolean;
	requireNumber?: boolean;
	requireSymbol?: boolean;
	confirmPassword?: boolean;
	autoComplete?: string;
	rangeMode?: 'single' | 'dual';
	dual?: boolean;
	minDistance?: number;
	previewMode?: 'write' | 'preview' | 'split';
	allowSplit?: boolean;
	showToolbar?: boolean;
	conditionFields?: ConditionFieldSpec[];
	conditionFieldsSource?: DynamicBlockOptionsSource;
	dynamicOptionsFromBlocks?: DynamicBlockOptionsSource;
	allowFieldComparison?: boolean;
	allowNegate?: boolean;
	showSummary?: boolean;
	layout?: 'auto' | 'inline' | 'compact';
	maxGroups?: number;
	maxRulesPerGroup?: number;
	emptyMessage?: string;
	showLabel?: boolean;
	heading?: string;
	allowRawExpression?: boolean;
}

export interface ConditionBuilderFieldProps
	extends Omit<ReactInputfieldProps, 'controlType' | 'id' | 'name'> {
	controlType?: ReactControlType;
	id?: string;
	name?: string;
	showLabel?: boolean;
	heading?: string;
	allowRawExpression?: boolean;
	control?: Record<string, unknown>;
	onChange?: (nextValue: ConditionBuilderValue) => void;
}

export interface SchemaTabPaneDefinition {
	id: string;
	name?: string;
	label: string;
	icon?: string;
	badge?: string | number | null;
	description?: string;
	notes?: string;
	collapsed?: boolean;
	showIf?: string;
	hideIf?: string;
	conditions?: SchemaFieldConditions;
	confirmDelete?: boolean;
	systemTab?: boolean;
	fields: SchemaFieldDefinition[];
}

export interface SchemaSubmitDefinition {
	id: string;
	name: string;
	label: string;
	icon?: string;
	header?: boolean;
	danger?: boolean;
	disabled?: boolean;
	showIf?: string;
	hideIf?: string;
	enableIf?: string;
	disableIf?: string;
	conditions?: SchemaFieldConditions;
	actions?: Array<{ type?: 'value' | 'link' | string; value: string; label: string; icon?: string }>;
}

export interface SchemaFormPayload {
	id?: string;
	name?: string;
	action?: string;
	method?: string;
	encType?: string;
	isFragment?: boolean;
	dirtyGuard?: boolean;
	surface?: 'plain' | 'card' | null;
	tabsLayout?: 'horizontal' | 'vertical' | null;
	presenceKey?: string | null;
	presenceToken?: string | null;
	presenceEndpoint?: string | null;
	csrf?: { name: string; value: string } | null;
	hiddenInputs?: Array<{ id?: string; name: string; value: string }>;
	tabs?: SchemaTabPaneDefinition[];
	fields?: SchemaFieldDefinition[];
	belowTabsFields?: SchemaFieldDefinition[];
	submits?: SchemaSubmitDefinition[];
	defaultValues?: Record<string, unknown>;
	values?: Record<string, unknown>;
	errors?: Record<string, string>;
}

export interface SchemaFieldProps {
	field: SchemaFieldDefinition;
	value: unknown;
	onChange: (value: unknown) => void;
}

export interface SchemaFieldAdornment {
	labelAction?: React.ReactNode;
	boundOverlay?: React.ReactNode;
	conditionValue?: unknown;
}

export interface SchemaFormProps extends Omit<Partial<SchemaFormPayload>, 'fields'> {
	schema?: SchemaFormPayload;
	fields?: SchemaFieldDefinition[] | Record<string, SchemaFieldDefinition>;
	values?: Record<string, unknown>;
	scopePrefix?: string;
	card?: boolean;
	validateOnSubmit?: boolean;
	validateOnChange?: boolean;
	onChange?: (values: Record<string, unknown>) => void;
	onFieldChange?: (name: string, value: unknown, nextValues: Record<string, unknown>) => void;
	onSubmit?: (values: Record<string, unknown>, formElement?: HTMLFormElement | null) => void | Promise<void>;
	onValidationError?: (errors: Record<string, string>) => void;
	tabSlots?: Record<string, { before?: React.ReactNode; after?: React.ReactNode }>;
	fieldAdornments?: Record<string, SchemaFieldAdornment>;
	submitLabel?: string;
	hideFooterWhenPortaled?: boolean;
	className?: string;
}

export type FieldControlComponent = React.FC<ReactInputfieldProps>;
