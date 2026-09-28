/**
 * Neutral registry from an overlay scope reference (`useOverlayMotion` handle) to its bound instance owner.
 * Kept free of engine and Host imports so plan resolution in the run and the handle module do not form a cycle.
 */
const scopes = new WeakMap<object, () => object | undefined>();
/** The mounted instance bound to a scope reference right now (owner and role elements), for role registration. */
export interface OverlayScopeInstance { readonly owner: object; readonly backdrop: HTMLElement | undefined; readonly content: HTMLElement | undefined }
const instances = new WeakMap<object, () => OverlayScopeInstance | undefined>();

/** Register a scope reference: `current` returns the owner of the instance bound right now (its epoch). */
export function registerOverlayScope(ref: object, current: () => object | undefined, instance?: () => OverlayScopeInstance | undefined): void {
  scopes.set(ref, current);
  if (instance) instances.set(ref, instance);
}
/** The instance currently bound to `ref` (undefined when none or unknown). */
export function overlayScopeInstance(ref: object): OverlayScopeInstance | undefined { return instances.get(ref)?.(); }

/**
 * The owner currently bound to `ref`: an object when an instance is bound, `undefined` when none is bound,
 * `null` when `ref` is not an overlay scope reference at all (reported `unknownScope`).
 */
export function overlayScopeOwner(ref: object): object | undefined | null {
  const current = scopes.get(ref);
  return current ? current() : null;
}
