import React, { useState } from 'react';
import { DynamicIcon } from '../../lib/utils';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';

export interface CodePreviewProps {
	title: string;
	subtitle?: string;
	badge?: string;
	content?: string;
	code?: string;
	maxHeight?: string;
	onClose?: () => void;
}

export function CodePreview({
	title,
	subtitle,
	badge,
	content,
	code,
	maxHeight = '460px',
	onClose,
}: CodePreviewProps): React.ReactElement {
	const [copied, setCopied] = useState(false);
	const resolvedContent = content ?? code ?? '';

	const handleCopy = () => {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			navigator.clipboard.writeText(resolvedContent).catch(() => {});
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 1600);
	};

	return (
		<Card className="overflow-hidden">
			<div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
				<div className="min-w-0 flex items-center gap-2">
					<DynamicIcon name="file-code-o" className="size-4 text-primary" />
					<span className="truncate text-xs font-semibold text-foreground">{title}</span>
					{subtitle ? (
						<span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">
							({subtitle})
						</span>
					) : null}
					{badge ? <Badge variant="outline" mono>{badge}</Badge> : null}
				</div>
				<div className="flex items-center gap-1.5">
					<Button variant="outline" size="xs" icon={copied ? 'check' : 'copy'} onClick={handleCopy}>
						{copied ? 'Copied' : 'Copy'}
					</Button>
					{onClose ? (
						<Button variant="ghost" size="xs" icon="x" onClick={onClose}>
							Close
						</Button>
					) : null}
				</div>
			</div>
			<pre
				style={{ maxHeight }}
				className="overflow-auto bg-muted/25 p-4 font-mono text-xs leading-relaxed text-foreground"
			>
				<code>{resolvedContent}</code>
			</pre>
		</Card>
	);
}
