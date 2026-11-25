<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Table Viewport', __FILE__),
	'version' => 31,
	'summary' => __('Interactive data table with search, filters, inline editing, bulk actions, and pagination.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'table',
	'singular' => false,
	'autoload' => false,
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
