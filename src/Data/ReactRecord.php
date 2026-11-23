<?php

declare(strict_types=1);

namespace Totoglu\React\Data;

use function ProcessWire\__;

/**
 * Immutable normalized record value object returned by any `ReactDataProviderInterface` adapter.
 *
 * Bridges `EntryItem`, `Page`, and associative array rows behind a uniform interface for
 * `MarkupReactTable`, `MarkupReactCards`, and custom `MarkupReactViewport` viewports.
 */
final readonly class ReactRecord
{
	public const STATUS_PUBLISHED = 1;
	public const STATUS_UNPUBLISHED = 2;
	public const STATUS_DRAFT = 2;
	public const STATUS_HIDDEN = 4;
	public const STATUS_TRASH = 8;
	public const STATUS_LOCKED = 16;

	/**
	 * @param string $id Unique record identifier (UUID, Page ID, or string key)
	 * @param string $title Primary human-readable title/label
	 * @param string $name Secondary slug/handle/identifier
	 * @param int $status Bitwise status mask (`1` = published, `2` = draft/unpublished, `4` = hidden, `8` = trash, `16` = locked)
	 * @param string $statusVariant Semantic status variant (`success`, `warning`, `danger`, `primary`, `muted`)
	 * @param string $statusLabel Localized status label (`Published`, `Draft`, `Trash`, etc.)
	 * @param array<string, scalar|array<int|string, mixed>|null> $values Raw field values keyed by column name
	 * @param array<string, string> $formatted Pre-formatted display strings or safe HTML keyed by column name
	 * @param string $editUrl Direct edit URL for this record
	 * @param string $viewUrl Direct view URL for this record
	 * @param int $depth Hierarchy depth (`0` for root, `1+` for child)
	 * @param int $sort Sort order index
	 * @param int $created Unix timestamp of creation
	 * @param int $modified Unix timestamp of last modification
	 * @param bool $hasDraft Whether an unpublished working draft exists
	 * @param object|array<string, mixed>|null $raw Underlying domain entity (`EntryItem`, `Page`, or `array`)
	 * @param string $subtitle Optional pre-resolved subtitle for Cards and custom viewports
	 * @param string $thumbHtml Optional sanitized thumbnail HTML (`<img>` or `<svg>`) for Table, Cards, and custom viewports
	 * @param bool $formattedIsHtml When true, all `$formatted[$col]` values are pre-sanitized HTML
	 * @param list<string>|array<string, bool> $htmlColumns Column keys whose formatted values contain safe HTML
	 * @param string $parentId Parent record ID for hierarchical child grouping
	 * @param array<string, bool> $isEditableField Per-column inline-edit eligibility (`colKey => bool`)
	 * @param string|array<string, mixed> $icon Optional leading icon identifier or `ReactIconValue` payload for viewports
	 * @param array{src: string, darkSrc?: string, alt?: string, count?: int, aspect?: string}|null $thumb Optional sanitized thumbnail descriptor for viewports
	 * @param list<array{label: string, variant?: string, dot?: bool}> $badges Optional record-level status/metadata badges
	 * @param array<string, array<string, mixed>> $cells Optional structured cell payloads keyed by column name
	 * @param array<string, mixed> $meta Optional extension metadata bag for pluggable viewport modes
	 */
	public function __construct(
		public string $id,
		public string $title,
		public string $name = '',
		public int $status = self::STATUS_PUBLISHED,
		public string $statusVariant = 'success',
		public string $statusLabel = 'Published',
		public array $values = [],
		public array $formatted = [],
		public string $editUrl = '',
		public string $viewUrl = '',
		public int $depth = 0,
		public int $sort = 0,
		public int $created = 0,
		public int $modified = 0,
		public bool $hasDraft = false,
		public object|array|null $raw = null,
		public string $subtitle = '',
		public string $thumbHtml = '',
		public bool $formattedIsHtml = false,
		public array $htmlColumns = [],
		public string $parentId = '',
		public array $isEditableField = [],
		public string|array $icon = '',
		public ?array $thumb = null,
		public array $badges = [],
		public array $cells = [],
		public array $meta = [],
	) {
	}

	public function isPublished(): bool
	{
		return !$this->isTrash() && !$this->isDraft();
	}

	public function isTrash(): bool
	{
		return ($this->status & self::STATUS_TRASH) === self::STATUS_TRASH || $this->statusVariant === 'danger';
	}

	public function isDraft(): bool
	{
		return ($this->status & self::STATUS_DRAFT) === self::STATUS_DRAFT;
	}

	public function isHidden(): bool
	{
		return ($this->status & self::STATUS_HIDDEN) === self::STATUS_HIDDEN;
	}

	public function isLocked(): bool
	{
		return ($this->status & self::STATUS_LOCKED) === self::STATUS_LOCKED;
	}

	public function getValue(string $column, mixed $default = ''): mixed
	{
		return match ($column) {
			'id' => $this->id,
			'title', 'label' => $this->title,
			'name' => $this->name,
			'status' => $this->statusLabel,
			'created' => $this->created > 0 ? date('Y-m-d H:i', $this->created) : '',
			'modified' => $this->modified > 0 ? date('Y-m-d H:i', $this->modified) : '',
			'sort' => $this->sort,
			default => $this->values[$column] ?? $default,
		};
	}

	public function getDisplayValue(string $column): string
	{
		if (isset($this->cells[$column]) && is_array($this->cells[$column])) {
			$cellLabel = $this->cells[$column]['label'] ?? $this->cells[$column]['title'] ?? null;
			if (is_scalar($cellLabel)) {
				return (string) $cellLabel;
			}
		}

		if (array_key_exists($column, $this->formatted)) {
			return (string) $this->formatted[$column];
		}

		$val = $this->getValue($column, '');
		if (is_bool($val)) {
			$label = $val ? __('Yes', __FILE__) : __('No', __FILE__);

			return is_string($label) ? $label : ($val ? 'Yes' : 'No');
		}
		if (is_array($val)) {
			if (!array_is_list($val) && (isset($val['label']) || isset($val['title']) || isset($val['name']))) {
				$assocLabel = $val['label'] ?? $val['title'] ?? $val['name'] ?? '';

				return is_scalar($assocLabel) ? (string) $assocLabel : '';
			}

			return implode(', ', array_map(static fn (mixed $v): string => is_scalar($v) ? (string) $v : '', $val));
		}
		if (is_scalar($val)) {
			return (string) $val;
		}

		return '';
	}
}
