import React from 'react';
import { t } from '../lib/i18n';
import { sanitizeHref } from '../lib/utils';
import { Alert, Button } from '../ui';
import type { ActionFeedbackDto } from './types';

const DISALLOWED_NOTICE_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input']);

function convertNoticeDomNode(node: ChildNode, key: string): React.ReactNode {
	if (node.nodeType === 3) {
		return node.textContent;
	}
	if (node.nodeType !== 1) {
		return null;
	}

	const el = node as Element;
	const tag = el.tagName.toLowerCase();
	if (DISALLOWED_NOTICE_TAGS.has(tag)) {
		return null;
	}

	const children = Array.from(el.childNodes).map((child, idx) =>
		convertNoticeDomNode(child, `${key}-${idx}`)
	);

	switch (tag) {
		case 'br':
			return <br key={key} />;
		case 'u':
			return (
				<code
					key={key}
					className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground underline decoration-foreground/30 underline-offset-2"
				>
					{children}
				</code>
			);
		case 'code':
			return (
				<code
					key={key}
					className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground"
				>
					{children}
				</code>
			);
		case 'pre':
			return (
				<pre
					key={key}
					className="my-1.5 overflow-x-auto rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5 font-mono text-xs text-foreground"
				>
					{children}
				</pre>
			);
		case 'span': {
			const inlineStyle = (el.getAttribute('style') || '').toLowerCase();
			if (inlineStyle.includes('monospace')) {
				return (
					<code
						key={key}
						className="my-1 inline-block rounded-md border border-border/60 bg-background/80 px-2.5 py-1 font-mono text-xs font-medium text-foreground"
					>
						{children}
					</code>
				);
			}
			return <span key={key}>{children}</span>;
		}
		case 'small':
			return (
				<span key={key} className="mt-0.5 block text-xs leading-relaxed opacity-85">
					{children}
				</span>
			);
		case 'div':
		case 'p':
			return (
				<div key={key} className="mt-1 leading-relaxed">
					{children}
				</div>
			);
		case 'strong':
		case 'b':
			return (
				<strong key={key} className="font-semibold">
					{children}
				</strong>
			);
		case 'em':
		case 'i':
			return (
				<em key={key} className="italic">
					{children}
				</em>
			);
		case 'ul':
			return (
				<ul key={key} className="my-1 list-disc space-y-0.5 pl-4">
					{children}
				</ul>
			);
		case 'ol':
			return (
				<ol key={key} className="my-1 list-decimal space-y-0.5 pl-4">
					{children}
				</ol>
			);
		case 'li':
			return <li key={key}>{children}</li>;
		case 'a': {
			const safeHref = sanitizeHref(el.getAttribute('href'));
			if (!safeHref) {
				return <span key={key}>{children}</span>;
			}
			const isBlank = el.getAttribute('target') === '_blank';
			return (
				<a
					key={key}
					href={safeHref}
					target={isBlank ? '_blank' : undefined}
					rel={isBlank ? 'noopener noreferrer' : undefined}
					className="font-medium underline underline-offset-2 hover:opacity-80"
				>
					{children}
				</a>
			);
		}
		default:
			return <React.Fragment key={key}>{children}</React.Fragment>;
	}
}

export function renderNoticeMarkup(raw: string): React.ReactNode {
	if (!raw || typeof DOMParser === 'undefined' || !/[<>&#]/.test(raw)) {
		return raw;
	}
	try {
		const doc = new DOMParser().parseFromString(raw, 'text/html');
		return Array.from(doc.body.childNodes).map((node, index) =>
			convertNoticeDomNode(node, `notice-${index}`)
		);
	} catch {
		return raw;
	}
}

export interface WorkspaceFlashNoticesProps {
	activeFeedback?: ActionFeedbackDto | null;
	onDismissFeedback: () => void;
	flash?: {
		messages?: string[];
		warnings?: string[];
		errors?: string[];
	};
	dismissedFlash: {
		errors: boolean;
		warnings: boolean;
		messages: boolean;
	};
	onDismissFlash: (bucket: 'errors' | 'warnings' | 'messages') => void;
}

export function WorkspaceFlashNotices({
	activeFeedback,
	onDismissFeedback,
	flash,
	dismissedFlash,
	onDismissFlash,
}: WorkspaceFlashNoticesProps): React.ReactElement {
	return (
		<>
			{activeFeedback ? (
				<Alert variant={activeFeedback.type} title={activeFeedback.title} className="shadow-xs">
					<div className="space-y-2">
						<div className="flex items-start justify-between gap-4">
							<p>{activeFeedback.message}</p>
							<Button variant="ghost" size="xs" icon="x" onClick={onDismissFeedback}>
								{t('common.dismiss', 'Dismiss')}
							</Button>
						</div>
						{activeFeedback.output ? (
							<pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-background/90 p-3 font-mono text-[11px] leading-relaxed text-foreground">
								<code>{activeFeedback.output}</code>
							</pre>
						) : null}
					</div>
				</Alert>
			) : null}

			{!dismissedFlash.errors && flash?.errors && flash.errors.length > 0 ? (
				<Alert variant="danger" title={t('common.error', 'Error')}>
					<div className="flex items-start justify-between gap-4">
						<ul className="list-disc pl-4 space-y-1.5 flex-1 min-w-0">
							{flash.errors.map((err, i) => (
								<li key={i} className="leading-relaxed">
									{renderNoticeMarkup(err)}
								</li>
							))}
						</ul>
						<Button
							variant="ghost"
							size="xs"
							icon="x"
							onClick={() => onDismissFlash('errors')}
							aria-label={t('shell.dismissErrors', 'Dismiss errors')}
							title={t('shell.dismissErrors', 'Dismiss errors')}
						/>
					</div>
				</Alert>
			) : null}

			{!dismissedFlash.warnings && flash?.warnings && flash.warnings.length > 0 ? (
				<Alert variant="warning" title={t('common.warning', 'Warning')}>
					<div className="flex items-start justify-between gap-4">
						<ul className="list-disc pl-4 space-y-1.5 flex-1 min-w-0">
							{flash.warnings.map((warn, i) => (
								<li key={i} className="leading-relaxed">
									{renderNoticeMarkup(warn)}
								</li>
							))}
						</ul>
						<Button
							variant="ghost"
							size="xs"
							icon="x"
							onClick={() => onDismissFlash('warnings')}
							aria-label={t('shell.dismissWarnings', 'Dismiss warnings')}
							title={t('shell.dismissWarnings', 'Dismiss warnings')}
						/>
					</div>
				</Alert>
			) : null}

			{!dismissedFlash.messages && flash?.messages && flash.messages.length > 0 ? (
				<Alert variant="primary" title={t('common.notice', 'Notice')}>
					<div className="flex items-start justify-between gap-4">
						<ul className="list-disc pl-4 space-y-1.5 flex-1 min-w-0">
							{flash.messages.map((msg, i) => (
								<li key={i} className="leading-relaxed">
									{renderNoticeMarkup(msg)}
								</li>
							))}
						</ul>
						<Button
							variant="ghost"
							size="xs"
							icon="x"
							onClick={() => onDismissFlash('messages')}
							aria-label={t('shell.dismissNotices', 'Dismiss notices')}
							title={t('shell.dismissNotices', 'Dismiss notices')}
						/>
					</div>
				</Alert>
			) : null}
		</>
	);
}
