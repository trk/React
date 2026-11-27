import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchemaForm } from '../../resources/ts/fields/SchemaForm';
import { O2MRelationView } from '../../resources/ts/fields/controls/relation/O2MRelationView';
import { TreeSelectRelationWidget } from '../../resources/ts/fields/controls/relation/TreeSelectRelationWidget';
import {
	isRelationItemDisabled,
	RelationItemVisual,
	resolveRelationItemKey,
	resolveRelationNodeId,
	resolveRelationNumChildren,
} from '../../resources/ts/fields/controls/relation/typesAndHelpers';
import type { RelationItemData, SchemaFieldDefinition } from '../../resources/ts/fields/types';
import { SidebarShellLayout } from '../../resources/ts/layout/SidebarShellLayout';
import type { AppShellNavItem } from '../../resources/ts/layout/types';
import type { useSortableList } from '../../resources/ts/ui';

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
				this.appendChild(this.ownerDocument.createTextNode(String(v)));
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

	appendChild<T extends MiniNode>(child: T): T {
		if (child.parentNode) child.parentNode.removeChild(child);
		child.parentNode = this;
		child.parentElement = this instanceof MiniElement ? this : null;
		this.childNodes.push(child);
		return child;
	}

	insertBefore<T extends MiniNode>(child: T, ref: MiniNode | null): T {
		if (!ref) return this.appendChild(child);
		if (child.parentNode) child.parentNode.removeChild(child);
		const idx = this.childNodes.indexOf(ref);
		child.parentNode = this;
		child.parentElement = this instanceof MiniElement ? this : null;
		if (idx === -1) this.childNodes.push(child);
		else this.childNodes.splice(idx, 0, child);
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

	get isConnected(): boolean {
		let cur: MiniNode | null = this;
		while (cur) {
			if (cur === this.ownerDocument.documentElement || cur === this.ownerDocument.body) return true;
			cur = cur.parentNode;
		}
		return false;
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
	readOnly = false;
	type = '';
	name = '';
	tabIndex = 0;

	get disabled(): boolean {
		return this.attrs.has('disabled');
	}

	set disabled(v: boolean) {
		if (v) this.attrs.set('disabled', '');
		else this.attrs.delete('disabled');
	}

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

	querySelectorAll(sel: string): MiniElement[] {
		const out: MiniElement[] = [];
		const walk = (node: MiniNode) => {
			for (const child of node.childNodes) {
				if (child instanceof MiniElement) {
					if (sel === 'button' && child.tagName === 'BUTTON') out.push(child);
					walk(child);
				}
			}
		};
		walk(this);
		return out;
	}

	click(): void {
		if (this.disabled) return;
		const ev = { type: 'click', target: this, currentTarget: this, bubbles: true, preventDefault() {}, stopPropagation() {} } as unknown as Event;
		let cur: MiniNode | null = this;
		while (cur) {
			if (cur instanceof MiniElement) cur.dispatchEvent(ev);
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

	getElementById(id: string): MiniElement | null {
		let found: MiniElement | null = null;
		const walk = (n: MiniNode) => {
			if (found) return;
			for (const c of n.childNodes) {
				if (c instanceof MiniElement) {
					if (c.id === id) { found = c; return; }
					walk(c);
				}
			}
		};
		walk(this.documentElement);
		return found;
	}

	querySelectorAll(sel: string): MiniElement[] {
		return this.documentElement.querySelectorAll(sel);
	}

	querySelector(sel: string): MiniElement | null {
		return this.querySelectorAll(sel)[0] ?? null;
	}

	addEventListener(type: string, fn: (ev: Event) => void): void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)!.add(fn);
	}

	removeEventListener(type: string, fn: (ev: Event) => void): void {
		this.listeners.get(type)?.delete(fn);
	}
}

function installMiniDom() {
	const origWindow = globalThis.window;
	const origDocument = globalThis.document;
	const origElement = globalThis.Element;
	const origHTMLElement = globalThis.HTMLElement;
	const origNode = globalThis.Node;
	const origIFrame = globalThis.HTMLIFrameElement;

	const MockHTMLIFrameElement = class {};
	const win = {
		HTMLIFrameElement: MockHTMLIFrameElement,
		event: undefined,
		addEventListener() {},
		removeEventListener() {},
		setTimeout: globalThis.setTimeout.bind(globalThis),
		clearTimeout: globalThis.clearTimeout.bind(globalThis),
		requestAnimationFrame: (cb: FrameRequestCallback) =>
			globalThis.setTimeout(() => cb(performance.now()), 0) as unknown as number,
		cancelAnimationFrame: (id: number) => globalThis.clearTimeout(id),
		matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
	} as unknown as Window & typeof globalThis;

	const doc = new MiniDocument(win);
	(win as unknown as { document: MiniDocument }).document = doc;

	globalThis.window = win;
	globalThis.document = doc as unknown as Document;
	globalThis.Element = MiniElement as unknown as typeof Element;
	globalThis.HTMLElement = MiniElement as unknown as typeof HTMLElement;
	globalThis.Node = MiniNode as unknown as typeof Node;
	globalThis.HTMLIFrameElement = MockHTMLIFrameElement as unknown as typeof HTMLIFrameElement;

	return {
		doc,
		restore: () => {
			globalThis.window = origWindow;
			globalThis.document = origDocument;
			globalThis.Element = origElement;
			globalThis.HTMLElement = origHTMLElement;
			globalThis.Node = origNode;
			globalThis.HTMLIFrameElement = origIFrame;
		},
	};
}

const mockSortable = {
	items: [],
	draggingId: null,
	dragIndex: -1,
	overIndex: -1,
	direction: 'vertical',
	handleProps: () => ({}),
	rowProps: () => ({}),
	moveItem: () => {},
	announcement: '',
} as unknown as ReturnType<typeof useSortableList<string>>;

function makePhpRelationItem(overrides: Partial<RelationItemData> & { idNum: number }): RelationItemData {
	const { idNum, meta, ...rest } = overrides;
	return {
		morphToken: `page:${idNum}`,
		value: `/p-${idNum}/`,
		resource: 'page',
		resourceLabel: 'Page',
		label: `Page ${idNum}`,
		subtitle: `/p-${idNum}/`,
		badge: 'basic-page',
		icon: 'file-text',
		status: 'published',
		thumbUrl: '',
		hasChildren: false,
		parentId: 0,
		meta: {
			id: idNum,
			name: `p-${idNum}`,
			path: `/p-${idNum}/`,
			template: 'basic-page',
			selectable: true,
			numChildren: 0,
			...(meta || {}),
		},
		...rest,
	};
}

describe('Nested tree & recursive loader hardening', () => {
	let restoreDom: (() => void) | null = null;

	afterEach(() => {
		restoreDom?.();
		restoreDom = null;
	});

	it('resolves PHP RelationItem payloads cleanly via shared helpers without top-level id/key/thumb', () => {
		const item = makePhpRelationItem({
			idNum: 1024,
			thumbUrl: '/site/assets/files/1024/thumb.jpg',
			hasChildren: true,
			meta: { id: 1024, selectable: false, numChildren: 7 },
		});

		expect(resolveRelationNodeId(item)).toBe('1024');
		expect(resolveRelationItemKey(item)).toBe('page:1024');
		expect(isRelationItemDisabled(item)).toBe(true);
		expect(resolveRelationNumChildren(item)).toBe(7);

		const thumbHtml = renderToStaticMarkup(
			React.createElement(RelationItemVisual, { item, fallbackIcon: 'file-text' })
		);
		expect(thumbHtml).toContain('/site/assets/files/1024/thumb.jpg');
	});

	it('expands multi-level PHP-shaped TreeSelect nodes without undefined parentId recursion loops', async () => {
		const env = installMiniDom();
		restoreDom = env.restore;
		const container = env.doc.createElement('div');
		env.doc.body.appendChild(container);
		const root = createRoot(container as unknown as Element);

		const callEndpoint = vi.fn(async (payload: Record<string, unknown>) => {
			if (payload.action === 'tree' && !payload.parentId) {
				return {
					ok: true,
					items: [
						makePhpRelationItem({
							idNum: 1024,
							label: 'Catalog Root',
							hasChildren: true,
							meta: { id: 1024, selectable: false, numChildren: 2 },
						}),
					],
				};
			}
			if (payload.action === 'tree' && String(payload.parentId) === '1024') {
				return {
					ok: true,
					items: [
						makePhpRelationItem({
							idNum: 2048,
							label: 'Nested Category',
							hasChildren: true,
							parentId: 1024,
							meta: { id: 2048, selectable: true, numChildren: 1 },
						}),
					],
				};
			}
			if (payload.action === 'tree' && String(payload.parentId) === '2048') {
				return {
					ok: true,
					items: [
						makePhpRelationItem({
							idNum: 4096,
							label: 'Deep Leaf Item',
							hasChildren: false,
							parentId: 2048,
						}),
					],
				};
			}
			return { ok: true, items: [] };
		});

		flushSync(() => {
			root.render(
				React.createElement(TreeSelectRelationWidget, {
					initialTree: [],
					multiple: false,
					scalarValue: '',
					multiValues: [],
					maxItems: 0,
					disabled: false,
					editableLink: false,
					creatable: false,
					fallbackIcon: 'file-text',
					sortable: mockSortable,
					isSortable: false,
					resolveItem: (tok) => makePhpRelationItem({ idNum: Number(tok) || 1 }),
					callEndpoint,
					onCommitScalar: vi.fn(),
					onCommitMulti: vi.fn(),
					onOpenQuickCreate: vi.fn(),
				})
			);
		});

		// Open tree picker
		const toggleBtn = container
			.querySelectorAll('button')
			.find((b) => b.textContent.includes('Select from Page Tree'));
		expect(toggleBtn).toBeDefined();
		flushSync(() => toggleBtn!.click());
		await new Promise((r) => setTimeout(r, 15));

		expect(callEndpoint).toHaveBeenCalledWith({ action: 'tree' }, false, expect.anything());
		expect(container.textContent).toContain('Catalog Root');
		expect(container.textContent).toContain('(2)');

		const unselectableBtn = container
			.querySelectorAll('button')
			.find((b) => b.textContent.includes('Catalog Root'));
		expect(unselectableBtn?.disabled).toBe(true);

		// Expand level 1 (idNum: 1024)
		const expandBtn1 = container
			.querySelectorAll('button')
			.find((b) => b.getAttribute('aria-label') === 'Expand');
		expect(expandBtn1).toBeDefined();
		flushSync(() => expandBtn1!.click());
		await new Promise((r) => setTimeout(r, 15));

		expect(callEndpoint).toHaveBeenCalledWith(
			{ action: 'tree', parentId: '1024' },
			false,
			expect.anything()
		);
		expect(container.textContent).toContain('Nested Category');

		// Expand level 2 (idNum: 2048)
		const expandBtns = container
			.querySelectorAll('button')
			.filter((b) => b.getAttribute('aria-label') === 'Expand');
		expect(expandBtns.length).toBeGreaterThan(0);
		flushSync(() => expandBtns[0]!.click());
		await new Promise((r) => setTimeout(r, 15));

		expect(callEndpoint).toHaveBeenCalledWith(
			{ action: 'tree', parentId: '2048' },
			false,
			expect.anything()
		);
		expect(container.textContent).toContain('Deep Leaf Item');
		expect(callEndpoint).toHaveBeenCalledTimes(3);

		flushSync(() => root.unmount());
		await new Promise((r) => setTimeout(r, 15));
	});

	it('survives cyclic tree payloads and empty root responses without call stack overflow or refetch loops', async () => {
		const env = installMiniDom();
		restoreDom = env.restore;
		const container = env.doc.createElement('div');
		env.doc.body.appendChild(container);
		const root = createRoot(container as unknown as Element);

		const cyclicCall = vi.fn(async (payload: Record<string, unknown>) => {
			if (payload.action === 'tree' && String(payload.parentId) === '10') {
				return {
					ok: true,
					items: [
						makePhpRelationItem({
							idNum: 10,
							label: 'Self Cycle Node',
							hasChildren: true,
						}),
					],
				};
			}
			return { ok: true, items: [] };
		});

		flushSync(() => {
			root.render(
				React.createElement(TreeSelectRelationWidget, {
					initialTree: [
						makePhpRelationItem({
							idNum: 10,
							label: 'Parent Node',
							hasChildren: true,
						}),
					],
					multiple: false,
					scalarValue: '',
					multiValues: [],
					maxItems: 0,
					disabled: false,
					editableLink: false,
					creatable: false,
					fallbackIcon: 'file-text',
					sortable: mockSortable,
					isSortable: false,
					resolveItem: (tok) => makePhpRelationItem({ idNum: Number(tok) || 1 }),
					callEndpoint: cyclicCall,
					onCommitScalar: vi.fn(),
					onCommitMulti: vi.fn(),
					onOpenQuickCreate: vi.fn(),
				})
			);
		});

		const toggleBtn = container
			.querySelectorAll('button')
			.find((b) => b.textContent.includes('Select from Page Tree'));
		flushSync(() => toggleBtn!.click());

		const expandBtn = container
			.querySelectorAll('button')
			.find((b) => b.getAttribute('aria-label') === 'Expand');
		expect(expandBtn).toBeDefined();
		flushSync(() => expandBtn!.click());
		await new Promise((r) => setTimeout(r, 15));

		expect(container.textContent).toContain('Parent Node');
		expect(container.textContent).not.toContain('Self Cycle Node');

		flushSync(() => root.unmount());
		await new Promise((r) => setTimeout(r, 15));

		// Empty root response must only fetch once when opened
		const emptyContainer = env.doc.createElement('div');
		env.doc.body.appendChild(emptyContainer);
		const emptyRoot = createRoot(emptyContainer as unknown as Element);
		const emptyRootCall = vi.fn(async () => ({ ok: true, items: [] }));
		flushSync(() => {
			emptyRoot.render(
				React.createElement(TreeSelectRelationWidget, {
					initialTree: [],
					multiple: false,
					scalarValue: '',
					multiValues: [],
					maxItems: 0,
					disabled: false,
					editableLink: false,
					creatable: false,
					fallbackIcon: 'file-text',
					sortable: mockSortable,
					isSortable: false,
					resolveItem: (tok) => makePhpRelationItem({ idNum: Number(tok) || 1 }),
					callEndpoint: emptyRootCall,
					onCommitScalar: vi.fn(),
					onCommitMulti: vi.fn(),
					onOpenQuickCreate: vi.fn(),
				})
			);
		});

		const emptyToggleBtn = emptyContainer
			.querySelectorAll('button')
			.find((b) => b.textContent.includes('Select from Page Tree'));
		expect(emptyToggleBtn).toBeDefined();
		flushSync(() => emptyToggleBtn!.click());

		await new Promise((r) => setTimeout(r, 30));
		expect(emptyRootCall).toHaveBeenCalledTimes(1);

		flushSync(() => emptyRoot.unmount());
		await new Promise((r) => setTimeout(r, 15));
	});

	it('renders O2MRelationView table fallback cleanly without stringified undefined', () => {
		const html = renderToStaticMarkup(
			React.createElement(O2MRelationView, {
				widget: 'table',
				initialItems: [
					{
						morphToken: 'order:55',
						resource: 'order',
						value: '55',
						label: 'Order #55',
						subtitle: '',
					},
				],
				resourceLabel: 'Order',
				resourceIcon: 'shopping-cart',
				ownerId: 12,
				foreignField: 'customer',
				creatable: false,
				allowLink: false,
				allowUnlink: false,
				editableLink: false,
				refreshTick: 0,
				callEndpoint: async () => ({ ok: true, items: [] }),
				onOpenQuickCreate: () => {},
			})
		);

		expect(html).toContain('Order #55');
		expect(html).toContain('>55<');
		expect(html).not.toContain('undefined');
	});

	it('survives cyclic SidebarShellLayout navItems and cyclic SchemaForm sections without stack overflow', () => {
		const parentNav: AppShellNavItem = {
			id: 'root',
			label: 'Root Group',
			href: '/admin/root/',
			children: [],
		};
		const childNav: AppShellNavItem = {
			id: 'child',
			label: 'Child Item',
			href: '/admin/child/',
			active: true,
			children: [parentNav],
		};
		parentNav.children = [childNav];

		const sidebarHtml = renderToStaticMarkup(
			React.createElement(SidebarShellLayout, {
				title: 'Cycle Test',
				icon: 'folder',
				pills: [],
				navItems: [parentNav],
				sections: [],
				resolvedNavItems: [parentNav],
				resolvedActiveNav: 'child',
				recordHeader: undefined,
				hasRecordHeader: false,
				recordHeaderSpec: null,
				hasDirtySchemaForm: false,
				resolvedHeaderActions: undefined,
				activeFeedback: null,
				onDismissFeedback: () => {},
				flash: undefined,
				dismissedFlash: { errors: false, warnings: false, messages: false },
				onDismissFlash: () => {},
				isEmbeddedIsland: false,
				shellMode: 'admin',
				isClassicAdminShell: true,
				showGlobalWorkspaceBar: false,
				enableShortcuts: false,
				openInWorkspaceHref: '',
				MainContainer: 'div',
				returnLabel: 'Panel',
				workspaces: [],
				primaryWorkspaces: [],
				overflowWorkspaces: [],
				filteredOverflow: [],
				activeWorkspace: null,
				favorites: [],
				isWorkspaceActive: () => false,
				toggleFavoriteWorkspace: () => {},
				moreMenuOpen: false,
				setMoreMenuOpen: () => {},
				moreFilter: '',
				setMoreFilter: () => {},
				moreMenuRef: { current: null },
				mobileDrawerOpen: false,
				setMobileDrawerOpen: () => {},
				onOpenMobileDrawer: () => {},
				onOpenCommandPalette: () => {},
				onOpenShortcuts: () => {},
				themeMode: 'light',
				resolvedDark: false,
				themePreset: 'native',
				userThemePreset: '',
				siteDefaultThemePreset: 'native',
				presetPending: false,
				availableThemePresets: [],
				activePresetMeta: undefined,
				setThemeMode: () => {},
				setThemePreset: async () => true,
				shellLayout: 'sidebar',
				userShellLayout: 'sidebar',
				siteDefaultShellLayout: 'sidebar',
				availableShellLayouts: [],
				sidebarCollapsed: false,
				layoutPending: false,
				setShellLayout: async () => true,
				setSidebarCollapsed: async () => true,
				toggleSidebarCollapsed: async () => true,
				children: React.createElement('div', null, 'Safe Body'),
			})
		);
		expect(sidebarHtml).toContain('Root Group');
		expect(sidebarHtml).toContain('Child Item');
		expect(sidebarHtml).toContain('Safe Body');

		const cyclicSection: SchemaFieldDefinition = {
			kind: 'section',
			name: 'sec_cycle',
			label: 'Cyclic Section',
			fields: [],
		};
		cyclicSection.fields = [cyclicSection];

		const formHtml = renderToStaticMarkup(
			React.createElement(SchemaForm, {
				schema: {
					id: 'sf-cycle',
					action: '',
					method: 'post',
					fields: [cyclicSection],
				},
			})
		);
		expect(formHtml).toContain('Cyclic Section');
	});
});
