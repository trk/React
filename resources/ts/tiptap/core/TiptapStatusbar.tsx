/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import { getReactWorkspaceRuntime } from '../../runtime';
import type { TiptapTranslateFn } from './tiptapTypes';

const runtime = getReactWorkspaceRuntime();
const { React, UI, Utils } = runtime;
const { cn } = Utils;
const { Badge } = UI;

export function TiptapStatusbar({
	words,
	characters,
	maxLengthLimit,
	isCurrentLangEditable,
	isSourceMode,
	t,
}: {
	words: number;
	characters: number;
	maxLengthLimit: number;
	isCurrentLangEditable: boolean;
	isSourceMode: boolean;
	t: TiptapTranslateFn;
}) {
	return (
		<div
			className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground tabular-nums rounded-b-lg"
			data-rw-tiptap-statusbar=""
		>
			<div className="inline-flex items-center gap-2.5">
				<span>
					{words === 1
						? t('status.word', { count: words }, '{count} word')
						: t('status.words', { count: words }, '{count} words')}
				</span>
				<span aria-hidden="true">&middot;</span>
				<span
					className={cn(
						maxLengthLimit > 0 && characters > maxLengthLimit && 'text-destructive font-semibold'
					)}
				>
					{maxLengthLimit > 0
						? t(
								'status.charsWithMax',
								{ count: characters, max: maxLengthLimit },
								'{count} / {max} chars'
							)
						: characters === 1
							? t('status.char', { count: characters }, '{count} char')
							: t('status.chars', { count: characters }, '{count} chars')}
				</span>
			</div>
			<div className="inline-flex items-center gap-1.5">
				{!isCurrentLangEditable ? (
					<Badge variant="outline" className="px-1.5 py-0 text-[10px]">
						{t('status.readOnly', 'Read-only')}
					</Badge>
				) : null}
				{isSourceMode ? (
					<Badge variant="secondary" mono className="px-1.5 py-0 text-[10px]">
						HTML
					</Badge>
				) : null}
			</div>
		</div>
	);
}
