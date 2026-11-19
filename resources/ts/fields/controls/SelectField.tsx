import React, { useEffect, useState } from 'react';
import { Select } from '../../ui';
import type { ReactInputfieldProps } from '../types';

export function SelectField(props: ReactInputfieldProps): React.ReactElement {
	const initialVal = Array.isArray(props.value) ? (props.value[0] ?? '') : String(props.value ?? '');
	const [selectedValue, setSelectedValue] = useState<string>(initialVal);

	useEffect(() => {
		const next = Array.isArray(props.value) ? (props.value[0] ?? '') : String(props.value ?? '');
		setSelectedValue(next);
	}, [props.value]);

	const options = props.options ?? [];
	const hasError = Boolean(props.error && props.error.trim() !== '');
	const isEmptyOptions = options.length === 0;

	return (
		<div data-rw-control="select">
			{props.readOnly && !props.disabled ? (
				<input type="hidden" name={props.name} value={selectedValue} />
			) : null}
			<Select
				id={props.id}
				name={props.readOnly && !props.disabled ? `${props.name}__ro` : props.name}
				value={selectedValue}
				onChange={(e) => {
					setSelectedValue(e.target.value);
					props.onValueChange?.(props.name, e.target.value);
				}}
				disabled={props.disabled || props.readOnly || isEmptyOptions}
				required={props.required}
				aria-invalid={hasError ? 'true' : 'false'}
				aria-describedby={props.describedBy || undefined}
				{...(props.dataAttributes ?? {})}
			>
				{isEmptyOptions ? <option value="">—</option> : null}
				{options.map((opt, idx) => {
					if (Array.isArray(opt.optgroup)) {
						return (
							<optgroup key={`group_${idx}_${opt.label}`} label={opt.label}>
								{opt.optgroup.map((sub) => (
									<option key={sub.value} value={sub.value} disabled={sub.disabled}>
										{sub.label}
									</option>
								))}
							</optgroup>
						);
					}
					return (
						<option key={`${opt.value}_${idx}`} value={opt.value} disabled={opt.disabled}>
							{opt.label}
						</option>
					);
				})}
			</Select>
		</div>
	);
}
