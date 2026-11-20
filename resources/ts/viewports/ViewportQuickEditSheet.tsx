import React, { useId, useRef } from 'react';
import { t } from '../lib/i18n';
import { Button, Input, PortalRoot, Select, useModalDialogController } from '../ui';
import type { ViewportQuickEditSpec } from './types';

export interface ViewportQuickEditSheetProps {
	quickEdit: ViewportQuickEditSpec | null | undefined;
	busy: boolean;
	values: Record<string, unknown>;
	onChangeValues: (next: Record<string, unknown>) => void;
	onClose: () => void;
	onSave: () => void;
}

export function ViewportQuickEditSheet({
	quickEdit,
	busy,
	values,
	onChangeValues,
	onClose,
	onSave,
}: ViewportQuickEditSheetProps): React.ReactElement | null {
	const quickEditTitleId = useId();
	const quickEditDialogRef = useRef<HTMLDialogElement | null>(null);
	const quickEditCtrl = useModalDialogController(
		quickEditDialogRef,
		Boolean(quickEdit),
		(nextOpen) => {
			if (!nextOpen) {
				onClose();
			}
		}
	);

	if (!quickEdit) {
		return null;
	}

	return (
		<PortalRoot ssrFallback={false}>
			<dialog
				ref={quickEditDialogRef}
				data-rw-sheet-dialog=""
				data-rw-portal-overlay=""
				data-rw-surface="elevated"
				aria-labelledby={quickEditTitleId}
				{...({ closedby: 'any' } as Record<string, string>)}
				onPointerDown={quickEditCtrl.handlePointerDown}
				onPointerUp={quickEditCtrl.handlePointerUp}
				onClose={quickEditCtrl.handleClose}
				style={{ ['--rw-sheet-max-w' as string]: '28rem' }}
				className="text-card-foreground"
			>
				<div className="flex items-center justify-between gap-3 border-b border-border/75 px-6 py-4 shrink-0">
					<div className="min-w-0">
						<h2 id={quickEditTitleId} className="truncate text-[15px] font-semibold tracking-tight text-foreground">
							{quickEdit.recordId === '__new__'
								? t('viewport.newItem', 'New Item')
								: t(
										'viewport.quickEditTitle',
										{
											title: String(
												quickEdit.record?.title ||
													quickEdit.record?.label ||
													quickEdit.record?.name ||
													quickEdit.recordId
											),
										},
										'Quick Edit: {title}'
									)}
						</h2>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{t('viewport.quickEditSubtitle', 'Edit key fields without leaving this list.')}
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						icon="x"
						aria-label={t('common.close', 'Close')}
						onClick={onClose}
					/>
				</div>

				<div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-6">
					{Object.entries(quickEdit.fields || {}).map(([fKey, fDef]) => {
						const val = values[fKey] ?? '';
						const quickFieldId = `${quickEditTitleId}-${fKey}`;
						return (
							<div key={fKey} className="space-y-1.5">
								<label htmlFor={quickFieldId} className="block text-xs font-medium text-foreground">
									{fDef.label}
								</label>
								{fDef.options && Object.keys(fDef.options).length > 0 ? (
									<Select
										id={quickFieldId}
										value={String(val)}
										onChange={(e) =>
											onChangeValues({
												...values,
												[fKey]: e.target.value,
											})
										}
									>
										{Object.entries(fDef.options).map(([oKey, oLabel]) => (
											<option key={oKey} value={oKey}>
												{oLabel}
											</option>
										))}
									</Select>
								) : (
									<Input
										id={quickFieldId}
										value={String(val)}
										onChange={(e) =>
											onChangeValues({
												...values,
												[fKey]: e.target.value,
											})
										}
									/>
								)}
							</div>
						);
					})}
				</div>

				<div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-border/75 bg-muted/30 px-6 py-3.5">
					<Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
						{t('common.cancel', 'Cancel')}
					</Button>
					<Button size="sm" disabled={busy} onClick={onSave}>
						{t('viewport.saveChanges', 'Save Changes')}
					</Button>
				</div>
			</dialog>
		</PortalRoot>
	);
}
