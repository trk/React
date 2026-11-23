import React, { useMemo, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon, sanitizeHref } from '../../lib/utils';
import { Textarea } from '../../ui';
import type { ReactInputfieldProps } from '../types';

type MarkdownMode = 'write' | 'preview' | 'split';

const INLINE_TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g;

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
	const parts = text.split(INLINE_TOKEN_RE);
	return parts.map((segment, index) => {
		const key = `${keyPrefix}-${index}`;
		if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
			return (
				<strong key={key} className="font-semibold text-foreground">
					{segment.slice(2, -2)}
				</strong>
			);
		}
		if (segment.startsWith('*') && segment.endsWith('*') && segment.length > 2) {
			return (
				<em key={key} className="italic">
					{segment.slice(1, -1)}
				</em>
			);
		}
		if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
			return (
				<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
					{segment.slice(1, -1)}
				</code>
			);
		}
		if (segment.startsWith('~~') && segment.endsWith('~~') && segment.length > 4) {
			return (
				<del key={key} className="line-through text-muted-foreground">
					{segment.slice(2, -2)}
				</del>
			);
		}
		const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(segment);
		if (linkMatch) {
			const label = linkMatch[1] ?? '';
			const safeHref = sanitizeHref(linkMatch[2] ?? '');
			if (safeHref === '') {
				return <span key={key}>{label}</span>;
			}
			const isExternal = /^https?:\/\//i.test(safeHref);
			return (
				<a
					key={key}
					href={safeHref}
					target={isExternal ? '_blank' : undefined}
					rel={isExternal ? 'noopener noreferrer' : undefined}
					className="font-medium text-primary underline underline-offset-2 hover:opacity-85"
				>
					{label}
				</a>
			);
		}
		return segment;
	});
}

export function renderMarkdownNodes(markdown: string): React.ReactNode[] {
	const normalized = markdown.replace(/\r\n?/g, '\n');
	if (normalized.trim() === '') {
		return [];
	}

	const lines = normalized.split('\n');
	const nodes: React.ReactNode[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i] ?? '';
		const trimmed = line.trim();

		if (trimmed === '') {
			i += 1;
			continue;
		}

		// Fenced code block
		if (trimmed.startsWith('```')) {
			const lang = trimmed.slice(3).trim();
			const codeLines: string[] = [];
			i += 1;
			while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) {
				codeLines.push(lines[i] ?? '');
				i += 1;
			}
			if (i < lines.length && (lines[i] ?? '').trim().startsWith('```')) {
				i += 1;
			}
			nodes.push(
				<pre
					key={`code-${nodes.length}`}
					data-lang={lang || undefined}
					className="my-2 overflow-x-auto rounded-md border border-border bg-muted/60 p-2.5 font-mono text-xs leading-relaxed text-foreground"
				>
					<code>{codeLines.join('\n')}</code>
				</pre>,
			);
			continue;
		}

		// Horizontal rule
		if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
			nodes.push(<hr key={`hr-${nodes.length}`} className="my-3 border-border" />);
			i += 1;
			continue;
		}

		// Headings (# - ####)
		const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
		if (headingMatch) {
			const level = (headingMatch[1] ?? '#').length;
			const content = renderInlineMarkdown(headingMatch[2] ?? '', `h-${nodes.length}`);
			if (level === 1) {
				nodes.push(
					<h1 key={`h1-${nodes.length}`} className="text-lg font-bold tracking-tight text-foreground mt-2 mb-1">
						{content}
					</h1>,
				);
			} else if (level === 2) {
				nodes.push(
					<h2 key={`h2-${nodes.length}`} className="text-base font-semibold tracking-tight text-foreground mt-2 mb-1">
						{content}
					</h2>,
				);
			} else if (level === 3) {
				nodes.push(
					<h3 key={`h3-${nodes.length}`} className="text-sm font-semibold text-foreground mt-1.5 mb-0.5">
						{content}
					</h3>,
				);
			} else {
				nodes.push(
					<h4 key={`h4-${nodes.length}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-1.5 mb-0.5">
						{content}
					</h4>,
				);
			}
			i += 1;
			continue;
		}

		// Blockquote
		if (trimmed.startsWith('>')) {
			const quoteLines: string[] = [];
			while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
				quoteLines.push((lines[i] ?? '').trim().replace(/^>\s?/, ''));
				i += 1;
			}
			nodes.push(
				<blockquote
					key={`quote-${nodes.length}`}
					className="my-2 border-l-2 border-primary/50 pl-3 text-xs italic text-muted-foreground"
				>
					{renderInlineMarkdown(quoteLines.join(' '), `bq-${nodes.length}`)}
				</blockquote>,
			);
			continue;
		}

		// Unordered list
		if (/^[-*]\s+/.test(trimmed)) {
			const items: string[] = [];
			while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? '').trim())) {
				items.push((lines[i] ?? '').trim().replace(/^[-*]\s+/, ''));
				i += 1;
			}
			nodes.push(
				<ul key={`ul-${nodes.length}`} className="my-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-foreground">
					{items.map((item, idx) => (
						<li key={idx}>{renderInlineMarkdown(item, `ul-${nodes.length}-${idx}`)}</li>
					))}
				</ul>,
			);
			continue;
		}

		// Ordered list
		if (/^\d+\.\s+/.test(trimmed)) {
			const items: string[] = [];
			while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? '').trim())) {
				items.push((lines[i] ?? '').trim().replace(/^\d+\.\s+/, ''));
				i += 1;
			}
			nodes.push(
				<ol key={`ol-${nodes.length}`} className="my-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-foreground">
					{items.map((item, idx) => (
						<li key={idx}>{renderInlineMarkdown(item, `ol-${nodes.length}-${idx}`)}</li>
					))}
				</ol>,
			);
			continue;
		}

		// Paragraph
		const paraLines: string[] = [trimmed];
		i += 1;
		while (i < lines.length) {
			const nextTrimmed = (lines[i] ?? '').trim();
			if (
				nextTrimmed === '' ||
				nextTrimmed.startsWith('```') ||
				nextTrimmed.startsWith('#') ||
				nextTrimmed.startsWith('>') ||
				/^[-*]\s+/.test(nextTrimmed) ||
				/^\d+\.\s+/.test(nextTrimmed) ||
				/^(?:---|\*\*\*|___)\s*$/.test(nextTrimmed)
			) {
				break;
			}
			paraLines.push(nextTrimmed);
			i += 1;
		}
		nodes.push(
			<p key={`p-${nodes.length}`} className="my-1.5 text-xs leading-relaxed text-foreground">
				{renderInlineMarkdown(paraLines.join(' '), `p-${nodes.length}`)}
			</p>,
		);
	}

	return nodes;
}

export function MarkdownField(props: ReactInputfieldProps): React.ReactElement {
	const incoming = props.value === null || props.value === undefined ? '' : String(props.value);
	const [prevIncoming, setPrevIncoming] = useState<string>(incoming);
	const [text, setText] = useState<string>(incoming);
	const defaultMode: MarkdownMode =
		props.previewMode === 'preview' || props.previewMode === 'split' || props.previewMode === 'write'
			? props.previewMode
			: props.readOnly
				? 'preview'
				: 'write';
	const [mode, setMode] = useState<MarkdownMode>(defaultMode);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	if (incoming !== prevIncoming) {
		setPrevIncoming(incoming);
		if (text !== incoming) {
			setText(incoming);
		}
	}

	const hasError = Boolean(props.error && props.error.trim() !== '');
	const locked = Boolean(props.readOnly || props.disabled);
	const allowSplit = props.allowSplit !== false;
	const showToolbar = props.showToolbar !== false && !locked && mode !== 'preview';

	const previewNodes = useMemo(
		() => (mode === 'write' ? [] : renderMarkdownNodes(text)),
		[mode, text],
	);

	const wordCount = useMemo(() => {
		const trimmed = text.trim();
		return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
	}, [text]);

	const commitText = (next: string) => {
		setText(next);
		props.onValueChange?.(props.name, next);
	};

	const wrapSelection = (before: string, after = '', fallbackText = 'text') => {
		const el = textareaRef.current;
		if (!el || locked) {
			return;
		}
		const start = el.selectionStart ?? text.length;
		const end = el.selectionEnd ?? text.length;
		const selected = text.slice(start, end) || fallbackText;
		const updated = `${text.slice(0, start)}${before}${selected}${after}${text.slice(end)}`;
		commitText(updated);
		window.requestAnimationFrame(() => {
			if (!textareaRef.current) {
				return;
			}
			const cursorStart = start + before.length;
			const cursorEnd = cursorStart + selected.length;
			textareaRef.current.focus();
			textareaRef.current.setSelectionRange(cursorStart, cursorEnd);
		});
	};

	const toolbarButtons: Array<{
		key: string;
		label: string;
		icon?: string;
		textBadge?: string;
		onClick: () => void;
	}> = [
		{ key: 'h2', label: t('markdown.heading', 'Heading'), icon: 'heading', onClick: () => wrapSelection('\n## ', '', 'Heading') },
		{ key: 'bold', label: t('markdown.bold', 'Bold'), textBadge: 'B', onClick: () => wrapSelection('**', '**', 'bold text') },
		{ key: 'italic', label: t('markdown.italic', 'Italic'), textBadge: 'I', onClick: () => wrapSelection('*', '*', 'italic text') },
		{ key: 'code', label: t('markdown.code', 'Code'), icon: 'code', onClick: () => wrapSelection('`', '`', 'code') },
		{ key: 'list', label: t('markdown.list', 'List'), icon: 'list', onClick: () => wrapSelection('\n- ', '', 'List item') },
		{ key: 'quote', label: t('markdown.quote', 'Quote'), icon: 'quote', onClick: () => wrapSelection('\n> ', '', 'Quoted line') },
		{ key: 'link', label: t('markdown.link', 'Link'), icon: 'link', onClick: () => wrapSelection('[', '](https://example.com)', 'link text') },
	];

	return (
		<div
			className={cn(
				'min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card',
				hasError && 'border-destructive',
			)}
			data-rw-control="markdown"
			data-rw-markdown-mode={mode}
		>
			{mode === 'preview' && props.name && !props.inlinePortal ? (
				<input type="hidden" name={props.name} value={text} />
			) : null}

			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-2.5 py-1.5">
				<div role="tablist" aria-label={t('markdown.viewMode', 'Markdown mode')} className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
					<button
						type="button"
						role="tab"
						data-rw-md-tab="write"
						aria-selected={mode === 'write'}
						disabled={props.disabled}
						onClick={() => setMode('write')}
						className={cn(
							'inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors cursor-pointer',
							mode === 'write'
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:text-foreground',
						)}
					>
						<DynamicIcon name="edit" aria-hidden="true" className="size-3" />
						<span>{t('markdown.write', 'Write')}</span>
					</button>
					<button
						type="button"
						role="tab"
						data-rw-md-tab="preview"
						aria-selected={mode === 'preview'}
						disabled={props.disabled}
						onClick={() => setMode('preview')}
						className={cn(
							'inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors cursor-pointer',
							mode === 'preview'
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:text-foreground',
						)}
					>
						<DynamicIcon name="eye" aria-hidden="true" className="size-3" />
						<span>{t('markdown.preview', 'Preview')}</span>
					</button>
					{allowSplit ? (
						<button
							type="button"
							role="tab"
							data-rw-md-tab="split"
							aria-selected={mode === 'split'}
							disabled={props.disabled}
							onClick={() => setMode('split')}
							className={cn(
								'hidden md:inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors cursor-pointer',
								mode === 'split'
									? 'bg-primary text-primary-foreground'
									: 'text-muted-foreground hover:text-foreground',
							)}
						>
							<DynamicIcon name="columns" aria-hidden="true" className="size-3" />
							<span>{t('markdown.split', 'Split')}</span>
						</button>
					) : null}
				</div>

				{showToolbar ? (
					<div className="flex flex-wrap items-center gap-1">
						{toolbarButtons.map((btn) => (
							<button
								key={btn.key}
								type="button"
								data-rw-md-action={btn.key}
								aria-label={btn.label}
								title={btn.label}
								onClick={btn.onClick}
								className="inline-flex size-6 items-center justify-center rounded border border-transparent text-xs text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground cursor-pointer"
							>
								{btn.icon ? (
									<DynamicIcon name={btn.icon} aria-hidden="true" className="size-3.5" />
								) : (
									<span className={btn.key === 'bold' ? 'font-bold' : 'italic font-serif'}>
										{btn.textBadge}
									</span>
								)}
							</button>
						))}
					</div>
				) : null}
			</div>

			<div
				className={cn(
					'min-w-0',
					mode === 'split' && 'md:grid md:grid-cols-2 md:divide-x md:divide-border',
				)}
			>
				{mode === 'write' || mode === 'split' ? (
					<div className="min-w-0 p-2">
						<Textarea
							ref={textareaRef}
							id={props.id}
							name={props.inlinePortal ? undefined : props.name}
							rows={props.rows || 6}
							value={text}
							placeholder={props.placeholder || t('markdown.placeholder', 'Write Markdown...')}
							readOnly={props.readOnly}
							disabled={props.disabled}
							required={props.required}
							aria-invalid={hasError}
							aria-describedby={props.describedBy}
							onChange={(e) => commitText(e.target.value)}
							className={cn(
								'min-h-32 resize-y border-0 bg-transparent p-1 font-mono text-xs leading-relaxed shadow-none focus-visible:ring-0',
								props.readOnly && 'text-muted-foreground',
							)}
						/>
					</div>
				) : null}

				{mode === 'preview' || mode === 'split' ? (
					<div
						data-rw-md-preview=""
						className="min-h-32 min-w-0 overflow-x-auto px-3.5 py-2.5 text-xs text-foreground"
					>
						{previewNodes.length > 0 ? (
							previewNodes
						) : (
							<p className="text-xs italic text-muted-foreground">
								{t('markdown.emptyPreview', 'Nothing to preview yet.')}
							</p>
						)}
					</div>
				) : null}
			</div>

			<div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground">
				<span>Markdown</span>
				<span className="tabular-nums">
					{wordCount} {t('markdown.words', 'words')} · {text.length} {t('markdown.chars', 'chars')}
				</span>
			</div>
		</div>
	);
}

export const MarkdownFieldControl = MarkdownField;
