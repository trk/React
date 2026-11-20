import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Card, CardContent } from '../../ui';
import {
	countNestedErrors,
	navigateTablistByKey,
	resolveFieldState,
	scrollTabIntoView,
	SearchableTabPanel,
} from '../shared';
import type {
	SchemaFieldAdornment,
	SchemaFieldDefinition,
	SchemaFormProps,
	SchemaTabPaneDefinition,
} from '../types';
import { InlineFieldSettingsPopover } from './InlineFieldSettingsPopover';
import { SchemaField, SchemaFieldFooter, SchemaFieldHeader } from './SchemaField';
import { useSchemaFormContext } from './SchemaFormContext';
import { hasVisibleNonInlineFields } from './schemaValueUtils';

export function SchemaIslandNode({
	field,
	errorMessage,
	formValues,
	conditionValues,
	allErrors,
	isDynamicallyRequired,
	isDynamicallyDisabled,
	scopePrefix,
	fieldsByName,
	adornment,
	onSettingFieldChange,
	onNamedSettingChange,
}: {
	field: SchemaFieldDefinition;
	errorMessage?: string;
	formValues?: Record<string, unknown>;
	conditionValues?: Record<string, unknown>;
	allErrors?: Record<string, string>;
	isDynamicallyRequired?: boolean;
	isDynamicallyDisabled?: boolean;
	scopePrefix?: string;
	fieldsByName?: ReadonlyMap<string, SchemaFieldDefinition>;
	adornment?: SchemaFieldAdornment;
	onSettingFieldChange?: (targetField: SchemaFieldDefinition, value: unknown) => void;
	onNamedSettingChange?: (ownerField: SchemaFieldDefinition, targetName: string, value: unknown) => void;
}) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const schemaCtx = useSchemaFormContext(hostRef);
	const resolvedError = errorMessage || field.error || '';
	const isRequired = isDynamicallyRequired !== undefined ? Boolean(isDynamicallyRequired) : Boolean(field.required);
	const isDisabled = Boolean(field.disabled || field.readonly || field.readOnly || isDynamicallyDisabled);
	const effectiveFieldsByName = fieldsByName ?? schemaCtx?.fieldsByName;
	const serializedProps = useMemo(() => JSON.stringify(field.props || {}), [field.props]);
	const [, setRegistryTick] = useState(0);
	const islandFieldId = field.id || `Inputfield_${field.name}`;
	const islandErrorId = resolvedError ? `${islandFieldId}__err` : undefined;
	const islandNotesId = field.notes ? `${islandFieldId}__notes` : undefined;

	const InlineIslandComponent =
		typeof window !== 'undefined' && field.component
			? window.ReactWorkspaceRuntime?.getIsland?.(field.component)
			: undefined;

	useEffect(() => {
		if (typeof window === 'undefined' || !window.ReactWorkspaceRuntime?.subscribeIslands) {
			return;
		}
		return window.ReactWorkspaceRuntime.subscribeIslands(() => {
			setRegistryTick((t) => t + 1);
		});
	}, []);

	useEffect(() => {
		if (InlineIslandComponent) {
			return;
		}
		const el = hostRef.current;
		if (el && typeof window !== 'undefined') {
			window.ReactWorkspaceRuntime?.mountIslands(el.parentElement || el);
		}
	}, [field.component, serializedProps, InlineIslandComponent]);

	const inlineSettingsNode =
		Array.isArray(field.inlineSettings) && field.inlineSettings.length > 0 ? (
			<InlineFieldSettingsPopover
				ownerLabel={field.label || field.name || 'Field'}
				settingNames={field.inlineSettings}
				fieldsByName={effectiveFieldsByName}
				formValues={formValues ?? schemaCtx?.values}
				conditionValues={conditionValues}
				allErrors={allErrors ?? schemaCtx?.errors}
				scopePrefix={scopePrefix ?? schemaCtx?.scopePrefix}
				disabled={isDisabled}
				FieldRenderer={SchemaField}
				onUpdateSetting={(targetField, nextVal) => {
					if (onSettingFieldChange) {
						onSettingFieldChange(targetField, nextVal);
					} else if (schemaCtx?.updateFieldValue) {
						schemaCtx.updateFieldValue(
							targetField.name,
							nextVal,
							targetField,
							scopePrefix ?? schemaCtx.scopePrefix
						);
					}
				}}
				onNamedSettingChange={(ownerField, targetName, nextVal) => {
					if (onNamedSettingChange) {
						onNamedSettingChange(ownerField, targetName, nextVal);
					} else if (schemaCtx?.updateFieldValue) {
						schemaCtx.updateFieldValue(
							targetName || ownerField.name,
							nextVal,
							ownerField,
							scopePrefix ?? schemaCtx.scopePrefix
						);
					}
				}}
			/>
		) : null;

	const hasBoundOverlay = Boolean(adornment?.boundOverlay);
	const effectiveRequired = hasBoundOverlay ? false : isRequired;
	const headerRightNode =
		adornment?.labelAction || inlineSettingsNode ? (
			<div className="flex items-center gap-1.5">
				{adornment?.labelAction}
				{inlineSettingsNode}
			</div>
		) : null;

	return (
		<div
			className={field.noWrap ? 'space-y-1.5' : 'space-y-2'}
			data-field-name={field.name}
			data-field-no-wrap={field.noWrap ? '1' : undefined}
			data-field-error={resolvedError ? '1' : undefined}
		>
			{!field.noWrap ? (
				<>
					{field.label || headerRightNode ? (
						<div
							data-rw-field-slot="label"
							className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
						>
							{field.label ? (
								<div className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
									{field.icon ? (
										<DynamicIcon name={field.icon} className="size-3.5 text-muted-foreground shrink-0" />
									) : null}
									<span>{field.label}</span>
									{effectiveRequired ? <span className="text-destructive">*</span> : null}
								</div>
							) : (
								<span />
							)}
							{headerRightNode}
						</div>
					) : null}
					{field.description ? (
						<p data-rw-field-slot="description" className="text-xs text-muted-foreground leading-relaxed">
							{field.description}
						</p>
					) : null}
				</>
			) : headerRightNode ? (
				<div data-rw-field-slot="label" className="flex justify-end">{headerRightNode}</div>
			) : null}
			{hasBoundOverlay ? <div data-rw-field-slot="bound-overlay">{adornment?.boundOverlay}</div> : null}
			<div
				data-rw-field-slot="input"
				hidden={hasBoundOverlay || undefined}
				aria-hidden={hasBoundOverlay ? 'true' : undefined}
				className={hasBoundOverlay ? 'hidden' : undefined}
			>
				{InlineIslandComponent ? (
					<InlineIslandComponent {...(field.props || {})} />
				) : (
					<div
						ref={hostRef}
						data-inertia-island={field.component}
						data-react-island={field.component}
						data-props={serializedProps}
					/>
				)}
			</div>
			<SchemaFieldFooter
				notes={field.noWrap ? undefined : field.notes}
				notesId={islandNotesId}
				error={resolvedError}
				errorId={islandErrorId}
			/>
		</div>
	);
}

export function SchemaMarkupNode({ field, errorMessage }: { field: SchemaFieldDefinition; errorMessage?: string }) {
	const htmlRef = useRef<HTMLDivElement | null>(null);
	const resolvedError = errorMessage || field.error || '';

	useEffect(() => {
		const el = htmlRef.current;
		if (el && typeof window !== 'undefined') {
			window.ReactWorkspaceRuntime?.mountIslands(el);
		}
	}, [field.html]);

	return (
		<div
			className={cn(
				field.noWrap ? 'space-y-2' : 'space-y-2 rounded-lg border border-border/70 bg-muted/15 p-3',
				resolvedError && 'border-destructive/40 bg-destructive/4'
			)}
			data-field-name={field.name}
			data-field-error={resolvedError ? '1' : undefined}
		>
			{!field.noWrap ? <SchemaFieldHeader field={field} className="border-b border-border pb-2" /> : null}
			<div
				ref={htmlRef}
				className="text-xs text-foreground"
				onClick={(e) => {
					const copyVal = (e.target as HTMLElement | null)
						?.closest<HTMLElement>('[data-copy-text]')
						?.getAttribute('data-copy-text');
					if (copyVal) {
						void navigator.clipboard?.writeText(copyVal);
					}
				}}
				dangerouslySetInnerHTML={{ __html: field.html || '' }}
			/>
			<SchemaFieldFooter notes={field.notes} error={resolvedError} />
		</div>
	);
}

export function SchemaSectionNode({
	field,
	renderFieldsGrid,
	errors,
}: {
	field: SchemaFieldDefinition;
	renderFieldsGrid: (items: SchemaFieldDefinition[]) => React.ReactNode;
	errors: Record<string, string>;
}) {
	const childFields = Array.isArray(field.fields)
		? field.fields
		: field.fields && typeof field.fields === 'object'
			? Object.entries(field.fields).map(([name, def]) => ({ ...def, name: def.name || name }))
			: Array.isArray(field.children)
				? field.children
				: [];
	const errorCount = useMemo(() => countNestedErrors(childFields, errors), [childFields, errors]);
	const [collapsed, setCollapsed] = useState<boolean>(() =>
		errorCount > 0 ? false : Boolean(field.collapsed)
	);
	const sectionBodyId = useId().replace(/:/g, '');

	// Automatically expand collapsed section when a nested field fails validation
	useEffect(() => {
		if (errorCount > 0 && collapsed) {
			setCollapsed(false);
		}
	}, [errorCount, collapsed]);

	if (field.hideWrap) {
		return <div className="col-span-12">{renderFieldsGrid(childFields)}</div>;
	}

	return (
		<Card className="overflow-hidden border-border shadow-2xs" data-field-name={field.name}>
			{field.label ? (
				<button
					type="button"
					aria-expanded={!collapsed}
					aria-controls={`rw-sec-body-${sectionBodyId}`}
					onClick={() => setCollapsed((prev) => !prev)}
					className="flex w-full items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/50 cursor-pointer"
				>
					<div className="min-w-0">
						<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
							{field.icon ? (
								<DynamicIcon name={field.icon} className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
							) : null}
							<span>{field.label}</span>
							{errorCount > 0 ? <Badge variant="destructive">{errorCount}</Badge> : null}
						</div>
						{field.description ? (
							<p className="mt-0.5 text-xs text-muted-foreground">{field.description}</p>
						) : null}
					</div>
					<DynamicIcon
						name={collapsed ? 'chevron-down' : 'chevron-up'}
						className="size-4 text-muted-foreground shrink-0"
						aria-hidden="true"
					/>
				</button>
			) : null}
			<CardContent id={`rw-sec-body-${sectionBodyId}`} className={cn('p-4', collapsed && 'hidden')}>
				{renderFieldsGrid(childFields)}
			</CardContent>
		</Card>
	);
}

export function resolveTabPaneSlot(
	tabSlots: SchemaFormProps['tabSlots'],
	pane: SchemaTabPaneDefinition
): { before?: React.ReactNode; after?: React.ReactNode } | undefined {
	if (!tabSlots) {
		return undefined;
	}
	if (pane.id && tabSlots[pane.id]) {
		return tabSlots[pane.id];
	}
	if (pane.name && tabSlots[pane.name]) {
		return tabSlots[pane.name];
	}
	const tailMatch = pane.id?.match(/(?:^|_)tab_([a-z0-9_]+)$/i);
	if (tailMatch && tailMatch[1]) {
		const slug = tailMatch[1].toLowerCase();
		if (tabSlots[slug]) {
			return tabSlots[slug];
		}
	}
	const labelSlug = (pane.label || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	if (labelSlug && tabSlots[labelSlug]) {
		return tabSlots[labelSlug];
	}
	return undefined;
}

export function SchemaTabsGroupNode({
	field,
	values,
	errors,
	scopePrefix,
	tabSlots,
	renderFieldsGrid,
}: {
	field: SchemaFieldDefinition;
	values: Record<string, unknown>;
	errors: Record<string, string>;
	scopePrefix?: string;
	tabSlots?: SchemaFormProps['tabSlots'];
	renderFieldsGrid: (items: SchemaFieldDefinition[]) => React.ReactNode;
}) {
	const allPanes = useMemo(() => field.tabs ?? [], [field.tabs]);
	const visiblePanes = useMemo(
		() =>
			allPanes.filter((pane) => {
				if (!resolveFieldState(pane, values, scopePrefix).visible) {
					return false;
				}
				const slot = resolveTabPaneSlot(tabSlots, pane);
				if (slot?.before || slot?.after) {
					return true;
				}
				return (
					(pane.fields || []).length === 0 ||
					hasVisibleNonInlineFields(pane.fields, values, errors, scopePrefix)
				);
			}),
		[allPanes, values, errors, scopePrefix, tabSlots]
	);

	const tabStorageKey = useMemo(() => {
		if (typeof window === 'undefined') {
			return '';
		}
		return `rw_tab_group:${window.location.pathname}${window.location.search}:${scopePrefix || ''}:${field.id || field.name || 'tabs'}`;
	}, [scopePrefix, field.id, field.name]);

	const [activeTabId, setActiveTabId] = useState<string>(() => {
		if (tabStorageKey && typeof window !== 'undefined') {
			try {
				const saved = window.sessionStorage.getItem(tabStorageKey);
				const savedPane = saved ? allPanes.find((p) => p.id === saved) : undefined;
				if (savedPane && !savedPane.confirmDelete) {
					return savedPane.id;
				}
			} catch {
				// Ignore storage access errors
			}
		}
		return field.activeTab || visiblePanes[0]?.id || allPanes[0]?.id || '';
	});

	const updateActiveTab = useCallback(
		(nextTabId: string, skipPersist = false) => {
			setActiveTabId(nextTabId);
			if (!skipPersist && tabStorageKey && typeof window !== 'undefined') {
				try {
					window.sessionStorage.setItem(tabStorageKey, nextTabId);
				} catch {
					// Ignore storage access errors
				}
			}
		},
		[tabStorageKey]
	);

	const resolvedActiveId = useMemo(() => {
		if (visiblePanes.some((p) => p.id === activeTabId)) {
			return activeTabId;
		}
		return visiblePanes[0]?.id || '';
	}, [visiblePanes, activeTabId]);

	// Automatically switch to the first visible pane containing validation errors only when errors change
	const errorSig = useMemo(() => JSON.stringify(errors || {}), [errors]);
	const lastErrorSigRef = useRef<string>('');
	useEffect(() => {
		if (errorSig === lastErrorSigRef.current) {
			return;
		}
		lastErrorSigRef.current = errorSig;
		if (visiblePanes.length <= 1 || Object.keys(errors || {}).length === 0) {
			return;
		}
		const activePane = visiblePanes.find((p) => p.id === resolvedActiveId);
		const activeErrors = activePane ? countNestedErrors(activePane.fields || [], errors) : 0;
		if (activeErrors > 0) {
			return;
		}
		const firstErrorPane = visiblePanes.find(
			(p) => countNestedErrors(p.fields || [], errors) > 0
		);
		if (firstErrorPane && firstErrorPane.id !== activeTabId) {
			updateActiveTab(firstErrorPane.id);
		}
	}, [errorSig, errors, visiblePanes, resolvedActiveId, activeTabId, updateActiveTab]);

	const rawVariant = String(field.variant || 'line').toLowerCase();
	const isSegmented = rawVariant === 'segmented' || rawVariant === 'pills';
	const isVertical = rawVariant === 'vertical';
	const groupDomId = useId().replace(/:/g, '');
	const resolvedVariant = isVertical ? 'vertical' : isSegmented ? 'segmented' : 'line';

	return (
		<div className="space-y-3" data-field-name={field.name}>
			{field.label ? (
				<div className="text-xs font-semibold text-foreground">{field.label}</div>
			) : null}

			<div
				className={cn(
					isVertical ? 'grid grid-cols-1 gap-6 md:grid-cols-12' : 'space-y-3.5'
				)}
				data-variant={resolvedVariant}
			>
				<div
					role="tablist"
					aria-label={field.label || 'Sections'}
					aria-orientation={isVertical ? 'vertical' : 'horizontal'}
					data-rw-tablist=""
					data-variant={resolvedVariant}
					onKeyDown={(e) => navigateTablistByKey(e, isVertical ? 'vertical' : 'horizontal')}
					className={cn(
						isVertical
							? 'flex flex-col gap-1 border-border md:col-span-3 md:border-r md:pr-4'
							: isSegmented
								? 'inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-muted/50 p-1'
								: 'flex items-center gap-1 border-b border-border'
					)}
				>
					{visiblePanes.map((pane) => {
						const isActive = pane.id === resolvedActiveId;
						const errCount = countNestedErrors(pane.fields || [], errors);
						const tabBtnId = `rw-tab-${groupDomId}-${pane.id}`;
						const tabPanelId = `rw-panel-${groupDomId}-${pane.id}`;
						return (
							<button
								key={pane.id}
								id={tabBtnId}
								type="button"
								role="tab"
								aria-selected={isActive}
								aria-controls={tabPanelId}
								tabIndex={isActive ? 0 : -1}
								data-rw-confirm-delete-tab={pane.confirmDelete ? '1' : undefined}
								style={
									pane.confirmDelete
										? ({ '--tab-accent': 'var(--destructive)' } as React.CSSProperties)
										: undefined
								}
								onClick={(e) => {
									updateActiveTab(pane.id, Boolean(pane.confirmDelete));
									scrollTabIntoView(e.currentTarget);
								}}
								className={cn(
									'inline-flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									isSegmented || isVertical
										? cn(
												'rounded-md px-3 py-1.5',
												isVertical && 'w-full justify-start text-left',
												isActive
													? pane.confirmDelete
														? 'bg-background text-destructive shadow-2xs'
														: 'bg-background text-foreground shadow-2xs'
													: pane.confirmDelete
														? 'text-muted-foreground hover:text-destructive'
														: 'text-muted-foreground hover:text-foreground'
											)
										: cn(
												'px-3.5 py-2.5',
												isActive
													? pane.confirmDelete
														? 'text-destructive'
														: 'text-foreground'
													: pane.confirmDelete
														? 'text-muted-foreground hover:text-destructive'
														: 'text-muted-foreground hover:text-foreground'
											),
									errCount > 0 && 'text-destructive'
								)}
							>
								{pane.icon ? <DynamicIcon name={pane.icon} className="size-3.5 shrink-0" /> : null}
								<span>{pane.label}</span>
								{pane.badge !== undefined && pane.badge !== null && pane.badge !== '' ? (
									<Badge variant="secondary" mono>
										{pane.badge}
									</Badge>
								) : null}
								{errCount > 0 ? <Badge variant="destructive">{errCount}</Badge> : null}
							</button>
						);
					})}
				</div>

				<div className={cn('min-w-0', isVertical && 'md:col-span-9')}>
					{allPanes.map((pane) => {
						const isVisible = resolveFieldState(pane, values, scopePrefix).visible;
						const isActive = isVisible && pane.id === resolvedActiveId;
						const tabBtnId = `rw-tab-${groupDomId}-${pane.id}`;
						const tabPanelId = `rw-panel-${groupDomId}-${pane.id}`;
						const paneSlot = resolveTabPaneSlot(tabSlots, pane);
						return (
							<SearchableTabPanel
								key={pane.id}
								id={tabPanelId}
								labelledBy={tabBtnId}
								isActive={isActive}
								searchableWhenHidden={isVisible}
								onRevealMatch={() => updateActiveTab(pane.id)}
							>
								<div className="space-y-3.5">
									{paneSlot?.before}
									{pane.description ? (
										<p className="text-xs text-muted-foreground">{pane.description}</p>
									) : null}
									{renderFieldsGrid(pane.fields || [])}
									{paneSlot?.after}
									{pane.notes ? (
										<p className="text-[11px] text-muted-foreground/80">{pane.notes}</p>
									) : null}
								</div>
							</SearchableTabPanel>
						);
					})}
				</div>
			</div>
		</div>
	);
}
