import React from 'react';
import { t } from '../lib/i18n';
import { DynamicIcon } from '../lib/utils';
import { Badge } from '../ui';
import { ModuleSectionNav } from './ModuleSectionNav';
import type { AppShellNavItem, AppShellProps } from './types';

export interface ModuleHeaderBarProps {
	title: string;
	subtitle?: string;
	icon?: string;
	pills: NonNullable<AppShellProps['pills']>;
	isEmbeddedIsland: boolean;
	hasRecordHeader: boolean;
	resolvedHeaderActions?: React.ReactNode;
	isClassicAdminShell: boolean;
	enableShortcuts: boolean;
	openInWorkspaceHref: string;
	onOpenCommandPalette: () => void;
	resolvedNavItems: AppShellNavItem[];
	resolvedActiveNav?: string;
}

export function ModuleHeaderBar({
	title,
	subtitle,
	icon,
	pills,
	isEmbeddedIsland,
	hasRecordHeader,
	resolvedHeaderActions,
	isClassicAdminShell,
	enableShortcuts,
	openInWorkspaceHref,
	onOpenCommandPalette,
	resolvedNavItems,
	resolvedActiveNav,
}: ModuleHeaderBarProps): React.ReactElement {
	const ModuleHeadingTag: 'h1' | 'h2' = isEmbeddedIsland ? 'h2' : 'h1';

	return (
		<div data-rw-module-header="" className="border-b border-border bg-card">
			<div className="mx-auto max-w-[1600px] px-4 pt-4 pb-0 sm:px-6 sm:pt-5">
				<div className="flex flex-col gap-3 pb-4 md:flex-row md:items-start md:justify-between">
					<div className="space-y-1">
						<div className="flex flex-wrap items-center gap-2.5">
							{icon ? (
								<span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
									<DynamicIcon name={icon} className="size-4" />
								</span>
							) : null}
							<ModuleHeadingTag className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
								{title}
							</ModuleHeadingTag>
							{pills.map((pill, idx) => {
								const label = typeof pill === 'string' ? pill : pill.label;
								const variant = typeof pill === 'string' ? 'secondary' : pill.variant || 'secondary';
								return (
									<Badge key={idx} variant={variant}>
										{label}
									</Badge>
								);
							})}
						</div>
						{subtitle ? (
							<p className="max-w-3xl text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
						) : null}
					</div>

					{(!hasRecordHeader && resolvedHeaderActions) ||
					openInWorkspaceHref ||
					(isClassicAdminShell && enableShortcuts) ? (
						<div className="flex flex-wrap items-center gap-2 shrink-0">
							{!hasRecordHeader ? resolvedHeaderActions : null}
							{isClassicAdminShell && enableShortcuts ? (
								<button
									type="button"
									onClick={onOpenCommandPalette}
									data-rw-command-trigger=""
									title={t('shell.quickSwitcherShortcut', 'Quick Switcher (Cmd/Ctrl+K)')}
									className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-input-surface px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0 cursor-pointer"
								>
									<DynamicIcon name="search" className="size-3.5" aria-hidden="true" />
									<span className="sr-only">{t('shell.quickSwitcher', 'Quick Switcher')} </span>
									<kbd className="font-mono text-[10px]">⌘K</kbd>
								</button>
							) : null}
							{openInWorkspaceHref ? (
								<a
									href={openInWorkspaceHref}
									data-rw-open-in-workspace
									title={t('shell.openInWorkspaceTooltip', 'Switch to full-screen Workspace view')}
									className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-input-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted shrink-0"
								>
									<DynamicIcon name="layout-grid" className="size-3.5 text-primary" />
									<span>{t('shell.openInWorkspace', 'Open in Workspace')}</span>
								</a>
							) : null}
						</div>
					) : null}
				</div>

				{resolvedNavItems.length > 0 ? (
					<ModuleSectionNav
						title={title}
						items={resolvedNavItems}
						activeNav={resolvedActiveNav}
					/>
				) : null}
			</div>
		</div>
	);
}
