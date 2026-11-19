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
};

runtime.__provideLayout(Layout);
