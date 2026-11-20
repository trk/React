import { createContext } from 'react';
import { fetchGatewayJson } from '../../hooks';
import { sanitizeHref } from '../../lib/utils';
import type { MediaCustomFieldRenderer, StudioMediaItem } from '../mediaUtils';
import type {
	InputfieldLanguageItem,
	InputfieldMediaItem,
	ReactInputfieldProps,
} from '../types';

export const MediaCustomFieldRendererContext = createContext<MediaCustomFieldRenderer | null>(null);

let registeredCustomFieldRenderer: MediaCustomFieldRenderer | null = null;

export function registerMediaCustomFieldRenderer(renderer: MediaCustomFieldRenderer): void {
	registeredCustomFieldRenderer = renderer;
	if (typeof window !== 'undefined') {
		(
			window as unknown as {
				ReactWorkspaceRuntime?: {
					__setMediaCustomFieldRenderer?: (fn: MediaCustomFieldRenderer) => void;
				};
			}
		).ReactWorkspaceRuntime?.__setMediaCustomFieldRenderer?.(renderer);
	}
}

export function getRegisteredCustomFieldRenderer(): MediaCustomFieldRenderer | null {
	return registeredCustomFieldRenderer;
}

export function normalizeMediaControlProps(
	rawProps: ReactInputfieldProps | Record<string, unknown>,
	isImage: boolean
): ReactInputfieldProps & { isStandaloneIsland: boolean; fieldErrors: string[] } {
	const rawRecord = rawProps as Record<string, unknown>;
	const nestedProps =
		rawRecord && typeof rawRecord.props === 'object' && rawRecord.props !== null
			? (rawRecord.props as Record<string, unknown>)
			: null;
	const merged = nestedProps ? { ...rawRecord, ...nestedProps } : { ...rawRecord };
	const unwrapped = merged as unknown as ReactInputfieldProps;

	const isStandaloneIsland = Boolean(rawRecord?.component || nestedProps);
	const mergedI18n =
		merged.i18n && typeof merged.i18n === 'object'
			? (merged.i18n as { languages?: InputfieldLanguageItem[] })
			: undefined;
	const rawLangs: InputfieldLanguageItem[] =
		Array.isArray(unwrapped.languages) && unwrapped.languages.length > 0
			? unwrapped.languages
			: Array.isArray(mergedI18n?.languages)
				? mergedI18n.languages
				: [];

	const rawErrors: string[] = [];
	if (typeof unwrapped.error === 'string' && unwrapped.error.trim() !== '') {
		rawErrors.push(unwrapped.error.trim());
	}
	if (Array.isArray(unwrapped.errors)) {
		for (const err of unwrapped.errors) {
			if (typeof err === 'string' && err.trim() !== '' && !rawErrors.includes(err.trim())) {
				rawErrors.push(err.trim());
			}
		}
	}

	const name = String(unwrapped.name || '');
	const id = String(unwrapped.id || (name ? `Inputfield_${name}` : isImage ? 'react_image_input' : 'react_file_input'));

	const rawMaxFiles = unwrapped.maxFiles ?? merged.maxItems ?? merged.max_files ?? merged.max_items;
	const parsedMaxFiles = Number(rawMaxFiles);
	const resolvedMaxFiles =
		Number.isFinite(parsedMaxFiles) && parsedMaxFiles > 0
			? Math.floor(parsedMaxFiles)
			: unwrapped.multiple === false
				? 1
				: 0;
	const resolvedMultiple =
		resolvedMaxFiles === 1
			? false
			: unwrapped.multiple !== undefined
				? Boolean(unwrapped.multiple)
				: true;

	const rawMinFiles = unwrapped.minFiles ?? merged.minItems ?? merged.min_files ?? merged.min_items;
	const parsedMinFiles = Number(rawMinFiles);
	const resolvedMinFiles =
		Number.isFinite(parsedMinFiles) && parsedMinFiles > 0 ? Math.floor(parsedMinFiles) : 0;

	const rawGridRatio = typeof unwrapped.gridRatio === 'string' ? unwrapped.gridRatio.trim().toLowerCase() : '4:3';
	const resolvedGridRatio = ['auto', '1:1', '4:3', '16:9', '3:4', '21:9'].includes(rawGridRatio)
		? rawGridRatio
		: '4:3';

	return {
		...(unwrapped as ReactInputfieldProps),
		controlType: isImage ? 'image' : 'file',
		id,
		name,
		minFiles: resolvedMinFiles,
		maxFiles: resolvedMaxFiles,
		multiple: resolvedMultiple,
		gridRatio: resolvedGridRatio,
		languages: rawLangs,
		files: Array.isArray(unwrapped.files) ? unwrapped.files : [],
		extensions: Array.isArray(unwrapped.extensions) ? unwrapped.extensions : [],
		tagsList: Array.isArray(unwrapped.tagsList) ? unwrapped.tagsList : [],
		tagsPredefinedOnly: Boolean(unwrapped.tagsPredefinedOnly),
		noUpload: Boolean(unwrapped.noUpload),
		maxReject: Boolean(unwrapped.maxReject),
		dimensionsByAspectRatio: Boolean(unwrapped.dimensionsByAspectRatio),
		mediaEndpoint: typeof unwrapped.mediaEndpoint === 'string' ? unwrapped.mediaEndpoint : '',
		mediaToken: typeof unwrapped.mediaToken === 'string' ? unwrapped.mediaToken : '',
		ownerId:
			unwrapped.ownerId !== undefined && unwrapped.ownerId !== null && String(unwrapped.ownerId) !== ''
				? String(unwrapped.ownerId)
				: undefined,
		focusMode:
			typeof unwrapped.focusMode === 'string' && unwrapped.focusMode !== ''
				? unwrapped.focusMode
				: isImage
					? 'zoom'
					: 'off',
		useImageEditor: unwrapped.useImageEditor !== undefined ? Boolean(unwrapped.useImageEditor) : isImage,
		isStandaloneIsland,
		fieldErrors: rawErrors,
	};
}

const SAFE_HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const SAFE_RASTER_LQIP_RE = /^data:image\/(?:webp|png|jpe?g|gif|avif);base64,[A-Za-z0-9+/=]+$/i;

export function sanitizeHexColor(raw?: string | null): string {
	const trimmed = typeof raw === 'string' ? raw.trim() : '';
	return SAFE_HEX_COLOR_RE.test(trimmed) ? trimmed : '';
}

export function sanitizeRasterLqip(raw?: string | null): string {
	const trimmed = typeof raw === 'string' ? raw.trim() : '';
	return SAFE_RASTER_LQIP_RE.test(trimmed) ? trimmed : '';
}

export function hydrateStudioMediaItems(rawItems?: InputfieldMediaItem[]): StudioMediaItem[] {
	if (!Array.isArray(rawItems)) {
		return [];
	}
	return rawItems.map((item, idx) => ({
		...item,
		url: sanitizeHref(item.url),
		thumbUrl: item.thumbUrl ? sanitizeHref(item.thumbUrl) : undefined,
		dominantColor: sanitizeHexColor(item.dominantColor) || undefined,
		lqip: sanitizeRasterLqip(item.lqip) || undefined,
		descriptions:
			item.descriptions && typeof item.descriptions === 'object'
				? { ...item.descriptions }
				: { default: item.description || '' },
		palette: Array.isArray(item.palette)
			? item.palette.map((c) => sanitizeHexColor(c)).filter(Boolean)
			: [],
		customFields: Array.isArray(item.customFields) ? item.customFields : [],
		customValues:
			item.customValues && typeof item.customValues === 'object' ? { ...item.customValues } : {},
		sort: typeof item.sort === 'number' ? item.sort : idx,
		markedForDelete: false,
	}));
}

export function getLanguageCountSummary(
	item: StudioMediaItem,
	languages?: InputfieldLanguageItem[]
): { total: number; filled: number; hasDefault: boolean } {
	if (!languages || languages.length <= 1) {
		const hasText = Boolean((item.description || '').trim() !== '');
		return { total: 1, filled: hasText ? 1 : 0, hasDefault: hasText };
	}
	let filled = 0;
	let hasDefault = false;
	for (const lang of languages) {
		const key = lang.isDefault ? 'default' : String(lang.id);
		const val = lang.isDefault
			? (item.descriptions?.[key] ?? item.description ?? '')
			: (item.descriptions?.[key] ?? '');
		if (String(val).trim() !== '') {
			filled += 1;
			if (lang.isDefault) {
				hasDefault = true;
			}
		}
	}
	return { total: languages.length, filled, hasDefault };
}

export async function postMediaJsonAction(
	endpoint: string,
	payload: Record<string, unknown>
): Promise<{ ok: boolean; item?: InputfieldMediaItem; items?: InputfieldMediaItem[]; error?: string }> {
	if (!String(endpoint ?? '').trim()) {
		return { ok: false, error: 'Invalid media endpoint.' };
	}
	const res = await fetchGatewayJson<{
		ok?: boolean;
		item?: InputfieldMediaItem;
		items?: InputfieldMediaItem[];
		error?: string;
	}>(endpoint, {
		method: 'POST',
		payload,
	});
	if (res.ok && res.data?.ok) {
		return {
			ok: true,
			item: res.data.item,
			items: res.data.items,
		};
	}
	return {
		ok: false,
		error:
			res.error ||
			(res.status > 0
				? `Media action failed (${res.status})`
				: 'Network error while communicating with media endpoint.'),
	};
}

export function notifyHostFormChanged(el?: HTMLElement | null): void {
	if (!el || typeof CustomEvent === 'undefined') {
		return;
	}
	const form = el.closest('form');
	if (form) {
		form.classList.add('InputfieldFormChanged');
		form.dispatchEvent(new Event('change', { bubbles: true }));
	}
}

export function parseTagsArray(rawTags: string): string[] {
	if (!rawTags || rawTags.trim() === '') {
		return [];
	}
	const seen = new Set<string>();
	const out: string[] = [];
	for (const part of rawTags.split(/[\s,]+/)) {
		const clean = part.trim();
		if (clean !== '' && !seen.has(clean.toLowerCase())) {
			seen.add(clean.toLowerCase());
			out.push(clean);
		}
	}
	return out;
}
