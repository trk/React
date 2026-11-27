import React, { useEffect, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon, sanitizeImageSrc } from '../../lib/utils';
import { Badge } from '../primitives/Badge';

export type ViewportBadgeVariant =
	| 'default'
	| 'primary'
	| 'secondary'
	| 'outline'
	| 'success'
	| 'warning'
	| 'danger'
	| 'destructive'
	| 'muted';

export interface ViewportBadgeSpec {
	label: string;
	variant?: ViewportBadgeVariant;
	dot?: boolean;
	icon?: string;
	mono?: boolean;
}

export interface ViewportThumbSpec {
	src: string;
	darkSrc?: string;
	alt: string;
	count: number;
	aspect?: 'square' | 'video';
}

export interface ViewportCellObject {
	label?: string;
	title?: string;
	icon?: string | Record<string, unknown>;
	thumb?: string | { src: string; darkSrc?: string; alt?: string; count?: number; aspect?: 'square' | 'video' };
	href?: string;
	external?: boolean;
	copyValue?: string;
	copyable?: boolean;
	subtitle?: string;
	subtitleMono?: boolean;
	badge?: string | ViewportBadgeSpec;
	badges?: Array<string | ViewportBadgeSpec>;
	maxBadges?: number;
	mono?: boolean;
	tabular?: boolean;
	nowrap?: boolean;
	truncate?: boolean | number;
}

const VALID_BADGE_VARIANTS = new Set<string>([
	'default',
	'primary',
	'secondary',
	'outline',
	'success',
	'warning',
	'danger',
	'destructive',
	'muted',
]);

export function isViewportCellObject(raw: unknown): raw is ViewportCellObject {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return false;
	}
	const obj = raw as Record<string, unknown>;
	return (
		'label' in obj ||
		'title' in obj ||
		'thumb' in obj ||
		'href' in obj ||
		'subtitle' in obj ||
		'badge' in obj ||
		'badges' in obj ||
		'copyValue' in obj ||
		('icon' in obj && !('svg' in obj && 'set' in obj))
	);
}

export function normalizeViewportBadges(raw: unknown): ViewportBadgeSpec[] {
	if (!raw) {
		return [];
	}
	const source = Array.isArray(raw) ? raw : [raw];
	const out: ViewportBadgeSpec[] = [];
	for (const entry of source) {
		if (typeof entry === 'string') {
			const clean = entry.trim();
			if (clean !== '') {
				out.push({ label: clean, variant: 'secondary' });
			}
		} else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
			const obj = entry as Record<string, unknown>;
			const label = typeof obj.label === 'string' ? obj.label.trim() : '';
			if (label === '') {
				continue;
			}
			const rawVar = typeof obj.variant === 'string' ? obj.variant.trim().toLowerCase() : '';
			out.push({
				label,
				variant: VALID_BADGE_VARIANTS.has(rawVar) ? (rawVar as ViewportBadgeVariant) : 'secondary',
				dot: Boolean(obj.dot),
				icon: typeof obj.icon === 'string' && obj.icon.trim() !== '' ? obj.icon.trim() : undefined,
				mono: Boolean(obj.mono),
			});
		}
	}
	return out;
}

export function normalizeViewportThumb(raw: unknown, fallbackAlt = ''): ViewportThumbSpec | null {
	if (typeof raw === 'string') {
		const safeSrc = sanitizeImageSrc(raw);
		if (!safeSrc) {
			return null;
		}
		return { src: safeSrc, alt: fallbackAlt, count: 1 };
	}
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		const obj = raw as Record<string, unknown>;
		const safeSrc = typeof obj.src === 'string' ? sanitizeImageSrc(obj.src) : '';
		if (!safeSrc) {
			return null;
		}
		const safeDarkSrc = typeof obj.darkSrc === 'string' ? sanitizeImageSrc(obj.darkSrc) : '';
		const rawAspect = typeof obj.aspect === 'string' ? obj.aspect.trim().toLowerCase() : '';
		const countNum = Number(obj.count);
		return {
			src: safeSrc,
			darkSrc: safeDarkSrc || undefined,
			alt: typeof obj.alt === 'string' && obj.alt.trim() !== '' ? obj.alt.trim() : fallbackAlt,
			count: Number.isFinite(countNum) && countNum > 1 ? Math.round(countNum) : 1,
			aspect: rawAspect === 'video' ? 'video' : rawAspect === 'square' ? 'square' : undefined,
		};
	}
	return null;
}

function readRwDocumentDarkTheme(): boolean {
	if (typeof document === 'undefined') {
		return false;
	}
	const root = document.documentElement;
	const body = document.body;
	if (root.classList.contains('dark') || body?.classList.contains('dark-theme')) {
		return true;
	}
	if (root.classList.contains('light') || body?.classList.contains('light-theme')) {
		return false;
	}
	return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
		? window.matchMedia('(prefers-color-scheme: dark)').matches
		: false;
}

const rwThemeSubscribers = new Set<(isDark: boolean) => void>();
let rwThemeObserverBound = false;

function ensureRwThemeObserver(): void {
	if (rwThemeObserverBound || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
		return;
	}
	rwThemeObserverBound = true;
	const notify = () => {
		const next = readRwDocumentDarkTheme();
		for (const cb of rwThemeSubscribers) {
			cb(next);
		}
	};
	const observer = new MutationObserver(notify);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['class', 'data-theme-mode'],
	});
	if (document.body) {
		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ['class'],
		});
	}
	if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
		const mql = window.matchMedia('(prefers-color-scheme: dark)');
		if (typeof mql.addEventListener === 'function') {
			mql.addEventListener('change', notify);
		}
	}
}

export function useRwDarkTheme(): boolean {
	const [isDark, setIsDark] = useState<boolean>(readRwDocumentDarkTheme);

	useEffect(() => {
		ensureRwThemeObserver();
		setIsDark(readRwDocumentDarkTheme());
		rwThemeSubscribers.add(setIsDark);
		return () => {
			rwThemeSubscribers.delete(setIsDark);
		};
	}, []);

	return isDark;
}

export function isFramedIconPayload(raw: unknown): boolean {
	if (!raw) {
		return false;
	}
	let candidate = raw;
	if (typeof candidate === 'string') {
		const trimmed = candidate.trim();
		if (!trimmed.startsWith('{') || trimmed.length > 4096) {
			return false;
		}
		try {
			candidate = JSON.parse(trimmed);
		} catch {
			return false;
		}
	}
	if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
		return false;
	}
	const obj = candidate as Record<string, unknown>;
	const bg = typeof obj.background === 'string' ? obj.background.trim() : typeof obj.bg === 'string' ? obj.bg.trim() : '';
	return bg !== '';
}

export function applyTextTruncate(
	value: string,
	truncate?: boolean | number
): { display: string; truncated: boolean; cssTruncate: boolean } {
	if (typeof truncate === 'number' && truncate > 0) {
		const chars = Array.from(value);
		if (chars.length > truncate) {
			return {
				display: `${chars.slice(0, truncate).join('').trimEnd()}…`,
				truncated: true,
				cssTruncate: false,
			};
		}
		return { display: value, truncated: false, cssTruncate: false };
	}
	if (truncate === true) {
		return { display: value, truncated: value.length > 0, cssTruncate: true };
	}
	return { display: value, truncated: false, cssTruncate: false };
}

export function isVisualOnlyColumn(_colKey: string, colDef?: { type?: string }): boolean {
	const colType = colDef?.type ? String(colDef.type).trim().toLowerCase() : '';
	return colType === 'icon' || colType === 'image' || colType === 'media';
}

export function resolvePrimaryColumnKey(
	cols: Record<string, { primary?: boolean; type?: string }>
): string {
	const entries = Object.entries(cols);
	if (entries.length === 0) {
		return 'title';
	}
	const explicit = entries.find(([, def]) => Boolean(def?.primary));
	if (explicit) {
		return explicit[0];
	}
	const firstDataCol = entries.find(([key, def]) => !isVisualOnlyColumn(key, def));
	return firstDataCol ? firstDataCol[0] : (entries[0]?.[0] ?? 'title');
}

export function hasCustomIconColor(raw: unknown): boolean {
	if (!raw) {
		return false;
	}
	let candidate = raw;
	if (typeof candidate === 'string') {
		const trimmed = candidate.trim();
		if (!trimmed.startsWith('{') || trimmed.length > 4096) {
			return false;
		}
		try {
			candidate = JSON.parse(trimmed);
		} catch {
			return false;
		}
	}
	if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
		return false;
	}
	const rawColor = (candidate as Record<string, unknown>).color;
	return typeof rawColor === 'string' && rawColor.trim() !== '';
}

export interface ResolvedRecordVisuals {
	icon?: string | Record<string, unknown>;
	thumb: ViewportThumbSpec | null;
	subtitle: string;
	badges: ViewportBadgeSpec[];
	locked: boolean;
}

export function resolveRecordVisuals(
	record: Record<string, unknown>,
	options?: {
		hasDedicatedIconColumn?: boolean;
		hasDedicatedThumbColumn?: boolean;
	}
): ResolvedRecordVisuals {
	const fallbackLabel = String(record.title ?? record.label ?? record.name ?? record.id ?? '');
	const rawThumb = options?.hasDedicatedThumbColumn
		? undefined
		: record._thumb !== undefined
			? record._thumb
			: record.thumb;
	const thumb = normalizeViewportThumb(rawThumb, fallbackLabel);

	const rawIconCandidate = options?.hasDedicatedIconColumn
		? undefined
		: record._icon !== undefined
			? record._icon
			: record.icon;
	let icon: string | Record<string, unknown> | undefined;
	if (typeof rawIconCandidate === 'string' && rawIconCandidate.trim() !== '') {
		icon = rawIconCandidate.trim();
	} else if (rawIconCandidate && typeof rawIconCandidate === 'object' && !Array.isArray(rawIconCandidate)) {
		const iconObj = rawIconCandidate as Record<string, unknown>;
		if (typeof iconObj.name === 'string' && iconObj.name.trim() !== '') {
			icon = iconObj;
		} else if (typeof iconObj.icon === 'string' && iconObj.icon.trim() !== '') {
			icon = iconObj;
		}
	}

	const rawSubtitle =
		typeof record._subtitle === 'string' && record._subtitle.trim() !== ''
			? record._subtitle.trim()
			: typeof record.subtitle === 'string' && record.subtitle.trim() !== ''
				? record.subtitle.trim()
				: '';

	return {
		icon,
		thumb,
		subtitle: rawSubtitle !== fallbackLabel ? rawSubtitle : '',
		badges: normalizeViewportBadges(record._badges ?? record.badges),
		locked: Boolean(record._locked),
	};
}

export interface RecordLeadingVisualProps {
	thumb?: ViewportThumbSpec | null;
	icon?: string | Record<string, unknown>;
	multiline?: boolean;
	size?: '2xs' | 'xs' | 'sm' | 'md';
	shape?: 'rounded' | 'circle' | 'video';
	className?: string;
}

export function RecordLeadingVisual({
	thumb,
	icon,
	multiline = false,
	size = 'md',
	shape,
	className,
}: RecordLeadingVisualProps): React.ReactElement | null {
	const isDark = useRwDarkTheme();

	if (thumb && thumb.src) {
		const isVideo = thumb.aspect === 'video' || shape === 'video';
		const sizeCls = isVideo
			? size === '2xs'
				? 'h-3.5 w-6'
				: size === 'xs'
					? 'h-[18px] w-8'
					: size === 'sm'
						? 'h-[22px] w-10'
						: 'h-7 w-12'
			: size === '2xs'
				? 'size-4'
				: size === 'xs'
					? 'size-6'
					: size === 'sm'
						? 'size-8'
						: 'size-9';
		const imgW = isVideo
			? size === '2xs'
				? 24
				: size === 'xs'
					? 32
					: size === 'sm'
						? 40
						: 48
			: size === '2xs'
				? 16
				: size === 'xs'
					? 24
					: size === 'sm'
						? 32
						: 36;
		const imgH = isVideo
			? size === '2xs'
				? 14
				: size === 'xs'
					? 18
					: size === 'sm'
						? 22
						: 28
			: size === '2xs'
				? 16
				: size === 'xs'
					? 24
					: size === 'sm'
						? 32
						: 36;
		const radiusCls = !isVideo && shape === 'circle' ? 'rounded-full' : 'rounded-md';
		const activeSrc = isDark && thumb.darkSrc ? thumb.darkSrc : thumb.src;
		return (
			<span data-rw-visual-thumb="" className={cn('relative inline-flex shrink-0', className)}>
				<img
					src={activeSrc}
					alt={thumb.alt}
					width={imgW}
					height={imgH}
					loading="lazy"
					data-rw-preview-scheme={isDark ? 'dark' : 'light'}
					className={cn(sizeCls, radiusCls, 'border border-border/70 bg-muted object-cover')}
				/>
				{thumb.count > 1 ? (
					<span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full border border-card bg-secondary px-1 text-[10px] font-semibold leading-4 text-secondary-foreground tabular-nums">
						+{thumb.count - 1}
					</span>
				) : null}
			</span>
		);
	}

	if (icon !== undefined && icon !== '') {
		const framed = isFramedIconPayload(icon);
		const customColor = hasCustomIconColor(icon);
		const clampedSize = framed
			? size === '2xs'
				? 10
				: size === 'xs'
					? 12
					: size === 'sm'
						? 14
						: 16
			: size === '2xs'
				? 12
				: size === 'xs'
					? 14
					: size === 'sm'
						? 16
						: 18;
		const iconColorCls = !framed && !customColor ? 'text-muted-foreground' : undefined;
		return (
			<DynamicIcon
				value={icon}
				name={typeof icon === 'string' ? icon : undefined}
				size={clampedSize}
				data-rw-visual-icon=""
				className={cn('shrink-0', iconColorCls, multiline && !framed && 'mt-0.5', className)}
			/>
		);
	}

	return null;
}

export interface BadgeGroupProps {
	badges: ViewportBadgeSpec[];
	maxVisible?: number;
	compact?: boolean;
	className?: string;
}

export function BadgeGroup({
	badges,
	maxVisible = 3,
	compact = false,
	className,
}: BadgeGroupProps): React.ReactElement | null {
	if (!badges || badges.length === 0) {
		return null;
	}
	const cap = Math.max(1, maxVisible);
	const visible = badges.slice(0, cap);
	const hidden = badges.slice(cap);
	const compactCls = compact ? 'px-1.5 py-0 text-[10px]' : undefined;

	return (
		<span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
			{visible.map((b, i) => (
				<Badge
					key={`${b.label}-${i}`}
					variant={b.variant || 'secondary'}
					dot={b.dot}
					icon={b.icon}
					mono={b.mono}
					className={cn('shrink-0', compactCls)}
				>
					{b.label}
				</Badge>
			))}
			{hidden.length > 0 ? (
				<Badge
					variant="muted"
					title={hidden.map((h) => h.label).join(', ')}
					className={cn('shrink-0 tabular-nums', compactCls)}
				>
					+{hidden.length}
				</Badge>
			) : null}
		</span>
	);
}

let lastCopyAnnouncement = '';

function copyViaExecCommandFallback(text: string): boolean {
	if (typeof document === 'undefined' || !document.body) {
		return false;
	}
	const field = Object.assign(document.createElement('textarea'), { value: text });
	field.setAttribute('readonly', '');
	field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
	document.body.appendChild(field);
	field.select();
	try {
		return document.execCommand('copy');
	} catch {
		return false;
	} finally {
		field.remove();
	}
}

export interface CopyValueButtonProps {
	value: string;
	subjectLabel?: string;
	revealOnHover?: boolean;
	className?: string;
}

export function CopyValueButton({
	value,
	subjectLabel,
	revealOnHover = true,
	className,
}: CopyValueButtonProps): React.ReactElement | null {
	const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
	const [tipText, setTipText] = useState('');
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current !== null && typeof window !== 'undefined') {
				window.clearTimeout(timerRef.current);
			}
		};
	}, []);

	if (!value) {
		return null;
	}

	const copyVerb = t('common.copy', 'Copy');
	const accessibleSubject = (subjectLabel || value).trim();
	const buttonLabel = accessibleSubject ? `${copyVerb} ${accessibleSubject}` : copyVerb;

	const reportOutcome = (ok: boolean) => {
		if (typeof window === 'undefined') {
			return;
		}
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
		}
		setStatus(ok ? 'copied' : 'failed');
		let msg = ok ? t('common.copied', 'Copied') : t('common.copyFailed', 'Copy failed');
		if (msg === lastCopyAnnouncement) {
			msg += '\u00A0';
		}
		lastCopyAnnouncement = msg;
		setTipText('');
		window.requestAnimationFrame(() => {
			setTipText(msg);
		});
		timerRef.current = window.setTimeout(() => {
			setStatus('idle');
			setTipText('');
			timerRef.current = null;
		}, 1800);
	};

	const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation();
		try {
			if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(value);
				reportOutcome(true);
				return;
			}
			if (copyViaExecCommandFallback(value)) {
				reportOutcome(true);
			} else {
				reportOutcome(false);
			}
		} catch {
			if (copyViaExecCommandFallback(value)) {
				reportOutcome(true);
			} else {
				reportOutcome(false);
			}
		}
	};

	return (
		<span data-rw-copy-wrap="" className={cn('relative inline-flex shrink-0 items-center', className)}>
			<button
				type="button"
				data-rw-copy-btn=""
				data-reveal={revealOnHover ? 'hover' : 'always'}
				data-copied={status === 'copied' ? '' : undefined}
				data-failed={status === 'failed' ? '' : undefined}
				aria-label={buttonLabel}
				title={buttonLabel}
				onClick={(e) => {
					void handleCopy(e);
				}}
				className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring cursor-pointer"
			>
				<DynamicIcon
					name={status === 'copied' ? 'check' : status === 'failed' ? 'alert-circle' : 'copy'}
					aria-hidden="true"
					className={cn(
						'size-3.5',
						status === 'copied' && 'text-success',
						status === 'failed' && 'text-destructive'
					)}
				/>
			</button>
			<span
				role="status"
				data-rw-copy-tip=""
				className={cn(
					'pointer-events-none absolute bottom-full right-0 z-30 mb-1 whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5 text-[10px] font-medium text-popover-foreground shadow-sm transition-opacity duration-150',
					tipText !== '' ? 'opacity-100' : 'opacity-0'
				)}
			>
				{tipText}
			</span>
		</span>
	);
}
