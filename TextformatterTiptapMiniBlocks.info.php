<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('Tiptap Mini-Blocks Renderer', __FILE__),
	'version' => 33,
	'summary' => __('Renders inline content blocks from the Tiptap rich text editor using templates in ./site/templates/tiptap/.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'cubes',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
