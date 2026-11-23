import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import {
	isInertiaAppActive,
	SafeLink as Link,
	safeRouter as router,
	withWorkspaceShellUrl,
} from '../lib/inertia-bridge';
import { cn, DynamicIcon, sanitizeHref } from '../lib/utils';
import { Input, Popover, PopoverContent, PopoverTrigger } from '../ui';
import type { WorkspaceDefinitionDto, WorkspaceSharedContext } from './types';

export interface ModuleSwitcherProps {
	workspace?: WorkspaceSharedContext;
	workspaces: WorkspaceDefinitionDto[];
	activeWorkspace?: WorkspaceDefinitionDto | null;
	favorites: string[];
	isWorkspaceActive: (ws: WorkspaceDefinitionDto) => boolean;
	toggleFavoriteWorkspace: (workspaceId: string, e?: React.MouseEvent) => Promise<void> | void;
	shellMode: 'workspace' | 'admin';
	returnLabel: string;
	collapsed?: boolean;
	title?: string;
	icon?: string;
	onNavigate?: () => void;
	className?: string;
}

export function ModuleSwitcher({
	workspace,
	workspaces,
	activeWorkspace,
	favorites,
	isWorkspaceActive,
	toggleFavoriteWorkspace,
	shellMode,
	returnLabel,
	collapsed = false,
	title,
	icon,
	onNavigate,
	className,
}: ModuleSwitcherProps): React.ReactElement {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [activeIndex, setActiveIndex] = useState(0);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

	const activeTitle = activeWorkspace?.title || title || t('shell.workspace', 'Workspace');
	const activeSubtitle =
		activeWorkspace?.category ||
		activeWorkspace?.subtitle ||
		workspace?.appName ||
		t('shell.workspaceDashboard', 'Workspace Dashboard');
	const activeIcon = activeWorkspace?.icon || icon || 'layout-grid';

	const favSet = useMemo(
		() => new Set(favorites.map((id) => String(id).toLowerCase())),
		[favorites]
	);

	const { pinnedWorkspaces, unpinnedWorkspaces, filteredWorkspaces, flatItems } = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (q !== '') {
			const matched = workspaces.filter((ws) =>
				`${ws.title} ${ws.subtitle || ''} ${ws.category || ''} ${ws.description || ''}`
					.toLowerCase()
					.includes(q)
			);
			return {
				pinnedWorkspaces: [] as WorkspaceDefinitionDto[],
				unpinnedWorkspaces: [] as WorkspaceDefinitionDto[],
				filteredWorkspaces: matched,
				flatItems: matched,
			};
		}
		const pinned = workspaces.filter((ws) => favSet.has(ws.id.toLowerCase()));
		const unpinned = workspaces.filter((ws) => !favSet.has(ws.id.toLowerCase()));
		return {
			pinnedWorkspaces: pinned,
			unpinnedWorkspaces: unpinned,
			filteredWorkspaces: [] as WorkspaceDefinitionDto[],
			flatItems: [...pinned, ...unpinned],
		};
	}, [workspaces, favSet, query]);

	useEffect(() => {
		setActiveIndex(0);
	}, [query, open]);

	useEffect(() => {
		if (!open || typeof window === 'undefined') {
			return;
		}
		const frameId = window.requestAnimationFrame(() => {
			searchInputRef.current?.focus();
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [open]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const current = flatItems[activeIndex];
		if (!current) {
			return;
		}
		rowRefs.current.get(current.id)?.scrollIntoView({ block: 'nearest' });
	}, [activeIndex, flatItems, open]);

	const resolveWorkspaceUrl = (ws: WorkspaceDefinitionDto): string =>
		sanitizeHref(
			withWorkspaceShellUrl(
				ws.url,
				shellMode === 'workspace',
				workspace?.adminUrl,
				workspace?.launcherUrl
			)
		) || '#';

	const navigateToWorkspace = (ws: WorkspaceDefinitionDto) => {
		const targetHref = resolveWorkspaceUrl(ws);
		setOpen(false);
		onNavigate?.();
		if (targetHref === '#') {
			return;
		}
		if (ws.component && isInertiaAppActive()) {
			router.visit(targetHref);
		} else if (typeof window !== 'undefined') {
			window.location.href = targetHref;
		}
	};

	const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		const count = flatItems.length;
		if (e.key === 'ArrowDown' && count > 0) {
			e.preventDefault();
			setActiveIndex((prev) => (prev + 1) % count);
		} else if (e.key === 'ArrowUp' && count > 0) {
			e.preventDefault();
			setActiveIndex((prev) => (prev - 1 + count) % count);
		} else if (e.key === 'Home' && count > 0) {
			e.preventDefault();
			setActiveIndex(0);
		} else if (e.key === 'End' && count > 0) {
			e.preventDefault();
			setActiveIndex(count - 1);
		} else if (e.key === 'Enter' && count > 0) {
			e.preventDefault();
			const selected = flatItems[activeIndex] ?? flatItems[0];
			if (selected) {
				navigateToWorkspace(selected);
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			setOpen(false);
			if (typeof window !== 'undefined') {
				window.requestAnimationFrame(() => triggerRef.current?.focus());
			}
		}
	};

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (nextOpen) {
			setQuery('');
			setActiveIndex(0);
		}
	};

	const safeLauncherHref = sanitizeHref(workspace?.launcherUrl);
	const safeAdminHref = sanitizeHref(workspace?.adminUrl);

	const renderWorkspaceRow = (ws: WorkspaceDefinitionDto, flatIndex: number) => {
		const isCurrent = isWorkspaceActive(ws);
		const isFav = favSet.has(ws.id.toLowerCase());
		const isHighlighted = flatIndex === activeIndex;
		const targetHref = resolveWorkspaceUrl(ws);

		const rowLinkClass = cn(
			'flex flex-1 min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
			isCurrent
				? 'bg-primary/12 text-primary-ink font-semibold'
				: isHighlighted
					? 'bg-muted text-foreground'
					: 'text-popover-foreground hover:bg-muted'
		);

		const linkInner = (
			<>
				<span
					className={cn(
						'inline-flex size-7 shrink-0 items-center justify-center rounded-md border',
						isCurrent
							? 'border-primary/25 bg-primary/15 text-primary'
							: 'border-border/60 bg-muted/50 text-muted-foreground'
					)}
				>
					<DynamicIcon name={ws.icon} className="size-3.5" aria-hidden="true" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate font-medium leading-snug">{ws.title}</span>
					{ws.category || ws.subtitle ? (
						<span className="block truncate text-[11px] leading-tight text-muted-foreground">
							{ws.category || ws.subtitle}
						</span>
					) : null}
				</span>
				{isCurrent ? (
					<DynamicIcon name="check" className="size-3.5 shrink-0 text-primary-ink" aria-hidden="true" />
				) : null}
			</>
		);

		return (
			<div
				key={ws.id}
				ref={(node) => {
					if (node) {
						rowRefs.current.set(ws.id, node);
					} else {
						rowRefs.current.delete(ws.id);
					}
				}}
				data-rw-module-switcher-item={ws.id}
				onMouseEnter={() => setActiveIndex(flatIndex)}
				className="flex items-center gap-1"
			>
				{ws.component ? (
					<Link
						href={targetHref}
						aria-current={isCurrent ? 'page' : undefined}
						onClick={() => {
							setOpen(false);
							onNavigate?.();
						}}
						className={rowLinkClass}
					>
						{linkInner}
					</Link>
				) : (
					<a
						href={targetHref}
						aria-current={isCurrent ? 'page' : undefined}
						onClick={() => {
							setOpen(false);
							onNavigate?.();
						}}
						className={rowLinkClass}
					>
						{linkInner}
					</a>
				)}

				<button
					type="button"
					onClick={(e) => toggleFavoriteWorkspace(ws.id, e)}
					aria-label={
						isFav
							? t('launcher.unpinWorkspace', { title: ws.title }, 'Unpin {title}')
							: t('launcher.pinWorkspace', { title: ws.title }, 'Pin {title}')
					}
					title={
						isFav
							? t('launcher.unpinWorkspace', { title: ws.title }, 'Unpin {title}')
							: t('launcher.pinWorkspace', { title: ws.title }, 'Pin {title}')
					}
					className={cn(
						'inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer',
						isFav
							? 'text-warning hover:bg-muted'
							: 'text-muted-foreground/50 hover:bg-muted hover:text-foreground'
					)}
				>
					<DynamicIcon
						name="star"
						className={cn('size-3.5', isFav && 'fill-current')}
						aria-hidden="true"
					/>
				</button>
			</div>
		);
	};

	const isSearching = query.trim() !== '';

	return (
		<Popover open={open} onOpenChange={handleOpenChange} modal={false}>
			{collapsed ? (
				<PopoverTrigger
					ref={triggerRef}
					data-rw-module-switcher=""
					title={`${activeTitle} — ${t('shell.switchModule', 'Switch module')}`}
					aria-label={`${activeTitle} — ${t('shell.switchModule', 'Switch module')}`}
					className={cn(
						'mx-auto flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-2xs transition-all hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring cursor-pointer',
						className
					)}
				>
					<DynamicIcon name={activeIcon} className="size-4.5" aria-hidden="true" />
				</PopoverTrigger>
			) : (
				<PopoverTrigger
					ref={triggerRef}
					data-rw-module-switcher=""
					className={cn(
						'flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring cursor-pointer',
						open && 'bg-sidebar-accent border-sidebar-border',
						className
					)}
				>
					<span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-2xs">
						<DynamicIcon name={activeIcon} className="size-4" aria-hidden="true" />
					</span>
					<span className="min-w-0 flex-1">
						<span className="block truncate text-[13px] font-semibold leading-tight text-sidebar-foreground">
							{activeTitle}
						</span>
						{' '}
						<span className="block truncate text-[11px] leading-tight text-muted-foreground">
							{activeSubtitle}
						</span>
					</span>
					<DynamicIcon
						name="selector"
						className="size-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					<span className="sr-only">{` — ${t('shell.switchModule', 'Switch module')}`}</span>
				</PopoverTrigger>
			)}

			<PopoverContent
				data-rw-module-switcher-menu=""
				side={collapsed ? 'right' : 'bottom'}
				align="start"
				sideOffset={8}
				className="w-80 max-w-[calc(100vw-1rem)] overflow-hidden p-0"
			>
				<div className="border-b border-border p-2">
					<div className="relative">
						<DynamicIcon
							name="search"
							className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
							aria-hidden="true"
						/>
						<Input
							ref={searchInputRef}
							type="search"
							data-rw-module-switcher-search=""
							aria-label={t('shell.searchWorkspacesLabel', 'Search workspaces')}
							value={query}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
							onKeyDown={handleSearchKeyDown}
							placeholder={t('shell.findWorkspace', 'Find workspace...')}
							className="h-8 pl-8 pr-2 text-xs"
						/>
					</div>
				</div>

				<div className="max-h-72 overflow-y-auto p-1.5 space-y-2">
					{flatItems.length === 0 ? (
						<p className="py-5 text-center text-xs text-muted-foreground">
							{t('shell.noMatchingWorkspaces', 'No matching workspaces')}
						</p>
					) : isSearching ? (
						<div className="space-y-0.5">
							{filteredWorkspaces.map((ws, idx) => renderWorkspaceRow(ws, idx))}
						</div>
					) : (
						<>
							{pinnedWorkspaces.length > 0 ? (
								<div className="space-y-0.5">
									<div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
										{t('launcher.pinned', 'Pinned')}
									</div>
									{pinnedWorkspaces.map((ws, idx) => renderWorkspaceRow(ws, idx))}
								</div>
							) : null}

							{unpinnedWorkspaces.length > 0 ? (
								<div className="space-y-0.5">
									<div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
										{t('shell.allModules', 'All Modules')}
									</div>
									{unpinnedWorkspaces.map((ws, idx) =>
										renderWorkspaceRow(ws, pinnedWorkspaces.length + idx)
									)}
								</div>
							) : null}
						</>
					)}
				</div>

				{safeLauncherHref || safeAdminHref ? (
					<div className="flex items-center justify-between gap-2 border-t border-border bg-muted/35 px-2.5 py-2">
						{safeLauncherHref ? (
							<Link
								href={safeLauncherHref}
								onClick={() => {
									setOpen(false);
									onNavigate?.();
								}}
								className={cn(
									'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
									!activeWorkspace
										? 'bg-primary/12 text-primary-ink font-semibold'
										: 'text-foreground hover:bg-muted'
								)}
							>
								<DynamicIcon name="layout-grid" className="size-3.5 text-primary" aria-hidden="true" />
								<span>{t('shell.workspaceHub', 'Workspace Hub')}</span>
							</Link>
						) : null}
						{safeAdminHref ? (
							<a
								href={safeAdminHref}
								data-rw-admin-return=""
								onClick={() => {
									setOpen(false);
									onNavigate?.();
								}}
								title={t('shell.returnToTarget', { target: returnLabel }, 'Return to {target}')}
								className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
							>
								<DynamicIcon name="arrow-left" className="size-3.5" aria-hidden="true" />
								<span>{returnLabel}</span>
							</a>
						) : null}
					</div>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
