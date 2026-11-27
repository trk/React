import React, { createContext, useContext, useId, useRef } from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge } from './Badge';

export type TabsVariant = 'segmented' | 'line' | 'vertical' | 'pw-lang';

interface TabsStyleContextValue {
	baseId: string;
	variant: TabsVariant;
	ids: Record<string, string>;
}

const TabsStyleContext = createContext<TabsStyleContextValue>({
	baseId: 'tabs',
	variant: 'segmented',
	ids: {},
});

function sanitizeTabToken(raw: string): string {
	return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue' | 'value'> {
	value?: string;
	defaultValue?: string;
	variant?: TabsVariant;
	onValueChange?: (value: string) => void;
}

export function Tabs({
	value,
	defaultValue,
	variant = 'segmented',
	onValueChange,
	className,
	children,
	...props
}: TabsProps): React.ReactElement {
	const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
	const idsRef = useRef<Record<string, string>>({});

	return (
		<TabsStyleContext.Provider value={{ baseId, variant, ids: idsRef.current }}>
			<BaseTabs.Root
				value={value}
				defaultValue={defaultValue}
				orientation={variant === 'vertical' ? 'vertical' : 'horizontal'}
				onValueChange={(nextValue) => {
					if (nextValue !== null && nextValue !== undefined) {
						onValueChange?.(String(nextValue));
					}
				}}
				className={cn(
					variant === 'vertical' ? 'flex w-full gap-4' : 'w-full space-y-4',
					className
				)}
				{...(props as Record<string, unknown>)}
			>
				{children}
			</BaseTabs.Root>
		</TabsStyleContext.Provider>
	);
}

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: TabsVariant;
}

export function TabsList({
	variant,
	className,
	...props
}: TabsListProps): React.ReactElement {
	const ctx = useContext(TabsStyleContext);
	const resolvedVariant = variant ?? ctx.variant;
	const list = (
		<BaseTabs.List
			data-rw-tablist=""
			data-variant={resolvedVariant}
			className={cn(
				resolvedVariant === 'segmented' &&
					'inline-flex h-9 items-center justify-center rounded-lg border border-border/60 bg-muted p-1 text-muted-foreground',
				resolvedVariant === 'line' &&
					'inline-flex items-center gap-4 border-b border-border text-muted-foreground',
				resolvedVariant === 'vertical' &&
					'flex flex-col items-stretch gap-1 border-e border-border pe-2 text-muted-foreground shrink-0',
				className
			)}
			{...(props as Record<string, unknown>)}
		/>
	);

	return variant ? (
		<TabsStyleContext.Provider value={{ ...ctx, variant }}>{list}</TabsStyleContext.Provider>
	) : (
		list
	);
}

export interface TabsTriggerProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
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
	id,
	children,
	...props
}: TabsTriggerProps): React.ReactElement {
	const ctx = useContext(TabsStyleContext);
	const resolvedId = id ?? `rw-ui-tab-${ctx.baseId}-${sanitizeTabToken(value)}`;
	ctx.ids[value] = resolvedId;

	return (
		<BaseTabs.Tab
			id={resolvedId}
			value={value}
			disabled={disabled}
			className={cn(
				'group inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
				ctx.variant === 'segmented' &&
					'rounded-md px-3 py-1 text-muted-foreground hover:text-foreground data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-2xs data-[active]:font-semibold',
				ctx.variant === 'line' &&
					'px-1 pb-2 pt-1 text-muted-foreground hover:text-foreground data-[active]:text-foreground data-[active]:font-semibold',
				ctx.variant === 'vertical' &&
					'justify-start rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[active]:bg-muted data-[active]:text-foreground data-[active]:font-semibold',
				className
			)}
			{...(props as Record<string, unknown>)}
		>
			{icon ? <DynamicIcon name={icon} className="size-3.5 shrink-0" aria-hidden="true" /> : null}
			<span>{children}</span>
			{badge !== undefined && badge !== null && badge !== '' ? (
				<Badge
					variant="outline"
					className="ml-1 px-1.5 py-0 text-[11px] tabular-nums group-data-[active]:border-border group-data-[active]:bg-muted"
				>
					{badge}
				</Badge>
			) : null}
		</BaseTabs.Tab>
	);
}

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
	value: string;
	keepMounted?: boolean;
	forceMount?: boolean;
}

export function TabsContent({
	value,
	keepMounted,
	forceMount,
	className,
	id,
	children,
	...props
}: TabsContentProps): React.ReactElement {
	const ctx = useContext(TabsStyleContext);
	const resolvedLabelledBy =
		props['aria-labelledby'] ??
		ctx.ids[value] ??
		`rw-ui-tab-${ctx.baseId}-${sanitizeTabToken(value)}`;

	return (
		<BaseTabs.Panel
			{...(id ? { id } : {})}
			aria-labelledby={resolvedLabelledBy}
			value={value}
			keepMounted={Boolean(keepMounted ?? forceMount)}
			className={cn(
				ctx.variant === 'vertical' ? 'flex-1 min-w-0 focus-visible:outline-none' : 'mt-3 focus-visible:outline-none',
				className
			)}
			{...(props as Record<string, unknown>)}
		>
			{children}
		</BaseTabs.Panel>
	);
}
