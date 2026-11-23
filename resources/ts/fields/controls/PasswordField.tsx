import React, { useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Button, Input } from '../../ui';
import type { ReactInputfieldProps } from '../types';

export interface PasswordPolicy {
	minLength?: number;
	requireUppercase?: boolean;
	requireLowercase?: boolean;
	requireNumber?: boolean;
	requireSymbol?: boolean;
}

export interface PasswordCheckItem {
	key: 'minLength' | 'uppercase' | 'lowercase' | 'number' | 'symbol';
	label: string;
	met: boolean;
}

export interface PasswordStrengthReport {
	score: 0 | 1 | 2 | 3 | 4;
	label: 'Empty' | 'Weak' | 'Fair' | 'Good' | 'Strong';
	checks: PasswordCheckItem[];
	allMet: boolean;
}

export function evaluatePasswordStrength(
	value: string,
	policy: PasswordPolicy = {},
): PasswordStrengthReport {
	const minLen = Math.max(4, Number(policy.minLength) || 8);
	const reqUpper = policy.requireUppercase !== false;
	const reqLower = policy.requireLowercase !== false;
	const reqNum = policy.requireNumber !== false;
	const reqSymbol = Boolean(policy.requireSymbol);

	const checks: PasswordCheckItem[] = [
		{
			key: 'minLength',
			label: t('password.minLength', { min: minLen }, `At least ${minLen} characters`),
			met: value.length >= minLen,
		},
	];
	if (reqUpper) {
		checks.push({
			key: 'uppercase',
			label: t('password.uppercase', 'Uppercase letter (A-Z)'),
			met: /[A-Z]/.test(value),
		});
	}
	if (reqLower) {
		checks.push({
			key: 'lowercase',
			label: t('password.lowercase', 'Lowercase letter (a-z)'),
			met: /[a-z]/.test(value),
		});
	}
	if (reqNum) {
		checks.push({
			key: 'number',
			label: t('password.number', 'Number (0-9)'),
			met: /[0-9]/.test(value),
		});
	}
	if (reqSymbol) {
		checks.push({
			key: 'symbol',
			label: t('password.symbol', 'Symbol (!@#$…)'),
			met: /[^A-Za-z0-9]/.test(value),
		});
	}

	const allMet = checks.every((item) => item.met);
	if (value.length === 0) {
		return { score: 0, label: 'Empty', checks, allMet: false };
	}

	let points = 0;
	if (value.length >= minLen) points += 1;
	if (value.length >= Math.max(12, minLen + 4)) points += 1;
	if (/[A-Z]/.test(value) && /[a-z]/.test(value)) points += 1;
	if (/[0-9]/.test(value)) points += 0.5;
	if (/[^A-Za-z0-9]/.test(value)) points += 0.5;

	const rounded = Math.min(4, Math.max(1, Math.round(points))) as 1 | 2 | 3 | 4;
	const score: 0 | 1 | 2 | 3 | 4 = allMet ? (rounded >= 4 ? 4 : Math.max(3, rounded) as 3 | 4) : (Math.min(2, rounded) as 1 | 2);
	const labels: Record<1 | 2 | 3 | 4, 'Weak' | 'Fair' | 'Good' | 'Strong'> = {
		1: 'Weak',
		2: 'Fair',
		3: 'Good',
		4: 'Strong',
	};

	return {
		score,
		label: labels[score],
		checks,
		allMet,
	};
}

function secureRandomIndex(max: number): number {
	if (max <= 1) {
		return 0;
	}
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		const buf = new Uint32Array(1);
		crypto.getRandomValues(buf);
		return (buf[0] ?? 0) % max;
	}
	return Math.floor(Math.random() * max);
}

export function generateStrongPassword(length = 16): string {
	const targetLen = Math.min(64, Math.max(12, Math.round(length)));
	const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
	const lower = 'abcdefghijkmnopqrstuvwxyz';
	const digits = '23456789';
	const symbols = '!@#$%^&*-_+=';
	const combined = upper + lower + digits + symbols;

	const chars = [
		upper[secureRandomIndex(upper.length)] ?? 'A',
		lower[secureRandomIndex(lower.length)] ?? 'a',
		digits[secureRandomIndex(digits.length)] ?? '7',
		symbols[secureRandomIndex(symbols.length)] ?? '!',
	];
	while (chars.length < targetLen) {
		chars.push(combined[secureRandomIndex(combined.length)] ?? 'x');
	}
	for (let i = chars.length - 1; i > 0; i--) {
		const swapIdx = secureRandomIndex(i + 1);
		const tmp = chars[i] ?? '';
		chars[i] = chars[swapIdx] ?? '';
		chars[swapIdx] = tmp;
	}
	return chars.join('');
}

const STRENGTH_BAR_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
	0: 'bg-muted',
	1: 'bg-destructive',
	2: 'bg-warning',
	3: 'bg-primary',
	4: 'bg-success',
};

const STRENGTH_TEXT_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
	0: 'text-muted-foreground',
	1: 'text-destructive',
	2: 'text-warning',
	3: 'text-primary',
	4: 'text-success',
};

export function PasswordField(props: ReactInputfieldProps): React.ReactElement {
	const incoming = props.value === null || props.value === undefined ? '' : String(props.value);
	const [prevIncoming, setPrevIncoming] = useState<string>(incoming);
	const [val, setVal] = useState<string>(incoming);
	const [confirmVal, setConfirmVal] = useState<string>('');
	const [revealed, setRevealed] = useState<boolean>(false);
	const [confirmRevealed, setConfirmRevealed] = useState<boolean>(false);
	const [copied, setCopied] = useState<boolean>(false);

	if (incoming !== prevIncoming) {
		setPrevIncoming(incoming);
		if (val !== incoming) {
			setVal(incoming);
		}
	}

	const hasError = Boolean(props.error && props.error.trim() !== '');
	const locked = Boolean(props.readOnly || props.disabled);
	const showStrength = props.showStrength !== false;
	const showRequirements = props.showRequirements !== false;
	const policy = useMemo<PasswordPolicy>(
		() => ({
			minLength: props.minLength && props.minLength > 0 ? props.minLength : 8,
			requireUppercase: props.requireUppercase,
			requireLowercase: props.requireLowercase,
			requireNumber: props.requireNumber,
			requireSymbol: props.requireSymbol,
		}),
		[props.minLength, props.requireUppercase, props.requireLowercase, props.requireNumber, props.requireSymbol],
	);
	const report = useMemo(() => evaluatePasswordStrength(val, policy), [val, policy]);

	const hasMismatch = Boolean(props.confirmPassword && confirmVal.length > 0 && confirmVal !== val);
	const isMatched = Boolean(props.confirmPassword && val.length > 0 && confirmVal === val);

	const handleCopy = () => {
		if (val === '' || typeof navigator === 'undefined' || !navigator.clipboard) {
			return;
		}
		navigator.clipboard.writeText(val).catch(() => {});
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1500);
	};

	const handleGenerate = () => {
		if (locked) {
			return;
		}
		const generated = generateStrongPassword(Math.max(16, policy.minLength || 12));
		setVal(generated);
		if (props.confirmPassword) {
			setConfirmVal(generated);
		}
		setRevealed(true);
		props.onValueChange?.(props.name, generated);
	};

	return (
		<div className="min-w-0 max-w-full space-y-2" data-rw-control="password" data-rw-password-mismatch={hasMismatch ? '1' : '0'}>
			<div className="flex flex-wrap items-center gap-1.5 min-w-0">
				<div className="min-w-0 flex-1">
					<Input
						id={props.id}
						name={props.inlinePortal ? undefined : props.name}
						type={revealed ? 'text' : 'password'}
						autoComplete={props.autoComplete || 'new-password'}
						value={val}
						placeholder={props.placeholder || undefined}
						readOnly={props.readOnly}
						disabled={props.disabled}
						required={props.required}
						aria-invalid={hasError || hasMismatch}
						aria-describedby={props.describedBy}
						onChange={(e) => {
							const next = e.target.value;
							setVal(next);
							props.onValueChange?.(props.name, next);
						}}
						className={cn(
							'font-mono text-sm',
							props.readOnly && 'bg-muted/40 text-muted-foreground',
							(hasError || hasMismatch) && 'border-destructive',
						)}
					/>
				</div>

				<div className="inline-flex items-center gap-1 shrink-0">
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-rw-password-toggle=""
						disabled={props.disabled}
						aria-label={revealed ? t('password.hide', 'Hide password') : t('password.reveal', 'Reveal password')}
						title={revealed ? t('password.hide', 'Hide password') : t('password.reveal', 'Reveal password')}
						onClick={() => setRevealed((prev) => !prev)}
						className="h-9 px-2.5"
					>
						<DynamicIcon name={revealed ? 'eye-off' : 'eye'} aria-hidden="true" className="size-3.5" />
					</Button>

					{val.length > 0 ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							aria-label={t('common.copy', 'Copy')}
							title={t('common.copy', 'Copy')}
							onClick={handleCopy}
							className="h-9 px-2.5"
						>
							<DynamicIcon name={copied ? 'check' : 'copy'} aria-hidden="true" className="size-3.5" />
						</Button>
					) : null}

					{props.allowGenerate && !locked ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							data-rw-password-generate=""
							onClick={handleGenerate}
							aria-label={t('password.generate', 'Generate password')}
							title={t('password.generate', 'Generate password')}
							className="h-9 px-2.5"
						>
							<DynamicIcon name="refresh" aria-hidden="true" className="size-3.5" />
							<span className="hidden sm:inline text-xs">{t('form.generate', 'Generate')}</span>
						</Button>
					) : null}
				</div>
			</div>

			{showStrength ? (
				<div className="space-y-1">
					<div className="flex items-center justify-between gap-2 text-[11px]">
						<span className="text-muted-foreground">{t('password.strength', 'Strength')}</span>
						<span data-rw-password-strength-label="" className={cn('font-semibold', STRENGTH_TEXT_CLASSES[report.score])}>
							{report.label}
						</span>
					</div>
					<div className="grid grid-cols-4 gap-1" aria-hidden="true">
						{[1, 2, 3, 4].map((step) => (
							<span
								key={step}
								className={cn(
									'h-1.5 rounded-full transition-colors',
									report.score >= step ? STRENGTH_BAR_CLASSES[report.score] : 'bg-muted',
								)}
							/>
						))}
					</div>
				</div>
			) : null}

			{showRequirements ? (
				<ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
					{report.checks.map((item) => (
						<li
							key={item.key}
							className={cn(
								'flex items-center gap-1.5 min-w-0',
								item.met ? 'text-success' : 'text-muted-foreground',
							)}
						>
							<DynamicIcon
								name={item.met ? 'check' : 'circle-dot'}
								aria-hidden="true"
								className="size-3 shrink-0"
							/>
							<span className="truncate">{item.label}</span>
						</li>
					))}
				</ul>
			) : null}

			{props.confirmPassword ? (
				<div className="space-y-1.5 pt-1">
					<label
						htmlFor={props.id ? `${props.id}_confirm` : undefined}
						className="block text-[11px] font-medium text-muted-foreground"
					>
						{t('password.confirm', 'Confirm Password')}
					</label>
					<div className="flex items-center gap-1.5 min-w-0">
						<Input
							id={props.id ? `${props.id}_confirm` : undefined}
							type={confirmRevealed ? 'text' : 'password'}
							autoComplete={props.autoComplete || 'new-password'}
							value={confirmVal}
							placeholder={t('password.confirmPlaceholder', 'Re-enter password')}
							readOnly={props.readOnly}
							disabled={props.disabled}
							aria-invalid={hasMismatch}
							onChange={(e) => setConfirmVal(e.target.value)}
							className={cn(
								'font-mono text-sm',
								props.readOnly && 'bg-muted/40 text-muted-foreground',
								hasMismatch && 'border-destructive',
							)}
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={props.disabled}
							aria-label={confirmRevealed ? t('password.hide', 'Hide password') : t('password.reveal', 'Reveal password')}
							onClick={() => setConfirmRevealed((prev) => !prev)}
							className="h-9 px-2.5 shrink-0"
						>
							<DynamicIcon name={confirmRevealed ? 'eye-off' : 'eye'} aria-hidden="true" className="size-3.5" />
						</Button>
					</div>
					{hasMismatch ? (
						<p className="text-[11px] font-medium text-destructive">
							{t('password.mismatch', 'Passwords do not match.')}
						</p>
					) : isMatched ? (
						<p className="text-[11px] font-medium text-success">
							{t('password.matched', 'Passwords match.')}
						</p>
					) : null}
				</div>
			) : null}
		</div>
	);
}

export const PasswordFieldControl = PasswordField;
