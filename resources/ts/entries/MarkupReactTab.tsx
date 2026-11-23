import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '../lib/utils';
import { ResponsiveTabBar, type ResponsiveTabItem } from '../ui';
import { SearchableTabPanel } from '../fields/shared';

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
			<ResponsiveTabBar
				items={panes.map<ResponsiveTabItem>((pane) => ({
					id: pane.key,
					btnId: `pw-tab-btn-${pane.domId}`,
					controlsId: `pw-tab-panel-${pane.domId}`,
					label: pane.label,
					icon: pane.icon,
					badge: pane.badge,
					errorCount: pane.errors,
					errorLabel: pane.errorLabel,
					disabled: pane.disabled,
					dataAttrs: {
						'data-tab-key': pane.key,
						'data-show-if': pane.showIf || undefined,
					},
				}))}
				activeId={currentPane?.key || ''}
				ariaLabel={groupLabel}
				variant={variant}
				className={variant === 'vertical' ? 'border-r border-border pr-4' : undefined}
				onSelect={(id) => selectTab(id)}
			/>

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
