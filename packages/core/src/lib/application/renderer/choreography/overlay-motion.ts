/**
 * Overlay motion binding (fluid-overlays implementation-interface §1–§2).
 *
 * `useOverlayMotion(init)` creates a handle bound to ONE overlay instance through a component's `motion` prop.
 * It carries the instance's default open/close plans and a presentation-bound explicit entry, and it is the
 * scope reference for exact participant selectors. The handle holds no business authority: acceptance is
 * the committed presentation status observed by the overlay component; completion is delivered through the
 * component's existing callbacks, exactly once per current obligation.
 *
 * Motion-free: this module imports no engine. A plan carries its engine; without a claiming engine (no Host,
 * SSR, no plan) the component keeps its own spring path.
 */
import { onDestroy, tick, untrack } from 'svelte';
import { onStateCommitted } from '../../../store.svelte.js';
import { registerOverlayScope } from './overlay-scopes.js';
import { optionalRouteHost, optionalRouteInstance, type RouteHost } from './route-host.js';
import type { ChoreographyPlan, OverlayScopeRef, ScopedParticipantSelector } from './plan.js';
export type { OverlayScopeRef, ScopedParticipantSelector } from './plan.js';

const BRAND: unique symbol = Symbol('OverlayScopeRef');

export interface OverlayMotionOptions {
  /** Default plan for every accepted open of the bound instance (any cause). */
  readonly open?: ChoreographyPlan | undefined;
  /** Default plan for every accepted close of the bound instance (any cause). */
  readonly close?: ChoreographyPlan | undefined;
  /**
   * The reducer-owned presentation this handle's overlay follows (e.g. `() => store.state.presentation`). Needed when
   * the overlay component itself mounts conditionally, in the same render as the change: the framework reads it at
   * the pre-render commit checkpoint so default-plan sources are captured before the destructive render.
   */
  readonly presentation?: (() => { readonly status: string } | undefined) | undefined;
}
export interface OverlayMotionHandle extends OverlayScopeRef {
  /**
   * Presentation-bound explicit entry: runs `commit` synchronously. If the bound instance's committed
   * presentation then enters `presenting`/`dismissing`, `plan` replaces that transition's default plan;
   * otherwise (refused, guarded) nothing is acquired or superseded.
   */
  transition(plan: ChoreographyPlan, commit: () => void): void;
}

/** One mounted overlay instance (a new object per open: its identity is the epoch). */
export interface OverlayInstance {
  /** The instance scope owner (participants inside its content register under it). */
  readonly owner: object;
  backdrop: HTMLElement | undefined;
  content: HTMLElement | undefined;
}

export type OverlayTransitionKind = 'present' | 'dismiss';

/** What an overlay component hands the engine when its committed status enters a transition. */
export interface OverlayTransitionRequest {
  readonly handle: OverlayMotionHandle;
  readonly kind: OverlayTransitionKind;
  readonly instance: OverlayInstance;
  /** The plan to run: the pending explicit plan for this transition, else the default for `kind`. */
  readonly plan: ChoreographyPlan;
  /** True when the plan came from `handle.transition()` for this epoch (its run was prepared before the commit). */
  readonly explicit: boolean;
  /** The default scope for the plan's plain keys: the scope that created the handle. */
  readonly scope: object | undefined;
  /** Deliver the component's completion callback. The engine calls it at most once, only while current. */
  readonly complete: () => void;
}
/** An engine's claim of one transition: the component skips its spring; `cancel` retires the obligation. */
export interface OverlayTransitionClaim { cancel(reason: string): void }

interface HandleState {
  readonly host: RouteHost | undefined;
  /** The scope that created the handle: the default scope for plain string keys. */
  readonly pageOwner: object | undefined;
  options: OverlayMotionOptions;
  current: OverlayInstance | undefined;
  pending: Pending | undefined;
  /** Default-plan preparation made at the pre-render commit checkpoint (C2 default phase). */
  pendingDefault: (Pending & { readonly kind: OverlayTransitionKind }) | undefined;
  /** Status probes of the overlay components bound to this handle, and the status each last showed. */
  readonly probes: Map<() => string | undefined, string | undefined>;
}
type Internal = OverlayMotionHandle & { readonly [BRAND]: HandleState };
/** One explicit entry's prepared run. Each is claimed at most once or discarded once — never merely overwritten. */
interface Pending { readonly plan: ChoreographyPlan; readonly instance: OverlayInstance | undefined; prepared: unknown; settled: boolean }

/**
 * Call during component initialisation. `init` is synchronous authoring only: it receives the bound scope
 * reference first (acyclic setup) and returns plain plan data; it is called once, immediately.
 */
export function useOverlayMotion(init?: (overlay: OverlayScopeRef) => OverlayMotionOptions): OverlayMotionHandle {
  const state: HandleState = { host: optionalRouteHost(), pageOwner: optionalRouteInstance(), options: {}, current: undefined, pending: undefined, pendingDefault: undefined, probes: new Map() };
  const handle: Internal = Object.freeze({
    [BRAND]: state,
    select(key: string): ScopedParticipantSelector {
      if (typeof key !== 'string' || key.length === 0) throw new TypeError('An overlay participant selector names a nonempty key');
      return Object.freeze({ key, scope: handle });
    },
    transition(plan: ChoreographyPlan, commit: () => void): void {
      // Phase-correct (C2/C5): sources are captured BEFORE the commit, acquisition waits for acceptance. The prepared
      // run is claimed only if the bound instance's committed status changes in this flush, for the current epoch;
      // otherwise it is discarded (a refused intent acquires and supersedes nothing).
      const host = state.host;
      const pending: Pending = { plan, instance: state.current, prepared: undefined, settled: false };
      pending.prepared = host?.overlayPrepare(plan, state.pageOwner, pending.instance);
      // A later entry in the same flush replaces an earlier unclaimed one: the earlier is discarded now.
      const replaced = state.pending;
      if (replaced) discardPending(state, replaced);
      state.pending = pending;
      try { commit(); }
      finally { void tick().then(() => discardPending(state, pending)); }
    }
  });
  registerOverlayScope(handle, () => state.current?.owner, () => state.current);
  state.options = init?.(handle) ?? {};
  const presentation = state.options.presentation;
  if (presentation) { const stop = registerOverlayProbe(handle, () => presentation()?.status); try { onDestroy(stop); } catch { /* created outside a component */ } }
  return handle;
}

// ------------------------------------------------------------------------------------ default-plan source phase (C2)

const probed = new Set<HandleState>();
let stopCommits: (() => void) | undefined;
/**
 * Framework pipeline checkpoint (after reduction, before the destructive render): for every bound overlay whose
 * committed status now ENTERS `presenting`/`dismissing`, prepare its default plan — sources captured while the old DOM
 * still exists, nothing acquired. The component's status effect claims it for the current epoch (acceptance) or it
 * is discarded after the flush. An explicit entry of the same flush takes precedence.
 */
export function overlayCommitCheckpoint(): void {
  for (const state of probed) for (const [probe, last] of state.probes) {
    let status: string | undefined;
    try { status = untrack(probe); } catch { continue; }
    if (status === last) continue;
    state.probes.set(probe, status);
    if (status !== 'presenting' && status !== 'dismissing') continue;
    if (state.pending && !state.pending.settled) continue; // explicit precedence
    const kind: OverlayTransitionKind = status === 'presenting' ? 'present' : 'dismiss';
    const plan = kind === 'present' ? state.options.open : state.options.close;
    if (!plan || !state.host) continue;
    if (state.pendingDefault && !state.pendingDefault.settled && state.pendingDefault.kind === kind) continue; // already prepared (another probe)
    if (state.pendingDefault) discardPending(state, state.pendingDefault);
    const pending = { plan, instance: state.current, prepared: undefined as unknown, settled: false, kind };
    pending.prepared = state.host.overlayPrepare(plan, state.pageOwner, pending.instance);
    state.pendingDefault = pending;
    void tick().then(() => discardPending(state, pending));
  }
}
const probeListeners = new Set<() => void>();
/** @internal The Host's before-removal pre-effect re-subscribes when the set of probes changes. */
export function onOverlayProbesChanged(listener: () => void): () => void { probeListeners.add(listener); return () => { probeListeners.delete(listener); }; }
// Registration notifies synchronously: the Host pre-effect re-tracks within the same flush, so an update in the SAME
// task (no app wait) is already observed before its destructive render. Unregistration is deferred (teardown).
const probesAdded = () => untrack(() => { for (const listener of probeListeners) listener(); }); // never a dependency of the registering effect
const probesChanged = () => queueMicrotask(() => { for (const listener of probeListeners) listener(); });
/**
 * @internal Called from the Host's root-level `$effect.pre`: reads every probe TRACKED (any committed status change —
 * store or bindable/prop — re-runs it before descendants render), then runs the checkpoint (seen statuses are no-ops).
 */
export function trackOverlayStatuses(): void {
  for (const state of probed) for (const probe of state.probes.keys()) { try { probe(); } catch { /* reported by its component */ } }
  overlayCommitCheckpoint();
}
/** @internal A component bound to `handle` reports its committed status through `probe` (read at the checkpoint). */
export function registerOverlayProbe(handle: OverlayMotionHandle | undefined, probe: () => string | undefined): () => void {
  const state = overlayHandleState(handle);
  if (!state) return () => {};
  let initial: string | undefined;
  try { initial = untrack(probe); } catch { initial = undefined; }
  state.probes.set(probe, initial);
  probed.add(state);
  probesAdded();
  stopCommits ??= onStateCommitted(overlayCommitCheckpoint);
  return () => {
    state.probes.delete(probe);
    probesChanged();
    if (!state.probes.size) probed.delete(state);
    if (!probed.size) { stopCommits?.(); stopCommits = undefined; }
  };
}

/** Discard `pending` unless it was already claimed or discarded (idempotent). */
function discardPending(state: HandleState, pending: Pending): void {
  if (pending.settled) return;
  pending.settled = true;
  if (state.pending === pending) state.pending = undefined;
  if (state.pendingDefault === pending) state.pendingDefault = undefined;
  if (pending.prepared) state.host?.overlayDiscard(pending.prepared as never);
}

/** The internal state of a handle created by `useOverlayMotion`, or undefined for anything else. */
export function overlayHandleState(value: unknown): HandleState | undefined {
  return typeof value === 'object' && value !== null && BRAND in value ? (value as Internal)[BRAND] : undefined;
}
export type { HandleState as OverlayHandleState };

/** The instance an overlay component binds while mounted (a new instance per open). Returns the unbind. */
export function bindOverlayInstance(handle: OverlayMotionHandle | undefined, instance: OverlayInstance): () => void {
  const state = overlayHandleState(handle);
  if (!state) return () => {};
  state.current = instance;
  // The instance is disposed: its resting page reactions end (restore) — never left behind for a later owner.
  return () => { if (state.current === instance) state.current = undefined; state.host?.releaseRetained(instance.owner); };
}

/**
 * Called by an overlay component when its COMMITTED presentation enters `presenting`/`dismissing`, before
 * starting its own spring. Returns a claim when an engine takes the transition (the component must not
 * animate), or undefined (the component keeps its spring path).
 */
export function claimOverlayTransition(handle: OverlayMotionHandle | undefined, kind: OverlayTransitionKind, instance: OverlayInstance, complete: () => void): OverlayTransitionClaim | undefined {
  const state = overlayHandleState(handle);
  if (!state || !state.host) return undefined;
  // A pending explicit plan exists only within the flush its `transition()` commit caused (cleared after tick), and
  // applies only to the CURRENT epoch: no instance bound before an open, or this same instance (close, reopen).
  const pending = state.pending;
  const current = !!pending && (pending.instance === undefined ? kind === 'present' : pending.instance === instance);
  if (pending) { state.pending = undefined; pending.settled = true; } // claimed (current) or discarded below (stale)
  const engine = state.host as RouteHost & { overlayTransition?: (request: OverlayTransitionRequest & { prepared?: unknown }) => OverlayTransitionClaim | undefined; overlayDiscard?: (prepared: unknown) => void; overlayJoin?: (instance: OverlayInstance, complete: () => void) => OverlayTransitionClaim | undefined };
  if (pending && !current && pending.prepared) engine.overlayDiscard?.(pending.prepared); // stale epoch: discarded
  // Otherwise a default preparation from the pre-render checkpoint, for this kind and this epoch.
  const byDefault = state.pendingDefault;
  const defaultCurrent = !current && !!byDefault && byDefault.kind === kind && (byDefault.instance === undefined ? kind === 'present' : byDefault.instance === instance);
  if (byDefault) { state.pendingDefault = undefined; byDefault.settled = true; if (!defaultCurrent && byDefault.prepared) (state.host as unknown as { overlayDiscard(prepared: unknown): void }).overlayDiscard(byDefault.prepared); }
  const plan = current ? pending!.plan : kind === 'present' ? state.options.open : state.options.close;
  if (!current && !defaultCurrent && typeof engine.overlayJoin === 'function') { const joined = engine.overlayJoin(instance, complete); if (joined) { if (defaultCurrent && byDefault!.prepared) engine.overlayDiscard?.(byDefault!.prepared); return joined; } }
  // A combined transition authored elsewhere (a parent's plan naming this instance's roles) already drives them:
  // this instance joins that run (no second writer); its completion is delivered when that run settles.
  
  if (!plan) {
    if (current && pending!.prepared) engine.overlayDiscard?.(pending!.prepared); if (defaultCurrent && byDefault!.prepared) engine.overlayDiscard?.(byDefault!.prepared);
    // Unclaimed but ACCEPTED: this instance's previous resting reactions still end here (restoring any lower layer).
    state.host.releaseRetained(instance.owner);
    return undefined;
  }
  if (typeof engine.overlayTransition !== 'function') return undefined;
  const prepared = current ? pending!.prepared : defaultCurrent ? byDefault!.prepared : undefined;
  return engine.overlayTransition({ handle: handle!, kind, instance, plan, explicit: current, complete, scope: state.pageOwner, prepared });
}
