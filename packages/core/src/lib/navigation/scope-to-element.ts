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
 * - Returns `null` if the item is not found initially (component should unmount)
 * - Retains last observed child state snapshot during teardown reads when the item is removed
 * - Drops dispatch calls when the item is missing from the parent state
 * - Subscribe only triggers for changes to this specific item
 * - Dispatch wraps actions with { type, id, action }
 *
 * **Legacy Limitations vs Managed Slots:**
 * This is a lightweight, ID-based legacy helper. It does not integrate with
 * `ManagedComposition` or typed slot tokens (`keyedSlot`). It does not establish
 * owner lifecycle tokens, replacement semantics (`replaceOn`), or managed child
 * startup/teardown effects. If an item is replaced by a new item sharing the same ID,
 * legacy scoping cannot track identity separation. Use `keyedSlot` for full
 * identity and lifecycle authority.
 *
 * @template ChildAction - Child item action type (must be specified)
 * @template ParentState - Parent store state type (inferred)
 * @template ParentAction - Parent store action type (inferred)
 * @template ChildState - Child item state type (inferred)
 * @template ID - ID type (inferred)
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
export function scopeToElement<
  ChildAction,
  ParentState = any,
  ParentAction extends { type: string } = any,
  ChildState = any,
  ID extends string | number = any
>(
  parentStore: Store<ParentState, ParentAction>,
  actionType: string,
  getArray: (state: ParentState) => Array<IdentifiedItem<ID, ChildState>>,
  id: ID
): Store<ChildState, ChildAction> | null {
  // Check if item exists initially
  const array = getArray(parentStore.state);
  const item = array.find((i) => i.id === id);

  if (!item) {
    // Item not found - return null so component can handle gracefully
    return null;
  }

  let lastKnownState: ChildState = item.state;

  // Create scoped store interface
  const scopedStore = {
    /**
     * Get the current state of this specific item.
     *
     * If the item has been removed from the array, returns the last observed
     * state snapshot to support safe component teardown without throwing.
     */
    get state(): ChildState {
      const current = getArray(parentStore.state).find((i) => i.id === id);
      if (current) {
        lastKnownState = current.state;
        return current.state;
      }
      return lastKnownState;
    },

    /**
     * Dispatch an action for this specific item.
     *
     * Wraps the child action with the item's ID and action type,
     * then dispatches to the parent store. If the item is missing
     * from the parent array, the dispatch is dropped.
     */
    dispatch(action: ChildAction): void {
      const current = parentStore.select(getArray).find((i) => i.id === id);
      if (!current) {
        return;
      }
      lastKnownState = current.state;
      parentStore.dispatch({
        type: actionType,
        id,
        action
      } as any as ParentAction);
    },

    /**
     * Select a value from this item's state.
     */
    select<T>(selector: (state: ChildState) => T): T {
      return selector(scopedStore.state);
    },

    /**
     * Subscribe to changes in this specific item's state.
     *
     * The listener is only called when this specific item's state changes,
     * not when other items in the array change.
     */
    subscribe(listener: (state: ChildState) => void): () => void {
      // Let the parent provide its synchronous initial delivery and observe
      // listener failures through the same path as subsequent notifications.
      let hasPrevious = false;
      let previousState: ChildState;
      let unsubscribed = false;
      const unsubscribe = parentStore.subscribe((parentState) => {
        if (unsubscribed) return;
        const current = getArray(parentState).find((i) => i.id === id);
        if (!current) {
          if (!hasPrevious) {
            hasPrevious = true;
            previousState = lastKnownState;
            return listener(lastKnownState);
          }
          return;
        }
        lastKnownState = current.state;
        if (!hasPrevious || current.state !== previousState) {
          previousState = current.state;
          hasPrevious = true;
          return listener(current.state);
        }
      });

      return () => {
        unsubscribed = true;
        unsubscribe();
      };
    },

    /**
     * Subscribe to actions dispatched to this specific item.
     *
     * Note: Not all stores support subscribeToActions (it's optional).
     */
    subscribeToActions: parentStore.subscribeToActions
      ? (listener: (action: ChildAction, state: ChildState) => void) => {
          return parentStore.subscribeToActions!((parentAction, parentState) => {
            // Check if this action is for our item
            if (
              parentAction.type === actionType &&
              'id' in parentAction &&
              parentAction.id === id &&
              'action' in parentAction
            ) {
              const current = getArray(parentState).find((i) => i.id === id);
              if (current) {
                lastKnownState = current.state;
                listener((parentAction as any).action, current.state);
              }
            }
          });
        }
      : undefined,

    /**
     * Action history is not maintained for scoped stores.
     */
    history: [],

    /**
     * Destroy is a no-op for scoped stores.
     * The parent store manages lifecycle.
     */
    destroy(): void {
      // No-op - parent store manages lifecycle
    }
  } as Store<ChildState, ChildAction>;

  return scopedStore;
}
