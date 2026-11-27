import type React from 'react';
import type { SchemaConditionSpec } from './types';

export function lookupScopedFieldValue(
	values: Record<string, unknown>,
	rawKey: string,
	scopePrefix?: string
): { found: boolean; value: unknown } {
	const key = rawKey.trim();
	if (!key) {
		return { found: false, value: undefined };
	}

	const lookupDirect = (targetKey: string): { found: boolean; value: unknown } => {
		if (scopePrefix) {
			const cleanPrefix = scopePrefix.replace(/_+$/, '');
			if (cleanPrefix) {
				const scopedKey = `${cleanPrefix}_${targetKey}`;
				if (scopedKey in values && values[scopedKey] !== undefined) {
					return { found: true, value: values[scopedKey] };
				}
			}
			if (`${scopePrefix}${targetKey}` in values && values[`${scopePrefix}${targetKey}`] !== undefined) {
				return { found: true, value: values[`${scopePrefix}${targetKey}`] };
			}
			if (targetKey in values && values[targetKey] !== undefined) {
				return { found: true, value: values[targetKey] };
			}
			return { found: false, value: undefined };
		}
		if (targetKey in values && values[targetKey] !== undefined) {
			return { found: true, value: values[targetKey] };
		}
		if (/^[a-z]{2,12}block_/.test(targetKey)) {
			return { found: false, value: undefined };
		}
		for (const [k, v] of Object.entries(values)) {
			if (!/^[a-z]{2,12}block_/.test(k) && k.endsWith(`_${targetKey}`) && v !== undefined) {
				return { found: true, value: v };
			}
		}
		return { found: false, value: undefined };
	};

	const direct = lookupDirect(key);
	if (direct.found) {
		return direct;
	}

	const dotIdx = key.indexOf('.');
	if (dotIdx > 0 && dotIdx < key.length - 1) {
		const rootKey = key.slice(0, dotIdx);
		const subSegments = key.slice(dotIdx + 1).split('.').filter(Boolean);
		const rootLookup = lookupDirect(rootKey);
		if (!rootLookup.found) {
			return { found: false, value: undefined };
		}
		let current: unknown = rootLookup.value;
		if (typeof current === 'string' && current.trim().startsWith('{')) {
			try {
				current = JSON.parse(current.trim());
			} catch {
				return { found: false, value: undefined };
			}
		}
		for (const seg of subSegments) {
			if (
				current === null ||
				current === undefined ||
				typeof current !== 'object' ||
				seg === '__proto__' ||
				seg === 'constructor' ||
				seg === 'prototype' ||
				!Object.prototype.hasOwnProperty.call(current, seg)
			) {
				return { found: false, value: undefined };
			}
			current = (current as Record<string, unknown>)[seg];
		}
		return current !== undefined && current !== null
			? { found: true, value: current }
			: { found: false, value: undefined };
	}

	return { found: false, value: undefined };
}

export function resolveScopedFieldValue(
	values: Record<string, unknown>,
	rawKey: string,
	scopePrefix?: string
): unknown {
	const lookup = lookupScopedFieldValue(values, rawKey, scopePrefix);
	return lookup.found ? lookup.value : '';
}

export function isLinkValueObject(val: unknown): val is Record<string, unknown> {
	if (val === null || typeof val !== 'object' || Array.isArray(val)) {
		return false;
	}
	const rec = val as Record<string, unknown>;
	return (
		typeof rec.type === 'string' &&
		('pageId' in rec || 'url' in rec || 'resourceId' in rec || 'file' in rec || 'anchor' in rec)
	);
}

export function isLinkFieldValueEmpty(val: unknown): boolean {
	if (val === null || val === undefined) {
		return true;
	}
	if (typeof val === 'string') {
		const trimmed = val.trim();
		if (trimmed === '') {
			return true;
		}
		if (trimmed.startsWith('{')) {
			try {
				const parsed = JSON.parse(trimmed);
				if (isLinkValueObject(parsed)) {
					return isLinkFieldValueEmpty(parsed);
				}
			} catch {
				// Treat non-JSON string as plain URL
			}
		}
		return false;
	}
	if (!isLinkValueObject(val)) {
		return true;
	}
	const type = String(val.type || 'url').toLowerCase().trim();
	if (type === 'page') {
		return !(Number(val.pageId) > 0);
	}
	if (type === 'anchor') {
		return String(val.anchor ?? val.url ?? '').replace(/^#+/, '').trim() === '';
	}
	if (type === 'tel') {
		return String(val.url ?? '').replace(/[^0-9]+/g, '') === '';
	}
	if (type === 'email') {
		return String(val.url ?? '').trim() === '';
	}
	if (type === 'url') {
		return String(val.url ?? '').trim() === '' && String(val.anchor ?? '').trim() === '';
	}
	if (type === 'file' || type === 'image' || type === 'video') {
		return String(val.file ?? '').trim() === '' && String(val.url ?? '').trim() === '';
	}
	if (String(val.resourceType ?? '').trim() !== '') {
		return String(val.resourceId ?? '').trim() === '';
	}
	return (
		String(val.file ?? '').trim() === '' &&
		String(val.url ?? '').trim() === '' &&
		String(val.resourceId ?? '').trim() === '' &&
		!(Number(val.pageId) > 0)
	);
}

function parseConditionLinkJson(raw: unknown): Record<string, unknown> | null {
	if (isLinkValueObject(raw)) {
		return raw;
	}
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
			try {
				const parsed = JSON.parse(trimmed);
				if (isLinkValueObject(parsed)) {
					return parsed;
				}
			} catch {
				// Ignore malformed JSON strings
			}
		}
	}
	return null;
}

function unwrapConditionActualValue(raw: unknown): {
	list: string[];
	isTruthy: boolean;
	rawCountVal: unknown;
} {
	const linkObj = parseConditionLinkJson(raw);
	if (linkObj) {
		const nonEmpty = !isLinkFieldValueEmpty(linkObj);
		return {
			list: [nonEmpty ? '1' : ''],
			isTruthy: nonEmpty,
			rawCountVal: nonEmpty ? '1' : '',
		};
	}
	if (Array.isArray(raw)) {
		const mapped = raw.map((v) => String(v));
		return {
			list: mapped,
			isTruthy: mapped.length > 0,
			rawCountVal: raw,
		};
	}
	if (raw !== null && typeof raw === 'object') {
		const entries = Object.values(raw as Record<string, unknown>)
			.filter((v) => v !== null && v !== undefined && typeof v !== 'object')
			.map((v) => String(v));
		const nonEmptyEntries = entries.filter((v) => v !== '');
		const list = nonEmptyEntries.length > 0 ? nonEmptyEntries : [''];
		return {
			list,
			isTruthy: nonEmptyEntries.some((v) => v !== '0' && v !== 'false'),
			rawCountVal: nonEmptyEntries,
		};
	}
	if (raw === true) {
		return { list: ['1'], isTruthy: true, rawCountVal: '1' };
	}
	if (raw === false || raw === null || raw === undefined) {
		return { list: [''], isTruthy: false, rawCountVal: '' };
	}
	const str = String(raw);
	return {
		list: [str],
		isTruthy: str !== '' && str !== '0' && str !== 'false',
		rawCountVal: str,
	};
}

function evaluateSingleClause(
	clause: string,
	values: Record<string, unknown>,
	scopePrefix?: string
): boolean {
	const trimmed = clause.trim();
	if (!trimmed) {
		return true;
	}

	const match = trimmed.match(/^([a-zA-Z0-9_|.]+)\s*(===|!==|==|!=|\*=|\^=|\$=|>=|<=|=|>|<)\s*(.*)$/);
	if (!match) {
		const bareNegated = trimmed.startsWith('!');
		const bareKey = (bareNegated ? trimmed.slice(1) : trimmed).trim();
		if (/^[a-zA-Z0-9_.]+$/.test(bareKey)) {
			const bareVal = resolveScopedFieldValue(values, bareKey, scopePrefix);
			const isTruthy = unwrapConditionActualValue(bareVal).isTruthy;
			return bareNegated ? !isTruthy : isTruthy;
		}
		return true;
	}

	const [, lhsRaw = '', rawOp = '=', rhsRaw = ''] = match;
	const operator =
		rawOp === '===' || rawOp === '=='
			? '='
			: rawOp === '!=='
				? '!='
				: rawOp;
	const fieldKeys = lhsRaw.split('|').map((k) => k.trim()).filter(Boolean);
	const trimmedRhs = rhsRaw.trim();
	const firstCh = trimmedRhs[0];
	const wrapsWholeRhs =
		trimmedRhs.length >= 2 &&
		(firstCh === '"' || firstCh === "'") &&
		trimmedRhs.endsWith(firstCh) &&
		!trimmedRhs.slice(1, -1).includes(firstCh);
	const unwrappedRhs = wrapsWholeRhs ? trimmedRhs.slice(1, -1) : trimmedRhs;
	const expectedAlternatives = unwrappedRhs
		.split('|')
		.map((part) => {
			const p = part.trim();
			if (
				p.length >= 2 &&
				((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'")))
			) {
				return { value: p.slice(1, -1), quoted: true };
			}
			return { value: p, quoted: wrapsWholeRhs };
		});

	return fieldKeys.some((fieldKey) => {
		const isCountCheck = fieldKey.endsWith('.count');
		const baseKey = isCountCheck ? fieldKey.slice(0, -6) : fieldKey;
		const actualRaw = resolveScopedFieldValue(values, baseKey, scopePrefix);
		const unwrapped = unwrapConditionActualValue(actualRaw);
		const actualList = unwrapped.list;

		const compareValue = isCountCheck
			? String(
					Array.isArray(unwrapped.rawCountVal)
						? unwrapped.rawCountVal.length
						: actualList[0]
							? 1
							: 0
				)
			: actualList[0] ?? '';

		switch (operator) {
			case '=':
				return expectedAlternatives.some(({ value: exp, quoted }) => {
					if (exp === '' || (!quoted && exp.toLowerCase() === 'false')) {
						return actualList.every((v) => v === '' || v === '0' || v === 'false');
					}
					if (!quoted && exp.toLowerCase() === 'true') {
						return actualList.includes('1') || actualList.includes('true');
					}
					return actualList.includes(exp) || (exp === '1' && compareValue === 'true');
				});
			case '!=':
				return expectedAlternatives.every(({ value: exp, quoted }) => {
					if (exp === '' || (!quoted && exp.toLowerCase() === 'false')) {
						return actualList.some((v) => v !== '' && v !== '0' && v !== 'false');
					}
					if (!quoted && exp.toLowerCase() === 'true') {
						return !actualList.includes('1') && !actualList.includes('true');
					}
					return !actualList.includes(exp);
				});
			case '*=':
				return expectedAlternatives.some(({ value: exp }) =>
					actualList.some((v) => v.toLowerCase().includes(exp.toLowerCase()))
				);
			case '^=':
				return expectedAlternatives.some(({ value: exp }) =>
					actualList.some((v) => v.toLowerCase().startsWith(exp.toLowerCase()))
				);
			case '$=':
				return expectedAlternatives.some(({ value: exp }) =>
					actualList.some((v) => v.toLowerCase().endsWith(exp.toLowerCase()))
				);
			case '>':
				return parseFloat(compareValue || '0') > parseFloat(expectedAlternatives[0]?.value || '0');
			case '<':
				return parseFloat(compareValue || '0') < parseFloat(expectedAlternatives[0]?.value || '0');
			case '>=':
				return parseFloat(compareValue || '0') >= parseFloat(expectedAlternatives[0]?.value || '0');
			case '<=':
				return parseFloat(compareValue || '0') <= parseFloat(expectedAlternatives[0]?.value || '0');
			default:
				return true;
		}
	});
}

export function normalizeConditionExpressionToString(
	spec: SchemaConditionSpec | undefined | null
): string {
	if (!spec) {
		return '';
	}
	if (typeof spec === 'string') {
		return spec.trim();
	}
	const formatRule = (field: string, operator = '=', val: unknown = ''): string => {
		const cleanField = field.trim();
		if (!cleanField) {
			return '';
		}
		const cleanOp =
			operator === '==' || operator === '===' || !operator.trim()
				? '='
				: operator === '!=='
					? '!='
					: operator.trim();
		const valStr = Array.isArray(val)
			? val.map((item) => (typeof item === 'boolean' ? (item ? '1' : '0') : String(item))).join('|')
			: typeof val === 'boolean'
				? val
					? '1'
					: '0'
				: val === null || val === undefined
					? ''
					: String(val);
		return `${cleanField}${cleanOp}${valStr}`;
	};
	if (Array.isArray(spec)) {
		return (spec as unknown[])
			.map((entry) => {
				if (typeof entry === 'string') {
					return entry.trim();
				}
				if (entry && typeof entry === 'object' && 'field' in entry && typeof entry.field === 'string') {
					const clause = entry as { field: string; operator?: string; value?: unknown };
					return formatRule(clause.field, clause.operator ?? '=', clause.value ?? '');
				}
				return '';
			})
			.filter(Boolean)
			.join(', ');
	}
	if (typeof spec === 'object') {
		const specRec = spec as Record<string, unknown>;
		if (typeof specRec.field === 'string') {
			return formatRule(
				specRec.field,
				typeof specRec.operator === 'string' ? specRec.operator : '=',
				specRec.value ?? ''
			);
		}
		return Object.entries(spec)
			.map(([key, val]) => formatRule(key, '=', val))
			.filter(Boolean)
			.join(', ');
	}
	return '';
}

function evaluateConditionAtomOrMatch(
	clause: string,
	values: Record<string, unknown>,
	scopePrefix?: string
): boolean {
	const trimmed = clause.trim();
	if (!trimmed) {
		return true;
	}
	const matchCall = trimmed.match(
		/^(!?)\$match\(\s*([a-zA-Z0-9_.]+)\s*,\s*(['"])(.*?)\3\s*\)$/
	);
	if (matchCall) {
		const negated = matchCall[1] === '!';
		const fieldKey = matchCall[2] ?? '';
		const rawPat = (matchCall[4] ?? '').replace(/^\^|\$$/g, '');
		return evaluateSingleClause(`${fieldKey}${negated ? '!=' : '='}${rawPat}`, values, scopePrefix);
	}
	return evaluateSingleClause(trimmed, values, scopePrefix);
}

export function evaluateCondition(
	spec: SchemaConditionSpec | undefined | null,
	values: Record<string, unknown>,
	scopePrefix?: string
): boolean {
	const expression = normalizeConditionExpressionToString(spec);
	if (!expression) {
		return true;
	}

	const len = expression.length;
	let pos = 0;

	const skipWs = (): void => {
		while (pos < len && /\s/.test(expression[pos]!)) {
			pos++;
		}
	};

	const parseOr = (): boolean => {
		let val = parseAnd();
		while (pos < len) {
			skipWs();
			if (expression.slice(pos, pos + 2) === '||') {
				pos += 2;
				const right = parseAnd();
				val = val || right;
				continue;
			}
			break;
		}
		return val;
	};

	const parseAnd = (): boolean => {
		let val = parseUnary();
		while (pos < len) {
			skipWs();
			if (expression.slice(pos, pos + 2) === '&&') {
				pos += 2;
				skipWs();
				if (pos >= len || expression[pos] === ')') {
					break;
				}
				const right = parseUnary();
				val = val && right;
				continue;
			}
			if (expression[pos] === ',') {
				pos += 1;
				skipWs();
				if (pos >= len || expression[pos] === ')') {
					break;
				}
				const right = parseUnary();
				val = val && right;
				continue;
			}
			break;
		}
		return val;
	};

	const parseUnary = (): boolean => {
		skipWs();
		if (expression[pos] === '!') {
			let lookahead = pos + 1;
			while (lookahead < len && /\s/.test(expression[lookahead]!)) {
				lookahead++;
			}
			if (expression[lookahead] === '(') {
				pos = lookahead;
				return !parsePrimary();
			}
		}
		return parsePrimary();
	};

	const parsePrimary = (): boolean => {
		skipWs();
		if (pos >= len) {
			return true;
		}
		if (expression[pos] === '(') {
			pos++;
			const inner = parseOr();
			skipWs();
			if (expression[pos] === ')') {
				pos++;
			}
			return inner;
		}

		const start = pos;
		let quote = '';
		let atomParenDepth = 0;
		while (pos < len) {
			const ch = expression[pos]!;
			if (quote !== '') {
				if (ch === quote && (pos === 0 || expression[pos - 1] !== '\\')) {
					quote = '';
				}
				pos++;
				continue;
			}
			if (ch === '"' || ch === "'") {
				quote = ch;
				pos++;
				continue;
			}
			if (ch === '(') {
				atomParenDepth++;
				pos++;
				continue;
			}
			if (ch === ')') {
				if (atomParenDepth > 0) {
					atomParenDepth--;
					pos++;
					continue;
				}
				break;
			}
			if (atomParenDepth === 0) {
				if (ch === ',' || expression.slice(pos, pos + 2) === '&&' || expression.slice(pos, pos + 2) === '||') {
					break;
				}
			}
			pos++;
		}
		const atom = expression.slice(start, pos).trim();
		return evaluateConditionAtomOrMatch(atom, values, scopePrefix);
	};

	return parseOr();
}

export function evaluateShowIfCondition(
	expression: SchemaConditionSpec | undefined,
	values: Record<string, unknown>,
	scopePrefix?: string
): boolean {
	return evaluateCondition(expression, values, scopePrefix);
}

export function scrollTabIntoView(
	tabEl: HTMLElement | null,
	inline: ScrollLogicalPosition = 'nearest'
): void {
	if (!tabEl) {
		return;
	}
	const tablist = tabEl.closest?.<HTMLElement>('[data-rw-tablist], [role="tablist"]') ?? null;
	if (tablist && tablist.scrollWidth > tablist.clientWidth) {
		const maxScroll = Math.max(0, tablist.scrollWidth - tablist.clientWidth);
		const isRtl =
			tablist.matches?.(':dir(rtl)') ||
			(typeof document !== 'undefined' && document.documentElement?.dir === 'rtl');
		if (typeof tablist.getBoundingClientRect === 'function' && typeof tabEl.getBoundingClientRect === 'function') {
			const listRect = tablist.getBoundingClientRect();
			const tabRect = tabEl.getBoundingClientRect();
			if (listRect.width > 0 && tabRect.width > 0) {
				let delta = 0;
				if (inline === 'center') {
					delta = tabRect.left - listRect.left - (tablist.clientWidth - tabRect.width) / 2;
				} else if (tabRect.left < listRect.left) {
					delta = tabRect.left - listRect.left;
				} else if (tabRect.right > listRect.right) {
					delta = tabRect.right - listRect.right;
				}
				if (delta !== 0) {
					const next = tablist.scrollLeft + delta;
					tablist.scrollLeft = isRtl ? next : Math.max(0, Math.min(maxScroll, next));
				}
				return;
			}
		}
		const tabLeft = tabEl.offsetLeft;
		const tabWidth = tabEl.offsetWidth;
		if (inline === 'center') {
			const centered = tabLeft - (tablist.clientWidth - tabWidth) / 2;
			tablist.scrollLeft = isRtl ? centered : Math.max(0, Math.min(maxScroll, centered));
			return;
		}
		if (tabLeft < tablist.scrollLeft) {
			tablist.scrollLeft = Math.max(0, tabLeft);
			return;
		}
		if (tabLeft + tabWidth > tablist.scrollLeft + tablist.clientWidth) {
			tablist.scrollLeft = Math.min(maxScroll, tabLeft + tabWidth - tablist.clientWidth);
			return;
		}
		return;
	}
	if (typeof tabEl.scrollIntoView !== 'function') {
		return;
	}
	try {
		tabEl.scrollIntoView({
			block: 'nearest',
			inline,
			container: 'nearest',
		} as ScrollIntoViewOptions);
	} catch {
		tabEl.scrollIntoView({ block: 'nearest', inline });
	}
}

export function navigateTablistByKey(
	event: React.KeyboardEvent<HTMLElement>,
	orientation: 'horizontal' | 'vertical' = 'horizontal'
): void {
	const listEl = event.currentTarget;
	const tabs = Array.from(
		listEl.querySelectorAll<HTMLButtonElement>(':scope > [role="tab"]:not(:disabled)')
	);
	if (tabs.length <= 1) {
		return;
	}

	const focusedTab = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[role="tab"]');
	const currentIndex = focusedTab ? tabs.indexOf(focusedTab) : -1;
	if (currentIndex === -1) {
		return;
	}

	const isRtl =
		orientation === 'horizontal' &&
		(listEl.matches(':dir(rtl)') ||
			(typeof document !== 'undefined' && document.documentElement.dir === 'rtl'));

	let nextIndex = -1;
	if (event.key === 'Home') {
		nextIndex = 0;
	} else if (event.key === 'End') {
		nextIndex = tabs.length - 1;
	} else if (orientation === 'vertical') {
		if (event.key === 'ArrowDown') {
			nextIndex = (currentIndex + 1) % tabs.length;
		} else if (event.key === 'ArrowUp') {
			nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
		}
	} else {
		const forwardKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
		const backwardKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
		if (event.key === forwardKey) {
			nextIndex = (currentIndex + 1) % tabs.length;
		} else if (event.key === backwardKey) {
			nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
		}
	}

	if (nextIndex === -1 || nextIndex === currentIndex) {
		return;
	}

	const targetTab = tabs[nextIndex];
	if (!targetTab) {
		return;
	}
	event.preventDefault();
	targetTab.focus();
	targetTab.click();
	scrollTabIntoView(targetTab);
}
