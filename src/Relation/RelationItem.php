<?php

declare(strict_types=1);

namespace Totoglu\React\Relation;

/**
 * RelationItem
 *
 * Immutable value object representing a normalized relational target item across
 * core ProcessWire resources (`page`, `template`, `field`, `user`, `role`, `permission`,
 * `language`, `module`) and third-party registered resources.
 */
final readonly class RelationItem implements \JsonSerializable
{
	/**
	 * @param array<string, mixed> $meta
	 */
	public function __construct(
		public string|int $value,
		public string $resource,
		public string $resourceLabel,
		public string $label,
		public string $subtitle = '',
		public string $badge = '',
		public string $icon = 'cube',
		public string $status = 'published',
		public string $thumbUrl = '',
		public bool $hasChildren = false,
		public string|int|null $parentId = null,
		public string $editUrl = '',
		public string $viewUrl = '',
		public array $meta = [],
	) {
	}

	/**
	 * Return the canonical polymorphic M2A URI token (`"<resource>:<value>"`).
	 */
	public function toMorphToken(): string
	{
		return $this->resource . ':' . (string) $this->value;
	}

	/**
	 * Serialize into a JSON-ready associative array consumed by `<RelationFieldControl />`.
	 *
	 * @return array{
	 *     value: string|int,
	 *     resource: string,
	 *     resourceLabel: string,
	 *     label: string,
	 *     subtitle: string,
	 *     badge: string,
	 *     icon: string,
	 *     status: string,
	 *     thumbUrl: string,
	 *     hasChildren: bool,
	 *     parentId: string|int|null,
	 *     editUrl: string,
	 *     viewUrl: string,
	 *     morphToken: string,
	 *     meta: array<string, mixed>
	 * }
	 */
	public function toArray(): array
	{
		return [
			'value' => $this->value,
			'resource' => $this->resource,
			'resourceLabel' => $this->resourceLabel,
			'label' => $this->label,
			'subtitle' => $this->subtitle,
			'badge' => $this->badge,
			'icon' => $this->icon,
			'status' => $this->status,
			'thumbUrl' => $this->thumbUrl,
			'hasChildren' => $this->hasChildren,
			'parentId' => $this->parentId,
			'editUrl' => $this->editUrl,
			'viewUrl' => $this->viewUrl,
			'morphToken' => $this->toMorphToken(),
			'meta' => $this->meta,
		];
	}

	/**
	 * @return array<string, mixed>
	 */
	public function jsonSerialize(): array
	{
		return $this->toArray();
	}
}
