<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Relation (O2M — Reverse / Incoming)', __FILE__),
	'version' => 35,
	'summary' => __('Display and manage records linking back to this item (as a table, cards, or list), with quick create, link, and unlink actions.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'exchange',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
