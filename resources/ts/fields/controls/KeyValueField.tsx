import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Button, Input, moveArrayItem, SortableHandle, SortableStatusRegion, useSortableList } from '../../ui';

export interface KeyValuePair {
	_rowId?: string;
	key: string;
	value: string;
}

export interface KeyValueFieldProps {
	id?: string;
	name?: string;
	scopePrefix?: string;
	value?: unknown;
	rows?: KeyValuePair[];
	onChange?: (next: Record<string, string>) => void;
	keyPlaceholder?: string;
	keyLabel?: string;
	valuePlaceholder?: string;
	valueLabel?: string;
	addLabel?: string;
	removeLabel?: string;
	minItems?: number;
	maxItems?: number;
	keyPattern?: string | null;
	keyPatternMessage?: string | null;
	allowEmptyValues?: boolean;
	required?: boolean;
	readOnly?: boolean;
	disabled?: boolean;
	error?: string;
	isIslandHost?: boolean;
	props?: Record<string, unknown>;
}

type RowFocusTarget = {
	rowId: string;
	control: 'key' | 'val' | 'up' | 'down';
};

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const NESTED_QUANTIFIER_RE = /(?:\+|\*|\{[0-9,]+\})\??\s*\)\s*(?:\+|\*|\?|\{[0-9,]+\})/;

function sanitizeRawKeyText(raw: string): string {
	return raw.replace(/[\x00-\x1F\x7F]+/g, '');
}

function isReservedKey(raw: string): boolean {
	const cleaned = sanitizeRawKeyText(raw).trim().toLowerCase();
	return cleaned !== '' && RESERVED_KEYS.has(cleaned);
}

function compileKeyRegex(rawPattern?: string | null): RegExp | null {
	if (!rawPattern || typeof rawPattern !== 'string') {
		return null;
	}
	const trimmed = rawPattern.trim();
	if (!trimmed || trimmed.length > 512 || trimmed.includes('\0')) {
		return null;
	}
	const delimited = trimmed.match(/^([/#~!])([\s\S]*)\1([gimsuy]*)$/);
	const body = delimited ? (delimited[2] ?? '') : trimmed;
	if (!body || NESTED_QUANTIFIER_RE.test(body)) {
		return null;
	}
	try {
		if (delimited) {
			const cleanFlags = (delimited[3] ?? '').replace(/g|y/g, '');
			return new RegExp(body, cleanFlags);
		}
		return new RegExp(trimmed, 'u');
	} catch {
		return null;
	}
}

function parseDelimitedKeyValueLines(rawText: string, makeRowId: () => string): KeyValuePair[] {
	const parsed: KeyValuePair[] = [];
	for (const rawLine of rawText.split(/\r\n|\r|\n/)) {
		const trimmedLine = rawLine.trim();
		if (!trimmedLine || trimmedLine.startsWith('#')) {
			continue;
		}
		const tabIdx = rawLine.indexOf('\t');
		let k = '';
		let v = '';
		if (tabIdx > 0) {
			k = sanitizeRawKeyText(rawLine.slice(0, tabIdx)).trim();
			v = rawLine.slice(tabIdx + 1).trim();
		} else {
			const colonIdx = trimmedLine.indexOf(':');
			const eqIdx = trimmedLine.indexOf('=');
			const splitIdx =
				colonIdx !== -1 && eqIdx !== -1
					? Math.min(colonIdx, eqIdx)
					: colonIdx !== -1
						? colonIdx
						: eqIdx;
			if (splitIdx <= 0) {
				continue;
			}
			k = sanitizeRawKeyText(trimmedLine.slice(0, splitIdx)).trim();
			v = trimmedLine.slice(splitIdx + 1).trim();
		}
		if (k !== '' && !isReservedKey(k)) {
			parsed.push({ _rowId: makeRowId(), key: k, value: v });
		}
	}
	return parsed;
}

function buildSafeMap(pairs: readonly KeyValuePair[], allowEmptyValues: boolean): Record<string, string> {
	const out: Record<string, string> = {};
	for (const pair of pairs) {
		const trimmedKey = sanitizeRawKeyText(pair.key).trim();
		if (trimmedKey === '' || isReservedKey(trimmedKey)) {
			continue;
		}
		if (!allowEmptyValues && pair.value.trim() === '') {
			continue;
		}
		Object.defineProperty(out, trimmedKey, {
			value: pair.value,
			enumerable: true,
			configurable: true,
			writable: true,
		});
	}
	return out;
}

function serializeCanonicalMap(map: Record<string, unknown>): string {
	const entries = Object.getOwnPropertyNames(map)
		.filter((k) => k.trim() !== '' && !isReservedKey(k))
		.map((k) => [k.trim(), String(map[k] ?? '')] as const);
	return JSON.stringify(entries);
}

export const KeyValueFieldControl: React.FC<KeyValueFieldProps> = (rawProps) => {
	const { t } = useTranslations();
	const reactUid = useId();
	const onChange = rawProps.onChange;
	const resolved =
		rawProps.props && typeof rawProps.props === 'object' ? { ...rawProps, ...rawProps.props } : rawProps;

	const rootRef = useRef<HTMLDivElement | null>(null);
	const [detectedIslandHost, setDetectedIslandHost] = useState<boolean>(() =>
		Boolean(rawProps.isIslandHost ?? resolved.isIslandHost)
	);
	const isIslandHost = Boolean(rawProps.isIslandHost ?? resolved.isIslandHost) || detectedIslandHost;

	const baseName = String(resolved.name || '').trim();
	const inputName = baseName;
	const fieldInputId = String(rawProps.id || resolved.id || (inputName ? `Inputfield_${inputName}` : `kv_${reactUid}`));
	const firstKeyInputId = isIslandHost ? `${fieldInputId}_key_0` : fieldInputId;

	const defaultKeyText = t('keyvalue.key', 'Key');
	const defaultValText = t('keyvalue.value', 'Value');
	const keyHeaderLabel =
		resolved.keyLabel && resolved.keyLabel !== 'Key'
			? resolved.keyLabel
			: resolved.keyPlaceholder && resolved.keyPlaceholder !== 'Key' && !resolved.keyLabel
				? resolved.keyPlaceholder
				: defaultKeyText;
	const valueHeaderLabel =
		resolved.valueLabel && resolved.valueLabel !== 'Value'
			? resolved.valueLabel
			: resolved.valuePlaceholder && resolved.valuePlaceholder !== 'Value' && !resolved.valueLabel
				? resolved.valuePlaceholder
				: defaultValText;
	const keyPlaceholder =
		resolved.keyPlaceholder && resolved.keyPlaceholder !== 'Key'
			? resolved.keyPlaceholder
			: keyHeaderLabel;
	const valuePlaceholder =
		resolved.valuePlaceholder && resolved.valuePlaceholder !== 'Value'
			? resolved.valuePlaceholder
			: valueHeaderLabel;
	const addLabel =
		resolved.addLabel && resolved.addLabel !== 'Add Row'
			? resolved.addLabel
			: t('keyvalue.addRow', 'Add Row');
	const customRemoveLabel =
		resolved.removeLabel && resolved.removeLabel !== 'Remove row' ? resolved.removeLabel : '';

	const maxItems = typeof resolved.maxItems === 'number' && resolved.maxItems > 0 ? resolved.maxItems : 0;
	const allowEmptyValues = resolved.allowEmptyValues !== false;
	const isReadOnly = Boolean(rawProps.readOnly ?? resolved.readOnly);
	const isDisabled = Boolean(rawProps.disabled ?? resolved.disabled ?? isReadOnly);
	const rawConfiguredPattern = typeof resolved.keyPattern === 'string' ? resolved.keyPattern.trim() : '';
	const keyRegex = useMemo(() => compileKeyRegex(rawConfiguredPattern), [rawConfiguredPattern]);
	const hasInvalidKeyRegex = rawConfiguredPattern !== '' && keyRegex === null;

	const seqRef = useRef(0);
	const nextRowId = useCallback(() => `kv_${++seqRef.current}`, []);
	const keyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
	const valInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
	const moveUpRefs = useRef<Record<string, HTMLButtonElement | null>>({});
	const moveDownRefs = useRef<Record<string, HTMLButtonElement | null>>({});
	const pendingFocusRef = useRef<RowFocusTarget | null>(null);

	const parseIncomingPairs = useCallback(
		(rawVal: unknown, rawRows?: KeyValuePair[], disabledState = isDisabled): KeyValuePair[] => {
			let normalizedVal = rawVal;
			if (typeof normalizedVal === 'string') {
				const trimmed = normalizedVal.trim();
				if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
					try {
						normalizedVal = JSON.parse(trimmed);
					} catch {
						normalizedVal = {};
					}
				} else if (trimmed !== '') {
					const parsedLines = parseDelimitedKeyValueLines(trimmed, nextRowId);
					if (parsedLines.length > 0) {
						return parsedLines;
					}
				}
			}

			if (Array.isArray(normalizedVal) && normalizedVal.length > 0) {
				const first = normalizedVal[0];
				if (first && typeof first === 'object' && ('key' in first || 'k' in first)) {
					return normalizedVal
						.map((rawItem: unknown) => {
							const item = (typeof rawItem === 'object' && rawItem !== null
								? rawItem
								: {}) as Record<string, unknown>;
							return {
								_rowId: typeof item._rowId === 'string' && item._rowId ? item._rowId : nextRowId(),
								key: String(item.key ?? item.k ?? ''),
								value: String(item.value ?? item.val ?? item.v ?? ''),
							};
						})
						.filter((row) => !isReservedKey(row.key));
				}
				if (Array.isArray(rawRows) && rawRows.length === normalizedVal.length) {
					return rawRows.map((item) => ({
						_rowId: item?._rowId || nextRowId(),
						key: String(item?.key ?? ''),
						value: String(item?.value ?? ''),
					}));
				}
				// Sequential numeric PHP array fallback (`['0' => 'No', '1' => 'Yes']` encoded as JSON list)
				return normalizedVal.map((item: unknown, idx: number) => ({
					_rowId: nextRowId(),
					key: String(idx),
					value: String(item ?? ''),
				}));
			}

			if (normalizedVal && typeof normalizedVal === 'object' && !Array.isArray(normalizedVal)) {
				const ownKeys = Object.getOwnPropertyNames(normalizedVal).filter((k) => !isReservedKey(k));
				if (ownKeys.length > 0) {
					return ownKeys.map((k) => {
						const rawEntryVal = (normalizedVal as Record<string, unknown>)[k];
						return {
							_rowId: nextRowId(),
							key: String(k),
							value:
								typeof rawEntryVal === 'boolean'
									? rawEntryVal
										? '1'
										: '0'
									: String(rawEntryVal ?? ''),
						};
					});
				}
				return disabledState ? [] : [{ _rowId: nextRowId(), key: '', value: '' }];
			}

			if (Array.isArray(rawRows) && rawRows.length > 0 && rawVal === undefined) {
				return rawRows.map((item) => ({
					_rowId: item?._rowId || nextRowId(),
					key: String(item?.key ?? ''),
					value: String(item?.value ?? ''),
				}));
			}

			return disabledState ? [] : [{ _rowId: nextRowId(), key: '', value: '' }];
		},
		[isDisabled, nextRowId]
	);

	const [pairs, setPairs] = useState<KeyValuePair[]>(() =>
		parseIncomingPairs(resolved.value, resolved.rows, isDisabled)
	);
	const lastEmittedSigRef = useRef<string>(
		serializeCanonicalMap(buildSafeMap(pairs, allowEmptyValues))
	);

	useEffect(() => {
		const parent = rootRef.current?.parentElement;
		if (parent?.classList.contains('pw-inertia-inputfield-island')) {
			setDetectedIslandHost(true);
		}
	}, []);

	useEffect(() => {
		if (!isIslandHost || isDisabled || typeof document === 'undefined' || !fieldInputId) {
			return;
		}
		const selector =
			typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
				? `label[for="${CSS.escape(fieldInputId)}"]`
				: `label[for="${fieldInputId.replace(/"/g, '\\"')}"]`;
		const labels = Array.from(document.querySelectorAll<HTMLLabelElement>(selector));
		if (labels.length === 0) {
			return;
		}
		const onLabelClick = (ev: MouseEvent) => {
			const firstRowId = pairs[0]?._rowId;
			const targetEl = firstRowId ? keyInputRefs.current[firstRowId] : null;
			if (targetEl) {
				ev.preventDefault();
				targetEl.focus();
			}
		};
		labels.forEach((lbl) => lbl.addEventListener('click', onLabelClick));
		return () => {
			labels.forEach((lbl) => lbl.removeEventListener('click', onLabelClick));
		};
	}, [fieldInputId, isDisabled, isIslandHost, pairs]);

	useEffect(() => {
		const nextCandidate = parseIncomingPairs(resolved.value, resolved.rows, isDisabled);
		const incomingSig = serializeCanonicalMap(buildSafeMap(nextCandidate, allowEmptyValues));
		if (incomingSig === lastEmittedSigRef.current) {
			return;
		}
		lastEmittedSigRef.current = incomingSig;
		setPairs(nextCandidate);
	}, [resolved.value, resolved.rows, isDisabled, allowEmptyValues, parseIncomingPairs]);

	useEffect(() => {
		const target = pendingFocusRef.current;
		if (!target) {
			return;
		}
		pendingFocusRef.current = null;
		const el =
			target.control === 'val'
				? valInputRefs.current[target.rowId]
				: target.control === 'up'
					? (moveUpRefs.current[target.rowId] ?? moveDownRefs.current[target.rowId] ?? keyInputRefs.current[target.rowId])
					: target.control === 'down'
						? (moveDownRefs.current[target.rowId] ?? moveUpRefs.current[target.rowId] ?? keyInputRefs.current[target.rowId])
						: keyInputRefs.current[target.rowId];
		if (el && typeof el.focus === 'function') {
			el.focus();
		}
	}, [pairs]);

	const emit = useCallback(
		(nextPairs: KeyValuePair[]) => {
			const map = buildSafeMap(nextPairs, allowEmptyValues);
			lastEmittedSigRef.current = serializeCanonicalMap(map);
			setPairs(nextPairs);
			onChange?.(map);
		},
		[allowEmptyValues, onChange]
	);

	const duplicateKeySet = useMemo(() => {
		const counts = new Map<string, number>();
		for (const p of pairs) {
			const trimmed = sanitizeRawKeyText(p.key).trim();
			if (trimmed !== '') {
				counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
			}
		}
		const dupes = new Set<string>();
		for (const [k, count] of counts.entries()) {
			if (count > 1) {
				dupes.add(k);
			}
		}
		return dupes;
	}, [pairs]);

	const getRowKeyError = useCallback(
		(rawKey: string): string | null => {
			const trimmed = sanitizeRawKeyText(rawKey).trim();
			if (trimmed === '') {
				return null;
			}
			if (isReservedKey(trimmed)) {
				return t('keyvalue.reservedKey', { key: trimmed }, '"{key}" is a reserved key name.');
			}
			if (duplicateKeySet.has(trimmed)) {
				return t(
					'keyvalue.duplicateKey',
					{ key: trimmed },
					'Duplicate key "{key}". Each key must be unique.'
				);
			}
			if (hasInvalidKeyRegex || (keyRegex && !keyRegex.test(trimmed))) {
				return (
					(resolved.keyPatternMessage && resolved.keyPatternMessage.trim()) ||
					t(
						'keyvalue.invalidKeyPattern',
						{ key: trimmed },
						'"{key}" does not match the required key format.'
					)
				);
			}
			return null;
		},
		[duplicateKeySet, hasInvalidKeyRegex, keyRegex, resolved.keyPatternMessage, t]
	);

	const sortable = useSortableList<KeyValuePair>({
		items: pairs,
		getId: (p) => p._rowId || p.key,
		getLabel: (p, idx) =>
			p.key.trim() ||
			t('keyvalue.keyForRow', { label: keyHeaderLabel, index: idx + 1 }, '{label} for row {index}'),
		axis: 'vertical',
		disabled: isDisabled || isReadOnly,
		onReorder: (next) => emit(next),
	});

	const handleAddRow = useCallback(() => {
		if (isDisabled || (maxItems > 0 && pairs.length >= maxItems)) {
			return;
		}
		const newId = nextRowId();
		pendingFocusRef.current = { rowId: newId, control: 'key' };
		setPairs((prev) => [...prev, { _rowId: newId, key: '', value: '' }]);
	}, [isDisabled, maxItems, nextRowId, pairs.length]);

	const handleRemoveRow = useCallback(
		(idx: number) => {
			if (isDisabled) {
				return;
			}
			const remaining = pairs.filter((_, i) => i !== idx);
			if (remaining.length > 0) {
				const focusTarget = remaining[Math.min(idx, remaining.length - 1)];
				if (focusTarget?._rowId) {
					pendingFocusRef.current = { rowId: focusTarget._rowId, control: 'key' };
				}
				emit(remaining);
			} else {
				const freshId = nextRowId();
				pendingFocusRef.current = { rowId: freshId, control: 'key' };
				emit([{ _rowId: freshId, key: '', value: '' }]);
			}
		},
		[emit, isDisabled, nextRowId, pairs]
	);

	const handleMoveRow = useCallback(
		(fromIdx: number, toIdx: number, focusControl: 'key' | 'val' | 'up' | 'down' = 'key') => {
			if (isDisabled || toIdx < 0 || toIdx >= pairs.length || fromIdx === toIdx) {
				return;
			}
			const targetRow = pairs[fromIdx];
			if (targetRow?._rowId) {
				pendingFocusRef.current = { rowId: targetRow._rowId, control: focusControl };
			}
			emit(moveArrayItem(pairs, fromIdx, toIdx));
		},
		[emit, isDisabled, pairs]
	);

	const handleBulkPaste = useCallback(
		(e: React.ClipboardEvent<HTMLInputElement>, rowIdx: number) => {
			if (isDisabled) {
				return;
			}
			const clipText = e.clipboardData?.getData('text/plain') ?? '';
			if (!clipText) {
				return;
			}
			const trimmedClip = clipText.trim();
			const isStructuredClip =
				clipText.includes('\n') ||
				clipText.includes('\r') ||
				clipText.includes('\t') ||
				(trimmedClip.startsWith('{') && trimmedClip.endsWith('}')) ||
				(trimmedClip.startsWith('[') && trimmedClip.endsWith(']'));
			if (!isStructuredClip) {
				return;
			}

			let pastedRows: KeyValuePair[] = [];
			if (
				(trimmedClip.startsWith('{') && trimmedClip.endsWith('}')) ||
				(trimmedClip.startsWith('[') && trimmedClip.endsWith(']'))
			) {
				try {
					const parsedJson = JSON.parse(trimmedClip);
					pastedRows = parseIncomingPairs(parsedJson, undefined, true);
				} catch {
					pastedRows = [];
				}
			} else {
				pastedRows = parseDelimitedKeyValueLines(clipText, nextRowId);
			}

			if (pastedRows.length === 0) {
				return;
			}

			e.preventDefault();
			const currentRow = pairs[rowIdx];
			const isCurrentBlank =
				currentRow !== undefined && currentRow.key.trim() === '' && currentRow.value.trim() === '';
			const before = isCurrentBlank ? pairs.slice(0, rowIdx) : pairs.slice(0, rowIdx + 1);
			const after = pairs.slice(rowIdx + 1);
			let merged = [...before, ...pastedRows, ...after];
			if (maxItems > 0 && merged.length > maxItems) {
				merged = merged.slice(0, maxItems);
			}
			const lastInserted = pastedRows[Math.min(pastedRows.length - 1, Math.max(0, merged.length - before.length - 1))];
			if (lastInserted?._rowId) {
				pendingFocusRef.current = { rowId: lastInserted._rowId, control: 'val' };
			}
			emit(merged);
		},
		[emit, isDisabled, maxItems, nextRowId, pairs, parseIncomingPairs]
	);

	const filledCount = useMemo(
		() => pairs.filter((r) => r.key.trim() !== '' && !isReservedKey(r.key)).length,
		[pairs]
	);

	if (isReadOnly) {
		const filledRows = pairs.filter((r) => r.key.trim() !== '');
		if (filledRows.length === 0) {
			return (
				<Badge
					variant="outline"
					className="text-muted-foreground"
					aria-label={t('keyvalue.emptyPairs', 'No key-value pairs')}
					data-kv-readonly={inputName || 'kv'}
				>
					—
				</Badge>
			);
		}

		return (
			<div
				className="flex flex-wrap items-center gap-1.5"
				data-kv-readonly={inputName || 'kv'}
			>
				{filledRows.map((row, idx) => (
					<Badge
						key={row._rowId || `${row.key}_${idx}`}
						variant="secondary"
						className="max-w-full gap-1.5 px-2.5 py-0.5 text-xs font-normal"
					>
						<span className="shrink-0 font-mono font-semibold text-foreground">{row.key}:</span>
						<span className="truncate text-muted-foreground">{row.value}</span>
					</Badge>
				))}
			</div>
		);
	}

	const canReorder = !isDisabled && pairs.length > 1;
	const canAddMore = !isDisabled && (maxItems === 0 || pairs.length < maxItems);
	const pairCountText =
		maxItems > 0
			? t(
					'keyvalue.pairCountMax',
					{
						count: filledCount,
						max: maxItems,
					},
					'{count} / {max}'
				)
			: filledCount > 0
				? t('keyvalue.pairCount', { count: filledCount }, '{count} pair(s)')
				: '';

	return (
		<div
			ref={rootRef}
			className="@container/rw-kv min-w-0 space-y-2"
			data-rw-control="key-value"
			data-rw-kv-reactive={inputName || undefined}
			data-kv-field={baseName || undefined}
		>
			<SortableStatusRegion message={sortable.statusMessage} />
			{inputName && !isDisabled ? (
				<input type="hidden" name={`${inputName}_present`} value="1" />
			) : null}

			{pairs.length > 0 ? (
				<div className="hidden @md/rw-kv:flex items-center gap-2 px-1 text-[11px] font-medium text-muted-foreground select-none">
					{canReorder ? <span className="w-6 shrink-0" aria-hidden="true" /> : null}
					<div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
						<span className="truncate">{keyHeaderLabel}</span>
						<span className="truncate">{valueHeaderLabel}</span>
					</div>
					{pairCountText ? (
						<span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
							{pairCountText}
						</span>
					) : null}
				</div>
			) : null}

			<div {...sortable.getContainerProps()} className="space-y-2">
				{pairs.map((pair, idx) => {
					const rowId = pair._rowId || `row_${idx}`;
					const trimmedKey = pair.key.trim();
					const rowKeyError = getRowKeyError(pair.key);
					const rowErrId = `${fieldInputId}_err_${rowId}`;
					const keyAriaLabel = t(
						'keyvalue.keyForRow',
						{
							label: keyHeaderLabel,
							index: idx + 1,
						},
						'{label} for row {index}'
					);
					const valAriaLabel = trimmedKey
						? t(
								'keyvalue.valueForRow',
								{
									label: valueHeaderLabel,
									key: trimmedKey,
								},
								'{label} for {key}'
							)
						: t(
								'keyvalue.valueForRowIndexed',
								{
									label: valueHeaderLabel,
									index: idx + 1,
								},
								'{label} for row {index}'
							);
					const removeAriaLabel = customRemoveLabel
						? trimmedKey
							? `${customRemoveLabel} (${trimmedKey})`
							: `${customRemoveLabel} ${idx + 1}`
						: trimmedKey
							? t('keyvalue.removeRowNamed', { key: trimmedKey }, 'Remove {key}')
							: t('keyvalue.removeRowIndexed', { index: idx + 1 }, 'Remove row {index}');

					return (
						<div key={rowId} {...sortable.getItemProps(pair)} className="space-y-1">
							<div className="flex items-start @md/rw-kv:items-center gap-1.5 @md/rw-kv:gap-2">
								{canReorder ? (
									<SortableHandle size="xs" {...sortable.getHandleProps(pair, idx)} />
								) : null}

								<div className="grid min-w-0 flex-1 grid-cols-1 @md/rw-kv:grid-cols-2 gap-1.5 @md/rw-kv:gap-2">
									<Input
										ref={(el) => {
											if (el) {
												keyInputRefs.current[rowId] = el;
											} else {
												delete keyInputRefs.current[rowId];
											}
										}}
										id={idx === 0 ? firstKeyInputId : undefined}
										name={inputName ? `${inputName}_key[]` : undefined}
										value={pair.key}
										disabled={isDisabled}
										placeholder={keyPlaceholder}
										aria-label={keyAriaLabel}
										aria-invalid={rowKeyError ? 'true' : 'false'}
										aria-describedby={rowKeyError ? rowErrId : undefined}
										autoCorrect="off"
										autoCapitalize="none"
										spellCheck={false}
										onPaste={(e) => handleBulkPaste(e, idx)}
										onKeyDown={(e) => {
											if (e.nativeEvent.isComposing) {
												return;
											}
											if (e.altKey && e.key === 'ArrowUp' && idx > 0) {
												e.preventDefault();
												handleMoveRow(idx, idx - 1, 'key');
												return;
											}
											if (e.altKey && e.key === 'ArrowDown' && idx < pairs.length - 1) {
												e.preventDefault();
												handleMoveRow(idx, idx + 1, 'key');
												return;
											}
											if (e.key === 'Enter') {
												e.preventDefault();
												valInputRefs.current[rowId]?.focus();
											}
										}}
										onChange={(e) => {
											const next = [...pairs];
											next[idx] = { ...pair, _rowId: rowId, key: e.target.value };
											emit(next);
										}}
										className={cn(
											'h-8 w-full min-w-0 font-mono text-xs',
											rowKeyError && 'border-destructive focus-visible:ring-destructive'
										)}
									/>
									<Input
										ref={(el) => {
											if (el) {
												valInputRefs.current[rowId] = el;
											} else {
												delete valInputRefs.current[rowId];
											}
										}}
										name={inputName ? `${inputName}_val[]` : undefined}
										value={pair.value}
										disabled={isDisabled}
										placeholder={valuePlaceholder}
										aria-label={valAriaLabel}
										aria-invalid="false"
										onPaste={(e) => {
											if (pair.key.trim() === '') {
												handleBulkPaste(e, idx);
											}
										}}
										onKeyDown={(e) => {
											if (e.nativeEvent.isComposing) {
												return;
											}
											if (e.altKey && e.key === 'ArrowUp' && idx > 0) {
												e.preventDefault();
												handleMoveRow(idx, idx - 1, 'val');
												return;
											}
											if (e.altKey && e.key === 'ArrowDown' && idx < pairs.length - 1) {
												e.preventDefault();
												handleMoveRow(idx, idx + 1, 'val');
												return;
											}
											if (e.key === 'Enter') {
												e.preventDefault();
												if (idx < pairs.length - 1) {
													const nextRow = pairs[idx + 1];
													if (nextRow?._rowId) {
														keyInputRefs.current[nextRow._rowId]?.focus();
													}
												} else if (canAddMore && pair.key.trim() !== '') {
													handleAddRow();
												}
											}
										}}
										onChange={(e) => {
											const next = [...pairs];
											next[idx] = { ...pair, _rowId: rowId, value: e.target.value };
											emit(next);
										}}
										className="h-8 w-full min-w-0 text-xs"
									/>
								</div>

								{!isDisabled ? (
									<div className="flex items-center gap-0.5 shrink-0">
										{canReorder ? (
											<>
												<Button
													ref={(el) => {
														if (el) {
															moveUpRefs.current[rowId] = el;
														} else {
															delete moveUpRefs.current[rowId];
														}
													}}
													type="button"
													variant="ghost"
													size="icon"
													disabled={idx === 0}
													onClick={() => handleMoveRow(idx, idx - 1, 'up')}
													title={t(
														'keyvalue.moveUp',
														{ index: idx + 1 },
														'Move row {index} up'
													)}
													aria-label={t(
														'keyvalue.moveUp',
														{ index: idx + 1 },
														'Move row {index} up'
													)}
													className="h-8 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
												>
													<DynamicIcon name="chevron-up" className="h-3.5 w-3.5" />
												</Button>
												<Button
													ref={(el) => {
														if (el) {
															moveDownRefs.current[rowId] = el;
														} else {
															delete moveDownRefs.current[rowId];
														}
													}}
													type="button"
													variant="ghost"
													size="icon"
													disabled={idx === pairs.length - 1}
													onClick={() => handleMoveRow(idx, idx + 1, 'down')}
													title={t(
														'keyvalue.moveDown',
														{ index: idx + 1 },
														'Move row {index} down'
													)}
													aria-label={t(
														'keyvalue.moveDown',
														{ index: idx + 1 },
														'Move row {index} down'
													)}
													className="h-8 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
												>
													<DynamicIcon name="chevron-down" className="h-3.5 w-3.5" />
												</Button>
											</>
										) : null}
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => handleRemoveRow(idx)}
											title={removeAriaLabel}
											aria-label={removeAriaLabel}
											className="h-8 w-8 text-muted-foreground hover:text-destructive"
										>
											<DynamicIcon name="trash" className="h-3.5 w-3.5" />
										</Button>
									</div>
								) : null}
							</div>

							{rowKeyError ? (
								<p id={rowErrId} className="text-[11px] font-medium text-destructive pl-1">
									{rowKeyError}
								</p>
							) : null}
						</div>
					);
				})}
			</div>

			{canAddMore || pairCountText ? (
				<div className="flex items-center justify-between gap-2">
					{canAddMore ? (
						<Button
							type="button"
							variant="outline"
							size="xs"
							icon="plus"
							onClick={handleAddRow}
						>
							{addLabel}
						</Button>
					) : (
						<span />
					)}
					{pairCountText ? (
						<span className="@md/rw-kv:hidden shrink-0 tabular-nums text-[11px] font-medium text-muted-foreground">
							{pairCountText}
						</span>
					) : null}
				</div>
			) : null}
		</div>
	);
};
