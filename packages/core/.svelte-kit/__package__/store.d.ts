/**
 * Store implementation for Composable Svelte.
 *
 * The Store is the runtime that manages state, processes actions, and executes effects.
 * It uses Svelte 5's $state rune for reactivity.
 */
import type { Store, StoreConfig } from './types.js';
/**
 * Create a Store for a feature.
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: { count: 0 },
 *   reducer: counterReducer,
 *   dependencies: { apiClient }
 * });
 * ```
 */
export declare function createStore<State, Action, Dependencies = any>(config: StoreConfig<State, Action, Dependencies>): Store<State, Action>;
//# sourceMappingURL=store.d.ts.map