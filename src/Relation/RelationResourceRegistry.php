<?php

declare(strict_types=1);

namespace Totoglu\React\Relation;

use Closure;
use ProcessWire\Wire;
use ProcessWire\WireException;
use Totoglu\React\Relation\Resource\FieldResourceAdapter;
use Totoglu\React\Relation\Resource\LanguageResourceAdapter;
use Totoglu\React\Relation\Resource\ModuleResourceAdapter;
use Totoglu\React\Relation\Resource\PageResourceAdapter;
use Totoglu\React\Relation\Resource\PermissionResourceAdapter;
use Totoglu\React\Relation\Resource\RoleResourceAdapter;
use Totoglu\React\Relation\Resource\TemplateResourceAdapter;
use Totoglu\React\Relation\Resource\UserResourceAdapter;

/**
 * RelationResourceRegistry
 *
 * Central registry of relational target resource adapters (`page`, `template`, `field`,
 * `user`, `role`, `permission`, `language`, `module`, plus custom module adapters registered
 * via `React::registerRelationResources` or `deferRelationRegistration`).
 */
final class RelationResourceRegistry extends Wire
{
	/** @var array<string, RelationResourceInterface> */
	private array $instances = [];

	/** @var array<string, Closure(): RelationResourceInterface> */
	private array $factories = [];

	private bool $defaultsBooted = false;

	/**
	 * Register a concrete `RelationResourceInterface` adapter instance.
	 */
	public function register(RelationResourceInterface $adapter, ?string $alias = null): self
	{
		if ($adapter instanceof Wire && $this->wire() !== null) {
			$this->wire($adapter);
		}
		$key = strtolower(trim($alias ?? $adapter->name()));
		if ($key !== '') {
			$this->instances[$key] = $adapter;
		}

		return $this;
	}

	/**
	 * Register a lazy factory closure for `$name` (`fn(): RelationResourceInterface`).
	 *
	 * @param Closure(): RelationResourceInterface $factory
	 */
	public function registerFactory(string $name, Closure $factory): self
	{
		$key = strtolower(trim($name));
		if ($key !== '') {
			$this->factories[$key] = $factory;
			unset($this->instances[$key]);
		}

		return $this;
	}

	/**
	 * Determine whether a resource adapter is registered under `$name`.
	 */
	public function has(string $name): bool
	{
		$this->bootDefaults();
		$key = $this->normalizeAlias($name);

		return isset($this->instances[$key]) || isset($this->factories[$key]);
	}

	/**
	 * Resolve a registered `RelationResourceInterface` by `$name` (throws `WireException` if unknown).
	 */
	public function get(string $name): RelationResourceInterface
	{
		$this->bootDefaults();
		$key = $this->normalizeAlias($name);

		if (isset($this->instances[$key])) {
			return $this->instances[$key];
		}

		if (isset($this->factories[$key])) {
			$adapter = ($this->factories[$key])();
			if (!$adapter instanceof RelationResourceInterface) {
				throw new WireException(sprintf('Relation resource factory "%s" did not return a RelationResourceInterface.', $key));
			}
			if ($adapter instanceof Wire && $this->wire() !== null) {
				$this->wire($adapter);
			}
			$this->instances[$key] = $adapter;

			return $adapter;
		}

		throw new WireException(sprintf('Unknown relation resource "%s".', $name));
	}

	/**
	 * Return all registered resource adapters keyed by canonical resource name.
	 *
	 * @return array<string, RelationResourceInterface>
	 */
	public function all(): array
	{
		$this->bootDefaults();
		$keys = array_unique(array_merge(array_keys($this->instances), array_keys($this->factories)));
		$result = [];
		foreach ($keys as $key) {
			$result[$key] = $this->get($key);
		}

		return $result;
	}

	/**
	 * Return UI metadata descriptors for a subset (or all) of registered resources.
	 *
	 * @param list<string> $names
	 * @return list<array{name: string, label: string, icon: string, defaultValueField: string, supportsTree: bool, supportsQuickCreate: bool}>
	 */
	public function describeResources(array $names = []): array
	{
		$this->bootDefaults();
		$targets = $names !== [] ? $names : array_keys($this->all());
		$descriptors = [];

		foreach ($targets as $rawName) {
			$clean = $this->normalizeAlias($rawName);
			if (!$this->has($clean)) {
				continue;
			}
			$adapter = $this->get($clean);
			$descriptors[] = [
				'name' => $adapter->name(),
				'label' => $adapter->label(),
				'icon' => $adapter->icon(),
				'defaultValueField' => $adapter->defaultValueField(),
				'supportsTree' => $adapter->supportsTree(),
				'supportsQuickCreate' => $adapter->supportsQuickCreate(),
			];
		}

		return $descriptors;
	}

	/**
	 * Hydrate polymorphic M2A tokens (`"<resource>:<value>"`) across registered adapters.
	 *
	 * @param list<string> $morphTokens
	 * @param list<string> $allowedResources
	 * @param array<string, mixed> $config
	 * @return list<RelationItem>
	 */
	public function hydrateMorphTokens(array $morphTokens, array $allowedResources = [], array $config = []): array
	{
		$this->bootDefaults();
		$allowedMap = [];
		foreach ($allowedResources as $res) {
			$norm = $this->normalizeAlias($res);
			if ($norm !== '') {
				$allowedMap[$norm] = true;
			}
		}

		/** @var array<string, list<string>> $grouped */
		$grouped = [];
		/** @var list<array{res: string, val: string}> $orderedRefs */
		$orderedRefs = [];

		foreach ($morphTokens as $rawToken) {
			$trimmed = trim((string) $rawToken);
			if ($trimmed === '' || !str_contains($trimmed, ':')) {
				continue;
			}
			[$rawRes, $rawVal] = explode(':', $trimmed, 2);
			$res = $this->normalizeAlias($rawRes);
			$val = trim($rawVal);
			if ($res === '' || $val === '' || !$this->has($res)) {
				continue;
			}
			if ($allowedMap !== [] && !isset($allowedMap[$res])) {
				continue;
			}
			$grouped[$res][] = $val;
			$orderedRefs[] = ['res' => $res, 'val' => $val];
		}

		/** @var array<string, RelationItem> $hydratedByToken */
		$hydratedByToken = [];
		foreach ($grouped as $res => $vals) {
			$adapter = $this->get($res);
			$resConfig = is_array($config['resourceConfigs'][$res] ?? null)
				? array_merge($config, $config['resourceConfigs'][$res])
				: $config;
			foreach ($adapter->hydrate(array_values(array_unique($vals)), $resConfig) as $item) {
				$hydratedByToken[$res . ':' . (string) $item->value] = $item;
			}
		}

		$orderedItems = [];
		foreach ($orderedRefs as $ref) {
			$lookupKey = $ref['res'] . ':' . $ref['val'];
			if (isset($hydratedByToken[$lookupKey])) {
				$orderedItems[] = $hydratedByToken[$lookupKey];
			}
		}

		return $orderedItems;
	}

	public static function normalizeResourceAlias(string $name): string
	{
		$clean = strtolower(trim($name));

		return match ($clean) {
			'pages' => 'page',
			'templates' => 'template',
			'fields' => 'field',
			'users' => 'user',
			'roles' => 'role',
			'permissions' => 'permission',
			'languages' => 'language',
			'modules' => 'module',
			'entries' => 'entry',
			'blueprints' => 'blueprint',
			default => $clean,
		};
	}

	private function normalizeAlias(string $name): string
	{
		return self::normalizeResourceAlias($name);
	}

	private function bootDefaults(): void
	{
		if ($this->defaultsBooted) {
			return;
		}
		$this->defaultsBooted = true;

		$defaults = [
			'page' => fn(): RelationResourceInterface => $this->wireInstance(new PageResourceAdapter()),
			'template' => fn(): RelationResourceInterface => $this->wireInstance(new TemplateResourceAdapter()),
			'field' => fn(): RelationResourceInterface => $this->wireInstance(new FieldResourceAdapter()),
			'user' => fn(): RelationResourceInterface => $this->wireInstance(new UserResourceAdapter()),
			'role' => fn(): RelationResourceInterface => $this->wireInstance(new RoleResourceAdapter()),
			'permission' => fn(): RelationResourceInterface => $this->wireInstance(new PermissionResourceAdapter()),
			'language' => fn(): RelationResourceInterface => $this->wireInstance(new LanguageResourceAdapter()),
			'module' => fn(): RelationResourceInterface => $this->wireInstance(new ModuleResourceAdapter()),
		];

		foreach ($defaults as $name => $factory) {
			if (!isset($this->instances[$name]) && !isset($this->factories[$name])) {
				$this->factories[$name] = $factory;
			}
		}
	}

	private function wireInstance(RelationResourceInterface $adapter): RelationResourceInterface
	{
		if ($adapter instanceof Wire && $this->wire() !== null) {
			$this->wire($adapter);
		}

		return $adapter;
	}
}
