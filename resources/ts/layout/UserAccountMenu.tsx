import React from 'react';
import type { ThemeMode, ThemePresetId, ThemePresetMeta } from '../hooks';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref, sanitizeImageSrc } from '../lib/utils';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui';
import type { ShellLayoutDescriptorDto, ShellLayoutId, WorkspaceSharedContext } from './types';

export interface UserAccountMenuProps {
	workspace?: WorkspaceSharedContext;
	returnLabel?: string;
	variant?: 'topbar' | 'sidebar' | 'sidebar-collapsed';
	compact?: boolean;
	inSidebar?: boolean;
	onNavigate?: () => void;
	shortcutsEnabled?: boolean;
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

const THEME_MODES: Array<{ id: ThemeMode; icon: string; labelKey: string; defaultLabel: string }> = [
	{ id: 'light', icon: 'sun', labelKey: 'shell.themeLight', defaultLabel: 'Light' },
	{ id: 'dark', icon: 'moon', labelKey: 'shell.themeDark', defaultLabel: 'Dark' },
	{ id: 'system', icon: 'device-desktop', labelKey: 'shell.themeSystem', defaultLabel: 'System' },
];

export function UserAccountMenu({
	workspace,
	returnLabel,
	variant = 'topbar',
	compact = false,
	inSidebar = false,
	onNavigate,
	shortcutsEnabled: propShortcutsEnabled,
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
	layoutPending = false,
	setShellLayout,
}: UserAccountMenuProps): React.ReactElement | null {
	const user = workspace?.user;
	if (!user) {
		return null;
	}

	const displayName = (user.label || user.name || '').trim() || 'User';
	const avatarSrc = sanitizeImageSrc(user.avatarUrl);
	const avatarInitial = displayName.charAt(0).toUpperCase() || 'U';
	const activeSwatch = activePresetMeta
		? resolvedDark && activePresetMeta.darkSwatch
			? activePresetMeta.darkSwatch
			: activePresetMeta.swatch
		: '';
	const viewSiteHref = sanitizeHref(user.viewSiteUrl || '/') || '/';
	const profileHref = sanitizeHref(user.profileUrl);
	const adminHref = sanitizeHref(workspace?.adminUrl);
	const logoutHref = sanitizeHref(
		user.logoutUrl || (workspace?.adminUrl ? `${workspace.adminUrl.replace(/\/+$/, '')}/login/logout/` : '')
	);
	const resolvedReturnLabel = returnLabel || workspace?.adminReturnLabel || t('shell.returnToAdmin', 'Panel');
	const shortcutsEnabled = propShortcutsEnabled ?? workspace?.enableKeyboardShortcuts !== false;

	const resolvedShellLayouts = availableShellLayouts ?? workspace?.availableShellLayouts ?? [];
	const effectiveShellLayout = shellLayout ?? workspace?.shellLayout ?? 'topbar';
	const effectiveUserShellLayout = userShellLayout ?? workspace?.userShellLayout ?? '';
	const effectiveSiteDefaultLayout = siteDefaultShellLayout ?? workspace?.siteDefaultShellLayout ?? 'topbar';
	const showLayoutSection = resolvedShellLayouts.length > 1 && Boolean(setShellLayout);

	const subtitleText =
		user.email ||
		(user.isSuperuser
			? t('shell.superuser', 'Superuser')
			: user.roles?.[0] || t('shell.standardUser', 'Standard'));

	const menuSide =
		variant === 'sidebar-collapsed' ? 'right' : variant === 'sidebar' ? 'top' : 'bottom';
	const menuAlign =
		variant === 'sidebar-collapsed' ? 'end' : variant === 'sidebar' ? 'start' : 'end';
	const menuSideOffset = variant === 'topbar' ? 6 : 8;

	const renderTrigger = () => {
		if (variant === 'sidebar-collapsed') {
			return (
				<MenuTrigger
					data-rw-user-menu-trigger=""
					title={`${displayName} — ${t('shell.userMenu', 'User account menu')}`}
					className="mx-auto flex size-9 items-center justify-center rounded-lg border border-transparent text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring cursor-pointer"
				>
					<span
						aria-hidden={avatarSrc ? true : undefined}
						className="relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/15 text-xs font-semibold text-primary-ink ring-1 ring-border"
					>
						{avatarSrc ? (
							<img src={avatarSrc} alt="" className="size-full object-cover" />
						) : (
							<span>{avatarInitial}</span>
						)}
					</span>
					{' '}
					<span className="sr-only">
						{`${displayName} — ${t('shell.userMenu', 'User account menu')}`}
					</span>
				</MenuTrigger>
			);
		}

		if (variant === 'sidebar') {
			return (
				<MenuTrigger
					data-rw-user-menu-trigger=""
					className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring cursor-pointer"
				>
					<span
						aria-hidden={avatarSrc ? true : undefined}
						className="relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/15 text-xs font-semibold text-primary-ink ring-1 ring-border"
					>
						{avatarSrc ? (
							<img src={avatarSrc} alt="" className="size-full object-cover" />
						) : (
							<span>{avatarInitial}</span>
						)}
					</span>
					{' '}
					<span className="block min-w-0 flex-1">
						<span className="flex items-center gap-1.5">
							<span className="truncate text-xs font-semibold text-sidebar-foreground">
								{displayName}
							</span>
							{activeSwatch ? (
								<span
									aria-hidden="true"
									className="inline-block size-2 shrink-0 rounded-full border border-border"
									style={{ backgroundColor: activeSwatch }}
								/>
							) : null}
						</span>
						{' '}
						<span className="block truncate text-[11px] text-muted-foreground">{subtitleText}</span>
					</span>
					<DynamicIcon name="selector" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span className="sr-only">{` — ${t('shell.userMenu', 'User account menu')}`}</span>
				</MenuTrigger>
			);
		}

		return (
			<MenuTrigger
				data-rw-user-menu-trigger=""
				className="inline-flex h-8 items-center gap-2 rounded-md border border-masthead-border bg-input-surface px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
			>
				<span
					aria-hidden={avatarSrc ? true : undefined}
					className="relative inline-flex size-5.5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-[11px] font-semibold text-primary-ink ring-1 ring-border"
				>
					{avatarSrc ? (
						<img src={avatarSrc} alt="" className="size-full object-cover" />
					) : (
						<span>{avatarInitial}</span>
					)}
				</span>
				{' '}
				{compact ? (
					<span className="sr-only">{displayName}</span>
				) : (
					<>
						<span className="hidden sm:inline max-w-32 truncate">{displayName}</span>
						<span className="sm:hidden sr-only">{displayName}</span>
					</>
				)}
				{activeSwatch ? (
					<span
						aria-hidden="true"
						className="hidden md:inline-block size-2 shrink-0 rounded-full border border-border"
						style={{ backgroundColor: activeSwatch }}
					/>
				) : null}
				<DynamicIcon name="chevron-down" className="size-3 text-muted-foreground" aria-hidden="true" />
				<span className="sr-only">{` — ${t('shell.userMenu', 'User account menu')}`}</span>
			</MenuTrigger>
		);
	};

	return (
		<Menu modal={false}>
			{renderTrigger()}

			<MenuContent
				data-rw-user-menu=""
				side={menuSide}
				align={menuAlign}
				sideOffset={menuSideOffset}
				className="w-72 max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1.5rem)] overflow-y-auto p-1.5"
			>
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
											(preset.id === 'native' || preset.id === 'custom') && 'col-span-2',
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

				{/* Pluggable Panel Layout Selector */}
				{showLayoutSection ? (
					<>
						<MenuSeparator />
						<div data-rw-layout-section="" className="space-y-2 px-2 py-2">
							<div className="flex items-center justify-between gap-2">
								<span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
									{t('shell.panelLayout', 'Panel Layout')}
								</span>
								{effectiveUserShellLayout !== '' && effectiveSiteDefaultLayout ? (
									<button
										type="button"
										data-rw-shell-layout-reset=""
										disabled={layoutPending}
										onClick={() => {
											void setShellLayout?.('');
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
								aria-label={t('shell.panelLayout', 'Panel Layout')}
								className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted/50 p-0.5"
							>
								{resolvedShellLayouts.map((layout) => {
									const isActive = effectiveShellLayout === layout.id;
									const layoutLabel = layout.labelKey
										? t(layout.labelKey, layout.label)
										: layout.label;
									const layoutDesc = layout.descriptionKey
										? t(layout.descriptionKey, layout.description || layoutLabel)
										: layout.description;
									return (
										<button
											key={layout.id}
											type="button"
											disabled={layoutPending}
											data-rw-shell-layout-option={layout.id}
											aria-pressed={isActive}
											title={layoutDesc || layoutLabel}
											onClick={() => {
												void setShellLayout?.(layout.id);
											}}
											className={cn(
												'inline-flex h-7 items-center justify-center gap-1.5 rounded px-2 text-[11px] font-medium transition-colors disabled:opacity-50 cursor-pointer',
												isActive
													? 'bg-primary text-primary-foreground shadow-2xs'
													: 'text-muted-foreground hover:bg-card hover:text-foreground'
											)}
										>
											{layout.icon ? (
												<DynamicIcon
													name={layout.icon}
													className="size-3.5 shrink-0"
													aria-hidden="true"
												/>
											) : null}
											<span className="truncate">{layoutLabel}</span>
										</button>
									);
								})}
							</div>
						</div>
					</>
				) : null}

				{shortcutsEnabled && onOpenShortcuts ? (
					<>
						<MenuSeparator />
						<MenuItem
							data-rw-shortcuts-trigger=""
							label={t('shell.keyboardShortcuts', 'Keyboard shortcuts')}
							onClick={() => {
								onNavigate?.();
								onOpenShortcuts();
							}}
						>
							<DynamicIcon
								name="keyboard"
								className="size-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
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

				{inSidebar && adminHref ? (
					<MenuItem
						data-rw-admin-return=""
						label={t('shell.returnToTarget', { target: resolvedReturnLabel }, 'Return to {target}')}
						render={
							<a
								href={adminHref}
								target="_top"
								className="no-underline"
								onClick={() => onNavigate?.()}
							/>
						}
					>
						<DynamicIcon
							name="arrow-left"
							className="size-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<span className="flex-1 truncate">
							{t('shell.returnToTarget', { target: resolvedReturnLabel }, 'Return to {target}')}
						</span>
					</MenuItem>
				) : null}

				{/* ProcessWire Account Navigation Items (View site / Profile / Logout) */}
				<MenuItem
					data-rw-user-view-site=""
					label={t('shell.viewSite', 'View site')}
					render={
						<a
							href={viewSiteHref}
							target="_top"
							className="no-underline"
							onClick={() => onNavigate?.()}
						/>
					}
				>
					<DynamicIcon name="eye" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span className="flex-1 truncate">{t('shell.viewSite', 'View site')}</span>
				</MenuItem>

				{profileHref ? (
					<MenuItem
						data-rw-user-profile=""
						label={t('shell.profile', 'Profile')}
						render={
							<a
								href={profileHref}
								className="no-underline"
								onClick={() => onNavigate?.()}
							/>
						}
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
						render={
							<a
								href={logoutHref}
								target="_top"
								className="no-underline"
								onClick={() => onNavigate?.()}
							/>
						}
					>
						<DynamicIcon name="logout" className="size-3.5 shrink-0" aria-hidden="true" />
						<span className="flex-1 truncate">{t('shell.logout', 'Logout')}</span>
					</MenuItem>
				) : null}
			</MenuContent>
		</Menu>
	);
}
