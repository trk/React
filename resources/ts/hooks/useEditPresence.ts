import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isInertiaAppActive, safeRouter, safeUsePage } from '../lib/inertia-bridge';
import { fetchGatewayJson } from './fetchGatewayJson';

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
			const result = await fetchGatewayJson<{ ok?: boolean; presence?: EditPresenceSnapshot }>(
				resolvedEndpoint,
				{
					method: 'POST',
					payload: {
						action,
						resourceKey: normalizedKey,
						clientId: clientIdRef.current,
					},
				}
			);
			if (!result.ok || !result.data?.presence) {
				return null;
			}
			return result.data.presence;
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
