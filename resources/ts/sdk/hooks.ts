import type {
	EditPresenceSnapshot,
	FetchGatewayJsonOptions,
	GatewayHttpMethod,
	GatewayJsonResult,
	KeyboardShortcutBinding,
	KeyboardShortcutGroup,
	KeyboardShortcutsProviderProps,
	PresenceCoEditor,
	PresenceLastSaved,
	RegisteredKeyboardShortcut,
	ThemeMode,
	ThemePresetId,
	ThemePresetMeta,
	UseDirtyFormBridgeOptions,
	UseDirtyFormBridgeResult,
	UseEditPresenceOptions,
	UseEditPresenceResult,
	UseThemeOptions,
	UseThemeResult,
	UseUnsavedChangesGuardOptions,
} from '../hooks';
import type { TranslationDictionary, TranslationParams, Translator } from '../lib/i18n';
import type { CsrfTokenSource } from '../lib/utils';
import { requireReactRuntime } from './optional';

const runtime = requireReactRuntime();

export const {
	t,
	translate,
	useTranslations,
	registerTranslations,
	hasTranslation,
	getLocale,
	getCsrfToken,
} = runtime;

export const {
	fetchGatewayJson,
	applyThemeCss,
	applyThemeMode,
	THEME_PRESETS,
	useTheme,
	dispatchDirtyFormState,
	markHostFormDirty,
	useDirtyFormBridge,
	useUnsavedChangesGuard,
	useEditPresence,
	KeyboardShortcutsProvider,
	useKeyboardShortcuts,
	useRegisteredKeyboardShortcuts,
	formatShortcutKeys,
} = runtime.Hooks;

export type {
	CsrfTokenSource,
	EditPresenceSnapshot,
	FetchGatewayJsonOptions,
	GatewayHttpMethod,
	GatewayJsonResult,
	KeyboardShortcutBinding,
	KeyboardShortcutGroup,
	KeyboardShortcutsProviderProps,
	PresenceCoEditor,
	PresenceLastSaved,
	RegisteredKeyboardShortcut,
	ThemeMode,
	ThemePresetId,
	ThemePresetMeta,
	TranslationDictionary,
	TranslationParams,
	Translator,
	UseDirtyFormBridgeOptions,
	UseDirtyFormBridgeResult,
	UseEditPresenceOptions,
	UseEditPresenceResult,
	UseThemeOptions,
	UseThemeResult,
	UseUnsavedChangesGuardOptions,
};
