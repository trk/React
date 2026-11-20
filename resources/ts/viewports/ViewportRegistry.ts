import type React from 'react';
import { sanitizeAssetUrl } from '../lib/utils';
import type { ViewportCanvasProps } from './types';

const viewportRegistry = new Map<string, React.ComponentType<ViewportCanvasProps>>();
const viewportListeners = new Set<() => void>();
const injectedViewportScripts = new Set<string>();
const injectedViewportStyles = new Set<string>();

export function registerViewport(mode: string, component: React.ComponentType<ViewportCanvasProps>): void {
	viewportRegistry.set(mode.toLowerCase(), component);
	if (
		typeof window !== 'undefined' &&
		window.ReactWorkspaceRuntime?.registerViewport &&
		window.ReactWorkspaceRuntime.registerViewport !== registerViewport
	) {
		window.ReactWorkspaceRuntime.registerViewport(mode, component);
	}
	viewportListeners.forEach((listener) => listener());
}

export function getViewport(mode: string): React.ComponentType<ViewportCanvasProps> | undefined {
	return (
		viewportRegistry.get(mode.toLowerCase()) ||
		(typeof window !== 'undefined' &&
		window.ReactWorkspaceRuntime?.getViewport &&
		window.ReactWorkspaceRuntime.getViewport !== getViewport
			? window.ReactWorkspaceRuntime.getViewport(mode)
			: undefined)
	);
}

export function subscribeViewportRegistry(listener: () => void): () => void {
	viewportListeners.add(listener);
	return () => {
		viewportListeners.delete(listener);
	};
}

export function ensureViewportModeScriptLoaded(mode: string, viewScripts?: Record<string, string[]>): void {
	if (typeof document === 'undefined' || !viewScripts) {
		return;
	}
	const key = mode.toLowerCase();
	const scripts = viewScripts[key] || [];
	for (const src of scripts) {
		const safeSrc = sanitizeAssetUrl(src);
		if (!safeSrc) {
			continue;
		}
		const cleanSrc = safeSrc.split('?')[0] || safeSrc;
		const exists = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).some(
			(el) => ((el.getAttribute('src') || '').split('?')[0] || '') === cleanSrc
		);
		if (!exists && !injectedViewportScripts.has(cleanSrc)) {
			injectedViewportScripts.add(cleanSrc);
			const script = document.createElement('script');
			script.type = 'module';
			script.src = safeSrc;
			document.head.appendChild(script);
		}
	}
}

export function ensureViewportModeStylesLoaded(mode: string, viewStyles?: Record<string, string[]>): void {
	if (typeof document === 'undefined' || !viewStyles) {
		return;
	}
	const key = mode.toLowerCase();
	const styles = viewStyles[key] || [];
	for (const href of styles) {
		const safeHref = sanitizeAssetUrl(href);
		if (!safeHref) {
			continue;
		}
		const cleanHref = safeHref.split('?')[0] || safeHref;
		const exists = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')).some(
			(el) => ((el.getAttribute('href') || '').split('?')[0] || '') === cleanHref
		);
		if (!exists && !injectedViewportStyles.has(cleanHref)) {
			injectedViewportStyles.add(cleanHref);
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = safeHref;
			document.head.appendChild(link);
		}
	}
}
