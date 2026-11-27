import React, { useEffect, useId, useRef, useState } from 'react';
import { SafeLink as Link } from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../lib/utils';
import { Badge, PortalRoot } from '../ui';
import type { AppShellNavItem } from './types';

export function ModuleSectionNav({
	title,
	items,
	activeNav,
}: {
	title: string;
	items: AppShellNavItem[];
	activeNav?: string;
}): React.ReactElement | null {
	const navRef = useRef<HTMLElement | null>(null);
	const moreMenuId = useId();
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
		if (moreOpen && visibleCount >= items.length) {
			setMoreOpen(false);
		}
	}, [moreOpen, visibleCount, items.length]);

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
				e.stopPropagation();
				setMoreOpen(false);
				moreTriggerRef.current?.focus();
				return;
			}
			const menuEl = moreMenuRef.current;
			if (!menuEl) {
				return;
			}
			const menuItems = Array.from(menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
			if (menuItems.length === 0) {
				return;
			}
			const curIdx = menuItems.indexOf(document.activeElement as HTMLElement);
			let nextIdx = -1;
			if (e.key === 'ArrowDown') {
				nextIdx = curIdx >= 0 ? (curIdx + 1) % menuItems.length : 0;
			} else if (e.key === 'ArrowUp') {
				nextIdx = curIdx > 0 ? curIdx - 1 : menuItems.length - 1;
			} else if (e.key === 'Home') {
				nextIdx = 0;
			} else if (e.key === 'End') {
				nextIdx = menuItems.length - 1;
			}
			if (nextIdx >= 0) {
				e.preventDefault();
				menuItems[nextIdx]?.focus();
			}
		};
		document.addEventListener('mousedown', onPointerDown);
		document.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('resize', updateMenuPosition);
		window.addEventListener('scroll', updateMenuPosition, true);
		return () => {
			window.cancelAnimationFrame(rafId);
			document.removeEventListener('mousedown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown, true);
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
						'inline-flex min-h-8 pointer-coarse:min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
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
						aria-controls={moreOpen ? moreMenuId : undefined}
						onClick={() => setMoreOpen((prev) => !prev)}
						className={cn(
							'ml-auto inline-flex min-h-8 pointer-coarse:min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
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

			{moreOpen && overflowItems.length > 0 ? (
				<PortalRoot anchor={moreTriggerRef.current} ssrFallback={false}>
					<div
						ref={moreMenuRef}
						id={moreMenuId}
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
								'flex w-full items-center justify-between gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
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
										aria-current={isActive ? 'page' : undefined}
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
										aria-current={isActive ? 'page' : undefined}
										onClick={() => setMoreOpen(false)}
										className={menuRowClass}
									>
										{inner}
									</Link>
								);
							}
							return null;
						})}
					</div>
				</PortalRoot>
			) : null}
		</>
	);
}
