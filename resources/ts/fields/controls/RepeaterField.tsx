import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Button, Input, Select, SortableHandle, SortableStatusRegion, useSortableList } from '../../ui';
import type { ReactInputfieldProps } from '../types';

interface RepeaterRowItem {
	_rowId: string;
	cells: Record<string, string>;
}

export function RepeaterField(props: ReactInputfieldProps): React.ReactElement {
	const repeaterBaseId = useId();
	const subfields = useMemo(() => props.subfields ?? [], [props.subfields]);
	const minRows = Math.max(0, props.minRows ?? 0);
	const maxRows = Math.max(1, props.maxRows ?? 10);
	const seqRef = useRef(0);
	const nextRowId = useCallback(() => `rep_${++seqRef.current}`, []);

	const createEmptyCells = useCallback((): Record<string, string> => {
		const row: Record<string, string> = {};
		for (const sub of subfields) {
			row[sub.name] = '';
		}
		return row;
	}, [subfields]);

	const buildRowsFromProp = useCallback(
		(rawVal: unknown): RepeaterRowItem[] => {
			if (Array.isArray(rawVal) && rawVal.length > 0) {
				return rawVal.map((r: unknown) => ({
					_rowId: nextRowId(),
					cells:
						typeof r === 'object' && r !== null
							? { ...(r as Record<string, string>) }
							: createEmptyCells(),
				}));
			}
			const initialCount = Math.max(1, minRows);
			return Array.from({ length: initialCount }, () => ({
				_rowId: nextRowId(),
				cells: createEmptyCells(),
			}));
		},
		[createEmptyCells, minRows, nextRowId]
	);

	const [rows, setRows] = useState<RepeaterRowItem[]>(() => buildRowsFromProp(props.value));
	const lastEmittedSigRef = useRef<string>(JSON.stringify(rows.map((r) => r.cells)));

	useEffect(() => {
		const candidate = buildRowsFromProp(props.value);
		const candidateSig = JSON.stringify(candidate.map((r) => r.cells));
		if (candidateSig === lastEmittedSigRef.current) {
			return;
		}
		lastEmittedSigRef.current = candidateSig;
		setRows(candidate);
	}, [props.value, buildRowsFromProp]);

	const emitRows = (next: RepeaterRowItem[]) => {
		const plain = next.map((item) => item.cells);
		lastEmittedSigRef.current = JSON.stringify(plain);
		props.onValueChange?.(props.name, plain);
	};

	const updateCell = (rowId: string, subName: string, val: string) => {
		setRows((prev) => {
			const next = prev.map((r) =>
				r._rowId === rowId ? { ...r, cells: { ...r.cells, [subName]: val } } : r
			);
			emitRows(next);
			return next;
		});
	};

	const addRow = () => {
		if (props.readOnly || props.disabled || rows.length >= maxRows) {
			return;
		}
		setRows((prev) => {
			const next = [...prev, { _rowId: nextRowId(), cells: createEmptyCells() }];
			emitRows(next);
			return next;
		});
	};

	const removeRow = (rowId: string) => {
		if (props.readOnly || props.disabled || rows.length <= minRows) {
			return;
		}
		setRows((prev) => {
			const next = prev.filter((r) => r._rowId !== rowId);
			emitRows(next);
			return next;
		});
	};

	const isLocked = Boolean(props.readOnly || props.disabled);
	const sortable = useSortableList<RepeaterRowItem>({
		items: rows,
		getId: (r) => r._rowId,
		getLabel: (_, idx) => `Row ${idx + 1}`,
		axis: 'vertical',
		disabled: isLocked,
		onReorder: (next) => {
			setRows(next);
			emitRows(next);
		},
	});

	return (
		<div className="space-y-2.5" data-rw-control="repeater">
			<SortableStatusRegion message={sortable.statusMessage} />
			<div
				{...sortable.getContainerProps()}
				className={cn(rows.length > 0 && 'divide-y divide-border overflow-hidden rounded-md border border-border')}
			>
				{rows.map((rowItem, rowIdx) => {
					const row = rowItem.cells;
					return (
						<div
							key={rowItem._rowId}
							{...sortable.getItemProps(rowItem)}
							className="flex flex-wrap items-end gap-2.5 bg-muted/10 px-3 py-2.5"
						>
							{!isLocked && rows.length > 1 ? (
								<div className="flex h-9 items-center">
									<SortableHandle
										size="xs"
										{...sortable.getHandleProps(rowItem, rowIdx)}
									/>
								</div>
							) : null}
							<div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-12">
								{subfields.map((sub) => {
									const span =
										sub.width && sub.width <= 34
											? 'sm:col-span-4'
											: sub.width && sub.width <= 50
												? 'sm:col-span-6'
												: 'sm:col-span-12';
									const subInputName = `${props.name}[${rowIdx}][${sub.name}]`;
									const subInputId = `${repeaterBaseId}-${rowItem._rowId}-${sub.name}`;
									const cellError = props.subErrors?.[subInputName];
									return (
										<div key={sub.name} className={cn('space-y-1', span)}>
											<label htmlFor={subInputId} className="block text-[11px] font-medium text-muted-foreground">
												{sub.label}
												{sub.required ? <span className="ml-0.5 text-destructive">*</span> : null}
											</label>
											{sub.type === 'select' && Array.isArray(sub.options) ? (
												<Select
													id={subInputId}
													name={subInputName}
													value={row[sub.name] ?? ''}
													onChange={(e) => updateCell(rowItem._rowId, sub.name, e.target.value)}
													disabled={props.disabled || props.readOnly}
													required={sub.required}
													aria-invalid={cellError ? true : undefined}
													className={cn(cellError && 'border-destructive')}
												>
													<option value="">{t('form.selectPlaceholder', 'Select...')}</option>
													{sub.options.map((opt) => (
														<option key={opt.value} value={opt.value}>
															{opt.label}
														</option>
													))}
												</Select>
											) : (
												<Input
													id={subInputId}
													name={subInputName}
													type={sub.type || 'text'}
													value={row[sub.name] ?? ''}
													placeholder={sub.placeholder || undefined}
													onChange={(e) => updateCell(rowItem._rowId, sub.name, e.target.value)}
													readOnly={props.readOnly}
													disabled={props.disabled}
													required={sub.required}
													aria-invalid={cellError ? true : undefined}
													className={cn(cellError && 'border-destructive')}
												/>
											)}
											{cellError ? (
												<p className="text-[11px] font-medium text-destructive" role="alert">
													{cellError}
												</p>
											) : null}
										</div>
									);
								})}
							</div>
							{!isLocked ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={rows.length <= minRows}
									onClick={() => removeRow(rowItem._rowId)}
									aria-label={t('keyvalue.removeRowIndexed', { index: rowIdx + 1 }, 'Remove row {index}')}
									className="h-9 px-2 text-muted-foreground hover:text-destructive"
								>
									<DynamicIcon name="trash-2" className="size-4" />
								</Button>
							) : null}
						</div>
					);
				})}
			</div>
			{!props.readOnly && !props.disabled && rows.length < maxRows ? (
				<Button type="button" variant="outline" size="sm" onClick={addRow}>
					<DynamicIcon name="plus" className="size-3.5" />
					<span>{t('keyvalue.addRow', 'Add Row')}</span>
				</Button>
			) : null}
		</div>
	);
}
