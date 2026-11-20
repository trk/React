import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn, DynamicIcon } from '../../lib/utils';

export const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
	{
		variants: {
			variant: {
				default:
					'border border-[var(--button-border)] bg-[var(--button-bg)] text-[var(--button-fg)] shadow-xs hover:border-[var(--button-hover-border)] hover:bg-[var(--button-hover-bg)] hover:text-[var(--button-hover-fg)]',
				primary:
					'border border-[var(--button-border)] bg-[var(--button-bg)] text-[var(--button-fg)] shadow-xs hover:border-[var(--button-hover-border)] hover:bg-[var(--button-hover-bg)] hover:text-[var(--button-hover-fg)]',
				destructive:
					'border border-transparent bg-[var(--destructive-solid,var(--destructive))] text-destructive-foreground shadow-xs hover:brightness-110',
				danger:
					'border border-transparent bg-[var(--destructive-solid,var(--destructive))] text-destructive-foreground shadow-xs hover:brightness-110',
				warning: 'bg-warning text-warning-foreground shadow-xs hover:opacity-90',
				outline:
					'border border-border bg-card text-foreground shadow-2xs hover:border-primary hover:bg-muted/70 hover:text-foreground',
				secondary:
					'border border-[var(--pw-button-muted-border,transparent)] bg-[var(--button-muted-bg)] text-[var(--button-muted-fg)] hover:bg-[var(--button-hover-bg)] hover:text-[var(--button-hover-fg)]',
				ghost: 'text-foreground hover:bg-muted',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-9 rounded-[var(--radius-button)] px-4 py-2',
				xs: 'h-7 rounded-[var(--radius-button)] px-3 text-xs',
				sm: 'h-8 rounded-[var(--radius-button)] px-3.5 text-xs',
				md: 'h-9 rounded-[var(--radius-button)] px-4 py-2 text-sm',
				lg: 'h-10 rounded-[var(--radius-button)] px-5 text-sm',
				icon: 'size-9 rounded-md',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	}
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	icon?: string;
	asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, icon, asChild = false, children, type = 'button', ...props }, ref) => {
		if (asChild && React.isValidElement(children)) {
			const childElement = children as React.ReactElement<
				Record<string, unknown> & { children?: React.ReactNode; className?: string }
			>;
			const innerChildren = icon ? (
				<>
					<DynamicIcon name={icon} className="size-3.5 shrink-0" aria-hidden="true" />
					{childElement.props?.children}
				</>
			) : (
				childElement.props?.children
			);
			return React.cloneElement(
				childElement,
				{
					...props,
					className: cn(buttonVariants({ variant, size, className }), childElement.props?.className),
				},
				innerChildren
			);
		}

		return (
			<button
				ref={ref}
				type={type}
				className={cn(buttonVariants({ variant, size, className }))}
				{...props}
			>
				{icon ? <DynamicIcon name={icon} className="size-3.5 shrink-0" aria-hidden="true" /> : null}
				{children}
			</button>
		);
	}
);
Button.displayName = 'Button';
