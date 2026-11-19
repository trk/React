<?php

declare(strict_types=1);

namespace Totoglu\React\Inertia;

use BackedEnum;
use ProcessWire\Page;
use ProcessWire\Process;
use ProcessWire\React;
use ProcessWire\Template;
use ProcessWire\Wire;
use Totoglu\Inertia\InteractWithInertia;
use Totoglu\Inertia\PageResponse;
use Totoglu\React\Workspace\WorkspaceDefinition;
use UnitEnum;

/**
 * InteractWithReact
 *
 * Composes `Totoglu\Inertia\InteractWithInertia` for `React` Admin `Process` controllers
 * (`ProcessReact` subclasses and the optional `ProcessReactWorkspace` hub).
 *
 * Automatically adapts between two execution contexts from a single React component:
 *  - **Classic Admin Process (`Setup > <Module>`, `shellMode === 'admin'`):** Runs natively through
 *    ProcessWire's `wire/core/admin.php` -> `Process::execute` pipeline inside whichever `AdminTheme`
 *    is active (`AdminThemeUikit`, `AdminThemeDefault`, `AdminThemeReno`, or custom `AdminTheme`),
 *    while preserving `X-Inertia` SPA navigation for internal module links and form submissions.
 *  - **Workspace Hub (`Admin > Workspace` / `?ws=1`, `shellMode === 'workspace'`):** Renders the
 *    standalone full-screen Workspace shell (`site/modules/React/views/admin.php`).
 */
trait InteractWithReact
{
	use InteractWithInertia {
		inertiaRender as private baseInertiaRender;
	}
	use InteractWithReactTranslations;

	/**
	 * Resolve the wired `React` module instance.
	 */
	public function react(): React
	{
		return React::instance($this instanceof Wire ? $this : null);
	}

	/**
	 * Use `React`'s standalone Admin Root View template when rendering in full-screen Workspace mode.
	 */
	public function inertiaRootView(): ?string
	{
		return dirname(__DIR__, 2) . '/views/admin.php';
	}

	/**
	 * Determine whether the current request should execute natively through `wire/core/admin.php`
	 * (`Process::execute`) so ProcessWire's active `AdminTheme` wraps the module panel.
	 */
	public function shouldEmbedInClassicAdmin(bool $requireHttpRuntime = true): bool
	{
		if ($requireHttpRuntime && PHP_SAPI === 'cli') {
			return false;
		}
		if (!$this instanceof Process) {
			return false;
		}

		$wire = $this->wire();
		if ((bool) $wire->config->ajax || $this->inertia()->request->isInertia()) {
			return false;
		}

		$page = $wire->page;
		if (!$page instanceof Page || !$page->template instanceof Template || $page->template->name !== 'admin') {
			return false;
		}

		return $this->react()->resolveShellMode($this) === 'admin';
	}

	/**
	 * Control whether `Inertia` bypasses `wire/core/admin.php` (`true` for Workspace mode and `X-Inertia`
	 * JSON visits; `false` for initial `Setup > <Module>` loads so ProcessWire's active `AdminTheme` runs,
	 * as well as JSON nav menus, modal dialogs, exports, and AJAX uploads).
	 */
	public function inertiaFullPageAdmin(): bool
	{
		if ($this instanceof Wire) {
			$input = $this->wire()->input;
			$seg1 = strtolower(trim((string) $input->urlSegment1));
			if (in_array($seg1, ['navjson', 'export', 'download-backup'], true)) {
				return false;
			}
			if ((int) $input->get('modal') === 1 || (string) $input->post('_rw_modal') === '1' || (string) $input->post('_we_modal') === '1') {
				return false;
			}
			if (trim((string) $input->get('export')) !== '' || trim((string) $input->get('download_token')) !== '') {
				return false;
			}
		}
		if (!empty($_SERVER['HTTP_X_FIELDNAME']) || isset($_GET['InputfieldFileAjax']) || isset($_POST['InputfieldFileAjax'])) {
			return false;
		}

		if ($this->shouldEmbedInClassicAdmin() && !$this->react()->isExecutingProcessController()) {
			return false;
		}

		return true;
	}

	/**
	 * Render a `PageResponse` bound to this `Process`, returning an `EmbeddedAdminPageResponse`
	 * during classic `wire/core/admin.php` `Process::execute` requests so the active `AdminTheme`
	 * wraps `<div id="app">` natively.
	 *
	 * @param array<string, mixed> $props
	 */
	public function inertiaRender(string|UnitEnum $component, array $props = []): PageResponse
	{
		if ($this instanceof Process && $this->shouldEmbedInClassicAdmin()) {
			if ($component instanceof BackedEnum) {
				$componentName = (string) $component->value;
			} elseif ($component instanceof UnitEnum) {
				$componentName = $component->name;
			} else {
				$componentName = $component;
			}

			$mergedProps = $this->inertiaProps !== []
				? array_replace($this->inertiaProps, $props)
				: $props;
			$currentPage = $this->wire()->page;

			return new EmbeddedAdminPageResponse(
				$this->inertia(),
				$componentName,
				$mergedProps,
				$currentPage instanceof Page ? $currentPage : null,
				$this
			);
		}

		return $this->baseInertiaRender($component, $props);
	}

	/**
	 * Return module-specific script URLs to load after `ReactInertia.js`.
	 *
	 * @return list<string>
	 */
	public function getModuleScriptAssets(): array
	{
		return [];
	}

	/**
	 * Return module-specific stylesheet URLs to load after `ReactInertia.css`.
	 *
	 * @return list<string>
	 */
	public function getModuleStyleAssets(): array
	{
		return [];
	}

	/**
	 * Share the canonical `workspace` shell context across all Inertia responses for this Process.
	 *
	 * @return array<string, mixed>
	 */
	public function inertiaShared(): array
	{
		return [
			'workspace' => fn(): array => $this->react()->buildInertiaSharedContext(
				$this instanceof Process ? $this : null,
				$this->resolveActiveWorkspaceDefinition()
			),
			...$this->buildReactTranslationSharedProps(),
		];
	}

	/**
	 * Provide Root View variables (`locale`, `title`, `themeMode`, `colorSchemeCss`, `head`, `scripts`)
	 * to `site/modules/React/views/admin.php` (and asset resolution in `EmbeddedAdminPageResponse`).
	 *
	 * @param array<string, mixed> $pageObject
	 * @return array<string, mixed>
	 */
	public function inertiaViewData(array $pageObject = []): array
	{
		$react = $this->react();
		$definition = $this->resolveActiveWorkspaceDefinition();
		$props = is_array($pageObject['props'] ?? null) ? $pageObject['props'] : [];
		$fallbackTitle = 'Admin';
		if ($definition instanceof WorkspaceDefinition && trim($definition->title) !== '') {
			$fallbackTitle = trim($definition->title);
		} elseif ($this instanceof Process) {
			$info = $this->wire()->modules->getModuleInfo($this);
			if (is_array($info) && is_string($info['title'] ?? null) && trim($info['title']) !== '') {
				$fallbackTitle = trim($info['title']);
			}
		}
		$pageTitle = is_string($props['title'] ?? null) && trim($props['title']) !== ''
			? trim($props['title'])
			: $fallbackTitle;

		return $react->buildInertiaRootViewData(
			title: $pageTitle,
			extraScripts: $this->getModuleScriptAssets(),
			extraStyles: $this->getModuleStyleAssets()
		);
	}

	protected function resolveActiveWorkspaceDefinition(): ?WorkspaceDefinition
	{
		if (method_exists($this, 'getWorkspaceDefinition')) {
			$def = $this->getWorkspaceDefinition();
			if ($def instanceof WorkspaceDefinition) {
				return $def;
			}
		}

		if ($this instanceof Wire) {
			$react = $this->react();
			if (!$react->isWorkspaceHubInstalled()) {
				return null;
			}
			$className = $this->className();
			foreach ($react->workspaces()->all() as $definition) {
				if ($definition->process === $className) {
					return $definition;
				}
			}
		}

		return null;
	}
}
