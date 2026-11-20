import React, { useState } from 'react';
import { t } from '../../lib/i18n';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Dialog } from '../primitives/Dialog';

export interface ConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	icon?: string;
	confirmLabel?: string;
	variant?: 'primary' | 'warning' | 'danger';
	loading?: boolean;
	requireAcknowledge?: boolean;
	onConfirm: () => void;
}

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	icon,
	confirmLabel,
	variant = 'danger',
	loading = false,
	requireAcknowledge = true,
	onConfirm,
}: ConfirmDialogProps): React.ReactElement | null {
	const [acknowledged, setAcknowledged] = useState(false);

	if (!open) {
		return null;
	}

	const resolvedConfirmLabel = confirmLabel ?? t('common.confirmExecute', 'Confirm & Execute');
	const canProceed = !requireAcknowledge || acknowledged;
	const resolvedIcon =
		icon ??
		(variant === 'danger' ? 'alert-triangle' : variant === 'warning' ? 'alert-triangle' : 'info');

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setAcknowledged(false);
				onOpenChange(next);
			}}
			title={title}
			description={description}
			icon={resolvedIcon}
			tone={variant}
			showCloseButton={false}
			maxWidth={requireAcknowledge ? 'max-w-[28rem]' : 'max-w-[26rem]'}
			footer={
				<>
					<Button
						variant="outline"
						size="sm"
						autoFocus
						onClick={() => {
							setAcknowledged(false);
							onOpenChange(false);
						}}
					>
						{t('common.cancel', 'Cancel')}
					</Button>
					<Button
						variant={variant}
						size="sm"
						disabled={!canProceed || loading}
						data-rw-confirm-accept=""
						onClick={() => {
							onConfirm();
							setAcknowledged(false);
						}}
					>
						{loading ? t('common.executing', 'Executing...') : resolvedConfirmLabel}
					</Button>
				</>
			}
		>
			{requireAcknowledge ? (
				<div className="rounded-lg border border-border/80 bg-muted/35 px-3.5 py-2.5 transition-colors hover:bg-muted/55">
					<Checkbox
						checked={acknowledged}
						onCheckedChange={setAcknowledged}
						label={t('common.confirmAcknowledge', 'I understand the impact of this operation and wish to proceed.')}
					/>
				</div>
			) : null}
		</Dialog>
	);
}
