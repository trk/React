import React from 'react';
import { SafeLink as Link, withWorkspaceShellUrl } from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref, sanitizeImageSrc } from '../lib/utils';
import type { ThemeMode, ThemePresetId, ThemePresetMeta } from '../hooks';
import {
	Badge,
	Input,
	Menu,
	MenuContent,
	MenuItem,
	MenuSeparator,
	MenuTrigger,
} from '../ui';
import type { WorkspaceDefinitionDto, WorkspaceSharedContext } from './types';

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
}

const THEME_MODES: Array<{ id: ThemeMode; icon: string; labelKey: string; defaultLabel: string }> = [
	{ id: 'light', icon: 'sun', labelKey: 'shell.themeLight', defaultLabel: 'Light' },
	{ id: 'dark', icon: 'moon', labelKey: 'shell.themeDark', defaultLabel: 'Dark' },
	{ id: 'system', icon: 'monitor', labelKey: 'shell.themeSystem', defaultLabel: 'System' },
];

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
}: WorkspaceTopbarProps): React.ReactElement {
	const user = workspace?.user;
	const displayName = (user?.label || user?.name || '').trim() || 'User';
	const avatarSrc = sanitizeImageSrc(user?.avatarUrl);
	const avatarInitial = displayName.charAt(0).toUpperCase();
	const activeSwatch = activePresetMeta
		? resolvedDark && activePresetMeta.darkSwatch
			? activePresetMeta.darkSwatch
			: activePresetMeta.swatch
		: '';
	const viewSiteHref = sanitizeHref(user?.viewSiteUrl || '/') || '/';
	const profileHref = sanitizeHref(user?.profileUrl);
	const logoutHref = sanitizeHref(
		user?.logoutUrl || (workspace?.adminUrl ? `${workspace.adminUrl.replace(/\/+$/, '')}/login/logout/` : '')
	);
	const shortcutsEnabled = workspace?.enableKeyboardShortcuts !== false;

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
						className="inline-flex size-8 pointer-coarse:size-10 items-center justify-center rounded-md border border-masthead-border bg-input-surface text-masthead-foreground transition-colors hover:bg-muted hover:text-masthead-active lg:hidden cursor-pointer"
					>
						<DynamicIcon name="menu" className="size-4" />
					</button>

					<a
						href={sanitizeHref(workspace?.adminUrl) || '/processwire/'}
						data-rw-admin-return
						className="hidden lg:inline-flex h-8 items-center gap-1.5 rounded-md border border-masthead-border bg-input-surface px-2.5 text-xs font-medium text-masthead-foreground transition-colors hover:bg-muted hover:text-masthead-active shrink-0"
						title={t('shell.returnToTarget', { target: returnLabel }, 'Return to {target}')}
					>
						<DynamicIcon name="arrow-left" className="size-3.5" />
						<span>{returnLabel}</span>
					</a>

					{sanitizeHref(workspace?.launcherUrl) ? (
						<Link
							href={sanitizeHref(workspace?.launcherUrl)}
							className={cn(
								'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors shrink-0',
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
										'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap',
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
										<Link key={ws.id} href={safeWsUrl} className={linkClassName}>
											{content}
										</Link>
									) : (
										<a key={ws.id} href={safeWsUrl} className={linkClassName}>
											{content}
										</a>
									);
								})}

								{overflowWorkspaces.length > 0 ? (
									<div className="relative" ref={moreMenuRef}>
										<button
											type="button"
											onClick={() => {
												setMoreMenuOpen((prev) => !prev);
												setMoreFilter('');
											}}
											aria-expanded={moreMenuOpen}
											data-rw-more-workspaces-trigger
											className={cn(
												'inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors cursor-pointer',
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
																			onClick={() => setMoreMenuOpen(false)}
																			className={cn(
																				'flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors min-w-0',
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
																			className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted text-foreground min-w-0"
																		>
																			<DynamicIcon name={ws.icon} className="size-3.5 shrink-0 text-primary" />
																			<span className="truncate font-medium">{ws.title}</span>
																		</a>
																	)}
																	<button
																		type="button"
																		onClick={(e) => toggleFavoriteWorkspace(ws.id, e)}
																		aria-label={isFav ? 'Remove from favorites' : 'Pin to favorites'}
																		title={isFav ? 'Remove from favorites' : 'Pin to favorites'}
																		className={cn(
																			'inline-flex size-7 items-center justify-center rounded-md transition-colors cursor-pointer shrink-0',
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
							className="inline-flex h-8 items-center gap-2 rounded-md border border-masthead-border bg-input-surface px-2.5 text-xs text-masthead-foreground transition-colors hover:bg-muted hover:text-masthead-active cursor-pointer"
							title={t('shell.quickSwitcherShortcut', 'Quick Switcher (Cmd/Ctrl+K)')}
						>
							<DynamicIcon name="search" className="size-3.5" />
							<span className="hidden xl:inline">{t('shell.quickJump', 'Quick Jump')}</span>
							<kbd className="hidden sm:inline-block rounded border border-border bg-muted px-1 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
								⌘K
							</kbd>
						</button>
					) : null}

					{user ? (
						<Menu modal={false}>
							<MenuTrigger
								data-rw-user-menu-trigger=""
								aria-label={
									displayName
										? `${displayName} — ${t('shell.userMenu', 'User account menu')}`
										: t('shell.userMenu', 'User account menu')
								}
								className="inline-flex h-8 items-center gap-2 rounded-md border border-masthead-border bg-input-surface px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
							>
								<span
									aria-hidden="true"
									className="relative inline-flex size-5.5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-[11px] font-semibold text-primary-ink ring-1 ring-border"
								>
									{avatarSrc ? (
										<img src={avatarSrc} alt="" className="size-full object-cover" />
									) : (
										<DynamicIcon name={user.avatarIcon || 'user'} className="size-3.5" aria-hidden="true" />
									)}
								</span>
								<span className="hidden sm:inline max-w-32 truncate">{displayName}</span>
								{activeSwatch ? (
									<span
										aria-hidden="true"
										className="hidden md:inline-block size-2 shrink-0 rounded-full border border-border"
										style={{ backgroundColor: activeSwatch }}
									/>
								) : null}
								<DynamicIcon name="chevron-down" className="size-3 text-muted-foreground" aria-hidden="true" />
							</MenuTrigger>

							<MenuContent align="end" className="w-72 max-w-[calc(100vw-1rem)] p-1.5">
								{/* User identity */}
								<div className="flex items-center gap-2.5 rounded-md px-2 py-2">
									<span className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-xs font-semibold text-primary-ink ring-1 ring-border">
										{avatarSrc ? (
											<img src={avatarSrc} alt="" className="size-full object-cover" />
										) : (
											<span>{avatarInitial}</span>
										)}
									</span>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-1.5">
											<span className="truncate text-xs font-semibold text-popover-foreground">
												{displayName}
											</span>
											{user.isSuperuser ? (
												<DynamicIcon
													name="shield"
													className="size-3 shrink-0 text-primary"
													aria-hidden="true"
												/>
											) : null}
										</div>
										{user.email ? (
											<div className="truncate text-[11px] text-muted-foreground">{user.email}</div>
										) : null}
									</div>
								</div>

								<MenuSeparator />

								{/* Unified Theme Section (Light / Dark / System + Color Schemes) */}
								<div data-rw-theme-section="" className="space-y-2.5 px-2 py-2">
									<div className="flex items-center justify-between gap-2">
										<span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
											{t('shell.theme', 'Theme')}
										</span>
										{userThemePreset !== '' && siteDefaultThemePreset ? (
											<button
												type="button"
												data-rw-theme-preset-reset=""
												disabled={presetPending}
												onClick={() => {
													void setThemePreset('');
												}}
												className="text-[11px] font-medium text-primary-ink hover:underline disabled:opacity-50 cursor-pointer"
											>
												{t('shell.themeUseSiteDefault', 'Use site default')}
											</button>
										) : (
											<span className="text-[11px] text-muted-foreground">
												{t('shell.themeSiteDefaultBadge', 'Site default')}
											</span>
										)}
									</div>

									<div
										role="group"
										aria-label={t('shell.themeMode', 'Appearance')}
										className="grid grid-cols-3 gap-1 rounded-md border border-border bg-muted/50 p-0.5"
									>
										{THEME_MODES.map((m) => {
											const isActive = themeMode === m.id;
											return (
												<button
													key={m.id}
													type="button"
													data-rw-theme-mode-option={m.id}
													aria-pressed={isActive}
													onClick={() => setThemeMode(m.id)}
													className={cn(
														'inline-flex h-7 items-center justify-center gap-1 rounded px-2 text-[11px] font-medium transition-colors cursor-pointer',
														isActive
															? 'bg-primary text-primary-foreground shadow-2xs'
															: 'text-muted-foreground hover:bg-card hover:text-foreground'
													)}
												>
													<DynamicIcon name={m.icon} className="size-3 shrink-0" aria-hidden="true" />
													<span>{t(m.labelKey, m.defaultLabel)}</span>
												</button>
											);
										})}
									</div>

									<div className="space-y-1">
										<div className="text-[11px] font-medium text-muted-foreground">
											{t('shell.colorScheme', 'Color Scheme')}
										</div>
										<div className="grid grid-cols-2 gap-1">
											{availableThemePresets.map((preset) => {
												const isSelected = preset.id === themePreset;
												const swatchColor =
													resolvedDark && preset.darkSwatch ? preset.darkSwatch : preset.swatch;
												return (
													<button
														key={preset.id}
														type="button"
														disabled={presetPending}
														aria-pressed={isSelected}
														data-rw-theme-preset-option={preset.id}
														onClick={() => {
															void setThemePreset(preset.id);
														}}
														className={cn(
															'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors disabled:opacity-50 cursor-pointer',
															isSelected
																? 'border-primary/45 bg-primary/12 text-primary-ink font-semibold'
																: 'border-transparent bg-muted/35 text-popover-foreground hover:border-border hover:bg-muted'
														)}
													>
														<span
															aria-hidden="true"
															className="size-2.5 shrink-0 rounded-full border border-border"
															style={{ backgroundColor: swatchColor }}
														/>
														<span className="flex-1 truncate">
															{t(preset.labelKey, preset.defaultLabel)}
														</span>
														{isSelected ? (
															<DynamicIcon
																name="check"
																className="size-3 shrink-0 text-primary-ink"
																aria-hidden="true"
															/>
														) : null}
													</button>
												);
											})}
										</div>
									</div>
								</div>

								{shortcutsEnabled && onOpenShortcuts ? (
									<>
										<MenuSeparator />
										<MenuItem
											data-rw-shortcuts-trigger=""
											label={t('shell.keyboardShortcuts', 'Keyboard shortcuts')}
											onClick={() => onOpenShortcuts()}
										>
											<DynamicIcon name="keyboard" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
											<span className="flex-1 truncate">
												{t('shell.keyboardShortcuts', 'Keyboard shortcuts')}
											</span>
											<kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
												?
											</kbd>
										</MenuItem>
									</>
								) : null}

								<MenuSeparator />

								{/* ProcessWire Account Navigation Items (View site / Profile / Logout) */}
								<MenuItem
									data-rw-user-view-site=""
									label={t('shell.viewSite', 'View site')}
									render={<a href={viewSiteHref} target="_top" className="no-underline" />}
								>
									<DynamicIcon name="eye" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
									<span className="flex-1 truncate">{t('shell.viewSite', 'View site')}</span>
								</MenuItem>

								{profileHref ? (
									<MenuItem
										data-rw-user-profile=""
										label={t('shell.profile', 'Profile')}
										render={<a href={profileHref} className="no-underline" />}
									>
										<DynamicIcon name="user" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
										<span className="flex-1 truncate">{t('shell.profile', 'Profile')}</span>
									</MenuItem>
								) : null}

								{logoutHref ? (
									<MenuItem
										data-rw-user-logout=""
										variant="danger"
										label={t('shell.logout', 'Logout')}
										render={<a href={logoutHref} target="_top" className="no-underline" />}
									>
										<DynamicIcon name="power" className="size-3.5 shrink-0" aria-hidden="true" />
										<span className="flex-1 truncate">{t('shell.logout', 'Logout')}</span>
									</MenuItem>
								) : null}
							</MenuContent>
						</Menu>
					) : null}
				</div>
			</div>
		</header>
	);
}
