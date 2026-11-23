import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../../lib/i18n';
import { cn, DynamicIcon } from '../../../lib/utils';
import { Badge, Button, Input, type useSortableList } from '../../../ui';
import type { RelationItemData } from '../../types';
import { SelectedItemsStack } from './SelectedItemsStack';
import {
	itemStoredToken,
	makeFallbackItem,
	QuickEditButton,
	RelationItemVisual,
} from './typesAndHelpers';

export function SelectAndMultiRelationWidget({
	cardinality,
	multiple,
	options,
	loading,
	scalarValue,
	multiValues,
	maxItems,
	allowCustom,
	creatable,
	editableLink,
	disabled,
	placeholder,
	resourceMeta,
	sortable,
	isSortable,
	statusSlot,
	resolveItem,
	onCommitScalar,
	onCommitMulti,
	onOpenQuickCreate,
}: {
	cardinality: string;
	multiple: boolean;
	options: RelationItemData[];
	loading: boolean;
	scalarValue: string;
	multiValues: string[];
	maxItems: number;
	allowCustom: boolean;
	creatable: boolean;
	editableLink: boolean;
	disabled: boolean;
	placeholder?: string;
	resourceMeta: { name: string; label: string; icon: string };
	sortable: ReturnType<typeof useSortableList<string>>;
	isSortable: boolean;
	statusSlot?: React.ReactNode;
	resolveItem: (tok: string) => RelationItemData;
	onCommitScalar: (val: string, item?: RelationItemData) => void;
	onCommitMulti: (vals: string[], items?: RelationItemData[]) => void;
	onOpenQuickCreate: (resourceOverride?: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [filter, setFilter] = useState('');
	const wrapRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const onDocClick = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', onDocClick);
		return () => document.removeEventListener('mousedown', onDocClick);
	}, [open]);

	const selectedSet = useMemo(
		() => new Set(multiple ? multiValues : scalarValue ? [scalarValue] : []),
		[multiple, multiValues, scalarValue]
	);

	const filteredOptions = useMemo(() => {
		const q = filter.trim().toLowerCase();
		return options.filter((opt) => {
			const tok = itemStoredToken(opt, cardinality);
			if (multiple && selectedSet.has(tok)) {
				return false;
			}
			if (!q) return true;
			return (
				opt.label.toLowerCase().includes(q) ||
				String(opt.value).toLowerCase().includes(q) ||
				(opt.subtitle && opt.subtitle.toLowerCase().includes(q)) ||
				(opt.badge && opt.badge.toLowerCase().includes(q))
			);
		});
	}, [options, filter, cardinality, multiple, selectedSet]);

	const selectedSingle = scalarValue ? resolveItem(scalarValue) : undefined;
	const atLimit = multiple && maxItems > 0 && multiValues.length >= maxItems;

	const chooseOption = (item: RelationItemData) => {
		const tok = itemStoredToken(item, cardinality);
		if (multiple) {
			if (!selectedSet.has(tok) && !atLimit) {
				onCommitMulti([...multiValues, tok], [item]);
			}
			setFilter('');
		} else {
			onCommitScalar(tok, item);
			setOpen(false);
			setFilter('');
		}
	};

	const commitCustomFilter = () => {
		const clean = filter.trim();
		if (!clean || !allowCustom) return;
		const customItem = makeFallbackItem(clean, cardinality, resourceMeta.name);
		if (multiple) {
			if (!selectedSet.has(clean) && !atLimit) {
				onCommitMulti([...multiValues, clean], [customItem]);
			}
		} else {
			onCommitScalar(clean, customItem);
			setOpen(false);
		}
		setFilter('');
	};

	const inputDisabled = disabled || atLimit;

	return (
		<div ref={wrapRef} className="space-y-1.5">
			<div data-rw-field-slot="input" className="relative">
				<div className="flex items-center gap-1.5">
					<div
						role="combobox"
						aria-expanded={open}
						aria-label={
							placeholder ||
							(multiple
								? `Add ${resourceMeta.label.toLowerCase()}`
								: `Select ${resourceMeta.label.toLowerCase()}`)
						}
						tabIndex={inputDisabled ? -1 : 0}
						onClick={() => {
							if (!inputDisabled) setOpen((o) => !o);
						}}
						onKeyDown={(e) => {
							if (inputDisabled) return;
							if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
								e.preventDefault();
								setOpen(true);
							} else if (e.key === 'Escape') {
								setOpen(false);
							}
						}}
						className={cn(
							'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-input-surface px-3 text-xs shadow-2xs transition-colors',
							inputDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-ring/60',
							open && 'border-ring ring-2 ring-ring/20'
						)}
					>
						{!multiple && selectedSingle ? (
							<div className="flex min-w-0 flex-1 items-center gap-2">
								<RelationItemVisual item={selectedSingle} fallbackIcon={resourceMeta.icon} size="xs" />
								<span className="min-w-0 flex-1 truncate font-medium text-foreground">{selectedSingle.label}</span>
								{selectedSingle.subtitle ? (
									<span className="hidden @md/rw-rel:inline max-w-[38%] truncate font-mono text-[11px] text-muted-foreground">
										{selectedSingle.subtitle}
									</span>
								) : null}
								{selectedSingle.badge ? (
									<Badge variant="secondary" className="hidden @sm/rw-rel:inline-flex px-1.5 py-0 text-[10px] font-normal shrink-0">
										{selectedSingle.badge}
									</Badge>
								) : null}
							</div>
						) : (
							<span className="truncate text-muted-foreground">
								{loading
									? `Loading ${resourceMeta.label.toLowerCase()} options...`
									: atLimit
										? `Maximum ${maxItems} selected`
										: placeholder ||
											(multiple
												? `+ Add ${resourceMeta.label.toLowerCase()}...`
												: `Select ${resourceMeta.label.toLowerCase()}...`)}
							</span>
						)}

						<div className="flex items-center gap-1 shrink-0">
							{!multiple && selectedSingle && editableLink ? (
								<QuickEditButton item={selectedSingle} enabled={editableLink} />
							) : null}
							{!multiple && scalarValue && !disabled ? (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onCommitScalar('');
									}}
									title={t('media.clearSelection', 'Clear selection')}
									aria-label={t('media.clearSelection', 'Clear selection')}
									className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
								>
									<DynamicIcon name="x" className="size-3.5" />
								</button>
							) : null}
							<DynamicIcon name="chevron-down" className="size-3.5 text-muted-foreground" />
						</div>
					</div>

					{creatable && !inputDisabled ? (
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={() => onOpenQuickCreate()}
							title={`New ${resourceMeta.label}`}
							aria-label={`New ${resourceMeta.label}`}
							className="h-9 w-9 shrink-0"
						>
							<DynamicIcon name="plus" className="size-4" />
						</Button>
					) : null}
				</div>

				{open && !inputDisabled ? (
					<div className="absolute left-0 right-0 z-40 mt-1 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
						{(options.length > 6 || allowCustom || filter !== '') && (
							<div className="mb-1.5 px-0.5">
								<Input
									aria-label={t('relation.filterOptions', 'Filter options...')}
									value={filter}
									onChange={(e) => setFilter(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											const firstOption = filteredOptions[0];
											if (firstOption) {
												chooseOption(firstOption);
											} else if (allowCustom && filter.trim()) {
												commitCustomFilter();
											}
										} else if (e.key === 'Escape') {
											setOpen(false);
										}
									}}
									placeholder={
										allowCustom
											? `Filter or type custom ${resourceMeta.label.toLowerCase()}...`
											: `Filter ${resourceMeta.label.toLowerCase()}...`
									}
									className="h-8 text-xs"
									autoFocus
								/>
							</div>
						)}

						<div className="max-h-60 overflow-y-auto space-y-0.5">
							{filteredOptions.map((opt) => {
								const tok = itemStoredToken(opt, cardinality);
								const isSelected = !multiple && scalarValue === tok;
								return (
									<button
										key={opt.key || tok}
										type="button"
										disabled={opt.disabled}
										onClick={() => chooseOption(opt)}
										className={cn(
											'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
											isSelected
												? 'bg-primary/10 text-foreground font-semibold'
												: 'hover:bg-muted text-foreground',
											opt.disabled && 'opacity-50 pointer-events-none'
										)}
									>
										<div className="flex items-start gap-2 min-w-0 flex-1">
											<RelationItemVisual item={opt} fallbackIcon={resourceMeta.icon} size="xs" />
											<div className="flex min-w-0 flex-1 flex-col">
												<span className="truncate font-medium">{opt.label}</span>
												{opt.subtitle ? (
													<span className="truncate font-mono text-[11px] text-muted-foreground">
														{opt.subtitle}
													</span>
												) : null}
											</div>
										</div>
										<div className="flex items-center gap-1.5 shrink-0">
											{opt.badge ? (
												<Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
													{opt.badge}
												</Badge>
											) : null}
											{isSelected ? <DynamicIcon name="check" className="size-3.5 text-primary" /> : null}
										</div>
									</button>
								);
							})}

							{allowCustom && filter.trim() !== '' && !options.some((o) => String(o.value) === filter.trim()) ? (
								<button
									type="button"
									onClick={commitCustomFilter}
									className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-muted"
								>
									<DynamicIcon name="plus" className="size-3.5 text-primary shrink-0" />
									<span>
										Use custom value: <strong className="font-mono">{filter.trim()}</strong>
									</span>
								</button>
							) : null}

							{filteredOptions.length === 0 && (!allowCustom || !filter.trim()) ? (
								<div className="px-2.5 py-3 text-center text-xs text-muted-foreground">
									{loading ? 'Loading options...' : 'No matching records found.'}
								</div>
							) : null}
						</div>
					</div>
				) : null}
			</div>

			{statusSlot}

			{multiple ? (
				<SelectedItemsStack
					cardinality={cardinality}
					values={multiValues}
					disabled={disabled}
					editableLink={editableLink}
					fallbackIcon={resourceMeta.icon}
					isSortable={isSortable}
					sortable={sortable}
					resolveItem={resolveItem}
					onRemove={(tok) => onCommitMulti(multiValues.filter((v) => v !== tok))}
				/>
			) : null}
		</div>
	);
}
