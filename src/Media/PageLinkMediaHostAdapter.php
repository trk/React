<?php

declare(strict_types=1);

namespace Totoglu\React\Media;

use ProcessWire\Field;
use ProcessWire\Inputfield;
use ProcessWire\InputfieldFile;
use ProcessWire\InputfieldImage;
use ProcessWire\InputfieldReactLink;
use ProcessWire\NullPage;
use ProcessWire\Page;
use ProcessWire\Pagefile;
use ProcessWire\Pagefiles;
use ProcessWire\Pageimage;
use ProcessWire\Pageimages;
use ProcessWire\User;
use ProcessWire\Wire;

/**
 * `MediaHostAdapterInterface` implementation for `InputfieldReactLink`
 * attached to ProcessWire `Page` (and `RepeaterPage`) `FieldtypeText` / `FieldtypeTextarea` fields.
 *
 * Stores single-file media assets inside `{$page->filesManager()->path()}links/{$fieldName}/`
 * so `PagefilesManager` automatically copies/deletes them on Page clone/delete while ignoring
 * subdirectories during standard `FieldtypeFile` directory scans.
 */
final class PageLinkMediaHostAdapter extends Wire implements MediaHostAdapterInterface
{
	public const string KIND = 'page_link';
	private const string PENDING_MANIFEST = '.rw-pending-link.json';

	public function kind(): string
	{
		return self::KIND;
	}

	/**
	 * @param array<string, mixed> $common
	 * @return array<string, mixed>|null
	 */
	public function buildEnvelope(
		Inputfield $inputfield,
		mixed $hostPage,
		string $dataFieldName,
		string $inputName,
		array $common,
	): ?array {
		if (!$inputfield instanceof InputfieldReactLink) {
			return null;
		}
		if ($hostPage instanceof Page && !$hostPage instanceof NullPage && !MediaGateway::isPhysicalPageHost($hostPage)) {
			return null;
		}
		if (!MediaGateway::isPhysicalPageHost($hostPage)) {
			$process = $this->wire()->process;
			if ($process instanceof \ProcessWire\WirePageEditor) {
				try {
					$candidate = $process->getPage();
					if (MediaGateway::isPhysicalPageHost($candidate)) {
						$hostPage = $candidate;
					}
				} catch (\Throwable) {
					$hostPage = null;
				}
			}
		}
		if (!MediaGateway::isPhysicalPageHost($hostPage)) {
			return null;
		}
		/** @var Page $hostPage */

		$resolvedFieldName = $dataFieldName;
		if ($resolvedFieldName === '' && $inputName !== '') {
			$cleanCandidate = (string) preg_replace('/_repeater\d+$/', '', $inputName);
			$resolvedFieldName = $cleanCandidate !== '' ? $cleanCandidate : $inputName;
		}
		if ($resolvedFieldName === '') {
			return null;
		}

		$rootPage = $hostPage;
		while ($rootPage instanceof \ProcessWire\RepeaterPage) {
			$forPage = $rootPage->getForPage();
			if (!$forPage instanceof Page || $forPage->id <= 0) {
				break;
			}
			$rootPage = $forPage;
		}

		return array_merge($common, [
			'kind' => self::KIND,
			'fieldName' => $resolvedFieldName,
			'pageId' => (int) $hostPage->id,
			'rootPageId' => (int) $rootPage->id,
			'maxFiles' => 1,
		]);
	}

	/**
	 * Resolve the isolated disk directory path for a Page link field.
	 */
	public static function directoryPathFor(Page $page, string $fieldName): string
	{
		$safeField = preg_replace('/[^a-zA-Z0-9_]/', '', trim($fieldName)) ?: '';
		if ($page->id <= 0 || $safeField === '') {
			return '';
		}

		return rtrim($page->filesManager()->path(), '/') . '/links/' . $safeField . '/';
	}

	/**
	 * Resolve the public URL directory prefix for a Page link field.
	 */
	public static function directoryUrlFor(Page $page, string $fieldName): string
	{
		$safeField = preg_replace('/[^a-zA-Z0-9_]/', '', trim($fieldName)) ?: '';
		if ($page->id <= 0 || $safeField === '') {
			return '';
		}

		return rtrim($page->filesManager()->url(), '/') . '/links/' . $safeField . '/';
	}

	/**
	 * Hydrate `Pagefiles` / `Pageimages` for an existing Page link field directory.
	 */
	public static function createPagefiles(
		Page $ownerPage,
		string $fieldName,
		bool $isImage,
		string $currentFilename = '',
		bool $includePending = false,
	): Pagefiles {
		$virtualHost = new PageLinkVirtualHost($ownerPage, $fieldName);
		$ownerPage->wire($virtualHost);

		$pagefiles = $isImage ? new Pageimages($virtualHost) : new Pagefiles($virtualHost);
		$ownerPage->wire($pagefiles);

		$dir = $virtualHost->filesManager()->path();
		if ($dir === '' || !is_dir($dir)) {
			return $pagefiles;
		}

		$candidates = [];
		$cleanCurrent = basename(trim($currentFilename));
		if ($cleanCurrent !== '' && $cleanCurrent !== '.' && $cleanCurrent !== '..') {
			$candidates[] = $cleanCurrent;
		}

		if ($includePending) {
			$manifestFile = $dir . self::PENDING_MANIFEST;
			if (!is_link($manifestFile) && is_file($manifestFile)) {
				$rawManifest = (string) @file_get_contents($manifestFile);
				$decoded = json_decode($rawManifest, true, 32);
				if (is_array($decoded) && isset($decoded['files']) && is_array($decoded['files'])) {
					foreach ($decoded['files'] as $pendingName) {
						if (is_string($pendingName)) {
							$bn = basename(trim($pendingName));
							if ($bn !== '' && $bn !== '.' && $bn !== '..' && !in_array($bn, $candidates, true)) {
								$candidates[] = $bn;
							}
						}
					}
				}
			}
		}

		foreach ($candidates as $bn) {
			$fullPath = $dir . $bn;
			if (!is_link($fullPath) && is_file($fullPath)) {
				$pagefiles->add($fullPath);
			}
		}

		$pagefiles->resetTrackChanges(true);

		return $pagefiles;
	}

	/**
	 * Synchronize disk files inside `links/{fieldName}/` when a Page is saved:
	 * deletes superseded files/variations or removes the directory when switched to a non-media link.
	 */
	public static function syncSavedPageLinkMedia(Page $page, Field $field, mixed $rawLinkValue): void
	{
		if ($page->id <= 0) {
			return;
		}
		$dir = self::directoryPathFor($page, $field->name);
		if ($dir === '' || !is_dir($dir)) {
			return;
		}

		$filesTool = $page->wire()->files;
		$norm = InputfieldReactLink::normalizeValue($rawLinkValue);
		$profiles = InputfieldReactLink::resolveFieldMediaProfiles($field);
		$activeType = $norm['type'];
		$activeBasename = basename(trim($norm['file']));

		if (
			!isset($profiles[$activeType])
			|| $activeBasename === ''
			|| $activeBasename === '.'
			|| $activeBasename === '..'
			|| is_link($dir . $activeBasename)
			|| !is_file($dir . $activeBasename)
		) {
			$filesTool->rmdir($dir, true);
			return;
		}

		$manifestFile = $dir . self::PENDING_MANIFEST;
		if (is_link($manifestFile) || is_file($manifestFile)) {
			@unlink($manifestFile);
		}

		$activeImage = null;
		if (!empty($profiles[$activeType]['isImage'])) {
			$activeCollection = self::createPagefiles($page, $field->name, true, $activeBasename, false);
			$firstItem = $activeCollection->first();
			if ($firstItem instanceof Pageimage) {
				$activeImage = $firstItem;
			}
		}

		$entries = @scandir($dir) ?: [];
		foreach ($entries as $entry) {
			if ($entry === '.' || $entry === '..' || $entry === $activeBasename) {
				continue;
			}
			// Preserve direct metadata sidecars (`{basename}.colors.json`, `{basename}.lqip.webp`) and verified image variations
			if (str_starts_with($entry, $activeBasename . '.')) {
				continue;
			}
			if ($activeImage instanceof Pageimage && $activeImage->isVariation($entry) !== false) {
				continue;
			}
			$full = $dir . $entry;
			if (is_link($full) || is_file($full)) {
				@unlink($full);
			}
		}
	}

	/**
	 * @param array<string, mixed> $envelope
	 * @return array<string, mixed>
	 */
	public function resolveTargetContext(array $envelope, User $user, bool $requireEdit): array
	{
		$pageId = (int) ($envelope['pageId'] ?? 0);
		$rootPageId = (int) ($envelope['rootPageId'] ?? $pageId);
		$fieldName = trim((string) ($envelope['fieldName'] ?? ''));
		$profileKey = strtolower(trim((string) ($envelope['mediaProfile'] ?? 'file')));

		if ($pageId <= 0 || $fieldName === '') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('Invalid page link media identifier.'),
			];
		}

		$pages = $this->wire()->pages;
		$fields = $this->wire()->fields;

		$ownerPage = $pages->get($pageId);
		$field = $fields->get($fieldName);
		if (
			!$ownerPage instanceof Page
			|| $ownerPage instanceof NullPage
			|| $ownerPage->id <= 0
			|| $ownerPage->isTrash()
			|| !$field instanceof Field
			|| !InputfieldReactLink::isLinkField($field)
		) {
			return [
				'ok' => false,
				'status' => 404,
				'error' => $this->_('Target page link field not found.'),
			];
		}

		$rootPage = $ownerPage;
		if ($ownerPage instanceof \ProcessWire\RepeaterPage) {
			$hops = 0;
			while ($rootPage instanceof \ProcessWire\RepeaterPage && $hops < 16) {
				$hops++;
				$forPage = $rootPage->getForPage();
				if (!$forPage instanceof Page || $forPage instanceof NullPage || $forPage->id <= 0) {
					$rootPage = null;
					break;
				}
				$rootPage = $forPage;
			}
			if ($rootPage instanceof \ProcessWire\RepeaterPage) {
				$rootPage = null;
			}
			if (
				$rootPage instanceof Page
				&& $rootPageId > 0
				&& $rootPageId !== (int) $ownerPage->id
				&& $rootPageId !== (int) $rootPage->id
			) {
				$rootPage = null;
			}
		} elseif ($rootPageId > 0 && $rootPageId !== (int) $ownerPage->id) {
			$candidateRoot = $pages->get($rootPageId);
			$rootPage = ($candidateRoot instanceof Page && !$candidateRoot instanceof NullPage && $candidateRoot->id > 0)
				? $candidateRoot
				: null;
		}

		if (!$rootPage instanceof Page || $rootPage instanceof NullPage || $rootPage->id <= 0 || $rootPage->isTrash()) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => $this->_('You do not have permission to modify this link media field.'),
			];
		}

		if (!$user->isSuperuser()) {
			$canAccess = $requireEdit
				? ($ownerPage->editable($fieldName) && $rootPage->editable())
				: (($ownerPage->viewable($fieldName) || $ownerPage->editable($fieldName))
					&& ($rootPage === $ownerPage || $rootPage->viewable() || $rootPage->editable()));
			if (!$canAccess) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => $this->_('You do not have permission to modify this link media field.'),
				];
			}
		}

		$profiles = InputfieldReactLink::resolveFieldMediaProfiles($field);
		$profile = $profiles[$profileKey] ?? null;
		if ($profile === null) {
			return [
				'ok' => false,
				'status' => 400,
				'error' => $this->_('Requested media profile is not enabled on this link field.'),
			];
		}

		$isImage = !empty($profile['isImage']);
		$rawCurrent = $ownerPage->getUnformatted($fieldName);
		$normCurrent = InputfieldReactLink::normalizeValue($rawCurrent);
		$currentFile = $normCurrent['type'] === $profileKey ? $normCurrent['file'] : '';

		$dir = self::directoryPathFor($ownerPage, $fieldName);
		if ($requireEdit && $dir !== '' && !is_dir($dir)) {
			$this->wire()->files->mkdir($dir, true);
		}

		$pagefiles = self::createPagefiles($ownerPage, $fieldName, $isImage, $currentFile, true);

		$modules = $this->wire()->modules;
		/** @var InputfieldFile $inputfield */
		$inputfield = $isImage
			? ($modules->get('InputfieldImage') ?: new InputfieldImage())
			: ($modules->get('InputfieldFile') ?: new InputfieldFile());
		$this->wire($inputfield);
		$inputfield->attr('name', (string) ($envelope['inputName'] ?? $fieldName));
		$inputfield->set('extensions', implode(' ', $profile['extensions']));
		$inputfield->set('maxFiles', 1);
		if (($profile['maxFilesize'] ?? 0) > 0) {
			$inputfield->set('maxFilesize', (int) $profile['maxFilesize']);
		}
		$inputfield->attr('value', $pagefiles);

		return [
			'ok' => true,
			'kind' => self::KIND,
			'page' => $ownerPage,
			'rootPage' => $rootPage,
			'field' => $field,
			'fieldName' => $fieldName,
			'mediaProfile' => $profileKey,
			'isImage' => $isImage,
			'maxFiles' => 1,
			'extensions' => $profile['extensions'],
			'pagefiles' => $pagefiles,
			'inputfield' => $inputfield,
		];
	}

	/**
	 * @param array<string, mixed> $resolved
	 */
	public function persistPagefiles(array $resolved, Pagefiles $pagefiles, int $maxFiles): void
	{
		/** @var Page|null $ownerPage */
		$ownerPage = $resolved['page'] ?? null;
		$fieldName = (string) ($resolved['fieldName'] ?? '');
		if (!$ownerPage instanceof Page || $ownerPage->id <= 0 || $fieldName === '') {
			return;
		}

		$dir = self::directoryPathFor($ownerPage, $fieldName);
		if ($dir === '') {
			return;
		}
		if (!is_dir($dir)) {
			$this->wire()->files->mkdir($dir, true);
		}

		while ($maxFiles > 0 && $pagefiles->count() > $maxFiles) {
			$oldest = $pagefiles->first();
			if (!$oldest instanceof Pagefile) {
				break;
			}
			$pagefiles->remove($oldest);
		}

		$pagefiles->hookPageSave();

		$names = [];
		foreach ($pagefiles as $pf) {
			if ($pf instanceof Pagefile) {
				$names[] = $pf->basename();
			}
		}

		$manifestPath = $dir . self::PENDING_MANIFEST;
		if (is_link($manifestPath) || is_link(rtrim($dir, '/\\'))) {
			return;
		}
		if ($names === []) {
			if (is_file($manifestPath)) {
				@unlink($manifestPath);
			}
		} else {
			@file_put_contents(
				$manifestPath,
				(string) json_encode(['files' => $names, 'ts' => time()], JSON_UNESCAPED_SLASHES),
				LOCK_EX,
			);
		}
	}
}
