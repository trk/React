import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { cn, DynamicIcon } from '../lib/utils';
import { Input, PortalRoot, Select } from '../ui';
import type { ViewportPillOption } from './types';

export interface ViewportPillStripProps {
	items: ViewportPillOption[];
	activeKey: string;
	ariaLabel: string;
	onSelect: (key: string) => void;
}

export const ViewportPillStrip: React.FC<ViewportPillStripProps> = ({
	items,
	activeKey,
	ariaLabel,
	onSelect,
}) => {
	const stripRef = useRef<HTMLDivElement | null>(null);
	const measureRef = useRef<HTMLDivElement | null>(null);
	const moreMeasureRef = useRef<HTMLSpanElement | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [visibleCount, setVisibleCount] = useState<number>(() => Math.min(5, items.length));
	const [menuOpen, setMenuOpen] = useState(false);
	const [menuSearch, setMenuSearch] = useState('');
	const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

	const recomputeLayout = useCallback(() => {
		const container = stripRef.current;
		const measureHost = measureRef.current;
		if (!container || !measureHost) {
			return;
		}
		const availableWidth = container.clientWidth;
		if (availableWidth <= 0) {
			return;
		}
		const itemEls = Array.from(measureHost.querySelectorAll<HTMLElement>('[data-pill-measure]'));
		const widths = itemEls.map((el) => Math.ceil(el.getBoundingClientRect().width));
		if (widths.length === 0) {
			return;
		}
		const gap = 6;
		const totalItems = items.length;

		if (totalItems <= 5) {
			const fullWidth =
				widths.reduce((acc, w) => acc + w, 0) + Math.max(0, totalItems - 1) * gap;
			if (fullWidth <= availableWidth) {
				setVisibleCount((prev) => (prev === totalItems ? prev : totalItems));
				return;
			}
		}

		const moreBtnWidth = Math.max(
			88,
			Math.ceil(moreMeasureRef.current?.getBoundingClientRect().width ?? 94)
		);
		const maxInline = Math.min(5, Math.max(1, totalItems - 1));
		let used = 0;
		let count = 0;
		for (let i = 0; i < maxInline; i++) {
			const w = widths[i] ?? 0;
			const needed = (count > 0 ? gap : 0) + w;
			if (used + needed + gap + moreBtnWidth <= availableWidth) {
				used += needed;
				count++;
			} else {
				break;
			}
		}
		const nextCount = count;
		setVisibleCount((prev) => (prev === nextCount ? prev : nextCount));
	}, [items, activeKey]);

	useEffect(() => {
		recomputeLayout();
		const container = stripRef.current;
		if (!container || typeof ResizeObserver === 'undefined') {
			return;
		}
		const observer = new ResizeObserver(() => recomputeLayout());
		observer.observe(container);
		window.addEventListener('resize', recomputeLayout);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', recomputeLayout);
		};
	}, [recomputeLayout]);

	const inlineItems = items.slice(0, visibleCount);
	const overflowItems = items.slice(visibleCount);
	const activeOverflowItem = overflowItems.find((item) => item.key === activeKey);

	useEffect(() => {
		if (overflowItems.length === 0 && menuOpen) {
			setMenuOpen(false);
		}
	}, [overflowItems.length, menuOpen]);

	const updateMenuPosition = useCallback(() => {
		const trigger = triggerRef.current;
		if (!trigger || typeof window === 'undefined') {
			return;
		}
		const rect = trigger.getBoundingClientRect();
		const menuWidth = 224;
		const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8);
		setMenuPos({
			top: Math.round(rect.bottom + 6),
			left: Math.max(8, Math.min(Math.round(rect.left), maxLeft)),
		});
	}, []);

	useEffect(() => {
		if (!menuOpen || typeof document === 'undefined') {
			return;
		}
		updateMenuPosition();
		const onMouseDown = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (
				target &&
				!triggerRef.current?.contains(target) &&
				!menuRef.current?.contains(target)
			) {
				setMenuOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				setMenuOpen(false);
				triggerRef.current?.focus();
				return;
			}
			const targetEl = event.target as HTMLElement | null;
			const isTypingInput = targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement;
			if (isTypingInput && (event.key === 'Home' || event.key === 'End')) {
				return;
			}
			const menuEl = menuRef.current;
			if (!menuEl) {
				return;
			}
			const items = Array.from(menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not([disabled])'));
			if (items.length === 0) {
				return;
			}
			const curIdx = items.indexOf(document.activeElement as HTMLButtonElement);
			let nextIdx = -1;
			if (event.key === 'ArrowDown') {
				nextIdx = curIdx >= 0 ? (curIdx + 1) % items.length : 0;
			} else if (event.key === 'ArrowUp') {
				nextIdx = curIdx > 0 ? curIdx - 1 : items.length - 1;
			} else if (event.key === 'Home') {
				nextIdx = 0;
			} else if (event.key === 'End') {
				nextIdx = items.length - 1;
			}
			if (nextIdx >= 0) {
				event.preventDefault();
				items[nextIdx]?.focus();
			}
		};
		let focusRaf: number | null = null;
		if (overflowItems.length < 5 && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
			focusRaf = window.requestAnimationFrame(() => {
				menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]:not([disabled])')?.focus();
			});
		}
		document.addEventListener('mousedown', onMouseDown);
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('resize', updateMenuPosition);
		window.addEventListener('scroll', updateMenuPosition, true);
		return () => {
			if (focusRaf !== null) {
				window.cancelAnimationFrame(focusRaf);
			}
			document.removeEventListener('mousedown', onMouseDown);
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('resize', updateMenuPosition);
			window.removeEventListener('scroll', updateMenuPosition, true);
		};
	}, [menuOpen, overflowItems.length, updateMenuPosition]);

	const overflowMenuId = useId();

	if (items.length === 0) {
		return null;
	}

	const filteredOverflow = menuSearch.trim()
		? overflowItems.filter((item) =>
				item.label.toLowerCase().includes(menuSearch.trim().toLowerCase())
			)
		: overflowItems;

	return (
		<>
			{/* Compact native select below md (< 768px) */}
			<div className="w-full sm:w-48 md:hidden">
				<Select
					aria-label={ariaLabel}
					data-rw-viewport-pill-select=""
					value={activeKey}
					onChange={(e) => onSelect(e.target.value)}
					className="h-8 w-full text-xs"
				>
					{items.map((item) => (
						<option key={item.key || '__all__'} value={item.key}>
							{item.count !== undefined ? `${item.label} (${item.count})` : item.label}
						</option>
					))}
				</Select>
			</div>

			{/* Measured single-line pill strip with +N overflow menu at md+ (>= 768px) */}
			<div
				ref={stripRef}
				role="group"
				aria-label={ariaLabel}
				data-rw-viewport-pills=""
				className="relative hidden min-w-0 flex-1 items-center gap-1.5 overflow-hidden md:flex"
			>
				{inlineItems.map((item) => {
					const isActive = item.key === activeKey;
					return (
						<button
							key={item.key || '__all__'}
							type="button"
							aria-pressed={isActive}
							onClick={() => onSelect(isActive && item.key !== '' && items[0]?.key === '' ? '' : item.key)}
							className={cn(
								'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								isActive
									? 'border-foreground bg-foreground text-background shadow-2xs'
									: 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
							)}
						>
							{item.icon ? <DynamicIcon name={item.icon} className="size-3.5 shrink-0" aria-hidden="true" /> : null}
							<span>{item.label}</span>
							{item.count !== undefined ? (
								<span
									className={cn(
										'inline-flex min-w-4.5 items-center justify-center rounded px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums',
										isActive
											? 'bg-background/20 text-background'
											: 'bg-muted text-muted-foreground'
									)}
								>
									{item.count}
								</span>
							) : null}
						</button>
					);
				})}

				{overflowItems.length > 0 && (
					<button
						ref={triggerRef}
						type="button"
						aria-haspopup="menu"
						aria-expanded={menuOpen}
						aria-controls={menuOpen ? overflowMenuId : undefined}
						data-rw-viewport-pill-overflow=""
						onClick={() => {
							setMenuSearch('');
							setMenuOpen((prev) => !prev);
						}}
						className={cn(
							'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							activeOverflowItem
								? 'border-foreground bg-foreground text-background shadow-2xs'
								: 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
						)}
					>
						{activeOverflowItem ? (
							<>
								{activeOverflowItem.icon ? (
									<DynamicIcon name={activeOverflowItem.icon} className="size-3.5 shrink-0" aria-hidden="true" />
								) : null}
								<span className="max-w-28 truncate">{activeOverflowItem.label}</span>
							</>
						) : (
							<span>{t('common.more', 'More')}</span>
						)}
						<span
							className={cn(
								'inline-flex min-w-4.5 items-center justify-center rounded px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums',
								activeOverflowItem
									? 'bg-background/20 text-background'
									: 'bg-muted text-muted-foreground'
							)}
						>
							+{overflowItems.length}
						</span>
						<DynamicIcon name="chevron-down" className="size-3 opacity-75" aria-hidden="true" />
					</button>
				)}

				{/* Offscreen non-focusable measurement row */}
				<div
					ref={measureRef}
					aria-hidden="true"
					className="pointer-events-none invisible fixed -top-[9999px] left-0 flex items-center gap-1.5 whitespace-nowrap"
				>
					{items.map((item) => (
						<span
							key={item.key || '__all__'}
							data-pill-measure=""
							className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap"
						>
							{item.icon ? <span className="inline-block size-3.5 shrink-0" /> : null}
							<span>{item.label}</span>
							{item.count !== undefined ? (
								<span className="inline-flex min-w-4.5 items-center justify-center rounded px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums">
									{item.count}
								</span>
							) : null}
						</span>
					))}
					<span
						ref={moreMeasureRef}
						data-pill-more-measure=""
						className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap"
					>
						{activeOverflowItem?.icon ? <span className="inline-block size-3.5 shrink-0" /> : null}
						<span className="max-w-28 truncate">
							{activeOverflowItem ? activeOverflowItem.label : t('common.more', 'More')}
						</span>
						<span className="inline-flex min-w-4.5 items-center justify-center rounded px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums">
							+{items.length}
						</span>
						<span className="inline-block size-3" />
					</span>
				</div>
			</div>

			{menuOpen ? (
				<PortalRoot anchor={triggerRef.current} ssrFallback={false}>
					<div
						ref={menuRef}
						data-rw-viewport-pill-menu=""
						data-rw-portal-overlay=""
						style={{ position: 'fixed', top: `${menuPos.top}px`, left: `${menuPos.left}px` }}
						className="z-[140] w-56 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
					>
						{overflowItems.length >= 5 && (
							<div className="mb-1 px-1 pt-0.5">
								<Input
									aria-label={t('viewport.filterOptions', 'Filter options...')}
									value={menuSearch}
									onChange={(e) => setMenuSearch(e.target.value)}
									placeholder={t('viewport.filterOptions', 'Filter options...')}
									className="h-7 text-xs"
									autoFocus
								/>
							</div>
						)}
						<div
							id={overflowMenuId}
							role="menu"
							aria-label={ariaLabel}
							className="max-h-64 space-y-0.5 overflow-y-auto"
						>
							{filteredOverflow.map((item) => {
								const isActive = item.key === activeKey;
								return (
									<button
										key={item.key || '__all__'}
										type="button"
										role="menuitemradio"
										aria-checked={isActive}
										onClick={() => {
											onSelect(
												isActive && item.key !== '' && items[0]?.key === ''
													? ''
													: item.key
											);
											setMenuOpen(false);
										}}
										className={cn(
											'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
											isActive
												? 'bg-primary/12 text-primary-ink font-semibold'
												: 'text-popover-foreground hover:bg-muted'
										)}
									>
										<span className="inline-flex min-w-0 items-center gap-2 truncate">
											{item.icon ? (
												<DynamicIcon name={item.icon} className="size-3.5 shrink-0" aria-hidden="true" />
											) : null}
											<span className="truncate">{item.label}</span>
										</span>
										{item.count !== undefined ? (
											<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
												{item.count}
											</span>
										) : null}
									</button>
								);
							})}
							{filteredOverflow.length === 0 && (
								<div className="px-2.5 py-2 text-center text-xs text-muted-foreground">
									{t('common.noMatches', 'No matching options')}
								</div>
							)}
						</div>
					</div>
				</PortalRoot>
			) : null}
		</>
	);
};
