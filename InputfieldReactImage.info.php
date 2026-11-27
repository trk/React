<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Image', __FILE__),
	'version' => 34,
	'summary' => __('Image studio field with instant upload, focal point, zoom, crop/rotate/flip, color palette extraction, multi-language alt text, tags, and custom details.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'picture-o',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
