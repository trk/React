import React, { useState } from 'react';
import { t } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import {
	ColumnSpanSlider,
	clampColSpan,
	colSpanToPercent,
} from '../../ui';
import type { ReactInputfieldProps } from '../types';

export interface DualRangeValue {
	min: number;
	max: number;
}

function clampFinite(value: number, minBound: number, maxBound: number): number {
	return Math.max(minBound, Math.min(maxBound, value));
}

export function normalizeDualRangeValue(
	raw: unknown,
	minBound = 0,
	maxBound = 100,
	_step = 1,
	minDistance = 0,
): DualRangeValue {
	const lo = Math.min(minBound, maxBound);
	const hi = Math.max(minBound, maxBound);
	const safeDist = Math.max(0, Math.min(hi - lo, minDistance));

	let candidateLow: number | null = null;
	let candidateHigh: number | null = null;
	let parsed: unknown = raw;

	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
			try {
				parsed = JSON.parse(trimmed);
			} catch {
				parsed = trimmed;
			}
		}
		if (typeof parsed === 'string' && trimmed !== '') {
			const match =
				/^(-?\d+(?:\.\d+)?)\s*(?:\.\.|–|—|,)\s*(-?\d+(?:\.\d+)?)$/.exec(trimmed) ??
				/^(-?\d+(?:\.\d+)?)\s+-\s+(-?\d+(?:\.\d+)?)$/.exec(trimmed) ??
				/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(trimmed);
			if (match) {
				candidateLow = Number(match[1]);
				candidateHigh = Number(match[2]);
			} else {
				const single = Number(trimmed);
				if (Number.isFinite(single)) {
					candidateLow = single;
					candidateHigh = hi;
				}
			}
		}
	}

	if (candidateLow === null && typeof parsed === 'number' && Number.isFinite(parsed)) {
		candidateLow = parsed;
		candidateHigh = hi;
	} else if (candidateLow === null && Array.isArray(parsed)) {
		const first = Number(parsed[0]);
		const second = Number(parsed[1]);
		if (Number.isFinite(first)) candidateLow = first;
		if (Number.isFinite(second)) candidateHigh = second;
	} else if (candidateLow === null && parsed && typeof parsed === 'object') {
		const obj = parsed as Record<string, unknown>;
		const rawMin = obj.min ?? obj.from ?? obj.low;
		const rawMax = obj.max ?? obj.to ?? obj.high;
		const first = rawMin !== undefined && rawMin !== null && rawMin !== '' ? Number(rawMin) : NaN;
		const second = rawMax !== undefined && rawMax !== null && rawMax !== '' ? Number(rawMax) : NaN;
		if (Number.isFinite(first)) candidateLow = first;
		if (Number.isFinite(second)) candidateHigh = second;
	}

	let low = candidateLow !== null && Number.isFinite(candidateLow) ? clampFinite(candidateLow, lo, hi) : lo;
	let high = candidateHigh !== null && Number.isFinite(candidateHigh) ? clampFinite(candidateHigh, lo, hi) : hi;

	if (low > high) {
		[low, high] = [high, low];
	}
	if (high - low < safeDist) {
		if (low + safeDist <= hi) {
			high = low + safeDist;
		} else {
			high = hi;
			low = Math.max(lo, hi - safeDist);
		}
	}

	return { min: low, max: high };
}

interface DualRangeSliderProps {
	props: ReactInputfieldProps;
	minNum: number;
	maxNum: number;
	stepNum: number;
	isDisabled: boolean;
}

function DualRangeSlider({
	props,
	minNum,
	maxNum,
	stepNum,
	isDisabled,
}: DualRangeSliderProps): React.ReactElement {
	const minDistance = Math.max(
		0,
		typeof props.minDistance === 'number' && Number.isFinite(props.minDistance)
			? props.minDistance
			: stepNum,
	);
	const incoming = normalizeDualRangeValue(props.value, minNum, maxNum, stepNum, minDistance);
	const propSig = `${incoming.min}|${incoming.max}|${minNum}|${maxNum}|${minDistance}`;
	const [prevSig, setPrevSig] = useState<string>(propSig);
	const [pair, setPair] = useState<DualRangeValue>(incoming);

	if (propSig !== prevSig) {
		setPrevSig(propSig);
		setPair(incoming);
	}

	const hasError = Boolean(props.error && props.error.trim() !== '');
	const prefix = props.affixPrefix || '';
	const suffix = props.affixSuffix || '';
	const span = Math.max(0.0001, maxNum - minNum);
	const leftPct = Math.max(0, Math.min(100, ((pair.min - minNum) / span) * 100));
	const rightPct = Math.max(leftPct, Math.min(100, ((pair.max - minNum) / span) * 100));
	const formattedPair = `${prefix}${pair.min}${suffix} – ${prefix}${pair.max}${suffix}`;
	const fieldLabel = props.label || t('range.range', 'Range');

	const commitPair = (nextMin: number, nextMax: number) => {
		const next: DualRangeValue = { min: nextMin, max: nextMax };
		setPair(next);
		props.onValueChange?.(props.name, next);
	};

	const handleMinChange = (rawNext: number) => {
		if (isDisabled || !Number.isFinite(rawNext)) {
			return;
		}
		const maxAllowed = Math.max(minNum, pair.max - minDistance);
		const clampedMin = Math.max(minNum, Math.min(maxAllowed, rawNext));
		commitPair(clampedMin, pair.max);
	};

	const handleMaxChange = (rawNext: number) => {
		if (isDisabled || !Number.isFinite(rawNext)) {
			return;
		}
		const minAllowed = Math.min(maxNum, pair.min + minDistance);
		const clampedMax = Math.min(maxNum, Math.max(minAllowed, rawNext));
		commitPair(pair.min, clampedMax);
	};

	return (
		<div className="flex flex-col gap-1.5 min-w-0 max-w-full" data-rw-control="range_slider">
			{props.name && !props.inlinePortal ? (
				<input type="hidden" name={props.name} value={JSON.stringify(pair)} />
			) : null}

			<div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
				<span>
					{prefix}
					{minNum}
					{suffix}
				</span>
				<output
					htmlFor={props.id}
					className={cn(
						'inline-flex items-center rounded border border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground',
						hasError && 'border-destructive text-destructive',
					)}
					data-rw-range-output=""
				>
					{formattedPair}
				</output>
				<span>
					{prefix}
					{maxNum}
					{suffix}
				</span>
			</div>

			<div className="relative flex h-7 w-full items-center min-w-0">
				<div
					aria-hidden="true"
					className="h-1.5 w-full rounded-full"
					style={{ backgroundColor: 'color-mix(in srgb, var(--border) 88%, var(--foreground) 12%)' }}
				/>
				<div
					aria-hidden="true"
					data-rw-dual-range-bar=""
					className={cn('pointer-events-none absolute h-1.5 rounded-full', hasError ? 'bg-destructive' : 'bg-primary')}
					style={{
						left: `${leftPct}%`,
						width: `${Math.max(0, rightPct - leftPct)}%`,
					}}
				/>
				<input
					id={props.id}
					type="range"
					data-rw-dual-slider="min"
					min={minNum}
					max={maxNum}
					step={stepNum}
					value={pair.min}
					disabled={isDisabled}
					aria-label={t('range.minimumLabel', { label: fieldLabel }, `Minimum ${fieldLabel}`)}
					aria-valuetext={`${prefix}${pair.min}${suffix}`}
					aria-invalid={hasError}
					aria-describedby={props.describedBy}
					style={{ zIndex: pair.min >= maxNum - minDistance - stepNum ? 4 : 3 }}
					onChange={(e) => {
						const rawNum = Number.isFinite(e.target.valueAsNumber)
							? e.target.valueAsNumber
							: Number(e.target.value);
						handleMinChange(rawNum);
					}}
				/>
				<input
					id={props.id ? `${props.id}_max` : undefined}
					type="range"
					data-rw-dual-slider="max"
					min={minNum}
					max={maxNum}
					step={stepNum}
					value={pair.max}
					disabled={isDisabled}
					aria-label={t('range.maximumLabel', { label: fieldLabel }, `Maximum ${fieldLabel}`)}
					aria-valuetext={`${prefix}${pair.max}${suffix}`}
					aria-invalid={hasError}
					aria-describedby={props.describedBy}
					style={{ zIndex: 3 }}
					onChange={(e) => {
						const rawNum = Number.isFinite(e.target.valueAsNumber)
							? e.target.valueAsNumber
							: Number(e.target.value);
						handleMaxChange(rawNum);
					}}
				/>
			</div>
		</div>
	);
}

function ColSpanRangeSlider({
	props,
	isDisabled,
}: {
	props: ReactInputfieldProps;
	isDisabled: boolean;
}): React.ReactElement {
	const isPercentMode = props.valueMode === 'percent';
	const strictPercentToSpan = (raw: unknown, fallback: number): number => {
		const parsed = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
		if (!Number.isFinite(parsed) || parsed <= 0) {
			return fallback;
		}
		const clampedPct = Math.max(8, Math.min(100, parsed));
		return Math.max(1, Math.min(12, Math.round((clampedPct / 100) * 12)));
	};
	const minCols =
		props.min !== undefined && props.min !== null && props.min !== ''
			? isPercentMode
				? strictPercentToSpan(props.min, 1)
				: clampColSpan(props.min, 1)
			: 1;
	const maxCols =
		props.max !== undefined && props.max !== null && props.max !== ''
			? isPercentMode
				? strictPercentToSpan(props.max, 12)
				: clampColSpan(props.max, 12)
			: 12;

	const resolveSpan = (raw: unknown): number =>
		isPercentMode
			? clampColSpan(strictPercentToSpan(raw, maxCols), maxCols, minCols, maxCols)
			: clampColSpan(raw, maxCols, minCols, maxCols);

	const incomingSpan = resolveSpan(props.value);
	const [prevPropSpan, setPrevPropSpan] = useState<number>(incomingSpan);
	const [span, setSpan] = useState<number>(incomingSpan);

	if (incomingSpan !== prevPropSpan) {
		setPrevPropSpan(incomingSpan);
		if (span !== incomingSpan) {
			setSpan(incomingSpan);
		}
	}

	const handleSpanChange = (nextSpan: number) => {
		if (isDisabled) {
			return;
		}
		setSpan(nextSpan);
		const nextOut = isPercentMode ? colSpanToPercent(nextSpan) : nextSpan;
		props.onValueChange?.(props.name, nextOut);
	};

	return (
		<div data-rw-control="colspan" data-rw-value-mode={isPercentMode ? 'percent' : 'columns'}>
			{isPercentMode && !props.inlinePortal ? (
				<input type="hidden" name={props.name} value={String(colSpanToPercent(span))} />
			) : null}
			<ColumnSpanSlider
				id={props.id}
				name={isPercentMode ? undefined : props.name}
				value={span}
				min={minCols}
				max={maxCols}
				disabled={isDisabled}
				ariaLabel={props.label || 'Column span (out of 12 columns)'}
				showPresets
				showTrackPreview
				onChange={handleSpanChange}
			/>
		</div>
	);
}

function SingleRangeSlider({
	props,
	minNum,
	maxNum,
	stepNum,
	isDisabled,
}: {
	props: ReactInputfieldProps;
	minNum: number;
	maxNum: number;
	stepNum: number;
	isDisabled: boolean;
}): React.ReactElement {
	const clampRange = (raw: unknown): number => {
		const parsed = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
		if (!Number.isFinite(parsed)) {
			return minNum;
		}
		return Math.max(minNum, Math.min(maxNum, parsed));
	};

	const incomingNumVal = clampRange(props.value);
	const [prevPropNumVal, setPrevPropNumVal] = useState<number>(incomingNumVal);
	const [numVal, setNumVal] = useState<number>(incomingNumVal);

	if (incomingNumVal !== prevPropNumVal) {
		setPrevPropNumVal(incomingNumVal);
		if (numVal !== incomingNumVal) {
			setNumVal(incomingNumVal);
		}
	}

	const formattedVal = `${props.affixPrefix || ''}${numVal}${props.affixSuffix || ''}`;
	const sliderVars = {
		'--attr-min': minNum,
		'--attr-max': maxNum,
		'--control-value': numVal,
	} as React.CSSProperties;

	return (
		<div className="flex flex-col gap-1.5" data-rw-control="range">
			<div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
				<span>
					{props.affixPrefix || ''}
					{minNum}
					{props.affixSuffix || ''}
				</span>
				<output
					htmlFor={props.id}
					className="inline-flex items-center rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground"
					data-rw-range-output=""
				>
					{formattedVal}
				</output>
				<span>
					{props.affixPrefix || ''}
					{maxNum}
					{props.affixSuffix || ''}
				</span>
			</div>
			<input
				id={props.id}
				name={props.name}
				type="range"
				data-rw-slider=""
				min={minNum}
				max={maxNum}
				step={stepNum}
				value={numVal}
				disabled={isDisabled}
				aria-valuetext={formattedVal}
				style={sliderVars}
				onChange={(e) => {
					if (isDisabled) {
						return;
					}
					const next = clampRange(e.target.valueAsNumber ?? e.target.value);
					setNumVal(next);
					props.onValueChange?.(props.name, next);
				}}
			/>
		</div>
	);
}

export function RangeField(props: ReactInputfieldProps): React.ReactElement {
	const isDisabled = Boolean(props.disabled || props.readOnly);

	if (props.controlType === 'colspan') {
		return <ColSpanRangeSlider props={props} isDisabled={isDisabled} />;
	}

	const minNum =
		props.min !== undefined && props.min !== null && props.min !== '' && Number.isFinite(Number(props.min))
			? Number(props.min)
			: 0;
	const maxNum =
		props.max !== undefined && props.max !== null && props.max !== '' && Number.isFinite(Number(props.max))
			? Number(props.max)
			: 100;
	const stepNum =
		props.step !== undefined &&
		props.step !== null &&
		props.step !== '' &&
		props.step !== 'any' &&
		Number.isFinite(Number(props.step)) &&
		Number(props.step) > 0
			? Number(props.step)
			: 1;

	const isDualMode =
		props.controlType === 'range_slider' ||
		props.rangeMode === 'dual' ||
		props.dual === true ||
		Array.isArray(props.value) ||
		(typeof props.value === 'object' && props.value !== null && ('min' in props.value || 'max' in props.value));

	if (isDualMode) {
		return (
			<DualRangeSlider
				props={props}
				minNum={minNum}
				maxNum={maxNum}
				stepNum={stepNum}
				isDisabled={isDisabled}
			/>
		);
	}

	return (
		<SingleRangeSlider
			props={props}
			minNum={minNum}
			maxNum={maxNum}
			stepNum={stepNum}
			isDisabled={isDisabled}
		/>
	);
}
