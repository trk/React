import React from 'react';
import { MobileNavDrawer } from './MobileNavDrawer';
import { ModuleHeaderBar } from './ModuleHeaderBar';
import { WorkspaceFlashNotices } from './noticeMarkup';
import { isRecordHeaderSpec, RecordHeader } from './RecordHeader';
import {
	registerShellLayout,
	type ShellLayoutDefinition,
	type ShellLayoutRendererProps,
} from './shellRegistry';
import { WorkspaceTopbar } from './WorkspaceTopbar';

export function TopbarShellLayout({
	workspace,
	title,
	subtitle,
	icon,
	pills,
	resolvedNavItems,
	resolvedActiveNav,
	recordHeader,
	hasRecordHeader,
	hasDirtySchemaForm,
	resolvedHeaderActions,
	activeFeedback,
	onDismissFeedback,
	flash,
	dismissedFlash,
	onDismissFlash,
	isEmbeddedIsland,
	isClassicAdminShell,
	showGlobalWorkspaceBar,
	enableShortcuts,
	openInWorkspaceHref,
	MainContainer,
	returnLabel,
	workspaces,
	primaryWorkspaces,
	overflowWorkspaces,
	filteredOverflow,
	activeWorkspace,
	favorites,
	isWorkspaceActive,
	toggleFavoriteWorkspace,
	moreMenuOpen,
	setMoreMenuOpen,
	moreFilter,
	setMoreFilter,
	moreMenuRef,
	mobileDrawerOpen,
	setMobileDrawerOpen,
	onOpenMobileDrawer,
	onOpenCommandPalette,
	onOpenShortcuts,
	themeMode,
	resolvedDark,
	themePreset,
	userThemePreset,
	siteDefaultThemePreset,
	presetPending,
	availableThemePresets,
	activePresetMeta,
	setThemeMode,
	setThemePreset,
	shellLayout,
	userShellLayout,
	siteDefaultShellLayout,
	availableShellLayouts,
	layoutPending,
	setShellLayout,
	children,
}: ShellLayoutRendererProps): React.ReactElement {
	return (
		<>
			{showGlobalWorkspaceBar ? (
				<WorkspaceTopbar
					workspace={workspace}
					returnLabel={returnLabel}
					workspaces={workspaces}
					primaryWorkspaces={primaryWorkspaces}
					overflowWorkspaces={overflowWorkspaces}
					filteredOverflow={filteredOverflow}
					activeWorkspace={activeWorkspace}
					favorites={favorites}
					isWorkspaceActive={isWorkspaceActive}
					moreMenuOpen={moreMenuOpen}
					setMoreMenuOpen={setMoreMenuOpen}
					moreFilter={moreFilter}
					setMoreFilter={setMoreFilter}
					moreMenuRef={moreMenuRef}
					toggleFavoriteWorkspace={toggleFavoriteWorkspace}
					onOpenMobileDrawer={onOpenMobileDrawer}
					onOpenCommandPalette={onOpenCommandPalette}
					onOpenShortcuts={onOpenShortcuts}
					themeMode={themeMode}
					resolvedDark={resolvedDark}
					themePreset={themePreset}
					userThemePreset={userThemePreset}
					siteDefaultThemePreset={siteDefaultThemePreset}
					presetPending={presetPending}
					availableThemePresets={availableThemePresets}
					activePresetMeta={activePresetMeta}
					setThemeMode={setThemeMode}
					setThemePreset={setThemePreset}
					shellLayout={shellLayout}
					userShellLayout={userShellLayout}
					siteDefaultShellLayout={siteDefaultShellLayout}
					availableShellLayouts={availableShellLayouts}
					layoutPending={layoutPending}
					setShellLayout={setShellLayout}
				/>
			) : null}

			{showGlobalWorkspaceBar ? (
				<MobileNavDrawer
					open={mobileDrawerOpen}
					onOpenChange={setMobileDrawerOpen}
					title={title}
					returnLabel={returnLabel}
					workspace={workspace}
					resolvedNavItems={resolvedNavItems}
					resolvedActiveNav={resolvedActiveNav}
					workspaces={workspaces}
					favorites={favorites}
					isWorkspaceActive={isWorkspaceActive}
					toggleFavoriteWorkspace={toggleFavoriteWorkspace}
				/>
			) : null}

			<MainContainer data-rw-app-main="" className="flex-1 flex flex-col min-w-0">
				<ModuleHeaderBar
					title={title}
					subtitle={subtitle}
					icon={icon}
					pills={pills}
					isEmbeddedIsland={isEmbeddedIsland}
					hasRecordHeader={hasRecordHeader}
					resolvedHeaderActions={resolvedHeaderActions}
					isClassicAdminShell={isClassicAdminShell}
					enableShortcuts={enableShortcuts}
					openInWorkspaceHref={openInWorkspaceHref}
					onOpenCommandPalette={onOpenCommandPalette}
					resolvedNavItems={resolvedNavItems}
					resolvedActiveNav={resolvedActiveNav}
				/>

				<div
					data-rw-workspace-body=""
					className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 sm:py-6 space-y-5"
				>
					{hasRecordHeader
						? isRecordHeaderSpec(recordHeader)
							? (
									<RecordHeader
										{...recordHeader}
										dirty={recordHeader.dirty ?? hasDirtySchemaForm}
									/>
								)
							: recordHeader
						: null}

					<WorkspaceFlashNotices
						activeFeedback={activeFeedback}
						onDismissFeedback={onDismissFeedback}
						flash={flash}
						dismissedFlash={dismissedFlash}
						onDismissFlash={onDismissFlash}
					/>

					{children}
				</div>
			</MainContainer>
		</>
	);
}

export const TOPBAR_SHELL_LAYOUT: ShellLayoutDefinition = {
	id: 'topbar',
	label: 'Top Bar',
	labelKey: 'shell.layoutTopbar',
	description: 'Horizontal top navigation bar with inline workspace links and section tabs.',
	descriptionKey: 'shell.layoutTopbarDesc',
	icon: 'layout-navbar',
	supportsCollapse: false,
	order: 10,
	render: (props) => <TopbarShellLayout {...props} />,
};

registerShellLayout(TOPBAR_SHELL_LAYOUT);
