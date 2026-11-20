import React, { useId } from 'react';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { cn } from '../../lib/utils';

export interface SwitchProps {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	label?: string;
	description?: string;
	disabled?: boolean;
	name?: string;
	value?: string;
	required?: boolean;
	id?: string;
	'aria-label'?: string;
	className?: string;
}

export function Switch({
	checked,
	onCheckedChange,
	label,
	description,
	disabled,
	name,
	value,
	required,
	id,
	'aria-label': ariaLabel,
	className,
}: SwitchProps): React.ReactElement {
	const generatedId = useId();
	const switchId = id ?? generatedId;

	return (
		<div className={cn('flex items-center gap-2.5', className)}>
			<BaseSwitch.Root
				id={switchId}
				checked={checked}
				disabled={disabled}
				name={name}
				value={value}
				required={required}
				nativeButton
				render={<button type="button" />}
				aria-label={ariaLabel}
				onCheckedChange={(next) => {
					if (!disabled) {
						onCheckedChange(next);
					}
				}}
				className="peer inline-flex min-h-6 min-w-9 pointer-coarse:min-h-11 pointer-coarse:min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
			>
				<span
					aria-hidden="true"
					className={cn(
						'inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent transition-colors',
						checked ? 'bg-primary' : 'bg-muted-foreground/30'
					)}
				>
					<BaseSwitch.Thumb
						className={cn(
							'pointer-events-none block size-4 rounded-full bg-background shadow-xs motion-safe:transition-transform',
							checked ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0'
						)}
					/>
				</span>
			</BaseSwitch.Root>
			{label || description ? (
				<div className="grid gap-0.5 leading-none">
					{label ? (
						<label
							htmlFor={switchId}
							className="cursor-pointer text-xs font-medium text-foreground"
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
