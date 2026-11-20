import React, { useMemo, useState } from 'react';
import type { Matcher, PropsBase } from 'react-day-picker';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Button, Popover, PopoverContent, PopoverTrigger } from '../../ui';
import { Calendar } from './Calendar';
import { formatDisplayDate, formatIsoDate, parseIsoDate } from './dateUtils';

export interface DatePickerProps {
	value?: string | Date | null;
	defaultValue?: string | Date | null;
	onChange?: (isoDate: string, date: Date | undefined) => void;
	placeholder?: string;
	displayFormat?: string;
	disabled?: boolean;
	clearable?: boolean;
	align?: 'start' | 'center' | 'end';
	side?: 'top' | 'bottom' | 'left' | 'right';
	id?: string;
	name?: string;
	className?: string;
	triggerClassName?: string;
	minDate?: string | Date | null;
	maxDate?: string | Date | null;
	weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
	calendarProps?: Partial<Omit<PropsBase, 'disabled' | 'mode' | 'required'>> & {
		disabled?: Matcher | Matcher[];
	};
}

function buildDisabledMatcher(
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
 * Single-date popover picker backed by `Calendar` (`react-day-picker`) and Base UI `Popover`.
 */
export function DatePicker({
	value,
	defaultValue = null,
	onChange,
	placeholder,
	displayFormat = 'PP',
	disabled = false,
	clearable = true,
	align = 'start',
	side = 'bottom',
	id,
	name,
	className,
	triggerClassName,
	minDate,
	maxDate,
	weekStartsOn,
	calendarProps,
}: DatePickerProps): React.ReactElement {
	const isControlled = value !== undefined;
	const [internalValue, setInternalValue] = useState<string | Date | null>(defaultValue);
	const [open, setOpen] = useState(false);

	const effectiveRaw = isControlled ? value : internalValue;
	const selectedDate = useMemo(() => parseIsoDate(effectiveRaw) ?? undefined, [effectiveRaw]);
	const isoValue = useMemo(() => formatIsoDate(selectedDate), [selectedDate]);
	const displayLabel = useMemo(
		() => (selectedDate ? formatDisplayDate(selectedDate, displayFormat) : ''),
		[selectedDate, displayFormat],
	);

	const disabledMatcher = useMemo(
		() => buildDisabledMatcher(minDate, maxDate, calendarProps?.disabled),
		[minDate, maxDate, calendarProps?.disabled],
	);

	const commitDate = (nextDate: Date | undefined) => {
		const nextIso = formatIsoDate(nextDate);
		if (!isControlled) {
			setInternalValue(nextIso || null);
		}
		onChange?.(nextIso, nextDate);
	};

	return (
		<div className={cn('inline-flex items-center gap-1', className)}>
			{name ? <input type="hidden" name={name} value={isoValue} /> : null}
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
							<DynamicIcon name="calendar" aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
							<span className="truncate">{displayLabel || placeholder || t('calendar.selectDate', 'Select date')}</span>
						</Button>
					}
				/>
				<PopoverContent align={align} side={side} className="w-auto p-0">
					<Calendar
						{...calendarProps}
						mode="single"
						selected={selectedDate}
						defaultMonth={selectedDate ?? calendarProps?.defaultMonth}
						weekStartsOn={weekStartsOn ?? calendarProps?.weekStartsOn}
						disabled={disabledMatcher}
						onSelect={(date) => {
							commitDate(date);
							if (date) {
								setOpen(false);
							}
						}}
					/>
				</PopoverContent>
			</Popover>
			{clearable && selectedDate && !disabled ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={t('calendar.clearDate', 'Clear date')}
					title={t('calendar.clearDate', 'Clear date')}
					className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
					onClick={() => {
						commitDate(undefined);
					}}
				>
					<DynamicIcon name="x" aria-hidden="true" className="size-3.5" />
				</Button>
			) : null}
		</div>
	);
}
