import React from 'react';
import { cn, DynamicIcon } from '../../lib/utils';
import { Card } from '../primitives/Card';
import { Progress } from '../primitives/Progress';

export interface StatCardProps {
	label?: string;
	value: React.ReactNode;
	caption?: React.ReactNode;
	hint?: React.ReactNode;
	icon?: string;
	variant?: 'primary' | 'success' | 'warning' | 'danger' | 'muted' | 'default';
	tone?: 'primary' | 'success' | 'warning' | 'danger' | 'muted' | 'default';
	progress?: number;
	onClick?: () => void;
}

export function StatCard({
	label,
	value,
	caption,
	hint,
	icon,
	variant,
	tone,
	progress,
	onClick,
}: StatCardProps): React.ReactElement {
	const rawVariant = variant || tone || 'primary';
	const resolvedVariant: 'primary' | 'success' | 'warning' | 'danger' | 'muted' =
		rawVariant === 'default' ? 'primary' : rawVariant;
	const resolvedLabel = label ?? '';
	const resolvedCaption = caption ?? hint;
	const isInteractive = typeof onClick === 'function';
	return (
		<Card
			role={isInteractive ? 'button' : undefined}
			tabIndex={isInteractive ? 0 : undefined}
			onClick={onClick}
			onKeyDown={
				isInteractive
					? (e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onClick();
							}
						}
					: undefined
			}
			className={cn(
				'group p-4 transition-colors',
				isInteractive &&
					'cursor-pointer hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
					<span>{resolvedLabel}</span>
					{isInteractive ? (
						<DynamicIcon
							name="arrow-up-right"
							className="size-3 opacity-0 transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80 motion-reduce:transition-none"
						/>
					) : null}
				</span>
				{icon ? (
					<span
						className={cn(
							'inline-flex size-7 items-center justify-center rounded-md',
							resolvedVariant === 'primary' && 'bg-primary/10 text-primary',
							resolvedVariant === 'success' && 'bg-success/12 text-success',
							resolvedVariant === 'warning' && 'bg-warning/12 text-warning',
							resolvedVariant === 'danger' && 'bg-destructive/12 text-destructive',
							resolvedVariant === 'muted' && 'bg-muted text-muted-foreground'
						)}
					>
						<DynamicIcon name={icon} className="size-3.5" />
					</span>
				) : null}
			</div>
			<div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
				{value}
			</div>
			{typeof progress === 'number' ? (
				<Progress
					value={progress}
					variant={resolvedVariant === 'muted' ? 'primary' : resolvedVariant}
					label={label}
					className="mt-2.5 h-1.5"
				/>
			) : null}
			{resolvedCaption ? <div className="mt-2 text-xs text-muted-foreground">{resolvedCaption}</div> : null}
		</Card>
	);
}
