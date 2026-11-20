import React, { useEffect, useState } from 'react';
import { SafeLink as Link } from '../lib/inertia-bridge';
import { t } from '../lib/i18n';
import { DynamicIcon, sanitizeHref } from '../lib/utils';
import { Badge } from '../ui';
import type { AppShellRecordHeaderProps } from './types';

export function RecordHeader({
	title,
	subtitle,
	backHref,
	backLabel,
	onBack,
	badges = [],
	dirty,
	dirtyLabel,
	actions,
	showHeadButtonsPortal = true,
}: AppShellRecordHeaderProps): React.ReactElement {
	const [autoDirty, setAutoDirty] = useState(false);

	useEffect(() => {
		if (dirty !== undefined || typeof window === 'undefined') {
			setAutoDirty(false);
			return;
		}
		const onSchemaFormDirty = (ev: Event) => {
			const detail = (ev as CustomEvent<{ isDirty?: boolean }>).detail;
			setAutoDirty(Boolean(detail?.isDirty));
		};
		window.addEventListener('rw:schema-form-dirty', onSchemaFormDirty);
		return () => window.removeEventListener('rw:schema-form-dirty', onSchemaFormDirty);
	}, [dirty]);

	const isDirty = dirty ?? autoDirty;
	const safeBackHref = backHref ? sanitizeHref(backHref) : '';
	const resolvedBackLabel = backLabel || t('common.back', 'Back');
	const backControlClass =
		'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border border-border bg-card px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer';

	return (
		<div data-rw-record-header="" className="w-full scroll-mt-20">
			<div className="flex flex-wrap items-center justify-between gap-3">
				{/* Left Region: Record Identity (Title + Record Type Badge + Dirty Status) */}
				<div data-rw-record-identity="" className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h2
							data-rw-record-title=""
							className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg"
						>
							{title}
						</h2>
						{badges.map((b, idx) => (
							<Badge
								key={`${b.label}-${idx}`}
								variant={b.variant || 'secondary'}
								icon={b.icon}
								dot={b.dot}
								mono={b.mono}
								className="shrink-0 text-[11px]"
							>
								{b.label}
							</Badge>
						))}
						{isDirty ? (
							<Badge
								data-rw-record-status="dirty"
								variant="warning"
								dot
								className="shrink-0 text-[11px]"
							>
								{dirtyLabel || t('form.unsavedChangesTitle', 'Unsaved changes')}
							</Badge>
						) : null}
					</div>
					{subtitle ? (
						<p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
					) : null}
				</div>

				{/* Right Region: Record Actions (Back -> Secondary Actions -> Primary Save Dropdown) */}
				<div data-rw-record-actions="" className="flex shrink-0 flex-wrap items-center gap-2">
					{onBack ? (
						<button
							type="button"
							onClick={onBack}
							data-rw-record-back=""
							className={backControlClass}
						>
							<DynamicIcon name="arrow-left" className="size-3.5" />
							<span>{resolvedBackLabel}</span>
						</button>
					) : safeBackHref ? (
						<Link href={safeBackHref} data-rw-record-back="" className={backControlClass}>
							<DynamicIcon name="arrow-left" className="size-3.5" />
							<span>{resolvedBackLabel}</span>
						</Link>
					) : null}
					{actions}
					{showHeadButtonsPortal ? (
						<div
							data-rw-head-buttons=""
							className="inline-flex items-center gap-2 empty:hidden"
						/>
					) : null}
				</div>
			</div>
		</div>
	);
}

export function isRecordHeaderSpec(val: unknown): val is AppShellRecordHeaderProps {
	return (
		val !== null &&
		typeof val === 'object' &&
		!Array.isArray(val) &&
		!React.isValidElement(val) &&
		'title' in val
	);
}
