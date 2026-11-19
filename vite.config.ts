import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createSelfContainedEntriesPlugin } from '../../../vite.module.ts';
import { ICON_ALIASES, POPULAR_ICONS } from './resources/ts/icons/faAliases.ts';

const TIPTAP_ADDON_ENTRIES = new Set([
	'TiptapEditor',
	'TiptapCanvas',
	'TiptapBlocks',
	'TiptapDialogs',
]);

const MEDIA_SHIM_ENTRIES = new Set([
	'InputfieldReactFile',
	'InputfieldReactImage',
]);

const ISOLATED_PASS_ENTRIES = new Set([
	'MarkupReactTable',
	'MarkupReactCards',
	'MarkupReactTab',
	'InputfieldReactKeyValue',
	'InputfieldReactIcon',
	'InputfieldReactLink',
	'ReactMedia',
	'InputfieldReactFile',
	'InputfieldReactImage',
	'InputfieldReactRelation',
	'TiptapCore',
	'TiptapEditor',
	'TiptapCanvas',
	'TiptapBlocks',
	'TiptapDialogs',
]);

async function loadTiptapShimModules(): Promise<Record<string, { runtimeExpr: string; exports: string[] }>> {
	const specs: Array<{ key: string; file: string; runtimeExpr: string }> = [
		{
			key: '@tiptap/core',
			file: resolve(import.meta.dirname, 'node_modules/@tiptap/core/dist/index.js'),
			runtimeExpr: 'window.ReactTiptapRuntime.TiptapCore',
		},
		{
			key: '@tiptap/react',
			file: resolve(import.meta.dirname, 'node_modules/@tiptap/react/dist/index.js'),
			runtimeExpr: 'window.ReactTiptapRuntime.TiptapReact',
		},
		{
			key: '@tiptap/pm/state',
			file: resolve(import.meta.dirname, 'node_modules/@tiptap/pm/dist/state/index.js'),
			runtimeExpr: 'window.ReactTiptapRuntime.TiptapPM.state',
		},
		{
			key: '@tiptap/pm/view',
			file: resolve(import.meta.dirname, 'node_modules/@tiptap/pm/dist/view/index.js'),
			runtimeExpr: 'window.ReactTiptapRuntime.TiptapPM.view',
		},
		{
			key: '@tiptap/pm/model',
			file: resolve(import.meta.dirname, 'node_modules/@tiptap/pm/dist/model/index.js'),
			runtimeExpr: 'window.ReactTiptapRuntime.TiptapPM.model',
		},
		{
			key: '@tiptap/pm/transform',
			file: resolve(import.meta.dirname, 'node_modules/@tiptap/pm/dist/transform/index.js'),
			runtimeExpr: 'window.ReactTiptapRuntime.TiptapPM.transform',
		},
		{
			key: '@tiptap/pm/commands',
			file: resolve(import.meta.dirname, 'node_modules/@tiptap/pm/dist/commands/index.js'),
			runtimeExpr: 'window.ReactTiptapRuntime.TiptapPM.commands',
		},
		{
			key: '@tiptap/pm/keymap',
			file: resolve(import.meta.dirname, 'node_modules/@tiptap/pm/dist/keymap/index.js'),
			runtimeExpr: 'window.ReactTiptapRuntime.TiptapPM.keymap',
		},
		{
			key: '@tiptap/pm/schema-list',
			file: resolve(import.meta.dirname, 'node_modules/@tiptap/pm/dist/schema-list/index.js'),
			runtimeExpr: 'window.ReactTiptapRuntime.TiptapPM.schemaList',
		},
	];

	const result: Record<string, { runtimeExpr: string; exports: string[] }> = {};
	for (const spec of specs) {
		const mod = (await import(pathToFileURL(spec.file).href)) as Record<string, unknown>;
		const exports = Object.keys(mod).filter(
			(k) => k !== '__esModule' && k !== 'default' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)
		);
		result[spec.key] = { runtimeExpr: spec.runtimeExpr, exports };
	}
	return result;
}

function vectorIconCatalogPlugin(): Plugin {
	return {
		name: 'react-workspace-vector-catalog',
		writeBundle() {
			const tablerRoot = resolve(import.meta.dirname, 'node_modules/@tabler/icons');
			const pkg = JSON.parse(readFileSync(resolve(tablerRoot, 'package.json'), 'utf8')) as {
				version?: string;
			};
			const rawMeta = JSON.parse(readFileSync(resolve(tablerRoot, 'icons.json'), 'utf8')) as Record<
				string,
				{
					name?: string;
					category?: string;
					tags?: Array<string | number>;
				}
			>;
			const rawOutline = JSON.parse(
				readFileSync(resolve(tablerRoot, 'tabler-nodes-outline.json'), 'utf8')
			) as Record<string, Array<[string, Record<string, string>]>>;
			const rawFilled = JSON.parse(
				readFileSync(resolve(tablerRoot, 'tabler-nodes-filled.json'), 'utf8')
			) as Record<string, Array<[string, Record<string, string>]>>;

			const meta: Record<string, [string, string]> = {};
			const categoryCounts = new Map<string, number>();

			for (const iconName of Object.keys(rawOutline).sort()) {
				const itemMeta = rawMeta[iconName];
				const cat = typeof itemMeta?.category === 'string' && itemMeta.category.trim() !== ''
					? itemMeta.category.trim()
					: 'Other';
				const tags = Array.isArray(itemMeta?.tags)
					? itemMeta.tags.map((t) => String(t).toLowerCase()).join(' ')
					: '';
				meta[iconName] = [cat, tags];
				categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
			}

			const categories = Array.from(categoryCounts.entries())
				.sort((a, b) => a[0].localeCompare(b[0]))
				.map(([id, count]) => ({ id, label: id, count }));

			const outDir = resolve(import.meta.dirname, 'dist');
			mkdirSync(outDir, { recursive: true });
			writeFileSync(
				resolve(outDir, 'vector-icons.json'),
				JSON.stringify({
					version: String(pkg.version || '3.0.0'),
					outlineCount: Object.keys(rawOutline).length,
					filledCount: Object.keys(rawFilled).length,
					totalVariants: Object.keys(rawOutline).length + Object.keys(rawFilled).length,
					popular: [...POPULAR_ICONS],
					categories,
					aliases: ICON_ALIASES,
					meta,
					outline: rawOutline,
					filled: rawFilled,
				})
			);
		},
	};
}

function optimizeReactWorkspaceDepsPlugin(
	isolatedEntry: string,
	tiptapShims: Record<string, { runtimeExpr: string; exports: string[] }>
): Plugin {
	const precognitionStubId = '\0virtual:laravel-precognition-stub';
	const useSyncExternalStoreId = '\0virtual:rw-use-sync-external-store';
	const useSyncExternalStoreWithSelectorId = '\0virtual:rw-use-sync-external-store-with-selector';
	const rwReactPrefix = '\0virtual:rw-runtime-react';
	const rwReactDomPrefix = '\0virtual:rw-runtime-react-dom';
	const rwReactDomClientPrefix = '\0virtual:rw-runtime-react-dom-client';
	const rwJsxPrefix = '\0virtual:rw-runtime-jsx';
	const rwUiPrefix = '\0virtual:rw-runtime-ui';
	const rwUtilsPrefix = '\0virtual:rw-runtime-utils';
	const rwI18nPrefix = '\0virtual:rw-runtime-i18n';
	const rwInertiaBridgePrefix = '\0virtual:rw-runtime-inertia-bridge';
	const rwMediaPrefix = '\0virtual:rw-runtime-media';
	const ttVirtualPrefix = '\0virtual:rw-tiptap-shim:';
	const ttCanvasTablesShimId = '\0virtual:rw-tiptap-canvas-tables';

	const pmAliasMap: Record<string, string> = {
		'prosemirror-state': '@tiptap/pm/state',
		'prosemirror-view': '@tiptap/pm/view',
		'prosemirror-model': '@tiptap/pm/model',
		'prosemirror-transform': '@tiptap/pm/transform',
		'prosemirror-commands': '@tiptap/pm/commands',
		'prosemirror-keymap': '@tiptap/pm/keymap',
		'prosemirror-schema-list': '@tiptap/pm/schema-list',
	};

	const isIsolatedPass = isolatedEntry !== '';
	const useTiptapShims = TIPTAP_ADDON_ENTRIES.has(isolatedEntry);
	const useMediaShims = MEDIA_SHIM_ENTRIES.has(isolatedEntry);

	return {
		name: 'react-workspace-optimize-deps',
		enforce: 'pre',
		resolveId(source, importer) {
			if (source === 'laravel-precognition') {
				return precognitionStubId;
			}
			if (source === 'use-sync-external-store/shim' || source === 'use-sync-external-store/shim/index.js') {
				return useSyncExternalStoreId;
			}
			if (
				source === 'use-sync-external-store/shim/with-selector' ||
				source === 'use-sync-external-store/shim/with-selector.js'
			) {
				return useSyncExternalStoreWithSelectorId;
			}

			if (isIsolatedPass) {
				if (source === 'react') {
					return `${rwReactPrefix}?entry=${isolatedEntry}`;
				}
				if (source === 'react-dom') {
					return `${rwReactDomPrefix}?entry=${isolatedEntry}`;
				}
				if (source === 'react-dom/client') {
					return `${rwReactDomClientPrefix}?entry=${isolatedEntry}`;
				}
				if (source === 'react/jsx-runtime' || source === 'react/jsx-dev-runtime') {
					return `${rwJsxPrefix}?entry=${isolatedEntry}`;
				}
				if (isolatedEntry === 'TiptapCanvas' && (source === '@tiptap/pm/tables' || source === 'prosemirror-tables')) {
					return ttCanvasTablesShimId;
				}
				if (useTiptapShims) {
					const canonicalTiptapKey = pmAliasMap[source] ?? source;
					if (canonicalTiptapKey in tiptapShims) {
						return `${ttVirtualPrefix}${canonicalTiptapKey}`;
					}
				}
				if (
					useMediaShims &&
					(source === '../media' ||
						source === './media' ||
						source === '../../fields/media' ||
						source.endsWith('/fields/media'))
				) {
					return `${rwMediaPrefix}?entry=${isolatedEntry}`;
				}
				if (source === '../ui' || source === '../../ui' || source.endsWith('/ui') || source.endsWith('/ui/index')) {
					return `${rwUiPrefix}?entry=${isolatedEntry}`;
				}
				if (source === '../lib/utils' || source === '../../lib/utils' || source.endsWith('/lib/utils')) {
					return `${rwUtilsPrefix}?entry=${isolatedEntry}`;
				}
				if (source === '../lib/i18n' || source === '../../lib/i18n' || source.endsWith('/lib/i18n')) {
					return `${rwI18nPrefix}?entry=${isolatedEntry}`;
				}
				if (
					source === '../lib/inertia-bridge' ||
					source === '../../lib/inertia-bridge' ||
					source.endsWith('/lib/inertia-bridge')
				) {
					return `${rwInertiaBridgePrefix}?entry=${isolatedEntry}`;
				}
				return null;
			}

			if (importer && importer.includes('@inertiajs')) {
				if (source === 'react') {
					return `${rwReactPrefix}?entry=ReactLayout`;
				}
				if (source === 'react-dom') {
					return `${rwReactDomPrefix}?entry=ReactLayout`;
				}
				if (source === 'react-dom/client') {
					return `${rwReactDomClientPrefix}?entry=ReactLayout`;
				}
				if (source === 'react/jsx-runtime' || source === 'react/jsx-dev-runtime') {
					return `${rwJsxPrefix}?entry=ReactLayout`;
				}
			}
			if (importer && importer.includes('@tiptap')) {
				if (source === 'react') {
					return `${rwReactPrefix}?entry=TiptapCore`;
				}
				if (source === 'react-dom') {
					return `${rwReactDomPrefix}?entry=TiptapCore`;
				}
				if (source === 'react/jsx-runtime' || source === 'react/jsx-dev-runtime') {
					return `${rwJsxPrefix}?entry=TiptapCore`;
				}
			}
			if (importer && importer.includes('?entry=')) {
				const entrySuffix = importer.slice(importer.indexOf('?entry='));
				if (source === 'react') {
					return `${rwReactPrefix}${entrySuffix}`;
				}
				if (source === 'react-dom') {
					return `${rwReactDomPrefix}${entrySuffix}`;
				}
				if (source === 'react/jsx-runtime' || source === 'react/jsx-dev-runtime') {
					return `${rwJsxPrefix}${entrySuffix}`;
				}
				if (source === '../ui' || source === '../../ui' || source.endsWith('/ui') || source.endsWith('/ui/index')) {
					return `${rwUiPrefix}${entrySuffix}`;
				}
				if (source === '../lib/utils' || source === '../../lib/utils' || source.endsWith('/lib/utils')) {
					return `${rwUtilsPrefix}${entrySuffix}`;
				}
				if (source === '../lib/i18n' || source === '../../lib/i18n' || source.endsWith('/lib/i18n')) {
					return `${rwI18nPrefix}${entrySuffix}`;
				}
				if (
					source === '../lib/inertia-bridge' ||
					source === '../../lib/inertia-bridge' ||
					source.endsWith('/lib/inertia-bridge')
				) {
					return `${rwInertiaBridgePrefix}${entrySuffix}`;
				}
			}
			return null;
		},
		load(id) {
			if (id === precognitionStubId) {
				return [
					'export const client = {',
					'  withSerializer() { return this; },',
					'  withXsrfCookieName() { return this; },',
					'  withXsrfHeaderName() { return this; },',
					'  use() { return this; },',
					'};',
					'export function createValidator() { return {}; }',
					'export function resolveName(n) { return n; }',
					'export function toSimpleValidationErrors(e) { return e || {}; }',
					'export function toValidationErrors(e) { return e || {}; }',
				].join('\n');
			}
			if (id === useSyncExternalStoreId) {
				return 'export const useSyncExternalStore = window.ReactWorkspaceRuntime.React.useSyncExternalStore;';
			}
			if (id === useSyncExternalStoreWithSelectorId) {
				return [
					'const { useSyncExternalStore, useRef, useEffect, useMemo, useDebugValue } = window.ReactWorkspaceRuntime.React;',
					'export function useSyncExternalStoreWithSelector(subscribe, getSnapshot, getServerSnapshot, selector, isEqual) {',
					'  const instRef = useRef(null);',
					'  let inst = instRef.current;',
					'  if (inst === null) { inst = { hasValue: false, value: null }; instRef.current = inst; }',
					'  const [getSelection, getServerSelection] = useMemo(() => {',
					'    let hasMemo = false, memoizedSnapshot, memoizedSelection;',
					'    const memoizedSelector = (nextSnapshot) => {',
					'      if (!hasMemo) {',
					'        hasMemo = true; memoizedSnapshot = nextSnapshot;',
					'        const nextSelection = selector(nextSnapshot);',
					'        if (isEqual !== undefined && inst.hasValue && isEqual(inst.value, nextSelection)) {',
					'          memoizedSelection = inst.value; return memoizedSelection;',
					'        }',
					'        memoizedSelection = nextSelection; return memoizedSelection;',
					'      }',
					'      if (Object.is(memoizedSnapshot, nextSnapshot)) return memoizedSelection;',
					'      const nextSelection = selector(nextSnapshot);',
					'      if (isEqual !== undefined && isEqual(memoizedSelection, nextSelection)) {',
					'        memoizedSnapshot = nextSnapshot; return memoizedSelection;',
					'      }',
					'      memoizedSnapshot = nextSnapshot; memoizedSelection = nextSelection; return memoizedSelection;',
					'    };',
					'    const maybeServer = getServerSnapshot === undefined ? null : getServerSnapshot;',
					'    return [() => memoizedSelector(getSnapshot()), maybeServer === null ? undefined : () => memoizedSelector(maybeServer())];',
					'  }, [getSnapshot, getServerSnapshot, selector, isEqual]);',
					'  const value = useSyncExternalStore(subscribe, getSelection, getServerSelection);',
					'  useEffect(() => { inst.hasValue = true; inst.value = value; }, [value]);',
					'  useDebugValue(value);',
					'  return value;',
					'}',
				].join('\n');
			}
			if (id === ttCanvasTablesShimId) {
				return [
					'export class CellSelection {',
					'  static [Symbol.hasInstance](value) {',
					'    return Boolean(value && typeof value === "object" && "$anchorCell" in value && "$headCell" in value);',
					'  }',
					'}',
				].join('\n');
			}
			if (id.startsWith(ttVirtualPrefix)) {
				const pkgKey = id.slice(ttVirtualPrefix.length);
				const spec = tiptapShims[pkgKey];
				if (spec) {
					return [
						`const M = ${spec.runtimeExpr};`,
						`export const { ${spec.exports.join(', ')} } = M;`,
					].join('\n');
				}
			}
			if (id.startsWith(rwReactDomClientPrefix)) {
				return [
					'const RDC = window.ReactWorkspaceRuntime.ReactDOMClient;',
					'export default RDC;',
					'export const { createRoot, hydrateRoot } = RDC;',
				].join('\n');
			}
			if (id.startsWith(rwReactDomPrefix)) {
				return [
					'const RD = window.ReactWorkspaceRuntime.ReactDOM;',
					'export default RD;',
					'export const { createPortal, flushSync } = RD;',
				].join('\n');
			}
			if (id.startsWith(rwReactPrefix)) {
				return [
					'const R = window.ReactWorkspaceRuntime.React;',
					'export default R;',
					'export const { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, useId, useReducer, useImperativeHandle, useContext, useDebugValue, useSyncExternalStore, use, startTransition, createContext, createRef, forwardRef, memo, Fragment, StrictMode, Suspense, createElement, cloneElement, isValidElement, Children, version } = R;',
				].join('\n');
			}
			if (id.startsWith(rwJsxPrefix)) {
				return [
					'const J = window.ReactWorkspaceRuntime.jsxRuntime;',
					'export const { jsx, jsxs, Fragment } = J;',
					'export const jsxDEV = J.jsx;',
				].join('\n');
			}
			if (id.startsWith(rwUiPrefix)) {
				return [
					'const U = window.ReactWorkspaceRuntime.UI;',
					'export const {',
					'  Button, buttonVariants, Badge, badgeVariants,',
					'  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,',
					'  Label, Input, Textarea, Select, Switch,',
					'  Tabs, TabsList, TabsTrigger, TabsContent,',
					'  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,',
					'  Alert, AlertTitle, AlertDescription, Progress, Separator, Skeleton,',
					'  Dialog, Sheet, useModalDialogController, StatCard, CliBox, CodePreview, EmptyState, ConfirmDialog,',
					'  DropdownMenu, buildViewportActionItems,',
					'  BadgeGroup, CopyValueButton, RecordLeadingVisual, useRwDarkTheme, applyTextTruncate, isFramedIconPayload, isViewportCellObject, normalizeViewportBadges, normalizeViewportThumb, resolveRecordVisuals,',
					'  SortableHandle, SortableStatusRegion, useSortableList, moveArrayItem, projectTreeReorder,',
					'  ColumnSpanSlider, clampColSpan, colSpanToPercent, percentToColSpan, formatColSpanHint,',
					'} = U;',
				].join('\n');
			}
			if (id.startsWith(rwUtilsPrefix)) {
				return [
					'const U = window.ReactWorkspaceRuntime.Utils;',
					'export const { cn, CORE_UI_ICON_NODES, DynamicIcon, getCsrfToken, normalizeIconName, notifyIconCatalogLoaded, resolveCanonicalIconName, sanitizeAssetUrl, sanitizeHref, sanitizeSameOriginUrl, isWorkspaceShellActive, withWorkspaceShellUrl, subscribeIconCatalog, t, translate, useTranslations, registerTranslations, hasTranslation, getLocale } = U;',
				].join('\n');
			}
			if (id.startsWith(rwI18nPrefix)) {
				return [
					'const R = window.ReactWorkspaceRuntime;',
					'export const { t, translate, useTranslations, registerTranslations, hasTranslation, getLocale } = R;',
				].join('\n');
			}
			if (id.startsWith(rwInertiaBridgePrefix)) {
				return [
					'const I = window.ReactWorkspaceRuntime.Inertia;',
					'export const { isInertiaAppActive, isWorkspaceShellActive, visitSameModuleHref, withWorkspaceShellUrl, SafeHead, SafeLink, safeRouter, safeUsePage } = I;',
				].join('\n');
			}
			if (id.startsWith(rwMediaPrefix)) {
				return [
					'const RM = window.ReactMediaRuntime;',
					'export const {',
					'  AssetInspectorSheet,',
					'  CompactMediaDropBar,',
					'  CompactMediaLockedBar,',
					'  clampMovedCropRect,',
					'  computeDraggedCropRect,',
					'  computePresetCropRect,',
					'  extractClipboardFiles,',
					'  formatFocusPoint,',
					'  getLanguageCountSummary,',
					'  hasDraggedOsFiles,',
					'  hydrateStudioMediaItems,',
					'  MediaCustomFieldRendererContext,',
					'  MediaHiddenFormInputs,',
					'  MultiLangDescriptionEditor,',
					'  normalizeMediaControlProps,',
					'  notifyHostFormChanged,',
					'  parseFocusPoint,',
					'  parseTagsArray,',
					'  postMediaJsonAction,',
					'  prepareImageFileForUpload,',
					'  registerMediaCustomFieldRenderer,',
					'  sanitizeHexColor,',
					'  sanitizeRasterLqip,',
					'  stripAdminCacheBuster,',
					'  TagsChipEditor,',
					'  uploadMediaFileViaXhr,',
					'  validateStudioIncomingFiles,',
					'} = RM;',
				].join('\n');
			}
			return null;
		},
	};
}

export default defineConfig(async () => {
	const rawEntry = (process.env.VITE_BUILD_ENTRY || '').trim();
	if (rawEntry !== '' && !ISOLATED_PASS_ENTRIES.has(rawEntry)) {
		throw new Error(`Unknown VITE_BUILD_ENTRY entry "${rawEntry}".`);
	}

	const isIsolatedPass = rawEntry !== '';
	const useTiptapShims = TIPTAP_ADDON_ENTRIES.has(rawEntry);
	const tiptapShims = useTiptapShims ? await loadTiptapShimModules() : {};

	const inputMap: Record<string, string> = isIsolatedPass
		? {
				[rawEntry]: resolve(import.meta.dirname, `resources/ts/entries/${rawEntry}.tsx`),
			}
		: {
				ReactInertia: resolve(import.meta.dirname, 'resources/ts/entries/ReactInertia.tsx'),
				ReactLayout: resolve(import.meta.dirname, 'resources/ts/entries/ReactLayout.tsx'),
				ReactViewports: resolve(import.meta.dirname, 'resources/ts/entries/ReactViewports.tsx'),
				SchemaForm: resolve(import.meta.dirname, 'resources/ts/entries/SchemaForm.tsx'),
				ProcessReactWorkspace: resolve(import.meta.dirname, 'resources/ts/entries/ProcessReactWorkspace.tsx'),
				ReactIcons: resolve(import.meta.dirname, 'resources/ts/entries/ReactIcons.tsx'),
				'ReactInertia.style': resolve(import.meta.dirname, 'resources/css/entries/ReactInertia.css'),
				'ReactMedia.style': resolve(import.meta.dirname, 'resources/css/entries/ReactMedia.css'),
				'TiptapCore.style': resolve(import.meta.dirname, 'resources/css/entries/TiptapCore.css'),
			};

	const plugins = isIsolatedPass
		? [
				optimizeReactWorkspaceDepsPlugin(rawEntry, tiptapShims),
				createSelfContainedEntriesPlugin([]),
				react(),
			]
		: [
				vectorIconCatalogPlugin(),
				optimizeReactWorkspaceDepsPlugin('', {}),
				createSelfContainedEntriesPlugin(['ReactInertia']),
				react(),
				tailwindcss(),
			];

	return {
		root: resolve(import.meta.dirname, 'resources'),
		publicDir: false,
		plugins,
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
		},
		build: {
			outDir: resolve(import.meta.dirname, 'dist'),
			emptyOutDir: !isIsolatedPass,
			cssCodeSplit: true,
			minify: true,
			cssMinify: true,
			chunkSizeWarningLimit: 600,
			rollupOptions: {
				input: inputMap,
				output: {
					format: 'es',
					entryFileNames: '[name].js',
					chunkFileNames: 'ReactInertia-[name].js',
					assetFileNames: (assetInfo) => {
						const name = assetInfo.names?.[0] ?? assetInfo.name ?? '';
						if (name.endsWith('.style.css')) {
							return name.replace('.style.css', '.css');
						}
						return '[name][extname]';
					},
				},
			},
		},
	};
});
