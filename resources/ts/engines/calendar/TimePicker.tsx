import React, { useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Button, Popover, PopoverContent, PopoverTrigger } from '../../ui';
import {
	compareTimeStrings,
	formatIsoTime,
	formatTimeString,
	parseTimeString,
	type ParsedTime,
} from './dateUtils';

const DEFAULT_TIME_PRESETS = ['09:00', '12:00', '14:00', '18:00'];

export interface TimePickerPanelProps {
	value?: string | null;
	onChange?: (isoTime: string) => void;
	hourFormat?: '24h' | '12h';
	minuteStep?: number;
	showSeconds?: boolean;
	minTime?: string;
	maxTime?: string;
	presets?: boolean | string[];
	showNowButton?: boolean;
	showClearButton?: boolean;
	onClear?: () => void;
	onDone?: () => void;
	disabled?: boolean;
	className?: string;
}

export interface TimePickerProps {
	value?: string | null;
	defaultValue?: string | null;
	onChange?: (isoTime: string) => void;
	placeholder?: string;
	hourFormat?: '24h' | '12h';
	minuteStep?: number;
	showSeconds?: boolean;
	minTime?: string;
	maxTime?: string;
	presets?: boolean | string[];
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
}

function isWithinTimeRange(candidateIso: string, minIso: string, maxIso: string): boolean {
	if (minIso !== '' && compareTimeStrings(candidateIso, minIso) < 0) {
		return false;
	}
	if (maxIso !== '' && compareTimeStrings(candidateIso, maxIso) > 0) {
		return false;
	}
	return true;
}

function clampCandidateTime(
	candidate: ParsedTime,
	minIso: string,
	maxIso: string,
	showSeconds: boolean,
): ParsedTime {
	const candidateIso = formatIsoTime(candidate, true);
	if (minIso !== '' && compareTimeStrings(candidateIso, formatIsoTime(minIso, true)) < 0) {
		return parseTimeString(minIso) ?? candidate;
	}
	const minOnlyHhMm = formatIsoTime(candidate, showSeconds);
	if (maxIso !== '' && compareTimeStrings(minOnlyHhMm, formatIsoTime(maxIso, showSeconds)) > 0) {
		return parseTimeString(maxIso) ?? candidate;
	}
	return candidate;
}

/**
 * Compact, keyboard-accessible hour/minute/(second)/(AM-PM) column picker panel.
 */
export function TimePickerPanel({
	value,
	onChange,
	hourFormat = '24h',
	minuteStep = 5,
	showSeconds = false,
	minTime,
	maxTime,
	presets = true,
	showNowButton = true,
	showClearButton = false,
	onClear,
	onDone,
	disabled = false,
	className,
}: TimePickerPanelProps): React.ReactElement {
	const is12h = hourFormat === '12h';
	const safeStep = Number.isFinite(minuteStep)
		? Math.max(1, Math.min(30, Math.floor(minuteStep)))
		: 5;
	const minIso = useMemo(() => (minTime ? formatIsoTime(minTime, showSeconds) : ''), [minTime, showSeconds]);
	const maxIso = useMemo(() => (maxTime ? formatIsoTime(maxTime, showSeconds) : ''), [maxTime, showSeconds]);

	const parsed = useMemo(() => parseTimeString(value), [value]);
	const activeHours24 = parsed ? parsed.hours : 9;
	const activeMinutes = parsed ? parsed.minutes : 0;
	const activeSeconds = parsed ? parsed.seconds : 0;
	const activePeriod: 'AM' | 'PM' = activeHours24 >= 12 ? 'PM' : 'AM';
	const activeHour12 = activeHours24 % 12 || 12;

	const hourOptions = useMemo(() => {
		if (is12h) {
			return [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
		}
		return Array.from({ length: 24 }, (_, idx) => idx);
	}, [is12h]);

	const minuteOptions = useMemo(() => {
		const list: number[] = [];
		for (let m = 0; m < 60; m += safeStep) {
			list.push(m);
		}
		if (parsed && !list.includes(parsed.minutes)) {
			list.push(parsed.minutes);
			list.sort((a, b) => a - b);
		}
		return list;
	}, [parsed, safeStep]);

	const secondOptions = useMemo(() => {
		const list: number[] = [];
		for (let s = 0; s < 60; s += safeStep) {
			list.push(s);
		}
		if (parsed && !list.includes(parsed.seconds)) {
			list.push(parsed.seconds);
			list.sort((a, b) => a - b);
		}
		return list;
	}, [parsed, safeStep]);

	const presetList = useMemo(() => {
		if (presets === false) {
			return [];
		}
		const raw = Array.isArray(presets) ? presets : DEFAULT_TIME_PRESETS;
		return raw
			.map((item) => formatIsoTime(item, false))
			.filter((iso) => iso !== '');
	}, [presets]);

	const emitTime = (next: ParsedTime) => {
		if (disabled) {
			return;
		}
		const clamped = clampCandidateTime(next, minIso, maxIso, showSeconds);
		onChange?.(formatIsoTime(clamped, showSeconds));
	};

	const toHours24 = (displayHour: number, period: 'AM' | 'PM'): number => {
		if (!is12h) {
			return displayHour;
		}
		if (period === 'AM') {
			return displayHour === 12 ? 0 : displayHour;
		}
		return displayHour === 12 ? 12 : displayHour + 12;
	};

	const isHourAllowed = (h24: number): boolean => {
		if (minIso === '' && maxIso === '') {
			return true;
		}
		const startOfHour = formatIsoTime({ hours: h24, minutes: 0, seconds: 0 }, true);
		const endOfHour = formatIsoTime({ hours: h24, minutes: 59, seconds: 59 }, true);
		const fullMin = minIso !== '' ? formatIsoTime(minIso, true) : '';
		const fullMax = maxIso !== '' ? formatIsoTime(maxIso, true) : '';
		if (fullMin !== '' && compareTimeStrings(endOfHour, fullMin) < 0) {
			return false;
		}
		if (fullMax !== '' && compareTimeStrings(startOfHour, fullMax) > 0) {
			return false;
		}
		return true;
	};

	const handleSelectNow = () => {
		if (disabled) {
			return;
		}
		const now = new Date();
		emitTime({
			hours: now.getHours(),
			minutes: now.getMinutes(),
			seconds: showSeconds ? now.getSeconds() : 0,
		});
	};

	const hasAnyFooter = showNowButton || (showClearButton && Boolean(parsed)) || Boolean(onDone);

	return (
		<div
			data-rw-time-picker=""
			className={cn(
				'flex flex-col gap-2 p-2.5 text-foreground select-none w-full max-w-[272px]',
				className,
			)}
		>
			{presetList.length > 0 ? (
				<div className="flex flex-wrap items-center gap-1 border-b border-border/70 pb-2">
					{presetList.map((presetIso) => {
						const allowed = isWithinTimeRange(presetIso, minIso, maxIso);
						const active = parsed ? formatIsoTime(parsed, false) === presetIso : false;
						return (
							<button
								key={presetIso}
								type="button"
								disabled={disabled || !allowed}
								onClick={() => {
									const p = parseTimeString(presetIso);
									if (p) {
										emitTime(p);
									}
								}}
								className={cn(
									'rounded border px-2 py-0.5 text-[11px] font-mono tabular-nums transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
									active
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground',
								)}
							>
								{formatTimeString(presetIso, { hourFormat })}
							</button>
						);
					})}
				</div>
			) : null}

			<div className="flex items-stretch gap-1.5">
				<div className="flex-1 min-w-[54px] flex flex-col gap-1" data-rw-time-column="hours">
					<span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
						{t('calendar.hourShort', 'Hr')}
					</span>
					<div className="max-h-44 overflow-y-auto rounded-md border border-border/70 bg-muted/20 p-1 space-y-0.5">
						{hourOptions.map((hVal) => {
							const h24 = toHours24(hVal, activePeriod);
							const selected = Boolean(parsed) && (is12h ? activeHour12 === hVal : activeHours24 === hVal);
							const allowed = isHourAllowed(h24);
							const label = String(hVal).padStart(2, '0');
							return (
								<button
									key={hVal}
									type="button"
									disabled={disabled || !allowed}
									aria-pressed={selected}
									data-rw-time-option={`h:${hVal}`}
									onClick={() => emitTime({ hours: h24, minutes: activeMinutes, seconds: activeSeconds })}
									className={cn(
										'flex w-full items-center justify-center rounded px-2 py-1 text-xs font-mono tabular-nums transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed',
										selected
											? 'bg-primary text-primary-foreground font-semibold'
											: 'text-foreground hover:bg-accent hover:text-accent-foreground',
									)}
								>
									{label}
								</button>
							);
						})}
					</div>
				</div>

				<div className="flex-1 min-w-[54px] flex flex-col gap-1" data-rw-time-column="minutes">
					<span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
						{t('calendar.minuteShort', 'Min')}
					</span>
					<div className="max-h-44 overflow-y-auto rounded-md border border-border/70 bg-muted/20 p-1 space-y-0.5">
						{minuteOptions.map((mVal) => {
							const candidateIso = formatIsoTime(
								{ hours: activeHours24, minutes: mVal, seconds: activeSeconds },
								showSeconds,
							);
							const allowed = isWithinTimeRange(candidateIso, minIso, maxIso);
							const selected = Boolean(parsed) && activeMinutes === mVal;
							const label = String(mVal).padStart(2, '0');
							return (
								<button
									key={mVal}
									type="button"
									disabled={disabled || !allowed}
									aria-pressed={selected}
									data-rw-time-option={`m:${mVal}`}
									onClick={() =>
										emitTime({
											hours: activeHours24,
											minutes: mVal,
											seconds: activeSeconds,
										})
									}
									className={cn(
										'flex w-full items-center justify-center rounded px-2 py-1 text-xs font-mono tabular-nums transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed',
										selected
											? 'bg-primary text-primary-foreground font-semibold'
											: 'text-foreground hover:bg-accent hover:text-accent-foreground',
									)}
								>
									{label}
								</button>
							);
						})}
					</div>
				</div>

				{showSeconds ? (
					<div className="flex-1 min-w-[54px] flex flex-col gap-1" data-rw-time-column="seconds">
						<span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
							{t('calendar.secondShort', 'Sec')}
						</span>
						<div className="max-h-44 overflow-y-auto rounded-md border border-border/70 bg-muted/20 p-1 space-y-0.5">
							{secondOptions.map((sVal) => {
								const candidateIso = formatIsoTime(
									{ hours: activeHours24, minutes: activeMinutes, seconds: sVal },
									true,
								);
								const allowed = isWithinTimeRange(candidateIso, minIso, maxIso);
								const selected = Boolean(parsed) && activeSeconds === sVal;
								const label = String(sVal).padStart(2, '0');
								return (
									<button
										key={sVal}
										type="button"
										disabled={disabled || !allowed}
										aria-pressed={selected}
										data-rw-time-option={`s:${sVal}`}
										onClick={() =>
											emitTime({
												hours: activeHours24,
												minutes: activeMinutes,
												seconds: sVal,
											})
										}
										className={cn(
											'flex w-full items-center justify-center rounded px-2 py-1 text-xs font-mono tabular-nums transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed',
											selected
												? 'bg-primary text-primary-foreground font-semibold'
												: 'text-foreground hover:bg-accent hover:text-accent-foreground',
										)}
									>
										{label}
									</button>
								);
							})}
						</div>
					</div>
				) : null}

				{is12h ? (
					<div className="w-12 shrink-0 flex flex-col gap-1" data-rw-time-column="period">
						<span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
							{t('calendar.periodShort', 'AM/PM')}
						</span>
						<div className="rounded-md border border-border/70 bg-muted/20 p-1 space-y-1">
							{(['AM', 'PM'] as const).map((period) => {
								const nextH24 =
									period === 'AM'
										? activeHours24 >= 12
											? activeHours24 - 12
											: activeHours24
										: activeHours24 < 12
											? activeHours24 + 12
											: activeHours24;
								const selected = activePeriod === period;
								const allowed = isHourAllowed(nextH24);
								return (
									<button
										key={period}
										type="button"
										disabled={disabled || !allowed}
										aria-pressed={selected}
										data-rw-time-option={`p:${period}`}
										onClick={() =>
											emitTime({
												hours: nextH24,
												minutes: activeMinutes,
												seconds: activeSeconds,
											})
										}
										className={cn(
											'flex w-full items-center justify-center rounded px-1.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed',
											selected
												? 'bg-primary text-primary-foreground'
												: 'text-foreground hover:bg-accent hover:text-accent-foreground',
										)}
									>
										{period}
									</button>
								);
							})}
						</div>
					</div>
				) : null}
			</div>

			{hasAnyFooter ? (
				<div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-border/70 pt-2">
					<div className="flex items-center gap-1">
						{showNowButton ? (
							<Button type="button" variant="ghost" size="xs" onClick={handleSelectNow} disabled={disabled}>
								{t('form.now', 'Now')}
							</Button>
						) : null}
						{showClearButton && parsed && onClear ? (
							<Button type="button" variant="ghost" size="xs" onClick={onClear} disabled={disabled}>
								{t('common.clear', 'Clear')}
							</Button>
						) : null}
					</div>
					{onDone ? (
						<Button type="button" variant="primary" size="xs" onClick={onDone}>
							{t('common.done', 'Done')}
						</Button>
					) : null}
				</div>
			) : null}
		</div>
	);
}

/**
 * Time-of-day popover picker backed by `TimePickerPanel` and Base UI `Popover`.
 */
export function TimePicker({
	value,
	defaultValue = null,
	onChange,
	placeholder,
	hourFormat = '24h',
	minuteStep = 5,
	showSeconds = false,
	minTime,
	maxTime,
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
}: TimePickerProps): React.ReactElement {
	const isControlled = value !== undefined;
	const [internalValue, setInternalValue] = useState<string | null>(defaultValue);
	const [open, setOpen] = useState(false);

	const effectiveRaw = isControlled ? value : internalValue;
	const isoValue = useMemo(() => formatIsoTime(effectiveRaw, showSeconds), [effectiveRaw, showSeconds]);
	const displayLabel = useMemo(
		() => formatTimeString(effectiveRaw, { hourFormat, showSeconds }),
		[effectiveRaw, hourFormat, showSeconds],
	);

	const commitTime = (nextIso: string) => {
		if (readOnly || disabled) {
			return;
		}
		if (!isControlled) {
			setInternalValue(nextIso || null);
		}
		onChange?.(nextIso);
	};

	const locked = disabled || readOnly;

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
							<DynamicIcon name="clock" aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
							<span className="truncate font-mono text-xs tabular-nums">
								{displayLabel || placeholder || t('calendar.selectTime', 'Select time')}
							</span>
						</Button>
					}
				/>
				<PopoverContent align={align} side={side} className="w-auto max-w-[calc(100vw-1.5rem)] p-0">
					<TimePickerPanel
						value={isoValue}
						hourFormat={hourFormat}
						minuteStep={minuteStep}
						showSeconds={showSeconds}
						minTime={minTime}
						maxTime={maxTime}
						presets={presets}
						showClearButton={clearable}
						onClear={() => commitTime('')}
						onDone={() => setOpen(false)}
						onChange={(nextIso) => commitTime(nextIso)}
					/>
				</PopoverContent>
			</Popover>
			{clearable && isoValue !== '' && !locked ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={t('calendar.clearTime', 'Clear time')}
					title={t('calendar.clearTime', 'Clear time')}
					className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
					onClick={() => commitTime('')}
				>
					<DynamicIcon name="x" aria-hidden="true" className="size-3.5" />
				</Button>
			) : null}
		</div>
	);
}
