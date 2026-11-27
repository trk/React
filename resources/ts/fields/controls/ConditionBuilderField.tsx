import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Button, Input, PortalRoot, Select } from '../../ui';
import {
	DEFAULT_OPERATORS_BY_TYPE,
	OPERATOR_DEFAULT_LABELS,
	UNARY_OPERATORS,
	createEmptyConditionGroup,
	createEmptyConditionRule,
	defaultRuleValueForOperator,
	evaluateConditionTree,
	formatConditionSummary,
	getOperatorsForConditionFieldType,
	normalizeConditionBuilderValue,
	normalizeConditionFields,
	parseConditionStringToObject,
	resolveSourceFieldSpecs,
	resolveTargetFieldSpecs,
	serializeConditionToExpression,
} from '../conditionEngine';
import { buildStandaloneControlProps, notifyStandaloneHostChanged, resolveStandaloneFieldDefinition } from '../controlProps';
import { useSchemaFormContext } from '../schema/SchemaFormContext';
import { resolveDynamicBlockFields } from '../shared';
import type {
	ConditionBuilderFieldProps,
	ConditionBuilderValue,
	ConditionFieldOption,
	ConditionFieldSpec,
	ConditionFieldType,
	ConditionGroupItem,
	ConditionMatchMode,
	ConditionRuleItem,
	DynamicBlockOptionsSource,
	ReactInputfieldProps,
} from '../types';

export {
	DEFAULT_OPERATORS_BY_TYPE,
	UNARY_OPERATORS,
	createEmptyConditionGroup,
	createEmptyConditionRule,
	evaluateConditionTree,
	formatConditionSummary,
	getOperatorsForConditionFieldType,
	normalizeConditionBuilderValue,
	serializeConditionToExpression,
};

function getOperatorLabel(operator: string): string {
	switch (operator) {
		case 'eq':
			return t('conditionBuilder.op.eq', OPERATOR_DEFAULT_LABELS.eq ?? 'Equals');
		case 'neq':
			return t('conditionBuilder.op.neq', OPERATOR_DEFAULT_LABELS.neq ?? 'Does not equal');
		case 'contains':
			return t('conditionBuilder.op.contains', OPERATOR_DEFAULT_LABELS.contains ?? 'Contains');
		case 'not_contains':
			return t('conditionBuilder.op.notContains', OPERATOR_DEFAULT_LABELS.not_contains ?? 'Does not contain');
		case 'starts_with':
			return t('conditionBuilder.op.startsWith', OPERATOR_DEFAULT_LABELS.starts_with ?? 'Starts with');
		case 'ends_with':
			return t('conditionBuilder.op.endsWith', OPERATOR_DEFAULT_LABELS.ends_with ?? 'Ends with');
		case 'gt':
			return t('conditionBuilder.op.gt', OPERATOR_DEFAULT_LABELS.gt ?? 'Greater than');
		case 'gte':
			return t('conditionBuilder.op.gte', OPERATOR_DEFAULT_LABELS.gte ?? 'Greater than or equal');
		case 'lt':
			return t('conditionBuilder.op.lt', OPERATOR_DEFAULT_LABELS.lt ?? 'Less than');
		case 'lte':
			return t('conditionBuilder.op.lte', OPERATOR_DEFAULT_LABELS.lte ?? 'Less than or equal');
		case 'between':
			return t('conditionBuilder.op.between', OPERATOR_DEFAULT_LABELS.between ?? 'Between');
		case 'in':
			return t('conditionBuilder.op.in', OPERATOR_DEFAULT_LABELS.in ?? 'Is one of');
		case 'not_in':
			return t('conditionBuilder.op.notIn', OPERATOR_DEFAULT_LABELS.not_in ?? 'Is not one of');
		case 'before':
			return t('conditionBuilder.op.before', OPERATOR_DEFAULT_LABELS.before ?? 'Before');
		case 'on_or_before':
			return t('conditionBuilder.op.onOrBefore', OPERATOR_DEFAULT_LABELS.on_or_before ?? 'On or before');
		case 'after':
			return t('conditionBuilder.op.after', OPERATOR_DEFAULT_LABELS.after ?? 'After');
		case 'on_or_after':
			return t('conditionBuilder.op.onOrAfter', OPERATOR_DEFAULT_LABELS.on_or_after ?? 'On or after');
		case 'is_true':
			return t('conditionBuilder.op.isTrue', OPERATOR_DEFAULT_LABELS.is_true ?? 'Is true');
		case 'is_false':
			return t('conditionBuilder.op.isFalse', OPERATOR_DEFAULT_LABELS.is_false ?? 'Is false');
		case 'is_empty':
			return t('conditionBuilder.op.isEmpty', OPERATOR_DEFAULT_LABELS.is_empty ?? 'Is empty');
		case 'is_not_empty':
			return t('conditionBuilder.op.isNotEmpty', OPERATOR_DEFAULT_LABELS.is_not_empty ?? 'Is not empty');
		default:
			return operator;
	}
}

function getFieldTypeLabel(type: ConditionFieldType): string {
	switch (type) {
		case 'number':
			return t('conditionBuilder.type.number', 'Number');
		case 'select':
			return t('conditionBuilder.type.select', 'Select');
		case 'boolean':
			return t('conditionBuilder.type.boolean', 'Boolean');
		case 'country':
			return t('conditionBuilder.type.country', 'Country');
		case 'currency':
			return t('conditionBuilder.type.currency', 'Currency');
		case 'date':
			return t('conditionBuilder.type.date', 'Date');
		default:
			return t('conditionBuilder.type.text', 'Text');
	}
}

function computePopoverRect(anchor: HTMLElement, width = 280, maxHeight = 300): { top: number; left: number; width: number } {
	const rect = anchor.getBoundingClientRect();
	const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
	const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
	const resolvedWidth = Math.max(width, Math.round(rect.width));
	let left = rect.left;
	if (left + resolvedWidth > vw - 12) {
		left = Math.max(12, vw - resolvedWidth - 12);
	}
	const spaceBelow = vh - rect.bottom - 12;
	const top = spaceBelow >= Math.min(200, maxHeight) || rect.top < 220
		? rect.bottom + 4
		: Math.max(12, rect.top - maxHeight - 4);
	return { top, left, width: Math.min(resolvedWidth, vw - 24) };
}

interface SegmentedMatchToggleProps {
	value: ConditionMatchMode;
	disabled: boolean;
	ariaLabel: string;
	onChange: (next: ConditionMatchMode) => void;
	size?: 'sm' | 'xs';
}

const SegmentedMatchToggle: React.FC<SegmentedMatchToggleProps> = ({
	value,
	disabled,
	ariaLabel,
	onChange,
	size = 'sm',
}) => {
	const padClass = size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
	return (
		<div
			role="group"
			aria-label={ariaLabel}
			className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5"
		>
			<button
				type="button"
				aria-pressed={value === 'all'}
				disabled={disabled}
				onClick={() => onChange('all')}
				className={cn(
					'rounded-[4px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
					padClass,
					value === 'all'
						? 'bg-background text-foreground shadow-xs'
						: 'text-muted-foreground hover:text-foreground',
				)}
			>
				{t('conditionBuilder.matchAll', 'All (AND)')}
			</button>
			<button
				type="button"
				aria-pressed={value === 'any'}
				disabled={disabled}
				onClick={() => onChange('any')}
				className={cn(
					'rounded-[4px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
					padClass,
					value === 'any'
						? 'bg-background text-foreground shadow-xs'
						: 'text-muted-foreground hover:text-foreground',
				)}
			>
				{t('conditionBuilder.matchAny', 'Any (OR)')}
			</button>
		</div>
	);
};

interface ConditionFieldPickerProps {
	id?: string;
	value: string;
	fields: ConditionFieldSpec[];
	disabled: boolean;
	ariaLabel: string;
	placeholder: string;
	onChange: (fieldKey: string) => void;
}

const ConditionFieldPicker: React.FC<ConditionFieldPickerProps> = ({
	id,
	value,
	fields,
	disabled,
	ariaLabel,
	placeholder,
	onChange,
}) => {
	const pickerId = useId();
	const listboxId = `${pickerId}-listbox`;
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
	const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const popoverRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const focusTimerRef = useRef<number | null>(null);
	const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const selectedSpec = useMemo(
		() => fields.find((f) => f.key === value),
		[fields, value],
	);

	const groupedFields = useMemo(() => {
		const q = search.trim().toLowerCase();
		const filtered = q === ''
			? fields
			: fields.filter(
					(f) =>
						f.label.toLowerCase().includes(q) ||
						f.key.toLowerCase().includes(q) ||
						(f.group && f.group.toLowerCase().includes(q)) ||
						(f.description && f.description.toLowerCase().includes(q)),
				);

		const groups: Array<{ name: string; items: ConditionFieldSpec[] }> = [];
		const byGroup = new Map<string, ConditionFieldSpec[]>();

		for (const item of filtered) {
			const groupName = item.group ?? '';
			let bucket = byGroup.get(groupName);
			if (!bucket) {
				bucket = [];
				byGroup.set(groupName, bucket);
				groups.push({ name: groupName, items: bucket });
			}
			bucket.push(item);
		}
		return groups;
	}, [fields, search]);

	const flatFields = useMemo(
		() => groupedFields.flatMap((grp) => grp.items),
		[groupedFields],
	);

	const optionIndexByKey = useMemo(() => {
		const map = new Map<string, number>();
		flatFields.forEach((item, idx) => {
			map.set(item.key, idx);
		});
		return map;
	}, [flatFields]);

	useEffect(() => {
		if (!isOpen) {
			setHighlightedIndex(-1);
			return;
		}
		const selectedIdx = flatFields.findIndex((item) => item.key === value);
		setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : flatFields.length > 0 ? 0 : -1);
	}, [isOpen, flatFields, value]);

	useEffect(() => {
		if (!isOpen || typeof document === 'undefined') {
			return;
		}
		const updateCoords = () => {
			if (triggerRef.current) {
				setCoords(computePopoverRect(triggerRef.current, 290, 320));
			}
		};
		const handlePointerDown = (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (!target) return;
			if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
				return;
			}
			setIsOpen(false);
		};
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				setIsOpen(false);
				triggerRef.current?.focus();
			}
		};
		document.addEventListener('mousedown', handlePointerDown);
		document.addEventListener('keydown', handleKeyDown, true);
		window.addEventListener('scroll', updateCoords, true);
		window.addEventListener('resize', updateCoords);
		focusTimerRef.current = window.setTimeout(() => {
			focusTimerRef.current = null;
			searchInputRef.current?.focus();
		}, 10);
		return () => {
			document.removeEventListener('mousedown', handlePointerDown);
			document.removeEventListener('keydown', handleKeyDown, true);
			window.removeEventListener('scroll', updateCoords, true);
			window.removeEventListener('resize', updateCoords);
			if (focusTimerRef.current !== null) {
				window.clearTimeout(focusTimerRef.current);
				focusTimerRef.current = null;
			}
		};
	}, [isOpen]);

	const selectField = (fieldKey: string) => {
		onChange(fieldKey);
		setIsOpen(false);
		triggerRef.current?.focus();
	};

	const moveHighlight = (nextIdx: number) => {
		if (flatFields.length === 0) {
			setHighlightedIndex(-1);
			return;
		}
		const bounded = ((nextIdx % flatFields.length) + flatFields.length) % flatFields.length;
		setHighlightedIndex(bounded);
		const optEl = optionRefs.current[bounded];
		if (optEl && typeof optEl.scrollIntoView === 'function') {
			optEl.scrollIntoView({ block: 'nearest' });
		}
	};

	const handlePickerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (flatFields.length === 0) {
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			moveHighlight(highlightedIndex < 0 ? 0 : highlightedIndex + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			moveHighlight(highlightedIndex <= 0 ? flatFields.length - 1 : highlightedIndex - 1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			moveHighlight(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			moveHighlight(flatFields.length - 1);
		} else if (e.key === 'Enter') {
			const picked = highlightedIndex >= 0 ? flatFields[highlightedIndex] : undefined;
			if (picked) {
				e.preventDefault();
				selectField(picked.key);
			}
		}
	};

	const highlightedOptionId =
		highlightedIndex >= 0 && flatFields[highlightedIndex]
			? `${pickerId}-opt-${highlightedIndex}`
			: undefined;

	const toggleOpen = () => {
		if (disabled) return;
		if (!isOpen && triggerRef.current) {
			setCoords(computePopoverRect(triggerRef.current, 290, 320));
			setSearch('');
			setIsOpen(true);
		} else {
			setIsOpen(false);
		}
	};

	return (
		<>
			<button
				ref={triggerRef}
				id={id}
				type="button"
				disabled={disabled}
				aria-label={ariaLabel}
				aria-haspopup="dialog"
				aria-expanded={isOpen}
				aria-controls={isOpen && groupedFields.length > 0 ? listboxId : undefined}
				onClick={toggleOpen}
				className={cn(
					'flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 text-left text-xs transition-colors',
					'hover:border-ring/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					disabled && 'cursor-not-allowed opacity-50',
				)}
			>
				<span className="flex min-w-0 items-center gap-1.5 truncate">
					{selectedSpec?.icon ? (
						<DynamicIcon name={selectedSpec.icon} className="size-3.5 shrink-0 text-muted-foreground" />
					) : null}
					<span className={cn('truncate', !selectedSpec && !value && 'text-muted-foreground')}>
						{selectedSpec ? selectedSpec.label : value || placeholder}
					</span>
				</span>
				<span className="flex shrink-0 items-center gap-1">
					{selectedSpec ? (
						<span className="hidden @[260px]:inline rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
							{getFieldTypeLabel(selectedSpec.type)}
						</span>
					) : null}
					<DynamicIcon name="chevron-down" className="size-3.5 text-muted-foreground" />
				</span>
			</button>

			{isOpen && coords ? (
				<PortalRoot anchor={triggerRef.current} ssrFallback={false}>
					<div
						ref={popoverRef}
						role="dialog"
						aria-label={ariaLabel}
						data-rw-portal-overlay=""
						onKeyDown={handlePickerKeyDown}
						style={{
							position: 'fixed',
							top: coords.top,
							left: coords.left,
							width: coords.width,
						}}
						className="z-[90] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
					>
						<div className="border-b border-border p-2">
							<Input
								ref={searchInputRef}
								type="search"
								role="combobox"
								aria-autocomplete="list"
								aria-expanded={true}
								value={search}
								placeholder={t('conditionBuilder.searchFieldPlaceholder', 'Search fields...')}
								aria-label={t('conditionBuilder.searchFieldPlaceholder', 'Search fields...')}
								aria-controls={groupedFields.length > 0 ? listboxId : undefined}
								aria-activedescendant={highlightedOptionId}
								className="h-7 text-xs"
								onChange={(e) => setSearch(e.target.value)}
							/>
						</div>
						{groupedFields.length === 0 ? (
							<div className="max-h-64 overflow-y-auto p-1">
								<div className="px-2.5 py-4 text-center text-xs text-muted-foreground">
									{t('conditionBuilder.noMatchingFields', 'No matching fields')}
								</div>
							</div>
						) : (
							<div
								id={listboxId}
								role="listbox"
								aria-label={ariaLabel}
								className="max-h-64 overflow-y-auto p-1"
							>
								{groupedFields.map((grp) => (
									<div
										key={grp.name || '_default'}
										role="group"
										aria-label={grp.name !== '' ? grp.name : ariaLabel}
										className="mb-1 last:mb-0"
									>
										{grp.name !== '' ? (
											<div
												aria-hidden="true"
												className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
											>
												{grp.name}
											</div>
										) : null}
										{grp.items.map((item) => {
											const isSelected = item.key === value;
											const optIdx = optionIndexByKey.get(item.key) ?? -1;
											const isHighlighted = optIdx >= 0 && optIdx === highlightedIndex;
											return (
												<button
													key={item.key}
													id={optIdx >= 0 ? `${pickerId}-opt-${optIdx}` : undefined}
													ref={(el) => {
														if (optIdx >= 0) {
															optionRefs.current[optIdx] = el;
														}
													}}
													type="button"
													role="option"
													tabIndex={-1}
													aria-selected={isSelected}
													onMouseEnter={() => {
														if (optIdx >= 0) {
															setHighlightedIndex(optIdx);
														}
													}}
													onClick={() => selectField(item.key)}
													className={cn(
														'flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
														isHighlighted
															? 'bg-accent text-accent-foreground font-medium'
															: isSelected
																? 'bg-primary/10 text-primary font-medium'
																: 'hover:bg-accent hover:text-accent-foreground',
													)}
												>
													<span className="flex min-w-0 items-start gap-2">
														{item.icon ? (
															<DynamicIcon
																name={item.icon}
																className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
															/>
														) : null}
														<span className="min-w-0">
															<span className="block truncate">{item.label}</span>
															{item.description ? (
																<span className="block truncate text-[10px] font-normal text-muted-foreground">
																	{item.description}
																</span>
															) : null}
														</span>
													</span>
													<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
														{getFieldTypeLabel(item.type)}
													</span>
												</button>
											);
										})}
									</div>
								))}
							</div>
						)}
					</div>
				</PortalRoot>
			) : null}
		</>
	);
};

interface CommaListValueInputProps {
	value: unknown;
	disabled: boolean;
	placeholder: string;
	ariaLabel: string;
	onChange: (next: string[]) => void;
}

const CommaListValueInput: React.FC<CommaListValueInputProps> = ({
	value,
	disabled,
	placeholder,
	ariaLabel,
	onChange,
}) => {
	const serialize = (val: unknown): string =>
		Array.isArray(val)
			? val.map((item) => String(item ?? '').trim()).filter(Boolean).join(', ')
			: typeof val === 'string'
				? val
				: '';

	const [draft, setDraft] = useState<string>(() => serialize(value));
	const lastExternalRef = useRef<string>(serialize(value));

	useEffect(() => {
		const nextSerialized = serialize(value);
		if (nextSerialized !== lastExternalRef.current) {
			lastExternalRef.current = nextSerialized;
			setDraft(nextSerialized);
		}
	}, [value]);

	const commitDraft = (rawText: string) => {
		const tokens = rawText
			.split(/\s*,\s*/)
			.map((token) => token.trim())
			.filter((token) => token !== '');
		lastExternalRef.current = tokens.join(', ');
		onChange(tokens);
	};

	return (
		<Input
			type="text"
			disabled={disabled}
			value={draft}
			aria-label={ariaLabel}
			placeholder={placeholder}
			className="h-8 text-xs"
			onChange={(e) => setDraft(e.target.value)}
			onBlur={() => commitDraft(draft)}
			onKeyDown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					commitDraft(draft);
				}
			}}
		/>
	);
};

interface ConditionValueEditorProps {
	rule: ConditionRuleItem;
	spec?: ConditionFieldSpec;
	allFields: ConditionFieldSpec[];
	allowFieldComparison: boolean;
	disabled: boolean;
	onChange: (nextValue: unknown, nextValueSource?: 'manual' | 'field') => void;
}

const ConditionValueEditor: React.FC<ConditionValueEditorProps> = ({
	rule,
	spec,
	allFields,
	allowFieldComparison,
	disabled,
	onChange,
}) => {
	const fieldType: ConditionFieldType = spec?.type ?? 'text';
	const isUnary = UNARY_OPERATORS.has(rule.operator);
	const targetFields = useMemo(
		() => resolveTargetFieldSpecs(allFields, rule.field, spec),
		[allFields, rule.field, spec],
	);
	const canCompareWithField =
		allowFieldComparison && !isUnary && rule.operator !== 'between' && targetFields.length > 0;
	const valueSource: 'manual' | 'field' =
		rule.valueSource === 'field' && canCompareWithField ? 'field' : 'manual';
	const fieldLabel = spec?.label ?? (rule.field || t('conditionBuilder.valueLabel', 'Value'));

	const intlOptions = useMemo<ConditionFieldOption[]>(
		() => spec?.options ?? [],
		[spec?.options],
	);
	const currentStr = rule.value !== null && rule.value !== undefined ? String(rule.value) : '';
	const allowCustomValue = Boolean(spec?.allowCustomValue);
	const hasMatchingOption = intlOptions.some((opt) => opt.value === currentStr);
	const isCustomValueActive = allowCustomValue && currentStr !== '' && !hasMatchingOption;
	const [customInputActive, setCustomInputActive] = useState<boolean>(isCustomValueActive);
	const [customChipDraft, setCustomChipDraft] = useState<string>('');

	useEffect(() => {
		if (isCustomValueActive) {
			setCustomInputActive(true);
		}
	}, [isCustomValueActive]);

	const wrapWithSourceToggle = (editorNode: React.ReactNode): React.ReactNode => {
		if (!canCompareWithField) {
			return editorNode;
		}
		return (
			<div className="flex min-w-0 items-center gap-1.5">
				<div
					className="inline-flex shrink-0 items-center rounded-md border border-border bg-muted/40 p-0.5"
					role="group"
					aria-label={t('conditionBuilder.valueSourceMode', 'Comparison source')}
				>
					<button
						type="button"
						disabled={disabled}
						aria-pressed={valueSource === 'manual'}
						className={cn(
							'rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
							valueSource === 'manual'
								? 'bg-background text-foreground shadow-xs'
								: 'text-muted-foreground hover:text-foreground',
						)}
						onClick={() =>
							onChange(defaultRuleValueForOperator(rule.operator, fieldType), 'manual')
						}
					>
						{t('conditionBuilder.sourceManual', 'Value')}
					</button>
					<button
						type="button"
						disabled={disabled}
						aria-pressed={valueSource === 'field'}
						className={cn(
							'rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
							valueSource === 'field'
								? 'bg-background text-foreground shadow-xs'
								: 'text-muted-foreground hover:text-foreground',
						)}
						onClick={() => onChange(targetFields[0]?.key ?? '', 'field')}
					>
						{t('conditionBuilder.sourceField', 'Field')}
					</button>
				</div>
				<div className="min-w-0 flex-1">{editorNode}</div>
			</div>
		);
	};

	if (valueSource === 'field') {
		return wrapWithSourceToggle(
			<ConditionFieldPicker
				value={typeof rule.value === 'string' ? rule.value : ''}
				fields={targetFields}
				disabled={disabled}
				ariaLabel={t(
					'conditionBuilder.compareFieldAria',
					{ field: fieldLabel },
					'Target comparison field for {field}',
				)}
				placeholder={t('conditionBuilder.selectCompareField', 'Select field...')}
				onChange={(nextKey) => onChange(nextKey, 'field')}
			/>,
		);
	}

	if (isUnary) {
		return (
			<div
				className="flex h-8 items-center rounded-md border border-dashed border-border bg-muted/25 px-2.5 text-xs text-muted-foreground"
				aria-label={t('conditionBuilder.noValueNeeded', 'No comparison value required')}
			>
				{t('conditionBuilder.noValueNeededShort', 'No value needed')}
			</div>
		);
	}

	if (rule.operator === 'between') {
		const pair = Array.isArray(rule.value) ? rule.value : ['', ''];
		const minVal = pair[0] !== null && pair[0] !== undefined ? String(pair[0]) : '';
		const maxVal = pair[1] !== null && pair[1] !== undefined ? String(pair[1]) : '';
		const inputType = fieldType === 'date' ? 'date' : 'number';

		return wrapWithSourceToggle(
			<div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
				<Input
					type={inputType}
					step={fieldType === 'number' ? 'any' : undefined}
					disabled={disabled}
					value={minVal}
					aria-label={t('conditionBuilder.rangeMinAria', { field: fieldLabel }, '{field} minimum')}
					placeholder={t('conditionBuilder.minPlaceholder', 'Min')}
					className="h-8 text-xs"
					onChange={(e) => onChange([e.target.value, maxVal], 'manual')}
				/>
				<span className="text-xs text-muted-foreground">–</span>
				<Input
					type={inputType}
					step={fieldType === 'number' ? 'any' : undefined}
					disabled={disabled}
					value={maxVal}
					aria-label={t('conditionBuilder.rangeMaxAria', { field: fieldLabel }, '{field} maximum')}
					placeholder={t('conditionBuilder.maxPlaceholder', 'Max')}
					className="h-8 text-xs"
					onChange={(e) => onChange([minVal, e.target.value], 'manual')}
				/>
			</div>,
		);
	}

	if (rule.operator === 'in' || rule.operator === 'not_in') {
		const selectedList = Array.isArray(rule.value)
			? rule.value.map((v) => String(v))
			: typeof rule.value === 'string' && rule.value.trim() !== ''
				? rule.value.split(/\s*,\s*/).filter(Boolean)
				: [];

		if (intlOptions.length > 0) {
			const remainingOptions = intlOptions.filter((opt) => !selectedList.includes(opt.value));
			return wrapWithSourceToggle(
				<div className="space-y-1.5">
					{selectedList.length > 0 ? (
						<div className="flex flex-wrap gap-1">
							{selectedList.map((valToken) => {
								const opt = intlOptions.find((o) => o.value === valToken);
								const chipLabel = opt?.label ?? valToken;
								return (
									<Badge key={valToken} variant="secondary" className="gap-1 py-0.5 text-[11px] font-normal">
										<span>{chipLabel}</span>
										{!disabled ? (
											<button
												type="button"
												aria-label={t('conditionBuilder.removeValueOption', { label: chipLabel }, 'Remove {label}')}
												className="ml-0.5 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
												onClick={() =>
													onChange(
														selectedList.filter((item) => item !== valToken),
														'manual',
													)
												}
											>
												<DynamicIcon name="x" className="size-3" />
											</button>
										) : null}
									</Badge>
								);
							})}
						</div>
					) : null}
					<Select
						value=""
						disabled={disabled || remainingOptions.length === 0}
						aria-label={t('conditionBuilder.addValueOptionAria', { field: fieldLabel }, '{field} add value')}
						className="h-8 text-xs"
						onChange={(e) => {
							const picked = e.target.value;
							if (picked !== '' && !selectedList.includes(picked)) {
								onChange([...selectedList, picked], 'manual');
							}
						}}
					>
						<option value="">
							{remainingOptions.length > 0
								? t('conditionBuilder.selectOptionAdd', 'Select value to add...')
								: t('conditionBuilder.allOptionsSelected', 'All options selected')}
						</option>
						{remainingOptions.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</Select>
					{allowCustomValue && !disabled ? (
						<div className="flex items-center gap-1">
							<Input
								type="text"
								value={customChipDraft}
								aria-label={t('conditionBuilder.addCustomValue', 'Add custom value')}
								placeholder={t('conditionBuilder.customValuePlaceholder', 'Enter custom value...')}
								className="h-8 flex-1 text-xs"
								onChange={(e) => setCustomChipDraft(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										const nextTok = customChipDraft.trim();
										if (nextTok !== '' && !selectedList.includes(nextTok)) {
											onChange([...selectedList, nextTok], 'manual');
										}
										setCustomChipDraft('');
									}
								}}
							/>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={customChipDraft.trim() === ''}
								aria-label={t('conditionBuilder.addCustomValue', 'Add custom value')}
								className="h-8 px-2"
								onClick={() => {
									const nextTok = customChipDraft.trim();
									if (nextTok !== '' && !selectedList.includes(nextTok)) {
										onChange([...selectedList, nextTok], 'manual');
									}
									setCustomChipDraft('');
								}}
							>
								<DynamicIcon name="plus" className="size-3.5" />
							</Button>
						</div>
					) : null}
				</div>,
			);
		}

		return wrapWithSourceToggle(
			<CommaListValueInput
				value={selectedList}
				disabled={disabled}
				ariaLabel={t(
					'conditionBuilder.commaValuesAria',
					{ field: fieldLabel },
					'{field} comma-separated values',
				)}
				placeholder={spec?.placeholder ?? t('conditionBuilder.commaPlaceholder', 'val1, val2, ...')}
				onChange={(tokens) => onChange(tokens, 'manual')}
			/>,
		);
	}

	if (fieldType === 'boolean') {
		const boolVal =
			rule.value === true ||
			rule.value === 'true' ||
			rule.value === '1' ||
			rule.value === 1;
		return wrapWithSourceToggle(
			<Select
				value={boolVal ? 'true' : 'false'}
				disabled={disabled}
				aria-label={t(
					'conditionBuilder.booleanValueAria',
					{ field: fieldLabel },
					'{field} boolean value',
				)}
				className="h-8 text-xs"
				onChange={(e) => onChange(e.target.value === 'true', 'manual')}
			>
				<option value="true">{t('conditionBuilder.trueLabel', 'True')}</option>
				<option value="false">{t('conditionBuilder.falseLabel', 'False')}</option>
			</Select>,
		);
	}

	if (intlOptions.length > 0) {
		if (allowCustomValue && (customInputActive || isCustomValueActive)) {
			return wrapWithSourceToggle(
				<div className="flex items-center gap-1">
					<Input
						type="text"
						disabled={disabled}
						value={currentStr}
						aria-label={t('conditionBuilder.valueAria', { field: fieldLabel }, '{field} value')}
						placeholder={
							spec?.placeholder ??
							t('conditionBuilder.customValuePlaceholder', 'Enter custom value...')
						}
						className="h-8 flex-1 text-xs"
						onChange={(e) => onChange(e.target.value, 'manual')}
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={disabled}
						aria-label={t('conditionBuilder.backToOptions', 'Choose from list')}
						title={t('conditionBuilder.backToOptions', 'Choose from list')}
						className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
						onClick={() => {
							setCustomInputActive(false);
							if (!hasMatchingOption) {
								onChange('', 'manual');
							}
						}}
					>
						<DynamicIcon name="list" className="size-3.5" />
					</Button>
				</div>,
			);
		}
		return wrapWithSourceToggle(
			<Select
				value={hasMatchingOption || currentStr === '' ? currentStr : ''}
				disabled={disabled}
				aria-label={t('conditionBuilder.valueAria', { field: fieldLabel }, '{field} value')}
				className="h-8 text-xs"
				onChange={(e) => {
					const picked = e.target.value;
					if (picked === '__rw_custom__') {
						setCustomInputActive(true);
						onChange('', 'manual');
						return;
					}
					onChange(picked, 'manual');
				}}
			>
				<option value="">{spec?.placeholder ?? t('conditionBuilder.selectValuePlaceholder', 'Select...')}</option>
				{intlOptions.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
				{allowCustomValue ? (
					<option value="__rw_custom__">
						{t('conditionBuilder.customValueOption', 'Custom value...')}
					</option>
				) : null}
			</Select>,
		);
	}

	if (fieldType === 'number') {
		const numStr = rule.value !== null && rule.value !== undefined ? String(rule.value) : '';
		return wrapWithSourceToggle(
			<Input
				type="number"
				step="any"
				disabled={disabled}
				value={numStr}
				aria-label={t(
					'conditionBuilder.numericValueAria',
					{ field: fieldLabel },
					'{field} numeric value',
				)}
				placeholder={spec?.placeholder ?? t('conditionBuilder.numberPlaceholder', '0')}
				className="h-8 text-xs"
				onChange={(e) => onChange(e.target.value, 'manual')}
			/>,
		);
	}

	if (fieldType === 'date') {
		const dateStr = rule.value !== null && rule.value !== undefined ? String(rule.value) : '';
		return wrapWithSourceToggle(
			<Input
				type="date"
				disabled={disabled}
				value={dateStr}
				aria-label={t('conditionBuilder.dateValueAria', { field: fieldLabel }, '{field} date value')}
				className="h-8 text-xs"
				onChange={(e) => onChange(e.target.value, 'manual')}
			/>,
		);
	}

	const textStr = rule.value !== null && rule.value !== undefined ? String(rule.value) : '';
	return wrapWithSourceToggle(
		<Input
			type="text"
			disabled={disabled}
			value={textStr}
			placeholder={spec?.placeholder ?? t('conditionBuilder.valuePlaceholder', 'Enter value...')}
			aria-label={t('conditionBuilder.valueAria', { field: fieldLabel }, '{field} value')}
			className="h-8 text-xs"
			onChange={(e) => onChange(e.target.value, 'manual')}
		/>,
	);
};

export function ConditionBuilderField(rawProps: ConditionBuilderFieldProps): React.ReactElement {
	const baseId = useId();
	const hasControlWrapper = Boolean(rawProps.control && typeof rawProps.control === 'object');
	const isStandaloneControlled = rawProps.onValueChange !== undefined || rawProps.onChange !== undefined;

	const initialUnwrapped = useMemo<Partial<ReactInputfieldProps> & ConditionBuilderFieldProps>(() => {
		if (!hasControlWrapper) {
			return rawProps;
		}
		const def = resolveStandaloneFieldDefinition(rawProps as unknown as Record<string, unknown>);
		return buildStandaloneControlProps(def, def.value);
	}, [hasControlWrapper, rawProps]);

	const [localValue, setLocalValue] = useState<unknown>(initialUnwrapped.value);

	useEffect(() => {
		setLocalValue(initialUnwrapped.value);
	}, [initialUnwrapped.value]);

	const props = (
		hasControlWrapper
			? { ...initialUnwrapped, value: isStandaloneControlled ? initialUnwrapped.value : localValue }
			: rawProps
	) as ConditionBuilderFieldProps;

	const resolvedId = typeof props.id === 'string' && props.id.trim() !== '' ? props.id.trim() : baseId;
	const resolvedName = typeof props.name === 'string' ? props.name.trim() : '';

	const hostRef = useRef<HTMLDivElement | null>(null);
	const seqRef = useRef<number>(0);
	const nextId = (prefix: string): string => {
		seqRef.current += 1;
		return `${prefix}_${seqRef.current}`;
	};

	const schemaCtx = useSchemaFormContext();
	const blocksVersion = schemaCtx?.blocksVersion ?? 0;
	const schemaValues = schemaCtx?.values;
	const rawSource =
		props.conditionFieldsSource ??
		(props.props?.conditionFieldsSource as DynamicBlockOptionsSource | undefined);
	const allowFieldComparison =
		props.allowFieldComparison !== false && props.props?.allowFieldComparison !== false;
	const allowNegate =
		props.allowNegate !== false && props.props?.allowNegate !== false;
	const showSummary =
		props.showSummary !== false && props.props?.showSummary !== false;
	const allowRawExpression = Boolean(
		props.allowRawExpression ?? props.props?.allowRawExpression,
	);
	const [editorMode, setEditorMode] = useState<'visual' | 'expression'>('visual');
	const [expressionDraft, setExpressionDraft] = useState<string>('');
	const [expressionError, setExpressionError] = useState<string | null>(null);
	const [expressionLossy, setExpressionLossy] = useState<boolean>(false);
	const layout = (props.layout ?? (props.props?.layout as 'auto' | 'inline' | 'compact' | undefined) ?? 'auto');
	const maxGroups =
		typeof props.maxGroups === 'number' && props.maxGroups > 0
			? props.maxGroups
			: typeof props.props?.maxGroups === 'number' && (props.props.maxGroups as number) > 0
				? (props.props.maxGroups as number)
				: null;
	const maxRulesPerGroup =
		typeof props.maxRulesPerGroup === 'number' && props.maxRulesPerGroup > 0
			? props.maxRulesPerGroup
			: typeof props.props?.maxRulesPerGroup === 'number' && (props.props.maxRulesPerGroup as number) > 0
				? (props.props.maxRulesPerGroup as number)
				: null;

	const staticFields = useMemo(
		() => normalizeConditionFields(props.conditionFields, props.props),
		[props.conditionFields, props.props],
	);
	const dynamicBlockFields = useMemo(
		() => resolveDynamicBlockFields(rawSource, schemaCtx, props.formValues, props.scopePrefix),
		[rawSource, schemaCtx, props.formValues, props.scopePrefix, blocksVersion, schemaValues],
	);
	const conditionFields = useMemo(() => {
		if (dynamicBlockFields.length === 0) {
			return staticFields;
		}
		const seen = new Set(staticFields.map((s) => s.key));
		const merged = [...staticFields];
		for (const df of dynamicBlockFields) {
			if (!seen.has(df.key)) {
				seen.add(df.key);
				merged.push(df);
			}
		}
		return merged;
	}, [staticFields, dynamicBlockFields]);

	const sourceFields = useMemo(
		() => resolveSourceFieldSpecs(conditionFields),
		[conditionFields],
	);

	const fieldMap = useMemo(() => {
		const map = new Map<string, ConditionFieldSpec>();
		for (const spec of conditionFields) {
			map.set(spec.key, spec);
		}
		return map;
	}, [conditionFields]);

	const normalized = useMemo(
		() => normalizeConditionBuilderValue(props.value, conditionFields),
		[props.value, conditionFields],
	);

	const summaryText = useMemo(
		() =>
			formatConditionSummary(normalized, conditionFields, {
				andLabel: t('conditionBuilder.summaryAnd', 'AND'),
				orLabel: t('conditionBuilder.summaryOr', 'OR'),
				notLabel: t('conditionBuilder.summaryNot', 'NOT'),
				translateOperator: (op) => getOperatorLabel(op).toLowerCase(),
			}),
		[normalized, conditionFields],
	);

	const isLocked = Boolean(props.disabled || props.readOnly);
	const hasError = Boolean(props.error || (props.errors && props.errors.length > 0));
	const totalRulesCount = normalized.groups.reduce((sum, g) => sum + g.rules.length, 0);
	const canAddGroup = !isLocked && (maxGroups === null || normalized.groups.length < maxGroups);

	const commit = (next: ConditionBuilderValue) => {
		if (isLocked) {
			return;
		}
		if (!isStandaloneControlled && hasControlWrapper) {
			setLocalValue(next);
		}
		props.onValueChange?.(resolvedName, next);
		rawProps.onChange?.(next);
		if (resolvedName !== '' && (hasControlWrapper || hostRef.current)) {
			notifyStandaloneHostChanged(hostRef.current, resolvedName);
		}
	};

	const handleSwitchMode = (nextMode: 'visual' | 'expression') => {
		if (nextMode === editorMode) {
			return;
		}
		if (nextMode === 'expression') {
			const serialized = serializeConditionToExpression(normalized);
			setExpressionLossy(serialized === null);
			setExpressionDraft(serialized ?? '');
			setExpressionError(null);
			setEditorMode('expression');
			return;
		}
		setExpressionError(null);
		setEditorMode('visual');
	};

	const handleApplyExpression = () => {
		if (isLocked) {
			return;
		}
		const trimmed = expressionDraft.trim();
		if (trimmed === '') {
			commit({ match: 'all', groups: [] });
			setExpressionError(null);
			setExpressionLossy(false);
			setEditorMode('visual');
			return;
		}
		const parsed = parseConditionStringToObject(trimmed);
		if (!parsed) {
			setExpressionError(
				t('conditionBuilder.expressionInvalid', 'Invalid condition expression syntax.'),
			);
			return;
		}
		commit(normalizeConditionBuilderValue(parsed, conditionFields));
		setExpressionError(null);
		setExpressionLossy(false);
		setEditorMode('visual');
	};

	const handleRootMatchChange = (mode: ConditionMatchMode) => {
		commit({ ...normalized, match: mode });
	};

	const handleClearAll = () => {
		commit({ match: 'all', groups: [] });
	};

	const handleAddGroup = () => {
		if (maxGroups !== null && normalized.groups.length >= maxGroups) {
			return;
		}
		const newGroup = createEmptyConditionGroup(nextId('grp'), nextId('rule'), sourceFields);
		commit({ ...normalized, groups: [...normalized.groups, newGroup] });
	};

	const handleDuplicateGroup = (groupId: string) => {
		if (maxGroups !== null && normalized.groups.length >= maxGroups) {
			return;
		}
		const idx = normalized.groups.findIndex((g) => g.id === groupId);
		if (idx < 0) return;
		const srcGroup = normalized.groups[idx]!;
		const cloned: ConditionGroupItem = {
			...srcGroup,
			id: nextId('grp'),
			rules: srcGroup.rules.map((r) => ({ ...r, id: nextId('rule') })),
		};
		const nextGroups = [...normalized.groups];
		nextGroups.splice(idx + 1, 0, cloned);
		commit({ ...normalized, groups: nextGroups });
	};

	const handleMoveGroup = (index: number, delta: -1 | 1) => {
		const targetIndex = index + delta;
		if (targetIndex < 0 || targetIndex >= normalized.groups.length) return;
		const nextGroups = [...normalized.groups];
		const [item] = nextGroups.splice(index, 1);
		if (!item) return;
		nextGroups.splice(targetIndex, 0, item);
		commit({ ...normalized, groups: nextGroups });
	};

	const handleRemoveGroup = (groupId: string) => {
		commit({
			...normalized,
			groups: normalized.groups.filter((g) => g.id !== groupId),
		});
	};

	const handleGroupMatchChange = (groupId: string, mode: ConditionMatchMode) => {
		commit({
			...normalized,
			groups: normalized.groups.map((g) => (g.id === groupId ? { ...g, match: mode } : g)),
		});
	};

	const handleGroupNegateToggle = (groupId: string) => {
		commit({
			...normalized,
			groups: normalized.groups.map((g) => {
				if (g.id !== groupId) return g;
				if (g.negate) {
					const { negate: _omit, ...rest } = g;
					return rest;
				}
				return { ...g, negate: true };
			}),
		});
	};

	const handleAddRule = (groupId: string) => {
		const targetGroup = normalized.groups.find((g) => g.id === groupId);
		if (maxRulesPerGroup !== null && targetGroup && targetGroup.rules.length >= maxRulesPerGroup) {
			return;
		}
		const newRule = createEmptyConditionRule(nextId('rule'), sourceFields);
		commit({
			...normalized,
			groups: normalized.groups.map((g) =>
				g.id === groupId ? { ...g, rules: [...g.rules, newRule] } : g,
			),
		});
	};

	const handleDuplicateRule = (groupId: string, ruleId: string) => {
		const targetGroup = normalized.groups.find((g) => g.id === groupId);
		if (maxRulesPerGroup !== null && targetGroup && targetGroup.rules.length >= maxRulesPerGroup) {
			return;
		}
		commit({
			...normalized,
			groups: normalized.groups.map((g) => {
				if (g.id !== groupId) return g;
				const idx = g.rules.findIndex((r) => r.id === ruleId);
				if (idx < 0) return g;
				const clone: ConditionRuleItem = { ...g.rules[idx]!, id: nextId('rule') };
				const nextRules = [...g.rules];
				nextRules.splice(idx + 1, 0, clone);
				return { ...g, rules: nextRules };
			}),
		});
	};

	const handleRemoveRule = (groupId: string, ruleId: string) => {
		commit({
			...normalized,
			groups: normalized.groups.map((g) =>
				g.id === groupId
					? { ...g, rules: g.rules.filter((r) => r.id !== ruleId) }
					: g,
			),
		});
	};

	const handleRuleFieldChange = (groupId: string, ruleId: string, nextFieldKey: string) => {
		const nextSpec = fieldMap.get(nextFieldKey);
		const allowedOperators = getOperatorsForConditionFieldType(
			nextSpec?.type ?? 'text',
			nextSpec?.operators,
		);
		const nextOperator = allowedOperators[0] ?? 'eq';
		const nextVal = defaultRuleValueForOperator(nextOperator, nextSpec?.type ?? 'text');

		commit({
			...normalized,
			groups: normalized.groups.map((g) =>
				g.id !== groupId
					? g
					: {
							...g,
							rules: g.rules.map((r) =>
								r.id === ruleId
									? {
											...r,
											field: nextFieldKey,
											operator: nextOperator,
											value: nextVal,
										}
									: r,
							),
						},
			),
		});
	};

	const handleRuleOperatorChange = (groupId: string, ruleId: string, nextOperator: string) => {
		commit({
			...normalized,
			groups: normalized.groups.map((g) =>
				g.id !== groupId
					? g
					: {
							...g,
							rules: g.rules.map((r) => {
								if (r.id !== ruleId) {
									return r;
								}
								const spec = fieldMap.get(r.field);
								const fieldType = spec?.type ?? 'text';
								let nextValue = r.value;

								if (UNARY_OPERATORS.has(nextOperator)) {
									nextValue = null;
								} else if (nextOperator === 'between') {
									nextValue =
										Array.isArray(r.value) && r.value.length === 2 ? r.value : ['', ''];
								} else if (nextOperator === 'in' || nextOperator === 'not_in') {
									nextValue = Array.isArray(r.value)
										? r.value
										: r.value !== null && r.value !== undefined && String(r.value).trim() !== ''
											? [r.value]
											: [];
								} else if (
									UNARY_OPERATORS.has(r.operator) ||
									r.operator === 'between' ||
									r.operator === 'in' ||
									r.operator === 'not_in'
								) {
									nextValue = defaultRuleValueForOperator(nextOperator, fieldType);
								}

								return { ...r, operator: nextOperator, value: nextValue };
							}),
						},
			),
		});
	};

	const handleRuleValueChange = (
		groupId: string,
		ruleId: string,
		nextValue: unknown,
		nextValueSource?: 'manual' | 'field',
	) => {
		commit({
			...normalized,
			groups: normalized.groups.map((g) =>
				g.id !== groupId
					? g
					: {
							...g,
							rules: g.rules.map((r) => {
								if (r.id !== ruleId) return r;
								const resolvedSource = nextValueSource ?? r.valueSource;
								if (resolvedSource === 'field') {
									return { ...r, value: nextValue, valueSource: 'field' as const };
								}
								const { valueSource: _omit, ...rest } = r;
								return { ...rest, value: nextValue };
							}),
						},
			),
		});
	};

	const hasExternalDomInput = Boolean(
		resolvedId !== '' &&
			typeof document !== 'undefined' &&
			document.getElementById(resolvedId)?.getAttribute('type') === 'hidden',
	);

	const visibleHeading =
		typeof props.heading === 'string' && props.heading.trim() !== ''
			? props.heading.trim()
			: props.showLabel && typeof props.label === 'string' && props.label.trim() !== ''
				? props.label.trim()
				: '';

	const regionAriaLabel =
		visibleHeading !== ''
			? visibleHeading
			: typeof props.label === 'string' && props.label.trim() !== ''
				? props.label.trim()
				: t('conditionBuilder.regionLabel', 'Condition builder');

	const ruleGridClass =
		layout === 'compact'
			? 'grid grid-cols-1 gap-2'
			: layout === 'inline'
				? 'grid grid-cols-1 gap-2 sm:grid-cols-[minmax(160px,1.2fr)_minmax(145px,1fr)_minmax(180px,1.4fr)_auto] sm:items-center'
				: 'grid grid-cols-1 gap-2 @[560px]:grid-cols-[minmax(160px,1.2fr)_minmax(145px,1fr)_minmax(180px,1.4fr)_auto] @[560px]:items-center';

	const rootConnectorText =
		normalized.match === 'any'
			? t('conditionBuilder.connectorOr', 'OR')
			: t('conditionBuilder.connectorAnd', 'AND');

	const emptyStateText =
		typeof props.emptyMessage === 'string' && props.emptyMessage.trim() !== ''
			? props.emptyMessage.trim()
			: t(
					'conditionBuilder.emptyGroups',
					'No condition groups configured yet. Add a group to define matching rules.',
				);

	return (
		<div
			ref={hostRef}
			role="group"
			aria-label={regionAriaLabel}
			data-rw-control="condition_builder"
			data-rw-layout={layout}
			aria-invalid={hasError ? true : undefined}
			aria-describedby={props.describedBy}
			className={cn(
				'@container rw-condition-builder min-w-0 space-y-3 rounded-lg border border-border bg-card p-3',
				hasError && 'border-destructive',
			)}
		>
			{!props.inlinePortal && !hasExternalDomInput && resolvedName !== '' ? (
				<input
					type="hidden"
					name={resolvedName}
					value={JSON.stringify(normalized)}
				/>
			) : null}

			{visibleHeading !== '' ? (
				<div data-rw-condition-heading="1" className="text-xs font-semibold text-foreground">
					{visibleHeading}
				</div>
			) : null}

			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
				<div className="flex flex-wrap items-center gap-2">
					{editorMode === 'visual' ? (
						<>
							<span className="text-xs font-medium text-muted-foreground">
								{t('conditionBuilder.rootMatchLabel', 'Match groups')}
							</span>
							<SegmentedMatchToggle
								value={normalized.match}
								disabled={isLocked}
								ariaLabel={t('conditionBuilder.rootMatchLabel', 'Match groups')}
								onChange={handleRootMatchChange}
							/>
						</>
					) : null}
					<Badge variant="outline" className="text-[11px] font-normal tabular-nums">
						{normalized.groups.length}{' '}
						{normalized.groups.length === 1
							? t('conditionBuilder.groupSingular', 'group')
							: t('conditionBuilder.groupPlural', 'groups')}{' '}
						· {totalRulesCount}{' '}
						{totalRulesCount === 1
							? t('conditionBuilder.ruleSingular', 'rule')
							: t('conditionBuilder.rulePlural', 'rules')}
					</Badge>
				</div>

				<div className="flex flex-wrap items-center gap-1.5">
					{allowRawExpression ? (
						<div
							role="group"
							aria-label={t('conditionBuilder.modeAriaLabel', 'Condition editor mode')}
							data-rw-condition-mode-toggle="1"
							className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5"
						>
							<button
								type="button"
								aria-pressed={editorMode === 'visual'}
								onClick={() => handleSwitchMode('visual')}
								className={cn(
									'rounded-[4px] px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									editorMode === 'visual'
										? 'bg-background text-foreground shadow-xs'
										: 'text-muted-foreground hover:text-foreground',
								)}
							>
								{t('conditionBuilder.modeVisual', 'Visual')}
							</button>
							<button
								type="button"
								aria-pressed={editorMode === 'expression'}
								onClick={() => handleSwitchMode('expression')}
								className={cn(
									'rounded-[4px] px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									editorMode === 'expression'
										? 'bg-background text-foreground shadow-xs'
										: 'text-muted-foreground hover:text-foreground',
								)}
							>
								{t('conditionBuilder.modeExpression', 'Expression')}
							</button>
						</div>
					) : null}
					{editorMode === 'visual' && normalized.groups.length > 0 && !isLocked ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleClearAll}
							className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
						>
							<DynamicIcon name="trash-2" className="size-3.5" />
							<span>{t('conditionBuilder.clearAll', 'Clear all')}</span>
						</Button>
					) : null}
					{editorMode === 'visual' ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={!canAddGroup}
							onClick={handleAddGroup}
							className="h-8 gap-1 text-xs"
						>
							<DynamicIcon name="plus" className="size-3.5" />
							<span>{t('conditionBuilder.addGroup', 'Add group')}</span>
						</Button>
					) : null}
				</div>
			</div>

			{allowRawExpression && editorMode === 'expression' ? (
				<div data-rw-condition-expression-editor="1" className="space-y-2">
					{expressionLossy ? (
						<div className="rounded-md border border-amber-500/45 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-300">
							{t(
								'conditionBuilder.expressionUnsupported',
								'Some advanced rules (such as NOT groups, ranges, or OR inside ALL) cannot be represented in flat expression syntax. Applying a new expression will overwrite them.',
							)}
						</div>
					) : null}
					<textarea
						rows={3}
						disabled={isLocked}
						value={expressionDraft}
						aria-label={t('conditionBuilder.expressionLabel', 'Condition expression')}
						placeholder={t(
							'conditionBuilder.expressionPlaceholder',
							'status=active, subtotal>=100; tier=vip|gold',
						)}
						onChange={(e) => {
							setExpressionDraft(e.target.value);
							if (expressionError) setExpressionError(null);
						}}
						onKeyDown={(e) => {
							if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
								e.preventDefault();
								handleApplyExpression();
							}
						}}
						className="w-full rounded-md border border-input bg-background px-2.5 py-2 font-mono text-xs text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
					/>
					{expressionError ? (
						<p className="text-xs text-destructive">{expressionError}</p>
					) : null}
					<div className="flex flex-wrap items-center justify-between gap-2">
						<span className="text-[11px] text-muted-foreground">
							{t(
								'conditionBuilder.expressionHint',
								'Separate AND clauses with commas (,) and OR branches with semicolons (;).',
							)}
						</span>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							disabled={isLocked}
							onClick={handleApplyExpression}
							className="h-8 text-xs"
						>
							{t('conditionBuilder.applyExpression', 'Apply expression')}
						</Button>
					</div>
				</div>
			) : (
				<>

			{showSummary && summaryText !== '' ? (
				<div
					data-rw-condition-summary="1"
					className="flex items-start gap-2 rounded-md border border-border/80 bg-muted/35 px-2.5 py-2 text-xs"
				>
					<Badge variant="secondary" className="mt-0.5 shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase">
						{t('conditionBuilder.summaryIf', 'IF')}
					</Badge>
					<span className="font-mono text-[11px] leading-relaxed text-foreground/90 break-words">
						{summaryText}
					</span>
				</div>
			) : null}

			{normalized.groups.length === 0 ? (
				<div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-5 text-center text-xs text-muted-foreground">
					{emptyStateText}
				</div>
			) : (
				<div className="space-y-2.5">
					{normalized.groups.map((group, groupIndex) => {
						const canAddRule =
							!isLocked && (maxRulesPerGroup === null || group.rules.length < maxRulesPerGroup);

						return (
							<React.Fragment key={group.id}>
								{groupIndex > 0 ? (
									<div className="flex items-center gap-2 py-0.5" aria-hidden="true">
										<div className="h-px flex-1 bg-border" />
										<span className="rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
											{rootConnectorText}
										</span>
										<div className="h-px flex-1 bg-border" />
									</div>
								) : null}

								<fieldset
									aria-label={t(
										'conditionBuilder.groupLegend',
										{ index: groupIndex + 1 },
										'Condition group {index}',
									)}
									className={cn(
										'min-w-0 rounded-md border p-2.5 transition-colors',
										group.negate
											? 'border-amber-500/45 bg-amber-500/5'
											: 'border-border/80 bg-muted/20',
									)}
								>
									<legend className="sr-only">
										{t(
											'conditionBuilder.groupLegend',
											{ index: groupIndex + 1 },
											'Condition group {index}',
										)}
									</legend>
									<div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
										<div className="flex flex-wrap items-center gap-2">
											<Badge variant="secondary" className="text-[11px] font-medium tabular-nums">
												{t('conditionBuilder.groupTitle', { index: groupIndex + 1 }, 'Group #{index}')}
											</Badge>
											{allowNegate ? (
												<button
													type="button"
													disabled={isLocked}
													aria-pressed={Boolean(group.negate)}
													aria-label={t(
														'conditionBuilder.negateGroupAria',
														{ index: groupIndex + 1 },
														'Negate group {index}',
													)}
													onClick={() => handleGroupNegateToggle(group.id)}
													className={cn(
														'rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
														group.negate
															? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300'
															: 'border-border bg-background text-muted-foreground hover:text-foreground',
													)}
												>
													{t('conditionBuilder.notBadge', 'NOT')}
												</button>
											) : null}
											<span className="text-[11px] text-muted-foreground">
												{t('conditionBuilder.groupMatchLabel', 'Match rules')}
											</span>
											<SegmentedMatchToggle
												size="xs"
												value={group.match}
												disabled={isLocked}
												ariaLabel={t('conditionBuilder.groupMatchLabel', 'Match rules')}
												onChange={(mode) => handleGroupMatchChange(group.id, mode)}
											/>
										</div>

										<div className="flex flex-wrap items-center gap-1">
											{normalized.groups.length > 1 && !isLocked ? (
												<>
													<Button
														type="button"
														variant="ghost"
														size="sm"
														disabled={groupIndex === 0}
														aria-label={t(
															'conditionBuilder.moveGroupUpAria',
															{ index: groupIndex + 1 },
															'Move group {index} up',
														)}
														onClick={() => handleMoveGroup(groupIndex, -1)}
														className="h-7 w-7 p-0 text-muted-foreground"
													>
														<DynamicIcon name="chevron-up" className="size-3.5" />
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="sm"
														disabled={groupIndex === normalized.groups.length - 1}
														aria-label={t(
															'conditionBuilder.moveGroupDownAria',
															{ index: groupIndex + 1 },
															'Move group {index} down',
														)}
														onClick={() => handleMoveGroup(groupIndex, 1)}
														className="h-7 w-7 p-0 text-muted-foreground"
													>
														<DynamicIcon name="chevron-down" className="size-3.5" />
													</Button>
												</>
											) : null}
											<Button
												type="button"
												variant="ghost"
												size="sm"
												disabled={!canAddGroup}
												aria-label={t(
													'conditionBuilder.duplicateGroupAria',
													{ index: groupIndex + 1 },
													'Duplicate group {index}',
												)}
												onClick={() => handleDuplicateGroup(group.id)}
												className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
											>
												<DynamicIcon name="copy" className="size-3.5" />
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												disabled={!canAddRule}
												onClick={() => handleAddRule(group.id)}
												className="h-7 gap-1 px-2 text-xs"
											>
												<DynamicIcon name="plus" className="size-3" />
												<span>{t('conditionBuilder.addRule', 'Add rule')}</span>
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												disabled={isLocked}
												aria-label={t(
													'conditionBuilder.removeGroupAria',
													{ index: groupIndex + 1 },
													'Remove condition group {index}',
												)}
												onClick={() => handleRemoveGroup(group.id)}
												className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
											>
												<DynamicIcon name="trash-2" className="size-3.5" />
											</Button>
										</div>
									</div>

									{group.rules.length === 0 ? (
										<div className="rounded border border-dashed border-border/70 bg-background/60 px-3 py-3 text-center text-xs text-muted-foreground">
											{t('conditionBuilder.emptyGroupRules', 'No rules in this group. Add a rule to compare values.')}
										</div>
									) : (
										<div className="space-y-2">
											{group.rules.map((rule, ruleIndex) => {
												const spec = fieldMap.get(rule.field);
												const operators = getOperatorsForConditionFieldType(
													spec?.type ?? 'text',
													spec?.operators,
												);
												const fieldInputId = `${baseId}-${group.id}-${rule.id}-field`;
												const opSelectId = `${baseId}-${group.id}-${rule.id}-op`;

												return (
													<div
														key={rule.id}
														className={cn(
															ruleGridClass,
															'rounded-md border border-border/70 bg-background p-2',
														)}
													>
														<div className="min-w-0">
															<label
																htmlFor={fieldInputId}
																className="mb-1 block text-[11px] font-medium text-muted-foreground @[560px]:sr-only"
															>
																{t('conditionBuilder.fieldLabel', 'Field')}
															</label>
															{sourceFields.length > 0 ? (
																<ConditionFieldPicker
																	id={fieldInputId}
																	value={rule.field}
																	fields={sourceFields}
																	disabled={isLocked}
																	ariaLabel={t('conditionBuilder.fieldLabel', 'Field')}
																	placeholder={t('conditionBuilder.selectFieldPlaceholder', 'Select field...')}
																	onChange={(nextKey) =>
																		handleRuleFieldChange(group.id, rule.id, nextKey)
																	}
																/>
															) : (
																<Input
																	id={fieldInputId}
																	type="text"
																	value={rule.field}
																	disabled={isLocked}
																	aria-label={t('conditionBuilder.fieldLabel', 'Field')}
																	placeholder={t('conditionBuilder.fieldKeyPlaceholder', 'field_key')}
																	className="h-8 text-xs"
																	onChange={(e) =>
																		handleRuleFieldChange(group.id, rule.id, e.target.value)
																	}
																/>
															)}
														</div>

														<div className="min-w-0">
															<label
																htmlFor={opSelectId}
																className="mb-1 block text-[11px] font-medium text-muted-foreground @[560px]:sr-only"
															>
																{t('conditionBuilder.operatorLabel', 'Operator')}
															</label>
															<Select
																id={opSelectId}
																value={rule.operator}
																disabled={isLocked}
																className="h-8 text-xs"
																onChange={(e) =>
																	handleRuleOperatorChange(group.id, rule.id, e.target.value)
																}
															>
																{operators.map((op) => (
																	<option key={op} value={op}>
																		{getOperatorLabel(op)}
																	</option>
																))}
															</Select>
														</div>

														<div className="min-w-0">
															<span className="mb-1 block text-[11px] font-medium text-muted-foreground @[560px]:sr-only">
																{t('conditionBuilder.valueLabel', 'Value')}
															</span>
															<ConditionValueEditor
																rule={rule}
																spec={spec}
																allFields={conditionFields}
																allowFieldComparison={allowFieldComparison}
																disabled={isLocked}
																onChange={(nextVal, nextSource) =>
																	handleRuleValueChange(group.id, rule.id, nextVal, nextSource)
																}
															/>
														</div>

														<div className="flex items-center justify-end gap-0.5">
															<Button
																type="button"
																variant="ghost"
																size="sm"
																disabled={!canAddRule}
																aria-label={t(
																	'conditionBuilder.duplicateRuleAria',
																	{ index: ruleIndex + 1 },
																	'Duplicate rule {index}',
																)}
																onClick={() => handleDuplicateRule(group.id, rule.id)}
																className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
															>
																<DynamicIcon name="copy" className="size-3.5" />
															</Button>
															<Button
																type="button"
																variant="ghost"
																size="sm"
																disabled={isLocked}
																aria-label={t(
																	'conditionBuilder.removeRuleAria',
																	{ rule: ruleIndex + 1, group: groupIndex + 1 },
																	'Remove rule {rule} in group {group}',
																)}
																onClick={() => handleRemoveRule(group.id, rule.id)}
																className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
															>
																<DynamicIcon name="x" className="size-3.5" />
															</Button>
														</div>
													</div>
												);
											})}
										</div>
									)}
								</fieldset>
							</React.Fragment>
						);
					})}
				</div>
			)}
			</>
			)}
		</div>
	);
}

export const ConditionBuilderFieldControl = ConditionBuilderField;
export const ConditionBuilder = ConditionBuilderField;
