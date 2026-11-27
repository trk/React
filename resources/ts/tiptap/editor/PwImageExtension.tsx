/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { mergeAttributes } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import Image from '@tiptap/extension-image';
import {
	NodeViewWrapper,
	ReactNodeViewRenderer,
	type NodeViewProps,
} from '@tiptap/react';
import { getReactWorkspaceRuntime } from '../../runtime';
import { getReactTiptapRuntime } from '../core/tiptapRuntime';
import type { PwImageAttrs, PwImageConfig, TiptapTranslateFn } from '../core/tiptapTypes';

const runtime = getReactWorkspaceRuntime();
const { React, Utils } = runtime;
const { cn } = Utils;
const { useRef, useState } = React;

function parseAlignmentAndClasses(
	rawClass: string | null | undefined,
	knownAlignClasses: Set<string>
): { align: string; hidpi: boolean; extraClass: string } {
	let align = '';
	let hidpi = false;
	const extras: string[] = [];

	for (const token of String(rawClass ?? '').trim().split(/\s+/)) {
		if (!token) {
			continue;
		}
		if (token === 'hidpi') {
			hidpi = true;
			continue;
		}
		if (
			knownAlignClasses.has(token) ||
			/^align[_-](?:left|center|right|full)$/i.test(token)
		) {
			align = token;
			continue;
		}
		if (/^[A-Za-z0-9_:-]{1,80}$/.test(token) && !extras.includes(token)) {
			extras.push(token);
		}
	}

	return { align, hidpi, extraClass: extras.join(' ') };
}

function parsePositiveInt(raw: string | null | undefined): number | null {
	if (!raw) {
		return null;
	}
	const m = /^([1-9][0-9]{0,4})$/.exec(String(raw).trim());
	if (!m) {
		return null;
	}
	const num = Number.parseInt(m[1]!, 10);
	return Number.isFinite(num) && num > 0 ? num : null;
}

export interface CreatePwImageExtensionOptions {
	imageConfig: PwImageConfig;
	enableImgResizeRef: { current: boolean };
	onEditImageRef: { current: ((pos: number, attrs: PwImageAttrs) => void) | null };
	onResizeImageServerRef: {
		current: ((pos: number, attrs: PwImageAttrs, nextWidth: number) => void) | null;
	};
	t: TiptapTranslateFn;
}

export function createPwImageExtension(options: CreatePwImageExtensionOptions) {
	const { imageConfig, enableImgResizeRef, onEditImageRef, onResizeImageServerRef, t } = options;
	const {
		extractPageIdFromAssetSrc,
		isSafePwImageSrc,
		isSafePwLinkHref,
		mergeBlankTargetRel,
		sanitizeCssClassTokens,
	} = getReactTiptapRuntime().helpers;

	const extractImageAttrsFromDom = (
		imgEl: HTMLElement,
		knownAlignClasses: Set<string>,
		figureEl?: HTMLElement | null,
		linkEl?: HTMLElement | null
	): PwImageAttrs | false => {
		const rawSrc = (imgEl.getAttribute('src') || '').trim();
		if (!isSafePwImageSrc(rawSrc)) {
			return false;
		}

		const imgParsed = parseAlignmentAndClasses(imgEl.getAttribute('class'), knownAlignClasses);
		const figParsed = figureEl
			? parseAlignmentAndClasses(figureEl.getAttribute('class'), knownAlignClasses)
			: { align: '', hidpi: false, extraClass: '' };

		const align = figParsed.align || imgParsed.align;
		const hidpi = imgParsed.hidpi || figParsed.hidpi;
		const extraParts = [figParsed.extraClass, imgParsed.extraClass].filter(Boolean);
		const extraClass = sanitizeCssClassTokens(extraParts.join(' '));

		const captionEl = figureEl?.querySelector('figcaption') ?? null;
		const caption = Boolean(figureEl && captionEl);
		const captionText = captionEl ? (captionEl.textContent || '').trim() : '';

		const rawLinkHref = linkEl ? (linkEl.getAttribute('href') || '').trim() : '';
		const safeLinkHref = rawLinkHref && isSafePwLinkHref(rawLinkHref) ? rawLinkHref : '';
		const linkTarget = linkEl ? (linkEl.getAttribute('target') || '').trim() : '';
		const linkRel = linkEl ? mergeBlankTargetRel(linkEl.getAttribute('rel'), linkTarget) : '';
		const linkTitle = linkEl ? (linkEl.getAttribute('title') || '').trim() : '';
		const linkClass = linkEl ? sanitizeCssClassTokens(linkEl.getAttribute('class')) : '';

		return {
			src: rawSrc,
			alt: imgEl.getAttribute('alt') ?? '',
			title: (imgEl.getAttribute('title') || '').trim() || null,
			width: parsePositiveInt(imgEl.getAttribute('width')),
			height: parsePositiveInt(imgEl.getAttribute('height')),
			align,
			hidpi,
			extraClass,
			nosize: imgEl.getAttribute('data-nosize') === '1',
			linkHref: safeLinkHref,
			linkTarget,
			linkRel,
			linkTitle,
			linkClass,
			caption,
			captionText,
			pageId: extractPageIdFromAssetSrc(rawSrc),
			mediaToken: '',
		};
	};

	const knownAlignClasses = new Set<string>([
		imageConfig.alignLeftClass,
		imageConfig.alignCenterClass,
		imageConfig.alignRightClass,
		'align_left',
		'align_center',
		'align_right',
		'align_full',
		'align-left',
		'align-center',
		'align-right',
		'align-full',
	]);

	function PwImageNodeView(props: NodeViewProps) {
		const { node, updateAttributes, deleteNode, editor, getPos, selected } = props;
		const attrs = node.attrs as PwImageAttrs;
		const src = isSafePwImageSrc(attrs.src) ? attrs.src : '';
		const alt = String(attrs.alt ?? '');
		const width = typeof attrs.width === 'number' && attrs.width > 0 ? attrs.width : null;
		const align = String(attrs.align ?? '');
		const caption = Boolean(attrs.caption);
		const captionText = String(attrs.captionText ?? '');
		const isEditable = editor.isEditable;

		const imgRef = useRef<HTMLImageElement | null>(null);
		const resizeCleanupRef = useRef<(() => void) | null>(null);
		const [liveDragDims, setLiveDragDims] = useState<{ w: number; h: number } | null>(null);

		React.useEffect(() => {
			return () => {
				resizeCleanupRef.current?.();
				resizeCleanupRef.current = null;
			};
		}, []);

		const openEditModal = (e?: React.MouseEvent) => {
			if (e) {
				e.preventDefault();
				e.stopPropagation();
			}
			if (!isEditable) {
				return;
			}
			const pos = typeof getPos === 'function' ? getPos() : undefined;
			if (typeof pos === 'number') {
				onEditImageRef.current?.(pos, attrs);
			}
		};

		const startCornerResize = (corner: 'se' | 'sw', e: React.PointerEvent<HTMLButtonElement>) => {
			e.preventDefault();
			e.stopPropagation();
			const imgEl = imgRef.current;
			if (!imgEl || !isEditable) {
				return;
			}
			const rect = imgEl.getBoundingClientRect();
			const startX = e.clientX;
			const startW = Math.max(48, Math.round(rect.width));
			const aspect =
				imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0
					? imgEl.naturalWidth / imgEl.naturalHeight
					: rect.height > 0
						? rect.width / rect.height
						: 1.5;
			const proseContainer = imgEl.closest('.ProseMirror') as HTMLElement | null;
			const maxW = proseContainer ? Math.max(120, proseContainer.clientWidth - 24) : 1600;
			let latestW = startW;
			let latestH = Math.max(1, Math.round(startW / aspect));
			setLiveDragDims({ w: latestW, h: latestH });

			const targetBtn = e.currentTarget;
			try {
				targetBtn.setPointerCapture(e.pointerId);
			} catch {
				// Ignore synthetic events without active pointer capture
			}

			const onMove = (moveEvt: PointerEvent) => {
				const dx = corner === 'se' ? moveEvt.clientX - startX : startX - moveEvt.clientX;
				latestW = Math.max(48, Math.min(maxW, Math.round(startW + dx)));
				latestH = Math.max(1, Math.round(latestW / aspect));
				setLiveDragDims({ w: latestW, h: latestH });
			};

			const cleanupListeners = () => {
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
				window.removeEventListener('pointercancel', onUp);
				if (resizeCleanupRef.current === cleanupListeners) {
					resizeCleanupRef.current = null;
				}
			};

			const onUp = (upEvt: PointerEvent) => {
				cleanupListeners();
				try {
					targetBtn.releasePointerCapture(upEvt.pointerId);
				} catch {
					// Ignore
				}
				setLiveDragDims(null);
				if (latestW !== width) {
					updateAttributes({
						width: latestW,
						height: null,
					});
					const pos = typeof getPos === 'function' ? getPos() : undefined;
					if (typeof pos === 'number') {
						onResizeImageServerRef.current?.(pos, { ...attrs, width: latestW }, latestW);
					}
				}
			};

			resizeCleanupRef.current?.();
			resizeCleanupRef.current = cleanupListeners;
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
			window.addEventListener('pointercancel', onUp);
		};

		const displayWidth = liveDragDims ? liveDragDims.w : width;
		const canResizeInline = isEditable && selected && enableImgResizeRef.current && Boolean(src);

		const alignBtnClass = (active: boolean) =>
			cn(
				'inline-flex size-6 items-center justify-center rounded-sm text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				active
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground'
			);

		return (
			<NodeViewWrapper
				as="figure"
				data-rw-pw-image=""
				data-selected={selected ? '1' : undefined}
				className={cn(align)}
				style={
					displayWidth && align !== 'align_full' && align !== 'align-full'
						? { width: `${displayWidth}px`, maxWidth: '100%' }
						: undefined
				}
				contentEditable={false}
			>
				<div className="relative inline-block max-w-full">
					{src ? (
						<img
							ref={imgRef}
							src={src}
							alt={alt}
							title={attrs.title || undefined}
							width={displayWidth || undefined}
							onDoubleClick={openEditModal}
							className={cn(
								'block max-w-full h-auto',
								isEditable && 'cursor-pointer',
								attrs.linkHref && 'ring-1 ring-primary/45'
							)}
						/>
					) : null}

					{liveDragDims ? (
						<span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-foreground/85 px-2 py-0.5 text-[11px] font-medium tabular-nums text-background shadow-sm">
							{liveDragDims.w} &times; {liveDragDims.h}
						</span>
					) : null}

					{isEditable && selected ? (
						<div
							role="toolbar"
							aria-label={t('image.alignmentLabel', 'Alignment')}
							className="absolute top-2 left-2 z-10 inline-flex items-center gap-0.5 rounded-md border border-border bg-popover/95 p-0.5 text-popover-foreground shadow-md backdrop-blur-xs"
						>
							<button
								type="button"
								onClick={openEditModal}
								aria-label={t('image.editSelectedImage', 'Edit image settings')}
								title={t('image.editSelectedImage', 'Edit image settings')}
								className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-[11px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
								data-rw-pw-image-edit=""
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} className="size-3" aria-hidden="true">
									<path d="M12 20h9" />
									<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
								</svg>
							</button>
							<button
								type="button"
								aria-label={t('image.alignLeft', 'Align left')}
								title={t('image.alignLeft', 'Align left')}
								aria-pressed={align === imageConfig.alignLeftClass}
								onClick={() =>
									updateAttributes({
										align: align === imageConfig.alignLeftClass ? '' : imageConfig.alignLeftClass,
									})
								}
								className={alignBtnClass(align === imageConfig.alignLeftClass)}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} className="size-3" aria-hidden="true">
									<line x1="21" y1="6" x2="3" y2="6" />
									<line x1="15" y1="12" x2="3" y2="12" />
									<line x1="17" y1="18" x2="3" y2="18" />
								</svg>
							</button>
							<button
								type="button"
								aria-label={t('image.alignCenter', 'Align center')}
								title={t('image.alignCenter', 'Align center')}
								aria-pressed={align === imageConfig.alignCenterClass}
								onClick={() =>
									updateAttributes({
										align: align === imageConfig.alignCenterClass ? '' : imageConfig.alignCenterClass,
									})
								}
								className={alignBtnClass(align === imageConfig.alignCenterClass)}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} className="size-3" aria-hidden="true">
									<line x1="21" y1="6" x2="3" y2="6" />
									<line x1="17" y1="12" x2="7" y2="12" />
									<line x1="19" y1="18" x2="5" y2="18" />
								</svg>
							</button>
							<button
								type="button"
								aria-label={t('image.alignRight', 'Align right')}
								title={t('image.alignRight', 'Align right')}
								aria-pressed={align === imageConfig.alignRightClass}
								onClick={() =>
									updateAttributes({
										align: align === imageConfig.alignRightClass ? '' : imageConfig.alignRightClass,
									})
								}
								className={alignBtnClass(align === imageConfig.alignRightClass)}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} className="size-3" aria-hidden="true">
									<line x1="21" y1="6" x2="3" y2="6" />
									<line x1="21" y1="12" x2="9" y2="12" />
									<line x1="21" y1="18" x2="7" y2="18" />
								</svg>
							</button>
							<button
								type="button"
								aria-label={t('image.removeSelectedImage', 'Remove image')}
								title={t('image.removeSelectedImage', 'Remove image')}
								onClick={deleteNode}
								className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/12 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.85} className="size-3" aria-hidden="true">
									<path d="M3 6h18" />
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
									<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								</svg>
							</button>
						</div>
					) : null}

					{canResizeInline ? (
						<>
							<button
								type="button"
								tabIndex={-1}
								aria-label={t('image.resizeHandleAria', 'Drag to resize image')}
								onPointerDown={(e) => startCornerResize('sw', e)}
								className="absolute -bottom-1.5 -left-1.5 z-10 size-3.5 rounded-full border-2 border-background bg-primary shadow-sm cursor-nesw-resize"
								data-rw-pw-image-resize="sw"
							/>
							<button
								type="button"
								tabIndex={-1}
								aria-label={t('image.resizeHandleAria', 'Drag to resize image')}
								onPointerDown={(e) => startCornerResize('se', e)}
								className="absolute -bottom-1.5 -right-1.5 z-10 size-3.5 rounded-full border-2 border-background bg-primary shadow-sm cursor-nwse-resize"
								data-rw-pw-image-resize="se"
							/>
						</>
					) : null}
				</div>

				{caption ? (
					isEditable ? (
						<figcaption className="mt-1.5">
							<input
								type="text"
								value={captionText}
								onChange={(e) => updateAttributes({ captionText: e.target.value })}
								placeholder={t('image.captionInputPlaceholder', 'Enter image caption...')}
								aria-label={t('image.captionInputLabel', 'Caption text')}
								className="w-full bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/65 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs px-1 py-0.5"
							/>
						</figcaption>
					) : captionText ? (
						<figcaption>{captionText}</figcaption>
					) : null
				) : null}
			</NodeViewWrapper>
		);
	}

	return Image.extend({
		addAttributes() {
			return {
				src: { default: '' },
				alt: { default: '' },
				title: { default: null },
				width: { default: null },
				height: { default: null },
				align: { default: '' },
				hidpi: { default: false },
				extraClass: { default: '' },
				nosize: { default: false },
				linkHref: { default: '' },
				linkTarget: { default: '' },
				linkRel: { default: '' },
				linkTitle: { default: '' },
				linkClass: { default: '' },
				caption: { default: false },
				captionText: { default: '' },
				pageId: { default: 0 },
				mediaToken: { default: '' },
			};
		},

		parseHTML() {
			return [
				{
					tag: 'figure:not([data-tiptap-block])',
					priority: 1060,
					getAttrs: (dom) => {
						const fig = dom as HTMLElement;
						const img = fig.querySelector('img');
						if (!img) {
							return false;
						}
						const parentLink = img.closest('a[href]');
						const linkInsideFig =
							parentLink && fig.contains(parentLink) ? (parentLink as HTMLElement) : null;
						return extractImageAttrsFromDom(img, knownAlignClasses, fig, linkInsideFig);
					},
				},
				{
					tag: 'p',
					priority: 1055,
					getAttrs: (dom) => {
						const p = dom as HTMLElement;
						if (p.children.length !== 1 || (p.textContent || '').trim() !== '') {
							return false;
						}
						const only = p.firstElementChild as HTMLElement | null;
						if (!only) {
							return false;
						}
						if (only.tagName === 'IMG') {
							return extractImageAttrsFromDom(only, knownAlignClasses, null, null);
						}
						if (
							only.tagName === 'A' &&
							only.hasAttribute('href') &&
							only.children.length === 1 &&
							only.firstElementChild?.tagName === 'IMG'
						) {
							return extractImageAttrsFromDom(
								only.firstElementChild as HTMLElement,
								knownAlignClasses,
								null,
								only
							);
						}
						return false;
					},
				},
				{
					tag: 'a[href]',
					priority: 1052,
					getAttrs: (dom) => {
						const a = dom as HTMLElement;
						if (
							a.children.length !== 1 ||
							a.firstElementChild?.tagName !== 'IMG' ||
							(a.textContent || '').trim() !== ''
						) {
							return false;
						}
						return extractImageAttrsFromDom(
							a.firstElementChild as HTMLElement,
							knownAlignClasses,
							null,
							a
						);
					},
				},
				{
					tag: 'img[src]',
					getAttrs: (dom) => extractImageAttrsFromDom(dom as HTMLElement, knownAlignClasses, null, null),
				},
			];
		},

		renderHTML({ node }) {
			const attrs = node.attrs as PwImageAttrs;
			const rawSrc = String(attrs.src ?? '').trim();
			if (!isSafePwImageSrc(rawSrc)) {
				return ['span', {}, ''];
			}

			const caption = Boolean(attrs.caption);
			const captionText = String(attrs.captionText ?? '').trim();
			const align = sanitizeCssClassTokens(attrs.align);
			const hidpi = Boolean(attrs.hidpi);
			const extraClass = sanitizeCssClassTokens(attrs.extraClass);
			const nosize = Boolean(attrs.nosize) || imageConfig.noSizeAttrs;
			const width = typeof attrs.width === 'number' && attrs.width > 0 ? attrs.width : null;
			const height = typeof attrs.height === 'number' && attrs.height > 0 ? attrs.height : null;

			const imgClasses: string[] = [];
			if (!caption && align) {
				imgClasses.push(align);
			}
			if (hidpi) {
				imgClasses.push('hidpi');
			}
			if (extraClass && !caption) {
				for (const c of extraClass.split(/\s+/)) {
					if (c && !imgClasses.includes(c)) {
						imgClasses.push(c);
					}
				}
			}

			const imgAttrs: Record<string, string> = {
				src: rawSrc,
				alt: String(attrs.alt ?? ''),
			};
			if (attrs.title) {
				imgAttrs.title = String(attrs.title);
			}
			if (!nosize && width) {
				imgAttrs.width = String(width);
			} else if (!nosize && height) {
				imgAttrs.height = String(height);
			}
			if (imgClasses.length > 0) {
				imgAttrs.class = imgClasses.join(' ');
			}

			let coreSpec: DOMOutputSpec = ['img', mergeAttributes(this.options.HTMLAttributes, imgAttrs)];

			const rawLink = String(attrs.linkHref ?? '').trim();
			if (rawLink && isSafePwLinkHref(rawLink)) {
				const lTarget = attrs.linkTarget ? String(attrs.linkTarget).trim() : '';
				const lRel = mergeBlankTargetRel(attrs.linkRel, lTarget);
				const lTitle = attrs.linkTitle ? String(attrs.linkTitle).trim() : '';
				const lCls = sanitizeCssClassTokens(attrs.linkClass);
				const linkAttrs: Record<string, string> = { href: rawLink };
				if (lTarget) linkAttrs.target = lTarget;
				if (lRel) linkAttrs.rel = lRel;
				if (lTitle) linkAttrs.title = lTitle;
				if (lCls) linkAttrs.class = lCls;
				coreSpec = ['a', linkAttrs, coreSpec];
			}

			if (caption) {
				const figClasses = [align, extraClass].filter(Boolean).join(' ').trim();
				const figAttrs: Record<string, string> = {};
				if (figClasses) {
					figAttrs.class = figClasses;
				}
				return ['figure', figAttrs, coreSpec, ['figcaption', {}, captionText]];
			}

			return coreSpec;
		},

		addNodeView() {
			return ReactNodeViewRenderer(PwImageNodeView);
		},
	}).configure({
		inline: false,
		allowBase64: false,
	});
}
