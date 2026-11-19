/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { Node } from '@tiptap/core';
import {
	NodeViewWrapper,
	ReactNodeViewRenderer,
	type NodeViewProps,
} from '@tiptap/react';
import { getReactWorkspaceRuntime } from '../../runtime';
import { getReactTiptapRuntime } from '../core/tiptapRuntime';

const runtime = getReactWorkspaceRuntime();
const { React } = runtime;

export function createPwAnchorExtension(
	onEditAnchorRef?: { current: ((pos: number, id: string) => void) | null }
) {
	const { sanitizeAnchorId } = getReactTiptapRuntime().helpers;

	function PwAnchorNodeView(props: NodeViewProps) {
		const { node, editor, getPos, selected } = props;
		const id = sanitizeAnchorId(String(node.attrs.id ?? ''));
		if (!id) {
			return <NodeViewWrapper as="span" />;
		}
		if (!editor.isEditable) {
			return (
				<NodeViewWrapper as="span">
					<a id={id} />
				</NodeViewWrapper>
			);
		}
		return (
			<NodeViewWrapper
				as="span"
				data-rw-tiptap-anchor={id}
				data-selected={selected ? '1' : undefined}
				contentEditable={false}
				onDoubleClick={(e: React.MouseEvent) => {
					e.preventDefault();
					e.stopPropagation();
					const pos = typeof getPos === 'function' ? getPos() : undefined;
					if (typeof pos === 'number') {
						onEditAnchorRef?.current?.(pos, id);
					}
				}}
				title={`#${id}`}
			>
				<span aria-hidden="true">#</span>
				<span>{id}</span>
			</NodeViewWrapper>
		);
	}

	return Node.create({
		name: 'pwAnchor',
		group: 'inline',
		inline: true,
		atom: true,
		selectable: true,

		addAttributes() {
			return {
				id: {
					default: '',
					parseHTML: (el) => sanitizeAnchorId(el.getAttribute('id') || el.getAttribute('name')),
				},
			};
		},

		parseHTML() {
			return [
				{
					tag: 'a[id]:not([href]), a[name]:not([href])',
					priority: 1040,
					getAttrs: (dom) => {
						const el = dom as HTMLElement;
						if ((el.textContent || '').trim() !== '' || el.children.length > 0) {
							return false;
						}
						const id = sanitizeAnchorId(el.getAttribute('id') || el.getAttribute('name'));
						return id ? { id } : false;
					},
				},
			];
		},

		renderHTML({ node }) {
			const id = sanitizeAnchorId(String(node.attrs.id ?? ''));
			if (!id) {
				return ['span', {}, ''];
			}
			return ['a', { id }, ''];
		},

		addNodeView() {
			return ReactNodeViewRenderer(PwAnchorNodeView);
		},
	});
}
