<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

use ProcessWire\Module;
use ProcessWire\React;
use Totoglu\React\Inertia\ProcessReact;

/**
 * Abstract Process controller backing the optional `ProcessReactWorkspace` (`Admin > Workspace`) hub module.
 */
abstract class WorkspaceLauncherProcess extends ProcessReact implements Module
{
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

	/**
	 * Return the versioned `dist/ProcessReactWorkspace.js` script URL to load after `dist/ReactInertia.js`.
	 *
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		return $this->react()->resolveModuleAssetUrl('ProcessReactWorkspace.js');
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

		return (string) $this->inertiaRender('ReactWorkspace/WorkspaceLauncher', [
			'title' => $title,
			'subtitle' => $subtitle,
			'searchQuery' => $initialQuery,
			'workspaces' => array_values($accessibleMap),
			'widgets' => array_values($accessibleWidgetsMap),
			'preferences' => $preferences,
			'prefsEndpoint' => $rootUrl . '/_react/workspace-prefs',
		]);
	}

	public function ___uninstall(): void
	{
		$this->react()->workspacePreferences()->purgeAll();
		parent::___uninstall();
	}
}
