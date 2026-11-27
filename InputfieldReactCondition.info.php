<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Condition Builder', __FILE__),
	'version' => 34,
	'summary' => __('Visual rule and condition builder with AND/OR groups, categorized field sources, value-or-field comparisons, and live summaries.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'code-fork',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
