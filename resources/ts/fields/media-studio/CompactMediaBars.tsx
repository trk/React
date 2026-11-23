import React from 'react';
import { useTranslations } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { hasDraggedOsFiles, type ActiveUploadTask } from '../mediaUtils';
import { FieldStatusRow, formatMediaBytes } from '../shared';

export interface CompactMediaDropBarProps {
	inputRef: React.RefObject<HTMLInputElement | null>;
	inputId: string;
	inputName: string;
	isImage: boolean;
	isMultiple: boolean;
	isSingleMode: boolean;
	hasExistingItems: boolean;
	isLocked: boolean;
	required: boolean;
	acceptAttr?: string;
	allowedExts: string[];
	maxFiles: number;
	maxFilesize?: number;
	isDropOverZone: boolean;
	onSetDropOverZone: (over: boolean) => void;
	onFilesSelected: (files: FileList | null) => void;
}

export function CompactMediaDropBar({
	inputRef,
	inputId,
	inputName,
	isImage,
	isMultiple,
	isSingleMode,
	hasExistingItems,
	isLocked,
	required,
	acceptAttr,
	allowedExts,
	maxFiles,
	maxFilesize,
	isDropOverZone,
	onSetDropOverZone,
	onFilesSelected,
}: CompactMediaDropBarProps): React.ReactElement {
	const { t } = useTranslations('core');

	const buttonLabel = isImage
		? isSingleMode
			? t('media.chooseImage', 'Choose image')
			: hasExistingItems
				? t('media.addImages', 'Add images')
				: t('media.chooseImages', 'Choose images')
		: isSingleMode
			? t('media.chooseFile', 'Choose file')
			: hasExistingItems
				? t('media.addFiles', 'Add files')
				: t('media.chooseFiles', 'Choose files');

	const buttonIcon = isImage
		? hasExistingItems && !isSingleMode
			? 'plus'
			: 'image-plus'
		: hasExistingItems && !isSingleMode
			? 'plus'
			: 'folder-open';

	const maxVisibleExts = 4;
	const compactExtsLabel =
		allowedExts.length > maxVisibleExts
			? `${allowedExts.slice(0, maxVisibleExts).join(', ')} +${allowedExts.length - maxVisibleExts}`
			: allowedExts.join(', ');

	const maxSizeText =
		maxFilesize && maxFilesize > 0
			? t('media.maxSizeHint', { size: formatMediaBytes(maxFilesize) }, `Max ${formatMediaBytes(maxFilesize)}`)
			: '';

	const maxFilesText =
		maxFiles > 1 ? t('media.maxFilesHint', { count: maxFiles }, `Up to ${maxFiles} items`) : '';

	const fullConstraintsTooltip = [
		allowedExts.length > 0 ? allowedExts.map((ext) => `.${ext}`).join(', ') : '',
		maxSizeText,
		maxFilesText,
	]
		.filter(Boolean)
		.join(' · ');

	return (
		<label
			htmlFor={inputId}
			title={fullConstraintsTooltip || undefined}
			onDragOver={(e) => {
				if (isLocked || !hasDraggedOsFiles(e)) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				if (!isDropOverZone) {
					onSetDropOverZone(true);
				}
			}}
			onDragLeave={(e) => {
				if (!isDropOverZone) {
					return;
				}
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
					onSetDropOverZone(false);
				}
			}}
			onDrop={(e) => {
				if (isLocked || !hasDraggedOsFiles(e)) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				onSetDropOverZone(false);
				onFilesSelected(e.dataTransfer?.files || null);
			}}
			className={cn(
				'group/dropbar flex min-h-9 w-full items-center justify-between gap-2.5 rounded-md border border-dashed border-input bg-input-surface px-1.5 py-1 shadow-2xs transition-colors cursor-pointer select-none pointer-coarse:min-h-11',
				'hover:border-primary/55 hover:bg-muted/35',
				'has-focus-visible:border-ring has-focus-visible:ring-2 has-focus-visible:ring-ring',
				isDropOverZone && 'border-primary bg-primary/8 ring-2 ring-primary/20'
			)}
		>
			<div className="flex min-w-0 flex-1 items-center gap-2.5">
				<span
					className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] bg-[var(--button-bg)] px-3 text-xs font-medium text-[var(--button-fg)] shadow-2xs transition-colors group-hover/dropbar:bg-[var(--button-hover-bg)] group-hover/dropbar:text-[var(--button-hover-fg)] pointer-coarse:h-8 pointer-coarse:px-3.5"
				>
					<DynamicIcon name={buttonIcon} className="size-3.5 shrink-0" aria-hidden="true" />
					<span>{buttonLabel}</span>
				</span>

				{compactExtsLabel || maxSizeText || maxFilesText ? (
					<span className="hidden @2xs/rw-media:inline min-w-0 truncate text-[11px] tabular-nums text-muted-foreground">
						{compactExtsLabel ? <span className="font-mono">{compactExtsLabel}</span> : null}
						{maxSizeText ? (
							<span className={cn(compactExtsLabel && 'hidden @md/rw-media:inline')}>
								{compactExtsLabel ? ` · ${maxSizeText}` : maxSizeText}
							</span>
						) : null}
						{maxFilesText ? (
							<span className="hidden @lg/rw-media:inline">
								{compactExtsLabel || maxSizeText ? ` · ${maxFilesText}` : maxFilesText}
							</span>
						) : null}
					</span>
				) : null}
			</div>

			<span
				aria-hidden="true"
				className={cn(
					'shrink-0 items-center gap-1.5 pr-1.5 text-[11px] transition-colors',
					isDropOverZone
						? 'flex font-medium text-primary'
						: 'hidden text-muted-foreground @sm/rw-media:flex'
				)}
			>
				<DynamicIcon name="upload-cloud" className="size-3.5 shrink-0 opacity-80" />
				<span>
					{isDropOverZone
						? t('media.dropToUpload', 'Drop to upload')
						: t('media.dropOrPaste', 'Drop or paste')}
				</span>
			</span>

			<input
				ref={inputRef}
				id={inputId}
				name={inputName}
				type="file"
				accept={acceptAttr || undefined}
				multiple={isMultiple}
				disabled={isLocked}
				required={required}
				onChange={(e) => onFilesSelected(e.target.files)}
				className="sr-only"
			/>
		</label>
	);
}

export function CompactMediaLockedBar({
	isImage,
	isDisabled,
}: {
	isImage: boolean;
	isDisabled?: boolean;
}): React.ReactElement {
	const { t } = useTranslations('core');
	const message = isDisabled
		? isImage
			? t('media.imageUploadLocked', 'Image upload is locked.')
			: t('media.fileUploadLocked', 'File upload is locked.')
		: t('form.noItemsSelected', 'No items selected.');

	return (
		<div
			data-rw-media-locked={isDisabled ? 'disabled' : 'readonly'}
			aria-disabled={isDisabled || undefined}
			className="flex min-h-9 items-center gap-2 rounded-md border border-dashed border-border bg-muted/25 px-3 py-1.5 text-xs text-muted-foreground opacity-80 pointer-coarse:min-h-11"
		>
			<DynamicIcon name={isImage ? 'image' : 'file'} className="size-3.5 shrink-0 opacity-75" aria-hidden="true" />
			<span className="truncate">{message}</span>
			{isDisabled ? (
				<DynamicIcon name="lock" className="ml-auto size-3.5 shrink-0 opacity-75" aria-hidden="true" />
			) : null}
		</div>
	);
}

export function MediaStatusBar({
	mergedFieldError,
	errorId,
	validationNotice,
	onDismissNotice,
	uploadTasks,
	onCancelUploadTask,
}: {
	mergedFieldError: string;
	errorId?: string;
	validationNotice: string;
	onDismissNotice: () => void;
	uploadTasks: ActiveUploadTask[];
	onCancelUploadTask: (taskId: string) => void;
}): React.ReactElement | null {
	const { t } = useTranslations('core');
	if (!mergedFieldError && !validationNotice && uploadTasks.length === 0) {
		return null;
	}

	return (
		<div data-rw-field-slot="status" className="space-y-1.5">
			{mergedFieldError ? <FieldStatusRow error={mergedFieldError} errorId={errorId} /> : null}

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
						onClick={onDismissNotice}
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
										onClick={() => onCancelUploadTask(task.id)}
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
	);
}
