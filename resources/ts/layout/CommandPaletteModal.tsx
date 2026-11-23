import React, { useEffect, useId, useMemo, useRef } from 'react';
import { SafeLink as Link, withWorkspaceShellUrl } from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../lib/utils';
import { PortalRoot, useModalDialogController } from '../ui';
import type { ThemeMode, ThemePresetId, ThemePresetMeta } from '../hooks';
import type {
	AppShellNavItem,
	CommandPaletteItem,
	ShellLayoutDescriptorDto,
	ShellLayoutId,
	WorkspaceDefinitionDto,
	WorkspaceSharedContext,
} from './types';

export interface BuildCommandPaletteItemsOptions {
	workspaces: WorkspaceDefinitionDto[];
	resolvedNavItems: AppShellNavItem[];
	title: string;
	workspace?: WorkspaceSharedContext;
	returnLabel: string;
	commandQuery: string;
	showGlobalWorkspaceBar: boolean;
	remoteItems?: CommandPaletteItem[];
	availableShellLayouts?: ShellLayoutDescriptorDto[];
	supportsSidebarCollapse?: boolean;
	sidebarCollapsed?: boolean;
	availableThemePresets?: readonly ThemePresetMeta[];
	onSetThemeMode?: (mode: ThemeMode) => void;
	onSetThemePreset?: (preset: ThemePresetId | '') => void;
	onSetShellLayout?: (layout: ShellLayoutId | '') => void;
	onToggleSidebarCollapsed?: () => void;
	onOpenShortcuts?: () => void;
}

export interface CommandPaletteGroup {
	label: string;
	items: Array<{ item: CommandPaletteItem; flatIndex: number }>;
}

export interface CommandPaletteKeyAction {
	nextIndex?: number;
	executeIndex?: number;
	preventDefault: boolean;
}

/**
 * Compute keyboard navigation state transitions for the flat ordered command palette options.
 */
export function resolveCommandPaletteKeyAction(
	key: string,
	activeIndex: number,
	count: number
): CommandPaletteKeyAction {
	if (count <= 0) {
		return { preventDefault: false };
	}
	const safeIndex = Math.min(Math.max(0, activeIndex), count - 1);
	if (key === 'ArrowDown') {
		return { nextIndex: (safeIndex + 1) % count, preventDefault: true };
	}
	if (key === 'ArrowUp') {
		return { nextIndex: (safeIndex - 1 + count) % count, preventDefault: true };
	}
	if (key === 'Home') {
		return { nextIndex: 0, preventDefault: true };
	}
	if (key === 'End') {
		return { nextIndex: count - 1, preventDefault: true };
	}
	if (key === 'Enter') {
		return { executeIndex: safeIndex, preventDefault: true };
	}
	return { preventDefault: false };
}

/**
 * Scroll the currently highlighted palette option into view without jarring viewport jumps.
 */
export function scrollActiveOptionIntoView(
	element: { scrollIntoView?: (options?: ScrollIntoViewOptions) => void } | null | undefined
): void {
	if (element && typeof element.scrollIntoView === 'function') {
		element.scrollIntoView({ block: 'nearest' });
	}
}

/**
 * Group items into labeled sections while preserving first-seen group order and contiguous flat indices.
 */
export function groupCommandPaletteItems(
	items: CommandPaletteItem[],
	fallbackGroup = t('shell.groupActions', 'Actions')
): { groups: CommandPaletteGroup[]; orderedItems: CommandPaletteItem[] } {
	const bucketMap = new Map<string, CommandPaletteItem[]>();
	const groupOrder: string[] = [];

	for (const item of items) {
		const rawGroup = typeof item.group === 'string' ? item.group.trim() : '';
		const groupName = rawGroup !== '' ? rawGroup : fallbackGroup;
		let bucket = bucketMap.get(groupName);
		if (!bucket) {
			bucket = [];
			bucketMap.set(groupName, bucket);
			groupOrder.push(groupName);
		}
		bucket.push(item);
	}

	const orderedItems: CommandPaletteItem[] = [];
	const groups: CommandPaletteGroup[] = [];

	for (const label of groupOrder) {
		const bucket = bucketMap.get(label) ?? [];
		const entries: Array<{ item: CommandPaletteItem; flatIndex: number }> = [];
		for (const item of bucket) {
			entries.push({ item, flatIndex: orderedItems.length });
			orderedItems.push(item);
		}
		groups.push({ label, items: entries });
	}

	return { groups, orderedItems };
}

/**
 * Assemble and filter grouped Command Palette 2.0 entries across records, current workspace,
 * workspaces, layout & appearance controls, and shell actions.
 */
export function buildCommandPaletteItems({
	workspaces,
	resolvedNavItems,
	title,
	workspace,
	returnLabel,
	commandQuery,
	showGlobalWorkspaceBar,
	remoteItems = [],
	availableShellLayouts = [],
	supportsSidebarCollapse = false,
	sidebarCollapsed = false,
	availableThemePresets = [],
	onSetThemeMode,
	onSetThemePreset,
	onSetShellLayout,
	onToggleSidebarCollapsed,
	onOpenShortcuts,
}: BuildCommandPaletteItemsOptions): CommandPaletteItem[] {
	const q = commandQuery.trim().toLowerCase();
	const currentWsGroup = t('shell.groupCurrentWorkspace', 'Current Workspace');
	const workspacesGroup = t('shell.groupWorkspaces', 'Workspaces');
	const appearanceGroup = t('shell.groupAppearance', 'Layout & Appearance');
	const actionsGroup = t('shell.groupActions', 'Actions');
	const recordsGroup = t('shell.groupRecords', 'Matching Records');

	const localItems: CommandPaletteItem[] = [];
	const seenSectionIds = new Set<string>();

	const pushNavItems = (
		list: AppShellNavItem[],
		parentLabel?: string,
		parentKey?: string,
		depth = 0
	): void => {
		if (depth > 3) {
			return;
		}
		for (const nav of list) {
			const rawKey = String(nav.key ?? nav.id ?? nav.label);
			const navKey = parentKey ? `${parentKey}-${rawKey}` : rawKey;
			const navLabel = parentLabel ? `${parentLabel} › ${nav.label}` : nav.label;
			const itemId = `sec-${navKey}`;
			const badgeStr =
				nav.badge !== null && nav.badge !== undefined && String(nav.badge).trim() !== ''
					? String(nav.badge).trim()
					: undefined;

			if ((nav.href || nav.onClick) && !seenSectionIds.has(itemId)) {
				seenSectionIds.add(itemId);
				localItems.push({
					id: itemId,
					label: `${title}: ${navLabel}`,
					subtitle: t('shell.currentWorkspaceSection', 'Current workspace section'),
					badge: badgeStr,
					group: currentWsGroup,
					icon: nav.icon || 'layers',
					href: nav.href,
					onClick: nav.onClick,
					isInertia: true,
				});
			}

			if (Array.isArray(nav.children) && nav.children.length > 0) {
				pushNavItems(nav.children, navLabel, navKey, depth + 1);
			}
		}
	};

	pushNavItems(resolvedNavItems);

	for (const ws of workspaces) {
		localItems.push({
			id: `ws-${ws.id}`,
			label: ws.title,
			subtitle: ws.description || ws.category || t('shell.workspace', 'Workspace'),
			badge: ws.badge || undefined,
			group: workspacesGroup,
			icon: ws.icon || 'cubes',
			href: withWorkspaceShellUrl(
				ws.url,
				showGlobalWorkspaceBar,
				workspace?.adminUrl,
				workspace?.launcherUrl
			),
			isInertia: showGlobalWorkspaceBar && Boolean(ws.component),
		});
	}

	if (workspace?.launcherUrl) {
		localItems.push({
			id: 'global-workspace-launcher',
			label: t('shell.workspaceDashboard', 'Workspace Dashboard'),
			subtitle: t(
				'shell.workspaceDashboardSubtitle',
				'All modules, favorites, and customizable dashboard widgets'
			),
			group: workspacesGroup,
			icon: 'layout-grid',
			href: workspace.launcherUrl,
			isInertia: showGlobalWorkspaceBar,
		});
	}

	if (onSetShellLayout && availableShellLayouts.length > 0) {
		for (const layout of availableShellLayouts) {
			const layoutLabel = layout.labelKey ? t(layout.labelKey, layout.label) : layout.label;
			const layoutDesc = layout.descriptionKey
				? t(layout.descriptionKey, layout.description || layoutLabel)
				: layout.description;
			localItems.push({
				id: `layout-shell-${layout.id}`,
				label: t('shell.layoutOption', { layout: layoutLabel }, 'Layout: {layout}'),
				subtitle: layoutDesc || t('shell.panelLayout', 'Panel Layout'),
				group: appearanceGroup,
				icon: layout.icon || (layout.id === 'sidebar' ? 'layout-sidebar' : 'layout-navbar'),
				onClick: () => onSetShellLayout(layout.id),
			});
		}
	}

	if (supportsSidebarCollapse && onToggleSidebarCollapsed) {
		localItems.push({
			id: 'layout-toggle-sidebar',
			label: t('shell.toggleSidebarShortcut', 'Toggle sidebar'),
			subtitle: t('shell.panelLayout', 'Panel Layout'),
			group: appearanceGroup,
			icon: sidebarCollapsed ? 'layout-sidebar-left-expand' : 'layout-sidebar-left-collapse',
			onClick: () => onToggleSidebarCollapsed(),
		});
	}

	if (onSetThemeMode) {
		localItems.push(
			{
				id: 'theme-mode-light',
				label: `${t('shell.theme', 'Theme')}: ${t('shell.themeLight', 'Light')}`,
				subtitle: t('shell.themeMode', 'Appearance'),
				group: appearanceGroup,
				icon: 'sun',
				onClick: () => onSetThemeMode('light'),
			},
			{
				id: 'theme-mode-dark',
				label: `${t('shell.theme', 'Theme')}: ${t('shell.themeDark', 'Dark')}`,
				subtitle: t('shell.themeMode', 'Appearance'),
				group: appearanceGroup,
				icon: 'moon',
				onClick: () => onSetThemeMode('dark'),
			},
			{
				id: 'theme-mode-system',
				label: `${t('shell.theme', 'Theme')}: ${t('shell.themeSystem', 'System')}`,
				subtitle: t('shell.themeMode', 'Appearance'),
				group: appearanceGroup,
				icon: 'device-desktop',
				onClick: () => onSetThemeMode('system'),
			}
		);
	}

	if (onSetThemePreset && availableThemePresets.length > 0) {
		for (const preset of availableThemePresets) {
			const presetLabel = t(preset.labelKey, preset.defaultLabel);
			localItems.push({
				id: `theme-preset-${preset.id}`,
				label: t('shell.themePresetOption', { preset: presetLabel }, 'Color Scheme: {preset}'),
				subtitle: t('shell.colorScheme', 'Color Scheme'),
				group: appearanceGroup,
				icon: 'palette',
				onClick: () => onSetThemePreset(preset.id),
			});
		}
	}

	if (showGlobalWorkspaceBar) {
		localItems.push({
			id: 'global-admin-return',
			label: t('shell.returnToTarget', { target: returnLabel }, 'Return to {target}'),
			subtitle: workspace?.adminUrl || '/processwire/',
			group: actionsGroup,
			icon: 'arrow-left',
			href: workspace?.adminUrl || '/processwire/',
			isInertia: false,
		});
	}

	const viewSiteUrl = sanitizeHref(workspace?.user?.viewSiteUrl);
	if (viewSiteUrl) {
		localItems.push({
			id: 'action-view-site',
			label: t('shell.viewSite', 'View site'),
			subtitle: viewSiteUrl,
			group: actionsGroup,
			icon: 'eye',
			href: viewSiteUrl,
			isInertia: false,
		});
	}

	if (onOpenShortcuts) {
		localItems.push({
			id: 'action-keyboard-shortcuts',
			label: t('shell.keyboardShortcuts', 'Keyboard shortcuts'),
			subtitle: t('shortcuts.pressHint', 'Press ? anytime to toggle this help dialog.'),
			group: actionsGroup,
			icon: 'keyboard',
			onClick: onOpenShortcuts,
		});
	}

	const filteredLocal = q
		? localItems.filter((item) =>
				`${item.label} ${item.subtitle} ${item.badge ?? ''} ${item.group ?? ''}`
					.toLowerCase()
					.includes(q)
			)
		: localItems;

	const normalizedRemote = remoteItems.map((item) => ({
		...item,
		group: item.group && item.group.trim() !== '' ? item.group.trim() : recordsGroup,
	}));

	return [...normalizedRemote, ...filteredLocal];
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
	searching?: boolean;
	hasSearchEndpoint?: boolean;
}

/**
 * Inner grouped search UI for Command Palette 2.0 (exported separately for deterministic SSR/unit tests).
 */
export function CommandPaletteContent({
	open,
	onOpenChange,
	query,
	onQueryChange,
	activeIndex,
	onActiveIndexChange,
	items,
	onExecuteItem,
	searching = false,
	hasSearchEndpoint = false,
}: CommandPaletteModalProps): React.ReactElement {
	const commandListId = useId();
	const optionElementsRef = useRef<Map<string, HTMLElement>>(new Map());
	const fallbackGroup = t('shell.groupActions', 'Actions');

	const { groups, orderedItems } = useMemo(
		() => groupCommandPaletteItems(items, fallbackGroup),
		[items, fallbackGroup]
	);

	const clampedActiveIndex =
		orderedItems.length > 0 ? Math.min(Math.max(0, activeIndex), orderedItems.length - 1) : 0;
	const activeItem = orderedItems[clampedActiveIndex];
	const activeItemId = activeItem?.id ?? '';

	useEffect(() => {
		if (!open || !activeItemId) {
			return;
		}
		scrollActiveOptionIntoView(optionElementsRef.current.get(activeItemId));
	}, [open, clampedActiveIndex, activeItemId]);

	const placeholderText = hasSearchEndpoint
		? t('shell.jumpRecordsPlaceholder', 'Jump to workspace, section, or record...')
		: t('shell.jumpPlaceholder', 'Jump to workspace or section...');

	return (
		<>
			<div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
				<DynamicIcon name="search" className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<input
					type="search"
					role="combobox"
					aria-expanded={true}
					aria-controls={commandListId}
					aria-activedescendant={activeItem ? `${commandListId}-opt-${activeItem.id}` : undefined}
					autoFocus
					value={query}
					onChange={(e) => onQueryChange(e.target.value)}
					onKeyDown={(e) => {
						const action = resolveCommandPaletteKeyAction(
							e.key,
							clampedActiveIndex,
							orderedItems.length
						);
						if (!action.preventDefault) {
							return;
						}
						e.preventDefault();
						if (action.nextIndex !== undefined) {
							onActiveIndexChange(action.nextIndex);
						} else if (action.executeIndex !== undefined) {
							onExecuteItem(orderedItems[action.executeIndex] || orderedItems[0]);
						}
					}}
					aria-label={t('shell.searchWorkspacesLabel', 'Search workspaces')}
					placeholder={placeholderText}
					className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
				/>
				{searching ? (
					<span
						role="status"
						aria-live="polite"
						data-rw-command-searching=""
						className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
					>
						<DynamicIcon name="loader-2" className="size-3.5 animate-spin" aria-hidden="true" />
						<span className="sr-only sm:not-sr-only">
							{t('shell.searchingRecords', 'Searching records...')}
						</span>
					</span>
				) : null}
				<button
					type="button"
					onClick={() => onOpenChange(false)}
					aria-label={t('common.close', 'Close')}
					className="inline-flex min-h-6 shrink-0 items-center rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted cursor-pointer"
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
				{orderedItems.length === 0 ? (
					<div className="py-6 text-center text-xs text-muted-foreground">
						{t('shell.noMatchingDestinations', 'No matching destinations found.')}
					</div>
				) : (
					groups.map((grp) => (
						<div
							key={grp.label}
							role="group"
							aria-label={grp.label}
							data-rw-command-group={grp.label}
							className="py-1.5 first:pt-0 last:pb-0"
						>
							<div
								aria-hidden="true"
								className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
							>
								{grp.label}
							</div>
							<div className="space-y-0.5">
								{grp.items.map(({ item, flatIndex }) => {
									const isSelected = flatIndex === clampedActiveIndex;
									const optionId = `${commandListId}-opt-${item.id}`;
									const itemCls = cn(
										'flex w-full items-center gap-3 rounded-md px-2.5 py-2 transition-colors cursor-pointer',
										isSelected ? 'bg-muted text-foreground' : 'hover:bg-muted/60'
									);
									const bindOptionRef = (el: HTMLElement | null): void => {
										if (el) {
											optionElementsRef.current.set(item.id, el);
										} else {
											optionElementsRef.current.delete(item.id);
										}
									};
									const inner = (
										<>
											<span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
												<DynamicIcon name={item.icon} className="size-3.5" aria-hidden="true" />
											</span>
											<div className="min-w-0 flex-1 text-left">
												<div className="truncate text-xs font-medium text-foreground">
													{item.label}
												</div>
												<div className="truncate text-[11px] text-muted-foreground">
													{item.subtitle}
												</div>
											</div>
											{item.badge ? (
												<span
													data-rw-command-badge=""
													className="inline-flex shrink-0 items-center rounded border border-border bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80"
												>
													{item.badge}
												</span>
											) : null}
											<DynamicIcon
												name="arrow-right"
												className="size-3.5 shrink-0 text-muted-foreground"
												aria-hidden="true"
											/>
										</>
									);

									if (item.onClick) {
										return (
											<button
												key={item.id}
												ref={bindOptionRef}
												id={optionId}
												role="option"
												aria-selected={isSelected}
												type="button"
												onMouseEnter={() => onActiveIndexChange(flatIndex)}
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
												ref={bindOptionRef}
												id={optionId}
												role="option"
												aria-selected={isSelected}
												href={safeItemHref}
												onMouseEnter={() => onActiveIndexChange(flatIndex)}
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
											ref={bindOptionRef}
											id={optionId}
											role="option"
											aria-selected={isSelected}
											href={safeItemHref || '#'}
											onMouseEnter={() => onActiveIndexChange(flatIndex)}
											onClick={() => onOpenChange(false)}
											className={itemCls}
										>
											{inner}
										</a>
									);
								})}
							</div>
						</div>
					))
				)}
			</div>
		</>
	);
}

export function CommandPaletteModal(props: CommandPaletteModalProps): React.ReactElement | null {
	const commandDialogRef = useRef<HTMLDialogElement | null>(null);
	const commandDialogCtrl = useModalDialogController(
		commandDialogRef,
		props.open,
		props.onOpenChange
	);

	if (!props.open) {
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
				<CommandPaletteContent {...props} />
			</dialog>
		</PortalRoot>
	);
}
