import { useMemo, useState } from 'react';
import { t } from '../../../lib/i18n';
import { DynamicIcon } from '../../../lib/utils';
import type { RelationItemData } from '../../types';
import {
	isRelationItemDisabled,
	QuickEditButton,
	RelationItemVisual,
	resolveRelationItemKey,
} from './typesAndHelpers';

export function TransferRelationWidget({
	options,
	loading,
	selectedValues,
	maxItems,
	disabled,
	editableLink,
	fallbackIcon,
	resolveItem,
	onChange,
}: {
	options: RelationItemData[];
	loading: boolean;
	selectedValues: string[];
	maxItems: number;
	disabled: boolean;
	editableLink: boolean;
	fallbackIcon: string;
	resolveItem: (tok: string) => RelationItemData;
	onChange: (next: string[], items?: RelationItemData[]) => void;
}) {
	const [leftFilter, setLeftFilter] = useState('');
	const [rightFilter, setRightFilter] = useState('');

	const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

	const available = useMemo(() => {
		const q = leftFilter.trim().toLowerCase();
		return options.filter((o) => {
			if (selectedSet.has(String(o.value))) return false;
			if (!q) return true;
			return o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q);
		});
	}, [options, selectedSet, leftFilter]);

	const chosen = useMemo(() => {
		const q = rightFilter.trim().toLowerCase();
		return selectedValues
			.map((tok) => ({ tok, item: resolveItem(tok) }))
			.filter(({ tok, item }) => !q || item.label.toLowerCase().includes(q) || tok.toLowerCase().includes(q));
	}, [selectedValues, rightFilter, resolveItem]);

	const moveItem = (idx: number, dir: -1 | 1) => {
		const target = idx + dir;
		if (target < 0 || target >= selectedValues.length) return;
		const copy = [...selectedValues];
		const [moved] = copy.splice(idx, 1);
		if (moved === undefined) return;
		copy.splice(target, 0, moved);
		onChange(copy);
	};

	return (
		<div className="@container/rw-rel min-w-0">
			<div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-md border border-border @lg/rw-rel:grid-cols-2 @lg/rw-rel:divide-x @lg/rw-rel:divide-y-0">
			<div className="flex flex-col">
				<div className="flex items-center justify-between border-b border-border/70 bg-muted/25 px-2.5 py-1.5 text-xs font-semibold text-foreground">
					<span>{t('relation.availableCount', { count: available.length }, 'Available ({count})')}</span>
					{!disabled && available.length > 0 && maxItems === 0 ? (
						<button
							type="button"
								onClick={() =>
								onChange(
									[...selectedValues, ...available.filter((a) => !isRelationItemDisabled(a)).map((a) => String(a.value))],
									available
								)
							}
							className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
						>
							{t('relation.addAll', 'Add all')} &rarr;
						</button>
					) : null}
				</div>
				<div className="flex items-center gap-1.5 border-b border-border/60 bg-background/60 px-2.5 py-1 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring">
					<DynamicIcon name="search" className="size-3.5 shrink-0 text-muted-foreground" />
					<input
						type="search"
						value={leftFilter}
						onChange={(e) => setLeftFilter(e.target.value)}
						aria-label={t('relation.filterAvailableItems', 'Filter available items')}
						placeholder={t('relation.filterAvailablePlaceholder', 'Filter available...')}
						data-rw-bare-input=""
						className="h-6 w-full border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
					/>
				</div>
				<div className="h-52 divide-y divide-border/50 overflow-y-auto">
					{loading && options.length === 0 ? (
						<p className="p-2.5 text-xs text-muted-foreground">{t('common.loading', 'Loading...')}</p>
					) : null}
					{available.map((opt) => {
						const tok = String(opt.value);
						const atLimit = maxItems > 0 && selectedValues.length >= maxItems;
						return (
							<button
								key={resolveRelationItemKey(opt)}
								type="button"
								disabled={disabled || isRelationItemDisabled(opt) || atLimit}
								onClick={() => onChange([...selectedValues, tok], [opt])}
								className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/50 disabled:opacity-50 cursor-pointer"
							>
								<div className="flex items-center gap-2 min-w-0">
									<RelationItemVisual item={opt} fallbackIcon={fallbackIcon} size="xs" />
									<span className="truncate">{opt.label}</span>
								</div>
								<DynamicIcon name="chevron-right" className="size-3.5 text-muted-foreground shrink-0" />
							</button>
						);
					})}
				</div>
			</div>

			<div className="flex flex-col">
				<div className="flex items-center justify-between border-b border-border/70 bg-muted/25 px-2.5 py-1.5 text-xs font-semibold text-foreground">
					<span>{t('relation.selectedCount', { count: selectedValues.length }, 'Selected ({count})')}</span>
					{!disabled && selectedValues.length > 0 ? (
						<button
							type="button"
							onClick={() => onChange([])}
							className="text-[11px] font-medium text-destructive hover:underline cursor-pointer"
						>
							{t('common.clearAll', 'Clear all')}
						</button>
					) : null}
				</div>
				<div className="flex items-center gap-1.5 border-b border-border/60 bg-background/60 px-2.5 py-1 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring">
					<DynamicIcon name="search" className="size-3.5 shrink-0 text-muted-foreground" />
					<input
						type="search"
						value={rightFilter}
						onChange={(e) => setRightFilter(e.target.value)}
						aria-label={t('relation.filterSelectedItems', 'Filter selected items')}
						placeholder={t('relation.filterSelectedPlaceholder', 'Filter selected...')}
						data-rw-bare-input=""
						className="h-6 w-full border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
					/>
				</div>
				<div className="h-52 divide-y divide-border/50 overflow-y-auto">
					{chosen.map(({ tok, item }) => {
						const realIdx = selectedValues.indexOf(tok);
						return (
							<div
								key={tok}
								className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/35"
							>
								<div className="flex items-center gap-2 min-w-0">
									<RelationItemVisual item={item} fallbackIcon={fallbackIcon} size="xs" />
									<span className="truncate font-medium">{item.label}</span>
								</div>
								<div className="flex items-center gap-0.5 shrink-0">
									{!disabled ? (
										<>
											<button
												type="button"
												onClick={() => moveItem(realIdx, -1)}
												disabled={realIdx <= 0}
												className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
												aria-label={t('relation.moveUp', 'Move up')}
											>
												<DynamicIcon name="arrow-up" className="size-3" />
											</button>
											<button
												type="button"
												onClick={() => moveItem(realIdx, 1)}
												disabled={realIdx >= selectedValues.length - 1}
												className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
												aria-label={t('relation.moveDown', 'Move down')}
											>
												<DynamicIcon name="arrow-down" className="size-3" />
											</button>
										</>
									) : null}
									<QuickEditButton item={item} enabled={editableLink} />
									{!disabled ? (
										<button
											type="button"
											onClick={() => onChange(selectedValues.filter((v) => v !== tok))}
											className="rounded p-0.5 text-muted-foreground hover:text-destructive cursor-pointer"
											aria-label={t('relation.removeNamed', { label: item.label }, 'Remove {label}')}
										>
											<DynamicIcon name="x" className="size-3.5" />
										</button>
									) : null}
								</div>
							</div>
						);
					})}
				</div>
			</div>
			</div>
		</div>
	);
}
