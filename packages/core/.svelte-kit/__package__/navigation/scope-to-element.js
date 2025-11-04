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
export function scopeToElement(parentStore, actionType, getArray, id) {
    // Check if item exists initially
    const array = getArray(parentStore.state);
    const item = array.find((i) => i.id === id);
    if (!item) {
        // Item not found - return null so component can handle gracefully
        return null;
    }
    // Create scoped store interface
    const scopedStore = {
        /**
         * Get the current state of this specific item.
         *
         * Throws if the item has been removed from the array.
         */
        get state() {
            const current = getArray(parentStore.state).find((i) => i.id === id);
            if (!current) {
                throw new Error(`[scopeToElement] Item with id "${id}" was removed from the array. ` +
                    `Component should have unmounted before accessing state.`);
            }
            return current.state;
        },
        /**
         * Dispatch an action for this specific item.
         *
         * Wraps the child action with the item's ID and action type,
         * then dispatches to the parent store.
         */
        dispatch(action) {
            parentStore.dispatch({
                type: actionType,
                id,
                action
            });
        },
        /**
         * Select a value from this item's state.
         */
        select(selector) {
            return selector(this.state);
        },
        /**
         * Subscribe to changes in this specific item's state.
         *
         * The listener is only called when this specific item's state changes,
         * not when other items in the array change.
         */
        subscribe(listener) {
            // Call listener with initial state
            const currentItem = getArray(parentStore.state).find((i) => i.id === id);
            if (currentItem) {
                listener(currentItem.state);
            }
            // Track previous state for comparison
            let previousState = currentItem ? currentItem.state : null;
            // Subscribe to parent store
            const unsubscribe = parentStore.subscribe((parentState) => {
                const current = getArray(parentState).find((i) => i.id === id);
                if (current) {
                    // Item still exists - check if state changed
                    if (current.state !== previousState) {
                        previousState = current.state;
                        listener(current.state);
                    }
                }
                else {
                    // Item was removed - no notification (component should unmount)
                    previousState = null;
                }
            });
            return unsubscribe;
        },
        /**
         * Subscribe to actions dispatched to this specific item.
         *
         * Note: Not all stores support subscribeToActions (it's optional).
         */
        subscribeToActions: parentStore.subscribeToActions
            ? (listener) => {
                return parentStore.subscribeToActions((parentAction, parentState) => {
                    // Check if this action is for our item
                    if (parentAction.type === actionType &&
                        'id' in parentAction &&
                        parentAction.id === id &&
                        'action' in parentAction) {
                        const current = getArray(parentState).find((i) => i.id === id);
                        if (current) {
                            listener(parentAction.action, current.state);
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
        destroy() {
            // No-op - parent store manages lifecycle
        }
    };
    return scopedStore;
}
