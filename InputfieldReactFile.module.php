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
