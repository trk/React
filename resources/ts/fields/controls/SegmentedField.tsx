import React, { useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import type { InputfieldOptionItem, ReactInputfieldProps } from '../types';

function coerceSegmentedMulti(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw.map((item) => String(item ?? '').trim()).filter((v) => v !== '');
	}
	if (typeof raw === 'string' && raw.trim() !== '') {
		const trimmed = raw.trim();
		if (trimmed.startsWith('[')) {
			try {
				const parsed = JSON.parse(trimmed) as unknown;
				if (Array.isArray(parsed)) {
					return parsed.map((item) => String(item ?? '').trim()).filter((v) => v !== '');
				}
			} catch {
				return [trimmed];
			}
		}
		return [trimmed];
	}
	return [];
}

function flattenSegmentedOptions(options: InputfieldOptionItem[] | undefined): InputfieldOptionItem[] {
	if (!Array.isArray(options)) {
		return [];
	}
	const out: InputfieldOptionItem[] = [];
	for (const opt of options) {
		if (Array.isArray(opt.optgroup)) {
			for (const sub of opt.optgroup) {
				out.push(sub);
			}
		} else {
			out.push(opt);
		}
	}
	return out;
}

export function SegmentedField(props: ReactInputfieldProps): React.ReactElement {
	const isMultiple = Boolean(props.multiple);
	const options = useMemo(() => flattenSegmentedOptions(props.options), [props.options]);

	const incomingSingle = isMultiple
		? ''
		: Array.isArray(props.value)
			? String(props.value[0] ?? '')
			: props.value === null || props.value === undefined
				? ''
				: String(props.value);
	const incomingMulti = useMemo(
		() => (isMultiple ? coerceSegmentedMulti(props.value) : []),
		[isMultiple, props.value],
	);

	const sig = isMultiple ? `M:${incomingMulti.join('\u0000')}` : `S:${incomingSingle}`;
	const [prevSig, setPrevSig] = useState<string>(sig);
	const [singleValue, setSingleValue] = useState<string>(incomingSingle);
	const [multiValues, setMultiValues] = useState<string[]>(incomingMulti);
	const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

	if (sig !== prevSig) {
		setPrevSig(sig);
		if (isMultiple) {
			setMultiValues(incomingMulti);
		} else if (singleValue !== incomingSingle) {
			setSingleValue(incomingSingle);
		}
	}

	const locked = Boolean(props.readOnly || props.disabled);
	const hasError = Boolean(props.error && props.error.trim() !== '');
	const iconOnly = Boolean(props.iconOnly);
	const fullWidth = Boolean(props.fullWidth);

	const selectSingle = (val: string) => {
		if (locked) {
			return;
		}
		const next = singleValue === val && props.useDeselect ? '' : val;
		setSingleValue(next);
		props.onValueChange?.(props.name, next);
	};

	const toggleMulti = (val: string) => {
		if (locked) {
			return;
		}
		const next = multiValues.includes(val)
			? multiValues.filter((item) => item !== val)
			: [...multiValues, val];
		setMultiValues(next);
		props.onValueChange?.(props.name, next);
	};

	const moveRadioFocus = (currentIndex: number, step: 1 | -1) => {
		if (options.length === 0) {
			return;
		}
		let nextIdx = currentIndex;
		for (let i = 0; i < options.length; i++) {
			nextIdx = (nextIdx + step + options.length) % options.length;
			const candidate = options[nextIdx];
			if (candidate && !candidate.disabled) {
				btnRefs.current[nextIdx]?.focus();
				selectSingle(candidate.value);
				break;
			}
		}
	};

	return (
		<div className="min-w-0 max-w-full" data-rw-control="segmented">
			{props.name && !props.inlinePortal
				? isMultiple
					? (
						<>
							<input type="hidden" name={`${props.name}_present`} value="1" />
							{multiValues.map((val, idx) => (
								<input key={`${val}_${idx}`} type="hidden" name={`${props.name}[]`} value={val} />
							))}
						</>
					)
					: <input type="hidden" name={props.name} value={singleValue} />
				: null}

			{options.length === 0 ? (
				<div className="inline-flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-xs text-muted-foreground">
					—
				</div>
			) : (
				<div
					id={props.id}
					role={isMultiple ? 'group' : 'radiogroup'}
					aria-label={props.label || t('segmented.options', 'Options')}
					aria-invalid={hasError || undefined}
					aria-describedby={props.describedBy}
					aria-readonly={props.readOnly || undefined}
					className={cn(
						'inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 max-w-full',
						fullWidth && 'flex w-full',
						hasError && 'border-destructive',
						props.disabled && 'opacity-50',
					)}
				>
					{options.map((opt, idx) => {
						const active = isMultiple
							? multiValues.includes(opt.value)
							: singleValue === opt.value;
						const itemDisabled = locked || Boolean(opt.disabled);
						return (
							<button
								key={opt.value}
								ref={(el) => {
									btnRefs.current[idx] = el;
								}}
								type="button"
								role={isMultiple ? undefined : 'radio'}
								aria-checked={isMultiple ? undefined : active}
								aria-pressed={isMultiple ? active : undefined}
								disabled={itemDisabled}
								title={opt.description || opt.label}
								data-rw-segment={opt.value}
								onClick={() => {
									if (isMultiple) {
										toggleMulti(opt.value);
									} else {
										selectSingle(opt.value);
									}
								}}
								onKeyDown={(e) => {
									if (isMultiple || locked) {
										return;
									}
									if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
										e.preventDefault();
										moveRadioFocus(idx, 1);
									} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
										e.preventDefault();
										moveRadioFocus(idx, -1);
									}
								}}
								className={cn(
									'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed min-w-0',
									fullWidth && 'flex-1',
									active
										? 'bg-primary text-primary-foreground shadow-2xs'
										: 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
								)}
							>
								{opt.icon ? (
									<DynamicIcon name={opt.icon} aria-hidden="true" className="size-3.5 shrink-0" />
								) : null}
								{iconOnly && opt.icon ? (
									<span className="sr-only">{opt.label}</span>
								) : (
									<span className="truncate">{opt.label}</span>
								)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

export const SegmentedFieldControl = SegmentedField;
