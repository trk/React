import { describe, expect, it } from 'vitest';
import {
	TAILWIND_UTILITY_SUBLAYERS,
	classifyRuleTier,
	isStateSelector,
	partitionTailwindUtilitiesCss,
} from '../../resources/tailwind-layers.mjs';

function extractSublayer(css: string, bucket: string): string {
	const prefix = `@layer utilities.${bucket}{`;
	const start = css.indexOf(prefix);
	if (start === -1) {
		return '';
	}
	let depth = 0;
	let i = start + prefix.length - 1;
	for (; i < css.length; i += 1) {
		if (css[i] === '{') {
			depth += 1;
		} else if (css[i] === '}') {
			depth -= 1;
			if (depth === 0) {
				return css.slice(start, i + 1);
			}
		}
	}
	return css.slice(start);
}

describe('tailwind-layers PostCSS cascade partitioning', () => {
	it('returns CSS unchanged when no @layer utilities block exists', () => {
		const plain = '@layer base{body{margin:0}}';
		expect(partitionTailwindUtilitiesCss(plain)).toBe(plain);
	});

	it('classifies shorthand, axis, longhand, and state selectors accurately', () => {
		expect(isStateSelector('.hover\\:bg-muted:hover')).toBe(true);
		expect(isStateSelector('.dark\\:text-white')).toBe(true);
		expect(isStateSelector('.dark .text-white')).toBe(true);
		expect(isStateSelector('.group\\/row:hover .group-hover\\/row\\:opacity-100')).toBe(true);
		expect(isStateSelector('.\\[\\&_svg\\]\\:size-4 svg')).toBe(true);
		expect(isStateSelector('[data-state=open] .trigger')).toBe(true);
		expect(isStateSelector(':where(.space-y-4>:not(:last-child))')).toBe(false);
		expect(isStateSelector(':where(.divide-border\\/60>:not(:last-child))')).toBe(false);
		expect(isStateSelector('.flex-col')).toBe(false);
	});

	it('partitions @layer utilities into deterministic sub-layers and preserves cascade precedence', () => {
		const input = [
			'@layer base{body{margin:0}}',
			'@layer utilities{',
			'.p-4{padding:1rem}',
			'.px-2{padding-inline:0.5rem}',
			'.rounded-t-md{border-top-left-radius:0.375rem;border-top-right-radius:0.375rem}',
			'.size-4{width:1rem;height:1rem}',
			'.pt-0{padding-top:0px}',
			'.flex-col{flex-direction:column}',
			':where(.space-y-2>:not(:last-child)){margin-block-end:0.5rem}',
			'@supports (color:color-mix(in lab, red, red)){.border-border\\/40{border-color:color-mix(in oklab, var(--border) 40%, transparent)}.bg-muted\\/20{background-color:color-mix(in oklab, var(--muted) 20%, transparent)}}',
			'.group\\/btn[data-active=true]{opacity:1}',
			'@media (hover:hover){.hover\\:bg-muted:hover{background-color:var(--muted)}}',
			'@media (prefers-color-scheme:dark){.dark\\:text-white{color:#fff}}',
			'@media (width>=40rem){.sm\\:p-6{padding:1.5rem}.sm\\:flex-row{flex-direction:row}}',
			'@media (width>=48rem){.md\\:flex-row{flex-direction:row}.md\\:p-8{padding:2rem}}',
			'@container (width>=28rem){.\\@md\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}',
			'@media (pointer:coarse){.pointer-coarse\\:min-h-11{min-height:2.75rem}}',
			'}',
		].join('');

		const out = partitionTailwindUtilitiesCss(input);

		expect(out).toContain('@layer properties,theme,base,components,utilities;');
		expect(out).toContain(
			`@layer ${TAILWIND_UTILITY_SUBLAYERS.map((name) => `utilities.${name}`).join(',')};`
		);
		expect(out).toContain('@layer base{body{margin:0}}');
		expect(out).not.toContain('@layer utilities{');

		const shorthandBlock = extractSublayer(out, 'shorthand');
		const axisBlock = extractSublayer(out, 'axis');
		const longhandBlock = extractSublayer(out, 'longhand');
		const stateBlock = extractSublayer(out, 'state');

		expect(shorthandBlock).toContain('.p-4{padding:1rem}');
		expect(shorthandBlock).toContain('.size-4{width:1rem;height:1rem}');
		expect(shorthandBlock).toContain('@supports (color:color-mix(in lab, red, red))');
		expect(shorthandBlock).toContain('.border-border\\/40');

		expect(axisBlock).toContain('.px-2{padding-inline:0.5rem}');
		expect(axisBlock).toContain('.rounded-t-md{');

		expect(longhandBlock).toContain('.pt-0{padding-top:0px}');
		expect(longhandBlock).toContain('.flex-col{flex-direction:column}');
		expect(longhandBlock).toContain(':where(.space-y-2>:not(:last-child))');
		expect(longhandBlock).toContain('.bg-muted\\/20');

		expect(stateBlock).toContain('.group\\/btn[data-active=true]{opacity:1}');
		expect(stateBlock).toContain('@media (hover:hover){.hover\\:bg-muted:hover');
		expect(stateBlock).toContain('@media (prefers-color-scheme:dark){.dark\\:text-white');

		expect(extractSublayer(out, 'sm-shorthand')).toContain('.sm\\:p-6{padding:1.5rem}');
		expect(extractSublayer(out, 'sm-longhand')).toContain('.sm\\:flex-row{flex-direction:row}');
		expect(extractSublayer(out, 'md-shorthand')).toContain('.md\\:p-8{padding:2rem}');
		expect(extractSublayer(out, 'md-longhand')).toContain('.md\\:flex-row{flex-direction:row}');
		expect(extractSublayer(out, 'container-md')).toContain('@container (width>=28rem)');
		expect(extractSublayer(out, 'media')).toContain('@media (pointer:coarse)');

		// Verify exact precedence ordering
		const idx = (token: string) => out.indexOf(token);
		expect(idx('utilities.shorthand{')).toBeLessThan(idx('utilities.axis{'));
		expect(idx('utilities.axis{')).toBeLessThan(idx('utilities.longhand{'));
		expect(idx('utilities.longhand{')).toBeLessThan(idx('utilities.state{'));
		expect(idx('utilities.state{')).toBeLessThan(idx('utilities.sm-shorthand{'));
		expect(idx('utilities.sm-shorthand{')).toBeLessThan(idx('utilities.sm-longhand{'));
		expect(idx('utilities.sm-longhand{')).toBeLessThan(idx('utilities.md-shorthand{'));
		expect(idx('utilities.md-shorthand{')).toBeLessThan(idx('utilities.md-longhand{'));
		expect(idx('utilities.md-longhand{')).toBeLessThan(idx('utilities.container-md{'));
		expect(idx('utilities.container-md{')).toBeLessThan(idx('utilities.media{'));
	});

	it('keeps nested hover/supports rules inside breakpoint state sub-layer', () => {
		const input = [
			'@layer utilities{',
			'@media (min-width: 48rem){',
			'@media (hover:hover){@supports (color:color-mix(in lab, red, red)){.md\\:hover\\:bg-primary\\/10:hover{background-color:red}}}',
			'.md\\:hidden{display:none}',
			'}',
			'}',
		].join('');

		const out = partitionTailwindUtilitiesCss(input);
		expect(extractSublayer(out, 'md-longhand')).toContain('.md\\:hidden{');
		expect(extractSublayer(out, 'md-state')).toContain('@media (hover:hover){@supports');
	});

	it('routes RTL, arbitrary child, :is(), .dark-theme selectors, nested @media/@supports, and ordered @container breakpoints accurately', () => {
		const input = [
			'@layer utilities{',
			'[dir=rtl] .rtl\\:rotate-180{rotate:180deg}',
			'[dir=ltr] .ltr\\:pl-2{padding-left:0.5rem}',
			'.\\[\\&\\>svg\\]\\:size-4>svg{width:1rem;height:1rem}',
			'.prose :is(h1,h2){font-weight:700}',
			'.dark-theme .dark\\:bg-zinc-900{background-color:#18181b}',
			'@media (min-width: 64rem){@supports (display:grid){@media (hover:hover){.lg\\:hover\\:text-primary:hover{color:blue}}.lg\\:grid{display:grid}}}',
			'@container (width>=20rem){.\\@xs\\:block{display:block}}',
			'@container (width>=42rem){.\\@2xl\\:grid{display:grid}}',
			'}',
		].join('');

		const out = partitionTailwindUtilitiesCss(input);
		const stateBlock = extractSublayer(out, 'state');
		expect(stateBlock).toContain('[dir=rtl]');
		expect(stateBlock).toContain('[dir=ltr]');
		expect(stateBlock).toContain('.\\[\\&\\>svg\\]\\:size-4');
		expect(stateBlock).toContain('.prose :is(h1,h2)');
		expect(stateBlock).toContain('.dark-theme');

		expect(extractSublayer(out, 'lg-state')).toContain('.lg\\:hover\\:text-primary:hover');
		expect(extractSublayer(out, 'lg-longhand')).toContain('.lg\\:grid{display:grid}');
		expect(extractSublayer(out, 'container-xs')).toContain('@container (width>=20rem)');
		expect(extractSublayer(out, 'container-2xl')).toContain('@container (width>=42rem)');
		expect(out.indexOf('utilities.container-xs{')).toBeLessThan(out.indexOf('utilities.container-2xl{'));
	});

	it('classifies rule tiers accurately across single corner radius vs multi-corner radii', () => {
		expect(
			classifyRuleTier({
				selector: '.rounded-tl-sm',
				nodes: [{ type: 'decl', prop: 'border-top-left-radius', value: '2px' }],
			})
		).toBe('longhand');
		expect(
			classifyRuleTier({
				selector: '.rounded-lg',
				nodes: [{ type: 'decl', prop: 'border-radius', value: '8px' }],
			})
		).toBe('shorthand');
		expect(
			classifyRuleTier({
				selector: '.gap-x-2',
				nodes: [{ type: 'decl', prop: 'column-gap', value: '0.5rem' }],
			})
		).toBe('axis');
	});

	it('routes named @container queries and 2xs/4xl container breakpoints into ordered sub-layers', () => {
		const input = [
			'@layer utilities{',
			'@container rw-form (width>=18rem){.\\@2xs\\/rw-form\\:block{display:block}}',
			'@container rw-form (width>=20rem){.\\@xs\\/rw-form\\:flex{display:flex}}',
			'@container rw-link (min-width: 24rem){.\\@sm\\/rw-link\\:flex-row{flex-direction:row}}',
			'@container rw-shell (width>=56rem){.\\@4xl\\/rw-shell\\:grid{display:grid}}',
			'}',
		].join('');

		const out = partitionTailwindUtilitiesCss(input);
		expect(extractSublayer(out, 'container-2xs')).toContain('@container rw-form (width>=18rem)');
		expect(extractSublayer(out, 'container-xs')).toContain('@container rw-form (width>=20rem)');
		expect(extractSublayer(out, 'container-sm')).toContain('@container rw-link (min-width: 24rem)');
		expect(extractSublayer(out, 'container-4xl')).toContain('@container rw-shell (width>=56rem)');

		const idx2xs = out.indexOf('utilities.container-2xs{');
		const idxXs = out.indexOf('utilities.container-xs{');
		const idxSm = out.indexOf('utilities.container-sm{');
		const idx4xl = out.indexOf('utilities.container-4xl{');
		expect(idx2xs).toBeGreaterThan(-1);
		expect(idx2xs).toBeLessThan(idxXs);
		expect(idxXs).toBeLessThan(idxSm);
		expect(idxSm).toBeLessThan(idx4xl);
	});

	it('includes 3xs/3xl/5xl/6xl/7xl container layers, sorts arbitrary @container widths, and splits nested base vs state rules cleanly', () => {
		expect(TAILWIND_UTILITY_SUBLAYERS).toHaveLength(39);
		const orderedContainerLayers = [
			'container-3xs',
			'container-2xs',
			'container-xs',
			'container-sm',
			'container-md',
			'container-lg',
			'container-xl',
			'container-2xl',
			'container-3xl',
			'container-4xl',
			'container-5xl',
			'container-6xl',
			'container-7xl',
			'container',
			'media',
		];
		for (let i = 1; i < orderedContainerLayers.length; i += 1) {
			expect(TAILWIND_UTILITY_SUBLAYERS.indexOf(orderedContainerLayers[i - 1])).toBeLessThan(
				TAILWIND_UTILITY_SUBLAYERS.indexOf(orderedContainerLayers[i])
			);
		}

		const input = [
			'@layer utilities{',
			'@container (width>=80rem){.\\@7xl\\:block{display:block}}',
			'@container (width>=16rem){.\\@3xs\\:flex{display:flex}}',
			'@container (width>=48rem){.\\@3xl\\:grid{display:grid}}',
			'@container (width>=64rem){.\\@5xl\\:inline{display:inline}}',
			'@container (width>=72rem){.\\@6xl\\:hidden{display:none}}',
			'@container (width>=24rem){@media (hover:hover){.\\@sm\\:hover\\:bg-muted:hover{background-color:var(--muted)}}.\\@sm\\:pt-0{padding-top:0px}.\\@sm\\:p-4{padding:1rem}}',
			'@container (width>=560px){.\\@\\[560px\\]\\:flex{display:flex}}',
			'@container (width>=25rem){.\\@\\[25rem\\]\\:grid{display:grid}}',
			'@container (width>=260px){.\\@\\[260px\\]\\:inline{display:inline}}',
			'}',
		].join('');

		const out = partitionTailwindUtilitiesCss(input);
		expect(extractSublayer(out, 'container-3xs')).toContain('@container (width>=16rem)');
		expect(extractSublayer(out, 'container-3xl')).toContain('@container (width>=48rem)');
		expect(extractSublayer(out, 'container-5xl')).toContain('@container (width>=64rem)');
		expect(extractSublayer(out, 'container-6xl')).toContain('@container (width>=72rem)');
		expect(extractSublayer(out, 'container-7xl')).toContain('@container (width>=80rem)');

		// Keep utilities.container-sm exact occurrence count = 2 (declaration + single sub-layer block)
		expect(out.match(/utilities\.container-sm\b/g)).toHaveLength(2);
		const smBlock = extractSublayer(out, 'container-sm');
		expect(smBlock.indexOf('.\\@sm\\:p-4')).toBeLessThan(smBlock.indexOf('.\\@sm\\:pt-0'));
		expect(smBlock.indexOf('.\\@sm\\:pt-0')).toBeLessThan(smBlock.indexOf('.\\@sm\\:hover\\:bg-muted:hover'));

		const arbBlock = extractSublayer(out, 'container');
		const pos260 = arbBlock.indexOf('260px');
		const pos25rem = arbBlock.indexOf('25rem');
		const pos560 = arbBlock.indexOf('560px');
		expect(pos260).toBeGreaterThan(-1);
		expect(pos260).toBeLessThan(pos25rem);
		expect(pos25rem).toBeLessThan(pos560);
	});
});
