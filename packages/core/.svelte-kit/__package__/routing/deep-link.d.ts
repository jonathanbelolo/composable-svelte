/**
 * Deep Linking - Initialize State from URL
 *
 * This module provides functionality to initialize application state
 * from the current URL on page load, enabling deep linking support.
 * Part of Phase 7: URL Synchronization (Browser History Integration)
 *
 * @module routing/deep-link
 */
/**
 * Create initial state from current URL.
 *
 * Parses the current URL and constructs initial state with destination set.
 * Falls back to default initial state if URL doesn't match any route.
 *
 * This enables deep linking - users can bookmark or share URLs that
 * restore full application state on page load.
 *
 * @param defaultState - Default initial state (when URL is root or invalid)
 * @param parse - Function to parse URL path to destination
 * @param setDestination - Function to set destination in state
 * @param parseQuery - Optional function to parse query parameters
 * @param setQuery - Optional function to set query params in state
 * @returns Initial state with destination and query from URL
 *
 * @example
 * ```typescript
 * // In your app initialization
 * import { createStore } from '@composable-svelte/core';
 * import { createInitialStateFromURL, parseQueryParams } from '@composable-svelte/core/routing';
 *
 * const defaultState: AppState = {
 *   destination: null,
 *   searchQuery: '',
 *   page: 1,
 *   items: []
 * };
 *
 * // Parse URL to create initial state (with query params)
 * const initialState = createInitialStateFromURL(
 *   defaultState,
 *   (path) => parseDestination(path, parserConfig),
 *   (state, destination) => ({ ...state, destination }),
 *   (search) => parseQueryParams(search),
 *   (state, query) => ({
 *     ...state,
 *     searchQuery: query.search || '',
 *     page: query.page ? parseInt(query.page) : 1
 *   })
 * );
 *
 * // Create store with initial state from URL
 * const store = createStore({
 *   initialState, // Uses URL if present
 *   reducer: appReducer,
 *   dependencies: {}
 * });
 * ```
 *
 * @example
 * ```typescript
 * // URL: /inventory
 * // → destination: null, uses defaultState
 *
 * // URL: /inventory/item-123
 * // → destination: { type: 'detailItem', state: { itemId: '123' } }
 *
 * // URL: /inventory?search=laptop&page=2
 * // → destination: null, searchQuery: 'laptop', page: 2
 *
 * // URL: /inventory/item-456/edit?tab=details
 * // → destination: { type: 'editItem', state: { itemId: '456' } }, plus query params
 *
 * // URL: /invalid/path
 * // → destination: null, falls back to defaultState
 * ```
 */
export declare function createInitialStateFromURL<State, Dest>(defaultState: State, parse: (path: string) => Dest | null, setDestination: (state: State, destination: Dest | null) => State, parseQuery?: (search: string) => any, setQuery?: (state: State, query: any) => State): State;
//# sourceMappingURL=deep-link.d.ts.map