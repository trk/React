<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

use ProcessWire\Wire;

/**
 * Extensible registry of workspace shell layouts (`topbar`, `sidebar`, and hook-registered layouts).
 */
final class ShellLayoutRegistry extends Wire
{
	public const string ID_PATTERN = '/^[a-z0-9_-]{1,40}$/';

	/**
	 * @var array<string, array{
	 *     id: string,
	 *     label: string,
	 *     labelKey: string,
	 *     description: string,
	 *     descriptionKey: string,
	 *     icon: string,
	 *     supportsCollapse: bool,
	 *     order: int
	 * }>
	 */
	private array $definitions = [];

	private bool $defaultsBooted = false;

	/**
	 * Register or update a workspace shell layout definition.
	 *
	 * @param array<string, mixed> $config
	 */
	public function register(string $id, array $config): self
	{
		$this->bootDefaults();

		$cleanId = strtolower(trim($id));
		if ($cleanId === '' || $cleanId === 'default' || preg_match(self::ID_PATTERN, $cleanId) !== 1) {
			return $this;
		}

		$existing = $this->definitions[$cleanId] ?? null;

		$rawLabel = array_key_exists('label', $config) ? (string) $config['label'] : ($existing['label'] ?? '');
		$label = html_entity_decode(trim($rawLabel), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		if ($label === '') {
			$label = ucfirst(str_replace(['-', '_'], ' ', $cleanId));
		}

		$rawLabelKey = array_key_exists('labelKey', $config) ? (string) $config['labelKey'] : ($existing['labelKey'] ?? '');
		$labelKey = (string) preg_replace('/[^a-zA-Z0-9_.-]/', '', trim($rawLabelKey));

		$rawDescription = array_key_exists('description', $config) ? (string) $config['description'] : ($existing['description'] ?? '');
		$description = html_entity_decode(trim($rawDescription), ENT_QUOTES | ENT_HTML5, 'UTF-8');

		$rawDescKey = array_key_exists('descriptionKey', $config) ? (string) $config['descriptionKey'] : ($existing['descriptionKey'] ?? '');
		$descriptionKey = (string) preg_replace('/[^a-zA-Z0-9_.-]/', '', trim($rawDescKey));

		$rawIcon = array_key_exists('icon', $config) ? trim((string) $config['icon']) : ($existing['icon'] ?? 'layout-navbar');
		$cleanIcon = str_starts_with($rawIcon, 'fa-') ? substr($rawIcon, 3) : $rawIcon;
		$icon = ((string) preg_replace('/[^a-zA-Z0-9_-]/', '', $cleanIcon)) ?: 'layout-navbar';

		$supportsCollapse = array_key_exists('supportsCollapse', $config)
			? (bool) $config['supportsCollapse']
			: ($existing['supportsCollapse'] ?? false);

		$order = array_key_exists('order', $config) && is_numeric($config['order'])
			? (int) $config['order']
			: ($existing['order'] ?? 100);

		$this->definitions[$cleanId] = [
			'id' => $cleanId,
			'label' => $label,
			'labelKey' => $labelKey,
			'description' => $description,
			'descriptionKey' => $descriptionKey,
			'icon' => $icon,
			'supportsCollapse' => $supportsCollapse,
			'order' => $order,
		];

		return $this;
	}

	/**
	 * Determine whether a shell layout ID is registered.
	 */
	public function has(string $id): bool
	{
		$this->bootDefaults();
		$cleanId = strtolower(trim($id));

		return $cleanId !== '' && isset($this->definitions[$cleanId]);
	}

	/**
	 * Retrieve a registered shell layout descriptor by ID, or `null` when unknown.
	 *
	 * @return array{
	 *     id: string,
	 *     label: string,
	 *     labelKey: string,
	 *     description: string,
	 *     descriptionKey: string,
	 *     icon: string,
	 *     supportsCollapse: bool,
	 *     order: int
	 * }|null
	 */
	public function get(string $id): ?array
	{
		$this->bootDefaults();
		$cleanId = strtolower(trim($id));

		return $cleanId !== '' ? ($this->definitions[$cleanId] ?? null) : null;
	}

	/**
	 * Return all registered shell layouts sorted by `order` ASC, then `id` ASC.
	 *
	 * @return array<string, array{
	 *     id: string,
	 *     label: string,
	 *     labelKey: string,
	 *     description: string,
	 *     descriptionKey: string,
	 *     icon: string,
	 *     supportsCollapse: bool,
	 *     order: int
	 * }>
	 */
	public function all(): array
	{
		$this->bootDefaults();
		$items = $this->definitions;
		uasort($items, static function (array $a, array $b): int {
			if ($a['order'] !== $b['order']) {
				return $a['order'] <=> $b['order'];
			}

			return strcmp($a['id'], $b['id']);
		});

		return $items;
	}

	/**
	 * Return an ordered `id => label` map suitable for select inputs.
	 *
	 * @return array<string, string>
	 */
	public function options(): array
	{
		$options = [];
		foreach ($this->all() as $id => $layout) {
			$options[$id] = $layout['label'];
		}

		return $options;
	}

	/**
	 * Return an ordered list of layout descriptor arrays for client serialization.
	 *
	 * @return list<array<string, mixed>>
	 */
	public function toArray(): array
	{
		return array_values($this->all());
	}

	/**
	 * Return the canonical default layout identifier (`'topbar'`).
	 */
	public function defaultId(): string
	{
		return ShellLayout::Topbar->value;
	}

	private function bootDefaults(): void
	{
		if ($this->defaultsBooted) {
			return;
		}
		$this->defaultsBooted = true;

		$this->register(ShellLayout::Topbar->value, [
			'label' => $this->_('Top Bar'),
			'labelKey' => 'shell.layoutTopbar',
			'description' => $this->_('Horizontal top navigation bar with inline workspace links and section tabs.'),
			'descriptionKey' => 'shell.layoutTopbarDesc',
			'icon' => ShellLayout::Topbar->icon(),
			'supportsCollapse' => ShellLayout::Topbar->supportsCollapse(),
			'order' => 10,
		]);

		$this->register(ShellLayout::Sidebar->value, [
			'label' => $this->_('Sidebar'),
			'labelKey' => 'shell.layoutSidebar',
			'description' => $this->_('Collapsible left navigation sidebar with module switcher and account footer.'),
			'descriptionKey' => 'shell.layoutSidebarDesc',
			'icon' => ShellLayout::Sidebar->icon(),
			'supportsCollapse' => ShellLayout::Sidebar->supportsCollapse(),
			'order' => 20,
		]);
	}
}
