<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\Inertia\Contracts\InertiaSerializable;
use Totoglu\React\Media\InteractWithReactMediaInputfield;

/**
 * InputfieldReactFile
 *
 * Modern React 19 + Inertia v3 File Inputfield (`extends InputfieldFile`) powered by `React`.
 *
 * Works natively with ProcessWire's core `FieldtypeFile` (selectable under `Details > Inputfield Type > React File`
 * or globally via `React::useReactMediaFields`), classic `ProcessPageEdit` forms (including
 * Repeaters and custom per-file `fileSchema` fields), and registered `MediaHostAdapterInterface` entity hosts.
 */
class InputfieldReactFile extends InputfieldFile implements InertiaSerializable
{
	use InteractWithReactMediaInputfield;

	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => __('React File', __FILE__),
			'version' => 20,
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
	}

	public function init(): void
	{
		parent::init();
		if ($this->getSetting('minFiles') === null) {
			$this->set('minFiles', 0);
		}
	}

	protected function isReactImageField(): bool
	{
		return false;
	}

	public function inertiaComponent(): string
	{
		return 'InputfieldReactFile';
	}
}
