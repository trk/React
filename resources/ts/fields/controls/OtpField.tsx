import React, { useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import type { ReactInputfieldProps } from '../types';

export function sanitizeOtpInput(
	raw: unknown,
	mode: 'numeric' | 'alphanumeric' = 'numeric',
	maxLength = 6,
): string {
	const limit = Math.min(12, Math.max(4, Math.round(Number(maxLength) || 6)));
	const str = raw === null || raw === undefined ? '' : String(raw);
	const cleaned =
		mode === 'alphanumeric'
			? str.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
			: str.replace(/[^0-9]/g, '');
	return cleaned.slice(0, limit);
}

export function splitOtpSlots(value: string, length: number): string[] {
	const slots: string[] = [];
	for (let i = 0; i < length; i++) {
		slots.push(value[i] ?? '');
	}
	return slots;
}

export function OtpField(props: ReactInputfieldProps): React.ReactElement {
	const length = useMemo(
		() => Math.min(12, Math.max(4, Math.round(Number(props.otpLength) || 6))),
		[props.otpLength],
	);
	const mode: 'numeric' | 'alphanumeric' = props.otpMode === 'alphanumeric' ? 'alphanumeric' : 'numeric';
	const separatorAfter =
		typeof props.otpSeparatorAfter === 'number' &&
		props.otpSeparatorAfter > 0 &&
		props.otpSeparatorAfter < length
			? Math.round(props.otpSeparatorAfter)
			: 0;

	const incoming = sanitizeOtpInput(props.value, mode, length);
	const [prevIncoming, setPrevIncoming] = useState<string>(incoming);
	const [code, setCode] = useState<string>(incoming);
	const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

	if (incoming !== prevIncoming) {
		setPrevIncoming(incoming);
		if (code !== incoming) {
			setCode(incoming);
		}
	}

	const slots = useMemo(() => splitOtpSlots(code, length), [code, length]);
	const hasError = Boolean(props.error && props.error.trim() !== '');
	const locked = Boolean(props.readOnly || props.disabled);
	const clearable = props.clearable !== false;
	const compactSlots = length > 6;

	const focusSlot = (index: number) => {
		const target = inputRefs.current[Math.max(0, Math.min(length - 1, index))];
		target?.focus();
		target?.select();
	};

	const commitSlots = (nextSlots: string[]) => {
		const nextCode = sanitizeOtpInput(nextSlots.join(''), mode, length);
		setCode(nextCode);
		props.onValueChange?.(props.name, nextCode);
	};

	const handleSlotChange = (index: number, rawInput: string) => {
		if (locked) {
			return;
		}
		const sanitized = sanitizeOtpInput(rawInput, mode, length);
		if (sanitized === '') {
			const nextSlots = [...slots];
			nextSlots[index] = '';
			commitSlots(nextSlots);
			return;
		}

		if (sanitized.length > 1) {
			const nextSlots = [...slots];
			const startAt = sanitized.length >= length ? 0 : index;
			for (let offset = 0; offset < sanitized.length && startAt + offset < length; offset++) {
				nextSlots[startAt + offset] = sanitized[offset] ?? '';
			}
			commitSlots(nextSlots);
			focusSlot(Math.min(length - 1, startAt + sanitized.length));
			return;
		}

		const nextSlots = [...slots];
		nextSlots[index] = sanitized;
		commitSlots(nextSlots);
		if (index + 1 < length) {
			focusSlot(index + 1);
		}
	};

	const handleSlotPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
		if (locked) {
			return;
		}
		const pasted = sanitizeOtpInput(e.clipboardData.getData('text'), mode, length);
		if (pasted === '') {
			return;
		}
		e.preventDefault();
		const nextSlots = [...slots];
		const startAt = pasted.length >= length ? 0 : index;
		for (let offset = 0; offset < pasted.length && startAt + offset < length; offset++) {
			nextSlots[startAt + offset] = pasted[offset] ?? '';
		}
		commitSlots(nextSlots);
		focusSlot(Math.min(length - 1, startAt + pasted.length - 1));
	};

	const handleSlotKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
		if (locked) {
			return;
		}
		if (e.key === 'Backspace') {
			e.preventDefault();
			const nextSlots = [...slots];
			if (nextSlots[index]) {
				nextSlots[index] = '';
				commitSlots(nextSlots);
				return;
			}
			if (index > 0) {
				nextSlots[index - 1] = '';
				commitSlots(nextSlots);
				focusSlot(index - 1);
			}
			return;
		}
		if (e.key === 'Delete') {
			e.preventDefault();
			const nextSlots = [...slots];
			nextSlots[index] = '';
			commitSlots(nextSlots);
			return;
		}
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			if (index > 0) {
				focusSlot(index - 1);
			}
			return;
		}
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			if (index + 1 < length) {
				focusSlot(index + 1);
			}
			return;
		}
		if (e.key === 'Home') {
			e.preventDefault();
			focusSlot(0);
			return;
		}
		if (e.key === 'End') {
			e.preventDefault();
			focusSlot(length - 1);
		}
	};

	return (
		<div className="min-w-0 max-w-full" data-rw-control="otp" data-rw-otp-mode={mode}>
			{props.name && !props.inlinePortal ? (
				<input type="hidden" name={props.name} value={code} />
			) : null}

			<div
				role="group"
				aria-label={props.label || t('otp.verificationCode', 'Verification code')}
				className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 max-w-full"
			>
				{slots.map((digit, idx) => (
					<React.Fragment key={idx}>
						{separatorAfter > 0 && idx === separatorAfter ? (
							<span aria-hidden="true" className="px-0.5 text-sm font-medium text-muted-foreground select-none">
								–
							</span>
						) : null}
						<input
							ref={(el) => {
								inputRefs.current[idx] = el;
							}}
							id={idx === 0 ? props.id : undefined}
							type={props.mask ? 'password' : 'text'}
							data-rw-otp-slot={idx}
							inputMode={mode === 'numeric' ? 'numeric' : 'text'}
							autoComplete={idx === 0 ? 'one-time-code' : 'off'}
							autoCapitalize={mode === 'alphanumeric' ? 'characters' : 'none'}
							spellCheck={false}
							maxLength={length}
							value={digit}
							readOnly={props.readOnly}
							disabled={props.disabled}
							aria-label={t('otp.digitLabel', { position: idx + 1, total: length }, `Character ${idx + 1} of ${length}`)}
							aria-invalid={hasError}
							aria-describedby={props.describedBy}
							onChange={(e) => handleSlotChange(idx, e.target.value)}
							onPaste={(e) => handleSlotPaste(idx, e)}
							onKeyDown={(e) => handleSlotKeyDown(idx, e)}
							onFocus={(e) => e.currentTarget.select()}
							className={cn(
								'rounded-md border border-input bg-input-surface text-center font-mono font-semibold tabular-nums text-foreground shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
								compactSlots ? 'h-9 w-8 sm:h-10 sm:w-9 text-sm' : 'h-10 w-9 sm:h-11 sm:w-10 text-base',
								props.readOnly && 'bg-muted/40 text-muted-foreground',
								hasError && 'border-destructive focus-visible:ring-destructive/40',
							)}
						/>
					</React.Fragment>
				))}

				{clearable && code.length > 0 && !locked ? (
					<button
						type="button"
						aria-label={t('common.clear', 'Clear')}
						onClick={() => {
							setCode('');
							props.onValueChange?.(props.name, '');
							focusSlot(0);
						}}
						className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
					>
						<DynamicIcon name="x" aria-hidden="true" className="size-3.5" />
					</button>
				) : null}
			</div>
		</div>
	);
}

export const OtpFieldControl = OtpField;
