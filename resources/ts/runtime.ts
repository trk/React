import type { ReactWorkspaceRuntimeGlobal } from './entries/ReactInertia';

export function getReactWorkspaceRuntime(): ReactWorkspaceRuntimeGlobal {
	const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;
	if (!runtime) {
		throw new Error('ReactWorkspaceRuntime is not initialized. Ensure dist/ReactInertia.js is loaded first.');
	}
	return runtime;
}
