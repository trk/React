import React, { useEffect, useState } from 'react';
import { useTranslations, type Translator } from '../lib/i18n';
import { cn, DynamicIcon } from '../lib/utils';
import {
	useEditPresence,
	type EditPresenceSnapshot,
	type PresenceCoEditor,
	type PresenceLastSaved,
	type UseEditPresenceOptions,
	type UseEditPresenceResult,
} from '../hooks/useEditPresence';
import { Button, ConfirmDialog } from '../ui';

export {
	useEditPresence,
	type EditPresenceSnapshot,
	type PresenceCoEditor,
	type PresenceLastSaved,
	type UseEditPresenceOptions,
	type UseEditPresenceResult,
};

function formatPresenceAge(secondsAgo: number, t: Translator['t']): string {
	if (secondsAgo <= 5) {
		return t('presence.justNow', 'just now');
	}
	if (secondsAgo < 60) {
		return t('presence.secondsAgo', { seconds: secondsAgo }, '{seconds}s ago');
	}
	const mins = Math.max(1, Math.round(secondsAgo / 60));
	return t('presence.minutesAgo', { minutes: mins }, '{minutes}m ago');
}

export interface EditPresenceBannerProps {
	resourceKey?: string | null;
	endpoint?: string | null;
	enabled?: boolean;
	pollIntervalMs?: number;
	dirty?: boolean;
	className?: string;
}

export const EditPresenceBanner: React.FC<EditPresenceBannerProps> = ({
	resourceKey,
	endpoint,
	enabled = true,
	pollIntervalMs,
	dirty = false,
	className,
}) => {
	const { t } = useTranslations('core');
	const [confirmReloadOpen, setConfirmReloadOpen] = useState(false);
	const { coEditors, remoteSave, notifySaved, dismissRemoteSave, reloadLatest } = useEditPresence({
		resourceKey,
		endpoint,
		enabled,
		pollIntervalMs,
	});

	useEffect(() => {
		if (!resourceKey || typeof window === 'undefined') {
			return;
		}
		const onFormSaved = (ev: Event) => {
			const detail = (ev as CustomEvent<{ resourceKey?: string | null }>).detail;
			if (!detail?.resourceKey || detail.resourceKey === resourceKey) {
				void notifySaved();
			}
		};
		window.addEventListener('rw:schema-form-saved', onFormSaved);
		return () => window.removeEventListener('rw:schema-form-saved', onFormSaved);
	}, [resourceKey, notifySaved]);

	if (coEditors.length === 0 && !remoteSave) {
		return null;
	}

	const namesList = coEditors.map((editor) => editor.displayName || editor.userName).join(', ');
	const primaryEditor = coEditors[0];

	return (
		<div className={cn('space-y-2.5', className)} data-rw-presence-container={resourceKey || undefined}>
			{remoteSave ? (
				<div
					role="alert"
					data-rw-presence-stale={resourceKey || undefined}
					className="flex flex-col gap-3 rounded-lg border border-warning/45 bg-warning/10 px-4 py-3 text-foreground sm:flex-row sm:items-center sm:justify-between"
				>
					<div className="flex items-start gap-3 min-w-0">
						<span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-warning/20 text-warning">
							<DynamicIcon name="alert-triangle" className="size-4" />
						</span>
						<div className="min-w-0">
							<div className="text-xs font-semibold text-foreground">
								{t(
									'presence.updatedBy',
									{ user: remoteSave.displayName || remoteSave.userName },
									'Updated by {user}'
								)}
							</div>
							<p className="mt-0.5 text-xs text-muted-foreground">
								{t(
									'presence.remoteSaveNotice',
									'This record was saved in another session while you had it open. Reload the latest version before saving to avoid overwriting those changes.'
								)}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						<Button
							type="button"
							variant="primary"
							size="sm"
							icon="refresh"
							onClick={() => {
								if (dirty) {
									setConfirmReloadOpen(true);
								} else {
									reloadLatest();
								}
							}}
							data-rw-presence-reload
						>
							{t('presence.reloadLatest', 'Reload Latest')}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={dismissRemoteSave}
							aria-label={t('presence.dismissWarning', 'Dismiss remote save warning')}
						>
							{t('common.dismiss', 'Dismiss')}
						</Button>
					</div>
				</div>
			) : null}

			{confirmReloadOpen ? (
				<ConfirmDialog
					open={confirmReloadOpen}
					onOpenChange={setConfirmReloadOpen}
					variant="danger"
					icon="refresh"
					requireAcknowledge={false}
					title={t('presence.reloadLatest', 'Reload Latest')}
					description={t(
						'form.discardUnsavedNotice',
						'Leaving or reloading this page will discard the edits you have not saved.'
					)}
					confirmLabel={t('presence.reloadLatest', 'Reload Latest')}
					onConfirm={() => {
						setConfirmReloadOpen(false);
						reloadLatest();
					}}
				/>
			) : null}

			{coEditors.length > 0 ? (
				<div
					role="status"
					aria-live="polite"
					data-rw-presence-banner={resourceKey || undefined}
					className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/35 bg-warning/10 px-3.5 py-2.5 text-xs text-foreground"
				>
					<div className="flex items-center gap-2.5 min-w-0">
						<span
							className="inline-block size-2 shrink-0 rounded-full bg-warning motion-safe:animate-pulse"
							aria-hidden="true"
						/>
						<div className="min-w-0">
							<span className="font-semibold text-foreground">{namesList}</span>{' '}
							<span className="text-muted-foreground">
								{coEditors.length === 1 && primaryEditor
									? t(
											'presence.editingSingle',
											{ age: formatPresenceAge(primaryEditor.secondsAgo, t) },
											'is currently editing this record ({age}).'
										)
									: t('presence.editingMultiple', 'are currently editing this record.')}
							</span>
						</div>
					</div>
					<span className="text-[11px] text-muted-foreground">
						{t('presence.coordinateHint', 'Coordinate changes before saving')}
					</span>
				</div>
			) : null}
		</div>
	);
};
