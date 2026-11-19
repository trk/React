import type { HeadingLevel, TiptapEditorSettings, TiptapTranslateFn } from './tiptapTypes';

export const DEFAULT_TOOLBAR =
	'styles | bold italic underline strike code highlight | alignleft aligncenter alignright | bullist numlist tasklist blockquote codeblock | link image table hr | removeformat source | undo redo';

export const DEFAULT_BUBBLE_TOOLBAR = 'bold italic underline strike code highlight | link removeformat';

export const DEFAULT_FEATURES = [
	'toolbar',
	'stickybars',
	'bubbleMenu',
	'statusbar',
	'spellcheck',
	'purifier',
	'pasteFilter',
	'sourceCode',
	'imgUpload',
	'imgResize',
];

export const ALLOWED_TOOLBAR_TOKENS = new Set<string>([
	'styles',
	'paragraph',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'bold',
	'italic',
	'underline',
	'strike',
	'code',
	'highlight',
	'subscript',
	'superscript',
	'alignleft',
	'aligncenter',
	'alignright',
	'alignjustify',
	'bullist',
	'numlist',
	'tasklist',
	'blockquote',
	'codeblock',
	'link',
	'unlink',
	'anchor',
	'image',
	'table',
	'hr',
	'insertblock',
	'removeformat',
	'source',
	'fullscreen',
	'undo',
	'redo',
]);

export const EDITOR_BUNDLE_TOKENS = new Set<string>([
	'highlight',
	'subscript',
	'superscript',
	'alignleft',
	'aligncenter',
	'alignright',
	'alignjustify',
	'tasklist',
	'anchor',
	'image',
	'table',
]);

export const TOOLBAR_TOKEN_ALIASES: Record<string, string> = {
	formatselect: 'styles',
	blocks: 'styles',
	heading: 'styles',
	headings: 'styles',
	strikethrough: 'strike',
	del: 'strike',
	hilitecolor: 'highlight',
	backcolor: 'highlight',
	mark: 'highlight',
	justifyleft: 'alignleft',
	left: 'alignleft',
	justifycenter: 'aligncenter',
	center: 'aligncenter',
	justifyright: 'alignright',
	right: 'alignright',
	justifyfull: 'alignjustify',
	justify: 'alignjustify',
	unorderedlist: 'bullist',
	ul: 'bullist',
	orderedlist: 'numlist',
	ol: 'numlist',
	checklist: 'tasklist',
	tasks: 'tasklist',
	todo: 'tasklist',
	quote: 'blockquote',
	pre: 'codeblock',
	codesample: 'codeblock',
	horizontalrule: 'hr',
	divider: 'hr',
	pwlink: 'link',
	pwimage: 'image',
	clearformat: 'removeformat',
	clean: 'removeformat',
	codeview: 'source',
	html: 'source',
	maximize: 'fullscreen',
};

export function normalizeToolbarToken(rawToken: string): string | null {
	const clean = rawToken.trim().toLowerCase();
	if (!clean || clean === '|') {
		return null;
	}
	const mapped = TOOLBAR_TOKEN_ALIASES[clean] ?? clean;
	return ALLOWED_TOOLBAR_TOKENS.has(mapped) ? mapped : null;
}

export function normalizeToolbarGroups(rawGroups: string[][]): string[][] {
	const groups: string[][] = [];
	for (const rawGroup of rawGroups) {
		if (!Array.isArray(rawGroup)) {
			continue;
		}
		const group: string[] = [];
		for (const item of rawGroup) {
			const mapped = normalizeToolbarToken(String(item || ''));
			if (mapped && !group.includes(mapped)) {
				group.push(mapped);
			}
		}
		if (group.length > 0) {
			groups.push(group);
		}
	}
	return groups;
}

export function parseToolbarString(raw: string, defaultToolbar = DEFAULT_TOOLBAR): string[][] {
	const trimmed = raw.trim();
	const lower = trimmed.toLowerCase();
	if (!trimmed || lower === 'none' || lower === 'false') {
		return [];
	}
	const source = lower === 'default' ? defaultToolbar : trimmed;
	const groups: string[][] = [];
	for (const chunk of source.split('|')) {
		const group: string[] = [];
		for (const token of chunk.trim().split(/[\s,]+/)) {
			const mapped = normalizeToolbarToken(token);
			if (mapped && !group.includes(mapped)) {
				group.push(mapped);
			}
		}
		if (group.length > 0) {
			groups.push(group);
		}
	}
	return groups;
}

export function parseAllowedHeadingLevels(headlines?: string[]): HeadingLevel[] {
	const raw = Array.isArray(headlines) && headlines.length > 0 ? headlines : ['h2', 'h3', 'h4'];
	const levels: HeadingLevel[] = [];
	for (const item of raw) {
		const m = /^h([1-6])$/i.exec(String(item).trim());
		if (m) {
			const lvl = Number(m[1]) as HeadingLevel;
			if (!levels.includes(lvl)) {
				levels.push(lvl);
			}
		}
	}
	return levels.length > 0 ? levels : [2, 3, 4];
}

export function sanitizePastedHtml(rawHtml: string): string {
	return rawHtml
		.replace(/<(script|style|svg|math|iframe|object|embed|applet|form|meta|base|link)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
		.replace(/<(script|style|svg|math|iframe|object|embed|applet|form|meta|base|link)\b[^>]*\/?>/gi, '')
		.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
		.replace(
			/\b(href|src|xlink:href|formaction)\s*=\s*(["']?)\s*(?:javascript|vbscript|data\s*:\s*(?:text\/html|application\/xhtml|image\/svg\+xml))\s*:[^"'\s>]*\2/gi,
			'$1="#"'
		);
}

export function syncExternalHiddenInput(
	inputId: string,
	inputName: string,
	nextValue: string,
	dispatchDomEvents = true
): boolean {
	if (typeof document === 'undefined') {
		return false;
	}
	let target: HTMLTextAreaElement | HTMLInputElement | null = null;
	if (inputId) {
		const byId = document.getElementById(inputId);
		if (byId instanceof HTMLTextAreaElement || byId instanceof HTMLInputElement) {
			target = byId;
		}
	}
	if (!target && inputName) {
		const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(inputName) : inputName;
		const byAttr = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(
			`[data-inertia-input="${escaped}"]`
		);
		if (byAttr) {
			target = byAttr;
		}
	}
	if (!target) {
		return false;
	}
	if (target.value !== nextValue) {
		target.value = nextValue;
		if (dispatchDomEvents) {
			target.dispatchEvent(new Event('input', { bubbles: true }));
			target.dispatchEvent(new Event('change', { bubbles: true }));
		}
	}
	return true;
}

export function describeToolbarGroup(
	tokens: string[],
	index: number,
	t: TiptapTranslateFn
): string {
	const first = tokens[0] || '';
	if (first === 'styles' || first === 'paragraph' || /^h[1-6]$/.test(first)) {
		return t('groups.textStyle', 'Text style');
	}
	if (['bold', 'italic', 'underline', 'strike', 'code', 'highlight', 'subscript', 'superscript'].includes(first)) {
		return t('groups.inlineFormatting', 'Inline formatting');
	}
	if (first.startsWith('align')) {
		return t('groups.textAlignment', 'Text alignment');
	}
	if (['bullist', 'numlist', 'tasklist', 'blockquote', 'codeblock'].includes(first)) {
		return t('groups.listsAndBlocks', 'Lists and blocks');
	}
	if (['link', 'unlink', 'anchor', 'image', 'table', 'hr', 'insertblock'].includes(first)) {
		return t('groups.insertElements', 'Insert elements');
	}
	if (['undo', 'redo'].includes(first)) {
		return t('groups.history', 'History');
	}
	if (['removeformat', 'source', 'fullscreen'].includes(first)) {
		return t('groups.utilities', 'Editor utilities');
	}
	return t('groups.formattingGroup', { index: index + 1 }, 'Formatting group {index}');
}

export function resolveClientRequiredBundles(
	cfg: TiptapEditorSettings,
	htmlValues: string[] = []
): string[] {
	if (Array.isArray(cfg.bundles) && cfg.bundles.length > 0) {
		const valid = cfg.bundles
			.map((b) => String(b || '').trim().toLowerCase())
			.filter((b) => b === 'core' || b === 'editor' || b === 'canvas' || b === 'blocks');
		return Array.from(new Set(['core', ...valid]));
	}

	const preset = String(cfg.preset || 'editor').trim().toLowerCase();
	const features = Array.isArray(cfg.features) ? cfg.features : DEFAULT_FEATURES;
	const toolbarGroups = Array.isArray(cfg.toolbarGroups)
		? normalizeToolbarGroups(cfg.toolbarGroups)
		: parseToolbarString(typeof cfg.toolbar === 'string' ? cfg.toolbar : DEFAULT_TOOLBAR, DEFAULT_TOOLBAR);
	const bubbleGroups = Array.isArray(cfg.bubbleGroups)
		? normalizeToolbarGroups(cfg.bubbleGroups)
		: parseToolbarString(typeof cfg.bubbleToolbar === 'string' ? cfg.bubbleToolbar : DEFAULT_BUBBLE_TOOLBAR, DEFAULT_BUBBLE_TOOLBAR);
	const flatTokens = [...toolbarGroups.flat(), ...bubbleGroups.flat()];
	const inlineMode = Number(cfg.inlineMode || 0);
	const miniBlocks = Array.isArray(cfg.miniBlocks) ? cfg.miniBlocks : [];
	const preservedMiniBlocks = Array.isArray(cfg.preservedMiniBlocks) ? cfg.preservedMiniBlocks : [];

	const needsEditor =
		preset === 'editor' ||
		preset === 'blocks' ||
		flatTokens.some((tok) => EDITOR_BUNDLE_TOKENS.has(tok)) ||
		features.includes('imgUpload') ||
		features.includes('imgResize') ||
		htmlValues.some((html) =>
			/<(?:table|img|figure|mark|sub|sup)\b|data-type\s*=\s*["']task(?:List|Item)["']|text-align\s*:|<a\b[^>]*\b(?:id|name)\s*=/i.test(
				html
			)
		);

	const hasBubbleControls = (inlineMode > 0 || features.includes('bubbleMenu')) && bubbleGroups.length > 0;
	const needsCanvas =
		preset === 'canvas' ||
		preset === 'blocks' ||
		inlineMode > 0 ||
		Boolean(cfg.slashMenu) ||
		features.includes('slashMenu') ||
		features.includes('blockHandles') ||
		hasBubbleControls;

	const needsBlocks =
		preset === 'blocks' ||
		miniBlocks.length > 0 ||
		preservedMiniBlocks.length > 0 ||
		flatTokens.includes('insertblock') ||
		htmlValues.some((html) => html.includes('data-tiptap-block'));

	const bundles = ['core'];
	if (needsEditor) bundles.push('editor');
	if (needsCanvas) bundles.push('canvas');
	if (needsBlocks) bundles.push('blocks');
	return bundles;
}
