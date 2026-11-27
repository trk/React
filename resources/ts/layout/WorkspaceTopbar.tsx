import React from 'react';
import { SafeLink as Link, withWorkspaceShellUrl } from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref, shouldIgnoreEscapeEvent } from '../lib/utils';
import type { ThemeMode, ThemePresetId, ThemePresetMeta } from '../hooks';
import { Badge, Input } from '../ui';
import type {
	ShellLayoutDescriptorDto,
	ShellLayoutId,
	WorkspaceDefinitionDto,
	WorkspaceSharedContext,
} from './types';
import { UserAccountMenu } from './UserAccountMenu';

export interface WorkspaceTopbarProps {
	workspace?: WorkspaceSharedContext;
	returnLabel: string;
	workspaces: WorkspaceDefinitionDto[];
	primaryWorkspaces: WorkspaceDefinitionDto[];
	overflowWorkspaces: WorkspaceDefinitionDto[];
	filteredOverflow: WorkspaceDefinitionDto[];
	activeWorkspace?: WorkspaceDefinitionDto | null;
	favorites: string[];
	isWorkspaceActive: (ws: WorkspaceDefinitionDto) => boolean;
	moreMenuOpen: boolean;
	setMoreMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
	moreFilter: string;
	setMoreFilter: (next: string) => void;
	moreMenuRef: React.RefObject<HTMLDivElement | null>;
	toggleFavoriteWorkspace: (workspaceId: string, e?: React.MouseEvent) => void;
	onOpenMobileDrawer: () => void;
	onOpenCommandPalette: () => void;
	onOpenShortcuts?: () => void;
	themeMode: ThemeMode;
	resolvedDark: boolean;
	themePreset: ThemePresetId;
	userThemePreset: string;
	siteDefaultThemePreset: ThemePresetId;
	presetPending: boolean;
	availableThemePresets: ThemePresetMeta[];
	activePresetMeta?: ThemePresetMeta;
	setThemeMode: (mode: ThemeMode) => void;
	setThemePreset: (preset: ThemePresetId | '') => Promise<boolean> | void;
	shellLayout?: ShellLayoutId;
	userShellLayout?: string;
	siteDefaultShellLayout?: ShellLayoutId;
	availableShellLayouts?: ShellLayoutDescriptorDto[];
	layoutPending?: boolean;
	setShellLayout?: (nextLayout: string) => Promise<boolean> | void;
}

export function WorkspaceTopbar({
	workspace,
	returnLabel,
	workspaces,
	primaryWorkspaces,
	overflowWorkspaces,
	filteredOverflow,
	activeWorkspace,
	favorites,
	isWorkspaceActive,
	moreMenuOpen,
	setMoreMenuOpen,
	moreFilter,
	setMoreFilter,
	moreMenuRef,
	toggleFavoriteWorkspace,
	onOpenMobileDrawer,
	onOpenCommandPalette,
	onOpenShortcuts,
	themeMode,
	resolvedDark,
	themePreset,
	userThemePreset,
	siteDefaultThemePreset,
	presetPending,
	availableThemePresets,
	activePresetMeta,
	setThemeMode,
	setThemePreset,
	shellLayout,
	userShellLayout,
	siteDefaultShellLayout,
	availableShellLayouts,
	layoutPending,
	setShellLayout,
}: WorkspaceTopbarProps): React.ReactElement {
	const shortcutsEnabled = workspace?.enableKeyboardShortcuts !== false;
	const moreMenuId = React.useId();
	const moreTriggerRef = React.useRef<HTMLButtonElement | null>(null);

	React.useEffect(() => {
		if (!moreMenuOpen) {
			return;
		}
		const onKeyDown = (e: KeyboardEvent) => {
			if (shouldIgnoreEscapeEvent(e, moreMenuRef.current)) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			setMoreMenuOpen(false);
			moreTriggerRef.current?.focus();
		};
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	}, [moreMenuOpen, moreMenuRef, setMoreMenuOpen]);

	return (
		<header
			data-rw-global-bar=""
			className="sticky top-0 z-30 border-b border-masthead-border bg-masthead/95 text-masthead-foreground backdrop-blur-xs"
		>
			<div className="mx-auto flex h-13 max-w-[1600px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
				<div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
					{/* Mobile Hamburger Drawer Button */}
					<button
						type="button"
						onClick={onOpenMobileDrawer}
						aria-label={t('shell.openNavigationMenu', 'Open workspace navigation menu')}
						data-rw-mobile-menu-trigger
						className="inline-flex size-8 pointer-coarse:size-10 items-center justify-center rounded-md border border-masthead-border bg-input-surface text-masthead-foreground transition-colors hover:bg-muted hover:text-masthead-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden cursor-pointer"
					>
						<DynamicIcon name="menu" className="size-4" />
					</button>

					<a
						href={sanitizeHref(workspace?.adminUrl) || '/processwire/'}
						data-rw-admin-return
						className="hidden lg:inline-flex h-8 items-center gap-1.5 rounded-md border border-masthead-border bg-input-surface px-2.5 text-xs font-medium text-masthead-foreground transition-colors hover:bg-muted hover:text-masthead-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
						title={t('shell.returnToTarget', { target: returnLabel }, 'Return to {target}')}
					>
						<DynamicIcon name="arrow-left" className="size-3.5" />
						<span>{returnLabel}</span>
					</a>

					{sanitizeHref(workspace?.launcherUrl) ? (
						<Link
							href={sanitizeHref(workspace?.launcherUrl)}
							className={cn(
								'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0',
								!activeWorkspace
									? 'bg-primary/12 text-primary-ink font-semibold'
									: 'text-masthead-foreground hover:bg-muted hover:text-masthead-active'
							)}
							title={t('shell.workspaceDashboard', 'Workspace Dashboard')}
						>
							<DynamicIcon name="layout-grid" className="size-3.5 text-primary" />
							<span className="hidden sm:inline">{t('shell.workspace', 'Workspace')}</span>
						</Link>
					) : null}

					{workspaces.length > 0 ? (
						<>
							<span className="hidden lg:inline text-masthead-border select-none">/</span>
							<nav
								aria-label={t('shell.workspaces', 'Workspaces')}
								className="hidden lg:flex items-center gap-1 min-w-0"
							>
								{primaryWorkspaces.map((ws) => {
									const isCurrent = isWorkspaceActive(ws);
									const isFav = favorites.includes(ws.id.toLowerCase());
									const safeWsUrl = sanitizeHref(withWorkspaceShellUrl(ws.url, true)) || '#';
									const linkClassName = cn(
										'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
										isCurrent
											? 'bg-primary/12 text-primary-ink font-semibold'
											: 'text-masthead-foreground hover:bg-muted hover:text-masthead-active'
									);
									const content = (
										<>
											<DynamicIcon name={ws.icon} className="size-3.5" />
											<span>{ws.title}</span>
											{isFav ? (
												<DynamicIcon
													name="star"
													className="size-2.5 text-warning fill-current opacity-85"
												/>
											) : null}
										</>
									);
									return ws.component ? (
										<Link
											key={ws.id}
											href={safeWsUrl}
											aria-current={isCurrent ? 'page' : undefined}
											className={linkClassName}
										>
											{content}
										</Link>
									) : (
										<a
											key={ws.id}
											href={safeWsUrl}
											aria-current={isCurrent ? 'page' : undefined}
											className={linkClassName}
										>
											{content}
										</a>
									);
								})}

								{overflowWorkspaces.length > 0 ? (
									<div className="relative" ref={moreMenuRef}>
										<button
											ref={moreTriggerRef}
											type="button"
											onClick={() => {
												setMoreMenuOpen((prev) => !prev);
												setMoreFilter('');
											}}
											aria-expanded={moreMenuOpen}
											aria-controls={moreMenuOpen ? moreMenuId : undefined}
											data-rw-more-workspaces-trigger
											className={cn(
												'inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
												moreMenuOpen
													? 'border-masthead-border bg-muted text-masthead-active'
													: 'border-transparent bg-transparent text-masthead-foreground hover:border-masthead-border hover:bg-input-surface hover:text-masthead-active'
											)}
										>
											<span>{t('shell.more', 'More')}</span>
											<Badge variant="secondary" mono className="px-1 py-0 text-[11px]">
												+{overflowWorkspaces.length}
											</Badge>
											<DynamicIcon name="chevron-down" className="size-3" />
										</button>

										{moreMenuOpen ? (
											<div
												id={moreMenuId}
												data-rw-more-workspaces-menu
												className="absolute left-0 top-full mt-1.5 w-72 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg z-50 space-y-2"
											>
												<div className="relative">
													<DynamicIcon
														name="search"
														className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
													/>
													<Input
														type="search"
														aria-label={t('shell.findWorkspace', 'Find workspace...')}
														value={moreFilter}
														onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMoreFilter(e.target.value)}
														placeholder={t('shell.findWorkspace', 'Find workspace...')}
														className="h-8 pl-8 text-xs"
													/>
												</div>
												<div className="max-h-64 overflow-y-auto divide-y divide-border/40">
													{filteredOverflow.length === 0 ? (
														<p className="py-3 text-center text-xs text-muted-foreground">
															{t('shell.noMatchingWorkspaces', 'No matching workspaces')}
														</p>
													) : (
														filteredOverflow.map((ws) => {
															const isFav = favorites.includes(ws.id.toLowerCase());
															const isCurrent = isWorkspaceActive(ws);
															const safeOverflowWsUrl = sanitizeHref(withWorkspaceShellUrl(ws.url, true)) || '#';
															return (
																<div
																	key={ws.id}
																	className="flex items-center justify-between gap-1 py-1"
																>
																	{ws.component ? (
																		<Link
																			href={safeOverflowWsUrl}
																			aria-current={isCurrent ? 'page' : undefined}
																			onClick={() => setMoreMenuOpen(false)}
																			className={cn(
																				'flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-0',
																				isCurrent
																					? 'bg-primary/12 text-primary-ink font-semibold'
																					: 'hover:bg-muted text-foreground'
																			)}
																		>
																			<DynamicIcon name={ws.icon} className="size-3.5 shrink-0 text-primary" />
																			<div className="min-w-0 flex-1">
																				<div className="truncate font-medium">{ws.title}</div>
																				{ws.category ? (
																					<div className="truncate text-[11px] text-muted-foreground">
																						{ws.category}
																					</div>
																				) : null}
																			</div>
																		</Link>
																	) : (
																		<a
																			href={safeOverflowWsUrl}
																			aria-current={isCurrent ? 'page' : undefined}
																			className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-0"
																		>
																			<DynamicIcon name={ws.icon} className="size-3.5 shrink-0 text-primary" />
																			<span className="truncate font-medium">{ws.title}</span>
																		</a>
																	)}
																	<button
																		type="button"
																		onClick={(e) => toggleFavoriteWorkspace(ws.id, e)}
																		aria-label={
																			isFav
																				? t('launcher.unpinWorkspace', { title: ws.title }, `Unpin ${ws.title}`)
																				: t('launcher.pinWorkspace', { title: ws.title }, `Pin ${ws.title}`)
																		}
																		title={
																			isFav
																				? t('launcher.unpinFromTopBar', 'Unpin from top bar')
																				: t('launcher.pinToTopBar', 'Pin to top bar')
																		}
																		className={cn(
																			'inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer shrink-0',
																			isFav
																				? 'text-warning hover:bg-muted'
																				: 'text-muted-foreground/50 hover:bg-muted hover:text-foreground'
																		)}
																	>
																		<DynamicIcon
																			name="star"
																			className={cn('size-3.5', isFav && 'fill-current')}
																		/>
																	</button>
																</div>
															);
														})
													)}
												</div>
											</div>
										) : null}
									</div>
								) : null}
							</nav>
						</>
					) : null}
				</div>

				<div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
					{shortcutsEnabled ? (
						<button
							type="button"
							onClick={onOpenCommandPalette}
							data-rw-command-trigger
							className="inline-flex h-8 items-center gap-2 rounded-md border border-masthead-border bg-input-surface px-2.5 text-xs text-masthead-foreground transition-colors hover:bg-muted hover:text-masthead-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
							title={t('shell.quickSwitcherShortcut', 'Quick Switcher (Cmd/Ctrl+K)')}
						>
							<DynamicIcon name="search" className="size-3.5" aria-hidden="true" />
							<span className="hidden xl:inline">{t('shell.quickJump', 'Quick Jump')}</span>
							<span className="sr-only xl:hidden">{t('shell.quickJump', 'Quick Jump')}</span>
							<kbd
								aria-hidden="true"
								className="hidden sm:inline-block rounded border border-border bg-muted px-1 py-0.5 font-mono text-[11px] leading-none text-muted-foreground"
							>
								⌘K
							</kbd>
						</button>
					) : null}

					<UserAccountMenu
						variant="topbar"
						workspace={workspace}
						returnLabel={returnLabel}
						shortcutsEnabled={shortcutsEnabled}
						onOpenShortcuts={onOpenShortcuts}
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
						shellLayout={shellLayout}
						userShellLayout={userShellLayout}
						siteDefaultShellLayout={siteDefaultShellLayout}
						availableShellLayouts={availableShellLayouts}
						layoutPending={layoutPending}
						setShellLayout={setShellLayout}
					/>
				</div>
			</div>
		</header>
	);
}
