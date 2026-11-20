import React, { useRef } from 'react';
import { SafeLink as Link, withWorkspaceShellUrl } from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../lib/utils';
import { Badge, PortalRoot, useModalDialogController } from '../ui';
import type { AppShellNavItem, WorkspaceDefinitionDto, WorkspaceSharedContext } from './types';

export interface MobileNavDrawerProps {
	open: boolean;
	onOpenChange: (next: boolean) => void;
	title: string;
	returnLabel: string;
	workspace?: WorkspaceSharedContext;
	resolvedNavItems: AppShellNavItem[];
	resolvedActiveNav?: string;
	workspaces: WorkspaceDefinitionDto[];
	favorites: string[];
	isWorkspaceActive: (ws: WorkspaceDefinitionDto) => boolean;
	toggleFavoriteWorkspace: (workspaceId: string, e?: React.MouseEvent) => void;
}

export function MobileNavDrawer({
	open,
	onOpenChange,
	title,
	returnLabel,
	workspace,
	resolvedNavItems,
	resolvedActiveNav,
	workspaces,
	favorites,
	isWorkspaceActive,
	toggleFavoriteWorkspace,
}: MobileNavDrawerProps): React.ReactElement | null {
	const mobileDrawerRef = useRef<HTMLDialogElement | null>(null);
	const mobileDrawerCtrl = useModalDialogController(mobileDrawerRef, open, onOpenChange);

	if (!open) {
		return null;
	}

	return (
		<PortalRoot ssrFallback={false}>
			<dialog
				ref={mobileDrawerRef}
				aria-label={t('shell.workspaceNavigation', 'Workspace navigation')}
				data-rw-drawer-dialog=""
				data-rw-mobile-drawer=""
				data-rw-portal-overlay=""
				{...({ closedby: 'any' } as Record<string, string>)}
				onPointerDown={mobileDrawerCtrl.handlePointerDown}
				onPointerUp={mobileDrawerCtrl.handlePointerUp}
				onClose={mobileDrawerCtrl.handleClose}
				className="lg:hidden text-card-foreground"
			>
				<div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
					<div className="flex items-center gap-2">
						<DynamicIcon name="layout-grid" className="size-4 text-primary" />
						<span className="text-sm font-semibold">{title}</span>
					</div>
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						aria-label={t('shell.closeNavigationMenu', 'Close navigation menu')}
						className="inline-flex size-8 pointer-coarse:size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
					>
						<DynamicIcon name="x" className="size-4" />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto p-3 space-y-4">
					<div className="grid grid-cols-2 gap-2">
						<a
							href={sanitizeHref(workspace?.adminUrl) || '/processwire/'}
							className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
						>
							<DynamicIcon name="arrow-left" className="size-3.5" />
							<span>{returnLabel}</span>
						</a>
						{sanitizeHref(workspace?.launcherUrl) ? (
							<Link
								href={sanitizeHref(workspace?.launcherUrl)}
								onClick={() => onOpenChange(false)}
								className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary-ink hover:bg-primary/15"
							>
								<DynamicIcon name="layout-grid" className="size-3.5" />
								<span>{t('shell.workspace', 'Workspace')}</span>
							</Link>
						) : null}
					</div>

					{resolvedNavItems.length > 0 ? (
						<div className="space-y-1">
							<div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								{title} Sections
							</div>
							{resolvedNavItems.map((item) => {
								const itemKey = String(item.key ?? item.id ?? item.label);
								const isActive = item.active ?? itemKey === resolvedActiveNav;
								const cls = cn(
									'flex w-full min-h-8 pointer-coarse:min-h-11 items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-colors',
									isActive
										? 'bg-primary/12 text-primary-ink font-semibold'
										: 'text-foreground hover:bg-muted'
								);
								if (item.onClick) {
									return (
										<button
											key={itemKey}
											type="button"
											onClick={() => {
												item.onClick?.();
												onOpenChange(false);
											}}
											className={cls}
										>
											<span className="flex items-center gap-2">
												{item.icon ? <DynamicIcon name={item.icon} className="size-3.5" /> : null}
												<span>{item.label}</span>
											</span>
											{item.badge !== undefined && item.badge !== null && item.badge !== '' ? (
												<Badge variant="secondary" mono className="px-1.5 py-0 text-[11px]">
													{item.badge}
												</Badge>
											) : null}
										</button>
									);
								}
								const safeMobileHref = item.href ? sanitizeHref(item.href) : '';
								if (safeMobileHref) {
									return (
										<Link
											key={itemKey}
											href={safeMobileHref}
											onClick={() => onOpenChange(false)}
											className={cls}
										>
											<span className="flex items-center gap-2">
												{item.icon ? <DynamicIcon name={item.icon} className="size-3.5" /> : null}
												<span>{item.label}</span>
											</span>
											{item.badge !== undefined && item.badge !== null && item.badge !== '' ? (
												<Badge variant="secondary" mono className="px-1.5 py-0 text-[11px]">
													{item.badge}
												</Badge>
											) : null}
										</Link>
									);
								}
								return null;
							})}
						</div>
					) : null}

					{workspaces.length > 0 ? (
						<div className="space-y-1">
							<div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
								Workspaces ({workspaces.length})
							</div>
							{workspaces.map((ws) => {
								const isCurrent = isWorkspaceActive(ws);
								const isFav = favorites.includes(ws.id.toLowerCase());
								const safeMobileWsUrl = sanitizeHref(withWorkspaceShellUrl(ws.url, true)) || '#';
								return (
									<div key={ws.id} className="flex items-center justify-between gap-1">
										{ws.component ? (
											<Link
												href={safeMobileWsUrl}
												onClick={() => onOpenChange(false)}
												className={cn(
													'flex flex-1 min-h-8 pointer-coarse:min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors min-w-0',
													isCurrent
														? 'bg-primary/12 text-primary-ink font-semibold'
														: 'text-foreground hover:bg-muted'
												)}
											>
												<DynamicIcon name={ws.icon} className="size-4 shrink-0 text-primary" />
												<span className="truncate">{ws.title}</span>
											</Link>
										) : (
											<a
												href={safeMobileWsUrl}
												className="flex flex-1 min-h-8 pointer-coarse:min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted min-w-0"
											>
												<DynamicIcon name={ws.icon} className="size-4 shrink-0 text-primary" />
												<span className="truncate">{ws.title}</span>
											</a>
										)}
										<button
											type="button"
											onClick={(e) => toggleFavoriteWorkspace(ws.id, e)}
											aria-label={isFav ? `Unpin ${ws.title}` : `Pin ${ws.title}`}
											className={cn(
												'inline-flex size-8 pointer-coarse:size-11 items-center justify-center rounded-md transition-colors cursor-pointer shrink-0',
												isFav ? 'text-warning' : 'text-muted-foreground/50 hover:text-foreground'
											)}
										>
											<DynamicIcon name="star" className={cn('size-3.5', isFav && 'fill-current')} />
										</button>
									</div>
								);
							})}
						</div>
					) : null}
				</div>

				{workspace?.user ? (
					<div className="border-t border-border px-4 py-3 flex items-center justify-between text-xs text-muted-foreground shrink-0">
						<span className="font-medium text-foreground">{workspace.user.name}</span>
						<Badge variant="outline">
							{workspace.user.isSuperuser ? 'Superuser' : 'Standard'}
						</Badge>
					</div>
				) : null}
			</dialog>
		</PortalRoot>
	);
}
