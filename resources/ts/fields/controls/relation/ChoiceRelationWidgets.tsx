import { useMemo, useState } from 'react';
import { t } from '../../../lib/i18n';
import { cn } from '../../../lib/utils';
import { Badge, Button, Input } from '../../../ui';
import type { RelationItemData } from '../../types';
import { QuickEditButton, RelationItemVisual } from './typesAndHelpers';

export function RadioRelationWidget({
	cards,
	options,
	loading,
	value,
	optionColumns,
	disabled,
	required,
	editableLink,
	creatable,
	fallbackIcon,
	onSelect,
	onOpenQuickCreate,
}: {
	cards: boolean;
	options: RelationItemData[];
	loading: boolean;
	value: string;
	optionColumns: number;
	disabled: boolean;
	required: boolean;
	editableLink: boolean;
	creatable: boolean;
	fallbackIcon: string;
	onSelect: (tok: string, item?: RelationItemData) => void;
	onOpenQuickCreate: () => void;
}) {
	const gridCols =
		optionColumns === 4
			? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
			: optionColumns === 3
				? 'grid-cols-1 sm:grid-cols-3'
				: optionColumns === 2 || cards
					? 'grid-cols-1 sm:grid-cols-2'
					: 'grid-cols-1';

	const isMultiCol = cards || optionColumns >= 2;

	return (
		<div className="space-y-2">
			{loading && options.length === 0 ? (
				<p className="text-xs text-muted-foreground">{t('relation.loadingOptions', 'Loading options...')}</p>
			) : null}
			<div
				className={cn(
					isMultiCol
						? cn('grid gap-2', gridCols)
						: 'divide-y divide-border overflow-hidden rounded-md border border-border'
				)}
				role="radiogroup"
			>
				{options.map((opt) => {
					const tok = String(opt.value);
					const checked = value === tok;
					return (
						<label
							key={opt.key || tok}
							className={cn(
								'flex items-start justify-between gap-2 px-3 py-2 text-xs transition-colors',
								isMultiCol
									? cn(
											'rounded-md border',
											checked
												? 'border-primary bg-primary/6'
												: 'border-border/80 bg-muted/15 hover:bg-muted/40'
										)
									: checked
										? 'bg-primary/6'
										: 'hover:bg-muted/35',
								(disabled || opt.disabled) ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
							)}
						>
							<div className="flex items-start gap-2.5 min-w-0">
								<input
									type="radio"
									checked={checked}
									disabled={disabled || opt.disabled}
									onChange={() => onSelect(tok, opt)}
									className="mt-0.5 accent-primary"
								/>
								{cards ? <RelationItemVisual item={opt} fallbackIcon={fallbackIcon} size="md" /> : null}
								<div className="min-w-0">
									<div className="font-medium text-foreground truncate">{opt.label}</div>
									{opt.subtitle ? (
										<div className="font-mono text-[11px] text-muted-foreground truncate">
											{opt.subtitle}
										</div>
									) : null}
								</div>
							</div>
							<div className="flex items-center gap-1 shrink-0">
								{opt.badge ? (
									<Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
										{opt.badge}
									</Badge>
								) : null}
								<QuickEditButton item={opt} enabled={editableLink} />
							</div>
						</label>
					);
				})}
			</div>

			<div className="flex items-center gap-2">
				{!required && value && !disabled ? (
					<Button type="button" variant="ghost" size="xs" onClick={() => onSelect('')}>
						Clear selection
					</Button>
				) : null}
				{creatable && !disabled ? (
					<Button type="button" variant="outline" size="xs" icon="plus" onClick={onOpenQuickCreate}>
						Quick Create
					</Button>
				) : null}
			</div>
		</div>
	);
}

export function CheckboxesRelationWidget({
	options,
	loading,
	selectedValues,
	optionColumns,
	maxItems,
	disabled,
	editableLink,
	creatable,
	fallbackIcon,
	onChange,
	onOpenQuickCreate,
}: {
	options: RelationItemData[];
	loading: boolean;
	selectedValues: string[];
	optionColumns: number;
	maxItems: number;
	disabled: boolean;
	editableLink: boolean;
	creatable: boolean;
	fallbackIcon: string;
	onChange: (next: string[], items?: RelationItemData[]) => void;
	onOpenQuickCreate: () => void;
}) {
	const [filter, setFilter] = useState('');
	const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

	const visibleOptions = useMemo(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return options;
		return options.filter(
			(o) =>
				o.label.toLowerCase().includes(q) ||
				String(o.value).toLowerCase().includes(q) ||
				(o.subtitle && o.subtitle.toLowerCase().includes(q))
		);
	}, [options, filter]);

	const gridCols =
		optionColumns === 4
			? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
			: optionColumns === 3
				? 'grid-cols-1 sm:grid-cols-3'
				: optionColumns === 2
					? 'grid-cols-1 sm:grid-cols-2'
					: 'grid-cols-1';

	const toggleOption = (opt: RelationItemData) => {
		const tok = String(opt.value);
		if (selectedSet.has(tok)) {
			onChange(selectedValues.filter((v) => v !== tok));
		} else if (maxItems === 0 || selectedValues.length < maxItems) {
			onChange([...selectedValues, tok], [opt]);
		}
	};

	return (
		<div className="space-y-2">
			{options.length > 6 ? (
				<div className="flex flex-wrap items-center justify-between gap-2">
					<Input
						aria-label={t('relation.filterOptions', 'Filter options...')}
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder={t('relation.filterOptions', 'Filter options...')}
						className="h-8 max-w-xs text-xs"
					/>
					{!disabled ? (
						<div className="flex items-center gap-1.5 text-xs">
							{maxItems === 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="xs"
									onClick={() => {
										const allTokens = visibleOptions
											.filter((o) => !o.disabled)
											.map((o) => String(o.value));
										const merged = Array.from(new Set([...selectedValues, ...allTokens]));
										onChange(merged, visibleOptions);
									}}
								>
									Select all
								</Button>
							) : null}
							{selectedValues.length > 0 ? (
								<Button type="button" variant="ghost" size="xs" onClick={() => onChange([])}>
									Clear ({selectedValues.length})
								</Button>
							) : null}
						</div>
					) : null}
				</div>
			) : null}

			{loading && options.length === 0 ? (
				<p className="text-xs text-muted-foreground">{t('relation.loadingOptions', 'Loading options...')}</p>
			) : null}

			<div
				className={cn(
					'max-h-72 overflow-y-auto',
					optionColumns >= 2
						? cn('grid gap-1.5 pr-1', gridCols)
						: 'divide-y divide-border rounded-md border border-border'
				)}
			>
				{visibleOptions.map((opt) => {
					const tok = String(opt.value);
					const checked = selectedSet.has(tok);
					const lockedByMax = !checked && maxItems > 0 && selectedValues.length >= maxItems;
					return (
						<label
							key={opt.key || tok}
							className={cn(
								'flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs transition-colors',
								optionColumns >= 2
									? cn(
											'rounded-md border',
											checked
												? 'border-primary/60 bg-primary/5'
												: 'border-border/80 bg-muted/15 hover:bg-muted/40'
										)
									: checked
										? 'bg-primary/6'
										: 'hover:bg-muted/35',
								(disabled || opt.disabled || lockedByMax)
									? 'opacity-55 pointer-events-none'
									: 'cursor-pointer'
							)}
						>
							<div className="flex items-center gap-2 min-w-0">
								<input
									type="checkbox"
									checked={checked}
									disabled={disabled || opt.disabled || lockedByMax}
									onChange={() => toggleOption(opt)}
									className="accent-primary"
								/>
								<RelationItemVisual item={opt} fallbackIcon={fallbackIcon} size="xs" />
								<span className="truncate font-medium text-foreground">{opt.label}</span>
								{opt.subtitle ? (
									<span className="truncate font-mono text-[11px] text-muted-foreground">
										{opt.subtitle}
									</span>
								) : null}
							</div>
							<div className="flex items-center gap-1 shrink-0">
								{opt.badge ? (
									<Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
										{opt.badge}
									</Badge>
								) : null}
								<QuickEditButton item={opt} enabled={editableLink} />
							</div>
						</label>
					);
				})}
			</div>

			{creatable && !disabled ? (
				<Button type="button" variant="outline" size="xs" icon="plus" onClick={onOpenQuickCreate}>
					Quick Create
				</Button>
			) : null}
		</div>
	);
}
