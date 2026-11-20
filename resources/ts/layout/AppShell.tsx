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
import {
	fetchGatewayJson,
	KeyboardShortcutsProvider,
	THEME_PRESETS,
	useTheme,
} from '../hooks';
import { buildCommandPaletteItems, CommandPaletteModal } from './CommandPaletteModal';
import { DirtyNavigationConfirmDialog, useShellDirtyNavigationGuard } from './DirtyNavigationGuard';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { MobileNavDrawer } from './MobileNavDrawer';
import { ModuleHeaderBar } from './ModuleHeaderBar';
import { WorkspaceFlashNotices } from './noticeMarkup';
import { isRecordHeaderSpec, RecordHeader } from './RecordHeader';
import type {
	ActionFeedbackDto,
	AppShellNavItem,
	AppShellProps,
	CommandPaletteItem,
	WorkspaceDefinitionDto,
	WorkspacePreferencesDto,
	WorkspaceSharedContext,
} from './types';
import { useShellKeyboardShortcuts } from './useShellKeyboardShortcuts';
import { WorkspaceTopbar } from './WorkspaceTopbar';

export type {
	WorkspaceStatItem,
	WorkspaceDefinitionDto,
	WorkspaceWidgetSize,
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
} from './types';
export { renderNoticeMarkup } from './noticeMarkup';
export { RecordHeader } from './RecordHeader';

const MAX_INLINE_WORKSPACES = 5;

export async function postWorkspacePreferenceAction(
	endpoint: string,
	payload: Record<string, unknown>
): Promise<WorkspacePreferencesDto | null> {
	const targetEndpoint = endpoint.trim() !== '' ? endpoint : '/_react/workspace-prefs';
	const result = await fetchGatewayJson<{ ok?: boolean; preferences?: WorkspacePreferencesDto }>(
		targetEndpoint,
		{
			method: 'POST',
			payload,
		}
	);
	if (result.ok && result.data?.preferences) {
		return result.data.preferences;
	}
	return null;
}

export function AppShell({
	workspace: propWorkspace,
	title,
	subtitle,
	icon,
	pills = [],
	navItems = [],
	sections = [],
	activeNav,
	activeId,
	recordHeader,
	headerActions,
	actions,
	feedback,
	onDismissFeedback,
	children,
}: AppShellProps): React.ReactElement {
	const resolvedHeaderActions = headerActions ?? actions;
	const resolvedActiveNav = activeNav ?? activeId;
	const hasRecordHeader = recordHeader !== undefined && recordHeader !== null && recordHeader !== false;
	const resolvedNavItems = useMemo<AppShellNavItem[]>(() => {
		if (navItems.length > 0) {
			return navItems;
		}
		if (sections.length > 0) {
			return sections.flatMap((sec) => sec.items || []);
		}
		return [];
	}, [navItems, sections]);

	const page = usePage<{
		workspace?: WorkspaceSharedContext;
		flash?: {
			messages?: string[];
			warnings?: string[];
			errors?: string[];
			feedback?: ActionFeedbackDto;
		};
	}>();

	const workspace = propWorkspace ?? page.props.workspace;
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

	const [dismissedFlash, setDismissedFlash] = useState<{
		errors: boolean;
		warnings: boolean;
		messages: boolean;
	}>({ errors: false, warnings: false, messages: false });

	useEffect(() => {
		setDismissedFlash({ errors: false, warnings: false, messages: false });
	}, [flash?.errors, flash?.warnings, flash?.messages]);

	const {
		themeMode,
		resolvedDark,
		themePreset,
		userThemePreset,
		siteDefaultThemePreset,
		presetPending,
		setThemeMode,
		setThemePreset,
	} = useTheme({
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
				(item) => item.id !== 'custom' || Boolean(workspace?.hasCustomThemeTokens) || themePreset === 'custom'
			),
		[workspace?.hasCustomThemeTokens, themePreset]
	);

	const activePresetMeta =
		availableThemePresets.find((item) => item.id === themePreset) ?? THEME_PRESETS[0];

	const rawWorkspaces = workspace?.workspaces;
	const workspaces = useMemo<WorkspaceDefinitionDto[]>(() => {
		const list: WorkspaceDefinitionDto[] = Array.isArray(rawWorkspaces)
			? rawWorkspaces
			: rawWorkspaces && typeof rawWorkspaces === 'object'
				? Object.values(rawWorkspaces)
				: [];
		const favOrder = new Map(favorites.map((id, idx) => [id.toLowerCase(), idx]));
		return [...list].sort((a, b) => {
			const aFav = favOrder.get(a.id.toLowerCase());
			const bFav = favOrder.get(b.id.toLowerCase());
			if (aFav !== undefined && bFav !== undefined) {
				return aFav - bFav;
			}
			if (aFav !== undefined) {
				return -1;
			}
			if (bFav !== undefined) {
				return 1;
			}
			if (a.order !== b.order) {
				return a.order - b.order;
			}
			return a.title.localeCompare(b.title);
		});
	}, [rawWorkspaces, favorites]);

	const activeWorkspace = workspace?.activeWorkspace;

	const isWorkspaceActive = (ws: WorkspaceDefinitionDto): boolean => {
		const wsProcess = ws.process || ws.processModule;
		const activeProcess = activeWorkspace?.process || activeWorkspace?.processModule;
		return (
			activeWorkspace?.id === ws.id ||
			(Boolean(wsProcess) && activeProcess === wsProcess)
		);
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
	const [shortcutsOpen, setShortcutsOpen] = useState(false);

	useEffect(() => {
		if (!moreMenuOpen) {
			return;
		}
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

	const recordHeaderSpec = isRecordHeaderSpec(recordHeader) ? recordHeader : null;
	useShellKeyboardShortcuts({
		enableShortcuts,
		commandOpen,
		shortcutsOpen,
		moreMenuOpen,
		showGlobalWorkspaceBar,
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
	});

	const filteredOverflow = useMemo(() => {
		const q = moreFilter.trim().toLowerCase();
		if (!q) {
			return overflowWorkspaces;
		}
		return workspaces.filter((ws) =>
			`${ws.title} ${ws.category} ${ws.description}`.toLowerCase().includes(q)
		);
	}, [overflowWorkspaces, workspaces, moreFilter]);

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
				onSetThemeMode: workspace ? setThemeMode : undefined,
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
			setThemeMode,
			enableShortcuts,
		]
	);

	useEffect(() => {
		setCommandActiveIndex(0);
	}, [commandQuery, commandOpen]);

	const executeCommandItem = (item: CommandPaletteItem | undefined) => {
		if (!item) {
			return;
		}
		setCommandOpen(false);
		if (item.onClick) {
			item.onClick();
			return;
		}
		const safeItemHref = sanitizeHref(item.href);
		if (!safeItemHref) {
			return;
		}
		if (item.isInertia && isInertiaAppActive()) {
			router.visit(safeItemHref);
		} else if (typeof window !== 'undefined') {
			window.location.href = safeItemHref;
		}
	};

	useEffect(() => {
		if (typeof document === 'undefined' || isEmbeddedIsland) {
			return;
		}
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
		if (!isClassicAdminShell) {
			return '';
		}
		const safeLauncher = sanitizeHref(workspace?.launcherUrl);
		if (!safeLauncher) {
			return '';
		}
		const currentPath =
			(typeof page.url === 'string' && page.url.trim() !== '' ? page.url : '') ||
			(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '') ||
			workspace?.activeWorkspace?.url ||
			safeLauncher;
		return (
			sanitizeHref(
				withWorkspaceShellUrl(currentPath, true, workspace?.adminUrl, workspace?.launcherUrl)
			) || safeLauncher
		);
	}, [isClassicAdminShell, page.url, workspace?.activeWorkspace?.url, workspace?.adminUrl, workspace?.launcherUrl]);

	const {
		hasDirtySchemaForm,
		pendingDirtyVisitUrl,
		dismissPendingVisit,
		confirmLeavePage,
	} = useShellDirtyNavigationGuard({
		pageUrl: page.url,
		isEmbeddedIsland,
	});

	const hasAncestorMain =
		typeof document !== 'undefined' &&
		(isEmbeddedIsland
			? Boolean(document.querySelector('main'))
			: isClassicAdminShell && Boolean(document.getElementById('app')?.closest('main')));
	const MainContainer: 'main' | 'div' = hasAncestorMain ? 'div' : 'main';

	return (
		<KeyboardShortcutsProvider enabled={enableShortcuts}>
			<div
				data-rw-app-shell={isEmbeddedIsland ? undefined : isClassicAdminShell ? 'admin' : ''}
				className={cn(
					showGlobalWorkspaceBar ? 'min-h-screen' : 'min-h-0 flex-1',
					'bg-background text-foreground flex flex-col'
				)}
			>
				<Head title={title} />

				{showGlobalWorkspaceBar ? (
					<WorkspaceTopbar
						workspace={workspace}
						returnLabel={returnLabel}
						workspaces={workspaces}
						primaryWorkspaces={primaryWorkspaces}
						overflowWorkspaces={overflowWorkspaces}
						filteredOverflow={filteredOverflow}
						activeWorkspace={activeWorkspace}
						favorites={favorites}
						isWorkspaceActive={isWorkspaceActive}
						moreMenuOpen={moreMenuOpen}
						setMoreMenuOpen={setMoreMenuOpen}
						moreFilter={moreFilter}
						setMoreFilter={setMoreFilter}
						moreMenuRef={moreMenuRef}
						toggleFavoriteWorkspace={toggleFavoriteWorkspace}
						onOpenMobileDrawer={() => setMobileDrawerOpen(true)}
						onOpenCommandPalette={() => {
							setCommandOpen(true);
							setCommandQuery('');
						}}
						onOpenShortcuts={() => setShortcutsOpen(true)}
						themeMode={themeMode}
						resolvedDark={resolvedDark}
						themePreset={themePreset}
						userThemePreset={userThemePreset}
						siteDefaultThemePreset={siteDefaultThemePreset}
						presetPending={presetPending}
						availableThemePresets={availableThemePresets}
						activePresetMeta={activePresetMeta}
						setThemeMode={setThemeMode}
						setThemePreset={setThemePreset}
					/>
				) : null}

				{showGlobalWorkspaceBar ? (
					<MobileNavDrawer
						open={mobileDrawerOpen}
						onOpenChange={setMobileDrawerOpen}
						title={title}
						returnLabel={returnLabel}
						workspace={workspace}
						resolvedNavItems={resolvedNavItems}
						resolvedActiveNav={resolvedActiveNav}
						workspaces={workspaces}
						favorites={favorites}
						isWorkspaceActive={isWorkspaceActive}
						toggleFavoriteWorkspace={toggleFavoriteWorkspace}
					/>
				) : null}

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
						/>
						<KeyboardShortcutsDialog
							open={shortcutsOpen}
							onOpenChange={setShortcutsOpen}
						/>
					</>
				) : null}

			<DirtyNavigationConfirmDialog
				pendingUrl={pendingDirtyVisitUrl}
				onDismiss={dismissPendingVisit}
				onConfirmLeave={confirmLeavePage}
			/>

			<MainContainer data-rw-app-main="" className="flex-1 flex flex-col">
				<ModuleHeaderBar
					title={title}
					subtitle={subtitle}
					icon={icon}
					pills={pills}
					isEmbeddedIsland={isEmbeddedIsland}
					hasRecordHeader={hasRecordHeader}
					resolvedHeaderActions={resolvedHeaderActions}
					isClassicAdminShell={isClassicAdminShell}
					enableShortcuts={enableShortcuts}
					openInWorkspaceHref={openInWorkspaceHref}
					onOpenCommandPalette={() => {
						setCommandQuery('');
						setCommandActiveIndex(0);
						setCommandOpen(true);
					}}
					resolvedNavItems={resolvedNavItems}
					resolvedActiveNav={resolvedActiveNav}
				/>

				<div
					data-rw-workspace-body=""
					className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 sm:py-6 space-y-5"
				>
					{hasRecordHeader
						? isRecordHeaderSpec(recordHeader)
							? (
									<RecordHeader
										{...recordHeader}
										dirty={recordHeader.dirty ?? hasDirtySchemaForm}
									/>
								)
							: recordHeader
						: null}

					<WorkspaceFlashNotices
						activeFeedback={activeFeedback}
						onDismissFeedback={() => {
							if (onDismissFeedback) {
								onDismissFeedback();
							} else {
								setDismissedFeedback(true);
							}
						}}
						flash={flash}
						dismissedFlash={dismissedFlash}
						onDismissFlash={(bucket) =>
							setDismissedFlash((prev) => ({ ...prev, [bucket]: true }))
						}
					/>

					{children}
				</div>
			</MainContainer>
			</div>
		</KeyboardShortcutsProvider>
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
