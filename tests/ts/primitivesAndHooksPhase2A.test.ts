import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Alert,
	Checkbox,
	Combobox,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Drawer,
	DropdownMenu,
	PORTAL_ROOT_ID,
	Popover,
	PopoverContent,
	PopoverTrigger,
	RadioGroup,
	RadioGroupItem,
	ScrollArea,
	Stepper,
	Switch,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	Timeline,
	ToastProvider,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
	CliBox,
	getPortalContainer,
} from '../../resources/ts/ui';
import {
	evaluateShowIfCondition,
	navigateTablistByKey,
	resolveScopedFieldValue,
} from '../../resources/ts/fields/schemaRuntimeHelpers';
import { ensureViewportModeStylesLoaded } from '../../resources/ts/viewports/ViewportRegistry';
import {
	THEME_PRESETS,
	applyThemeCss,
	dispatchDirtyFormState,
	fetchGatewayJson,
	markHostFormDirty,
} from '../../resources/ts/hooks';

describe('Phase 2A Modular Primitives, PortalRoot & Shared Hooks', () => {
	it('renders accessible Base UI Switch, Checkbox, and RadioGroup primitives with label pairings', () => {
		const switchHtml = renderToStaticMarkup(
			React.createElement(Switch, {
				checked: true,
				onCheckedChange: () => {},
				label: 'Live Preview',
			})
		);
		const swId = switchHtml.match(/<button[^>]*\bid="([^"]+)"/)?.[1];
		const swFor = switchHtml.match(/<label[^>]*\bfor="([^"]+)"/)?.[1];
		expect(switchHtml).toContain('role="switch"');
		expect(swId).toBeTruthy();
		expect(swFor).toBe(swId);

		const checkboxHtml = renderToStaticMarkup(
			React.createElement(Checkbox, {
				checked: true,
				indeterminate: true,
				onCheckedChange: () => {},
				label: 'Select all items',
			})
		);
		const cbId = checkboxHtml.match(/<button[^>]*\bid="([^"]+)"/)?.[1];
		const cbFor = checkboxHtml.match(/<label[^>]*\bfor="([^"]+)"/)?.[1];
		expect(checkboxHtml).toContain('role="checkbox"');
		expect(cbId).toBeTruthy();
		expect(cbFor).toBe(cbId);

		const radioHtml = renderToStaticMarkup(
			React.createElement(
				RadioGroup,
				{ defaultValue: 'grid', 'aria-label': 'Layout mode' },
				React.createElement(RadioGroupItem, { value: 'grid', label: 'Grid' }),
				React.createElement(RadioGroupItem, { value: 'list', label: 'List' })
			)
		);
		expect(radioHtml).toContain('role="radiogroup"');
		expect(radioHtml).toContain('role="radio"');
		expect(radioHtml).toContain('Grid');
		expect(radioHtml).toContain('List');
	});

	it('renders compound Tabs across variants and preserves keepMounted / forceMount semantics', () => {
		for (const variant of ['segmented', 'line', 'vertical', 'pw-lang'] as const) {
			const html = renderToStaticMarkup(
				React.createElement(
					Tabs,
					{ defaultValue: 'one', variant },
					React.createElement(
						TabsList,
						null,
						React.createElement(TabsTrigger, { value: 'one', icon: 'layers', badge: 2 }, 'First'),
						React.createElement(TabsTrigger, { value: 'two' }, 'Second')
					),
					React.createElement(TabsContent, { value: 'one' }, 'Panel One'),
					React.createElement(TabsContent, { value: 'two', forceMount: true }, 'Panel Two')
				)
			);
			expect(html).toContain('data-rw-tablist=""');
			expect(html).toContain(`data-variant="${variant}"`);
			expect(html).toContain('role="tablist"');
			expect(html).toContain('role="tab"');
			expect(html).toContain('role="tabpanel"');
			expect(html).toContain('Panel One');
			expect(html).toContain('Panel Two');
		}
	});

	it('renders high-contrast Alert body copy and Drawer / CommandDialog ARIA surfaces', () => {
		for (const variant of ['default', 'success', 'warning', 'danger'] as const) {
			const alertHtml = renderToStaticMarkup(
				React.createElement(Alert, { variant, title: 'Status' }, 'Readable body message')
			);
			expect(alertHtml).toContain('role="alert"');
			expect(alertHtml).toContain('text-foreground');
			expect(alertHtml).toContain('Readable body message');
		}

		const leftDrawerHtml = renderToStaticMarkup(
			React.createElement(
				Drawer,
				{ open: true, onOpenChange: () => {}, title: 'Navigation', subtitle: 'Modules' },
				'Drawer body'
			)
		);
		expect(leftDrawerHtml).toContain('data-rw-drawer-dialog=""');
		expect(leftDrawerHtml).toContain('aria-labelledby=');
		expect(leftDrawerHtml).toContain('aria-describedby=');

		const rightDrawerHtml = renderToStaticMarkup(
			React.createElement(
				Drawer,
				{ open: true, onOpenChange: () => {}, title: 'Details', side: 'right' },
				'Right body'
			)
		);
		expect(rightDrawerHtml).toContain('data-rw-sheet-dialog=""');

		const cmdHtml = renderToStaticMarkup(
			React.createElement(
				CommandDialog,
				{ open: true, onOpenChange: () => {}, label: 'Quick Switcher' },
				React.createElement(CommandInput, { value: '', onChange: () => {}, placeholder: 'Search...' }),
				React.createElement(
					CommandList,
					null,
					React.createElement(
						CommandGroup,
						{ heading: 'Workspaces' },
						React.createElement(CommandItem, { active: true, icon: 'box', shortcut: '⌘K' }, 'Entries')
					),
					React.createElement(CommandEmpty, null, 'None')
				)
			)
		);
		expect(cmdHtml).toContain('data-rw-command-dialog=""');
		expect(cmdHtml).toContain('role="combobox"');
		expect(cmdHtml).toContain('role="listbox"');
		expect(cmdHtml).toContain('role="option"');
	});

	it('renders Accordion, ScrollArea, Combobox, Popover, Tooltip, DropdownMenu, Toast, Stepper, and Timeline cleanly on SSR', () => {
		const html = renderToStaticMarkup(
			React.createElement(
				ToastProvider,
				null,
				React.createElement(
					Accordion,
					{ defaultValue: ['a1'] },
					React.createElement(
						AccordionItem,
						{ value: 'a1' },
						React.createElement(AccordionTrigger, { icon: 'info' }, 'Section A'),
						React.createElement(AccordionContent, null, 'Body A')
					)
				),
				React.createElement(ScrollArea, { className: 'h-32' }, 'Scrollable text'),
				React.createElement(Combobox, {
					options: [{ value: 'one', label: 'Option One' }],
					value: 'one',
					onValueChange: () => {},
				}),
				React.createElement(
					Popover,
					null,
					React.createElement(PopoverTrigger, null, 'Open Popover'),
					React.createElement(PopoverContent, null, 'Popover body')
				),
				React.createElement(
					TooltipProvider,
					null,
					React.createElement(
						Tooltip,
						null,
						React.createElement(TooltipTrigger, null, 'Hover me'),
						React.createElement(TooltipContent, null, 'Tip text')
					)
				),
				React.createElement(DropdownMenu, {
					items: [{ key: 'edit', label: 'Edit', icon: 'pencil' }],
				}),
				React.createElement(Stepper, {
					currentStep: 1,
					steps: [
						{ id: 's1', title: 'Setup' },
						{ id: 's2', title: 'Review' },
					],
				}),
				React.createElement(Timeline, {
					items: [{ id: 't1', title: 'Published', timestamp: '12:00', tone: 'success' }],
				})
			)
		);

		expect(html).toContain('Section A');
		expect(html).toContain('Scrollable text');
		expect(html).toContain('aria-haspopup="menu"');
		expect(html).toContain('aria-current="step"');
		expect(html).toContain('Published');
	});

	it('resolves getPortalContainer safely across SSR, shared portal root, and top-layer ancestor dialogs', () => {
		expect(getPortalContainer()).toBeNull();

		const originalDocument = globalThis.document;
		const appendedNodes: Array<Record<string, unknown>> = [];
		const attrs = new Map<string, string>();
		const mockRoot = {
			id: '',
			attributes: attrs,
			setAttribute: (k: string, v: string) => attrs.set(k, v),
			hasAttribute: (k: string) => attrs.has(k),
		};
		const mockDialog = {} as unknown as HTMLElement;

		try {
			globalThis.document = {
				body: {
					appendChild: (node: Record<string, unknown>) => {
						appendedNodes.push(node);
						return node;
					},
				},
				getElementById: (id: string) =>
					id === PORTAL_ROOT_ID && appendedNodes.length > 0 ? (mockRoot as unknown as HTMLElement) : null,
				createElement: () => mockRoot as unknown as HTMLElement,
			} as unknown as Document;

			const rootEl = getPortalContainer();
			expect(rootEl).toBe(mockRoot);
			expect(mockRoot.id).toBe(PORTAL_ROOT_ID);
			expect(attrs.get('data-rw-portal-overlay')).toBe('1');
			expect(appendedNodes).toHaveLength(1);

			// Calling again reuses the singleton root without appending a second container.
			expect(getPortalContainer()).toBe(mockRoot);
			expect(appendedNodes).toHaveLength(1);

			// Mock HTMLElement so instanceof HTMLElement succeeds in Node SSR environment.
			const originalHtmlEl = globalThis.HTMLElement;
			try {
				class FakeEl {}
				Object.setPrototypeOf(mockDialog, FakeEl.prototype);
				globalThis.HTMLElement = FakeEl as unknown as typeof HTMLElement;
				const mockAnchor = {
					closest: (selector: string) => (selector === 'dialog[open]' ? mockDialog : null),
				} as unknown as Element;
				expect(getPortalContainer(mockAnchor)).toBe(mockDialog);
			} finally {
				globalThis.HTMLElement = originalHtmlEl;
			}
		} finally {
			globalThis.document = originalDocument;
		}
	});

	it('enforces same-origin & CSRF rules in fetchGatewayJson and exposes canonical THEME_PRESETS + applyThemeCss', async () => {
		let fetchCalled = false;
		const originalFetch = globalThis.fetch;
		try {
			globalThis.fetch = (async () => {
				fetchCalled = true;
				return new Response(JSON.stringify({ ok: true, value: 42 }), { status: 200 });
			}) as typeof fetch;

			const crossOrigin = await fetchGatewayJson('https://evil.example.com/_react/prefs', {
				payload: { action: 'set_theme_preset' },
			});
			expect(crossOrigin.ok).toBe(false);
			expect(crossOrigin.status).toBe(0);
			expect(fetchCalled).toBe(false);

			const xssUrl = await fetchGatewayJson('javascript:alert(1)');
			expect(xssUrl.ok).toBe(false);
			expect(fetchCalled).toBe(false);

			let capturedInit: RequestInit | undefined;
			globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
				capturedInit = init;
				return new Response(JSON.stringify({ ok: true, themePreset: 'ocean' }), { status: 200 });
			}) as typeof fetch;

			const res = await fetchGatewayJson<{ ok: boolean; themePreset: string }>('/_react/workspace-prefs', {
				method: 'POST',
				payload: { action: 'set_theme_preset', themePreset: 'ocean' },
				csrfSource: { csrf: { name: 'TOKEN123', value: 'sec-val' } },
			});
			expect(res.ok).toBe(true);
			expect(res.data?.themePreset).toBe('ocean');
			const headers = capturedInit?.headers as Record<string, string>;
			expect(headers['X-CSRF-Token']).toBe('sec-val');
			const parsedBody = JSON.parse(String(capturedInit?.body));
			expect(parsedBody.TOKEN123).toBe('sec-val');
			expect(parsedBody.action).toBe('set_theme_preset');
		} finally {
			globalThis.fetch = originalFetch;
		}

		expect(THEME_PRESETS.map((p) => p.id)).toEqual([
			'native',
			'neutral',
			'slate',
			'stone',
			'ocean',
			'indigo',
			'teal',
			'custom',
		]);

		const originalDocument = globalThis.document;
		let removed = false;
		const styleNode: { id: string; textContent: string | null; parentNode: unknown; remove: () => void } = {
			id: '',
			textContent: '',
			parentNode: null,
			remove: () => {
				removed = true;
				styleNode.parentNode = null;
			},
		};
		const headChildren: unknown[] = [];
		try {
			globalThis.document = {
				head: {
					appendChild: (node: typeof styleNode) => {
						node.parentNode = globalThis.document.head;
						headChildren.push(node);
						return node;
					},
				},
				getElementById: (id: string) =>
					id === 'rw-theme-tokens' && styleNode.parentNode ? (styleNode as unknown as HTMLElement) : null,
				createElement: () => styleNode as unknown as HTMLElement,
			} as unknown as Document;

			applyThemeCss(':root { --primary: #2563eb; }');
			expect(styleNode.id).toBe('rw-theme-tokens');
			expect(styleNode.textContent).toBe(':root { --primary: #2563eb; }');
			expect(headChildren).toHaveLength(1);

			applyThemeCss('');
			expect(removed).toBe(true);
		} finally {
			globalThis.document = originalDocument;
		}
	});

	it('exports markHostFormDirty and dispatches canonical rw:schema-form-dirty events', () => {
		expect(typeof markHostFormDirty).toBe('function');

		const dispatched: Array<{ type: string; detail: unknown }> = [];
		const originalWindow = globalThis.window;
		const originalCustomEvent = globalThis.CustomEvent;
		try {
			globalThis.CustomEvent = class MockCustomEvent {
				type: string;
				detail: unknown;
				constructor(type: string, init?: { detail?: unknown }) {
					this.type = type;
					this.detail = init?.detail;
				}
			} as unknown as typeof CustomEvent;

			globalThis.window = {
				dispatchEvent: (ev: { type: string; detail: unknown }) => {
					dispatched.push({ type: ev.type, detail: ev.detail });
					return true;
				},
			} as unknown as Window & typeof globalThis;

			dispatchDirtyFormState(true, 'demo-form');
			expect(dispatched).toEqual([
				{ type: 'rw:schema-form-dirty', detail: { isDirty: true, formId: 'demo-form' } },
			]);
		} finally {
			globalThis.window = originalWindow;
			globalThis.CustomEvent = originalCustomEvent;
		}
	});

	it('supports CliBox wrap toggle, schemaRuntimeHelpers exports, and safe viewStyles injection', () => {
		const defaultHtml = renderToStaticMarkup(React.createElement(CliBox, { command: 'php vendor/bin/wire test' }));
		expect(defaultHtml).toContain('truncate');
		expect(defaultHtml).not.toContain('whitespace-normal');

		const wrappedHtml = renderToStaticMarkup(
			React.createElement(CliBox, { command: 'php vendor/bin/wire test --very-long', wrap: true })
		);
		expect(wrappedHtml).toContain('whitespace-normal');
		expect(wrappedHtml).toContain('break-all');

		expect(typeof evaluateShowIfCondition).toBe('function');
		expect(typeof navigateTablistByKey).toBe('function');
		expect(resolveScopedFieldValue({ meta_mode: 'dark' }, 'mode', 'meta_')).toBe('dark');
		expect(evaluateShowIfCondition('mode=dark', { mode: 'dark' })).toBe(true);
		expect(evaluateShowIfCondition('mode=light', { mode: 'dark' })).toBe(false);

		const appendedLinks: Array<{ rel: string; href: string }> = [];
		const originalDocument = globalThis.document;
		try {
			globalThis.document = {
				head: {
					appendChild: (node: { rel: string; href: string }) => {
						appendedLinks.push({ rel: node.rel, href: node.href });
						return node;
					},
				},
				querySelectorAll: () => [],
				createElement: () => ({ rel: '', href: '' }),
			} as unknown as Document;

			ensureViewportModeStylesLoaded('calendar', {
				calendar: ['/site/modules/React/dist/ReactCalendar.css?v=1', 'javascript:alert(1)'],
			});
			ensureViewportModeStylesLoaded('calendar', {
				calendar: ['/site/modules/React/dist/ReactCalendar.css?v=1'],
			});

			expect(appendedLinks).toEqual([
				{ rel: 'stylesheet', href: '/site/modules/React/dist/ReactCalendar.css?v=1' },
			]);
		} finally {
			globalThis.document = originalDocument;
		}
	});

	it('respects WCAG 2.5.3 on DropdownMenu triggerLabel, propagates TabsList variant & custom TabsTrigger id, and preserves CommandInput handleKeyDown', async () => {
		const {
			CommandDialog,
			CommandInput,
			CommandList,
			CommandItem,
			DropdownMenu,
			Tabs,
			TabsList,
			TabsTrigger,
			TabsContent,
		} = await import('../../resources/ts/ui');

		const iconOnlyMenuHtml = renderToStaticMarkup(
			React.createElement(DropdownMenu, {
				items: [{ key: 'edit', label: 'Edit' }],
			})
		);
		expect(iconOnlyMenuHtml).toContain('aria-label="Actions"');

		const labeledMenuHtml = renderToStaticMarkup(
			React.createElement(DropdownMenu, {
				items: [{ key: 'edit', label: 'Edit' }],
				triggerLabel: 'More options',
			})
		);
		expect(labeledMenuHtml).toContain('More options');
		expect(labeledMenuHtml).not.toContain('aria-label="Actions"');

		const customTriggerMenuHtml = renderToStaticMarkup(
			React.createElement(DropdownMenu, {
				items: [{ key: 'edit', label: 'Edit' }],
				trigger: React.createElement('span', null, 'Row menu'),
			})
		);
		expect(customTriggerMenuHtml).toContain('Row menu');
		expect(customTriggerMenuHtml).not.toContain('aria-label="Actions"');

		const customTabsHtml = renderToStaticMarkup(
			React.createElement(
				Tabs,
				{ defaultValue: 'alpha' },
				React.createElement(
					TabsList,
					{ variant: 'line' },
					React.createElement(TabsTrigger, { id: 'custom-alpha-tab', value: 'alpha' }, 'Alpha'),
					React.createElement(TabsTrigger, { value: 'beta' }, 'Beta')
				),
				React.createElement(TabsContent, { value: 'alpha' }, 'Alpha panel'),
				React.createElement(TabsContent, { value: 'beta' }, 'Beta panel')
			)
		);
		expect(customTabsHtml).toContain('data-variant="line"');
		expect(customTabsHtml).toContain('id="custom-alpha-tab"');
		expect(customTabsHtml).toContain('aria-labelledby="custom-alpha-tab"');
		expect(customTabsHtml).toContain('px-1 pb-2 pt-1');

		// CommandInput invokes custom onKeyDown while keeping internal navigation when not defaultPrevented
		const cmdSrc = readFileSync(
			resolve(import.meta.dirname, '../../resources/ts/ui/primitives/Command.tsx'),
			'utf8'
		);
		expect(cmdSrc).toContain('onKeyDown?.(e);');
		expect(cmdSrc).toContain('if (e.defaultPrevented || !ctx?.listRef.current)');
		const customOnKeyDown = vi.fn();
		const cmdInputHtml = renderToStaticMarkup(
			React.createElement(
				CommandDialog,
				{ open: true, onOpenChange: () => {} },
				React.createElement(CommandInput, { onKeyDown: customOnKeyDown }),
				React.createElement(
					CommandList,
					null,
					React.createElement(CommandItem, null, 'Item A')
				)
			)
		);
		expect(cmdInputHtml).toContain('role="combobox"');
		expect(cmdInputHtml).toContain('role="listbox"');
		expect(customOnKeyDown).not.toHaveBeenCalled();

		// SelectAndMultiRelationWidget keeps single active combobox and AutocompleteAndMorphWidget exposes aria-pressed/aria-hidden
		const { SelectAndMultiRelationWidget } = await import(
			'../../resources/ts/fields/controls/relation/SelectAndMultiRelationWidget'
		);
		const { AutocompleteAndMorphWidget } = await import(
			'../../resources/ts/fields/controls/relation/AutocompleteAndMorphWidget'
		);
		const selectClosedHtml = renderToStaticMarkup(
			React.createElement(SelectAndMultiRelationWidget, {
				cardinality: 'm2o',
				multiple: false,
				options: [{ key: '1', value: 1, label: 'One' }],
				loading: false,
				scalarValue: '',
				multiValues: [],
				maxItems: 0,
				allowCustom: false,
				creatable: false,
				editableLink: false,
				disabled: false,
				resourceMeta: { name: 'pages', label: 'Page', icon: 'file' },
				sortable: {
					activeId: null,
					draggingIndex: -1,
					getItemProps: () => ({}),
					getHandleProps: () => ({}),
				} as unknown as Parameters<typeof SelectAndMultiRelationWidget>[0]['sortable'],
				isSortable: false,
				resolveItem: (tok) => ({ key: tok, value: tok, label: tok }),
				onCommitScalar: () => {},
				onCommitMulti: () => {},
				onOpenQuickCreate: () => {},
			})
		);
		expect(selectClosedHtml.match(/role="combobox"/g)).toHaveLength(1);

		const morphHtml = renderToStaticMarkup(
			React.createElement(AutocompleteAndMorphWidget, {
				cardinality: 'm2a',
				multiple: false,
				scalarValue: '',
				multiValues: [],
				maxItems: 0,
				allowCustom: false,
				creatable: false,
				editableLink: false,
				disabled: false,
				resourceMeta: { name: 'items', label: 'Item', icon: 'box' },
				resources: [
					{ name: 'article', label: 'Article', icon: 'file-text' },
					{ name: 'video', label: 'Video', icon: 'video' },
				],
				allowedResources: ['article', 'video'],
				dependsValue: '',
				sortable: {
					activeId: null,
					draggingIndex: -1,
					getItemProps: () => ({}),
					getHandleProps: () => ({}),
				} as unknown as Parameters<typeof AutocompleteAndMorphWidget>[0]['sortable'],
				isSortable: false,
				resolveItem: (tok) => ({ key: tok, value: tok, label: tok }),
				callEndpoint: async () => null,
				onCommitScalar: () => {},
				onCommitMulti: () => {},
				onOpenQuickCreate: () => {},
			})
		);
		expect(morphHtml).toContain('aria-pressed="true"');
		expect(morphHtml).toContain('aria-pressed="false"');
		expect(morphHtml).toContain('aria-hidden="true"');
	});

	it('maintains controlled boolean open state in Combobox across readOnly toggles', () => {
		const comboboxSrc = readFileSync(
			resolve(import.meta.dirname, '../../resources/ts/ui/primitives/Combobox.tsx'),
			'utf8'
		);
		expect(comboboxSrc).toContain('const [openState, setOpenState] = useState(false);');
		expect(comboboxSrc).toContain('open={readOnly ? false : openState}');
		expect(comboboxSrc).toContain('setOpenState(readOnly ? false : nextOpen)');
		expect(comboboxSrc).not.toContain('open={readOnly ? false : undefined}');

		const editableHtml = renderToStaticMarkup(
			React.createElement(Combobox, {
				options: [{ value: 'alpha', label: 'Alpha' }],
				value: 'alpha',
				readOnly: false,
				onValueChange: () => {},
			})
		);
		expect(editableHtml).toContain('value="Alpha"');

		const readOnlyHtml = renderToStaticMarkup(
			React.createElement(Combobox, {
				options: [{ value: 'alpha', label: 'Alpha' }],
				value: 'alpha',
				readOnly: true,
				onValueChange: () => {},
			})
		);
		expect(readOnlyHtml).toContain('value="Alpha"');
		expect(readOnlyHtml).toContain('readonly=""');
	});
});
