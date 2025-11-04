/**
 * scopeToElement - View-layer scoping for collection items
 *
 * Creates a scoped store for a specific item in a collection by ID.
 * Eliminates boilerplate for manual store scoping in components.
 *
 * @example
 * ```svelte
 * {#each $store.counters as counter (counter.id)}
 *   <Counter store={scopeToElement(store, 'counter', s => s.counters, counter.id)} />
 * {/each}
 * ```
 */
import type { Store } from '../types.js';
import type { IdentifiedItem } from '../composition/for-each.js';
/**
 * Create a scoped store for a specific item in a collection.
 *
 * This function creates a "virtual" store that operates on a single item
 * within a parent array. Dispatch calls are wrapped with the item's ID,
 * and state access extracts the specific item from the parent state.
 *
 * **Use case:**
 * When you have a dynamic collection of child components, this allows
 * each child to receive its own Store instance that feels like a normal
 * store, but actually delegates to the parent.
 *
 * **Behavior:**
 * - Returns `null` if the item is not found (component should unmount)
 * - Throws error if item is accessed after removal
 * - Subscribe only triggers for changes to this specific item
 * - Dispatch wraps actions with { type, id, action }
 *
 * @template ParentState - Parent store state type
 * @template ParentAction - Parent store action type
 * @template ChildState - Child item state type
 * @template ChildAction - Child item action type
 * @template ID - ID type (string | number)
 *
 * @param parentStore - The parent store containing the array
 * @param actionType - The action type string for routing (e.g., 'counter')
 * @param getArray - Function to extract the array from parent state
 * @param id - The ID of the specific item to scope to
 * @returns Scoped store for the item, or null if not found
 *
 * @example
 * ```typescript
 * // In a component:
 * interface ParentState {
 *   counters: Array<{ id: string; state: CounterState }>;
 * }
 *
 * type ParentAction =
 *   | { type: 'counter'; id: string; action: CounterAction };
 *
 * const parentStore = createStore<ParentState, ParentAction>({...});
 *
 * // Scope to a specific counter:
 * const counterStore = scopeToElement(
 *   parentStore,
 *   'counter',
 *   s => s.counters,
 *   'counter-1'
 * );
 *
 * if (counterStore) {
 *   // Use like a normal store
 *   counterStore.dispatch({ type: 'increment' });
 *   console.log(counterStore.state.count);
 * }
 * ```
 *
 * @example
 * ```svelte
 * <!-- In a Svelte component: -->
 * <script lang="ts">
 *   import { scopeToElement } from '@composable-svelte/core';
 *
 *   let { parentStore, itemId } = $props();
 *
 *   const itemStore = scopeToElement(
 *     parentStore,
 *     'item',
 *     s => s.items,
 *     itemId
 *   );
 * </script>
 *
 * {#if itemStore}
 *   <ItemComponent store={itemStore} />
 * {/if}
 * ```
 */
export declare function scopeToElement<ParentState, ParentAction extends {
    type: string;
}, ChildState, ChildAction, ID extends string | number>(parentStore: Store<ParentState, ParentAction>, actionType: string, getArray: (state: ParentState) => Array<IdentifiedItem<ID, ChildState>>, id: ID): Store<ChildState, ChildAction> | null;
//# sourceMappingURL=scope-to-element.d.ts.map