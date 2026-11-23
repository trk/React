import React, { useCallback, useState } from 'react';
import { useTranslations } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Button, SortableStatusRegion } from '../../ui';
import {
	ImageGridCard,
	ImageTableRow,
	type ImageInspectorTab,
} from './ImageFieldViews';
import {
	AssetInspectorSheet,
	CompactMediaDropBar,
	CompactMediaLockedBar,
	extractClipboardFiles,
	getLanguageCountSummary,
	hasDraggedOsFiles,
	MediaHiddenFormInputs,
	MediaStatusBar,
	MultiLangDescriptionEditor,
	normalizeMediaControlProps,
	parseFocusPoint,
	TagsChipEditor,
	useMediaCollectionController,
} from '../media';
import { formatMediaBytes, MediaItemFilename } from '../shared';
import type { ReactInputfieldProps } from '../types';

export type { ImageInspectorTab };

export function ImageField(rawProps: ReactInputfieldProps): React.ReactElement {
	const { t } = useTranslations('core');
	const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
		const initialMode = normalizeMediaControlProps(rawProps, true).gridMode;
		return initialMode === 'list' || initialMode === 'table' ? 'table' : 'grid';
	});
	const [inspectorState, setInspectorState] = useState<{
		itemId: string;
		tab: ImageInspectorTab;
	} | null>(null);

	const openInspector = useCallback((itemId: string, tab: ImageInspectorTab) => {
		setInspectorState({ itemId, tab });
	}, []);

	const {
		props,
		rootRef,
		inputRef,
		replaceInputRef,
		isLocked,
		noUpload,
		canUpload,
		maxFiles,
		isSingleMode,
		isMultiple,
		inputId,
		inputName,
		descriptionRows,
		useTags,
		allowedExts,
		acceptAttr,
		hasLiveGateway,
		items,
		queuedEntries,
		uploadTasks,
		validationNotice,
		setValidationNotice,
		isSingleMetaOpen,
		setIsSingleMetaOpen,
		isDropOverZone,
		setIsDropOverZone,
		isDropOverSingle,
		setIsDropOverSingle,
		replaceTarget,
		activeLangId,
		setActiveLangId,
		sortable,
		activeExisting,
		singleItem,
		singleDeletedItems,
		hasInlineMeta,
		canAddMore,
		mergedFieldError,
		updateDescription,
		updateTags,
		updateFocus,
		updateCustomValue,
		toggleDelete,
		cancelUploadTask,
		mergeServerItem,
		removeQueuedEntry,
		processIncomingFiles,
		handleDropReplace,
		triggerReplacePicker,
	} = useMediaCollectionController({
		rawProps,
		isImage: true,
		viewMode,
		onItemReplaced: (replacedId, nextItem) => {
			setInspectorState((prev) =>
				prev?.itemId === replacedId ? { itemId: nextItem.id, tab: prev.tab } : prev
			);
		},
	});

	const activeCount = activeExisting.length + queuedEntries.length;
	const effectiveViewMode = items.length === 1 ? 'table' : viewMode;
	const inspectedIndex = inspectorState
		? items.findIndex((it) => it.id === inspectorState.itemId)
		: -1;
	const inspectedItem = inspectedIndex >= 0 ? items[inspectedIndex] : null;

	const statusBarNode = (
		<MediaStatusBar
			mergedFieldError={mergedFieldError}
			errorId={rawProps.errorId}
			validationNotice={validationNotice}
			onDismissNotice={() => setValidationNotice('')}
			uploadTasks={uploadTasks}
			onCancelUploadTask={cancelUploadTask}
		/>
	);

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
			className="@container/rw-media min-w-0 w-full space-y-2 focus:outline-none"
			data-rw-media-field="image"
			data-field-name={props.name || undefined}
		>
			{/* Hidden ProcessWire Form State Inputs */}
			{!isLocked ? (
				<>
					<MediaHiddenFormInputs
						items={items}
						isImage={true}
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

			{/* CASE A: Unified Single-Image Mode (`maxFiles === 1` — active, deleted/undo, pending, or empty) */}
			{isSingleMode ? (
				<div className="space-y-1.5">
					<div data-rw-field-slot="input">
					{singleItem ? (
						(() => {
							const focusCoords = parseFocusPoint(singleItem.focus);
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

									<div className="flex flex-col gap-1.5 @md/rw-media:flex-row @md/rw-media:items-center @md/rw-media:justify-between @md/rw-media:gap-2">
										<div className="flex min-w-0 flex-1 items-center gap-2">
											<button
												type="button"
												onClick={() => setInspectorState({ itemId: singleItem.id, tab: 'details' })}
												aria-label={t('media.editAsset', { name: singleItem.basename }, `Inspect & edit ${singleItem.basename}`)}
												style={
													singleItem.lqip
														? {
																backgroundImage: `url(${singleItem.lqip})`,
																backgroundSize: 'cover',
																backgroundPosition: 'center',
															}
														: singleItem.dominantColor
															? { backgroundColor: `${singleItem.dominantColor}26` }
															: undefined
												}
												className="group relative h-8 w-11 shrink-0 overflow-hidden rounded-sm border border-border bg-muted/40 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<img
													src={singleItem.thumbUrl || singleItem.url}
													alt={singleItem.description || singleItem.basename}
													loading="lazy"
													decoding="async"
													className="size-full object-cover transition-transform duration-150 motion-reduce:transition-none group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
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

											<div className="min-w-0 flex-1">
												<MediaItemFilename item={singleItem} isDeleted={false} />
												<div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
													<span className="min-w-0 truncate font-mono">
														{[
															singleItem.ext ? singleItem.ext.toUpperCase() : '',
															singleItem.width && singleItem.height
																? `${singleItem.width}×${singleItem.height}`
																: '',
															singleItem.filesizeStr || formatMediaBytes(singleItem.size),
														]
															.filter(Boolean)
															.join(' · ')}
													</span>
													{singleItem.dominantColor ? (
														<span
															className="inline-block size-2 shrink-0 rounded-full border border-black/15"
															style={{ backgroundColor: singleItem.dominantColor }}
															title={singleItem.dominantColor}
														/>
													) : null}
													{props.languages && props.languages.length > 1 ? (
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
													) : null}
												</div>
											</div>
										</div>

										<div className="flex flex-wrap items-center justify-end gap-0.5 border-t border-border/50 pt-1 @md/rw-media:shrink-0 @md/rw-media:flex-nowrap @md/rw-media:border-t-0 @md/rw-media:pt-0">
											{hasInlineMeta ? (
												<Button
													type="button"
													variant={isSingleMetaOpen ? 'secondary' : 'ghost'}
													size="icon"
													aria-expanded={isSingleMetaOpen}
													aria-label={t('media.altLabelImage', 'Alt text / description')}
													title={t('media.altLabelImage', 'Alt text / description')}
													className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-9"
													onClick={() => setIsSingleMetaOpen((prev) => !prev)}
												>
													<DynamicIcon name="square-pen" className="size-3.5" aria-hidden="true" />
												</Button>
											) : null}
											{props.focusMode !== 'off' && singleItem.ext !== 'svg' ? (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-9"
													aria-label={t('media.tabFocus', 'Focal Point')}
													title={t('media.tabFocus', 'Focal Point')}
													onClick={() =>
														setInspectorState({ itemId: singleItem.id, tab: 'focus' })
													}
												>
													<DynamicIcon name="crosshair" className="size-3.5" aria-hidden="true" />
												</Button>
											) : null}
											{!isLocked && props.useImageEditor !== false && hasLiveGateway && singleItem.ext !== 'svg' ? (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-9"
													aria-label={t('media.tabStudio', 'Crop & Transform')}
													title={t('media.tabStudio', 'Crop & Transform')}
													onClick={() =>
														setInspectorState({ itemId: singleItem.id, tab: 'studio' })
													}
												>
													<DynamicIcon name="crop" className="size-3.5" aria-hidden="true" />
												</Button>
											) : null}
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-7 text-muted-foreground hover:text-foreground pointer-coarse:size-9"
												aria-label={t('common.edit', 'Edit')}
												title={t('common.edit', 'Edit')}
												onClick={() =>
													setInspectorState({ itemId: singleItem.id, tab: 'details' })
												}
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
													isImage={true}
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
							isImage={true}
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
						<CompactMediaLockedBar isImage={true} isDisabled={Boolean(props.disabled)} />
					) : null}
					</div>

					{statusBarNode}

					{!singleItem && ((activeCount === 0 && singleDeletedItems.length > 0) || queuedEntries.length > 0) ? (
						<div data-rw-field-slot="selected" className="space-y-1">
							{activeCount === 0 && singleDeletedItems.length > 0
								? singleDeletedItems.map((delItem) => (
										<div
											key={delItem.id}
											className="flex min-h-8 items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-xs"
										>
											<div className="flex min-w-0 flex-1 items-center gap-2">
												<img
													src={delItem.thumbUrl || delItem.url}
													alt=""
													loading="lazy"
													decoding="async"
													className="size-6 shrink-0 rounded-xs border border-border object-cover opacity-45 grayscale"
												/>
												<span className="truncate text-muted-foreground line-through">
													{delItem.basename}
												</span>
												<span className="hidden shrink-0 text-[11px] font-medium text-destructive @xs/rw-media:inline">
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

							{queuedEntries.map((item, idx) => (
								<div
									key={`${item.file.name}_${idx}`}
									className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-xs"
								>
									<div className="flex min-w-0 flex-1 items-center gap-2">
										{item.previewUrl ? (
											<img
												src={item.previewUrl}
												alt={item.file.name}
												decoding="async"
												className="h-8 w-11 shrink-0 rounded-sm border border-border object-cover"
											/>
										) : null}
										<div className="min-w-0 flex-1">
											<span className="block truncate font-medium text-foreground">
												{item.file.name}
											</span>
											<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
												<span className="font-medium text-primary">
													{t('media.pendingUpload', 'Pending save')}
												</span>
												<span className="font-mono tabular-nums">
													· {formatMediaBytes(item.file.size)}
												</span>
											</div>
										</div>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={t('media.removeFile', { name: item.file.name }, `Remove ${item.file.name}`)}
										className="size-7 shrink-0 text-muted-foreground hover:text-destructive pointer-coarse:size-9"
										onClick={() => removeQueuedEntry(idx)}
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
					{/* Multi-Image Input Drop Bar */}
					<div data-rw-field-slot="input">
						{canAddMore ? (
							<CompactMediaDropBar
								inputRef={inputRef}
								inputId={inputId}
								inputName={inputName}
								isImage={true}
								isMultiple={isMultiple}
								isSingleMode={isSingleMode}
								hasExistingItems={items.length > 0 || queuedEntries.length > 0}
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
							<CompactMediaLockedBar isImage={true} isDisabled={Boolean(props.disabled)} />
						) : null}
					</div>

					{statusBarNode}

					{/* Selected / Uploaded Multi-Image Gallery */}
					{items.length > 0 || queuedEntries.length > 0 ? (
						<div data-rw-field-slot="selected" className="space-y-2">
					{/* Multi-Image Toolbar (`Grid` <-> `Table` Switcher + Count) */}
					{items.length > 1 || (items.length > 0 && maxFiles > 0) ? (
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<Badge variant="secondary" className="font-mono text-[11px] tabular-nums">
									{maxFiles > 0
										? `${activeCount}/${maxFiles}`
										: t('media.itemCount', { count: activeCount }, `${activeCount} item(s)`)}
								</Badge>
							</div>

							{items.length > 1 ? (
								<div className="flex items-center gap-1.5">
									<div
										role="group"
										className="inline-flex items-center rounded-md border border-border bg-muted/35 p-0.5"
									>
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
											<span className="hidden @sm/rw-media:inline">{t('media.viewGrid', 'Grid view')}</span>
										</button>
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
											<span className="hidden @sm/rw-media:inline">{t('media.viewTable', 'Table view')}</span>
										</button>
									</div>
								</div>
							) : null}
						</div>
					) : null}

					{/* Multi-Image Gallery: Compact GRID Mode */}
					{items.length > 0 && effectiveViewMode === 'grid' ? (
						<>
							<SortableStatusRegion message={sortable.statusMessage} />
							<div
								{...sortable.getContainerProps()}
								className="grid grid-cols-1 gap-2 @2xs/rw-media:grid-cols-2 @lg/rw-media:grid-cols-3 @2xl/rw-media:grid-cols-4 @4xl/rw-media:grid-cols-5"
							>
								{items.map((img, idx) => (
									<ImageGridCard
										key={img.id}
										img={img}
										idx={idx}
										totalItems={items.length}
										isLocked={isLocked}
										canUpload={canUpload}
										hasLiveGateway={hasLiveGateway}
										descriptionRows={descriptionRows}
										focusMode={props.focusMode}
										gridRatio={props.gridRatio}
										useImageEditor={props.useImageEditor}
										languages={props.languages}
										itemSortProps={sortable.getItemProps(img)}
										handleSortProps={
											!isLocked && items.length > 1
												? sortable.getHandleProps(img, idx)
												: null
										}
										onOpenInspector={openInspector}
										onToggleDelete={toggleDelete}
										onDropReplace={handleDropReplace}
										t={t}
									/>
								))}
							</div>
						</>
					) : null}

					{/* Multi-Image Gallery: Compact TABLE / LIST Mode */}
					{items.length > 0 && effectiveViewMode === 'table' ? (
						<>
							<SortableStatusRegion message={sortable.statusMessage} />
							<div
								{...sortable.getContainerProps()}
								className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-2xs"
							>
								{items.map((img, idx) => (
									<ImageTableRow
										key={img.id}
										img={img}
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
										itemSortProps={sortable.getItemProps(img)}
										handleSortProps={
											!isLocked && items.length > 1
												? sortable.getHandleProps(img, idx)
												: null
										}
										onSelectLang={setActiveLangId}
										onUpdateDescription={updateDescription}
										onUpdateTags={updateTags}
										onOpenInspector={openInspector}
										onTriggerReplace={triggerReplacePicker}
										onDropReplace={handleDropReplace}
										onToggleDelete={toggleDelete}
										t={t}
									/>
								))}
							</div>
						</>
					) : null}

					{/* Fallback Pending Queue Strips (when no live mediaToken is active) */}
					{queuedEntries.length > 0 ? (
						<div className="space-y-1.5">
							{queuedEntries.map((item, idx) => (
								<div
									key={`${item.file.name}_${idx}`}
									className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-xs"
								>
									<div className="flex min-w-0 flex-1 items-center gap-2">
										{item.previewUrl ? (
											<img
												src={item.previewUrl}
												alt={item.file.name}
												decoding="async"
												className="h-8 w-11 shrink-0 rounded-sm border border-border object-cover"
											/>
										) : null}
										<div className="min-w-0 flex-1">
											<span className="block truncate font-medium text-foreground">
												{item.file.name}
											</span>
											<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
												<span className="font-medium text-primary">
													{t('media.pendingUpload', 'Pending save')}
												</span>
												<span className="font-mono tabular-nums">
													· {formatMediaBytes(item.file.size)}
												</span>
											</div>
										</div>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={t('media.removeFile', { name: item.file.name }, `Remove ${item.file.name}`)}
										className="size-7 shrink-0 text-muted-foreground hover:text-destructive pointer-coarse:size-9"
										onClick={() => removeQueuedEntry(idx)}
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
				isImage={true}
				isLocked={isLocked}
				descriptionRows={descriptionRows}
				useTags={useTags}
				tagsList={props.tagsList}
				tagsPredefinedOnly={props.tagsPredefinedOnly}
				noUpload={noUpload}
				focusMode={props.focusMode}
				useImageEditor={props.useImageEditor}
				mediaEndpoint={props.mediaEndpoint}
				mediaToken={props.mediaToken}
				clientOwnerId={props.ownerId ? String(props.ownerId) : undefined}
				clientInputName={props.name || undefined}
				languages={props.languages}
				activeLangId={activeLangId}
				initialTab={inspectorState?.tab || 'details'}
				onSelectLang={setActiveLangId}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) setInspectorState(null);
				}}
				onNavigateItem={(delta) => {
					const targetIdx = inspectedIndex + delta;
					const targetItem = targetIdx >= 0 ? items[targetIdx] : undefined;
					if (targetItem) {
						setInspectorState({
							itemId: targetItem.id,
							tab: inspectorState?.tab || 'details',
						});
					}
				}}
				onUpdateDescription={updateDescription}
				onUpdateTags={updateTags}
				onUpdateFocus={updateFocus}
				onUpdateCustomValue={updateCustomValue}
				onTriggerReplace={canUpload && hasLiveGateway ? triggerReplacePicker : undefined}
				onToggleDelete={toggleDelete}
				onItemMutatedFromServer={(updated) => mergeServerItem(updated, inspectedItem?.id)}
			/>
		</div>
	);
}

export const ImageFieldControl: React.FC<ReactInputfieldProps> = (rawProps) => <ImageField {...rawProps} />;
