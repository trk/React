import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isInertiaAppActive, safeRouter, safeUsePage } from '../lib/inertia-bridge';
import { useTranslations, type Translator } from '../lib/i18n';
import { cn, DynamicIcon, getCsrfToken, sanitizeSameOriginUrl } from '../lib/utils';
import { Button, ConfirmDialog } from '../ui';

export interface PresenceCoEditor {
	userId: number;
	userName: string;
	displayName: string;
	startedAt: number;
	lastSeenAt: number;
	secondsAgo: number;
}

export interface PresenceLastSaved {
	version: number;
	savedAt: number;
	userId: number;
	userName: string;
	displayName: string;
}

export interface EditPresenceSnapshot {
	resourceKey: string;
	serverTime: number;
	ttlSeconds: number;
	heartbeatSeconds: number;
	coEditors: PresenceCoEditor[];
	lastSaved: PresenceLastSaved | null;
}

export interface UseEditPresenceOptions {
	resourceKey?: string | null;
	endpoint?: string | null;
	enabled?: boolean;
	pollIntervalMs?: number;
}

export interface UseEditPresenceResult {
	coEditors: PresenceCoEditor[];
	remoteSave: PresenceLastSaved | null;
	notifySaved: () => Promise<void>;
	dismissRemoteSave: () => void;
	reloadLatest: () => void;
}

function createClientTabId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID().replace(/-/g, '');
	}
	return 'rw_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

function resolveDefaultPresenceEndpoint(explicitEndpoint?: string | null): string {
	if (explicitEndpoint && explicitEndpoint.trim() !== '') {
		return explicitEndpoint.trim();
	}
	if (typeof window !== 'undefined') {
		const winObj = window as unknown as Record<string, unknown>;
		const sharedEndpoint = winObj.__pwWorkspacePresenceEndpoint;
		if (typeof sharedEndpoint === 'string' && sharedEndpoint !== '') {
			return sharedEndpoint;
		}
	}
	return '/_react/presence';
}

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

export function useEditPresence({
	resourceKey,
	endpoint,
	enabled = true,
	pollIntervalMs,
}: UseEditPresenceOptions): UseEditPresenceResult {
	const normalizedKey = (resourceKey ?? '').trim();
	const isActive = Boolean(enabled && normalizedKey !== '' && typeof window !== 'undefined');

	let sharedUserId = 0;
	let sharedEndpointFromPage = '';
	const page = safeUsePage();
	const ws = (page?.props as Record<string, unknown> | undefined)?.workspace as
		| { user?: { id?: unknown }; presenceEndpoint?: unknown }
		| undefined;
	if (ws?.user?.id) {
		sharedUserId = Number(ws.user.id) || 0;
	}
	if (typeof ws?.presenceEndpoint === 'string') {
		sharedEndpointFromPage = ws.presenceEndpoint;
	}

	const resolvedEndpoint = useMemo(
		() => resolveDefaultPresenceEndpoint(endpoint || sharedEndpointFromPage),
		[endpoint, sharedEndpointFromPage]
	);

	const clientIdRef = useRef<string>('');
	if (!clientIdRef.current) {
		clientIdRef.current = createClientTabId();
	}

	const baselineVersionRef = useRef<number | null>(null);
	const currentUserIdRef = useRef<number>(sharedUserId);
	currentUserIdRef.current = sharedUserId;

	const [coEditors, setCoEditors] = useState<PresenceCoEditor[]>([]);
	const [remoteSave, setRemoteSave] = useState<PresenceLastSaved | null>(null);
	const [serverHeartbeatMs, setServerHeartbeatMs] = useState<number>(15_000);

	const sendPresenceAction = useCallback(
		async (action: 'heartbeat' | 'leave' | 'saved'): Promise<EditPresenceSnapshot | null> => {
			if (!isActive) {
				return null;
			}
			try {
				const csrf = getCsrfToken();
				const headers: Record<string, string> = {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					'X-Requested-With': 'XMLHttpRequest',
				};
				if (csrf.value) {
					headers['X-CSRF-Token'] = csrf.value;
				}
				const bodyPayload: Record<string, unknown> = {
					action,
					resourceKey: normalizedKey,
					clientId: clientIdRef.current,
					csrf,
				};
				if (csrf.name && csrf.value) {
					bodyPayload[csrf.name] = csrf.value;
				}

				const safeEndpoint = sanitizeSameOriginUrl(resolvedEndpoint);
				if (!safeEndpoint) {
					return null;
				}
				const res = await fetch(safeEndpoint, {
					method: 'POST',
					credentials: 'same-origin',
					headers,
					body: JSON.stringify(bodyPayload),
				});

				if (!res.ok) {
					return null;
				}
				const json = await res.json();
				if (!json?.ok || !json?.presence) {
					return null;
				}
				return json.presence as EditPresenceSnapshot;
			} catch {
				return null;
			}
		},
		[isActive, normalizedKey, resolvedEndpoint]
	);

	const applySnapshot = useCallback((snapshot: EditPresenceSnapshot | null) => {
		if (!snapshot) {
			return;
		}
		setCoEditors(Array.isArray(snapshot.coEditors) ? snapshot.coEditors : []);
		if (snapshot.heartbeatSeconds && snapshot.heartbeatSeconds >= 5) {
			setServerHeartbeatMs(snapshot.heartbeatSeconds * 1000);
		}

		const incomingSaved = snapshot.lastSaved ?? null;
		const incomingVersion = incomingSaved?.version ?? 0;

		if (baselineVersionRef.current === null) {
			baselineVersionRef.current = incomingVersion;
			return;
		}

		if (incomingSaved && incomingVersion > baselineVersionRef.current) {
			if (currentUserIdRef.current > 0 && incomingSaved.userId === currentUserIdRef.current) {
				baselineVersionRef.current = incomingVersion;
			} else {
				baselineVersionRef.current = incomingVersion;
				setRemoteSave(incomingSaved);
			}
		}
	}, []);

	useEffect(() => {
		baselineVersionRef.current = null;
		setCoEditors([]);
		setRemoteSave(null);

		if (!isActive) {
			return;
		}

		let disposed = false;
		let documentUnloading = false;

		const tick = async () => {
			if (disposed || documentUnloading) {
				return;
			}
			if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
				return;
			}
			const snap = await sendPresenceAction('heartbeat');
			if (!disposed && !documentUnloading) {
				applySnapshot(snap);
			}
		};

		void tick();

		const handleVisibilityOrFocus = () => {
			if (document.visibilityState === 'visible') {
				void tick();
			}
		};

		const markDocumentUnloading = () => {
			documentUnloading = true;
		};

		document.addEventListener('visibilitychange', handleVisibilityOrFocus);
		window.addEventListener('focus', handleVisibilityOrFocus);
		window.addEventListener('beforeunload', markDocumentUnloading);
		window.addEventListener('pagehide', markDocumentUnloading);

		return () => {
			disposed = true;
			document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
			window.removeEventListener('focus', handleVisibilityOrFocus);
			window.removeEventListener('beforeunload', markDocumentUnloading);
			window.removeEventListener('pagehide', markDocumentUnloading);
			if (!documentUnloading) {
				void sendPresenceAction('leave');
			}
		};
	}, [isActive, normalizedKey, sendPresenceAction, applySnapshot]);

	useEffect(() => {
		if (!isActive) {
			return;
		}

		let disposed = false;
		const effectiveInterval = pollIntervalMs && pollIntervalMs >= 2_000 ? pollIntervalMs : serverHeartbeatMs;

		const timerId = window.setInterval(async () => {
			if (disposed) {
				return;
			}
			if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
				return;
			}
			const snap = await sendPresenceAction('heartbeat');
			if (!disposed) {
				applySnapshot(snap);
			}
		}, effectiveInterval);

		return () => {
			disposed = true;
			window.clearInterval(timerId);
		};
	}, [isActive, normalizedKey, pollIntervalMs, serverHeartbeatMs, sendPresenceAction, applySnapshot]);

	const notifySaved = useCallback(async () => {
		const snap = await sendPresenceAction('saved');
		if (snap?.lastSaved?.version) {
			baselineVersionRef.current = snap.lastSaved.version;
		}
		setRemoteSave(null);
	}, [sendPresenceAction]);

	const dismissRemoteSave = useCallback(() => {
		setRemoteSave(null);
	}, []);

	const reloadLatest = useCallback(() => {
		setRemoteSave(null);
		if (isInertiaAppActive()) {
			safeRouter.reload();
			return;
		}
		if (typeof window !== 'undefined') {
			window.location.reload();
		}
	}, []);

	return {
		coEditors,
		remoteSave,
		notifySaved,
		dismissRemoteSave,
		reloadLatest,
	};
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
