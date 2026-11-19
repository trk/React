import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn, DynamicIcon } from '../../lib/utils';
import { dispatchDomChange, flattenOptions } from '../shared';
import type { ReactInputfieldProps } from '../types';

export function MultiSelectField(props: ReactInputfieldProps): React.ReactElement {
	const options = useMemo(() => flattenOptions(props.options).filter((o) => o.value !== ''), [props.options]);
	const [selectedValues, setSelectedValues] = useState<string[]>(() =>
		Array.isArray(props.value)
			? props.value.map(String).filter(Boolean)
			: props.value
				? [String(props.value)]
				: []
	);
	const selectRef = useRef<HTMLSelectElement | null>(null);

	useEffect(() => {
		setSelectedValues(
			Array.isArray(props.value)
				? props.value.map(String).filter(Boolean)
				: props.value
					? [String(props.value)]
					: []
		);
	}, [props.value]);

	const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
	const arrayName = props.name.endsWith('[]') ? props.name : `${props.name}[]`;

	const toggleItem = (val: string) => {
		if (props.readOnly || props.disabled) {
			return;
		}
		const next = selectedValues.includes(val)
			? selectedValues.filter((item) => item !== val)
			: [...selectedValues, val];
		setSelectedValues(next);
		props.onValueChange?.(props.name, next);
		window.requestAnimationFrame(() => dispatchDomChange(selectRef.current));
	};

	return (
		<div className="space-y-1.5" data-rw-control="multiselect">
			<select
				ref={selectRef}
				id={props.id}
				name={arrayName}
				multiple
				disabled={props.disabled}
				value={selectedValues}
				onChange={() => {}}
				className="sr-only"
			>
				{options.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>

			<div className="max-h-56 overflow-y-auto rounded-md border border-input bg-input-surface p-1 space-y-0.5 shadow-2xs">
				{options.map((opt) => {
					const isSelected = selectedSet.has(String(opt.value));
					return (
						<button
							key={opt.value}
							type="button"
							aria-pressed={isSelected}
							disabled={props.disabled || props.readOnly || opt.disabled}
							onClick={() => toggleItem(String(opt.value))}
							className={cn(
								'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer',
								isSelected
									? 'bg-primary/12 text-primary-ink'
									: 'text-foreground hover:bg-muted/60',
								(props.disabled || props.readOnly || opt.disabled) && 'opacity-50 cursor-not-allowed'
							)}
						>
							<span className="truncate">{opt.label}</span>
							{isSelected ? <DynamicIcon name="check" className="size-3.5 shrink-0" /> : null}
						</button>
					);
				})}
			</div>
		</div>
	);
}
