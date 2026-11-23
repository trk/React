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
use Totoglu\React\Icon\IconManager;
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
			if ((int) $input->get('modal') === 1 || (string) $input->post('_rw_modal') === '1') {
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

	/**
	 * Resolve the trailing-slashed admin URL for this `Process` controller, even in CLI or
	 * non-page requests where `$wire->page` is not the module's admin page.
	 */
	protected function resolveAdminProcessRootUrl(): string
	{
		$wire = $this instanceof Wire ? $this->wire() : null;
		if ($wire === null) {
			return '/';
		}

		$page = $wire->page;
		$processName = $this instanceof Process ? $this->className() : '';
		if ($page instanceof Page && $page->id > 0 && $processName !== '' && (string) $page->process === $processName && (string) $page->url !== '') {
			return rtrim((string) $page->url, '/') . '/';
		}

		if ($this instanceof Process && $processName !== '' && !str_contains($processName, '@anonymous')) {
			$moduleId = (int) $wire->modules->getModuleID($this);
			if ($moduleId > 0) {
				$adminPage = $wire->pages->findOne("template=admin, process={$moduleId}, include=all, check_access=0");
				if ($adminPage instanceof Page && $adminPage->id > 0 && (string) $adminPage->url !== '') {
					return rtrim((string) $adminPage->url, '/') . '/';
				}
			}
		}

		if ($page instanceof Page && $page->id > 0 && (string) $page->url !== '') {
			return rtrim((string) $page->url, '/') . '/';
		}

		return rtrim((string) ($wire->config->urls->admin ?: '/'), '/') . '/';
	}

	/**
	 * Resolve an admin flyout navigation icon (`rwv--*` vector class when enabled, or classic icon slug).
	 */
	protected function resolveAdminNavIcon(string $icon, string $fallbackIcon = 'circle', bool $requireRegistered = false): string
	{
		$cleanIcon = trim($icon);
		$cleanFallback = trim($fallbackIcon) !== '' ? trim($fallbackIcon) : 'circle';

		if ((bool) $this->react()->get('enableAdminVectorIcons')) {
			if ($cleanIcon !== '') {
				$prefixed = IconManager::toAdminPrefixedValue($cleanIcon);
				if ($prefixed !== '' && (!$requireRegistered || IconManager::isAdminIconRegistered($cleanIcon))) {
					return IconManager::sanitizeAdminIconClass($prefixed);
				}
			}

			$fallbackPrefixed = IconManager::toAdminPrefixedValue($cleanFallback);
			if ($fallbackPrefixed !== '') {
				return IconManager::sanitizeAdminIconClass($fallbackPrefixed);
			}
		}

		$candidate = $cleanIcon !== '' ? $cleanIcon : $cleanFallback;
		$stripped = IconManager::cleanIdentifier($candidate);
		if ($stripped !== '') {
			return $stripped;
		}

		return 'circle-o';
	}

	/**
	 * Ensure `executeNavJSON()` payloads always expose a non-empty root URL and clickable hrefs
	 * for Overview / root items across all ProcessWire AdminThemes.
	 *
	 * @param array<string, mixed> $data
	 * @return array<string, mixed>
	 */
	protected function normalizeAdminNavJSONData(array $data): array
	{
		$rootUrl = $this->resolveAdminProcessRootUrl();
		$rawDataUrl = is_string($data['url'] ?? null) ? trim($data['url']) : '';
		if ($rawDataUrl === '' || ($rawDataUrl === '/' && $rootUrl !== '/')) {
			$data['url'] = $rootUrl;
		}

		if (isset($data['list']) && is_array($data['list'])) {
			foreach ($data['list'] as $idx => $entry) {
				if (!is_array($entry)) {
					continue;
				}
				$entryUrl = is_string($entry['url'] ?? null) ? trim($entry['url']) : '';
				if ($entryUrl === '' || $entryUrl === './') {
					$entry['url'] = $rootUrl;
					$data['list'][$idx] = $entry;
				}
			}
		}

		return $data;
	}

	/**
	 * Build a normalized, entity-safe ProcessWire `executeNavJSON()` flyout response with
	 * clickable Overview/root links, registered vector icons, and clean section separators.
	 *
	 * @param list<array{
	 *   url: string,
	 *   label: string,
	 *   badge?: string|int|null,
	 *   icon?: string,
	 *   fallbackIcon?: string,
	 *   dynamicIcon?: bool,
	 *   separator?: bool,
	 *   class?: string
	 * }> $items
	 * @param array<string, mixed> $options
	 * @return string|array<string, mixed>
	 */
	protected function buildAdminNavJSON(array $items, array $options = []): string|array
	{
		$rootUrl = $this->resolveAdminProcessRootUrl();
		$decode = static fn(string $text): string => html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');

		$normalizedItems = [];
		foreach (array_values($items) as $idx => $item) {
			$rawUrl = trim((string) ($item['url'] ?? ''));
			$resolvedUrl = ($rawUrl === '' || $rawUrl === './') ? $rootUrl : $rawUrl;
			$label = $decode((string) ($item['label'] ?? ''));
			$rawBadge = $item['badge'] ?? '';
			$badge = is_int($rawBadge) ? (string) $rawBadge : $decode((string) $rawBadge);

			$rawIcon = trim((string) ($item['icon'] ?? ''));
			$fallbackIcon = trim((string) ($item['fallbackIcon'] ?? ''));
			$dynamicIcon = !empty($item['dynamicIcon']);
			$resolvedIcon = $rawIcon !== ''
				? $this->resolveAdminNavIcon($rawIcon, $fallbackIcon !== '' ? $fallbackIcon : 'circle', $dynamicIcon)
				: ($fallbackIcon !== '' ? $this->resolveAdminNavIcon($fallbackIcon, 'circle', false) : '');

			$classes = [];
			if ($idx > 0 && !empty($item['separator'])) {
				$classes[] = 'separator';
			}
			$extraClass = trim((string) ($item['class'] ?? ''));
			if ($extraClass !== '') {
				$classes[] = $extraClass;
			}

			$normalizedItems[] = [
				'id' => $resolvedUrl,
				'name' => $label,
				'label2' => $badge,
				'icon' => $resolvedIcon,
				'_class' => implode(' ', $classes),
			];
		}

		$wantsArray = !empty($options['getArray']);
		$mergedOptions = $options;
		$mergedOptions['items'] = $normalizedItems;
		$mergedOptions['itemLabel'] = 'name';
		$mergedOptions['itemLabel2'] = 'label2';
		$mergedOptions['edit'] = '{id}';
		$mergedOptions['iconKey'] = 'icon';
		$mergedOptions['classKey'] = '_class';
		$mergedOptions['sort'] = (bool) ($options['sort'] ?? false);
		$mergedOptions['getArray'] = true;

		$rawAdd = $options['add'] ?? null;
		if (!is_string($rawAdd) || trim($rawAdd) === '') {
			$mergedOptions['add'] = null;
		} else {
			$mergedOptions['add'] = trim($rawAdd);
			$rawAddIcon = is_string($options['addIcon'] ?? null) ? trim($options['addIcon']) : '';
			$mergedOptions['addIcon'] = $this->resolveAdminNavIcon($rawAddIcon !== '' ? $rawAddIcon : 'circle-plus', 'plus-circle');
			if (isset($options['addLabel']) && is_string($options['addLabel']) && trim($options['addLabel']) !== '') {
				$sanitizer = $this instanceof Wire ? $this->wire()->sanitizer : null;
				$plainAddLabel = $decode(trim($options['addLabel']));
				$mergedOptions['addLabel'] = $sanitizer !== null ? $sanitizer->entities1($plainAddLabel) : htmlspecialchars($plainAddLabel, ENT_QUOTES, 'UTF-8');
			}
		}

		$raw = parent::___executeNavJSON($mergedOptions);
		if (!is_array($raw)) {
			return $raw;
		}

		$data = $this->normalizeAdminNavJSONData($raw);
		if ($wantsArray) {
			return $data;
		}

		if ($this instanceof Wire && (bool) $this->wire()->config->ajax && !headers_sent()) {
			header('Content-Type: application/json; charset=utf-8');
			header('X-Content-Type-Options: nosniff');
		}

		return (string) json_encode(
			$data,
			JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
		);
	}
}
