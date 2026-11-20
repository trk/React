import React from 'react';
import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import { cn } from '../../lib/utils';

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
	orientation?: 'vertical' | 'horizontal' | 'both';
	viewportClassName?: string;
}

export function ScrollArea({
	orientation = 'vertical',
	className,
	viewportClassName,
	children,
	...props
}: ScrollAreaProps): React.ReactElement {
	const showVertical = orientation === 'vertical' || orientation === 'both';
	const showHorizontal = orientation === 'horizontal' || orientation === 'both';

	return (
		<BaseScrollArea.Root className={cn('relative overflow-hidden', className)} {...(props as Record<string, unknown>)}>
			<BaseScrollArea.Viewport className={cn('size-full overscroll-contain', viewportClassName)}>
				<BaseScrollArea.Content>{children}</BaseScrollArea.Content>
			</BaseScrollArea.Viewport>
			{showVertical ? (
				<BaseScrollArea.Scrollbar
					orientation="vertical"
					className="m-1 flex w-1.5 touch-none select-none rounded-full bg-transparent p-0.5 transition-opacity data-[hovering]:opacity-100 data-[scrolling]:opacity-100"
				>
					<BaseScrollArea.Thumb className="w-full flex-1 rounded-full bg-border" />
				</BaseScrollArea.Scrollbar>
			) : null}
			{showHorizontal ? (
				<BaseScrollArea.Scrollbar
					orientation="horizontal"
					className="m-1 flex h-1.5 touch-none select-none rounded-full bg-transparent p-0.5 transition-opacity data-[hovering]:opacity-100 data-[scrolling]:opacity-100"
				>
					<BaseScrollArea.Thumb className="h-full flex-1 rounded-full bg-border" />
				</BaseScrollArea.Scrollbar>
			) : null}
			{showVertical && showHorizontal ? <BaseScrollArea.Corner /> : null}
		</BaseScrollArea.Root>
	);
}
