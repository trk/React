import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from '../../lib/i18n';
import { useSortableList } from '../../ui';
import {
	formatFocusPoint,
	prepareImageFileForUpload,
	uploadMediaFileViaXhr,
	validateStudioIncomingFiles,
	type ActiveUploadTask,
	type FocusCoordinates,
	type StudioMediaItem,
} from '../mediaUtils';
import {
	assignInputFiles,
	ensureNativeLanguageTabsBridge,
	LANGUAGE_SELECT_ALL_EVENT,
	readInitialSyncedLanguageId,
	resolveLanguageSyncScope,
} from '../shared';
import type { InputfieldMediaItem, ReactInputfieldProps } from '../types';
import {
	hydrateStudioMediaItems,
	normalizeMediaControlProps,
	notifyHostFormChanged,
} from './mediaHelpers';

export interface QueuedMediaEntry {
	file: File;
	previewUrl: string;
}

export function useMediaCollectionController({
	rawProps,
	isImage,
	viewMode,
	onItemReplaced,
}: {
	rawProps: ReactInputfieldProps;
	isImage: boolean;
	viewMode: 'grid' | 'table';
	onItemReplaced?: (replacedId: string, nextItem: InputfieldMediaItem) => void;
}) {
	const props = useMemo(
		() => normalizeMediaControlProps(rawProps, isImage),
		[rawProps, isImage]
	);
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
	const inputId = props.id || (isImage ? `rw_img_${fallbackId}` : `rw_file_${fallbackId}`);
	const defaultInputName = isImage ? 'images[]' : 'files[]';
	const inputName = props.name
		? props.name.endsWith('[]')
			? props.name
			: `${props.name}[]`
		: defaultInputName;
	const descriptionRows = props.descriptionRows ?? 1;
	const useTags = Boolean(props.useTags);
	const allowedExts = useMemo(
		() => (props.extensions || []).map((e) => e.toLowerCase().replace(/^\./, '')),
		[props.extensions]
	);
	const acceptAttr =
		props.accept ||
		(allowedExts.length > 0
			? allowedExts.map((e) => `.${e}`).join(',')
			: isImage
				? 'image/*'
				: '');
	const hasLiveGateway = Boolean(!isLocked && props.mediaEndpoint && props.mediaToken);

	const [items, setItems] = useState<StudioMediaItem[]>(() => hydrateStudioMediaItems(props.files));
	const [queuedEntries, setQueuedEntries] = useState<QueuedMediaEntry[]>([]);
	const [uploadTasks, setUploadTasks] = useState<ActiveUploadTask[]>([]);
	const [validationNotice, setValidationNotice] = useState<string>('');
	const [isSingleMetaOpen, setIsSingleMetaOpen] = useState<boolean>(false);
	const [isDropOverZone, setIsDropOverZone] = useState<boolean>(false);
	const [isDropOverSingle, setIsDropOverSingle] = useState<boolean>(false);
	const [replaceTarget, setReplaceTarget] = useState<StudioMediaItem | null>(null);

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

	const queuedEntriesRef = useRef<QueuedMediaEntry[]>(queuedEntries);
	queuedEntriesRef.current = queuedEntries;
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

	useEffect(() => {
		return () => {
			queuedEntriesRef.current.forEach((q) => {
				if (q.previewUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
					URL.revokeObjectURL(q.previewUrl);
				}
			});
		};
	}, []);

	useEffect(() => {
		const controllers = uploadAbortControllersRef.current;
		return () => {
			controllers.forEach((ctrl) => ctrl.abort());
			controllers.clear();
		};
	}, []);

	const emitChange = useCallback(
		(nextItems: StudioMediaItem[], nextQueued: QueuedMediaEntry[] = queuedEntriesRef.current) => {
			const activeNames = nextItems.filter((i) => !i.markedForDelete).map((i) => i.name);
			props.onValueChange?.(props.name, [...activeNames, ...nextQueued.map((q) => q.file.name)]);
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
	const activeCount = activeExisting.length + queuedEntries.length + inFlightAdditionCount;

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

	const updateFocus = useCallback((itemId: string, coords: FocusCoordinates) => {
		const formatted = formatFocusPoint(coords);
		setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, focus: formatted } : item)));
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
					queuedEntriesRef.current.length +
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
				queueMicrotask(() => {
					if (itemsRef.current === next) {
						emitChange(next);
					}
				});
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
				queueMicrotask(() => {
					if (itemsRef.current === next) {
						emitChange(next);
					}
				});
				return next;
			});
		},
		[emitChange]
	);

	const syncFallbackQueue = useCallback(
		(nextQueued: QueuedMediaEntry[]) => {
			setQueuedEntries(nextQueued);
			assignInputFiles(
				inputRef.current,
				nextQueued.map((q) => q.file)
			);
			emitChange(itemsRef.current, nextQueued);
		},
		[emitChange]
	);

	const removeQueuedEntry = useCallback(
		(idx: number) => {
			const target = queuedEntriesRef.current[idx];
			if (target?.previewUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
				URL.revokeObjectURL(target.previewUrl);
			}
			syncFallbackQueue(queuedEntriesRef.current.filter((_, qIdx) => qIdx !== idx));
		},
		[syncFallbackQueue]
	);

	const onItemReplacedRef = useRef(onItemReplaced);
	onItemReplacedRef.current = onItemReplaced;

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
			explicitReplace ||
			(isSingleMode && liveActiveExisting.length === 1 && hasLiveGateway ? liveActiveExisting[0] : null);
		const isReplacement = Boolean(targetToReplace);
		const effectiveExistingCount = targetToReplace
			? Math.max(0, liveActiveExisting.length - 1)
			: liveActiveExisting.length;
		const effectiveQueuedCount = hasLiveGateway
			? isReplacement
				? 0
				: inFlightUploadsRef.current
			: queuedEntriesRef.current.length;

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

		const reservedSlots = hasLiveGateway && !isReplacement ? accepted.length : 0;
		if (reservedSlots > 0) {
			inFlightUploadsRef.current += reservedSlots;
		}

		let preparedFiles: File[] = accepted;
		const allErrors = [...errors];

		if (isImage) {
			preparedFiles = [];
			for (const rawFile of accepted) {
				const prep = await prepareImageFileForUpload(rawFile, {
					minWidth: props.minWidth,
					minHeight: props.minHeight,
					maxWidth: props.maxWidth,
					maxHeight: props.maxHeight,
					maxReject: props.maxReject,
					dimensionsByAspectRatio: props.dimensionsByAspectRatio,
					clientQuality: props.clientQuality,
					resizeServer: props.resizeServer,
				});
				if (prep.error) {
					allErrors.push(prep.error);
					if (reservedSlots > 0) {
						inFlightUploadsRef.current = Math.max(0, inFlightUploadsRef.current - 1);
					}
				} else {
					preparedFiles.push(prep.file);
				}
			}
		}

		setValidationNotice(allErrors.join(' '));
		if (inputRef.current) {
			inputRef.current.value = '';
		}
		if (replaceInputRef.current) {
			replaceInputRef.current.value = '';
		}

		if (preparedFiles.length === 0) {
			return;
		}

		if (hasLiveGateway && props.mediaEndpoint && props.mediaToken) {
			for (const file of preparedFiles) {
				const taskId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
				const abortController = new AbortController();
				uploadAbortControllersRef.current.set(taskId, abortController);
				setUploadTasks((prev) => [
					...prev,
					{
						id: taskId,
						name: file.name,
						size: file.size,
						progress: isImage ? 4 : 5,
						isReplace: isReplacement,
					},
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
							onItemReplacedRef.current?.(targetToReplace.id, result.item);
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
									queueMicrotask(() => {
										if (itemsRef.current === singleNext) {
											emitChange(singleNext);
										}
									});
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
								queueMicrotask(() => {
									if (itemsRef.current === next) {
										emitChange(next);
									}
								});
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

		const nextEntries: QueuedMediaEntry[] = preparedFiles.map((file) => ({
			file,
			previewUrl:
				isImage && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
					? URL.createObjectURL(file)
					: '',
		}));

		if (!isMultiple) {
			queuedEntriesRef.current.forEach((old) => {
				if (old.previewUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
					URL.revokeObjectURL(old.previewUrl);
				}
			});
			if (isSingleMode && liveActiveExisting.length > 0) {
				setItems((prev) => {
					const marked = prev.map((it) => ({ ...it, markedForDelete: true }));
					itemsRef.current = marked;
					return marked;
				});
			}
			syncFallbackQueue(nextEntries.slice(0, 1));
		} else {
			const combined = [...queuedEntriesRef.current, ...nextEntries];
			const maxFallback =
				maxFiles > 0 ? Math.max(0, maxFiles - liveActiveExisting.length) : combined.length;
			const kept = combined.slice(0, maxFallback);
			combined.slice(maxFallback).forEach((dropped) => {
				if (dropped.previewUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
					URL.revokeObjectURL(dropped.previewUrl);
				}
			});
			syncFallbackQueue(kept);
		}
	};

	const processIncomingFilesRef = useRef(processIncomingFiles);
	processIncomingFilesRef.current = processIncomingFiles;

	const handleDropReplace = useCallback((target: StudioMediaItem, files: FileList | null) => {
		void processIncomingFilesRef.current(files, target, true);
	}, []);

	const triggerReplacePicker = useCallback((target: StudioMediaItem) => {
		setReplaceTarget(target);
		replaceInputRef.current?.click();
	}, []);

	const singleItem = isSingleMode && activeExisting.length > 0 ? activeExisting[0] : null;
	const singleDeletedItems = isSingleMode ? items.filter((it) => it.markedForDelete) : [];
	const hasInlineMeta = descriptionRows > 0 || useTags;
	const canAddMore = canUpload && (maxFiles === 0 || activeCount < maxFiles);

	const mergedFieldError =
		(rawProps.error && rawProps.error.trim() !== '' ? rawProps.error : '') ||
		(props.isStandaloneIsland && props.fieldErrors.length > 0 ? props.fieldErrors.join(' ') : '');

	return {
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
	};
}
