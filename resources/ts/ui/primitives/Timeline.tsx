import React from 'react';
import { cn, DynamicIcon } from '../../lib/utils';

export interface TimelineItem {
	id: string;
	title: string;
	description?: React.ReactNode;
	timestamp?: string;
	icon?: string;
	tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
	meta?: React.ReactNode;
}

export interface TimelineProps {
	items: TimelineItem[];
	className?: string;
}

export function Timeline({ items, className }: TimelineProps): React.ReactElement {
	return (
		<ol className={cn('relative space-y-4 border-s border-border ps-5', className)}>
			{items.map((item) => {
				const tone = item.tone ?? 'default';
				return (
					<li key={item.id} className="relative space-y-1">
						<span
							aria-hidden="true"
							className={cn(
								'absolute -start-[27px] top-0.5 inline-flex size-5 items-center justify-center rounded-full border bg-card',
								tone === 'primary' && 'border-primary/40 text-primary',
								tone === 'success' && 'border-success/40 text-success',
								tone === 'warning' && 'border-warning/40 text-warning',
								tone === 'danger' && 'border-destructive/40 text-destructive',
								tone === 'default' && 'border-border text-muted-foreground'
							)}
						>
							{item.icon ? (
								<DynamicIcon name={item.icon} className="size-3" />
							) : (
								<span
									className={cn(
										'size-1.5 rounded-full',
										tone === 'primary' && 'bg-primary',
										tone === 'success' && 'bg-success',
										tone === 'warning' && 'bg-warning',
										tone === 'danger' && 'bg-destructive',
										tone === 'default' && 'bg-muted-foreground'
									)}
								/>
							)}
						</span>
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<span className="text-xs font-semibold text-foreground">{item.title}</span>
							{item.timestamp ? (
								<time className="font-mono text-[11px] text-muted-foreground tabular-nums">
									{item.timestamp}
								</time>
							) : null}
						</div>
						{item.description ? (
							<div className="text-xs leading-relaxed text-muted-foreground">{item.description}</div>
						) : null}
						{item.meta ? <div className="pt-0.5">{item.meta}</div> : null}
					</li>
				);
			})}
		</ol>
	);
}
