<?php

declare(strict_types=1);

namespace Totoglu\React\Security;

use ProcessWire\Field;
use ProcessWire\FieldtypeLanguageInterface;
use ProcessWire\Language;
use ProcessWire\Languages;
use ProcessWire\Page;
use ProcessWire\ProcessWire;
use ProcessWire\User;

/**
 * Canonical authentication checks shared by every `/_react/*` gateway, registry, and per-user store.
 */
final class AccessGuard
{
	/**
	 * Determine whether a user is a real, logged-in account (never the guest user or an unsaved user).
	 */
	public static function isAuthenticated(User $user): bool
	{
		$id = (int) $user->id;
		if ($id <= 0 || $user->isGuest() || (string) $user->name === 'guest') {
			return false;
		}

		return $id !== (int) ($user->wire()->config->guestUserPageID ?: 40);
	}

	/**
	 * Determine whether a user may use authenticated workspace features (superusers always qualify).
	 */
	public static function isAuthenticatedOrSuperuser(User $user): bool
	{
		return $user->isSuperuser() || self::isAuthenticated($user);
	}

	/**
	 * Enforce ProcessWire multi-language field editability (`page-edit-lang-none` / `page-edit-lang-{name}`)
	 * for single-language and language-alternate fields across gateways and data providers.
	 */
	public static function canEditFieldByLanguage(ProcessWire $wire, Page $page, Field $field, ?User $user = null): bool
	{
		$resolvedUser = $user ?? $wire->user;
		if ($field->type instanceof FieldtypeLanguageInterface || $resolvedUser->isSuperuser()) {
			return true;
		}

		$languages = $wire->languages;
		if (!$languages instanceof Languages) {
			return true;
		}

		$fieldName = (string) $field->name;
		$matchedLang = null;

		if ($wire->modules->isInstalled('LanguageSupportFields')) {
			$lsf = $wire->modules->get('LanguageSupportFields');
			if (is_object($lsf) && method_exists($lsf, 'isAlternateField')) {
				$altResult = $lsf->isAlternateField($fieldName);
				if ($altResult instanceof Language && $altResult->id > 0) {
					$matchedLang = $altResult;
				}
			}
		}

		if ($matchedLang === null) {
			foreach ($languages as $altLang) {
				if (!$altLang instanceof Language || $altLang->isDefault() || $altLang->name === '') {
					continue;
				}
				$suffix = '_' . $altLang->name;
				if (
					str_ends_with($fieldName, $suffix)
					&& strlen($fieldName) > strlen($suffix)
					&& $page->hasField(substr($fieldName, 0, -strlen($suffix)))
				) {
					$matchedLang = $altLang;
					break;
				}
				if ($page->hasField($fieldName . $suffix)) {
					$matchedLang = $languages->getDefault();
					break;
				}
			}
		}

		$previousUser = $wire->user;
		$switched = (int) $previousUser->id !== (int) $resolvedUser->id;
		if ($switched) {
			$wire->users->setCurrentUser($resolvedUser);
		}
		try {
			if ($matchedLang instanceof Language && $matchedLang->id > 0) {
				return (bool) $languages->editable($matchedLang);
			}

			return (bool) $languages->editable('none');
		} finally {
			if ($switched) {
				$wire->users->setCurrentUser($previousUser);
			}
		}
	}
}
