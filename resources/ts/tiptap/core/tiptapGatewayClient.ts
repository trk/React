import { getReactWorkspaceRuntime } from '../../runtime';
import type { PwImagePickerItem, TiptapPwContext } from './tiptapTypes';

export async function fetchTiptapGet<T = Record<string, unknown>>(
	pwContext: TiptapPwContext,
	params: Record<string, string | number | boolean | undefined>
): Promise<T | null> {
	const { Hooks, Utils } = getReactWorkspaceRuntime();
	const endpoint = Utils.sanitizeSameOriginUrl(pwContext.endpoint || '/_react/tiptap');
	const token = String(pwContext.tiptapToken || '').trim();
	if (!endpoint || !token || typeof window === 'undefined') {
		return null;
	}
	const url = new URL(endpoint, window.location.origin);
	url.searchParams.set('tiptapToken', token);
	for (const [k, v] of Object.entries(params)) {
		if (v !== undefined && v !== null && String(v) !== '') {
			url.searchParams.set(k, String(v));
		}
	}
	const res = await Hooks.fetchGatewayJson<T>(url.toString(), { method: 'GET' });
	return res.ok ? res.data : null;
}

export async function postTiptapJson<T = Record<string, unknown>>(
	pwContext: TiptapPwContext,
	payload: Record<string, unknown>
): Promise<T> {
	const { Hooks, Utils } = getReactWorkspaceRuntime();
	const endpoint = Utils.sanitizeSameOriginUrl(pwContext.endpoint || '/_react/tiptap');
	const token = String(pwContext.tiptapToken || '').trim();
	if (!endpoint || !token || typeof window === 'undefined') {
		throw new Error('Editor context is unavailable.');
	}
	const res = await Hooks.fetchGatewayJson<T & { ok?: unknown }>(endpoint, {
		method: 'POST',
		payload: {
			...payload,
			tiptapToken: token,
		},
	});
	if (!res.ok || !res.data || !res.data.ok) {
		throw new Error(res.error || `HTTP ${res.status}`);
	}
	return res.data as T;
}

export async function uploadTiptapImages(
	pwContext: TiptapPwContext,
	files: File[],
	options?: { pageId?: number; fieldName?: string; mediaToken?: string }
): Promise<PwImagePickerItem[]> {
	const { Utils } = getReactWorkspaceRuntime();
	const endpoint = Utils.sanitizeSameOriginUrl(pwContext.endpoint || '/_react/tiptap');
	const token = String(pwContext.tiptapToken || '').trim();
	if (!endpoint || !token || typeof window === 'undefined' || files.length === 0) {
		throw new Error('Image upload is unavailable.');
	}
	const { getCsrfToken } = getReactWorkspaceRuntime();
	const csrf = getCsrfToken();
	const formData = new FormData();
	formData.append('action', 'upload');
	formData.append('tiptapToken', token);
	if (options?.mediaToken) {
		formData.append('mediaToken', options.mediaToken);
	}
	if (options?.pageId && options.pageId > 0) {
		formData.append('pageId', String(options.pageId));
	}
	if (options?.fieldName) {
		formData.append('fieldName', options.fieldName);
	}
	if (csrf.name && csrf.value) {
		formData.append(csrf.name, csrf.value);
	}
	for (const file of files) {
		formData.append('files[]', file);
	}

	const headers: Record<string, string> = {
		Accept: 'application/json',
		'X-Requested-With': 'XMLHttpRequest',
	};
	if (csrf.name && csrf.value) {
		headers['X-CSRF-TOKEN'] = csrf.value;
	}

	const res = await window.fetch(endpoint, {
		method: 'POST',
		credentials: 'same-origin',
		headers,
		body: formData,
	});
	const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
	if (!res.ok || !data?.ok) {
		throw new Error(String(data?.error || `HTTP ${res.status}`));
	}
	const hostPageId = pwContext.editPageId || pwContext.pageId || 0;
	if (
		typeof window !== 'undefined' &&
		hostPageId > 0 &&
		Number(data.pageId) === hostPageId &&
		typeof data.fieldName === 'string' &&
		/^[a-zA-Z0-9_]+$/.test(data.fieldName)
	) {
		const jq = (
			window as unknown as {
				jQuery?: (selector: string) => { length?: number; trigger?: (eventName: string) => void };
			}
		).jQuery;
		if (typeof jq === 'function') {
			const wrap = jq(`#wrap_Inputfield_${data.fieldName}`);
			if (wrap && (wrap.length ?? 0) > 0 && typeof wrap.trigger === 'function') {
				wrap.trigger('reload');
			}
		}
	}
	return Array.isArray(data.uploaded) ? (data.uploaded as PwImagePickerItem[]) : [];
}
