import React, { useMemo, useState } from 'react';
import type { DateRange, Matcher, PropsBase } from 'react-day-picker';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Button, Popover, PopoverContent, PopoverTrigger } from '../../ui';
import { Calendar } from './Calendar';
import { formatDisplayDate, formatIsoDate, parseIsoDate } from './dateUtils';

export interface DateRangeValue {
	from?: string | Date | null;
	to?: string | Date | null;
}

export interface DateRangeIsoValue {
	from: string;
	to: string;
}

export interface DateRangePickerProps {
	value?: DateRangeValue | null;
	defaultValue?: DateRangeValue | null;
	onChange?: (isoRange: DateRangeIsoValue, range: DateRange | undefined) => void;
	placeholder?: string;
	displayFormat?: string;
	numberOfMonths?: number;
	disabled?: boolean;
	clearable?: boolean;
	align?: 'start' | 'center' | 'end';
	side?: 'top' | 'bottom' | 'left' | 'right';
	id?: string;
	className?: string;
	triggerClassName?: string;
	minDate?: string | Date | null;
	maxDate?: string | Date | null;
	weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
	calendarProps?: Partial<Omit<PropsBase, 'disabled' | 'mode' | 'required' | 'numberOfMonths'>> & {
		disabled?: Matcher | Matcher[];
	};
}

function buildRangeDisabledMatcher(
	minDate: string | Date | null | undefined,
	maxDate: string | Date | null | undefined,
	extra?: Matcher | Matcher[],
): Matcher | Matcher[] | undefined {
	const matchers: Matcher[] = [];
	const parsedMin = parseIsoDate(minDate);
	const parsedMax = parseIsoDate(maxDate);
	if (parsedMin) {
		matchers.push({ before: parsedMin });
	}
	if (parsedMax) {
		matchers.push({ after: parsedMax });
	}
	if (extra) {
		if (Array.isArray(extra)) {
			matchers.push(...extra);
		} else {
			matchers.push(extra);
		}
	}
	return matchers.length > 0 ? matchers : undefined;
}

/**
 * Date-range popover picker backed by `Calendar` (`react-day-picker` range mode) and Base UI `Popover`.
 */
export function DateRangePicker({
	value,
	defaultValue = null,
	onChange,
	placeholder,
	displayFormat = 'PP',
	numberOfMonths = 2,
	disabled = false,
	clearable = true,
	align = 'start',
	side = 'bottom',
	id,
	className,
	triggerClassName,
	minDate,
	maxDate,
	weekStartsOn,
	calendarProps,
}: DateRangePickerProps): React.ReactElement {
	const isControlled = value !== undefined;
	const [internalValue, setInternalValue] = useState<DateRangeValue | null>(defaultValue);
	const [open, setOpen] = useState(false);

	const effectiveRaw = isControlled ? value : internalValue;
	const selectedRange: DateRange | undefined = useMemo(() => {
		if (!effectiveRaw) {
			return undefined;
		}
		const from = parseIsoDate(effectiveRaw.from) ?? undefined;
		const to = parseIsoDate(effectiveRaw.to) ?? undefined;
		if (!from && !to) {
			return undefined;
		}
		return { from, to };
	}, [effectiveRaw]);

	const displayLabel = useMemo(() => {
		if (!selectedRange?.from) {
			return '';
		}
		const fromText = formatDisplayDate(selectedRange.from, displayFormat);
		if (!selectedRange.to) {
			return fromText;
		}
		const toText = formatDisplayDate(selectedRange.to, displayFormat);
		return `${fromText} – ${toText}`;
	}, [selectedRange, displayFormat]);

	const disabledMatcher = useMemo(
		() => buildRangeDisabledMatcher(minDate, maxDate, calendarProps?.disabled),
		[minDate, maxDate, calendarProps?.disabled],
	);

	const commitRange = (nextRange: DateRange | undefined) => {
		const isoRange: DateRangeIsoValue = {
			from: formatIsoDate(nextRange?.from),
			to: formatIsoDate(nextRange?.to),
		};
		if (!isControlled) {
			setInternalValue(isoRange.from || isoRange.to ? isoRange : null);
		}
		onChange?.(isoRange, nextRange);
	};

	return (
		<div className={cn('inline-flex items-center gap-1', className)}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							id={id}
							type="button"
							variant="outline"
							size="sm"
							disabled={disabled}
							className={cn(
								'justify-start gap-2 font-normal',
								!displayLabel && 'text-muted-foreground',
								triggerClassName,
							)}
						>
							<DynamicIcon
								name="calendar-range"
								aria-hidden="true"
								className="size-3.5 shrink-0 opacity-70"
							/>
							<span className="truncate">
								{displayLabel || placeholder || t('calendar.selectDateRange', 'Select date range')}
							</span>
						</Button>
					}
				/>
				<PopoverContent align={align} side={side} className="w-auto p-0">
					<Calendar
						{...calendarProps}
						mode="range"
						numberOfMonths={numberOfMonths}
						selected={selectedRange}
						defaultMonth={selectedRange?.from ?? calendarProps?.defaultMonth}
						weekStartsOn={weekStartsOn ?? calendarProps?.weekStartsOn}
						disabled={disabledMatcher}
						onSelect={(range) => {
							commitRange(range);
						}}
					/>
				</PopoverContent>
			</Popover>
			{clearable && selectedRange?.from && !disabled ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={t('calendar.clearDateRange', 'Clear date range')}
					title={t('calendar.clearDateRange', 'Clear date range')}
					className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
					onClick={() => {
						commitRange(undefined);
					}}
				>
					<DynamicIcon name="x" aria-hidden="true" className="size-3.5" />
				</Button>
			) : null}
		</div>
	);
}
