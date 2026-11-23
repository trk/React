<?php // __(file-not-translatable)

declare(strict_types=1);

use Totoglu\React\Support\IntlCatalog;
use function ProcessWire\bootReactForTesting;

require_once dirname(__DIR__) . '/bootstrap.php';

beforeEach(function (): void {
	bootReactForTesting();
});

test('IntlCatalog returns ISO 3166-2 subdivision catalogs for key commerce jurisdictions', function (): void {
	$tr = IntlCatalog::subdivisionOptions('tr');
	expect($tr)->toHaveCount(81)
		->and($tr['01'])->toBe('Adana')
		->and($tr['34'])->toBe('İstanbul')
		->and($tr['81'])->toBe('Düzce');

	$us = IntlCatalog::subdivisionOptions(' US ');
	expect($us)->toHaveCount(51)
		->and($us['CA'])->toBe('California')
		->and($us['NY'])->toBe('New York')
		->and($us['DC'])->toBe('District of Columbia');

	$ca = IntlCatalog::subdivisionOptions('CA');
	expect($ca)->toHaveCount(13)
		->and($ca['ON'])->toBe('Ontario')
		->and($ca['QC'])->toBe('Quebec');

	$de = IntlCatalog::subdivisionOptions('DE');
	expect($de)->toHaveCount(16)
		->and($de['BE'])->toBe('Berlin')
		->and($de['BY'])->toBe('Bayern');

	$au = IntlCatalog::subdivisionOptions('AU');
	expect($au)->toHaveCount(8)
		->and($au['NSW'])->toBe('New South Wales')
		->and($au['VIC'])->toBe('Victoria');

	$gb = IntlCatalog::subdivisionOptions('GB');
	expect($gb)->toBe([
		'ENG' => 'England',
		'NIR' => 'Northern Ireland',
		'SCT' => 'Scotland',
		'WLS' => 'Wales',
	]);

	expect(IntlCatalog::subdivisionOptions('XX'))->toBe([])
		->and(IntlCatalog::subdivisionOptions(''))->toBe([]);
});

test('IntlCatalog validates subdivision codes case-insensitively and rejects invalid entries', function (): void {
	expect(IntlCatalog::isValidSubdivision('TR', '34'))->toBeTrue()
		->and(IntlCatalog::isValidSubdivision('tr', '01'))->toBeTrue()
		->and(IntlCatalog::isValidSubdivision('TR', '81'))->toBeTrue()
		->and(IntlCatalog::isValidSubdivision('TR', '1'))->toBeFalse()
		->and(IntlCatalog::isValidSubdivision('TR', '82'))->toBeFalse()
		->and(IntlCatalog::isValidSubdivision('us', ' ca '))->toBeTrue()
		->and(IntlCatalog::isValidSubdivision('US', 'dc'))->toBeTrue()
		->and(IntlCatalog::isValidSubdivision('GB', 'sct'))->toBeTrue()
		->and(IntlCatalog::isValidSubdivision('GB', 'LND'))->toBeFalse()
		->and(IntlCatalog::isValidSubdivision('FR', '75'))->toBeFalse()
		->and(IntlCatalog::isValidSubdivision('', 'CA'))->toBeFalse()
		->and(IntlCatalog::isValidSubdivision('US', ''))->toBeFalse();
});

test('IntlCatalog returns 27 EU country codes and membership checks', function (): void {
	$eu = IntlCatalog::euCountryCodes();

	expect($eu)->toHaveCount(27)
		->and(IntlCatalog::isEuCountry('DE'))->toBeTrue()
		->and(IntlCatalog::isEuCountry(' fr '))->toBeTrue()
		->and(IntlCatalog::isEuCountry('HR'))->toBeTrue()
		->and(IntlCatalog::isEuCountry('GB'))->toBeFalse()
		->and(IntlCatalog::isEuCountry('TR'))->toBeFalse()
		->and(IntlCatalog::isEuCountry('US'))->toBeFalse()
		->and(IntlCatalog::isEuCountry('CH'))->toBeFalse()
		->and(IntlCatalog::isEuCountry('NO'))->toBeFalse()
		->and(IntlCatalog::isEuCountry(''))->toBeFalse();
});

test('IntlCatalog resolves ISO 4217 currency minor unit exponents', function (): void {
	foreach (['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'] as $zero) {
		expect(IntlCatalog::currencyMinorUnits($zero))->toBe(0);
	}

	foreach (['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'] as $three) {
		expect(IntlCatalog::currencyMinorUnits($three))->toBe(3);
	}

	expect(IntlCatalog::currencyMinorUnits('jpy'))->toBe(0)
		->and(IntlCatalog::currencyMinorUnits(' kwd '))->toBe(3)
		->and(IntlCatalog::currencyMinorUnits('USD'))->toBe(2)
		->and(IntlCatalog::currencyMinorUnits('EUR'))->toBe(2)
		->and(IntlCatalog::currencyMinorUnits('TRY'))->toBe(2)
		->and(IntlCatalog::currencyMinorUnits('GBP'))->toBe(2)
		->and(IntlCatalog::currencyMinorUnits(''))->toBe(2);
});
