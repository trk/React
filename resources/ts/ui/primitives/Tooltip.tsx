import React, { createContext, useCallback, useContext, useState } from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { cn } from '../../lib/utils';
import { getPortalContainer } from '../../portal/PortalRoot';

interface TooltipAnchorContextValue {
	triggerEl: HTMLElement | null;
	setTriggerEl: (el: HTMLElement | null) => void;
}

const TooltipAnchorContext = createContext<TooltipAnchorContextValue>({
	triggerEl: null,
	setTriggerEl: () => {},
});

export interface TooltipProviderProps {
	delay?: number;
	closeDelay?: number;
	children?: React.ReactNode;
}

export function TooltipProvider({
	delay = 350,
	closeDelay = 0,
	children,
}: TooltipProviderProps): React.ReactElement {
	return (
		<BaseTooltip.Provider delay={delay} closeDelay={closeDelay}>
			{children}
		</BaseTooltip.Provider>
	);
}

export interface TooltipProps {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	disabled?: boolean;
	children?: React.ReactNode;
}

export function Tooltip({
	open,
	defaultOpen,
	onOpenChange,
	disabled,
	children,
}: TooltipProps): React.ReactElement {
	const [triggerEl, setTriggerEl] = useState<HTMLElement | null>(null);

	return (
		<TooltipAnchorContext.Provider value={{ triggerEl, setTriggerEl }}>
			<BaseTooltip.Root
				open={open}
				defaultOpen={defaultOpen}
				disabled={disabled}
				onOpenChange={(next) => onOpenChange?.(next)}
			>
				{children}
			</BaseTooltip.Root>
		</TooltipAnchorContext.Provider>
	);
}

export interface TooltipTriggerProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
	render?: React.ReactElement;
	asChild?: boolean;
	delay?: number;
	closeDelay?: number;
}

export const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipTriggerProps>(
	({ render, asChild = false, delay, closeDelay, children, ...props }, forwardedRef) => {
		const { setTriggerEl } = useContext(TooltipAnchorContext);
		const refCallback = useCallback(
			(node: HTMLButtonElement | null) => {
				setTriggerEl(node);
				if (typeof forwardedRef === 'function') {
					forwardedRef(node);
				} else if (forwardedRef && typeof forwardedRef === 'object') {
					(forwardedRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
				}
			},
			[forwardedRef, setTriggerEl]
		);

		const resolvedRender =
			render ?? (asChild && React.isValidElement(children) ? (children as React.ReactElement) : undefined);

		return (
			<BaseTooltip.Trigger
				ref={refCallback}
				delay={delay}
				closeDelay={closeDelay}
				render={resolvedRender}
				{...(props as Record<string, unknown>)}
			>
				{resolvedRender && !render ? undefined : children}
			</BaseTooltip.Trigger>
		);
	}
);
TooltipTrigger.displayName = 'TooltipTrigger';

export interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
	side?: 'top' | 'bottom' | 'left' | 'right';
	align?: 'start' | 'center' | 'end';
	sideOffset?: number;
}

export function TooltipContent({
	side = 'top',
	align = 'center',
	sideOffset = 6,
	className,
	children,
	...props
}: TooltipContentProps): React.ReactElement {
	const { triggerEl } = useContext(TooltipAnchorContext);

	return (
		<BaseTooltip.Portal container={getPortalContainer(triggerEl)}>
			<BaseTooltip.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
				<BaseTooltip.Popup
					data-rw-portal-overlay=""
					className={cn(
						'z-50 max-w-xs rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-md transition-opacity duration-120 motion-reduce:transition-none data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
						className
					)}
					{...(props as Record<string, unknown>)}
				>
					{children}
				</BaseTooltip.Popup>
			</BaseTooltip.Positioner>
		</BaseTooltip.Portal>
	);
}
