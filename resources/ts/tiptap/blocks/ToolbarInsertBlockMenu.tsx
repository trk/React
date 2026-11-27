/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import type { Editor } from '@tiptap/core';
import { getReactWorkspaceRuntime } from '../../runtime';
import type { TiptapMiniBlockDefinition, TiptapTranslateFn } from '../core/tiptapTypes';
import { insertMiniBlock, MiniBlockIcon } from './MiniBlockExtensions';

const runtime = getReactWorkspaceRuntime();
const { React, Portal, Utils } = runtime;
const { PortalRoot } = Portal;
const { useEffect, useId, useMemo, useRef, useState } = React;

/* ============================================================================
 * Accessible Toolbar `+ Block` Dropdown Menu (`role="menu"` + `<hr>`)
 * ========================================================================== */

export function ToolbarInsertBlockMenu({
	editor,
	miniBlockDefs,
	activeMiniBlocks,
	disabled,
	t,
	onAnnounce,
}: {
	editor: Editor;
	miniBlockDefs?: Record<string, TiptapMiniBlockDefinition>;
	activeMiniBlocks?: string[];
	disabled: boolean;
	t: TiptapTranslateFn;
	onAnnounce?: (msg: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const menuId = useId();
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
		left: '0px',
		top: '0px',
		width: '248px',
	});

	const defsList = useMemo(() => {
		if (!miniBlockDefs || !Array.isArray(activeMiniBlocks)) {
			return [];
		}
		return activeMiniBlocks
			.map((name) => miniBlockDefs[name])
			.filter((d): d is TiptapMiniBlockDefinition => Boolean(d));
	}, [miniBlockDefs, activeMiniBlocks]);

	useEffect(() => {
		if (!open) {
			return;
		}
		const updatePos = () => {
			const btn = triggerRef.current;
			if (!btn) {
				return;
			}
			const rect = btn.getBoundingClientRect();
			const menuW = 248;
			const maxMenuH = 280;
			const vw = window.innerWidth || 1280;
			const vh = window.innerHeight || 800;
			const clampedLeft = Math.max(12, Math.min(rect.left, vw - menuW - 12));
			const spaceBelow = vh - rect.bottom - 12;
			const flipAbove = spaceBelow < 220 && rect.top > spaceBelow;
			if (flipAbove) {
				setMenuStyle({
					left: `${clampedLeft}px`,
					bottom: `${Math.max(12, vh - rect.top + 6)}px`,
					width: `${menuW}px`,
					maxHeight: `${Math.min(maxMenuH, Math.max(120, rect.top - 16))}px`,
				});
			} else {
				setMenuStyle({
					left: `${clampedLeft}px`,
					top: `${rect.bottom + 6}px`,
					width: `${menuW}px`,
					maxHeight: `${Math.min(maxMenuH, Math.max(140, spaceBelow))}px`,
				});
			}
		};
		updatePos();

		const focusFirst = window.requestAnimationFrame(() => {
			const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
			first?.focus();
		});

		const onPointerDown = (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (
				target &&
				!menuRef.current?.contains(target) &&
				!triggerRef.current?.contains(target)
			) {
				setOpen(false);
			}
		};

		const onKeyDown = (e: KeyboardEvent) => {
			if (Utils.shouldIgnoreEscapeEvent(e, menuRef.current)) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			setOpen(false);
			triggerRef.current?.focus();
		};

		window.addEventListener('mousedown', onPointerDown);
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('resize', updatePos);
		window.addEventListener('scroll', updatePos, true);
		return () => {
			window.cancelAnimationFrame(focusFirst);
			window.removeEventListener('mousedown', onPointerDown);
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('resize', updatePos);
			window.removeEventListener('scroll', updatePos, true);
		};
	}, [open]);

	if (defsList.length === 0) {
		return null;
	}

	const builtIns = defsList.filter((d) => d.kind === 'builtin');
	const customs = defsList.filter((d) => d.kind === 'custom');

	const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		const items = Array.from(
			menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []
		);
		if (items.length === 0) {
			return;
		}
		const currentIdx = items.indexOf(document.activeElement as HTMLElement);

		if (e.nativeEvent.isComposing || e.keyCode === 229) {
			return;
		}
		if (e.key === 'Escape') {
			if (Utils.shouldIgnoreEscapeEvent(e.nativeEvent, menuRef.current)) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			setOpen(false);
			triggerRef.current?.focus();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			items[(currentIdx + 1) % items.length]?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			items[(currentIdx - 1 + items.length) % items.length]?.focus();
		} else if (e.key === 'Home') {
			e.preventDefault();
			items[0]?.focus();
		} else if (e.key === 'End') {
			e.preventDefault();
			items[items.length - 1]?.focus();
		}
	};

	const renderMenuItem = (def: TiptapMiniBlockDefinition) => (
		<button
			key={def.name}
			type="button"
			role="menuitem"
			onClick={() => {
				setOpen(false);
				insertMiniBlock(editor, def, undefined, t);
				onAnnounce?.(
					t('status.miniBlockInserted', { block: def.label }, '{block} inserted')
				);
			}}
			className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs text-popover-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
		>
			<span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground">
				<MiniBlockIcon name={def.icon || def.name} className="size-3.5" />
			</span>
			<span className="min-w-0 flex-1 truncate font-medium">{def.label}</span>
		</button>
	);

	const insertLabel = t('tools.insertblock', 'Insert block');
	const dropdownNode = open ? (
		<div
			id={menuId}
			ref={menuRef}
			role="menu"
			aria-label={insertLabel}
			onKeyDown={handleMenuKeyDown}
			style={menuStyle}
			className="fixed z-50 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
			data-rw-tiptap-block-menu=""
			data-rw-portal-overlay=""
		>
			{builtIns.map(renderMenuItem)}
			{builtIns.length > 0 && customs.length > 0 ? (
				<hr role="presentation" className="my-1 border-border/70" />
			) : null}
			{customs.map(renderMenuItem)}
		</div>
	) : null;

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				aria-label={insertLabel}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				aria-disabled={disabled ? 'true' : undefined}
				title={insertLabel}
				data-rw-tiptap-tool="insertblock"
				onClick={() => {
					if (disabled) {
						return;
					}
					setOpen((prev) => !prev);
				}}
			>
				<MiniBlockIcon name="insertblock" />
				<span className="hidden sm:inline text-[11px]">{t('tools.blockShort', 'Block')}</span>
			</button>

			{dropdownNode ? (
				<PortalRoot anchor={triggerRef.current} ssrFallback={false}>
					{dropdownNode}
				</PortalRoot>
			) : null}
		</>
	);
}
