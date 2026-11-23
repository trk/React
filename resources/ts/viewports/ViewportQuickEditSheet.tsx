import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SchemaFormProps } from '../fields/types';
import { t } from '../lib/i18n';
import { DynamicIcon, sanitizeHref } from '../lib/utils';
import { Button, PortalRoot, Skeleton, useModalDialogController } from '../ui';
import type { ViewportQuickEditSpec } from './types';
import { ViewportLink } from './viewportShared';

interface QuickEditWindowRuntime {
	Fields?: {
		SchemaForm?: React.ComponentType<SchemaFormProps>;
	};
	ensureFieldsLoaded?: () => Promise<void>;
	loadRuntimeScript?: (fileNameOrUrl: string) => Promise<void>;
	loadRuntimeStyle?: (fileNameOrUrl: string) => void;
}

function getQuickEditRuntime(): QuickEditWindowRuntime | undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}
	return (window as unknown as { ReactWorkspaceRuntime?: QuickEditWindowRuntime }).ReactWorkspaceRuntime;
}

function extractFormPayload(
	values: Record<string, unknown>,
	formEl?: HTMLFormElement | null
): Record<string, unknown> {
	if (!formEl || typeof FormData === 'undefined') {
		return {
			...values,
			_rw_quick_edit_form: '1',
		};
	}

	const formData = new FormData(formEl);
	const payload: Record<string, unknown> = {};
	for (const [key, entryValue] of formData.entries()) {
		if (typeof entryValue !== 'string') {
			continue;
		}
		if (key.endsWith('[]')) {
			const baseKey = key.slice(0, -2);
			const existing = payload[baseKey];
			payload[baseKey] = Array.isArray(existing) ? [...existing, entryValue] : [entryValue];
			continue;
		}
		if (Object.prototype.hasOwnProperty.call(payload, key)) {
			const existing = payload[key];
			payload[key] = Array.isArray(existing) ? [...existing, entryValue] : [existing, entryValue];
			continue;
		}
		payload[key] = entryValue;
	}

	payload._rw_quick_edit_form = '1';
	return payload;
}

export interface ViewportQuickEditSheetProps {
	quickEdit: ViewportQuickEditSpec | null | undefined;
	busy: boolean;
	onClose: () => void;
	onSave: (formData: Record<string, unknown>) => void | Promise<void>;
	schemaFormComponent?: React.ComponentType<SchemaFormProps>;
	ssrFallback?: boolean;
}

export function ViewportQuickEditSheet({
	quickEdit,
	busy,
	onClose,
	onSave,
	schemaFormComponent,
	ssrFallback = false,
}: ViewportQuickEditSheetProps): React.ReactElement | null {
	const quickEditTitleId = useId();
	const quickEditDialogRef = useRef<HTMLDialogElement | null>(null);
	const [readyAssetKey, setReadyAssetKey] = useState('');
	const [loadError, setLoadError] = useState<string | null>(null);
	const [retryToken, setRetryToken] = useState(0);

	const quickEditCtrl = useModalDialogController(
		quickEditDialogRef,
		Boolean(quickEdit),
		(open) => {
			if (!open) {
				onClose();
			}
		}
	);

	const styleAssets = useMemo(
		() =>
			Array.isArray(quickEdit?.styleAssets)
				? Array.from(new Set(quickEdit.styleAssets.map((s) => String(s || '').trim()).filter(Boolean)))
				: [],
		[quickEdit?.styleAssets]
	);

	const scriptAssets = useMemo(
		() =>
			Array.isArray(quickEdit?.scriptAssets)
				? Array.from(new Set(quickEdit.scriptAssets.map((s) => String(s || '').trim()).filter(Boolean)))
				: [],
		[quickEdit?.scriptAssets]
	);

	const requiredScriptsKey = useMemo(() => scriptAssets.join('|'), [scriptAssets]);
	const requiredAssetKey = `${quickEdit?.recordId || ''}::${requiredScriptsKey}`;

	const runtime = getQuickEditRuntime();
	const needsFieldsLoad = !schemaFormComponent && typeof runtime?.ensureFieldsLoaded === 'function';
	const needsScriptLoad = !schemaFormComponent && scriptAssets.length > 0 && typeof runtime?.loadRuntimeScript === 'function';

	useEffect(() => {
		if (!quickEdit) {
			setLoadError(null);
			return;
		}

		const rt = getQuickEditRuntime();
		for (const cssAsset of styleAssets) {
			rt?.loadRuntimeStyle?.(cssAsset);
		}

		const shouldLoadFields = !schemaFormComponent && typeof rt?.ensureFieldsLoaded === 'function';
		const shouldLoadScripts = !schemaFormComponent && scriptAssets.length > 0 && typeof rt?.loadRuntimeScript === 'function';

		if (!shouldLoadFields && !shouldLoadScripts) {
			setLoadError(null);
			setReadyAssetKey(requiredAssetKey);
			return;
		}

		let cancelled = false;
		setLoadError(null);

		const tasks: Promise<void>[] = [];
		if (shouldLoadFields && rt?.ensureFieldsLoaded) {
			tasks.push(rt.ensureFieldsLoaded());
		}
		if (shouldLoadScripts && rt?.loadRuntimeScript) {
			for (const scriptAsset of scriptAssets) {
				tasks.push(rt.loadRuntimeScript(scriptAsset));
			}
		}

		void Promise.all(tasks)
			.then(() => {
				if (cancelled) {
					return;
				}
				setReadyAssetKey(requiredAssetKey);
			})
			.catch((err: unknown) => {
				if (cancelled) {
					return;
				}
				const message =
					err instanceof Error && err.message
						? err.message
						: t('viewport.quickEditLoadFailed', 'Failed to load form assets.');
				setLoadError(message);
			});

		return () => {
			cancelled = true;
		};
	}, [quickEdit, styleAssets, scriptAssets, requiredAssetKey, schemaFormComponent, retryToken]);

	const ResolvedSchemaForm = schemaFormComponent ?? runtime?.Fields?.SchemaForm ?? null;
	const assetsReady =
		typeof window === 'undefined' ||
		Boolean(schemaFormComponent) ||
		(!needsFieldsLoad && !needsScriptLoad) ||
		readyAssetKey === requiredAssetKey;

	const resolvedFormId = useMemo(() => {
		const rawId = quickEdit?.formSchema?.id;
		if (typeof rawId === 'string' && rawId.trim() !== '') {
			return rawId.trim();
		}
		return `${quickEditTitleId}-form`;
	}, [quickEdit?.formSchema?.id, quickEditTitleId]);

	const normalizedSchema = useMemo<SchemaFormProps['schema'] | null>(() => {
		if (!quickEdit?.formSchema || typeof quickEdit.formSchema !== 'object') {
			return null;
		}
		const base = quickEdit.formSchema as unknown as SchemaFormProps['schema'];
		return {
			...base,
			id: resolvedFormId,
			submits: [],
			submitLabel: undefined,
			dirtyGuard: false,
		};
	}, [quickEdit?.formSchema, resolvedFormId]);

	if (!quickEdit) {
		return null;
	}

	const safeEditUrl = quickEdit.editUrl ? sanitizeHref(quickEdit.editUrl) : '';
	const headerTitle =
		quickEdit.recordId === '__new__'
			? t('viewport.newItem', 'New Item')
			: t(
					'viewport.quickEditTitle',
					{ title: quickEdit.title || quickEdit.recordId },
					'Quick Edit: {title}'
				);

	const canSubmit = Boolean(ResolvedSchemaForm && assetsReady && normalizedSchema && !loadError && !busy);

	return (
		<PortalRoot ssrFallback={ssrFallback}>
			<dialog
				ref={quickEditDialogRef}
				data-rw-modal-dialog=""
				data-rw-quick-edit-dialog=""
				data-rw-portal-overlay=""
				data-rw-surface="elevated"
				aria-labelledby={quickEditTitleId}
				{...({ closedby: 'any' } as Record<string, string>)}
				onPointerDown={quickEditCtrl.handlePointerDown}
				onPointerUp={quickEditCtrl.handlePointerUp}
				onClose={quickEditCtrl.handleClose}
				className="max-w-3xl text-card-foreground"
			>
				<div className="flex items-start justify-between gap-3 border-b border-border/75 px-6 py-4 shrink-0">
					<div className="min-w-0">
						<h2
							id={quickEditTitleId}
							className="truncate text-[15px] font-semibold tracking-tight text-foreground"
						>
							{headerTitle}
						</h2>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{t('viewport.quickEditSubtitle', 'Edit key fields without leaving this list.')}
						</p>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						icon="x"
						aria-label={t('common.close', 'Close')}
						onClick={onClose}
					/>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
					{loadError ? (
						<div
							role="alert"
							className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive"
						>
							<p>{loadError}</p>
							<Button
								type="button"
								variant="outline"
								size="xs"
								icon="rotate-ccw"
								onClick={() => setRetryToken((n) => n + 1)}
							>
								{t('common.retry', 'Retry')}
							</Button>
						</div>
					) : ResolvedSchemaForm && assetsReady && normalizedSchema ? (
						<ResolvedSchemaForm
							key={quickEdit.recordId}
							schema={normalizedSchema}
							surface="plain"
							onSubmit={(values, formEl) => onSave(extractFormPayload(values, formEl))}
						/>
					) : (
						<div className="space-y-4 py-1" aria-busy="true">
							<div className="space-y-2">
								<Skeleton className="h-3.5 w-28" />
								<Skeleton className="h-9 w-full" />
							</div>
							<div className="space-y-2">
								<Skeleton className="h-3.5 w-32" />
								<Skeleton className="h-24 w-full" />
							</div>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Skeleton className="h-3.5 w-24" />
									<Skeleton className="h-9 w-full" />
								</div>
								<div className="space-y-2">
									<Skeleton className="h-3.5 w-24" />
									<Skeleton className="h-9 w-full" />
								</div>
							</div>
						</div>
					)}
				</div>

				<div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-t border-border/75 bg-muted/30 px-6 py-3.5">
					<div className="min-w-0">
						{safeEditUrl ? (
							<ViewportLink
								href={safeEditUrl}
								data-rw-quick-edit-full-link=""
								className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
							>
								<DynamicIcon name="external-link" className="size-3.5 shrink-0" aria-hidden="true" />
								<span>{t('viewport.openFullEditor', 'Open Full Editor')}</span>
							</ViewportLink>
						) : null}
					</div>
					<div className="flex items-center gap-2.5">
						<Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
							{t('common.cancel', 'Cancel')}
						</Button>
						<Button
							type="submit"
							form={resolvedFormId}
							size="sm"
							icon="save"
							disabled={!canSubmit}
						>
							{t('viewport.saveChanges', 'Save Changes')}
						</Button>
					</div>
				</div>
			</dialog>
		</PortalRoot>
	);
}
