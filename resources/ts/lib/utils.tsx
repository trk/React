import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CORE_UI_ICON_NODES } from '../icons/coreUiIcons';
import { ICON_ALIASES } from '../icons/faAliases';
import { cleanIconIdentifier } from '../icons/iconTypes';

export { CORE_UI_ICON_NODES };

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

/**
 * Sanitize an untrusted URL/href so only safe relative paths and allowlisted URI schemes
 * (`/`, `#`, `./`, `../`, `http://`, `https://`, `mailto:`, `tel:`) are rendered or navigated to.
 */
export function sanitizeHref(url?: string | null): string {
	if (typeof url !== 'string') {
		return '';
	}
	const trimmed = url.trim();
	if (trimmed === '' || /[\x00-\x20\x7F]/.test(trimmed)) {
		return '';
	}
	if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\')) {
		return '';
	}
	if (
		trimmed.startsWith('/') ||
		trimmed.startsWith('#') ||
		trimmed.startsWith('./') ||
		trimmed.startsWith('../')
	) {
		return trimmed;
	}
	if (/^(?:https?:\/\/[^/\\]|mailto:|tel:)/i.test(trimmed)) {
		return trimmed;
	}
	return '';
}

export function sanitizeImageSrc(url?: string | null): string {
	if (typeof url !== 'string') {
		return '';
	}
	const trimmed = url.trim();
	if (trimmed === '' || /[\x00-\x1F\x7F]/.test(trimmed)) {
		return '';
	}
	if (/^data:image\//i.test(trimmed)) {
		if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
			return trimmed;
		}
		const svgMatch = /^data:image\/svg\+xml;(?:utf8|charset=utf-8),(.+)$/i.exec(trimmed);
		if (svgMatch?.[1]) {
			try {
				const decoded = decodeURIComponent(svgMatch[1]);
				const namedEntityDecoded = decoded.replace(
					/&(tab|newline|colon|semi|lpar|rpar|lt|gt|quot|apos|amp);/gi,
					(_, name: string) => {
						switch (name.toLowerCase()) {
							case 'tab':
								return '\t';
							case 'newline':
								return '\n';
							case 'colon':
								return ':';
							case 'semi':
								return ';';
							case 'lpar':
								return '(';
							case 'rpar':
								return ')';
							case 'lt':
								return '<';
							case 'gt':
								return '>';
							case 'quot':
								return '"';
							case 'apos':
								return "'";
							case 'amp':
								return '&';
							default:
								return _;
						}
					}
				);
				if (
					!/[\x00-\x1F\x7F]/.test(decoded) &&
					!/[\x00-\x1F\x7F]/.test(namedEntityDecoded) &&
					!/&#[xX]?[0-9a-fA-F]+;?/.test(decoded) &&
					/<svg\b/i.test(decoded) &&
					!/<\s*(?:[a-z0-9_-]+:)?(?:script|foreignobject|iframe|object|embed|use|handler|style|animate|set|animatetransform|animatemotion|meta|base|link|feimage|tref)\b|\bon[a-z0-9_]+\s*=|(?:javascript|vbscript):/i.test(
						namedEntityDecoded
					)
				) {
					return trimmed;
				}
			} catch {
				return '';
			}
		}
		return '';
	}
	const safe = sanitizeHref(trimmed);
	if (safe === '' || safe.startsWith('#') || /^(?:mailto:|tel:)/i.test(safe)) {
		return '';
	}
	return safe;
}

/**
 * Restrict an internal API endpoint to safe site-relative paths (`/`, `./`, `../`)
 * or same-origin HTTP(S) URLs so CSRF tokens and signed action tokens are never sent cross-origin.
 */
export function sanitizeSameOriginUrl(url?: string | null): string {
	const safe = sanitizeHref(url);
	if (safe === '' || safe.startsWith('#') || /^(?:mailto:|tel:)/i.test(safe)) {
		return '';
	}
	if (safe.startsWith('/') || safe.startsWith('./') || safe.startsWith('../')) {
		return safe;
	}
	if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
		try {
			const parsed = new URL(safe, window.location.origin);
			if (
				(parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
				parsed.origin === window.location.origin
			) {
				return safe;
			}
		} catch {
			return '';
		}
	}
	return '';
}

/**
 * Restrict dynamically injected `<script type="module">` and `<link rel="stylesheet">` URLs
 * to same-origin paths (plus loopback Vite dev server URLs when running on a local dev host).
 */
export function sanitizeAssetUrl(url?: string | null): string {
	const sameOrigin = sanitizeSameOriginUrl(url);
	if (sameOrigin !== '') {
		return sameOrigin;
	}
	const safe = sanitizeHref(url);
	if (!safe || typeof window === 'undefined' || !window.location?.hostname) {
		return '';
	}
	const pageHost = window.location.hostname.toLowerCase();
	const isLocalDevHost =
		pageHost === 'localhost' ||
		pageHost === '127.0.0.1' ||
		pageHost.endsWith('.test') ||
		pageHost.endsWith('.local');
	if (!isLocalDevHost) {
		return '';
	}
	try {
		const parsed = new URL(safe);
		const assetHost = parsed.hostname.toLowerCase();
		if (
			(parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
			(assetHost === 'localhost' || assetHost === '127.0.0.1')
		) {
			return safe;
		}
	} catch {
		return '';
	}
	return '';
}

export interface CsrfTokenSource {
	csrf?: { name?: string; value?: string } | null;
	workspace?: { csrf?: { name?: string; value?: string } | null } | null;
}

export function getCsrfToken(source?: CsrfTokenSource | null): { name: string; value: string } {
	const explicitCsrf = source?.csrf || source?.workspace?.csrf;
	if (explicitCsrf && typeof explicitCsrf === 'object' && explicitCsrf.name && explicitCsrf.value) {
		return {
			name: String(explicitCsrf.name),
			value: String(explicitCsrf.value),
		};
	}

	if (typeof window !== 'undefined') {
		const pwWindow = window as unknown as {
			ProcessWire?: { config?: { csrf?: { name?: unknown; value?: unknown } } };
		};
		const pwCsrf = pwWindow.ProcessWire?.config?.csrf;
		if (pwCsrf && typeof pwCsrf === 'object' && pwCsrf.name && pwCsrf.value) {
			return {
				name: String(pwCsrf.name),
				value: String(pwCsrf.value),
			};
		}
	}

	if (typeof document !== 'undefined') {
		const metaName = document
			.querySelector<HTMLMetaElement>('meta[name="csrf-token-name"], meta[name="csrf-param"]')
			?.getAttribute('content');
		const metaValue = document
			.querySelector<HTMLMetaElement>('meta[name="csrf-token"], meta[name="csrf-token-value"]')
			?.getAttribute('content');
		if (metaValue) {
			return {
				name: metaName || 'TOKEN',
				value: metaValue,
			};
		}

		const hiddenInput = document.querySelector<HTMLInputElement>(
			'input[type="hidden"][name^="TOKEN"], input[type="hidden"][class*="_post_token"]'
		);
		if (hiddenInput && hiddenInput.name && hiddenInput.value) {
			return {
				name: hiddenInput.name,
				value: hiddenInput.value,
			};
		}

		const pageScript = document.querySelector('script[type="application/json"][data-page="app"]');
		if (pageScript?.textContent) {
			try {
				const parsed = JSON.parse(pageScript.textContent);
				const csrfProp = parsed?.props?.csrf || parsed?.props?.workspace?.csrf;
				if (csrfProp && typeof csrfProp === 'object' && csrfProp.name && csrfProp.value) {
					return {
						name: String(csrfProp.name),
						value: String(csrfProp.value),
					};
				}
			} catch {
				// Ignore malformed JSON
			}
		}
	}

	return { name: 'TOKEN', value: '' };
}

export interface DynamicIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref' | 'color'> {
	name?: string;
	value?: unknown;
	variant?: 'outline' | 'filled';
	size?: number | string;
	color?: string;
	strokeWidth?: number | string;
	background?: string;
	radius?: 'none' | 'sm' | 'md' | 'lg' | 'full';
}

const iconCatalogSubscribers = new Set<() => void>();

export function notifyIconCatalogLoaded(): void {
	iconCatalogSubscribers.forEach((fn) => fn());
}

export function subscribeIconCatalog(listener: () => void): () => void {
	iconCatalogSubscribers.add(listener);
	return () => {
		iconCatalogSubscribers.delete(listener);
	};
}

export function normalizeIconName(name?: string): string {
	return cleanIconIdentifier(name) || 'cube';
}

function resolveNormalizedCanonicalToken(rawName?: string): string {
	const clean = normalizeIconName(rawName);
	if (CORE_UI_ICON_NODES[clean]) {
		return clean;
	}
	if (ICON_ALIASES[clean]) {
		return ICON_ALIASES[clean];
	}
	if (clean.endsWith('-o') && clean.length > 2) {
		const base = clean.slice(0, -2);
		return ICON_ALIASES[base] ?? base;
	}
	return clean;
}

export function resolveCanonicalIconName(rawName?: string): string {
	if (typeof rawName === 'string' && rawName.trim().startsWith('{')) {
		const parsed = parseInlineIconPayload(rawName);
		if (parsed?.name) {
			const canonical = resolveNormalizedCanonicalToken(parsed.name);
			return parsed.variant === 'filled' && !canonical.endsWith('-filled')
				? `${canonical}-filled`
				: canonical;
		}
		return 'cube';
	}
	return resolveNormalizedCanonicalToken(rawName);
}

const SAFE_ICON_COLOR_RE = /^(?:#[0-9a-fA-F]{3,8}|currentColor|var\(--[a-zA-Z0-9_-]+\))$/;
const ALLOWED_SVG_NODE_TAGS = new Set([
	'path',
	'circle',
	'rect',
	'line',
	'polyline',
	'polygon',
	'ellipse',
]);
const SAFE_SVG_ATTR_KEY_RE = /^[a-zA-Z][a-zA-Z0-9-]*$/;

function sanitizeSvgNodeAttrs(rawAttrs?: Record<string, string> | null): Record<string, string> {
	const safe: Record<string, string> = {};
	if (!rawAttrs || typeof rawAttrs !== 'object') {
		return safe;
	}
	for (const [k, v] of Object.entries(rawAttrs)) {
		if (k === 'key' || /^on/i.test(k) || !SAFE_SVG_ATTR_KEY_RE.test(k)) {
			continue;
		}
		if (typeof v === 'string' || typeof v === 'number') {
			safe[k] = String(v);
		}
	}
	return safe;
}

function parseInlineIconPayload(raw: unknown): {
	name: string;
	variant?: 'outline' | 'filled';
	size?: number;
	color?: string;
	strokeWidth?: number;
	background?: string;
	radius?: string;
} | null {
	let candidate = raw;
	if (typeof candidate === 'string') {
		const trimmed = candidate.trim();
		if (trimmed.startsWith('{')) {
			if (trimmed.length > 4096) {
				return null;
			}
			try {
				candidate = JSON.parse(trimmed);
			} catch {
				return null;
			}
		} else {
			if (/:filled$/i.test(trimmed)) {
				return { name: trimmed.replace(/:filled$/i, ''), variant: 'filled' };
			}
			if (/-filled$/i.test(trimmed) && trimmed.length > 7) {
				return { name: trimmed.replace(/-filled$/i, ''), variant: 'filled' };
			}
			return null;
		}
	}
	if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
		return null;
	}
	const obj = candidate as Record<string, unknown>;
	let rawName = typeof obj.name === 'string' ? obj.name : typeof obj.icon === 'string' ? obj.icon : '';
	if (!rawName) {
		return null;
	}
	let parsedVariant: 'outline' | 'filled' | undefined =
		obj.variant === 'filled' || obj.style === 'filled' ? 'filled' : undefined;
	if (/:filled$/i.test(rawName)) {
		parsedVariant = 'filled';
		rawName = rawName.replace(/:filled$/i, '');
	} else if (/-filled$/i.test(rawName) && rawName.length > 7) {
		parsedVariant = 'filled';
		rawName = rawName.replace(/-filled$/i, '');
	}
	const out: {
		name: string;
		variant?: 'outline' | 'filled';
		size?: number;
		color?: string;
		strokeWidth?: number;
		background?: string;
		radius?: string;
	} = { name: rawName, variant: parsedVariant };
	const numSize = Number(obj.size);
	if (Number.isFinite(numSize) && numSize > 0) {
		out.size = Math.min(96, Math.max(12, Math.round(numSize)));
	}
	const numStroke = Number(obj.strokeWidth ?? obj.stroke);
	if (Number.isFinite(numStroke) && numStroke > 0) {
		out.strokeWidth = Math.min(3, Math.max(1, Math.round(numStroke * 100) / 100));
	}
	if (typeof obj.color === 'string' && SAFE_ICON_COLOR_RE.test(obj.color.trim())) {
		out.color = obj.color.trim();
	}
	const rawBg = typeof obj.background === 'string' ? obj.background : typeof obj.bg === 'string' ? obj.bg : '';
	if (rawBg && SAFE_ICON_COLOR_RE.test(rawBg.trim())) {
		out.background = rawBg.trim();
	}
	if (typeof obj.radius === 'string') {
		out.radius = obj.radius.trim().toLowerCase();
	}
	return out;
}

function resolveBadgeBorderRadius(radius?: string): string {
	switch (radius) {
		case 'none':
			return '0px';
		case 'sm':
			return '4px';
		case 'lg':
			return '12px';
		case 'full':
			return '9999px';
		default:
			return '8px';
	}
}

export function DynamicIcon({
	name,
	value,
	variant,
	background,
	radius,
	className,
	size,
	color,
	strokeWidth,
	style,
	...props
}: DynamicIconProps): React.ReactElement {
	const parsed = parseInlineIconPayload(value !== undefined ? value : name);
	const effectiveRawName = parsed ? parsed.name : name;
	const canonical = resolveCanonicalIconName(effectiveRawName);
	const resolvedVariant = variant ?? parsed?.variant ?? 'outline';

	const [, setCatalogTick] = React.useState(0);
	const catalog =
		typeof window !== 'undefined'
			? (
					window as unknown as {
						ProcessWireIcons?: {
							getCachedIcon: (n: string) => {
								outline: Array<[string, Record<string, string>]>;
								filled?: Array<[string, Record<string, string>]> | null;
							} | null;
							requestHydration: (n: string) => void;
						};
					}
				).ProcessWireIcons
			: undefined;

	const cachedEntry = catalog ? catalog.getCachedIcon(canonical) : null;
	const useFilledNodes =
		resolvedVariant === 'filled' && Boolean(cachedEntry?.filled && cachedEntry.filled.length > 0);

	const directNodes = cachedEntry
		? useFilledNodes
			? cachedEntry.filled
			: cachedEntry.outline
		: CORE_UI_ICON_NODES[canonical] ?? null;

	const needsHydration =
		!cachedEntry && (resolvedVariant === 'filled' || !CORE_UI_ICON_NODES[canonical]);

	React.useEffect(() => {
		if (!needsHydration || typeof window === 'undefined') {
			return;
		}
		const unsub = subscribeIconCatalog(() => setCatalogTick((n) => n + 1));
		if (catalog) {
			catalog.requestHydration(canonical);
		} else {
			const rt = (
				window as unknown as { ReactWorkspaceRuntime?: { ensureIconsLoaded?: () => Promise<void> } }
			).ReactWorkspaceRuntime;
			if (typeof rt?.ensureIconsLoaded === 'function') {
				void rt.ensureIconsLoaded().then(() => {
					const loaded = (
						window as unknown as { ProcessWireIcons?: { requestHydration: (n: string) => void } }
					).ProcessWireIcons;
					loaded?.requestHydration(canonical);
				});
			}
		}
		return unsub;
	}, [needsHydration, catalog, canonical]);

	const activeNodes: Array<[string, Record<string, string>]> =
		directNodes && directNodes.length > 0 ? directNodes : (CORE_UI_ICON_NODES.box ?? []);
	const resolvedSize = size ?? parsed?.size;
	const resolvedColor = color ?? parsed?.color;
	const resolvedStroke = strokeWidth ?? parsed?.strokeWidth;
	const resolvedBg =
		background && SAFE_ICON_COLOR_RE.test(background) ? background : parsed?.background;
	const resolvedRadius = radius ?? parsed?.radius;

	const hasExplicitSize = resolvedSize !== undefined;
	const mergedStyle = resolvedColor ? { color: resolvedColor, ...style } : style;
	const svgClass = cn(hasExplicitSize ? 'shrink-0' : 'size-4 shrink-0', className);
	const pxSize = typeof resolvedSize === 'number' || typeof resolvedSize === 'string' ? resolvedSize : 24;
	const strokeOrFillColor = resolvedColor || 'currentColor';

	const renderedChildren = activeNodes
		.filter((tuple) => Boolean(tuple[0] && ALLOWED_SVG_NODE_TAGS.has(tuple[0])))
		.map((tuple, idx) =>
			React.createElement(tuple[0], { ...sanitizeSvgNodeAttrs(tuple[1]), key: idx })
		);

	const iconEl = useFilledNodes ? (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={pxSize}
			height={pxSize}
			viewBox="0 0 24 24"
			fill={strokeOrFillColor}
			stroke="none"
			className={svgClass}
			style={mergedStyle}
			aria-hidden="true"
			{...props}
		>
			{renderedChildren}
		</svg>
	) : (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={pxSize}
			height={pxSize}
			viewBox="0 0 24 24"
			fill="none"
			stroke={strokeOrFillColor}
			strokeWidth={resolvedStroke ?? 2}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={svgClass}
			style={mergedStyle}
			aria-hidden="true"
			{...props}
		>
			{renderedChildren}
		</svg>
	);

	if (resolvedBg) {
		const pad = Math.max(3, Math.min(10, Math.round((typeof resolvedSize === 'number' ? resolvedSize : 20) * 0.3)));
		return (
			<span
				className="rw-icon-badge inline-flex items-center justify-center shrink-0"
				style={{
					backgroundColor: resolvedBg,
					borderRadius: resolveBadgeBorderRadius(resolvedRadius),
					padding: `${pad}px`,
				}}
			>
				{iconEl}
			</span>
		);
	}

	return iconEl;
}
