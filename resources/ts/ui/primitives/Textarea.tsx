import React from 'react';
import { cn } from '../../lib/utils';

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
