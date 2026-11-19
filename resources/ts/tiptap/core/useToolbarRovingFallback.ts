import type React from 'react';
import { getReactWorkspaceRuntime } from '../../runtime';

const runtime = getReactWorkspaceRuntime();
const { useEffect } = runtime.React;

export function useToolbarRovingFallback(
	toolbarRef: React.RefObject<HTMLDivElement | null>,
	depsKey: string
): void {
	useEffect(() => {
		if (typeof HTMLElement === 'undefined' || 'focusGroup' in HTMLElement.prototype) {
			return;
		}
		const toolbar = toolbarRef.current;
		if (!toolbar) {
			return;
		}

		const itemSelector = 'button:not([disabled]), select:not([disabled]), [role="combobox"]:not([disabled])';
		const getItems = () => Array.from(toolbar.querySelectorAll<HTMLElement>(itemSelector));

		const syncTabStop = (preferred?: HTMLElement | null) => {
			const items = getItems();
			if (items.length === 0) {
				return;
			}
			const current =
				preferred && items.includes(preferred)
					? preferred
					: items.find((el) => el.tabIndex === 0) ?? items[0]!;
			for (const el of items) {
				el.tabIndex = el === current ? 0 : -1;
			}
		};

		syncTabStop();

		const moveTo = (next: HTMLElement | undefined) => {
			if (!next) {
				return;
			}
			syncTabStop(next);
			next.focus();
		};

		const onKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (!target) {
				return;
			}
			if (target.tagName === 'SELECT' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
				return;
			}
			const items = getItems();
			const idx = items.indexOf(target);
			if (idx === -1) {
				return;
			}
			const isRtl = window.getComputedStyle(toolbar).direction === 'rtl';
			const nextKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
			const prevKey = isRtl ? 'ArrowRight' : 'ArrowLeft';

			if (e.key === nextKey) {
				e.preventDefault();
				moveTo(items[(idx + 1) % items.length]);
			} else if (e.key === prevKey) {
				e.preventDefault();
				moveTo(items[(idx - 1 + items.length) % items.length]);
			} else if (e.key === 'Home') {
				e.preventDefault();
				moveTo(items[0]);
			} else if (e.key === 'End') {
				e.preventDefault();
				moveTo(items[items.length - 1]);
			}
		};

		const onFocusIn = (e: FocusEvent) => {
			const target = e.target as HTMLElement | null;
			const items = getItems();
			if (target && items.includes(target)) {
				syncTabStop(target);
			}
		};

		toolbar.addEventListener('keydown', onKeyDown);
		toolbar.addEventListener('focusin', onFocusIn);
		return () => {
			toolbar.removeEventListener('keydown', onKeyDown);
			toolbar.removeEventListener('focusin', onFocusIn);
		};
	}, [toolbarRef, depsKey]);
}
