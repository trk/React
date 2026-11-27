<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Relation (M2M — Multiple)', __FILE__),
	'version' => 34,
	'summary' => __('Select and reorder multiple related records using multi-select, checkboxes, autocomplete, tree picker, dual-list transfer, or a slide-out browser.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'sitemap',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
