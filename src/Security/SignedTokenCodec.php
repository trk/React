<?php

declare(strict_types=1);

namespace Totoglu\React\Security;

use ProcessWire\Wire;
use ProcessWire\WireException;

/**
 * Shared HMAC-SHA256 state token encoder/decoder with strict salt validation,
 * issued-at (`iat`) timestamp binding, user session (`uid`) binding, and 24h TTL enforcement.
 */
final class SignedTokenCodec extends Wire
{
	public const int DEFAULT_TTL = 86400;

	public const int MIN_SALT_LENGTH = 16;

	public const int MAX_CLOCK_SKEW = 300;

	public const int MAX_TOKEN_BYTES = 65536;

	/**
	 * Resolve and validate ProcessWire's `$config->userAuthSalt`.
	 *
	 * @throws WireException When `userAuthSalt` is missing or shorter than 16 characters.
	 */
	public function signingSecret(): string
	{
		$salt = (string) $this->wire()->config->userAuthSalt;
		if (strlen($salt) < self::MIN_SALT_LENGTH) {
			throw new WireException('React requires $config->userAuthSalt to be at least 16 characters.');
		}

		return $salt;
	}

	/**
	 * Sign and base64url-encode an associative token envelope with `iat` timestamp.
	 *
	 * @param array<string, mixed> $envelope
	 * @throws WireException
	 */
	public function encode(array $envelope): string
	{
		$secret = $this->signingSecret();
		if (!isset($envelope['iat']) || !is_int($envelope['iat'])) {
			$envelope['iat'] = time();
		}

		$json = json_encode($envelope, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		if (!is_string($json)) {
			throw new WireException('Failed to encode signed state token payload.');
		}

		$encoded = rtrim(strtr(base64_encode($json), '+/', '-_'), '=');
		$sig = hash_hmac('sha256', $encoded, $secret);

		return $encoded . '.' . $sig;
	}

	/**
	 * Verify HMAC signature, `iat` freshness within `$ttl` seconds, and optional `$expectedUserId`.
	 *
	 * @return array<string, mixed>|null
	 * @throws WireException When `$config->userAuthSalt` is missing or too short.
	 */
	public function decode(string $token, ?int $expectedUserId = null, int $ttl = self::DEFAULT_TTL): ?array
	{
		$secret = $this->signingSecret();
		$trimmed = trim($token);
		if ($trimmed === '' || strlen($trimmed) > self::MAX_TOKEN_BYTES || !str_contains($trimmed, '.')) {
			return null;
		}

		[$encoded, $sig] = explode('.', $trimmed, 2);
		if ($encoded === '' || $sig === '') {
			return null;
		}

		$expectedSig = hash_hmac('sha256', $encoded, $secret);
		if (!hash_equals($expectedSig, $sig)) {
			return null;
		}

		$remainder = strlen($encoded) % 4;
		$padded = $remainder > 0 ? $encoded . str_repeat('=', 4 - $remainder) : $encoded;
		$rawJson = base64_decode(strtr($padded, '-_', '+/'), true);
		if (!is_string($rawJson) || $rawJson === '') {
			return null;
		}

		$decoded = json_decode($rawJson, true, 32);
		if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
			return null;
		}

		if (!isset($decoded['iat']) || !is_int($decoded['iat'])) {
			return null;
		}

		$now = time();
		$iat = $decoded['iat'];
		if ($iat <= 0 || $iat > ($now + self::MAX_CLOCK_SKEW) || ($now - $iat) > $ttl) {
			return null;
		}

		if ($expectedUserId !== null && (int) ($decoded['uid'] ?? -1) !== $expectedUserId) {
			return null;
		}

		return $decoded;
	}
}
