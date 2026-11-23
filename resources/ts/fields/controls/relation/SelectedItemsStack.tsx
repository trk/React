import { DynamicIcon } from '../../../lib/utils';
import { Badge, SortableHandle, type useSortableList } from '../../../ui';
import type { RelationItemData } from '../../types';
import { QuickEditButton, RelationItemVisual } from './typesAndHelpers';

export function SelectedItemsStack({
	cardinality,
	values,
	disabled,
	editableLink,
	fallbackIcon,
	isSortable,
	sortable,
	resolveItem,
	onRemove,
}: {
	cardinality: string;
	values: string[];
	disabled: boolean;
	editableLink: boolean;
	fallbackIcon: string;
	isSortable: boolean;
	sortable: ReturnType<typeof useSortableList<string>>;
	resolveItem: (tok: string) => RelationItemData;
	onRemove: (tok: string) => void;
}) {
	if (values.length === 0) {
		return null;
	}
	return (
		<div
			data-rw-field-slot="selected"
			{...(isSortable ? sortable.getContainerProps() : {})}
			className="divide-y divide-border overflow-hidden rounded-md border border-border bg-muted/15"
		>
			{values.map((tok, idx) => {
				const item = resolveItem(tok);
				const showItemBadge = Boolean(
					item.badge &&
						!(
							cardinality === 'm2a' &&
							item.badge.trim().toLowerCase() ===
								String(item.resourceLabel || item.resource || '')
									.trim()
									.toLowerCase()
						)
				);
				return (
					<div
						key={tok}
						{...(isSortable ? sortable.getItemProps(tok) : {})}
						className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/35"
					>
						<div className="flex min-w-0 flex-1 items-center gap-2">
							{isSortable && !disabled && values.length > 1 ? (
								<SortableHandle size="xs" {...sortable.getHandleProps(tok, idx)} />
							) : null}
							<RelationItemVisual item={item} fallbackIcon={fallbackIcon} size="sm" />
							{cardinality === 'm2a' ? (
								<Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase shrink-0">
									{item.resourceLabel || item.resource}
								</Badge>
							) : null}
							<div className="min-w-0 flex-1 truncate">
								<span className="font-medium text-foreground">{item.label}</span>
								{item.subtitle ? (
									<span className="hidden @md/rw-rel:inline ml-2 font-mono text-[11px] text-muted-foreground">
										{item.subtitle}
									</span>
								) : null}
							</div>
							{showItemBadge ? (
								<Badge variant="secondary" className="hidden @sm/rw-rel:inline-flex px-1.5 py-0 text-[10px] font-normal shrink-0">
									{item.badge}
								</Badge>
							) : null}
							{item.status === 'unpublished' ? (
								<Badge variant="outline" className="px-1.5 py-0 text-[10px] text-warning shrink-0">
									Unpub
								</Badge>
							) : null}
						</div>
						<div className="inline-flex items-center gap-1 shrink-0">
							<QuickEditButton item={item} enabled={editableLink} />
							{!disabled ? (
								<button
									type="button"
									onClick={() => onRemove(tok)}
									title={`Remove ${item.label}`}
									aria-label={`Remove ${item.label}`}
									className="rounded p-1 text-muted-foreground hover:bg-destructive/12 hover:text-destructive cursor-pointer"
								>
									<DynamicIcon name="x" className="size-3.5" />
								</button>
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
}
