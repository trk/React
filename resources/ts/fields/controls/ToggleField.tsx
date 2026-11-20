import React, { useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { dispatchDomChange, flattenOptions } from '../shared';
import type { ReactInputfieldProps } from '../types';

export function ToggleField(props: ReactInputfieldProps): React.ReactElement {
	const options = useMemo(() => flattenOptions(props.options), [props.options]);
	const incomingVal = Array.isArray(props.value) ? (props.value[0] ?? '') : String(props.value ?? '');
	const [prevPropVal, setPrevPropVal] = useState<string>(incomingVal);
	const [selectedValue, setSelectedValue] = useState<string>(incomingVal);
	const containerRef = useRef<HTMLDivElement | null>(null);

	if (incomingVal !== prevPropVal) {
		setPrevPropVal(incomingVal);
		if (incomingVal !== selectedValue) {
			setSelectedValue(incomingVal);
		}
	}

	const radioGroupName = props.inlinePortal ? `${props.name}__inline` : props.name;

	const handleSelect = (val: string) => {
		if (props.readOnly || props.disabled) {
			return;
		}
		const nextVal = props.useDeselect && selectedValue === val ? '' : val;
		setSelectedValue(nextVal);
		props.onValueChange?.(props.name, nextVal);
		window.requestAnimationFrame(() => {
			const checkedInput = containerRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked');
			dispatchDomChange(checkedInput ?? containerRef.current);
		});
	};

	return (
		<div ref={containerRef} data-rw-control="toggle">
			<input type="hidden" name={`_${props.name}_`} value="1" />
			<div
				className={cn(
					'inline-flex rounded-lg border border-border bg-muted/50 p-1 gap-1',
					props.useVertical && 'flex-col items-stretch'
				)}
				role="radiogroup"
				aria-label={props.label || props.name || undefined}
			>
				{options.map((opt) => {
					const optStr = String(opt.value);
					const isSelected = String(selectedValue) === optStr;
					const isNegativeBoolean =
						options.length === 2 &&
						(optStr === '0' || optStr.toLowerCase() === 'false' || optStr.toLowerCase() === 'no');
					const radioId = `${props.id}_${opt.value}`;
					return (
						<label
							key={opt.value}
							htmlFor={radioId}
							onClick={(e) => {
								e.preventDefault();
								if (!opt.disabled) {
									handleSelect(optStr);
								}
							}}
							className={cn(
								'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none',
								isSelected
									? isNegativeBoolean
										? 'bg-background text-foreground ring-1 ring-border shadow-2xs'
										: 'bg-primary text-primary-foreground shadow-2xs'
									: 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
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
								onChange={() => handleSelect(String(opt.value))}
								className="sr-only"
							/>
							<span>{opt.label}</span>
						</label>
					);
				})}
			</div>
		</div>
	);
}
