<?php

declare(strict_types=1);

namespace Totoglu\React\Inertia;

use ProcessWire\AdminTheme;
use ProcessWire\Breadcrumbs;
use ProcessWire\Inertia;
use ProcessWire\Notices;
use ProcessWire\Page;
use ProcessWire\Process;
use ProcessWire\React;
use Totoglu\Inertia\PageResponse;
use Totoglu\Inertia\Support\PropResolver;

/**
 * EmbeddedAdminPageResponse
 *
 * Renders an Inertia `PageResponse` inline inside ProcessWire's native `Process::execute`
 * (`wire/core/admin.php`) lifecycle so any active `AdminTheme` (`AdminThemeUikit`,
 * `AdminThemeDefault`, `AdminThemeReno`, or custom `AdminTheme` modules) wraps the React
 * `<div id="app">` mount container without touching `Inertia::$activePageResponse`.
 */
final class EmbeddedAdminPageResponse extends PageResponse
{
	public function __construct(
		private readonly Inertia $inertiaModule,
		string $component,
		array $props = [],
		?Page $page = null,
		?Process $process = null,
	) {
		parent::__construct($inertiaModule, $component, $props, $page, $process);
	}

	public function toOutput(): string
	{
		if ($this->inertiaModule->request->isInertia()) {
			return $this->inertiaModule->renderPageResponse($this);
		}

		$wire = $this->wire();
		$config = $wire->config;
		$sanitizer = $wire->sanitizer;
		$react = React::instance($this);

		$pageObject = $this->toPageObject();
		$this->inertiaModule->ensureXsrfCookie();

		$process = $this->getProcess();
		$processViewData = ($process instanceof Process && method_exists($process, 'inertiaViewData'))
			? (array) $process->inertiaViewData($pageObject)
			: [];
		$processWithViewData = ($process instanceof Process && method_exists($process, 'inertiaWithViewData'))
			? (array) $process->inertiaWithViewData($pageObject)
			: [];
		$responseViewData = (array) $this->getViewData();

		$viewData = PropResolver::mergeViewData(
			$processViewData,
			$processWithViewData,
			$responseViewData
		);

		$styles = is_array($viewData['styles'] ?? null)
			? $viewData['styles']
			: $react->resolveInertiaStyleAssets();
		foreach ($styles as $styleUrl) {
			if (is_string($styleUrl) && trim($styleUrl) !== '') {
				$config->styles->add(trim($styleUrl));
			}
		}

		$requestedScripts = is_array($viewData['scripts'] ?? null)
			? $viewData['scripts']
			: $react->resolveInertiaScriptAssets();
		$this->enqueueOrderedScripts($requestedScripts, $react);

		try {
			$react->icons()->ensureAdminCss();
		} catch (\Throwable) {
			// Ignore optional icon CSS failures
		}

		$wire->wire('processHeadline', '');
		if ($wire->breadcrumbs instanceof Breadcrumbs) {
			$wire->breadcrumbs->removeAll();
		}
		if ($wire->notices instanceof Notices) {
			$wire->notices->removeAll();
		}

		$themeMode = is_string($viewData['themeMode'] ?? null)
			? (string) $viewData['themeMode']
			: $react->resolveEffectiveThemeMode($wire->user);
		$resolvedThemeMode = in_array($themeMode, ['light', 'dark', 'system'], true) ? $themeMode : 'system';
		$colorSchemeCss = is_string($viewData['colorSchemeCss'] ?? null)
			? (string) $viewData['colorSchemeCss']
			: $react->resolveAdminColorSchemeCss();
		$adminRootAttr = (string) ($config->urls->admin ?: '/processwire/');
		$launcherPathAttr = (string) (parse_url($react->resolveLauncherUrl(), PHP_URL_PATH) ?: '');

		$safeThemeJson = (string) json_encode($resolvedThemeMode, JSON_HEX_TAG | JSON_UNESCAPED_SLASHES);
		$safeAdminRootJson = (string) json_encode($adminRootAttr, JSON_HEX_TAG | JSON_UNESCAPED_SLASHES);
		$safeLauncherPathJson = (string) json_encode($launcherPathAttr, JSON_HEX_TAG | JSON_UNESCAPED_SLASHES);

		$headFragments = [];
		if ($colorSchemeCss !== '') {
			$safeCss = (string) preg_replace('~<\s*/\s*style~i', '<\\/style', $colorSchemeCss);
			$headFragments[] = '<style id="pw-color-scheme-tokens">' . $safeCss . '</style>';
		}
		$headFragments[] = '<script>(function(){try{var d=document.documentElement;d.setAttribute("data-rw-shell-mode","admin");d.setAttribute("data-rw-admin-root",' . $safeAdminRootJson . ');d.setAttribute("data-rw-launcher-path",' . $safeLauncherPathJson . ');var m=' . $safeThemeJson . ';var dark=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);d.classList.toggle("dark",dark);d.classList.toggle("light",!dark);}catch(e){}})();</script>';

		$extraHead = implode("\n", $headFragments);
		$adminTheme = $wire->adminTheme;
		if ($adminTheme instanceof AdminTheme) {
			$adminTheme->addExtraMarkup('head', $extraHead);
			$inlineBootstrap = '';
		} else {
			$inlineBootstrap = $extraHead . "\n";
		}

		$safeShellAttr = $sanitizer->entities('admin');

		return $inlineBootstrap . '<div class="pw-react-process-host" data-rw-process-host="' . $safeShellAttr . '">' . "\n\t"
			. $this->inertiaModule->app($pageObject) . "\n"
			. '</div>';
	}

	/**
	 * Ensure `dist/ReactInertia.js` precedes all module and island scripts in `$config->scripts`
	 * while keeping ProcessWire core `/wire/` scripts (`JqueryCore`, `JqueryUI`, etc.) first.
	 *
	 * @param array<int, mixed> $requestedScripts
	 */
	private function enqueueOrderedScripts(array $requestedScripts, React $react): void
	{
		$configScripts = $this->wire()->config->scripts;
		$existingUrls = [];
		foreach ($configScripts as $existingUrl) {
			if (is_string($existingUrl) && trim($existingUrl) !== '') {
				$existingUrls[] = trim($existingUrl);
			}
		}

		$coreRuntimeAssets = $react->resolveModuleAssetUrl('ReactInertia.js');
		$reactInertiaUrl = $coreRuntimeAssets[0] ?? '';

		$wireScripts = [];
		$moduleScripts = [];
		$seenClean = [];

		$addUnique = static function (string $url, array &$bucket) use (&$seenClean): void {
			$clean = strtok($url, '?') ?: $url;
			if (isset($seenClean[$clean])) {
				return;
			}
			$seenClean[$clean] = true;
			$bucket[] = $url;
		};

		foreach ($existingUrls as $url) {
			$clean = strtok($url, '?') ?: $url;
			if (str_contains($clean, '/ReactInertia.js')) {
				if ($reactInertiaUrl === '') {
					$reactInertiaUrl = $url;
				}
				continue;
			}
			if (str_contains($clean, '/site/modules/')) {
				$addUnique($url, $moduleScripts);
			} else {
				$addUnique($url, $wireScripts);
			}
		}

		foreach ($requestedScripts as $reqUrl) {
			if (!is_string($reqUrl) || trim($reqUrl) === '') {
				continue;
			}
			$trimmed = trim($reqUrl);
			$clean = strtok($trimmed, '?') ?: $trimmed;
			if (str_contains($clean, '/ReactInertia.js')) {
				if ($reactInertiaUrl === '') {
					$reactInertiaUrl = $trimmed;
				}
				continue;
			}
			$addUnique($trimmed, $moduleScripts);
		}

		$configScripts->removeAll();
		foreach ($wireScripts as $url) {
			$configScripts->add($url);
		}
		if ($reactInertiaUrl !== '') {
			$configScripts->add($reactInertiaUrl);
		}
		foreach ($moduleScripts as $url) {
			$configScripts->add($url);
		}
	}
}
