import type { ReactTiptapRuntimeGlobal, TiptapCapabilityMap } from './tiptapTypes';

declare global {
	interface Window {
		ReactTiptapRuntime?: ReactTiptapRuntimeGlobal;
	}
}

const TIPTAP_ADDON_FILES: Record<string, string> = {
	editor: 'TiptapEditor.js',
	canvas: 'TiptapCanvas.js',
	blocks: 'TiptapBlocks.js',
	dialogs: 'TiptapDialogs.js',
};

const localCapabilities = new Map<keyof TiptapCapabilityMap, unknown>();
const localListeners = new Set<() => void>();

export function registerTiptapCapability<K extends keyof TiptapCapabilityMap>(
	name: K,
	impl: TiptapCapabilityMap[K]
): void {
	if (typeof window !== 'undefined' && window.ReactTiptapRuntime?.registerCapability) {
		window.ReactTiptapRuntime.registerCapability(name, impl);
		return;
	}
	localCapabilities.set(name, impl);
	localListeners.forEach((fn) => fn());
}

export function getTiptapCapability<K extends keyof TiptapCapabilityMap>(
	name: K
): TiptapCapabilityMap[K] | undefined {
	if (typeof window !== 'undefined' && window.ReactTiptapRuntime?.getCapability) {
		return window.ReactTiptapRuntime.getCapability(name);
	}
	return localCapabilities.get(name) as TiptapCapabilityMap[K] | undefined;
}

export function hasTiptapCapability(name: string): boolean {
	if (typeof window !== 'undefined' && window.ReactTiptapRuntime?.hasCapability) {
		return window.ReactTiptapRuntime.hasCapability(name);
	}
	return localCapabilities.has(name as keyof TiptapCapabilityMap);
}

export function subscribeTiptapCapabilities(listener: () => void): () => void {
	if (typeof window !== 'undefined' && window.ReactTiptapRuntime?.subscribeCapabilities) {
		return window.ReactTiptapRuntime.subscribeCapabilities(listener);
	}
	localListeners.add(listener);
	return () => {
		localListeners.delete(listener);
	};
}

export function getReactTiptapRuntime(): ReactTiptapRuntimeGlobal {
	const runtime = typeof window !== 'undefined' ? window.ReactTiptapRuntime : undefined;
	if (!runtime) {
		throw new Error('ReactTiptapRuntime is not initialized. Ensure dist/TiptapCore.js is loaded first.');
	}
	return runtime;
}

export function installReactTiptapRuntime(
	base: Omit<
		ReactTiptapRuntimeGlobal,
		'registerCapability' | 'getCapability' | 'hasCapability' | 'subscribeCapabilities' | 'ensureBundles'
	>
): ReactTiptapRuntimeGlobal {
	const caps = new Map<keyof TiptapCapabilityMap, unknown>(localCapabilities);
	const listeners = new Set<() => void>(localListeners);

	const globalObj: ReactTiptapRuntimeGlobal = {
		...base,
		registerCapability: (name, impl) => {
			caps.set(name, impl);
			listeners.forEach((fn) => fn());
		},
		getCapability: <K extends keyof TiptapCapabilityMap>(name: K) =>
			caps.get(name) as TiptapCapabilityMap[K] | undefined,
		hasCapability: (name: string) => caps.has(name as keyof TiptapCapabilityMap),
		subscribeCapabilities: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		ensureBundles: async (bundles?: string[]): Promise<void> => {
			if (!Array.isArray(bundles) || bundles.length === 0 || typeof window === 'undefined') {
				return;
			}
			const runtime = window.ReactWorkspaceRuntime;
			const missing = Array.from(
				new Set(
					bundles
						.map((b) => String(b || '').trim().toLowerCase())
						.filter((b) => b in TIPTAP_ADDON_FILES && !caps.has(b as keyof TiptapCapabilityMap))
				)
			);
			if (missing.length === 0) {
				return;
			}
			for (const addonKey of missing) {
				const file = TIPTAP_ADDON_FILES[addonKey];
				if (file) {
					runtime?.preloadRuntimeScript?.(file);
				}
			}
			await Promise.all(
				missing.map((addonKey) => {
					const file = TIPTAP_ADDON_FILES[addonKey];
					return file && runtime?.loadRuntimeScript
						? runtime.loadRuntimeScript(file)
						: Promise.resolve();
				})
			);
		},
	};

	if (typeof window !== 'undefined') {
		window.ReactTiptapRuntime = globalObj;
	}
	return globalObj;
}
