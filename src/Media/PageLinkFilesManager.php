<?php

declare(strict_types=1);

namespace Totoglu\React\Media;

use ProcessWire\Page;
use ProcessWire\PagefilesManager;

/**
 * @internal Scoped `PagefilesManager` pointing at `{$ownerPage->filesManager()->path()}links/{$fieldName}/`.
 */
final class PageLinkFilesManager extends PagefilesManager
{
	public function __construct(
		Page $virtualPage,
		private readonly Page $ownerPage,
		private readonly string $linkFieldName,
	) {
		parent::__construct($virtualPage);
	}

	public function ___path(): string
	{
		return PageLinkMediaHostAdapter::directoryPathFor($this->ownerPage, $this->linkFieldName);
	}

	public function ___url(): string
	{
		return PageLinkMediaHostAdapter::directoryUrlFor($this->ownerPage, $this->linkFieldName);
	}

	public function createPath(): bool
	{
		$dir = $this->path();
		if ($dir === '') {
			return false;
		}
		if (is_dir($dir)) {
			return true;
		}

		return (bool) $this->wire()->files->mkdir($dir, true);
	}
}
