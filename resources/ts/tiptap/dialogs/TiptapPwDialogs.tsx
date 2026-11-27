/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { getReactWorkspaceRuntime } from '../../runtime';
import { getReactTiptapRuntime } from '../core/tiptapRuntime';
import type {
	LinkDialogInitialState,
	LinkDialogSubmitPayload,
	PwFilePickerItem,
	PwImageAttrs,
	PwImageConfig,
	PwImagePickerItem,
	PwLinkConfig,
	PwPagePickerItem,
	TiptapPwContext,
	TiptapTranslateFn,
} from '../core/tiptapTypes';

export type {
	LinkDialogInitialState,
	LinkDialogSubmitPayload,
	PwFilePickerItem,
	PwImagePickerItem,
	PwPagePickerItem,
};

const runtime = getReactWorkspaceRuntime();
const { React, Portal, UI, Utils } = runtime;
const { cn, DynamicIcon } = Utils;
const { PortalRoot } = Portal;
const { useCallback, useEffect, useId, useMemo, useRef, useState } = React;
const { Badge, Button, Input, Label, Select, Tabs, TabsContent, TabsList, TabsTrigger } = UI;

const fetchTiptapGet: ReturnType<typeof getReactTiptapRuntime>['gateway']['fetchTiptapGet'] = (
	pwContext,
	params
) => getReactTiptapRuntime().gateway.fetchTiptapGet(pwContext, params);

const postTiptapJson: ReturnType<typeof getReactTiptapRuntime>['gateway']['postTiptapJson'] = (
	pwContext,
	payload
) => getReactTiptapRuntime().gateway.postTiptapJson(pwContext, payload);

const uploadTiptapImages: ReturnType<typeof getReactTiptapRuntime>['gateway']['uploadTiptapImages'] = (
	pwContext,
	files,
	options
) => getReactTiptapRuntime().gateway.uploadTiptapImages(pwContext, files, options);

const extractPageIdFromAssetSrc = (rawSrc: string): number =>
	getReactTiptapRuntime().helpers.extractPageIdFromAssetSrc(rawSrc);

const isSafePwImageSrc = (rawSrc: string): boolean =>
	getReactTiptapRuntime().helpers.isSafePwImageSrc(rawSrc);

const isSafePwLinkHref = (rawHref: string): boolean =>
	getReactTiptapRuntime().helpers.isSafePwLinkHref(rawHref);

const mergeBlankTargetRel = (rawRel: string | null | undefined, target: string | null | undefined): string =>
	getReactTiptapRuntime().helpers.mergeBlankTargetRel(rawRel, target);

const sanitizeAnchorId = (raw: string | null | undefined): string =>
	getReactTiptapRuntime().helpers.sanitizeAnchorId(raw);

const sanitizeCssClassTokens = (raw: string | null | undefined): string =>
	getReactTiptapRuntime().helpers.sanitizeCssClassTokens(raw);

/* ============================================================================
 * Native Top-Layer `<dialog>` Shell (`modern-web-guidance`: `dialog`)
 * ========================================================================== */

interface NativeModalDialogProps {
	open: boolean;
	onClose: () => void;
	title: string;
	closeLabel: string;
	dialogKind: 'link' | 'image' | 'anchor';
	maxWidthClass?: string;
	children: React.ReactNode;
	footer?: React.ReactNode;
}

function NativeModalDialog({
	open,
	onClose,
	title,
	closeLabel,
	dialogKind,
	maxWidthClass = 'max-w-2xl',
	children,
	footer,
}: NativeModalDialogProps) {
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const titleId = useId();
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	const returnFocusRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog || typeof window === 'undefined') {
			return;
		}

		const restoreFocus = () => {
			const target = returnFocusRef.current;
			returnFocusRef.current = null;
			if (target && target.isConnected && typeof target.focus === 'function') {
				window.requestAnimationFrame(() => target.focus());
			}
		};

		const handleNativeClose = () => {
			dialog.returnValue = '';
			onCloseRef.current();
			restoreFocus();
		};
		dialog.addEventListener('close', handleNativeClose);

		let cleanupLightDismiss: (() => void) | undefined;
		if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
			const isOutside = (e: PointerEvent) => {
				const r = dialog.getBoundingClientRect();
				return (
					e.clientX < r.left ||
					e.clientX > r.right ||
					e.clientY < r.top ||
					e.clientY > r.bottom
				);
			};
			let pressedOutside = false;
			const onDown = (e: PointerEvent) => {
				pressedOutside = isOutside(e);
			};
			const onUp = (e: PointerEvent) => {
				if (pressedOutside && isOutside(e) && dialog.open) {
					dialog.close();
				}
				pressedOutside = false;
			};
			dialog.addEventListener('pointerdown', onDown);
			dialog.addEventListener('pointerup', onUp);
			cleanupLightDismiss = () => {
				dialog.removeEventListener('pointerdown', onDown);
				dialog.removeEventListener('pointerup', onUp);
			};
		}

		return () => {
			dialog.removeEventListener('close', handleNativeClose);
			cleanupLightDismiss?.();
			if (dialog.open) {
				dialog.close();
			}
			restoreFocus();
		};
	}, [open]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) {
			return;
		}
		if (open) {
			if (!dialog.open && typeof dialog.showModal === 'function') {
				returnFocusRef.current =
					typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
						? document.activeElement
						: null;
				dialog.showModal();
				// `showModal()` focuses the first focusable node (the close button); move focus to the primary field
				dialog.querySelector<HTMLElement>('[data-rw-autofocus]')?.focus();
			}
		} else if (dialog.open) {
			dialog.close();
		}
	}, [open]);

	if (!open) {
		return null;
	}

	return (
		<PortalRoot ssrFallback={false}>
			<dialog
				ref={dialogRef}
			aria-labelledby={titleId}
			data-rw-tiptap-dialog={dialogKind}
			data-rw-portal-overlay=""
			data-rw-surface="elevated"
			{...({ closedby: 'any' } as Record<string, string>)}
			className={cn('w-full text-sm', maxWidthClass)}
		>
			<div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5 shrink-0">
				<h2 id={titleId} className="text-base font-semibold tracking-tight text-foreground">
					{title}
				</h2>
				<button
					type="button"
					onClick={() => dialogRef.current?.close()}
					aria-label={closeLabel}
					className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} className="size-4" aria-hidden="true">
						<path d="M18 6 6 18" />
						<path d="m6 6 12 12" />
					</svg>
				</button>
			</div>
			<div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">{children}</div>
			{footer ? (
				<div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3 shrink-0">
					{footer}
				</div>
			) : null}
			</dialog>
		</PortalRoot>
	);
}

/* ============================================================================
 * Shared ProcessWire Page Tree Browser (`pwlink` & Cross-Page `pwimage`)
 * ========================================================================== */

const MAX_PW_TREE_DEPTH = 24;

function PageTreeBrowser({
	pwContext,
	langId,
	rootParentId = 1,
	selectedPageId,
	onSelectPage,
	emptyLabel,
	t,
}: {
	pwContext: TiptapPwContext;
	langId?: number;
	rootParentId?: number;
	selectedPageId?: number;
	onSelectPage: (page: PwPagePickerItem) => void;
	emptyLabel?: string;
	t: TiptapTranslateFn;
}) {
	const includeRoot = rootParentId === 1;
	const [childrenByParent, setChildrenByParent] = useState<Record<number, PwPagePickerItem[]>>({});
	const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({ [rootParentId]: true });
	const [loadingIds, setLoadingIds] = useState<Record<number, boolean>>({});
	const treeGenRef = useRef<number>(0);
	const inFlightIdsRef = useRef<Set<number>>(new Set());

	useEffect(() => {
		return () => {
			treeGenRef.current += 1;
			inFlightIdsRef.current.clear();
		};
	}, []);

	const loadChildren = useCallback(
		async (parentId: number, withRoot = false) => {
			if (!Number.isFinite(parentId) || parentId < 0 || inFlightIdsRef.current.has(parentId)) {
				return;
			}
			inFlightIdsRef.current.add(parentId);
			const gen = treeGenRef.current;
			setLoadingIds((prev) => ({ ...prev, [parentId]: true }));
			try {
				const res = await fetchTiptapGet<{ ok: boolean; items: PwPagePickerItem[] }>(pwContext, {
					action: 'pages',
					parentId,
					includeRoot: withRoot ? 1 : undefined,
					editPageId: pwContext.editPageId || pwContext.pageId || undefined,
					langId: langId && langId > 0 ? langId : undefined,
				});
				if (gen !== treeGenRef.current) {
					return;
				}
				setChildrenByParent((prev) => ({
					...prev,
					[parentId]: res?.ok && Array.isArray(res.items) ? res.items : [],
				}));
			} finally {
				inFlightIdsRef.current.delete(parentId);
				if (gen === treeGenRef.current) {
					setLoadingIds((prev) => ({ ...prev, [parentId]: false }));
				}
			}
		},
		[pwContext, langId]
	);

	useEffect(() => {
		treeGenRef.current += 1;
		inFlightIdsRef.current.clear();
		setChildrenByParent({});
		setExpandedIds({ [rootParentId]: true });
		setLoadingIds({});
		void loadChildren(rootParentId, includeRoot);
	}, [loadChildren, rootParentId, includeRoot]);

	const toggleExpand = (page: PwPagePickerItem) => {
		const pageId = Number(page.id);
		if (page.isHome || !Number.isFinite(pageId) || pageId <= 0 || page.numChildren <= 0) {
			return;
		}
		const nextOpen = !expandedIds[pageId];
		setExpandedIds((prev) => ({ ...prev, [pageId]: nextOpen }));
		if (nextOpen && childrenByParent[pageId] === undefined) {
			void loadChildren(pageId, false);
		}
	};

	const renderBranch = (
		parentId: number,
		depth: number,
		ancestors: ReadonlySet<number> = new Set([rootParentId])
	): React.ReactNode => {
		if (depth >= MAX_PW_TREE_DEPTH) {
			return null;
		}
		const list = childrenByParent[parentId];
		if (list === undefined || (loadingIds[parentId] && list.length === 0)) {
			return (
				<p className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground" role="status">
					<DynamicIcon name="loader-2" className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
					{t('link.loadingTree', 'Loading page tree...')}
				</p>
			);
		}
		if (list.length === 0) {
			return depth === 0 ? (
				<p className="px-2 py-1.5 text-xs text-muted-foreground">
					{emptyLabel || t('link.noMatchingPages', 'No matching pages found.')}
				</p>
			) : null;
		}
		return (
			<ul className={cn('space-y-px', depth > 0 && 'ms-[0.6875rem] border-s border-border ps-1.5 mt-px')}>
				{list.map((item) => {
					const itemId = Number(item.id);
					const isCyclic = !Number.isFinite(itemId) || itemId <= 0 || ancestors.has(itemId);
					const canExpand = !item.isHome && !isCyclic && item.numChildren > 0;
					const isExpanded = canExpand && Boolean(expandedIds[itemId]);
					const isSelected = selectedPageId === itemId;
					const nextAncestors = new Set(ancestors);
					if (Number.isFinite(itemId) && itemId > 0) {
						nextAncestors.add(itemId);
					}
					return (
						<li key={`${parentId}-${itemId}-${item.isHome ? 'home' : 'node'}`}>
							<div
								className={cn(
									'group flex items-center gap-1 rounded-md pe-1.5 text-xs transition-colors',
									isSelected ? 'bg-primary/12 text-primary-ink' : 'hover:bg-muted/70 text-foreground'
								)}
							>
								{canExpand ? (
									<button
										type="button"
										aria-expanded={isExpanded}
										aria-label={
											isExpanded
												? t('link.collapseChildren', 'Collapse child pages')
												: t('link.expandChildren', 'Expand child pages')
										}
										onClick={() => toggleExpand(item)}
										className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
									>
										<DynamicIcon
											name="chevron-right"
											className={cn('size-3.5 transition-transform duration-150 motion-reduce:transition-none', isExpanded && 'rotate-90')}
											aria-hidden="true"
										/>
									</button>
								) : (
									<span className="inline-block size-6 shrink-0" aria-hidden="true" />
								)}

								<button
									type="button"
									onClick={() => onSelectPage(item)}
									aria-pressed={isSelected}
									className="flex min-w-0 flex-1 items-baseline gap-2 rounded-sm py-1.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
									data-rw-pw-tree-page={itemId}
								>
									<span className={cn('truncate', isSelected && 'font-semibold')}>{item.title}</span>
									<span className="truncate text-[11px] text-muted-foreground">{item.path}</span>
								</button>
								{item.unpublished || item.hidden ? (
									<Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
										{item.unpublished ? t('link.unpublishedBadge', 'Unpublished') : t('link.hiddenBadge', 'Hidden')}
									</Badge>
								) : null}
							</div>
							{canExpand && isExpanded && depth + 1 < MAX_PW_TREE_DEPTH
								? renderBranch(itemId, depth + 1, nextAncestors)
								: null}
						</li>
					);
				})}
			</ul>
		);
	};

	return (
		<div className="max-h-64 overflow-y-auto overscroll-contain p-1" data-rw-pw-page-tree="">
			{renderBranch(rootParentId, 0)}
		</div>
	);
}

/* ============================================================================
 * 1. ProcessWire `pwlink` Dialog (`TiptapLinkDialog`)
 * ========================================================================== */

function normalizeUserEnteredHref(rawInput: string): string {
	const trimmed = rawInput.trim();
	if (!trimmed) {
		return '';
	}
	if (
		/^(?:https?:\/\/|mailto:|tel:|\/|#|\.\.?\/)/i.test(trimmed) ||
		trimmed.startsWith('//') ||
		/^(?:javascript|vbscript|data):/i.test(trimmed)
	) {
		return trimmed;
	}
	// Bare email address -> `mailto:`
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
		return `mailto:${trimmed}`;
	}
	// International phone number -> `tel:`
	if (/^\+[0-9][0-9\s()-]{4,28}$/.test(trimmed)) {
		return `tel:${trimmed.replace(/[^\d+]/g, '')}`;
	}
	// Bare domain (`example.com` or `example.com/path`) -> `https://`
	if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/.*)?$/i.test(trimmed)) {
		return `https://${trimmed}`;
	}
	return trimmed;
}

function isExternalUrl(href: string, httpHosts: string[]): boolean {
	if (!/^https?:\/\//i.test(href)) {
		return false;
	}
	try {
		const parsed = new URL(href);
		const host = parsed.host.toLowerCase();
		const hostname = parsed.hostname.toLowerCase();
		if (typeof window !== 'undefined') {
			if (host === window.location.host.toLowerCase() || hostname === window.location.hostname.toLowerCase()) {
				return false;
			}
		}
		if (httpHosts.some((h) => h.toLowerCase() === host || h.toLowerCase() === hostname)) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

type LinkDialogPane = 'link' | 'attributes';
type LinkBrowseSection = 'pages' | 'children' | 'files' | 'anchors';

function LinkBrowseDisclosure({
	id,
	icon,
	label,
	meta,
	isOpen,
	onToggle,
	children,
}: {
	id: string;
	icon: string;
	label: string;
	meta?: string;
	isOpen: boolean;
	onToggle: () => void;
	children: React.ReactNode;
}) {
	const panelId = `${id}-panel`;
	return (
		<div className="border-b border-border last:border-b-0" data-rw-pw-link-section={id}>
			<h3 className="m-0">
				<button
					type="button"
					aria-expanded={isOpen}
					aria-controls={isOpen ? panelId : undefined}
					onClick={onToggle}
					className={cn(
						'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
						isOpen ? 'text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
					)}
				>
					<DynamicIcon name={icon} className="size-4 shrink-0" aria-hidden="true" />
					<span className="flex-1 truncate">{label}</span>
					{meta ? <span className="shrink-0 text-[11px] font-normal tabular-nums text-muted-foreground">{meta}</span> : null}
					<DynamicIcon
						name="chevron-down"
						className={cn('size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none', isOpen && 'rotate-180')}
						aria-hidden="true"
					/>
				</button>
			</h3>
			{isOpen ? (
				<div id={panelId} role="region" aria-label={label} className="border-t border-border/70 bg-muted/20 px-2 py-2">
					{children}
				</div>
			) : null}
		</div>
	);
}

export function TiptapLinkDialog({
	open,
	initial,
	pwContext,
	linkConfig,
	anchors,
	langId,
	onClose,
	onSubmit,
	onUnlink,
	t,
}: {
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
}) {
	const hasServerToken = Boolean(pwContext.tiptapToken);
	// Stable reference: a fresh `[]` per render would re-trigger the file loader effect forever
	const hostMediaFields = useMemo(
		() => (Array.isArray(pwContext.hostMediaFields) ? pwContext.hostMediaFields : []),
		[pwContext.hostMediaFields]
	);
	const basePageId = pwContext.editPageId || pwContext.pageId || 0;
	const hasFilesSection = hasServerToken && (basePageId > 0 || hostMediaFields.length > 0);

	const [pane, setPane] = useState<LinkDialogPane>('link');
	const [openSection, setOpenSection] = useState<LinkBrowseSection | null>(null);
	const [href, setHref] = useState<string>(initial.href);
	const [linkText, setLinkText] = useState<string>(initial.text);
	const [titleAttr, setTitleAttr] = useState<string>(initial.title);
	const [targetAttr, setTargetAttr] = useState<string>(initial.target);
	const [relTokens, setRelTokens] = useState<string[]>([]);
	const [classTokens, setClassTokens] = useState<string[]>([]);
	const [error, setError] = useState<string>('');

	const [searchResults, setSearchResults] = useState<PwPagePickerItem[]>([]);
	const [searchQuery, setSearchQuery] = useState<string>('');
	const [isSearching, setIsSearching] = useState<boolean>(false);
	const [activeResultIdx, setActiveResultIdx] = useState<number>(-1);
	const [selectedPage, setSelectedPage] = useState<{ id: number; title: string } | null>(null);
	const [fileSourceKey, setFileSourceKey] = useState<string>('');
	const [filesList, setFilesList] = useState<PwFilePickerItem[]>([]);
	const [loadingFiles, setLoadingFiles] = useState<boolean>(false);

	const formId = useId();
	const hrefInputRef = useRef<HTMLInputElement | null>(null);
	const userTouchedAttrsRef = useRef<boolean>(false);
	// Last href written programmatically (initial value or picked destination); never triggers page search
	const settledHrefRef = useRef<string>(initial.href);

	useEffect(() => {
		if (!open) {
			return;
		}
		userTouchedAttrsRef.current = initial.isEditing;
		settledHrefRef.current = initial.href;
		setPane('link');
		setOpenSection(null);
		setHref(initial.href);
		setLinkText(initial.text);
		setTitleAttr(initial.title);
		setTargetAttr(initial.isEditing ? initial.target : linkConfig.targetOptions.find((o) => o.default)?.value || '');
		setRelTokens(
			initial.rel
				? initial.rel.split(/\s+/).filter(Boolean)
				: initial.isEditing
					? []
					: linkConfig.relOptions.filter((o) => o.default).map((o) => o.value)
		);
		setClassTokens(
			initial.className
				? initial.className.split(/\s+/).filter(Boolean)
				: initial.isEditing
					? []
					: linkConfig.classOptions.filter((o) => o.default).map((o) => o.value)
		);
		setError('');
		setSearchResults([]);
		setSearchQuery('');
		setActiveResultIdx(-1);
		setSelectedPage(null);
		setFileSourceKey(basePageId > 0 ? `page:${basePageId}` : hostMediaFields[0] ? `media:${hostMediaFields[0].name}` : '');
	}, [open, initial, linkConfig, basePageId, hostMediaFields]);

	// ProcessPageEditLink external link defaults (`extLinkTarget`, `extLinkRel`, `extLinkClass`)
	const applyExternalDefaultsIfNeeded = useCallback(
		(candidateHref: string) => {
			if (userTouchedAttrsRef.current) {
				return;
			}
			const normalized = normalizeUserEnteredHref(candidateHref);
			if (!isExternalUrl(normalized, linkConfig.httpHosts)) {
				return;
			}
			if (linkConfig.extLinkTarget) {
				setTargetAttr(linkConfig.extLinkTarget);
			}
			if (linkConfig.extLinkRel) {
				const extRels = linkConfig.extLinkRel.split(/\s+/).filter(Boolean);
				setRelTokens((prev) => Array.from(new Set([...prev, ...extRels])));
			}
			if (linkConfig.extLinkClass) {
				const extCls = linkConfig.extLinkClass.split(/\s+/).filter(Boolean);
				setClassTokens((prev) => Array.from(new Set([...prev, ...extCls])));
			}
		},
		[linkConfig]
	);

	// Debounced page autocomplete when the URL field holds plain words rather than a URL
	useEffect(() => {
		if (!open || !hasServerToken) {
			return;
		}
		const q = href.trim();
		if (href === settledHrefRef.current || q.length < 2 || /^(?:https?:\/\/|mailto:|tel:|\/|#|\.\.?\/)/i.test(q) || q.includes('@')) {
			setSearchResults([]);
			setSearchQuery('');
			setActiveResultIdx(-1);
			return;
		}
		let cancelled = false;
		const timer = window.setTimeout(async () => {
			setIsSearching(true);
			try {
				const res = await fetchTiptapGet<{ ok: boolean; items: PwPagePickerItem[] }>(pwContext, {
					action: 'pages',
					q,
					editPageId: basePageId || undefined,
					langId: langId && langId > 0 ? langId : undefined,
				});
				if (!cancelled) {
					setSearchResults(res?.ok && Array.isArray(res.items) ? res.items : []);
					setSearchQuery(q);
					setActiveResultIdx(-1);
				}
			} finally {
				if (!cancelled) {
					setIsSearching(false);
				}
			}
		}, 200);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [open, hasServerToken, href, pwContext, basePageId, langId]);

	// Load files for the active source when the `Select File` section is expanded
	useEffect(() => {
		if (!open || openSection !== 'files' || !fileSourceKey || !hasServerToken) {
			return;
		}
		let cancelled = false;
		const load = async () => {
			setLoadingFiles(true);
			try {
				let params: Record<string, string | number> | null = null;
				if (fileSourceKey.startsWith('media:')) {
					const hostField = hostMediaFields.find((f) => f.name === fileSourceKey.slice('media:'.length));
					params = hostField ? { action: 'files', mediaToken: hostField.mediaToken } : null;
				} else if (fileSourceKey.startsWith('page:')) {
					const pid = Number.parseInt(fileSourceKey.slice('page:'.length), 10);
					params = pid > 0 ? { action: 'files', pageId: pid } : null;
				}
				const res = params
					? await fetchTiptapGet<{ ok: boolean; files: PwFilePickerItem[] }>(pwContext, params)
					: null;
				if (!cancelled) {
					setFilesList(res?.ok && Array.isArray(res.files) ? res.files : []);
				}
			} finally {
				if (!cancelled) {
					setLoadingFiles(false);
				}
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [open, openSection, fileSourceKey, hasServerToken, hostMediaFields, pwContext]);

	const showTextInput = initial.canEditText && !linkConfig.noLinkTextEdit;

	const chooseDestination = (nextHref: string, suggestedText: string, page?: { id: number; title: string }) => {
		settledHrefRef.current = nextHref;
		setHref(nextHref);
		setSearchResults([]);
		setSearchQuery('');
		setActiveResultIdx(-1);
		setError('');
		if (page) {
			setSelectedPage(page);
			setFileSourceKey(`page:${page.id}`);
		}
		if (showTextInput && !linkText.trim() && suggestedText) {
			setLinkText(suggestedText);
		}
		hrefInputRef.current?.focus({ preventScroll: true });
	};

	const handleConfirm = (e?: React.FormEvent) => {
		e?.preventDefault();
		const normalizedHref = normalizeUserEnteredHref(href);
		if (!normalizedHref) {
			if (initial.isEditing) {
				onUnlink();
				onClose();
				return;
			}
			setPane('link');
			setError(t('link.emptyUrl', 'Enter a URL, or pick a page, file, or anchor below.'));
			hrefInputRef.current?.focus();
			return;
		}
		if (!isSafePwLinkHref(normalizedHref)) {
			setPane('link');
			setError(t('link.invalidUrl', 'Enter a valid https://, http://, mailto:, tel:, or relative URL.'));
			hrefInputRef.current?.focus();
			return;
		}
		const trimmedText = linkText.trim();
		onSubmit({
			href: normalizedHref,
			text: showTextInput && trimmedText ? trimmedText : initial.text || normalizedHref,
			textChanged: showTextInput && trimmedText !== '' && trimmedText !== initial.text,
			title: titleAttr.trim(),
			target: targetAttr.trim(),
			rel: mergeBlankTargetRel(relTokens.join(' '), targetAttr),
			className: sanitizeCssClassTokens(classTokens.join(' ')),
		});
		onClose();
	};

	const handleHrefKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.nativeEvent.isComposing || e.keyCode === 229) {
			return;
		}
		if (searchResults.length === 0) {
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActiveResultIdx((idx) => (idx + 1) % searchResults.length);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActiveResultIdx((idx) => (idx <= 0 ? searchResults.length - 1 : idx - 1));
		} else if (e.key === 'Enter' && activeResultIdx >= 0) {
			const picked = searchResults[activeResultIdx];
			if (picked) {
				e.preventDefault();
				chooseDestination(picked.url, picked.title, { id: picked.id, title: picked.title });
			}
		} else if (e.key === 'Escape') {
			// Close the suggestion list first; a second Escape closes the dialog
			e.preventDefault();
			e.stopPropagation();
			setSearchResults([]);
			setSearchQuery('');
			setActiveResultIdx(-1);
		}
	};

	const fileSourceOptions = useMemo(() => {
		const opts: Array<{ value: string; label: string }> = [];
		if (basePageId > 0) {
			opts.push({
				value: `page:${basePageId}`,
				label: t('link.filesOnPage', { page: pwContext.pageTitle || `#${basePageId}` }, 'Files on {page}'),
			});
		}
		if (selectedPage && selectedPage.id > 0 && selectedPage.id !== basePageId) {
			opts.push({
				value: `page:${selectedPage.id}`,
				label: t('link.filesOnPage', { page: selectedPage.title }, 'Files on {page}'),
			});
		}
		for (const mf of hostMediaFields) {
			opts.push({ value: `media:${mf.name}`, label: `${t('link.hostEntityFiles', 'Current item files')} (${mf.label})` });
		}
		return opts;
	}, [basePageId, pwContext.pageTitle, selectedPage, hostMediaFields, t]);

	const toggleSection = (section: LinkBrowseSection) => {
		setOpenSection((prev) => (prev === section ? null : section));
	};

	const attributeCount =
		(titleAttr.trim() ? 1 : 0) + (targetAttr ? 1 : 0) + relTokens.length + classTokens.length;
	const listboxId = `${formId}-results`;
	const showResults = searchResults.length > 0 || (searchQuery !== '' && !isSearching);
	const chipClass = (active: boolean) =>
		cn(
			'rounded-md border px-2.5 py-1 font-mono text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			active
				? 'border-primary bg-primary text-primary-foreground'
				: 'border-border bg-background text-muted-foreground hover:text-foreground'
		);

	return (
		<NativeModalDialog
			open={open}
			onClose={onClose}
			title={initial.isEditing ? t('link.editDialogTitle', 'Edit Link') : t('link.dialogTitle', 'Insert Link')}
			closeLabel={t('editor.closeDialog', 'Close dialog')}
			dialogKind="link"
			maxWidthClass="max-w-2xl"
			footer={
				<>
					{initial.isEditing ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => {
								onUnlink();
								onClose();
							}}
							className="me-auto text-destructive hover:text-destructive"
							data-rw-pw-link-unlink=""
						>
							{t('link.unlink', 'Unlink')}
						</Button>
					) : null}
					<Button type="button" variant="ghost" size="sm" onClick={onClose}>
						{t('link.cancel', 'Cancel')}
					</Button>
					<Button type="submit" form={formId} variant="primary" size="sm" data-rw-pw-link-submit="">
						{initial.isEditing ? t('link.updateLinkBtn', 'Update Link') : t('link.insertLinkBtn', 'Insert Link')}
					</Button>
				</>
			}
		>
			<form id={formId} onSubmit={handleConfirm} noValidate>
				<Tabs value={pane} onValueChange={(v) => setPane(v === 'attributes' ? 'attributes' : 'link')} className="space-y-0">
					<TabsList>
						<TabsTrigger value="link" data-rw-pw-link-pane="link">
							{t('link.tabLink', 'Link')}
						</TabsTrigger>
						<TabsTrigger
							value="attributes"
							badge={attributeCount > 0 ? attributeCount : undefined}
							data-rw-pw-link-pane="attributes"
						>
							{t('link.attributesHeading', 'Attributes')}
						</TabsTrigger>
					</TabsList>

					<TabsContent value="link" className="mt-4 space-y-4">
						{showTextInput ? (
							<div className="space-y-1.5">
								<Label htmlFor={`${formId}-text`}>{t('link.linkTextLabel', 'Link text')}</Label>
								<Input
									id={`${formId}-text`}
									type="text"
									value={linkText}
									onChange={(e) => setLinkText(e.target.value)}
									placeholder={t('link.linkTextPlaceholder', 'Visible text for this link')}
									data-rw-pw-link-text=""
								/>
							</div>
						) : null}

						<div className="space-y-1.5">
							<Label htmlFor={`${formId}-href`}>{t('link.linkToUrlLabel', 'Link to URL')}</Label>
							<p id={`${formId}-href-hint`} className="text-[11px] text-muted-foreground">
								{hasServerToken
									? t('link.linkToUrlHint', 'Enter a URL, email address, anchor, or word(s) to find a page.')
									: t('link.urlPlaceholder', 'https://example.com or /page/')}
							</p>
							<div className="relative">
								<DynamicIcon
									name={isSearching ? 'loader-2' : 'link'}
									className={cn(
										'pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground',
										isSearching && 'animate-spin motion-reduce:animate-none'
									)}
									aria-hidden="true"
								/>
								<Input
									ref={hrefInputRef}
									id={`${formId}-href`}
									type="text"
									data-rw-autofocus=""
									autoComplete="off"
									spellCheck={false}
									value={href}
									role={hasServerToken ? 'combobox' : undefined}
									aria-autocomplete={hasServerToken ? 'list' : undefined}
									aria-expanded={hasServerToken ? showResults : undefined}
									aria-controls={hasServerToken && showResults && searchResults.length > 0 ? listboxId : undefined}
									aria-activedescendant={
										activeResultIdx >= 0 ? `${listboxId}-opt-${activeResultIdx}` : undefined
									}
									aria-describedby={`${formId}-href-hint`}
									aria-invalid={error ? true : undefined}
									onChange={(e) => {
										const val = e.target.value;
										setHref(val);
										setSelectedPage(null);
										if (error) setError('');
										applyExternalDefaultsIfNeeded(val);
									}}
									onKeyDown={handleHrefKeyDown}
									placeholder={t('link.searchPagesPlaceholder', 'Type page title, URL, email, or #anchor...')}
									className="ps-9 pe-9 font-mono text-[13px]"
									data-rw-pw-link-href=""
								/>
								{href ? (
									<button
										type="button"
										onClick={() => {
											setHref('');
											setSelectedPage(null);
											setSearchResults([]);
											setSearchQuery('');
											hrefInputRef.current?.focus();
										}}
										aria-label={t('link.clearUrl', 'Clear URL')}
										className="absolute end-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
									>
										<DynamicIcon name="x" className="size-3.5" aria-hidden="true" />
									</button>
								) : null}
							</div>

							{showResults ? (
								searchResults.length === 0 ? (
									<p
										role="status"
										className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-muted-foreground shadow-md"
										data-rw-pw-link-autocomplete=""
									>
										{t('link.noMatchingPages', 'No matching pages found.')}
									</p>
								) : (
									<ul
										id={listboxId}
										role="listbox"
										aria-label={t('link.searchResultsLabel', 'Matching pages')}
										className="max-h-48 overflow-y-auto overscroll-contain rounded-md border border-border bg-popover p-1 shadow-md"
										data-rw-pw-link-autocomplete=""
									>
										{searchResults.map((p, idx) => (
											<li
												key={p.id}
												id={`${listboxId}-opt-${idx}`}
												role="option"
												aria-selected={idx === activeResultIdx}
												onMouseDown={(e) => e.preventDefault()}
												onClick={() => chooseDestination(p.url, p.title, { id: p.id, title: p.title })}
												onMouseEnter={() => setActiveResultIdx(idx)}
												className={cn(
													'flex cursor-pointer items-baseline gap-2 rounded px-2.5 py-1.5 text-xs',
													idx === activeResultIdx ? 'bg-primary/12 text-primary-ink' : 'text-foreground'
												)}
												data-rw-pw-search-result={p.id}
											>
												<span className="truncate font-medium">{p.title}</span>
												<span className="truncate font-mono text-[11px] text-muted-foreground">{p.url}</span>
											</li>
										))}
									</ul>
								)
							) : null}

							{error ? (
								<p role="alert" className="flex items-center gap-1.5 text-xs font-medium text-destructive">
									<DynamicIcon name="alert-circle" className="size-3.5 shrink-0" aria-hidden="true" />
									{error}
								</p>
							) : null}
						</div>

						{hasServerToken || anchors.length > 0 ? (
							<div className="overflow-hidden rounded-lg border border-border" data-rw-pw-link-browse="">
								{hasServerToken ? (
									<LinkBrowseDisclosure
										id={`${formId}-pages`}
										icon="sitemap"
										label={t('link.tabPages', 'Select Page')}
										isOpen={openSection === 'pages'}
										onToggle={() => toggleSection('pages')}
									>
										<PageTreeBrowser
											pwContext={pwContext}
											langId={langId}
											selectedPageId={selectedPage?.id}
											onSelectPage={(page) =>
												chooseDestination(page.url, page.title, { id: page.id, title: page.title })
											}
											t={t}
										/>
									</LinkBrowseDisclosure>
								) : null}

								{hasServerToken && basePageId > 0 ? (
									<LinkBrowseDisclosure
										id={`${formId}-children`}
										icon="sitemap"
										label={t('link.selectChildPage', 'Select Child Page')}
										isOpen={openSection === 'children'}
										onToggle={() => toggleSection('children')}
									>
										<PageTreeBrowser
											pwContext={pwContext}
											langId={langId}
											rootParentId={basePageId}
											selectedPageId={selectedPage?.id}
											onSelectPage={(page) =>
												chooseDestination(page.url, page.title, { id: page.id, title: page.title })
											}
											emptyLabel={t('link.noChildPages', 'This page has no child pages yet.')}
											t={t}
										/>
									</LinkBrowseDisclosure>
								) : null}

								{hasFilesSection ? (
									<LinkBrowseDisclosure
										id={`${formId}-files`}
										icon="file"
										label={t('link.tabFiles', 'Select File')}
										meta={openSection === 'files' && !loadingFiles ? String(filesList.length) : undefined}
										isOpen={openSection === 'files'}
										onToggle={() => toggleSection('files')}
									>
										<div className="space-y-2">
											{fileSourceOptions.length > 1 ? (
												<div className="px-1.5 pt-0.5">
													<Label htmlFor={`${formId}-file-source`} className="sr-only">
														{t('link.fileSourceLabel', 'File source')}
													</Label>
													<Select
														id={`${formId}-file-source`}
														value={fileSourceKey}
														onChange={(e) => setFileSourceKey(e.target.value)}
														options={fileSourceOptions}
														className="h-8 text-xs"
													/>
												</div>
											) : null}

											{loadingFiles ? (
												<p className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground" role="status">
													<DynamicIcon name="loader-2" className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
													{t('link.loadingFiles', 'Loading files...')}
												</p>
											) : filesList.length === 0 ? (
												<p className="px-2 py-1.5 text-xs text-muted-foreground">
													{t('link.noFilesOnPage', 'No files are attached to this item.')}
												</p>
											) : (
												<ul className="max-h-56 space-y-px overflow-y-auto overscroll-contain" data-rw-pw-link-files="">
													{filesList.map((f) => {
														const isPicked = href === f.url;
														return (
															<li key={f.url}>
																<button
																	type="button"
																	aria-pressed={isPicked}
																	onClick={() => chooseDestination(f.url, f.description || f.basename)}
																	className={cn(
																		'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
																		isPicked ? 'bg-primary/12 text-primary-ink' : 'text-foreground hover:bg-muted/70'
																	)}
																>
																	<DynamicIcon name="file-text" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
																	<span className="min-w-0 flex-1">
																		<span className={cn('block truncate', isPicked && 'font-semibold')}>{f.basename}</span>
																		<span className="block truncate text-[11px] text-muted-foreground">
																			{f.description || f.fieldLabel}
																		</span>
																	</span>
																	<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{f.filesizeStr}</span>
																</button>
															</li>
														);
													})}
												</ul>
											)}
										</div>
									</LinkBrowseDisclosure>
								) : null}

								{anchors.length > 0 ? (
									<LinkBrowseDisclosure
										id={`${formId}-anchors`}
										icon="anchor"
										label={t('link.tabAnchors', 'Select Anchor')}
										meta={String(anchors.length)}
										isOpen={openSection === 'anchors'}
										onToggle={() => toggleSection('anchors')}
									>
										<div className="flex flex-wrap gap-1.5 px-1.5 py-0.5">
											{anchors.map((aId) => {
												const anchorHref = `#${aId}`;
												return (
													<button
														key={aId}
														type="button"
														aria-pressed={href === anchorHref}
														onClick={() => chooseDestination(anchorHref, '')}
														className={chipClass(href === anchorHref)}
													>
														{anchorHref}
													</button>
												);
											})}
										</div>
									</LinkBrowseDisclosure>
								) : null}
							</div>
						) : null}
					</TabsContent>

					<TabsContent value="attributes" className="mt-4 space-y-4">
						<div className="space-y-1.5">
							<Label htmlFor={`${formId}-title`}>{t('link.titleAttrLabel', 'Title attribute')}</Label>
							<p id={`${formId}-title-hint`} className="text-[11px] text-muted-foreground">
								{t('link.titleAttrHint', 'Additional text to describe the link.')}
							</p>
							<Input
								id={`${formId}-title`}
								type="text"
								value={titleAttr}
								aria-describedby={`${formId}-title-hint`}
								onChange={(e) => setTitleAttr(e.target.value)}
								data-rw-pw-link-title=""
							/>
						</div>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label htmlFor={`${formId}-target`}>{t('link.targetAttrLabel', 'Target window')}</Label>
								<p id={`${formId}-target-hint`} className="text-[11px] text-muted-foreground">
									{t('link.targetAttrHint', 'Where this link will open.')}
								</p>
								<Select
									id={`${formId}-target`}
									value={targetAttr}
									aria-describedby={`${formId}-target-hint`}
									onChange={(e) => {
										userTouchedAttrsRef.current = true;
										setTargetAttr(e.target.value);
									}}
									options={[
										{ value: '', label: t('link.targetDefault', 'Same window (default)') },
										...linkConfig.targetOptions.map((o) => ({
											value: o.value,
											label: o.value === '_blank' ? `${t('link.openInNewTab', 'New tab')} (_blank)` : o.value,
										})),
									]}
									data-rw-pw-link-target=""
								/>
							</div>

							{linkConfig.relOptions.length > 0 ? (
								<fieldset className="space-y-1.5">
									<legend className="text-xs font-medium leading-none text-foreground">
										{t('link.relAttrLabel', 'Rel attributes')}
									</legend>
									<p className="pt-1.5 text-[11px] text-muted-foreground">
										{t('link.relAttrHint', 'Relationship of the link to this document.')}
									</p>
									<div className="flex flex-wrap gap-1.5 pt-0.5">
										{linkConfig.relOptions.map((opt) => {
											const checked = relTokens.includes(opt.value);
											return (
												<button
													key={opt.value}
													type="button"
													aria-pressed={checked}
													onClick={() => {
														userTouchedAttrsRef.current = true;
														setRelTokens((prev) =>
															prev.includes(opt.value) ? prev.filter((i) => i !== opt.value) : [...prev, opt.value]
														);
													}}
													className={chipClass(checked)}
												>
													{opt.value}
												</button>
											);
										})}
									</div>
								</fieldset>
							) : null}
						</div>

						{linkConfig.classOptions.length > 0 ? (
							<fieldset className="space-y-1.5">
								<legend className="text-xs font-medium leading-none text-foreground">
									{t('link.classAttrLabel', 'CSS classes')}
								</legend>
								<div className="flex flex-wrap gap-1.5 pt-1.5">
									{linkConfig.classOptions.map((opt) => {
										const checked = classTokens.includes(opt.value);
										return (
											<button
												key={opt.value}
												type="button"
												aria-pressed={checked}
												onClick={() => {
													userTouchedAttrsRef.current = true;
													setClassTokens((prev) =>
														prev.includes(opt.value) ? prev.filter((i) => i !== opt.value) : [...prev, opt.value]
													);
												}}
												className={chipClass(checked)}
											>
												{opt.value}
											</button>
										);
									})}
								</div>
							</fieldset>
						) : null}
					</TabsContent>
				</Tabs>
			</form>
		</NativeModalDialog>
	);
}

/* ============================================================================
 * 2. ProcessWire Named Anchor Dialog (`TiptapAnchorDialog`)
 * ========================================================================== */

export function TiptapAnchorDialog({
	open,
	initialId,
	isEditing,
	onClose,
	onSubmit,
	onRemove,
	t,
}: {
	open: boolean;
	initialId: string;
	isEditing: boolean;
	onClose: () => void;
	onSubmit: (id: string) => void;
	onRemove?: () => void;
	t: TiptapTranslateFn;
}) {
	const [anchorId, setAnchorId] = useState<string>(initialId);
	const [error, setError] = useState<string>('');
	const formId = useId();

	useEffect(() => {
		if (open) {
			setAnchorId(initialId);
			setError('');
		}
	}, [open, initialId]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const clean = sanitizeAnchorId(anchorId);
		if (!clean) {
			setError(
				t(
					'link.anchorInvalidId',
					'Anchor ID must start with a letter and contain only letters, numbers, hyphens, or underscores.'
				)
			);
			return;
		}
		onSubmit(clean);
		onClose();
	};

	return (
		<NativeModalDialog
			open={open}
			onClose={onClose}
			title={t('link.insertAnchorTitle', 'Insert Named Anchor')}
			closeLabel={t('editor.closeDialog', 'Close dialog')}
			dialogKind="anchor"
			maxWidthClass="max-w-md"
			footer={
				<>
					{isEditing && onRemove ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => {
								onRemove();
								onClose();
							}}
							className="me-auto text-destructive hover:text-destructive"
						>
							{t('link.removeAnchorBtn', 'Remove Anchor')}
						</Button>
					) : null}
					<Button type="button" variant="ghost" size="sm" onClick={onClose}>
						{t('link.cancel', 'Cancel')}
					</Button>
					<Button type="submit" form={formId} variant="primary" size="sm" data-rw-pw-anchor-submit="">
						{t('link.insertAnchorBtn', 'Insert Anchor')}
					</Button>
				</>
			}
		>
			<form id={formId} onSubmit={handleSubmit} className="space-y-3">
				<div className="space-y-1.5">
					<Label htmlFor={`${formId}-anchor`}>{t('link.anchorIdLabel', 'Anchor ID')}</Label>
					<Input
						id={`${formId}-anchor`}
						type="text"
						data-rw-autofocus=""
						value={anchorId}
						onChange={(e) => {
							setAnchorId(e.target.value);
							if (error) setError('');
						}}
						placeholder={t('link.anchorIdPlaceholder', 'section-heading')}
						className="font-mono"
						data-rw-pw-anchor-input=""
					/>
				</div>
				{error ? (
					<p role="alert" className="text-xs font-medium text-destructive">
						{error}
					</p>
				) : null}
			</form>
		</NativeModalDialog>
	);
}

/* ============================================================================
 * 3. ProcessWire `pwimage` Studio Dialog (`TiptapImageDialog`)
 * ========================================================================== */

interface CropPixels {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function TiptapImageDialog({
	open,
	editingPos,
	initialAttrs,
	pwContext,
	imageConfig,
	langId,
	onClose,
	onConfirm,
	t,
}: {
	open: boolean;
	editingPos: number | null;
	initialAttrs: PwImageAttrs | null;
	pwContext: TiptapPwContext;
	imageConfig: PwImageConfig;
	langId?: number;
	onClose: () => void;
	onConfirm: (attrs: PwImageAttrs, editingPos: number | null) => void;
	t: TiptapTranslateFn;
}) {
	const hasServerToken = Boolean(pwContext.tiptapToken);
	const hostImageFields = useMemo(
		() => (pwContext.hostMediaFields || []).filter((f) => f.isImage),
		[pwContext.hostMediaFields]
	);
	const hasLibrary = hasServerToken && (Boolean(pwContext.pageId) || hostImageFields.length > 0 || true);

	const [view, setView] = useState<'library' | 'edit'>('library');
	const [libraryTab, setLibraryTab] = useState<string>('library');

	// Library state
	const [sourceKey, setSourceKey] = useState<string>('');
	const [sourcePageTitle, setSourcePageTitle] = useState<string>('');
	const [showPageSwitcher, setShowPageSwitcher] = useState<boolean>(false);
	const [imagesList, setImagesList] = useState<PwImagePickerItem[]>([]);
	const [loadingImages, setLoadingImages] = useState<boolean>(false);
	const [hasImageFields, setHasImageFields] = useState<boolean>(true);
	const [canUploadHere, setCanUploadHere] = useState<boolean>(false);
	const [uploadFields, setUploadFields] = useState<Array<{ name: string; label: string }>>([]);
	const [selectedUploadField, setSelectedUploadField] = useState<string>('');
	const [uploading, setUploading] = useState<boolean>(false);

	// External URL fallback state
	const [externalUrl, setExternalUrl] = useState<string>('');
	const [externalAlt, setExternalAlt] = useState<string>('');

	// Inspector / Variation Studio state
	const [activeSrc, setActiveSrc] = useState<string>('');
	const [originalUrl, setOriginalUrl] = useState<string>('');
	const [basename, setBasename] = useState<string>('');
	const [ownerPageId, setOwnerPageId] = useState<number>(0);
	const [ownerMediaToken, setOwnerMediaToken] = useState<string>('');
	const [naturalW, setNaturalW] = useState<number>(0);
	const [naturalH, setNaturalH] = useState<number>(0);
	const [canResizeServer, setCanResizeServer] = useState<boolean>(false);

	const [widthInput, setWidthInput] = useState<string>('');
	const [heightInput, setHeightInput] = useState<string>('');
	const [lockAspect, setLockAspect] = useState<boolean>(true);
	const [hidpi, setHidpi] = useState<boolean>(false);
	const [align, setAlign] = useState<string>('');
	const [altText, setAltText] = useState<string>('');
	const [captionEnabled, setCaptionEnabled] = useState<boolean>(false);
	const [captionText, setCaptionText] = useState<string>('');
	const [linkOriginal, setLinkOriginal] = useState<boolean>(false);
	const [existingCustomLink, setExistingCustomLink] = useState<string>('');
	const [rotate, setRotate] = useState<number>(0);
	const [flipH, setFlipH] = useState<boolean>(false);
	const [flipV, setFlipV] = useState<boolean>(false);
	const [isCropping, setIsCropping] = useState<boolean>(false);
	const [cropBox, setCropBox] = useState<CropPixels | null>(null);
	const [savingVariation, setSavingVariation] = useState<boolean>(false);
	const [error, setError] = useState<string>('');

	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const previewImgRef = useRef<HTMLImageElement | null>(null);
	const cropDragCleanupRef = useRef<(() => void) | null>(null);
	const inspectSeqRef = useRef<number>(0);
	const formId = useId();

	useEffect(() => {
		return () => {
			cropDragCleanupRef.current?.();
			inspectSeqRef.current += 1;
		};
	}, []);

	const openInspectorForPickerItem = useCallback(
		(item: PwImagePickerItem) => {
			inspectSeqRef.current += 1;
			setActiveSrc(item.url);
			setOriginalUrl(item.url);
			setBasename(item.basename);
			setOwnerPageId(item.pageId);
			setOwnerMediaToken(item.mediaToken || '');
			setNaturalW(item.width);
			setNaturalH(item.height);
			setCanResizeServer(hasServerToken && (item.pageId > 0 || Boolean(item.mediaToken)));

			const defaultMaxW =
				imageConfig.maxWidth > 0 && item.width > imageConfig.maxWidth
					? imageConfig.maxWidth
					: item.width;
			const defaultH =
				item.width > 0 && item.height > 0 && defaultMaxW > 0
					? Math.max(1, Math.round((defaultMaxW / item.width) * item.height))
					: item.height;

			setWidthInput(defaultMaxW > 0 ? String(defaultMaxW) : '');
			setHeightInput(defaultH > 0 ? String(defaultH) : '');
			setLockAspect(true);
			setHidpi(imageConfig.hidpiDefault);
			setAlign('');
			setAltText(item.description || '');
			setCaptionEnabled(false);
			setCaptionText(item.description || '');
			setLinkOriginal(false);
			setExistingCustomLink('');
			setRotate(0);
			setFlipH(false);
			setFlipV(false);
			setIsCropping(false);
			setCropBox(null);
			setError('');
			setView('edit');
		},
		[hasServerToken, imageConfig.hidpiDefault, imageConfig.maxWidth]
	);

	// Initialize dialog when opened
	useEffect(() => {
		if (!open) {
			cropDragCleanupRef.current?.();
			inspectSeqRef.current += 1;
			return;
		}
		setError('');
		setSavingVariation(false);
		setShowPageSwitcher(false);

		const defaultPid = pwContext.pageId || pwContext.editPageId || 0;
		if (defaultPid > 0) {
			setSourceKey(`page:${defaultPid}`);
			setSourcePageTitle(pwContext.pageTitle || `#${defaultPid}`);
		} else if (hostImageFields.length > 0) {
			setSourceKey(`media:${hostImageFields[0]!.name}`);
			setSourcePageTitle(hostImageFields[0]!.label);
		} else {
			setSourceKey('');
			setSourcePageTitle('');
		}

		if (!hasServerToken && !initialAttrs) {
			setLibraryTab('external');
		} else {
			setLibraryTab(defaultPid > 0 || hostImageFields.length > 0 ? 'library' : 'external');
		}

		if (initialAttrs && initialAttrs.src) {
			// Editing an existing image in the editor
			const inferredPid = initialAttrs.pageId || extractPageIdFromAssetSrc(initialAttrs.src);
			setActiveSrc(initialAttrs.src);
			setOriginalUrl(initialAttrs.src);
			setBasename(initialAttrs.src.split('/').pop()?.split('?')[0] || '');
			setOwnerPageId(inferredPid);
			setOwnerMediaToken(initialAttrs.mediaToken || '');
			setNaturalW(initialAttrs.width || 0);
			setNaturalH(initialAttrs.height || 0);
			setCanResizeServer(false);

			setWidthInput(initialAttrs.width ? String(initialAttrs.width) : '');
			setHeightInput(initialAttrs.height ? String(initialAttrs.height) : '');
			setLockAspect(true);
			setHidpi(Boolean(initialAttrs.hidpi));
			setAlign(initialAttrs.align || '');
			setAltText(initialAttrs.alt || '');
			setCaptionEnabled(Boolean(initialAttrs.caption));
			setCaptionText(initialAttrs.captionText || initialAttrs.alt || '');
			setLinkOriginal(Boolean(initialAttrs.linkHref));
			setExistingCustomLink(initialAttrs.linkHref || '');
			setRotate(0);
			setFlipH(false);
			setFlipV(false);
			setIsCropping(false);
			setCropBox(null);
			setView('edit');

			if (hasServerToken) {
				const seq = ++inspectSeqRef.current;
				void fetchTiptapGet<{
					ok: boolean;
					found?: boolean;
					pageId?: number;
					mediaToken?: string;
					basename?: string;
					originalUrl?: string;
					originalWidth?: number;
					originalHeight?: number;
					canEditImages?: boolean;
				}>(pwContext, {
					action: 'inspectImage',
					src: initialAttrs.src,
					pageId: inferredPid > 0 ? inferredPid : undefined,
					mediaToken: initialAttrs.mediaToken || hostImageFields[0]?.mediaToken || undefined,
				}).then((res) => {
					if (seq !== inspectSeqRef.current) {
						return;
					}
					if (res?.ok && res.found && res.originalUrl) {
						setOriginalUrl(res.originalUrl);
						if (res.basename) setBasename(res.basename);
						if (typeof res.pageId === 'number') setOwnerPageId(res.pageId);
						if (res.mediaToken) setOwnerMediaToken(res.mediaToken);
						if (res.originalWidth && res.originalWidth > 0) setNaturalW(res.originalWidth);
						if (res.originalHeight && res.originalHeight > 0) setNaturalH(res.originalHeight);
						setCanResizeServer(Boolean(res.canEditImages));
					}
				});
			}
		} else {
			inspectSeqRef.current += 1;
			setExternalUrl('');
			setExternalAlt('');
			setView('library');
		}
	}, [open, initialAttrs, hasServerToken, pwContext, hostImageFields]);

	// Load images for active source in Library view
	const reloadLibraryImages = useCallback(async () => {
		if (!open || !hasServerToken || !sourceKey) {
			setImagesList([]);
			setCanUploadHere(false);
			return;
		}
		setLoadingImages(true);
		try {
			if (sourceKey.startsWith('media:')) {
				const fieldName = sourceKey.slice('media:'.length);
				const hostField = hostImageFields.find((f) => f.name === fieldName);
				if (!hostField) {
					setImagesList([]);
					setCanUploadHere(false);
					return;
				}
				const res = await fetchTiptapGet<{
					ok: boolean;
					canUpload: boolean;
					uploadFields: Array<{ name: string; label: string }>;
					images: PwImagePickerItem[];
				}>(pwContext, {
					action: 'images',
					mediaToken: hostField.mediaToken,
					langId: langId && langId > 0 ? langId : undefined,
				});
				if (res?.ok) {
					setImagesList(Array.isArray(res.images) ? res.images : []);
					setHasImageFields(true);
					setCanUploadHere(Boolean(res.canUpload));
					setUploadFields(Array.isArray(res.uploadFields) ? res.uploadFields : []);
					setSelectedUploadField(res.uploadFields?.[0]?.name || fieldName);
				}
			} else if (sourceKey.startsWith('page:')) {
				const pid = Number.parseInt(sourceKey.slice('page:'.length), 10);
				if (!pid || pid <= 0) {
					setImagesList([]);
					setHasImageFields(false);
					setCanUploadHere(false);
					return;
				}
				const res = await fetchTiptapGet<{
					ok: boolean;
					pageTitle?: string;
					hasImageFields?: boolean;
					canUpload: boolean;
					uploadFields: Array<{ name: string; label: string }>;
					images: PwImagePickerItem[];
				}>(pwContext, {
					action: 'images',
					pageId: pid,
					langId: langId && langId > 0 ? langId : undefined,
				});
				if (res?.ok) {
					if (res.pageTitle) setSourcePageTitle(res.pageTitle);
					const items = Array.isArray(res.images) ? res.images : [];
					const pageHasImgFields = res.hasImageFields !== false;
					setImagesList(items);
					setHasImageFields(pageHasImgFields);
					setCanUploadHere(Boolean(res.canUpload));
					if (!pageHasImgFields && items.length === 0) {
						setShowPageSwitcher(true);
					}
					const fields = Array.isArray(res.uploadFields) ? res.uploadFields : [];
					setUploadFields(fields);
					setSelectedUploadField((prev) =>
						fields.some((f) => f.name === prev)
							? prev
							: pwContext.uploadFieldName && fields.some((f) => f.name === pwContext.uploadFieldName)
								? pwContext.uploadFieldName
								: fields[0]?.name || ''
					);
				}
			}
		} finally {
			setLoadingImages(false);
		}
	}, [open, hasServerToken, sourceKey, hostImageFields, pwContext, langId]);

	useEffect(() => {
		if (open && view === 'library' && libraryTab === 'library' && sourceKey) {
			void reloadLibraryImages();
		}
	}, [open, view, libraryTab, sourceKey, reloadLibraryImages]);

	const handleUploadFiles = async (fileList: FileList | null) => {
		if (!fileList || fileList.length === 0) {
			return;
		}
		const files = Array.from(fileList);
		setUploading(true);
		setError('');
		try {
			let mediaToken: string | undefined;
			let pageId: number | undefined;
			if (sourceKey.startsWith('media:')) {
				const fName = sourceKey.slice('media:'.length);
				mediaToken = hostImageFields.find((f) => f.name === fName)?.mediaToken;
			} else if (sourceKey.startsWith('page:')) {
				pageId = Number.parseInt(sourceKey.slice('page:'.length), 10) || undefined;
			}
			const uploaded = await uploadTiptapImages(pwContext, files, {
				pageId,
				fieldName: selectedUploadField || undefined,
				mediaToken,
			});
			await reloadLibraryImages();
			if (uploaded.length === 1 && uploaded[0]) {
				openInspectorForPickerItem(uploaded[0]);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setUploading(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		}
	};

	const effectiveRefW = cropBox ? cropBox.width : naturalW;
	const effectiveRefH = cropBox ? cropBox.height : naturalH;

	const handleWidthChange = (raw: string) => {
		setWidthInput(raw);
		const w = Number.parseInt(raw, 10);
		if (lockAspect && Number.isFinite(w) && w > 0 && effectiveRefW > 0 && effectiveRefH > 0) {
			setHeightInput(String(Math.max(1, Math.round((w / effectiveRefW) * effectiveRefH))));
		}
	};

	const handleHeightChange = (raw: string) => {
		setHeightInput(raw);
		const h = Number.parseInt(raw, 10);
		if (lockAspect && Number.isFinite(h) && h > 0 && effectiveRefW > 0 && effectiveRefH > 0) {
			setWidthInput(String(Math.max(1, Math.round((h / effectiveRefH) * effectiveRefW))));
		}
	};

	const toggleCropMode = () => {
		if (isCropping) {
			setIsCropping(false);
			setCropBox(null);
			return;
		}
		const baseW = naturalW > 0 ? naturalW : previewImgRef.current?.naturalWidth || 400;
		const baseH = naturalH > 0 ? naturalH : previewImgRef.current?.naturalHeight || 300;
		const padX = Math.round(baseW * 0.1);
		const padY = Math.round(baseH * 0.1);
		const initialCrop: CropPixels = {
			x: padX,
			y: padY,
			width: Math.max(32, baseW - padX * 2),
			height: Math.max(32, baseH - padY * 2),
		};
		setCropBox(initialCrop);
		setWidthInput(String(initialCrop.width));
		setHeightInput(String(initialCrop.height));
		setIsCropping(true);
	};

	const startCropDrag = (
		mode: 'move' | 'se',
		e: React.PointerEvent<HTMLElement>
	) => {
		e.preventDefault();
		e.stopPropagation();
		const imgEl = previewImgRef.current;
		if (!imgEl || !cropBox) {
			return;
		}
		const rect = imgEl.getBoundingClientRect();
		const baseW = naturalW > 0 ? naturalW : imgEl.naturalWidth || rect.width;
		const baseH = naturalH > 0 ? naturalH : imgEl.naturalHeight || rect.height;
		if (rect.width <= 0 || rect.height <= 0 || baseW <= 0 || baseH <= 0) {
			return;
		}
		const scaleX = baseW / rect.width;
		const scaleY = baseH / rect.height;
		const startClientX = e.clientX;
		const startClientY = e.clientY;
		const startBox = { ...cropBox };

		const onMove = (ev: PointerEvent) => {
			const dx = Math.round((ev.clientX - startClientX) * scaleX);
			const dy = Math.round((ev.clientY - startClientY) * scaleY);
			if (mode === 'move') {
				const nx = Math.max(0, Math.min(baseW - startBox.width, startBox.x + dx));
				const ny = Math.max(0, Math.min(baseH - startBox.height, startBox.y + dy));
				setCropBox({ ...startBox, x: nx, y: ny });
			} else {
				const nw = Math.max(24, Math.min(baseW - startBox.x, startBox.width + dx));
				const nh = Math.max(24, Math.min(baseH - startBox.y, startBox.height + dy));
				setCropBox({ ...startBox, width: nw, height: nh });
				setWidthInput(String(nw));
				setHeightInput(String(nh));
			}
		};
		const cleanupDrag = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', cleanupDrag);
			window.removeEventListener('pointercancel', cleanupDrag);
			if (cropDragCleanupRef.current === cleanupDrag) {
				cropDragCleanupRef.current = null;
			}
		};
		cropDragCleanupRef.current?.();
		cropDragCleanupRef.current = cleanupDrag;
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', cleanupDrag);
		window.addEventListener('pointercancel', cleanupDrag);
	};

	const handleInsertExternal = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = externalUrl.trim();
		if (!isSafePwImageSrc(trimmed)) {
			setError(t('image.invalidUrl', 'Enter a valid https://, http://, or site-relative image URL.'));
			return;
		}
		inspectSeqRef.current += 1;
		setActiveSrc(trimmed);
		setOriginalUrl(trimmed);
		setBasename(trimmed.split('/').pop()?.split('?')[0] || '');
		setOwnerPageId(extractPageIdFromAssetSrc(trimmed));
		setOwnerMediaToken('');
		setNaturalW(0);
		setNaturalH(0);
		setCanResizeServer(false);
		setWidthInput('');
		setHeightInput('');
		setAltText(externalAlt.trim());
		setCaptionEnabled(false);
		setCaptionText(externalAlt.trim());
		setLinkOriginal(false);
		setRotate(0);
		setFlipH(false);
		setFlipV(false);
		setIsCropping(false);
		setCropBox(null);
		setError('');
		setView('edit');
	};

	const handleConfirmStudio = async (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!isSafePwImageSrc(activeSrc)) {
			setError(t('image.invalidUrl', 'Enter a valid https://, http://, or site-relative image URL.'));
			return;
		}

		const parsedW = Number.parseInt(widthInput, 10);
		const parsedH = Number.parseInt(heightInput, 10);
		const reqW = Number.isFinite(parsedW) && parsedW > 0 ? parsedW : 0;
		const reqH = Number.isFinite(parsedH) && parsedH > 0 ? parsedH : 0;
		const flipParam = flipH ? 'h' : flipV ? 'v' : '';

		let finalSrc = activeSrc;
		let finalWidth: number | null = reqW > 0 ? reqW : null;
		let finalHeight: number | null = !lockAspect && reqH > 0 ? reqH : null;
		let finalNosize = imageConfig.noSizeAttrs;
		let resolvedOriginalUrl = originalUrl || activeSrc;

		const shouldCallServer =
			hasServerToken &&
			canResizeServer &&
			(ownerPageId > 0 || Boolean(ownerMediaToken)) &&
			Boolean(basename || originalUrl);

		if (shouldCallServer) {
			setSavingVariation(true);
			setError('');
			try {
				const res = await postTiptapJson<{
					ok: boolean;
					src: string;
					originalSrc: string;
					width: number;
					height: number;
					hidpi: boolean;
					nosize: boolean;
				}>(pwContext, {
					action: 'resize',
					pageId: ownerPageId > 0 ? ownerPageId : undefined,
					mediaToken: ownerMediaToken || undefined,
					file: basename || originalUrl,
					width: reqW,
					height: !lockAspect ? reqH : 0,
					forceDimensions: !lockAspect && reqW > 0 && reqH > 0,
					hidpi: hidpi ? 1 : 0,
					rotate,
					flip: flipParam,
					crop: isCropping && cropBox ? cropBox : undefined,
				});
				finalSrc = res.src;
				resolvedOriginalUrl = res.originalSrc || resolvedOriginalUrl;
				finalWidth = res.width > 0 ? res.width : finalWidth;
				finalHeight = null;
				finalNosize = Boolean(res.nosize);
			} catch (err) {
				setSavingVariation(false);
				setError(err instanceof Error ? err.message : String(err));
				return;
			}
			setSavingVariation(false);
		}

		const finalLinkHref = linkOriginal
			? existingCustomLink && existingCustomLink !== activeSrc
				? existingCustomLink
				: resolvedOriginalUrl
			: '';

		onConfirm(
			{
				src: finalSrc,
				alt: altText.trim(),
				title: initialAttrs?.title || null,
				width: finalWidth,
				height: finalHeight,
				align,
				hidpi,
				extraClass: initialAttrs?.extraClass || '',
				nosize: finalNosize,
				linkHref: finalLinkHref,
				linkTarget: initialAttrs?.linkTarget || '',
				linkRel: initialAttrs?.linkRel || '',
				linkTitle: initialAttrs?.linkTitle || '',
				linkClass: initialAttrs?.linkClass || '',
				caption: captionEnabled,
				captionText: captionEnabled ? captionText.trim() || altText.trim() : '',
				pageId: ownerPageId,
				mediaToken: ownerMediaToken,
			},
			editingPos
		);
		onClose();
	};

	const previewSrc = canResizeServer && originalUrl ? originalUrl : activeSrc;
	const baseWForCrop = naturalW > 0 ? naturalW : 1;
	const baseHForCrop = naturalH > 0 ? naturalH : 1;

	return (
		<NativeModalDialog
			open={open}
			onClose={onClose}
			title={
				view === 'edit'
					? editingPos !== null
						? t('image.dialogEditTitle', 'Edit Image')
						: t('image.insertImageBtn', 'Insert This Image')
					: t('image.dialogSelectTitle', 'Select Image')
			}
			closeLabel={t('editor.closeDialog', 'Close dialog')}
			dialogKind="image"
			maxWidthClass="max-w-3xl"
			footer={
				view === 'edit' ? (
					<>
						{hasLibrary ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => {
									setIsCropping(false);
									setView('library');
								}}
								className="me-auto"
							>
								{t('image.backToLibrary', 'Back to Images')}
							</Button>
						) : null}
						<Button type="button" variant="ghost" size="sm" onClick={onClose}>
							{t('image.cancel', 'Cancel')}
						</Button>
						<Button
							type="submit"
							form={formId}
							variant="primary"
							size="sm"
							disabled={savingVariation}
							data-rw-pw-image-confirm=""
						>
							{savingVariation
								? t('image.savingVariation', 'Generating image variation...')
								: editingPos !== null
									? t('image.updateImageBtn', 'Update Image')
									: t('image.insertImageBtn', 'Insert This Image')}
						</Button>
					</>
				) : (
					<Button type="button" variant="ghost" size="sm" onClick={onClose}>
						{t('image.cancel', 'Cancel')}
					</Button>
				)
			}
		>
			{view === 'library' ? (
				<div className="space-y-4">
					<Tabs value={libraryTab} onValueChange={setLibraryTab}>
						<TabsList>
							{hasServerToken ? (
								<TabsTrigger value="library">{t('image.tabLibrary', 'Page Images')}</TabsTrigger>
							) : null}
							<TabsTrigger value="external">{t('image.tabExternalUrl', 'External URL')}</TabsTrigger>
						</TabsList>

						{hasServerToken ? (
							<TabsContent value="library" className="space-y-3">
								{/* Source Bar + Cross-Page Switcher + Direct Upload */}
								<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/25 px-3 py-2">
									<div className="flex flex-wrap items-center gap-2 min-w-0">
										<span className="text-xs font-medium text-muted-foreground">
											{t('image.sourcePageLabel', 'Image source')}:
										</span>
										{hostImageFields.length > 0 && !sourceKey.startsWith('page:') ? (
											<Select
												aria-label={t('image.sourcePageLabel', 'Image source')}
												value={sourceKey}
												onChange={(e) => setSourceKey(e.target.value)}
												options={hostImageFields.map((f) => ({
													value: `media:${f.name}`,
													label: f.label,
												}))}
												className="h-7 w-auto text-xs"
											/>
										) : (
											<span className="truncate text-xs font-semibold text-foreground">
												{sourcePageTitle || t('image.currentItemSource', 'Current item')}
											</span>
										)}
										<Button
											type="button"
											variant="outline"
											size="xs"
											onClick={() => setShowPageSwitcher((prev) => !prev)}
											data-rw-pw-image-switch-page=""
										>
											{showPageSwitcher
												? t('image.hideSourcePicker', 'Hide page browser')
												: t('image.changeSourcePage', 'Choose another page')}
										</Button>
									</div>

									{canUploadHere ? (
										<div className="flex items-center gap-1.5">
											{uploadFields.length > 1 ? (
												<Select
													aria-label={t('image.uploadTargetField', 'Upload to field')}
													value={selectedUploadField}
													onChange={(e) => setSelectedUploadField(e.target.value)}
													options={uploadFields.map((uf) => ({
														value: uf.name,
														label: uf.label,
													}))}
													className="h-7 w-auto text-xs"
												/>
											) : null}
											<input
												ref={fileInputRef}
												type="file"
												accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
												multiple
												className="sr-only"
												onChange={(e) => void handleUploadFiles(e.target.files)}
												data-rw-pw-image-upload-input=""
											/>
											<Button
												type="button"
												variant="primary"
												size="xs"
												disabled={uploading}
												onClick={() => fileInputRef.current?.click()}
												data-rw-pw-image-upload-btn=""
											>
												{uploading
													? t('image.uploadingImages', 'Uploading image...')
													: t('image.uploadImageBtn', 'Upload Image')}
											</Button>
										</div>
									) : null}
								</div>

								{showPageSwitcher ? (
									<PageTreeBrowser
										pwContext={pwContext}
										langId={langId}
										selectedPageId={
											sourceKey.startsWith('page:')
												? Number.parseInt(sourceKey.slice('page:'.length), 10)
												: undefined
										}
										onSelectPage={(p) => {
											setSourceKey(`page:${p.id}`);
											setSourcePageTitle(p.title);
											setShowPageSwitcher(false);
										}}
										t={t}
									/>
								) : null}

								{error ? (
									<p role="alert" className="text-xs font-medium text-destructive">
										{error}
									</p>
								) : null}

								{loadingImages ? (
									<p className="py-8 text-center text-xs text-muted-foreground">
										{t('image.loadingImages', 'Loading images...')}
									</p>
								) : imagesList.length === 0 ? (
									<div
										className="rounded-lg border border-dashed border-border py-8 px-4 text-center text-xs text-muted-foreground"
										data-rw-pw-image-empty={hasImageFields ? 'empty' : 'no-fields'}
									>
										{!hasImageFields
											? t(
													'image.noImageFieldsOnPage',
													'There are no image fields on this page. Choose another page below to select or upload images.'
												)
											: !canUploadHere
												? t(
														'image.noImagesUploadUnavailable',
														'No images found on this page. Choose another page to select images from.'
													)
												: t(
														'image.noImagesAvailable',
														'No images found on this source. Upload an image or choose another page.'
													)}
									</div>
								) : (
									<div
										className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-80 overflow-y-auto p-0.5"
										data-rw-pw-image-grid=""
									>
										{imagesList.map((img) => (
											<button
												key={`${img.pageId}-${img.field}-${img.basename}`}
												type="button"
												onClick={() => openInspectorForPickerItem(img)}
												className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-start transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
												data-rw-pw-image-tile={img.basename}
											>
												<div className="aspect-4/3 w-full overflow-hidden bg-muted/40 flex items-center justify-center">
													<img
														src={img.thumbUrl}
														alt={img.description || img.basename}
														loading="lazy"
														className="max-h-full max-w-full object-contain transition-transform group-hover:scale-103"
													/>
												</div>
												<div className="p-2 space-y-0.5 min-w-0">
													<p className="truncate text-xs font-medium text-foreground">
														{img.basename}
													</p>
													<p className="truncate text-[10px] tabular-nums text-muted-foreground">
														{img.width > 0 ? `${img.width}×${img.height} · ` : ''}
														{img.fieldLabel}
													</p>
												</div>
											</button>
										))}
									</div>
								)}
							</TabsContent>
						) : null}

						<TabsContent value="external">
							<form onSubmit={handleInsertExternal} className="space-y-3">
								<div className="space-y-1.5">
									<Label htmlFor={`${formId}-ext-url`}>{t('image.urlLabel', 'Image URL')}</Label>
									<Input
										id={`${formId}-ext-url`}
										type="url"
										value={externalUrl}
										onChange={(e) => {
											setExternalUrl(e.target.value);
											if (error) setError('');
										}}
										placeholder={t('image.urlPlaceholder', '/site/assets/files/... or https://...')}
										data-rw-pw-image-ext-url=""
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor={`${formId}-ext-alt`}>
										{t('image.altLabel', 'Image alt text')}
									</Label>
									<Input
										id={`${formId}-ext-alt`}
										type="text"
										value={externalAlt}
										onChange={(e) => setExternalAlt(e.target.value)}
										placeholder={t('image.altPlaceholder', 'Alt description')}
									/>
								</div>
								{error ? (
									<p role="alert" className="text-xs font-medium text-destructive">
										{error}
									</p>
								) : null}
								<div className="flex justify-end">
									<Button type="submit" variant="primary" size="sm" data-rw-pw-image-ext-continue="">
										{t('image.insert', 'Insert')}
									</Button>
								</div>
							</form>
						</TabsContent>
					</Tabs>
				</div>
			) : (
				/* Step 2: ProcessWire Image Variation, Crop & Placement Studio */
				<form id={formId} onSubmit={(e) => void handleConfirmStudio(e)} className="grid grid-cols-1 md:grid-cols-12 gap-4">
					<div className="md:col-span-6 flex flex-col gap-2.5">
						<div className="relative flex min-h-52 max-h-80 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/35 p-3 select-none">
							<div className="relative inline-block max-h-72 max-w-full">
								<img
									ref={previewImgRef}
									src={previewSrc}
									alt={altText}
									onLoad={(e) => {
										const el = e.currentTarget;
										if (naturalW <= 0 && el.naturalWidth > 0) {
											setNaturalW(el.naturalWidth);
											setNaturalH(el.naturalHeight);
										}
									}}
									style={{
										transform: [
											rotate ? `rotate(${rotate}deg)` : '',
											flipH ? 'scaleX(-1)' : '',
											flipV ? 'scaleY(-1)' : '',
										]
											.filter(Boolean)
											.join(' ') || undefined,
									}}
									className="block max-h-72 max-w-full object-contain"
								/>

								{isCropping && cropBox ? (
									<div
										onPointerDown={(e) => startCropDrag('move', e)}
										style={{
											left: `${(cropBox.x / baseWForCrop) * 100}%`,
											top: `${(cropBox.y / baseHForCrop) * 100}%`,
											width: `${(cropBox.width / baseWForCrop) * 100}%`,
											height: `${(cropBox.height / baseHForCrop) * 100}%`,
										}}
										className="absolute border-2 border-primary bg-primary/15 shadow-sm cursor-move"
										data-rw-pw-crop-box=""
									>
										<span className="pointer-events-none absolute top-1 left-1 rounded bg-foreground/85 px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-background">
											{cropBox.width}&times;{cropBox.height}
										</span>
										<button
											type="button"
											aria-label={t('image.resizeHandleAria', 'Drag to resize image')}
											onPointerDown={(e) => startCropDrag('se', e)}
											className="absolute -bottom-1.5 -right-1.5 size-3.5 rounded-full border-2 border-background bg-primary cursor-nwse-resize"
										/>
									</div>
								) : null}
							</div>
						</div>

						{canResizeServer ? (
							<div className="flex flex-wrap items-center justify-between gap-1.5">
								<Button
									type="button"
									variant={isCropping ? 'primary' : 'outline'}
									size="xs"
									onClick={toggleCropMode}
									data-rw-pw-crop-toggle=""
								>
									{isCropping
										? t('image.cancelCropBtn', 'Cancel Crop')
										: t('image.cropToggleBtn', 'Crop')}
								</Button>
								<div className="inline-flex items-center gap-1">
									<Button
										type="button"
										variant="outline"
										size="xs"
										aria-label={t('image.rotateLeftBtn', 'Rotate 90° counter-clockwise')}
										title={t('image.rotateLeftBtn', 'Rotate 90° counter-clockwise')}
										onClick={() => setRotate((r) => ((r - 90) % 360))}
									>
										<DynamicIcon name="rotate-ccw" className="size-3.5" aria-hidden="true" />
									</Button>
									<Button
										type="button"
										variant="outline"
										size="xs"
										aria-label={t('image.rotateRightBtn', 'Rotate 90° clockwise')}
										title={t('image.rotateRightBtn', 'Rotate 90° clockwise')}
										onClick={() => setRotate((r) => ((r + 90) % 360))}
									>
										<DynamicIcon name="rotate-cw" className="size-3.5" aria-hidden="true" />
									</Button>
									<Button
										type="button"
										variant={flipH ? 'primary' : 'outline'}
										size="xs"
										aria-label={t('image.flipHorizontalBtn', 'Flip horizontal')}
										title={t('image.flipHorizontalBtn', 'Flip horizontal')}
										onClick={() => {
											setFlipH((v) => !v);
											if (!flipH) setFlipV(false);
										}}
									>
										<DynamicIcon name="flip-horizontal" className="size-3.5" aria-hidden="true" />
									</Button>
									<Button
										type="button"
										variant={flipV ? 'primary' : 'outline'}
										size="xs"
										aria-label={t('image.flipVerticalBtn', 'Flip vertical')}
										title={t('image.flipVerticalBtn', 'Flip vertical')}
										onClick={() => {
											setFlipV((v) => !v);
											if (!flipV) setFlipH(false);
										}}
									>
										<DynamicIcon name="flip-vertical" className="size-3.5" aria-hidden="true" />
									</Button>
								</div>
							</div>
						) : null}
					</div>

					<div className="md:col-span-6 space-y-3.5">
						<div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
							<div className="flex items-center justify-between gap-2">
								<h3 className="text-xs font-semibold text-foreground">
									{t('image.dimensionsHeading', 'Dimensions & Quality')}
								</h3>
								{naturalW > 0 && naturalH > 0 ? (
									<button
										type="button"
										onClick={() => {
											setIsCropping(false);
											setCropBox(null);
											setWidthInput(String(naturalW));
											setHeightInput(String(naturalH));
										}}
										className="text-[11px] font-medium tabular-nums text-primary-ink hover:underline cursor-pointer"
									>
										{t(
											'image.resetOriginalSize',
											{ width: naturalW, height: naturalH },
											'Original size ({width}x{height})'
										)}
									</button>
								) : null}
							</div>

							<div className="grid grid-cols-2 gap-2.5">
								<div className="space-y-1">
									<Label htmlFor={`${formId}-w`}>{t('image.widthLabel', 'Width (px)')}</Label>
									<Input
										id={`${formId}-w`}
										type="number"
										min={1}
										max={16384}
										value={widthInput}
										onChange={(e) => handleWidthChange(e.target.value)}
										className="h-8 tabular-nums"
										data-rw-pw-image-width=""
									/>
								</div>
								<div className="space-y-1">
									<Label htmlFor={`${formId}-h`}>{t('image.heightLabel', 'Height (px)')}</Label>
									<Input
										id={`${formId}-h`}
										type="number"
										min={1}
										max={16384}
										value={heightInput}
										onChange={(e) => handleHeightChange(e.target.value)}
										className="h-8 tabular-nums"
										data-rw-pw-image-height=""
									/>
								</div>
							</div>

							<div className="flex flex-wrap items-center gap-4 pt-1">
								<label className="inline-flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none">
									<input
										type="checkbox"
										checked={lockAspect}
										onChange={(e) => setLockAspect(e.target.checked)}
										className="rounded border-border"
									/>
									<span>{t('image.lockAspect', 'Keep aspect ratio')}</span>
								</label>
								<label className="inline-flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none">
									<input
										type="checkbox"
										checked={hidpi}
										onChange={(e) => setHidpi(e.target.checked)}
										className="rounded border-border"
										data-rw-pw-image-hidpi=""
									/>
									<span>{t('image.hidpiLabel', 'HiDPI / Retina')}</span>
								</label>
							</div>
						</div>

						{/* Alignment */}
						<div className="space-y-1.5">
							<span className="block text-xs font-medium text-foreground">
								{t('image.alignmentLabel', 'Alignment')}
							</span>
							<div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t('image.alignmentLabel', 'Alignment')}>
								{[
									{ value: '', label: t('image.alignNone', 'No alignment') },
									{ value: imageConfig.alignLeftClass, label: t('image.alignLeft', 'Align left') },
									{ value: imageConfig.alignCenterClass, label: t('image.alignCenter', 'Align center') },
									{ value: imageConfig.alignRightClass, label: t('image.alignRight', 'Align right') },
								].map((opt) => {
									const active = align === opt.value;
									return (
										<button
											key={opt.value || 'none'}
											type="button"
											aria-pressed={active}
											onClick={() => setAlign(opt.value)}
											className={cn(
												'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
												active
													? 'border-primary bg-primary text-primary-foreground'
													: 'border-border bg-background text-foreground hover:bg-muted'
											)}
											data-rw-pw-image-align={opt.value || 'none'}
										>
											{opt.label}
										</button>
									);
								})}
							</div>
						</div>

						{/* Alt Text */}
						<div className="space-y-1.5">
							<Label htmlFor={`${formId}-alt`}>{t('image.altLabel', 'Image alt text')}</Label>
							<Input
								id={`${formId}-alt`}
								type="text"
								value={altText}
								onChange={(e) => setAltText(e.target.value)}
								placeholder={t('image.altPlaceholder', 'Alt description')}
								data-rw-pw-image-alt=""
							/>
						</div>

						{/* Caption (`<figure><figcaption>`) & Link to Larger */}
						<div className="space-y-2">
							<label className="inline-flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
								<input
									type="checkbox"
									checked={captionEnabled}
									onChange={(e) => {
										const next = e.target.checked;
										setCaptionEnabled(next);
										if (next && !captionText.trim() && altText.trim()) {
											setCaptionText(altText.trim());
										}
									}}
									className="rounded border-border"
									data-rw-pw-image-caption-toggle=""
								/>
								<span>{t('image.captionToggleLabel', 'Show caption (<figure>)')}</span>
							</label>

							{captionEnabled ? (
								<div className="space-y-1">
									<Label htmlFor={`${formId}-caption`} className="sr-only">
										{t('image.captionInputLabel', 'Caption text')}
									</Label>
									<Input
										id={`${formId}-caption`}
										type="text"
										value={captionText}
										onChange={(e) => setCaptionText(e.target.value)}
										placeholder={t('image.captionInputPlaceholder', 'Enter image caption...')}
										data-rw-pw-image-caption-input=""
									/>
								</div>
							) : null}

							<label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
								<input
									type="checkbox"
									checked={linkOriginal}
									onChange={(e) => setLinkOriginal(e.target.checked)}
									className="rounded border-border"
									data-rw-pw-image-link-original=""
								/>
								<span>{t('image.linkOriginalLabel', 'Link to full-size original image')}</span>
							</label>
						</div>

						{error ? (
							<p role="alert" className="text-xs font-medium text-destructive">
								{error}
							</p>
						) : null}
					</div>
				</form>
			)}
		</NativeModalDialog>
	);
}
