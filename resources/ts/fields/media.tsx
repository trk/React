export {
	extractClipboardFiles,
	formatFocusPoint,
	hasDraggedOsFiles,
	parseFocusPoint,
	prepareImageFileForUpload,
	uploadMediaFileViaXhr,
	validateStudioIncomingFiles,
	type ActiveUploadTask,
	type FocusCoordinates,
	type MediaCustomFieldRenderer,
	type StudioMediaItem,
} from './mediaUtils';

export {
	getLanguageCountSummary,
	hydrateStudioMediaItems,
	MediaCustomFieldRendererContext,
	normalizeMediaControlProps,
	notifyHostFormChanged,
	parseTagsArray,
	postMediaJsonAction,
	registerMediaCustomFieldRenderer,
	sanitizeHexColor,
	sanitizeRasterLqip,
} from './media-studio/mediaHelpers';

export {
	MediaHiddenFormInputs,
	MultiLangDescriptionEditor,
	TagsChipEditor,
} from './media-studio/MediaEditors';

export {
	clampMovedCropRect,
	computeDraggedCropRect,
	computePresetCropRect,
	CropStage,
	stripAdminCacheBuster,
	type CropDragMode,
	type CropResizeHandle,
	type CropSelectionRect,
	type CropStageProps,
} from './media-studio/CropStage';

export { AssetInspectorSheet } from './media-studio/AssetInspectorSheet';

export {
	CompactMediaDropBar,
	CompactMediaLockedBar,
	MediaStatusBar,
	type CompactMediaDropBarProps,
} from './media-studio/CompactMediaBars';

export {
	useMediaCollectionController,
	type QueuedMediaEntry,
} from './media-studio/useMediaCollectionController';
