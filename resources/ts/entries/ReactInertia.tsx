import React from 'react';
import { createPortal, flushSync, unstable_batchedUpdates } from 'react-dom';
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
	sanitizeImageSrc,
	sanitizeSameOriginUrl,
	shouldIgnoreEscapeEvent,
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
	submitNativeFormPost,
	visitSameModuleHref,
	withWorkspaceShellUrl,
} from '../lib/inertia-bridge';
import * as UI from '../ui';
import * as Portal from '../portal/PortalRoot';
import * as Hooks from '../hooks';
import type * as LayoutType from '../layout/AppShell';
import type * as ShellRegistryType from '../layout/shellRegistry';
import type { ShellLayoutId } from '../layout/types';
import type { ModuleSwitcher as ModuleSwitcherType } from '../layout/ModuleSwitcher';
import type { SidebarShellLayout as SidebarShellLayoutType } from '../layout/SidebarShellLayout';
import type { TopbarShellLayout as TopbarShellLayoutType } from '../layout/TopbarShellLayout';
import type { UserAccountMenu as UserAccountMenuType } from '../layout/UserAccountMenu';
import type { useShellLayout as useShellLayoutType } from '../layout/useShellLayout';
import type * as ViewportsType from '../viewports/DataViewport';
import type { DataTableCanvas as DataTableCanvasType } from '../viewports/DataTableCanvas';
import type { DataCardsCanvas as DataCardsCanvasType } from '../viewports/DataCardsCanvas';
import type * as FieldsType from '../fields/SchemaForm';
import {
	evaluateShowIfCondition,
	navigateTablistByKey,
	resolveScopedFieldValue,
} from '../fields/schemaRuntimeHelpers';
import type * as MediaUtilsType from '../fields/mediaUtils';
import type { FileFieldControl as FileFieldControlType } from '../fields/controls/FileField';
import type { IconFieldControl as IconFieldControlType } from '../fields/controls/IconField';
import type { ImageFieldControl as ImageFieldControlType } from '../fields/controls/ImageField';
import type { KeyValueFieldControl as KeyValueFieldControlType } from '../fields/controls/KeyValueField';
import type { LinkFieldControl as LinkFieldControlType } from '../fields/controls/LinkField';
import type { RelationFieldControl as RelationFieldControlType } from '../fields/controls/RelationField';
import type { ColorFieldControl as ColorFieldControlType } from '../fields/controls/ColorField';
import type { TagsFieldControl as TagsFieldControlType } from '../fields/controls/TagsField';
import type { ComboboxFieldControl as ComboboxFieldControlType } from '../fields/controls/ComboboxField';
import type { PhoneFieldControl as PhoneFieldControlType } from '../fields/controls/PhoneField';
import type { UnitNumberFieldControl as UnitNumberFieldControlType } from '../fields/controls/UnitNumberField';
import type { SegmentedFieldControl as SegmentedFieldControlType } from '../fields/controls/SegmentedField';
import type { SpacingFieldControl as SpacingFieldControlType } from '../fields/controls/SpacingField';
import type { OtpFieldControl as OtpFieldControlType } from '../fields/controls/OtpField';
import type { PasswordFieldControl as PasswordFieldControlType } from '../fields/controls/PasswordField';
import type { MarkdownFieldControl as MarkdownFieldControlType } from '../fields/controls/MarkdownField';
import type { ConditionBuilderFieldControl as ConditionBuilderFieldControlType } from '../fields/controls/ConditionBuilderField';
import type { ExtraFieldControlIsland as ExtraFieldControlIslandType } from '../fields/controls/ExtraFieldControlIsland';
import type { FieldControlIsland as FieldControlIslandType } from '../fields/schema/FieldControlIsland';
import type * as GridEngineType from '../engines/grid';
import type * as DndEngineType from '../engines/dnd';
import type * as CalendarEngineType from '../engines/calendar';

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
	submitNativeFormPost,
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
		const initialHookRef = React.useRef(getInertiaAdapter()?.usePoll ?? null);
		React.useEffect(() => {
			if (!initialHookRef.current && !getInertiaAdapter()) {
				void ensureLayoutLoaded();
			}
		}, []);
		if (initialHookRef.current) {
			return initialHookRef.current(interval, requestOptions, options);
		}
		return { start: () => {}, stop: () => {} };
	}) as typeof InertiaReactModule.usePoll,
	usePrefetch: ((options?: Parameters<typeof InertiaReactModule.usePrefetch>[0]) => {
		const initialHookRef = React.useRef(getInertiaAdapter()?.usePrefetch ?? null);
		React.useEffect(() => {
			if (!initialHookRef.current && !getInertiaAdapter()) {
				void ensureLayoutLoaded();
			}
		}, []);
		if (initialHookRef.current) {
			return initialHookRef.current(options);
		}
		return {
			lastUpdatedAt: null,
			isPrefetching: false,
			isPrefetched: false,
			flush: () => {
				void ensureLayoutLoaded();
			},
		};
	}) as typeof InertiaReactModule.usePrefetch,
	useRemember: (<State,>(initialState: State, key?: string) => {
		const initialHookRef = React.useRef(getInertiaAdapter()?.useRemember ?? null);
		React.useEffect(() => {
			if (!initialHookRef.current && !getInertiaAdapter()) {
				void ensureLayoutLoaded();
			}
		}, []);
		if (initialHookRef.current) {
			return initialHookRef.current(initialState, key);
		}
		return React.useState<State>(initialState);
	}) as typeof InertiaReactModule.useRemember,
	WhenVisible: LazyWhenVisible as unknown as typeof InertiaReactModule.WhenVisible,
};

const ReactDOM = {
	createPortal,
	flushSync,
	unstable_batchedUpdates,
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
	if (
		existingScript &&
		existingScript.dataset?.rwFailed !== '1' &&
		(existingScript.dataset?.rwLoaded === '1' ||
			injectedAssetUrls.has(cleanSrc) ||
			document.readyState === 'complete')
	) {
		if (existingScript.dataset) {
			existingScript.dataset.rwLoaded = '1';
		}
		injectedAssetUrls.add(cleanSrc);
		return Promise.resolve();
	}

	const promise = new Promise<void>((resolve) => {
		const reuseExisting = Boolean(existingScript && existingScript.dataset?.rwFailed !== '1');
		const targetScript =
			reuseExisting && existingScript ? existingScript : document.createElement('script');
		if (existingScript && existingScript.dataset?.rwFailed === '1') {
			existingScript.remove?.();
		}
		let settled = false;
		let safetyTimer: ReturnType<typeof setTimeout> | null = null;
		const cleanupListeners = () => {
			if (safetyTimer !== null) {
				clearTimeout(safetyTimer);
				safetyTimer = null;
			}
			targetScript.removeEventListener?.('load', handleLoad);
			targetScript.removeEventListener?.('error', handleError);
		};
		const handleLoad = () => {
			if (settled) {
				return;
			}
			settled = true;
			cleanupListeners();
			if (targetScript.dataset) {
				targetScript.dataset.rwLoaded = '1';
				delete targetScript.dataset.rwFailed;
			}
			resolve();
		};
		const handleError = () => {
			if (settled) {
				return;
			}
			settled = true;
			cleanupListeners();
			runtimeScriptPromises.delete(cleanSrc);
			injectedAssetUrls.delete(cleanSrc);
			if (reuseExisting) {
				if (targetScript.dataset) {
					targetScript.dataset.rwFailed = '1';
				}
			} else {
				targetScript.remove?.();
			}
			resolve();
		};

		injectedAssetUrls.add(cleanSrc);
		if (typeof targetScript.addEventListener === 'function') {
			targetScript.addEventListener('load', handleLoad, { once: true });
			targetScript.addEventListener('error', handleError, { once: true });
		}

		if (reuseExisting) {
			safetyTimer = setTimeout(() => {
				if (settled) {
					return;
				}
				settled = true;
				cleanupListeners();
				if (targetScript.dataset?.rwFailed === '1') {
					runtimeScriptPromises.delete(cleanSrc);
					injectedAssetUrls.delete(cleanSrc);
				} else if (targetScript.dataset) {
					targetScript.dataset.rwLoaded = '1';
				}
				resolve();
			}, 4000);
		} else {
			targetScript.type = 'module';
			targetScript.src = safeSrc;
			document.head?.appendChild?.(targetScript);
		}
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
	const existingLink = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).find(
		(el) => ((el.getAttribute('href') || '').split('?')[0] || '') === cleanSrc
	);
	if (
		existingLink &&
		existingLink.dataset?.rwFailed !== '1' &&
		(existingLink.dataset?.rwLoaded === '1' ||
			injectedAssetUrls.has(cleanSrc) ||
			document.readyState === 'complete')
	) {
		if (existingLink.dataset) {
			existingLink.dataset.rwLoaded = '1';
		}
		injectedAssetUrls.add(cleanSrc);
		return;
	}
	if (existingLink && existingLink.dataset?.rwFailed === '1') {
		existingLink.remove?.();
	} else if (!existingLink && injectedAssetUrls.has(cleanSrc)) {
		return;
	}

	const reuseExisting = Boolean(existingLink && existingLink.dataset?.rwFailed !== '1');
	const targetLink = reuseExisting && existingLink ? existingLink : document.createElement('link');
	const handleLoad = () => {
		if (targetLink.dataset) {
			targetLink.dataset.rwLoaded = '1';
			delete targetLink.dataset.rwFailed;
		}
	};
	const handleError = () => {
		injectedAssetUrls.delete(cleanSrc);
		if (reuseExisting) {
			if (targetLink.dataset) {
				targetLink.dataset.rwFailed = '1';
			}
		} else {
			targetLink.remove?.();
		}
	};

	injectedAssetUrls.add(cleanSrc);
	if (typeof targetLink.addEventListener === 'function') {
		targetLink.addEventListener('load', handleLoad, { once: true });
		targetLink.addEventListener('error', handleError, { once: true });
	}
	if (!reuseExisting) {
		targetLink.rel = 'stylesheet';
		targetLink.href = safeSrc;
		document.head?.appendChild?.(targetLink);
	}
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
	document.head?.appendChild?.(link);
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

type ExtendedLayoutModule = typeof LayoutType & {
	registerShellLayout: typeof ShellRegistryType.registerShellLayout;
	getShellLayout: typeof ShellRegistryType.getShellLayout;
	listShellLayouts: typeof ShellRegistryType.listShellLayouts;
	resolveShellLayoutDefinition: typeof ShellRegistryType.resolveShellLayoutDefinition;
	useShellLayout: typeof useShellLayoutType;
	ModuleSwitcher: typeof ModuleSwitcherType;
	UserAccountMenu: typeof UserAccountMenuType;
	TopbarShellLayout: typeof TopbarShellLayoutType;
	SidebarShellLayout: typeof SidebarShellLayoutType;
};

function ensureSiblingScript(isLoaded: unknown, file: string): Promise<void> {
	return isLoaded
		? Promise.resolve()
		: loadRuntimeScriptOnce(resolveSiblingRuntimeAssetUrl(file));
}

const SKELETON_PANEL = 'w-full motion-safe:animate-pulse rounded-md border border-border bg-muted/20';

function createLazyRuntimeComponent<P extends Record<string, unknown>>(
	getResolved: () => React.ComponentType<P> | undefined,
	listeners: Set<() => void>,
	load: () => void,
	displayName: string,
	chunkAttr: string,
	fallback: 'none' | 'shell' | string
): React.FC<P> {
	const LazyRuntimeWrapper: React.FC<P> = (props) => {
		const [, setTick] = React.useState(0);
		const Resolved = getResolved();

		React.useEffect(() => {
			if (getResolved()) {
				if (!Resolved) {
					setTick((t) => t + 1);
				}
				return;
			}
			const onReady = () => {
				if (!getResolved()) {
					return;
				}
				listeners.delete(onReady);
				setTick((t) => t + 1);
			};
			listeners.add(onReady);
			load();
			return () => {
				listeners.delete(onReady);
			};
		}, []);

		if (Resolved) {
			return React.createElement(Resolved, props);
		}
		if (fallback === 'none') {
			return null;
		}
		if (fallback === 'shell') {
			return React.createElement(
				'div',
				{
					className: 'min-h-screen bg-background text-foreground',
					'data-rw-lazy-chunk': chunkAttr,
				},
				(props as LazyFallbackWrapperProps)?.children ?? null
			);
		}
		return React.createElement('div', {
			className: fallback,
			'data-rw-lazy-chunk': chunkAttr,
		});
	};
	LazyRuntimeWrapper.displayName = displayName;
	return LazyRuntimeWrapper;
}

let loadedLayoutModule: Partial<ExtendedLayoutModule> | null = null;
const layoutLoadListeners = new Set<() => void>();
const pendingShellLayouts: ShellRegistryType.ShellLayoutDefinition[] = [];

export function ensureLayoutLoaded(): Promise<void> {
	return ensureSiblingScript(loadedLayoutModule, 'ReactLayout.js');
}

function provideLayout(mod: Partial<ExtendedLayoutModule>): void {
	loadedLayoutModule = { ...(loadedLayoutModule || {}), ...mod };
	if (typeof mod.registerShellLayout === 'function' && pendingShellLayouts.length > 0) {
		const queued = pendingShellLayouts.splice(0, pendingShellLayouts.length);
		for (const def of queued) {
			mod.registerShellLayout(def);
		}
	}
	Object.assign(LayoutProxy, loadedLayoutModule);
	layoutLoadListeners.forEach((fn) => fn());
}

function createLazyLayoutComponent<
	K extends
		| 'AppShell'
		| 'EditPresenceBanner'
		| 'RecordHeader'
		| 'ModuleSwitcher'
		| 'UserAccountMenu'
		| 'TopbarShellLayout'
		| 'SidebarShellLayout'
>(
	exportName: K,
	fallbackMode: 'shell' | 'none'
): ExtendedLayoutModule[K] {
	return createLazyRuntimeComponent(
		() => loadedLayoutModule?.[exportName] as React.ComponentType<LazyFallbackWrapperProps> | undefined,
		layoutLoadListeners,
		() => {
			void ensureLayoutLoaded();
		},
		`LazyLayout(${exportName})`,
		`Layout.${exportName}`,
		fallbackMode
	) as unknown as ExtendedLayoutModule[K];
}

const SHELL_LAYOUT_STORAGE_KEY = 'react-workspace-shell-layout';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'react-workspace-sidebar-collapsed';
const SHELL_LAYOUT_ID_RE = /^[a-z0-9_-]{1,40}$/;

function normalizeShellLayoutId(raw?: unknown): string {
	if (typeof raw !== 'string') {
		return '';
	}
	const clean = raw.trim().toLowerCase();
	return clean === '' || clean === 'default' || !SHELL_LAYOUT_ID_RE.test(clean) ? '' : clean;
}

function readDomShellLayout(fallback: ShellLayoutId = 'topbar'): ShellLayoutId {
	const attr =
		typeof document !== 'undefined'
			? document.documentElement.dataset.rwShellLayout ||
				document.querySelector('[data-rw-shell-layout]')?.getAttribute('data-rw-shell-layout') ||
				''
			: '';
	return normalizeShellLayoutId(attr) || fallback;
}

function syncDomShellState(layout: ShellLayoutId, collapsed: boolean): void {
	if (typeof document !== 'undefined') {
		const ds = document.documentElement.dataset;
		ds.rwShellLayout = layout;
		ds.rwSidebarCollapsed = String(collapsed);
	}
	if (typeof window !== 'undefined') {
		try {
			if (window.localStorage) {
				window.localStorage.setItem(SHELL_LAYOUT_STORAGE_KEY, layout);
				window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
			}
		} catch {
			// Ignore restricted storage environments
		}
		if (typeof CustomEvent !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('pw:react-shell-layout-change', {
					detail: { shellLayout: layout, sidebarCollapsed: collapsed },
				})
			);
		}
	}
}

const LayoutProxy: ExtendedLayoutModule = {
	AppShell: createLazyLayoutComponent('AppShell', 'shell'),
	EditPresenceBanner: createLazyLayoutComponent('EditPresenceBanner', 'none'),
	RecordHeader: createLazyLayoutComponent('RecordHeader', 'none'),
	ModuleSwitcher: createLazyLayoutComponent('ModuleSwitcher', 'none'),
	UserAccountMenu: createLazyLayoutComponent('UserAccountMenu', 'none'),
	TopbarShellLayout: createLazyLayoutComponent('TopbarShellLayout', 'shell'),
	SidebarShellLayout: createLazyLayoutComponent('SidebarShellLayout', 'shell'),
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
	useEditPresence: Hooks.useEditPresence,
	registerShellLayout: (definition: ShellRegistryType.ShellLayoutDefinition) => {
		if (loadedLayoutModule?.registerShellLayout) {
			loadedLayoutModule.registerShellLayout(definition);
			return;
		}
		pendingShellLayouts.push(definition);
		void ensureLayoutLoaded();
	},
	getShellLayout: (id?: string | null) => loadedLayoutModule?.getShellLayout?.(id),
	listShellLayouts: () => loadedLayoutModule?.listShellLayouts?.() ?? [],
	resolveShellLayoutDefinition: (preferredId?: string | null, fallbackId?: string) =>
		loadedLayoutModule?.resolveShellLayoutDefinition?.(preferredId, fallbackId),
	useShellLayout: ((options?: Parameters<typeof useShellLayoutType>[0]) => {
		const initialHookRef = React.useRef(loadedLayoutModule?.useShellLayout ?? null);
		const [fallbackState, setFallbackState] = React.useState<{
			shellLayout: ShellLayoutId;
			userShellLayout: ShellLayoutId | '';
			siteDefaultShellLayout: ShellLayoutId;
			sidebarCollapsed: boolean;
			layoutPending: boolean;
		}>(() => {
			const siteDefault: ShellLayoutId =
				normalizeShellLayoutId(options?.siteDefaultLayout) || 'topbar';
			const initial: ShellLayoutId =
				normalizeShellLayoutId(options?.initialLayout) || readDomShellLayout(siteDefault);
			const userPref: string = normalizeShellLayoutId(options?.initialUserLayout);
			return {
				shellLayout: initial,
				userShellLayout: userPref,
				siteDefaultShellLayout: siteDefault,
				sidebarCollapsed:
					typeof options?.initialSidebarCollapsed === 'boolean'
						? options.initialSidebarCollapsed
						: typeof document !== 'undefined' && document.documentElement.dataset.rwSidebarCollapsed === 'true',
				layoutPending: false,
			};
		});
		const fallbackStateRef = React.useRef(fallbackState);
		fallbackStateRef.current = fallbackState;

		React.useEffect(() => {
			if (initialHookRef.current) {
				return;
			}
			if (!loadedLayoutModule) {
				void ensureLayoutLoaded();
			}
			const syncFromWindow = () => {
				const collapsed = document.documentElement.dataset.rwSidebarCollapsed;
				setFallbackState((prev) => ({
					...prev,
					shellLayout: readDomShellLayout(prev.siteDefaultShellLayout),
					sidebarCollapsed:
						collapsed === 'true' ? true : collapsed === 'false' ? false : prev.sidebarCollapsed,
				}));
			};
			window.addEventListener('pw:react-shell-layout-change', syncFromWindow);
			return () => {
				window.removeEventListener('pw:react-shell-layout-change', syncFromWindow);
			};
		}, []);

		if (initialHookRef.current) {
			return initialHookRef.current(options);
		}

		const updateShell = async (
			patch: Partial<{ shellLayout: ShellLayoutId; userShellLayout: ShellLayoutId | ''; sidebarCollapsed: boolean }>,
			layout: ShellLayoutId,
			collapsed: boolean,
			payload: Record<string, unknown>
		): Promise<boolean> => {
			const prev = fallbackStateRef.current;
			const optimistic = { ...prev, ...patch, layoutPending: true };
			fallbackStateRef.current = optimistic;
			setFallbackState(optimistic);
			syncDomShellState(layout, collapsed);
			try {
				if (options?.syncToServer === false) {
					return true;
				}
				const updated = await LayoutProxy.postWorkspacePreferenceAction(
					options?.prefsEndpoint || '/_react/workspace-prefs',
					payload
				);
				if (!updated) {
					const reverted = { ...prev, layoutPending: false };
					fallbackStateRef.current = reverted;
					setFallbackState(reverted);
					syncDomShellState(prev.shellLayout, prev.sidebarCollapsed);
					return false;
				}
				if (isInertiaAppActive()) {
					safeRouter.reload({ only: ['workspace'] });
				}
				return true;
			} finally {
				setFallbackState((cur) => ({ ...cur, layoutPending: false }));
			}
		};

		const setSidebarCollapsed = (collapsed: boolean) => {
			const cur = fallbackStateRef.current;
			return updateShell(
				{ sidebarCollapsed: collapsed },
				cur.shellLayout,
				collapsed,
				{ action: 'set_sidebar_collapsed', collapsed }
			);
		};

		return {
			...fallbackState,
			setShellLayout: async (next: ShellLayoutId | '' | 'default') => {
				const trimmed = typeof next === 'string' ? next.trim().toLowerCase() : '';
				const isClearing = trimmed === '' || trimmed === 'default';
				const normalized = isClearing ? '' : normalizeShellLayoutId(trimmed);
				if (!isClearing && !normalized) {
					return false;
				}
				const cur = fallbackStateRef.current;
				const resolvedNext = isClearing ? cur.siteDefaultShellLayout : normalized;
				return updateShell(
					{
						shellLayout: resolvedNext,
						userShellLayout: normalized,
					},
					resolvedNext,
					cur.sidebarCollapsed,
					{ action: 'set_shell_layout', shellLayout: normalized }
				);
			},
			setSidebarCollapsed,
			toggleSidebarCollapsed: () => setSidebarCollapsed(!fallbackStateRef.current.sidebarCollapsed),
		};
	}) as typeof useShellLayoutType,
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
	return ensureSiblingScript(loadedViewportsModule?.DataViewport, 'ReactViewports.js');
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
	return createLazyRuntimeComponent(
		() => loadedViewportsModule?.[exportName] as React.ComponentType<Record<string, unknown>> | undefined,
		viewportsLoadListeners,
		() => {
			if (exportName === 'DataTable' || exportName === 'DataCards' || exportName === 'DataViewport') {
				void ensureViewportsLoaded();
			}
			if (exportName === 'DataTable' || exportName === 'DataTableCanvas') {
				void ensureViewportModeLoaded('table');
			} else if (exportName === 'DataCards' || exportName === 'DataCardsCanvas') {
				void ensureViewportModeLoaded('cards');
			}
		},
		`LazyViewport(${String(exportName)})`,
		`Viewports.${String(exportName)}`,
		`h-32 ${SKELETON_PANEL}`
	) as unknown as ExtendedViewportsModule[K];
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
	ColorFieldControl: typeof ColorFieldControlType;
	TagsFieldControl: typeof TagsFieldControlType;
	ComboboxFieldControl: typeof ComboboxFieldControlType;
	PhoneFieldControl: typeof PhoneFieldControlType;
	UnitNumberFieldControl: typeof UnitNumberFieldControlType;
	SegmentedFieldControl: typeof SegmentedFieldControlType;
	SpacingFieldControl: typeof SpacingFieldControlType;
	OtpFieldControl: typeof OtpFieldControlType;
	PasswordFieldControl: typeof PasswordFieldControlType;
	MarkdownFieldControl: typeof MarkdownFieldControlType;
	ConditionBuilderFieldControl: typeof ConditionBuilderFieldControlType;
	ConditionBuilder: typeof ConditionBuilderFieldControlType;
	ExtraFieldControlIsland: typeof ExtraFieldControlIslandType;
	FieldControlIsland: typeof FieldControlIslandType;
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
	return ensureSiblingScript(loadedFieldsModule?.SchemaForm, 'SchemaForm.js');
}

export function ensureTabLoaded(): Promise<void> {
	return ensureSiblingScript(loadedFieldsModule?.SchemaTabContainer, 'MarkupReactTab.js');
}

export function ensureKeyValueLoaded(): Promise<void> {
	return ensureSiblingScript(loadedFieldsModule?.KeyValueFieldControl, 'InputfieldReactKeyValue.js');
}

export function ensureIconFieldLoaded(): Promise<void> {
	const tasks: Array<Promise<void>> = [ensureIconsLoaded()];
	if (!loadedFieldsModule?.IconFieldControl) {
		tasks.push(ensureSiblingScript(false, 'InputfieldReactIcon.js'));
	}
	return Promise.all(tasks).then(() => undefined);
}

export function ensureLinkFieldLoaded(): Promise<void> {
	return ensureSiblingScript(loadedFieldsModule?.LinkFieldControl, 'InputfieldReactLink.js');
}

export async function ensureFileFieldLoaded(): Promise<void> {
	if (loadedFieldsModule?.FileFieldControl) {
		return;
	}
	await ensureMediaLoaded();
	await ensureSiblingScript(false, 'InputfieldReactFile.js');
}

export async function ensureImageFieldLoaded(): Promise<void> {
	if (loadedFieldsModule?.ImageFieldControl) {
		return;
	}
	await ensureMediaLoaded();
	await ensureSiblingScript(false, 'InputfieldReactImage.js');
}

export function ensureRelationFieldLoaded(): Promise<void> {
	return ensureSiblingScript(loadedFieldsModule?.RelationFieldControl, 'InputfieldReactRelation.js');
}

export function ensureConditionFieldLoaded(): Promise<void> {
	return ensureSiblingScript(loadedFieldsModule?.ConditionBuilderFieldControl, 'InputfieldReactCondition.js');
}

export function ensureExtraFieldsLoaded(): Promise<void> {
	return ensureSiblingScript(loadedFieldsModule?.ColorFieldControl, 'ReactExtraFields.js');
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
		| 'ColorFieldControl'
		| 'TagsFieldControl'
		| 'ComboboxFieldControl'
		| 'PhoneFieldControl'
		| 'UnitNumberFieldControl'
		| 'SegmentedFieldControl'
		| 'SpacingFieldControl'
		| 'OtpFieldControl'
		| 'PasswordFieldControl'
		| 'MarkdownFieldControl'
		| 'ConditionBuilderFieldControl'
		| 'ExtraFieldControlIsland'
		| 'FieldControlIsland'
		| 'SchemaTabContainer'
>(
	exportName: K,
	loader: () => Promise<void>,
	skeletonHeightClass: 'h-9' | 'h-24' | 'h-32'
): ExtendedFieldsModule[K] {
	return createLazyRuntimeComponent(
		() => loadedFieldsModule?.[exportName] as React.ComponentType<Record<string, unknown>> | undefined,
		fieldsLoadListeners,
		() => {
			void loader();
		},
		`LazyField(${String(exportName)})`,
		`Fields.${String(exportName)}`,
		`${skeletonHeightClass} ${SKELETON_PANEL}`
	) as unknown as ExtendedFieldsModule[K];
}

const EMPTY_VALIDATION_RESULT: FieldsType.SchemaValidationResult = {
	valid: true,
	errors: {},
	failedTabIds: [],
	failedBlockIds: [],
	firstErrorField: null,
};

function lazyFieldFn<
	K extends
		| 'evaluateSafeMathFormula'
		| 'countNestedErrors'
		| 'validateFieldWithValibot'
		| 'validateSchemaTree'
>(key: K, fallback: ReturnType<ExtendedFieldsModule[K]>): ExtendedFieldsModule[K] {
	return ((...args: unknown[]) => {
		const fn = loadedFieldsModule?.[key] as ((...a: unknown[]) => unknown) | undefined;
		if (fn) {
			return fn(...args);
		}
		void ensureFieldsLoaded();
		return fallback;
	}) as unknown as ExtendedFieldsModule[K];
}

const FieldsProxy = {
	SchemaForm: createLazyFieldComponent('SchemaForm', ensureFieldsLoaded, 'h-32'),
	SchemaField: createLazyFieldComponent('SchemaField', ensureFieldsLoaded, 'h-9'),
	SchemaFormContext,
	useSchemaFormContext,
	evaluateShowIfCondition,
	navigateTablistByKey,
	resolveScopedFieldValue,
	evaluateSafeMathFormula: lazyFieldFn('evaluateSafeMathFormula', ''),
	countNestedErrors: lazyFieldFn('countNestedErrors', 0),
	validateFieldWithValibot: lazyFieldFn('validateFieldWithValibot', null),
	validateSchemaTree: lazyFieldFn('validateSchemaTree', EMPTY_VALIDATION_RESULT),
	FileFieldControl: createLazyFieldComponent('FileFieldControl', ensureFileFieldLoaded, 'h-24'),
	IconFieldControl: createLazyFieldComponent('IconFieldControl', ensureIconFieldLoaded, 'h-9'),
	ImageFieldControl: createLazyFieldComponent('ImageFieldControl', ensureImageFieldLoaded, 'h-24'),
	KeyValueFieldControl: createLazyFieldComponent('KeyValueFieldControl', ensureKeyValueLoaded, 'h-24'),
	LinkFieldControl: createLazyFieldComponent('LinkFieldControl', ensureLinkFieldLoaded, 'h-9'),
	RelationFieldControl: createLazyFieldComponent('RelationFieldControl', ensureRelationFieldLoaded, 'h-9'),
	ColorFieldControl: createLazyFieldComponent('ColorFieldControl', ensureExtraFieldsLoaded, 'h-9'),
	TagsFieldControl: createLazyFieldComponent('TagsFieldControl', ensureExtraFieldsLoaded, 'h-9'),
	ComboboxFieldControl: createLazyFieldComponent('ComboboxFieldControl', ensureExtraFieldsLoaded, 'h-9'),
	PhoneFieldControl: createLazyFieldComponent('PhoneFieldControl', ensureExtraFieldsLoaded, 'h-9'),
	UnitNumberFieldControl: createLazyFieldComponent('UnitNumberFieldControl', ensureExtraFieldsLoaded, 'h-9'),
	SegmentedFieldControl: createLazyFieldComponent('SegmentedFieldControl', ensureExtraFieldsLoaded, 'h-9'),
	SpacingFieldControl: createLazyFieldComponent('SpacingFieldControl', ensureExtraFieldsLoaded, 'h-24'),
	OtpFieldControl: createLazyFieldComponent('OtpFieldControl', ensureExtraFieldsLoaded, 'h-9'),
	PasswordFieldControl: createLazyFieldComponent('PasswordFieldControl', ensureExtraFieldsLoaded, 'h-24'),
	MarkdownFieldControl: createLazyFieldComponent('MarkdownFieldControl', ensureExtraFieldsLoaded, 'h-32'),
	ConditionBuilderFieldControl: createLazyFieldComponent('ConditionBuilderFieldControl', ensureConditionFieldLoaded, 'h-32'),
	ConditionBuilder: createLazyFieldComponent('ConditionBuilderFieldControl', ensureConditionFieldLoaded, 'h-32'),
	ExtraFieldControlIsland: createLazyFieldComponent('ExtraFieldControlIsland', ensureExtraFieldsLoaded, 'h-9'),
	FieldControlIsland: createLazyFieldComponent('FieldControlIsland', ensureFieldsLoaded, 'h-9'),
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

/* ============================================================================
 * Lazy On-Demand Engines (`ReactGrid.js`, `ReactDnd.js`, `ReactCalendar.js`)
 * ========================================================================== */

type EngineRuntimeProxy<T> = T & {
	isLoaded: () => boolean;
	getModule: () => T | null;
	ensureLoaded: () => Promise<void>;
	ensureStyleLoaded?: () => void;
	subscribe: (listener: () => void) => () => void;
};

export type GridRuntimeProxy = EngineRuntimeProxy<GridEngineType.GridEngineModule>;
export type DndRuntimeProxy = EngineRuntimeProxy<DndEngineType.DndEngineModule>;
export type CalendarRuntimeProxy = CalendarEngineType.CalendarEngineModule & {
	isLoaded: () => boolean;
	getModule: () => CalendarEngineType.CalendarEngineModule | null;
	ensureLoaded: () => Promise<void>;
	ensureStyleLoaded: () => void;
	subscribe: (listener: () => void) => () => void;
};

function createLazyEngineBundle<T extends object>(
	scriptFile: string,
	labelPrefix: string,
	componentSpecs: Record<string, string>,
	cssFile?: string
) {
	let loaded: T | null = null;
	const listeners = new Set<() => void>();
	const ensureStyleLoaded = cssFile
		? () => {
				loadRuntimeStyleOnce(resolveSiblingRuntimeAssetUrl(cssFile));
			}
		: undefined;
	const ensureLoaded = (): Promise<void> => {
		ensureStyleLoaded?.();
		return ensureSiblingScript(loaded, scriptFile);
	};
	const subscribe = (listener: () => void): (() => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};
	const proxy: Record<string, unknown> = {
		isLoaded: () => loaded !== null,
		getModule: () => loaded,
		ensureLoaded,
		...(ensureStyleLoaded ? { ensureStyleLoaded } : {}),
		subscribe,
	};
	for (const [exportName, heightClass] of Object.entries(componentSpecs)) {
		proxy[exportName] = createLazyRuntimeComponent(
			() =>
				(loaded as Record<string, unknown> | null)?.[exportName] as
					| React.ComponentType<Record<string, unknown>>
					| undefined,
			listeners,
			() => {
				void ensureLoaded();
			},
			`Lazy${labelPrefix}(${exportName})`,
			`${labelPrefix}.${exportName}`,
			`${heightClass} ${SKELETON_PANEL}`
		);
	}
	const provide = (mod: T): void => {
		ensureStyleLoaded?.();
		loaded = mod;
		Object.assign(proxy, mod);
		listeners.forEach((fn) => fn());
	};
	return {
		proxy: proxy as unknown as EngineRuntimeProxy<T>,
		ensureLoaded,
		ensureStyleLoaded,
		provide,
	};
}

const gridBundle = createLazyEngineBundle<GridEngineType.GridEngineModule>('ReactGrid.js', 'Grid', {
	DataGrid: 'h-48',
});
export const ensureGridLoaded = gridBundle.ensureLoaded;
const provideGrid = gridBundle.provide;
const GridProxy = gridBundle.proxy;

const dndBundle = createLazyEngineBundle<DndEngineType.DndEngineModule>('ReactDnd.js', 'Dnd', {
	SortableListCanvas: 'h-32',
	SortableTreeCanvas: 'h-32',
});
export const ensureDndLoaded = dndBundle.ensureLoaded;
const provideDnd = dndBundle.provide;
const DndProxy = dndBundle.proxy;

const calendarBundle = createLazyEngineBundle<CalendarEngineType.CalendarEngineModule>(
	'ReactCalendar.js',
	'Calendar',
	{
		Calendar: 'h-64',
		DatePicker: 'h-9',
		TimePicker: 'h-9',
		TimePickerPanel: 'h-48',
		DateTimePicker: 'h-9',
		DateTimePickerPanel: 'h-64',
		DateRangePicker: 'h-9',
	},
	'ReactCalendar.css'
);
export const ensureCalendarStyleLoaded = calendarBundle.ensureStyleLoaded!;
export const ensureCalendarLoaded = calendarBundle.ensureLoaded;
const provideCalendar = calendarBundle.provide;
const CalendarProxy = calendarBundle.proxy as CalendarRuntimeProxy;

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
		className: `h-32 ${SKELETON_PANEL}`,
		'data-rw-lazy-chunk': 'InputfieldTiptap',
	});
};
LazyTiptapIsland.displayName = 'LazyIsland(InputfieldTiptap)';

// Register built-in lazy proxies so pages/islands mount on demand and fetch their subsystem bundle only when used
for (const [key, comp] of [
	['ReactWorkspace/Viewport', ViewportsProxy.DataViewport],
	['MarkupReactViewport', ViewportsProxy.DataViewport],
	['ReactWorkspace/Table', ViewportsProxy.DataTable],
	['MarkupReactTable', ViewportsProxy.DataTable],
	['ReactWorkspace/Cards', ViewportsProxy.DataCards],
	['MarkupReactCards', ViewportsProxy.DataCards],
	['ReactWorkspace/SchemaForm', FieldsProxy.SchemaForm],
	['SchemaForm', FieldsProxy.SchemaForm],
] as Array<[string, unknown]>) {
	pageRegistry.set(key, comp as PageComponent);
	islandRegistry.set(key, comp as PageComponent);
}
for (const [key, comp] of [
	['ReactWorkspace/FieldControl', FieldsProxy.FieldControlIsland],
	['ReactWorkspace/ExtraFieldControl', FieldsProxy.ExtraFieldControlIsland],
	['MarkupReactTab', FieldsProxy.SchemaTabContainer],
	['InputfieldReactFile', FieldsProxy.FileFieldControl],
	['InputfieldReactImage', FieldsProxy.ImageFieldControl],
	['InputfieldReactKeyValue', FieldsProxy.KeyValueFieldControl],
	['InputfieldReactLink', FieldsProxy.LinkFieldControl],
	['InputfieldReactIcon', FieldsProxy.IconFieldControl],
	['ReactWorkspace/Icon', FieldsProxy.IconFieldControl],
	['InputfieldReactCondition', FieldsProxy.ConditionBuilderFieldControl],
	['InputfieldReactM2O', FieldsProxy.RelationFieldControl],
	['InputfieldReactM2M', FieldsProxy.RelationFieldControl],
	['InputfieldReactO2M', FieldsProxy.RelationFieldControl],
	['InputfieldReactM2A', FieldsProxy.RelationFieldControl],
	['InputfieldTiptap', LazyTiptapIsland],
	['ReactWorkspace/Tiptap', LazyTiptapIsland],
] as Array<[string, unknown]>) {
	islandRegistry.set(key, comp as PageComponent);
}

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

		const ownsOwnInputs =
			name === 'ReactWorkspace/SchemaForm' ||
			name === 'SchemaForm' ||
			name === 'ReactWorkspace/ExtraFieldControl' ||
			name === 'ReactWorkspace/FieldControl';
		const inputId = ownsOwnInputs
			? ''
			: node.getAttribute('data-input-id') || parsedProps.id || '';
		const isKeyValueIsland = name === 'InputfieldReactKeyValue';
		const isConditionIsland = name === 'InputfieldReactCondition';
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
				} else if (
					isConditionIsland &&
					!Array.isArray(nextValue) &&
					Array.isArray((nextValue as Record<string, unknown>).groups) &&
					((nextValue as Record<string, unknown>).groups as unknown[]).length === 0
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
				loadRuntimeStyleOnce(href);
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
	Portal: typeof Portal;
	Hooks: typeof Hooks;
	Layout: ExtendedLayoutModule;
	Viewports: ExtendedViewportsModule;
	Fields: ExtendedFieldsModule;
	Grid: GridRuntimeProxy;
	Dnd: DndRuntimeProxy;
	Calendar: CalendarRuntimeProxy;
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
		sanitizeImageSrc: typeof sanitizeImageSrc;
		sanitizeSameOriginUrl: typeof sanitizeSameOriginUrl;
		shouldIgnoreEscapeEvent: typeof shouldIgnoreEscapeEvent;
		isWorkspaceShellActive: typeof isWorkspaceShellActive;
		withWorkspaceShellUrl: typeof withWorkspaceShellUrl;
		t: typeof t;
		translate: typeof translate;
		useTranslations: typeof useTranslations;
		registerTranslations: typeof registerTranslations;
		hasTranslation: typeof hasTranslation;
		getLocale: typeof getLocale;
	};
	getCsrfToken: typeof getCsrfToken;
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
	ensureConditionFieldLoaded: typeof ensureConditionFieldLoaded;
	ensureExtraFieldsLoaded: typeof ensureExtraFieldsLoaded;
	ensureTiptapLoaded: typeof ensureTiptapLoaded;
	ensureIconsLoaded: typeof ensureIconsLoaded;
	ensureGridLoaded: typeof ensureGridLoaded;
	ensureDndLoaded: typeof ensureDndLoaded;
	ensureCalendarStyleLoaded: typeof ensureCalendarStyleLoaded;
	ensureCalendarLoaded: typeof ensureCalendarLoaded;
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
	__provideGrid: typeof provideGrid;
	__provideDnd: typeof provideDnd;
	__provideCalendar: typeof provideCalendar;
	mountIslands: typeof mountIslands;
	bootInertiaApp: typeof bootInertiaApp;
}

declare global {
	interface Window {
		ReactWorkspaceRuntime: ReactWorkspaceRuntimeGlobal;
	}
}

if (typeof window !== 'undefined') {
	if (typeof document !== 'undefined') {
		document.addEventListener(
			'error',
			(event: Event) => {
				const target = event.target;
				if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
					target.dataset.rwFailed = '1';
				}
			},
			true
		);
	}
	const runtimeGlobal: ReactWorkspaceRuntimeGlobal = {
		React,
		ReactDOM,
		ReactDOMClient,
		jsxRuntime: ReactJsxRuntime,
		Inertia: InertiaReact,
		UI,
		Portal,
		Hooks,
		Layout: LayoutProxy,
		Viewports: ViewportsProxy,
		Fields: FieldsProxy,
		Grid: GridProxy,
		Dnd: DndProxy,
		Calendar: CalendarProxy,
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
			sanitizeImageSrc,
			sanitizeSameOriginUrl,
			shouldIgnoreEscapeEvent,
			isWorkspaceShellActive,
			withWorkspaceShellUrl,
			t,
			translate,
			useTranslations,
			registerTranslations,
			hasTranslation,
			getLocale,
		},
		getCsrfToken,
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
		ensureConditionFieldLoaded,
		ensureExtraFieldsLoaded,
		ensureTiptapLoaded,
		ensureIconsLoaded,
		ensureGridLoaded,
		ensureDndLoaded,
		ensureCalendarStyleLoaded,
		ensureCalendarLoaded,
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
		__provideGrid: provideGrid,
		__provideDnd: provideDnd,
		__provideCalendar: provideCalendar,
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
