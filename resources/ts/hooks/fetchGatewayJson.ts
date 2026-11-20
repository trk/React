import { getCsrfToken, sanitizeSameOriginUrl, type CsrfTokenSource } from '../lib/utils';

export type GatewayHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface FetchGatewayJsonOptions {
	method?: GatewayHttpMethod;
	payload?: Record<string, unknown>;
	csrfSource?: CsrfTokenSource | null;
	signal?: AbortSignal;
	headers?: Record<string, string>;
}

export interface GatewayJsonResult<T = Record<string, unknown>> {
	ok: boolean;
	status: number;
	data: T | null;
	error?: string;
}

/**
 * Execute a same-origin JSON request against ProcessWire / React gateways
 * with automatic CSRF header + payload injection and safe error normalization.
 */
export async function fetchGatewayJson<T = Record<string, unknown>>(
	endpoint: string,
	options: FetchGatewayJsonOptions = {}
): Promise<GatewayJsonResult<T>> {
	const safeEndpoint = sanitizeSameOriginUrl(endpoint);
	if (!safeEndpoint) {
		return {
			ok: false,
			status: 0,
			data: null,
			error: 'Invalid same-origin endpoint.',
		};
	}

	if (typeof fetch !== 'function') {
		return {
			ok: false,
			status: 0,
			data: null,
			error: 'Fetch API is unavailable.',
		};
	}

	const method: GatewayHttpMethod = options.method ?? 'POST';
	const isBodyMethod = method !== 'GET';
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'X-Requested-With': 'XMLHttpRequest',
		...(isBodyMethod ? { 'Content-Type': 'application/json' } : {}),
		...(options.headers ?? {}),
	};

	let body: string | undefined;
	if (isBodyMethod) {
		const csrf = getCsrfToken(options.csrfSource);
		if (csrf.value) {
			headers['X-CSRF-Token'] = csrf.value;
		}
		const mergedPayload: Record<string, unknown> = {
			...(options.payload ?? {}),
			csrf,
			...(csrf.name && csrf.value ? { [csrf.name]: csrf.value } : {}),
		};
		body = JSON.stringify(mergedPayload);
	}

	try {
		const res = await fetch(safeEndpoint, {
			method,
			credentials: 'same-origin',
			headers,
			signal: options.signal,
			...(body !== undefined ? { body } : {}),
		});

		let parsed: (T & { ok?: unknown; error?: unknown; message?: unknown }) | null = null;
		try {
			const text = await res.text();
			if (text.trim() !== '') {
				parsed = JSON.parse(text) as T & { ok?: unknown; error?: unknown; message?: unknown };
			}
		} catch {
			parsed = null;
		}

		const responseOk = res.ok && (parsed === null || parsed.ok !== false);
		let errorMessage: string | undefined;
		if (!responseOk) {
			if (parsed && typeof parsed.error === 'string' && parsed.error.trim() !== '') {
				errorMessage = parsed.error.trim();
			} else if (
				parsed &&
				parsed.error &&
				typeof parsed.error === 'object' &&
				'message' in parsed.error &&
				typeof (parsed.error as { message?: unknown }).message === 'string'
			) {
				errorMessage = String((parsed.error as { message: string }).message).trim();
			} else if (parsed && typeof parsed.message === 'string' && parsed.message.trim() !== '') {
				errorMessage = parsed.message.trim();
			} else if (res.statusText) {
				errorMessage = res.statusText;
			} else {
				errorMessage = `Request failed (${res.status})`;
			}
		}

		return {
			ok: responseOk,
			status: res.status,
			data: parsed as T | null,
			...(errorMessage ? { error: errorMessage } : {}),
		};
	} catch (err) {
		return {
			ok: false,
			status: 0,
			data: null,
			error: err instanceof Error ? err.message : 'Network request failed.',
		};
	}
}
