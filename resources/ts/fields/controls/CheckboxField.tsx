import React, { useRef, useState } from 'react';
import { Switch } from '../../ui';
import { dispatchDomChange } from '../shared';
import type { ReactInputfieldProps } from '../types';

export function CheckboxField(props: ReactInputfieldProps): React.ReactElement {
	const checkedVal = props.checkedValue || '1';
	const incomingChecked = Boolean(props.checked);
	const [prevPropChecked, setPrevPropChecked] = useState<boolean>(incomingChecked);
	const [isChecked, setIsChecked] = useState<boolean>(incomingChecked);
	const inputRef = useRef<HTMLInputElement | null>(null);

	if (incomingChecked !== prevPropChecked) {
		setPrevPropChecked(incomingChecked);
		if (incomingChecked !== isChecked) {
			setIsChecked(incomingChecked);
		}
	}

	const toggleChecked = (next: boolean) => {
		if (props.readOnly || props.disabled) {
			return;
		}
		setIsChecked(next);
		props.onValueChange?.(props.name, next ? checkedVal : '');
		window.requestAnimationFrame(() => dispatchDomChange(inputRef.current));
	};

	return (
		<div
			className="flex items-center gap-3 py-1"
			data-rw-control="checkbox"
		>
			<input
				ref={inputRef}
				type="checkbox"
				id={props.id}
				name={props.name}
				value={checkedVal}
				checked={isChecked}
				disabled={props.disabled}
				onChange={(e) => toggleChecked(e.target.checked)}
				className="sr-only"
				{...(props.dataAttributes ?? {})}
			/>
			<Switch
				checked={isChecked}
				onCheckedChange={toggleChecked}
				disabled={props.disabled || props.readOnly}
				label={props.checkboxLabel || undefined}
				aria-label={!props.checkboxLabel ? (props.label || props.name || undefined) : undefined}
			/>
		</div>
	);
}
