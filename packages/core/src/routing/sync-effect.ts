/**
 * URL Sync Effect - State → URL Updates
 *
 * This module provides effects that update the browser URL when state changes.
 * Part of Phase 7: URL Synchronization (Browser History Integration)
 *
 * @module routing/sync-effect
 */

import { Effect } from '../effect';
import type { Effect as EffectType } from '../types';

/**
 * Normalize query string for comparison.
 *
 * Sorts parameters alphabetically to ensure consistent comparison
 * regardless of parameter order.
 *
 * @param query - Query string (without leading '?')
 * @returns Normalized query string with sorted parameters
 *
 * @example
 * ```typescript
 * normalizeQueryString('b=2&a=1');
 * // → 'a=1&b=2'
 *
 * normalizeQueryString('');
 * // → ''
 * ```
 */
function normalizeQueryString(query: string): string {
	if (!query) return '';
	return query.split('&').sort().join('&');
}

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
export function createURLSyncEffect<State, Action>(
	serialize: (state: State) => string,
	options: URLSyncOptions = {}
): (state: State) => EffectType<Action> {
	// Shared timeout ID for debouncing
	let pendingTimeout: number | undefined;

	return (state: State): EffectType<Action> => {
		const expectedPath = serialize(state);
		const currentPath = window.location.pathname;

		// Serialize query params if provided
		const expectedQuery = options.serializeQuery ? options.serializeQuery(state) : '';
		const currentQuery = window.location.search.startsWith('?')
			? window.location.search.slice(1)
			: window.location.search;

		// Normalize query strings for comparison (order-independent)
		const expectedQueryNormalized = normalizeQueryString(expectedQuery);
		const currentQueryNormalized = normalizeQueryString(currentQuery);

		// Build full URLs for comparison
		const expectedURL = expectedQueryNormalized
			? `${expectedPath}?${expectedQueryNormalized}`
			: expectedPath;
		const currentURL = currentQueryNormalized ? `${currentPath}?${currentQueryNormalized}` : currentPath;

		// No change needed
		if (expectedURL === currentURL) {
			return Effect.none();
		}

		// URL needs to be updated
		return Effect.fireAndForget(() => {
			// Metadata to prevent infinite loops
			// Browser history sync will check this flag
			const stateMetadata = { composableSvelteSync: true };

			// Build URL to push (using original query order, not normalized)
			const urlToPush = expectedQuery ? `${expectedPath}?${expectedQuery}` : expectedPath;

			if (options.debounceMs) {
				// Debounced update
				if (pendingTimeout !== undefined) {
					clearTimeout(pendingTimeout);
				}
				pendingTimeout = window.setTimeout(() => {
					const method = options.replace ? 'replaceState' : 'pushState';
					history[method](stateMetadata, '', urlToPush);
					pendingTimeout = undefined;
				}, options.debounceMs);
			} else {
				// Immediate update
				const method = options.replace ? 'replaceState' : 'pushState';
				history[method](stateMetadata, '', urlToPush);
			}
		});
	};
}
