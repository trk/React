import React, { useMemo, useState } from 'react';
import type { Matcher, PropsBase } from 'react-day-picker';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Button, Popover, PopoverContent, PopoverTrigger } from '../../ui';
import { Calendar } from './Calendar';
import {
	buildDateDisabledMatcher,
	formatDisplayDate,
	formatIsoDate,
	parseIsoDate,
} from './dateUtils';

export interface DatePickerProps {
	value?: string | Date | null;
	defaultValue?: string | Date | null;
	onChange?: (isoDate: string, date: Date | undefined) => void;
	placeholder?: string;
	displayFormat?: string;
	disabled?: boolean;
	readOnly?: boolean;
	clearable?: boolean;
	error?: boolean;
	showTodayButton?: boolean;
	inlinePortal?: boolean;
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
	readOnly = false,
	clearable = true,
	error = false,
	showTodayButton = true,
	inlinePortal = false,
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
		() => buildDateDisabledMatcher(minDate, maxDate, calendarProps?.disabled),
		[minDate, maxDate, calendarProps?.disabled],
	);

	const locked = disabled || readOnly;

	const commitDate = (nextDate: Date | undefined) => {
		if (locked) {
			return;
		}
		const nextIso = formatIsoDate(nextDate);
		if (!isControlled) {
			setInternalValue(nextIso || null);
		}
		onChange?.(nextIso, nextDate);
	};

	const pickToday = () => {
		const today = new Date();
		const parsedMin = parseIsoDate(minDate);
		const parsedMax = parseIsoDate(maxDate);
		if (parsedMin && today < parsedMin) {
			commitDate(parsedMin);
			setOpen(false);
			return;
		}
		if (parsedMax && today > parsedMax) {
			commitDate(parsedMax);
			setOpen(false);
			return;
		}
		commitDate(today);
		setOpen(false);
	};

	return (
		<div className={cn('inline-flex items-center gap-1 min-w-0 max-w-full', className)}>
			{name && !inlinePortal ? <input type="hidden" name={name} value={isoValue} /> : null}
			<Popover
				open={locked ? false : open}
				onOpenChange={(nextOpen) => {
					if (!locked) {
						setOpen(nextOpen);
					}
				}}
			>
				<PopoverTrigger
					render={
						<Button
							id={id}
							type="button"
							variant="outline"
							size="sm"
							disabled={disabled}
							aria-readonly={readOnly || undefined}
							aria-invalid={error || undefined}
							className={cn(
								'justify-start gap-2 font-normal min-w-0 max-w-full',
								!displayLabel && 'text-muted-foreground',
								error && 'border-destructive focus-visible:ring-destructive/40',
								readOnly && 'bg-muted/40 cursor-default',
								triggerClassName,
							)}
						>
							<DynamicIcon name="calendar" aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
							<span className="truncate">{displayLabel || placeholder || t('calendar.selectDate', 'Select date')}</span>
						</Button>
					}
				/>
				<PopoverContent align={align} side={side} className="w-auto max-w-[calc(100vw-1.5rem)] p-0">
					<div className="flex flex-col">
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
						{showTodayButton ? (
							<div className="flex items-center justify-between gap-2 border-t border-border/70 px-2.5 py-2">
								<Button type="button" variant="ghost" size="xs" onClick={pickToday}>
									{t('form.today', 'Today')}
								</Button>
								{clearable && selectedDate ? (
									<Button
										type="button"
										variant="ghost"
										size="xs"
										onClick={() => {
											commitDate(undefined);
											setOpen(false);
										}}
									>
										{t('common.clear', 'Clear')}
									</Button>
								) : null}
							</div>
						) : null}
					</div>
				</PopoverContent>
			</Popover>
			{clearable && selectedDate && !locked ? (
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
