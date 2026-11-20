import React from 'react';
import { cn } from '../../lib/utils';

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
