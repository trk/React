import React, { createContext, useCallback, useContext, useState } from 'react';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { visitSameModuleHref, withWorkspaceShellUrl } from '../../lib/inertia-bridge';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../../lib/utils';
import { getPortalContainer } from '../../portal/PortalRoot';

interface MenuAnchorContextValue {
	triggerEl: HTMLElement | null;
	setTriggerEl: (el: HTMLElement | null) => void;
}

const MenuAnchorContext = createContext<MenuAnchorContextValue>({
	triggerEl: null,
	setTriggerEl: () => {},
});

export interface MenuProps {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	modal?: boolean;
	children?: React.ReactNode;
}

export function Menu({
	open,
	defaultOpen,
	onOpenChange,
	modal = false,
	children,
}: MenuProps): React.ReactElement {
	const [triggerEl, setTriggerEl] = useState<HTMLElement | null>(null);

	return (
		<MenuAnchorContext.Provider value={{ triggerEl, setTriggerEl }}>
			<BaseMenu.Root
				open={open}
				defaultOpen={defaultOpen}
				modal={modal}
				onOpenChange={(next) => onOpenChange?.(next)}
			>
				{children}
			</BaseMenu.Root>
		</MenuAnchorContext.Provider>
	);
}

export interface MenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	render?: React.ReactElement;
	asChild?: boolean;
}

export const MenuTrigger = React.forwardRef<HTMLButtonElement, MenuTriggerProps>(
	({ render, asChild = false, children, ...props }, forwardedRef) => {
		const { setTriggerEl } = useContext(MenuAnchorContext);
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
			<BaseMenu.Trigger
				ref={refCallback}
				render={resolvedRender}
				{...(props as Record<string, unknown>)}
			>
				{resolvedRender && !render ? undefined : children}
			</BaseMenu.Trigger>
		);
	}
);
MenuTrigger.displayName = 'MenuTrigger';

export interface MenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
	side?: 'top' | 'bottom' | 'left' | 'right';
	align?: 'start' | 'center' | 'end';
	sideOffset?: number;
}

export function MenuContent({
	side = 'bottom',
	align = 'end',
	sideOffset = 4,
	className,
	children,
	...props
}: MenuContentProps): React.ReactElement {
	const { triggerEl } = useContext(MenuAnchorContext);

	return (
		<BaseMenu.Portal container={getPortalContainer(triggerEl)}>
			<BaseMenu.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
				<BaseMenu.Popup
					data-rw-portal-overlay=""
					className={cn(
						'z-50 min-w-44 max-w-64 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-[opacity,transform] duration-120 motion-reduce:transition-none data-[starting-style]:scale-97 data-[starting-style]:opacity-0 data-[ending-style]:scale-97 data-[ending-style]:opacity-0',
						className
					)}
					{...(props as Record<string, unknown>)}
				>
					{children}
				</BaseMenu.Popup>
			</BaseMenu.Positioner>
		</BaseMenu.Portal>
	);
}

export interface MenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: 'default' | 'danger';
	active?: boolean;
	disabled?: boolean;
	closeOnClick?: boolean;
	label?: string;
	render?: React.ReactElement;
}

export function MenuItem({
	variant = 'default',
	active = false,
	disabled = false,
	closeOnClick = true,
	className,
	children,
	...props
}: MenuItemProps): React.ReactElement {
	const isDanger = variant === 'danger';
	return (
		<BaseMenu.Item
			disabled={disabled}
			closeOnClick={closeOnClick}
			className={cn(
				'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors outline-none cursor-pointer select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
				isDanger
					? 'text-destructive data-[highlighted]:bg-destructive/10'
					: active
						? 'bg-primary/10 text-primary-ink data-[highlighted]:bg-primary/15'
						: 'text-popover-foreground data-[highlighted]:bg-muted',
				className
			)}
			{...(props as Record<string, unknown>)}
		>
			{children}
		</BaseMenu.Item>
	);
}

export function MenuSeparator({ className }: { className?: string }): React.ReactElement {
	return <BaseMenu.Separator className={cn('my-1 h-px bg-border', className)} />;
}

export function MenuGroup({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	return <BaseMenu.Group className={cn('space-y-0.5', className)} {...props} />;
}

export function MenuGroupLabel({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	return (
		<BaseMenu.GroupLabel
			className={cn(
				'px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase select-none',
				className
			)}
			{...props}
		/>
	);
}

export interface DropdownMenuItem {
	key: string;
	label: string;
	icon?: string;
	badge?: string;
	active?: boolean;
	sectionLabel?: string;
	variant?: 'default' | 'danger';
	separatorBefore?: boolean;
	disabled?: boolean;
	href?: string;
	target?: string;
	download?: string | boolean;
	dataAttrs?: Record<string, string>;
	onSelect?: () => void;
}

export interface DropdownMenuProps {
	items: DropdownMenuItem[];
	trigger?: React.ReactNode;
	triggerIcon?: string;
	triggerLabel?: string;
	triggerAriaLabel?: string;
	triggerClassName?: string;
	triggerDataAttr?: string;
	align?: 'end' | 'start';
	disabled?: boolean;
	className?: string;
}

export function DropdownMenu({
	items,
	trigger,
	triggerIcon = 'more-horizontal',
	triggerLabel,
	triggerAriaLabel,
	triggerClassName,
	triggerDataAttr,
	align = 'end',
	disabled = false,
	className,
}: DropdownMenuProps): React.ReactElement | null {
	const [open, setOpen] = useState(false);
	const visibleItems = items.filter((item) => Boolean(item && item.label));

	if (visibleItems.length === 0) {
		return null;
	}

	const resolvedAriaLabel = triggerAriaLabel ?? (!trigger && !triggerLabel ? t('common.actions', 'Actions') : undefined);
	const hasAnyIcon = visibleItems.some((item) => Boolean(item.icon));
	let seenDanger = false;

	return (
		<Menu open={open} onOpenChange={setOpen} modal={false}>
			<MenuTrigger
				disabled={disabled}
				aria-label={resolvedAriaLabel}
				data-rw-row-actions-trigger={triggerDataAttr}
				onClick={(event) => event.stopPropagation()}
				className={cn(
					'inline-flex min-h-7 min-w-7 pointer-coarse:min-h-11 pointer-coarse:min-w-11 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
					open && !triggerClassName && 'bg-muted text-foreground',
					triggerClassName
				)}
			>
				{trigger ?? (
					<>
						<DynamicIcon name={triggerIcon} className="size-4" aria-hidden="true" />
						{triggerLabel ? <span>{triggerLabel}</span> : null}
					</>
				)}
			</MenuTrigger>

			<MenuContent align={align} className={className}>
				{visibleItems.map((item, idx) => {
					const isDanger = item.variant === 'danger';
					const autoDangerSeparator = isDanger && !seenDanger && idx > 0;
					if (isDanger) {
						seenDanger = true;
					}
					const showSeparator = Boolean(item.separatorBefore || autoDangerSeparator);
					const safeItemHref = item.href ? sanitizeHref(item.href) : '';
					const safeTarget =
						typeof item.target === 'string' && item.target.trim().toLowerCase() === '_blank'
							? '_blank'
							: undefined;

					const inner = (
						<>
							{hasAnyIcon ? (
								<span className="inline-flex size-4 shrink-0 items-center justify-center">
									{item.icon ? (
										<DynamicIcon
											name={item.icon}
											className="size-3.5"
											aria-hidden="true"
										/>
									) : null}
								</span>
							) : null}
							<span className="flex-1 truncate">{item.label}</span>
							{item.badge ? (
								<span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
									{item.badge}
								</span>
							) : null}
						</>
					);

					return (
						<React.Fragment key={item.key}>
							{showSeparator ? <MenuSeparator /> : null}
							{item.sectionLabel ? (
								<div
									role="presentation"
									className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase select-none"
								>
									{item.sectionLabel}
								</div>
							) : null}
							{safeItemHref && !item.disabled ? (
								<BaseMenu.LinkItem
									href={sanitizeHref(withWorkspaceShellUrl(safeItemHref)) || safeItemHref}
									target={safeTarget}
									download={item.download}
									rel={safeTarget === '_blank' ? 'noopener noreferrer' : undefined}
									closeOnClick
									label={item.label}
									{...(item.dataAttrs || {})}
									onClick={(event) => {
										event.stopPropagation();
										setOpen(false);
										item.onSelect?.();
										if (
											!event.defaultPrevented &&
											!safeTarget &&
											!item.download &&
											event.button === 0 &&
											!event.metaKey &&
											!event.ctrlKey &&
											!event.shiftKey &&
											!event.altKey
										) {
											if (visitSameModuleHref(safeItemHref)) {
												event.preventDefault();
											}
										}
									}}
									className={cn(
										'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium no-underline transition-colors outline-none cursor-pointer select-none',
										isDanger
											? 'text-destructive data-[highlighted]:bg-destructive/10'
											: item.active
												? 'bg-primary/10 text-primary-ink data-[highlighted]:bg-primary/15'
												: 'text-popover-foreground data-[highlighted]:bg-muted'
									)}
								>
									{inner}
								</BaseMenu.LinkItem>
							) : (
								<MenuItem
									variant={isDanger ? 'danger' : 'default'}
									active={item.active}
									disabled={item.disabled}
									label={item.label}
									{...(item.dataAttrs || {})}
									onClick={(event) => {
										event.stopPropagation();
										if (item.disabled) {
											return;
										}
										setOpen(false);
										item.onSelect?.();
									}}
								>
									{inner}
								</MenuItem>
							)}
						</React.Fragment>
					);
				})}
			</MenuContent>
		</Menu>
	);
}
