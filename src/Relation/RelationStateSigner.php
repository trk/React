<?php

declare(strict_types=1);

namespace Totoglu\React\Relation;

use ProcessWire\React;
use ProcessWire\Wire;

/**
 * RelationStateSigner
 *
 * Signs and verifies server-side relation field envelopes using HMAC-SHA256 bound to
 * ProcessWire's `$config->userAuthSalt` and the active user ID (`uid`) so client requests
 * to `/_react/relation` can never forge selectors, target resources, or mutation flags.
 */
final class RelationStateSigner extends Wire
{
	/**
	 * Allowed scalar/array configuration keys persisted inside the signed envelope.
	 *
	 * @var list<string>
	 */
	private const ALLOWED_ENVELOPE_KEYS = [
		'cardinality',
		'resource',
		'allowedResources',
		'dependsResourceMap',
		'dependsParam',
		'valueField',
		'selector',
		'templateIds',
		'templates',
		'template',
		'tags',
		'parentId',
		'fieldtypes',
		'roles',
		'prefix',
		'implements',
		'blueprintType',
		'includeSystem',
		'excludeGuest',
		'excludeSuperuser',
		'allowUnpub',
		'readOnly',
		'creatable',
		'createParentId',
		'createTemplate',
		'allowLink',
		'allowUnlink',
		'targetResource',
		'foreignField',
		'ownerId',
		'limit',
	];

	/**
	 * Create a URL-safe signed `relationToken` for `$config` bound to the current user ID.
	 *
	 * @param array<string, mixed> $config
	 */
	public function sign(array $config, ?int $userId = null): string
	{
		$envelope = [];
		foreach (self::ALLOWED_ENVELOPE_KEYS as $key) {
			if (!array_key_exists($key, $config)) {
				continue;
			}
			$val = $config[$key];
			if ($val instanceof \Closure || is_object($val)) {
				continue;
			}
			$envelope[$key] = $val;
		}

		$resolvedUid = $userId ?? (int) $this->wire()->user->id;
		$envelope['typ'] = 'relation';
		$envelope['uid'] = $resolvedUid;

		return React::instance($this)->tokenCodec()->encode($envelope);
	}

	/**
	 * Verify `$token` and return the decoded configuration array, or `null` if tampered, expired, or mismatched user.
	 *
	 * @return array<string, mixed>|null
	 */
	public function verify(string $token, ?int $expectedUserId = null): ?array
	{
		$currentUid = $expectedUserId ?? (int) $this->wire()->user->id;
		$decoded = React::instance($this)->tokenCodec()->decode($token, $currentUid);
		if (
			$decoded === null
			|| ($decoded['typ'] ?? '') !== 'relation'
			|| (!isset($decoded['resource']) && !isset($decoded['allowedResources']))
		) {
			return null;
		}

		return $decoded;
	}
}
