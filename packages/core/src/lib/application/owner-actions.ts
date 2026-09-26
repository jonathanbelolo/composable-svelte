/** Owner-scoped, ephemeral observation of the actions a managed child view's owner reduces. */
import { capturedView, isCapturedView } from '../execution/store-access.js';
import type { ChildView } from '../navigation/managed-integration.js';

// Type-only: the brand is never present at runtime. Membership is decided by
// the private captured-view registry, not by any property a value can carry.
declare const managedChildView: unique symbol;

const unsupportedViewMessage =
  'observeChildActions: expected a managed child view captured by the framework ' +
  '(a FeatureViewProps store, or the result of composition.bind or scopeTo). ' +
  'Check isManagedChildView(value) first and use subscribeToActions for a standalone Store. ' +
  'Not recognized: a wrapper or copy of a view (pass the view you were given), an ApplicationStore ' +
  '(render through FeatureViews or FeatureOutlet), or a view from a second copy of @composable-svelte/core.';

/**
 * The narrowing added by {@link isManagedChildView}.
 *
 * Intersected with the checked value's own type, so a `Store<S, A> | ChildView<S, A>`
 * keeps its action type on the true branch and its `Store` members on the false one.
 */
export interface ManagedChildViewBrand {
  readonly [managedChildView]: true;
}

/**
 * Whether `value` is a genuine managed child view captured by the framework:
 * a `FeatureViewProps` store, or the result of `composition.bind` / `scopeTo`.
 *
 * Membership, not liveness: a view whose owner has retired, or whose root has
 * been destroyed, is still a managed view. Structural wrappers, proxies,
 * `ApplicationStore` projections and standalone stores are not.
 *
 * @example
 * ```ts
 * // `store: Store<S, A>`, the component's prop: a managed view or a standalone store.
 * const stop = isManagedChildView(store)
 *   ? observeChildActions(store, run)
 *   : store.subscribeToActions?.((action) => run(action));
 * ```
 */
export function isManagedChildView<V>(value: V): value is V & ManagedChildViewBrand {
  return typeof value === 'object' && value !== null && isCapturedView(value);
}

/**
 * Observe the child-domain actions reduced by the exact owner `view` captured.
 *
 * - Delivered after the turn commits (after state and root action subscribers),
 *   synchronously and in turn order; an action dispatched from the listener is
 *   a later turn.
 * - Only actions routed to this owner, unwrapped to the child's own action type.
 * - Nothing is buffered: a listener sees only turns committed while it is
 *   subscribed. Commands dispatched before it attaches are dropped.
 * - Stops silently when the owner retires (removal or same-ID replacement) or
 *   the root is destroyed. Observing a view that has already retired is a no-op.
 *
 * For native engine commands (focus, format, set viewport). A business result
 * the parent must act on belongs in the parent reducer, not in an observer.
 *
 * @throws TypeError when `view` is not a genuine managed child view. Check
 *   {@link isManagedChildView} first; a standalone `Store` uses `subscribeToActions`.
 *
 * @example
 * ```ts
 * onMount(() => observeChildActions(store, (action) => {
 *   if (action.type === 'focusRequested') editor.focus();
 * }));
 * ```
 */
export function observeChildActions<C, A>(view: ChildView<C, A>, listener: (action: A) => void): () => void {
  if (!isManagedChildView(view)) throw new TypeError(unsupportedViewMessage);
  if (typeof listener !== 'function') throw new TypeError('observeChildActions: listener must be a function');
  // The delivery list records `A` for this owner by construction (managed-integration).
  return capturedView(view).observeActions(action => listener(action as A));
}

