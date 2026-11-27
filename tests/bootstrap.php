<?php // __(file-not-translatable)

declare(strict_types=1);

namespace ProcessWire;

if (PHP_SAPI === 'cli') {
	@ini_set('memory_limit', '1G');
}

/**
 * Ensure React and its companion modules from `site/modules/React` are booted for testing.
 */
function bootReactForTesting(): React
{
	$reactModuleDir = dirname(__DIR__);
	$classLoader = wire('classLoader');
	if ($classLoader instanceof WireClassLoader) {
		$classLoader->addNamespace('Totoglu\\React', $reactModuleDir . '/src/');
	}

	if (!class_exists(React::class, false)) {
		require_once $reactModuleDir . '/React.module.php';
	}
	if (!class_exists(ProcessReactWorkspace::class, false)) {
		require_once $reactModuleDir . '/ProcessReactWorkspace.module.php';
	}

	$modules = wire('modules');

	if ($modules->isInstalled('Inertia')) {
		$modules->get('Inertia');
	}

	$react = wire('react');
	if (!$react instanceof React) {
		if ($modules->isInstalled('React')) {
			/** @var React|null $installedReact */
			$installedReact = $modules->getModule('React', ['noPermissionCheck' => true]);
			$react = $installedReact;
		}
		if (!$react instanceof React) {
			$react = new React();
			wire($react);
			$react->wired();
			$react->init();
		}
	}

	$modules->files->setConfigPaths('React', $reactModuleDir);
	$modules->set('React', $react);
	wire()->fuel->set('react', $react);

	$companions = [
		'MarkupReactTable' => MarkupReactTable::class,
		'MarkupReactCards' => MarkupReactCards::class,
		'MarkupReactTab' => MarkupReactTab::class,
		'InputfieldReactKeyValue' => InputfieldReactKeyValue::class,
		'InputfieldReactCondition' => InputfieldReactCondition::class,
		'InputfieldReactM2O' => InputfieldReactM2O::class,
		'InputfieldReactM2M' => InputfieldReactM2M::class,
		'InputfieldReactO2M' => InputfieldReactO2M::class,
		'InputfieldReactM2A' => InputfieldReactM2A::class,
		'InputfieldTiptap' => InputfieldTiptap::class,
		'InputfieldReactFile' => InputfieldReactFile::class,
		'InputfieldReactImage' => InputfieldReactImage::class,
		'InputfieldReactLink' => InputfieldReactLink::class,
		'InputfieldReactIcon' => InputfieldReactIcon::class,
		'TextformatterTiptapMiniBlocks' => TextformatterTiptapMiniBlocks::class,
	];

	foreach ($companions as $modName => $modClass) {
		if (!class_exists($modClass, false)) {
			require_once $reactModuleDir . '/' . $modName . '.module.php';
		}
		$modules->files->setConfigPaths($modName, $reactModuleDir);
		$existing = $modules->offsetGet($modName);
		if (!$existing instanceof $modClass) {
			$instance = new $modClass();
			wire($instance);
			$instance->init();
			$modules->set($modName, $instance);
		}
	}

	$input = wire('input');
	if ($input instanceof WireInput) {
		$input->get->removeAll();
		$input->post->removeAll();
	}

	$languages = wire('languages');
	if ($languages instanceof Languages) {
		$defaultLang = $languages->getDefault();
		if ($defaultLang instanceof Language) {
			$currentUser = wire('user');
			if ($currentUser instanceof User) {
				$currentUser->language = $defaultLang;
			}
			$superId = (int) (wire('config')->superUserPageID ?: 41);
			$superUser = wire('users')->get($superId);
			if ($superUser instanceof User && $superUser->id > 0) {
				$superUser->language = $defaultLang;
			}
		}
	}

	return $react;
}

bootReactForTesting();
