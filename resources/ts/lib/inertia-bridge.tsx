import React, { useEffect } from 'react';
import type * as InertiaReactModule from '@inertiajs/react';
import { getCsrfToken, sanitizeHref, sanitizeSameOriginUrl } from './utils';

export type InertiaAdapterSubset = Pick<
	typeof InertiaReactModule,
	| 'createInertiaApp'
	| 'Deferred'
	| 'Head'
	| 'Link'
	| 'router'
	| 'usePage'
	| 'usePoll'
	| 'usePrefetch'
	| 'useRemember'
	| 'WhenVisible'
>;

let inertiaActive = false;
let rawInertiaAdapter: InertiaAdapterSubset | null = null;
let routerShellHookInstalled = false;

export function isWorkspaceShellActive(): boolean {
	if (typeof document !== 'undefined') {
		const mode = document.documentElement.getAttribute('data-rw-shell-mode');
		if (mode === 'workspace') {
			return true;
		}
		if (mode === 'admin') {
			return false;
		}
	}
	if (typeof window !== 'undefined') {
		try {
			return new URLSearchParams(window.location.search).get('ws') === '1';
		} catch {
			return false;
		}
	}
	return false;
}

export function withWorkspaceShellUrl(
	rawUrl: string,
	forceWorkspace = false,
	explicitAdminRoot?: string,
	explicitLauncherUrl?: string
): string {
	if (!rawUrl || (!forceWorkspace && !isWorkspaceShellActive())) {
		return rawUrl;
	}

	const trimmed = rawUrl.trim();
	if (
		trimmed === '' ||
		trimmed.startsWith('#') ||
		/^(?:javascript|mailto|tel|data|blob):/i.test(trimmed)
	) {
		return rawUrl;
	}

	try {
		const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
		const baseHref = typeof window !== 'undefined' ? window.location.href : `${origin}/`;
		const parsed = new URL(trimmed, baseHref);
		if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) {
			return rawUrl;
		}

		if (
			parsed.searchParams.has('ws') ||
			parsed.searchParams.get('modal') === '1' ||
			parsed.searchParams.has('export') ||
			parsed.searchParams.has('download_token')
		) {
			return rawUrl;
		}

		const normalizedPath = parsed.pathname.replace(/\/+$/, '') + '/';
		const adminRootAttr =
			explicitAdminRoot ||
			(typeof document !== 'undefined'
				? document.documentElement.getAttribute('data-rw-admin-root') || '/processwire/'
				: '/processwire/');
		let launcherAttr =
			explicitLauncherUrl ||
			(typeof document !== 'undefined'
				? document.documentElement.getAttribute('data-rw-launcher-path') || ''
				: '');
		if (launcherAttr && /^https?:\/\//i.test(launcherAttr)) {
			try {
				launcherAttr = new URL(launcherAttr, origin).pathname;
			} catch {
				// Keep raw string
			}
		}
		const adminRoot = adminRootAttr.replace(/\/+$/, '') + '/';
		const launcherPath = launcherAttr
			? launcherAttr.replace(/\/+$/, '') + '/'
			: `${adminRoot}workspace/`;

		if (
			!normalizedPath.startsWith(adminRoot) ||
			normalizedPath === adminRoot ||
			normalizedPath === launcherPath ||
			normalizedPath.startsWith(`${adminRoot}login/`) ||
			normalizedPath.includes('/_react/')
		) {
			return rawUrl;
		}

		parsed.searchParams.set('ws', '1');
		if (/^https?:\/\//i.test(trimmed)) {
			return parsed.toString();
		}
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return rawUrl;
	}
}

export function setInertiaAdapter(adapter: InertiaAdapterSubset): void {
	rawInertiaAdapter = adapter;
	if (!routerShellHookInstalled && adapter?.router && typeof adapter.router.on === 'function') {
		routerShellHookInstalled = true;
		try {
			adapter.router.on('before', (event: { detail?: { visit?: { headers?: Record<string, string> } } }) => {
				if (!isWorkspaceShellActive()) {
					return;
				}
				const visit = event?.detail?.visit;
				if (visit && typeof visit === 'object') {
					visit.headers = {
						...(visit.headers || {}),
						'X-React-Shell': 'workspace',
					};
				}
			});
		} catch {
			// Ignore optional router hook registration errors
		}
	}
}

export function getInertiaAdapter(): InertiaAdapterSubset | null {
	return rawInertiaAdapter;
}

export function markInertiaBooted(): void {
	inertiaActive = true;
}

export function isInertiaAppActive(): boolean {
	return inertiaActive;
}

export function visitSameModuleHref(rawUrl: string): boolean {
	if (!inertiaActive || !rawInertiaAdapter?.router || typeof window === 'undefined' || !rawUrl) {
		return false;
	}
	try {
		const target = new URL(rawUrl, window.location.href);
		if (target.origin !== window.location.origin) {
			return false;
		}
		if (
			target.searchParams.get('modal') === '1' ||
			target.searchParams.has('export') ||
			target.searchParams.has('download_token')
		) {
			return false;
		}
		const adminRootAttr =
			typeof document !== 'undefined'
				? document.documentElement.getAttribute('data-rw-admin-root') || '/processwire/'
				: '/processwire/';
		const adminRoot = adminRootAttr.replace(/\/+$/, '') + '/';
		const curPath = window.location.pathname.replace(/\/+$/, '') + '/';
		const tgtPath = target.pathname.replace(/\/+$/, '') + '/';
		if (!curPath.startsWith(adminRoot) || !tgtPath.startsWith(adminRoot)) {
			return false;
		}
		const curRel = curPath.slice(adminRoot.length).split('/').filter(Boolean);
		if (curRel.length === 0) {
			return false;
		}
		const moduleSegments = curRel[0] === 'setup' && curRel.length >= 2 ? 2 : 1;
		const modulePrefix = adminRoot + curRel.slice(0, moduleSegments).join('/') + '/';
		if (!tgtPath.startsWith(modulePrefix)) {
			return false;
		}
		const resolved = sanitizeHref(withWorkspaceShellUrl(rawUrl));
		if (!resolved) {
			return false;
		}
		rawInertiaAdapter.router.visit(resolved);
		return true;
	} catch {
		return false;
	}
}

function resolveHrefString(href: unknown): string {
	if (typeof href === 'string') {
		return href;
	}
	if (href && typeof href === 'object' && 'url' in href && typeof (href as { url?: unknown }).url === 'string') {
		return (href as { url: string }).url;
	}
	return typeof window !== 'undefined' ? window.location.href : '/';
}

function buildGetUrl(rawUrl: string, data?: Record<string, unknown>): string {
	if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
		return rawUrl;
	}
	try {
		const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
		const parsed = new URL(rawUrl, base);
		for (const [key, val] of Object.entries(data)) {
			if (val === undefined || val === null) {
				continue;
			}
			if (Array.isArray(val)) {
				const arrayKey = key.endsWith('[]') ? key : `${key}[]`;
				parsed.searchParams.delete(arrayKey);
				for (const item of val) {
					if (item !== undefined && item !== null) {
						parsed.searchParams.append(arrayKey, String(item));
					}
				}
			} else if (typeof val === 'object') {
				parsed.searchParams.set(key, JSON.stringify(val));
			} else {
				parsed.searchParams.set(key, String(val));
			}
		}
		if (/^https?:\/\//i.test(rawUrl)) {
			return parsed.toString();
		}
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return rawUrl;
	}
}

export function submitNativeFormPost(rawUrl: string, data?: Record<string, unknown>): void {
	if (typeof document === 'undefined') {
		return;
	}

	const safeAction = sanitizeSameOriginUrl(withWorkspaceShellUrl(resolveHrefString(rawUrl)));
	if (!safeAction) {
		return;
	}

	const form = document.createElement('form');
	form.method = 'POST';
	form.action = safeAction;
	form.style.display = 'none';

	const appendInput = (name: string, value: string) => {
		const input = document.createElement('input');
		input.type = 'hidden';
		input.name = name;
		input.value = value;
		form.appendChild(input);
	};

	if (isWorkspaceShellActive()) {
		appendInput('_rw_ws', '1');
	}

	let hasCsrf = false;
	if (typeof FormData !== 'undefined' && data instanceof FormData) {
		const csrfName = getCsrfToken().name;
		data.forEach((v, k) => {
			if (typeof v === 'string') {
				if (csrfName && k === csrfName) {
					hasCsrf = true;
				}
				appendInput(k, v);
			}
		});
	} else {
		const payload = data && typeof data === 'object' ? data : {};
		hasCsrf = Boolean(getCsrfToken().name && getCsrfToken().name in payload);
		for (const [key, val] of Object.entries(payload)) {
			if (val === undefined || val === null) {
				continue;
			}
			if (Array.isArray(val)) {
				const arrayKey = key.endsWith('[]') ? key : `${key}[]`;
				for (const item of val) {
					if (item !== undefined && item !== null) {
						appendInput(arrayKey, typeof item === 'object' ? JSON.stringify(item) : String(item));
					}
				}
			} else if (typeof val === 'boolean') {
				appendInput(key, val ? '1' : '0');
			} else if (typeof val === 'object') {
				appendInput(key, JSON.stringify(val));
			} else {
				appendInput(key, String(val));
			}
		}
	}

	const csrf = getCsrfToken();
	if (csrf.name && csrf.value && !hasCsrf) {
		appendInput(csrf.name, csrf.value);
	}

	document.body.appendChild(form);
	form.submit();
}

function IslandHead({ title }: { title?: string }): null {
	useEffect(() => {
		if (typeof document !== 'undefined' && title) {
			document.title = title;
		}
	}, [title]);

	return null;
}

const SafeHeadImpl: React.FC<{ title?: string } & Record<string, unknown>> = (props) => {
	if (inertiaActive && rawInertiaAdapter) {
		const InertiaHead = rawInertiaAdapter.Head as unknown as React.ComponentType<Record<string, unknown>>;
		return React.createElement(InertiaHead, props);
	}
	return React.createElement(IslandHead, { title: props?.title });
};

export const SafeHead = SafeHeadImpl as unknown as typeof InertiaReactModule.Head;

interface FallbackVisitOptions {
	method?: string;
	data?: Record<string, unknown>;
	replace?: boolean;
	onBefore?: (visit: { url: string; method: string; data?: Record<string, unknown> }) => void;
	onStart?: (visit: { url: string; method: string; data?: Record<string, unknown> }) => void;
}

interface SafeLinkProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onError' | 'onProgress' | 'onClick'> {
	href?: string | { url: string };
	method?: string;
	data?: Record<string, unknown>;
	as?: string;
	onClick?: (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
	children?: React.ReactNode;
	target?: string;
	rel?: string;
	disabled?: boolean;
	'data-rw-admin-return'?: unknown;
	'data-rw-no-ws'?: unknown;
	preserveScroll?: unknown;
	preserveState?: unknown;
	replace?: unknown;
	only?: unknown;
	except?: unknown;
	headers?: unknown;
	queryStringArrayFormat?: unknown;
	async?: unknown;
	prefetch?: unknown;
	cacheFor?: unknown;
	viewTransition?: unknown;
	onCancelToken?: unknown;
	onBefore?: unknown;
	onStart?: unknown;
	onProgress?: unknown;
	onFinish?: unknown;
	onCancel?: unknown;
	onSuccess?: unknown;
	onError?: unknown;
}

const SafeLinkImpl = React.forwardRef<HTMLAnchorElement | HTMLButtonElement, SafeLinkProps>((props, ref) => {
	const skipWorkspaceParam =
		props?.['data-rw-admin-return'] !== undefined || props?.['data-rw-no-ws'] !== undefined;
	const rawResolvedPropHref =
		props?.href !== undefined ? sanitizeHref(resolveHrefString(props.href)) : undefined;
	const safePropHref =
		rawResolvedPropHref && !skipWorkspaceParam
			? sanitizeHref(withWorkspaceShellUrl(rawResolvedPropHref))
			: rawResolvedPropHref;
	if (inertiaActive && rawInertiaAdapter) {
		const InertiaLink = rawInertiaAdapter.Link as unknown as React.ComponentType<Record<string, unknown>>;
		return React.createElement(InertiaLink, { ...props, href: safePropHref || '#', ref });
	}

	const {
		href,
		method,
		data,
		as,
		onClick,
		children,
		preserveScroll: _preserveScroll,
		preserveState: _preserveState,
		replace: _replace,
		only: _only,
		except: _except,
		headers: _headers,
		queryStringArrayFormat: _queryStringArrayFormat,
		async: _async,
		prefetch: _prefetch,
		cacheFor: _cacheFor,
		viewTransition: _viewTransition,
		onCancelToken: _onCancelToken,
		onBefore: _onBefore,
		onStart: _onStart,
		onProgress: _onProgress,
		onFinish: _onFinish,
		onCancel: _onCancel,
		onSuccess: _onSuccess,
		onError: _onError,
		...domProps
	} = props;

	const rawFallbackHref = sanitizeHref(resolveHrefString(href));
	const resolvedHref =
		rawFallbackHref && !skipWorkspaceParam
			? sanitizeHref(withWorkspaceShellUrl(rawFallbackHref))
			: rawFallbackHref;
	const httpMethod = String(method || 'get').toLowerCase();

	if (as === 'button' || httpMethod !== 'get') {
		const buttonProps = domProps as React.ButtonHTMLAttributes<HTMLButtonElement>;
		return (
			<button
				ref={ref as React.ForwardedRef<HTMLButtonElement>}
				type="button"
				{...buttonProps}
				onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
					onClick?.(e);
					if (e.defaultPrevented || !resolvedHref) {
						return;
					}
					if (httpMethod === 'get') {
						const safeTarget = sanitizeHref(buildGetUrl(resolvedHref, data));
						if (safeTarget) {
							window.location.href = safeTarget;
						}
					} else {
						const safePostTarget = sanitizeSameOriginUrl(resolveHrefString(href));
						if (!safePostTarget) {
							return;
						}
						const postData =
							httpMethod === 'post'
								? data
								: { ...(data || {}), _method: httpMethod.toUpperCase() };
						submitNativeFormPost(safePostTarget, postData);
					}
				}}
			>
				{children}
			</button>
		);
	}

	const finalHref = sanitizeHref(buildGetUrl(resolvedHref, data)) || '#';
	const anchorProps = domProps as React.AnchorHTMLAttributes<HTMLAnchorElement>;
	return (
		<a
			ref={ref as React.ForwardedRef<HTMLAnchorElement>}
			href={finalHref}
			{...anchorProps}
			onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
				onClick?.(e);
			}}
		>
			{children}
		</a>
	);
});
SafeLinkImpl.displayName = 'SafeInertiaLink';

export const SafeLink = SafeLinkImpl as unknown as typeof InertiaReactModule.Link;

function safeUsePageImpl<T extends Record<string, unknown> = Record<string, unknown>>() {
	if (rawInertiaAdapter) {
		try {
			return rawInertiaAdapter.usePage<T>();
		} catch {
			// Fall back when rendered outside Inertia <App> context
		}
	}
	return {
		component: '',
		props: {} as T,
		url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
		version: null,
		scrollRegions: [],
		rememberedState: {},
	};
}

export const safeUsePage = safeUsePageImpl as unknown as typeof InertiaReactModule.usePage;

export const safeRouter: typeof InertiaReactModule.router = new Proxy({} as typeof InertiaReactModule.router, {
	get(_target, prop) {
		if (inertiaActive && rawInertiaAdapter) {
			if (
				isWorkspaceShellActive() &&
				(prop === 'visit' ||
					prop === 'get' ||
					prop === 'post' ||
					prop === 'put' ||
					prop === 'patch' ||
					prop === 'delete')
			) {
				const fn = Reflect.get(rawInertiaAdapter.router, prop, rawInertiaAdapter.router);
				if (typeof fn === 'function') {
					return (url: unknown, ...rest: unknown[]) => {
						const transformedUrl =
							typeof url === 'string'
								? withWorkspaceShellUrl(url)
								: url && typeof url === 'object' && 'url' in (url as Record<string, unknown>)
									? { ...(url as Record<string, unknown>), url: withWorkspaceShellUrl(resolveHrefString(url)) }
									: url;
						return (fn as (...args: unknown[]) => unknown).apply(rawInertiaAdapter!.router, [
							transformedUrl,
							...rest,
						]);
					};
				}
			}
			const val = Reflect.get(rawInertiaAdapter.router, prop, rawInertiaAdapter.router);
			return typeof val === 'function' ? val.bind(rawInertiaAdapter.router) : val;
		}

		if (prop === 'visit') {
			return (url: unknown, options?: FallbackVisitOptions) => {
				const targetUrl = withWorkspaceShellUrl(resolveHrefString(url));
				const method = String(options?.method || 'get').toLowerCase();
				const data = options?.data;
				if (method === 'get') {
					const safeTarget = sanitizeHref(buildGetUrl(targetUrl, data));
					if (!safeTarget) {
						return;
					}
					options?.onBefore?.({ url: safeTarget, method, data });
					options?.onStart?.({ url: safeTarget, method, data });
					if (typeof window !== 'undefined') {
						if (options?.replace) {
							window.location.replace(safeTarget);
						} else {
							window.location.href = safeTarget;
						}
					}
				} else {
					const safeTarget = sanitizeSameOriginUrl(targetUrl);
					if (!safeTarget) {
						return;
					}
					options?.onBefore?.({ url: safeTarget, method, data });
					options?.onStart?.({ url: safeTarget, method, data });
					const postData =
						method === 'post' ? data : { ...(data || {}), _method: method.toUpperCase() };
					submitNativeFormPost(safeTarget, postData);
				}
			};
		}

		if (prop === 'get') {
			return (url: unknown, data?: Record<string, unknown>, options?: FallbackVisitOptions) => {
				const safeTarget = sanitizeHref(buildGetUrl(withWorkspaceShellUrl(resolveHrefString(url)), data));
				if (!safeTarget) {
					return;
				}
				options?.onStart?.({ url: safeTarget, method: 'get', data });
				if (typeof window !== 'undefined') {
					if (options?.replace) {
						window.location.replace(safeTarget);
					} else {
						window.location.href = safeTarget;
					}
				}
			};
		}

		if (prop === 'post') {
			return (url: unknown, data?: Record<string, unknown>, options?: FallbackVisitOptions) => {
				const safeTarget = sanitizeSameOriginUrl(withWorkspaceShellUrl(resolveHrefString(url)));
				if (!safeTarget) {
					return;
				}
				options?.onStart?.({ url: safeTarget, method: 'post', data });
				submitNativeFormPost(safeTarget, data);
			};
		}

		if (prop === 'put' || prop === 'patch' || prop === 'delete') {
			const verb = String(prop).toUpperCase();
			return (url: unknown, data?: Record<string, unknown>, options?: FallbackVisitOptions) => {
				const safeTarget = sanitizeSameOriginUrl(withWorkspaceShellUrl(resolveHrefString(url)));
				if (!safeTarget) {
					return;
				}
				options?.onStart?.({ url: safeTarget, method: String(prop), data });
				submitNativeFormPost(safeTarget, { ...(data || {}), _method: verb });
			};
		}

		if (prop === 'reload') {
			return () => {
				if (typeof window !== 'undefined') {
					window.location.reload();
				}
			};
		}

		if (rawInertiaAdapter) {
			const fallback = Reflect.get(rawInertiaAdapter.router, prop, rawInertiaAdapter.router);
			return typeof fallback === 'function' ? fallback.bind(rawInertiaAdapter.router) : fallback;
		}
		return () => {};
	},
});
