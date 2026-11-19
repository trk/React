/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import type { Editor } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { getReactWorkspaceRuntime } from '../../runtime';
import type { HeadingLevel, TiptapCanvasCapability, TiptapTranslateFn } from '../core/tiptapTypes';

const runtime = getReactWorkspaceRuntime();
const { React } = runtime;
const { useCallback, useEffect, useId, useRef, useState } = React;

interface TopLevelBlockSnapshot {
	index: number;
	pos: number;
	node: PmNode;
	nodeSize: number;
}

interface ActiveBlockMeta {
	index: number;
	pos: number;
	nodeSize: number;
	nodeType: string;
	totalBlocks: number;
	top: number;
}

interface DropTargetSlot {
	slotIndex: number;
	lineX: number;
	lineY: number;
	lineW: number;
}

function readTopLevelBlocks(doc: PmNode): TopLevelBlockSnapshot[] {
	const blocks: TopLevelBlockSnapshot[] = [];
	let offset = 0;
	for (let i = 0; i < doc.childCount; i++) {
		const child = doc.child(i);
		blocks.push({
			index: i,
			pos: offset,
			node: child,
			nodeSize: child.nodeSize,
		});
		offset += child.nodeSize;
	}
	return blocks;
}

function resolveBlockDomElement(editor: Editor, block: TopLevelBlockSnapshot): HTMLElement | null {
	try {
		const nodeDom = editor.view.nodeDOM(block.pos);
		if (nodeDom instanceof HTMLElement) {
			return nodeDom;
		}
	} catch {
		// Fall back to ProseMirror root child lookup
	}
	const fallback = editor.view.dom.children.item(block.index);
	return fallback instanceof HTMLElement ? fallback : null;
}

function computeRelativeTop(surfaceEl: HTMLElement, blockEl: HTMLElement): number {
	const surfaceRect = surfaceEl.getBoundingClientRect();
	const blockRect = blockEl.getBoundingClientRect();
	const offset = blockRect.top - surfaceRect.top + surfaceEl.scrollTop - surfaceEl.clientTop;
	return Math.max(2, Math.round(offset + 2));
}

function resolvePopoverElement(menuEl: HTMLDivElement | null):
	| (HTMLDivElement & {
			showPopover?: (opts?: { source?: HTMLElement }) => void;
			hidePopover?: () => void;
			togglePopover?: (opts?: boolean | { force?: boolean; source?: HTMLElement }) => boolean;
	  })
	| null {
	return menuEl as
		| (HTMLDivElement & {
				showPopover?: (opts?: { source?: HTMLElement }) => void;
				hidePopover?: () => void;
				togglePopover?: (opts?: boolean | { force?: boolean; source?: HTMLElement }) => boolean;
		  })
		| null;
}

function hidePopoverSafe(menuEl: HTMLDivElement | null): void {
	const pop = resolvePopoverElement(menuEl);
	if (!pop) {
		return;
	}
	try {
		if (pop.matches(':popover-open') && typeof pop.hidePopover === 'function') {
			pop.hidePopover();
		}
	} catch {
		// Fallback for environments without Popover API
		pop.removeAttribute('open');
	}
}

function moveTopLevelBlock(
	editor: Editor,
	fromIndex: number,
	toSlotIndex: number,
	t: TiptapTranslateFn,
	onAnnounce: (msg: string) => void
): boolean {
	if (editor.isDestroyed) {
		return false;
	}
	const blocks = readTopLevelBlocks(editor.state.doc);
	const source = blocks[fromIndex];
	if (!source) {
		return false;
	}
	const clampedSlot = Math.max(0, Math.min(blocks.length, toSlotIndex));
	if (clampedSlot === fromIndex || clampedSlot === fromIndex + 1) {
		return false;
	}

	const fromStart = source.pos;
	const fromEnd = fromStart + source.nodeSize;
	const movingDown = clampedSlot > fromIndex + 1;
	const rawTargetPos =
		clampedSlot >= blocks.length ? editor.state.doc.content.size : blocks[clampedSlot]!.pos;
	const insertPos = movingDown ? rawTargetPos - source.nodeSize : rawTargetPos;
	const finalIndex = movingDown ? clampedSlot - 1 : clampedSlot;

	const tr = editor.state.tr;
	tr.delete(fromStart, fromEnd);
	tr.insert(insertPos, source.node);

	const insidePos = Math.min(tr.doc.content.size, insertPos + 1);
	const resolved = tr.doc.resolve(insidePos);
	if (source.node.isAtom) {
		try {
			tr.setSelection(NodeSelection.create(tr.doc, insertPos));
		} catch {
			tr.setSelection(TextSelection.near(resolved));
		}
	} else {
		tr.setSelection(TextSelection.near(resolved));
	}

	editor.view.dispatch(tr.scrollIntoView());
	onAnnounce(
		t('canvas.blockMoved', { position: finalIndex + 1 }, 'Block moved to position {position}')
	);
	return true;
}

function turnTopLevelBlockInto(
	editor: Editor,
	block: TopLevelBlockSnapshot,
	targetKind:
		| 'paragraph'
		| 'bulletList'
		| 'orderedList'
		| 'taskList'
		| 'blockquote'
		| 'codeBlock'
		| { heading: HeadingLevel }
): void {
	const currentType = block.node.type.name;
	const focusInside = Math.min(editor.state.doc.content.size, block.pos + (block.node.isTextblock ? 1 : 2));
	const chain = editor.chain().focus().setTextSelection(focusInside);

	const unwrapIfNeeded = () => {
		if (currentType === 'bulletList') {
			chain.toggleBulletList();
		} else if (currentType === 'orderedList') {
			chain.toggleOrderedList();
		} else if (currentType === 'taskList') {
			(chain as unknown as { toggleTaskList: () => typeof chain }).toggleTaskList();
		} else if (currentType === 'blockquote') {
			chain.toggleBlockquote();
		}
	};

	if (targetKind === 'paragraph') {
		if (currentType === 'bulletList' || currentType === 'orderedList' || currentType === 'taskList' || currentType === 'blockquote') {
			unwrapIfNeeded();
			chain.run();
			return;
		}
		chain.setParagraph().run();
		return;
	}

	if (typeof targetKind === 'object' && 'heading' in targetKind) {
		unwrapIfNeeded();
		chain.setHeading({ level: targetKind.heading }).run();
		return;
	}

	if (targetKind === 'bulletList') {
		if (currentType !== 'bulletList') {
			if (currentType === 'orderedList' || currentType === 'taskList' || currentType === 'blockquote') {
				unwrapIfNeeded();
			}
			chain.toggleBulletList().run();
		}
		return;
	}

	if (targetKind === 'orderedList') {
		if (currentType !== 'orderedList') {
			if (currentType === 'bulletList' || currentType === 'taskList' || currentType === 'blockquote') {
				unwrapIfNeeded();
			}
			chain.toggleOrderedList().run();
		}
		return;
	}

	if (targetKind === 'taskList') {
		if (currentType !== 'taskList' && editor.schema.nodes.taskList) {
			if (currentType === 'bulletList' || currentType === 'orderedList' || currentType === 'blockquote') {
				unwrapIfNeeded();
			}
			(chain as unknown as { toggleTaskList: () => typeof chain }).toggleTaskList().run();
		}
		return;
	}

	if (targetKind === 'blockquote') {
		if (currentType !== 'blockquote') {
			if (currentType === 'bulletList' || currentType === 'orderedList' || currentType === 'taskList') {
				unwrapIfNeeded();
			}
			chain.toggleBlockquote().run();
		}
		return;
	}

	if (targetKind === 'codeBlock') {
		unwrapIfNeeded();
		chain.setCodeBlock().run();
	}
}

export const BlockHandleOverlay: TiptapCanvasCapability['BlockHandleOverlay'] = ({
	editor,
	surfaceRef,
	allowedHeadings,
	enableSlashMenu,
	t,
	onAnnounce,
}) => {
	const rawUid = useId().replace(/[^a-zA-Z0-9_-]/g, '') || 'block';
	const triggerId = `rw-tiptap-block-trigger-${rawUid}`;
	const menuId = `rw-tiptap-block-menu-${rawUid}`;
	const turnIntoHeadingId = `rw-tiptap-turninto-${rawUid}`;

	const [activeBlock, setActiveBlock] = useState<ActiveBlockMeta | null>(null);
	const [isHoveringSurface, setIsHoveringSurface] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [lockedBlockIndex, setLockedBlockIndex] = useState<number | null>(null);

	const gutterRef = useRef<HTMLDivElement | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const menuListRef = useRef<HTMLDivElement | null>(null);
	const menuOpenRef = useRef(false);
	menuOpenRef.current = menuOpen;
	const isDraggingRef = useRef(false);
	const justDraggedRef = useRef(false);
	const lockedBlockIndexRef = useRef<number | null>(null);
	lockedBlockIndexRef.current = lockedBlockIndex;

	const syncBlockAtIndex = useCallback(
		(targetIndex: number) => {
			const surfaceEl = surfaceRef.current;
			if (!surfaceEl || editor.isDestroyed || !editor.isEditable) {
				setActiveBlock(null);
				return;
			}
			const blocks = readTopLevelBlocks(editor.state.doc);
			if (blocks.length === 0) {
				setActiveBlock(null);
				return;
			}
			const clampedIdx = Math.max(0, Math.min(blocks.length - 1, targetIndex));
			const block = blocks[clampedIdx]!;
			const domEl = resolveBlockDomElement(editor, block);
			if (!domEl) {
				return;
			}
			const top = computeRelativeTop(surfaceEl, domEl);
			setActiveBlock({
				index: block.index,
				pos: block.pos,
				nodeSize: block.nodeSize,
				nodeType: block.node.type.name,
				totalBlocks: blocks.length,
				top,
			});
		},
		[editor, surfaceRef]
	);

	const syncFromSelection = useCallback(() => {
		if (menuOpenRef.current || isDraggingRef.current) {
			return;
		}
		if (!editor.isEditable || editor.isDestroyed) {
			setActiveBlock(null);
			return;
		}
		const { $from } = editor.state.selection;
		const idx = $from.depth >= 1 ? $from.index(0) : 0;
		syncBlockAtIndex(idx);
	}, [editor, syncBlockAtIndex]);

	// Keep active block metadata synchronized with ProseMirror selection & doc mutations
	useEffect(() => {
		syncFromSelection();
		const onUpdate = () => {
			if (menuOpenRef.current || isDraggingRef.current) {
				return;
			}
			syncFromSelection();
		};
		editor.on('selectionUpdate', onUpdate);
		editor.on('transaction', onUpdate);
		editor.on('focus', onUpdate);
		return () => {
			editor.off('selectionUpdate', onUpdate);
			editor.off('transaction', onUpdate);
			editor.off('focus', onUpdate);
		};
	}, [editor, syncFromSelection]);

	// Track pointer hover over blocks inside the surface to move left-gutter handle smoothly
	useEffect(() => {
		const surfaceEl = surfaceRef.current;
		if (!surfaceEl || !editor.isEditable) {
			return;
		}

		const handleMouseMove = (e: MouseEvent) => {
			if (menuOpenRef.current || isDraggingRef.current) {
				return;
			}
			const target = e.target instanceof Element ? e.target : null;
			if (target && (gutterRef.current?.contains(target) || menuRef.current?.contains(target))) {
				setIsHoveringSurface(true);
				return;
			}
			const blocks = readTopLevelBlocks(editor.state.doc);
			if (blocks.length === 0) {
				return;
			}
			setIsHoveringSurface(true);

			let bestIdx = -1;
			let bestDist = Infinity;
			for (const block of blocks) {
				const domEl = resolveBlockDomElement(editor, block);
				if (!domEl) {
					continue;
				}
				const rect = domEl.getBoundingClientRect();
				if (e.clientY >= rect.top - 4 && e.clientY <= rect.bottom + 4) {
					bestIdx = block.index;
					bestDist = 0;
					break;
				}
				const dist = Math.min(Math.abs(e.clientY - rect.top), Math.abs(e.clientY - rect.bottom));
				if (dist < bestDist) {
					bestDist = dist;
					bestIdx = block.index;
				}
			}
			if (bestIdx >= 0) {
				syncBlockAtIndex(bestIdx);
			}
		};

		const handleMouseLeave = (e: MouseEvent) => {
			const related = e.relatedTarget as Node | null;
			if (related && (menuRef.current?.contains(related) || gutterRef.current?.contains(related))) {
				return;
			}
			setIsHoveringSurface(false);
		};

		surfaceEl.addEventListener('mousemove', handleMouseMove);
		surfaceEl.addEventListener('mouseleave', handleMouseLeave);
		return () => {
			surfaceEl.removeEventListener('mousemove', handleMouseMove);
			surfaceEl.removeEventListener('mouseleave', handleMouseLeave);
		};
	}, [editor, surfaceRef, syncBlockAtIndex]);

	// Keyboard block reordering: Alt+Shift+ArrowUp / Alt+Shift+ArrowDown
	useEffect(() => {
		if (!editor.isEditable || editor.isDestroyed) {
			return;
		}
		const dom = editor.view.dom as HTMLElement;
		const onKeyDown = (e: KeyboardEvent) => {
			if (!e.altKey || !e.shiftKey || e.metaKey || e.ctrlKey) {
				return;
			}
			if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
				return;
			}
			const { $from } = editor.state.selection;
			const curIdx = $from.depth >= 1 ? $from.index(0) : -1;
			if (curIdx < 0) {
				return;
			}
			const total = editor.state.doc.childCount;
			const targetSlot = e.key === 'ArrowUp' ? curIdx - 1 : curIdx + 2;
			if (targetSlot < 0 || targetSlot > total) {
				return;
			}
			e.preventDefault();
			moveTopLevelBlock(editor, curIdx, targetSlot, t, onAnnounce);
		};
		dom.addEventListener('keydown', onKeyDown);
		return () => {
			dom.removeEventListener('keydown', onKeyDown);
		};
	}, [editor, t, onAnnounce]);

	const positionMenuFallback = useCallback((menuEl: HTMLDivElement) => {
		const trigger = triggerRef.current;
		if (!trigger) {
			return;
		}
		const usesNativeAnchor =
			typeof CSS !== 'undefined' &&
			typeof CSS.supports === 'function' &&
			CSS.supports('position-area', 'block-end') &&
			typeof HTMLButtonElement !== 'undefined' &&
			'commandForElement' in HTMLButtonElement.prototype;
		if (usesNativeAnchor) {
			menuEl.style.left = '';
			menuEl.style.top = '';
			return;
		}
		const rect = trigger.getBoundingClientRect();
		const vw = window.innerWidth || 1280;
		const vh = window.innerHeight || 800;
		const menuW = Math.min(260, vw - 24);
		const left = Math.max(12, Math.min(rect.left, vw - menuW - 12));
		const estH = 300;
		const top =
			rect.bottom + estH > vh - 12 && rect.top > vh - rect.bottom
				? Math.max(12, rect.top - estH - 6)
				: Math.min(vh - estH - 12, rect.bottom + 6);
		menuEl.style.left = `${left}px`;
		menuEl.style.top = `${top}px`;
	}, []);

	// Synchronize Popover API state (`toggle` event), focus management, and focusgroup progressive enhancement
	useEffect(() => {
		const menuEl = menuRef.current;
		if (!menuEl) {
			return;
		}

		const onToggle = (e: Event) => {
			const toggleEvt = e as ToggleEvent;
			const nextOpen = toggleEvt.newState === 'open';
			if (nextOpen && justDraggedRef.current) {
				hidePopoverSafe(menuEl);
				return;
			}
			setMenuOpen(nextOpen);
			if (nextOpen) {
				setLockedBlockIndex((prev) => prev ?? activeBlock?.index ?? 0);
				positionMenuFallback(menuEl);
				window.requestAnimationFrame(() => {
					const items = Array.from(
						menuListRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []
					);
					if (items.length > 0) {
						items[0]!.focus();
					}
				});
			} else {
				setLockedBlockIndex(null);
			}
		};

		menuEl.addEventListener('toggle', onToggle);
		return () => {
			menuEl.removeEventListener('toggle', onToggle);
		};
	}, [activeBlock?.index, positionMenuFallback]);

	// Progressive enhancement fallback for `focusgroup="menu nomemory"` when browser lacks native focusgroup
	useEffect(() => {
		const listEl = menuListRef.current;
		if (!listEl || !menuOpen) {
			return;
		}
		const hasNativeFocusGroup =
			typeof HTMLElement !== 'undefined' && 'focusGroup' in HTMLElement.prototype;
		const buttons = Array.from(listEl.querySelectorAll<HTMLButtonElement>('button'));

		if (!hasNativeFocusGroup) {
			listEl.setAttribute('role', 'menu');
			buttons.forEach((btn, idx) => {
				btn.setAttribute('role', 'menuitem');
				btn.tabIndex = idx === 0 ? 0 : -1;
			});
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				hidePopoverSafe(menuRef.current);
				triggerRef.current?.focus();
				return;
			}
			if (hasNativeFocusGroup) {
				return;
			}
			const enabledButtons = buttons.filter((b) => !b.disabled);
			if (enabledButtons.length === 0) {
				return;
			}
			const currentIdx = enabledButtons.indexOf(document.activeElement as HTMLButtonElement);
			const moveTo = (targetIdx: number) => {
				const targetBtn = enabledButtons[targetIdx];
				if (!targetBtn) {
					return;
				}
				enabledButtons.forEach((b) => {
					b.tabIndex = b === targetBtn ? 0 : -1;
				});
				targetBtn.focus();
			};
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				moveTo((currentIdx + 1) % enabledButtons.length);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				moveTo((currentIdx - 1 + enabledButtons.length) % enabledButtons.length);
			} else if (e.key === 'Home') {
				e.preventDefault();
				moveTo(0);
			} else if (e.key === 'End') {
				e.preventDefault();
				moveTo(enabledButtons.length - 1);
			}
		};

		listEl.addEventListener('keydown', handleKeyDown);
		return () => {
			listEl.removeEventListener('keydown', handleKeyDown);
		};
	}, [menuOpen]);

	const handleAddBlockBelow = useCallback(() => {
		const target = activeBlock;
		if (!target || editor.isDestroyed || !editor.isEditable) {
			return;
		}
		const blocks = readTopLevelBlocks(editor.state.doc);
		const block = blocks[target.index];
		if (!block) {
			return;
		}
		const insertPos = block.pos + block.nodeSize;
		const paragraphJson = {
			type: 'paragraph',
			...(enableSlashMenu ? { content: [{ type: 'text', text: '/' }] } : {}),
		};
		const cursorPos = insertPos + (enableSlashMenu ? 2 : 1);
		editor
			.chain()
			.focus()
			.insertContentAt(insertPos, paragraphJson)
			.setTextSelection(cursorPos)
			.run();
		onAnnounce(t('canvas.addBlockBelow', 'Add block below'));
	}, [activeBlock, editor, enableSlashMenu, onAnnounce, t]);

	const handleTriggerClick = useCallback(() => {
		if (justDraggedRef.current) {
			return;
		}
		if (typeof HTMLButtonElement !== 'undefined' && 'commandForElement' in HTMLButtonElement.prototype) {
			// Native Invoker Command handles toggle-popover unless menu lacked locked target
			setLockedBlockIndex(activeBlock?.index ?? 0);
			return;
		}
		const pop = resolvePopoverElement(menuRef.current);
		if (!pop) {
			return;
		}
		setLockedBlockIndex(activeBlock?.index ?? 0);
		if (typeof pop.togglePopover === 'function') {
			try {
				pop.togglePopover({ source: triggerRef.current ?? undefined });
			} catch {
				pop.togglePopover();
			}
		}
	}, [activeBlock?.index]);

	// Pointer Events drag-and-drop block reordering (`modern-web-guidance`: `drag-and-drop`)
	const handleDragPointerDown = useCallback(
		(downEvent: React.PointerEvent<HTMLButtonElement>) => {
			if (downEvent.button !== 0 || !activeBlock || !editor.isEditable || editor.isDestroyed) {
				return;
			}
			const surfaceEl = surfaceRef.current;
			const handleEl = triggerRef.current;
			if (!surfaceEl || !handleEl) {
				return;
			}

			const pointerId = downEvent.pointerId;
			const startX = downEvent.clientX;
			const startY = downEvent.clientY;
			const sourceIndex = activeBlock.index;

			let dragActive = false;
			let activeSlot: DropTargetSlot | null = null;
			let cancelled = false;

			try {
				handleEl.setPointerCapture(pointerId);
			} catch {
				// Ignore capture denial in synthetic test events
			}

			const clearDragState = () => {
				isDraggingRef.current = false;
				delete document.documentElement.dataset.rwTiptapDragging;
				delete handleEl.dataset.dragging;
				delete surfaceEl.dataset.drop;
				surfaceEl.style.removeProperty('--drop-x');
				surfaceEl.style.removeProperty('--drop-y');
				surfaceEl.style.removeProperty('--drop-w');
				try {
					if (handleEl.hasPointerCapture(pointerId)) {
						handleEl.releasePointerCapture(pointerId);
					}
				} catch {
					// Ignore
				}
				window.removeEventListener('pointermove', onPointerMove);
				window.removeEventListener('pointerup', onPointerEnd);
				window.removeEventListener('pointercancel', onPointerCancel);
				window.removeEventListener('keydown', onEscapeKey, true);
			};

			const computeDropSlot = (clientY: number): DropTargetSlot | null => {
				const blocks = readTopLevelBlocks(editor.state.doc);
				if (blocks.length <= 1) {
					return null;
				}
				const surfaceRect = surfaceEl.getBoundingClientRect();
				const baseX = Math.round(surfaceRect.left + 44);
				const baseW = Math.max(120, Math.round(surfaceRect.width - 56));

				let targetSlot = blocks.length;
				let lineY = surfaceRect.bottom - 8;

				for (let i = 0; i < blocks.length; i++) {
					const domEl = resolveBlockDomElement(editor, blocks[i]!);
					if (!domEl) {
						continue;
					}
					const rect = domEl.getBoundingClientRect();
					const midpoint = rect.top + rect.height / 2;
					if (clientY < midpoint) {
						targetSlot = i;
						lineY = rect.top;
						break;
					}
					lineY = rect.bottom;
				}

				if (targetSlot === sourceIndex || targetSlot === sourceIndex + 1) {
					return null;
				}

				return {
					slotIndex: targetSlot,
					lineX: baseX,
					lineY: Math.round(lineY),
					lineW: baseW,
				};
			};

			const onPointerMove = (moveEvent: PointerEvent) => {
				if (moveEvent.pointerId !== pointerId || cancelled) {
					return;
				}
				if (!dragActive) {
					const dx = moveEvent.clientX - startX;
					const dy = moveEvent.clientY - startY;
					if (Math.hypot(dx, dy) < 5) {
						return;
					}
					dragActive = true;
					isDraggingRef.current = true;
					setLockedBlockIndex(sourceIndex);
					hidePopoverSafe(menuRef.current);
					document.documentElement.dataset.rwTiptapDragging = '1';
					handleEl.dataset.dragging = '1';
				}

				const slot = computeDropSlot(moveEvent.clientY);
				activeSlot = slot;
				if (slot) {
					surfaceEl.dataset.drop = '1';
					surfaceEl.style.setProperty('--drop-x', `${slot.lineX}px`);
					surfaceEl.style.setProperty('--drop-y', `${slot.lineY}px`);
					surfaceEl.style.setProperty('--drop-w', `${slot.lineW}px`);
				} else {
					delete surfaceEl.dataset.drop;
				}
			};

			const onEscapeKey = (keyEvent: KeyboardEvent) => {
				if (keyEvent.key !== 'Escape' || !dragActive) {
					return;
				}
				keyEvent.preventDefault();
				keyEvent.stopPropagation();
				cancelled = true;
				clearDragState();
				setLockedBlockIndex(null);
				onAnnounce(t('canvas.dragCancelled', 'Block reorder cancelled'));
			};

			const onPointerCancel = (cancelEvent: PointerEvent) => {
				if (cancelEvent.pointerId !== pointerId) {
					return;
				}
				cancelled = true;
				clearDragState();
				setLockedBlockIndex(null);
			};

			const onPointerEnd = (upEvent: PointerEvent) => {
				if (upEvent.pointerId !== pointerId) {
					return;
				}
				const wasDragging = dragActive && !cancelled;
				const slotToCommit = activeSlot;
				clearDragState();
				setLockedBlockIndex(null);

				if (wasDragging) {
					justDraggedRef.current = true;
					window.setTimeout(() => {
						justDraggedRef.current = false;
					}, 120);
					if (slotToCommit) {
						moveTopLevelBlock(editor, sourceIndex, slotToCommit.slotIndex, t, onAnnounce);
					}
				}
			};

			window.addEventListener('pointermove', onPointerMove);
			window.addEventListener('pointerup', onPointerEnd);
			window.addEventListener('pointercancel', onPointerCancel);
			window.addEventListener('keydown', onEscapeKey, true);
		},
		[activeBlock, editor, onAnnounce, surfaceRef, t]
	);

	const effectiveIndex = lockedBlockIndex ?? activeBlock?.index ?? 0;
	const blocksSnapshot = readTopLevelBlocks(editor.state.doc);
	const effectiveBlock = blocksSnapshot[effectiveIndex] ?? blocksSnapshot[0];
	const totalBlocks = blocksSnapshot.length;
	const canMoveUp = effectiveIndex > 0;
	const canMoveDown = effectiveIndex < totalBlocks - 1;
	const hasTaskList = Boolean(editor.schema.nodes.taskList);
	const isVisible = Boolean(activeBlock && (isHoveringSurface || menuOpen || editor.isFocused));

	const runMenuAction = (fn: (b: TopLevelBlockSnapshot) => void) => {
		if (!effectiveBlock) {
			return;
		}
		hidePopoverSafe(menuRef.current);
		setLockedBlockIndex(null);
		fn(effectiveBlock);
	};

	const handleDuplicate = (b: TopLevelBlockSnapshot) => {
		const copyJson = b.node.toJSON();
		const insertPos = b.pos + b.nodeSize;
		editor
			.chain()
			.focus()
			.insertContentAt(insertPos, copyJson)
			.setTextSelection(Math.min(editor.state.doc.content.size, insertPos + 1))
			.run();
		onAnnounce(t('canvas.blockDuplicated', 'Block duplicated'));
	};

	const handleDelete = (b: TopLevelBlockSnapshot) => {
		if (totalBlocks <= 1) {
			editor
				.chain()
				.focus()
				.command(({ tr, state }) => {
					const para = state.schema.nodes.paragraph;
					if (para) {
						tr.replaceWith(0, state.doc.content.size, para.create());
					}
					return true;
				})
				.run();
		} else {
			editor
				.chain()
				.focus()
				.deleteRange({ from: b.pos, to: b.pos + b.nodeSize })
				.run();
		}
		onAnnounce(t('canvas.blockDeleted', 'Block deleted'));
	};

	if (!editor.isEditable) {
		return null;
	}

	const topPx = activeBlock ? activeBlock.top : 4;
	const invokerProps = {
		commandfor: menuId,
		command: 'toggle-popover',
	} as Record<string, string>;

	return (
		<div
			ref={gutterRef}
			className="rw-tiptap-block-gutter"
			data-rw-tiptap-block-gutter=""
			data-has-target={activeBlock ? '1' : undefined}
			data-visible={isVisible ? '1' : undefined}
			style={{ top: `${topPx}px` }}
			contentEditable={false}
			onMouseDown={(e) => {
				if (e.target instanceof Element && e.target.closest('button')) {
					e.preventDefault();
				}
			}}
		>
			<button
				type="button"
				aria-label={t('canvas.addBlockBelow', 'Add block below')}
				title={t('canvas.addBlockBelow', 'Add block below')}
				data-rw-tiptap-block-handle="add"
				onClick={handleAddBlockBelow}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="size-3.5"
					aria-hidden="true"
				>
					<path d="M12 5v14" />
					<path d="M5 12h14" />
				</svg>
			</button>

			<button
				ref={triggerRef}
				id={triggerId}
				type="button"
				aria-label={t('canvas.blockActions', 'Block actions (drag to reorder or click for menu)')}
				title={t('canvas.blockActions', 'Block actions (drag to reorder or click for menu)')}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				data-rw-tiptap-block-handle="drag"
				{...invokerProps}
				onPointerDown={handleDragPointerDown}
				onClick={handleTriggerClick}
			>
				<svg
					viewBox="0 0 24 24"
					fill="currentColor"
					className="size-3.5"
					aria-hidden="true"
				>
					<circle cx="9" cy="6" r="1.5" />
					<circle cx="15" cy="6" r="1.5" />
					<circle cx="9" cy="12" r="1.5" />
					<circle cx="15" cy="12" r="1.5" />
					<circle cx="9" cy="18" r="1.5" />
					<circle cx="15" cy="18" r="1.5" />
				</svg>
			</button>

			<div
				ref={menuRef}
				id={menuId}
				popover="auto"
				data-rw-tiptap-block-menu=""
				data-rw-portal-overlay=""
			>
				<div
					ref={menuListRef}
					aria-labelledby={triggerId}
					{...({ focusgroup: 'menu nomemory' } as Record<string, string>)}
				>
					<div role="group" aria-labelledby={turnIntoHeadingId}>
						<div id={turnIntoHeadingId} className="rw-tiptap-menu-heading">
							{t('canvas.turnInto', 'Turn into')}
						</div>
						<button
							type="button"
							data-rw-tiptap-block-action="turn-paragraph"
							onClick={() => runMenuAction((b) => turnTopLevelBlockInto(editor, b, 'paragraph'))}
						>
							{t('styles.paragraph', 'Paragraph')}
						</button>
						{allowedHeadings.map((lvl) => (
							<button
								key={lvl}
								type="button"
								data-rw-tiptap-block-action={`turn-h${lvl}`}
								onClick={() =>
									runMenuAction((b) => turnTopLevelBlockInto(editor, b, { heading: lvl }))
								}
							>
								{t('styles.heading', { level: lvl }, `Heading ${lvl}`)}
							</button>
						))}
						<button
							type="button"
							data-rw-tiptap-block-action="turn-bulletList"
							onClick={() => runMenuAction((b) => turnTopLevelBlockInto(editor, b, 'bulletList'))}
						>
							{t('tools.bullist', 'Bullet list')}
						</button>
						<button
							type="button"
							data-rw-tiptap-block-action="turn-orderedList"
							onClick={() => runMenuAction((b) => turnTopLevelBlockInto(editor, b, 'orderedList'))}
						>
							{t('tools.numlist', 'Numbered list')}
						</button>
						{hasTaskList ? (
							<button
								type="button"
								data-rw-tiptap-block-action="turn-taskList"
								onClick={() => runMenuAction((b) => turnTopLevelBlockInto(editor, b, 'taskList'))}
							>
								{t('tools.tasklist', 'Task list')}
							</button>
						) : null}
						<button
							type="button"
							data-rw-tiptap-block-action="turn-blockquote"
							onClick={() => runMenuAction((b) => turnTopLevelBlockInto(editor, b, 'blockquote'))}
						>
							{t('tools.blockquote', 'Blockquote')}
						</button>
						<button
							type="button"
							data-rw-tiptap-block-action="turn-codeBlock"
							onClick={() => runMenuAction((b) => turnTopLevelBlockInto(editor, b, 'codeBlock'))}
						>
							{t('tools.codeblock', 'Code block')}
						</button>
					</div>

					<hr />

					<button
						type="button"
						disabled={!canMoveUp}
						data-rw-tiptap-block-action="move-up"
						onClick={() =>
							runMenuAction((b) => moveTopLevelBlock(editor, b.index, b.index - 1, t, onAnnounce))
						}
					>
						<span>{t('canvas.moveUp', 'Move up')}</span>
						<span className="rw-tiptap-menu-hint">Alt+Shift+↑</span>
					</button>
					<button
						type="button"
						disabled={!canMoveDown}
						data-rw-tiptap-block-action="move-down"
						onClick={() =>
							runMenuAction((b) => moveTopLevelBlock(editor, b.index, b.index + 2, t, onAnnounce))
						}
					>
						<span>{t('canvas.moveDown', 'Move down')}</span>
						<span className="rw-tiptap-menu-hint">Alt+Shift+↓</span>
					</button>
					<button
						type="button"
						data-rw-tiptap-block-action="duplicate"
						onClick={() => runMenuAction(handleDuplicate)}
					>
						<span>{t('canvas.duplicate', 'Duplicate')}</span>
					</button>
					<button
						type="button"
						data-danger="1"
						data-rw-tiptap-block-action="delete"
						onClick={() => runMenuAction(handleDelete)}
					>
						<span>{t('canvas.deleteBlock', 'Delete block')}</span>
					</button>
				</div>
			</div>
		</div>
	);
};
