import React from 'react';
import { createPortal, flushSync } from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import type * as InertiaReactModule from '@inertiajs/react';
import {
	cn,
	CORE_UI_ICON_NODES,
	DynamicIcon,
	getCsrfToken,
	normalizeIconName,
	notifyIconCatalogLoaded,
	resolveCanonicalIconName,
	sanitizeAssetUrl,
	sanitizeHref,
	sanitizeSameOriginUrl,
	subscribeIconCatalog,
} from '../lib/utils';
import {
	getLocale,
	hasTranslation,
	registerTranslations,
	syncTranslationsFromDom,
	t,
	translate,
	useTranslations,
} from '../lib/i18n';
import {
	getInertiaAdapter,
	isInertiaAppActive,
	isWorkspaceShellActive,
	markInertiaBooted,
	SafeHead,
	SafeLink,
	safeRouter,
	safeUsePage,
	setInertiaAdapter,
	visitSameModuleHref,
	withWorkspaceShellUrl,
} from '../lib/inertia-bridge';
import * as UI from '../ui';
import type * as LayoutType from '../layout/AppShell';
import type * as ViewportsType from '../viewports/DataViewport';
import type { DataTableCanvas as DataTableCanvasType } from '../viewports/DataTableCanvas';
import type { DataCardsCanvas as DataCardsCanvasType } from '../viewports/DataCardsCanvas';
import type * as FieldsType from '../fields/SchemaForm';
import type * as MediaUtilsType from '../fields/mediaUtils';
import type { FileFieldControl as FileFieldControlType } from '../fields/controls/FileField';
import type { IconFieldControl as IconFieldControlType } from '../fields/controls/IconField';
import type { ImageFieldControl as ImageFieldControlType } from '../fields/controls/ImageField';
import type { KeyValueFieldControl as KeyValueFieldControlType } from '../fields/controls/KeyValueField';
import type { LinkFieldControl as LinkFieldControlType } from '../fields/controls/LinkField';
import type { RelationFieldControl as RelationFieldControlType } from '../fields/controls/RelationField';

interface LazyFallbackWrapperProps extends Record<string, unknown> {
	fallback?: React.ReactNode;
	children?: React.ReactNode;
}

const LazyDeferred: React.FC<LazyFallbackWrapperProps> = (props) => {
	const adapter = getInertiaAdapter();
	if (adapter?.Deferred) {
		const AdapterDeferred = adapter.Deferred as unknown as React.ComponentType<LazyFallbackWrapperProps>;
		return React.createElement(AdapterDeferred, props);
	}
	return (props?.fallback ?? props?.children ?? null) as React.ReactElement | null;
};

const LazyWhenVisible: React.FC<LazyFallbackWrapperProps> = (props) => {
	const adapter = getInertiaAdapter();
	if (adapter?.WhenVisible) {
		const AdapterWhenVisible = adapter.WhenVisible as unknown as React.ComponentType<LazyFallbackWrapperProps>;
		return React.createElement(AdapterWhenVisible, props);
	}
	return (props?.children ?? props?.fallback ?? null) as React.ReactElement | null;
};

const InertiaReact = {
	createInertiaApp: (async (options: Parameters<typeof InertiaReactModule.createInertiaApp>[0]) => {
		await ensureLayoutLoaded();
		const adapter = getInertiaAdapter();
		if (!adapter) {
			throw new Error('Inertia adapter failed to load from ReactLayout.js.');
		}
		return adapter.createInertiaApp(options);
	}) as typeof InertiaReactModule.createInertiaApp,
	isInertiaAppActive,
	isWorkspaceShellActive,
	visitSameModuleHref,
	withWorkspaceShellUrl,
	SafeHead,
	SafeLink,
	safeRouter,
	safeUsePage,
	Deferred: LazyDeferred as unknown as typeof InertiaReactModule.Deferred,
	Head: SafeHead,
	Link: SafeLink,
	router: safeRouter,
	usePage: safeUsePage,
	usePoll: ((
		interval: Parameters<typeof InertiaReactModule.usePoll>[0],
		requestOptions?: Parameters<typeof InertiaReactModule.usePoll>[1],
		options?: Parameters<typeof InertiaReactModule.usePoll>[2]
	) => {
		const adapter = getInertiaAdapter();
		if (adapter?.usePoll) {
			return adapter.usePoll(interval, requestOptions, options);
		}
		return { start: () => {}, stop: () => {} };
	}) as typeof InertiaReactModule.usePoll,
	usePrefetch: ((options?: Parameters<typeof InertiaReactModule.usePrefetch>[0]) => {
		const adapter = getInertiaAdapter();
		if (adapter?.usePrefetch) {
			return adapter.usePrefetch(options);
		}
		return { lastUpdatedAt: null, isPrefetching: false, isPrefetched: false, flush: () => {} };
	}) as typeof InertiaReactModule.usePrefetch,
	useRemember: (<State,>(initialState: State, key?: string) => {
		const adapter = getInertiaAdapter();
		if (adapter?.useRemember) {
			return adapter.useRemember(initialState, key);
		}
		return React.useState<State>(initialState);
	}) as typeof InertiaReactModule.useRemember,
	WhenVisible: LazyWhenVisible as unknown as typeof InertiaReactModule.WhenVisible,
};

const ReactDOM = {
	createPortal,
	flushSync,
};

type PageComponent = React.ComponentType<Record<string, unknown>>;
type RegistrableComponent = PageComponent | React.ComponentType<never>;

const pageRegistry = new Map<string, PageComponent>();
const pendingPageResolvers = new Map<string, Array<(component: PageComponent) => void>>();
const islandRegistry = new Map<string, PageComponent>();
const islandRegistryListeners = new Set<() => void>();
const mountedIslands = new Map<Element, ReactDOMClient.Root>();
const ISLAND_SELECTOR = '[data-inertia-island], [data-react-island]';

export function getIsland(name: string): PageComponent | undefined {
	return islandRegistry.get(name) || pageRegistry.get(name);
}

export function subscribeIslands(listener: () => void): () => void {
	islandRegistryListeners.add(listener);
	return () => {
		islandRegistryListeners.delete(listener);
	};
}
const injectedAssetUrls = new Set<string>();
const runtimeScriptPromises = new Map<string, Promise<void>>();

const viewportModeRegistry = new Map<string, React.ComponentType<ViewportsType.ViewportCanvasProps>>();
const viewportModeListeners = new Set<() => void>();

export function registerViewportMode(
	mode: string,
	component: React.ComponentType<ViewportsType.ViewportCanvasProps>
): void {
	viewportModeRegistry.set(mode.toLowerCase(), component);
	viewportModeListeners.forEach((fn) => fn());
}

export function getViewportMode(
	mode: string
): React.ComponentType<ViewportsType.ViewportCanvasProps> | undefined {
	return viewportModeRegistry.get(mode.toLowerCase());
}

export function subscribeViewportModes(listener: () => void): () => void {
	viewportModeListeners.add(listener);
	return () => {
		viewportModeListeners.delete(listener);
	};
}

function resolveSiblingRuntimeAssetUrl(fileName: string): string {
	if (typeof document !== 'undefined') {
		const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
		for (const script of scripts) {
			const src = script.getAttribute('src') || '';
			if (src.includes('ReactInertia.js')) {
				return src.replace(/ReactInertia\.js(\?.*)?$/, `${fileName}$1`);
			}
		}
	}
	return `/site/modules/React/dist/${fileName}`;
}

function loadRuntimeScriptOnce(src: string): Promise<void> {
	const safeSrc = sanitizeAssetUrl(src);
	if (typeof document === 'undefined' || !safeSrc) {
		return Promise.resolve();
	}
	const cleanSrc = safeSrc.split('?')[0] || safeSrc;
	const existingPromise = runtimeScriptPromises.get(cleanSrc);
	if (existingPromise) {
		return existingPromise;
	}
	const existingScript = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).find(
		(el) => ((el.getAttribute('src') || '').split('?')[0] || '') === cleanSrc
	);
	if (existingScript && injectedAssetUrls.has(cleanSrc)) {
		return Promise.resolve();
	}

	const promise = new Promise<void>((resolve) => {
		if (existingScript) {
			injectedAssetUrls.add(cleanSrc);
			existingScript.addEventListener('load', () => resolve(), { once: true });
			existingScript.addEventListener('error', () => resolve(), { once: true });
			window.setTimeout(() => resolve(), 50);
			return;
		}
		injectedAssetUrls.add(cleanSrc);
		const script = document.createElement('script');
		script.type = 'module';
		script.src = safeSrc;
		script.addEventListener('load', () => resolve(), { once: true });
		script.addEventListener('error', () => resolve(), { once: true });
		document.head.appendChild(script);
	});
	runtimeScriptPromises.set(cleanSrc, promise);
	return promise;
}

function loadRuntimeStyleOnce(src: string): void {
	const safeSrc = sanitizeAssetUrl(src);
	if (typeof document === 'undefined' || !safeSrc) {
		return;
	}
	const cleanSrc = safeSrc.split('?')[0] || safeSrc;
	if (
		injectedAssetUrls.has(cleanSrc) ||
		Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).some(
			(el) => ((el.getAttribute('href') || '').split('?')[0] || '') === cleanSrc
		)
	) {
		injectedAssetUrls.add(cleanSrc);
		return;
	}
	injectedAssetUrls.add(cleanSrc);
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = safeSrc;
	document.head.appendChild(link);
}

function preloadRuntimeScript(src: string): void {
	const safeSrc = sanitizeAssetUrl(src);
	if (typeof document === 'undefined' || !safeSrc) {
		return;
	}
	const cleanSrc = safeSrc.split('?')[0] || safeSrc;
	if (
		injectedAssetUrls.has(cleanSrc) ||
		Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).some(
			(el) => ((el.getAttribute('src') || '').split('?')[0] || '') === cleanSrc
		) ||
		Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="preload"]')).some(
			(el) => ((el.getAttribute('href') || '').split('?')[0] || '') === cleanSrc
		)
	) {
		return;
	}
	const link = document.createElement('link');
	link.rel = 'preload';
	link.as = 'script';
	link.href = safeSrc;
	document.head.appendChild(link);
}

function resolveRuntimeAssetTarget(fileNameOrUrl: string): string {
	const clean = fileNameOrUrl.trim();
	if (
		clean.startsWith('/') ||
		clean.startsWith('./') ||
		clean.startsWith('../') ||
		clean.startsWith('http://') ||
		clean.startsWith('https://')
	) {
		return clean;
	}
	return resolveSiblingRuntimeAssetUrl(clean);
}

export function loadRuntimeScript(fileNameOrUrl: string): Promise<void> {
	return loadRuntimeScriptOnce(resolveRuntimeAssetTarget(fileNameOrUrl));
}

export function loadRuntimeStyle(fileNameOrUrl: string): void {
	loadRuntimeStyleOnce(resolveRuntimeAssetTarget(fileNameOrUrl));
}

export function preloadRuntimeScriptAsset(fileNameOrUrl: string): void {
	preloadRuntimeScript(resolveRuntimeAssetTarget(fileNameOrUrl));
}

/* ============================================================================
 * Lazy On-Demand Layout Subsystem (`dist/ReactLayout.js`)
 * ========================================================================== */

let loadedLayoutModule: Partial<typeof LayoutType> | null = null;
const layoutLoadListeners = new Set<() => void>();

export function ensureLayoutLoaded(): Promise<void> {
	if (loadedLayoutModule) {
		return Promise.resolve();
	}
	return loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('ReactLayout.js'));
}

function provideLayout(mod: typeof LayoutType): void {
	loadedLayoutModule = mod;
	Object.assign(LayoutProxy, {
		AppShell: mod.AppShell,
		EditPresenceBanner: mod.EditPresenceBanner,
		postWorkspacePreferenceAction: mod.postWorkspacePreferenceAction,
		renderNoticeMarkup: mod.renderNoticeMarkup,
	});
	layoutLoadListeners.forEach((fn) => fn());
}

function createLazyLayoutComponent<K extends 'AppShell' | 'EditPresenceBanner' | 'RecordHeader'>(
	exportName: K,
	fallbackMode: 'shell' | 'none'
): (typeof LayoutType)[K] {
	const LazyLayoutWrapper: React.FC<LazyFallbackWrapperProps> = (props) => {
		const [, setTick] = React.useState(0);
		const Resolved = loadedLayoutModule?.[exportName] as
			| React.ComponentType<LazyFallbackWrapperProps>
			| undefined;

		React.useEffect(() => {
			if (loadedLayoutModule?.[exportName]) {
				return;
			}
			const onReady = () => setTick((t) => t + 1);
			layoutLoadListeners.add(onReady);
			void ensureLayoutLoaded();
			return () => {
				layoutLoadListeners.delete(onReady);
			};
		}, []);

		if (Resolved) {
			return React.createElement(Resolved, props);
		}
		if (fallbackMode === 'none') {
			return null;
		}
		return React.createElement(
			'div',
			{
				className: 'min-h-screen bg-background text-foreground',
				'data-rw-lazy-chunk': `Layout.${exportName}`,
			},
			props?.children ?? null
		);
	};
	LazyLayoutWrapper.displayName = `LazyLayout(${exportName})`;
	return LazyLayoutWrapper as unknown as (typeof LayoutType)[K];
}

const NOOP_ASYNC = async () => {};
const NOOP_SYNC = () => {};

const EMPTY_PRESENCE_RESULT: LayoutType.UseEditPresenceResult = {
	coEditors: [],
	remoteSave: null,
	notifySaved: NOOP_ASYNC,
	dismissRemoteSave: NOOP_SYNC,
	reloadLatest: NOOP_SYNC,
};

const PresenceHookFiberBridge: React.FC<{
	options: LayoutType.UseEditPresenceOptions;
	onResult: (next: LayoutType.UseEditPresenceResult) => void;
}> = ({ options, onResult }) => {
	const useHook = loadedLayoutModule!.useEditPresence!;
	const res = useHook(options);
	React.useEffect(() => {
		onResult(res);
	}, [res, onResult]);
	return null;
};

const LayoutProxy: typeof LayoutType = {
	AppShell: createLazyLayoutComponent('AppShell', 'shell'),
	EditPresenceBanner: createLazyLayoutComponent('EditPresenceBanner', 'none'),
	RecordHeader: createLazyLayoutComponent('RecordHeader', 'none'),
	postWorkspacePreferenceAction: async (endpoint: string, payload: Record<string, unknown>) => {
		await ensureLayoutLoaded();
		if (loadedLayoutModule?.postWorkspacePreferenceAction) {
			return loadedLayoutModule.postWorkspacePreferenceAction(endpoint, payload);
		}
		return null;
	},
	renderNoticeMarkup: (raw: string) => {
		if (loadedLayoutModule?.renderNoticeMarkup) {
			return loadedLayoutModule.renderNoticeMarkup(raw);
		}
		void ensureLayoutLoaded();
		return raw;
	},
	useEditPresence: (options: LayoutType.UseEditPresenceOptions): LayoutType.UseEditPresenceResult => {
		const hadHookAtMountRef = React.useRef<boolean | null>(null);
		if (hadHookAtMountRef.current === null) {
			hadHookAtMountRef.current = Boolean(loadedLayoutModule?.useEditPresence);
		}
		if (hadHookAtMountRef.current && loadedLayoutModule?.useEditPresence) {
			return loadedLayoutModule.useEditPresence(options);
		}

		const [bridged, setBridged] = React.useState<LayoutType.UseEditPresenceResult>(EMPTY_PRESENCE_RESULT);
		const [layoutReadyTick, setLayoutReadyTick] = React.useState(0);
		const fiberRootRef = React.useRef<ReturnType<typeof ReactDOMClient.createRoot> | null>(null);

		React.useEffect(() => {
			if (loadedLayoutModule?.useEditPresence) {
				return;
			}
			const onReady = () => setLayoutReadyTick((t) => t + 1);
			layoutLoadListeners.add(onReady);
			void ensureLayoutLoaded();
			return () => {
				layoutLoadListeners.delete(onReady);
			};
		}, []);

		React.useEffect(() => {
			if (!loadedLayoutModule?.useEditPresence || typeof document === 'undefined') {
				return;
			}
			if (!fiberRootRef.current) {
				fiberRootRef.current = ReactDOMClient.createRoot(document.createElement('div'));
			}
			fiberRootRef.current.render(
				React.createElement(PresenceHookFiberBridge, {
					options,
					onResult: setBridged,
				})
			);
		}, [
			layoutReadyTick,
			options.resourceKey,
			options.endpoint,
			options.enabled,
			options.pollIntervalMs,
		]);

		React.useEffect(() => {
			return () => {
				if (fiberRootRef.current) {
					const root = fiberRootRef.current;
					fiberRootRef.current = null;
					queueMicrotask(() => root.unmount());
				}
			};
		}, []);

		return bridged;
	},
};

/* ============================================================================
 * Lazy On-Demand Viewports Subsystem (`dist/ReactViewports.js` + Mode Canvases)
 * ========================================================================== */

type ExtendedViewportsModule = typeof ViewportsType & {
	DataTableCanvas: typeof DataTableCanvasType;
	DataCardsCanvas: typeof DataCardsCanvasType;
};

let loadedViewportsModule: Partial<ExtendedViewportsModule> | null = null;
const viewportsLoadListeners = new Set<() => void>();

const VIEWPORT_MODE_SCRIPTS: Record<string, string> = {
	table: 'MarkupReactTable.js',
	cards: 'MarkupReactCards.js',
};

export function ensureViewportsLoaded(): Promise<void> {
	if (loadedViewportsModule?.DataViewport) {
		return Promise.resolve();
	}
	return loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('ReactViewports.js'));
}

export function ensureViewportModeLoaded(mode: string): Promise<void> {
	const clean = mode.toLowerCase();
	if (getViewportMode(clean)) {
		return Promise.resolve();
	}
	const scriptFile = VIEWPORT_MODE_SCRIPTS[clean];
	if (!scriptFile) {
		return Promise.resolve();
	}
	return loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl(scriptFile));
}

function provideViewports(mod: Partial<ExtendedViewportsModule>): void {
	loadedViewportsModule = { ...(loadedViewportsModule || {}), ...mod };
	Object.assign(ViewportsProxy, loadedViewportsModule, {
		registerViewport: registerViewportMode,
		getViewport: getViewportMode,
	});
	viewportsLoadListeners.forEach((fn) => fn());
}

function provideViewportCanvas(
	mode: string,
	component: React.ComponentType<ViewportsType.ViewportCanvasProps>,
	extra: Partial<ExtendedViewportsModule> = {}
): void {
	registerViewportMode(mode, component);
	loadedViewportsModule = { ...(loadedViewportsModule || {}), ...extra };
	Object.assign(ViewportsProxy, extra, {
		registerViewport: registerViewportMode,
		getViewport: getViewportMode,
	});
	viewportsLoadListeners.forEach((fn) => fn());
}

function createLazyViewportComponent<
	K extends 'DataViewport' | 'DataTable' | 'DataCards' | 'DataTableCanvas' | 'DataCardsCanvas'
>(exportName: K): ExtendedViewportsModule[K] {
	const LazyViewportWrapper: React.FC<Record<string, unknown>> = (props) => {
		const [, setTick] = React.useState(0);
		const Resolved = loadedViewportsModule?.[exportName] as
			| React.ComponentType<Record<string, unknown>>
			| undefined;

		React.useEffect(() => {
			if (loadedViewportsModule?.[exportName]) {
				return;
			}
			const onReady = () => setTick((t) => t + 1);
			viewportsLoadListeners.add(onReady);
			if (exportName === 'DataTable') {
				void ensureViewportsLoaded();
				void ensureViewportModeLoaded('table');
			} else if (exportName === 'DataCards') {
				void ensureViewportsLoaded();
				void ensureViewportModeLoaded('cards');
			} else if (exportName === 'DataTableCanvas') {
				void ensureViewportModeLoaded('table');
			} else if (exportName === 'DataCardsCanvas') {
				void ensureViewportModeLoaded('cards');
			} else {
				void ensureViewportsLoaded();
			}
			return () => {
				viewportsLoadListeners.delete(onReady);
			};
		}, []);

		if (Resolved) {
			return React.createElement(Resolved, props);
		}
		return React.createElement('div', {
			className: 'h-32 w-full motion-safe:animate-pulse rounded-lg border border-border bg-muted/20',
			'data-rw-lazy-chunk': `Viewports.${String(exportName)}`,
		});
	};
	LazyViewportWrapper.displayName = `LazyViewport(${String(exportName)})`;
	return LazyViewportWrapper as unknown as ExtendedViewportsModule[K];
}

const ViewportsProxy: ExtendedViewportsModule = {
	DataViewport: createLazyViewportComponent('DataViewport'),
	DataTable: createLazyViewportComponent('DataTable'),
	DataCards: createLazyViewportComponent('DataCards'),
	DataTableCanvas: createLazyViewportComponent('DataTableCanvas'),
	DataCardsCanvas: createLazyViewportComponent('DataCardsCanvas'),
	buildViewportActionItems: UI.buildViewportActionItems,
	registerViewport: registerViewportMode,
	getViewport: getViewportMode,
};

/* ============================================================================
 * Lazy On-Demand SchemaForm & Standalone Field Subsystems
 * ========================================================================== */

type ExtendedFieldsModule = typeof FieldsType & {
	FileFieldControl: typeof FileFieldControlType;
	IconFieldControl: typeof IconFieldControlType;
	ImageFieldControl: typeof ImageFieldControlType;
	KeyValueFieldControl: typeof KeyValueFieldControlType;
	LinkFieldControl: typeof LinkFieldControlType;
	RelationFieldControl: typeof RelationFieldControlType;
	SchemaTabContainer: React.ComponentType<Record<string, unknown>>;
};

let loadedFieldsModule: Partial<ExtendedFieldsModule> | null = null;
const fieldsLoadListeners = new Set<() => void>();

let loadedMediaModule: unknown = null;
let registeredMediaCustomFieldRenderer: MediaUtilsType.MediaCustomFieldRenderer | null = null;

export const SchemaFormContext = React.createContext<FieldsType.SchemaFormContextValue | null>(null);

type BridgedRuntimeSchemaFormElement = HTMLElement & {
	__rwSchemaFormContext?: FieldsType.SchemaFormContextValue;
	__rwSchemaFormListeners?: Set<(ctx: FieldsType.SchemaFormContextValue) => void>;
};

export function useSchemaFormContext(
	hostRef?: React.RefObject<HTMLElement | null>
): FieldsType.SchemaFormContextValue | null {
	const reactCtx = React.useContext(SchemaFormContext);
	const [domCtx, setDomCtx] = React.useState<FieldsType.SchemaFormContextValue | null>(null);

	React.useEffect(() => {
		if (reactCtx || !hostRef?.current) {
			return;
		}
		const formEl = hostRef.current.parentElement?.closest<BridgedRuntimeSchemaFormElement>(
			'[data-rw-schema-form]'
		);
		if (!formEl) {
			return;
		}
		if (formEl.__rwSchemaFormContext) {
			setDomCtx((prev) => (prev === formEl.__rwSchemaFormContext ? prev : formEl.__rwSchemaFormContext!));
		}
		if (!formEl.__rwSchemaFormListeners) {
			formEl.__rwSchemaFormListeners = new Set();
		}
		const listener = (nextCtx: FieldsType.SchemaFormContextValue) => {
			setDomCtx(nextCtx);
		};
		formEl.__rwSchemaFormListeners.add(listener);
		return () => {
			formEl.__rwSchemaFormListeners?.delete(listener);
		};
	}, [reactCtx, hostRef]);

	return reactCtx || domCtx;
}

export function ensureMediaStyleLoaded(): void {
	loadRuntimeStyleOnce(resolveSiblingRuntimeAssetUrl('ReactMedia.css'));
}

export function ensureMediaLoaded(): Promise<void> {
	ensureMediaStyleLoaded();
	if (
		loadedMediaModule ||
		(typeof window !== 'undefined' &&
			Boolean((window as unknown as { ReactMediaRuntime?: unknown }).ReactMediaRuntime))
	) {
		return Promise.resolve();
	}
	return loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('ReactMedia.js'));
}

function provideMedia(mod: unknown): void {
	loadedMediaModule = mod;
}

function setMediaCustomFieldRenderer(renderer: MediaUtilsType.MediaCustomFieldRenderer): void {
	registeredMediaCustomFieldRenderer = renderer;
}

function getMediaCustomFieldRenderer(): MediaUtilsType.MediaCustomFieldRenderer | null {
	return registeredMediaCustomFieldRenderer;
}

export function ensureFieldsLoaded(): Promise<void> {
	if (loadedFieldsModule?.SchemaForm) {
		return Promise.resolve();
	}
	return loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('SchemaForm.js'));
}

export function ensureTabLoaded(): Promise<void> {
	if (loadedFieldsModule?.SchemaTabContainer) {
		return Promise.resolve();
	}
	return loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('MarkupReactTab.js'));
}

export function ensureKeyValueLoaded(): Promise<void> {
	if (loadedFieldsModule?.KeyValueFieldControl) {
		return Promise.resolve();
	}
	return loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('InputfieldReactKeyValue.js'));
}

export function ensureIconFieldLoaded(): Promise<void> {
	const tasks: Array<Promise<void>> = [ensureIconsLoaded()];
	if (!loadedFieldsModule?.IconFieldControl) {
		tasks.push(loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('InputfieldReactIcon.js')));
	}
	return Promise.all(tasks).then(() => undefined);
}

export function ensureLinkFieldLoaded(): Promise<void> {
	if (loadedFieldsModule?.LinkFieldControl) {
		return Promise.resolve();
	}
	return loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('InputfieldReactLink.js'));
}

export async function ensureFileFieldLoaded(): Promise<void> {
	if (loadedFieldsModule?.FileFieldControl) {
		return;
	}
	await ensureMediaLoaded();
	await loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('InputfieldReactFile.js'));
}

export async function ensureImageFieldLoaded(): Promise<void> {
	if (loadedFieldsModule?.ImageFieldControl) {
		return;
	}
	await ensureMediaLoaded();
	await loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('InputfieldReactImage.js'));
}

export function ensureRelationFieldLoaded(): Promise<void> {
	if (loadedFieldsModule?.RelationFieldControl) {
		return Promise.resolve();
	}
	return loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('InputfieldReactRelation.js'));
}

function provideFields(mod: Partial<ExtendedFieldsModule>): void {
	loadedFieldsModule = { ...(loadedFieldsModule || {}), ...mod };
	Object.assign(FieldsProxy, loadedFieldsModule, {
		SchemaFormContext,
		useSchemaFormContext,
	});
	fieldsLoadListeners.forEach((fn) => fn());
}

function provideFieldControl<K extends keyof ExtendedFieldsModule>(
	key: K,
	component: ExtendedFieldsModule[K]
): void {
	loadedFieldsModule = { ...(loadedFieldsModule || {}), [key]: component };
	(FieldsProxy as unknown as Record<string, unknown>)[String(key)] = component;
	fieldsLoadListeners.forEach((fn) => fn());
}

function createLazyFieldComponent<
	K extends
		| 'SchemaForm'
		| 'SchemaField'
		| 'FileFieldControl'
		| 'IconFieldControl'
		| 'ImageFieldControl'
		| 'KeyValueFieldControl'
		| 'LinkFieldControl'
		| 'RelationFieldControl'
		| 'SchemaTabContainer'
>(
	exportName: K,
	loader: () => Promise<void>,
	skeletonHeightClass: 'h-9' | 'h-24' | 'h-32'
): ExtendedFieldsModule[K] {
	const LazyFieldWrapper: React.FC<Record<string, unknown>> = (props) => {
		const [, setTick] = React.useState(0);
		const Resolved = loadedFieldsModule?.[exportName] as
			| React.ComponentType<Record<string, unknown>>
			| undefined;

		React.useEffect(() => {
			if (loadedFieldsModule?.[exportName]) {
				return;
			}
			const onReady = () => setTick((t) => t + 1);
			fieldsLoadListeners.add(onReady);
			void loader();
			return () => {
				fieldsLoadListeners.delete(onReady);
			};
		}, []);

		if (Resolved) {
			return React.createElement(Resolved, props);
		}
		return React.createElement('div', {
			className: `${skeletonHeightClass} w-full motion-safe:animate-pulse rounded-md border border-border bg-muted/20`,
			'data-rw-lazy-chunk': `Fields.${String(exportName)}`,
		});
	};
	LazyFieldWrapper.displayName = `LazyField(${String(exportName)})`;
	return LazyFieldWrapper as unknown as ExtendedFieldsModule[K];
}

const FieldsProxy = {
	SchemaForm: createLazyFieldComponent('SchemaForm', ensureFieldsLoaded, 'h-32'),
	SchemaField: createLazyFieldComponent('SchemaField', ensureFieldsLoaded, 'h-9'),
	SchemaFormContext,
	useSchemaFormContext,
	FileFieldControl: createLazyFieldComponent('FileFieldControl', ensureFileFieldLoaded, 'h-24'),
	IconFieldControl: createLazyFieldComponent('IconFieldControl', ensureIconFieldLoaded, 'h-9'),
	ImageFieldControl: createLazyFieldComponent('ImageFieldControl', ensureImageFieldLoaded, 'h-24'),
	KeyValueFieldControl: createLazyFieldComponent('KeyValueFieldControl', ensureKeyValueLoaded, 'h-24'),
	LinkFieldControl: createLazyFieldComponent('LinkFieldControl', ensureLinkFieldLoaded, 'h-9'),
	RelationFieldControl: createLazyFieldComponent('RelationFieldControl', ensureRelationFieldLoaded, 'h-9'),
	SchemaTabContainer: createLazyFieldComponent('SchemaTabContainer', ensureTabLoaded, 'h-32'),
} as unknown as ExtendedFieldsModule;

let loadedIconsCatalog: unknown = null;

export function ensureIconsLoaded(): Promise<void> {
	if (
		loadedIconsCatalog ||
		(typeof window !== 'undefined' &&
			Boolean((window as unknown as { ProcessWireIcons?: unknown }).ProcessWireIcons))
	) {
		return Promise.resolve();
	}
	return loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('ReactIcons.js'));
}

function provideIcons(catalog: unknown): void {
	loadedIconsCatalog = catalog;
	notifyIconCatalogLoaded();
}

function getTiptapRuntimeHandle():
	| {
			hasCapability?: (name: string) => boolean;
			subscribeCapabilities?: (fn: () => void) => () => void;
			ensureBundles?: (bundles?: string[]) => Promise<void>;
	  }
	| undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}
	return (
		window as unknown as {
			ReactTiptapRuntime?: {
				hasCapability?: (name: string) => boolean;
				subscribeCapabilities?: (fn: () => void) => () => void;
				ensureBundles?: (bundles?: string[]) => Promise<void>;
			};
		}
	).ReactTiptapRuntime;
}

export async function ensureTiptapLoaded(bundles?: string[]): Promise<void> {
	loadRuntimeStyleOnce(resolveSiblingRuntimeAssetUrl('TiptapCore.css'));

	const current = islandRegistry.get('InputfieldTiptap');
	if (!current || current === LazyTiptapIsland) {
		await loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl('TiptapCore.js'));
	}

	if (Array.isArray(bundles) && bundles.length > 0) {
		await getTiptapRuntimeHandle()?.ensureBundles?.(bundles);
	}
}

const LazyTiptapIsland: React.FC<Record<string, unknown>> = (props) => {
	const [, setTick] = React.useState(0);
	const Resolved = islandRegistry.get('InputfieldTiptap');
	const isReady = Boolean(Resolved && Resolved !== LazyTiptapIsland);

	React.useEffect(() => {
		if (isReady) {
			return;
		}
		const bump = () => setTick((t) => t + 1);
		const unsubIsland = subscribeIslands(bump);
		void ensureTiptapLoaded().then(bump);
		return () => {
			unsubIsland();
		};
	}, [isReady]);

	if (isReady && Resolved) {
		return React.createElement(Resolved as React.ComponentType<Record<string, unknown>>, props);
	}
	return React.createElement('div', {
		className: 'h-32 w-full motion-safe:animate-pulse rounded-lg border border-border bg-muted/20',
		'data-rw-lazy-chunk': 'InputfieldTiptap',
	});
};
LazyTiptapIsland.displayName = 'LazyIsland(InputfieldTiptap)';

// Register built-in lazy proxies so pages/islands mount on demand and fetch their subsystem bundle only when used
pageRegistry.set('ReactWorkspace/Viewport', ViewportsProxy.DataViewport as unknown as PageComponent);
pageRegistry.set('MarkupReactViewport', ViewportsProxy.DataViewport as unknown as PageComponent);
pageRegistry.set('ReactWorkspace/Table', ViewportsProxy.DataTable as unknown as PageComponent);
pageRegistry.set('MarkupReactTable', ViewportsProxy.DataTable as unknown as PageComponent);
pageRegistry.set('ReactWorkspace/Cards', ViewportsProxy.DataCards as unknown as PageComponent);
pageRegistry.set('MarkupReactCards', ViewportsProxy.DataCards as unknown as PageComponent);
pageRegistry.set('ReactWorkspace/SchemaForm', FieldsProxy.SchemaForm as unknown as PageComponent);
pageRegistry.set('SchemaForm', FieldsProxy.SchemaForm as unknown as PageComponent);

islandRegistry.set('ReactWorkspace/Viewport', ViewportsProxy.DataViewport as unknown as PageComponent);
islandRegistry.set('MarkupReactViewport', ViewportsProxy.DataViewport as unknown as PageComponent);
islandRegistry.set('ReactWorkspace/Table', ViewportsProxy.DataTable as unknown as PageComponent);
islandRegistry.set('MarkupReactTable', ViewportsProxy.DataTable as unknown as PageComponent);
islandRegistry.set('ReactWorkspace/Cards', ViewportsProxy.DataCards as unknown as PageComponent);
islandRegistry.set('MarkupReactCards', ViewportsProxy.DataCards as unknown as PageComponent);
islandRegistry.set('ReactWorkspace/SchemaForm', FieldsProxy.SchemaForm as unknown as PageComponent);
islandRegistry.set('SchemaForm', FieldsProxy.SchemaForm as unknown as PageComponent);
islandRegistry.set('MarkupReactTab', FieldsProxy.SchemaTabContainer as unknown as PageComponent);
islandRegistry.set('InputfieldReactFile', FieldsProxy.FileFieldControl as unknown as PageComponent);
islandRegistry.set('InputfieldReactImage', FieldsProxy.ImageFieldControl as unknown as PageComponent);
islandRegistry.set('InputfieldReactKeyValue', FieldsProxy.KeyValueFieldControl as unknown as PageComponent);
islandRegistry.set('InputfieldReactLink', FieldsProxy.LinkFieldControl as unknown as PageComponent);
islandRegistry.set('InputfieldReactIcon', FieldsProxy.IconFieldControl as unknown as PageComponent);
islandRegistry.set('ReactWorkspace/Icon', FieldsProxy.IconFieldControl as unknown as PageComponent);
islandRegistry.set('InputfieldReactM2O', FieldsProxy.RelationFieldControl as unknown as PageComponent);
islandRegistry.set('InputfieldReactM2M', FieldsProxy.RelationFieldControl as unknown as PageComponent);
islandRegistry.set('InputfieldReactO2M', FieldsProxy.RelationFieldControl as unknown as PageComponent);
islandRegistry.set('InputfieldReactM2A', FieldsProxy.RelationFieldControl as unknown as PageComponent);
islandRegistry.set('InputfieldTiptap', LazyTiptapIsland);
islandRegistry.set('ReactWorkspace/Tiptap', LazyTiptapIsland);

export function registerPages(pages: Record<string, RegistrableComponent>): void {
	for (const [name, rawComponent] of Object.entries(pages)) {
		const component = rawComponent as PageComponent;
		pageRegistry.set(name, component);
		const waiters = pendingPageResolvers.get(name);
		if (waiters && waiters.length > 0) {
			pendingPageResolvers.delete(name);
			for (const resolveWaiter of waiters) {
				resolveWaiter(component);
			}
		}
	}
	islandRegistryListeners.forEach((fn) => fn());
	if (typeof document !== 'undefined' && document.readyState !== 'loading') {
		mountIslands(document);
	}
}

export function registerIslands(islands: Record<string, RegistrableComponent>): void {
	for (const [name, component] of Object.entries(islands)) {
		islandRegistry.set(name, component as PageComponent);
	}
	islandRegistryListeners.forEach((fn) => fn());
	if (typeof document !== 'undefined' && document.readyState !== 'loading') {
		mountIslands(document);
	}
}

function cleanupDisconnectedIslands(): void {
	for (const [node, reactRoot] of mountedIslands.entries()) {
		if (!node.isConnected) {
			mountedIslands.delete(node);
			queueMicrotask(() => {
				try {
					reactRoot.unmount();
				} catch {
					// Ignore unmount errors on already-detached trees
				}
			});
		}
	}
}

export function mountIslands(root: ParentNode = document): void {
	syncTranslationsFromDom(false);
	cleanupDisconnectedIslands();
	const candidates: HTMLElement[] = [];
	if (root instanceof HTMLElement && root.matches(ISLAND_SELECTOR)) {
		candidates.push(root);
	}
	root.querySelectorAll<HTMLElement>(ISLAND_SELECTOR).forEach((el) => candidates.push(el));
	candidates.forEach((node) => {
		if (mountedIslands.has(node)) {
			return;
		}
		if (node.closest('.InputfieldRepeaterTemplate, .InputfieldRepeaterNewItem, .InputfieldClone') !== null) {
			return;
		}
		const name =
			node.getAttribute('data-inertia-island') ||
			node.getAttribute('data-react-island') ||
			'';
		if (!name) {
			return;
		}
		const Component = islandRegistry.get(name) || pageRegistry.get(name);
		if (!Component) {
			return;
		}
		let parsedProps: Record<string, unknown> = {};
		const rawProps = node.getAttribute('data-props');
		if (rawProps) {
			try {
				parsedProps = JSON.parse(rawProps);
			} catch {
				parsedProps = {};
			}
		} else if (node.innerHTML) {
			parsedProps = {
				initialHtml: node.innerHTML,
			};
		}

		const inputId = node.getAttribute('data-input-id') || parsedProps.id || '';
		const isKeyValueIsland = name === 'InputfieldReactKeyValue';
		const syncHiddenInput = (nextValue: unknown) => {
			if (!inputId || typeof document === 'undefined') {
				return;
			}
			const inputEl = document.getElementById(String(inputId)) as HTMLInputElement | null;
			if (!inputEl) {
				return;
			}
			let serialized: string;
			if (nextValue === null || nextValue === undefined) {
				serialized = '';
			} else if (typeof nextValue === 'object') {
				if (
					isKeyValueIsland &&
					!Array.isArray(nextValue) &&
					Object.keys(nextValue as Record<string, unknown>).length === 0
				) {
					serialized = '';
				} else {
					serialized = JSON.stringify(nextValue);
				}
			} else {
				serialized = String(nextValue);
			}
			if (inputEl.value !== serialized) {
				inputEl.value = serialized;
				inputEl.dispatchEvent(new Event('input', { bubbles: true }));
				inputEl.dispatchEvent(new Event('change', { bubbles: true }));
				const jq = (window as unknown as { jQuery?: (el: HTMLElement) => { trigger?: (evt: string) => void } })
					.jQuery;
				if (typeof jq === 'function') {
					try {
						jq(inputEl).trigger?.('change');
					} catch {
						// Ignore optional jQuery trigger error
					}
				}
			}
		};

		const bridgedProps = {
			...parsedProps,
			isIslandHost: true,
			onChange: (nextVal: unknown) => {
				syncHiddenInput(nextVal);
				if (typeof parsedProps.onChange === 'function') {
					parsedProps.onChange(nextVal);
				}
			},
		};

		const reactRoot = ReactDOMClient.createRoot(node);
		mountedIslands.set(node, reactRoot);
		reactRoot.render(
			React.createElement(Component as React.ComponentType<Record<string, unknown>>, bridgedProps)
		);
	});
}

function createMissingPageComponent(name: string): React.FC {
	const MissingPage: React.FC = () =>
		React.createElement(
			'div',
			{ className: 'p-8 text-sm text-destructive' },
			`Inertia page component "${name}" is not registered in ReactWorkspaceRuntime.`
		);
	return MissingPage;
}

function ensureWorkspaceAssetsLoaded(componentName: string): void {
	if (typeof document === 'undefined') {
		return;
	}

	const pageScript = document.querySelector('script[type="application/json"][data-page="app"]');
	if (!pageScript || !pageScript.textContent) {
		return;
	}
	try {
		const parsed = JSON.parse(pageScript.textContent);
		const wsState = parsed?.props?.workspace;
		if (
			wsState?.launcherComponent === componentName &&
			Array.isArray(wsState?.launcherScripts) &&
			wsState.launcherScripts.length > 0
		) {
			for (const src of wsState.launcherScripts) {
				if (typeof src === 'string') {
					void loadRuntimeScriptOnce(src);
				}
			}
			return;
		}
		const rawWorkspaces = wsState?.workspaces;
		const workspaces: Array<{
			component?: string;
			scripts?: string[];
			styles?: string[];
		}> = Array.isArray(rawWorkspaces)
			? rawWorkspaces
			: rawWorkspaces && typeof rawWorkspaces === 'object'
				? Object.values(rawWorkspaces)
				: [];

		const namespacePrefix = componentName.split('/')[0] || '';
		for (const ws of workspaces) {
			const wsPrefix = (ws.component || '').split('/')[0] || '';
			if (ws.component !== componentName && (!namespacePrefix || wsPrefix !== namespacePrefix)) {
				continue;
			}
			for (const href of ws.styles || []) {
				const safeHref = sanitizeAssetUrl(href);
				if (!safeHref) {
					continue;
				}
				const cleanHref = safeHref.split('?')[0] || safeHref;
				const exists = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).some(
					(el) => ((el.getAttribute('href') || '').split('?')[0] || '') === cleanHref
				);
				if (!exists && !injectedAssetUrls.has(cleanHref)) {
					injectedAssetUrls.add(cleanHref);
					const link = document.createElement('link');
					link.rel = 'stylesheet';
					link.href = safeHref;
					document.head.appendChild(link);
				}
			}
			for (const src of ws.scripts || []) {
				void loadRuntimeScriptOnce(src);
			}
		}
	} catch {
		// Ignore malformed initial payload
	}
}

let inertiaBooted = false;

export function bootInertiaApp(): void {
	if (inertiaBooted || typeof document === 'undefined') {
		return;
	}
	const appEl = document.getElementById('app');
	const pageScript = document.querySelector('script[type="application/json"][data-page="app"]');
	if (!appEl || !pageScript) {
		return;
	}

	inertiaBooted = true;
	markInertiaBooted();
	syncTranslationsFromDom(false);
	const layoutReady = ensureLayoutLoaded();
	InertiaReact.createInertiaApp({
		id: 'app',
		resolve: (name: string) => {
			const component = pageRegistry.get(name) || islandRegistry.get(name);
			if (component) {
				return layoutReady.then(() => component);
			}

			ensureWorkspaceAssetsLoaded(name);

			return new Promise<PageComponent>((resolve) => {
				let settled = false;
				const finish = (resolvedComponent: PageComponent) => {
					if (settled) {
						return;
					}
					settled = true;
					void layoutReady.then(() => resolve(resolvedComponent));
				};

				const waiters = pendingPageResolvers.get(name) ?? [];
				waiters.push(finish);
				pendingPageResolvers.set(name, waiters);

				const fallbackTimeout = () => {
					const lateRegistered = pageRegistry.get(name) || islandRegistry.get(name);
					if (lateRegistered) {
						finish(lateRegistered);
						return;
					}
					pendingPageResolvers.delete(name);
					finish(createMissingPageComponent(name));
				};

				if (document.readyState === 'complete') {
					window.setTimeout(fallbackTimeout, 2000);
				} else {
					window.addEventListener('load', () => window.setTimeout(fallbackTimeout, 500), { once: true });
				}
			});
		},
		setup({ el, App, props }) {
			ReactDOMClient.createRoot(el).render(React.createElement(App, props));
		},
	});
}

export interface ReactWorkspaceRuntimeGlobal {
	React: typeof React;
	ReactDOM: typeof ReactDOM;
	ReactDOMClient: typeof ReactDOMClient;
	jsxRuntime: typeof ReactJsxRuntime;
	Inertia: typeof InertiaReact;
	UI: typeof UI;
	Layout: typeof LayoutType;
	Viewports: ExtendedViewportsModule;
	Fields: ExtendedFieldsModule;
	Utils: {
		getCsrfToken: typeof getCsrfToken;
		cn: typeof cn;
		CORE_UI_ICON_NODES: typeof CORE_UI_ICON_NODES;
		DynamicIcon: typeof DynamicIcon;
		normalizeIconName: typeof normalizeIconName;
		resolveCanonicalIconName: typeof resolveCanonicalIconName;
		notifyIconCatalogLoaded: typeof notifyIconCatalogLoaded;
		subscribeIconCatalog: typeof subscribeIconCatalog;
		sanitizeAssetUrl: typeof sanitizeAssetUrl;
		sanitizeHref: typeof sanitizeHref;
		sanitizeSameOriginUrl: typeof sanitizeSameOriginUrl;
		isWorkspaceShellActive: typeof isWorkspaceShellActive;
		withWorkspaceShellUrl: typeof withWorkspaceShellUrl;
		t: typeof t;
		translate: typeof translate;
		useTranslations: typeof useTranslations;
		registerTranslations: typeof registerTranslations;
		hasTranslation: typeof hasTranslation;
		getLocale: typeof getLocale;
	};
	cn: typeof cn;
	getCsrfToken: typeof getCsrfToken;
	DynamicIcon: typeof DynamicIcon;
	sanitizeHref: typeof sanitizeHref;
	t: typeof t;
	translate: typeof translate;
	useTranslations: typeof useTranslations;
	registerTranslations: typeof registerTranslations;
	hasTranslation: typeof hasTranslation;
	getLocale: typeof getLocale;
	registerPages: typeof registerPages;
	registerIslands: typeof registerIslands;
	getIsland: typeof getIsland;
	subscribeIslands: typeof subscribeIslands;
	registerViewport: typeof registerViewportMode;
	getViewport: typeof getViewportMode;
	subscribeViewportModes: typeof subscribeViewportModes;
	ensureLayoutLoaded: typeof ensureLayoutLoaded;
	ensureViewportsLoaded: typeof ensureViewportsLoaded;
	ensureViewportModeLoaded: typeof ensureViewportModeLoaded;
	ensureFieldsLoaded: typeof ensureFieldsLoaded;
	ensureTabLoaded: typeof ensureTabLoaded;
	ensureKeyValueLoaded: typeof ensureKeyValueLoaded;
	ensureIconFieldLoaded: typeof ensureIconFieldLoaded;
	ensureMediaStyleLoaded: typeof ensureMediaStyleLoaded;
	ensureMediaLoaded: typeof ensureMediaLoaded;
	ensureFileFieldLoaded: typeof ensureFileFieldLoaded;
	ensureImageFieldLoaded: typeof ensureImageFieldLoaded;
	ensureLinkFieldLoaded: typeof ensureLinkFieldLoaded;
	ensureRelationFieldLoaded: typeof ensureRelationFieldLoaded;
	ensureTiptapLoaded: typeof ensureTiptapLoaded;
	ensureIconsLoaded: typeof ensureIconsLoaded;
	loadRuntimeScript: typeof loadRuntimeScript;
	loadRuntimeStyle: typeof loadRuntimeStyle;
	preloadRuntimeScript: typeof preloadRuntimeScriptAsset;
	__provideInertiaAdapter: typeof setInertiaAdapter;
	__provideLayout: typeof provideLayout;
	__provideViewports: typeof provideViewports;
	__provideViewportCanvas: typeof provideViewportCanvas;
	__provideFields: typeof provideFields;
	__provideFieldControl: typeof provideFieldControl;
	__provideMedia: typeof provideMedia;
	__setMediaCustomFieldRenderer: typeof setMediaCustomFieldRenderer;
	__getMediaCustomFieldRenderer: typeof getMediaCustomFieldRenderer;
	__provideIcons: typeof provideIcons;
	mountIslands: typeof mountIslands;
	bootInertiaApp: typeof bootInertiaApp;
}

declare global {
	interface Window {
		ReactWorkspaceRuntime: ReactWorkspaceRuntimeGlobal;
	}
}

if (typeof window !== 'undefined') {
	const runtimeGlobal: ReactWorkspaceRuntimeGlobal = {
		React,
		ReactDOM,
		ReactDOMClient,
		jsxRuntime: ReactJsxRuntime,
		Inertia: InertiaReact,
		UI,
		Layout: LayoutProxy,
		Viewports: ViewportsProxy,
		Fields: FieldsProxy,
		Utils: {
			getCsrfToken,
			cn,
			CORE_UI_ICON_NODES,
			DynamicIcon,
			normalizeIconName,
			resolveCanonicalIconName,
			notifyIconCatalogLoaded,
			subscribeIconCatalog,
			sanitizeAssetUrl,
			sanitizeHref,
			sanitizeSameOriginUrl,
			isWorkspaceShellActive,
			withWorkspaceShellUrl,
			t,
			translate,
			useTranslations,
			registerTranslations,
			hasTranslation,
			getLocale,
		},
		cn,
		getCsrfToken,
		DynamicIcon,
		sanitizeHref,
		t,
		translate,
		useTranslations,
		registerTranslations,
		hasTranslation,
		getLocale,
		registerPages,
		registerIslands,
		getIsland,
		subscribeIslands,
		registerViewport: registerViewportMode,
		getViewport: getViewportMode,
		subscribeViewportModes,
		ensureLayoutLoaded,
		ensureViewportsLoaded,
		ensureViewportModeLoaded,
		ensureFieldsLoaded,
		ensureTabLoaded,
		ensureKeyValueLoaded,
		ensureIconFieldLoaded,
		ensureMediaStyleLoaded,
		ensureMediaLoaded,
		ensureFileFieldLoaded,
		ensureImageFieldLoaded,
		ensureLinkFieldLoaded,
		ensureRelationFieldLoaded,
		ensureTiptapLoaded,
		ensureIconsLoaded,
		loadRuntimeScript,
		loadRuntimeStyle,
		preloadRuntimeScript: preloadRuntimeScriptAsset,
		__provideInertiaAdapter: setInertiaAdapter,
		__provideLayout: provideLayout,
		__provideViewports: provideViewports,
		__provideViewportCanvas: provideViewportCanvas,
		__provideFields: provideFields,
		__provideFieldControl: provideFieldControl,
		__provideMedia: provideMedia,
		__setMediaCustomFieldRenderer: setMediaCustomFieldRenderer,
		__getMediaCustomFieldRenderer: getMediaCustomFieldRenderer,
		__provideIcons: provideIcons,
		mountIslands,
		bootInertiaApp,
	};

	window.ReactWorkspaceRuntime = runtimeGlobal;

	let islandObserverInstalled = false;
	let mountScheduled = false;

	const scheduleIslandScan = () => {
		if (mountScheduled) {
			return;
		}
		mountScheduled = true;
		queueMicrotask(() => {
			mountScheduled = false;
			mountIslands(document);
		});
	};

	const installDynamicIslandObserver = () => {
		if (islandObserverInstalled || typeof MutationObserver === 'undefined' || !document.body) {
			return;
		}
		islandObserverInstalled = true;

		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.removedNodes.length > 0 && mountedIslands.size > 0) {
					scheduleIslandScan();
					return;
				}
				for (const added of Array.from(mutation.addedNodes)) {
					if (
						added instanceof HTMLElement &&
						(added.matches(ISLAND_SELECTOR) || added.querySelector(ISLAND_SELECTOR) !== null)
					) {
						scheduleIslandScan();
						return;
					}
				}
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });

		const jq = (window as unknown as { jQuery?: (target: Document) => { on?: (evt: string, fn: () => void) => void } }).jQuery;
		if (typeof jq === 'function') {
			try {
				jq(document).on?.('reloaded', scheduleIslandScan);
			} catch {
				// Ignore optional jQuery integration errors
			}
		}
	};

	const start = () => {
		bootInertiaApp();
		mountIslands(document);
		installDynamicIslandObserver();
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => window.setTimeout(start, 0), { once: true });
	} else {
		window.setTimeout(start, 0);
	}
}
