const RICH_TEXT_FIELD_TYPES = new Set<string>([
	'tiptap',
	'tiptap_language',
	'tiptap-language',
	'tiptaplanguage',
	'inputfieldtiptap',
	'richtext',
	'richtext_language',
	'richtext-language',
	'richtextlanguage',
	'wysiwyg',
	'wysiwyg_language',
	'wysiwyg-language',
	'html',
	'html_language',
	'html-language',
]);

export function isRichTextFieldType(rawType?: string | null): boolean {
	if (!rawType) {
		return false;
	}
	return RICH_TEXT_FIELD_TYPES.has(String(rawType).trim().toLowerCase());
}

function stripExecutableTags(html: string): string {
	return html
		.replace(/<(script|style|svg|math|iframe|object|embed|applet|form|meta|base|link)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
		.replace(/<(script|style|svg|math|iframe|object|embed|applet|form|meta|base|link)\b[^>]*\/?>/gi, '');
}

const NAMED_ENTITIES: Record<string, string> = {
	nbsp: ' ',
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
};

function decodeHtmlEntities(input: string): string {
	return input.replace(
		/&(?:#x([0-9a-f]+)|#([0-9]+)|(nbsp|amp|lt|gt|quot|apos));/gi,
		(match, hex?: string, dec?: string, named?: string) => {
			if (hex !== undefined) {
				const code = Number.parseInt(hex, 16);
				if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
					return '';
				}
				return String.fromCodePoint(code);
			}
			if (dec !== undefined) {
				const code = Number.parseInt(dec, 10);
				if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
					return '';
				}
				return String.fromCodePoint(code);
			}
			if (named !== undefined) {
				return NAMED_ENTITIES[named.toLowerCase()] ?? match;
			}
			return match;
		}
	);
}

export function isRichHtmlEmpty(value: unknown): boolean {
	if (value === null || value === undefined) {
		return true;
	}
	const trimmed = String(value).trim();
	if (trimmed === '') {
		return true;
	}
	if (/<(?:img|hr|iframe|video|audio|embed|object|table)\b/i.test(trimmed)) {
		return false;
	}
	if (/<a\b[^>]*\b(?:id|name)\s*=\s*(["'])(?!\1)\s*[A-Za-z]/i.test(trimmed)) {
		return false;
	}
	if (trimmed.includes('data-tiptap-block')) {
		if (/\bdata-prop-[a-z0-9-]+\s*=\s*(["'])(?!\1)[^\r\n]*?\1/i.test(trimmed)) {
			return false;
		}
		if (/\bdata-title\s*=\s*(["'])(?!\1)\s*\S[\s\S]*?\1/i.test(trimmed)) {
			return false;
		}
	}
	const withoutExec = stripExecutableTags(trimmed);
	const decoded = decodeHtmlEntities(withoutExec.replace(/<[^>]*>/g, ''));
	const normalized = decoded.replace(/[\u00A0\u200B\uFEFF]/g, ' ');
	return normalized.trim() === '';
}

export function plainTextLength(html: string): number {
	const trimmed = String(html ?? '').trim();
	if (trimmed === '') {
		return 0;
	}
	const withoutExec = stripExecutableTags(trimmed);
	const compactBetweenBlocks = withoutExec.replace(
		/(<\/(?:p|h[1-6]|li|ul|ol|blockquote|pre|div|aside|section|figure|figcaption|details|summary|tr|td|th)>)\s+(<)/gi,
		'$1$2'
	);
	const text = decodeHtmlEntities(compactBetweenBlocks.replace(/<[^>]*>/g, '')).replace(/\u00A0/g, ' ');
	return Array.from(text).length;
}

export function plainWordCount(html: string): number {
	const trimmed = String(html ?? '').trim();
	if (trimmed === '') {
		return 0;
	}
	const withoutExec = stripExecutableTags(trimmed);
	const spaced = withoutExec.replace(
		/<(?:br\b[^>]*\/?|\/(?:p|h[1-6]|li|blockquote|pre|div|aside|section|figure|figcaption|details|summary|tr|td|th))>/gi,
		' '
	);
	const text = decodeHtmlEntities(spaced.replace(/<[^>]*>/g, '')).replace(/\u00A0/g, ' ').trim();
	if (!text) {
		return 0;
	}
	return text.split(/\s+/).filter(Boolean).length;
}

export function sanitizeExtraCss(css?: string | null): string {
	if (!css) {
		return '';
	}
	let clean = String(css).replace(/\0/g, '').trim();
	if (!clean) {
		return '';
	}
	clean = clean.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_m, hex: string) => {
		const code = Number.parseInt(hex, 16);
		if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
			return '';
		}
		return String.fromCodePoint(code);
	});
	clean = clean.replace(/\\([^0-9a-fA-F\r\n])/g, '$1');
	clean = clean.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
	clean = clean.replace(/<\s*\/?\s*(?:style|script)\b[^>]*>?/gi, '');
	clean = clean.replace(/<\/|<style|<script/gi, '');
	clean = clean.replace(/@import\b[^;]*(?:;|$)/gi, '');
	clean = clean.replace(/expression\s*\([^;{}]*\)/gi, 'none');
	clean = clean.replace(/expression\s*\(/gi, 'blocked(');
	clean = clean.replace(
		/url\s*\(\s*['"]?\s*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi,
		'url(about:blank#'
	);
	clean = clean.replace(/(?:-moz-binding|behavior)\s*:[^;{}]*(?:;|$)/gi, '');
	return clean.trim();
}
