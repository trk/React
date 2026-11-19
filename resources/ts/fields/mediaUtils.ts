import type React from 'react';
import type { Translator } from '../lib/i18n';
import { getCsrfToken, sanitizeSameOriginUrl } from '../lib/utils';
import { formatMediaBytes } from './shared';
import type { InputfieldMediaItem, SchemaFieldDefinition } from './types';

export type MediaCustomFieldRenderer = (params: {
	field: SchemaFieldDefinition;
	value: unknown;
	values: Record<string, unknown>;
	onChange: (name: string, nextValue: unknown) => void;
	disabled: boolean;
}) => React.ReactNode;

export function hasDraggedOsFiles(e: React.DragEvent<HTMLElement>): boolean {
	const types = e.dataTransfer?.types;
	if (!types) {
		return false;
	}
	for (let i = 0; i < types.length; i += 1) {
		if (types[i] === 'Files') {
			return true;
		}
	}
	return false;
}

export interface StudioMediaItem extends InputfieldMediaItem {
	markedForDelete: boolean;
}

export function validateStudioIncomingFiles(
	incoming: File[],
	options: {
		allowedExtensions: string[];
		maxFilesize?: number;
		maxFiles: number;
		existingCount: number;
		queuedCount: number;
		isMultiple: boolean;
		overwrite: boolean;
		isReplacement?: boolean;
		isExplicitCardReplace?: boolean;
		existingNames?: string[];
		t?: Translator['t'];
	}
): { accepted: File[]; errors: string[] } {
	const accepted: File[] = [];
	const errors: string[] = [];

	if (options.isExplicitCardReplace && incoming.length > 1) {
		const singleReplaceMsg = options.t
			? options.t('media.singleReplaceLimit', 'Only one file can be dropped when replacing an item.')
			: 'Only one file can be dropped when replacing an item.';
		return { accepted: [], errors: [singleReplaceMsg] };
	}

	const allowed = options.allowedExtensions.map((e) => e.toLowerCase().replace(/^\./, ''));
	const maxCap = options.maxFiles > 0 ? options.maxFiles : options.isMultiple ? 0 : 1;
	const existingLowerSet = new Set((options.existingNames || []).map((n) => n.toLowerCase()));

	let remainingSlots =
		maxCap > 0
			? options.isReplacement
				? 1
				: options.overwrite && maxCap === 1 && options.queuedCount === 0
					? 1
					: Math.max(0, maxCap - options.existingCount - options.queuedCount)
			: Number.POSITIVE_INFINITY;

	for (const file of incoming) {
		const ext = (file.name.split('.').pop() || '').toLowerCase();
		if (allowed.length > 0 && !allowed.includes(ext)) {
			errors.push(`"${file.name}": unsupported extension (.${ext}). Allowed: ${allowed.join(', ')}`);
			continue;
		}
		if (options.maxFilesize && options.maxFilesize > 0 && file.size > options.maxFilesize) {
			errors.push(
				`"${file.name}" (${formatMediaBytes(file.size)}) exceeds maximum allowed size (${formatMediaBytes(options.maxFilesize)}).`
			);
			continue;
		}
		const isSameNameOverwrite = Boolean(
			options.overwrite && !options.isReplacement && maxCap > 1 && existingLowerSet.has(file.name.toLowerCase())
		);
		if (!isSameNameOverwrite && remainingSlots <= 0) {
			const maxReachedMsg = options.t
				? options.t('media.maxFilesReached', { max: maxCap }, `Maximum file limit (${maxCap}) reached.`)
				: `Maximum file limit (${maxCap}) reached.`;
			errors.push(maxReachedMsg);
			break;
		}
		accepted.push(file);
		if (!isSameNameOverwrite) {
			remainingSlots -= 1;
		}
	}

	return { accepted, errors };
}

export interface ActiveUploadTask {
	id: string;
	name: string;
	size: number;
	progress: number;
	indeterminate?: boolean;
	isReplace?: boolean;
}

export interface FocusCoordinates {
	top: number;
	left: number;
	zoom: number;
}

export function parseFocusPoint(focus?: string | Partial<FocusCoordinates> | null): FocusCoordinates {
	if (!focus) {
		return { top: 50, left: 50, zoom: 0 };
	}
	if (typeof focus === 'object') {
		const rawTop = Number(focus.top);
		const rawLeft = Number(focus.left);
		const rawZoom = Number(focus.zoom);
		return {
			top: Number.isFinite(rawTop) ? Math.max(0, Math.min(100, Math.round(rawTop * 10) / 10)) : 50,
			left: Number.isFinite(rawLeft) ? Math.max(0, Math.min(100, Math.round(rawLeft * 10) / 10)) : 50,
			zoom: Number.isFinite(rawZoom) ? Math.max(0, Math.min(50, Math.round(rawZoom))) : 0,
		};
	}
	if (typeof focus !== 'string') {
		return { top: 50, left: 50, zoom: 0 };
	}
	const [rawTop = NaN, rawLeft = NaN, rawZoom = NaN] = focus
		.trim()
		.split(/\s+/)
		.map((v) => parseFloat(v));
	return {
		top: Number.isFinite(rawTop) ? Math.max(0, Math.min(100, Math.round(rawTop * 10) / 10)) : 50,
		left: Number.isFinite(rawLeft) ? Math.max(0, Math.min(100, Math.round(rawLeft * 10) / 10)) : 50,
		zoom: Number.isFinite(rawZoom) ? Math.max(0, Math.min(50, Math.round(rawZoom))) : 0,
	};
}

export function formatFocusPoint(coords: FocusCoordinates): string {
	const top = Math.max(0, Math.min(100, Math.round(coords.top * 10) / 10));
	const left = Math.max(0, Math.min(100, Math.round(coords.left * 10) / 10));
	const zoom = Math.max(0, Math.min(50, Math.round(coords.zoom)));
	return `${top} ${left} ${zoom}`;
}

export function extractClipboardFiles(event: React.ClipboardEvent<HTMLElement>): File[] {
	const dt = event.clipboardData;
	if (!dt) {
		return [];
	}
	const target = event.target as HTMLElement | null;
	if (
		target &&
		(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) &&
		(!dt.files || dt.files.length === 0)
	) {
		return [];
	}
	const files: File[] = [];
	if (dt.files && dt.files.length > 0) {
		for (const f of Array.from(dt.files)) {
			files.push(f);
		}
	} else if (dt.items && dt.items.length > 0) {
		for (const item of Array.from(dt.items)) {
			if (item.kind === 'file') {
				const f = item.getAsFile();
				if (f) {
					files.push(f);
				}
			}
		}
	}
	return files;
}

function loadHtmlImageFromFile(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		if (typeof URL === 'undefined' || !URL.createObjectURL || typeof Image === 'undefined') {
			reject(new Error('Image decoding unavailable'));
			return;
		}
		const objectUrl = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(objectUrl);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			reject(new Error('Failed to decode image'));
		};
		img.src = objectUrl;
	});
}

export async function prepareImageFileForUpload(
	file: File,
	options: {
		minWidth?: number;
		minHeight?: number;
		maxWidth?: number;
		maxHeight?: number;
		maxReject?: boolean;
		dimensionsByAspectRatio?: boolean;
		clientQuality?: number;
		resizeServer?: boolean;
	}
): Promise<{ file: File; error?: string }> {
	const mime = (file.type || '').toLowerCase();
	const isRaster =
		mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png' || mime === 'image/webp';
	if (!isRaster || typeof document === 'undefined') {
		return { file };
	}

	const rawMinW = options.minWidth && options.minWidth > 0 ? options.minWidth : 0;
	const rawMinH = options.minHeight && options.minHeight > 0 ? options.minHeight : 0;
	const rawMaxW =
		(options.maxReject || !options.resizeServer) && options.maxWidth && options.maxWidth > 0
			? options.maxWidth
			: 0;
	const rawMaxH =
		(options.maxReject || !options.resizeServer) && options.maxHeight && options.maxHeight > 0
			? options.maxHeight
			: 0;

	if (rawMinW === 0 && rawMinH === 0 && rawMaxW === 0 && rawMaxH === 0) {
		return { file };
	}

	try {
		const img = await loadHtmlImageFromFile(file);
		const naturalW = img.naturalWidth || img.width;
		const naturalH = img.naturalHeight || img.height;
		const swapAxes = Boolean(options.dimensionsByAspectRatio && naturalW > 0 && naturalW < naturalH);
		const minW = swapAxes ? rawMinH : rawMinW;
		const minH = swapAxes ? rawMinW : rawMinH;
		const maxW = swapAxes ? rawMaxH : rawMaxW;
		const maxH = swapAxes ? rawMaxW : rawMaxH;

		if (minW > 0 && naturalW < minW) {
			return {
				file,
				error: `"${file.name}" width (${naturalW}px) is smaller than minimum required ${minW}px.`,
			};
		}
		if (minH > 0 && naturalH < minH) {
			return {
				file,
				error: `"${file.name}" height (${naturalH}px) is smaller than minimum required ${minH}px.`,
			};
		}

		if ((maxW > 0 && naturalW > maxW) || (maxH > 0 && naturalH > maxH)) {
			if (options.maxReject) {
				return {
					file,
					error: `"${file.name}" (${naturalW}×${naturalH}px) exceeds maximum allowed dimensions (${maxW || '∞'}×${maxH || '∞'}px).`,
				};
			}
			if (!options.resizeServer) {
				const ratioW = maxW > 0 ? maxW / naturalW : 1;
				const ratioH = maxH > 0 ? maxH / naturalH : 1;
				const scale = Math.min(ratioW, ratioH, 1);
				if (scale < 1) {
					const targetW = Math.max(1, Math.round(naturalW * scale));
					const targetH = Math.max(1, Math.round(naturalH * scale));
					const canvas = document.createElement('canvas');
					canvas.width = targetW;
					canvas.height = targetH;
					const ctx = canvas.getContext('2d');
					if (ctx) {
						ctx.imageSmoothingEnabled = true;
						ctx.imageSmoothingQuality = 'high';
						ctx.drawImage(img, 0, 0, targetW, targetH);
						const quality = Math.max(0.1, Math.min(1, (options.clientQuality || 90) / 100));
						const outType = mime === 'image/png' ? 'image/png' : mime === 'image/webp' ? 'image/webp' : 'image/jpeg';
						const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, outType, quality));
						if (blob && blob.size > 0) {
							return {
								file: new File([blob], file.name, {
									type: outType,
									lastModified: Date.now(),
								}),
							};
						}
					}
				}
			}
		}
	} catch {
		// Fall back to server-side validation/handling if client decoding is unsupported
	}

	return { file };
}

export function uploadMediaFileViaXhr(params: {
	endpoint: string;
	mediaToken: string;
	file: File;
	action?: 'upload' | 'replace';
	targetHash?: string;
	targetName?: string;
	clientOwnerId?: string;
	clientInputName?: string;
	signal?: AbortSignal;
	onProgress?: (percent: number) => void;
}): Promise<{
	ok: boolean;
	aborted?: boolean;
	items?: InputfieldMediaItem[];
	item?: InputfieldMediaItem;
	errors?: string[];
	error?: string;
}> {
	return new Promise((resolve) => {
		if (params.signal?.aborted) {
			resolve({ ok: false, aborted: true });
			return;
		}
		if (typeof XMLHttpRequest === 'undefined') {
			resolve({ ok: false, error: 'XMLHttpRequest unavailable.' });
			return;
		}
		const csrf = getCsrfToken();
		const formData = new FormData();
		formData.append('action', params.action || 'upload');
		formData.append('mediaToken', params.mediaToken);
		if (params.targetHash) {
			formData.append('targetHash', params.targetHash);
		}
		if (params.targetName) {
			formData.append('targetName', params.targetName);
		}
		if (params.clientOwnerId) {
			formData.append('_clientOwnerId', params.clientOwnerId);
		}
		if (params.clientInputName) {
			formData.append('_clientInputName', params.clientInputName);
		}
		if (csrf.value) {
			formData.append(csrf.name, csrf.value);
		}
		formData.append('files', params.file, params.file.name);

		const xhr = new XMLHttpRequest();
		let settled = false;
		const finish = (
			outcome: {
				ok: boolean;
				aborted?: boolean;
				items?: InputfieldMediaItem[];
				item?: InputfieldMediaItem;
				errors?: string[];
				error?: string;
			}
		) => {
			if (settled) {
				return;
			}
			settled = true;
			params.signal?.removeEventListener('abort', handleSignalAbort);
			resolve(outcome);
		};
		const handleSignalAbort = () => {
			try {
				xhr.abort();
			} catch {
				// Ignore abort errors on completed requests
			}
			finish({ ok: false, aborted: true });
		};
		params.signal?.addEventListener('abort', handleSignalAbort, { once: true });

		const safeUploadEndpoint = sanitizeSameOriginUrl(params.endpoint);
		if (!safeUploadEndpoint) {
			finish({ ok: false, error: 'Invalid media endpoint.' });
			return;
		}
		xhr.open('POST', safeUploadEndpoint, true);
		xhr.setRequestHeader('Accept', 'application/json');
		xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
		if (csrf.value) {
			xhr.setRequestHeader('X-CSRF-Token', csrf.value);
		}

		if (xhr.upload && params.onProgress) {
			xhr.upload.onprogress = (ev) => {
				if (ev.lengthComputable && ev.total > 0) {
					params.onProgress?.(Math.min(99, Math.max(1, Math.round((ev.loaded / ev.total) * 100))));
				}
			};
		}

		xhr.onload = () => {
			try {
				const parsed = JSON.parse(xhr.responseText || '{}');
				if (xhr.status >= 200 && xhr.status < 300 && parsed?.ok) {
					params.onProgress?.(100);
					finish(parsed);
				} else {
					finish({
						ok: false,
						error: String(parsed?.error || `Upload failed (${xhr.status})`),
						errors: Array.isArray(parsed?.errors) ? parsed.errors : undefined,
					});
				}
			} catch {
				finish({ ok: false, error: `Upload failed (${xhr.status})` });
			}
		};

		xhr.onabort = () => {
			finish({ ok: false, aborted: true });
		};

		xhr.onerror = () => {
			finish({ ok: false, error: 'Network error while uploading file.' });
		};

		xhr.send(formData);
	});
}
