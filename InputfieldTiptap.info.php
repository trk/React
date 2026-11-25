<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('Tiptap', __FILE__),
	'version' => 31,
	'summary' => __('Rich text editor with customizable toolbars, content blocks, HTML cleanup, and multi-language support.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'align-left',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
