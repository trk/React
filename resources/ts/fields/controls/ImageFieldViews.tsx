import React, { useState } from 'react';
import { cn, DynamicIcon } from '../../lib/utils';
import { Button, SortableHandle, type SortableHandleProps } from '../../ui';
import {
	getLanguageCountSummary,
	hasDraggedOsFiles,
	MultiLangDescriptionEditor,
	parseFocusPoint,
	TagsChipEditor,
	type StudioMediaItem,
} from '../media';
import { formatMediaBytes, MediaItemFilename } from '../shared';
import type { InputfieldLanguageItem } from '../types';

export type ImageInspectorTab = 'details' | 'focus' | 'studio' | 'custom';

export type ImageTranslateFn = (
	key: string,
	paramsOrFallback?: string | Record<string, string | number | boolean | null | undefined>,
	maybeFallback?: string
) => string;

export const GRID_RATIO_CLASSES: Record<string, string> = {
	auto: 'min-h-32',
	'1:1': 'aspect-square',
	'4:3': 'aspect-4/3',
	'16:9': 'aspect-video',
	'3:4': 'aspect-3/4',
	'21:9': 'aspect-[21/9]',
};

export const ImageGridCard = React.memo(function ImageGridCard({
	img,
	idx,
	totalItems,
	isLocked,
	canUpload,
	hasLiveGateway,
	descriptionRows,
	focusMode,
	gridRatio,
	useImageEditor,
	languages,
	itemSortProps,
	handleSortProps,
	onOpenInspector,
	onToggleDelete,
	onDropReplace,
	t,
}: {
	img: StudioMediaItem;
	idx: number;
	totalItems: number;
	isLocked: boolean;
	canUpload: boolean;
	hasLiveGateway: boolean;
	descriptionRows: number;
	focusMode?: string;
	gridRatio?: string;
	useImageEditor?: boolean;
	languages?: InputfieldLanguageItem[];
	itemSortProps: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>;
	handleSortProps: SortableHandleProps | null;
	onOpenInspector: (itemId: string, tab: ImageInspectorTab) => void;
	onToggleDelete: (itemId: string) => void;
	onDropReplace: (target: StudioMediaItem, files: FileList | null) => void;
	t: ImageTranslateFn;
}): React.ReactElement {
	const [isDropOverCard, setIsDropOverCard] = useState<boolean>(false);
	const focusCoords = parseFocusPoint(img.focus);
	const langSummary = getLanguageCountSummary(img, languages);
	const canDropReplace = Boolean(canUpload && hasLiveGateway && !img.markedForDelete);

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
				onDropReplace(img, e.dataTransfer?.files || null);
			}}
			className={cn(
				'group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xs transition-colors hover:border-border/90',
				img.markedForDelete && 'border-destructive/35 bg-destructive/5',
				isDropOverCard && 'border-primary ring-2 ring-primary/25'
			)}
		>
			{isDropOverCard ? (
				<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/85 backdrop-blur-[2px]">
					<div className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/12 px-2.5 py-1 text-[11px] font-semibold text-primary-ink">
						<DynamicIcon name="refresh-cw" className="size-3" aria-hidden="true" />
						<span>{t('media.dropToReplace', 'Drop file to replace')}</span>
					</div>
				</div>
			) : null}

			{/* Compact Thumbnail Stage */}
			<div
				data-grid-ratio={gridRatio || '4:3'}
				className={cn(
					'relative w-full overflow-hidden bg-muted/40',
					GRID_RATIO_CLASSES[gridRatio || '4:3'] || GRID_RATIO_CLASSES['4:3']
				)}
				style={
					img.lqip
						? {
								backgroundImage: `url(${img.lqip})`,
								backgroundSize: 'cover',
								backgroundPosition: 'center',
							}
						: img.dominantColor
							? { backgroundColor: `${img.dominantColor}24` }
							: undefined
				}
			>
				<button
					type="button"
					onClick={() => onOpenInspector(img.id, 'details')}
					aria-label={t(
						'media.editAsset',
						{ name: img.basename },
						`Inspect & edit ${img.basename}`
					)}
					className="block size-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
				>
					<img
						src={img.thumbUrl || img.url}
						alt={img.description || img.basename}
						loading="lazy"
						decoding="async"
						className={cn(
							gridRatio === 'auto'
								? 'w-full h-auto max-h-48 @md/rw-media:max-h-64 object-contain'
								: 'size-full object-cover',
							'transition-transform duration-150 motion-reduce:transition-none group-hover:scale-[1.03] motion-reduce:group-hover:scale-100',
							img.markedForDelete && 'opacity-35 grayscale'
						)}
						style={{
							objectPosition: `${focusCoords.left}% ${focusCoords.top}%`,
							transform:
								focusCoords.zoom > 0
									? `scale(${(1 + focusCoords.zoom / 100).toFixed(2)})`
									: undefined,
							transformOrigin: `${focusCoords.left}% ${focusCoords.top}%`,
						}}
					/>
				</button>

				{/* Top-left Drag Handle + Format Badge */}
				<div className="absolute top-1.5 left-1.5 flex items-center gap-1">
					{!isLocked && totalItems > 1 && handleSortProps ? (
						<SortableHandle
							{...handleSortProps}
							title={t(
								'media.dragToReorder',
								{ name: img.basename },
								`Drag or use arrow keys to reorder ${img.basename} (#${idx + 1})`
							)}
							aria-label={t(
								'media.dragToReorder',
								{ name: img.basename },
								`Drag or use arrow keys to reorder ${img.basename}`
							)}
							className="rounded-sm bg-black/65 p-0.5 text-white hover:bg-black/80 hover:text-white backdrop-blur-[2px]"
						/>
					) : null}
					{img.ext ? (
						<span className="pointer-events-none rounded-sm bg-black/65 px-1 py-0.5 font-mono text-[9px] font-semibold uppercase text-white backdrop-blur-[2px]">
							{img.ext}
						</span>
					) : null}
				</div>

				{/* Top-right Status Badges */}
				<div className="pointer-events-none absolute top-1.5 right-1.5 flex items-center gap-1">
					{!img.markedForDelete && languages && languages.length > 1 ? (
						<span
							className={cn(
								'rounded-sm px-1 py-0.5 font-mono text-[9px] font-medium tabular-nums backdrop-blur-[2px]',
								langSummary.filled === langSummary.total
									? 'bg-success text-success-foreground'
									: 'bg-black/65 text-white'
							)}
						>
							{langSummary.filled}/{langSummary.total}
						</span>
					) : null}
					{!img.markedForDelete && descriptionRows > 0 && !langSummary.hasDefault ? (
						<span className="rounded-sm bg-warning px-1 py-0.5 text-[9px] font-semibold text-warning-foreground">
							!Alt
						</span>
					) : null}
				</div>

				{/* Hover Quick Actions Overlay (Focus & Crop) */}
				{!img.markedForDelete &&
				((focusMode !== 'off' && img.ext !== 'svg') ||
					(!isLocked && useImageEditor !== false && hasLiveGateway && img.ext !== 'svg')) ? (
					<div className="absolute right-1.5 bottom-1.5 flex items-center gap-0.5 rounded-md bg-black/70 p-0.5 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
						{focusMode !== 'off' && img.ext !== 'svg' ? (
							<button
								type="button"
								title={t('media.tabFocus', 'Focal Point')}
								aria-label={t('media.tabFocus', 'Focal Point')}
								onClick={() => onOpenInspector(img.id, 'focus')}
								className="inline-flex size-6 items-center justify-center rounded-xs text-white/85 hover:bg-white/20 hover:text-white cursor-pointer pointer-coarse:size-8"
							>
								<DynamicIcon name="crosshair" className="size-3" aria-hidden="true" />
							</button>
						) : null}
						{!isLocked && useImageEditor !== false && hasLiveGateway && img.ext !== 'svg' ? (
							<button
								type="button"
								title={t('media.tabStudio', 'Crop & Transform')}
								aria-label={t('media.tabStudio', 'Crop & Transform')}
								onClick={() => onOpenInspector(img.id, 'studio')}
								className="inline-flex size-6 items-center justify-center rounded-xs text-white/85 hover:bg-white/20 hover:text-white cursor-pointer pointer-coarse:size-8"
							>
								<DynamicIcon name="crop" className="size-3" aria-hidden="true" />
							</button>
						) : null}
					</div>
				) : null}
			</div>

			{/* Slim Single-Line Footer */}
			<div className="flex items-center justify-between gap-1 px-2 py-1">
				<span
					className={cn(
						'min-w-0 flex-1 truncate text-[11px] font-medium text-foreground',
						img.markedForDelete && 'text-muted-foreground line-through'
					)}
					title={`${img.basename} (${img.filesizeStr || formatMediaBytes(img.size)})`}
				>
					{img.basename}
				</span>

				<div className="flex shrink-0 items-center gap-0.5">
					{img.markedForDelete ? (
						!isLocked ? (
							<Button
								type="button"
								variant="outline"
								size="xs"
								className="h-6 gap-1 px-1.5 text-[10px]"
								onClick={() => onToggleDelete(img.id)}
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
								className="size-6 text-muted-foreground hover:text-foreground pointer-coarse:size-8"
								title={t('common.edit', 'Edit')}
								aria-label={t(
									'media.editAsset',
									{ name: img.basename },
									`Inspect & edit ${img.basename}`
								)}
								onClick={() => onOpenInspector(img.id, 'details')}
							>
								<DynamicIcon name="sliders" className="size-3" aria-hidden="true" />
							</Button>
							{!isLocked ? (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive pointer-coarse:size-8"
									title={t('common.delete', 'Delete')}
									aria-label={t(
										'media.removeFile',
										{ name: img.basename },
										`Remove ${img.basename}`
									)}
									onClick={() => onToggleDelete(img.id)}
								>
									<DynamicIcon name="trash" className="size-3" aria-hidden="true" />
								</Button>
							) : null}
						</>
					)}
				</div>
			</div>
		</div>
	);
});

export const ImageTableRow = React.memo(function ImageTableRow({
	img,
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
	img: StudioMediaItem;
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
	onOpenInspector: (itemId: string, tab: ImageInspectorTab) => void;
	onTriggerReplace: (item: StudioMediaItem) => void;
	onDropReplace: (target: StudioMediaItem, files: FileList | null) => void;
	onToggleDelete: (itemId: string) => void;
	t: ImageTranslateFn;
}): React.ReactElement {
	const [isDropOverRow, setIsDropOverRow] = useState<boolean>(false);
	const [isInlineMetaOpen, setIsInlineMetaOpen] = useState<boolean>(false);
	const focusCoords = parseFocusPoint(img.focus);
	const langSummary = getLanguageCountSummary(img, languages);
	const canDropReplace = Boolean(canUpload && hasLiveGateway && !img.markedForDelete);
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
				onDropReplace(img, e.dataTransfer?.files || null);
			}}
			className={cn(
				'relative px-2.5 py-1.5 transition-colors space-y-2',
				img.markedForDelete && 'bg-destructive/5',
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
								{ name: img.basename },
								`Reorder ${img.basename}`
							)}
							aria-label={t(
								'media.dragToReorder',
								{ name: img.basename },
								`Reorder ${img.basename}`
							)}
						/>
					) : null}
					<button
						type="button"
						onClick={() => onOpenInspector(img.id, 'details')}
						aria-label={t('media.editAsset', { name: img.basename }, `Inspect & edit ${img.basename}`)}
						className="h-8 w-11 shrink-0 overflow-hidden rounded-sm border border-border bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<img
							src={img.thumbUrl || img.url}
							alt=""
							loading="lazy"
							decoding="async"
							className={cn(
								'size-full object-cover',
								img.markedForDelete && 'opacity-40 grayscale'
							)}
							style={{
								objectPosition: `${focusCoords.left}% ${focusCoords.top}%`,
							}}
						/>
					</button>
					<div className="min-w-0 flex-1">
						<MediaItemFilename item={img} isDeleted={img.markedForDelete} />
						<div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
							{img.markedForDelete ? (
								<span className="truncate font-medium text-destructive">
									{t('media.markedForDeletion', 'Marked for deletion')}
								</span>
							) : (
								<>
									<span className="min-w-0 truncate font-mono">
										{[
											img.ext ? img.ext.toUpperCase() : '',
											img.width && img.height ? `${img.width}×${img.height}` : '',
											img.filesizeStr || formatMediaBytes(img.size),
										]
											.filter(Boolean)
											.join(' · ')}
									</span>
									{languages && languages.length > 1 ? (
										<span className="shrink-0 font-mono">
											· {langSummary.filled}/{langSummary.total}
										</span>
									) : null}
									{descriptionRows > 0 && !langSummary.hasDefault ? (
										<span className="shrink-0 font-medium text-warning">
											<span className="@sm/rw-media:hidden">· !Alt</span>
											<span className="hidden @sm/rw-media:inline">
												· {t('media.missingAlt', 'Missing alt')}
											</span>
										</span>
									) : img.description?.trim() ? (
										<span className="hidden max-w-48 truncate @md/rw-media:inline">
											· {img.description.trim()}
										</span>
									) : null}
								</>
							)}
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-end gap-0.5 border-t border-border/50 pt-1 @md/rw-media:shrink-0 @md/rw-media:flex-nowrap @md/rw-media:border-t-0 @md/rw-media:pt-0">
					{img.markedForDelete ? (
						!isLocked ? (
							<Button
								type="button"
								variant="outline"
								size="xs"
								className="h-6 gap-1 px-2 text-[11px]"
								onClick={() => onToggleDelete(img.id)}
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
									aria-label={t('media.altLabelImage', 'Alt text / description')}
									title={t('media.altLabelImage', 'Alt text / description')}
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
								onClick={() => onOpenInspector(img.id, 'details')}
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
									onClick={() => onTriggerReplace(img)}
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
										{ name: img.basename },
										`Remove ${img.basename}`
									)}
									title={t('common.delete', 'Delete')}
									onClick={() => onToggleDelete(img.id)}
								>
									<DynamicIcon name="trash" className="size-3.5" aria-hidden="true" />
								</Button>
							) : null}
						</>
					)}
				</div>
			</div>

			{isInlineMetaOpen && !img.markedForDelete && hasInlineMeta ? (
				<div className="space-y-1.5 border-t border-border/60 pt-2">
					{descriptionRows > 0 ? (
						<MultiLangDescriptionEditor
							item={img}
							isImage={true}
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
							value={img.tags || ''}
							tagsList={tagsList}
							predefinedOnly={tagsPredefinedOnly}
							disabled={isLocked}
							onChange={(nextTags) => onUpdateTags(img.id, nextTags)}
						/>
					) : null}
				</div>
			) : null}
		</div>
	);
});
