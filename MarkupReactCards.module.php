<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Viewport\MarkupReactViewport;

/**
 * Standalone ProcessWire Markup module (`extends MarkupReactViewport` -> `MarkupInertia`)
 * for rendering interactive React + Inertia responsive Card Grids (`ReactWorkspace/Cards`)
 * across any `Wire*` module.
 *
 * @method string render(string|array<int|string, mixed>|\Closure|PageArray|ReactDataProviderInterface $provider = '', array<string, mixed> $props = [])
 */
class MarkupReactCards extends MarkupReactViewport
{
	protected function defaultViewMode(): string
	{
		return 'cards';
	}

	public function inertiaComponent(): string
	{
		return 'ReactWorkspace/Cards';
	}

	/**
	 * Return the versioned viewport script URLs to load after `dist/ReactInertia.js`.
	 *
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		$ws = $this->react();

		return array_values(array_unique(array_merge(
			$ws->resolveModuleAssetUrl('ReactViewports.js'),
			$ws->resolveModuleAssetUrl('MarkupReactCards.js'),
		)));
	}
}
