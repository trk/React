import React, { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../lib/utils';
import { Badge, Button, Input, Select } from '../ui';
import type { ViewportFilter, ViewportPillOption, ViewportState } from './types';
import { ViewportPillStrip } from './ViewportPillStrip';
import { ensureViewportModeScriptLoaded, ensureViewportModeStylesLoaded, getViewport } from './ViewportRegistry';
import { renderViewportCreateTrigger, ViewportLink } from './viewportShared';

export interface ViewportToolbarProps {
	state: ViewportState;
	busy: boolean;
	searchInput: string;
	searchInputRef?: React.RefObject<HTMLInputElement | null>;
	onSearchInputChange: (next: string) => void;
	onSubmitSearch: (query: string) => void;
	onResetFilters: () => void;
	dispatch: (action: string, payload?: Record<string, unknown>) => Promise<void>;
	onRequestDeleteView: (view: { key: string; label: string }) => void;
	onRequestToolbarConfirm: (target: {
		actionType: 'toolbar_action';
		key: string;
		label: string;
		confirm: string;
		danger: boolean;
	}) => void;
}

export function ViewportToolbar({
	state,
	busy,
	searchInput,
	searchInputRef,
	onSearchInputChange,
	onSubmitSearch,
	onResetFilters,
	dispatch,
	onRequestDeleteView,
	onRequestToolbarConfirm,
}: ViewportToolbarProps): React.ReactElement {
	const [showColumnPicker, setShowColumnPicker] = useState(false);
	const [newViewLabel, setNewViewLabel] = useState('');
	const [showSaveViewInput, setShowSaveViewInput] = useState(false);
	const columnPickerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!showColumnPicker || typeof document === 'undefined') {
			return;
		}
		const onMouseDown = (e: MouseEvent) => {
			if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
				setShowColumnPicker(false);
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				setShowColumnPicker(false);
			}
		};
		document.addEventListener('mousedown', onMouseDown);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onMouseDown);
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [showColumnPicker]);

	const viewsEntries = Object.entries(state.views || {});
	const savedViewsEntries = Object.entries(state.savedViews || {});
	const filterEntries: Array<[string, ViewportFilter]> = Object.entries(state.filters || {});
	const showSavedViewsBar =
		state.saveViewEnabled !== false && (viewsEntries.length > 0 || savedViewsEntries.length > 0);
	const inlineViewPillItems: ViewportPillOption[] =
		state.saveViewEnabled === false && viewsEntries.length > 0
			? viewsEntries.map(([vKey, vDef]) => ({
					key: vKey,
					label: vDef.label,
					count: vDef.count,
					icon: vDef.icon,
				}))
			: [];
	const pillFilterEntries =
		state.showFilterBar !== false
			? filterEntries.filter(([, fDef]) => fDef.display === 'pills')
			: [];
	const selectFilterEntries =
		state.showFilterBar !== false
			? filterEntries.filter(([, fDef]) => fDef.display !== 'pills')
			: [];
	const hasResetButton = Boolean(
		state.searchQuery || (state.filterValues && Object.keys(state.filterValues).length > 0)
	);
	const hasPillFilters = inlineViewPillItems.length > 0 || pillFilterEntries.length > 0;
	const hasLeftFilters =
		hasPillFilters || selectFilterEntries.length > 0 || hasResetButton;

	return (
		<>
			{/* Views & Saved Presets Bar */}
			{showSavedViewsBar && (
				<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
					<div className="flex flex-wrap items-center gap-1">
						{viewsEntries.map(([vKey, vDef]) => {
							const isActive = (state.activeView || 'all') === vKey;
							return (
								<Button
									key={vKey}
									variant={isActive ? 'default' : 'ghost'}
									size="xs"
									icon={vDef.icon}
									onClick={() => dispatch('select_view', { view: vKey })}
								>
									<span>{vDef.label}</span>
									{vDef.count !== undefined && (
										<Badge variant={isActive ? 'secondary' : 'muted'} className="ml-1 px-1.5 py-0">
											{vDef.count}
										</Badge>
									)}
								</Button>
							);
						})}
						{savedViewsEntries.map(([sKey, sDef]) => {
							const fullKey = `saved:${sKey}`;
							const isActive = state.activeView === fullKey;
							return (
								<div key={fullKey} className="inline-flex items-center gap-0.5">
									<Button
										variant={isActive ? 'default' : 'outline'}
										size="xs"
										icon="bookmark"
										onClick={() => dispatch('select_view', { view: fullKey })}
									>
										{sDef.label}
									</Button>
									<button
										type="button"
										onClick={() => onRequestDeleteView({ key: fullKey, label: sDef.label })}
										className="inline-flex min-h-6 min-w-6 pointer-coarse:min-h-9 pointer-coarse:min-w-9 items-center justify-center rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
										aria-label={t('viewport.deleteSavedView', 'Delete saved view')}
										title={t('viewport.deleteSavedView', 'Delete saved view')}
									>
										<DynamicIcon name="x" className="size-3" />
									</button>
								</div>
							);
						})}
					</div>

					<div className="flex items-center gap-1.5">
						{showSaveViewInput ? (
							<div className="flex items-center gap-1">
								<Input
									aria-label={t('viewport.presetNamePlaceholder', 'Preset name...')}
									value={newViewLabel}
									onChange={(e) => setNewViewLabel(e.target.value)}
									placeholder={t('viewport.presetNamePlaceholder', 'Preset name...')}
									className="h-7 w-36 text-xs"
								/>
								<Button
									size="xs"
									onClick={() => {
										if (newViewLabel.trim()) {
											void dispatch('save_view', { label: newViewLabel.trim() });
											setNewViewLabel('');
											setShowSaveViewInput(false);
										}
									}}
								>
									{t('common.save', 'Save')}
								</Button>
								<Button variant="ghost" size="xs" onClick={() => setShowSaveViewInput(false)}>
									{t('common.cancel', 'Cancel')}
								</Button>
							</div>
						) : (
							<Button
								variant="ghost"
								size="xs"
								icon="bookmark-plus"
								onClick={() => setShowSaveViewInput(true)}
							>
								{t('viewport.saveView', 'Save View')}
							</Button>
						)}
					</div>
				</div>
			)}

			{/* Primary Toolbar & Filter Bar */}
			{state.showToolbar !== false && (
				<div
					data-rw-viewport-toolbar=""
					className={cn(
						'flex flex-wrap items-center justify-between gap-2.5',
						hasPillFilters && 'md:flex-nowrap'
					)}
				>
					{hasLeftFilters && (
						<div
							data-rw-viewport-filters=""
							className={cn(
								'flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-1',
								hasPillFilters && 'md:flex-nowrap'
							)}
						>
							{inlineViewPillItems.length > 0 && (
								<ViewportPillStrip
									items={inlineViewPillItems}
									activeKey={state.activeView || inlineViewPillItems[0]?.key || 'all'}
									ariaLabel={t('viewport.filterViews', 'Filter view')}
									onSelect={(vKey) => {
										void dispatch('select_view', { view: vKey });
									}}
								/>
							)}

							{pillFilterEntries.map(([fKey, fDef]) => {
								const optionItems: ViewportPillOption[] = [
									{
										key: '',
										label: t('common.all', 'All'),
										count: fDef.totalCount,
									},
									...Object.entries(fDef.options || {}).map(([optKey, optLabel]) => ({
										key: optKey,
										label: optLabel,
										count: fDef.counts?.[optKey],
										icon: fDef.icons?.[optKey],
									})),
								];
								return (
									<ViewportPillStrip
										key={fKey}
										items={optionItems}
										activeKey={String(state.filterValues?.[fKey] ?? '')}
										ariaLabel={fDef.label}
										onSelect={(val) => {
											void dispatch('filter', { key: fKey, value: val });
										}}
									/>
								);
							})}

							{selectFilterEntries.map(([fKey, fDef]) => (
								<Select
									key={fKey}
									aria-label={fDef.label}
									value={String(state.filterValues?.[fKey] ?? '')}
									onChange={(e) => dispatch('filter', { key: fKey, value: e.target.value })}
									className="h-8 w-full shrink-0 text-xs sm:w-auto sm:min-w-32 sm:max-w-48"
								>
									<option value="">
										{fDef.label}: {t('common.all', 'All')}
									</option>
									{Object.entries(fDef.options || {}).map(([optKey, optLabel]) => (
										<option key={optKey} value={optKey}>
											{optLabel}
										</option>
									))}
								</Select>
							))}

							{hasResetButton && (
								<Button
									variant="ghost"
									size="xs"
									icon="rotate-ccw"
									className="shrink-0"
									onClick={onResetFilters}
								>
									{t('common.reset', 'Reset')}
								</Button>
							)}
						</div>
					)}

					<div
						data-rw-viewport-actions=""
						className={cn(
							'flex w-full flex-wrap items-center gap-2 shrink-0',
							hasLeftFilters ? 'sm:ml-auto sm:w-auto' : 'sm:flex-1'
						)}
					>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								onSubmitSearch(searchInput);
							}}
							className={cn(
								'relative min-w-0 flex-1',
								hasLeftFilters ? 'sm:w-56 sm:flex-none' : 'sm:flex-1'
							)}
						>
							<Input
								ref={searchInputRef}
								type="search"
								aria-label={state.searchPlaceholder || t('viewport.searchPlaceholder', 'Search records...')}
								value={searchInput}
								onChange={(e) => onSearchInputChange(e.target.value)}
								placeholder={state.searchPlaceholder || t('viewport.searchPlaceholderShort', 'Search...')}
								className="h-8 pl-8 pr-7 text-xs [&::-webkit-search-cancel-button]:hidden"
							/>
							<DynamicIcon
								name="search"
								className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground"
							/>
							{searchInput && (
								<button
									type="button"
									aria-label={t('common.clear', 'Clear')}
									onClick={() => onSubmitSearch('')}
									className="absolute right-2 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
								>
									<DynamicIcon name="x" className="size-3.5" />
								</button>
							)}
						</form>

						{state.allowedViewModes && state.allowedViewModes.length > 1 && (
							<div className="inline-flex shrink-0 items-center rounded-md border border-border bg-card p-0.5">
								{state.allowedViewModes.map((mode) => {
									const isActive = state.viewMode === mode;
									const iconName =
										mode === 'table'
											? 'table'
											: mode === 'cards'
												? 'layout-grid'
												: mode === 'kanban'
													? 'columns'
													: 'calendar';
									const preloadMode = () => {
										const target = mode.toLowerCase();
										if (state.viewStyles?.[target]?.length) {
											ensureViewportModeStylesLoaded(target, state.viewStyles);
										}
										if (!getViewport(target)) {
											if (state.viewScripts?.[target]?.length) {
												ensureViewportModeScriptLoaded(target, state.viewScripts);
											} else {
												void window.ReactWorkspaceRuntime?.ensureViewportModeLoaded?.(target);
											}
										}
									};
									return (
										<button
											key={mode}
											type="button"
											onClick={() => dispatch('switch_view_mode', { mode })}
											onMouseEnter={preloadMode}
											onFocus={preloadMode}
											className={cn(
												'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium capitalize transition-colors cursor-pointer',
												isActive
													? 'bg-primary text-primary-foreground'
													: 'text-muted-foreground hover:text-foreground'
											)}
										>
											<DynamicIcon name={iconName} className="size-3.5" />
											<span>{mode}</span>
										</button>
									);
								})}
							</div>
						)}

						{state.columnPickerEnabled !== false && Object.keys(state.columns || {}).length > 1 && (
							<div ref={columnPickerRef} className="relative shrink-0">
								<Button
									variant="outline"
									size="sm"
									icon="sliders-horizontal"
									aria-expanded={showColumnPicker}
									onClick={() => setShowColumnPicker((v) => !v)}
								>
									{t('viewport.columns', 'Columns')}
								</Button>
								{showColumnPicker && (
									<div className="absolute right-0 z-30 mt-1.5 w-52 rounded-lg border border-border bg-popover p-2 shadow-lg">
										<div className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-semibold uppercase text-muted-foreground">
											<span>{t('viewport.toggleColumns', 'Toggle Columns')}</span>
											<button
												type="button"
												onClick={() => dispatch('reset_columns')}
												className="text-primary hover:underline cursor-pointer"
											>
												{t('common.reset', 'Reset')}
											</button>
										</div>
										<div className="space-y-1">
											{Object.entries(state.columns || {}).map(([colKey, colDef]) => {
												const isHidden = (state.hiddenColumns || []).includes(colKey);
												return (
													<label
														key={colKey}
														className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted cursor-pointer"
													>
														<input
															type="checkbox"
															checked={!isHidden}
															onChange={() => dispatch('toggle_column', { column: colKey })}
															className="size-3.5 rounded border-border accent-primary"
														/>
														<span className="truncate">{colDef.label}</span>
													</label>
												);
											})}
										</div>
									</div>
								)}
							</div>
						)}

						{state.exportEnabled && (
							<Button
								variant="outline"
								size="sm"
								icon="download"
								className="shrink-0"
								onClick={() => dispatch('export', { format: 'csv' })}
							>
								{t('common.export', 'Export')}
							</Button>
						)}

						{Array.isArray(state.toolbarActions) &&
							state.toolbarActions.map((tAct) => {
								if (!tAct || !tAct.label) {
									return null;
								}
								const safeHref = tAct.href ? sanitizeHref(tAct.href) : '';
								if (safeHref) {
									return (
										<ViewportLink
											key={tAct.key}
											href={safeHref}
											{...(tAct.dataAttrs || {})}
											className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:border-primary hover:bg-muted/70"
										>
											{tAct.icon ? <DynamicIcon name={tAct.icon} className="size-3.5" /> : null}
											<span>{tAct.label}</span>
											{tAct.badge ? (
												<Badge variant="secondary" mono className="px-1.5 py-0 text-[10px]">
													{tAct.badge}
												</Badge>
											) : null}
										</ViewportLink>
									);
								}
								const isDanger = tAct.variant === 'danger' || tAct.variant === 'destructive';
								return (
									<Button
										key={tAct.key}
										type="button"
										variant={isDanger ? 'destructive' : 'outline'}
										size="sm"
										icon={tAct.icon}
										disabled={busy}
										className="shrink-0"
										{...(tAct.dataAttrs || {})}
										onClick={() => {
											if (tAct.confirm) {
												onRequestToolbarConfirm({
													actionType: 'toolbar_action',
													key: tAct.key,
													label: tAct.label,
													confirm: tAct.confirm,
													danger: isDanger,
												});
												return;
											}
											void dispatch('toolbar_action', { toolbarAction: tAct.key });
										}}
									>
										<span>{tAct.label}</span>
										{tAct.badge ? (
											<Badge variant="secondary" mono className="ml-1 px-1.5 py-0 text-[10px]">
												{tAct.badge}
											</Badge>
										) : null}
									</Button>
								);
							})}

						{renderViewportCreateTrigger(state, 'viewport-create', false)}
					</div>
				</div>
			)}
		</>
	);
}
