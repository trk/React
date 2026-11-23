import { fetchGatewayJson } from '../hooks/fetchGatewayJson';
import { withWorkspaceShellUrl } from '../lib/inertia-bridge';
import { sanitizeSameOriginUrl } from '../lib/utils';
import type { CommandPaletteItem } from './types';

export interface CommandSearchApiResponse {
	ok?: boolean;
	query?: string;
	items?: unknown;
}

export interface NormalizeRemoteCommandItemsOptions {
	defaultGroup: string;
	showGlobalWorkspaceBar: boolean;
	adminUrl?: string;
	launcherUrl?: string;
}

export interface ScheduleCommandSearchOptions extends NormalizeRemoteCommandItemsOptions {
	open: boolean;
	endpoint?: string;
	query: string;
	debounceMs?: number;
	onSearchingChange: (searching: boolean) => void;
	onResults: (items: CommandPaletteItem[]) => void;
}

const SAFE_ICON_PATTERN = /^[a-z0-9-]+$/;

/**
 * Normalize, validate, and shell-wrap remote command search results from `/_react/command-search`.
 */
export function normalizeRemoteCommandItems(
	rawItems: unknown,
	options: NormalizeRemoteCommandItemsOptions
): CommandPaletteItem[] {
	if (!Array.isArray(rawItems)) {
		return [];
	}

	const normalized: CommandPaletteItem[] = [];
	const seenIds = new Set<string>();

	for (let index = 0; index < rawItems.length; index++) {
		const row = rawItems[index];
		if (!row || typeof row !== 'object') {
			continue;
		}

		const candidate = row as Record<string, unknown>;
		const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
		if (label === '') {
			continue;
		}

		const rawHref = typeof candidate.href === 'string' ? candidate.href : '';
		const safeHref = sanitizeSameOriginUrl(rawHref);
		if (safeHref === '') {
			continue;
		}

		const isInertia = candidate.isInertia !== false;
		const resolvedHref = isInertia
			? withWorkspaceShellUrl(
					safeHref,
					options.showGlobalWorkspaceBar,
					options.adminUrl,
					options.launcherUrl
				)
			: safeHref;

		const rawId = typeof candidate.id === 'string' ? candidate.id.trim() : '';
		const baseId = rawId !== '' ? `remote-${rawId}` : `remote-${index}`;
		if (seenIds.has(baseId)) {
			continue;
		}
		seenIds.add(baseId);

		const rawIcon = typeof candidate.icon === 'string' ? candidate.icon.trim() : '';
		const icon = SAFE_ICON_PATTERN.test(rawIcon) ? rawIcon : 'file-text';

		const rawGroup = typeof candidate.group === 'string' ? candidate.group.trim() : '';
		const group = rawGroup !== '' ? rawGroup : options.defaultGroup;

		const subtitle = typeof candidate.subtitle === 'string' ? candidate.subtitle.trim() : '';
		const rawBadge = typeof candidate.badge === 'string' ? candidate.badge.trim() : '';

		normalized.push({
			id: baseId,
			label,
			subtitle,
			badge: rawBadge !== '' ? rawBadge : undefined,
			group,
			icon,
			href: resolvedHref,
			isInertia,
		});
	}

	return normalized;
}

/**
 * Schedule a debounced, abortable command-search request when the palette is open and query length >= 2.
 */
export function scheduleCommandSearch(options: ScheduleCommandSearchOptions): () => void {
	const trimmed = options.query.trim().slice(0, 80);
	const rawEndpoint = typeof options.endpoint === 'string' ? options.endpoint.trim() : '';
	const safeEndpoint = rawEndpoint !== '' ? sanitizeSameOriginUrl(rawEndpoint) : '';

	if (!options.open || safeEndpoint === '' || trimmed.length < 2) {
		options.onSearchingChange(false);
		options.onResults([]);
		return () => {};
	}

	let disposed = false;
	let controller: AbortController | null = null;
	const debounceMs = Math.max(0, options.debounceMs ?? 180);
	options.onSearchingChange(true);

	const timer = setTimeout(() => {
		if (disposed) {
			return;
		}

		controller = new AbortController();
		const activeController = controller;
		const separator = safeEndpoint.includes('?') ? '&' : '?';
		const requestUrl = `${safeEndpoint}${separator}q=${encodeURIComponent(trimmed)}`;

		void fetchGatewayJson<CommandSearchApiResponse>(requestUrl, {
			method: 'GET',
			signal: activeController.signal,
		})
			.then((res) => {
				if (disposed || activeController.signal.aborted) {
					return;
				}
				if (res.ok && res.data && Array.isArray(res.data.items)) {
					options.onResults(
						normalizeRemoteCommandItems(res.data.items, {
							defaultGroup: options.defaultGroup,
							showGlobalWorkspaceBar: options.showGlobalWorkspaceBar,
							adminUrl: options.adminUrl,
							launcherUrl: options.launcherUrl,
						})
					);
				} else {
					options.onResults([]);
				}
				options.onSearchingChange(false);
			})
			.catch(() => {
				if (disposed || activeController.signal.aborted) {
					return;
				}
				options.onResults([]);
				options.onSearchingChange(false);
			});
	}, debounceMs);

	return () => {
		disposed = true;
		clearTimeout(timer);
		if (controller) {
			controller.abort();
		}
	};
}
