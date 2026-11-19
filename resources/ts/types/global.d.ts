import type { ReactWorkspaceRuntimeGlobal } from '../entries/ReactInertia';

declare global {
	interface Window {
		ReactWorkspaceRuntime: ReactWorkspaceRuntimeGlobal;
	}
}
