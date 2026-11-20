import React, { useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { DynamicIcon } from '../../lib/utils';
import { Select, SortableHandle, SortableStatusRegion, useSortableList } from '../../ui';
import { dispatchDomChange, FieldStatusRow, flattenOptions } from '../shared';
import type { ReactInputfieldProps } from '../types';

export function AsmSelectField(props: ReactInputfieldProps): React.ReactElement {
	const options = useMemo(() => flattenOptions(props.options).filter((o) => o.value !== ''), [props.options]);
	const optionByValue = useMemo(() => {
		const map = new Map<string, { value: string; label: string; disabled?: boolean }>();
		for (const opt of options) {
			map.set(String(opt.value), opt);
		}
		return map;
	}, [options]);

	const incomingValues = Array.isArray(props.value)
		? props.value.map(String).filter(Boolean)
		: props.value
			? [String(props.value)]
			: [];
	const incomingSig = incomingValues.join('\u0000');
	const [prevIncomingSig, setPrevIncomingSig] = useState<string>(incomingSig);
	const [selectedValues, setSelectedValues] = useState<string[]>(incomingValues);
	const selectRef = useRef<HTMLSelectElement | null>(null);

	if (incomingSig !== prevIncomingSig) {
		setPrevIncomingSig(incomingSig);
		if (selectedValues.join('\u0000') !== incomingSig) {
			setSelectedValues(incomingValues);
		}
	}

	const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
	const availableOptions = useMemo(
		() => options.filter((o) => !selectedSet.has(String(o.value))),
		[options, selectedSet]
	);
	const arrayName = props.name.endsWith('[]') ? props.name : `${props.name}[]`;

	const addValue = (val: string) => {
		if (!val || props.readOnly || props.disabled) {
			return;
		}
		const next = selectedValues.includes(val) ? selectedValues : [...selectedValues, val];
		setSelectedValues(next);
		props.onValueChange?.(props.name, next);
		window.requestAnimationFrame(() => dispatchDomChange(selectRef.current));
	};

	const removeValue = (val: string) => {
		if (props.readOnly || props.disabled) {
			return;
		}
		const next = selectedValues.filter((item) => item !== val);
		setSelectedValues(next);
		props.onValueChange?.(props.name, next);
		window.requestAnimationFrame(() => dispatchDomChange(selectRef.current));
	};

	const applyReorderedValues = (next: string[]) => {
		setSelectedValues(next);
		props.onValueChange?.(props.name, next);
		window.requestAnimationFrame(() => dispatchDomChange(selectRef.current));
	};

	const sortable = useSortableList<string>({
		items: selectedValues,
		getId: (val) => val,
		getLabel: (val) => optionByValue.get(val)?.label ?? val,
		axis: 'vertical',
		disabled: Boolean(props.readOnly || props.disabled),
		onReorder: (next) => applyReorderedValues(next),
	});

	const isLocked = Boolean(props.readOnly || props.disabled);
	const canAdd = !isLocked && availableOptions.length > 0;
	const hasError = Boolean(props.error && props.error.trim() !== '');

	return (
		<div className="space-y-1.5" data-rw-control="asmselect">
			<SortableStatusRegion message={sortable.statusMessage} />
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
				{selectedValues.map((val) => (
					<option key={val} value={val}>
						{optionByValue.get(val)?.label ?? val}
					</option>
				))}
			</select>

			<div data-rw-field-slot="input">
				<Select
					value=""
					disabled={!canAdd}
					aria-label={props.label || props.name || 'Add item'}
					aria-invalid={hasError ? 'true' : 'false'}
					aria-describedby={props.describedBy || undefined}
					onChange={(e) => {
						if (e.target.value) {
							addValue(e.target.value);
						}
					}}
				>
					<option value="">
						{canAdd
							? props.placeholder || '+ Add item...'
							: selectedValues.length > 0
								? 'All options selected'
								: props.placeholder || 'No options available'}
					</option>
					{availableOptions.map((opt) => (
						<option key={opt.value} value={opt.value} disabled={opt.disabled}>
							{opt.label}
						</option>
					))}
				</Select>
			</div>

			<FieldStatusRow error={props.error} errorId={props.errorId} />

			{selectedValues.length > 0 ? (
				<div
					data-rw-field-slot="selected"
					{...sortable.getContainerProps()}
					className="space-y-1.5"
				>
					{selectedValues.map((val, idx) => {
						const label = optionByValue.get(val)?.label ?? val;
						return (
							<div
								key={val}
								{...sortable.getItemProps(val)}
								className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/25 px-2.5 py-1.5 text-xs"
							>
								<div className="flex items-center gap-2 min-w-0">
									{!isLocked && selectedValues.length > 1 ? (
										<SortableHandle
											size="xs"
											{...sortable.getHandleProps(val, idx)}
										/>
									) : null}
									<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
										#{idx + 1}
									</span>
									<span className="truncate font-medium text-foreground">{label}</span>
								</div>
								{!isLocked ? (
									<div className="inline-flex items-center gap-1 shrink-0">
										<button
											type="button"
											onClick={() => removeValue(val)}
											className="rounded p-1 text-muted-foreground hover:bg-destructive/12 hover:text-destructive cursor-pointer"
											title={t('common.remove', 'Remove')}
											aria-label={t('media.removeFile', { name: label }, 'Remove {name}')}
										>
											<DynamicIcon name="x" className="size-3.5" />
										</button>
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
