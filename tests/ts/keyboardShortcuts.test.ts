import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	KeyboardShortcutsProvider,
	formatShortcutKeys,
	getRegisteredKeyboardShortcutsSnapshot,
	registerKeyboardShortcuts,
	setKeyboardShortcutsEnabled,
} from '../../resources/ts/hooks/useKeyboardShortcuts';
import { KeyboardShortcutsDialog } from '../../resources/ts/layout/KeyboardShortcutsDialog';

class MockElement {
	tagName: string;
	isContentEditable = false;
	private closestMatch: boolean;

	constructor(tagName = 'DIV', opts?: { contentEditable?: boolean; closestEditable?: boolean }) {
		this.tagName = tagName.toUpperCase();
		this.isContentEditable = Boolean(opts?.contentEditable);
		this.closestMatch = Boolean(opts?.closestEditable);
	}

	closest(_selector: string): Element | null {
		return this.closestMatch ? (this as unknown as Element) : null;
	}
}

function createKeyEvent(
	key: string,
	opts: Partial<{
		metaKey: boolean;
		ctrlKey: boolean;
		altKey: boolean;
		shiftKey: boolean;
		code: string;
		target: EventTarget | null;
		isComposing: boolean;
	}> = {}
): KeyboardEvent & { prevented: boolean } {
	let prevented = false;
	return {
		key,
		code: opts.code ?? '',
		metaKey: Boolean(opts.metaKey),
		ctrlKey: Boolean(opts.ctrlKey),
		altKey: Boolean(opts.altKey),
		shiftKey: Boolean(opts.shiftKey),
		isComposing: Boolean(opts.isComposing),
		get defaultPrevented() {
			return prevented;
		},
		get prevented() {
			return prevented;
		},
		target: opts.target ?? null,
		preventDefault() {
			prevented = true;
		},
	} as unknown as KeyboardEvent & { prevented: boolean };
}

describe('Centralized Keyboard Shortcuts System', () => {
	const listeners = new Map<string, Set<(ev: KeyboardEvent) => void>>();
	let openDialogPresent = false;
	let mockActiveElement: Element | null = null;
	let origWindow: typeof globalThis.window;
	let origDocument: typeof globalThis.document;
	let origElement: typeof globalThis.Element;

	beforeEach(() => {
		vi.useFakeTimers();
		listeners.clear();
		openDialogPresent = false;
		mockActiveElement = null;
		origWindow = globalThis.window;
		origDocument = globalThis.document;
		origElement = globalThis.Element;

		globalThis.Element = MockElement as unknown as typeof Element;
		globalThis.window = {
			addEventListener: (type: string, fn: (ev: KeyboardEvent) => void) => {
				if (!listeners.has(type)) {
					listeners.set(type, new Set());
				}
				listeners.get(type)!.add(fn);
			},
			removeEventListener: (type: string, fn: (ev: KeyboardEvent) => void) => {
				listeners.get(type)?.delete(fn);
			},
			setTimeout: globalThis.setTimeout.bind(globalThis),
			clearTimeout: globalThis.clearTimeout.bind(globalThis),
		} as unknown as Window & typeof globalThis;

		globalThis.document = {
			get activeElement() {
				return mockActiveElement;
			},
			querySelector: (sel: string) => (sel.includes('dialog[open]') && openDialogPresent ? ({} as Element) : null),
			querySelectorAll: () => [],
			addEventListener: () => {},
			removeEventListener: () => {},
		} as unknown as Document;

		setKeyboardShortcutsEnabled(true);
	});

	afterEach(() => {
		setKeyboardShortcutsEnabled(true);
		vi.useRealTimers();
		globalThis.window = origWindow;
		globalThis.document = origDocument;
		globalThis.Element = origElement;
	});

	const dispatchKeyDown = (event: KeyboardEvent) => {
		for (const fn of Array.from(listeners.get('keydown') ?? [])) {
			fn(event);
		}
	};

	it('triggers single combos (mod+s, mod+shift+s, ?), dispatches most recent registration, and respects shift differences', () => {
		const calls: string[] = [];
		const unregister = registerKeyboardShortcuts([
			{
				id: 'forms.save',
				keys: 'mod+s',
				label: 'Save form',
				group: 'forms',
				allowInInputs: true,
				handler: () => calls.push('save'),
			},
			{
				id: 'forms.saveAndExit',
				keys: 'mod+shift+s',
				label: 'Save & exit form',
				group: 'forms',
				allowInInputs: true,
				handler: () => calls.push('save-exit'),
			},
			{
				id: 'general.help',
				keys: ['?', 'mod+/'],
				label: 'Show keyboard shortcuts',
				group: 'general',
				handler: () => calls.push('help'),
			},
		]);

		try {
			expect(getRegisteredKeyboardShortcutsSnapshot().map((s) => s.id)).toEqual([
				'forms.save',
				'forms.saveAndExit',
				'general.help',
			]);

			const saveEv = createKeyEvent('s', { metaKey: true });
			dispatchKeyDown(saveEv);
			expect(calls).toEqual(['save']);
			expect(saveEv.prevented).toBe(true);

			const saveExitEv = createKeyEvent('s', { ctrlKey: true, shiftKey: true });
			dispatchKeyDown(saveExitEv);
			expect(calls).toEqual(['save', 'save-exit']);
			expect(saveExitEv.prevented).toBe(true);

			const helpEv = createKeyEvent('?', { shiftKey: true });
			dispatchKeyDown(helpEv);
			expect(calls).toEqual(['save', 'save-exit', 'help']);
			expect(helpEv.prevented).toBe(true);
		} finally {
			unregister();
		}
		expect(getRegisteredKeyboardShortcutsSnapshot()).toEqual([]);
	});

	it('blocks shortcuts inside editable elements unless allowInInputs is true and blocks inside open modal dialogs', () => {
		const calls: string[] = [];
		const unregister = registerKeyboardShortcuts([
			{
				id: 'viewport.newRecord',
				keys: 'n',
				label: 'Create new item',
				group: 'viewport',
				handler: () => calls.push('new'),
			},
			{
				id: 'forms.save',
				keys: 'mod+s',
				label: 'Save form',
				group: 'forms',
				allowInInputs: true,
				handler: () => calls.push('save'),
			},
			{
				id: 'general.helpDialog',
				keys: 'mod+/',
				label: 'Toggle help',
				group: 'general',
				allowInDialogs: true,
				handler: () => calls.push('dialog-help'),
			},
		]);

		try {
			const inputTarget = new MockElement('INPUT') as unknown as EventTarget;
			const newInInput = createKeyEvent('n', { target: inputTarget });
			dispatchKeyDown(newInInput);
			expect(calls).toEqual([]);
			expect(newInInput.prevented).toBe(false);

			const tiptapTarget = new MockElement('DIV', { closestEditable: true }) as unknown as EventTarget;
			dispatchKeyDown(createKeyEvent('n', { target: tiptapTarget }));
			expect(calls).toEqual([]);

			const saveInInput = createKeyEvent('s', { metaKey: true, target: inputTarget });
			dispatchKeyDown(saveInInput);
			expect(calls).toEqual(['save']);
			expect(saveInInput.prevented).toBe(true);

			openDialogPresent = true;
			dispatchKeyDown(createKeyEvent('s', { metaKey: true }));
			expect(calls).toEqual(['save']);

			dispatchKeyDown(createKeyEvent('/', { metaKey: true }));
			expect(calls).toEqual(['save', 'dialog-help']);
		} finally {
			unregister();
		}
	});

	it('executes two-key navigation chords (g w) within 800ms and expires timed-out prefixes', () => {
		const calls: string[] = [];
		const unregister = registerKeyboardShortcuts([
			{
				id: 'navigation.workspace',
				keys: 'g w',
				label: 'Go to Workspace Dashboard',
				group: 'navigation',
				handler: () => calls.push('workspace'),
			},
		]);

		try {
			dispatchKeyDown(createKeyEvent('g'));
			vi.advanceTimersByTime(300);
			const secondEv = createKeyEvent('w');
			dispatchKeyDown(secondEv);
			expect(calls).toEqual(['workspace']);
			expect(secondEv.prevented).toBe(true);

			// Expired chord after > 800ms must not fire
			dispatchKeyDown(createKeyEvent('g'));
			vi.advanceTimersByTime(900);
			dispatchKeyDown(createKeyEvent('w'));
			expect(calls).toEqual(['workspace']);
		} finally {
			unregister();
		}
	});

	it('honors setKeyboardShortcutsEnabled(false) and re-enables cleanly', () => {
		const calls: string[] = [];
		const unregister = registerKeyboardShortcuts([
			{
				id: 'viewport.refresh',
				keys: 'r',
				label: 'Refresh view',
				group: 'viewport',
				handler: () => calls.push('refresh'),
			},
		]);

		try {
			setKeyboardShortcutsEnabled(false);
			expect(listeners.get('keydown')?.size ?? 0).toBe(0);
			dispatchKeyDown(createKeyEvent('r'));
			expect(calls).toEqual([]);

			setKeyboardShortcutsEnabled(true);
			expect(listeners.get('keydown')?.size ?? 0).toBe(1);
			dispatchKeyDown(createKeyEvent('r'));
			expect(calls).toEqual(['refresh']);
		} finally {
			unregister();
		}
	});

	it('formats Mac vs Windows/Linux keycaps and renders KeyboardShortcutsDialog', () => {
		expect(formatShortcutKeys('mod+shift+s', true)).toEqual(['⌘', '⇧', 'S']);
		expect(formatShortcutKeys('mod+shift+s', false)).toEqual(['Ctrl', 'Shift', 'S']);
		expect(formatShortcutKeys('alt+arrowleft', true)).toEqual(['⌥', '←']);
		expect(formatShortcutKeys('alt+arrowleft', false)).toEqual(['Alt', '←']);
		expect(formatShortcutKeys('g w', false)).toEqual(['G', 'then', 'W']);

		const emptyHtml = renderToStaticMarkup(
			React.createElement(
				KeyboardShortcutsProvider,
				{ enabled: true },
				React.createElement(KeyboardShortcutsDialog, { open: true, onOpenChange: () => {} })
			)
		);
		expect(emptyHtml).toContain('Keyboard Shortcuts');
	});
});
