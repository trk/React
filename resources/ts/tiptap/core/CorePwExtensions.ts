import type { Editor } from '@tiptap/core';
import Heading from '@tiptap/extension-heading';
import Link from '@tiptap/extension-link';
import type { HeadingLevel, PwImageConfig, PwLinkConfig } from './tiptapTypes';

export const DEFAULT_PW_LINK_CONFIG: PwLinkConfig = {
	urlType: 0,
	extLinkRel: '',
	extLinkTarget: '',
	extLinkClass: '',
	noLinkTextEdit: false,
	classOptions: [],
	relOptions: [
		{ value: 'nofollow', default: false },
		{ value: 'noopener', default: false },
		{ value: 'noreferrer', default: false },
	],
	targetOptions: [{ value: '_blank', default: false }],
	httpHosts: [],
};

export const DEFAULT_PW_IMAGE_CONFIG: PwImageConfig = {
	alignLeftClass: 'align_left',
	alignCenterClass: 'align_center',
	alignRightClass: 'align_right',
	hidpiDefault: false,
	noSizeAttrs: false,
	maxWidth: 0,
	skipFields: [],
};

export function resolvePwLinkConfig(raw?: Partial<PwLinkConfig> | null): PwLinkConfig {
	if (!raw || typeof raw !== 'object') {
		return DEFAULT_PW_LINK_CONFIG;
	}
	return {
		urlType: typeof raw.urlType === 'number' ? raw.urlType : 0,
		extLinkRel: String(raw.extLinkRel ?? ''),
		extLinkTarget: String(raw.extLinkTarget ?? ''),
		extLinkClass: String(raw.extLinkClass ?? ''),
		noLinkTextEdit: Boolean(raw.noLinkTextEdit),
		classOptions: Array.isArray(raw.classOptions) ? raw.classOptions : DEFAULT_PW_LINK_CONFIG.classOptions,
		relOptions:
			Array.isArray(raw.relOptions) && raw.relOptions.length > 0
				? raw.relOptions
				: DEFAULT_PW_LINK_CONFIG.relOptions,
		targetOptions:
			Array.isArray(raw.targetOptions) && raw.targetOptions.length > 0
				? raw.targetOptions
				: DEFAULT_PW_LINK_CONFIG.targetOptions,
		httpHosts: Array.isArray(raw.httpHosts) ? raw.httpHosts : [],
	};
}

export function resolvePwImageConfig(raw?: Partial<PwImageConfig> | null): PwImageConfig {
	if (!raw || typeof raw !== 'object') {
		return DEFAULT_PW_IMAGE_CONFIG;
	}
	return {
		alignLeftClass: String(raw.alignLeftClass || 'align_left'),
		alignCenterClass: String(raw.alignCenterClass || 'align_center'),
		alignRightClass: String(raw.alignRightClass || 'align_right'),
		hidpiDefault: Boolean(raw.hidpiDefault),
		noSizeAttrs: Boolean(raw.noSizeAttrs),
		maxWidth: typeof raw.maxWidth === 'number' ? raw.maxWidth : 0,
		skipFields: Array.isArray(raw.skipFields) ? raw.skipFields : [],
	};
}

export function isSafePwLinkHref(rawHref: string): boolean {
	const trimmed = String(rawHref ?? '').trim();
	if (!trimmed || /[\x00-\x20\x7F]/.test(trimmed)) {
		return false;
	}
	if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\')) {
		return false;
	}
	if (/^(?:javascript|vbscript|data):/i.test(trimmed)) {
		return false;
	}
	return /^(https?:\/\/[^/\\]|mailto:[^\s]|tel:[^\s]|\/|#|\.\.?\/)/i.test(trimmed);
}

export function isSafePwImageSrc(rawSrc: string): boolean {
	const trimmed = String(rawSrc ?? '').trim();
	if (!trimmed || /[\x00-\x20\x7F]/.test(trimmed)) {
		return false;
	}
	if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\')) {
		return false;
	}
	return /^(https?:\/\/[^/\\]|\/|\.\.?\/)/i.test(trimmed);
}

export function sanitizeAnchorId(raw: string | null | undefined): string {
	const clean = String(raw ?? '').trim().replace(/^#+/, '');
	if (!clean || clean.toLowerCase().startsWith('__rw_')) {
		return '';
	}
	return /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(clean) ? clean : '';
}

export function sanitizeCssClassTokens(raw: string | null | undefined): string {
	if (!raw) {
		return '';
	}
	const seen = new Set<string>();
	const out: string[] = [];
	for (const token of String(raw).trim().split(/\s+/)) {
		if (
			token &&
			/^[A-Za-z0-9_:-]{1,80}$/.test(token) &&
			!token.toLowerCase().startsWith('rw-tiptap-anchor-token') &&
			!seen.has(token)
		) {
			seen.add(token);
			out.push(token);
		}
	}
	return out.join(' ');
}

export function mergeBlankTargetRel(rawRel: string | null | undefined, target: string | null | undefined): string {
	const tokens: string[] = [];
	for (const part of String(rawRel ?? '').toLowerCase().trim().split(/\s+/)) {
		if (part && /^[a-z0-9_-]{1,40}$/.test(part) && !tokens.includes(part)) {
			tokens.push(part);
		}
	}
	if (target === '_blank') {
		if (!tokens.includes('noopener')) {
			tokens.push('noopener');
		}
		if (!tokens.includes('noreferrer')) {
			tokens.push('noreferrer');
		}
	}
	return tokens.join(' ');
}

export function extractPageIdFromAssetSrc(rawSrc: string): number {
	const clean = String(rawSrc ?? '').split('?')[0] || '';
	const idx = clean.indexOf('/files/');
	if (idx === -1) {
		return 0;
	}
	const tail = clean.slice(idx + '/files/'.length);
	const parts = tail.split('/').filter(Boolean);
	if (parts.length < 2) {
		return 0;
	}
	parts.pop();
	let digits = '';
	for (const seg of parts) {
		if (/^\d+$/.test(seg)) {
			digits += seg;
		} else {
			break;
		}
	}
	const parsed = Number.parseInt(digits, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function extractDocumentAnchors(editor: Editor | null): string[] {
	if (!editor || editor.isDestroyed) {
		return [];
	}
	const found: string[] = [];
	editor.state.doc.descendants((node) => {
		if (node.type.name === 'pwAnchor' || node.type.name === 'heading') {
			const clean = sanitizeAnchorId(node.attrs?.id);
			if (clean && !found.includes(clean)) {
				found.push(clean);
			}
		}
	});
	return found;
}

export function createPwHeadingExtension(levels: HeadingLevel[]) {
	return Heading.extend({
		addAttributes() {
			return {
				...this.parent?.(),
				id: {
					default: null,
					parseHTML: (el) => sanitizeAnchorId(el.getAttribute('id')) || null,
					renderHTML: (attrs) => {
						const clean = sanitizeAnchorId(attrs.id);
						return clean ? { id: clean } : {};
					},
				},
			};
		},
	}).configure({
		levels,
	});
}

export function createPwLinkExtension(options?: { openOnClick?: boolean }) {
	return Link.extend({
		addAttributes() {
			return {
				href: {
					default: null,
					parseHTML: (el) => {
						const raw = el.getAttribute('href') || '';
						return isSafePwLinkHref(raw) ? raw.trim() : null;
					},
				},
				target: {
					default: null,
					parseHTML: (el) => {
						const raw = (el.getAttribute('target') || '').trim();
						return /^_[A-Za-z0-9_-]{1,32}$/.test(raw) ? raw : null;
					},
				},
				rel: {
					default: null,
					parseHTML: (el) => {
						const raw = el.getAttribute('rel');
						const merged = mergeBlankTargetRel(raw, el.getAttribute('target'));
						return merged || null;
					},
				},
				title: {
					default: null,
					parseHTML: (el) => {
						const raw = (el.getAttribute('title') || '').trim();
						return raw || null;
					},
				},
				class: {
					default: null,
					parseHTML: (el) => sanitizeCssClassTokens(el.getAttribute('class')) || null,
				},
			};
		},

		parseHTML() {
			return [
				{
					tag: 'a[href]',
					getAttrs: (dom) => {
						const el = dom as HTMLElement;
						const rawHref = el.getAttribute('href') || '';
						if (!isSafePwLinkHref(rawHref)) {
							return false;
						}
						if (
							el.children.length === 1 &&
							el.firstElementChild?.tagName === 'IMG' &&
							(el.textContent || '').trim() === ''
						) {
							return false;
						}
						return null;
					},
				},
			];
		},

		renderHTML({ HTMLAttributes }) {
			const rawHref = String(HTMLAttributes.href ?? '').trim();
			if (!isSafePwLinkHref(rawHref)) {
				return ['span', {}, 0];
			}
			const target = HTMLAttributes.target ? String(HTMLAttributes.target).trim() : '';
			const rel = mergeBlankTargetRel(HTMLAttributes.rel, target);
			const title = HTMLAttributes.title ? String(HTMLAttributes.title).trim() : '';
			const cls = sanitizeCssClassTokens(HTMLAttributes.class);

			const attrs: Record<string, string> = { href: rawHref };
			if (target) attrs.target = target;
			if (rel) attrs.rel = rel;
			if (title) attrs.title = title;
			if (cls) attrs.class = cls;

			return ['a', attrs, 0];
		},
	}).configure({
		openOnClick: options?.openOnClick ?? false,
		autolink: true,
		defaultProtocol: 'https',
		HTMLAttributes: {},
		isAllowedUri: (url) => isSafePwLinkHref(url),
	});
}
