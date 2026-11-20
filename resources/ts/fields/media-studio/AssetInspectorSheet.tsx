import React, { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from '../../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../../lib/utils';
import { Badge, Button, Input, PortalRoot } from '../../ui';
import {
	parseFocusPoint,
	type FocusCoordinates,
	type MediaCustomFieldRenderer,
	type StudioMediaItem,
} from '../mediaUtils';
import { formatMediaBytes, navigateTablistByKey, scrollTabIntoView } from '../shared';
import type { InputfieldLanguageItem, InputfieldMediaItem } from '../types';
import { clampPct, CropStage, stripAdminCacheBuster, type CropSelectionRect } from './CropStage';
import { MultiLangDescriptionEditor, TagsChipEditor } from './MediaEditors';
import {
	getRegisteredCustomFieldRenderer,
	MediaCustomFieldRendererContext,
	postMediaJsonAction,
} from './mediaHelpers';

type InspectorTabKey = 'details' | 'focus' | 'studio' | 'custom';

export function AssetInspectorSheet({
	open,
	item,
	itemIndex,
	totalItems,
	isImage,
	isLocked,
	descriptionRows,
	useTags,
	tagsList,
	tagsPredefinedOnly,
	noUpload,
	focusMode,
	useImageEditor,
	mediaEndpoint,
	mediaToken,
	clientOwnerId,
	clientInputName,
	languages,
	activeLangId,
	initialTab = 'details',
	onSelectLang,
	onOpenChange,
	onNavigateItem,
	onUpdateDescription,
	onUpdateTags,
	onUpdateFocus,
	onUpdateCustomValue,
	onTriggerReplace,
	onToggleDelete,
	onItemMutatedFromServer,
}: {
	open: boolean;
	item: StudioMediaItem | null;
	itemIndex: number;
	totalItems: number;
	isImage: boolean;
	isLocked: boolean;
	descriptionRows: number;
	useTags: boolean;
	tagsList?: string[];
	tagsPredefinedOnly?: boolean;
	noUpload?: boolean;
	focusMode?: string;
	useImageEditor?: boolean;
	mediaEndpoint?: string;
	mediaToken?: string;
	clientOwnerId?: string;
	clientInputName?: string;
	languages?: InputfieldLanguageItem[];
	activeLangId: number;
	initialTab?: InspectorTabKey;
	onSelectLang: (langId: number) => void;
	onOpenChange: (open: boolean) => void;
	onNavigateItem: (delta: -1 | 1) => void;
	onUpdateDescription: (itemId: string, value: string, langId?: number) => void;
	onUpdateTags: (itemId: string, tags: string) => void;
	onUpdateFocus: (itemId: string, coords: FocusCoordinates) => void;
	onUpdateCustomValue: (itemId: string, fieldName: string, value: unknown) => void;
	onTriggerReplace?: (item: StudioMediaItem) => void;
	onToggleDelete: (itemId: string) => void;
	onItemMutatedFromServer: (updated: InputfieldMediaItem) => void;
}): React.ReactElement | null {
	const { t } = useTranslations('core');
	const customFieldRendererFromCtx = useContext(MediaCustomFieldRendererContext);
	const customFieldRendererFromRt =
		typeof window !== 'undefined'
			? (
					window as unknown as {
						ReactWorkspaceRuntime?: {
							__getMediaCustomFieldRenderer?: () => MediaCustomFieldRenderer | null;
							ensureFieldsLoaded?: () => Promise<void>;
						};
					}
				).ReactWorkspaceRuntime?.__getMediaCustomFieldRenderer?.() ?? null
			: null;
	const customFieldRenderer =
		customFieldRendererFromCtx ?? customFieldRendererFromRt ?? getRegisteredCustomFieldRenderer();
	const hasCustomFields = Boolean(item?.customFields && item.customFields.length > 0);
	const [, setCustomRendererTick] = useState(0);

	useEffect(() => {
		if (!open || !hasCustomFields || customFieldRendererFromCtx || customFieldRendererFromRt || getRegisteredCustomFieldRenderer()) {
			return;
		}
		const rt =
			typeof window !== 'undefined'
				? (
						window as unknown as {
							ReactWorkspaceRuntime?: {
								ensureFieldsLoaded?: () => Promise<void>;
							};
						}
					).ReactWorkspaceRuntime
				: undefined;
		void rt?.ensureFieldsLoaded?.().then(() => setCustomRendererTick((n) => n + 1));
	}, [open, hasCustomFields, customFieldRendererFromCtx, customFieldRendererFromRt]);

	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const backdropPressOutsideRef = useRef<boolean>(false);
	const focusPadRef = useRef<HTMLDivElement | null>(null);
	const focusBoundsRef = useRef<DOMRect | null>(null);

	const actionsTriggerRef = useRef<HTMLButtonElement | null>(null);
	const actionsPopoverRef = useRef<HTMLDivElement | null>(null);
	const actionsFocusGroupRef = useRef<HTMLDivElement | null>(null);
	const pointerPressedTriggerRef = useRef<boolean>(false);
	const enterMenuOnOpenRef = useRef<boolean>(false);
	const lastMenuClosedAtRef = useRef<number>(0);

	const baseUid = useId();
	const cleanUid = useMemo(() => baseUid.replace(/[^a-zA-Z0-9_-]/g, ''), [baseUid]);
	const titleId = `rw-insp-title-${cleanUid}`;
	const actionsTriggerId = `rw-insp-actions-btn-${cleanUid}`;
	const actionsMenuId = `rw-insp-actions-menu-${cleanUid}`;
	const zoomInputId = `rw-insp-zoom-${cleanUid}`;

	const [activeTab, setActiveTab] = useState<InspectorTabKey>(initialTab);
	const [copiedFeedback, setCopiedFeedback] = useState<string>('');
	const [isActionsMenuOpen, setIsActionsMenuOpen] = useState<boolean>(false);
	const [isTransforming, setIsTransforming] = useState<boolean>(false);
	const [isAnalyzingColors, setIsAnalyzingColors] = useState<boolean>(false);
	const [studioError, setStudioError] = useState<string>('');
	const [cropAspect, setCropAspect] = useState<number | null>(null);
	const [cropRect, setCropRect] = useState<CropSelectionRect | null>(null);
	const [isDraggingFocus, setIsDraggingFocus] = useState<boolean>(false);

	const getEnabledActionItems = useCallback((): HTMLElement[] => {
		const group = actionsFocusGroupRef.current;
		if (!group) {
			return [];
		}
		return Array.from(group.querySelectorAll<HTMLElement>('button, a[href]')).filter(
			(el) =>
				el.closest('[focusgroup]') === group &&
				!(el as HTMLButtonElement).disabled &&
				el.getAttribute('aria-disabled') !== 'true'
		);
	}, []);

	const focusFirstActionItem = useCallback(() => {
		const firstItem = getEnabledActionItems()[0];
		if (firstItem) {
			firstItem.focus({ preventScroll: true });
		}
	}, [getEnabledActionItems]);

	const closeActionsMenu = useCallback(
		(opts: { fromPointer: boolean; restoreFocus?: boolean }) => {
			const pop = actionsPopoverRef.current;
			const trigger = actionsTriggerRef.current;
			lastMenuClosedAtRef.current = Date.now();
			if (opts.restoreFocus !== false && trigger) {
				trigger.focus({
					preventScroll: true,
					...(opts.fromPointer ? ({ focusVisible: false } as FocusOptions) : {}),
				});
			}
			if (pop) {
				try {
					if (pop.matches(':popover-open')) {
						pop.hidePopover();
					}
				} catch {
					pop.removeAttribute('open');
				}
			}
			setIsActionsMenuOpen(false);
		},
		[]
	);

	const positionFallbackActionsMenu = useCallback(() => {
		const pop = actionsPopoverRef.current;
		const trigger = actionsTriggerRef.current;
		if (!pop || !trigger || typeof window === 'undefined') {
			return;
		}
		if (typeof CSS !== 'undefined' && CSS.supports('position-area: block-end')) {
			if (typeof ToggleEvent !== 'undefined' && !('source' in ToggleEvent.prototype) && CSS.supports('anchor-name: --a')) {
				const anchorVar = `--${actionsMenuId}`;
				trigger.style.setProperty('anchor-name', anchorVar);
				pop.style.setProperty('position-anchor', anchorVar);
			}
			return;
		}
		const trigRect = trigger.getBoundingClientRect();
		const popRect = pop.getBoundingClientRect();
		const menuW = popRect.width || 190;
		const menuH = popRect.height || 140;
		const gap = 4;
		const pad = 8;

		let left = trigRect.right - menuW;
		left = Math.max(pad, Math.min(left, window.innerWidth - menuW - pad));

		let top = trigRect.bottom + gap;
		if (top + menuH > window.innerHeight - pad && trigRect.top - gap - menuH >= pad) {
			top = trigRect.top - gap - menuH;
		} else {
			top = Math.max(pad, Math.min(top, window.innerHeight - menuH - pad));
		}

		pop.style.left = `${Math.round(left)}px`;
		pop.style.top = `${Math.round(top)}px`;
	}, [actionsMenuId]);

	useEffect(() => {
		setActiveTab(initialTab);
		setCropRect(null);
		setStudioError('');
		setIsActionsMenuOpen(false);
	}, [initialTab, item?.id, open]);

	useEffect(() => {
		const pop = actionsPopoverRef.current;
		const group = actionsFocusGroupRef.current;
		const trigger = actionsTriggerRef.current;
		if (!pop || !group || !open) {
			return;
		}

		const hasNativeFocusGroup =
			typeof HTMLElement !== 'undefined' && 'focusGroup' in HTMLElement.prototype;

		if (!hasNativeFocusGroup) {
			group.setAttribute('role', 'menu');
			group.querySelectorAll('button:not([role]), a[href]:not([role])').forEach((el) => {
				el.setAttribute('role', 'menuitem');
			});
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				closeActionsMenu({ fromPointer: false, restoreFocus: true });
				return;
			}
			if (event.key === 'Tab') {
				closeActionsMenu({ fromPointer: false, restoreFocus: false });
				return;
			}
			const isHomeEnd = event.key === 'Home' || event.key === 'End';
			const isArrow = event.key === 'ArrowDown' || event.key === 'ArrowUp';
			if (!isHomeEnd && !(isArrow && !hasNativeFocusGroup)) {
				return;
			}
			const items = getEnabledActionItems();
			if (items.length === 0) {
				return;
			}
			const current = items.indexOf(document.activeElement as HTMLElement);
			const next =
				event.key === 'Home'
					? 0
					: event.key === 'End'
						? items.length - 1
						: current < 0
							? 0
							: (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
			event.preventDefault();
			event.stopImmediatePropagation();
			items[next]?.focus({ preventScroll: true });
		};

		const handleToggle = (rawEvent: Event) => {
			const nextOpen =
				(rawEvent as ToggleEvent).newState === 'open' ||
				(typeof pop.matches === 'function' && pop.matches(':popover-open'));
			setIsActionsMenuOpen(nextOpen);

			if (nextOpen) {
				positionFallbackActionsMenu();
				const shouldEnter = enterMenuOnOpenRef.current;
				enterMenuOnOpenRef.current = false;
				if (shouldEnter) {
					focusFirstActionItem();
				} else if (trigger) {
					trigger.focus({
						preventScroll: true,
						...({ focusVisible: false } as FocusOptions),
					});
				}
			} else {
				lastMenuClosedAtRef.current = Date.now();
				enterMenuOnOpenRef.current = false;
			}
		};

		group.addEventListener('keydown', handleKeyDown, true);
		pop.addEventListener('toggle', handleToggle);

		return () => {
			group.removeEventListener('keydown', handleKeyDown, true);
			pop.removeEventListener('toggle', handleToggle);
		};
	}, [
		closeActionsMenu,
		focusFirstActionItem,
		getEnabledActionItems,
		isLocked,
		item?.id,
		mediaEndpoint,
		mediaToken,
		onTriggerReplace,
		open,
		positionFallbackActionsMenu,
	]);

	useEffect(() => {
		if (!isActionsMenuOpen || typeof document === 'undefined') {
			return;
		}
		const handleFocusIn = (event: FocusEvent) => {
			const target = event.target as Node | null;
			if (!target) {
				return;
			}
			if (
				actionsPopoverRef.current?.contains(target) ||
				actionsTriggerRef.current?.contains(target)
			) {
				return;
			}
			closeActionsMenu({ fromPointer: false, restoreFocus: false });
		};
		document.addEventListener('focusin', handleFocusIn);
		return () => document.removeEventListener('focusin', handleFocusIn);
	}, [closeActionsMenu, isActionsMenuOpen]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) {
			return;
		}
		if (open) {
			if (!dialog.open) {
				try {
					dialog.showModal();
				} catch {
					dialog.setAttribute('open', '');
				}
			}
		} else if (dialog.open) {
			dialog.close();
		}
	}, [open]);

	if (!open || !item || typeof document === 'undefined') {
		return null;
	}

	const canUseFocus = isImage && focusMode !== 'off' && item.ext !== 'svg';
	const canUseStudio =
		Boolean(isImage && useImageEditor !== false && !isLocked && mediaEndpoint && mediaToken) &&
		item.ext !== 'svg';
	const canReplaceItem = Boolean(!isLocked && !noUpload && onTriggerReplace && mediaEndpoint && mediaToken);
	const focusCoords = parseFocusPoint(item.focus);
	const safeOriginalHref = sanitizeHref(item.url);
	const cleanCopyUrl = stripAdminCacheBuster(safeOriginalHref);
	const hasQuickActionMenu = Boolean(safeOriginalHref || canReplaceItem);
	const paletteColors = Array.from(
		new Set([
			...(item.dominantColor ? [item.dominantColor] : []),
			...(Array.isArray(item.palette) ? item.palette : []),
		])
	);

	const copyToClipboard = (text: string, notice: string) => {
		if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
			void navigator.clipboard.writeText(text);
			setCopiedFeedback(notice);
			window.setTimeout(() => setCopiedFeedback(''), 1800);
		}
	};

	const handleMenuItemPointerMove = (e: React.PointerEvent<HTMLElement>) => {
		if (typeof document !== 'undefined' && typeof document.elementFromPoint === 'function') {
			const hit = document.elementFromPoint(e.clientX, e.clientY);
			if (hit && !e.currentTarget.contains(hit)) {
				return;
			}
		}
		e.currentTarget.focus({
			preventScroll: true,
			...({ focusVisible: false } as FocusOptions),
		});
	};

	const updateFocusFromPointer = (clientX: number, clientY: number, cachedRect?: DOMRect | null) => {
		if (isLocked || !focusPadRef.current) {
			return;
		}
		const rect = cachedRect || focusBoundsRef.current || focusPadRef.current.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) {
			return;
		}
		const left = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
		const top = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
		onUpdateFocus(item.id, { top, left, zoom: focusCoords.zoom });
	};

	const runServerTransform = async (operationPayload: Record<string, unknown>) => {
		if (!mediaEndpoint || !mediaToken) {
			return;
		}
		setIsTransforming(true);
		setStudioError('');
		const res = await postMediaJsonAction(mediaEndpoint, {
			action: 'transform',
			mediaToken,
			targetHash: item.hash,
			targetName: item.name,
			...(clientOwnerId ? { _clientOwnerId: clientOwnerId } : {}),
			...(clientInputName ? { _clientInputName: clientInputName } : {}),
			...operationPayload,
		});
		setIsTransforming(false);
		if (res.ok && res.item) {
			setCropRect(null);
			onItemMutatedFromServer(res.item);
		} else {
			setStudioError(res.error || t('media.uploadFailed', 'Transform failed.'));
		}
	};

	const handleApplyCrop = async () => {
		if (!cropRect || cropRect.w < 2 || cropRect.h < 2) {
			return;
		}
		const naturalW = item.width && item.width > 0 ? item.width : 1000;
		const naturalH = item.height && item.height > 0 ? item.height : 1000;
		const pxX = Math.max(0, Math.round((cropRect.x / 100) * naturalW));
		const pxY = Math.max(0, Math.round((cropRect.y / 100) * naturalH));
		const pxW = Math.max(1, Math.round((cropRect.w / 100) * naturalW));
		const pxH = Math.max(1, Math.round((cropRect.h / 100) * naturalH));
		await runServerTransform({
			operation: 'crop',
			x: pxX,
			y: pxY,
			width: pxW,
			height: pxH,
		});
	};

	const handleExtractColors = async () => {
		if (!mediaEndpoint || !mediaToken) {
			return;
		}
		setIsAnalyzingColors(true);
		const res = await postMediaJsonAction(mediaEndpoint, {
			action: 'inspect',
			mediaToken,
			targetHash: item.hash,
			targetName: item.name,
			...(clientOwnerId ? { _clientOwnerId: clientOwnerId } : {}),
			...(clientInputName ? { _clientInputName: clientInputName } : {}),
		});
		setIsAnalyzingColors(false);
		if (res.ok && res.item) {
			onItemMutatedFromServer(res.item);
		}
	};

	const availableTabs: Array<{ key: InspectorTabKey; label: string; icon: string }> = [
		{ key: 'details', label: t('media.tabDetails', 'Details'), icon: 'file-text' },
		...(canUseFocus ? [{ key: 'focus' as const, label: t('media.tabFocus', 'Focal Point'), icon: 'crosshair' }] : []),
		...(canUseStudio ? [{ key: 'studio' as const, label: t('media.tabStudio', 'Crop & Transform'), icon: 'crop' }] : []),
		...(hasCustomFields ? [{ key: 'custom' as const, label: t('media.tabCustom', 'Custom Fields'), icon: 'sliders' }] : []),
	];

	const resolvedTab = availableTabs.some((tb) => tb.key === activeTab) ? activeTab : 'details';

	return (
		<PortalRoot ssrFallback={false}>
			<dialog
				ref={dialogRef}
				data-rw-inspector-sheet=""
				data-rw-portal-overlay=""
				data-rw-surface="elevated"
				aria-labelledby={titleId}
				onCancel={(e) => {
					if (isActionsMenuOpen || Date.now() - lastMenuClosedAtRef.current < 120) {
						e.preventDefault();
						if (isActionsMenuOpen) {
							closeActionsMenu({ fromPointer: false, restoreFocus: true });
						}
					}
				}}
				onClose={() => onOpenChange(false)}
				onPointerDown={(e) => {
					const dialog = dialogRef.current;
					if (!dialog || e.button !== 0) {
						backdropPressOutsideRef.current = false;
						return;
					}
					const rect = dialog.getBoundingClientRect();
					backdropPressOutsideRef.current =
						e.clientX < rect.left ||
						e.clientX > rect.right ||
						e.clientY < rect.top ||
						e.clientY > rect.bottom;
				}}
				onClick={(e) => {
					const wasPressedOutside = backdropPressOutsideRef.current;
					backdropPressOutsideRef.current = false;
					const dialog = dialogRef.current;
					if (!wasPressedOutside || !dialog) {
						return;
					}
					const rect = dialog.getBoundingClientRect();
					const releasedOutside =
						e.clientX < rect.left ||
						e.clientX > rect.right ||
						e.clientY < rect.top ||
						e.clientY > rect.bottom;
					if (releasedOutside) {
						onOpenChange(false);
					}
				}}
			>
				<div className="flex h-full flex-col">
					<div className="flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-3.5">
						<div className="flex min-w-0 items-center gap-3">
							{isImage && (item.thumbUrl || item.url) ? (
								<div
									className="size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40"
									style={item.dominantColor ? { backgroundColor: item.dominantColor } : undefined}
								>
									<img
										src={item.thumbUrl || item.url}
										alt=""
										decoding="async"
										className="size-full object-cover"
										style={{ objectPosition: `${focusCoords.left}% ${focusCoords.top}%` }}
									/>
								</div>
							) : (
								<div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-[10px] font-bold uppercase text-muted-foreground">
									.{item.ext || 'file'}
								</div>
							)}
							<div className="min-w-0">
								<h2 id={titleId} className="truncate text-sm font-semibold text-foreground">
									{item.basename}
								</h2>
								<p className="truncate font-mono text-[11px] text-muted-foreground">
									{item.filesizeStr || formatMediaBytes(item.size)}
									{item.width && item.height ? ` · ${item.width}×${item.height}px` : ''}
									{totalItems > 1 ? ` · ${itemIndex + 1}/${totalItems}` : ''}
								</p>
							</div>
						</div>

						<div className="flex shrink-0 items-center gap-1">
							{totalItems > 1 ? (
								<>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-7"
										disabled={itemIndex <= 0}
										title={t('media.previousAsset', 'Previous item')}
										aria-label={t('media.previousAsset', 'Previous item')}
										onClick={() => onNavigateItem(-1)}
									>
										<DynamicIcon name="chevron-left" className="size-4" />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-7"
										disabled={itemIndex >= totalItems - 1}
										title={t('media.nextAsset', 'Next item')}
										aria-label={t('media.nextAsset', 'Next item')}
										onClick={() => onNavigateItem(1)}
									>
										<DynamicIcon name="chevron-right" className="size-4" />
									</Button>
								</>
							) : null}
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-8"
								aria-label={t('common.close', 'Close')}
								onClick={() => onOpenChange(false)}
							>
								<DynamicIcon name="x" className="size-4" />
							</Button>
						</div>
					</div>

					<div className="flex items-center justify-between gap-2 border-b border-border bg-muted/20 px-5 py-2">
						<div
							role="tablist"
							data-rw-tablist=""
							aria-label={t('media.inspectorSections', 'Inspector sections')}
							onKeyDown={(e) => navigateTablistByKey(e, 'horizontal')}
							className="flex min-w-0 items-center gap-1 overflow-x-auto"
						>
							{availableTabs.map((tb) => {
								const isSelected = tb.key === resolvedTab;
								return (
									<button
										key={tb.key}
										id={`rw-insp-tab-${cleanUid}-${tb.key}`}
										type="button"
										role="tab"
										aria-selected={isSelected}
										aria-controls={`rw-insp-panel-${cleanUid}-${tb.key}`}
										tabIndex={isSelected ? 0 : -1}
										onClick={(e) => {
											setActiveTab(tb.key);
											scrollTabIntoView(e.currentTarget);
										}}
										className={cn(
											'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-9',
											isSelected
												? 'bg-background text-foreground shadow-2xs border border-border/70'
												: 'text-muted-foreground hover:text-foreground'
										)}
									>
										<DynamicIcon name={tb.icon} className="size-3.5" aria-hidden="true" />
										<span>{tb.label}</span>
									</button>
								);
							})}
						</div>

						<div className="flex shrink-0 items-center gap-1.5">
							{copiedFeedback ? (
								<Badge variant="secondary" className="text-[10px]">
									{copiedFeedback}
								</Badge>
							) : null}

							{hasQuickActionMenu ? (
								<>
									<button
										ref={actionsTriggerRef}
										id={actionsTriggerId}
										type="button"
										aria-haspopup="menu"
										aria-expanded={isActionsMenuOpen}
										aria-label={t('media.moreActions', 'More actions')}
										title={t('media.moreActions', 'More actions')}
										{...({
											commandfor: actionsMenuId,
											command: 'toggle-popover',
										} as Record<string, string>)}
										onPointerDown={(e) => {
											if (e.button === 0) {
												e.preventDefault();
												pointerPressedTriggerRef.current = true;
											}
										}}
										onKeyDown={(e) => {
											if (e.key === 'ArrowDown') {
												e.preventDefault();
												enterMenuOnOpenRef.current = true;
												pointerPressedTriggerRef.current = false;
												if (!isActionsMenuOpen) {
													e.currentTarget.click();
												} else {
													focusFirstActionItem();
												}
											} else if (e.key === 'Enter' || e.key === ' ') {
												enterMenuOnOpenRef.current = true;
												pointerPressedTriggerRef.current = false;
											}
										}}
										onClick={(e) => {
											const isPointer = pointerPressedTriggerRef.current && e.detail !== 0;
											pointerPressedTriggerRef.current = false;
											if (!isPointer) {
												enterMenuOnOpenRef.current = true;
											}
											if (
												typeof HTMLButtonElement !== 'undefined' &&
												!('commandForElement' in HTMLButtonElement.prototype)
											) {
												e.preventDefault();
												const pop = actionsPopoverRef.current;
												if (!pop) {
													return;
												}
												if (isActionsMenuOpen) {
													closeActionsMenu({ fromPointer: isPointer, restoreFocus: true });
												} else {
													try {
														(
															pop as HTMLElement & {
																showPopover: (options?: { source?: Element }) => void;
															}
														).showPopover({ source: e.currentTarget });
													} catch {
														try {
															pop.showPopover();
														} catch {
															pop.setAttribute('open', '');
															setIsActionsMenuOpen(true);
														}
													}
												}
											}
										}}
										className={cn(
											'inline-flex size-7 items-center justify-center rounded-md border border-input bg-input-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
											isActionsMenuOpen && 'border-border bg-accent text-foreground'
										)}
									>
										<DynamicIcon name="more-vertical" className="size-3.5" aria-hidden="true" />
									</button>
									<div
										id={actionsMenuId}
										ref={actionsPopoverRef}
										popover="auto"
										data-rw-popover-menu=""
									>
										<div
											ref={actionsFocusGroupRef}
											{...({ focusgroup: 'menu nomemory' } as Record<string, string>)}
											aria-labelledby={actionsTriggerId}
										>
											{cleanCopyUrl ? (
												<button
													type="button"
													onPointerMove={handleMenuItemPointerMove}
													onClick={(e) => {
														const fromPointer = e.detail !== 0;
														copyToClipboard(
															cleanCopyUrl,
															t('media.copiedUrl', 'URL copied')
														);
														closeActionsMenu({ fromPointer, restoreFocus: true });
													}}
												>
													<DynamicIcon name="copy" className="size-3.5 text-muted-foreground" aria-hidden="true" />
													<span>{t('media.copyUrl', 'Copy URL')}</span>
												</button>
											) : null}
											{safeOriginalHref ? (
												<a
													href={safeOriginalHref}
													target="_blank"
													rel="noopener noreferrer"
													onPointerMove={handleMenuItemPointerMove}
													onClick={(e) => {
														closeActionsMenu({
															fromPointer: e.detail !== 0,
															restoreFocus: true,
														});
													}}
												>
													<DynamicIcon name="external-link" className="size-3.5 text-muted-foreground" aria-hidden="true" />
													<span>{t('media.openOriginal', 'Open original')}</span>
												</a>
											) : null}
											{safeOriginalHref ? (
												<a
													href={safeOriginalHref}
													download={item.basename || true}
													onPointerMove={handleMenuItemPointerMove}
													onClick={(e) => {
														closeActionsMenu({
															fromPointer: e.detail !== 0,
															restoreFocus: true,
														});
													}}
												>
													<DynamicIcon name="download" className="size-3.5 text-muted-foreground" aria-hidden="true" />
													<span>{t('media.downloadOriginal', 'Download')}</span>
												</a>
											) : null}
											{safeOriginalHref && canReplaceItem ? <hr /> : null}
											{canReplaceItem && onTriggerReplace ? (
												<button
													type="button"
													onPointerMove={handleMenuItemPointerMove}
													onClick={(e) => {
														const fromPointer = e.detail !== 0;
														closeActionsMenu({ fromPointer, restoreFocus: true });
														onTriggerReplace(item);
													}}
												>
													<DynamicIcon name="refresh-cw" className="size-3.5 text-muted-foreground" aria-hidden="true" />
													<span>{t('media.replace', 'Replace')}</span>
												</button>
											) : null}
										</div>
									</div>
								</>
							) : null}
						</div>
					</div>

					<div
						role="tabpanel"
						id={`rw-insp-panel-${cleanUid}-${resolvedTab}`}
						aria-labelledby={`rw-insp-tab-${cleanUid}-${resolvedTab}`}
						className="flex-1 space-y-5 overflow-y-auto p-5"
					>
						{resolvedTab === 'details' ? (
							<div className="space-y-5">
								{isImage && (item.url || item.thumbUrl) ? (
									<div
										className="relative flex max-h-64 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30 p-2"
										style={
											item.lqip
												? {
														backgroundImage: `url("${item.lqip}")`,
														backgroundSize: 'cover',
														backgroundPosition: 'center',
													}
												: item.dominantColor
													? { backgroundColor: `${item.dominantColor}22` }
													: undefined
										}
									>
										<img
											src={item.url || item.thumbUrl}
											alt={item.description || item.basename}
											decoding="async"
											className="max-h-60 w-auto rounded-lg object-contain shadow-xs"
										/>
									</div>
								) : null}

								{descriptionRows > 0 ? (
									<div className="space-y-2">
										<div className="flex items-center justify-between text-xs font-semibold text-foreground">
											<span>
												{isImage
													? t('media.altLabelImage', 'Alt text / description')
													: t('media.altLabelFile', 'Description')}
											</span>
											{isImage && !(item.description || '').trim() ? (
												<Badge variant="warning" className="text-[10px]">
													{t('media.missingAlt', 'Missing alt')}
												</Badge>
											) : null}
										</div>
										<MultiLangDescriptionEditor
											item={item}
											isImage={isImage}
											descriptionRows={Math.max(descriptionRows, 2)}
											languages={languages}
											activeLangId={activeLangId}
											onSelectLang={onSelectLang}
											disabled={isLocked}
											defaultStacked={Boolean(languages && languages.length > 1 && languages.length <= 6)}
											onUpdateDescription={onUpdateDescription}
										/>
									</div>
								) : null}

								{useTags ? (
									<div className="space-y-2">
										<div className="block text-xs font-semibold text-foreground">
											{t('media.tagsLabel', 'Tags')}
										</div>
										<TagsChipEditor
											value={item.tags || ''}
											tagsList={tagsList}
											predefinedOnly={tagsPredefinedOnly}
											disabled={isLocked}
											onChange={(nextTags) => onUpdateTags(item.id, nextTags)}
										/>
									</div>
								) : null}

								<div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3.5">
									<div className="grid grid-cols-3 gap-3 text-xs">
										<div>
											<span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
												{t('media.extension', 'Format')}
											</span>
											<span className="font-mono font-semibold uppercase text-foreground">
												.{item.ext || 'file'}
											</span>
										</div>
										<div>
											<span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
												{t('media.fileSize', 'File size')}
											</span>
											<span className="font-mono font-semibold text-foreground">
												{item.filesizeStr || formatMediaBytes(item.size)}
											</span>
										</div>
										{item.width && item.height ? (
											<div>
												<span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
													{t('media.dimensions', 'Dimensions')}
												</span>
												<span className="font-mono font-semibold text-foreground">
													{item.width} × {item.height}
												</span>
											</div>
										) : null}
									</div>

									{isImage && item.ext !== 'svg' ? (
										<div className="border-t border-border/70 pt-3 space-y-2">
											<div className="flex items-center justify-between gap-2">
												<span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
													<DynamicIcon name="palette" className="size-3.5" />
													<span>{t('media.colorPalette', 'Extracted palette')}</span>
												</span>
												{paletteColors.length === 0 && mediaEndpoint && mediaToken ? (
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="h-6 px-2 text-[10px]"
														disabled={isAnalyzingColors}
														onClick={() => void handleExtractColors()}
													>
														<DynamicIcon
															name="sparkles"
															className={cn('size-3', isAnalyzingColors && 'motion-safe:animate-spin')}
														/>
														<span>
															{isAnalyzingColors
																? t('common.loading', 'Loading...')
																: t('media.analyzeColors', 'Extract colors')}
														</span>
													</Button>
												) : null}
											</div>

											{paletteColors.length > 0 ? (
												<div className="flex flex-wrap items-center gap-1.5">
													{paletteColors.map((hex) => (
														<button
															key={hex}
															type="button"
															onClick={() =>
																copyToClipboard(
																	hex,
																	t('media.copiedColor', { hex }, `Copied ${hex}`)
																)
															}
															title={hex}
															className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-mono text-foreground shadow-2xs transition-transform motion-reduce:transition-none hover:scale-[1.03] motion-reduce:hover:scale-100 cursor-pointer"
														>
															<span
																className="size-3.5 rounded-xs border border-black/15"
																style={{ backgroundColor: hex }}
															/>
															<span>{hex}</span>
														</button>
													))}
												</div>
											) : null}
										</div>
									) : null}
								</div>
							</div>
						) : null}

						{resolvedTab === 'focus' && canUseFocus ? (
							<div className="space-y-5">
								<p className="text-xs text-muted-foreground">
									{t('media.focusHint', 'Click anywhere on the image to set the focal point used by smart crops.')}
								</p>

								<div className="flex justify-center rounded-xl border border-border bg-muted/30 p-3">
									<div
										ref={focusPadRef}
										role="application"
										tabIndex={isLocked ? -1 : 0}
										aria-label={t('media.focusPoint', 'Focal point')}
										onPointerDown={(e) => {
											if (isLocked || e.button !== 0 || !focusPadRef.current) return;
											const cached = focusPadRef.current.getBoundingClientRect();
											focusBoundsRef.current = cached;
											e.currentTarget.setPointerCapture?.(e.pointerId);
											setIsDraggingFocus(true);
											updateFocusFromPointer(e.clientX, e.clientY, cached);
										}}
										onPointerMove={(e) => {
											if (!isDraggingFocus) return;
											updateFocusFromPointer(e.clientX, e.clientY, focusBoundsRef.current);
										}}
										onPointerUp={() => {
											setIsDraggingFocus(false);
											focusBoundsRef.current = null;
										}}
										onPointerCancel={() => {
											setIsDraggingFocus(false);
											focusBoundsRef.current = null;
										}}
										onLostPointerCapture={() => {
											setIsDraggingFocus(false);
											focusBoundsRef.current = null;
										}}
										onKeyDown={(e) => {
											if (isLocked) return;
											const step = e.shiftKey ? 5 : 1;
											let nextLeft = focusCoords.left;
											let nextTop = focusCoords.top;
											if (e.key === 'ArrowLeft') nextLeft = clampPct(nextLeft - step, 0, 100);
											else if (e.key === 'ArrowRight') nextLeft = clampPct(nextLeft + step, 0, 100);
											else if (e.key === 'ArrowUp') nextTop = clampPct(nextTop - step, 0, 100);
											else if (e.key === 'ArrowDown') nextTop = clampPct(nextTop + step, 0, 100);
											else return;
											e.preventDefault();
											onUpdateFocus(item.id, {
												top: nextTop,
												left: nextLeft,
												zoom: focusCoords.zoom,
											});
										}}
										className={cn(
											'relative inline-block max-w-full overflow-hidden rounded-lg border border-border select-none touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
											!isLocked && 'cursor-crosshair'
										)}
									>
										<img
											src={item.url || item.thumbUrl}
											alt={item.description || item.basename}
											decoding="async"
											draggable={false}
											className="block max-h-80 w-auto object-contain pointer-events-none"
										/>
										<div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
											{Array.from({ length: 9 }).map((_, idx) => (
												<div key={idx} className="border border-white/15" />
											))}
										</div>
										<span
											aria-hidden="true"
											style={{
												top: `${focusCoords.top}%`,
												left: `${focusCoords.left}%`,
											}}
											className={cn(
												'pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/75 shadow-[0_0_0_2px_rgba(0,0,0,0.55)]',
												!isDraggingFocus && 'transition-[top,left] duration-75 motion-reduce:transition-none'
											)}
										/>
									</div>
								</div>

								<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
									<span aria-live="polite" className="font-mono text-xs tabular-nums text-foreground">
										{t(
											'media.focusPosition',
											{ top: Math.round(focusCoords.top), left: Math.round(focusCoords.left) },
											`Top ${Math.round(focusCoords.top)}% · Left ${Math.round(focusCoords.left)}%`
										)}
									</span>

									{focusMode === 'zoom' ? (
										<div className="flex items-center gap-2.5">
											<label htmlFor={zoomInputId} className="text-xs font-medium text-muted-foreground">
												{t('media.zoomLabel', 'Zoom')}
											</label>
											<input
												id={zoomInputId}
												type="range"
												data-rw-slider=""
												min={0}
												max={50}
												step={1}
												disabled={isLocked}
												value={focusCoords.zoom}
												onChange={(e) =>
													onUpdateFocus(item.id, {
														...focusCoords,
														zoom: Number(e.target.value) || 0,
													})
												}
												className="w-28"
											/>
											<span className="w-9 text-right font-mono text-xs tabular-nums text-foreground">
												{focusCoords.zoom}%
											</span>
										</div>
									) : null}

									{!isLocked ? (
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="h-7 px-2.5 text-xs"
											onClick={() => onUpdateFocus(item.id, { top: 50, left: 50, zoom: 0 })}
										>
											<DynamicIcon name="rotate-ccw" className="size-3" />
											<span>{t('media.resetFocus', 'Center focus')}</span>
										</Button>
									) : null}
								</div>

								<div className="space-y-2">
									<h3 className="text-xs font-semibold text-foreground">
										{t('media.cropPreviews', 'Smart crop previews')}
									</h3>
									<div className="grid grid-cols-3 gap-3">
										{[
											{ label: '16:9', aspectClass: 'aspect-video' },
											{ label: '1:1', aspectClass: 'aspect-square' },
											{ label: '4:5', aspectClass: 'aspect-[4/5]' },
										].map((preset) => (
											<div key={preset.label} className="space-y-1">
												<div
													className={cn(
														'w-full overflow-hidden rounded-lg border border-border bg-muted/40',
														preset.aspectClass
													)}
												>
													<img
														src={item.thumbUrl || item.url}
														alt=""
														decoding="async"
														className="size-full object-cover transition-transform duration-150 motion-reduce:transition-none"
														style={{
															objectPosition: `${focusCoords.left}% ${focusCoords.top}%`,
															transform:
																focusCoords.zoom > 0
																	? `scale(${(1 + focusCoords.zoom / 100).toFixed(2)})`
																	: undefined,
															transformOrigin: `${focusCoords.left}% ${focusCoords.top}%`,
														}}
													/>
												</div>
												<span className="block text-center font-mono text-[10px] text-muted-foreground">
													{preset.label}
												</span>
											</div>
										))}
									</div>
								</div>
							</div>
						) : null}

						{resolvedTab === 'studio' && canUseStudio ? (
							<CropStage
								item={item}
								cropRect={cropRect}
								onChangeCropRect={setCropRect}
								cropAspect={cropAspect}
								onChangeCropAspect={setCropAspect}
								isTransforming={isTransforming}
								studioError={studioError}
								onRunTransform={runServerTransform}
								onApplyCrop={handleApplyCrop}
							/>
						) : null}

						{resolvedTab === 'custom' && hasCustomFields && item.customFields ? (
							<div className="space-y-4">
								{item.customFields.map((cf) => {
									const cfVal = item.customValues?.[cf.name];
									if (customFieldRenderer) {
										return (
											<div key={cf.name}>
												{customFieldRenderer({
													field: cf,
													value: cfVal,
													values: item.customValues || {},
													disabled: isLocked,
													onChange: (targetName, nextVal) =>
														onUpdateCustomValue(item.id, targetName, nextVal),
												})}
											</div>
										);
									}
									const customInputId = `rw-media-cf-${item.id}-${cf.name}`;
									return (
										<div key={cf.name} className="space-y-1.5">
											{cf.label ? (
												<label htmlFor={customInputId} className="block text-xs font-semibold text-foreground">
													{cf.label}
												</label>
											) : null}
											<Input
												id={customInputId}
												aria-label={cf.label ? undefined : cf.name}
												type="text"
												value={String(cfVal ?? '')}
												disabled={isLocked}
												onChange={(e) => onUpdateCustomValue(item.id, cf.name, e.target.value)}
												className="h-8 text-xs"
											/>
										</div>
									);
								})}
							</div>
						) : null}
					</div>

					<div className="flex items-center justify-between gap-2 border-t border-border bg-card px-5 py-3">
						{!isLocked ? (
							<Button
								type="button"
								variant={item.markedForDelete ? 'outline' : 'ghost'}
								size="sm"
								className={cn(
									'text-xs',
									!item.markedForDelete && 'text-destructive hover:bg-destructive/10 hover:text-destructive'
								)}
								onClick={() => {
									onToggleDelete(item.id);
									if (!item.markedForDelete) {
										onOpenChange(false);
									}
								}}
							>
								<DynamicIcon name={item.markedForDelete ? 'rotate-ccw' : 'trash'} className="size-3.5" />
								<span>
									{item.markedForDelete
										? t('media.undoDelete', 'Undo')
										: t('common.delete', 'Delete')}
								</span>
							</Button>
						) : (
							<div />
						)}

						<Button type="button" size="sm" onClick={() => onOpenChange(false)}>
							{t('common.done', 'Done')}
						</Button>
					</div>
				</div>
			</dialog>
		</PortalRoot>
	);
}
