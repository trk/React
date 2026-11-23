<?php

declare(strict_types=1);

namespace Totoglu\React\Support;

/**
 * Shared read-only international standards catalog (ISO 3166-1 alpha-2 countries & ITU-T calling codes,
 * ISO 4217 currencies, IANA timezones, and E.164 phone normalization/validation).
 */
final class IntlCatalog
{
	/**
	 * ISO 3166-1 alpha-2 territories keyed by uppercase code.
	 *
	 * @var array<string, array{name: string, dial: string}>
	 */
	private const array COUNTRIES = [
		'AD' => ['name' => 'Andorra', 'dial' => '376'],
		'AE' => ['name' => 'United Arab Emirates', 'dial' => '971'],
		'AF' => ['name' => 'Afghanistan', 'dial' => '93'],
		'AG' => ['name' => 'Antigua and Barbuda', 'dial' => '1'],
		'AI' => ['name' => 'Anguilla', 'dial' => '1'],
		'AL' => ['name' => 'Albania', 'dial' => '355'],
		'AM' => ['name' => 'Armenia', 'dial' => '374'],
		'AO' => ['name' => 'Angola', 'dial' => '244'],
		'AQ' => ['name' => 'Antarctica', 'dial' => ''],
		'AR' => ['name' => 'Argentina', 'dial' => '54'],
		'AS' => ['name' => 'American Samoa', 'dial' => '1'],
		'AT' => ['name' => 'Austria', 'dial' => '43'],
		'AU' => ['name' => 'Australia', 'dial' => '61'],
		'AW' => ['name' => 'Aruba', 'dial' => '297'],
		'AX' => ['name' => 'Åland Islands', 'dial' => '358'],
		'AZ' => ['name' => 'Azerbaijan', 'dial' => '994'],
		'BA' => ['name' => 'Bosnia and Herzegovina', 'dial' => '387'],
		'BB' => ['name' => 'Barbados', 'dial' => '1'],
		'BD' => ['name' => 'Bangladesh', 'dial' => '880'],
		'BE' => ['name' => 'Belgium', 'dial' => '32'],
		'BF' => ['name' => 'Burkina Faso', 'dial' => '226'],
		'BG' => ['name' => 'Bulgaria', 'dial' => '359'],
		'BH' => ['name' => 'Bahrain', 'dial' => '973'],
		'BI' => ['name' => 'Burundi', 'dial' => '257'],
		'BJ' => ['name' => 'Benin', 'dial' => '229'],
		'BL' => ['name' => 'Saint Barthélemy', 'dial' => '590'],
		'BM' => ['name' => 'Bermuda', 'dial' => '1'],
		'BN' => ['name' => 'Brunei Darussalam', 'dial' => '673'],
		'BO' => ['name' => 'Bolivia', 'dial' => '591'],
		'BQ' => ['name' => 'Caribbean Netherlands', 'dial' => '599'],
		'BR' => ['name' => 'Brazil', 'dial' => '55'],
		'BS' => ['name' => 'Bahamas', 'dial' => '1'],
		'BT' => ['name' => 'Bhutan', 'dial' => '975'],
		'BV' => ['name' => 'Bouvet Island', 'dial' => ''],
		'BW' => ['name' => 'Botswana', 'dial' => '267'],
		'BY' => ['name' => 'Belarus', 'dial' => '375'],
		'BZ' => ['name' => 'Belize', 'dial' => '501'],
		'CA' => ['name' => 'Canada', 'dial' => '1'],
		'CC' => ['name' => 'Cocos (Keeling) Islands', 'dial' => '61'],
		'CD' => ['name' => 'Congo (DRC)', 'dial' => '243'],
		'CF' => ['name' => 'Central African Republic', 'dial' => '236'],
		'CG' => ['name' => 'Congo', 'dial' => '242'],
		'CH' => ['name' => 'Switzerland', 'dial' => '41'],
		'CI' => ['name' => "Côte d'Ivoire", 'dial' => '225'],
		'CK' => ['name' => 'Cook Islands', 'dial' => '682'],
		'CL' => ['name' => 'Chile', 'dial' => '56'],
		'CM' => ['name' => 'Cameroon', 'dial' => '237'],
		'CN' => ['name' => 'China', 'dial' => '86'],
		'CO' => ['name' => 'Colombia', 'dial' => '57'],
		'CR' => ['name' => 'Costa Rica', 'dial' => '506'],
		'CU' => ['name' => 'Cuba', 'dial' => '53'],
		'CV' => ['name' => 'Cabo Verde', 'dial' => '238'],
		'CW' => ['name' => 'Curaçao', 'dial' => '599'],
		'CX' => ['name' => 'Christmas Island', 'dial' => '61'],
		'CY' => ['name' => 'Cyprus', 'dial' => '357'],
		'CZ' => ['name' => 'Czechia', 'dial' => '420'],
		'DE' => ['name' => 'Germany', 'dial' => '49'],
		'DJ' => ['name' => 'Djibouti', 'dial' => '253'],
		'DK' => ['name' => 'Denmark', 'dial' => '45'],
		'DM' => ['name' => 'Dominica', 'dial' => '1'],
		'DO' => ['name' => 'Dominican Republic', 'dial' => '1'],
		'DZ' => ['name' => 'Algeria', 'dial' => '213'],
		'EC' => ['name' => 'Ecuador', 'dial' => '593'],
		'EE' => ['name' => 'Estonia', 'dial' => '372'],
		'EG' => ['name' => 'Egypt', 'dial' => '20'],
		'EH' => ['name' => 'Western Sahara', 'dial' => '212'],
		'ER' => ['name' => 'Eritrea', 'dial' => '291'],
		'ES' => ['name' => 'Spain', 'dial' => '34'],
		'ET' => ['name' => 'Ethiopia', 'dial' => '251'],
		'FI' => ['name' => 'Finland', 'dial' => '358'],
		'FJ' => ['name' => 'Fiji', 'dial' => '679'],
		'FK' => ['name' => 'Falkland Islands', 'dial' => '500'],
		'FM' => ['name' => 'Micronesia', 'dial' => '691'],
		'FO' => ['name' => 'Faroe Islands', 'dial' => '298'],
		'FR' => ['name' => 'France', 'dial' => '33'],
		'GA' => ['name' => 'Gabon', 'dial' => '241'],
		'GB' => ['name' => 'United Kingdom', 'dial' => '44'],
		'GD' => ['name' => 'Grenada', 'dial' => '1'],
		'GE' => ['name' => 'Georgia', 'dial' => '995'],
		'GF' => ['name' => 'French Guiana', 'dial' => '594'],
		'GG' => ['name' => 'Guernsey', 'dial' => '44'],
		'GH' => ['name' => 'Ghana', 'dial' => '233'],
		'GI' => ['name' => 'Gibraltar', 'dial' => '350'],
		'GL' => ['name' => 'Greenland', 'dial' => '299'],
		'GM' => ['name' => 'Gambia', 'dial' => '220'],
		'GN' => ['name' => 'Guinea', 'dial' => '224'],
		'GP' => ['name' => 'Guadeloupe', 'dial' => '590'],
		'GQ' => ['name' => 'Equatorial Guinea', 'dial' => '240'],
		'GR' => ['name' => 'Greece', 'dial' => '30'],
		'GS' => ['name' => 'South Georgia and South Sandwich Islands', 'dial' => ''],
		'GT' => ['name' => 'Guatemala', 'dial' => '502'],
		'GU' => ['name' => 'Guam', 'dial' => '1'],
		'GW' => ['name' => 'Guinea-Bissau', 'dial' => '245'],
		'GY' => ['name' => 'Guyana', 'dial' => '592'],
		'HK' => ['name' => 'Hong Kong', 'dial' => '852'],
		'HM' => ['name' => 'Heard Island and McDonald Islands', 'dial' => ''],
		'HN' => ['name' => 'Honduras', 'dial' => '504'],
		'HR' => ['name' => 'Croatia', 'dial' => '385'],
		'HT' => ['name' => 'Haiti', 'dial' => '509'],
		'HU' => ['name' => 'Hungary', 'dial' => '36'],
		'ID' => ['name' => 'Indonesia', 'dial' => '62'],
		'IE' => ['name' => 'Ireland', 'dial' => '353'],
		'IL' => ['name' => 'Israel', 'dial' => '972'],
		'IM' => ['name' => 'Isle of Man', 'dial' => '44'],
		'IN' => ['name' => 'India', 'dial' => '91'],
		'IO' => ['name' => 'British Indian Ocean Territory', 'dial' => '246'],
		'IQ' => ['name' => 'Iraq', 'dial' => '964'],
		'IR' => ['name' => 'Iran', 'dial' => '98'],
		'IS' => ['name' => 'Iceland', 'dial' => '354'],
		'IT' => ['name' => 'Italy', 'dial' => '39'],
		'JE' => ['name' => 'Jersey', 'dial' => '44'],
		'JM' => ['name' => 'Jamaica', 'dial' => '1'],
		'JO' => ['name' => 'Jordan', 'dial' => '962'],
		'JP' => ['name' => 'Japan', 'dial' => '81'],
		'KE' => ['name' => 'Kenya', 'dial' => '254'],
		'KG' => ['name' => 'Kyrgyzstan', 'dial' => '996'],
		'KH' => ['name' => 'Cambodia', 'dial' => '855'],
		'KI' => ['name' => 'Kiribati', 'dial' => '686'],
		'KM' => ['name' => 'Comoros', 'dial' => '269'],
		'KN' => ['name' => 'Saint Kitts and Nevis', 'dial' => '1'],
		'KP' => ['name' => 'North Korea', 'dial' => '850'],
		'KR' => ['name' => 'South Korea', 'dial' => '82'],
		'KW' => ['name' => 'Kuwait', 'dial' => '965'],
		'KY' => ['name' => 'Cayman Islands', 'dial' => '1'],
		'KZ' => ['name' => 'Kazakhstan', 'dial' => '7'],
		'LA' => ['name' => 'Laos', 'dial' => '856'],
		'LB' => ['name' => 'Lebanon', 'dial' => '961'],
		'LC' => ['name' => 'Saint Lucia', 'dial' => '1'],
		'LI' => ['name' => 'Liechtenstein', 'dial' => '423'],
		'LK' => ['name' => 'Sri Lanka', 'dial' => '94'],
		'LR' => ['name' => 'Liberia', 'dial' => '231'],
		'LS' => ['name' => 'Lesotho', 'dial' => '266'],
		'LT' => ['name' => 'Lithuania', 'dial' => '370'],
		'LU' => ['name' => 'Luxembourg', 'dial' => '352'],
		'LV' => ['name' => 'Latvia', 'dial' => '371'],
		'LY' => ['name' => 'Libya', 'dial' => '218'],
		'MA' => ['name' => 'Morocco', 'dial' => '212'],
		'MC' => ['name' => 'Monaco', 'dial' => '377'],
		'MD' => ['name' => 'Moldova', 'dial' => '373'],
		'ME' => ['name' => 'Montenegro', 'dial' => '382'],
		'MF' => ['name' => 'Saint Martin', 'dial' => '590'],
		'MG' => ['name' => 'Madagascar', 'dial' => '261'],
		'MH' => ['name' => 'Marshall Islands', 'dial' => '692'],
		'MK' => ['name' => 'North Macedonia', 'dial' => '389'],
		'ML' => ['name' => 'Mali', 'dial' => '223'],
		'MM' => ['name' => 'Myanmar', 'dial' => '95'],
		'MN' => ['name' => 'Mongolia', 'dial' => '976'],
		'MO' => ['name' => 'Macao', 'dial' => '853'],
		'MP' => ['name' => 'Northern Mariana Islands', 'dial' => '1'],
		'MQ' => ['name' => 'Martinique', 'dial' => '596'],
		'MR' => ['name' => 'Mauritania', 'dial' => '222'],
		'MS' => ['name' => 'Montserrat', 'dial' => '1'],
		'MT' => ['name' => 'Malta', 'dial' => '356'],
		'MU' => ['name' => 'Mauritius', 'dial' => '230'],
		'MV' => ['name' => 'Maldives', 'dial' => '960'],
		'MW' => ['name' => 'Malawi', 'dial' => '265'],
		'MX' => ['name' => 'Mexico', 'dial' => '52'],
		'MY' => ['name' => 'Malaysia', 'dial' => '60'],
		'MZ' => ['name' => 'Mozambique', 'dial' => '258'],
		'NA' => ['name' => 'Namibia', 'dial' => '264'],
		'NC' => ['name' => 'New Caledonia', 'dial' => '687'],
		'NE' => ['name' => 'Niger', 'dial' => '227'],
		'NF' => ['name' => 'Norfolk Island', 'dial' => '672'],
		'NG' => ['name' => 'Nigeria', 'dial' => '234'],
		'NI' => ['name' => 'Nicaragua', 'dial' => '505'],
		'NL' => ['name' => 'Netherlands', 'dial' => '31'],
		'NO' => ['name' => 'Norway', 'dial' => '47'],
		'NP' => ['name' => 'Nepal', 'dial' => '977'],
		'NR' => ['name' => 'Nauru', 'dial' => '674'],
		'NU' => ['name' => 'Niue', 'dial' => '683'],
		'NZ' => ['name' => 'New Zealand', 'dial' => '64'],
		'OM' => ['name' => 'Oman', 'dial' => '968'],
		'PA' => ['name' => 'Panama', 'dial' => '507'],
		'PE' => ['name' => 'Peru', 'dial' => '51'],
		'PF' => ['name' => 'French Polynesia', 'dial' => '689'],
		'PG' => ['name' => 'Papua New Guinea', 'dial' => '675'],
		'PH' => ['name' => 'Philippines', 'dial' => '63'],
		'PK' => ['name' => 'Pakistan', 'dial' => '92'],
		'PL' => ['name' => 'Poland', 'dial' => '48'],
		'PM' => ['name' => 'Saint Pierre and Miquelon', 'dial' => '508'],
		'PN' => ['name' => 'Pitcairn Islands', 'dial' => '64'],
		'PR' => ['name' => 'Puerto Rico', 'dial' => '1'],
		'PS' => ['name' => 'Palestine', 'dial' => '970'],
		'PT' => ['name' => 'Portugal', 'dial' => '351'],
		'PW' => ['name' => 'Palau', 'dial' => '680'],
		'PY' => ['name' => 'Paraguay', 'dial' => '595'],
		'QA' => ['name' => 'Qatar', 'dial' => '974'],
		'RE' => ['name' => 'Réunion', 'dial' => '262'],
		'RO' => ['name' => 'Romania', 'dial' => '40'],
		'RS' => ['name' => 'Serbia', 'dial' => '381'],
		'RU' => ['name' => 'Russia', 'dial' => '7'],
		'RW' => ['name' => 'Rwanda', 'dial' => '250'],
		'SA' => ['name' => 'Saudi Arabia', 'dial' => '966'],
		'SB' => ['name' => 'Solomon Islands', 'dial' => '677'],
		'SC' => ['name' => 'Seychelles', 'dial' => '248'],
		'SD' => ['name' => 'Sudan', 'dial' => '249'],
		'SE' => ['name' => 'Sweden', 'dial' => '46'],
		'SG' => ['name' => 'Singapore', 'dial' => '65'],
		'SH' => ['name' => 'Saint Helena', 'dial' => '290'],
		'SI' => ['name' => 'Slovenia', 'dial' => '386'],
		'SJ' => ['name' => 'Svalbard and Jan Mayen', 'dial' => '47'],
		'SK' => ['name' => 'Slovakia', 'dial' => '421'],
		'SL' => ['name' => 'Sierra Leone', 'dial' => '232'],
		'SM' => ['name' => 'San Marino', 'dial' => '378'],
		'SN' => ['name' => 'Senegal', 'dial' => '221'],
		'SO' => ['name' => 'Somalia', 'dial' => '252'],
		'SR' => ['name' => 'Suriname', 'dial' => '597'],
		'SS' => ['name' => 'South Sudan', 'dial' => '211'],
		'ST' => ['name' => 'São Tomé and Príncipe', 'dial' => '239'],
		'SV' => ['name' => 'El Salvador', 'dial' => '503'],
		'SX' => ['name' => 'Sint Maarten', 'dial' => '1'],
		'SY' => ['name' => 'Syria', 'dial' => '963'],
		'SZ' => ['name' => 'Eswatini', 'dial' => '268'],
		'TC' => ['name' => 'Turks and Caicos Islands', 'dial' => '1'],
		'TD' => ['name' => 'Chad', 'dial' => '235'],
		'TF' => ['name' => 'French Southern Territories', 'dial' => ''],
		'TG' => ['name' => 'Togo', 'dial' => '228'],
		'TH' => ['name' => 'Thailand', 'dial' => '66'],
		'TJ' => ['name' => 'Tajikistan', 'dial' => '992'],
		'TK' => ['name' => 'Tokelau', 'dial' => '690'],
		'TL' => ['name' => 'Timor-Leste', 'dial' => '670'],
		'TM' => ['name' => 'Turkmenistan', 'dial' => '993'],
		'TN' => ['name' => 'Tunisia', 'dial' => '216'],
		'TO' => ['name' => 'Tonga', 'dial' => '676'],
		'TR' => ['name' => 'Türkiye', 'dial' => '90'],
		'TT' => ['name' => 'Trinidad and Tobago', 'dial' => '1'],
		'TV' => ['name' => 'Tuvalu', 'dial' => '688'],
		'TW' => ['name' => 'Taiwan', 'dial' => '886'],
		'TZ' => ['name' => 'Tanzania', 'dial' => '255'],
		'UA' => ['name' => 'Ukraine', 'dial' => '380'],
		'UG' => ['name' => 'Uganda', 'dial' => '256'],
		'UM' => ['name' => 'United States Minor Outlying Islands', 'dial' => ''],
		'US' => ['name' => 'United States', 'dial' => '1'],
		'UY' => ['name' => 'Uruguay', 'dial' => '598'],
		'UZ' => ['name' => 'Uzbekistan', 'dial' => '998'],
		'VA' => ['name' => 'Vatican City', 'dial' => '39'],
		'VC' => ['name' => 'Saint Vincent and the Grenadines', 'dial' => '1'],
		'VE' => ['name' => 'Venezuela', 'dial' => '58'],
		'VG' => ['name' => 'British Virgin Islands', 'dial' => '1'],
		'VI' => ['name' => 'U.S. Virgin Islands', 'dial' => '1'],
		'VN' => ['name' => 'Vietnam', 'dial' => '84'],
		'VU' => ['name' => 'Vanuatu', 'dial' => '678'],
		'WF' => ['name' => 'Wallis and Futuna', 'dial' => '681'],
		'WS' => ['name' => 'Samoa', 'dial' => '685'],
		'XK' => ['name' => 'Kosovo', 'dial' => '383'],
		'YE' => ['name' => 'Yemen', 'dial' => '967'],
		'YT' => ['name' => 'Mayotte', 'dial' => '262'],
		'ZA' => ['name' => 'South Africa', 'dial' => '27'],
		'ZM' => ['name' => 'Zambia', 'dial' => '260'],
		'ZW' => ['name' => 'Zimbabwe', 'dial' => '263'],
	];

	/**
	 * Active ISO 4217 currencies keyed by uppercase 3-letter code.
	 *
	 * @var array<string, array{name: string, symbol: string}>
	 */
	private const array CURRENCIES = [
		'AED' => ['name' => 'UAE Dirham', 'symbol' => 'د.إ'],
		'AFN' => ['name' => 'Afghan Afghani', 'symbol' => '؋'],
		'ALL' => ['name' => 'Albanian Lek', 'symbol' => 'L'],
		'AMD' => ['name' => 'Armenian Dram', 'symbol' => '֏'],
		'ANG' => ['name' => 'Netherlands Antillean Guilder', 'symbol' => 'ƒ'],
		'AOA' => ['name' => 'Angolan Kwanza', 'symbol' => 'Kz'],
		'ARS' => ['name' => 'Argentine Peso', 'symbol' => '$'],
		'AUD' => ['name' => 'Australian Dollar', 'symbol' => 'A$'],
		'AWG' => ['name' => 'Aruban Florin', 'symbol' => 'ƒ'],
		'AZN' => ['name' => 'Azerbaijani Manat', 'symbol' => '₼'],
		'BAM' => ['name' => 'Bosnia-Herzegovina Convertible Mark', 'symbol' => 'KM'],
		'BBD' => ['name' => 'Barbadian Dollar', 'symbol' => '$'],
		'BDT' => ['name' => 'Bangladeshi Taka', 'symbol' => '৳'],
		'BGN' => ['name' => 'Bulgarian Lev', 'symbol' => 'лв'],
		'BHD' => ['name' => 'Bahraini Dinar', 'symbol' => '.د.ب'],
		'BIF' => ['name' => 'Burundian Franc', 'symbol' => 'FBu'],
		'BMD' => ['name' => 'Bermudian Dollar', 'symbol' => '$'],
		'BND' => ['name' => 'Brunei Dollar', 'symbol' => '$'],
		'BOB' => ['name' => 'Bolivian Boliviano', 'symbol' => 'Bs.'],
		'BRL' => ['name' => 'Brazilian Real', 'symbol' => 'R$'],
		'BSD' => ['name' => 'Bahamian Dollar', 'symbol' => '$'],
		'BTN' => ['name' => 'Bhutanese Ngultrum', 'symbol' => 'Nu.'],
		'BWP' => ['name' => 'Botswanan Pula', 'symbol' => 'P'],
		'BYN' => ['name' => 'Belarusian Ruble', 'symbol' => 'Br'],
		'BZD' => ['name' => 'Belize Dollar', 'symbol' => 'BZ$'],
		'CAD' => ['name' => 'Canadian Dollar', 'symbol' => 'C$'],
		'CDF' => ['name' => 'Congolese Franc', 'symbol' => 'FC'],
		'CHF' => ['name' => 'Swiss Franc', 'symbol' => 'CHF'],
		'CLP' => ['name' => 'Chilean Peso', 'symbol' => '$'],
		'CNY' => ['name' => 'Chinese Yuan', 'symbol' => '¥'],
		'COP' => ['name' => 'Colombian Peso', 'symbol' => '$'],
		'CRC' => ['name' => 'Costa Rican Colón', 'symbol' => '₡'],
		'CUP' => ['name' => 'Cuban Peso', 'symbol' => '₱'],
		'CVE' => ['name' => 'Cape Verdean Escudo', 'symbol' => '$'],
		'CZK' => ['name' => 'Czech Koruna', 'symbol' => 'Kč'],
		'DJF' => ['name' => 'Djiboutian Franc', 'symbol' => 'Fdj'],
		'DKK' => ['name' => 'Danish Krone', 'symbol' => 'kr'],
		'DOP' => ['name' => 'Dominican Peso', 'symbol' => 'RD$'],
		'DZD' => ['name' => 'Algerian Dinar', 'symbol' => 'دج'],
		'EGP' => ['name' => 'Egyptian Pound', 'symbol' => 'E£'],
		'ERN' => ['name' => 'Eritrean Nakfa', 'symbol' => 'Nfk'],
		'ETB' => ['name' => 'Ethiopian Birr', 'symbol' => 'Br'],
		'EUR' => ['name' => 'Euro', 'symbol' => '€'],
		'FJD' => ['name' => 'Fijian Dollar', 'symbol' => '$'],
		'FKP' => ['name' => 'Falkland Islands Pound', 'symbol' => '£'],
		'GBP' => ['name' => 'British Pound', 'symbol' => '£'],
		'GEL' => ['name' => 'Georgian Lari', 'symbol' => '₾'],
		'GHS' => ['name' => 'Ghanaian Cedi', 'symbol' => '₵'],
		'GIP' => ['name' => 'Gibraltar Pound', 'symbol' => '£'],
		'GMD' => ['name' => 'Gambian Dalasi', 'symbol' => 'D'],
		'GNF' => ['name' => 'Guinean Franc', 'symbol' => 'FG'],
		'GTQ' => ['name' => 'Guatemalan Quetzal', 'symbol' => 'Q'],
		'GYD' => ['name' => 'Guyanese Dollar', 'symbol' => '$'],
		'HKD' => ['name' => 'Hong Kong Dollar', 'symbol' => 'HK$'],
		'HNL' => ['name' => 'Honduran Lempira', 'symbol' => 'L'],
		'HTG' => ['name' => 'Haitian Gourde', 'symbol' => 'G'],
		'HUF' => ['name' => 'Hungarian Forint', 'symbol' => 'Ft'],
		'IDR' => ['name' => 'Indonesian Rupiah', 'symbol' => 'Rp'],
		'ILS' => ['name' => 'Israeli New Shekel', 'symbol' => '₪'],
		'INR' => ['name' => 'Indian Rupee', 'symbol' => '₹'],
		'IQD' => ['name' => 'Iraqi Dinar', 'symbol' => 'ع.د'],
		'IRR' => ['name' => 'Iranian Rial', 'symbol' => '﷼'],
		'ISK' => ['name' => 'Icelandic Króna', 'symbol' => 'kr'],
		'JMD' => ['name' => 'Jamaican Dollar', 'symbol' => 'J$'],
		'JOD' => ['name' => 'Jordanian Dinar', 'symbol' => 'JD'],
		'JPY' => ['name' => 'Japanese Yen', 'symbol' => '¥'],
		'KES' => ['name' => 'Kenyan Shilling', 'symbol' => 'KSh'],
		'KGS' => ['name' => 'Kyrgystani Som', 'symbol' => 'с'],
		'KHR' => ['name' => 'Cambodian Riel', 'symbol' => '៛'],
		'KMF' => ['name' => 'Comorian Franc', 'symbol' => 'CF'],
		'KPW' => ['name' => 'North Korean Won', 'symbol' => '₩'],
		'KRW' => ['name' => 'South Korean Won', 'symbol' => '₩'],
		'KWD' => ['name' => 'Kuwaiti Dinar', 'symbol' => 'KD'],
		'KYD' => ['name' => 'Cayman Islands Dollar', 'symbol' => '$'],
		'KZT' => ['name' => 'Kazakhstani Tenge', 'symbol' => '₸'],
		'LAK' => ['name' => 'Laotian Kip', 'symbol' => '₭'],
		'LBP' => ['name' => 'Lebanese Pound', 'symbol' => 'ل.ل'],
		'LKR' => ['name' => 'Sri Lankan Rupee', 'symbol' => 'Rs'],
		'LRD' => ['name' => 'Liberian Dollar', 'symbol' => '$'],
		'LSL' => ['name' => 'Lesotho Loti', 'symbol' => 'L'],
		'LYD' => ['name' => 'Libyan Dinar', 'symbol' => 'LD'],
		'MAD' => ['name' => 'Moroccan Dirham', 'symbol' => 'MAD'],
		'MDL' => ['name' => 'Moldovan Leu', 'symbol' => 'L'],
		'MGA' => ['name' => 'Malagasy Ariary', 'symbol' => 'Ar'],
		'MKD' => ['name' => 'Macedonian Denar', 'symbol' => 'ден'],
		'MMK' => ['name' => 'Myanmar Kyat', 'symbol' => 'K'],
		'MNT' => ['name' => 'Mongolian Tugrik', 'symbol' => '₮'],
		'MOP' => ['name' => 'Macanese Pataca', 'symbol' => 'MOP$'],
		'MRU' => ['name' => 'Mauritanian Ouguiya', 'symbol' => 'UM'],
		'MUR' => ['name' => 'Mauritian Rupee', 'symbol' => '₨'],
		'MVR' => ['name' => 'Maldivian Rufiyaa', 'symbol' => 'Rf'],
		'MWK' => ['name' => 'Malawian Kwacha', 'symbol' => 'MK'],
		'MXN' => ['name' => 'Mexican Peso', 'symbol' => 'MX$'],
		'MYR' => ['name' => 'Malaysian Ringgit', 'symbol' => 'RM'],
		'MZN' => ['name' => 'Mozambican Metical', 'symbol' => 'MT'],
		'NAD' => ['name' => 'Namibian Dollar', 'symbol' => '$'],
		'NGN' => ['name' => 'Nigerian Naira', 'symbol' => '₦'],
		'NIO' => ['name' => 'Nicaraguan Córdoba', 'symbol' => 'C$'],
		'NOK' => ['name' => 'Norwegian Krone', 'symbol' => 'kr'],
		'NPR' => ['name' => 'Nepalese Rupee', 'symbol' => '₨'],
		'NZD' => ['name' => 'New Zealand Dollar', 'symbol' => 'NZ$'],
		'OMR' => ['name' => 'Omani Rial', 'symbol' => 'ر.ع.'],
		'PAB' => ['name' => 'Panamanian Balboa', 'symbol' => 'B/.'],
		'PEN' => ['name' => 'Peruvian Sol', 'symbol' => 'S/'],
		'PGK' => ['name' => 'Papua New Guinean Kina', 'symbol' => 'K'],
		'PHP' => ['name' => 'Philippine Peso', 'symbol' => '₱'],
		'PKR' => ['name' => 'Pakistani Rupee', 'symbol' => '₨'],
		'PLN' => ['name' => 'Polish Złoty', 'symbol' => 'zł'],
		'PYG' => ['name' => 'Paraguayan Guarani', 'symbol' => '₲'],
		'QAR' => ['name' => 'Qatari Riyal', 'symbol' => 'ر.ق'],
		'RON' => ['name' => 'Romanian Leu', 'symbol' => 'lei'],
		'RSD' => ['name' => 'Serbian Dinar', 'symbol' => 'din'],
		'RUB' => ['name' => 'Russian Ruble', 'symbol' => '₽'],
		'RWF' => ['name' => 'Rwandan Franc', 'symbol' => 'FRw'],
		'SAR' => ['name' => 'Saudi Riyal', 'symbol' => 'ر.س'],
		'SBD' => ['name' => 'Solomon Islands Dollar', 'symbol' => '$'],
		'SCR' => ['name' => 'Seychellois Rupee', 'symbol' => '₨'],
		'SDG' => ['name' => 'Sudanese Pound', 'symbol' => '£'],
		'SEK' => ['name' => 'Swedish Krona', 'symbol' => 'kr'],
		'SGD' => ['name' => 'Singapore Dollar', 'symbol' => 'S$'],
		'SHP' => ['name' => 'Saint Helena Pound', 'symbol' => '£'],
		'SLE' => ['name' => 'Sierra Leonean Leone', 'symbol' => 'Le'],
		'SOS' => ['name' => 'Somali Shilling', 'symbol' => 'Sh'],
		'SRD' => ['name' => 'Surinamese Dollar', 'symbol' => '$'],
		'SSP' => ['name' => 'South Sudanese Pound', 'symbol' => '£'],
		'STN' => ['name' => 'São Tomé and Príncipe Dobra', 'symbol' => 'Db'],
		'SYP' => ['name' => 'Syrian Pound', 'symbol' => '£S'],
		'SZL' => ['name' => 'Swazi Lilangeni', 'symbol' => 'L'],
		'THB' => ['name' => 'Thai Baht', 'symbol' => '฿'],
		'TJS' => ['name' => 'Tajikistani Somoni', 'symbol' => 'ЅМ'],
		'TMT' => ['name' => 'Turkmenistani Manat', 'symbol' => 'm'],
		'TND' => ['name' => 'Tunisian Dinar', 'symbol' => 'د.ت'],
		'TOP' => ['name' => 'Tongan Paʻanga', 'symbol' => 'T$'],
		'TRY' => ['name' => 'Turkish Lira', 'symbol' => '₺'],
		'TTD' => ['name' => 'Trinidad and Tobago Dollar', 'symbol' => 'TT$'],
		'TWD' => ['name' => 'New Taiwan Dollar', 'symbol' => 'NT$'],
		'TZS' => ['name' => 'Tanzanian Shilling', 'symbol' => 'TSh'],
		'UAH' => ['name' => 'Ukrainian Hryvnia', 'symbol' => '₴'],
		'UGX' => ['name' => 'Ugandan Shilling', 'symbol' => 'USh'],
		'USD' => ['name' => 'US Dollar', 'symbol' => '$'],
		'UYU' => ['name' => 'Uruguayan Peso', 'symbol' => '$U'],
		'UZS' => ['name' => 'Uzbekistani Som', 'symbol' => 'soʻm'],
		'VES' => ['name' => 'Venezuelan Bolívar', 'symbol' => 'Bs.'],
		'VND' => ['name' => 'Vietnamese Dong', 'symbol' => '₫'],
		'VUV' => ['name' => 'Vanuatu Vatu', 'symbol' => 'VT'],
		'WST' => ['name' => 'Samoan Tala', 'symbol' => 'WS$'],
		'XAF' => ['name' => 'Central African CFA Franc', 'symbol' => 'FCFA'],
		'XCD' => ['name' => 'East Caribbean Dollar', 'symbol' => 'EC$'],
		'XOF' => ['name' => 'West African CFA Franc', 'symbol' => 'CFA'],
		'XPF' => ['name' => 'CFP Franc', 'symbol' => '₣'],
		'YER' => ['name' => 'Yemeni Rial', 'symbol' => '﷼'],
		'ZAR' => ['name' => 'South African Rand', 'symbol' => 'R'],
		'ZMW' => ['name' => 'Zambian Kwacha', 'symbol' => 'ZK'],
		'ZWG' => ['name' => 'Zimbabwe Gold', 'symbol' => 'ZiG'],
	];

	/**
	 * ISO 3166-2 subdivisions for key jurisdictions keyed by uppercase country code.
	 *
	 * @var array<string, array<int|string, string>>
	 */
	private const array SUBDIVISIONS = [
		'TR' => [
			'01' => 'Adana',
			'02' => 'Adıyaman',
			'03' => 'Afyonkarahisar',
			'04' => 'Ağrı',
			'05' => 'Amasya',
			'06' => 'Ankara',
			'07' => 'Antalya',
			'08' => 'Artvin',
			'09' => 'Aydın',
			'10' => 'Balıkesir',
			'11' => 'Bilecik',
			'12' => 'Bingöl',
			'13' => 'Bitlis',
			'14' => 'Bolu',
			'15' => 'Burdur',
			'16' => 'Bursa',
			'17' => 'Çanakkale',
			'18' => 'Çankırı',
			'19' => 'Çorum',
			'20' => 'Denizli',
			'21' => 'Diyarbakır',
			'22' => 'Edirne',
			'23' => 'Elazığ',
			'24' => 'Erzincan',
			'25' => 'Erzurum',
			'26' => 'Eskişehir',
			'27' => 'Gaziantep',
			'28' => 'Giresun',
			'29' => 'Gümüşhane',
			'30' => 'Hakkâri',
			'31' => 'Hatay',
			'32' => 'Isparta',
			'33' => 'Mersin',
			'34' => 'İstanbul',
			'35' => 'İzmir',
			'36' => 'Kars',
			'37' => 'Kastamonu',
			'38' => 'Kayseri',
			'39' => 'Kırklareli',
			'40' => 'Kırşehir',
			'41' => 'Kocaeli',
			'42' => 'Konya',
			'43' => 'Kütahya',
			'44' => 'Malatya',
			'45' => 'Manisa',
			'46' => 'Kahramanmaraş',
			'47' => 'Mardin',
			'48' => 'Muğla',
			'49' => 'Muş',
			'50' => 'Nevşehir',
			'51' => 'Niğde',
			'52' => 'Ordu',
			'53' => 'Rize',
			'54' => 'Sakarya',
			'55' => 'Samsun',
			'56' => 'Siirt',
			'57' => 'Sinop',
			'58' => 'Sivas',
			'59' => 'Tekirdağ',
			'60' => 'Tokat',
			'61' => 'Trabzon',
			'62' => 'Tunceli',
			'63' => 'Şanlıurfa',
			'64' => 'Uşak',
			'65' => 'Van',
			'66' => 'Yozgat',
			'67' => 'Zonguldak',
			'68' => 'Aksaray',
			'69' => 'Bayburt',
			'70' => 'Karaman',
			'71' => 'Kırıkkale',
			'72' => 'Batman',
			'73' => 'Şırnak',
			'74' => 'Bartın',
			'75' => 'Ardahan',
			'76' => 'Iğdır',
			'77' => 'Yalova',
			'78' => 'Karabük',
			'79' => 'Kilis',
			'80' => 'Osmaniye',
			'81' => 'Düzce',
		],
		'US' => [
			'AL' => 'Alabama',
			'AK' => 'Alaska',
			'AZ' => 'Arizona',
			'AR' => 'Arkansas',
			'CA' => 'California',
			'CO' => 'Colorado',
			'CT' => 'Connecticut',
			'DE' => 'Delaware',
			'DC' => 'District of Columbia',
			'FL' => 'Florida',
			'GA' => 'Georgia',
			'HI' => 'Hawaii',
			'ID' => 'Idaho',
			'IL' => 'Illinois',
			'IN' => 'Indiana',
			'IA' => 'Iowa',
			'KS' => 'Kansas',
			'KY' => 'Kentucky',
			'LA' => 'Louisiana',
			'ME' => 'Maine',
			'MD' => 'Maryland',
			'MA' => 'Massachusetts',
			'MI' => 'Michigan',
			'MN' => 'Minnesota',
			'MS' => 'Mississippi',
			'MO' => 'Missouri',
			'MT' => 'Montana',
			'NE' => 'Nebraska',
			'NV' => 'Nevada',
			'NH' => 'New Hampshire',
			'NJ' => 'New Jersey',
			'NM' => 'New Mexico',
			'NY' => 'New York',
			'NC' => 'North Carolina',
			'ND' => 'North Dakota',
			'OH' => 'Ohio',
			'OK' => 'Oklahoma',
			'OR' => 'Oregon',
			'PA' => 'Pennsylvania',
			'RI' => 'Rhode Island',
			'SC' => 'South Carolina',
			'SD' => 'South Dakota',
			'TN' => 'Tennessee',
			'TX' => 'Texas',
			'UT' => 'Utah',
			'VT' => 'Vermont',
			'VA' => 'Virginia',
			'WA' => 'Washington',
			'WV' => 'West Virginia',
			'WI' => 'Wisconsin',
			'WY' => 'Wyoming',
		],
		'CA' => [
			'AB' => 'Alberta',
			'BC' => 'British Columbia',
			'MB' => 'Manitoba',
			'NB' => 'New Brunswick',
			'NL' => 'Newfoundland and Labrador',
			'NS' => 'Nova Scotia',
			'NT' => 'Northwest Territories',
			'NU' => 'Nunavut',
			'ON' => 'Ontario',
			'PE' => 'Prince Edward Island',
			'QC' => 'Quebec',
			'SK' => 'Saskatchewan',
			'YT' => 'Yukon',
		],
		'DE' => [
			'BW' => 'Baden-Württemberg',
			'BY' => 'Bayern',
			'BE' => 'Berlin',
			'BB' => 'Brandenburg',
			'HB' => 'Bremen',
			'HH' => 'Hamburg',
			'HE' => 'Hessen',
			'MV' => 'Mecklenburg-Vorpommern',
			'NI' => 'Niedersachsen',
			'NW' => 'Nordrhein-Westfalen',
			'RP' => 'Rheinland-Pfalz',
			'SL' => 'Saarland',
			'SN' => 'Sachsen',
			'ST' => 'Sachsen-Anhalt',
			'SH' => 'Schleswig-Holstein',
			'TH' => 'Thüringen',
		],
		'AU' => [
			'ACT' => 'Australian Capital Territory',
			'NSW' => 'New South Wales',
			'NT' => 'Northern Territory',
			'QLD' => 'Queensland',
			'SA' => 'South Australia',
			'TAS' => 'Tasmania',
			'VIC' => 'Victoria',
			'WA' => 'Western Australia',
		],
		'GB' => [
			'ENG' => 'England',
			'NIR' => 'Northern Ireland',
			'SCT' => 'Scotland',
			'WLS' => 'Wales',
		],
	];

	/**
	 * European Union 27 member state ISO 3166-1 alpha-2 codes.
	 *
	 * @var list<string>
	 */
	private const array EU_COUNTRIES = [
		'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES',
		'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU',
		'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
	];

	/**
	 * ISO 4217 currencies with zero decimal minor units.
	 *
	 * @var array<string, true>
	 */
	private const array ZERO_DECIMAL_CURRENCIES = [
		'BIF' => true,
		'CLP' => true,
		'DJF' => true,
		'GNF' => true,
		'ISK' => true,
		'JPY' => true,
		'KMF' => true,
		'KRW' => true,
		'PYG' => true,
		'RWF' => true,
		'UGX' => true,
		'VND' => true,
		'VUV' => true,
		'XAF' => true,
		'XOF' => true,
		'XPF' => true,
	];

	/**
	 * ISO 4217 currencies with three decimal minor units.
	 *
	 * @var array<string, true>
	 */
	private const array THREE_DECIMAL_CURRENCIES = [
		'BHD' => true,
		'IQD' => true,
		'JOD' => true,
		'KWD' => true,
		'LYD' => true,
		'OMR' => true,
		'TND' => true,
	];

	/** @var array<string, true>|null */
	private static ?array $timezoneSetCache = null;

	/** @var array<string, array<string, string>> */
	private static array $timezoneOptionsCache = [];

	/**
	 * Return ISO 3166-1 alpha-2 country options formatted `'CC' => 'CC — Country Name'`.
	 *
	 * @param list<string> $only Restrict to these uppercase ISO-2 codes when non-empty.
	 * @param list<string> $exclude Omit these uppercase ISO-2 codes.
	 * @param list<string> $preferred Pin these uppercase ISO-2 codes first in given order.
	 * @return array<string, string>
	 */
	public static function countryOptions(array $only = [], array $exclude = [], array $preferred = []): array
	{
		$filtered = self::filterCountryMap($only, $exclude, $preferred);
		$options = [];
		foreach ($filtered as $code => $entry) {
			$options[$code] = $code . ' — ' . $entry['name'];
		}

		return $options;
	}

	/**
	 * Return structured country metadata items with dial codes for the phone control.
	 *
	 * @param list<string> $only Restrict to these uppercase ISO-2 codes when non-empty.
	 * @param list<string> $exclude Omit these uppercase ISO-2 codes.
	 * @param list<string> $preferred Pin these uppercase ISO-2 codes first in given order.
	 * @return list<array{code: string, name: string, dial: string}>
	 */
	public static function phoneCountryItems(array $only = [], array $exclude = [], array $preferred = []): array
	{
		$filtered = self::filterCountryMap($only, $exclude, $preferred);
		$items = [];
		foreach ($filtered as $code => $entry) {
			if ($entry['dial'] === '') {
				continue;
			}
			$items[] = [
				'code' => $code,
				'name' => $entry['name'],
				'dial' => $entry['dial'],
			];
		}

		return $items;
	}

	public static function countryName(string $code): string
	{
		$upper = strtoupper(trim($code));

		return self::COUNTRIES[$upper]['name'] ?? '';
	}

	public static function isValidCountryCode(string $code): bool
	{
		return isset(self::COUNTRIES[strtoupper(trim($code))]);
	}

	public static function dialCode(string $countryCode): string
	{
		return self::COUNTRIES[strtoupper(trim($countryCode))]['dial'] ?? '';
	}

	/**
	 * Normalize a raw phone string into canonical E.164 (`+<digits>`) using `$defaultCountryCode` for national numbers.
	 */
	public static function normalizePhoneE164(string $raw, string $defaultCountryCode = ''): string
	{
		$trimmed = trim($raw);
		if ($trimmed === '') {
			return '';
		}

		$hasPlus = str_starts_with($trimmed, '+');
		$digits = (string) preg_replace('/[^0-9]/', '', $trimmed);
		if ($digits === '' || strlen($digits) < 6) {
			return '';
		}

		if (str_starts_with($digits, '00') && strlen($digits) > 8) {
			$digits = substr($digits, 2);
			$hasPlus = true;
		}

		if ($hasPlus) {
			return '+' . $digits;
		}

		$prefix = self::dialCode($defaultCountryCode);
		if ($prefix !== '') {
			$national = ltrim($digits, '0');
			if ($national !== '') {
				if (str_starts_with($digits, $prefix) && strlen($digits) > strlen($prefix) + 5) {
					return '+' . $digits;
				}

				return '+' . $prefix . $national;
			}
		}

		return '+' . $digits;
	}

	public static function isValidPhoneE164(string $value): bool
	{
		return preg_match('/^\+[1-9][0-9]{5,17}$/', trim($value)) === 1;
	}

	/**
	 * Return ISO 4217 currency options formatted `'EUR' => 'EUR (€) — Euro'`.
	 *
	 * @param list<string> $only Restrict to these uppercase ISO 4217 codes when non-empty.
	 * @param list<string> $exclude Omit these uppercase ISO 4217 codes.
	 * @param list<string> $preferred Pin these uppercase ISO 4217 codes first in given order.
	 * @return array<string, string>
	 */
	public static function currencyOptions(array $only = [], array $exclude = [], array $preferred = []): array
	{
		$onlySet = self::normalizeUpperCodeSet($only);
		$excludeSet = self::normalizeUpperCodeSet($exclude);

		$pool = [];
		foreach (self::CURRENCIES as $code => $meta) {
			if ($onlySet !== [] && !isset($onlySet[$code])) {
				continue;
			}
			if (isset($excludeSet[$code])) {
				continue;
			}
			$pool[$code] = $meta;
		}

		$ordered = [];
		foreach ($preferred as $prefRaw) {
			$prefCode = strtoupper(trim($prefRaw));
			if ($prefCode !== '' && isset($pool[$prefCode]) && !isset($ordered[$prefCode])) {
				$ordered[$prefCode] = $pool[$prefCode];
			}
		}

		foreach ($pool as $code => $meta) {
			if (!isset($ordered[$code])) {
				$ordered[$code] = $meta;
			}
		}

		$options = [];
		foreach ($ordered as $code => $meta) {
			$options[$code] = $meta['symbol'] !== '' && $meta['symbol'] !== $code
				? $code . ' (' . $meta['symbol'] . ') — ' . $meta['name']
				: $code . ' — ' . $meta['name'];
		}

		return $options;
	}

	public static function currencySymbol(string $code): string
	{
		return self::CURRENCIES[strtoupper(trim($code))]['symbol'] ?? '';
	}

	public static function currencyName(string $code): string
	{
		return self::CURRENCIES[strtoupper(trim($code))]['name'] ?? '';
	}

	public static function isValidCurrencyCode(string $code): bool
	{
		return isset(self::CURRENCIES[strtoupper(trim($code))]);
	}

	/**
	 * Return ISO 3166-2 subdivision options (`code => name`) for supported jurisdictions.
	 *
	 * Note: Turkish province keys `10`–`81` remain integer keys in PHP arrays while `01`–`09` are strings.
	 *
	 * @return array<int|string, string>
	 */
	public static function subdivisionOptions(string $countryCode): array
	{
		$upper = strtoupper(trim($countryCode));

		return self::SUBDIVISIONS[$upper] ?? [];
	}

	/**
	 * Check whether `$code` is a valid ISO 3166-2 subdivision key for `$countryCode`.
	 */
	public static function isValidSubdivision(string $countryCode, string $code): bool
	{
		$upperCountry = strtoupper(trim($countryCode));
		$upperCode = strtoupper(trim($code));
		if ($upperCountry === '' || $upperCode === '') {
			return false;
		}

		$subdivisions = self::SUBDIVISIONS[$upperCountry] ?? null;
		if ($subdivisions === null) {
			return false;
		}

		return isset($subdivisions[$upperCode]);
	}

	/**
	 * Return the 27 European Union member state ISO 3166-1 alpha-2 codes.
	 *
	 * @return list<string>
	 */
	public static function euCountryCodes(): array
	{
		return self::EU_COUNTRIES;
	}

	/**
	 * Check whether an ISO 3166-1 alpha-2 country code is a European Union member state.
	 */
	public static function isEuCountry(string $countryCode): bool
	{
		$upper = strtoupper(trim($countryCode));
		if ($upper === '') {
			return false;
		}

		return in_array($upper, self::EU_COUNTRIES, true);
	}

	/**
	 * Return the ISO 4217 minor unit exponent (`0`, `2`, or `3`) for a currency code.
	 */
	public static function currencyMinorUnits(string $code): int
	{
		$upper = strtoupper(trim($code));
		if ($upper !== '' && isset(self::ZERO_DECIMAL_CURRENCIES[$upper])) {
			return 0;
		}
		if ($upper !== '' && isset(self::THREE_DECIMAL_CURRENCIES[$upper])) {
			return 3;
		}

		return 2;
	}

	/**
	 * Return IANA timezone identifier options backed by PHP's `DateTimeZone::listIdentifiers()`.
	 *
	 * @param list<string> $regions Optional top-level region prefixes (e.g. `['Europe', 'America', 'UTC']`).
	 * @return array<string, string>
	 */
	public static function timezoneOptions(array $regions = [], bool $includeOffset = true): array
	{
		$normalizedRegions = [];
		foreach ($regions as $region) {
			$clean = trim($region);
			if ($clean !== '') {
				$normalizedRegions[] = $clean;
			}
		}
		$cacheKey = implode(',', $normalizedRegions) . '|' . ($includeOffset ? '1' : '0');
		if (isset(self::$timezoneOptionsCache[$cacheKey])) {
			return self::$timezoneOptionsCache[$cacheKey];
		}

		$regionPrefixes = array_map(
			static fn(string $r): string => strtolower(rtrim($r, '/')),
			$normalizedRegions
		);

		$nowUtc = $includeOffset ? new \DateTimeImmutable('now', new \DateTimeZone('UTC')) : null;
		$options = [];
		foreach (\DateTimeZone::listIdentifiers(\DateTimeZone::ALL) as $tzId) {
			if ($regionPrefixes !== []) {
				$lowerTz = strtolower($tzId);
				$prefix = ($slashPos = strpos($lowerTz, '/')) !== false ? substr($lowerTz, 0, $slashPos) : $lowerTz;
				if (!in_array($prefix, $regionPrefixes, true) && !in_array($lowerTz, $regionPrefixes, true)) {
					continue;
				}
			}

			if ($nowUtc !== null) {
				$tzObj = new \DateTimeZone($tzId);
				$offsetSeconds = $tzObj->getOffset($nowUtc);
				$sign = $offsetSeconds >= 0 ? '+' : '-';
				$abs = abs($offsetSeconds);
				$hours = intdiv($abs, 3600);
				$minutes = intdiv($abs % 3600, 60);
				$options[$tzId] = sprintf('%s (UTC%s%02d:%02d)', $tzId, $sign, $hours, $minutes);
			} else {
				$options[$tzId] = $tzId;
			}
		}

		self::$timezoneOptionsCache[$cacheKey] = $options;

		return $options;
	}

	public static function isValidTimezone(string $timezone): bool
	{
		$clean = trim($timezone);
		if ($clean === '') {
			return false;
		}
		if (self::$timezoneSetCache === null) {
			self::$timezoneSetCache = array_fill_keys(\DateTimeZone::listIdentifiers(\DateTimeZone::ALL), true);
		}

		return isset(self::$timezoneSetCache[$clean]);
	}

	/**
	 * @param list<string> $only
	 * @param list<string> $exclude
	 * @param list<string> $preferred
	 * @return array<string, array{name: string, dial: string}>
	 */
	private static function filterCountryMap(array $only, array $exclude, array $preferred): array
	{
		$onlySet = self::normalizeUpperCodeSet($only);
		$excludeSet = self::normalizeUpperCodeSet($exclude);

		$pool = [];
		foreach (self::COUNTRIES as $code => $entry) {
			if ($onlySet !== [] && !isset($onlySet[$code])) {
				continue;
			}
			if (isset($excludeSet[$code])) {
				continue;
			}
			$pool[$code] = $entry;
		}

		$ordered = [];
		foreach ($preferred as $prefRaw) {
			$prefCode = strtoupper(trim($prefRaw));
			if ($prefCode !== '' && isset($pool[$prefCode]) && !isset($ordered[$prefCode])) {
				$ordered[$prefCode] = $pool[$prefCode];
				unset($pool[$prefCode]);
			}
		}

		uasort(
			$pool,
			static fn(array $a, array $b): int => strcmp($a['name'], $b['name'])
		);

		foreach ($pool as $code => $entry) {
			$ordered[$code] = $entry;
		}

		return $ordered;
	}

	/**
	 * @param list<string> $codes
	 * @return array<string, true>
	 */
	private static function normalizeUpperCodeSet(array $codes): array
	{
		$set = [];
		foreach ($codes as $code) {
			$clean = strtoupper(trim($code));
			if ($clean !== '') {
				$set[$clean] = true;
			}
		}

		return $set;
	}
}
