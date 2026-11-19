<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

use Closure;
use Totoglu\React\Security\UrlSanitizer;

/**
 * Immutable value object describing a registered ProcessWire admin workspace in `ProcessReactWorkspace`.
 */
final readonly class WorkspaceDefinition
{
	public string $id;
	public string $title;
	public string $description;
	public string $icon;
	public string $logoUrl;
	public string $process;
	public string $url;
	public string $permission;
	public ?Closure $accessCallback;
	public string $category;
	public string $badge;
	public int $order;
	public string $component;
	/** @var list<array{label: string, value: string, tone: string}> */
	public array $stats;
	public ?Closure $statsCallback;
	/** @var list<string> */
	public array $scripts;
	/** @var list<string> */
	public array $styles;

	/**
	 * @param array<int, array<string, mixed>> $stats
	 * @param list<string> $scripts
	 * @param list<string> $styles
	 */
	public function __construct(
		string $id,
		string $title,
		string $description = '',
		string $icon = 'cubes',
		string $process = '',
		string $url = '',
		string $permission = '',
		?Closure $accessCallback = null,
		string $category = '',
		string $badge = '',
		int $order = 100,
		string $logoUrl = '',
		string $component = '',
		array $stats = [],
		?Closure $statsCallback = null,
		array $scripts = [],
		array $styles = [],
	) {
		$cleanId = strtolower(trim($id));
		$this->id = (string) preg_replace('/[^a-z0-9_-]/', '-', $cleanId);
		$this->title = html_entity_decode(trim($title), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$this->description = html_entity_decode(trim($description), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$rawIcon = trim($icon);
		$cleanIcon = str_starts_with($rawIcon, 'fa-') ? substr($rawIcon, 3) : $rawIcon;
		$this->icon = ((string) preg_replace('/[^a-zA-Z0-9_-]/', '', $cleanIcon)) ?: 'cubes';
		$this->logoUrl = UrlSanitizer::sanitizeHref($logoUrl);
		$cleanProcess = trim($process);
		if (str_starts_with($cleanProcess, 'ProcessWire\\')) {
			$cleanProcess = substr($cleanProcess, strlen('ProcessWire\\'));
		}
		$this->process = $cleanProcess;
		$this->url = UrlSanitizer::sanitizeHref($url);
		$this->permission = trim($permission);
		$this->accessCallback = $accessCallback;
		$this->category = html_entity_decode(trim($category), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$this->badge = html_entity_decode(trim($badge), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$this->order = $order;
		$this->component = trim($component);
		$this->stats = self::normalizeStats($stats);
		$this->statsCallback = $statsCallback;
		$this->scripts = array_values(array_filter(array_map('strval', $scripts), static fn(string $s): bool => $s !== ''));
		$this->styles = array_values(array_filter(array_map('strval', $styles), static fn(string $s): bool => $s !== ''));
	}

	/**
	 * Normalize a list of workspace stat pills (`[{label, value, tone?}]`, max 3 items).
	 *
	 * @return list<array{label: string, value: string, tone: string}>
	 */
	public static function normalizeStats(mixed $raw): array
	{
		if (!is_array($raw)) {
			return [];
		}

		$normalized = [];
		foreach ($raw as $item) {
			if (!is_array($item)) {
				continue;
			}
			$label = html_entity_decode(trim((string) ($item['label'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
			$value = html_entity_decode(trim((string) ($item['value'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8');
			if ($label === '' || $value === '') {
				continue;
			}
			$rawTone = strtolower(trim((string) ($item['tone'] ?? ($item['variant'] ?? ''))));
			$tone = in_array($rawTone, ['primary', 'success', 'warning', 'danger', 'muted'], true) ? $rawTone : '';
			$normalized[] = [
				'label' => $label,
				'value' => $value,
				'tone' => $tone,
			];
			if (count($normalized) >= 3) {
				break;
			}
		}

		return $normalized;
	}

	/**
	 * Hydrate a `WorkspaceDefinition` from an associative array.
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

		$statsInput = $data['statsCallback'] ?? null;
		$statsClosure = null;
		$staticStats = [];
		if ($statsInput instanceof Closure) {
			$statsClosure = $statsInput;
		} elseif (is_callable($statsInput)) {
			$statsClosure = Closure::fromCallable($statsInput);
		}
		if (isset($data['stats'])) {
			if ($data['stats'] instanceof Closure) {
				$statsClosure = $data['stats'];
			} elseif (is_callable($data['stats']) && !is_array($data['stats'])) {
				$statsClosure = Closure::fromCallable($data['stats']);
			} elseif (is_array($data['stats'])) {
				$staticStats = $data['stats'];
			}
		}

		return new self(
			id: (string) ($data['id'] ?? ''),
			title: (string) ($data['title'] ?? ''),
			description: (string) ($data['description'] ?? ($data['summary'] ?? '')),
			icon: (string) ($data['icon'] ?? 'cubes'),
			process: (string) ($data['process'] ?? ''),
			url: (string) ($data['url'] ?? ($data['href'] ?? '')),
			permission: (string) ($data['permission'] ?? ''),
			accessCallback: $accessClosure,
			category: (string) ($data['category'] ?? ''),
			badge: (string) ($data['badge'] ?? ''),
			order: isset($data['order']) ? (int) $data['order'] : 100,
			logoUrl: (string) ($data['logoUrl'] ?? ($data['logo'] ?? '')),
			component: (string) ($data['component'] ?? ''),
			stats: $staticStats,
			statsCallback: $statsClosure,
			scripts: is_array($data['scripts'] ?? null) ? array_values(array_map('strval', $data['scripts'])) : [],
			styles: is_array($data['styles'] ?? null) ? array_values(array_map('strval', $data['styles'])) : [],
		);
	}

	/**
	 * Convert the definition into a serializable array representation.
	 *
	 * @param list<array{label: string, value: string, tone: string}>|null $resolvedStats
	 * @return array{
	 *     id: string,
	 *     title: string,
	 *     description: string,
	 *     icon: string,
	 *     logoUrl: string,
	 *     process: string,
	 *     url: string,
	 *     permission: string,
	 *     category: string,
	 *     badge: string,
	 *     order: int,
	 *     component: string,
	 *     stats: list<array{label: string, value: string, tone: string}>,
	 *     scripts: list<string>,
	 *     styles: list<string>
	 * }
	 */
	public function toArray(?string $resolvedUrl = null, ?array $resolvedStats = null): array
	{
		return [
			'id' => $this->id,
			'title' => $this->title,
			'description' => $this->description,
			'icon' => $this->icon,
			'logoUrl' => $this->logoUrl,
			'process' => $this->process,
			'url' => $resolvedUrl !== null ? $resolvedUrl : $this->url,
			'permission' => $this->permission,
			'category' => $this->category,
			'badge' => $this->badge,
			'order' => $this->order,
			'component' => $this->component,
			'stats' => $resolvedStats !== null ? $resolvedStats : $this->stats,
			'scripts' => $this->scripts,
			'styles' => $this->styles,
		];
	}
}
