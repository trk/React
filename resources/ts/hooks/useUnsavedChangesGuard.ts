import type React from 'react';
import { useEffect, useRef } from 'react';
import { translate } from '../lib/i18n';

export interface UseUnsavedChangesGuardOptions {
	enabled?: boolean;
	message?: string;
	hostRef?: React.RefObject<HTMLElement | null>;
	onResetDirty?: () => void;
}

type DirtyGuardedInertiaEvent = CustomEvent<{
	visit?: {
		url?: URL | string;
		method?: string;
		prefetch?: boolean;
	};
}> & {
	__rwDirtyConfirmed?: boolean;
};

/**
 * Guards against accidental tab close or navigation when an editor has unsaved changes.
 * When `hostRef` is supplied, also tracks native form submissions, `inertia:before`
 * navigations outside `AppShell` (which owns `ConfirmDialog`), and post-save resets.
 */
export function useUnsavedChangesGuard(
	dirty: boolean,
	options: UseUnsavedChangesGuardOptions | string = {},
): void {
	const normalized: UseUnsavedChangesGuardOptions =
		typeof options === 'string' ? { message: options } : options;
	const enabled = normalized.enabled !== false;
	const message = normalized.message ?? '';
	const hostRef = normalized.hostRef;
	const isSubmittingRef = useRef(false);
	const onResetDirtyRef = useRef(normalized.onResetDirty);
	onResetDirtyRef.current = normalized.onResetDirty;

	useEffect(() => {
		if (!dirty || !enabled || typeof window === 'undefined') {
			isSubmittingRef.current = false;
			return;
		}

		if (!hostRef) {
			const handleBeforeUnload = (event: BeforeUnloadEvent) => {
				event.preventDefault();
				event.returnValue = message;
				return message;
			};
			window.addEventListener('beforeunload', handleBeforeUnload);
			return () => window.removeEventListener('beforeunload', handleBeforeUnload);
		}

		if (typeof document === 'undefined') {
			return;
		}

		const resolveHostForm = (): HTMLFormElement | null => {
			const el = hostRef.current;
			if (!el) {
				return null;
			}
			return el instanceof HTMLFormElement ? el : el.closest('form');
		};

		const handleFormSubmit = (ev: Event) => {
			const hostForm = resolveHostForm();
			if (hostForm && ev.target !== hostForm) {
				return;
			}
			if (ev.defaultPrevented) {
				isSubmittingRef.current = false;
				return;
			}
			isSubmittingRef.current = true;
			window.queueMicrotask(() => {
				if (ev.defaultPrevented) {
					isSubmittingRef.current = false;
				}
			});
		};

		const handleBeforeUnload = (ev: BeforeUnloadEvent) => {
			const hostForm = resolveHostForm();
			if (
				isSubmittingRef.current ||
				hostForm?.classList.contains('InputfieldFormSubmitted')
			) {
				return;
			}
			ev.preventDefault();
			ev.returnValue = message;
			return message;
		};

		const handleInertiaBefore = (rawEv: Event) => {
			const ev = rawEv as DirtyGuardedInertiaEvent;
			if (ev.defaultPrevented || ev.__rwDirtyConfirmed) {
				return;
			}
			const visit = ev.detail?.visit;
			if (visit?.prefetch) {
				return;
			}
			const method = String(visit?.method || 'get').toLowerCase();
			if (method !== 'get') {
				isSubmittingRef.current = true;
				return;
			}
			if (hostRef.current?.closest('[data-rw-app-shell]')) {
				// Enclosing AppShell owns Inertia SPA navigation confirmation via ConfirmDialog
				return;
			}
			const hostForm = resolveHostForm();
			if (
				isSubmittingRef.current ||
				hostForm?.classList.contains('InputfieldFormSubmitted')
			) {
				return;
			}
			if (visit?.url) {
				try {
					const nextUrl = new URL(String(visit.url), window.location.origin);
					if (
						nextUrl.pathname === window.location.pathname &&
						nextUrl.search === window.location.search
					) {
						return;
					}
				} catch {
					// Proceed to confirmation if URL parsing fails
				}
			}
			const resolvedMessage =
				message ||
				translate('core', 'form.unsavedChanges', 'You have unsaved changes.');
			if (!window.confirm(resolvedMessage)) {
				ev.preventDefault();
				return;
			}
			ev.__rwDirtyConfirmed = true;
		};

		const handleInertiaSuccess = () => {
			if (isSubmittingRef.current) {
				isSubmittingRef.current = false;
				const hostForm = resolveHostForm();
				hostForm?.removeAttribute('data-rw-form-dirty');
				onResetDirtyRef.current?.();
			}
		};

		const handleInertiaFinish = () => {
			if (isSubmittingRef.current) {
				window.setTimeout(() => {
					isSubmittingRef.current = false;
				}, 0);
			}
		};

		document.addEventListener('submit', handleFormSubmit, true);
		window.addEventListener('beforeunload', handleBeforeUnload);
		document.addEventListener('inertia:before', handleInertiaBefore);
		document.addEventListener('inertia:success', handleInertiaSuccess);
		document.addEventListener('inertia:finish', handleInertiaFinish);

		return () => {
			document.removeEventListener('submit', handleFormSubmit, true);
			window.removeEventListener('beforeunload', handleBeforeUnload);
			document.removeEventListener('inertia:before', handleInertiaBefore);
			document.removeEventListener('inertia:success', handleInertiaSuccess);
			document.removeEventListener('inertia:finish', handleInertiaFinish);
		};
	}, [dirty, enabled, message, hostRef]);
}
