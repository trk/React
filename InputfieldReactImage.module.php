<?php

declare(strict_types=1);

namespace ProcessWire;

use Totoglu\Inertia\Contracts\InertiaSerializable;
use Totoglu\React\Media\InteractWithReactMediaInputfield;

/**
 * InputfieldReactImage
 *
 * Modern React 19 + Inertia v3 Image Studio Inputfield (`extends InputfieldImage`) powered by `React`.
 *
 * Works natively with ProcessWire's core `FieldtypeImage` (selectable under `Details > Inputfield Type > React Image`
 * or globally via `React::useReactMediaFields`), classic `ProcessPageEdit` forms (including
 * Repeaters and custom per-file `fileSchema` fields), and registered `MediaHostAdapterInterface` entity hosts.
 */
class InputfieldReactImage extends InputfieldImage implements InertiaSerializable
{
	use InteractWithReactMediaInputfield;

	/**
	 * @return array<string, mixed>
	 */
	public static function getModuleInfo(): array
	{
		return [
			'title' => __('React Image', __FILE__),
			'version' => 30,
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
	}

	public function init(): void
	{
		parent::init();
		if ($this->getSetting('focusMode') === null || $this->getSetting('focusMode') === '') {
			$this->set('focusMode', 'zoom');
		}
		if ($this->getSetting('gridRatio') === null || $this->getSetting('gridRatio') === '') {
			$this->set('gridRatio', '4:3');
		}
		if ($this->getSetting('minFiles') === null) {
			$this->set('minFiles', 0);
		}
	}

	protected function isReactImageField(): bool
	{
		return true;
	}

	public function inertiaComponent(): string
	{
		return 'InputfieldReactImage';
	}
}
