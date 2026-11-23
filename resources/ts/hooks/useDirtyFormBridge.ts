import { useCallback, useEffect, useState } from 'react';

export interface UseDirtyFormBridgeOptions {
	formId?: string;
	inputfieldElement?: Element | null;
}

export interface UseDirtyFormBridgeResult {
	dirty: boolean;
	setDirty: (next: boolean) => void;
}

type SchemaFormDirtyHostElement = HTMLElement & {
	__rwSchemaFormContext?: {
		updateFieldValue?: (name: string, value: unknown) => void;
	};
};

/**
 * Broadcast dirty form status to workspace headers and classic ProcessWire inputfield wrappers.
 */
export function dispatchDirtyFormState(isDirty: boolean, formId?: string): void {
	if (typeof window === 'undefined') {
		return;
	}
	window.dispatchEvent(
		new CustomEvent('rw:schema-form-dirty', {
			detail: { isDirty, ...(formId ? { formId } : {}) },
		}),
	);
}

/**
 * Marks both classic ProcessWire `.Inputfield` wrappers (`InputfieldStateChanged`)
 * and enclosing React `SchemaForm` roots (`[data-rw-schema-form]`) as having unsaved changes.
 */
export function markHostFormDirty(
	hostEl: HTMLElement | null | undefined,
	dirtyKey = '_rw_dirty_rev',
): void {
	if (!hostEl || typeof window === 'undefined') {
		return;
	}
	if (hostEl.closest('.InputfieldIgnoreChanges')) {
		return;
	}

	const jq = (window as unknown as {
		jQuery?: (el: HTMLElement) => { trigger: (ev: string) => void };
	}).jQuery;
	let curInputfield = hostEl.closest<HTMLElement>('.Inputfield');
	while (curInputfield && !curInputfield.classList.contains('InputfieldWrapper')) {
		if (!curInputfield.classList.contains('InputfieldIgnoreChanges')) {
			const wasChanged = curInputfield.classList.contains('InputfieldStateChanged');
			curInputfield.classList.add('InputfieldStateChanged');
			if (!wasChanged && typeof jq === 'function') {
				const targetInputfield = curInputfield;
				window.requestAnimationFrame(() => {
					try {
						jq(targetInputfield).trigger('changed');
					} catch {
						// Ignore optional jQuery event bridge errors
					}
				});
			}
		}
		curInputfield = curInputfield.parentElement?.closest<HTMLElement>('.Inputfield') ?? null;
	}

	const form = hostEl.closest('form');
	if (form) {
		form.classList.add('InputfieldFormChanged');
		form.setAttribute('data-rw-form-dirty', '1');
	}

	const schemaForm = hostEl.closest<SchemaFormDirtyHostElement>('[data-rw-schema-form]');
	const formId = schemaForm?.getAttribute('data-rw-schema-form') || schemaForm?.id || '';
	if (schemaForm?.__rwSchemaFormContext?.updateFieldValue) {
		schemaForm.__rwSchemaFormContext.updateFieldValue(dirtyKey, String(Date.now()));
	} else if (formId) {
		dispatchDirtyFormState(true, formId);
	}
}

/**
 * Synchronize dirty state between embedded forms (`SchemaForm`) and host containers (`RecordHeader`
 * or ProcessWire `.InputfieldStateChanged`). Pass a boolean when owning the dirty state, or omit to listen.
 */
export function useDirtyFormBridge(
	controlledDirty?: boolean,
	options: UseDirtyFormBridgeOptions = {},
): UseDirtyFormBridgeResult {
	const { formId, inputfieldElement } = options;
	const isControlled = controlledDirty !== undefined;
	const [internalDirty, setInternalDirty] = useState<boolean>(Boolean(controlledDirty));
	const dirty = isControlled ? Boolean(controlledDirty) : internalDirty;

	useEffect(() => {
		if (!isControlled) {
			return;
		}
		dispatchDirtyFormState(Boolean(controlledDirty), formId);
	}, [isControlled, controlledDirty, formId]);

	useEffect(() => {
		if (!inputfieldElement || typeof inputfieldElement.closest !== 'function') {
			return;
		}
		const wrapper = inputfieldElement.closest('.Inputfield');
		if (wrapper) {
			wrapper.classList.toggle('InputfieldStateChanged', dirty);
		}
	}, [dirty, inputfieldElement]);

	useEffect(() => {
		if (isControlled || typeof window === 'undefined') {
			return;
		}
		const onDirtyEvent = (ev: Event) => {
			const detail = (ev as CustomEvent<{ isDirty?: boolean; formId?: string }>).detail;
			if (formId && detail?.formId && detail.formId !== formId) {
				return;
			}
			setInternalDirty(Boolean(detail?.isDirty));
		};
		window.addEventListener('rw:schema-form-dirty', onDirtyEvent);
		return () => window.removeEventListener('rw:schema-form-dirty', onDirtyEvent);
	}, [isControlled, formId]);

	const setDirty = useCallback(
		(next: boolean) => {
			if (!isControlled) {
				setInternalDirty(next);
			}
			dispatchDirtyFormState(next, formId);
		},
		[isControlled, formId],
	);

	return { dirty, setDirty };
}
