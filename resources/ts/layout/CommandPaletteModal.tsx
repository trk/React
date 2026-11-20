import React, { useId, useRef } from 'react';
import { SafeLink as Link, withWorkspaceShellUrl } from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../lib/utils';
import { PortalRoot, useModalDialogController } from '../ui';
import type { ThemeMode } from '../hooks';
import type {
	AppShellNavItem,
	CommandPaletteItem,
	WorkspaceDefinitionDto,
	WorkspaceSharedContext,
} from './types';

export function buildCommandPaletteItems({
	workspaces,
	resolvedNavItems,
	title,
	workspace,
	returnLabel,
	commandQuery,
	showGlobalWorkspaceBar,
	onSetThemeMode,
	onOpenShortcuts,
}: {
	workspaces: WorkspaceDefinitionDto[];
	resolvedNavItems: AppShellNavItem[];
	title: string;
	workspace?: WorkspaceSharedContext;
	returnLabel: string;
	commandQuery: string;
	showGlobalWorkspaceBar: boolean;
	onSetThemeMode?: (mode: ThemeMode) => void;
	onOpenShortcuts?: () => void;
}): CommandPaletteItem[] {
	const q = commandQuery.trim().toLowerCase();
	const items: CommandPaletteItem[] = [];

	for (const ws of workspaces) {
		items.push({
			id: `ws-${ws.id}`,
			label: ws.title,
			subtitle: ws.description || ws.category || 'Workspace',
			icon: ws.icon || 'cubes',
			href: withWorkspaceShellUrl(ws.url, showGlobalWorkspaceBar),
			isInertia: showGlobalWorkspaceBar && Boolean(ws.component),
		});
	}

	for (const nav of resolvedNavItems) {
		const navKey = String(nav.key ?? nav.id ?? nav.label);
		items.push({
			id: `sec-${navKey}`,
			label: `${title}: ${nav.label}`,
			subtitle: t('shell.currentWorkspaceSection', 'Current workspace section'),
			icon: nav.icon || 'layers',
			href: nav.href,
			onClick: nav.onClick,
			isInertia: true,
		});
	}

	if (workspace?.launcherUrl) {
		items.push({
			id: 'global-workspace-launcher',
			label: t('shell.workspaceDashboard', 'Workspace Dashboard'),
			subtitle: t('shell.workspaceDashboardSubtitle', 'All modules, favorites, and customizable dashboard widgets'),
			icon: 'layout-grid',
			href: workspace.launcherUrl,
			isInertia: showGlobalWorkspaceBar,
		});
	}

	if (showGlobalWorkspaceBar) {
		items.push({
			id: 'global-admin-return',
			label: t('shell.returnToTarget', { target: returnLabel }, 'Return to {target}'),
			subtitle: workspace?.adminUrl || '/processwire/',
			icon: 'arrow-left',
			href: workspace?.adminUrl || '/processwire/',
			isInertia: false,
		});
	}

	const viewSiteUrl = sanitizeHref(workspace?.user?.viewSiteUrl);
	if (viewSiteUrl) {
		items.push({
			id: 'action-view-site',
			label: t('shell.viewSite', 'View site'),
			subtitle: viewSiteUrl,
			icon: 'eye',
			href: viewSiteUrl,
			isInertia: false,
		});
	}

	if (onSetThemeMode) {
		items.push(
			{
				id: 'theme-mode-light',
				label: `${t('shell.theme', 'Theme')}: ${t('shell.themeLight', 'Light')}`,
				subtitle: t('shell.themeMode', 'Appearance'),
				icon: 'sun',
				onClick: () => onSetThemeMode('light'),
			},
			{
				id: 'theme-mode-dark',
				label: `${t('shell.theme', 'Theme')}: ${t('shell.themeDark', 'Dark')}`,
				subtitle: t('shell.themeMode', 'Appearance'),
				icon: 'moon',
				onClick: () => onSetThemeMode('dark'),
			},
			{
				id: 'theme-mode-system',
				label: `${t('shell.theme', 'Theme')}: ${t('shell.themeSystem', 'System')}`,
				subtitle: t('shell.themeMode', 'Appearance'),
				icon: 'monitor',
				onClick: () => onSetThemeMode('system'),
			}
		);
	}

	if (onOpenShortcuts) {
		items.push({
			id: 'action-keyboard-shortcuts',
			label: t('shell.keyboardShortcuts', 'Keyboard shortcuts'),
			subtitle: t('shortcuts.pressHint', 'Press ? anytime to toggle this help dialog.'),
			icon: 'keyboard',
			onClick: onOpenShortcuts,
		});
	}

	if (!q) {
		return items;
	}
	return items.filter((item) => `${item.label} ${item.subtitle}`.toLowerCase().includes(q));
}

export interface CommandPaletteModalProps {
	open: boolean;
	onOpenChange: (next: boolean) => void;
	query: string;
	onQueryChange: (next: string) => void;
	activeIndex: number;
	onActiveIndexChange: (next: number) => void;
	items: CommandPaletteItem[];
	onExecuteItem: (item: CommandPaletteItem | undefined) => void;
}

export function CommandPaletteModal({
	open,
	onOpenChange,
	query,
	onQueryChange,
	activeIndex,
	onActiveIndexChange,
	items,
	onExecuteItem,
}: CommandPaletteModalProps): React.ReactElement | null {
	const commandListId = useId();
	const commandDialogRef = useRef<HTMLDialogElement | null>(null);
	const commandDialogCtrl = useModalDialogController(commandDialogRef, open, onOpenChange);

	if (!open) {
		return null;
	}

	return (
		<PortalRoot ssrFallback={false}>
			<dialog
				ref={commandDialogRef}
				aria-label={t('shell.quickSwitcher', 'Quick Switcher')}
				data-rw-command-dialog=""
				data-rw-command-palette=""
				data-rw-portal-overlay=""
				{...({ closedby: 'any' } as Record<string, string>)}
				onPointerDown={commandDialogCtrl.handlePointerDown}
				onPointerUp={commandDialogCtrl.handlePointerUp}
				onClose={commandDialogCtrl.handleClose}
				className="text-popover-foreground"
			>
				<div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
					<DynamicIcon name="search" className="size-4 text-muted-foreground" aria-hidden="true" />
					<input
						type="search"
						role="combobox"
						aria-expanded={true}
						aria-controls={commandListId}
						aria-activedescendant={
							items[activeIndex] ? `${commandListId}-opt-${items[activeIndex].id}` : undefined
						}
						autoFocus
						value={query}
						onChange={(e) => onQueryChange(e.target.value)}
						onKeyDown={(e) => {
							const count = items.length;
							if (e.key === 'ArrowDown' && count > 0) {
								e.preventDefault();
								onActiveIndexChange((activeIndex + 1) % count);
							} else if (e.key === 'ArrowUp' && count > 0) {
								e.preventDefault();
								onActiveIndexChange((activeIndex - 1 + count) % count);
							} else if (e.key === 'Home' && count > 0) {
								e.preventDefault();
								onActiveIndexChange(0);
							} else if (e.key === 'End' && count > 0) {
								e.preventDefault();
								onActiveIndexChange(count - 1);
							} else if (e.key === 'Enter' && count > 0) {
								e.preventDefault();
								onExecuteItem(items[activeIndex] || items[0]);
							}
						}}
						aria-label={t('shell.searchWorkspacesLabel', 'Search workspaces')}
						placeholder={t('shell.jumpPlaceholder', 'Jump to workspace or section...')}
						className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
					/>
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						aria-label={t('common.close', 'Close')}
						className="inline-flex min-h-6 items-center rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted cursor-pointer"
					>
						ESC
					</button>
				</div>
				<div
					id={commandListId}
					role="listbox"
					aria-label={t('shell.quickSwitcher', 'Quick Switcher')}
					className="max-h-80 overflow-y-auto p-2 divide-y divide-border/40"
				>
					{items.length === 0 ? (
						<div className="py-6 text-center text-xs text-muted-foreground">
							{t('shell.noMatchingDestinations', 'No matching destinations found.')}
						</div>
					) : (
						items.map((item, idx) => {
							const isSelected = idx === activeIndex;
							const optionId = `${commandListId}-opt-${item.id}`;
							const itemCls = cn(
								'flex w-full items-center gap-3 rounded-md px-2.5 py-2 transition-colors cursor-pointer',
								isSelected ? 'bg-muted text-foreground' : 'hover:bg-muted/60'
							);
							const inner = (
								<>
									<span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
										<DynamicIcon name={item.icon} className="size-3.5" />
									</span>
									<div className="min-w-0 flex-1 text-left">
										<div className="truncate text-xs font-medium text-foreground">
											{item.label}
										</div>
										<div className="truncate text-[11px] text-muted-foreground">
											{item.subtitle}
										</div>
									</div>
									<DynamicIcon name="arrow-right" className="size-3.5 text-muted-foreground" />
								</>
							);
							if (item.onClick) {
								return (
									<button
										key={item.id}
										id={optionId}
										role="option"
										aria-selected={isSelected}
										type="button"
										onMouseEnter={() => onActiveIndexChange(idx)}
										onClick={() => {
											item.onClick?.();
											onOpenChange(false);
										}}
										className={itemCls}
									>
										{inner}
									</button>
								);
							}
							const safeItemHref = sanitizeHref(item.href);
							if (safeItemHref && item.isInertia) {
								return (
									<Link
										key={item.id}
										id={optionId}
										role="option"
										aria-selected={isSelected}
										href={safeItemHref}
										onMouseEnter={() => onActiveIndexChange(idx)}
										onClick={() => onOpenChange(false)}
										className={itemCls}
									>
										{inner}
									</Link>
								);
							}
							return (
								<a
									key={item.id}
									id={optionId}
									role="option"
									aria-selected={isSelected}
									href={safeItemHref || '#'}
									onMouseEnter={() => onActiveIndexChange(idx)}
									className={itemCls}
								>
									{inner}
								</a>
							);
						})
					)}
				</div>
			</dialog>
		</PortalRoot>
	);
}
