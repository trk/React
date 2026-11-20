import React, { useCallback, useId, useMemo, useState } from 'react';
import { useTranslations } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Input, Textarea } from '../../ui';
import type { StudioMediaItem } from '../mediaUtils';
import { LanguageTabsBar, resolveIsoLangAttr } from '../shared';
import type { InputfieldLanguageItem } from '../types';
import { parseTagsArray } from './mediaHelpers';

export function TagsChipEditor({
	value,
	tagsList,
	predefinedOnly,
	disabled,
	onChange,
}: {
	value: string;
	tagsList?: string[];
	predefinedOnly?: boolean;
	disabled?: boolean;
	onChange: (nextTags: string) => void;
}): React.ReactElement {
	const { t } = useTranslations('core');
	const [draft, setDraft] = useState('');
	const chips = useMemo(() => parseTagsArray(value), [value]);
	const predefinedLookup = useMemo(() => {
		const map = new Map<string, string>();
		if (Array.isArray(tagsList)) {
			for (const tag of tagsList) {
				const clean = tag.trim();
				if (clean !== '') {
					map.set(clean.toLowerCase(), clean);
				}
			}
		}
		return map;
	}, [tagsList]);
	const lockToPredefined = Boolean(predefinedOnly && predefinedLookup.size > 0);

	const commitDraft = useCallback(
		(rawCandidate: string) => {
			const additions = parseTagsArray(rawCandidate);
			if (additions.length === 0) {
				setDraft('');
				return;
			}
			const existingLower = new Set(chips.map((c) => c.toLowerCase()));
			const next = [...chips];
			for (const candidate of additions) {
				const lower = candidate.toLowerCase();
				if (lockToPredefined && !predefinedLookup.has(lower)) {
					continue;
				}
				const canonical = predefinedLookup.get(lower) ?? candidate;
				if (!existingLower.has(lower)) {
					existingLower.add(lower);
					next.push(canonical);
				}
			}
			onChange(next.join(' '));
			setDraft('');
		},
		[chips, lockToPredefined, onChange, predefinedLookup]
	);

	const removeChip = (chip: string) => {
		const next = chips.filter((c) => c !== chip);
		onChange(next.join(' '));
	};

	const availableSuggestions = useMemo(() => {
		if (!tagsList || tagsList.length === 0) {
			return [];
		}
		const activeSet = new Set(chips.map((c) => c.toLowerCase()));
		return tagsList.filter((tag) => tag.trim() !== '' && !activeSet.has(tag.trim().toLowerCase()));
	}, [chips, tagsList]);

	return (
		<div className="space-y-2">
			<div
				className={cn(
					'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-input-surface px-2.5 py-1.5 transition-colors focus-within:ring-2 focus-within:ring-ring',
					disabled && 'opacity-60 pointer-events-none'
				)}
			>
				{chips.map((chip) => (
					<span
						key={chip}
						className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground"
					>
						<DynamicIcon name="tag" className="size-2.5 text-muted-foreground" />
						<span>{chip}</span>
						{!disabled ? (
							<button
								type="button"
								onClick={() => removeChip(chip)}
								aria-label={`${t('common.remove', 'Remove')} ${chip}`}
								className="ml-0.5 rounded-xs p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground cursor-pointer pointer-coarse:p-1"
							>
								<DynamicIcon name="x" className="size-2.5" />
							</button>
						) : null}
					</span>
				))}
				{!disabled && !lockToPredefined ? (
					<input
						type="text"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
								if (draft.trim() !== '') {
									e.preventDefault();
									commitDraft(draft);
								}
							} else if (e.key === 'Backspace' && draft === '' && chips.length > 0) {
								const lastChip = chips[chips.length - 1];
								if (lastChip !== undefined) {
									removeChip(lastChip);
								}
							}
						}}
						onBlur={() => {
							if (draft.trim() !== '') {
								commitDraft(draft);
							}
						}}
						aria-label={t('media.tagsLabel', 'Tags')}
						placeholder={chips.length === 0 ? t('media.tagsPlaceholder', 'Type a tag and press Enter...') : ''}
						className="min-w-[130px] flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
					/>
				) : chips.length === 0 ? (
					<span className="text-xs text-muted-foreground">
						{t('media.selectSuggestedTag', 'Select a tag below...')}
					</span>
				) : null}
			</div>

			{!disabled && availableSuggestions.length > 0 ? (
				<div className="flex flex-wrap items-center gap-1">
					<span className="mr-1 text-[10px] font-medium text-muted-foreground">
						{t('media.suggestedTags', 'Suggested tags')}:
					</span>
					{availableSuggestions.slice(0, 24).map((suggestion) => (
						<button
							key={suggestion}
							type="button"
							onClick={() => commitDraft(suggestion)}
							className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-muted/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/8 hover:text-foreground cursor-pointer pointer-coarse:min-h-7 pointer-coarse:px-2.5"
						>
							<DynamicIcon name="plus" className="size-2.5" />
							<span>{suggestion}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

export function MultiLangDescriptionEditor({
	item,
	isImage,
	descriptionRows,
	languages,
	activeLangId,
	onSelectLang,
	disabled,
	defaultStacked = false,
	compact = false,
	onUpdateDescription,
}: {
	item: StudioMediaItem;
	isImage: boolean;
	descriptionRows: number;
	languages?: InputfieldLanguageItem[];
	activeLangId: number;
	onSelectLang: (langId: number) => void;
	disabled: boolean;
	defaultStacked?: boolean;
	compact?: boolean;
	onUpdateDescription: (itemId: string, value: string, langId?: number) => void;
}): React.ReactElement {
	const { t } = useTranslations('core');
	const hasMultiLang = Boolean(languages && languages.length > 1);
	const [showAllStacked, setShowAllStacked] = useState<boolean>(
		Boolean(defaultStacked && hasMultiLang && languages && languages.length <= 5)
	);

	const activeLang = hasMultiLang && languages ? languages.find((l) => l.id === activeLangId) || languages[0] : null;
	const basePlaceholder = isImage
		? t('media.altPlaceholderImage', 'Describe this image for screen readers and SEO...')
		: t('media.altPlaceholderFile', 'Add file description...');

	const getLangVal = (lang: InputfieldLanguageItem): string => {
		const key = lang.isDefault ? 'default' : String(lang.id);
		return lang.isDefault
			? (item.descriptions?.[key] ?? item.description ?? '')
			: (item.descriptions?.[key] ?? '');
	};

	const descUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
	const renderSingleControl = (
		val: string,
		placeholder: string,
		ariaLabel: string,
		isControlDisabled: boolean,
		onChangeVal: (next: string) => void,
		langAttr?: string
	) => {
		if (descriptionRows > 1 && !compact) {
			return (
				<Textarea
					rows={Math.min(descriptionRows, 5)}
					lang={langAttr}
					value={val}
					disabled={isControlDisabled}
					placeholder={placeholder}
					aria-label={ariaLabel}
					onChange={(e) => onChangeVal(e.target.value)}
					className="min-h-16 text-xs"
				/>
			);
		}
		return (
			<Input
				type="text"
				lang={langAttr}
				value={val}
				disabled={isControlDisabled}
				placeholder={placeholder}
				aria-label={ariaLabel}
				onChange={(e) => onChangeVal(e.target.value)}
				className={cn('text-xs', compact ? 'h-7 px-2' : 'h-8')}
			/>
		);
	};

	if (!hasMultiLang || !languages || !activeLang) {
		const singleLangDisabled = disabled || languages?.[0]?.editable === false;
		return renderSingleControl(
			item.description || '',
			basePlaceholder,
			`${isImage ? t('media.altLabelImage', 'Alt text / description') : t('media.altLabelFile', 'Description')} ${item.basename}`,
			singleLangDisabled,
			(next) => onUpdateDescription(item.id, next),
			resolveIsoLangAttr(languages?.[0]?.name)
		);
	}

	const activePanelDomId = `rw-desc-panel-${descUid}-${activeLang.id}`;
	const langValuesMap = Object.fromEntries(languages.map((lang) => [lang.id, getLangVal(lang)]));

	return (
		<div className="space-y-1.5">
			<LanguageTabsBar
				languages={languages}
				activeLangId={activeLang.id}
				values={langValuesMap}
				onSelect={onSelectLang}
				ariaLabel={t('common.languages', 'Languages')}
				expandedAll={showAllStacked && !compact}
				onToggleExpandAll={!compact ? () => setShowAllStacked((prev) => !prev) : undefined}
			/>

			{showAllStacked && !compact ? (
				<div className="space-y-2 rounded-lg border border-border bg-muted/15 p-2.5">
					{languages.map((lang) => {
						const val = getLangVal(lang);
						const labelText = lang.title || lang.name;
						const langDisabled = disabled || lang.editable === false;
						return (
							<div key={lang.id} className="grid grid-cols-1 gap-1 sm:grid-cols-[110px_1fr] sm:items-start sm:gap-2.5">
								<div className="flex items-center gap-1.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
									<span
										aria-hidden="true"
										className={cn(
											'size-1.5 shrink-0 rounded-full',
											val.trim() !== '' ? 'bg-primary' : 'bg-muted-foreground/30'
										)}
									/>
									<span className="truncate" title={labelText}>
										{labelText}
									</span>
								</div>
								{renderSingleControl(
									val,
									`${basePlaceholder} (${labelText})`,
									`${labelText} — ${item.basename}`,
									langDisabled,
									(next) => onUpdateDescription(item.id, next, lang.id),
									resolveIsoLangAttr(lang.name)
								)}
							</div>
						);
					})}
				</div>
			) : (
				<div role="tabpanel" id={activePanelDomId} aria-label={activeLang.title || activeLang.name}>
					{renderSingleControl(
						getLangVal(activeLang),
						`${basePlaceholder} (${activeLang.title || activeLang.name})`,
						`${activeLang.title || activeLang.name} — ${item.basename}`,
						disabled || activeLang.editable === false,
						(next) => onUpdateDescription(item.id, next, activeLang.id),
						resolveIsoLangAttr(activeLang.name)
					)}
				</div>
			)}
		</div>
	);
}

export function MediaHiddenFormInputs({
	items,
	isImage,
	descriptionRows,
	useTags,
	languages,
}: {
	items: StudioMediaItem[];
	isImage: boolean;
	descriptionRows: number;
	useTags: boolean;
	languages?: InputfieldLanguageItem[];
}): React.ReactElement {
	const hasMultiLang = Boolean(languages && languages.length > 1);

	return (
		<>
			{items.map((item, idx) => {
				const customEntries = item.customValues ? Object.entries(item.customValues) : [];
				return (
					<React.Fragment key={`hidden_${item.id}`}>
						<input type="hidden" name={`sort_${item.id}`} value={String(idx)} />
						{item.markedForDelete ? (
							<input type="hidden" name={`delete_${item.id}`} value="1" />
						) : null}
						{isImage && item.focus ? (
							<input type="hidden" name={`focus_${item.id}`} value={item.focus} />
						) : null}
						{descriptionRows > 0 ? (
							hasMultiLang && languages ? (
								languages.map((lang) => {
									const hiddenName = lang.isDefault
										? `description_${item.id}`
										: `description${lang.id}_${item.id}`;
									const key = lang.isDefault ? 'default' : String(lang.id);
									const val = lang.isDefault
										? (item.descriptions?.[key] ?? item.description ?? '')
										: (item.descriptions?.[key] ?? '');
									return <input key={hiddenName} type="hidden" name={hiddenName} value={val} />;
								})
							) : (
								<input type="hidden" name={`description_${item.id}`} value={item.description || ''} />
							)
						) : null}
						{useTags ? <input type="hidden" name={`tags_${item.id}`} value={item.tags || ''} /> : null}
						{customEntries.map(([cfName, cfVal]) => {
							if (Array.isArray(cfVal)) {
								return cfVal.map((entryVal, entryIdx) => (
									<input
										key={`${cfName}_${entryIdx}`}
										type="hidden"
										name={`${cfName}[]`}
										value={String(entryVal ?? '')}
									/>
								));
							}
							if (cfVal !== null && typeof cfVal === 'object') {
								return Object.entries(cfVal as Record<string, unknown>).map(([subKey, subVal]) => {
									if (subVal !== null && typeof subVal === 'object') {
										return null;
									}
									const subInputName =
										subKey === 'default' ? cfName : `${cfName}__${subKey}`;
									return (
										<input
											key={`${cfName}_${subKey}`}
											type="hidden"
											name={subInputName}
											value={subVal === undefined || subVal === null ? '' : String(subVal)}
										/>
									);
								});
							}
							return (
								<input
									key={cfName}
									type="hidden"
									name={cfName}
									value={cfVal === undefined || cfVal === null ? '' : String(cfVal)}
								/>
							);
						})}
					</React.Fragment>
				);
			})}
		</>
	);
}
