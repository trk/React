import React, { createContext, useCallback, useContext, useState } from 'react';
import { Popover as BasePopover } from '@base-ui/react/popover';
import { cn } from '../../lib/utils';
import { getPortalContainer } from '../../portal/PortalRoot';

interface PopoverAnchorContextValue {
	triggerEl: HTMLElement | null;
	setTriggerEl: (el: HTMLElement | null) => void;
}

const PopoverAnchorContext = createContext<PopoverAnchorContextValue>({
	triggerEl: null,
	setTriggerEl: () => {},
});

export interface PopoverProps {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	modal?: boolean | 'trap-focus';
	children?: React.ReactNode;
}

export function Popover({
	open,
	defaultOpen,
	onOpenChange,
	modal = false,
	children,
}: PopoverProps): React.ReactElement {
	const [triggerEl, setTriggerEl] = useState<HTMLElement | null>(null);

	return (
		<PopoverAnchorContext.Provider value={{ triggerEl, setTriggerEl }}>
			<BasePopover.Root
				open={open}
				defaultOpen={defaultOpen}
				modal={modal}
				onOpenChange={(next) => onOpenChange?.(next)}
			>
				{children}
			</BasePopover.Root>
		</PopoverAnchorContext.Provider>
	);
}

export interface PopoverTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	render?: React.ReactElement;
	asChild?: boolean;
	nativeButton?: boolean;
}

export const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverTriggerProps>(
	({ render, asChild = false, nativeButton, children, ...props }, forwardedRef) => {
		const { setTriggerEl } = useContext(PopoverAnchorContext);
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
			<BasePopover.Trigger
				ref={refCallback}
				render={resolvedRender}
				nativeButton={nativeButton}
				{...(props as Record<string, unknown>)}
			>
				{resolvedRender && !render ? undefined : children}
			</BasePopover.Trigger>
		);
	}
);
PopoverTrigger.displayName = 'PopoverTrigger';

export interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
	side?: 'top' | 'bottom' | 'left' | 'right';
	align?: 'start' | 'center' | 'end';
	sideOffset?: number;
}

export function PopoverContent({
	side = 'bottom',
	align = 'center',
	sideOffset = 6,
	className,
	children,
	...props
}: PopoverContentProps): React.ReactElement {
	const { triggerEl } = useContext(PopoverAnchorContext);

	return (
		<BasePopover.Portal container={getPortalContainer(triggerEl)}>
			<BasePopover.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
				<BasePopover.Popup
					data-rw-portal-overlay=""
					className={cn(
						'z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover p-3.5 text-popover-foreground shadow-lg outline-none transition-[opacity,transform] duration-140 motion-reduce:transition-none data-[starting-style]:scale-97 data-[starting-style]:opacity-0 data-[ending-style]:scale-97 data-[ending-style]:opacity-0',
						className
					)}
					{...(props as Record<string, unknown>)}
				>
					{children}
				</BasePopover.Popup>
			</BasePopover.Positioner>
		</BasePopover.Portal>
	);
}

export function PopoverTitle({
	className,
	...props
}: React.HTMLAttributes<HTMLHeadingElement>): React.ReactElement {
	return <BasePopover.Title className={cn('text-sm font-semibold text-foreground', className)} {...props} />;
}

export function PopoverDescription({
	className,
	...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.ReactElement {
	return <BasePopover.Description className={cn('text-xs text-muted-foreground', className)} {...props} />;
}

export function PopoverClose({
	className,
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
	return (
		<BasePopover.Close
			className={cn(
				'inline-flex items-center justify-center rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
				className
			)}
			{...(props as Record<string, unknown>)}
		/>
	);
}
