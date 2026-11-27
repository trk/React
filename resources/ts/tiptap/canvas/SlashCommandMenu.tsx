/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { getReactWorkspaceRuntime } from '../../runtime';
import { getTiptapCapability } from '../core/tiptapRuntime';
import type {
	HeadingLevel,
	SlashBlockContext,
	SlashCommandItem,
	SlashCommandKeyboardBridge,
	SlashCommandState,
	TiptapMiniBlockDefinition,
	TiptapTranslateFn,
} from '../core/tiptapTypes';

const runtime = getReactWorkspaceRuntime();
const { React, Portal, Utils } = runtime;
const { cn } = Utils;
const { PortalRoot } = Portal;
const { useEffect, useId, useMemo, useRef, useState } = React;

const SLASH_PLUGIN_KEY = new PluginKey('rwTiptapSlashMenu');

export const CLOSED_SLASH_STATE: SlashCommandState = {
	active: false,
	query: '',
	range: { from: 0, to: 0 },
	coords: { left: 0, top: 0, bottom: 0 },
	context: 'top',
};

function resolveSlashContext(editor: Editor): SlashBlockContext {
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

function SlashIcon({ name, className }: { name?: string; className?: string }) {
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
					<path d="M8 6h13" />
					<path d="M8 12h13" />
					<path d="M8 18h13" />
					<path d="M3 6h.01" />
					<path d="M3 12h.01" />
					<path d="M3 18h.01" />
				</svg>
			);
		case 'numlist':
			return (
				<svg {...svgProps}>
					<path d="M10 6h11" />
					<path d="M10 12h11" />
					<path d="M10 18h11" />
					<path d="M4 6h1v4" />
					<path d="M4 10h2" />
					<path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
				</svg>
			);
		case 'tasklist':
			return (
				<svg {...svgProps}>
					<rect x="3" y="5" width="6" height="6" rx="1" />
					<path d="m4.5 8 1 1 2-2" />
					<path d="M13 6h8" />
					<path d="M13 12h8" />
					<path d="M13 18h8" />
					<rect x="3" y="13" width="6" height="6" rx="1" />
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
		case 'codeblock':
			return (
				<svg {...svgProps}>
					<polyline points="16 18 22 12 16 6" />
					<polyline points="8 6 2 12 8 18" />
				</svg>
			);
		case 'table':
			return (
				<svg {...svgProps}>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<path d="M3 9h18" />
					<path d="M9 3v18" />
				</svg>
			);
		case 'hr':
			return (
				<svg {...svgProps}>
					<line x1="3" y1="12" x2="21" y2="12" />
				</svg>
			);
		case 'info':
		case 'callout':
			return (
				<svg {...svgProps}>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 16v-4" />
					<path d="M12 8h.01" />
				</svg>
			);
		case 'image':
		case 'figure':
			return (
				<svg {...svgProps}>
					<rect x="3" y="4" width="18" height="16" rx="2" />
					<circle cx="8.5" cy="9.5" r="1.5" />
					<path d="m21 16-5-5-6 6" />
				</svg>
			);
		case 'details':
		case 'chevron-down':
			return (
				<svg {...svgProps}>
					<rect x="3" y="4" width="18" height="16" rx="2" />
					<path d="m8 10 4 4 4-4" />
				</svg>
			);
		default:
			return (
				<svg {...svgProps}>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<path d="M12 8v8" />
					<path d="M8 12h8" />
				</svg>
			);
	}
}

export function createSlashCommandExtension(
	enabled: boolean,
	onStateChangeRef: { current: (next: SlashCommandState) => void },
	keyboardBridgeRef: { current: SlashCommandKeyboardBridge }
) {
	return Extension.create({
		name: 'slashCommandMenu',

		addProseMirrorPlugins() {
			if (!enabled) {
				return [];
			}
			const editor = this.editor;

			return [
				new Plugin({
					key: SLASH_PLUGIN_KEY,
					props: {
						handleKeyDown(_view, event) {
							if (event.isComposing || event.keyCode === 229) {
								return false;
							}
							if (!keyboardBridgeRef.current.isOpen) {
								return false;
							}
							if (
								event.key === 'ArrowDown' ||
								event.key === 'ArrowUp' ||
								event.key === 'Home' ||
								event.key === 'End' ||
								event.key === 'Enter' ||
								event.key === 'Escape'
							) {
								return keyboardBridgeRef.current.onKeyDown(event);
							}
							return false;
						},
					},
					view() {
						let wasActive = false;
						let dismissedAtPos = -1;

						const emitClosed = () => {
							if (wasActive) {
								wasActive = false;
								onStateChangeRef.current(CLOSED_SLASH_STATE);
							}
						};

						return {
							update(view) {
								if (!editor.isEditable || !view.hasFocus()) {
									emitClosed();
									return;
								}

								const { selection } = view.state;
								if (!selection.empty) {
									emitClosed();
									return;
								}

								const { $from } = selection;
								if ($from.parent.type.name !== 'paragraph') {
									emitClosed();
									return;
								}

								const textBefore = $from.parent.textBetween(
									0,
									$from.parentOffset,
									'\n',
									'\0'
								);
								const textAfter = $from.parent.textBetween(
									$from.parentOffset,
									$from.parent.content.size,
									'\n',
									'\0'
								);

								const match = /^\/([^\s/]{0,32})$/.exec(textBefore);
								if (!match || textAfter.trim() !== '') {
									dismissedAtPos = -1;
									emitClosed();
									return;
								}

								const slashFrom = $from.start();
								if (dismissedAtPos === slashFrom) {
									emitClosed();
									return;
								}

								let coords = { left: 0, top: 0, bottom: 0 };
								try {
									const rawCoords = view.coordsAtPos(selection.from);
									coords = {
										left: rawCoords.left,
										top: rawCoords.top,
										bottom: rawCoords.bottom,
									};
								} catch {
									emitClosed();
									return;
								}

								wasActive = true;
								keyboardBridgeRef.current.dismiss = () => {
									dismissedAtPos = slashFrom;
									wasActive = false;
									onStateChangeRef.current(CLOSED_SLASH_STATE);
								};

								onStateChangeRef.current({
									active: true,
									query: match[1] || '',
									range: {
										from: slashFrom,
										to: selection.from,
									},
									coords,
									context: resolveSlashContext(editor),
								});
							},
							destroy() {
								emitClosed();
							},
						};
					},
				}),
			];
		},
	});
}

function buildSlashCommandItems({
	editor,
	miniBlockDefs,
	activeMiniBlocks,
	allowedHeadings,
	context,
	t,
	onAnnounce,
}: {
	editor: Editor;
	miniBlockDefs?: Record<string, TiptapMiniBlockDefinition>;
	activeMiniBlocks?: string[];
	allowedHeadings: HeadingLevel[];
	context: SlashBlockContext;
	t: TiptapTranslateFn;
	onAnnounce?: (msg: string) => void;
}): SlashCommandItem[] {
	const isTopLevel = context === 'top';
	const allowsRichBlocks = context === 'top' || context === 'nested';
	const allowsLists = allowsRichBlocks || context === 'miniBlockList';
	const hasTaskList = Boolean(editor.schema.nodes.taskList);
	const hasTable = Boolean(editor.schema.nodes.table);

	const items: SlashCommandItem[] = [];

	if (isTopLevel) {
		const blocksCap = getTiptapCapability('blocks');
		if (blocksCap) {
			items.push(
				...blocksCap.buildMiniBlockSlashItems({
					miniBlockDefs,
					activeMiniBlocks,
					t,
					onAnnounce,
				})
			);
		}
	}

	items.push({
		id: 'basic:paragraph',
		group: 'basic',
		label: t('styles.paragraph', 'Paragraph'),
		description: t('slash.paragraphDesc', 'Plain body text paragraph'),
		icon: 'paragraph',
		keywords: ['paragraph', 'text', 'p'],
		execute: (ed, range) => {
			const chain = ed.chain().focus();
			if (range) chain.deleteRange(range);
			chain.setParagraph().run();
		},
	});

	if (allowsRichBlocks) {
		for (const lvl of allowedHeadings) {
			items.push({
				id: `basic:h${lvl}`,
				group: 'basic',
				label: t('styles.heading', { level: lvl }, `Heading ${lvl}`),
				description: t('slash.headingDesc', { level: lvl }, 'Section heading level {level}'),
				icon: 'heading',
				keywords: [`h${lvl}`, `heading${lvl}`, 'heading', 'title'],
				execute: (ed, range) => {
					const chain = ed.chain().focus();
					if (range) chain.deleteRange(range);
					chain.setHeading({ level: lvl }).run();
				},
			});
		}
	}

	if (allowsLists) {
		items.push(
			{
				id: 'basic:bullist',
				group: 'basic',
				label: t('tools.bullist', 'Bullet list'),
				description: t('slash.bullistDesc', 'Unordered bulleted list'),
				icon: 'bullist',
				keywords: ['bullet', 'ul', 'list'],
				execute: (ed, range) => {
					const chain = ed.chain().focus();
					if (range) chain.deleteRange(range);
					chain.toggleBulletList().run();
				},
			},
			{
				id: 'basic:numlist',
				group: 'basic',
				label: t('tools.numlist', 'Numbered list'),
				description: t('slash.numlistDesc', 'Ordered numbered list'),
				icon: 'numlist',
				keywords: ['numbered', 'ordered', 'ol', 'list'],
				execute: (ed, range) => {
					const chain = ed.chain().focus();
					if (range) chain.deleteRange(range);
					chain.toggleOrderedList().run();
				},
			}
		);
	}

	if (allowsRichBlocks) {
		if (hasTaskList) {
			items.push({
				id: 'basic:tasklist',
				group: 'basic',
				label: t('tools.tasklist', 'Task list'),
				description: t('slash.tasklistDesc', 'Interactive checklist items'),
				icon: 'tasklist',
				keywords: ['task', 'todo', 'check', 'checklist'],
				execute: (ed, range) => {
					const chain = ed.chain().focus();
					if (range) chain.deleteRange(range);
					(chain as unknown as { toggleTaskList: () => typeof chain }).toggleTaskList().run();
				},
			});
		}
		items.push(
			{
				id: 'basic:blockquote',
				group: 'basic',
				label: t('tools.blockquote', 'Blockquote'),
				description: t('slash.blockquoteDesc', 'Standard inline quotation'),
				icon: 'quote',
				keywords: ['quote', 'blockquote'],
				execute: (ed, range) => {
					const chain = ed.chain().focus();
					if (range) chain.deleteRange(range);
					chain.toggleBlockquote().run();
				},
			},
			{
				id: 'basic:codeblock',
				group: 'basic',
				label: t('tools.codeblock', 'Code block'),
				description: t('slash.codeblockDesc', 'Monospace code snippet'),
				icon: 'codeblock',
				keywords: ['code', 'pre', 'snippet'],
				execute: (ed, range) => {
					const chain = ed.chain().focus();
					if (range) chain.deleteRange(range);
					chain.toggleCodeBlock().run();
				},
			}
		);
	}

	if (isTopLevel) {
		if (hasTable) {
			items.push({
				id: 'basic:table',
				group: 'basic',
				label: t('tools.table', 'Insert table'),
				description: t('slash.tableDesc', '3x3 structured table with header row'),
				icon: 'table',
				keywords: ['table', 'grid', 'rows', 'columns'],
				execute: (ed, range) => {
					const chain = ed.chain().focus();
					if (range) chain.deleteRange(range);
					(
						chain as unknown as {
							insertTable: (opts: { rows: number; cols: number; withHeaderRow: boolean }) => typeof chain;
						}
					)
						.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
						.run();
				},
			});
		}
		items.push({
			id: 'basic:hr',
			group: 'basic',
			label: t('tools.hr', 'Insert horizontal rule'),
			description: t('slash.hrDesc', 'Visual section divider line'),
			icon: 'hr',
			keywords: ['hr', 'divider', 'line', 'rule'],
			execute: (ed, range) => {
				const chain = ed.chain().focus();
				if (range) chain.deleteRange(range);
				chain.setHorizontalRule().run();
			},
		});
	}

	return items;
}

export function SlashCommandPalette({
	editor,
	slashState,
	miniBlockDefs,
	activeMiniBlocks,
	allowedHeadings,
	keyboardBridgeRef,
	listboxId,
	onActiveOptionChange,
	t,
	onAnnounce,
}: {
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
}) {
	const fallbackId = useId().replace(/[^a-zA-Z0-9_-]/g, '') || 'slash';
	const resolvedListboxId = listboxId || `rw-slash-list-${fallbackId}`;
	const [selectedIndex, setSelectedIndex] = useState(0);
	const listRef = useRef<HTMLDivElement | null>(null);

	const items = useMemo(
		() =>
			buildSlashCommandItems({
				editor,
				miniBlockDefs,
				activeMiniBlocks,
				allowedHeadings,
				context: slashState.context,
				t,
				onAnnounce,
			}),
		[
			editor,
			miniBlockDefs,
			activeMiniBlocks?.join(','),
			allowedHeadings.join(','),
			slashState.context,
			t,
			onAnnounce,
		]
	);

	const filtered = useMemo(() => {
		const q = slashState.query.trim().toLowerCase();
		if (!q) {
			return items;
		}
		return items.filter((item) => {
			if (item.label.toLowerCase().includes(q)) return true;
			if (item.description.toLowerCase().includes(q)) return true;
			return item.keywords.some((kw) => kw.toLowerCase().includes(q));
		});
	}, [items, slashState.query]);

	useEffect(() => {
		setSelectedIndex(0);
	}, [slashState.query, slashState.active]);

	useEffect(() => {
		if (!slashState.active || !editor) {
			keyboardBridgeRef.current.isOpen = false;
			return;
		}

		keyboardBridgeRef.current.isOpen = true;
		keyboardBridgeRef.current.onKeyDown = (event: KeyboardEvent): boolean => {
			if (event.isComposing || event.keyCode === 229) {
				return false;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				keyboardBridgeRef.current.dismiss();
				return true;
			}
			if (filtered.length === 0) {
				return false;
			}
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				setSelectedIndex((prev) => (prev + 1) % filtered.length);
				return true;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
				return true;
			}
			if (event.key === 'Home') {
				event.preventDefault();
				setSelectedIndex(0);
				return true;
			}
			if (event.key === 'End') {
				event.preventDefault();
				setSelectedIndex(filtered.length - 1);
				return true;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				const chosen = filtered[selectedIndex] || filtered[0];
				if (chosen) {
					chosen.execute(editor, slashState.range);
				}
				return true;
			}
			return false;
		};

		return () => {
			keyboardBridgeRef.current.isOpen = false;
		};
	}, [slashState.active, slashState.range, filtered, selectedIndex, editor, keyboardBridgeRef]);

	useEffect(() => {
		if (!onActiveOptionChange) {
			return;
		}
		if (!slashState.active || !editor || filtered.length === 0) {
			onActiveOptionChange(null);
			return;
		}
		const clampedIdx = Math.max(0, Math.min(selectedIndex, filtered.length - 1));
		onActiveOptionChange(`${resolvedListboxId}-opt-${clampedIdx}`);
	}, [slashState.active, editor, filtered.length, selectedIndex, resolvedListboxId, onActiveOptionChange]);

	useEffect(() => {
		if (!slashState.active || !listRef.current) {
			return;
		}
		const activeEl = listRef.current.querySelector<HTMLElement>(
			`[data-rw-slash-idx="${selectedIndex}"]`
		);
		activeEl?.scrollIntoView({ block: 'nearest' });
	}, [selectedIndex, slashState.active]);

	if (!slashState.active || !editor) {
		return null;
	}

	const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
	const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
	const menuWidth = 288;
	const maxMenuHeight = 304;
	const clampedLeft = Math.max(12, Math.min(slashState.coords.left, viewportW - menuWidth - 12));
	const spaceBelow = viewportH - slashState.coords.bottom - 12;
	const flipAbove = spaceBelow < 220 && slashState.coords.top > spaceBelow;

	const positionStyle: React.CSSProperties = flipAbove
		? {
				left: `${clampedLeft}px`,
				bottom: `${Math.max(12, viewportH - slashState.coords.top + 6)}px`,
				width: `${menuWidth}px`,
				maxHeight: `${Math.min(maxMenuHeight, slashState.coords.top - 16)}px`,
			}
		: {
				left: `${clampedLeft}px`,
				top: `${slashState.coords.bottom + 6}px`,
				width: `${menuWidth}px`,
				maxHeight: `${Math.min(maxMenuHeight, Math.max(160, spaceBelow))}px`,
			};

	const miniGroup = filtered.filter((i) => i.group === 'miniBlock');
	const basicGroup = filtered.filter((i) => i.group === 'basic');
	const miniHeadingId = `${resolvedListboxId}-grp-mini`;
	const basicHeadingId = `${resolvedListboxId}-grp-basic`;

	let runningIdx = -1;

	const renderRow = (item: SlashCommandItem) => {
		runningIdx += 1;
		const itemIndex = runningIdx;
		const isSelected = itemIndex === selectedIndex;

		return (
			<button
				key={item.id}
				id={`${resolvedListboxId}-opt-${itemIndex}`}
				type="button"
				role="option"
				aria-selected={isSelected}
				data-rw-slash-idx={itemIndex}
				onMouseEnter={() => setSelectedIndex(itemIndex)}
				onMouseDown={(e) => {
					e.preventDefault();
					item.execute(editor, slashState.range);
				}}
				className={cn(
					'flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					isSelected
						? 'bg-accent text-accent-foreground'
						: 'text-popover-foreground hover:bg-accent/60'
				)}
			>
				<span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-border/70 bg-background text-muted-foreground">
					<SlashIcon name={item.icon} className="size-3.5" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-xs font-medium text-foreground">
						{item.label}
					</span>
					<span className="block truncate text-[11px] text-muted-foreground">
						{item.description}
					</span>
				</span>
			</button>
		);
	};

	const paletteNode =
		filtered.length === 0 ? (
			<div
				ref={listRef}
				role="status"
				data-rw-tiptap-slash-menu=""
				data-rw-portal-overlay=""
				style={positionStyle}
				className="fixed z-50 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
			>
				<div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
					{t('slash.noMatches', 'No matching blocks')}
				</div>
			</div>
		) : (
			<div
				id={resolvedListboxId}
				ref={listRef}
				role="listbox"
				aria-label={t('slash.menuAria', 'Insert block command menu')}
				data-rw-tiptap-slash-menu=""
				data-rw-portal-overlay=""
				style={positionStyle}
				className="fixed z-50 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
			>
				{miniGroup.length > 0 ? (
					<div role="group" aria-labelledby={miniHeadingId}>
						<div
							id={miniHeadingId}
							className="px-2 py-1 text-[11px] font-medium text-muted-foreground"
						>
							{t('slash.editorialBlocksHeading', 'Editorial blocks')}
						</div>
						{miniGroup.map(renderRow)}
					</div>
				) : null}

				{miniGroup.length > 0 && basicGroup.length > 0 ? (
					<hr role="presentation" className="my-1 border-border/70" />
				) : null}

				{basicGroup.length > 0 ? (
					<div role="group" aria-labelledby={basicHeadingId}>
						<div
							id={basicHeadingId}
							className="px-2 py-1 text-[11px] font-medium text-muted-foreground"
						>
							{t('slash.basicBlocksHeading', 'Basic formatting')}
						</div>
						{basicGroup.map(renderRow)}
					</div>
				) : null}
			</div>
		);

	let anchorEl: HTMLElement | null = null;
	try {
		anchorEl = editor?.view?.dom ?? null;
	} catch {
		anchorEl = null;
	}

	return <PortalRoot anchor={anchorEl}>{paletteNode}</PortalRoot>;
}
