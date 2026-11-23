import { getReactWorkspaceRuntime } from '../runtime';
import {
	buildShowcaseFixtures,
	type ShowcaseFixtures,
	type ShowcaseSectionKey,
} from '../showcase/showcaseFixtures';
import {
	DateTimeShowcaseSection,
	FormContextsShowcaseSection,
	LinksShowcaseSection,
	MediaShowcaseSection,
	OtherControlsShowcaseSection,
	PrimitivesShowcaseSection,
	RelationsShowcaseSection,
} from '../showcase/showcaseSections';

export type ShowcaseViewportMode =
	| 'direct'
	| 'desktop'
	| 'tablet'
	| 'inspector'
	| 'mobile'
	| 'compare';

export type ShowcaseThemeMode = 'auto' | 'light' | 'dark';

export interface UiShowcasePageProps {
	title?: string;
	subtitle?: string;
	embedded?: boolean;
	initialSection?: ShowcaseSectionKey;
	initialTheme?: ShowcaseThemeMode;
	workspaceUrl?: string;
	showcaseUrl?: string;
	sampleBaseUrl?: string;
}

interface OverflowOffender {
	frameId: string;
	viewportWidth: number;
	caseId: string;
	caseTitle: string;
	elementTag: string;
	elementClass: string;
	deltaPx: number;
	reason: 'scrollWidth' | 'boundingRect' | 'crushed';
}

interface OverflowAuditReport {
	frameReports: Record<
		string,
		{
			frameId: string;
			viewportWidth: number;
			totalCases: number;
			overflowCount: number;
			crushedCount: number;
			offenders: OverflowOffender[];
			crushed: OverflowOffender[];
		}
	>;
	checkedAt: string;
}

interface FramePreset {
	id: 'desktop' | 'tablet' | 'inspector' | 'mobile';
	label: string;
	width: number;
	height: number;
}

const FRAME_PRESETS: Record<FramePreset['id'], FramePreset> = {
	desktop: { id: 'desktop', label: '1280px Desktop', width: 1280, height: 900 },
	tablet: { id: 'tablet', label: '768px Tablet', width: 768, height: 920 },
	inspector: { id: 'inspector', label: '420px Inspector', width: 420, height: 840 },
	mobile: { id: 'mobile', label: '375px Mobile', width: 375, height: 812 },
};

const COMPARE_PRESETS: FramePreset[] = [
	FRAME_PRESETS.mobile,
	FRAME_PRESETS.inspector,
	FRAME_PRESETS.tablet,
];

const VIEWPORT_OPTIONS: Array<{ key: ShowcaseViewportMode; label: string; icon: string }> = [
	{ key: 'direct', label: 'Direct', icon: 'maximize-2' },
	{ key: 'desktop', label: '1280px', icon: 'monitor' },
	{ key: 'tablet', label: '768px', icon: 'tablet' },
	{ key: 'inspector', label: '420px', icon: 'panel-right' },
	{ key: 'mobile', label: '375px', icon: 'smartphone' },
	{ key: 'compare', label: 'Compare 375·420·768', icon: 'columns-3' },
];

const THEME_OPTIONS: Array<{ key: ShowcaseThemeMode; label: string; icon: string }> = [
	{ key: 'auto', label: 'Auto', icon: 'circle-dot' },
	{ key: 'light', label: 'Light', icon: 'sun' },
	{ key: 'dark', label: 'Dark', icon: 'moon' },
];

const SECTION_OPTIONS: Array<{ key: ShowcaseSectionKey; label: string }> = [
	{ key: 'all', label: 'All Sections' },
	{ key: 'media', label: 'Media' },
	{ key: 'links', label: 'Links' },
	{ key: 'relations', label: 'Relations' },
	{ key: 'datetime', label: 'Date & Time' },
	{ key: 'contexts', label: 'Contexts' },
	{ key: 'controls', label: 'Controls' },
	{ key: 'primitives', label: 'Primitives' },
];

const SCROLL_ALLOWLIST_SELECTOR =
	'.overflow-x-auto, .overflow-x-scroll, [data-rw-viewport-table], [data-rw-scroll], pre, code';

const runtime = getReactWorkspaceRuntime();
const { React, UI, Layout, cn, DynamicIcon, sanitizeHref, registerPages } = runtime;
const { useCallback, useEffect, useMemo, useRef, useState } = React;
const { Badge, Button, buttonVariants, Card, CardContent } = UI;
const { AppShell } = Layout;

function resolveSameOriginUrl(rawUrl: string | undefined, fallbackPath: string): string {
	const candidate = sanitizeHref(rawUrl || fallbackPath);
	if (!candidate) {
		return fallbackPath;
	}
	if (typeof window === 'undefined') {
		return candidate;
	}
	try {
		const parsed = new URL(candidate, window.location.origin);
		if (parsed.origin !== window.location.origin) {
			return fallbackPath;
		}
		return `${parsed.pathname}${parsed.search}`;
	} catch {
		return fallbackPath;
	}
}

function buildEmbedUrl(
	baseUrl: string,
	section: ShowcaseSectionKey,
	theme: ShowcaseThemeMode,
	frameId: string
): string {
	if (typeof window === 'undefined') {
		return `${baseUrl}?embed=1&section=${encodeURIComponent(section)}&theme=${encodeURIComponent(theme)}&frame=${encodeURIComponent(frameId)}`;
	}
	try {
		const parsed = new URL(baseUrl, window.location.origin);
		parsed.searchParams.set('embed', '1');
		parsed.searchParams.set('section', section);
		parsed.searchParams.set('theme', theme);
		parsed.searchParams.set('frame', frameId);
		return `${parsed.pathname}${parsed.search}`;
	} catch {
		return baseUrl;
	}
}

function applyShowcaseThemeClasses(theme: ShowcaseThemeMode): void {
	if (typeof document === 'undefined' || typeof window === 'undefined') {
		return;
	}
	const prefersDark =
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-color-scheme: dark)').matches;
	const resolvedDark = theme === 'dark' || (theme === 'auto' && prefersDark);

	document.documentElement.classList.toggle('dark', resolvedDark);
	document.documentElement.classList.toggle('light', !resolvedDark);
	document.documentElement.setAttribute('data-theme-mode', theme);
	document.documentElement.style.colorScheme = theme === 'auto' ? '' : resolvedDark ? 'dark' : 'light';

	document.body.classList.toggle('dark-theme', resolvedDark);
	document.body.classList.toggle('light-theme', !resolvedDark);
	document.body.classList.toggle('auto-theme', theme === 'auto');
}

function hasInnerClipOrScrollAncestor(el: HTMLElement, caseEl: HTMLElement): boolean {
	let cur: HTMLElement | null = el.parentElement;
	while (cur && cur !== caseEl) {
		const style = window.getComputedStyle(cur);
		if (
			style.overflowX === 'hidden' ||
			style.overflowX === 'clip' ||
			style.overflowX === 'auto' ||
			style.overflowX === 'scroll'
		) {
			return true;
		}
		cur = cur.parentElement;
	}
	return false;
}

function scanShowcaseOverflow(
	root: HTMLElement | null,
	frameId: string
): {
	frameId: string;
	viewportWidth: number;
	totalCases: number;
	overflowCount: number;
	crushedCount: number;
	offenders: OverflowOffender[];
	crushed: OverflowOffender[];
} {
	const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
	if (!root) {
		return {
			frameId,
			viewportWidth,
			totalCases: 0,
			overflowCount: 0,
			crushedCount: 0,
			offenders: [],
			crushed: [],
		};
	}

	const cases = Array.from(root.querySelectorAll<HTMLElement>('[data-rw-showcase-case]'));
	const offenders: OverflowOffender[] = [];
	const crushed: OverflowOffender[] = [];

	for (const caseEl of cases) {
		const caseId = caseEl.dataset.rwShowcaseCase || 'unknown';
		const caseTitle =
			caseEl.querySelector<HTMLElement>('[data-slot="card-title"], h3, h4')?.innerText?.trim() || caseId;
		const caseRect = caseEl.getBoundingClientRect();
		if (caseRect.width <= 0) {
			continue;
		}

		const candidates: HTMLElement[] = [caseEl, ...Array.from(caseEl.querySelectorAll<HTMLElement>('*'))];
		let caseFindings = 0;
		let caseCrushed = 0;

		for (const el of candidates) {
			if (caseFindings >= 3 && caseCrushed >= 2) {
				break;
			}
			if (!(el instanceof HTMLElement)) {
				continue;
			}
			if (el.closest('[data-rw-portal-overlay], .sr-only, [aria-hidden="true"]')) {
				continue;
			}
			const rect = el.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) {
				continue;
			}

			const scrollAncestor = el.closest<HTMLElement>(SCROLL_ALLOWLIST_SELECTOR);
			if (scrollAncestor && scrollAncestor !== el) {
				continue;
			}

			const style = window.getComputedStyle(el);
			if (style.position === 'fixed') {
				continue;
			}
			const isIntentionalScroller =
				el.matches(SCROLL_ALLOWLIST_SELECTOR) ||
				style.overflowX === 'auto' ||
				style.overflowX === 'scroll';
			const isNativeTextInput =
				el instanceof HTMLInputElement ||
				el instanceof HTMLTextAreaElement ||
				el instanceof HTMLSelectElement;
			const isIntentionalEllipsis =
				style.textOverflow === 'ellipsis' &&
				(style.overflowX === 'hidden' || style.overflowX === 'clip');

			if (
				caseFindings < 3 &&
				!isIntentionalScroller &&
				!isNativeTextInput &&
				!isIntentionalEllipsis &&
				el.clientWidth > 0 &&
				el.scrollWidth > el.clientWidth + 2
			) {
				offenders.push({
					frameId,
					viewportWidth,
					caseId,
					caseTitle,
					elementTag: el.tagName.toLowerCase(),
					elementClass: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
					deltaPx: Math.round(el.scrollWidth - el.clientWidth),
					reason: 'scrollWidth',
				});
				caseFindings += 1;
				continue;
			}

			if (
				caseCrushed < 2 &&
				isIntentionalEllipsis &&
				!isNativeTextInput &&
				rect.width < 64 &&
				el.clientWidth > 0 &&
				el.scrollWidth > el.clientWidth + 16
			) {
				crushed.push({
					frameId,
					viewportWidth,
					caseId,
					caseTitle,
					elementTag: el.tagName.toLowerCase(),
					elementClass: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
					deltaPx: Math.round(el.scrollWidth - el.clientWidth),
					reason: 'crushed',
				});
				caseCrushed += 1;
				continue;
			}

			if (
				caseFindings < 3 &&
				el !== caseEl &&
				!hasInnerClipOrScrollAncestor(el, caseEl) &&
				(rect.right > caseRect.right + 2 || rect.left < caseRect.left - 2)
			) {
				const deltaPx = Math.round(Math.max(rect.right - caseRect.right, caseRect.left - rect.left));
				offenders.push({
					frameId,
					viewportWidth,
					caseId,
					caseTitle,
					elementTag: el.tagName.toLowerCase(),
					elementClass: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
					deltaPx,
					reason: 'boundingRect',
				});
				caseFindings += 1;
			}
		}
	}

	return {
		frameId,
		viewportWidth,
		totalCases: cases.length,
		overflowCount: offenders.length,
		crushedCount: crushed.length,
		offenders,
		crushed,
	};
}

function ShowcaseSectionsList({
	fixtures,
	activeSection,
}: {
	fixtures: ShowcaseFixtures;
	activeSection: ShowcaseSectionKey;
}) {
	return (
		<div className="space-y-8">
			{activeSection === 'all' || activeSection === 'media' ? (
				<MediaShowcaseSection fixtures={fixtures} />
			) : null}
			{activeSection === 'all' || activeSection === 'links' ? (
				<LinksShowcaseSection fixtures={fixtures} />
			) : null}
			{activeSection === 'all' || activeSection === 'relations' ? (
				<RelationsShowcaseSection fixtures={fixtures} />
			) : null}
			{activeSection === 'all' || activeSection === 'datetime' ? (
				<DateTimeShowcaseSection fixtures={fixtures} />
			) : null}
			{activeSection === 'all' || activeSection === 'contexts' ? (
				<FormContextsShowcaseSection fixtures={fixtures} />
			) : null}
			{activeSection === 'all' || activeSection === 'controls' ? (
				<OtherControlsShowcaseSection fixtures={fixtures} />
			) : null}
			{activeSection === 'all' || activeSection === 'primitives' ? (
				<PrimitivesShowcaseSection fixtures={fixtures} />
			) : null}
		</div>
	);
}

function EmbeddedUiShowcaseCanvas({
	initialSection,
	initialTheme,
	fixtures,
}: {
	initialSection: ShowcaseSectionKey;
	initialTheme: ShowcaseThemeMode;
	fixtures: ShowcaseFixtures;
}) {
	const [section, setSection] = useState<ShowcaseSectionKey>(initialSection);
	const [theme, setTheme] = useState<ShowcaseThemeMode>(initialTheme);
	const [resetNonce, setResetNonce] = useState(0);
	const canvasRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		applyShowcaseThemeClasses(theme);
	}, [theme]);

	useEffect(() => {
		const handleMessage = (ev: MessageEvent<Record<string, unknown>>) => {
			if (typeof window === 'undefined' || ev.origin !== window.location.origin) {
				return;
			}
			const data = ev.data;
			if (!data || typeof data !== 'object') {
				return;
			}
			if (data.type === 'rw-showcase-theme' && typeof data.theme === 'string') {
				if (data.theme === 'auto' || data.theme === 'light' || data.theme === 'dark') {
					setTheme(data.theme);
				}
				return;
			}
			if (data.type === 'rw-showcase-section' && typeof data.section === 'string') {
				const validSections: ShowcaseSectionKey[] = [
					'all',
					'media',
					'links',
					'relations',
					'datetime',
					'contexts',
					'controls',
					'primitives',
				];
				if (validSections.includes(data.section as ShowcaseSectionKey)) {
					setSection(data.section as ShowcaseSectionKey);
				}
				return;
			}
			if (data.type === 'rw-showcase-reset') {
				setResetNonce((prev) => prev + 1);
				return;
			}
			if (data.type === 'rw-showcase-check-overflow') {
				const frameId = typeof data.frameId === 'string' ? data.frameId : 'embed';
				const report = scanShowcaseOverflow(canvasRef.current, frameId);
				window.parent?.postMessage(
					{
						type: 'rw-showcase-overflow-report',
						...report,
					},
					window.location.origin
				);
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	return (
		<main
			ref={canvasRef}
			data-rw-showcase-canvas="embed"
			data-rw-showcase-theme-active={theme}
			data-rw-showcase-section-active={section}
			className="min-h-screen bg-background p-3 sm:p-5 text-foreground"
		>
			<ShowcaseSectionsList key={resetNonce} fixtures={fixtures} activeSection={section} />
		</main>
	);
}

function ScaledIframeStage({
	preset,
	frameId,
	src,
	registerFrameRef,
	onFrameLoaded,
	className,
}: {
	preset: FramePreset;
	frameId: string;
	src: string;
	registerFrameRef: (frameId: string, node: HTMLIFrameElement | null) => void;
	onFrameLoaded: (frameId: string) => void;
	className?: string;
}) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const [containerWidth, setContainerWidth] = useState<number>(preset.width);

	useEffect(() => {
		const node = hostRef.current;
		if (!node || typeof ResizeObserver === 'undefined') {
			return;
		}
		const update = () => {
			const nextWidth = node.clientWidth;
			if (nextWidth > 0) {
				setContainerWidth(nextWidth);
			}
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const scale = Math.min(1, Math.max(0.25, containerWidth / preset.width));
	const scaledWidth = Math.round(preset.width * scale);
	const scaledHeight = Math.round(preset.height * scale);

	return (
		<div className={cn('space-y-2', className)} data-rw-showcase-frame-card={frameId}>
			<div className="flex flex-wrap items-center justify-between gap-2 px-1">
				<div className="flex items-center gap-2">
					<span className="text-xs font-semibold text-foreground">{preset.label}</span>
					<Badge variant="outline" className="font-mono text-[10px]">
						{preset.width} × {preset.height}
					</Badge>
				</div>
				{scale < 0.99 ? (
					<Badge variant="secondary" className="font-mono text-[10px]">
						Scale {Math.round(scale * 100)}%
					</Badge>
				) : (
					<Badge variant="success" className="font-mono text-[10px]">
						100% 1:1
					</Badge>
				)}
			</div>
			<div
				ref={hostRef}
				className="flex w-full justify-center overflow-hidden rounded-xl border border-border bg-muted/30 p-2 sm:p-3"
			>
				<div
					style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
					className="relative shrink-0 overflow-hidden rounded-lg border border-border bg-background shadow-sm"
				>
					<iframe
						ref={(el) => registerFrameRef(frameId, el)}
						src={src}
						title={`UI Showcase ${preset.label}`}
						width={preset.width}
						height={preset.height}
						onLoad={() => onFrameLoaded(frameId)}
						data-rw-showcase-iframe={frameId}
						style={{
							width: `${preset.width}px`,
							height: `${preset.height}px`,
							transform: scale < 1 ? `scale(${scale})` : undefined,
							transformOrigin: 'top left',
						}}
						className="block border-0 bg-background"
					/>
				</div>
			</div>
		</div>
	);
}

function UiShowcaseStudio({
	title,
	subtitle,
	initialSection,
	initialTheme,
	workspaceUrl,
	showcaseUrl,
	fixtures,
}: {
	title: string;
	subtitle: string;
	initialSection: ShowcaseSectionKey;
	initialTheme: ShowcaseThemeMode;
	workspaceUrl: string;
	showcaseUrl: string;
	fixtures: ShowcaseFixtures;
}) {
	const [viewport, setViewport] = useState<ShowcaseViewportMode>('direct');
	const [theme, setTheme] = useState<ShowcaseThemeMode>(initialTheme);
	const [section, setSection] = useState<ShowcaseSectionKey>(initialSection);
	const [resetNonce, setResetNonce] = useState(0);
	const [auditReport, setAuditReport] = useState<OverflowAuditReport | null>(null);
	const [showOffenders, setShowOffenders] = useState(false);

	const directCanvasRef = useRef<HTMLDivElement | null>(null);
	const frameRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
	const initialEmbedSrcsRef = useRef<Record<string, string>>({});

	const getInitialFrameSrc = useCallback(
		(frameId: string): string => {
			if (!initialEmbedSrcsRef.current[frameId]) {
				initialEmbedSrcsRef.current[frameId] = buildEmbedUrl(showcaseUrl, initialSection, initialTheme, frameId);
			}
			return initialEmbedSrcsRef.current[frameId];
		},
		[initialSection, initialTheme, showcaseUrl]
	);

	const postToFrame = useCallback((frameId: string, payload: Record<string, unknown>) => {
		if (typeof window === 'undefined') {
			return;
		}
		const target = frameRefs.current[frameId]?.contentWindow;
		if (!target) {
			return;
		}
		target.postMessage(payload, window.location.origin);
	}, []);

	const syncFrameState = useCallback(
		(frameId: string) => {
			postToFrame(frameId, { type: 'rw-showcase-theme', theme });
			postToFrame(frameId, { type: 'rw-showcase-section', section });
		},
		[postToFrame, section, theme]
	);

	useEffect(() => {
		const activeFrameIds = Object.keys(frameRefs.current).filter((id) => Boolean(frameRefs.current[id]));
		for (const frameId of activeFrameIds) {
			syncFrameState(frameId);
		}
	}, [syncFrameState, viewport]);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}
		const handleMessage = (ev: MessageEvent<Record<string, unknown>>) => {
			if (ev.origin !== window.location.origin) {
				return;
			}
			const data = ev.data;
			if (!data || typeof data !== 'object') {
				return;
			}
			if (data.type === 'rw-showcase-overflow-report' && typeof data.frameId === 'string') {
				const frameId = data.frameId;
				const viewportWidth = typeof data.viewportWidth === 'number' ? data.viewportWidth : 0;
				const totalCases = typeof data.totalCases === 'number' ? data.totalCases : 0;
				const overflowCount = typeof data.overflowCount === 'number' ? data.overflowCount : 0;
				const crushedCount = typeof data.crushedCount === 'number' ? data.crushedCount : 0;
				const offenders = Array.isArray(data.offenders) ? (data.offenders as OverflowOffender[]) : [];
				const crushed = Array.isArray(data.crushed) ? (data.crushed as OverflowOffender[]) : [];

				setAuditReport((prev) => ({
					frameReports: {
						...(prev?.frameReports ?? {}),
						[frameId]: {
							frameId,
							viewportWidth,
							totalCases,
							overflowCount,
							crushedCount,
							offenders,
							crushed,
						},
					},
					checkedAt: new Date().toLocaleTimeString(),
				}));
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	const registerFrameRef = useCallback((frameId: string, node: HTMLIFrameElement | null) => {
		if (node) {
			frameRefs.current[frameId] = node;
		} else {
			delete frameRefs.current[frameId];
		}
	}, []);

	const handleReset = useCallback(() => {
		setResetNonce((prev) => prev + 1);
		setAuditReport(null);
		if (viewport !== 'direct') {
			for (const frameId of Object.keys(frameRefs.current)) {
				postToFrame(frameId, { type: 'rw-showcase-reset' });
			}
		}
	}, [postToFrame, viewport]);

	const handleCheckOverflow = useCallback(() => {
		if (viewport === 'direct') {
			const report = scanShowcaseOverflow(directCanvasRef.current, 'direct');
			setAuditReport({
				frameReports: { [report.frameId]: report },
				checkedAt: new Date().toLocaleTimeString(),
			});
			return;
		}
		setAuditReport({
			frameReports: {},
			checkedAt: new Date().toLocaleTimeString(),
		});
		if (viewport === 'compare') {
			for (const preset of COMPARE_PRESETS) {
				const frameId = `compare-${preset.width}`;
				postToFrame(frameId, { type: 'rw-showcase-check-overflow', frameId });
			}
			return;
		}
		postToFrame(viewport, { type: 'rw-showcase-check-overflow', frameId: viewport });
	}, [postToFrame, viewport]);

	const aggregatedAudit = useMemo(() => {
		if (!auditReport) {
			return null;
		}
		const reports = Object.values(auditReport.frameReports);
		if (reports.length === 0) {
			return {
				totalCases: 0,
				overflowCount: 0,
				crushedCount: 0,
				offenders: [] as OverflowOffender[],
				crushed: [] as OverflowOffender[],
				pending: true,
			};
		}
		let totalCases = 0;
		let overflowCount = 0;
		let crushedCount = 0;
		const offenders: OverflowOffender[] = [];
		const crushed: OverflowOffender[] = [];
		for (const report of reports) {
			totalCases += report.totalCases;
			overflowCount += report.overflowCount;
			crushedCount += report.crushedCount;
			offenders.push(...report.offenders);
			crushed.push(...report.crushed);
		}
		return { totalCases, overflowCount, crushedCount, offenders, crushed, pending: false };
	}, [auditReport]);

	const scopedThemeClasses =
		theme === 'dark'
			? 'dark dark-theme bg-background text-foreground rounded-xl border border-border p-3 sm:p-5'
			: theme === 'light'
				? 'light light-theme bg-background text-foreground rounded-xl border border-border p-3 sm:p-5'
				: '';

	const scopedThemeStyle: React.CSSProperties | undefined =
		theme === 'light'
			? ({
					colorScheme: 'light',
					'--lightningcss-light': 'initial',
					'--lightningcss-dark': ' ',
					'--background': '#f4f5f7',
					'--card': '#ffffff',
					'--popover': '#ffffff',
					'--input-surface': '#f9fafb',
					'--muted': '#eef0f4',
					'--secondary': '#eef0f4',
					'--accent': '#eef0f4',
					'--foreground': '#111827',
					'--card-foreground': '#111827',
					'--popover-foreground': '#111827',
					'--secondary-foreground': '#1f2937',
					'--accent-foreground': '#1f2937',
					'--muted-foreground': '#525866',
					'--border': 'rgba(15, 23, 42, 0.11)',
					'--input': 'rgba(15, 23, 42, 0.16)',
				} as React.CSSProperties)
			: theme === 'dark'
				? ({
						colorScheme: 'dark',
						'--lightningcss-light': ' ',
						'--lightningcss-dark': 'initial',
						'--background': '#0e1014',
						'--card': '#15181e',
						'--popover': '#191d24',
						'--input-surface': '#1b1f27',
						'--muted': '#1d222b',
						'--secondary': '#1d222b',
						'--accent': '#1d222b',
						'--foreground': '#f3f4f6',
						'--card-foreground': '#f3f4f6',
						'--popover-foreground': '#f3f4f6',
						'--secondary-foreground': '#f3f4f6',
						'--accent-foreground': '#f3f4f6',
						'--muted-foreground': '#9ca3af',
						'--border': 'rgba(255, 255, 255, 0.10)',
						'--input': 'rgba(255, 255, 255, 0.14)',
					} as React.CSSProperties)
				: undefined;

	return (
		<AppShell
			title={title}
			subtitle={subtitle}
			icon="layout-template"
			headerActions={
				<a
					href={workspaceUrl}
					data-rw-showcase-back-link=""
					className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
				>
					<DynamicIcon name="arrow-left" className="size-3.5 shrink-0" />
					<span>Back to Workspace</span>
				</a>
			}
		>
			<div className="space-y-4">
				<Card className="sticky top-2 z-20 border-border/90 bg-card/95 backdrop-blur-sm shadow-xs">
					<CardContent className="space-y-3 p-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Viewport resolution">
								{VIEWPORT_OPTIONS.map((opt) => (
									<Button
										key={opt.key}
										type="button"
										size="xs"
										variant={viewport === opt.key ? 'primary' : 'outline'}
										icon={opt.icon}
										data-rw-showcase-viewport={opt.key}
										aria-pressed={viewport === opt.key}
										onClick={() => setViewport(opt.key)}
									>
										{opt.label}
									</Button>
								))}
							</div>

							<div className="flex flex-wrap items-center gap-1.5">
								<div className="flex items-center gap-1" role="group" aria-label="Theme override">
									{THEME_OPTIONS.map((opt) => (
										<Button
											key={opt.key}
											type="button"
											size="xs"
											variant={theme === opt.key ? 'secondary' : 'ghost'}
											icon={opt.icon}
											data-rw-showcase-theme={opt.key}
											aria-pressed={theme === opt.key}
											onClick={() => setTheme(opt.key)}
										>
											{opt.label}
										</Button>
									))}
								</div>
								<Button
									type="button"
									size="xs"
									variant="outline"
									icon="scan-line"
									data-rw-showcase-check-overflow=""
									onClick={handleCheckOverflow}
								>
									Check Overflow
								</Button>
								<Button
									type="button"
									size="xs"
									variant="ghost"
									icon="rotate-ccw"
									data-rw-showcase-reset=""
									onClick={handleReset}
								>
									Reset
								</Button>
							</div>
						</div>

						<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2">
							<div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Section filter">
								{SECTION_OPTIONS.map((opt) => (
									<Button
										key={opt.key}
										type="button"
										size="xs"
										variant={section === opt.key ? 'primary' : 'ghost'}
										data-rw-showcase-filter={opt.key}
										aria-pressed={section === opt.key}
										onClick={() => setSection(opt.key)}
									>
										{opt.label}
									</Button>
								))}
							</div>

							{aggregatedAudit ? (
								<div className="flex flex-wrap items-center gap-2" data-rw-showcase-audit-summary="">
									<Badge variant="outline" className="font-mono text-[10px]">
										Cases: {aggregatedAudit.totalCases}
									</Badge>
									<Badge
										variant={aggregatedAudit.overflowCount === 0 ? 'success' : 'danger'}
										className="font-mono text-[10px]"
										data-rw-showcase-overflow-count={String(aggregatedAudit.overflowCount)}
									>
										Overflows: {aggregatedAudit.overflowCount}
									</Badge>
									{aggregatedAudit.crushedCount > 0 ? (
										<Badge
											variant="warning"
											className="font-mono text-[10px]"
											data-rw-showcase-crushed-count={String(aggregatedAudit.crushedCount)}
										>
											Crushed: {aggregatedAudit.crushedCount}
										</Badge>
									) : null}
									{aggregatedAudit.offenders.length > 0 || aggregatedAudit.crushed.length > 0 ? (
										<Button
											type="button"
											size="xs"
											variant="outline"
											onClick={() => setShowOffenders((prev) => !prev)}
										>
											{showOffenders ? 'Hide Details' : 'Show Details'}
										</Button>
									) : null}
								</div>
							) : null}
						</div>

						{showOffenders &&
						aggregatedAudit &&
						(aggregatedAudit.offenders.length > 0 || aggregatedAudit.crushed.length > 0) ? (
							<div className="max-h-48 overflow-y-auto rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
								<ul className="space-y-1">
									{[...aggregatedAudit.offenders, ...aggregatedAudit.crushed].map((item, idx) => (
										<li key={`${item.frameId}-${item.caseId}-${item.reason}-${idx}`} className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
											<Badge variant={item.reason === 'crushed' ? 'warning' : 'danger'} className="text-[10px]">
												+{item.deltaPx}px{item.reason === 'crushed' ? ' CRUSHED' : ''}
											</Badge>
											<span>{item.viewportWidth}px</span>
											<span className="font-semibold text-foreground">{item.caseId}</span>
											<span className="text-muted-foreground">
												&lt;{item.elementTag}&gt; ({item.reason})
											</span>
										</li>
									))}
								</ul>
							</div>
						) : null}
					</CardContent>
				</Card>

				{viewport === 'direct' ? (
					<div
						ref={directCanvasRef}
						data-rw-showcase-canvas="direct"
						data-rw-showcase-theme-active={theme}
						data-rw-showcase-section-active={section}
						data-rw-surface={theme !== 'auto' ? 'elevated' : undefined}
						data-theme={theme === 'auto' ? undefined : theme}
						style={scopedThemeStyle}
						className={scopedThemeClasses}
					>
						<ShowcaseSectionsList key={resetNonce} fixtures={fixtures} activeSection={section} />
					</div>
				) : null}

				{viewport === 'desktop' || viewport === 'tablet' || viewport === 'inspector' || viewport === 'mobile' ? (
					<ScaledIframeStage
						preset={FRAME_PRESETS[viewport]}
						frameId={viewport}
						src={getInitialFrameSrc(viewport)}
						registerFrameRef={registerFrameRef}
						onFrameLoaded={syncFrameState}
					/>
				) : null}

				{viewport === 'compare' ? (
					<div className="overflow-x-auto pb-2" data-rw-showcase-compare-strip="">
						<div className="flex items-start gap-4 min-w-max">
							{COMPARE_PRESETS.map((preset) => {
								const frameId = `compare-${preset.width}`;
								return (
									<ScaledIframeStage
										key={frameId}
										preset={preset}
										frameId={frameId}
										src={getInitialFrameSrc(frameId)}
										registerFrameRef={registerFrameRef}
										onFrameLoaded={syncFrameState}
										className="w-[395px] sm:w-auto shrink-0"
									/>
								);
							})}
						</div>
					</div>
				) : null}
			</div>
		</AppShell>
	);
}

export function UiShowcasePage(props: UiShowcasePageProps): React.ReactElement {
	const initialSection: ShowcaseSectionKey = props.initialSection || 'all';
	const initialTheme: ShowcaseThemeMode = props.initialTheme || 'auto';
	const sampleBaseUrl = props.sampleBaseUrl || '?sample=';
	const showcaseUrl = resolveSameOriginUrl(props.showcaseUrl, '');
	const workspaceUrl = resolveSameOriginUrl(props.workspaceUrl, '../');

	const fixtures = useMemo(() => buildShowcaseFixtures(sampleBaseUrl), [sampleBaseUrl]);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			if (!runtime.Calendar.isLoaded()) {
				void runtime.ensureCalendarLoaded();
			}
			void runtime.ensureExtraFieldsLoaded();
		}
	}, []);

	if (props.embedded) {
		return (
			<EmbeddedUiShowcaseCanvas
				initialSection={initialSection}
				initialTheme={initialTheme}
				fixtures={fixtures}
			/>
		);
	}

	return (
		<UiShowcaseStudio
			title={props.title || 'UI Showcase'}
			subtitle={
				props.subtitle ||
				'Inspect form controls, media, links, relations, and UI primitives across responsive viewports.'
			}
			initialSection={initialSection}
			initialTheme={initialTheme}
			workspaceUrl={workspaceUrl}
			showcaseUrl={showcaseUrl}
			fixtures={fixtures}
		/>
	);
}

registerPages({
	'ReactWorkspace/UiShowcase': UiShowcasePage as unknown as React.ComponentType<Record<string, unknown>>,
});

export default UiShowcasePage;
