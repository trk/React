<?php

declare(strict_types=1);

namespace Totoglu\React\Http;

use ProcessWire\HookEvent;
use ProcessWire\React;
use ProcessWire\User;
use ProcessWire\Wire;
use ProcessWire\WireException;
use ProcessWire\WirePermissionException;
use Totoglu\React\Relation\RelationItem;
use Totoglu\React\Security\AccessGuard;
use Totoglu\React\Theme\ThemePreset;
use Totoglu\React\Theme\ThemeTokenParser;
use Totoglu\React\Viewport\MarkupReactViewport;

/**
 * ReactGatewayRouter
 *
 * Handles `/_react/*` HTTP JSON/multipart endpoints (`viewport`, `workspace-prefs`,
 * `presence`, `relation`, `media`, `tiptap`, `icons`) with bounded JSON parsing,
 * ProcessWire CSRF enforcement, signed HMAC state verification, and RBAC scoping.
 */
final class ReactGatewayRouter extends Wire
{
	/**
	 * Actions on `/_react/relation` that mutate server state and require CSRF validation.
	 *
	 * @var list<string>
	 */
	private const array MUTATING_RELATION_ACTIONS = [
		'quick_create',
		'o2m_link',
		'o2m_unlink',
	];

	/**
	 * Actions on `/_react/viewport` that mutate server state or user preferences and require CSRF validation.
	 *
	 * @var list<string>
	 */
	private const array MUTATING_VIEWPORT_ACTIONS = [
		'bulk_action',
		'row_action',
		'toolbar_action',
		'update_field',
		'toggle_field',
		'move_stage',
		'reorder',
		'reschedule',
		'resize_span',
		'quick_create',
		'save_quick_edit',
		'save_view',
		'delete_view',
		'toggle_column',
		'reset_columns',
		'export',
		'sort',
		'switch_view_mode',
		'select_view',
		'reset_filters',
	];

	public function __construct(private React $react)
	{
		parent::__construct();
	}

	/**
	 * Decode a JSON request body with strict byte-size and nesting-depth bounds.
	 *
	 * @param callable(int): string $readRawStream
	 * @return array<string, mixed>|null
	 */
	public function decodeJsonRequestBody(
		callable $readRawStream,
		int $maxBytes = 2097152,
		int $maxDepth = 64,
	): ?array {
		$safeMaxBytes = max(1, $maxBytes);
		if (
			isset($_SERVER['CONTENT_LENGTH'])
			&& is_numeric($_SERVER['CONTENT_LENGTH'])
			&& (int) $_SERVER['CONTENT_LENGTH'] > $safeMaxBytes
		) {
			return null;
		}

		$rawBody = $readRawStream($safeMaxBytes + 1);
		if ($rawBody === '' || strlen($rawBody) > $safeMaxBytes) {
			return null;
		}

		$decoded = json_decode($rawBody, true, max(1, $maxDepth));

		return is_array($decoded) ? $decoded : null;
	}

	/**
	 * Verify CSRF token (`X-CSRF-TOKEN`, `X-XSRF-TOKEN`, or form payload token) for mutating `/_react/*` requests.
	 *
	 * @param array<string, mixed> $requestPayload
	 */
	public function verifyRequestCsrf(array $requestPayload): bool
	{
		try {
			$csrf = $this->wire()->session->CSRF;
			$expectedName = (string) $csrf->getTokenName();
			$expectedValue = (string) $csrf->getTokenValue();
			if ($expectedValue === '') {
				return false;
			}

			$headerValue = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
			if ($headerValue !== '' && hash_equals($expectedValue, $headerValue)) {
				return true;
			}

			$xsrfValue = trim((string) ($_SERVER['HTTP_X_XSRF_TOKEN'] ?? ''));
			if ($xsrfValue !== '') {
				$decodedXsrf = rawurldecode($xsrfValue);
				if (hash_equals($expectedValue, $xsrfValue) || hash_equals($expectedValue, $decodedXsrf)) {
					return true;
				}
			}

			if (isset($requestPayload['csrf']) && is_array($requestPayload['csrf'])) {
				$suppliedValue = (string) ($requestPayload['csrf']['value'] ?? '');
				if ($suppliedValue !== '' && hash_equals($expectedValue, $suppliedValue)) {
					return true;
				}
			}

			if ($expectedName !== '' && isset($requestPayload[$expectedName])) {
				$suppliedValue = (string) $requestPayload[$expectedName];
				if ($suppliedValue !== '' && hash_equals($expectedValue, $suppliedValue)) {
					return true;
				}
			}

			return (bool) $csrf->hasValidToken('', false);
		} catch (\Throwable) {
			return false;
		}
	}

	/**
	 * Emit standard security headers and JSON-encode an API gateway response.
	 *
	 * @param array<string, mixed> $response
	 */
	public function respondJson(array $response, string $cacheControl = 'no-store'): string
	{
		if (!headers_sent()) {
			header('Content-Type: application/json; charset=UTF-8');
			header('X-Content-Type-Options: nosniff');
			if ($cacheControl !== '') {
				header('Cache-Control: ' . $cacheControl);
			}
		}

		$status = (int) ($response['status'] ?? (!empty($response['ok']) ? 200 : 400));
		unset($response['status']);
		http_response_code($status);

		return (string) json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	}

	/**
	 * Resolve a `MarkupReactViewport` module instance by short class name.
	 */
	public function resolveViewportInstance(string $viewportClass): MarkupReactViewport
	{
		$shortName = str_contains($viewportClass, '\\')
			? substr($viewportClass, strrpos($viewportClass, '\\') + 1)
			: $viewportClass;

		$modules = $this->wire()->modules;
		if ($shortName !== '') {
			try {
				if ($modules->isInstalled($shortName)) {
					$mod = $modules->get($shortName);
					if ($mod instanceof MarkupReactViewport) {
						return clone $mod;
					}
				}
			} catch (\Throwable) {
				// Fallback below
			}
		}

		$cleanClass = ltrim(trim($viewportClass), '\\');
		$candidates = [];
		if (
			$cleanClass !== ''
			&& str_contains($cleanClass, '\\')
			&& preg_match('/^[A-Za-z_][A-Za-z0-9_\\\\]*$/', $cleanClass) === 1
		) {
			$candidates[] = $cleanClass;
		}
		if ($shortName !== '' && preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $shortName) === 1) {
			$candidates[] = 'ProcessWire\\' . $shortName;
		}

		foreach ($candidates as $fqcn) {
			if (class_exists($fqcn) && is_subclass_of($fqcn, MarkupReactViewport::class)) {
				$rc = new \ReflectionClass($fqcn);
				if (!$rc->isAbstract() && !$rc->isInterface() && !$rc->isTrait()) {
					/** @var MarkupReactViewport $inst */
					$inst = $rc->newInstance();
					$this->wire($inst);
					$inst->init();

					return $inst;
				}
			}
		}

		if ($shortName === 'MarkupReactCards') {
			return $this->react->cards();
		}

		return $this->react->table();
	}

	/**
	 * Handle JSON viewport requests sent to `/_react/viewport`.
	 */
	public function handleViewportRequest(HookEvent $event): string
	{
		$payload = $this->react->readJsonRequestBody() ?? [];

		if ($payload === []) {
			$post = $this->wire()->input->post->getArray();
			if (is_array($post) && $post !== []) {
				$payload = $post;
			}
		}

		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST')));

		return $this->respondJson($this->handleViewportAction($payload, true));
	}

	/**
	 * Execute a signed viewport action and return the structured response array.
	 *
	 * @param array<string, mixed> $requestPayload
	 * @return array{ok: bool, status?: int, error?: string, viewport?: array<string, mixed>}
	 */
	public function handleViewportAction(array $requestPayload, bool $enforceCsrf = false): array
	{
		$user = $this->wire()->user;
		if (!AccessGuard::isAuthenticated($user)) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Authentication required.',
			];
		}

		$stateToken = trim((string) ($requestPayload['stateToken'] ?? ''));
		$action = trim((string) ($requestPayload['action'] ?? 'fetch'));
		$actionPayload = isset($requestPayload['payload']) && is_array($requestPayload['payload'])
			? $requestPayload['payload']
			: $requestPayload;

		if (in_array($action, self::MUTATING_VIEWPORT_ACTIONS, true)) {
			$reqMethod = strtoupper(trim((string) ($requestPayload['_requestMethod'] ?? (PHP_SAPI !== 'cli' ? ($_SERVER['REQUEST_METHOD'] ?? '') : ''))));
			if ($reqMethod !== '' && $reqMethod !== 'POST') {
				return [
					'ok' => false,
					'status' => 405,
					'error' => 'Method not allowed. POST required.',
				];
			}
			if ((bool) $this->wire()->config->demo) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => 'Mutations are disabled in demo mode.',
				];
			}
		}

		if ($stateToken === '') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => 'Missing viewport stateToken.',
			];
		}

		$verifier = $this->react->table();
		$envelope = $verifier->verifyViewportState($stateToken);
		if ($envelope === null) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Invalid or expired viewport stateToken.',
			];
		}

		if ($enforceCsrf && in_array($action, self::MUTATING_VIEWPORT_ACTIONS, true)) {
			if (!$this->verifyRequestCsrf($requestPayload)) {
				return [
					'ok' => false,
					'status' => 419,
					'error' => 'CSRF token validation failed.',
				];
			}
		}

		$viewportClass = (string) ($envelope['viewportClass'] ?? 'MarkupReactTable');
		$viewport = $this->resolveViewportInstance($viewportClass);
		$viewport->resetViewportState();
		$viewport->fill($envelope);

		$clientState = isset($requestPayload['state']) && is_array($requestPayload['state'])
			? $requestPayload['state']
			: [];
		$allowedMutableStateKeys = [
			'searchQuery',
			'filterValues',
			'sortField',
			'sortDirection',
			'page',
			'limit',
			'selectedIds',
			'hiddenColumns',
			'activeView',
			'viewMode',
			'month',
			'year',
			'calendarView',
			'quickEditRecordId',
		];
		$safeClientState = [];
		foreach ($allowedMutableStateKeys as $stateKey) {
			if (array_key_exists($stateKey, $clientState)) {
				if ($stateKey === 'page') {
					$safeClientState['pageNum'] = max(1, (int) $clientState[$stateKey]);
				} elseif ($stateKey === 'viewMode') {
					$candidateMode = strtolower(trim((string) $clientState[$stateKey]));
					$allowedModes = is_array($envelope['allowedViewModes'] ?? null) ? $envelope['allowedViewModes'] : ['table', 'cards'];
					if ($candidateMode !== '' && in_array($candidateMode, $allowedModes, true)) {
						$safeClientState['viewMode'] = $candidateMode;
					}
				} else {
					$safeClientState[$stateKey] = $clientState[$stateKey];
				}
			}
		}
		if ($safeClientState !== []) {
			$viewport->fill($safeClientState);
		}

		try {
			$updatedViewport = $viewport->executeAction($action, $actionPayload);
		} catch (WirePermissionException $e) {
			throw $e;
		} catch (\Throwable $e) {
			$this->wire()->log->error('React viewport error: ' . $e->getMessage());
			$isSafe = $e instanceof WireException || (bool) $this->wire()->config->debug;

			return [
				'ok' => false,
				'status' => 422,
				'error' => $isSafe ? $e->getMessage() : 'Viewport action failed.',
			];
		}

		if (isset($updatedViewport['ok']) && $updatedViewport['ok'] === false) {
			return [
				'ok' => false,
				'status' => 422,
				'error' => (string) ($updatedViewport['error'] ?? 'Viewport action failed.'),
				'viewport' => $updatedViewport,
			];
		}

		return [
			'ok' => true,
			'status' => 200,
			'viewport' => $updatedViewport,
		];
	}

	/**
	 * Handle JSON workspace preference mutations sent to `/_react/workspace-prefs`.
	 */
	public function handleWorkspacePrefsRequest(HookEvent $event): string
	{
		$user = $this->wire()->user;
		if (!AccessGuard::isAuthenticated($user)) {
			return $this->respondJson([
				'ok' => false,
				'status' => 403,
				'error' => 'Authentication required.',
			]);
		}

		$payload = $this->react->readJsonRequestBody() ?? [];

		if ($payload === []) {
			$post = $this->wire()->input->post->getArray();
			if (is_array($post) && $post !== []) {
				$payload = $post;
			}
		}

		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST')));

		return $this->respondJson($this->handleWorkspacePrefsAction($payload, true, $user));
	}

	/**
	 * Execute a workspace preference action and return the reconciled preference state.
	 *
	 * @param array<string, mixed> $requestPayload
	 * @return array{ok: bool, status?: int, error?: string, preferences?: array<string, mixed>, themeMode?: string, themePreset?: string, userThemePreset?: string, siteDefaultThemePreset?: string, themeCss?: string, preset?: array<string, mixed>}
	 */
	public function handleWorkspacePrefsAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticated($resolvedUser)) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Authentication required.',
			];
		}

		$reqMethod = strtoupper(trim((string) ($requestPayload['_requestMethod'] ?? (PHP_SAPI !== 'cli' ? ($_SERVER['REQUEST_METHOD'] ?? '') : ''))));
		if ($reqMethod !== '' && $reqMethod !== 'POST') {
			return [
				'ok' => false,
				'status' => 405,
				'error' => 'Method not allowed. POST required.',
			];
		}

		if ($enforceCsrf && !$this->verifyRequestCsrf($requestPayload)) {
			return [
				'ok' => false,
				'status' => 419,
				'error' => 'CSRF token validation failed.',
			];
		}

		$action = strtolower(trim((string) ($requestPayload['action'] ?? 'save')));
		if ($action === '') {
			$action = 'save';
		}
		$allowedPrefActions = [
			'save',
			'toggle_favorite',
			'set_favorites',
			'toggle_widget',
			'reorder_widgets',
			'resize_widget',
			'reset',
			'export_layout',
			'import_layout',
			'set_theme_mode',
			'set_theme_preset',
		];
		if (!in_array($action, $allowedPrefActions, true)) {
			return [
				'ok' => false,
				'status' => 422,
				'error' => 'Unsupported workspace preference action.',
			];
		}
		if ($action !== 'export_layout' && (bool) $this->wire()->config->demo) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Mutations are disabled in demo mode.',
			];
		}
		$store = $this->react->workspacePreferences();

		if ($action === 'import_layout') {
			$rawPreset = $requestPayload['preset'] ?? $requestPayload;
			if (is_string($rawPreset)) {
				if (strlen($rawPreset) > 65536) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => 'Dashboard layout preset exceeds maximum size.',
					];
				}
				$decodedPreset = json_decode($rawPreset, true, 16);
				if (json_last_error() !== JSON_ERROR_NONE || !is_array($decodedPreset)) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => 'Invalid JSON format in dashboard layout preset.',
					];
				}
				$rawPreset = $decodedPreset;
			}
			if (!is_array($rawPreset)) {
				return [
					'ok' => false,
					'status' => 422,
					'error' => 'Dashboard layout preset must be a JSON object.',
				];
			}

			try {
				$store->importPreset($rawPreset, $resolvedUser);
			} catch (\InvalidArgumentException $e) {
				return [
					'ok' => false,
					'status' => 422,
					'error' => $e->getMessage(),
				];
			}
		} elseif ($action === 'set_theme_mode') {
			$rawMode = strtolower(trim((string) ($requestPayload['themeMode'] ?? 'system')));
			if ($rawMode === 'auto') {
				$rawMode = 'system';
			}
			if (!in_array($rawMode, ['light', 'dark', 'system'], true)) {
				return [
					'ok' => false,
					'status' => 422,
					'error' => 'Invalid themeMode value.',
				];
			}
			$adminSettings = $this->wire()->config->AdminThemeUikit;
			if (is_array($adminSettings) && !empty($adminSettings['noDarkMode'])) {
				$rawMode = 'light';
			}
			$metaValue = match ($rawMode) {
				'dark' => 1,
				'light' => 0,
				default => -1,
			};
			$store->setThemeMode($rawMode, $resolvedUser);
			$resolvedUser->meta('adminDarkMode', $metaValue);
		} elseif ($action === 'set_theme_preset') {
			$rawPreset = strtolower(trim((string) ($requestPayload['themePreset'] ?? '')));
			if ($rawPreset === '' || $rawPreset === 'default') {
				$store->setThemePreset('', $resolvedUser);
			} else {
				$preset = ThemePreset::tryFrom($rawPreset);
				$tokenParser = new ThemeTokenParser();
				$customReady = $tokenParser->isComplete($tokenParser->parse((string) $this->react->get('themeCustomTokens')));
				if ($preset === null || ($preset === ThemePreset::Custom && !$customReady)) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => 'Invalid themePreset value.',
					];
				}
				$store->setThemePreset($preset->value, $resolvedUser);
			}
		} elseif ($action !== 'export_layout') {
			match ($action) {
				'toggle_favorite' => $store->toggleFavorite((string) ($requestPayload['workspaceId'] ?? ''), $resolvedUser),
				'set_favorites' => $store->savePreferences(['favorites' => is_array($requestPayload['favorites'] ?? null) ? $requestPayload['favorites'] : []], $resolvedUser),
				'toggle_widget' => $store->toggleWidgetVisibility(
					(string) ($requestPayload['widgetId'] ?? ''),
					array_key_exists('visible', $requestPayload) ? (bool) $requestPayload['visible'] : null,
					$resolvedUser
				),
				'reorder_widgets' => $store->reorderWidgets(is_array($requestPayload['widgetOrder'] ?? null) ? $requestPayload['widgetOrder'] : [], $resolvedUser),
				'resize_widget' => $store->setWidgetSize(
					(string) ($requestPayload['widgetId'] ?? ''),
					(string) ($requestPayload['size'] ?? 'md'),
					$resolvedUser
				),
				'reset' => $store->reset($resolvedUser),
				default => $store->savePreferences($requestPayload, $resolvedUser),
			};
		}

		$isThemeOnlyAction = $action === 'set_theme_mode' || $action === 'set_theme_preset';
		$themeService = $this->react->theme();
		if ($isThemeOnlyAction) {
			$accessibleWorkspaces = [];
			$accessibleWidgets = null;
			$reconciled = $store->load($resolvedUser);
		} else {
			$accessibleWorkspaces = $this->react->workspaces()->accessible($resolvedUser);
			$accessibleWidgets = $this->react->widgets()->accessible($resolvedUser);
			$reconciled = $store->reconcile($accessibleWorkspaces, $accessibleWidgets, $resolvedUser);
		}

		$response = [
			'ok' => true,
			'status' => 200,
			'preferences' => $reconciled,
			'themeMode' => $themeService->resolveEffectiveThemeMode($resolvedUser),
			'themePreset' => $themeService->activePreset($resolvedUser)->value,
			'userThemePreset' => $themeService->userPresetOverride($resolvedUser),
			'siteDefaultThemePreset' => $themeService->siteDefaultPreset()->value,
			'themeCss' => $themeService->resolveThemeTokenCss($resolvedUser),
		];

		if ($action === 'export_layout') {
			$response['preset'] = $store->exportPreset($accessibleWorkspaces, $accessibleWidgets, $resolvedUser);
		}

		return $response;
	}

	/**
	 * Handle JSON concurrent edit presence requests sent to `/_react/presence`.
	 */
	public function handlePresenceRequest(HookEvent $event): string
	{
		$user = $this->wire()->user;
		if (!AccessGuard::isAuthenticated($user) || !React::checkAccess(['user' => $user])) {
			return $this->respondJson([
				'ok' => false,
				'status' => 403,
				'error' => 'Workspace access required.',
			]);
		}

		$payload = $this->react->readJsonRequestBody() ?? [];

		if ($payload === []) {
			$post = $this->wire()->input->post->getArray();
			if (is_array($post) && $post !== []) {
				$payload = $post;
			}
		}

		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST')));

		return $this->respondJson($this->handlePresenceAction($payload, true, $user));
	}

	/**
	 * Execute a concurrent edit presence action (`heartbeat`, `leave`, `saved`).
	 *
	 * @param array<string, mixed> $requestPayload
	 * @return array{ok: bool, status?: int, error?: string, presence?: array<string, mixed>}
	 */
	public function handlePresenceAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticated($resolvedUser) || !React::checkAccess(['user' => $resolvedUser])) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Workspace access required.',
			];
		}

		$reqMethod = strtoupper(trim((string) ($requestPayload['_requestMethod'] ?? (PHP_SAPI !== 'cli' ? ($_SERVER['REQUEST_METHOD'] ?? '') : ''))));
		if ($reqMethod !== '' && $reqMethod !== 'POST') {
			return [
				'ok' => false,
				'status' => 405,
				'error' => 'Method not allowed. POST required.',
			];
		}

		if ($enforceCsrf && !$this->verifyRequestCsrf($requestPayload)) {
			return [
				'ok' => false,
				'status' => 419,
				'error' => 'CSRF token validation failed.',
			];
		}

		if ((bool) $this->wire()->config->demo) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Mutations are disabled in demo mode.',
			];
		}

		$store = $this->react->presence();
		$resourceKey = $store->sanitizeResourceKey((string) ($requestPayload['resourceKey'] ?? ''));
		if ($resourceKey === '') {
			return [
				'ok' => false,
				'status' => 422,
				'error' => 'Missing or invalid resourceKey.',
			];
		}

		$action = strtolower(trim((string) ($requestPayload['action'] ?? 'heartbeat')));
		if ($action === '') {
			$action = 'heartbeat';
		}
		if (!in_array($action, ['heartbeat', 'leave', 'saved'], true)) {
			return [
				'ok' => false,
				'status' => 422,
				'error' => 'Unsupported presence action.',
			];
		}
		$clientId = (string) ($requestPayload['clientId'] ?? '');

		$snapshot = match ($action) {
			'leave' => $store->leave($resourceKey, $resolvedUser, $clientId),
			'saved' => $store->markSaved($resourceKey, $resolvedUser, $clientId),
			default => $store->heartbeat($resourceKey, $resolvedUser, $clientId),
		};

		return [
			'ok' => true,
			'status' => 200,
			'presence' => $snapshot,
		];
	}

	/**
	 * Handle JSON relation requests sent to `/_react/relation`.
	 */
	public function handleRelationRequest(HookEvent $event): string
	{
		$payload = $this->react->readJsonRequestBody() ?? [];

		if ($payload === []) {
			$input = $this->wire()->input;
			$post = $input->post->getArray();
			if (is_array($post) && $post !== []) {
				$payload = $post;
			} else {
				$get = $input->get->getArray();
				if (is_array($get) && $get !== []) {
					$payload = $get;
				}
			}
		}

		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST')));

		return $this->respondJson($this->handleRelationAction($payload, true));
	}

	/**
	 * Execute a signed relation action (`search`, `tree`, `hydrate`, `o2m_list`, `quick_create`, `o2m_link`, `o2m_unlink`).
	 *
	 * @param array<string, mixed> $requestPayload
	 * @return array<string, mixed>
	 */
	public function handleRelationAction(array $requestPayload, bool $enforceCsrf = false, ?User $user = null): array
	{
		$resolvedUser = $user ?? $this->wire()->user;
		if (!AccessGuard::isAuthenticated($resolvedUser)) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Authentication required.',
			];
		}

		$token = trim((string) ($requestPayload['relationToken'] ?? ''));
		if ($token === '') {
			return [
				'ok' => false,
				'status' => 400,
				'error' => 'Missing relationToken.',
			];
		}

		$config = $this->react->relationSigner()->verify($token, (int) $resolvedUser->id);
		if ($config === null) {
			return [
				'ok' => false,
				'status' => 403,
				'error' => 'Invalid or expired relationToken.',
			];
		}

		$action = strtolower(trim((string) ($requestPayload['action'] ?? 'search')));
		if (in_array($action, self::MUTATING_RELATION_ACTIONS, true)) {
			$reqMethod = strtoupper(trim((string) ($requestPayload['_requestMethod'] ?? (PHP_SAPI !== 'cli' ? ($_SERVER['REQUEST_METHOD'] ?? '') : ''))));
			if ($reqMethod !== '' && $reqMethod !== 'POST') {
				return [
					'ok' => false,
					'status' => 405,
					'error' => 'Method not allowed. POST required.',
				];
			}
			if ((bool) $this->wire()->config->demo) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => 'Mutations are disabled in demo mode.',
				];
			}
			if (!empty($config['readOnly'])) {
				return [
					'ok' => false,
					'status' => 403,
					'error' => 'Relation field is read-only.',
				];
			}
			if ($enforceCsrf && !$this->verifyRequestCsrf($requestPayload)) {
				return [
					'ok' => false,
					'status' => 419,
					'error' => 'CSRF token validation failed.',
				];
			}
		}

		$registry = $this->react->relations();
		$cardinality = strtolower((string) ($config['cardinality'] ?? 'm2o'));
		$dependsValue = $requestPayload['dependsValue'] ?? null;

		$activeResource = strtolower(trim((string) ($config['resource'] ?? 'page')));
		$dependsMap = is_array($config['dependsResourceMap'] ?? null) ? $config['dependsResourceMap'] : [];
		if ($dependsMap !== [] && is_scalar($dependsValue)) {
			$depKey = trim((string) $dependsValue);
			if ($depKey !== '' && isset($dependsMap[$depKey]) && is_string($dependsMap[$depKey])) {
				$activeResource = strtolower(trim($dependsMap[$depKey]));
			}
		}

		$allowedResources = is_array($config['allowedResources'] ?? null)
			? array_values(array_map(static fn($r): string => strtolower(trim((string) $r)), $config['allowedResources']))
			: [];

		$requestedResource = strtolower(trim((string) ($requestPayload['resource'] ?? '')));
		if ($requestedResource !== '' && $requestedResource !== '_all') {
			if ($cardinality === 'm2a') {
				if ($allowedResources !== [] && !in_array($requestedResource, $allowedResources, true)) {
					return [
						'ok' => false,
						'status' => 403,
						'error' => 'Requested resource is not permitted for this polymorphic field.',
					];
				}
				$activeResource = $requestedResource;
			} elseif ($dependsMap !== [] && in_array($requestedResource, array_values($dependsMap), true)) {
				$activeResource = $requestedResource;
			}
		}

		$users = $this->wire()->users;
		$previousUser = $this->wire()->user;
		$switchedUser = false;
		if ((int) $previousUser->id !== (int) $resolvedUser->id) {
			$users->setCurrentUser($resolvedUser);
			$switchedUser = true;
		}

		try {
			if ($action === 'search') {
				$queryParams = [
					'q' => mb_substr(trim((string) ($requestPayload['q'] ?? '')), 0, 250),
					'page' => max(1, (int) ($requestPayload['page'] ?? 1)),
					'limit' => max(1, min(100, (int) ($requestPayload['limit'] ?? $config['limit'] ?? 25))),
					'dependsValue' => $dependsValue,
					'exclude' => is_array($requestPayload['exclude'] ?? null) ? array_slice($requestPayload['exclude'], 0, 500) : [],
				];

				if ($cardinality === 'm2a' && ($requestedResource === '' || $requestedResource === '_all')) {
					$targets = $allowedResources !== [] ? $allowedResources : [$activeResource];
					$mergedItems = [];
					$totalCount = 0;
					$hasMoreAny = false;
					$perResourceLimit = max(5, (int) ceil($queryParams['limit'] / max(1, count($targets))));
					foreach ($targets as $resName) {
						if (!$registry->has($resName)) {
							continue;
						}
						$sub = $registry->get($resName)->query(
							array_replace($queryParams, ['limit' => $perResourceLimit]),
							$config
						);
						foreach ($sub['items'] as $item) {
							$mergedItems[] = $item->toArray();
						}
						$totalCount += $sub['total'];
						$hasMoreAny = $hasMoreAny || $sub['hasMore'];
					}

					return [
						'ok' => true,
						'status' => 200,
						'resource' => '_all',
						'items' => $mergedItems,
						'total' => $totalCount,
						'hasMore' => $hasMoreAny,
					];
				}

				if (!$registry->has($activeResource)) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => sprintf('Unknown relation resource "%s".', $activeResource),
					];
				}

				$res = $registry->get($activeResource)->query($queryParams, $config);

				return [
					'ok' => true,
					'status' => 200,
					'resource' => $activeResource,
					'items' => array_map(static fn(RelationItem $i): array => $i->toArray(), $res['items']),
					'total' => $res['total'],
					'hasMore' => $res['hasMore'],
				];
			}

			if ($action === 'tree') {
				if (!$registry->has($activeResource)) {
					return ['ok' => false, 'status' => 422, 'error' => 'Unknown relation resource.'];
				}
				$parentId = $requestPayload['parentId'] ?? ($config['parentId'] ?? 0);
				$nodes = $registry->get($activeResource)->tree(
					is_numeric($parentId) ? (int) $parentId : (string) $parentId,
					$config
				);

				return [
					'ok' => true,
					'status' => 200,
					'items' => array_map(static fn(RelationItem $i): array => $i->toArray(), $nodes),
				];
			}

			if ($action === 'hydrate') {
				$rawValues = is_array($requestPayload['values'] ?? null) ? array_slice($requestPayload['values'], 0, 500) : [];
				if ($cardinality === 'm2a') {
					$tokens = array_values(array_map('strval', $rawValues));
					$items = $registry->hydrateMorphTokens($tokens, $allowedResources, $config);
				} else {
					if (!$registry->has($activeResource)) {
						return ['ok' => false, 'status' => 422, 'error' => 'Unknown relation resource.'];
					}
					$cleanVals = [];
					foreach ($rawValues as $rv) {
						if (is_int($rv) || is_string($rv)) {
							$cleanVals[] = $rv;
						}
					}
					$items = $registry->get($activeResource)->hydrate($cleanVals, $config);
					if ($items === [] && $cleanVals !== [] && $dependsMap !== []) {
						foreach (array_unique(array_values($dependsMap)) as $altRes) {
							$altName = strtolower(trim((string) $altRes));
							if ($altName === '' || $altName === $activeResource || !$registry->has($altName)) {
								continue;
							}
							$items = $registry->get($altName)->hydrate($cleanVals, $config);
							if ($items !== []) {
								break;
							}
						}
					}
				}

				return [
					'ok' => true,
					'status' => 200,
					'items' => array_map(static fn(RelationItem $i): array => $i->toArray(), $items),
				];
			}

			if ($action === 'o2m_list') {
				$targetRes = strtolower(trim((string) ($config['targetResource'] ?? $activeResource)));
				$ownerId = $config['ownerId'] ?? ($requestPayload['ownerId'] ?? '');
				$foreignField = trim((string) ($config['foreignField'] ?? ''));
				if (!$registry->has($targetRes) || $ownerId === '' || $ownerId === 0 || $foreignField === '') {
					return ['ok' => true, 'status' => 200, 'items' => [], 'total' => 0, 'hasMore' => false];
				}
				$res = $registry->get($targetRes)->queryReverse(
					is_int($ownerId) ? $ownerId : (string) $ownerId,
					$foreignField,
					[
						'q' => trim((string) ($requestPayload['q'] ?? '')),
						'page' => max(1, (int) ($requestPayload['page'] ?? 1)),
						'limit' => max(1, min(100, (int) ($requestPayload['limit'] ?? $config['limit'] ?? 25))),
					],
					$config
				);

				return [
					'ok' => true,
					'status' => 200,
					'items' => array_map(static fn(RelationItem $i): array => $i->toArray(), $res['items']),
					'total' => $res['total'],
					'hasMore' => $res['hasMore'],
				];
			}

			if ($action === 'quick_create') {
				if (empty($config['creatable'])) {
					return ['ok' => false, 'status' => 403, 'error' => 'Inline creation is not enabled for this field.'];
				}
				$createRes = $cardinality === 'o2m'
					? strtolower(trim((string) ($config['targetResource'] ?? $activeResource)))
					: $activeResource;
				if (!$registry->has($createRes)) {
					return ['ok' => false, 'status' => 422, 'error' => 'Unknown relation resource.'];
				}
				$createPayload = is_array($requestPayload['payload'] ?? null) ? $requestPayload['payload'] : $requestPayload;
				$created = $registry->get($createRes)->quickCreate($createPayload, $config);

				return [
					'ok' => true,
					'status' => 200,
					'item' => $created->toArray(),
				];
			}

			if ($action === 'o2m_link' || $action === 'o2m_unlink') {
				if ($cardinality !== 'o2m') {
					return [
						'ok' => false,
						'status' => 403,
						'error' => 'O2M relation action requires cardinality o2m.',
					];
				}
				if ($action === 'o2m_link' && array_key_exists('allowLink', $config) && !$config['allowLink']) {
					return ['ok' => false, 'status' => 403, 'error' => 'Linking existing records is not enabled for this field.'];
				}
				if ($action === 'o2m_unlink' && array_key_exists('allowUnlink', $config) && !$config['allowUnlink']) {
					return ['ok' => false, 'status' => 403, 'error' => 'Unlinking records is not enabled for this field.'];
				}
				$targetRes = strtolower(trim((string) ($config['targetResource'] ?? $activeResource)));
				$ownerId = $config['ownerId'] ?? '';
				$foreignField = trim((string) ($config['foreignField'] ?? ''));
				$targetVal = $requestPayload['targetValue'] ?? ($requestPayload['id'] ?? '');
				if (!$registry->has($targetRes) || $ownerId === '' || $ownerId === 0 || $foreignField === '' || $targetVal === '') {
					return ['ok' => false, 'status' => 422, 'error' => 'Missing ownerId, foreignField, or targetValue.'];
				}

				$adapter = $registry->get($targetRes);
				$cleanOwner = is_int($ownerId) ? $ownerId : (string) $ownerId;
				$cleanTarget = is_int($targetVal) ? $targetVal : (string) $targetVal;
				$ok = $action === 'o2m_link'
					? $adapter->link($cleanOwner, $foreignField, $cleanTarget, $config)
					: $adapter->unlink($cleanOwner, $foreignField, $cleanTarget, $config);

				if (!$ok) {
					return [
						'ok' => false,
						'status' => 422,
						'error' => 'Operation denied or failed.',
					];
				}

				$refreshed = $adapter->queryReverse($cleanOwner, $foreignField, ['page' => 1, 'limit' => $config['limit'] ?? 25], $config);

				return [
					'ok' => true,
					'status' => 200,
					'items' => array_map(static fn(RelationItem $i): array => $i->toArray(), $refreshed['items']),
					'total' => $refreshed['total'],
					'hasMore' => $refreshed['hasMore'],
				];
			}

			return [
				'ok' => false,
				'status' => 400,
				'error' => sprintf('Unsupported relation action "%s".', $action),
			];
		} catch (\Throwable $e) {
			$isClientException = $e instanceof WireException
				|| $e instanceof \InvalidArgumentException
				|| $e instanceof \DomainException;
			if (!$isClientException) {
				$this->wire()->log->error('React relation error: ' . $e->getMessage());
			}
			$isSafeClientException = $isClientException || (bool) $this->wire()->config->debug;

			return [
				'ok' => false,
				'status' => 422,
				'error' => $isSafeClientException ? $e->getMessage() : $this->_('Relation request failed.'),
			];
		} finally {
			if ($switchedUser) {
				$users->setCurrentUser($previousUser);
			}
		}
	}

	/**
	 * Handle multipart/JSON media requests sent to `/_react/media`.
	 */
	public function handleMediaRequest(HookEvent $event): string
	{
		$payload = [];
		$contentType = strtolower(trim((string) ($_SERVER['CONTENT_TYPE'] ?? '')));
		if (str_contains($contentType, 'application/json')) {
			$payload = $this->react->readJsonRequestBody() ?? [];
		}

		if ($payload === []) {
			$post = $this->wire()->input->post->getArray();
			if (is_array($post) && $post !== []) {
				$payload = $post;
			} elseif (!str_contains($contentType, 'application/json') && !str_contains($contentType, 'multipart/form-data')) {
				$payload = $this->react->readJsonRequestBody() ?? [];
			}
		}

		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'POST')));

		return $this->respondJson($this->handleMediaAction($payload, true));
	}

	/**
	 * Execute a signed media action (`upload`, `replace`, `transform`, `inspect`) via `MediaGateway`.
	 *
	 * @param array<string, mixed> $requestPayload
	 * @param array<string, mixed>|null $uploadedFiles
	 * @return array<string, mixed>
	 */
	public function handleMediaAction(
		array $requestPayload,
		bool $enforceCsrf = false,
		?User $user = null,
		?array $uploadedFiles = null,
	): array {
		return $this->react->media()->handleAction($requestPayload, $enforceCsrf, $user, $uploadedFiles);
	}

	/**
	 * Handle `GET` / `POST` editor link, image, variation, and upload requests sent to `/_react/tiptap`.
	 */
	public function handleTiptapRequest(HookEvent $event): string
	{
		$reqMethod = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));
		$payload = [];
		$get = $this->wire()->input->get->getArray();
		if (is_array($get) && $get !== []) {
			$payload = $get;
		}

		if ($reqMethod !== 'GET' && $reqMethod !== 'HEAD') {
			$contentType = strtolower(trim((string) ($_SERVER['CONTENT_TYPE'] ?? '')));
			$bodyData = [];
			if (str_contains($contentType, 'application/json')) {
				$bodyData = $this->react->readJsonRequestBody() ?? [];
			}
			if ($bodyData === []) {
				$post = $this->wire()->input->post->getArray();
				if (is_array($post) && $post !== []) {
					$bodyData = $post;
				} elseif (!str_contains($contentType, 'application/json') && !str_contains($contentType, 'multipart/form-data')) {
					$bodyData = $this->react->readJsonRequestBody() ?? [];
				}
			}
			if ($bodyData !== []) {
				$payload = array_merge($payload, $bodyData);
			}
		}

		$payload['_requestMethod'] = $reqMethod;

		return $this->respondJson($this->handleTiptapAction($payload, true));
	}

	/**
	 * Execute a signed Tiptap link/media action (`pages`, `files`, `images`, `inspectImage`, `resize`, `upload`).
	 *
	 * @param array<string, mixed> $requestPayload
	 * @param array<string, mixed>|null $uploadedFiles
	 * @return array<string, mixed>
	 */
	public function handleTiptapAction(
		array $requestPayload,
		bool $enforceCsrf = false,
		?User $user = null,
		?array $uploadedFiles = null,
	): array {
		return $this->react->tiptap()->handleAction($requestPayload, $enforceCsrf, $user, $uploadedFiles);
	}

	/**
	 * Handle read-only vector icon catalog queries and microtask hydration requests sent to `/_react/icons`.
	 */
	public function handleIconsRequest(HookEvent $event): string
	{
		$get = $this->wire()->input->get->getArray();
		$payload = is_array($get) ? $get : [];
		$payload['_requestMethod'] = strtoupper(trim((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')));

		return $this->respondJson($this->handleIconsAction($payload), 'public, max-age=3600');
	}

	/**
	 * Execute a read-only `/_react/icons` action (`query` or `hydrate`).
	 *
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	public function handleIconsAction(array $params): array
	{
		$reqMethod = strtoupper(trim((string) ($params['_requestMethod'] ?? 'GET')));
		if ($reqMethod !== '' && $reqMethod !== 'GET' && $reqMethod !== 'HEAD') {
			return [
				'ok' => false,
				'status' => 405,
				'error' => 'Method not allowed. GET required.',
			];
		}

		$action = strtolower(trim((string) ($params['action'] ?? 'query')));
		if ($action === 'hydrate') {
			$rawNames = substr(trim((string) ($params['names'] ?? '')), 0, 4096);
			$parts = $rawNames !== ''
				? array_values(array_filter(array_map('trim', explode(',', $rawNames)), static fn(string $s): bool => $s !== ''))
				: [];

			return [
				'ok' => true,
				'status' => 200,
				'icons' => $this->react->icons()->hydrateIcons($parts),
			];
		}

		$query = substr(trim((string) ($params['q'] ?? '')), 0, 120);
		$category = substr(trim((string) ($params['category'] ?? 'all')), 0, 80);
		$style = substr(trim((string) ($params['style'] ?? 'all')), 0, 20);
		$offset = is_numeric($params['offset'] ?? null) ? max(0, min(10000, (int) $params['offset'])) : 0;
		$limit = is_numeric($params['limit'] ?? null) ? max(1, min(200, (int) $params['limit'])) : 96;
		$includeMeta = !empty($params['meta']);

		$res = $this->react->icons()->queryCatalog($query, $category, $style, $offset, $limit, $includeMeta);
		$res['status'] = 200;

		return $res;
	}
}
