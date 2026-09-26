/**
 * Private managed-dismiss request identity. No barrel exports this module and
 * no application-facing API names it.
 *
 * A request is what the managed dismiss requester hands to the dispatch it is
 * executed with. It is not an action. It may travel only between dispatch
 * closures created by the framework's effect lift (`effect.ts`), and it ends in
 * a claim or a synchronous TypeError before a gate, queue, reducer, history or
 * subscriber could see it, in every store mode.
 *
 * Both facts recorded here are reference membership in module-private weak
 * collections, as `OwnerToken` liveness is in `identity.ts`: no value an
 * application can construct, copy or deserialize is a request or a lifted
 * dispatch. A second installed copy of the package fails closed, because its
 * objects are not in this copy's collections. Weak keys retain nothing; the
 * module has no imports and performs no import-time registration.
 */

const minted = new WeakSet<object>();
const claimed = new WeakSet<object>();
const lifted = new WeakSet<object>();

/** Mint an unclaimed request: frozen, with no prototype and no properties. */
export function mintDismissRequest(): object {
  const request: object = Object.freeze(Object.create(null));
  minted.add(request);
  return request;
}

/** True only for an object minted here. */
export function isDismissRequest(value: unknown): boolean {
  return typeof value === 'object' && value !== null && minted.has(value);
}

/** Claim a minted request, exactly once. The claiming lift does this before it dispatches. */
export function claimDismissRequest(value: unknown): void {
  if (!isDismissRequest(value)) throw new TypeError('Only a minted managed dismiss request can be claimed');
  if (claimed.has(value as object)) throw new TypeError('A managed dismiss request can be claimed only once');
  claimed.add(value as object);
}

/** The requester's check after its dispatch returns: unclaimed means a lift invariant is broken. */
export function wasDismissRequestClaimed(value: unknown): boolean {
  return isDismissRequest(value) && claimed.has(value as object);
}

/** Brand a dispatch closure as created by the framework lift, and return it. */
export function markLiftedDispatch<D extends (action: never) => void>(dispatch: D): D {
  lifted.add(dispatch);
  return dispatch;
}

/** True only for a closure branded here; a hand-written wrapper around one is not. */
export function isLiftedDispatch(dispatch: unknown): boolean {
  return typeof dispatch === 'function' && lifted.has(dispatch);
}
