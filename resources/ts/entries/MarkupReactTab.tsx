import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn, DynamicIcon } from '../lib/utils';
import { Badge } from '../ui';
import { navigateTablistByKey, scrollTabIntoView, SearchableTabPanel } from '../fields/shared';

interface TabPaneItem {
	id?: string;
	key?: string;
	domId?: string;
	label: string;
	icon?: string;
	badge?: string | number;
	errors?: number;
	errorLabel?: string;
	showIf?: string;
	lazy?: boolean;
	active?: boolean;
	disabled?: boolean;
	description?: string;
	notes?: string;
	contentHtml?: string;
}

function TabPaneBody({ html }: { html: string }) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const appliedHtmlRef = useRef<string | null>(null);

	const setNode = useCallback(
		(node: HTMLDivElement | null) => {
			containerRef.current = node;
			if (node && appliedHtmlRef.current !== html) {
				node.innerHTML = html;
				appliedHtmlRef.current = html;
			}
		},
		[html]
	);

	useEffect(() => {
		if (containerRef.current && typeof window !== 'undefined') {
			window.ReactWorkspaceRuntime?.mountIslands?.(containerRef.current);
		}
	}, [html]);

	return <div ref={setNode} />;
}

export function SchemaTabContainer(rawProps: Record<string, unknown>) {
	const resolved =
		rawProps.props && typeof rawProps.props === 'object' ? { ...rawProps, ...rawProps.props } : rawProps;
	const groupId = String(resolved.groupId || resolved.id || resolved.name || 'pw_tab_group');
	const groupLabel = String(resolved.label || 'Sections');
	const rawVariant = String(resolved.variant || 'line').toLowerCase();
	const variant: 'line' | 'segmented' | 'vertical' =
		rawVariant === 'segmented' || rawVariant === 'vertical' ? rawVariant : 'line';
	const readOnly = Boolean(rawProps.readOnly || resolved.readOnly);
	const rawItems: TabPaneItem[] = Array.isArray(resolved.panes)
		? resolved.panes
		: Array.isArray(resolved.tabs)
			? resolved.tabs
			: [];

	const panes = rawItems.map((item, idx) => {
		const key = String(item.key || item.id || `tab_${idx + 1}`);
		const domId = String(item.domId || `${groupId}__${key}`);
		const errors = typeof item.errors === 'number' && item.errors > 0 ? item.errors : 0;
		return {
			key,
			domId,
			label: String(item.label || key),
			icon: String(item.icon || ''),
			badge: item.badge !== undefined && item.badge !== null ? String(item.badge) : '',
			errors,
			errorLabel: String(item.errorLabel || (errors > 0 ? `${errors} validation errors` : '')),
			showIf: String(item.showIf || ''),
			lazy: Boolean(item.lazy),
			active: Boolean(item.active),
			disabled: Boolean(item.disabled),
			description: String(item.description || ''),
			notes: String(item.notes || ''),
			contentHtml: String(item.contentHtml || ''),
		};
	});

	const initialKey = (() => {
		const explicitPane = panes.find((p) => p.active);
		if (explicitPane) {
			return explicitPane.key;
		}
		const requested = String(resolved.activeTab || resolved.defaultTab || '');
		if (requested) {
			const match = panes.find((p) => p.key === requested || p.domId === requested || p.label === requested);
			if (match) {
				return match.key;
			}
		}
		return panes[0]?.key || '';
	})();

	const [activeKey, setActiveKey] = useState<string>(initialKey);
	const [openedKeys, setOpenedKeys] = useState<Record<string, boolean>>(() => {
		const map: Record<string, boolean> = {};
		for (const p of panes) {
			if (!p.lazy || p.key === initialKey || p.errors > 0) {
				map[p.key] = true;
			}
		}
		return map;
	});

	if (panes.length === 0) {
		return null;
	}

	const currentPane = panes.find((p) => p.key === activeKey) || panes[0];

	const selectTab = (key: string) => {
		setActiveKey(key);
		setOpenedKeys((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
	};

	return (
		<div
			className={cn(
				'w-full',
				variant === 'vertical' ? 'grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]' : 'space-y-5'
			)}
			data-react-tabs={groupId}
			data-variant={variant}
			data-error-lock={resolved.errorLock ? '1' : '0'}
		>
			<div
				role="tablist"
				aria-label={groupLabel}
				aria-orientation={variant === 'vertical' ? 'vertical' : 'horizontal'}
				data-rw-tablist=""
				data-variant={variant}
				onKeyDown={(e) => navigateTablistByKey(e, variant === 'vertical' ? 'vertical' : 'horizontal')}
				className={cn(
					variant === 'line' && 'flex items-center gap-1 border-b border-border',
					variant === 'segmented' &&
						'inline-flex max-w-full items-center gap-1 rounded-lg bg-muted/50 p-1 border border-border',
					variant === 'vertical' && 'flex flex-col gap-1 border-r border-border pr-4'
				)}
			>
				{panes.map((pane) => {
					const isActive = pane.key === currentPane?.key;
					const hasErrors = pane.errors > 0;
					const btnId = `pw-tab-btn-${pane.domId}`;
					const panelId = `pw-tab-panel-${pane.domId}`;

					return (
						<button
							key={pane.key}
							type="button"
							role="tab"
							id={btnId}
							aria-selected={isActive}
							aria-controls={panelId}
							tabIndex={isActive ? 0 : -1}
							disabled={pane.disabled}
							data-tab-key={pane.key}
							data-show-if={pane.showIf || undefined}
							onClick={(e) => {
								selectTab(pane.key);
								scrollTabIntoView(e.currentTarget);
							}}
							className={cn(
								'inline-flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								variant === 'line' && [
									'px-3.5 py-2.5',
									isActive
										? 'text-foreground'
										: 'text-muted-foreground hover:text-foreground',
								],
								variant === 'segmented' && [
									'rounded-md px-3 py-1.5',
									isActive
										? 'bg-background text-foreground shadow-2xs'
										: 'text-muted-foreground hover:text-foreground',
								],
								variant === 'vertical' && [
									'w-full justify-start rounded-md px-3 py-2 text-left',
									isActive
										? 'bg-accent text-accent-foreground shadow-2xs'
										: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
								],
								hasErrors && 'text-destructive',
								pane.disabled && 'pointer-events-none opacity-50'
							)}
						>
							{pane.icon ? <DynamicIcon name={pane.icon} className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
							<span className="truncate">{pane.label}</span>
							{pane.badge !== '' ? (
								<Badge
									variant={isActive ? 'secondary' : 'outline'}
									className="ml-auto px-1.5 py-0 text-[10px] tabular-nums"
								>
									{pane.badge}
								</Badge>
							) : null}
							{hasErrors ? (
								<Badge
									variant="destructive"
									title={pane.errorLabel}
									aria-label={pane.errorLabel}
									className="ml-auto px-1.5 py-0 text-[10px] tabular-nums"
								>
									{pane.errors}
								</Badge>
							) : null}
						</button>
					);
				})}
			</div>

			<div className="min-w-0 flex-1">
				{panes.map((pane) => {
					const isActive = pane.key === currentPane?.key;
					const isOpened = Boolean(!pane.lazy || openedKeys[pane.key] || isActive);
					const btnId = `pw-tab-btn-${pane.domId}`;
					const panelId = `pw-tab-panel-${pane.domId}`;

					return (
						<SearchableTabPanel
							key={pane.key}
							id={panelId}
							labelledBy={btnId}
							isActive={isActive}
							searchableWhenHidden={isOpened}
							onRevealMatch={() => selectTab(pane.key)}
							tabIndex={0}
							dataAttributes={{
								'data-tab-panel': pane.domId,
								'data-tab-key': pane.key,
								'data-tab-lazy': isOpened ? '0' : '1',
							}}
						>
							{!readOnly ? (
								<input
									type="hidden"
									name={`pw_tab_lazy_${pane.domId}`}
									value={isOpened ? '0' : '1'}
								/>
							) : null}
							{isOpened ? (
								<div className="space-y-4">
									{pane.description ? (
										<p className="text-xs text-muted-foreground">{pane.description}</p>
									) : null}
									{pane.contentHtml ? <TabPaneBody html={pane.contentHtml} /> : null}
									{pane.notes ? (
										<p className="text-xs text-muted-foreground">{pane.notes}</p>
									) : null}
								</div>
							) : null}
						</SearchableTabPanel>
					);
				})}
			</div>
		</div>
	);
}

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;
type PageComponent = React.ComponentType<Record<string, unknown>>;

runtime?.__provideFieldControl?.('SchemaTabContainer', SchemaTabContainer);
runtime?.registerPages?.({
	MarkupReactTab: SchemaTabContainer as PageComponent,
});
runtime?.registerIslands?.({
	MarkupReactTab: SchemaTabContainer as PageComponent,
});

export default SchemaTabContainer;
