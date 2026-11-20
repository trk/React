import { useCallback, useEffect, useState } from 'react';
import { fetchGatewayJson } from './fetchGatewayJson';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemePresetId =
	| 'native'
	| 'neutral'
	| 'slate'
	| 'ocean'
	| 'emerald'
	| 'violet'
	| 'rose'
	| 'amber'
	| 'custom';

export interface ThemePresetMeta {
	id: ThemePresetId;
	labelKey: string;
	defaultLabel: string;
	swatch: string;
	darkSwatch?: string;
}

export const THEME_PRESETS: readonly ThemePresetMeta[] = [
	{
		id: 'native',
		labelKey: 'shell.themePresetNative',
		defaultLabel: 'Native Admin',
		swatch: 'var(--pw-main-color, #eb1d61)',
	},
	{
		id: 'neutral',
		labelKey: 'shell.themePresetNeutral',
		defaultLabel: 'Neutral',
		swatch: '#171717',
		darkSwatch: '#e5e5e5',
	},
	{
		id: 'slate',
		labelKey: 'shell.themePresetSlate',
		defaultLabel: 'Slate',
		swatch: '#1e293b',
		darkSwatch: '#e2e8f0',
	},
	{
		id: 'ocean',
		labelKey: 'shell.themePresetOcean',
		defaultLabel: 'Ocean',
		swatch: '#2563eb',
		darkSwatch: '#3b82f6',
	},
	{
		id: 'emerald',
		labelKey: 'shell.themePresetEmerald',
		defaultLabel: 'Emerald',
		swatch: '#059669',
		darkSwatch: '#34d399',
	},
	{
		id: 'violet',
		labelKey: 'shell.themePresetViolet',
		defaultLabel: 'Violet',
		swatch: '#7c3aed',
		darkSwatch: '#a78bfa',
	},
	{
		id: 'rose',
		labelKey: 'shell.themePresetRose',
		defaultLabel: 'Rose',
		swatch: '#e11d48',
		darkSwatch: '#fb7185',
	},
	{
		id: 'amber',
		labelKey: 'shell.themePresetAmber',
		defaultLabel: 'Amber',
		swatch: '#d97706',
		darkSwatch: '#fbbf24',
	},
	{
		id: 'custom',
		labelKey: 'shell.themePresetCustom',
		defaultLabel: 'Custom Tokens',
		swatch: '#6366f1',
		darkSwatch: '#818cf8',
	},
] as const;

const THEME_STORAGE_KEY = 'react-workspace-theme-mode';
const THEME_STYLE_ELEMENT_ID = 'rw-theme-tokens';

function normalizeThemeMode(raw?: unknown): ThemeMode | null {
	return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
}

function normalizeThemePreset(raw?: unknown): ThemePresetId | null {
	if (typeof raw !== 'string') {
		return null;
	}
	const normalized = raw.trim().toLowerCase() as ThemePresetId;
	return THEME_PRESETS.some((item) => item.id === normalized) ? normalized : null;
}

/**
 * Apply or remove the central `<style id="rw-theme-tokens">` stylesheet in `document.head`.
 */
export function applyThemeCss(css: string): void {
	if (typeof document === 'undefined') {
		return;
	}
	const existing = document.getElementById(THEME_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
	const trimmed = css.trim();
	if (trimmed === '') {
		existing?.remove();
		return;
	}
	const styleEl = existing ?? document.createElement('style');
	styleEl.id = THEME_STYLE_ELEMENT_ID;
	styleEl.textContent = css;
	if (!styleEl.parentNode && document.head) {
		document.head.appendChild(styleEl);
	}
}

/**
 * Synchronize Light/Dark/System mode classes across `<html>`, `<body>`, and `localStorage`.
 */
export function applyThemeMode(mode: ThemeMode): boolean {
	if (typeof document === 'undefined') {
		return mode === 'dark';
	}
	const prefersDark =
		typeof window !== 'undefined' && typeof window.matchMedia === 'function'
			? window.matchMedia('(prefers-color-scheme: dark)').matches
			: false;
	const isDark = mode === 'dark' || (mode === 'system' && prefersDark);

	document.documentElement.classList.toggle('dark', isDark);
	document.documentElement.classList.toggle('light', !isDark);
	document.documentElement.setAttribute('data-theme-mode', mode);
	if (document.body) {
		document.body.classList.toggle('dark-theme', isDark);
		document.body.classList.toggle('light-theme', !isDark);
		document.body.classList.toggle('auto-theme', mode === 'system');
	}
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			window.localStorage.setItem(THEME_STORAGE_KEY, mode);
		}
	} catch {
		// Ignore restricted storage environments
	}
	return isDark;
}

export interface UseThemeOptions {
	initialMode?: ThemeMode | null;
	initialPreset?: ThemePresetId | null;
	initialUserPreset?: string | null;
	siteDefaultPreset?: ThemePresetId | null;
	prefsEndpoint?: string;
	syncToServer?: boolean;
}

export interface UseThemeResult {
	themeMode: ThemeMode;
	resolvedDark: boolean;
	themePreset: ThemePresetId;
	userThemePreset: string;
	siteDefaultThemePreset: ThemePresetId;
	presetPending: boolean;
	setThemeMode: (mode: ThemeMode) => void;
	cycleThemeMode: () => void;
	setThemePreset: (preset: ThemePresetId | '') => Promise<boolean>;
}

/**
 * Synchronized Light/Dark/System scheme + per-user color preset controller.
 */
export function useTheme(options: UseThemeOptions = {}): UseThemeResult {
	const {
		initialMode,
		initialPreset,
		initialUserPreset,
		siteDefaultPreset,
		prefsEndpoint = '/_react/workspace-prefs',
		syncToServer = true,
	} = options;

	const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
		const explicit = normalizeThemeMode(initialMode);
		if (explicit) {
			return explicit;
		}
		if (typeof document !== 'undefined') {
			const attr = normalizeThemeMode(document.documentElement.getAttribute('data-theme-mode'));
			if (attr) {
				return attr;
			}
		}
		if (typeof window !== 'undefined') {
			try {
				const saved = normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
				if (saved) {
					return saved;
				}
			} catch {
				// Ignore storage access errors
			}
		}
		return 'system';
	});

	const [resolvedDark, setResolvedDark] = useState<boolean>(() => {
		if (themeMode === 'dark') {
			return true;
		}
		if (themeMode === 'light') {
			return false;
		}
		if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
			return window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
		return false;
	});

	const [siteDefaultThemePreset, setSiteDefaultThemePreset] = useState<ThemePresetId>(
		() => normalizeThemePreset(siteDefaultPreset) ?? 'native'
	);
	const [userThemePreset, setUserThemePreset] = useState<string>(
		() => normalizeThemePreset(initialUserPreset) ?? ''
	);
	const [themePreset, setThemePresetState] = useState<ThemePresetId>(
		() => normalizeThemePreset(initialPreset) ?? normalizeThemePreset(siteDefaultPreset) ?? 'native'
	);
	const [presetPending, setPresetPending] = useState(false);

	useEffect(() => {
		const normalized = normalizeThemeMode(initialMode);
		if (normalized) {
			setThemeModeState(normalized);
		}
	}, [initialMode]);

	useEffect(() => {
		const normalized = normalizeThemePreset(initialPreset);
		if (normalized) {
			setThemePresetState(normalized);
		}
	}, [initialPreset]);

	useEffect(() => {
		if (typeof initialUserPreset === 'string') {
			setUserThemePreset(normalizeThemePreset(initialUserPreset) ?? '');
		}
	}, [initialUserPreset]);

	useEffect(() => {
		const normalized = normalizeThemePreset(siteDefaultPreset);
		if (normalized) {
			setSiteDefaultThemePreset(normalized);
		}
	}, [siteDefaultPreset]);

	useEffect(() => {
		const sync = () => {
			setResolvedDark(applyThemeMode(themeMode));
		};
		sync();
		if (
			themeMode === 'system' &&
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function'
		) {
			const mql = window.matchMedia('(prefers-color-scheme: dark)');
			if (typeof mql.addEventListener === 'function') {
				mql.addEventListener('change', sync);
				return () => mql.removeEventListener('change', sync);
			}
		}
		return undefined;
	}, [themeMode]);

	const setThemeMode = useCallback(
		(nextMode: ThemeMode) => {
			const previousMode = themeMode;
			setThemeModeState(nextMode);
			if (syncToServer) {
				void fetchGatewayJson<{ themeMode?: string }>(prefsEndpoint, {
					method: 'POST',
					payload: {
						action: 'set_theme_mode',
						themeMode: nextMode,
					},
				}).then((res) => {
					if (!res.ok) {
						setThemeModeState(previousMode);
						return;
					}
					const serverMode = normalizeThemeMode(res.data?.themeMode);
					if (serverMode) {
						setThemeModeState(serverMode);
					}
				});
			}
		},
		[themeMode, prefsEndpoint, syncToServer]
	);

	const cycleThemeMode = useCallback(() => {
		const nextMode: ThemeMode =
			themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system';
		setThemeMode(nextMode);
	}, [themeMode, setThemeMode]);

	const setThemePreset = useCallback(
		async (nextPreset: ThemePresetId | ''): Promise<boolean> => {
			const previousPreset = themePreset;
			const previousUserPreset = userThemePreset;
			const optimisticUserPreset = nextPreset === '' ? '' : nextPreset;
			const optimisticEffective = nextPreset === '' ? siteDefaultThemePreset : nextPreset;
			setUserThemePreset(optimisticUserPreset);
			setThemePresetState(optimisticEffective);
			if (!syncToServer) {
				return true;
			}
			setPresetPending(true);
			try {
				const res = await fetchGatewayJson<{
					themePreset?: string;
					userThemePreset?: string;
					siteDefaultThemePreset?: string;
					themeCss?: string;
				}>(prefsEndpoint, {
					method: 'POST',
					payload: {
						action: 'set_theme_preset',
						themePreset: nextPreset,
					},
				});
				if (!res.ok) {
					setThemePresetState(previousPreset);
					setUserThemePreset(previousUserPreset);
					return false;
				}
				const serverSiteDefault = normalizeThemePreset(res.data?.siteDefaultThemePreset);
				if (serverSiteDefault) {
					setSiteDefaultThemePreset(serverSiteDefault);
				}
				const serverUserOverride =
					typeof res.data?.userThemePreset === 'string'
						? (normalizeThemePreset(res.data.userThemePreset) ?? '')
						: optimisticUserPreset;
				setUserThemePreset(serverUserOverride);
				const serverPreset = normalizeThemePreset(res.data?.themePreset);
				if (serverPreset) {
					setThemePresetState(serverPreset);
				}
				if (typeof res.data?.themeCss === 'string') {
					applyThemeCss(res.data.themeCss);
				}
				return true;
			} finally {
				setPresetPending(false);
			}
		},
		[themePreset, userThemePreset, siteDefaultThemePreset, prefsEndpoint, syncToServer]
	);

	return {
		themeMode,
		resolvedDark,
		themePreset,
		userThemePreset,
		siteDefaultThemePreset,
		presetPending,
		setThemeMode,
		cycleThemeMode,
		setThemePreset,
	};
}
