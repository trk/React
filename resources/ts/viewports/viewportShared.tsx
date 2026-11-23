import React from 'react';
import { t } from '../lib/i18n';
import { visitSameModuleHref, withWorkspaceShellUrl } from '../lib/inertia-bridge';
import { DynamicIcon, sanitizeHref } from '../lib/utils';
import {
	Badge,
	Button,
	DropdownMenu,
	Menu,
	MenuContent,
	MenuItem,
	MenuTrigger,
	type DropdownMenuItem,
} from '../ui';
import type { ViewportState } from './DataViewport';

export interface ViewportLinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
	href: string;
	external?: boolean;
}

export function ViewportLink({ href, external = false, target, rel, onClick, children, ...rest }: ViewportLinkProps) {
	const rawSafe = sanitizeHref(href);
	const resolvedHref = rawSafe
		? external || target === '_blank'
			? rawSafe
			: sanitizeHref(withWorkspaceShellUrl(rawSafe)) || rawSafe
		: '#';
	return (
		<a
			href={resolvedHref}
			target={target}
			rel={rel}
			onClick={(event) => {
				onClick?.(event);
				if (
					!event.defaultPrevented &&
					!external &&
					!target &&
					!rest.download &&
					rawSafe &&
					event.button === 0 &&
					!event.metaKey &&
					!event.ctrlKey &&
					!event.shiftKey &&
					!event.altKey
				) {
					if (visitSameModuleHref(rawSafe)) {
						event.preventDefault();
					}
				}
			}}
			{...rest}
		>
			{children}
		</a>
	);
}

export function renderViewportCreateTrigger(
	state: ViewportState,
	triggerDataAttr = 'viewport-create',
	preferEmptyLabel = false
): React.ReactElement | null {
	if (state.showCreateButton === false) {
		return null;
	}
	const actionList = Array.isArray(state.createActions) ? state.createActions : [];
	const menuItems: DropdownMenuItem[] = [];
	for (let i = 0; i < actionList.length; i++) {
		const act = actionList[i];
		if (!act || !act.label) {
			continue;
		}
		const safeActHref = act.href ? sanitizeHref(act.href) : '';
		if (!safeActHref) {
			continue;
		}
		menuItems.push({
			key: act.key || `create-${i}`,
			label: act.label,
			icon: act.icon || 'plus',
			href: safeActHref,
			dataAttrs: act.dataAttrs,
		});
	}

	const label = preferEmptyLabel
		? state.emptyActionLabel || state.createLabel || t('viewport.newItem', 'New Item')
		: state.createLabel || state.emptyActionLabel || t('viewport.newItem', 'New Item');

	if (menuItems.length > 1) {
		return (
			<DropdownMenu
				items={menuItems}
				align="end"
				triggerAriaLabel={label}
				triggerDataAttr={triggerDataAttr}
				triggerClassName="inline-flex h-8 min-h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground hover:opacity-90"
				trigger={
					<>
						<DynamicIcon name="plus" className="size-3.5" aria-hidden="true" />
						<span>{label}</span>
						<DynamicIcon name="chevron-down" className="size-3 opacity-80" aria-hidden="true" />
					</>
				}
			/>
		);
	}

	const singleHref =
		menuItems[0]?.href ||
		sanitizeHref(preferEmptyLabel ? state.emptyActionUrl || state.createUrl : state.createUrl);
	if (!singleHref || !label) {
		return null;
	}

	const singleDataAttrs = menuItems[0]?.dataAttrs || {};
	return (
		<ViewportLink
			href={singleHref}
			data-rw-viewport-create={triggerDataAttr === 'viewport-create' ? '' : undefined}
			data-rw-viewport-empty-create={triggerDataAttr === 'viewport-empty-create' ? '' : undefined}
			{...singleDataAttrs}
			className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-xs hover:opacity-90"
		>
			<DynamicIcon name="plus" className="size-3.5" aria-hidden="true" />
			<span>{label}</span>
		</ViewportLink>
	);
}

export interface ViewportExportControlProps {
	state: ViewportState;
	busy: boolean;
	dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void>;
	selectedOnly?: boolean;
}

export function isViewportFiltered(state: ViewportState): boolean {
	const hasSearch = typeof state.searchQuery === 'string' && state.searchQuery.trim() !== '';
	const hasActiveView = Boolean(state.activeView && state.activeView !== 'all');
	const hasFilterValue = Boolean(
		state.filterValues &&
			Object.values(state.filterValues).some(
				(val) => val !== undefined && val !== null && String(val).trim() !== ''
			)
	);
	return hasSearch || hasActiveView || hasFilterValue;
}

export function ViewportExportControl({
	state,
	busy,
	dispatch,
	selectedOnly = false,
}: ViewportExportControlProps): React.ReactElement {
	const selectedIds = Array.isArray(state.selectedIds) ? state.selectedIds : [];
	const selectedCount = selectedIds.length;
	const filtered = isViewportFiltered(state);
	const formats = Array.from(
		new Set(
			(Array.isArray(state.exportFormats) && state.exportFormats.length > 0
				? state.exportFormats
				: ['csv']
			)
				.map((fmt) => String(fmt || '').trim().toLowerCase())
				.filter(Boolean)
		)
	);
	const resolvedFormats = formats.length > 0 ? formats : ['csv'];

	const scope = selectedOnly ? 'selected' : filtered ? 'filtered' : 'all';
	const label = selectedOnly
		? t('viewport.exportSelected', { count: selectedCount }, 'Export Selected ({count})')
		: filtered
			? t('viewport.exportFiltered', 'Export Filtered')
			: t('viewport.exportAll', 'Export All');

	const showTotalBadge = !selectedOnly && typeof state.total === 'number' && state.total >= 0;
	const triggerExport = (format: string) => {
		const payload: Record<string, unknown> = { format };
		if (selectedOnly && selectedIds.length > 0) {
			payload.ids = selectedIds;
		}
		void dispatch('export', payload);
	};

	if (resolvedFormats.length <= 1) {
		return (
			<Button
				type="button"
				variant="outline"
				size={selectedOnly ? 'xs' : 'sm'}
				icon="download"
				disabled={busy}
				data-rw-viewport-export={scope}
				className="shrink-0"
				onClick={() => triggerExport(resolvedFormats[0] || 'csv')}
			>
				<span>{label}</span>
				{showTotalBadge ? (
					<Badge variant="muted" mono className="ml-0.5 px-1.5 py-0 text-[10px]">
						{state.total}
					</Badge>
				) : null}
			</Button>
		);
	}

	return (
		<Menu>
			<MenuTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size={selectedOnly ? 'xs' : 'sm'}
					icon="download"
					disabled={busy}
					data-rw-viewport-export={scope}
					className="shrink-0"
				>
					<span>{label}</span>
					{showTotalBadge ? (
						<Badge variant="muted" mono className="ml-0.5 px-1.5 py-0 text-[10px]">
							{state.total}
						</Badge>
					) : null}
					<DynamicIcon name="chevron-down" className="size-3 opacity-80" aria-hidden="true" />
				</Button>
			</MenuTrigger>
			<MenuContent align="end">
				{resolvedFormats.map((fmt) => (
					<MenuItem
						key={fmt}
						data-rw-viewport-export-format={fmt}
						onClick={() => triggerExport(fmt)}
					>
						<DynamicIcon name="download" className="size-3.5 text-muted-foreground" aria-hidden="true" />
						<span>{t('viewport.exportAsFormat', { format: fmt.toUpperCase() }, 'Export {format}')}</span>
					</MenuItem>
				))}
			</MenuContent>
		</Menu>
	);
}
