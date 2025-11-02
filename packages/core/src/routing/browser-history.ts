/**
 * Browser History Integration - URL ↔ State Sync
 *
 * This module provides bidirectional synchronization between browser
 * history (back/forward buttons) and application state.
 * Part of Phase 7: URL Synchronization (Browser History Integration)
 *
 * @module routing/browser-history
 */

import type { Store } from '../types';

/**
 * Configuration for browser history synchronization.
 *
 * @template State - Application state type
 * @template Action - Application action type
 * @template Dest - Destination state type
 */
export interface BrowserHistoryConfig<State, Action, Dest> {
	/**
	 * Parse URL path to destination state.
	 */
	parse: (path: string) => Dest | null;

	/**
	 * Serialize state to URL path.
	 * Used to determine if URL needs updating.
	 */
	serialize: (state: State) => string;

	/**
	 * Optional: Parse query parameters.
	 * If provided, query params will be included in URL sync.
	 *
	 * @param search - URL search string (e.g., '?page=2&search=laptop')
	 * @returns Parsed query parameters
	 */
	parseQuery?: (search: string) => any;

	/**
	 * Optional: Serialize query parameters.
	 * If provided, query params will be included in URL sync.
	 *
	 * @param state - Application state
	 * @returns Query string (without leading '?'), or empty string if no params
	 */
	serializeQuery?: (state: State) => string;

	/**
	 * Convert destination state to action.
	 *
	 * This action will be dispatched when browser navigates
	 * (back/forward button, manual URL change).
	 *
	 * @param destination - Parsed destination state, or null for root
	 * @param query - Parsed query parameters (if parseQuery provided)
	 * @returns Action to dispatch, or null to skip
	 */
	destinationToAction: (destination: Dest | null, query?: any) => Action | null;
}

/**
 * Sync browser history with store state.
 *
 * Sets up bidirectional synchronization:
 * 1. Browser back/forward → parse URL → dispatch action
 * 2. State changes → serialize → update URL (via effects in reducer)
 *
 * This function only handles the URL → State direction.
 * The State → URL direction is handled by `createURLSyncEffect` in the reducer.
 *
 * @param store - Store to sync with browser history
 * @param config - Browser history configuration
 * @returns Cleanup function to remove listeners
 *
 * @example
 * ```typescript
 * import { createStore } from '@composable-svelte/core';
 * import { syncBrowserHistory } from '@composable-svelte/core/routing';
 *
 * const store = createStore({
 *   initialState,
 *   reducer: appReducer,
 *   dependencies: {}
 * });
 *
 * const cleanup = syncBrowserHistory(store, {
 *   parse: (path) => parseDestination(path, parserConfig),
 *   serialize: (state) => serializeDestination(state.destination, serializerConfig),
 *   destinationToAction: (dest) => {
 *     if (!dest) return { type: 'closeDestination' };
 *     if (dest.type === 'detailItem') {
 *       return { type: 'itemSelected', itemId: dest.state.itemId };
 *     }
 *     // ... other mappings
 *     return null;
 *   }
 * });
 *
 * // Cleanup on unmount
 * onDestroy(() => {
 *   cleanup();
 * });
 * ```
 */
export function syncBrowserHistory<State, Action, Dest>(
	store: Store<State, Action>,
	config: BrowserHistoryConfig<State, Action, Dest>
): () => void {
	// Listen to browser back/forward
	const handlePopState = (event: PopStateEvent) => {
		// Check if this navigation was triggered by our code
		// We mark our own pushState calls with metadata
		if (event.state?.composableSvelteSync) {
			// Navigation came from our URL sync effect - ignore it
			// This prevents infinite loops where:
			// 1. Action updates state
			// 2. Effect updates URL
			// 3. popstate fires
			// 4. We dispatch action again (loop!)
			return;
		}

		// Navigation triggered by browser (back/forward button or manual URL change)
		const path = window.location.pathname;
		const destination = config.parse(path);

		// Parse query parameters if provided
		const query = config.parseQuery ? config.parseQuery(window.location.search) : undefined;

		// Convert destination to action
		const action = config.destinationToAction(destination, query);
		if (action) {
			store.dispatch(action);
		}
	};

	// Register event listener
	window.addEventListener('popstate', handlePopState);

	// Return cleanup function
	return () => {
		window.removeEventListener('popstate', handlePopState);
	};
}
