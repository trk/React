<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

use Closure;
use Totoglu\React\Security\UrlSanitizer;

/**
 * Immutable value object describing a dashboard widget registered by a `Wire*` module for `ProcessReactWorkspace`.
 */
final readonly class WorkspaceWidgetDefinition
{
	public string $id;
	public string $workspaceId;
	public string $title;
	public string $subtitle;
	public string $description;
	public string $icon;
	public string $size;
	public int $order;
	public string $permission;
	public ?Closure $accessCallback;
	/** @var array<string, mixed> */
	public array $data;
	public ?Closure $dataCallback;

	/**
	 * @param array<string, mixed> $data
	 */
	public function __construct(
		string $id,
		string $title,
		string $workspaceId = '',
		string $subtitle = '',
		string $description = '',
		string $icon = 'layout-grid',
		string $size = 'md',
		int $order = 100,
		string $permission = '',
		?Closure $accessCallback = null,
		array $data = [],
		?Closure $dataCallback = null,
	) {
		$cleanId = strtolower(trim($id));
		$this->id = (string) preg_replace('/[^a-z0-9_-]/', '-', $cleanId);
		$cleanWsId = strtolower(trim($workspaceId));
		$this->workspaceId = (string) preg_replace('/[^a-z0-9_-]/', '-', $cleanWsId);
		$this->title = html_entity_decode(trim($title), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$this->subtitle = html_entity_decode(trim($subtitle), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$this->description = html_entity_decode(trim($description), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$rawIcon = trim($icon);
		$cleanIcon = str_starts_with($rawIcon, 'fa-') ? substr($rawIcon, 3) : $rawIcon;
		$this->icon = ((string) preg_replace('/[^a-zA-Z0-9_-]/', '', $cleanIcon)) ?: 'layout-grid';
		$normSize = strtolower(trim($size));
		if (in_array($normSize, ['sm', 'md', 'lg', 'full'], true)) {
			$this->size = $normSize;
		} elseif (preg_match('/^\d{1,2}$/', $normSize) === 1 && (int) $normSize >= 1 && (int) $normSize <= 12) {
			$this->size = (string) ((int) $normSize);
		} else {
			$this->size = 'md';
		}
		$this->order = $order;
		$this->permission = trim($permission);
		$this->accessCallback = $accessCallback;
		$this->data = self::normalizeData($data);
		$this->dataCallback = $dataCallback;
	}

	/**
	 * Normalize a widget data payload (`metrics`, `items`, `actions`, `status`, `emptyText`).
	 *
	 * @return array{
	 *     metrics: list<array{label: string, value: string, tone: string, href: string}>,
	 *     items: list<array{id: string, title: string, subtitle: string, badge: string, badgeVariant: string, href: string, icon: string, meta: string}>,
	 *     actions: list<array{label: string, href: string, icon: string, variant: string}>,
	 *     status: array{label: string, tone: string, detail: string}|null,
	 *     emptyText: string
	 * }
	 */
	public static function normalizeData(mixed $raw): array
	{
		$default = [
			'metrics' => [],
			'items' => [],
			'actions' => [],
			'status' => null,
			'emptyText' => '',
		];

		if (!is_array($raw)) {
			return $default;
		}

		$metrics = [];
		if (isset($raw['metrics']) && is_array($raw['metrics'])) {
			foreach ($raw['metrics'] as $m) {
				if (!is_array($m)) {
					continue;
				}
				$label = html_entity_decode(trim((string) ($m['label'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
				$value = html_entity_decode(trim((string) ($m['value'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
				if ($label === '' || $value === '') {
					continue;
				}
				$rawTone = strtolower(trim((string) ($m['tone'] ?? ($m['variant'] ?? ''))));
				$tone = in_array($rawTone, ['primary', 'success', 'warning', 'danger', 'muted'], true) ? $rawTone : '';
				$metrics[] = [
					'label' => $label,
					'value' => $value,
					'tone' => $tone,
					'href' => UrlSanitizer::sanitizeHref((string) ($m['href'] ?? '')),
				];
				if (count($metrics) >= 4) {
					break;
				}
			}
		}

		$items = [];
		if (isset($raw['items']) && is_array($raw['items'])) {
			foreach ($raw['items'] as $idx => $item) {
				if (!is_array($item)) {
					continue;
				}
				$title = html_entity_decode(trim((string) ($item['title'] ?? ($item['label'] ?? ''))), ENT_QUOTES | ENT_HTML5, 'UTF-8');
				if ($title === '') {
					continue;
				}
				$id = trim((string) ($item['id'] ?? 'item-' . $idx));
				$subtitle = html_entity_decode(trim((string) ($item['subtitle'] ?? ($item['description'] ?? ''))), ENT_QUOTES | ENT_HTML5, 'UTF-8');
				$badge = html_entity_decode(trim((string) ($item['badge'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
				$rawVariant = strtolower(trim((string) ($item['badgeVariant'] ?? ($item['tone'] ?? 'secondary'))));
				$badgeVariant = in_array($rawVariant, ['primary', 'secondary', 'success', 'warning', 'danger', 'outline', 'muted'], true)
					? $rawVariant
					: 'secondary';
				$rawIcon = trim((string) ($item['icon'] ?? ''));
				$cleanIcon = str_starts_with($rawIcon, 'fa-') ? substr($rawIcon, 3) : $rawIcon;
				$items[] = [
					'id' => $id,
					'title' => $title,
					'subtitle' => $subtitle,
					'badge' => $badge,
					'badgeVariant' => $badgeVariant,
					'href' => UrlSanitizer::sanitizeHref((string) ($item['href'] ?? ($item['url'] ?? ''))),
					'icon' => (string) preg_replace('/[^a-zA-Z0-9_-]/', '', $cleanIcon),
					'meta' => html_entity_decode(trim((string) ($item['meta'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
				];
				if (count($items) >= 6) {
					break;
				}
			}
		}

		$actions = [];
		if (isset($raw['actions']) && is_array($raw['actions'])) {
			foreach ($raw['actions'] as $act) {
				if (!is_array($act)) {
					continue;
				}
				$label = html_entity_decode(trim((string) ($act['label'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
				$rawHref = trim((string) ($act['href'] ?? ($act['url'] ?? '')));
				if ($label === '' || $rawHref === '') {
					continue;
				}
				$href = UrlSanitizer::sanitizeHref($rawHref);
				if ($href === '') {
					continue;
				}
				$rawIcon = trim((string) ($act['icon'] ?? ''));
				$cleanIcon = str_starts_with($rawIcon, 'fa-') ? substr($rawIcon, 3) : $rawIcon;
				$rawVariant = strtolower(trim((string) ($act['variant'] ?? 'outline')));
				$variant = in_array($rawVariant, ['primary', 'secondary', 'outline', 'ghost'], true) ? $rawVariant : 'outline';
				$actions[] = [
					'label' => $label,
					'href' => $href,
					'icon' => (string) preg_replace('/[^a-zA-Z0-9_-]/', '', $cleanIcon),
					'variant' => $variant,
				];
				if (count($actions) >= 3) {
					break;
				}
			}
		}

		$status = null;
		if (isset($raw['status']) && is_array($raw['status'])) {
			$statusLabel = html_entity_decode(trim((string) ($raw['status']['label'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
			if ($statusLabel !== '') {
				$rawTone = strtolower(trim((string) ($raw['status']['tone'] ?? 'primary')));
				$tone = in_array($rawTone, ['primary', 'success', 'warning', 'danger', 'muted'], true) ? $rawTone : 'primary';
				$status = [
					'label' => $statusLabel,
					'tone' => $tone,
					'detail' => html_entity_decode(trim((string) ($raw['status']['detail'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
				];
			}
		}

		$emptyText = html_entity_decode(trim((string) ($raw['emptyText'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');

		return [
			'metrics' => $metrics,
			'items' => $items,
			'actions' => $actions,
			'status' => $status,
			'emptyText' => $emptyText,
		];
	}

	/**
	 * Hydrate a `WorkspaceWidgetDefinition` from an associative array.
	 *
	 * @param array<string, mixed> $data
	 */
	public static function fromArray(array $data): self
	{
		$access = $data['accessCallback'] ?? ($data['access'] ?? null);
		$accessClosure = null;
		if ($access instanceof Closure) {
			$accessClosure = $access;
		} elseif (is_callable($access)) {
			$accessClosure = Closure::fromCallable($access);
		}

		$dataInput = $data['dataCallback'] ?? null;
		$dataClosure = null;
		$staticData = [];
		if ($dataInput instanceof Closure) {
			$dataClosure = $dataInput;
		} elseif (is_callable($dataInput)) {
			$dataClosure = Closure::fromCallable($dataInput);
		}
		if (isset($data['data'])) {
			if ($data['data'] instanceof Closure) {
				$dataClosure = $data['data'];
			} elseif (is_callable($data['data']) && !is_array($data['data'])) {
				$dataClosure = Closure::fromCallable($data['data']);
			} elseif (is_array($data['data'])) {
				$staticData = $data['data'];
			}
		}

		return new self(
			id: (string) ($data['id'] ?? ''),
			title: (string) ($data['title'] ?? ''),
			workspaceId: (string) ($data['workspaceId'] ?? ($data['workspace'] ?? '')),
			subtitle: (string) ($data['subtitle'] ?? ''),
			description: (string) ($data['description'] ?? ''),
			icon: (string) ($data['icon'] ?? 'layout-grid'),
			size: (string) ($data['size'] ?? 'md'),
			order: isset($data['order']) ? (int) $data['order'] : 100,
			permission: (string) ($data['permission'] ?? ''),
			accessCallback: $accessClosure,
			data: $staticData,
			dataCallback: $dataClosure,
		);
	}

	/**
	 * Convert the widget definition into a serializable array.
	 *
	 * @param array<string, mixed>|null $resolvedData
	 * @return array<string, mixed>
	 */
	public function toArray(?array $resolvedData = null, string $workspaceTitle = '', string $workspaceUrl = ''): array
	{
		$payload = $resolvedData !== null ? self::normalizeData($resolvedData) : $this->data;

		return [
			'id' => $this->id,
			'workspaceId' => $this->workspaceId,
			'workspaceTitle' => $workspaceTitle,
			'workspaceUrl' => $workspaceUrl,
			'title' => $this->title,
			'subtitle' => $this->subtitle,
			'description' => $this->description,
			'icon' => $this->icon,
			'size' => $this->size,
			'order' => $this->order,
			'metrics' => $payload['metrics'],
			'items' => $payload['items'],
			'actions' => $payload['actions'],
			'status' => $payload['status'],
			'emptyText' => $payload['emptyText'],
		];
	}
}
