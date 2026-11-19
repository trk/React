import React, { useEffect, useState } from 'react';
import { Skeleton } from '../../ui';
import type { ReactInputfieldProps } from '../types';

export function TiptapField(props: ReactInputfieldProps): React.ReactElement {
	const [, setTick] = useState(0);
	const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;

	const Candidate = runtime?.getIsland?.('InputfieldTiptap');
	const isReady = Boolean(Candidate && Candidate.displayName !== 'LazyIsland(InputfieldTiptap)');

	useEffect(() => {
		if (isReady || !runtime) {
			return;
		}
		const bump = () => setTick((t) => t + 1);
		const unsubIsland = runtime.subscribeIslands?.(bump);
		const explicitBundles = Array.isArray(props.tiptapConfig?.bundles)
			? props.tiptapConfig.bundles
			: undefined;
		void runtime.ensureTiptapLoaded?.(explicitBundles).then(bump);
		return () => {
			unsubIsland?.();
		};
	}, [isReady, runtime]);

	const scalarValue = Array.isArray(props.value) ? (props.value[0] ?? '') : String(props.value ?? '');
	const hasLanguages = Array.isArray(props.languages) && props.languages.length > 1;

	if (isReady && Candidate) {
		return (
			<Candidate
				id={props.id}
				name={props.name}
				label={props.label}
				value={scalarValue}
				placeholder={props.placeholder}
				rows={props.rows}
				maxLength={props.maxLength}
				showCount={props.showCount}
				readOnly={props.readOnly}
				disabled={props.disabled}
				required={props.required}
				useLanguages={hasLanguages}
				languages={props.languages}
				activeLangId={props.activeLangId}
				onSelectLanguage={props.onSelectLanguage}
				hideLanguageTabs={props.hideLanguageTabs}
				tiptapConfig={props.tiptapConfig}
				onValueChange={props.onValueChange}
			/>
		);
	}

	return (
		<div className="space-y-1.5" data-rw-control="tiptap" data-rw-lazy-chunk="InputfieldTiptap">
			{hasLanguages && props.languages ? (
				props.languages.map((lang) => (
					<textarea
						key={`pending-${lang.id}`}
						id={lang.inputId}
						name={lang.inputName}
						value={String(lang.value ?? '')}
						readOnly
						hidden
						aria-hidden="true"
						tabIndex={-1}
					/>
				))
			) : (
				<textarea
					id={props.id}
					name={props.name}
					value={scalarValue}
					readOnly
					hidden
					aria-hidden="true"
					tabIndex={-1}
				/>
			)}
			<Skeleton className="h-44 w-full rounded-lg border border-border" />
		</div>
	);
}
