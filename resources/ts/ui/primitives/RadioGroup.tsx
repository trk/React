import React, { useId } from 'react';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { Radio as BaseRadio } from '@base-ui/react/radio';
import { cn } from '../../lib/utils';

export interface RadioGroupProps {
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
	readOnly?: boolean;
	name?: string;
	orientation?: 'horizontal' | 'vertical';
	'aria-label'?: string;
	className?: string;
	children?: React.ReactNode;
}

export function RadioGroup({
	value,
	defaultValue,
	onValueChange,
	disabled = false,
	required = false,
	readOnly = false,
	name,
	orientation = 'vertical',
	'aria-label': ariaLabel,
	className,
	children,
}: RadioGroupProps): React.ReactElement {
	return (
		<BaseRadioGroup
			value={value}
			defaultValue={defaultValue}
			disabled={disabled}
			required={required}
			readOnly={readOnly}
			name={name}
			aria-label={ariaLabel}
			data-orientation={orientation}
			onValueChange={(nextValue) => {
				if (nextValue !== null && nextValue !== undefined) {
					onValueChange?.(String(nextValue));
				}
			}}
			className={cn(
				orientation === 'horizontal' ? 'flex flex-wrap items-center gap-4' : 'grid gap-2.5',
				className
			)}
		>
			{children}
		</BaseRadioGroup>
	);
}

export interface RadioGroupItemProps {
	value: string;
	label?: React.ReactNode;
	description?: React.ReactNode;
	disabled?: boolean;
	required?: boolean;
	id?: string;
	'aria-label'?: string;
	className?: string;
}

export function RadioGroupItem({
	value,
	label,
	description,
	disabled = false,
	required = false,
	id,
	'aria-label': ariaLabel,
	className,
}: RadioGroupItemProps): React.ReactElement {
	const generatedId = useId();
	const radioId = id ?? generatedId;

	return (
		<div className={cn('flex items-start gap-2.5', className)}>
			<BaseRadio.Root
				id={radioId}
				value={value}
				disabled={disabled}
				required={required}
				nativeButton
				render={<button type="button" />}
				aria-label={ariaLabel}
				className="mt-0.5 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-input bg-input-surface shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[checked]:border-primary data-[checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
			>
				<BaseRadio.Indicator className="flex items-center justify-center">
					<span className="size-1.5 rounded-full bg-primary-foreground" aria-hidden="true" />
				</BaseRadio.Indicator>
			</BaseRadio.Root>
			{label || description ? (
				<div className="grid gap-0.5 leading-snug">
					{label ? (
						<label
							htmlFor={radioId}
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
