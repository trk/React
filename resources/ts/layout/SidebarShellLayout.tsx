import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeLink as Link, withWorkspaceShellUrl } from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../lib/utils';
import {
	Badge,
	PortalRoot,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
	useModalDialogController,
} from '../ui';
import { ModuleHeaderBar } from './ModuleHeaderBar';
import { ModuleSwitcher } from './ModuleSwitcher';
import { WorkspaceFlashNotices } from './noticeMarkup';
import { isRecordHeaderSpec, RecordHeader } from './RecordHeader';
import {
	registerShellLayout,
	type ShellLayoutDefinition,
	type ShellLayoutRendererProps,
} from './shellRegistry';
import type { AppShellNavItem, AppShellNavSection, WorkspaceSharedContext } from './types';
import { UserAccountMenu } from './UserAccountMenu';

function getNavItemKey(item: AppShellNavItem): string {
	return String(item.key ?? item.id ?? item.label);
}

function isNavItemActive(item: AppShellNavItem, activeNav?: string): boolean {
	return item.active ?? (activeNav !== undefined && getNavItemKey(item) === activeNav);
}

const MAX_NAV_DEPTH = 12;

function hasActiveDescendant(
	item: AppShellNavItem,
	activeNav?: string,
	depth = 0,
	visited: ReadonlySet<AppShellNavItem> = new Set()
): boolean {
	if (depth >= MAX_NAV_DEPTH || visited.has(item)) {
		return false;
	}
	if (!Array.isArray(item.children) || item.children.length === 0) {
		return false;
	}
	const nextVisited = new Set(visited);
	nextVisited.add(item);
	return item.children.some(
		(child) =>
			!nextVisited.has(child) &&
			(isNavItemActive(child, activeNav) || hasActiveDescendant(child, activeNav, depth + 1, nextVisited))
	);
}

function findActiveNavTrail(groups: AppShellNavSection[], activeNav?: string): AppShellNavItem[] {
	const searchItems = (
		items: AppShellNavItem[],
		depth = 0,
		visited: ReadonlySet<AppShellNavItem> = new Set()
	): AppShellNavItem[] => {
		if (depth >= MAX_NAV_DEPTH) {
			return [];
		}
		for (const item of items) {
			if (visited.has(item)) {
				continue;
			}
			const nextVisited = new Set(visited);
			nextVisited.add(item);
			if (Array.isArray(item.children) && item.children.length > 0) {
				const childTrail = searchItems(item.children, depth + 1, nextVisited);
				if (childTrail.length > 0) {
					return [item, ...childTrail];
				}
			}
			if (isNavItemActive(item, activeNav)) {
				return [item];
			}
		}
		return [];
	};

	for (const group of groups) {
		const trail = searchItems(group.items || []);
		if (trail.length > 0) {
			return trail;
		}
	}
	return [];
}

function resolveNavHref(
	rawHref: string | undefined,
	shellMode: 'workspace' | 'admin',
	workspace?: WorkspaceSharedContext
): string {
	const safe = rawHref ? sanitizeHref(rawHref) : '';
	if (!safe) {
		return '';
	}
	return (
		sanitizeHref(
			withWorkspaceShellUrl(
				safe,
				shellMode === 'workspace',
				workspace?.adminUrl,
				workspace?.launcherUrl
			)
		) || safe
	);
}

function readIsDesktopViewport(): boolean {
	if (typeof window === 'undefined') {
		return true;
	}
	if (typeof window.matchMedia === 'function') {
		return window.matchMedia('(min-width: 1024px)').matches;
	}
	if (typeof window.innerWidth === 'number' && window.innerWidth > 0) {
		return window.innerWidth >= 1024;
	}
	return true;
}

function useIsDesktopViewport(): boolean {
	const [isDesktop, setIsDesktop] = useState<boolean>(() => readIsDesktopViewport());

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}
		setIsDesktop(readIsDesktopViewport());
		if (typeof window.matchMedia === 'function') {
			const mql = window.matchMedia('(min-width: 1024px)');
			const onChange = (ev: MediaQueryListEvent) => setIsDesktop(ev.matches);
			if (typeof mql.addEventListener === 'function') {
				mql.addEventListener('change', onChange);
				return () => mql.removeEventListener('change', onChange);
			}
			mql.addListener(onChange);
			return () => mql.removeListener(onChange);
		}
		const onResize = () => setIsDesktop(readIsDesktopViewport());
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	return isDesktop;
}

function useModShortcutLabel(): string {
	const [isMac, setIsMac] = useState<boolean>(true);

	useEffect(() => {
		if (typeof navigator === 'undefined') {
			return;
		}
		setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || ''));
	}, []);

	return isMac ? '⌘' : 'Ctrl+';
}

interface SidebarNavTreeProps {
	groups: AppShellNavSection[];
	resolvedActiveNav?: string;
	collapsed: boolean;
	shellMode: 'workspace' | 'admin';
	workspace?: WorkspaceSharedContext;
	onExpandSidebar?: () => void;
	onNavigate?: () => void;
}

function SidebarNavTree({
	groups,
	resolvedActiveNav,
	collapsed,
	shellMode,
	workspace,
	onExpandSidebar,
	onNavigate,
}: SidebarNavTreeProps): React.ReactElement {
	const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
	const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

	const toggleSection = (secId: string, currentlyCollapsed: boolean) => {
		setCollapsedSections((prev) => ({ ...prev, [secId]: !currentlyCollapsed }));
	};

	const toggleItemExpanded = (itemKey: string, currentlyExpanded: boolean) => {
		setExpandedItems((prev) => ({ ...prev, [itemKey]: !currentlyExpanded }));
	};

	const renderNavItem = (
		item: AppShellNavItem,
		depth = 0,
		visited: ReadonlySet<AppShellNavItem> = new Set()
	): React.ReactNode => {
		if (depth >= MAX_NAV_DEPTH || visited.has(item)) {
			return null;
		}
		const nextVisited = new Set(visited);
		nextVisited.add(item);
		const itemKey = getNavItemKey(item);
		const isDirectActive = isNavItemActive(item, resolvedActiveNav);
		const isDescendantActive = hasActiveDescendant(item, resolvedActiveNav, depth, visited);
		const hasChildren =
			depth + 1 < MAX_NAV_DEPTH &&
			Array.isArray(item.children) &&
			item.children.some((child) => !nextVisited.has(child));
		const safeHref = resolveNavHref(item.href, shellMode, workspace);
		const hasAction = Boolean(item.onClick || safeHref);
		const hasBadge = item.badge !== undefined && item.badge !== null && item.badge !== '';

		const divider = item.dividerBefore ? (
			<div className="my-1.5 border-t border-sidebar-border/70" aria-hidden="true" />
		) : null;

		if (collapsed) {
			const collapsedClass = cn(
				'mx-auto flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
				isDirectActive || isDescendantActive
					? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_var(--sidebar-border)]'
					: 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
			);
			const iconEl = (
				<DynamicIcon name={item.icon || 'circle-dot'} className="size-4 shrink-0" aria-hidden="true" />
			);

			let triggerNode: React.ReactElement | null = null;
			if (item.onClick) {
				triggerNode = (
					<button
						type="button"
						onClick={() => {
							item.onClick?.();
							onNavigate?.();
						}}
						aria-label={item.label}
						aria-current={isDirectActive ? 'page' : undefined}
						className={cn(collapsedClass, 'cursor-pointer')}
					>
						{iconEl}
					</button>
				);
			} else if (safeHref) {
				triggerNode = (
					<Link
						href={safeHref}
						onClick={() => onNavigate?.()}
						aria-label={item.label}
						aria-current={isDirectActive ? 'page' : undefined}
						className={cn(collapsedClass, 'no-underline')}
					>
						{iconEl}
					</Link>
				);
			} else if (hasChildren && onExpandSidebar) {
				triggerNode = (
					<button
						type="button"
						onClick={onExpandSidebar}
						aria-label={item.label}
						className={cn(collapsedClass, 'cursor-pointer')}
					>
						{iconEl}
					</button>
				);
			}

			if (!triggerNode) {
				return null;
			}

			return (
				<React.Fragment key={itemKey}>
					{divider}
					<Tooltip>
						<TooltipTrigger asChild>{triggerNode}</TooltipTrigger>
						<TooltipContent side="right">
							<span className="flex items-center gap-1.5">
								<span>{item.label}</span>
								{hasBadge ? (
									<Badge variant={item.badgeVariant || 'secondary'} mono className="px-1.5 py-0 text-[10px]">
										{item.badge}
									</Badge>
								) : null}
							</span>
						</TooltipContent>
					</Tooltip>
				</React.Fragment>
			);
		}

		const expandedClass = cn(
			'flex w-full items-center justify-between gap-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
			depth > 0 ? 'min-h-7.5 px-2 py-1 text-[12.5px]' : 'h-8 px-2.5 text-[13px]',
			isDirectActive
				? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_0_0_0_1px_var(--sidebar-border)]'
				: 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
		);

		const labelInner = (
			<>
				<span className="flex min-w-0 flex-1 items-center gap-2">
					{item.icon ? (
						<DynamicIcon
							name={item.icon}
							className={cn(
								'size-4 shrink-0',
								isDirectActive ? 'text-sidebar-accent-foreground' : 'text-muted-foreground'
							)}
							aria-hidden="true"
						/>
					) : null}
					<span className="truncate">{item.label}</span>
				</span>
				{hasBadge ? (
					<Badge
						variant={item.badgeVariant || 'secondary'}
						mono
						className="shrink-0 px-1.5 py-0 text-[10px] leading-4 tabular-nums"
					>
						{item.badge}
					</Badge>
				) : null}
			</>
		);

		const isExpanded = expandedItems[itemKey] ?? (isDirectActive || isDescendantActive);

		if (hasChildren) {
			const childrenList = isExpanded ? (
				<div className="mt-1 space-y-0.5 border-l border-sidebar-border/70 pl-3 ml-4">
					{item.children!.map((child) => renderNavItem(child, depth + 1, nextVisited))}
				</div>
			) : null;

			if (!hasAction) {
				return (
					<React.Fragment key={itemKey}>
						{divider}
						<div>
							<button
								type="button"
								aria-expanded={isExpanded}
								onClick={() => toggleItemExpanded(itemKey, isExpanded)}
								className={cn(expandedClass, 'cursor-pointer text-left')}
							>
								{labelInner}
								<DynamicIcon
									name="chevron-right"
									className={cn(
										'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
										isExpanded && 'rotate-90'
									)}
									aria-hidden="true"
								/>
							</button>
							{childrenList}
						</div>
					</React.Fragment>
				);
			}

			return (
				<React.Fragment key={itemKey}>
					{divider}
					<div>
						<div className="flex items-center gap-0.5">
							{item.onClick ? (
								<button
									type="button"
									onClick={() => {
										item.onClick?.();
										onNavigate?.();
									}}
									aria-current={isDirectActive ? 'page' : undefined}
									className={cn(expandedClass, 'flex-1 min-w-0 cursor-pointer text-left')}
								>
									{labelInner}
								</button>
							) : (
								<Link
									href={safeHref}
									onClick={() => onNavigate?.()}
									aria-current={isDirectActive ? 'page' : undefined}
									className={cn(expandedClass, 'flex-1 min-w-0 no-underline')}
								>
									{labelInner}
								</Link>
							)}
							<button
								type="button"
								aria-expanded={isExpanded}
								aria-label={`${item.label} — ${t('common.toggleOptions', 'Toggle options')}`}
								onClick={() => toggleItemExpanded(itemKey, isExpanded)}
								className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring cursor-pointer"
							>
								<DynamicIcon
									name="chevron-right"
									className={cn(
										'size-3.5 transition-transform duration-150',
										isExpanded && 'rotate-90'
									)}
									aria-hidden="true"
								/>
							</button>
						</div>
						{childrenList}
					</div>
				</React.Fragment>
			);
		}

		if (item.onClick) {
			return (
				<React.Fragment key={itemKey}>
					{divider}
					<button
						type="button"
						onClick={() => {
							item.onClick?.();
							onNavigate?.();
						}}
						aria-current={isDirectActive ? 'page' : undefined}
						className={cn(expandedClass, 'cursor-pointer text-left')}
					>
						{labelInner}
					</button>
				</React.Fragment>
			);
		}

		if (safeHref) {
			return (
				<React.Fragment key={itemKey}>
					{divider}
					<Link
						href={safeHref}
						onClick={() => onNavigate?.()}
						aria-current={isDirectActive ? 'page' : undefined}
						className={cn(expandedClass, 'no-underline')}
					>
						{labelInner}
					</Link>
				</React.Fragment>
			);
		}

		return null;
	};

	return (
		<nav
			data-rw-module-nav=""
			aria-label={t('shell.navigation', 'Navigation')}
			className={cn(
				'flex-1 overflow-y-auto overflow-x-hidden py-1',
				collapsed ? 'px-2 space-y-1.5' : 'px-2 space-y-4'
			)}
		>
			{groups.map((sec, secIdx) => {
				const items = sec.items || [];
				if (items.length === 0) {
					return null;
				}
				const sectionHasActive = items.some(
					(item) =>
						isNavItemActive(item, resolvedActiveNav) || hasActiveDescendant(item, resolvedActiveNav)
				);
				const isSectionCollapsed = collapsed
					? false
					: collapsedSections[sec.id] ?? Boolean(sec.defaultCollapsed && !sectionHasActive);

				return (
					<div key={sec.id || `sec-${secIdx}`} className={collapsed ? 'space-y-1' : 'space-y-0.5'}>
						{collapsed ? (
							secIdx > 0 ? (
								<div className="mx-auto my-2 h-px w-5 bg-sidebar-border/80" aria-hidden="true" />
							) : null
						) : sec.label ? (
							sec.collapsible ? (
								<button
									type="button"
									aria-expanded={!isSectionCollapsed}
									onClick={() => toggleSection(sec.id, isSectionCollapsed)}
									className="mb-1 flex w-full items-center justify-between gap-1.5 rounded-md px-2.5 py-0.5 text-left text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase transition-colors hover:text-sidebar-foreground cursor-pointer"
								>
									<span className="truncate">{sec.label}</span>
									<DynamicIcon
										name="chevron-down"
										className={cn(
											'size-3 shrink-0 transition-transform duration-150',
											isSectionCollapsed && '-rotate-90'
										)}
										aria-hidden="true"
									/>
								</button>
							) : (
								<div className="px-2.5 mb-1 text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
									{sec.label}
								</div>
							)
						) : null}

						{!isSectionCollapsed ? (
							<div className={collapsed ? 'space-y-1' : 'space-y-0.5'}>
								{items.map((item) => renderNavItem(item, 0))}
							</div>
						) : null}
					</div>
				);
			})}
		</nav>
	);
}

interface SidebarMobileDrawerProps {
	open: boolean;
	onOpenChange: (next: boolean) => void;
	title: string;
	icon?: string;
	returnLabel: string;
	shellMode: 'workspace' | 'admin';
	openInWorkspaceHref: string;
	navGroups: AppShellNavSection[];
	resolvedActiveNav?: string;
	workspace?: WorkspaceSharedContext;
	workspaces: ShellLayoutRendererProps['workspaces'];
	activeWorkspace?: ShellLayoutRendererProps['activeWorkspace'];
	favorites: string[];
	isWorkspaceActive: ShellLayoutRendererProps['isWorkspaceActive'];
	toggleFavoriteWorkspace: ShellLayoutRendererProps['toggleFavoriteWorkspace'];
}

function SidebarMobileDrawer({
	open,
	onOpenChange,
	title,
	icon,
	returnLabel,
	shellMode,
	openInWorkspaceHref,
	navGroups,
	resolvedActiveNav,
	workspace,
	workspaces,
	activeWorkspace,
	favorites,
	isWorkspaceActive,
	toggleFavoriteWorkspace,
}: SidebarMobileDrawerProps): React.ReactElement | null {
	const drawerRef = useRef<HTMLDialogElement | null>(null);
	const drawerCtrl = useModalDialogController(drawerRef, open, onOpenChange);

	if (!open) {
		return null;
	}

	const safeLauncherHref = sanitizeHref(workspace?.launcherUrl);
	const safeAdminHref = sanitizeHref(workspace?.adminUrl);

	return (
		<PortalRoot ssrFallback={false}>
			<dialog
				ref={drawerRef}
				aria-label={t('shell.workspaceNavigation', 'Workspace navigation')}
				data-rw-drawer-dialog=""
				data-rw-mobile-drawer=""
				data-rw-portal-overlay=""
				{...({ closedby: 'any' } as Record<string, string>)}
				onPointerDown={drawerCtrl.handlePointerDown}
				onPointerUp={drawerCtrl.handlePointerUp}
				onClose={drawerCtrl.handleClose}
				className="lg:hidden text-card-foreground"
			>
				<div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 shrink-0">
					<div className="min-w-0 flex-1">
						<ModuleSwitcher
							workspace={workspace}
							workspaces={workspaces}
							activeWorkspace={activeWorkspace}
							favorites={favorites}
							isWorkspaceActive={isWorkspaceActive}
							toggleFavoriteWorkspace={toggleFavoriteWorkspace}
							shellMode={shellMode}
							returnLabel={returnLabel}
							title={title}
							icon={icon}
							onNavigate={() => onOpenChange(false)}
						/>
					</div>
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						aria-label={t('shell.closeNavigationMenu', 'Close navigation menu')}
						className="inline-flex size-8 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
					>
						<DynamicIcon name="x" className="size-4" aria-hidden="true" />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto px-1.5 py-2.5">
					{navGroups.length > 0 ? (
						<SidebarNavTree
							groups={navGroups}
							resolvedActiveNav={resolvedActiveNav}
							collapsed={false}
							shellMode={shellMode}
							workspace={workspace}
							onNavigate={() => onOpenChange(false)}
						/>
					) : null}
				</div>

				{safeLauncherHref || (shellMode === 'workspace' && safeAdminHref) || (shellMode === 'admin' && openInWorkspaceHref) ? (
					<div className="flex items-center justify-between gap-2 border-t border-border bg-muted/25 px-3 py-2.5 shrink-0">
						{safeLauncherHref ? (
							(() => {
								const launcherClass =
									'inline-flex min-h-8 pointer-coarse:min-h-11 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted no-underline';
								const launcherContent = (
									<>
										<DynamicIcon name="layout-grid" className="size-3.5 text-primary" aria-hidden="true" />
										<span>{t('shell.workspaceHub', 'Workspace Hub')}</span>
									</>
								);
								return shellMode === 'workspace' ? (
									<Link
										href={safeLauncherHref}
										onClick={() => onOpenChange(false)}
										className={launcherClass}
									>
										{launcherContent}
									</Link>
								) : (
									<a
										href={safeLauncherHref}
										onClick={() => onOpenChange(false)}
										className={launcherClass}
									>
										{launcherContent}
									</a>
								);
							})()
						) : null}

						{shellMode === 'workspace' && safeAdminHref ? (
							<a
								href={safeAdminHref}
								data-rw-admin-return=""
								onClick={() => onOpenChange(false)}
								className="ml-auto inline-flex min-h-8 pointer-coarse:min-h-11 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted no-underline"
							>
								<DynamicIcon name="arrow-left" className="size-3.5" aria-hidden="true" />
								<span>{returnLabel}</span>
							</a>
						) : shellMode === 'admin' && openInWorkspaceHref ? (
							<a
								href={openInWorkspaceHref}
								data-rw-open-in-workspace=""
								onClick={() => onOpenChange(false)}
								className="ml-auto inline-flex min-h-8 pointer-coarse:min-h-11 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted no-underline"
							>
								<DynamicIcon name="layout-grid" className="size-3.5 text-primary" aria-hidden="true" />
								<span>{t('shell.openInWorkspace', 'Open in Workspace')}</span>
							</a>
						) : null}
					</div>
				) : null}
			</dialog>
		</PortalRoot>
	);
}

interface SidebarBreadcrumbHeaderProps {
	title: string;
	pills: ShellLayoutRendererProps['pills'];
	activeTrail: AppShellNavItem[];
	shellMode: 'workspace' | 'admin';
	isClassicAdminShell: boolean;
	isDesktop: boolean;
	sidebarCollapsed: boolean;
	modPrefix: string;
	enableShortcuts: boolean;
	openInWorkspaceHref: string;
	resolvedHeaderActions?: React.ReactNode;
	workspace?: WorkspaceSharedContext;
	activeWorkspace?: ShellLayoutRendererProps['activeWorkspace'];
	onToggleSidebar: () => void;
	onOpenMobileDrawer: () => void;
	onOpenCommandPalette: () => void;
}

function SidebarBreadcrumbHeader({
	title,
	pills,
	activeTrail,
	shellMode,
	isClassicAdminShell,
	isDesktop,
	sidebarCollapsed,
	modPrefix,
	enableShortcuts,
	openInWorkspaceHref,
	resolvedHeaderActions,
	workspace,
	activeWorkspace,
	onToggleSidebar,
	onOpenMobileDrawer,
	onOpenCommandPalette,
}: SidebarBreadcrumbHeaderProps): React.ReactElement {
	const leafItem = activeTrail.length > 0 ? activeTrail[activeTrail.length - 1] : undefined;
	const showNestedCrumb = Boolean(leafItem && (activeTrail.length > 1 || leafItem.label !== title));
	const moduleHref = resolveNavHref(activeWorkspace?.url, shellMode, workspace);
	const toggleLabel = sidebarCollapsed
		? t('shell.expandSidebar', 'Expand sidebar')
		: t('shell.collapseSidebar', 'Collapse sidebar');

	const hasRightSlot = Boolean(
		resolvedHeaderActions ||
			(isClassicAdminShell && (enableShortcuts || (!isDesktop && openInWorkspaceHref)))
	);

	return (
		<header
			data-rw-sidebar-header=""
			className={cn(
				'z-20 px-4 lg:px-5 py-2 lg:py-1.5 flex flex-wrap items-center justify-between gap-2 border-b backdrop-blur-sm',
				isClassicAdminShell
					? 'sticky top-0 min-h-11 border-border/80 bg-background/95'
					: 'sticky top-[52px] lg:top-0 min-h-12 border-border/70 bg-background/92 lg:rounded-t-xl'
			)}
		>
			<div className="flex min-w-0 max-w-full flex-auto md:flex-1 items-center gap-2">
				{isClassicAdminShell && !isDesktop ? (
					<button
						type="button"
						onClick={onOpenMobileDrawer}
						data-rw-mobile-menu-trigger=""
						aria-label={t('shell.openNavigationMenu', 'Open workspace navigation menu')}
						className="inline-flex size-8 pointer-coarse:size-10 shrink-0 items-center justify-center rounded-md border border-border bg-input-surface text-foreground transition-colors hover:bg-muted cursor-pointer"
					>
						<DynamicIcon name="menu" className="size-4" aria-hidden="true" />
					</button>
				) : null}

				{isDesktop ? (
					<>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									data-rw-sidebar-toggle=""
									onClick={onToggleSidebar}
									aria-label={toggleLabel}
									aria-expanded={!sidebarCollapsed}
									className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
								>
									<DynamicIcon
										name={
											sidebarCollapsed
												? 'layout-sidebar-left-expand'
												: 'layout-sidebar-left-collapse'
										}
										className="size-4"
										aria-hidden="true"
									/>
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<span className="flex items-center gap-1.5">
									<span>{toggleLabel}</span>
									<kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
										{`${modPrefix}B`}
									</kbd>
								</span>
							</TooltipContent>
						</Tooltip>
						<span className="h-4 w-px shrink-0 bg-border/80" aria-hidden="true" />
					</>
				) : null}

				<nav
					aria-label={t('shell.breadcrumb', 'Breadcrumb')}
					className="flex min-w-0 flex-wrap items-center gap-1.5"
				>
					{showNestedCrumb && leafItem ? (
						<>
							{moduleHref ? (
								<Link
									href={moduleHref}
									className="truncate text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground no-underline"
								>
									{title}
								</Link>
							) : (
								<span className="truncate text-[13px] font-medium text-muted-foreground">
									{title}
								</span>
							)}
							{activeTrail.slice(0, -1).map((ancestor) => {
								const ancestorKey = getNavItemKey(ancestor);
								const ancestorHref = resolveNavHref(ancestor.href, shellMode, workspace);
								return (
									<React.Fragment key={ancestorKey}>
										<span className="text-xs text-muted-foreground select-none" aria-hidden="true">
											/
										</span>
										{ancestorHref ? (
											<Link
												href={ancestorHref}
												className="truncate text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground no-underline"
											>
												{ancestor.label}
											</Link>
										) : (
											<span className="truncate text-[13px] font-medium text-muted-foreground">
												{ancestor.label}
											</span>
										)}
									</React.Fragment>
								);
							})}
							<span className="text-xs text-muted-foreground select-none" aria-hidden="true">
								/
							</span>
							<h1 className="truncate text-[13.5px] font-semibold tracking-tight text-foreground">
								{leafItem.label}
							</h1>
						</>
					) : (
						<h1 className="truncate text-[13.5px] font-semibold tracking-tight text-foreground">
							{title}
						</h1>
					)}

					{pills.map((pill, idx) => {
						const label = typeof pill === 'string' ? pill : pill.label;
						const variant = typeof pill === 'string' ? 'secondary' : pill.variant || 'secondary';
						return (
							<Badge key={idx} variant={variant} className="shrink-0 text-[11px]">
								{label}
							</Badge>
						);
					})}
				</nav>
			</div>

			{hasRightSlot ? (
				<div
					data-rw-header-actions=""
					className="flex min-w-0 max-w-full flex-wrap items-center gap-2"
				>
					{resolvedHeaderActions}
					{isClassicAdminShell && enableShortcuts ? (
						<button
							type="button"
							onClick={onOpenCommandPalette}
							data-rw-command-trigger=""
							title={t('shell.quickSwitcherShortcut', 'Quick Switcher (Cmd/Ctrl+K)')}
							className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-input-surface px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0 cursor-pointer"
						>
							<DynamicIcon name="search" className="size-3.5" aria-hidden="true" />
							<span className="sr-only">{t('shell.quickSwitcher', 'Quick Switcher')}</span>
							<kbd className="font-mono text-[10px]">{`${modPrefix}K`}</kbd>
						</button>
					) : null}
					{isClassicAdminShell && !isDesktop && openInWorkspaceHref ? (
						<a
							href={openInWorkspaceHref}
							data-rw-open-in-workspace=""
							title={t('shell.openInWorkspaceTooltip', 'Switch to full-screen Workspace view')}
							className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-input-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted shrink-0 no-underline"
						>
							<DynamicIcon name="layout-grid" className="size-3.5 text-primary" aria-hidden="true" />
							<span>{t('shell.openInWorkspace', 'Open in Workspace')}</span>
						</a>
					) : null}
				</div>
			) : null}
		</header>
	);
}

export function SidebarShellLayout({
	workspace,
	title,
	subtitle,
	icon,
	pills,
	sections,
	resolvedNavItems,
	resolvedActiveNav,
	recordHeader,
	hasRecordHeader,
	hasDirtySchemaForm,
	resolvedHeaderActions,
	activeFeedback,
	onDismissFeedback,
	flash,
	dismissedFlash,
	onDismissFlash,
	isEmbeddedIsland,
	isClassicAdminShell,
	showGlobalWorkspaceBar,
	enableShortcuts,
	openInWorkspaceHref,
	MainContainer,
	returnLabel,
	workspaces,
	activeWorkspace,
	favorites,
	isWorkspaceActive,
	toggleFavoriteWorkspace,
	mobileDrawerOpen,
	setMobileDrawerOpen,
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
	sidebarCollapsed,
	layoutPending,
	setShellLayout,
	setSidebarCollapsed,
	toggleSidebarCollapsed,
	children,
}: ShellLayoutRendererProps): React.ReactElement {
	const isDesktop = useIsDesktopViewport();
	const modPrefix = useModShortcutLabel();

	useEffect(() => {
		if (isDesktop && mobileDrawerOpen) {
			setMobileDrawerOpen(false);
		}
	}, [isDesktop, mobileDrawerOpen, setMobileDrawerOpen]);

	const navGroups = useMemo<AppShellNavSection[]>(() => {
		if (sections.length > 0) {
			return sections;
		}
		if (resolvedNavItems.length > 0) {
			return [{ id: 'module', items: resolvedNavItems }];
		}
		return [];
	}, [sections, resolvedNavItems]);

	const activeTrail = useMemo(
		() => findActiveNavTrail(navGroups, resolvedActiveNav),
		[navGroups, resolvedActiveNav]
	);

	const bodyContent = (
		<div
			data-rw-workspace-body=""
			className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4 lg:px-6 lg:py-5 space-y-5"
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
				onDismissFeedback={onDismissFeedback}
				flash={flash}
				dismissedFlash={dismissedFlash}
				onDismissFlash={onDismissFlash}
			/>

			{children}
		</div>
	);

	if (isEmbeddedIsland) {
		const showIslandHeader =
			resolvedNavItems.length > 0 ||
			(!hasRecordHeader && Boolean(resolvedHeaderActions)) ||
			Boolean(subtitle) ||
			pills.length > 0;

		return (
			<MainContainer data-rw-app-main="" className="flex-1 flex flex-col min-w-0">
				{showIslandHeader ? (
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
						onOpenCommandPalette={onOpenCommandPalette}
						resolvedNavItems={resolvedNavItems}
						resolvedActiveNav={resolvedActiveNav}
					/>
				) : null}
				{bodyContent}
			</MainContainer>
		);
	}

	const topbarLayoutOpt = availableShellLayouts.find((l) => l.id === 'topbar');
	const topbarSwitchLabel = topbarLayoutOpt?.labelKey
		? t(topbarLayoutOpt.labelKey, topbarLayoutOpt.label)
		: topbarLayoutOpt?.label || t('shell.layoutTopbar', 'Top Bar');

	const renderAccountMenuProps = {
		workspace,
		returnLabel,
		shortcutsEnabled: enableShortcuts,
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
	};

	const leafNav = activeTrail.length > 0 ? activeTrail[activeTrail.length - 1] : undefined;
	const mobileTitleText =
		leafNav && leafNav.label !== title ? `${title} / ${leafNav.label}` : title;
	const showWorkspaceBreadcrumbHeader =
		isDesktop || pills.length > 0 || Boolean(resolvedHeaderActions);

	if (isClassicAdminShell) {
		return (
			<TooltipProvider delay={300}>
				<div className="flex-1 min-h-[calc(100dvh-3.5rem)] flex flex-col lg:flex-row bg-background text-foreground">
					{isDesktop ? (
						<aside
							data-rw-sidebar=""
							aria-label={t('shell.workspaceNavigation', 'Workspace navigation')}
							className="hidden lg:flex lg:flex-col shrink-0 border-r border-border/80 bg-sidebar/70 sticky top-0 h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] transition-[width] duration-200 ease-out motion-reduce:transition-none"
							style={{ width: sidebarCollapsed ? 56 : 228 }}
						>
							<div className={cn('shrink-0', sidebarCollapsed ? 'px-2 py-2.5' : 'p-2.5')}>
								<ModuleSwitcher
									workspace={workspace}
									workspaces={workspaces}
									activeWorkspace={activeWorkspace}
									favorites={favorites}
									isWorkspaceActive={isWorkspaceActive}
									toggleFavoriteWorkspace={toggleFavoriteWorkspace}
									shellMode="admin"
									returnLabel={returnLabel}
									collapsed={sidebarCollapsed}
									title={title}
									icon={icon}
								/>
							</div>

							<SidebarNavTree
								groups={navGroups}
								resolvedActiveNav={resolvedActiveNav}
								collapsed={sidebarCollapsed}
								shellMode="admin"
								workspace={workspace}
								onExpandSidebar={() => void setSidebarCollapsed(false)}
							/>

							{openInWorkspaceHref || availableShellLayouts.length > 1 ? (
								<div className="mt-auto shrink-0 border-t border-border/70 p-2 space-y-1">
									{openInWorkspaceHref ? (
										sidebarCollapsed ? (
											<Tooltip>
												<TooltipTrigger asChild>
													<a
														href={openInWorkspaceHref}
														data-rw-open-in-workspace=""
														aria-label={t('shell.openInWorkspace', 'Open in Workspace')}
														className="mx-auto flex size-9 items-center justify-center rounded-lg border border-border bg-background/80 text-foreground transition-colors hover:bg-muted no-underline"
													>
														<DynamicIcon
															name="layout-grid"
															className="size-4 text-primary"
															aria-hidden="true"
														/>
													</a>
												</TooltipTrigger>
												<TooltipContent side="right">
													{t('shell.openInWorkspace', 'Open in Workspace')}
												</TooltipContent>
											</Tooltip>
										) : (
											<a
												href={openInWorkspaceHref}
												data-rw-open-in-workspace=""
												title={t('shell.openInWorkspaceTooltip', 'Switch to full-screen Workspace view')}
												className="flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-background/80 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted no-underline"
											>
												<DynamicIcon
													name="layout-grid"
													className="size-3.5 shrink-0 text-primary"
													aria-hidden="true"
												/>
												<span className="truncate">
													{t('shell.openInWorkspace', 'Open in Workspace')}
												</span>
											</a>
										)
									) : null}

									{availableShellLayouts.length > 1 ? (
										sidebarCollapsed ? (
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														type="button"
														disabled={layoutPending}
														data-rw-shell-layout-option="topbar"
														onClick={() => void setShellLayout('topbar')}
														aria-label={topbarSwitchLabel}
														className="mx-auto flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50 cursor-pointer"
													>
														<DynamicIcon name="layout-navbar" className="size-4" aria-hidden="true" />
													</button>
												</TooltipTrigger>
												<TooltipContent side="right">{topbarSwitchLabel}</TooltipContent>
											</Tooltip>
										) : (
											<button
												type="button"
												disabled={layoutPending}
												data-rw-shell-layout-option="topbar"
												onClick={() => void setShellLayout('topbar')}
												className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50 cursor-pointer"
											>
												<DynamicIcon
													name="layout-navbar"
													className="size-3.5 shrink-0"
													aria-hidden="true"
												/>
												<span className="truncate">{topbarSwitchLabel}</span>
											</button>
										)
									) : null}
								</div>
							) : null}
						</aside>
					) : (
						<SidebarMobileDrawer
							open={mobileDrawerOpen}
							onOpenChange={setMobileDrawerOpen}
							title={title}
							icon={icon}
							returnLabel={returnLabel}
							shellMode="admin"
							openInWorkspaceHref={openInWorkspaceHref}
							navGroups={navGroups}
							resolvedActiveNav={resolvedActiveNav}
							workspace={workspace}
							workspaces={workspaces}
							activeWorkspace={activeWorkspace}
							favorites={favorites}
							isWorkspaceActive={isWorkspaceActive}
							toggleFavoriteWorkspace={toggleFavoriteWorkspace}
						/>
					)}

					<div className="flex-1 min-w-0 flex flex-col">
						<SidebarBreadcrumbHeader
							title={title}
							pills={pills}
							activeTrail={activeTrail}
							shellMode="admin"
							isClassicAdminShell
							isDesktop={isDesktop}
							sidebarCollapsed={sidebarCollapsed}
							modPrefix={modPrefix}
							enableShortcuts={enableShortcuts}
							openInWorkspaceHref={openInWorkspaceHref}
							resolvedHeaderActions={resolvedHeaderActions}
							workspace={workspace}
							activeWorkspace={activeWorkspace}
							onToggleSidebar={() => void toggleSidebarCollapsed()}
							onOpenMobileDrawer={onOpenMobileDrawer}
							onOpenCommandPalette={onOpenCommandPalette}
						/>

						<MainContainer data-rw-app-main="" className="flex-1 flex flex-col min-w-0">
							{bodyContent}
						</MainContainer>
					</div>
				</div>
			</TooltipProvider>
		);
	}

	return (
		<TooltipProvider delay={300}>
			<div className="flex-1 min-h-0 flex flex-col lg:flex-row bg-sidebar text-foreground">
				{isDesktop ? (
					<aside
						data-rw-sidebar=""
						aria-label={t('shell.workspaceNavigation', 'Workspace navigation')}
						className="hidden lg:flex lg:flex-col shrink-0 sticky top-0 h-screen select-none transition-[width] duration-200 ease-out motion-reduce:transition-none"
						style={{ width: sidebarCollapsed ? 60 : 252 }}
					>
						<div className={cn('shrink-0', sidebarCollapsed ? 'px-2 py-2.5' : 'p-2.5')}>
							<ModuleSwitcher
								workspace={workspace}
								workspaces={workspaces}
								activeWorkspace={activeWorkspace}
								favorites={favorites}
								isWorkspaceActive={isWorkspaceActive}
								toggleFavoriteWorkspace={toggleFavoriteWorkspace}
								shellMode="workspace"
								returnLabel={returnLabel}
								collapsed={sidebarCollapsed}
								title={title}
								icon={icon}
							/>
						</div>

						{enableShortcuts ? (
							<div
								className={cn(
									'shrink-0 pb-2',
									sidebarCollapsed ? 'flex justify-center px-2' : 'px-2.5'
								)}
							>
								{sidebarCollapsed ? (
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												onClick={onOpenCommandPalette}
												data-rw-command-trigger=""
												aria-label={t('shell.quickSwitcherShortcut', 'Quick Switcher (Cmd/Ctrl+K)')}
												className="flex size-9 items-center justify-center rounded-lg border border-sidebar-border/80 bg-background/70 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring cursor-pointer"
											>
												<DynamicIcon name="search" className="size-4" aria-hidden="true" />
											</button>
										</TooltipTrigger>
										<TooltipContent side="right">
											{t('shell.quickSwitcherShortcut', 'Quick Switcher (Cmd/Ctrl+K)')}
										</TooltipContent>
									</Tooltip>
								) : (
									<button
										type="button"
										onClick={onOpenCommandPalette}
										data-rw-command-trigger=""
										title={t('shell.quickSwitcherShortcut', 'Quick Switcher (Cmd/Ctrl+K)')}
										className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-sidebar-border/80 bg-background/70 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring cursor-pointer"
									>
										<span className="flex min-w-0 items-center gap-2">
											<DynamicIcon name="search" className="size-3.5 shrink-0" aria-hidden="true" />
											<span className="truncate">{t('shell.quickJump', 'Quick Jump')}</span>
										</span>
										<kbd className="shrink-0 rounded border border-border/80 bg-muted/70 px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
											{`${modPrefix}K`}
										</kbd>
									</button>
								)}
							</div>
						) : null}

						<SidebarNavTree
							groups={navGroups}
							resolvedActiveNav={resolvedActiveNav}
							collapsed={sidebarCollapsed}
							shellMode="workspace"
							workspace={workspace}
							onExpandSidebar={() => void setSidebarCollapsed(false)}
						/>

						{workspace?.user ? (
							<div className="mt-auto shrink-0 border-t border-sidebar-border/70 p-2">
								<UserAccountMenu
									variant={sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar'}
									inSidebar
									{...renderAccountMenuProps}
								/>
							</div>
						) : null}
					</aside>
				) : (
					<>
						<header
							data-rw-mobile-header=""
							className="lg:hidden sticky top-0 z-30 h-[52px] px-3 flex items-center justify-between gap-2 bg-sidebar/95 backdrop-blur-sm border-b border-sidebar-border shrink-0"
						>
							<div className="flex min-w-0 flex-1 items-center gap-2">
								<button
									type="button"
									onClick={onOpenMobileDrawer}
									data-rw-mobile-menu-trigger=""
									aria-label={t('shell.openNavigationMenu', 'Open workspace navigation menu')}
									className="inline-flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent cursor-pointer"
								>
									<DynamicIcon name="menu" className="size-4" aria-hidden="true" />
								</button>
								<span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-2xs">
									<DynamicIcon
										name={activeWorkspace?.icon || icon || 'layout-grid'}
										className="size-3.5"
										aria-hidden="true"
									/>
								</span>
								{showWorkspaceBreadcrumbHeader ? (
									<span className="truncate text-[13px] font-semibold text-sidebar-foreground">
										{mobileTitleText}
									</span>
								) : (
									<h1 className="truncate text-[13px] font-semibold text-sidebar-foreground">
										{mobileTitleText}
									</h1>
								)}
							</div>

							<div className="flex shrink-0 items-center gap-1.5">
								{enableShortcuts ? (
									<button
										type="button"
										onClick={onOpenCommandPalette}
										data-rw-command-trigger=""
										aria-label={t('shell.quickSwitcherShortcut', 'Quick Switcher (Cmd/Ctrl+K)')}
										title={t('shell.quickSwitcherShortcut', 'Quick Switcher (Cmd/Ctrl+K)')}
										className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent cursor-pointer"
									>
										<DynamicIcon name="search" className="size-4" aria-hidden="true" />
									</button>
								) : null}
								<UserAccountMenu variant="topbar" compact {...renderAccountMenuProps} />
							</div>
						</header>

						{showGlobalWorkspaceBar ? (
							<SidebarMobileDrawer
								open={mobileDrawerOpen}
								onOpenChange={setMobileDrawerOpen}
								title={title}
								icon={icon}
								returnLabel={returnLabel}
								shellMode="workspace"
								openInWorkspaceHref={openInWorkspaceHref}
								navGroups={navGroups}
								resolvedActiveNav={resolvedActiveNav}
								workspace={workspace}
								workspaces={workspaces}
								activeWorkspace={activeWorkspace}
								favorites={favorites}
								isWorkspaceActive={isWorkspaceActive}
								toggleFavoriteWorkspace={toggleFavoriteWorkspace}
							/>
						) : null}
					</>
				)}

				<div className="flex-1 min-w-0 flex flex-col lg:py-2 lg:pr-2">
					<div
						data-rw-sidebar-canvas=""
						className="flex-1 min-w-0 flex flex-col bg-background lg:rounded-xl lg:border lg:border-border/80 lg:shadow-2xs overflow-x-clip"
					>
						{showWorkspaceBreadcrumbHeader ? (
							<SidebarBreadcrumbHeader
								title={title}
								pills={pills}
								activeTrail={activeTrail}
								shellMode="workspace"
								isClassicAdminShell={false}
								isDesktop={isDesktop}
								sidebarCollapsed={sidebarCollapsed}
								modPrefix={modPrefix}
								enableShortcuts={enableShortcuts}
								openInWorkspaceHref={openInWorkspaceHref}
								resolvedHeaderActions={resolvedHeaderActions}
								workspace={workspace}
								activeWorkspace={activeWorkspace}
								onToggleSidebar={() => void toggleSidebarCollapsed()}
								onOpenMobileDrawer={onOpenMobileDrawer}
								onOpenCommandPalette={onOpenCommandPalette}
							/>
						) : null}

						<MainContainer data-rw-app-main="" className="flex-1 flex flex-col min-w-0">
							{bodyContent}
						</MainContainer>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}

export const SIDEBAR_SHELL_LAYOUT: ShellLayoutDefinition = {
	id: 'sidebar',
	label: 'Sidebar',
	labelKey: 'shell.layoutSidebar',
	description: 'Collapsible left navigation sidebar with module switcher and account footer.',
	descriptionKey: 'shell.layoutSidebarDesc',
	icon: 'layout-sidebar',
	supportsCollapse: true,
	order: 20,
	render: (props) => <SidebarShellLayout {...props} />,
};

registerShellLayout(SIDEBAR_SHELL_LAYOUT);
