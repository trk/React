import React from 'react';
import { DynamicIcon } from '../../lib/utils';
import { CliBox } from './CliBox';

export interface EmptyStateProps {
	icon?: string;
	title: string;
	description: string;
	cliCommand?: string;
	action?: React.ReactNode;
	headingLevel?: 'h2' | 'h3' | 'h4';
}

export function EmptyState({
	icon = 'inbox',
	title,
	description,
	cliCommand,
	action,
	headingLevel = 'h2',
}: EmptyStateProps): React.ReactElement {
	const HeadingTag = headingLevel;
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-10 text-center">
			<div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<DynamicIcon name={icon} className="size-5" aria-hidden="true" />
			</div>
			<HeadingTag className="mt-3 text-sm font-semibold text-foreground">{title}</HeadingTag>
			<p className="mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">{description}</p>
			{cliCommand ? (
				<div className="mt-4 w-full max-w-md text-left">
					<CliBox command={cliCommand} />
				</div>
			) : null}
			{action ? <div className="mt-4">{action}</div> : null}
		</div>
	);
}
