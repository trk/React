<?php

declare(strict_types=1);

namespace Totoglu\React\Workspace;

/**
 * Built-in workspace shell layouts supported by `React` (`ProcessReact` & `ProcessReactWorkspace`).
 */
enum ShellLayout: string
{
	case Topbar = 'topbar';
	case Sidebar = 'sidebar';

	/**
	 * Try resolving a built-in layout case from an untrusted or unnormalized input value.
	 */
	public static function tryFromNormalized(mixed $value): ?self
	{
		if ($value instanceof self) {
			return $value;
		}
		if (!is_string($value)) {
			return null;
		}

		return self::tryFrom(strtolower(trim($value)));
	}

	/**
	 * Resolve a built-in layout case from an untrusted input value, falling back to `Topbar`.
	 */
	public static function fromInput(mixed $value): self
	{
		return self::tryFromNormalized($value) ?? self::Topbar;
	}

	/**
	 * Return all built-in layout identifier strings.
	 *
	 * @return list<string>
	 */
	public static function values(): array
	{
		return array_map(static fn(self $case): string => $case->value, self::cases());
	}

	/**
	 * Human-readable English label for the built-in layout.
	 */
	public function label(): string
	{
		return match ($this) {
			self::Topbar => 'Top Bar',
			self::Sidebar => 'Sidebar',
		};
	}

	/**
	 * Concise English description for the built-in layout.
	 */
	public function description(): string
	{
		return match ($this) {
			self::Topbar => 'Horizontal top navigation bar with inline workspace links and section tabs.',
			self::Sidebar => 'Collapsible left navigation sidebar with module switcher and account footer.',
		};
	}

	/**
	 * Vector icon identifier for the built-in layout.
	 */
	public function icon(): string
	{
		return match ($this) {
			self::Topbar => 'layout-navbar',
			self::Sidebar => 'layout-sidebar',
		};
	}

	/**
	 * Whether this built-in layout supports collapsible rail state.
	 */
	public function supportsCollapse(): bool
	{
		return match ($this) {
			self::Topbar => false,
			self::Sidebar => true,
		};
	}
}
