import React, { useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Combobox, type ComboboxOption } from '../../ui';
import type { InputfieldOptionItem, ReactInputfieldProps } from '../types';

function flattenComboboxOptions(options: InputfieldOptionItem[] | undefined): ComboboxOption[] {
	if (!Array.isArray(options)) {
		return [];
	}
	const out: ComboboxOption[] = [];
	for (const opt of options) {
		if (Array.isArray(opt.optgroup)) {
			for (const sub of opt.optgroup) {
				out.push({
					value: sub.value,
					label: sub.label,
					disabled: sub.disabled,
					icon: sub.icon,
					description: sub.description ?? (opt.label ? opt.label : undefined),
				});
			}
		} else {
			out.push({
				value: opt.value,
				label: opt.label,
				disabled: opt.disabled,
				icon: opt.icon,
				description: opt.description ?? (opt.group ? opt.group : undefined),
			});
		}
	}
	return out;
}

function coerceMultiValues(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw.map((item) => String(item ?? '').trim()).filter((v) => v !== '');
	}
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '') {
			return [];
		}
		if (trimmed.startsWith('[')) {
			try {
				const parsed = JSON.parse(trimmed) as unknown;
				if (Array.isArray(parsed)) {
					return parsed.map((item) => String(item ?? '').trim()).filter((v) => v !== '');
				}
			} catch {
				// Single string fallback
			}
		}
		return [trimmed];
	}
	return [];
}

export function ComboboxField(props: ReactInputfieldProps): React.ReactElement {
	const isMultiple = Boolean(props.multiple);
	const flatOptions = useMemo(() => flattenComboboxOptions(props.options), [props.options]);
	const optionByValue = useMemo(
		() => new Map<string, ComboboxOption>(flatOptions.map((item) => [item.value, item])),
		[flatOptions],
	);

	const incomingSingle = isMultiple
		? ''
		: Array.isArray(props.value)
			? String(props.value[0] ?? '')
			: props.value === null || props.value === undefined
				? ''
				: String(props.value);
	const incomingMulti = useMemo(
		() => (isMultiple ? coerceMultiValues(props.value) : []),
		[isMultiple, props.value],
	);

	const sig = isMultiple ? `M:${incomingMulti.join('\u0000')}` : `S:${incomingSingle}`;
	const [prevSig, setPrevSig] = useState<string>(sig);
	const [singleValue, setSingleValue] = useState<string>(incomingSingle);
	const [multiValues, setMultiValues] = useState<string[]>(incomingMulti);
	const [pickerDraft, setPickerDraft] = useState<string>('');

	if (sig !== prevSig) {
		setPrevSig(sig);
		if (isMultiple) {
			setMultiValues(incomingMulti);
		} else if (singleValue !== incomingSingle) {
			setSingleValue(incomingSingle);
		}
	}

	const hasError = Boolean(props.error && props.error.trim() !== '');
	const locked = Boolean(props.readOnly || props.disabled);
	const clearable = props.clearable !== false;

	const singleComboboxOptions = useMemo(() => {
		if (!props.allowCustom || !singleValue || optionByValue.has(singleValue)) {
			return flatOptions;
		}
		return [...flatOptions, { value: singleValue, label: singleValue }];
	}, [flatOptions, optionByValue, props.allowCustom, singleValue]);

	if (isMultiple) {
		const maxItems = props.maxItems && props.maxItems > 0 ? props.maxItems : 0;
		const atCapacity = maxItems > 0 && multiValues.length >= maxItems;
		const availableOptions = flatOptions.filter((opt) => !multiValues.includes(opt.value));

		const commitMulti = (next: string[]) => {
			setMultiValues(next);
			props.onValueChange?.(props.name, next);
		};

		return (
			<div className="space-y-2 min-w-0 max-w-full" data-rw-control="combobox" data-rw-combobox-multi="1">
				{props.name && !props.inlinePortal ? (
					<>
						<input type="hidden" name={`${props.name}_present`} value="1" />
						{multiValues.map((val, idx) => (
							<input key={`${val}_${idx}`} type="hidden" name={`${props.name}[]`} value={val} />
						))}
					</>
				) : null}

				{multiValues.length > 0 ? (
					<div className="flex flex-wrap items-center gap-1.5">
						{multiValues.map((val) => {
							const opt = optionByValue.get(val);
							return (
								<Badge key={val} variant="secondary" className="gap-1 max-w-full pr-1 font-normal">
									{opt?.icon ? (
										<DynamicIcon name={opt.icon} aria-hidden="true" className="size-3 shrink-0 opacity-75" />
									) : null}
									<span className="truncate">{opt?.label ?? val}</span>
									{!locked ? (
										<button
											type="button"
											aria-label={t('common.remove', 'Remove')}
											onClick={() => commitMulti(multiValues.filter((item) => item !== val))}
											className="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
										>
											<DynamicIcon name="x" aria-hidden="true" className="size-3" />
										</button>
									) : null}
								</Badge>
							);
						})}
					</div>
				) : props.readOnly ? (
					<div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
						—
					</div>
				) : null}

				{!props.readOnly ? (
					<Combobox
						id={props.id}
						options={availableOptions}
						value={pickerDraft}
						disabled={props.disabled || atCapacity || availableOptions.length === 0}
						placeholder={
							atCapacity
								? t('tags.limitReached', 'Maximum items reached')
								: availableOptions.length === 0
									? t('combobox.allSelected', 'All options selected')
									: props.placeholder || t('combobox.addOption', 'Search and add option...')
						}
						emptyText={props.emptyText}
						clearable={false}
						aria-label={props.label || t('common.selectOption', 'Select option')}
						aria-invalid={hasError}
						aria-describedby={props.describedBy}
						onValueChange={(nextVal) => {
							if (!nextVal || multiValues.includes(nextVal) || atCapacity) {
								return;
							}
							commitMulti([...multiValues, nextVal]);
							setPickerDraft('');
						}}
					/>
				) : null}
			</div>
		);
	}

	const selectedOption = optionByValue.get(singleValue);

	return (
		<div className="min-w-0 max-w-full" data-rw-control="combobox">
			{props.name && !props.inlinePortal ? (
				<input type="hidden" name={props.name} value={singleValue} />
			) : null}

			{props.readOnly ? (
				<div
					id={props.id}
					aria-readonly="true"
					className={cn(
						'flex min-h-9 w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground',
						!singleValue && 'text-muted-foreground',
						hasError && 'border-destructive',
					)}
				>
					{selectedOption?.icon ? (
						<DynamicIcon name={selectedOption.icon} aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
					) : null}
					<span className="truncate">{selectedOption?.label ?? (singleValue || '—')}</span>
				</div>
			) : (
				<Combobox
					id={props.id}
					options={singleComboboxOptions}
					value={singleValue || null}
					disabled={props.disabled}
					placeholder={props.placeholder || t('common.selectOption', 'Select option...')}
					emptyText={props.emptyText}
					clearable={clearable}
					aria-label={props.label || t('common.selectOption', 'Select option')}
					aria-invalid={hasError}
					aria-describedby={props.describedBy}
					onValueChange={(nextVal) => {
						setSingleValue(nextVal);
						props.onValueChange?.(props.name, nextVal);
					}}
				/>
			)}
		</div>
	);
}

export const ComboboxFieldControl = ComboboxField;
