import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
	buildStandaloneControlProps,
	notifyStandaloneHostChanged,
	resolveCanonicalControlType,
	resolveStandaloneFieldDefinition,
	type StandaloneControlPayload,
} from '../controlProps';
import type { ReactInputfieldProps, SchemaFieldDefinition } from '../types';
import { ColorFieldControl } from './ColorField';
import { ComboboxFieldControl } from './ComboboxField';
import { ConditionBuilderFieldControl } from './ConditionBuilderField';
import { MarkdownFieldControl } from './MarkdownField';
import { OtpFieldControl } from './OtpField';
import { PasswordFieldControl } from './PasswordField';
import { PhoneFieldControl } from './PhoneField';
import { SegmentedFieldControl } from './SegmentedField';
import { SpacingFieldControl } from './SpacingField';
import { TagsFieldControl } from './TagsField';
import { UnitNumberFieldControl } from './UnitNumberField';

type ExtraControlIslandProps = StandaloneControlPayload &
	Partial<SchemaFieldDefinition> &
	Record<string, unknown>;

function renderExtraControl(
	canonicalType: string,
	controlProps: ReactInputfieldProps,
): React.ReactElement | null {
	switch (canonicalType) {
		case 'phone':
			return <PhoneFieldControl {...controlProps} />;
		case 'color':
			return <ColorFieldControl {...controlProps} />;
		case 'tags':
			return <TagsFieldControl {...controlProps} />;
		case 'combobox':
			return <ComboboxFieldControl {...controlProps} />;
		case 'unit_number':
			return <UnitNumberFieldControl {...controlProps} />;
		case 'segmented':
			return <SegmentedFieldControl {...controlProps} />;
		case 'spacing':
			return <SpacingFieldControl {...controlProps} />;
		case 'otp':
			return <OtpFieldControl {...controlProps} />;
		case 'password':
			return <PasswordFieldControl {...controlProps} />;
		case 'markdown':
			return <MarkdownFieldControl {...controlProps} />;
		case 'condition_builder':
			return <ConditionBuilderFieldControl {...controlProps} />;
		default:
			return null;
	}
}

/**
 * Standalone ProcessWire `Inputfield` island host for controls bundled in `dist/ReactExtraFields.js`.
 * Keeps `SchemaForm.js` out of classic admin pages that only use extra field controls.
 */
export const ExtraFieldControlIsland: React.FC<ExtraControlIslandProps> = (rawProps) => {
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
				onValueChange: handleValueChange,
			}),
		[field, handleValueChange, localValue],
	);

	const controlNode = renderExtraControl(canonicalType, controlProps);
	if (!controlNode) {
		return null;
	}

	return (
		<div
			ref={containerRef}
			className="rw-field-control-island min-w-0 max-w-full"
			data-rw-standalone-control={canonicalType}
		>
			{controlNode}
		</div>
	);
};
