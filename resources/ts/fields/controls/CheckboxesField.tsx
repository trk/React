import React, { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { flattenOptions } from '../shared';
import type { ReactInputfieldProps } from '../types';

export function CheckboxesField(props: ReactInputfieldProps): React.ReactElement {
	const options = useMemo(() => flattenOptions(props.options), [props.options]);
	const incomingValues = Array.isArray(props.value)
		? props.value.map(String)
		: props.value
			? [String(props.value)]
			: [];
	const incomingSig = incomingValues.join('\u0000');
	const [prevIncomingSig, setPrevIncomingSig] = useState<string>(incomingSig);
	const [selectedValues, setSelectedValues] = useState<string[]>(incomingValues);

	if (incomingSig !== prevIncomingSig) {
		setPrevIncomingSig(incomingSig);
		if (selectedValues.join('\u0000') !== incomingSig) {
			setSelectedValues(incomingValues);
		}
	}

	const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
	const cols = props.optionColumns ?? 0;
	const arrayName = props.name.endsWith('[]') ? props.name : `${props.name}[]`;

	const toggleOption = (val: string, checked: boolean) => {
		if (props.readOnly || props.disabled) {
			return;
		}
		const next = checked
			? selectedValues.includes(val)
				? selectedValues
				: [...selectedValues, val]
			: selectedValues.filter((item) => item !== val);
		setSelectedValues(next);
		props.onValueChange?.(props.name, next);
	};

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
			data-rw-control="checkboxes"
		>
			{options.map((opt) => {
				const isChecked = selectedSet.has(String(opt.value));
				const checkboxId = `${props.id}_${opt.value.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
				return (
					<label
						key={opt.value}
						htmlFor={checkboxId}
						className={cn(
							cols >= 1
								? 'flex items-center gap-2.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none'
								: 'flex items-center gap-2.5 rounded-md py-1 text-xs font-medium transition-colors cursor-pointer select-none hover:text-foreground',
							cols >= 1
								? isChecked
									? 'border-primary bg-primary/8 text-foreground'
									: 'border-border/80 bg-muted/20 text-foreground hover:bg-muted/50'
								: 'text-foreground',
							(props.disabled || props.readOnly || opt.disabled) && 'opacity-50 cursor-not-allowed'
						)}
					>
						<input
							type="checkbox"
							id={checkboxId}
							name={arrayName}
							value={opt.value}
							checked={isChecked}
							disabled={props.disabled || opt.disabled}
							onChange={(e) => toggleOption(String(opt.value), e.target.checked)}
							className="size-3.5 rounded accent-primary"
						/>
						<span>{opt.label}</span>
					</label>
				);
			})}
		</div>
	);
}
