/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import type { Editor } from '@tiptap/core';
import { getReactWorkspaceRuntime } from '../../runtime';
import type { TiptapTranslateFn } from '../core/tiptapTypes';

const runtime = getReactWorkspaceRuntime();
const { React, UI } = runtime;
const { Button } = UI;

export function TableControlsBar({
	editor,
	t,
	onAnnounce,
}: {
	editor: Editor;
	t: TiptapTranslateFn;
	onAnnounce: (msg: string) => void;
}) {
	return (
		<div
			className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-3 py-1.5 text-xs"
			role="group"
			aria-label={t('table.controlsAria', 'Table controls')}
			data-rw-tiptap-table-bar=""
		>
			<span className="text-[11px] font-medium text-muted-foreground mr-1">
				{t('table.label', 'Table:')}
			</span>
			<Button
				type="button"
				variant="outline"
				size="xs"
				onClick={() => editor.chain().focus().addRowAfter().run()}
			>
				{t('table.addRow', '+ Row')}
			</Button>
			<Button
				type="button"
				variant="outline"
				size="xs"
				onClick={() => editor.chain().focus().deleteRow().run()}
			>
				{t('table.deleteRow', '- Row')}
			</Button>
			<Button
				type="button"
				variant="outline"
				size="xs"
				onClick={() => editor.chain().focus().addColumnAfter().run()}
			>
				{t('table.addCol', '+ Column')}
			</Button>
			<Button
				type="button"
				variant="outline"
				size="xs"
				onClick={() => editor.chain().focus().deleteColumn().run()}
			>
				{t('table.deleteCol', '- Column')}
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="xs"
				className="text-destructive hover:text-destructive"
				onClick={() => {
					editor.chain().focus().deleteTable().run();
					onAnnounce(t('status.tableDeleted', 'Table deleted'));
				}}
			>
				{t('table.deleteTable', 'Delete Table')}
			</Button>
		</div>
	);
}
