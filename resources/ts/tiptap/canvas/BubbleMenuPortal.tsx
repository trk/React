/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus';
import { getReactWorkspaceRuntime } from '../../runtime';
import type { TiptapCanvasCapability } from '../core/tiptapTypes';

const runtime = getReactWorkspaceRuntime();
const { React } = runtime;

export const BubbleMenuPortal: TiptapCanvasCapability['BubbleMenuPortal'] = ({
	editor,
	pluginKey,
	getBubblePortal,
	getBubbleReferenceVirtualElement,
	bubbleShouldShow,
	bubbleMenuOptions,
	bubbleToolbarRef,
	bubbleMenuElRef,
	editorDomId,
	focusEditorSynchronously,
	t,
	children,
}) => {
	return (
		<BubbleMenu
			ref={bubbleMenuElRef}
			editor={editor}
			pluginKey={pluginKey as unknown as BubbleMenuProps['pluginKey']}
			updateDelay={100}
			appendTo={getBubblePortal}
			getReferencedVirtualElement={getBubbleReferenceVirtualElement}
			shouldShow={bubbleShouldShow as BubbleMenuProps['shouldShow']}
			options={bubbleMenuOptions as BubbleMenuProps['options']}
			className="pointer-events-auto fixed z-[1060] w-max max-w-[min(calc(100vw-1.5rem),32rem)] rounded-lg border border-border bg-popover px-1.5 py-1 text-popover-foreground shadow-lg"
			data-rw-tiptap-bubble-menu=""
		>
			<div
				onBlur={(e: React.FocusEvent<HTMLDivElement>) => {
					const nextFocused = e.relatedTarget as Node | null;
					if (!nextFocused) {
						return;
					}
					if (
						bubbleMenuElRef.current?.contains(nextFocused) ||
						editor.view.dom.contains(nextFocused)
					) {
						return;
					}
					editor.view.dispatch(editor.state.tr.setMeta(pluginKey, 'hide'));
				}}
				onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
					if (e.key === 'Escape') {
						e.preventDefault();
						e.stopPropagation();
						focusEditorSynchronously(editor);
						editor.view.dispatch(editor.state.tr.setMeta(pluginKey, 'hide'));
					}
				}}
				data-rw-tiptap-bubble-inner=""
			>
				<div
					ref={bubbleToolbarRef}
					role="toolbar"
					aria-label={t('editor.selectionToolbar', 'Selection formatting')}
					aria-controls={editorDomId}
					data-rw-tiptap-toolbar=""
					{...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
					className="flex flex-wrap items-center gap-0.5"
				>
					{children}
				</div>
			</div>
		</BubbleMenu>
	);
};
