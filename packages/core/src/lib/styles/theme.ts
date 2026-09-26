import { writable, type Readable } from 'svelte/store';

/**
 * Theme utilities for managing dark/light mode.
 *
 * @packageDocumentation
 */

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeState {
	theme: Theme;
	resolvedTheme: 'light' | 'dark';
}

export interface ThemeManager extends Readable<ThemeState> {
	readonly theme: Theme;
	readonly resolvedTheme: 'light' | 'dark';
	readonly initialized: boolean;
	initialize(): () => void;
	setTheme(theme: Theme): void;
	toggle(): void;
	destroy(): void;
}

function isValidTheme(value: unknown): value is Theme {
	return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Theme manager factory with reactive store state.
 *
 * Creates an isolated theme manager instance implementing the Svelte store contract (`ThemeManager`).
 * In SSR/per-request contexts (such as SvelteKit server hooks or root components),
 * construct an isolated manager via `createThemeManager()` and provide it through context
 * (`setContext`/`getContext`) to avoid sharing mutable state across concurrent requests.
 * Host integration owns per-request injection.
 *
 * For browser-only applications, the global singleton `themeManager` may be used directly.
 *
 * No app-owned listener plumbing is required: the manager owns registration
 * and teardown of system preference media query listeners.
 *
 * **Lifecycle & Cleanup**:
 * `initialize()` returns an idempotent cleanup teardown function that MUST be returned from `onMount`
 * (e.g. `return themeManager.initialize();`). Discarding the returned cleanup prevents automatic
 * teardown when the owner unmounts and leaks lease tokens.
 *
 * `destroy()` forcefully retires all current owners, clearing leases and detaching listeners.
 * Any release callbacks from previous initializations become inert no-ops.
 *
 * @param initialTheme - Initial theme seed ('light' | 'dark' | 'system'). Defaults to 'system'.
 * Precedence: `initialTheme` seeds the manager prior to browser initialization. Once `initialize()`
 * runs in the browser, any valid persisted theme in `localStorage` takes precedence over this seed.
 *
 * @example
 * ```typescript
 * // In a component
 * import { onMount } from 'svelte';
 * import { themeManager } from '@composable-svelte/core/styles';
 *
 * onMount(() => {
 *   return themeManager.initialize(); // returns cleanup teardown (MUST return from onMount)
 * });
 *
 * // Svelte store contract ($themeManager) and imperative getters both supported
 * console.log(themeManager.theme); // 'light' | 'dark' | 'system'
 * themeManager.setTheme('dark');
 * themeManager.toggle();
 * ```
 */
export function createThemeManager(initialTheme: Theme = 'system'): ThemeManager {
	let theme: Theme = isValidTheme(initialTheme) ? initialTheme : 'system';
	let resolvedTheme: 'light' | 'dark' = theme === 'dark' ? 'dark' : 'light';
	let initialized = false;
	const leases = new Set<symbol>();

	let mediaQuery: MediaQueryList | null = null;
	let mediaListener: (() => void) | null = null;

	const changes = writable<ThemeState>({ theme, resolvedTheme });
	const notify = () => changes.set({ theme, resolvedTheme });

	/**
	 * Update the resolved theme (light or dark) based on current theme setting.
	 */
	function updateResolvedTheme() {
		let newResolvedTheme: 'light' | 'dark';

		if (theme === 'system') {
			const isDark =
				typeof window !== 'undefined' &&
				typeof window.matchMedia === 'function' &&
				window.matchMedia('(prefers-color-scheme: dark)').matches;
			newResolvedTheme = isDark ? 'dark' : 'light';
		} else {
			newResolvedTheme = theme;
		}

		resolvedTheme = newResolvedTheme;

		// Apply to DOM if available
		if (typeof document !== 'undefined' && document.documentElement) {
			const root = document.documentElement;
			root.classList.remove('light', 'dark');
			root.classList.add(newResolvedTheme);
		}

		notify();
	}

	/**
	 * Remove system preference listener and reset initialization state.
	 * Forcefully retires all current owner leases; old teardowns cannot affect new ones.
	 */
	function destroy() {
		leases.clear();
		const mq = mediaQuery;
		const ml = mediaListener;
		mediaQuery = null;
		mediaListener = null;
		initialized = false;
		if (mq && ml) {
			try {
				if (typeof mq.removeEventListener === 'function') {
					mq.removeEventListener('change', ml);
				} else if (typeof (mq as any).removeListener === 'function') {
					(mq as any).removeListener(ml);
				}
			} catch {
				// Ignore listener removal errors during teardown
			}
		}
	}

	/**
	 * Initialize theme from localStorage and system preference.
	 * Returns an idempotent teardown for this initialization owner that MUST be returned from onMount.
	 * Multiple owners share one listener, removed when the last owner releases it.
	 * destroy() forcefully retires all current owners; old teardowns cannot affect new ones.
	 *
	 * **Must be called in `onMount` for SSR compatibility.**
	 */
	function initialize(): () => void {
		if (typeof window === 'undefined') {
			return () => {};
		}

		const token = Symbol('theme-owner');
		leases.add(token);
		const release = () => {
			if (leases.delete(token) && leases.size === 0) destroy();
		};
		if (initialized) return release;

		initialized = true;

		try {
			// Load saved theme or default to system, tolerating storage failures and invalid values
			try {
				if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
					const savedTheme = localStorage.getItem('theme');
					if (isValidTheme(savedTheme)) {
						theme = savedTheme;
					}
				}
			} catch {
				// Ignore storage read errors (e.g. security policy, private browsing)
			}

			// Listen for system theme changes without external plumbing
			if (typeof window.matchMedia === 'function') {
				mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
				const onChange = () => {
					if (mediaListener === onChange && initialized && theme === 'system') {
						updateResolvedTheme();
					}
				};
				mediaListener = onChange;
				if (typeof mediaQuery.addEventListener === 'function') {
					mediaQuery.addEventListener('change', mediaListener);
				} else if (typeof (mediaQuery as any).addListener === 'function') {
					(mediaQuery as any).addListener(mediaListener);
				}
			}

			// Apply initial resolved theme
			updateResolvedTheme();
		} catch (error) {
			try {
				destroy();
			} catch {
				// Preserve original thrown error even if cleanup throws
			}
			throw error;
		}

		return release;
	}

	/**
	 * Set the theme.
	 */
	function setTheme(newTheme: Theme) {
		if (!isValidTheme(newTheme)) {
			return;
		}

		theme = newTheme;

		try {
			if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
				localStorage.setItem('theme', newTheme);
			}
		} catch {
			// Ignore storage write errors (e.g. quota exceeded, disabled storage)
		}

		updateResolvedTheme();
	}

	/**
	 * Toggle between light and dark (ignoring system preference).
	 */
	function toggle() {
		const newTheme = resolvedTheme === 'light' ? 'dark' : 'light';
		setTheme(newTheme);
	}

	return {
		get theme() {
			return theme;
		},
		get resolvedTheme() {
			return resolvedTheme;
		},
		get initialized() {
			return initialized;
		},
		initialize,
		setTheme,
		toggle,
		destroy,
		subscribe: changes.subscribe
	};
}

/**
 * Global theme manager instance (singleton pattern for browser-only usage).
 *
 * In SSR/per-request contexts (such as SvelteKit server hooks or root components),
 * instantiate an isolated manager per request using `createThemeManager()` and provide it
 * through context (`setContext`/`getContext`) to prevent state leakage across concurrent requests.
 * Host integration owns per-request injection.
 *
 * **SSR Usage**: Call `themeManager.initialize()` in `onMount` to avoid hydration issues,
 * and ensure the returned cleanup function is returned from `onMount`.
 *
 * @example
 * ```svelte
 * <script>
 *   import { onMount } from 'svelte';
 *   import { themeManager } from '@composable-svelte/core/styles';
 *
 *   // Initialize in onMount for SSR safety
 *   onMount(() => {
 *     return themeManager.initialize(); // MUST return cleanup teardown
 *   });
 *
 *   function toggleTheme() {
 *     themeManager.toggle();
 *   }
 * </script>
 *
 * <button onclick={toggleTheme}>
 *   Current theme: {$themeManager.resolvedTheme}
 * </button>
 * ```
 */
export const themeManager: ThemeManager = createThemeManager();
