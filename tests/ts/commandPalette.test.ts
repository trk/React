import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_PRESETS } from '../../resources/ts/hooks';
import {
	buildCommandPaletteItems,
	CommandPaletteContent,
	groupCommandPaletteItems,
	resolveCommandPaletteKeyAction,
	scrollActiveOptionIntoView,
} from '../../resources/ts/layout/CommandPaletteModal';
import {
	normalizeRemoteCommandItems,
	scheduleCommandSearch,
} from '../../resources/ts/layout/commandSearchClient';
import { SIDEBAR_SHELL_LAYOUT } from '../../resources/ts/layout/SidebarShellLayout';
import { TOPBAR_SHELL_LAYOUT } from '../../resources/ts/layout/TopbarShellLayout';
import type {
	AppShellNavItem,
	CommandPaletteItem,
	ShellLayoutDescriptorDto,
	WorkspaceDefinitionDto,
	WorkspaceSharedContext,
} from '../../resources/ts/layout/types';

function makeWorkspaceContext(): WorkspaceSharedContext {
	const inventoryWs: WorkspaceDefinitionDto = {
		id: 'inventory',
		title: 'Inventory',
		description: 'Structured records and blueprints.',
		icon: 'database',
		category: 'Content',
		url: '/61admin/inventory/?ws=1',
		permission: 'inventory-items',
		component: 'Inventory/Dashboard',
		order: 10,
		badge: 'Beta',
		stats: [],
	};
	return {
		appName: 'CMS Panel',
		adminUrl: '/61admin/',
		adminReturnLabel: 'Panel',
		shellMode: 'workspace',
		launcherUrl: '/61admin/react-workspace/',
		commandSearchEndpoint: '/_react/command-search',
		themeMode: 'system',
		shellLayout: 'topbar',
		workspaces: [inventoryWs],
		activeWorkspace: inventoryWs,
		user: {
			id: 41,
			name: 'admin',
			label: 'Admin User',
			email: 'admin@example.test',
			isSuperuser: true,
			viewSiteUrl: '/site-home/',
			logoutUrl: '/61admin/login/logout/',
		},
	};
}

const SHELL_LAYOUTS: ShellLayoutDescriptorDto[] = [
	{
		id: TOPBAR_SHELL_LAYOUT.id,
		label: TOPBAR_SHELL_LAYOUT.label,
		labelKey: TOPBAR_SHELL_LAYOUT.labelKey,
		description: TOPBAR_SHELL_LAYOUT.description,
		descriptionKey: TOPBAR_SHELL_LAYOUT.descriptionKey,
		icon: TOPBAR_SHELL_LAYOUT.icon,
		supportsCollapse: TOPBAR_SHELL_LAYOUT.supportsCollapse,
		order: TOPBAR_SHELL_LAYOUT.order,
	},
	{
		id: SIDEBAR_SHELL_LAYOUT.id,
		label: SIDEBAR_SHELL_LAYOUT.label,
		labelKey: SIDEBAR_SHELL_LAYOUT.labelKey,
		description: SIDEBAR_SHELL_LAYOUT.description,
		descriptionKey: SIDEBAR_SHELL_LAYOUT.descriptionKey,
		icon: SIDEBAR_SHELL_LAYOUT.icon,
		supportsCollapse: SIDEBAR_SHELL_LAYOUT.supportsCollapse,
		order: SIDEBAR_SHELL_LAYOUT.order,
	},
];

describe('Command Palette 2.0 grouping, actions & keyboard navigation', () => {
	it('groups items into records, current workspace (with nested nav), workspaces, appearance, and actions', () => {
		const workspace = makeWorkspaceContext();
		const navItems: AppShellNavItem[] = [
			{
				key: 'records',
				label: 'All Records',
				href: '/61admin/inventory/?ws=1',
				badge: 12,
				children: [
					{
						key: 'archived',
						label: 'Archived',
						href: '/61admin/inventory/archived/?ws=1',
					},
				],
			},
			{
				key: 'settings-group',
				label: 'Configuration',
				children: [
					{
						key: 'fields',
						label: 'Field Mapping',
						href: '/61admin/inventory/fields/?ws=1',
					},
				],
			},
		];

		const onSetShellLayout = vi.fn();
		const onToggleSidebarCollapsed = vi.fn();
		const onSetThemeMode = vi.fn();
		const onSetThemePreset = vi.fn();
		const onOpenShortcuts = vi.fn();

		const remoteItems: CommandPaletteItem[] = [
			{
				id: 'remote-page-105',
				label: 'Alpha Vessel',
				subtitle: '/vessels/alpha-vessel/',
				badge: 'vessel',
				group: 'Pages',
				icon: 'file-text',
				href: '/61admin/page/edit/?id=105',
				isInertia: false,
			},
		];

		const items = buildCommandPaletteItems({
			workspaces: workspace.workspaces,
			resolvedNavItems: navItems,
			title: 'Entries',
			workspace,
			returnLabel: 'Panel',
			commandQuery: '',
			showGlobalWorkspaceBar: true,
			remoteItems,
			availableShellLayouts: SHELL_LAYOUTS,
			supportsSidebarCollapse: true,
			sidebarCollapsed: false,
			availableThemePresets: THEME_PRESETS,
			onSetShellLayout,
			onToggleSidebarCollapsed,
			onSetThemeMode,
			onSetThemePreset,
			onOpenShortcuts,
		});

		const { groups, orderedItems } = groupCommandPaletteItems(items);
		expect(groups.map((g) => g.label)).toEqual([
			'Pages',
			'Current Workspace',
			'Workspaces',
			'Layout & Appearance',
			'Actions',
		]);

		expect(orderedItems.some((item) => item.id === 'sec-records' && item.badge === '12')).toBe(true);
		expect(
			orderedItems.some(
				(item) =>
					item.id === 'sec-records-archived' &&
					item.label === 'Entries: All Records › Archived'
			)
		).toBe(true);
		expect(
			orderedItems.some(
				(item) =>
					item.id === 'sec-settings-group-fields' &&
					item.label === 'Entries: Configuration › Field Mapping'
			)
		).toBe(true);

		const sidebarLayoutCmd = orderedItems.find((i) => i.id === 'layout-shell-sidebar');
		expect(sidebarLayoutCmd?.label).toBe('Layout: Sidebar');
		sidebarLayoutCmd?.onClick?.();
		expect(onSetShellLayout).toHaveBeenCalledWith('sidebar');

		const toggleSidebarCmd = orderedItems.find((i) => i.id === 'layout-toggle-sidebar');
		expect(toggleSidebarCmd?.label).toBe('Toggle sidebar');
		toggleSidebarCmd?.onClick?.();
		expect(onToggleSidebarCollapsed).toHaveBeenCalledTimes(1);

		const oceanPresetCmd = orderedItems.find((i) => i.id === 'theme-preset-ocean');
		expect(oceanPresetCmd?.label).toBe('Color Scheme: Ocean');
		oceanPresetCmd?.onClick?.();
		expect(onSetThemePreset).toHaveBeenCalledWith('ocean');

		const withoutCollapse = buildCommandPaletteItems({
			workspaces: workspace.workspaces,
			resolvedNavItems: [],
			title: 'Entries',
			workspace,
			returnLabel: 'Panel',
			commandQuery: '',
			showGlobalWorkspaceBar: true,
			availableShellLayouts: SHELL_LAYOUTS,
			supportsSidebarCollapse: false,
			onToggleSidebarCollapsed,
		});
		expect(withoutCollapse.some((i) => i.id === 'layout-toggle-sidebar')).toBe(false);
	});

	it('keeps remote results visible even if server matched non-title attributes and filters local commands', () => {
		const workspace = makeWorkspaceContext();
		const remoteItems: CommandPaletteItem[] = [
			{
				id: 'remote-slug-hit',
				label: 'Maritime Directory',
				subtitle: '/ships/alpha-hull/',
				badge: 'page',
				group: 'Matching Records',
				icon: 'file-text',
				href: '/61admin/page/edit/?id=200',
				isInertia: false,
			},
		];

		const items = buildCommandPaletteItems({
			workspaces: workspace.workspaces,
			resolvedNavItems: [],
			title: 'Entries',
			workspace,
			returnLabel: 'Panel',
			commandQuery: 'xz99customfield',
			showGlobalWorkspaceBar: true,
			remoteItems,
			availableShellLayouts: SHELL_LAYOUTS,
		});

		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe('remote-slug-hit');
	});

	it('computes wrapping ArrowDown/ArrowUp/Home/End/Enter transitions and scrolls active option into view', () => {
		expect(resolveCommandPaletteKeyAction('ArrowDown', 0, 4)).toEqual({
			nextIndex: 1,
			preventDefault: true,
		});
		expect(resolveCommandPaletteKeyAction('ArrowDown', 3, 4)).toEqual({
			nextIndex: 0,
			preventDefault: true,
		});
		expect(resolveCommandPaletteKeyAction('ArrowUp', 0, 4)).toEqual({
			nextIndex: 3,
			preventDefault: true,
		});
		expect(resolveCommandPaletteKeyAction('Home', 2, 4)).toEqual({
			nextIndex: 0,
			preventDefault: true,
		});
		expect(resolveCommandPaletteKeyAction('End', 1, 4)).toEqual({
			nextIndex: 3,
			preventDefault: true,
		});
		expect(resolveCommandPaletteKeyAction('Enter', 2, 4)).toEqual({
			executeIndex: 2,
			preventDefault: true,
		});
		expect(resolveCommandPaletteKeyAction('Escape', 0, 4)).toEqual({
			preventDefault: false,
		});
		expect(resolveCommandPaletteKeyAction('ArrowDown', 0, 0)).toEqual({
			preventDefault: false,
		});

		const scrollIntoView = vi.fn();
		scrollActiveOptionIntoView({ scrollIntoView });
		expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
		expect(() => scrollActiveOptionIntoView(null)).not.toThrow();

		// Interleaved groups normalize into contiguous group runs with matching 0..N-1 indices
		const { groups, orderedItems } = groupCommandPaletteItems([
			{ id: 'a1', label: 'First A', subtitle: '', icon: 'search', group: 'Alpha' },
			{ id: 'b1', label: 'First B', subtitle: '', icon: 'search', group: 'Beta' },
			{ id: 'a2', label: 'Second A', subtitle: '', icon: 'search', group: 'Alpha' },
		]);
		expect(groups.map((g) => [g.label, g.items.map((x) => x.flatIndex)])).toEqual([
			['Alpha', [0, 1]],
			['Beta', [2]],
		]);
		expect(orderedItems.map((i) => i.id)).toEqual(['a1', 'a2', 'b1']);
	});
});

describe('Command Search debounced client & URL sanitization', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('normalizes remote results, rejects unsafe URLs, and applies shell wrapping only for Inertia targets', () => {
		const normalized = normalizeRemoteCommandItems(
			[
				{
					id: 'page-10',
					label: 'Alpha Vessel',
					subtitle: '/vessels/alpha/',
					badge: 'vessel',
					group: 'Pages',
					icon: 'file-text',
					href: '/61admin/page/edit/?id=10',
					isInertia: false,
				},
				{
					id: 'entry-5',
					label: 'Hull 42',
					subtitle: 'Orders collection',
					badge: 'Order',
					group: 'Orders',
					icon: 'INVALID ICON!!',
					href: '/61admin/inventory/orders/5',
					isInertia: true,
				},
				{
					id: 'bad-js',
					label: 'Exploit JS',
					subtitle: 'bad',
					icon: 'alert',
					href: 'javascript:alert(1)',
				},
				{
					id: 'bad-data',
					label: 'Exploit Data',
					subtitle: 'bad',
					icon: 'alert',
					href: 'data:text/html,<script>alert(1)</script>',
				},
				{
					id: 'bad-proto-rel',
					label: 'Exploit Protocol Relative',
					subtitle: 'bad',
					icon: 'alert',
					href: '//evil.test/phish',
				},
				{
					id: 'bad-external',
					label: 'Exploit Origin',
					subtitle: 'bad',
					icon: 'alert',
					href: 'https://evil.test/login',
				},
			],
			{
				defaultGroup: 'Matching Records',
				showGlobalWorkspaceBar: true,
				adminUrl: '/61admin/',
				launcherUrl: '/61admin/react-workspace/',
			}
		);

		expect(normalized).toHaveLength(2);
		expect(normalized[0]).toMatchObject({
			id: 'remote-page-10',
			label: 'Alpha Vessel',
			badge: 'vessel',
			group: 'Pages',
			icon: 'file-text',
			href: '/61admin/page/edit/?id=10',
			isInertia: false,
		});
		expect(normalized[1]).toMatchObject({
			id: 'remote-entry-5',
			label: 'Hull 42',
			icon: 'file-text',
			href: '/61admin/inventory/orders/5?ws=1',
			isInertia: true,
		});
	});

	it('skips network fetches when closed or query < 2 chars, debounces 180ms, and aborts superseded requests', async () => {
		const fetchMock = vi.fn().mockImplementation(
			() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							ok: true,
							query: 'Alp',
							items: [
								{
									id: 'page-7',
									label: 'Alpha Vessel',
									subtitle: '/alpha-vessel/',
									badge: 'basic-page',
									group: 'Pages',
									icon: 'file-text',
									href: '/61admin/page/edit/?id=7',
									isInertia: false,
								},
							],
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } }
					)
				)
		);
		vi.stubGlobal('fetch', fetchMock);

		const onSearchingChange = vi.fn();
		const onResults = vi.fn();

		// Closed -> zero requests
		scheduleCommandSearch({
			open: false,
			endpoint: '/_react/command-search',
			query: 'Alpha',
			defaultGroup: 'Matching Records',
			showGlobalWorkspaceBar: true,
			onSearchingChange,
			onResults,
		});
		await vi.advanceTimersByTimeAsync(500);
		expect(fetchMock).not.toHaveBeenCalled();

		// Single character -> zero requests
		scheduleCommandSearch({
			open: true,
			endpoint: '/_react/command-search',
			query: 'A',
			defaultGroup: 'Matching Records',
			showGlobalWorkspaceBar: true,
			onSearchingChange,
			onResults,
		});
		await vi.advanceTimersByTimeAsync(500);
		expect(fetchMock).not.toHaveBeenCalled();

		// Rapid typing: 'Al' cancelled before 180ms, only 'Alp' fetches
		const cancelAl = scheduleCommandSearch({
			open: true,
			endpoint: '/_react/command-search',
			query: 'Al',
			defaultGroup: 'Matching Records',
			showGlobalWorkspaceBar: true,
			onSearchingChange,
			onResults,
		});
		await vi.advanceTimersByTimeAsync(100);
		cancelAl();

		const cancelAlp = scheduleCommandSearch({
			open: true,
			endpoint: '/_react/command-search',
			query: 'Alp',
			defaultGroup: 'Matching Records',
			showGlobalWorkspaceBar: true,
			adminUrl: '/61admin/',
			launcherUrl: '/61admin/react-workspace/',
			onSearchingChange,
			onResults,
		});
		await vi.advanceTimersByTimeAsync(179);
		expect(fetchMock).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(2);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe('/_react/command-search?q=Alp');
		const firstSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
		expect(firstSignal.aborted).toBe(false);
		expect(onResults).toHaveBeenLastCalledWith([
			expect.objectContaining({
				id: 'remote-page-7',
				label: 'Alpha Vessel',
				badge: 'basic-page',
				group: 'Pages',
				href: '/61admin/page/edit/?id=7',
				isInertia: false,
			}),
		]);
		cancelAlp();
		expect(firstSignal.aborted).toBe(true);
	});
});

describe('CommandPaletteContent SSR HTML & safe escaping', () => {
	it('renders group landmarks, badge pills, searching indicator, and escapes XSS strings safely', () => {
		const html = renderToStaticMarkup(
			React.createElement(CommandPaletteContent, {
				open: true,
				onOpenChange: () => {},
				query: 'al',
				onQueryChange: () => {},
				activeIndex: 0,
				onActiveIndexChange: () => {},
				onExecuteItem: () => {},
				searching: true,
				hasSearchEndpoint: true,
				items: [
					{
						id: 'remote-xss',
						label: '<script>alert(1)</script>Alpha',
						subtitle: '<img src=x onerror=alert(2)>',
						badge: '<b>Tag</b>',
						group: '<svg onload=alert(3)>Pages',
						icon: 'file-text',
						href: '/61admin/page/edit/?id=1',
						isInertia: false,
					},
					{
						id: 'layout-topbar',
						label: 'Layout: Top Bar',
						subtitle: 'Panel Layout',
						group: 'Layout & Appearance',
						icon: 'layout-navbar',
						onClick: () => {},
					},
				],
			})
		);

		expect(html).toContain('role="group"');
		expect(html).toContain('data-rw-command-badge=""');
		expect(html).toContain('data-rw-command-searching=""');
		expect(html).toContain('Jump to workspace, section, or record...');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<img src=x');
		expect(html).not.toContain('<svg onload');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Alpha');
		expect(html).toContain('&lt;b&gt;Tag&lt;/b&gt;');
	});
});
