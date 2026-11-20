import React from 'react';
import { Accordion as BaseAccordion } from '@base-ui/react/accordion';
import { cn, DynamicIcon } from '../../lib/utils';

export interface AccordionProps {
	multiple?: boolean;
	value?: string[];
	defaultValue?: string[];
	disabled?: boolean;
	onValueChange?: (value: string[]) => void;
	className?: string;
	children?: React.ReactNode;
}

export function Accordion({
	multiple = false,
	value,
	defaultValue,
	disabled = false,
	onValueChange,
	className,
	children,
}: AccordionProps): React.ReactElement {
	return (
		<BaseAccordion.Root
			multiple={multiple}
			value={value}
			defaultValue={defaultValue}
			disabled={disabled}
			onValueChange={(nextValue) => {
				onValueChange?.(Array.isArray(nextValue) ? nextValue.map(String) : []);
			}}
			className={cn('w-full divide-y divide-border rounded-lg border border-border bg-card', className)}
		>
			{children}
		</BaseAccordion.Root>
	);
}

export interface AccordionItemProps {
	value: string;
	disabled?: boolean;
	className?: string;
	children?: React.ReactNode;
}

export function AccordionItem({
	value,
	disabled = false,
	className,
	children,
}: AccordionItemProps): React.ReactElement {
	return (
		<BaseAccordion.Item value={value} disabled={disabled} className={cn('px-4', className)}>
			{children}
		</BaseAccordion.Item>
	);
}

export interface AccordionTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon?: string;
}

export function AccordionTrigger({
	icon,
	className,
	children,
	...props
}: AccordionTriggerProps): React.ReactElement {
	return (
		<BaseAccordion.Header className="m-0">
			<BaseAccordion.Trigger
				className={cn(
					'group flex w-full items-center justify-between gap-3 py-3 text-left text-xs font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
					className
				)}
				{...(props as Record<string, unknown>)}
			>
				<span className="flex min-w-0 items-center gap-2">
					{icon ? <DynamicIcon name={icon} className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
					<span className="truncate">{children}</span>
				</span>
				<DynamicIcon
					name="chevron-down"
					className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
					aria-hidden="true"
				/>
			</BaseAccordion.Trigger>
		</BaseAccordion.Header>
	);
}

export interface AccordionContentProps extends React.HTMLAttributes<HTMLDivElement> {
	keepMounted?: boolean;
}

export function AccordionContent({
	keepMounted,
	className,
	children,
	...props
}: AccordionContentProps): React.ReactElement {
	return (
		<BaseAccordion.Panel
			keepMounted={keepMounted}
			className={cn('pb-3.5 text-xs leading-relaxed text-muted-foreground', className)}
			{...(props as Record<string, unknown>)}
		>
			{children}
		</BaseAccordion.Panel>
	);
}
