/**
 * State hydration for client-side rendering.
 *
 * Restores server-rendered state in the browser and reactivates effects.
 */

import { createStore } from '../store.js';
import type { Store, StoreConfig } from '../types.js';

/**
 * Hydrates a store from serialized state JSON.
 *
 * This function:
 * 1. Parses the JSON state from the server
 * 2. Creates a store with that state as initialState
 * 3. Injects client-side dependencies (API, storage, etc.)
 * 4. Effects execute normally on client (not deferred)
 *
 * @template State - The state type
 * @template Action - The action type
 * @template Dependencies - The dependencies type
 *
 * @param data - JSON string containing serialized state
 * @param config - Store configuration (reducer, dependencies)
 * @returns Hydrated store ready for client interactions
 *
 * @throws {TypeError} If data is invalid JSON
 *
 * @example
 * ```typescript
 * // Client entry (client.ts)
 * import { hydrateStore } from '@composable-svelte/core/ssr';
 * import { mount } from 'svelte';
 *
 * // Read state from script tag
 * const el = document.getElementById('__COMPOSABLE_SVELTE_STATE__');
 * const stateJSON = el?.textContent;
 *
 * if (!stateJSON) {
 *   throw new Error('No hydration data found');
 * }
 *
 * // Hydrate with client dependencies
 * const store = hydrateStore(stateJSON, {
 *   initialState: {},  // Overridden by hydration
 *   reducer: appReducer,
 *   dependencies: {
 *     api: createAPIClient(),
 *     storage: createLocalStorage(),
 *     webSocket: createWebSocket()
 *   }
 * });
 *
 * // Mount app
 * mount(App, { target: document.body, props: { store } });
 * ```
 */
export function hydrateStore<State, Action, Dependencies = any>(
  data: string,
  config: Omit<StoreConfig<State, Action, Dependencies>, 'initialState'> & {
    initialState?: State;
  }
): Store<State, Action> {
  if (!data) {
    throw new TypeError('hydrateStore: data is required');
  }

  if (!config) {
    throw new TypeError('hydrateStore: config is required');
  }

  if (!config.reducer) {
    throw new TypeError('hydrateStore: config.reducer is required');
  }

  let hydratedState: State;

  try {
    hydratedState = JSON.parse(data) as State;
  } catch (error) {
    throw new TypeError(
      `hydrateStore: Failed to parse state JSON. ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Create store with hydrated state
  // The initialState from config is ignored - we use the hydrated state
  return createStore<State, Action, Dependencies>({
    ...config,
    initialState: hydratedState,
    // Ensure SSR is disabled for client hydration (effects should run)
    ssr: {
      deferEffects: false
    }
  });
}

/**
 * Parses serialized state JSON (alternative API).
 *
 * Use this if you want to parse state separately from creating a store.
 *
 * @template State - The state type
 *
 * @param data - JSON string containing serialized state
 * @returns Parsed state object
 *
 * @example
 * ```typescript
 * const stateJSON = document.getElementById('__STATE__')?.textContent;
 * const state = parseState<AppState>(stateJSON);
 *
 * // Later, create store with this state
 * const store = createStore({
 *   initialState: state,
 *   reducer,
 *   dependencies
 * });
 * ```
 */
export function parseState<State>(data: string): State {
  if (!data) {
    throw new TypeError('parseState: data is required');
  }

  try {
    return JSON.parse(data) as State;
  } catch (error) {
    throw new TypeError(
      `parseState: Failed to parse state JSON. ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
