import React, { useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge } from '../../ui';
import type { ReactInputfieldProps } from '../types';

/**
 * Splits delimited tag text (comma, semicolon, newline) into trimmed non-empty strings.
 */
export function parseTagsInput(raw: string): string[] {
	return raw
		.split(/[,;\n\r]+/)
		.map((item) => item.trim())
		.filter((item) => item !== '');
}

/**
 * Coerces raw array, JSON array string, or delimited string into a tag string list.
 */
export function normalizeTagsValue(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw.map((item) => String(item ?? '').trim()).filter((s) => s !== '');
	}
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '') {
			return [];
		}
		if (trimmed.startsWith('[')) {
			try {
				const decoded = JSON.parse(trimmed) as unknown;
				if (Array.isArray(decoded)) {
					return decoded.map((item) => String(item ?? '').trim()).filter((s) => s !== '');
				}
			} catch {
				// Fall through to delimited parsing
			}
		}
		return parseTagsInput(trimmed);
	}
	return [];
}

/**
 * Appends incoming tags while enforcing deduplication, predefined allowlists, and `maxItems`.
 */
export function mergeUniqueTags(
	existing: string[],
	incoming: string[],
	options?: {
		allowDuplicates?: boolean;
		allowed?: string[];
		maxItems?: number;
	},
): string[] {
	const result = [...existing];
	const allowDuplicates = Boolean(options?.allowDuplicates);
	const allowed = Array.isArray(options?.allowed) && options.allowed.length > 0 ? options.allowed : null;
	const maxItems = options?.maxItems && options.maxItems > 0 ? options.maxItems : 0;

	const allowedLookup = allowed
		? new Map<string, string>(allowed.map((item) => [item.toLowerCase(), item]))
		: null;

	for (const rawTag of incoming) {
		const trimmed = rawTag.trim();
		if (trimmed === '') {
			continue;
		}
		const canonical = allowedLookup ? allowedLookup.get(trimmed.toLowerCase()) : trimmed;
		if (!canonical) {
			continue;
		}
		if (!allowDuplicates && result.some((item) => item.toLowerCase() === canonical.toLowerCase())) {
			continue;
		}
		if (maxItems > 0 && result.length >= maxItems) {
			break;
		}
		result.push(canonical);
	}

	return result;
}

export function TagsField(props: ReactInputfieldProps): React.ReactElement {
	const incoming = normalizeTagsValue(props.value);
	const incomingSig = incoming.join('\u0000');
	const [prevSig, setPrevSig] = useState<string>(incomingSig);
	const [tags, setTags] = useState<string[]>(incoming);
	const [draft, setDraft] = useState<string>('');
	const [focused, setFocused] = useState<boolean>(false);
	const [activeIndex, setActiveIndex] = useState<number>(-1);
	const inputRef = useRef<HTMLInputElement | null>(null);

	if (incomingSig !== prevSig) {
		setPrevSig(incomingSig);
		setTags(incoming);
	}

	const suggestionPool = useMemo(() => {
		const combined: string[] = [];
		const seen = new Set<string>();
		const pushItem = (candidate: string) => {
			const clean = candidate.trim();
			if (clean === '') {
				return;
			}
			const key = clean.toLowerCase();
			if (!seen.has(key)) {
				seen.add(key);
				combined.push(clean);
			}
		};
		for (const item of props.suggestions ?? []) {
			pushItem(item);
		}
		for (const item of props.tagsList ?? []) {
			pushItem(item);
		}
		for (const opt of props.options ?? []) {
			if (Array.isArray(opt.optgroup)) {
				for (const sub of opt.optgroup) {
					pushItem(sub.value || sub.label);
				}
			} else {
				pushItem(opt.value || opt.label);
			}
		}
		return combined;
	}, [props.suggestions, props.tagsList, props.options]);

	const predefinedOnly = Boolean(props.tagsPredefinedOnly || props.allowCustom === false);
	const maxItems = props.maxItems && props.maxItems > 0 ? props.maxItems : 0;
	const atCapacity = maxItems > 0 && tags.length >= maxItems;
	const locked = Boolean(props.readOnly || props.disabled);
	const hasError = Boolean(props.error && props.error.trim() !== '');

	const filteredSuggestions = useMemo(() => {
		if (suggestionPool.length === 0 || atCapacity) {
			return [];
		}
		const needle = draft.trim().toLowerCase();
		return suggestionPool
			.filter((item) => {
				if (!props.allowDuplicates && tags.some((tItem) => tItem.toLowerCase() === item.toLowerCase())) {
					return false;
				}
				return needle === '' || item.toLowerCase().includes(needle);
			})
			.slice(0, 12);
	}, [suggestionPool, atCapacity, draft, props.allowDuplicates, tags]);

	const commitTags = (nextTags: string[]) => {
		setTags(nextTags);
		props.onValueChange?.(props.name, nextTags);
	};

	const tryAddFromString = (rawInput: string) => {
		if (locked || atCapacity) {
			return;
		}
		const pieces = parseTagsInput(rawInput);
		if (pieces.length === 0) {
			return;
		}
		const next = mergeUniqueTags(tags, pieces, {
			allowDuplicates: props.allowDuplicates,
			allowed: predefinedOnly && suggestionPool.length > 0 ? suggestionPool : undefined,
			maxItems,
		});
		if (next.length !== tags.length) {
			commitTags(next);
		}
		setDraft('');
		setActiveIndex(-1);
	};

	const removeTagAt = (index: number) => {
		if (locked) {
			return;
		}
		const next = tags.filter((_, i) => i !== index);
		commitTags(next);
	};

	const showSuggestions = focused && !locked && filteredSuggestions.length > 0;

	return (
		<div className="relative space-y-1 min-w-0 max-w-full" data-rw-control="tags">
			{props.name && !props.inlinePortal && !props.disabled ? (
				<input type="hidden" name={`${props.name}_present`} value="1" />
			) : null}
			{props.name && !props.inlinePortal
				? tags.map((tag, idx) => (
						<input key={`${tag}_${idx}`} type="hidden" name={`${props.name}[]`} value={tag} />
					))
				: null}

			<div
				onClick={() => {
					if (!locked) {
						inputRef.current?.focus();
					}
				}}
				className={cn(
					'flex min-h-9 w-full min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-input bg-input-surface px-2 py-1.5 text-xs shadow-2xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
					hasError && 'border-destructive focus-within:border-destructive focus-within:ring-destructive/30',
					props.disabled && 'opacity-50 cursor-not-allowed',
					props.readOnly && 'bg-muted/40 cursor-default',
				)}
			>
				{tags.length === 0 && props.readOnly ? (
					<span className="text-muted-foreground px-1">—</span>
				) : null}

				{tags.map((tag, idx) => (
					<Badge
						key={`${tag}_${idx}`}
						variant="secondary"
						className="gap-1 max-w-full pr-1 font-normal"
					>
						<DynamicIcon name="tag" aria-hidden="true" className="size-3 shrink-0 opacity-70" />
						<span className="truncate">{tag}</span>
						{!locked ? (
							<button
								type="button"
								aria-label={t('tags.removeTag', { tag }, `Remove ${tag}`)}
								onClick={(e) => {
									e.stopPropagation();
									removeTagAt(idx);
								}}
								className="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
							>
								<DynamicIcon name="x" aria-hidden="true" className="size-3" />
							</button>
						) : null}
					</Badge>
				))}

				{!locked ? (
					<input
						ref={inputRef}
						id={props.id}
						type="text"
						data-rw-bare-input=""
						disabled={props.disabled || atCapacity}
						value={draft}
						aria-invalid={hasError || undefined}
						aria-describedby={props.describedBy}
						placeholder={
							atCapacity
								? t('tags.limitReached', 'Maximum items reached')
								: tags.length === 0
									? props.placeholder ||
										(predefinedOnly
											? t('tags.selectFromList', 'Select tag...')
											: t('tags.addPlaceholder', 'Type tag and press Enter...'))
									: ''
						}
						onFocus={() => setFocused(true)}
						onBlur={() => {
							window.setTimeout(() => {
								setFocused(false);
								if (draft.trim() !== '') {
									tryAddFromString(draft);
								}
							}, 120);
						}}
						onChange={(e) => {
							const val = e.target.value;
							if (val.includes(',') || val.includes('\n')) {
								tryAddFromString(val);
							} else {
								setDraft(val);
								setActiveIndex(-1);
							}
						}}
						onPaste={(e) => {
							const pasted = e.clipboardData?.getData('text') || '';
							if (/[,;\n\r]/.test(pasted)) {
								e.preventDefault();
								tryAddFromString(`${draft} ${pasted}`);
							}
						}}
						onKeyDown={(e) => {
							if (showSuggestions && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
								e.preventDefault();
								setActiveIndex((prev) =>
									e.key === 'ArrowDown'
										? (prev + 1) % filteredSuggestions.length
										: prev <= 0
											? filteredSuggestions.length - 1
											: prev - 1,
								);
								return;
							}
							if (e.key === 'Enter' || (e.key === 'Tab' && draft.trim() !== '')) {
								if (e.key === 'Enter') {
									e.preventDefault();
								}
								if (showSuggestions && activeIndex >= 0 && filteredSuggestions[activeIndex]) {
									tryAddFromString(filteredSuggestions[activeIndex]);
								} else if (draft.trim() !== '') {
									tryAddFromString(draft);
								}
								return;
							}
							if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
								e.preventDefault();
								removeTagAt(tags.length - 1);
								return;
							}
							if (e.key === 'Escape') {
								setFocused(false);
								setActiveIndex(-1);
							}
						}}
						className="min-w-[80px] flex-1 bg-transparent py-0.5 px-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
					/>
				) : null}

				{maxItems > 0 ? (
					<span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground px-1">
						{tags.length}/{maxItems}
					</span>
				) : null}
			</div>

			{showSuggestions ? (
				<div
					role="listbox"
					aria-label={t('tags.suggestions', 'Suggested tags')}
					className="absolute left-0 right-0 z-40 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
				>
					{filteredSuggestions.map((suggestion, idx) => (
						<button
							key={suggestion}
							type="button"
							role="option"
							aria-selected={idx === activeIndex}
							onMouseDown={(e) => {
								e.preventDefault();
								tryAddFromString(suggestion);
								inputRef.current?.focus();
							}}
							className={cn(
								'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer',
								idx === activeIndex
									? 'bg-muted text-foreground font-medium'
									: 'text-popover-foreground hover:bg-muted/70',
							)}
						>
							<DynamicIcon name="tag" aria-hidden="true" className="size-3.5 text-muted-foreground shrink-0" />
							<span className="truncate">{suggestion}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

export const TagsFieldControl = TagsField;
