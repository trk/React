<?php // __(file-not-translatable)

declare(strict_types=1);

$projectRoot = dirname(__DIR__, 4);
if (is_file($projectRoot . '/index.php') && !\ProcessWire\ProcessWire::getCurrentInstance()) {
	require_once $projectRoot . '/index.php';
}

require_once __DIR__ . '/bootstrap.php';
