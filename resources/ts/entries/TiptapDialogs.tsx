/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { registerTiptapCapability } from '../tiptap/core/tiptapRuntime';
import {
	TiptapAnchorDialog,
	TiptapImageDialog,
	TiptapLinkDialog,
} from '../tiptap/dialogs/TiptapPwDialogs';

registerTiptapCapability('dialogs', {
	TiptapLinkDialog,
	TiptapImageDialog,
	TiptapAnchorDialog,
});
