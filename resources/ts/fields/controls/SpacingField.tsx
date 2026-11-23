import React, { useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Input, Select } from '../../ui';
import type { ReactInputfieldProps } from '../types';

export type SpacingSide = 'top' | 'right' | 'bottom' | 'left';

export interface SpacingValue {
	top: string;
	right: string;
	bottom: string;
	left: string;
	unit: string;
	linked?: boolean;
}

const ALL_SIDES: SpacingSide[] = ['top', 'right', 'bottom', 'left'];
const DEFAULT_SPACING_UNITS = ['px', 'rem', 'em', '%'];
const KNOWN_UNITS_RE = /^(-?\d+(?:\.\d+)?)\s*(px|rem|em|%|vw|vh|pt|ch)?$/i;

function extractTokenValueAndUnit(token: string): { value: string; unit?: string } {
	const trimmed = token.trim();
	if (trimmed === '') {
		return { value: '' };
	}
	if (trimmed.toLowerCase() === 'auto') {
		return { value: 'auto' };
	}
	const match = KNOWN_UNITS_RE.exec(trimmed);
	if (match) {
		return {
			value: match[1] ?? '',
			unit: match[2] ? match[2].toLowerCase() : undefined,
		};
	}
	return { value: trimmed };
}

function areEqualSides(top: string, right: string, bottom: string, left: string): boolean {
	return top !== '' && top === right && right === bottom && bottom === left;
}

export function normalizeSpacingValue(raw: unknown, defaultUnit = 'px'): SpacingValue {
	const fallbackUnit = defaultUnit.trim() || 'px';
	const empty: SpacingValue = {
		top: '',
		right: '',
		bottom: '',
		left: '',
		unit: fallbackUnit,
		linked: false,
	};

	if (raw === null || raw === undefined || raw === '') {
		return empty;
	}

	if (typeof raw === 'number' && Number.isFinite(raw)) {
		const numStr = String(raw);
		return {
			top: numStr,
			right: numStr,
			bottom: numStr,
			left: numStr,
			unit: fallbackUnit,
			linked: true,
		};
	}

	let candidate: unknown = raw;
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '') {
			return empty;
		}
		if (trimmed.startsWith('{')) {
			try {
				candidate = JSON.parse(trimmed);
			} catch {
				candidate = trimmed;
			}
		}
		if (typeof candidate === 'string') {
			const parts = candidate.trim().split(/\s+/).filter(Boolean);
			if (parts.length === 0) {
				return empty;
			}
			const parsed = parts.slice(0, 4).map(extractTokenValueAndUnit);
			const detectedUnit = parsed.find((p) => p.unit)?.unit || fallbackUnit;
			const vals = parsed.map((p) => p.value);
			let top = '';
			let right = '';
			let bottom = '';
			let left = '';
			if (vals.length === 1) {
				top = vals[0] ?? '';
				right = top;
				bottom = top;
				left = top;
			} else if (vals.length === 2) {
				top = vals[0] ?? '';
				right = vals[1] ?? '';
				bottom = top;
				left = right;
			} else if (vals.length === 3) {
				top = vals[0] ?? '';
				right = vals[1] ?? '';
				bottom = vals[2] ?? '';
				left = right;
			} else {
				top = vals[0] ?? '';
				right = vals[1] ?? '';
				bottom = vals[2] ?? '';
				left = vals[3] ?? '';
			}
			return {
				top,
				right,
				bottom,
				left,
				unit: detectedUnit,
				linked: vals.length === 1 || areEqualSides(top, right, bottom, left),
			};
		}
	}

	if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
		const obj = candidate as Record<string, unknown>;
		const rawUnit = typeof obj.unit === 'string' && obj.unit.trim() !== '' ? obj.unit.trim() : fallbackUnit;
		const tParsed = extractTokenValueAndUnit(String(obj.top ?? ''));
		const rParsed = extractTokenValueAndUnit(String(obj.right ?? ''));
		const bParsed = extractTokenValueAndUnit(String(obj.bottom ?? ''));
		const lParsed = extractTokenValueAndUnit(String(obj.left ?? ''));
		const linked =
			typeof obj.linked === 'boolean'
				? obj.linked
				: areEqualSides(tParsed.value, rParsed.value, bParsed.value, lParsed.value);
		return {
			top: tParsed.value,
			right: rParsed.value,
			bottom: bParsed.value,
			left: lParsed.value,
			unit: rawUnit,
			linked,
		};
	}

	return empty;
}

export function formatSpacingCss(value: SpacingValue): string {
	const top = value.top.trim();
	const right = value.right.trim();
	const bottom = value.bottom.trim();
	const left = value.left.trim();
	if (top === '' && right === '' && bottom === '' && left === '') {
		return '';
	}
	const fmt = (raw: string): string => {
		if (raw === '') {
			return '0';
		}
		if (raw.toLowerCase() === 'auto') {
			return 'auto';
		}
		return `${raw}${value.unit || 'px'}`;
	};
	if (top === right && right === bottom && bottom === left) {
		return fmt(top);
	}
	if (top === bottom && right === left) {
		return `${fmt(top)} ${fmt(right)}`;
	}
	if (right === left) {
		return `${fmt(top)} ${fmt(right)} ${fmt(bottom)}`;
	}
	return `${fmt(top)} ${fmt(right)} ${fmt(bottom)} ${fmt(left)}`;
}

function sanitizeSideDraft(raw: string, allowAuto: boolean, allowNegative: boolean): string {
	const trimmed = raw.trim();
	if (trimmed === '') {
		return '';
	}
	if (allowAuto && 'auto'.startsWith(trimmed.toLowerCase())) {
		return trimmed.toLowerCase();
	}
	let cleaned = trimmed.replace(allowNegative ? /[^0-9.-]/g : /[^0-9.]/g, '');
	if (allowNegative && cleaned.indexOf('-', 1) !== -1) {
		const neg = cleaned.startsWith('-');
		cleaned = (neg ? '-' : '') + cleaned.replace(/-/g, '');
	}
	const dotIdx = cleaned.indexOf('.');
	if (dotIdx !== -1) {
		cleaned = cleaned.slice(0, dotIdx + 1) + cleaned.slice(dotIdx + 1).replace(/\./g, '');
	}
	return cleaned;
}

export function SpacingField(props: ReactInputfieldProps): React.ReactElement {
	const units = useMemo(() => {
		const list = Array.isArray(props.units) && props.units.length > 0 ? props.units : DEFAULT_SPACING_UNITS;
		return Array.from(new Set(list.map((u) => String(u).trim()).filter(Boolean)));
	}, [props.units]);
	const defaultUnit = props.defaultUnit?.trim() || units[0] || 'px';
	const unitOptions = useMemo(() => {
		const set = new Set(units);
		set.add(defaultUnit);
		return Array.from(set);
	}, [units, defaultUnit]);

	const activeSides = useMemo<SpacingSide[]>(() => {
		if (!Array.isArray(props.sides) || props.sides.length === 0) {
			return ALL_SIDES;
		}
		const valid = props.sides.filter((s): s is SpacingSide => ALL_SIDES.includes(s));
		return valid.length > 0 ? valid : ALL_SIDES;
	}, [props.sides]);

	const incoming = useMemo(() => normalizeSpacingValue(props.value, defaultUnit), [props.value, defaultUnit]);
	const sig = `${incoming.top}|${incoming.right}|${incoming.bottom}|${incoming.left}|${incoming.unit}|${incoming.linked ? 1 : 0}`;
	const [prevSig, setPrevSig] = useState<string>(sig);
	const [spacing, setSpacing] = useState<SpacingValue>(incoming);

	if (sig !== prevSig) {
		setPrevSig(sig);
		setSpacing(incoming);
	}

	const hasError = Boolean(props.error && props.error.trim() !== '');
	const locked = Boolean(props.readOnly || props.disabled);
	const allowAuto = Boolean(props.allowAuto);
	const allowNegative = Boolean(props.allowNegative);
	const clearable = props.clearable !== false;

	const commit = (next: SpacingValue) => {
		setSpacing(next);
		props.onValueChange?.(props.name, next);
	};

	const handleSideChange = (side: SpacingSide, rawInput: string) => {
		if (locked) {
			return;
		}
		const cleaned = sanitizeSideDraft(rawInput, allowAuto, allowNegative);
		if (spacing.linked) {
			const next: SpacingValue = { ...spacing };
			for (const targetSide of activeSides) {
				next[targetSide] = cleaned;
			}
			commit(next);
			return;
		}
		commit({
			...spacing,
			[side]: cleaned,
		});
	};

	const handleToggleLink = () => {
		if (locked) {
			return;
		}
		const nextLinked = !spacing.linked;
		if (nextLinked) {
			const anchor =
				activeSides.map((s) => spacing[s]).find((v) => v !== '') ?? '';
			const next: SpacingValue = { ...spacing, linked: true };
			for (const targetSide of activeSides) {
				next[targetSide] = anchor;
			}
			commit(next);
			return;
		}
		commit({ ...spacing, linked: false });
	};

	const sideLabels: Record<SpacingSide, string> = {
		top: t('spacing.top', 'Top'),
		right: t('spacing.right', 'Right'),
		bottom: t('spacing.bottom', 'Bottom'),
		left: t('spacing.left', 'Left'),
	};

	const hasAnyValue = activeSides.some((s) => spacing[s].trim() !== '');
	const cssSummary = formatSpacingCss(spacing);

	return (
		<div className="min-w-0 max-w-full space-y-2" data-rw-control="spacing">
			{props.name && !props.inlinePortal ? (
				<input type="hidden" name={props.name} value={hasAnyValue ? JSON.stringify(spacing) : ''} />
			) : null}

			<div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
				<div className="flex flex-wrap items-center gap-1.5 min-w-0">
					<button
						type="button"
						data-rw-spacing-link=""
						disabled={locked}
						aria-pressed={Boolean(spacing.linked)}
						aria-label={spacing.linked ? t('spacing.unlinkSides', 'Unlink all sides') : t('spacing.linkSides', 'Link all sides')}
						onClick={handleToggleLink}
						className={cn(
							'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors',
							spacing.linked
								? 'border-primary/40 bg-primary/10 text-primary'
								: 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
							locked && 'pointer-events-none opacity-60',
							!locked && 'cursor-pointer',
						)}
					>
						<DynamicIcon name={spacing.linked ? 'lock' : 'lock-open'} aria-hidden="true" className="size-3" />
						<span>{spacing.linked ? t('spacing.linked', 'Linked') : t('spacing.unlinked', 'Individual')}</span>
					</button>

					{cssSummary ? (
						<span
							data-rw-spacing-preview=""
							className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground truncate max-w-full"
						>
							{cssSummary}
						</span>
					) : null}
				</div>

				<div className="flex items-center gap-1.5 shrink-0">
					{unitOptions.length > 1 && !props.readOnly ? (
						<Select
							data-rw-spacing-unit=""
							aria-label={t('unitNumber.unit', 'Unit')}
							disabled={props.disabled}
							value={spacing.unit}
							onChange={(e) => commit({ ...spacing, unit: e.target.value })}
							className="h-7 w-16 px-1.5 text-xs font-mono"
						>
							{unitOptions.map((u) => (
								<option key={u} value={u}>
									{u}
								</option>
							))}
						</Select>
					) : (
						<Badge variant="outline" className="h-7 px-2 font-mono text-[11px]">
							{spacing.unit}
						</Badge>
					)}

					{clearable && hasAnyValue && !locked ? (
						<button
							type="button"
							aria-label={t('common.clear', 'Clear')}
							onClick={() =>
								commit({
									top: '',
									right: '',
									bottom: '',
									left: '',
									unit: spacing.unit,
									linked: spacing.linked,
								})
							}
							className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
						>
							<DynamicIcon name="x" aria-hidden="true" className="size-3.5" />
						</button>
					) : null}
				</div>
			</div>

			<div
				className={cn(
					'grid gap-2 min-w-0',
					activeSides.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4',
				)}
			>
				{activeSides.map((side, idx) => {
					const inputId = props.id ? `${props.id}_${side}` : undefined;
					return (
						<div key={side} className="min-w-0 space-y-1">
							<label
								htmlFor={inputId}
								className="block text-[11px] font-medium text-muted-foreground"
							>
								{sideLabels[side]}
							</label>
							<Input
								id={idx === 0 ? props.id : inputId}
								type="text"
								data-rw-spacing-side={side}
								inputMode={allowAuto ? 'text' : 'decimal'}
								value={spacing[side]}
								placeholder={allowAuto ? '0 / auto' : '0'}
								readOnly={props.readOnly}
								disabled={props.disabled}
								aria-invalid={hasError}
								aria-describedby={props.describedBy}
								onChange={(e) => handleSideChange(side, e.target.value)}
								className={cn(
									'h-8 px-2.5 text-xs font-mono tabular-nums',
									props.readOnly && 'bg-muted/40 text-muted-foreground',
									hasError && 'border-destructive',
								)}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export const SpacingFieldControl = SpacingField;
