import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Button } from '../../ui';
import type { StudioMediaItem } from '../mediaUtils';

export interface CropSelectionRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type CropResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type CropDragMode = 'create' | 'move' | CropResizeHandle;

const MIN_CROP_SPAN_PCT = 4;

const CROP_HANDLES: ReadonlyArray<{
	key: CropResizeHandle;
	posStyle: React.CSSProperties;
	cursorClass: string;
}> = [
	{ key: 'nw', posStyle: { top: 0, left: 0, transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-nwse-resize' },
	{ key: 'n', posStyle: { top: 0, left: '50%', transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-ns-resize' },
	{ key: 'ne', posStyle: { top: 0, left: '100%', transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-nesw-resize' },
	{ key: 'e', posStyle: { top: '50%', left: '100%', transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-ew-resize' },
	{ key: 'se', posStyle: { top: '100%', left: '100%', transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-nwse-resize' },
	{ key: 's', posStyle: { top: '100%', left: '50%', transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-ns-resize' },
	{ key: 'sw', posStyle: { top: '100%', left: 0, transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-nesw-resize' },
	{ key: 'w', posStyle: { top: '50%', left: 0, transform: 'translate(-50%, -50%)' }, cursorClass: 'cursor-ew-resize' },
];

export function stripAdminCacheBuster(href: string): string {
	if (!href || !href.includes('nc=')) {
		return href;
	}
	const [beforeHash = '', hash = ''] = href.split('#', 2);
	const qIndex = beforeHash.indexOf('?');
	if (qIndex < 0) {
		return href;
	}
	const base = beforeHash.slice(0, qIndex);
	const params = beforeHash
		.slice(qIndex + 1)
		.split('&')
		.filter((part) => part !== '' && !part.startsWith('nc='));
	const rebuilt = params.length > 0 ? `${base}?${params.join('&')}` : base;
	return hash ? `${rebuilt}#${hash}` : rebuilt;
}

export function clampPct(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function clampMovedCropRect(
	origin: CropSelectionRect,
	dxPct: number,
	dyPct: number
): CropSelectionRect {
	const w = clampPct(origin.w, 0, 100);
	const h = clampPct(origin.h, 0, 100);
	return {
		x: clampPct(origin.x + dxPct, 0, Math.max(0, 100 - w)),
		y: clampPct(origin.y + dyPct, 0, Math.max(0, 100 - h)),
		w,
		h,
	};
}

export function computePresetCropRect(
	cropAspect: number,
	stageAspect: number,
	existing?: CropSelectionRect | null
): CropSelectionRect {
	const safeStageAspect = stageAspect > 0 ? stageAspect : 1;
	const pctRatio = cropAspect / safeStageAspect;
	const centerX = existing && existing.w >= 2 ? existing.x + existing.w / 2 : 50;
	const centerY = existing && existing.h >= 2 ? existing.y + existing.h / 2 : 50;
	const targetSpan =
		existing && existing.w >= 10 && existing.h >= 10
			? clampPct(Math.max(existing.w, existing.h), 24, 92)
			: 82;

	let w = pctRatio >= 1 ? targetSpan : targetSpan * pctRatio;
	let h = pctRatio >= 1 ? targetSpan / pctRatio : targetSpan;

	if (w > 100) {
		w = 100;
		h = w / pctRatio;
	}
	if (h > 100) {
		h = 100;
		w = h * pctRatio;
	}

	const x = clampPct(centerX - w / 2, 0, Math.max(0, 100 - w));
	const y = clampPct(centerY - h / 2, 0, Math.max(0, 100 - h));
	return { x, y, w, h };
}

export function computeDraggedCropRect(params: {
	mode: CropDragMode;
	originRect: CropSelectionRect;
	startPct: { x: number; y: number };
	currentPct: { x: number; y: number };
	cropAspect: number | null;
	stageAspect: number;
}): CropSelectionRect {
	const { mode, originRect, startPct, currentPct, cropAspect, stageAspect } = params;
	const dx = currentPct.x - startPct.x;
	const dy = currentPct.y - startPct.y;
	const safeStageAspect = stageAspect > 0 ? stageAspect : 1;
	const pctRatio = cropAspect && cropAspect > 0 ? cropAspect / safeStageAspect : null;

	if (mode === 'move') {
		return clampMovedCropRect(originRect, dx, dy);
	}

	if (mode === 'create') {
		const anchorX = clampPct(startPct.x, 0, 100);
		const anchorY = clampPct(startPct.y, 0, 100);
		const curX = clampPct(currentPct.x, 0, 100);
		const curY = clampPct(currentPct.y, 0, 100);
		const dirX = curX >= anchorX ? 1 : -1;
		const dirY = curY >= anchorY ? 1 : -1;
		const maxW = dirX > 0 ? 100 - anchorX : anchorX;
		const maxH = dirY > 0 ? 100 - anchorY : anchorY;

		let w = Math.min(Math.abs(curX - anchorX), maxW);
		let h = Math.min(Math.abs(curY - anchorY), maxH);

		if (pctRatio !== null && pctRatio > 0) {
			if (w >= h * pctRatio) {
				h = w / pctRatio;
			} else {
				w = h * pctRatio;
			}
			if (w > maxW) {
				w = maxW;
				h = w / pctRatio;
			}
			if (h > maxH) {
				h = maxH;
				w = h * pctRatio;
			}
		}

		return {
			x: dirX > 0 ? anchorX : anchorX - w,
			y: dirY > 0 ? anchorY : anchorY - h,
			w,
			h,
		};
	}

	if (mode === 'e' || mode === 'w') {
		const dirX = mode === 'e' ? 1 : -1;
		const anchorX = mode === 'e' ? originRect.x : originRect.x + originRect.w;
		const maxW = dirX > 0 ? 100 - anchorX : anchorX;
		const minW = Math.min(MIN_CROP_SPAN_PCT, maxW);
		let w = clampPct(originRect.w + dirX * dx, minW, maxW);

		if (pctRatio === null) {
			return {
				x: dirX > 0 ? anchorX : anchorX - w,
				y: originRect.y,
				w,
				h: originRect.h,
			};
		}

		const centerY = originRect.y + originRect.h / 2;
		let h = w / pctRatio;
		if (h < MIN_CROP_SPAN_PCT) {
			h = Math.min(100, MIN_CROP_SPAN_PCT);
			w = h * pctRatio;
		}
		if (w > maxW) {
			w = maxW;
			h = w / pctRatio;
		}
		if (h > 100) {
			h = 100;
			w = h * pctRatio;
		}
		return {
			x: dirX > 0 ? anchorX : anchorX - w,
			y: clampPct(centerY - h / 2, 0, Math.max(0, 100 - h)),
			w,
			h,
		};
	}

	if (mode === 'n' || mode === 's') {
		const dirY = mode === 's' ? 1 : -1;
		const anchorY = mode === 's' ? originRect.y : originRect.y + originRect.h;
		const maxH = dirY > 0 ? 100 - anchorY : anchorY;
		const minH = Math.min(MIN_CROP_SPAN_PCT, maxH);
		let h = clampPct(originRect.h + dirY * dy, minH, maxH);

		if (pctRatio === null) {
			return {
				x: originRect.x,
				y: dirY > 0 ? anchorY : anchorY - h,
				w: originRect.w,
				h,
			};
		}

		const centerX = originRect.x + originRect.w / 2;
		let w = h * pctRatio;
		if (w < MIN_CROP_SPAN_PCT) {
			w = Math.min(100, MIN_CROP_SPAN_PCT);
			h = w / pctRatio;
		}
		if (h > maxH) {
			h = maxH;
			w = h * pctRatio;
		}
		if (w > 100) {
			w = 100;
			h = w / pctRatio;
		}
		return {
			x: clampPct(centerX - w / 2, 0, Math.max(0, 100 - w)),
			y: dirY > 0 ? anchorY : anchorY - h,
			w,
			h,
		};
	}

	const dirX = mode === 'ne' || mode === 'se' ? 1 : -1;
	const dirY = mode === 'sw' || mode === 'se' ? 1 : -1;
	const anchorX = dirX > 0 ? originRect.x : originRect.x + originRect.w;
	const anchorY = dirY > 0 ? originRect.y : originRect.y + originRect.h;
	const maxW = dirX > 0 ? 100 - anchorX : anchorX;
	const maxH = dirY > 0 ? 100 - anchorY : anchorY;
	const minW = Math.min(MIN_CROP_SPAN_PCT, maxW);
	const minH = Math.min(MIN_CROP_SPAN_PCT, maxH);

	let w = clampPct(originRect.w + dirX * dx, minW, maxW);
	let h = clampPct(originRect.h + dirY * dy, minH, maxH);

	if (pctRatio !== null && pctRatio > 0) {
		if (Math.abs(dx) >= Math.abs(dy) * pctRatio) {
			h = w / pctRatio;
		} else {
			w = h * pctRatio;
		}
		if (w < minW) {
			w = minW;
			h = w / pctRatio;
		}
		if (h < minH) {
			h = minH;
			w = h * pctRatio;
		}
		if (w > maxW) {
			w = maxW;
			h = w / pctRatio;
		}
		if (h > maxH) {
			h = maxH;
			w = h * pctRatio;
		}
	}

	return {
		x: dirX > 0 ? anchorX : anchorX - w,
		y: dirY > 0 ? anchorY : anchorY - h,
		w,
		h,
	};
}

interface CropPointerSession {
	mode: CropDragMode;
	pointerId: number;
	stageBounds: DOMRect;
	startPct: { x: number; y: number };
	originRect: CropSelectionRect;
}

export interface CropStageProps {
	item: StudioMediaItem;
	cropRect: CropSelectionRect | null;
	onChangeCropRect: React.Dispatch<React.SetStateAction<CropSelectionRect | null>>;
	cropAspect: number | null;
	onChangeCropAspect: (aspect: number | null) => void;
	isTransforming: boolean;
	studioError: string;
	onRunTransform: (payload: Record<string, unknown>) => Promise<void>;
	onApplyCrop: () => Promise<void>;
}

export function CropStage({
	item,
	cropRect,
	onChangeCropRect,
	cropAspect,
	onChangeCropAspect,
	isTransforming,
	studioError,
	onRunTransform,
	onApplyCrop,
}: CropStageProps): React.ReactElement {
	const { t } = useTranslations('core');
	const cropStageRef = useRef<HTMLDivElement | null>(null);
	const cropMoveHandleRef = useRef<HTMLButtonElement | null>(null);
	const cropSessionRef = useRef<CropPointerSession | null>(null);
	const [activeCropDragMode, setActiveCropDragMode] = useState<CropDragMode | null>(null);
	const [cropStatusAnnouncement, setCropStatusAnnouncement] = useState<string>('');

	useEffect(() => {
		cropSessionRef.current = null;
		setActiveCropDragMode(null);
	}, [item.id]);

	useEffect(() => {
		if (!cropStatusAnnouncement) {
			return;
		}
		const timer = window.setTimeout(() => setCropStatusAnnouncement(''), 1200);
		return () => window.clearTimeout(timer);
	}, [cropStatusAnnouncement]);

	const resolveStageAspect = (): number => {
		const stageEl = cropStageRef.current;
		if (stageEl) {
			const rect = stageEl.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				return rect.width / rect.height;
			}
		}
		if (item.width && item.height && item.width > 0 && item.height > 0) {
			return item.width / item.height;
		}
		return 1;
	};

	const beginCropPointerSession = (
		e: React.PointerEvent<HTMLElement>,
		mode: CropDragMode
	) => {
		if (e.button !== 0 || isTransforming || !cropStageRef.current) {
			return;
		}
		const stageBounds = cropStageRef.current.getBoundingClientRect();
		if (stageBounds.width <= 0 || stageBounds.height <= 0) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();

		const startPct = {
			x: clampPct(((e.clientX - stageBounds.left) / stageBounds.width) * 100, 0, 100),
			y: clampPct(((e.clientY - stageBounds.top) / stageBounds.height) * 100, 0, 100),
		};

		const originRect: CropSelectionRect =
			mode === 'create' || !cropRect
				? { x: startPct.x, y: startPct.y, w: 0, h: 0 }
				: { ...cropRect };

		cropSessionRef.current = {
			mode,
			pointerId: e.pointerId,
			stageBounds,
			startPct,
			originRect,
		};
		setActiveCropDragMode(mode);

		cropStageRef.current.setPointerCapture?.(e.pointerId);
		if (mode === 'create') {
			onChangeCropRect(originRect);
		}
	};

	const updateCropPointerSession = (e: React.PointerEvent<HTMLDivElement>) => {
		const session = cropSessionRef.current;
		if (!session || e.pointerId !== session.pointerId) {
			return;
		}
		const { stageBounds, mode, originRect, startPct } = session;
		if (stageBounds.width <= 0 || stageBounds.height <= 0) {
			return;
		}
		const currentPct = {
			x: ((e.clientX - stageBounds.left) / stageBounds.width) * 100,
			y: ((e.clientY - stageBounds.top) / stageBounds.height) * 100,
		};
		const stageAspect = stageBounds.width / stageBounds.height;
		const nextRect = computeDraggedCropRect({
			mode,
			originRect,
			startPct,
			currentPct,
			cropAspect,
			stageAspect,
		});
		onChangeCropRect(nextRect);
	};

	const endCropPointerSession = () => {
		const prevSession = cropSessionRef.current;
		cropSessionRef.current = null;
		setActiveCropDragMode(null);
		if (prevSession && prevSession.mode !== 'create') {
			setCropStatusAnnouncement(t('media.cropMovedStatus', 'Crop selection updated'));
		}
	};

	const hasValidCropSelection = Boolean(cropRect && cropRect.w >= 2 && cropRect.h >= 2);
	const cropReadoutLabel =
		cropRect && cropRect.w >= 2 && cropRect.h >= 2
			? item.width && item.height
				? `${Math.max(1, Math.round((cropRect.w / 100) * item.width))} × ${Math.max(1, Math.round((cropRect.h / 100) * item.height))} px`
				: `${Math.round(cropRect.w)}% × ${Math.round(cropRect.h)}%`
			: '';

	return (
		<div className="space-y-4">
			<p className="text-xs text-muted-foreground">
				{t(
					'media.studioHint',
					'Drag on the image to select a crop area, drag inside to reposition, or resize from any edge or corner.'
				)}
			</p>

			<div className="sr-only" aria-live="polite">
				{cropStatusAnnouncement}
			</div>

			{studioError ? (
				<div
					role="alert"
					className="rounded-md border border-destructive/40 bg-destructive/8 px-3 py-2 text-xs text-destructive"
				>
					{studioError}
				</div>
			) : null}

			{/* Rotate & Flip Toolbar */}
			<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2">
				<div className="flex flex-wrap items-center gap-1">
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={isTransforming}
						className="h-7 px-2 text-xs"
						aria-label={t('media.rotateLeft', 'Rotate -90°')}
						title={t('media.rotateLeft', 'Rotate -90°')}
						onClick={() => void onRunTransform({ operation: 'rotate', degrees: -90 })}
					>
						<DynamicIcon name="rotate-ccw" className="size-3.5" aria-hidden="true" />
						<span>-90°</span>
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={isTransforming}
						className="h-7 px-2 text-xs"
						aria-label={t('media.rotateRight', 'Rotate +90°')}
						title={t('media.rotateRight', 'Rotate +90°')}
						onClick={() => void onRunTransform({ operation: 'rotate', degrees: 90 })}
					>
						<DynamicIcon name="rotate-cw" className="size-3.5" aria-hidden="true" />
						<span>+90°</span>
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={isTransforming}
						className="h-7 px-2 text-xs"
						aria-label={t('media.flipHorizontal', 'Flip horizontal')}
						title={t('media.flipHorizontal', 'Flip horizontal')}
						onClick={() => void onRunTransform({ operation: 'flip_h' })}
					>
						<DynamicIcon name="flip-horizontal" className="size-3.5" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={isTransforming}
						className="h-7 px-2 text-xs"
						aria-label={t('media.flipVertical', 'Flip vertical')}
						title={t('media.flipVertical', 'Flip vertical')}
						onClick={() => void onRunTransform({ operation: 'flip_v' })}
					>
						<DynamicIcon name="flip-vertical" className="size-3.5" />
					</Button>
					{!hasValidCropSelection ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={isTransforming}
							className="h-7 px-2 text-xs"
							onClick={() => {
								const initialRect =
									cropAspect !== null
										? computePresetCropRect(cropAspect, resolveStageAspect(), null)
										: { x: 10, y: 10, w: 80, h: 80 };
								onChangeCropRect(initialRect);
								if (typeof window !== 'undefined') {
									window.requestAnimationFrame(() => {
										cropMoveHandleRef.current?.focus({ preventScroll: true });
									});
								}
							}}
						>
							<DynamicIcon name="crop" className="size-3.5" />
							<span>{t('media.initCropSelection', 'Select crop area')}</span>
						</Button>
					) : null}
				</div>

				{/* Aspect Ratio Presets */}
				<div className="flex flex-wrap items-center gap-1">
					{[
						{ label: t('media.cropRatioFree', 'Free'), ratio: null },
						...(item.width && item.height
							? [{ label: t('media.cropRatioOriginal', 'Original'), ratio: item.width / item.height }]
							: []),
						{ label: '16:9', ratio: 16 / 9 },
						{ label: '4:3', ratio: 4 / 3 },
						{ label: '1:1', ratio: 1 },
						{ label: '4:5', ratio: 4 / 5 },
					].map((preset) => {
						const isActive =
							preset.ratio === null
								? cropAspect === null
								: cropAspect !== null && Math.abs(cropAspect - preset.ratio) < 0.01;
						return (
							<button
								key={preset.label}
								type="button"
								aria-pressed={isActive}
								disabled={isTransforming}
								onClick={() => {
									onChangeCropAspect(preset.ratio);
									if (preset.ratio !== null) {
										const nextRatio = preset.ratio;
										onChangeCropRect((prev) =>
											computePresetCropRect(nextRatio, resolveStageAspect(), prev)
										);
									}
								}}
								className={cn(
									'rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer',
									isActive
										? 'bg-primary text-primary-foreground'
										: 'bg-background border border-border text-muted-foreground hover:text-foreground'
								)}
							>
								{preset.label}
							</button>
						);
					})}
				</div>
			</div>

			{/* Interactive Crop Stage (Create + Drag-to-Move + 8-Handle Resize) */}
			<div className="flex justify-center rounded-xl border border-border bg-muted/30 p-4">
				<div
					ref={cropStageRef}
					data-rw-crop-stage=""
					onPointerDown={(e) => beginCropPointerSession(e, 'create')}
					onPointerMove={updateCropPointerSession}
					onPointerUp={endCropPointerSession}
					onPointerCancel={endCropPointerSession}
					onLostPointerCapture={endCropPointerSession}
					className="relative inline-block max-w-full cursor-crosshair"
				>
					<div className="pointer-events-none relative overflow-hidden rounded-lg border border-border">
						<img
							src={item.url || item.thumbUrl}
							alt={item.basename}
							decoding="async"
							draggable={false}
							className={cn(
								'block max-h-80 w-auto object-contain transition-opacity',
								isTransforming && 'opacity-50'
							)}
						/>
						{hasValidCropSelection && cropRect ? (
							<div
								aria-hidden="true"
								style={{
									left: `${cropRect.x}%`,
									top: `${cropRect.y}%`,
									width: `${cropRect.w}%`,
									height: `${cropRect.h}%`,
								}}
								className="absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.52)]"
							/>
						) : null}
					</div>

					{hasValidCropSelection && cropRect ? (
						<div
							style={{
								left: `${cropRect.x}%`,
								top: `${cropRect.y}%`,
								width: `${cropRect.w}%`,
								height: `${cropRect.h}%`,
							}}
							className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
						>
							<button
								ref={cropMoveHandleRef}
								type="button"
								data-rw-crop-move=""
								data-dragging={activeCropDragMode === 'move' ? 'true' : undefined}
								aria-label={t(
									'media.cropMoveHandle',
									'Crop selection handle. Drag or use arrow keys to move, or Ctrl+Arrow to resize.'
								)}
								onPointerDown={(e) => beginCropPointerSession(e, 'move')}
								onKeyDown={(e) => {
									if (isTransforming) return;
									if (e.key === 'Escape') {
										e.preventDefault();
										e.stopPropagation();
										onChangeCropRect(null);
										return;
									}
									const isResize = e.ctrlKey || e.metaKey || (e.altKey && e.shiftKey);
									const step = e.shiftKey && !e.altKey ? 5 : e.altKey && !e.shiftKey ? 0.25 : 1;
									let dx = 0;
									let dy = 0;
									if (e.key === 'ArrowLeft') dx = -step;
									else if (e.key === 'ArrowRight') dx = step;
									else if (e.key === 'ArrowUp') dy = -step;
									else if (e.key === 'ArrowDown') dy = step;
									else return;

									e.preventDefault();
									e.stopPropagation();
									if (isResize) {
										const stageAspect = resolveStageAspect();
										onChangeCropRect((prev) =>
											prev
												? computeDraggedCropRect({
														mode: dx !== 0 && dy === 0 ? 'e' : dy !== 0 && dx === 0 ? 's' : 'se',
														originRect: prev,
														startPct: { x: prev.x + prev.w, y: prev.y + prev.h },
														currentPct: { x: prev.x + prev.w + dx, y: prev.y + prev.h + dy },
														cropAspect,
														stageAspect,
													})
												: prev
										);
									} else {
										onChangeCropRect((prev) => (prev ? clampMovedCropRect(prev, dx, dy) : prev));
									}
									setCropStatusAnnouncement(
										t('media.cropMovedStatus', 'Crop selection updated')
									);
								}}
								className="absolute inset-0 block size-full bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
							>
								<span
									aria-hidden="true"
									className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3"
								>
									{Array.from({ length: 9 }).map((_, idx) => (
										<span key={idx} className="border border-white/25" />
									))}
								</span>
							</button>

							{cropRect.w >= 14 && cropRect.h >= 12 ? (
								<span
									aria-hidden="true"
									className="pointer-events-none absolute top-1.5 left-1.5 rounded-xs bg-black/70 px-1.5 py-0.5 font-mono text-[10px] leading-tight text-white backdrop-blur-[2px]"
								>
									{cropReadoutLabel}
								</span>
							) : null}

							{CROP_HANDLES.map((h) => (
								<span
									key={h.key}
									aria-hidden="true"
									data-rw-crop-handle={h.key}
									style={h.posStyle}
									onPointerDown={(e) => beginCropPointerSession(e, h.key)}
									className={cn(
										'absolute z-10 flex size-5 items-center justify-center',
										h.cursorClass
									)}
								>
									<span className="size-2.5 rounded-[2px] border border-black/55 bg-white shadow-xs" />
								</span>
							))}
						</div>
					) : null}
				</div>
			</div>

			{isTransforming ? (
				<div className="space-y-1.5">
					<progress
						data-rw-progress=""
						aria-label={t('media.transforming', 'Applying image transform...')}
					/>
					<p className="text-center text-xs text-muted-foreground">
						{t('media.transforming', 'Applying image transform...')}
					</p>
				</div>
			) : null}

			{hasValidCropSelection ? (
				<div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
					<span className="font-mono text-xs tabular-nums text-foreground">
						{cropReadoutLabel}
					</span>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={isTransforming}
							onClick={() => onChangeCropRect(null)}
						>
							{t('media.clearSelection', 'Clear selection')}
						</Button>
						<Button
							type="button"
							size="sm"
							disabled={isTransforming}
							onClick={() => void onApplyCrop()}
						>
							<DynamicIcon name="crop" className="size-3.5" />
							<span>{t('media.applyCrop', 'Apply crop')}</span>
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
