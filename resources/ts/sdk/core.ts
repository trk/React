import type { DynamicIconProps } from '../lib/utils';
import { requireReactRuntime } from './optional';

const runtime = requireReactRuntime();

export const React = runtime.React;
export const ReactDOM = runtime.ReactDOM;
export const ReactDOMClient = runtime.ReactDOMClient;
export const Inertia = runtime.Inertia;

export const {
	useState,
	useEffect,
	useLayoutEffect,
	useMemo,
	useCallback,
	useRef,
	useId,
	useContext,
	Fragment,
} = React;

export const { createPortal } = ReactDOM;

export const {
	Link,
	Head,
	router,
	usePage,
	isInertiaAppActive,
	visitSameModuleHref,
	submitNativeFormPost,
} = Inertia;

export const {
	registerPages,
	registerIslands,
	getIsland,
	subscribeIslands,
	registerViewport,
	getViewport,
	subscribeViewportModes,
	mountIslands,
	loadRuntimeScript,
	loadRuntimeStyle,
	preloadRuntimeScript,
} = runtime;

export const {
	cn,
	DynamicIcon,
	CORE_UI_ICON_NODES,
	sanitizeHref,
	sanitizeImageSrc,
	sanitizeAssetUrl,
	sanitizeSameOriginUrl,
	normalizeIconName,
	resolveCanonicalIconName,
	isWorkspaceShellActive,
	withWorkspaceShellUrl,
	notifyIconCatalogLoaded,
	subscribeIconCatalog,
} = runtime.Utils;

export type { DynamicIconProps };
