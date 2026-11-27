import React, { useId, useLayoutEffect, useRef } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { PortalRoot } from '../../portal/PortalRoot';
import { Button } from './Button';

/**
 * Synchronize a native `<dialog>` with React `open` state via `.showModal()` and
 * attach a pointer-coordinate light-dismiss fallback when `HTMLDialogElement.prototype.closedBy`
 * is unavailable, requiring both press and release outside the dialog bounds.
 */
export function useModalDialogController(
	dialogRef: React.RefObject<HTMLDialogElement | null>,
	open: boolean,
	onOpenChange: (open: boolean) => void
): {
	handlePointerDown: (e: React.PointerEvent<HTMLDialogElement>) => void;
	handlePointerUp: (e: React.PointerEvent<HTMLDialogElement>) => void;
	handleClose: () => void;
} {
	const pressedOutsideRef = useRef(false);
	const previousFocusRef = useRef<HTMLElement | null>(null);

	useLayoutEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog || !open) {
			return;
		}
		previousFocusRef.current =
			typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		if (!dialog.open && typeof dialog.showModal === 'function') {
			try {
				dialog.showModal();
			} catch {
				dialog.setAttribute('open', '');
			}
		}
		return () => {
			if (dialog.open && typeof dialog.close === 'function') {
				try {
					dialog.close();
				} catch {
					dialog.removeAttribute('open');
				}
			}
			const prev = previousFocusRef.current;
			previousFocusRef.current = null;
			if (prev && prev.isConnected && typeof prev.focus === 'function') {
				prev.focus();
			}
		};
	}, [dialogRef, open]);

	const isOutsideDialogBounds = (e: React.PointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement): boolean => {
		if (e.target !== dialog) {
			return false;
		}
		const rect = dialog.getBoundingClientRect();
		return (
			e.clientX < rect.left ||
			e.clientX > rect.right ||
			e.clientY < rect.top ||
			e.clientY > rect.bottom
		);
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLDialogElement>) => {
		if (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype) {
			return;
		}
		const dialog = dialogRef.current;
		if (!dialog || e.button !== 0) {
			pressedOutsideRef.current = false;
			return;
		}
		pressedOutsideRef.current = isOutsideDialogBounds(e, dialog);
	};

	const handlePointerUp = (e: React.PointerEvent<HTMLDialogElement>) => {
		if (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype) {
			return;
		}
		const dialog = dialogRef.current;
		const wasPressedOutside = pressedOutsideRef.current;
		pressedOutsideRef.current = false;
		if (dialog && wasPressedOutside && isOutsideDialogBounds(e, dialog)) {
			onOpenChange(false);
		}
	};

	const handleClose = () => {
		const dialog = dialogRef.current;
		if (dialog) {
			dialog.returnValue = '';
		}
		onOpenChange(false);
	};

	return { handlePointerDown, handlePointerUp, handleClose };
}

export type DialogTone = 'default' | 'primary' | 'warning' | 'danger';

export interface DialogProps {
	open: boolean;
	onOpenChange?: (open: boolean) => void;
	onClose?: () => void;
	title: string;
	description?: string;
	icon?: string;
	tone?: DialogTone;
	showCloseButton?: boolean;
	children?: React.ReactNode;
	footer?: React.ReactNode;
	maxWidth?: string;
}

export function Dialog({
	open,
	onOpenChange,
	onClose,
	title,
	description,
	icon,
	tone = 'default',
	showCloseButton = true,
	children,
	footer,
	maxWidth = 'max-w-lg',
}: DialogProps): React.ReactElement | null {
	const titleId = useId();
	const descId = useId();
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const handleDismiss = (nextOpen: boolean) => {
		onOpenChange?.(nextOpen);
		if (!nextOpen) {
			onClose?.();
		}
	};
	const { handlePointerDown, handlePointerUp, handleClose } = useModalDialogController(
		dialogRef,
		open,
		handleDismiss
	);

	if (!open) {
		return null;
	}

	const hasBody = children !== undefined && children !== null && children !== false;
	const hasFooter = footer !== undefined && footer !== null && footer !== false;

	const node = (
		<dialog
			ref={dialogRef}
			data-rw-modal-dialog=""
			data-rw-portal-overlay=""
			aria-labelledby={titleId}
			aria-describedby={description ? descId : undefined}
			{...({ closedby: 'any' } as Record<string, string>)}
			onPointerDown={handlePointerDown}
			onPointerUp={handlePointerUp}
			onClose={handleClose}
			className={cn('text-card-foreground', maxWidth)}
		>
			<div
				data-rw-dialog-header=""
				className={cn(
					'flex items-start justify-between gap-3.5 px-5 shrink-0',
					hasBody ? 'py-4 border-b border-border/75' : 'pt-5 pb-4'
				)}
			>
				<div className="flex min-w-0 flex-1 items-start gap-3.5">
					{icon ? (
						<span
							aria-hidden="true"
							className={cn(
								'mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border',
								tone === 'danger' && 'border-destructive/25 bg-destructive/12 text-destructive',
								tone === 'warning' && 'border-warning/25 bg-warning/12 text-warning',
								tone === 'primary' && 'border-primary/25 bg-primary/10 text-primary',
								tone === 'default' && 'border-border bg-muted text-muted-foreground'
							)}
						>
							<DynamicIcon name={icon} className="size-4" />
						</span>
					) : null}
					<div className="min-w-0 flex-1 space-y-1">
						<h2
							id={titleId}
							className="text-[15px] font-semibold leading-snug tracking-tight text-foreground text-balance"
						>
							{title}
						</h2>
						{description ? (
							<p
								id={descId}
								className="text-[13px] text-muted-foreground leading-relaxed text-pretty"
							>
								{description}
							</p>
						) : null}
					</div>
				</div>
				{showCloseButton ? (
					<button
						type="button"
						onClick={() => handleDismiss(false)}
						className="-mt-1 -mr-1.5 inline-flex size-8 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
						aria-label={t('common.close', 'Close')}
					>
						<DynamicIcon name="x" className="size-4" />
					</button>
				) : null}
			</div>

			{hasBody ? (
				<div data-rw-dialog-body="" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
					{children}
				</div>
			) : null}

			{hasFooter ? (
				<div
					data-rw-dialog-footer=""
					className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-border/75 bg-muted/30 px-5 py-3.5"
				>
					{footer}
				</div>
			) : null}
		</dialog>
	);

	return <PortalRoot>{node}</PortalRoot>;
}

export interface SheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	subtitle?: string;
	children?: React.ReactNode;
}

export function Sheet({
	open,
	onOpenChange,
	title,
	subtitle,
	children,
}: SheetProps): React.ReactElement | null {
	const titleId = useId();
	const subtitleId = useId();
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const { handlePointerDown, handlePointerUp, handleClose } = useModalDialogController(
		dialogRef,
		open,
		onOpenChange
	);

	if (!open) {
		return null;
	}

	const node = (
		<dialog
			ref={dialogRef}
			data-rw-sheet-dialog=""
			data-rw-portal-overlay=""
			aria-labelledby={titleId}
			aria-describedby={subtitle ? subtitleId : undefined}
			{...({ closedby: 'any' } as Record<string, string>)}
			onPointerDown={handlePointerDown}
			onPointerUp={handlePointerUp}
			onClose={handleClose}
			className="text-card-foreground"
		>
			<div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
				<div className="min-w-0">
					<h2 id={titleId} className="truncate text-sm font-semibold text-foreground">{title}</h2>
					{subtitle ? (
						<p id={subtitleId} className="truncate font-mono text-xs text-muted-foreground">{subtitle}</p>
					) : null}
				</div>
				<Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label={t('common.close', 'Close')}>
					<DynamicIcon name="x" className="size-4" />
				</Button>
			</div>
			<div className="flex-1 overflow-y-auto p-6">{children}</div>
		</dialog>
	);

	return <PortalRoot>{node}</PortalRoot>;
}

export interface DrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	subtitle?: string;
	icon?: string;
	side?: 'left' | 'right';
	children?: React.ReactNode;
	footer?: React.ReactNode;
	className?: string;
}

export function Drawer({
	open,
	onOpenChange,
	title,
	subtitle,
	icon,
	side = 'left',
	children,
	footer,
	className,
}: DrawerProps): React.ReactElement | null {
	const titleId = useId();
	const subtitleId = useId();
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const { handlePointerDown, handlePointerUp, handleClose } = useModalDialogController(
		dialogRef,
		open,
		onOpenChange
	);

	if (!open) {
		return null;
	}

	const dataAttr = side === 'right' ? { 'data-rw-sheet-dialog': '' } : { 'data-rw-drawer-dialog': '' };

	const node = (
		<dialog
			ref={dialogRef}
			{...dataAttr}
			data-rw-portal-overlay=""
			aria-labelledby={titleId}
			aria-describedby={subtitle ? subtitleId : undefined}
			{...({ closedby: 'any' } as Record<string, string>)}
			onPointerDown={handlePointerDown}
			onPointerUp={handlePointerUp}
			onClose={handleClose}
			className={cn('text-card-foreground', className)}
		>
			<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 shrink-0">
				<div className="flex min-w-0 items-center gap-2">
					{icon ? <DynamicIcon name={icon} className="size-4 shrink-0 text-primary" aria-hidden="true" /> : null}
					<div className="min-w-0">
						<h2 id={titleId} className="truncate text-sm font-semibold text-foreground">{title}</h2>
						{subtitle ? (
							<p id={subtitleId} className="truncate text-xs text-muted-foreground">{subtitle}</p>
						) : null}
					</div>
				</div>
				<Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label={t('common.close', 'Close')}>
					<DynamicIcon name="x" className="size-4" />
				</Button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
			{footer ? (
				<div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/25 px-4 py-3">
					{footer}
				</div>
			) : null}
		</dialog>
	);

	return <PortalRoot>{node}</PortalRoot>;
}
