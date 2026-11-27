import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { PortalRoot } from '../../portal/PortalRoot';
import { useModalDialogController } from './Dialog';

interface CommandCtxValue {
	listId: string;
	activeId: string;
	setActiveId: React.Dispatch<React.SetStateAction<string>>;
	listRef: React.RefObject<HTMLDivElement | null>;
}

const CommandCtx = createContext<CommandCtxValue | null>(null);

export interface CommandDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	label?: string;
	children?: React.ReactNode;
	className?: string;
}

export function CommandDialog({
	open,
	onOpenChange,
	label,
	children,
	className,
}: CommandDialogProps): React.ReactElement | null {
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const listId = useId();
	const [activeId, setActiveId] = useState('');
	const { handlePointerDown, handlePointerUp, handleClose } = useModalDialogController(
		dialogRef,
		open,
		onOpenChange
	);

	if (!open) {
		return null;
	}

	return (
		<PortalRoot>
			<dialog
				ref={dialogRef}
				aria-label={label ?? t('shell.quickSwitcher', 'Quick Switcher')}
				data-rw-command-dialog=""
				data-rw-command-palette=""
				data-rw-portal-overlay=""
				{...({ closedby: 'any' } as Record<string, string>)}
				onPointerDown={handlePointerDown}
				onPointerUp={handlePointerUp}
				onClose={handleClose}
				className={cn('text-popover-foreground', className)}
			>
				<CommandCtx.Provider value={{ listId, activeId, setActiveId, listRef }}>
					{children}
				</CommandCtx.Provider>
			</dialog>
		</PortalRoot>
	);
}

export interface CommandInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
	onClose?: () => void;
}

export function CommandInput({
	onClose,
	onKeyDown,
	onChange,
	className,
	...props
}: CommandInputProps): React.ReactElement {
	const ctx = useContext(CommandCtx);
	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		onKeyDown?.(e);
		if (e.defaultPrevented || !ctx?.listRef.current) {
			return;
		}
		const opts = Array.from(
			ctx.listRef.current.querySelectorAll<HTMLButtonElement>('[role="option"]:not([disabled]):not([aria-disabled="true"])')
		);
		if (opts.length === 0) {
			return;
		}
		const cur = opts.findIndex((el) => el.id === ctx.activeId);
		let next = -1;
		if (e.key === 'ArrowDown') {
			next = cur < 0 ? 0 : (cur + 1) % opts.length;
		} else if (e.key === 'ArrowUp') {
			next = cur <= 0 ? opts.length - 1 : cur - 1;
		} else if (e.key === 'Home') {
			next = 0;
		} else if (e.key === 'End') {
			next = opts.length - 1;
		} else if (e.key === 'Enter' && cur >= 0) {
			e.preventDefault();
			opts[cur]?.click();
			return;
		}
		if (next >= 0) {
			e.preventDefault();
			const target = opts[next];
			if (target?.id) {
				ctx.setActiveId(target.id);
				target.scrollIntoView?.({ block: 'nearest' });
			}
		}
	};

	return (
		<div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
			<DynamicIcon name="search" className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
			<input
				type="search"
				role="combobox"
				aria-expanded={true}
				aria-controls={props['aria-controls'] ?? ctx?.listId}
				aria-activedescendant={props['aria-activedescendant'] ?? (ctx?.activeId || undefined)}
				onKeyDown={handleKeyDown}
				onChange={(e) => {
					ctx?.setActiveId('');
					onChange?.(e);
				}}
				className={cn(
					'w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none',
					className
				)}
				{...props}
			/>
			{onClose ? (
				<button
					type="button"
					onClick={onClose}
					aria-label={t('common.close', 'Close')}
					className="inline-flex min-h-6 items-center rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
				>
					ESC
				</button>
			) : null}
		</div>
	);
}

export function CommandList({
	id,
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	const ctx = useContext(CommandCtx);
	return (
		<div
			ref={ctx?.listRef}
			id={id ?? ctx?.listId}
			role="listbox"
			className={cn('max-h-80 overflow-y-auto p-2 divide-y divide-border/40', className)}
			{...props}
		/>
	);
}

export function CommandEmpty({
	className,
	children,
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	return (
		<div className={cn('py-6 text-center text-xs text-muted-foreground', className)}>
			{children ?? t('common.noResults', 'No matching results found.')}
		</div>
	);
}

export function CommandGroup({
	heading,
	className,
	children,
}: {
	heading?: string;
	className?: string;
	children?: React.ReactNode;
}): React.ReactElement {
	const headingId = useId();
	return (
		<div role="group" aria-labelledby={heading ? headingId : undefined} className={cn('py-1', className)}>
			{heading ? (
				<div
					id={headingId}
					className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
				>
					{heading}
				</div>
			) : null}
			{children}
		</div>
	);
}

export interface CommandItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	active?: boolean;
	icon?: string;
	subtitle?: string;
	shortcut?: string;
}

export function CommandItem({
	id,
	active,
	icon,
	subtitle,
	shortcut,
	className,
	children,
	type = 'button',
	onMouseEnter,
	...props
}: CommandItemProps): React.ReactElement {
	const ctx = useContext(CommandCtx);
	const setActiveId = ctx?.setActiveId;
	const fallbackId = useId();
	const itemId = id ?? fallbackId;
	const isSelected = active ?? Boolean(ctx && ctx.activeId === itemId);

	useEffect(
		() => () => setActiveId?.((cur) => (cur === itemId ? '' : cur)),
		[setActiveId, itemId]
	);

	return (
		<button
			type={type}
			id={itemId}
			role="option"
			tabIndex={-1}
			aria-selected={isSelected}
			onMouseEnter={(e) => {
				ctx?.setActiveId(itemId);
				onMouseEnter?.(e);
			}}
			className={cn(
				'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
				isSelected ? 'bg-muted text-foreground' : 'hover:bg-muted/60 text-foreground',
				className
			)}
			{...props}
		>
			{icon ? (
				<span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
					<DynamicIcon name={icon} className="size-3.5" aria-hidden="true" />
				</span>
			) : null}
			<span className="min-w-0 flex-1">
				<span className="block truncate text-xs font-medium">{children}</span>
				{subtitle ? <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span> : null}
			</span>
			{shortcut ? (
				<kbd className="ml-auto shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
					{shortcut}
				</kbd>
			) : null}
		</button>
	);
}
