import React, { useId } from 'react';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { cn, DynamicIcon } from '../../lib/utils';

export interface CheckboxProps {
	checked?: boolean;
	defaultChecked?: boolean;
	indeterminate?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	label?: React.ReactNode;
	description?: React.ReactNode;
	disabled?: boolean;
	required?: boolean;
	name?: string;
	value?: string;
	id?: string;
	'aria-label'?: string;
	className?: string;
	controlClassName?: string;
}

export function Checkbox({
	checked,
	defaultChecked,
	indeterminate = false,
	onCheckedChange,
	label,
	description,
	disabled = false,
	required = false,
	name,
	value,
	id,
	'aria-label': ariaLabel,
	className,
	controlClassName,
}: CheckboxProps): React.ReactElement {
	const generatedId = useId();
	const checkboxId = id ?? generatedId;

	return (
		<div className={cn('flex items-start gap-2.5', className)}>
			<BaseCheckbox.Root
				id={checkboxId}
				checked={checked}
				defaultChecked={defaultChecked}
				indeterminate={indeterminate}
				disabled={disabled}
				required={required}
				name={name}
				value={value}
				nativeButton
				render={<button type="button" />}
				aria-label={ariaLabel}
				onCheckedChange={(next) => {
					if (!disabled) {
						onCheckedChange?.(next);
					}
				}}
				className={cn(
					'mt-0.5 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-input bg-input-surface text-primary-foreground shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[checked]:border-primary data-[checked]:bg-primary data-[indeterminate]:border-primary data-[indeterminate]:bg-primary disabled:cursor-not-allowed disabled:opacity-50',
					controlClassName
				)}
			>
				<BaseCheckbox.Indicator className="flex items-center justify-center text-current">
					<DynamicIcon name={indeterminate ? 'minus' : 'check'} className="size-3" aria-hidden="true" />
				</BaseCheckbox.Indicator>
			</BaseCheckbox.Root>
			{label || description ? (
				<div className="grid gap-0.5 leading-snug">
					{label ? (
						<label
							htmlFor={checkboxId}
							className={cn(
								'text-xs font-medium text-foreground select-none',
								disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
							)}
						>
							{label}
						</label>
					) : null}
					{description ? <p className="text-[11px] text-muted-foreground">{description}</p> : null}
				</div>
			) : null}
		</div>
	);
}
