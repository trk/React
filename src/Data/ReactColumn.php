<?php

declare(strict_types=1);

namespace Totoglu\React\Data;

/**
 * Immutable fluent column definition for `MarkupReactViewport`, `MarkupReactTable`, `MarkupReactCards`,
 * `ArrayDataProvider`, `PagesDataProvider`, and downstream viewport column configurations.
 */
final readonly class ReactColumn
{
	/** @var list<string> */
	private const array VISUAL_TYPES = ['icon', 'image', 'media'];

	/**
	 * @param array<string, mixed> $schema
	 */
	private function __construct(
		private string $key,
		private string $label = '',
		private array $schema = ['type' => 'text'],
	) {
	}

	public static function text(string $key, string $label = ''): self
	{
		return new self(trim($key), $label, ['type' => 'text']);
	}

	public static function icon(string $key = 'icon', string $label = ''): self
	{
		return new self(trim($key), $label, [
			'type' => 'icon',
			'sortable' => false,
			'align' => 'center',
			'width' => '3.25rem',
			'showLabel' => false,
		]);
	}

	public static function image(string $key = 'image', string $label = ''): self
	{
		return new self(trim($key), $label, [
			'type' => 'image',
			'sortable' => false,
			'align' => 'center',
			'width' => '3.75rem',
			'showLabel' => false,
			'shape' => 'rounded',
		]);
	}

	public static function badge(string $key, string $label = ''): self
	{
		return new self(trim($key), $label, ['type' => 'badge']);
	}

	public static function boolean(string $key, string $label = ''): self
	{
		return new self(trim($key), $label, ['type' => 'boolean']);
	}

	public static function code(string $key, string $label = ''): self
	{
		return new self(trim($key), $label, ['type' => 'code', 'mono' => true]);
	}

	public static function link(string $key, string $label = ''): self
	{
		return new self(trim($key), $label, ['type' => 'link']);
	}

	public static function number(string $key, string $label = ''): self
	{
		return new self(trim($key), $label, [
			'type' => 'text',
			'tabular' => true,
			'nowrap' => true,
			'align' => 'right',
		]);
	}

	public static function date(string $key, string $label = ''): self
	{
		return new self(trim($key), $label, [
			'type' => 'text',
			'tabular' => true,
			'nowrap' => true,
		]);
	}

	public function key(): string
	{
		return $this->key;
	}

	public function getLabel(): string
	{
		return $this->label;
	}

	public function resolvedLabel(): string
	{
		return $this->label !== '' ? $this->label : self::humanizeKey($this->key);
	}

	public function label(string $label): self
	{
		return new self($this->key, $label, $this->schema);
	}

	public function primary(bool $primary = true): self
	{
		return $this->withSchema(['primary' => $primary]);
	}

	public function sortable(bool $sortable = true): self
	{
		return $this->withSchema(['sortable' => $sortable]);
	}

	public function align(string $align): self
	{
		$clean = strtolower(trim($align));
		if (!in_array($clean, ['left', 'center', 'right'], true)) {
			$clean = 'left';
		}

		return $this->withSchema(['align' => $clean]);
	}

	public function valign(string $valign): self
	{
		$clean = strtolower(trim($valign));
		if (!in_array($clean, ['top', 'middle', 'bottom'], true)) {
			$clean = 'middle';
		}

		return $this->withSchema(['valign' => $clean]);
	}

	public function width(string $width): self
	{
		return $this->withSchema(['width' => trim($width)]);
	}

	public function showLabel(bool $show = true): self
	{
		$overrides = ['showLabel' => $show];
		if ($show && ($this->schema['width'] ?? '') !== '' && self::isVisualType((string) ($this->schema['type'] ?? ''))) {
			$overrides['width'] = null;
			$overrides['align'] = 'left';
		}

		$next = array_replace($this->schema, $overrides);
		if (($next['width'] ?? null) === null) {
			unset($next['width']);
		}

		return new self($this->key, $this->label, $next);
	}

	public function shape(string $shape): self
	{
		$clean = strtolower(trim($shape));
		if (!in_array($clean, ['rounded', 'circle', 'video'], true)) {
			$clean = 'rounded';
		}

		return $this->withSchema(['shape' => $clean]);
	}

	public function mono(bool $mono = true): self
	{
		return $this->withSchema(['mono' => $mono]);
	}

	public function tabular(bool $tabular = true): self
	{
		return $this->withSchema(['tabular' => $tabular]);
	}

	public function nowrap(bool $nowrap = true): self
	{
		return $this->withSchema(['nowrap' => $nowrap]);
	}

	public function truncate(bool|int $truncate = true): self
	{
		return $this->withSchema(['truncate' => is_int($truncate) ? max(1, $truncate) : $truncate]);
	}

	public function copyable(bool $copyable = true): self
	{
		return $this->withSchema(['copyable' => $copyable]);
	}

	public function editable(bool $editable = true): self
	{
		return $this->withSchema(['editable' => $editable]);
	}

	/**
	 * @param array<string, string> $options
	 */
	public function options(array $options): self
	{
		return $this->withSchema(['options' => $options]);
	}

	/**
	 * @param array<string, string> $variants
	 */
	public function badgeVariants(array $variants): self
	{
		return $this->withSchema(['badgeVariants' => $variants]);
	}

	public function maxBadges(int $max): self
	{
		return $this->withSchema(['maxBadges' => max(1, $max)]);
	}

	/**
	 * Export schema attributes plus resolved `'label'` for `ViewportColumn`.
	 *
	 * @return array<string, mixed>
	 */
	public function toArray(): array
	{
		return array_replace($this->schema, [
			'label' => $this->resolvedLabel(),
		]);
	}

	/**
	 * Export raw schema options without injecting a synthetic humanized label.
	 *
	 * @return array<string, mixed>
	 */
	public function toOptionsArray(): array
	{
		$out = $this->schema;
		if ($this->label !== '') {
			$out['label'] = $this->label;
		}

		return $out;
	}

	public static function isVisualType(string $type): bool
	{
		return in_array(strtolower(trim($type)), self::VISUAL_TYPES, true);
	}

	public static function humanizeKey(string $key): string
	{
		return ucfirst(str_replace('_', ' ', $key));
	}

	/**
	 * Normalize arbitrary `columns` declarations into canonical `'key' => columnDef` maps.
	 *
	 * @param array<int|string, mixed> $rawColumns
	 * @return array<string, array<string, mixed>>
	 */
	public static function normalizeMap(array $rawColumns): array
	{
		$normalized = [];
		foreach ($rawColumns as $k => $v) {
			if ($v instanceof self) {
				$colKey = $v->key();
				if ($colKey !== '') {
					$schema = $v->toArray();
					$type = (string) ($schema['type'] ?? 'text');
					$normalized[$colKey] = array_replace([
						'sortable' => !self::isVisualType($type),
					], $schema);
				}
				continue;
			}

			if (is_int($k) && is_string($v)) {
				$colKey = trim($v);
				if ($colKey !== '') {
					$normalized[$colKey] = [
						'label' => self::humanizeKey($colKey),
						'sortable' => true,
					];
				}
				continue;
			}

			if (is_int($k) && is_array($v)) {
				$colKey = trim((string) ($v['key'] ?? $v['name'] ?? ''));
				if ($colKey !== '') {
					$type = isset($v['type']) && is_string($v['type']) ? $v['type'] : '';
					$label = array_key_exists('label', $v)
						? (string) $v['label']
						: self::humanizeKey($colKey);
					$normalized[$colKey] = array_replace([
						'label' => $label,
						'sortable' => !self::isVisualType($type),
					], $v);
				}
				continue;
			}

			$colKey = trim((string) $k);
			if ($colKey === '') {
				continue;
			}

			if (is_string($v)) {
				$normalized[$colKey] = [
					'label' => $v,
					'sortable' => true,
				];
			} elseif (is_array($v)) {
				$type = isset($v['type']) && is_string($v['type']) ? $v['type'] : '';
				$label = array_key_exists('label', $v)
					? (string) $v['label']
					: self::humanizeKey($colKey);
				$normalized[$colKey] = array_replace([
					'label' => $label,
					'sortable' => !self::isVisualType($type),
				], $v);
			}
		}

		return $normalized;
	}

	/**
	 * Split provider `columns` option into `['columns' => [key => label], 'schemas' => [key => schema]]`.
	 *
	 * @param array<int|string, mixed> $rawColumns
	 * @return array{columns: array<string, string>, schemas: array<string, array<string, mixed>>}
	 */
	public static function splitColumnsAndSchemas(array $rawColumns): array
	{
		$columns = [];
		$schemas = [];

		foreach ($rawColumns as $k => $v) {
			if ($v instanceof self) {
				$colKey = $v->key();
				if ($colKey !== '') {
					$columns[$colKey] = $v->resolvedLabel();
					$schemas[$colKey] = $v->toArray();
				}
				continue;
			}

			if (is_int($k)) {
				if (is_string($v)) {
					$colKey = trim($v);
					if ($colKey !== '') {
						$columns[$colKey] = self::humanizeKey($colKey);
					}
				} elseif (is_array($v)) {
					$colKey = trim((string) ($v['key'] ?? $v['name'] ?? ''));
					if ($colKey !== '') {
						$label = array_key_exists('label', $v)
							? (string) $v['label']
							: self::humanizeKey($colKey);
						$columns[$colKey] = $label;
						$schemas[$colKey] = array_replace($v, ['label' => $label]);
					}
				}
				continue;
			}

			$colKey = trim((string) $k);
			if ($colKey === '') {
				continue;
			}

			if (is_array($v)) {
				$label = array_key_exists('label', $v)
					? (string) $v['label']
					: self::humanizeKey($colKey);
				$columns[$colKey] = $label;
				$schemas[$colKey] = array_replace($v, ['label' => $label]);
			} else {
				$columns[$colKey] = (string) $v;
			}
		}

		return [
			'columns' => $columns,
			'schemas' => $schemas,
		];
	}

	/**
	 * @param array<string, mixed> $overrides
	 */
	private function withSchema(array $overrides): self
	{
		return new self($this->key, $this->label, array_replace($this->schema, $overrides));
	}
}
