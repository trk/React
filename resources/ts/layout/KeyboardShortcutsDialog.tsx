import React, { useMemo } from 'react';
import { formatShortcutKeys, useRegisteredKeyboardShortcuts, type KeyboardShortcutGroup, type RegisteredKeyboardShortcut } from '../hooks';
import { t } from '../lib/i18n';
import { Dialog } from '../ui';

export interface KeyboardShortcutsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const GROUP_ORDER: KeyboardShortcutGroup[] = ['general', 'navigation', 'viewport', 'forms', 'module'];

function resolveGroupTitle(group: KeyboardShortcutGroup): string {
	switch (group) {
		case 'general':
			return t('shortcuts.groupGeneral', 'General');
		case 'navigation':
			return t('shortcuts.groupNavigation', 'Navigation');
		case 'viewport':
			return t('shortcuts.groupViewport', 'Lists & Viewports');
		case 'forms':
			return t('shortcuts.groupForms', 'Forms');
		case 'module':
		default:
			return t('shortcuts.groupModule', 'Current Workspace');
	}
}

export function KeyboardShortcutsDialog({
	open,
	onOpenChange,
}: KeyboardShortcutsDialogProps): React.ReactElement | null {
	const shortcuts = useRegisteredKeyboardShortcuts();

	const grouped = useMemo(() => {
		const map = new Map<KeyboardShortcutGroup, RegisteredKeyboardShortcut[]>();
		for (const group of GROUP_ORDER) {
			map.set(group, []);
		}
		for (const entry of shortcuts) {
			const bucket = map.get(entry.group) ?? map.get('module');
			bucket?.push(entry);
		}
		return GROUP_ORDER.map((group) => ({
			group,
			title: resolveGroupTitle(group),
			items: map.get(group) ?? [],
		})).filter((section) => section.items.length > 0);
	}, [shortcuts]);

	return (
		<div data-rw-shortcuts-host="">
			<Dialog
				open={open}
				onOpenChange={onOpenChange}
				icon="keyboard"
				title={t('shortcuts.title', 'Keyboard Shortcuts')}
				description={t('shortcuts.subtitle', 'Available keyboard shortcuts for navigation, lists, and forms.')}
				maxWidth="max-w-xl"
			>
				<div data-rw-shortcuts-dialog="" className="space-y-4">
					{grouped.length === 0 ? (
						<p className="py-4 text-center text-xs text-muted-foreground">
							{t('shortcuts.noActiveShortcuts', 'No shortcuts registered on this view.')}
						</p>
					) : (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							{grouped.map((section) => (
								<div key={section.group} className="space-y-2 rounded-lg border border-border bg-muted/25 p-3">
									<div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										{section.title}
									</div>
									<ul className="divide-y divide-border/50">
										{section.items.map((item) => (
											<li key={item.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
												<span className="min-w-0 truncate text-foreground">{item.label}</span>
												<span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
													{item.keys.map((spec, specIdx) => (
														<React.Fragment key={`${item.id}-${spec}`}>
															{specIdx > 0 ? (
																<span className="text-[10px] text-muted-foreground">/</span>
															) : null}
															<span className="inline-flex items-center gap-0.5">
																{formatShortcutKeys(spec).map((cap, capIdx) =>
																	cap === 'then' ? (
																		<span key={capIdx} className="px-0.5 text-[10px] text-muted-foreground">
																			→
																		</span>
																	) : (
																		<kbd
																			key={capIdx}
																			className="inline-flex min-w-5 items-center justify-center rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground shadow-2xs"
																		>
																			{cap}
																		</kbd>
																	)
																)}
															</span>
														</React.Fragment>
													))}
												</span>
											</li>
										))}
									</ul>
								</div>
							))}
						</div>
					)}
					<p className="border-t border-border pt-2.5 text-[11px] text-muted-foreground">
						{t('shortcuts.pressHint', 'Press ? anytime to toggle this help dialog.')}
					</p>
				</div>
			</Dialog>
		</div>
	);
}
