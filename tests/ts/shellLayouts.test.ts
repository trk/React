import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../resources/ts/layout/AppShell';
import { RecordHeader } from '../../resources/ts/layout/RecordHeader';
import { SIDEBAR_SHELL_LAYOUT, SidebarShellLayout } from '../../resources/ts/layout/SidebarShellLayout';
import { TOPBAR_SHELL_LAYOUT } from '../../resources/ts/layout/TopbarShellLayout';
import {
	getShellLayout,
	listShellLayouts,
	registerShellLayout,
	resolveShellLayoutDefinition,
} from '../../resources/ts/layout/shellRegistry';
import type {
	AppShellNavItem,
	WorkspaceDefinitionDto,
	WorkspaceSharedContext,
} from '../../resources/ts/layout/types';

function makeWorkspaceDef(overrides: Partial<WorkspaceDefinitionDto> = {}): WorkspaceDefinitionDto {
	return {
		id: 'forms',
		title: 'Forms',
		description: 'Manage form submissions and schema blueprints.',
		icon: 'forms',
		category: 'Content',
		url: '/processwire/forms/?workspace=1',
		permission: 'forms',
		order: 10,
		badge: '',
		stats: [],
		...overrides,
	};
}

function makeWorkspaceContext(overrides: Partial<WorkspaceSharedContext> = {}): WorkspaceSharedContext {
	const forms = makeWorkspaceDef();
	const seo = makeWorkspaceDef({
		id: 'seo',
		title: 'SEO',
		description: 'Metadata and redirects.',
		icon: 'search',
		url: '/processwire/seo/?workspace=1',
		permission: 'seo',
		order: 20,
	});
	const nav = makeWorkspaceDef({
		id: 'nav',
		title: 'Navigation',
		description: 'Menu trees.',
		icon: 'menu-2',
		url: '/processwire/navigation/?workspace=1',
		permission: 'navigation',
		order: 30,
	});

	return {
		appName: 'CMS Panel',
		adminUrl: '/processwire/',
		adminReturnLabel: 'Panel',
		shellMode: 'workspace',
		launcherUrl: '/processwire/workspace/',
		prefsEndpoint: '/_react/workspace-prefs',
		themeMode: 'light',
		themePreset: 'native',
		siteDefaultThemePreset: 'native',
		shellLayout: 'sidebar',
		siteDefaultShellLayout: 'topbar',
		sidebarCollapsed: false,
		enableKeyboardShortcuts: true,
		user: {
			id: 41,
			name: 'admin',
			label: 'Admin User',
			email: 'admin@example.test',
			isSuperuser: true,
			roles: ['superuser'],
			viewSiteUrl: '/',
			profileUrl: '/processwire/profile/',
			logoutUrl: '/processwire/login/logout/',
		},
		activeWorkspace: forms,
		workspaces: [forms, seo, nav],
		preferences: {
			themeMode: 'light',
			themePreset: 'native',
			shellLayout: 'sidebar',
			sidebarCollapsed: false,
			favorites: ['seo'],
			hidden: [],
		},
		...overrides,
	};
}

const sampleNavItems: AppShellNavItem[] = [
	{ id: 'overview', label: 'Overview', href: '/processwire/forms/' },
	{
		id: 'rules',
		label: 'Rules',
		icon: 'shield',
		children: [
			{ id: 'rules-spam', label: 'Spam Protection', href: '/processwire/forms/rules/spam/' },
			{ id: 'rules-webhooks', label: 'Signed Webhooks', href: '/processwire/forms/rules/webhooks/' },
		],
	},
];

describe('Shell Layout Registry and Multi-Shell SSR', () => {
	it('registers topbar (order 10) and sidebar (order 20) built-ins with deterministic sorting', () => {
		expect(TOPBAR_SHELL_LAYOUT.id).toBe('topbar');
		expect(TOPBAR_SHELL_LAYOUT.order).toBe(10);
		expect(SIDEBAR_SHELL_LAYOUT.id).toBe('sidebar');
		expect(SIDEBAR_SHELL_LAYOUT.order).toBe(20);
		expect(SIDEBAR_SHELL_LAYOUT.supportsCollapse).toBe(true);

		expect(getShellLayout('topbar')?.id).toBe('topbar');
		expect(getShellLayout('sidebar')?.id).toBe('sidebar');

		const ids = listShellLayouts().map((item) => item.id);
		expect(ids.indexOf('topbar')).toBeLessThan(ids.indexOf('sidebar'));

		// Reserved or invalid IDs are rejected safely
		registerShellLayout({
			id: 'default',
			label: 'Invalid',
			render: () => React.createElement('div'),
		});
		expect(getShellLayout('default')).toBeUndefined();
	});

	it('renders SidebarShellLayout in full workspace mode with module switcher and without duplicate workspace list', () => {
		const workspace = makeWorkspaceContext({
			shellMode: 'workspace',
			shellLayout: 'sidebar',
			sidebarCollapsed: false,
		});
		const html = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace,
					layout: 'sidebar',
					title: 'Forms',
					icon: 'forms',
					navItems: sampleNavItems,
					activeNav: 'overview',
				},
				React.createElement('div', { 'data-testid': 'content' }, 'Body Content')
			)
		);

		expect(html).toContain('data-rw-shell-layout="sidebar"');
		expect(html).toContain('data-rw-sidebar-collapsed="false"');
		expect(html).toContain('data-rw-sidebar=""');
		expect(html).toContain('data-rw-module-switcher=""');
		expect(html).toContain('data-rw-module-nav=""');
		expect(html).toContain('data-rw-sidebar-header=""');
		expect(html).toContain('data-rw-sidebar-toggle=""');
		expect(html).toContain('data-rw-user-menu-trigger=""');

		// Sidebar workspace mode relies on ModuleSwitcher and never duplicates Topbar Workspaces bar
		expect(html).not.toContain('data-rw-global-bar=');
		expect(html).not.toContain('data-rw-more-workspaces-trigger=');
		expect(html).toContain('Body Content');
	});

	it('renders collapsed sidebar rail in workspace mode when sidebarCollapsed preference is true', () => {
		const workspace = makeWorkspaceContext({
			shellMode: 'workspace',
			shellLayout: 'sidebar',
			sidebarCollapsed: true,
			preferences: {
				themeMode: 'light',
				shellLayout: 'sidebar',
				sidebarCollapsed: true,
				favorites: [],
				hidden: [],
			},
		});

		const html = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace,
					layout: 'sidebar',
					title: 'Forms',
					navItems: sampleNavItems,
					activeNav: 'overview',
				},
				React.createElement('div', null, 'Rail Content')
			)
		);

		expect(html).toContain('data-rw-shell-layout="sidebar"');
		expect(html).toContain('data-rw-sidebar-collapsed="true"');
		expect(html).toContain('width:60px');
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain('aria-label="Expand sidebar"');
	});

	it('renders SidebarShellLayout in classic admin mode with open-in-workspace link', () => {
		const workspace = makeWorkspaceContext({
			shellMode: 'admin',
			shellLayout: 'sidebar',
			processUrl: '/processwire/forms/',
		});

		const html = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace,
					layout: 'sidebar',
					title: 'Forms',
					navItems: sampleNavItems,
					activeNav: 'overview',
				},
				React.createElement('div', null, 'Classic Admin Body')
			)
		);

		expect(html).toContain('data-rw-app-shell="admin"');
		expect(html).toContain('data-rw-shell-layout="sidebar"');
		expect(html).toContain('data-rw-sidebar=""');
		expect(html).toContain('data-rw-open-in-workspace=""');
		expect(html).toContain('workspace=1');
		expect(html).toContain('width:228px');
		expect(html).not.toContain('data-rw-global-bar=');
	});

	it('expands nested children nav items and renders semantic breadcrumb trail when a child route is active', () => {
		const workspace = makeWorkspaceContext({
			shellMode: 'workspace',
			shellLayout: 'sidebar',
		});

		const html = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace,
					layout: 'sidebar',
					title: 'Forms',
					navItems: sampleNavItems,
					activeNav: 'rules-webhooks',
				},
				React.createElement('div', null, 'Webhook Rules')
			)
		);

		expect(html).toContain('Spam Protection');
		expect(html).toContain('Signed Webhooks');
		expect(html).toContain('aria-current="page"');
		expect(html).toContain('aria-label="Breadcrumb"');
		expect(html).toContain('Rules');
		expect(html).toContain('Signed Webhooks');
	});

	it('renders RecordHeader with top-aligned non-wrapping desktop action layout and left icon back control', () => {
		const html = renderToStaticMarkup(
			React.createElement(RecordHeader, {
				title: 'Edit Customer Profile',
				subtitle: 'Manage profile record fields',
				dirty: true,
				backHref: '/processwire/contacts/',
				badges: [{ label: 'Active', variant: 'secondary' }],
				actions: React.createElement('button', { type: 'button' }, 'Save Record'),
			})
		);

		expect(html).toContain('data-rw-record-header=""');
		expect(html).toContain('md:flex-nowrap md:items-start');
		expect(html).toContain('data-rw-record-identity=""');
		expect(html).toContain('data-rw-record-back=""');
		expect(html).toContain('data-rw-record-actions=""');
		expect(html).toContain('data-rw-head-buttons=""');
		expect(html).toContain('flex-wrap');
		expect(html).toContain('Save Record');
		expect(html.indexOf('data-rw-record-back=""')).toBeLessThan(html.indexOf('data-rw-record-title=""'));
		expect(html.indexOf('data-rw-record-identity=""')).toBeLessThan(html.indexOf('data-rw-record-actions=""'));
	});

	it('keeps TopbarShellLayout backwards-compatible DOM markers intact', () => {
		const workspace = makeWorkspaceContext({
			shellMode: 'workspace',
			shellLayout: 'topbar',
			preferences: {
				themeMode: 'light',
				shellLayout: 'topbar',
				sidebarCollapsed: false,
				favorites: ['seo'],
				hidden: [],
			},
		});

		const html = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace,
					layout: 'topbar',
					title: 'Forms',
					subtitle: 'Submission pipeline',
					navItems: sampleNavItems,
					activeNav: 'overview',
				},
				React.createElement('div', null, 'Topbar Body')
			)
		);

		expect(html).toContain('data-rw-shell-layout="topbar"');
		expect(html).toContain('data-rw-global-bar=""');
		expect(html).toContain('data-rw-module-header=""');
		expect(html).toContain('data-rw-module-nav=""');
		expect(html).toContain('data-rw-workspace-body=""');
		expect(html).toMatch(/data-rw-admin-return="(?:true|)"/);
		expect(html).toContain('data-rw-user-menu-trigger=""');
		expect(html).not.toContain('data-rw-sidebar=""');
		expect(html).not.toContain('data-rw-sidebar-collapsed=');
	});

	it('supports registering a custom 3rd shell layout and rendering it via AppShell', () => {
		registerShellLayout({
			id: 'custom-deck',
			label: 'Deck',
			description: 'Custom command deck layout.',
			icon: 'layout-board',
			supportsCollapse: true,
			order: 15,
			render: (props) =>
				React.createElement(
					'section',
					{
						'data-rw-custom-deck': props.shellLayout,
						'data-available-layouts': props.availableShellLayouts.map((l) => l.id).join(','),
					},
					props.children
				),
		});

		const registered = getShellLayout('custom-deck');
		expect(registered?.id).toBe('custom-deck');
		expect(registered?.order).toBe(15);

		const orderedIds = listShellLayouts().map((item) => item.id);
		expect(orderedIds.indexOf('topbar')).toBeLessThan(orderedIds.indexOf('custom-deck'));
		expect(orderedIds.indexOf('custom-deck')).toBeLessThan(orderedIds.indexOf('sidebar'));

		expect(resolveShellLayoutDefinition('custom-deck', 'topbar').id).toBe('custom-deck');
		expect(resolveShellLayoutDefinition('unknown-shell', 'sidebar').id).toBe('sidebar');

		const workspace = makeWorkspaceContext({
			shellMode: 'workspace',
			shellLayout: 'custom-deck',
			preferences: {
				themeMode: 'light',
				shellLayout: 'custom-deck',
				sidebarCollapsed: false,
				favorites: [],
				hidden: [],
			},
		});

		const html = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace,
					title: 'Forms',
					navItems: sampleNavItems,
				},
				React.createElement('div', null, 'Deck Body')
			)
		);

		expect(html).toContain('data-rw-shell-layout="custom-deck"');
		expect(html).toContain('data-rw-sidebar-collapsed="false"');
		expect(html).toContain('data-rw-custom-deck="custom-deck"');
		expect(html).toContain('topbar,custom-deck,sidebar');
		expect(html).toContain('Deck Body');
	});

	it('exports SidebarShellLayout as a named shell renderer', () => {
		expect(typeof SidebarShellLayout).toBe('function');
	});

	it('renders accessible aria-label on Topbar quick-switcher trigger and translated star pin controls', () => {
		const workspace = makeWorkspaceContext({
			shellMode: 'workspace',
			shellLayout: 'topbar',
			enableKeyboardShortcuts: true,
			preferences: {
				themeMode: 'light',
				shellLayout: 'topbar',
				sidebarCollapsed: false,
				favorites: ['seo'],
				hidden: [],
			},
		});

		const html = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace,
					layout: 'topbar',
					title: 'Forms',
					navItems: sampleNavItems,
					activeNav: 'overview',
				},
				React.createElement('div', null, 'Body')
			)
		);

		expect(html).toContain('data-rw-command-trigger="true"');
		expect(html).toContain('title="Quick Switcher (Cmd/Ctrl+K)"');
		expect(html).toContain('class="hidden xl:inline">Quick Jump</span>');
		expect(html).toContain('class="sr-only xl:hidden">Quick Jump</span>');
		expect(html).not.toMatch(/data-rw-command-trigger="true"[^>]*aria-label=/);
		expect(html).not.toContain('Remove from favorites');
		expect(html).not.toContain('Pin to favorites');

		const topbarSrc = readFileSync(
			resolve(import.meta.dirname, '../../resources/ts/layout/WorkspaceTopbar.tsx'),
			'utf8'
		);
		const drawerSrc = readFileSync(
			resolve(import.meta.dirname, '../../resources/ts/layout/MobileNavDrawer.tsx'),
			'utf8'
		);
		expect(topbarSrc).toContain("t('launcher.unpinWorkspace'");
		expect(topbarSrc).toContain("t('launcher.pinWorkspace'");
		expect(topbarSrc).toContain("t('shell.quickSwitcherShortcut'");
		expect(topbarSrc).not.toContain('Remove from favorites');
		expect(topbarSrc).not.toContain('Pin to favorites');
		expect(drawerSrc).toContain('data-rw-admin-return=""');
		expect(drawerSrc).toContain("t('shell.navigation'");
		expect(drawerSrc).toContain("t('shell.workspaces'");
		expect(drawerSrc).toContain("t('launcher.unpinWorkspace'");
		expect(drawerSrc).toContain("t('shell.superuser'");
		expect(drawerSrc).toContain("t('shell.standardUser'");
	});

	it('renders responsive flex-wrap header action containers without shrink-0 clipping across topbar and sidebar shells', () => {
		const workspaceNav: AppShellNavItem[] = [
			{ id: 'overview', label: 'Overview' },
			{ id: 'directory', label: 'Module Directory' },
		];
		const headerActions = React.createElement(
			'div',
			{
				'data-rw-workspace-header-actions': '',
				className: 'flex min-w-0 max-w-full flex-wrap items-center gap-2',
			},
			React.createElement('a', { href: '/processwire/workspace/ui-showcase/' }, 'UI Showcase'),
			React.createElement('button', { type: 'button' }, 'Customize Layout'),
			React.createElement('button', { type: 'button' }, 'Refresh')
		);

		const sidebarHtml = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace: makeWorkspaceContext({
						shellMode: 'workspace',
						shellLayout: 'sidebar',
						activeWorkspace: null,
					}),
					layout: 'sidebar',
					title: 'Workspace',
					pills: [
						{ label: '10 Modules', variant: 'primary' },
						{ label: '8/8 Widgets', variant: 'secondary' },
					],
					navItems: workspaceNav,
					activeNav: 'overview',
					headerActions,
				},
				React.createElement('div', null, 'Overview Body')
			)
		);

		expect(sidebarHtml).toContain('data-rw-sidebar-header=""');
		expect(sidebarHtml).toContain('flex min-w-0 max-w-full flex-auto md:flex-1 items-center gap-2');
		expect(sidebarHtml).toContain('data-rw-header-actions="" class="flex min-w-0 max-w-full flex-wrap items-center gap-2"');
		expect(sidebarHtml).not.toMatch(/data-rw-header-actions=""[^>]*shrink-0/);

		const topbarHtml = renderToStaticMarkup(
			React.createElement(
				AppShell,
				{
					workspace: makeWorkspaceContext({
						shellMode: 'workspace',
						shellLayout: 'topbar',
						activeWorkspace: null,
					}),
					layout: 'topbar',
					title: 'Workspace',
					pills: [
						{ label: '10 Modules', variant: 'primary' },
						{ label: '8/8 Widgets', variant: 'secondary' },
					],
					navItems: workspaceNav,
					activeNav: 'overview',
					headerActions,
				},
				React.createElement('div', null, 'Overview Body')
			)
		);

		expect(topbarHtml).toContain('data-rw-module-header=""');
		expect(topbarHtml).toContain('class="min-w-0 md:flex-1 space-y-1"');
		expect(topbarHtml).toContain(
			'data-rw-header-actions="" class="flex min-w-0 max-w-full flex-wrap items-center gap-2 md:justify-end"'
		);
		expect(topbarHtml).not.toMatch(/data-rw-header-actions=""[^>]*shrink-0/);

		const workspaceEntrySrc = readFileSync(
			resolve(import.meta.dirname, '../../resources/ts/entries/ProcessReactWorkspace.tsx'),
			'utf8'
		);
		expect(workspaceEntrySrc).toContain('data-rw-workspace-header-actions=""');
		expect(workspaceEntrySrc).toContain('className="flex min-w-0 max-w-full flex-wrap items-center gap-2"');
	});
});
