import React, { useEffect, useState } from 'react';
import { t } from '../../lib/i18n';
import { DynamicIcon } from '../../lib/utils';
import { Button } from '../../ui';
import type { ReactInputfieldProps } from '../types';

export interface DateRangeFieldValue {
	from: string;
	to: string;
}

export function normalizeDateRangeFieldValue(raw: unknown): DateRangeFieldValue {
	if (!raw) {
		return { from: '', to: '' };
	}
	if (typeof raw === 'object' && !Array.isArray(raw)) {
		const obj = raw as Record<string, unknown>;
		return {
			from: typeof obj.from === 'string' ? obj.from.trim() : '',
			to: typeof obj.to === 'string' ? obj.to.trim() : '',
		};
	}
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '') {
			return { from: '', to: '' };
		}
		if (trimmed.startsWith('{')) {
			try {
				return normalizeDateRangeFieldValue(JSON.parse(trimmed));
			} catch {
				return { from: '', to: '' };
			}
		}
		const parts = trimmed.split(/\s*(?:\.\.|\/|–)\s*/);
		if (parts.length === 2) {
			return { from: (parts[0] ?? '').trim(), to: (parts[1] ?? '').trim() };
		}
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
			return { from: trimmed, to: '' };
		}
	}
	return { from: '', to: '' };
}

export function DateRangeField(props: ReactInputfieldProps): React.ReactElement {
	const dt = props.datetime;
	const incoming = normalizeDateRangeFieldValue(props.value);
	const incomingSig = `${incoming.from}\u0000${incoming.to}`;
	const [prevSig, setPrevSig] = useState<string>(incomingSig);
	const [range, setRange] = useState<DateRangeFieldValue>(incoming);

	if (incomingSig !== prevSig) {
		setPrevSig(incomingSig);
		if (range.from !== incoming.from || range.to !== incoming.to) {
			setRange(incoming);
		}
	}

	useEffect(() => {
		if (typeof window !== 'undefined' && !window.ReactWorkspaceRuntime?.Calendar?.isLoaded()) {
			void window.ReactWorkspaceRuntime?.ensureCalendarLoaded?.();
		}
	}, []);

	const minDate =
		dt?.dateMin ??
		(typeof props.min === 'string' && /^\d{4}-\d{2}-\d{2}/.test(props.min) ? props.min : undefined);
	const maxDate =
		dt?.dateMax ??
		(typeof props.max === 'string' && /^\d{4}-\d{2}-\d{2}/.test(props.max) ? props.max : undefined);
	const presets = dt?.presets ?? props.presets ?? true;
	const numberOfMonths = dt?.numberOfMonths ?? props.numberOfMonths ?? 2;
	const displayFormat = dt?.displayFormat ?? props.displayFormat ?? 'PP';
	const weekStartsOn = dt?.weekStartsOn ?? props.weekStartsOn;
	const hasError = Boolean(props.error && props.error.trim() !== '');
	const serialized = range.from || range.to ? JSON.stringify(range) : '';

	const LazyDateRangePicker =
		typeof window !== 'undefined' ? window.ReactWorkspaceRuntime?.Calendar?.DateRangePicker : undefined;

	return (
		<div className="min-w-0 max-w-full" data-rw-control="daterange">
			{props.name && !props.inlinePortal ? (
				<input type="hidden" name={props.name} value={serialized} />
			) : null}
			{LazyDateRangePicker ? (
				<LazyDateRangePicker
					id={props.id}
					value={range.from || range.to ? range : null}
					minDate={minDate}
					maxDate={maxDate}
					presets={presets}
					numberOfMonths={numberOfMonths}
					displayFormat={displayFormat}
					weekStartsOn={weekStartsOn}
					placeholder={props.placeholder}
					disabled={props.disabled}
					readOnly={props.readOnly}
					clearable={!props.readOnly && !props.disabled}
					error={hasError}
					inlinePortal={true}
					className="w-full"
					triggerClassName="w-full"
					onChange={(isoRange) => {
						const nextVal: DateRangeFieldValue = {
							from: isoRange.from,
							to: isoRange.to,
						};
						setRange(nextVal);
						props.onValueChange?.(props.name, nextVal.from || nextVal.to ? nextVal : '');
					}}
				/>
			) : (
				<Button
					id={props.id}
					type="button"
					variant="outline"
					size="sm"
					disabled={props.disabled}
					aria-readonly={props.readOnly || undefined}
					aria-invalid={hasError || undefined}
					className="w-full justify-start gap-2 font-normal text-muted-foreground min-w-0"
				>
					<DynamicIcon name="calendar" aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
					<span className="truncate">
						{range.from && range.to
							? `${range.from} – ${range.to}`
							: range.from || props.placeholder || t('calendar.selectDateRange', 'Select date range')}
					</span>
				</Button>
			)}
		</div>
	);
}
