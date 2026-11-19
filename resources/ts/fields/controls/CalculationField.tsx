import React, { useMemo } from 'react';
import { resolveScopedFieldValue } from '../shared';
import type { ReactInputfieldProps } from '../types';

/**
 * Recursive-descent arithmetic expression evaluator (`+`, `-`, `*`, `/`, `%`, unary `+/-`, parentheses).
 * Safe under strict CSP without `unsafe-eval`.
 */
function parseSafeArithmetic(source: string): number {
	let pos = 0;
	const len = source.length;

	const skipWhitespace = (): void => {
		while (pos < len && /\s/.test(source[pos]!)) {
			pos++;
		}
	};

	const parseExpression = (): number => {
		let left = parseTerm();
		while (true) {
			skipWhitespace();
			const ch = source[pos];
			if (ch === '+' || ch === '-') {
				pos++;
				const right = parseTerm();
				left = ch === '+' ? left + right : left - right;
			} else {
				break;
			}
		}
		return left;
	};

	const parseTerm = (): number => {
		let left = parseUnary();
		while (true) {
			skipWhitespace();
			const ch = source[pos];
			if (ch === '*' || ch === '/' || ch === '%') {
				pos++;
				const right = parseUnary();
				if (ch === '*') {
					left *= right;
				} else if (right === 0) {
					left = Number.NaN;
				} else {
					left = ch === '/' ? left / right : left % right;
				}
			} else {
				break;
			}
		}
		return left;
	};

	const parseUnary = (): number => {
		skipWhitespace();
		const ch = source[pos];
		if (ch === '+') {
			pos++;
			return parseUnary();
		}
		if (ch === '-') {
			pos++;
			return -parseUnary();
		}
		return parsePrimary();
	};

	const parsePrimary = (): number => {
		skipWhitespace();
		if (pos >= len) {
			return Number.NaN;
		}
		if (source[pos] === '(') {
			pos++;
			const inner = parseExpression();
			skipWhitespace();
			if (source[pos] !== ')') {
				return Number.NaN;
			}
			pos++;
			return inner;
		}
		const rest = source.slice(pos);
		const numMatch = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
		if (!numMatch) {
			return Number.NaN;
		}
		pos += numMatch[0].length;
		return Number(numMatch[0]);
	};

	const value = parseExpression();
	skipWhitespace();
	if (pos !== len) {
		return Number.NaN;
	}
	return value;
}

export function evaluateSafeMathFormula(
	formula: string,
	values: Record<string, unknown>,
	precision = 2,
	scopePrefix?: string
): string {
	const safePrecision = Math.max(0, Math.min(6, precision));
	if (!formula.trim()) {
		return (0).toFixed(safePrecision);
	}
	const substituted = formula.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
		const raw = resolveScopedFieldValue(values, key, scopePrefix);
		const num = Array.isArray(raw) ? raw.length : parseFloat(String(raw ?? '0'));
		return Number.isFinite(num) ? `(${String(num)})` : '(0)';
	});
	if (!substituted.trim() || /[^0-9eE+\-*/%().\s]/.test(substituted)) {
		return (0).toFixed(safePrecision);
	}
	const result = parseSafeArithmetic(substituted);
	return Number.isFinite(result) ? result.toFixed(safePrecision) : (0).toFixed(safePrecision);
}

export function CalculationField(props: ReactInputfieldProps): React.ReactElement {
	const precision = props.precision ?? 2;
	const computed = useMemo(
		() => evaluateSafeMathFormula(props.formula || '', props.formValues || {}, precision, props.scopePrefix),
		[props.formula, props.formValues, precision, props.scopePrefix]
	);

	return (
		<div data-rw-control="calculation">
			<input type="hidden" id={props.id} name={props.name} value={computed} />
			<div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3.5 py-2">
				<span className="text-xs text-muted-foreground font-mono">
					{props.formula || 'Computed value'}
				</span>
				<span className="font-mono text-sm font-semibold text-foreground">
					{props.affixPrefix ? `${props.affixPrefix} ` : ''}
					{computed}
					{props.affixSuffix ? ` ${props.affixSuffix}` : ''}
				</span>
			</div>
		</div>
	);
}
