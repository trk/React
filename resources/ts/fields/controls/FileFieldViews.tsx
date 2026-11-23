import React, { useState } from 'react';
import { cn, DynamicIcon } from '../../lib/utils';
import { Button, SortableHandle, type SortableHandleProps } from '../../ui';
import {
	getLanguageCountSummary,
	hasDraggedOsFiles,
	MultiLangDescriptionEditor,
	TagsChipEditor,
	type StudioMediaItem,
} from '../media';
import { formatMediaBytes, MediaItemFilename } from '../shared';
import type { InputfieldLanguageItem } from '../types';

export function resolveFileIconName(ext?: string): string {
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

export type MediaTranslateFn = (
	key: string,
	paramsOrFallback?: string | Record<string, string | number | boolean | null | undefined>,
	maybeFallback?: string
) => string;

export const FileTableRow = React.memo(function FileTableRow({
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
	t: MediaTranslateFn;
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
			<div className="flex flex-col gap-1.5 @md/rw-media:flex-row @md/rw-media:items-center @md/rw-media:justify-between @md/rw-media:gap-2">
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
						<div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
							{fileItem.markedForDelete ? (
								<span className="truncate font-medium text-destructive">
									{t('media.markedForDeletion', 'Marked for deletion')}
								</span>
							) : (
								<>
									<span className="min-w-0 truncate font-mono">
										{[
											(fileItem.ext || 'file').toUpperCase(),
											fileItem.filesizeStr || formatMediaBytes(fileItem.size),
										].join(' · ')}
									</span>
									{languages && languages.length > 1 ? (
										<span className="shrink-0 font-mono">
											· {langSummary.filled}/{langSummary.total}
										</span>
									) : null}
									{fileItem.description?.trim() ? (
										<span className="hidden max-w-48 truncate @md/rw-media:inline">
											· {fileItem.description.trim()}
										</span>
									) : null}
								</>
							)}
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-end gap-0.5 border-t border-border/50 pt-1 @md/rw-media:shrink-0 @md/rw-media:flex-nowrap @md/rw-media:border-t-0 @md/rw-media:pt-0">
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

export const FileGridCard = React.memo(function FileGridCard({
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
	t: MediaTranslateFn;
}): React.ReactElement {
	const [isDropOverCard, setIsDropOverCard] = useState<boolean>(false);
	const langSummary = getLanguageCountSummary(fileItem, languages);
	const canDropReplace = Boolean(canUpload && hasLiveGateway && !fileItem.markedForDelete);

	return (
		<div
			{...itemSortProps}
			data-rw-media-card=""
			data-rw-media-kind="file"
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
				'@container/rw-file-card relative flex flex-col gap-1.5 overflow-hidden rounded-lg border border-border bg-card px-2.5 py-2 shadow-2xs transition-colors',
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
					<div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
						{fileItem.markedForDelete ? (
							<span className="truncate font-medium text-destructive">
								{t('media.markedForDeletion', 'Marked for deletion')}
							</span>
						) : (
							<>
								<span className="min-w-0 truncate font-mono">
									{[
										(fileItem.ext || 'file').toUpperCase(),
										fileItem.filesizeStr || formatMediaBytes(fileItem.size),
									].join(' · ')}
								</span>
								{languages && languages.length > 1 ? (
									<span className="shrink-0 font-mono">
										· {langSummary.filled}/{langSummary.total}
									</span>
								) : null}
							</>
						)}
					</div>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-end gap-0.5 border-t border-border/50 pt-1">
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
