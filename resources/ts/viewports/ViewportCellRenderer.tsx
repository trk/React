import React from 'react';
import { t } from '../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../lib/utils';
import {
	applyTextTruncate,
	Badge,
	BadgeGroup,
	CopyValueButton,
	Input,
	isViewportCellObject,
	normalizeViewportBadges,
	normalizeViewportThumb,
	RecordLeadingVisual,
	resolveRecordVisuals,
	Select,
	Switch,
	type BadgeProps,
	type ViewportCellObject,
} from '../ui';
import type { RenderCellOptions, ViewportColumn } from './types';
import { ViewportLink } from './viewportShared';

export interface EditingCellState {
	id: string;
	field: string;
	value: string;
}

export interface RenderViewportCellContext {
	record: Record<string, unknown>;
	colKey: string;
	colDef: ViewportColumn;
	options?: RenderCellOptions;
	dense?: boolean;
	editingCell: EditingCellState | null;
	setEditingCell: (next: EditingCellState | null) => void;
	hasDedicatedIconColumn: boolean;
	hasDedicatedThumbColumn: boolean;
	onToggleField: (id: string, field: string) => void;
	onUpdateField: (id: string, field: string, value: string) => void;
}

export function renderViewportCellValue({
	record,
	colKey,
	colDef,
	options,
	dense,
	editingCell,
	setEditingCell,
	hasDedicatedIconColumn,
	hasDedicatedThumbColumn,
	onToggleField,
	onUpdateField,
}: RenderViewportCellContext): React.ReactNode {
	const recordId = String(record.id ?? '');
	const rawVal = record[colKey];
	const colType = colDef.type || 'text';
	const isPrimaryCol = Boolean(options?.isPrimaryColumn);
	const justifyCls =
		colDef.align === 'right'
			? 'justify-end'
			: colDef.align === 'center'
				? 'justify-center'
				: 'justify-start';

	if (colType === 'boolean' || colType === 'toggle' || colType === 'switch') {
		const checked = Boolean(rawVal && rawVal !== '0' && rawVal !== 'false');
		if (colDef.editable) {
			return (
				<Switch
					checked={checked}
					aria-label={colDef.label}
					onCheckedChange={() => onToggleField(recordId, colKey)}
				/>
			);
		}
		return (
			<Badge variant={checked ? 'success' : 'secondary'}>
				{checked ? t('common.yes', 'Yes') : t('common.no', 'No')}
			</Badge>
		);
	}

	if (colKey === 'status' && record._statusVariant && !colDef.editable) {
		const statusLabel = String(record._statusLabel || rawVal || '—');
		return (
			<Badge variant={record._statusVariant as BadgeProps['variant']} dot>
				{statusLabel}
			</Badge>
		);
	}

	const recordCells =
		record._cells && typeof record._cells === 'object'
			? (record._cells as Record<string, unknown>)
			: null;
	const cellFromMap = recordCells ? recordCells[colKey] : undefined;
	const isIconValueObj =
		rawVal !== null &&
		typeof rawVal === 'object' &&
		!Array.isArray(rawVal) &&
		typeof (rawVal as Record<string, unknown>).name === 'string' &&
		('svg' in (rawVal as Record<string, unknown>) ||
			'variant' in (rawVal as Record<string, unknown>) ||
			'set' in (rawVal as Record<string, unknown>));

	const cellObj: ViewportCellObject | null = isViewportCellObject(cellFromMap)
		? cellFromMap
		: isViewportCellObject(rawVal)
			? rawVal
			: isIconValueObj
				? {
						icon: rawVal as Record<string, unknown>,
						label: String((rawVal as Record<string, unknown>).name || ''),
					}
				: null;

	if (colType === 'badge' || colType === 'status' || colDef.badgeVariants) {
		const explicitBadges = normalizeViewportBadges(cellObj?.badges ?? cellObj?.badge);
		if (explicitBadges.length > 0) {
			return <BadgeGroup badges={explicitBadges} maxVisible={cellObj?.maxBadges ?? colDef.maxBadges ?? 3} />;
		}
		if (Array.isArray(rawVal)) {
			const mapped = normalizeViewportBadges(
				rawVal.map((item) => {
					const key = String(item ?? '');
					return {
						label: colDef.options?.[key] ?? key,
						variant: (colDef.badgeVariants?.[key] as BadgeProps['variant']) || 'secondary',
					};
				})
			);
			return mapped.length > 0 ? (
				<BadgeGroup badges={mapped} maxVisible={colDef.maxBadges ?? 3} />
			) : (
				<span className="text-muted-foreground">—</span>
			);
		}
		const strVal = String(rawVal ?? '');
		const label = cellObj?.label ?? colDef.options?.[strVal] ?? strVal;
		const variantMap = colDef.badgeVariants || {};
		const badgeVariant = (variantMap[strVal] as BadgeProps['variant']) || 'secondary';
		return <Badge variant={badgeVariant}>{label || '—'}</Badge>;
	}

	if (colDef.editable && editingCell?.id === recordId && editingCell?.field === colKey) {
		const editScalar =
			rawVal !== null && typeof rawVal === 'object'
				? String(cellObj?.label ?? cellObj?.title ?? '')
				: String(rawVal ?? '');
		if (colDef.options && Object.keys(colDef.options).length > 0) {
			return (
				<Select
					aria-label={colDef.label}
					value={editingCell.value}
					onChange={(e) => {
						const nextVal = e.target.value;
						setEditingCell(null);
						onUpdateField(recordId, colKey, nextVal);
					}}
					onBlur={() => setEditingCell(null)}
					autoFocus
					className="h-7 text-xs"
				>
					{Object.entries(colDef.options).map(([optKey, optLabel]) => (
						<option key={optKey} value={optKey}>
							{optLabel}
						</option>
					))}
				</Select>
			);
		}

		return (
			<Input
				aria-label={colDef.label}
				value={editingCell.value}
				onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
				onBlur={() => {
					const nextVal = editingCell.value;
					setEditingCell(null);
					if (nextVal !== editScalar) {
						onUpdateField(recordId, colKey, nextVal);
					}
				}}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						const nextVal = editingCell.value;
						setEditingCell(null);
						onUpdateField(recordId, colKey, nextVal);
					} else if (e.key === 'Escape') {
						setEditingCell(null);
					}
				}}
				autoFocus
				className="h-7 text-xs"
			/>
		);
	}

	if (colType === 'icon') {
		const iconPayload = cellObj?.icon ?? (rawVal !== null && rawVal !== '' ? rawVal : undefined);
		if (iconPayload === undefined || iconPayload === '') {
			return <span className="text-muted-foreground">—</span>;
		}
		const iconLabel =
			cellObj?.label ??
			(typeof rawVal === 'string' && !rawVal.trim().startsWith('{')
				? rawVal.trim()
				: isIconValueObj
					? String((rawVal as Record<string, unknown>).name || '')
					: '');
		return (
			<span className={cn('inline-flex min-w-0 items-center gap-2', justifyCls)}>
				<RecordLeadingVisual icon={iconPayload as string | Record<string, unknown>} size="sm" />
				{iconLabel ? (
					<span className={cn('truncate', (cellObj?.mono ?? colDef.mono) && 'font-mono text-xs')}>
						{iconLabel}
					</span>
				) : null}
			</span>
		);
	}

	if (colType === 'media' || colType === 'image') {
		const mediaThumb = normalizeViewportThumb(
			cellObj?.thumb ?? rawVal,
			String(record.title || record.name || colDef.label)
		);
		if (!mediaThumb) {
			return <span className="text-muted-foreground">—</span>;
		}
		return (
			<span className={cn('inline-flex min-w-0 items-center gap-2', justifyCls)}>
				<RecordLeadingVisual thumb={mediaThumb} size={dense ? 'sm' : 'md'} />
				{cellObj?.label ? <span className="truncate text-xs">{cellObj.label}</span> : null}
			</span>
		);
	}

	const recordFormatted =
		record._formatted && typeof record._formatted === 'object'
			? (record._formatted as Record<string, unknown>)
			: null;
	const formattedVal = recordFormatted?.[colKey];
	const plainFormatted =
		typeof formattedVal === 'string' && !formattedVal.includes('<')
			? formattedVal
			: undefined;

	const optionMappedLabel =
		colDef.options && rawVal !== undefined ? colDef.options[String(rawVal)] : undefined;

	const displayStr: string =
		cellObj?.label !== undefined
			? String(cellObj.label || '—')
			: cellObj?.title !== undefined
				? String(cellObj.title || '—')
				: optionMappedLabel !== undefined
					? optionMappedLabel
					: plainFormatted !== undefined && plainFormatted !== ''
						? plainFormatted
						: rawVal === null || rawVal === undefined || rawVal === ''
							? '—'
							: typeof rawVal === 'object'
								? JSON.stringify(rawVal)
								: String(rawVal);

	const recVisuals =
		isPrimaryCol && !options?.suppressRecordVisuals
			? resolveRecordVisuals(record, {
					hasDedicatedIconColumn,
					hasDedicatedThumbColumn,
				})
			: null;

	const thumb =
		normalizeViewportThumb(cellObj?.thumb, displayStr) ?? (recVisuals ? recVisuals.thumb : null);
	const icon = cellObj?.icon ?? (!thumb && recVisuals ? recVisuals.icon : undefined);
	const rawSubtitle = (cellObj?.subtitle ?? (recVisuals ? recVisuals.subtitle : ''))?.trim() || '';
	const subtitle = rawSubtitle !== '' && rawSubtitle !== displayStr ? rawSubtitle : '';
	const badges = [
		...normalizeViewportBadges(cellObj?.badges ?? cellObj?.badge),
		...(recVisuals ? recVisuals.badges : []),
	];
	const locked = Boolean(recVisuals?.locked);

	const primaryEditHref =
		isPrimaryCol &&
		!colDef.editable &&
		typeof record._editUrl === 'string' &&
		record._editUrl !== ''
			? sanitizeHref(record._editUrl)
			: '';
	const explicitHref = sanitizeHref(
		cellObj?.href || (colType === 'link' && typeof rawVal === 'string' ? rawVal : '')
	);
	const resolvedHref = explicitHref || primaryEditHref;
	const isExternal = Boolean(
		cellObj?.external || (explicitHref !== '' && colType === 'link' && /^https?:\/\//i.test(explicitHref))
	);

	const copyEnabled = Boolean(cellObj?.copyable ?? cellObj?.copyValue ?? colDef.copyable);
	const copyScalarFallback =
		rawVal !== null && rawVal !== undefined && rawVal !== '' && typeof rawVal !== 'object'
			? String(rawVal)
			: displayStr !== '—'
				? displayStr
				: '';
	const copyValue =
		typeof cellObj?.copyValue === 'string' && cellObj.copyValue !== ''
			? cellObj.copyValue
			: copyEnabled && displayStr !== '—'
				? copyScalarFallback
				: '';

	const isMono = Boolean(cellObj?.mono ?? (colDef.mono || colType === 'code'));
	const isTabular = Boolean(cellObj?.tabular ?? colDef.tabular);
	const isNowrap = Boolean(cellObj?.nowrap ?? colDef.nowrap);
	const truncateSpec = cellObj?.truncate ?? colDef.truncate;
	const {
		display: truncatedLabel,
		truncated: showFullTitleTooltip,
		cssTruncate,
	} = applyTextTruncate(displayStr, truncateSpec);

	const textModifierClasses = cn(
		isMono && 'font-mono text-xs',
		isTabular && 'tabular-nums',
		isNowrap && 'whitespace-nowrap',
		cssTruncate && 'inline-block max-w-96 truncate align-bottom'
	);

	const hasLeading = Boolean(thumb || (icon !== undefined && icon !== ''));
	const hasSubtitle = subtitle !== '';
	const hasComposition =
		hasLeading || hasSubtitle || badges.length > 0 || copyValue !== '' || resolvedHref !== '' || locked;

	if (colDef.editable && !hasLeading && !hasSubtitle && badges.length === 0 && copyValue === '' && !locked) {
		const editableRawScalar =
			rawVal !== null && typeof rawVal === 'object' ? displayStr : String(rawVal ?? '');
		return (
			<button
				type="button"
				onClick={() =>
					setEditingCell({
						id: recordId,
						field: colKey,
						value: editableRawScalar,
					})
				}
				className={cn(
					'group inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-muted text-left cursor-pointer',
					textModifierClasses
				)}
				title={t('viewport.clickToEditInline', 'Click to edit inline')}
			>
				<span>{truncatedLabel}</span>
				<DynamicIcon
					name="edit-3"
					className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-80 pointer-coarse:opacity-60"
				/>
			</button>
		);
	}

	if (!hasComposition) {
		return (
			<span title={showFullTitleTooltip ? displayStr : undefined} className={textModifierClasses}>
				{truncatedLabel}
			</span>
		);
	}

	const editableRawScalar =
		rawVal !== null && typeof rawVal === 'object' ? displayStr : String(rawVal ?? '');
	const primaryNode = colDef.editable ? (
		<button
			type="button"
			onClick={() =>
				setEditingCell({
					id: recordId,
					field: colKey,
					value: editableRawScalar,
				})
			}
			className={cn(
				'group inline-flex min-w-0 items-center gap-1.5 rounded px-1 -mx-1 hover:bg-muted text-left cursor-pointer',
				isPrimaryCol && 'font-medium text-foreground',
				textModifierClasses
			)}
			title={t('viewport.clickToEditInline', 'Click to edit inline')}
		>
			<span className="truncate">{truncatedLabel}</span>
			<DynamicIcon
				name="edit-3"
				className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-80 pointer-coarse:opacity-60"
			/>
		</button>
	) : resolvedHref && displayStr !== '—' ? (
		<ViewportLink
			href={resolvedHref}
			external={isExternal}
			target={isExternal ? '_blank' : undefined}
			rel={isExternal ? 'noopener noreferrer' : undefined}
			title={showFullTitleTooltip ? displayStr : undefined}
			className={cn(
				'inline-flex max-w-full min-w-0 items-center gap-1 hover:text-primary hover:underline',
				isPrimaryCol ? 'font-medium text-foreground' : 'text-primary',
				textModifierClasses
			)}
		>
			<span className={cn(cssTruncate ? 'truncate' : 'min-w-0 break-words')}>{truncatedLabel}</span>
			{isExternal ? <DynamicIcon name="external-link" className="size-3 shrink-0 opacity-70" /> : null}
		</ViewportLink>
	) : (
		<span
			title={showFullTitleTooltip ? displayStr : undefined}
			className={cn(isPrimaryCol && 'font-medium text-foreground', !cssTruncate && 'min-w-0 break-words', textModifierClasses)}
		>
			{truncatedLabel}
		</span>
	);

	const hideEmptyDashForBadges =
		!isPrimaryCol &&
		!resolvedHref &&
		cellObj?.label === '' &&
		(displayStr === '' || displayStr === '—') &&
		badges.length > 0;
	const showPrimaryRow = !(
		thumb &&
		(displayStr === '' || displayStr === '—') &&
		badges.length === 0 &&
		copyValue === ''
	);

	return (
		<div
			data-rw-cell-media={hasLeading ? '' : undefined}
			data-rw-cell-multiline={hasSubtitle ? 'true' : undefined}
			data-rw-cell-copyable={copyValue !== '' ? '' : undefined}
			className={cn(
				'flex min-w-0',
				hasSubtitle ? 'items-start' : 'items-center',
				justifyCls,
				hasLeading ? (thumb ? 'gap-3' : 'gap-2.5') : 'gap-1.5'
			)}
		>
			{hasLeading ? (
				<RecordLeadingVisual
					thumb={thumb}
					icon={icon}
					multiline={hasSubtitle}
					size={dense ? 'sm' : 'md'}
				/>
			) : null}
			{showPrimaryRow || hasSubtitle ? (
				<div
					className={cn(
						'min-w-0 flex-1',
						colDef.align === 'right' && 'text-right',
						colDef.align === 'center' && 'text-center'
					)}
				>
					{showPrimaryRow ? (
						<div className={cn('flex flex-wrap items-center gap-1.5 min-w-0', justifyCls)}>
							{hideEmptyDashForBadges ? null : primaryNode}
							{locked ? (
								<span title="Locked" className="inline-flex shrink-0 text-muted-foreground">
									<DynamicIcon name="lock" className="size-3.5" />
								</span>
							) : null}
							{badges.length > 0 ? (
								<BadgeGroup
									badges={badges}
									maxVisible={cellObj?.maxBadges ?? colDef.maxBadges ?? 3}
									compact
								/>
							) : null}
							{copyValue !== '' ? <CopyValueButton value={copyValue} subjectLabel={displayStr} /> : null}
						</div>
					) : null}
					{hasSubtitle ? (
						<div
							title={subtitle}
							className={cn(
								'mt-0.5 truncate text-xs font-normal text-muted-foreground',
								(cellObj?.subtitleMono ?? colDef.subtitleMono) && 'font-mono text-[11px]'
							)}
						>
							{subtitle}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
