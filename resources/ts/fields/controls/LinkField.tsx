import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { fetchGatewayJson } from '../../hooks';
import { useTranslations } from '../../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../../lib/utils';
import { Badge, Input, PortalRoot, Select } from '../../ui';
import {
	extractClipboardFiles,
	formatFocusPoint,
	hasDraggedOsFiles,
	uploadMediaFileViaXhr,
	validateStudioIncomingFiles,
	type FocusCoordinates,
	type StudioMediaItem,
} from '../mediaUtils';
import {
	applyLinkSettingPatches,
	buildLinkInlineSettingFields,
	dispatchDomChange,
	FieldStatusRow,
	formatInlineSettingSummaryChip,
	formatMediaBytes,
	getLocalizedLinkText,
	getNeutralSettingValue,
	inlineSettingValuesEqual,
	isCompactPopoverField,
	isLinkFieldValueEmpty,
	LanguageTabsBar,
	normalizeLinkConfigFlags,
	normalizeLinkFieldValue,
	readInitialSyncedLanguageId,
	sanitizePhoneInput,
	setLocalizedLinkText,
} from '../shared';
export { normalizeLinkFieldValue, sanitizePhoneInput };
import type {
	InputfieldLanguageItem,
	InputfieldMediaItem,
	LinkFieldConfig,
	LinkFieldValue,
	LinkMediaProfile,
	LinkSelectedMedia,
	ReactInputfieldProps,
	RelationItemData,
} from '../types';

const DEFAULT_TYPE_LABELS: Record<string, string> = {
	page: 'Page',
	entry: 'Entry',
	url: 'URL',
	file: 'File',
	image: 'Image',
	video: 'Video',
	email: 'Email',
	tel: 'Phone',
};

const TYPE_ICONS: Record<string, string> = {
	page: 'file-text',
	entry: 'database',
	url: 'globe',
	file: 'paperclip',
	image: 'image',
	video: 'film',
	email: 'mail',
	tel: 'phone',
};

const TYPE_PLACEHOLDERS: Record<string, string> = {
	page: 'Search pages by title or path...',
	entry: 'Search entries...',
	url: 'https://example.com, /path/, or #section',
	email: 'hello@example.com',
	tel: '+905551234567',
};

const DEFAULT_MEDIA_PROFILES: Record<string, Omit<LinkMediaProfile, 'mediaToken'>> = {
	image: {
		key: 'image',
		kind: 'image',
		isImage: true,
		isVideo: false,
		label: 'Image',
		icon: 'image',
		extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg'],
		accept: '.jpg,.jpeg,.png,.webp,.gif,.avif,.svg',
		maxFilesize: 0,
	},
	video: {
		key: 'video',
		kind: 'video',
		isImage: false,
		isVideo: true,
		label: 'Video',
		icon: 'film',
		extensions: ['mp4', 'webm', 'mov'],
		accept: '.mp4,.webm,.mov',
		maxFilesize: 0,
	},
	file: {
		key: 'file',
		kind: 'file',
		isImage: false,
		isVideo: false,
		label: 'File',
		icon: 'paperclip',
		extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'csv', 'txt'],
		accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt',
		maxFilesize: 0,
	},
};

interface FloatingPosition {
	top: number;
	left: number;
	width: number;
	maxHeight: number;
	placement: 'bottom' | 'top';
}

function computeFloatingPosition(
	anchorEl: HTMLElement | null,
	panelWidth: number,
	estimatedHeight: number,
	alignRight = false
): FloatingPosition {
	if (!anchorEl || typeof window === 'undefined') {
		return { top: 0, left: 0, width: panelWidth, maxHeight: 440, placement: 'bottom' };
	}
	const rect = anchorEl.getBoundingClientRect();
	const gap = 6;
	const margin = 12;
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const spaceBelow = vh - rect.bottom - margin;
	const spaceAbove = rect.top - margin;
	const flipTop = spaceBelow < estimatedHeight + gap && spaceAbove > spaceBelow;
	const availableSpace = Math.max(200, (flipTop ? spaceAbove : spaceBelow) - gap);
	const maxHeight = Math.min(540, vh - margin * 2, availableSpace);
	const width = Math.min(panelWidth, Math.max(220, vw - margin * 2));
	const rawLeft = alignRight ? rect.right - width : rect.left;
	const left = Math.max(margin, Math.min(rawLeft, vw - width - margin));
	const top = flipTop ? Math.max(margin, rect.top - gap) : rect.bottom + gap;
	return {
		top,
		left,
		width,
		maxHeight,
		placement: flipTop ? 'top' : 'bottom',
	};
}

export interface LinkFieldStandaloneProps extends Partial<ReactInputfieldProps> {
	isIslandHost?: boolean;
	props?: Record<string, unknown>;
	onChange?: (next: LinkFieldValue | string) => void;
}

export function LinkFieldControl(rawProps: LinkFieldStandaloneProps): React.ReactElement {
	const unwrapped = useMemo(() => {
		const base =
			rawProps.props && typeof rawProps.props === 'object'
				? { ...rawProps, ...rawProps.props }
				: rawProps;
		if (base.props && typeof base.props === 'object' && base.props !== rawProps.props) {
			return { ...base, ...base.props };
		}
		return base;
	}, [rawProps]);

	const inputName = String(unwrapped.name || '');
	const inputId = String(unwrapped.id || (inputName ? `Inputfield_${inputName}` : 'pw_link'));
	const isReadOnly = Boolean(rawProps.readOnly || unwrapped.readOnly);
	const isDisabled = Boolean(rawProps.disabled || unwrapped.disabled || isReadOnly);

	if (isReadOnly && rawProps.isIslandHost) {
		const norm = normalizeLinkFieldValue(unwrapped.value, unwrapped.linkConfig?.defaultType || 'page');
		if (isLinkFieldValueEmpty(norm)) {
			return (
				<Badge variant="outline" className="text-muted-foreground" data-rw-control="link">
					—
				</Badge>
			);
		}
		const summary =
			norm.label.trim() ||
			norm.file.trim() ||
			norm.url.trim() ||
			(norm.pageId > 0 ? `Page #${norm.pageId}` : norm.entryId ? `Entry ${norm.entryId.slice(0, 8)}` : '—');
		return (
			<Badge variant="secondary" className="gap-1.5 text-xs font-normal" data-rw-control="link">
				<span className="font-mono font-semibold uppercase text-foreground">{norm.type}:</span>
				<span className="truncate text-muted-foreground">{summary}</span>
			</Badge>
		);
	}

	return (
		<LinkField
			controlType="link"
			id={inputId}
			name={inputName}
			label={typeof unwrapped.label === 'string' ? unwrapped.label : undefined}
			inlineOptionsInHeader={Boolean(unwrapped.inlineOptionsInHeader)}
			scopePrefix={typeof unwrapped.scopePrefix === 'string' ? unwrapped.scopePrefix : undefined}
			value={unwrapped.value}
			placeholder={unwrapped.placeholder}
			required={Boolean(unwrapped.required)}
			disabled={isDisabled}
			readOnly={isReadOnly}
			error={typeof unwrapped.error === 'string' ? unwrapped.error : undefined}
			errorId={typeof unwrapped.errorId === 'string' ? unwrapped.errorId : undefined}
			describedBy={typeof unwrapped.describedBy === 'string' ? unwrapped.describedBy : undefined}
			languages={Array.isArray(unwrapped.languages) ? unwrapped.languages : undefined}
			activeLangId={typeof unwrapped.activeLangId === 'number' ? unwrapped.activeLangId : undefined}
			onSelectLanguage={typeof unwrapped.onSelectLanguage === 'function' ? unwrapped.onSelectLanguage : undefined}
			linkConfig={unwrapped.linkConfig}
			onValueChange={(fieldName, nextVal) => {
				unwrapped.onValueChange?.(fieldName, nextVal);
				rawProps.onChange?.(isLinkFieldValueEmpty(nextVal) ? '' : (nextVal as LinkFieldValue));
			}}
			{...(rawProps.isIslandHost ? { __isIslandHost: true } : {})}
		/>
	);
}

export function LinkField(props: ReactInputfieldProps & { __isIslandHost?: boolean }): React.ReactElement {
	const { t } = useTranslations();
	const rootRef = useRef<HTMLDivElement | null>(null);
	const [detectedIslandHost, setDetectedIslandHost] = useState<boolean>(Boolean(props.__isIslandHost));
	const isIslandHost = Boolean(props.__isIslandHost || detectedIslandHost);

	useEffect(() => {
		if (props.__isIslandHost) {
			setDetectedIslandHost(true);
			return;
		}
		const parent = rootRef.current?.parentElement;
		if (parent?.classList.contains('pw-inertia-inputfield-island')) {
			setDetectedIslandHost(true);
		}
	}, [props.__isIslandHost]);

	const cfg: LinkFieldConfig = useMemo(() => {
		const raw = props.linkConfig;
		const rawTypes =
			Array.isArray(raw?.types) && raw.types.length > 0
				? raw.types
				: ['page', 'entry', 'url', 'tel', 'email', 'file'];
		const types: string[] = [];
		for (const item of rawTypes) {
			const clean = String(item || '').trim().toLowerCase();
			const mapped = clean === 'anchor' ? 'url' : clean;
			if (mapped && !types.includes(mapped)) {
				types.push(mapped);
			}
		}
		if (types.length === 0) {
			types.push('url');
		}

		const rawProfiles = raw?.mediaProfiles && typeof raw.mediaProfiles === 'object' ? raw.mediaProfiles : {};
		const mediaProfiles: Record<string, LinkMediaProfile> = {};
		for (const [k, v] of Object.entries(rawProfiles)) {
			if (v && typeof v === 'object') {
				mediaProfiles[k.toLowerCase()] = v as LinkMediaProfile;
			}
		}
		for (const tp of types) {
			if (!mediaProfiles[tp] && DEFAULT_MEDIA_PROFILES[tp]) {
				mediaProfiles[tp] = {
					...DEFAULT_MEDIA_PROFILES[tp],
					mediaToken: '',
				};
			}
		}

		const fallbackType = types[0] ?? 'url';
		const rawDefault = String(raw?.defaultType || fallbackType).toLowerCase();
		const mappedDefault = rawDefault === 'anchor' ? 'url' : rawDefault;
		const defaultType = types.includes(mappedDefault) ? mappedDefault : fallbackType;

		const featureFlags = normalizeLinkConfigFlags(raw);
		return {
			types,
			defaultType,
			...featureFlags,
			relationEndpoint: raw?.relationEndpoint || '/_react/relation',
			relationTokens: raw?.relationTokens || {},
			selectedTarget: raw?.selectedTarget ?? null,
			mediaEndpoint: raw?.mediaEndpoint || '/_react/media',
			mediaProfiles,
			selectedMedia: raw?.selectedMedia ?? null,
			ownerId: raw?.ownerId || '',
			typeLabels: raw?.typeLabels || {},
			languages: Array.isArray(raw?.languages)
				? (raw.languages as InputfieldLanguageItem[])
				: Array.isArray(props.languages)
					? props.languages
					: [],
		};
	}, [props.linkConfig, props.languages]);

	const [current, setCurrent] = useState<LinkFieldValue>(() => {
		const normalized = normalizeLinkFieldValue(props.value, cfg.defaultType);
		return cfg.types.includes(normalized.type) ? normalized : { ...normalized, type: cfg.defaultType };
	});

	const [inlineError, setInlineError] = useState<string | null>(null);

	useEffect(() => {
		const normalized = normalizeLinkFieldValue(props.value, cfg.defaultType);
		const safeNext = cfg.types.includes(normalized.type) ? normalized : { ...normalized, type: cfg.defaultType };
		setCurrent((prev) => (JSON.stringify(prev) === JSON.stringify(safeNext) ? prev : safeNext));
	}, [props.value, cfg.defaultType, cfg.types]);

	const hiddenInputRef = useRef<HTMLInputElement | null>(null);
	const isDisabled = Boolean(props.disabled || props.readOnly);

	const commit = useCallback(
		(patch: Partial<LinkFieldValue>) => {
			if (isDisabled) {
				return;
			}
			setCurrent((prev) => {
				const next: LinkFieldValue = { ...prev, ...patch };
				if (next.target === '_blank' && cfg.enableRel && !next.rel.trim()) {
					next.rel = 'noopener noreferrer';
				}
				props.onValueChange?.(props.name, next);
				if (typeof window !== 'undefined' && hiddenInputRef.current) {
					window.requestAnimationFrame(() => dispatchDomChange(hiddenInputRef.current));
				}
				return next;
			});
		},
		[cfg.enableRel, isDisabled, props]
	);

	// Cache hydrated relation items keyed by `${type}:${id}`
	const [targetCache, setTargetCache] = useState<Record<string, RelationItemData>>(() => {
		const initial = cfg.selectedTarget as RelationItemData | null | undefined;
		if (initial && initial.value !== undefined) {
			const resKey = `${String(initial.resource || cfg.defaultType)}:${String(initial.value)}`;
			return { [resKey]: initial };
		}
		return {};
	});

	useEffect(() => {
		const initial = cfg.selectedTarget as RelationItemData | null | undefined;
		if (initial && initial.value !== undefined) {
			const resKey = `${String(initial.resource || current.type)}:${String(initial.value)}`;
			setTargetCache((prev) => (prev[resKey] ? prev : { ...prev, [resKey]: initial }));
		}
	}, [cfg.selectedTarget, current.type]);

	// Cache uploaded/hydrated media metadata keyed by filename
	const [mediaCache, setMediaCache] = useState<Record<string, LinkSelectedMedia>>(() => {
		if (cfg.selectedMedia && cfg.selectedMedia.name) {
			return { [cfg.selectedMedia.name]: cfg.selectedMedia };
		}
		return {};
	});

	useEffect(() => {
		if (cfg.selectedMedia && cfg.selectedMedia.name) {
			const m = cfg.selectedMedia;
			setMediaCache((prev) => (prev[m.name] ? prev : { ...prev, [m.name]: m }));
		}
	}, [cfg.selectedMedia]);

	const activeMediaProfile: LinkMediaProfile | null = cfg.mediaProfiles?.[current.type] ?? null;
	const activeRelationToken = !activeMediaProfile ? cfg.relationTokens[current.type] || '' : '';
	const isRelationType = Boolean(activeRelationToken);
	const activeRelationId =
		current.type === 'page'
			? current.pageId > 0
				? String(current.pageId)
				: ''
			: current.entryId;

	const selectedItem: RelationItemData | null = useMemo(() => {
		if (!isRelationType || !activeRelationId) {
			return null;
		}
		return targetCache[`${current.type}:${activeRelationId}`] || null;
	}, [isRelationType, activeRelationId, targetCache, current.type]);

	// Hydrate selected relation item if missing from cache
	useEffect(() => {
		if (!isRelationType || !activeRelationId || selectedItem || typeof window === 'undefined' || !cfg.relationEndpoint) {
			return;
		}
		const controller = new AbortController();
		void fetchGatewayJson<{ items?: RelationItemData[] }>(cfg.relationEndpoint, {
			method: 'POST',
			payload: {
				relationToken: activeRelationToken,
				action: 'hydrate',
				values: [activeRelationId],
			},
			signal: controller.signal,
		})
			.then((res) => {
				if (!res.ok || !res.data) {
					return;
				}
				const json = res.data;
				if (Array.isArray(json.items) && json.items[0]) {
					const item = json.items[0] as RelationItemData;
					setTargetCache((prev) => ({
						...prev,
						[`${current.type}:${String(item.value)}`]: item,
					}));
				}
			})
			.catch(() => {
				// Ignore aborted or failed hydration
			});
		return () => controller.abort();
	}, [isRelationType, activeRelationId, selectedItem, cfg.relationEndpoint, activeRelationToken, current.type]);

	// Inline Media Upload State (`/_react/media`)
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const uploadAbortRef = useRef<AbortController | null>(null);
	const [uploadingName, setUploadingName] = useState<string>('');
	const [uploadProgress, setUploadProgress] = useState<number>(0);
	const [isDragOver, setIsDragOver] = useState<boolean>(false);

	useEffect(() => {
		return () => {
			uploadAbortRef.current?.abort();
		};
	}, []);

	const handleMediaFiles = useCallback(
		async (incoming: File[]) => {
			if (isDisabled || !activeMediaProfile || incoming.length === 0) {
				return;
			}
			if (!activeMediaProfile.mediaToken) {
				setInlineError(t('link.mediaUnavailable', 'Media upload context is not available for this field.'));
				return;
			}

			const { accepted, errors } = validateStudioIncomingFiles(incoming.slice(0, 1), {
				allowedExtensions: activeMediaProfile.extensions,
				maxFilesize: activeMediaProfile.maxFilesize,
				maxFiles: 1,
				existingCount: current.file ? 1 : 0,
				queuedCount: 0,
				isMultiple: false,
				overwrite: true,
				isReplacement: true,
				t,
			});

			if (errors.length > 0 || accepted.length === 0) {
				setInlineError(errors[0] || t('link.invalidMedia', 'Selected file is not supported.'));
				return;
			}

			const fileToUpload = accepted[0];
			if (!fileToUpload) {
				setInlineError(errors[0] || t('link.invalidMedia', 'Selected file is not supported.'));
				return;
			}
			uploadAbortRef.current?.abort();
			const controller = new AbortController();
			uploadAbortRef.current = controller;
			setInlineError(null);
			setUploadingName(fileToUpload.name);
			setUploadProgress(5);

			const res = await uploadMediaFileViaXhr({
				endpoint: cfg.mediaEndpoint || '/_react/media',
				mediaToken: activeMediaProfile.mediaToken,
				file: fileToUpload,
				action: 'upload',
				clientOwnerId: cfg.ownerId || undefined,
				clientInputName: props.name || undefined,
				signal: controller.signal,
				onProgress: (pct) => setUploadProgress(pct),
			});

			if (uploadAbortRef.current === controller) {
				uploadAbortRef.current = null;
			}
			setUploadingName('');
			setUploadProgress(0);

			if (res.aborted) {
				return;
			}
			const uploaded = res.item || (Array.isArray(res.items) ? res.items[0] : undefined);
			if (!res.ok || !uploaded || !uploaded.name) {
				const errMsg =
					res.error ||
					(Array.isArray(res.errors) && res.errors[0]) ||
					t('link.uploadFailed', 'Failed to upload file.');
				setInlineError(errMsg);
				return;
			}

			const meta: LinkSelectedMedia = {
				name: uploaded.name,
				url: uploaded.url || '',
				thumbUrl: uploaded.thumbUrl || (activeMediaProfile.isImage ? uploaded.url : ''),
				ext: uploaded.ext || (uploaded.name.split('.').pop() || '').toLowerCase(),
				size: uploaded.size || fileToUpload.size,
				width: uploaded.width,
				height: uploaded.height,
			};
			setMediaCache((prev) => ({ ...prev, [uploaded.name]: meta }));
			commit({ file: uploaded.name, url: '' });
		},
		[activeMediaProfile, cfg.mediaEndpoint, cfg.ownerId, commit, current.file, isDisabled, props.name, t]
	);

	// Searchable relation combobox state
	const [searchQuery, setSearchQuery] = useState('');
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchResults, setSearchResults] = useState<RelationItemData[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [highlightedIdx, setHighlightedIdx] = useState(0);
	const searchWrapRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const searchPanelRef = useRef<HTMLDivElement | null>(null);
	const listboxId = useId();
	const errorId = useId();
	const [searchPos, setSearchPos] = useState<FloatingPosition>({
		top: 0,
		left: 0,
		width: 340,
		maxHeight: 280,
		placement: 'bottom',
	});

	const refreshSearchPos = useCallback(() => {
		const anchor = searchWrapRef.current;
		if (!anchor) {
			return;
		}
		const rect = anchor.getBoundingClientRect();
		setSearchPos(computeFloatingPosition(anchor, Math.max(rect.width, 320), 280, false));
	}, []);

	useEffect(() => {
		if (!searchOpen || !isRelationType || !cfg.relationEndpoint) {
			return;
		}
		const relEndpoint = cfg.relationEndpoint;
		refreshSearchPos();
		const controller = new AbortController();
		const timer = window.setTimeout(() => {
			setSearchLoading(true);
			void fetchGatewayJson<{ items?: RelationItemData[] }>(relEndpoint, {
				method: 'POST',
				payload: {
					relationToken: activeRelationToken,
					action: 'search',
					q: searchQuery,
					page: 1,
					limit: 25,
				},
				signal: controller.signal,
			})
				.then((res) => {
					const items = res.ok && Array.isArray(res.data?.items) ? (res.data.items as RelationItemData[]) : [];
					setSearchResults(items);
					setHighlightedIdx(0);
				})
				.catch(() => {
					// Ignore abort
				})
				.finally(() => {
					if (!controller.signal.aborted) {
						setSearchLoading(false);
					}
				});
		}, 140);

		return () => {
			window.clearTimeout(timer);
			controller.abort();
		};
	}, [searchOpen, isRelationType, searchQuery, cfg.relationEndpoint, activeRelationToken, refreshSearchPos]);

	useEffect(() => {
		if (!searchOpen) {
			return;
		}
		const handlePointerDown = (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (
				target &&
				!searchWrapRef.current?.contains(target) &&
				!searchPanelRef.current?.contains(target)
			) {
				setSearchOpen(false);
			}
		};
		const handleReposition = () => refreshSearchPos();
		document.addEventListener('mousedown', handlePointerDown);
		window.addEventListener('resize', handleReposition);
		window.addEventListener('scroll', handleReposition, true);
		return () => {
			document.removeEventListener('mousedown', handlePointerDown);
			window.removeEventListener('resize', handleReposition);
			window.removeEventListener('scroll', handleReposition, true);
		};
	}, [searchOpen, refreshSearchPos]);

	const selectRelationItem = useCallback(
		(item: RelationItemData) => {
			const idStr = String(item.value);
			setTargetCache((prev) => ({
				...prev,
				[`${current.type}:${idStr}`]: item,
			}));
			setInlineError(null);
			if (current.type === 'page') {
				commit({
					pageId: Math.max(0, Number(idStr) || 0),
					entryId: '',
					entryType: '',
				});
			} else {
				const inferredEntryType = String(item.meta?.type || item.badge || '');
				commit({
					entryId: idStr,
					entryType: inferredEntryType,
					pageId: 0,
				});
			}
			setSearchQuery('');
			setSearchOpen(false);
		},
		[current.type, commit]
	);

	// Unified inline settings state for standalone InputfieldReactLink outside SchemaForm
	const inlineOptionsInHeader = Boolean(props.inlineOptionsInHeader);
	const optionsMeta = useMemo(
		() => buildLinkInlineSettingFields(cfg, current, isDisabled),
		[cfg, current, isDisabled]
	);
	const hasSecondaryOptions = !inlineOptionsInHeader && optionsMeta.fields.length > 0;
	const [optionsOpen, setOptionsOpen] = useState(false);
	const optionsBtnRef = useRef<HTMLButtonElement | null>(null);
	const optionsPanelRef = useRef<HTMLDivElement | null>(null);
	const optionsPanelId = useId();
	const optionsHeadingId = useId();
	const optionsCompactCount = useMemo(
		() => optionsMeta.fields.filter((bf) => isCompactPopoverField(bf)).length,
		[optionsMeta.fields]
	);
	const useTwoColOptions = optionsMeta.fields.length >= 4 && optionsCompactCount >= 2;
	const [optionsPos, setOptionsPos] = useState<FloatingPosition>({
		top: 0,
		left: 0,
		width: 336,
		maxHeight: 440,
		placement: 'bottom',
	});

	const refreshOptionsPos = useCallback(() => {
		const rowUnits = useTwoColOptions
			? optionsMeta.fields.reduce((acc, bf) => acc + (isCompactPopoverField(bf) ? 0.5 : 1), 0)
			: optionsMeta.fields.length;
		const chromeHeight = optionsMeta.isTargetEmpty ? 104 : 68;
		const estHeight = Math.min(540, Math.ceil(rowUnits) * 68 + chromeHeight);
		const nextPos = computeFloatingPosition(optionsBtnRef.current, useTwoColOptions ? 448 : 336, estHeight, true);
		setOptionsPos((prev) =>
			prev.top === nextPos.top &&
			prev.left === nextPos.left &&
			prev.width === nextPos.width &&
			prev.maxHeight === nextPos.maxHeight &&
			prev.placement === nextPos.placement
				? prev
				: nextPos
		);
	}, [optionsMeta.fields, optionsMeta.isTargetEmpty, useTwoColOptions]);

	const refreshOptionsPosRef = useRef(refreshOptionsPos);
	refreshOptionsPosRef.current = refreshOptionsPos;

	useEffect(() => {
		if (!optionsOpen || !hasSecondaryOptions) {
			return;
		}
		refreshOptionsPosRef.current();
		const focusRaf = window.requestAnimationFrame(() => {
			const panel = optionsPanelRef.current;
			if (!panel || panel.contains(document.activeElement)) {
				return;
			}
			const firstControl = panel.querySelector<HTMLElement>(
				'[data-rw-inline-settings-body] input:not([disabled]):not([type="hidden"]), [data-rw-inline-settings-body] select:not([disabled]), [data-rw-inline-settings-body] textarea:not([disabled]), [data-rw-inline-settings-body] button:not([disabled])'
			);
			(firstControl ?? panel).focus({ preventScroll: true });
		});
		const handlePointerDown = (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (!target) {
				return;
			}
			if (optionsBtnRef.current?.contains(target) || optionsPanelRef.current?.contains(target)) {
				return;
			}
			if (target instanceof Element && target.closest('[data-rw-portal-overlay]')) {
				return;
			}
			setOptionsOpen(false);
		};
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				setOptionsOpen(false);
				optionsBtnRef.current?.focus();
			}
		};
		const handleReposition = (e: Event) => {
			if (e.type === 'scroll' && e.target instanceof Node && optionsPanelRef.current?.contains(e.target)) {
				return;
			}
			refreshOptionsPosRef.current();
		};
		document.addEventListener('mousedown', handlePointerDown);
		document.addEventListener('keydown', handleKeyDown);
		window.addEventListener('resize', handleReposition);
		window.addEventListener('scroll', handleReposition, true);
		return () => {
			window.cancelAnimationFrame(focusRaf);
			document.removeEventListener('mousedown', handlePointerDown);
			document.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('resize', handleReposition);
			window.removeEventListener('scroll', handleReposition, true);
		};
	}, [optionsOpen, hasSecondaryOptions]);

	useEffect(() => {
		if (optionsOpen && hasSecondaryOptions) {
			refreshOptionsPosRef.current();
		}
	}, [optionsOpen, hasSecondaryOptions, optionsMeta.fields.length, optionsMeta.isTargetEmpty, useTwoColOptions]);

	const allOptionChips = useMemo(() => {
		const chips: string[] = [];
		for (const bf of optionsMeta.fields) {
			const chip = formatInlineSettingSummaryChip(bf, optionsMeta.values[bf.name]);
			if (chip) {
				chips.push(chip);
			}
		}
		return chips;
	}, [optionsMeta]);

	const optionSummaryChips = allOptionChips.slice(0, 3);
	const optionOverflowCount = Math.max(0, allOptionChips.length - optionSummaryChips.length);

	const modifiedOptionCount = useMemo(() => {
		let count = 0;
		for (const bf of optionsMeta.fields) {
			if (!inlineSettingValuesEqual(optionsMeta.values[bf.name], getNeutralSettingValue(bf))) {
				count += 1;
			}
		}
		return count;
	}, [optionsMeta]);

	const effectiveError = inlineError || (props.error && props.error.trim() !== '' ? props.error : null);
	const effectiveErrorId = props.errorId || errorId;

	const validateScalarOnBlur = useCallback(
		(type: string, rawVal: string): string | null => {
			const trimmed = rawVal.trim();
			if (trimmed === '') {
				return null;
			}
			if (type === 'tel') {
				if (!/^\+?[0-9]+$/.test(trimmed)) {
					return t(
						'link.invalidPhone',
						'Phone number may only contain digits (0-9) and an optional leading + sign.'
					);
				}
			} else if (type === 'email') {
				if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
					return t('link.invalidEmail', 'Enter a valid email address.');
				}
			} else if (type === 'url') {
				if (/^\s*(?:javascript|vbscript|data):/i.test(trimmed)) {
					return t('link.unsafeUrl', 'Unsafe URL protocol is not allowed.');
				}
			}
			return null;
		},
		[t]
	);

	const activeMediaRef = activeMediaProfile ? current.file || current.url : '';
	const activeMediaMeta: LinkSelectedMedia | null = useMemo(() => {
		if (!activeMediaProfile || !activeMediaRef) {
			return null;
		}
		const baseName = activeMediaRef.split('/').pop() || activeMediaRef;
		if (mediaCache[activeMediaRef]) {
			return mediaCache[activeMediaRef];
		}
		if (mediaCache[baseName]) {
			return mediaCache[baseName];
		}
		const ext = (baseName.split('.').pop() || '').toLowerCase();
		const isPathUrl = activeMediaRef.includes('/') || activeMediaRef.startsWith('http');
		return {
			name: baseName,
			url: isPathUrl ? activeMediaRef : '',
			thumbUrl: isPathUrl && activeMediaProfile.isImage ? activeMediaRef : '',
			ext,
		};
	}, [activeMediaProfile, activeMediaRef, mediaCache]);

	const serializedJson = useMemo(() => {
		if (isLinkFieldValueEmpty(current)) {
			return '';
		}
		const cleanCopy: Record<string, unknown> = { ...current };
		const cleanTextMap = (mapKey: 'labels' | 'ariaLabels') => {
			const rawMap = cleanCopy[mapKey];
			if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) {
				delete cleanCopy[mapKey];
				return;
			}
			const nextMap: Record<string, string> = {};
			let hasNonDefault = false;
			for (const [k, v] of Object.entries(rawMap as Record<string, unknown>)) {
				if (typeof v === 'string' && v.trim() !== '') {
					nextMap[k] = v.trim();
					if (k !== 'default') {
						hasNonDefault = true;
					}
				}
			}
			if (hasNonDefault) {
				cleanCopy[mapKey] = nextMap;
			} else {
				delete cleanCopy[mapKey];
			}
		};
		cleanTextMap('labels');
		cleanTextMap('ariaLabels');
		if (!cleanCopy.alt) delete cleanCopy.alt;
		if (
			!cleanCopy.descriptions ||
			Object.values(cleanCopy.descriptions as Record<string, string>).every((v) => !String(v || '').trim())
		) {
			delete cleanCopy.descriptions;
		}
		if (!cleanCopy.focus) delete cleanCopy.focus;
		if (!cleanCopy.tags) delete cleanCopy.tags;
		return JSON.stringify(cleanCopy);
	}, [current]);

	const [inspectorTab, setInspectorTab] = useState<'details' | 'focus' | 'studio' | null>(null);
	const [, setMediaRuntimeTick] = useState(0);
	const [activeLangId, setActiveLangId] = useState<number>(() =>
		props.activeLangId && props.activeLangId > 0
			? props.activeLangId
			: readInitialSyncedLanguageId(cfg.languages)
	);

	useEffect(() => {
		if (typeof props.activeLangId === 'number' && props.activeLangId > 0) {
			setActiveLangId(props.activeLangId);
		}
	}, [props.activeLangId]);

	const MediaInspectorSheet =
		typeof window !== 'undefined'
			? (
					window as unknown as {
						ReactMediaRuntime?: {
							AssetInspectorSheet?: React.FC<Record<string, unknown>>;
						};
					}
				).ReactMediaRuntime?.AssetInspectorSheet ?? null
			: null;

	const prefetchMediaRuntime = useCallback(() => {
		if (typeof window === 'undefined') {
			return;
		}
		const win = window as unknown as {
			ReactWorkspaceRuntime?: { ensureMediaLoaded?: () => Promise<void> };
			ReactMediaRuntime?: { AssetInspectorSheet?: unknown };
		};
		if (!win.ReactMediaRuntime?.AssetInspectorSheet) {
			void win.ReactWorkspaceRuntime?.ensureMediaLoaded?.().then(() =>
				setMediaRuntimeTick((n) => n + 1)
			);
		}
	}, []);

	useEffect(() => {
		if (
			typeof window !== 'undefined' &&
			(Boolean(activeMediaProfile) ||
				current.type === 'file' ||
				current.type === 'image' ||
				current.type === 'video')
		) {
			(
				window as unknown as {
					ReactWorkspaceRuntime?: { ensureMediaStyleLoaded?: () => void };
				}
			).ReactWorkspaceRuntime?.ensureMediaStyleLoaded?.();
		}
	}, [activeMediaProfile, current.type]);

	useEffect(() => {
		if (inspectorTab !== null && !MediaInspectorSheet) {
			prefetchMediaRuntime();
		}
	}, [inspectorTab, MediaInspectorSheet, prefetchMediaRuntime]);

	const studioMediaItem: StudioMediaItem | null = useMemo(() => {
		if (!activeMediaProfile || !activeMediaMeta) {
			return null;
		}
		const baseDesc = current.descriptions?.default ?? current.alt ?? '';
		const descriptions: Record<string, string> = {
			default: baseDesc,
			...(current.descriptions || {}),
		};
		return {
			id: activeMediaMeta.name,
			hash: activeMediaMeta.name,
			name: activeMediaMeta.name,
			basename: activeMediaMeta.name,
			ext: activeMediaMeta.ext || '',
			url: activeMediaMeta.url || '',
			thumbUrl: activeMediaMeta.thumbUrl || activeMediaMeta.url || '',
			size: activeMediaMeta.size || 0,
			filesizeStr:
				activeMediaMeta.size && activeMediaMeta.size > 0
					? formatMediaBytes(activeMediaMeta.size)
					: '',
			width: activeMediaMeta.width,
			height: activeMediaMeta.height,
			description: baseDesc,
			descriptions,
			tags: current.tags || '',
			focus: current.focus || '50 50 0',
			sort: 0,
			markedForDelete: false,
		};
	}, [activeMediaProfile, activeMediaMeta, current.alt, current.descriptions, current.focus, current.tags]);

	const hasMediaMetadata = Boolean(
		(current.alt && current.alt.trim() !== '') ||
			(current.descriptions &&
				Object.values(current.descriptions).some((v) => typeof v === 'string' && v.trim() !== '')) ||
			(current.focus && current.focus.trim() !== '' && current.focus.trim() !== '50 50 0')
	);

	const handleUpdateMediaDescription = useCallback(
		(_itemId: string, value: string, langId?: number) => {
			const langs = cfg.languages;
			const targetLang =
				langs && langs.length > 1 && langId !== undefined
					? langs.find((l) => l.id === langId)
					: undefined;
			const isDefaultLang = !targetLang || Boolean(targetLang.isDefault);
			const key = isDefaultLang ? 'default' : String(targetLang.id);
			const nextDescs: Record<string, string> = {
				...(current.descriptions || (current.alt ? { default: current.alt } : {})),
				[key]: value,
			};
			const nextDefaultAlt = (nextDescs.default ?? (isDefaultLang ? value : current.alt ?? '')).trim();
			commit({
				alt: nextDefaultAlt || undefined,
				descriptions: nextDescs,
			});
		},
		[cfg.languages, commit, current.alt, current.descriptions]
	);

	const handleUpdateMediaFocus = useCallback(
		(_itemId: string, coords: FocusCoordinates) => {
			const formatted = formatFocusPoint(coords);
			commit({
				focus: formatted === '50 50 0' ? undefined : formatted,
			});
		},
		[commit]
	);

	const handleUpdateMediaTags = useCallback(
		(_itemId: string, tags: string) => {
			commit({ tags: tags.trim() || undefined });
		},
		[commit]
	);

	const handleMediaMutatedFromServer = useCallback(
		(updated: InputfieldMediaItem) => {
			if (!updated || !updated.name) {
				return;
			}
			const nextMeta: LinkSelectedMedia = {
				name: updated.name,
				url: updated.url || activeMediaMeta?.url || '',
				thumbUrl: updated.thumbUrl || updated.url || activeMediaMeta?.thumbUrl || '',
				ext: updated.ext || activeMediaMeta?.ext || '',
				size: updated.size ?? activeMediaMeta?.size,
				width: updated.width ?? activeMediaMeta?.width,
				height: updated.height ?? activeMediaMeta?.height,
			};
			setMediaCache((prev) => ({ ...prev, [updated.name]: nextMeta }));
			if (updated.name !== current.file) {
				commit({ file: updated.name, url: '' });
			}
		},
		[activeMediaMeta, commit, current.file]
	);

	const safePreviewHref = activeMediaMeta?.url ? sanitizeHref(activeMediaMeta.url) : '';
	const extensionsSummary = useMemo(() => {
		if (!activeMediaProfile || activeMediaProfile.extensions.length === 0) {
			return '';
		}
		const head = activeMediaProfile.extensions.slice(0, 4).join(', ');
		const extra = activeMediaProfile.extensions.length - 4;
		return extra > 0 ? `${head} +${extra}` : head;
	}, [activeMediaProfile]);

	const chooseMediaButtonLabel = useMemo(() => {
		if (!activeMediaProfile) {
			return '';
		}
		if (activeMediaProfile.isImage) {
			return t('link.chooseImage', 'Choose image');
		}
		if (activeMediaProfile.isVideo) {
			return t('link.chooseVideo', 'Choose video');
		}
		return t('link.chooseFile', 'Choose file');
	}, [activeMediaProfile, t]);

	const showTextSubRow =
		!optionsMeta.isTargetEmpty && (optionsMeta.flags.enableLabel || optionsMeta.flags.enableAriaLabel);
	const hasMultiLang = Array.isArray(cfg.languages) && cfg.languages.length > 1;
	const activeLang = hasMultiLang
		? (cfg.languages!.find((l) => l.id === activeLangId) ??
			cfg.languages!.find((l) => l.isDefault) ??
			cfg.languages![0])
		: undefined;
	const isActiveLangEditable = activeLang ? activeLang.editable !== false : true;
	const langPresenceValues = useMemo(() => {
		const out: Record<number, string> = {};
		const langs = cfg.languages;
		if (!Array.isArray(langs) || langs.length < 2) {
			return out;
		}
		for (const lang of langs) {
			const lblVal = optionsMeta.flags.enableLabel
				? getLocalizedLinkText(current.label, current.labels, lang).trim()
				: '';
			const ariaVal = optionsMeta.flags.enableAriaLabel
				? getLocalizedLinkText(current.ariaLabel, current.ariaLabels, lang).trim()
				: '';
			out[lang.id] = lblVal || ariaVal;
		}
		return out;
	}, [
		cfg.languages,
		current.label,
		current.labels,
		current.ariaLabel,
		current.ariaLabels,
		optionsMeta.flags.enableLabel,
		optionsMeta.flags.enableAriaLabel,
	]);

	return (
		<div ref={rootRef} className="space-y-1.5" data-rw-control="link">
			{props.name && !isDisabled ? (
				<input type="hidden" name={`${props.name}_present`} value="1" />
			) : null}
			{!isIslandHost && props.name ? (
				<input ref={hiddenInputRef} type="hidden" name={props.name} value={serializedJson} />
			) : null}

			<div
				data-rw-field-slot="input"
				className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap"
			>
				{cfg.types.length > 1 ? (
					<div className="w-28 shrink-0">
						<Select
							id={`${props.id}_type`}
							aria-label={t('link.typeLabel', 'Link type')}
							value={current.type}
							disabled={isDisabled}
							className="h-9 text-xs font-medium"
							onChange={(e) => {
								const nextType = e.target.value;
								setSearchOpen(false);
								setSearchQuery('');
								setInlineError(null);
								commit({ type: nextType });
							}}
						>
							{cfg.types.map((tp) => (
								<option key={tp} value={tp}>
									{cfg.typeLabels?.[tp] ||
										DEFAULT_TYPE_LABELS[tp] ||
										tp.charAt(0).toUpperCase() + tp.slice(1)}
								</option>
							))}
						</Select>
					</div>
				) : null}

				<div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
					{/* Primary target slot (`h-9` uniform height across all link & media modes) */}
					<div ref={searchWrapRef} className="relative min-w-0">
						{activeMediaProfile ? (
							<div
								onDragEnter={(e) => {
									if (!isDisabled && hasDraggedOsFiles(e)) {
										e.preventDefault();
										setIsDragOver(true);
									}
								}}
								onDragOver={(e) => {
									if (!isDisabled && hasDraggedOsFiles(e)) {
										e.preventDefault();
										e.dataTransfer.dropEffect = 'copy';
										setIsDragOver(true);
									}
								}}
								onDragLeave={(e) => {
									if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
										setIsDragOver(false);
									}
								}}
								onDrop={(e) => {
									setIsDragOver(false);
									if (isDisabled || !hasDraggedOsFiles(e)) {
										return;
									}
									e.preventDefault();
									const dropped = Array.from(e.dataTransfer.files || []);
									if (dropped.length > 0) {
										void handleMediaFiles(dropped);
									}
								}}
								onPaste={(e) => {
									if (isDisabled) {
										return;
									}
									const pasted = extractClipboardFiles(e);
									if (pasted.length > 0) {
										e.preventDefault();
										void handleMediaFiles(pasted);
									}
								}}
								className={cn(
									'flex h-9 items-center justify-between gap-2 rounded-md px-2 text-xs transition-colors',
									activeMediaMeta || uploadingName
										? 'border border-input bg-input-surface shadow-2xs'
										: 'border border-dashed border-input bg-input-surface hover:border-primary/50 hover:bg-muted/30',
									isDragOver && 'border-primary bg-primary/5 ring-2 ring-ring/30',
									inlineError && 'border-destructive',
									isDisabled && 'cursor-not-allowed opacity-55'
								)}
							>
								<input
									ref={fileInputRef}
									id={props.id}
									type="file"
									accept={activeMediaProfile.accept || undefined}
									disabled={isDisabled}
									tabIndex={-1}
									aria-hidden="true"
									className="sr-only"
									onChange={(e) => {
										const picked = Array.from(e.target.files || []);
										e.target.value = '';
										if (picked.length > 0) {
											void handleMediaFiles(picked);
										}
									}}
								/>

								{uploadingName ? (
									<>
										<div className="flex min-w-0 flex-1 items-center gap-2">
											<DynamicIcon
												name="loader-2"
												className="size-3.5 shrink-0 motion-safe:animate-spin text-primary"
												aria-hidden="true"
											/>
											<span className="truncate font-medium text-foreground">
												{uploadingName}
											</span>
										</div>
										<progress
											data-rw-progress=""
											value={uploadProgress}
											max={100}
											aria-label={t('link.uploadProgress', 'Upload progress')}
											className="w-20 shrink-0"
										/>
										<button
											type="button"
											onClick={() => uploadAbortRef.current?.abort()}
											aria-label={t('link.cancelUpload', 'Cancel upload')}
											className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
										>
											<DynamicIcon name="x" className="size-3.5" />
										</button>
									</>
								) : activeMediaMeta ? (
									<>
										<button
											type="button"
											onMouseEnter={prefetchMediaRuntime}
											onFocus={prefetchMediaRuntime}
											onClick={() => {
												prefetchMediaRuntime();
												setInspectorTab('details');
											}}
											title={
												current.alt
													? `${activeMediaMeta.name} — Alt: ${current.alt}`
													: t('link.editMediaDetails', 'Edit media details, alt text & focal point')
											}
											className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
										>
											{activeMediaProfile.isImage && sanitizeHref(activeMediaMeta.thumbUrl || activeMediaMeta.url) ? (
												<img
													src={sanitizeHref(activeMediaMeta.thumbUrl || activeMediaMeta.url)}
													alt=""
													loading="lazy"
													decoding="async"
													className="size-6 shrink-0 rounded border border-border/60 bg-muted object-cover"
												/>
											) : (
												<span className="inline-flex size-6 shrink-0 items-center justify-center rounded bg-muted/70 text-muted-foreground">
													<DynamicIcon
														name={activeMediaProfile.icon || TYPE_ICONS[current.type] || 'file-text'}
														className="size-3.5"
														aria-hidden="true"
													/>
												</span>
											)}
											<span className="truncate font-medium text-foreground">
												{activeMediaMeta.name}
											</span>
											{activeMediaMeta.ext || activeMediaMeta.size ? (
												<span className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tabular-nums text-muted-foreground md:inline-block">
													{[
														activeMediaMeta.ext || '',
														activeMediaMeta.size && activeMediaMeta.size > 0
															? formatMediaBytes(activeMediaMeta.size)
															: '',
													]
														.filter(Boolean)
														.join(' · ')}
												</span>
											) : null}
										</button>
										<div className="flex shrink-0 items-center gap-0.5">
											<button
												type="button"
												data-rw-link-media-edit=""
												onMouseEnter={prefetchMediaRuntime}
												onFocus={prefetchMediaRuntime}
												onClick={() => {
													prefetchMediaRuntime();
													setInspectorTab('details');
												}}
												aria-label={t(
													'link.editMedia',
													{ name: activeMediaMeta.name },
													`Edit media details & alt text for ${activeMediaMeta.name}`
												)}
												title={t('link.editMediaDetails', 'Edit media (alt text, focal point & crop)')}
												className={cn(
													'relative inline-flex size-6 items-center justify-center rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
													hasMediaMetadata
														? 'text-primary hover:bg-primary/10'
														: 'text-muted-foreground hover:bg-muted hover:text-foreground'
												)}
											>
												<DynamicIcon name="sliders" className="size-3.5" />
												{hasMediaMetadata ? (
													<span
														aria-hidden="true"
														className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-primary"
													/>
												) : null}
											</button>
											{safePreviewHref ? (
												<a
													href={safePreviewHref}
													target="_blank"
													rel="noopener noreferrer"
													aria-label={t('link.openMedia', { name: activeMediaMeta.name }, `Open ${activeMediaMeta.name}`)}
													title={t('link.openMedia', { name: activeMediaMeta.name }, `Open ${activeMediaMeta.name}`)}
													className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
												>
													<DynamicIcon name="external-link" className="size-3.5" />
												</a>
											) : null}
											{!isDisabled ? (
												<>
													<button
														type="button"
														onClick={() => fileInputRef.current?.click()}
														aria-label={t(
															'link.replaceMedia',
															{ name: activeMediaMeta.name },
															`Replace ${activeMediaMeta.name}`
														)}
														title={t('link.replaceFile', 'Replace file')}
														className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
													>
														<DynamicIcon name="upload" className="size-3.5" />
													</button>
													<button
														type="button"
														onClick={() => {
															setInlineError(null);
															setInspectorTab(null);
															commit({
																file: '',
																url: '',
																alt: undefined,
																descriptions: undefined,
																focus: undefined,
																tags: undefined,
															});
														}}
														aria-label={t(
															'link.clearMedia',
															{ name: activeMediaMeta.name },
															`Remove ${activeMediaMeta.name}`
														)}
														title={t('link.removeFile', 'Remove file')}
														className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer"
													>
														<DynamicIcon name="x" className="size-3.5" />
													</button>
												</>
											) : null}
										</div>
									</>
								) : (
									<button
										type="button"
										disabled={isDisabled}
										onClick={() => {
											if (!isDisabled) {
												fileInputRef.current?.click();
											}
										}}
										aria-invalid={inlineError ? 'true' : 'false'}
										aria-describedby={inlineError ? errorId : undefined}
										className="flex h-full w-full min-w-0 items-center justify-between gap-2 text-left cursor-pointer focus-visible:outline-none disabled:cursor-not-allowed"
									>
										<span className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--button-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--button-fg)] transition-colors hover:bg-[var(--button-hover-bg)] hover:text-[var(--button-hover-fg)]">
											<DynamicIcon
												name={activeMediaProfile.icon || TYPE_ICONS[current.type] || 'upload'}
												className="size-3.5 shrink-0"
												aria-hidden="true"
											/>
											<span>{chooseMediaButtonLabel}</span>
										</span>
										{extensionsSummary ? (
											<span className="truncate font-mono text-[11px] text-muted-foreground">
												{extensionsSummary}
											</span>
										) : null}
										<span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground xl:inline-flex">
											<DynamicIcon name="upload-cloud" className="size-3" aria-hidden="true" />
											<span>{t('link.dropHint', 'Drop')}</span>
										</span>
									</button>
								)}
							</div>
						) : isRelationType ? (
							activeRelationId && !searchOpen ? (
								<div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-input-surface px-2.5 text-xs shadow-2xs">
									<button
										type="button"
										disabled={isDisabled}
										onClick={() => {
											if (!isDisabled) {
												setSearchOpen(true);
												window.requestAnimationFrame(() => searchInputRef.current?.focus());
											}
										}}
										className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer disabled:cursor-default"
									>
										<DynamicIcon
											name={selectedItem?.icon || TYPE_ICONS[current.type] || 'link-2'}
											className="size-3.5 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
										<span className="truncate font-medium text-foreground">
											{selectedItem?.label || `#${activeRelationId}`}
										</span>
										{selectedItem?.subtitle ? (
											<span className="hidden truncate font-mono text-[11px] text-muted-foreground lg:inline">
												{selectedItem.subtitle}
											</span>
										) : null}
									</button>
									{!isDisabled ? (
										<button
											type="button"
											onClick={() =>
												commit(
													current.type === 'page'
														? { pageId: 0 }
														: { entryId: '', entryType: '' }
												)
											}
											aria-label={t('link.clearTarget', 'Clear selected target')}
											className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
										>
											<DynamicIcon name="x" className="size-3.5" />
										</button>
									) : null}
								</div>
							) : (
								<div
									className={cn(
										'flex h-9 items-center gap-2 rounded-md border border-input bg-input-surface px-2.5 shadow-2xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
										inlineError && 'border-destructive',
										isDisabled && 'cursor-not-allowed opacity-55'
									)}
								>
									<DynamicIcon
										name={searchLoading ? 'loader-2' : TYPE_ICONS[current.type] || 'search'}
										className={cn(
											'size-3.5 shrink-0 text-muted-foreground',
											searchLoading && 'motion-safe:animate-spin'
										)}
										aria-hidden="true"
									/>
									<input
										ref={searchInputRef}
										id={props.id}
										type="text"
										data-rw-bare-input=""
										role="combobox"
										aria-label={
											current.type === 'entry'
												? t('link.searchEntries', 'Search entries')
												: t('link.searchPages', 'Search pages')
										}
										aria-expanded={searchOpen}
										aria-controls={listboxId}
										aria-autocomplete="list"
										aria-invalid={inlineError ? 'true' : 'false'}
										aria-describedby={inlineError ? errorId : undefined}
										autoCorrect="off"
										autoCapitalize="none"
										spellCheck={false}
										disabled={isDisabled}
										value={searchQuery}
										placeholder={props.placeholder || TYPE_PLACEHOLDERS[current.type] || 'Search...'}
										className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
										onFocus={() => {
											if (!isDisabled) {
												setSearchOpen(true);
											}
										}}
										onChange={(e) => {
											setSearchQuery(e.target.value);
											if (!searchOpen) {
												setSearchOpen(true);
											}
										}}
										onKeyDown={(e) => {
											if (e.nativeEvent.isComposing) {
												return;
											}
											if (e.key === 'ArrowDown') {
												e.preventDefault();
												if (!searchOpen) {
													setSearchOpen(true);
												} else if (searchResults.length > 0) {
													setHighlightedIdx((prev) => (prev + 1) % searchResults.length);
												}
											} else if (e.key === 'ArrowUp' && searchOpen && searchResults.length > 0) {
												e.preventDefault();
												setHighlightedIdx((prev) => (prev - 1 + searchResults.length) % searchResults.length);
											} else if (e.key === 'Enter' && searchOpen && searchResults[highlightedIdx]) {
												e.preventDefault();
												selectRelationItem(searchResults[highlightedIdx]);
											} else if (e.key === 'Escape' && searchOpen) {
												e.preventDefault();
												e.stopPropagation();
												setSearchOpen(false);
											}
										}}
									/>
									{activeRelationId && searchOpen ? (
										<button
											type="button"
											onClick={() => setSearchOpen(false)}
											aria-label={t('link.cancelSearch', 'Cancel search')}
											className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground cursor-pointer"
										>
											<DynamicIcon name="x" className="size-3.5" />
										</button>
									) : null}
								</div>
							)
						) : (
							<div
								className={cn(
									'flex h-9 items-center gap-2 rounded-md border border-input bg-input-surface px-2.5 shadow-2xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
									inlineError && 'border-destructive',
									isDisabled && 'cursor-not-allowed opacity-55'
								)}
							>
								<DynamicIcon
									name={
										current.type === 'url' && current.url.trim().startsWith('#')
											? 'hash'
											: TYPE_ICONS[current.type] || 'link-2'
									}
									className="size-3.5 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
								<input
									id={props.id}
									type={
										current.type === 'email'
											? 'email'
											: current.type === 'tel'
												? 'tel'
												: 'text'
									}
									inputMode={
										current.type === 'email'
											? 'email'
											: current.type === 'tel'
												? 'tel'
												: 'url'
									}
									autoComplete={
										current.type === 'email'
											? 'email'
											: current.type === 'tel'
												? 'tel'
												: 'off'
									}
									data-rw-bare-input=""
									aria-label={
										current.type === 'email'
											? t('link.emailTarget', 'Email address')
											: current.type === 'tel'
												? t('link.phoneTarget', 'Phone number')
												: t('link.urlTarget', 'Link URL or #anchor')
									}
									aria-invalid={inlineError ? 'true' : 'false'}
									aria-describedby={inlineError ? errorId : undefined}
									autoCorrect="off"
									autoCapitalize="none"
									spellCheck={false}
									disabled={isDisabled}
									value={current.url}
									placeholder={
										props.placeholder ||
										TYPE_PLACEHOLDERS[current.type] ||
										'https://...'
									}
									className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
									onChange={(e) => {
										const raw = e.target.value;
										if (current.type === 'tel') {
											const cleanTel = sanitizePhoneInput(raw, false);
											if (inlineError && validateScalarOnBlur('tel', cleanTel) === null) {
												setInlineError(null);
											}
											commit({ url: cleanTel });
										} else {
											if (inlineError && validateScalarOnBlur(current.type, raw) === null) {
												setInlineError(null);
											}
											commit({ url: raw });
										}
									}}
									onBlur={() => {
										if (current.type === 'tel' && current.url === '+') {
											commit({ url: '' });
											setInlineError(null);
											return;
										}
										setInlineError(validateScalarOnBlur(current.type, current.url));
									}}
								/>
								{current.url && !isDisabled ? (
									<button
										type="button"
										onClick={() => {
											setInlineError(null);
											commit({ url: '' });
										}}
										aria-label={t('link.clearUrl', 'Clear link target')}
										className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground cursor-pointer"
									>
										<DynamicIcon name="x" className="size-3.5" />
									</button>
								) : null}
							</div>
						)}
					</div>
				</div>

				{/* Standalone inline settings trigger when rendered outside SchemaForm */}
				{hasSecondaryOptions ? (
					<button
						ref={optionsBtnRef}
						type="button"
						disabled={isDisabled}
						aria-expanded={optionsOpen}
						aria-controls={optionsPanelId}
						aria-haspopup="dialog"
						aria-label={t(
							'form.openFieldSettings',
							{ field: props.label || props.name || 'Link' },
							'{field} settings'
						)}
						data-rw-inline-settings-trigger=""
						onClick={() => setOptionsOpen((prev) => !prev)}
						className={cn(
							'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
							optionsOpen
								? 'border-primary/60 bg-primary/12 text-foreground'
								: 'border-input bg-input-surface text-foreground/85 hover:bg-muted hover:text-foreground'
						)}
					>
						{optionSummaryChips.length > 0 ? (
							<span className="hidden max-w-44 truncate font-mono text-[10px] leading-none tracking-tight text-foreground sm:inline">
								{optionSummaryChips.join(' · ')}
							</span>
						) : null}
						{optionOverflowCount > 0 ? (
							<span
								data-rw-inline-settings-overflow=""
								className="hidden rounded border border-border/70 bg-background/80 px-1 py-0.5 font-mono text-[10px] leading-none text-foreground/85 sm:inline"
							>
								+{optionOverflowCount}
							</span>
						) : null}
						<DynamicIcon name="sliders-horizontal" className="size-3.5 shrink-0" />
					</button>
				) : null}
			</div>

			{showTextSubRow ? (
				<div
					data-rw-link-texts=""
					className="mt-2 rounded-md border border-border/70 bg-muted/20 p-2.5 space-y-2"
				>
					{hasMultiLang ? (
						<LanguageTabsBar
							languages={cfg.languages!}
							activeLangId={activeLang?.id ?? activeLangId}
							values={langPresenceValues}
							onSelect={(nextLangId) => {
								setActiveLangId(nextLangId);
								props.onSelectLanguage?.(nextLangId);
							}}
							ariaLabel={t('form.language', 'Language')}
							className="pb-1.5"
						/>
					) : null}
					<div
						className={cn(
							'grid gap-2.5',
							optionsMeta.flags.enableLabel && optionsMeta.flags.enableAriaLabel
								? 'grid-cols-1 sm:grid-cols-2'
								: 'grid-cols-1'
						)}
					>
						{optionsMeta.flags.enableLabel ? (
							<div className="space-y-1 min-w-0">
								<label
									htmlFor={`${props.id}__label`}
									className="block text-[11px] font-medium text-muted-foreground"
								>
									{t('link.labelInput', 'Link label')}
								</label>
								<Input
									id={`${props.id}__label`}
									data-rw-link-text-input="label"
									type="text"
									disabled={isDisabled || !isActiveLangEditable}
									readOnly={Boolean(props.readOnly)}
									className="h-8 text-xs"
									placeholder={t('link.labelPlaceholder', 'Link label (optional)')}
									value={getLocalizedLinkText(current.label, current.labels, activeLang)}
									onChange={(e) => {
										const next = setLocalizedLinkText(
											current.label,
											current.labels,
											activeLang,
											e.target.value,
											hasMultiLang
										);
										commit({ label: next.value, labels: next.map });
									}}
								/>
							</div>
						) : null}
						{optionsMeta.flags.enableAriaLabel ? (
							<div className="space-y-1 min-w-0">
								<label
									htmlFor={`${props.id}__ariaLabel`}
									className="block text-[11px] font-medium text-muted-foreground"
								>
									{t('link.ariaLabelAttribute', 'ARIA Label')}
								</label>
								<Input
									id={`${props.id}__ariaLabel`}
									data-rw-link-text-input="ariaLabel"
									type="text"
									disabled={isDisabled || !isActiveLangEditable}
									readOnly={Boolean(props.readOnly)}
									className="h-8 text-xs"
									placeholder={t('link.ariaLabelPlaceholder', 'Screen reader label (optional)')}
									value={getLocalizedLinkText(current.ariaLabel, current.ariaLabels, activeLang)}
									onChange={(e) => {
										const next = setLocalizedLinkText(
											current.ariaLabel,
											current.ariaLabels,
											activeLang,
											e.target.value,
											hasMultiLang
										);
										commit({ ariaLabel: next.value, ariaLabels: next.map });
									}}
								/>
							</div>
						) : null}
					</div>
				</div>
			) : null}

			<FieldStatusRow error={effectiveError} errorId={effectiveErrorId} />

			{/* Portaled relation search listbox */}
			{searchOpen && isRelationType ? (
				<PortalRoot anchor={searchWrapRef.current} ssrFallback={false}>
					<div
						ref={searchPanelRef}
						id={listboxId}
							role="listbox"
							data-rw-portal-overlay=""
							style={{
								position: 'fixed',
								top: searchPos.top,
								left: searchPos.left,
								width: searchPos.width,
								transform: searchPos.placement === 'top' ? 'translateY(-100%)' : undefined,
								zIndex: 9999,
							}}
							className="max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
						>
							{searchLoading && searchResults.length === 0 ? (
								<div className="px-3 py-2.5 text-xs text-muted-foreground">
									{t('link.searching', 'Searching...')}
								</div>
							) : searchResults.length === 0 ? (
								<div className="px-3 py-2.5 text-xs text-muted-foreground">
									{t('link.noResults', 'No matching items found.')}
								</div>
							) : (
								searchResults.map((item, idx) => {
									const isHighlighted = idx === highlightedIdx;
									return (
										<div
											key={`${item.resource}:${String(item.value)}`}
											role="option"
											aria-selected={String(item.value) === activeRelationId}
											onMouseEnter={() => setHighlightedIdx(idx)}
											onMouseDown={(e) => {
												e.preventDefault();
												selectRelationItem(item);
											}}
											className={cn(
												'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs cursor-pointer',
												isHighlighted ? 'bg-accent text-accent-foreground' : 'text-foreground'
											)}
										>
											<div className="flex min-w-0 items-center gap-2">
												<DynamicIcon
													name={item.icon || TYPE_ICONS[current.type] || 'file-text'}
													className="size-3.5 shrink-0 text-muted-foreground"
												/>
												<div className="min-w-0">
													<div className="truncate font-medium">{item.label}</div>
													{item.subtitle ? (
														<div className="truncate font-mono text-[10px] text-muted-foreground">
															{item.subtitle}
														</div>
													) : null}
												</div>
											</div>
											{item.badge ? (
												<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
													{item.badge}
												</span>
											) : null}
										</div>
									);
								})
							)}
							</div>
				</PortalRoot>
			) : null}

			{/* Standalone unified inline settings popover when outside SchemaForm */}
			{optionsOpen && hasSecondaryOptions ? (
				<PortalRoot anchor={optionsBtnRef.current} ssrFallback={false}>
					<div
						ref={optionsPanelRef}
							id={optionsPanelId}
							role="dialog"
							aria-modal="false"
							aria-labelledby={optionsHeadingId}
							tabIndex={-1}
							data-rw-portal-overlay=""
							data-rw-inline-settings-popover=""
							data-placement={optionsPos.placement}
							data-layout={useTwoColOptions && optionsPos.width >= 400 ? 'two-col' : 'single-col'}
							style={{
								position: 'fixed',
								top: optionsPos.top,
								left: optionsPos.left,
								width: optionsPos.width,
								maxHeight: optionsPos.maxHeight,
								transform: optionsPos.placement === 'top' ? 'translateY(-100%)' : undefined,
								zIndex: 9998,
							}}
							className="flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground focus:outline-none"
						>
							<div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
								<div className="flex min-w-0 items-center gap-1.5">
									<DynamicIcon
										name="sliders-horizontal"
										className="size-3.5 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
									<span id={optionsHeadingId} className="truncate text-xs font-semibold text-foreground">
										{t(
											'form.fieldSettingsTitle',
											{ field: props.label || props.name || 'Link' },
											'{field} Settings'
										)}
									</span>
									{modifiedOptionCount > 0 ? (
										<span
											data-rw-inline-settings-count=""
											title={t(
												'form.activeSettingsCount',
												{ count: modifiedOptionCount },
												'{count} customized'
											)}
											className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1.5 font-mono text-[10px] font-semibold tabular-nums text-primary"
										>
											{modifiedOptionCount}
										</span>
									) : null}
								</div>
								<div className="flex shrink-0 items-center gap-1">
									{modifiedOptionCount > 0 && !isDisabled && !optionsMeta.isTargetEmpty ? (
										<button
											type="button"
											onClick={() => {
												const resetPatch: Record<string, unknown> = {};
												for (const bf of optionsMeta.fields) {
													resetPatch[bf.name] = getNeutralSettingValue(bf);
												}
												commit(applyLinkSettingPatches(current, resetPatch, cfg));
											}}
											data-rw-inline-settings-reset=""
											className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<DynamicIcon name="rotate-ccw" className="size-3 shrink-0" aria-hidden="true" />
											<span>{t('common.reset', 'Reset')}</span>
										</button>
									) : null}
									<button
										type="button"
										onClick={() => {
											setOptionsOpen(false);
											optionsBtnRef.current?.focus();
										}}
										aria-label={t('form.closeFieldSettings', 'Close field settings')}
										className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<DynamicIcon name="x" className="size-3.5" aria-hidden="true" />
									</button>
								</div>
							</div>

							{optionsMeta.isTargetEmpty ? (
								<div
									role="status"
									data-rw-inline-settings-locked=""
									className="flex shrink-0 items-center gap-2 border-b border-border/80 bg-muted/45 px-3.5 py-2 text-[11px] leading-snug text-foreground/85"
								>
									<DynamicIcon name="lock" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
									<span>
										{t(
											'form.inlineSettingsLocked',
											{ field: props.label || props.name || 'Link' },
											'Controls unlock once "{field}" has a value.'
										)}
									</span>
								</div>
							) : null}

							<div
								data-rw-inline-settings-body=""
								className={cn(
									'flex-1 min-h-0 overflow-y-auto p-3.5',
									useTwoColOptions && optionsPos.width >= 400
										? 'grid grid-cols-2 gap-x-3 gap-y-2.5 items-start'
										: 'space-y-2.5'
								)}
							>
								{optionsMeta.fields.map((bf) => {
									const shortKey = bf.name.replace('__rw_link_opt__', '');
									const isTwoColActive = useTwoColOptions && optionsPos.width >= 400;
									const isFullWidth = isTwoColActive && !isCompactPopoverField(bf);
									const fieldInputId = `${optionsPanelId}_${shortKey}`;
									const isTechField =
										shortKey === 'rel' || shortKey === 'anchor' || shortKey === 'query';
									const fieldVal = String(optionsMeta.values[bf.name] ?? '');
									const fieldLocked = Boolean(isDisabled || bf.disabled);
									const selectOpts = Array.isArray(bf.options) ? bf.options : [];
									return (
										<div
											key={bf.name}
											data-field-name={bf.name}
											className={cn('space-y-1.5 min-w-0', isFullWidth && 'col-span-2')}
										>
											<label
												htmlFor={fieldInputId}
												data-rw-field-slot="label"
												className="block text-xs font-semibold tracking-tight text-foreground"
											>
												{bf.label}
											</label>
											<div data-rw-field-slot="input">
												{bf.type === 'select' ? (
													<Select
														id={fieldInputId}
														value={fieldVal || '_self'}
														disabled={fieldLocked}
														className="h-8 text-xs"
														onChange={(e) =>
															commit(
																applyLinkSettingPatches(
																	current,
																	{ [bf.name]: e.target.value },
																	cfg
																)
															)
														}
													>
														{selectOpts.map((opt) => (
															<option key={String(opt.value)} value={String(opt.value)}>
																{opt.label}
															</option>
														))}
													</Select>
												) : (
													<Input
														id={fieldInputId}
														type="text"
														autoCorrect={isTechField ? 'off' : undefined}
														autoCapitalize={isTechField ? 'none' : undefined}
														spellCheck={isTechField ? false : undefined}
														disabled={fieldLocked}
														value={fieldVal}
														className="h-8 text-xs"
														placeholder={bf.placeholder}
														onChange={(e) =>
															commit(
																applyLinkSettingPatches(
																	current,
																	{ [bf.name]: e.target.value },
																	cfg
																)
															)
														}
													/>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>
				</PortalRoot>
			) : null}

			{activeMediaProfile && studioMediaItem && inspectorTab !== null && MediaInspectorSheet ? (
				<MediaInspectorSheet
					open={true}
					item={studioMediaItem}
					itemIndex={0}
					totalItems={1}
					isImage={Boolean(activeMediaProfile.isImage)}
					isLocked={isDisabled}
					descriptionRows={2}
					useTags={false}
					noUpload={isDisabled}
					focusMode={activeMediaProfile.isImage ? 'zoom' : 'off'}
					useImageEditor={Boolean(
						activeMediaProfile.isImage &&
							activeMediaProfile.mediaToken &&
							studioMediaItem.ext !== 'svg'
					)}
					mediaEndpoint={cfg.mediaEndpoint}
					mediaToken={activeMediaProfile.mediaToken || undefined}
					clientOwnerId={cfg.ownerId || undefined}
					clientInputName={props.name || undefined}
					languages={cfg.languages}
					activeLangId={activeLangId}
					initialTab={inspectorTab || 'details'}
					onSelectLang={setActiveLangId}
					onOpenChange={(nextOpen: boolean) => {
						if (!nextOpen) {
							setInspectorTab(null);
						}
					}}
					onNavigateItem={() => {}}
					onUpdateDescription={handleUpdateMediaDescription}
					onUpdateTags={handleUpdateMediaTags}
					onUpdateFocus={handleUpdateMediaFocus}
					onUpdateCustomValue={() => {}}
					onTriggerReplace={
						!isDisabled
							? () => {
									setInspectorTab(null);
									fileInputRef.current?.click();
								}
							: undefined
					}
					onToggleDelete={() => {
						setInspectorTab(null);
						setInlineError(null);
						commit({
							file: '',
							url: '',
							alt: undefined,
							descriptions: undefined,
							focus: undefined,
							tags: undefined,
						});
					}}
					onItemMutatedFromServer={handleMediaMutatedFromServer}
				/>
			) : null}
		</div>
	);
}
