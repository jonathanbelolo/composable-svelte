/**
 * State serialization for server-side rendering.
 *
 * Converts store state to JSON for transmission to the client.
 */

import type { Store } from '../types.js';
import type { StateSerializer } from './serializer.js';

/**
 * The out-half of a {@link StateSerializer}.
 *
 * Taken as a `Pick` so a caller passes the whole pair object to both halves of
 * the round trip; a replacer without its matching reviver writes a tag nothing
 * untags.
 */
export type StateReplacer = Pick<StateSerializer, 'replacer'>;

/**
 * Serializes store state to JSON string for client hydration.
 *
 * **This does not enforce anything, and it is important to know what it lets
 * through.** It is `JSON.stringify` with a clearer error, so only a `BigInt` or
 * a cycle actually throws. A `Date` becomes an ISO string, a `Map` or `Set`
 * becomes `{}` with every entry lost, and an `undefined` property disappears —
 * all silently, and all while TypeScript still claims the original type on the
 * client.
 *
 * Pass a {@link StateSerializer} — `createTaggedSerializer()` handles `Date`,
 * `Map` and `Set` — and give the *same object* to `parseState` or
 * `hydrateStore` on the way back.
 *
 * @template State - The state type
 * @template Action - The action type
 *
 * @param store - The store to serialize
 * @returns JSON string containing the serialized state
 *
 * @throws {TypeError} On a `BigInt` or a circular reference. Note that a `Date`,
 *   `Map` or `Set` does **not** throw — see above.
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
  store: Store<State, Action>,
  serializer?: StateReplacer
): string {
  if (!store) {
    throw new TypeError('serializeStore: store is required');
  }

  try {
    // State should always be serializable by design
    // No need to validate - JSON.stringify will throw if not serializable
    return JSON.stringify(store.state, serializer?.replacer);
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
export function serializeState<State>(state: State, serializer?: StateReplacer): string {
  if (state === undefined) {
    throw new TypeError('serializeState: state is required');
  }

  try {
    return JSON.stringify(state, serializer?.replacer);
  } catch (error) {
    throw new TypeError(
      `serializeState: State is not serializable. ` +
      `State should only contain plain objects, arrays, and primitives. ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
