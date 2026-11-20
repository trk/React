import React, { useEffect, useRef, useState } from 'react';
import { isInertiaAppActive, safeRouter as router } from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { ConfirmDialog } from '../ui';

export function useShellDirtyNavigationGuard({
	pageUrl,
	isEmbeddedIsland,
}: {
	pageUrl?: string;
	isEmbeddedIsland: boolean;
}): {
	hasDirtySchemaForm: boolean;
	pendingDirtyVisitUrl: string | null;
	dismissPendingVisit: () => void;
	confirmLeavePage: () => void;
} {
	const [dirtyFormsMap, setDirtyFormsMap] = useState<Record<string, { guarded: boolean }>>({});
	const [pendingDirtyVisitUrl, setPendingDirtyVisitUrl] = useState<string | null>(null);
	const bypassDirtyNavRef = useRef(false);

	useEffect(() => {
		setDirtyFormsMap({});
		setPendingDirtyVisitUrl(null);
		bypassDirtyNavRef.current = false;
	}, [pageUrl]);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}
		const onSchemaFormDirty = (ev: Event) => {
			const detail = (
				ev as CustomEvent<{ formId?: string; isDirty?: boolean; dirtyGuard?: boolean }>
			).detail;
			const formKey = String(detail?.formId || '__default__');
			const dirtyNext = Boolean(detail?.isDirty);
			const guardedNext = detail?.dirtyGuard !== false;
			setDirtyFormsMap((prev) => {
				if (dirtyNext) {
					const existing = prev[formKey];
					if (existing && existing.guarded === guardedNext) {
						return prev;
					}
					return { ...prev, [formKey]: { guarded: guardedNext } };
				}
				if (!(formKey in prev)) {
					return prev;
				}
				const next = { ...prev };
				delete next[formKey];
				return next;
			});
		};
		window.addEventListener('rw:schema-form-dirty', onSchemaFormDirty);
		return () => window.removeEventListener('rw:schema-form-dirty', onSchemaFormDirty);
	}, []);

	const hasDirtySchemaForm = Object.keys(dirtyFormsMap).length > 0;
	const hasGuardedDirtySchemaForm = Object.values(dirtyFormsMap).some((entry) => entry.guarded);

	useEffect(() => {
		if (isEmbeddedIsland || !hasGuardedDirtySchemaForm || !isInertiaAppActive()) {
			return;
		}
		if (typeof router.on !== 'function') {
			return;
		}
		const unsub = router.on(
			'before',
			(event: {
				detail?: { visit?: { method?: string; url?: string | URL | { href?: string } } };
				preventDefault?: () => void;
			}) => {
				if (bypassDirtyNavRef.current) {
					bypassDirtyNavRef.current = false;
					return;
				}
				const visit = event?.detail?.visit;
				const method = String(visit?.method || 'get').toLowerCase();
				if (method !== 'get') {
					return;
				}
				const rawUrl = visit?.url;
				const targetHref =
					typeof rawUrl === 'string'
						? rawUrl
						: rawUrl instanceof URL
							? `${rawUrl.pathname}${rawUrl.search}${rawUrl.hash}`
							: rawUrl && typeof rawUrl === 'object' && typeof rawUrl.href === 'string'
								? rawUrl.href
								: '';
				if (!targetHref || typeof window === 'undefined') {
					return;
				}
				try {
					const parsedTarget = new URL(targetHref, window.location.origin);
					const currentKey = `${window.location.pathname}${window.location.search}`;
					const targetKey = `${parsedTarget.pathname}${parsedTarget.search}`;
					if (targetKey === currentKey) {
						return;
					}
					event.preventDefault?.();
					setPendingDirtyVisitUrl(`${parsedTarget.pathname}${parsedTarget.search}${parsedTarget.hash}`);
				} catch {
					// Ignore malformed URLs
				}
			}
		);
		return () => {
			if (typeof unsub === 'function') {
				unsub();
			}
		};
	}, [isEmbeddedIsland, hasGuardedDirtySchemaForm]);

	return {
		hasDirtySchemaForm,
		pendingDirtyVisitUrl,
		dismissPendingVisit: () => setPendingDirtyVisitUrl(null),
		confirmLeavePage: () => {
			const nextUrl = pendingDirtyVisitUrl;
			setPendingDirtyVisitUrl(null);
			if (nextUrl) {
				bypassDirtyNavRef.current = true;
				router.visit(nextUrl);
			}
		},
	};
}

export function DirtyNavigationConfirmDialog({
	pendingUrl,
	onDismiss,
	onConfirmLeave,
}: {
	pendingUrl: string | null;
	onDismiss: () => void;
	onConfirmLeave: () => void;
}): React.ReactElement | null {
	if (!pendingUrl) {
		return null;
	}

	return (
		<ConfirmDialog
			open={Boolean(pendingUrl)}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					onDismiss();
				}
			}}
			variant="danger"
			icon="alert-triangle"
			requireAcknowledge={false}
			title={t('form.unsavedChangesTitle', 'Unsaved changes')}
			description={t(
				'form.discardUnsavedNotice',
				'Leaving or reloading this page will discard the edits you have not saved.'
			)}
			confirmLabel={t('form.discardAndLeave', 'Discard & Leave')}
			onConfirm={onConfirmLeave}
		/>
	);
}
