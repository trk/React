import React, { useEffect, useMemo, useState } from 'react';
import { Combobox as BaseCombobox } from '@base-ui/react/combobox';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { getPortalContainer } from '../../portal/PortalRoot';

export interface ComboboxOption {
	value: string;
	label: string;
	description?: string;
	keywords?: string;
	icon?: string;
	disabled?: boolean;
}

export interface ComboboxProps {
	options: ComboboxOption[];
	value?: string | null;
	onValueChange?: (value: string) => void;
	placeholder?: string;
	emptyText?: string;
	clearable?: boolean;
	allowCustom?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	id?: string;
	name?: string;
	'aria-label'?: string;
	'aria-invalid'?: boolean;
	'aria-describedby'?: string;
	className?: string;
	inputClassName?: string;
	popupClassName?: string;
}

export function Combobox({
	options,
	value,
	onValueChange,
	placeholder,
	emptyText,
	clearable = false,
	allowCustom = false,
	disabled = false,
	readOnly = false,
	id,
	name,
	'aria-label': ariaLabel,
	'aria-invalid': ariaInvalid,
	'aria-describedby': ariaDescribedBy,
	className,
	inputClassName,
	popupClassName,
}: ComboboxProps): React.ReactElement {
	const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
	const [inputQuery, setInputQuery] = useState<string>('');
	const [openState, setOpenState] = useState(false);

	useEffect(() => {
		if (readOnly) {
			setOpenState(false);
		}
	}, [readOnly]);
	const { contains } = BaseCombobox.useFilter();
	const effectiveOptions = useMemo(() => {
		const next = [...options];
		const seen = new Set(next.map((opt) => opt.value));
		const currentVal = typeof value === 'string' ? value.trim() : '';
		if (allowCustom && currentVal && !seen.has(currentVal)) {
			next.push({
				value: currentVal,
				label: currentVal,
			});
			seen.add(currentVal);
		}
		const trimmed = inputQuery.trim();
		if (allowCustom && trimmed && !seen.has(trimmed)) {
			const hasExact = next.some(
				(opt) => opt.value === trimmed || opt.label.toLowerCase() === trimmed.toLowerCase(),
			);
			if (!hasExact) {
				next.push({
					value: trimmed,
					label: trimmed,
					description: t('combobox.customValueHint', 'Use custom value'),
				});
			}
		}
		return next;
	}, [allowCustom, inputQuery, options, value]);
	const selectedOption = effectiveOptions.find((opt) => opt.value === value) ?? null;

	return (
		<BaseCombobox.Root<ComboboxOption>
			items={effectiveOptions}
			value={selectedOption}
			disabled={disabled}
			readOnly={readOnly}
			open={readOnly ? false : openState}
			onOpenChange={(nextOpen) => {
				setOpenState(readOnly ? false : nextOpen);
			}}
			name={name}
			isItemEqualToValue={(item, current) => item.value === current.value}
			itemToStringLabel={(item) => item.label}
			itemToStringValue={(item) => item.value}
			onInputValueChange={(nextInput) => {
				setInputQuery(nextInput);
			}}
			filter={(item, query) => {
				const q = query.trim();
				if (!q) {
					return true;
				}
				if (contains(item, q, (opt) => opt.label)) {
					return true;
				}
				if (item.description && contains(item, q, (opt) => opt.description ?? '')) {
					return true;
				}
				if (item.keywords && contains(item, q, (opt) => opt.keywords ?? '')) {
					return true;
				}
				return contains(item, q, (opt) => opt.value);
			}}
			onValueChange={(next) => {
				onValueChange?.(next ? next.value : '');
			}}
		>
			<div ref={setAnchorEl} className={cn('relative flex w-full items-center min-w-0', className)}>
				<BaseCombobox.Input
					id={id}
					aria-label={ariaLabel}
					aria-invalid={ariaInvalid || undefined}
					aria-describedby={ariaDescribedBy}
					aria-readonly={readOnly || undefined}
					readOnly={readOnly}
					placeholder={placeholder ?? t('common.selectOption', 'Select option...')}
					className={cn(
						'flex h-9 w-full min-w-0 rounded-md border border-input bg-input-surface pl-3 pr-14 text-sm text-foreground shadow-2xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
						ariaInvalid && 'border-destructive focus-visible:ring-destructive/40',
						inputClassName,
					)}
				/>
				<div className="absolute right-1.5 flex items-center gap-0.5">
					{clearable && selectedOption && !disabled && !readOnly ? (
						<BaseCombobox.Clear
							aria-label={t('common.clear', 'Clear')}
							className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
						>
							<DynamicIcon name="x" className="size-3.5" aria-hidden="true" />
						</BaseCombobox.Clear>
					) : null}
					<BaseCombobox.Trigger
						disabled={disabled || readOnly}
						aria-label={t('common.toggleOptions', 'Toggle options')}
						className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
					>
						<DynamicIcon name="chevron-down" className="size-3.5" aria-hidden="true" />
					</BaseCombobox.Trigger>
				</div>
			</div>

			<BaseCombobox.Portal container={getPortalContainer(anchorEl)}>
				<BaseCombobox.Positioner sideOffset={4} className="z-50">
					<BaseCombobox.Popup
						data-rw-portal-overlay=""
						className={cn(
							'z-50 max-h-64 w-[var(--anchor-width)] min-w-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none',
							popupClassName,
						)}
					>
						<BaseCombobox.Empty className="px-2.5 py-4 empty:p-0 text-center text-xs text-muted-foreground">
							{emptyText ?? t('common.noResults', 'No matching options')}
						</BaseCombobox.Empty>
						<BaseCombobox.List>
							{(item: ComboboxOption) => (
								<BaseCombobox.Item
									key={item.value}
									value={item}
									disabled={item.disabled}
									className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-popover-foreground outline-none cursor-pointer select-none data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
								>
									{item.icon ? (
										<DynamicIcon name={item.icon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
									) : null}
									<div className="min-w-0 flex-1">
										<div className="truncate font-medium">{item.label}</div>
										{item.description ? (
											<div className="truncate text-[11px] text-muted-foreground">{item.description}</div>
										) : null}
									</div>
									<BaseCombobox.ItemIndicator className="ml-auto shrink-0 text-primary">
										<DynamicIcon name="check" className="size-3.5" aria-hidden="true" />
									</BaseCombobox.ItemIndicator>
								</BaseCombobox.Item>
							)}
						</BaseCombobox.List>
					</BaseCombobox.Popup>
				</BaseCombobox.Positioner>
			</BaseCombobox.Portal>
		</BaseCombobox.Root>
	);
}
