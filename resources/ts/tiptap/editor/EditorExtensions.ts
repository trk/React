import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import type { AnyExtension } from '@tiptap/core';
import type { PwImageAttrs, PwImageConfig, TiptapEditorCapability, TiptapTranslateFn } from '../core/tiptapTypes';
import { createPwAnchorExtension } from './PwAnchorExtension';
import { createPwImageExtension } from './PwImageExtension';

const DEFAULT_IMAGE_CONFIG: PwImageConfig = {
	alignLeftClass: 'align_left',
	alignCenterClass: 'align_center',
	alignRightClass: 'align_right',
	hidpiDefault: false,
	noSizeAttrs: false,
	maxWidth: 0,
	skipFields: [],
};

export const createEditorExtensions: TiptapEditorCapability['createExtensions'] = ({
	imageConfig,
	enableImgResizeRef,
	onEditImageRef,
	onResizeImageServerRef,
	onEditAnchorRef,
	t,
}) => {
	return [
		Highlight,
		Subscript,
		Superscript,
		TextAlign.configure({
			types: ['heading', 'paragraph'],
		}),
		createPwAnchorExtension(onEditAnchorRef),
		createPwImageExtension({
			imageConfig,
			enableImgResizeRef,
			onEditImageRef,
			onResizeImageServerRef,
			t,
		}),
		Table.configure({
			resizable: false,
		}),
		TableRow,
		TableHeader,
		TableCell,
		TaskList,
		TaskItem.configure({
			nested: true,
		}),
	] as AnyExtension[];
};

export function createReadOnlyEditorExtensions(t: TiptapTranslateFn): AnyExtension[] {
	const falseRef = { current: false };
	const noopEditRef: { current: ((pos: number, attrs: PwImageAttrs) => void) | null } = { current: null };
	const noopResizeRef: {
		current: ((pos: number, attrs: PwImageAttrs, nextWidth: number) => void) | null;
	} = { current: null };

	return [
		Highlight,
		Subscript,
		Superscript,
		TextAlign.configure({
			types: ['heading', 'paragraph'],
		}),
		createPwAnchorExtension(),
		createPwImageExtension({
			imageConfig: DEFAULT_IMAGE_CONFIG,
			enableImgResizeRef: falseRef,
			onEditImageRef: noopEditRef,
			onResizeImageServerRef: noopResizeRef,
			t,
		}),
		Table.configure({
			resizable: false,
		}),
		TableRow,
		TableHeader,
		TableCell,
		TaskList,
		TaskItem.configure({
			nested: true,
		}),
	] as AnyExtension[];
}
