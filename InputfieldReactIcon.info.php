<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Icon', __FILE__),
	'version' => 33,
	'summary' => __('Searchable vector icon picker with optional style, size, color, stroke width, and badge customization.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'puzzle-piece',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
