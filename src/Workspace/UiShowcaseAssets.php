<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

/**
 * Deterministic, self-contained SVG sample generator for the debug-only UI Showcase.
 *
 * Serves safe same-origin preview graphics for image, link-media, relation thumbnail,
 * and card showcase states without depending on database media or external URLs.
 */
final class UiShowcaseAssets
{
	/**
	 * Render a pure vector sample graphic for `$variant`, or `null` when unknown.
	 */
	public static function renderSampleSvg(string $variant): ?string
	{
		$key = strtolower(trim($variant));

		return match ($key) {
			'landscape' => self::landscapeSvg(),
			'portrait' => self::portraitSvg(),
			'square' => self::squareSvg(),
			'wide' => self::wideSvg(),
			'avatar' => self::avatarSvg(),
			'video' => self::videoSvg(),
			default => null,
		};
	}

	private static function landscapeSvg(): string
	{
		return <<<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" role="img" aria-label="Coastal landscape sample">
	<defs>
		<linearGradient id="sky" x1="0%" y1="0%" x2="100%" y2="100%">
			<stop offset="0%" stop-color="#0f172a"/>
			<stop offset="48%" stop-color="#1d4ed8"/>
			<stop offset="100%" stop-color="#38bdf8"/>
		</linearGradient>
		<linearGradient id="sea" x1="0%" y1="0%" x2="100%" y2="0%">
			<stop offset="0%" stop-color="#0369a1"/>
			<stop offset="100%" stop-color="#0ea5e9"/>
		</linearGradient>
	</defs>
	<rect width="1600" height="900" fill="url(#sky)"/>
	<circle cx="1220" cy="240" r="110" fill="#fde68a" fill-opacity="0.9"/>
	<path d="M0 560 Q320 430 680 540 T1320 510 L1600 540 L1600 900 L0 900 Z" fill="#1e293b" fill-opacity="0.65"/>
	<path d="M0 620 Q400 560 820 620 T1600 600 L1600 900 L0 900 Z" fill="url(#sea)"/>
	<path d="M90 740 Q420 710 790 745 T1520 735" fill="none" stroke="#bae6fd" stroke-width="6" stroke-linecap="round" stroke-opacity="0.55"/>
</svg>
SVG;
	}

	private static function portraitSvg(): string
	{
		return <<<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200" width="900" height="1200" role="img" aria-label="Editorial portrait sample">
	<defs>
		<linearGradient id="portraitBg" x1="0%" y1="0%" x2="0%" y2="100%">
			<stop offset="0%" stop-color="#312e81"/>
			<stop offset="100%" stop-color="#be185d"/>
		</linearGradient>
	</defs>
	<rect width="900" height="1200" fill="url(#portraitBg)"/>
	<rect x="80" y="90" width="740" height="1020" rx="36" fill="#0f172a" fill-opacity="0.22" stroke="#ffffff" stroke-opacity="0.25" stroke-width="4"/>
	<circle cx="450" cy="430" r="145" fill="#fbcfe8" fill-opacity="0.88"/>
	<path d="M210 960 C210 730 690 730 690 960 Z" fill="#f8fafc" fill-opacity="0.82"/>
</svg>
SVG;
	}

	private static function squareSvg(): string
	{
		return <<<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="Architectural square sample">
	<defs>
		<linearGradient id="sqBg" x1="0%" y1="0%" x2="100%" y2="100%">
			<stop offset="0%" stop-color="#065f46"/>
			<stop offset="100%" stop-color="#10b981"/>
		</linearGradient>
	</defs>
	<rect width="800" height="800" fill="url(#sqBg)"/>
	<rect x="120" y="120" width="260" height="260" rx="28" fill="#ecfdf5" fill-opacity="0.9"/>
	<rect x="420" y="120" width="260" height="260" rx="130" fill="#a7f3d0" fill-opacity="0.55"/>
	<rect x="120" y="420" width="560" height="260" rx="28" fill="#064e3b" fill-opacity="0.72"/>
</svg>
SVG;
	}

	private static function wideSvg(): string
	{
		return <<<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 686" width="1600" height="686" role="img" aria-label="Panoramic banner sample">
	<defs>
		<linearGradient id="wideBg" x1="0%" y1="0%" x2="100%" y2="0%">
			<stop offset="0%" stop-color="#1e1b4b"/>
			<stop offset="50%" stop-color="#6d28d9"/>
			<stop offset="100%" stop-color="#ec4899"/>
		</linearGradient>
	</defs>
	<rect width="1600" height="686" fill="url(#wideBg)"/>
	<circle cx="320" cy="343" r="220" fill="#ffffff" fill-opacity="0.1"/>
	<circle cx="1280" cy="220" r="280" fill="#fdf2f8" fill-opacity="0.12"/>
	<path d="M0 540 C380 420 760 610 1160 470 C1340 410 1480 450 1600 490 L1600 686 L0 686 Z" fill="#0f172a" fill-opacity="0.4"/>
</svg>
SVG;
	}

	private static function avatarSvg(): string
	{
		return <<<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img" aria-label="Profile emblem sample">
	<defs>
		<linearGradient id="avBg" x1="0%" y1="0%" x2="100%" y2="100%">
			<stop offset="0%" stop-color="#2563eb"/>
			<stop offset="100%" stop-color="#7c3aed"/>
		</linearGradient>
	</defs>
	<rect width="400" height="400" fill="url(#avBg)"/>
	<circle cx="200" cy="154" r="64" fill="#ffffff" fill-opacity="0.92"/>
	<path d="M88 352 C88 268 312 268 312 352 Z" fill="#ffffff" fill-opacity="0.82"/>
</svg>
SVG;
	}

	private static function videoSvg(): string
	{
		return <<<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720" role="img" aria-label="Video poster sample">
	<defs>
		<linearGradient id="vidBg" x1="0%" y1="0%" x2="100%" y2="100%">
			<stop offset="0%" stop-color="#09090b"/>
			<stop offset="60%" stop-color="#1e293b"/>
			<stop offset="100%" stop-color="#0f766e"/>
		</linearGradient>
	</defs>
	<rect width="1280" height="720" fill="url(#vidBg)"/>
	<circle cx="640" cy="360" r="96" fill="#ffffff" fill-opacity="0.16" stroke="#ffffff" stroke-opacity="0.5" stroke-width="5"/>
	<polygon points="612,312 698,360 612,408" fill="#ffffff" fill-opacity="0.95"/>
</svg>
SVG;
	}
}
