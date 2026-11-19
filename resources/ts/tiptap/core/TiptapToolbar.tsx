/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import type { Editor } from '@tiptap/core';
import { getReactWorkspaceRuntime } from '../../runtime';
import { EditorIcon } from './EditorIcon';
import { getTiptapCapability } from './tiptapRuntime';
import { describeToolbarGroup } from './toolbarConfig';
import type {
	HeadingLevel,
	TiptapMiniBlockDefinition,
	TiptapTranslateFn,
	ToolbarSnapshot,
	ToolbarSource,
} from './tiptapTypes';

const runtime = getReactWorkspaceRuntime();
const { React } = runtime;

export interface TiptapToolbarGroupsProps {
	editor: Editor | null;
	groups: string[][];
	prefix: string;
	source?: ToolbarSource;
	snapshot: ToolbarSnapshot;
	allowedLevels: HeadingLevel[];
	isCurrentLangEditable: boolean;
	isSourceMode: boolean;
	isFullscreen: boolean;
	allowSourceCode: boolean;
	linkDialogOpen: boolean;
	imageDialogOpen: boolean;
	anchorDialogOpen: boolean;
	activeMiniBlocks: string[];
	miniBlockDefs?: Record<string, TiptapMiniBlockDefinition>;
	onOpenLink: (source: ToolbarSource) => void;
	onOpenImage: (source: ToolbarSource) => void;
	onOpenAnchor: () => void;
	onToggleSourceMode: () => void;
	onToggleFullscreen: () => void;
	onPrefetchDialogs: () => void;
	onAnnounce: (msg: string) => void;
	t: TiptapTranslateFn;
}

export function renderTiptapToolbarGroups(opts: TiptapToolbarGroupsProps): React.ReactNode[] {
	const {
		editor,
		groups,
		prefix,
		source = 'top',
		snapshot,
		allowedLevels,
		isCurrentLangEditable,
		isSourceMode,
		isFullscreen,
		allowSourceCode,
		linkDialogOpen,
		imageDialogOpen,
		anchorDialogOpen,
		activeMiniBlocks,
		miniBlockDefs,
		onOpenLink,
		onOpenImage,
		onOpenAnchor,
		onToggleSourceMode,
		onToggleFullscreen,
		onPrefetchDialogs,
		onAnnounce,
		t,
	} = opts;

	if (!editor) {
		return [];
	}

	const preventToolbarFocusLoss = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
	};

	const editorCap = getTiptapCapability('editor');
	const blocksCap = getTiptapCapability('blocks');
	const hasEditorSchema = Boolean(editorCap);

	const renderToken = (token: string, keyPrefix: string): React.ReactNode => {
		if (token === 'styles') {
			return (
				<select
					key={`${keyPrefix}-styles`}
					aria-label={t('styles.ariaLabel', 'Paragraph style')}
					disabled={!isCurrentLangEditable || isSourceMode}
					value={snapshot.blockStyle}
					onChange={(e) => {
						const val = e.target.value;
						if (val === 'paragraph') {
							editor.chain().focus().setParagraph().run();
						} else {
							const lvl = Number(val.replace('h', '')) as HeadingLevel;
							if (lvl >= 1 && lvl <= 6) {
								editor.chain().focus().toggleHeading({ level: lvl }).run();
							}
						}
					}}
					className="h-7 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-45"
					data-rw-tiptap-tool="styles"
				>
					<option value="paragraph">{t('styles.paragraph', 'Paragraph')}</option>
					{allowedLevels.map((lvl) => (
						<option key={`opt-h${lvl}`} value={`h${lvl}`}>
							{t('styles.heading', { level: lvl }, 'Heading {level}')}
						</option>
					))}
				</select>
			);
		}

		if (token === 'paragraph') {
			const isActive = snapshot.blockStyle === 'paragraph';
			const paragraphLabel = t('styles.paragraph', 'Paragraph');
			return (
				<button
					key={`${keyPrefix}-paragraph`}
					type="button"
					aria-label={paragraphLabel}
					aria-pressed={isActive}
					aria-disabled={!isCurrentLangEditable || isSourceMode ? 'true' : undefined}
					title={paragraphLabel}
					data-rw-tiptap-tool="paragraph"
					onMouseDown={preventToolbarFocusLoss}
					onClick={() => {
						if (!isCurrentLangEditable || isSourceMode) return;
						editor.chain().focus().setParagraph().run();
					}}
				>
					<span className="text-[11px] font-semibold tracking-tight">P</span>
				</button>
			);
		}

		const headingMatch = /^h([1-6])$/.exec(token);
		if (headingMatch) {
			const lvl = Number(headingMatch[1]) as HeadingLevel;
			if (!allowedLevels.includes(lvl)) {
				return null;
			}
			const isActive = snapshot.blockStyle === `h${lvl}`;
			const headingLabel = t('styles.heading', { level: lvl }, 'Heading {level}');
			return (
				<button
					key={`${keyPrefix}-${token}`}
					type="button"
					aria-label={headingLabel}
					aria-pressed={isActive}
					aria-disabled={!isCurrentLangEditable || isSourceMode ? 'true' : undefined}
					title={headingLabel}
					data-rw-tiptap-tool={token}
					onMouseDown={preventToolbarFocusLoss}
					onClick={() => {
						if (!isCurrentLangEditable || isSourceMode) return;
						editor.chain().focus().toggleHeading({ level: lvl }).run();
					}}
				>
					<span className="text-[11px] font-semibold tracking-tight">{`H${lvl}`}</span>
				</button>
			);
		}

		const coreToggleSpecs: Record<string, { label: string; active: boolean; run: () => void }> = {
			bold: {
				label: t('tools.bold', 'Bold'),
				active: snapshot.bold,
				run: () => editor.chain().focus().toggleBold().run(),
			},
			italic: {
				label: t('tools.italic', 'Italic'),
				active: snapshot.italic,
				run: () => editor.chain().focus().toggleItalic().run(),
			},
			underline: {
				label: t('tools.underline', 'Underline'),
				active: snapshot.underline,
				run: () => editor.chain().focus().toggleUnderline().run(),
			},
			strike: {
				label: t('tools.strike', 'Strikethrough'),
				active: snapshot.strike,
				run: () => editor.chain().focus().toggleStrike().run(),
			},
			code: {
				label: t('tools.code', 'Inline code'),
				active: snapshot.code,
				run: () => editor.chain().focus().toggleCode().run(),
			},
			bullist: {
				label: t('tools.bullist', 'Bullet list'),
				active: snapshot.bulletList,
				run: () => editor.chain().focus().toggleBulletList().run(),
			},
			numlist: {
				label: t('tools.numlist', 'Numbered list'),
				active: snapshot.orderedList,
				run: () => editor.chain().focus().toggleOrderedList().run(),
			},
			blockquote: {
				label: t('tools.blockquote', 'Blockquote'),
				active: snapshot.blockquote,
				run: () => editor.chain().focus().toggleBlockquote().run(),
			},
			codeblock: {
				label: t('tools.codeblock', 'Code block'),
				active: snapshot.codeBlock,
				run: () => editor.chain().focus().toggleCodeBlock().run(),
			},
		};

		if (token in coreToggleSpecs) {
			const spec = coreToggleSpecs[token]!;
			const unavailable = !isCurrentLangEditable || isSourceMode;
			return (
				<button
					key={`${keyPrefix}-${token}`}
					type="button"
					aria-label={spec.label}
					aria-pressed={spec.active}
					aria-disabled={unavailable ? 'true' : undefined}
					title={spec.label}
					data-rw-tiptap-tool={token}
					onMouseDown={preventToolbarFocusLoss}
					onClick={() => {
						if (unavailable) return;
						spec.run();
					}}
				>
					<EditorIcon name={token} />
				</button>
			);
		}

		const editorToggleSpecs: Record<string, { label: string; active: boolean; run: () => void }> = {
			highlight: {
				label: t('tools.highlight', 'Highlight'),
				active: snapshot.highlight,
				run: () => editor.chain().focus().toggleHighlight().run(),
			},
			subscript: {
				label: t('tools.subscript', 'Subscript'),
				active: snapshot.subscript,
				run: () => editor.chain().focus().toggleSubscript().run(),
			},
			superscript: {
				label: t('tools.superscript', 'Superscript'),
				active: snapshot.superscript,
				run: () => editor.chain().focus().toggleSuperscript().run(),
			},
			alignleft: {
				label: t('tools.alignleft', 'Align left'),
				active: snapshot.alignLeft,
				run: () => editor.chain().focus().setTextAlign('left').run(),
			},
			aligncenter: {
				label: t('tools.aligncenter', 'Align center'),
				active: snapshot.alignCenter,
				run: () => editor.chain().focus().setTextAlign('center').run(),
			},
			alignright: {
				label: t('tools.alignright', 'Align right'),
				active: snapshot.alignRight,
				run: () => editor.chain().focus().setTextAlign('right').run(),
			},
			alignjustify: {
				label: t('tools.alignjustify', 'Justify'),
				active: snapshot.alignJustify,
				run: () => editor.chain().focus().setTextAlign('justify').run(),
			},
			tasklist: {
				label: t('tools.tasklist', 'Task list'),
				active: snapshot.taskList,
				run: () => editor.chain().focus().toggleTaskList().run(),
			},
		};

		if (token in editorToggleSpecs) {
			if (!hasEditorSchema) {
				return null;
			}
			const spec = editorToggleSpecs[token]!;
			const unavailable = !isCurrentLangEditable || isSourceMode;
			return (
				<button
					key={`${keyPrefix}-${token}`}
					type="button"
					aria-label={spec.label}
					aria-pressed={spec.active}
					aria-disabled={unavailable ? 'true' : undefined}
					title={spec.label}
					data-rw-tiptap-tool={token}
					onMouseDown={preventToolbarFocusLoss}
					onClick={() => {
						if (unavailable) return;
						spec.run();
					}}
				>
					<EditorIcon name={token} />
				</button>
			);
		}

		if (token === 'link') {
			const unavailable = !isCurrentLangEditable || isSourceMode;
			const linkLabel = t('tools.link', 'Link');
			const isLinkPanelActive = source === 'top' && linkDialogOpen;
			return (
				<button
					key={`${keyPrefix}-link`}
					type="button"
					aria-label={linkLabel}
					aria-pressed={snapshot.link || isLinkPanelActive}
					aria-disabled={unavailable ? 'true' : undefined}
					title={linkLabel}
					data-rw-tiptap-tool="link"
					onMouseDown={preventToolbarFocusLoss}
					onPointerEnter={onPrefetchDialogs}
					onFocus={onPrefetchDialogs}
					onClick={() => {
						if (unavailable) return;
						onOpenLink(source);
					}}
				>
					<EditorIcon name="link" />
				</button>
			);
		}

		if (token === 'unlink') {
			const unavailable = !isCurrentLangEditable || isSourceMode || !snapshot.link;
			const unlinkLabel = t('tools.unlink', 'Remove link');
			return (
				<button
					key={`${keyPrefix}-unlink`}
					type="button"
					aria-label={unlinkLabel}
					aria-disabled={unavailable ? 'true' : undefined}
					title={unlinkLabel}
					data-rw-tiptap-tool="unlink"
					onMouseDown={preventToolbarFocusLoss}
					onClick={() => {
						if (unavailable) return;
						editor.chain().focus().extendMarkRange('link').unsetLink().run();
						onAnnounce(t('status.linkRemoved', 'Link removed'));
					}}
				>
					<EditorIcon name="unlink" />
				</button>
			);
		}

		if (token === 'anchor') {
			if (!hasEditorSchema) {
				return null;
			}
			const unavailable = !isCurrentLangEditable || isSourceMode;
			const anchorLabel = t('tools.anchor', 'Insert anchor');
			return (
				<button
					key={`${keyPrefix}-anchor`}
					type="button"
					aria-label={anchorLabel}
					aria-pressed={anchorDialogOpen}
					aria-disabled={unavailable ? 'true' : undefined}
					title={anchorLabel}
					data-rw-tiptap-tool="anchor"
					onMouseDown={preventToolbarFocusLoss}
					onPointerEnter={onPrefetchDialogs}
					onFocus={onPrefetchDialogs}
					onClick={() => {
						if (unavailable) return;
						onOpenAnchor();
					}}
				>
					<EditorIcon name="anchor" />
				</button>
			);
		}

		if (token === 'image') {
			if (!hasEditorSchema) {
				return null;
			}
			const unavailable = !isCurrentLangEditable || isSourceMode;
			const imageLabel = t('tools.image', 'Insert image');
			const isImagePanelActive = source === 'top' && imageDialogOpen;
			return (
				<button
					key={`${keyPrefix}-image`}
					type="button"
					aria-label={imageLabel}
					aria-pressed={isImagePanelActive}
					aria-disabled={unavailable ? 'true' : undefined}
					title={imageLabel}
					data-rw-tiptap-tool="image"
					onMouseDown={preventToolbarFocusLoss}
					onPointerEnter={onPrefetchDialogs}
					onFocus={onPrefetchDialogs}
					onClick={() => {
						if (unavailable) return;
						onOpenImage(source);
					}}
				>
					<EditorIcon name="image" />
				</button>
			);
		}

		if (token === 'table') {
			if (!hasEditorSchema) {
				return null;
			}
			const unavailable = !isCurrentLangEditable || isSourceMode;
			return (
				<button
					key={`${keyPrefix}-table`}
					type="button"
					aria-label={t('tools.table', 'Insert table')}
					aria-pressed={snapshot.inTable}
					aria-disabled={unavailable ? 'true' : undefined}
					title={snapshot.inTable ? t('tools.tableActive', 'Table active') : t('tools.tableInsert3x3', 'Insert 3x3 table')}
					data-rw-tiptap-tool="table"
					onMouseDown={preventToolbarFocusLoss}
					onClick={() => {
						if (unavailable) return;
						if (!snapshot.inTable) {
							editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
							onAnnounce(t('status.tableInserted', 'Table inserted'));
						}
					}}
				>
					<EditorIcon name="table" />
				</button>
			);
		}

		if (token === 'hr') {
			const unavailable = !isCurrentLangEditable || isSourceMode;
			const hrLabel = t('tools.hr', 'Insert horizontal rule');
			return (
				<button
					key={`${keyPrefix}-hr`}
					type="button"
					aria-label={hrLabel}
					aria-disabled={unavailable ? 'true' : undefined}
					title={hrLabel}
					data-rw-tiptap-tool="hr"
					onMouseDown={preventToolbarFocusLoss}
					onClick={() => {
						if (unavailable) return;
						editor.chain().focus().setHorizontalRule().run();
						onAnnounce(t('status.hrInserted', 'Horizontal rule inserted'));
					}}
				>
					<EditorIcon name="hr" />
				</button>
			);
		}

		if (token === 'insertblock') {
			if (activeMiniBlocks.length === 0 || !blocksCap) {
				return null;
			}
			const unavailable = !isCurrentLangEditable || isSourceMode;
			const InsertBlockMenu = blocksCap.ToolbarInsertBlockMenu;
			return (
				<InsertBlockMenu
					key={`${keyPrefix}-insertblock`}
					editor={editor}
					miniBlockDefs={miniBlockDefs}
					activeMiniBlocks={activeMiniBlocks}
					disabled={unavailable}
					t={t}
					onAnnounce={onAnnounce}
				/>
			);
		}

		if (token === 'removeformat') {
			const unavailable = !isCurrentLangEditable || isSourceMode;
			const clearLabel = t('tools.removeformat', 'Clear formatting');
			return (
				<button
					key={`${keyPrefix}-removeformat`}
					type="button"
					aria-label={clearLabel}
					aria-disabled={unavailable ? 'true' : undefined}
					title={clearLabel}
					data-rw-tiptap-tool="removeformat"
					onMouseDown={preventToolbarFocusLoss}
					onClick={() => {
						if (unavailable) return;
						editor.chain().focus().unsetAllMarks().clearNodes().run();
						onAnnounce(t('status.formattingCleared', 'Formatting cleared'));
					}}
				>
					<EditorIcon name="removeformat" />
				</button>
			);
		}

		if (token === 'source') {
			if (!allowSourceCode) {
				return null;
			}
			const sourceLabel = t('tools.source', 'HTML source code');
			return (
				<button
					key={`${keyPrefix}-source`}
					type="button"
					aria-label={sourceLabel}
					aria-pressed={isSourceMode}
					title={sourceLabel}
					data-rw-tiptap-tool="source"
					onMouseDown={preventToolbarFocusLoss}
					onClick={onToggleSourceMode}
				>
					<EditorIcon name="source" />
				</button>
			);
		}

		if (token === 'fullscreen') {
			const fullscreenLabel = t('tools.fullscreen', 'Fullscreen editor');
			return (
				<button
					key={`${keyPrefix}-fullscreen`}
					type="button"
					aria-label={fullscreenLabel}
					aria-pressed={isFullscreen}
					title={isFullscreen ? t('tools.exitFullscreen', 'Exit fullscreen') : fullscreenLabel}
					data-rw-tiptap-tool="fullscreen"
					onMouseDown={preventToolbarFocusLoss}
					onClick={onToggleFullscreen}
				>
					<EditorIcon name="fullscreen" />
				</button>
			);
		}

		if (token === 'undo') {
			const unavailable = !isCurrentLangEditable || isSourceMode || !snapshot.canUndo;
			const undoLabel = t('tools.undo', 'Undo');
			return (
				<button
					key={`${keyPrefix}-undo`}
					type="button"
					aria-label={undoLabel}
					aria-disabled={unavailable ? 'true' : undefined}
					title={undoLabel}
					data-rw-tiptap-tool="undo"
					onMouseDown={preventToolbarFocusLoss}
					onClick={() => {
						if (unavailable) return;
						editor.chain().focus().undo().run();
						onAnnounce(t('status.undidChange', 'Undid last change'));
					}}
				>
					<EditorIcon name="undo" />
				</button>
			);
		}

		if (token === 'redo') {
			const unavailable = !isCurrentLangEditable || isSourceMode || !snapshot.canRedo;
			const redoLabel = t('tools.redo', 'Redo');
			return (
				<button
					key={`${keyPrefix}-redo`}
					type="button"
					aria-label={redoLabel}
					aria-disabled={unavailable ? 'true' : undefined}
					title={redoLabel}
					data-rw-tiptap-tool="redo"
					onMouseDown={preventToolbarFocusLoss}
					onClick={() => {
						if (unavailable) return;
						editor.chain().focus().redo().run();
						onAnnounce(t('status.redidChange', 'Redid change'));
					}}
				>
					<EditorIcon name="redo" />
				</button>
			);
		}

		return null;
	};

	const renderedGroups = groups
		.map((group, idx) => {
			const nodes = group
				.map((token) => renderToken(token, `${prefix}-g${idx}`))
				.filter((n) => n !== null && n !== false);
			if (nodes.length === 0) {
				return null;
			}
			return {
				label: describeToolbarGroup(group, idx, t),
				nodes,
				key: `${prefix}-group-${idx}`,
			};
		})
		.filter(Boolean) as Array<{ label: string; nodes: React.ReactNode[]; key: string }>;

	return renderedGroups.map((g, idx) => (
		<React.Fragment key={g.key}>
			{idx > 0 ? (
				<span
					role="separator"
					aria-orientation="vertical"
					className="mx-0.5 h-4 w-px shrink-0 border-l border-border"
				/>
			) : null}
			<div role="group" aria-label={g.label} className="inline-flex flex-wrap items-center gap-0.5">
				{g.nodes}
			</div>
		</React.Fragment>
	));
}
