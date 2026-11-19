/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { registerTiptapCapability } from '../tiptap/core/tiptapRuntime';
import {
	buildMiniBlockSlashItems,
	createMiniBlockExtensions,
} from '../tiptap/blocks/MiniBlockExtensions';
import { ToolbarInsertBlockMenu } from '../tiptap/blocks/ToolbarInsertBlockMenu';

registerTiptapCapability('blocks', {
	createMiniBlockExtensions,
	buildMiniBlockSlashItems,
	ToolbarInsertBlockMenu,
});
