import type React from 'react';
import type { AnyExtension, Editor } from '@tiptap/core';
import type * as TiptapCoreModule from '@tiptap/core';
import type * as TiptapReactModule from '@tiptap/react';
import type * as PmStateModule from '@tiptap/pm/state';
import type * as PmViewModule from '@tiptap/pm/view';
import type * as PmModelModule from '@tiptap/pm/model';
import type * as PmTransformModule from '@tiptap/pm/transform';
import type * as PmCommandsModule from '@tiptap/pm/commands';
import type * as PmKeymapModule from '@tiptap/pm/keymap';
import type * as PmSchemaListModule from '@tiptap/pm/schema-list';
import type { InputfieldLanguageItem } from '../../fields/types';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type ToolbarSource = 'top' | 'bubble';
export type TiptapPreset = 'core' | 'editor' | 'canvas' | 'blocks';
export type TiptapBundleKey = 'core' | 'editor' | 'canvas' | 'blocks' | 'dialogs';

export type TiptapTranslateFn = (
	key: string,
	paramsOrFallback?: Record<string, string | number | boolean | null | undefined> | string,
	fallback?: string
) => string;

export interface PwOptionItem {
	value: string;
	default: boolean;
}

export interface PwLinkConfig {
	urlType: number;
	extLinkRel: string;
	extLinkTarget: string;
	extLinkClass: string;
	noLinkTextEdit: boolean;
	classOptions: PwOptionItem[];
	relOptions: PwOptionItem[];
	targetOptions: PwOptionItem[];
	httpHosts: string[];
}

export interface PwImageConfig {
	alignLeftClass: string;
	alignCenterClass: string;
	alignRightClass: string;
	hidpiDefault: boolean;
	noSizeAttrs: boolean;
	maxWidth: number;
	skipFields: string[];
}

export interface PwHostMediaField {
	name: string;
	label: string;
	isImage: boolean;
	mediaToken: string;
	noUpload?: boolean;
}

export interface TiptapPwContext {
	endpoint?: string;
	tiptapToken?: string;
	pageId?: number;
	editPageId?: number;
	pageTitle?: string;
	pagePath?: string;
	uploadFieldName?: string;
	canUploadImages?: boolean;
	linkConfig?: Partial<PwLinkConfig>;
	imageConfig?: Partial<PwImageConfig>;
	hostMediaFields?: PwHostMediaField[];
}

export interface PwImageAttrs {
	src: string;
	alt?: string;
	title?: string | null;
	width?: number | null;
	height?: number | null;
	align?: string;
	hidpi?: boolean;
	extraClass?: string;
	nosize?: boolean;
	linkHref?: string;
	linkTarget?: string;
	linkRel?: string;
	linkTitle?: string;
	linkClass?: string;
	caption?: boolean;
	captionText?: string;
	pageId?: number;
	mediaToken?: string;
}

export interface PwPagePickerItem {
	id: number;
	parentId: number;
	title: string;
	name: string;
	path: string;
	url: string;
	rootUrl: string;
	template: string;
	numChildren: number;
	unpublished?: boolean;
	hidden?: boolean;
	hasImages?: boolean;
	isHome?: boolean;
}

export interface PwFilePickerItem {
	url: string;
	basename: string;
	label: string;
	fieldLabel: string;
	ext: string;
	filesizeStr: string;
	description: string;
	pageId: number;
}

export interface PwImagePickerItem {
	pageId: number;
	mediaToken?: string;
	field: string;
	fieldLabel: string;
	basename: string;
	ext: string;
	url: string;
	thumbUrl: string;
	width: number;
	height: number;
	filesizeStr: string;
	description: string;
}

export interface LinkDialogInitialState {
	isEditing: boolean;
	href: string;
	text: string;
	canEditText: boolean;
	title: string;
	target: string;
	rel: string;
	className: string;
}

export interface LinkDialogSubmitPayload {
	href: string;
	text: string;
	textChanged: boolean;
	title: string;
	target: string;
	rel: string;
	className: string;
}

export type TiptapMiniBlockFieldType = 'text' | 'textarea' | 'url' | 'image' | 'select' | 'toggle';

export interface TiptapMiniBlockFieldDef {
	name: string;
	attr: string;
	type: TiptapMiniBlockFieldType;
	label: string;
	placeholder?: string;
	required?: boolean;
	default?: string | boolean;
	options?: Record<string, string>;
}

export interface TiptapMiniBlockDefinition {
	name: string;
	kind: 'builtin' | 'custom';
	label: string;
	description?: string;
	icon?: string;
	tag: string;
	editableBody: boolean;
	keywords?: string[];
	variants?: Record<string, string>;
	alignments?: Record<string, string>;
	fields?: TiptapMiniBlockFieldDef[];
}

export type SlashBlockContext = 'top' | 'nested' | 'miniBlockList' | 'paragraphOnly';

export interface SlashCommandState {
	active: boolean;
	query: string;
	range: { from: number; to: number };
	coords: { left: number; top: number; bottom: number };
	context: SlashBlockContext;
}

export interface SlashCommandItem {
	id: string;
	group: 'miniBlock' | 'basic';
	label: string;
	description: string;
	icon: string;
	keywords: string[];
	execute: (editor: Editor, range?: { from: number; to: number }) => void;
}

export interface SlashCommandKeyboardBridge {
	isOpen: boolean;
	onKeyDown: (event: KeyboardEvent) => boolean;
	dismiss: () => void;
}

export interface TiptapEditorSettings {
	preset?: TiptapPreset | string;
	bundles?: string[];
	toolbar?: string;
	toolbarGroups?: string[][];
	bubbleToolbar?: string;
	bubbleGroups?: string[][];
	headlines?: string[];
	features?: string[];
	toggles?: number[];
	height?: number;
	maxHeight?: number;
	inlineMode?: number;
	slashMenu?: boolean;
	miniBlocks?: string[];
	preservedMiniBlocks?: string[];
	miniBlockDefs?: Record<string, TiptapMiniBlockDefinition>;
	imageFields?: string[];
	pwContext?: TiptapPwContext;
	extraCSS?: string;
}

export interface InputfieldTiptapComponentProps extends TiptapEditorSettings {
	id?: string;
	name?: string;
	label?: string;
	value?: string;
	placeholder?: string;
	rows?: number;
	maxLength?: number | null;
	showCount?: boolean;
	readOnly?: boolean;
	disabled?: boolean;
	required?: boolean;
	useLanguages?: boolean;
	languages?: InputfieldLanguageItem[];
	activeLangId?: number;
	onSelectLanguage?: (langId: number) => void;
	hideLanguageTabs?: boolean;
	tiptapConfig?: TiptapEditorSettings;
	props?: Record<string, unknown>;
	onChange?: (nextHtml: string) => void;
	onValueChange?: (targetName: string, nextHtml: string) => void;
}

export interface ToolbarSnapshot {
	blockStyle: string;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	code: boolean;
	highlight: boolean;
	subscript: boolean;
	superscript: boolean;
	alignLeft: boolean;
	alignCenter: boolean;
	alignRight: boolean;
	alignJustify: boolean;
	bulletList: boolean;
	orderedList: boolean;
	taskList: boolean;
	blockquote: boolean;
	codeBlock: boolean;
	link: boolean;
	linkHref: string;
	inTable: boolean;
	canUndo: boolean;
	canRedo: boolean;
	words: number;
	characters: number;
}

/* ============================================================================
 * Modular Capability Contracts (`TiptapEditor`, `TiptapCanvas`, `TiptapBlocks`, `TiptapDialogs`)
 * ========================================================================== */

export interface TiptapEditorCapability {
	createExtensions: (options: {
		imageConfig: PwImageConfig;
		enableImgResizeRef: { current: boolean };
		onEditImageRef: { current: ((pos: number, attrs: PwImageAttrs) => void) | null };
		onResizeImageServerRef: {
			current: ((pos: number, attrs: PwImageAttrs, nextWidth: number) => void) | null;
		};
		onEditAnchorRef: { current: ((pos: number, id: string) => void) | null };
		t: TiptapTranslateFn;
	}) => AnyExtension[];
	createReadOnlyExtensions: (t: TiptapTranslateFn) => AnyExtension[];
	TableControlsBar: React.FC<{
		editor: Editor;
		t: TiptapTranslateFn;
		onAnnounce: (msg: string) => void;
	}>;
}

export interface TiptapCanvasCapability {
	createSlashExtension: (
		enabled: boolean,
		onStateChangeRef: { current: (next: SlashCommandState) => void },
		keyboardBridgeRef: { current: SlashCommandKeyboardBridge }
	) => AnyExtension;
	BubbleMenuPortal: React.FC<{
		editor: Editor;
		pluginKey: PmStateModule.PluginKey;
		getBubblePortal: () => HTMLElement;
		getBubbleReferenceVirtualElement: () => {
			getBoundingClientRect: () => DOMRect;
			getClientRects: () => DOMRect[];
		} | null;
		bubbleShouldShow: (args: {
			editor: Editor;
			element: HTMLElement;
			view: { dom: HTMLElement; hasFocus: () => boolean };
			state: Editor['state'];
			from: number;
			to: number;
		}) => boolean;
		bubbleMenuOptions: Record<string, unknown>;
		bubbleToolbarRef: React.RefObject<HTMLDivElement | null>;
		bubbleMenuElRef: React.RefObject<HTMLDivElement | null>;
		editorDomId: string;
		focusEditorSynchronously: (ed: Editor) => void;
		t: TiptapTranslateFn;
		children: React.ReactNode;
	}>;
	SlashCommandPalette: React.FC<{
		editor: Editor;
		slashState: SlashCommandState;
		miniBlockDefs?: Record<string, TiptapMiniBlockDefinition>;
		activeMiniBlocks?: string[];
		allowedHeadings: HeadingLevel[];
		keyboardBridgeRef: { current: SlashCommandKeyboardBridge };
		listboxId?: string;
		onActiveOptionChange?: (optionId: string | null) => void;
		t: TiptapTranslateFn;
		onAnnounce?: (msg: string) => void;
	}>;
	BlockHandleOverlay: React.FC<{
		editor: Editor;
		surfaceRef: React.RefObject<HTMLDivElement | null>;
		allowedHeadings: HeadingLevel[];
		enableSlashMenu: boolean;
		t: TiptapTranslateFn;
		onAnnounce: (msg: string) => void;
	}>;
}

export interface TiptapBlocksCapability {
	createMiniBlockExtensions: (
		defs: Record<string, TiptapMiniBlockDefinition> | undefined,
		activeNames: string[] | undefined,
		t: TiptapTranslateFn
	) => AnyExtension[];
	buildMiniBlockSlashItems: (options: {
		miniBlockDefs?: Record<string, TiptapMiniBlockDefinition>;
		activeMiniBlocks?: string[];
		t: TiptapTranslateFn;
		onAnnounce?: (msg: string) => void;
	}) => SlashCommandItem[];
	ToolbarInsertBlockMenu: React.FC<{
		editor: Editor;
		miniBlockDefs?: Record<string, TiptapMiniBlockDefinition>;
		activeMiniBlocks?: string[];
		disabled: boolean;
		t: TiptapTranslateFn;
		onAnnounce?: (msg: string) => void;
	}>;
}

export interface TiptapDialogsCapability {
	TiptapLinkDialog: React.FC<{
		open: boolean;
		initial: LinkDialogInitialState;
		pwContext: TiptapPwContext;
		linkConfig: PwLinkConfig;
		anchors: string[];
		langId?: number;
		onClose: () => void;
		onSubmit: (payload: LinkDialogSubmitPayload) => void;
		onUnlink: () => void;
		t: TiptapTranslateFn;
	}>;
	TiptapImageDialog: React.FC<{
		open: boolean;
		editingPos: number | null;
		initialAttrs: PwImageAttrs | null;
		pwContext: TiptapPwContext;
		imageConfig: PwImageConfig;
		langId?: number;
		onClose: () => void;
		onConfirm: (attrs: PwImageAttrs, editingPos: number | null) => void;
		t: TiptapTranslateFn;
	}>;
	TiptapAnchorDialog: React.FC<{
		open: boolean;
		initialId: string;
		isEditing: boolean;
		onClose: () => void;
		onSubmit: (id: string) => void;
		onRemove: () => void;
		t: TiptapTranslateFn;
	}>;
}

export interface TiptapCapabilityMap {
	editor: TiptapEditorCapability;
	canvas: TiptapCanvasCapability;
	blocks: TiptapBlocksCapability;
	dialogs: TiptapDialogsCapability;
}

export interface TiptapGatewayHelpers {
	fetchTiptapGet: <T = Record<string, unknown>>(
		pwContext: TiptapPwContext,
		params: Record<string, string | number | boolean | undefined>
	) => Promise<T | null>;
	postTiptapJson: <T = Record<string, unknown>>(
		pwContext: TiptapPwContext,
		payload: Record<string, unknown>
	) => Promise<T>;
	uploadTiptapImages: (
		pwContext: TiptapPwContext,
		files: File[],
		options?: { pageId?: number; fieldName?: string; mediaToken?: string }
	) => Promise<PwImagePickerItem[]>;
}

export interface TiptapCoreHelpers {
	extractPageIdFromAssetSrc: (rawSrc: string) => number;
	isSafePwImageSrc: (rawSrc: string) => boolean;
	isSafePwLinkHref: (rawHref: string) => boolean;
	mergeBlankTargetRel: (rawRel: string | null | undefined, target: string | null | undefined) => string;
	sanitizeAnchorId: (raw: string | null | undefined) => string;
	sanitizeCssClassTokens: (raw: string | null | undefined) => string;
}

export interface ReactTiptapRuntimeGlobal {
	TiptapCore: typeof TiptapCoreModule;
	TiptapReact: typeof TiptapReactModule;
	TiptapPM: {
		state: typeof PmStateModule;
		view: typeof PmViewModule;
		model: typeof PmModelModule;
		transform: typeof PmTransformModule;
		commands: typeof PmCommandsModule;
		keymap: typeof PmKeymapModule;
		schemaList: typeof PmSchemaListModule;
	};
	gateway: TiptapGatewayHelpers;
	helpers: TiptapCoreHelpers;
	registerCapability: <K extends keyof TiptapCapabilityMap>(
		name: K,
		impl: TiptapCapabilityMap[K]
	) => void;
	getCapability: <K extends keyof TiptapCapabilityMap>(
		name: K
	) => TiptapCapabilityMap[K] | undefined;
	hasCapability: (name: string) => boolean;
	subscribeCapabilities: (listener: () => void) => () => void;
	ensureBundles: (bundles?: string[]) => Promise<void>;
}
