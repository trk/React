import type { ReactWorkspaceRuntimeGlobal } from '../entries/ReactInertia';

export type { ReactWorkspaceRuntimeGlobal };

export function getOptionalReactRuntime(): ReactWorkspaceRuntimeGlobal | null {
	if (typeof window === 'undefined') {
		return null;
	}
	return (
		(window as unknown as { ReactWorkspaceRuntime?: ReactWorkspaceRuntimeGlobal }).ReactWorkspaceRuntime ??
		null
	);
}

export function requireReactRuntime(): ReactWorkspaceRuntimeGlobal {
	const runtime = getOptionalReactRuntime();
	if (!runtime) {
		throw new Error(
			'ReactWorkspaceRuntime is not initialized. Ensure dist/ReactInertia.js is loaded before downstream module bundles.'
		);
	}
	return runtime;
}
