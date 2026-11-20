import React, { useState } from 'react';
import {
	ColumnSpanSlider,
	clampColSpan,
	colSpanToPercent,
} from '../../ui';
import type { ReactInputfieldProps } from '../types';

export function RangeField(props: ReactInputfieldProps): React.ReactElement {
	const isDisabled = Boolean(props.disabled || props.readOnly);

	if (props.controlType === 'colspan') {
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
				{isPercentMode ? (
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
