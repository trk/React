<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Relation (M2O — Single)', __FILE__),
	'version' => 30,
	'summary' => __('Select a single related record using a dropdown, radio cards, searchable autocomplete, tree picker, or slide-out browser.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'link',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
