import React from 'react';
import { cn, DynamicIcon } from '../../lib/utils';

export interface StepperStep {
	id: string;
	title: string;
	description?: string;
	icon?: string;
	status?: 'completed' | 'current' | 'upcoming' | 'error';
	disabled?: boolean;
}

export interface StepperProps {
	steps: StepperStep[];
	currentStep?: number;
	orientation?: 'horizontal' | 'vertical';
	onStepClick?: (index: number, step: StepperStep) => void;
	className?: string;
}

export function Stepper({
	steps,
	currentStep = 0,
	orientation = 'horizontal',
	onStepClick,
	className,
}: StepperProps): React.ReactElement {
	return (
		<ol
			className={cn(
				orientation === 'vertical'
					? 'flex flex-col gap-3'
					: 'flex flex-wrap items-center gap-3 sm:gap-4',
				className
			)}
		>
			{steps.map((step, index) => {
				const resolvedStatus =
					step.status ??
					(index < currentStep ? 'completed' : index === currentStep ? 'current' : 'upcoming');
				const clickable = typeof onStepClick === 'function' && !step.disabled;

				const badgeCls = cn(
					'inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors',
					resolvedStatus === 'completed' && 'border-primary bg-primary text-primary-foreground',
					resolvedStatus === 'current' && 'border-primary bg-primary/12 text-primary-ink ring-2 ring-primary/20',
					resolvedStatus === 'error' && 'border-destructive bg-destructive/12 text-destructive',
					resolvedStatus === 'upcoming' && 'border-border bg-muted text-muted-foreground'
				);

				const content = (
					<div className="flex items-center gap-2.5 text-left">
						<span className={badgeCls} aria-hidden="true">
							{resolvedStatus === 'completed' ? (
								<DynamicIcon name="check" className="size-3.5" />
							) : resolvedStatus === 'error' ? (
								<DynamicIcon name="alert-circle" className="size-3.5" />
							) : step.icon ? (
								<DynamicIcon name={step.icon} className="size-3.5" />
							) : (
								index + 1
							)}
						</span>
						<div className="min-w-0">
							<div
								className={cn(
									'truncate text-xs font-medium',
									resolvedStatus === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'
								)}
							>
								{step.title}
							</div>
							{step.description ? (
								<div className="truncate text-[11px] text-muted-foreground">{step.description}</div>
							) : null}
						</div>
					</div>
				);

				return (
					<li
						key={step.id}
						aria-current={resolvedStatus === 'current' ? 'step' : undefined}
						className={cn(
							'flex items-center gap-3',
							orientation === 'horizontal' && index < steps.length - 1 && 'flex-1 min-w-0'
						)}
					>
						{clickable ? (
							<button
								type="button"
								onClick={() => onStepClick(index, step)}
								className="rounded-md p-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
							>
								{content}
							</button>
						) : (
							content
						)}
						{orientation === 'horizontal' && index < steps.length - 1 ? (
							<span
								aria-hidden="true"
								className={cn(
									'hidden h-px flex-1 sm:block',
									index < currentStep ? 'bg-primary' : 'bg-border'
								)}
							/>
						) : null}
					</li>
				);
			})}
		</ol>
	);
}
