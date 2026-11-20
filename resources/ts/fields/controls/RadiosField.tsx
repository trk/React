import React, { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { flattenOptions } from '../shared';
import type { ReactInputfieldProps } from '../types';

export function RadiosField(props: ReactInputfieldProps): React.ReactElement {
	const options = useMemo(() => flattenOptions(props.options), [props.options]);
	const incomingVal = Array.isArray(props.value) ? (props.value[0] ?? '') : String(props.value ?? '');
	const [prevPropVal, setPrevPropVal] = useState<string>(incomingVal);
	const [selectedValue, setSelectedValue] = useState<string>(incomingVal);

	if (incomingVal !== prevPropVal) {
		setPrevPropVal(incomingVal);
		if (incomingVal !== selectedValue) {
			setSelectedValue(incomingVal);
		}
	}

	const radioGroupName = props.inlinePortal ? `${props.name}__inline` : props.name;

	const cols = props.optionColumns ?? 0;

	return (
		<div
			className={cn(
				cols === 1
					? 'flex flex-wrap items-center gap-2'
					: cols === 2
						? 'grid grid-cols-1 gap-2 sm:grid-cols-2'
						: cols >= 3
							? 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
							: 'flex flex-col gap-1.5'
			)}
			data-rw-control="radios"
			role="radiogroup"
			aria-label={props.label || props.name || undefined}
		>
			{options.map((opt) => {
				const isSelected = String(selectedValue) === String(opt.value);
				const radioId = `${props.id}_${opt.value.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
				return (
					<label
						key={opt.value}
						htmlFor={radioId}
						className={cn(
							cols >= 1
								? 'flex items-center gap-2.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none'
								: 'flex items-center gap-2.5 rounded-md py-1 text-xs font-medium transition-colors cursor-pointer select-none hover:text-foreground',
							cols >= 1
								? isSelected
									? 'border-primary bg-primary/8 text-foreground'
									: 'border-border/80 bg-muted/20 text-foreground hover:bg-muted/50'
								: 'text-foreground',
							(props.disabled || props.readOnly || opt.disabled) && 'opacity-50 cursor-not-allowed'
						)}
					>
						<input
							type="radio"
							id={radioId}
							name={radioGroupName}
							value={opt.value}
							checked={isSelected}
							disabled={props.disabled || opt.disabled}
							onChange={() => {
								if (!props.readOnly && !props.disabled && !opt.disabled) {
									setSelectedValue(String(opt.value));
									props.onValueChange?.(props.name, String(opt.value));
								}
							}}
							className="size-3.5 accent-primary"
						/>
						<span>{opt.label}</span>
					</label>
				);
			})}
		</div>
	);
}
