import React from 'react';
import { createPortal } from 'react-dom';

export const PORTAL_ROOT_ID = '_rw_portal_root';

/**
 * Resolve the safest DOM container for portaled floating UI (menus, popovers,
 * tooltips, toasts, and dialogs).
 *
 * When an anchor sits inside an open native top-layer `<dialog>`, returns that
 * ancestor `<dialog>` so popups render inside its top-layer stacking context
 * instead of falling behind the modal backdrop. Otherwise returns a shared
 * `<div id="_rw_portal_root" data-rw-portal-overlay="1">` attached to `body`.
 */
export function getPortalContainer(anchor?: Element | null): HTMLElement | null {
	if (typeof document === 'undefined' || !document.body) {
		return null;
	}

	if (anchor && typeof anchor.closest === 'function') {
		const ancestorDialog = anchor.closest('dialog[open]') ?? anchor.closest('dialog');
		if (ancestorDialog instanceof HTMLElement) {
			return ancestorDialog;
		}
	}

	const existing = document.getElementById(PORTAL_ROOT_ID);
	if (existing) {
		if (!existing.hasAttribute('data-rw-portal-overlay')) {
			existing.setAttribute('data-rw-portal-overlay', '1');
		}
		return existing;
	}

	const created = document.createElement('div');
	created.id = PORTAL_ROOT_ID;
	created.setAttribute('data-rw-portal-overlay', '1');
	document.body.appendChild(created);
	return created;
}

export interface PortalRootProps {
	children: React.ReactNode;
	anchor?: Element | null;
	container?: HTMLElement | null;
	ssrFallback?: boolean;
}

export function PortalRoot({
	children,
	anchor,
	container,
	ssrFallback = true,
}: PortalRootProps): React.ReactNode {
	if (typeof document === 'undefined') {
		return ssrFallback ? <>{children}</> : null;
	}
	const target = container ?? getPortalContainer(anchor);
	if (!target) {
		return ssrFallback ? <>{children}</> : null;
	}
	return createPortal(children, target);
}
