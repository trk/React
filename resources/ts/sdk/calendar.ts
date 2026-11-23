import type {
	CalendarEngineModule,
	CalendarProps,
	ClassNames,
	DatePickerProps,
	DateRange,
	DateRangeIsoValue,
	DateRangePickerProps,
	DateRangePreset,
	DateRangeValue,
	DateTimePickerPanelProps,
	DateTimePickerProps,
	DayPickerProps,
	Matcher,
	ParsedTime,
	PropsBase,
	TimePickerPanelProps,
	TimePickerProps,
} from '../engines/calendar';
import { requireReactRuntime } from './optional';

export const CalendarEngine = requireReactRuntime().Calendar;

export const {
	Calendar,
	DatePicker,
	TimePicker,
	TimePickerPanel,
	DateTimePicker,
	DateTimePickerPanel,
	DateRangePicker,
} = CalendarEngine;

export function ensureCalendarStyleLoaded(): void {
	requireReactRuntime().ensureCalendarStyleLoaded();
}

export function ensureCalendarLoaded(): Promise<void> {
	return requireReactRuntime().ensureCalendarLoaded();
}

export function getCalendarEngine(): CalendarEngineModule | null {
	return requireReactRuntime().Calendar.getModule();
}

export function useCalendarEngine(): CalendarEngineModule | null {
	const runtime = requireReactRuntime();
	const { useEffect, useSyncExternalStore } = runtime.React;
	const engine = useSyncExternalStore(
		runtime.Calendar.subscribe,
		runtime.Calendar.getModule,
		runtime.Calendar.getModule,
	);
	useEffect(() => {
		if (!runtime.Calendar.isLoaded()) {
			void runtime.ensureCalendarLoaded();
		}
	}, [runtime]);
	return engine;
}

export type {
	CalendarEngineModule,
	CalendarProps,
	ClassNames,
	DatePickerProps,
	DateRange,
	DateRangeIsoValue,
	DateRangePickerProps,
	DateRangePreset,
	DateRangeValue,
	DateTimePickerPanelProps,
	DateTimePickerProps,
	DayPickerProps,
	Matcher,
	ParsedTime,
	PropsBase,
	TimePickerPanelProps,
	TimePickerProps,
};
