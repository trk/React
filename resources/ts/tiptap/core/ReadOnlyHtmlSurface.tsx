/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { getReactWorkspaceRuntime } from '../../runtime';
import { sanitizeExtraCss } from '../tiptapPolicy';
import { createPwHeadingExtension, createPwLinkExtension } from './CorePwExtensions';
import { getTiptapCapability, subscribeTiptapCapabilities } from './tiptapRuntime';
import type { TiptapMiniBlockDefinition, TiptapTranslateFn } from './tiptapTypes';

const runtime = getReactWorkspaceRuntime();
const { React } = runtime;
const { useEffect, useMemo, useRef, useState } = React;

export function ReadOnlyHtmlSurface({
	html,
	extraCSS,
	scopeId,
	miniBlocks,
	miniBlockDefs,
	t,
}: {
	html: string;
	extraCSS?: string;
	scopeId: string;
	miniBlocks?: string[];
	miniBlockDefs?: Record<string, TiptapMiniBlockDefinition>;
	t: TiptapTranslateFn;
}) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const [, setCapTick] = useState(0);
	const supportsSetHtml = typeof Element !== 'undefined' && 'setHTML' in Element.prototype;
	const hasSpecialNodesInHtml = Boolean(
		html && (html.includes('data-tiptap-block') || html.includes('data-type="taskList"'))
	);
	const useSafeSetHtml = supportsSetHtml && !hasSpecialNodesInHtml;

	const editorCap = getTiptapCapability('editor');
	const blocksCap = getTiptapCapability('blocks');

	useEffect(() => {
		const unsub = subscribeTiptapCapabilities(() => setCapTick((n) => n + 1));
		if (hasSpecialNodesInHtml) {
			const missing: string[] = [];
			if (html.includes('data-type="taskList"') && !editorCap) {
				missing.push('editor');
			}
			if (html.includes('data-tiptap-block') && !blocksCap) {
				missing.push('blocks');
			}
			if (missing.length > 0) {
				void runtime.ensureTiptapLoaded?.(missing);
			}
		}
		return unsub;
	}, [hasSpecialNodesInHtml, html, Boolean(editorCap), Boolean(blocksCap)]);

	useEffect(() => {
		const node = hostRef.current as (HTMLDivElement & { setHTML?: (input: string) => void }) | null;
		if (!node || !useSafeSetHtml || typeof node.setHTML !== 'function') {
			return;
		}
		node.setHTML(html || '');
	}, [html, useSafeSetHtml]);

	const readOnlyMiniBlockExts = useMemo(
		() => (blocksCap ? blocksCap.createMiniBlockExtensions(miniBlockDefs, miniBlocks, t) : []),
		[blocksCap, miniBlockDefs, miniBlocks ? miniBlocks.join(',') : '', t]
	);
	const readOnlyEditorExts = useMemo(
		() => (editorCap ? editorCap.createReadOnlyExtensions(t) : []),
		[editorCap, t]
	);

	const fallbackEditor = useEditor(
		{
			immediatelyRender: true,
			editable: false,
			extensions: [
				StarterKit.configure({
					heading: false,
					link: false,
				}),
				createPwHeadingExtension([1, 2, 3, 4, 5, 6]),
				createPwLinkExtension({ openOnClick: true }),
				...readOnlyEditorExts,
				...readOnlyMiniBlockExts,
			],
			content: useSafeSetHtml ? '' : html || '',
		},
		[
			useSafeSetHtml,
			Boolean(editorCap),
			Boolean(blocksCap),
			miniBlocks ? miniBlocks.join(',') : '',
		]
	);

	useEffect(() => {
		if (!useSafeSetHtml && fallbackEditor && !fallbackEditor.isDestroyed) {
			fallbackEditor.commands.setContent(html || '', { emitUpdate: false });
		}
	}, [html, useSafeSetHtml, fallbackEditor]);

	return (
		<div id={scopeId} data-rw-prose-root="" className="min-w-0 rounded-lg border border-border bg-muted/20 px-4 py-3">
			{extraCSS ? <style>{`#${scopeId} .rw-tiptap-prose { ${sanitizeExtraCss(extraCSS)} }`}</style> : null}
			{useSafeSetHtml ? (
				<div
					ref={hostRef}
					data-rw-readonly-html="1"
					className="rw-tiptap-prose text-sm text-foreground"
				/>
			) : (
				<EditorContent editor={fallbackEditor} className="rw-tiptap-prose text-sm text-foreground" />
			)}
		</div>
	);
}
