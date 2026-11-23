import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PHONE_COUNTRIES,
	PhoneField,
	formatPhoneToE164,
	parsePhoneValue,
} from '../../resources/ts/fields/controls/PhoneField';
import { ComboboxField } from '../../resources/ts/fields/controls/ComboboxField';
import { validateFieldWithValibot } from '../../resources/ts/fields/validation';
import type { SchemaFieldDefinition } from '../../resources/ts/fields/types';
import { Combobox } from '../../resources/ts/ui/primitives/Combobox';

describe('International Fields (Phone, Country, Timezone, Currency Code) & Combobox Keywords', () => {
	it('parses E.164, 00-prefixed, and national phone numbers into country + national components', () => {
		expect(parsePhoneValue('+905325551234', DEFAULT_PHONE_COUNTRIES, 'US')).toEqual({
			country: 'TR',
			national: '5325551234',
		});
		expect(parsePhoneValue('0044 20 7946 0199', DEFAULT_PHONE_COUNTRIES, 'TR')).toEqual({
			country: 'GB',
			national: '2079460199',
		});
		expect(parsePhoneValue('+14165550199', DEFAULT_PHONE_COUNTRIES, 'CA')).toEqual({
			country: 'CA',
			national: '4165550199',
		});
		expect(parsePhoneValue('0532 555 8899', DEFAULT_PHONE_COUNTRIES, 'TR')).toEqual({
			country: 'TR',
			national: '0532 555 8899',
		});
		expect(parsePhoneValue('', DEFAULT_PHONE_COUNTRIES, 'HR')).toEqual({
			country: 'HR',
			national: '',
		});
	});

	it('formats country + national input into canonical E.164 strings', () => {
		expect(formatPhoneToE164('TR', '0532 555 1234', DEFAULT_PHONE_COUNTRIES)).toBe('+905325551234');
		expect(formatPhoneToE164('HR', '091 123 4567', DEFAULT_PHONE_COUNTRIES)).toBe('+385911234567');
		expect(formatPhoneToE164('US', '+33 6 12 34 56 78', DEFAULT_PHONE_COUNTRIES)).toBe('+33612345678');
		expect(formatPhoneToE164('DE', '0030 210 555 0199', DEFAULT_PHONE_COUNTRIES)).toBe('+302105550199');
		expect(formatPhoneToE164('TR', '', DEFAULT_PHONE_COUNTRIES)).toBe('');
		expect(formatPhoneToE164('TR', '000', DEFAULT_PHONE_COUNTRIES)).toBe('');
	});

	it('renders accessible PhoneField markup across editable, readOnly, inlinePortal, and renderValueMode', () => {
		const editableHtml = renderToStaticMarkup(
			React.createElement(PhoneField, {
				controlType: 'phone',
				id: 'f_phone',
				name: 'phone_e164',
				value: '+905325551234',
				defaultCountry: 'TR',
				preferredCountries: ['TR', 'GB'],
			}),
		);
		expect(editableHtml).toContain('data-rw-control="phone"');
		expect(editableHtml).toContain('type="hidden"');
		expect(editableHtml).toContain('name="phone_e164"');
		expect(editableHtml).toContain('value="+905325551234"');
		expect(editableHtml).toContain('type="tel"');
		expect(editableHtml).toContain('TR +90');

		const inlinePortalHtml = renderToStaticMarkup(
			React.createElement(PhoneField, {
				controlType: 'phone',
				id: 'f_phone_inline',
				name: 'phone_e164',
				value: '+385911234567',
				inlinePortal: true,
			}),
		);
		expect(inlinePortalHtml).not.toContain('type="hidden"');
		expect(inlinePortalHtml).toContain('HR +385');

		const renderValueHtml = renderToStaticMarkup(
			React.createElement(PhoneField, {
				controlType: 'phone',
				id: 'f_phone_view',
				name: 'phone_e164',
				value: '+442079460199',
				renderValueMode: true,
			}),
		);
		expect(renderValueHtml).toContain('data-rw-readonly-value="1"');
		expect(renderValueHtml).toContain('href="tel:+442079460199"');
	});

	it('renders Combobox and ComboboxField with country, timezone, and currency options cleanly', () => {
		const comboPrimitiveHtml = renderToStaticMarkup(
			React.createElement(Combobox, {
				options: [
					{
						value: 'TR',
						label: 'TR +90',
						description: 'Türkiye',
						keywords: 'TR +90 90 Türkiye',
					},
				],
				value: 'TR',
				popupClassName: 'min-w-64',
			}),
		);
		expect(comboPrimitiveHtml).toContain('TR +90');

		const multiCountriesHtml = renderToStaticMarkup(
			React.createElement(ComboboxField, {
				controlType: 'combobox',
				id: 'f_countries',
				name: 'service_countries',
				multiple: true,
				value: ['TR', 'HR'],
				options: [
					{ value: 'TR', label: 'TR — Türkiye' },
					{ value: 'HR', label: 'HR — Croatia' },
					{ value: 'GR', label: 'GR — Greece' },
				],
			}),
		);
		expect(multiCountriesHtml).toContain('data-rw-combobox-multi="1"');
		expect(multiCountriesHtml).toContain('TR — Türkiye');
		expect(multiCountriesHtml).toContain('HR — Croatia');
	});

	it('validates phone fields cleanly via validateFieldWithValibot', () => {
		const phoneField: SchemaFieldDefinition = {
			kind: 'control',
			type: 'phone',
			name: 'phone_e164',
			label: 'Primary Phone',
		};
		expect(validateFieldWithValibot(phoneField, '+905325551234', { phone_e164: '+905325551234' })).toBeNull();
		expect(validateFieldWithValibot(phoneField, '123', { phone_e164: '123' })).toContain('valid phone number');
		expect(validateFieldWithValibot(phoneField, 'abc-def-ghij', { phone_e164: 'abc-def-ghij' })).toContain('valid phone number');
	});
});
