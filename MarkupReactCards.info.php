<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Cards Viewport', __FILE__),
	'version' => 31,
	'summary' => __('Interactive responsive card grid with search, filters, bulk actions, and pagination.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'th-large',
	'singular' => false,
	'autoload' => false,
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
