import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { safeUsePage } from './inertia-bridge';

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;
export type TranslationDictionary = Record<string, string>;

export interface Translator {
	locale: string;
	namespace: string;
	t: (key: string, paramsOrFallback?: TranslationParams | string, fallback?: string) => string;
	has: (key: string) => boolean;
}

let activeLocale = 'en';
let storeVersion = 0;
let domBootstrapped = false;

const catalogs = new Map<string, TranslationDictionary>();
const listeners = new Set<() => void>();

function notifyListeners(): void {
	storeVersion += 1;
	listeners.forEach((fn) => fn());
}

function subscribeCatalog(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function getCatalogSnapshot(): number {
	return storeVersion;
}

const BLOCKED_DICT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function mergeFlatEntries(
	target: TranslationDictionary,
	source: Record<string, unknown>,
	prefix = ''
): boolean {
	let changed = false;
	for (const [rawKey, val] of Object.entries(source)) {
		const cleanKey = rawKey.trim();
		if (!cleanKey || BLOCKED_DICT_KEYS.has(cleanKey)) {
			continue;
		}
		const fullKey = prefix ? `${prefix}.${cleanKey}` : cleanKey;
		if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
			if (mergeFlatEntries(target, val as Record<string, unknown>, fullKey)) {
				changed = true;
			}
		} else if (typeof val === 'string' || typeof val === 'number') {
			const strVal = String(val);
			if (target[fullKey] !== strVal) {
				target[fullKey] = strVal;
				changed = true;
			}
		}
	}
	return changed;
}

function setNamespaceEntries(namespace: string, entries: unknown): boolean {
	const cleanNs = namespace.trim();
	if (!cleanNs || BLOCKED_DICT_KEYS.has(cleanNs) || !entries || typeof entries !== 'object' || Array.isArray(entries)) {
		return false;
	}
	let bucket = catalogs.get(cleanNs);
	if (!bucket) {
		bucket = Object.create(null) as TranslationDictionary;
		catalogs.set(cleanNs, bucket);
	}
	return mergeFlatEntries(bucket, entries as Record<string, unknown>);
}

export function ingestTranslationPayload(payload?: Record<string, unknown> | null, notify = true): boolean {
	if (!payload || typeof payload !== 'object') {
		return false;
	}

	let changed = false;
	const rawLocale = payload.i18nLocale;
	if (typeof rawLocale === 'string' && rawLocale.trim() !== '') {
		const normalizedLocale = rawLocale.trim();
		if (normalizedLocale !== activeLocale) {
			activeLocale = normalizedLocale;
			catalogs.clear();
			changed = true;
		}
	}

	const nestedI18n = payload.i18n;
	if (nestedI18n && typeof nestedI18n === 'object' && !Array.isArray(nestedI18n)) {
		for (const [ns, dict] of Object.entries(nestedI18n as Record<string, unknown>)) {
			if (setNamespaceEntries(ns, dict)) {
				changed = true;
			}
		}
	}

	for (const [key, val] of Object.entries(payload)) {
		if (key.startsWith('i18n.') && key.length > 5) {
			if (setNamespaceEntries(key.slice(5), val)) {
				changed = true;
			}
		}
	}

	if (changed && notify) {
		notifyListeners();
	}

	return changed;
}

export function syncTranslationsFromDom(notify = false): void {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return;
	}

	if (!domBootstrapped) {
		domBootstrapped = true;
		const docLang = document.documentElement?.getAttribute('lang')?.trim();
		if (docLang) {
			activeLocale = docLang;
		}

		const pageScript = document.querySelector('script[type="application/json"][data-page="app"]');
		if (pageScript?.textContent) {
			try {
				const parsed = JSON.parse(pageScript.textContent);
				if (parsed?.props && typeof parsed.props === 'object') {
					ingestTranslationPayload(parsed.props as Record<string, unknown>, false);
				}
			} catch {
				// Ignore malformed JSON
			}
		}

		const onInertiaPageEvent = (event: Event) => {
			const pageProps = (event as CustomEvent)?.detail?.page?.props;
			if (pageProps && typeof pageProps === 'object') {
				ingestTranslationPayload(pageProps as Record<string, unknown>, true);
			}
		};
		document.addEventListener('inertia:navigate', onInertiaPageEvent);
		document.addEventListener('inertia:success', onInertiaPageEvent);
	}

	const pwConfig = (window as unknown as { ProcessWire?: { config?: Record<string, unknown> } }).ProcessWire?.config;
	if (pwConfig && typeof pwConfig === 'object') {
		if (pwConfig.InertiaShared && typeof pwConfig.InertiaShared === 'object') {
			ingestTranslationPayload(pwConfig.InertiaShared as Record<string, unknown>, notify);
		}
		if (pwConfig.ReactWorkspaceI18n && typeof pwConfig.ReactWorkspaceI18n === 'object') {
			ingestTranslationPayload({ i18n: pwConfig.ReactWorkspaceI18n }, notify);
		}
	}
}

export function getLocale(): string {
	syncTranslationsFromDom(false);
	return activeLocale;
}

export function registerTranslations(
	namespace: string,
	entries: Record<string, unknown>,
	locale?: string
): void {
	let changed = false;
	if (typeof locale === 'string' && locale.trim() !== '' && locale.trim() !== activeLocale) {
		activeLocale = locale.trim();
		catalogs.clear();
		changed = true;
	}
	if (setNamespaceEntries(namespace, entries)) {
		changed = true;
	}
	if (changed) {
		notifyListeners();
	}
}

export function hasTranslation(namespace: string, key: string): boolean {
	syncTranslationsFromDom(false);
	const nsDict = catalogs.get(namespace);
	if (nsDict && Object.prototype.hasOwnProperty.call(nsDict, key)) {
		return true;
	}
	if (namespace !== 'core') {
		const coreDict = catalogs.get('core');
		if (coreDict && Object.prototype.hasOwnProperty.call(coreDict, key)) {
			return true;
		}
	}
	return false;
}

function interpolateParams(template: string, params?: TranslationParams): string {
	if (!params || !template.includes('{')) {
		return template;
	}
	return template.replace(/\{(\w+)\}/g, (match, token: string) => {
		const val = params[token];
		return val !== undefined && val !== null ? String(val) : match;
	});
}

export function translate(
	namespace: string,
	key: string,
	paramsOrFallback?: TranslationParams | string,
	fallback?: string
): string {
	syncTranslationsFromDom(false);
	const params =
		typeof paramsOrFallback === 'object' && paramsOrFallback !== null ? paramsOrFallback : undefined;
	const defaultText = typeof paramsOrFallback === 'string' ? paramsOrFallback : (fallback ?? key);

	const nsDict = catalogs.get(namespace);
	let resolved = nsDict && Object.prototype.hasOwnProperty.call(nsDict, key) ? nsDict[key] : undefined;
	if (resolved === undefined && namespace !== 'core') {
		const coreDict = catalogs.get('core');
		if (coreDict && Object.prototype.hasOwnProperty.call(coreDict, key)) {
			resolved = coreDict[key];
		}
	}

	return interpolateParams(resolved ?? defaultText, params);
}

export function t(
	key: string,
	paramsOrFallback?: TranslationParams | string,
	fallback?: string
): string {
	return translate('core', key, paramsOrFallback, fallback);
}

export function useTranslations(namespace = 'core'): Translator {
	syncTranslationsFromDom(false);
	const page = safeUsePage<Record<string, unknown>>();
	if (page?.props && typeof page.props === 'object') {
		ingestTranslationPayload(page.props, false);
	}

	const version = useSyncExternalStore(subscribeCatalog, getCatalogSnapshot, getCatalogSnapshot);

	const boundT = useCallback(
		(key: string, paramsOrFallback?: TranslationParams | string, fallback?: string): string =>
			translate(namespace, key, paramsOrFallback, fallback),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[namespace, version]
	);

	const boundHas = useCallback(
		(key: string): boolean => hasTranslation(namespace, key),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[namespace, version]
	);

	return useMemo(
		() => ({
			locale: activeLocale,
			namespace,
			t: boundT,
			has: boundHas,
		}),
		[namespace, boundT, boundHas]
	);
}
