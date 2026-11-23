import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	buildStandaloneControlProps,
	notifyStandaloneHostChanged,
	resolveCanonicalControlType,
	resolveStandaloneFieldDefinition,
	type StandaloneControlPayload,
} from '../controlProps';
import type { SchemaFieldDefinition } from '../types';
import { renderFieldControl } from './fieldControlRegistry';

type CoreControlIslandProps = StandaloneControlPayload &
	Partial<SchemaFieldDefinition> &
	Record<string, unknown>;

const CALENDAR_TYPES = new Set(['date', 'time', 'datetime', 'daterange']);

function snapshotSiblingFormValues(
	hostEl: HTMLElement | null,
	scopePrefix?: string,
): Record<string, unknown> {
	if (typeof document === 'undefined') {
		return {};
	}
	const form = hostEl?.closest('form');
	if (!form) {
		return {};
	}

	const snapshot: Record<string, unknown> = {};
	const formData = new FormData(form);
	formData.forEach((rawVal, rawKey) => {
		if (typeof rawVal !== 'string') {
			return;
		}
		if (rawKey.endsWith('[]')) {
			const cleanKey = rawKey.slice(0, -2);
			const prev = snapshot[cleanKey];
			snapshot[cleanKey] = Array.isArray(prev) ? [...prev, rawVal] : [rawVal];
		} else {
			snapshot[rawKey] = rawVal;
		}
		if (scopePrefix && rawKey.startsWith(scopePrefix)) {
			const unprefixed = rawKey.slice(scopePrefix.length);
			if (unprefixed !== '' && !(unprefixed in snapshot)) {
				snapshot[unprefixed] = rawVal;
			}
		}
	});

	return snapshot;
}

/**
 * Standalone ProcessWire `Inputfield` island host for core schema controls (`date`, `time`,
 * `datetime`, `daterange`, `range`, `range_slider`, `colspan`, `rating`, `signature`,
 * `calculation`, `toggle`, `slug`, `secret`, `repeater`) inside `dist/SchemaForm.js`.
 */
export const FieldControlIsland: React.FC<CoreControlIslandProps> = (rawProps) => {
	const field = useMemo(() => resolveStandaloneFieldDefinition(rawProps), [rawProps]);
	const initialVal = field.value ?? field.defaultValue ?? '';
	const [prevPropValue, setPrevPropValue] = useState<unknown>(initialVal);
	const [localValue, setLocalValue] = useState<unknown>(initialVal);
	const containerRef = useRef<HTMLDivElement | null>(null);

	if (initialVal !== prevPropValue) {
		setPrevPropValue(initialVal);
		setLocalValue(initialVal);
	}

	const canonicalType = useMemo(
		() => resolveCanonicalControlType(String(field.type ?? '')),
		[field.type],
	);

	const needsCalendar =
		CALENDAR_TYPES.has(canonicalType) &&
		field.datetimeMode !== 'html' &&
		field.datetimeMode !== 'text';

	const needsFormObserver = Boolean(
		canonicalType === 'calculation' ||
			field.slugFrom ||
			field.connection?.type === 'slug' ||
			field.connection?.type === 'calculation',
	);

	const scopePrefix = useMemo(() => {
		const rawRec = rawProps as Record<string, unknown>;
		return typeof rawRec.scopePrefix === 'string' ? rawRec.scopePrefix : undefined;
	}, [rawProps]);

	const [siblingValues, setSiblingValues] = useState<Record<string, unknown>>({});

	useEffect(() => {
		if (!needsCalendar || typeof window === 'undefined') {
			return;
		}
		const rt = window.ReactWorkspaceRuntime;
		rt?.ensureCalendarStyleLoaded?.();
		rt?.ensureCalendarLoaded?.();
	}, [needsCalendar]);

	useEffect(() => {
		if (!needsFormObserver) {
			return;
		}
		const syncSnapshot = () => {
			setSiblingValues(snapshotSiblingFormValues(containerRef.current, scopePrefix));
		};
		syncSnapshot();

		const form = containerRef.current?.closest('form');
		if (!form) {
			return;
		}

		const handleFormChange = () => {
			syncSnapshot();
		};
		form.addEventListener('input', handleFormChange);
		form.addEventListener('change', handleFormChange);
		return () => {
			form.removeEventListener('input', handleFormChange);
			form.removeEventListener('change', handleFormChange);
		};
	}, [needsFormObserver, scopePrefix]);

	const handleValueChange = useCallback(
		(name: string, nextValue: unknown) => {
			setLocalValue(nextValue);
			notifyStandaloneHostChanged(containerRef.current, name);
		},
		[],
	);

	const controlProps = useMemo(
		() =>
			buildStandaloneControlProps(field, localValue, {
				...(needsFormObserver ? { formValues: siblingValues, scopePrefix } : {}),
				onValueChange: handleValueChange,
			}),
		[field, handleValueChange, localValue, needsFormObserver, scopePrefix, siblingValues],
	);

	return (
		<div
			ref={containerRef}
			className="rw-field-control-island min-w-0 max-w-full"
			data-rw-standalone-control={canonicalType}
		>
			{renderFieldControl(controlProps)}
		</div>
	);
};
