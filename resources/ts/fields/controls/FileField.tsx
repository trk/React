import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Button, SortableHandle, SortableStatusRegion, useSortableList, type SortableHandleProps } from '../../ui';
import {
	AssetInspectorSheet,
	CompactMediaDropBar,
	CompactMediaLockedBar,
	extractClipboardFiles,
	getLanguageCountSummary,
	hasDraggedOsFiles,
	hydrateStudioMediaItems,
	MediaHiddenFormInputs,
	MultiLangDescriptionEditor,
	normalizeMediaControlProps,
	notifyHostFormChanged,
	TagsChipEditor,
	uploadMediaFileViaXhr,
	validateStudioIncomingFiles,
	type ActiveUploadTask,
	type StudioMediaItem,
} from '../media';
import {
	assignInputFiles,
	ensureNativeLanguageTabsBridge,
	FieldStatusRow,
	formatMediaBytes,
	LANGUAGE_SELECT_ALL_EVENT,
	MediaItemFilename,
	readInitialSyncedLanguageId,
	resolveLanguageSyncScope,
} from '../shared';
import type {
	InputfieldLanguageItem,
	InputfieldMediaItem,
	ReactInputfieldProps,
} from '../types';

function resolveFileIconName(ext?: string): string {
	const clean = (ext || '').toLowerCase();
	if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz'].includes(clean)) {
		return 'file-archive';
	}
	if (['json', 'xml', 'csv', 'yml', 'yaml', 'md', 'html', 'css', 'js', 'ts', 'php', 'sql'].includes(clean)) {
		return 'file-code';
	}
	if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'].includes(clean)) {
		return 'image';
	}
	return 'file-text';
}

const FileTableRow = React.memo(function FileTableRow({
	fileItem,
	totalItems,
	isLocked,
	canUpload,
	hasLiveGateway,
	descriptionRows,
	useTags,
	tagsList,
	tagsPredefinedOnly,
	languages,
	activeLangId,
	itemSortProps,
	handleSortProps,
	onSelectLang,
	onUpdateDescription,
	onUpdateTags,
	onOpenInspector,
	onTriggerReplace,
	onDropReplace,
	onToggleDelete,
	t,
}: {
	fileItem: StudioMediaItem;
	totalItems: number;
	isLocked: boolean;
	canUpload: boolean;
	hasLiveGateway: boolean;
	descriptionRows: number;
	useTags: boolean;
	tagsList?: string[];
	tagsPredefinedOnly?: boolean;
	languages?: InputfieldLanguageItem[];
	activeLangId: number;
	itemSortProps: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>;
	handleSortProps: SortableHandleProps | null;
	onSelectLang: (langId: number) => void;
	onUpdateDescription: (itemId: string, value: string, langId?: number) => void;
	onUpdateTags: (itemId: string, tags: string) => void;
	onOpenInspector: (itemId: string) => void;
	onTriggerReplace: (item: StudioMediaItem) => void;
	onDropReplace: (target: StudioMediaItem, files: FileList | null) => void;
	onToggleDelete: (itemId: string) => void;
	t: (
		key: string,
		paramsOrFallback?: string | Record<string, string | number | boolean | null | undefined>,
		maybeFallback?: string
	) => string;
}): React.ReactElement {
	const [isDropOverRow, setIsDropOverRow] = useState<boolean>(false);
	const [isInlineMetaOpen, setIsInlineMetaOpen] = useState<boolean>(false);
	const langSummary = getLanguageCountSummary(fileItem, languages);
	const canDropReplace = Boolean(canUpload && hasLiveGateway && !fileItem.markedForDelete);
	const hasInlineMeta = descriptionRows > 0 || useTags;

	return (
		<div
			{...itemSortProps}
			data-rw-media-row=""
			onDragOver={(e) => {
				if (!canDropReplace || !hasDraggedOsFiles(e)) return;
				e.preventDefault();
				e.stopPropagation();
				if (!isDropOverRow) {
					setIsDropOverRow(true);
				}
			}}
			onDragLeave={(e) => {
				if (!isDropOverRow) return;
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
					setIsDropOverRow(false);
				}
			}}
			onDrop={(e) => {
				if (!canDropReplace || !hasDraggedOsFiles(e)) return;
				e.preventDefault();
				e.stopPropagation();
				setIsDropOverRow(false);
				onDropReplace(fileItem, e.dataTransfer?.files || null);
			}}
			className={cn(
				'relative px-2.5 py-1.5 transition-colors space-y-2',
				fileItem.markedForDelete && 'bg-destructive/5',
				isDropOverRow && 'bg-primary/8 ring-2 ring-inset ring-primary/35'
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					{!isLocked && totalItems > 1 && handleSortProps ? (
						<SortableHandle
							{...handleSortProps}
							title={t(
								'media.dragToReorder',
								{ name: fileItem.basename },
								`Reorder ${fileItem.basename}`
							)}
							aria-label={t(
								'media.dragToReorder',
								{ name: fileItem.basename },
								`Reorder ${fileItem.basename}`
							)}
						/>
					) : null}
					<button
						type="button"
						onClick={() => onOpenInspector(fileItem.id)}
						aria-label={t('media.editAsset', { name: fileItem.basename }, `Inspect & edit ${fileItem.basename}`)}
						className={cn(
							'flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/40 text-muted-foreground transition-colors hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							fileItem.markedForDelete && 'opacity-45'
						)}
					>
						<DynamicIcon name={resolveFileIconName(fileItem.ext)} className="size-3.5" aria-hidden="true" />
					</button>
					<div className="min-w-0 flex-1">
						<MediaItemFilename item={fileItem} isDeleted={fileItem.markedForDelete} />
						<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
							{fileItem.markedForDelete ? (
								<span className="font-medium text-destructive">
									{t('media.markedForDeletion', 'Marked for deletion')}
								</span>
							) : (
								<>
									<span className="font-mono uppercase">{fileItem.ext || 'file'}</span>
									<span className="font-mono">
										· {fileItem.filesizeStr || formatMediaBytes(fileItem.size)}
									</span>
									{languages && languages.length > 1 ? (
										<span className="font-mono">
											· {langSummary.filled}/{langSummary.total}
										</span>
									) : null}
									{fileItem.description?.trim() ? (
										<span className="hidden max-w-48 truncate @md:inline">
											· {fileItem.description.trim()}
										</span>
									) : null}
								</>
							)}
						</div>
					</div>
				</div>

				<div className="flex shrink-0 items-center gap-0.5">
					{fileItem.markedForDelete ? (
						!isLocked ? (
							<Button
								type="button"
								variant="outline"
								size="xs"
								className="h-6 gap-1 px-2 text-[11px]"
								onClick={() => onToggleDelete(fileItem.id)}
							>
								<DynamicIcon name="rotate-ccw" className="size-3" aria-hidden="true" />
								<span>{t('media.undoDelete', 'Undo')}</span>
							</Button>
						) : null
					) : (
						<>
							{hasInlineMeta ? (
								<Button
									type="button"
									variant={isInlineMetaOpen ? 'secondary' : 'ghost'}
									size="icon"
									aria-expanded={isInlineMetaOpen}
									aria-label={t('media.altLabelFile', 'Description')}
									title={t('media.altLabelFile', 'Description')}
									className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-9"
									onClick={() => setIsInlineMetaOpen((prev) => !prev)}
								>
									<DynamicIcon name="square-pen" className="size-3.5" aria-hidden="true" />
								</Button>
							) : null}
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-9"
								aria-label={t('common.edit', 'Edit')}
								title={t('common.edit', 'Edit')}
								onClick={() => onOpenInspector(fileItem.id)}
							>
								<DynamicIcon name="sliders" className="size-3.5" aria-hidden="true" />
							</Button>
							{canUpload && hasLiveGateway ? (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-9"
									aria-label={t('media.replace', 'Replace')}
									title={t('media.replace', 'Replace')}
									onClick={() => onTriggerReplace(fileItem)}
								>
									<DynamicIcon name="refresh-cw" className="size-3.5" aria-hidden="true" />
								</Button>
							) : null}
							{!isLocked ? (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive pointer-coarse:size-9"
									aria-label={t(
										'media.removeFile',
										{ name: fileItem.basename },
										`Remove ${fileItem.basename}`
									)}
									title={t('common.delete', 'Delete')}
									onClick={() => onToggleDelete(fileItem.id)}
								>
									<DynamicIcon name="trash" className="size-3.5" aria-hidden="true" />
								</Button>
							) : null}
						</>
					)}
				</div>
			</div>

			{isInlineMetaOpen && !fileItem.markedForDelete && hasInlineMeta ? (
				<div className="space-y-1.5 border-t border-border/60 pt-2">
					{descriptionRows > 0 ? (
						<MultiLangDescriptionEditor
							item={fileItem}
							isImage={false}
							descriptionRows={descriptionRows}
							languages={languages}
							activeLangId={activeLangId}
							onSelectLang={onSelectLang}
							disabled={isLocked}
							compact={descriptionRows === 1}
							onUpdateDescription={onUpdateDescription}
						/>
					) : null}
					{useTags ? (
						<TagsChipEditor
							value={fileItem.tags || ''}
							tagsList={tagsList}
							predefinedOnly={tagsPredefinedOnly}
							disabled={isLocked}
							onChange={(nextTags) => onUpdateTags(fileItem.id, nextTags)}
						/>
					) : null}
				</div>
			) : null}
		</div>
	);
});

const FileGridCard = React.memo(function FileGridCard({
	fileItem,
	totalItems,
	isLocked,
	canUpload,
	hasLiveGateway,
	languages,
	itemSortProps,
	handleSortProps,
	onOpenInspector,
	onTriggerReplace,
	onDropReplace,
	onToggleDelete,
	t,
}: {
	fileItem: StudioMediaItem;
	totalItems: number;
	isLocked: boolean;
	canUpload: boolean;
	hasLiveGateway: boolean;
	descriptionRows: number;
	languages?: InputfieldLanguageItem[];
	itemSortProps: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>;
	handleSortProps: SortableHandleProps | null;
	onOpenInspector: (itemId: string) => void;
	onTriggerReplace: (item: StudioMediaItem) => void;
	onDropReplace: (target: StudioMediaItem, files: FileList | null) => void;
	onToggleDelete: (itemId: string) => void;
	t: (
		key: string,
		paramsOrFallback?: string | Record<string, string | number | boolean | null | undefined>,
		maybeFallback?: string
	) => string;
}): React.ReactElement {
	const [isDropOverCard, setIsDropOverCard] = useState<boolean>(false);
	const langSummary = getLanguageCountSummary(fileItem, languages);
	const canDropReplace = Boolean(canUpload && hasLiveGateway && !fileItem.markedForDelete);

	return (
		<div
			{...itemSortProps}
			data-rw-media-card=""
			onDragOver={(e) => {
				if (!canDropReplace || !hasDraggedOsFiles(e)) return;
				e.preventDefault();
				e.stopPropagation();
				if (!isDropOverCard) {
					setIsDropOverCard(true);
				}
			}}
			onDragLeave={(e) => {
				if (!isDropOverCard) return;
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
					setIsDropOverCard(false);
				}
			}}
			onDrop={(e) => {
				if (!canDropReplace || !hasDraggedOsFiles(e)) return;
				e.preventDefault();
				e.stopPropagation();
				setIsDropOverCard(false);
				onDropReplace(fileItem, e.dataTransfer?.files || null);
			}}
			className={cn(
				'relative flex items-center justify-between gap-2 overflow-hidden rounded-lg border border-border bg-card px-2 py-1.5 shadow-2xs transition-colors',
				fileItem.markedForDelete && 'border-destructive/35 bg-destructive/5',
				isDropOverCard && 'border-primary ring-2 ring-primary/25'
			)}
		>
			{isDropOverCard ? (
				<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/85 backdrop-blur-[2px]">
					<div className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/12 px-2.5 py-0.5 text-[11px] font-semibold text-primary-ink">
						<DynamicIcon name="refresh-cw" className="size-3" aria-hidden="true" />
						<span>{t('media.dropToReplace', 'Drop file to replace')}</span>
					</div>
				</div>
			) : null}

			<div className="flex min-w-0 flex-1 items-center gap-2">
				{!isLocked && totalItems > 1 && handleSortProps ? (
					<SortableHandle
						{...handleSortProps}
						title={t(
							'media.dragToReorder',
							{ name: fileItem.basename },
							`Reorder ${fileItem.basename}`
						)}
						aria-label={t(
							'media.dragToReorder',
							{ name: fileItem.basename },
							`Reorder ${fileItem.basename}`
						)}
					/>
				) : null}
				<button
					type="button"
					onClick={() => onOpenInspector(fileItem.id)}
					aria-label={t('media.editAsset', { name: fileItem.basename }, `Inspect & edit ${fileItem.basename}`)}
					className={cn(
						'flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/40 text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						fileItem.markedForDelete && 'opacity-45'
					)}
				>
					<DynamicIcon name={resolveFileIconName(fileItem.ext)} className="size-3.5" aria-hidden="true" />
				</button>
				<div className="min-w-0 flex-1">
					<MediaItemFilename item={fileItem} isDeleted={fileItem.markedForDelete} />
					<div className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
						{fileItem.markedForDelete ? (
							<span className="font-medium text-destructive">
								{t('media.markedForDeletion', 'Marked for deletion')}
							</span>
						) : (
							<>
								<span className="font-mono uppercase">{fileItem.ext || 'file'}</span>
								<span className="font-mono">
									· {fileItem.filesizeStr || formatMediaBytes(fileItem.size)}
								</span>
								{languages && languages.length > 1 ? (
									<span className="font-mono">
										· {langSummary.filled}/{langSummary.total}
									</span>
								) : null}
							</>
						)}
					</div>
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-0.5">
				{fileItem.markedForDelete ? (
					!isLocked ? (
						<Button
							type="button"
							variant="outline"
							size="xs"
							className="h-6 gap-1 px-1.5 text-[10px]"
							onClick={() => onToggleDelete(fileItem.id)}
						>
							<DynamicIcon name="rotate-ccw" className="size-3" aria-hidden="true" />
							<span>{t('media.undoDelete', 'Undo')}</span>
						</Button>
					) : null
				) : (
					<>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-8"
							aria-label={t('common.edit', 'Edit')}
							title={t('common.edit', 'Edit')}
							onClick={() => onOpenInspector(fileItem.id)}
						>
							<DynamicIcon name="sliders" className="size-3.5" aria-hidden="true" />
						</Button>
						{canUpload && hasLiveGateway ? (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-8"
								aria-label={t('media.replace', 'Replace')}
								title={t('media.replace', 'Replace')}
								onClick={() => onTriggerReplace(fileItem)}
							>
								<DynamicIcon name="refresh-cw" className="size-3.5" aria-hidden="true" />
							</Button>
						) : null}
						{!isLocked ? (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive pointer-coarse:size-8"
								aria-label={t(
									'media.removeFile',
									{ name: fileItem.basename },
									`Remove ${fileItem.basename}`
								)}
								title={t('common.delete', 'Delete')}
								onClick={() => onToggleDelete(fileItem.id)}
							>
								<DynamicIcon name="trash" className="size-3.5" aria-hidden="true" />
							</Button>
						) : null}
					</>
				)}
			</div>
		</div>
	);
});

export function FileField(rawProps: ReactInputfieldProps): React.ReactElement {
	const props = useMemo(() => normalizeMediaControlProps(rawProps, false), [rawProps]);
	const { t } = useTranslations('core');
	const rootRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const replaceInputRef = useRef<HTMLInputElement | null>(null);
	const uploadAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
	const fallbackId = useId();

	const isLocked = Boolean(props.disabled || props.readOnly || props.renderValueMode);
	const noUpload = Boolean(props.noUpload);
	const canUpload = !isLocked && !noUpload;
	const maxFiles = props.maxFiles ?? 0;
	const isSingleMode = maxFiles === 1;
	const isMultiple = !isSingleMode && (props.multiple ?? true);
	const inputId = props.id || `rw_file_${fallbackId}`;
	const inputName = props.name ? (props.name.endsWith('[]') ? props.name : `${props.name}[]`) : 'files[]';
	const descriptionRows = props.descriptionRows ?? 1;
	const useTags = Boolean(props.useTags);
	const allowedExts = useMemo(
		() => (props.extensions || []).map((e) => e.toLowerCase().replace(/^\./, '')),
		[props.extensions]
	);
	const acceptAttr = props.accept || (allowedExts.length > 0 ? allowedExts.map((e) => `.${e}`).join(',') : '');
	const hasLiveGateway = Boolean(!isLocked && props.mediaEndpoint && props.mediaToken);

	const [items, setItems] = useState<StudioMediaItem[]>(() => hydrateStudioMediaItems(props.files));
	const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
	const [uploadTasks, setUploadTasks] = useState<ActiveUploadTask[]>([]);
	const [validationNotice, setValidationNotice] = useState<string>('');
	const [viewMode, setViewMode] = useState<'table' | 'grid'>(() =>
		props.gridMode === 'grid' ? 'grid' : 'table'
	);
	const [isSingleMetaOpen, setIsSingleMetaOpen] = useState<boolean>(false);
	const [isDropOverZone, setIsDropOverZone] = useState<boolean>(false);
	const [isDropOverSingle, setIsDropOverSingle] = useState<boolean>(false);
	const [replaceTarget, setReplaceTarget] = useState<StudioMediaItem | null>(null);
	const [inspectorItemId, setInspectorItemId] = useState<string | null>(null);

	const [activeLangId, setActiveLangId] = useState<number>(() =>
		readInitialSyncedLanguageId(props.languages)
	);

	useEffect(() => {
		if (!props.languages || props.languages.length <= 1 || typeof window === 'undefined') {
			return;
		}
		ensureNativeLanguageTabsBridge();
		const langs = props.languages;
		const onSelectAll = (event: Event) => {
			const detail = (
				event as CustomEvent<{
					langId: number;
					scope?: Element | null;
					form?: HTMLFormElement | null;
				}>
			).detail;
			if (!detail || typeof detail.langId !== 'number') {
				return;
			}
			const ownForm = resolveLanguageSyncScope(rootRef.current);
			const incomingForm =
				detail.form ?? (detail.scope instanceof HTMLFormElement ? detail.scope : null);
			if (incomingForm && ownForm && incomingForm !== ownForm) {
				return;
			}
			if (langs.some((l) => l.id === detail.langId)) {
				setActiveLangId(detail.langId);
			}
		};
		window.addEventListener(LANGUAGE_SELECT_ALL_EVENT, onSelectAll);
		return () => window.removeEventListener(LANGUAGE_SELECT_ALL_EVENT, onSelectAll);
	}, [props.languages]);

	const prevServerKeyRef = useRef<string>(
		JSON.stringify((props.files || []).map((f) => `${f.id}:${f.hash}:${f.url}`))
	);
	useEffect(() => {
		const nextKey = JSON.stringify((props.files || []).map((f) => `${f.id}:${f.hash}:${f.url}`));
		if (nextKey !== prevServerKeyRef.current) {
			prevServerKeyRef.current = nextKey;
			setItems(hydrateStudioMediaItems(props.files));
		}
	}, [props.files]);

	useEffect(() => {
		const controllers = uploadAbortControllersRef.current;
		return () => {
			controllers.forEach((ctrl) => ctrl.abort());
			controllers.clear();
		};
	}, []);

	const queuedFilesRef = useRef<File[]>(queuedFiles);
	queuedFilesRef.current = queuedFiles;
	const itemsRef = useRef<StudioMediaItem[]>(items);
	itemsRef.current = items;
	const inFlightUploadsRef = useRef<number>(0);

	useEffect(() => {
		const el = rootRef.current as (HTMLDivElement & { __rwGetMediaItems?: () => StudioMediaItem[] }) | null;
		if (!el) {
			return;
		}
		el.__rwGetMediaItems = () => itemsRef.current.filter((i) => !i.markedForDelete);
		return () => {
			delete el.__rwGetMediaItems;
		};
	}, []);

	const emitChange = useCallback(
		(nextItems: StudioMediaItem[], nextQueued: File[] = queuedFilesRef.current) => {
			const activeNames = nextItems.filter((i) => !i.markedForDelete).map((i) => i.name);
			props.onValueChange?.(props.name, [...activeNames, ...nextQueued.map((f) => f.name)]);
			notifyHostFormChanged(rootRef.current);
		},
		[props.name, props.onValueChange]
	);

	const sortable = useSortableList({
		items,
		getId: (item) => item.id,
		disabled: isLocked || items.length <= 1,
		axis: viewMode === 'grid' ? 'grid' : 'vertical',
		getLabel: (item) => item.basename,
		onReorder: (next) => {
			const reindexed = next.map((item, idx) => ({ ...item, sort: idx }));
			itemsRef.current = reindexed;
			setItems(reindexed);
			emitChange(reindexed);
		},
	});

	const activeExisting = useMemo(() => items.filter((i) => !i.markedForDelete), [items]);
	const inFlightAdditionCount = useMemo(
		() => uploadTasks.filter((tk) => !tk.isReplace).length,
		[uploadTasks]
	);
	const activeCount = activeExisting.length + queuedFiles.length + inFlightAdditionCount;

	const updateDescription = useCallback(
		(itemId: string, value: string, langId?: number) => {
			const isDef =
				!langId ||
				!props.languages ||
				props.languages.length <= 1 ||
				Boolean(props.languages.find((l) => l.id === langId)?.isDefault);
			const langKey = isDef ? 'default' : String(langId);

			setItems((prev) =>
				prev.map((item) => {
					if (item.id !== itemId) return item;
					return {
						...item,
						description: isDef ? value : item.description,
						descriptions: {
							...(item.descriptions || {}),
							[langKey]: value,
						},
					};
				})
			);
			notifyHostFormChanged(rootRef.current);
		},
		[props.languages]
	);

	const updateTags = useCallback((itemId: string, tags: string) => {
		setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, tags } : item)));
		notifyHostFormChanged(rootRef.current);
	}, []);

	const updateCustomValue = useCallback(
		(itemId: string, fieldName: string, nextVal: unknown) => {
			setItems((prev) =>
				prev.map((item) =>
					item.id === itemId
						? {
								...item,
								customValues: {
									...(item.customValues || {}),
									[fieldName]: nextVal,
								},
							}
						: item
				)
			);
			props.onValueChange?.(fieldName, nextVal);
			notifyHostFormChanged(rootRef.current);
		},
		[props.onValueChange]
	);

	const toggleDelete = useCallback(
		(itemId: string) => {
			const current = itemsRef.current.find((item) => item.id === itemId);
			if (current?.markedForDelete && maxFiles > 0) {
				const liveActive =
					itemsRef.current.filter((item) => !item.markedForDelete).length +
					queuedFilesRef.current.length +
					inFlightUploadsRef.current;
				if (liveActive >= maxFiles) {
					setValidationNotice(
						t('media.maxFilesReached', { max: maxFiles }, `Maximum file limit (${maxFiles}) reached.`)
					);
					return;
				}
			}
			setItems((prev) => {
				const next = prev.map((item) =>
					item.id === itemId ? { ...item, markedForDelete: !item.markedForDelete } : item
				);
				itemsRef.current = next;
				emitChange(next);
				return next;
			});
		},
		[emitChange, maxFiles, t]
	);

	const cancelUploadTask = useCallback((taskId: string) => {
		const controller = uploadAbortControllersRef.current.get(taskId);
		if (controller) {
			controller.abort();
			uploadAbortControllersRef.current.delete(taskId);
		}
		setUploadTasks((prev) => prev.filter((tk) => tk.id !== taskId));
	}, []);

	const mergeServerItem = useCallback(
		(updated: InputfieldMediaItem, replacedId?: string) => {
			const hydrated = hydrateStudioMediaItems([updated])[0];
			if (!hydrated) {
				return;
			}
			setItems((prev) => {
				const idx = prev.findIndex(
					(it) =>
						(replacedId && it.id === replacedId) ||
						it.id === hydrated.id ||
						it.hash === hydrated.hash ||
						it.name === hydrated.name
				);
				const next = [...prev];
				const existingAtIdx = idx >= 0 ? next[idx] : undefined;
				if (idx >= 0 && existingAtIdx) {
					next[idx] = { ...existingAtIdx, ...hydrated, markedForDelete: false };
				} else {
					next.push(hydrated);
				}
				itemsRef.current = next;
				emitChange(next);
				return next;
			});
		},
		[emitChange]
	);

	const syncFallbackQueue = (nextQueued: File[]) => {
		setQueuedFiles(nextQueued);
		assignInputFiles(inputRef.current, nextQueued);
		emitChange(items, nextQueued);
	};

	const processIncomingFiles = async (
		rawList: FileList | File[] | null,
		explicitReplace?: StudioMediaItem | null,
		isCardDrop = false
	) => {
		if (!rawList || !canUpload) return;
		const incoming = Array.from(rawList);
		if (incoming.length === 0) return;

		const liveActiveExisting = itemsRef.current.filter((i) => !i.markedForDelete);
		const targetToReplace =
			explicitReplace || (isSingleMode && liveActiveExisting.length === 1 && hasLiveGateway ? liveActiveExisting[0] : null);
		const isReplacement = Boolean(targetToReplace);
		const effectiveExistingCount = targetToReplace
			? Math.max(0, liveActiveExisting.length - 1)
			: liveActiveExisting.length;
		const effectiveQueuedCount = hasLiveGateway
			? isReplacement
				? 0
				: inFlightUploadsRef.current
			: queuedFilesRef.current.length;

		const { accepted, errors } = validateStudioIncomingFiles(incoming, {
			allowedExtensions: allowedExts,
			maxFilesize: props.maxFilesize,
			maxFiles: targetToReplace ? 1 : maxFiles,
			existingCount: effectiveExistingCount,
			queuedCount: effectiveQueuedCount,
			isMultiple: targetToReplace ? false : isMultiple,
			overwrite: Boolean(props.overwrite || isSingleMode),
			isReplacement,
			isExplicitCardReplace: isCardDrop,
			existingNames: liveActiveExisting.map((i) => i.name),
			t,
		});

		setValidationNotice(errors.join(' '));
		if (inputRef.current) {
			inputRef.current.value = '';
		}
		if (replaceInputRef.current) {
			replaceInputRef.current.value = '';
		}

		if (accepted.length === 0) {
			return;
		}

		if (hasLiveGateway && props.mediaEndpoint && props.mediaToken) {
			const reservedSlots = !isReplacement ? accepted.length : 0;
			if (reservedSlots > 0) {
				inFlightUploadsRef.current += reservedSlots;
			}

			for (const file of accepted) {
				const taskId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
				const abortController = new AbortController();
				uploadAbortControllersRef.current.set(taskId, abortController);
				setUploadTasks((prev) => [
					...prev,
					{ id: taskId, name: file.name, size: file.size, progress: 5, isReplace: isReplacement },
				]);

				try {
					const result = await uploadMediaFileViaXhr({
						endpoint: props.mediaEndpoint,
						mediaToken: props.mediaToken,
						file,
						action: targetToReplace ? 'replace' : 'upload',
						targetHash: targetToReplace?.hash,
						targetName: targetToReplace?.name,
						clientOwnerId: props.ownerId ? String(props.ownerId) : undefined,
						clientInputName: props.name || undefined,
						signal: abortController.signal,
						onProgress: (pct) => {
							setUploadTasks((prev) =>
								prev.map((tk) => (tk.id === taskId ? { ...tk, progress: pct } : tk))
							);
						},
					});

					uploadAbortControllersRef.current.delete(taskId);
					setUploadTasks((prev) => prev.filter((tk) => tk.id !== taskId));

					if (result.aborted) {
						continue;
					}

					if (result.ok) {
						if (targetToReplace && result.item) {
							mergeServerItem(result.item, targetToReplace.id);
							if (inspectorItemId === targetToReplace.id) {
								setInspectorItemId(result.item.id);
							}
						} else if (Array.isArray(result.items) && result.items.length > 0) {
							const incomingHydrated = hydrateStudioMediaItems(result.items);
							setItems((prev) => {
								if (isSingleMode) {
									const preservedDeleted = prev.filter(
										(p) =>
											p.markedForDelete &&
											!incomingHydrated.some(
												(hi) => hi.id === p.id || hi.hash === p.hash || hi.name === p.name
											)
									);
									const singleNext = [
										...preservedDeleted,
										...incomingHydrated.slice(-1).map((hi) => ({ ...hi, sort: 0 })),
									];
									itemsRef.current = singleNext;
									emitChange(singleNext);
									return singleNext;
								}
								const next = [...prev];
								for (const hi of incomingHydrated) {
									const existingIdx = next.findIndex(
										(p) => p.id === hi.id || p.hash === hi.hash || p.name === hi.name
									);
									if (existingIdx >= 0) {
										next[existingIdx] = { ...next[existingIdx], ...hi, markedForDelete: false };
									} else if (
										maxFiles === 0 ||
										next.filter((p) => !p.markedForDelete).length < maxFiles
									) {
										next.push({ ...hi, sort: next.length });
									}
								}
								itemsRef.current = next;
								emitChange(next);
								return next;
							});
						}
						if (Array.isArray(result.errors) && result.errors.length > 0) {
							setValidationNotice(result.errors.join(' '));
						}
					} else {
						setValidationNotice(result.error || t('media.uploadFailed', 'Upload failed.'));
					}
				} finally {
					uploadAbortControllersRef.current.delete(taskId);
					setUploadTasks((prev) => prev.filter((tk) => tk.id !== taskId));
					if (reservedSlots > 0) {
						inFlightUploadsRef.current = Math.max(0, inFlightUploadsRef.current - 1);
					}
				}
			}
			setReplaceTarget(null);
			return;
		}

		// Fallback client-side DataTransfer queue
		if (!isMultiple) {
			if (isSingleMode && liveActiveExisting.length > 0) {
				setItems((prev) => {
					const marked = prev.map((it) => ({ ...it, markedForDelete: true }));
					itemsRef.current = marked;
					return marked;
				});
			}
			syncFallbackQueue(accepted.slice(0, 1));
		} else {
			const combined = [...queuedFilesRef.current, ...accepted];
			const maxFallback =
				maxFiles > 0 ? Math.max(0, maxFiles - liveActiveExisting.length) : combined.length;
			syncFallbackQueue(combined.slice(0, maxFallback));
		}
	};

	const processIncomingFilesRef = useRef(processIncomingFiles);
	processIncomingFilesRef.current = processIncomingFiles;

	const handleDropReplaceOnItem = useCallback((target: StudioMediaItem, files: FileList | null) => {
		void processIncomingFilesRef.current(files, target, true);
	}, []);

	const triggerReplacePicker = useCallback((target: StudioMediaItem) => {
		setReplaceTarget(target);
		replaceInputRef.current?.click();
	}, []);

	const inspectedIndex = inspectorItemId ? items.findIndex((it) => it.id === inspectorItemId) : -1;
	const inspectedItem = inspectedIndex >= 0 ? items[inspectedIndex] : null;
	const singleItem = isSingleMode && activeExisting.length > 0 ? activeExisting[0] : null;
	const singleDeletedItems = isSingleMode ? items.filter((it) => it.markedForDelete) : [];
	const hasInlineMeta = descriptionRows > 0 || useTags;
	const canAddMore = canUpload && (maxFiles === 0 || activeCount < maxFiles);

	const mergedFieldError =
		(rawProps.error && rawProps.error.trim() !== '' ? rawProps.error : '') ||
		(props.isStandaloneIsland && props.fieldErrors.length > 0 ? props.fieldErrors.join(' ') : '');
	const hasStatusSection = Boolean(mergedFieldError || validationNotice || uploadTasks.length > 0);

	const statusSectionNode = hasStatusSection ? (
		<div data-rw-field-slot="status" className="space-y-1.5">
			{mergedFieldError ? (
				<FieldStatusRow error={mergedFieldError} errorId={rawProps.errorId} />
			) : null}

			{validationNotice ? (
				<div
					role="alert"
					aria-live="assertive"
					className="flex items-start justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/8 px-3 py-1.5 text-xs font-medium text-destructive"
				>
					<div className="flex items-start gap-1.5 min-w-0">
						<DynamicIcon name="alert-circle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
						<span className="break-words">{validationNotice}</span>
					</div>
					<button
						type="button"
						onClick={() => setValidationNotice('')}
						aria-label={t('common.dismiss', 'Dismiss')}
						className="shrink-0 rounded-xs p-0.5 hover:bg-destructive/15 cursor-pointer"
					>
						<DynamicIcon name="x" className="size-3.5" aria-hidden="true" />
					</button>
				</div>
			) : null}

			{uploadTasks.length > 0 ? (
				<div className="space-y-1.5 rounded-md border border-border bg-muted/25 px-3 py-2" aria-live="polite">
					{uploadTasks.map((task) => (
						<div key={task.id} className="space-y-1">
							<div className="flex items-center justify-between gap-2 text-xs">
								<span className="truncate font-medium text-foreground">{task.name}</span>
								<div className="flex shrink-0 items-center gap-1.5">
									<span className="font-mono text-[11px] tabular-nums text-muted-foreground">
										{task.progress}%
									</span>
									<button
										type="button"
										onClick={() => cancelUploadTask(task.id)}
										aria-label={t('media.cancelUpload', 'Cancel upload')}
										title={t('media.cancelUpload', 'Cancel upload')}
										className="inline-flex size-5 items-center justify-center rounded-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer pointer-coarse:size-7"
									>
										<DynamicIcon name="x" className="size-3" aria-hidden="true" />
									</button>
								</div>
							</div>
							<progress data-rw-progress="" aria-label={task.name} value={task.progress} max={100} />
						</div>
					))}
				</div>
			) : null}
		</div>
	) : null;

	return (
		<div
			ref={rootRef}
			tabIndex={-1}
			onPaste={(e) => {
				if (!canUpload) return;
				const pasted = extractClipboardFiles(e);
				if (pasted.length > 0) {
					e.preventDefault();
					void processIncomingFiles(pasted);
				}
			}}
			className="@container space-y-2 focus:outline-none"
			data-rw-media-field="file"
			data-field-name={props.name || undefined}
		>
			{/* Hidden ProcessWire Form State Inputs */}
			{!isLocked ? (
				<>
					<MediaHiddenFormInputs
						items={items}
						isImage={false}
						descriptionRows={descriptionRows}
						useTags={useTags}
						languages={props.languages}
					/>
					{canUpload ? (
						<input
							ref={replaceInputRef}
							type="file"
							accept={acceptAttr || undefined}
							disabled={!canUpload}
							onChange={(e) => void processIncomingFiles(e.target.files, replaceTarget)}
							className="sr-only"
							tabIndex={-1}
						/>
					) : null}
				</>
			) : null}

			{/* CASE A: Unified Single-File Mode (`maxFiles === 1` — active, deleted/undo, pending, or empty) */}
			{isSingleMode ? (
				<div className="space-y-1.5">
					<div data-rw-field-slot="input">
					{singleItem ? (
						(() => {
							const langSummary = getLanguageCountSummary(singleItem, props.languages);
							return (
								<div
									onDragOver={(e) => {
										if (!canUpload || !hasDraggedOsFiles(e)) return;
										e.preventDefault();
										e.stopPropagation();
										if (!isDropOverSingle) {
											setIsDropOverSingle(true);
										}
									}}
									onDragLeave={(e) => {
										if (!isDropOverSingle) return;
										if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
											setIsDropOverSingle(false);
										}
									}}
									onDrop={(e) => {
										if (!canUpload || !hasDraggedOsFiles(e)) return;
										e.preventDefault();
										e.stopPropagation();
										setIsDropOverSingle(false);
										void processIncomingFiles(e.dataTransfer?.files || null, singleItem);
									}}
									className={cn(
										'relative overflow-hidden rounded-md border border-border bg-card px-2 py-1.5 shadow-2xs transition-colors space-y-2',
										isDropOverSingle && 'border-primary ring-2 ring-primary/25'
									)}
								>
									{isDropOverSingle ? (
										<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/85 backdrop-blur-[2px]">
											<div className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/12 px-2.5 py-0.5 text-[11px] font-semibold text-primary-ink">
												<DynamicIcon name="refresh-cw" className="size-3" aria-hidden="true" />
												<span>{t('media.dropToReplace', 'Drop file to replace')}</span>
											</div>
										</div>
									) : null}

									<div className="flex items-center justify-between gap-2">
										<div className="flex min-w-0 flex-1 items-center gap-2">
											<button
												type="button"
												onClick={() => setInspectorItemId(singleItem.id)}
												aria-label={t('media.editAsset', { name: singleItem.basename }, `Inspect & edit ${singleItem.basename}`)}
												className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/40 text-muted-foreground transition-colors hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<DynamicIcon name={resolveFileIconName(singleItem.ext)} className="size-3.5" aria-hidden="true" />
											</button>
											<div className="min-w-0 flex-1">
												<MediaItemFilename item={singleItem} isDeleted={false} />
												<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
													<span className="font-mono uppercase">
														{singleItem.ext || 'file'}
													</span>
													<span className="font-mono">
														· {singleItem.filesizeStr || formatMediaBytes(singleItem.size)}
													</span>
													{props.languages && props.languages.length > 1 ? (
														<span className="font-mono">
															· {langSummary.filled}/{langSummary.total}
														</span>
													) : null}
												</div>
											</div>
										</div>

										<div className="flex shrink-0 items-center gap-0.5">
											{hasInlineMeta ? (
												<Button
													type="button"
													variant={isSingleMetaOpen ? 'secondary' : 'ghost'}
													size="icon"
													aria-expanded={isSingleMetaOpen}
													aria-label={t('media.altLabelFile', 'Description')}
													title={t('media.altLabelFile', 'Description')}
													className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-9"
													onClick={() => setIsSingleMetaOpen((prev) => !prev)}
												>
													<DynamicIcon name="square-pen" className="size-3.5" aria-hidden="true" />
												</Button>
											) : null}
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-9"
												aria-label={t('common.edit', 'Edit')}
												title={t('common.edit', 'Edit')}
												onClick={() => setInspectorItemId(singleItem.id)}
											>
												<DynamicIcon name="sliders" className="size-3.5" aria-hidden="true" />
											</Button>
											{canUpload ? (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-9"
													aria-label={t('media.replace', 'Replace')}
													title={t('media.replace', 'Replace')}
													onClick={() => {
														if (hasLiveGateway) {
															triggerReplacePicker(singleItem);
														} else {
															inputRef.current?.click();
														}
													}}
												>
													<DynamicIcon name="refresh-cw" className="size-3.5" aria-hidden="true" />
												</Button>
											) : null}
											{!isLocked ? (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive pointer-coarse:size-9"
													aria-label={t(
														'media.removeFile',
														{ name: singleItem.basename },
														`Remove ${singleItem.basename}`
													)}
													title={t('common.delete', 'Delete')}
													onClick={() => toggleDelete(singleItem.id)}
												>
													<DynamicIcon name="trash" className="size-3.5" aria-hidden="true" />
												</Button>
											) : null}
										</div>
									</div>

									{isSingleMetaOpen && hasInlineMeta ? (
										<div className="space-y-1.5 border-t border-border/60 pt-2">
											{descriptionRows > 0 ? (
												<MultiLangDescriptionEditor
													item={singleItem}
													isImage={false}
													descriptionRows={descriptionRows}
													languages={props.languages}
													activeLangId={activeLangId}
													onSelectLang={setActiveLangId}
													disabled={isLocked}
													compact={descriptionRows === 1}
													onUpdateDescription={updateDescription}
												/>
											) : null}

											{useTags ? (
												<TagsChipEditor
													value={singleItem.tags || ''}
													tagsList={props.tagsList}
													predefinedOnly={props.tagsPredefinedOnly}
													disabled={isLocked}
													onChange={(nextTags) => updateTags(singleItem.id, nextTags)}
												/>
											) : null}
										</div>
									) : null}

									{canUpload ? (
										<input
											ref={inputRef}
											id={inputId}
											name={inputName}
											type="file"
											accept={acceptAttr || undefined}
											disabled={!canUpload}
											onChange={(e) => void processIncomingFiles(e.target.files, singleItem)}
											className="sr-only"
											tabIndex={-1}
										/>
									) : null}
								</div>
							);
						})()
					) : canAddMore ? (
						<CompactMediaDropBar
							inputRef={inputRef}
							inputId={inputId}
							inputName={inputName}
							isImage={false}
							isMultiple={false}
							isSingleMode={true}
							hasExistingItems={false}
							isLocked={isLocked}
							required={Boolean(props.required && activeCount === 0)}
							acceptAttr={acceptAttr || undefined}
							allowedExts={allowedExts}
							maxFiles={1}
							maxFilesize={props.maxFilesize}
							isDropOverZone={isDropOverZone}
							onSetDropOverZone={setIsDropOverZone}
							onFilesSelected={(files) => void processIncomingFiles(files)}
						/>
					) : canUpload ? (
						<input
							ref={inputRef}
							id={inputId}
							name={inputName}
							type="file"
							accept={acceptAttr || undefined}
							disabled={!canUpload}
							onChange={(e) => void processIncomingFiles(e.target.files)}
							className="sr-only"
							tabIndex={-1}
						/>
					) : items.length === 0 ? (
						<CompactMediaLockedBar isImage={false} />
					) : null}
					</div>

					{statusSectionNode}

					{!singleItem && ((activeCount === 0 && singleDeletedItems.length > 0) || queuedFiles.length > 0) ? (
						<div data-rw-field-slot="selected" className="space-y-1">
							{activeCount === 0 && singleDeletedItems.length > 0
								? singleDeletedItems.map((delItem) => (
										<div
											key={delItem.id}
											className="flex min-h-8 items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-xs"
										>
											<div className="flex min-w-0 items-center gap-2">
												<DynamicIcon
													name={resolveFileIconName(delItem.ext)}
													className="size-3.5 shrink-0 text-muted-foreground opacity-60"
													aria-hidden="true"
												/>
												<span className="truncate text-muted-foreground line-through">
													{delItem.basename}
												</span>
												<span className="hidden shrink-0 text-[11px] font-medium text-destructive @xs:inline">
													· {t('media.markedForDeletion', 'Marked for deletion')}
												</span>
											</div>
											{!isLocked ? (
												<Button
													type="button"
													variant="outline"
													size="xs"
													className="h-6 shrink-0 gap-1 px-2 text-[11px]"
													onClick={() => toggleDelete(delItem.id)}
												>
													<DynamicIcon name="rotate-ccw" className="size-3" aria-hidden="true" />
													<span>{t('media.undoDelete', 'Undo')}</span>
												</Button>
											) : null}
										</div>
									))
								: null}

							{queuedFiles.map((file, idx) => (
								<div
									key={`${file.name}_${idx}`}
									className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs"
								>
									<div className="flex min-w-0 items-center gap-2">
										<span className="font-medium text-primary">
											{t('media.pendingUpload', 'Pending save')}
										</span>
										<span className="truncate font-medium text-foreground">{file.name}</span>
										<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
											· {formatMediaBytes(file.size)}
										</span>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={t('media.removeFile', { name: file.name }, `Remove ${file.name}`)}
										className="size-7 shrink-0 text-muted-foreground hover:text-destructive pointer-coarse:size-9"
										onClick={() => syncFallbackQueue(queuedFiles.filter((_, qIdx) => qIdx !== idx))}
									>
										<DynamicIcon name="x" className="size-3.5" aria-hidden="true" />
									</Button>
								</div>
							))}
						</div>
					) : null}
				</div>
			) : (
				<>
					{/* Multi-File Input Drop Bar */}
					<div data-rw-field-slot="input">
						{canAddMore ? (
							<CompactMediaDropBar
								inputRef={inputRef}
								inputId={inputId}
								inputName={inputName}
								isImage={false}
								isMultiple={isMultiple}
								isSingleMode={isSingleMode}
								hasExistingItems={items.length > 0 || queuedFiles.length > 0}
								isLocked={isLocked}
								required={Boolean(props.required && activeCount === 0)}
								acceptAttr={acceptAttr || undefined}
								allowedExts={allowedExts}
								maxFiles={maxFiles}
								maxFilesize={props.maxFilesize}
								isDropOverZone={isDropOverZone}
								onSetDropOverZone={setIsDropOverZone}
								onFilesSelected={(files) => void processIncomingFiles(files)}
							/>
						) : canUpload ? (
							<input
								ref={inputRef}
								id={inputId}
								name={inputName}
								type="file"
								accept={acceptAttr || undefined}
								multiple={isMultiple}
								disabled={!canUpload}
								onChange={(e) => void processIncomingFiles(e.target.files)}
								className="sr-only"
								tabIndex={-1}
							/>
						) : items.length === 0 ? (
							<CompactMediaLockedBar isImage={false} />
						) : null}
					</div>

					{statusSectionNode}

					{/* Selected / Uploaded Multi-File List */}
					{items.length > 0 || queuedFiles.length > 0 ? (
						<div data-rw-field-slot="selected" className="space-y-2">
					{/* Multi-File Toolbar */}
					{items.length > 0 ? (
						<div className="flex flex-wrap items-center justify-between gap-2">
							<Badge variant="secondary" className="font-mono text-[11px] tabular-nums">
								{maxFiles > 0
									? `${activeCount}/${maxFiles}`
									: t('media.itemCount', { count: activeCount }, `${activeCount} item(s)`)}
							</Badge>

							<div className="flex items-center gap-1.5">
								<div
									role="group"
									className="inline-flex items-center rounded-md border border-border bg-muted/35 p-0.5"
								>
									<button
										type="button"
										onClick={() => setViewMode('table')}
										aria-pressed={viewMode === 'table'}
										aria-label={t('media.viewTable', 'Table view')}
										title={t('media.viewTable', 'Table view')}
										className={cn(
											'inline-flex items-center gap-1 rounded-xs px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer',
											viewMode === 'table'
												? 'bg-background text-foreground shadow-2xs'
												: 'text-muted-foreground hover:text-foreground'
										)}
									>
										<DynamicIcon name="list" className="size-3.5" aria-hidden="true" />
										<span className="hidden @sm:inline">{t('media.viewTable', 'Table view')}</span>
									</button>
									<button
										type="button"
										onClick={() => setViewMode('grid')}
										aria-pressed={viewMode === 'grid'}
										aria-label={t('media.viewGrid', 'Grid view')}
										title={t('media.viewGrid', 'Grid view')}
										className={cn(
											'inline-flex items-center gap-1 rounded-xs px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer',
											viewMode === 'grid'
												? 'bg-background text-foreground shadow-2xs'
												: 'text-muted-foreground hover:text-foreground'
										)}
									>
										<DynamicIcon name="layout-grid" className="size-3.5" aria-hidden="true" />
										<span className="hidden @sm:inline">{t('media.viewGrid', 'Grid view')}</span>
									</button>
								</div>

								{canAddMore && items.length > 3 ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-7 px-2.5 text-xs"
										onClick={() => inputRef.current?.click()}
									>
										<DynamicIcon name="plus" className="size-3.5" aria-hidden="true" />
										<span>{t('media.addFiles', 'Add files')}</span>
									</Button>
								) : null}
							</div>
						</div>
					) : null}

					{/* Multi-File List: Compact TABLE Mode */}
					{items.length > 0 && viewMode === 'table' ? (
						<>
							<SortableStatusRegion message={sortable.statusMessage} />
							<div
								{...sortable.getContainerProps()}
								className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-2xs"
							>
								{items.map((f, idx) => (
									<FileTableRow
										key={f.id}
										fileItem={f}
										totalItems={items.length}
										isLocked={isLocked}
										canUpload={canUpload}
										hasLiveGateway={hasLiveGateway}
										descriptionRows={descriptionRows}
										useTags={useTags}
										tagsList={props.tagsList}
										tagsPredefinedOnly={props.tagsPredefinedOnly}
										languages={props.languages}
										activeLangId={activeLangId}
										itemSortProps={sortable.getItemProps(f)}
										handleSortProps={
											!isLocked && items.length > 1
												? sortable.getHandleProps(f, idx)
												: null
										}
										onSelectLang={setActiveLangId}
										onUpdateDescription={updateDescription}
										onUpdateTags={updateTags}
										onOpenInspector={setInspectorItemId}
										onTriggerReplace={triggerReplacePicker}
										onDropReplace={handleDropReplaceOnItem}
										onToggleDelete={toggleDelete}
										t={t}
									/>
								))}
							</div>
						</>
					) : null}

					{/* Multi-File List: Compact GRID Mode */}
					{items.length > 0 && viewMode === 'grid' ? (
						<>
							<SortableStatusRegion message={sortable.statusMessage} />
							<div
								{...sortable.getContainerProps()}
								className="grid grid-cols-1 gap-2 @sm:grid-cols-2 @xl:grid-cols-3"
							>
								{items.map((f, idx) => (
									<FileGridCard
										key={f.id}
										fileItem={f}
										totalItems={items.length}
										isLocked={isLocked}
										canUpload={canUpload}
										hasLiveGateway={hasLiveGateway}
										descriptionRows={descriptionRows}
										languages={props.languages}
										itemSortProps={sortable.getItemProps(f)}
										handleSortProps={
											!isLocked && items.length > 1
												? sortable.getHandleProps(f, idx)
												: null
										}
										onOpenInspector={setInspectorItemId}
										onTriggerReplace={triggerReplacePicker}
										onDropReplace={handleDropReplaceOnItem}
										onToggleDelete={toggleDelete}
										t={t}
									/>
								))}
							</div>
						</>
					) : null}

					{/* Fallback Pending Queue */}
					{queuedFiles.length > 0 ? (
						<div className="space-y-1.5">
							{queuedFiles.map((file, idx) => (
								<div
									key={`${file.name}_${idx}`}
									className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs"
								>
									<div className="flex min-w-0 items-center gap-2">
										<span className="font-medium text-primary">
											{t('media.pendingUpload', 'Pending save')}
										</span>
										<span className="truncate font-medium text-foreground">{file.name}</span>
										<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
											· {formatMediaBytes(file.size)}
										</span>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={t('media.removeFile', { name: file.name }, `Remove ${file.name}`)}
										className="size-7 shrink-0 text-muted-foreground hover:text-destructive pointer-coarse:size-9"
										onClick={() => syncFallbackQueue(queuedFiles.filter((_, qIdx) => qIdx !== idx))}
									>
										<DynamicIcon name="x" className="size-3.5" aria-hidden="true" />
									</Button>
								</div>
							))}
						</div>
					) : null}
						</div>
					) : null}
				</>
			)}

			{/* Native Top-Layer Right-Hand Asset Inspector Drawer */}
			<AssetInspectorSheet
				open={Boolean(inspectedItem)}
				item={inspectedItem ?? null}
				itemIndex={inspectedIndex}
				totalItems={items.length}
				isImage={false}
				isLocked={isLocked}
				descriptionRows={descriptionRows}
				useTags={useTags}
				tagsList={props.tagsList}
				tagsPredefinedOnly={props.tagsPredefinedOnly}
				noUpload={noUpload}
				focusMode="off"
				useImageEditor={false}
				mediaEndpoint={props.mediaEndpoint}
				mediaToken={props.mediaToken}
				clientOwnerId={props.ownerId ? String(props.ownerId) : undefined}
				clientInputName={props.name || undefined}
				languages={props.languages}
				activeLangId={activeLangId}
				initialTab="details"
				onSelectLang={setActiveLangId}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) setInspectorItemId(null);
				}}
				onNavigateItem={(delta) => {
					const targetIdx = inspectedIndex + delta;
					const targetItem = targetIdx >= 0 ? items[targetIdx] : undefined;
					if (targetItem) {
						setInspectorItemId(targetItem.id);
					}
				}}
				onUpdateDescription={updateDescription}
				onUpdateTags={updateTags}
				onUpdateFocus={() => {}}
				onUpdateCustomValue={updateCustomValue}
				onTriggerReplace={canUpload && hasLiveGateway ? triggerReplacePicker : undefined}
				onToggleDelete={toggleDelete}
				onItemMutatedFromServer={(updated) => mergeServerItem(updated, inspectedItem?.id)}
			/>
		</div>
	);
}

export const FileFieldControl: React.FC<ReactInputfieldProps> = (rawProps) => <FileField {...rawProps} />;
