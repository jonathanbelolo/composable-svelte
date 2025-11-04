/**
 * Theme utilities for managing dark/light mode.
 *
 * @packageDocumentation
 */
/**
 * Theme manager with reactive state.
 *
 * **IMPORTANT**: In SSR contexts (SvelteKit), call `initialize()` in `onMount` to avoid hydration mismatches.
 *
 * @example
 * ```typescript
 * // In a component
 * import { onMount } from 'svelte';
 * import { themeManager } from '@composable-svelte/core/styles';
 *
 * onMount(() => {
 *   themeManager.initialize();
 * });
 *
 * // Get current theme
 * console.log(themeManager.theme); // 'light' | 'dark' | 'system'
 *
 * // Set theme
 * themeManager.setTheme('dark');
 *
 * // Toggle between light and dark
 * themeManager.toggle();
 * ```
 */
export function createThemeManager() {
    // Use plain JavaScript - no $state runes for library code
    // Components must use Svelte stores or create a new manager instance
    let theme = 'system';
    let resolvedTheme = 'light';
    let initialized = false;
    /**
     * Initialize theme from localStorage and system preference.
     * **Must be called in `onMount` for SSR compatibility.**
     */
    function initialize() {
        if (typeof window === 'undefined') {
            return;
        }
        if (initialized) {
            return; // Already initialized
        }
        // Load saved theme or default to system
        const savedTheme = localStorage.getItem('theme');
        theme = savedTheme ?? 'system';
        // Apply the theme
        updateResolvedTheme();
        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', () => {
            if (theme === 'system') {
                updateResolvedTheme();
            }
        });
        initialized = true;
    }
    /**
     * Update the resolved theme (light or dark) based on current theme setting.
     */
    function updateResolvedTheme() {
        if (typeof window === 'undefined') {
            return;
        }
        let newResolvedTheme;
        if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';
            newResolvedTheme = systemTheme;
        }
        else {
            newResolvedTheme = theme;
        }
        resolvedTheme = newResolvedTheme;
        // Apply to DOM
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(newResolvedTheme);
    }
    /**
     * Set the theme.
     */
    function setTheme(newTheme) {
        theme = newTheme;
        if (typeof window !== 'undefined') {
            localStorage.setItem('theme', newTheme);
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
        toggle
    };
}
/**
 * Global theme manager instance (singleton pattern).
 *
 * **SSR Usage**: Call `themeManager.initialize()` in `onMount` to avoid hydration issues.
 *
 * @example
 * ```svelte
 * <script>
 *   import { onMount } from 'svelte';
 *   import { themeManager } from '@composable-svelte/core/styles';
 *
 *   // Initialize in onMount for SSR safety
 *   onMount(() => {
 *     themeManager.initialize();
 *   });
 *
 *   function toggleTheme() {
 *     themeManager.toggle();
 *   }
 * </script>
 *
 * <button onclick={toggleTheme}>
 *   Current theme: {themeManager.resolvedTheme}
 * </button>
 * ```
 */
export const themeManager = createThemeManager();
