<?php

declare(strict_types=1);

namespace Totoglu\React\Media;

use ProcessWire\Page;
use ProcessWire\PagefilesManager;

/**
 * @internal Virtual Page host mapping `filesManager()` to `{$ownerPage->filesManager()->path()}links/{$fieldName}/`.
 */
final class PageLinkVirtualHost extends Page
{
	private ?PageLinkFilesManager $linkFilesManager = null;

	public function __construct(
		private readonly Page $ownerPage,
		private readonly string $linkFieldName,
	) {
		parent::__construct();
		$ownerPage->wire($this);
		$this->isLoaded = true;
		$this->settings['id'] = max(1, (int) $ownerPage->id);
		$this->setTrackChanges(false);
	}

	public function filesManager(): PagefilesManager
	{
		if ($this->linkFilesManager === null) {
			$this->linkFilesManager = new PageLinkFilesManager($this, $this->ownerPage, $this->linkFieldName);
			$this->wire($this->linkFilesManager);
		}

		return $this->linkFilesManager;
	}

	public function isChanged($what = ''): bool
	{
		return true;
	}

	/**
	 * @param array<string, mixed>|bool|string|null $options
	 */
	public function url($options = null): string
	{
		return $this->ownerPage->url($options);
	}

	/**
	 * @param array<string, mixed>|bool|string $options
	 */
	public function httpUrl($options = []): string
	{
		if (is_array($options)) {
			return $this->ownerPage->httpUrl($options);
		}
		if (is_bool($options)) {
			return $this->ownerPage->httpUrl(['slashUrls' => $options]);
		}

		return $this->ownerPage->httpUrl([]);
	}

	public function get($key): mixed
	{
		if ($key === 'filesManager') {
			return $this->filesManager();
		}
		if ($key === 'filesPath') {
			return $this->filesManager()->path();
		}
		if ($key === 'filesUrl') {
			return $this->filesManager()->url();
		}

		return parent::get($key);
	}
}
