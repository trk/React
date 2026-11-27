import type {
	ActionFeedbackDto,
	AppShellNavItem,
	AppShellNavSection,
	AppShellProps,
	AppShellRecordHeaderBadge,
	AppShellRecordHeaderProps,
	CommandPaletteItem,
	EditPresenceBannerProps,
	ShellLayoutDefinition,
	ShellLayoutDescriptorDto,
	ShellLayoutId,
	ShellLayoutRendererProps,
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
	registerShellLayout,
	getShellLayout,
	listShellLayouts,
	resolveShellLayoutDefinition,
	useShellLayout,
	ModuleSwitcher,
	UserAccountMenu,
	TopbarShellLayout,
	SidebarShellLayout,
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
	CommandPaletteItem,
	EditPresenceBannerProps,
	ShellLayoutDefinition,
	ShellLayoutDescriptorDto,
	ShellLayoutId,
	ShellLayoutRendererProps,
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
