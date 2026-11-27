import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	CORE_JS_ENTRIES,
	CORE_STYLE_ENTRIES,
	ISOLATED_BUILD_ENTRIES,
	MEDIA_SHIM_ENTRIES,
	TIPTAP_ADDON_ENTRIES,
} from '../../resources/entries.manifest.mjs';
import { getOptionalReactRuntime, requireReactRuntime } from '../../resources/ts/sdk/optional';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MODULE_DIR = resolve(__dirname, '../..');

describe('Phase 0 Foundation: Engine Packages, Entry Manifest & Typed SDK', () => {
	it('resolves all 8 UI, grid, drag-and-drop, and date engine packages cleanly', async () => {
		const req = createRequire(import.meta.url);
		const packages = [
			'@base-ui/react/tooltip',
			'@base-ui/react/dialog',
			'@base-ui/react/tabs',
			'@base-ui/react/popover',
			'@tanstack/react-table',
			'@tanstack/react-virtual',
			'@dnd-kit/core',
			'@dnd-kit/sortable',
			'@dnd-kit/utilities',
			'react-day-picker',
			'date-fns',
		];

		for (const pkg of packages) {
			const resolvedPath = req.resolve(pkg, { paths: [MODULE_DIR] });
			expect(existsSync(resolvedPath)).toBe(true);
		}

		const [tooltipMod, dialogMod, tabsMod, popoverMod, tableMod, virtualMod, dndCoreMod, dndSortableMod, dndUtilsMod, dayPickerMod, dateFnsMod] =
			await Promise.all([
				import('@base-ui/react/tooltip'),
				import('@base-ui/react/dialog'),
				import('@base-ui/react/tabs'),
				import('@base-ui/react/popover'),
				import('@tanstack/react-table'),
				import('@tanstack/react-virtual'),
				import('@dnd-kit/core'),
				import('@dnd-kit/sortable'),
				import('@dnd-kit/utilities'),
				import('react-day-picker'),
				import('date-fns'),
			]);

		expect(tooltipMod.Tooltip).toBeDefined();
		expect(dialogMod.Dialog).toBeDefined();
		expect(tabsMod.Tabs).toBeDefined();
		expect(popoverMod.Popover).toBeDefined();
		expect(typeof tableMod.useTable).toBe('function');
		expect(typeof tableMod.createCoreRowModel).toBe('function');
		expect(typeof virtualMod.useVirtualizer).toBe('function');
		expect(dndCoreMod.DndContext).toBeDefined();
		expect(typeof dndSortableMod.arrayMove).toBe('function');
		expect(typeof dndSortableMod.useSortable).toBe('function');
		expect(dndUtilsMod.CSS).toBeDefined();
		expect(typeof dayPickerMod.DayPicker).toBe('function');
		expect(typeof dateFnsMod.format).toBe('function');
		expect(typeof dateFnsMod.addDays).toBe('function');
	});

	it('executes engine packages under strict CSP (--disallow-code-generation-from-strings)', () => {
		const cspScript = `
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);

let evalBlocked = false;
try {
	new Function('return 1')();
} catch (err) {
	evalBlocked = err instanceof EvalError;
}
if (!evalBlocked) {
	throw new Error('Expected --disallow-code-generation-from-strings to block new Function()');
}

const dateFns = await import(req.resolve('date-fns', { paths: [process.cwd()] }));
const formatted = dateFns.format(dateFns.addDays(new Date(Date.UTC(2026, 0, 1)), 4), 'yyyy-MM-dd');

const table = await import(req.resolve('@tanstack/table-core', { paths: [process.cwd()] }));
const tableReactivity = await import(req.resolve('@tanstack/table-core/reactivity', { paths: [process.cwd()] }));
const store = await import(req.resolve('@tanstack/store', { paths: [process.cwd()] }));
const colHelper = table.createColumnHelper();
const tableInstance = table.constructTable({
	features: {
		coreReactivityFeature: tableReactivity.renderPhaseReactivity({ createAtom: store.createAtom, batch: store.batch }),
		...table.tableFeatures({}),
	},
	rowModels: {},
	data: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }],
	columns: [colHelper.accessor('name', { header: 'Name' })],
});
const coreRows = tableInstance.getCoreRowModel().rows;
const rowCount = coreRows.length;
const secondRowName = coreRows[1].getValue('name');

const dndSortable = await import(req.resolve('@dnd-kit/sortable', { paths: [process.cwd()] }));
const reordered = dndSortable.arrayMove(['a', 'b', 'c'], 0, 2);

const dndUtils = await import(req.resolve('@dnd-kit/utilities', { paths: [process.cwd()] }));
const transformCss = dndUtils.CSS.Transform.toString({ x: 10, y: 20, scaleX: 1, scaleY: 1 });

const [tooltip, dialog, tabs, popover, dndCore, virtual, dayPicker] = await Promise.all([
	import(req.resolve('@base-ui/react/tooltip', { paths: [process.cwd()] })),
	import(req.resolve('@base-ui/react/dialog', { paths: [process.cwd()] })),
	import(req.resolve('@base-ui/react/tabs', { paths: [process.cwd()] })),
	import(req.resolve('@base-ui/react/popover', { paths: [process.cwd()] })),
	import(req.resolve('@dnd-kit/core', { paths: [process.cwd()] })),
	import(req.resolve('@tanstack/react-virtual', { paths: [process.cwd()] })),
	import(req.resolve('react-day-picker', { paths: [process.cwd()] })),
]);

process.stdout.write(JSON.stringify({
	evalBlocked,
	formatted,
	rowCount,
	secondRowName,
	reordered,
	transformCss,
	hasTooltip: Boolean(tooltip.Tooltip?.Root),
	hasDialog: Boolean(dialog.Dialog?.Root),
	hasTabs: Boolean(tabs.Tabs?.Root),
	hasPopover: Boolean(popover.Popover?.Root),
	hasDndContext: Boolean(dndCore.DndContext),
	hasVirtualizer: typeof virtual.useVirtualizer === 'function',
	hasDayPicker: typeof dayPicker.DayPicker === 'function',
}));
`;
		const raw = execFileSync(
			process.execPath,
			['--disallow-code-generation-from-strings', '--input-type=module', '-e', cspScript],
			{ cwd: MODULE_DIR, encoding: 'utf8' }
		);
		const result = JSON.parse(raw.trim()) as {
			evalBlocked: boolean;
			formatted: string;
			rowCount: number;
			secondRowName: string;
			reordered: string[];
			transformCss: string;
			hasTooltip: boolean;
			hasDialog: boolean;
			hasTabs: boolean;
			hasPopover: boolean;
			hasDndContext: boolean;
			hasVirtualizer: boolean;
			hasDayPicker: boolean;
		};

		expect(result.evalBlocked).toBe(true);
		expect(result.formatted).toBe('2026-01-05');
		expect(result.rowCount).toBe(2);
		expect(result.secondRowName).toBe('Beta');
		expect(result.reordered).toEqual(['b', 'c', 'a']);
		expect(result.transformCss).toContain('translate3d(10px, 20px, 0)');
		expect(result.hasTooltip).toBe(true);
		expect(result.hasDialog).toBe(true);
		expect(result.hasTabs).toBe(true);
		expect(result.hasPopover).toBe(true);
		expect(result.hasDndContext).toBe(true);
		expect(result.hasVirtualizer).toBe(true);
		expect(result.hasDayPicker).toBe(true);
	});

	it('maintains unique, complete entry lists in resources/entries.manifest.mjs', () => {
		expect(CORE_JS_ENTRIES).toEqual([
			'ReactInertia',
			'ReactLayout',
			'ReactViewports',
			'SchemaForm',
			'ProcessReactWorkspace',
			'ReactIcons',
		]);
		expect(CORE_STYLE_ENTRIES).toEqual(['ReactInertia', 'ReactMedia', 'TiptapCore', 'ReactCalendar']);
		expect(ISOLATED_BUILD_ENTRIES).toHaveLength(21);
		expect(ISOLATED_BUILD_ENTRIES).toContain('InputfieldReactCondition');
		expect(ISOLATED_BUILD_ENTRIES).toContain('ReactGrid');
		expect(ISOLATED_BUILD_ENTRIES).toContain('ReactDnd');
		expect(ISOLATED_BUILD_ENTRIES).toContain('ReactCalendar');
		expect(ISOLATED_BUILD_ENTRIES).toContain('ReactExtraFields');
		expect(ISOLATED_BUILD_ENTRIES).toContain('ReactUiShowcase');
		expect(new Set(CORE_JS_ENTRIES).size).toBe(CORE_JS_ENTRIES.length);
		expect(new Set(CORE_STYLE_ENTRIES).size).toBe(CORE_STYLE_ENTRIES.length);
		expect(new Set(ISOLATED_BUILD_ENTRIES).size).toBe(ISOLATED_BUILD_ENTRIES.length);
		for (const addon of TIPTAP_ADDON_ENTRIES) {
			expect(ISOLATED_BUILD_ENTRIES).toContain(addon);
		}
		for (const mediaEntry of MEDIA_SHIM_ENTRIES) {
			expect(ISOLATED_BUILD_ENTRIES).toContain(mediaEntry);
		}
	});

	it('keeps sdk/optional non-throwing when ReactWorkspaceRuntime is absent and strict when required', () => {
		const prevWindow = (globalThis as Record<string, unknown>).window;
		try {
			(globalThis as Record<string, unknown>).window = {};
			expect(getOptionalReactRuntime()).toBeNull();
			expect(() => requireReactRuntime()).toThrow(/ReactWorkspaceRuntime is not initialized/);

			const fakeRuntime = { marker: true };
			(globalThis as Record<string, unknown>).window = { ReactWorkspaceRuntime: fakeRuntime };
			expect(getOptionalReactRuntime()).toBe(fakeRuntime);
			expect(requireReactRuntime()).toBe(fakeRuntime);
		} finally {
			if (prevWindow === undefined) {
				delete (globalThis as Record<string, unknown>).window;
			} else {
				(globalThis as Record<string, unknown>).window = prevWindow;
			}
		}
	});

	it('exposes Utils.sanitizeImageSrc, Inertia.submitNativeFormPost, and concrete Layout.RecordHeader in compiled bundles', () => {
		const distDir = resolve(MODULE_DIR, 'dist');
		const inspectScript = `
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const stubEl = {
	matches: () => false,
	querySelectorAll: () => [],
	querySelector: () => null,
	appendChild: () => {},
	removeChild: () => {},
	addEventListener: () => {},
	removeEventListener: () => {},
	getAttribute: () => null,
	setAttribute: () => {},
	removeAttribute: () => {},
	hasAttribute: () => false,
	classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
	dataset: {},
	style: {},
};
globalThis.HTMLElement = class HTMLElement {};
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.history = { state: null, scrollRestoration: 'auto', pushState: () => {}, replaceState: () => {} };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
globalThis.localStorage = globalThis.sessionStorage;
globalThis.location = { href: 'http://localhost/admin/', origin: 'http://localhost', pathname: '/admin/', search: '', hash: '' };
globalThis.document = {
	readyState: 'loading',
	body: stubEl,
	head: stubEl,
	documentElement: stubEl,
	getElementById: () => null,
	querySelector: () => null,
	querySelectorAll: () => [],
	createElement: () => ({ ...stubEl, style: {} }),
	addEventListener: () => {},
	removeEventListener: () => {},
};

const distDir = process.argv[1];
vm.runInThisContext(fs.readFileSync(path.join(distDir, 'ReactInertia.js'), 'utf8'), { filename: 'ReactInertia.js' });
const rt = globalThis.ReactWorkspaceRuntime;
const lazyRecordHeader = rt.Layout.RecordHeader;
const hasSanitizeImageSrc = typeof rt.Utils.sanitizeImageSrc === 'function';
const sanitizedOk = rt.Utils.sanitizeImageSrc('/img/hero.png') === '/img/hero.png'
	&& rt.Utils.sanitizeImageSrc('javascript:alert(1)') === '';
const hasSubmitNativeFormPost = typeof rt.Inertia.submitNativeFormPost === 'function';
const hasEvaluateShowIf = typeof rt.Fields?.evaluateShowIfCondition === 'function';
const hasNavigateTablist = typeof rt.Fields?.navigateTablistByKey === 'function';

vm.runInThisContext(fs.readFileSync(path.join(distDir, 'ReactLayout.js'), 'utf8'), { filename: 'ReactLayout.js' });
const concreteRecordHeader = rt.Layout.RecordHeader;

process.stdout.write(JSON.stringify({
	hasSanitizeImageSrc,
	sanitizedOk,
	hasSubmitNativeFormPost,
	hasEvaluateShowIf,
	hasNavigateTablist,
	recordHeaderReplaced: typeof concreteRecordHeader === 'function' && concreteRecordHeader !== lazyRecordHeader,
}));
`;
		const raw = execFileSync(
			process.execPath,
			['--disallow-code-generation-from-strings', '-e', inspectScript, distDir],
			{ cwd: MODULE_DIR, encoding: 'utf8' }
		);
		const result = JSON.parse(raw.trim()) as {
			hasSanitizeImageSrc: boolean;
			sanitizedOk: boolean;
			hasSubmitNativeFormPost: boolean;
			hasEvaluateShowIf: boolean;
			hasNavigateTablist: boolean;
			recordHeaderReplaced: boolean;
		};

		expect(result.hasSanitizeImageSrc).toBe(true);
		expect(result.sanitizedOk).toBe(true);
		expect(result.hasSubmitNativeFormPost).toBe(true);
		expect(result.hasEvaluateShowIf).toBe(true);
		expect(result.hasNavigateTablist).toBe(true);
		expect(result.recordHeaderReplaced).toBe(true);
	});

	it('exposes all 15 Layout shell symbols and extra Fields controls via typed SDK files and ReactInertia proxy', () => {
		const sdkLayout = readFileSync(resolve(MODULE_DIR, 'resources/ts/sdk/layout.ts'), 'utf8');
		for (const symbol of [
			'AppShell',
			'RecordHeader',
			'EditPresenceBanner',
			'postWorkspacePreferenceAction',
			'renderNoticeMarkup',
			'registerShellLayout',
			'getShellLayout',
			'listShellLayouts',
			'resolveShellLayoutDefinition',
			'useShellLayout',
			'ModuleSwitcher',
			'UserAccountMenu',
			'TopbarShellLayout',
			'SidebarShellLayout',
			'useEditPresence',
		]) {
			expect(sdkLayout).toContain(symbol);
		}

		const sdkFields = readFileSync(resolve(MODULE_DIR, 'resources/ts/sdk/fields.ts'), 'utf8');
		for (const ctrl of [
			'ColorFieldControl',
			'TagsFieldControl',
			'ComboboxFieldControl',
			'PhoneFieldControl',
			'UnitNumberFieldControl',
			'SegmentedFieldControl',
			'SpacingFieldControl',
			'OtpFieldControl',
			'PasswordFieldControl',
			'MarkdownFieldControl',
			'ExtraFieldControlIsland',
			'FieldControlIsland',
		]) {
			expect(sdkFields).toContain(ctrl);
		}
	});
});
