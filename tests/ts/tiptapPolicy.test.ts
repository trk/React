import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	isRichHtmlEmpty,
	isRichTextFieldType,
	plainTextLength,
	plainWordCount,
	sanitizeExtraCss,
} from '../../resources/ts/tiptap/tiptapPolicy';

describe('Tiptap Content Policy & CSS Sanitizer', () => {
	it('recognizes all rich-text field type aliases accurately', () => {
		expect(isRichTextFieldType('tiptap')).toBe(true);
		expect(isRichTextFieldType('InputfieldTiptap')).toBe(true);
		expect(isRichTextFieldType('richtext_language')).toBe(true);
		expect(isRichTextFieldType('text')).toBe(false);
		expect(isRichTextFieldType(null)).toBe(false);
	});

	it('detects empty vs meaningful HTML including media tags and mini-blocks', () => {
		expect(isRichHtmlEmpty('')).toBe(true);
		expect(isRichHtmlEmpty('<p></p><p><br></p>')).toBe(true);
		expect(isRichHtmlEmpty('<p>&nbsp;\u200B</p>')).toBe(true);
		expect(isRichHtmlEmpty('<script>alert(1)</script>')).toBe(true);

		expect(isRichHtmlEmpty('<p>Hello</p>')).toBe(false);
		expect(isRichHtmlEmpty('<p><img src="/photo.jpg" alt=""></p>')).toBe(false);
		expect(isRichHtmlEmpty('<p><a id="section-overview"></a></p>')).toBe(false);
		expect(isRichHtmlEmpty('<p><a name="legacy-anchor"></a></p>')).toBe(false);
		expect(isRichHtmlEmpty('<hr>')).toBe(false);
		expect(
			isRichHtmlEmpty('<div data-tiptap-block="stat" data-prop-value="99%"></div>')
		).toBe(false);
	});

	it('computes Unicode-accurate plainTextLength and plainWordCount while stripping executable tags', () => {
		expect(plainTextLength('<p>Hello</p> <p>World</p><script>evil()</script><svg><title>ignore</title></svg>')).toBe(10);
		expect(plainTextLength('<p>🚀Test</p>')).toBe(5);
		expect(plainTextLength('<p>&amp;lt;</p>')).toBe(4);
		expect(isRichHtmlEmpty('<p>&amp;#160;</p>')).toBe(false);
		expect(isRichHtmlEmpty('<svg><text>hidden</text></svg>')).toBe(true);
		expect(plainWordCount('<p>One<br>Two</p><p>Three &amp; Four</p><style>body{}</style>')).toBe(5);
		expect(plainWordCount('<p>&nbsp;</p>')).toBe(0);
	});

	it('neutralizes CSS style-breakout, hex-escaped script tags, @import, expression(), and unsafe URLs', () => {
		const malicious = [
			'.prose { color: #111; }',
			'</style><script>alert(1)</script><style>',
			'\\3c \\2f style\\3e \\3c script\\3e alert(2)\\3c \\2f script\\3e',
			'@import url("https://evil.example/x.css");',
			'.ie { width: expression(alert(3)); -moz-binding: url("http://evil/xbl"); }',
			'.bg { background: url("javascript:alert(4)"); }',
		].join('\n');

		const clean = sanitizeExtraCss(malicious);
		expect(clean).toContain('.prose { color: #111; }');
		expect(clean.toLowerCase()).not.toContain('<script');
		expect(clean.toLowerCase()).not.toContain('</style');
		expect(clean.toLowerCase()).not.toContain('@import');
		expect(clean.toLowerCase()).not.toContain('expression(');
		expect(clean.toLowerCase()).not.toContain('-moz-binding');
		expect(clean.toLowerCase()).not.toContain('javascript:');

		const nestedBreakout = sanitizeExtraCss('body{color:red} <<//style><img src=x onerror=alert(1)>');
		expect(nestedBreakout).toContain('body{color:red}');
		expect(nestedBreakout.toLowerCase()).not.toContain('</style');
		expect(nestedBreakout.toLowerCase()).not.toContain('<img');
		expect(nestedBreakout).not.toContain('<');

		const multiLayerBreakout = sanitizeExtraCss('a{color:blue} <<<///style><script>alert(2)</script>');
		expect(multiLayerBreakout).toContain('a{color:blue}');
		expect(multiLayerBreakout.toLowerCase()).not.toContain('<script');
		expect(multiLayerBreakout.toLowerCase()).not.toContain('</style');
		expect(multiLayerBreakout).not.toContain('<');

		const commentObfuscated = sanitizeExtraCss(
			[
				'/*/* */@im/*x*/port url("https://evil.example/a.css");',
				'.x { width: expr/*comment*/ession(alert(1)); }',
				'.y { background: url("data:image/svg+xml;utf8,<svg></svg>"); }',
				'.z { background: url("data:application/xhtml+xml;base64,abc"); }',
				'.unclosed { color: red; } /* unclosed comment',
			].join('\n')
		);
		expect(commentObfuscated.toLowerCase()).not.toContain('@import');
		expect(commentObfuscated.toLowerCase()).not.toContain('expression(');
		expect(commentObfuscated.toLowerCase()).not.toContain('data:image/svg+xml');
		expect(commentObfuscated.toLowerCase()).not.toContain('data:application/xhtml');
		expect(commentObfuscated).not.toContain('/*');
		expect(commentObfuscated).toContain('.unclosed { color: red; }');
	});

	it('validates ProcessWire link/image/anchor helpers in CorePwExtensions', async () => {
		const React = await import('react');
		(globalThis as any).window = (globalThis as any).window || {};
		(globalThis as any).window.ReactWorkspaceRuntime = {
			React,
			cn: (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' '),
		};

		const {
			extractPageIdFromAssetSrc,
			isSafePwImageSrc,
			isSafePwLinkHref,
			mergeBlankTargetRel,
			sanitizeAnchorId,
			sanitizeCssClassTokens,
		} = await import('../../resources/ts/tiptap/core/CorePwExtensions');

		expect(extractPageIdFromAssetSrc('/site/assets/files/1042/hero.400x0-is.webp')).toBe(1042);
		expect(extractPageIdFromAssetSrc('/site/assets/files/1/04/25/banner.png?nc=123')).toBe(10425);
		expect(extractPageIdFromAssetSrc('https://cdn.example.com/static/logo.png')).toBe(0);

		expect(sanitizeAnchorId('#faq-item_1')).toBe('faq-item_1');
		expect(sanitizeAnchorId('123-invalid')).toBe('');
		expect(sanitizeAnchorId('__rw_anchor_internal')).toBe('');

		expect(mergeBlankTargetRel('nofollow', '_blank')).toBe('nofollow noopener noreferrer');
		expect(mergeBlankTargetRel('nofollow', '')).toBe('nofollow');
		expect(sanitizeCssClassTokens('btn  btn-primary rw-tiptap-anchor-token bad<>class')).toBe('btn btn-primary');

		expect(isSafePwLinkHref('/docs/getting-started/')).toBe(true);
		expect(isSafePwLinkHref('#overview')).toBe(true);
		expect(isSafePwLinkHref('mailto:team@example.com')).toBe(true);
		expect(isSafePwLinkHref('javascript:alert(1)')).toBe(false);
		expect(isSafePwImageSrc('/site/assets/files/1/photo.jpg')).toBe(true);
		expect(isSafePwImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false);
	});

	it('resolves minimal client Tiptap capability bundles across presets and HTML content markers', async () => {
		const { resolveClientRequiredBundles } = await import(
			'../../resources/ts/tiptap/core/toolbarConfig'
		);

		expect(
			resolveClientRequiredBundles({
				preset: 'core',
				toolbar: 'styles | bold italic | bullist numlist blockquote | link | undo redo',
				bubbleToolbar: '',
				features: ['toolbar', 'stickybars', 'statusbar', 'purifier', 'pasteFilter'],
				inlineMode: 0,
				slashMenu: false,
				miniBlocks: [],
			})
		).toEqual(['core']);

		expect(
			resolveClientRequiredBundles({
				preset: 'editor',
				toolbar: 'bold italic | table image',
				bubbleToolbar: 'bold italic | link',
				features: ['toolbar', 'bubbleMenu', 'imgUpload'],
			})
		).toEqual(['core', 'editor', 'canvas']);

		expect(
			resolveClientRequiredBundles({
				preset: 'canvas',
				toolbar: '',
				bubbleToolbar: 'bold italic | link',
				features: ['bubbleMenu', 'slashMenu', 'blockHandles'],
				inlineMode: 1,
				slashMenu: true,
				miniBlocks: [],
			})
		).toEqual(['core', 'canvas']);

		expect(
			resolveClientRequiredBundles({
				preset: 'blocks',
				toolbar: 'bold italic | insertblock',
				bubbleToolbar: 'bold italic | link',
				features: ['toolbar', 'bubbleMenu', 'slashMenu', 'blockHandles'],
				slashMenu: true,
				miniBlocks: ['callout'],
			})
		).toEqual(['core', 'editor', 'canvas', 'blocks']);

		// Existing saved HTML promotes editor/blocks bundles cleanly
		expect(
			resolveClientRequiredBundles(
				{
					preset: 'core',
					toolbar: 'bold italic',
					bubbleToolbar: '',
					features: ['toolbar'],
					miniBlocks: [],
				},
				['<table><tbody><tr><td>Cell</td></tr></tbody></table>', '<aside data-tiptap-block="callout"><p>Note</p></aside>']
			)
		).toEqual(['core', 'editor', 'blocks']);
	});

	it('maintains textbox + aria-multiline defaults on TiptapShell and restores them when slash menu closes', () => {
		const tiptapShellSrc = readFileSync(
			resolve(__dirname, '../../resources/ts/tiptap/core/TiptapShell.tsx'),
			'utf8'
		);

		expect(tiptapShellSrc).toContain("role: 'textbox',");
		expect(tiptapShellSrc).toContain("'aria-multiline': 'true',");

		// Slash menu open swaps to combobox and removes aria-multiline (ARIA 1.2)
		const openIdx = tiptapShellSrc.indexOf("dom.setAttribute('role', 'combobox');");
		const closedIdx = tiptapShellSrc.indexOf("dom.setAttribute('role', 'textbox');");
		expect(openIdx).toBeGreaterThan(-1);
		expect(closedIdx).toBeGreaterThan(openIdx);

		const openBranch = tiptapShellSrc.slice(openIdx, closedIdx);
		expect(openBranch).toContain("dom.removeAttribute('aria-multiline');");
		expect(openBranch).toContain("dom.setAttribute('aria-expanded', 'true');");

		const closedBranch = tiptapShellSrc.slice(closedIdx, closedIdx + 300);
		expect(closedBranch).toContain("dom.setAttribute('role', 'textbox');");
		expect(closedBranch).toContain("dom.setAttribute('aria-multiline', 'true');");
		expect(tiptapShellSrc).not.toContain("dom.removeAttribute('role')");
	});
});
