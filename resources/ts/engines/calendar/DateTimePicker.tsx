import React, { useMemo, useState } from 'react';
import type { Matcher, PropsBase } from 'react-day-picker';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Button, Popover, PopoverContent, PopoverTrigger } from '../../ui';
import { Calendar } from './Calendar';
import { TimePickerPanel } from './TimePicker';
import {
	buildDateDisabledMatcher,
	formatDisplayDate,
	formatIsoDateTime,
	formatIsoTime,
	formatTimeString,
	parseIsoDate,
	parseIsoDateTime,
	parseTimeString,
	type ParsedTime,
} from './dateUtils';

export interface DateTimePickerPanelProps {
	value?: string | Date | null;
	onChange?: (isoDateTime: string, date: Date | undefined) => void;
	separator?: ' ' | 'T';
	hourFormat?: '24h' | '12h';
	minuteStep?: number;
	showSeconds?: boolean;
	timezone?: string;
	minDate?: string | Date | null;
	maxDate?: string | Date | null;
	minTime?: string;
	maxTime?: string;
	weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
	clearable?: boolean;
	disabled?: boolean;
	onDone?: () => void;
	calendarProps?: Partial<Omit<PropsBase, 'disabled' | 'mode' | 'required'>> & {
		disabled?: Matcher | Matcher[];
	};
	className?: string;
}

export interface DateTimePickerProps extends Omit<DateTimePickerPanelProps, 'onDone' | 'className'> {
	defaultValue?: string | Date | null;
	placeholder?: string;
	displayFormat?: string;
	readOnly?: boolean;
	error?: boolean;
	inlinePortal?: boolean;
	align?: 'start' | 'center' | 'end';
	side?: 'top' | 'bottom' | 'left' | 'right';
	id?: string;
	name?: string;
	className?: string;
	triggerClassName?: string;
}

function clampLocalDateBounds(
	candidate: Date,
	minDate?: string | Date | null,
	maxDate?: string | Date | null,
): Date {
	const parsedMin = parseIsoDate(minDate);
	const parsedMax = parseIsoDate(maxDate);
	if (parsedMin && candidate < parsedMin) {
		return new Date(parsedMin.getFullYear(), parsedMin.getMonth(), parsedMin.getDate());
	}
	if (parsedMax && candidate > parsedMax) {
		return new Date(parsedMax.getFullYear(), parsedMax.getMonth(), parsedMax.getDate());
	}
	return candidate;
}

/**
 * Responsive combined date + time popover body (`Calendar` stacked over `TimePickerPanel` on <640px, side-by-side on >=640px).
 */
export function DateTimePickerPanel({
	value,
	onChange,
	separator = ' ',
	hourFormat = '24h',
	minuteStep = 5,
	showSeconds = false,
	timezone,
	minDate,
	maxDate,
	minTime,
	maxTime,
	weekStartsOn,
	clearable = true,
	disabled = false,
	onDone,
	calendarProps,
	className,
}: DateTimePickerPanelProps): React.ReactElement {
	const parsed = useMemo(() => parseIsoDateTime(value), [value]);
	const selectedDate = parsed?.date;
	const selectedTimeIso = parsed ? formatIsoTime(parsed.time, showSeconds) : '';

	const disabledMatcher = useMemo(
		() => buildDateDisabledMatcher(minDate, maxDate, calendarProps?.disabled),
		[minDate, maxDate, calendarProps?.disabled],
	);

	const emitCombined = (nextDate: Date | undefined, nextTime: ParsedTime | undefined) => {
		if (disabled) {
			return;
		}
		if (!nextDate || !nextTime) {
			onChange?.('', undefined);
			return;
		}
		const combinedDate = new Date(
			nextDate.getFullYear(),
			nextDate.getMonth(),
			nextDate.getDate(),
			nextTime.hours,
			nextTime.minutes,
			nextTime.seconds,
			0,
		);
		const nextIso = formatIsoDateTime(combinedDate, nextTime, { separator, showSeconds });
		onChange?.(nextIso, combinedDate);
	};

	const handleNow = () => {
		const now = new Date();
		const boundedDate = clampLocalDateBounds(now, minDate, maxDate);
		const timePart: ParsedTime = {
			hours: now.getHours(),
			minutes: now.getMinutes(),
			seconds: showSeconds ? now.getSeconds() : 0,
		};
		emitCombined(boundedDate, timePart);
	};

	return (
		<div data-rw-datetime-popover="" className={cn('flex flex-col max-w-full max-h-[min(82vh,560px)] overflow-y-auto', className)}>
			<div className="flex flex-col sm:flex-row">
				<Calendar
					{...calendarProps}
					mode="single"
					selected={selectedDate}
					defaultMonth={selectedDate ?? calendarProps?.defaultMonth}
					weekStartsOn={weekStartsOn ?? calendarProps?.weekStartsOn}
					disabled={disabledMatcher}
					onSelect={(pickedDate) => {
						if (!pickedDate) {
							emitCombined(undefined, undefined);
							return;
						}
						const baseTime = parsed?.time ?? { hours: 9, minutes: 0, seconds: 0 };
						emitCombined(pickedDate, baseTime);
					}}
				/>
				<div className="border-t border-border/70 sm:border-t-0 sm:border-l flex flex-col justify-center">
					<TimePickerPanel
						value={selectedTimeIso}
						hourFormat={hourFormat}
						minuteStep={minuteStep}
						showSeconds={showSeconds}
						minTime={minTime}
						maxTime={maxTime}
						presets={false}
						showNowButton={false}
						showClearButton={false}
						disabled={disabled}
						className="max-w-none"
						onChange={(nextIsoTime) => {
							const parsedTime = parseTimeString(nextIsoTime);
							if (!parsedTime) {
								return;
							}
							const targetDate =
								selectedDate ?? clampLocalDateBounds(new Date(), minDate, maxDate);
							emitCombined(targetDate, parsedTime);
						}}
					/>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-2.5 py-2">
				<div className="flex flex-wrap items-center gap-1.5">
					<Button type="button" variant="ghost" size="xs" onClick={handleNow} disabled={disabled}>
						{t('form.now', 'Now')}
					</Button>
					{clearable && parsed ? (
						<Button
							type="button"
							variant="ghost"
							size="xs"
							onClick={() => emitCombined(undefined, undefined)}
							disabled={disabled}
						>
							{t('common.clear', 'Clear')}
						</Button>
					) : null}
					{timezone ? (
						<Badge variant="outline" mono className="text-[10px]">
							{timezone}
						</Badge>
					) : null}
				</div>
				{onDone ? (
					<Button type="button" variant="primary" size="xs" onClick={onDone}>
						{t('common.done', 'Done')}
					</Button>
				) : null}
			</div>
		</div>
	);
}

/**
 * Combined date + time popover picker backed by `Calendar`, `TimePickerPanel`, and Base UI `Popover`.
 */
export function DateTimePicker({
	value,
	defaultValue = null,
	onChange,
	placeholder,
	displayFormat = 'PP',
	separator = ' ',
	hourFormat = '24h',
	minuteStep = 5,
	showSeconds = false,
	timezone,
	minDate,
	maxDate,
	minTime,
	maxTime,
	weekStartsOn,
	disabled = false,
	readOnly = false,
	clearable = true,
	error = false,
	inlinePortal = false,
	align = 'start',
	side = 'bottom',
	id,
	name,
	className,
	triggerClassName,
	calendarProps,
}: DateTimePickerProps): React.ReactElement {
	const isControlled = value !== undefined;
	const [internalValue, setInternalValue] = useState<string | Date | null>(defaultValue);
	const [open, setOpen] = useState(false);

	const effectiveRaw = isControlled ? value : internalValue;
	const parsed = useMemo(() => parseIsoDateTime(effectiveRaw), [effectiveRaw]);
	const isoValue = useMemo(
		() => (parsed ? formatIsoDateTime(parsed.date, parsed.time, { separator, showSeconds }) : ''),
		[parsed, separator, showSeconds],
	);

	const displayLabel = useMemo(() => {
		if (!parsed) {
			return '';
		}
		const datePart = formatDisplayDate(parsed.date, displayFormat);
		const timePart = formatTimeString(parsed.time, { hourFormat, showSeconds });
		return timePart ? `${datePart} · ${timePart}` : datePart;
	}, [parsed, displayFormat, hourFormat, showSeconds]);

	const locked = disabled || readOnly;

	const commitDateTime = (nextIso: string, nextDate: Date | undefined) => {
		if (locked) {
			return;
		}
		if (!isControlled) {
			setInternalValue(nextIso || null);
		}
		onChange?.(nextIso, nextDate);
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
							<span className="truncate">
								{displayLabel || placeholder || t('calendar.selectDateTime', 'Select date & time')}
							</span>
						</Button>
					}
				/>
				<PopoverContent align={align} side={side} className="w-auto max-w-[calc(100vw-1.5rem)] p-0">
					<DateTimePickerPanel
						value={effectiveRaw}
						separator={separator}
						hourFormat={hourFormat}
						minuteStep={minuteStep}
						showSeconds={showSeconds}
						timezone={timezone}
						minDate={minDate}
						maxDate={maxDate}
						minTime={minTime}
						maxTime={maxTime}
						weekStartsOn={weekStartsOn}
						clearable={clearable}
						disabled={disabled}
						calendarProps={calendarProps}
						onDone={() => setOpen(false)}
						onChange={commitDateTime}
					/>
				</PopoverContent>
			</Popover>
			{clearable && parsed && !locked ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={t('calendar.clearDateTime', 'Clear date & time')}
					title={t('calendar.clearDateTime', 'Clear date & time')}
					className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
					onClick={() => commitDateTime('', undefined)}
				>
					<DynamicIcon name="x" aria-hidden="true" className="size-3.5" />
				</Button>
			) : null}
		</div>
	);
}
