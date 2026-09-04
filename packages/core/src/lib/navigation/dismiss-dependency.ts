/**
 * Dismiss Dependency
 *
 * Allows child features to dismiss themselves without knowing about their parent.
 *
 * The dismiss dependency is injected into child reducers, enabling them to request
 * dismissal by calling deps.dismiss(). The parent receives a PresentationAction.dismiss
 * and can handle it (typically by setting child state to null).
 *
 * This inverts the control: children don't know they're being presented,
 * they just know they can request dismissal.
 *
 * @packageDocumentation
 */

import { Effect } from '../effect.js';
import type { Dispatch, Effect as EffectType } from '../types.js';
import type { PresentationAction } from './types.js';

/**
 * Dependency interface for child features that can be dismissed.
 *
 * @example
 * ```typescript
 * interface AddItemDeps {
 *   dismiss: DismissDependency;
 *   api: ApiClient;
 * }
 *
 * const addItemReducer: Reducer<AddItemState, AddItemAction, AddItemDeps> = (state, action, deps) => {
 *   switch (action.type) {
 *     case 'cancelButtonTapped':
 *       // Request dismissal
 *       return [state, deps.dismiss()];
 *
 *     case 'saveButtonTapped':
 *       // Save and dismiss
 *       return [
 *         state,
 *         Effect.batch(
 *           Effect.run((d) => deps.api.saveItem(state.item)),
 *           deps.dismiss()
 *         )
 *       ];
 *   }
 * };
 * ```
 */
export type DismissDependency = {
  /**
   * Request dismissal of the current feature.
   *
   * Returns an Effect that, when executed, dispatches PresentationAction.dismiss
   * to the parent.
   *
   * @returns Effect that dismisses the feature
   */
  (): EffectType<any>;
};

/**
 * Create a dismiss dependency for a child feature.
 *
 * This factory creates a dismiss function that dispatches PresentationAction.dismiss
 * wrapped in the parent's action structure.
 *
 * @param dispatch - The parent's dispatch function
 * @param actionWrapper - Function to wrap PresentationAction in parent action
 * @returns A dismiss dependency
 *
 * Build it where the store is built, not inside a reducer: a reducer is
 * `(state, action, dependencies)` and has no `dispatch` in scope. Because the
 * dependency needs the store's dispatch and the store needs the dependencies,
 * take the reference lazily.
 *
 * @example
 * ```typescript
 * let dispatch: Dispatch<ParentAction> = () => {};
 *
 * const store = createStore({
 *   initialState,
 *   reducer: parentReducer,
 *   dependencies: {
 *     ...deps,
 *     dismiss: createDismissDependency(
 *       (action) => dispatch(action),
 *       (pa) => ({ type: 'destination', action: pa })
 *     )
 *   }
 * });
 *
 * dispatch = (action) => store.dispatch(action);
 * ```
 */
export function createDismissDependency<ParentAction>(
  dispatch: Dispatch<ParentAction>,
  actionWrapper: (action: PresentationAction<any>) => ParentAction
): DismissDependency {
  return () => {
    // Dispatch through the *captured* parent dispatch, not the one this effect
    // is executed with. A child's effects go through `ifLet`, which maps them
    // with `fromChildAction`; since `actionWrapper` already produces a parent
    // action, dispatching through `d` would wrap it a second time and the
    // parent would receive an action it cannot route.
    //
    // `fireAndForget` rather than `run` for exactly that reason: this effect
    // dispatches nothing into the child's action stream, so it takes no
    // dispatch and `Effect.map` passes it through untouched. `run<ParentAction>`
    // claimed the opposite, which is the misconception the bug came from.
    return Effect.fireAndForget(() => {
      dispatch(
        actionWrapper({
          type: 'dismiss' as const
        })
      );
    });
  };
}

/**
 * Create a dismiss dependency that also executes cleanup effects before dismissing.
 *
 * Use this when the child needs to perform cleanup (save state, analytics, etc.)
 * before dismissal.
 *
 * @param dispatch - The parent's dispatch function
 * @param actionWrapper - Function to wrap PresentationAction in parent action
 * @param cleanup - Optional cleanup function to run before dismissing
 * @returns A dismiss dependency with cleanup
 *
 * @example
 * ```typescript
 * // `dispatch` is the parent store's, captured lazily — see
 * // `createDismissDependency` above for why.
 * const dismiss = createDismissDependencyWithCleanup(
 *   (action) => dispatch(action),
 *   (pa) => ({ type: 'destination', action: pa }),
 *   async () => {
 *     // Track analytics
 *     await analytics.track('modal_dismissed');
 *   }
 * );
 * ```
 */
export function createDismissDependencyWithCleanup<ParentAction>(
  dispatch: Dispatch<ParentAction>,
  actionWrapper: (action: PresentationAction<any>) => ParentAction,
  cleanup?: () => void | Promise<void>
): DismissDependency {
  return () => {
    // As above: the captured parent dispatch, so `ifLet`'s mapping cannot
    // double-wrap the dismiss action, and no dispatch is taken.
    return Effect.fireAndForget(async () => {
      // Run cleanup if provided
      if (cleanup) {
        await cleanup();
      }

      // Dispatch dismiss action
      dispatch(
        actionWrapper({
          type: 'dismiss' as const
        })
      );
    });
  };
}

/**
 * Convenience helper for creating dismiss dependency with common action patterns.
 *
 * This assumes the parent action has a structure like:
 * `{ type: actionField, action: PresentationAction<ChildAction> }`
 *
 * @param dispatch - The parent's dispatch function
 * @param actionField - The parent action field name (e.g., 'destination')
 * @returns A dismiss dependency
 *
 * @example
 * ```typescript
 * // Simpler API for common case. As above, this goes where the store is
 * // built and captures its dispatch lazily.
 * const dependencies = {
 *   ...deps,
 *   dismiss: dismissDependency((action) => dispatch(action), 'destination')
 * };
 *
 * // Equivalent to:
 * createDismissDependency(
 *   (action) => dispatch(action),
 *   (pa) => ({ type: 'destination', action: pa })
 * )
 * ```
 */
export function dismissDependency<ParentAction>(
  dispatch: Dispatch<ParentAction>,
  actionField: string
): DismissDependency {
  return createDismissDependency(
    dispatch,
    (presentationAction) => ({
      type: actionField,
      action: presentationAction
    } as ParentAction)
  );
}
