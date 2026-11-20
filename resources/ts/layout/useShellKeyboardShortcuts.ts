import { useMemo } from 'react';
import { isInertiaAppActive, safeRouter as router } from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { sanitizeHref } from '../lib/utils';
import { useKeyboardShortcuts } from '../hooks';
import type { AppShellNavItem, AppShellRecordHeaderProps, WorkspaceSharedContext } from './types';

export interface UseShellKeyboardShortcutsOptions {
	enableShortcuts: boolean;
	commandOpen: boolean;
	shortcutsOpen: boolean;
	moreMenuOpen: boolean;
	showGlobalWorkspaceBar: boolean;
	workspace?: WorkspaceSharedContext;
	resolvedNavItems: AppShellNavItem[];
	recordHeaderSpec: AppShellRecordHeaderProps | null;
	onToggleCommandPalette: () => void;
	onToggleShortcutsDialog: () => void;
	onCloseMoreMenu: () => void;
}

function navigateDestination(rawHref: string | undefined, isInertiaNav = false): void {
	const safeHref = sanitizeHref(rawHref);
	if (!safeHref) {
		return;
	}
	if (isInertiaNav && isInertiaAppActive()) {
		router.visit(safeHref);
	} else if (typeof window !== 'undefined') {
		window.location.href = safeHref;
	}
}

/**
 * Registers global workspace navigation, command palette, help dialog, and section tab shortcuts.
 */
export function useShellKeyboardShortcuts({
	enableShortcuts,
	commandOpen,
	shortcutsOpen,
	moreMenuOpen,
	showGlobalWorkspaceBar,
	workspace,
	resolvedNavItems,
	recordHeaderSpec,
	onToggleCommandPalette,
	onToggleShortcutsDialog,
	onCloseMoreMenu,
}: UseShellKeyboardShortcutsOptions): void {
	const safeLauncherHref = sanitizeHref(workspace?.launcherUrl);
	const safeAdminHref = sanitizeHref(workspace?.adminUrl);

	const sectionShortcutBindings = useMemo(() => {
		if (!enableShortcuts || resolvedNavItems.length === 0) {
			return [];
		}
		return resolvedNavItems.slice(0, 9).map((navItem, idx) => ({
			id: `shell-section-${idx + 1}`,
			keys: `alt+${idx + 1}`,
			label: `${t('shortcuts.switchSection', 'Switch to section tab 1-9')} (${idx + 1}: ${navItem.label})`,
			group: 'navigation' as const,
			handler: () => {
				if (navItem.onClick) {
					navItem.onClick();
					return;
				}
				navigateDestination(navItem.href, true);
			},
		}));
	}, [enableShortcuts, resolvedNavItems]);

	useKeyboardShortcuts([
		{
			id: 'shell-quick-jump',
			keys: 'mod+k',
			label: t('shortcuts.quickJump', 'Open Quick Switcher'),
			group: 'general',
			when: enableShortcuts,
			allowInInputs: true,
			allowInDialogs: commandOpen,
			handler: onToggleCommandPalette,
		},
		{
			id: 'shell-shortcuts-help',
			keys: ['?', 'mod+/'],
			label: t('shortcuts.showHelp', 'Show keyboard shortcuts'),
			group: 'general',
			when: enableShortcuts,
			allowInDialogs: shortcutsOpen,
			handler: onToggleShortcutsDialog,
		},
		{
			id: 'shell-close-more-menu',
			keys: 'escape',
			label: t('shortcuts.closeDialog', 'Close dialog or menu'),
			group: 'general',
			when: enableShortcuts && moreMenuOpen,
			allowInInputs: true,
			preventDefault: false,
			handler: onCloseMoreMenu,
		},
		{
			id: 'shell-go-workspace',
			keys: 'g w',
			label: t('shortcuts.goWorkspace', 'Go to Workspace Dashboard'),
			group: 'navigation',
			when: enableShortcuts && Boolean(safeLauncherHref),
			handler: () => navigateDestination(safeLauncherHref, showGlobalWorkspaceBar),
		},
		{
			id: 'shell-go-admin',
			keys: 'g a',
			label: t('shortcuts.goAdmin', 'Return to Admin Panel'),
			group: 'navigation',
			when: enableShortcuts && showGlobalWorkspaceBar && Boolean(safeAdminHref),
			handler: () => navigateDestination(safeAdminHref, false),
		},
		{
			id: 'shell-record-back',
			keys: 'alt+arrowleft',
			label: t('shortcuts.backToList', 'Go back'),
			group: 'navigation',
			when:
				enableShortcuts &&
				Boolean(recordHeaderSpec && (recordHeaderSpec.onBack || sanitizeHref(recordHeaderSpec.backHref))),
			handler: () => {
				if (recordHeaderSpec?.onBack) {
					recordHeaderSpec.onBack();
					return;
				}
				navigateDestination(recordHeaderSpec?.backHref, true);
			},
		},
		...sectionShortcutBindings,
	]);
}
