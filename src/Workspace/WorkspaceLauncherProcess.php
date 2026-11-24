<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

use ProcessWire\Module;
use ProcessWire\React;
use ProcessWire\Wire404Exception;
use ProcessWire\WirePermissionException;
use Totoglu\React\Inertia\ProcessReact;

/**
 * Abstract Process controller backing the optional `ProcessReactWorkspace` (`Admin > Workspace`) hub module.
 */
abstract class WorkspaceLauncherProcess extends ProcessReact implements Module
{
	/** @var list<string> */
	private const array SHOWCASE_SECTIONS = ['all', 'media', 'links', 'relations', 'datetime', 'contexts', 'controls', 'primitives'];

	/** @var list<string> */
	private const array SHOWCASE_THEMES = ['auto', 'light', 'dark'];

	/**
	 * Dynamic permission callback for `Admin > Workspace`: grants access when the user is a superuser
	 * or has access to at least one registered workspace.
	 *
	 * @param array<string, mixed> $data
	 */
	public static function checkAccess(array $data = []): bool
	{
		return React::checkAccess($data);
	}

	private function isUiShowcaseRequest(): bool
	{
		return strtolower(trim((string) $this->wire()->input->urlSegment1)) === 'ui-showcase';
	}

	public function inertiaFullPageAdmin(): bool
	{
		if ($this->isUiShowcaseRequest() && trim((string) $this->wire()->input->get('sample')) !== '') {
			return false;
		}

		return parent::inertiaFullPageAdmin();
	}

	/**
	 * Return the versioned script URLs to load after `dist/ReactInertia.js`.
	 *
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		$react = $this->react();
		if (!$this->isUiShowcaseRequest()) {
			return $react->resolveModuleAssetUrl('ProcessReactWorkspace.js');
		}

		$urls = [];
		foreach ([
			'SchemaForm.js',
			'ReactExtraFields.js',
			'ReactMedia.js',
			'InputfieldReactImage.js',
			'InputfieldReactFile.js',
			'InputfieldReactLink.js',
			'InputfieldReactRelation.js',
			'InputfieldReactKeyValue.js',
			'InputfieldReactIcon.js',
			'MarkupReactTab.js',
			'MarkupReactTable.js',
			'MarkupReactCards.js',
			'TiptapCore.js',
			'TiptapEditor.js',
			'ReactUiShowcase.js',
		] as $asset) {
			foreach ($react->resolveModuleAssetUrl($asset) as $url) {
				$urls[] = $url;
			}
		}

		return $urls;
	}

	/**
	 * Return additional isolated stylesheets required for the debug-only UI Showcase route.
	 *
	 * @return list<string>
	 */
	public function getModuleStyleAssets(): array
	{
		if (!$this->isUiShowcaseRequest()) {
			return [];
		}

		$react = $this->react();
		$urls = [];
		foreach (['ReactMedia.css', 'TiptapCore.css'] as $styleAsset) {
			foreach ($react->resolveModuleAssetUrl($styleAsset) as $url) {
				$urls[] = $url;
			}
		}

		return $urls;
	}

	/**
	 * Render the `Admin > Workspace` (`ReactWorkspace/WorkspaceLauncher`) dashboard and directory page via Inertia.
	 */
	public function ___execute(): string
	{
		$react = $this->react();
		$input = $this->wire()->input;
		$user = $this->wire()->user;

		if ($input->requestMethod('POST')) {
			$payload = $react->readJsonRequestBody() ?? [];
			if ($payload === []) {
				$post = $input->post->getArray();
				if (is_array($post) && $post !== []) {
					$payload = $post;
				}
			}
			if (isset($payload['action'])) {
				$react->handleWorkspacePrefsAction($payload, true, $user);
			}
		}

		$title = html_entity_decode($this->_('Workspace'), ENT_QUOTES | ENT_HTML5, 'UTF-8');
		$subtitle = html_entity_decode(
			$this->_('Manage site content, menus, forms, SEO, API access, and system operations from your personalized dashboard.'),
			ENT_QUOTES | ENT_HTML5,
			'UTF-8'
		);

		$initialQuery = trim((string) ($input->get('q') ?? ''));
		$accessibleMap = $react->workspaces()->accessible($user);
		$accessibleWidgetsMap = $react->widgets()->accessible($user);
		$preferences = $react->workspacePreferences()->reconcile(
			$accessibleMap,
			$accessibleWidgetsMap,
			$user
		);
		$rootUrl = rtrim((string) ($this->wire()->config->urls->root ?: '/'), '/');
		$processRootUrl = rtrim($this->resolveAdminProcessRootUrl(), '/');
		$isDebugShowcaseVisible = $user->isSuperuser() && (bool) $this->wire()->config->debug;

		return (string) $this->inertiaRender('ReactWorkspace/WorkspaceLauncher', [
			'title' => $title,
			'subtitle' => $subtitle,
			'searchQuery' => $initialQuery,
			'workspaces' => array_values($accessibleMap),
			'widgets' => array_values($accessibleWidgetsMap),
			'preferences' => $preferences,
			'prefsEndpoint' => $rootUrl . '/_react/workspace-prefs',
			'debugShowcaseUrl' => $isDebugShowcaseVisible ? $processRootUrl . '/ui-showcase/' : '',
			'debugShowcaseLabel' => html_entity_decode($this->_('UI Showcase'), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
		]);
	}

	/**
	 * Render the superuser + debug-only UI Showcase studio and serve safe sample SVG assets (`?sample=<variant>`).
	 */
	public function ___executeUiShowcase(): string
	{
		$user = $this->wire()->user;
		$config = $this->wire()->config;
		if (!$user->isSuperuser() || !(bool) $config->debug) {
			throw new WirePermissionException(
				$this->_('UI Showcase is available only to superusers when debug mode is active.')
			);
		}

		$input = $this->wire()->input;
		$sampleParam = trim((string) $input->get('sample'));
		if ($sampleParam !== '') {
			$svg = UiShowcaseAssets::renderSampleSvg($sampleParam);
			if ($svg === null) {
				throw new Wire404Exception('Unknown UI Showcase sample asset.');
			}
			if (PHP_SAPI !== 'cli') {
				if (!headers_sent()) {
					header('Content-Type: image/svg+xml; charset=utf-8');
					header("Content-Security-Policy: default-src 'none'; sandbox");
					header('X-Content-Type-Options: nosniff');
					header('Cache-Control: private, max-age=3600');
				}
				echo $svg;
				exit;
			}

			return $svg;
		}

		$rawSection = strtolower(trim((string) $input->get('section')));
		$initialSection = in_array($rawSection, self::SHOWCASE_SECTIONS, true) ? $rawSection : 'all';

		$rawTheme = strtolower(trim((string) $input->get('theme')));
		$initialTheme = in_array($rawTheme, self::SHOWCASE_THEMES, true) ? $rawTheme : 'auto';

		$embedded = (string) $input->get('embed') === '1';
		$processRootUrl = rtrim($this->resolveAdminProcessRootUrl(), '/');
		$workspaceUrl = $processRootUrl . '/';
		$showcaseUrl = $processRootUrl . '/ui-showcase/';

		return (string) $this->inertiaRender('ReactWorkspace/UiShowcase', [
			'title' => html_entity_decode($this->_('UI Showcase'), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
			'subtitle' => html_entity_decode(
				$this->_('Inspect form controls, media, links, relations, and UI primitives across responsive viewports.'),
				ENT_QUOTES | ENT_HTML5,
				'UTF-8'
			),
			'embedded' => $embedded,
			'initialSection' => $initialSection,
			'initialTheme' => $initialTheme,
			'workspaceUrl' => $workspaceUrl,
			'showcaseUrl' => $showcaseUrl,
			'sampleBaseUrl' => $showcaseUrl . '?sample=',
		]);
	}

	public function ___uninstall(): void
	{
		parent::___uninstall();
	}
}
