<?php

declare(strict_types=1);

namespace Totoglu\React\Security;

use ProcessWire\ProcessWire;

/**
 * Strict URL protocol allowlist sanitizer for server-serialized navigation, action, and asset links.
 */
final class UrlSanitizer
{
	/**
	 * Allow only `/`, `#`, `./`, `../`, `http://`, `https://`, `mailto:`, and `tel:` URLs
	 * (plus `?` query strings and bare relative paths when `$allowBareRelative` is true).
	 * Rejects protocol-relative (`//`), control-character-obfuscated, `javascript:`, `data:`, and `vbscript:` URLs.
	 */
	public static function sanitizeHref(string $url, bool $allowBareRelative = false): string
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
			|| ($allowBareRelative && str_starts_with($trimmed, '?'))
		) {
			return $trimmed;
		}

		if (preg_match('/^https?:\/\//i', $trimmed) === 1) {
			if (preg_match('/^https?:\/\/[^\/\\\\]/i', $trimmed) !== 1) {
				return '';
			}
			$host = parse_url($trimmed, PHP_URL_HOST);
			if (!is_string($host) || trim($host) === '') {
				return '';
			}

			return $trimmed;
		}

		if (preg_match('/^(?:mailto:|tel:)/i', $trimmed) === 1) {
			return $trimmed;
		}

		if ($allowBareRelative && preg_match('/^[a-zA-Z][a-zA-Z0-9+.-]*:/', $trimmed) !== 1) {
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
				$entityDecoded = html_entity_decode($decoded, ENT_QUOTES | ENT_HTML5, 'UTF-8');
				if (
					preg_match('/[\x00-\x1F\x7F]/', $decoded) !== 1
					&& preg_match('/[\x00-\x1F\x7F]/', $entityDecoded) !== 1
					&& stripos($decoded, '<svg') !== false
					&& !preg_match('/&#[xX]?[0-9a-fA-F]+;?/', $decoded)
					&& preg_match('/<\s*(?:[a-z0-9_-]+:)?(?:script|foreignobject|iframe|object|embed|use|handler|style|animate|set|animatetransform|animatemotion|meta|base|link|feimage|tref)\b|\bon[a-z0-9_]+\s*=|(?:javascript|vbscript):/i', $entityDecoded) !== 1
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

	/**
	 * Restrict a URL to safe site-relative paths (`/`, `./`, `../`) or same-origin HTTP(S) URLs.
	 * Rejects `javascript:`, `data:`, `mailto:`, `tel:`, `#` fragments, protocol-relative (`//`) URLs,
	 * userinfo credentials, and external hosts.
	 */
	public static function sanitizeSameOriginUrl(string $url, string $currentHost = '', ?bool $isHttps = null): string
	{
		$safe = self::sanitizeHref($url);
		if ($safe === '' || str_starts_with($safe, '#') || preg_match('/^(?:mailto:|tel:)/i', $safe) === 1) {
			return '';
		}

		if (str_starts_with($safe, '/') || str_starts_with($safe, './') || str_starts_with($safe, '../')) {
			return $safe;
		}

		$parts = parse_url($safe);
		if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
			return '';
		}
		if (isset($parts['user']) || isset($parts['pass'])) {
			return '';
		}

		$scheme = strtolower((string) $parts['scheme']);
		if ($scheme !== 'http' && $scheme !== 'https') {
			return '';
		}

		$resolvedHost = strtolower(trim($currentHost));
		$resolvedHttps = $isHttps;
		if ($resolvedHost === '') {
			$pw = ProcessWire::getCurrentInstance();
			if ($pw instanceof ProcessWire) {
				$config = $pw->wire()->config;
				$resolvedHost = strtolower(trim((string) ($config->httpHost ?: '')));
				if ($resolvedHttps === null) {
					$resolvedHttps = (bool) $config->https;
				}
			}
		}

		if ($resolvedHost === '') {
			return '';
		}

		$targetHost = strtolower((string) $parts['host']) . (isset($parts['port']) ? ':' . (int) $parts['port'] : '');
		if ($targetHost !== $resolvedHost) {
			return '';
		}

		if ($resolvedHttps === true && $scheme !== 'https') {
			return '';
		}

		return $safe;
	}
}
