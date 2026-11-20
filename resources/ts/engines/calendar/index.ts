export { DayPicker, getDefaultClassNames } from 'react-day-picker';
export type {
	ClassNames,
	DateRange,
	DayPickerProps,
	Matcher,
	PropsBase,
} from 'react-day-picker';

export {
	addDays,
	addDaysIso,
	addMonths,
	addWeeks,
	buildMonthMatrix,
	buildWeekDays,
	dateFns,
	diffDaysIso,
	differenceInCalendarDays,
	eachDayOfInterval,
	endOfDay,
	endOfMonth,
	endOfWeek,
	format,
	formatDisplayDate,
	formatIsoDate,
	isAfter,
	isBefore,
	isSameDay,
	isSameMonth,
	isToday,
	isValid,
	isWithinInterval,
	parseISO,
	parseIsoDate,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subDays,
	subMonths,
	subWeeks,
} from './dateUtils';

export { Calendar, type CalendarProps } from './Calendar';
export { DatePicker, type DatePickerProps } from './DatePicker';
export {
	DateRangePicker,
	type DateRangeIsoValue,
	type DateRangePickerProps,
	type DateRangeValue,
} from './DateRangePicker';

export type CalendarEngineModule = typeof import('./index');
