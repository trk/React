import { t } from '../../../lib/i18n';
import { cn, DynamicIcon, sanitizeHref, sanitizeImageSrc } from '../../../lib/utils';
import type { RelationItemData, RelationResourceDescriptor } from '../../types';

export interface RelationFieldProps {
	id?: string;
	name?: string;
	label?: string;
	cardinality?: 'm2o' | 'm2m' | 'o2m' | 'm2a' | string;
	resource?: string;
	resourceLabel?: string;
	resourceIcon?: string;
	resources?: RelationResourceDescriptor[];
	allowedResources?: string[];
	dependsResourceMap?: Record<string, string>;
	valueField?: string;
	widget?: string;
	configuredWidget?: string;
	endpoint?: string;
	relationToken?: string;
	value?: unknown;
	selectedItems?: RelationItemData[];
	initialOptions?: RelationItemData[];
	initialTree?: RelationItemData[];
	multiple?: boolean;
	sortable?: boolean;
	minItems?: number;
	maxItems?: number;
	optionColumns?: number;
	dependsOn?: string;
	allowCustom?: boolean;
	creatable?: boolean;
	editableLink?: boolean;
	allowLink?: boolean;
	allowUnlink?: boolean;
	foreignField?: string;
	ownerId?: string | number;
	placeholder?: string;
	readOnly?: boolean;
	disabled?: boolean;
	required?: boolean;
	inlinePortal?: boolean;
	formValues?: Record<string, unknown>;
	scopePrefix?: string;
	error?: string;
	errorId?: string;
	onChange?: (next: unknown) => void;
	props?: Record<string, unknown>;
}

export interface RelationEndpointResponse {
	ok?: boolean;
	error?: string;
	item?: RelationItemData;
	items?: RelationItemData[];
	tree?: RelationItemData[];
	total?: number;
	hasMore?: boolean;
	[key: string]: unknown;
}

export type RelationCallEndpointFn = (
	payload: Record<string, unknown>,
	mutating?: boolean,
	signal?: AbortSignal
) => Promise<RelationEndpointResponse>;

export function toStringValue(val: unknown): string {
	if (val === null || val === undefined) {
		return '';
	}
	return String(val).trim();
}

export function normalizeMultiValues(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		const out: string[] = [];
		for (const v of raw) {
			const s = toStringValue(v);
			if (s !== '' && s !== '0' && !out.includes(s)) {
				out.push(s);
			}
		}
		return out;
	}
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '' || trimmed === '0') {
			return [];
		}
		if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) {
					return normalizeMultiValues(parsed);
				}
			} catch {
				// Fall through to delimiter split
			}
		}
		return trimmed
			.split(/[|,]/)
			.map((s) => s.trim())
			.filter((s) => s !== '' && s !== '0');
	}
	if (typeof raw === 'number' && raw > 0) {
		return [String(raw)];
	}
	return [];
}

export function normalizeScalarValue(raw: unknown): string {
	if (Array.isArray(raw)) {
		return raw.length > 0 ? toStringValue(raw[0]) : '';
	}
	const s = toStringValue(raw);
	return s === '0' ? '' : s;
}

export function itemStoredToken(item: RelationItemData, cardinality: string): string {
	if (cardinality === 'm2a') {
		return item.key || `${item.resource}:${String(item.value)}`;
	}
	return String(item.value);
}

export function makeFallbackItem(token: string, cardinality: string, defaultResource: string): RelationItemData {
	if (cardinality === 'm2a' && token.includes(':')) {
		const idx = token.indexOf(':');
		const res = token.slice(0, idx);
		const val = token.slice(idx + 1);
		return {
			key: token,
			resource: res,
			resourceLabel: res.charAt(0).toUpperCase() + res.slice(1),
			value: val,
			id: val,
			label: val,
			icon: 'link-2',
		};
	}
	return {
		key: `${defaultResource}:${token}`,
		resource: defaultResource,
		value: token,
		id: token,
		label: token,
		icon: 'link-2',
	};
}

export function RelationItemVisual({
	item,
	fallbackIcon = 'file-text',
	size = 'sm',
}: {
	item?: RelationItemData;
	fallbackIcon?: string;
	size?: 'xs' | 'sm' | 'md';
}) {
	const boxSize = size === 'xs' ? 'size-4' : size === 'md' ? 'size-7' : 'size-5';
	const iconSize = size === 'xs' ? 'size-3' : size === 'md' ? 'size-4' : 'size-3.5';

	const safeThumb = sanitizeImageSrc(item?.thumb);
	if (safeThumb) {
		return (
			<img
				src={safeThumb}
				alt=""
				className={cn(boxSize, 'shrink-0 rounded object-cover border border-border/60 bg-muted')}
			/>
		);
	}
	return (
		<span
			className={cn(
				boxSize,
				'inline-flex shrink-0 items-center justify-center rounded bg-muted/70 text-muted-foreground'
			)}
		>
			<DynamicIcon name={item?.icon || fallbackIcon} className={iconSize} />
		</span>
	);
}

export function QuickEditButton({ item, enabled }: { item?: RelationItemData; enabled: boolean }) {
	const safeEditUrl = sanitizeHref(item?.editUrl);
	if (!enabled || !safeEditUrl) {
		return null;
	}
	return (
		<a
			href={safeEditUrl}
			target="_blank"
			rel="noopener noreferrer"
			onClick={(e) => e.stopPropagation()}
			title={t('relation.openNamed', { label: item?.label ?? '' }, 'Open {label}')}
			aria-label={t('relation.openNamed', { label: item?.label ?? '' }, 'Open {label}')}
			className="inline-flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		>
			<DynamicIcon name="external-link" className="size-3.5" />
		</a>
	);
}
