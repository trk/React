import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveKanbanMove, type KanbanColumnSpec } from '../../resources/ts/engines/dnd/helpers';
import {
	addDaysIso,
	buildMonthMatrix,
	buildWeekDays,
	diffDaysIso,
	formatDisplayDate,
	formatIsoDate,
	parseIsoDate,
} from '../../resources/ts/engines/calendar/dateUtils';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const MODULE_DIR = resolve(THIS_DIR, '../..');

interface TestCard {
	id: string;
	title: string;
}

describe('Phase 3 isolated engines (ReactGrid, ReactDnd, ReactCalendar)', () => {
	it('resolves Kanban within-column reorders, cross-column item drops, empty-column drops, and no-ops immutably', () => {
		const initial: KanbanColumnSpec<TestCard>[] = [
			{
				id: 'todo',
				items: [
					{ id: 'c1', title: 'First' },
					{ id: 'c2', title: 'Second' },
				],
			},
			{
				id: 'doing',
				items: [{ id: 'c3', title: 'Third' }],
			},
			{
				id: 'done',
				items: [],
			},
		];

		// Within-column reorder
		const sameCol = resolveKanbanMove(initial, (c) => c.id, 'c1', 'c2');
		expect(sameCol).not.toBeNull();
		expect(sameCol?.columns[0]?.items.map((c) => c.id)).toEqual(['c2', 'c1']);
		expect(sameCol?.event).toEqual({
			itemId: 'c1',
			fromColumnId: 'todo',
			toColumnId: 'todo',
			fromIndex: 0,
			toIndex: 1,
			sameColumn: true,
		});
		// Original array preserved
		expect(initial[0]?.items.map((c) => c.id)).toEqual(['c1', 'c2']);

		// Cross-column move onto specific item
		const crossItem = resolveKanbanMove(initial, (c) => c.id, 'c2', 'c3');
		expect(crossItem).not.toBeNull();
		expect(crossItem?.columns[0]?.items.map((c) => c.id)).toEqual(['c1']);
		expect(crossItem?.columns[1]?.items.map((c) => c.id)).toEqual(['c2', 'c3']);
		expect(crossItem?.event).toEqual({
			itemId: 'c2',
			fromColumnId: 'todo',
			toColumnId: 'doing',
			fromIndex: 1,
			toIndex: 0,
			sameColumn: false,
		});

		// Cross-column move onto empty column container
		const emptyContainer = resolveKanbanMove(initial, (c) => c.id, 'c3', 'done');
		expect(emptyContainer).not.toBeNull();
		expect(emptyContainer?.columns[1]?.items).toEqual([]);
		expect(emptyContainer?.columns[2]?.items.map((c) => c.id)).toEqual(['c3']);
		expect(emptyContainer?.event).toEqual({
			itemId: 'c3',
			fromColumnId: 'doing',
			toColumnId: 'done',
			fromIndex: 0,
			toIndex: 0,
			sameColumn: false,
		});

		// Same-ID drop and unknown IDs produce null
		expect(resolveKanbanMove(initial, (c) => c.id, 'c1', 'c1')).toBeNull();
		expect(resolveKanbanMove(initial, (c) => c.id, 'missing', 'c1')).toBeNull();
		expect(resolveKanbanMove(initial, (c) => c.id, 'c1', 'missing')).toBeNull();
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
	lazyKanban: rt.Dnd.KanbanBoardDnd,
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

console.log(JSON.stringify({
	initial: {
		hasUnstableBatchedUpdates: initial.hasUnstableBatchedUpdates,
		gridLoadedBefore: initial.gridLoadedBefore,
		dndLoadedBefore: initial.dndLoadedBefore,
		calendarLoadedBefore: initial.calendarLoadedBefore,
		lazyDataGridIsFn: typeof initial.lazyDataGrid === 'function',
		lazySortableListIsFn: typeof initial.lazySortableList === 'function',
		lazyKanbanIsFn: typeof initial.lazyKanban === 'function',
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
	kanbanReplaced: typeof rt.Dnd.KanbanBoardDnd === 'function' && rt.Dnd.KanbanBoardDnd !== initial.lazyKanban,
	treeReplaced: typeof rt.Dnd.SortableTreeCanvas === 'function' && rt.Dnd.SortableTreeCanvas !== initial.lazyTree,
	hasDndContext: Boolean(rt.Dnd.DndContext),
	calendarReplaced: typeof rt.Calendar.Calendar === 'function' && rt.Calendar.Calendar !== initial.lazyCalendar,
	datePickerReplaced: typeof rt.Calendar.DatePicker === 'function' && rt.Calendar.DatePicker !== initial.lazyDatePicker,
	dateRangePickerReplaced: typeof rt.Calendar.DateRangePicker === 'function' && rt.Calendar.DateRangePicker !== initial.lazyDateRangePicker,
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
			kanbanReplaced: boolean;
			treeReplaced: boolean;
			hasDndContext: boolean;
			calendarReplaced: boolean;
			datePickerReplaced: boolean;
			dateRangePickerReplaced: boolean;
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
			lazyKanbanIsFn: true,
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
		expect(result.kanbanReplaced).toBe(true);
		expect(result.treeReplaced).toBe(true);
		expect(result.hasDndContext).toBe(true);
		expect(result.calendarReplaced).toBe(true);
		expect(result.datePickerReplaced).toBe(true);
		expect(result.dateRangePickerReplaced).toBe(true);
		expect(result.hasDayPicker).toBe(true);
		expect(result.isoFormatted).toBe('2026-04-15');
	});
});
