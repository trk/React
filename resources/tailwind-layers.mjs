import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const postcss = require('postcss');

/**
 * Ascending W3C CSS cascade order for partitioned Tailwind v4 utility sub-layers.
 * Declared identically at the top of `ReactInertia.css` and every module delta CSS bundle
 * so base utilities in later stylesheets never override responsive or state variants in earlier ones.
 */
export const TAILWIND_UTILITY_SUBLAYERS = [
	'shorthand',
	'axis',
	'longhand',
	'state',
	'sm-shorthand',
	'sm-axis',
	'sm-longhand',
	'sm-state',
	'md-shorthand',
	'md-axis',
	'md-longhand',
	'md-state',
	'lg-shorthand',
	'lg-axis',
	'lg-longhand',
	'lg-state',
	'xl-shorthand',
	'xl-axis',
	'xl-longhand',
	'xl-state',
	'xxl-shorthand',
	'xxl-axis',
	'xxl-longhand',
	'xxl-state',
	'container-xs',
	'container-sm',
	'container-md',
	'container-lg',
	'container-xl',
	'container-2xl',
	'container',
	'media',
];

const SHORTHAND_PROPS = new Set([
	'margin',
	'padding',
	'inset',
	'border',
	'border-width',
	'border-style',
	'border-color',
	'border-radius',
	'gap',
	'overflow',
	'overscroll-behavior',
	'scroll-margin',
	'scroll-padding',
	'background',
	'outline',
	'flex',
	'grid-column',
	'grid-row',
	'transition',
	'animation',
	'place-items',
	'place-content',
	'place-self',
]);

const AXIS_PROPS = new Set([
	'margin-inline',
	'margin-block',
	'padding-inline',
	'padding-block',
	'inset-inline',
	'inset-block',
	'border-inline',
	'border-inline-width',
	'border-inline-style',
	'border-inline-color',
	'border-block',
	'border-block-width',
	'border-block-style',
	'border-block-color',
	'scroll-margin-inline',
	'scroll-margin-block',
	'scroll-padding-inline',
	'scroll-padding-block',
	'column-gap',
	'row-gap',
	'overflow-x',
	'overflow-y',
	'overscroll-behavior-x',
	'overscroll-behavior-y',
]);

const CORNER_RADIUS_PROPS = new Set([
	'border-top-left-radius',
	'border-top-right-radius',
	'border-bottom-left-radius',
	'border-bottom-right-radius',
	'border-start-start-radius',
	'border-start-end-radius',
	'border-end-start-radius',
	'border-end-end-radius',
]);

const BREAKPOINT_MAP = new Map([
	['(width>=40rem)', 'sm'],
	['(min-width:40rem)', 'sm'],
	['(width>=48rem)', 'md'],
	['(min-width:48rem)', 'md'],
	['(width>=64rem)', 'lg'],
	['(min-width:64rem)', 'lg'],
	['(width>=80rem)', 'xl'],
	['(min-width:80rem)', 'xl'],
	['(width>=96rem)', 'xxl'],
	['(min-width:96rem)', 'xxl'],
]);

const CONTAINER_BREAKPOINT_MAP = new Map([
	['(width>=20rem)', 'container-xs'],
	['(min-width:20rem)', 'container-xs'],
	['(width>=24rem)', 'container-sm'],
	['(min-width:24rem)', 'container-sm'],
	['(width>=28rem)', 'container-md'],
	['(min-width:28rem)', 'container-md'],
	['(width>=32rem)', 'container-lg'],
	['(min-width:32rem)', 'container-lg'],
	['(width>=36rem)', 'container-xl'],
	['(min-width:36rem)', 'container-xl'],
	['(width>=42rem)', 'container-2xl'],
	['(min-width:42rem)', 'container-2xl'],
]);

const STATE_SELECTOR_PATTERNS = [
	':hover',
	':focus',
	':focus-visible',
	':focus-within',
	':active',
	':disabled',
	':enabled',
	':checked',
	':indeterminate',
	':visited',
	':first-child',
	':last-child',
	':first-of-type',
	':last-of-type',
	':odd',
	':even',
	':nth-',
	':empty',
	':open',
	':invalid',
	':valid',
	':required',
	':read-only',
	':placeholder-shown',
	':has(',
	':is(',
	':dir(',
	'[dir=rtl]',
	'[dir=ltr]',
	'[data-',
	'[aria-',
	'.dark ',
	'.dark,',
	'.dark\\:',
	'.dark-theme',
	'.group',
	'.peer',
	'::before',
	'::after',
	':before',
	':after',
	'::placeholder',
	'::selection',
	'::file-selector-button',
];

function normalizeCondition(params) {
	return String(params || '')
		.toLowerCase()
		.replace(/\s*([<>:=])\s*/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}

function matchBreakpoint(params) {
	return BREAKPOINT_MAP.get(normalizeCondition(params)) || null;
}

function matchContainerBucket(params) {
	return CONTAINER_BREAKPOINT_MAP.get(normalizeCondition(params)) || 'container';
}

function isStateMediaParams(params) {
	const norm = normalizeCondition(params);
	return norm.includes('hover:hover') || norm.includes('prefers-color-scheme:dark');
}

function isSpaceOrDivideHelper(selector) {
	return /^:where\(\.[^)]*(?:space-|divide-)/.test(selector);
}

export function isStateSelector(selector) {
	const raw = String(selector || '');
	if (isSpaceOrDivideHelper(raw)) {
		const candidate = raw.replace(/:not\(:last-child\)/g, '');
		return STATE_SELECTOR_PATTERNS.some((token) => token !== ':is(' && candidate.includes(token)) || /\\?\[\\?&/.test(raw);
	}
	for (const token of STATE_SELECTOR_PATTERNS) {
		if (raw.includes(token)) {
			return true;
		}
	}
	return /\\?\[\\?&/.test(raw);
}

export function classifyRuleTier(rule) {
	if (isStateSelector(rule.selector)) {
		return 'state';
	}

	let hasShorthand = false;
	let hasAxis = false;
	let hasWidth = false;
	let hasHeight = false;
	let cornerRadiusCount = 0;

	if (Array.isArray(rule.nodes)) {
		for (const child of rule.nodes) {
			if (child.type !== 'decl') {
				continue;
			}
			const prop = String(child.prop || '').toLowerCase();
			if (prop.startsWith('--')) {
				continue;
			}
			if (SHORTHAND_PROPS.has(prop)) {
				hasShorthand = true;
			} else if (AXIS_PROPS.has(prop)) {
				hasAxis = true;
			}
			if (prop === 'width') {
				hasWidth = true;
			} else if (prop === 'height') {
				hasHeight = true;
			}
			if (CORNER_RADIUS_PROPS.has(prop)) {
				cornerRadiusCount += 1;
			}
		}
	}

	if (hasShorthand || (hasWidth && hasHeight)) {
		return 'shorthand';
	}
	if (hasAxis || cornerRadiusCount >= 2) {
		return 'axis';
	}
	return 'longhand';
}

function firstNonCommentChild(nodes) {
	if (!Array.isArray(nodes)) {
		return null;
	}
	return nodes.find((child) => child && child.type !== 'comment') || null;
}

function unwrapInnerBucket(node) {
	if (!node) {
		return 'longhand';
	}
	if (node.type === 'rule') {
		return classifyRuleTier(node);
	}
	if (node.type === 'atrule') {
		if (node.name === 'supports') {
			const child = firstNonCommentChild(node.nodes);
			return child ? unwrapInnerBucket(child) : 'longhand';
		}
		if (node.name === 'container') {
			return matchContainerBucket(node.params);
		}
		if (node.name === 'media') {
			const bp = matchBreakpoint(node.params);
			if (bp) {
				const child = firstNonCommentChild(node.nodes);
				const innerTier = child ? unwrapInnerBucket(child) : 'longhand';
				return innerTier.startsWith('container') || innerTier === 'media'
					? innerTier
					: `${bp}-${innerTier.replace(/^(?:sm|md|lg|xl|xxl)-/, '')}`;
			}
			if (isStateMediaParams(node.params)) {
				const child = firstNonCommentChild(node.nodes);
				const inner = child ? unwrapInnerBucket(child) : 'state';
				const bpMatch = /^(sm|md|lg|xl|xxl)-/.exec(inner);
				return bpMatch ? `${bpMatch[1]}-state` : 'state';
			}
			return 'media';
		}
	}
	return 'longhand';
}

function resolveTierWithinBreakpoint(node) {
	if (!node) {
		return 'longhand';
	}
	if (node.type === 'rule') {
		return classifyRuleTier(node);
	}
	if (node.type === 'atrule') {
		if (node.name === 'media') {
			if (isStateMediaParams(node.params)) {
				return 'state';
			}
			const child = firstNonCommentChild(node.nodes);
			return child ? resolveTierWithinBreakpoint(child) : 'longhand';
		}
		if (node.name === 'supports') {
			const child = firstNonCommentChild(node.nodes);
			return child ? resolveTierWithinBreakpoint(child) : 'longhand';
		}
	}
	return 'longhand';
}

function splitAtRuleChildren(node, resolver) {
	const groups = new Map();
	const appendChild = (bucket, clonedNode) => {
		if (!groups.has(bucket)) {
			groups.set(bucket, []);
		}
		groups.get(bucket).push(clonedNode);
	};

	for (const child of node.nodes || []) {
		if (child.type === 'comment') {
			continue;
		}
		if (child.type === 'atrule' && child.name === 'supports' && node.name === 'media') {
			for (const [subBucket, subWrapped] of splitAtRuleChildren(child, resolver)) {
				appendChild(subBucket, subWrapped);
			}
			continue;
		}
		appendChild(resolver(child), child.clone());
	}

	const result = [];
	for (const [bucket, children] of groups.entries()) {
		const wrapped = postcss.atRule({
			name: node.name,
			params: node.params,
			raws: { before: '', after: '', between: '' },
		});
		wrapped.append(children);
		result.push([bucket, wrapped]);
	}
	return result;
}

function classifyUtilityNodes(utilityLayer) {
	const buckets = new Map();
	for (const name of TAILWIND_UTILITY_SUBLAYERS) {
		buckets.set(name, []);
	}

	const pushTo = (bucketName, node) => {
		const target = buckets.get(bucketName) || buckets.get('longhand');
		target.push(node.clone());
	};

	for (const node of utilityLayer.nodes || []) {
		if (node.type === 'comment') {
			continue;
		}
		if (node.type === 'rule') {
			pushTo(classifyRuleTier(node), node);
			continue;
		}
		if (node.type === 'atrule') {
			if (node.name === 'media') {
				const bp = matchBreakpoint(node.params);
				if (bp) {
					for (const [tier, wrapped] of splitAtRuleChildren(node, resolveTierWithinBreakpoint)) {
						pushTo(`${bp}-${tier}`, wrapped);
					}
					continue;
				}
				if (isStateMediaParams(node.params)) {
					const resolveStateBucket = (child) => {
						const innerBucket = unwrapInnerBucket(child);
						const bpMatch = /^(sm|md|lg|xl|xxl)-/.exec(innerBucket);
						return bpMatch ? `${bpMatch[1]}-state` : 'state';
					};
					for (const [targetBucket, wrapped] of splitAtRuleChildren(node, resolveStateBucket)) {
						pushTo(targetBucket, wrapped);
					}
					continue;
				}
				pushTo('media', node);
				continue;
			}
			if (node.name === 'container') {
				pushTo(matchContainerBucket(node.params), node);
				continue;
			}
			if (node.name === 'supports') {
				for (const [targetBucket, wrapped] of splitAtRuleChildren(node, unwrapInnerBucket)) {
					pushTo(targetBucket, wrapped);
				}
				continue;
			}
		}
		pushTo('longhand', node);
	}

	return buckets;
}

/**
 * Partition `@layer utilities` blocks in compiled Tailwind CSS into ordered sub-layers.
 * No-op for CSS without `@layer utilities { ... }` blocks (e.g. legacy non-Tailwind CSS).
 */
export function partitionTailwindUtilitiesCss(css) {
	if (typeof css !== 'string' || !css.includes('@layer utilities')) {
		return css;
	}

	const root = postcss.parse(css);
	const utilityLayers = [];

	root.walkAtRules('layer', (atRule) => {
		if (atRule.params.trim() === 'utilities' && Array.isArray(atRule.nodes)) {
			utilityLayers.push(atRule);
		}
	});

	if (utilityLayers.length === 0) {
		return css;
	}

	const baseLayerStmt = postcss.atRule({
		name: 'layer',
		params: 'properties,theme,base,components,utilities',
		raws: { before: '', afterName: ' ', semicolon: true },
	});
	const subLayerStmt = postcss.atRule({
		name: 'layer',
		params: TAILWIND_UTILITY_SUBLAYERS.map((name) => `utilities.${name}`).join(','),
		raws: { before: '', afterName: ' ', semicolon: true },
	});

	for (const utilityLayer of utilityLayers) {
		const buckets = classifyUtilityNodes(utilityLayer);
		const replacementLayers = [];
		for (const bucketName of TAILWIND_UTILITY_SUBLAYERS) {
			const nodes = buckets.get(bucketName);
			if (!nodes || nodes.length === 0) {
				continue;
			}
			const subLayer = postcss.atRule({
				name: 'layer',
				params: `utilities.${bucketName}`,
				raws: { before: '', between: '', after: '' },
			});
			subLayer.append(nodes);
			replacementLayers.push(subLayer);
		}
		if (replacementLayers.length > 0) {
			utilityLayer.replaceWith(...replacementLayers);
		} else {
			utilityLayer.remove();
		}
	}

	const firstNode = root.first;
	if (firstNode && firstNode.type === 'atrule' && firstNode.name === 'charset') {
		firstNode.after(subLayerStmt);
		firstNode.after(baseLayerStmt);
	} else {
		root.prepend(subLayerStmt);
		root.prepend(baseLayerStmt);
	}

	return root.toString();
}

/**
 * Vite post-build plugin partitioning generated CSS bundles' `@layer utilities` blocks
 * into deterministic cascade sub-layers.
 */
export function createTailwindCascadeLayersPlugin() {
	return {
		name: 'pw-tailwind-cascade-layers',
		enforce: 'post',
		generateBundle(_options, bundle) {
			for (const asset of Object.values(bundle)) {
				if (
					asset &&
					asset.type === 'asset' &&
					typeof asset.fileName === 'string' &&
					asset.fileName.endsWith('.css') &&
					typeof asset.source === 'string'
				) {
					asset.source = partitionTailwindUtilitiesCss(asset.source);
				}
			}
		},
	};
}
