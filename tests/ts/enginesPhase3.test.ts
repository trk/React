import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { moveArrayItem } from '../../resources/ts/engines/dnd/helpers';
import {
	addDaysIso,
	buildMonthMatrix,
	buildTimeSlots,
	buildWeekDays,
	compareTimeStrings,
	diffDaysIso,
	formatDisplayDate,
	formatIsoDate,
	formatIsoDateTime,
	formatIsoTime,
	formatTimeString,
	getDefaultDateRangePresets,
	parseIsoDate,
	parseIsoDateTime,
	parseTimeString,
} from '../../resources/ts/engines/calendar/dateUtils';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const MODULE_DIR = resolve(THIS_DIR, '../..');

describe('Phase 3 isolated engines (ReactGrid, ReactDnd, ReactCalendar)', () => {
	it('moves array items immutably for sortable list reordering', () => {
		const initial = ['a', 'b', 'c'];
		expect(moveArrayItem(initial, 0, 2)).toEqual(['b', 'c', 'a']);
		expect(initial).toEqual(['a', 'b', 'c']);
	});

	it('provides accurate ISO date parsing, arithmetic, month matrices, and week grids in dateUtils', () => {
		const parsed = parseIsoDate('2026-04-15');
		expect(parsed).not.toBeNull();
		expect(formatIsoDate(parsed)).toBe('2026-04-15');
		expect(parseIsoDate('')).toBeNull();
		expect(parseIsoDate('not-a-date')).toBeNull();
		expect(formatIsoDate(new Date('invalid'))).toBe('');

		expect(addDaysIso('2026-04-15', 5)).toBe('2026-04-20');
		expect(addDaysIso('2026-04-15', -15)).toBe('2026-03-31');
		expect(addDaysIso('invalid', 3)).toBe('');

		expect(diffDaysIso('2026-04-20', '2026-04-15')).toBe(5);
		expect(diffDaysIso('2026-04-10', '2026-04-15')).toBe(-5);
		expect(diffDaysIso('bad', '2026-04-15')).toBeNull();

		const matrix = buildMonthMatrix('2026-04-15', 1);
		expect(matrix.length).toBeGreaterThanOrEqual(4);
		expect(matrix.every((row) => row.length === 7)).toBe(true);
		// Monday start -> April 1, 2026 is Wednesday, so March 30 starts the first row
		expect(formatIsoDate(matrix[0]?.[0])).toBe('2026-03-30');

		const week = buildWeekDays('2026-04-15', 1);
		expect(week).toHaveLength(7);
		expect(formatIsoDate(week[0])).toBe('2026-04-13');
		expect(formatIsoDate(week[6])).toBe('2026-04-19');

		expect(formatDisplayDate('2026-04-15', 'yyyy/MM/dd')).toBe('2026/04/15');
		expect(formatDisplayDate(null, 'yyyy/MM/dd')).toBe('');

		// Time, DateTime & Preset helpers
		expect(parseTimeString('14:30')).toEqual({ hours: 14, minutes: 30, seconds: 0 });
		expect(parseTimeString('2:05:09 PM')).toEqual({ hours: 14, minutes: 5, seconds: 9 });
		expect(parseTimeString('12:00 AM')).toEqual({ hours: 0, minutes: 0, seconds: 0 });
		expect(parseTimeString('12:15 PM')).toEqual({ hours: 12, minutes: 15, seconds: 0 });
		expect(parseTimeString('25:99')).toBeNull();
		expect(parseTimeString('')).toBeNull();

		expect(formatIsoTime({ hours: 9, minutes: 5, seconds: 7 })).toBe('09:05');
		expect(formatIsoTime('2:05:09 PM', true)).toBe('14:05:09');
		expect(formatTimeString('14:30', { hourFormat: '12h' })).toBe('02:30 PM');
		expect(formatTimeString('00:05:09', { hourFormat: '12h', showSeconds: true })).toBe('12:05:09 AM');

		expect(compareTimeStrings('08:30', '14:00')).toBe(-1);
		expect(compareTimeStrings('14:00', '14:00')).toBe(0);
		expect(compareTimeStrings('18:45', '09:15')).toBe(1);

		const parsedDt = parseIsoDateTime('2026-11-21T14:30:45');
		expect(parsedDt).not.toBeNull();
		expect(formatIsoDateTime(parsedDt?.date, parsedDt?.time)).toBe('2026-11-21 14:30');
		expect(formatIsoDateTime('2026-11-21', '14:30:45', { separator: 'T', showSeconds: true })).toBe('2026-11-21T14:30:45');
		expect(parseIsoDateTime('2026-11-21T25:99')).toBeNull();

		const slots = buildTimeSlots(30, '09:00', '10:30');
		expect(slots).toEqual(['09:00', '09:30', '10:00', '10:30']);

		const presets = getDefaultDateRangePresets();
		expect(presets.map((p) => p.id)).toEqual(['today', 'last7', 'last30', 'thisMonth', 'lastMonth']);
		const last7 = presets[1]?.getRange(new Date(2026, 10, 21));
		expect(formatIsoDate(last7?.from)).toBe('2026-11-15');
		expect(formatIsoDate(last7?.to)).toBe('2026-11-21');
	});

	it('hydrates Grid, Dnd, and Calendar proxies under strict CSP without eval or inline CSS in core', () => {
		const distDir = resolve(MODULE_DIR, 'dist');
		const inspectScript = `
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const appendedHeadTags = [];
function makeStubEl(tag = 'div') {
	const el = {
		tagName: String(tag).toUpperCase(),
		href: '',
		rel: '',
		src: '',
		async: false,
		attributes: {},
		matches: () => false,
		querySelectorAll: () => [],
		querySelector: () => null,
		appendChild: (child) => {
			appendedHeadTags.push(child);
			return child;
		},
		removeChild: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		getAttribute: (k) => el.attributes[k] ?? (k === 'href' ? el.href : null),
		setAttribute: (k, v) => { el.attributes[k] = String(v); },
		removeAttribute: (k) => { delete el.attributes[k]; },
		hasAttribute: (k) => k in el.attributes,
		classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
		dataset: {},
		style: {},
	};
	return el;
}

const stubBody = makeStubEl('body');
const stubHead = makeStubEl('head');
const stubDocEl = makeStubEl('html');

globalThis.HTMLElement = class HTMLElement {};
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.history = { state: null, scrollRestoration: 'auto', pushState: () => {}, replaceState: () => {} };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
globalThis.localStorage = globalThis.sessionStorage;
globalThis.location = { href: 'http://localhost/admin/', origin: 'http://localhost', pathname: '/admin/', search: '', hash: '' };
globalThis.document = {
	readyState: 'loading',
	body: stubBody,
	head: stubHead,
	documentElement: stubDocEl,
	getElementById: () => null,
	querySelector: () => null,
	querySelectorAll: (sel) => {
		if (String(sel).includes('script[src]')) {
			return [{ getAttribute: () => '/site/modules/React/dist/ReactInertia.js?v=1' }];
		}
		return [];
	},
	createElement: (tag) => makeStubEl(tag),
	addEventListener: () => {},
	removeEventListener: () => {},
};

const distDir = process.argv[1];
vm.runInThisContext(fs.readFileSync(path.join(distDir, 'ReactInertia.js'), 'utf8'), { filename: 'ReactInertia.js' });
const rt = globalThis.ReactWorkspaceRuntime;

const initial = {
	hasUnstableBatchedUpdates: typeof rt.ReactDOM.unstable_batchedUpdates === 'function',
	gridLoadedBefore: rt.Grid.isLoaded(),
	dndLoadedBefore: rt.Dnd.isLoaded(),
	calendarLoadedBefore: rt.Calendar.isLoaded(),
	lazyDataGrid: rt.Grid.DataGrid,
	lazySortableList: rt.Dnd.SortableListCanvas,
	lazyTree: rt.Dnd.SortableTreeCanvas,
	lazyCalendar: rt.Calendar.Calendar,
	lazyDatePicker: rt.Calendar.DatePicker,
	lazyDateRangePicker: rt.Calendar.DateRangePicker,
};

let notifications = 0;
const unsubGrid = rt.Grid.subscribe(() => { notifications += 1; });
const unsubDnd = rt.Dnd.subscribe(() => { notifications += 1; });
const unsubCal = rt.Calendar.subscribe(() => { notifications += 1; });

vm.runInThisContext(fs.readFileSync(path.join(distDir, 'ReactGrid.js'), 'utf8'), { filename: 'ReactGrid.js' });
vm.runInThisContext(fs.readFileSync(path.join(distDir, 'ReactDnd.js'), 'utf8'), { filename: 'ReactDnd.js' });
vm.runInThisContext(fs.readFileSync(path.join(distDir, 'ReactCalendar.js'), 'utf8'), { filename: 'ReactCalendar.js' });

unsubGrid();
unsubDnd();
unsubCal();

const calendarLinks = appendedHeadTags.filter(
	(el) => el.tagName === 'LINK' && el.rel === 'stylesheet' && String(el.href).includes('ReactCalendar.css'),
);

process.stdout.write(JSON.stringify({
	initial: {
		hasUnstableBatchedUpdates: initial.hasUnstableBatchedUpdates,
		gridLoadedBefore: initial.gridLoadedBefore,
		dndLoadedBefore: initial.dndLoadedBefore,
		calendarLoadedBefore: initial.calendarLoadedBefore,
		lazyDataGridIsFn: typeof initial.lazyDataGrid === 'function',
		lazySortableListIsFn: typeof initial.lazySortableList === 'function',
		lazyTreeIsFn: typeof initial.lazyTree === 'function',
		lazyCalendarIsFn: typeof initial.lazyCalendar === 'function',
		lazyDatePickerIsFn: typeof initial.lazyDatePicker === 'function',
		lazyDateRangePickerIsFn: typeof initial.lazyDateRangePicker === 'function',
	},
	notifications,
	calendarLinkCount: calendarLinks.length,
	gridLoadedAfter: rt.Grid.isLoaded(),
	dndLoadedAfter: rt.Dnd.isLoaded(),
	calendarLoadedAfter: rt.Calendar.isLoaded(),
	gridReplaced: typeof rt.Grid.DataGrid === 'function' && rt.Grid.DataGrid !== initial.lazyDataGrid,
	hasUseTable: typeof rt.Grid.useTable === 'function',
	hasUseVirtualizer: typeof rt.Grid.useVirtualizer === 'function',
	sortableListReplaced: typeof rt.Dnd.SortableListCanvas === 'function' && rt.Dnd.SortableListCanvas !== initial.lazySortableList,
	treeReplaced: typeof rt.Dnd.SortableTreeCanvas === 'function' && rt.Dnd.SortableTreeCanvas !== initial.lazyTree,
	hasDndContext: Boolean(rt.Dnd.DndContext),
	calendarReplaced: typeof rt.Calendar.Calendar === 'function' && rt.Calendar.Calendar !== initial.lazyCalendar,
	datePickerReplaced: typeof rt.Calendar.DatePicker === 'function' && rt.Calendar.DatePicker !== initial.lazyDatePicker,
	dateRangePickerReplaced: typeof rt.Calendar.DateRangePicker === 'function' && rt.Calendar.DateRangePicker !== initial.lazyDateRangePicker,
	hasTimePicker: typeof rt.Calendar.TimePicker === 'function',
	hasTimePickerPanel: typeof rt.Calendar.TimePickerPanel === 'function',
	hasDateTimePicker: typeof rt.Calendar.DateTimePicker === 'function',
	hasDateTimePickerPanel: typeof rt.Calendar.DateTimePickerPanel === 'function',
	hasDayPicker: typeof rt.Calendar.DayPicker === 'function',
	isoFormatted: typeof rt.Calendar.formatIsoDate === 'function' ? rt.Calendar.formatIsoDate('2026-04-15') : '',
}));
`;
		const raw = execFileSync(
			process.execPath,
			['--disallow-code-generation-from-strings', '-e', inspectScript, distDir],
			{ cwd: MODULE_DIR, encoding: 'utf8' },
		);
		const result = JSON.parse(raw.trim()) as {
			initial: Record<string, boolean>;
			notifications: number;
			calendarLinkCount: number;
			gridLoadedAfter: boolean;
			dndLoadedAfter: boolean;
			calendarLoadedAfter: boolean;
			gridReplaced: boolean;
			hasUseTable: boolean;
			hasUseVirtualizer: boolean;
			sortableListReplaced: boolean;
			treeReplaced: boolean;
			hasDndContext: boolean;
			calendarReplaced: boolean;
			datePickerReplaced: boolean;
			dateRangePickerReplaced: boolean;
			hasTimePicker: boolean;
			hasTimePickerPanel: boolean;
			hasDateTimePicker: boolean;
			hasDateTimePickerPanel: boolean;
			hasDayPicker: boolean;
			isoFormatted: string;
		};

		expect(result.initial).toEqual({
			hasUnstableBatchedUpdates: true,
			gridLoadedBefore: false,
			dndLoadedBefore: false,
			calendarLoadedBefore: false,
			lazyDataGridIsFn: true,
			lazySortableListIsFn: true,
			lazyTreeIsFn: true,
			lazyCalendarIsFn: true,
			lazyDatePickerIsFn: true,
			lazyDateRangePickerIsFn: true,
		});
		expect(result.notifications).toBe(3);
		expect(result.calendarLinkCount).toBe(1);
		expect(result.gridLoadedAfter).toBe(true);
		expect(result.dndLoadedAfter).toBe(true);
		expect(result.calendarLoadedAfter).toBe(true);
		expect(result.gridReplaced).toBe(true);
		expect(result.hasUseTable).toBe(true);
		expect(result.hasUseVirtualizer).toBe(true);
		expect(result.sortableListReplaced).toBe(true);
		expect(result.treeReplaced).toBe(true);
		expect(result.hasDndContext).toBe(true);
		expect(result.calendarReplaced).toBe(true);
		expect(result.datePickerReplaced).toBe(true);
		expect(result.dateRangePickerReplaced).toBe(true);
		expect(result.hasTimePicker).toBe(true);
		expect(result.hasTimePickerPanel).toBe(true);
		expect(result.hasDateTimePicker).toBe(true);
		expect(result.hasDateTimePickerPanel).toBe(true);
		expect(result.hasDayPicker).toBe(true);
		expect(result.isoFormatted).toBe('2026-04-15');
	});
});
