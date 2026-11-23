<?php

declare(strict_types=1);

namespace Totoglu\React\Inertia;

use ProcessWire\Module;
use Totoglu\Inertia\ProcessInertia;

/**
 * ProcessReact
 *
 * Base ProcessWire `Process` controller class for `React` Admin modules and workspaces.
 * Extends `Totoglu\Inertia\ProcessInertia` and composes `InteractWithReact` so
 * admin `Process` controllers (`ProcessWire*` and the optional `ProcessReactWorkspace` hub)
 * automatically adapt a single React view across native `Setup > <Module>` execution
 * (`EmbeddedAdminPageResponse` inside ProcessWire's active `AdminTheme`) and full-screen
 * `Admin > Workspace` execution (`React/views/admin.php`), inheriting `--pw-*` theme tokens,
 * shared `workspace` shell context, `OnceProp` `i18n` catalogs, and `ReactInertia.js/css`.
 */
abstract class ProcessReact extends ProcessInertia implements Module
{
	use InteractWithReact;

	/**
	 * Guard core `Process::init()` asset auto-discovery against anonymous PHP classes containing NUL bytes (`\0`).
	 */
	public function init(): void
	{
		if (!str_contains(static::class, "\0")) {
			parent::init();
		}
	}

	/**
	 * Normalize classic AdminTheme flyout navigation JSON so root/Overview items
	 * always emit a clickable root URL instead of an empty string (`""`).
	 *
	 * @param array<string, mixed> $options
	 * @return string|array<string, mixed>
	 */
	public function ___executeNavJSON(array $options = []): string|array
	{
		$baseOptions = $options;
		$baseOptions['getArray'] = true;
		$raw = parent::___executeNavJSON($baseOptions);
		if (!is_array($raw)) {
			return $raw;
		}

		$data = $this->normalizeAdminNavJSONData($raw);
		if (!empty($options['getArray'])) {
			return $data;
		}

		$config = $this->wire()->config;
		if ((bool) $config->ajax && !headers_sent()) {
			header('Content-Type: application/json; charset=utf-8');
			header('X-Content-Type-Options: nosniff');
		}

		return (string) json_encode(
			$data,
			JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
		);
	}
}
