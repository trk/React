import React, { useEffect, useMemo, useState } from 'react';
import type { DateRange, Matcher, PropsBase } from 'react-day-picker';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Button, Popover, PopoverContent, PopoverTrigger } from '../../ui';
import { Calendar } from './Calendar';
import {
	buildDateDisabledMatcher,
	diffDaysIso,
	formatDisplayDate,
	formatIsoDate,
	getDefaultDateRangePresets,
	parseIsoDate,
	type DateRangePreset,
} from './dateUtils';

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
	presets?: boolean | DateRangePreset[];
	disabled?: boolean;
	readOnly?: boolean;
	clearable?: boolean;
	error?: boolean;
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
	calendarProps?: Partial<Omit<PropsBase, 'disabled' | 'mode' | 'required' | 'numberOfMonths'>> & {
		disabled?: Matcher | Matcher[];
	};
}

function useIsNarrowViewport(): boolean {
	const [isNarrow, setIsNarrow] = useState<boolean>(() => {
		if (typeof window === 'undefined') {
			return false;
		}
		return window.innerWidth <= 639;
	});

	useEffect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
			return;
		}
		const mql = window.matchMedia('(max-width: 639px)');
		const update = () => setIsNarrow(mql.matches || window.innerWidth <= 639);
		update();
		mql.addEventListener('change', update);
		return () => mql.removeEventListener('change', update);
	}, []);

	return isNarrow;
}

/**
 * Date-range popover picker backed by `Calendar` (`react-day-picker` range mode) and Base UI `Popover`.
 * Automatically collapses to 1 month on viewports below `640px` and supports quick presets.
 */
export function DateRangePicker({
	value,
	defaultValue = null,
	onChange,
	placeholder,
	displayFormat = 'PP',
	numberOfMonths = 2,
	presets = true,
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
	minDate,
	maxDate,
	weekStartsOn,
	calendarProps,
}: DateRangePickerProps): React.ReactElement {
	const isControlled = value !== undefined;
	const [internalValue, setInternalValue] = useState<DateRangeValue | null>(defaultValue);
	const [open, setOpen] = useState(false);
	const isNarrow = useIsNarrowViewport();

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

	const isoFrom = useMemo(() => formatIsoDate(selectedRange?.from), [selectedRange?.from]);
	const isoTo = useMemo(() => formatIsoDate(selectedRange?.to), [selectedRange?.to]);
	const serializedValue = isoFrom || isoTo ? JSON.stringify({ from: isoFrom, to: isoTo }) : '';

	const daySpanCount = useMemo(() => {
		if (!isoFrom || !isoTo) {
			return null;
		}
		const diff = diffDaysIso(isoTo, isoFrom);
		return diff !== null && diff >= 0 ? diff + 1 : null;
	}, [isoFrom, isoTo]);

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
		() => buildDateDisabledMatcher(minDate, maxDate, calendarProps?.disabled),
		[minDate, maxDate, calendarProps?.disabled],
	);

	const presetItems = useMemo<DateRangePreset[]>(() => {
		if (presets === false) {
			return [];
		}
		if (Array.isArray(presets)) {
			return presets;
		}
		return getDefaultDateRangePresets();
	}, [presets]);

	const locked = disabled || readOnly;
	const effectiveMonths = numberOfMonths <= 1 || isNarrow ? 1 : numberOfMonths;

	const commitRange = (nextRange: DateRange | undefined) => {
		if (locked) {
			return;
		}
		const isoRange: DateRangeIsoValue = {
			from: formatIsoDate(nextRange?.from),
			to: formatIsoDate(nextRange?.to),
		};
		if (!isControlled) {
			setInternalValue(isoRange.from || isoRange.to ? isoRange : null);
		}
		onChange?.(isoRange, nextRange);
	};

	const parsedMinBound = useMemo(() => parseIsoDate(minDate), [minDate]);
	const parsedMaxBound = useMemo(() => parseIsoDate(maxDate), [maxDate]);

	return (
		<div className={cn('inline-flex items-center gap-1 min-w-0 max-w-full', className)}>
			{name && !inlinePortal ? <input type="hidden" name={name} value={serializedValue} /> : null}
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
								'justify-between gap-2 font-normal min-w-0 max-w-full',
								!displayLabel && 'text-muted-foreground',
								error && 'border-destructive focus-visible:ring-destructive/40',
								readOnly && 'bg-muted/40 cursor-default',
								triggerClassName,
							)}
						>
							<span className="inline-flex items-center gap-2 min-w-0 flex-1">
								<DynamicIcon
									name="calendar"
									aria-hidden="true"
									className="size-3.5 shrink-0 opacity-70"
								/>
								<span className="truncate">
									{displayLabel || placeholder || t('calendar.selectDateRange', 'Select date range')}
								</span>
							</span>
							{daySpanCount !== null ? (
								<Badge variant="secondary" mono className="shrink-0 text-[10px]">
									{daySpanCount}d
								</Badge>
							) : null}
						</Button>
					}
				/>
				<PopoverContent align={align} side={side} className="w-auto max-w-[calc(100vw-1.5rem)] p-0">
					<div className="flex flex-col max-w-full">
						<div className="flex flex-col sm:flex-row">
							{presetItems.length > 0 ? (
								<div
									data-rw-daterange-presets=""
									className="flex flex-wrap sm:flex-col gap-1 border-b border-border/70 sm:border-b-0 sm:border-r p-2 sm:w-36 shrink-0"
								>
									{presetItems.map((preset) => {
										const rawRange = preset.getRange(new Date());
										const pFrom = formatIsoDate(rawRange.from);
										const pTo = formatIsoDate(rawRange.to);
										const isActive = isoFrom !== '' && isoFrom === pFrom && isoTo === pTo;
										const outOfBounds =
											(parsedMinBound !== null && rawRange.from < parsedMinBound) ||
											(parsedMaxBound !== null && rawRange.to > parsedMaxBound);
										return (
											<button
												key={preset.id}
												type="button"
												disabled={disabled || outOfBounds}
												onClick={() => commitRange({ from: rawRange.from, to: rawRange.to })}
												className={cn(
													'rounded-md border px-2 py-1 text-left text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
													isActive
														? 'border-primary bg-primary text-primary-foreground'
														: 'border-transparent bg-muted/40 text-foreground hover:bg-accent hover:text-accent-foreground',
												)}
											>
												{preset.label}
											</button>
										);
									})}
								</div>
							) : null}

							<Calendar
								{...calendarProps}
								mode="range"
								numberOfMonths={effectiveMonths}
								selected={selectedRange}
								defaultMonth={selectedRange?.from ?? calendarProps?.defaultMonth}
								weekStartsOn={weekStartsOn ?? calendarProps?.weekStartsOn}
								disabled={disabledMatcher}
								onSelect={(range) => {
									commitRange(range);
								}}
							/>
						</div>

						<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-2.5 py-2">
							<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
								{daySpanCount !== null ? (
									<Badge variant="outline" mono className="text-[10px]">
										{t(
											'calendar.rangeDays',
											{ count: daySpanCount },
											daySpanCount === 1 ? '1 day' : `${daySpanCount} days`,
										)}
									</Badge>
								) : (
									<span>{t('calendar.pickStartAndEnd', 'Pick start and end date')}</span>
								)}
							</div>
							<div className="flex items-center gap-1">
								{clearable && selectedRange?.from ? (
									<Button
										type="button"
										variant="ghost"
										size="xs"
										onClick={() => commitRange(undefined)}
									>
										{t('common.clear', 'Clear')}
									</Button>
								) : null}
								<Button type="button" variant="primary" size="xs" onClick={() => setOpen(false)}>
									{t('common.done', 'Done')}
								</Button>
							</div>
						</div>
					</div>
				</PopoverContent>
			</Popover>
			{clearable && selectedRange?.from && !locked ? (
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
