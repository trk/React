import React, { useEffect, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { sanitizeSameOriginUrl } from '../../lib/utils';
import { Button } from '../../ui';
import type { ReactInputfieldProps } from '../types';

export function sanitizeSignatureDataUrl(raw: unknown): string {
	if (typeof raw !== 'string') {
		return '';
	}
	const trimmed = raw.trim();
	if (trimmed === '') {
		return '';
	}
	if (/^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
		return trimmed;
	}
	return sanitizeSameOriginUrl(trimmed);
}

export function SignatureField(props: ReactInputfieldProps): React.ReactElement {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [dataUrl, setDataUrl] = useState<string>(() => sanitizeSignatureDataUrl(props.value));
	const isDrawingRef = useRef<boolean>(false);
	const lastEncodedRef = useRef<string>('');

	useEffect(() => {
		const incoming = sanitizeSignatureDataUrl(props.value);
		if (!isDrawingRef.current && incoming !== dataUrl) {
			setDataUrl(incoming);
		}
	}, [props.value]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext('2d');
		if (!canvas || !ctx || isDrawingRef.current) {
			return;
		}
		if (!dataUrl) {
			lastEncodedRef.current = '';
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			return;
		}
		if (dataUrl === lastEncodedRef.current || typeof Image === 'undefined') {
			return;
		}
		let cancelled = false;
		const img = new Image();
		img.onload = () => {
			if (cancelled || isDrawingRef.current) {
				return;
			}
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			lastEncodedRef.current = dataUrl;
		};
		img.src = dataUrl;
		return () => {
			cancelled = true;
		};
	}, [dataUrl]);

	const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return { x: 0, y: 0 };
		}
		const rect = canvas.getBoundingClientRect();
		const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
		const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
		if ('touches' in e && e.touches.length > 0) {
			const firstTouch = e.touches[0];
			if (firstTouch) {
				return {
					x: (firstTouch.clientX - rect.left) * scaleX,
					y: (firstTouch.clientY - rect.top) * scaleY,
				};
			}
		}
		const mouseEvent = e as React.MouseEvent<HTMLCanvasElement>;
		return {
			x: (mouseEvent.clientX - rect.left) * scaleX,
			y: (mouseEvent.clientY - rect.top) * scaleY,
		};
	};

	const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
		if (props.readOnly || props.disabled) {
			return;
		}
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext('2d');
		if (!ctx) {
			return;
		}
		isDrawingRef.current = true;
		const pt = getCanvasPoint(e);
		const computedColor =
			canvas && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
				? window.getComputedStyle(canvas).color
				: '';
		ctx.strokeStyle = computedColor || 'currentColor';
		ctx.lineWidth = 2;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(pt.x, pt.y);
	};

	const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
		if (!isDrawingRef.current || props.readOnly || props.disabled) {
			return;
		}
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext('2d');
		if (!ctx) {
			return;
		}
		const pt = getCanvasPoint(e);
		ctx.lineTo(pt.x, pt.y);
		ctx.stroke();
	};

	const stopDrawing = () => {
		if (!isDrawingRef.current) {
			return;
		}
		isDrawingRef.current = false;
		const canvas = canvasRef.current;
		if (canvas) {
			try {
				const encoded = canvas.toDataURL('image/png');
				lastEncodedRef.current = encoded;
				setDataUrl(encoded);
				props.onValueChange?.(props.name, encoded);
			} catch {
				// Canvas serialization fallback
			}
		}
	};

	const clearSignature = () => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext('2d');
		if (canvas && ctx) {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}
		setDataUrl('');
		props.onValueChange?.(props.name, '');
	};

	return (
		<div className="space-y-2" data-rw-control="signature">
			<input type="hidden" id={props.id} name={props.name} value={dataUrl} />
			<div className="relative overflow-hidden rounded-lg border border-border bg-background text-foreground">
				<canvas
					ref={canvasRef}
					role="img"
					aria-label={props.label || t('form.signaturePad', 'Signature pad')}
					width={480}
					height={140}
					onMouseDown={startDrawing}
					onMouseMove={draw}
					onMouseUp={stopDrawing}
					onMouseLeave={stopDrawing}
					onTouchStart={startDrawing}
					onTouchMove={draw}
					onTouchEnd={stopDrawing}
					className="block h-[140px] w-full cursor-crosshair touch-none"
				/>
				{!props.readOnly && !props.disabled ? (
					<div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
						<span>{t('form.signAboveHint', 'Sign above inside the pad')}</span>
						<Button type="button" variant="ghost" size="xs" onClick={clearSignature}>
							{t('common.clear', 'Clear')}
						</Button>
					</div>
				) : null}
			</div>
		</div>
	);
}
