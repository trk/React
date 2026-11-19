<?php

declare(strict_types=1);

namespace Totoglu\React\Icon;

use ProcessWire\WireData;

/**
 * ReactIconValue
 *
 * Formatted `WireData` value object returned by `InputfieldReactIcon` / `IconManager::resolveValue()`,
 * exposing vector icon properties (`set`, `name`, `raw`, `svg`) along with
 * optional customization properties (`variant`, `size`, `color`, `strokeWidth`, `background`, `radius`, `html`).
 *
 * @property string $set Icon catalog identifier (`'vector'` or `''`)
 * @property string $name Canonical icon name (e.g. `'sparkles'`, `'brand-whatsapp'`)
 * @property string $variant Icon style variant (`'outline'` or `'filled'`)
 * @property string $raw Raw persisted database value (scalar name or JSON string)
 * @property string $svg Sanitized inline `<svg>` markup
 * @property string $html Inline `<svg>` or styled `<span class="rw-icon-badge">...</span>` markup
 * @property int $size Icon pixel size (`12`..`96`, default `24`)
 * @property string $color Sanitized stroke/fill color (`''` for `currentColor`, `#hex`, or `var(--*)`)
 * @property float $strokeWidth Stroke width (`1.0`..`3.0`, default `2.0`)
 * @property string $background Sanitized badge background color (`''` when unframed)
 * @property string $radius Badge corner radius token (`'none'|'sm'|'md'|'lg'|'full'`)
 * @property bool $customized Whether non-default customization attributes are active
 */
class ReactIconValue extends WireData implements \Stringable, \JsonSerializable
{
	/**
	 * @param array{
	 *   set?: string,
	 *   name?: string,
	 *   variant?: string,
	 *   raw?: string,
	 *   svg?: string,
	 *   html?: string,
	 *   size?: int,
	 *   color?: string,
	 *   strokeWidth?: float,
	 *   background?: string,
	 *   radius?: string,
	 *   customized?: bool
	 * } $data
	 */
	public function __construct(array $data = [])
	{
		parent::__construct();
		$name = isset($data['name']) ? trim((string) $data['name']) : '';
		$variant = isset($data['variant']) && strtolower(trim((string) $data['variant'])) === 'filled'
			? 'filled'
			: 'outline';
		$this->set('set', $name !== '' ? (string) ($data['set'] ?? 'vector') : '');
		$this->set('name', $name);
		$this->set('variant', $variant);
		$this->set('raw', isset($data['raw']) ? (string) $data['raw'] : $name);
		$this->set('svg', isset($data['svg']) ? (string) $data['svg'] : '');
		$this->set('html', isset($data['html']) ? (string) $data['html'] : (isset($data['svg']) ? (string) $data['svg'] : ''));
		$this->set('size', isset($data['size']) ? (int) $data['size'] : 24);
		$this->set('color', isset($data['color']) ? (string) $data['color'] : '');
		$this->set('strokeWidth', isset($data['strokeWidth']) ? (float) $data['strokeWidth'] : 2.0);
		$this->set('background', isset($data['background']) ? (string) $data['background'] : '');
		$this->set('radius', isset($data['radius']) ? (string) $data['radius'] : 'md');
		$this->set('customized', !empty($data['customized']));
	}

	public function isEmpty(): bool
	{
		return trim((string) $this->get('name')) === '';
	}

	/**
	 * @return array{
	 *   set: string,
	 *   name: string,
	 *   variant: string,
	 *   raw: string,
	 *   svg: string,
	 *   html: string,
	 *   size: int,
	 *   color: string,
	 *   strokeWidth: float,
	 *   background: string,
	 *   radius: string,
	 *   customized: bool
	 * }
	 */
	public function toArray(): array
	{
		return [
			'set' => (string) $this->get('set'),
			'name' => (string) $this->get('name'),
			'variant' => (string) $this->get('variant'),
			'raw' => (string) $this->get('raw'),
			'svg' => (string) $this->get('svg'),
			'html' => (string) $this->get('html'),
			'size' => (int) $this->get('size'),
			'color' => (string) $this->get('color'),
			'strokeWidth' => (float) $this->get('strokeWidth'),
			'background' => (string) $this->get('background'),
			'radius' => (string) $this->get('radius'),
			'customized' => (bool) $this->get('customized'),
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	public function jsonSerialize(): array
	{
		return $this->toArray();
	}

	public function __toString(): string
	{
		return (string) $this->get('html');
	}
}
