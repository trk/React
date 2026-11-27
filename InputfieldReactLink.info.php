<?php

declare(strict_types=1);

namespace ProcessWire;

return [
	'title' => __('React Link & Media Target', __FILE__),
	'version' => 33,
	'summary' => __('All-in-one link and media selector supporting Pages, URLs, Phone numbers, Email addresses, custom resources, and uploaded files, images, or videos.', __FILE__),
	'author' => 'Iskender TOTOGLU @trk @ukyo',
	'icon' => 'link',
	'requires' => [
		'PHP>=8.4',
		'ProcessWire>=3.0.271',
		'Inertia',
		'React',
	],
];
