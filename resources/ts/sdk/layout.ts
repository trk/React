import type {
	ActionFeedbackDto,
	AppShellNavItem,
	AppShellNavSection,
	AppShellProps,
	AppShellRecordHeaderBadge,
	AppShellRecordHeaderProps,
	EditPresenceBannerProps,
	WorkspaceDefinitionDto,
	WorkspacePreferencesDto,
	WorkspaceSharedContext,
	WorkspaceStatItem,
	WorkspaceWidgetActionDto,
	WorkspaceWidgetDto,
	WorkspaceWidgetItemDto,
	WorkspaceWidgetMetricDto,
	WorkspaceWidgetSize,
} from '../layout/AppShell';
import {
	useEditPresence,
	type EditPresenceSnapshot,
	type PresenceCoEditor,
	type PresenceLastSaved,
	type UseEditPresenceOptions,
	type UseEditPresenceResult,
} from './hooks';
import { requireReactRuntime } from './optional';

export const Layout = requireReactRuntime().Layout;

export const {
	AppShell,
	RecordHeader,
	EditPresenceBanner,
	postWorkspacePreferenceAction,
	renderNoticeMarkup,
} = Layout;

export {
	useEditPresence,
	type EditPresenceSnapshot,
	type PresenceCoEditor,
	type PresenceLastSaved,
	type UseEditPresenceOptions,
	type UseEditPresenceResult,
};

export type {
	ActionFeedbackDto,
	AppShellNavItem,
	AppShellNavSection,
	AppShellProps,
	AppShellRecordHeaderBadge,
	AppShellRecordHeaderProps,
	EditPresenceBannerProps,
	WorkspaceDefinitionDto,
	WorkspacePreferencesDto,
	WorkspaceSharedContext,
	WorkspaceStatItem,
	WorkspaceWidgetActionDto,
	WorkspaceWidgetDto,
	WorkspaceWidgetItemDto,
	WorkspaceWidgetMetricDto,
	WorkspaceWidgetSize,
};
