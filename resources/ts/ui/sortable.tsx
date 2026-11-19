import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn, DynamicIcon } from '../lib/utils';

export function moveArrayItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
	if (
		fromIndex < 0 ||
		fromIndex >= items.length ||
		toIndex < 0 ||
		toIndex >= items.length ||
		fromIndex === toIndex
	) {
		return [...items];
	}
	const next = [...items];
	const [moved] = next.splice(fromIndex, 1);
	if (moved === undefined) {
		return [...items];
	}
	next.splice(toIndex, 0, moved);
	return next;
}

export interface TreeSortableNodeSpec {
	id: string;
	parentId?: string | null;
	depth: number;
}

export interface ProjectedTreeReorder<T extends TreeSortableNodeSpec> {
	items: T[];
	payload: Array<{ id: string; parent_id: string; sort: number; depth: number }>;
	movedId: string;
	newIndex: number;
	newDepth: number;
	changed: boolean;
}

/**
 * Projects a flat pre-order tree after moving `draggedId` (and its contiguous descendant subtree)
 * to `insertGapIndex` (in the full `flatItems` coordinate space) with horizontal `depthDelta`.
 * Enforces `maxDepth` and prevents cycles (cannot drop inside own subtree).
 */
export function projectTreeReorder<T extends TreeSortableNodeSpec>(
	flatItems: readonly T[],
	draggedId: string,
	insertGapIndex: number,
	depthDelta: number,
	maxDepth = 5
): ProjectedTreeReorder<T> | null {
	const startIdx = flatItems.findIndex((item) => item.id === draggedId);
	const rootNode = startIdx >= 0 ? flatItems[startIdx] : undefined;
	if (startIdx === -1 || !rootNode) {
		return null;
	}
	let endIdx = startIdx + 1;
	while (endIdx < flatItems.length && (flatItems[endIdx]?.depth ?? -1) > rootNode.depth) {
		endIdx++;
	}

	const subtree = flatItems.slice(startIdx, endIdx);
	const subtreeLen = subtree.length;
	const maxRelChildDepth = subtree.reduce((acc, n) => Math.max(acc, n.depth - rootNode.depth), 0);

	const remaining = [...flatItems.slice(0, startIdx), ...flatItems.slice(endIdx)];
	let remGap = insertGapIndex;
	if (insertGapIndex > startIdx) {
		remGap = Math.max(startIdx, insertGapIndex - subtreeLen);
	}
	remGap = Math.max(0, Math.min(remaining.length, remGap));

	const prevNode = remGap > 0 ? remaining[remGap - 1] : undefined;
	const nextNode = remGap < remaining.length ? remaining[remGap] : undefined;

	const safeMaxDepth = Math.max(1, maxDepth);
	const maxAllowedDepth = prevNode
		? Math.min(Math.max(0, safeMaxDepth - 1 - maxRelChildDepth), prevNode.depth + 1)
		: 0;
	const minAllowedDepth = Math.min(maxAllowedDepth, nextNode ? nextNode.depth : 0);
	const newDepth = Math.max(minAllowedDepth, Math.min(maxAllowedDepth, rootNode.depth + depthDelta));
	const shift = newDepth - rootNode.depth;

	const movedSubtree = subtree.map((node) => ({
		...node,
		depth: node.depth + shift,
	}));

	const nextItems = [...remaining.slice(0, remGap), ...movedSubtree, ...remaining.slice(remGap)];

	const lastIdAtDepth: Record<number, string> = {};
	const sortByParent: Record<string, number> = {};
	const payload: Array<{ id: string; parent_id: string; sort: number; depth: number }> = [];

	const rebuiltItems = nextItems.map((node) => {
		const d = Math.max(0, node.depth);
		const parentId = d === 0 ? '' : lastIdAtDepth[d - 1] || '';
		const sort = sortByParent[parentId] ?? 0;
		sortByParent[parentId] = sort + 1;
		lastIdAtDepth[d] = node.id;
		payload.push({ id: node.id, parent_id: parentId, sort, depth: d });
		return {
			...node,
			depth: d,
			parentId: parentId || null,
		};
	});

	const changed =
		remGap !== startIdx ||
		newDepth !== rootNode.depth ||
		rebuiltItems.some((n, i) => n.id !== flatItems[i]?.id || n.depth !== flatItems[i]?.depth);

	return {
		items: rebuiltItems,
		payload,
		movedId: draggedId,
		newIndex: remGap,
		newDepth,
		changed,
	};
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
	if (typeof window === 'undefined' || !el) {
		return null;
	}
	let cur: HTMLElement | null = el.parentElement;
	while (cur && cur !== document.body && cur !== document.documentElement) {
		const style = window.getComputedStyle(cur);
		const oy = style.overflowY;
		const ox = style.overflowX;
		if (
			((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight + 4) ||
			((ox === 'auto' || ox === 'scroll') && cur.scrollWidth > cur.clientWidth + 4)
		) {
			return cur;
		}
		cur = cur.parentElement;
	}
	return (document.scrollingElement as HTMLElement | null) || null;
}

export interface SortableHandleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon?: string;
	size?: 'xs' | 'sm' | 'md';
	isGrabbed?: boolean;
	isDragging?: boolean;
	showKeyHint?: boolean;
}

export const SortableHandle = React.forwardRef<HTMLButtonElement, SortableHandleProps>(
	function SortableHandle(
		{
			icon = 'grip-vertical',
			size = 'sm',
			isGrabbed = false,
			isDragging = false,
			showKeyHint = false,
			className,
			disabled,
			title,
			...props
		},
		ref
	) {
		const sizeClass =
			size === 'xs' ? 'size-6' : size === 'md' ? 'size-8' : 'size-7';

		return (
			<span className="inline-flex items-center gap-1.5 shrink-0">
				<button
					ref={ref}
					type="button"
					disabled={disabled}
					aria-pressed={isGrabbed ? true : undefined}
					aria-label={props['aria-label'] || title || 'Drag or press Space to reorder'}
					title={title || 'Drag or press Space to reorder'}
					className={cn(
						'inline-flex touch-none select-none items-center justify-center rounded-md text-muted-foreground/75 transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none disabled:opacity-35',
						sizeClass,
						(isGrabbed || isDragging) && 'bg-primary/15 text-primary-ink ring-1 ring-primary/40',
						className
					)}
					{...props}
				>
					<DynamicIcon name={icon} aria-hidden="true" className="size-3.5" />
				</button>
				{showKeyHint && isGrabbed ? (
					<span
						aria-hidden="true"
						className="hidden sm:inline-block rounded bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary-ink whitespace-nowrap"
					>
						Arrows move · Space drop · Esc cancel
					</span>
				) : null}
			</span>
		);
	}
);

export function SortableStatusRegion({ message }: { message: string }): React.ReactElement {
	return (
		<p role="status" aria-live="polite" aria-atomic="true" className="rw-sr-status">
			{message}
		</p>
	);
}

export interface UseSortableListOptions<T> {
	items: readonly T[];
	getId: (item: T) => string;
	getLabel?: (item: T, index: number) => string;
	axis?: 'vertical' | 'horizontal' | 'grid';
	disabled?: boolean;
	onReorder?: (nextItems: T[], meta: { movedId: string; fromIndex: number; toIndex: number }) => void;
	tree?: {
		maxDepth?: number;
		indentPx?: number;
		maxDepthForNode?: (item: T) => number;
		onTreeReorder: (result: ProjectedTreeReorder<T & TreeSortableNodeSpec>) => void;
	};
}

export function useSortableList<T>(options: UseSortableListOptions<T>) {
	const { items, getId, getLabel, disabled = false, tree } = options;

	const containerElRef = useRef<HTMLElement | null>(null);
	const latestRef = useRef(options);
	latestRef.current = options;

	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [grabbedId, setGrabbedId] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<string>('');

	const preGrabSnapshotRef = useRef<T[] | null>(null);
	const suppressBlurRef = useRef(false);
	const prevRectsRef = useRef<Map<string, DOMRect> | null>(null);
	const statusTimerRef = useRef<number | null>(null);

	const announce = useCallback((text: string) => {
		if (typeof window === 'undefined') {
			return;
		}
		if (statusTimerRef.current !== null) {
			window.clearTimeout(statusTimerRef.current);
		}
		setStatusMessage('');
		statusTimerRef.current = window.setTimeout(() => {
			setStatusMessage(text);
			statusTimerRef.current = null;
		}, 90);
	}, []);

	useEffect(() => {
		return () => {
			if (statusTimerRef.current !== null && typeof window !== 'undefined') {
				window.clearTimeout(statusTimerRef.current);
			}
			if (typeof document !== 'undefined') {
				document.documentElement.removeAttribute('data-rw-dragging');
			}
		};
	}, []);

	const snapshotItemRects = useCallback((): Map<string, DOMRect> => {
		const map = new Map<string, DOMRect>();
		const container = containerElRef.current;
		if (!container) {
			return map;
		}
		const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-rw-sortable-id]')).filter(
			(el) => el.closest('[data-rw-sortable-container]') === container
		);
		nodes.forEach((node) => {
			const id = node.getAttribute('data-rw-sortable-id');
			if (!id) {
				return;
			}
			node.getAnimations?.().forEach((anim) => {
				try {
					anim.finish();
				} catch {
					anim.cancel();
				}
			});
			map.set(id, node.getBoundingClientRect());
		});
		return map;
	}, []);

	const orderSignature = items
		.map((item) => {
			const id = getId(item);
			const depth = tree ? (item as unknown as TreeSortableNodeSpec).depth ?? 0 : 0;
			return `${id}:${depth}`;
		})
		.join('|');

	useLayoutEffect(() => {
		const prevRects = prevRectsRef.current;
		if (!prevRects || prevRects.size === 0) {
			return;
		}
		prevRectsRef.current = null;

		if (prefersReducedMotion() || items.length > 150) {
			return;
		}
		const container = containerElRef.current;
		if (!container) {
			return;
		}
		const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-rw-sortable-id]')).filter(
			(el) => el.closest('[data-rw-sortable-container]') === container
		);
		nodes.forEach((node) => {
			const id = node.getAttribute('data-rw-sortable-id');
			const oldRect = id ? prevRects.get(id) : undefined;
			if (!oldRect || typeof node.animate !== 'function') {
				return;
			}
			const newRect = node.getBoundingClientRect();
			const dx = oldRect.left - newRect.left;
			const dy = oldRect.top - newRect.top;
			if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
				try {
					node.animate(
						[{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }],
						{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
					);
				} catch {
					// Ignore if Web Animations API is unavailable in synthetic test DOM
				}
			}
		});
	}, [orderSignature, items.length]);

	const containerRef = useCallback((node: HTMLElement | null) => {
		containerElRef.current = node;
	}, []);

	const focusHandleForId = useCallback((id: string) => {
		if (typeof window === 'undefined') {
			return;
		}
		window.requestAnimationFrame(() => {
			const container = containerElRef.current;
			if (!container) {
				return;
			}
			const itemEl = Array.from(container.querySelectorAll<HTMLElement>('[data-rw-sortable-id]')).find(
				(el) =>
					el.closest('[data-rw-sortable-container]') === container &&
					el.getAttribute('data-rw-sortable-id') === id
			);
			const handleEl = itemEl?.querySelector<HTMLButtonElement>(
				`[data-rw-sortable-handle="${CSS.escape(id)}"]`
			);
			if (itemEl) {
				itemEl.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
			}
			if (handleEl) {
				suppressBlurRef.current = true;
				handleEl.focus({ preventScroll: true });
				window.requestAnimationFrame(() => {
					suppressBlurRef.current = false;
				});
			}
		});
	}, []);

	const startPointerDrag = useCallback(
		(e: React.PointerEvent<HTMLButtonElement>, item: T, fromIndex: number) => {
			const cur = latestRef.current;
			if (cur.disabled || e.button !== 0 || cur.items.length < 2) {
				return;
			}
			const container = containerElRef.current;
			if (!container) {
				return;
			}

			const handleEl = e.currentTarget;
			const draggedItemId = cur.getId(item);
			const itemNodes = Array.from(container.querySelectorAll<HTMLElement>('[data-rw-sortable-id]')).filter(
				(el) => el.closest('[data-rw-sortable-container]') === container
			);
			const sourceEl = itemNodes.find((el) => el.getAttribute('data-rw-sortable-id') === draggedItemId);
			if (!sourceEl || itemNodes.length < 2) {
				return;
			}

			e.preventDefault();
			const pointerId = e.pointerId;
			try {
				handleEl.setPointerCapture(pointerId);
			} catch {
				// Ignore synthetic pointer events without capture target
			}

			// Settle any in-flight FLIP animations before taking base slot geometry snapshots
			itemNodes.forEach((node) => {
				node.getAnimations?.().forEach((anim) => {
					try {
						anim.finish();
					} catch {
						anim.cancel();
					}
				});
			});

			const scrollEl = findScrollableAncestor(container);
			const getScrollOffsets = () => ({
				top: scrollEl ? scrollEl.scrollTop : window.scrollY,
				left: scrollEl ? scrollEl.scrollLeft : window.scrollX,
			});

			const initialScroll = getScrollOffsets();
			const startX = e.clientX;
			const startY = e.clientY;
			let lastClientX = startX;
			let lastClientY = startY;
			let started = false;
			let currentGapIndex = fromIndex;
			let currentDepthDelta = 0;
			let rafId: number | null = null;
			let lastFrameTime = performance.now();
			let indicatorEl: HTMLDivElement | null = null;

			const baseSlots = itemNodes.map((el) => ({
				id: el.getAttribute('data-rw-sortable-id') || '',
				el,
				rect: el.getBoundingClientRect(),
			}));

			const ensureIndicator = (): HTMLDivElement => {
				if (!indicatorEl) {
					indicatorEl = document.createElement('div');
					indicatorEl.setAttribute('data-rw-drop-indicator', '');
					document.body.appendChild(indicatorEl);
				}
				return indicatorEl;
			};

			const clearDropMarker = () => {
				if (indicatorEl) {
					indicatorEl.removeAttribute('data-drop');
					indicatorEl.style.removeProperty('--drop-x');
					indicatorEl.style.removeProperty('--drop-y');
					indicatorEl.style.removeProperty('--drop-w');
					indicatorEl.style.removeProperty('--drop-h');
				}
			};

			const destroyDropMarker = () => {
				if (indicatorEl) {
					indicatorEl.remove();
					indicatorEl = null;
				}
			};

			const clearLiftedStyle = () => {
				sourceEl.style.removeProperty('translate');
				sourceEl.style.removeProperty('z-index');
				sourceEl.style.removeProperty('position');
				sourceEl.style.removeProperty('pointer-events');
				sourceEl.style.removeProperty('transition');
				sourceEl.removeAttribute('data-rw-lifted');
			};

			const evaluateDropPosition = (clientX: number, clientY: number) => {
				const scrollNow = getScrollOffsets();
				const scrollDy = scrollNow.top - initialScroll.top;
				const scrollDx = scrollNow.left - initialScroll.left;

				const dx = clientX - startX + scrollDx;
				const dy = clientY - startY + scrollDy;
				if (cur.axis === 'vertical' && !cur.tree) {
					sourceEl.style.translate = `0px ${dy.toFixed(1)}px`;
				} else if (cur.axis === 'horizontal') {
					sourceEl.style.translate = `${dx.toFixed(1)}px 0px`;
				} else {
					sourceEl.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
				}

				const liveSlots = baseSlots.map((slot) => ({
					id: slot.id,
					rect: new DOMRect(
						slot.rect.left - scrollDx,
						slot.rect.top - scrollDy,
						slot.rect.width,
						slot.rect.height
					),
				}));

				const containerRect = container.getBoundingClientRect();
				const isRtl =
					typeof window !== 'undefined' &&
					window.getComputedStyle(container).direction === 'rtl';

				const hysteresisPx = 6;
				let gapIdx = liveSlots.length;
				let useVerticalGapMarker = cur.axis === 'vertical';

				if (cur.axis === 'vertical') {
					for (let i = 0; i < liveSlots.length; i++) {
						const slot = liveSlots[i];
						if (!slot) continue;
						const r = slot.rect;
						const mid = r.top + r.height / 2;
						const bias = currentGapIndex <= i ? hysteresisPx : -hysteresisPx;
						if (clientY < mid + bias) {
							gapIdx = i;
							break;
						}
					}
				} else if (cur.axis === 'horizontal') {
					for (let i = 0; i < liveSlots.length; i++) {
						const slot = liveSlots[i];
						if (!slot) continue;
						const r = slot.rect;
						const mid = r.left + r.width / 2;
						const bias = currentGapIndex <= i ? hysteresisPx : -hysteresisPx;
						if (isRtl ? clientX > mid - bias : clientX < mid + bias) {
							gapIdx = i;
							break;
						}
					}
				} else {
					// 2D Grid layout: group into visual rows by vertical overlap, then compare midpoints
					let bestRowIndices: number[] = [];
					let bestRowDist = Infinity;
					const rows: number[][] = [];
					for (let i = 0; i < liveSlots.length; i++) {
						const slot = liveSlots[i];
						if (!slot) continue;
						const r = slot.rect;
						const cy = r.top + r.height / 2;
						const existingRow = rows.find((row) => {
							const firstIdx = row[0];
							const firstSlot = firstIdx !== undefined ? liveSlots[firstIdx] : undefined;
							if (!firstSlot) return false;
							const firstRect = firstSlot.rect;
							return Math.abs(cy - (firstRect.top + firstRect.height / 2)) <= Math.max(firstRect.height, r.height) * 0.55;
						});
						if (existingRow) {
							existingRow.push(i);
						} else {
							rows.push([i]);
						}
					}
					for (const row of rows) {
						const rowSlots = row.map((idx) => liveSlots[idx]).filter((s): s is NonNullable<typeof s> => Boolean(s));
						if (rowSlots.length === 0) continue;
						const top = Math.min(...rowSlots.map((s) => s.rect.top));
						const bottom = Math.max(...rowSlots.map((s) => s.rect.bottom));
						const dist = clientY < top ? top - clientY : clientY > bottom ? clientY - bottom : 0;
						if (dist < bestRowDist) {
							bestRowDist = dist;
							bestRowIndices = row;
						}
					}
					const singleIdx = bestRowIndices.length === 1 ? bestRowIndices[0] : undefined;
					const singleSlot = singleIdx !== undefined ? liveSlots[singleIdx] : undefined;
					if (singleIdx !== undefined && singleSlot) {
						const singleRect = singleSlot.rect;
						const isFullWidthRow = singleRect.width >= containerRect.width * 0.82;
						if (isFullWidthRow) {
							useVerticalGapMarker = true;
							const midY = singleRect.top + singleRect.height / 2;
							const bias = currentGapIndex <= singleIdx ? hysteresisPx : -hysteresisPx;
							gapIdx = clientY < midY + bias ? singleIdx : singleIdx + 1;
						} else {
							const midX = singleRect.left + singleRect.width / 2;
							const bias = currentGapIndex <= singleIdx ? hysteresisPx : -hysteresisPx;
							gapIdx = (isRtl ? clientX > midX - bias : clientX < midX + bias)
								? singleIdx
								: singleIdx + 1;
						}
					} else if (bestRowIndices.length > 1) {
						const lastRowIdx = bestRowIndices[bestRowIndices.length - 1] ?? liveSlots.length - 1;
						gapIdx = lastRowIdx + 1;
						for (const idx of bestRowIndices) {
							const slot = liveSlots[idx];
							if (!slot) continue;
							const r = slot.rect;
							const mid = r.left + r.width / 2;
							const bias = currentGapIndex <= idx ? hysteresisPx : -hysteresisPx;
							if (isRtl ? clientX > mid - bias : clientX < mid + bias) {
								gapIdx = idx;
								break;
							}
						}
					}
				}

				currentGapIndex = gapIdx;
				const indentStep = cur.tree?.indentPx ?? 24;
				currentDepthDelta = cur.tree ? Math.round((clientX - startX) / indentStep) : 0;

				let treePreview: ProjectedTreeReorder<T & TreeSortableNodeSpec> | null = null;
				if (cur.tree) {
					treePreview = projectTreeReorder(
						cur.items as unknown as readonly (T & TreeSortableNodeSpec)[],
						draggedItemId,
						currentGapIndex,
						currentDepthDelta,
						cur.tree.maxDepth ?? 5
					);
				}

				const isNoOp = cur.tree
					? !treePreview || !treePreview.changed
					: currentGapIndex === fromIndex || currentGapIndex === fromIndex + 1;

				if (isNoOp) {
					clearDropMarker();
					return;
				}

				const marker = ensureIndicator();
				if (useVerticalGapMarker) {
					const prevRect = gapIdx > 0 ? (liveSlots[gapIdx - 1]?.rect ?? null) : null;
					const nextRect = gapIdx < liveSlots.length ? (liveSlots[gapIdx]?.rect ?? null) : null;
					const markerY =
						prevRect && nextRect
							? (prevRect.bottom + nextRect.top) / 2
							: prevRect
								? prevRect.bottom + 4
								: nextRect
									? nextRect.top - 4
									: containerRect.top;
					const depthIndent = treePreview ? treePreview.newDepth * indentStep : 0;
					const markerX = containerRect.left + depthIndent;
					const markerW = Math.max(24, containerRect.width - depthIndent);
					marker.setAttribute('data-drop', 'vertical');
					marker.style.setProperty('--drop-x', `${Math.round(markerX)}px`);
					marker.style.setProperty('--drop-y', `${Math.round(markerY)}px`);
					marker.style.setProperty('--drop-w', `${Math.round(markerW)}px`);
				} else {
					const targetSlot =
						(gapIdx < liveSlots.length ? liveSlots[gapIdx]?.rect : liveSlots[liveSlots.length - 1]?.rect) ??
						containerRect;
					const prevSlot = gapIdx > 0 ? (liveSlots[gapIdx - 1]?.rect ?? null) : null;
					const sameRow =
						prevSlot &&
						gapIdx < liveSlots.length &&
						Math.abs(prevSlot.top - targetSlot.top) < Math.max(prevSlot.height, targetSlot.height) * 0.55;
					const markerX =
						gapIdx < liveSlots.length
							? sameRow
								? (prevSlot!.right + targetSlot.left) / 2
								: targetSlot.left - 4
							: targetSlot.right + 4;
					marker.setAttribute('data-drop', 'horizontal');
					marker.style.setProperty('--drop-x', `${Math.round(markerX)}px`);
					marker.style.setProperty('--drop-y', `${Math.round(targetSlot.top)}px`);
					marker.style.setProperty('--drop-h', `${Math.round(targetSlot.height)}px`);
				}
			};

			const stepAutoScroll = (now: number) => {
				const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
				lastFrameTime = now;
				if (started && scrollEl) {
					const isRoot =
						scrollEl === document.scrollingElement ||
						scrollEl === document.documentElement ||
						scrollEl === document.body;
					const bounds = isRoot
						? { top: 0, bottom: window.innerHeight }
						: scrollEl.getBoundingClientRect();
					const zone = Math.min(56, (bounds.bottom - bounds.top) / 4);
					const maxScrollTop = Math.max(
						0,
						scrollEl.scrollHeight - (isRoot ? window.innerHeight : scrollEl.clientHeight)
					);
					let speed = 0;
					if (lastClientY < bounds.top + zone && lastClientY < startY - 8 && scrollEl.scrollTop > 0) {
						const ratio = Math.min(1, (bounds.top + zone - lastClientY) / Math.max(1, zone));
						speed = -360 * ratio * ratio;
					} else if (
						lastClientY > bounds.bottom - zone &&
						lastClientY > startY + 8 &&
						scrollEl.scrollTop < maxScrollTop - 1
					) {
						const ratio = Math.min(1, (lastClientY - (bounds.bottom - zone)) / Math.max(1, zone));
						speed = 360 * ratio * ratio;
					}
					if (speed !== 0) {
						const before = scrollEl.scrollTop;
						scrollEl.scrollTop += speed * dt;
						if (scrollEl.scrollTop !== before) {
							evaluateDropPosition(lastClientX, lastClientY);
						}
					}
				}
				rafId = window.requestAnimationFrame(stepAutoScroll);
			};

			const cleanup = () => {
				if (rafId !== null) {
					window.cancelAnimationFrame(rafId);
					rafId = null;
				}
				document.removeEventListener('pointermove', onMove);
				document.removeEventListener('pointerup', onUp);
				document.removeEventListener('pointercancel', onCancel);
				document.removeEventListener('keydown', onKeyDown, true);
				handleEl.removeEventListener('lostpointercapture', onLostCapture);
				destroyDropMarker();
				clearLiftedStyle();
				document.documentElement.removeAttribute('data-rw-dragging');
				setDraggingId(null);
				try {
					if (handleEl.hasPointerCapture?.(pointerId)) {
						handleEl.releasePointerCapture(pointerId);
					}
				} catch {
					// Ignore
				}
			};

			const cancelDrag = (announceCancel: boolean) => {
				const releasedRect = started ? sourceEl.getBoundingClientRect() : null;
				cleanup();
				if (releasedRect && !prefersReducedMotion() && typeof sourceEl.animate === 'function') {
					sourceEl.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
					const slotRect = sourceEl.getBoundingClientRect();
					const dx = releasedRect.left - slotRect.left;
					const dy = releasedRect.top - slotRect.top;
					if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
						try {
							sourceEl.animate(
								[{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }],
								{ duration: 160, easing: 'ease-out' }
							);
						} catch {
							// Ignore
						}
					}
				}
				if (announceCancel) {
					announce('Reorder cancelled.');
				}
			};

			const onMove = (ev: PointerEvent) => {
				if (ev.pointerId !== pointerId) {
					return;
				}
				lastClientX = ev.clientX;
				lastClientY = ev.clientY;
				if (!started) {
					if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) {
						return;
					}
					started = true;
					setGrabbedId(null);
					setDraggingId(draggedItemId);
					document.documentElement.setAttribute('data-rw-dragging', '');
					sourceEl.style.transition = 'none';
					sourceEl.style.position = 'relative';
					sourceEl.style.zIndex = '40';
					sourceEl.style.pointerEvents = 'none';
					sourceEl.setAttribute('data-rw-lifted', 'true');
					lastFrameTime = performance.now();
					rafId = window.requestAnimationFrame(stepAutoScroll);
				}
				evaluateDropPosition(ev.clientX, ev.clientY);
			};

			const onUp = (ev: PointerEvent) => {
				if (ev.pointerId !== pointerId) {
					return;
				}
				if (!started) {
					cleanup();
					return;
				}
				const releasedRect = sourceEl.getBoundingClientRect();
				const rectsBefore = snapshotItemRects();
				rectsBefore.set(draggedItemId, releasedRect);
				cleanup();

				const latest = latestRef.current;
				const itemLabel = latest.getLabel
					? latest.getLabel(item, fromIndex)
					: `Item ${fromIndex + 1}`;

				if (latest.tree) {
					const projected = projectTreeReorder(
						latest.items as unknown as readonly (T & TreeSortableNodeSpec)[],
						draggedItemId,
						currentGapIndex,
						currentDepthDelta,
						latest.tree.maxDepth ?? 5
					);
					if (projected && projected.changed) {
						prevRectsRef.current = rectsBefore;
						latest.tree.onTreeReorder(projected);
						announce(
							`${itemLabel} moved to position ${projected.newIndex + 1} of ${projected.items.length}, level ${projected.newDepth + 1}.`
						);
						focusHandleForId(draggedItemId);
					}
					return;
				}

				const toIndex =
					currentGapIndex > fromIndex ? currentGapIndex - 1 : currentGapIndex;
				const clampedTo = Math.max(0, Math.min(latest.items.length - 1, toIndex));
				if (clampedTo !== fromIndex) {
					prevRectsRef.current = rectsBefore;
					const next = moveArrayItem(latest.items, fromIndex, clampedTo);
					latest.onReorder?.(next, {
						movedId: draggedItemId,
						fromIndex,
						toIndex: clampedTo,
					});
					announce(`${itemLabel} moved to position ${clampedTo + 1} of ${next.length}.`);
					focusHandleForId(draggedItemId);
				}
			};

			const onCancel = (ev: PointerEvent) => {
				if (ev.pointerId === pointerId) {
					cancelDrag(false);
				}
			};

			const onLostCapture = () => {
				if (started) {
					cancelDrag(false);
				} else {
					cleanup();
				}
			};

			const onKeyDown = (ev: KeyboardEvent) => {
				if (ev.key === 'Escape' && started) {
					ev.preventDefault();
					ev.stopPropagation();
					cancelDrag(true);
				}
			};

			document.addEventListener('pointermove', onMove);
			document.addEventListener('pointerup', onUp);
			document.addEventListener('pointercancel', onCancel);
			document.addEventListener('keydown', onKeyDown, true);
			handleEl.addEventListener('lostpointercapture', onLostCapture);
		},
		[announce, focusHandleForId, snapshotItemRects]
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLButtonElement>, item: T, index: number) => {
			const cur = latestRef.current;
			if (cur.disabled || cur.items.length < 1) {
				return;
			}
			const id = cur.getId(item);
			const label = cur.getLabel ? cur.getLabel(item, index) : `Item ${index + 1}`;
			const isGrabbed = grabbedId === id;

			if (e.key === ' ' || e.key === 'Enter') {
				e.preventDefault();
				if (isGrabbed) {
					setGrabbedId(null);
					preGrabSnapshotRef.current = null;
					announce(`${label} dropped at position ${index + 1} of ${cur.items.length}.`);
				} else {
					preGrabSnapshotRef.current = [...cur.items];
					setGrabbedId(id);
					announce(
						`${label} grabbed, position ${index + 1} of ${cur.items.length}. Use arrow keys to move, Space to drop, Escape to cancel.`
					);
				}
				return;
			}

			if (e.key === 'Escape' && isGrabbed) {
				e.preventDefault();
				e.stopPropagation();
				const snapshot = preGrabSnapshotRef.current;
				setGrabbedId(null);
				preGrabSnapshotRef.current = null;
				if (snapshot) {
					prevRectsRef.current = snapshotItemRects();
					const origIndex = snapshot.findIndex((it) => cur.getId(it) === id);
					if (cur.tree) {
						const origNode = snapshot[origIndex] as unknown as TreeSortableNodeSpec | undefined;
						if (origNode) {
							const restored = projectTreeReorder(
								snapshot as unknown as readonly (T & TreeSortableNodeSpec)[],
								id,
								origIndex,
								0,
								cur.tree.maxDepth ?? 5
							);
							if (restored) {
								cur.tree.onTreeReorder({ ...restored, changed: true });
							}
						}
					} else {
						cur.onReorder?.(snapshot, {
							movedId: id,
							fromIndex: index,
							toIndex: Math.max(0, origIndex),
						});
					}
					focusHandleForId(id);
				}
				announce(`Reorder cancelled. ${label} restored.`);
				return;
			}

			const allowMove = isGrabbed || e.altKey;
			if (!allowMove) {
				return;
			}

			if (cur.tree && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
				e.preventDefault();
				const depthStep = e.key === 'ArrowRight' ? 1 : -1;
				const projected = projectTreeReorder(
					cur.items as unknown as readonly (T & TreeSortableNodeSpec)[],
					id,
					index,
					depthStep,
					cur.tree.maxDepth ?? 5
				);
				if (projected && projected.changed) {
					prevRectsRef.current = snapshotItemRects();
					cur.tree.onTreeReorder(projected);
					announce(`${label}, level ${projected.newDepth + 1}.`);
					focusHandleForId(id);
				}
				return;
			}

			const isPrevKey =
				cur.axis === 'horizontal' ? e.key === 'ArrowLeft' : e.key === 'ArrowUp' || (cur.axis === 'grid' && e.key === 'ArrowLeft');
			const isNextKey =
				cur.axis === 'horizontal' ? e.key === 'ArrowRight' : e.key === 'ArrowDown' || (cur.axis === 'grid' && e.key === 'ArrowRight');

			if (!isPrevKey && !isNextKey) {
				return;
			}
			e.preventDefault();

			if (cur.tree) {
				const nodeSpec = item as unknown as TreeSortableNodeSpec;
				let endIdx = index + 1;
				while (
					endIdx < cur.items.length &&
					((cur.items[endIdx] as unknown as TreeSortableNodeSpec).depth ?? 0) > nodeSpec.depth
				) {
					endIdx++;
				}
				const targetGap = isPrevKey ? Math.max(0, index - 1) : Math.min(cur.items.length, endIdx + 1);
				const projected = projectTreeReorder(
					cur.items as unknown as readonly (T & TreeSortableNodeSpec)[],
					id,
					targetGap,
					0,
					cur.tree.maxDepth ?? 5
				);
				if (projected && projected.changed) {
					prevRectsRef.current = snapshotItemRects();
					cur.tree.onTreeReorder(projected);
					announce(
						`${label}, position ${projected.newIndex + 1} of ${projected.items.length}, level ${projected.newDepth + 1}.`
					);
					focusHandleForId(id);
				}
				return;
			}

			const targetIndex = isPrevKey ? index - 1 : index + 1;
			if (targetIndex < 0 || targetIndex >= cur.items.length) {
				return;
			}
			prevRectsRef.current = snapshotItemRects();
			const next = moveArrayItem(cur.items, index, targetIndex);
			cur.onReorder?.(next, { movedId: id, fromIndex: index, toIndex: targetIndex });
			announce(`${label}, position ${targetIndex + 1} of ${next.length}.`);
			focusHandleForId(id);
		},
		[announce, focusHandleForId, grabbedId, snapshotItemRects]
	);

	const getContainerProps = useCallback(
		() => ({
			ref: containerRef,
			'data-rw-sortable-container': '',
		}),
		[containerRef]
	);

	const getItemProps = useCallback(
		(item: T) => {
			const id = getId(item);
			const isBeingDragged = draggingId === id;
			const isKeyboardGrabbed = grabbedId === id;
			return {
				'data-rw-sortable-item': '',
				'data-rw-sortable-id': id,
				'data-rw-grabbed': isBeingDragged || isKeyboardGrabbed ? 'true' : undefined,
			};
		},
		[draggingId, getId, grabbedId]
	);

	const getHandleProps = useCallback(
		(item: T, index: number): SortableHandleProps => {
			const id = getId(item);
			const itemLabel = getLabel ? getLabel(item, index) : `item ${index + 1}`;
			const isKeyboardGrabbed = grabbedId === id;
			const isBeingDragged = draggingId === id;
			return {
				'data-rw-sortable-handle': id,
				disabled: disabled || items.length < 2,
				isGrabbed: isKeyboardGrabbed,
				isDragging: isBeingDragged,
				'aria-label': `Reorder ${itemLabel}`,
				onPointerDown: (e) => {
					e.stopPropagation();
					startPointerDrag(e, item, index);
				},
				onKeyDown: (e) => {
					e.stopPropagation();
					handleKeyDown(e, item, index);
				},
				onBlur: () => {
					if (!suppressBlurRef.current && grabbedId === id) {
						setGrabbedId(null);
						preGrabSnapshotRef.current = null;
					}
				},
			} as SortableHandleProps;
		},
		[disabled, draggingId, getId, getLabel, grabbedId, handleKeyDown, items.length, startPointerDrag]
	);

	return {
		containerRef,
		getContainerProps,
		getItemProps,
		getHandleProps,
		draggingId,
		grabbedId,
		statusMessage,
		announce,
	};
}
