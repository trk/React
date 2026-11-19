/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
import * as TiptapCorePkg from '@tiptap/core';
import * as TiptapReactPkg from '@tiptap/react';
import * as PmStatePkg from '@tiptap/pm/state';
import * as PmViewPkg from '@tiptap/pm/view';
import * as PmModelPkg from '@tiptap/pm/model';
import * as PmTransformPkg from '@tiptap/pm/transform';
import * as PmCommandsPkg from '@tiptap/pm/commands';
import * as PmKeymapPkg from '@tiptap/pm/keymap';
import * as PmSchemaListPkg from '@tiptap/pm/schema-list';
import { getReactWorkspaceRuntime } from '../runtime';
import {
	extractPageIdFromAssetSrc,
	isSafePwImageSrc,
	isSafePwLinkHref,
	mergeBlankTargetRel,
	sanitizeAnchorId,
	sanitizeCssClassTokens,
} from '../tiptap/core/CorePwExtensions';
import { InputfieldTiptap } from '../tiptap/core/TiptapShell';
import {
	fetchTiptapGet,
	postTiptapJson,
	uploadTiptapImages,
} from '../tiptap/core/tiptapGatewayClient';
import {
	hasTiptapCapability,
	installReactTiptapRuntime,
	subscribeTiptapCapabilities,
} from '../tiptap/core/tiptapRuntime';
import { resolveClientRequiredBundles } from '../tiptap/core/toolbarConfig';
import type { TiptapEditorSettings } from '../tiptap/core/tiptapTypes';

const runtime = getReactWorkspaceRuntime();
const { React, registerPages, registerIslands } = runtime;
const { useEffect, useMemo, useState } = React;

const tiptapRuntime = installReactTiptapRuntime({
	TiptapCore: TiptapCorePkg,
	TiptapReact: TiptapReactPkg,
	TiptapPM: {
		state: PmStatePkg,
		view: PmViewPkg,
		model: PmModelPkg,
		transform: PmTransformPkg,
		commands: PmCommandsPkg,
		keymap: PmKeymapPkg,
		schemaList: PmSchemaListPkg,
	},
	gateway: {
		fetchTiptapGet,
		postTiptapJson,
		uploadTiptapImages,
	},
	helpers: {
		extractPageIdFromAssetSrc,
		isSafePwImageSrc,
		isSafePwLinkHref,
		mergeBlankTargetRel,
		sanitizeAnchorId,
		sanitizeCssClassTokens,
	},
});

const TiptapBundleGate: React.FC<Record<string, unknown>> = (rawProps) => {
	const [, setCapTick] = useState(0);
	const merged = useMemo(() => {
		const p = rawProps.props && typeof rawProps.props === 'object'
			? { ...rawProps, ...(rawProps.props as Record<string, unknown>) }
			: rawProps;
		return p as Record<string, unknown>;
	}, [rawProps]);

	const cfg = useMemo<TiptapEditorSettings>(() => {
		return merged.tiptapConfig && typeof merged.tiptapConfig === 'object'
			? (merged.tiptapConfig as TiptapEditorSettings)
			: (merged as unknown as TiptapEditorSettings);
	}, [merged]);

	const htmlValues = useMemo<string[]>(() => {
		const vals: string[] = [String(merged.value ?? '')];
		if (Array.isArray(merged.languages)) {
			for (const lang of merged.languages) {
				if (lang && typeof lang === 'object' && 'value' in lang) {
					vals.push(String((lang as { value?: unknown }).value ?? ''));
				}
			}
		}
		return vals;
	}, [merged.value, merged.languages]);

	const requiredBundles = useMemo(
		() => resolveClientRequiredBundles(cfg, htmlValues),
		[cfg, htmlValues]
	);

	const missing = requiredBundles.filter((b) => b !== 'core' && !hasTiptapCapability(b));
	const missingKey = missing.join(',');

	useEffect(() => {
		if (missing.length === 0) {
			return;
		}
		const bump = () => setCapTick((t) => t + 1);
		const unsub = subscribeTiptapCapabilities(bump);
		void tiptapRuntime.ensureBundles(missing).then(bump);
		return () => {
			unsub();
		};
	}, [missingKey]);

	if (missing.length > 0) {
		return React.createElement('div', {
			className: 'h-32 w-full motion-safe:animate-pulse rounded-lg border border-border bg-muted/20',
			'data-rw-lazy-chunk': 'InputfieldTiptap',
		});
	}

	return React.createElement(InputfieldTiptap as unknown as React.ComponentType<Record<string, unknown>>, rawProps);
};
TiptapBundleGate.displayName = 'TiptapBundleGate';

registerPages({
	InputfieldTiptap: TiptapBundleGate,
	'ReactWorkspace/Tiptap': TiptapBundleGate,
});

registerIslands({
	InputfieldTiptap: TiptapBundleGate,
	'ReactWorkspace/Tiptap': TiptapBundleGate,
});
