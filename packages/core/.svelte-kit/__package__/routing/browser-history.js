/**
 * Browser History Integration - URL ↔ State Sync
 *
 * This module provides bidirectional synchronization between browser
 * history (back/forward buttons) and application state.
 * Part of Phase 7: URL Synchronization (Browser History Integration)
 *
 * @module routing/browser-history
 */
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
export function syncBrowserHistory(store, config) {
    // Track the last pushState timestamp to detect programmatic navigation
    let lastPushStateTime = 0;
    const PUSHSTATE_DEBOUNCE_MS = 50; // Time window to ignore popstate after pushState
    // Intercept history.pushState to track when we programmatically navigate
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);
    history.pushState = function (state, title, url) {
        if (state?.composableSvelteSync) {
            lastPushStateTime = Date.now();
        }
        return originalPushState(state, title, url);
    };
    history.replaceState = function (state, title, url) {
        if (state?.composableSvelteSync) {
            lastPushStateTime = Date.now();
        }
        return originalReplaceState(state, title, url);
    };
    // Listen to browser back/forward
    const handlePopState = (event) => {
        // Check if this popstate fired immediately after our pushState/replaceState
        // If so, ignore it to prevent dispatching the same action twice
        const timeSinceLastPush = Date.now() - lastPushStateTime;
        if (event.state?.composableSvelteSync && timeSinceLastPush < PUSHSTATE_DEBOUNCE_MS) {
            // Popstate triggered by our own pushState - ignore it
            // This prevents infinite loops where:
            // 1. Action updates state
            // 2. Effect updates URL (pushState)
            // 3. popstate fires immediately
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
        // Restore original history methods
        history.pushState = originalPushState;
        history.replaceState = originalReplaceState;
    };
}
