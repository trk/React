<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Relation (M2A — Multi-Type)', __FILE__),
	'version' => 30,
	'summary' => __('Select and organize related items across multiple resource types (such as pages, entries, or users) in one field.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'random',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
