<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\React\Workspace\WorkspaceLauncherProcess;

/**
 * ProcessReactWorkspace
 *
 * Optional unified Admin Workspace Dashboard (`Admin > Workspace`, `/processwire/workspace/`),
 * cross-module launcher, and customizable Bento widget board powered by `React`.
 *
 * Shipped inside `site/modules/React/` as an opt-in `Process` module (not auto-installed by `React`).
 * Downstream `ProcessReact` modules require only `'React'` and operate standalone at their own
 * `Setup > <Module>` admin URLs when `ProcessReactWorkspace` is uninstalled, or join the unified
 * workspace hub and top-bar switcher automatically when `ProcessReactWorkspace` is installed.
 */
class ProcessReactWorkspace extends WorkspaceLauncherProcess implements Module
{
	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => 'Workspace',
			'version' => 30,
			'summary' => 'Optional unified Admin Workspace Dashboard, cross-module launcher, and customizable widget board powered by React.',
			'href' => 'https://github.com/trk/React',
			'author' => 'Iskender TOTOGLU @trk @ukyo',
			'icon' => 'th-large',
			'singular' => true,
			'autoload' => false,
			'useNavJSON' => false,
			'permissionMethod' => 'checkAccess',
			'page' => [
				'name' => 'workspace',
				'parent' => '',
				'title' => 'Workspace',
			],
			'requires' => [
				'PHP>=8.4',
				'ProcessWire>=3.0.271',
				'Inertia',
				'React',
			],
		];
	}
}
