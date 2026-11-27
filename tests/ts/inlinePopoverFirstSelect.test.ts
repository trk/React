import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SelectField } from '../../resources/ts/fields/controls/SelectField';
import { TextField } from '../../resources/ts/fields/controls/TextField';
import { TextareaField } from '../../resources/ts/fields/controls/TextareaField';
import { CheckboxField } from '../../resources/ts/fields/controls/CheckboxField';
import { CheckboxesField } from '../../resources/ts/fields/controls/CheckboxesField';
import { MultiSelectField } from '../../resources/ts/fields/controls/MultiSelectField';
import { AsmSelectField } from '../../resources/ts/fields/controls/AsmSelectField';
import { RangeField } from '../../resources/ts/fields/controls/RangeField';
import { RatingField } from '../../resources/ts/fields/controls/RatingField';
import { DatetimeField } from '../../resources/ts/fields/controls/DatetimeField';
import { DateRangeField } from '../../resources/ts/fields/controls/DateRangeField';
import { ToggleField } from '../../resources/ts/fields/controls/ToggleField';
import {
	applyLinkSettingPatches,
	buildLinkInlineSettingFields,
	getNeutralSettingValue,
	normalizeLinkFieldValue,
} from '../../resources/ts/fields/shared';

const TS_ROOT = resolve(import.meta.dirname, '../../resources/ts');

describe('InlineFieldSettingsPopover & useSchemaFormController first-select integrity', () => {
	it('preserves accessible control names inside PortalRoot while omitting extra hidden POST mirrors and isolating inline radio groups', () => {
		const selectInlineHtml = renderToStaticMarkup(
			React.createElement(SelectField, {
				controlType: 'select',
				id: 'html_element__inline',
				name: 'blocks_b1_html_element',
				value: 'h2',
				inlinePortal: true,
				options: [
					{ value: 'h2', label: 'H2' },
					{ value: 'h3', label: 'H3' },
				],
			})
		);
		expect(selectInlineHtml).toContain('name="blocks_b1_html_element"');

		const selectInlineReadonlyHtml = renderToStaticMarkup(
			React.createElement(SelectField, {
				controlType: 'select',
				id: 'html_element__inline_ro',
				name: 'blocks_b1_html_element',
				value: 'h2',
				readOnly: true,
				inlinePortal: true,
				options: [{ value: 'h2', label: 'H2' }],
			})
		);
		expect(selectInlineReadonlyHtml).not.toContain('name="blocks_b1_html_element"');
		expect(selectInlineReadonlyHtml).toContain('name="blocks_b1_html_element__ro"');

		const selectPrimaryHtml = renderToStaticMarkup(
			React.createElement(SelectField, {
				controlType: 'select',
				id: 'html_element',
				name: 'blocks_b1_html_element',
				value: 'h2',
				options: [{ value: 'h2', label: 'H2' }],
			})
		);
		expect(selectPrimaryHtml).toContain('name="blocks_b1_html_element"');

		const percentRangeInlineHtml = renderToStaticMarkup(
			React.createElement(RangeField, {
				controlType: 'range',
				id: 'f_colwidth',
				name: 'blocks_b1_colwidth',
				value: 50,
				colspanValueMode: 'percent',
				inlinePortal: true,
			})
		);
		expect(percentRangeInlineHtml).not.toContain('type="hidden"');

		const sharedControlsHtml = [
			renderToStaticMarkup(React.createElement(TextField, { controlType: 'text', id: 'f_text', name: 'blocks_b1_cls', value: '', inlinePortal: true })),
			renderToStaticMarkup(React.createElement(TextareaField, { controlType: 'textarea', id: 'f_ta', name: 'blocks_b1_ta', value: '', inlinePortal: true })),
			renderToStaticMarkup(React.createElement(CheckboxField, { controlType: 'checkbox', id: 'f_cb', name: 'blocks_b1_cb', checked: false, inlinePortal: true })),
			renderToStaticMarkup(React.createElement(CheckboxesField, { controlType: 'checkboxes', id: 'f_cbs', name: 'blocks_b1_cbs', value: [], inlinePortal: true, options: [{ value: 'a', label: 'A' }] })),
			renderToStaticMarkup(React.createElement(MultiSelectField, { controlType: 'multiselect', id: 'f_ms', name: 'blocks_b1_ms', value: [], inlinePortal: true, options: [{ value: 'a', label: 'A' }] })),
			renderToStaticMarkup(React.createElement(AsmSelectField, { controlType: 'asmselect', id: 'f_asm', name: 'blocks_b1_asm', value: [], inlinePortal: true, options: [{ value: 'a', label: 'A' }] })),
			renderToStaticMarkup(React.createElement(RangeField, { controlType: 'range', id: 'f_rng', name: 'blocks_b1_rng', value: 2, min: 1, max: 6, inlinePortal: true })),
			renderToStaticMarkup(React.createElement(RatingField, { controlType: 'rating', id: 'f_rat', name: 'blocks_b1_rat', value: 3, inlinePortal: true })),
			renderToStaticMarkup(React.createElement(DatetimeField, { controlType: 'datetime', id: 'f_dt', name: 'blocks_b1_dt', value: '', inlinePortal: true })),
		].join('\n');

		expect(sharedControlsHtml).toContain('name="blocks_b1_cls"');
		expect(sharedControlsHtml).toContain('name="blocks_b1_ta"');
		expect(sharedControlsHtml).toContain('name="blocks_b1_cb"');
		expect(sharedControlsHtml).toContain('name="blocks_b1_cbs[]"');
		expect(sharedControlsHtml).toContain('name="blocks_b1_ms[]"');
		expect(sharedControlsHtml).toContain('name="blocks_b1_asm[]"');
		expect(sharedControlsHtml).toContain('name="blocks_b1_rng"');
		expect(sharedControlsHtml).toContain('name="blocks_b1_rat"');
		expect(sharedControlsHtml).toContain('name="blocks_b1_dt"');

		const popoverSrc = readFileSync(resolve(TS_ROOT, 'fields/schema/InlineFieldSettingsPopover.tsx'), 'utf8');
		expect(popoverSrc).toContain('<PortalRoot');

		const toggleHtml = renderToStaticMarkup(
			React.createElement(ToggleField, {
				controlType: 'toggle',
				id: 'f_tg',
				name: 'blocks_b1_tg',
				value: '1',
				inlinePortal: true,
				options: [
					{ value: '1', label: 'Yes' },
					{ value: '0', label: 'No' },
				],
			})
		);
		expect(toggleHtml).not.toContain('name="_blocks_b1_tg_"');
		expect(toggleHtml).not.toContain('name="blocks_b1_tg"');
		expect(toggleHtml).toContain('name="blocks_b1_tg__inline"');

		const dateRangePrimaryHtml = renderToStaticMarkup(
			React.createElement(DateRangeField, {
				controlType: 'daterange',
				id: 'f_dr_primary',
				name: 'blocks_b1_window',
				value: { from: '2026-11-15', to: '2026-11-22' },
			})
		);
		expect(dateRangePrimaryHtml).toContain('type="hidden"');
		expect(dateRangePrimaryHtml).toContain('name="blocks_b1_window"');

		const dateRangeInlineHtml = renderToStaticMarkup(
			React.createElement(DateRangeField, {
				controlType: 'daterange',
				id: 'f_dr_inline',
				name: 'blocks_b1_window',
				value: { from: '2026-11-15', to: '2026-11-22' },
				inlinePortal: true,
			})
		);
		expect(dateRangeInlineHtml).not.toContain('type="hidden"');
		expect(dateRangeInlineHtml).not.toContain('name="blocks_b1_window"');
	});

	it('invokes onChange and onFieldChange outside setLocalValues updater and stabilizes refs in useSchemaFormController', () => {
		const controllerSrc = readFileSync(resolve(TS_ROOT, 'fields/schema/useSchemaFormController.ts'), 'utf8');
		expect(controllerSrc).toContain('onFieldChangeRef.current?.(name, nextVal, next)');
		expect(controllerSrc).toContain('onChangeRef.current?.(next)');
		// Ensure setLocalValues receives a pure value (`setLocalValues(next)` inside updateFieldValue) rather than calling props.onChange inside updater
		const updateBlockMatch = controllerSrc.match(/const updateFieldValue = useCallback\([\s\S]*?\n\t\);/);
		expect(updateBlockMatch).not.toBeNull();
		const updateBlock = updateBlockMatch?.[0] ?? '';
		expect(updateBlock).not.toContain('setLocalValues((prev)');
		expect(updateBlock).not.toContain('props.onChange');
		expect(updateBlock).not.toContain(', clientErrors,');

		const regFragMatch = controllerSrc.match(/const registerFragment = useCallback\([\s\S]*?\n\t\);/);
		const regBlockMatch = controllerSrc.match(/const registerBlockField = useCallback\([\s\S]*?\n\t\);/);
		expect(regFragMatch?.[0] ?? '').toContain('parentCtxRef.current');
		expect(regFragMatch?.[0] ?? '').toContain('[isAttachedFragment]');
		expect(regBlockMatch?.[0] ?? '').toContain('parentCtxRef.current');
		expect(regBlockMatch?.[0] ?? '').toContain('[isAttachedFragment]');
	});

	it('freezes popover repositioning while native <select> is focused and isolates React synthetic bubbling', () => {
		const popoverSrc = readFileSync(resolve(TS_ROOT, 'fields/schema/InlineFieldSettingsPopover.tsx'), 'utf8');
		expect(popoverSrc).toContain('portaledFieldMap');
		expect(popoverSrc).toContain('activeEl instanceof HTMLSelectElement && panelRef.current?.contains(activeEl)');
		expect(popoverSrc).toContain('onInput={(e) => e.stopPropagation()}');
		expect(popoverSrc).toContain('onChange={(e) => e.stopPropagation()}');

		const dirtyBridgeSrc = readFileSync(resolve(TS_ROOT, 'hooks/useDirtyFormBridge.ts'), 'utf8');
		expect(dirtyBridgeSrc).toContain('window.requestAnimationFrame');
	});

	it('honors resetValue in getNeutralSettingValue, distinguishes user-cleared rel vs _self->_blank transition, and assigns unique link option IDs', () => {
		expect(
			getNeutralSettingValue({
				kind: 'control',
				name: 'aspectRatio',
				type: 'select',
				resetValue: '16:9',
				options: [
					{ value: '4:3', label: '4:3' },
					{ value: '16:9', label: '16:9' },
				],
			})
		).toBe('16:9');

		expect(
			getNeutralSettingValue({
				kind: 'control',
				name: 'autoplay',
				type: 'checkbox',
				resetValue: true,
			})
		).toBe('1');

		const baseLink = normalizeLinkFieldValue({ type: 'url', url: 'https://example.com', target: '_self', rel: '' });
		const toBlank = applyLinkSettingPatches(baseLink, { __rw_link_opt__target: '_blank' }, { enableRel: true });
		expect(toBlank.rel).toBe('noopener noreferrer');

		const clearedRel = applyLinkSettingPatches(toBlank, { __rw_link_opt__rel: '' }, { enableRel: true });
		expect(clearedRel.target).toBe('_blank');
		expect(clearedRel.rel).toBe('');

		const built = buildLinkInlineSettingFields(
			{ enableTarget: true, enableRel: true },
			baseLink,
			false,
			'blocks[0].cta_link'
		);
		expect(built.fields.map((f) => f.id)).toEqual([
			'blocks_0__cta_link__link_opt_target',
			'blocks_0__cta_link__link_opt_rel',
			'blocks_0__cta_link__link_opt_anchor',
			'blocks_0__cta_link__link_opt_query',
		]);
	});

	it('reuses SettingsPopoverShell in LinkField and preserves Escape and badge contrast guards', () => {
		const popoverSrc = readFileSync(resolve(TS_ROOT, 'fields/schema/InlineFieldSettingsPopover.tsx'), 'utf8');
		expect(popoverSrc).toContain('export const SettingsPopoverShell');
		expect(popoverSrc).toContain('text-primary-ink');
		expect(popoverSrc).toContain('e.defaultPrevented');

		const linkFieldSrc = readFileSync(resolve(TS_ROOT, 'fields/controls/LinkField.tsx'), 'utf8');
		expect(linkFieldSrc).toContain('<SettingsPopoverShell');
		expect(linkFieldSrc).not.toContain('data-rw-inline-settings-popover=""');
	});
});
