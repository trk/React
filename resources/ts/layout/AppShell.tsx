import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
	isInertiaAppActive,
	SafeHead as Head,
	SafeLink as Link,
	safeRouter as router,
	safeUsePage as usePage,
	withWorkspaceShellUrl,
} from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, getCsrfToken, sanitizeHref, sanitizeSameOriginUrl } from '../lib/utils';
import { Alert, Badge, Button, ConfirmDialog, Input, useModalDialogController } from '../ui';

export interface WorkspaceStatItem {
	label: string;
	value: string;
	tone?: string;
	variant?: string;
}

export interface WorkspaceDefinitionDto {
	id: string;
	title: string;
	subtitle?: string;
	description: string;
	icon: string;
	logoUrl?: string;
	category: string;
	url: string;
	permission: string;
	process?: string;
	processModule?: string;
	component?: string;
	order: number;
	badge: string;
	badgeVariant?: string;
	pills?: string[];
	stats: WorkspaceStatItem[];
	cliCommand?: string;
	scripts?: string[];
	styles?: string[];
}

export type WorkspaceWidgetSize =
	| 'sm'
	| 'md'
	| 'lg'
	| 'full'
	| '1'
	| '2'
	| '3'
	| '4'
	| '5'
	| '6'
	| '7'
	| '8'
	| '9'
	| '10'
	| '11'
	| '12'
	| string;

export interface WorkspacePreferencesDto {
	userId?: number;
	favorites: string[];
	widgetOrder: string[];
	hiddenWidgets: string[];
	widgetSizes: Record<string, WorkspaceWidgetSize>;
	updatedAt?: string;
}

export interface WorkspaceWidgetMetricDto {
	label: string;
	value: string;
	tone?: string;
	href?: string;
}

export interface WorkspaceWidgetItemDto {
	id: string;
	title?: string;
	label?: string;
	subtitle?: string;
	badge?: string;
	badgeVariant?: string;
	href?: string;
	url?: string;
	icon?: string;
	meta?: string;
}

export interface WorkspaceWidgetActionDto {
	label: string;
	href?: string;
	url?: string;
	icon?: string;
	variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
}

export interface WorkspaceWidgetDto {
	id: string;
	workspaceId: string;
	workspaceTitle?: string;
	workspaceUrl?: string;
	title: string;
	subtitle?: string;
	description?: string;
	icon: string;
	size: WorkspaceWidgetSize;
	order: number;
	metrics?: WorkspaceWidgetMetricDto[];
	items?: WorkspaceWidgetItemDto[];
	actions?: WorkspaceWidgetActionDto[];
	status?: {
		label: string;
		tone: string;
		detail?: string;
	} | null;
	emptyText?: string;
	data?: {
		metrics?: WorkspaceWidgetMetricDto[];
		items?: WorkspaceWidgetItemDto[];
		actions?: WorkspaceWidgetActionDto[];
		status?: {
			label: string;
			tone: string;
			detail?: string;
		} | null;
		emptyText?: string;
	};
}

export interface WorkspaceSharedContext {
	appName: string;
	adminUrl: string;
	adminReturnLabel?: string;
	shellMode?: 'workspace' | 'admin';
	launcherUrl: string;
	prefsEndpoint?: string;
	processUrl?: string;
	themeMode: 'light' | 'dark' | 'system';
	useInputFocus?: boolean;
	enableKeyboardShortcuts?: boolean;
	mainColor?: string;
	user: {
		id: number;
		name: string;
		email: string;
		isSuperuser: boolean;
		roles?: string[];
	};
	activeWorkspace: WorkspaceDefinitionDto | null;
	workspaces: WorkspaceDefinitionDto[];
	preferences?: WorkspacePreferencesDto;
}

export interface AppShellNavItem {
	id?: string;
	key?: string;
	label: string;
	href?: string;
	icon?: string;
	badge?: string | number | null;
	badgeVariant?: 'default' | 'primary' | 'secondary' | 'muted' | 'outline' | 'success' | 'warning' | 'danger';
	active?: boolean;
	dividerBefore?: boolean;
	onClick?: () => void;
}

export interface AppShellNavSection {
	id: string;
	label?: string;
	items: AppShellNavItem[];
}

export interface ActionFeedbackDto {
	type: 'success' | 'warning' | 'danger' | 'primary';
	title: string;
	message: string;
	output?: string;
	timestamp?: string;
}

export interface AppShellRecordHeaderBadge {
	label: string;
	variant?: 'default' | 'primary' | 'secondary' | 'muted' | 'outline' | 'success' | 'warning' | 'danger';
	icon?: string;
	dot?: boolean;
	mono?: boolean;
}

export interface AppShellRecordHeaderProps {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	backHref?: string;
	backLabel?: string;
	onBack?: () => void;
	badges?: AppShellRecordHeaderBadge[];
	dirty?: boolean;
	dirtyLabel?: string;
	actions?: React.ReactNode;
	showHeadButtonsPortal?: boolean;
}

export interface AppShellProps {
	workspace?: WorkspaceSharedContext;
	title: string;
	subtitle?: string;
	icon?: string;
	pills?: Array<string | { label: string; variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline' }>;
	navItems?: AppShellNavItem[];
	sections?: AppShellNavSection[];
	activeNav?: string;
	activeId?: string;
	recordHeader?: AppShellRecordHeaderProps | React.ReactNode;
	headerActions?: React.ReactNode;
	actions?: React.ReactNode;
	feedback?: ActionFeedbackDto | null;
	onDismissFeedback?: () => void;
	children: React.ReactNode;
}

const MAX_INLINE_WORKSPACES = 5;
const DISALLOWED_NOTICE_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input']);

function convertNoticeDomNode(node: ChildNode, key: string): React.ReactNode {
	if (node.nodeType === 3) {
		return node.textContent;
	}
	if (node.nodeType !== 1) {
		return null;
	}

	const el = node as Element;
	const tag = el.tagName.toLowerCase();
	if (DISALLOWED_NOTICE_TAGS.has(tag)) {
		return null;
	}

	const children = Array.from(el.childNodes).map((child, idx) =>
		convertNoticeDomNode(child, `${key}-${idx}`),
	);

	switch (tag) {
		case 'br':
			return <br key={key} />;
		case 'u':
			return (
				<code
					key={key}
					className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground underline decoration-foreground/30 underline-offset-2"
				>
					{children}
				</code>
			);
		case 'code':
			return (
				<code
					key={key}
					className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground"
				>
					{children}
				</code>
			);
		case 'pre':
			return (
				<pre
					key={key}
					className="my-1.5 overflow-x-auto rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5 font-mono text-xs text-foreground"
				>
					{children}
				</pre>
			);
		case 'span': {
			const inlineStyle = (el.getAttribute('style') || '').toLowerCase();
			if (inlineStyle.includes('monospace')) {
				return (
					<code
						key={key}
						className="my-1 inline-block rounded-md border border-border/60 bg-background/80 px-2.5 py-1 font-mono text-xs font-medium text-foreground"
					>
						{children}
					</code>
				);
			}
			return <span key={key}>{children}</span>;
		}
		case 'small':
			return (
				<span key={key} className="mt-0.5 block text-xs leading-relaxed opacity-85">
					{children}
				</span>
			);
		case 'div':
		case 'p':
			return (
				<div key={key} className="mt-1 leading-relaxed">
					{children}
				</div>
			);
		case 'strong':
		case 'b':
			return (
				<strong key={key} className="font-semibold">
					{children}
				</strong>
			);
		case 'em':
		case 'i':
			return (
				<em key={key} className="italic">
					{children}
				</em>
			);
		case 'ul':
			return (
				<ul key={key} className="my-1 list-disc space-y-0.5 pl-4">
					{children}
				</ul>
			);
		case 'ol':
			return (
				<ol key={key} className="my-1 list-decimal space-y-0.5 pl-4">
					{children}
				</ol>
			);
		case 'li':
			return <li key={key}>{children}</li>;
		case 'a': {
			const safeHref = sanitizeHref(el.getAttribute('href'));
			if (!safeHref) {
				return <span key={key}>{children}</span>;
			}
			const isBlank = el.getAttribute('target') === '_blank';
			return (
				<a
					key={key}
					href={safeHref}
					target={isBlank ? '_blank' : undefined}
					rel={isBlank ? 'noopener noreferrer' : undefined}
					className="font-medium underline underline-offset-2 hover:opacity-80"
				>
					{children}
				</a>
			);
		}
		default:
			return <React.Fragment key={key}>{children}</React.Fragment>;
	}
}

export function renderNoticeMarkup(raw: string): React.ReactNode {
	if (!raw || typeof DOMParser === 'undefined' || !/[<>&#]/.test(raw)) {
		return raw;
	}
	try {
		const doc = new DOMParser().parseFromString(raw, 'text/html');
		return Array.from(doc.body.childNodes).map((node, index) =>
			convertNoticeDomNode(node, `notice-${index}`),
		);
	} catch {
		return raw;
	}
}

export async function postWorkspacePreferenceAction(
	endpoint: string,
	payload: Record<string, unknown>,
): Promise<WorkspacePreferencesDto | null> {
	if (typeof window === 'undefined' || ! window.fetch) {
		return null;
	}
	try {
		const safeEndpoint = sanitizeSameOriginUrl(endpoint) || '/_react/workspace-prefs';
		const csrf = getCsrfToken();
		const res = await window.fetch(safeEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				...(csrf.value ? { 'X-CSRF-Token': csrf.value } : {}),
			},
			body: JSON.stringify({
				...payload,
				csrf,
				...(csrf.name && csrf.value ? { [csrf.name]: csrf.value } : {}),
			}),
		});
		const json = await res.json();
		if (json && json.ok && json.preferences) {
			return json.preferences as WorkspacePreferencesDto;
		}
	} catch {
		// Ignore network errors cleanly
	}
	return null;
}

export function RecordHeader({
	title,
	subtitle,
	backHref,
	backLabel,
	onBack,
	badges = [],
	dirty,
	dirtyLabel,
	actions,
	showHeadButtonsPortal = true,
}: AppShellRecordHeaderProps): React.ReactElement {
	const [autoDirty, setAutoDirty] = useState(false);

	useEffect(() => {
		if (dirty !== undefined || typeof window === 'undefined') {
			setAutoDirty(false);
			return;
		}
		const onSchemaFormDirty = (ev: Event) => {
			const detail = (ev as CustomEvent<{ isDirty?: boolean }>).detail;
			setAutoDirty(Boolean(detail?.isDirty));
		};
		window.addEventListener('rw:schema-form-dirty', onSchemaFormDirty);
		return () => window.removeEventListener('rw:schema-form-dirty', onSchemaFormDirty);
	}, [dirty]);

	const isDirty = dirty ?? autoDirty;
	const safeBackHref = backHref ? sanitizeHref(backHref) : '';
	const resolvedBackLabel = backLabel || t('common.back', 'Back');
	const backControlClass =
		'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border border-border bg-card px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer';

	return (
		<div data-rw-record-header="" className="w-full scroll-mt-20">
			<div className="flex flex-wrap items-center justify-between gap-3">
				{/* Left Region: Record Identity (Title + Record Type Badge + Dirty Status) */}
				<div data-rw-record-identity="" className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h2
							data-rw-record-title=""
							className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg"
						>
							{title}
						</h2>
						{badges.map((b, idx) => (
							<Badge
								key={`${b.label}-${idx}`}
								variant={b.variant || 'secondary'}
								icon={b.icon}
								dot={b.dot}
								mono={b.mono}
								className="shrink-0 text-[11px]"
							>
								{b.label}
							</Badge>
						))}
						{isDirty ? (
							<Badge
								data-rw-record-status="dirty"
								variant="warning"
								dot
								className="shrink-0 text-[11px]"
							>
								{dirtyLabel || t('form.unsavedChangesTitle', 'Unsaved changes')}
							</Badge>
						) : null}
					</div>
					{subtitle ? (
						<p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
					) : null}
				</div>

				{/* Right Region: Record Actions (Back -> Secondary Actions -> Primary Save Dropdown) */}
				<div data-rw-record-actions="" className="flex shrink-0 flex-wrap items-center gap-2">
					{onBack ? (
						<button
							type="button"
							onClick={onBack}
							data-rw-record-back=""
							className={backControlClass}
						>
							<DynamicIcon name="arrow-left" className="size-3.5" />
							<span>{resolvedBackLabel}</span>
						</button>
					) : safeBackHref ? (
						<Link href={safeBackHref} data-rw-record-back="" className={backControlClass}>
							<DynamicIcon name="arrow-left" className="size-3.5" />
							<span>{resolvedBackLabel}</span>
						</Link>
					) : null}
					{actions}
					{showHeadButtonsPortal ? (
						<div
							data-rw-head-buttons=""
							className="inline-flex items-center gap-2 empty:hidden"
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}

function isRecordHeaderSpec(val: unknown): val is AppShellRecordHeaderProps {
	return (
		val !== null &&
		typeof val === 'object' &&
		!Array.isArray(val) &&
		!React.isValidElement(val) &&
		'title' in val
	);
}

function ModuleSectionNav({
	title,
	items,
	activeNav,
}: {
	title: string;
	items: AppShellNavItem[];
	activeNav?: string;
}): React.ReactElement | null {
	const navRef = useRef<HTMLElement | null>(null);
	const measureRef = useRef<HTMLDivElement | null>(null);
	const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
	const moreMenuRef = useRef<HTMLDivElement | null>(null);
	const [visibleCount, setVisibleCount] = useState<number>(items.length);
	const [moreOpen, setMoreOpen] = useState<boolean>(false);
	const [menuCoords, setMenuCoords] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });

	useEffect(() => {
		const navEl = navRef.current;
		const measureEl = measureRef.current;
		if (!navEl || !measureEl || typeof window === 'undefined') {
			return;
		}

		const recompute = () => {
			const containerWidth = navEl.clientWidth;
			if (containerWidth <= 0) {
				return;
			}
			const measuredNodes = Array.from(
				measureEl.querySelectorAll<HTMLElement>('[data-rw-nav-measure-item]')
			);
			if (measuredNodes.length === 0) {
				setVisibleCount(items.length);
				return;
			}

			const gap = 4;
			const widths = measuredNodes.map((node, idx) => {
				const base = Math.ceil(node.getBoundingClientRect().width);
				const hasSep = items[idx]?.dividerBefore && idx > 0;
				return base + (hasSep ? 9 + gap : 0);
			});

			let totalAll = 0;
			for (let i = 0; i < widths.length; i++) {
				totalAll += (widths[i] ?? 0) + (i > 0 ? gap : 0);
			}

			if (totalAll <= containerWidth - 2) {
				setVisibleCount(items.length);
				return;
			}

			const moreMeasureNode = measureEl.querySelector<HTMLElement>('[data-rw-nav-more-measure]');
			const moreReserve = Math.max(
				96,
				Math.ceil(moreMeasureNode?.getBoundingClientRect().width ?? 116) + 4
			);
			let acc = 0;
			let fit = 1;
			for (let i = 0; i < widths.length; i++) {
				const w = (widths[i] ?? 0) + (i > 0 ? gap : 0);
				if (i === 0) {
					acc = w;
					fit = 1;
					continue;
				}
				if (acc + w + gap + moreReserve <= containerWidth) {
					acc += w;
					fit = i + 1;
				} else {
					break;
				}
			}
			setVisibleCount(Math.max(1, Math.min(fit, items.length)));
		};

		recompute();
		if (typeof ResizeObserver !== 'undefined') {
			const ro = new ResizeObserver(() => recompute());
			ro.observe(navEl);
			return () => ro.disconnect();
		}
		window.addEventListener('resize', recompute);
		return () => window.removeEventListener('resize', recompute);
	}, [items, activeNav]);

	useEffect(() => {
		if (!moreOpen || typeof document === 'undefined' || typeof window === 'undefined') {
			return;
		}
		const updateMenuPosition = () => {
			const trig = moreTriggerRef.current;
			const menu = moreMenuRef.current;
			if (!trig) {
				return;
			}
			const rect = trig.getBoundingClientRect();
			const menuW = menu?.offsetWidth || 216;
			const menuH = menu?.offsetHeight || 200;
			const margin = 8;
			const left = Math.max(margin, Math.min(rect.right - menuW, window.innerWidth - menuW - margin));
			const top = Math.max(margin, Math.min(rect.bottom + 4, window.innerHeight - menuH - margin));
			setMenuCoords({ top, left });
		};
		updateMenuPosition();
		const rafId = window.requestAnimationFrame(updateMenuPosition);

		const onPointerDown = (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (
				target &&
				!moreTriggerRef.current?.contains(target) &&
				!moreMenuRef.current?.contains(target)
			) {
				setMoreOpen(false);
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				setMoreOpen(false);
				moreTriggerRef.current?.focus();
			}
		};
		document.addEventListener('mousedown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		window.addEventListener('resize', updateMenuPosition);
		window.addEventListener('scroll', updateMenuPosition, true);
		return () => {
			window.cancelAnimationFrame(rafId);
			document.removeEventListener('mousedown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('resize', updateMenuPosition);
			window.removeEventListener('scroll', updateMenuPosition, true);
		};
	}, [moreOpen]);

	if (items.length === 0) {
		return null;
	}

	const clampedVisible = Math.max(1, Math.min(visibleCount, items.length));
	const visibleItems = items.slice(0, clampedVisible);
	const overflowItems = items.slice(clampedVisible);
	const activeOverflowItem = overflowItems.find((item) => {
		const itemKey = String(item.key ?? item.id ?? item.label);
		return item.active ?? itemKey === activeNav;
	});

	const renderBadge = (item: AppShellNavItem, isActive: boolean) =>
		item.badge !== undefined && item.badge !== null && item.badge !== '' ? (
			<Badge
				variant={item.badgeVariant || (isActive ? 'primary' : 'muted')}
				mono
				className="px-1.5 py-0 text-[11px]"
			>
				{item.badge}
			</Badge>
		) : null;

	return (
		<>
			<div
				ref={measureRef}
				aria-hidden="true"
				className="pointer-events-none invisible fixed -top-[9999px] left-0 flex items-center gap-1 whitespace-nowrap"
			>
				{items.map((item) => {
					const itemKey = String(item.key ?? item.id ?? item.label);
					return (
						<span
							key={itemKey}
							data-rw-nav-measure-item=""
							className="inline-flex min-h-8 items-center gap-2 px-3 py-2 text-xs font-semibold whitespace-nowrap"
						>
							{item.icon ? <span className="inline-block size-3.5 shrink-0" /> : null}
							<span>{item.label}</span>
							{item.badge !== undefined && item.badge !== null && item.badge !== '' ? (
								<span className="px-1.5 py-0 font-mono text-[11px]">{item.badge}</span>
							) : null}
						</span>
					);
				})}
				<span
					data-rw-nav-more-measure=""
					className="inline-flex min-h-8 items-center gap-1.5 px-2.5 py-2 text-xs font-medium whitespace-nowrap"
				>
					{activeOverflowItem ? (
						<>
							{activeOverflowItem.icon ? <span className="inline-block size-3.5 shrink-0" /> : null}
							<span className="max-w-28 truncate">{activeOverflowItem.label}</span>
						</>
					) : (
						<span>{t('shell.more', 'More')}</span>
					)}
					<span className="px-1.5 py-0 font-mono text-[11px]">+{items.length}</span>
					<span className="inline-block size-3" />
				</span>
			</div>

			<nav
				ref={navRef}
				data-rw-module-nav=""
				aria-label={`${title} sections`}
				className="-mb-px flex min-w-0 items-center gap-1 border-t border-border/60 pt-2"
			>
				{visibleItems.map((item, idx) => {
					const itemKey = String(item.key ?? item.id ?? item.label);
					const isActive = item.active ?? itemKey === activeNav;
					const itemClasses = cn(
						'inline-flex min-h-8 pointer-coarse:min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer',
						isActive
							? 'border-primary text-primary font-semibold'
							: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
					);

					const content = (
						<>
							{item.icon ? <DynamicIcon name={item.icon} className="size-3.5" /> : null}
							<span>{item.label}</span>
							{renderBadge(item, isActive)}
						</>
					);

					const separator =
						item.dividerBefore && idx > 0 ? (
							<span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border/80" />
						) : null;

					if (item.onClick) {
						return (
							<React.Fragment key={itemKey}>
								{separator}
								<button
									type="button"
									onClick={item.onClick}
									aria-current={isActive ? 'page' : undefined}
									className={itemClasses}
								>
									{content}
								</button>
							</React.Fragment>
						);
					}

					const safeSubHref = item.href ? sanitizeHref(item.href) : '';
					if (safeSubHref) {
						return (
							<React.Fragment key={itemKey}>
								{separator}
								<Link
									href={safeSubHref}
									aria-current={isActive ? 'page' : undefined}
									className={itemClasses}
								>
									{content}
								</Link>
							</React.Fragment>
						);
					}

					return null;
				})}

				{overflowItems.length > 0 ? (
					<button
						ref={moreTriggerRef}
						type="button"
						data-rw-module-nav-more=""
						aria-haspopup="menu"
						aria-expanded={moreOpen}
						onClick={() => setMoreOpen((prev) => !prev)}
						className={cn(
							'ml-auto inline-flex min-h-8 pointer-coarse:min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer',
							activeOverflowItem
								? 'border-primary text-primary font-semibold'
								: moreOpen
									? 'border-border text-foreground'
									: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
						)}
					>
						{activeOverflowItem ? (
							<>
								{activeOverflowItem.icon ? (
									<DynamicIcon name={activeOverflowItem.icon} className="size-3.5" />
								) : null}
								<span className="max-w-28 truncate">{activeOverflowItem.label}</span>
								<Badge variant="primary" mono className="px-1.5 py-0 text-[11px]">
									+{overflowItems.length}
								</Badge>
							</>
						) : (
							<>
								<span>{t('shell.more', 'More')}</span>
								<Badge variant="muted" mono className="px-1.5 py-0 text-[11px]">
									+{overflowItems.length}
								</Badge>
							</>
						)}
						<DynamicIcon name="chevron-down" className="size-3 opacity-80" />
					</button>
				) : null}
			</nav>

			{moreOpen && overflowItems.length > 0 && typeof document !== 'undefined'
				? createPortal(
						<div
							ref={moreMenuRef}
							role="menu"
							aria-label={`${title} ${t('shell.more', 'More')}`}
							data-rw-module-nav-menu=""
							data-rw-portal-overlay=""
							style={{ position: 'fixed', top: `${menuCoords.top}px`, left: `${menuCoords.left}px` }}
							className="z-50 min-w-52 max-w-72 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg space-y-0.5"
						>
							{overflowItems.map((item) => {
								const itemKey = String(item.key ?? item.id ?? item.label);
								const isActive = item.active ?? itemKey === activeNav;
								const safeSubHref = item.href ? sanitizeHref(item.href) : '';
								const menuRowClass = cn(
									'flex w-full items-center justify-between gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer',
									isActive
										? 'bg-primary/12 text-primary-ink font-semibold'
										: 'text-popover-foreground hover:bg-muted'
								);
								const inner = (
									<>
										<span className="flex min-w-0 items-center gap-2">
											{item.icon ? (
												<DynamicIcon name={item.icon} className="size-3.5 shrink-0" />
											) : null}
											<span className="truncate">{item.label}</span>
										</span>
										{renderBadge(item, isActive)}
									</>
								);

								if (item.onClick) {
									return (
										<button
											key={itemKey}
											type="button"
											role="menuitem"
											onClick={() => {
												setMoreOpen(false);
												item.onClick?.();
											}}
											className={menuRowClass}
										>
											{inner}
										</button>
									);
								}
								if (safeSubHref) {
									return (
										<Link
											key={itemKey}
											href={safeSubHref}
											role="menuitem"
											onClick={() => setMoreOpen(false)}
											className={menuRowClass}
										>
											{inner}
										</Link>
									);
								}
								return null;
							})}
						</div>,
						document.body
					)
				: null}
		</>
	);
}

export function AppShell({
	workspace: propWorkspace,
	title,
	subtitle,
	icon,
	pills = [],
	navItems = [],
	sections = [],
	activeNav,
	activeId,
	recordHeader,
	headerActions,
	actions,
	feedback,
	onDismissFeedback,
	children,
}: AppShellProps): React.ReactElement {
	const resolvedHeaderActions = headerActions ?? actions;
	const resolvedActiveNav = activeNav ?? activeId;
	const hasRecordHeader = recordHeader !== undefined && recordHeader !== null && recordHeader !== false;
	const resolvedNavItems = useMemo<AppShellNavItem[]>(() => {
		if (navItems.length > 0) {
			return navItems;
		}
		if (sections.length > 0) {
			return sections.flatMap((sec) => sec.items || []);
		}
		return [];
	}, [navItems, sections]);

	const page = usePage<{
		workspace?: WorkspaceSharedContext;
		flash?: {
			messages?: string[];
			warnings?: string[];
			errors?: string[];
			feedback?: ActionFeedbackDto;
		};
	}>();

	const workspace = propWorkspace ?? page.props.workspace;
	const flash = (page as unknown as { flash?: typeof page.props.flash }).flash || page.props.flash;
	const rawActiveFeedback = feedback !== undefined ? feedback : flash?.feedback || null;
	const [dismissedFeedback, setDismissedFeedback] = useState(false);
	useEffect(() => {
		setDismissedFeedback(false);
	}, [rawActiveFeedback?.title, rawActiveFeedback?.message, rawActiveFeedback?.output]);
	const activeFeedback = dismissedFeedback ? null : rawActiveFeedback;
	const returnLabel = workspace?.adminReturnLabel || t('shell.returnToAdmin', 'Panel');
	const prefsEndpoint = workspace?.prefsEndpoint || '/_react/workspace-prefs';

	const [favorites, setFavorites] = useState<string[]>(() =>
		(workspace?.preferences?.favorites || []).map((id) => String(id).toLowerCase())
	);
	useEffect(() => {
		if (Array.isArray(workspace?.preferences?.favorites)) {
			setFavorites(workspace.preferences.favorites.map((id) => String(id).toLowerCase()));
		}
	}, [workspace?.preferences?.favorites]);

	const toggleFavoriteWorkspace = async (workspaceId: string, e?: React.MouseEvent) => {
		if (e) {
			e.preventDefault();
			e.stopPropagation();
		}
		const cleanId = workspaceId.toLowerCase();
		const previousFavorites = favorites;
		setFavorites((prev) =>
			prev.includes(cleanId) ? prev.filter((id) => id !== cleanId) : [...prev, cleanId],
		);
		const updated = await postWorkspacePreferenceAction(prefsEndpoint, {
			action: 'toggle_favorite',
			workspaceId: cleanId,
		});
		if (updated && Array.isArray(updated.favorites)) {
			setFavorites(updated.favorites.map((id) => String(id).toLowerCase()));
		} else if (updated === null) {
			setFavorites(previousFavorites);
		}
	};

	const [dismissedFlash, setDismissedFlash] = useState<{
		errors: boolean;
		warnings: boolean;
		messages: boolean;
	}>({ errors: false, warnings: false, messages: false });

	useEffect(() => {
		setDismissedFlash({ errors: false, warnings: false, messages: false });
	}, [flash?.errors, flash?.warnings, flash?.messages]);

	const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
		if (
			workspace?.themeMode === 'light' ||
			workspace?.themeMode === 'dark' ||
			workspace?.themeMode === 'system'
		) {
			return workspace.themeMode;
		}
		if (typeof window !== 'undefined') {
			const saved = window.localStorage.getItem('react-workspace-theme-mode');
			if (saved === 'light' || saved === 'dark' || saved === 'system') {
				return saved;
			}
		}
		return 'system';
	});

	useEffect(() => {
		if (
			workspace?.themeMode === 'light' ||
			workspace?.themeMode === 'dark' ||
			workspace?.themeMode === 'system'
		) {
			setThemeMode(workspace.themeMode);
		}
	}, [workspace?.themeMode]);

	useEffect(() => {
		if (typeof document === 'undefined') {
			return;
		}
		const applyScheme = () => {
			const isDark =
				themeMode === 'dark' ||
				(themeMode === 'system' &&
					typeof window !== 'undefined' &&
					window.matchMedia('(prefers-color-scheme: dark)').matches);

			document.documentElement.classList.toggle('dark', isDark);
			document.documentElement.classList.toggle('light', !isDark);
			document.documentElement.setAttribute('data-theme-mode', themeMode);
			document.body.classList.toggle('dark-theme', isDark);
			document.body.classList.toggle('light-theme', !isDark);
			document.body.classList.toggle('auto-theme', themeMode === 'system');
		};
		applyScheme();
		try {
			window.localStorage.setItem('react-workspace-theme-mode', themeMode);
		} catch {
			// Ignore storage restrictions
		}
		if (
			themeMode === 'system' &&
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function'
		) {
			const mql = window.matchMedia('(prefers-color-scheme: dark)');
			if (typeof mql.addEventListener === 'function') {
				mql.addEventListener('change', applyScheme);
				return () => mql.removeEventListener('change', applyScheme);
			}
		}
		return undefined;
	}, [themeMode]);

	const cycleTheme = () => {
		const nextMode: 'light' | 'dark' | 'system' =
			themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system';
		setThemeMode(nextMode);
		if (workspace) {
			void postWorkspacePreferenceAction(prefsEndpoint, {
				action: 'set_theme_mode',
				themeMode: nextMode,
			});
		}
	};

	const rawWorkspaces = workspace?.workspaces;
	const workspaces = useMemo<WorkspaceDefinitionDto[]>(() => {
		const list: WorkspaceDefinitionDto[] = Array.isArray(rawWorkspaces)
			? rawWorkspaces
			: rawWorkspaces && typeof rawWorkspaces === 'object'
				? Object.values(rawWorkspaces)
				: [];
		const favOrder = new Map(favorites.map((id, idx) => [id.toLowerCase(), idx]));
		return [...list].sort((a, b) => {
			const aFav = favOrder.get(a.id.toLowerCase());
			const bFav = favOrder.get(b.id.toLowerCase());
			if (aFav !== undefined && bFav !== undefined) {
				return aFav - bFav;
			}
			if (aFav !== undefined) {
				return -1;
			}
			if (bFav !== undefined) {
				return 1;
			}
			if (a.order !== b.order) {
				return a.order - b.order;
			}
			return a.title.localeCompare(b.title);
		});
	}, [rawWorkspaces, favorites]);

	const activeWorkspace = workspace?.activeWorkspace;

	const isWorkspaceActive = (ws: WorkspaceDefinitionDto): boolean => {
		const wsProcess = ws.process || ws.processModule;
		const activeProcess = activeWorkspace?.process || activeWorkspace?.processModule;
		return (
			activeWorkspace?.id === ws.id ||
			(Boolean(wsProcess) && activeProcess === wsProcess)
		);
	};

	// Keep up to MAX_INLINE_WORKSPACES in the top bar while ensuring the active workspace is always visible inline
	const { primaryWorkspaces, overflowWorkspaces } = useMemo(() => {
		if (workspaces.length <= MAX_INLINE_WORKSPACES) {
			return { primaryWorkspaces: workspaces, overflowWorkspaces: [] as WorkspaceDefinitionDto[] };
		}
		const primary = workspaces.slice(0, MAX_INLINE_WORKSPACES);
		const overflow = workspaces.slice(MAX_INLINE_WORKSPACES);
		const activeInOverflowIdx = overflow.findIndex((ws) => isWorkspaceActive(ws));
		if (activeInOverflowIdx >= 0 && primary.length > 0) {
			const activeItem = overflow[activeInOverflowIdx];
			const swappedOut = primary[primary.length - 1];
			if (activeItem && swappedOut) {
				primary[primary.length - 1] = activeItem;
				overflow[activeInOverflowIdx] = swappedOut;
			}
		}
		return { primaryWorkspaces: primary, overflowWorkspaces: overflow };
	}, [workspaces, activeWorkspace]);

	const [moreMenuOpen, setMoreMenuOpen] = useState(false);
	const [moreFilter, setMoreFilter] = useState('');
	const moreMenuRef = useRef<HTMLDivElement | null>(null);

	const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
	const [commandOpen, setCommandOpen] = useState(false);
	const [commandQuery, setCommandQuery] = useState('');
	const [commandActiveIndex, setCommandActiveIndex] = useState(0);
	const commandListId = useId();
	const commandDialogRef = useRef<HTMLDialogElement | null>(null);
	const mobileDrawerRef = useRef<HTMLDialogElement | null>(null);
	const commandDialogCtrl = useModalDialogController(commandDialogRef, commandOpen, setCommandOpen);
	const mobileDrawerCtrl = useModalDialogController(mobileDrawerRef, mobileDrawerOpen, setMobileDrawerOpen);

	useEffect(() => {
		if (!moreMenuOpen) {
			return;
		}
		const handleClickOutside = (ev: MouseEvent) => {
			if (moreMenuRef.current && !moreMenuRef.current.contains(ev.target as Node)) {
				setMoreMenuOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [moreMenuOpen]);

	const isEmbeddedIsland = !workspace && !isInertiaAppActive();
	const shellMode: 'workspace' | 'admin' =
		workspace?.shellMode === 'admin'
			? 'admin'
			: workspace?.shellMode === 'workspace'
				? 'workspace'
				: typeof document !== 'undefined' &&
					  document.documentElement.getAttribute('data-rw-shell-mode') === 'admin'
					? 'admin'
					: 'workspace';
	const isClassicAdminShell = !isEmbeddedIsland && shellMode === 'admin';
	const showGlobalWorkspaceBar = !isEmbeddedIsland && !isClassicAdminShell;
	const enableShortcuts = !isEmbeddedIsland && workspace?.enableKeyboardShortcuts !== false;

	useEffect(() => {
		if (!enableShortcuts) {
			return;
		}
		const onKeyDown = (ev: KeyboardEvent) => {
			if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
				ev.preventDefault();
				setCommandOpen((prev) => !prev);
				setCommandQuery('');
				setCommandActiveIndex(0);
			} else if (ev.key === 'Escape') {
				setMoreMenuOpen(false);
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [enableShortcuts]);

	const filteredOverflow = useMemo(() => {
		const q = moreFilter.trim().toLowerCase();
		if (!q) {
			return overflowWorkspaces;
		}
		return workspaces.filter((ws) =>
			`${ws.title} ${ws.category} ${ws.description}`.toLowerCase().includes(q),
		);
	}, [overflowWorkspaces, workspaces, moreFilter]);

	const filteredCommandItems = useMemo(() => {
		const q = commandQuery.trim().toLowerCase();
		const items: Array<{
			id: string;
			label: string;
			subtitle: string;
			icon: string;
			href?: string;
			onClick?: () => void;
			isInertia?: boolean;
		}> = [];

		for (const ws of workspaces) {
			items.push({
				id: `ws-${ws.id}`,
				label: ws.title,
				subtitle: ws.description || ws.category || 'Workspace',
				icon: ws.icon || 'cubes',
				href: withWorkspaceShellUrl(ws.url, showGlobalWorkspaceBar),
				isInertia: showGlobalWorkspaceBar && Boolean(ws.component),
			});
		}

		for (const nav of resolvedNavItems) {
			const navKey = String(nav.key ?? nav.id ?? nav.label);
			items.push({
				id: `sec-${navKey}`,
				label: `${title}: ${nav.label}`,
				subtitle: t('shell.currentWorkspaceSection', 'Current workspace section'),
				icon: nav.icon || 'layers',
				href: nav.href,
				onClick: nav.onClick,
				isInertia: true,
			});
		}

		if (workspace?.launcherUrl) {
			items.push({
				id: 'global-workspace-launcher',
				label: t('shell.workspaceDashboard', 'Workspace Dashboard'),
				subtitle: t('shell.workspaceDashboardSubtitle', 'All modules, favorites, and customizable dashboard widgets'),
				icon: 'layout-grid',
				href: workspace.launcherUrl,
				isInertia: showGlobalWorkspaceBar,
			});
		}

		if (showGlobalWorkspaceBar) {
			items.push({
				id: 'global-admin-return',
				label: t('shell.returnToTarget', { target: returnLabel }, 'Return to {target}'),
				subtitle: workspace?.adminUrl || '/processwire/',
				icon: 'arrow-left',
				href: workspace?.adminUrl || '/processwire/',
				isInertia: false,
			});
		}

		if (!q) {
			return items;
		}
		return items.filter((item) =>
			`${item.label} ${item.subtitle}`.toLowerCase().includes(q),
		);
	}, [workspaces, resolvedNavItems, title, workspace?.launcherUrl, workspace?.adminUrl, returnLabel, commandQuery, showGlobalWorkspaceBar]);

	useEffect(() => {
		setCommandActiveIndex(0);
	}, [commandQuery, commandOpen]);

	const executeCommandItem = (item: (typeof filteredCommandItems)[number] | undefined) => {
		if (!item) {
			return;
		}
		setCommandOpen(false);
		if (item.onClick) {
			item.onClick();
			return;
		}
		const safeItemHref = sanitizeHref(item.href);
		if (!safeItemHref) {
			return;
		}
		if (item.isInertia && isInertiaAppActive()) {
			router.visit(safeItemHref);
		} else if (typeof window !== 'undefined') {
			window.location.href = safeItemHref;
		}
	};

	useEffect(() => {
		if (typeof document === 'undefined' || isEmbeddedIsland) {
			return;
		}
		document.documentElement.setAttribute('data-rw-shell-mode', shellMode);
		if (workspace?.adminUrl) {
			document.documentElement.setAttribute('data-rw-admin-root', workspace.adminUrl);
		}
		if (workspace?.launcherUrl) {
			try {
				const parsedLauncher = new URL(workspace.launcherUrl, window.location.origin);
				document.documentElement.setAttribute('data-rw-launcher-path', parsedLauncher.pathname);
			} catch {
				document.documentElement.setAttribute('data-rw-launcher-path', workspace.launcherUrl);
			}
		}
	}, [isEmbeddedIsland, shellMode, workspace?.adminUrl, workspace?.launcherUrl]);

	const openInWorkspaceHref = useMemo(() => {
		if (!isClassicAdminShell) {
			return '';
		}
		const safeLauncher = sanitizeHref(workspace?.launcherUrl);
		if (!safeLauncher) {
			return '';
		}
		const currentPath =
			(typeof page.url === 'string' && page.url.trim() !== '' ? page.url : '') ||
			(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '') ||
			workspace?.activeWorkspace?.url ||
			safeLauncher;
		return (
			sanitizeHref(
				withWorkspaceShellUrl(currentPath, true, workspace?.adminUrl, workspace?.launcherUrl)
			) || safeLauncher
		);
	}, [isClassicAdminShell, page.url, workspace?.activeWorkspace?.url, workspace?.adminUrl, workspace?.launcherUrl]);

	const [dirtyFormsMap, setDirtyFormsMap] = useState<Record<string, { guarded: boolean }>>({});
	const [pendingDirtyVisitUrl, setPendingDirtyVisitUrl] = useState<string | null>(null);
	const bypassDirtyNavRef = useRef(false);

	useEffect(() => {
		setDirtyFormsMap({});
		setPendingDirtyVisitUrl(null);
		bypassDirtyNavRef.current = false;
	}, [page.url]);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}
		const onSchemaFormDirty = (ev: Event) => {
			const detail = (
				ev as CustomEvent<{ formId?: string; isDirty?: boolean; dirtyGuard?: boolean }>
			).detail;
			const formKey = String(detail?.formId || '__default__');
			const dirtyNext = Boolean(detail?.isDirty);
			const guardedNext = detail?.dirtyGuard !== false;
			setDirtyFormsMap((prev) => {
				if (dirtyNext) {
					const existing = prev[formKey];
					if (existing && existing.guarded === guardedNext) {
						return prev;
					}
					return { ...prev, [formKey]: { guarded: guardedNext } };
				}
				if (!(formKey in prev)) {
					return prev;
				}
				const next = { ...prev };
				delete next[formKey];
				return next;
			});
		};
		window.addEventListener('rw:schema-form-dirty', onSchemaFormDirty);
		return () => window.removeEventListener('rw:schema-form-dirty', onSchemaFormDirty);
	}, []);

	const hasDirtySchemaForm = Object.keys(dirtyFormsMap).length > 0;
	const hasGuardedDirtySchemaForm = Object.values(dirtyFormsMap).some((entry) => entry.guarded);

	useEffect(() => {
		if (isEmbeddedIsland || !hasGuardedDirtySchemaForm || !isInertiaAppActive()) {
			return;
		}
		if (typeof router.on !== 'function') {
			return;
		}
		const unsub = router.on(
			'before',
			(event: {
				detail?: { visit?: { method?: string; url?: string | URL | { href?: string } } };
				preventDefault?: () => void;
			}) => {
				if (bypassDirtyNavRef.current) {
					bypassDirtyNavRef.current = false;
					return;
				}
				const visit = event?.detail?.visit;
				const method = String(visit?.method || 'get').toLowerCase();
				if (method !== 'get') {
					return;
				}
				const rawUrl = visit?.url;
				const targetHref =
					typeof rawUrl === 'string'
						? rawUrl
						: rawUrl instanceof URL
							? `${rawUrl.pathname}${rawUrl.search}${rawUrl.hash}`
							: rawUrl && typeof rawUrl === 'object' && typeof rawUrl.href === 'string'
								? rawUrl.href
								: '';
				if (!targetHref || typeof window === 'undefined') {
					return;
				}
				try {
					const parsedTarget = new URL(targetHref, window.location.origin);
					const currentKey = `${window.location.pathname}${window.location.search}`;
					const targetKey = `${parsedTarget.pathname}${parsedTarget.search}`;
					if (targetKey === currentKey) {
						return;
					}
					event.preventDefault?.();
					setPendingDirtyVisitUrl(`${parsedTarget.pathname}${parsedTarget.search}${parsedTarget.hash}`);
				} catch {
					// Ignore malformed URLs
				}
			}
		);
		return () => {
			if (typeof unsub === 'function') {
				unsub();
			}
		};
	}, [isEmbeddedIsland, hasGuardedDirtySchemaForm]);

	const hasAncestorMain =
		typeof document !== 'undefined' &&
		(isEmbeddedIsland
			? Boolean(document.querySelector('main'))
			: isClassicAdminShell && Boolean(document.getElementById('app')?.closest('main')));
	const MainContainer: 'main' | 'div' = hasAncestorMain ? 'div' : 'main';
	const ModuleHeadingTag: 'h1' | 'h2' = isEmbeddedIsland ? 'h2' : 'h1';

	return (
		<div
			data-rw-app-shell={isEmbeddedIsland ? undefined : isClassicAdminShell ? 'admin' : ''}
			className={cn(
				showGlobalWorkspaceBar ? 'min-h-screen' : 'min-h-0 flex-1',
				'bg-background text-foreground flex flex-col'
			)}
		>
			<Head title={title} />

			{/* Top Global Bar: Configurable Admin Return Button, Workspace Switcher, Overflow Popover, Command Palette, Mobile Drawer */}
			{showGlobalWorkspaceBar ? (
			<header
				data-rw-global-bar=""
				className="sticky top-0 z-30 border-b border-masthead-border bg-masthead/95 text-masthead-foreground backdrop-blur-xs"
			>
				<div className="mx-auto flex h-13 max-w-[1600px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
					<div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
						{/* Mobile Hamburger Drawer Button */}
						<button
							type="button"
							onClick={() => setMobileDrawerOpen(true)}
							aria-label={t('shell.openNavigationMenu', 'Open workspace navigation menu')}
							data-rw-mobile-menu-trigger
							className="inline-flex size-8 pointer-coarse:size-10 items-center justify-center rounded-md border border-masthead-border bg-input-surface text-masthead-foreground transition-colors hover:bg-muted hover:text-masthead-active lg:hidden cursor-pointer"
						>
							<DynamicIcon name="menu" className="size-4" />
						</button>

						<a
							href={sanitizeHref(workspace?.adminUrl) || '/processwire/'}
							data-rw-admin-return
							className="inline-flex h-8 items-center gap-1.5 rounded-md border border-masthead-border bg-input-surface px-2.5 text-xs font-medium text-masthead-foreground transition-colors hover:bg-muted hover:text-masthead-active shrink-0"
							title={t('shell.returnToTarget', { target: returnLabel }, 'Return to {target}')}
						>
							<DynamicIcon name="arrow-left" className="size-3.5" />
							<span>{returnLabel}</span>
						</a>

						{sanitizeHref(workspace?.launcherUrl) ? (
							<Link
								href={sanitizeHref(workspace?.launcherUrl)}
								className={cn(
									'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors shrink-0',
									!activeWorkspace
										? 'bg-primary/12 text-primary-ink font-semibold'
										: 'text-masthead-foreground hover:bg-muted hover:text-masthead-active'
								)}
								title={t('shell.workspaceDashboard', 'Workspace Dashboard')}
							>
								<DynamicIcon name="layout-grid" className="size-3.5 text-primary" />
								<span className="hidden sm:inline">{t('shell.workspace', 'Workspace')}</span>
							</Link>
						) : null}

						{workspaces.length > 0 ? (
							<>
								<span className="hidden lg:inline text-masthead-border select-none">/</span>
								<nav
									aria-label={t('shell.workspaces', 'Workspaces')}
									className="hidden lg:flex items-center gap-1 min-w-0"
								>
									{primaryWorkspaces.map((ws) => {
										const isCurrent = isWorkspaceActive(ws);
										const isFav = favorites.includes(ws.id.toLowerCase());
										const safeWsUrl = sanitizeHref(withWorkspaceShellUrl(ws.url, true)) || '#';
										const linkClassName = cn(
											'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap',
											isCurrent
												? 'bg-primary/12 text-primary-ink font-semibold'
												: 'text-masthead-foreground hover:bg-muted hover:text-masthead-active'
										);
										const content = (
											<>
												<DynamicIcon name={ws.icon} className="size-3.5" />
												<span>{ws.title}</span>
												{isFav ? (
													<DynamicIcon
														name="star"
														className="size-2.5 text-warning fill-current opacity-85"
													/>
												) : null}
											</>
										);
										return ws.component ? (
											<Link key={ws.id} href={safeWsUrl} className={linkClassName}>
												{content}
											</Link>
										) : (
											<a key={ws.id} href={safeWsUrl} className={linkClassName}>
												{content}
											</a>
										);
									})}

									{overflowWorkspaces.length > 0 ? (
										<div className="relative" ref={moreMenuRef}>
											<button
												type="button"
												onClick={() => {
													setMoreMenuOpen((prev) => !prev);
													setMoreFilter('');
												}}
												aria-expanded={moreMenuOpen}
												data-rw-more-workspaces-trigger
												className={cn(
													'inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors cursor-pointer',
													moreMenuOpen
														? 'border-masthead-border bg-muted text-masthead-active'
														: 'border-transparent bg-transparent text-masthead-foreground hover:border-masthead-border hover:bg-input-surface hover:text-masthead-active'
												)}
											>
												<span>{t('shell.more', 'More')}</span>
												<Badge variant="secondary" mono className="px-1 py-0 text-[11px]">
													+{overflowWorkspaces.length}
												</Badge>
												<DynamicIcon name="chevron-down" className="size-3" />
											</button>

											{moreMenuOpen ? (
												<div
													data-rw-more-workspaces-menu
													className="absolute left-0 top-full mt-1.5 w-72 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg z-50 space-y-2"
												>
													<div className="relative">
														<DynamicIcon
															name="search"
															className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
														/>
														<Input
															type="search"
															aria-label={t('shell.findWorkspace', 'Find workspace...')}
															value={moreFilter}
															onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMoreFilter(e.target.value)}
															placeholder={t('shell.findWorkspace', 'Find workspace...')}
															className="h-8 pl-8 text-xs"
														/>
													</div>
													<div className="max-h-64 overflow-y-auto divide-y divide-border/40">
														{filteredOverflow.length === 0 ? (
															<p className="py-3 text-center text-xs text-muted-foreground">
																{t('shell.noMatchingWorkspaces', 'No matching workspaces')}
															</p>
														) : (
															filteredOverflow.map((ws) => {
																const isFav = favorites.includes(ws.id.toLowerCase());
																const isCurrent = isWorkspaceActive(ws);
																const safeOverflowWsUrl = sanitizeHref(withWorkspaceShellUrl(ws.url, true)) || '#';
																return (
																	<div
																		key={ws.id}
																		className="flex items-center justify-between gap-1 py-1"
																	>
																		{ws.component ? (
																			<Link
																				href={safeOverflowWsUrl}
																				onClick={() => setMoreMenuOpen(false)}
																				className={cn(
																					'flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors min-w-0',
																					isCurrent
																						? 'bg-primary/12 text-primary-ink font-semibold'
																						: 'hover:bg-muted text-foreground'
																				)}
																			>
																				<DynamicIcon name={ws.icon} className="size-3.5 shrink-0 text-primary" />
																				<div className="min-w-0 flex-1">
																					<div className="truncate font-medium">{ws.title}</div>
																					{ws.category ? (
																						<div className="truncate text-[11px] text-muted-foreground">
																							{ws.category}
																						</div>
																					) : null}
																				</div>
																			</Link>
																		) : (
																			<a
																				href={safeOverflowWsUrl}
																				className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted text-foreground min-w-0"
																			>
																				<DynamicIcon name={ws.icon} className="size-3.5 shrink-0 text-primary" />
																				<span className="truncate font-medium">{ws.title}</span>
																			</a>
																		)}
																		<button
																			type="button"
																			onClick={(e) => toggleFavoriteWorkspace(ws.id, e)}
																			aria-label={isFav ? 'Remove from favorites' : 'Pin to favorites'}
																			title={isFav ? 'Remove from favorites' : 'Pin to favorites'}
																			className={cn(
																				'inline-flex size-7 items-center justify-center rounded-md transition-colors cursor-pointer shrink-0',
																				isFav
																					? 'text-warning hover:bg-muted'
																					: 'text-muted-foreground/50 hover:bg-muted hover:text-foreground'
																			)}
																		>
																			<DynamicIcon
																				name="star"
																				className={cn('size-3.5', isFav && 'fill-current')}
																			/>
																		</button>
																	</div>
																);
															})
														)}
													</div>
												</div>
											) : null}
										</div>
									) : null}
								</nav>
							</>
						) : null}
					</div>

					<div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
						{workspace?.enableKeyboardShortcuts !== false ? (
							<button
								type="button"
								onClick={() => {
									setCommandOpen(true);
									setCommandQuery('');
								}}
								data-rw-command-trigger
								className="inline-flex h-8 items-center gap-2 rounded-md border border-masthead-border bg-input-surface px-2.5 text-xs text-masthead-foreground transition-colors hover:bg-muted hover:text-masthead-active cursor-pointer"
								title={t('shell.quickSwitcherShortcut', 'Quick Switcher (Cmd/Ctrl+K)')}
							>
								<DynamicIcon name="search" className="size-3.5" />
								<span className="hidden xl:inline">{t('shell.quickJump', 'Quick Jump')}</span>
								<kbd className="hidden sm:inline-block rounded border border-border bg-muted px-1 py-0.5 font-mono text-[11px] leading-none text-muted-foreground">
									⌘K
								</kbd>
							</button>
						) : null}

						{workspace?.user ? (
							<Badge
								variant="outline"
								icon={workspace.user.isSuperuser ? 'shield' : 'user'}
								className="hidden md:inline-flex border-masthead-border bg-input-surface/70 text-masthead-foreground font-normal"
							>
								<span>{workspace.user.name}</span>
							</Badge>
						) : null}

						<button
							type="button"
							onClick={cycleTheme}
							className="inline-flex h-8 items-center gap-1.5 rounded-md border border-masthead-border bg-input-surface px-2.5 text-xs font-medium text-masthead-foreground transition-colors hover:bg-muted hover:text-masthead-active cursor-pointer"
							aria-label={t('shell.themeModeTooltip', { mode: themeMode }, 'Theme mode: {mode} (click to switch)')}
							title={t('shell.themeModeTooltip', { mode: themeMode }, 'Theme mode: {mode} (click to switch)')}
						>
							<DynamicIcon
								name={themeMode === 'dark' ? 'moon' : themeMode === 'light' ? 'sun' : 'monitor'}
								className="size-3.5"
							/>
							<span className="hidden sm:inline capitalize">
								{themeMode === 'dark'
									? t('shell.themeDark', 'Dark')
									: themeMode === 'light'
										? t('shell.themeLight', 'Light')
										: t('shell.themeSystem', 'System')}
							</span>
						</button>
					</div>
				</div>
			</header>
			) : null}

			{/* Mobile Responsive Drawer (Native Top-Layer <dialog>) */}
			{showGlobalWorkspaceBar && mobileDrawerOpen && typeof document !== 'undefined'
				? createPortal(
						<dialog
							ref={mobileDrawerRef}
							aria-label={t('shell.workspaceNavigation', 'Workspace navigation')}
							data-rw-drawer-dialog=""
							data-rw-mobile-drawer=""
							data-rw-portal-overlay=""
							{...({ closedby: 'any' } as Record<string, string>)}
							onPointerDown={mobileDrawerCtrl.handlePointerDown}
							onPointerUp={mobileDrawerCtrl.handlePointerUp}
							onClose={mobileDrawerCtrl.handleClose}
							className="lg:hidden text-card-foreground"
						>
							<div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
								<div className="flex items-center gap-2">
									<DynamicIcon name="layout-grid" className="size-4 text-primary" />
									<span className="text-sm font-semibold">{title}</span>
								</div>
								<button
									type="button"
									onClick={() => setMobileDrawerOpen(false)}
									aria-label={t('shell.closeNavigationMenu', 'Close navigation menu')}
									className="inline-flex size-8 pointer-coarse:size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
								>
									<DynamicIcon name="x" className="size-4" />
								</button>
							</div>

							<div className="flex-1 overflow-y-auto p-3 space-y-4">
								<div className="grid grid-cols-2 gap-2">
									<a
										href={sanitizeHref(workspace?.adminUrl) || '/processwire/'}
										className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
									>
										<DynamicIcon name="arrow-left" className="size-3.5" />
										<span>{returnLabel}</span>
									</a>
									{sanitizeHref(workspace?.launcherUrl) ? (
										<Link
											href={sanitizeHref(workspace?.launcherUrl)}
											onClick={() => setMobileDrawerOpen(false)}
											className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary-ink hover:bg-primary/15"
										>
											<DynamicIcon name="layout-grid" className="size-3.5" />
											<span>{t('shell.workspace', 'Workspace')}</span>
										</Link>
									) : null}
								</div>

								{resolvedNavItems.length > 0 ? (
									<div className="space-y-1">
										<div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
											{title} Sections
										</div>
										{resolvedNavItems.map((item) => {
											const itemKey = String(item.key ?? item.id ?? item.label);
											const isActive = item.active ?? itemKey === resolvedActiveNav;
											const cls = cn(
												'flex w-full min-h-8 pointer-coarse:min-h-11 items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-colors',
												isActive
													? 'bg-primary/12 text-primary-ink font-semibold'
													: 'text-foreground hover:bg-muted'
											);
											if (item.onClick) {
												return (
													<button
														key={itemKey}
														type="button"
														onClick={() => {
															item.onClick?.();
															setMobileDrawerOpen(false);
														}}
														className={cls}
													>
														<span className="flex items-center gap-2">
															{item.icon ? <DynamicIcon name={item.icon} className="size-3.5" /> : null}
															<span>{item.label}</span>
														</span>
														{item.badge !== undefined && item.badge !== null && item.badge !== '' ? (
															<Badge variant="secondary" mono className="px-1.5 py-0 text-[11px]">
																{item.badge}
															</Badge>
														) : null}
													</button>
												);
											}
											const safeMobileHref = item.href ? sanitizeHref(item.href) : '';
											if (safeMobileHref) {
												return (
													<Link
														key={itemKey}
														href={safeMobileHref}
														onClick={() => setMobileDrawerOpen(false)}
														className={cls}
													>
														<span className="flex items-center gap-2">
															{item.icon ? <DynamicIcon name={item.icon} className="size-3.5" /> : null}
															<span>{item.label}</span>
														</span>
														{item.badge !== undefined && item.badge !== null && item.badge !== '' ? (
															<Badge variant="secondary" mono className="px-1.5 py-0 text-[11px]">
																{item.badge}
															</Badge>
														) : null}
													</Link>
												);
											}
											return null;
										})}
									</div>
								) : null}

								{workspaces.length > 0 ? (
									<div className="space-y-1">
										<div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
											Workspaces ({workspaces.length})
										</div>
										{workspaces.map((ws) => {
											const isCurrent = isWorkspaceActive(ws);
											const isFav = favorites.includes(ws.id.toLowerCase());
											const safeMobileWsUrl = sanitizeHref(withWorkspaceShellUrl(ws.url, true)) || '#';
											return (
												<div key={ws.id} className="flex items-center justify-between gap-1">
													{ws.component ? (
														<Link
															href={safeMobileWsUrl}
															onClick={() => setMobileDrawerOpen(false)}
															className={cn(
																'flex flex-1 min-h-8 pointer-coarse:min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors min-w-0',
																isCurrent
																	? 'bg-primary/12 text-primary-ink font-semibold'
																	: 'text-foreground hover:bg-muted'
															)}
														>
															<DynamicIcon name={ws.icon} className="size-4 shrink-0 text-primary" />
															<span className="truncate">{ws.title}</span>
														</Link>
													) : (
														<a
															href={safeMobileWsUrl}
															className="flex flex-1 min-h-8 pointer-coarse:min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted min-w-0"
														>
															<DynamicIcon name={ws.icon} className="size-4 shrink-0 text-primary" />
															<span className="truncate">{ws.title}</span>
														</a>
													)}
													<button
														type="button"
														onClick={(e) => toggleFavoriteWorkspace(ws.id, e)}
														aria-label={isFav ? `Unpin ${ws.title}` : `Pin ${ws.title}`}
														className={cn(
															'inline-flex size-8 pointer-coarse:size-11 items-center justify-center rounded-md transition-colors cursor-pointer shrink-0',
															isFav ? 'text-warning' : 'text-muted-foreground/50 hover:text-foreground'
														)}
													>
														<DynamicIcon name="star" className={cn('size-3.5', isFav && 'fill-current')} />
													</button>
												</div>
											);
										})}
									</div>
								) : null}
							</div>

							{workspace?.user ? (
								<div className="border-t border-border px-4 py-3 flex items-center justify-between text-xs text-muted-foreground shrink-0">
									<span className="font-medium text-foreground">{workspace.user.name}</span>
									<Badge variant="outline">
										{workspace.user.isSuperuser ? 'Superuser' : 'Standard'}
									</Badge>
								</div>
							) : null}
						</dialog>,
						document.body
					)
				: null}

			{/* Command Palette Quick Switcher Modal (Cmd/Ctrl+K — Native <dialog> + Combobox) */}
			{enableShortcuts && commandOpen && typeof document !== 'undefined'
				? createPortal(
						<dialog
							ref={commandDialogRef}
							aria-label={t('shell.quickSwitcher', 'Quick Switcher')}
							data-rw-command-dialog=""
							data-rw-command-palette=""
							data-rw-portal-overlay=""
							{...({ closedby: 'any' } as Record<string, string>)}
							onPointerDown={commandDialogCtrl.handlePointerDown}
							onPointerUp={commandDialogCtrl.handlePointerUp}
							onClose={commandDialogCtrl.handleClose}
							className="text-popover-foreground"
						>
							<div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
								<DynamicIcon name="search" className="size-4 text-muted-foreground" aria-hidden="true" />
								<input
									type="search"
									role="combobox"
									aria-expanded={true}
									aria-controls={commandListId}
									aria-activedescendant={
										filteredCommandItems[commandActiveIndex]
											? `${commandListId}-opt-${filteredCommandItems[commandActiveIndex].id}`
											: undefined
									}
									autoFocus
									value={commandQuery}
									onChange={(e) => setCommandQuery(e.target.value)}
									onKeyDown={(e) => {
										const count = filteredCommandItems.length;
										if (e.key === 'ArrowDown' && count > 0) {
											e.preventDefault();
											setCommandActiveIndex((prev) => (prev + 1) % count);
										} else if (e.key === 'ArrowUp' && count > 0) {
											e.preventDefault();
											setCommandActiveIndex((prev) => (prev - 1 + count) % count);
										} else if (e.key === 'Home' && count > 0) {
											e.preventDefault();
											setCommandActiveIndex(0);
										} else if (e.key === 'End' && count > 0) {
											e.preventDefault();
											setCommandActiveIndex(count - 1);
										} else if (e.key === 'Enter' && count > 0) {
											e.preventDefault();
											executeCommandItem(filteredCommandItems[commandActiveIndex] || filteredCommandItems[0]);
										}
									}}
									aria-label={t('shell.searchWorkspacesLabel', 'Search workspaces')}
									placeholder={t('shell.jumpPlaceholder', 'Jump to workspace or section...')}
									className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
								/>
								<button
									type="button"
									onClick={() => setCommandOpen(false)}
									aria-label={t('common.close', 'Close')}
									className="inline-flex min-h-6 items-center rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted cursor-pointer"
								>
									ESC
								</button>
							</div>
							<div
								id={commandListId}
								role="listbox"
								aria-label={t('shell.quickSwitcher', 'Quick Switcher')}
								className="max-h-80 overflow-y-auto p-2 divide-y divide-border/40"
							>
								{filteredCommandItems.length === 0 ? (
									<div className="py-6 text-center text-xs text-muted-foreground">
										{t('shell.noMatchingDestinations', 'No matching destinations found.')}
									</div>
								) : (
									filteredCommandItems.map((item, idx) => {
										const isSelected = idx === commandActiveIndex;
										const optionId = `${commandListId}-opt-${item.id}`;
										const itemCls = cn(
											'flex w-full items-center gap-3 rounded-md px-2.5 py-2 transition-colors cursor-pointer',
											isSelected ? 'bg-muted text-foreground' : 'hover:bg-muted/60'
										);
										const inner = (
											<>
												<span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
													<DynamicIcon name={item.icon} className="size-3.5" />
												</span>
												<div className="min-w-0 flex-1 text-left">
													<div className="truncate text-xs font-medium text-foreground">
														{item.label}
													</div>
													<div className="truncate text-[11px] text-muted-foreground">
														{item.subtitle}
													</div>
												</div>
												<DynamicIcon name="arrow-right" className="size-3.5 text-muted-foreground" />
											</>
										);
										if (item.onClick) {
											return (
												<button
													key={item.id}
													id={optionId}
													role="option"
													aria-selected={isSelected}
													type="button"
													onMouseEnter={() => setCommandActiveIndex(idx)}
													onClick={() => {
														item.onClick?.();
														setCommandOpen(false);
													}}
													className={itemCls}
												>
													{inner}
												</button>
											);
										}
										const safeItemHref = sanitizeHref(item.href);
										if (safeItemHref && item.isInertia) {
											return (
												<Link
													key={item.id}
													id={optionId}
													role="option"
													aria-selected={isSelected}
													href={safeItemHref}
													onMouseEnter={() => setCommandActiveIndex(idx)}
													onClick={() => setCommandOpen(false)}
													className={itemCls}
												>
													{inner}
												</Link>
											);
										}
										return (
											<a
												key={item.id}
												id={optionId}
												role="option"
												aria-selected={isSelected}
												href={safeItemHref || '#'}
												onMouseEnter={() => setCommandActiveIndex(idx)}
												className={itemCls}
											>
												{inner}
											</a>
										);
									})
								)}
							</div>
						</dialog>,
						document.body
					)
				: null}

			{/* Unsaved Changes SPA Navigation Guard */}
			{pendingDirtyVisitUrl ? (
				<ConfirmDialog
					open={Boolean(pendingDirtyVisitUrl)}
					onOpenChange={(nextOpen) => {
						if (!nextOpen) {
							setPendingDirtyVisitUrl(null);
						}
					}}
					variant="danger"
					icon="alert-triangle"
					requireAcknowledge={false}
					title={t('form.unsavedChangesTitle', 'Unsaved changes')}
					description={t(
						'form.discardUnsavedNotice',
						'Leaving or reloading this page will discard the edits you have not saved.'
					)}
					confirmLabel={t('form.discardAndLeave', 'Discard & Leave')}
					onConfirm={() => {
						const nextUrl = pendingDirtyVisitUrl;
						setPendingDirtyVisitUrl(null);
						if (nextUrl) {
							bypassDirtyNavRef.current = true;
							router.visit(nextUrl);
						}
					}}
				/>
			) : null}

			{/* Main Landmark Container (encloses Module Header + Section Navigation + Body so zero content sits outside landmarks) */}
			<MainContainer data-rw-app-main="" className="flex-1 flex flex-col">
			{/* Module Header + Section Navigation */}
			<div data-rw-module-header="" className="border-b border-border bg-card">
				<div className="mx-auto max-w-[1600px] px-4 pt-4 pb-0 sm:px-6 sm:pt-5">
					<div className="flex flex-col gap-3 pb-4 md:flex-row md:items-start md:justify-between">
						<div className="space-y-1">
							<div className="flex flex-wrap items-center gap-2.5">
								{icon ? (
									<span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
										<DynamicIcon name={icon} className="size-4" />
									</span>
								) : null}
								<ModuleHeadingTag className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
									{title}
								</ModuleHeadingTag>
								{pills.map((pill, idx) => {
									const label = typeof pill === 'string' ? pill : pill.label;
									const variant = typeof pill === 'string' ? 'secondary' : pill.variant || 'secondary';
									return (
										<Badge key={idx} variant={variant}>
											{label}
										</Badge>
									);
								})}
							</div>
							{subtitle ? (
								<p className="max-w-3xl text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
							) : null}
						</div>

						{(!hasRecordHeader && resolvedHeaderActions) ||
						openInWorkspaceHref ||
						(isClassicAdminShell && enableShortcuts) ? (
							<div className="flex flex-wrap items-center gap-2 shrink-0">
								{!hasRecordHeader ? resolvedHeaderActions : null}
								{isClassicAdminShell && enableShortcuts ? (
									<button
										type="button"
										onClick={() => {
											setCommandQuery('');
											setCommandActiveIndex(0);
											setCommandOpen(true);
										}}
										data-rw-command-trigger=""
										title={t('shell.quickSwitcherShortcut', 'Quick Switcher (Cmd/Ctrl+K)')}
										className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-input-surface px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0 cursor-pointer"
									>
										<DynamicIcon name="search" className="size-3.5" aria-hidden="true" />
										<span className="sr-only">{t('shell.quickSwitcher', 'Quick Switcher')} </span>
										<kbd className="font-mono text-[10px]">⌘K</kbd>
									</button>
								) : null}
								{openInWorkspaceHref ? (
									<a
										href={openInWorkspaceHref}
										data-rw-open-in-workspace
										title={t('shell.openInWorkspaceTooltip', 'Switch to full-screen Workspace view')}
										className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-input-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted shrink-0"
									>
										<DynamicIcon name="layout-grid" className="size-3.5 text-primary" />
										<span>{t('shell.openInWorkspace', 'Open in Workspace')}</span>
									</a>
								) : null}
							</div>
						) : null}
					</div>

					{/* Section Navigation Bar */}
					{resolvedNavItems.length > 0 ? (
						<ModuleSectionNav
							title={title}
							items={resolvedNavItems}
							activeNav={resolvedActiveNav}
						/>
					) : null}
				</div>
			</div>

			{/* Main Content Area */}
			<div
				data-rw-workspace-body=""
				className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 sm:py-6 space-y-5"
			>
				{/* Contextual Record Header (Tier 3: Create / Edit context + sticky primary Save portal) */}
				{hasRecordHeader
					? isRecordHeaderSpec(recordHeader)
						? (
								<RecordHeader
									{...recordHeader}
									dirty={recordHeader.dirty ?? hasDirtySchemaForm}
								/>
							)
						: recordHeader
					: null}
				{/* Flash Notices & Action Output Notification Center */}
				{activeFeedback ? (
					<Alert
						variant={activeFeedback.type}
						title={activeFeedback.title}
						className="shadow-xs"
					>
						<div className="space-y-2">
							<div className="flex items-start justify-between gap-4">
								<p>{activeFeedback.message}</p>
								<Button
									variant="ghost"
									size="xs"
									icon="x"
									onClick={() => {
										if (onDismissFeedback) {
											onDismissFeedback();
										} else {
											setDismissedFeedback(true);
										}
									}}
								>
									{t('common.dismiss', 'Dismiss')}
								</Button>
							</div>
							{activeFeedback.output ? (
								<pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-background/90 p-3 font-mono text-[11px] leading-relaxed text-foreground">
									<code>{activeFeedback.output}</code>
								</pre>
							) : null}
						</div>
					</Alert>
				) : null}

				{!dismissedFlash.errors && flash?.errors && flash.errors.length > 0 ? (
					<Alert variant="danger" title={t('common.error', 'Error')}>
						<div className="flex items-start justify-between gap-4">
							<ul className="list-disc pl-4 space-y-1.5 flex-1 min-w-0">
								{flash.errors.map((err, i) => (
									<li key={i} className="leading-relaxed">
										{renderNoticeMarkup(err)}
									</li>
								))}
							</ul>
							<Button
								variant="ghost"
								size="xs"
								icon="x"
								onClick={() => setDismissedFlash((prev) => ({ ...prev, errors: true }))}
								aria-label={t('shell.dismissErrors', 'Dismiss errors')}
								title={t('shell.dismissErrors', 'Dismiss errors')}
							/>
						</div>
					</Alert>
				) : null}

				{!dismissedFlash.warnings && flash?.warnings && flash.warnings.length > 0 ? (
					<Alert variant="warning" title={t('common.warning', 'Warning')}>
						<div className="flex items-start justify-between gap-4">
							<ul className="list-disc pl-4 space-y-1.5 flex-1 min-w-0">
								{flash.warnings.map((warn, i) => (
									<li key={i} className="leading-relaxed">
										{renderNoticeMarkup(warn)}
									</li>
								))}
							</ul>
							<Button
								variant="ghost"
								size="xs"
								icon="x"
								onClick={() => setDismissedFlash((prev) => ({ ...prev, warnings: true }))}
								aria-label={t('shell.dismissWarnings', 'Dismiss warnings')}
								title={t('shell.dismissWarnings', 'Dismiss warnings')}
							/>
						</div>
					</Alert>
				) : null}

				{!dismissedFlash.messages && flash?.messages && flash.messages.length > 0 ? (
					<Alert variant="primary" title={t('common.notice', 'Notice')}>
						<div className="flex items-start justify-between gap-4">
							<ul className="list-disc pl-4 space-y-1.5 flex-1 min-w-0">
								{flash.messages.map((msg, i) => (
									<li key={i} className="leading-relaxed">
										{renderNoticeMarkup(msg)}
									</li>
								))}
							</ul>
							<Button
								variant="ghost"
								size="xs"
								icon="x"
								onClick={() => setDismissedFlash((prev) => ({ ...prev, messages: true }))}
								aria-label={t('shell.dismissNotices', 'Dismiss notices')}
								title={t('shell.dismissNotices', 'Dismiss notices')}
							/>
						</div>
					</Alert>
				) : null}

				{children}
			</div>
			</MainContainer>
		</div>
	);
}

export {
	EditPresenceBanner,
	useEditPresence,
	type PresenceCoEditor,
	type PresenceLastSaved,
	type EditPresenceSnapshot,
	type UseEditPresenceOptions,
	type UseEditPresenceResult,
	type EditPresenceBannerProps,
} from './EditPresenceBanner';
