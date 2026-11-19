import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from '../lib/i18n';
import { cn, DynamicIcon, getCsrfToken, sanitizeHref, sanitizeSameOriginUrl } from '../lib/utils';
import { Badge, Button, Input, Textarea } from '../ui';
import {
	formatMediaBytes,
	LanguageTabsBar,
	navigateTablistByKey,
	resolveIsoLangAttr,
	scrollTabIntoView,
} from './shared';
import {
	extractClipboardFiles,
	formatFocusPoint,
	hasDraggedOsFiles,
	parseFocusPoint,
	prepareImageFileForUpload,
	uploadMediaFileViaXhr,
	validateStudioIncomingFiles,
	type ActiveUploadTask,
	type FocusCoordinates,
	type MediaCustomFieldRenderer,
	type StudioMediaItem,
} from './mediaUtils';
import type {
	InputfieldLanguageItem,
	InputfieldMediaItem,
	ReactInputfieldProps,
} from './types';

export {
	extractClipboardFiles,
	formatFocusPoint,
	hasDraggedOsFiles,
	parseFocusPoint,
	prepareImageFileForUpload,
	uploadMediaFileViaXhr,
	validateStudioIncomingFiles,
	type ActiveUploadTask,
	type FocusCoordinates,
	type MediaCustomFieldRenderer,
	type StudioMediaItem,
};

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
	const csrf = getCsrfToken();
	const bodyPayload: Record<string, unknown> = {
		...payload,
		csrf,
	};
	if (csrf.name && csrf.value) {
		bodyPayload[csrf.name] = csrf.value;
	}

	const safeEndpoint = sanitizeSameOriginUrl(endpoint);
	if (!safeEndpoint) {
		return { ok: false, error: 'Invalid media endpoint.' };
	}

	try {
		const res = await fetch(safeEndpoint, {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				'X-Requested-With': 'XMLHttpRequest',
				...(csrf.value ? { 'X-CSRF-Token': csrf.value } : {}),
			},
			body: JSON.stringify(bodyPayload),
		});
		const json = await res.json().catch(() => ({}));
		if (res.ok && json?.ok) {
			return json;
		}
		return {
			ok: false,
			error: String(json?.error || `Media action failed (${res.status})`),
		};
	} catch {
		return { ok: false, error: 'Network error while communicating with media endpoint.' };
	}
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

export function TagsChipEditor({
	value,
	tagsList,
	predefinedOnly,
	disabled,
	onChange,
}: {
	value: string;
	tagsList?: string[];
	predefinedOnly?: boolean;
	disabled?: boolean;
	onChange: (nextTags: string) => void;
}): React.ReactElement {
	const { t } = useTranslations('core');
	const [draft, setDraft] = useState('');
	const chips = useMemo(() => parseTagsArray(value), [value]);
	const predefinedLookup = useMemo(() => {
		const map = new Map<string, string>();
		if (Array.isArray(tagsList)) {
			for (const tag of tagsList) {
				const clean = tag.trim();
				if (clean !== '') {
					map.set(clean.toLowerCase(), clean);
				}
			}
		}
		return map;
	}, [tagsList]);
	const lockToPredefined = Boolean(predefinedOnly && predefinedLookup.size > 0);

	const commitDraft = useCallback(
		(rawCandidate: string) => {
			const additions = parseTagsArray(rawCandidate);
			if (additions.length === 0) {
				setDraft('');
				return;
			}
			const existingLower = new Set(chips.map((c) => c.toLowerCase()));
			const next = [...chips];
			for (const candidate of additions) {
				const lower = candidate.toLowerCase();
				if (lockToPredefined && !predefinedLookup.has(lower)) {
					continue;
				}
				const canonical = predefinedLookup.get(lower) ?? candidate;
				if (!existingLower.has(lower)) {
					existingLower.add(lower);
					next.push(canonical);
				}
			}
			onChange(next.join(' '));
			setDraft('');
		},
		[chips, lockToPredefined, onChange, predefinedLookup]
	);

	const removeChip = (chip: string) => {
		const next = chips.filter((c) => c !== chip);
		onChange(next.join(' '));
	};

	const availableSuggestions = useMemo(() => {
		if (!tagsList || tagsList.length === 0) {
			return [];
		}
		const activeSet = new Set(chips.map((c) => c.toLowerCase()));
		return tagsList.filter((tag) => tag.trim() !== '' && !activeSet.has(tag.trim().toLowerCase()));
	}, [chips, tagsList]);

	return (
		<div className="space-y-2">
			<div
				className={cn(
					'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-input-surface px-2.5 py-1.5 transition-colors focus-within:ring-2 focus-within:ring-ring',
					disabled && 'opacity-60 pointer-events-none'
				)}
			>
				{chips.map((chip) => (
					<span
						key={chip}
						className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground"
					>
						<DynamicIcon name="tag" className="size-2.5 text-muted-foreground" />
						<span>{chip}</span>
						{!disabled ? (
							<button
								type="button"
								onClick={() => removeChip(chip)}
								aria-label={`${t('common.remove', 'Remove')} ${chip}`}
								className="ml-0.5 rounded-xs p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground cursor-pointer pointer-coarse:p-1"
							>
								<DynamicIcon name="x" className="size-2.5" />
							</button>
						) : null}
					</span>
				))}
				{!disabled && !lockToPredefined ? (
					<input
						type="text"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
								if (draft.trim() !== '') {
									e.preventDefault();
									commitDraft(draft);
								}
							} else if (e.key === 'Backspace' && draft === '' && chips.length > 0) {
								const lastChip = chips[chips.length - 1];
								if (lastChip !== undefined) {
									removeChip(lastChip);
								}
							}
						}}
						onBlur={() => {
							if (draft.trim() !== '') {
								commitDraft(draft);
							}
						}}
						aria-label={t('media.tagsLabel', 'Tags')}
						placeholder={chips.length === 0 ? t('media.tagsPlaceholder', 'Type a tag and press Enter...') : ''}
						className="min-w-[130px] flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
					/>
				) : chips.length === 0 ? (
					<span className="text-xs text-muted-foreground">
						{t('media.selectSuggestedTag', 'Select a tag below...')}
					</span>
				) : null}
			</div>

			{!disabled && availableSuggestions.length > 0 ? (
				<div className="flex flex-wrap items-center gap-1">
					<span className="mr-1 text-[10px] font-medium text-muted-foreground">
						{t('media.suggestedTags', 'Suggested tags')}:
					</span>
					{availableSuggestions.slice(0, 24).map((suggestion) => (
						<button
							key={suggestion}
							type="button"
							onClick={() => commitDraft(suggestion)}
							className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-muted/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/8 hover:text-foreground cursor-pointer pointer-coarse:min-h-7 pointer-coarse:px-2.5"
						>
							<DynamicIcon name="plus" className="size-2.5" />
							<span>{suggestion}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

export function MultiLangDescriptionEditor({
	item,
	isImage,
	descriptionRows,
	languages,
	activeLangId,
	onSelectLang,
	disabled,
	defaultStacked = false,
	compact = false,
	onUpdateDescription,
}: {
	item: StudioMediaItem;
	isImage: boolean;
	descriptionRows: number;
	languages?: InputfieldLanguageItem[];
	activeLangId: number;
	onSelectLang: (langId: number) => void;
	disabled: boolean;
	defaultStacked?: boolean;
	compact?: boolean;
	onUpdateDescription: (itemId: string, value: string, langId?: number) => void;
}): React.ReactElement {
	const { t } = useTranslations('core');
	const hasMultiLang = Boolean(languages && languages.length > 1);
	const [showAllStacked, setShowAllStacked] = useState<boolean>(
		Boolean(defaultStacked && hasMultiLang && languages && languages.length <= 5)
	);

	const activeLang = hasMultiLang && languages ? languages.find((l) => l.id === activeLangId) || languages[0] : null;
	const basePlaceholder = isImage
		? t('media.altPlaceholderImage', 'Describe this image for screen readers and SEO...')
		: t('media.altPlaceholderFile', 'Add file description...');

	const getLangVal = (lang: InputfieldLanguageItem): string => {
		const key = lang.isDefault ? 'default' : String(lang.id);
		return lang.isDefault
			? (item.descriptions?.[key] ?? item.description ?? '')
			: (item.descriptions?.[key] ?? '');
	};

	const descUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
	const renderSingleControl = (
		val: string,
		placeholder: string,
		ariaLabel: string,
		isControlDisabled: boolean,
		onChangeVal: (next: string) => void,
		langAttr?: string
	) => {
		if (descriptionRows > 1 && !compact) {
			return (
				<Textarea
					rows={Math.min(descriptionRows, 5)}
					lang={langAttr}
					value={val}
					disabled={isControlDisabled}
					placeholder={placeholder}
					aria-label={ariaLabel}
					onChange={(e) => onChangeVal(e.target.value)}
					className="min-h-16 text-xs"
				/>
			);
		}
		return (
			<Input
				type="text"
				lang={langAttr}
				value={val}
				disabled={isControlDisabled}
				placeholder={placeholder}
				aria-label={ariaLabel}
				onChange={(e) => onChangeVal(e.target.value)}
				className={cn('text-xs', compact ? 'h-7 px-2' : 'h-8')}
			/>
		);
	};

	if (!hasMultiLang || !languages || !activeLang) {
		const singleLangDisabled = disabled || languages?.[0]?.editable === false;
		return renderSingleControl(
			item.description || '',
			basePlaceholder,
			`${isImage ? t('media.altLabelImage', 'Alt text / description') : t('media.altLabelFile', 'Description')} ${item.basename}`,
			singleLangDisabled,
			(next) => onUpdateDescription(item.id, next),
			resolveIsoLangAttr(languages?.[0]?.name)
		);
	}

	const activePanelDomId = `rw-desc-panel-${descUid}-${activeLang.id}`;
	const langValuesMap = Object.fromEntries(languages.map((lang) => [lang.id, getLangVal(lang)]));

	return (
		<div className="space-y-1.5">
			<LanguageTabsBar
				languages={languages}
				activeLangId={activeLang.id}
				values={langValuesMap}
				onSelect={onSelectLang}
				ariaLabel={t('common.languages', 'Languages')}
				expandedAll={showAllStacked && !compact}
				onToggleExpandAll={!compact ? () => setShowAllStacked((prev) => !prev) : undefined}
			/>

			{showAllStacked && !compact ? (
				<div className="space-y-2 rounded-lg border border-border bg-muted/15 p-2.5">
					{languages.map((lang) => {
						const val = getLangVal(lang);
						const labelText = lang.title || lang.name;
						const langDisabled = disabled || lang.editable === false;
						return (
							<div key={lang.id} className="grid grid-cols-1 gap-1 sm:grid-cols-[110px_1fr] sm:items-start sm:gap-2.5">
								<div className="flex items-center gap-1.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
									<span
										aria-hidden="true"
										className={cn(
											'size-1.5 shrink-0 rounded-full',
											val.trim() !== '' ? 'bg-primary' : 'bg-muted-foreground/30'
										)}
									/>
									<span className="truncate" title={labelText}>
										{labelText}
									</span>
								</div>
								{renderSingleControl(
									val,
									`${basePlaceholder} (${labelText})`,
									`${labelText} — ${item.basename}`,
									langDisabled,
									(next) => onUpdateDescription(item.id, next, lang.id),
									resolveIsoLangAttr(lang.name)
								)}
							</div>
						);
					})}
				</div>
			) : (
				<div role="tabpanel" id={activePanelDomId} aria-label={activeLang.title || activeLang.name}>
					{renderSingleControl(
						getLangVal(activeLang),
						`${basePlaceholder} (${activeLang.title || activeLang.name})`,
						`${activeLang.title || activeLang.name} — ${item.basename}`,
						disabled || activeLang.editable === false,
						(next) => onUpdateDescription(item.id, next, activeLang.id),
						resolveIsoLangAttr(activeLang.name)
					)}
				</div>
			)}
		</div>
	);
}

export function MediaHiddenFormInputs({
	items,
	isImage,
	descriptionRows,
	useTags,
	languages,
}: {
	items: StudioMediaItem[];
	isImage: boolean;
	descriptionRows: number;
	useTags: boolean;
	languages?: InputfieldLanguageItem[];
}): React.ReactElement {
	const hasMultiLang = Boolean(languages && languages.length > 1);

	return (
		<>
			{items.map((item, idx) => {
				const customEntries = item.customValues ? Object.entries(item.customValues) : [];
				return (
					<React.Fragment key={`hidden_${item.id}`}>
						<input type="hidden" name={`sort_${item.id}`} value={String(idx)} />
						{item.markedForDelete ? (
							<input type="hidden" name={`delete_${item.id}`} value="1" />
						) : null}
						{isImage && item.focus ? (
							<input type="hidden" name={`focus_${item.id}`} value={item.focus} />
						) : null}
						{descriptionRows > 0 ? (
							hasMultiLang && languages ? (
								languages.map((lang) => {
									const hiddenName = lang.isDefault
										? `description_${item.id}`
										: `description${lang.id}_${item.id}`;
									const key = lang.isDefault ? 'default' : String(lang.id);
									const val = lang.isDefault
										? (item.descriptions?.[key] ?? item.description ?? '')
										: (item.descriptions?.[key] ?? '');
									return <input key={hiddenName} type="hidden" name={hiddenName} value={val} />;
								})
							) : (
								<input type="hidden" name={`description_${item.id}`} value={item.description || ''} />
							)
						) : null}
						{useTags ? <input type="hidden" name={`tags_${item.id}`} value={item.tags || ''} /> : null}
						{customEntries.map(([cfName, cfVal]) => {
							if (Array.isArray(cfVal)) {
								return cfVal.map((entryVal, entryIdx) => (
									<input
										key={`${cfName}_${entryIdx}`}
										type="hidden"
										name={`${cfName}[]`}
										value={String(entryVal ?? '')}
									/>
								));
							}
							if (cfVal !== null && typeof cfVal === 'object') {
								return Object.entries(cfVal as Record<string, unknown>).map(([subKey, subVal]) => {
									if (subVal !== null && typeof subVal === 'object') {
										return null;
									}
									const subInputName =
										subKey === 'default' ? cfName : `${cfName}__${subKey}`;
									return (
										<input
											key={`${cfName}_${subKey}`}
											type="hidden"
											name={subInputName}
											value={subVal === undefined || subVal === null ? '' : String(subVal)}
										/>
									);
								});
							}
							return (
								<input
									key={cfName}
									type="hidden"
									name={cfName}
									value={cfVal === undefined || cfVal === null ? '' : String(cfVal)}
								/>
							);
						})}
					</React.Fragment>
				);
			})}
		</>
	);
}

export interface CropSelectionRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type CropResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type CropDragMode = 'create' | 'move' | CropResizeHandle;

const MIN_CROP_SPAN_PCT = 4;

const CROP_HANDLES: ReadonlyArray<{
	key: CropResizeHandle;
	posStyle: React.CSSProperties;
	cursorClass: string;
}> = [
	{ key: 'nw', posStyle: { top: 0, left: 0, transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-nwse-resize' },
	{ key: 'n', posStyle: { top: 0, left: '50%', transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-ns-resize' },
	{ key: 'ne', posStyle: { top: 0, left: '100%', transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-nesw-resize' },
	{ key: 'e', posStyle: { top: '50%', left: '100%', transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-ew-resize' },
	{ key: 'se', posStyle: { top: '100%', left: '100%', transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-nwse-resize' },
	{ key: 's', posStyle: { top: '100%', left: '50%', transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-ns-resize' },
	{ key: 'sw', posStyle: { top: '100%', left: 0, transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-nesw-resize' },
	{ key: 'w', posStyle: { top: '50%', left: 0, transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-ew-resize' },
];

export function stripAdminCacheBuster(href: string): string {
	if (!href || !href.includes('nc=')) {
		return href;
	}
	const [beforeHash = '', hash = ''] = href.split('#', 2);
	const qIndex = beforeHash.indexOf('?');
	if (qIndex < 0) {
		return href;
	}
	const base = beforeHash.slice(0, qIndex);
	const params = beforeHash
		.slice(qIndex + 1)
		.split('&')
		.filter((part) => part !== '' && !part.startsWith('nc='));
	const rebuilt = params.length > 0 ? `${base}?${params.join('&')}` : base;
	return hash ? `${rebuilt}#${hash}` : rebuilt;
}

function clampPct(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function clampMovedCropRect(
	origin: CropSelectionRect,
	dxPct: number,
	dyPct: number
): CropSelectionRect {
	const w = clampPct(origin.w, 0, 100);
	const h = clampPct(origin.h, 0, 100);
	return {
		x: clampPct(origin.x + dxPct, 0, Math.max(0, 100 - w)),
		y: clampPct(origin.y + dyPct, 0, Math.max(0, 100 - h)),
		w,
		h,
	};
}

export function computePresetCropRect(
	cropAspect: number,
	stageAspect: number,
	existing?: CropSelectionRect | null
): CropSelectionRect {
	const safeStageAspect = stageAspect > 0 ? stageAspect : 1;
	const pctRatio = cropAspect / safeStageAspect;
	const centerX = existing && existing.w >= 2 ? existing.x + existing.w / 2 : 50;
	const centerY = existing && existing.h >= 2 ? existing.y + existing.h / 2 : 50;
	const targetSpan = existing && existing.w >= 10 && existing.h >= 10
		? clampPct(Math.max(existing.w, existing.h), 24, 92)
		: 82;

	let w = pctRatio >= 1 ? targetSpan : targetSpan * pctRatio;
	let h = pctRatio >= 1 ? targetSpan / pctRatio : targetSpan;

	if (w > 100) {
		w = 100;
		h = w / pctRatio;
	}
	if (h > 100) {
		h = 100;
		w = h * pctRatio;
	}

	const x = clampPct(centerX - w / 2, 0, Math.max(0, 100 - w));
	const y = clampPct(centerY - h / 2, 0, Math.max(0, 100 - h));
	return { x, y, w, h };
}

export function computeDraggedCropRect(params: {
	mode: CropDragMode;
	originRect: CropSelectionRect;
	startPct: { x: number; y: number };
	currentPct: { x: number; y: number };
	cropAspect: number | null;
	stageAspect: number;
}): CropSelectionRect {
	const { mode, originRect, startPct, currentPct, cropAspect, stageAspect } = params;
	const dx = currentPct.x - startPct.x;
	const dy = currentPct.y - startPct.y;
	const safeStageAspect = stageAspect > 0 ? stageAspect : 1;
	const pctRatio = cropAspect && cropAspect > 0 ? cropAspect / safeStageAspect : null;

	if (mode === 'move') {
		return clampMovedCropRect(originRect, dx, dy);
	}

	if (mode === 'create') {
		const anchorX = clampPct(startPct.x, 0, 100);
		const anchorY = clampPct(startPct.y, 0, 100);
		const curX = clampPct(currentPct.x, 0, 100);
		const curY = clampPct(currentPct.y, 0, 100);
		const dirX = curX >= anchorX ? 1 : -1;
		const dirY = curY >= anchorY ? 1 : -1;
		const maxW = dirX > 0 ? 100 - anchorX : anchorX;
		const maxH = dirY > 0 ? 100 - anchorY : anchorY;

		let w = Math.min(Math.abs(curX - anchorX), maxW);
		let h = Math.min(Math.abs(curY - anchorY), maxH);

		if (pctRatio !== null && pctRatio > 0) {
			if (w >= h * pctRatio) {
				h = w / pctRatio;
			} else {
				w = h * pctRatio;
			}
			if (w > maxW) {
				w = maxW;
				h = w / pctRatio;
			}
			if (h > maxH) {
				h = maxH;
				w = h * pctRatio;
			}
		}

		return {
			x: dirX > 0 ? anchorX : anchorX - w,
			y: dirY > 0 ? anchorY : anchorY - h,
			w,
			h,
		};
	}

	// Horizontal edge handles ('e' | 'w')
	if (mode === 'e' || mode === 'w') {
		const dirX = mode === 'e' ? 1 : -1;
		const anchorX = mode === 'e' ? originRect.x : originRect.x + originRect.w;
		const maxW = dirX > 0 ? 100 - anchorX : anchorX;
		const minW = Math.min(MIN_CROP_SPAN_PCT, maxW);
		let w = clampPct(originRect.w + dirX * dx, minW, maxW);

		if (pctRatio === null) {
			return {
				x: dirX > 0 ? anchorX : anchorX - w,
				y: originRect.y,
				w,
				h: originRect.h,
			};
		}

		const centerY = originRect.y + originRect.h / 2;
		let h = w / pctRatio;
		if (h < MIN_CROP_SPAN_PCT) {
			h = Math.min(100, MIN_CROP_SPAN_PCT);
			w = h * pctRatio;
		}
		if (w > maxW) {
			w = maxW;
			h = w / pctRatio;
		}
		if (h > 100) {
			h = 100;
			w = h * pctRatio;
		}
		return {
			x: dirX > 0 ? anchorX : anchorX - w,
			y: clampPct(centerY - h / 2, 0, Math.max(0, 100 - h)),
			w,
			h,
		};
	}

	// Vertical edge handles ('n' | 's')
	if (mode === 'n' || mode === 's') {
		const dirY = mode === 's' ? 1 : -1;
		const anchorY = mode === 's' ? originRect.y : originRect.y + originRect.h;
		const maxH = dirY > 0 ? 100 - anchorY : anchorY;
		const minH = Math.min(MIN_CROP_SPAN_PCT, maxH);
		let h = clampPct(originRect.h + dirY * dy, minH, maxH);

		if (pctRatio === null) {
			return {
				x: originRect.x,
				y: dirY > 0 ? anchorY : anchorY - h,
				w: originRect.w,
				h,
			};
		}

		const centerX = originRect.x + originRect.w / 2;
		let w = h * pctRatio;
		if (w < MIN_CROP_SPAN_PCT) {
			w = Math.min(100, MIN_CROP_SPAN_PCT);
			h = w / pctRatio;
		}
		if (h > maxH) {
			h = maxH;
			w = h * pctRatio;
		}
		if (w > 100) {
			w = 100;
			h = w / pctRatio;
		}
		return {
			x: clampPct(centerX - w / 2, 0, Math.max(0, 100 - w)),
			y: dirY > 0 ? anchorY : anchorY - h,
			w,
			h,
		};
	}

	// Corner handles ('nw' | 'ne' | 'se' | 'sw')
	const dirX = mode === 'ne' || mode === 'se' ? 1 : -1;
	const dirY = mode === 'sw' || mode === 'se' ? 1 : -1;
	const anchorX = dirX > 0 ? originRect.x : originRect.x + originRect.w;
	const anchorY = dirY > 0 ? originRect.y : originRect.y + originRect.h;
	const maxW = dirX > 0 ? 100 - anchorX : anchorX;
	const maxH = dirY > 0 ? 100 - anchorY : anchorY;
	const minW = Math.min(MIN_CROP_SPAN_PCT, maxW);
	const minH = Math.min(MIN_CROP_SPAN_PCT, maxH);

	let w = clampPct(originRect.w + dirX * dx, minW, maxW);
	let h = clampPct(originRect.h + dirY * dy, minH, maxH);

	if (pctRatio !== null && pctRatio > 0) {
		if (Math.abs(dx) >= Math.abs(dy) * pctRatio) {
			h = w / pctRatio;
		} else {
			w = h * pctRatio;
		}
		if (w < minW) {
			w = minW;
			h = w / pctRatio;
		}
		if (h < minH) {
			h = minH;
			w = h * pctRatio;
		}
		if (w > maxW) {
			w = maxW;
			h = w / pctRatio;
		}
		if (h > maxH) {
			h = maxH;
			w = h * pctRatio;
		}
	}

	return {
		x: dirX > 0 ? anchorX : anchorX - w,
		y: dirY > 0 ? anchorY : anchorY - h,
		w,
		h,
	};
}

interface CropPointerSession {
	mode: CropDragMode;
	pointerId: number;
	stageBounds: DOMRect;
	startPct: { x: number; y: number };
	originRect: CropSelectionRect;
}

type InspectorTabKey = 'details' | 'focus' | 'studio' | 'custom';

export function AssetInspectorSheet({
	open,
	item,
	itemIndex,
	totalItems,
	isImage,
	isLocked,
	descriptionRows,
	useTags,
	tagsList,
	tagsPredefinedOnly,
	noUpload,
	focusMode,
	useImageEditor,
	mediaEndpoint,
	mediaToken,
	clientOwnerId,
	clientInputName,
	languages,
	activeLangId,
	initialTab = 'details',
	onSelectLang,
	onOpenChange,
	onNavigateItem,
	onUpdateDescription,
	onUpdateTags,
	onUpdateFocus,
	onUpdateCustomValue,
	onTriggerReplace,
	onToggleDelete,
	onItemMutatedFromServer,
}: {
	open: boolean;
	item: StudioMediaItem | null;
	itemIndex: number;
	totalItems: number;
	isImage: boolean;
	isLocked: boolean;
	descriptionRows: number;
	useTags: boolean;
	tagsList?: string[];
	tagsPredefinedOnly?: boolean;
	noUpload?: boolean;
	focusMode?: string;
	useImageEditor?: boolean;
	mediaEndpoint?: string;
	mediaToken?: string;
	clientOwnerId?: string;
	clientInputName?: string;
	languages?: InputfieldLanguageItem[];
	activeLangId: number;
	initialTab?: InspectorTabKey;
	onSelectLang: (langId: number) => void;
	onOpenChange: (open: boolean) => void;
	onNavigateItem: (delta: -1 | 1) => void;
	onUpdateDescription: (itemId: string, value: string, langId?: number) => void;
	onUpdateTags: (itemId: string, tags: string) => void;
	onUpdateFocus: (itemId: string, coords: FocusCoordinates) => void;
	onUpdateCustomValue: (itemId: string, fieldName: string, value: unknown) => void;
	onTriggerReplace?: (item: StudioMediaItem) => void;
	onToggleDelete: (itemId: string) => void;
	onItemMutatedFromServer: (updated: InputfieldMediaItem) => void;
}): React.ReactElement | null {
	const { t } = useTranslations('core');
	const customFieldRendererFromCtx = useContext(MediaCustomFieldRendererContext);
	const customFieldRendererFromRt =
		typeof window !== 'undefined'
			? (
					window as unknown as {
						ReactWorkspaceRuntime?: {
							__getMediaCustomFieldRenderer?: () => MediaCustomFieldRenderer | null;
							ensureFieldsLoaded?: () => Promise<void>;
						};
					}
				).ReactWorkspaceRuntime?.__getMediaCustomFieldRenderer?.() ?? null
			: null;
	const customFieldRenderer = customFieldRendererFromCtx ?? customFieldRendererFromRt ?? registeredCustomFieldRenderer;
	const hasCustomFields = Boolean(item?.customFields && item.customFields.length > 0);
	const [, setCustomRendererTick] = useState(0);

	useEffect(() => {
		if (!open || !hasCustomFields || customFieldRendererFromCtx || customFieldRendererFromRt || registeredCustomFieldRenderer) {
			return;
		}
		const rt =
			typeof window !== 'undefined'
				? (
						window as unknown as {
							ReactWorkspaceRuntime?: {
								ensureFieldsLoaded?: () => Promise<void>;
							};
						}
					).ReactWorkspaceRuntime
				: undefined;
		void rt?.ensureFieldsLoaded?.().then(() => setCustomRendererTick((n) => n + 1));
	}, [open, hasCustomFields, customFieldRendererFromCtx, customFieldRendererFromRt]);
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const backdropPressOutsideRef = useRef<boolean>(false);
	const focusPadRef = useRef<HTMLDivElement | null>(null);
	const focusBoundsRef = useRef<DOMRect | null>(null);
	const cropStageRef = useRef<HTMLDivElement | null>(null);
	const cropMoveHandleRef = useRef<HTMLButtonElement | null>(null);
	const cropSessionRef = useRef<CropPointerSession | null>(null);

	const actionsTriggerRef = useRef<HTMLButtonElement | null>(null);
	const actionsPopoverRef = useRef<HTMLDivElement | null>(null);
	const actionsFocusGroupRef = useRef<HTMLDivElement | null>(null);
	const pointerPressedTriggerRef = useRef<boolean>(false);
	const enterMenuOnOpenRef = useRef<boolean>(false);
	const lastMenuClosedAtRef = useRef<number>(0);

	const baseUid = useId();
	const cleanUid = useMemo(() => baseUid.replace(/[^a-zA-Z0-9_-]/g, ''), [baseUid]);
	const titleId = `rw-insp-title-${cleanUid}`;
	const actionsTriggerId = `rw-insp-actions-btn-${cleanUid}`;
	const actionsMenuId = `rw-insp-actions-menu-${cleanUid}`;
	const zoomInputId = `rw-insp-zoom-${cleanUid}`;

	const [activeTab, setActiveTab] = useState<InspectorTabKey>(initialTab);
	const [copiedFeedback, setCopiedFeedback] = useState<string>('');
	const [isActionsMenuOpen, setIsActionsMenuOpen] = useState<boolean>(false);
	const [isTransforming, setIsTransforming] = useState<boolean>(false);
	const [isAnalyzingColors, setIsAnalyzingColors] = useState<boolean>(false);
	const [studioError, setStudioError] = useState<string>('');
	const [cropAspect, setCropAspect] = useState<number | null>(null);
	const [cropRect, setCropRect] = useState<CropSelectionRect | null>(null);
	const [activeCropDragMode, setActiveCropDragMode] = useState<CropDragMode | null>(null);
	const [cropStatusAnnouncement, setCropStatusAnnouncement] = useState<string>('');
	const [isDraggingFocus, setIsDraggingFocus] = useState<boolean>(false);

	const getEnabledActionItems = useCallback((): HTMLElement[] => {
		const group = actionsFocusGroupRef.current;
		if (!group) {
			return [];
		}
		return Array.from(group.querySelectorAll<HTMLElement>('button, a[href]')).filter(
			(el) =>
				el.closest('[focusgroup]') === group &&
				!(el as HTMLButtonElement).disabled &&
				el.getAttribute('aria-disabled') !== 'true'
		);
	}, []);

	const focusFirstActionItem = useCallback(() => {
		const firstItem = getEnabledActionItems()[0];
		if (firstItem) {
			firstItem.focus({ preventScroll: true });
		}
	}, [getEnabledActionItems]);

	const closeActionsMenu = useCallback(
		(opts: { fromPointer: boolean; restoreFocus?: boolean }) => {
			const pop = actionsPopoverRef.current;
			const trigger = actionsTriggerRef.current;
			lastMenuClosedAtRef.current = Date.now();
			if (opts.restoreFocus !== false && trigger) {
				trigger.focus({
					preventScroll: true,
					...(opts.fromPointer ? ({ focusVisible: false } as FocusOptions) : {}),
				});
			}
			if (pop) {
				try {
					if (pop.matches(':popover-open')) {
						pop.hidePopover();
					}
				} catch {
					pop.removeAttribute('open');
				}
			}
			setIsActionsMenuOpen(false);
		},
		[]
	);

	const positionFallbackActionsMenu = useCallback(() => {
		const pop = actionsPopoverRef.current;
		const trigger = actionsTriggerRef.current;
		if (!pop || !trigger || typeof window === 'undefined') {
			return;
		}
		if (typeof CSS !== 'undefined' && CSS.supports('position-area: block-end')) {
			if (typeof ToggleEvent !== 'undefined' && !('source' in ToggleEvent.prototype) && CSS.supports('anchor-name: --a')) {
				const anchorVar = `--${actionsMenuId}`;
				trigger.style.setProperty('anchor-name', anchorVar);
				pop.style.setProperty('position-anchor', anchorVar);
			}
			return;
		}
		const trigRect = trigger.getBoundingClientRect();
		const popRect = pop.getBoundingClientRect();
		const menuW = popRect.width || 190;
		const menuH = popRect.height || 140;
		const gap = 4;
		const pad = 8;

		let left = trigRect.right - menuW;
		left = Math.max(pad, Math.min(left, window.innerWidth - menuW - pad));

		let top = trigRect.bottom + gap;
		if (top + menuH > window.innerHeight - pad && trigRect.top - gap - menuH >= pad) {
			top = trigRect.top - gap - menuH;
		} else {
			top = Math.max(pad, Math.min(top, window.innerHeight - menuH - pad));
		}

		pop.style.left = `${Math.round(left)}px`;
		pop.style.top = `${Math.round(top)}px`;
	}, [actionsMenuId]);

	useEffect(() => {
		setActiveTab(initialTab);
		setCropRect(null);
		setActiveCropDragMode(null);
		cropSessionRef.current = null;
		setStudioError('');
		setIsActionsMenuOpen(false);
	}, [initialTab, item?.id, open]);

	useEffect(() => {
		if (!cropStatusAnnouncement) {
			return;
		}
		const timer = window.setTimeout(() => setCropStatusAnnouncement(''), 1200);
		return () => window.clearTimeout(timer);
	}, [cropStatusAnnouncement]);

	// Progressive enhancement for focusgroup + popover toggle lifecycle
	useEffect(() => {
		const pop = actionsPopoverRef.current;
		const group = actionsFocusGroupRef.current;
		const trigger = actionsTriggerRef.current;
		if (!pop || !group || !open) {
			return;
		}

		const hasNativeFocusGroup =
			typeof HTMLElement !== 'undefined' && 'focusGroup' in HTMLElement.prototype;

		if (!hasNativeFocusGroup) {
			group.setAttribute('role', 'menu');
			group.querySelectorAll('button:not([role]), a[href]:not([role])').forEach((el) => {
				el.setAttribute('role', 'menuitem');
			});
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				closeActionsMenu({ fromPointer: false, restoreFocus: true });
				return;
			}
			if (event.key === 'Tab') {
				closeActionsMenu({ fromPointer: false, restoreFocus: false });
				return;
			}
			const isHomeEnd = event.key === 'Home' || event.key === 'End';
			const isArrow = event.key === 'ArrowDown' || event.key === 'ArrowUp';
			if (!isHomeEnd && !(isArrow && !hasNativeFocusGroup)) {
				return;
			}
			const items = getEnabledActionItems();
			if (items.length === 0) {
				return;
			}
			const current = items.indexOf(document.activeElement as HTMLElement);
			const next =
				event.key === 'Home'
					? 0
					: event.key === 'End'
						? items.length - 1
						: current < 0
							? 0
							: (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
			event.preventDefault();
			event.stopImmediatePropagation();
			items[next]?.focus({ preventScroll: true });
		};

		const handleToggle = (rawEvent: Event) => {
			const nextOpen =
				(rawEvent as ToggleEvent).newState === 'open' ||
				(typeof pop.matches === 'function' && pop.matches(':popover-open'));
			setIsActionsMenuOpen(nextOpen);

			if (nextOpen) {
				positionFallbackActionsMenu();
				const shouldEnter = enterMenuOnOpenRef.current;
				enterMenuOnOpenRef.current = false;
				if (shouldEnter) {
					focusFirstActionItem();
				} else if (trigger) {
					trigger.focus({
						preventScroll: true,
						...({ focusVisible: false } as FocusOptions),
					});
				}
			} else {
				lastMenuClosedAtRef.current = Date.now();
				enterMenuOnOpenRef.current = false;
			}
		};

		group.addEventListener('keydown', handleKeyDown, true);
		pop.addEventListener('toggle', handleToggle);

		return () => {
			group.removeEventListener('keydown', handleKeyDown, true);
			pop.removeEventListener('toggle', handleToggle);
		};
	}, [
		closeActionsMenu,
		focusFirstActionItem,
		getEnabledActionItems,
		isLocked,
		item?.id,
		mediaEndpoint,
		mediaToken,
		onTriggerReplace,
		open,
		positionFallbackActionsMenu,
	]);

	// Close menu when focus moves outside the trigger + menu system
	useEffect(() => {
		if (!isActionsMenuOpen || typeof document === 'undefined') {
			return;
		}
		const handleFocusIn = (event: FocusEvent) => {
			const target = event.target as Node | null;
			if (!target) {
				return;
			}
			if (
				actionsPopoverRef.current?.contains(target) ||
				actionsTriggerRef.current?.contains(target)
			) {
				return;
			}
			closeActionsMenu({ fromPointer: false, restoreFocus: false });
		};
		document.addEventListener('focusin', handleFocusIn);
		return () => document.removeEventListener('focusin', handleFocusIn);
	}, [closeActionsMenu, isActionsMenuOpen]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) {
			return;
		}
		if (open) {
			if (!dialog.open) {
				try {
					dialog.showModal();
				} catch {
					dialog.setAttribute('open', '');
				}
			}
		} else if (dialog.open) {
			dialog.close();
		}
	}, [open]);

	if (!open || !item || typeof document === 'undefined') {
		return null;
	}

	const canUseFocus = isImage && focusMode !== 'off' && item.ext !== 'svg';
	const canUseStudio =
		Boolean(isImage && useImageEditor !== false && !isLocked && mediaEndpoint && mediaToken) &&
		item.ext !== 'svg';
	const canReplaceItem = Boolean(!isLocked && !noUpload && onTriggerReplace && mediaEndpoint && mediaToken);
	const focusCoords = parseFocusPoint(item.focus);
	const safeOriginalHref = sanitizeHref(item.url);
	const cleanCopyUrl = stripAdminCacheBuster(safeOriginalHref);
	const hasQuickActionMenu = Boolean(safeOriginalHref || canReplaceItem);
	const paletteColors = Array.from(
		new Set([
			...(item.dominantColor ? [item.dominantColor] : []),
			...(Array.isArray(item.palette) ? item.palette : []),
		])
	);

	const copyToClipboard = (text: string, notice: string) => {
		if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
			void navigator.clipboard.writeText(text);
			setCopiedFeedback(notice);
			window.setTimeout(() => setCopiedFeedback(''), 1800);
		}
	};

	const handleMenuItemPointerMove = (e: React.PointerEvent<HTMLElement>) => {
		if (typeof document !== 'undefined' && typeof document.elementFromPoint === 'function') {
			const hit = document.elementFromPoint(e.clientX, e.clientY);
			if (hit && !e.currentTarget.contains(hit)) {
				return;
			}
		}
		e.currentTarget.focus({
			preventScroll: true,
			...({ focusVisible: false } as FocusOptions),
		});
	};

	const updateFocusFromPointer = (clientX: number, clientY: number, cachedRect?: DOMRect | null) => {
		if (isLocked || !focusPadRef.current) {
			return;
		}
		const rect = cachedRect || focusBoundsRef.current || focusPadRef.current.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) {
			return;
		}
		const left = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
		const top = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
		onUpdateFocus(item.id, { top, left, zoom: focusCoords.zoom });
	};

	const resolveStageAspect = (): number => {
		const stageEl = cropStageRef.current;
		if (stageEl) {
			const rect = stageEl.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				return rect.width / rect.height;
			}
		}
		if (item.width && item.height && item.width > 0 && item.height > 0) {
			return item.width / item.height;
		}
		return 1;
	};

	const beginCropPointerSession = (
		e: React.PointerEvent<HTMLElement>,
		mode: CropDragMode
	) => {
		if (e.button !== 0 || isTransforming || !cropStageRef.current) {
			return;
		}
		const stageBounds = cropStageRef.current.getBoundingClientRect();
		if (stageBounds.width <= 0 || stageBounds.height <= 0) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();

		const startPct = {
			x: clampPct(((e.clientX - stageBounds.left) / stageBounds.width) * 100, 0, 100),
			y: clampPct(((e.clientY - stageBounds.top) / stageBounds.height) * 100, 0, 100),
		};

		const originRect: CropSelectionRect =
			mode === 'create' || !cropRect
				? { x: startPct.x, y: startPct.y, w: 0, h: 0 }
				: { ...cropRect };

		cropSessionRef.current = {
			mode,
			pointerId: e.pointerId,
			stageBounds,
			startPct,
			originRect,
		};
		setActiveCropDragMode(mode);

		cropStageRef.current.setPointerCapture?.(e.pointerId);
		if (mode === 'create') {
			setCropRect(originRect);
		}
	};

	const updateCropPointerSession = (e: React.PointerEvent<HTMLDivElement>) => {
		const session = cropSessionRef.current;
		if (!session || e.pointerId !== session.pointerId) {
			return;
		}
		const { stageBounds, mode, originRect, startPct } = session;
		if (stageBounds.width <= 0 || stageBounds.height <= 0) {
			return;
		}
		const currentPct = {
			x: ((e.clientX - stageBounds.left) / stageBounds.width) * 100,
			y: ((e.clientY - stageBounds.top) / stageBounds.height) * 100,
		};
		const stageAspect = stageBounds.width / stageBounds.height;
		const nextRect = computeDraggedCropRect({
			mode,
			originRect,
			startPct,
			currentPct,
			cropAspect,
			stageAspect,
		});
		setCropRect(nextRect);
	};

	const endCropPointerSession = () => {
		const prevSession = cropSessionRef.current;
		cropSessionRef.current = null;
		setActiveCropDragMode(null);
		if (prevSession && prevSession.mode !== 'create') {
			setCropStatusAnnouncement(t('media.cropMovedStatus', 'Crop selection updated'));
		}
	};

	const runServerTransform = async (operationPayload: Record<string, unknown>) => {
		if (!mediaEndpoint || !mediaToken) {
			return;
		}
		setIsTransforming(true);
		setStudioError('');
		const res = await postMediaJsonAction(mediaEndpoint, {
			action: 'transform',
			mediaToken,
			targetHash: item.hash,
			targetName: item.name,
			...(clientOwnerId ? { _clientOwnerId: clientOwnerId } : {}),
			...(clientInputName ? { _clientInputName: clientInputName } : {}),
			...operationPayload,
		});
		setIsTransforming(false);
		if (res.ok && res.item) {
			setCropRect(null);
			onItemMutatedFromServer(res.item);
		} else {
			setStudioError(res.error || t('media.uploadFailed', 'Transform failed.'));
		}
	};

	const handleApplyCrop = async () => {
		if (!cropRect || cropRect.w < 2 || cropRect.h < 2) {
			return;
		}
		const naturalW = item.width && item.width > 0 ? item.width : 1000;
		const naturalH = item.height && item.height > 0 ? item.height : 1000;
		const pxX = Math.max(0, Math.round((cropRect.x / 100) * naturalW));
		const pxY = Math.max(0, Math.round((cropRect.y / 100) * naturalH));
		const pxW = Math.max(1, Math.round((cropRect.w / 100) * naturalW));
		const pxH = Math.max(1, Math.round((cropRect.h / 100) * naturalH));
		await runServerTransform({
			operation: 'crop',
			x: pxX,
			y: pxY,
			width: pxW,
			height: pxH,
		});
	};

	const handleExtractColors = async () => {
		if (!mediaEndpoint || !mediaToken) {
			return;
		}
		setIsAnalyzingColors(true);
		const res = await postMediaJsonAction(mediaEndpoint, {
			action: 'inspect',
			mediaToken,
			targetHash: item.hash,
			targetName: item.name,
			...(clientOwnerId ? { _clientOwnerId: clientOwnerId } : {}),
			...(clientInputName ? { _clientInputName: clientInputName } : {}),
		});
		setIsAnalyzingColors(false);
		if (res.ok && res.item) {
			onItemMutatedFromServer(res.item);
		}
	};

	const availableTabs: Array<{ key: InspectorTabKey; label: string; icon: string }> = [
		{ key: 'details', label: t('media.tabDetails', 'Details'), icon: 'file-text' },
		...(canUseFocus ? [{ key: 'focus' as const, label: t('media.tabFocus', 'Focal Point'), icon: 'crosshair' }] : []),
		...(canUseStudio ? [{ key: 'studio' as const, label: t('media.tabStudio', 'Crop & Transform'), icon: 'crop' }] : []),
		...(hasCustomFields ? [{ key: 'custom' as const, label: t('media.tabCustom', 'Custom Fields'), icon: 'sliders' }] : []),
	];

	const resolvedTab = availableTabs.some((tb) => tb.key === activeTab) ? activeTab : 'details';
	const hasValidCropSelection = Boolean(cropRect && cropRect.w >= 2 && cropRect.h >= 2);
	const cropReadoutLabel =
		cropRect && cropRect.w >= 2 && cropRect.h >= 2
			? item.width && item.height
				? `${Math.max(1, Math.round((cropRect.w / 100) * item.width))} × ${Math.max(1, Math.round((cropRect.h / 100) * item.height))} px`
				: `${Math.round(cropRect.w)}% × ${Math.round(cropRect.h)}%`
			: '';

	return createPortal(
		<dialog
			ref={dialogRef}
			data-rw-inspector-sheet=""
			data-rw-portal-overlay=""
			aria-labelledby={titleId}
			onCancel={(e) => {
				if (isActionsMenuOpen || Date.now() - lastMenuClosedAtRef.current < 120) {
					e.preventDefault();
					if (isActionsMenuOpen) {
						closeActionsMenu({ fromPointer: false, restoreFocus: true });
					}
				}
			}}
			onClose={() => onOpenChange(false)}
			onPointerDown={(e) => {
				const dialog = dialogRef.current;
				if (!dialog || e.button !== 0) {
					backdropPressOutsideRef.current = false;
					return;
				}
				const rect = dialog.getBoundingClientRect();
				backdropPressOutsideRef.current =
					e.clientX < rect.left ||
					e.clientX > rect.right ||
					e.clientY < rect.top ||
					e.clientY > rect.bottom;
			}}
			onClick={(e) => {
				const wasPressedOutside = backdropPressOutsideRef.current;
				backdropPressOutsideRef.current = false;
				const dialog = dialogRef.current;
				if (!wasPressedOutside || !dialog) {
					return;
				}
				const rect = dialog.getBoundingClientRect();
				const releasedOutside =
					e.clientX < rect.left ||
					e.clientX > rect.right ||
					e.clientY < rect.top ||
					e.clientY > rect.bottom;
				if (releasedOutside) {
					onOpenChange(false);
				}
			}}
		>
			<div className="flex h-full flex-col">
				{/* Sticky Header */}
				<div className="flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-3.5">
					<div className="flex min-w-0 items-center gap-3">
						{isImage && (item.thumbUrl || item.url) ? (
							<div
								className="size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40"
								style={item.dominantColor ? { backgroundColor: item.dominantColor } : undefined}
							>
								<img
									src={item.thumbUrl || item.url}
									alt=""
									decoding="async"
									className="size-full object-cover"
									style={{ objectPosition: `${focusCoords.left}% ${focusCoords.top}%` }}
								/>
							</div>
						) : (
							<div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-[10px] font-bold uppercase text-muted-foreground">
								.{item.ext || 'file'}
							</div>
						)}
						<div className="min-w-0">
							<h2 id={titleId} className="truncate text-sm font-semibold text-foreground">
								{item.basename}
							</h2>
							<p className="truncate font-mono text-[11px] text-muted-foreground">
								{item.filesizeStr || formatMediaBytes(item.size)}
								{item.width && item.height ? ` · ${item.width}×${item.height}px` : ''}
								{totalItems > 1 ? ` · ${itemIndex + 1}/${totalItems}` : ''}
							</p>
						</div>
					</div>

					<div className="flex shrink-0 items-center gap-1">
						{totalItems > 1 ? (
							<>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-7"
									disabled={itemIndex <= 0}
									title={t('media.previousAsset', 'Previous item')}
									aria-label={t('media.previousAsset', 'Previous item')}
									onClick={() => onNavigateItem(-1)}
								>
									<DynamicIcon name="chevron-left" className="size-4" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-7"
									disabled={itemIndex >= totalItems - 1}
									title={t('media.nextAsset', 'Next item')}
									aria-label={t('media.nextAsset', 'Next item')}
									onClick={() => onNavigateItem(1)}
								>
									<DynamicIcon name="chevron-right" className="size-4" />
								</Button>
							</>
						) : null}
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-8"
							aria-label={t('common.close', 'Close')}
							onClick={() => onOpenChange(false)}
						>
							<DynamicIcon name="x" className="size-4" />
						</Button>
					</div>
				</div>

				{/* Tab Bar & Compact Vertical 3-Dot Overflow Actions Menu */}
				<div className="flex items-center justify-between gap-2 border-b border-border bg-muted/20 px-5 py-2">
					<div
						role="tablist"
						data-rw-tablist=""
						aria-label={t('media.inspectorSections', 'Inspector sections')}
						onKeyDown={(e) => navigateTablistByKey(e, 'horizontal')}
						className="flex min-w-0 items-center gap-1 overflow-x-auto"
					>
						{availableTabs.map((tb) => {
							const isSelected = tb.key === resolvedTab;
							return (
								<button
									key={tb.key}
									id={`rw-insp-tab-${cleanUid}-${tb.key}`}
									type="button"
									role="tab"
									aria-selected={isSelected}
									aria-controls={`rw-insp-panel-${cleanUid}-${tb.key}`}
									tabIndex={isSelected ? 0 : -1}
									onClick={(e) => {
										setActiveTab(tb.key);
										scrollTabIntoView(e.currentTarget);
									}}
									className={cn(
										'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-9',
										isSelected
											? 'bg-background text-foreground shadow-2xs border border-border/70'
											: 'text-muted-foreground hover:text-foreground'
									)}
								>
									<DynamicIcon name={tb.icon} className="size-3.5" aria-hidden="true" />
									<span>{tb.label}</span>
								</button>
							);
						})}
					</div>

					<div className="flex shrink-0 items-center gap-1.5">
						{copiedFeedback ? (
							<Badge variant="secondary" className="text-[10px]">
								{copiedFeedback}
							</Badge>
						) : null}

						{hasQuickActionMenu ? (
							<>
								<button
									ref={actionsTriggerRef}
									id={actionsTriggerId}
									type="button"
									aria-haspopup="menu"
									aria-expanded={isActionsMenuOpen}
									aria-label={t('media.moreActions', 'More actions')}
									title={t('media.moreActions', 'More actions')}
									{...({
										commandfor: actionsMenuId,
										command: 'toggle-popover',
									} as Record<string, string>)}
									onPointerDown={(e) => {
										if (e.button === 0) {
											e.preventDefault();
											pointerPressedTriggerRef.current = true;
										}
									}}
									onKeyDown={(e) => {
										if (e.key === 'ArrowDown') {
											e.preventDefault();
											enterMenuOnOpenRef.current = true;
											pointerPressedTriggerRef.current = false;
											if (!isActionsMenuOpen) {
												e.currentTarget.click();
											} else {
												focusFirstActionItem();
											}
										} else if (e.key === 'Enter' || e.key === ' ') {
											enterMenuOnOpenRef.current = true;
											pointerPressedTriggerRef.current = false;
										}
									}}
									onClick={(e) => {
										const isPointer = pointerPressedTriggerRef.current && e.detail !== 0;
										pointerPressedTriggerRef.current = false;
										if (!isPointer) {
											enterMenuOnOpenRef.current = true;
										}
										if (
											typeof HTMLButtonElement !== 'undefined' &&
											!('commandForElement' in HTMLButtonElement.prototype)
										) {
											e.preventDefault();
											const pop = actionsPopoverRef.current;
											if (!pop) {
												return;
											}
											if (isActionsMenuOpen) {
												closeActionsMenu({ fromPointer: isPointer, restoreFocus: true });
											} else {
												try {
													(
														pop as HTMLElement & {
															showPopover: (options?: { source?: Element }) => void;
														}
													).showPopover({ source: e.currentTarget });
												} catch {
													try {
														pop.showPopover();
													} catch {
														pop.setAttribute('open', '');
														setIsActionsMenuOpen(true);
													}
												}
											}
										}
									}}
									className={cn(
										'inline-flex size-7 items-center justify-center rounded-md border border-input bg-input-surface text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
										isActionsMenuOpen && 'border-border bg-accent text-foreground'
									)}
								>
									<DynamicIcon name="more-vertical" className="size-3.5" aria-hidden="true" />
								</button>
								<div
									id={actionsMenuId}
									ref={actionsPopoverRef}
									popover="auto"
									data-rw-popover-menu=""
								>
									<div
										ref={actionsFocusGroupRef}
										{...({ focusgroup: 'menu nomemory' } as Record<string, string>)}
										aria-labelledby={actionsTriggerId}
									>
										{cleanCopyUrl ? (
											<button
												type="button"
												onPointerMove={handleMenuItemPointerMove}
												onClick={(e) => {
													const fromPointer = e.detail !== 0;
													copyToClipboard(
														cleanCopyUrl,
														t('media.copiedUrl', 'URL copied')
													);
													closeActionsMenu({ fromPointer, restoreFocus: true });
												}}
											>
												<DynamicIcon name="copy" className="size-3.5 text-muted-foreground" aria-hidden="true" />
												<span>{t('media.copyUrl', 'Copy URL')}</span>
											</button>
										) : null}
										{safeOriginalHref ? (
											<a
												href={safeOriginalHref}
												target="_blank"
												rel="noopener noreferrer"
												onPointerMove={handleMenuItemPointerMove}
												onClick={(e) => {
													closeActionsMenu({
														fromPointer: e.detail !== 0,
														restoreFocus: true,
													});
												}}
											>
												<DynamicIcon name="external-link" className="size-3.5 text-muted-foreground" aria-hidden="true" />
												<span>{t('media.openOriginal', 'Open original')}</span>
											</a>
										) : null}
										{safeOriginalHref ? (
											<a
												href={safeOriginalHref}
												download={item.basename || true}
												onPointerMove={handleMenuItemPointerMove}
												onClick={(e) => {
													closeActionsMenu({
														fromPointer: e.detail !== 0,
														restoreFocus: true,
													});
												}}
											>
												<DynamicIcon name="download" className="size-3.5 text-muted-foreground" aria-hidden="true" />
												<span>{t('media.downloadOriginal', 'Download')}</span>
											</a>
										) : null}
										{safeOriginalHref && canReplaceItem ? <hr /> : null}
										{canReplaceItem && onTriggerReplace ? (
											<button
												type="button"
												onPointerMove={handleMenuItemPointerMove}
												onClick={(e) => {
													const fromPointer = e.detail !== 0;
													closeActionsMenu({ fromPointer, restoreFocus: true });
													onTriggerReplace(item);
												}}
											>
												<DynamicIcon name="refresh-cw" className="size-3.5 text-muted-foreground" aria-hidden="true" />
												<span>{t('media.replace', 'Replace')}</span>
											</button>
										) : null}
									</div>
								</div>
							</>
						) : null}
					</div>
				</div>

				{/* Scrollable Inspector Content */}
				<div
					role="tabpanel"
					id={`rw-insp-panel-${cleanUid}-${resolvedTab}`}
					aria-labelledby={`rw-insp-tab-${cleanUid}-${resolvedTab}`}
					className="flex-1 space-y-5 overflow-y-auto p-5"
				>
					{resolvedTab === 'details' ? (
						<div className="space-y-5">
							{isImage && (item.url || item.thumbUrl) ? (
								<div
									className="relative flex max-h-64 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30 p-2"
									style={
										item.lqip
											? {
													backgroundImage: `url(${item.lqip})`,
													backgroundSize: 'cover',
													backgroundPosition: 'center',
												}
											: item.dominantColor
												? { backgroundColor: `${item.dominantColor}22` }
												: undefined
									}
								>
									<img
										src={item.url || item.thumbUrl}
										alt={item.description || item.basename}
										decoding="async"
										className="max-h-60 w-auto rounded-lg object-contain shadow-xs"
									/>
								</div>
							) : null}

							{descriptionRows > 0 ? (
								<div className="space-y-2">
									<div className="flex items-center justify-between text-xs font-semibold text-foreground">
										<span>
											{isImage
												? t('media.altLabelImage', 'Alt text / description')
												: t('media.altLabelFile', 'Description')}
										</span>
										{isImage && !(item.description || '').trim() ? (
											<Badge variant="warning" className="text-[10px]">
												{t('media.missingAlt', 'Missing alt')}
											</Badge>
										) : null}
									</div>
									<MultiLangDescriptionEditor
										item={item}
										isImage={isImage}
										descriptionRows={Math.max(descriptionRows, 2)}
										languages={languages}
										activeLangId={activeLangId}
										onSelectLang={onSelectLang}
										disabled={isLocked}
										defaultStacked={Boolean(languages && languages.length > 1 && languages.length <= 6)}
										onUpdateDescription={onUpdateDescription}
									/>
								</div>
							) : null}

							{useTags ? (
								<div className="space-y-2">
									<div className="block text-xs font-semibold text-foreground">
										{t('media.tagsLabel', 'Tags')}
									</div>
									<TagsChipEditor
										value={item.tags || ''}
										tagsList={tagsList}
										predefinedOnly={tagsPredefinedOnly}
										disabled={isLocked}
										onChange={(nextTags) => onUpdateTags(item.id, nextTags)}
									/>
								</div>
							) : null}

							{/* Technical Metadata & InterventionImage Color Swatches */}
							<div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3.5">
								<div className="grid grid-cols-3 gap-3 text-xs">
									<div>
										<span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
											{t('media.extension', 'Format')}
										</span>
										<span className="font-mono font-semibold uppercase text-foreground">
											.{item.ext || 'file'}
										</span>
									</div>
									<div>
										<span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
											{t('media.fileSize', 'File size')}
										</span>
										<span className="font-mono font-semibold text-foreground">
											{item.filesizeStr || formatMediaBytes(item.size)}
										</span>
									</div>
									{item.width && item.height ? (
										<div>
											<span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
												{t('media.dimensions', 'Dimensions')}
											</span>
											<span className="font-mono font-semibold text-foreground">
												{item.width} × {item.height}
											</span>
										</div>
									) : null}
								</div>

								{isImage && item.ext !== 'svg' ? (
									<div className="border-t border-border/70 pt-3 space-y-2">
										<div className="flex items-center justify-between gap-2">
											<span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
												<DynamicIcon name="palette" className="size-3.5" />
												<span>{t('media.colorPalette', 'Extracted palette')}</span>
											</span>
											{paletteColors.length === 0 && mediaEndpoint && mediaToken ? (
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="h-6 px-2 text-[10px]"
													disabled={isAnalyzingColors}
													onClick={() => void handleExtractColors()}
												>
													<DynamicIcon
														name="sparkles"
														className={cn('size-3', isAnalyzingColors && 'motion-safe:animate-spin')}
													/>
													<span>
														{isAnalyzingColors
															? t('common.loading', 'Loading...')
															: t('media.analyzeColors', 'Extract colors')}
													</span>
												</Button>
											) : null}
										</div>

										{paletteColors.length > 0 ? (
											<div className="flex flex-wrap items-center gap-1.5">
												{paletteColors.map((hex) => (
													<button
														key={hex}
														type="button"
														onClick={() =>
															copyToClipboard(
																hex,
																t('media.copiedColor', { hex }, `Copied ${hex}`)
															)
														}
														title={hex}
														className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-mono text-foreground shadow-2xs transition-transform motion-reduce:transition-none hover:scale-[1.03] motion-reduce:hover:scale-100 cursor-pointer"
													>
														<span
															className="size-3.5 rounded-xs border border-black/15"
															style={{ backgroundColor: hex }}
														/>
														<span>{hex}</span>
													</button>
												))}
											</div>
										) : null}
									</div>
								) : null}
							</div>
						</div>
					) : null}

					{resolvedTab === 'focus' && canUseFocus ? (
						<div className="space-y-5">
							<p className="text-xs text-muted-foreground">
								{t('media.focusHint', 'Click anywhere on the image to set the focal point used by smart crops.')}
							</p>

							<div className="flex justify-center rounded-xl border border-border bg-muted/30 p-3">
								<div
									ref={focusPadRef}
									role="application"
									tabIndex={isLocked ? -1 : 0}
									aria-label={t('media.focusPoint', 'Focal point')}
									onPointerDown={(e) => {
										if (isLocked || e.button !== 0 || !focusPadRef.current) return;
										const cached = focusPadRef.current.getBoundingClientRect();
										focusBoundsRef.current = cached;
										e.currentTarget.setPointerCapture?.(e.pointerId);
										setIsDraggingFocus(true);
										updateFocusFromPointer(e.clientX, e.clientY, cached);
									}}
									onPointerMove={(e) => {
										if (!isDraggingFocus) return;
										updateFocusFromPointer(e.clientX, e.clientY, focusBoundsRef.current);
									}}
									onPointerUp={() => {
										setIsDraggingFocus(false);
										focusBoundsRef.current = null;
									}}
									onPointerCancel={() => {
										setIsDraggingFocus(false);
										focusBoundsRef.current = null;
									}}
									onLostPointerCapture={() => {
										setIsDraggingFocus(false);
										focusBoundsRef.current = null;
									}}
									onKeyDown={(e) => {
										if (isLocked) return;
										const step = e.shiftKey ? 5 : 1;
										let nextLeft = focusCoords.left;
										let nextTop = focusCoords.top;
										if (e.key === 'ArrowLeft') nextLeft = clampPct(nextLeft - step, 0, 100);
										else if (e.key === 'ArrowRight') nextLeft = clampPct(nextLeft + step, 0, 100);
										else if (e.key === 'ArrowUp') nextTop = clampPct(nextTop - step, 0, 100);
										else if (e.key === 'ArrowDown') nextTop = clampPct(nextTop + step, 0, 100);
										else return;
										e.preventDefault();
										onUpdateFocus(item.id, {
											top: nextTop,
											left: nextLeft,
											zoom: focusCoords.zoom,
										});
									}}
									className={cn(
										'relative inline-block max-w-full overflow-hidden rounded-lg border border-border select-none touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
										!isLocked && 'cursor-crosshair'
									)}
								>
									<img
										src={item.url || item.thumbUrl}
										alt={item.description || item.basename}
										decoding="async"
										draggable={false}
										className="block max-h-80 w-auto object-contain pointer-events-none"
									/>
									{/* Rule-of-thirds subtle grid */}
									<div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
										{Array.from({ length: 9 }).map((_, idx) => (
											<div key={idx} className="border border-white/15" />
										))}
									</div>
									{/* Crosshair target */}
									<span
										aria-hidden="true"
										style={{
											top: `${focusCoords.top}%`,
											left: `${focusCoords.left}%`,
										}}
										className={cn(
											'pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary/75 shadow-[0_0_0_2px_rgba(0,0,0,0.55)]',
											!isDraggingFocus && 'transition-[top,left] duration-75 motion-reduce:transition-none'
										)}
									/>
								</div>
							</div>

							<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
								<span aria-live="polite" className="font-mono text-xs tabular-nums text-foreground">
									{t(
										'media.focusPosition',
										{ top: Math.round(focusCoords.top), left: Math.round(focusCoords.left) },
										`Top ${Math.round(focusCoords.top)}% · Left ${Math.round(focusCoords.left)}%`
									)}
								</span>

								{focusMode === 'zoom' ? (
									<div className="flex items-center gap-2.5">
										<label htmlFor={zoomInputId} className="text-xs font-medium text-muted-foreground">
											{t('media.zoomLabel', 'Zoom')}
										</label>
										<input
											id={zoomInputId}
											type="range"
											data-rw-slider=""
											min={0}
											max={50}
											step={1}
											disabled={isLocked}
											value={focusCoords.zoom}
											onChange={(e) =>
												onUpdateFocus(item.id, {
													...focusCoords,
													zoom: Number(e.target.value) || 0,
												})
											}
											className="w-28"
										/>
										<span className="w-9 text-right font-mono text-xs tabular-nums text-foreground">
											{focusCoords.zoom}%
										</span>
									</div>
								) : null}

								{!isLocked ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-7 px-2.5 text-xs"
										onClick={() => onUpdateFocus(item.id, { top: 50, left: 50, zoom: 0 })}
									>
										<DynamicIcon name="rotate-ccw" className="size-3" />
										<span>{t('media.resetFocus', 'Center focus')}</span>
									</Button>
								) : null}
							</div>

							{/* Live Smart-Crop Aspect Ratio Previews */}
							<div className="space-y-2">
								<h3 className="text-xs font-semibold text-foreground">
									{t('media.cropPreviews', 'Smart crop previews')}
								</h3>
								<div className="grid grid-cols-3 gap-3">
									{[
										{ label: '16:9', aspectClass: 'aspect-video' },
										{ label: '1:1', aspectClass: 'aspect-square' },
										{ label: '4:5', aspectClass: 'aspect-[4/5]' },
									].map((preset) => (
										<div key={preset.label} className="space-y-1">
											<div
												className={cn(
													'w-full overflow-hidden rounded-lg border border-border bg-muted/40',
													preset.aspectClass
												)}
											>
												<img
													src={item.thumbUrl || item.url}
													alt=""
													decoding="async"
													className="size-full object-cover transition-transform duration-150 motion-reduce:transition-none"
													style={{
														objectPosition: `${focusCoords.left}% ${focusCoords.top}%`,
														transform:
															focusCoords.zoom > 0
																? `scale(${(1 + focusCoords.zoom / 100).toFixed(2)})`
																: undefined,
														transformOrigin: `${focusCoords.left}% ${focusCoords.top}%`,
													}}
												/>
											</div>
											<span className="block text-center font-mono text-[10px] text-muted-foreground">
												{preset.label}
											</span>
										</div>
									))}
								</div>
							</div>
						</div>
					) : null}

					{resolvedTab === 'studio' && canUseStudio ? (
						<div className="space-y-4">
							<p className="text-xs text-muted-foreground">
								{t(
									'media.studioHint',
									'Drag on the image to select a crop area, drag inside to reposition, or resize from any edge or corner.'
								)}
							</p>

							<div className="sr-only" aria-live="polite">
								{cropStatusAnnouncement}
							</div>

							{studioError ? (
								<div
									role="alert"
									className="rounded-md border border-destructive/40 bg-destructive/8 px-3 py-2 text-xs text-destructive"
								>
									{studioError}
								</div>
							) : null}

							{/* Rotate & Flip Toolbar */}
							<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2">
								<div className="flex flex-wrap items-center gap-1">
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={isTransforming}
										className="h-7 px-2 text-xs"
										aria-label={t('media.rotateLeft', 'Rotate -90°')}
										title={t('media.rotateLeft', 'Rotate -90°')}
										onClick={() => void runServerTransform({ operation: 'rotate', degrees: -90 })}
									>
										<DynamicIcon name="rotate-ccw" className="size-3.5" aria-hidden="true" />
										<span>-90°</span>
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={isTransforming}
										className="h-7 px-2 text-xs"
										aria-label={t('media.rotateRight', 'Rotate +90°')}
										title={t('media.rotateRight', 'Rotate +90°')}
										onClick={() => void runServerTransform({ operation: 'rotate', degrees: 90 })}
									>
										<DynamicIcon name="rotate-cw" className="size-3.5" aria-hidden="true" />
										<span>+90°</span>
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={isTransforming}
										className="h-7 px-2 text-xs"
										aria-label={t('media.flipHorizontal', 'Flip horizontal')}
										title={t('media.flipHorizontal', 'Flip horizontal')}
										onClick={() => void runServerTransform({ operation: 'flip_h' })}
									>
										<DynamicIcon name="flip-horizontal" className="size-3.5" />
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={isTransforming}
										className="h-7 px-2 text-xs"
										aria-label={t('media.flipVertical', 'Flip vertical')}
										title={t('media.flipVertical', 'Flip vertical')}
										onClick={() => void runServerTransform({ operation: 'flip_v' })}
									>
										<DynamicIcon name="flip-vertical" className="size-3.5" />
									</Button>
									{!hasValidCropSelection ? (
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={isTransforming}
											className="h-7 px-2 text-xs"
											onClick={() => {
												const initialRect =
													cropAspect !== null
														? computePresetCropRect(cropAspect, resolveStageAspect(), null)
														: { x: 10, y: 10, w: 80, h: 80 };
												setCropRect(initialRect);
												if (typeof window !== 'undefined') {
													window.requestAnimationFrame(() => {
														cropMoveHandleRef.current?.focus({ preventScroll: true });
													});
												}
											}}
										>
											<DynamicIcon name="crop" className="size-3.5" />
											<span>{t('media.initCropSelection', 'Select crop area')}</span>
										</Button>
									) : null}
								</div>

								{/* Aspect Ratio Presets */}
								<div className="flex flex-wrap items-center gap-1">
									{[
										{ label: t('media.cropRatioFree', 'Free'), ratio: null },
										...(item.width && item.height
											? [{ label: t('media.cropRatioOriginal', 'Original'), ratio: item.width / item.height }]
											: []),
										{ label: '16:9', ratio: 16 / 9 },
										{ label: '4:3', ratio: 4 / 3 },
										{ label: '1:1', ratio: 1 },
										{ label: '4:5', ratio: 4 / 5 },
									].map((preset) => {
										const isActive =
											preset.ratio === null
												? cropAspect === null
												: cropAspect !== null && Math.abs(cropAspect - preset.ratio) < 0.01;
										return (
											<button
												key={preset.label}
												type="button"
												aria-pressed={isActive}
												disabled={isTransforming}
												onClick={() => {
													setCropAspect(preset.ratio);
													if (preset.ratio !== null) {
														setCropRect((prev) =>
															computePresetCropRect(preset.ratio, resolveStageAspect(), prev)
														);
													}
												}}
												className={cn(
													'rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer',
													isActive
														? 'bg-primary text-primary-foreground'
														: 'bg-background border border-border text-muted-foreground hover:text-foreground'
												)}
											>
												{preset.label}
											</button>
										);
									})}
								</div>
							</div>

							{/* Interactive Crop Stage (Create + Drag-to-Move + 8-Handle Resize) */}
							<div className="flex justify-center rounded-xl border border-border bg-muted/30 p-4">
								<div
									ref={cropStageRef}
									data-rw-crop-stage=""
									onPointerDown={(e) => beginCropPointerSession(e, 'create')}
									onPointerMove={updateCropPointerSession}
									onPointerUp={endCropPointerSession}
									onPointerCancel={endCropPointerSession}
									onLostPointerCapture={endCropPointerSession}
									className="relative inline-block max-w-full cursor-crosshair"
								>
									{/* Clipped image & dark cutout mask */}
									<div className="pointer-events-none relative overflow-hidden rounded-lg border border-border">
										<img
											src={item.url || item.thumbUrl}
											alt={item.basename}
											decoding="async"
											draggable={false}
											className={cn(
												'block max-h-80 w-auto object-contain transition-opacity',
												isTransforming && 'opacity-50'
											)}
										/>
										{hasValidCropSelection && cropRect ? (
											<div
												aria-hidden="true"
												style={{
													left: `${cropRect.x}%`,
													top: `${cropRect.y}%`,
													width: `${cropRect.w}%`,
													height: `${cropRect.h}%`,
												}}
												className="absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.52)]"
											/>
										) : null}
									</div>

									{/* Unclipped interactive selection frame + move handle + 8 resize handles */}
									{hasValidCropSelection && cropRect ? (
										<div
											style={{
												left: `${cropRect.x}%`,
												top: `${cropRect.y}%`,
												width: `${cropRect.w}%`,
												height: `${cropRect.h}%`,
											}}
											className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
										>
											{/* Focusable Move Surface (Pointer Drag + Keyboard Arrow Nudging) */}
											<button
												ref={cropMoveHandleRef}
												type="button"
												data-rw-crop-move=""
												data-dragging={activeCropDragMode === 'move' ? 'true' : undefined}
												aria-label={t(
													'media.cropMoveHandle',
													'Crop selection handle. Drag or use arrow keys to move, or Ctrl+Arrow to resize.'
												)}
												onPointerDown={(e) => beginCropPointerSession(e, 'move')}
												onKeyDown={(e) => {
													if (isTransforming) return;
													if (e.key === 'Escape') {
														e.preventDefault();
														e.stopPropagation();
														setCropRect(null);
														return;
													}
													const isResize = e.ctrlKey || e.metaKey || (e.altKey && e.shiftKey);
													const step = e.shiftKey && !e.altKey ? 5 : e.altKey && !e.shiftKey ? 0.25 : 1;
													let dx = 0;
													let dy = 0;
													if (e.key === 'ArrowLeft') dx = -step;
													else if (e.key === 'ArrowRight') dx = step;
													else if (e.key === 'ArrowUp') dy = -step;
													else if (e.key === 'ArrowDown') dy = step;
													else return;

													e.preventDefault();
													e.stopPropagation();
													if (isResize) {
														const stageAspect = resolveStageAspect();
														setCropRect((prev) =>
															prev
																? computeDraggedCropRect({
																		mode: dx !== 0 && dy === 0 ? 'e' : dy !== 0 && dx === 0 ? 's' : 'se',
																		originRect: prev,
																		startPct: { x: prev.x + prev.w, y: prev.y + prev.h },
																		currentPct: { x: prev.x + prev.w + dx, y: prev.y + prev.h + dy },
																		cropAspect,
																		stageAspect,
																	})
																: prev
														);
													} else {
														setCropRect((prev) =>
															prev ? clampMovedCropRect(prev, dx, dy) : prev
														);
													}
													setCropStatusAnnouncement(
														t('media.cropMovedStatus', 'Crop selection updated')
													);
												}}
												className="absolute inset-0 block size-full bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
											>
												{/* Rule-of-thirds composition guides */}
												<span
													aria-hidden="true"
													className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3"
												>
													{Array.from({ length: 9 }).map((_, idx) => (
														<span key={idx} className="border border-white/25" />
													))}
												</span>
											</button>

											{/* Live pixel dimensions badge */}
											{cropRect.w >= 14 && cropRect.h >= 12 ? (
												<span
													aria-hidden="true"
													className="pointer-events-none absolute top-1.5 left-1.5 rounded-xs bg-black/70 px-1.5 py-0.5 font-mono text-[10px] leading-tight text-white backdrop-blur-[2px]"
												>
													{cropReadoutLabel}
												</span>
											) : null}

											{/* 8 Directional Resize Handles (4 corners + 4 mid-edges) */}
											{CROP_HANDLES.map((h) => (
												<span
													key={h.key}
													aria-hidden="true"
													data-rw-crop-handle={h.key}
													style={h.posStyle}
													onPointerDown={(e) => beginCropPointerSession(e, h.key)}
													className={cn(
														'absolute z-10 flex size-5 items-center justify-center',
														h.cursorClass
													)}
												>
													<span className="size-2.5 rounded-[2px] border border-black/55 bg-white shadow-xs" />
												</span>
											))}
										</div>
									) : null}
								</div>
							</div>

							{isTransforming ? (
								<div className="space-y-1.5">
									<progress
										data-rw-progress=""
										aria-label={t('media.transforming', 'Applying image transform...')}
									/>
									<p className="text-center text-xs text-muted-foreground">
										{t('media.transforming', 'Applying image transform...')}
									</p>
								</div>
							) : null}

							{hasValidCropSelection ? (
								<div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
									<span className="font-mono text-xs tabular-nums text-foreground">
										{cropReadoutLabel}
									</span>
									<div className="flex items-center gap-2">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={isTransforming}
											onClick={() => setCropRect(null)}
										>
											{t('media.clearSelection', 'Clear selection')}
										</Button>
										<Button
											type="button"
											size="sm"
											disabled={isTransforming}
											onClick={() => void handleApplyCrop()}
										>
											<DynamicIcon name="crop" className="size-3.5" />
											<span>{t('media.applyCrop', 'Apply crop')}</span>
										</Button>
									</div>
								</div>
							) : null}
						</div>
					) : null}

					{resolvedTab === 'custom' && hasCustomFields && item.customFields ? (
						<div className="space-y-4">
							{item.customFields.map((cf) => {
								const cfVal = item.customValues?.[cf.name];
								if (customFieldRenderer) {
									return (
										<div key={cf.name}>
											{customFieldRenderer({
												field: cf,
												value: cfVal,
												values: item.customValues || {},
												disabled: isLocked,
												onChange: (targetName, nextVal) =>
													onUpdateCustomValue(item.id, targetName, nextVal),
											})}
										</div>
									);
								}
								const customInputId = `rw-media-cf-${item.id}-${cf.name}`;
								return (
									<div key={cf.name} className="space-y-1.5">
										{cf.label ? (
											<label htmlFor={customInputId} className="block text-xs font-semibold text-foreground">
												{cf.label}
											</label>
										) : null}
										<Input
											id={customInputId}
											aria-label={cf.label ? undefined : cf.name}
											type="text"
											value={String(cfVal ?? '')}
											disabled={isLocked}
											onChange={(e) => onUpdateCustomValue(item.id, cf.name, e.target.value)}
											className="h-8 text-xs"
										/>
									</div>
								);
							})}
						</div>
					) : null}
				</div>

				{/* Footer Bar */}
				<div className="flex items-center justify-between gap-2 border-t border-border bg-card px-5 py-3">
					{!isLocked ? (
						<Button
							type="button"
							variant={item.markedForDelete ? 'outline' : 'ghost'}
							size="sm"
							className={cn(
								'text-xs',
								!item.markedForDelete && 'text-destructive hover:bg-destructive/10 hover:text-destructive'
							)}
							onClick={() => {
								onToggleDelete(item.id);
								if (!item.markedForDelete) {
									onOpenChange(false);
								}
							}}
						>
							<DynamicIcon name={item.markedForDelete ? 'rotate-ccw' : 'trash'} className="size-3.5" />
							<span>
								{item.markedForDelete
									? t('media.undoDelete', 'Undo')
									: t('common.delete', 'Delete')}
							</span>
						</Button>
					) : (
						<div />
					)}

					<Button type="button" size="sm" onClick={() => onOpenChange(false)}>
						{t('common.done', 'Done')}
					</Button>
				</div>
			</div>
		</dialog>,
		document.body
	);
}

export interface CompactMediaDropBarProps {
	inputRef: React.RefObject<HTMLInputElement | null>;
	inputId: string;
	inputName?: string;
	isImage: boolean;
	isMultiple: boolean;
	isSingleMode: boolean;
	hasExistingItems: boolean;
	isLocked: boolean;
	required: boolean;
	acceptAttr?: string;
	allowedExts: string[];
	maxFiles: number;
	maxFilesize?: number;
	isDropOverZone: boolean;
	onSetDropOverZone: (over: boolean) => void;
	onFilesSelected: (files: FileList | null) => void;
}

export function CompactMediaDropBar({
	inputRef,
	inputId,
	inputName,
	isImage,
	isMultiple,
	isSingleMode,
	hasExistingItems,
	isLocked,
	required,
	acceptAttr,
	allowedExts,
	maxFiles,
	maxFilesize,
	isDropOverZone,
	onSetDropOverZone,
	onFilesSelected,
}: CompactMediaDropBarProps): React.ReactElement {
	const { t } = useTranslations('core');

	const buttonLabel = isImage
		? isSingleMode
			? t('media.chooseImage', 'Choose image')
			: hasExistingItems
				? t('media.addImages', 'Add images')
				: t('media.chooseImages', 'Choose images')
		: isSingleMode
			? t('media.chooseFile', 'Choose file')
			: hasExistingItems
				? t('media.addFiles', 'Add files')
				: t('media.chooseFiles', 'Choose files');

	const buttonIcon = isImage
		? hasExistingItems && !isSingleMode
			? 'plus'
			: 'image-plus'
		: hasExistingItems && !isSingleMode
			? 'plus'
			: 'folder-open';

	const maxVisibleExts = 4;
	const compactExtsLabel =
		allowedExts.length > maxVisibleExts
			? `${allowedExts.slice(0, maxVisibleExts).join(', ')} +${allowedExts.length - maxVisibleExts}`
			: allowedExts.join(', ');

	const maxSizeText =
		maxFilesize && maxFilesize > 0
			? t('media.maxSizeHint', { size: formatMediaBytes(maxFilesize) }, `Max ${formatMediaBytes(maxFilesize)}`)
			: '';

	const maxFilesText =
		maxFiles > 1 ? t('media.maxFilesHint', { count: maxFiles }, `Up to ${maxFiles} items`) : '';

	const fullConstraintsTooltip = [
		allowedExts.length > 0 ? allowedExts.map((ext) => `.${ext}`).join(', ') : '',
		maxSizeText,
		maxFilesText,
	]
		.filter(Boolean)
		.join(' · ');

	return (
		<label
			htmlFor={inputId}
			title={fullConstraintsTooltip || undefined}
			onDragOver={(e) => {
				if (isLocked || !hasDraggedOsFiles(e)) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				if (!isDropOverZone) {
					onSetDropOverZone(true);
				}
			}}
			onDragLeave={(e) => {
				if (!isDropOverZone) {
					return;
				}
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
					onSetDropOverZone(false);
				}
			}}
			onDrop={(e) => {
				if (isLocked || !hasDraggedOsFiles(e)) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				onSetDropOverZone(false);
				onFilesSelected(e.dataTransfer?.files || null);
			}}
			className={cn(
				'group/dropbar flex min-h-9 w-full items-center justify-between gap-2.5 rounded-md border border-dashed border-input bg-input-surface px-1.5 py-1 shadow-2xs transition-colors cursor-pointer select-none pointer-coarse:min-h-11',
				'hover:border-primary/55 hover:bg-muted/35',
				'has-focus-visible:border-ring has-focus-visible:ring-2 has-focus-visible:ring-ring',
				isDropOverZone && 'border-primary bg-primary/8 ring-2 ring-primary/20'
			)}
		>
			<div className="flex min-w-0 flex-1 items-center gap-2.5">
				<span
					className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--button-bg)] px-3 text-xs font-medium text-[var(--button-fg)] shadow-2xs transition-colors group-hover/dropbar:bg-[var(--button-hover-bg)] group-hover/dropbar:text-[var(--button-hover-fg)] pointer-coarse:h-8 pointer-coarse:px-3.5"
				>
					<DynamicIcon name={buttonIcon} className="size-3.5 shrink-0" aria-hidden="true" />
					<span>{buttonLabel}</span>
				</span>

				{compactExtsLabel || maxSizeText || maxFilesText ? (
					<span className="min-w-0 truncate text-[11px] tabular-nums text-muted-foreground">
						{compactExtsLabel ? <span className="font-mono">{compactExtsLabel}</span> : null}
						{maxSizeText ? (
							<span className={cn(compactExtsLabel && 'hidden @md:inline')}>
								{compactExtsLabel ? ` · ${maxSizeText}` : maxSizeText}
							</span>
						) : null}
						{maxFilesText ? (
							<span className="hidden @lg:inline">
								{compactExtsLabel || maxSizeText ? ` · ${maxFilesText}` : maxFilesText}
							</span>
						) : null}
					</span>
				) : null}
			</div>

			<span
				aria-hidden="true"
				className={cn(
					'shrink-0 items-center gap-1.5 pr-1.5 text-[11px] transition-colors',
					isDropOverZone
						? 'flex font-medium text-primary'
						: 'hidden text-muted-foreground @sm:flex'
				)}
			>
				<DynamicIcon name="upload-cloud" className="size-3.5 shrink-0 opacity-80" />
				<span>
					{isDropOverZone
						? t('media.dropToUpload', 'Drop to upload')
						: t('media.dropOrPaste', 'Drop or paste')}
				</span>
			</span>

			<input
				ref={inputRef}
				id={inputId}
				name={inputName}
				type="file"
				accept={acceptAttr || undefined}
				multiple={isMultiple}
				disabled={isLocked}
				required={required}
				onChange={(e) => onFilesSelected(e.target.files)}
				className="sr-only"
			/>
		</label>
	);
}

export function CompactMediaLockedBar({ isImage }: { isImage: boolean }): React.ReactElement {
	const { t } = useTranslations('core');
	return (
		<div className="flex min-h-9 items-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground opacity-70 pointer-coarse:min-h-11">
			<DynamicIcon name={isImage ? 'image' : 'file'} className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
			<span className="truncate">{t('form.noItemsSelected', 'No items selected.')}</span>
		</div>
	);
}
