<?php

declare(strict_types=1);

namespace Totoglu\React\Provider;

use Closure;
use ProcessWire\PageArray;
use ProcessWire\Wire;
use ProcessWire\WireException;
use Totoglu\React\Contract\ReactDataProviderInterface;

/**
 * Central registry resolving provider descriptors (`'pages:template=basic-page'`, `'array:queues'`,
 * or custom registered scheme factories) into `ReactDataProviderInterface` adapters.
 */
final class ProviderRegistry extends Wire
{
	/**
	 * Registered concrete provider instances keyed by descriptor ID.
	 *
	 * @var array<string, ReactDataProviderInterface>
	 */
	private array $instances = [];

	/**
	 * Registered provider factory callbacks keyed by prefix or exact descriptor ID.
	 *
	 * @var array<string, Closure(string, array<string, mixed>): ReactDataProviderInterface>
	 */
	private array $factories = [];

	/**
	 * Register a concrete provider adapter instance.
	 */
	public function register(string $id, ReactDataProviderInterface $provider): self
	{
		if ($provider instanceof Wire && $this->wire() !== null) {
			$this->wire($provider);
		}
		$this->instances[trim($id)] = $provider;

		return $this;
	}

	/**
	 * Register a factory closure for a descriptor or scheme prefix (e.g. `'pages'`, `'array'`, `'custom'`).
	 *
	 * @param Closure(string, array<string, mixed>): ReactDataProviderInterface $factory
	 */
	public function registerFactory(string $prefixOrId, Closure $factory): self
	{
		$this->factories[trim($prefixOrId)] = $factory;

		return $this;
	}

	/**
	 * Remove a registered concrete provider instance by descriptor ID.
	 */
	public function unregister(string $id): self
	{
		$key = trim($id);
		if ($key !== '') {
			unset($this->instances[$key]);
		}

		return $this;
	}

	/**
	 * Remove a registered provider factory by descriptor ID or scheme prefix.
	 */
	public function unregisterFactory(string $prefixOrId): self
	{
		$key = trim($prefixOrId);
		if ($key !== '') {
			unset($this->factories[$key]);
			if (!str_contains($key, ':')) {
				unset($this->factories[strtolower($key)]);
			}
		}

		return $this;
	}

	/**
	 * Check whether a descriptor is registered or matches a built-in adapter scheme (`pages:`, `array:`).
	 */
	public function has(string $descriptor): bool
	{
		$descriptor = trim($descriptor);
		if ($descriptor === '') {
			return false;
		}
		if (isset($this->instances[$descriptor]) || isset($this->factories[$descriptor])) {
			return true;
		}
		if (str_contains($descriptor, ':')) {
			[$scheme] = explode(':', $descriptor, 2);
			$scheme = strtolower(trim($scheme));
			if (isset($this->factories[$scheme]) || in_array($scheme, ['pages', 'array'], true)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Resolve a provider instance from a string descriptor, `PageArray`, array/Closure dataset, or `ReactDataProviderInterface`.
	 *
	 * @param string|array<int|string, mixed>|Closure|PageArray|ReactDataProviderInterface $source
	 * @param array<string, mixed> $options
	 * @throws WireException When the descriptor lacks a registered scheme or instance
	 */
	public function resolve(string|array|Closure|PageArray|ReactDataProviderInterface $source, array $options = []): ReactDataProviderInterface
	{
		if ($source instanceof ReactDataProviderInterface) {
			if ($options !== [] && method_exists($source, 'applyOptions')) {
				$source->applyOptions($options);
			}

			return $source;
		}

		if ($source instanceof PageArray) {
			$provider = new PagesDataProvider($source, $options);
			$this->wire($provider);

			return $provider;
		}

		if (is_array($source) || $source instanceof Closure) {
			/** @var list<array<string, mixed>|\Totoglu\React\Data\ReactRecord>|Closure(): list<array<string, mixed>|\Totoglu\React\Data\ReactRecord> $normalizedSource */
			$normalizedSource = is_array($source) ? array_values($source) : $source;
			$provider = new ArrayDataProvider(
				id: (string) ($options['id'] ?? 'array:inline'),
				items: $normalizedSource,
				options: $options,
			);
			$this->wire($provider);

			return $provider;
		}

		$descriptor = trim($source);
		if ($descriptor === '') {
			throw new WireException($this->_('Provider descriptor cannot be empty.'));
		}

		if (isset($this->instances[$descriptor])) {
			$instance = $this->instances[$descriptor];
			if ($options !== [] && method_exists($instance, 'applyOptions')) {
				$instance->applyOptions($options);
			}

			return $instance;
		}

		if (isset($this->factories[$descriptor])) {
			$provider = ($this->factories[$descriptor])($descriptor, $options);
			if ($provider instanceof Wire) {
				$this->wire($provider);
			}

			return $provider;
		}

		if (!str_contains($descriptor, ':')) {
			throw new WireException(sprintf(
				$this->_("Provider descriptor '%s' is missing a scheme prefix (expected '<scheme>:<target>') or is not registered."),
				$descriptor,
			));
		}

		[$scheme, $target] = explode(':', $descriptor, 2);
		$scheme = strtolower(trim($scheme));
		$target = trim($target);

		if ($scheme === '') {
			throw new WireException(sprintf(
				$this->_("Provider descriptor '%s' has an empty scheme prefix."),
				$descriptor,
			));
		}

		if (isset($this->factories[$scheme])) {
			$provider = ($this->factories[$scheme])($target, $options);
			if ($provider instanceof Wire) {
				$this->wire($provider);
			}

			return $provider;
		}

		if ($scheme === 'pages') {
			$provider = new PagesDataProvider($target, $options);
			$this->wire($provider);

			return $provider;
		}

		if ($scheme === 'array') {
			/** @var list<array<string, mixed>> $items */
			$items = is_array($options['items'] ?? null) ? $options['items'] : [];
			$provider = new ArrayDataProvider('array:' . ($target !== '' ? $target : 'default'), $items, $options);
			$this->wire($provider);

			return $provider;
		}

		throw new WireException(sprintf(
			$this->_("Unregistered provider scheme '%s' for descriptor '%s'."),
			$scheme,
			$descriptor,
		));
	}
}
