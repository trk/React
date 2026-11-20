import React from 'react';
import {
	DayPicker,
	getDefaultClassNames,
	type ClassNames,
	type DayPickerProps,
} from 'react-day-picker';
import { cn, DynamicIcon } from '../../lib/utils';

export type CalendarProps = DayPickerProps & {
	containerClassName?: string;
};

function mergeClassNames(
	base: ClassNames,
	overrides?: Partial<ClassNames>,
): Partial<ClassNames> {
	if (!overrides) {
		return base;
	}
	const merged: Partial<ClassNames> = { ...base };
	for (const key of Object.keys(overrides) as Array<keyof ClassNames>) {
		const extra = overrides[key];
		if (extra) {
			merged[key] = cn(base[key], extra);
		}
	}
	return merged;
}

/**
 * Styled `react-day-picker` calendar surface bound to `[data-rw-calendar]` theme tokens.
 */
export function Calendar({
	className,
	classNames,
	components,
	containerClassName,
	showOutsideDays = true,
	...props
}: CalendarProps): React.ReactElement {
	const defaults = getDefaultClassNames();
	const mergedClassNames = mergeClassNames(defaults, classNames);

	return (
		<div
			data-rw-calendar=""
			className={cn('inline-block p-2.5', containerClassName)}
		>
			<DayPicker
				showOutsideDays={showOutsideDays}
				className={cn(defaults.root, className)}
				classNames={mergedClassNames}
				components={{
					Chevron: ({ orientation, className: iconClassName }) => {
						const iconName =
							orientation === 'left'
								? 'chevron-left'
								: orientation === 'right'
									? 'chevron-right'
									: orientation === 'up'
										? 'chevron-up'
										: 'chevron-down';
						return (
							<DynamicIcon
								name={iconName}
								aria-hidden="true"
								className={cn('size-4', iconClassName)}
							/>
						);
					},
					...components,
				}}
				{...props}
			/>
		</div>
	);
}
