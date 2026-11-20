import React, { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { Badge, Button, Textarea } from '../../ui';
import {
	CharacterCountBadge,
	FieldStatusRow,
	LanguageTabsBar,
	readInitialSyncedLanguageId,
	resolveIsoLangAttr,
} from '../shared';
import type { ReactInputfieldProps } from '../types';

function coerceTextareaScalar(raw: unknown): string {
	if (raw === null || raw === undefined) {
		return '';
	}
	if (typeof raw === 'object') {
		if (Array.isArray(raw)) {
			return coerceTextareaScalar(raw[0]);
		}
		const record = raw as Record<string, unknown>;
		if ('default' in record) {
			return coerceTextareaScalar(record.default);
		}
		return coerceTextareaScalar(Object.values(record)[0]);
	}
	return String(raw);
}

export function TextareaField(props: ReactInputfieldProps): React.ReactElement {
	const hasLanguages = Array.isArray(props.languages) && props.languages.length > 1;
	const defaultScalar = coerceTextareaScalar(props.value);
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

	const activeValue = hasLanguages ? (langValues[activeLangId] ?? '') : scalarValue;
	const currentLength = Array.from(activeValue).length;
	const maxLimit = props.maxLength ?? 0;
	const dataAttrs: Record<string, string> = { ...(props.dataAttributes ?? {}) };
	const isJsonEditor = props.editorMode === 'json';
	const isCodeEditor = props.editorMode === 'code' || Boolean(props.codeLanguage);

	const jsonValid = useMemo(() => {
		if (!isJsonEditor || !activeValue.trim()) {
			return null;
		}
		try {
			JSON.parse(activeValue);
			return true;
		} catch {
			return false;
		}
	}, [isJsonEditor, activeValue]);

	const handleFormatJson = () => {
		if (!isJsonEditor || props.readOnly || props.disabled || !activeValue.trim()) {
			return;
		}
		try {
			const parsed = JSON.parse(activeValue);
			const formatted = JSON.stringify(parsed, null, 2);
			if (hasLanguages) {
				setLangValues((prev) => ({ ...prev, [activeLangId]: formatted }));
				const activeLang = props.languages?.find((l) => l.id === activeLangId);
				if (activeLang?.isDefault) {
					setScalarValue(formatted);
					props.onValueChange?.(props.name, formatted);
					if (activeLang.inputName && activeLang.inputName !== props.name) {
						props.onValueChange?.(activeLang.inputName, formatted);
					}
				} else {
					props.onValueChange?.(activeLang?.inputName || `${props.name}__${activeLangId}`, formatted);
				}
			} else {
				setScalarValue(formatted);
				props.onValueChange?.(props.name, formatted);
			}
		} catch {
			// Invalid JSON
		}
	};

	const showInlineLangBar = hasLanguages && Boolean(props.languages) && !props.hideLanguageTabs;
	const hasError = Boolean(props.error && props.error.trim() !== '');
	const hasStatusMeta = Boolean(props.showCount || isJsonEditor || isCodeEditor);

	const statusRightNode = hasStatusMeta ? (
		<>
			{isCodeEditor && props.codeLanguage ? (
				<Badge variant="outline" mono>
					{props.codeLanguage}
				</Badge>
			) : null}
			{isJsonEditor && jsonValid !== null ? (
				<Badge variant={jsonValid ? 'success' : 'destructive'} mono>
					{jsonValid ? 'Valid JSON' : 'Invalid JSON'}
				</Badge>
			) : null}
			{isJsonEditor && jsonValid && !props.readOnly && !props.disabled ? (
				<Button type="button" variant="outline" size="xs" onClick={handleFormatJson}>
					Format
				</Button>
			) : null}
			{props.showCount ? (
				<CharacterCountBadge current={currentLength} max={maxLimit} />
			) : null}
		</>
	) : null;

	return (
		<div className="space-y-1.5" data-rw-control="textarea">
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

				{hasLanguages && props.languages ? (
					<div className={cn(expandedAll && 'space-y-2')}>
						{props.languages.map((lang) => {
							const isVisible = expandedAll || lang.id === activeLangId;
							const langReadOnly = Boolean(props.readOnly || !lang.editable);
							const isoLang = resolveIsoLangAttr(lang.name);
							return (
								<div key={lang.id} className={cn('space-y-1', !isVisible && 'hidden')}>
									{expandedAll ? (
										<label
											htmlFor={lang.inputId}
											className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
										>
											{lang.title || lang.name}
										</label>
									) : null}
									<Textarea
										id={lang.inputId}
										name={lang.inputName}
										lang={isoLang}
										rows={props.rows || 4}
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
										}}
										placeholder={props.placeholder || undefined}
										readOnly={langReadOnly}
										disabled={props.disabled}
										required={isVisible && lang.isDefault ? props.required : undefined}
										aria-invalid={hasError ? 'true' : 'false'}
										aria-describedby={props.describedBy || undefined}
										minLength={props.minLength || undefined}
										maxLength={props.maxLength || undefined}
										className={cn(
											(props.mono || isJsonEditor || isCodeEditor) && 'font-mono text-xs',
											langReadOnly && 'bg-muted/40 text-muted-foreground',
											hasError && 'border-destructive'
										)}
										{...(lang.isDefault ? dataAttrs : {})}
									/>
								</div>
							);
						})}
					</div>
				) : (
					<Textarea
						id={props.id}
						name={props.name}
						rows={props.rows || 4}
						value={scalarValue}
						onChange={(e) => {
							setScalarValue(e.target.value);
							props.onValueChange?.(props.name, e.target.value);
						}}
						placeholder={props.placeholder || undefined}
						readOnly={props.readOnly}
						disabled={props.disabled}
						required={props.required}
						aria-invalid={hasError ? 'true' : 'false'}
						aria-describedby={props.describedBy || undefined}
						minLength={props.minLength || undefined}
						maxLength={props.maxLength || undefined}
						className={cn(
							(props.mono || isJsonEditor || isCodeEditor) && 'font-mono text-xs',
							props.readOnly && 'bg-muted/40 text-muted-foreground',
							hasError && 'border-destructive'
						)}
						{...dataAttrs}
					/>
				)}
			</div>

			<FieldStatusRow error={props.error} errorId={props.errorId} right={statusRightNode} />
		</div>
	);
}
