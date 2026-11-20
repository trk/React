<?php

declare(strict_types=1);

namespace Totoglu\React\Support;

/**
 * Canonical React island mount markup shared by every Inputfield, viewport, tab container, and standalone island.
 */
final class IslandMarkup
{
	public const int JSON_FLAGS = JSON_UNESCAPED_UNICODE
		| JSON_UNESCAPED_SLASHES
		| JSON_HEX_TAG
		| JSON_HEX_AMP
		| JSON_INVALID_UTF8_SUBSTITUTE;

	/**
	 * Render a `<div data-inertia-island="..." data-props="...">` mount node.
	 *
	 * @param array<string, mixed> $props Island props serialized into `data-props`
	 * @param array<string, string|true|null> $attributes Extra attributes rendered before `data-props` (`true` renders a bare attribute, `null` is skipped)
	 * @param string $innerHtml Trusted, pre-escaped fallback markup rendered inside the mount node
	 */
	public static function render(string $component, array $props, array $attributes = [], string $innerHtml = ''): string
	{
		$safeComponent = self::encodeAttribute($component);
		$html = '<div';
		$classAttr = $attributes['class'] ?? null;
		if (is_string($classAttr) && $classAttr !== '') {
			$html .= ' class="' . self::encodeAttribute($classAttr) . '"';
		}
		$html .= ' data-inertia-island="' . $safeComponent . '" data-react-island="' . $safeComponent . '"';

		foreach ($attributes as $name => $value) {
			if ($name === 'class' || $value === null || preg_match('/^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/', $name) !== 1) {
				continue;
			}
			$html .= $value === true ? ' ' . $name : ' ' . $name . '="' . self::encodeAttribute($value) . '"';
		}

		$json = json_encode($props, self::JSON_FLAGS);

		return $html . ' data-props="' . self::encodeAttribute(is_string($json) ? $json : '{}') . '">' . $innerHtml . '</div>';
	}

	/**
	 * Encode a value for safe inclusion inside a double-quoted HTML attribute.
	 */
	public static function encodeAttribute(string $value): string
	{
		return htmlspecialchars(str_replace("\0", '', $value), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
	}
}
