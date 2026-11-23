import React, { useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Badge, Button, Input, Popover, PopoverContent, PopoverTrigger } from '../../ui';
import { dispatchDomChange } from '../shared';
import type { ReactInputfieldProps } from '../types';

export const DEFAULT_COLOR_SWATCHES = [
	'#eb1d61',
	'#ef4444',
	'#f97316',
	'#f59e0b',
	'#eab308',
	'#22c55e',
	'#10b981',
	'#14b8a6',
	'#06b6d4',
	'#0ea5e9',
	'#3b82f6',
	'#6366f1',
	'#8b5cf6',
	'#ec4899',
	'#111827',
	'#ffffff',
];

const CHECKERBOARD_BG =
	'linear-gradient(45deg, rgba(128,128,128,0.18) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,0.18) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.18) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.18) 75%)';

/**
 * Normalizes a `#rgb`, `#rgba`, `#rrggbb`, or `#rrggbbaa` hex string (with or without leading `#`).
 */
export function normalizeHexColor(raw: string): string {
	const cleaned = raw.trim().replace(/^#/, '');
	if (!/^[0-9a-fA-F]{3,8}$/.test(cleaned)) {
		return '';
	}
	if (cleaned.length === 3 || cleaned.length === 4) {
		return (
			'#' +
			cleaned
				.split('')
				.map((ch) => `${ch}${ch}`)
				.join('')
				.toLowerCase()
		);
	}
	if (cleaned.length === 6 || cleaned.length === 8) {
		return `#${cleaned.toLowerCase()}`;
	}
	return '';
}

/**
 * Parses hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) or `rgb(...)` / `rgba(...)` strings into 6-digit hex + alpha (0..100).
 */
export function parseColorWithAlpha(raw: string): { hex6: string; alpha: number } | null {
	const trimmed = raw.trim();
	if (!trimmed) {
		return null;
	}
	const hex = normalizeHexColor(trimmed);
	if (hex) {
		const hex6 = hex.slice(0, 7);
		if (hex.length === 9) {
			const alphaByte = Number.parseInt(hex.slice(7, 9), 16);
			return { hex6, alpha: Math.round((alphaByte / 255) * 100) };
		}
		return { hex6, alpha: 100 };
	}

	const rgbMatch = trimmed.match(
		/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i,
	);
	if (!rgbMatch) {
		return null;
	}
	const r = Number(rgbMatch[1]);
	const g = Number(rgbMatch[2]);
	const b = Number(rgbMatch[3]);
	if (r > 255 || g > 255 || b > 255) {
		return null;
	}
	const hex6 =
		'#' +
		[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toLowerCase();
	const rawA = rgbMatch[4];
	if (rawA === undefined) {
		return { hex6, alpha: 100 };
	}
	const parsedA = rawA.endsWith('%')
		? Number.parseFloat(rawA.slice(0, -1))
		: Number.parseFloat(rawA) * 100;
	if (!Number.isFinite(parsedA)) {
		return { hex6, alpha: 100 };
	}
	return { hex6, alpha: Math.max(0, Math.min(100, Math.round(parsedA))) };
}

/**
 * Combines a 6-digit hex color and `0..100` opacity into `#rrggbb` or `#rrggbbaa`.
 */
export function rgbaToHex(hex6: string, alphaPercent: number): string {
	const norm = normalizeHexColor(hex6);
	const safeHex6 = norm ? norm.slice(0, 7) : '#eb1d61';
	const clamped = Math.max(0, Math.min(100, Math.round(alphaPercent)));
	if (clamped >= 100) {
		return safeHex6;
	}
	const byte = Math.round((clamped / 100) * 255)
		.toString(16)
		.padStart(2, '0');
	return `${safeHex6}${byte}`;
}

export function ColorField(props: ReactInputfieldProps): React.ReactElement {
	const incoming = props.value === null || props.value === undefined ? '' : String(props.value);
	const [prevIncoming, setPrevIncoming] = useState<string>(incoming);
	const [colorValue, setColorValue] = useState<string>(incoming);
	const [open, setOpen] = useState<boolean>(false);
	const [copied, setCopied] = useState<boolean>(false);
	const inputRef = useRef<HTMLInputElement | null>(null);

	if (incoming !== prevIncoming) {
		setPrevIncoming(incoming);
		if (colorValue !== incoming) {
			setColorValue(incoming);
		}
	}

	const allowAlpha = props.allowAlpha !== false;
	const clearable = props.clearable !== false;
	const locked = Boolean(props.readOnly || props.disabled);
	const hasError = Boolean(props.error && props.error.trim() !== '');

	const swatches = useMemo(
		() =>
			Array.isArray(props.swatches) && props.swatches.length > 0
				? props.swatches
				: DEFAULT_COLOR_SWATCHES,
		[props.swatches],
	);

	const parsed = useMemo(() => parseColorWithAlpha(colorValue), [colorValue]);
	const currentHex6 = parsed?.hex6 ?? '#eb1d61';
	const currentAlpha = parsed?.alpha ?? 100;

	const commitColor = (nextVal: string) => {
		if (locked) {
			return;
		}
		setColorValue(nextVal);
		props.onValueChange?.(props.name, nextVal);
		if (typeof window !== 'undefined') {
			window.requestAnimationFrame(() => dispatchDomChange(inputRef.current));
		}
	};

	const handleCopy = () => {
		if (!colorValue || typeof navigator === 'undefined' || !navigator.clipboard) {
			return;
		}
		void navigator.clipboard.writeText(colorValue).then(() => {
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1400);
		});
	};

	return (
		<div className="flex items-center gap-1.5 min-w-0 max-w-full" data-rw-control="color">
			{props.readOnly && !props.disabled && !props.inlinePortal && props.name ? (
				<input type="hidden" name={props.name} value={colorValue} />
			) : null}

			<Popover
				open={locked ? false : open}
				onOpenChange={(nextOpen) => {
					if (!locked) {
						setOpen(nextOpen);
					}
				}}
			>
				<PopoverTrigger
					render={
						<button
							type="button"
							disabled={props.disabled}
							aria-readonly={props.readOnly || undefined}
							aria-label={t('color.openPicker', 'Open color picker')}
							title={t('color.openPicker', 'Open color picker')}
							data-rw-color-trigger=""
							className={cn(
								'relative size-9 shrink-0 overflow-hidden rounded-md border border-input bg-input-surface shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
								props.readOnly && 'cursor-default opacity-80',
								hasError && 'border-destructive focus-visible:ring-destructive/40',
							)}
							style={{
								backgroundImage: CHECKERBOARD_BG,
								backgroundSize: '10px 10px',
								backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0',
							}}
						>
							{colorValue.trim() !== '' ? (
								<span
									className="absolute inset-0 block"
									style={{ backgroundColor: parsed ? rgbaToHex(parsed.hex6, parsed.alpha) : colorValue }}
								/>
							) : (
								<span className="absolute inset-0 flex items-center justify-center bg-card/60">
									<DynamicIcon name="palette" aria-hidden="true" className="size-4 text-muted-foreground" />
								</span>
							)}
						</button>
					}
				/>
				<PopoverContent align="start" side="bottom" className="w-[272px] max-w-[calc(100vw-1.5rem)] p-3 space-y-3">
					<div className="flex items-center gap-2">
						<input
							type="color"
							aria-label={t('color.pickColor', 'Pick color')}
							value={currentHex6}
							onChange={(e) => {
								const next = allowAlpha ? rgbaToHex(e.target.value, currentAlpha) : e.target.value.toLowerCase();
								commitColor(next);
							}}
							className="size-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
						/>
						<Badge variant="outline" mono className="flex-1 justify-center truncate text-[11px]">
							{colorValue.trim() || t('color.inherit', 'Inherit')}
						</Badge>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							disabled={!colorValue.trim()}
							aria-label={t('common.copy', 'Copy')}
							title={t('common.copy', 'Copy')}
							className="size-7 shrink-0"
							onClick={handleCopy}
						>
							<DynamicIcon name={copied ? 'check' : 'copy'} aria-hidden="true" className="size-3.5" />
						</Button>
					</div>

					{allowAlpha ? (
						<div className="space-y-1">
							<div className="flex items-center justify-between text-[11px] text-muted-foreground">
								<span>{t('color.opacity', 'Opacity')}</span>
								<span className="font-mono tabular-nums">{currentAlpha}%</span>
							</div>
							<input
								type="range"
								aria-label={t('color.opacity', 'Opacity')}
								min={0}
								max={100}
								step={1}
								value={currentAlpha}
								onChange={(e) => {
									const nextAlpha = Number(e.target.value);
									commitColor(rgbaToHex(currentHex6, nextAlpha));
								}}
								className="w-full accent-primary cursor-pointer"
							/>
						</div>
					) : null}

					<div className="grid grid-cols-8 gap-1.5" role="group" aria-label={t('color.palette', 'Color swatches')}>
						{swatches.map((swatch) => {
							const normSwatch = normalizeHexColor(swatch) || swatch.toLowerCase();
							const isSelected = Boolean(parsed && parsed.hex6 === normSwatch.slice(0, 7));
							return (
								<button
									key={swatch}
									type="button"
									aria-label={swatch}
									title={swatch}
									aria-pressed={isSelected}
									onClick={() => {
										const next = allowAlpha && currentAlpha < 100 ? rgbaToHex(normSwatch, currentAlpha) : normSwatch;
										commitColor(next);
									}}
									className={cn(
										'aspect-square w-full rounded border transition-transform hover:scale-105 cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
										isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-popover border-primary' : 'border-border',
									)}
									style={{ backgroundColor: normSwatch }}
								/>
							);
						})}
					</div>

					<div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2">
						{clearable && colorValue.trim() !== '' ? (
							<Button
								type="button"
								variant="ghost"
								size="xs"
								onClick={() => commitColor('')}
							>
								{t('common.clear', 'Clear')}
							</Button>
						) : (
							<span className="text-[11px] text-muted-foreground">{t('color.hexOrCss', 'Hex / CSS color')}</span>
						)}
						<Button type="button" variant="primary" size="xs" onClick={() => setOpen(false)}>
							{t('common.done', 'Done')}
						</Button>
					</div>
				</PopoverContent>
			</Popover>

			<div className="relative flex-1 min-w-0">
				<Input
					ref={inputRef}
					id={props.id}
					name={props.readOnly && !props.disabled ? `${props.name}__ro` : props.name}
					type="text"
					value={colorValue}
					onChange={(e) => {
						const next = e.target.value;
						setColorValue(next);
						props.onValueChange?.(props.name, next);
					}}
					placeholder={props.placeholder || (allowAlpha ? '#eb1d61 / Inherit' : '#eb1d61')}
					readOnly={props.readOnly}
					disabled={props.disabled}
					required={props.required}
					aria-invalid={hasError || undefined}
					aria-describedby={props.describedBy}
					className={cn(
						'font-mono text-xs min-w-0',
						clearable && !locked && colorValue.trim() !== '' && 'pr-7',
						hasError && 'border-destructive focus-visible:ring-destructive/40',
					)}
					{...(props.dataAttributes ?? {})}
				/>
				{clearable && !locked && colorValue.trim() !== '' ? (
					<button
						type="button"
						onClick={() => commitColor('')}
						aria-label={t('common.clear', 'Clear')}
						title={t('common.clear', 'Clear')}
						className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
					>
						<DynamicIcon name="x" aria-hidden="true" className="size-3.5" />
					</button>
				) : null}
			</div>
		</div>
	);
}

export const ColorFieldControl = ColorField;
