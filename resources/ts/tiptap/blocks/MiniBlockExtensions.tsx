/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { mergeAttributes, Node, type AnyExtension, type Editor } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import {
	NodeViewContent,
	NodeViewWrapper,
	ReactNodeViewRenderer,
	type NodeViewProps,
} from '@tiptap/react';
import { getReactWorkspaceRuntime } from '../../runtime';
import type {
	SlashBlockContext,
	SlashCommandItem,
	TiptapMiniBlockDefinition,
	TiptapMiniBlockFieldDef,
	TiptapMiniBlockFieldType,
	TiptapTranslateFn,
} from '../core/tiptapTypes';

export type {
	SlashBlockContext,
	SlashCommandItem,
	TiptapMiniBlockDefinition,
	TiptapMiniBlockFieldDef,
	TiptapMiniBlockFieldType,
	TiptapTranslateFn,
};

const runtime = getReactWorkspaceRuntime();
const { React, UI, cn } = runtime;
const { useId, useState } = React;
const { Badge, Input, Textarea } = UI;

const CALLOUT_VARIANT_KEYS = ['info', 'tip', 'warning', 'danger'] as const;
const FIGURE_ALIGNMENT_KEYS = ['inline', 'wide', 'full', 'left', 'right'] as const;
const ALLOWED_CUSTOM_TAGS = new Set(['aside', 'section', 'div', 'figure', 'blockquote']);

export function isSafeMiniBlockHref(rawHref: string): boolean {
	const trimmed = rawHref.trim();
	if (!trimmed) {
		return true;
	}
	if (/[\x00-\x20\x7F]/.test(trimmed)) {
		return false;
	}
	if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\')) {
		return false;
	}
	return /^(https?:\/\/[^/\\]|mailto:[^\s]|tel:[^\s]|\/|#|\.\.?\/)/i.test(trimmed);
}

export function isSafeMiniBlockImageSrc(rawSrc: string): boolean {
	const trimmed = rawSrc.trim();
	if (!trimmed || /[\x00-\x20\x7F]/.test(trimmed)) {
		return false;
	}
	if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\')) {
		return false;
	}
	return /^(https?:\/\/[^/\\]|\/|\.\.?\/)/i.test(trimmed);
}

/* ============================================================================
 * Crisp 16x16 Stroke Icons (1.85px stroke, currentColor, aria-hidden)
 * ========================================================================== */

export function MiniBlockIcon({ name, className }: { name?: string; className?: string }) {
	const svgProps = {
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 1.85,
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		className: cn('size-3.5 shrink-0', className),
		'aria-hidden': true as const,
	};

	switch ((name || '').toLowerCase()) {
		case 'info':
		case 'callout':
			return (
				<svg {...svgProps}>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 16v-4" />
					<path d="M12 8h.01" />
				</svg>
			);
		case 'tip':
		case 'sparkles':
			return (
				<svg {...svgProps}>
					<path d="M9 18h6" />
					<path d="M10 22h4" />
					<path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
				</svg>
			);
		case 'warning':
			return (
				<svg {...svgProps}>
					<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
					<path d="M12 9v4" />
					<path d="M12 17h.01" />
				</svg>
			);
		case 'danger':
			return (
				<svg {...svgProps}>
					<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
			);
		case 'image':
		case 'figure':
			return (
				<svg {...svgProps}>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<circle cx="8.5" cy="8.5" r="1.5" />
					<path d="m21 15-5-5L5 21" />
				</svg>
			);
		case 'chevron-down':
		case 'details':
			return (
				<svg {...svgProps}>
					<path d="m6 9 6 6 6-6" />
				</svg>
			);
		case 'chevron-right':
			return (
				<svg {...svgProps}>
					<path d="m9 6 6 6-6 6" />
				</svg>
			);
		case 'quote':
		case 'pullquote':
			return (
				<svg {...svgProps}>
					<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
					<path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
				</svg>
			);
		case 'megaphone':
			return (
				<svg {...svgProps}>
					<path d="m3 11 18-5v12L3 14v-3z" />
					<path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
				</svg>
			);
		case 'plus':
		case 'insertblock':
			return (
				<svg {...svgProps}>
					<rect x="3" y="3" width="18" height="18" rx="3" />
					<line x1="12" y1="8" x2="12" y2="16" />
					<line x1="8" y1="12" x2="16" y2="12" />
				</svg>
			);
		case 'arrow-up':
			return (
				<svg {...svgProps}>
					<path d="m18 15-6-6-6 6" />
				</svg>
			);
		case 'arrow-down':
			return (
				<svg {...svgProps}>
					<path d="m6 9 6 6 6-6" />
				</svg>
			);
		case 'paragraph-after':
			return (
				<svg {...svgProps}>
					<polyline points="9 10 4 15 9 20" />
					<path d="M20 4v7a4 4 0 0 1-4 4H4" />
				</svg>
			);
		case 'trash':
			return (
				<svg {...svgProps}>
					<path d="M3 6h18" />
					<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
					<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
				</svg>
			);
		case 'edit':
			return (
				<svg {...svgProps}>
					<path d="M12 20h9" />
					<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
				</svg>
			);
		case 'paragraph':
			return (
				<svg {...svgProps}>
					<path d="M13 4v16" />
					<path d="M17 4v16" />
					<path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
				</svg>
			);
		case 'heading':
			return (
				<svg {...svgProps}>
					<path d="M6 12h12" />
					<path d="M6 20V4" />
					<path d="M18 20V4" />
				</svg>
			);
		case 'bullist':
			return (
				<svg {...svgProps}>
					<line x1="8" y1="6" x2="21" y2="6" />
					<line x1="8" y1="12" x2="21" y2="12" />
					<line x1="8" y1="18" x2="21" y2="18" />
					<circle cx="4" cy="6" r="1" fill="currentColor" />
					<circle cx="4" cy="12" r="1" fill="currentColor" />
					<circle cx="4" cy="18" r="1" fill="currentColor" />
				</svg>
			);
		case 'numlist':
			return (
				<svg {...svgProps}>
					<line x1="10" y1="6" x2="21" y2="6" />
					<line x1="10" y1="12" x2="21" y2="12" />
					<line x1="10" y1="18" x2="21" y2="18" />
					<path d="M4 6h1v4" />
					<path d="M4 10h2" />
					<path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
				</svg>
			);
		case 'tasklist':
			return (
				<svg {...svgProps}>
					<rect x="3" y="5" width="6" height="6" rx="1" />
					<path d="m3 17 2 2 4-4" />
					<path d="M13 6h8" />
					<path d="M13 12h8" />
					<path d="M13 18h8" />
				</svg>
			);
		case 'codeblock':
			return (
				<svg {...svgProps}>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<path d="m10 9-3 3 3 3" />
					<path d="m14 15 3-3-3-3" />
				</svg>
			);
		case 'table':
			return (
				<svg {...svgProps}>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<line x1="3" y1="9" x2="21" y2="9" />
					<line x1="3" y1="15" x2="21" y2="15" />
					<line x1="9" y1="3" x2="9" y2="21" />
					<line x1="15" y1="3" x2="15" y2="21" />
				</svg>
			);
		case 'hr':
			return (
				<svg {...svgProps}>
					<line x1="3" y1="12" x2="21" y2="12" />
				</svg>
			);
		default:
			return (
				<svg {...svgProps}>
					<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
					<path d="m3.3 7 8.7 5 8.7-5" />
					<path d="M12 22V12" />
				</svg>
			);
	}
}

/* ============================================================================
 * Shared Block Controls (Move Up / Move Down / Paragraph Below / Remove)
 * ========================================================================== */

function MiniBlockActionBar({
	editor,
	getPos,
	nodeSize,
	deleteNode,
	t,
}: {
	editor: Editor;
	getPos: (() => number | undefined) | boolean;
	nodeSize: number;
	deleteNode: () => void;
	t: TiptapTranslateFn;
}) {
	if (!editor.isEditable || typeof getPos !== 'function') {
		return null;
	}

	const resolveIndex = (): { pos: number; index: number; count: number } | null => {
		const pos = getPos();
		if (typeof pos !== 'number') {
			return null;
		}
		const $pos = editor.state.doc.resolve(pos);
		if ($pos.depth !== 0) {
			return null;
		}
		return {
			pos,
			index: $pos.index(0),
			count: editor.state.doc.childCount,
		};
	};

	const moveBlock = (direction: -1 | 1) => {
		const info = resolveIndex();
		if (!info) {
			return;
		}
		const targetIndex = info.index + direction;
		if (targetIndex < 0 || targetIndex >= info.count) {
			return;
		}
		const { state } = editor;
		const currentNode = state.doc.child(info.index);
		const siblingNode = state.doc.child(targetIndex);
		const tr = state.tr;

		if (direction === -1) {
			const prevPos = info.pos - siblingNode.nodeSize;
			tr.delete(info.pos, info.pos + currentNode.nodeSize);
			tr.insert(prevPos, currentNode);
		} else {
			const afterCurrent = info.pos + currentNode.nodeSize;
			const afterSibling = afterCurrent + siblingNode.nodeSize;
			tr.insert(afterSibling, currentNode);
			tr.delete(info.pos, afterCurrent);
		}
		editor.view.dispatch(tr.scrollIntoView());
	};

	const insertParagraphAfter = () => {
		const pos = getPos();
		if (typeof pos !== 'number') {
			return;
		}
		const insertAt = pos + nodeSize;
		editor
			.chain()
			.focus()
			.insertContentAt(insertAt, { type: 'paragraph' })
			.setTextSelection(insertAt + 1)
			.run();
	};

	const btnClass =
		'inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer';

	return (
		<div
			className="inline-flex items-center gap-0.5 select-none"
			contentEditable={false}
			role="group"
			aria-label={t('miniBlocks.blockActions', 'Block actions')}
		>
			<button
				type="button"
				className={btnClass}
				title={t('miniBlocks.moveUp', 'Move block up')}
				aria-label={t('miniBlocks.moveUp', 'Move block up')}
				onClick={() => moveBlock(-1)}
			>
				<MiniBlockIcon name="arrow-up" className="size-3" />
			</button>
			<button
				type="button"
				className={btnClass}
				title={t('miniBlocks.moveDown', 'Move block down')}
				aria-label={t('miniBlocks.moveDown', 'Move block down')}
				onClick={() => moveBlock(1)}
			>
				<MiniBlockIcon name="arrow-down" className="size-3" />
			</button>
			<button
				type="button"
				className={btnClass}
				title={t('miniBlocks.insertParagraphBelow', 'Insert paragraph below')}
				aria-label={t('miniBlocks.insertParagraphBelow', 'Insert paragraph below')}
				onClick={insertParagraphAfter}
			>
				<MiniBlockIcon name="paragraph-after" className="size-3" />
			</button>
			<button
				type="button"
				className={cn(btnClass, 'hover:text-destructive')}
				title={t('miniBlocks.removeBlock', 'Remove block')}
				aria-label={t('miniBlocks.removeBlock', 'Remove block')}
				onClick={deleteNode}
			>
				<MiniBlockIcon name="trash" className="size-3" />
			</button>
		</div>
	);
}

/* ============================================================================
 * 1. Callout Block (`callout`)
 * ========================================================================== */

function createCalloutExtension(def: TiptapMiniBlockDefinition, t: TiptapTranslateFn) {
	function CalloutNodeView(props: NodeViewProps) {
		const { node, updateAttributes, deleteNode, editor, getPos, selected } = props;
		const variant = CALLOUT_VARIANT_KEYS.includes(node.attrs.variant) ? node.attrs.variant : 'info';
		const title = String(node.attrs.title ?? '');
		const isEditable = editor.isEditable;
		const variantsMap = def.variants || {
			info: t('miniBlocks.variantInfo', 'Info'),
			tip: t('miniBlocks.variantTip', 'Tip'),
			warning: t('miniBlocks.variantWarning', 'Warning'),
			danger: t('miniBlocks.variantDanger', 'Danger'),
		};

		return (
			<NodeViewWrapper
				as="aside"
				data-tiptap-block="callout"
				data-variant={variant}
				data-selected={selected ? '1' : undefined}
				className="rw-tiptap-mb rw-tiptap-mb--callout my-3"
			>
				<div
					className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-border/60"
					contentEditable={false}
				>
					<div className="flex flex-1 min-w-44 items-center gap-2">
						<span className="rw-tiptap-mb-icon inline-flex size-6 items-center justify-center rounded-sm">
							<MiniBlockIcon name={variant} />
						</span>
						{isEditable ? (
							<input
								type="text"
								value={title}
								onChange={(e) => updateAttributes({ title: e.target.value })}
								placeholder={t('miniBlocks.calloutTitlePlaceholder', 'Optional callout title...')}
								aria-label={t('miniBlocks.calloutTitleAria', 'Callout title')}
								className="h-6 flex-1 min-w-28 bg-transparent text-xs font-semibold text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs px-1"
							/>
						) : title ? (
							<strong className="text-xs font-semibold text-foreground">{title}</strong>
						) : (
							<span className="text-xs font-medium text-muted-foreground">
								{variantsMap[variant] || variant}
							</span>
						)}
					</div>

					{isEditable ? (
						<div className="flex items-center gap-1.5">
							<div
								className="inline-flex items-center rounded-md border border-border/80 bg-background/80 p-0.5"
								role="group"
								aria-label={t('miniBlocks.calloutVariantAria', 'Callout style')}
							>
								{CALLOUT_VARIANT_KEYS.map((vKey) => {
									const active = variant === vKey;
									return (
										<button
											key={vKey}
											type="button"
											aria-pressed={active}
											onClick={() => updateAttributes({ variant: vKey })}
											className={cn(
												'inline-flex min-h-6 min-w-6 items-center justify-center rounded-xs px-2 py-0.5 text-[11px] leading-4 font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
												active
													? 'bg-muted text-foreground shadow-2xs'
													: 'text-muted-foreground hover:text-foreground'
											)}
										>
											{variantsMap[vKey] || vKey}
										</button>
									);
								})}
							</div>
							<MiniBlockActionBar
								editor={editor}
								getPos={getPos}
								nodeSize={node.nodeSize}
								deleteNode={deleteNode}
								t={t}
							/>
						</div>
					) : null}
				</div>

				<NodeViewContent className="rw-tiptap-mb-body" />
			</NodeViewWrapper>
		);
	}

	return Node.create({
		name: 'calloutBlock',
		group: 'block',
		content: '(paragraph | bulletList | orderedList)+',
		defining: true,
		isolating: true,

		addAttributes() {
			return {
				variant: {
					default: 'info',
					parseHTML: (el) => {
						const raw = (el.getAttribute('data-variant') || 'info').toLowerCase();
						return (CALLOUT_VARIANT_KEYS as readonly string[]).includes(raw) ? raw : 'info';
					},
				},
				title: {
					default: '',
					parseHTML: (el) => el.getAttribute('data-title') || '',
				},
			};
		},

		parseHTML() {
			return [
				{ tag: 'aside[data-tiptap-block="callout"]' },
				{ tag: 'div[data-tiptap-block="callout"]' },
			];
		},

		renderHTML({ node }) {
			const variant = CALLOUT_VARIANT_KEYS.includes(node.attrs.variant) ? node.attrs.variant : 'info';
			const title = String(node.attrs.title ?? '').trim();
			return [
				'aside',
				mergeAttributes({
					'data-tiptap-block': 'callout',
					'data-variant': variant,
					...(title ? { 'data-title': title } : {}),
				}),
				0,
			];
		},

		addKeyboardShortcuts() {
			return {
				'Mod-Enter': () => exitMiniBlockBelow(this.editor),
			};
		},

		addNodeView() {
			return ReactNodeViewRenderer(CalloutNodeView);
		},
	});
}

/* ============================================================================
 * 2. Figure Block (`figure`)
 * ========================================================================== */

function createFigureExtension(def: TiptapMiniBlockDefinition, t: TiptapTranslateFn) {
	function FigureNodeView(props: NodeViewProps) {
		const { node, updateAttributes, deleteNode, editor, getPos, selected } = props;
		const figureDomUid = useId().replace(/[^a-zA-Z0-9_-]/g, '') || 'fig';
		const srcInputId = `rw-mb-fig-src-${figureDomUid}`;
		const altInputId = `rw-mb-fig-alt-${figureDomUid}`;
		const src = String(node.attrs.src ?? '');
		const alt = String(node.attrs.alt ?? '');
		const caption = String(node.attrs.caption ?? '');
		const align = FIGURE_ALIGNMENT_KEYS.includes(node.attrs.align) ? node.attrs.align : 'inline';
		const isEditable = editor.isEditable;
		const hasValidSrc = isSafeMiniBlockImageSrc(src);
		const [editingSource, setEditingSource] = useState<boolean>(() => !hasValidSrc);

		const alignmentsMap = def.alignments || {
			inline: t('miniBlocks.alignInline', 'Inline'),
			wide: t('miniBlocks.alignWide', 'Wide'),
			full: t('miniBlocks.alignFull', 'Full'),
			left: t('miniBlocks.alignLeft', 'Left'),
			right: t('miniBlocks.alignRight', 'Right'),
		};

		return (
			<NodeViewWrapper
				as="figure"
				data-tiptap-block="figure"
				data-align={align}
				data-selected={selected ? '1' : undefined}
				className="rw-tiptap-mb rw-tiptap-mb--figure my-3"
				contentEditable={false}
			>
				{isEditable ? (
					<div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2.5 border-b border-border/60">
						<div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
							<MiniBlockIcon name="figure" />
							<span>{def.label || t('miniBlocks.figureLabel', 'Figure')}</span>
						</div>

						<div className="flex flex-wrap items-center gap-1.5">
							<div
								className="inline-flex items-center rounded-md border border-border/80 bg-background/80 p-0.5"
								role="group"
								aria-label={t('miniBlocks.figureAlignAria', 'Figure alignment')}
							>
								{FIGURE_ALIGNMENT_KEYS.map((aKey) => {
									const active = align === aKey;
									return (
										<button
											key={aKey}
											type="button"
											aria-pressed={active}
											onClick={() => updateAttributes({ align: aKey })}
											className={cn(
												'inline-flex min-h-6 min-w-6 items-center justify-center rounded-xs px-2 py-0.5 text-[11px] leading-4 font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
												active
													? 'bg-muted text-foreground shadow-2xs'
													: 'text-muted-foreground hover:text-foreground'
											)}
										>
											{alignmentsMap[aKey] || aKey}
										</button>
									);
								})}
							</div>
							{hasValidSrc ? (
								<button
									type="button"
									aria-pressed={editingSource}
									onClick={() => setEditingSource((prev) => !prev)}
									title={t('miniBlocks.editImageSource', 'Edit image URL and alt text')}
									aria-label={t('miniBlocks.editImageSource', 'Edit image URL and alt text')}
									className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
								>
									<MiniBlockIcon name="edit" className="size-3" />
								</button>
							) : null}
							<MiniBlockActionBar
								editor={editor}
								getPos={getPos}
								nodeSize={node.nodeSize}
								deleteNode={deleteNode}
								t={t}
							/>
						</div>
					</div>
				) : null}

				{isEditable && (!hasValidSrc || editingSource) ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5 rounded-md border border-border/70 bg-muted/25 p-2.5">
						<div className="space-y-1">
							<label htmlFor={srcInputId} className="block text-[11px] font-medium text-muted-foreground">
								{t('image.urlLabel', 'Image URL')}
							</label>
							<Input
								id={srcInputId}
								type="url"
								value={src}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									updateAttributes({ src: e.target.value })
								}
								placeholder={t('image.urlPlaceholder', '/site/assets/files/... or https://...')}
								className="h-7 text-xs"
							/>
						</div>
						<div className="space-y-1">
							<label htmlFor={altInputId} className="block text-[11px] font-medium text-muted-foreground">
								{t('image.altLabel', 'Image alt text')}
							</label>
							<Input
								id={altInputId}
								type="text"
								value={alt}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
									updateAttributes({ alt: e.target.value })
								}
								placeholder={t('image.altPlaceholder', 'Alt description')}
								className="h-7 text-xs"
							/>
						</div>
					</div>
				) : null}

				{hasValidSrc ? (
					<div className="overflow-hidden rounded-md border border-border/70 bg-muted/20">
						<img src={src} alt={alt} className="block max-h-96 w-auto mx-auto object-contain" />
					</div>
				) : !isEditable ? null : (
					<div className="flex items-center justify-center rounded-md border border-dashed border-border py-6 text-xs text-muted-foreground">
						{t('miniBlocks.enterImageUrlHint', 'Paste an image URL above to preview the figure')}
					</div>
				)}

				{isEditable ? (
					<input
						type="text"
						value={caption}
						onChange={(e) => updateAttributes({ caption: e.target.value })}
						placeholder={t('miniBlocks.captionPlaceholder', 'Optional figure caption...')}
						aria-label={t('miniBlocks.captionAria', 'Figure caption')}
						className="mt-2 w-full bg-transparent text-center text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs py-0.5"
					/>
				) : caption ? (
					<figcaption className="mt-2 text-center text-xs text-muted-foreground">{caption}</figcaption>
				) : null}
			</NodeViewWrapper>
		);
	}

	return Node.create({
		name: 'figureBlock',
		group: 'block',
		atom: true,
		selectable: true,
		draggable: false,

		addAttributes() {
			return {
				src: {
					default: '',
					parseHTML: (el) => {
						const img = el.querySelector('img');
						return img?.getAttribute('src') || el.getAttribute('data-src') || '';
					},
				},
				alt: {
					default: '',
					parseHTML: (el) => {
						const img = el.querySelector('img');
						return img?.getAttribute('alt') || el.getAttribute('data-alt') || '';
					},
				},
				align: {
					default: 'inline',
					parseHTML: (el) => {
						const raw = (el.getAttribute('data-align') || 'inline').toLowerCase();
						return (FIGURE_ALIGNMENT_KEYS as readonly string[]).includes(raw) ? raw : 'inline';
					},
				},
				caption: {
					default: '',
					parseHTML: (el) => {
						const cap = el.querySelector('figcaption');
						return cap ? (cap.textContent || '').trim() : el.getAttribute('data-caption') || '';
					},
				},
			};
		},

		parseHTML() {
			return [{ tag: 'figure[data-tiptap-block="figure"]' }];
		},

		renderHTML({ node }) {
			const align = FIGURE_ALIGNMENT_KEYS.includes(node.attrs.align) ? node.attrs.align : 'inline';
			const rawSrc = String(node.attrs.src ?? '').trim();
			const src = isSafeMiniBlockImageSrc(rawSrc) ? rawSrc : '';
			const alt = String(node.attrs.alt ?? '');
			const caption = String(node.attrs.caption ?? '').trim();

			const children: DOMOutputSpec[] = [['img', { src, alt }]];
			if (caption) {
				children.push(['figcaption', {}, caption]);
			}

			return [
				'figure',
				mergeAttributes({
					'data-tiptap-block': 'figure',
					'data-align': align,
				}),
				...children,
			];
		},

		addNodeView() {
			return ReactNodeViewRenderer(FigureNodeView);
		},
	});
}

/* ============================================================================
 * 3. Details / Disclosure Accordion Block (`details`)
 * ========================================================================== */

function createDetailsExtension(_def: TiptapMiniBlockDefinition, t: TiptapTranslateFn) {
	function DetailsNodeView(props: NodeViewProps) {
		const { node, updateAttributes, deleteNode, editor, getPos, selected } = props;
		const summary = String(node.attrs.summary ?? '');
		const defaultOpen = Boolean(node.attrs.open);
		const isEditable = editor.isEditable;
		const [expandedInEditor, setExpandedInEditor] = useState<boolean>(true);
		const isShown = isEditable ? expandedInEditor : defaultOpen;

		return (
			<NodeViewWrapper
				as="div"
				data-tiptap-block="details"
				data-open={isShown ? '1' : '0'}
				data-selected={selected ? '1' : undefined}
				className="rw-tiptap-mb rw-tiptap-mb--details my-3"
			>
				<div
					className="flex flex-wrap items-center justify-between gap-2"
					contentEditable={false}
				>
					<div className="flex flex-1 min-w-44 items-center gap-1.5">
						<button
							type="button"
							aria-expanded={isShown}
							aria-label={t('miniBlocks.togglePreviewAria', 'Toggle accordion preview')}
							onClick={() => {
								if (isEditable) {
									setExpandedInEditor((prev) => !prev);
								} else {
									updateAttributes({ open: !defaultOpen });
								}
							}}
							className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
						>
							<MiniBlockIcon name={isShown ? 'chevron-down' : 'chevron-right'} />
						</button>

						{isEditable ? (
							<input
								type="text"
								value={summary}
								onChange={(e) => updateAttributes({ summary: e.target.value })}
								placeholder={t('miniBlocks.detailsSummaryPlaceholder', 'Accordion summary title...')}
								aria-label={t('miniBlocks.detailsSummaryAria', 'Accordion summary')}
								className="h-6 flex-1 min-w-32 bg-transparent text-xs font-semibold text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs px-1"
							/>
						) : (
							<span className="text-xs font-semibold text-foreground">
								{summary || t('miniBlocks.detailsDefaultSummary', 'Details')}
							</span>
						)}
					</div>

					{isEditable ? (
						<div className="flex items-center gap-1.5">
							<label className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground cursor-pointer select-none">
								<input
									type="checkbox"
									checked={defaultOpen}
									onChange={(e) => updateAttributes({ open: e.target.checked })}
									className="rounded border-border"
								/>
								<span>{t('miniBlocks.openByDefault', 'Open by default')}</span>
							</label>
							<MiniBlockActionBar
								editor={editor}
								getPos={getPos}
								nodeSize={node.nodeSize}
								deleteNode={deleteNode}
								t={t}
							/>
						</div>
					) : null}
				</div>

				<div
					hidden={!isShown}
					className="mt-2 pt-2 border-t border-border/60"
				>
					<NodeViewContent className="rw-tiptap-mb-body" />
				</div>
			</NodeViewWrapper>
		);
	}

	const defaultDetailsSummary = t('miniBlocks.detailsDefaultSummary', 'Details');

	return Node.create({
		name: 'detailsBlock',
		group: 'block',
		content: '(paragraph | bulletList | orderedList)+',
		defining: true,
		isolating: true,

		addAttributes() {
			return {
				summary: {
					default: defaultDetailsSummary,
					parseHTML: (el) => {
						const sum = el.querySelector(':scope > summary') || el.querySelector('summary');
						return sum ? (sum.textContent || '').trim() || defaultDetailsSummary : defaultDetailsSummary;
					},
				},
				open: {
					default: false,
					parseHTML: (el) => el.hasAttribute('open'),
				},
			};
		},

		parseHTML() {
			return [
				{
					tag: 'details[data-tiptap-block="details"]',
					contentElement: (node) => {
						const el = node as HTMLElement;
						return (el.querySelector('[data-tiptap-details-body]') as HTMLElement) || el;
					},
				},
			];
		},

		renderHTML({ node }) {
			const summary = String(node.attrs.summary ?? '').trim() || defaultDetailsSummary;
			const isOpen = Boolean(node.attrs.open);
			return [
				'details',
				mergeAttributes({
					'data-tiptap-block': 'details',
					...(isOpen ? { open: '' } : {}),
				}),
				['summary', {}, summary],
				['div', { 'data-tiptap-details-body': '1' }, 0],
			];
		},

		addKeyboardShortcuts() {
			return {
				'Mod-Enter': () => exitMiniBlockBelow(this.editor),
			};
		},

		addNodeView() {
			return ReactNodeViewRenderer(DetailsNodeView);
		},
	});
}

/* ============================================================================
 * 4. Pullquote Block (`pullquote`)
 * ========================================================================== */

function createPullquoteExtension(_def: TiptapMiniBlockDefinition, t: TiptapTranslateFn) {
	function PullquoteNodeView(props: NodeViewProps) {
		const { node, updateAttributes, deleteNode, editor, getPos, selected } = props;
		const citation = String(node.attrs.citation ?? '');
		const isEditable = editor.isEditable;

		return (
			<NodeViewWrapper
				as="figure"
				data-tiptap-block="pullquote"
				data-selected={selected ? '1' : undefined}
				className="rw-tiptap-mb rw-tiptap-mb--pullquote my-3"
			>
				{isEditable ? (
					<div
						className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-border/50"
						contentEditable={false}
					>
						<span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
							<MiniBlockIcon name="quote" />
							<span>{t('miniBlocks.pullquoteLabel', 'Pullquote')}</span>
						</span>
						<MiniBlockActionBar
							editor={editor}
							getPos={getPos}
							nodeSize={node.nodeSize}
							deleteNode={deleteNode}
							t={t}
						/>
					</div>
				) : null}

				<NodeViewContent className="rw-tiptap-mb-quote" />

				{isEditable ? (
					<div className="mt-2 pt-1.5 border-t border-border/40" contentEditable={false}>
						<input
							type="text"
							value={citation}
							onChange={(e) => updateAttributes({ citation: e.target.value })}
							placeholder={t('miniBlocks.citationPlaceholder', 'Citation or author (optional)...')}
							aria-label={t('miniBlocks.citationAria', 'Quote citation')}
							className="h-6 w-full bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs px-1"
						/>
					</div>
				) : citation ? (
					<figcaption className="mt-2 text-xs font-medium text-muted-foreground">{citation}</figcaption>
				) : null}
			</NodeViewWrapper>
		);
	}

	return Node.create({
		name: 'pullquoteBlock',
		group: 'block',
		content: 'paragraph+',
		defining: true,
		isolating: true,

		addAttributes() {
			return {
				citation: {
					default: '',
					parseHTML: (el) => {
						const cap = el.querySelector(':scope > figcaption') || el.querySelector('figcaption');
						return cap ? (cap.textContent || '').trim() : el.getAttribute('data-citation') || '';
					},
				},
			};
		},

		parseHTML() {
			return [
				{
					tag: 'figure[data-tiptap-block="pullquote"]',
					contentElement: (node) => {
						const el = node as HTMLElement;
						return (el.querySelector('blockquote') as HTMLElement) || el;
					},
				},
			];
		},

		renderHTML({ node }) {
			const citation = String(node.attrs.citation ?? '').trim();
			const children: DOMOutputSpec[] = [['blockquote', { 'data-tiptap-quote': '1' }, 0]];
			if (citation) {
				children.push(['figcaption', {}, citation]);
			}
			return ['figure', { 'data-tiptap-block': 'pullquote' }, ...children];
		},

		addKeyboardShortcuts() {
			return {
				'Mod-Enter': () => exitMiniBlockBelow(this.editor),
			};
		},

		addNodeView() {
			return ReactNodeViewRenderer(PullquoteNodeView);
		},
	});
}

/* ============================================================================
 * 5. Project-Specific Declarative Custom Mini-Blocks (`./site/tiptap/*.yaml`)
 * ========================================================================== */

function createCustomMiniBlockExtension(def: TiptapMiniBlockDefinition, t: TiptapTranslateFn) {
	const safeTag = ALLOWED_CUSTOM_TAGS.has((def.tag || '').toLowerCase())
		? (def.tag.toLowerCase() as 'aside' | 'section' | 'div' | 'figure' | 'blockquote')
		: 'div';
	const fields: TiptapMiniBlockFieldDef[] = Array.isArray(def.fields) ? def.fields : [];

	function CustomMiniBlockNodeView(props: NodeViewProps) {
		const customDomUid = useId().replace(/[^a-zA-Z0-9_-]/g, '') || 'mb';
		const runtimeMap = runtime as unknown as Record<string, unknown>;
		const customViews = runtimeMap.tiptapMiniBlockViews as
			| Record<string, React.ComponentType<NodeViewProps & { definition: TiptapMiniBlockDefinition }>>
			| undefined;
		const CustomOverride = customViews?.[def.name];
		if (CustomOverride) {
			return <CustomOverride {...props} definition={def} />;
		}

		const { node, updateAttributes, deleteNode, editor, getPos, selected } = props;
		const isEditable = editor.isEditable;

		return (
			<NodeViewWrapper
				as={safeTag}
				data-tiptap-block={def.name}
				data-selected={selected ? '1' : undefined}
				className="rw-tiptap-mb rw-tiptap-mb--custom my-3"
				contentEditable={def.editableBody ? undefined : false}
			>
				<div
					className={cn(
						'flex flex-wrap items-center justify-between gap-2',
						(fields.length > 0 || def.editableBody) && 'pb-2 mb-2.5 border-b border-border/60'
					)}
					contentEditable={false}
				>
					<div className="inline-flex items-center gap-1.5">
						<span className="inline-flex size-5 items-center justify-center rounded-sm bg-muted text-muted-foreground">
							<MiniBlockIcon name={def.icon || 'box'} className="size-3" />
						</span>
						<span className="text-xs font-semibold text-foreground">{def.label}</span>
						<Badge variant="outline" mono className="px-1 py-0 text-[9px] text-muted-foreground">
							{def.name}
						</Badge>
					</div>

					<MiniBlockActionBar
						editor={editor}
						getPos={getPos}
						nodeSize={node.nodeSize}
						deleteNode={deleteNode}
						t={t}
					/>
				</div>

				{fields.length > 0 ? (
					<div
						className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2.5"
						contentEditable={false}
					>
						{fields.map((field) => {
							const rawVal = node.attrs[field.name];
							const isFullSpan = field.type === 'textarea';
							if (!isEditable) {
								if (field.type === 'toggle') {
									return (
										<div key={field.name} className="text-xs">
											<span className="text-muted-foreground">{field.label}: </span>
											<span className="font-medium text-foreground">
												{rawVal ? t('common.yes', 'Yes') : t('common.no', 'No')}
											</span>
										</div>
									);
								}
								if (field.type === 'image' && isSafeMiniBlockImageSrc(String(rawVal || ''))) {
									return (
										<div key={field.name} className="sm:col-span-2">
											<img
												src={String(rawVal)}
												alt={field.label}
												className="max-h-48 rounded-md border border-border object-contain"
											/>
										</div>
									);
								}
								return (
									<div key={field.name} className={cn('text-xs', isFullSpan && 'sm:col-span-2')}>
										<span className="text-muted-foreground">{field.label}: </span>
										<span className="font-medium text-foreground">{String(rawVal ?? '')}</span>
									</div>
								);
							}

							if (field.type === 'toggle') {
								const checked = Boolean(rawVal);
								return (
									<label
										key={field.name}
										className="inline-flex items-center gap-2 self-end py-1 text-xs text-foreground cursor-pointer select-none"
									>
										<input
											type="checkbox"
											checked={checked}
											onChange={(e) => updateAttributes({ [field.name]: e.target.checked })}
											className="rounded border-border"
										/>
										<span>{field.label}</span>
									</label>
								);
							}

							const fieldDomId = `rw-mb-${def.name}-${field.name}-${customDomUid}`;

							if (field.type === 'select') {
								const entries = Object.entries(field.options || {});
								return (
									<div key={field.name} className="space-y-1">
										<label htmlFor={fieldDomId} className="block text-[11px] font-medium text-muted-foreground">
											{field.label}
										</label>
										<select
											id={fieldDomId}
											value={String(rawVal ?? '')}
											onChange={(e) => updateAttributes({ [field.name]: e.target.value })}
											className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											{entries.map(([optVal, optLabel]) => (
												<option key={optVal} value={optVal}>
													{optLabel}
												</option>
											))}
										</select>
									</div>
								);
							}

							if (field.type === 'textarea') {
								return (
									<div key={field.name} className="space-y-1 sm:col-span-2">
										<label htmlFor={fieldDomId} className="block text-[11px] font-medium text-muted-foreground">
											{field.label}
										</label>
										<Textarea
											id={fieldDomId}
											rows={2}
											value={String(rawVal ?? '')}
											placeholder={field.placeholder || ''}
											onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
												updateAttributes({ [field.name]: e.target.value })
											}
											className="text-xs min-h-14"
										/>
									</div>
								);
							}

							return (
								<div key={field.name} className="space-y-1">
									<label htmlFor={fieldDomId} className="block text-[11px] font-medium text-muted-foreground">
										{field.label}
									</label>
									<Input
										id={fieldDomId}
										type={field.type === 'url' || field.type === 'image' ? 'url' : 'text'}
										value={String(rawVal ?? '')}
										placeholder={field.placeholder || ''}
										onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
											updateAttributes({ [field.name]: e.target.value })
										}
										className="h-7 text-xs"
									/>
								</div>
							);
						})}
					</div>
				) : null}

				{def.editableBody ? (
					<div className="rounded-md border border-border/60 bg-background/60 px-2.5 py-2">
						<NodeViewContent className="rw-tiptap-mb-body" />
					</div>
				) : null}
			</NodeViewWrapper>
		);
	}

	return Node.create({
		name: `customMiniBlock_${def.name}`,
		group: 'block',
		...(def.editableBody
			? {
					content: '(paragraph | bulletList | orderedList)+',
					defining: true,
					isolating: true,
				}
			: {
					atom: true,
					selectable: true,
					draggable: false,
				}),

		addAttributes() {
			const attrSpec: Record<
				string,
				{
					default: string | boolean;
					parseHTML: (el: HTMLElement) => string | boolean;
				}
			> = {};
			for (const field of fields) {
				const fallback =
					field.default !== undefined ? field.default : field.type === 'toggle' ? false : '';
				attrSpec[field.name] = {
					default: fallback,
					parseHTML: (el: HTMLElement) => {
						const raw = el.getAttribute(field.attr);
						if (raw === null) {
							return fallback;
						}
						if (field.type === 'toggle') {
							return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
						}
						return raw;
					},
				};
			}
			return attrSpec;
		},

		parseHTML() {
			const selector = `[data-tiptap-block="${def.name}"]`;
			if (def.editableBody) {
				return [
					{
						tag: selector,
						contentElement: (node) => {
							const el = node as HTMLElement;
							return (el.querySelector('[data-tiptap-body]') as HTMLElement) || el;
						},
					},
				];
			}
			return [{ tag: selector }];
		},

		renderHTML({ node }) {
			const htmlAttrs: Record<string, string> = {
				'data-tiptap-block': def.name,
			};
			for (const field of fields) {
				const val = node.attrs[field.name];
				if (field.type === 'toggle') {
					htmlAttrs[field.attr] = val ? '1' : '0';
				} else if (field.type === 'url') {
					const str = String(val ?? '').trim();
					htmlAttrs[field.attr] = isSafeMiniBlockHref(str) ? str : '';
				} else if (field.type === 'image') {
					const str = String(val ?? '').trim();
					htmlAttrs[field.attr] = isSafeMiniBlockImageSrc(str) ? str : '';
				} else {
					htmlAttrs[field.attr] = String(val ?? '');
				}
			}

			if (def.editableBody) {
				return [safeTag, mergeAttributes(htmlAttrs), ['div', { 'data-tiptap-body': '1' }, 0]];
			}
			return [safeTag, mergeAttributes(htmlAttrs)];
		},

		addKeyboardShortcuts() {
			if (!def.editableBody) {
				const empty: Record<string, () => boolean> = {};
				return empty;
			}
			return {
				'Mod-Enter': () => exitMiniBlockBelow(this.editor),
			};
		},

		addNodeView() {
			return ReactNodeViewRenderer(CustomMiniBlockNodeView);
		},
	});
}

/* ============================================================================
 * Public Builders & Insertion Helpers
 * ========================================================================== */

function exitMiniBlockBelow(editor: Editor): boolean {
	const { $from } = editor.state.selection;
	for (let depth = $from.depth; depth >= 1; depth--) {
		const ancestor = $from.node(depth);
		if (
			ancestor.type.name === 'calloutBlock' ||
			ancestor.type.name === 'detailsBlock' ||
			ancestor.type.name === 'pullquoteBlock' ||
			ancestor.type.name.startsWith('customMiniBlock_')
		) {
			const afterPos = $from.after(depth);
			return editor
				.chain()
				.insertContentAt(afterPos, { type: 'paragraph' })
				.setTextSelection(afterPos + 1)
				.run();
		}
	}
	return false;
}

export function resolveSlashContext(editor: Editor): SlashBlockContext {
	const { $from } = editor.state.selection;
	for (let depth = $from.depth; depth >= 1; depth--) {
		const typeName = $from.node(depth).type.name;
		if (typeName === 'pullquoteBlock') {
			return 'paragraphOnly';
		}
		if (
			typeName === 'calloutBlock' ||
			typeName === 'detailsBlock' ||
			typeName === 'figureBlock' ||
			typeName.startsWith('customMiniBlock_')
		) {
			return 'miniBlockList';
		}
	}
	return $from.depth === 1 ? 'top' : 'nested';
}

export function resolveMiniBlockNodeName(def: TiptapMiniBlockDefinition): string {
	switch (def.name) {
		case 'callout':
			return 'calloutBlock';
		case 'figure':
			return 'figureBlock';
		case 'details':
			return 'detailsBlock';
		case 'pullquote':
			return 'pullquoteBlock';
		default:
			return `customMiniBlock_${def.name}`;
	}
}

export function insertMiniBlock(
	editor: Editor,
	def: TiptapMiniBlockDefinition,
	deleteRange?: { from: number; to: number },
	t?: TiptapTranslateFn
): boolean {
	const nodeType = resolveMiniBlockNodeName(def);
	if (!editor.schema.nodes[nodeType]) {
		return false;
	}

	const initialAttrs: Record<string, string | boolean> = {};
	if (def.name === 'callout') {
		initialAttrs.variant = 'info';
		initialAttrs.title = '';
	} else if (def.name === 'figure') {
		initialAttrs.src = '';
		initialAttrs.alt = '';
		initialAttrs.align = 'inline';
		initialAttrs.caption = '';
	} else if (def.name === 'details') {
		initialAttrs.summary = def.label || (t ? t('miniBlocks.detailsDefaultSummary', 'Details') : 'Details');
		initialAttrs.open = true;
	} else if (def.name === 'pullquote') {
		initialAttrs.citation = '';
	} else if (Array.isArray(def.fields)) {
		for (const field of def.fields) {
			initialAttrs[field.name] =
				field.default !== undefined ? field.default : field.type === 'toggle' ? false : '';
		}
	}

	const hasEditableContent =
		def.name === 'callout' ||
		def.name === 'details' ||
		def.name === 'pullquote' ||
		Boolean(def.editableBody);

	const payload: { type: string; attrs: Record<string, string | boolean>; content?: Array<{ type: string }> } = {
		type: nodeType,
		attrs: initialAttrs,
		...(hasEditableContent ? { content: [{ type: 'paragraph' }] } : {}),
	};

	const chain = editor.chain().focus();
	if (deleteRange) {
		chain.deleteRange(deleteRange);
	}

	// Enforce flat depth=1: if cursor is currently inside another block (blockquote, list, mini-block),
	// insert at the top-level document boundary right after the outermost block!
	const { $from } = editor.state.selection;
	if (!deleteRange && $from.depth > 1) {
		const afterTopLevel = $from.after(1);
		return chain.insertContentAt(afterTopLevel, [payload, { type: 'paragraph' }]).run();
	}

	return chain.insertContent([payload, { type: 'paragraph' }]).run();
}

export function createMiniBlockExtensions(
	defs: Record<string, TiptapMiniBlockDefinition> | undefined,
	activeNames: string[] | undefined,
	t: TiptapTranslateFn
): AnyExtension[] {
	if (!defs || !Array.isArray(activeNames) || activeNames.length === 0) {
		return [];
	}

	const extensions: AnyExtension[] = [];
	const seen = new Set<string>();

	for (const rawName of activeNames) {
		const name = String(rawName || '').trim();
		if (!name || seen.has(name)) {
			continue;
		}
		const def = defs[name];
		if (!def) {
			continue;
		}
		seen.add(name);

		if (name === 'callout') {
			extensions.push(createCalloutExtension(def, t));
		} else if (name === 'figure') {
			extensions.push(createFigureExtension(def, t));
		} else if (name === 'details') {
			extensions.push(createDetailsExtension(def, t));
		} else if (name === 'pullquote') {
			extensions.push(createPullquoteExtension(def, t));
		} else {
			extensions.push(createCustomMiniBlockExtension(def, t));
		}
	}

	return extensions;
}

export function buildMiniBlockSlashItems({
	miniBlockDefs,
	activeMiniBlocks,
	t,
	onAnnounce,
}: {
	miniBlockDefs?: Record<string, TiptapMiniBlockDefinition>;
	activeMiniBlocks?: string[];
	t: TiptapTranslateFn;
	onAnnounce?: (msg: string) => void;
}): SlashCommandItem[] {
	if (!miniBlockDefs || !Array.isArray(activeMiniBlocks) || activeMiniBlocks.length === 0) {
		return [];
	}

	const items: SlashCommandItem[] = [];
	for (const name of activeMiniBlocks) {
		const def = miniBlockDefs[name];
		if (!def) {
			continue;
		}
		items.push({
			id: `mb:${def.name}`,
			group: 'miniBlock',
			label: def.label,
			description:
				def.description ||
				t('miniBlocks.customBlockDescription', 'Editorial mini-block'),
			icon: def.icon || def.name,
			keywords: [def.name, ...(Array.isArray(def.keywords) ? def.keywords : [])],
			execute: (ed, range) => {
				insertMiniBlock(ed, def, range, t);
				onAnnounce?.(
					t('status.miniBlockInserted', { block: def.label }, '{block} inserted')
				);
			},
		});
	}

	return items;
}
