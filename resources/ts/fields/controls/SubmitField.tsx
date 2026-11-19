import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../../lib/utils';
import { Button } from '../../ui';
import type { InputfieldSubmitDropdownItem, ReactInputfieldProps } from '../types';

export function SubmitField(props: ReactInputfieldProps): React.ReactElement {
	const sub = props.submit;
	const buttonValue = sub?.value ?? (typeof props.value === 'string' ? props.value : 'Submit');
	const buttonLabel = sub?.label || buttonValue || 'Submit';
	const dropdownItems = sub?.dropdownItems ?? [];
	const hasDropdown = dropdownItems.length > 0;

	const [menuOpen, setMenuOpen] = useState(false);
	const [coords, setCoords] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
	const [dropdownValue, setDropdownValue] = useState('');
	const [activeSubmitValue, setActiveSubmitValue] = useState(buttonValue);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const dropdownSubmittingRef = useRef(false);
	const rawMenuId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
	const menuId = `${props.id || 'rw_submit'}_menu_${rawMenuId}`;

	const updateMenuPosition = () => {
		const anchorEl = rootRef.current;
		const menuEl = menuRef.current;
		if (!anchorEl || !menuEl || typeof window === 'undefined') {
			return;
		}
		const rect = anchorEl.getBoundingClientRect();
		const menuWidth = menuEl.offsetWidth || 200;
		const menuHeight = menuEl.offsetHeight || 160;
		const viewportW = window.innerWidth;
		const viewportH = window.innerHeight;
		const margin = 8;
		const gap = 4;

		const spaceBelow = viewportH - rect.bottom - margin;
		const spaceAbove = rect.top - margin;
		const flipUp = spaceBelow < menuHeight + gap && spaceAbove > spaceBelow;

		const rawTop = flipUp ? rect.top - menuHeight - gap : rect.bottom + gap;
		const top = Math.max(margin, Math.min(rawTop, viewportH - menuHeight - margin));
		const left = Math.max(margin, Math.min(rect.left, viewportW - menuWidth - margin));

		setCoords({ top, left });
	};

	useLayoutEffect(() => {
		if (!menuOpen || typeof document === 'undefined') {
			return;
		}
		updateMenuPosition();
		const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
		firstItem?.focus({ preventScroll: true });
	}, [menuOpen, dropdownItems.length]);

	useEffect(() => {
		if (!menuOpen || typeof document === 'undefined') {
			return;
		}
		const handlePointerDown = (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (target && !rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
				setMenuOpen(false);
			}
		};
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				setMenuOpen(false);
				triggerRef.current?.focus({ preventScroll: true });
			}
		};
		const handleScrollOrResize = () => {
			updateMenuPosition();
		};
		document.addEventListener('mousedown', handlePointerDown);
		document.addEventListener('keydown', handleKeyDown);
		window.addEventListener('resize', handleScrollOrResize);
		window.addEventListener('scroll', handleScrollOrResize, true);
		return () => {
			document.removeEventListener('mousedown', handlePointerDown);
			document.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('resize', handleScrollOrResize);
			window.removeEventListener('scroll', handleScrollOrResize, true);
		};
	}, [menuOpen]);

	const resetDropdownAction = () => {
		dropdownSubmittingRef.current = false;
		setDropdownValue('');
		setActiveSubmitValue(buttonValue);
	};

	const triggerDropdownAction = (item: InputfieldSubmitDropdownItem) => {
		setMenuOpen(false);
		if (item.type === 'link' && item.value) {
			const safeHref = sanitizeHref(item.value);
			if (safeHref) {
				window.location.href = safeHref;
			}
			return;
		}
		dropdownSubmittingRef.current = true;
		setDropdownValue(item.value);
		if (sub?.dropdownSubmit !== false) {
			setActiveSubmitValue(item.value);
		}
		window.requestAnimationFrame(() => {
			const btn = buttonRef.current;
			const targetForm =
				btn?.form ||
				(props.formId && typeof document !== 'undefined'
					? (document.getElementById(props.formId) as HTMLFormElement | null)
					: null);
			if (!targetForm) {
				resetDropdownAction();
				return;
			}
			const handleFormSubmit = (ev: Event) => {
				window.queueMicrotask(() => {
					dropdownSubmittingRef.current = false;
					if (ev.defaultPrevented) {
						setDropdownValue('');
						setActiveSubmitValue(buttonValue);
					}
				});
			};
			targetForm.addEventListener('submit', handleFormSubmit, { once: true });
			if (typeof targetForm.requestSubmit === 'function') {
				targetForm.requestSubmit(btn || undefined);
			} else {
				targetForm.submit();
			}
		});
	};

	return (
		<div ref={rootRef} className="relative inline-flex items-center" data-rw-control="submit">
			{hasDropdown ? (
				<input
					type="hidden"
					form={props.formId || undefined}
					name={sub?.dropdownInputName || '_action_value'}
					id={`${props.id}_dropdown_value`}
					value={dropdownValue}
				/>
			) : null}

			<div className="inline-flex items-center">
				<Button
					ref={buttonRef}
					id={props.id}
					name={props.name}
					form={props.formId || undefined}
					type={(sub?.type as 'submit' | 'button' | 'reset') || 'submit'}
					value={activeSubmitValue}
					onClick={() => {
						if (!dropdownSubmittingRef.current && (dropdownValue !== '' || activeSubmitValue !== buttonValue)) {
							resetDropdownAction();
						}
					}}
					variant={sub?.danger ? 'destructive' : sub?.secondary ? 'outline' : 'default'}
					size={sub?.small ? 'sm' : 'default'}
					icon={sub?.icon || undefined}
					disabled={props.disabled}
					className={cn(
						hasDropdown && 'rounded-r-none',
						sub?.header && 'pw-head-button'
					)}
				>
					<span>{buttonLabel}</span>
				</Button>

				{hasDropdown ? (
					<Button
						ref={triggerRef}
						type="button"
						variant={sub?.danger ? 'destructive' : sub?.secondary ? 'outline' : 'default'}
						size={sub?.small ? 'sm' : 'default'}
						disabled={props.disabled}
						aria-haspopup="menu"
						aria-expanded={menuOpen}
						aria-controls={menuOpen ? menuId : undefined}
						onClick={() => setMenuOpen((prev) => !prev)}
						aria-label={t('form.moreSubmitActions', 'More submit actions')}
						className="rounded-l-none border-l border-primary-foreground/20 px-2"
					>
						<DynamicIcon name="chevron-down" className="size-3.5" aria-hidden="true" />
					</Button>
				) : null}
			</div>

			{hasDropdown && menuOpen && typeof document !== 'undefined'
				? createPortal(
						<div
							id={menuId}
							ref={menuRef}
							role="menu"
							aria-orientation="vertical"
							aria-label={t('form.moreSubmitActions', 'More submit actions')}
							style={{ position: 'fixed', top: `${coords.top}px`, left: `${coords.left}px` }}
							onKeyDown={(e) => {
								const items = Array.from(
									menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
								);
								if (items.length === 0) {
									return;
								}
								const cur = items.indexOf(document.activeElement as HTMLElement);
								if (e.key === 'ArrowDown') {
									e.preventDefault();
									items[(cur + 1) % items.length]?.focus({ preventScroll: true });
								} else if (e.key === 'ArrowUp') {
									e.preventDefault();
									items[(cur - 1 + items.length) % items.length]?.focus({ preventScroll: true });
								} else if (e.key === 'Home') {
									e.preventDefault();
									items[0]?.focus({ preventScroll: true });
								} else if (e.key === 'End') {
									e.preventDefault();
									items[items.length - 1]?.focus({ preventScroll: true });
								}
							}}
							className="z-50 min-w-[200px] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
						>
							{dropdownItems.map((item, idx) => (
								<button
									key={`${item.value}_${idx}`}
									type="button"
									role="menuitem"
									onClick={() => triggerDropdownAction(item)}
									className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-popover-foreground hover:bg-muted focus:bg-muted focus:outline-none cursor-pointer"
								>
									{item.icon ? <DynamicIcon name={item.icon} className="size-3.5 text-muted-foreground" aria-hidden="true" /> : null}
									<span>{item.label}</span>
								</button>
							))}
						</div>,
						document.body
					)
				: null}
		</div>
	);
}
