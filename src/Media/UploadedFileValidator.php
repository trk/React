<?php

declare(strict_types=1);

namespace Totoglu\React\Media;

use ProcessWire\Wire;

/**
 * Shared server-side content validator for uploaded files, raster images, and SVGs.
 *
 * Consolidates `finfo_file` MIME inspection, raster decompression-bomb dimension checks,
 * and `DOMDocument`-based SVG sanitization across `MediaGateway` and `TiptapMediaLinkGateway`.
 */
final class UploadedFileValidator extends Wire
{
	public const int MAX_SVG_BYTES = 8_388_608;

	/**
	 * Executable or HTML MIME types unconditionally rejected regardless of file extension.
	 *
	 * @var list<string>
	 */
	private const array BLOCKED_MIMES = [
		'text/html',
		'application/xhtml+xml',
		'text/x-php',
		'application/x-php',
		'application/x-httpd-php',
		'text/javascript',
		'application/javascript',
		'application/x-sh',
		'text/x-shellscript',
		'application/x-executable',
		'application/x-dosexec',
		'application/x-msdownload',
	];

	/**
	 * File extensions treated as raster images for `getimagesize()` and pixel budget enforcement.
	 *
	 * @var list<string>
	 */
	private const array RASTER_EXTENSIONS = [
		'jpg',
		'jpeg',
		'png',
		'gif',
		'webp',
		'avif',
		'bmp',
		'tif',
		'tiff',
	];

	/**
	 * SVG element `localName` values blocked unconditionally to eliminate script/HTML/CSS execution.
	 *
	 * @var array<string, true>
	 */
	private const array BLOCKED_SVG_ELEMENTS = [
		'script' => true,
		'foreignobject' => true,
		'iframe' => true,
		'embed' => true,
		'object' => true,
		'applet' => true,
		'meta' => true,
		'base' => true,
		'link' => true,
		'handler' => true,
		'style' => true,
	];

	/**
	 * Validate an uploaded file on disk and return an error message string, or `null` when valid.
	 */
	public function validate(string $fullPath, string $ext, bool $isImage, bool $allowSvg = true): ?string
	{
		$basename = basename($fullPath);
		if ($fullPath === '' || is_link($fullPath) || !is_file($fullPath)) {
			return sprintf($this->_('File "%s" failed content security validation.'), $basename);
		}

		$detectedMime = $this->detectMimeType($fullPath);
		if ($detectedMime !== '' && in_array($detectedMime, self::BLOCKED_MIMES, true)) {
			return sprintf($this->_('File "%s" failed content security validation.'), $basename);
		}

		$lowerExt = strtolower(trim($ext));
		if ($lowerExt === 'svg' || $detectedMime === 'image/svg+xml') {
			if (!$allowSvg) {
				return sprintf($this->_('File "%s" failed content security validation.'), $basename);
			}

			return $this->validateSvgFile($fullPath, $basename);
		}

		$isRasterCandidate = $isImage || in_array($lowerExt, self::RASTER_EXTENSIONS, true);
		if ($isRasterCandidate) {
			if (
				$detectedMime !== ''
				&& !str_starts_with($detectedMime, 'image/')
				&& $detectedMime !== 'application/octet-stream'
			) {
				return $this->_('Uploaded file is not a valid raster image.');
			}

			$dims = @getimagesize($fullPath);
			if (!is_array($dims) || (int) $dims[0] <= 0 || (int) $dims[1] <= 0) {
				return $this->_('Invalid image dimensions.');
			}

			$w = (int) $dims[0];
			$h = (int) $dims[1];
			if (
				$w > MediaGateway::MAX_RASTER_AXIS
				|| $h > MediaGateway::MAX_RASTER_AXIS
				|| ($w * $h) > MediaGateway::MAX_RASTER_PIXELS
			) {
				return $this->_('Image resolution exceeds maximum safe pixel limit.');
			}
		}

		return null;
	}

	/**
	 * Parse an SVG payload via `DOMDocument` (`LIBXML_NONET`) and reject DOCTYPE/ENTITY/PI nodes,
	 * active elements, event attributes, animated `on*`/`href` targets, and non-fragment URIs.
	 */
	public function validateSvgFile(string $fullPath, string $basename = ''): ?string
	{
		$resolvedName = $basename !== '' ? $basename : basename($fullPath);
		$size = (int) @filesize($fullPath);
		if ($size <= 0 || $size > self::MAX_SVG_BYTES) {
			return sprintf($this->_('File "%s" failed content security validation.'), $resolvedName);
		}

		$raw = @file_get_contents($fullPath);
		if (!is_string($raw) || $raw === '' || str_contains($raw, "\0")) {
			return sprintf($this->_('File "%s" failed content security validation.'), $resolvedName);
		}

		if (
			str_starts_with($raw, "\xFE\xFF")
			|| str_starts_with($raw, "\xFF\xFE")
			|| preg_match('/<!(?:DOCTYPE|ENTITY)\b/i', $raw) === 1
			|| preg_match('/<\?(?!xml(?:\s|$))/i', $raw) === 1
		) {
			return sprintf($this->_('File "%s" failed content security validation.'), $resolvedName);
		}

		$prevErrors = libxml_use_internal_errors(true);
		try {
			$dom = new \DOMDocument();
			$loaded = $dom->loadXML($raw, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
			if (!$loaded || $dom->doctype !== null) {
				return sprintf($this->_('File "%s" failed content security validation.'), $resolvedName);
			}

			$root = $dom->documentElement;
			if (!$root instanceof \DOMElement || strtolower((string) $root->localName) !== 'svg') {
				return sprintf($this->_('File "%s" failed content security validation.'), $resolvedName);
			}

			foreach ($dom->childNodes as $topNode) {
				if (!$this->isSafeSvgSubtree($topNode)) {
					return sprintf($this->_('File "%s" failed content security validation.'), $resolvedName);
				}
			}

			return null;
		} finally {
			libxml_clear_errors();
			libxml_use_internal_errors($prevErrors);
		}
	}

	private function detectMimeType(string $fullPath): string
	{
		if (!function_exists('finfo_open')) {
			return '';
		}
		$finfo = @finfo_open(FILEINFO_MIME_TYPE);
		if ($finfo === false) {
			return '';
		}
		$mime = @finfo_file($finfo, $fullPath);

		return is_string($mime) ? strtolower(trim($mime)) : '';
	}

	private function isSafeSvgSubtree(\DOMNode $node): bool
	{
		if (
			$node instanceof \DOMDocumentType
			|| $node instanceof \DOMEntity
			|| $node instanceof \DOMEntityReference
			|| $node instanceof \DOMProcessingInstruction
		) {
			return false;
		}

		if ($node instanceof \DOMElement) {
			$localName = strtolower((string) $node->localName);
			if (isset(self::BLOCKED_SVG_ELEMENTS[$localName])) {
				return false;
			}

			foreach ($node->attributes as $attr) {
				if (!$attr instanceof \DOMAttr) {
					continue;
				}
				if (!$this->isSafeSvgAttribute($attr)) {
					return false;
				}
			}
		}

		if ($node->hasChildNodes()) {
			foreach ($node->childNodes as $child) {
				if (!$this->isSafeSvgSubtree($child)) {
					return false;
				}
			}
		}

		return true;
	}

	private function isSafeSvgAttribute(\DOMAttr $attr): bool
	{
		$localName = strtolower((string) $attr->localName);
		$fullName = strtolower((string) $attr->nodeName);
		$value = (string) $attr->nodeValue;

		if (str_starts_with($localName, 'on')) {
			return false;
		}

		$normalizedCompact = strtolower((string) preg_replace('/[\x00-\x20\x7F]+/', '', $value));

		if ($localName === 'attributename') {
			if (
				str_starts_with($normalizedCompact, 'on')
				|| $normalizedCompact === 'href'
				|| $normalizedCompact === 'xlink:href'
				|| str_ends_with($normalizedCompact, ':href')
			) {
				return false;
			}
		}

		if ($localName === 'href' || $fullName === 'xlink:href' || str_ends_with($fullName, ':href')) {
			if ($normalizedCompact !== '' && !str_starts_with($normalizedCompact, '#')) {
				return false;
			}
		}

		if ($localName === 'style') {
			if (
				preg_match('/expression\s*\(|(?:javascript|vbscript)\s*:|data\s*:\s*(?:text\/html|application\/xhtml|image\/svg\+xml)/i', $normalizedCompact) === 1
				|| preg_match('/url\s*\((?!\s*[\'"]?\s*#)/i', $normalizedCompact) === 1
			) {
				return false;
			}
		}

		if (
			preg_match('/(?:javascript|vbscript)\s*:|data\s*:\s*(?:text\/html|application\/xhtml|image\/svg\+xml)/i', $normalizedCompact) === 1
		) {
			return false;
		}

		return true;
	}
}
