/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { getReactWorkspaceRuntime } from '../runtime';
import type {
	WorkspaceSharedContext,
	WorkspaceDefinitionDto,
	WorkspacePreferencesDto,
	WorkspaceWidgetDto,
} from '../layout/AppShell';

export interface WorkspaceLauncherPageProps {
	title?: string;
	subtitle?: string;
	searchQuery?: string;
	workspaces?: WorkspaceDefinitionDto[] | Record<string, WorkspaceDefinitionDto>;
	widgets?: WorkspaceWidgetDto[] | Record<string, WorkspaceWidgetDto>;
	preferences?: WorkspacePreferencesDto;
	prefsEndpoint?: string;
	debugShowcaseUrl?: string;
	debugShowcaseLabel?: string;
}

const runtime = getReactWorkspaceRuntime();
const { React, Inertia, UI, Hooks, Layout, Utils, registerPages, useTranslations } = runtime;
const { cn, DynamicIcon } = Utils;
const { sanitizeHref, withWorkspaceShellUrl } = Utils;
const { fetchGatewayJson } = Hooks;
const { useEffect, useMemo, useRef, useState } = React;
const { Link, router, usePage } = Inertia;
const { AppShell, postWorkspacePreferenceAction } = Layout;
const {
	Alert,
	AlertDescription,
	Badge,
	Button,
	buttonVariants,
	Card,
	CliBox,
	ColumnSpanSlider,
	ConfirmDialog,
	Dialog,
	EmptyState,
	Input,
	Switch,
	Textarea,
	SortableHandle,
	SortableStatusRegion,
	clampColSpan,
	useSortableList,
} = UI;

const WIDGET_BENTO_SPAN_CLASSES: Record<number, string> = {
	1: 'col-span-12 lg:col-span-1',
	2: 'col-span-12 lg:col-span-2',
	3: 'col-span-12 md:col-span-6 lg:col-span-3',
	4: 'col-span-12 md:col-span-6 lg:col-span-4',
	5: 'col-span-12 md:col-span-6 lg:col-span-5',
	6: 'col-span-12 md:col-span-6 lg:col-span-6',
	7: 'col-span-12 lg:col-span-7',
	8: 'col-span-12 lg:col-span-8',
	9: 'col-span-12 lg:col-span-9',
	10: 'col-span-12 lg:col-span-10',
	11: 'col-span-12 lg:col-span-11',
	12: 'col-span-12 lg:col-span-12',
};

function resolveWidgetColSpan(rawSize?: string): number {
	const token = String(rawSize ?? 'md').trim().toLowerCase();
	if (token === 'sm') return 4;
	if (token === 'md') return 6;
	if (token === 'lg') return 8;
	if (token === 'full') return 12;
	const parsed = Number(token);
	if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 12) {
		return clampColSpan(parsed, 6, 3, 12);
	}
	return 6;
}

const DEFAULT_PREFERENCES: WorkspacePreferencesDto = {
	favorites: [],
	widgetOrder: [],
	hiddenWidgets: [],
	widgetSizes: {},
};

const LAYOUT_PRESET_SCHEMA = 'processwire.react-workspace.layout.v1';

/**
 * KPI numbers stay neutral by default; only actionable states (warning/danger) with a
 * non-zero value receive a semantic color so the dashboard does not shout "0" in brand color.
 */
function resolveMetricToneClass(tone: string | undefined, value: string): string {
	const numeric = Number(String(value).replace(/[^\d.-]/g, ''));
	const isZero = String(value).trim() === '' || (Number.isFinite(numeric) && numeric === 0);
	if (isZero) {
		return 'text-foreground';
	}
	if (tone === 'warning') {
		return 'text-warning';
	}
	if (tone === 'danger') {
		return 'text-destructive';
	}
	return 'text-foreground';
}

export function WorkspaceLauncher({
	title = 'Workspace',
	subtitle = 'Quick overview, live status cards, and all admin workspaces.',
	searchQuery = '',
	workspaces: rawWorkspaces,
	widgets: rawWidgets,
	preferences: rawPreferences,
	prefsEndpoint: rawPrefsEndpoint,
	debugShowcaseUrl = '',
	debugShowcaseLabel = 'UI Showcase',
}: WorkspaceLauncherPageProps) {
	const page = usePage<{ workspace?: WorkspaceSharedContext }>();
	const { t } = useTranslations('core');
	const workspace = page.props.workspace;
	const prefsEndpoint = rawPrefsEndpoint || workspace?.prefsEndpoint || '/_react/workspace-prefs';
	const safeShowcaseUrl = debugShowcaseUrl ? sanitizeHref(debugShowcaseUrl) : '';

	const [search, setSearch] = useState(searchQuery);
	const [selectedCategory, setSelectedCategory] = useState<string>('all');
	const [activeSection, setActiveSection] = useState<'overview' | 'directory'>(
		searchQuery.trim() !== '' ? 'directory' : 'overview'
	);
	const [customizerOpen, setCustomizerOpen] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [savingPrefs, setSavingPrefs] = useState(false);

	const [importDialogOpen, setImportDialogOpen] = useState(false);
	const [importJsonText, setImportJsonText] = useState('');
	const [importError, setImportError] = useState('');
	const [exportFeedback, setExportFeedback] = useState('');
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const incomingPrefs = rawPreferences ?? workspace?.preferences ?? DEFAULT_PREFERENCES;
	const [prefs, setPrefs] = useState<WorkspacePreferencesDto>({
		favorites: Array.isArray(incomingPrefs.favorites) ? incomingPrefs.favorites : [],
		widgetOrder: Array.isArray(incomingPrefs.widgetOrder) ? incomingPrefs.widgetOrder : [],
		hiddenWidgets: Array.isArray(incomingPrefs.hiddenWidgets) ? incomingPrefs.hiddenWidgets : [],
		widgetSizes:
			incomingPrefs.widgetSizes && typeof incomingPrefs.widgetSizes === 'object'
				? incomingPrefs.widgetSizes
				: {},
	});

	useEffect(() => {
		const next = rawPreferences ?? workspace?.preferences;
		if (!next) {
			return;
		}
		setPrefs({
			favorites: Array.isArray(next.favorites) ? next.favorites : [],
			widgetOrder: Array.isArray(next.widgetOrder) ? next.widgetOrder : [],
			hiddenWidgets: Array.isArray(next.hiddenWidgets) ? next.hiddenWidgets : [],
			widgetSizes: next.widgetSizes && typeof next.widgetSizes === 'object' ? next.widgetSizes : {},
		});
	}, [rawPreferences, workspace?.preferences]);

	const workspaces = useMemo<WorkspaceDefinitionDto[]>(() => {
		const source = rawWorkspaces ?? workspace?.workspaces ?? [];
		if (Array.isArray(source)) {
			return source;
		}
		if (source && typeof source === 'object') {
			return Object.values(source);
		}
		return [];
	}, [rawWorkspaces, workspace?.workspaces]);

	const workspaceById = useMemo(() => {
		const map = new Map<string, WorkspaceDefinitionDto>();
		for (const ws of workspaces) {
			map.set(ws.id, ws);
		}
		return map;
	}, [workspaces]);

	const allWidgets = useMemo<WorkspaceWidgetDto[]>(() => {
		const source = rawWidgets ?? [];
		const list: WorkspaceWidgetDto[] = Array.isArray(source)
			? source
			: source && typeof source === 'object'
				? Object.values(source)
				: [];

		const orderIndex = new Map<string, number>();
		prefs.widgetOrder.forEach((id, idx) => orderIndex.set(id, idx));

		return [...list].sort((a, b) => {
			const idxA = orderIndex.has(a.id) ? orderIndex.get(a.id)! : 1000 + (a.order ?? 100);
			const idxB = orderIndex.has(b.id) ? orderIndex.get(b.id)! : 1000 + (b.order ?? 100);
			if (idxA !== idxB) {
				return idxA - idxB;
			}
			return a.title.localeCompare(b.title);
		});
	}, [rawWidgets, prefs.widgetOrder]);

	const visibleWidgets = useMemo(() => {
		const hiddenSet = new Set(prefs.hiddenWidgets);
		return allWidgets.filter((w) => !hiddenSet.has(w.id));
	}, [allWidgets, prefs.hiddenWidgets]);

	const hasCompactCompanionWidget = useMemo(
		() =>
			visibleWidgets.some((w) => {
				const raw = prefs.widgetSizes[w.id] || w.size || 'md';
				return resolveWidgetColSpan(raw) <= 4;
			}),
		[visibleWidgets, prefs.widgetSizes]
	);

	const resolveBalancedWidgetSpan = (widget: WorkspaceWidgetDto): number => {
		const explicitUserSize = prefs.widgetSizes[widget.id];
		if (explicitUserSize) {
			return resolveWidgetColSpan(explicitUserSize);
		}
		const baseSpan = resolveWidgetColSpan(widget.size || 'md');
		if (visibleWidgets.length === 1) {
			return 12;
		}
		if (baseSpan === 8 && !hasCompactCompanionWidget) {
			return 6;
		}
		return baseSpan;
	};

	const normalizedFavoritesSet = useMemo(
		() => new Set(prefs.favorites.map((id) => String(id).toLowerCase())),
		[prefs.favorites]
	);

	const favoriteWorkspaces = useMemo(() => {
		return workspaces.filter((ws) => normalizedFavoritesSet.has(ws.id.toLowerCase()));
	}, [workspaces, normalizedFavoritesSet]);

	const categories = useMemo(() => {
		const seen = new Set<string>();
		for (const ws of workspaces) {
			if (ws.category) {
				seen.add(ws.category);
			}
		}
		return Array.from(seen);
	}, [workspaces]);

	const filteredWorkspaces = useMemo(() => {
		const q = search.trim().toLowerCase();

		const matching = workspaces.filter((ws) => {
			if (selectedCategory === 'favorites' && !normalizedFavoritesSet.has(ws.id.toLowerCase())) {
				return false;
			}
			if (
				selectedCategory !== 'all' &&
				selectedCategory !== 'favorites' &&
				ws.category !== selectedCategory
			) {
				return false;
			}
			if (!q) {
				return true;
			}
			const haystack = [
				ws.id,
				ws.title,
				ws.subtitle || '',
				ws.description,
				ws.category,
				ws.badge,
				...(ws.pills || []),
			]
				.join(' ')
				.toLowerCase();
			return haystack.includes(q);
		});

		return [...matching].sort((a, b) => {
			const aFav = normalizedFavoritesSet.has(a.id.toLowerCase()) ? 0 : 1;
			const bFav = normalizedFavoritesSet.has(b.id.toLowerCase()) ? 0 : 1;
			if (aFav !== bFav) {
				return aFav - bFav;
			}
			return (a.order ?? 100) - (b.order ?? 100);
		});
	}, [workspaces, search, selectedCategory, normalizedFavoritesSet]);

	const [confirmResetOpen, setConfirmResetOpen] = useState(false);

	const persistPrefsAction = async (
		payload: Record<string, unknown>,
		previousSnapshot?: WorkspacePreferencesDto
	): Promise<boolean> => {
		setSavingPrefs(true);
		try {
			const updated = await postWorkspacePreferenceAction(prefsEndpoint, payload);
			if (updated) {
				setPrefs(updated);
				return true;
			}
			if (previousSnapshot) {
				setPrefs(previousSnapshot);
			}
			return false;
		} finally {
			setSavingPrefs(false);
		}
	};

	const handleToggleFavorite = async (workspaceId: string) => {
		const cleanId = workspaceId.toLowerCase();
		const previousSnapshot = prefs;
		const exists = normalizedFavoritesSet.has(cleanId);
		const nextFavorites = exists
			? prefs.favorites.filter((id) => String(id).toLowerCase() !== cleanId)
			: [...prefs.favorites, cleanId];

		setPrefs((prev) => ({ ...prev, favorites: nextFavorites }));
		await persistPrefsAction(
			{
				action: 'toggle_favorite',
				workspaceId: cleanId,
			},
			previousSnapshot
		);
	};

	const handleToggleWidgetVisibility = async (widgetId: string) => {
		const isHidden = prefs.hiddenWidgets.includes(widgetId);
		const nextHidden = isHidden
			? prefs.hiddenWidgets.filter((id) => id !== widgetId)
			: [...prefs.hiddenWidgets, widgetId];

		setPrefs((prev) => ({ ...prev, hiddenWidgets: nextHidden }));
		await persistPrefsAction({
			action: 'toggle_widget',
			widgetId,
		});
	};

	const persistWidgetOrder = async (nextOrder: string[]) => {
		setPrefs((prev) => ({ ...prev, widgetOrder: nextOrder }));
		await persistPrefsAction({
			action: 'reorder_widgets',
			widgetOrder: nextOrder,
		});
	};

	const customizerSortable = useSortableList<WorkspaceWidgetDto>({
		items: allWidgets,
		getId: (w) => w.id,
		getLabel: (w) => w.title,
		axis: 'grid',
		disabled: !customizerOpen,
		onReorder: (nextAll) => {
			void persistWidgetOrder(nextAll.map((w) => w.id));
		},
	});

	const bentoSortable = useSortableList<WorkspaceWidgetDto>({
		items: visibleWidgets,
		getId: (w) => w.id,
		getLabel: (w) => w.title,
		axis: 'grid',
		disabled: !customizerOpen,
		onReorder: (nextVisible) => {
			const visibleSet = new Set(nextVisible.map((w) => w.id));
			let vIdx = 0;
			const nextOrder = allWidgets.map((w) =>
				visibleSet.has(w.id) ? nextVisible[vIdx++]!.id : w.id
			);
			void persistWidgetOrder(nextOrder);
		},
	});

	const resizeTimersRef = useRef<Record<string, number>>({});

	useEffect(() => {
		return () => {
			Object.values(resizeTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
		};
	}, []);

	const handleSetWidgetSpan = (widget: WorkspaceWidgetDto, rawSpan: number) => {
		const nextSpan = clampColSpan(rawSpan, 6, 3, 12);
		const nextSize = String(nextSpan);

		setPrefs((prev) => ({
			...prev,
			widgetSizes: {
				...prev.widgetSizes,
				[widget.id]: nextSize,
			},
		}));

		if (resizeTimersRef.current[widget.id]) {
			window.clearTimeout(resizeTimersRef.current[widget.id]);
		}
		resizeTimersRef.current[widget.id] = window.setTimeout(() => {
			delete resizeTimersRef.current[widget.id];
			void persistPrefsAction({
				action: 'resize_widget',
				widgetId: widget.id,
				size: nextSize,
			});
		}, 120);
	};

	const handleResetPreferences = async () => {
		const defaultOrder = [...allWidgets]
			.sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
			.map((w) => w.id);

		setPrefs({
			favorites: [],
			widgetOrder: defaultOrder,
			hiddenWidgets: [],
			widgetSizes: {},
		});
		await persistPrefsAction({
			action: 'reset',
		});
	};

	const buildLayoutPresetObject = () => ({
		schema: LAYOUT_PRESET_SCHEMA,
		exportedAt: new Date().toISOString(),
		layout: {
			favorites: prefs.favorites,
			widgetOrder: allWidgets.map((w) => w.id),
			hiddenWidgets: prefs.hiddenWidgets,
			widgetSizes: prefs.widgetSizes,
		},
	});

	const handleExportLayout = async () => {
		const preset = buildLayoutPresetObject();
		const serialized = JSON.stringify(preset, null, 2);

		if (typeof window !== 'undefined' && typeof Blob !== 'undefined') {
			const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
			const objectUrl = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = objectUrl;
			link.download = 'workspace-layout-preset.json';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(objectUrl);
		}

		try {
			if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(serialized);
			}
		} catch {
			// Clipboard write is optional when download succeeds
		}

		setExportFeedback('Layout exported');
		window.setTimeout(() => setExportFeedback(''), 2500);
	};

	const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) {
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === 'string') {
				setImportJsonText(reader.result);
				setImportError('');
			}
		};
		reader.readAsText(file);
		e.target.value = '';
	};

	const handleApplyImportedLayout = async () => {
		setImportError('');
		const trimmed = importJsonText.trim();
		if (!trimmed) {
			setImportError('Paste a layout preset JSON object or choose a .json file first.');
			return;
		}

		let parsed: Record<string, unknown>;
		try {
			const raw = JSON.parse(trimmed);
			if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
				setImportError('Layout preset must be a valid JSON object.');
				return;
			}
			parsed = raw;
		} catch {
			setImportError('Invalid JSON syntax. Please check the preset contents and try again.');
			return;
		}

		setSavingPrefs(true);
		try {
			const res = await fetchGatewayJson<{
				ok?: boolean;
				error?: string;
				preferences?: WorkspacePreferencesDto;
			}>(prefsEndpoint || '/_react/workspace-prefs', {
				method: 'POST',
				payload: {
					action: 'import_layout',
					preset: parsed,
				},
			});
			const json = res.data;
			if (!res.ok || !json?.ok) {
				setImportError(res.error || json?.error || 'Could not import layout preset.');
				return;
			}
			if (json.preferences) {
				setPrefs(json.preferences as WorkspacePreferencesDto);
			}
			setImportDialogOpen(false);
			setImportJsonText('');
		} catch {
			setImportError('Network error while importing layout preset.');
		} finally {
			setSavingPrefs(false);
		}
	};

	const handleRefresh = () => {
		setRefreshing(true);
		router.reload({
			onFinish: () => setRefreshing(false),
		});
	};

	const renderWorkspaceLink = (
		url: string | undefined,
		useInertiaLink: boolean,
		children: React.ReactNode,
		className?: string
	) => {
		const safeUrl = sanitizeHref(typeof withWorkspaceShellUrl === 'function' && url ? withWorkspaceShellUrl(url, true) : url);
		if (!safeUrl) {
			return <span className={className}>{children}</span>;
		}
		if (useInertiaLink) {
			return (
				<Link href={safeUrl} className={className}>
					{children}
				</Link>
			);
		}
		return (
			<a href={safeUrl} className={className}>
				{children}
			</a>
		);
	};

	return (
		<AppShell
			title={title}
			subtitle={subtitle}
			icon="layout-grid"
			navItems={[
				{
					key: 'overview',
					label: t('launcher.overview', 'Overview'),
					icon: 'layout-grid',
					badge: visibleWidgets.length,
					onClick: () => setActiveSection('overview'),
				},
				{
					key: 'directory',
					label: t('launcher.moduleDirectory', 'Module Directory'),
					icon: 'layers',
					badge: workspaces.length,
					onClick: () => {
						setCustomizerOpen(false);
						setActiveSection('directory');
					},
				},
			]}
			activeNav={activeSection}
			pills={[
				{ label: `${workspaces.length} Modules`, variant: 'primary' },
				{ label: `${visibleWidgets.length}/${allWidgets.length} Widgets`, variant: 'secondary' },
				...(favoriteWorkspaces.length > 0
					? [{ label: `${favoriteWorkspaces.length} ${t('launcher.pinned', 'Pinned')}`, variant: 'success' as const }]
					: []),
			]}
			headerActions={
				<div
					data-rw-workspace-header-actions=""
					className="flex min-w-0 max-w-full flex-wrap items-center gap-2"
				>
					{safeShowcaseUrl ? (
						<a
							href={safeShowcaseUrl}
							data-rw-ui-showcase-link=""
							className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
						>
							<DynamicIcon name="eye" className="size-3.5 shrink-0" />
							<span>{debugShowcaseLabel || 'UI Showcase'}</span>
						</a>
					) : null}
					<Button
						variant={customizerOpen ? 'primary' : 'outline'}
						size="sm"
						icon="sliders"
						onClick={() => {
							setActiveSection('overview');
							setCustomizerOpen((prev) => !prev);
						}}
						data-rw-customize-dashboard
					>
						{customizerOpen
							? t('launcher.doneCustomizing', 'Done Customizing')
							: t('launcher.customizeLayout', 'Customize Layout')}
					</Button>
					<Button
						variant="outline"
						size="sm"
						icon="refresh"
						disabled={refreshing}
						onClick={handleRefresh}
					>
						{refreshing ? t('common.refreshing', 'Refreshing...') : t('common.refresh', 'Refresh')}
					</Button>
				</div>
			}
		>
			<Dialog
				open={importDialogOpen}
				onOpenChange={(open: boolean) => {
					setImportDialogOpen(open);
					if (!open) {
						setImportError('');
					}
				}}
				title={t('launcher.importLayout', 'Import Dashboard Layout')}
				description={t('launcher.importLayoutDescription', 'Apply a saved workspace layout preset (.json) to update your pinned shortcuts, widget order, widths, and visibility.')}
				maxWidth="max-w-xl"
				footer={
					<div className="flex items-center justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setImportDialogOpen(false)}
						>
							{t('common.cancel', 'Cancel')}
						</Button>
						<Button
							type="button"
							variant="primary"
							size="sm"
							icon="check"
							disabled={savingPrefs}
							onClick={handleApplyImportedLayout}
							data-rw-import-layout-submit
						>
							{savingPrefs ? t('common.applying', 'Applying...') : t('launcher.applyLayout', 'Apply Layout')}
						</Button>
					</div>
				}
			>
				<div className="space-y-4" data-rw-import-layout-dialog>
					{importError ? (
						<Alert variant="destructive">
							<AlertDescription>{importError}</AlertDescription>
						</Alert>
					) : null}

					<div className="flex flex-wrap items-center justify-between gap-2">
						<span className="text-xs text-muted-foreground">
							Upload a <code>.json</code> file or paste preset JSON below:
						</span>
						<input
							ref={fileInputRef}
							type="file"
							accept=".json,application/json"
							className="hidden"
							onChange={handleImportFileChange}
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							icon="upload"
							onClick={() => fileInputRef.current?.click()}
						>
							{t('launcher.chooseJsonFile', 'Choose JSON File')}
						</Button>
					</div>

					<Textarea
						rows={8}
						aria-label={t('launcher.importLayoutJsonLabel', 'Workspace layout preset JSON')}
						value={importJsonText}
						onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
							setImportJsonText(e.target.value);
							if (importError) {
								setImportError('');
							}
						}}
						placeholder={'{\n  "schema": "processwire.react-workspace.layout.v1",\n  "layout": {\n    "favorites": [],\n    "widgetOrder": [],\n    "hiddenWidgets": [],\n    "widgetSizes": {}\n  }\n}'}
						className="font-mono text-xs"
						data-rw-import-layout-textarea
					/>
				</div>
			</Dialog>

			<ConfirmDialog
				open={confirmResetOpen}
				onOpenChange={setConfirmResetOpen}
				variant="warning"
				icon="rotate-ccw"
				requireAcknowledge={false}
				title={t('launcher.resetDefaultLayout', 'Reset Default Layout')}
				description={t(
					'launcher.resetDefaultConfirmNotice',
					'Reset your pinned shortcuts, widget order, widths, and hidden widget settings back to defaults?'
				)}
				confirmLabel={t('launcher.resetDefault', 'Reset Default')}
				loading={savingPrefs}
				onConfirm={() => {
					setConfirmResetOpen(false);
					void handleResetPreferences();
				}}
			/>

			{activeSection === 'overview' ? (
				<div className="space-y-6">
					{/* Compact Pinned Quick-Launch Dock */}
					{favoriteWorkspaces.length > 0 ? (
						<section
							aria-label={t('launcher.pinnedShortcuts', 'Pinned Shortcuts')}
							data-rw-favorites-bar
							className="flex flex-wrap items-center gap-2 border-b border-border pb-4"
						>
							<span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
								<DynamicIcon name="star" className="size-3.5 text-warning fill-current" />
								<span>{t('launcher.pinned', 'Pinned')}</span>
							</span>
							{favoriteWorkspaces.map((ws) => (
								<div
									key={`fav-${ws.id}`}
									data-rw-favorite-card={ws.id}
									className="group inline-flex items-center gap-1 rounded-md border border-border bg-card pl-2.5 pr-1 py-1 text-xs transition-colors hover:border-primary/40"
								>
									{renderWorkspaceLink(
										ws.url,
										Boolean(ws.component),
										<span className="inline-flex min-h-6 items-center gap-2 font-medium text-foreground group-hover:text-primary transition-colors">
											<DynamicIcon name={ws.icon || 'cubes'} className="size-3.5 text-primary" />
											<span>{ws.title}</span>
										</span>
									)}
									<button
										type="button"
										onClick={() => handleToggleFavorite(ws.id)}
										title={`Unpin ${ws.title}`}
										aria-label={`Remove ${ws.title} from favorites`}
										className="inline-flex size-6 pointer-coarse:size-9 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
									>
										<DynamicIcon name="x" className="size-3" />
									</button>
								</div>
							))}
						</section>
					) : null}

					{/* Dashboard Customizer & Layout Export/Import Panel */}
					{customizerOpen ? (
						<Card className="p-4 sm:p-5 border-primary/30 bg-muted/15" data-rw-dashboard-customizer>
							<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-3.5">
								<div>
									<div className="flex items-center gap-2">
										<DynamicIcon name="sliders" className="size-4 text-primary" />
										<h2 className="text-sm font-semibold text-foreground">
											Customize Dashboard Layout
										</h2>
										{savingPrefs ? (
											<Badge variant="secondary" className="text-[10px]">
												Saving...
											</Badge>
										) : null}
										{exportFeedback ? (
											<Badge variant="success" className="text-[10px]">
												{exportFeedback}
											</Badge>
										) : null}
									</div>
									<p className="mt-0.5 text-xs text-muted-foreground">
										Drag or reorder widgets, toggle standard or wide spans, or export/import layout JSON presets across environments.
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										icon="download"
										onClick={handleExportLayout}
										data-rw-export-layout
									>
										{t('launcher.exportJson', 'Export JSON')}
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										icon="upload"
										onClick={() => {
											setImportJsonText('');
											setImportError('');
											setImportDialogOpen(true);
										}}
										data-rw-import-layout
									>
										{t('launcher.importJson', 'Import JSON')}
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										icon="rotate-ccw"
										onClick={() => setConfirmResetOpen(true)}
										data-rw-reset-preferences
									>
										{t('launcher.resetDefault', 'Reset Default')}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										icon="x"
										onClick={() => setCustomizerOpen(false)}
									>
										{t('common.done', 'Done')}
									</Button>
								</div>
							</div>

							<SortableStatusRegion message={customizerSortable.statusMessage} />
							<div
								{...customizerSortable.getContainerProps()}
								className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2"
							>
								{allWidgets.map((widget, idx) => {
									const isHidden = prefs.hiddenWidgets.includes(widget.id);
									const widgetSpan = resolveBalancedWidgetSpan(widget);

									return (
										<div
											key={`customizer-${widget.id}`}
											{...customizerSortable.getItemProps(widget)}
											data-rw-customizer-row={widget.id}
											className={cn(
												'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors sm:flex-nowrap',
												isHidden
													? 'border-border/60 bg-background/50 opacity-65'
													: 'border-border bg-card'
											)}
										>
											<div className="flex items-center gap-2 min-w-0">
												<SortableHandle
													size="sm"
													showKeyHint
													{...customizerSortable.getHandleProps(widget, idx)}
												/>
												<span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
													<DynamicIcon name={widget.icon || 'layout-grid'} className="size-4" />
												</span>
												<div className="min-w-0">
													<div className="truncate text-xs font-semibold text-foreground">
														{widget.title}
													</div>
													<div className="truncate text-[11px] text-muted-foreground">
														{widget.subtitle || widget.description}
													</div>
												</div>
											</div>

											<div className="flex items-center gap-2.5 shrink-0">
												<div className="w-36 sm:w-44" data-rw-customizer-span={widget.id}>
													<ColumnSpanSlider
														value={widgetSpan}
														min={3}
														max={12}
														compact
														showTrackPreview={false}
														ariaLabel={`${widget.title} column width`}
														onChange={(nextSpan) => handleSetWidgetSpan(widget, nextSpan)}
													/>
												</div>

												<div className="pl-0.5">
													<Switch
														checked={!isHidden}
														aria-label={t(
															'launcher.toggleWidgetVisibility',
															{ title: widget.title },
															'Show {title}'
														)}
														onCheckedChange={() => handleToggleWidgetVisibility(widget.id)}
													/>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						</Card>
					) : null}

					{/* Live Operational Bento Grid */}
					<section aria-label={t('launcher.operationalOverview', 'Operational Overview')} className="space-y-4" data-rw-widgets-section>
						{prefs.hiddenWidgets.length > 0 && !customizerOpen ? (
							<div className="flex items-center justify-end">
								<button
									type="button"
									onClick={() => setCustomizerOpen(true)}
									className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors cursor-pointer"
								>
									{t('launcher.hiddenWidgetsCount', { count: prefs.hiddenWidgets.length }, '{count} hidden widget(s)')} · {t('launcher.customize', 'Customize')}
								</button>
							</div>
						) : null}

						{allWidgets.length === 0 ? (
							<EmptyState
								icon="layers"
								title={t('launcher.noWidgetsTitle', 'No live widgets registered')}
								description={t('launcher.noWidgetsDescription', 'Installed modules have not registered live summary widgets yet. Open the Module Directory to launch any workspace.')}
								action={
									<Button
										variant="primary"
										size="sm"
										icon="layers"
										onClick={() => setActiveSection('directory')}
									>
										{t('launcher.openDirectory', 'Open Module Directory')}
									</Button>
								}
							/>
						) : visibleWidgets.length === 0 ? (
							<EmptyState
								icon="eye-off"
								title={t('launcher.allWidgetsHiddenTitle', 'All dashboard widgets are hidden')}
								description={t('launcher.allWidgetsHiddenDescription', 'You have hidden all widgets for your profile. Re-enable widgets or reset your layout to view live module status.')}
								action={
									<div className="flex items-center gap-2">
										<Button
											variant="primary"
											size="sm"
											icon="sliders"
											onClick={() => setCustomizerOpen(true)}
										>
											{t('launcher.chooseWidgets', 'Choose Widgets')}
										</Button>
										<Button
											variant="outline"
											size="sm"
											icon="rotate-ccw"
											onClick={() => setConfirmResetOpen(true)}
										>
											{t('launcher.resetDefaultLayout', 'Reset Default Layout')}
										</Button>
									</div>
								}
							/>
						) : (
							<>
								<SortableStatusRegion message={bentoSortable.statusMessage} />
								<div
									{...bentoSortable.getContainerProps()}
									className={cn('grid grid-cols-12 gap-4', !customizerOpen && 'lg:grid-flow-row-dense')}
								>
									{visibleWidgets.map((widget, idx) => {
										const parentWs = workspaceById.get(widget.workspaceId);
										const useInertia = Boolean(parentWs?.component);
										const widgetSpan = resolveBalancedWidgetSpan(widget);
										const metrics = widget.metrics ?? widget.data?.metrics ?? [];
										const items = widget.items ?? widget.data?.items ?? [];
										const actions = widget.actions ?? widget.data?.actions ?? [];
										const status = widget.status ?? widget.data?.status;
										const emptyText = widget.emptyText || widget.data?.emptyText;

										return (
											<Card
												key={widget.id}
												{...bentoSortable.getItemProps(widget)}
												data-rw-widget-card={widget.id}
												data-rw-widget-span={widgetSpan}
												className={cn(
													'flex flex-col justify-between p-5 transition-colors',
													WIDGET_BENTO_SPAN_CLASSES[widgetSpan] ?? 'col-span-12 lg:col-span-6',
													customizerOpen && 'border-dashed border-primary/35'
												)}
											>
												<div className="space-y-4">
													{/* Widget Header */}
													<div className="flex items-start justify-between gap-3">
														<div className="flex items-center gap-3 min-w-0">
															<span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
																<DynamicIcon name={widget.icon || 'layout-grid'} className="size-4" />
															</span>
															<div className="min-w-0">
																<div className="flex items-center gap-2">
																	<h2 className="truncate text-sm font-semibold text-foreground">
																		{parentWs?.url
																			? renderWorkspaceLink(
																					parentWs.url,
																					useInertia,
																					widget.title,
																					'inline-flex min-h-6 items-center hover:text-primary transition-colors'
																				)
																			: widget.title}
																	</h2>
																	{status ? (
																		<Badge
																			variant={
																				status.tone === 'success'
																					? 'success'
																					: status.tone === 'warning'
																						? 'warning'
																						: status.tone === 'danger'
																							? 'danger'
																							: 'secondary'
																			}
																			className="text-[10px]"
																		>
																			{status.label}
																		</Badge>
																	) : null}
																</div>
																<p className="truncate text-xs text-muted-foreground">
																	{widget.subtitle || widget.description}
																</p>
															</div>
														</div>

														{/* Layout controls appear ONLY in Customize mode (concise drag + hide without duplicating the customizer slider) */}
														{customizerOpen ? (
															<div className="flex items-center gap-1.5 shrink-0" data-rw-widget-controls={widget.id}>
																<SortableHandle
																	size="sm"
																	{...bentoSortable.getHandleProps(widget, idx)}
																/>
																<button
																	type="button"
																	onClick={() => handleToggleWidgetVisibility(widget.id)}
																	title={t('launcher.hideWidget', 'Hide widget from dashboard')}
																	aria-label={t('launcher.hideWidgetNamed', { title: widget.title }, 'Hide {title}')}
																	className="inline-flex size-7 pointer-coarse:size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive transition-colors cursor-pointer"
																>
																	<DynamicIcon name="eye-off" className="size-3.5" />
																</button>
															</div>
														) : parentWs?.url && actions.length === 0 ? (
															renderWorkspaceLink(
																parentWs.url,
																useInertia,
																<span className="inline-flex min-h-6 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
																	<span>{t('common.open', 'Open')}</span>
																	<DynamicIcon name="arrow-right" className="size-3.5" />
																</span>
															)
														) : null}
													</div>

												{/* Clean Hairline KPI Strip (No Card-in-Card Border Box) */}
												{metrics.length > 0 ? (
													<div
														className={cn(
															'grid gap-4 border-y border-border/70 py-3',
															metrics.length >= 3 && widgetSpan >= 5 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'
														)}
													>
														{metrics.map((metric, mIdx) => (
															<div key={mIdx} className="min-w-0">
																<div className="truncate text-xs text-muted-foreground">
																	{metric.label}
																</div>
																<div
																	className={cn(
																		'mt-0.5 truncate text-lg font-semibold tracking-tight tabular-nums',
																		resolveMetricToneClass(metric.tone, metric.value)
																	)}
																>
																	{metric.value}
																</div>
															</div>
														))}
													</div>
												) : null}

												{/* Clean Hairline Items List (No Nested Border Box) */}
												{items.length > 0 ? (
													<div className="divide-y divide-border/60">
														{items.map((item) => {
															const itemLabel = item.title || item.label || item.id;
															const itemHref = item.href || item.url;
															const itemMeta = item.subtitle || item.meta;
															return (
																<div
																	key={item.id}
																	className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0 text-xs"
																>
																	<div className="flex items-center gap-2 min-w-0">
																		{item.icon ? (
																			<DynamicIcon
																				name={item.icon}
																				className="size-3.5 shrink-0 text-muted-foreground"
																			/>
																		) : null}
																		<div className="min-w-0">
																			{itemHref ? (
																				renderWorkspaceLink(
																					itemHref,
																					useInertia,
																					<span className="inline-flex min-h-6 items-center font-medium text-foreground hover:text-primary transition-colors truncate">
																						{itemLabel}
																					</span>
																				)
																			) : (
																				<span className="font-medium text-foreground truncate block">
																					{itemLabel}
																				</span>
																			)}
																			{itemMeta ? (
																				<span className="text-[11px] text-muted-foreground truncate block">
																					{itemMeta}
																				</span>
																			) : null}
																		</div>
																	</div>
																	{item.badge ? (
																		<Badge
																			variant={
																				(item.badgeVariant as
																					| 'primary'
																					| 'secondary'
																					| 'success'
																					| 'warning'
																					| 'danger'
																					| 'outline') || 'outline'
																			}
																			className="shrink-0 text-[10px]"
																		>
																			{item.badge}
																		</Badge>
																	) : null}
																</div>
															);
														})}
													</div>
												) : emptyText ? (
													<p className="py-2 text-xs text-muted-foreground">
														{emptyText}
													</p>
												) : null}
											</div>

											{/* Widget Footer Actions */}
											{actions.length > 0 ? (
												<div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
													<span className="text-[11px] text-muted-foreground">
														{parentWs?.title || widget.title}
													</span>
													<div className="flex flex-wrap items-center gap-1.5">
														{actions.map((act, aIdx) => (
															<Button
																key={aIdx}
																asChild
																variant={act.variant || 'outline'}
																size="sm"
																icon={act.icon || 'arrow-right'}
															>
																{renderWorkspaceLink(act.href || act.url, useInertia, act.label)}
															</Button>
														))}
													</div>
												</div>
											) : null}
										</Card>
									);
								})}
								</div>
							</>
						)}
					</section>

					{workspaces.length > 0 ? (
						<div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 pb-12 text-xs text-muted-foreground">
							<span>
								{t('launcher.directoryPrompt', 'Looking for a specific capability or administration tool?')}
							</span>
							<button
								type="button"
								onClick={() => setActiveSection('directory')}
								data-rw-open-directory
								className="inline-flex min-h-7 items-center gap-1.5 py-1 font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
							>
								<span>{t('launcher.browseAllModules', { count: workspaces.length }, 'Browse all {count} modules')}</span>
								<DynamicIcon name="arrow-right" className="size-3.5" />
							</button>
						</div>
					) : null}
				</div>
			) : (
				/* Dedicated Module Directory View */
				<section aria-label={t('launcher.moduleDirectory', 'Module Directory')} className="space-y-5" data-rw-directory-section>
					<div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
						<div className="relative flex-1 max-w-md">
							<DynamicIcon
								name="search"
								className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
							/>
							<Input
								type="search"
								aria-label={t('launcher.searchModulesPlaceholder', 'Search modules by name, capability, or topic...')}
								value={search}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
								placeholder={t('launcher.searchModulesPlaceholder', 'Search modules by name, capability, or topic...')}
								className="pl-9"
								data-rw-directory-search
							/>
						</div>

						<div className="flex flex-wrap items-center gap-1.5">
							<button
								type="button"
								onClick={() => setSelectedCategory('all')}
								className={cn(
									'rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
									selectedCategory === 'all'
										? 'bg-primary text-primary-foreground'
										: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
								)}
							>
								{t('common.all', 'All')} ({workspaces.length})
							</button>

							{favoriteWorkspaces.length > 0 ? (
								<button
									type="button"
									onClick={() => setSelectedCategory('favorites')}
									className={cn(
										'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
										selectedCategory === 'favorites'
											? 'bg-primary text-primary-foreground'
											: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
									)}
								>
									<DynamicIcon name="star" className="size-3 fill-current" />
									<span>{t('launcher.pinned', 'Pinned')} ({favoriteWorkspaces.length})</span>
								</button>
							) : null}

							{categories.map((cat) => (
								<button
									key={cat}
									type="button"
									onClick={() => setSelectedCategory(cat)}
									className={cn(
										'rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer capitalize',
										selectedCategory === cat
											? 'bg-primary text-primary-foreground'
											: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
									)}
								>
									{cat}
								</button>
							))}

							{search || selectedCategory !== 'all' ? (
								<Button
									variant="ghost"
									size="sm"
									icon="x"
									onClick={() => {
										setSearch('');
										setSelectedCategory('all');
									}}
								>
									{t('common.clear', 'Clear')}
								</Button>
							) : null}
						</div>
					</div>

					{filteredWorkspaces.length === 0 ? (
						<EmptyState
							icon="cubes"
							title={
								search || selectedCategory !== 'all'
									? t('launcher.noMatchingModules', 'No matching modules found')
									: t('launcher.noWorkspacesAvailable', 'No workspaces available')
							}
							description={
								search || selectedCategory !== 'all'
									? t('launcher.noMatchingModulesDescription', 'No installed module matched your current search or category filter.')
									: t('launcher.noWorkspacesAvailableDescription', 'Install or enable a workspace module to access it here.')
							}
							action={
								search || selectedCategory !== 'all' ? (
									<Button
										variant="outline"
										size="sm"
										icon="x"
										onClick={() => {
											setSearch('');
											setSelectedCategory('all');
										}}
									>
										{t('launcher.resetFilter', 'Reset Filter')}
									</Button>
								) : undefined
							}
						/>
					) : (
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
							{filteredWorkspaces.map((ws) => {
								const isFav = normalizedFavoritesSet.has(ws.id.toLowerCase());
								return (
									<Card
										key={ws.id}
										data-rw-workspace-card={ws.id}
										className="flex flex-col justify-between p-5 transition-colors hover:border-primary/40"
									>
										<div className="space-y-4">
											<div className="flex items-start justify-between gap-3">
												<div className="flex items-center gap-3 min-w-0">
													<span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary overflow-hidden">
														{sanitizeHref(ws.logoUrl) ? (
															<img
																src={sanitizeHref(ws.logoUrl)}
																alt={ws.title}
																loading="lazy"
																decoding="async"
																className="size-6 object-contain"
															/>
														) : (
															<DynamicIcon name={ws.icon || 'cubes'} className="size-5" />
														)}
													</span>
													<div className="min-w-0">
														<h2 className="truncate text-sm font-semibold text-foreground">
															{renderWorkspaceLink(
																ws.url,
																Boolean(ws.component),
																ws.title,
																'inline-flex min-h-6 items-center hover:text-primary transition-colors'
															)}
														</h2>
														{ws.subtitle ? (
															<p className="truncate text-xs text-muted-foreground">
																{ws.subtitle}
															</p>
														) : ws.category ? (
															<p className="truncate text-xs capitalize text-muted-foreground">
																{ws.category}
															</p>
														) : null}
													</div>
												</div>

												<div className="flex items-center gap-1.5 shrink-0">
													{ws.badge ? (
														<Badge
															variant={
																(ws.badgeVariant as
																	| 'primary'
																	| 'success'
																	| 'warning'
																	| 'danger'
																	| 'secondary') || 'secondary'
															}
														>
															{ws.badge}
														</Badge>
													) : null}
													<button
														type="button"
														data-rw-favorite-toggle={ws.id}
														onClick={() => handleToggleFavorite(ws.id)}
														title={isFav ? t('launcher.unpinFromTopBar', 'Unpin from top bar') : t('launcher.pinToTopBar', 'Pin to top bar')}
														aria-label={isFav ? t('launcher.unpinWorkspace', { title: ws.title }, 'Unpin {title}') : t('launcher.pinWorkspace', { title: ws.title }, 'Pin {title}')}
														className={cn(
															'inline-flex size-8 items-center justify-center rounded-md border transition-colors cursor-pointer',
															isFav
																? 'border-warning/40 bg-warning/10 text-warning'
																: 'border-border bg-background text-muted-foreground hover:text-foreground'
														)}
													>
														<DynamicIcon
															name="star"
															className={cn('size-4', isFav && 'fill-current')}
														/>
													</button>
												</div>
											</div>

											{ws.description ? (
												<p className="text-xs text-muted-foreground leading-relaxed">
													{ws.description}
												</p>
											) : null}

											{ws.stats && ws.stats.length > 0 ? (
												<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-border/70 pt-3">
													{ws.stats.map((st, idx) => {
														const tone = st.tone || st.variant;
														return (
															<div key={idx} className="min-w-0">
																<div className="truncate text-[11px] text-muted-foreground">
																	{st.label}
																</div>
																<div
																	className={cn(
																		'mt-0.5 truncate text-sm font-semibold tabular-nums',
																		tone === 'warning'
																			? 'text-warning'
																			: tone === 'danger'
																				? 'text-destructive'
																				: tone === 'success'
																					? 'text-success'
																					: 'text-foreground'
																	)}
																>
																	{st.value}
																</div>
															</div>
														);
													})}
												</div>
											) : null}

											{ws.pills && ws.pills.length > 0 ? (
												<div className="flex flex-wrap gap-1.5">
													{ws.pills.map((pill, idx) => (
														<Badge key={idx} variant="outline" className="text-[11px]">
															{pill}
														</Badge>
													))}
												</div>
											) : null}

											{ws.cliCommand ? <CliBox command={ws.cliCommand} /> : null}
										</div>

										<div className="mt-5 flex items-center justify-between border-t border-border/70 pt-3.5">
											<span className="text-xs capitalize text-muted-foreground">
												{ws.category || t('launcher.moduleCategoryDefault', 'Module')}
											</span>
											{ws.url ? (
												<Button asChild variant="primary" size="sm" icon="arrow-right">
													{renderWorkspaceLink(
														ws.url,
														Boolean(ws.component),
														t('launcher.openWorkspaceNamed', { title: ws.title }, 'Open {title}')
													)}
												</Button>
											) : (
												<Badge variant="muted">{t('common.unavailable', 'Unavailable')}</Badge>
											)}
										</div>
									</Card>
								);
							})}
						</div>
					)}
				</section>
			)}
		</AppShell>
	);
}

registerPages({
	'ReactWorkspace/WorkspaceLauncher': WorkspaceLauncher,
	ProcessReactWorkspace: WorkspaceLauncher,
});
