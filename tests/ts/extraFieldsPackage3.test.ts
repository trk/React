import React from 'react';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
	formatSpacingCss,
	normalizeSpacingValue,
	SpacingField,
} from '../../resources/ts/fields/controls/SpacingField';
import {
	OtpField,
	sanitizeOtpInput,
	splitOtpSlots,
} from '../../resources/ts/fields/controls/OtpField';
import {
	evaluatePasswordStrength,
	generateStrongPassword,
	PasswordField,
} from '../../resources/ts/fields/controls/PasswordField';
import {
	normalizeDualRangeValue,
	RangeField,
} from '../../resources/ts/fields/controls/RangeField';
import {
	MarkdownField,
	renderMarkdownNodes,
} from '../../resources/ts/fields/controls/MarkdownField';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const MODULE_DIR = resolve(THIS_DIR, '../..');

describe('Package 3 Domain & Extended Form Controls (Spacing, OTP, Password, Dual Range, Markdown)', () => {
	it('normalizes Spacing, OTP, Password policy, Dual Range, and safe Markdown helpers accurately', () => {
		expect(normalizeSpacingValue('24px')).toEqual({
			top: '24',
			right: '24',
			bottom: '24',
			left: '24',
			unit: 'px',
			linked: true,
		});
		expect(normalizeSpacingValue('12rem 24rem', 'px')).toEqual({
			top: '12',
			right: '24',
			bottom: '12',
			left: '24',
			unit: 'rem',
			linked: false,
		});
		expect(normalizeSpacingValue('10px auto -4px auto')).toEqual({
			top: '10',
			right: 'auto',
			bottom: '-4',
			left: 'auto',
			unit: 'px',
			linked: false,
		});
		expect(
			formatSpacingCss({
				top: '16',
				right: '24',
				bottom: '16',
				left: '24',
				unit: 'px',
			}),
		).toBe('16px 24px');

		expect(sanitizeOtpInput(' 482-910 ', 'numeric', 6)).toBe('482910');
		expect(sanitizeOtpInput('pw-30_dev8x', 'alphanumeric', 8)).toBe('PW30DEV8');
		expect(splitOtpSlots('482', 6)).toEqual(['4', '8', '2', '', '', '']);

		const weak = evaluatePasswordStrength('abc', { minLength: 8, requireSymbol: true });
		expect(weak.allMet).toBe(false);
		expect(weak.score).toBe(1);

		const strongPw = generateStrongPassword(16);
		expect(strongPw).toHaveLength(16);
		const strongReport = evaluatePasswordStrength(strongPw, { minLength: 12, requireSymbol: true });
		expect(strongReport.allMet).toBe(true);
		expect(strongReport.score).toBe(4);

		expect(normalizeDualRangeValue({ min: 800, max: 200 }, 0, 1000, 10, 50)).toEqual({
			min: 200,
			max: 800,
		});
		expect(normalizeDualRangeValue('120..480', 0, 1000, 10, 50)).toEqual({
			min: 120,
			max: 480,
		});
		expect(normalizeDualRangeValue({ min: 495, max: 500 }, 0, 1000, 10, 50)).toEqual({
			min: 495,
			max: 545,
		});

		const unsafeHtml = renderToStaticMarkup(
			React.createElement(
				'div',
				null,
				renderMarkdownNodes('# Title\n\n[Bad Link](javascript:alert(1)) & [Safe](https://processwire.com)\n\n<script>alert(1)</script>'),
			),
		);
		expect(unsafeHtml).toMatch(/<h1[^>]*>Title<\/h1>/);
		expect(unsafeHtml).toContain('href="https://processwire.com"');
		expect(unsafeHtml).not.toContain('javascript:');
		expect(unsafeHtml).not.toContain('<script>');
	});

	it('renders accessible Package 3 SSR attributes and respects inlinePortal hidden input rules', () => {
		const spacingPrimary = renderToStaticMarkup(
			React.createElement(SpacingField, {
				controlType: 'spacing',
				id: 'f_spacing',
				name: 'card_padding',
				value: '16px',
			}),
		);
		expect(spacingPrimary).toContain('data-rw-control="spacing"');
		expect(spacingPrimary).toContain('name="card_padding"');

		const spacingInline = renderToStaticMarkup(
			React.createElement(SpacingField, {
				controlType: 'spacing',
				id: 'f_spacing_inline',
				name: 'card_padding',
				value: '16px',
				inlinePortal: true,
			}),
		);
		expect(spacingInline).not.toContain('type="hidden"');

		const otpPrimary = renderToStaticMarkup(
			React.createElement(OtpField, {
				controlType: 'otp',
				id: 'f_otp',
				name: 'totp_code',
				otpLength: 6,
				otpSeparatorAfter: 3,
				value: '123456',
			}),
		);
		expect(otpPrimary).toContain('data-rw-control="otp"');
		expect(otpPrimary).toContain('name="totp_code"');
		expect(otpPrimary).toContain('autoComplete="one-time-code"');

		const pwPrimary = renderToStaticMarkup(
			React.createElement(PasswordField, {
				controlType: 'password',
				id: 'f_pw',
				name: 'account_password',
				confirmPassword: true,
				allowGenerate: true,
				value: 'Secret123!',
			}),
		);
		expect(pwPrimary).toContain('data-rw-control="password"');
		expect(pwPrimary).toContain('type="password"');

		const dualRangePrimary = renderToStaticMarkup(
			React.createElement(RangeField, {
				controlType: 'range_slider',
				id: 'f_dual_range',
				name: 'price_band',
				min: 0,
				max: 1000,
				step: 10,
				value: { min: 120, max: 480 },
			}),
		);
		expect(dualRangePrimary).toContain('data-rw-control="range_slider"');
		expect(dualRangePrimary).toContain('data-rw-dual-slider="min"');
		expect(dualRangePrimary).toContain('data-rw-dual-slider="max"');
		expect(dualRangePrimary).toContain('name="price_band"');

		const markdownPreview = renderToStaticMarkup(
			React.createElement(MarkdownField, {
				controlType: 'markdown',
				id: 'f_md',
				name: 'release_notes',
				previewMode: 'preview',
				value: '## Summary\n\n- Verified item',
			}),
		);
		expect(markdownPreview).toContain('data-rw-control="markdown"');
		expect(markdownPreview).toMatch(/<h2[^>]*>Summary<\/h2>/);
		expect(markdownPreview).toContain('name="release_notes"');
	});

	it('hydrates Package 3 ReactExtraFields.js controls lazily under strict CSP without eval', () => {
		const distDir = resolve(MODULE_DIR, 'dist');
		const inspectScript = `
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function makeStubEl(tag = 'div') {
	return {
		tagName: String(tag).toUpperCase(),
		href: '',
		rel: '',
		src: '',
		async: false,
		attributes: {},
		matches: () => false,
		querySelectorAll: () => [],
		querySelector: () => null,
		appendChild: (c) => c,
		removeChild: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		getAttribute: (k) => (k === 'href' ? '' : null),
		setAttribute: () => {},
		removeAttribute: () => {},
		hasAttribute: () => false,
		classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
		dataset: {},
		style: {},
	};
}

globalThis.HTMLElement = class HTMLElement {};
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.history = { state: null, scrollRestoration: 'auto', pushState: () => {}, replaceState: () => {} };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
globalThis.localStorage = globalThis.sessionStorage;
globalThis.location = { href: 'http://localhost/admin/', origin: 'http://localhost', pathname: '/admin/', search: '', hash: '' };
globalThis.document = {
	readyState: 'loading',
	body: makeStubEl('body'),
	head: makeStubEl('head'),
	documentElement: makeStubEl('html'),
	getElementById: () => null,
	querySelector: () => null,
	querySelectorAll: () => [],
	createElement: (tag) => makeStubEl(tag),
	addEventListener: () => {},
	removeEventListener: () => {},
};

const distDir = process.argv[1];
vm.runInThisContext(fs.readFileSync(path.join(distDir, 'ReactInertia.js'), 'utf8'), { filename: 'ReactInertia.js' });
const rt = globalThis.ReactWorkspaceRuntime;
const lazySpacing = rt.Fields.SpacingFieldControl;
const hasLoaderBefore = typeof rt.ensureExtraFieldsLoaded === 'function';

vm.runInThisContext(fs.readFileSync(path.join(distDir, 'ReactExtraFields.js'), 'utf8'), { filename: 'ReactExtraFields.js' });

console.log(JSON.stringify({
	hasLoaderBefore,
	spacingReplaced: typeof rt.Fields.SpacingFieldControl === 'function' && rt.Fields.SpacingFieldControl !== lazySpacing,
	hasOtp: typeof rt.Fields.OtpFieldControl === 'function',
	hasPassword: typeof rt.Fields.PasswordFieldControl === 'function',
	hasMarkdown: typeof rt.Fields.MarkdownFieldControl === 'function',
}));
`;
		const raw = execFileSync(
			process.execPath,
			['--disallow-code-generation-from-strings', '-e', inspectScript, distDir],
			{ cwd: MODULE_DIR, encoding: 'utf8' },
		);
		const result = JSON.parse(raw.trim()) as Record<string, boolean>;
		expect(result).toEqual({
			hasLoaderBefore: true,
			spacingReplaced: true,
			hasOtp: true,
			hasPassword: true,
			hasMarkdown: true,
		});
	});
});
