import type { Matcher } from 'react-day-picker';
import {
	addDays,
	addMonths,
	addWeeks,
	differenceInCalendarDays,
	eachDayOfInterval,
	endOfDay,
	endOfMonth,
	endOfWeek,
	format,
	isAfter,
	isBefore,
	isSameDay,
	isSameMonth,
	isToday,
	isValid,
	isWithinInterval,
	parseISO,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subDays,
	subMonths,
	subWeeks,
} from 'date-fns';

export interface ParsedTime {
	hours: number;
	minutes: number;
	seconds: number;
}

export interface DateRangePreset {
	id: string;
	label: string;
	getRange: (today?: Date) => { from: Date; to: Date };
}

export const dateFns = {
	addDays,
	addMonths,
	addWeeks,
	differenceInCalendarDays,
	eachDayOfInterval,
	endOfDay,
	endOfMonth,
	endOfWeek,
	format,
	isAfter,
	isBefore,
	isSameDay,
	isSameMonth,
	isToday,
	isValid,
	isWithinInterval,
	parseISO,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subDays,
	subMonths,
	subWeeks,
} as const;

export {
	addDays,
	addMonths,
	addWeeks,
	differenceInCalendarDays,
	eachDayOfInterval,
	endOfDay,
	endOfMonth,
	endOfWeek,
	format,
	isAfter,
	isBefore,
	isSameDay,
	isSameMonth,
	isToday,
	isValid,
	isWithinInterval,
	parseISO,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subDays,
	subMonths,
	subWeeks,
};

/**
 * Parses an ISO date string (`YYYY-MM-DD` or ISO-8601 timestamp) or validates an
 * existing `Date`, returning `null` when empty or invalid.
 */
export function parseIsoDate(value: string | Date | null | undefined): Date | null {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	if (value instanceof Date) {
		return isValid(value) ? new Date(value.getTime()) : null;
	}
	const trimmed = value.trim();
	if (trimmed === '') {
		return null;
	}
	const parsed = parseISO(trimmed);
	return isValid(parsed) ? parsed : null;
}

/**
 * Formats a valid `Date` or ISO date string to canonical `YYYY-MM-DD`, or `''`.
 */
export function formatIsoDate(value: Date | string | null | undefined): string {
	const parsed = parseIsoDate(value);
	if (!parsed) {
		return '';
	}
	return format(parsed, 'yyyy-MM-dd');
}

/**
 * Adds a whole number of calendar days to an ISO date or `Date` and returns `YYYY-MM-DD`.
 */
export function addDaysIso(value: Date | string | null | undefined, amount: number): string {
	const parsed = parseIsoDate(value);
	if (!parsed) {
		return '';
	}
	return format(addDays(parsed, amount), 'yyyy-MM-dd');
}

/**
 * Computes signed whole-day difference (`laterDate - earlierDate`), or `null` when invalid.
 */
export function diffDaysIso(
	laterDate: Date | string | null | undefined,
	earlierDate: Date | string | null | undefined,
): number | null {
	const later = parseIsoDate(laterDate);
	const earlier = parseIsoDate(earlierDate);
	if (!later || !earlier) {
		return null;
	}
	return differenceInCalendarDays(later, earlier);
}

/**
 * Builds a 2D array of week rows (`Date[][]`) covering the visible month grid.
 */
export function buildMonthMatrix(
	monthDate: Date | string,
	weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1,
): Date[][] {
	const reference = parseIsoDate(monthDate) ?? new Date();
	const start = startOfWeek(startOfMonth(reference), { weekStartsOn });
	const end = endOfWeek(endOfMonth(reference), { weekStartsOn });
	const days = eachDayOfInterval({ start, end });
	const weeks: Date[][] = [];
	for (let i = 0; i < days.length; i += 7) {
		weeks.push(days.slice(i, i + 7));
	}
	return weeks;
}

/**
 * Returns the 7 `Date` objects spanning the calendar week of `referenceDate`.
 */
export function buildWeekDays(
	referenceDate: Date | string,
	weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1,
): Date[] {
	const reference = parseIsoDate(referenceDate) ?? new Date();
	const start = startOfWeek(reference, { weekStartsOn });
	const end = endOfWeek(reference, { weekStartsOn });
	return eachDayOfInterval({ start, end });
}

/**
 * Formats an ISO string or `Date` with a `date-fns` pattern, returning `''` when empty/invalid.
 */
export function formatDisplayDate(
	value: Date | string | null | undefined,
	pattern = 'PP',
): string {
	const parsed = parseIsoDate(value);
	if (!parsed) {
		return '';
	}
	return format(parsed, pattern);
}

/**
 * Parses `HH:MM`, `HH:MM:SS`, `H:MM`, or `h:mm(:ss) AM/PM` time strings into validated components.
 */
export function parseTimeString(value: string | null | undefined): ParsedTime | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	if (trimmed === '') {
		return null;
	}

	const match12 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
	if (match12) {
		const rawHours = Number(match12[1]);
		const minutes = Number(match12[2]);
		const seconds = match12[3] !== undefined ? Number(match12[3]) : 0;
		const meridiem = (match12[4] ?? '').toUpperCase();
		if (
			!Number.isInteger(rawHours) ||
			rawHours < 1 ||
			rawHours > 12 ||
			!Number.isInteger(minutes) ||
			minutes < 0 ||
			minutes > 59 ||
			!Number.isInteger(seconds) ||
			seconds < 0 ||
			seconds > 59
		) {
			return null;
		}
		const hours = meridiem === 'AM' ? (rawHours === 12 ? 0 : rawHours) : rawHours === 12 ? 12 : rawHours + 12;
		return { hours, minutes, seconds };
	}

	const match24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
	if (!match24) {
		return null;
	}
	const hours = Number(match24[1]);
	const minutes = Number(match24[2]);
	const seconds = match24[3] !== undefined ? Number(match24[3]) : 0;
	if (
		!Number.isInteger(hours) ||
		hours < 0 ||
		hours > 23 ||
		!Number.isInteger(minutes) ||
		minutes < 0 ||
		minutes > 59 ||
		!Number.isInteger(seconds) ||
		seconds < 0 ||
		seconds > 59
	) {
		return null;
	}
	return { hours, minutes, seconds };
}

function normalizeParsedTime(time: ParsedTime | string | null | undefined): ParsedTime | null {
	if (time === null || time === undefined) {
		return null;
	}
	if (typeof time === 'string') {
		return parseTimeString(time);
	}
	const { hours, minutes, seconds } = time;
	if (
		!Number.isInteger(hours) ||
		hours < 0 ||
		hours > 23 ||
		!Number.isInteger(minutes) ||
		minutes < 0 ||
		minutes > 59 ||
		!Number.isInteger(seconds) ||
		seconds < 0 ||
		seconds > 59
	) {
		return null;
	}
	return { hours, minutes, seconds };
}

/**
 * Formats a `ParsedTime` or time string into canonical 24-hour `HH:MM` or `HH:MM:SS`, or `''`.
 */
export function formatIsoTime(
	time: ParsedTime | string | null | undefined,
	showSeconds = false,
): string {
	const parsed = normalizeParsedTime(time);
	if (!parsed) {
		return '';
	}
	const hh = String(parsed.hours).padStart(2, '0');
	const mm = String(parsed.minutes).padStart(2, '0');
	if (!showSeconds) {
		return `${hh}:${mm}`;
	}
	const ss = String(parsed.seconds).padStart(2, '0');
	return `${hh}:${mm}:${ss}`;
}

/**
 * Formats a `ParsedTime` or time string in 24-hour or 12-hour display format, or `''`.
 */
export function formatTimeString(
	time: ParsedTime | string | null | undefined,
	options?: { showSeconds?: boolean; hourFormat?: '24h' | '12h' },
): string {
	const parsed = normalizeParsedTime(time);
	if (!parsed) {
		return '';
	}
	const showSeconds = Boolean(options?.showSeconds);
	const hourFormat = options?.hourFormat === '12h' ? '12h' : '24h';
	if (hourFormat === '24h') {
		return formatIsoTime(parsed, showSeconds);
	}
	const period = parsed.hours >= 12 ? 'PM' : 'AM';
	const h12 = parsed.hours % 12 || 12;
	const hh = String(h12).padStart(2, '0');
	const mm = String(parsed.minutes).padStart(2, '0');
	if (!showSeconds) {
		return `${hh}:${mm} ${period}`;
	}
	const ss = String(parsed.seconds).padStart(2, '0');
	return `${hh}:${mm}:${ss} ${period}`;
}

/**
 * Compares two valid time strings by second of day (`-1`, `0`, `1`; `0` if either is invalid).
 */
export function compareTimeStrings(a: string, b: string): number {
	const pa = parseTimeString(a);
	const pb = parseTimeString(b);
	if (!pa || !pb) {
		return 0;
	}
	const secA = pa.hours * 3600 + pa.minutes * 60 + pa.seconds;
	const secB = pb.hours * 3600 + pb.minutes * 60 + pb.seconds;
	return Math.sign(secA - secB);
}

/**
 * Parses an ISO date-time (`YYYY-MM-DD HH:MM`, `YYYY-MM-DDTHH:MM:SS`) or `Date` into local date and time parts.
 */
export function parseIsoDateTime(
	value: string | Date | null | undefined,
): { date: Date; time: ParsedTime } | null {
	if (value === null || value === undefined || value === '') {
		return null;
	}
	if (value instanceof Date) {
		if (!isValid(value)) {
			return null;
		}
		return {
			date: new Date(value.getTime()),
			time: {
				hours: value.getHours(),
				minutes: value.getMinutes(),
				seconds: value.getSeconds(),
			},
		};
	}
	const trimmed = value.trim();
	if (trimmed === '') {
		return null;
	}

	const splitMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s]+(.+))?$/);
	if (splitMatch) {
		const datePart = parseIsoDate(splitMatch[1]);
		if (!datePart) {
			return null;
		}
		const rawTime = splitMatch[2]?.trim() ?? '';
		if (rawTime === '') {
			return { date: datePart, time: { hours: 0, minutes: 0, seconds: 0 } };
		}
		const cleanTime = rawTime
			.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, '')
			.replace(/\.\d+$/, '')
			.trim();
		const parsedTime = parseTimeString(cleanTime);
		if (!parsedTime) {
			return null;
		}
		const combined = new Date(
			datePart.getFullYear(),
			datePart.getMonth(),
			datePart.getDate(),
			parsedTime.hours,
			parsedTime.minutes,
			parsedTime.seconds,
			0,
		);
		return isValid(combined) ? { date: combined, time: parsedTime } : null;
	}

	const parsed = parseISO(trimmed);
	if (!isValid(parsed)) {
		return null;
	}
	return {
		date: parsed,
		time: {
			hours: parsed.getHours(),
			minutes: parsed.getMinutes(),
			seconds: parsed.getSeconds(),
		},
	};
}

/**
 * Formats date and time components into `YYYY-MM-DD HH:MM` (or `T` separator / `:SS` seconds).
 */
export function formatIsoDateTime(
	date: Date | string | null | undefined,
	time: ParsedTime | string | null | undefined,
	options?: { separator?: ' ' | 'T'; showSeconds?: boolean },
): string {
	const isoDate = formatIsoDate(date);
	if (!isoDate) {
		return '';
	}
	const isoTime = formatIsoTime(time, Boolean(options?.showSeconds));
	if (!isoTime) {
		return isoDate;
	}
	const separator = options?.separator === 'T' ? 'T' : ' ';
	return `${isoDate}${separator}${isoTime}`;
}

/**
 * Builds stepped 24-hour `HH:MM` time slots constrained by optional `minTime` and `maxTime` bounds.
 */
export function buildTimeSlots(
	stepMinutes = 15,
	minTime?: string,
	maxTime?: string,
): string[] {
	const safeStep = Number.isFinite(stepMinutes)
		? Math.max(1, Math.min(240, Math.floor(stepMinutes)))
		: 15;
	const minIso = minTime ? formatIsoTime(minTime, false) : '';
	const maxIso = maxTime ? formatIsoTime(maxTime, false) : '';
	const slots: string[] = [];

	for (let total = 0; total < 24 * 60; total += safeStep) {
		const slot = formatIsoTime(
			{
				hours: Math.floor(total / 60),
				minutes: total % 60,
				seconds: 0,
			},
			false,
		);
		if (minIso !== '' && compareTimeStrings(slot, minIso) < 0) {
			continue;
		}
		if (maxIso !== '' && compareTimeStrings(slot, maxIso) > 0) {
			continue;
		}
		slots.push(slot);
	}
	return slots;
}

/**
 * Combines `minDate`, `maxDate`, and custom matchers into a unified `react-day-picker` `disabled` matcher.
 */
export function buildDateDisabledMatcher(
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
 * Standard relative presets used by `DateRangePicker`.
 */
export function getDefaultDateRangePresets(): DateRangePreset[] {
	return [
		{
			id: 'today',
			label: 'Today',
			getRange: (today = new Date()) => {
				const d = startOfDay(today);
				return { from: d, to: d };
			},
		},
		{
			id: 'last7',
			label: 'Last 7 days',
			getRange: (today = new Date()) => {
				const end = startOfDay(today);
				return { from: subDays(end, 6), to: end };
			},
		},
		{
			id: 'last30',
			label: 'Last 30 days',
			getRange: (today = new Date()) => {
				const end = startOfDay(today);
				return { from: subDays(end, 29), to: end };
			},
		},
		{
			id: 'thisMonth',
			label: 'This month',
			getRange: (today = new Date()) => ({
				from: startOfMonth(today),
				to: endOfMonth(today),
			}),
		},
		{
			id: 'lastMonth',
			label: 'Last month',
			getRange: (today = new Date()) => {
				const prev = subMonths(today, 1);
				return {
					from: startOfMonth(prev),
					to: endOfMonth(prev),
				};
			},
		},
	];
}
