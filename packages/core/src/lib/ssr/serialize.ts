/**
 * State serialization for server-side rendering.
 *
 * Converts store state to JSON for transmission to the client.
 */

import type { Store } from '../types';

/**
 * Serializes store state to JSON string for client hydration.
 *
 * The state MUST be pure, serializable data (no functions, Map, Set, etc.).
 * This is enforced by Composable Svelte's architecture - state is always
 * plain objects/arrays/primitives.
 *
 * @template State - The state type
 * @template Action - The action type
 *
 * @param store - The store to serialize
 * @returns JSON string containing the serialized state
 *
 * @throws {TypeError} If state contains non-serializable values (should never happen)
 *
 * @example
 * ```typescript
 * // Server
 * const store = createStore({
 *   initialState: { items: [...], user: {...} },
 *   reducer,
 *   dependencies: {}  // Empty on server
 * });
 *
 * const html = renderToHTML(App, { store });
 * const stateJSON = serializeStore(store);
 *
 * // Embed in HTML
 * const fullHTML = `
 *   ${html}
 *   <script id="__COMPOSABLE_SVELTE_STATE__" type="application/json">
 *     ${stateJSON}
 *   </script>
 * `;
 * ```
 */
export function serializeStore<State, Action>(
  store: Store<State, Action>
): string {
  if (!store) {
    throw new TypeError('serializeStore: store is required');
  }

  try {
    // State should always be serializable by design
    // No need to validate - JSON.stringify will throw if not serializable
    return JSON.stringify(store.state);
  } catch (error) {
    // This should never happen if architecture is followed correctly
    throw new TypeError(
      `serializeStore: State is not serializable. ` +
      `State should only contain plain objects, arrays, and primitives. ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Serializes state data to JSON string (alternative API).
 *
 * Use this if you have state but not a Store instance.
 *
 * @template State - The state type
 *
 * @param state - The state to serialize
 * @returns JSON string containing the serialized state
 *
 * @example
 * ```typescript
 * const state = { items: [...], user: {...} };
 * const stateJSON = serializeState(state);
 * ```
 */
export function serializeState<State>(state: State): string {
  if (state === undefined) {
    throw new TypeError('serializeState: state is required');
  }

  try {
    return JSON.stringify(state);
  } catch (error) {
    throw new TypeError(
      `serializeState: State is not serializable. ` +
      `State should only contain plain objects, arrays, and primitives. ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
