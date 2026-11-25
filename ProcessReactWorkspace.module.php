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
}
