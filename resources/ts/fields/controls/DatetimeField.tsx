import React, { useEffect, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Button, Input, Popover, PopoverContent, PopoverTrigger } from '../../ui';
import { dispatchDomChange } from '../shared';
import type { ReactInputfieldProps } from '../types';

function resolveDatetimeParts(
	rawVal: unknown,
	dt: ReactInputfieldProps['datetime'],
	htmlType: string
): { text: string; date: string; time: string } {
	if (rawVal === undefined) {
		return {
			text: dt?.formattedValue ?? '',
			date: dt?.dateValue ?? '',
			time: dt?.timeValue ?? '',
		};
	}
	const rawStr = rawVal === null ? '' : String(rawVal);
	const trimmed = rawStr.trim();
	if (trimmed === '') {
		return { text: '', date: '', time: '' };
	}
	if (htmlType === 'time') {
		return { text: rawStr, date: dt?.dateValue ?? '', time: trimmed };
	}
	const dtMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{2}:\d{2}(?::\d{2})?)/);
	if (dtMatch) {
		return { text: rawStr, date: dtMatch[1] ?? '', time: dtMatch[2] ?? '' };
	}
	const dateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
	if (dateMatch) {
		return { text: rawStr, date: dateMatch[1] ?? '', time: '' };
	}
	return {
		text: rawStr,
		date: dt?.dateValue ?? trimmed,
		time: dt?.timeValue ?? '',
	};
}

function parseLocalYmdDate(rawDate: string): Date | undefined {
	const match = rawDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) {
		return undefined;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const candidate = new Date(year, month - 1, day);
	if (
		candidate.getFullYear() !== year ||
		candidate.getMonth() !== month - 1 ||
		candidate.getDate() !== day
	) {
		return undefined;
	}
	return candidate;
}

function formatLocalYmdDate(date: Date): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

export function DatetimeField(props: ReactInputfieldProps): React.ReactElement {
	const dt = props.datetime;
	const htmlType = dt?.htmlType || (props.controlType === 'time' ? 'time' : props.controlType === 'date' ? 'date' : 'date');
	const mode = dt?.mode || props.datetimeMode || 'picker';

	const kind: 'date' | 'time' | 'datetime' =
		props.controlType === 'time' || htmlType === 'time'
			? 'time'
			: htmlType === 'datetime-local' || htmlType === 'datetime' || Boolean(dt?.hasTime)
				? 'datetime'
				: 'date';

	const hourFormat = dt?.hourFormat ?? props.hourFormat ?? '24h';
	const minuteStep = dt?.minuteStep ?? props.minuteStep ?? dt?.timeStep ?? 5;
	const showSeconds = Boolean(dt?.showSeconds ?? props.showSeconds);
	const timezone = dt?.timezone ?? props.timezone;
	const weekStartsOn = dt?.weekStartsOn ?? props.weekStartsOn;
	const dateMin = dt?.dateMin ?? (typeof props.min === 'string' && /^\d{4}-\d{2}-\d{2}/.test(props.min) ? props.min : undefined);
	const dateMax = dt?.dateMax ?? (typeof props.max === 'string' && /^\d{4}-\d{2}-\d{2}/.test(props.max) ? props.max : undefined);
	const timeMin = dt?.timeMin ?? props.minTime;
	const timeMax = dt?.timeMax ?? props.maxTime;
	const hasError = Boolean(props.error && props.error.trim() !== '');

	const resolvedParts = resolveDatetimeParts(props.value, dt, kind === 'time' ? 'time' : htmlType);
	const incomingSig =
		props.value !== undefined
			? `${resolvedParts.text}\u0000${resolvedParts.date}\u0000${resolvedParts.time}`
			: `${dt?.formattedValue ?? ''}\u0000${dt?.dateValue ?? ''}\u0000${dt?.timeValue ?? ''}`;
	const [prevIncomingSig, setPrevIncomingSig] = useState<string>(incomingSig);
	const [textValue, setTextValue] = useState<string>(resolvedParts.text);
	const [datePart, setDatePart] = useState<string>(resolvedParts.date);
	const [timePart, setTimePart] = useState<string>(resolvedParts.time);
	const [open, setOpen] = useState<boolean>(false);
	const inputRef = useRef<HTMLInputElement | null>(null);

	if (incomingSig !== prevIncomingSig) {
		setPrevIncomingSig(incomingSig);
		if (textValue !== resolvedParts.text) {
			setTextValue(resolvedParts.text);
		}
		if (datePart !== resolvedParts.date) {
			setDatePart(resolvedParts.date);
		}
		if (timePart !== resolvedParts.time) {
			setTimePart(resolvedParts.time);
		}
	}

	useEffect(() => {
		if (mode === 'picker' && typeof window !== 'undefined' && !window.ReactWorkspaceRuntime?.Calendar?.isLoaded()) {
			void window.ReactWorkspaceRuntime?.ensureCalendarLoaded?.();
		}
	}, [mode]);

	const commitValue = (nextVal: string) => {
		if (props.readOnly || props.disabled) {
			return;
		}
		const parts = resolveDatetimeParts(nextVal, dt, kind === 'time' ? 'time' : htmlType);
		setTextValue(nextVal);
		setDatePart(parts.date);
		setTimePart(parts.time);
		props.onValueChange?.(props.name, nextVal);
		if (typeof window !== 'undefined') {
			window.requestAnimationFrame(() => dispatchDomChange(inputRef.current));
		}
	};

	const setTodayNow = () => {
		if (props.readOnly || props.disabled) {
			return;
		}
		const now = new Date();
		const isoDate = formatLocalYmdDate(now);
		const hh = String(now.getHours()).padStart(2, '0');
		const min = String(now.getMinutes()).padStart(2, '0');
		const ss = String(now.getSeconds()).padStart(2, '0');
		const isoTime = showSeconds ? `${hh}:${min}:${ss}` : `${hh}:${min}`;
		const nextVal =
			kind === 'time'
				? isoTime
				: kind === 'datetime'
					? `${isoDate} ${isoTime}`
					: isoDate;
		commitValue(nextVal);
	};

	const clearDate = () => {
		if (props.readOnly || props.disabled) {
			return;
		}
		setDatePart('');
		setTimePart('');
		setTextValue('');
		props.onValueChange?.(props.name, '');
		if (typeof window !== 'undefined') {
			window.requestAnimationFrame(() => dispatchDomChange(inputRef.current));
		}
	};

	if (mode === 'html') {
		if (kind === 'datetime') {
			return (
				<div className="flex flex-wrap items-center gap-2" data-rw-control="datetime" data-rw-datetime-kind="datetime">
					<Input
						ref={inputRef}
						id={props.id}
						name={props.name}
						type="date"
						value={datePart}
						onChange={(e) => {
							const nextDate = e.target.value;
							setDatePart(nextDate);
							const combined = nextDate ? (timePart ? `${nextDate} ${timePart}` : nextDate) : '';
							props.onValueChange?.(props.name, combined);
						}}
						min={dateMin}
						max={dateMax}
						step={dt?.dateStep && dt.dateStep > 1 ? dt.dateStep : undefined}
						readOnly={props.readOnly}
						disabled={props.disabled}
						required={props.required}
						aria-invalid={hasError || undefined}
						aria-describedby={props.describedBy}
						className={cn('w-auto min-w-[160px]', hasError && 'border-destructive focus-visible:ring-destructive/40')}
					/>
					<Input
						id={`${props.id}__time`}
						name={`${props.name}__time`}
						type="time"
						value={timePart}
						onChange={(e) => {
							const nextTime = e.target.value;
							setTimePart(nextTime);
							const combined = datePart ? (nextTime ? `${datePart} ${nextTime}` : datePart) : nextTime;
							props.onValueChange?.(props.name, combined);
						}}
						min={timeMin}
						max={timeMax}
						step={dt?.timeStep && dt.timeStep > 0 ? dt.timeStep : undefined}
						readOnly={props.readOnly}
						disabled={props.disabled}
						required={props.required}
						aria-invalid={hasError || undefined}
						className={cn('w-auto min-w-[130px]', hasError && 'border-destructive focus-visible:ring-destructive/40')}
					/>
					{!props.readOnly && !props.disabled ? (
						<Button type="button" variant="outline" size="xs" onClick={setTodayNow}>
							{t('form.now', 'Now')}
						</Button>
					) : null}
				</div>
			);
		}

		const isTimeOnly = kind === 'time';
		return (
			<div className="flex flex-wrap items-center gap-2" data-rw-control="datetime" data-rw-datetime-kind={kind}>
				<Input
					ref={inputRef}
					id={props.id}
					name={props.name}
					type={isTimeOnly ? 'time' : 'date'}
					value={isTimeOnly ? timePart : datePart}
					onChange={(e) => {
						const nextVal = e.target.value;
						if (isTimeOnly) {
							setTimePart(nextVal);
						} else {
							setDatePart(nextVal);
						}
						props.onValueChange?.(props.name, nextVal);
					}}
					min={(isTimeOnly ? timeMin : dateMin) || undefined}
					max={(isTimeOnly ? timeMax : dateMax) || undefined}
					readOnly={props.readOnly}
					disabled={props.disabled}
					required={props.required}
					aria-invalid={hasError || undefined}
					aria-describedby={props.describedBy}
					className={cn('max-w-xs', hasError && 'border-destructive focus-visible:ring-destructive/40')}
				/>
				{!props.readOnly && !props.disabled ? (
					<Button type="button" variant="outline" size="xs" onClick={setTodayNow}>
						{isTimeOnly ? t('form.now', 'Now') : t('form.today', 'Today')}
					</Button>
				) : null}
			</div>
		);
	}

	if (mode === 'text') {
		return (
			<div className="flex flex-wrap items-center gap-1.5" data-rw-control="datetime" data-rw-datetime-kind={kind}>
				<div className="relative flex-1 min-w-[200px]">
					<Input
						ref={inputRef}
						id={props.id}
						name={props.name}
						type="text"
						value={textValue}
						onChange={(e) => {
							setTextValue(e.target.value);
							props.onValueChange?.(props.name, e.target.value);
						}}
						placeholder={
							props.placeholder ||
							(kind === 'time' ? 'HH:MM' : kind === 'datetime' ? 'YYYY-MM-DD HH:MM' : 'YYYY-MM-DD')
						}
						readOnly={props.readOnly}
						disabled={props.disabled}
						required={props.required}
						aria-invalid={hasError || undefined}
						aria-describedby={props.describedBy}
						className={cn('font-mono text-xs', hasError && 'border-destructive focus-visible:ring-destructive/40')}
						{...(props.dataAttributes ?? {})}
					/>
				</div>
				{!props.readOnly && !props.disabled ? (
					<div className="inline-flex items-center gap-1">
						<Button type="button" variant="outline" size="sm" onClick={setTodayNow} className="h-9 px-2.5 text-xs">
							<DynamicIcon name={kind === 'time' ? 'clock' : 'calendar'} className="size-3.5" />
							<span>{kind === 'date' ? t('form.today', 'Today') : t('form.now', 'Now')}</span>
						</Button>
						{textValue ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={clearDate}
								aria-label={t('form.clearDate', 'Clear date')}
								title={t('form.clearDate', 'Clear date')}
								className="h-9 px-2"
							>
								<DynamicIcon name="x" className="size-3.5" />
							</Button>
						) : null}
					</div>
				) : null}
			</div>
		);
	}

	const defaultPlaceholder =
		kind === 'time'
			? showSeconds
				? 'HH:MM:SS'
				: 'HH:MM'
			: kind === 'datetime'
				? showSeconds
					? 'YYYY-MM-DD HH:MM:SS'
					: 'YYYY-MM-DD HH:MM'
				: 'YYYY-MM-DD';

	const locked = Boolean(props.readOnly || props.disabled);
	const runtimeCal = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime?.Calendar : undefined;
	const LazyCalendar = runtimeCal?.Calendar;
	const LazyTimePickerPanel = runtimeCal?.TimePickerPanel;
	const LazyDateTimePickerPanel = runtimeCal?.DateTimePickerPanel;
	const selectedLocalDate = parseLocalYmdDate(datePart);

	return (
		<div
			className="flex items-center gap-1.5 min-w-0 max-w-full"
			data-rw-control="datetime"
			data-rw-datetime-kind={kind}
		>
			<div className="relative flex-1 min-w-0">
				<Input
					ref={inputRef}
					id={props.id}
					name={props.name}
					type="text"
					value={textValue}
					onChange={(e) => {
						const next = e.target.value;
						const parts = resolveDatetimeParts(next, dt, kind === 'time' ? 'time' : htmlType);
						setTextValue(next);
						setDatePart(parts.date);
						setTimePart(parts.time);
						props.onValueChange?.(props.name, next);
					}}
					placeholder={props.placeholder || defaultPlaceholder}
					readOnly={props.readOnly}
					disabled={props.disabled}
					required={props.required}
					aria-invalid={hasError || undefined}
					aria-describedby={props.describedBy}
					className={cn(
						'font-mono text-xs tabular-nums min-w-0',
						!locked && textValue && 'pr-7',
						hasError && 'border-destructive focus-visible:ring-destructive/40',
					)}
					{...(props.dataAttributes ?? {})}
				/>
				{!locked && textValue ? (
					<button
						type="button"
						onClick={clearDate}
						aria-label={kind === 'time' ? t('calendar.clearTime', 'Clear time') : t('form.clearDate', 'Clear date')}
						title={kind === 'time' ? t('calendar.clearTime', 'Clear time') : t('form.clearDate', 'Clear date')}
						className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
					>
						<DynamicIcon name="x" aria-hidden="true" className="size-3.5" />
					</button>
				) : null}
			</div>

			{timezone ? (
				<Badge variant="outline" mono className="hidden sm:inline-flex shrink-0 text-[10px]">
					{timezone}
				</Badge>
			) : null}

			{!locked ? (
				<Popover
					open={open}
					onOpenChange={(nextOpen) => {
						if (nextOpen && typeof window !== 'undefined') {
							void window.ReactWorkspaceRuntime?.ensureCalendarLoaded?.();
						}
						setOpen(nextOpen);
					}}
				>
					<PopoverTrigger
						render={
							<Button
								type="button"
								variant="outline"
								size="icon"
								data-rw-datetime-trigger=""
								aria-label={
									kind === 'time'
										? t('calendar.selectTime', 'Select time')
										: kind === 'datetime'
											? t('calendar.selectDateTime', 'Select date & time')
											: t('calendar.selectDate', 'Select date')
								}
								title={
									kind === 'time'
										? t('calendar.selectTime', 'Select time')
										: kind === 'datetime'
											? t('calendar.selectDateTime', 'Select date & time')
											: t('calendar.selectDate', 'Select date')
								}
								className={cn(
									'size-9 shrink-0',
									hasError && 'border-destructive focus-visible:ring-destructive/40',
								)}
							>
								<DynamicIcon
									name={kind === 'time' ? 'clock' : 'calendar'}
									aria-hidden="true"
									className="size-4"
								/>
							</Button>
						}
					/>
					<PopoverContent align="end" side="bottom" className="w-auto max-w-[calc(100vw-1.5rem)] p-0">
						{kind === 'date' && LazyCalendar ? (
							<div className="flex flex-col">
								<LazyCalendar
									mode="single"
									selected={selectedLocalDate}
									defaultMonth={selectedLocalDate}
									minDate={dateMin}
									maxDate={dateMax}
									weekStartsOn={weekStartsOn}
									onSelect={(picked) => {
										if (!picked) {
											clearDate();
											setOpen(false);
											return;
										}
										commitValue(formatLocalYmdDate(picked));
										setOpen(false);
									}}
								/>
								<div className="flex items-center justify-between gap-2 border-t border-border/70 px-2.5 py-2">
									<Button
										type="button"
										variant="ghost"
										size="xs"
										onClick={() => {
											setTodayNow();
											setOpen(false);
										}}
									>
										{t('form.today', 'Today')}
									</Button>
									{textValue ? (
										<Button
											type="button"
											variant="ghost"
											size="xs"
											onClick={() => {
												clearDate();
												setOpen(false);
											}}
										>
											{t('common.clear', 'Clear')}
										</Button>
									) : null}
								</div>
							</div>
						) : kind === 'time' && LazyTimePickerPanel ? (
							<LazyTimePickerPanel
								value={timePart || textValue}
								hourFormat={hourFormat}
								minuteStep={minuteStep}
								showSeconds={showSeconds}
								minTime={timeMin}
								maxTime={timeMax}
								showClearButton
								onClear={() => {
									clearDate();
									setOpen(false);
								}}
								onDone={() => setOpen(false)}
								onChange={(isoTime) => commitValue(isoTime)}
							/>
						) : kind === 'datetime' && LazyDateTimePickerPanel ? (
							<LazyDateTimePickerPanel
								value={textValue}
								separator={textValue.includes('T') ? 'T' : ' '}
								hourFormat={hourFormat}
								minuteStep={minuteStep}
								showSeconds={showSeconds}
								timezone={timezone}
								minDate={dateMin}
								maxDate={dateMax}
								minTime={timeMin}
								maxTime={timeMax}
								weekStartsOn={weekStartsOn}
								onDone={() => setOpen(false)}
								onChange={(isoDateTime) => commitValue(isoDateTime)}
							/>
						) : (
							<div className="p-3 text-xs text-muted-foreground">
								{t('common.loading', 'Loading...')}
							</div>
						)}
					</PopoverContent>
				</Popover>
			) : null}
		</div>
	);
}
