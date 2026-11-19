/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { registerTiptapCapability } from '../tiptap/core/tiptapRuntime';
import { BlockHandleOverlay } from '../tiptap/canvas/BlockHandleOverlay';
import { BubbleMenuPortal } from '../tiptap/canvas/BubbleMenuPortal';
import {
	createSlashCommandExtension,
	SlashCommandPalette,
} from '../tiptap/canvas/SlashCommandMenu';

registerTiptapCapability('canvas', {
	createSlashExtension: createSlashCommandExtension,
	BubbleMenuPortal,
	SlashCommandPalette,
	BlockHandleOverlay,
});
