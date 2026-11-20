import React from 'react';
import { cn } from '../../lib/utils';

export interface SelectOption {
	value: string | number;
	label: string;
	disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
	options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
	({ className, options, children, ...props }, ref) => (
		<select
			ref={ref}
			data-rw-select=""
			className={cn(
				'flex h-9 w-full rounded-md border border-input bg-input-surface px-3 py-1.5 text-sm text-foreground shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
				className
			)}
			{...props}
		>
			{options?.map((opt) => (
				<option key={String(opt.value)} value={String(opt.value)} disabled={opt.disabled}>
					{opt.label}
				</option>
			))}
			{children}
		</select>
	)
);
Select.displayName = 'Select';
