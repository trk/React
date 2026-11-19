<?php

declare(strict_types=1);

namespace Totoglu\React\Security;

/**
 * Strict URL protocol allowlist sanitizer for server-serialized navigation, action, and asset links.
 */
final class UrlSanitizer
{
	/**
	 * Allow only `/`, `#`, `./`, `../`, `http://`, `https://`, `mailto:`, and `tel:` URLs.
	 * Rejects protocol-relative (`//`), control-character-obfuscated, `javascript:`, `data:`, and `vbscript:` URLs.
	 */
	public static function sanitizeHref(string $url): string
	{
		$trimmed = trim($url);
		if ($trimmed === '') {
			return '';
		}

		if (preg_match('/[\x00-\x20\x7F]/', $trimmed) === 1) {
			return '';
		}

		if (
			str_starts_with($trimmed, '//')
			|| str_starts_with($trimmed, '/\\')
			|| str_starts_with($trimmed, '\\')
		) {
			return '';
		}

		if (
			str_starts_with($trimmed, '/')
			|| str_starts_with($trimmed, '#')
			|| str_starts_with($trimmed, './')
			|| str_starts_with($trimmed, '../')
		) {
			return $trimmed;
		}

		if (preg_match('/^(?:https?:\/\/[^\/\\\\]|mailto:|tel:)/i', $trimmed) === 1) {
			return $trimmed;
		}

		return '';
	}

	/**
	 * Sanitize an `<img src>` URL: accepts safe HTTP(S) / relative paths plus inert raster `data:image/*;base64`
	 * and script-free `data:image/svg+xml;utf8,` wireframe URIs while blocking `javascript:`, `mailto:`, `tel:`, and active SVG payloads.
	 */
	public static function sanitizeImageSrc(string $url): string
	{
		$trimmed = trim($url);
		if ($trimmed === '' || preg_match('/[\x00-\x1F\x7F]/', $trimmed) === 1) {
			return '';
		}

		if (stripos($trimmed, 'data:image/') === 0) {
			if (preg_match('/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+\/=]+$/i', $trimmed) === 1) {
				return $trimmed;
			}
			if (preg_match('/^data:image\/svg\+xml;(?:utf8|charset=utf-8),(.+)$/i', $trimmed, $m) === 1) {
				$decoded = rawurldecode($m[1]);
				if (
					stripos($decoded, '<svg') !== false
					&& preg_match('/<\s*(?:script|foreignobject|iframe|object|embed|use)\b|\bon[a-z]+\s*=|(?:javascript|vbscript):/i', $decoded) !== 1
				) {
					return $trimmed;
				}
			}

			return '';
		}

		$safe = self::sanitizeHref($trimmed);
		if ($safe === '' || str_starts_with($safe, '#') || preg_match('/^(?:mailto:|tel:)/i', $safe) === 1) {
			return '';
		}

		return $safe;
	}
}
