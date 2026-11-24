import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
	badgeRadiusCssValue,
	clampIconSize,
	clampIconStrokeWidth,
	formatIconLabel,
	ICON_BG_SWATCHES,
	ICON_COLOR_SWATCHES,
	ICON_RADIUS_OPTIONS,
	ICON_SIZE_PRESETS,
	ICON_STROKE_PRESETS,
	type IconBadgeRadius,
	type IconCatalogEntry,
	type IconCatalogRuntime,
	type IconCategoryOption,
	type IconCustomizationFlags,
	type IconVariant,
	normalizeIconValue,
	type NormalizedIconValue,
	resolveIconCustomizationFlags,
	sanitizeIconColor,
	sanitizeIconRadius,
	sanitizeIconVariant,
	serializeIconValueForInput,
	type SvgNodeTuple,
} from '../../icons/iconTypes';
import { useTranslations } from '../../lib/i18n';
import { cn, CORE_UI_ICON_NODES, DynamicIcon, subscribeIconCatalog } from '../../lib/utils';
import { Badge, Button, Input, PortalRoot } from '../../ui';
import { dispatchDomChange } from '../shared';
import type { IconFieldConfig, ReactInputfieldProps } from '../types';

const QUERY_PAGE_SIZE = 96;

interface FloatingRect {
	top: number;
	left: number;
	width: number;
	placement: 'bottom' | 'top';
}

function computePopoverRect(
	anchor: HTMLElement | null,
	preferredWidth = 376,
	estimatedHeight = 440
): FloatingRect {
	if (!anchor || typeof window === 'undefined') {
		return { top: 0, left: 0, width: preferredWidth, placement: 'bottom' };
	}
	const rect = anchor.getBoundingClientRect();
	const gap = 6;
	const margin = 12;
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const spaceBelow = vh - rect.bottom - margin;
	const spaceAbove = rect.top - margin;
	const flipTop = spaceBelow < estimatedHeight + gap && spaceAbove > spaceBelow;
	const width = Math.min(preferredWidth, Math.max(280, vw - margin * 2));
	const left = Math.max(margin, Math.min(rect.left, vw - width - margin));
	const top = flipTop ? Math.max(margin, rect.top - gap) : rect.bottom + gap;
	return {
		top,
		left,
		width,
		placement: flipTop ? 'top' : 'bottom',
	};
}

function getCatalogRuntime(): IconCatalogRuntime | null {
	if (typeof window === 'undefined') {
		return null;
	}
	const w = window as unknown as {
		ProcessWireIcons?: IconCatalogRuntime;
	};
	return w.ProcessWireIcons ?? null;
}

function triggerRuntimeIconsLoad(): void {
	if (typeof window === 'undefined') {
		return;
	}
	const w = window as unknown as {
		ReactWorkspaceRuntime?: { ensureIconsLoaded?: () => Promise<void> };
	};
	if (typeof w.ReactWorkspaceRuntime?.ensureIconsLoaded === 'function') {
		void w.ReactWorkspaceRuntime.ensureIconsLoaded();
	}
}

function renderTupleNodes(tuples: SvgNodeTuple[]): React.ReactNode {
	return tuples.map((tuple, idx) => {
		const [tag, attrs] = tuple;
		const cleanAttrs: Record<string, string> = {};
		for (const [k, v] of Object.entries(attrs)) {
			if (k !== 'key') {
				cleanAttrs[k] = v;
			}
		}
		return React.createElement(tag, { key: idx, ...cleanAttrs });
	});
}

function CatalogGlyph({
	entry,
	preferFilled,
}: {
	entry: IconCatalogEntry;
	preferFilled: boolean;
}): React.ReactElement {
	const useFilled = preferFilled && entry.hasFilled && Array.isArray(entry.filled) && entry.filled.length > 0;
	if (useFilled && entry.filled) {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width={22}
				height={22}
				viewBox="0 0 24 24"
				fill="currentColor"
				stroke="none"
				className="size-[22px] shrink-0"
				aria-hidden="true"
				focusable="false"
			>
				{renderTupleNodes(entry.filled)}
			</svg>
		);
	}
	if (entry.outline.length > 0) {
		return (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width={22}
				height={22}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={1.85}
				strokeLinecap="round"
				strokeLinejoin="round"
				className="size-[22px] shrink-0"
				aria-hidden="true"
				focusable="false"
			>
				{renderTupleNodes(entry.outline)}
			</svg>
		);
	}
	return <DynamicIcon name={entry.name} className="size-[22px]" />;
}

function buildFallbackItems(searchQuery: string): IconCatalogEntry[] {
	const q = searchQuery.trim().toLowerCase();
	const names = Object.keys(CORE_UI_ICON_NODES).sort();
	const filtered = q ? names.filter((n) => n.includes(q) || formatIconLabel(n).toLowerCase().includes(q)) : names;
	return filtered.map((name) => ({
		name,
		label: formatIconLabel(name),
		category: '',
		hasFilled: false,
		outline: CORE_UI_ICON_NODES[name] ?? [],
	}));
}

export interface IconFieldStandaloneProps extends Partial<ReactInputfieldProps> {
	isIslandHost?: boolean;
	props?: Record<string, unknown>;
	onChange?: (next: NormalizedIconValue | string) => void;
}

export function IconFieldControl(rawProps: IconFieldStandaloneProps): React.ReactElement {
	const unwrapped = useMemo(() => {
		const base: Record<string, unknown> =
			rawProps.props && typeof rawProps.props === 'object'
				? { ...rawProps, ...rawProps.props }
				: { ...rawProps };
		if (base.props && typeof base.props === 'object' && base.props !== rawProps.props) {
			return { ...base, ...(base.props as Record<string, unknown>) };
		}
		return base;
	}, [rawProps]);

	const inputName = String(unwrapped.name || '');
	const inputId = String(unwrapped.id || (inputName ? `Inputfield_${inputName}` : 'pw_icon'));
	const isReadOnly = Boolean(rawProps.readOnly || unwrapped.readOnly);
	const isDisabled = Boolean(rawProps.disabled || unwrapped.disabled || isReadOnly);
	const rawIconCfg = (unwrapped.iconConfig as IconFieldConfig | undefined) ?? {
		allowCustomization: Boolean(unwrapped.allowCustomization),
		allowVariant: unwrapped.allowVariant as boolean | undefined,
		allowSize: unwrapped.allowSize as boolean | undefined,
		allowColor: unwrapped.allowColor as boolean | undefined,
		allowStrokeWidth: unwrapped.allowStrokeWidth as boolean | undefined,
		allowBackground: unwrapped.allowBackground as boolean | undefined,
		previewSize: typeof unwrapped.previewSize === 'number' ? unwrapped.previewSize : undefined,
		prefixMode: unwrapped.iconPrefixMode as 'none' | 'vector' | 'fa' | undefined,
		endpoint: typeof unwrapped.endpoint === 'string' ? unwrapped.endpoint : undefined,
		totalIcons: typeof unwrapped.totalIcons === 'number' ? unwrapped.totalIcons : undefined,
	};
	const flags = resolveIconCustomizationFlags(rawIconCfg);

	if (isReadOnly && rawProps.isIslandHost) {
		const norm = normalizeIconValue(unwrapped.value);
		if (!norm.name) {
			return (
				<Badge variant="outline" className="text-muted-foreground" data-rw-control="icon">
					—
				</Badge>
			);
		}
		return (
			<div className="inline-flex items-center gap-2" data-rw-control="icon">
				<DynamicIcon value={flags.allowCustomization ? norm : { name: norm.name, variant: norm.variant }} size={norm.size || 20} />
				<span className="text-xs font-medium text-foreground">{formatIconLabel(norm.name)}</span>
			</div>
		);
	}

	return (
		<IconField
			controlType="icon"
			id={inputId}
			name={inputName}
			scopePrefix={typeof unwrapped.scopePrefix === 'string' ? unwrapped.scopePrefix : undefined}
			value={unwrapped.value}
			placeholder={typeof unwrapped.placeholder === 'string' ? unwrapped.placeholder : undefined}
			required={Boolean(unwrapped.required)}
			disabled={isDisabled}
			readOnly={isReadOnly}
			error={typeof unwrapped.error === 'string' ? unwrapped.error : undefined}
			errorId={typeof unwrapped.errorId === 'string' ? unwrapped.errorId : undefined}
			describedBy={typeof unwrapped.describedBy === 'string' ? unwrapped.describedBy : undefined}
			iconConfig={rawIconCfg}
			onValueChange={(fieldName, nextVal) => {
				if (typeof unwrapped.onValueChange === 'function') {
					(unwrapped.onValueChange as (n: string, v: unknown) => void)(fieldName, nextVal);
				}
				rawProps.onChange?.(nextVal as NormalizedIconValue | string);
			}}
			{...(rawProps.isIslandHost ? ({ __isIslandHost: true } as Record<string, unknown>) : {})}
		/>
	);
}

export function IconField(props: ReactInputfieldProps & { __isIslandHost?: boolean }): React.ReactElement {
	const { t } = useTranslations();
	const uid = useId();
	const rootRef = useRef<HTMLDivElement | null>(null);
	const triggerBoxRef = useRef<HTMLDivElement | null>(null);
	const triggerBtnRef = useRef<HTMLButtonElement | null>(null);
	const popoverRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const hiddenInputRef = useRef<HTMLInputElement | null>(null);

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

	const flags: IconCustomizationFlags = useMemo(
		() => resolveIconCustomizationFlags(props.iconConfig),
		[props.iconConfig]
	);
	const prefixMode: 'none' | 'vector' | 'fa' = props.iconConfig?.prefixMode ?? 'none';
	const previewSize = clampIconSize(props.iconConfig?.previewSize, 20);
	const endpoint = props.iconConfig?.endpoint;
	const configuredTotalIcons = props.iconConfig?.totalIcons ?? 0;
	const isDisabled = Boolean(props.disabled || props.readOnly);
	const canSelectFilled = !flags.allowCustomization || flags.allowVariant;

	const [current, setCurrent] = useState<NormalizedIconValue>(() => normalizeIconValue(props.value));
	const [isOpen, setIsOpen] = useState<boolean>(false);
	const [activeTab, setActiveTab] = useState<'icons' | 'appearance'>('icons');
	const [searchQuery, setSearchQuery] = useState<string>('');
	const [debouncedQuery, setDebouncedQuery] = useState<string>('');
	const [activeCategory, setActiveCategory] = useState<string>('all');
	const [styleFilter, setStyleFilter] = useState<'all' | 'outline' | 'filled'>('all');

	const [categories, setCategories] = useState<IconCategoryOption[]>([]);
	const [popularItems, setPopularItems] = useState<IconCatalogEntry[]>([]);
	const [serverItems, setServerItems] = useState<IconCatalogEntry[] | null>(null);
	const [totalMatched, setTotalMatched] = useState<number>(configuredTotalIcons);
	const [hasMore, setHasMore] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

	const [popoverRect, setPopoverRect] = useState<FloatingRect>({
		top: 0,
		left: 0,
		width: 376,
		placement: 'bottom',
	});
	const [catalogTick, setCatalogTick] = useState<number>(0);

	useEffect(() => {
		const next = normalizeIconValue(props.value);
		setCurrent((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
	}, [props.value]);

	useEffect(() => {
		const unsub = subscribeIconCatalog(() => setCatalogTick((n) => n + 1));
		if (!getCatalogRuntime()) {
			triggerRuntimeIconsLoad();
		}
		return unsub;
	}, []);

	// Debounce search input for responsive typing
	useEffect(() => {
		const trimmed = searchQuery.trim();
		if (trimmed === '') {
			setDebouncedQuery('');
			return;
		}
		const timer = setTimeout(() => {
			setDebouncedQuery(trimmed);
		}, 110);
		return () => clearTimeout(timer);
	}, [searchQuery]);

	const catalog = getCatalogRuntime();

	const resolvedCanonicalName = useMemo(() => {
		if (!current.name) {
			return '';
		}
		if (catalog) {
			return catalog.resolveAlias(current.name) || current.name;
		}
		return current.name;
	}, [catalog, current.name]);

	// Hydrate selected icon when rendered outside the open picker
	useEffect(() => {
		if (resolvedCanonicalName && catalog) {
			catalog.requestHydration(resolvedCanonicalName);
		}
	}, [resolvedCanonicalName, catalog, catalogTick]);

	const selectedCachedEntry = useMemo(
		() => (resolvedCanonicalName && catalog ? catalog.getCachedIcon(resolvedCanonicalName) : null),
		[resolvedCanonicalName, catalog, catalogTick]
	);

	// Query server icon catalog whenever popover is open on the Icons tab
	useEffect(() => {
		if (!isOpen || activeTab !== 'icons' || !catalog) {
			return;
		}
		const controller = new AbortController();
		setIsLoading(true);
		const effectiveStyle = canSelectFilled ? styleFilter : 'outline';

		catalog
			.queryIcons({
				q: debouncedQuery,
				category: activeCategory,
				style: effectiveStyle,
				offset: 0,
				limit: QUERY_PAGE_SIZE,
				includeMeta: categories.length === 0,
				endpoint,
				signal: controller.signal,
			})
			.then((res) => {
				if (controller.signal.aborted) {
					return;
				}
				if (Array.isArray(res.categories) && res.categories.length > 0) {
					setCategories(res.categories);
				}
				if (Array.isArray(res.popular)) {
					setPopularItems(res.popular);
				}
				setServerItems(res.items);
				setTotalMatched(res.total);
				setHasMore(res.hasMore);
				setIsLoading(false);
			})
			.catch(() => {
				if (!controller.signal.aborted) {
					setIsLoading(false);
				}
			});

		return () => {
			controller.abort();
		};
	}, [
		isOpen,
		activeTab,
		catalog,
		debouncedQuery,
		activeCategory,
		styleFilter,
		canSelectFilled,
		endpoint,
		categories.length,
	]);

	const loadNextPage = useCallback(() => {
		if (!catalog || !hasMore || isLoading || isLoadingMore || !serverItems) {
			return;
		}
		setIsLoadingMore(true);
		const effectiveStyle = canSelectFilled ? styleFilter : 'outline';
		void catalog
			.queryIcons({
				q: debouncedQuery,
				category: activeCategory,
				style: effectiveStyle,
				offset: serverItems.length,
				limit: QUERY_PAGE_SIZE,
				endpoint,
			})
			.then((res) => {
				setServerItems((prev) => {
					const existing = new Set((prev ?? []).map((i) => i.name));
					const appended = res.items.filter((i) => !existing.has(i.name));
					return [...(prev ?? []), ...appended];
				});
				setHasMore(res.hasMore);
				setTotalMatched(res.total);
			})
			.catch(() => {
				// Ignore transient pagination error
			})
			.finally(() => {
				setIsLoadingMore(false);
			});
	}, [
		catalog,
		hasMore,
		isLoading,
		isLoadingMore,
		serverItems,
		canSelectFilled,
		styleFilter,
		debouncedQuery,
		activeCategory,
		endpoint,
	]);

	const commit = useCallback(
		(patch: Partial<NormalizedIconValue>) => {
			if (isDisabled) {
				return;
			}
			setCurrent((prev) => {
				const next: NormalizedIconValue = {
					...prev,
					...patch,
				};
				next.variant = sanitizeIconVariant(next.variant, 'outline');
				next.size = clampIconSize(next.size, 24);
				next.strokeWidth = clampIconStrokeWidth(next.strokeWidth, 2);
				next.color = sanitizeIconColor(next.color);
				next.background = sanitizeIconColor(next.background);
				next.radius = sanitizeIconRadius(next.radius, 'md');

				const serialized = serializeIconValueForInput(next, flags, prefixMode);
				const emittedValue = flags.allowCustomization ? (next.name ? next : '') : serialized;
				props.onValueChange?.(props.name, emittedValue);

				if (typeof window !== 'undefined' && hiddenInputRef.current) {
					window.requestAnimationFrame(() => dispatchDomChange(hiddenInputRef.current));
				}
				return next;
			});
		},
		[flags, isDisabled, prefixMode, props]
	);

	// Position floating popover relative to the unified h-10 trigger box
	useEffect(() => {
		if (!isOpen || typeof window === 'undefined') {
			return;
		}
		triggerRuntimeIconsLoad();
		const updateRect = () => {
			setPopoverRect(computePopoverRect(triggerBoxRef.current ?? triggerBtnRef.current, 376, 440));
		};
		updateRect();
		const raf = window.requestAnimationFrame(() => {
			if (activeTab === 'icons') {
				searchInputRef.current?.focus();
			}
		});
		window.addEventListener('resize', updateRect);
		window.addEventListener('scroll', updateRect, true);
		return () => {
			window.cancelAnimationFrame(raf);
			window.removeEventListener('resize', updateRect);
			window.removeEventListener('scroll', updateRect, true);
		};
	}, [isOpen, activeTab]);

	// Close picker on outside click or Escape
	useEffect(() => {
		if (!isOpen || typeof document === 'undefined') {
			return;
		}
		const onPointerDown = (ev: MouseEvent) => {
			const target = ev.target as Node | null;
			if (!target) {
				return;
			}
			if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) {
				return;
			}
			setIsOpen(false);
		};
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.key === 'Escape') {
				ev.stopPropagation();
				setIsOpen(false);
				triggerBtnRef.current?.focus();
			}
		};
		document.addEventListener('mousedown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [isOpen]);

	const displayedItems = useMemo(() => {
		if (serverItems !== null) {
			return serverItems;
		}
		return buildFallbackItems(searchQuery);
	}, [serverItems, searchQuery]);

	const showPopularSection =
		searchQuery.trim() === '' &&
		activeCategory === 'all' &&
		styleFilter !== 'filled' &&
		popularItems.length > 0;

	const handleGridScroll = useCallback(
		(ev: React.UIEvent<HTMLDivElement>) => {
			const el = ev.currentTarget;
			if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
				loadNextPage();
			}
		},
		[loadNextPage]
	);

	const hasCustomOverrides =
		flags.allowCustomization &&
		Boolean(
			current.name &&
				((flags.allowVariant && current.variant !== 'outline') ||
					(flags.allowSize && current.size !== 24) ||
					(flags.allowStrokeWidth && current.strokeWidth !== 2) ||
					(flags.allowColor && current.color !== '') ||
					(flags.allowBackground && (current.background !== '' || current.radius !== 'md')))
		);

	const scopedName = props.scopePrefix ? `${props.scopePrefix}${props.name}` : props.name;
	const serializedHidden = serializeIconValueForInput(current, flags, prefixMode);
	const dialogId = `${uid}_icon_picker`;
	const studioId = `${uid}_icon_studio`;
	const displayLabel = resolvedCanonicalName ? formatIconLabel(resolvedCanonicalName) : '';
	const searchCountNumber = totalMatched > 0 ? totalMatched : configuredTotalIcons;
	const searchPlaceholderText =
		searchCountNumber > 0
			? t('icon.searchCountPlaceholder', 'Search {count} icons').replace(
					'{count}',
					String(searchCountNumber)
				)
			: t('icon.searchPlaceholder', 'Search icons...');

	const handleSelectEntry = useCallback(
		(entry: IconCatalogEntry, closeImmediately = false) => {
			let nextVariant: IconVariant = current.variant;
			if (!canSelectFilled) {
				nextVariant = 'outline';
			} else if (styleFilter === 'filled' && entry.hasFilled) {
				nextVariant = 'filled';
			} else if (styleFilter === 'outline') {
				nextVariant = 'outline';
			} else if (nextVariant === 'filled' && !entry.hasFilled) {
				nextVariant = 'outline';
			}

			commit({ name: entry.name, variant: nextVariant });
			if (!flags.allowCustomization || closeImmediately) {
				setIsOpen(false);
				triggerBtnRef.current?.focus();
			}
		},
		[canSelectFilled, commit, current.variant, flags.allowCustomization, styleFilter]
	);

	const renderIconCell = (entry: IconCatalogEntry, keyPrefix: string) => {
		const isSelected = resolvedCanonicalName === entry.name;
		const preferFilled =
			styleFilter === 'filled' ||
			(styleFilter === 'all' && isSelected && current.variant === 'filled');

		return (
			<button
				key={`${keyPrefix}_${entry.name}`}
				type="button"
				title={entry.label || formatIconLabel(entry.name)}
				aria-label={entry.name}
				aria-pressed={isSelected}
				onClick={() => handleSelectEntry(entry, false)}
				onDoubleClick={() => handleSelectEntry(entry, true)}
				className={cn(
					'flex aspect-square items-center justify-center rounded-md border transition-colors',
					isSelected
						? 'border-foreground bg-muted text-foreground ring-1 ring-foreground'
						: 'border-transparent text-foreground/90 hover:border-border hover:bg-muted/70 hover:text-foreground'
				)}
			>
				<CatalogGlyph entry={entry} preferFilled={preferFilled} />
			</button>
		);
	};

	const canToggleSelectedFilled =
		flags.allowVariant && Boolean(selectedCachedEntry?.hasFilled || current.variant === 'filled');

	return (
		<div ref={rootRef} className="w-full" data-rw-control="icon">
			{!isIslandHost && scopedName && !props.inlinePortal ? (
				<input
					ref={hiddenInputRef}
					type="hidden"
					id={props.id}
					name={scopedName}
					value={serializedHidden}
				/>
			) : null}

			<div
				ref={triggerBoxRef}
				className={cn(
					'flex h-10 w-full items-center rounded-md border border-border bg-[var(--input-surface,var(--background))] px-2.5 text-sm transition-colors',
					!isDisabled && 'hover:border-foreground/30 focus-within:ring-2 focus-within:ring-ring',
					isDisabled && 'cursor-not-allowed opacity-60'
				)}
			>
				<button
					ref={triggerBtnRef}
					type="button"
					disabled={isDisabled}
					aria-haspopup="dialog"
					aria-expanded={isOpen}
					aria-controls={isOpen ? dialogId : undefined}
					aria-label={
						displayLabel
							? `${t('icon.selected', 'Selected icon')}: ${displayLabel}`
							: t('icon.selectPlaceholder', 'Select an icon...')
					}
					onClick={() => {
						if (!isDisabled) {
							setActiveTab('icons');
							setIsOpen((prev) => !prev);
						}
					}}
					className="flex h-full min-w-0 flex-1 items-center justify-between gap-2 text-left focus:outline-none"
				>
					<span className="flex min-w-0 items-center gap-2.5">
						{resolvedCanonicalName ? (
							<>
								<span className="flex shrink-0 items-center justify-center">
									<DynamicIcon
										value={
											flags.allowCustomization
												? {
														...current,
														name: resolvedCanonicalName,
														size: Math.min(22, current.size),
													}
												: {
														name: resolvedCanonicalName,
														variant: current.variant,
													}
										}
										size={
											flags.allowCustomization
												? Math.min(22, current.size)
												: Math.min(22, previewSize)
										}
									/>
								</span>
								<span className="truncate text-sm font-medium text-foreground">
									{displayLabel}
								</span>
							</>
						) : (
							<>
								<DynamicIcon name="shapes" className="size-4 shrink-0 text-muted-foreground" />
								<span className="truncate text-sm text-muted-foreground">
									{props.placeholder || t('icon.selectPlaceholder', 'Select an icon...')}
								</span>
							</>
						)}
					</span>
					<DynamicIcon
						name={isOpen ? 'chevron-up' : 'chevron-down'}
						className="pointer-events-none size-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
				</button>

				<div className="flex shrink-0 items-center gap-0.5 pl-1">
					{flags.allowCustomization && resolvedCanonicalName && !isDisabled ? (
						<button
							type="button"
							aria-label={t('icon.customize', 'Customize')}
							title={t('icon.customize', 'Customize')}
							data-rw-icon-customize-btn="true"
							onClick={(e) => {
								e.stopPropagation();
								if (isOpen && activeTab === 'appearance') {
									setIsOpen(false);
								} else {
									setActiveTab('appearance');
									setIsOpen(true);
								}
							}}
							className={cn(
								'relative inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
								isOpen && activeTab === 'appearance' && 'bg-muted text-foreground'
							)}
						>
							<DynamicIcon name="sliders" className="size-3.5" />
							{hasCustomOverrides ? (
								<span
									className="absolute right-1 top-1 size-1.5 rounded-full bg-foreground"
									aria-hidden="true"
								/>
							) : null}
						</button>
					) : null}

					{resolvedCanonicalName && !isDisabled ? (
						<button
							type="button"
							aria-label={t('icon.clear', 'Clear icon')}
							title={t('icon.clear', 'Clear icon')}
							onClick={(e) => {
								e.stopPropagation();
								commit({ name: '', variant: 'outline' });
								setActiveTab('icons');
							}}
							className="inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
						>
							<DynamicIcon name="x" className="size-3.5" />
						</button>
					) : null}
				</div>
			</div>

			{isOpen ? (
				<PortalRoot anchor={rootRef.current} ssrFallback={false}>
					<div
						ref={popoverRef}
						id={dialogId}
							role="dialog"
							aria-label={t('icon.pickerTitle', 'Icons')}
							data-rw-icon-popover="true"
							data-rw-portal-overlay=""
							style={{
								position: 'fixed',
								top:
									popoverRect.placement === 'top'
										? undefined
										: `${popoverRect.top}px`,
								bottom:
									popoverRect.placement === 'top'
										? `${window.innerHeight - popoverRect.top}px`
										: undefined,
								left: `${popoverRect.left}px`,
								width: `${popoverRect.width}px`,
								zIndex: 99990,
							}}
							className="overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
						>
							{/* Row 1: Header Bar */}
							<div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
								<span className="text-sm font-semibold tracking-tight text-foreground">
									{t('icon.pickerTitle', 'Icons')}
								</span>

								<div className="flex items-center gap-1.5">
									{flags.allowCustomization ? (
										<div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5">
											<button
												type="button"
												data-rw-icon-tab="icons"
												onClick={() => setActiveTab('icons')}
												className={cn(
													'rounded px-2 py-0.5 text-[11px] font-medium',
													activeTab === 'icons'
														? 'bg-foreground text-background'
														: 'text-muted-foreground hover:text-foreground'
												)}
											>
												{t('icon.tabIcons', 'Icons')}
											</button>
											<button
												type="button"
												data-rw-icon-tab="appearance"
												disabled={!resolvedCanonicalName}
												onClick={() => {
													if (resolvedCanonicalName) {
														setActiveTab('appearance');
													}
												}}
												className={cn(
													'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium',
													activeTab === 'appearance'
														? 'bg-foreground text-background'
														: 'text-muted-foreground hover:text-foreground',
													!resolvedCanonicalName && 'cursor-not-allowed opacity-45'
												)}
											>
												<span>{t('icon.tabAppearance', 'Appearance')}</span>
												{hasCustomOverrides ? (
													<span
														className={cn(
															'size-1.5 rounded-full',
															activeTab === 'appearance' ? 'bg-background' : 'bg-foreground'
														)}
														aria-hidden="true"
													/>
												) : null}
											</button>
										</div>
									) : null}

									<button
										type="button"
										aria-label={t('common.close', 'Close')}
										onClick={() => {
											setIsOpen(false);
											triggerBtnRef.current?.focus();
										}}
										className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									>
										<DynamicIcon name="x" className="size-4" />
									</button>
								</div>
							</div>

							{activeTab === 'icons' ? (
								<>
									{/* Row 2: Full-bleed Search Row */}
									<div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2">
										<DynamicIcon
											name="search"
											className="size-4 shrink-0 text-muted-foreground"
										/>
										<input
											ref={searchInputRef}
											type="search"
											value={searchQuery}
											aria-label={searchPlaceholderText}
											placeholder={searchPlaceholderText}
											onChange={(e) => setSearchQuery(e.target.value)}
											className="h-6 w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
										/>
									</div>

									{/* Row 3: Two-Select Filter Sub-Toolbar */}
									<div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-1.5">
										<select
											aria-label={t('icon.categoryFilter', 'Category')}
											data-rw-icon-category="true"
											value={activeCategory}
											onChange={(e) => setActiveCategory(e.target.value)}
											className="h-7 max-w-[62%] cursor-pointer truncate rounded bg-transparent pr-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
										>
											<option value="all" className="bg-popover text-popover-foreground">
												{t('icon.allCategories', 'All categories')}
											</option>
											{categories.map((cat) => (
												<option
													key={cat.id}
													value={cat.id}
													className="bg-popover text-popover-foreground"
												>
													{cat.label} ({cat.count})
												</option>
											))}
										</select>

										{canSelectFilled ? (
											<select
												aria-label={t('icon.styleFilter', 'Style')}
												data-rw-icon-style="true"
												value={styleFilter}
												onChange={(e) =>
													setStyleFilter(e.target.value as 'all' | 'outline' | 'filled')
												}
												className="h-7 cursor-pointer rounded bg-transparent text-right text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
											>
												<option value="all" className="bg-popover text-popover-foreground">
													{t('icon.styleAll', 'All styles')}
												</option>
												<option value="outline" className="bg-popover text-popover-foreground">
													{t('icon.styleOutline', 'Outline')}
												</option>
												<option value="filled" className="bg-popover text-popover-foreground">
													{t('icon.styleFilled', 'Filled')}
												</option>
											</select>
										) : null}
									</div>

									{/* Row 4: Spacious 6-Column Icon Grid */}
									<div
										onScroll={handleGridScroll}
										className="max-h-72 overflow-y-auto p-3"
									>
										{displayedItems.length === 0 && !isLoading ? (
											<div className="py-10 text-center text-xs text-muted-foreground">
												{t('icon.noMatches', 'No matching icons found.')}
											</div>
										) : (
											<>
												{showPopularSection ? (
													<div className="mb-3">
														<div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
															{t('icon.popular', 'Popular')}
														</div>
														<div className="grid grid-cols-6 gap-1.5">
															{popularItems.map((entry) =>
																renderIconCell(entry, 'pop')
															)}
														</div>
													</div>
												) : null}

												{showPopularSection ? (
													<div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
														{t('icon.allIcons', 'All icons')}
													</div>
												) : null}

												<div className="grid grid-cols-6 gap-1.5">
													{displayedItems.map((entry) =>
														renderIconCell(entry, 'all')
													)}
												</div>

												{isLoadingMore ? (
													<div className="py-2 text-center text-[11px] text-muted-foreground">
														{t('common.loading', 'Loading...')}
													</div>
												) : null}
											</>
										)}
									</div>

									{/* Compact Contextual Footer when customization is enabled & an icon is selected */}
									{flags.allowCustomization && resolvedCanonicalName ? (
										<div className="flex items-center justify-between gap-2 border-t border-border bg-muted/25 px-3.5 py-2 text-xs">
											<div className="flex min-w-0 items-center gap-2">
												<DynamicIcon
													value={{ ...current, name: resolvedCanonicalName, size: 18 }}
													size={18}
												/>
												<span className="truncate font-medium text-foreground">
													{displayLabel}
												</span>
											</div>
											<div className="flex shrink-0 items-center gap-1.5">
												<button
													type="button"
													onClick={() => setActiveTab('appearance')}
													className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
												>
													{t('icon.customize', 'Customize')}
												</button>
												<button
													type="button"
													onClick={() => {
														setIsOpen(false);
														triggerBtnRef.current?.focus();
													}}
													className="rounded bg-foreground px-2.5 py-1 text-[11px] font-medium text-background transition-opacity hover:opacity-90"
												>
													{t('common.done', 'Done')}
												</button>
											</div>
										</div>
									) : null}
								</>
							) : (
								/* Appearance Tab Inside Popover (Zero Form Layout Shift) */
								<div
									id={studioId}
									data-rw-icon-studio="true"
									className="max-h-96 space-y-3.5 overflow-y-auto p-3.5"
								>
									<div className="flex items-center justify-between gap-3 border-b border-border pb-3">
										<div className="flex min-w-0 items-center gap-3">
											<div className="flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-md border border-border bg-background p-2">
												<DynamicIcon value={{ ...current, name: resolvedCanonicalName }} />
											</div>
											<div className="min-w-0">
												<div className="truncate text-xs font-semibold text-foreground">
													{displayLabel}
												</div>
												<div className="text-[11px] text-muted-foreground">
													{current.variant === 'filled'
														? t('icon.styleFilled', 'Filled')
														: `${current.strokeWidth}px`}
													{' · '}
													{current.size}px
													{current.color ? ` · ${current.color}` : ''}
												</div>
											</div>
										</div>
										{hasCustomOverrides ? (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												disabled={isDisabled}
												onClick={() =>
													commit({
														variant: 'outline',
														size: 24,
														strokeWidth: 2,
														color: '',
														background: '',
														radius: 'md',
													})
												}
												className="h-7 shrink-0 px-2 text-xs"
											>
												<DynamicIcon name="rotate-ccw" className="mr-1 size-3" />
												{t('icon.resetStyle', 'Reset Style')}
											</Button>
										) : null}
									</div>

									{canToggleSelectedFilled ? (
										<div className="space-y-1.5">
											<span className="block text-[11px] font-medium text-muted-foreground">
												{t('icon.styleFilter', 'Style')}
											</span>
											<div className="inline-flex items-center gap-1">
												<button
													type="button"
													disabled={isDisabled}
													onClick={() => commit({ variant: 'outline' })}
													className={cn(
														'rounded border px-2.5 py-1 text-xs font-medium',
														current.variant === 'outline'
															? 'border-foreground bg-foreground text-background'
															: 'border-border bg-background text-foreground hover:bg-muted'
													)}
												>
													{t('icon.styleOutline', 'Outline')}
												</button>
												<button
													type="button"
													disabled={isDisabled || !selectedCachedEntry?.hasFilled}
													onClick={() => commit({ variant: 'filled' })}
													className={cn(
														'rounded border px-2.5 py-1 text-xs font-medium',
														current.variant === 'filled'
															? 'border-foreground bg-foreground text-background'
															: 'border-border bg-background text-foreground hover:bg-muted',
														!selectedCachedEntry?.hasFilled && 'cursor-not-allowed opacity-45'
													)}
												>
													{t('icon.styleFilled', 'Filled')}
												</button>
											</div>
										</div>
									) : null}

									{flags.allowSize ? (
										<div className="space-y-1.5">
											<label
												htmlFor={`${studioId}_size`}
												className="block text-[11px] font-medium text-muted-foreground"
											>
												{t('icon.size', 'Size (px)')}
											</label>
											<div className="flex flex-wrap items-center gap-1">
												{ICON_SIZE_PRESETS.map((sz) => (
													<button
														key={sz}
														type="button"
														disabled={isDisabled}
														onClick={() => commit({ size: sz })}
														className={cn(
															'rounded border px-2 py-1 text-xs font-medium',
															current.size === sz
																? 'border-foreground bg-foreground text-background'
																: 'border-border bg-background text-foreground hover:bg-muted'
														)}
													>
														{sz}
													</button>
												))}
												<Input
													id={`${studioId}_size`}
													type="number"
													min={12}
													max={96}
													disabled={isDisabled}
													value={String(current.size)}
													aria-label={t('icon.size', 'Size (px)')}
													onChange={(e) => commit({ size: clampIconSize(e.target.value, 24) })}
													className="h-7 w-16 px-2 text-xs"
												/>
											</div>
										</div>
									) : null}

									{flags.allowStrokeWidth && current.variant === 'outline' ? (
										<div className="space-y-1.5">
											<span className="block text-[11px] font-medium text-muted-foreground">
												{t('icon.strokeWidth', 'Stroke Width')}
											</span>
											<div className="flex flex-wrap items-center gap-1">
												{ICON_STROKE_PRESETS.map((sw) => (
													<button
														key={sw}
														type="button"
														disabled={isDisabled}
														onClick={() => commit({ strokeWidth: sw })}
														className={cn(
															'rounded border px-2.5 py-1 text-xs font-medium',
															current.strokeWidth === sw
																? 'border-foreground bg-foreground text-background'
																: 'border-border bg-background text-foreground hover:bg-muted'
														)}
													>
														{sw}
													</button>
												))}
											</div>
										</div>
									) : null}

									{flags.allowColor ? (
										<div className="space-y-1.5">
											<label
												htmlFor={`${studioId}_color`}
												className="block text-[11px] font-medium text-muted-foreground"
											>
												{t('icon.color', 'Icon Color')}
											</label>
											<div className="flex flex-wrap items-center gap-1.5">
												{ICON_COLOR_SWATCHES.map((swatch) => {
													const isAuto = swatch === '';
													const active = current.color.toLowerCase() === swatch.toLowerCase();
													return (
														<button
															key={swatch || 'auto'}
															type="button"
															disabled={isDisabled}
															aria-label={
																isAuto
																	? t('icon.colorAuto', 'Auto (currentColor)')
																	: swatch
															}
															title={
																isAuto
																	? t('icon.colorAuto', 'Auto (currentColor)')
																	: swatch
															}
															onClick={() => commit({ color: swatch })}
															className={cn(
																'flex size-6 items-center justify-center rounded-full border transition-transform',
																active
																	? 'scale-110 ring-2 ring-foreground ring-offset-1'
																	: 'border-border hover:scale-105'
															)}
															style={isAuto ? undefined : { backgroundColor: swatch }}
														>
															{isAuto ? (
																<span className="text-[9px] font-semibold text-muted-foreground">
																	A
																</span>
															) : null}
														</button>
													);
												})}
												<input
													id={`${studioId}_color`}
													type="color"
													disabled={isDisabled}
													aria-label={t('icon.customColor', 'Custom icon hex color')}
													value={
														/^#[0-9a-fA-F]{6}$/.test(current.color)
															? current.color
															: '#0f172a'
													}
													onChange={(e) => commit({ color: e.target.value })}
													className="h-6 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
												/>
											</div>
										</div>
									) : null}

									{flags.allowBackground ? (
										<div className="space-y-1.5">
											<label
												htmlFor={`${studioId}_bg`}
												className="block text-[11px] font-medium text-muted-foreground"
											>
												{t('icon.background', 'Badge Background & Shape')}
											</label>
											<div className="flex flex-wrap items-center gap-1.5">
												{ICON_BG_SWATCHES.map((swatch) => {
													const isNone = swatch === '';
													const active =
														current.background.toLowerCase() === swatch.toLowerCase();
													return (
														<button
															key={swatch || 'none'}
															type="button"
															disabled={isDisabled}
															aria-label={
																isNone ? t('icon.bgNone', 'No background') : swatch
															}
															title={
																isNone ? t('icon.bgNone', 'No background') : swatch
															}
															onClick={() => commit({ background: swatch })}
															className={cn(
																'flex size-6 items-center justify-center rounded-full border transition-transform',
																active
																	? 'scale-110 ring-2 ring-foreground ring-offset-1'
																	: 'border-border hover:scale-105'
															)}
															style={isNone ? undefined : { backgroundColor: swatch }}
														>
															{isNone ? (
																<DynamicIcon
																	name="x"
																	className="size-3 text-muted-foreground"
																/>
															) : null}
														</button>
													);
												})}
												<input
													id={`${studioId}_bg`}
													type="color"
													disabled={isDisabled}
													aria-label={t('icon.customBg', 'Custom badge hex color')}
													value={
														/^#[0-9a-fA-F]{6}$/.test(current.background)
															? current.background
															: '#f1f5f9'
													}
													onChange={(e) => commit({ background: e.target.value })}
													className="h-6 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
												/>
											</div>
											{current.background ? (
												<div className="flex flex-wrap items-center gap-1 pt-1">
													{ICON_RADIUS_OPTIONS.map((opt) => (
														<button
															key={opt.value}
															type="button"
															disabled={isDisabled}
															onClick={() =>
																commit({ radius: opt.value as IconBadgeRadius })
															}
															style={{ borderRadius: badgeRadiusCssValue(opt.value) }}
															className={cn(
																'border px-2 py-0.5 text-[11px] font-medium',
																current.radius === opt.value
																	? 'border-foreground bg-foreground text-background'
																	: 'border-border bg-background text-foreground hover:bg-muted'
															)}
														>
															{opt.label}
														</button>
													))}
												</div>
											) : null}
										</div>
									) : null}

									<div className="flex items-center justify-end border-t border-border pt-2.5">
										<button
											type="button"
											onClick={() => {
												setIsOpen(false);
												triggerBtnRef.current?.focus();
											}}
											className="rounded bg-foreground px-3 py-1 text-xs font-medium text-background transition-opacity hover:opacity-90"
										>
											{t('common.done', 'Done')}
										</button>
									</div>
								</div>
							)}
						</div>
				</PortalRoot>
			) : null}
		</div>
	);
}
