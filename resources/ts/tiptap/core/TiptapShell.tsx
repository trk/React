/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { EditorContent, posToDOMRect, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { NodeSelection, PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { getReactWorkspaceRuntime } from '../../runtime';
import {
	ensureNativeLanguageTabsBridge,
	LANGUAGE_SELECT_ALL_EVENT,
	LanguageTabsBar,
	readInitialSyncedLanguageId,
	resolveLanguageSyncScope,
} from '../../fields/shared';
import {
	isRichHtmlEmpty,
	plainTextLength,
	plainWordCount,
	sanitizeExtraCss,
} from '../tiptapPolicy';
import {
	createPwHeadingExtension,
	createPwLinkExtension,
	extractDocumentAnchors,
	extractPageIdFromAssetSrc,
	resolvePwImageConfig,
	resolvePwLinkConfig,
} from './CorePwExtensions';
import { ReadOnlyHtmlSurface } from './ReadOnlyHtmlSurface';
import { TiptapStatusbar } from './TiptapStatusbar';
import { getTiptapCapability, hasTiptapCapability, subscribeTiptapCapabilities } from './tiptapRuntime';
import {
	DEFAULT_BUBBLE_TOOLBAR,
	DEFAULT_FEATURES,
	DEFAULT_TOOLBAR,
	normalizeToolbarGroups,
	parseAllowedHeadingLevels,
	parseToolbarString,
	resolveClientRequiredBundles,
	sanitizePastedHtml,
	syncExternalHiddenInput,
} from './toolbarConfig';
import { renderTiptapToolbarGroups } from './TiptapToolbar';
import { postTiptapJson, uploadTiptapImages } from './tiptapGatewayClient';
import type {
	InputfieldTiptapComponentProps,
	LinkDialogInitialState,
	LinkDialogSubmitPayload,
	PwImageAttrs,
	SlashCommandKeyboardBridge,
	SlashCommandState,
	TiptapEditorSettings,
	TiptapPwContext,
	ToolbarSnapshot,
	ToolbarSource,
} from './tiptapTypes';
import { useToolbarRovingFallback } from './useToolbarRovingFallback';
import type { InputfieldLanguageItem } from '../../fields/types';

const runtime = getReactWorkspaceRuntime();
const { React, UI, Utils, useTranslations } = runtime;
const { cn } = Utils;
const { useCallback, useEffect, useId, useMemo, useRef, useState } = React;
const { Button, Textarea } = UI;

const CLOSED_SLASH_STATE: SlashCommandState = {
	active: false,
	query: '',
	range: { from: 0, to: 0 },
	coords: { left: 0, top: 0, bottom: 0 },
	context: 'top',
};

const EMPTY_SNAPSHOT: ToolbarSnapshot = {
	blockStyle: 'paragraph',
	bold: false,
	italic: false,
	underline: false,
	strike: false,
	code: false,
	highlight: false,
	subscript: false,
	superscript: false,
	alignLeft: false,
	alignCenter: false,
	alignRight: false,
	alignJustify: false,
	bulletList: false,
	orderedList: false,
	taskList: false,
	blockquote: false,
	codeBlock: false,
	link: false,
	linkHref: '',
	inTable: false,
	canUndo: false,
	canRedo: false,
	words: 0,
	characters: 0,
};

function selectToolbarSnapshot(ed: Editor | null): ToolbarSnapshot {
	if (!ed || ed.isDestroyed) {
		return EMPTY_SNAPSHOT;
	}
	let blockStyle = 'paragraph';
	for (const lvl of [1, 2, 3, 4, 5, 6] as const) {
		if (ed.isActive('heading', { level: lvl })) {
			blockStyle = `h${lvl}`;
			break;
		}
	}
	const storageMap = ed.storage as unknown as Record<
		string,
		{ characters?: () => number; words?: () => number } | undefined
	>;
	const charCountStorage = storageMap.characterCount;
	const characters =
		typeof charCountStorage?.characters === 'function'
			? Number(charCountStorage.characters())
			: Array.from(ed.state.doc.textContent || '').length;
	const words =
		typeof charCountStorage?.words === 'function'
			? Number(charCountStorage.words())
			: (ed.state.doc.textContent || '').trim().split(/\s+/).filter(Boolean).length;

	return {
		blockStyle,
		bold: ed.isActive('bold'),
		italic: ed.isActive('italic'),
		underline: ed.isActive('underline'),
		strike: ed.isActive('strike'),
		code: ed.isActive('code'),
		highlight: ed.isActive('highlight'),
		subscript: ed.isActive('subscript'),
		superscript: ed.isActive('superscript'),
		alignLeft: ed.isActive({ textAlign: 'left' }),
		alignCenter: ed.isActive({ textAlign: 'center' }),
		alignRight: ed.isActive({ textAlign: 'right' }),
		alignJustify: ed.isActive({ textAlign: 'justify' }),
		bulletList: ed.isActive('bulletList'),
		orderedList: ed.isActive('orderedList'),
		taskList: ed.isActive('taskList'),
		blockquote: ed.isActive('blockquote'),
		codeBlock: ed.isActive('codeBlock'),
		link: ed.isActive('link'),
		linkHref: String(ed.getAttributes('link')?.href || ''),
		inTable: ed.isActive('table'),
		canUndo: ed.can().undo(),
		canRedo: ed.can().redo(),
		words,
		characters,
	};
}

export function InputfieldTiptap(rawProps: InputfieldTiptapComponentProps): React.ReactElement {
	const { t } = useTranslations('InputfieldTiptap');
	const merged: InputfieldTiptapComponentProps =
		rawProps.props && typeof rawProps.props === 'object' ? { ...rawProps, ...rawProps.props } : rawProps;

	const reactUid = useId().replace(/[^a-zA-Z0-9_-]/g, '') || '0';
	const fieldName = String(merged.name || 'tiptap');
	const fieldId = String(merged.id || `Inputfield_${fieldName}_${reactUid}`);
	const cleanFieldId = fieldId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'tiptap';
	const scopeId = `rw-tiptap-scope-${cleanFieldId}-${reactUid}`;
	const editorDomId = `${fieldId}__prose`;

	const [, setCapabilityTick] = useState(0);
	useEffect(() => subscribeTiptapCapabilities(() => setCapabilityTick((n) => n + 1)), []);

	const cfg = useMemo<TiptapEditorSettings>(() => {
		const nested = merged.tiptapConfig && typeof merged.tiptapConfig === 'object' ? merged.tiptapConfig : {};
		const pick = <K extends keyof TiptapEditorSettings>(key: K): TiptapEditorSettings[K] =>
			nested[key] !== undefined ? nested[key] : merged[key];
		return {
			preset: pick('preset'),
			bundles: pick('bundles'),
			toolbar: pick('toolbar'),
			toolbarGroups: pick('toolbarGroups'),
			bubbleToolbar: pick('bubbleToolbar'),
			bubbleGroups: pick('bubbleGroups'),
			headlines: pick('headlines'),
			features: pick('features'),
			toggles: pick('toggles'),
			height: pick('height'),
			maxHeight: pick('maxHeight'),
			inlineMode: pick('inlineMode'),
			slashMenu: pick('slashMenu'),
			miniBlocks: pick('miniBlocks'),
			preservedMiniBlocks: pick('preservedMiniBlocks'),
			miniBlockDefs: pick('miniBlockDefs'),
			imageFields: pick('imageFields'),
			pwContext: pick('pwContext'),
			extraCSS: pick('extraCSS'),
		};
	}, [
		merged.tiptapConfig,
		merged.preset,
		merged.bundles,
		merged.toolbar,
		merged.toolbarGroups,
		merged.bubbleToolbar,
		merged.bubbleGroups,
		merged.headlines,
		merged.features,
		merged.toggles,
		merged.height,
		merged.maxHeight,
		merged.inlineMode,
		merged.slashMenu,
		merged.miniBlocks,
		merged.preservedMiniBlocks,
		merged.miniBlockDefs,
		merged.imageFields,
		merged.pwContext,
		merged.extraCSS,
	]);

	const safeExtraCss = useMemo(() => sanitizeExtraCss(cfg.extraCSS), [cfg.extraCSS]);
	const features = useMemo<Set<string>>(() => {
		const rawList = Array.isArray(cfg.features) ? cfg.features : DEFAULT_FEATURES;
		return new Set(rawList.map((f) => String(f).trim()));
	}, [cfg.features]);

	const pwContext = useMemo<TiptapPwContext>(
		() => (cfg.pwContext && typeof cfg.pwContext === 'object' ? cfg.pwContext : {}),
		[cfg.pwContext]
	);
	const pwLinkConfig = useMemo(() => resolvePwLinkConfig(pwContext.linkConfig), [pwContext.linkConfig]);
	const pwImageConfig = useMemo(() => resolvePwImageConfig(pwContext.imageConfig), [pwContext.imageConfig]);

	const allowedLevels = useMemo(() => parseAllowedHeadingLevels(cfg.headlines), [cfg.headlines]);

	const activeMiniBlocks = useMemo<string[]>(() => {
		if (!Array.isArray(cfg.miniBlocks)) {
			return [];
		}
		return cfg.miniBlocks.map((name) => String(name || '').trim()).filter(Boolean);
	}, [cfg.miniBlocks]);

	const preservedMiniBlocks = useMemo<string[]>(() => {
		if (!Array.isArray(cfg.preservedMiniBlocks)) {
			return [];
		}
		return cfg.preservedMiniBlocks.map((name) => String(name || '').trim()).filter(Boolean);
	}, [cfg.preservedMiniBlocks]);

	const schemaMiniBlocks = useMemo<string[]>(
		() => Array.from(new Set([...activeMiniBlocks, ...preservedMiniBlocks])),
		[activeMiniBlocks, preservedMiniBlocks]
	);

	const miniBlockDefs = cfg.miniBlockDefs && typeof cfg.miniBlockDefs === 'object' ? cfg.miniBlockDefs : undefined;
	const enableSlashMenu = Boolean(cfg.slashMenu || features.has('slashMenu') || activeMiniBlocks.length > 0);
	const enableBlockHandles = Boolean(features.has('blockHandles'));
	const resolvedPreset = String(cfg.preset || 'editor').trim().toLowerCase() || 'editor';

	const toolbarGroups = useMemo<string[][]>(() => {
		let base: string[][];
		if (Array.isArray(cfg.toolbarGroups)) {
			if (cfg.toolbarGroups.length > 0) {
				base = normalizeToolbarGroups(cfg.toolbarGroups);
			} else if (typeof cfg.toolbar === 'string') {
				base = parseToolbarString(cfg.toolbar, DEFAULT_TOOLBAR);
			} else {
				base = [];
			}
		} else {
			base = parseToolbarString(typeof cfg.toolbar === 'string' ? cfg.toolbar : DEFAULT_TOOLBAR, DEFAULT_TOOLBAR);
		}

		if (activeMiniBlocks.length > 0 && !base.some((g) => g.includes('insertblock'))) {
			const insertGroupIdx = base.findIndex((g) =>
				g.some((tok) => tok === 'link' || tok === 'image' || tok === 'table' || tok === 'hr')
			);
			const existingGroup = insertGroupIdx >= 0 ? base[insertGroupIdx] : undefined;
			if (existingGroup) {
				base[insertGroupIdx] = [...existingGroup, 'insertblock'];
			} else if (base.length > 0) {
				base.push(['insertblock']);
			}
		}

		return base;
	}, [cfg.toolbar, cfg.toolbarGroups, activeMiniBlocks]);

	const bubbleGroups = useMemo<string[][]>(() => {
		if (Array.isArray(cfg.bubbleGroups)) {
			if (cfg.bubbleGroups.length > 0) {
				return normalizeToolbarGroups(cfg.bubbleGroups);
			}
			if (typeof cfg.bubbleToolbar === 'string') {
				return parseToolbarString(cfg.bubbleToolbar, DEFAULT_BUBBLE_TOOLBAR);
			}
			return [];
		}
		const str = typeof cfg.bubbleToolbar === 'string' ? cfg.bubbleToolbar : DEFAULT_BUBBLE_TOOLBAR;
		return parseToolbarString(str, DEFAULT_BUBBLE_TOOLBAR);
	}, [cfg.bubbleToolbar, cfg.bubbleGroups]);

	const isInlineMode = Number(cfg.inlineMode || 0) > 0;
	const showTopToolbar = !isInlineMode && features.has('toolbar') && toolbarGroups.length > 0;
	const isStickyToolbar = features.has('stickybars');
	const showBubbleMenu = (isInlineMode || features.has('bubbleMenu')) && bubbleGroups.length > 0;
	const showStatusbar = features.has('statusbar') || Boolean(merged.showCount);
	const enableSpellcheck = features.has('spellcheck');
	const enablePasteFilter = features.has('pasteFilter');
	const allowSourceCode = features.has('sourceCode');
	const enableImgUpload = features.has('imgUpload');
	const enableImgResize = features.has('imgResize');

	const minHeightPx = useMemo(() => {
		const explicit = Number(cfg.height ?? 0);
		if (explicit > 0) {
			return Math.max(96, Math.min(2000, explicit));
		}
		const rows = Math.max(2, Number(merged.rows ?? 6));
		return Math.max(120, rows * 28);
	}, [cfg.height, merged.rows]);

	const maxHeightPx = useMemo(() => {
		const explicit = Number(cfg.maxHeight ?? 0);
		return explicit > 0 ? Math.max(minHeightPx, Math.min(4000, explicit)) : 0;
	}, [cfg.maxHeight, minHeightPx]);

	const maxLengthLimit = Number(merged.maxLength ?? 0) > 0 ? Number(merged.maxLength) : 0;

	const rawLanguages = Array.isArray(merged.languages) ? merged.languages : [];
	const hasLanguages = rawLanguages.length > 1;
	const defaultLang = rawLanguages.find((l) => l.isDefault) ?? rawLanguages[0];

	const [scalarHtml, setScalarHtml] = useState<string>(() => String(merged.value ?? ''));
	const [langHtmlMap, setLangHtmlMap] = useState<Record<number, string>>(() => {
		const initial: Record<number, string> = {};
		for (const lang of rawLanguages) {
			initial[lang.id] = String(lang.value ?? '');
		}
		return initial;
	});
	const [activeLangId, setActiveLangId] = useState<number>(() =>
		typeof merged.activeLangId === 'number' && merged.activeLangId > 0
			? merged.activeLangId
			: readInitialSyncedLanguageId(rawLanguages)
	);

	// Ensure required optional capability bundles are loaded when mounted directly via JSX/props
	const requiredBundles = useMemo(() => {
		const htmlValues: string[] = [String(merged.value ?? '')];
		for (const lang of rawLanguages) {
			if (lang.value) {
				htmlValues.push(String(lang.value));
			}
		}
		return resolveClientRequiredBundles(cfg, htmlValues);
	}, [cfg, merged.value, rawLanguages]);
	const requiredBundlesKey = requiredBundles.join(',');

	useEffect(() => {
		const missing = requiredBundles.filter((b) => b !== 'core' && !hasTiptapCapability(b));
		if (missing.length > 0) {
			void runtime.ensureTiptapLoaded?.(missing);
			return;
		}
		if (
			typeof document !== 'undefined' &&
			!document.querySelector('link[rel="stylesheet"][href*="TiptapCore.css"]')
		) {
			void runtime.ensureTiptapLoaded?.(['core']);
		}
	}, [requiredBundlesKey]);

	const editorCap = getTiptapCapability('editor');
	const canvasCap = getTiptapCapability('canvas');
	const blocksCap = getTiptapCapability('blocks');
	const dialogsCap = getTiptapCapability('dialogs');

	const [isSourceMode, setIsSourceMode] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [statusMessage, setStatusMessage] = useState('');
	const [hasExternalInput, setHasExternalInput] = useState<boolean>(false);

	const [linkDialogState, setLinkDialogState] = useState<{
		open: boolean;
		initial: LinkDialogInitialState;
	}>({
		open: false,
		initial: {
			isEditing: false,
			href: '',
			text: '',
			canEditText: true,
			title: '',
			target: '',
			rel: '',
			className: '',
		},
	});
	const [imageDialogState, setImageDialogState] = useState<{
		open: boolean;
		pos: number | null;
		attrs: PwImageAttrs | null;
	}>({
		open: false,
		pos: null,
		attrs: null,
	});
	const [anchorDialogState, setAnchorDialogState] = useState<{
		open: boolean;
		pos: number | null;
		initialId: string;
	}>({
		open: false,
		pos: null,
		initialId: '',
	});

	const editorInstanceRef = useRef<Editor | null>(null);
	const surfaceRef = useRef<HTMLDivElement | null>(null);
	const toolbarRef = useRef<HTMLDivElement | null>(null);
	const bubbleToolbarRef = useRef<HTMLDivElement | null>(null);
	const bubbleMenuElRef = useRef<HTMLDivElement | null>(null);
	const bubblePortalRef = useRef<HTMLDivElement | null>(null);
	const pendingSelectionRef = useRef<{ from: number; to: number } | null>(null);
	const hasRenderableBubbleControlsRef = useRef<boolean>(false);
	const bubblePluginKey = useMemo(
		() => new PluginKey(`rwBubbleMenu_${cleanFieldId}_${reactUid}`),
		[cleanFieldId, reactUid]
	);
	const activeLangIdRef = useRef<number>(activeLangId);
	activeLangIdRef.current = activeLangId;

	const activeLangObj = hasLanguages
		? (rawLanguages.find((l) => l.id === activeLangId) ?? defaultLang)
		: undefined;

	const isCurrentLangEditable = Boolean(
		!merged.readOnly && !merged.disabled && (activeLangObj ? activeLangObj.editable !== false : true)
	);
	const isCurrentLangEditableRef = useRef<boolean>(isCurrentLangEditable);
	isCurrentLangEditableRef.current = isCurrentLangEditable;
	const enableImgUploadRef = useRef<boolean>(enableImgUpload);
	enableImgUploadRef.current = enableImgUpload;
	const enableImgResizeRef = useRef<boolean>(enableImgResize);
	enableImgResizeRef.current = enableImgResize;
	const pwContextRef = useRef<TiptapPwContext>(pwContext);
	pwContextRef.current = pwContext;
	const pwImageConfigRef = useRef(pwImageConfig);
	pwImageConfigRef.current = pwImageConfig;

	const activeHtmlValue = hasLanguages ? (langHtmlMap[activeLangId] ?? '') : scalarHtml;

	const announceStatus = useCallback((msg: string) => {
		setStatusMessage('');
		window.requestAnimationFrame(() => {
			setStatusMessage(msg);
		});
	}, []);

	const prefetchDialogs = useCallback(() => {
		if (!hasTiptapCapability('dialogs')) {
			void runtime.ensureTiptapLoaded?.(['dialogs']);
		}
	}, []);

	const ensureDialogsReady = useCallback(async (): Promise<boolean> => {
		if (hasTiptapCapability('dialogs')) {
			return true;
		}
		announceStatus(t('canvas.loadingDialog', 'Loading dialog...'));
		await runtime.ensureTiptapLoaded?.(['dialogs']);
		return hasTiptapCapability('dialogs');
	}, [announceStatus, t]);

	const onEditImageRef = useRef<((pos: number, attrs: PwImageAttrs) => void) | null>(null);
	onEditImageRef.current = (pos: number, attrs: PwImageAttrs) => {
		if (!isCurrentLangEditableRef.current) {
			return;
		}
		void ensureDialogsReady().then((ok) => {
			if (ok) {
				setImageDialogState({ open: true, pos, attrs });
			}
		});
	};

	const onEditAnchorRef = useRef<((pos: number, id: string) => void) | null>(null);
	onEditAnchorRef.current = (pos: number, id: string) => {
		if (!isCurrentLangEditableRef.current) {
			return;
		}
		void ensureDialogsReady().then((ok) => {
			if (ok) {
				setAnchorDialogState({ open: true, pos, initialId: id });
			}
		});
	};

	const onResizeImageServerRef = useRef<
		((pos: number, attrs: PwImageAttrs, nextWidth: number) => void) | null
	>(null);
	onResizeImageServerRef.current = (pos: number, attrs: PwImageAttrs, nextWidth: number) => {
		const ctx = pwContextRef.current;
		if (!ctx.tiptapToken || nextWidth <= 0) {
			return;
		}
		const ownerPid = attrs.pageId || extractPageIdFromAssetSrc(attrs.src) || ctx.pageId || 0;
		const ownerMediaToken =
			attrs.mediaToken || ctx.hostMediaFields?.find((f) => f.isImage)?.mediaToken || '';
		if (ownerPid <= 0 && !ownerMediaToken) {
			return;
		}
		void postTiptapJson<{
			ok: boolean;
			src: string;
			width: number;
			nosize: boolean;
		}>(ctx, {
			action: 'resize',
			pageId: ownerPid > 0 ? ownerPid : undefined,
			mediaToken: ownerMediaToken || undefined,
			file: attrs.src,
			width: nextWidth,
			hidpi: attrs.hidpi ? 1 : 0,
		})
			.then((res) => {
				const ed = editorInstanceRef.current;
				if (!ed || ed.isDestroyed || !res?.src) {
					return;
				}
				const targetNode = ed.state.doc.nodeAt(pos);
				if (targetNode && targetNode.type.name === 'image') {
					const nextAttrs: PwImageAttrs = {
						...(targetNode.attrs as PwImageAttrs),
						src: res.src,
						width: res.width > 0 ? res.width : nextWidth,
						height: null,
						nosize: Boolean(res.nosize),
					};
					ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, nextAttrs));
					announceStatus(t('status.imageUpdated', 'Image updated'));
				}
			})
			.catch(() => {
				// Keep client-side width attribute when variation endpoint declines resize
			});
	};

	const openPwLinkDialogFromEditorRef = useRef<(() => void) | null>(null);
	openPwLinkDialogFromEditorRef.current = () => {
		const ed = editorInstanceRef.current;
		if (!ed || ed.isDestroyed || !isCurrentLangEditableRef.current) {
			return;
		}
		const wasActiveLink = ed.isActive('link');
		if (wasActiveLink && ed.state.selection.empty) {
			ed.chain().extendMarkRange('link').run();
		}
		const { from, to, empty } = ed.state.selection;
		pendingSelectionRef.current = { from, to };

		let hasNonTextInline = false;
		let textBlocksCount = 0;
		ed.state.doc.nodesBetween(from, to, (node) => {
			if (node.isTextblock) {
				textBlocksCount += 1;
			} else if (!node.isText && node.isInline) {
				hasNonTextInline = true;
			}
		});
		const canEditText = empty || (!hasNonTextInline && textBlocksCount <= 1);
		const selectedText = empty ? '' : ed.state.doc.textBetween(from, to, ' ');
		const attrs = ed.getAttributes('link');
		const existingHref = String(attrs?.href || '');
		const isEditing = Boolean(wasActiveLink && existingHref);

		const initialPayload: LinkDialogInitialState = {
			isEditing,
			href: existingHref,
			text: selectedText,
			canEditText,
			title: String(attrs?.title || ''),
			target: String(attrs?.target || ''),
			rel: String(attrs?.rel || ''),
			className: String(attrs?.class || ''),
		};

		if (hasTiptapCapability('dialogs')) {
			setLinkDialogState({ open: true, initial: initialPayload });
			return;
		}
		void ensureDialogsReady().then((ok) => {
			if (ok) {
				setLinkDialogState({ open: true, initial: initialPayload });
			}
		});
	};

	const uploadRasterFilesToEditorRef = useRef<
		((files: File[], insertPos?: number) => boolean) | null
	>(null);
	uploadRasterFilesToEditorRef.current = (files: File[], insertPos?: number): boolean => {
		const ed = editorInstanceRef.current;
		const ctx = pwContextRef.current;
		if (
			!ed ||
			ed.isDestroyed ||
			!isCurrentLangEditableRef.current ||
			!enableImgUploadRef.current ||
			!ctx.tiptapToken ||
			!ed.schema.nodes.image
		) {
			return false;
		}
		const rasterFiles = files.filter(
			(f) => f.type.startsWith('image/') && !f.type.toLowerCase().includes('svg')
		);
		if (rasterFiles.length === 0) {
			return false;
		}
		const hostImgField = ctx.hostMediaFields?.find((f) => f.isImage && !f.noUpload);
		const canUsePage = Boolean(ctx.pageId && ctx.pageId > 0 && ctx.canUploadImages !== false);
		if (!canUsePage && !hostImgField) {
			return false;
		}

		announceStatus(t('image.uploadingImages', 'Uploading image...'));
		void uploadTiptapImages(ctx, rasterFiles, {
			pageId: canUsePage ? ctx.pageId : undefined,
			fieldName: canUsePage ? ctx.uploadFieldName || undefined : hostImgField?.name,
			mediaToken: !canUsePage ? hostImgField?.mediaToken : undefined,
		})
			.then((uploaded) => {
				const liveEd = editorInstanceRef.current;
				if (!liveEd || liveEd.isDestroyed || uploaded.length === 0) {
					return;
				}
				const imgCfg = pwImageConfigRef.current;
				const nodes = uploaded.map((item) => {
					const cappedW =
						imgCfg.maxWidth > 0 && item.width > imgCfg.maxWidth
							? imgCfg.maxWidth
							: item.width > 0
								? item.width
								: null;
					return {
						type: 'image',
						attrs: {
							src: item.url,
							alt: item.description || '',
							width: cappedW,
							hidpi: imgCfg.hidpiDefault,
							nosize: imgCfg.noSizeAttrs,
							pageId: item.pageId,
							mediaToken: item.mediaToken || '',
						} satisfies PwImageAttrs,
					};
				});
				if (typeof insertPos === 'number' && insertPos >= 0 && insertPos <= liveEd.state.doc.content.size) {
					liveEd.chain().focus().insertContentAt(insertPos, nodes).run();
				} else {
					liveEd.chain().focus().insertContent(nodes).run();
				}
				announceStatus(t('status.imageUploaded', 'Image uploaded and inserted'));
			})
			.catch((err) => {
				const errMsg = err instanceof Error ? err.message : String(err);
				announceStatus(
					t('status.imageUploadFailed', { error: errMsg }, 'Image upload failed: {error}')
				);
			});

		return true;
	};

	useEffect(() => {
		if (typeof document === 'undefined') {
			return;
		}
		const probeId = hasLanguages && defaultLang ? defaultLang.inputId : fieldId;
		const existing = probeId ? document.getElementById(probeId) : null;
		setHasExternalInput(Boolean(existing && existing.hasAttribute('data-inertia-input')));
	}, [fieldId, hasLanguages, defaultLang]);

	const lastDispatchedRef = useRef<string>(activeHtmlValue);

	const commitValueUpdate = useCallback(
		(nextRawHtml: string, langOverride?: InputfieldLanguageItem) => {
			const normalized = isRichHtmlEmpty(nextRawHtml) ? '' : nextRawHtml;
			const shouldDispatchDomEvents = !merged.onValueChange;
			lastDispatchedRef.current = normalized;

			if (hasLanguages) {
				const targetLang =
					langOverride ?? rawLanguages.find((l) => l.id === activeLangIdRef.current) ?? defaultLang;
				if (!targetLang) {
					return;
				}
				const targetName =
					targetLang.inputName || (targetLang.isDefault ? fieldName : `${fieldName}__${targetLang.id}`);
				const targetId =
					targetLang.inputId || (targetLang.isDefault ? fieldId : `${fieldId}__${targetLang.id}`);

				setLangHtmlMap((prev) =>
					prev[targetLang.id] === normalized ? prev : { ...prev, [targetLang.id]: normalized }
				);
				syncExternalHiddenInput(targetId, targetName, normalized, shouldDispatchDomEvents);

				if (targetLang.isDefault) {
					setScalarHtml(normalized);
					merged.onValueChange?.(fieldName, normalized);
					merged.onChange?.(normalized);
				} else {
					merged.onValueChange?.(targetName, normalized);
				}
				return;
			}

			setScalarHtml(normalized);
			syncExternalHiddenInput(fieldId, fieldName, normalized, shouldDispatchDomEvents);
			merged.onValueChange?.(fieldName, normalized);
			merged.onChange?.(normalized);
		},
		[hasLanguages, rawLanguages, defaultLang, fieldId, fieldName, merged]
	);

	const commitValueUpdateRef = useRef(commitValueUpdate);
	commitValueUpdateRef.current = commitValueUpdate;

	const slashListboxId = `${fieldId}__slash_listbox`;
	const [activeSlashOptionId, setActiveSlashOptionId] = useState<string | null>(null);
	const [slashState, setSlashState] = useState<SlashCommandState>(CLOSED_SLASH_STATE);
	const setSlashStateRef = useRef<(next: SlashCommandState) => void>((next) => setSlashState(next));
	setSlashStateRef.current = (next: SlashCommandState) => {
		setSlashState((prev) => {
			if (!prev.active && !next.active) {
				return prev;
			}
			if (
				prev.active === next.active &&
				prev.query === next.query &&
				prev.range.from === next.range.from &&
				prev.range.to === next.range.to &&
				prev.context === next.context
			) {
				return prev;
			}
			return next;
		});
	};

	const slashKeyboardBridgeRef = useRef<SlashCommandKeyboardBridge>({
		isOpen: false,
		onKeyDown: () => false,
		dismiss: () => setSlashState(CLOSED_SLASH_STATE),
	});

	const editorCapabilityExtensions = useMemo(
		() =>
			editorCap
				? editorCap.createExtensions({
						imageConfig: pwImageConfig,
						enableImgResizeRef,
						onEditImageRef,
						onResizeImageServerRef,
						onEditAnchorRef,
						t,
					})
				: [],
		[
			editorCap,
			pwImageConfig.alignLeftClass,
			pwImageConfig.alignCenterClass,
			pwImageConfig.alignRightClass,
			pwImageConfig.noSizeAttrs,
			t,
		]
	);

	const miniBlockExtensions = useMemo(
		() => (blocksCap ? blocksCap.createMiniBlockExtensions(miniBlockDefs, schemaMiniBlocks, t) : []),
		[blocksCap, miniBlockDefs, schemaMiniBlocks.join(','), t]
	);

	const slashCommandExtensions = useMemo(
		() =>
			canvasCap
				? [canvasCap.createSlashExtension(enableSlashMenu, setSlashStateRef, slashKeyboardBridgeRef)]
				: [],
		[canvasCap, enableSlashMenu]
	);

	const editorPlaceholder = useMemo(() => {
		if (merged.placeholder) {
			return merged.placeholder;
		}
		if (enableSlashMenu) {
			return t('editor.placeholderSlash', "Write something, or type '/' for blocks...");
		}
		return t('editor.placeholder', 'Write something...');
	}, [merged.placeholder, enableSlashMenu, t]);

	const editor = useEditor(
		{
			immediatelyRender: true,
			editable: isCurrentLangEditable,
			content: activeHtmlValue || '',
			extensions: [
				StarterKit.configure({
					heading: false,
					link: false,
				}),
				createPwHeadingExtension(allowedLevels),
				createPwLinkExtension({ openOnClick: false }),
				Placeholder.configure({
					placeholder: editorPlaceholder,
				}),
				CharacterCount.configure({
					limit: maxLengthLimit > 0 ? maxLengthLimit : null,
				}),
				...editorCapabilityExtensions,
				...miniBlockExtensions,
				...slashCommandExtensions,
			],
			editorProps: {
				attributes: {
					id: editorDomId,
					class: 'rw-tiptap-prose focus:outline-none',
					spellcheck: enableSpellcheck ? 'true' : 'false',
					...(merged.label ? { 'aria-label': merged.label } : {}),
				},
				transformPastedHTML: enablePasteFilter ? sanitizePastedHtml : undefined,
				handleDOMEvents: {
					dblclick: (view, event) => {
						if (!isCurrentLangEditableRef.current) {
							return false;
						}
						const target = event.target instanceof Element ? event.target : null;
						if (!target || target.closest('[data-rw-pw-image]')) {
							return false;
						}
						const linkEl = target.closest('a[href]');
						if (linkEl && view.dom.contains(linkEl)) {
							event.preventDefault();
							const posInfo = view.posAtCoords({
								left: event.clientX,
								top: event.clientY,
							});
							if (posInfo && editorInstanceRef.current) {
								editorInstanceRef.current
									.chain()
									.setTextSelection(posInfo.pos)
									.extendMarkRange('link')
									.run();
							}
							openPwLinkDialogFromEditorRef.current?.();
							return true;
						}
						return false;
					},
					keydown: (_view, event) => {
						if (!isCurrentLangEditableRef.current) {
							return false;
						}
						const key = event.key.toLowerCase();
						if (
							(event.metaKey || event.ctrlKey) &&
							!event.shiftKey &&
							!event.altKey &&
							(key === 'k' || key === 'l')
						) {
							event.preventDefault();
							openPwLinkDialogFromEditorRef.current?.();
							return true;
						}
						return false;
					},
				},
				handleDrop: (view, event, _slice, moved) => {
					if (moved || !event.dataTransfer || event.dataTransfer.files.length === 0) {
						return false;
					}
					const files = Array.from(event.dataTransfer.files);
					const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
					const handled = uploadRasterFilesToEditorRef.current?.(files, coords?.pos);
					if (handled) {
						event.preventDefault();
						return true;
					}
					return false;
				},
				handlePaste: (_view, event) => {
					const dt = event.clipboardData;
					if (!dt || dt.files.length === 0) {
						return false;
					}
					const htmlPayload = dt.getData('text/html');
					if (htmlPayload && htmlPayload.trim() !== '') {
						return false;
					}
					const files = Array.from(dt.files);
					const handled = uploadRasterFilesToEditorRef.current?.(files);
					if (handled) {
						event.preventDefault();
						return true;
					}
					return false;
				},
			},
			onUpdate: ({ editor: ed }) => {
				commitValueUpdateRef.current(ed.getHTML());
			},
		},
		[
			allowedLevels.join(','),
			enableSpellcheck,
			enablePasteFilter,
			maxLengthLimit,
			Boolean(editorCap),
			Boolean(canvasCap),
			Boolean(blocksCap),
			schemaMiniBlocks.join(','),
			enableSlashMenu,
			pwImageConfig.alignLeftClass,
			pwImageConfig.alignCenterClass,
			pwImageConfig.alignRightClass,
			pwImageConfig.noSizeAttrs,
		]
	);
	editorInstanceRef.current = editor;

	const snapshot =
		useEditorState({
			editor,
			selector: ({ editor: ed }) => selectToolbarSnapshot(ed),
		}) ?? EMPTY_SNAPSHOT;

	useEffect(() => {
		if (editor && !editor.isDestroyed && editor.isEditable !== isCurrentLangEditable) {
			editor.setEditable(isCurrentLangEditable);
		}
	}, [editor, isCurrentLangEditable]);

	useEffect(() => {
		if (!editor || editor.isDestroyed) {
			return;
		}
		const dom = editor.view.dom as HTMLElement;
		if (slashState.active && activeSlashOptionId) {
			dom.setAttribute('role', 'combobox');
			dom.setAttribute('aria-haspopup', 'listbox');
			dom.setAttribute('aria-controls', slashListboxId);
			dom.setAttribute('aria-expanded', 'true');
			dom.setAttribute('aria-activedescendant', activeSlashOptionId);
		} else {
			dom.removeAttribute('role');
			dom.removeAttribute('aria-haspopup');
			dom.removeAttribute('aria-controls');
			dom.removeAttribute('aria-expanded');
			dom.removeAttribute('aria-activedescendant');
		}
	}, [editor, slashState.active, slashListboxId, activeSlashOptionId]);

	useEffect(() => {
		if (hasLanguages || merged.value === undefined) {
			return;
		}
		const incoming = String(merged.value ?? '');
		if (incoming === lastDispatchedRef.current) {
			return;
		}
		lastDispatchedRef.current = incoming;
		setScalarHtml(incoming);
		if (editor && !editor.isDestroyed && editor.getHTML() !== incoming) {
			editor.commands.setContent(incoming || '', { emitUpdate: false });
		}
	}, [merged.value, hasLanguages, editor]);

	useEffect(() => {
		if (!hasLanguages || !Array.isArray(merged.languages)) {
			return;
		}
		setLangHtmlMap((prev) => {
			let changed = false;
			const next = { ...prev };
			for (const lang of merged.languages || []) {
				const incoming = String(lang.value ?? '');
				if (lang.id === activeLangIdRef.current && incoming === lastDispatchedRef.current) {
					continue;
				}
				if (next[lang.id] !== incoming) {
					next[lang.id] = incoming;
					changed = true;
					if (lang.id === activeLangIdRef.current && editor && !editor.isDestroyed) {
						editor.commands.setContent(incoming || '', { emitUpdate: false });
					}
				}
			}
			return changed ? next : prev;
		});
	}, [merged.languages, hasLanguages, editor]);

	useEffect(() => {
		if (!isFullscreen) {
			return;
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				if (
					typeof document !== 'undefined' &&
					document.querySelector('dialog[data-rw-tiptap-dialog][open]')
				) {
					return;
				}
				setIsFullscreen(false);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [isFullscreen]);

	useToolbarRovingFallback(toolbarRef, `${toolbarGroups.map((g) => g.join('.')).join('|')}:${isSourceMode}`);
	useToolbarRovingFallback(
		bubbleToolbarRef,
		`${bubbleGroups.map((g) => g.join('.')).join('|')}:${isSourceMode}`
	);

	const getBubblePortal = useCallback((): HTMLElement => {
		if (bubblePortalRef.current && bubblePortalRef.current.isConnected) {
			return bubblePortalRef.current;
		}
		const portal = document.createElement('div');
		portal.setAttribute('data-rw-tiptap-bubble-portal', '');
		portal.style.cssText =
			'position:fixed;inset:0;overflow:visible;z-index:1060;pointer-events:none;';
		document.body.appendChild(portal);
		bubblePortalRef.current = portal;
		return portal;
	}, []);

	const getBubbleReferenceVirtualElement = useCallback(() => {
		if (!editor || editor.isDestroyed || typeof window === 'undefined') {
			return null;
		}
		const domView = editor.view;
		const domSelection = window.getSelection();
		if (domSelection && domSelection.rangeCount > 0 && !domSelection.isCollapsed) {
			const range = domSelection.getRangeAt(0);
			if (
				domView.dom.contains(range.commonAncestorContainer) ||
				(domSelection.anchorNode && domView.dom.contains(domSelection.anchorNode)) ||
				(domSelection.focusNode && domView.dom.contains(domSelection.focusNode))
			) {
				const clientRects = Array.from(range.getClientRects()).filter(
					(rect) => rect.width > 0 || rect.height > 0
				);
				if (clientRects.length > 0) {
					const top = Math.min(...clientRects.map((r) => r.top));
					const bottom = Math.max(...clientRects.map((r) => r.bottom));
					const left = Math.min(...clientRects.map((r) => r.left));
					const right = Math.max(...clientRects.map((r) => r.right));
					const combined = new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
					return {
						getBoundingClientRect: () => combined,
						getClientRects: () => clientRects,
					};
				}
			}
		}

		const { state } = domView;
		const maxPos = state.doc.content.size;
		if (maxPos <= 0) {
			return null;
		}
		const rawRange =
			!state.selection.empty
				? { from: state.selection.from, to: state.selection.to }
				: pendingSelectionRef.current;
		if (!rawRange || rawRange.from >= rawRange.to) {
			return null;
		}
		const clampedFrom = Math.max(1, Math.min(maxPos, rawRange.from));
		const clampedTo = Math.max(clampedFrom, Math.min(Math.max(1, maxPos - 1), rawRange.to));
		const fallbackRect = posToDOMRect(domView, clampedFrom, clampedTo);
		return {
			getBoundingClientRect: () => fallbackRect,
			getClientRects: () => [fallbackRect],
		};
	}, [editor]);

	useEffect(() => {
		return () => {
			if (bubblePortalRef.current) {
				bubblePortalRef.current.remove();
				bubblePortalRef.current = null;
			}
		};
	}, []);

	const isSourceModeRef = useRef(isSourceMode);
	isSourceModeRef.current = isSourceMode;
	const slashActiveRef = useRef(slashState.active);
	slashActiveRef.current = slashState.active;
	const anyDialogOpen = linkDialogState.open || imageDialogState.open || anchorDialogState.open;
	const anyDialogOpenRef = useRef(anyDialogOpen);
	anyDialogOpenRef.current = anyDialogOpen;

	const bubbleShouldShow = useCallback(
		({
			editor: ed,
			element,
			view,
			state,
			from,
			to,
		}: {
			editor: Editor;
			element: HTMLElement;
			view: { dom: HTMLElement; hasFocus: () => boolean };
			state: Editor['state'];
			from: number;
			to: number;
		}): boolean => {
			if (!ed.isEditable || isSourceModeRef.current || slashActiveRef.current || anyDialogOpenRef.current) {
				return false;
			}
			const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
			const focusInsideMenu = Boolean(activeEl && element.contains(activeEl));
			if (!hasRenderableBubbleControlsRef.current) {
				return false;
			}
			const { doc, selection } = state;
			if (selection.empty || selection instanceof NodeSelection || ed.isActive('codeBlock')) {
				return false;
			}
			if (doc.textBetween(from, to, ' ').length === 0) {
				return false;
			}
			if (view.hasFocus() || focusInsideMenu) {
				return true;
			}
			const domSelection = typeof window !== 'undefined' ? window.getSelection() : null;
			return Boolean(
				domSelection &&
					!domSelection.isCollapsed &&
					((domSelection.anchorNode && view.dom.contains(domSelection.anchorNode)) ||
						(domSelection.focusNode && view.dom.contains(domSelection.focusNode)))
			);
		},
		[]
	);

	const bubbleMenuOptions = useMemo(
		() => ({
			strategy: 'fixed' as const,
			placement: 'top' as const,
			offset: 8,
			flip: { padding: 12 },
			shift: { padding: 12 },
			hide: { strategy: 'referenceHidden' as const },
		}),
		[]
	);

	useEffect(() => {
		if (!showBubbleMenu || !editor || editor.isDestroyed || typeof window === 'undefined') {
			return;
		}
		let rafId = 0;
		const onScrollCapture = () => {
			if (!bubbleMenuElRef.current?.isConnected || editor.isDestroyed) {
				return;
			}
			if (rafId) {
				return;
			}
			rafId = window.requestAnimationFrame(() => {
				rafId = 0;
				if (!editor.isDestroyed && bubbleMenuElRef.current?.isConnected) {
					editor.view.dispatch(editor.state.tr.setMeta(bubblePluginKey, 'updatePosition'));
				}
			});
		};
		window.addEventListener('scroll', onScrollCapture, { capture: true, passive: true });
		return () => {
			window.removeEventListener('scroll', onScrollCapture, true);
			if (rafId) {
				window.cancelAnimationFrame(rafId);
			}
		};
	}, [showBubbleMenu, editor, bubblePluginKey]);

	useEffect(() => {
		if (!showBubbleMenu || !editor || editor.isDestroyed || typeof document === 'undefined') {
			return;
		}
		const onPointerDown = (event: MouseEvent) => {
			const menuEl = bubbleMenuElRef.current;
			if (!menuEl || !menuEl.isConnected || editor.isDestroyed) {
				return;
			}
			const target = event.target as Node | null;
			if (target && (menuEl.contains(target) || editor.view.dom.contains(target))) {
				return;
			}
			editor.view.dispatch(editor.state.tr.setMeta(bubblePluginKey, 'hide'));
		};
		document.addEventListener('mousedown', onPointerDown, true);
		return () => document.removeEventListener('mousedown', onPointerDown, true);
	}, [showBubbleMenu, editor, bubblePluginKey]);

	const handleSelectLanguage = useCallback(
		(nextLangId: number, notifyParent = true) => {
			if (nextLangId === activeLangIdRef.current) {
				return;
			}
			const nextHtml = langHtmlMap[nextLangId] ?? '';
			activeLangIdRef.current = nextLangId;
			lastDispatchedRef.current = nextHtml;
			setActiveLangId(nextLangId);
			if (editor && !editor.isDestroyed) {
				editor.commands.setContent(nextHtml || '', { emitUpdate: false });
			}
			if (notifyParent) {
				merged.onSelectLanguage?.(nextLangId);
			}
		},
		[editor, langHtmlMap, merged.onSelectLanguage]
	);

	useEffect(() => {
		if (
			hasLanguages &&
			typeof merged.activeLangId === 'number' &&
			merged.activeLangId > 0 &&
			merged.activeLangId !== activeLangIdRef.current &&
			rawLanguages.some((l) => l.id === merged.activeLangId)
		) {
			handleSelectLanguage(merged.activeLangId, false);
		}
	}, [hasLanguages, merged.activeLangId, rawLanguages, handleSelectLanguage]);

	useEffect(() => {
		if (!hasLanguages || typeof window === 'undefined') {
			return;
		}
		ensureNativeLanguageTabsBridge();
		const onSelectAll = (event: Event) => {
			const detail = (
				event as CustomEvent<{
					langId: number;
					scope?: Element | null;
					form?: HTMLFormElement | null;
				}>
			).detail;
			if (!detail || typeof detail.langId !== 'number') {
				return;
			}
			const hostEl =
				typeof document !== 'undefined'
					? document.getElementById(scopeId) || document.getElementById(`${scopeId}-wrap`)
					: null;
			const ownForm = resolveLanguageSyncScope(hostEl);
			const incomingForm =
				detail.form ?? (detail.scope instanceof HTMLFormElement ? detail.scope : null);
			if (incomingForm && ownForm && incomingForm !== ownForm) {
				return;
			}
			if (rawLanguages.some((l) => l.id === detail.langId)) {
				handleSelectLanguage(detail.langId, true);
			}
		};
		window.addEventListener(LANGUAGE_SELECT_ALL_EVENT, onSelectAll);
		return () => window.removeEventListener(LANGUAGE_SELECT_ALL_EVENT, onSelectAll);
	}, [hasLanguages, rawLanguages, scopeId, handleSelectLanguage]);

	const handleCopyFromDefaultLanguage = () => {
		if (!hasLanguages || !defaultLang || !activeLangObj || activeLangObj.isDefault || !isCurrentLangEditable) {
			return;
		}
		const sourceHtml = langHtmlMap[defaultLang.id] ?? '';
		if (!sourceHtml.trim()) {
			return;
		}
		if (editor && !editor.isDestroyed) {
			editor.commands.setContent(sourceHtml, { emitUpdate: false });
		}
		commitValueUpdate(sourceHtml, activeLangObj);
		announceStatus(
			t('editor.copiedFromLanguage', { language: defaultLang.title }, 'Copied content from {language}')
		);
	};

	const handleToggleSourceMode = () => {
		if (!allowSourceCode && !toolbarGroups.some((g) => g.includes('source'))) {
			return;
		}
		if (isSourceMode) {
			if (editor && !editor.isDestroyed) {
				const cleaned = enablePasteFilter ? sanitizePastedHtml(activeHtmlValue) : activeHtmlValue;
				editor.commands.setContent(cleaned || '', { emitUpdate: false });
				commitValueUpdate(editor.getHTML());
			}
			setIsSourceMode(false);
			announceStatus(t('status.switchedRichText', 'Switched to rich text view'));
		} else {
			if (editor && !editor.isDestroyed) {
				commitValueUpdate(editor.getHTML());
			}
			setIsSourceMode(true);
			announceStatus(t('status.switchedSource', 'Switched to HTML source view'));
		}
	};

	const focusEditorSynchronously = useCallback((ed: Editor) => {
		(ed.view.dom as HTMLElement).focus({ preventScroll: true });
		ed.view.focus();
	}, []);

	const hideBubbleMenu = useCallback(() => {
		if (editor && !editor.isDestroyed && bubbleMenuElRef.current?.isConnected) {
			editor.view.dispatch(editor.state.tr.setMeta(bubblePluginKey, 'hide'));
		}
	}, [editor, bubblePluginKey]);

	useEffect(() => {
		if (anyDialogOpen) {
			hideBubbleMenu();
		}
	}, [anyDialogOpen, hideBubbleMenu]);

	const openLinkPanel = (source: ToolbarSource = 'top') => {
		if (!editor || !isCurrentLangEditable) {
			return;
		}
		if (source === 'bubble') {
			hideBubbleMenu();
		}
		openPwLinkDialogFromEditorRef.current?.();
	};

	const openImagePanel = (source: ToolbarSource = 'top') => {
		if (!editor || !isCurrentLangEditable) {
			return;
		}
		if (source === 'bubble') {
			hideBubbleMenu();
		}
		pendingSelectionRef.current = {
			from: editor.state.selection.from,
			to: editor.state.selection.to,
		};
		const sel = editor.state.selection;
		const imgNodeSel =
			sel instanceof NodeSelection && sel.node.type.name === 'image' ? sel : null;
		const imgPos = imgNodeSel ? imgNodeSel.from : null;
		const imgAttrs = imgNodeSel ? (imgNodeSel.node.attrs as PwImageAttrs) : null;

		if (hasTiptapCapability('dialogs')) {
			setImageDialogState({ open: true, pos: imgPos, attrs: imgAttrs });
			return;
		}
		void ensureDialogsReady().then((ok) => {
			if (ok) {
				setImageDialogState({ open: true, pos: imgPos, attrs: imgAttrs });
			}
		});
	};

	const openAnchorDialog = () => {
		if (!editor || !isCurrentLangEditable) {
			return;
		}
		pendingSelectionRef.current = {
			from: editor.state.selection.from,
			to: editor.state.selection.to,
		};
		const sel = editor.state.selection;
		const anchorNodeSel =
			sel instanceof NodeSelection && sel.node.type.name === 'pwAnchor' ? sel : null;
		const pos = anchorNodeSel ? anchorNodeSel.from : null;
		const initialId = anchorNodeSel ? String(anchorNodeSel.node.attrs?.id || '') : '';

		if (hasTiptapCapability('dialogs')) {
			setAnchorDialogState({ open: true, pos, initialId });
			return;
		}
		void ensureDialogsReady().then((ok) => {
			if (ok) {
				setAnchorDialogState({ open: true, pos, initialId });
			}
		});
	};

	const handleLinkDialogSubmit = (payload: LinkDialogSubmitPayload) => {
		if (!editor || editor.isDestroyed || !isCurrentLangEditable) {
			return;
		}
		const savedRange = pendingSelectionRef.current;
		const markAttrs = {
			href: payload.href,
			target: payload.target || null,
			rel: payload.rel || null,
			title: payload.title || null,
			class: payload.className || null,
		};

		focusEditorSynchronously(editor);

		if (!savedRange || savedRange.from === savedRange.to) {
			if (editor.isActive('link')) {
				if (payload.textChanged) {
					editor
						.chain()
						.focus()
						.extendMarkRange('link')
						.insertContent({
							type: 'text',
							text: payload.text,
							marks: [{ type: 'link', attrs: markAttrs }],
						})
						.run();
				} else {
					editor.chain().focus().extendMarkRange('link').setLink(markAttrs).run();
				}
			} else {
				editor
					.chain()
					.focus()
					.insertContent({
						type: 'text',
						text: payload.text || payload.href,
						marks: [{ type: 'link', attrs: markAttrs }],
					})
					.run();
			}
		} else if (payload.textChanged) {
			editor
				.chain()
				.focus()
				.insertContentAt(
					{ from: savedRange.from, to: savedRange.to },
					{
						type: 'text',
						text: payload.text,
						marks: [{ type: 'link', attrs: markAttrs }],
					}
				)
				.run();
		} else {
			editor
				.chain()
				.focus()
				.setTextSelection(savedRange)
				.extendMarkRange('link')
				.setLink(markAttrs)
				.run();
		}

		announceStatus(t('status.linkApplied', 'Link applied'));
	};

	const handleLinkDialogUnlink = () => {
		if (!editor || editor.isDestroyed || !isCurrentLangEditable) {
			return;
		}
		const savedRange = pendingSelectionRef.current;
		focusEditorSynchronously(editor);
		const chain = editor.chain().focus();
		if (savedRange && savedRange.from < savedRange.to) {
			chain.setTextSelection(savedRange);
		}
		chain.extendMarkRange('link').unsetLink().run();
		announceStatus(t('status.linkRemoved', 'Link removed'));
	};

	const handleImageDialogConfirm = (attrs: PwImageAttrs, editingPos: number | null) => {
		if (!editor || editor.isDestroyed || !isCurrentLangEditable) {
			return;
		}
		focusEditorSynchronously(editor);
		if (editingPos !== null) {
			const existingNode = editor.state.doc.nodeAt(editingPos);
			if (existingNode && existingNode.type.name === 'image') {
				editor.view.dispatch(editor.state.tr.setNodeMarkup(editingPos, undefined, attrs));
				announceStatus(t('status.imageUpdated', 'Image updated'));
				return;
			}
		}
		const savedRange = pendingSelectionRef.current;
		const chain = editor.chain().focus();
		if (savedRange && savedRange.from >= 0 && savedRange.to <= editor.state.doc.content.size) {
			chain.setTextSelection(savedRange);
		}
		chain.insertContent({ type: 'image', attrs }).run();
		announceStatus(t('status.imageInserted', 'Image inserted'));
	};

	const handleAnchorDialogSubmit = (id: string) => {
		if (!editor || editor.isDestroyed || !isCurrentLangEditable) {
			return;
		}
		focusEditorSynchronously(editor);
		if (anchorDialogState.pos !== null) {
			const nodeAtPos = editor.state.doc.nodeAt(anchorDialogState.pos);
			if (nodeAtPos && nodeAtPos.type.name === 'pwAnchor') {
				editor.view.dispatch(
					editor.state.tr.setNodeMarkup(anchorDialogState.pos, undefined, { id })
				);
				announceStatus(t('status.anchorInserted', 'Named anchor inserted'));
				return;
			}
		}
		const savedRange = pendingSelectionRef.current;
		const chain = editor.chain().focus();
		if (savedRange && savedRange.from >= 0 && savedRange.from <= editor.state.doc.content.size) {
			chain.setTextSelection(savedRange.from);
		}
		chain.insertContent({ type: 'pwAnchor', attrs: { id } }).run();
		announceStatus(t('status.anchorInserted', 'Named anchor inserted'));
	};

	const handleAnchorDialogRemove = () => {
		if (!editor || editor.isDestroyed || !isCurrentLangEditable || anchorDialogState.pos === null) {
			return;
		}
		focusEditorSynchronously(editor);
		const nodeAtPos = editor.state.doc.nodeAt(anchorDialogState.pos);
		if (nodeAtPos && nodeAtPos.type.name === 'pwAnchor') {
			editor.view.dispatch(
				editor.state.tr.delete(anchorDialogState.pos, anchorDialogState.pos + nodeAtPos.nodeSize)
			);
			announceStatus(t('status.anchorRemoved', 'Named anchor removed'));
		}
	};

	const tiptapLangTabValues = useMemo<Record<number, string>>(() => {
		if (!hasLanguages) {
			return {};
		}
		const map: Record<number, string> = {};
		for (const lang of rawLanguages) {
			map[lang.id] = isRichHtmlEmpty(langHtmlMap[lang.id] ?? '') ? '' : '1';
		}
		return map;
	}, [hasLanguages, rawLanguages, langHtmlMap]);

	if (merged.readOnly) {
		if (!hasLanguages) {
			return (
				<div data-rw-control="tiptap" data-rw-tiptap-readonly="1">
					<ReadOnlyHtmlSurface
						html={scalarHtml}
						extraCSS={safeExtraCss}
						scopeId={scopeId}
						miniBlocks={schemaMiniBlocks}
						miniBlockDefs={miniBlockDefs}
						t={t}
					/>
				</div>
			);
		}

		return (
			<div
				id={`${scopeId}-wrap`}
				data-rw-control="tiptap"
				data-rw-tiptap-readonly="1"
				className="min-w-0 space-y-1.5"
			>
				{!merged.hideLanguageTabs ? (
					<LanguageTabsBar
						languages={rawLanguages}
						activeLangId={activeLangId}
						values={tiptapLangTabValues}
						onSelect={(langId) => handleSelectLanguage(langId)}
						ariaLabel={t('editor.languageTabs', 'Language tabs')}
						dataAttributes={{ 'data-rw-tiptap-lang-tabs': '' }}
					/>
				) : null}
				<ReadOnlyHtmlSurface
					html={langHtmlMap[activeLangId] ?? ''}
					extraCSS={safeExtraCss}
					scopeId={scopeId}
					miniBlocks={schemaMiniBlocks}
					miniBlockDefs={miniBlockDefs}
					t={t}
				/>
			</div>
		);
	}

	const canOfferCopyDefault = Boolean(
		hasLanguages &&
			defaultLang &&
			activeLangObj &&
			!activeLangObj.isDefault &&
			isCurrentLangEditable &&
			isRichHtmlEmpty(langHtmlMap[activeLangId] ?? '') &&
			!isRichHtmlEmpty(langHtmlMap[defaultLang.id] ?? '')
	);

	const effectiveWords = isSourceMode ? plainWordCount(activeHtmlValue) : snapshot.words;
	const effectiveCharacters = isSourceMode ? plainTextLength(activeHtmlValue) : snapshot.characters;

	const renderToolbar = (groups: string[][], prefix: string, source: ToolbarSource) =>
		renderTiptapToolbarGroups({
			editor,
			groups,
			prefix,
			source,
			snapshot,
			allowedLevels,
			isCurrentLangEditable,
			isSourceMode,
			isFullscreen,
			allowSourceCode,
			linkDialogOpen: linkDialogState.open,
			imageDialogOpen: imageDialogState.open,
			anchorDialogOpen: anchorDialogState.open,
			activeMiniBlocks,
			miniBlockDefs,
			onOpenLink: openLinkPanel,
			onOpenImage: openImagePanel,
			onOpenAnchor: openAnchorDialog,
			onToggleSourceMode: handleToggleSourceMode,
			onToggleFullscreen: () => setIsFullscreen((prev) => !prev),
			onPrefetchDialogs: prefetchDialogs,
			onAnnounce: announceStatus,
			t,
		});

	const renderedBubbleToolbar =
		showBubbleMenu && editor && isCurrentLangEditable && !isSourceMode
			? renderToolbar(bubbleGroups, 'bubble', 'bubble')
			: [];
	hasRenderableBubbleControlsRef.current = renderedBubbleToolbar.length > 0;
	const canMountBubbleMenu =
		showBubbleMenu &&
		Boolean(editor) &&
		Boolean(canvasCap) &&
		isCurrentLangEditable &&
		!isSourceMode &&
		renderedBubbleToolbar.length > 0;

	const TableControlsBar = editorCap?.TableControlsBar;
	const BubbleMenuPortal = canvasCap?.BubbleMenuPortal;
	const SlashCommandPalette = canvasCap?.SlashCommandPalette;
	const BlockHandleOverlay = canvasCap?.BlockHandleOverlay;
	const showBlockHandles = Boolean(enableBlockHandles && canvasCap && isCurrentLangEditable && !isSourceMode);

	return (
		<div
			id={scopeId}
			className={cn(
				'min-w-0 space-y-1.5',
				isFullscreen &&
					'fixed inset-0 z-50 flex flex-col bg-background/98 p-4 sm:p-6 backdrop-blur-xs overflow-y-auto'
			)}
			data-rw-control="tiptap"
			data-rw-prose-root=""
			data-rw-tiptap-field={fieldName}
			data-rw-tiptap-preset={resolvedPreset}
			data-rw-tiptap-inline={isInlineMode ? '1' : '0'}
		>
			{safeExtraCss ? <style>{`#${scopeId} .rw-tiptap-prose { ${safeExtraCss} }`}</style> : null}

			<p role="status" aria-live="polite" className="sr-only" data-rw-tiptap-status="">
				{statusMessage}
			</p>

			{!hasExternalInput ? (
				hasLanguages ? (
					rawLanguages.map((lang) => {
						const tName = lang.inputName || (lang.isDefault ? fieldName : `${fieldName}__${lang.id}`);
						const tId = lang.inputId || (lang.isDefault ? fieldId : `${fieldId}__${lang.id}`);
						return (
							<textarea
								key={`hidden-${lang.id}`}
								id={tId}
								name={tName}
								value={langHtmlMap[lang.id] ?? ''}
								readOnly
								hidden
								aria-hidden="true"
								tabIndex={-1}
							/>
						);
					})
				) : (
					<textarea
						id={fieldId}
						name={fieldName}
						value={scalarHtml}
						readOnly
						hidden
						aria-hidden="true"
						tabIndex={-1}
					/>
				)
			) : null}

			{hasLanguages && (!merged.hideLanguageTabs || isFullscreen || canOfferCopyDefault) ? (
				!merged.hideLanguageTabs || isFullscreen ? (
					<LanguageTabsBar
						languages={rawLanguages}
						activeLangId={activeLangId}
						values={tiptapLangTabValues}
						onSelect={(langId) => handleSelectLanguage(langId)}
						ariaLabel={t('editor.languageTabs', 'Language tabs')}
						dataAttributes={{ 'data-rw-tiptap-lang-tabs': '' }}
						rightSlot={
							canOfferCopyDefault || isFullscreen ? (
								<>
									{canOfferCopyDefault && defaultLang ? (
										<Button
											type="button"
											variant="outline"
											size="xs"
											onClick={handleCopyFromDefaultLanguage}
											data-rw-tiptap-copy-default=""
										>
											{t('editor.copyLanguage', { language: defaultLang.title }, 'Copy {language}')}
										</Button>
									) : null}
									{isFullscreen ? (
										<Button
											type="button"
											variant="outline"
											size="xs"
											onClick={() => setIsFullscreen(false)}
										>
											{t('tools.exitFullscreenButton', 'Exit Fullscreen')}
										</Button>
									) : null}
								</>
							) : undefined
						}
					/>
				) : (
					<div className="flex items-center justify-end gap-2">
						{canOfferCopyDefault && defaultLang ? (
							<Button
								type="button"
								variant="outline"
								size="xs"
								onClick={handleCopyFromDefaultLanguage}
								data-rw-tiptap-copy-default=""
							>
								{t('editor.copyLanguage', { language: defaultLang.title }, 'Copy {language}')}
							</Button>
						) : null}
					</div>
				)
			) : isFullscreen ? (
				<div className="flex items-center justify-end">
					<Button type="button" variant="outline" size="xs" onClick={() => setIsFullscreen(false)}>
						{t('tools.exitFullscreenButton', 'Exit Fullscreen')}
					</Button>
				</div>
			) : null}

			<div
				className={cn(
					'min-w-0 flex flex-col transition-colors',
					isInlineMode
						? 'rounded-md border border-border/60 bg-transparent hover:border-border focus-within:border-ring'
						: 'rounded-lg border border-border bg-background shadow-2xs focus-within:border-ring/70',
					merged.disabled && 'opacity-60 pointer-events-none',
					isFullscreen && 'flex-1 min-h-0'
				)}
			>
				{showTopToolbar ? (
					<div
						ref={toolbarRef}
						role="toolbar"
						aria-label={t('editor.formattingToolbar', 'Rich text formatting')}
						aria-controls={!isSourceMode ? editorDomId : undefined}
						data-rw-tiptap-toolbar=""
						{...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
						className={cn(
							'flex flex-wrap items-center gap-1 border-b border-border bg-muted/25 px-2 py-1.5 rounded-t-lg',
							isStickyToolbar && 'sticky top-0 z-20 backdrop-blur-xs bg-background/92'
						)}
					>
						{renderToolbar(toolbarGroups, 'top', 'top')}
					</div>
				) : null}

				{snapshot.inTable && isCurrentLangEditable && !isSourceMode && editor && TableControlsBar ? (
					<TableControlsBar editor={editor} t={t} onAnnounce={announceStatus} />
				) : null}

				{canMountBubbleMenu && editor && BubbleMenuPortal ? (
					<BubbleMenuPortal
						editor={editor}
						pluginKey={bubblePluginKey}
						getBubblePortal={getBubblePortal}
						getBubbleReferenceVirtualElement={getBubbleReferenceVirtualElement}
						bubbleShouldShow={bubbleShouldShow}
						bubbleMenuOptions={bubbleMenuOptions}
						bubbleToolbarRef={bubbleToolbarRef}
						bubbleMenuElRef={bubbleMenuElRef}
						editorDomId={editorDomId}
						focusEditorSynchronously={focusEditorSynchronously}
						t={t}
					>
						{renderedBubbleToolbar}
					</BubbleMenuPortal>
				) : null}

				{isSourceMode ? (
					<div className="p-2 flex-1" data-rw-tiptap-source-view="">
						<Textarea
							aria-label={t('tools.source', 'HTML source code')}
							value={activeHtmlValue}
							readOnly={!isCurrentLangEditable}
							rows={Math.max(6, Math.round(minHeightPx / 24))}
							onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
								commitValueUpdate(e.target.value);
							}}
							className="font-mono text-xs leading-relaxed min-h-40"
							data-rw-tiptap-source-textarea=""
						/>
					</div>
				) : (
					<div
						ref={surfaceRef}
						onClick={(e) => {
							if (!editor || !isCurrentLangEditable) {
								return;
							}
							const targetNode = e.target as Node | null;
							if (targetNode && editor.view.dom.contains(targetNode)) {
								return;
							}
							if (
								targetNode instanceof Element &&
								targetNode.closest(
									'[data-rw-tiptap-slash-palette], [data-rw-tiptap-bubble-menu], [data-rw-tiptap-block-gutter], [data-rw-tiptap-block-menu], button, input, select, textarea, a'
								)
							) {
								return;
							}
							const domSelection = typeof window !== 'undefined' ? window.getSelection() : null;
							if (!editor.state.selection.empty || (domSelection && !domSelection.isCollapsed)) {
								return;
							}
							editor.commands.focus('end');
						}}
						style={{
							minHeight: isFullscreen ? '320px' : `${minHeightPx}px`,
							...(maxHeightPx > 0 && !isFullscreen
								? { maxHeight: `${maxHeightPx}px`, overflowY: 'auto' as const }
								: {}),
						}}
						className={cn(
							'flex flex-1 flex-col cursor-text',
							!isCurrentLangEditable && 'bg-muted/25 cursor-default'
						)}
						data-rw-tiptap-surface=""
						data-rw-tiptap-handles={showBlockHandles ? '1' : undefined}
					>
						{showBlockHandles && editor && BlockHandleOverlay ? (
							<BlockHandleOverlay
								editor={editor}
								surfaceRef={surfaceRef}
								allowedHeadings={allowedLevels}
								enableSlashMenu={enableSlashMenu}
								t={t}
								onAnnounce={announceStatus}
							/>
						) : null}

						<EditorContent editor={editor} className="rw-tiptap-prose" />

						{enableSlashMenu && isCurrentLangEditable && editor && SlashCommandPalette ? (
							<SlashCommandPalette
								editor={editor}
								slashState={slashState}
								miniBlockDefs={miniBlockDefs}
								activeMiniBlocks={activeMiniBlocks}
								allowedHeadings={allowedLevels}
								keyboardBridgeRef={slashKeyboardBridgeRef}
								listboxId={slashListboxId}
								onActiveOptionChange={setActiveSlashOptionId}
								t={t}
								onAnnounce={announceStatus}
							/>
						) : null}
					</div>
				)}

				{showStatusbar ? (
					<TiptapStatusbar
						words={effectiveWords}
						characters={effectiveCharacters}
						maxLengthLimit={maxLengthLimit}
						isCurrentLangEditable={isCurrentLangEditable}
						isSourceMode={isSourceMode}
						t={t}
					/>
				) : null}
			</div>

			{dialogsCap ? (
				<>
					<dialogsCap.TiptapLinkDialog
						open={linkDialogState.open}
						initial={linkDialogState.initial}
						pwContext={pwContext}
						linkConfig={pwLinkConfig}
						anchors={linkDialogState.open ? extractDocumentAnchors(editor) : []}
						langId={hasLanguages ? activeLangId : undefined}
						onClose={() => setLinkDialogState((prev) => ({ ...prev, open: false }))}
						onSubmit={handleLinkDialogSubmit}
						onUnlink={handleLinkDialogUnlink}
						t={t}
					/>

					<dialogsCap.TiptapImageDialog
						open={imageDialogState.open}
						editingPos={imageDialogState.pos}
						initialAttrs={imageDialogState.attrs}
						pwContext={pwContext}
						imageConfig={pwImageConfig}
						langId={hasLanguages ? activeLangId : undefined}
						onClose={() => setImageDialogState({ open: false, pos: null, attrs: null })}
						onConfirm={handleImageDialogConfirm}
						t={t}
					/>

					<dialogsCap.TiptapAnchorDialog
						open={anchorDialogState.open}
						initialId={anchorDialogState.initialId}
						isEditing={anchorDialogState.pos !== null}
						onClose={() => setAnchorDialogState({ open: false, pos: null, initialId: '' })}
						onSubmit={handleAnchorDialogSubmit}
						onRemove={handleAnchorDialogRemove}
						t={t}
					/>
				</>
			) : null}
		</div>
	);
}
