/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import {
	createInertiaApp,
	Deferred,
	Head,
	Link,
	router,
	usePage,
	usePoll,
	usePrefetch,
	useRemember,
	WhenVisible,
} from '@inertiajs/react';
import { getReactWorkspaceRuntime } from '../runtime';
import {
	AppShell,
	EditPresenceBanner,
	postWorkspacePreferenceAction,
	RecordHeader,
	renderNoticeMarkup,
	useEditPresence,
} from '../layout/AppShell';
import { ModuleSwitcher } from '../layout/ModuleSwitcher';
import {
	getShellLayout,
	listShellLayouts,
	registerShellLayout,
	resolveShellLayoutDefinition,
	type ShellLayoutDefinition,
	type ShellLayoutRendererProps,
} from '../layout/shellRegistry';
import { SidebarShellLayout } from '../layout/SidebarShellLayout';
import { TopbarShellLayout } from '../layout/TopbarShellLayout';
import type { ShellLayoutDescriptorDto, ShellLayoutId } from '../layout/types';
import { UserAccountMenu } from '../layout/UserAccountMenu';
import { useShellLayout } from '../layout/useShellLayout';

const runtime = getReactWorkspaceRuntime();

runtime.__provideInertiaAdapter({
	createInertiaApp,
	Deferred,
	Head,
	Link,
	router,
	usePage,
	usePoll,
	usePrefetch,
	useRemember,
	WhenVisible,
});

const Layout = {
	AppShell,
	EditPresenceBanner,
	RecordHeader,
	postWorkspacePreferenceAction,
	renderNoticeMarkup,
	useEditPresence,
	registerShellLayout,
	getShellLayout,
	listShellLayouts,
	resolveShellLayoutDefinition,
	useShellLayout,
	ModuleSwitcher,
	UserAccountMenu,
	TopbarShellLayout,
	SidebarShellLayout,
};

Object.assign(runtime.Layout, Layout);
runtime.__provideLayout(Layout);

export {
	AppShell,
	EditPresenceBanner,
	RecordHeader,
	postWorkspacePreferenceAction,
	renderNoticeMarkup,
	useEditPresence,
	registerShellLayout,
	getShellLayout,
	listShellLayouts,
	resolveShellLayoutDefinition,
	useShellLayout,
	ModuleSwitcher,
	UserAccountMenu,
	TopbarShellLayout,
	SidebarShellLayout,
};

export type {
	ShellLayoutId,
	ShellLayoutDescriptorDto,
	ShellLayoutDefinition,
	ShellLayoutRendererProps,
};
