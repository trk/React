import React, { useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';

export interface CliBoxProps {
	command: string;
	caption?: string;
	label?: string;
	wrap?: boolean;
	className?: string;
}

export function CliBox({ command, caption, label, wrap = false, className }: CliBoxProps): React.ReactElement {
	const [copied, setCopied] = useState(false);
	const resolvedCaption = caption ?? label;

	const handleCopy = () => {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			navigator.clipboard.writeText(command).catch(() => {});
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 1600);
	};

	return (
		<div className={cn('space-y-1', className)}>
			{resolvedCaption ? <div className="text-[11px] font-medium text-muted-foreground">{resolvedCaption}</div> : null}
			<div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/60 px-3 py-1.5 font-mono text-xs text-foreground">
				<code className={cn('select-all', wrap ? 'overflow-visible whitespace-normal break-all' : 'truncate')}>
					{command}
				</code>
				<button
					type="button"
					onClick={handleCopy}
					className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-sans font-medium text-muted-foreground hover:bg-background hover:text-foreground cursor-pointer"
					aria-label={t('common.copyCommand', 'Copy command')}
					title={t('common.copyCommand', 'Copy command')}
				>
					<DynamicIcon name={copied ? 'check' : 'copy'} className="size-3" />
					<span>{copied ? t('common.copied', 'Copied') : t('common.copy', 'Copy')}</span>
				</button>
			</div>
		</div>
	);
}
