import React, { useEffect, useState } from 'react';
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
	acknowledgeLabel?: string;
	variant?: 'primary' | 'warning' | 'danger';
	loading?: boolean;
	requireAcknowledge?: boolean;
	children?: React.ReactNode;
	onConfirm: () => void;
}

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	icon,
	confirmLabel,
	acknowledgeLabel,
	variant = 'danger',
	loading = false,
	requireAcknowledge = true,
	children,
	onConfirm,
}: ConfirmDialogProps): React.ReactElement | null {
	const [acknowledged, setAcknowledged] = useState(false);

	useEffect(() => {
		if (!open) {
			setAcknowledged(false);
		}
	}, [open]);

	if (!open) {
		return null;
	}

	const resolvedConfirmLabel = confirmLabel ?? t('common.confirmExecute', 'Confirm & Execute');
	const resolvedAcknowledgeLabel =
		acknowledgeLabel ?? t('common.confirmAcknowledge', 'I understand the impact of this operation and wish to proceed.');
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
			{children || requireAcknowledge ? (
				<div className="space-y-3">
					{children}
					{requireAcknowledge ? (
						<div
							data-rw-confirm-acknowledge=""
							className="rounded-lg border border-border/80 bg-muted/35 px-3.5 py-2.5 transition-colors hover:bg-muted/55"
						>
							<Checkbox
								checked={acknowledged}
								onCheckedChange={setAcknowledged}
								label={resolvedAcknowledgeLabel}
							/>
						</div>
					) : null}
				</div>
			) : null}
		</Dialog>
	);
}
