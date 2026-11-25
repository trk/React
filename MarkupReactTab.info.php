<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Tab Viewport & Container', __FILE__),
	'version' => 30,
	'summary' => __('Organize fields and panels into accessible tabs (line, segmented, or vertical layout).', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'folder-o',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
