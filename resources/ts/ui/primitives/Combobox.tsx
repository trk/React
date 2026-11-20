import React, { useState } from 'react';
import { Combobox as BaseCombobox } from '@base-ui/react/combobox';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { getPortalContainer } from '../../portal/PortalRoot';

export interface ComboboxOption {
	value: string;
	label: string;
	description?: string;
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
	disabled?: boolean;
	id?: string;
	name?: string;
	'aria-label'?: string;
	className?: string;
}

export function Combobox({
	options,
	value,
	onValueChange,
	placeholder,
	emptyText,
	clearable = false,
	disabled = false,
	id,
	name,
	'aria-label': ariaLabel,
	className,
}: ComboboxProps): React.ReactElement {
	const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
	const selectedOption = options.find((opt) => opt.value === value) ?? null;

	return (
		<BaseCombobox.Root<ComboboxOption>
			items={options}
			value={selectedOption}
			disabled={disabled}
			name={name}
			isItemEqualToValue={(item, current) => item.value === current.value}
			onValueChange={(next) => {
				onValueChange?.(next ? next.value : '');
			}}
		>
			<div ref={setAnchorEl} className={cn('relative flex w-full items-center', className)}>
				<BaseCombobox.Input
					id={id}
					aria-label={ariaLabel}
					placeholder={placeholder ?? t('common.selectOption', 'Select option...')}
					className="flex h-9 w-full rounded-md border border-input bg-input-surface pl-3 pr-14 text-sm text-foreground shadow-2xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
				/>
				<div className="absolute right-1.5 flex items-center gap-0.5">
					{clearable && selectedOption && !disabled ? (
						<BaseCombobox.Clear
							aria-label={t('common.clear', 'Clear')}
							className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
						>
							<DynamicIcon name="x" className="size-3.5" aria-hidden="true" />
						</BaseCombobox.Clear>
					) : null}
					<BaseCombobox.Trigger
						aria-label={t('common.toggleOptions', 'Toggle options')}
						className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
					>
						<DynamicIcon name="chevron-down" className="size-3.5" aria-hidden="true" />
					</BaseCombobox.Trigger>
				</div>
			</div>

			<BaseCombobox.Portal container={getPortalContainer(anchorEl)}>
				<BaseCombobox.Positioner sideOffset={4} className="z-50">
					<BaseCombobox.Popup
						data-rw-portal-overlay=""
						className="z-50 max-h-64 w-[var(--anchor-width)] min-w-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
					>
						<BaseCombobox.Empty className="px-2.5 py-4 text-center text-xs text-muted-foreground">
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
