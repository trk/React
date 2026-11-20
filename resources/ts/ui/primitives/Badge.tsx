import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn, DynamicIcon } from '../../lib/utils';

export const badgeVariants = cva(
	'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
	{
		variants: {
			variant: {
				default: 'border-transparent bg-primary/12 text-primary-ink',
				primary: 'border-transparent bg-primary/12 text-primary-ink',
				secondary: 'border-border bg-muted text-foreground',
				muted: 'border-border bg-muted/60 text-muted-foreground',
				outline: 'border-border bg-transparent text-foreground',
				success: 'border-success/25 bg-success/12 text-success',
				warning: 'border-warning/25 bg-warning/12 text-warning',
				danger: 'border-destructive/25 bg-destructive/12 text-destructive',
				destructive: 'border-destructive/25 bg-destructive/12 text-destructive',
			},
		},
		defaultVariants: {
			variant: 'secondary',
		},
	}
);

export interface BadgeProps
	extends React.HTMLAttributes<HTMLSpanElement>,
		VariantProps<typeof badgeVariants> {
	icon?: string;
	dot?: boolean;
	mono?: boolean;
}

export function Badge({
	className,
	variant,
	icon,
	dot,
	mono,
	children,
	...props
}: BadgeProps): React.ReactElement {
	return (
		<span
			className={cn(badgeVariants({ variant }), mono && 'font-mono text-[11px]', className)}
			{...props}
		>
			{dot ? (
				<span
					className={cn(
						'size-1.5 rounded-full',
						variant === 'success' && 'bg-success',
						variant === 'warning' && 'bg-warning',
						(variant === 'danger' || variant === 'destructive') && 'bg-destructive',
						(variant === 'primary' || variant === 'default') && 'bg-primary',
						(!variant || variant === 'secondary' || variant === 'muted' || variant === 'outline') &&
							'bg-muted-foreground'
					)}
				/>
			) : null}
			{icon ? <DynamicIcon name={icon} className="size-3" /> : null}
			{children}
		</span>
	);
}
