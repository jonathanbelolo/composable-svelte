/**
 * URL Sync Effect - State → URL Updates
 *
 * This module provides effects that update the browser URL when state changes.
 * Part of Phase 7: URL Synchronization (Browser History Integration)
 *
 * @module routing/sync-effect
 */
import type { Effect as EffectType } from '../types';
/**
 * Options for URL sync effect.
 */
export interface URLSyncOptions {
    /**
     * Use replaceState instead of pushState (no history entry).
     * @default false
     */
    replace?: boolean;
    /**
     * Debounce URL updates to prevent thrashing.
     * Only use for high-frequency state updates (e.g., slider, typing).
     * @default undefined (no debouncing)
     */
    debounceMs?: number;
    /**
     * Optional: Serialize query parameters.
     * If provided, query params will be included in URL.
     *
     * @param state - Application state
     * @returns Query string (without leading '?'), or empty string if no params
     */
    serializeQuery?: <State>(state: State) => string;
}
/**
 * Create an effect that syncs state to URL.
 *
 * Compares current URL with expected URL (from state).
 * If different, updates URL using history.pushState or history.replaceState.
 *
 * The effect includes metadata to prevent infinite loops when
 * browser navigation triggers actions that update state.
 *
 * @param serialize - Function to serialize state to URL path
 * @param options - URL sync options (replace, debounce)
 * @returns Effect creator function
 *
 * @example
 * ```typescript
 * // Basic usage (no debouncing)
 * const urlSyncEffect = createURLSyncEffect<AppState, AppAction>(
 *   (state) => serializeDestination(state.destination, config)
 * );
 *
 * const appReducer = (state, action, deps) => {
 *   const [newState, coreEffect] = coreReducer(state, action, deps);
 *   const urlEffect = urlSyncEffect(newState);
 *   return [newState, Effect.batch(coreEffect, urlEffect)];
 * };
 *
 * // With replace (no history entry)
 * const urlSyncEffect = createURLSyncEffect<AppState, AppAction>(
 *   (state) => serializeDestination(state.destination, config),
 *   { replace: true }
 * );
 *
 * // With debouncing (for high-frequency updates)
 * const urlSyncEffect = createURLSyncEffect<AppState, AppAction>(
 *   (state) => serializeDestination(state.destination, config),
 *   { debounceMs: 300 }
 * );
 * ```
 */
export declare function createURLSyncEffect<State, Action>(serialize: (state: State) => string, options?: URLSyncOptions): (state: State) => EffectType<Action>;
//# sourceMappingURL=sync-effect.d.ts.map