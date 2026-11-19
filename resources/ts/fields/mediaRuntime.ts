import type * as MediaModuleType from './media';

export type ReactMediaRuntimeGlobal = typeof MediaModuleType;

declare global {
	interface Window {
		ReactMediaRuntime?: ReactMediaRuntimeGlobal;
	}
}

export function installReactMediaRuntime(api: ReactMediaRuntimeGlobal): ReactMediaRuntimeGlobal {
	if (typeof window !== 'undefined') {
		window.ReactMediaRuntime = api;
	}
	return api;
}

export function getReactMediaRuntime(): ReactMediaRuntimeGlobal {
	const rt = typeof window !== 'undefined' ? window.ReactMediaRuntime : undefined;
	if (!rt) {
		throw new Error('ReactMediaRuntime is not initialized. Ensure dist/ReactMedia.js is loaded first.');
	}
	return rt;
}
