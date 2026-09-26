/**
 * Dismiss Dependency
 *
 * Allows child features to dismiss themselves without knowing about their parent.
 *
 * The dismiss dependency is injected into child reducers, enabling them to request
 * dismissal by calling deps.dismiss(). A managed presentation lift claims the
 * private request and dismisses the exact presentation that owns the effect.
 *
 * This inverts the control: children don't know they're being presented,
 * they just know they can request dismissal.
 *
 * @packageDocumentation
 */

import { Effect } from '../effect.js';
import { isLiftedDispatch, mintDismissRequest, wasDismissRequestClaimed } from '../execution/dismiss-request.js';
import type { Effect as EffectType } from '../types.js';

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
   * Returns an Effect that asks its enclosing managed presentation to dismiss.
   *
   * @returns Effect that dismisses the feature
   */
  (): EffectType<any>;
};

/**
 * Create the managed dismiss dependency: `deps.dismiss()` for a child presented
 * through a managed slot. It captures no dispatch and wraps nothing.
 *
 * The effect hands a private request (`execution/dismiss-request.ts`) to the
 * dispatch it is executed with. A request travels only between dispatch
 * closures created by the framework's effect lift: the enclosing managed
 * presentation's lift claims it synchronously and dispatches that
 * presentation's own dismiss action in its place. Any other lift — public
 * `Effect.map`, and every legacy lift built on it — throws, and a raw store
 * dispatch or a hand-written one is refused before a request exists. No
 * reducer, history or subscriber sees a request.
 *
 * This requester is exported only from `@composable-svelte/core/application`.
 * Managed optional slots and dedicated destination slots claim requests;
 * keyed and legacy lifts reject them.
 *
 * @param cleanup - Optional work to finish before dismissing. It receives the
 * executor's signal; only a thenable result is awaited, and an abort by the
 * time it has finished drops the dismissal.
 * @returns A dismiss dependency
 */
export function managedDismissDependency(
  cleanup?: (signal?: AbortSignal) => void | PromiseLike<void>
): DismissDependency {
  return () => {
    return Effect.run<any>(async (dispatch, signal) => {
      if (cleanup) {
        // Only a thenable is awaited: without asynchronous cleanup the request
        // is dispatched in the executor's synchronous part.
        const pending: unknown = cleanup(signal);
        if (pending && typeof (pending as { then?: unknown }).then === 'function') await pending;
      }
      if (signal?.aborted) return;

      // Checked before minting, so a request never exists for a dispatch that
      // could deliver it to a reducer, a history or a subscriber.
      if (!isLiftedDispatch(dispatch)) {
        throw new TypeError(
          'deps.dismiss() from managedDismissDependency was executed with a dispatch that is not a framework lift: no enclosing managed presentation'
        );
      }

      const request = mintDismissRequest();
      dispatch(request);

      // Every lift claims, forwards to another lift, or throws. Reaching this
      // line unclaimed means that invariant is broken.
      if (!wasDismissRequestClaimed(request)) {
        throw new TypeError('Internal error: a managed dismiss request returned from a framework lift unclaimed');
      }
    });
  };
}
