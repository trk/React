import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	isInertiaAppActive,
	SafeHead as Head,
	safeRouter as router,
	safeUsePage as usePage,
	withWorkspaceShellUrl,
} from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { cn, sanitizeHref } from '../lib/utils';
import { TooltipProvider } from '../ui';
import {
	fetchGatewayJson,
	KeyboardShortcutsProvider,
	THEME_PRESETS,
	type ThemePresetId,
	useTheme,
} from '../hooks';
import { scheduleCommandSearch } from './commandSearchClient';
import { buildCommandPaletteItems, CommandPaletteModal } from './CommandPaletteModal';
import { DirtyNavigationConfirmDialog, useShellDirtyNavigationGuard } from './DirtyNavigationGuard';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { isRecordHeaderSpec } from './RecordHeader';
import {
	listShellLayouts,
	resolveShellLayoutDefinition,
	type ShellLayoutDefinition,
	type ShellLayoutRendererProps,
} from './shellRegistry';
import { SIDEBAR_SHELL_LAYOUT } from './SidebarShellLayout';
import { TOPBAR_SHELL_LAYOUT } from './TopbarShellLayout';
import type {
	ActionFeedbackDto,
	AppShellNavItem,
	AppShellProps,
	CommandPaletteItem,
	ShellLayoutDescriptorDto,
	ShellLayoutId,
	WorkspaceDefinitionDto,
	WorkspacePreferencesDto,
	WorkspaceSharedContext,
} from './types';
import { useShellKeyboardShortcuts } from './useShellKeyboardShortcuts';
import { useShellLayout } from './useShellLayout';

export type {
	WorkspaceStatItem,
	WorkspaceDefinitionDto,
	WorkspaceWidgetSize,
	ShellLayoutId,
	ShellLayoutDescriptorDto,
	WorkspacePreferencesDto,
	WorkspaceWidgetMetricDto,
	WorkspaceWidgetItemDto,
	WorkspaceWidgetActionDto,
	WorkspaceWidgetDto,
	WorkspaceSharedContext,
	AppShellNavItem,
	AppShellNavSection,
	ActionFeedbackDto,
	AppShellRecordHeaderBadge,
	AppShellRecordHeaderProps,
	AppShellProps,
	CommandPaletteItem,
} from './types';
export type { ShellLayoutDefinition, ShellLayoutRendererProps } from './shellRegistry';
export { renderNoticeMarkup } from './noticeMarkup';
export { RecordHeader } from './RecordHeader';

const MAX_INLINE_WORKSPACES = 5;
const BUILTIN_SHELL_LAYOUT_DEFS: ShellLayoutDefinition[] = [TOPBAR_SHELL_LAYOUT, SIDEBAR_SHELL_LAYOUT];

function toLayoutDescriptor(def: ShellLayoutDefinition): ShellLayoutDescriptorDto {
	return {
		id: def.id,
		label: def.label,
		labelKey: def.labelKey,
		description: def.description,
		descriptionKey: def.descriptionKey,
		icon: def.icon,
		supportsCollapse: def.supportsCollapse,
		order: def.order,
	};
}

function mergeAvailableShellLayouts(
	serverLayouts: ShellLayoutDescriptorDto[] | undefined
): ShellLayoutDescriptorDto[] {
	const base =
		Array.isArray(serverLayouts) && serverLayouts.length > 0
			? [...serverLayouts]
			: BUILTIN_SHELL_LAYOUT_DEFS.map(toLayoutDescriptor);
	const seen = new Set(base.map((item) => item.id.toLowerCase()));
	for (const def of listShellLayouts()) {
		if (!seen.has(def.id.toLowerCase())) {
			seen.add(def.id.toLowerCase());
			base.push(toLayoutDescriptor(def));
		}
	}
	return base.sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id));
}

function sortWorkspacesByFavorites(
	rawWorkspaces: WorkspaceSharedContext['workspaces'] | undefined,
	favorites: string[]
): WorkspaceDefinitionDto[] {
	const list: WorkspaceDefinitionDto[] = Array.isArray(rawWorkspaces)
		? rawWorkspaces
		: rawWorkspaces && typeof rawWorkspaces === 'object'
			? Object.values(rawWorkspaces)
			: [];
	const favOrder = new Map(favorites.map((id, idx) => [id.toLowerCase(), idx]));
	return [...list].sort((a, b) => {
		const aFav = favOrder.get(a.id.toLowerCase());
		const bFav = favOrder.get(b.id.toLowerCase());
		if (aFav !== undefined && bFav !== undefined) return aFav - bFav;
		if (aFav !== undefined) return -1;
		if (bFav !== undefined) return 1;
		return a.order !== b.order ? a.order - b.order : a.title.localeCompare(b.title);
	});
}

export async function postWorkspacePreferenceAction(
	endpoint: string,
	payload: Record<string, unknown>
): Promise<WorkspacePreferencesDto | null> {
	const targetEndpoint = endpoint.trim() !== '' ? endpoint : '/_react/workspace-prefs';
	const result = await fetchGatewayJson<{ ok?: boolean; preferences?: WorkspacePreferencesDto }>(
		targetEndpoint,
		{ method: 'POST', payload }
	);
	return result.ok && result.data?.preferences ? result.data.preferences : null;
}

export function AppShell({
	workspace: propWorkspace,
	layout: propLayout,
	title,
	subtitle,
	icon,
	pills = [],
	navItems = [],
	sections = [],
	activeNav,
	recordHeader,
	headerActions,
	feedback,
	onDismissFeedback,
	children,
}: AppShellProps): React.ReactElement {
	const resolvedHeaderActions = headerActions;
	const resolvedActiveNav = activeNav;
	const hasRecordHeader = recordHeader !== undefined && recordHeader !== null && recordHeader !== false;
	const resolvedNavItems = useMemo<AppShellNavItem[]>(() => {
		if (navItems.length > 0) return navItems;
		return sections.length > 0 ? sections.flatMap((sec) => sec.items || []) : [];
	}, [navItems, sections]);

	const page = usePage<{
		csrf?: { name?: string; value?: string } | null;
		workspace?: WorkspaceSharedContext;
		flash?: { messages?: string[]; warnings?: string[]; errors?: string[]; feedback?: ActionFeedbackDto };
	}>();

	const workspace = propWorkspace ?? page.props.workspace;
	const pageCsrf =
		page.props.csrf ??
		(workspace as unknown as { csrf?: { name?: string; value?: string } | null } | undefined)?.csrf ??
		null;
	const flash = (page as unknown as { flash?: typeof page.props.flash }).flash || page.props.flash;
	const rawActiveFeedback = feedback !== undefined ? feedback : flash?.feedback || null;
	const [dismissedFeedback, setDismissedFeedback] = useState(false);
	useEffect(() => {
		setDismissedFeedback(false);
	}, [rawActiveFeedback?.title, rawActiveFeedback?.message, rawActiveFeedback?.output]);
	const activeFeedback = dismissedFeedback ? null : rawActiveFeedback;
	const returnLabel = workspace?.adminReturnLabel || t('shell.returnToAdmin', 'Panel');
	const prefsEndpoint = workspace?.prefsEndpoint || '/_react/workspace-prefs';

	const [favorites, setFavorites] = useState<string[]>(() =>
		(workspace?.preferences?.favorites || []).map((id) => String(id).toLowerCase())
	);
	useEffect(() => {
		if (Array.isArray(workspace?.preferences?.favorites)) {
			setFavorites(workspace.preferences.favorites.map((id) => String(id).toLowerCase()));
		}
	}, [workspace?.preferences?.favorites]);

	const toggleFavoriteWorkspace = async (workspaceId: string, e?: React.MouseEvent) => {
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		const cleanId = workspaceId.toLowerCase();
		const previousFavorites = favorites;
		setFavorites((prev) =>
			prev.includes(cleanId) ? prev.filter((id) => id !== cleanId) : [...prev, cleanId]
		);
		const updated = await postWorkspacePreferenceAction(prefsEndpoint, {
			action: 'toggle_favorite',
			workspaceId: cleanId,
		});
		if (updated && Array.isArray(updated.favorites)) {
			setFavorites(updated.favorites.map((id) => String(id).toLowerCase()));
		} else if (updated === null) {
			setFavorites(previousFavorites);
		}
	};

	const [dismissedFlash, setDismissedFlash] = useState({ errors: false, warnings: false, messages: false });
	useEffect(() => {
		setDismissedFlash({ errors: false, warnings: false, messages: false });
	}, [flash?.errors, flash?.warnings, flash?.messages]);

	const theme = useTheme({
		initialMode: workspace?.themeMode,
		initialPreset: workspace?.themePreset,
		initialUserPreset: workspace?.userThemePreset,
		siteDefaultPreset: workspace?.siteDefaultThemePreset,
		prefsEndpoint,
		syncToServer: Boolean(workspace),
	});

	const availableThemePresets = useMemo(
		() =>
			THEME_PRESETS.filter(
				(item) =>
					item.id !== 'custom' || Boolean(workspace?.hasCustomThemeTokens) || theme.themePreset === 'custom'
			),
		[workspace?.hasCustomThemeTokens, theme.themePreset]
	);
	const activePresetMeta =
		availableThemePresets.find((item) => item.id === theme.themePreset) ?? THEME_PRESETS[0];

	const registeredLayoutsSignature = listShellLayouts()
		.map((def) => `${def.id}:${def.order ?? 100}:${def.supportsCollapse ? '1' : '0'}`)
		.join('|');

	const availableShellLayouts = useMemo<ShellLayoutDescriptorDto[]>(
		() => mergeAvailableShellLayouts(workspace?.availableShellLayouts),
		[workspace?.availableShellLayouts, registeredLayoutsSignature]
	);

	const layoutCtrl = useShellLayout({
		initialLayout: propLayout ?? workspace?.shellLayout,
		initialUserLayout: workspace?.userShellLayout,
		siteDefaultLayout: workspace?.siteDefaultShellLayout,
		initialSidebarCollapsed: workspace?.sidebarCollapsed,
		availableLayouts: availableShellLayouts,
		prefsEndpoint,
		csrfSource: pageCsrf ? { csrf: pageCsrf } : undefined,
		syncToServer: Boolean(workspace),
	});

	const activeLayoutDef =
		resolveShellLayoutDefinition(propLayout ?? layoutCtrl.shellLayout, layoutCtrl.siteDefaultShellLayout) ??
		BUILTIN_SHELL_LAYOUT_DEFS[0]!;
	const effectiveShellLayout = activeLayoutDef.id;

	const workspaces = useMemo(
		() => sortWorkspacesByFavorites(workspace?.workspaces, favorites),
		[workspace?.workspaces, favorites]
	);
	const activeWorkspace = workspace?.activeWorkspace;

	const isWorkspaceActive = (ws: WorkspaceDefinitionDto): boolean => {
		const wsProcess = ws.process || ws.processModule;
		const activeProcess = activeWorkspace?.process || activeWorkspace?.processModule;
		return activeWorkspace?.id === ws.id || (Boolean(wsProcess) && activeProcess === wsProcess);
	};

	const { primaryWorkspaces, overflowWorkspaces } = useMemo(() => {
		if (workspaces.length <= MAX_INLINE_WORKSPACES) {
			return { primaryWorkspaces: workspaces, overflowWorkspaces: [] as WorkspaceDefinitionDto[] };
		}
		const primary = workspaces.slice(0, MAX_INLINE_WORKSPACES);
		const overflow = workspaces.slice(MAX_INLINE_WORKSPACES);
		const activeInOverflowIdx = overflow.findIndex((ws) => isWorkspaceActive(ws));
		if (activeInOverflowIdx >= 0 && primary.length > 0) {
			const activeItem = overflow[activeInOverflowIdx];
			const swappedOut = primary[primary.length - 1];
			if (activeItem && swappedOut) {
				primary[primary.length - 1] = activeItem;
				overflow[activeInOverflowIdx] = swappedOut;
			}
		}
		return { primaryWorkspaces: primary, overflowWorkspaces: overflow };
	}, [workspaces, activeWorkspace]);

	const [moreMenuOpen, setMoreMenuOpen] = useState(false);
	const [moreFilter, setMoreFilter] = useState('');
	const moreMenuRef = useRef<HTMLDivElement | null>(null);
	const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
	const [commandOpen, setCommandOpen] = useState(false);
	const [commandQuery, setCommandQuery] = useState('');
	const [commandActiveIndex, setCommandActiveIndex] = useState(0);
	const [remoteCommandItems, setRemoteCommandItems] = useState<CommandPaletteItem[]>([]);
	const [commandSearching, setCommandSearching] = useState(false);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);

	useEffect(() => {
		if (!moreMenuOpen) return;
		const handleClickOutside = (ev: MouseEvent) => {
			if (moreMenuRef.current && !moreMenuRef.current.contains(ev.target as Node)) {
				setMoreMenuOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [moreMenuOpen]);

	const isEmbeddedIsland = !workspace && !isInertiaAppActive();
	const shellMode: 'workspace' | 'admin' =
		workspace?.shellMode === 'admin'
			? 'admin'
			: workspace?.shellMode === 'workspace'
				? 'workspace'
				: typeof document !== 'undefined' &&
					  document.documentElement.getAttribute('data-rw-shell-mode') === 'admin'
					? 'admin'
					: 'workspace';
	const isClassicAdminShell = !isEmbeddedIsland && shellMode === 'admin';
	const showGlobalWorkspaceBar = !isEmbeddedIsland && !isClassicAdminShell;
	const enableShortcuts = !isEmbeddedIsland && workspace?.enableKeyboardShortcuts !== false;
	const supportsSidebarCollapse = !isEmbeddedIsland && Boolean(activeLayoutDef.supportsCollapse);

	const recordHeaderSpec = isRecordHeaderSpec(recordHeader) ? recordHeader : null;
	useShellKeyboardShortcuts({
		enableShortcuts,
		commandOpen,
		shortcutsOpen,
		moreMenuOpen,
		showGlobalWorkspaceBar,
		supportsSidebarCollapse,
		workspace,
		resolvedNavItems,
		recordHeaderSpec,
		onToggleCommandPalette: () => {
			setMoreMenuOpen(false);
			setShortcutsOpen(false);
			setCommandOpen((prev) => !prev);
			setCommandQuery('');
			setCommandActiveIndex(0);
		},
		onToggleShortcutsDialog: () => {
			setMoreMenuOpen(false);
			setCommandOpen(false);
			setShortcutsOpen((prev) => !prev);
		},
		onCloseMoreMenu: () => setMoreMenuOpen(false),
		onToggleSidebar: () => void layoutCtrl.toggleSidebarCollapsed(),
	});

	const filteredOverflow = useMemo(() => {
		const q = moreFilter.trim().toLowerCase();
		if (!q) return overflowWorkspaces;
		return workspaces.filter((ws) => `${ws.title} ${ws.category} ${ws.description}`.toLowerCase().includes(q));
	}, [overflowWorkspaces, workspaces, moreFilter]);

	const commandSearchEndpoint = enableShortcuts ? workspace?.commandSearchEndpoint : undefined;
	useEffect(() => {
		return scheduleCommandSearch({
			open: commandOpen,
			endpoint: commandSearchEndpoint,
			query: commandQuery,
			defaultGroup: t('shell.groupRecords', 'Matching Records'),
			showGlobalWorkspaceBar,
			adminUrl: workspace?.adminUrl,
			launcherUrl: workspace?.launcherUrl,
			onSearchingChange: setCommandSearching,
			onResults: setRemoteCommandItems,
		});
	}, [
		commandOpen,
		commandSearchEndpoint,
		commandQuery,
		showGlobalWorkspaceBar,
		workspace?.adminUrl,
		workspace?.launcherUrl,
	]);

	const filteredCommandItems = useMemo<CommandPaletteItem[]>(
		() =>
			buildCommandPaletteItems({
				workspaces,
				resolvedNavItems,
				title,
				workspace,
				returnLabel,
				commandQuery,
				showGlobalWorkspaceBar,
				remoteItems: remoteCommandItems,
				availableShellLayouts,
				supportsSidebarCollapse,
				sidebarCollapsed: layoutCtrl.sidebarCollapsed,
				availableThemePresets,
				onSetThemeMode: workspace ? theme.setThemeMode : undefined,
				onSetThemePreset: workspace
					? (presetId: ThemePresetId | '') => void theme.setThemePreset(presetId)
					: undefined,
				onSetShellLayout: workspace
					? (layoutId: ShellLayoutId | '') => void layoutCtrl.setShellLayout(layoutId)
					: undefined,
				onToggleSidebarCollapsed: supportsSidebarCollapse
					? () => void layoutCtrl.toggleSidebarCollapsed()
					: undefined,
				onOpenShortcuts: enableShortcuts ? () => setShortcutsOpen(true) : undefined,
			}),
		[
			workspaces,
			resolvedNavItems,
			title,
			workspace,
			returnLabel,
			commandQuery,
			showGlobalWorkspaceBar,
			remoteCommandItems,
			availableShellLayouts,
			supportsSidebarCollapse,
			layoutCtrl.sidebarCollapsed,
			layoutCtrl.setShellLayout,
			layoutCtrl.toggleSidebarCollapsed,
			availableThemePresets,
			theme.setThemeMode,
			theme.setThemePreset,
			enableShortcuts,
		]
	);

	useEffect(() => {
		setCommandActiveIndex(0);
	}, [commandQuery, commandOpen]);

	const executeCommandItem = (item: CommandPaletteItem | undefined) => {
		if (!item) return;
		setCommandOpen(false);
		if (item.onClick) {
			item.onClick();
			return;
		}
		const safeItemHref = sanitizeHref(item.href);
		if (!safeItemHref) return;
		if (item.isInertia && isInertiaAppActive()) {
			router.visit(safeItemHref);
		} else if (typeof window !== 'undefined') {
			window.location.href = safeItemHref;
		}
	};

	useEffect(() => {
		if (typeof document === 'undefined' || isEmbeddedIsland) return;
		document.documentElement.setAttribute('data-rw-shell-mode', shellMode);
		if (workspace?.adminUrl) {
			document.documentElement.setAttribute('data-rw-admin-root', workspace.adminUrl);
		}
		if (workspace?.launcherUrl) {
			try {
				const parsedLauncher = new URL(workspace.launcherUrl, window.location.origin);
				document.documentElement.setAttribute('data-rw-launcher-path', parsedLauncher.pathname);
			} catch {
				document.documentElement.setAttribute('data-rw-launcher-path', workspace.launcherUrl);
			}
		}
	}, [isEmbeddedIsland, shellMode, workspace?.adminUrl, workspace?.launcherUrl]);

	const openInWorkspaceHref = useMemo(() => {
		if (!isClassicAdminShell) return '';
		const safeLauncher = sanitizeHref(workspace?.launcherUrl);
		if (!safeLauncher) return '';
		const currentPath =
			(typeof page.url === 'string' && page.url.trim() !== '' ? page.url : '') ||
			(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '') ||
			workspace?.activeWorkspace?.url ||
			safeLauncher;
		return (
			sanitizeHref(withWorkspaceShellUrl(currentPath, true, workspace?.adminUrl, workspace?.launcherUrl)) ||
			safeLauncher
		);
	}, [isClassicAdminShell, page.url, workspace?.activeWorkspace?.url, workspace?.adminUrl, workspace?.launcherUrl]);

	const { hasDirtySchemaForm, pendingDirtyVisitUrl, dismissPendingVisit, confirmLeavePage } =
		useShellDirtyNavigationGuard({ pageUrl: page.url, isEmbeddedIsland });

	const hasAncestorMain =
		typeof document !== 'undefined' &&
		(isEmbeddedIsland
			? Boolean(document.querySelector('main'))
			: isClassicAdminShell && Boolean(document.getElementById('app')?.closest('main')));
	const MainContainer: 'main' | 'div' = hasAncestorMain ? 'div' : 'main';

	const rendererProps: ShellLayoutRendererProps = {
		workspace, title, subtitle, icon, pills, navItems, sections, resolvedNavItems, resolvedActiveNav,
		recordHeader, hasRecordHeader, recordHeaderSpec, hasDirtySchemaForm, resolvedHeaderActions,
		activeFeedback,
		onDismissFeedback: () => (onDismissFeedback ? onDismissFeedback() : setDismissedFeedback(true)),
		flash, dismissedFlash,
		onDismissFlash: (bucket) => setDismissedFlash((prev) => ({ ...prev, [bucket]: true })),
		isEmbeddedIsland, shellMode, isClassicAdminShell, showGlobalWorkspaceBar, enableShortcuts,
		openInWorkspaceHref, MainContainer, returnLabel, workspaces, primaryWorkspaces, overflowWorkspaces,
		filteredOverflow, activeWorkspace, favorites, isWorkspaceActive, toggleFavoriteWorkspace,
		moreMenuOpen, setMoreMenuOpen, moreFilter, setMoreFilter, moreMenuRef,
		mobileDrawerOpen, setMobileDrawerOpen,
		onOpenMobileDrawer: () => setMobileDrawerOpen(true),
		onOpenCommandPalette: () => {
			setCommandQuery('');
			setCommandActiveIndex(0);
			setCommandOpen(true);
		},
		onOpenShortcuts: () => setShortcutsOpen(true),
		themeMode: theme.themeMode, resolvedDark: theme.resolvedDark, themePreset: theme.themePreset,
		userThemePreset: theme.userThemePreset, siteDefaultThemePreset: theme.siteDefaultThemePreset,
		presetPending: theme.presetPending, availableThemePresets, activePresetMeta,
		setThemeMode: theme.setThemeMode, setThemePreset: theme.setThemePreset,
		shellLayout: effectiveShellLayout, userShellLayout: layoutCtrl.userShellLayout,
		siteDefaultShellLayout: layoutCtrl.siteDefaultShellLayout, availableShellLayouts,
		sidebarCollapsed: layoutCtrl.sidebarCollapsed, layoutPending: layoutCtrl.layoutPending,
		setShellLayout: layoutCtrl.setShellLayout, setSidebarCollapsed: layoutCtrl.setSidebarCollapsed,
		toggleSidebarCollapsed: layoutCtrl.toggleSidebarCollapsed,
		children,
	};

	return (
		<TooltipProvider delay={250}>
			<KeyboardShortcutsProvider enabled={enableShortcuts}>
				<div
					data-rw-app-shell={isEmbeddedIsland ? undefined : isClassicAdminShell ? 'admin' : ''}
					data-rw-shell-layout={isEmbeddedIsland ? undefined : effectiveShellLayout}
					data-rw-sidebar-collapsed={
						!isEmbeddedIsland && activeLayoutDef.supportsCollapse
							? layoutCtrl.sidebarCollapsed
								? 'true'
								: 'false'
							: undefined
					}
					className={cn(
						showGlobalWorkspaceBar ? 'min-h-screen' : 'min-h-0 flex-1',
						effectiveShellLayout === 'sidebar' && showGlobalWorkspaceBar ? 'bg-sidebar' : 'bg-background',
						'text-foreground flex flex-col'
					)}
				>
					<Head title={title} />

					{enableShortcuts ? (
						<>
							<CommandPaletteModal
								open={commandOpen}
								onOpenChange={setCommandOpen}
								query={commandQuery}
								onQueryChange={setCommandQuery}
								activeIndex={commandActiveIndex}
								onActiveIndexChange={setCommandActiveIndex}
								items={filteredCommandItems}
								onExecuteItem={executeCommandItem}
								searching={commandSearching}
								hasSearchEndpoint={Boolean(commandSearchEndpoint)}
							/>
							<KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
						</>
					) : null}

					<DirtyNavigationConfirmDialog
						pendingUrl={pendingDirtyVisitUrl}
						onDismiss={dismissPendingVisit}
						onConfirmLeave={confirmLeavePage}
					/>

					{activeLayoutDef.render(rendererProps)}
				</div>
			</KeyboardShortcutsProvider>
		</TooltipProvider>
	);
}

export {
	EditPresenceBanner,
	useEditPresence,
	type PresenceCoEditor,
	type PresenceLastSaved,
	type EditPresenceSnapshot,
	type UseEditPresenceOptions,
	type UseEditPresenceResult,
	type EditPresenceBannerProps,
} from './EditPresenceBanner';
