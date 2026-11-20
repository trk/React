import type React from 'react';
import type { ThemePresetId } from '../hooks';

export interface WorkspaceStatItem {
	label: string;
	value: string;
	tone?: string;
	variant?: string;
}

export interface WorkspaceDefinitionDto {
	id: string;
	title: string;
	subtitle?: string;
	description: string;
	icon: string;
	logoUrl?: string;
	category: string;
	url: string;
	permission: string;
	process?: string;
	processModule?: string;
	component?: string;
	order: number;
	badge: string;
	badgeVariant?: string;
	pills?: string[];
	stats: WorkspaceStatItem[];
	cliCommand?: string;
	scripts?: string[];
	styles?: string[];
}

export type WorkspaceWidgetSize =
	| 'sm'
	| 'md'
	| 'lg'
	| 'full'
	| '1'
	| '2'
	| '3'
	| '4'
	| '5'
	| '6'
	| '7'
	| '8'
	| '9'
	| '10'
	| '11'
	| '12'
	| string;

export interface WorkspacePreferencesDto {
	userId?: number;
	favorites: string[];
	widgetOrder: string[];
	hiddenWidgets: string[];
	widgetSizes: Record<string, WorkspaceWidgetSize>;
	themeMode?: string;
	themePreset?: string;
	updatedAt?: string;
}

export interface WorkspaceWidgetMetricDto {
	label: string;
	value: string;
	tone?: string;
	href?: string;
}

export interface WorkspaceWidgetItemDto {
	id: string;
	title?: string;
	label?: string;
	subtitle?: string;
	badge?: string;
	badgeVariant?: string;
	href?: string;
	url?: string;
	icon?: string;
	meta?: string;
}

export interface WorkspaceWidgetActionDto {
	label: string;
	href?: string;
	url?: string;
	icon?: string;
	variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
}

export interface WorkspaceWidgetDto {
	id: string;
	workspaceId: string;
	workspaceTitle?: string;
	workspaceUrl?: string;
	title: string;
	subtitle?: string;
	description?: string;
	icon: string;
	size: WorkspaceWidgetSize;
	order: number;
	metrics?: WorkspaceWidgetMetricDto[];
	items?: WorkspaceWidgetItemDto[];
	actions?: WorkspaceWidgetActionDto[];
	status?: {
		label: string;
		tone: string;
		detail?: string;
	} | null;
	emptyText?: string;
	data?: {
		metrics?: WorkspaceWidgetMetricDto[];
		items?: WorkspaceWidgetItemDto[];
		actions?: WorkspaceWidgetActionDto[];
		status?: {
			label: string;
			tone: string;
			detail?: string;
		} | null;
		emptyText?: string;
	};
}

export interface WorkspaceSharedContext {
	appName: string;
	adminUrl: string;
	adminReturnLabel?: string;
	shellMode?: 'workspace' | 'admin';
	launcherUrl: string;
	prefsEndpoint?: string;
	processUrl?: string;
	themeMode: 'light' | 'dark' | 'system';
	themePreset?: ThemePresetId;
	userThemePreset?: string;
	siteDefaultThemePreset?: ThemePresetId;
	hasCustomThemeTokens?: boolean;
	useInputFocus?: boolean;
	enableKeyboardShortcuts?: boolean;
	mainColor?: string;
	user: {
		id: number;
		name: string;
		label?: string;
		email: string;
		avatarUrl?: string;
		avatarIcon?: string;
		viewSiteUrl?: string;
		profileUrl?: string;
		logoutUrl?: string;
		isSuperuser: boolean;
		roles?: string[];
	};
	activeWorkspace: WorkspaceDefinitionDto | null;
	workspaces: WorkspaceDefinitionDto[];
	preferences?: WorkspacePreferencesDto;
}

export interface AppShellNavItem {
	id?: string;
	key?: string;
	label: string;
	href?: string;
	icon?: string;
	badge?: string | number | null;
	badgeVariant?: 'default' | 'primary' | 'secondary' | 'muted' | 'outline' | 'success' | 'warning' | 'danger';
	active?: boolean;
	dividerBefore?: boolean;
	onClick?: () => void;
}

export interface AppShellNavSection {
	id: string;
	label?: string;
	items: AppShellNavItem[];
}

export interface ActionFeedbackDto {
	type: 'success' | 'warning' | 'danger' | 'primary';
	title: string;
	message: string;
	output?: string;
	timestamp?: string;
}

export interface AppShellRecordHeaderBadge {
	label: string;
	variant?: 'default' | 'primary' | 'secondary' | 'muted' | 'outline' | 'success' | 'warning' | 'danger';
	icon?: string;
	dot?: boolean;
	mono?: boolean;
}

export interface AppShellRecordHeaderProps {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	backHref?: string;
	backLabel?: string;
	onBack?: () => void;
	badges?: AppShellRecordHeaderBadge[];
	dirty?: boolean;
	dirtyLabel?: string;
	actions?: React.ReactNode;
	showHeadButtonsPortal?: boolean;
}

export interface AppShellProps {
	workspace?: WorkspaceSharedContext;
	title: string;
	subtitle?: string;
	icon?: string;
	pills?: Array<string | { label: string; variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline' }>;
	navItems?: AppShellNavItem[];
	sections?: AppShellNavSection[];
	activeNav?: string;
	activeId?: string;
	recordHeader?: AppShellRecordHeaderProps | React.ReactNode;
	headerActions?: React.ReactNode;
	actions?: React.ReactNode;
	feedback?: ActionFeedbackDto | null;
	onDismissFeedback?: () => void;
	children: React.ReactNode;
}

export interface CommandPaletteItem {
	id: string;
	label: string;
	subtitle: string;
	icon: string;
	href?: string;
	onClick?: () => void;
	isInertia?: boolean;
}
