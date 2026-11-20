import React from 'react';
import { cn } from '../../lib/utils';

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
