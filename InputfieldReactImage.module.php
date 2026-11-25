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
