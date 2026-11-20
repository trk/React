import { t } from '../../lib/i18n';
import { sanitizeHref } from '../../lib/utils';
import type { DropdownMenuItem } from '../primitives/DropdownMenu';

export interface ViewportActionDescriptor {
	key: string;
	label: string;
	icon?: string;
	variant?: string;
	tone?: string;
	href?: string;
	confirm?: string;
}

export function buildViewportActionItems(
	record: Record<string, unknown>,
	actions: ViewportActionDescriptor[],
	state: { quickEditEnabled?: boolean; locked?: boolean },
	dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void> | void,
	onConfirmAction?: (act: ViewportActionDescriptor, recordId: string, recordLabel: string) => void
): DropdownMenuItem[] {
	const recordId = String(record.id ?? '');
	const recordLabel = String(record.title || record.label || record.name || recordId);
	const standardItems: DropdownMenuItem[] = [];
	const dangerItems: DropdownMenuItem[] = [];
	const editUrl = typeof record._editUrl === 'string' ? sanitizeHref(record._editUrl) : '';

	if (editUrl && !actions.some((act) => act.key === 'edit' || sanitizeHref(act.href) === editUrl)) {
		standardItems.push({
			key: 'edit',
			label: t('common.edit', 'Edit'),
			icon: 'pencil',
			href: editUrl,
		});
	}

	if (state.quickEditEnabled && !state.locked && recordId) {
		standardItems.push({
			key: 'quick_edit',
			label: t('viewport.quickEdit', 'Quick Edit'),
			icon: 'sliders-horizontal',
			onSelect: () => {
				void dispatch('open_quick_edit', { id: recordId });
			},
		});
	}

	for (const act of actions) {
		const isDanger = act.variant === 'danger' || act.tone === 'danger';
		const safeActHref = act.href ? sanitizeHref(act.href) : '';
		if (act.href && !safeActHref) {
			continue;
		}
		const menuItem: DropdownMenuItem = safeActHref
			? {
					key: act.key,
					label: act.label,
					icon: act.icon,
					variant: isDanger ? 'danger' : 'default',
					href: safeActHref,
				}
			: {
					key: act.key,
					label: act.label,
					icon: act.icon,
					variant: isDanger ? 'danger' : 'default',
					onSelect: () => {
						if (act.confirm) {
							if (onConfirmAction) {
								onConfirmAction(act, recordId, recordLabel);
								return;
							}
							if (!window.confirm(act.confirm)) {
								return;
							}
						}
						void dispatch('row_action', { rowAction: act.key, id: recordId });
					},
				};

		if (isDanger) {
			dangerItems.push(menuItem);
		} else {
			standardItems.push(menuItem);
		}
	}

	return [...standardItems, ...dangerItems];
}
