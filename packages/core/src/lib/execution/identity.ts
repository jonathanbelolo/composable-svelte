/** Internal managed execution identity. No application-facing composition API. */
import type { Effect } from '../types.js';

declare const ownerBrand: unique symbol;
/** An unforgeable-by-structure capability; validity also requires reference membership. */
export type OwnerToken = Readonly<{ id: number; [ownerBrand]: true }>;
export type SlotPart = Readonly<{ slot: string }> | Readonly<{ key: string | number }>;
export type OwnerPath = readonly SlotPart[];
export interface LiveOwner { readonly path: OwnerPath; readonly token: OwnerToken }
export interface Lifecycle {
  readonly nextId: number;
  readonly owners: readonly LiveOwner[];
}
export interface ReplaceIntent { readonly type: 'replace'; readonly path: OwnerPath }
export interface SlotDescriptor<S> {
  /** Explicit owned slots, including nested/keyed slots; never inferred from feature properties. */
  readonly select: (feature: S) => readonly OwnerPath[];
}
export interface Reconciliation {
  readonly lifecycle: Lifecycle;
  readonly surviving: readonly OwnerToken[];
  /**
   * Deterministic previous-lifecycle (encoded path) order, descendants before
   * ancestors. This is an implementation property, not an application contract;
   * cross-owner teardown dependencies must not rely on it. Store destruction
   * differs (global FIFO registration order), and dependent cleanup must compose
   * a single disposer.
   */
  readonly invalidated: readonly OwnerToken[];
  readonly created: readonly OwnerToken[];
}

/** Derived lookup acceleration only: the explicit lifecycle remains the authority.
 * Only snapshots constructed here from trusted immutable owners are indexed.
 * A spread or manually constructed Lifecycle takes the uncached structural path,
 * so changing its owners can never reuse an unrelated/stale index. Maps/Sets are
 * private and never returned; weak keys retain no retired lifecycle history.
 */
interface LookupIndex {
  readonly paths: Map<string, LiveOwner>;
  readonly tokens: Set<OwnerToken>;
}
const lookupIndexes = new WeakMap<Lifecycle, LookupIndex>();
function immutableLifecycle(nextId: number, owners: LiveOwner[], trusted: boolean): Lifecycle {
  const lifecycle = Object.freeze({ nextId, owners: Object.freeze(owners) });
  if (trusted) lookupIndexes.set(lifecycle, {
    paths: new Map(owners.map(owner => [encodePath(owner.path), owner])),
    tokens: new Set(owners.map(owner => owner.token))
  });
  return lifecycle;
}
export function createLifecycle(): Lifecycle {
  return immutableLifecycle(1, [], true);
}

function encodePath(path: OwnerPath): string {
  if (path.length === 0) throw new TypeError('Owner paths must identify a slot');
  return JSON.stringify(path.map(part => {
    if ('slot' in part) return ['slot', part.slot];
    if (typeof part.key === 'string') return ['key', 'string', part.key];
    if (!Number.isFinite(part.key)) throw new TypeError('Owner keys must be finite');
    return ['key', 'number', Object.is(part.key, -0) ? '-0' : String(part.key)];
  }));
}
function selected<S>(descriptor: SlotDescriptor<S>, feature: S): Map<string, OwnerPath> {
  const paths = new Map<string, OwnerPath>();
  for (const path of descriptor.select(feature)) {
    const key = encodePath(path);
    if (paths.has(key)) throw new TypeError('Duplicate managed owner path');
    paths.set(key, path);
  }
  return paths;
}
function beneath(path: OwnerPath, parent: OwnerPath): boolean {
  return parent.length <= path.length && encodePath(path.slice(0, parent.length)) === encodePath(parent);
}

/** Pure: no feature mutation, resource operations, clocks, or ambient owner lookup. */
export function reconcile<S>(
  previous: Lifecycle,
  before: S,
  after: S,
  descriptor: SlotDescriptor<S>,
  replacements: readonly ReplaceIntent[] = []
): Reconciliation {
  const beforePaths = selected(descriptor, before);
  const afterPaths = selected(descriptor, after);
  for (const intent of replacements) {
    const key = encodePath(intent.path);
    if (!beforePaths.has(key) || !afterPaths.has(key)) {
      throw new TypeError('Replacement must name a surviving declared slot');
    }
  }
  const previousIndex = lookupIndexes.get(previous);
  const old = previousIndex?.paths ?? new Map(previous.owners.map(owner => [encodePath(owner.path), owner]));
  // A live table inconsistent with the accepted before state is a coordinator error.
  if (old.size !== beforePaths.size) throw new Error('Lifecycle does not match before state');
  for (const key of old.keys()) if (!beforePaths.has(key)) throw new Error('Lifecycle does not match before state');
  for (const owner of previous.owners) {
    if (!afterPaths.has(encodePath(owner.path))) {
      for (const path of afterPaths.values()) {
        if (beneath(path, owner.path)) throw new TypeError('A nested owner cannot survive its removed parent');
      }
    }
  }
  let nextId = previous.nextId;
  const owners: LiveOwner[] = [];
  const surviving: OwnerToken[] = [];
  const created: OwnerToken[] = [];
  // Sorting fixes owner, creation, and subsequent teardown order; reordering feature collections never restarts owners.
  for (const [key, path] of [...afterPaths].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const prior = old.get(key);
    const replaced = replacements.some(intent => beneath(path, intent.path));
    if (prior && !replaced) {
      owners.push(prior);
      surviving.push(prior.token);
    } else {
      // MAX_SAFE_INTEGER is a terminal exhausted counter, never wrapped or reused.
      if (!Number.isSafeInteger(nextId) || nextId < 1 || nextId >= Number.MAX_SAFE_INTEGER) {
        throw new RangeError('Managed owner identity exhausted');
      }
      const token = Object.freeze({ id: nextId++ }) as OwnerToken;
      const immutablePath = Object.freeze(path.map(part => Object.freeze({ ...part })));
      owners.push(Object.freeze({ path: immutablePath, token }));
      created.push(token);
    }
  }
  const retained = new Set(surviving);
  return Object.freeze({
    lifecycle: immutableLifecycle(nextId, owners, previousIndex !== undefined || surviving.length === 0),
    surviving: Object.freeze(surviving),
    invalidated: Object.freeze(previous.owners.filter(owner => !retained.has(owner.token)).map(owner => owner.token)),
    created: Object.freeze(created)
  });
}

/** Missing origin is root authority. Foreign or retired token objects are never live. */
export function isOwnerLive(lifecycle: Lifecycle, origin: OwnerToken | undefined): boolean {
  if (origin === undefined) return true;
  const index = lookupIndexes.get(lifecycle);
  return index ? index.tokens.has(origin) : lifecycle.owners.some(owner => owner.token === origin);
}
export function ownerAt(lifecycle: Lifecycle, path: OwnerPath): OwnerToken | undefined {
  const key = encodePath(path);
  const index = lookupIndexes.get(lifecycle);
  return index ? index.paths.get(key)?.token : lifecycle.owners.find(owner => encodePath(owner.path) === key)?.token;
}

/** Stamp original reduction ownership; later outer lifts must preserve existing child origins. */
export function stampOrigin<A>(effect: Effect<A>, origin: OwnerToken): Effect<A> {
  if (effect._tag === 'Batch') {
    return { ...effect, effects: effect.effects.map(member => stampOrigin(member, effect.origin ?? origin)) };
  }
  return effect.origin === undefined ? { ...effect, origin } : effect;
}

/** Collision-free only within a root's registry. No string is recognized as already qualified. */
export function resourceKey(origin: OwnerToken | undefined, kind: 'id' | 'group', local: string): string {
  return JSON.stringify([origin === undefined ? ['root'] : ['owner', origin.id], kind, local]);
}

/**
 * Interpreter-entry adapter, applied once to local descriptions (never during composition).
 * Invalidated leaves, including cancellation descriptions, are discarded. Existing resource
 * invalidation must happen before this step. This does not implement queued callback gating.
 */
export function qualifyEffect<A>(effect: Effect<A>, lifecycle: Lifecycle): Effect<A> {
  return qualifyInherited(effect, lifecycle, undefined);
}

function qualifyInherited<A>(effect: Effect<A>, lifecycle: Lifecycle, inherited: OwnerToken | undefined): Effect<A> {
  const origin = effect.origin ?? inherited;
  if (effect._tag === 'Batch') return { ...effect, effects: effect.effects.map(member => qualifyInherited(member, lifecycle, origin)) };
  if (effect.origin === undefined && origin !== undefined) effect = { ...effect, origin };
  if (!isOwnerLive(lifecycle, effect.origin)) return { _tag: 'None' };
  const key = (kind: 'id' | 'group', local: string) => resourceKey(effect.origin, kind, local);
  switch (effect._tag) {
    case 'None':
    case 'FireAndForget': return effect;
    case 'CancelGroup': return { ...effect, group: key('group', effect.group) };
    case 'Run':
    case 'AfterDelay': return effect.groups ? { ...effect, groups: effect.groups.map(group => key('group', group)) } : effect;
    case 'Cancellable':
    case 'Debounced':
    case 'Throttled':
    case 'Subscription': return { ...effect, id: key('id', effect.id), ...(effect.groups ? { groups: effect.groups.map(group => key('group', group)) } : {}) };
    default: {
      const exhaustive: never = effect;
      throw new Error(`Unhandled effect type: ${(exhaustive as Effect<A>)._tag}`);
    }
  }
}

/** Canonical containment shared by composition; preserves typed keys and signed zero. */
export { beneath as isOwnerPathWithin };
