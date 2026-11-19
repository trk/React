import React, { useId } from 'react';
import { t } from '../lib/i18n';
import { cn, DynamicIcon } from '../lib/utils';

const COL_SPAN_PERCENTAGES: Record<number, number> = {
	1: 8,
	2: 17,
	3: 25,
	4: 33,
	5: 42,
	6: 50,
	7: 58,
	8: 67,
	9: 75,
	10: 83,
	11: 92,
	12: 100,
};

const COL_SPAN_HINTS: Record<number, string> = {
	1: '1/12',
	2: '1/6',
	3: '1/4',
	4: '1/3',
	5: '5/12',
	6: 'Half',
	7: '7/12',
	8: '2/3',
	9: '3/4',
	10: '5/6',
	11: '11/12',
	12: 'Full',
};

export function clampColSpan(value: unknown, fallback = 12, min = 1, max = 12): number {
	const lo = Math.max(1, Math.min(12, Math.round(min)));
	const hi = Math.max(lo, Math.min(12, Math.round(max)));
	if (value === 'sm') return Math.max(lo, Math.min(hi, 4));
	if (value === 'md') return Math.max(lo, Math.min(hi, 6));
	if (value === 'lg') return Math.max(lo, Math.min(hi, 8));
	if (value === 'full') return Math.max(lo, Math.min(hi, 12));
	const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return Math.max(lo, Math.min(hi, fallback));
	}
	return Math.max(lo, Math.min(hi, Math.round(parsed)));
}

export function colSpanToPercent(span: number): number {
	const clean = clampColSpan(span, 12);
	return COL_SPAN_PERCENTAGES[clean] ?? Math.round((clean / 12) * 100);
}

export function percentToColSpan(width: unknown, fallback = 12): number {
	const parsed = typeof width === 'number' ? width : Number(String(width ?? '').trim());
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return clampColSpan(fallback, 12);
	}
	if (parsed <= 12 && Number.isInteger(parsed)) {
		return clampColSpan(parsed, fallback);
	}
	const clamped = Math.max(8, Math.min(100, parsed));
	return clampColSpan(Math.round((clamped / 100) * 12), fallback);
}

export function formatColSpanHint(span: number): string {
	const clean = clampColSpan(span, 12);
	return COL_SPAN_HINTS[clean] || `${colSpanToPercent(clean)}%`;
}

export interface ColumnSpanSliderProps {
	value: number;
	onChange: (nextSpan: number) => void;
	min?: number;
	max?: number;
	id?: string;
	name?: string;
	label?: string;
	ariaLabel?: string;
	disabled?: boolean;
	compact?: boolean;
	showPresets?: boolean;
	showTrackPreview?: boolean;
	presets?: number[];
	className?: string;
}

const DEFAULT_PRESETS = [3, 4, 6, 8, 12];

export function ColumnSpanSlider({
	value,
	onChange,
	min = 1,
	max = 12,
	id,
	name,
	label,
	ariaLabel,
	disabled = false,
	compact = false,
	showPresets = false,
	showTrackPreview = true,
	presets = DEFAULT_PRESETS,
	className,
}: ColumnSpanSliderProps): React.ReactElement {
	const autoId = useId();
	const inputId = id || `rw-colspan-${autoId}`;
	const lo = Math.max(1, Math.min(12, Math.round(min)));
	const hi = Math.max(lo, Math.min(12, Math.round(max)));
	const span = clampColSpan(value, hi, lo, hi);
	const pct = colSpanToPercent(span);
	const hint = formatColSpanHint(span);
	const valueText = `${span} of 12 columns (${pct}%, ${hint})`;
	const visiblePresets = showPresets ? presets.filter((p) => p >= lo && p <= hi) : [];

	const sliderVars = {
		'--attr-min': lo,
		'--attr-max': hi,
		'--control-value': span,
	} as React.CSSProperties;

	return (
		<div
			className={cn(
				'flex flex-col',
				compact ? 'gap-1' : 'gap-1.5',
				className
			)}
			data-rw-colspan-slider=""
			data-rw-colspan-value={span}
		>
			<div className="flex items-center justify-between gap-2">
				{label ? (
					<label
						htmlFor={inputId}
						className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground select-none"
					>
						<DynamicIcon name="columns" className="size-3 shrink-0" />
						<span>{label}</span>
					</label>
				) : (
					<span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground select-none">
						<DynamicIcon name="columns" className="size-3 shrink-0" />
						<span>{hint}</span>
					</span>
				)}

				<output
					htmlFor={inputId}
					className="inline-flex items-center gap-1 rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground"
					data-rw-colspan-output=""
				>
					<span>{span}/12</span>
					{label ? <span className="text-muted-foreground font-sans font-normal">· {hint}</span> : null}
				</output>
			</div>

			<input
				id={inputId}
				name={name}
				type="range"
				data-rw-slider=""
				min={lo}
				max={hi}
				step={1}
				value={span}
				disabled={disabled}
				aria-label={!label ? (ariaLabel || 'Column span (out of 12 columns)') : undefined}
				aria-valuetext={valueText}
				style={sliderVars}
				onChange={(e) => {
					const next = clampColSpan(e.target.valueAsNumber || Number(e.target.value), span, lo, hi);
					if (next !== span) {
						onChange(next);
					}
				}}
			/>

			{showTrackPreview ? (
				<div
					className="grid grid-cols-12 gap-0.5"
					aria-hidden="true"
					data-rw-colspan-preview=""
				>
					{Array.from({ length: 12 }, (_, idx) => {
						const col = idx + 1;
						const isFilled = col <= span;
						const isOutOfBounds = col < lo || col > hi;
						return (
							<span
								key={col}
								className={cn(
									'h-1 rounded-[1px] transition-colors',
									isFilled ? 'bg-primary/80' : 'bg-border/70',
									isOutOfBounds && !isFilled && 'opacity-35'
								)}
							/>
						);
					})}
				</div>
			) : null}

			{visiblePresets.length > 0 ? (
				<div className="flex flex-wrap items-center gap-1 pt-0.5" role="group" aria-label={t('form.quickColumnPresets', 'Quick column presets')}>
					{visiblePresets.map((preset) => {
						const active = preset === span;
						return (
							<button
								key={preset}
								type="button"
								disabled={disabled}
								onClick={() => onChange(preset)}
								data-rw-colspan-preset={preset}
								aria-pressed={active}
								className={cn(
									'rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
									active
										? 'border-primary/40 bg-primary/12 text-primary-ink'
										: 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
								)}
							>
								{preset}/12
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
