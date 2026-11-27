import { ColorFieldControl } from '../fields/controls/ColorField';
import { ComboboxFieldControl } from '../fields/controls/ComboboxField';
import { ExtraFieldControlIsland } from '../fields/controls/ExtraFieldControlIsland';
import { MarkdownFieldControl } from '../fields/controls/MarkdownField';
import { OtpFieldControl } from '../fields/controls/OtpField';
import { PasswordFieldControl } from '../fields/controls/PasswordField';
import { PhoneFieldControl } from '../fields/controls/PhoneField';
import { SegmentedFieldControl } from '../fields/controls/SegmentedField';
import { SpacingFieldControl } from '../fields/controls/SpacingField';
import { TagsFieldControl } from '../fields/controls/TagsField';
import { UnitNumberFieldControl } from '../fields/controls/UnitNumberField';

const runtime = typeof window !== 'undefined' ? window.ReactWorkspaceRuntime : undefined;

runtime?.__provideFields?.({
	ColorFieldControl,
	TagsFieldControl,
	ComboboxFieldControl,
	PhoneFieldControl,
	UnitNumberFieldControl,
	SegmentedFieldControl,
	SpacingFieldControl,
	OtpFieldControl,
	PasswordFieldControl,
	MarkdownFieldControl,
	ExtraFieldControlIsland,
});

runtime?.registerIslands?.({
	'ReactWorkspace/ExtraFieldControl': ExtraFieldControlIsland,
});

export {
	ColorFieldControl,
	TagsFieldControl,
	ComboboxFieldControl,
	PhoneFieldControl,
	UnitNumberFieldControl,
	SegmentedFieldControl,
	SpacingFieldControl,
	OtpFieldControl,
	PasswordFieldControl,
	MarkdownFieldControl,
};
