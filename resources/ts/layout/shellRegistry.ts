import type React from 'react';
import type { ThemeMode, ThemePresetId, ThemePresetMeta } from '../hooks';
import type {
	ActionFeedbackDto,
	AppShellNavItem,
	AppShellNavSection,
	AppShellProps,
	AppShellRecordHeaderProps,
	ShellLayoutDescriptorDto,
	ShellLayoutId,
	WorkspaceDefinitionDto,
	WorkspaceSharedContext,
} from './types';

export interface ShellLayoutRendererProps {
	workspace?: WorkspaceSharedContext;
	title: string;
	subtitle?: string;
	icon?: string;
	pills: NonNullable<AppShellProps['pills']>;
	navItems: AppShellNavItem[];
	sections: AppShellNavSection[];
	resolvedNavItems: AppShellNavItem[];
	resolvedActiveNav?: string;
	recordHeader?: AppShellRecordHeaderProps | React.ReactNode;
	hasRecordHeader: boolean;
	recordHeaderSpec: AppShellRecordHeaderProps | null;
	hasDirtySchemaForm: boolean;
	resolvedHeaderActions?: React.ReactNode;
	activeFeedback: ActionFeedbackDto | null;
	onDismissFeedback: () => void;
	flash?: {
		messages?: string[];
		warnings?: string[];
		errors?: string[];
		feedback?: ActionFeedbackDto;
	};
	dismissedFlash: {
		errors: boolean;
		warnings: boolean;
		messages: boolean;
	};
	onDismissFlash: (bucket: 'errors' | 'warnings' | 'messages') => void;
	isEmbeddedIsland: boolean;
	shellMode: 'workspace' | 'admin';
	isClassicAdminShell: boolean;
	showGlobalWorkspaceBar: boolean;
	enableShortcuts: boolean;
	openInWorkspaceHref: string;
	MainContainer: 'main' | 'div';
	returnLabel: string;
	workspaces: WorkspaceDefinitionDto[];
	primaryWorkspaces: WorkspaceDefinitionDto[];
	overflowWorkspaces: WorkspaceDefinitionDto[];
	filteredOverflow: WorkspaceDefinitionDto[];
	activeWorkspace?: WorkspaceDefinitionDto | null;
	favorites: string[];
	isWorkspaceActive: (ws: WorkspaceDefinitionDto) => boolean;
	toggleFavoriteWorkspace: (workspaceId: string, e?: React.MouseEvent) => Promise<void> | void;
	moreMenuOpen: boolean;
	setMoreMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
	moreFilter: string;
	setMoreFilter: (next: string) => void;
	moreMenuRef: React.RefObject<HTMLDivElement | null>;
	mobileDrawerOpen: boolean;
	setMobileDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
	onOpenMobileDrawer: () => void;
	onOpenCommandPalette: () => void;
	onOpenShortcuts: () => void;
	themeMode: ThemeMode;
	resolvedDark: boolean;
	themePreset: ThemePresetId;
	userThemePreset: string;
	siteDefaultThemePreset: ThemePresetId;
	presetPending: boolean;
	availableThemePresets: ThemePresetMeta[];
	activePresetMeta?: ThemePresetMeta;
	setThemeMode: (mode: ThemeMode) => void;
	setThemePreset: (preset: ThemePresetId | '') => Promise<boolean> | void;
	shellLayout: ShellLayoutId;
	userShellLayout: string;
	siteDefaultShellLayout: ShellLayoutId;
	availableShellLayouts: ShellLayoutDescriptorDto[];
	sidebarCollapsed: boolean;
	layoutPending: boolean;
	setShellLayout: (nextLayout: string) => Promise<boolean> | void;
	setSidebarCollapsed: (collapsed: boolean) => Promise<boolean> | void;
	toggleSidebarCollapsed: () => Promise<boolean> | void;
	children: React.ReactNode;
}

export interface ShellLayoutDefinition {
	id: ShellLayoutId;
	label: string;
	labelKey?: string;
	description?: string;
	descriptionKey?: string;
	icon?: string;
	supportsCollapse?: boolean;
	order?: number;
	render: (props: ShellLayoutRendererProps) => React.ReactElement;
}

const SHELL_LAYOUT_ID_RE = /^[a-z0-9_-]{1,40}$/;

const shellLayoutRegistry = new Map<string, ShellLayoutDefinition>();

function normalizeLayoutKey(rawId?: string | null): string {
	if (typeof rawId !== 'string') {
		return '';
	}
	const clean = rawId.trim().toLowerCase();
	if (clean === '' || clean === 'default' || !SHELL_LAYOUT_ID_RE.test(clean)) {
		return '';
	}
	return clean;
}

/**
 * Register or replace a pluggable `AppShell` layout renderer by canonical layout ID.
 */
export function registerShellLayout(definition: ShellLayoutDefinition): void {
	const id = normalizeLayoutKey(definition.id);
	if (!id) {
		return;
	}
	shellLayoutRegistry.set(id, {
		...definition,
		id,
	});
}

/**
 * Retrieve a registered `ShellLayoutDefinition` by ID, or `undefined` when absent.
 */
export function getShellLayout(id?: string | null): ShellLayoutDefinition | undefined {
	const key = normalizeLayoutKey(id);
	if (!key) {
		return undefined;
	}
	return shellLayoutRegistry.get(key);
}

/**
 * Return all registered shell layouts ordered by `order` ascending, then `id` ascending.
 */
export function listShellLayouts(): ShellLayoutDefinition[] {
	return Array.from(shellLayoutRegistry.values()).sort((a, b) => {
		const orderA = typeof a.order === 'number' ? a.order : 100;
		const orderB = typeof b.order === 'number' ? b.order : 100;
		if (orderA !== orderB) {
			return orderA - orderB;
		}
		return a.id.localeCompare(b.id);
	});
}

/**
 * Resolve the effective `ShellLayoutDefinition` for `preferredId`, falling back to `fallbackId`,
 * `'topbar'`, or the first registered layout definition.
 */
export function resolveShellLayoutDefinition(
	preferredId?: string | null,
	fallbackId: string = 'topbar'
): ShellLayoutDefinition | undefined {
	return (
		getShellLayout(preferredId) ??
		getShellLayout(fallbackId) ??
		getShellLayout('topbar') ??
		listShellLayouts()[0]
	);
}
