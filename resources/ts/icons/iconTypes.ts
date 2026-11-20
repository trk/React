import {
	ICON_ALIASES,
	POPULAR_ICONS,
} from './faAliases';

export { ICON_ALIASES, POPULAR_ICONS };

export type SvgNodeTuple = [string, Record<string, string>];

export type IconVariant = 'outline' | 'filled';

export type IconBadgeRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';

export interface NormalizedIconValue {
	name: string;
	variant: IconVariant;
	size: number;
	color: string;
	strokeWidth: number;
	background: string;
	radius: IconBadgeRadius;
}

export interface IconCustomizationFlags {
	allowCustomization: boolean;
	allowVariant: boolean;
	allowSize: boolean;
	allowColor: boolean;
	allowStrokeWidth: boolean;
	allowBackground: boolean;
}

export interface IconCategoryOption {
	id: string;
	label: string;
	count: number;
}

export interface IconCatalogEntry {
	name: string;
	label: string;
	category: string;
	hasFilled: boolean;
	outline: SvgNodeTuple[];
	filled?: SvgNodeTuple[] | null;
}

export interface IconQueryResponse {
	ok: boolean;
	total: number;
	offset: number;
	limit: number;
	hasMore: boolean;
	categories?: IconCategoryOption[];
	popular?: IconCatalogEntry[];
	items: IconCatalogEntry[];
}

export interface IconCatalogRuntime {
	getCachedIcon: (name: string) => IconCatalogEntry | null;
	resolveAlias: (name?: string | null) => string;
	requestHydration: (name: string) => void;
	queryIcons: (params: {
		q?: string;
		category?: string;
		style?: 'all' | 'outline' | 'filled';
		offset?: number;
		limit?: number;
		includeMeta?: boolean;
		endpoint?: string;
		signal?: AbortSignal;
	}) => Promise<IconQueryResponse>;
	renderSvgString: (
		input?: string | Partial<NormalizedIconValue> | null,
		overrides?: {
			variant?: IconVariant;
			size?: number;
			color?: string;
			strokeWidth?: number;
			className?: string;
		}
	) => string;
}

export const ICON_SIZE_PRESETS: readonly number[] = [16, 20, 24, 32, 40, 48];
export const ICON_STROKE_PRESETS: readonly number[] = [1.25, 1.5, 1.75, 2, 2.5];
export const ICON_RADIUS_OPTIONS: ReadonlyArray<{ value: IconBadgeRadius; label: string }> = [
	{ value: 'none', label: 'Square' },
	{ value: 'sm', label: 'Small' },
	{ value: 'md', label: 'Medium' },
	{ value: 'lg', label: 'Large' },
	{ value: 'full', label: 'Circle' },
];

export const ICON_COLOR_SWATCHES: readonly string[] = [
	'',
	'#0f172a',
	'#475569',
	'#eb1d61',
	'#e11d48',
	'#ea580c',
	'#d97706',
	'#16a34a',
	'#0d9488',
	'#0284c7',
	'#2563eb',
	'#7c3aed',
];

export const ICON_BG_SWATCHES: readonly string[] = [
	'',
	'#f1f5f9',
	'#ffe4e6',
	'#ffedd5',
	'#fef3c7',
	'#dcfce7',
	'#ccfbf1',
	'#e0f2fe',
	'#dbeafe',
	'#ede9fe',
	'#0f172a',
	'#eb1d61',
];

const SAFE_COLOR_RE = /^(?:#[0-9a-fA-F]{3,8}|currentColor|var\(--[a-zA-Z0-9_-]+\))$/;
const VALID_RADII = new Set<IconBadgeRadius>(['none', 'sm', 'md', 'lg', 'full']);

const SPECIAL_BRAND_LABELS: Record<string, string> = {
	whatsapp: 'WhatsApp',
	youtube: 'YouTube',
	tiktok: 'TikTok',
	linkedin: 'LinkedIn',
	github: 'GitHub',
	gitlab: 'GitLab',
	javascript: 'JavaScript',
	typescript: 'TypeScript',
	html5: 'HTML5',
	css3: 'CSS3',
	paypal: 'PayPal',
	openai: 'OpenAI',
	ios: 'iOS',
	macos: 'macOS',
};

export function formatIconLabel(rawName?: string | null): string {
	const clean = cleanIconIdentifier(rawName);
	if (!clean) {
		return '';
	}
	const withoutBrand = clean.startsWith('brand-') ? clean.slice(6) : clean;
	if (SPECIAL_BRAND_LABELS[withoutBrand]) {
		return SPECIAL_BRAND_LABELS[withoutBrand];
	}
	return withoutBrand
		.split('-')
		.filter(Boolean)
		.map((part) => SPECIAL_BRAND_LABELS[part] ?? (part.charAt(0).toUpperCase() + part.slice(1)))
		.join(' ');
}

export function cleanIconIdentifier(raw?: string | null): string {
	if (!raw) {
		return '';
	}
	return String(raw)
		.trim()
		.replace(/rwvreplaced-/gi, 'fa-')
		.replace(
			/^(?:fa-rwv--|rwv--|fa-solid\s+fa-|fa-regular\s+fa-|fa-brands\s+fa-|fas\s+fa-|far\s+fa-|fab\s+fa-|ti\s+ti-|ti-|fa-|icon-|uk-icon-)/i,
			''
		)
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/[^a-zA-Z0-9-]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase();
}

export function sanitizeIconVariant(raw?: unknown, fallback: IconVariant = 'outline'): IconVariant {
	if (typeof raw === 'string') {
		const lower = raw.trim().toLowerCase();
		if (lower === 'filled' || lower === 'fill' || lower === 'solid') {
			return 'filled';
		}
		if (lower === 'outline' || lower === 'regular' || lower === 'line') {
			return 'outline';
		}
	}
	return fallback;
}

export function sanitizeIconColor(raw?: unknown): string {
	if (typeof raw !== 'string') {
		return '';
	}
	const trimmed = raw.trim();
	if (trimmed === '' || trimmed.toLowerCase() === 'currentcolor' || trimmed.toLowerCase() === 'inherit') {
		return '';
	}
	return SAFE_COLOR_RE.test(trimmed) ? trimmed : '';
}

export function clampIconSize(raw?: unknown, fallback = 24): number {
	const num = typeof raw === 'number' ? raw : Number(raw);
	if (!Number.isFinite(num) || num <= 0) {
		return fallback;
	}
	return Math.min(96, Math.max(12, Math.round(num)));
}

export function clampIconStrokeWidth(raw?: unknown, fallback = 2): number {
	const num = typeof raw === 'number' ? raw : Number(raw);
	if (!Number.isFinite(num) || num <= 0) {
		return fallback;
	}
	const clamped = Math.min(3, Math.max(1, num));
	return Math.round(clamped * 100) / 100;
}

export function sanitizeIconRadius(raw?: unknown, fallback: IconBadgeRadius = 'md'): IconBadgeRadius {
	if (typeof raw === 'string') {
		const lower = raw.trim().toLowerCase() as IconBadgeRadius;
		if (VALID_RADII.has(lower)) {
			return lower;
		}
	}
	return fallback;
}

export function resolveIconCustomizationFlags(raw?: Partial<IconCustomizationFlags> | null): IconCustomizationFlags {
	const master = Boolean(raw?.allowCustomization);
	const hasAnyExplicit =
		Boolean(raw?.allowVariant) ||
		Boolean(raw?.allowSize) ||
		Boolean(raw?.allowColor) ||
		Boolean(raw?.allowStrokeWidth) ||
		Boolean(raw?.allowBackground);
	const active = master || hasAnyExplicit;
	if (!active) {
		return {
			allowCustomization: false,
			allowVariant: false,
			allowSize: false,
			allowColor: false,
			allowStrokeWidth: false,
			allowBackground: false,
		};
	}
	return {
		allowCustomization: true,
		allowVariant: raw?.allowVariant !== undefined ? Boolean(raw.allowVariant) : master,
		allowSize: raw?.allowSize !== undefined ? Boolean(raw.allowSize) : master,
		allowColor: raw?.allowColor !== undefined ? Boolean(raw.allowColor) : master,
		allowStrokeWidth: raw?.allowStrokeWidth !== undefined ? Boolean(raw.allowStrokeWidth) : master,
		allowBackground: raw?.allowBackground !== undefined ? Boolean(raw.allowBackground) : master,
	};
}

export function normalizeIconValue(raw: unknown): NormalizedIconValue {
	const base: NormalizedIconValue = {
		name: '',
		variant: 'outline',
		size: 24,
		color: '',
		strokeWidth: 2,
		background: '',
		radius: 'md',
	};

	if (raw === null || raw === undefined || raw === false) {
		return base;
	}

	let candidate: unknown = raw;
	if (typeof candidate === 'string') {
		const trimmed = candidate.trim();
		if (trimmed === '') {
			return base;
		}
		if (trimmed.startsWith('{') && trimmed.length <= 4096) {
			try {
				const parsed: unknown = JSON.parse(trimmed);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					candidate = parsed;
				}
			} catch {
				// Treat malformed JSON as literal string below
			}
		}
		if (typeof candidate === 'string') {
			let rawScalar = trimmed;
			if (/:filled$/i.test(rawScalar)) {
				base.variant = 'filled';
				rawScalar = rawScalar.replace(/:filled$/i, '');
			} else if (/-filled$/i.test(rawScalar) && rawScalar.length > 7) {
				base.variant = 'filled';
				rawScalar = rawScalar.replace(/-filled$/i, '');
			}
			const clean = cleanIconIdentifier(rawScalar);
			base.name = ICON_ALIASES[clean] ?? clean;
			return base;
		}
	}

	if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
		const obj = candidate as Record<string, unknown>;
		let rawName = typeof obj.name === 'string' ? obj.name : typeof obj.icon === 'string' ? obj.icon : '';
		let explicitVariant = sanitizeIconVariant(obj.variant ?? obj.style, 'outline');
		if (/:filled$/i.test(rawName)) {
			explicitVariant = 'filled';
			rawName = rawName.replace(/:filled$/i, '');
		} else if (/-filled$/i.test(rawName) && rawName.length > 7) {
			explicitVariant = 'filled';
			rawName = rawName.replace(/-filled$/i, '');
		}
		const clean = cleanIconIdentifier(rawName);
		base.name = ICON_ALIASES[clean] ?? clean;
		base.variant = explicitVariant;
		base.size = clampIconSize(obj.size, 24);
		base.color = sanitizeIconColor(obj.color);
		base.strokeWidth = clampIconStrokeWidth(obj.strokeWidth ?? obj.stroke, 2);
		base.background = sanitizeIconColor(obj.background ?? obj.bg);
		base.radius = sanitizeIconRadius(obj.radius ?? obj.shape, 'md');
	}

	return base;
}

export function serializeIconValueForInput(
	val: NormalizedIconValue,
	flags: IconCustomizationFlags,
	prefixMode: 'none' | 'vector' | 'fa' = 'none'
): string {
	if (!val.name) {
		return '';
	}
	if (!flags.allowCustomization) {
		const scalarName = val.variant === 'filled' ? `${val.name}-filled` : val.name;
		if (prefixMode === 'vector') {
			return scalarName.startsWith('rwv--') ? scalarName : `rwv--${scalarName}`;
		}
		if (prefixMode === 'fa') {
			return scalarName.startsWith('fa-') ? scalarName : `fa-${scalarName}`;
		}
		return scalarName;
	}
	const payload: NormalizedIconValue = {
		name: val.name,
		variant: flags.allowVariant ? sanitizeIconVariant(val.variant, 'outline') : 'outline',
		size: flags.allowSize ? clampIconSize(val.size, 24) : 24,
		color: flags.allowColor ? sanitizeIconColor(val.color) : '',
		strokeWidth: flags.allowStrokeWidth ? clampIconStrokeWidth(val.strokeWidth, 2) : 2,
		background: flags.allowBackground ? sanitizeIconColor(val.background) : '',
		radius: flags.allowBackground ? sanitizeIconRadius(val.radius, 'md') : 'md',
	};
	return JSON.stringify(payload);
}

export function badgeRadiusCssValue(radius: IconBadgeRadius): string {
	switch (radius) {
		case 'none':
			return '0px';
		case 'sm':
			return '4px';
		case 'lg':
			return '12px';
		case 'full':
			return '9999px';
		case 'md':
		default:
			return '8px';
	}
}

export function escapeXmlAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
