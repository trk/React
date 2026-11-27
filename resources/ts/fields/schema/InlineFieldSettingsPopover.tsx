import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { PortalRoot } from '../../ui';
import {
	formatInlineSettingSummaryChip,
	getNeutralSettingValue,
	inlineSettingValuesEqual,
	isCompactPopoverField,
	lookupScopedFieldValue,
	resolveFieldState,
} from '../shared';
import type { SchemaFieldDefinition } from '../types';
import type { SchemaFieldComponentProps } from './SchemaFormContext';

export interface SettingsPopoverShellProps {
	ownerLabel: string;
	summaryChips: string[];
	overflowChipCount: number;
	modifiedCount: number;
	disabled?: boolean;
	hasBoundError?: boolean;
	allFieldsDisabled: boolean;
	useTwoColumns: boolean;
	rowUnits: number;
	repositionKey: string;
	onReset?: () => void;
	triggerClassName?: string;
	triggerChipClassName?: string;
	triggerOverflowClassName?: string;
	triggerIconClassName?: string;
	children: (ctx: { isTwoColActive: boolean; panelId: string }) => React.ReactNode;
}

export const SettingsPopoverShell: React.FC<SettingsPopoverShellProps> = ({
	ownerLabel,
	summaryChips,
	overflowChipCount,
	modifiedCount,
	disabled,
	hasBoundError,
	allFieldsDisabled,
	useTwoColumns,
	rowUnits,
	repositionKey,
	onReset,
	triggerClassName,
	triggerChipClassName,
	triggerOverflowClassName,
	triggerIconClassName,
	children,
}) => {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const panelRef = useRef<HTMLDivElement | null>(null);
	const panelId = useId();
	const headingId = useId();
	const [pos, setPos] = useState<{
		top: number;
		left: number;
		width: number;
		maxHeight: number;
		flipTop: boolean;
	}>({
		top: 0,
		left: 0,
		width: 336,
		maxHeight: 440,
		flipTop: false,
	});

	const refreshPosition = useCallback(() => {
		const el = triggerRef.current;
		if (!el || typeof window === 'undefined') {
			return;
		}
		const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
		if (activeEl instanceof HTMLSelectElement && panelRef.current?.contains(activeEl)) {
			return;
		}
		const rect = el.getBoundingClientRect();
		const gap = 6;
		const margin = 12;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const preferredWidth = useTwoColumns ? 448 : 336;
		const width = Math.min(preferredWidth, Math.max(260, vw - margin * 2));
		const chromeHeight = allFieldsDisabled ? 104 : 68;
		const estimatedHeight = Math.min(540, Math.ceil(rowUnits) * 68 + chromeHeight);
		const spaceBelow = vh - rect.bottom - margin;
		const spaceAbove = rect.top - margin;
		const flipTop = spaceBelow < estimatedHeight + gap && spaceAbove > spaceBelow;
		const availableSpace = Math.max(200, (flipTop ? spaceAbove : spaceBelow) - gap);
		const maxHeight = Math.min(540, vh - margin * 2, availableSpace);
		const left = Math.max(margin, Math.min(rect.right - width, vw - width - margin));
		const top = flipTop ? Math.max(margin, rect.top - gap) : rect.bottom + gap;
		setPos((prev) =>
			prev.top === top &&
			prev.left === left &&
			prev.width === width &&
			prev.maxHeight === maxHeight &&
			prev.flipTop === flipTop
				? prev
				: { top, left, width, maxHeight, flipTop }
		);
	}, [useTwoColumns, allFieldsDisabled, rowUnits]);

	const refreshPositionRef = useRef(refreshPosition);
	refreshPositionRef.current = refreshPosition;

	useEffect(() => {
		if (!open) {
			return;
		}
		refreshPositionRef.current();
		const focusRaf = window.requestAnimationFrame(() => {
			const panel = panelRef.current;
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
			if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
				return;
			}
			if (target instanceof Element && target.closest('[data-rw-portal-overlay]')) {
				return;
			}
			setOpen(false);
		};
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || e.defaultPrevented) {
				return;
			}
			const target = e.target as Element | null;
			const targetOverlay = target?.closest?.('[data-rw-portal-overlay]');
			const panelOverlay = panelRef.current;
			if (targetOverlay && panelOverlay && targetOverlay !== panelOverlay && !panelOverlay.contains(targetOverlay)) {
				return;
			}
			e.stopPropagation();
			setOpen(false);
			triggerRef.current?.focus();
		};
		const handleReposition = (e: Event) => {
			if (e.type === 'scroll' && e.target instanceof Node && panelRef.current?.contains(e.target)) {
				return;
			}
			refreshPositionRef.current();
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
	}, [open]);

	useEffect(() => {
		if (open) {
			refreshPositionRef.current();
		}
	}, [open, repositionKey, useTwoColumns, allFieldsDisabled]);

	const isTwoColActive = useTwoColumns && pos.width >= 400;

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				disabled={disabled}
				aria-expanded={open}
				aria-controls={open ? panelId : undefined}
				aria-haspopup="dialog"
				aria-label={t('form.openFieldSettings', { field: ownerLabel }, '{field} settings')}
				data-rw-inline-settings-trigger=""
				onClick={() => setOpen((prev) => !prev)}
				className={cn(
					'inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed',
					hasBoundError
						? 'border-destructive/60 bg-destructive/10 text-destructive'
						: open
							? 'border-primary/60 bg-primary/12 text-foreground'
							: 'border-border bg-muted/50 text-foreground/85 hover:border-border hover:bg-muted hover:text-foreground',
					triggerClassName
				)}
			>
				{hasBoundError ? <span className="size-1.5 rounded-full bg-destructive shrink-0" /> : null}
				{summaryChips.length > 0 ? (
					<span className={cn('font-mono text-[10px] leading-none tracking-tight text-foreground', triggerChipClassName)}>
						{summaryChips.join(' · ')}
					</span>
				) : null}
				{overflowChipCount > 0 ? (
					<span
						data-rw-inline-settings-overflow=""
						className={cn(
							'rounded border border-border/70 bg-background/80 px-1 py-0.5 font-mono text-[10px] leading-none text-foreground/85',
							triggerOverflowClassName
						)}
					>
						+{overflowChipCount}
					</span>
				) : null}
				<DynamicIcon name="sliders-horizontal" className={cn('size-3 shrink-0', triggerIconClassName)} />
			</button>

			{open ? (
				<PortalRoot anchor={triggerRef.current} ssrFallback={false}>
					<div
						ref={panelRef}
						id={panelId}
						role="dialog"
						aria-modal="false"
						aria-labelledby={headingId}
						tabIndex={-1}
						data-rw-portal-overlay=""
						data-rw-inline-settings-popover=""
						data-placement={pos.flipTop ? 'top' : 'bottom'}
						data-layout={isTwoColActive ? 'two-col' : 'single-col'}
						onInput={(e) => e.stopPropagation()}
						onChange={(e) => e.stopPropagation()}
						style={{
							position: 'fixed',
							top: pos.top,
							left: pos.left,
							width: pos.width,
							maxHeight: pos.maxHeight,
							transform: pos.flipTop ? 'translateY(-100%)' : undefined,
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
								<span id={headingId} className="truncate text-xs font-semibold text-foreground">
									{t('form.fieldSettingsTitle', { field: ownerLabel }, '{field} Settings')}
								</span>
								{modifiedCount > 0 ? (
									<span
										data-rw-inline-settings-count=""
										title={t(
											'form.activeSettingsCount',
											{ count: modifiedCount },
											'{count} customized'
										)}
										className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/12 px-1.5 font-mono text-[10px] font-semibold tabular-nums text-primary-ink"
									>
										{modifiedCount}
									</span>
								) : null}
							</div>
							<div className="flex shrink-0 items-center gap-1">
								{modifiedCount > 0 && !disabled && !allFieldsDisabled && onReset ? (
									<button
										type="button"
										onClick={onReset}
										data-rw-inline-settings-reset=""
										className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<DynamicIcon name="rotate-ccw" className="size-3 shrink-0" aria-hidden="true" />
										<span>{t('common.reset', 'Reset')}</span>
									</button>
								) : null}
								<button
									type="button"
									aria-label={t('form.closeFieldSettings', 'Close field settings')}
									onClick={() => {
										setOpen(false);
										triggerRef.current?.focus();
									}}
									className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<DynamicIcon name="x" className="size-3.5" aria-hidden="true" />
								</button>
							</div>
						</div>

						{allFieldsDisabled ? (
							<div
								role="status"
								data-rw-inline-settings-locked=""
								className="flex shrink-0 items-center gap-2 border-b border-border/80 bg-muted/45 px-3.5 py-2 text-[11px] leading-snug text-foreground/85"
							>
								<DynamicIcon name="lock" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
								<span>
									{t(
										'form.inlineSettingsLocked',
										{ field: ownerLabel },
										'Controls unlock once "{field}" has a value.'
									)}
								</span>
							</div>
						) : null}

						<div
							data-rw-inline-settings-body=""
							className={cn(
								'flex-1 min-h-0 overflow-y-auto p-3.5',
								isTwoColActive
									? 'grid grid-cols-2 gap-x-3 gap-y-2.5 items-start'
									: 'space-y-2.5'
							)}
						>
							{children({ isTwoColActive, panelId })}
						</div>
					</div>
				</PortalRoot>
			) : null}
		</>
	);
};

export const InlineFieldSettingsPopover: React.FC<{
	ownerLabel: string;
	settingNames: string[];
	fieldsByName?: ReadonlyMap<string, SchemaFieldDefinition>;
	formValues?: Record<string, unknown>;
	conditionValues?: Record<string, unknown>;
	allErrors?: Record<string, string>;
	scopePrefix?: string;
	disabled?: boolean;
	extraFields?: SchemaFieldDefinition[];
	extraValues?: Record<string, unknown>;
	FieldRenderer: React.ComponentType<SchemaFieldComponentProps>;
	onUpdateSetting: (targetField: SchemaFieldDefinition, nextValue: unknown) => void;
	onNamedSettingChange?: (ownerField: SchemaFieldDefinition, targetName: string, nextValue: unknown) => void;
	onUpdateExtraFields?: (patches: Record<string, unknown>) => void;
}> = ({
	ownerLabel,
	settingNames,
	fieldsByName,
	formValues = {},
	conditionValues,
	allErrors = {},
	scopePrefix,
	disabled,
	extraFields,
	extraValues,
	FieldRenderer,
	onUpdateSetting,
	onNamedSettingChange,
	onUpdateExtraFields,
}) => {
	const effectiveConditionValues = useMemo(() => {
		const base = conditionValues ?? formValues;
		return extraValues && Object.keys(extraValues).length > 0
			? { ...base, ...extraValues }
			: base;
	}, [conditionValues, formValues, extraValues]);
	const extraFieldNames = useMemo(
		() => new Set((extraFields || []).map((bf) => bf.name).filter(Boolean)),
		[extraFields]
	);

	const resolvedFields = useMemo(() => {
		const out: SchemaFieldDefinition[] = [];
		const seen = new Set<string>();
		if (fieldsByName && settingNames.length > 0) {
			const cleanPrefix = scopePrefix ? scopePrefix.replace(/_+$/, '') : '';
			for (const rawKey of settingNames) {
				const key = rawKey.trim();
				if (!key) {
					continue;
				}
				const candidate =
					fieldsByName.get(key) ||
					(cleanPrefix ? fieldsByName.get(`${cleanPrefix}_${key}`) : undefined);
				if (candidate && candidate.name && !seen.has(candidate.name)) {
					seen.add(candidate.name);
					out.push(candidate);
				}
			}
		}
		if (Array.isArray(extraFields)) {
			for (const ef of extraFields) {
				if (ef.name && !seen.has(ef.name)) {
					seen.add(ef.name);
					out.push(ef);
				}
			}
		}
		return out;
	}, [fieldsByName, settingNames, scopePrefix, extraFields]);

	const fieldRows = useMemo(
		() =>
			resolvedFields
				.map((bf) => ({
					field: bf,
					state: resolveFieldState(bf, effectiveConditionValues, scopePrefix),
				}))
				.filter((row) => row.state.visible),
		[resolvedFields, effectiveConditionValues, scopePrefix]
	);

	const visibleFields = useMemo(() => fieldRows.map((row) => row.field), [fieldRows]);
	const portaledFieldMap = useMemo(() => {
		const map = new Map<string, SchemaFieldDefinition>();
		for (const bf of resolvedFields) {
			if (bf.name) {
				map.set(bf.name, {
					...bf,
					id: `${bf.id || bf.name}__inline`,
					inlineSettings: undefined,
				});
			}
		}
		return map;
	}, [resolvedFields]);
	const visibleFieldSignature = useMemo(
		() => visibleFields.map((bf) => bf.name).join('\u0000'),
		[visibleFields]
	);

	const readFieldValue = useCallback(
		(bf: SchemaFieldDefinition): unknown => {
			if (extraValues && bf.name in extraValues) {
				return extraValues[bf.name];
			}
			const scoped = lookupScopedFieldValue(formValues, bf.name, scopePrefix);
			if (scoped.found) {
				return scoped.value;
			}
			if (bf.value !== undefined) {
				return bf.value;
			}
			return bf.defaultValue;
		},
		[extraValues, formValues, scopePrefix]
	);

	const allChips = useMemo(() => {
		const chips: string[] = [];
		for (const bf of visibleFields) {
			const chip = formatInlineSettingSummaryChip(bf, readFieldValue(bf));
			if (chip) {
				chips.push(chip);
			}
		}
		return chips;
	}, [visibleFields, readFieldValue]);

	const summaryChips = allChips.slice(0, 3);
	const overflowChipCount = Math.max(0, allChips.length - summaryChips.length);

	const modifiedCount = useMemo(() => {
		let count = 0;
		for (const bf of visibleFields) {
			if (!inlineSettingValuesEqual(readFieldValue(bf), getNeutralSettingValue(bf))) {
				count += 1;
			}
		}
		return count;
	}, [visibleFields, readFieldValue]);

	const allFieldsDisabled =
		fieldRows.length > 0 &&
		fieldRows.every((row) => Boolean(disabled || row.field.disabled || row.state.disabled));

	const compactCount = useMemo(
		() => visibleFields.filter((bf) => isCompactPopoverField(bf)).length,
		[visibleFields]
	);
	const useTwoColumns = visibleFields.length >= 4 && compactCount >= 2;
	const rowUnits = useMemo(
		() =>
			useTwoColumns
				? visibleFields.reduce((acc, bf) => acc + (isCompactPopoverField(bf) ? 0.5 : 1), 0)
				: visibleFields.length,
		[visibleFields, useTwoColumns]
	);

	const hasBoundError = useMemo(
		() => visibleFields.some((bf) => bf.name && Boolean(allErrors[bf.name])),
		[visibleFields, allErrors]
	);

	if (visibleFields.length === 0) {
		return null;
	}

	const handleReset = () => {
		if (disabled || allFieldsDisabled) {
			return;
		}
		const extraResetPatches: Record<string, unknown> = {};
		for (const { field: bf, state: bfState } of fieldRows) {
			if (bf.disabled || bfState.disabled) {
				continue;
			}
			const bfVal = readFieldValue(bf);
			const neutralVal = getNeutralSettingValue(bf);
			if (!inlineSettingValuesEqual(bfVal, neutralVal)) {
				if (bf.name && extraFieldNames.has(bf.name)) {
					extraResetPatches[bf.name] = neutralVal;
				} else {
					onUpdateSetting(bf, neutralVal);
				}
			}
		}
		if (Object.keys(extraResetPatches).length > 0 && onUpdateExtraFields) {
			onUpdateExtraFields(extraResetPatches);
		}
	};

	return (
		<SettingsPopoverShell
			ownerLabel={ownerLabel}
			summaryChips={summaryChips}
			overflowChipCount={overflowChipCount}
			modifiedCount={modifiedCount}
			disabled={disabled}
			hasBoundError={hasBoundError}
			allFieldsDisabled={allFieldsDisabled}
			useTwoColumns={useTwoColumns}
			rowUnits={rowUnits}
			repositionKey={visibleFieldSignature}
			onReset={handleReset}
		>
			{({ isTwoColActive }) =>
				fieldRows.map(({ field: bf, state: bfState }) => {
					const bfVal = readFieldValue(bf);
					const portaledField = portaledFieldMap.get(bf.name) ?? bf;
					const isFullWidth = isTwoColActive && !isCompactPopoverField(bf);
					return (
						<div
							key={bf.name}
							className={cn('min-w-0', isFullWidth && 'col-span-2')}
						>
							<FieldRenderer
								field={portaledField}
								value={bfVal}
								formValues={formValues}
								conditionValues={effectiveConditionValues}
								allErrors={allErrors}
								errorMessage={bf.name ? allErrors[bf.name] : undefined}
								isDynamicallyRequired={bfState.required}
								isDynamicallyDisabled={Boolean(disabled || bf.disabled || bfState.disabled)}
								scopePrefix={scopePrefix}
								suppressInlineSettings
								inlinePortal
								onChange={(nextVal) => {
									if (bf.name && extraFieldNames.has(bf.name) && onUpdateExtraFields) {
										onUpdateExtraFields({ [bf.name]: nextVal });
									} else {
										onUpdateSetting(bf, nextVal);
									}
								}}
								onNamedChange={(targetName, nextVal) => {
									if (bf.name && extraFieldNames.has(bf.name) && onUpdateExtraFields) {
										onUpdateExtraFields({ [targetName]: nextVal });
									} else if (onNamedSettingChange) {
										onNamedSettingChange(bf, targetName, nextVal);
									} else {
										onUpdateSetting({ ...bf, name: targetName || bf.name }, nextVal);
									}
								}}
							/>
						</div>
					);
				})
			}
		</SettingsPopoverShell>
	);
};
