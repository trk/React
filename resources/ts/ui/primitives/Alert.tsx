import React from 'react';
import { cn, DynamicIcon } from '../../lib/utils';

export function AlertTitle({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	return <div className={cn('font-semibold leading-none tracking-tight', className)} {...props} />;
}

export function AlertDescription({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	return <div className={cn('text-xs leading-relaxed text-foreground/90', className)} {...props} />;
}

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'destructive';
	title?: string;
	icon?: string;
}

export function Alert({
	className,
	variant = 'default',
	title,
	icon,
	children,
	...props
}: AlertProps): React.ReactElement {
	const defaultIcon =
		icon ||
		(variant === 'success'
			? 'check-circle'
			: variant === 'warning'
				? 'warning'
				: variant === 'danger' || variant === 'destructive'
					? 'exclamation-circle'
					: 'info');

	const accentClass =
		variant === 'success'
			? 'text-success'
			: variant === 'warning'
				? 'text-warning'
				: variant === 'danger' || variant === 'destructive'
					? 'text-destructive'
					: variant === 'primary'
						? 'text-primary-ink'
						: 'text-muted-foreground';

	return (
		<div
			role="alert"
			className={cn(
				'relative flex w-full items-start gap-3 rounded-lg border p-4 text-sm text-foreground',
				(variant === 'default' || variant === 'primary') &&
					'border-border bg-card',
				variant === 'success' &&
					'border-success/35 bg-success/10',
				variant === 'warning' &&
					'border-warning/35 bg-warning/10',
				(variant === 'danger' || variant === 'destructive') &&
					'border-destructive/35 bg-destructive/10',
				className
			)}
			{...props}
		>
			<DynamicIcon name={defaultIcon} className={cn('mt-0.5 size-4 shrink-0', accentClass)} aria-hidden="true" />
			<div className="flex-1 space-y-1">
				{title ? <AlertTitle className={accentClass}>{title}</AlertTitle> : null}
				{title ? (
					<AlertDescription>{children}</AlertDescription>
				) : (
					<div className="text-xs leading-relaxed text-foreground">{children}</div>
				)}
			</div>
		</div>
	);
}
