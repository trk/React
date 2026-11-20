<?php

declare(strict_types=1);

namespace Totoglu\React\Security;

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
}
