<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Contract\ReactDataProviderInterface;
use Totoglu\React\Viewport\MarkupReactViewport;

/**
 * Standalone ProcessWire Markup module (`extends MarkupReactViewport` -> `MarkupInertia`)
 * for rendering interactive React + Inertia Data Tables (`ReactWorkspace/Table`), Filter Bars,
 * Saved Views, Bulk Action Bars, Inline Editing, and Windowed Pagination across any `Wire*` module.
 *
 * @method string render(string|array<int|string, mixed>|\Closure|PageArray|ReactDataProviderInterface $provider = '', array<string, mixed> $props = [])
 */
class MarkupReactTable extends MarkupReactViewport
{
	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => __('React Table Viewport', __FILE__),
			'version' => 10,
			'summary' => __('Interactive data table with search, filters, inline editing, bulk actions, and pagination.', __FILE__),
			'author' => 'Iskender TOTOGLU @trk @ukyo',
			'icon' => 'table',
			'singular' => true,
			'autoload' => false,
			'requires' => [
				'PHP>=8.4',
				'ProcessWire>=3.0.271',
				'Inertia',
				'React',
			],
		];
	}

	protected function defaultViewMode(): string
	{
		return 'table';
	}

	public function inertiaComponent(): string
	{
		return 'ReactWorkspace/Table';
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
			$ws->resolveModuleAssetUrl('MarkupReactTable.js'),
		)));
	}
}
