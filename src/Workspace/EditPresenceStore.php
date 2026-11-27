<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

use ProcessWire\User;
use ProcessWire\Wire;
use Totoglu\React\Security\AccessGuard;

/**
 * File-backed concurrent edit presence & remote-save tracker (`site/assets/cache/React/presence/*.json`).
 *
 * Tracks active admin editors per canonical `resourceKey` using short-lived heartbeats and atomic `flock()` file locks,
 * enabling live co-editor awareness banners and stale-form remote-save alerts across `ProcessReact` and `Wire*` workspaces.
 */
final class EditPresenceStore extends Wire
{
	private const CACHE_FOLDER = 'React/presence';
	public const DEFAULT_TTL_SECONDS = 45;
	public const HEARTBEAT_INTERVAL_SECONDS = 15;
	private const STALE_FILE_MAX_AGE_SECONDS = 3600;
	private const int MAX_SESSIONS_PER_USER = 8;
	private const int MAX_SESSIONS_PER_RESOURCE = 100;
	public const int MAX_PRESENCE_FILES = 2000;

	/**
	 * Resolve the directory path where per-resource presence JSON files are stored.
	 */
	public function directoryPath(): string
	{
		$cacheRoot = rtrim((string) ($this->wire()->config->paths->cache ?: dirname(__DIR__, 4) . '/assets/cache'), '/\\');

		return $cacheRoot . '/' . self::CACHE_FOLDER . '/';
	}

	/**
	 * Normalize and validate a canonical `resourceKey`.
	 */
	public function sanitizeResourceKey(string $raw): string
	{
		$trimmed = trim($raw);
		if ($trimmed === '') {
			return '';
		}

		$clean = (string) preg_replace('/[^a-zA-Z0-9:_.\-\/]/', '', $trimmed);

		return substr($clean, 0, 180);
	}

	/**
	 * Resolve the hashed JSON file path for a sanitized `resourceKey`.
	 */
	public function filePath(string $resourceKey): string
	{
		$cleanKey = $this->sanitizeResourceKey($resourceKey);
		if ($cleanKey === '') {
			return '';
		}

		return $this->directoryPath() . hash('sha256', $cleanKey) . '.json';
	}

	/**
	 * Record an active editing heartbeat for `$user` on `$resourceKey` and return active co-editors and latest save metadata.
	 *
	 * @return array{
	 *     resourceKey: string,
	 *     serverTime: int,
	 *     ttlSeconds: int,
	 *     heartbeatSeconds: int,
	 *     coEditors: list<array{
	 *         userId: int,
	 *         userName: string,
	 *         displayName: string,
	 *         startedAt: int,
	 *         lastSeenAt: int,
	 *         secondsAgo: int
	 *     }>,
	 *     lastSaved: array{
	 *         version: int,
	 *         savedAt: int,
	 *         userId: int,
	 *         userName: string,
	 *         displayName: string
	 *     }|null
	 * }
	 */
	public function heartbeat(
		string $resourceKey,
		User $user,
		string $clientId = '',
		int $ttlSeconds = self::DEFAULT_TTL_SECONDS,
		?int $nowOverride = null,
	): array {
		$cleanKey = $this->sanitizeResourceKey($resourceKey);
		$userId = $this->resolveUserId($user);
		$now = $nowOverride ?? time();
		$effectiveTtl = max(10, min(300, $ttlSeconds));

		if ($cleanKey === '' || $userId <= 0) {
			return $this->emptySnapshot($cleanKey, $now, $effectiveTtl);
		}

		$safeClientId = $this->sanitizeClientId($clientId);
		$sessionKey = $userId . ':' . ($safeClientId !== '' ? $safeClientId : 'default');
		$userName = (string) $user->name;
		$displayName = $this->resolveDisplayName($user);

		$this->maybePruneExpiredFiles($now);

		return $this->mutateState($cleanKey, $now, $effectiveTtl, static function (array $state) use (
			$sessionKey,
			$userId,
			$userName,
			$displayName,
			$safeClientId,
			$now
		): array {
			$existing = isset($state['sessions'][$sessionKey]) && is_array($state['sessions'][$sessionKey])
				? $state['sessions'][$sessionKey]
				: null;

			$startedAt = is_array($existing) && isset($existing['startedAt']) && (int) $existing['startedAt'] > 0
				? (int) $existing['startedAt']
				: $now;

			$state['sessions'][$sessionKey] = [
				'userId' => $userId,
				'userName' => $userName,
				'displayName' => $displayName,
				'clientId' => $safeClientId,
				'startedAt' => $startedAt,
				'lastSeenAt' => $now,
			];

			$userSessionKeys = [];
			foreach ($state['sessions'] as $sKey => $sEntry) {
				if (is_array($sEntry) && (int) ($sEntry['userId'] ?? 0) === $userId) {
					$userSessionKeys[(string) $sKey] = (int) ($sEntry['lastSeenAt'] ?? 0);
				}
			}
			if (count($userSessionKeys) > self::MAX_SESSIONS_PER_USER) {
				asort($userSessionKeys);
				$toEvict = array_slice(array_keys($userSessionKeys), 0, count($userSessionKeys) - self::MAX_SESSIONS_PER_USER);
				foreach ($toEvict as $evictKey) {
					unset($state['sessions'][$evictKey]);
				}
			}

			if (count($state['sessions']) > self::MAX_SESSIONS_PER_RESOURCE) {
				$allSeen = [];
				foreach ($state['sessions'] as $sKey => $sEntry) {
					$allSeen[(string) $sKey] = is_array($sEntry) ? (int) ($sEntry['lastSeenAt'] ?? 0) : 0;
				}
				asort($allSeen);
				$toEvictAll = array_slice(array_keys($allSeen), 0, count($allSeen) - self::MAX_SESSIONS_PER_RESOURCE);
				foreach ($toEvictAll as $evictKey) {
					unset($state['sessions'][$evictKey]);
				}
			}

			return $state;
		}, $userId);
	}

	/**
	 * Release `$user`'s active presence session on `$resourceKey` when navigating away or closing the editor.
	 *
	 * @return array<string, mixed>
	 */
	public function leave(
		string $resourceKey,
		User $user,
		string $clientId = '',
		int $ttlSeconds = self::DEFAULT_TTL_SECONDS,
		?int $nowOverride = null,
	): array {
		$cleanKey = $this->sanitizeResourceKey($resourceKey);
		$userId = $this->resolveUserId($user);
		$now = $nowOverride ?? time();
		$effectiveTtl = max(10, min(300, $ttlSeconds));

		if ($cleanKey === '' || $userId <= 0) {
			return $this->emptySnapshot($cleanKey, $now, $effectiveTtl);
		}

		$safeClientId = $this->sanitizeClientId($clientId);
		$path = $this->filePath($cleanKey);
		if ($path === '' || !is_file($path)) {
			return $this->emptySnapshot($cleanKey, $now, $effectiveTtl);
		}

		return $this->mutateState($cleanKey, $now, $effectiveTtl, static function (array $state) use (
			$userId,
			$safeClientId
		): array {
			if ($safeClientId !== '') {
				unset($state['sessions'][$userId . ':' . $safeClientId]);
			} else {
				foreach (array_keys($state['sessions']) as $sKey) {
					if (str_starts_with((string) $sKey, $userId . ':')) {
						unset($state['sessions'][$sKey]);
					}
				}
			}

			return $state;
		}, $userId);
	}

	/**
	 * Record that `$user` just saved `$resourceKey`, bumping `lastSaved.version` so open co-editors receive a live stale-data alert.
	 *
	 * @return array<string, mixed>
	 */
	public function markSaved(
		string $resourceKey,
		User $user,
		string $clientId = '',
		int $ttlSeconds = self::DEFAULT_TTL_SECONDS,
		?int $nowOverride = null,
	): array {
		$cleanKey = $this->sanitizeResourceKey($resourceKey);
		$userId = $this->resolveUserId($user);
		$now = $nowOverride ?? time();
		$effectiveTtl = max(10, min(300, $ttlSeconds));

		if ($cleanKey === '' || $userId <= 0) {
			return $this->emptySnapshot($cleanKey, $now, $effectiveTtl);
		}

		$safeClientId = $this->sanitizeClientId($clientId);
		$userName = (string) $user->name;
		$displayName = $this->resolveDisplayName($user);

		return $this->mutateState($cleanKey, $now, $effectiveTtl, static function (array $state) use (
			$userId,
			$userName,
			$displayName,
			$safeClientId,
			$now
		): array {
			$prevVersion = isset($state['lastSaved']) && is_array($state['lastSaved'])
				? (int) ($state['lastSaved']['version'] ?? 0)
				: 0;

			$state['lastSaved'] = [
				'version' => $prevVersion + 1,
				'savedAt' => $now,
				'userId' => $userId,
				'userName' => $userName,
				'displayName' => $displayName,
			];

			if ($safeClientId !== '') {
				$sessionKey = $userId . ':' . $safeClientId;
				if (isset($state['sessions'][$sessionKey]) && is_array($state['sessions'][$sessionKey])) {
					$state['sessions'][$sessionKey]['lastSeenAt'] = $now;
				}
			}

			return $state;
		}, $userId);
	}

	/**
	 * Remove expired presence cache files older than `$maxAgeSeconds`.
	 */
	public function pruneStale(?int $nowOverride = null, int $maxAgeSeconds = self::STALE_FILE_MAX_AGE_SECONDS): int
	{
		return $this->pruneExpiredFiles($nowOverride, $maxAgeSeconds);
	}

	/**
	 * Remove expired presence cache files older than `$maxAgeSeconds`.
	 */
	public function pruneExpiredFiles(?int $nowOverride = null, int $maxAgeSeconds = self::STALE_FILE_MAX_AGE_SECONDS): int
	{
		$dir = $this->directoryPath();
		if (!is_dir($dir)) {
			return 0;
		}

		$now = $nowOverride ?? time();
		$removed = 0;

		foreach (glob($dir . '*.json') ?: [] as $file) {
			if (is_link($file) || !is_file($file)) {
				continue;
			}
			$lockFile = $file . '.lock';
			if (is_link($lockFile)) {
				continue;
			}
			$lockFp = @fopen($lockFile, 'c+');
			if (!is_resource($lockFp)) {
				continue;
			}
			try {
				if (!@flock($lockFp, LOCK_EX | LOCK_NB)) {
					continue;
				}
				clearstatcache(true, $file);
				if (!is_file($file) || is_link($file)) {
					continue;
				}
				$mtime = @filemtime($file);
				if ($mtime !== false && ($now - $mtime) > $maxAgeSeconds && @unlink($file)) {
					$removed++;
				}
			} finally {
				@flock($lockFp, LOCK_UN);
				fclose($lockFp);
			}
		}

		foreach (glob($dir . '*.json.lock') ?: [] as $lockFile) {
			if (is_link($lockFile) || !is_file($lockFile)) {
				continue;
			}
			$jsonFile = substr($lockFile, 0, -5);
			if (is_file($jsonFile)) {
				continue;
			}
			clearstatcache(true, $lockFile);
			$lockMtime = @filemtime($lockFile);
			if ($lockMtime === false || ($now - $lockMtime) <= $maxAgeSeconds) {
				continue;
			}
			$lockFp = @fopen($lockFile, 'r+');
			if (!is_resource($lockFp)) {
				continue;
			}
			try {
				if (!@flock($lockFp, LOCK_EX | LOCK_NB)) {
					continue;
				}
				clearstatcache(true, $jsonFile);
				clearstatcache(true, $lockFile);
				$fdStat = @fstat($lockFp);
				$pathStat = !is_link($lockFile) ? @stat($lockFile) : false;
				if (
					!is_array($fdStat)
					|| !is_array($pathStat)
					|| !isset($fdStat['ino'], $pathStat['ino'], $fdStat['dev'], $pathStat['dev'])
					|| $fdStat['ino'] !== $pathStat['ino']
					|| $fdStat['dev'] !== $pathStat['dev']
				) {
					continue;
				}
				$freshMtime = @filemtime($lockFile);
				if (!is_file($jsonFile) && $freshMtime !== false && ($now - $freshMtime) > $maxAgeSeconds && @unlink($lockFile)) {
					$removed++;
				}
			} finally {
				@flock($lockFp, LOCK_UN);
				fclose($lockFp);
			}
		}

		return $removed;
	}

	/**
	 * Remove all presence cache files (invoked on module uninstall or full cache purge).
	 */
	public function purgeAll(): void
	{
		$dir = $this->directoryPath();
		if (!is_dir($dir)) {
			return;
		}

		try {
			$this->wire()->files->rmdir($dir, true);

			return;
		} catch (\Throwable) {
			// Fallback below
		}

		foreach (glob($dir . '*.{json,lock}', GLOB_BRACE) ?: [] as $file) {
			if (is_file($file)) {
				@unlink($file);
			}
		}
		@rmdir($dir);
	}

	/**
	 * Perform an atomic `flock(LOCK_EX)` read-modify-write cycle on a resource presence file and build the caller snapshot.
	 *
	 * @param callable(array<string, mixed>): array<string, mixed> $mutator
	 * @return array{
	 *     resourceKey: string,
	 *     serverTime: int,
	 *     ttlSeconds: int,
	 *     heartbeatSeconds: int,
	 *     coEditors: list<array{
	 *         userId: int,
	 *         userName: string,
	 *         displayName: string,
	 *         startedAt: int,
	 *         lastSeenAt: int,
	 *         secondsAgo: int
	 *     }>,
	 *     lastSaved: array{
	 *         version: int,
	 *         savedAt: int,
	 *         userId: int,
	 *         userName: string,
	 *         displayName: string
	 *     }|null
	 * }
	 */
	private function mutateState(
		string $cleanKey,
		int $now,
		int $ttlSeconds,
		callable $mutator,
		int $currentUserId,
	): array {
		$dir = $this->directoryPath();
		$dirTrimmed = rtrim($dir, '/\\');
		if (is_link($dirTrimmed)) {
			return $this->emptySnapshot($cleanKey, $now, $ttlSeconds);
		}
		if (!is_dir($dir)) {
			$this->wire()->files->mkdir($dir, true);
		}

		$path = $this->filePath($cleanKey);
		if ($path === '' || is_link($path)) {
			return $this->emptySnapshot($cleanKey, $now, $ttlSeconds);
		}

		if (!is_file($path)) {
			$existingFiles = glob($dir . '*.json') ?: [];
			if (count($existingFiles) >= self::MAX_PRESENCE_FILES) {
				$this->pruneStale($now);
				$existingFiles = glob($dir . '*.json') ?: [];
				if (count($existingFiles) >= self::MAX_PRESENCE_FILES) {
					return $this->emptySnapshot($cleanKey, $now, $ttlSeconds);
				}
			}
		}

		$lockPath = $path . '.lock';
		$lockFp = false;
		for ($attempt = 0; $attempt < 5; $attempt++) {
			if (is_link($lockPath)) {
				return $this->emptySnapshot($cleanKey, $now, $ttlSeconds);
			}
			$candidateFp = @fopen($lockPath, 'c+');
			if ($candidateFp === false) {
				return $this->emptySnapshot($cleanKey, $now, $ttlSeconds);
			}
			if (!@flock($candidateFp, LOCK_EX)) {
				fclose($candidateFp);

				return $this->emptySnapshot($cleanKey, $now, $ttlSeconds);
			}
			clearstatcache(true, $lockPath);
			$fdStat = @fstat($candidateFp);
			$pathStat = !is_link($lockPath) ? @stat($lockPath) : false;
			if (
				is_array($fdStat)
				&& is_array($pathStat)
				&& isset($fdStat['ino'], $pathStat['ino'], $fdStat['dev'], $pathStat['dev'])
				&& $fdStat['ino'] === $pathStat['ino']
				&& $fdStat['dev'] === $pathStat['dev']
			) {
				$lockFp = $candidateFp;
				break;
			}
			@flock($candidateFp, LOCK_UN);
			fclose($candidateFp);
		}
		if (!is_resource($lockFp)) {
			return $this->emptySnapshot($cleanKey, $now, $ttlSeconds);
		}

		try {
			@touch($lockPath);

			$raw = is_file($path) ? @file_get_contents($path) : '';
			$decoded = is_string($raw) && trim($raw) !== '' ? json_decode($raw, true, 16) : null;

			$state = [
				'resourceKey' => $cleanKey,
				'sessions' => [],
				'lastSaved' => null,
				'updatedAt' => $now,
			];

			if (is_array($decoded)) {
				if (isset($decoded['sessions']) && is_array($decoded['sessions'])) {
					foreach ($decoded['sessions'] as $sKey => $entry) {
						if (!is_array($entry)) {
							continue;
						}
						$lastSeenAt = (int) ($entry['lastSeenAt'] ?? 0);
						if ($lastSeenAt > 0 && ($now - $lastSeenAt) <= $ttlSeconds) {
							$state['sessions'][(string) $sKey] = $entry;
						}
					}
				}
				if (isset($decoded['lastSaved']) && is_array($decoded['lastSaved'])) {
					$savedAt = (int) ($decoded['lastSaved']['savedAt'] ?? 0);
					if ($savedAt > 0 && ($now - $savedAt) <= self::STALE_FILE_MAX_AGE_SECONDS) {
						$state['lastSaved'] = [
							'version' => (int) ($decoded['lastSaved']['version'] ?? 1),
							'savedAt' => $savedAt,
							'userId' => (int) ($decoded['lastSaved']['userId'] ?? 0),
							'userName' => (string) ($decoded['lastSaved']['userName'] ?? ''),
							'displayName' => (string) ($decoded['lastSaved']['displayName'] ?? ($decoded['lastSaved']['userName'] ?? '')),
						];
					}
				}
			}

			$state = $mutator($state);
			$state['updatedAt'] = $now;

			$isEmptyState = $state['sessions'] === [] && $state['lastSaved'] === null;
			if ($isEmptyState) {
				if (is_file($path)) {
					@unlink($path);
				}

				return $this->emptySnapshot($cleanKey, $now, $ttlSeconds);
			}

			try {
				$encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
			} catch (\Throwable) {
				return $this->emptySnapshot($cleanKey, $now, $ttlSeconds);
			}

			$tmpPath = $dir . '.tmp.' . bin2hex(random_bytes(8));
			if (@file_put_contents($tmpPath, $encoded) === false) {
				if (is_file($tmpPath)) {
					@unlink($tmpPath);
				}

				return $this->emptySnapshot($cleanKey, $now, $ttlSeconds);
			}
			@chmod($tmpPath, 0600);
			if (!@rename($tmpPath, $path)) {
				if (is_file($tmpPath)) {
					@unlink($tmpPath);
				}

				return $this->emptySnapshot($cleanKey, $now, $ttlSeconds);
			}

			return $this->buildSnapshotFromState($cleanKey, $state, $currentUserId, $now, $ttlSeconds);
		} finally {
			@flock($lockFp, LOCK_UN);
			fclose($lockFp);
		}
	}

	/**
	 * @param array<string, mixed> $state
	 * @return array{
	 *     resourceKey: string,
	 *     serverTime: int,
	 *     ttlSeconds: int,
	 *     heartbeatSeconds: int,
	 *     coEditors: list<array{
	 *         userId: int,
	 *         userName: string,
	 *         displayName: string,
	 *         startedAt: int,
	 *         lastSeenAt: int,
	 *         secondsAgo: int
	 *     }>,
	 *     lastSaved: array{
	 *         version: int,
	 *         savedAt: int,
	 *         userId: int,
	 *         userName: string,
	 *         displayName: string
	 *     }|null
	 * }
	 */
	private function buildSnapshotFromState(
		string $cleanKey,
		array $state,
		int $currentUserId,
		int $now,
		int $ttlSeconds,
	): array {
		/** @var array<int, array{userId: int, userName: string, displayName: string, startedAt: int, lastSeenAt: int, secondsAgo: int}> $byUser */
		$byUser = [];
		$sessions = isset($state['sessions']) && is_array($state['sessions']) ? $state['sessions'] : [];

		foreach ($sessions as $entry) {
			if (!is_array($entry)) {
				continue;
			}
			$peerUserId = (int) ($entry['userId'] ?? 0);
			if ($peerUserId <= 0 || $peerUserId === $currentUserId) {
				continue;
			}
			$lastSeenAt = (int) ($entry['lastSeenAt'] ?? 0);
			if ($lastSeenAt <= 0 || ($now - $lastSeenAt) > $ttlSeconds) {
				continue;
			}
			$startedAt = (int) ($entry['startedAt'] ?? $lastSeenAt);
			$userName = (string) ($entry['userName'] ?? 'user');
			$displayName = (string) ($entry['displayName'] ?? $userName);

			if (!isset($byUser[$peerUserId])) {
				$byUser[$peerUserId] = [
					'userId' => $peerUserId,
					'userName' => $userName,
					'displayName' => $displayName !== '' ? $displayName : $userName,
					'startedAt' => $startedAt,
					'lastSeenAt' => $lastSeenAt,
					'secondsAgo' => max(0, $now - $lastSeenAt),
				];
			} else {
				if ($startedAt < $byUser[$peerUserId]['startedAt']) {
					$byUser[$peerUserId]['startedAt'] = $startedAt;
				}
				if ($lastSeenAt > $byUser[$peerUserId]['lastSeenAt']) {
					$byUser[$peerUserId]['lastSeenAt'] = $lastSeenAt;
					$byUser[$peerUserId]['secondsAgo'] = max(0, $now - $lastSeenAt);
				}
			}
		}

		$coEditors = array_values($byUser);
		usort(
			$coEditors,
			static fn(array $a, array $b): int => $b['lastSeenAt'] <=> $a['lastSeenAt']
		);

		/** @var array{version: int, savedAt: int, userId: int, userName: string, displayName: string}|null $lastSaved */
		$lastSaved = isset($state['lastSaved']) && is_array($state['lastSaved'])
			? $state['lastSaved']
			: null;

		return [
			'resourceKey' => $cleanKey,
			'serverTime' => $now,
			'ttlSeconds' => $ttlSeconds,
			'heartbeatSeconds' => self::HEARTBEAT_INTERVAL_SECONDS,
			'coEditors' => $coEditors,
			'lastSaved' => $lastSaved,
		];
	}

	/**
	 * @return array{
	 *     resourceKey: string,
	 *     serverTime: int,
	 *     ttlSeconds: int,
	 *     heartbeatSeconds: int,
	 *     coEditors: list<never>,
	 *     lastSaved: null
	 * }
	 */
	private function emptySnapshot(string $cleanKey, int $now, int $ttlSeconds): array
	{
		return [
			'resourceKey' => $cleanKey,
			'serverTime' => $now,
			'ttlSeconds' => $ttlSeconds,
			'heartbeatSeconds' => self::HEARTBEAT_INTERVAL_SECONDS,
			'coEditors' => [],
			'lastSaved' => null,
		];
	}

	private function maybePruneExpiredFiles(int $now): void
	{
		if (random_int(1, 50) === 1) {
			$this->pruneExpiredFiles($now);
		}
	}

	private function resolveUserId(User $user): int
	{
		$id = (int) $user->id;
		if ($id <= 0 || !AccessGuard::isAuthenticatedOrSuperuser($user)) {
			return 0;
		}

		return $id;
	}

	private function resolveDisplayName(User $user): string
	{
		$rawTitle = '';
		try {
			$val = $user->get('title');
			if (is_scalar($val)) {
				$rawTitle = trim(strip_tags((string) $val));
			}
		} catch (\Throwable) {
			$rawTitle = '';
		}

		return $rawTitle !== '' ? $rawTitle : (string) $user->name;
	}

	private function sanitizeClientId(string $raw): string
	{
		$clean = trim($raw);
		if ($clean === '') {
			return '';
		}

		return substr((string) preg_replace('/[^a-zA-Z0-9_-]/', '', $clean), 0, 64);
	}
}
