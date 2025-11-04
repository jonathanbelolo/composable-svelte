/**
 * Theme utilities for managing dark/light mode.
 *
 * @packageDocumentation
 */
export type Theme = 'light' | 'dark' | 'system';
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
export declare function createThemeManager(): {
    readonly theme: Theme;
    readonly resolvedTheme: "light" | "dark";
    readonly initialized: boolean;
    initialize: () => void;
    setTheme: (newTheme: Theme) => void;
    toggle: () => void;
};
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
export declare const themeManager: {
    readonly theme: Theme;
    readonly resolvedTheme: "light" | "dark";
    readonly initialized: boolean;
    initialize: () => void;
    setTheme: (newTheme: Theme) => void;
    toggle: () => void;
};
//# sourceMappingURL=theme.d.ts.map