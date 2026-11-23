import React, { useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Button, Input, Select } from '../../ui';
import { dispatchDomChange } from '../shared';
import type { ReactInputfieldProps } from '../types';

export interface UnitNumberValue {
	value: number | null;
	unit: string;
}

const DEFAULT_CSS_UNITS = ['px', 'rem', '%', 'em', 'vw', 'vh'];
const DEFAULT_CURRENCY_UNITS = ['EUR', 'USD', 'TRY', 'GBP'];

/**
 * Coerces a scalar number, unit string (`"24px"`, `"125.50 EUR"`), or `{ value, unit }` object into `UnitNumberValue`.
 */
export function normalizeUnitNumberValue(raw: unknown, defaultUnit = 'px'): UnitNumberValue {
	const cleanDefault = defaultUnit.trim() || 'px';
	if (raw === null || raw === undefined || raw === '') {
		return { value: null, unit: cleanDefault };
	}
	if (typeof raw === 'number') {
		return {
			value: Number.isFinite(raw) ? raw : null,
			unit: cleanDefault,
		};
	}
	if (typeof raw === 'object' && !Array.isArray(raw)) {
		const obj = raw as Record<string, unknown>;
		const rawNum = obj.value;
		let parsedNum: number | null = null;
		if (typeof rawNum === 'number' && Number.isFinite(rawNum)) {
			parsedNum = rawNum;
		} else if (typeof rawNum === 'string' && rawNum.trim() !== '') {
			const candidate = Number(rawNum.trim().replace(',', '.'));
			if (Number.isFinite(candidate)) {
				parsedNum = candidate;
			}
		}
		const objUnit = typeof obj.unit === 'string' && obj.unit.trim() !== '' ? obj.unit.trim() : cleanDefault;
		return { value: parsedNum, unit: objUnit };
	}
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '') {
			return { value: null, unit: cleanDefault };
		}
		if (trimmed.startsWith('{')) {
			try {
				return normalizeUnitNumberValue(JSON.parse(trimmed), cleanDefault);
			} catch {
				return { value: null, unit: cleanDefault };
			}
		}
		const match = trimmed.match(/^(-?\d+(?:[.,]\d+)?)\s*([A-Za-z%]+)?$/);
		if (match) {
			const parsed = Number((match[1] ?? '').replace(',', '.'));
			return {
				value: Number.isFinite(parsed) ? parsed : null,
				unit: match[2]?.trim() || cleanDefault,
			};
		}
	}
	return { value: null, unit: cleanDefault };
}

/**
 * Formats a finite numeric value using optional `locale` and fractional `precision`.
 */
export function formatDecimalNumber(
	val: number,
	options?: { locale?: string; precision?: number },
): string {
	if (!Number.isFinite(val)) {
		return '';
	}
	const precision = options?.precision;
	if (!options?.locale) {
		if (typeof precision === 'number' && precision >= 0 && precision <= 10) {
			return val.toFixed(precision);
		}
		return String(val);
	}
	try {
		return new Intl.NumberFormat(options.locale, {
			minimumFractionDigits: typeof precision === 'number' ? precision : undefined,
			maximumFractionDigits: typeof precision === 'number' ? precision : 6,
		}).format(val);
	} catch {
		return typeof precision === 'number' ? val.toFixed(precision) : String(val);
	}
}

export function UnitNumberField(props: ReactInputfieldProps): React.ReactElement {
	const isCurrencyMode = Boolean(props.currency) || props.unitVariant === 'currency';
	const resolvedUnits = useMemo(() => {
		if (Array.isArray(props.units) && props.units.length > 0) {
			return props.units.map((u) => u.trim()).filter((u) => u !== '');
		}
		return isCurrencyMode ? DEFAULT_CURRENCY_UNITS : DEFAULT_CSS_UNITS;
	}, [props.units, isCurrencyMode]);

	const defaultUnit =
		props.defaultUnit ||
		props.currency ||
		resolvedUnits[0] ||
		(isCurrencyMode ? 'EUR' : 'px');
	const incoming = normalizeUnitNumberValue(props.value, defaultUnit);
	const incomingSig = `${incoming.value ?? ''}\u0000${incoming.unit}`;
	const [prevSig, setPrevSig] = useState<string>(incomingSig);
	const [numVal, setNumVal] = useState<number | null>(incoming.value);
	const [unit, setUnit] = useState<string>(incoming.unit);
	const [focused, setFocused] = useState<boolean>(false);
	const [draft, setDraft] = useState<string>(() => (incoming.value !== null ? String(incoming.value) : ''));
	const inputRef = useRef<HTMLInputElement | null>(null);

	if (incomingSig !== prevSig) {
		setPrevSig(incomingSig);
		setNumVal(incoming.value);
		setUnit(incoming.unit);
		if (!focused) {
			setDraft(incoming.value !== null ? String(incoming.value) : '');
		}
	}

	const minNum =
		props.min !== undefined && props.min !== null && props.min !== '' && Number.isFinite(Number(props.min))
			? Number(props.min)
			: null;
	const maxNum =
		props.max !== undefined && props.max !== null && props.max !== '' && Number.isFinite(Number(props.max))
			? Number(props.max)
			: null;
	const stepNum =
		props.step !== undefined && props.step !== null && props.step !== '' && Number(props.step) > 0
			? Number(props.step)
			: 1;

	const locked = Boolean(props.readOnly || props.disabled);
	const hasError = Boolean(props.error && props.error.trim() !== '');
	const precision = props.precision;

	const clampValue = (candidate: number): number => {
		let next = candidate;
		if (minNum !== null) {
			next = Math.max(minNum, next);
		}
		if (maxNum !== null) {
			next = Math.min(maxNum, next);
		}
		if (typeof precision === 'number' && precision >= 0 && precision <= 10) {
			next = Number(next.toFixed(precision));
		} else {
			next = Math.round(next * 1e6) / 1e6;
		}
		return next;
	};

	const emitChange = (nextNum: number | null, nextUnit: string) => {
		setNumVal(nextNum);
		setUnit(nextUnit);
		const payload: UnitNumberValue | '' =
			nextNum !== null ? { value: nextNum, unit: nextUnit } : '';
		props.onValueChange?.(props.name, payload);
		if (typeof window !== 'undefined') {
			window.requestAnimationFrame(() => dispatchDomChange(inputRef.current));
		}
	};

	const stepBy = (direction: 1 | -1) => {
		if (locked) {
			return;
		}
		const base = numVal !== null ? numVal : (minNum ?? 0);
		const nextNum = clampValue(base + direction * stepNum);
		setDraft(String(nextNum));
		emitChange(nextNum, unit);
	};

	const serializedHidden = numVal !== null ? JSON.stringify({ value: numVal, unit }) : '';
	const displayText = focused
		? draft
		: numVal !== null
			? formatDecimalNumber(numVal, { locale: props.locale, precision })
			: '';

	const selectableUnits = useMemo(() => {
		if (unit && !resolvedUnits.includes(unit)) {
			return [unit, ...resolvedUnits];
		}
		return resolvedUnits;
	}, [resolvedUnits, unit]);

	return (
		<div className="flex items-center gap-1 min-w-0 max-w-full" data-rw-control="unit-number">
			{props.name && !props.inlinePortal ? (
				<input type="hidden" name={props.name} value={serializedHidden} />
			) : null}

			{!locked ? (
				<Button
					type="button"
					variant="outline"
					size="icon"
					disabled={minNum !== null && numVal !== null && numVal <= minNum}
					aria-label={t('number.decrement', 'Decrease value')}
					title={t('number.decrement', 'Decrease value')}
					data-rw-unit-step="down"
					className="size-9 shrink-0"
					onClick={() => stepBy(-1)}
				>
					<DynamicIcon name="minus" aria-hidden="true" className="size-3.5" />
				</Button>
			) : null}

			<div className="min-w-0 flex-1">
				<Input
					ref={inputRef}
					id={props.id}
					type="text"
					inputMode="decimal"
					value={displayText}
					placeholder={props.placeholder || '0'}
					readOnly={props.readOnly}
					disabled={props.disabled}
					required={props.required}
					aria-invalid={hasError || undefined}
					aria-describedby={props.describedBy}
					className={cn(
						'font-mono text-xs tabular-nums text-right min-w-0',
						hasError && 'border-destructive focus-visible:ring-destructive/40',
					)}
					onFocus={() => {
						setFocused(true);
						setDraft(numVal !== null ? String(numVal) : '');
					}}
					onChange={(e) => {
						const raw = e.target.value;
						setDraft(raw);
						const clean = raw.trim().replace(',', '.');
						if (clean === '') {
							emitChange(null, unit);
							return;
						}
						if (clean === '-' || clean.endsWith('.')) {
							return;
						}
						const parsed = Number(clean);
						if (Number.isFinite(parsed)) {
							emitChange(parsed, unit);
						}
					}}
					onBlur={() => {
						setFocused(false);
						const clean = draft.trim().replace(',', '.');
						if (clean === '' || clean === '-') {
							setDraft('');
							emitChange(null, unit);
							return;
						}
						const parsed = Number(clean);
						if (Number.isFinite(parsed)) {
							const clamped = clampValue(parsed);
							setDraft(String(clamped));
							emitChange(clamped, unit);
						} else {
							setDraft(numVal !== null ? String(numVal) : '');
						}
					}}
					onKeyDown={(e) => {
						if (e.key === 'ArrowUp') {
							e.preventDefault();
							stepBy(1);
						} else if (e.key === 'ArrowDown') {
							e.preventDefault();
							stepBy(-1);
						}
					}}
				/>
			</div>

			{!locked ? (
				<Button
					type="button"
					variant="outline"
					size="icon"
					disabled={maxNum !== null && numVal !== null && numVal >= maxNum}
					aria-label={t('number.increment', 'Increase value')}
					title={t('number.increment', 'Increase value')}
					data-rw-unit-step="up"
					className="size-9 shrink-0"
					onClick={() => stepBy(1)}
				>
					<DynamicIcon name="plus" aria-hidden="true" className="size-3.5" />
				</Button>
			) : null}

			{selectableUnits.length > 1 && !props.readOnly ? (
				<Select
					id={`${props.id}__unit`}
					aria-label={t('number.unit', 'Unit')}
					disabled={props.disabled}
					value={unit}
					onChange={(e) => emitChange(numVal, e.target.value)}
					className="w-auto min-w-[68px] max-w-[92px] shrink-0 font-mono text-xs"
				>
					{selectableUnits.map((u) => (
						<option key={u} value={u}>
							{u}
						</option>
					))}
				</Select>
			) : (
				<Badge variant="outline" mono className="h-9 px-2.5 shrink-0 font-mono text-xs">
					{unit}
				</Badge>
			)}
		</div>
	);
}

export const UnitNumberFieldControl = UnitNumberField;
