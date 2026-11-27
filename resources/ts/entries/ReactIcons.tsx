import { fetchGatewayJson } from '../hooks';
import {
	ALLOWED_SVG_NODE_TAGS,
	clampIconSize,
	clampIconStrokeWidth,
	cleanIconIdentifier,
	escapeXmlAttr,
	type IconCatalogEntry,
	type IconCatalogRuntime,
	type IconCategoryOption,
	type IconQueryResponse,
	type IconVariant,
	ICON_ALIASES,
	normalizeIconValue,
	type NormalizedIconValue,
	sanitizeIconColor,
	sanitizeIconVariant,
	sanitizeSvgNodeAttrs,
} from '../icons/iconTypes';

const iconEntryCache = new Map<string, IconCatalogEntry>();
const failedNames = new Set<string>();
const pendingHydrationNames = new Set<string>();
let hydrationFlushScheduled = false;
let cachedCategories: IconCategoryOption[] | null = null;
let cachedPopular: IconCatalogEntry[] | null = null;

function resolveIconsEndpoint(explicitEndpoint?: string): string {
	if (explicitEndpoint) {
		const trimmed = explicitEndpoint.trim();
		if (
			trimmed.startsWith('/') &&
			!trimmed.startsWith('//') &&
			!trimmed.startsWith('/\\') &&
			!/[\x00-\x20\x7F]/.test(trimmed)
		) {
			return trimmed;
		}
		if (typeof window !== 'undefined' && window.location?.origin) {
			try {
				const parsed = new URL(trimmed, window.location.origin);
				if (
					(parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
					parsed.origin === window.location.origin
				) {
					return trimmed;
				}
			} catch {
				// Fall back to default icons endpoint below
			}
		}
	}
	if (typeof document !== 'undefined') {
		const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
		for (const script of scripts) {
			const src = script.getAttribute('src') || '';
			const markerIdx = src.indexOf('/site/modules/React/');
			if (markerIdx >= 0) {
				const rootPrefix = src.slice(0, markerIdx);
				return `${rootPrefix}/_react/icons`;
			}
		}
	}
	return '/_react/icons';
}

function notifyCatalogUpdated(): void {
	if (typeof window === 'undefined') {
		return;
	}
	const rt = (
		window as unknown as {
			ReactWorkspaceRuntime?: {
				Utils?: { notifyIconCatalogLoaded?: () => void };
				__provideIcons?: (cat: IconCatalogRuntime) => void;
			};
		}
	).ReactWorkspaceRuntime;
	rt?.Utils?.notifyIconCatalogLoaded?.();
}

export function resolveAlias(raw?: string | null): string {
	const clean = cleanIconIdentifier(raw);
	if (!clean) {
		return '';
	}
	const base = clean.endsWith('-filled') && clean.length > 7 ? clean.slice(0, -7) : clean;
	return ICON_ALIASES[base] ?? base;
}

export function getCachedIcon(raw: string): IconCatalogEntry | null {
	const resolved = resolveAlias(raw);
	if (!resolved) {
		return null;
	}
	return iconEntryCache.get(resolved) ?? null;
}

function storeCatalogEntries(entries: IconCatalogEntry[] | Record<string, IconCatalogEntry> | undefined): void {
	if (!entries) {
		return;
	}
	const list = Array.isArray(entries) ? entries : Object.values(entries);
	for (const entry of list) {
		if (entry && typeof entry.name === 'string' && Array.isArray(entry.outline)) {
			iconEntryCache.set(entry.name, entry);
			failedNames.delete(entry.name);
		}
	}
}

function flushHydrationBatch(): void {
	hydrationFlushScheduled = false;
	if (pendingHydrationNames.size === 0 || typeof fetch !== 'function') {
		return;
	}
	const names = Array.from(pendingHydrationNames).slice(0, 80);
	for (const n of names) {
		pendingHydrationNames.delete(n);
	}
	if (pendingHydrationNames.size > 0) {
		hydrationFlushScheduled = true;
		queueMicrotask(flushHydrationBatch);
	}

	const endpoint = resolveIconsEndpoint();
	const sep = endpoint.includes('?') ? '&' : '?';
	const url = `${endpoint}${sep}action=hydrate&names=${encodeURIComponent(names.join(','))}`;

	void fetchGatewayJson<{ icons?: Record<string, IconCatalogEntry> }>(url, {
		method: 'GET',
	})
		.then((res) => {
			if (!res.ok || !res.data) {
				for (const requested of names) {
					failedNames.add(requested);
				}
				return;
			}
			const returned = res.data.icons ?? {};
			storeCatalogEntries(returned);
			for (const requested of names) {
				if (!iconEntryCache.has(requested)) {
					failedNames.add(requested);
				}
			}
			notifyCatalogUpdated();
		})
		.catch(() => {
			for (const requested of names) {
				failedNames.add(requested);
			}
		});
}

export function requestHydration(rawName: string): void {
	const resolved = resolveAlias(rawName);
	if (!resolved || iconEntryCache.has(resolved) || failedNames.has(resolved)) {
		return;
	}
	pendingHydrationNames.add(resolved);
	if (!hydrationFlushScheduled) {
		hydrationFlushScheduled = true;
		queueMicrotask(flushHydrationBatch);
	}
}

export async function queryIcons(params: {
	q?: string;
	category?: string;
	style?: 'all' | 'outline' | 'filled';
	offset?: number;
	limit?: number;
	includeMeta?: boolean;
	endpoint?: string;
	signal?: AbortSignal;
}): Promise<IconQueryResponse> {
	const endpoint = resolveIconsEndpoint(params.endpoint);
	const qs = new URLSearchParams();
	qs.set('action', 'query');
	if (params.q) {
		qs.set('q', params.q.trim());
	}
	if (params.category && params.category !== 'all') {
		qs.set('category', params.category);
	}
	if (params.style && params.style !== 'all') {
		qs.set('style', params.style);
	}
	if (params.offset && params.offset > 0) {
		qs.set('offset', String(params.offset));
	}
	qs.set('limit', String(params.limit ?? 96));
	if (params.includeMeta || cachedCategories === null || cachedPopular === null) {
		qs.set('meta', '1');
	}

	const sep = endpoint.includes('?') ? '&' : '?';
	const res = await fetchGatewayJson<IconQueryResponse>(`${endpoint}${sep}${qs.toString()}`, {
		method: 'GET',
		signal: params.signal,
	});
	if (!res.ok || !res.data) {
		throw new Error(res.error || `Icon query failed (${res.status})`);
	}
	const data = res.data;
	if (Array.isArray(data.categories)) {
		cachedCategories = data.categories;
	} else if (cachedCategories) {
		data.categories = cachedCategories;
	}
	if (Array.isArray(data.popular)) {
		cachedPopular = data.popular;
		storeCatalogEntries(data.popular);
	} else if (cachedPopular) {
		data.popular = cachedPopular;
	}
	storeCatalogEntries(data.items);
	notifyCatalogUpdated();
	return data;
}

export function renderSvgString(
	input?: string | Partial<NormalizedIconValue> | null,
	overrides?: {
		variant?: IconVariant;
		size?: number;
		color?: string;
		strokeWidth?: number;
		className?: string;
	}
): string {
	const norm = normalizeIconValue(input);
	const resolved = resolveAlias(norm.name) || 'box';
	const cached = iconEntryCache.get(resolved);
	const variant = overrides?.variant ? sanitizeIconVariant(overrides.variant) : norm.variant;
	const useFilled = variant === 'filled' && Boolean(cached?.filled && cached.filled.length > 0);
	const nodes = useFilled ? cached?.filled ?? [] : cached?.outline ?? [];

	const size = overrides?.size !== undefined ? clampIconSize(overrides.size, 24) : norm.size;
	const strokeWidth =
		overrides?.strokeWidth !== undefined
			? clampIconStrokeWidth(overrides.strokeWidth, 2)
			: norm.strokeWidth;
	const color =
		overrides?.color !== undefined
			? sanitizeIconColor(overrides.color)
			: norm.color;
	const activeColor = color || 'currentColor';
	const cls = overrides?.className
		? `rw-icon rw-icon-${resolved} ${overrides.className}`.trim()
		: `rw-icon rw-icon-${resolved}`;

	let inner = '';
	for (const tuple of nodes) {
		const tag = tuple[0];
		const attrs = tuple[1];
		if (!tag || !ALLOWED_SVG_NODE_TAGS.has(tag) || !attrs) {
			continue;
		}
		let attrStr = '';
		for (const [k, v] of Object.entries(sanitizeSvgNodeAttrs(attrs, true))) {
			attrStr += ` ${k}="${escapeXmlAttr(v)}"`;
		}
		inner += `<${tag}${attrStr}/>`;
	}

	if (useFilled) {
		return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${escapeXmlAttr(activeColor)}" stroke="none" class="${escapeXmlAttr(cls)}" aria-hidden="true" focusable="false">${inner}</svg>`;
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${escapeXmlAttr(activeColor)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="${escapeXmlAttr(cls)}" aria-hidden="true" focusable="false">${inner}</svg>`;
}

const catalogRuntime: IconCatalogRuntime = {
	getCachedIcon,
	resolveAlias,
	requestHydration,
	queryIcons,
	renderSvgString,
};

if (typeof window !== 'undefined') {
	const w = window as unknown as {
		ProcessWireIcons?: IconCatalogRuntime;
		ReactWorkspaceRuntime?: {
			__provideIcons?: (cat: IconCatalogRuntime) => void;
		};
	};
	w.ProcessWireIcons = catalogRuntime;
	if (typeof w.ReactWorkspaceRuntime?.__provideIcons === 'function') {
		w.ReactWorkspaceRuntime.__provideIcons(catalogRuntime);
	}
}
