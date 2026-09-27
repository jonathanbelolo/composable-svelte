/**
 * Managed route render identity and render outcomes (WP2). Motion-free and DOM-free.
 * Render identity = (attachment epoch, route instance owner token, render attempt).
 * Contract: fluid-layout-motion-design.md "Managed route outlet, render identity and failure".
 */
import { getContext, setContext } from 'svelte';
import type { EpochId } from '../../routing/staged/types.js';
import type { ApplicationStagedRoute } from '../instance.svelte.js';

const stagedRouteContext = Symbol('Staged route declaration');
/** Provided on server and client alike, so managed route outlet structure is SSR/hydration stable. */
export function provideStagedRoute(staged: ApplicationStagedRoute): void { setContext(stagedRouteContext, staged); }
export function optionalStagedRoute(): ApplicationStagedRoute | undefined { return getContext<ApplicationStagedRoute | undefined>(stagedRouteContext); }

export interface RenderIdentity {
  readonly epoch: EpochId | undefined;
  readonly owner: object;
  readonly attempt: number;
}
/** Render outcomes are recorded separately from domain commit outcomes. */
export type RenderOutcome =
  | { readonly type: 'rendered'; readonly identity: RenderIdentity }
  | { readonly type: 'notRendered'; readonly owner: object }
  | { readonly type: 'renderFailed'; readonly identity: RenderIdentity; readonly error: unknown }
  | { readonly type: 'retry'; readonly identity: RenderIdentity }
  | { readonly type: 'staleRenderFailure'; readonly identity: RenderIdentity | undefined; readonly error: unknown }
  | { readonly type: 'escalated'; readonly error: unknown };

/** Bounded, inert error summary handed to declared fallback markup. Never the live error object. */
export interface RenderFailureSummary { readonly name: string; readonly message: string }
export const RENDER_SUMMARY_LIMIT = 200;
export function summarizeRenderFailure(error: unknown): RenderFailureSummary {
  const name = error instanceof Error && typeof error.name === 'string' ? error.name : 'Error';
  let message: string;
  try { message = error instanceof Error ? String(error.message) : typeof error === 'string' ? error : 'Render failed'; }
  catch { message = 'Render failed'; }
  return Object.freeze({ name: name.slice(0, 64), message: message.length > RENDER_SUMMARY_LIMIT ? `${message.slice(0, RENDER_SUMMARY_LIMIT)}…` : message });
}

/** Candidate public: arguments of a route outlet's declared fallback snippet. */
export interface RouteFallbackProps {
  readonly summary: RenderFailureSummary;
  /** The failed render attempt (1 for the first mount). */
  readonly attempt: number;
  /** Render-only retry of the same owner under the next attempt. Effective once per failure. */
  readonly retry: () => void;
}
export const RENDER_OUTCOME_RETENTION = 128;

/** One per Host route layer. Tracks the current identity of each mounted route instance. */
export class RouteRenderLedger {
  private readonly current = new Map<object, RenderIdentity>();
  private readonly everMounted = new WeakSet<object>();
  /** Epoch reconciliation: a pre-attachment identity maps to its attached successor (same owner and attempt). */
  private readonly successors = new WeakMap<RenderIdentity, RenderIdentity>();
  readonly outcomes: RenderOutcome[] = [];
  constructor(private readonly epoch: () => EpochId | undefined) {}
  /**
   * Instances can mount before the Host's binding attaches (initial render, reattachment), so their
   * identity starts without an epoch. Once an epoch exists, those identities and their recorded
   * outcomes are restamped with it. Identities that already carry an epoch are never changed.
   */
  reconcile(): void {
    const epoch = this.epoch();
    if (epoch === undefined) return;
    const replaced = new Map<RenderIdentity, RenderIdentity>();
    for (const [owner, identity] of this.current) {
      if (identity.epoch !== undefined) continue;
      const next: RenderIdentity = Object.freeze({ epoch, owner, attempt: identity.attempt });
      this.current.set(owner, next);
      this.successors.set(identity, next);
      replaced.set(identity, next);
    }
    if (!replaced.size) return;
    for (let index = 0; index < this.outcomes.length; index++) {
      const outcome = this.outcomes[index]!;
      if ('identity' in outcome && outcome.identity && replaced.has(outcome.identity)) this.outcomes[index] = Object.freeze({ ...outcome, identity: replaced.get(outcome.identity)! }) as RenderOutcome;
    }
  }
  /** The reconciled form of an identity held by a component (itself unless restamped). */
  resolve(identity: RenderIdentity): RenderIdentity {
    let resolved = identity;
    for (let next = this.successors.get(resolved); next; next = this.successors.get(resolved)) resolved = next;
    return resolved;
  }
  private record(outcome: RenderOutcome): void {
    this.outcomes.push(outcome);
    if (this.outcomes.length > RENDER_OUTCOME_RETENTION) this.outcomes.shift();
  }
  /** Each instance mount starts a new identity at attempt 1. */
  mount(owner: object): RenderIdentity {
    this.reconcile();
    const identity: RenderIdentity = Object.freeze({ epoch: this.epoch(), owner, attempt: 1 });
    this.current.set(owner, identity);
    this.everMounted.add(owner);
    return identity;
  }
  /** Render-only retry: same owner, next attempt. Returns undefined for a stale identity. */
  retry(held: RenderIdentity): RenderIdentity | undefined {
    this.reconcile();
    const identity = this.resolve(held);
    if (this.current.get(identity.owner) !== identity) return undefined;
    const next: RenderIdentity = Object.freeze({ epoch: identity.epoch, owner: identity.owner, attempt: identity.attempt + 1 });
    this.current.set(identity.owner, next);
    this.record({ type: 'retry', identity: next });
    return next;
  }
  isCurrent(identity: RenderIdentity): boolean { this.reconcile(); return this.current.get(identity.owner) === this.resolve(identity); }
  identityOf(owner: object): RenderIdentity | undefined { this.reconcile(); return this.current.get(owner); }
  rendered(held: RenderIdentity): boolean {
    if (!this.isCurrent(held)) return false;
    const identity = this.resolve(held);
    this.record({ type: 'rendered', identity });
    return true;
  }
  /** True when the failure belongs to the current identity; stale failures are diagnostics only. */
  failed(held: RenderIdentity | undefined, error: unknown): boolean {
    if (!held || !this.isCurrent(held)) { this.record({ type: 'staleRenderFailure', identity: held && this.resolve(held), error }); return false; }
    const identity = this.resolve(held);
    this.record({ type: 'renderFailed', identity, error });
    return true;
  }
  escalated(error: unknown): void { this.record({ type: 'escalated', error }); }
  /** The instance left the outlet; its identity retires. */
  retire(owner: object): void { this.current.delete(owner); }
  hasMounted(owner: object): boolean { return this.everMounted.has(owner); }
  notRendered(owner: object): void { this.record({ type: 'notRendered', owner }); }
}
