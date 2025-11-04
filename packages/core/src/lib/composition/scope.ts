/**
 * Scope operator for reducer composition.
 *
 * The scope() function embeds a child reducer into a parent reducer by:
 * 1. Extracting child state from parent state
 * 2. Running the child reducer
 * 3. Embedding the result back into parent state
 * 4. Lifting child effects to parent actions
 */

import { Effect } from '../effect.js';
import type { Reducer } from '../types.js';

/**
 * Lens for extracting child state from parent state.
 */
export type StateLens<ParentState, ChildState> = (
  parent: ParentState
) => ChildState;

/**
 * Function to update parent state with new child state.
 */
export type StateUpdater<ParentState, ChildState> = (
  parent: ParentState,
  child: ChildState
) => ParentState;

/**
 * Prism for extracting child action from parent action.
 * Returns null if parent action doesn't apply to child.
 */
export type ActionPrism<ParentAction, ChildAction> = (
  parent: ParentAction
) => ChildAction | null;

/**
 * Function to embed child action in parent action.
 */
export type ActionEmbedder<ParentAction, ChildAction> = (
  child: ChildAction
) => ParentAction;

/**
 * Scope a child reducer to work with parent state and actions.
 * This is the core composition primitive.
 *
 * @param toChildState - Extract child state from parent state
 * @param fromChildState - Embed child state back into parent state
 * @param toChildAction - Extract child action from parent action (returns null if not applicable)
 * @param fromChildAction - Wrap child action into parent action
 * @param childReducer - The child reducer to compose
 * @returns A parent reducer
 *
 * @example
 * ```typescript
 * const parentReducer = scope(
 *   (parent: AppState) => parent.counter,
 *   (parent, child) => ({ ...parent, counter: child }),
 *   (action: AppAction) => action.type === 'counter' ? action.action : null,
 *   (childAction) => ({ type: 'counter', action: childAction }),
 *   counterReducer
 * );
 * ```
 */
export function scope<ParentState, ParentAction, ChildState, ChildAction, Dependencies = any>(
  toChildState: StateLens<ParentState, ChildState>,
  fromChildState: StateUpdater<ParentState, ChildState>,
  toChildAction: ActionPrism<ParentAction, ChildAction>,
  fromChildAction: ActionEmbedder<ParentAction, ChildAction>,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies> {
  return (parentState, parentAction, dependencies) => {
    // Try to extract child action from parent action
    const childAction = toChildAction(parentAction);

    // Parent action doesn't apply to child
    if (childAction === null) {
      return [parentState, Effect.none()];
    }

    // Extract child state from parent state
    const childState = toChildState(parentState);

    // Run child reducer
    const [newChildState, childEffect] = childReducer(childState, childAction, dependencies);

    // Update parent state with new child state
    const newParentState = fromChildState(parentState, newChildState);

    // Map child effects to parent actions
    const parentEffect = Effect.map(childEffect, fromChildAction);

    return [newParentState, parentEffect];
  };
}

/**
 * Helper for common case where child actions are embedded in parent actions.
 *
 * @param toChildState - Extract child state from parent state
 * @param fromChildState - Embed child state back into parent state
 * @param actionType - The action type string to match
 * @param childReducer - The child reducer to compose
 * @returns A parent reducer
 *
 * @example
 * ```typescript
 * type AppAction = { type: 'counter'; action: CounterAction } | ...;
 *
 * const parentReducer = scopeAction(
 *   (parent: AppState) => parent.counter,
 *   (parent, child) => ({ ...parent, counter: child }),
 *   'counter',
 *   counterReducer
 * );
 * ```
 */
export function scopeAction<
  ParentState,
  ParentAction extends { type: string },
  ChildState,
  ChildAction,
  Dependencies = any
>(
  toChildState: StateLens<ParentState, ChildState>,
  fromChildState: StateUpdater<ParentState, ChildState>,
  actionType: string,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies> {
  return scope(
    toChildState,
    fromChildState,
    (action) => (action.type === actionType && 'action' in action ? (action as any).action : null),
    (childAction) => ({ type: actionType, action: childAction } as any),
    childReducer
  );
}
