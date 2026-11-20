import React from 'react';
import { cn } from '../../lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
	value: number;
	max?: number;
	variant?: 'primary' | 'success' | 'warning' | 'danger';
	label?: string;
}

export function Progress({
	value,
	max = 100,
	variant = 'primary',
	label,
	className,
	...props
}: ProgressProps): React.ReactElement {
	const safeMax = max > 0 ? max : 100;
	const pct = Math.max(0, Math.min(100, Math.round((value / safeMax) * 100)));
	return (
		<div
			role="progressbar"
			aria-valuenow={value}
			aria-valuemin={0}
			aria-valuemax={safeMax}
			aria-label={label}
			className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
			{...props}
		>
			<div
				className={cn(
					'h-full motion-safe:transition-[width] motion-safe:duration-300',
					variant === 'primary' && 'bg-primary',
					variant === 'success' && 'bg-success',
					variant === 'warning' && 'bg-warning',
					variant === 'danger' && 'bg-destructive'
				)}
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}
