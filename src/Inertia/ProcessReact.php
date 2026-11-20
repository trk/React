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
			header('Content-Type: application/json');
		}

		return (string) json_encode($data);
	}
}
