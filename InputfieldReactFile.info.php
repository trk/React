<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React File', __FILE__),
	'version' => 34,
	'summary' => __('File upload and management field supporting drag-and-drop, reordering, file replacement, multi-language descriptions, tags, and custom details.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'file-text-o',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
