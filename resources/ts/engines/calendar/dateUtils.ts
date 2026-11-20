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
