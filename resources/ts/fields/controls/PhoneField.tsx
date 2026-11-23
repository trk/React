import React, { useMemo, useRef, useState } from 'react';
import { getLocale, t } from '../../lib/i18n';
import { cn, DynamicIcon } from '../../lib/utils';
import { Combobox, type ComboboxOption, Input } from '../../ui';
import { dispatchDomChange } from '../shared';
import type { PhoneCountryItem, ReactInputfieldProps } from '../types';

export const DEFAULT_PHONE_COUNTRIES: PhoneCountryItem[] = [
	{ code: 'US', name: 'United States', dial: '1' },
	{ code: 'CA', name: 'Canada', dial: '1' },
	{ code: 'GB', name: 'United Kingdom', dial: '44' },
	{ code: 'TR', name: 'Türkiye', dial: '90' },
	{ code: 'DE', name: 'Germany', dial: '49' },
	{ code: 'FR', name: 'France', dial: '33' },
	{ code: 'IT', name: 'Italy', dial: '39' },
	{ code: 'ES', name: 'Spain', dial: '34' },
	{ code: 'NL', name: 'Netherlands', dial: '31' },
	{ code: 'BE', name: 'Belgium', dial: '32' },
	{ code: 'CH', name: 'Switzerland', dial: '41' },
	{ code: 'AT', name: 'Austria', dial: '43' },
	{ code: 'SE', name: 'Sweden', dial: '46' },
	{ code: 'NO', name: 'Norway', dial: '47' },
	{ code: 'DK', name: 'Denmark', dial: '45' },
	{ code: 'FI', name: 'Finland', dial: '358' },
	{ code: 'IE', name: 'Ireland', dial: '353' },
	{ code: 'PT', name: 'Portugal', dial: '351' },
	{ code: 'GR', name: 'Greece', dial: '30' },
	{ code: 'HR', name: 'Croatia', dial: '385' },
	{ code: 'CY', name: 'Cyprus', dial: '357' },
	{ code: 'MT', name: 'Malta', dial: '356' },
	{ code: 'MC', name: 'Monaco', dial: '377' },
	{ code: 'PL', name: 'Poland', dial: '48' },
	{ code: 'CZ', name: 'Czechia', dial: '420' },
	{ code: 'HU', name: 'Hungary', dial: '36' },
	{ code: 'RO', name: 'Romania', dial: '40' },
	{ code: 'BG', name: 'Bulgaria', dial: '359' },
	{ code: 'UA', name: 'Ukraine', dial: '380' },
	{ code: 'RU', name: 'Russia', dial: '7' },
	{ code: 'AE', name: 'United Arab Emirates', dial: '971' },
	{ code: 'SA', name: 'Saudi Arabia', dial: '966' },
	{ code: 'QA', name: 'Qatar', dial: '974' },
	{ code: 'KW', name: 'Kuwait', dial: '965' },
	{ code: 'IL', name: 'Israel', dial: '972' },
	{ code: 'EG', name: 'Egypt', dial: '20' },
	{ code: 'ZA', name: 'South Africa', dial: '27' },
	{ code: 'AU', name: 'Australia', dial: '61' },
	{ code: 'NZ', name: 'New Zealand', dial: '64' },
	{ code: 'JP', name: 'Japan', dial: '81' },
	{ code: 'KR', name: 'South Korea', dial: '82' },
	{ code: 'CN', name: 'China', dial: '86' },
	{ code: 'SG', name: 'Singapore', dial: '65' },
	{ code: 'IN', name: 'India', dial: '91' },
	{ code: 'BR', name: 'Brazil', dial: '55' },
	{ code: 'MX', name: 'Mexico', dial: '52' },
];

function resolveFallbackCountry(countries: PhoneCountryItem[], defaultCountry?: string): string {
	const clean = (defaultCountry ?? '').trim().toUpperCase();
	if (clean && countries.some((c) => c.code === clean)) {
		return clean;
	}
	if (countries.some((c) => c.code === 'US')) {
		return 'US';
	}
	return countries[0]?.code ?? 'US';
}

/**
 * Parses an incoming E.164 (`+90532...`), `00`-prefixed, or national phone string into `{ country, national }`.
 */
export function parsePhoneValue(
	raw: string,
	countries: PhoneCountryItem[] = DEFAULT_PHONE_COUNTRIES,
	defaultCountry = 'US',
): { country: string; national: string } {
	const pool = countries.length > 0 ? countries : DEFAULT_PHONE_COUNTRIES;
	const fallback = resolveFallbackCountry(pool, defaultCountry);
	const trimmed = raw.trim();
	if (!trimmed) {
		return { country: fallback, national: '' };
	}

	let intlDigits = '';
	if (trimmed.startsWith('+')) {
		intlDigits = trimmed.replace(/[^0-9]/g, '');
	} else {
		const digitsOnly = trimmed.replace(/[^0-9]/g, '');
		if (digitsOnly.startsWith('00') && digitsOnly.length > 8) {
			intlDigits = digitsOnly.slice(2);
		}
	}

	if (intlDigits !== '') {
		const byDialDesc = [...pool]
			.filter((c) => c.dial !== '')
			.sort((a, b) => b.dial.length - a.dial.length);

		for (const item of byDialDesc) {
			if (!intlDigits.startsWith(item.dial)) {
				continue;
			}
			const matching = byDialDesc.filter((cand) => cand.dial === item.dial);
			const chosen =
				matching.find((cand) => cand.code === fallback) ??
				matching.find((cand) => cand.code === 'US') ??
				matching.find((cand) => cand.code === 'GB') ??
				matching[0] ??
				item;
			return {
				country: chosen.code,
				national: intlDigits.slice(chosen.dial.length),
			};
		}
		return { country: fallback, national: intlDigits };
	}

	return {
		country: fallback,
		national: trimmed.replace(/[^0-9\s()-]/g, '').trim(),
	};
}

/**
 * Formats a `{ countryCode, nationalInput }` pair into canonical E.164 (`+<dial><digits>`).
 */
export function formatPhoneToE164(
	countryCode: string,
	nationalInput: string,
	countries: PhoneCountryItem[] = DEFAULT_PHONE_COUNTRIES,
): string {
	const trimmed = nationalInput.trim();
	if (!trimmed) {
		return '';
	}

	const pool = countries.length > 0 ? countries : DEFAULT_PHONE_COUNTRIES;
	const digits = trimmed.replace(/[^0-9]/g, '');
	if (!digits) {
		return '';
	}

	if (trimmed.startsWith('+')) {
		return `+${digits}`;
	}
	if (digits.startsWith('00') && digits.length > 8) {
		return `+${digits.slice(2)}`;
	}

	const upperCode = countryCode.trim().toUpperCase();
	const entry = pool.find((c) => c.code === upperCode);
	const national = digits.replace(/^0+/, '');
	if (!national) {
		return '';
	}
	if (!entry || !entry.dial) {
		return `+${national}`;
	}
	return `+${entry.dial}${national}`;
}

export function PhoneField(props: ReactInputfieldProps): React.ReactElement {
	const countries = useMemo<PhoneCountryItem[]>(() => {
		const base =
			Array.isArray(props.phoneCountries) && props.phoneCountries.length > 0
				? props.phoneCountries
				: DEFAULT_PHONE_COUNTRIES;
		const prefs = Array.isArray(props.preferredCountries)
			? props.preferredCountries.map((c) => c.trim().toUpperCase()).filter(Boolean)
			: [];
		if (prefs.length === 0) {
			return base;
		}
		const byCode = new Map(base.map((item) => [item.code.toUpperCase(), item]));
		const ordered: PhoneCountryItem[] = [];
		const seen = new Set<string>();
		for (const pref of prefs) {
			const match = byCode.get(pref);
			if (match && !seen.has(match.code)) {
				ordered.push(match);
				seen.add(match.code);
			}
		}
		for (const item of base) {
			if (!seen.has(item.code)) {
				ordered.push(item);
				seen.add(item.code);
			}
		}
		return ordered;
	}, [props.phoneCountries, props.preferredCountries]);

	const defaultCountry = useMemo(
		() => resolveFallbackCountry(countries, props.defaultCountry),
		[countries, props.defaultCountry],
	);

	const incomingRaw =
		props.value === null || props.value === undefined ? '' : String(props.value).trim();
	const [prevIncoming, setPrevIncoming] = useState<string>(incomingRaw);
	const initialParsed = useMemo(
		() => parsePhoneValue(incomingRaw, countries, defaultCountry),
		// Initial derivation only
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);
	const [selectedCountry, setSelectedCountry] = useState<string>(initialParsed.country);
	const [nationalText, setNationalText] = useState<string>(initialParsed.national);
	const hiddenRef = useRef<HTMLInputElement | null>(null);

	if (incomingRaw !== prevIncoming) {
		setPrevIncoming(incomingRaw);
		const currentE164 = formatPhoneToE164(selectedCountry, nationalText, countries);
		if (incomingRaw !== currentE164) {
			const reparsed = parsePhoneValue(incomingRaw, countries, defaultCountry);
			setSelectedCountry(reparsed.country);
			setNationalText(reparsed.national);
		}
	}

	const localizedNames = useMemo(() => {
		const map = new Map<string, string>();
		let regionNames: Intl.DisplayNames | null = null;
		try {
			const locale = getLocale() || 'en';
			if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
				regionNames = new Intl.DisplayNames([locale], { type: 'region' });
			}
		} catch {
			regionNames = null;
		}
		for (const item of countries) {
			let label = item.name;
			if (regionNames) {
				try {
					const localized = regionNames.of(item.code);
					if (localized && localized !== item.code) {
						label = localized;
					}
				} catch {
					// Fallback to bundled English name
				}
			}
			map.set(item.code, label);
		}
		return map;
	}, [countries]);

	const countryOptions = useMemo<ComboboxOption[]>(
		() =>
			countries.map((c) => {
				const displayName = localizedNames.get(c.code) ?? c.name;
				return {
					value: c.code,
					label: `${c.code} +${c.dial}`,
					description: displayName,
					keywords: `${c.code} +${c.dial} ${c.dial} ${displayName} ${c.name}`,
				};
			}),
		[countries, localizedNames],
	);

	const e164Value = useMemo(
		() => formatPhoneToE164(selectedCountry, nationalText, countries),
		[selectedCountry, nationalText, countries],
	);

	const locked = Boolean(props.readOnly || props.disabled);
	const hasError = Boolean(props.error && props.error.trim() !== '');
	const clearable = props.clearable !== false;

	const emitE164 = (nextCountry: string, nextNational: string) => {
		const nextE164 = formatPhoneToE164(nextCountry, nextNational, countries);
		props.onValueChange?.(props.name, nextE164);
		if (typeof window !== 'undefined') {
			window.requestAnimationFrame(() => dispatchDomChange(hiddenRef.current));
		}
	};

	if (props.renderValueMode) {
		return (
			<div data-rw-control="phone" data-rw-readonly-value="1">
				{e164Value ? (
					<a href={`tel:${e164Value}`} className="text-sm font-mono underline underline-offset-2">
						{e164Value}
					</a>
				) : (
					<span className="text-sm text-muted-foreground">—</span>
				)}
			</div>
		);
	}

	const handleCountryChange = (nextCountryRaw: string) => {
		if (locked || !nextCountryRaw) {
			return;
		}
		const upper = nextCountryRaw.trim().toUpperCase();
		setSelectedCountry(upper);
		if (nationalText.trim() !== '') {
			emitE164(upper, nationalText);
		}
	};

	const handleNationalChange = (rawInput: string) => {
		if (locked) {
			return;
		}
		const trimmed = rawInput.trim();
		const digitsOnly = trimmed.replace(/[^0-9]/g, '');
		if (
			(trimmed.startsWith('+') && digitsOnly.length >= 4) ||
			(digitsOnly.startsWith('00') && digitsOnly.length >= 9)
		) {
			const parsed = parsePhoneValue(trimmed, countries, selectedCountry);
			setSelectedCountry(parsed.country);
			setNationalText(parsed.national);
			emitE164(parsed.country, parsed.national);
			return;
		}

		const sanitized = rawInput.replace(/[^0-9\s()-]/g, '');
		setNationalText(sanitized);
		emitE164(selectedCountry, sanitized);
	};

	const handleClear = () => {
		if (locked) {
			return;
		}
		setNationalText('');
		props.onValueChange?.(props.name, '');
		if (typeof window !== 'undefined') {
			window.requestAnimationFrame(() => dispatchDomChange(hiddenRef.current));
		}
	};

	return (
		<div className="flex items-center gap-1.5 min-w-0 max-w-full" data-rw-control="phone">
			{props.name && !props.inlinePortal ? (
				<input ref={hiddenRef} type="hidden" name={props.name} value={e164Value} />
			) : null}

			<Combobox
				options={countryOptions}
				value={selectedCountry}
				onValueChange={handleCountryChange}
				clearable={false}
				disabled={locked}
				readOnly={Boolean(props.readOnly)}
				aria-label={t('fields.phoneCountryCode', 'Country calling code')}
				aria-invalid={hasError}
				className="w-[7.25rem] sm:w-[7.75rem] shrink-0"
				inputClassName="font-mono text-xs pr-7"
				popupClassName="min-w-64"
			/>

			<div className="relative flex-1 min-w-0">
				<Input
					id={props.id}
					type="tel"
					inputMode="tel"
					autoComplete="tel-national"
					value={nationalText}
					onChange={(e) => handleNationalChange(e.target.value)}
					placeholder={props.placeholder || t('fields.phoneNumber', 'Phone number')}
					disabled={Boolean(props.disabled)}
					readOnly={Boolean(props.readOnly)}
					required={Boolean(props.required)}
					aria-invalid={hasError || undefined}
					aria-describedby={props.describedBy}
					className={cn(
						'font-mono',
						clearable && nationalText !== '' && !locked && 'pr-8',
						hasError && 'border-destructive focus-visible:ring-destructive/40',
					)}
				/>
				{clearable && nationalText !== '' && !locked ? (
					<button
						type="button"
						onClick={handleClear}
						aria-label={t('common.clear', 'Clear')}
						className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
					>
						<DynamicIcon name="x" className="size-3.5" aria-hidden="true" />
					</button>
				) : null}
			</div>
		</div>
	);
}

export const PhoneFieldControl = PhoneField;
