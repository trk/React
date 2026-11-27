import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeConditionBuilderValue } from '../../resources/ts/fields/conditionEngine';
import { ConditionBuilderField } from '../../resources/ts/fields/controls/ConditionBuilderField';
import { LinkFieldControl } from '../../resources/ts/fields/controls/LinkField';
import { MarkdownField } from '../../resources/ts/fields/controls/MarkdownField';
import { RangeField } from '../../resources/ts/fields/controls/RangeField';
import { RatingField } from '../../resources/ts/fields/controls/RatingField';
import { RepeaterField } from '../../resources/ts/fields/controls/RepeaterField';
import { RadioRelationWidget } from '../../resources/ts/fields/controls/relation/ChoiceRelationWidgets';
import { PickerDrawerRelationWidget } from '../../resources/ts/fields/controls/relation/PickerDrawerRelationWidget';
import { TreeSelectRelationWidget } from '../../resources/ts/fields/controls/relation/TreeSelectRelationWidget';
import { RelationItemVisual } from '../../resources/ts/fields/controls/relation/typesAndHelpers';
import { useShellLayout } from '../../resources/ts/layout/useShellLayout';
import { shouldIgnoreEscapeEvent } from '../../resources/ts/lib/utils';
import { setKeyboardShortcutsEnabled, registerKeyboardShortcuts } from '../../resources/ts/hooks/useKeyboardShortcuts';
import { CommandEmpty, CommandItem, CommandList } from '../../resources/ts/ui/primitives/Command';
import { useSortableList } from '../../resources/ts/ui/sortable';

const TS_ROOT = resolve(import.meta.dirname, '../../resources/ts');

type ListenerMap = Map<string, Set<(ev: Event) => void>>;

class MiniNode {
	nodeType: number;
	nodeName: string;
	tagName: string;
	ownerDocument: MiniDocument;
	parentNode: MiniNode | null = null;
	parentElement: MiniElement | null = null;
	childNodes: MiniNode[] = [];
	style: Record<string, string> & {
		setProperty: (k: string, v: string) => void;
		removeProperty: (k: string) => void;
	};
	dataset: Record<string, string> = {};
	private _text = '';

	constructor(nodeType: number, name: string, doc: MiniDocument) {
		this.nodeType = nodeType;
		this.nodeName = name;
		this.tagName = name;
		this.ownerDocument = doc;
		const styleStore: Record<string, string> = {};
		this.style = new Proxy(styleStore, {
			get(target, prop) {
				if (prop === 'setProperty') return (k: string, v: string) => { target[k] = v; };
				if (prop === 'removeProperty') return (k: string) => { delete target[k]; };
				return target[String(prop)] ?? '';
			},
			set(target, prop, val) {
				target[String(prop)] = String(val);
				return true;
			},
		}) as MiniNode['style'];
	}

	get textContent(): string {
		if (this.nodeType === 3) return this._text;
		return this.childNodes.map((c) => c.textContent).join('');
	}

	set textContent(v: string) {
		if (this.nodeType === 3) {
			this._text = String(v ?? '');
		} else {
			this.childNodes = [];
			if (v) {
				const tn = this.ownerDocument.createTextNode(String(v));
				this.appendChild(tn);
			}
		}
	}

	get nodeValue(): string {
		return this._text;
	}

	set nodeValue(v: string) {
		this._text = String(v ?? '');
	}

	get firstChild(): MiniNode | null {
		return this.childNodes[0] ?? null;
	}

	get lastChild(): MiniNode | null {
		return this.childNodes[this.childNodes.length - 1] ?? null;
	}

	get nextSibling(): MiniNode | null {
		if (!this.parentNode) return null;
		const idx = this.parentNode.childNodes.indexOf(this);
		return idx >= 0 ? (this.parentNode.childNodes[idx + 1] ?? null) : null;
	}

	get isConnected(): boolean {
		let cur: MiniNode | null = this;
		while (cur) {
			if (cur === this.ownerDocument.documentElement || cur === this.ownerDocument.body) {
				return true;
			}
			cur = cur.parentNode;
		}
		return false;
	}

	appendChild<T extends MiniNode>(child: T): T {
		if (child.parentNode) {
			child.parentNode.removeChild(child);
		}
		child.parentNode = this;
		child.parentElement = this instanceof MiniElement ? this : null;
		this.childNodes.push(child);
		return child;
	}

	insertBefore<T extends MiniNode>(child: T, ref: MiniNode | null): T {
		if (!ref) return this.appendChild(child);
		if (child.parentNode) {
			child.parentNode.removeChild(child);
		}
		const idx = this.childNodes.indexOf(ref);
		child.parentNode = this;
		child.parentElement = this instanceof MiniElement ? this : null;
		if (idx === -1) {
			this.childNodes.push(child);
		} else {
			this.childNodes.splice(idx, 0, child);
		}
		return child;
	}

	removeChild<T extends MiniNode>(child: T): T {
		const idx = this.childNodes.indexOf(child);
		if (idx !== -1) {
			this.childNodes.splice(idx, 1);
			child.parentNode = null;
			child.parentElement = null;
		}
		return child;
	}

	remove(): void {
		this.parentNode?.removeChild(this);
	}

	contains(other: MiniNode | null): boolean {
		let cur: MiniNode | null = other;
		while (cur) {
			if (cur === this) return true;
			cur = cur.parentNode;
		}
		return false;
	}
}

class MiniElement extends MiniNode {
	attrs = new Map<string, string>();
	listeners: ListenerMap = new Map();
	value = '';
	checked = false;
	disabled = false;
	readOnly = false;
	type = '';
	name = '';
	tabIndex = 0;

	constructor(tag: string, doc: MiniDocument) {
		super(1, tag.toUpperCase(), doc);
	}

	get id(): string {
		return this.attrs.get('id') ?? '';
	}

	set id(v: string) {
		this.attrs.set('id', String(v));
	}

	get className(): string {
		return this.attrs.get('class') ?? '';
	}

	set className(v: string) {
		this.attrs.set('class', String(v));
	}

	get classList() {
		return {
			contains: (cls: string) => this.className.split(/\s+/).includes(cls),
			add: (...cls: string[]) => {
				const set = new Set(this.className.split(/\s+/).filter(Boolean));
				for (const c of cls) set.add(c);
				this.className = Array.from(set).join(' ');
			},
			remove: (...cls: string[]) => {
				const set = new Set(this.className.split(/\s+/).filter(Boolean));
				for (const c of cls) set.delete(c);
				this.className = Array.from(set).join(' ');
			},
		};
	}

	setAttribute(k: string, v: string): void {
		this.attrs.set(k, String(v));
		if (k.startsWith('data-')) {
			const camel = k.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
			this.dataset[camel] = String(v);
		}
	}

	getAttribute(k: string): string | null {
		return this.attrs.get(k) ?? null;
	}

	hasAttribute(k: string): boolean {
		return this.attrs.has(k);
	}

	removeAttribute(k: string): void {
		this.attrs.delete(k);
		if (k.startsWith('data-')) {
			const camel = k.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
			delete this.dataset[camel];
		}
	}

	addEventListener(type: string, fn: (ev: Event) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)!.add(fn);
	}

	removeEventListener(type: string, fn: (ev: Event) => void): void {
		this.listeners.get(type)?.delete(fn);
	}

	dispatchEvent(ev: Event): boolean {
		const set = this.listeners.get(ev.type);
		if (set) {
			for (const fn of Array.from(set)) fn(ev);
		}
		return true;
	}

	focus(): void {
		this.ownerDocument.activeElement = this;
	}

	getBoundingClientRect(): DOMRect {
		return {
			x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 32, width: 100, height: 32,
			toJSON: () => ({}),
		} as DOMRect;
	}

	private matchesSimple(sel: string): boolean {
		const parts = sel.split(',').map((s) => s.trim()).filter(Boolean);
		return parts.some((part) => {
			if (part.startsWith('[') && part.endsWith(']')) {
				const inner = part.slice(1, -1);
				const eq = inner.indexOf('=');
				if (eq === -1) return this.attrs.has(inner);
				const key = inner.slice(0, eq).trim();
				const val = inner.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
				return this.attrs.get(key) === val;
			}
			if (part === 'dialog[open]') {
				return this.tagName === 'DIALOG' && this.attrs.has('open');
			}
			return this.tagName === part.toUpperCase();
		});
	}

	closest(sel: string): MiniElement | null {
		let cur: MiniNode | null = this;
		while (cur) {
			if (cur instanceof MiniElement && cur.matchesSimple(sel)) return cur;
			cur = cur.parentNode;
		}
		return null;
	}

	querySelector(sel: string): MiniElement | null {
		return this.querySelectorAll(sel)[0] ?? null;
	}

	querySelectorAll(sel: string): MiniElement[] {
		const out: MiniElement[] = [];
		const walk = (node: MiniNode) => {
			for (const child of node.childNodes) {
				if (child instanceof MiniElement) {
					if (child.matchesSimple(sel)) out.push(child);
					walk(child);
				}
			}
		};
		walk(this);
		return out;
	}

	click(): void {
		const ev = { type: 'click', target: this, currentTarget: this, bubbles: true, preventDefault() {}, stopPropagation() {} } as unknown as Event;
		let cur: MiniNode | null = this;
		while (cur) {
			if (cur instanceof MiniElement) {
				cur.dispatchEvent(ev);
			}
			cur = cur.parentNode;
		}
	}
}

class MiniDocument {
	documentElement: MiniElement;
	body: MiniElement;
	activeElement: MiniElement | null = null;
	listeners: ListenerMap = new Map();
	defaultView: Window & typeof globalThis;

	constructor(win: Window & typeof globalThis) {
		this.defaultView = win;
		this.documentElement = new MiniElement('html', this);
		this.body = new MiniElement('body', this);
		this.documentElement.appendChild(this.body);
	}

	createElement(tag: string): MiniElement {
		return new MiniElement(tag, this);
	}

	createElementNS(_ns: string, tag: string): MiniElement {
		return new MiniElement(tag, this);
	}

	createTextNode(text: string): MiniNode {
		const n = new MiniNode(3, '#text', this);
		n.textContent = text;
		return n;
	}

	createComment(text: string): MiniNode {
		const n = new MiniNode(8, '#comment', this);
		n.textContent = text;
		return n;
	}

	addEventListener(type: string, fn: (ev: Event) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)!.add(fn);
	}

	removeEventListener(type: string, fn: (ev: Event) => void): void {
		this.listeners.get(type)?.delete(fn);
	}

	getElementById(id: string): MiniElement | null {
		return this.documentElement.querySelector(`[id="${id}"]`);
	}

	querySelector(sel: string): MiniElement | null {
		return this.documentElement.querySelector(sel);
	}

	querySelectorAll(sel: string): MiniElement[] {
		return this.documentElement.querySelectorAll(sel);
	}
}

function installMiniDom() {
	const origWindow = globalThis.window;
	const origDocument = globalThis.document;
	const origElement = globalThis.Element;
	const origHTMLElement = globalThis.HTMLElement;
	const origNode = globalThis.Node;
	const origCustomEvent = globalThis.CustomEvent;

	const winListeners: ListenerMap = new Map();
	const storage = new Map<string, string>();
	const docHolder: { doc?: MiniDocument } = {};

	const win = {
		HTMLIFrameElement: class MockHTMLIFrameElement {},
		event: undefined,
		addEventListener: (type: string, fn: (ev: Event) => void) => {
			if (!winListeners.has(type)) winListeners.set(type, new Set());
			winListeners.get(type)!.add(fn);
		},
		removeEventListener: (type: string, fn: (ev: Event) => void) => {
			winListeners.get(type)?.delete(fn);
		},
		dispatchEvent: (ev: Event) => {
			for (const fn of Array.from(winListeners.get(ev.type) ?? [])) {
				fn(ev);
			}
			return true;
		},
		localStorage: {
			getItem: (k: string) => storage.get(k) ?? null,
			setItem: (k: string, v: string) => { storage.set(k, v); },
			removeItem: (k: string) => { storage.delete(k); },
		},
		setTimeout: globalThis.setTimeout.bind(globalThis),
		clearTimeout: globalThis.clearTimeout.bind(globalThis),
		getComputedStyle: () => ({ overflowY: 'visible', overflowX: 'visible' }),
		requestAnimationFrame: (cb: FrameRequestCallback) => {
			return globalThis.setTimeout(() => cb(performance.now()), 0) as unknown as number;
		},
		cancelAnimationFrame: (id: number) => globalThis.clearTimeout(id),
		matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
		get document() {
			return docHolder.doc;
		},
	} as unknown as Window & typeof globalThis;

	const doc = new MiniDocument(win);
	docHolder.doc = doc;

	class MockCustomEvent<T = unknown> {
		type: string;
		detail: T;
		constructor(type: string, init?: CustomEventInit<T>) {
			this.type = type;
			this.detail = init?.detail as T;
		}
	}

	globalThis.window = win;
	globalThis.document = doc as unknown as Document;
	globalThis.Element = MiniElement as unknown as typeof Element;
	globalThis.HTMLElement = MiniElement as unknown as typeof HTMLElement;
	globalThis.Node = MiniNode as unknown as typeof Node;
	globalThis.CustomEvent = MockCustomEvent as unknown as typeof CustomEvent;

	return {
		win,
		doc,
		winListeners,
		restore: () => {
			globalThis.window = origWindow;
			globalThis.document = origDocument;
			globalThis.Element = origElement;
			globalThis.HTMLElement = origHTMLElement;
			globalThis.Node = origNode;
			globalThis.CustomEvent = origCustomEvent;
		},
	};
}

describe('UI Audit Fixes Regression Suite', () => {
	let restoreDom: (() => void) | null = null;

	afterEach(() => {
		restoreDom?.();
		restoreDom = null;
		setKeyboardShortcutsEnabled(true);
		vi.restoreAllMocks();
	});

	it('RangeField switches between single, dual, and colspan modes cleanly without conditional hook errors', async () => {
		const dom = installMiniDom();
		restoreDom = dom.restore;
		const container = dom.doc.createElement('div');
		dom.doc.body.appendChild(container);
		const root = createRoot(container as unknown as Element);

		flushSync(() => {
			root.render(
				React.createElement(RangeField, {
					controlType: 'range',
					id: 'r1',
					name: 'opacity',
					min: 0,
					max: 100,
					value: 40,
				})
			);
		});
		expect(container.querySelector('[data-rw-control="range"]')).not.toBeNull();

		flushSync(() => {
			root.render(
				React.createElement(RangeField, {
					controlType: 'range_slider',
					id: 'r1',
					name: 'price',
					min: 0,
					max: 100,
					value: [20, 80],
				})
			);
		});
		expect(container.querySelector('[data-rw-control="range_slider"]')).not.toBeNull();

		flushSync(() => {
			root.render(
				React.createElement(RangeField, {
					controlType: 'colspan',
					id: 'r1',
					name: 'cols',
					value: 6,
				})
			);
		});
		expect(container.querySelector('[data-rw-control="colspan"]')).not.toBeNull();

		flushSync(() => {
			root.render(
				React.createElement(RangeField, {
					controlType: 'range',
					id: 'r1',
					name: 'opacity',
					min: 0,
					max: 100,
					value: 75,
				})
			);
		});
		expect(container.querySelector('[data-rw-control="range"]')).not.toBeNull();
		flushSync(() => root.unmount());
		await new Promise((r) => setTimeout(r, 10));
	});

	it('strips stale valueSource=field for unary, between, in, not_in, and non-string rules in conditionEngine and ConditionBuilderField', () => {
		const fields = [
			{ key: 'status', label: 'Status', type: 'text' as const },
			{ key: 'total', label: 'Total', type: 'number' as const },
			{ key: 'tags', label: 'Tags', type: 'select' as const, options: [{ value: 'a', label: 'A' }] },
		];

		const normalized = normalizeConditionBuilderValue(
			{
				match: 'all',
				groups: [
					{
						id: 'g1',
						match: 'all',
						rules: [
							{ id: 'r_unary', field: 'status', operator: 'is_empty', value: 'other', valueSource: 'field' },
							{ id: 'r_between', field: 'total', operator: 'between', value: ['1', '5'], valueSource: 'field' },
							{ id: 'r_in', field: 'tags', operator: 'in', value: ['a'], valueSource: 'field' },
							{ id: 'r_not_in', field: 'tags', operator: 'not_in', value: ['a'], valueSource: 'field' },
							{ id: 'r_non_str', field: 'total', operator: 'gt', value: 10 as unknown as string, valueSource: 'field' },
							{ id: 'r_valid', field: 'total', operator: 'gt', value: 'status', valueSource: 'field' },
						],
					},
				],
			},
			fields
		);

		const rules = normalized.groups[0]!.rules;
		expect(rules[0]!.valueSource).toBeUndefined();
		expect(rules[1]!.valueSource).toBeUndefined();
		expect(rules[2]!.valueSource).toBeUndefined();
		expect(rules[3]!.valueSource).toBeUndefined();
		expect(rules[4]!.valueSource).toBeUndefined();
		expect(rules[5]!.valueSource).toBe('field');

		// ConditionBuilderField hides field-comparison toggle for `in` / `not_in`
		const inHtml = renderToStaticMarkup(
			React.createElement(ConditionBuilderField, {
				id: 'cond_in',
				name: 'cond_in',
				allowFieldComparison: true,
				conditionFields: fields,
				value: {
					match: 'all',
					groups: [
						{
							id: 'g1',
							match: 'all',
							rules: [{ id: 'r1', field: 'tags', operator: 'in', value: ['a'], valueSource: 'field' }],
						},
					],
				},
			})
		);
		expect(inHtml).not.toContain('Comparison source');

		const cbSrc = readFileSync(resolve(TS_ROOT, 'fields/controls/ConditionBuilderField.tsx'), 'utf8');
		expect(cbSrc).toContain("rule.operator !== 'in'");
		expect(cbSrc).toContain("rule.operator !== 'not_in'");
		expect(cbSrc).toContain("nextOperator === 'in'");
	});

	it('synchronizes useShellLayout state across independent hook instances via pw:react-shell-layout-change', async () => {
		const dom = installMiniDom();
		restoreDom = dom.restore;
		const container = dom.doc.createElement('div');
		dom.doc.body.appendChild(container);
		const root = createRoot(container as unknown as Element);

		let snapshot: { shellLayout: string; sidebarCollapsed: boolean } | null = null;
		function Consumer() {
			const state = useShellLayout({
				initialLayout: 'topbar',
				initialSidebarCollapsed: false,
				syncToServer: false,
			});
			snapshot = { shellLayout: state.shellLayout, sidebarCollapsed: state.sidebarCollapsed };
			return React.createElement('div', { 'data-layout': state.shellLayout });
		}

		flushSync(() => {
			root.render(React.createElement(Consumer));
		});
		await new Promise((r) => setTimeout(r, 10));
		expect(snapshot).toEqual({ shellLayout: 'topbar', sidebarCollapsed: false });

		flushSync(() => {
			dom.win.dispatchEvent(
				new CustomEvent('pw:react-shell-layout-change', {
					detail: { shellLayout: 'sidebar', sidebarCollapsed: true },
				})
			);
		});
		await new Promise((r) => setTimeout(r, 10));
		expect(snapshot).toEqual({ shellLayout: 'sidebar', sidebarCollapsed: true });
		flushSync(() => root.unmount());
		await new Promise((r) => setTimeout(r, 10));
	});

	it('renders RadioRelationWidget with a shared radio group name and accessible radiogroup label', () => {
		const html = renderToStaticMarkup(
			React.createElement(RadioRelationWidget, {
				label: 'Primary Category',
				cards: false,
				options: [
					{ key: '1', value: '1', label: 'News' },
					{ key: '2', value: '2', label: 'Guides' },
				],
				loading: false,
				value: '1',
				optionColumns: 1,
				disabled: false,
				required: false,
				editableLink: false,
				creatable: false,
				fallbackIcon: 'folder',
				onSelect: () => {},
				onOpenQuickCreate: () => {},
			})
		);
		expect(html).toContain('role="radiogroup"');
		expect(html).toContain('aria-label="Primary Category"');
		const names = Array.from(html.matchAll(/<input[^>]*type="radio"[^>]*>/g)).map(
			(m) => m[0].match(/name="([^"]+)"/)?.[1]
		);
		expect(names.length).toBe(2);
		expect(names[0]).toBeTruthy();
		expect(names[0]).toBe(names[1]);
	});

	it('enforces role="listbox" structural compliance in CommandList, LinkField, and TiptapPwDialogs', () => {
		const emptyCmdHtml = renderToStaticMarkup(
			React.createElement(
				CommandList,
				null,
				React.createElement(CommandEmpty, null, 'Nothing here')
			)
		);
		expect(emptyCmdHtml).not.toContain('role="listbox"');
		expect(emptyCmdHtml).toContain('role="status"');

		const fullCmdHtml = renderToStaticMarkup(
			React.createElement(
				CommandList,
				null,
				React.createElement(CommandItem, { id: 'a' }, 'Alpha')
			)
		);
		expect(fullCmdHtml).toContain('role="listbox"');
		expect(fullCmdHtml).toContain('aria-label="Commands"');

		const linkSrc = readFileSync(resolve(TS_ROOT, 'fields/controls/LinkField.tsx'), 'utf8');
		expect(linkSrc).toContain('<div role="status" className="px-3 py-2.5 text-xs text-muted-foreground">');
		expect(linkSrc).toContain('aria-label={t(\'link.searchPages\', \'Search pages\')}');

		const tiptapDialogsSrc = readFileSync(resolve(TS_ROOT, 'tiptap/dialogs/TiptapPwDialogs.tsx'), 'utf8');
		expect(tiptapDialogsSrc).toContain('searchResults.length === 0 ? (');
		expect(tiptapDialogsSrc).toContain('role="status"');
	});

	it('cleans up active pointer drag listeners and data-rw-dragging when useSortableList unmounts mid-drag', async () => {
		const dom = installMiniDom();
		restoreDom = dom.restore;
		const container = dom.doc.createElement('div');
		dom.doc.body.appendChild(container);
		const root = createRoot(container as unknown as Element);

		let hookResult: ReturnType<typeof useSortableList<{ id: string }>> | null = null;
		function SortableHarness() {
			hookResult = useSortableList({
				items: [{ id: 'a' }, { id: 'b' }],
				getId: (i) => i.id,
				onReorder: () => {},
			});
			const { isGrabbed: _ig, isDragging: _id, ...domProps } = hookResult.getHandleProps({ id: 'a' }, 0);
			return React.createElement(
				'div',
				{ ref: hookResult.containerRef, 'data-rw-sortable-container': '' },
				React.createElement(
					'div',
					{ 'data-rw-sortable-id': 'a' },
					React.createElement('button', {
						type: 'button',
						'data-rw-drag-handle': 'a',
						...domProps,
					})
				),
				React.createElement('div', { 'data-rw-sortable-id': 'b' })
			);
		}

		flushSync(() => {
			root.render(React.createElement(SortableHarness));
		});
		await new Promise((r) => setTimeout(r, 10));

		const handleEl = container.querySelector('[data-rw-drag-handle="a"]')!;
		const handleProps = hookResult!.getHandleProps({ id: 'a' }, 0);
		flushSync(() => {
			handleProps.onPointerDown({
				button: 0,
				pointerId: 1,
				clientX: 10,
				clientY: 10,
				currentTarget: handleEl as unknown as HTMLButtonElement,
				preventDefault() {},
				stopPropagation() {},
			} as unknown as React.PointerEvent<HTMLButtonElement>);
		});

		expect(dom.doc.listeners.get('pointermove')?.size ?? 0).toBe(1);
		expect(dom.doc.listeners.get('pointerup')?.size ?? 0).toBe(1);
		expect(dom.doc.listeners.get('keydown')?.size ?? 0).toBe(1);

		flushSync(() => {
			root.unmount();
		});
		await new Promise((r) => setTimeout(r, 10));

		expect(dom.doc.listeners.get('pointermove')?.size ?? 0).toBe(0);
		expect(dom.doc.listeners.get('pointerup')?.size ?? 0).toBe(0);
		expect(dom.doc.listeners.get('keydown')?.size ?? 0).toBe(0);
		expect(dom.doc.documentElement.hasAttribute('data-rw-dragging')).toBe(false);
	});

	it('emits onValueChange only once per action under React.StrictMode in RepeaterField', async () => {
		const dom = installMiniDom();
		restoreDom = dom.restore;
		const container = dom.doc.createElement('div');
		dom.doc.body.appendChild(container);
		const root = createRoot(container as unknown as Element);

		const onValueChange = vi.fn();
		flushSync(() => {
			root.render(
				React.createElement(
					React.StrictMode,
					null,
					React.createElement(RepeaterField, {
						controlType: 'repeater',
						id: 'rep1',
						name: 'specs',
						value: [{ key: 'CPU', val: '8c' }],
						subfields: [
							{ name: 'key', label: 'Key', type: 'text' },
							{ name: 'val', label: 'Value', type: 'text' },
						],
						onValueChange,
					})
				)
			);
		});
		await new Promise((r) => setTimeout(r, 10));

		const addBtn = container
			.querySelectorAll('button')
			.find((b) => b.textContent.includes('Add Row'));
		expect(addBtn).toBeDefined();

		flushSync(() => {
			addBtn!.click();
		});

		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(onValueChange).toHaveBeenCalledWith('specs', [
			{ key: 'CPU', val: '8c' },
			{ key: '', val: '' },
		]);

		const removeBtns = container
			.querySelectorAll('button')
			.filter((b) => (b.getAttribute('aria-label') ?? '').includes('Remove row'));
		expect(removeBtns.length).toBe(2);
		flushSync(() => {
			removeBtns[1]!.click();
		});
		expect(onValueChange).toHaveBeenCalledTimes(2);
		expect(onValueChange).toHaveBeenLastCalledWith('specs', [{ key: 'CPU', val: '8c' }]);
		flushSync(() => root.unmount());
		await new Promise((r) => setTimeout(r, 10));
	});

	it('sanitizes RelationItemVisual thumbnails and sets accessible Tree/Picker/Markdown/Rating/Link attributes', () => {
		const unsafeThumbHtml = renderToStaticMarkup(
			React.createElement(RelationItemVisual, {
				item: {
					key: '1',
					value: '1',
					label: 'Bad',
					resource: 'pages',
					thumb: 'javascript:alert(1)',
				},
				fallbackIcon: 'file-text',
			})
		);
		expect(unsafeThumbHtml).not.toContain('<img');
		expect(unsafeThumbHtml).toContain('<svg');

		const safeThumbHtml = renderToStaticMarkup(
			React.createElement(RelationItemVisual, {
				item: {
					key: '2',
					value: '2',
					label: 'Good',
					resource: 'pages',
					thumb: '/site/assets/files/1/photo.jpg',
				},
				fallbackIcon: 'file-text',
			})
		);
		expect(safeThumbHtml).toContain('<img src="/site/assets/files/1/photo.jpg"');

		const treeHtml = renderToStaticMarkup(
			React.createElement(TreeSelectRelationWidget, {
				initialTree: [{ key: '1', id: 1, value: '1', label: 'Home', resource: 'pages', hasChildren: true }],
				multiple: false,
				scalarValue: '1',
				multiValues: [],
				maxItems: 0,
				disabled: false,
				editableLink: false,
				creatable: false,
				fallbackIcon: 'file',
				sortable: false,
				isSortable: false,
				resolveItem: (v) => ({ key: v, value: v, label: 'Home', resource: 'pages' }),
				callEndpoint: async () => ({ ok: true }),
				onCommitScalar: () => {},
				onCommitMulti: () => {},
				onOpenQuickCreate: () => {},
			})
		);
		expect(treeHtml).toContain('aria-expanded="false"');

		const markdownHtml = renderToStaticMarkup(
			React.createElement(MarkdownField, {
				controlType: 'markdown',
				id: 'md1',
				name: 'body',
				value: '# Hello',
			})
		);
		expect(markdownHtml).toContain('role="tablist"');
		expect(markdownHtml).toContain('role="tabpanel"');
		expect(markdownHtml).toContain('aria-controls="');
		expect(markdownHtml).toContain('tabindex="0"');
		expect(markdownHtml).toContain('tabindex="-1"');

		const ratingHtml = renderToStaticMarkup(
			React.createElement(RatingField, {
				controlType: 'rating',
				id: 'rat1',
				name: 'stars',
				value: 3,
				maxStars: 5,
			})
		);
		expect(ratingHtml).toContain('role="radiogroup"');
		expect(ratingHtml).toContain('tabindex="0"');
		expect(ratingHtml).toContain('tabindex="-1"');

		const pickerSrc = readFileSync(
			resolve(TS_ROOT, 'fields/controls/relation/PickerDrawerRelationWidget.tsx'),
			'utf8'
		);
		expect(pickerSrc).toContain('aria-pressed={checked}');

		const linkMediaHtml = renderToStaticMarkup(
			React.createElement(LinkFieldControl, {
				name: 'cta',
				value: { type: 'image', url: '' },
				linkConfig: { types: ['image'] },
			})
		);
		expect(linkMediaHtml).toContain('focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1');
	});

	it('enforces IME composition and top-layer Escape stacking guards via shouldIgnoreEscapeEvent and useKeyboardShortcuts', () => {
		const dom = installMiniDom();
		restoreDom = dom.restore;

		const ownEl = dom.doc.createElement('div');
		const ownChild = dom.doc.createElement('input');
		ownEl.appendChild(ownChild);
		dom.doc.body.appendChild(ownEl);

		const externalDialog = dom.doc.createElement('dialog');
		externalDialog.setAttribute('open', '');
		const dialogBtn = dom.doc.createElement('button');
		externalDialog.appendChild(dialogBtn);
		dom.doc.body.appendChild(externalDialog);

		const mkKey = (key: string, extra: Partial<KeyboardEvent> = {}) =>
			({
				key,
				isComposing: false,
				keyCode: key === 'Escape' ? 27 : 65,
				defaultPrevented: false,
				target: ownChild,
				...extra,
			}) as unknown as KeyboardEvent;

		expect(shouldIgnoreEscapeEvent(mkKey('Enter'), ownEl as unknown as Element)).toBe(true);
		expect(shouldIgnoreEscapeEvent(mkKey('Escape', { isComposing: true }), ownEl as unknown as Element)).toBe(true);
		expect(shouldIgnoreEscapeEvent(mkKey('Escape', { keyCode: 229 }), ownEl as unknown as Element)).toBe(true);
		expect(shouldIgnoreEscapeEvent(mkKey('Escape', { defaultPrevented: true }), ownEl as unknown as Element)).toBe(true);
		expect(
			shouldIgnoreEscapeEvent(
				mkKey('Escape', { target: dialogBtn as unknown as EventTarget }),
				ownEl as unknown as Element
			)
		).toBe(true);
		expect(shouldIgnoreEscapeEvent(mkKey('Escape'), ownEl as unknown as Element)).toBe(false);

		// Child portal overlay inside ownContainer suppresses parent Escape handling
		const nestedOverlay = dom.doc.createElement('div');
		nestedOverlay.setAttribute('data-rw-portal-overlay', '');
		ownEl.appendChild(nestedOverlay);
		expect(shouldIgnoreEscapeEvent(mkKey('Escape'), ownEl as unknown as Element)).toBe(true);

		// Global shortcut dispatcher ignores keyCode 229 IME composition events
		const fired: string[] = [];
		const unreg = registerKeyboardShortcuts([
			{ id: 'test.k', keys: '?', label: 'Help', group: 'g', handler: () => fired.push('hit') },
		]);
		try {
			dom.win.dispatchEvent({
				type: 'keydown',
				key: '?',
				keyCode: 229,
				isComposing: false,
				defaultPrevented: false,
				target: dom.doc.body,
				preventDefault() {},
			} as unknown as Event);
			expect(fired).toEqual([]);
		} finally {
			unreg();
		}
	});
});
