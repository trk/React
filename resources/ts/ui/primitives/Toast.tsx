import React from 'react';
import { Toast as BaseToast } from '@base-ui/react/toast';
import { t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { getPortalContainer } from '../../portal/PortalRoot';

export type ToastVariant = 'default' | 'success' | 'warning' | 'danger';

export const toastManager = BaseToast.createToastManager();

export function useToast() {
	return BaseToast.useToastManager();
}

export interface ToastProviderProps {
	timeout?: number;
	limit?: number;
	children?: React.ReactNode;
}

export function ToastProvider({
	timeout = 5000,
	limit = 4,
	children,
}: ToastProviderProps): React.ReactElement {
	return (
		<BaseToast.Provider toastManager={toastManager} timeout={timeout} limit={limit}>
			{children}
			<ToastViewport />
		</BaseToast.Provider>
	);
}

export function ToastViewport({ className }: { className?: string }): React.ReactElement {
	const { toasts } = BaseToast.useToastManager();

	return (
		<BaseToast.Portal container={getPortalContainer()}>
			<BaseToast.Viewport
				aria-label={t('common.notifications', 'Notifications')}
				className={cn(
					'fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 outline-none',
					className
				)}
			>
				{toasts.map((item) => {
					const tone = item.type === 'success' || item.type === 'warning' || item.type === 'danger'
						? item.type
						: 'default';
					const iconName =
						tone === 'success'
							? 'check-circle'
							: tone === 'warning'
								? 'alert-triangle'
								: tone === 'danger'
									? 'alert-circle'
									: 'info';
					const iconToneCls =
						tone === 'success'
							? 'text-success'
							: tone === 'warning'
								? 'text-warning'
								: tone === 'danger'
									? 'text-destructive'
									: 'text-primary';

					return (
						<BaseToast.Root
							key={item.id}
							toast={item}
							data-rw-portal-overlay=""
							className="flex items-start gap-2.5 rounded-lg border border-border bg-popover p-3.5 text-popover-foreground shadow-lg transition-[opacity,transform] duration-150 motion-reduce:transition-none data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
						>
							<DynamicIcon name={iconName} className={cn('mt-0.5 size-4 shrink-0', iconToneCls)} aria-hidden="true" />
							<BaseToast.Content className="min-w-0 flex-1 space-y-0.5">
								{item.title ? (
									<BaseToast.Title className="text-xs font-semibold text-foreground" />
								) : null}
								{item.description ? (
									<BaseToast.Description className="text-xs text-muted-foreground" />
								) : null}
							</BaseToast.Content>
							<BaseToast.Close
								aria-label={t('common.close', 'Close')}
								className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
							>
								<DynamicIcon name="x" className="size-3.5" aria-hidden="true" />
							</BaseToast.Close>
						</BaseToast.Root>
					);
				})}
			</BaseToast.Viewport>
		</BaseToast.Portal>
	);
}
