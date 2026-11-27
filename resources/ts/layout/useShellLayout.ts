import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGatewayJson } from '../hooks';
import { isInertiaAppActive, safeRouter as router } from '../lib/inertia-bridge';
import { getCsrfToken, type CsrfTokenSource } from '../lib/utils';
import { getShellLayout } from './shellRegistry';
import type { ShellLayoutDescriptorDto, ShellLayoutId } from './types';

const SHELL_LAYOUT_STORAGE_KEY = 'react-workspace-shell-layout';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'react-workspace-sidebar-collapsed';
const SHELL_LAYOUT_ID_RE = /^[a-z0-9_-]{1,40}$/;

function normalizeShellLayoutValue(raw?: unknown): string {
	if (typeof raw !== 'string') {
		return '';
	}
	const clean = raw.trim().toLowerCase();
	if (clean === '' || clean === 'default' || !SHELL_LAYOUT_ID_RE.test(clean)) {
		return '';
	}
	return clean;
}

function parseCollapsedAttr(raw?: unknown): boolean | null {
	if (typeof raw === 'boolean') {
		return raw;
	}
	if (typeof raw === 'string') {
		const clean = raw.trim().toLowerCase();
		if (clean === 'true' || clean === '1') {
			return true;
		}
		if (clean === 'false' || clean === '0') {
			return false;
		}
	}
	return null;
}

function isKnownShellLayout(
	candidate: string,
	availableLayouts?: ShellLayoutDescriptorDto[] | null
): boolean {
	if (!candidate) {
		return false;
	}
	if (Array.isArray(availableLayouts) && availableLayouts.length > 0) {
		return availableLayouts.some((item) => item.id.toLowerCase() === candidate);
	}
	if (getShellLayout(candidate)) {
		return true;
	}
	return candidate === 'topbar' || candidate === 'sidebar';
}

function syncShellLayoutDom(layout: string, collapsed: boolean, emitEvent: boolean): void {
	if (typeof document !== 'undefined') {
		document.documentElement.setAttribute('data-rw-shell-layout', layout);
		document.documentElement.setAttribute('data-rw-sidebar-collapsed', collapsed ? 'true' : 'false');
	}
	if (typeof window !== 'undefined') {
		try {
			if (window.localStorage) {
				window.localStorage.setItem(SHELL_LAYOUT_STORAGE_KEY, layout);
				window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
			}
		} catch {
			// Ignore restricted storage environments
		}
		if (emitEvent && typeof CustomEvent !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('pw:react-shell-layout-change', {
					detail: {
						shellLayout: layout,
						sidebarCollapsed: collapsed,
					},
				})
			);
		}
	}
}

export interface UseShellLayoutOptions {
	initialLayout?: ShellLayoutId | null;
	initialUserLayout?: string | null;
	siteDefaultLayout?: ShellLayoutId | null;
	initialSidebarCollapsed?: boolean | null;
	availableLayouts?: ShellLayoutDescriptorDto[] | null;
	prefsEndpoint?: string;
	csrfSource?: CsrfTokenSource | null;
	syncToServer?: boolean;
}

export interface UseShellLayoutResult {
	shellLayout: ShellLayoutId;
	userShellLayout: string;
	siteDefaultShellLayout: ShellLayoutId;
	sidebarCollapsed: boolean;
	layoutPending: boolean;
	setShellLayout: (nextLayout: string) => Promise<boolean>;
	setSidebarCollapsed: (collapsed: boolean) => Promise<boolean>;
	toggleSidebarCollapsed: () => Promise<boolean>;
}

/**
 * Synchronized per-user workspace shell layout (`topbar` / `sidebar` / registered layouts)
 * and sidebar collapse controller with optimistic DOM updates and server persistence.
 */
export function useShellLayout(options: UseShellLayoutOptions = {}): UseShellLayoutResult {
	const {
		initialLayout,
		initialUserLayout,
		siteDefaultLayout,
		initialSidebarCollapsed,
		availableLayouts,
		prefsEndpoint = '/_react/workspace-prefs',
		csrfSource,
		syncToServer = true,
	} = options;

	const [siteDefaultShellLayout, setSiteDefaultShellLayout] = useState<ShellLayoutId>(
		() => normalizeShellLayoutValue(siteDefaultLayout) || 'topbar'
	);

	const [userShellLayout, setUserShellLayout] = useState<string>(
		() => normalizeShellLayoutValue(initialUserLayout)
	);

	const [shellLayout, setShellLayoutState] = useState<ShellLayoutId>(() => {
		const explicit = normalizeShellLayoutValue(initialLayout);
		if (explicit) {
			return explicit;
		}
		if (typeof document !== 'undefined') {
			const attr = normalizeShellLayoutValue(document.documentElement.getAttribute('data-rw-shell-layout'));
			if (attr) {
				return attr;
			}
		}
		if (typeof window !== 'undefined') {
			try {
				const saved = normalizeShellLayoutValue(window.localStorage.getItem(SHELL_LAYOUT_STORAGE_KEY));
				if (saved) {
					return saved;
				}
			} catch {
				// Ignore storage access errors
			}
		}
		return normalizeShellLayoutValue(siteDefaultLayout) || 'topbar';
	});

	const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(() => {
		if (typeof initialSidebarCollapsed === 'boolean') {
			return initialSidebarCollapsed;
		}
		if (typeof document !== 'undefined') {
			const attr = parseCollapsedAttr(document.documentElement.getAttribute('data-rw-sidebar-collapsed'));
			if (attr !== null) {
				return attr;
			}
		}
		if (typeof window !== 'undefined') {
			try {
				const saved = parseCollapsedAttr(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY));
				if (saved !== null) {
					return saved;
				}
			} catch {
				// Ignore storage access errors
			}
		}
		return false;
	});

	const [layoutPending, setLayoutPending] = useState(false);
	const layoutSeqRef = useRef(0);
	const collapseSeqRef = useRef(0);
	const pendingRequestsRef = useRef(0);
	const latestLayoutRef = useRef<ShellLayoutId>(shellLayout);
	const latestCollapsedRef = useRef<boolean>(sidebarCollapsed);
	latestLayoutRef.current = shellLayout;
	latestCollapsedRef.current = sidebarCollapsed;

	useEffect(() => {
		const normalized = normalizeShellLayoutValue(initialLayout);
		if (normalized) {
			setShellLayoutState(normalized);
		}
	}, [initialLayout]);

	useEffect(() => {
		if (typeof initialUserLayout === 'string') {
			setUserShellLayout(normalizeShellLayoutValue(initialUserLayout));
		}
	}, [initialUserLayout]);

	useEffect(() => {
		const normalized = normalizeShellLayoutValue(siteDefaultLayout);
		if (normalized) {
			setSiteDefaultShellLayout(normalized);
		}
	}, [siteDefaultLayout]);

	useEffect(() => {
		if (typeof initialSidebarCollapsed === 'boolean') {
			setSidebarCollapsedState(initialSidebarCollapsed);
		}
	}, [initialSidebarCollapsed]);

	useEffect(() => {
		if (!syncToServer) {
			return;
		}
		syncShellLayoutDom(shellLayout, sidebarCollapsed, false);
	}, [shellLayout, sidebarCollapsed, syncToServer]);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}
		const onShellLayoutChange = (event: Event) => {
			const detail = (event as CustomEvent<{ shellLayout?: unknown; sidebarCollapsed?: unknown }>).detail;
			if (!detail || typeof detail !== 'object') {
				return;
			}
			const nextLayout = normalizeShellLayoutValue(detail.shellLayout);
			if (nextLayout && nextLayout !== latestLayoutRef.current) {
				latestLayoutRef.current = nextLayout;
				setShellLayoutState(nextLayout);
			}
			const nextCollapsed = parseCollapsedAttr(detail.sidebarCollapsed);
			if (nextCollapsed !== null && nextCollapsed !== latestCollapsedRef.current) {
				latestCollapsedRef.current = nextCollapsed;
				setSidebarCollapsedState(nextCollapsed);
			}
		};
		window.addEventListener('pw:react-shell-layout-change', onShellLayoutChange);
		return () => {
			window.removeEventListener('pw:react-shell-layout-change', onShellLayoutChange);
		};
	}, []);

	const refreshInertiaWorkspace = useCallback(() => {
		if (isInertiaAppActive()) {
			router.reload({ only: ['workspace'] });
		}
	}, []);

	const setShellLayout = useCallback(
		async (nextLayout: string): Promise<boolean> => {
			const trimmed = typeof nextLayout === 'string' ? nextLayout.trim().toLowerCase() : '';
			const isClearing = trimmed === '' || trimmed === 'default';
			const normalized = isClearing ? '' : normalizeShellLayoutValue(trimmed);
			if (!isClearing && (!normalized || !isKnownShellLayout(normalized, availableLayouts))) {
				return false;
			}

			const previousLayout = latestLayoutRef.current;
			const previousUserLayout = userShellLayout;
			const optimisticEffective = isClearing ? siteDefaultShellLayout : normalized;
			const seq = ++layoutSeqRef.current;

			latestLayoutRef.current = optimisticEffective;
			setUserShellLayout(normalized);
			setShellLayoutState(optimisticEffective);
			if (syncToServer) {
				syncShellLayoutDom(optimisticEffective, latestCollapsedRef.current, true);
			}

			if (!syncToServer) {
				return true;
			}

			pendingRequestsRef.current += 1;
			setLayoutPending(true);
			try {
				const csrf = getCsrfToken(csrfSource);
				const res = await fetchGatewayJson<{
					shellLayout?: string;
					userShellLayout?: string;
					siteDefaultShellLayout?: string;
					sidebarCollapsed?: boolean;
				}>(prefsEndpoint, {
					method: 'POST',
					csrfSource,
					headers: csrf.value ? { 'X-CSRF-Token': csrf.value } : undefined,
					payload: {
						action: 'set_shell_layout',
						shellLayout: normalized,
					},
				});

				if (seq !== layoutSeqRef.current) {
					return true;
				}

				if (!res.ok) {
					latestLayoutRef.current = previousLayout;
					setShellLayoutState(previousLayout);
					setUserShellLayout(previousUserLayout);
					syncShellLayoutDom(previousLayout, latestCollapsedRef.current, true);
					return false;
				}

				const serverSiteDefault = normalizeShellLayoutValue(res.data?.siteDefaultShellLayout);
				if (serverSiteDefault) {
					setSiteDefaultShellLayout(serverSiteDefault);
				}
				const serverUserOverride =
					typeof res.data?.userShellLayout === 'string'
						? normalizeShellLayoutValue(res.data.userShellLayout)
						: normalized;
				setUserShellLayout(serverUserOverride);

				const serverEffective = normalizeShellLayoutValue(res.data?.shellLayout) || optimisticEffective;
				latestLayoutRef.current = serverEffective;
				setShellLayoutState(serverEffective);

				const serverCollapsed =
					typeof res.data?.sidebarCollapsed === 'boolean'
						? res.data.sidebarCollapsed
						: latestCollapsedRef.current;
				latestCollapsedRef.current = serverCollapsed;
				setSidebarCollapsedState(serverCollapsed);
				syncShellLayoutDom(serverEffective, serverCollapsed, false);
				refreshInertiaWorkspace();
				return true;
			} finally {
				pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
				setLayoutPending(pendingRequestsRef.current > 0);
			}
		},
		[
			availableLayouts,
			csrfSource,
			prefsEndpoint,
			refreshInertiaWorkspace,
			siteDefaultShellLayout,
			syncToServer,
			userShellLayout,
		]
	);

	const setSidebarCollapsed = useCallback(
		async (collapsed: boolean): Promise<boolean> => {
			const nextCollapsed = Boolean(collapsed);
			const previousCollapsed = latestCollapsedRef.current;
			const seq = ++collapseSeqRef.current;

			latestCollapsedRef.current = nextCollapsed;
			setSidebarCollapsedState(nextCollapsed);
			if (syncToServer) {
				syncShellLayoutDom(latestLayoutRef.current, nextCollapsed, true);
			}

			if (!syncToServer) {
				return true;
			}

			pendingRequestsRef.current += 1;
			setLayoutPending(true);
			try {
				const csrf = getCsrfToken(csrfSource);
				const res = await fetchGatewayJson<{
					sidebarCollapsed?: boolean;
				}>(prefsEndpoint, {
					method: 'POST',
					csrfSource,
					headers: csrf.value ? { 'X-CSRF-Token': csrf.value } : undefined,
					payload: {
						action: 'set_sidebar_collapsed',
						collapsed: nextCollapsed,
					},
				});

				if (seq !== collapseSeqRef.current) {
					return true;
				}

				if (!res.ok) {
					latestCollapsedRef.current = previousCollapsed;
					setSidebarCollapsedState(previousCollapsed);
					syncShellLayoutDom(latestLayoutRef.current, previousCollapsed, true);
					return false;
				}

				const serverCollapsed =
					typeof res.data?.sidebarCollapsed === 'boolean'
						? res.data.sidebarCollapsed
						: nextCollapsed;
				latestCollapsedRef.current = serverCollapsed;
				setSidebarCollapsedState(serverCollapsed);
				syncShellLayoutDom(latestLayoutRef.current, serverCollapsed, false);
				refreshInertiaWorkspace();
				return true;
			} finally {
				pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);
				setLayoutPending(pendingRequestsRef.current > 0);
			}
		},
		[csrfSource, prefsEndpoint, refreshInertiaWorkspace, syncToServer]
	);

	const toggleSidebarCollapsed = useCallback(
		() => setSidebarCollapsed(!latestCollapsedRef.current),
		[setSidebarCollapsed]
	);

	return {
		shellLayout,
		userShellLayout,
		siteDefaultShellLayout,
		sidebarCollapsed,
		layoutPending,
		setShellLayout,
		setSidebarCollapsed,
		toggleSidebarCollapsed,
	};
}
