<?php

declare(strict_types=1);

namespace Totoglu\React\I18n;

use ProcessWire\Page;
use ProcessWire\Process;
use ProcessWire\React;
use ProcessWire\Wire;

/**
 * TranslationCatalogService
 *
 * Central UI translation catalog resolved natively through ProcessWire's `LanguageTranslator`,
 * dot-notation flattener, and locale-scoped Inertia `OnceProp` builder (`rw_i18n:{locale}:{ns}`).
 * Shipped `languages/{en,tr,de,fr,es,ru}.csv` files serve strictly as ProcessWire `LanguagePorter`
 * translation import packs in `Setup > Languages`.
 */
final class TranslationCatalogService extends Wire
{
	public function __construct(private React $react)
	{
		parent::__construct();
	}

	/**
	 * Return core static UI translations parsed natively by ProcessWire's `LanguageParser`.
	 *
	 * @return array<string, mixed>
	 */
	public function coreTranslations(): array
	{
		return [
			'common' => [
				'save' => $this->_('Save'),
				'saving' => $this->_('Saving...'),
				'cancel' => $this->_('Cancel'),
				'close' => $this->_('Close'),
				'done' => $this->_('Done'),
				'open' => $this->_('Open'),
				'apply' => $this->_('Apply'),
				'applying' => $this->_('Applying...'),
				'executing' => $this->_('Executing...'),
				'reset' => $this->_('Reset'),
				'refresh' => $this->_('Refresh'),
				'refreshing' => $this->_('Refreshing...'),
				'reload' => $this->_('Reload'),
				'retry' => $this->_('Retry'),
				'search' => $this->_('Search'),
				'clear' => $this->_('Clear'),
				'create' => $this->_('Create'),
				'edit' => $this->_('Edit'),
				'delete' => $this->_('Delete'),
				'remove' => $this->_('Remove'),
				'dismiss' => $this->_('Dismiss'),
				'confirm' => $this->_('Confirm'),
				'confirmExecute' => $this->_('Confirm & Execute'),
				'confirmAcknowledge' => $this->_('I understand the impact of this operation and wish to proceed.'),
				'copy' => $this->_('Copy'),
				'copied' => $this->_('Copied'),
				'copyCommand' => $this->_('Copy command'),
				'export' => $this->_('Export'),
				'import' => $this->_('Import'),
				'loading' => $this->_('Loading...'),
				'actions' => $this->_('Actions'),
				'languages' => $this->_('Languages'),
				'error' => $this->_('Error'),
				'warning' => $this->_('Warning'),
				'notice' => $this->_('Notice'),
				'all' => $this->_('All'),
				'none' => $this->_('None'),
				'yes' => $this->_('Yes'),
				'no' => $this->_('No'),
				'more' => $this->_('More'),
				'noMatches' => $this->_('No matching options'),
				'selectOption' => $this->_('Select an option...'),
				'toggleOptions' => $this->_('Toggle options'),
				'noResults' => $this->_('No results found.'),
				'notifications' => $this->_('Notifications'),
				'back' => $this->_('Back'),
				'change' => $this->_('Change'),
				'unavailable' => $this->_('Unavailable'),
			],
			'shell' => [
				'workspace' => $this->_('Workspace'),
				'workspaces' => $this->_('Workspaces'),
				'workspaceDashboard' => $this->_('Workspace Dashboard'),
				'workspaceDashboardSubtitle' => $this->_('All modules, favorites, and customizable dashboard widgets'),
				'currentWorkspaceSection' => $this->_('Current workspace section'),
				'workspaceNavigation' => $this->_('Workspace navigation'),
				'navigation' => $this->_('Navigation'),
				'openNavigationMenu' => $this->_('Open workspace navigation menu'),
				'closeNavigationMenu' => $this->_('Close navigation menu'),
				'searchWorkspaces' => $this->_('Search workspaces...'),
				'searchWorkspacesLabel' => $this->_('Search workspaces'),
				'findWorkspace' => $this->_('Find workspace...'),
				'noMatchingWorkspaces' => $this->_('No matching workspaces'),
				'noMatchingDestinations' => $this->_('No matching destinations found.'),
				'more' => $this->_('More'),
				'quickJump' => $this->_('Quick Jump'),
				'quickSwitcher' => $this->_('Quick Switcher'),
				'quickSwitcherShortcut' => $this->_('Quick Switcher (Cmd/Ctrl+K)'),
				'jumpPlaceholder' => $this->_('Jump to workspace or section...'),
				'returnToAdmin' => $this->_('Panel'),
				'returnToTarget' => $this->_('Return to {target}'),
				'openInWorkspace' => $this->_('Open in Workspace'),
				'openInWorkspaceTooltip' => $this->_('Switch to full-screen Workspace view'),
				'theme' => $this->_('Theme'),
				'themeMode' => $this->_('Appearance'),
				'colorScheme' => $this->_('Color Scheme'),
				'themeUseSiteDefault' => $this->_('Use site default'),
				'themeSiteDefaultBadge' => $this->_('Site default'),
				'themeLight' => $this->_('Light'),
				'themeDark' => $this->_('Dark'),
				'themeSystem' => $this->_('System'),
				'toggleTheme' => $this->_('Toggle theme'),
				'themeModeTooltip' => $this->_('Theme mode: {mode} (click to switch)'),
				'themePreset' => $this->_('Theme'),
				'themePresetTooltip' => $this->_('Color theme: {preset}'),
				'themePresetMenu' => $this->_('Color theme presets'),
				'themePresetSiteWide' => $this->_('Applies across all modules and workspaces'),
				'themePresetNative' => $this->_('Native Admin'),
				'themePresetNeutral' => $this->_('Neutral'),
				'themePresetSlate' => $this->_('Slate'),
				'themePresetStone' => $this->_('Stone'),
				'themePresetOcean' => $this->_('Ocean'),
				'themePresetIndigo' => $this->_('Indigo'),
				'themePresetTeal' => $this->_('Teal'),
				'themePresetCustom' => $this->_('Custom Tokens'),
				'userMenu' => $this->_('User account menu'),
				'viewSite' => $this->_('View site'),
				'profile' => $this->_('Profile'),
				'logout' => $this->_('Logout'),
				'keyboardShortcuts' => $this->_('Keyboard shortcuts'),
				'dismissErrors' => $this->_('Dismiss errors'),
				'dismissWarnings' => $this->_('Dismiss warnings'),
				'dismissNotices' => $this->_('Dismiss notices'),
				'panelLayout' => $this->_('Panel Layout'),
				'layoutTopbar' => $this->_('Top Bar'),
				'layoutTopbarDesc' => $this->_('Horizontal top navigation bar with inline workspace links and section tabs.'),
				'layoutSidebar' => $this->_('Sidebar'),
				'layoutSidebarDesc' => $this->_('Collapsible left navigation sidebar with module switcher and account footer.'),
				'switchModule' => $this->_('Switch module'),
				'filterModules' => $this->_('Filter modules...'),
				'noMatchingModules' => $this->_('No matching modules'),
				'pinnedModules' => $this->_('Pinned'),
				'allModules' => $this->_('All Modules'),
				'workspaceHub' => $this->_('Workspace Hub'),
				'collapseSidebar' => $this->_('Collapse sidebar'),
				'expandSidebar' => $this->_('Expand sidebar'),
				'toggleSidebarShortcut' => $this->_('Toggle sidebar'),
				'breadcrumb' => $this->_('Breadcrumb'),
				'superuser' => $this->_('Superuser'),
				'standardUser' => $this->_('Standard'),
				'groupRecords' => $this->_('Matching Records'),
				'groupCurrentWorkspace' => $this->_('Current Workspace'),
				'groupWorkspaces' => $this->_('Workspaces'),
				'groupAppearance' => $this->_('Layout & Appearance'),
				'groupActions' => $this->_('Actions'),
				'searchingRecords' => $this->_('Searching records...'),
				'jumpRecordsPlaceholder' => $this->_('Jump to workspace, section, or record...'),
				'layoutOption' => $this->_('Layout: {layout}'),
				'themePresetOption' => $this->_('Color Scheme: {preset}'),
			],
			'launcher' => [
				'title' => $this->_('Workspace'),
				'subtitle' => $this->_('Quick overview, live status cards, and all admin workspaces.'),
				'overview' => $this->_('Overview'),
				'operationalOverview' => $this->_('Operational Overview'),
				'directory' => $this->_('All Workspaces'),
				'moduleDirectory' => $this->_('Module Directory'),
				'moduleCategoryDefault' => $this->_('Module'),
				'favorites' => $this->_('Favorites'),
				'pinned' => $this->_('Pinned'),
				'pinnedShortcuts' => $this->_('Pinned Shortcuts'),
				'pinToTopBar' => $this->_('Pin to top bar'),
				'unpinFromTopBar' => $this->_('Unpin from top bar'),
				'pinWorkspace' => $this->_('Pin {title}'),
				'unpinWorkspace' => $this->_('Unpin {title}'),
				'customize' => $this->_('Customize'),
				'customizeLayout' => $this->_('Customize Layout'),
				'doneCustomizing' => $this->_('Done Customizing'),
				'exportLayout' => $this->_('Export Layout'),
				'exportJson' => $this->_('Export JSON'),
				'importLayout' => $this->_('Import Layout'),
				'importLayoutDescription' => $this->_('Apply a saved workspace layout preset (.json) to update your pinned shortcuts, widget order, widths, and visibility.'),
				'importLayoutJsonLabel' => $this->_('Workspace layout preset JSON'),
				'importJson' => $this->_('Import JSON'),
				'applyLayout' => $this->_('Apply Layout'),
				'chooseJsonFile' => $this->_('Choose JSON File'),
				'resetLayout' => $this->_('Reset Layout'),
				'resetDefault' => $this->_('Reset Default'),
				'resetDefaultLayout' => $this->_('Reset Default Layout'),
				'resetDefaultConfirmNotice' => $this->_('Reset your pinned shortcuts, widget order, widths, and hidden widget settings back to defaults?'),
				'chooseWidgets' => $this->_('Choose Widgets'),
				'hiddenWidgetsCount' => $this->_('{count} hidden widget(s)'),
				'hideWidget' => $this->_('Hide widget from dashboard'),
				'hideWidgetNamed' => $this->_('Hide {title}'),
				'toggleWidgetVisibility' => $this->_('Show {title}'),
				'directoryPrompt' => $this->_('Looking for a specific capability or administration tool?'),
				'browseAllModules' => $this->_('Browse all {count} modules'),
				'noWidgetsTitle' => $this->_('No live widgets registered'),
				'noWidgetsDescription' => $this->_('Installed modules have not registered live summary widgets yet. Open the Module Directory to launch any workspace.'),
				'allWidgetsHiddenTitle' => $this->_('All dashboard widgets are hidden'),
				'allWidgetsHiddenDescription' => $this->_('You have hidden all widgets for your profile. Re-enable widgets or reset your layout to view live module status.'),
				'openDirectory' => $this->_('Open Module Directory'),
				'openWorkspaceNamed' => $this->_('Open {title}'),
				'searchModulesPlaceholder' => $this->_('Search modules by name, capability, or topic...'),
				'noWorkspacesFound' => $this->_('No matching workspaces found.'),
				'noMatchingModules' => $this->_('No matching modules found'),
				'noMatchingModulesDescription' => $this->_('No installed module matched your current search or category filter.'),
				'noWorkspacesAvailable' => $this->_('No workspaces available'),
				'noWorkspacesAvailableDescription' => $this->_('Install or enable a workspace module to access it here.'),
				'resetFilter' => $this->_('Reset Filter'),
			],
			'presence' => [
				'justNow' => $this->_('just now'),
				'secondsAgo' => $this->_('{seconds}s ago'),
				'minutesAgo' => $this->_('{minutes}m ago'),
				'updatedBy' => $this->_('Updated by {user}'),
				'remoteSaveNotice' => $this->_('This record was saved in another session while you had it open. Reload the latest version before saving to avoid overwriting those changes.'),
				'reloadLatest' => $this->_('Reload Latest'),
				'dismissWarning' => $this->_('Dismiss remote save warning'),
				'editingSingle' => $this->_('is currently editing this record ({age}).'),
				'editingMultiple' => $this->_('are currently editing this record.'),
				'coordinateHint' => $this->_('Coordinate changes before saving'),
			],
			'viewport' => [
				'searchPlaceholder' => $this->_('Search records...'),
				'searchPlaceholderShort' => $this->_('Search...'),
				'filters' => $this->_('Filters'),
				'filterViews' => $this->_('Filter view'),
				'viewMode' => $this->_('View mode'),
				'filterOptions' => $this->_('Filter options...'),
				'clearFilters' => $this->_('Clear filters'),
				'columns' => $this->_('Columns'),
				'toggleColumns' => $this->_('Toggle Columns'),
				'resetColumns' => $this->_('Reset columns'),
				'savedViews' => $this->_('Saved Views'),
				'saveView' => $this->_('Save View'),
				'deleteSavedView' => $this->_('Delete saved view'),
				'deleteSavedViewConfirm' => $this->_('Delete the saved view "{label}"?'),
				'presetNamePlaceholder' => $this->_('Preset name...'),
				'bulkActions' => $this->_('Bulk actions'),
				'selectAllRows' => $this->_('Select all rows'),
				'selectedCount' => $this->_('{count} selected'),
				'orderColumn' => $this->_('Order'),
				'clickToEditInline' => $this->_('Click to edit inline'),
				'emptyTitle' => $this->_('No records found'),
				'emptyDescription' => $this->_('Try adjusting your search or filter criteria.'),
				'noItemsYet' => $this->_('No items yet'),
				'emptySearchHint' => $this->_('Try changing your search or filters.'),
				'networkError' => $this->_('Network error while updating this list.'),
				'previousPage' => $this->_('Previous'),
				'nextPage' => $this->_('Next'),
				'pageSummary' => $this->_('Page {page} of {totalPages}'),
				'totalItems' => $this->_('{count} items'),
				'newItem' => $this->_('New Item'),
				'quickEdit' => $this->_('Quick Edit'),
				'quickEditTitle' => $this->_('Quick Edit: {title}'),
				'quickEditSubtitle' => $this->_('Edit key fields without leaving this list.'),
				'saveChanges' => $this->_('Save Changes'),
				'trash' => $this->_('Trash'),
				'viewingTrash' => $this->_('Viewing Trash ({count}) — use row actions or bulk selection to Restore or Delete Permanently.'),
				'backToActive' => $this->_('Back to Active Items'),
				'emptyTrash' => $this->_('Empty Trash'),
				'emptyTrashConfirm' => $this->_('Permanently delete all {count} trashed record(s)? This cannot be undone.'),
				'exportAll' => $this->_('Export All'),
				'exportFiltered' => $this->_('Export Filtered'),
				'exportSelected' => $this->_('Export Selected ({count})'),
				'exportAsFormat' => $this->_('Export {format}'),
				'openFullEditor' => $this->_('Open Full Editor'),
				'quickEditLoadFailed' => $this->_('Failed to load form assets.'),
			],
			'form' => [
				'required' => $this->_('Required'),
				'unsavedChanges' => $this->_('You have unsaved changes.'),
				'unsavedChangesTitle' => $this->_('Unsaved changes'),
				'discardUnsavedNotice' => $this->_('Leaving or reloading this page will discard the edits you have not saved.'),
				'discardAndLeave' => $this->_('Discard & Leave'),
				'previousStep' => $this->_('Previous'),
				'nextStep' => $this->_('Next Step'),
				'validationErrors' => $this->_('Please review the highlighted fields.'),
				'addRow' => $this->_('Add item'),
				'noItemsSelected' => $this->_('No items selected.'),
				'searchRelations' => $this->_('Search items...'),
				'selectPlaceholder' => $this->_('Select...'),
				'quickColumnPresets' => $this->_('Quick column presets'),
				'closeFieldSettings' => $this->_('Close field settings'),
				'openFieldSettings' => $this->_('{field} settings'),
				'fieldSettingsTitle' => $this->_('{field} Settings'),
				'activeSettingsCount' => $this->_('{count} customized'),
				'inlineSettingsLocked' => $this->_('Controls unlock once "{field}" has a value.'),
				'languageTabSwitchHint' => $this->_('Click to switch this field · Double-click to switch all fields'),
				'now' => $this->_('Now'),
				'today' => $this->_('Today'),
				'clearDate' => $this->_('Clear date'),
				'copySecret' => $this->_('Copy secret'),
				'generateNewSecret' => $this->_('Generate new secret'),
				'generate' => $this->_('Generate'),
				'moreSubmitActions' => $this->_('More submit actions'),
				'signaturePad' => $this->_('Signature pad'),
				'signAboveHint' => $this->_('Sign above inside the pad'),
				'phoneCountryCode' => $this->_('Country calling code'),
				'phoneNumber' => $this->_('Phone number'),
				'moreTabs' => $this->_('More'),
				'moreTabsAria' => $this->_('{count} more tabs'),
				'language' => $this->_('Language'),
			],
			'fields' => [
				'phoneCountryCode' => $this->_('Country calling code'),
				'phoneNumber' => $this->_('Phone number'),
			],
			'color' => [
				'hexOrCss' => $this->_('Hex / CSS color'),
				'inherit' => $this->_('Inherit'),
				'opacity' => $this->_('Opacity'),
				'openPicker' => $this->_('Open color picker'),
				'palette' => $this->_('Color swatches'),
				'pickColor' => $this->_('Pick color'),
			],
			'combobox' => [
				'addOption' => $this->_('Search and add option...'),
				'allSelected' => $this->_('All options selected'),
				'customValueHint' => $this->_('Use custom value'),
			],
			'markdown' => [
				'bold' => $this->_('Bold'),
				'chars' => $this->_('chars'),
				'code' => $this->_('Code'),
				'emptyPreview' => $this->_('Nothing to preview yet.'),
				'heading' => $this->_('Heading'),
				'italic' => $this->_('Italic'),
				'link' => $this->_('Link'),
				'list' => $this->_('List'),
				'placeholder' => $this->_('Write Markdown...'),
				'preview' => $this->_('Preview'),
				'quote' => $this->_('Quote'),
				'split' => $this->_('Split'),
				'viewMode' => $this->_('Markdown mode'),
				'words' => $this->_('words'),
				'write' => $this->_('Write'),
			],
			'number' => [
				'decrement' => $this->_('Decrease value'),
				'increment' => $this->_('Increase value'),
				'unit' => $this->_('Unit'),
			],
			'otp' => [
				'digitLabel' => $this->_('Character {position} of {total}'),
				'verificationCode' => $this->_('Verification code'),
			],
			'password' => [
				'confirm' => $this->_('Confirm Password'),
				'confirmPlaceholder' => $this->_('Re-enter password'),
				'generate' => $this->_('Generate password'),
				'hide' => $this->_('Hide password'),
				'lowercase' => $this->_('Lowercase letter (a-z)'),
				'matched' => $this->_('Passwords match.'),
				'minLength' => $this->_('At least {min} characters'),
				'mismatch' => $this->_('Passwords do not match.'),
				'number' => $this->_('Number (0-9)'),
				'reveal' => $this->_('Reveal password'),
				'strength' => $this->_('Strength'),
				'symbol' => $this->_('Symbol (!@#$…)'),
				'uppercase' => $this->_('Uppercase letter (A-Z)'),
			],
			'range' => [
				'maximumLabel' => $this->_('Maximum {label}'),
				'minimumLabel' => $this->_('Minimum {label}'),
				'range' => $this->_('Range'),
			],
			'segmented' => [
				'options' => $this->_('Options'),
			],
			'spacing' => [
				'bottom' => $this->_('Bottom'),
				'left' => $this->_('Left'),
				'linked' => $this->_('Linked'),
				'linkSides' => $this->_('Link all sides'),
				'right' => $this->_('Right'),
				'top' => $this->_('Top'),
				'unlinked' => $this->_('Individual'),
				'unlinkSides' => $this->_('Unlink all sides'),
			],
			'tags' => [
				'addPlaceholder' => $this->_('Type tag and press Enter...'),
				'limitReached' => $this->_('Maximum items reached'),
				'removeTag' => $this->_('Remove {tag}'),
				'selectFromList' => $this->_('Select tag...'),
				'suggestions' => $this->_('Suggested tags'),
			],
			'keyvalue' => [
				'key' => $this->_('Key'),
				'value' => $this->_('Value'),
				'addRow' => $this->_('Add Row'),
				'removeRow' => $this->_('Remove row'),
				'removeRowNamed' => $this->_('Remove {key}'),
				'removeRowIndexed' => $this->_('Remove row {index}'),
				'keyForRow' => $this->_('{label} for row {index}'),
				'valueForRow' => $this->_('{label} for {key}'),
				'valueForRowIndexed' => $this->_('{label} for row {index}'),
				'moveUp' => $this->_('Move row {index} up'),
				'moveDown' => $this->_('Move row {index} down'),
				'duplicateKey' => $this->_('Duplicate key "{key}". Each key must be unique.'),
				'reservedKey' => $this->_('"{key}" is a reserved key name.'),
				'invalidKeyPattern' => $this->_('"{key}" does not match the required key format.'),
				'pairCount' => $this->_('{count} pair(s)'),
				'pairCountMax' => $this->_('{count} / {max}'),
				'emptyPairs' => $this->_('No key-value pairs'),
			],
			'relation' => [
				'selectItem' => $this->_('Select item...'),
				'selectItems' => $this->_('Select items...'),
				'noResults' => $this->_('No matching items found.'),
				'noMatchingPages' => $this->_('No matching pages found.'),
				'noSelectablePages' => $this->_('No selectable pages found.'),
				'loadingOptions' => $this->_('Loading options...'),
				'filterOptions' => $this->_('Filter options...'),
				'filterAvailableItems' => $this->_('Filter available items'),
				'filterAvailablePlaceholder' => $this->_('Filter available...'),
				'filterSelectedItems' => $this->_('Filter selected items'),
				'filterSelectedPlaceholder' => $this->_('Filter selected...'),
				'searchPagesHierarchy' => $this->_('Search pages or browse hierarchy below...'),
				'searchModalPlaceholder' => $this->_('Search by title, slug, ID, or path...'),
				'moveUp' => $this->_('Move up'),
				'moveDown' => $this->_('Move down'),
				'quickCreate' => $this->_('Quick create'),
				'creating' => $this->_('Creating...'),
				'createAndSelect' => $this->_('Create & Select'),
				'titleLabel' => $this->_('Title'),
				'slugLabel' => $this->_('Name / Slug (optional)'),
				'referenceColumn' => $this->_('Reference'),
				'typeStatusColumn' => $this->_('Type / Status'),
				'linkExisting' => $this->_('Link existing'),
				'unlink' => $this->_('Unlink'),
				'unlinkNamed' => $this->_('Unlink {label}'),
			],
			'media' => [
				'dropImages' => $this->_('Click to choose images, paste, or drag and drop'),
				'dropFiles' => $this->_('Click to choose files, paste, or drag and drop'),
				'chooseImage' => $this->_('Choose image'),
				'chooseFile' => $this->_('Choose file'),
				'chooseImages' => $this->_('Choose images'),
				'chooseFiles' => $this->_('Choose files'),
				'dropOrPaste' => $this->_('Drop or paste'),
				'dropToUpload' => $this->_('Drop to upload'),
				'dropToReplace' => $this->_('Drop file to replace'),
				'addImages' => $this->_('Add images'),
				'addFiles' => $this->_('Add files'),
				'replace' => $this->_('Replace'),
				'replacing' => $this->_('Replacing...'),
				'uploading' => $this->_('Uploading {count} item(s)...'),
				'uploadProgress' => $this->_('Uploading {name} ({percent}%)'),
				'uploadFailed' => $this->_('Upload failed.'),
				'maxSizeHint' => $this->_('Max {size}'),
				'maxFilesHint' => $this->_('Up to {count} items'),
				'maxFilesReached' => $this->_('Maximum file limit ({max}) reached.'),
				'singleReplaceLimit' => $this->_('Only one file can be dropped when replacing an item.'),
				'singleLimitHint' => $this->_('Single item'),
				'itemCount' => $this->_('{count} item(s)'),
				'viewGrid' => $this->_('Grid view'),
				'viewTable' => $this->_('Table view'),
				'dragToReorder' => $this->_('Drag or use arrow keys to reorder {name}'),
				'inspectorTitle' => $this->_('Edit Media Details'),
				'inspectorDescription' => $this->_('Configure alt text, multi-language descriptions, tags, focal point, crop, and metadata.'),
				'tabDetails' => $this->_('Details'),
				'tabFocus' => $this->_('Focal Point'),
				'tabStudio' => $this->_('Crop & Transform'),
				'tabCustom' => $this->_('Custom Fields'),
				'altLabelImage' => $this->_('Alt text / description'),
				'altLabelFile' => $this->_('Description'),
				'altPlaceholderImage' => $this->_('Describe this image for screen readers and SEO...'),
				'altPlaceholderFile' => $this->_('Add file description...'),
				'missingAlt' => $this->_('Missing alt'),
				'langProgress' => $this->_('{filled}/{total} langs'),
				'showAllLanguages' => $this->_('All languages'),
				'compactLanguages' => $this->_('Single tab'),
				'tagsLabel' => $this->_('Tags'),
				'tagsPlaceholder' => $this->_('Type a tag and press Enter...'),
				'suggestedTags' => $this->_('Suggested tags'),
				'selectSuggestedTag' => $this->_('Select a tag below...'),
				'inspectorSections' => $this->_('Inspector sections'),
				'initCropSelection' => $this->_('Select crop area'),
				'focusPoint' => $this->_('Focal point'),
				'focusHint' => $this->_('Click anywhere on the image to set the focal point used by smart crops.'),
				'focusPosition' => $this->_('Top {top}% · Left {left}%'),
				'zoomLabel' => $this->_('Zoom'),
				'resetFocus' => $this->_('Center focus'),
				'cropPreviews' => $this->_('Smart crop previews'),
				'cropRatioFree' => $this->_('Free'),
				'cropRatioOriginal' => $this->_('Original'),
				'applyCrop' => $this->_('Apply crop'),
				'clearSelection' => $this->_('Clear selection'),
				'rotateLeft' => $this->_('Rotate -90°'),
				'rotateRight' => $this->_('Rotate +90°'),
				'rotate180' => $this->_('Rotate 180°'),
				'flipHorizontal' => $this->_('Flip horizontal'),
				'flipVertical' => $this->_('Flip vertical'),
				'transforming' => $this->_('Applying image transform...'),
				'studioHint' => $this->_('Drag on the image to select a crop area, or use quick rotate and flip actions.'),
				'dimensions' => $this->_('Dimensions'),
				'fileSize' => $this->_('File size'),
				'extension' => $this->_('Format'),
				'colorPalette' => $this->_('Extracted palette'),
				'analyzeColors' => $this->_('Extract colors'),
				'copiedColor' => $this->_('Copied {hex}'),
				'copyUrl' => $this->_('Copy URL'),
				'copiedUrl' => $this->_('URL copied'),
				'openOriginal' => $this->_('Open original'),
				'downloadOriginal' => $this->_('Download'),
				'moreActions' => $this->_('More actions'),
				'cancelUpload' => $this->_('Cancel upload'),
				'cropMoveHandle' => $this->_('Crop selection. Drag to move, or use arrow keys to nudge.'),
				'cropMovedStatus' => $this->_('Crop selection updated'),
				'pendingUpload' => $this->_('Pending save'),
				'markedForDeletion' => $this->_('Marked for deletion'),
				'undoDelete' => $this->_('Undo'),
				'removeFile' => $this->_('Remove {name}'),
				'editAsset' => $this->_('Inspect & edit {name}'),
				'previousAsset' => $this->_('Previous item'),
				'nextAsset' => $this->_('Next item'),
				'tablePreview' => $this->_('File'),
				'tableMetadata' => $this->_('Alt / Description'),
				'tableTags' => $this->_('Tags'),
				'tableSize' => $this->_('Info'),
				'imageUploadLocked' => $this->_('Image upload is locked.'),
				'fileUploadLocked' => $this->_('File upload is locked.'),
			],
			'link' => [
				'typeLabel' => $this->_('Link type'),
				'chooseImage' => $this->_('Choose image'),
				'chooseVideo' => $this->_('Choose video'),
				'chooseFile' => $this->_('Choose file'),
				'dropHint' => $this->_('Drop'),
				'uploadProgress' => $this->_('Upload progress'),
				'cancelUpload' => $this->_('Cancel upload'),
				'openMedia' => $this->_('Open {name}'),
				'replaceMedia' => $this->_('Replace {name}'),
				'replaceFile' => $this->_('Replace file'),
				'clearMedia' => $this->_('Remove {name}'),
				'removeFile' => $this->_('Remove file'),
				'clearTarget' => $this->_('Clear selected target'),
				'searchTarget' => $this->_('Search target'),
				'searchPages' => $this->_('Search pages'),
				'cancelSearch' => $this->_('Cancel search'),
				'emailTarget' => $this->_('Email address'),
				'phoneTarget' => $this->_('Phone number'),
				'urlTarget' => $this->_('Link URL or #anchor'),
				'clearUrl' => $this->_('Clear link target'),
				'labelInput' => $this->_('Link label'),
				'labelPlaceholder' => $this->_('Link label (optional)'),
				'ariaLabelAttribute' => $this->_('ARIA Label'),
				'ariaLabelPlaceholder' => $this->_('Screen reader label (optional)'),
				'optionsButton' => $this->_('Link options'),
				'searching' => $this->_('Searching...'),
				'noResults' => $this->_('No matching items found.'),
				'optionsHeading' => $this->_('Link Options'),
				'closeOptions' => $this->_('Close link options'),
				'openTarget' => $this->_('Open Target'),
				'targetSelf' => $this->_('Same tab (_self)'),
				'targetBlank' => $this->_('New tab (_blank)'),
				'anchorFragment' => $this->_('Anchor Fragment (#)'),
				'queryParams' => $this->_('Query Parameters (?)'),
				'relAttribute' => $this->_('Rel Attribute'),
				'invalidPhone' => $this->_('Phone number may only contain digits (0-9) and an optional leading + sign.'),
				'invalidEmail' => $this->_('Enter a valid email address.'),
				'unsafeUrl' => $this->_('Unsafe URL protocol is not allowed.'),
				'mediaUnavailable' => $this->_('Media upload context is not available for this field.'),
				'invalidMedia' => $this->_('Selected file is not supported.'),
				'uploadFailed' => $this->_('Failed to upload file.'),
				'editMedia' => $this->_('Edit media details & alt text for {name}'),
				'editMediaDetails' => $this->_('Edit media details, alt text & focal point'),
				'newTabBadge' => $this->_('New tab'),
			],
			'icon' => [
				'selected' => $this->_('Selected icon'),
				'selectPlaceholder' => $this->_('Select an icon...'),
				'customize' => $this->_('Customize'),
				'clear' => $this->_('Clear icon'),
				'resetStyle' => $this->_('Reset Style'),
				'size' => $this->_('Size (px)'),
				'strokeWidth' => $this->_('Stroke Width'),
				'color' => $this->_('Icon Color'),
				'colorAuto' => $this->_('Auto (currentColor)'),
				'customColor' => $this->_('Custom icon hex color'),
				'background' => $this->_('Badge Background & Shape'),
				'bgNone' => $this->_('No background'),
				'customBg' => $this->_('Custom badge hex color'),
				'pickerTitle' => $this->_('Icons'),
				'tabIcons' => $this->_('Icons'),
				'tabAppearance' => $this->_('Appearance'),
				'searchPlaceholder' => $this->_('Search icons...'),
				'searchCountPlaceholder' => $this->_('Search {count} icons'),
				'categoryFilter' => $this->_('Category'),
				'allCategories' => $this->_('All categories'),
				'styleFilter' => $this->_('Style'),
				'styleAll' => $this->_('All styles'),
				'styleOutline' => $this->_('Outline'),
				'styleFilled' => $this->_('Filled'),
				'popular' => $this->_('Popular'),
				'allIcons' => $this->_('All icons'),
				'noMatches' => $this->_('No matching icons found.'),
				'countSingular' => $this->_('icon'),
				'countPlural' => $this->_('icons'),
			],
			'grid' => [
				'dataGridRegion' => $this->_('Data grid'),
				'resizeColumn' => $this->_('Resize column'),
				'selectRow' => $this->_('Select row'),
			],
			'calendar' => [
				'selectDate' => $this->_('Select date'),
				'clearDate' => $this->_('Clear date'),
				'selectDateRange' => $this->_('Select date range'),
				'clearDateRange' => $this->_('Clear date range'),
				'selectTime' => $this->_('Select time'),
				'clearTime' => $this->_('Clear time'),
				'selectDateTime' => $this->_('Select date & time'),
				'clearDateTime' => $this->_('Clear date & time'),
				'pickStartAndEnd' => $this->_('Pick start and end date'),
				'rangeDays' => $this->_('{count} days'),
				'hourShort' => $this->_('Hr'),
				'minuteShort' => $this->_('Min'),
				'secondShort' => $this->_('Sec'),
				'periodShort' => $this->_('AM/PM'),
			],
			'dnd' => [
				'pickedUp' => $this->_('Picked up {label}'),
				'dragCancelled' => $this->_('Drag cancelled'),
				'movedToPosition' => $this->_('Moved {label} to position {position} of {total}'),
				'movedToPositionShort' => $this->_('Moved {label} to position {position}'),
				'movedToLevel' => $this->_('Moved {label} to level {level}'),
				'movedToPositionAndLevel' => $this->_('Moved {label} to position {position}, level {level}'),
			],
			'shortcuts' => [
				'title' => $this->_('Keyboard Shortcuts'),
				'subtitle' => $this->_('Available keyboard shortcuts for navigation, lists, and forms.'),
				'openHelp' => $this->_('Show keyboard shortcuts'),
				'groupGeneral' => $this->_('General'),
				'groupNavigation' => $this->_('Navigation'),
				'groupForms' => $this->_('Forms'),
				'groupViewport' => $this->_('Lists & Viewports'),
				'groupModule' => $this->_('Current Workspace'),
				'quickJump' => $this->_('Open Quick Switcher'),
				'showHelp' => $this->_('Show keyboard shortcuts'),
				'goWorkspace' => $this->_('Go to Workspace Dashboard'),
				'goAdmin' => $this->_('Return to Admin Panel'),
				'switchSection' => $this->_('Switch to section tab 1-9'),
				'saveForm' => $this->_('Save form'),
				'saveAndExit' => $this->_('Save & exit form'),
				'backToList' => $this->_('Go back'),
				'focusSearch' => $this->_('Focus search input'),
				'newRecord' => $this->_('Create new item'),
				'refreshView' => $this->_('Refresh view'),
				'closeDialog' => $this->_('Close dialog or menu'),
				'noActiveShortcuts' => $this->_('No shortcuts registered on this view.'),
				'pressHint' => $this->_('Press ? anytime to toggle this help dialog.'),
			],
			'conditionBuilder' => [
				'regionLabel' => $this->_('Condition builder'),
				'rootMatchLabel' => $this->_('Match groups'),
				'matchAll' => $this->_('All (AND)'),
				'matchAny' => $this->_('Any (OR)'),
				'groupSingular' => $this->_('group'),
				'groupPlural' => $this->_('groups'),
				'ruleSingular' => $this->_('rule'),
				'rulePlural' => $this->_('rules'),
				'addGroup' => $this->_('Add group'),
				'noFieldsConfigured' => $this->_('No condition fields configured.'),
				'emptyGroups' => $this->_('No condition groups configured yet. Add a group to constrain when this applies.'),
				'groupLegend' => $this->_('Condition group {index}'),
				'groupTitle' => $this->_('Group #{index}'),
				'groupMatchLabel' => $this->_('Match rules'),
				'addRule' => $this->_('Add rule'),
				'removeGroupAria' => $this->_('Remove condition group {index}'),
				'emptyGroupRules' => $this->_('No rules in this group yet.'),
				'fieldLabel' => $this->_('Field'),
				'operatorLabel' => $this->_('Operator'),
				'valueLabel' => $this->_('Value'),
				'removeRuleAria' => $this->_('Remove rule {rule} in group {group}'),
				'noValueNeeded' => $this->_('No comparison value required'),
				'noValueNeededShort' => $this->_('No value needed'),
				'rangeMinAria' => $this->_('{field} minimum'),
				'rangeMaxAria' => $this->_('{field} maximum'),
				'minPlaceholder' => $this->_('Min'),
				'maxPlaceholder' => $this->_('Max'),
				'removeValueOption' => $this->_('Remove {label}'),
				'addValueOptionAria' => $this->_('{field} add value'),
				'selectOptionAdd' => $this->_('Select value to add...'),
				'allOptionsSelected' => $this->_('All options selected'),
				'commaValuesAria' => $this->_('{field} comma-separated values'),
				'commaPlaceholder' => $this->_('val1, val2, ...'),
				'booleanValueAria' => $this->_('{field} boolean value'),
				'trueLabel' => $this->_('True'),
				'falseLabel' => $this->_('False'),
				'valueAria' => $this->_('{field} value'),
				'numericValueAria' => $this->_('{field} numeric value'),
				'dateValueAria' => $this->_('{field} date value'),
				'valuePlaceholder' => $this->_('Enter value...'),
				'valueSourceMode' => $this->_('Comparison source'),
				'sourceManual' => $this->_('Value'),
				'sourceField' => $this->_('Field'),
				'compareFieldAria' => $this->_('Target comparison field for {field}'),
				'selectCompareField' => $this->_('Select field...'),
				'fieldKeyPlaceholder' => $this->_('field_key'),
				'searchFieldPlaceholder' => $this->_('Search fields...'),
				'noMatchingFields' => $this->_('No matching fields'),
				'selectFieldPlaceholder' => $this->_('Select field...'),
				'selectValuePlaceholder' => $this->_('Select...'),
				'numberPlaceholder' => $this->_('0'),
				'clearAll' => $this->_('Clear all'),
				'summaryIf' => $this->_('IF'),
				'summaryAnd' => $this->_('AND'),
				'summaryOr' => $this->_('OR'),
				'summaryNot' => $this->_('NOT'),
				'connectorAnd' => $this->_('AND'),
				'connectorOr' => $this->_('OR'),
				'notBadge' => $this->_('NOT'),
				'negateGroupAria' => $this->_('Negate group {index}'),
				'moveGroupUpAria' => $this->_('Move group {index} up'),
				'moveGroupDownAria' => $this->_('Move group {index} down'),
				'duplicateGroupAria' => $this->_('Duplicate group {index}'),
				'duplicateRuleAria' => $this->_('Duplicate rule {index}'),
				'modeVisual' => $this->_('Visual'),
				'modeExpression' => $this->_('Expression'),
				'modeAriaLabel' => $this->_('Condition editor mode'),
				'expressionLabel' => $this->_('Condition expression'),
				'expressionPlaceholder' => $this->_('status=active, subtotal>=100; tier=vip|gold'),
				'expressionHint' => $this->_('Separate AND clauses with commas (,) and OR branches with semicolons (;).'),
				'expressionInvalid' => $this->_('Invalid condition expression syntax.'),
				'expressionUnsupported' => $this->_('Some advanced rules (such as NOT groups, ranges, or OR inside ALL) cannot be represented in flat expression syntax. Applying a new expression will overwrite them.'),
				'applyExpression' => $this->_('Apply expression'),
				'customValueOption' => $this->_('Custom value...'),
				'customValuePlaceholder' => $this->_('Enter custom value...'),
				'backToOptions' => $this->_('Choose from list'),
				'addCustomValue' => $this->_('Add custom value'),
				'type' => [
					'text' => $this->_('Text'),
					'number' => $this->_('Number'),
					'select' => $this->_('Select'),
					'boolean' => $this->_('Boolean'),
					'country' => $this->_('Country'),
					'currency' => $this->_('Currency'),
					'date' => $this->_('Date'),
				],
				'op' => [
					'eq' => $this->_('Equals'),
					'neq' => $this->_('Does not equal'),
					'contains' => $this->_('Contains'),
					'notContains' => $this->_('Does not contain'),
					'startsWith' => $this->_('Starts with'),
					'endsWith' => $this->_('Ends with'),
					'gt' => $this->_('Greater than'),
					'gte' => $this->_('Greater than or equal'),
					'lt' => $this->_('Less than'),
					'lte' => $this->_('Less than or equal'),
					'between' => $this->_('Between'),
					'in' => $this->_('Is one of'),
					'notIn' => $this->_('Is not one of'),
					'before' => $this->_('Before'),
					'onOrBefore' => $this->_('On or before'),
					'after' => $this->_('After'),
					'onOrAfter' => $this->_('On or after'),
					'isTrue' => $this->_('Is true'),
					'isFalse' => $this->_('Is false'),
					'isEmpty' => $this->_('Is empty'),
					'isNotEmpty' => $this->_('Is not empty'),
				],
			],
		];
	}

	/**
	 * Resolve the active user locale code (`'en'` for default/unconfigured language).
	 */
	public function resolveActiveLocale(): string
	{
		$user = $this->wire()->user;
		if (isset($user->language) && $user->language instanceof Page && $user->language->id) {
			$langName = trim((string) $user->language->name);
			if ($langName !== '' && $langName !== 'default') {
				return $langName;
			}
		}

		return 'en';
	}

	/**
	 * Resolve a safe, dot-free translation namespace key for a module or component object.
	 */
	public function resolveTranslationNamespace(object $source): string
	{
		if ($source === $this->react) {
			return 'core';
		}

		if (method_exists($source, 'translationNamespace')) {
			$raw = trim((string) $source->translationNamespace());
			if ($raw !== '' && !str_contains($raw, '@anonymous')) {
				return (string) preg_replace('/[^A-Za-z0-9_-]/', '_', $raw);
			}
		}

		$class = $source::class;
		if (str_contains($class, '@anonymous')) {
			$ref = new \ReflectionClass($source);
			$parent = $ref->getParentClass();
			$base = $parent !== false ? $parent->getShortName() : 'Module';

			return $base . '_Anonymous';
		}

		if ($source instanceof Wire) {
			$className = trim($source->className());
			if ($className !== '' && !str_contains($className, '@anonymous')) {
				return (string) preg_replace('/[^A-Za-z0-9_-]/', '_', $className);
			}
		}

		$short = ($pos = strrpos($class, '\\')) !== false ? substr($class, $pos + 1) : $class;

		return (string) preg_replace('/[^A-Za-z0-9_-]/', '_', $short);
	}

	/**
	 * Resolve and flatten static UI translations contributed by `$source` (`translations()` / `___translations()`).
	 *
	 * @return array<string, string>
	 */
	public function resolveModuleTranslations(object $source): array
	{
		if (!method_exists($source, 'translations') && !method_exists($source, '___translations')) {
			return [];
		}

		$raw = is_callable([$source, 'translations']) ? $source->translations() : [];
		if (!is_array($raw) || $raw === []) {
			return [];
		}

		return self::flattenTranslationCatalog($raw);
	}

	/**
	 * Flatten nested associative translation maps into dot-notation string keys.
	 *
	 * @param array<int|string, mixed> $entries
	 * @return array<string, string>
	 */
	public static function flattenTranslationCatalog(array $entries, string $prefix = ''): array
	{
		$flat = [];
		foreach ($entries as $key => $value) {
			if (!is_string($key)) {
				continue;
			}
			$cleanKey = trim($key);
			if ($cleanKey === '') {
				continue;
			}
			$fullKey = $prefix === '' ? $cleanKey : ($prefix . '.' . $cleanKey);
			if (is_array($value) && !array_is_list($value)) {
				foreach (self::flattenTranslationCatalog($value, $fullKey) as $nestedKey => $nestedVal) {
					$flat[$nestedKey] = $nestedVal;
				}
			} elseif (is_string($value) || is_int($value) || is_float($value)) {
				$flat[$fullKey] = html_entity_decode((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
			}
		}

		return $flat;
	}

	/**
	 * Build shared Inertia `OnceProp` (and classic island `$config->js('InertiaShared')`) translation props.
	 *
	 * @return array<string, mixed>
	 */
	public function buildInertiaI18nSharedProps(?object $host = null): array
	{
		$locale = $this->resolveActiveLocale();
		$inertia = $this->react->inertia();

		$shared = [
			'i18nLocale' => fn(): string => $this->resolveActiveLocale(),
			'i18n.core' => $inertia->once(fn(): array => $this->resolveModuleTranslations($this->react))
				->as("rw_i18n:{$locale}:core"),
		];

		$modules = $this->wire()->modules;
		if ($host instanceof Process && $modules->isInstalled('InputfieldTiptap')) {
			$shared['i18n.InputfieldTiptap'] = $inertia->once(function () use ($modules): array {
				$tiptap = $modules->getModule('InputfieldTiptap', ['noPermissionCheck' => true]);

				return is_object($tiptap) ? $this->resolveModuleTranslations($tiptap) : [];
			})->as("rw_i18n:{$locale}:InputfieldTiptap");
		}

		if ($host !== null && $host !== $this->react) {
			$ns = $this->resolveTranslationNamespace($host);
			if ($ns !== '' && $ns !== 'core') {
				$shared['i18n.' . $ns] = $inertia->once(fn(): array => $this->resolveModuleTranslations($host))
					->as("rw_i18n:{$locale}:{$ns}");
			}
		}

		return $shared;
	}
}
