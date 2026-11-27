<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Key-Value Pairs', __FILE__),
	'version' => 34,
	'summary' => __('Manage ordered key-value pairs for custom attributes, metadata, or specifications.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'list-ul',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
