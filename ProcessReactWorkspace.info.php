<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => 'Workspace',
	'version' => 31,
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
