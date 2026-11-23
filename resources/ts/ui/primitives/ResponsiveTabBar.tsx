import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { navigateTablistByKey, scrollTabIntoView } from '../../fields/schemaRuntimeHelpers';
import { Badge } from './Badge';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './DropdownMenu';

export interface ResponsiveTabItem {
	id: string;
	btnId: string;
	controlsId?: string;
	label: string;
	icon?: string;
	badge?: string | number | null;
	errorCount?: number;
	errorLabel?: string;
	disabled?: boolean;
	confirmDelete?: boolean;
	dataAttrs?: Record<string, string | undefined>;
}

export interface ResponsiveTabBarProps {
	items: ResponsiveTabItem[];
	activeId: string;
	ariaLabel: string;
	variant: 'line' | 'segmented' | 'vertical';
	aboveCard?: boolean;
	compact?: boolean;
	formLayout?: boolean;
	maxVisible?: number;
	onSelect: (id: string, item: ResponsiveTabItem) => void;
	className?: string;
}

export function ResponsiveTabBar({
	items,
	activeId,
	ariaLabel,
	variant,
	aboveCard = false,
	compact = false,
	formLayout = false,
	maxVisible,
	onSelect,
	className,
}: ResponsiveTabBarProps): React.ReactElement | null {
	const barRef = useRef<HTMLDivElement | null>(null);
	const measureRef = useRef<HTMLDivElement | null>(null);
	const hasExplicitMax = typeof maxVisible === 'number' && maxVisible > 0;
	const clampVisibleCount = (candidate: number): number => {
		const capped = hasExplicitMax ? Math.min(candidate, maxVisible) : candidate;
		return Math.max(1, Math.min(capped, items.length));
	};

	const [visibleCount, setVisibleCount] = useState<number>(() =>
		items.length > 0 ? clampVisibleCount(items.length) : 0
	);

	const itemsSignature = useMemo(
		() =>
			items
				.map(
					(it) =>
						`${it.id}:${it.label}:${it.icon ?? ''}:${String(it.badge ?? '')}:${it.errorCount ?? 0}`
				)
				.join('|'),
		[items]
	);

	useEffect(() => {
		if (variant === 'vertical') {
			return;
		}
		if (items.length === 0) {
			setVisibleCount(0);
			return;
		}

		const cap = (n: number): number => {
			const limited = typeof maxVisible === 'number' && maxVisible > 0 ? Math.min(n, maxVisible) : n;
			return Math.max(1, Math.min(limited, items.length));
		};

		const barEl = barRef.current;
		const measureEl = measureRef.current;
		if (!barEl || !measureEl || typeof window === 'undefined') {
			setVisibleCount(cap(items.length));
			return;
		}

		const recompute = () => {
			const containerWidth = barEl.clientWidth;
			if (containerWidth <= 0) {
				setVisibleCount(cap(items.length));
				return;
			}

			const measuredNodes = Array.from(
				measureEl.querySelectorAll<HTMLElement>('[data-rw-tab-measure-item]')
			);
			if (measuredNodes.length === 0) {
				setVisibleCount(cap(items.length));
				return;
			}

			const gap = 4;
			const widths = measuredNodes.map((node) => Math.ceil(node.getBoundingClientRect().width));

			let totalAll = 0;
			for (let i = 0; i < widths.length; i++) {
				totalAll += (widths[i] ?? 0) + (i > 0 ? gap : 0);
			}

			if (totalAll <= containerWidth - 2) {
				setVisibleCount(cap(items.length));
				return;
			}

			const baseMoreNode = measureEl.querySelector<HTMLElement>('[data-rw-tab-measure-more-base]');
			const activeMoreNode = measureEl.querySelector<HTMLElement>('[data-rw-tab-measure-more-active]');
			const baseMoreReserve = Math.max(
				88,
				Math.ceil(baseMoreNode?.getBoundingClientRect().width ?? 98) + 8
			);
			const activeMoreReserve = Math.max(
				baseMoreReserve,
				Math.ceil(activeMoreNode?.getBoundingClientRect().width ?? baseMoreReserve) + 8
			);
			const activeIndex = items.findIndex((it) => it.id === activeId);
			let acc = 0;
			let fit = 1;
			for (let i = 0; i < widths.length; i++) {
				const w = (widths[i] ?? 0) + (i > 0 ? gap : 0);
				acc += w;
				const candidateFit = i + 1;
				if (candidateFit >= widths.length) {
					break;
				}
				const reserve = activeIndex >= candidateFit ? activeMoreReserve : baseMoreReserve;
				if (acc + gap + reserve <= containerWidth) {
					fit = candidateFit;
				}
			}

			setVisibleCount(cap(fit));
		};

		recompute();
		if (typeof ResizeObserver !== 'undefined') {
			const ro = new ResizeObserver(() => recompute());
			ro.observe(barEl);
			return () => ro.disconnect();
		}
		window.addEventListener('resize', recompute);
		return () => window.removeEventListener('resize', recompute);
	}, [variant, items.length, itemsSignature, activeId, maxVisible]);

	if (items.length === 0) {
		return null;
	}

	if (variant === 'vertical') {
		const hasActive = items.some((item) => item.id === activeId);
		const firstConfirmDeleteIndex = formLayout
			? items.findIndex((item) => item.confirmDelete)
			: -1;

		return (
			<div
				role="tablist"
				aria-label={ariaLabel}
				aria-orientation="vertical"
				data-rw-tablist=""
				data-variant="vertical"
				data-rw-form-tabs-layout={formLayout ? 'vertical' : undefined}
				onKeyDown={(e) => navigateTablistByKey(e, 'vertical')}
				className={cn('flex flex-col gap-1', className)}
			>
				{items.map((item, idx) => {
					const isActive = item.id === activeId;
					const itemErrors = item.errorCount ?? 0;
					const isDeleteDivider =
						firstConfirmDeleteIndex > 0 && idx === firstConfirmDeleteIndex;
					return (
						<button
							key={item.id}
							id={item.btnId}
							type="button"
							role="tab"
							aria-selected={isActive}
							aria-controls={item.controlsId}
							tabIndex={isActive || (!hasActive && idx === 0) ? 0 : -1}
							disabled={item.disabled}
							data-rw-confirm-delete-tab={item.confirmDelete ? '1' : undefined}
							data-rw-delete-divider={isDeleteDivider ? '1' : undefined}
							{...(item.dataAttrs ?? {})}
							style={
								item.confirmDelete
									? ({ '--tab-accent': 'var(--destructive)' } as React.CSSProperties)
									: undefined
							}
							onClick={(e) => {
								onSelect(item.id, item);
								scrollTabIntoView(e.currentTarget);
							}}
							className={cn(
								'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
								isDeleteDivider && 'mt-2',
								isActive
									? item.confirmDelete
										? 'bg-destructive/10 text-destructive font-semibold'
										: 'bg-background text-foreground font-semibold shadow-2xs'
									: item.confirmDelete
										? 'text-muted-foreground hover:bg-destructive/5 hover:text-destructive'
										: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
								itemErrors > 0 && 'text-destructive',
								item.disabled && 'pointer-events-none opacity-50'
							)}
						>
							{item.icon ? (
								<DynamicIcon name={item.icon} className="size-3.5 shrink-0" aria-hidden="true" />
							) : null}
							<span className="min-w-0 flex-1 truncate">{item.label}</span>
							{item.badge !== undefined && item.badge !== null && item.badge !== '' ? (
								<Badge
									variant={isActive ? 'secondary' : 'outline'}
									mono
									className="px-1.5 py-0 text-[10px] tabular-nums"
								>
									{item.badge}
								</Badge>
							) : null}
							{itemErrors > 0 ? (
								<Badge
									variant="destructive"
									title={item.errorLabel}
									aria-label={item.errorLabel}
									className="px-1.5 py-0 text-[10px] tabular-nums"
								>
									{itemErrors}
								</Badge>
							) : null}
						</button>
					);
				})}
			</div>
		);
	}

	const clampedVisible = clampVisibleCount(visibleCount || items.length);
	const visibleItems = items.slice(0, clampedVisible);
	const overflowItems = items.slice(clampedVisible);
	const activeItem = items.find((item) => item.id === activeId);
	const hasVisibleActive = visibleItems.some((item) => item.id === activeId);
	const activeOverflowItem = overflowItems.find((item) => item.id === activeId);
	const overflowErrorCount = overflowItems.reduce((sum, item) => sum + (item.errorCount ?? 0), 0);
	const hasAnyErrors = items.some((item) => (item.errorCount ?? 0) > 0);
	const moreMeasureClass = cn(
		'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium',
		variant === 'segmented'
			? 'px-2.5 py-1.5'
			: compact
				? 'px-2 py-1.5'
				: 'px-3 py-2 @xs/rw-form:py-2.5'
	);

	const getTabButtonClass = (item: ResponsiveTabItem, isActive: boolean, forMeasure = false): string => {
		const isSegmented = variant === 'segmented';
		const itemErrors = item.errorCount ?? 0;
		return cn(
			'inline-flex shrink-0 items-center whitespace-nowrap text-xs font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			isSegmented
				? cn(
						'gap-2 rounded-md px-3 py-1.5',
						!forMeasure &&
							(isActive
								? 'bg-background text-foreground shadow-2xs'
								: item.confirmDelete
									? 'text-muted-foreground hover:text-destructive'
									: 'text-muted-foreground hover:text-foreground')
					)
				: cn(
						compact
							? 'gap-1.5 px-2 py-1.5 @xs/rw-form:gap-2 @xs/rw-form:px-3 @xs/rw-form:py-2'
							: 'gap-1.5 px-3 py-2 @xs/rw-form:gap-2 @xs/rw-form:px-4 @xs/rw-form:py-2.5',
						!forMeasure &&
							(isActive
								? item.confirmDelete
									? 'text-destructive'
									: 'text-foreground'
								: item.confirmDelete
									? 'text-muted-foreground hover:text-destructive'
									: 'text-muted-foreground hover:text-foreground')
					),
			itemErrors > 0 && 'text-destructive',
			item.disabled && 'pointer-events-none opacity-50'
		);
	};

	const renderTabInner = (item: ResponsiveTabItem): React.ReactNode => {
		const itemErrors = item.errorCount ?? 0;
		return (
			<>
				{item.icon ? <DynamicIcon name={item.icon} className="size-3.5 shrink-0" aria-hidden="true" /> : null}
				<span>{item.label}</span>
				{item.badge !== undefined && item.badge !== null && item.badge !== '' ? (
					<Badge variant="secondary" mono className="px-1.5 py-0 text-[10px] tabular-nums">
						{item.badge}
					</Badge>
				) : null}
				{itemErrors > 0 ? (
					<Badge
						variant="destructive"
						title={item.errorLabel}
						aria-label={item.errorLabel}
						className="px-1.5 py-0 text-[10px] tabular-nums"
					>
						{itemErrors}
					</Badge>
				) : null}
			</>
		);
	};

	return (
		<>
			<div
				ref={measureRef}
				aria-hidden="true"
				className="pointer-events-none invisible fixed -top-[9999px] left-0 flex items-center gap-1 whitespace-nowrap"
			>
				{items.map((item) => (
					<span key={`m_${item.id}`} data-rw-tab-measure-item="" className={getTabButtonClass(item, false, true)}>
						{renderTabInner(item)}
					</span>
				))}
				<span data-rw-tab-measure-more-base="" className={moreMeasureClass}>
					<span>{t('form.moreTabs', 'More')}</span>
					<Badge variant="muted" mono className="px-1.5 py-0 text-[10px]">
						+9
					</Badge>
					{hasAnyErrors ? (
						<Badge variant="destructive" mono className="px-1.5 py-0 text-[10px]">
							9
						</Badge>
					) : null}
					<DynamicIcon name="chevron-down" className="size-3" />
				</span>
				{activeItem ? (
					<span data-rw-tab-measure-more-active="" className={moreMeasureClass}>
						{activeItem.icon ? (
							<DynamicIcon name={activeItem.icon} className="size-3.5 shrink-0" />
						) : null}
						<span className="max-w-32 truncate">{activeItem.label}</span>
						<Badge variant="secondary" mono className="px-1.5 py-0 text-[10px]">
							+9
						</Badge>
						{hasAnyErrors ? (
							<Badge variant="destructive" mono className="px-1.5 py-0 text-[10px]">
								9
							</Badge>
						) : null}
						<DynamicIcon name="chevron-down" className="size-3" />
					</span>
				) : null}
			</div>

			<div
				ref={barRef}
				data-rw-tab-bar=""
				data-variant={variant}
				data-rw-card-tabs={aboveCard ? 'above' : undefined}
				className={cn(
					variant === 'segmented'
						? 'inline-flex max-w-full min-w-0 items-center gap-1 rounded-lg border border-border bg-muted/50 p-1'
						: cn('flex min-w-0 items-center gap-1 border-b border-border', aboveCard && 'px-1'),
					className
				)}
			>
				<div
					role="tablist"
					aria-label={ariaLabel}
					aria-orientation="horizontal"
					data-rw-tablist=""
					data-variant={variant}
					data-rw-card-tabs={aboveCard ? 'above' : undefined}
					onKeyDown={(e) => navigateTablistByKey(e, 'horizontal')}
					className="flex min-w-0 flex-1 items-center gap-1"
				>
					{visibleItems.map((item, idx) => {
						const isActive = item.id === activeId;
						return (
							<button
								key={item.id}
								id={item.btnId}
								type="button"
								role="tab"
								aria-selected={isActive}
								aria-controls={item.controlsId}
								tabIndex={isActive || (!hasVisibleActive && idx === 0) ? 0 : -1}
								disabled={item.disabled}
								data-rw-confirm-delete-tab={item.confirmDelete ? '1' : undefined}
								{...(item.dataAttrs ?? {})}
								style={
									item.confirmDelete
										? ({ '--tab-accent': 'var(--destructive)' } as React.CSSProperties)
										: undefined
								}
								onClick={(e) => {
									onSelect(item.id, item);
									scrollTabIntoView(e.currentTarget);
								}}
								className={getTabButtonClass(item, isActive)}
							>
								{renderTabInner(item)}
							</button>
						);
					})}
				</div>

				{overflowItems.length > 0 ? (
					<Menu>
						<MenuTrigger asChild>
							<button
								type="button"
								id={activeOverflowItem?.btnId}
								data-rw-tabs-more=""
								data-variant={variant}
								data-overflow-active={activeOverflowItem ? '1' : undefined}
								className={cn(
									'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									variant === 'segmented'
										? cn(
												'rounded-md px-2.5 py-1.5',
												activeOverflowItem
													? 'bg-background text-foreground font-semibold shadow-2xs'
													: 'text-muted-foreground hover:text-foreground'
											)
										: cn(
												compact ? 'px-2 py-1.5' : 'px-3 py-2 @xs/rw-form:py-2.5',
												activeOverflowItem
													? activeOverflowItem.confirmDelete
														? 'text-destructive font-semibold border-b-2 border-destructive -mb-px'
														: 'text-foreground font-semibold border-b-2 border-primary -mb-px'
													: 'text-muted-foreground hover:text-foreground'
											),
									overflowErrorCount > 0 && 'text-destructive'
								)}
							>
								{activeOverflowItem ? (
									<>
										{activeOverflowItem.icon ? (
											<DynamicIcon
												name={activeOverflowItem.icon}
												className="size-3.5 shrink-0"
												aria-hidden="true"
											/>
										) : null}
										<span className="max-w-32 truncate">{activeOverflowItem.label}</span>
									</>
								) : (
									<span>{t('form.moreTabs', 'More')}</span>
								)}
								<Badge
									variant={activeOverflowItem ? 'secondary' : 'muted'}
									mono
									className="px-1.5 py-0 text-[10px]"
								>
									+{overflowItems.length}
								</Badge>
								<span className="sr-only">
									({t('form.moreTabsAria', { count: overflowItems.length }, '{count} more tabs')})
								</span>
								{overflowErrorCount > 0 ? (
									<Badge variant="destructive" mono className="px-1.5 py-0 text-[10px]">
										{overflowErrorCount}
									</Badge>
								) : null}
								<DynamicIcon name="chevron-down" className="size-3 shrink-0 opacity-75" aria-hidden="true" />
							</button>
						</MenuTrigger>
						<MenuContent align="end" className="min-w-48 max-w-72 max-h-80 overflow-y-auto">
							{overflowItems.map((item) => {
								const isItemActive = item.id === activeId;
								const itemErrors = item.errorCount ?? 0;
								return (
									<MenuItem
										key={item.id}
										active={isItemActive}
										disabled={item.disabled}
										variant={item.confirmDelete ? 'danger' : 'default'}
										onClick={() => onSelect(item.id, item)}
									>
										{item.icon ? (
											<DynamicIcon
												name={item.icon}
												className="size-3.5 shrink-0 opacity-85"
												aria-hidden="true"
											/>
										) : null}
										<span className="flex-1 truncate">{item.label}</span>
										{item.badge !== undefined && item.badge !== null && item.badge !== '' ? (
											<Badge
												variant={isItemActive ? 'secondary' : 'outline'}
												mono
												className="px-1.5 py-0 text-[10px]"
											>
												{item.badge}
											</Badge>
										) : null}
										{itemErrors > 0 ? (
											<Badge
												variant="destructive"
												title={item.errorLabel}
												aria-label={item.errorLabel}
												className="px-1.5 py-0 text-[10px]"
											>
												{itemErrors}
											</Badge>
										) : null}
									</MenuItem>
								);
							})}
						</MenuContent>
					</Menu>
				) : null}
			</div>
		</>
	);
}
