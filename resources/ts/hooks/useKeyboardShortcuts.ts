import React, { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';

export type KeyboardShortcutGroup = 'general' | 'navigation' | 'viewport' | 'forms' | 'module';

export interface KeyboardShortcutBinding {
	id: string;
	keys: string | string[];
	label: string;
	group?: KeyboardShortcutGroup;
	when?: boolean;
	allowInInputs?: boolean;
	allowInDialogs?: boolean;
	preventDefault?: boolean;
	handler: (event: KeyboardEvent) => void;
}

export interface RegisteredKeyboardShortcut {
	id: string;
	keys: string[];
	label: string;
	group: KeyboardShortcutGroup;
}

export interface KeyboardShortcutsProviderProps {
	enabled?: boolean;
	children?: React.ReactNode;
}

interface InternalBindingEntry {
	token: symbol;
	id: string;
	keys: string[];
	label: string;
	group: KeyboardShortcutGroup;
	allowInInputs: boolean;
	allowInDialogs: boolean;
	preventDefault: boolean;
	handlerRef: React.MutableRefObject<(event: KeyboardEvent) => void>;
}

interface ParsedCombo {
	mod: boolean;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	key: string;
}

const KeyboardShortcutsContext = createContext<{ enabled: boolean }>({ enabled: true });

const registeredEntries: InternalBindingEntry[] = [];
const snapshotListeners = new Set<() => void>();
const CHORD_TIMEOUT_MS = 800;

let cachedSnapshot: RegisteredKeyboardShortcut[] = [];
let globalEnabled = true;
let listenerAttached = false;
let pendingChordPrefix: string | null = null;
let pendingChordTimer: number | null = null;

function rebuildSnapshot(): void {
	const deduped = new Map<string, RegisteredKeyboardShortcut>();
	for (const entry of registeredEntries) {
		deduped.set(entry.id, {
			id: entry.id,
			keys: [...entry.keys],
			label: entry.label,
			group: entry.group,
		});
	}
	cachedSnapshot = Array.from(deduped.values());
	snapshotListeners.forEach((listener) => listener());
}

function clearPendingChord(): void {
	pendingChordPrefix = null;
	if (pendingChordTimer !== null && typeof window !== 'undefined') {
		window.clearTimeout(pendingChordTimer);
		pendingChordTimer = null;
	}
}

function isEditableElement(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) {
		return false;
	}
	const tag = target.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
		return true;
	}
	if ((target as HTMLElement).isContentEditable) {
		return true;
	}
	return Boolean(target.closest('[contenteditable=""], [contenteditable="true"], .ProseMirror, .tiptap'));
}

function hasOpenModalDialog(): boolean {
	if (typeof document === 'undefined') {
		return false;
	}
	return Boolean(document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'));
}

function parseCombo(spec: string): ParsedCombo {
	const parts = spec
		.trim()
		.toLowerCase()
		.split('+')
		.map((p) => p.trim())
		.filter((p) => p !== '');

	let mod = false;
	let ctrl = false;
	let alt = false;
	let shift = false;
	let key = '';

	for (const part of parts) {
		if (part === 'mod' || part === 'cmd' || part === 'meta') {
			mod = true;
		} else if (part === 'ctrl' || part === 'control') {
			ctrl = true;
		} else if (part === 'alt' || part === 'option') {
			alt = true;
		} else if (part === 'shift') {
			shift = true;
		} else {
			key = part;
		}
	}

	return { mod, ctrl, alt, shift, key };
}

function isShiftOptionalPrintableKey(key: string): boolean {
	return key === '?' || key === '/';
}

function matchesEventKey(event: KeyboardEvent, targetKey: string): boolean {
	const eventKey = String(event.key || '').toLowerCase();
	if (eventKey === targetKey) {
		return true;
	}
	const code = String(event.code || '');
	if (/^[0-9]$/.test(targetKey) && code === `Digit${targetKey}`) {
		return true;
	}
	if (/^[a-z]$/.test(targetKey) && code === `Key${targetKey.toUpperCase()}`) {
		return true;
	}
	if (targetKey === 'arrowleft' && eventKey === 'arrowleft') {
		return true;
	}
	return false;
}

function matchesSingleCombo(event: KeyboardEvent, comboSpec: string): boolean {
	const parsed = parseCombo(comboSpec);
	if (!parsed.key) {
		return false;
	}

	if (parsed.mod) {
		if (!(event.metaKey || event.ctrlKey)) {
			return false;
		}
	} else if (parsed.ctrl) {
		if (!event.ctrlKey || event.metaKey) {
			return false;
		}
	} else if (event.metaKey || event.ctrlKey) {
		return false;
	}

	if (parsed.alt !== event.altKey) {
		return false;
	}

	if (parsed.shift) {
		if (!event.shiftKey) {
			return false;
		}
	} else if (event.shiftKey && !isShiftOptionalPrintableKey(parsed.key)) {
		return false;
	}

	return matchesEventKey(event, parsed.key);
}

function canFireEntry(entry: InternalBindingEntry, editable: boolean, dialogOpen: boolean): boolean {
	if (editable && !entry.allowInInputs) {
		return false;
	}
	if (dialogOpen && !entry.allowInDialogs) {
		return false;
	}
	return true;
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
	if (!globalEnabled || event.isComposing || event.keyCode === 229 || event.defaultPrevented) {
		return;
	}
	const rawKey = String(event.key || '');
	if (rawKey === 'Meta' || rawKey === 'Control' || rawKey === 'Shift' || rawKey === 'Alt') {
		return;
	}

	const editable = isEditableElement(event.target) || isEditableElement(typeof document !== 'undefined' ? document.activeElement : null);
	const dialogOpen = hasOpenModalDialog();

	if (pendingChordPrefix !== null) {
		const prefix = pendingChordPrefix;
		clearPendingChord();

		if (!editable && !dialogOpen && !event.metaKey && !event.ctrlKey && !event.altKey) {
			for (let i = registeredEntries.length - 1; i >= 0; i -= 1) {
				const entry = registeredEntries[i];
				if (!entry || !canFireEntry(entry, editable, dialogOpen)) {
					continue;
				}
				for (const spec of entry.keys) {
					const steps = spec.trim().split(/\s+/);
					if (steps.length === 2 && steps[0]?.toLowerCase() === prefix && matchesSingleCombo(event, steps[1] || '')) {
						if (entry.preventDefault) {
							event.preventDefault();
						}
						entry.handlerRef.current(event);
						return;
					}
				}
			}
		}
	}

	for (let i = registeredEntries.length - 1; i >= 0; i -= 1) {
		const entry = registeredEntries[i];
		if (!entry || !canFireEntry(entry, editable, dialogOpen)) {
			continue;
		}
		for (const spec of entry.keys) {
			if (spec.trim().includes(' ')) {
				continue;
			}
			if (matchesSingleCombo(event, spec)) {
				if (entry.preventDefault) {
					event.preventDefault();
				}
				entry.handlerRef.current(event);
				return;
			}
		}
	}

	if (!editable && !dialogOpen && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
		const keyLower = rawKey.toLowerCase();
		const hasChordStartingWithKey = registeredEntries.some(
			(entry) =>
				canFireEntry(entry, editable, dialogOpen) &&
				entry.keys.some((spec) => {
					const steps = spec.trim().split(/\s+/);
					return steps.length === 2 && steps[0]?.toLowerCase() === keyLower;
				})
		);
		if (hasChordStartingWithKey) {
			pendingChordPrefix = keyLower;
			if (typeof window !== 'undefined') {
				pendingChordTimer = window.setTimeout(() => {
					clearPendingChord();
				}, CHORD_TIMEOUT_MS);
			}
		}
	}
}

function syncGlobalListener(): void {
	if (typeof window === 'undefined') {
		return;
	}
	const shouldListen = globalEnabled && registeredEntries.length > 0;
	if (shouldListen && !listenerAttached) {
		window.addEventListener('keydown', handleGlobalKeyDown);
		listenerAttached = true;
	} else if (!shouldListen && listenerAttached) {
		window.removeEventListener('keydown', handleGlobalKeyDown);
		listenerAttached = false;
		clearPendingChord();
	}
}

function mountNormalizedShortcutEntries(items: Omit<InternalBindingEntry, 'token'>[]): () => void {
	if (items.length === 0) {
		return () => {};
	}
	const tokens = items.map((item) => {
		const token = Symbol(item.id);
		registeredEntries.push({
			token,
			...item,
		});
		return token;
	});
	rebuildSnapshot();
	syncGlobalListener();

	return () => {
		const tokenSet = new Set(tokens);
		for (let i = registeredEntries.length - 1; i >= 0; i -= 1) {
			if (tokenSet.has(registeredEntries[i]!.token)) {
				registeredEntries.splice(i, 1);
			}
		}
		rebuildSnapshot();
		syncGlobalListener();
	};
}

/**
 * Toggle the global keyboard shortcut dispatcher without unmounting registered bindings.
 */
export function setKeyboardShortcutsEnabled(enabled: boolean): void {
	globalEnabled = enabled;
	syncGlobalListener();
}

/**
 * Imperatively register keyboard shortcut bindings and return a cleanup function.
 */
export function registerKeyboardShortcuts(bindings: KeyboardShortcutBinding[]): () => void {
	const items: Omit<InternalBindingEntry, 'token'>[] = bindings
		.filter((b) => Boolean(b && b.id && b.when !== false))
		.map((b) => ({
			id: b.id,
			keys: (Array.isArray(b.keys) ? b.keys : [b.keys])
				.map((k) => String(k || '').trim())
				.filter((k) => k !== ''),
			label: b.label,
			group: (b.group ?? 'module') as KeyboardShortcutGroup,
			allowInInputs: Boolean(b.allowInInputs),
			allowInDialogs: Boolean(b.allowInDialogs),
			preventDefault: b.preventDefault !== false,
			handlerRef: { current: b.handler },
		}))
		.filter((item) => item.keys.length > 0);
	return mountNormalizedShortcutEntries(items);
}

/**
 * Enable or disable centralized keyboard shortcuts across the workspace shell.
 */
export function KeyboardShortcutsProvider({
	enabled = true,
	children,
}: KeyboardShortcutsProviderProps): React.ReactElement {
	useEffect(() => {
		setKeyboardShortcutsEnabled(enabled);
		return () => {
			if (!enabled) {
				setKeyboardShortcutsEnabled(true);
			}
		};
	}, [enabled]);

	return React.createElement(KeyboardShortcutsContext.Provider, { value: { enabled } }, children);
}

/**
 * Register one or more keyboard shortcuts that automatically unregister on unmount
 * and respect input/dialog focus guards.
 */
export function useKeyboardShortcuts(bindings: KeyboardShortcutBinding[]): void {
	const { enabled } = useContext(KeyboardShortcutsContext);
	const handlersMapRef = useRef<Map<string, React.MutableRefObject<(event: KeyboardEvent) => void>>>(new Map());

	const normalized = bindings
		.filter((b) => Boolean(b && b.id && b.when !== false))
		.map((b) => {
			let ref = handlersMapRef.current.get(b.id);
			if (!ref) {
				ref = { current: b.handler };
				handlersMapRef.current.set(b.id, ref);
			} else {
				ref.current = b.handler;
			}
			const keys = (Array.isArray(b.keys) ? b.keys : [b.keys])
				.map((k) => String(k || '').trim())
				.filter((k) => k !== '');
			return {
				id: b.id,
				keys,
				label: b.label,
				group: b.group ?? 'module',
				allowInInputs: Boolean(b.allowInInputs),
				allowInDialogs: Boolean(b.allowInDialogs),
				preventDefault: b.preventDefault !== false,
				handlerRef: ref,
			};
		})
		.filter((item) => item.keys.length > 0);

	const signature = JSON.stringify(
		normalized.map((n) => [n.id, n.keys, n.label, n.group, n.allowInInputs, n.allowInDialogs, n.preventDefault])
	);

	useEffect(() => {
		if (!enabled || normalized.length === 0) {
			return;
		}
		return mountNormalizedShortcutEntries(normalized);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [enabled, signature]);
}

function subscribeShortcuts(listener: () => void): () => void {
	snapshotListeners.add(listener);
	return () => {
		snapshotListeners.delete(listener);
	};
}

function getShortcutsSnapshot(): RegisteredKeyboardShortcut[] {
	return cachedSnapshot;
}

/**
 * Read a synchronous snapshot of currently registered keyboard shortcuts.
 */
export function getRegisteredKeyboardShortcutsSnapshot(): RegisteredKeyboardShortcut[] {
	return cachedSnapshot;
}

/**
 * Subscribe to the currently registered keyboard shortcuts for rendering help overlays.
 */
export function useRegisteredKeyboardShortcuts(): RegisteredKeyboardShortcut[] {
	return useSyncExternalStore(subscribeShortcuts, getShortcutsSnapshot, getShortcutsSnapshot);
}

/**
 * Format a shortcut specification (e.g. `'mod+shift+s'` or `'g w'`) into display keycap tokens.
 */
export function formatShortcutKeys(keySpec: string, isMac?: boolean): string[] {
	const detectedMac =
		isMac ??
		(typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || ''));

	const steps = keySpec
		.trim()
		.split(/\s+/)
		.filter((s) => s !== '');

	const tokens: string[] = [];
	for (let stepIdx = 0; stepIdx < steps.length; stepIdx += 1) {
		if (stepIdx > 0) {
			tokens.push('then');
		}
		const parts = (steps[stepIdx] || '')
			.split('+')
			.map((p) => p.trim())
			.filter((p) => p !== '');
		for (const part of parts) {
			const lower = part.toLowerCase();
			if (lower === 'mod' || lower === 'cmd' || lower === 'meta') {
				tokens.push(detectedMac ? '⌘' : 'Ctrl');
			} else if (lower === 'ctrl' || lower === 'control') {
				tokens.push('Ctrl');
			} else if (lower === 'shift') {
				tokens.push(detectedMac ? '⇧' : 'Shift');
			} else if (lower === 'alt' || lower === 'option') {
				tokens.push(detectedMac ? '⌥' : 'Alt');
			} else if (lower === 'arrowleft') {
				tokens.push('←');
			} else if (lower === 'arrowright') {
				tokens.push('→');
			} else if (lower === 'arrowup') {
				tokens.push('↑');
			} else if (lower === 'arrowdown') {
				tokens.push('↓');
			} else if (lower === 'escape' || lower === 'esc') {
				tokens.push('Esc');
			} else if (lower.length === 1) {
				tokens.push(lower.toUpperCase());
			} else {
				tokens.push(part);
			}
		}
	}

	return tokens;
}
