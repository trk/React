/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { registerTiptapCapability } from '../tiptap/core/tiptapRuntime';
import { createEditorExtensions, createReadOnlyEditorExtensions } from '../tiptap/editor/EditorExtensions';
import { TableControlsBar } from '../tiptap/editor/TableControlsBar';

registerTiptapCapability('editor', {
	createExtensions: createEditorExtensions,
	createReadOnlyExtensions: createReadOnlyEditorExtensions,
	TableControlsBar,
});
