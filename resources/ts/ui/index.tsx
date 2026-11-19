import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cva, type VariantProps } from 'class-variance-authority';
import { t } from '../lib/i18n';
import { visitSameModuleHref, withWorkspaceShellUrl } from '../lib/inertia-bridge';
import { cn, DynamicIcon, sanitizeHref, sanitizeImageSrc } from '../lib/utils';

/* ============================================================================
 * Button
 * ========================================================================== */

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
				{icon ? <DynamicIcon name={icon} className="size-3.5" /> : null}
				{children}
			</button>
		);
	}
);
Button.displayName = 'Button';

/* ============================================================================
 * Badge
 * ========================================================================== */

export const badgeVariants = cva(
	'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
	{
		variants: {
			variant: {
				default: 'border-transparent bg-primary/12 text-primary-ink',
				primary: 'border-transparent bg-primary/12 text-primary-ink',
				secondary: 'border-border bg-muted text-foreground',
				muted: 'border-border bg-muted/60 text-muted-foreground',
				outline: 'border-border bg-transparent text-foreground',
				success: 'border-success/25 bg-success/12 text-success',
				warning: 'border-warning/25 bg-warning/12 text-warning',
				danger: 'border-destructive/25 bg-destructive/12 text-destructive',
				destructive: 'border-destructive/25 bg-destructive/12 text-destructive',
			},
		},
		defaultVariants: {
			variant: 'secondary',
		},
	}
);

export interface BadgeProps
	extends React.HTMLAttributes<HTMLSpanElement>,
		VariantProps<typeof badgeVariants> {
	icon?: string;
	dot?: boolean;
	mono?: boolean;
}

export function Badge({
	className,
	variant,
	icon,
	dot,
	mono,
	children,
	...props
}: BadgeProps): React.ReactElement {
	return (
		<span
			className={cn(badgeVariants({ variant }), mono && 'font-mono text-[11px]', className)}
			{...props}
		>
			{dot ? (
				<span
					className={cn(
						'size-1.5 rounded-full',
						variant === 'success' && 'bg-success',
						variant === 'warning' && 'bg-warning',
						(variant === 'danger' || variant === 'destructive') && 'bg-destructive',
						(variant === 'primary' || variant === 'default') && 'bg-primary',
						(!variant || variant === 'secondary' || variant === 'muted' || variant === 'outline') &&
							'bg-muted-foreground'
					)}
				/>
			) : null}
			{icon ? <DynamicIcon name={icon} className="size-3" /> : null}
			{children}
		</span>
	);
}

/* ============================================================================
 * Card
 * ========================================================================== */

export function Card({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	return (
		<div
			className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-2xs', className)}
			{...props}
		/>
	);
}

export function CardHeader({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	return <div className={cn('flex flex-col space-y-1 p-5', className)} {...props} />;
}

export function CardTitle({
	className,
	...props
}: React.HTMLAttributes<HTMLHeadingElement>): React.ReactElement {
	return <h3 className={cn('text-sm font-semibold leading-none tracking-tight', className)} {...props} />;
}

export function CardDescription({
	className,
	...props
}: React.HTMLAttributes<HTMLParagraphElement>): React.ReactElement {
	return <p className={cn('text-xs text-muted-foreground leading-relaxed', className)} {...props} />;
}

export function CardContent({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function CardFooter({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	return <div className={cn('flex items-center p-5 pt-0', className)} {...props} />;
}

/* ============================================================================
 * Form Controls: Label, Input, Textarea, Select, Switch, Checkbox
 * ========================================================================== */

export function Label({
	className,
	...props
}: React.LabelHTMLAttributes<HTMLLabelElement>): React.ReactElement {
	return (
		<label
			className={cn('text-xs font-medium leading-none text-foreground peer-disabled:opacity-70', className)}
			{...props}
		/>
	);
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
	({ className, type = 'text', ...props }, ref) => (
		<input
			ref={ref}
			type={type}
			data-rw-input=""
			className={cn(
				'flex h-9 w-full rounded-md border border-input bg-input-surface px-3 py-1.5 text-sm text-foreground shadow-2xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
				className
			)}
			{...props}
		/>
	)
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
	HTMLTextAreaElement,
	React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
	<textarea
		ref={ref}
		data-rw-textarea=""
		className={cn(
			'flex min-h-[76px] w-full rounded-md border border-input bg-input-surface px-3 py-2 text-sm text-foreground shadow-2xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		{...props}
	/>
));
Textarea.displayName = 'Textarea';

export interface SelectOption {
	value: string | number;
	label: string;
	disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
	options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
	({ className, options, children, ...props }, ref) => (
		<select
			ref={ref}
			data-rw-select=""
			className={cn(
				'flex h-9 w-full rounded-md border border-input bg-input-surface px-3 py-1.5 text-sm text-foreground shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
				className
			)}
			{...props}
		>
			{options?.map((opt) => (
				<option key={String(opt.value)} value={String(opt.value)} disabled={opt.disabled}>
					{opt.label}
				</option>
			))}
			{children}
		</select>
	)
);
Select.displayName = 'Select';

export interface SwitchProps {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	label?: string;
	description?: string;
	disabled?: boolean;
	id?: string;
	'aria-label'?: string;
	className?: string;
}

export function Switch({
	checked,
	onCheckedChange,
	label,
	description,
	disabled,
	id,
	'aria-label': ariaLabel,
	className,
}: SwitchProps): React.ReactElement {
	const generatedId = useId();
	const switchId = id ?? generatedId;

	return (
		<div className={cn('flex items-center gap-2.5', className)}>
			<button
				id={switchId}
				type="button"
				role="switch"
				aria-checked={checked}
				aria-label={ariaLabel}
				disabled={disabled}
				onClick={() => !disabled && onCheckedChange(!checked)}
				className="peer inline-flex min-h-6 min-w-9 pointer-coarse:min-h-11 pointer-coarse:min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
			>
				<span
					aria-hidden="true"
					className={cn(
						'inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent transition-colors',
						checked ? 'bg-primary' : 'bg-muted-foreground/30'
					)}
				>
					<span
						className={cn(
							'pointer-events-none block size-4 rounded-full bg-background shadow-xs motion-safe:transition-transform',
							checked ? 'translate-x-4' : 'translate-x-0'
						)}
					/>
				</span>
			</button>
			{label || description ? (
				<div className="grid gap-0.5 leading-none">
					{label ? (
						<label
							htmlFor={switchId}
							className="cursor-pointer text-xs font-medium text-foreground"
						>
							{label}
						</label>
					) : null}
					{description ? <p className="text-[11px] text-muted-foreground">{description}</p> : null}
				</div>
			) : null}
		</div>
	);
}

/* ============================================================================
 * Tabs, TabsList, TabsTrigger, TabsContent
 * ========================================================================== */

interface TabsContextValue {
	baseId: string;
	value: string;
	onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function sanitizeTabToken(raw: string): string {
	return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export interface TabDeclarativeItem {
	id?: string;
	key?: string;
	value?: string;
	label: React.ReactNode;
	icon?: string;
	badge?: React.ReactNode;
	content?: React.ReactNode;
	disabled?: boolean;
}

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
	tabs?: TabDeclarativeItem[];
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
}

export function Tabs({
	tabs,
	value,
	defaultValue,
	onValueChange,
	className,
	children,
	...props
}: TabsProps): React.ReactElement {
	const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
	const initialTabValue = (() => {
		if (value !== undefined) {
			return value;
		}
		if (defaultValue !== undefined) {
			return defaultValue;
		}
		const first = tabs?.[0];
		if (first) {
			return String(first.value ?? first.id ?? first.key ?? '0');
		}
		return '';
	})();

	const [internalValue, setInternalValue] = useState<string>(initialTabValue);
	const activeValue = value !== undefined ? value : internalValue;

	const handleValueChange = (next: string) => {
		if (value === undefined) {
			setInternalValue(next);
		}
		onValueChange?.(next);
	};

	if (tabs && tabs.length > 0) {
		const activeIndex = tabs.findIndex((t, idx) => String(t.value ?? t.id ?? t.key ?? idx) === activeValue);
		const activeTab = activeIndex >= 0 ? tabs[activeIndex] : tabs[0];
		const resolvedActiveVal = String(
			activeTab?.value ?? activeTab?.id ?? activeTab?.key ?? (activeIndex >= 0 ? activeIndex : 0)
		);
		const safeActiveToken = sanitizeTabToken(resolvedActiveVal);

		return (
			<TabsContext.Provider value={{ baseId, value: activeValue, onValueChange: handleValueChange }}>
				<div className={cn('w-full space-y-4', className)} {...props}>
					<TabsList>
						{tabs.map((tab, idx) => {
							const tabVal = String(tab.value ?? tab.id ?? tab.key ?? idx);
							return (
								<TabsTrigger
									key={tabVal}
									value={tabVal}
									icon={tab.icon}
									badge={tab.badge}
									disabled={tab.disabled}
								>
									{tab.label}
								</TabsTrigger>
							);
						})}
					</TabsList>
					{activeTab?.content !== undefined ? (
						<div
							role="tabpanel"
							id={`rw-ui-panel-${baseId}-${safeActiveToken}`}
							aria-labelledby={`rw-ui-tab-${baseId}-${safeActiveToken}`}
							className="mt-3 focus-visible:outline-none"
						>
							{activeTab.content}
						</div>
					) : null}
					{children}
				</div>
			</TabsContext.Provider>
		);
	}

	return (
		<TabsContext.Provider value={{ baseId, value: activeValue, onValueChange: handleValueChange }}>
			<div className={cn('w-full space-y-4', className)} {...props}>
				{children}
			</div>
		</TabsContext.Provider>
	);
}

export function TabsList({
	className,
	onKeyDown,
	...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	return (
		<div
			role="tablist"
			onKeyDown={(e) => {
				onKeyDown?.(e);
				if (e.defaultPrevented) {
					return;
				}
				const listEl = e.currentTarget;
				const triggers = Array.from(
					listEl.querySelectorAll<HTMLButtonElement>(':scope > [role="tab"]:not(:disabled)')
				);
				if (triggers.length <= 1) {
					return;
				}
				const focused = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>('[role="tab"]');
				const currentIdx = focused ? triggers.indexOf(focused) : -1;
				if (currentIdx === -1) {
					return;
				}
				const isRtl =
					listEl.matches(':dir(rtl)') ||
					(typeof document !== 'undefined' && document.documentElement.dir === 'rtl');
				const forwardKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
				const backwardKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
				let nextIdx = -1;
				if (e.key === 'Home') nextIdx = 0;
				else if (e.key === 'End') nextIdx = triggers.length - 1;
				else if (e.key === forwardKey) nextIdx = (currentIdx + 1) % triggers.length;
				else if (e.key === backwardKey) nextIdx = (currentIdx - 1 + triggers.length) % triggers.length;
				if (nextIdx !== -1 && nextIdx !== currentIdx) {
					const target = triggers[nextIdx];
					if (target) {
						e.preventDefault();
						target.focus();
						target.click();
					}
				}
			}}
			className={cn(
				'inline-flex h-9 items-center justify-center rounded-lg border border-border/60 bg-muted p-1 text-muted-foreground',
				className
			)}
			{...props}
		/>
	);
}

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	value: string;
	icon?: string;
	badge?: React.ReactNode;
}

export function TabsTrigger({
	value,
	icon,
	badge,
	className,
	disabled,
	onClick,
	id,
	tabIndex,
	children,
	...props
}: TabsTriggerProps): React.ReactElement {
	const ctx = useContext(TabsContext);
	const isActive = ctx ? ctx.value === value : false;
	const safeToken = sanitizeTabToken(value);
	const resolvedId = id ?? (ctx ? `rw-ui-tab-${ctx.baseId}-${safeToken}` : undefined);
	const resolvedControls =
		props['aria-controls'] ?? (ctx ? `rw-ui-panel-${ctx.baseId}-${safeToken}` : undefined);

	return (
		<button
			type="button"
			role="tab"
			id={resolvedId}
			aria-selected={isActive}
			aria-controls={resolvedControls}
			tabIndex={tabIndex ?? (isActive ? 0 : -1)}
			data-state={isActive ? 'active' : 'inactive'}
			disabled={disabled}
			onClick={(e) => {
				if (!disabled) {
					ctx?.onValueChange(value);
				}
				onClick?.(e);
			}}
			className={cn(
				'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
				isActive
					? 'bg-background text-foreground shadow-2xs font-semibold'
					: 'text-muted-foreground hover:text-foreground',
				className
			)}
			{...props}
		>
			{icon ? <DynamicIcon name={icon} className="size-3.5 shrink-0" aria-hidden="true" /> : null}
			<span>{children}</span>
			{badge !== undefined && badge !== null && badge !== '' ? (
				<Badge
					variant={isActive ? 'secondary' : 'outline'}
					className="ml-1 px-1.5 py-0 text-[11px] tabular-nums"
				>
					{badge}
				</Badge>
			) : null}
		</button>
	);
}

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
	value: string;
	forceMount?: boolean;
}

export function TabsContent({
	value,
	forceMount,
	className,
	id,
	children,
	...props
}: TabsContentProps): React.ReactElement | null {
	const ctx = useContext(TabsContext);
	const isActive = ctx ? ctx.value === value : true;

	if (!isActive && !forceMount) {
		return null;
	}

	const safeToken = sanitizeTabToken(value);
	const resolvedId = id ?? (ctx ? `rw-ui-panel-${ctx.baseId}-${safeToken}` : undefined);
	const resolvedLabelledBy =
		props['aria-labelledby'] ?? (ctx ? `rw-ui-tab-${ctx.baseId}-${safeToken}` : undefined);

	return (
		<div
			role="tabpanel"
			id={resolvedId}
			aria-labelledby={resolvedLabelledBy}
			data-state={isActive ? 'active' : 'inactive'}
			hidden={!isActive}
			className={cn('mt-3 focus-visible:outline-none', !isActive && 'hidden', className)}
			{...props}
		>
			{children}
		</div>
	);
}

/* ============================================================================
 * Table
 * ========================================================================== */

export function Table({
	className,
	...props
}: React.TableHTMLAttributes<HTMLTableElement>): React.ReactElement {
	return (
		<div
			tabIndex={0}
			className="relative w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
		>
			<table data-rw-table="" className={cn('w-full caption-bottom text-sm', className)} {...props} />
		</div>
	);
}

export function TableHeader({
	className,
	...props
}: React.HTMLAttributes<HTMLTableSectionElement>): React.ReactElement {
	return <thead className={cn('border-b border-border bg-muted/40 [&_tr]:border-b', className)} {...props} />;
}

export function TableBody({
	className,
	...props
}: React.HTMLAttributes<HTMLTableSectionElement>): React.ReactElement {
	return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({
	className,
	...props
}: React.HTMLAttributes<HTMLTableRowElement>): React.ReactElement {
	return (
		<tr
			className={cn('border-b border-border transition-colors hover:bg-muted/30', className)}
			{...props}
		/>
	);
}

export function TableHead({
	className,
	scope = 'col',
	...props
}: React.ThHTMLAttributes<HTMLTableCellElement>): React.ReactElement {
	return (
		<th
			scope={scope}
			className={cn(
				'h-9 px-3.5 text-left align-middle text-xs font-semibold uppercase tracking-wider whitespace-nowrap text-muted-foreground',
				className
			)}
			{...props}
		/>
	);
}

export function TableCell({
	className,
	...props
}: React.TdHTMLAttributes<HTMLTableCellElement>): React.ReactElement {
	const dataValign = (props as Record<string, unknown>)['data-valign'];
	return (
		<td
			data-valign={typeof dataValign === 'string' ? dataValign : 'middle'}
			className={cn('px-4 py-2.5 align-middle text-sm', className)}
			{...props}
		/>
	);
}

/* ============================================================================
 * Alert, AlertTitle, AlertDescription, Progress, Separator, Skeleton
 * ========================================================================== */

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
	return <div className={cn('text-xs leading-relaxed opacity-90', className)} {...props} />;
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

	return (
		<div
			role="alert"
			className={cn(
				'relative flex w-full items-start gap-3 rounded-lg border p-4 text-sm',
				(variant === 'default' || variant === 'primary') &&
					'border-border bg-card text-foreground',
				variant === 'success' &&
					'border-success/25 bg-success/12 text-success',
				variant === 'warning' &&
					'border-warning/25 bg-warning/12 text-warning',
				(variant === 'danger' || variant === 'destructive') &&
					'border-destructive/30 bg-destructive/10 text-destructive',
				className
			)}
			{...props}
		>
			<DynamicIcon name={defaultIcon} className="mt-0.5 size-4 shrink-0" />
			<div className="flex-1 space-y-1">
				{title ? <AlertTitle>{title}</AlertTitle> : null}
				{title ? (
					<AlertDescription>{children}</AlertDescription>
				) : (
					<div className="text-xs leading-relaxed">{children}</div>
				)}
			</div>
		</div>
	);
}

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
	value: number;
	max?: number;
	variant?: 'primary' | 'success' | 'warning' | 'danger';
	label?: string;
}

export function Progress({
	value,
	max = 100,
	variant = 'primary',
	label,
	className,
	...props
}: ProgressProps): React.ReactElement {
	const safeMax = max > 0 ? max : 100;
	const pct = Math.max(0, Math.min(100, Math.round((value / safeMax) * 100)));
	return (
		<div
			role="progressbar"
			aria-valuenow={value}
			aria-valuemin={0}
			aria-valuemax={safeMax}
			aria-label={label}
			className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
			{...props}
		>
			<div
				className={cn(
					'h-full motion-safe:transition-[width] motion-safe:duration-300',
					variant === 'primary' && 'bg-primary',
					variant === 'success' && 'bg-success',
					variant === 'warning' && 'bg-warning',
					variant === 'danger' && 'bg-destructive'
				)}
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}

export function Separator({
	className,
	orientation = 'horizontal',
	...props
}: React.HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical' }): React.ReactElement {
	return (
		<div
			role="separator"
			className={cn(
				'shrink-0 bg-border',
				orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
				className
			)}
			{...props}
		/>
	);
}

export function Skeleton({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
	return <div className={cn('motion-safe:animate-pulse rounded-md bg-muted', className)} {...props} />;
}

/* ============================================================================
 * Dialog & Sheet Overlays (Native Top-Layer <dialog> with showModal())
 * ========================================================================== */

/**
 * Synchronize a native `<dialog>` with React `open` state via `.showModal()` and
 * attach a pointer-coordinate light-dismiss fallback when `HTMLDialogElement.prototype.closedBy`
 * is unavailable (e.g. Safari), requiring both press and release outside the dialog bounds.
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

	useLayoutEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog || !open) {
			return;
		}
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

	return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
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

	return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}

/* ============================================================================
 * Operational UI Primitives (StatCard, CliBox, CodePreview, EmptyState, ConfirmDialog)
 * ========================================================================== */

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

export interface CliBoxProps {
	command: string;
	caption?: string;
	label?: string;
	className?: string;
}

export function CliBox({ command, caption, label, className }: CliBoxProps): React.ReactElement {
	const [copied, setCopied] = useState(false);
	const resolvedCaption = caption ?? label;

	const handleCopy = () => {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			navigator.clipboard.writeText(command).catch(() => {});
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 1600);
	};

	return (
		<div className={cn('space-y-1', className)}>
			{resolvedCaption ? <div className="text-[11px] font-medium text-muted-foreground">{resolvedCaption}</div> : null}
			<div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/60 px-3 py-1.5 font-mono text-xs text-foreground">
				<code className="truncate select-all">{command}</code>
				<button
					type="button"
					onClick={handleCopy}
					className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-sans font-medium text-muted-foreground hover:bg-background hover:text-foreground cursor-pointer"
					aria-label={t('common.copyCommand', 'Copy command')}
					title={t('common.copyCommand', 'Copy command')}
				>
					<DynamicIcon name={copied ? 'check' : 'copy'} className="size-3" />
					<span>{copied ? t('common.copied', 'Copied') : t('common.copy', 'Copy')}</span>
				</button>
			</div>
		</div>
	);
}

export interface CodePreviewProps {
	title: string;
	subtitle?: string;
	badge?: string;
	content?: string;
	code?: string;
	maxHeight?: string;
	onClose?: () => void;
}

export function CodePreview({
	title,
	subtitle,
	badge,
	content,
	code,
	maxHeight = '460px',
	onClose,
}: CodePreviewProps): React.ReactElement {
	const [copied, setCopied] = useState(false);
	const resolvedContent = content ?? code ?? '';

	const handleCopy = () => {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			navigator.clipboard.writeText(resolvedContent).catch(() => {});
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 1600);
	};

	return (
		<Card className="overflow-hidden">
			<div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
				<div className="min-w-0 flex items-center gap-2">
					<DynamicIcon name="file-code-o" className="size-4 text-primary" />
					<span className="truncate text-xs font-semibold text-foreground">{title}</span>
					{subtitle ? (
						<span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
							({subtitle})
						</span>
					) : null}
					{badge ? <Badge variant="outline" mono>{badge}</Badge> : null}
				</div>
				<div className="flex items-center gap-1.5">
					<Button variant="outline" size="xs" icon={copied ? 'check' : 'copy'} onClick={handleCopy}>
						{copied ? 'Copied' : 'Copy'}
					</Button>
					{onClose ? (
						<Button variant="ghost" size="xs" icon="x" onClick={onClose}>
							Close
						</Button>
					) : null}
				</div>
			</div>
			<pre
				style={{ maxHeight }}
				className="overflow-auto bg-muted/25 p-4 font-mono text-xs leading-relaxed text-foreground"
			>
				<code>{resolvedContent}</code>
			</pre>
		</Card>
	);
}

export interface EmptyStateProps {
	icon?: string;
	title: string;
	description: string;
	cliCommand?: string;
	action?: React.ReactNode;
	headingLevel?: 'h2' | 'h3' | 'h4';
}

export function EmptyState({
	icon = 'inbox',
	title,
	description,
	cliCommand,
	action,
	headingLevel = 'h2',
}: EmptyStateProps): React.ReactElement {
	const HeadingTag = headingLevel;
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-10 text-center">
			<div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<DynamicIcon name={icon} className="size-5" aria-hidden="true" />
			</div>
			<HeadingTag className="mt-3 text-sm font-semibold text-foreground">{title}</HeadingTag>
			<p className="mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">{description}</p>
			{cliCommand ? (
				<div className="mt-4 w-full max-w-md text-left">
					<CliBox command={cliCommand} />
				</div>
			) : null}
			{action ? <div className="mt-4">{action}</div> : null}
		</div>
	);
}

export interface ConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	icon?: string;
	confirmLabel?: string;
	variant?: 'primary' | 'warning' | 'danger';
	loading?: boolean;
	requireAcknowledge?: boolean;
	onConfirm: () => void;
}

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	icon,
	confirmLabel,
	variant = 'danger',
	loading = false,
	requireAcknowledge = true,
	onConfirm,
}: ConfirmDialogProps): React.ReactElement | null {
	const [acknowledged, setAcknowledged] = useState(false);

	if (!open) {
		return null;
	}

	const resolvedConfirmLabel = confirmLabel ?? t('common.confirmExecute', 'Confirm & Execute');
	const canProceed = !requireAcknowledge || acknowledged;
	const resolvedIcon =
		icon ??
		(variant === 'danger' ? 'alert-triangle' : variant === 'warning' ? 'alert-triangle' : 'info');

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setAcknowledged(false);
				onOpenChange(next);
			}}
			title={title}
			description={description}
			icon={resolvedIcon}
			tone={variant}
			showCloseButton={false}
			maxWidth={requireAcknowledge ? 'max-w-[28rem]' : 'max-w-[26rem]'}
			footer={
				<>
					<Button
						variant="outline"
						size="sm"
						autoFocus
						onClick={() => {
							setAcknowledged(false);
							onOpenChange(false);
						}}
					>
						{t('common.cancel', 'Cancel')}
					</Button>
					<Button
						variant={variant}
						size="sm"
						disabled={!canProceed || loading}
						data-rw-confirm-accept=""
						onClick={() => {
							onConfirm();
							setAcknowledged(false);
						}}
					>
						{loading ? t('common.executing', 'Executing...') : resolvedConfirmLabel}
					</Button>
				</>
			}
		>
			{requireAcknowledge ? (
				<label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/80 bg-muted/35 px-3.5 py-2.5 text-xs leading-relaxed text-foreground transition-colors hover:bg-muted/55">
					<input
						type="checkbox"
						checked={acknowledged}
						onChange={(e) => setAcknowledged(e.target.checked)}
						className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary"
					/>
					<span>{t('common.confirmAcknowledge', 'I understand the impact of this operation and wish to proceed.')}</span>
				</label>
			) : null}
		</Dialog>
	);
}

/* ============================================================================
 * DropdownMenu (Viewport-Aware Portaled Action Menu)
 * ========================================================================== */

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
	triggerAriaLabel = 'Actions',
	triggerClassName,
	triggerDataAttr,
	align = 'end',
	disabled = false,
	className,
}: DropdownMenuProps): React.ReactElement | null {
	const [open, setOpen] = useState(false);
	const [focusStrategy, setFocusStrategy] = useState<'first' | 'last'>('first');
	const [coords, setCoords] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);

	const visibleItems = items.filter((item) => Boolean(item && item.label));

	const updatePosition = () => {
		const triggerEl = triggerRef.current;
		const menuEl = menuRef.current;
		if (!triggerEl || !menuEl || typeof window === 'undefined') {
			return;
		}

		const rect = triggerEl.getBoundingClientRect();
		const menuWidth = menuEl.offsetWidth || 184;
		const menuHeight = menuEl.offsetHeight || 160;
		const viewportW = window.innerWidth;
		const viewportH = window.innerHeight;
		const margin = 8;
		const gap = 4;

		const spaceBelow = viewportH - rect.bottom - margin;
		const spaceAbove = rect.top - margin;
		const flipUp = spaceBelow < menuHeight + gap && spaceAbove > spaceBelow;

		const rawTop = flipUp ? rect.top - menuHeight - gap : rect.bottom + gap;
		const top = Math.max(margin, Math.min(rawTop, viewportH - menuHeight - margin));

		const rawLeft = align === 'end' ? rect.right - menuWidth : rect.left;
		const left = Math.max(margin, Math.min(rawLeft, viewportW - menuWidth - margin));

		setCoords({ top, left });
	};

	useLayoutEffect(() => {
		if (!open) {
			return;
		}
		updatePosition();

		const menuEl = menuRef.current;
		if (menuEl) {
			const focusables = Array.from(
				menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
			);
			const target = focusStrategy === 'last' ? focusables[focusables.length - 1] : focusables[0];
			target?.focus({ preventScroll: true });
		}
	}, [open, focusStrategy, visibleItems.length]);

	useEffect(() => {
		if (!open || typeof window === 'undefined') {
			return;
		}

		const handlePointerDown = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (!target) {
				return;
			}
			if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
				return;
			}
			setOpen(false);
		};

		const handleScrollOrResize = () => {
			updatePosition();
		};

		document.addEventListener('mousedown', handlePointerDown);
		window.addEventListener('resize', handleScrollOrResize);
		window.addEventListener('scroll', handleScrollOrResize, true);
		return () => {
			document.removeEventListener('mousedown', handlePointerDown);
			window.removeEventListener('resize', handleScrollOrResize);
			window.removeEventListener('scroll', handleScrollOrResize, true);
		};
	}, [open, align]);

	if (visibleItems.length === 0) {
		return null;
	}

	const closeAndFocusTrigger = () => {
		setOpen(false);
		requestAnimationFrame(() => {
			triggerRef.current?.focus({ preventScroll: true });
		});
	};

	const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		const menuEl = menuRef.current;
		if (!menuEl) {
			return;
		}
		const focusables = Array.from(
			menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
		);
		if (focusables.length === 0) {
			return;
		}

		const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);

		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closeAndFocusTrigger();
			return;
		}

		if (event.key === 'Tab') {
			setOpen(false);
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % focusables.length : 0;
			focusables[nextIndex]?.focus({ preventScroll: true });
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			const prevIndex =
				currentIndex > 0 ? currentIndex - 1 : focusables.length - 1;
			focusables[prevIndex]?.focus({ preventScroll: true });
			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			focusables[0]?.focus({ preventScroll: true });
			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			focusables[focusables.length - 1]?.focus({ preventScroll: true });
		}
	};

	const hasAnyIcon = visibleItems.some((item) => Boolean(item.icon));
	let seenDanger = false;

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				disabled={disabled}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label={triggerAriaLabel}
				data-rw-row-actions-trigger={triggerDataAttr}
				onClick={(event) => {
					event.stopPropagation();
					setFocusStrategy('first');
					setOpen((prev) => !prev);
				}}
				onKeyDown={(event) => {
					if (event.key === 'ArrowDown') {
						event.preventDefault();
						setFocusStrategy('first');
						setOpen(true);
					} else if (event.key === 'ArrowUp') {
						event.preventDefault();
						setFocusStrategy('last');
						setOpen(true);
					}
				}}
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
			</button>

			{open && typeof document !== 'undefined'
				? createPortal(
						<div
							ref={menuRef}
							role="menu"
							aria-orientation="vertical"
							data-rw-portal-overlay=""
							onKeyDown={handleMenuKeyDown}
							style={{ position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px` }}
							className={cn(
								'z-50 min-w-44 max-w-64 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg focus:outline-none',
								className
							)}
						>
							{visibleItems.map((item, idx) => {
								const isDanger = item.variant === 'danger';
								const autoDangerSeparator = isDanger && !seenDanger && idx > 0;
								if (isDanger) {
									seenDanger = true;
								}
								const showSeparator = Boolean(item.separatorBefore || autoDangerSeparator);
								const itemClasses = cn(
									'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors focus:outline-none cursor-pointer select-none',
									item.disabled
										? 'pointer-events-none opacity-50'
										: isDanger
											? 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10'
											: item.active
												? 'bg-primary/10 text-primary-ink hover:bg-primary/15 focus:bg-primary/15'
												: 'text-popover-foreground hover:bg-muted focus:bg-muted'
								);

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

								const safeItemHref = item.href ? sanitizeHref(item.href) : '';
								const safeTarget =
									typeof item.target === 'string' && item.target.trim().toLowerCase() === '_blank'
										? '_blank'
										: undefined;

								return (
									<React.Fragment key={item.key}>
										{showSeparator ? <hr className="my-1 border-border" /> : null}
										{item.sectionLabel ? (
											<div
												role="presentation"
												className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase select-none"
											>
												{item.sectionLabel}
											</div>
										) : null}
										{safeItemHref && !item.disabled ? (
											<a
												href={sanitizeHref(withWorkspaceShellUrl(safeItemHref)) || safeItemHref}
												target={safeTarget}
												download={item.download}
												rel={safeTarget === '_blank' ? 'noopener noreferrer' : undefined}
												role="menuitem"
												tabIndex={-1}
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
												className={itemClasses}
											>
												{inner}
											</a>
										) : (
											<button
												type="button"
												role="menuitem"
												tabIndex={-1}
												aria-disabled={item.disabled || undefined}
												disabled={item.disabled}
												{...(item.dataAttrs || {})}
												onClick={(event) => {
													event.stopPropagation();
													if (item.disabled) {
														return;
													}
													setOpen(false);
													item.onSelect?.();
												}}
												className={itemClasses}
											>
												{inner}
											</button>
										)}
									</React.Fragment>
								);
							})}
						</div>,
						triggerRef.current?.closest('dialog') ?? document.body
					)
				: null}
		</>
	);
}

export interface ViewportActionDescriptor {
	key: string;
	label: string;
	icon?: string;
	variant?: string;
	tone?: string;
	href?: string;
	confirm?: string;
}

export function buildViewportActionItems(
	record: Record<string, unknown>,
	actions: ViewportActionDescriptor[],
	state: { quickEditEnabled?: boolean; locked?: boolean },
	dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void> | void,
	onConfirmAction?: (act: ViewportActionDescriptor, recordId: string, recordLabel: string) => void
): DropdownMenuItem[] {
	const recordId = String(record.id ?? '');
	const recordLabel = String(record.title || record.label || record.name || recordId);
	const standardItems: DropdownMenuItem[] = [];
	const dangerItems: DropdownMenuItem[] = [];
	const editUrl = typeof record._editUrl === 'string' ? sanitizeHref(record._editUrl) : '';

	if (editUrl && !actions.some((act) => act.key === 'edit' || sanitizeHref(act.href) === editUrl)) {
		standardItems.push({
			key: 'edit',
			label: t('common.edit', 'Edit'),
			icon: 'pencil',
			href: editUrl,
		});
	}

	if (state.quickEditEnabled && !state.locked && recordId) {
		standardItems.push({
			key: 'quick_edit',
			label: t('viewport.quickEdit', 'Quick Edit'),
			icon: 'sliders-horizontal',
			onSelect: () => {
				void dispatch('open_quick_edit', { id: recordId });
			},
		});
	}

	for (const act of actions) {
		const isDanger = act.variant === 'danger' || act.tone === 'danger';
		const safeActHref = act.href ? sanitizeHref(act.href) : '';
		if (act.href && !safeActHref) {
			continue;
		}
		const menuItem: DropdownMenuItem = safeActHref
			? {
					key: act.key,
					label: act.label,
					icon: act.icon,
					variant: isDanger ? 'danger' : 'default',
					href: safeActHref,
				}
			: {
					key: act.key,
					label: act.label,
					icon: act.icon,
					variant: isDanger ? 'danger' : 'default',
					onSelect: () => {
						if (act.confirm) {
							if (onConfirmAction) {
								onConfirmAction(act, recordId, recordLabel);
								return;
							}
							if (!window.confirm(act.confirm)) {
								return;
							}
						}
						void dispatch('row_action', { rowAction: act.key, id: recordId });
					},
				};

		if (isDanger) {
			dangerItems.push(menuItem);
		} else {
			standardItems.push(menuItem);
		}
	}

	return [...standardItems, ...dangerItems];
}

/* ============================================================================
 * Canonical Viewport Cell & Record Presentation Primitives
 * ========================================================================== */

export type ViewportBadgeVariant =
	| 'default'
	| 'primary'
	| 'secondary'
	| 'outline'
	| 'success'
	| 'warning'
	| 'danger'
	| 'destructive'
	| 'muted';

export interface ViewportBadgeSpec {
	label: string;
	variant?: ViewportBadgeVariant;
	dot?: boolean;
	icon?: string;
	mono?: boolean;
}

export interface ViewportThumbSpec {
	src: string;
	darkSrc?: string;
	alt: string;
	count: number;
	aspect?: 'square' | 'video';
}

export interface ViewportCellObject {
	label?: string;
	title?: string;
	icon?: string | Record<string, unknown>;
	thumb?: string | { src: string; darkSrc?: string; alt?: string; count?: number; aspect?: 'square' | 'video' };
	href?: string;
	external?: boolean;
	copyValue?: string;
	copyable?: boolean;
	subtitle?: string;
	subtitleMono?: boolean;
	badge?: string | ViewportBadgeSpec;
	badges?: Array<string | ViewportBadgeSpec>;
	maxBadges?: number;
	mono?: boolean;
	tabular?: boolean;
	nowrap?: boolean;
	truncate?: boolean | number;
}

const VALID_BADGE_VARIANTS = new Set<string>([
	'default',
	'primary',
	'secondary',
	'outline',
	'success',
	'warning',
	'danger',
	'destructive',
	'muted',
]);

export function isViewportCellObject(raw: unknown): raw is ViewportCellObject {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return false;
	}
	const obj = raw as Record<string, unknown>;
	return (
		'label' in obj ||
		'title' in obj ||
		'thumb' in obj ||
		'href' in obj ||
		'subtitle' in obj ||
		'badge' in obj ||
		'badges' in obj ||
		'copyValue' in obj ||
		('icon' in obj && !('svg' in obj && 'set' in obj))
	);
}

export function normalizeViewportBadges(raw: unknown): ViewportBadgeSpec[] {
	if (!raw) {
		return [];
	}
	const source = Array.isArray(raw) ? raw : [raw];
	const out: ViewportBadgeSpec[] = [];
	for (const entry of source) {
		if (typeof entry === 'string') {
			const clean = entry.trim();
			if (clean !== '') {
				out.push({ label: clean, variant: 'secondary' });
			}
		} else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
			const obj = entry as Record<string, unknown>;
			const label = typeof obj.label === 'string' ? obj.label.trim() : '';
			if (label === '') {
				continue;
			}
			const rawVar = typeof obj.variant === 'string' ? obj.variant.trim().toLowerCase() : '';
			out.push({
				label,
				variant: VALID_BADGE_VARIANTS.has(rawVar) ? (rawVar as ViewportBadgeVariant) : 'secondary',
				dot: Boolean(obj.dot),
				icon: typeof obj.icon === 'string' && obj.icon.trim() !== '' ? obj.icon.trim() : undefined,
				mono: Boolean(obj.mono),
			});
		}
	}
	return out;
}

export function normalizeViewportThumb(raw: unknown, fallbackAlt = ''): ViewportThumbSpec | null {
	if (typeof raw === 'string') {
		const safeSrc = sanitizeImageSrc(raw);
		if (!safeSrc) {
			return null;
		}
		return { src: safeSrc, alt: fallbackAlt, count: 1 };
	}
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		const obj = raw as Record<string, unknown>;
		const safeSrc = typeof obj.src === 'string' ? sanitizeImageSrc(obj.src) : '';
		if (!safeSrc) {
			return null;
		}
		const safeDarkSrc = typeof obj.darkSrc === 'string' ? sanitizeImageSrc(obj.darkSrc) : '';
		const rawAspect = typeof obj.aspect === 'string' ? obj.aspect.trim().toLowerCase() : '';
		const countNum = Number(obj.count);
		return {
			src: safeSrc,
			darkSrc: safeDarkSrc || undefined,
			alt: typeof obj.alt === 'string' && obj.alt.trim() !== '' ? obj.alt.trim() : fallbackAlt,
			count: Number.isFinite(countNum) && countNum > 1 ? Math.round(countNum) : 1,
			aspect: rawAspect === 'video' ? 'video' : rawAspect === 'square' ? 'square' : undefined,
		};
	}
	return null;
}

function readRwDocumentDarkTheme(): boolean {
	if (typeof document === 'undefined') {
		return false;
	}
	const root = document.documentElement;
	const body = document.body;
	if (root.classList.contains('dark') || body?.classList.contains('dark-theme')) {
		return true;
	}
	if (root.classList.contains('light') || body?.classList.contains('light-theme')) {
		return false;
	}
	return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia('(prefers-color-scheme: dark)').matches
		: false;
}

const rwThemeSubscribers = new Set<(isDark: boolean) => void>();
let rwThemeObserverBound = false;

function ensureRwThemeObserver(): void {
	if (rwThemeObserverBound || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
		return;
	}
	rwThemeObserverBound = true;
	const notify = () => {
		const next = readRwDocumentDarkTheme();
		for (const cb of rwThemeSubscribers) {
			cb(next);
		}
	};
	const observer = new MutationObserver(notify);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['class', 'data-theme-mode'],
	});
	if (document.body) {
		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ['class'],
		});
	}
	if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
		const mql = window.matchMedia('(prefers-color-scheme: dark)');
		if (typeof mql.addEventListener === 'function') {
			mql.addEventListener('change', notify);
		}
	}
}

export function useRwDarkTheme(): boolean {
	const [isDark, setIsDark] = useState<boolean>(readRwDocumentDarkTheme);

	useEffect(() => {
		ensureRwThemeObserver();
		setIsDark(readRwDocumentDarkTheme());
		rwThemeSubscribers.add(setIsDark);
		return () => {
			rwThemeSubscribers.delete(setIsDark);
		};
	}, []);

	return isDark;
}

export function isFramedIconPayload(raw: unknown): boolean {
	if (!raw) {
		return false;
	}
	let candidate = raw;
	if (typeof candidate === 'string') {
		const trimmed = candidate.trim();
		if (!trimmed.startsWith('{') || trimmed.length > 4096) {
			return false;
		}
		try {
			candidate = JSON.parse(trimmed);
		} catch {
			return false;
		}
	}
	if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
		return false;
	}
	const obj = candidate as Record<string, unknown>;
	const bg = typeof obj.background === 'string' ? obj.background.trim() : typeof obj.bg === 'string' ? obj.bg.trim() : '';
	return bg !== '';
}

export function applyTextTruncate(
	value: string,
	truncate?: boolean | number
): { display: string; truncated: boolean; cssTruncate: boolean } {
	if (typeof truncate === 'number' && truncate > 0) {
		const chars = Array.from(value);
		if (chars.length > truncate) {
			return {
				display: `${chars.slice(0, truncate).join('').trimEnd()}…`,
				truncated: true,
				cssTruncate: false,
			};
		}
		return { display: value, truncated: false, cssTruncate: false };
	}
	if (truncate === true) {
		return { display: value, truncated: value.length > 0, cssTruncate: true };
	}
	return { display: value, truncated: false, cssTruncate: false };
}

export interface ResolvedRecordVisuals {
	icon?: string | Record<string, unknown>;
	thumb: ViewportThumbSpec | null;
	subtitle: string;
	badges: ViewportBadgeSpec[];
	locked: boolean;
}

export function resolveRecordVisuals(
	record: Record<string, unknown>,
	options?: {
		hasDedicatedIconColumn?: boolean;
		hasDedicatedThumbColumn?: boolean;
	}
): ResolvedRecordVisuals {
	const fallbackLabel = String(record.title ?? record.label ?? record.name ?? record.id ?? '');
	const rawThumb =
		record._thumb !== undefined
			? record._thumb
			: !options?.hasDedicatedThumbColumn
				? record.thumb
				: undefined;
	const thumb = normalizeViewportThumb(rawThumb, fallbackLabel);

	const rawIconCandidate =
		record._icon !== undefined
			? record._icon
			: !options?.hasDedicatedIconColumn
				? record.icon
				: undefined;
	let icon: string | Record<string, unknown> | undefined;
	if (typeof rawIconCandidate === 'string' && rawIconCandidate.trim() !== '') {
		icon = rawIconCandidate.trim();
	} else if (rawIconCandidate && typeof rawIconCandidate === 'object' && !Array.isArray(rawIconCandidate)) {
		const iconObj = rawIconCandidate as Record<string, unknown>;
		if (typeof iconObj.name === 'string' && iconObj.name.trim() !== '') {
			icon = iconObj;
		} else if (typeof iconObj.icon === 'string' && iconObj.icon.trim() !== '') {
			icon = iconObj;
		}
	}

	const rawSubtitle =
		typeof record._subtitle === 'string' && record._subtitle.trim() !== ''
			? record._subtitle.trim()
			: typeof record.subtitle === 'string' && record.subtitle.trim() !== ''
				? record.subtitle.trim()
				: '';

	return {
		icon,
		thumb,
		subtitle: rawSubtitle !== fallbackLabel ? rawSubtitle : '',
		badges: normalizeViewportBadges(record._badges ?? record.badges),
		locked: Boolean(record._locked),
	};
}

export interface RecordLeadingVisualProps {
	thumb?: ViewportThumbSpec | null;
	icon?: string | Record<string, unknown>;
	multiline?: boolean;
	size?: 'xs' | 'sm' | 'md';
	className?: string;
}

export function RecordLeadingVisual({
	thumb,
	icon,
	multiline = false,
	size = 'md',
	className,
}: RecordLeadingVisualProps): React.ReactElement | null {
	const isDark = useRwDarkTheme();

	if (thumb && thumb.src) {
		const isVideo = thumb.aspect === 'video';
		const sizeCls = isVideo
			? size === 'xs'
				? 'h-[18px] w-8'
				: size === 'sm'
					? 'h-[22px] w-10'
					: 'h-7 w-12'
			: size === 'xs'
				? 'size-6'
				: size === 'sm'
					? 'size-8'
					: 'size-9';
		const imgW = isVideo ? (size === 'xs' ? 32 : size === 'sm' ? 40 : 48) : size === 'xs' ? 24 : size === 'sm' ? 32 : 36;
		const imgH = isVideo ? (size === 'xs' ? 18 : size === 'sm' ? 22 : 28) : size === 'xs' ? 24 : size === 'sm' ? 32 : 36;
		const activeSrc = isDark && thumb.darkSrc ? thumb.darkSrc : thumb.src;
		return (
			<span className={cn('relative inline-flex shrink-0', className)}>
				<img
					src={activeSrc}
					alt={thumb.alt}
					width={imgW}
					height={imgH}
					loading="lazy"
					data-rw-preview-scheme={isDark ? 'dark' : 'light'}
					className={cn(sizeCls, 'rounded-md border border-border/70 bg-muted object-cover')}
				/>
				{thumb.count > 1 ? (
					<span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full border border-card bg-secondary px-1 text-[10px] font-semibold leading-4 text-secondary-foreground tabular-nums">
						+{thumb.count - 1}
					</span>
				) : null}
			</span>
		);
	}

	if (icon !== undefined && icon !== '') {
		const framed = isFramedIconPayload(icon);
		const iconSizeCls = !framed
			? size === 'xs'
				? 'size-3.5 text-muted-foreground'
				: 'size-4 text-muted-foreground'
			: undefined;
		return (
			<DynamicIcon
				value={icon}
				name={typeof icon === 'string' ? icon : undefined}
				className={cn('shrink-0', iconSizeCls, multiline && !framed && 'mt-0.5', className)}
			/>
		);
	}

	return null;
}

export interface BadgeGroupProps {
	badges: ViewportBadgeSpec[];
	maxVisible?: number;
	compact?: boolean;
	className?: string;
}

export function BadgeGroup({
	badges,
	maxVisible = 3,
	compact = false,
	className,
}: BadgeGroupProps): React.ReactElement | null {
	if (!badges || badges.length === 0) {
		return null;
	}
	const cap = Math.max(1, maxVisible);
	const visible = badges.slice(0, cap);
	const hidden = badges.slice(cap);
	const compactCls = compact ? 'px-1.5 py-0 text-[10px]' : undefined;

	return (
		<span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
			{visible.map((b, i) => (
				<Badge
					key={`${b.label}-${i}`}
					variant={b.variant || 'secondary'}
					dot={b.dot}
					icon={b.icon}
					mono={b.mono}
					className={cn('shrink-0', compactCls)}
				>
					{b.label}
				</Badge>
			))}
			{hidden.length > 0 ? (
				<Badge
					variant="muted"
					title={hidden.map((h) => h.label).join(', ')}
					className={cn('shrink-0 tabular-nums', compactCls)}
				>
					+{hidden.length}
				</Badge>
			) : null}
		</span>
	);
}

let lastCopyAnnouncement = '';

function legacyCopyToClipboard(text: string): boolean {
	if (typeof document === 'undefined' || !document.body) {
		return false;
	}
	const field = Object.assign(document.createElement('textarea'), { value: text });
	field.setAttribute('readonly', '');
	field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
	document.body.appendChild(field);
	field.select();
	try {
		return document.execCommand('copy');
	} catch {
		return false;
	} finally {
		field.remove();
	}
}

export interface CopyValueButtonProps {
	value: string;
	subjectLabel?: string;
	revealOnHover?: boolean;
	className?: string;
}

export function CopyValueButton({
	value,
	subjectLabel,
	revealOnHover = true,
	className,
}: CopyValueButtonProps): React.ReactElement | null {
	const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
	const [tipText, setTipText] = useState('');
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current !== null && typeof window !== 'undefined') {
				window.clearTimeout(timerRef.current);
			}
		};
	}, []);

	if (!value) {
		return null;
	}

	const copyVerb = t('common.copy', 'Copy');
	const accessibleSubject = (subjectLabel || value).trim();
	const buttonLabel = accessibleSubject ? `${copyVerb} ${accessibleSubject}` : copyVerb;

	const reportOutcome = (ok: boolean) => {
		if (typeof window === 'undefined') {
			return;
		}
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
		}
		setStatus(ok ? 'copied' : 'failed');
		let msg = ok ? t('common.copied', 'Copied') : t('common.error', 'Copy failed');
		if (msg === lastCopyAnnouncement) {
			msg += '\u00A0';
		}
		lastCopyAnnouncement = msg;
		setTipText('');
		window.requestAnimationFrame(() => {
			setTipText(msg);
		});
		timerRef.current = window.setTimeout(() => {
			setStatus('idle');
			setTipText('');
			timerRef.current = null;
		}, 1800);
	};

	const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation();
		try {
			if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(value);
				reportOutcome(true);
				return;
			}
			if (legacyCopyToClipboard(value)) {
				reportOutcome(true);
			} else {
				reportOutcome(false);
			}
		} catch {
			if (legacyCopyToClipboard(value)) {
				reportOutcome(true);
			} else {
				reportOutcome(false);
			}
		}
	};

	return (
		<span data-rw-copy-wrap="" className={cn('relative inline-flex shrink-0 items-center', className)}>
			<button
				type="button"
				data-rw-copy-btn=""
				data-reveal={revealOnHover ? 'hover' : 'always'}
				data-copied={status === 'copied' ? '' : undefined}
				data-failed={status === 'failed' ? '' : undefined}
				aria-label={buttonLabel}
				title={buttonLabel}
				onClick={(e) => {
					void handleCopy(e);
				}}
				className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer"
			>
				<DynamicIcon
					name={status === 'copied' ? 'check' : status === 'failed' ? 'alert-circle' : 'copy'}
					aria-hidden="true"
					className={cn(
						'size-3.5',
						status === 'copied' && 'text-success',
						status === 'failed' && 'text-destructive'
					)}
				/>
			</button>
			<span
				role="status"
				data-rw-copy-tip=""
				className={cn(
					'pointer-events-none absolute bottom-full right-0 z-30 mb-1 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 text-[10px] font-medium text-popover-foreground shadow-sm transition-opacity duration-150',
					tipText !== '' ? 'opacity-100' : 'opacity-0'
				)}
			>
				{tipText}
			</span>
		</span>
	);
}

export {
	SortableHandle,
	SortableStatusRegion,
	useSortableList,
	moveArrayItem,
	projectTreeReorder,
	type SortableHandleProps,
	type TreeSortableNodeSpec,
	type ProjectedTreeReorder,
	type UseSortableListOptions,
} from './sortable';

export {
	ColumnSpanSlider,
	clampColSpan,
	colSpanToPercent,
	percentToColSpan,
	formatColSpanHint,
	type ColumnSpanSliderProps,
} from './column-span-slider';
