/**
 * Motion-free seam between the Host's route layer and the optional choreography/representation engine.
 * Types plus one symbol only: the Host reaches an engine through application configuration (`visual`)
 * or through the plan value that the application passes (plans created by `defineChoreography` carry it).
 */
import type { TransactionId } from '../../../routing/staged/types.js';
import type { VisualConfiguration, VisualEngineCapability } from '../representation/types.js';
import type { ChoreographyPlan } from './plan.js';
import type { Participant, RunHost, SettleReason } from './run.js';

/** Non-enumerable engine reference on plans created by `defineChoreography`. */
export const PLAN_ENGINE: unique symbol = Symbol.for('composable-svelte.choreography-engine') as never;

/** What the Host drives on an active run (implemented by ChoreographyRun). */
export interface EngineRun {
  beforeRemoval(owner: object): void;
  /** S2: managed removal checkpoint for specific participant nodes (still connected). */
  participantsRemoving(nodes: readonly HTMLElement[]): void;
  rendered(owner: object): void;
  renderFailed(owner: object): void;
  claims(owner: object): boolean;
  registered(entry: Participant): void;
  handOff(): EngineHandoff;
  settle(reason: SettleReason): void;
  lifecycle(event: Parameters<import('./run.js').ChoreographyRun['lifecycle']>[0]): void;
  rebase(): void;
}
/** Opaque adopted state passed from a superseded run to its successor (or discarded). */
export interface EngineHandoff { readonly shared: readonly unknown[]; readonly outgoing: ReadonlyMap<HTMLElement, unknown>; readonly native?: unknown }

export interface VisualEngine extends VisualEngineCapability {
  createRun(host: RunHost, transaction: TransactionId, plan: ChoreographyPlan, source: object, handoff: EngineHandoff | undefined, done: () => void, localCommit?: () => void): EngineRun;
  /** Release adopted state that no successor continues (reduced motion, no current page). */
  discard(handoff: EngineHandoff): void;
  /** Resource ledger contributions (observers, representation handles, media). */
  resources(): { readonly observers: number; readonly handles: number; readonly media: number };
  /** Warm preparation reuse for registered participants (bounded; see cache.ts). */
  readonly cache: import('../representation/cache.js').ProjectionCache;
  warm(node: HTMLElement): void;
  forget(node: HTMLElement): void;
  /** Configuration used for runs created by this engine. */
  readonly configuration: VisualConfiguration;
}
export const isVisualEngine = (value: unknown): value is VisualEngine => !!value && typeof value === 'object' && (value as VisualEngine).kind === 'composable-visual-engine' && typeof (value as VisualEngine).createRun === 'function';
export function planEngine(plan: unknown): VisualEngine | undefined {
  const engine = plan && typeof plan === 'object' ? (plan as Record<symbol, unknown>)[PLAN_ENGINE] : undefined;
  return isVisualEngine(engine) ? engine : undefined;
}
