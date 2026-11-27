import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { t } from '../../../lib/i18n';
import { cn, DynamicIcon } from '../../../lib/utils';
import { Badge, Button, Input, type useSortableList } from '../../../ui';
import type { RelationItemData } from '../../types';
import { SelectedItemsStack } from './SelectedItemsStack';
import {
	isRelationItemDisabled,
	itemStoredToken,
	makeFallbackItem,
	QuickEditButton,
	RelationItemVisual,
	resolveRelationItemKey,
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
	const [activeIdx, setActiveIdx] = useState(0);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const comboboxRef = useRef<HTMLDivElement | null>(null);
	const listboxId = useId();

	useEffect(() => {
		setActiveIdx(0);
	}, [filter, open]);

	useEffect(() => {
		if (!open) return;
		const onDocClick = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || e.defaultPrevented) {
				return;
			}
			const target = e.target instanceof Element ? e.target : null;
			const dialog = target?.closest('dialog[open], [role="dialog"], [role="alertdialog"]') ?? null;
			if (dialog && (!wrapRef.current || !dialog.contains(wrapRef.current))) {
				return;
			}
			const overlay = target?.closest('[data-rw-portal-overlay]') ?? null;
			if (overlay && (!wrapRef.current || (!overlay.contains(wrapRef.current) && !wrapRef.current.contains(overlay)))) {
				return;
			}
			if (wrapRef.current?.querySelector('dialog[open], [role="dialog"], [role="alertdialog"], [data-rw-portal-overlay]')) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			setOpen(false);
			comboboxRef.current?.focus();
		};
		document.addEventListener('mousedown', onDocClick);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onDocClick);
			document.removeEventListener('keydown', onKeyDown);
		};
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
	const hasCustomOption =
		allowCustom && filter.trim() !== '' && !options.some((o) => String(o.value) === filter.trim());
	const hasListboxOptions = filteredOptions.length > 0 || hasCustomOption;
	const showFilter = options.length > 6 || allowCustom || filter !== '';
	const innerFilterActive = open && !inputDisabled && showFilter;
	const activeOptionId =
		open && activeIdx >= 0 && filteredOptions[activeIdx] ? `${listboxId}-opt-${activeIdx}` : undefined;

	return (
		<div ref={wrapRef} className="space-y-1.5">
			<div data-rw-field-slot="input" className="relative">
				<div className="flex items-center gap-1.5">
					<div
						ref={comboboxRef}
						role={innerFilterActive ? 'button' : 'combobox'}
						aria-haspopup={innerFilterActive ? 'listbox' : undefined}
						aria-expanded={open}
						aria-controls={open && hasListboxOptions ? listboxId : undefined}
						aria-activedescendant={innerFilterActive ? undefined : activeOptionId}
						aria-label={
							placeholder ||
							(multiple
								? t('relation.addResource', { resource: resourceMeta.label.toLowerCase() }, 'Add {resource}')
								: t('relation.selectResource', { resource: resourceMeta.label.toLowerCase() }, 'Select {resource}'))
						}
						tabIndex={inputDisabled ? -1 : 0}
						onClick={() => {
							if (!inputDisabled) setOpen((o) => !o);
						}}
						onKeyDown={(e) => {
							if (inputDisabled) return;
							if (e.key === 'ArrowDown') {
								e.preventDefault();
								if (!open) {
									setOpen(true);
								} else if (filteredOptions.length > 0) {
									setActiveIdx((i) => (i + 1) % filteredOptions.length);
								}
							} else if (e.key === 'ArrowUp') {
								e.preventDefault();
								if (!open) {
									setOpen(true);
								} else if (filteredOptions.length > 0) {
									setActiveIdx((i) => (i - 1 + filteredOptions.length) % filteredOptions.length);
								}
							} else if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								if (!open) {
									setOpen(true);
								} else if (filteredOptions[activeIdx]) {
									chooseOption(filteredOptions[activeIdx]);
								}
							} else if (e.key === 'Escape' && open) {
								e.preventDefault();
								e.stopPropagation();
								setOpen(false);
							}
						}}
						className={cn(
							'flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-input bg-input-surface px-3 text-xs shadow-2xs transition-colors',
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
									? t(
											'relation.loadingResourceOptions',
											{ resource: resourceMeta.label.toLowerCase() },
											'Loading {resource} options...'
										)
									: atLimit
										? t('relation.maxSelected', { max: maxItems }, 'Maximum {max} selected')
										: placeholder ||
											(multiple
												? t(
														'relation.addResourcePlaceholder',
														{ resource: resourceMeta.label.toLowerCase() },
														'+ Add {resource}...'
													)
												: t(
														'relation.selectResourcePlaceholder',
														{ resource: resourceMeta.label.toLowerCase() },
														'Select {resource}...'
													))}
							</span>
						)}

						<DynamicIcon name="chevron-down" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
					</div>

					{(!multiple && selectedSingle && editableLink) || (!multiple && scalarValue && !disabled) ? (
						<div className="flex items-center gap-1 shrink-0">
							{!multiple && selectedSingle && editableLink ? (
								<QuickEditButton item={selectedSingle} enabled={editableLink} />
							) : null}
							{!multiple && scalarValue && !disabled ? (
								<button
									type="button"
									onClick={() => onCommitScalar('')}
									title={t('media.clearSelection', 'Clear selection')}
									aria-label={t('media.clearSelection', 'Clear selection')}
									className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
								>
									<DynamicIcon name="x" className="size-3.5" />
								</button>
							) : null}
						</div>
					) : null}

					{creatable && !inputDisabled ? (
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={() => onOpenQuickCreate()}
							title={t('relation.newResource', { resource: resourceMeta.label }, 'New {resource}')}
							aria-label={t('relation.newResource', { resource: resourceMeta.label }, 'New {resource}')}
							className="h-9 w-9 shrink-0"
						>
							<DynamicIcon name="plus" className="size-4" />
						</Button>
					) : null}
				</div>

				{open && !inputDisabled ? (
					<div className="absolute left-0 right-0 z-40 mt-1 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
						{showFilter && (
							<div className="mb-1.5 px-0.5">
								<Input
									role="combobox"
									aria-expanded={hasListboxOptions}
									aria-controls={hasListboxOptions ? listboxId : undefined}
									aria-activedescendant={activeOptionId}
									aria-label={t('relation.filterOptions', 'Filter options...')}
									value={filter}
									onChange={(e) => setFilter(e.target.value)}
									onKeyDown={(e) => {
										if (e.nativeEvent.isComposing || e.keyCode === 229) {
											return;
										}
										if (e.key === 'ArrowDown' && filteredOptions.length > 0) {
											e.preventDefault();
											setActiveIdx((i) => (i + 1) % filteredOptions.length);
										} else if (e.key === 'ArrowUp' && filteredOptions.length > 0) {
											e.preventDefault();
											setActiveIdx((i) => (i - 1 + filteredOptions.length) % filteredOptions.length);
										} else if (e.key === 'Enter') {
											e.preventDefault();
											const targetOption = filteredOptions[activeIdx] || filteredOptions[0];
											if (targetOption) {
												chooseOption(targetOption);
											} else if (allowCustom && filter.trim()) {
												commitCustomFilter();
											}
										} else if (e.key === 'Escape') {
											e.preventDefault();
											e.stopPropagation();
											setOpen(false);
											comboboxRef.current?.focus();
										}
									}}
									placeholder={t('relation.filterOptions', 'Filter options...')}
									className="h-8 text-xs"
									autoFocus
								/>
							</div>
						)}

						{hasListboxOptions ? (
							<div
								id={listboxId}
								role="listbox"
								aria-label={placeholder || resourceMeta.label}
								className="max-h-60 overflow-y-auto space-y-0.5"
							>
								{filteredOptions.map((opt, idx) => {
									const tok = itemStoredToken(opt, cardinality);
									const optDisabled = isRelationItemDisabled(opt);
									const isSelected = !multiple && scalarValue === tok;
									const isHighlighted = idx === activeIdx;
									return (
										<button
											key={resolveRelationItemKey(opt)}
											id={`${listboxId}-opt-${idx}`}
											type="button"
											role="option"
											aria-selected={isSelected}
											disabled={optDisabled}
											onMouseEnter={() => setActiveIdx(idx)}
											onClick={() => chooseOption(opt)}
											className={cn(
												'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
												isSelected
													? 'bg-primary/10 text-foreground font-semibold'
													: isHighlighted
														? 'bg-muted text-foreground'
														: 'hover:bg-muted text-foreground',
												optDisabled && 'opacity-50 pointer-events-none'
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

								{hasCustomOption ? (
									<button
										id={`${listboxId}-opt-custom`}
										type="button"
										role="option"
										aria-selected={false}
										onClick={commitCustomFilter}
										className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-muted"
									>
										<DynamicIcon name="plus" className="size-3.5 text-primary shrink-0" />
										<span>
											{t('combobox.customValueHint', 'Use custom value')}: <strong className="font-mono">{filter.trim()}</strong>
										</span>
									</button>
								) : null}
							</div>
						) : (
							<div role="status" className="px-2.5 py-3 text-center text-xs text-muted-foreground">
								{loading
									? t('relation.loadingOptions', 'Loading options...')
									: t('relation.noResults', 'No matching records found.')}
							</div>
						)}
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
