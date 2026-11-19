import React from 'react';
import type { ReactInputfieldProps } from '../types';

export function HeadingField(props: ReactInputfieldProps): React.ReactElement {
	return (
		<div className="border-b border-border pb-2 pt-1" data-rw-control="heading">
			{props.label ? (
				<h4 className="text-sm font-semibold tracking-tight text-foreground">{props.label}</h4>
			) : null}
			{props.description ? (
				<p className="mt-0.5 text-xs text-muted-foreground">{props.description}</p>
			) : null}
		</div>
	);
}
