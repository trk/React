import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Button, Input } from '../../ui';
import {
	CharacterCountBadge,
	dispatchDomChange,
	FieldStatusRow,
	generateRandomHex,
	LanguageTabsBar,
	readInitialSyncedLanguageId,
	resolveIsoLangAttr,
	resolveScopedFieldValue,
	slugifyText,
} from '../shared';
import type { ReactInputfieldProps } from '../types';

function coerceSlugSourceString(raw: unknown): string {
	if (raw === null || raw === undefined) {
		return '';
	}
	if (typeof raw === 'object') {
		if (Array.isArray(raw)) {
			return coerceSlugSourceString(raw[0]);
		}
		const record = raw as Record<string, unknown>;
		if ('default' in record) {
			return coerceSlugSourceString(record.default);
		}
		const first = Object.values(record)[0];
		return coerceSlugSourceString(first);
	}
	return String(raw);
}

export function TextField(props: ReactInputfieldProps): React.ReactElement {
	const hasLanguages = Array.isArray(props.languages) && props.languages.length > 1;
	const defaultScalar = coerceSlugSourceString(props.value);
	const languagesSignature = useMemo(() => {
		if (!props.languages || props.languages.length === 0) {
			return '';
		}
		return props.languages.map((lang) => `${lang.id}:${String(lang.value ?? '')}`).join('\u0000');
	}, [props.languages]);

	const [prevPropScalar, setPrevPropScalar] = useState<string>(defaultScalar);
	const [prevLangSignature, setPrevLangSignature] = useState<string>(languagesSignature);
	const [scalarValue, setScalarValue] = useState<string>(defaultScalar);
	const [langValues, setLangValues] = useState<Record<number, string>>(() => {
		const map: Record<number, string> = {};
		if (props.languages) {
			for (const lang of props.languages) {
				map[lang.id] = String(lang.value ?? '');
			}
		}
		return map;
	});

	if (defaultScalar !== prevPropScalar) {
		setPrevPropScalar(defaultScalar);
		if (scalarValue !== defaultScalar) {
			setScalarValue(defaultScalar);
		}
	}
	if (languagesSignature !== prevLangSignature) {
		setPrevLangSignature(languagesSignature);
		if (props.languages && props.languages.length > 0) {
			const nextLangMap: Record<number, string> = { ...langValues };
			let langChanged = false;
			for (const lang of props.languages) {
				const incoming = String(lang.value ?? '');
				if (nextLangMap[lang.id] !== incoming) {
					nextLangMap[lang.id] = incoming;
					langChanged = true;
				}
			}
			if (langChanged) {
				setLangValues(nextLangMap);
			}
		}
	}
	const [internalLangId, setInternalLangId] = useState<number>(() =>
		readInitialSyncedLanguageId(props.languages)
	);
	const [expandedAll, setExpandedAll] = useState<boolean>(false);
	const activeLangId =
		typeof props.activeLangId === 'number' && props.activeLangId > 0
			? props.activeLangId
			: internalLangId;
	const setActiveLangId = (nextId: number) => {
		setInternalLangId(nextId);
		props.onSelectLanguage?.(nextId);
	};

	const [secretMasked, setSecretMasked] = useState<boolean>(() => Boolean(props.secret?.masked));
	const [secretCopied, setSecretCopied] = useState<boolean>(false);
	const lockWhenPopulated = props.slugLocked !== false;
	const [slugLocked, setSlugLocked] = useState<boolean>(
		() => lockWhenPopulated && defaultScalar.trim().length > 0
	);
	const [langSlugLocked, setLangSlugLocked] = useState<Record<number, boolean>>(() => {
		const map: Record<number, boolean> = {};
		if (props.languages) {
			for (const lang of props.languages) {
				map[lang.id] = lockWhenPopulated && String(lang.value ?? '').trim().length > 0;
			}
		}
		return map;
	});

	const inputRef = useRef<HTMLInputElement | null>(null);
	const langInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
	const prevSlugSourceRef = useRef<string | undefined>(undefined);
	const prevLangSlugSourcesRef = useRef<Record<number, string> | undefined>(undefined);
	const scalarValueRef = useRef(scalarValue);
	scalarValueRef.current = scalarValue;
	const langValuesRef = useRef(langValues);
	langValuesRef.current = langValues;
	const langSlugLockedRef = useRef(langSlugLocked);
	langSlugLockedRef.current = langSlugLocked;
	const languagesRef = useRef(props.languages);
	languagesRef.current = props.languages;
	const onValueChangeRef = useRef(props.onValueChange);
	onValueChangeRef.current = props.onValueChange;

	const effectiveScopePrefix =
		props.scopePrefix !== undefined
			? props.scopePrefix
			: props.slugFrom && props.name.includes('_') && !props.name.endsWith(`_${props.slugFrom}`)
				? props.name.slice(0, props.name.lastIndexOf('_'))
				: undefined;

	const emitLangSlugChange = (
		lang: NonNullable<ReactInputfieldProps['languages']>[number],
		nextLangSlug: string
	) => {
		if (lang.isDefault) {
			setScalarValue(nextLangSlug);
			onValueChangeRef.current?.(props.name, nextLangSlug);
			if (lang.inputName && lang.inputName !== props.name) {
				onValueChangeRef.current?.(lang.inputName, nextLangSlug);
			}
		} else {
			onValueChangeRef.current?.(lang.inputName || `${props.name}__${lang.id}`, nextLangSlug);
		}
	};

	// Reactive formValues watcher for connected slug fields inside <SchemaForm />
	useEffect(() => {
		if (!props.slugFrom || props.readOnly || props.disabled || !props.formValues) {
			return;
		}
		const separator = props.slugSeparator || '-';
		const maxLen = props.slugMaxLength || props.maxLength || 128;

		if (hasLanguages && languagesRef.current && languagesRef.current.length > 0) {
			const nextSources: Record<number, string> = {};
			for (const lang of languagesRef.current) {
				const langSourceKey = lang.isDefault ? props.slugFrom : `${props.slugFrom}__${lang.id}`;
				const rawLangSource = resolveScopedFieldValue(
					props.formValues,
					langSourceKey,
					effectiveScopePrefix
				);
				nextSources[lang.id] = coerceSlugSourceString(rawLangSource);
			}

			const prevSources = prevLangSlugSourcesRef.current;
			if (prevSources === undefined) {
				prevLangSlugSourcesRef.current = nextSources;
				const initialEmptyTargets = languagesRef.current.filter(
					(lang) =>
						!langSlugLockedRef.current[lang.id] &&
						(langValuesRef.current[lang.id] ?? '').trim() === '' &&
						(nextSources[lang.id] ?? '').trim() !== ''
				);
				if (initialEmptyTargets.length > 0) {
					setLangValues((prev) => {
						const updated = { ...prev };
						for (const lang of initialEmptyTargets) {
							updated[lang.id] = slugifyText(nextSources[lang.id] ?? '', separator, maxLen);
						}
						return updated;
					});
					for (const lang of initialEmptyTargets) {
						const nextLangSlug = slugifyText(nextSources[lang.id] ?? '', separator, maxLen);
						emitLangSlugChange(lang, nextLangSlug);
					}
				}
				return;
			}

			const changedLangs = languagesRef.current.filter(
				(lang) => prevSources[lang.id] !== nextSources[lang.id]
			);
			if (changedLangs.length === 0) {
				return;
			}
			prevLangSlugSourcesRef.current = nextSources;

			const unlockedChangedLangs = changedLangs.filter(
				(lang) => !langSlugLockedRef.current[lang.id]
			);
			if (unlockedChangedLangs.length === 0) {
				return;
			}

			setLangValues((prev) => {
				const updated = { ...prev };
				for (const lang of unlockedChangedLangs) {
					updated[lang.id] = slugifyText(nextSources[lang.id] ?? '', separator, maxLen);
				}
				return updated;
			});

			for (const lang of unlockedChangedLangs) {
				const nextLangSlug = slugifyText(nextSources[lang.id] ?? '', separator, maxLen);
				emitLangSlugChange(lang, nextLangSlug);
			}
			return;
		}

		const rawSource = resolveScopedFieldValue(props.formValues, props.slugFrom, effectiveScopePrefix);
		const sourceStr = coerceSlugSourceString(rawSource);

		if (prevSlugSourceRef.current === undefined) {
			prevSlugSourceRef.current = sourceStr;
			if (!slugLocked && scalarValueRef.current.trim() === '' && sourceStr.trim() !== '') {
				const initialSlug = slugifyText(sourceStr, separator, maxLen);
				setScalarValue(initialSlug);
				onValueChangeRef.current?.(props.name, initialSlug);
			}
			return;
		}
		if (prevSlugSourceRef.current === sourceStr) {
			return;
		}
		prevSlugSourceRef.current = sourceStr;

		if (slugLocked) {
			return;
		}
		const nextSlug = slugifyText(sourceStr, separator, maxLen);
		setScalarValue(nextSlug);
		onValueChangeRef.current?.(props.name, nextSlug);
	}, [
		props.formValues,
		effectiveScopePrefix,
		props.slugFrom,
		props.slugSeparator,
		props.slugMaxLength,
		props.maxLength,
		props.name,
		props.readOnly,
		props.disabled,
		slugLocked,
		langSlugLocked,
		hasLanguages,
	]);

	// Standalone DOM fallback when rendered as an isolated island outside <SchemaForm /> (no props.formValues)
	useEffect(() => {
		if (
			props.formValues !== undefined ||
			!props.slugFrom ||
			props.readOnly ||
			props.disabled ||
			typeof document === 'undefined'
		) {
			return;
		}
		const anchorInput = hasLanguages
			? (langInputRefs.current[activeLangId] ?? Object.values(langInputRefs.current).find(Boolean) ?? null)
			: inputRef.current;
		if (!anchorInput) {
			return;
		}
		const scope =
			anchorInput.closest('[data-block-id]') ||
			anchorInput.closest('form') ||
			document;
		const prefixMatch = props.name.endsWith(`_${props.slugFrom}`)
			? props.name
			: props.name.includes('_')
				? `${props.name.slice(0, props.name.lastIndexOf('_'))}_${props.slugFrom}`
				: props.slugFrom;
		const separator = props.slugSeparator || '-';
		const maxLen = props.slugMaxLength || props.maxLength || 128;

		if (hasLanguages && languagesRef.current && languagesRef.current.length > 0) {
			const cleanups: Array<() => void> = [];
			for (const lang of languagesRef.current) {
				const scopedLangSource = lang.isDefault ? prefixMatch : `${prefixMatch}__${lang.id}`;
				const plainLangSource = lang.isDefault ? props.slugFrom : `${props.slugFrom}__${lang.id}`;
				const sourceEl =
					scope.querySelector<HTMLInputElement>(
						`input[name="${CSS.escape(scopedLangSource)}"], input[name="${CSS.escape(plainLangSource)}"]`
					) ?? null;
				if (!sourceEl) {
					continue;
				}
				const targetLangInput = langInputRefs.current[lang.id];
				if (
					!langSlugLockedRef.current[lang.id] &&
					(langValuesRef.current[lang.id] ?? '').trim() === '' &&
					sourceEl.value.trim() !== ''
				) {
					const initialSlug = slugifyText(sourceEl.value, separator, maxLen);
					setLangValues((prev) => ({ ...prev, [lang.id]: initialSlug }));
					emitLangSlugChange(lang, initialSlug);
				}
				const handleLangSourceInput = () => {
					if (langSlugLockedRef.current[lang.id]) {
						return;
					}
					const rawValue = sourceEl.value;
					queueMicrotask(() => {
						const nextSlug = slugifyText(rawValue, separator, maxLen);
						setLangValues((prev) => ({ ...prev, [lang.id]: nextSlug }));
						emitLangSlugChange(lang, nextSlug);
						window.requestAnimationFrame(() => dispatchDomChange(targetLangInput));
					});
				};
				sourceEl.addEventListener('input', handleLangSourceInput);
				cleanups.push(() => sourceEl.removeEventListener('input', handleLangSourceInput));
			}
			return () => {
				for (const fn of cleanups) {
					fn();
				}
			};
		}

		const sourceEl =
			scope.querySelector<HTMLInputElement>(
				`input[name="${CSS.escape(prefixMatch)}"], input[name="${CSS.escape(props.slugFrom)}"]`
			) ?? null;
		if (!sourceEl) {
			return;
		}
		if (!slugLocked && scalarValueRef.current.trim() === '' && sourceEl.value.trim() !== '') {
			const initialSlug = slugifyText(sourceEl.value, separator, maxLen);
			setScalarValue(initialSlug);
			onValueChangeRef.current?.(props.name, initialSlug);
		}

		const handleSourceInput = () => {
			if (slugLocked) {
				return;
			}
			const rawValue = sourceEl.value;
			queueMicrotask(() => {
				const nextSlug = slugifyText(rawValue, separator, maxLen);
				setScalarValue(nextSlug);
				onValueChangeRef.current?.(props.name, nextSlug);
				window.requestAnimationFrame(() => dispatchDomChange(anchorInput));
			});
		};

		sourceEl.addEventListener('input', handleSourceInput);
		return () => sourceEl.removeEventListener('input', handleSourceInput);
	}, [
		props.formValues,
		props.slugFrom,
		props.slugSeparator,
		props.slugMaxLength,
		props.maxLength,
		props.name,
		props.readOnly,
		props.disabled,
		slugLocked,
		langSlugLocked,
		hasLanguages,
		activeLangId,
	]);

	const activeValue = hasLanguages ? (langValues[activeLangId] ?? '') : scalarValue;
	const isActiveSlugLocked = hasLanguages ? Boolean(langSlugLocked[activeLangId]) : slugLocked;
	const currentLength = Array.from(activeValue).length;
	const maxLimit = props.maxLength ?? 0;

	const dataAttrs: Record<string, string> = { ...(props.dataAttributes ?? {}) };
	if (props.slugFrom) {
		const lockVal = isActiveSlugLocked ? '1' : '0';
		dataAttrs['data-rw-slug-locked'] = lockVal;
		for (const k of Object.keys(dataAttrs)) {
			if (k.endsWith('-slug-locked')) {
				dataAttrs[k] = lockVal;
			}
		}
	}
	if (props.secret) {
		const maskVal = secretMasked ? '1' : '0';
		dataAttrs['data-rw-secret-masked'] = maskVal;
		for (const k of Object.keys(dataAttrs)) {
			if (k.endsWith('-secret-masked')) {
				dataAttrs[k] = maskVal;
			}
		}
	}

	const resolvedType = props.secret
		? secretMasked
			? 'password'
			: 'text'
		: props.controlType === 'number'
			? 'number'
			: props.inputType ||
				(props.controlType === 'email' || props.controlType === 'url' || props.controlType === 'tel'
					? props.controlType
					: 'text');

	const handleGenerateSecret = () => {
		if (!props.secret || props.readOnly || props.disabled) {
			return;
		}
		const generated = `${props.secret.prefix || ''}${generateRandomHex(props.secret.bytes || 32)}`;
		setScalarValue(generated);
		props.onValueChange?.(props.name, generated);
		setSecretMasked(false);
		window.requestAnimationFrame(() => dispatchDomChange(inputRef.current));
	};

	const handleCopySecret = () => {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			navigator.clipboard.writeText(activeValue).catch(() => {});
		}
		setSecretCopied(true);
		window.setTimeout(() => setSecretCopied(false), 1500);
	};

	const resolveSourceForLang = (
		lang?: NonNullable<ReactInputfieldProps['languages']>[number]
	): string => {
		if (!props.slugFrom) {
			return '';
		}
		if (props.formValues) {
			const langSourceKey =
				lang && !lang.isDefault ? `${props.slugFrom}__${lang.id}` : props.slugFrom;
			return coerceSlugSourceString(
				resolveScopedFieldValue(props.formValues, langSourceKey, effectiveScopePrefix)
			);
		}
		if (typeof document !== 'undefined') {
			const anchor =
				(lang ? langInputRefs.current[lang.id] : inputRef.current) ?? inputRef.current;
			const scope =
				anchor?.closest('[data-block-id]') || anchor?.closest('form') || document;
			const prefixMatch = props.name.endsWith(`_${props.slugFrom}`)
				? props.name
				: props.name.includes('_')
					? `${props.name.slice(0, props.name.lastIndexOf('_'))}_${props.slugFrom}`
					: props.slugFrom;
			const scopedKey = lang && !lang.isDefault ? `${prefixMatch}__${lang.id}` : prefixMatch;
			const plainKey =
				lang && !lang.isDefault ? `${props.slugFrom}__${lang.id}` : props.slugFrom;
			const sourceEl = scope.querySelector<HTMLInputElement>(
				`input[name="${CSS.escape(scopedKey)}"], input[name="${CSS.escape(plainKey)}"]`
			);
			return sourceEl?.value ?? '';
		}
		return '';
	};

	const handleToggleSlugLock = () => {
		const separator = props.slugSeparator || '-';
		const maxLen = props.slugMaxLength || props.maxLength || 128;

		if (hasLanguages && languagesRef.current && languagesRef.current.length > 0) {
			const currentLocked = Boolean(langSlugLocked[activeLangId]);
			if (!currentLocked) {
				setLangSlugLocked((prev) => ({ ...prev, [activeLangId]: true }));
				return;
			}
			setLangSlugLocked((prev) => ({ ...prev, [activeLangId]: false }));
			if (!props.slugFrom || props.readOnly || props.disabled) {
				return;
			}
			const activeLang =
				languagesRef.current.find((l) => l.id === activeLangId) ?? languagesRef.current[0];
			if (!activeLang) {
				return;
			}
			const sourceStr = resolveSourceForLang(activeLang);
			if (prevLangSlugSourcesRef.current) {
				prevLangSlugSourcesRef.current = {
					...prevLangSlugSourcesRef.current,
					[activeLang.id]: sourceStr,
				};
			}
			const nextLangSlug = slugifyText(sourceStr, separator, maxLen);
			setLangValues((prev) => ({ ...prev, [activeLang.id]: nextLangSlug }));
			emitLangSlugChange(activeLang, nextLangSlug);
			return;
		}

		if (!slugLocked) {
			setSlugLocked(true);
			return;
		}
		setSlugLocked(false);
		if (!props.slugFrom || props.readOnly || props.disabled) {
			return;
		}
		const sourceStr = resolveSourceForLang();
		prevSlugSourceRef.current = sourceStr;
		const nextSlug = slugifyText(sourceStr, separator, maxLen);
		setScalarValue(nextSlug);
		onValueChangeRef.current?.(props.name, nextSlug);
	};

	const hasPrefix = Boolean(props.affixPrefix);
	const hasSuffix = Boolean(props.affixSuffix);
	const showInlineLangBar = hasLanguages && Boolean(props.languages) && !props.hideLanguageTabs;
	const hasError = Boolean(props.error && props.error.trim() !== '');

	const renderLanguageInput = (
		lang: NonNullable<ReactInputfieldProps['languages']>[number],
		isVisible: boolean
	) => {
		const langReadOnly = Boolean(props.readOnly || !lang.editable);
		const isoLang = resolveIsoLangAttr(lang.name);
		return (
			<Input
				key={lang.id}
				ref={(el) => {
					langInputRefs.current[lang.id] = el;
					if (lang.isDefault) {
						inputRef.current = el;
					}
				}}
				id={lang.inputId}
				name={lang.inputName}
				lang={isoLang}
				type={resolvedType}
				value={langValues[lang.id] ?? ''}
				onChange={(e) => {
					const next = e.target.value;
					setLangValues((prev) => ({ ...prev, [lang.id]: next }));
					if (lang.isDefault) {
						setScalarValue(next);
						props.onValueChange?.(props.name, next);
						if (lang.inputName && lang.inputName !== props.name) {
							props.onValueChange?.(lang.inputName, next);
						}
					} else {
						props.onValueChange?.(lang.inputName || `${props.name}__${lang.id}`, next);
					}
					if (props.slugFrom) {
						const shouldLock = next.trim().length > 0;
						setLangSlugLocked((prev) =>
							prev[lang.id] === shouldLock ? prev : { ...prev, [lang.id]: shouldLock }
						);
					}
				}}
				onBlur={() => {
					if (
						props.slugFrom &&
						!langReadOnly &&
						!props.disabled &&
						(langValuesRef.current[lang.id] ?? '').trim() === ''
					) {
						const sourceStr = resolveSourceForLang(lang);
						if (sourceStr.trim() !== '') {
							const separator = props.slugSeparator || '-';
							const maxLen = props.slugMaxLength || props.maxLength || 128;
							const nextLangSlug = slugifyText(sourceStr, separator, maxLen);
							setLangSlugLocked((prev) => ({ ...prev, [lang.id]: false }));
							setLangValues((prev) => ({ ...prev, [lang.id]: nextLangSlug }));
							emitLangSlugChange(lang, nextLangSlug);
						}
					}
				}}
				placeholder={props.placeholder || undefined}
				readOnly={langReadOnly}
				disabled={props.disabled}
				required={isVisible && lang.isDefault ? props.required : undefined}
				aria-invalid={hasError ? 'true' : 'false'}
				aria-describedby={props.describedBy || undefined}
				minLength={props.minLength || undefined}
				maxLength={props.maxLength || undefined}
				pattern={props.pattern || undefined}
				className={cn(
					props.mono && 'font-mono text-xs',
					hasPrefix && 'rounded-l-none',
					hasSuffix && 'rounded-r-none',
					langReadOnly && 'bg-muted/40 text-muted-foreground',
					hasError && 'border-destructive',
					!isVisible && 'hidden'
				)}
				{...(lang.isDefault ? dataAttrs : {})}
			/>
		);
	};

	return (
		<div className="space-y-1.5" data-rw-control={props.controlType}>
			<div className="space-y-1.5" data-rw-field-slot="input">
				{showInlineLangBar && props.languages ? (
					<LanguageTabsBar
						languages={props.languages}
						activeLangId={activeLangId}
						values={langValues}
						onSelect={setActiveLangId}
						expandedAll={expandedAll}
						onToggleExpandAll={() => setExpandedAll((prev) => !prev)}
					/>
				) : null}

				{hasLanguages && props.languages && expandedAll ? (
					<div className="space-y-2">
						{props.languages.map((lang) => (
							<div key={`stack-${lang.id}`} className="space-y-1">
								<label
									htmlFor={lang.inputId}
									className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
								>
									{lang.title || lang.name}
								</label>
								<div className="relative flex items-stretch">
									{hasPrefix ? (
										<span
											className="inline-flex h-9 shrink-0 items-center rounded-l-md border border-r-0 border-input bg-muted/60 px-3 text-xs font-medium text-muted-foreground select-none"
											data-rw-affix-badge="prefix"
										>
											{props.affixPrefix}
										</span>
									) : null}
									{renderLanguageInput(lang, true)}
									{hasSuffix ? (
										<span
											className="inline-flex h-9 shrink-0 items-center rounded-r-md border border-l-0 border-input bg-muted/60 px-3 text-xs font-medium text-muted-foreground select-none"
											data-rw-affix-badge="suffix"
										>
											{props.affixSuffix}
										</span>
									) : null}
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="flex items-stretch gap-1.5">
						<div className="relative flex flex-1 items-stretch">
							{hasPrefix ? (
								<span
									className="inline-flex h-9 shrink-0 items-center rounded-l-md border border-r-0 border-input bg-muted/60 px-3 text-xs font-medium text-muted-foreground select-none"
									data-rw-affix-badge="prefix"
								>
									{props.affixPrefix}
								</span>
							) : null}

							{hasLanguages && props.languages ? (
								props.languages.map((lang) =>
									renderLanguageInput(lang, lang.id === activeLangId)
								)
							) : (
								<Input
									ref={inputRef}
									id={props.id}
									name={props.name}
									type={resolvedType}
									value={scalarValue}
									onChange={(e) => {
										const next = e.target.value;
										setScalarValue(next);
										props.onValueChange?.(props.name, next);
										if (props.slugFrom) {
											const shouldLock = next.trim().length > 0;
											if (slugLocked !== shouldLock) {
												setSlugLocked(shouldLock);
											}
										}
									}}
									onBlur={() => {
										if (
											props.slugFrom &&
											!props.readOnly &&
											!props.disabled &&
											scalarValueRef.current.trim() === ''
										) {
											const sourceStr = resolveSourceForLang();
											if (sourceStr.trim() !== '') {
												const separator = props.slugSeparator || '-';
												const maxLen = props.slugMaxLength || props.maxLength || 128;
												const nextSlug = slugifyText(sourceStr, separator, maxLen);
												setSlugLocked(false);
												setScalarValue(nextSlug);
												onValueChangeRef.current?.(props.name, nextSlug);
											}
										}
									}}
									placeholder={props.placeholder || undefined}
									readOnly={props.readOnly}
									disabled={props.disabled}
									required={props.required}
									aria-invalid={hasError ? 'true' : 'false'}
									aria-describedby={props.describedBy || undefined}
									min={props.min ?? undefined}
									max={props.max ?? undefined}
									step={props.step ?? undefined}
									minLength={props.minLength || undefined}
									maxLength={props.maxLength || undefined}
									pattern={props.pattern || undefined}
									className={cn(
										props.mono && 'font-mono text-xs',
										hasPrefix && 'rounded-l-none',
										hasSuffix && 'rounded-r-none',
										props.readOnly && 'bg-muted/40 text-muted-foreground',
										hasError && 'border-destructive'
									)}
									{...dataAttrs}
								/>
							)}

							{hasSuffix ? (
								<span
									className="inline-flex h-9 shrink-0 items-center rounded-r-md border border-l-0 border-input bg-muted/60 px-3 text-xs font-medium text-muted-foreground select-none"
									data-rw-affix-badge="suffix"
								>
									{props.affixSuffix}
								</span>
							) : null}
						</div>

						{props.slugFrom && !props.readOnly && !props.disabled ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleToggleSlugLock}
								title={
									isActiveSlugLocked
										? 'Slug is locked. Click to auto-sync from source field.'
										: 'Slug auto-syncs from source field. Click to lock.'
								}
								className="h-9 px-2.5"
							>
								<DynamicIcon name={isActiveSlugLocked ? 'lock' : 'unlock'} className="size-3.5" />
								<span className="text-xs">{isActiveSlugLocked ? 'Locked' : 'Auto'}</span>
							</Button>
						) : null}

						{props.secret ? (
							<div className="inline-flex items-center gap-1">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setSecretMasked((prev) => !prev)}
									aria-label={secretMasked ? 'Reveal secret' : 'Mask secret'}
									title={secretMasked ? 'Reveal secret' : 'Mask secret'}
									className="h-9 px-2.5"
								>
									<DynamicIcon name={secretMasked ? 'eye' : 'eye-slash'} className="size-3.5" />
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleCopySecret}
									aria-label={t('form.copySecret', 'Copy secret')}
									title={t('form.copySecret', 'Copy secret')}
									className="h-9 px-2.5"
								>
									<DynamicIcon name={secretCopied ? 'check' : 'copy'} className="size-3.5" />
								</Button>
								{!props.readOnly && !props.disabled ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleGenerateSecret}
										aria-label={t('form.generateNewSecret', 'Generate new secret')}
										title={t('form.generateNewSecret', 'Generate new secret')}
										className="h-9 px-2.5"
									>
										<DynamicIcon name="refresh" className="size-3.5" />
										<span className="hidden sm:inline text-xs">{t('form.generate', 'Generate')}</span>
									</Button>
								) : null}
							</div>
						) : null}
					</div>
				)}
			</div>

			<FieldStatusRow
				error={props.error}
				errorId={props.errorId}
				right={props.showCount ? <CharacterCountBadge current={currentLength} max={maxLimit} /> : null}
			/>
		</div>
	);
}
