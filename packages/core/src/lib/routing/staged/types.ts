/**
 * Staged route protocol vocabulary (I1/I2/I3). Internal and prospective: no name here is a
 * finalized public API. This module is type-only and motion-free.
 * Contract: specs/frontend/fluid-layout-motion-design.md, "Staged routing protocol".
 */
import type { OwnerToken } from '../../execution/identity.js';

export type RequestId = number & { readonly __stagedRequest: true };
export type TransactionId = number & { readonly __stagedTransaction: true };
/** Attachment epoch of the routed Host's history binding. */
export type EpochId = number & { readonly __historyEpoch: true };

export type StaleReason = 'rootDestroyed' | 'ownerRetired' | 'epochChanged' | 'traversal';
export type UnavailableReason = 'noBinding' | 'historyBarrier' | 'historyUncertain' | 'unmanagedRouteRender';
export type CancelReason =
  | 'returned' | 'explicit' | 'ownerRetired' | 'directCommit' | 'routeKeyFailed'
  | 'traversal' | 'historyUnavailable' | 'detached' | 'rootDestroyed';
export type HistoryResult = 'written' | 'unchanged' | 'failed';

/** Outcome of the one reserved commit action's turn (staged or degraded). */
export type CommitTurnOutcome =
  | { readonly type: 'committed'; readonly route: 'accepted' | 'redirected'; readonly attempted: 1; readonly domainCommitted: true; readonly url: string; readonly history: HistoryResult }
  | { readonly type: 'refused'; readonly attempted: 1; readonly domainCommitted: true; readonly url: string; readonly history: HistoryResult }
  | { readonly type: 'failed'; readonly phase: 'reduction'; readonly attempted: 1; readonly domainCommitted: false; readonly error: unknown }
  | { readonly type: 'failed'; readonly phase: 'routeClassification'; readonly attempted: 1; readonly domainCommitted: true; readonly history: 'failed'; readonly error: unknown }
  /** A reserved commit action dropped by root destruction. */
  | { readonly type: 'cancelled'; readonly reason: 'rootDestroyed'; readonly attempted: 0; readonly domainCommitted: false };

/** Exactly one terminal outcome per admitted transaction. */
export type TransactionOutcome =
  | CommitTurnOutcome
  | { readonly type: 'vetoed' | 'superseded'; readonly attempted: 0; readonly domainCommitted: false }
  | { readonly type: 'failed'; readonly phase: 'commitPolicy' | 'commitRouteKey'; readonly attempted: 0; readonly domainCommitted: false; readonly error: unknown }
  | { readonly type: 'cancelled'; readonly reason: CancelReason; readonly attempted: 0; readonly domainCommitted: false };

/** Exactly one terminal result per staged request call. */
export type RequestResult =
  | { readonly type: 'stale'; readonly reason: StaleReason }
  | { readonly type: 'failed'; readonly phase: 'admission'; readonly error: unknown }
  | { readonly type: 'rejected' | 'unchanged' | 'returned' }
  | { readonly type: 'dropped'; readonly reason: UnavailableReason }
  | { readonly type: 'degraded'; readonly reason: UnavailableReason; readonly outcome: CommitTurnOutcome }
  | { readonly type: 'admitted'; readonly transaction: TransactionId };

/**
 * Exhaustive protocol transcript. Request results and transaction events only; never domain
 * actions. A degraded request's result is emitted after its immediate turn settles.
 */
export type ProtocolEvent =
  | { readonly kind: 'request'; readonly request: RequestId; readonly result: RequestResult }
  | { readonly kind: 'admitted'; readonly transaction: TransactionId; readonly request: RequestId }
  | { readonly kind: 'terminal'; readonly transaction: TransactionId; readonly outcome: TransactionOutcome };

/** No-op controls; reported for diagnostics, never part of the exhaustive transcript. */
export type ProtocolDiagnostic =
  | { readonly kind: 'staleCue' | 'staleVisualReport' | 'staleCancel'; readonly transaction: TransactionId }
  | { readonly kind: 'cueSourceFailed'; readonly transaction: TransactionId; readonly error: unknown };

export interface RequestHandle {
  readonly id: RequestId;
  /** Read-only projection: `pending` until its one terminal result. */
  readonly status: 'pending' | RequestResult;
}

export type TransactionStatus =
  | { readonly phase: 'pending'; readonly committing: boolean }
  | { readonly phase: 'terminal'; readonly outcome: TransactionOutcome };

export interface StagedStatusProjection {
  /** The root's one pending transaction, if any. */
  readonly pending: TransactionId | undefined;
  transaction(id: TransactionId): TransactionStatus | undefined;
  request(id: RequestId): 'pending' | RequestResult | undefined;
  /** Transactions whose own staged cue deadline is still installed (independent of unrelated timers). */
  pendingDeadlines(): readonly TransactionId[];
}

/** Why a choreography settled before its cue while its transaction may still be pending. */
export type VisualTerminalReason = 'reducedMotion' | 'failed' | 'timeout' | 'unsupported' | 'planeDisposed' | 'completed';

/** Request options captured synchronously with the call. */
export interface StagedRequestOptions {
  /** Explicit return intent: cancels a pending transaction (`returned`) or is `unchanged`. */
  readonly return?: boolean | undefined;
  readonly onUnavailable?: 'immediate' | 'drop' | undefined;
  /** Opaque visual plan passed to the visual port; only `cueMs` is read by the coordinator. */
  readonly motion?: { readonly cueMs: number } | undefined;
  /** Disambiguates repeated visual keys; opaque to the protocol. */
  readonly placement?: string | undefined;
}

/** Captured at call time. `owner` absent for root-owned shell markup. */
export interface SourceAuthority {
  readonly owner: OwnerToken | undefined;
  readonly ownerLive: () => boolean;
  readonly epoch: EpochId | undefined;
  readonly generation: number;
  readonly placement: string | undefined;
}

// ---------------------------------------------------------------------------------------------
// I2: binding-owned staging eligibility

export type HistoryInvalidation = 'traversal' | 'historyUnavailable' | 'detached';
export interface StagingEligibility {
  /** Current attachment epoch, or undefined with no attached live binding. */
  epoch(): EpochId | undefined;
  /** Staged traversal generation; changes only for route-affecting traversals. */
  generation(): number;
  /** `ok` when attached, live, no barrier/correction and history is certain. */
  eligibility(): 'ok' | 'noBinding' | 'historyBarrier' | 'historyUncertain';
  /** Synchronous invalidation; traversal fires before its inspection is enqueued. */
  onInvalidate(listener: (cause: HistoryInvalidation) => void): () => void;
  /** History result recorded for the committed state of the turn just notified. */
  historyResult(committedState: unknown): HistoryResult;
  /**
   * Exact-turn evidence (preferred when present). Opened when a commit action is reserved; its
   * `result` reports only what this binding recorded during that turn: the recorded result, else
   * `unchanged` if live (not notified, so no write was due), else `failed` (retired; unprovable).
   */
  observeTurn?(): HistoryTurnObservation;
}
export interface HistoryTurnObservation {
  result(committedState: unknown): HistoryResult;
}

// ---------------------------------------------------------------------------------------------
// I3: routed-definition staging declaration (candidate public, prospective)

export interface StagedRouteDecision<A> {
  readonly action: A;
  /** Canonical root-relative URL expected if the reducer accepts. */
  readonly expectedURL: string;
}
export interface StagedPolicyInput<Intent> {
  readonly intent: Intent;
  readonly expectedURL: string;
  readonly currentURL: string;
  readonly routeKey: string;
}
export interface ApplicationStaging<S, A, Intent> {
  /** Pure eligibility against current state; evaluated at admission and at commit inspection. */
  readonly policy: (state: S, input: StagedPolicyInput<Intent>) => boolean;
  /** Pure intent mapping to one declared commit action and its expected destination. */
  readonly commit: (intent: Intent) => StagedRouteDecision<A>;
  /** Lifetime/invalidation equivalence. Default: fragment-projected canonical URL. */
  readonly routeKey?: ((state: S) => string) | undefined;
  /** Root slot rendered by the managed route outlet. */
  readonly routeSlot: object;
  readonly onUnavailable?: 'immediate' | 'drop' | undefined;
  /** Preparation budget before t=0 and cue slack; milliseconds. Implementation defaults apply. */
  readonly budgets?: { readonly preparationMs?: number | undefined; readonly cueSlackMs?: number | undefined } | undefined;
}

// ---------------------------------------------------------------------------------------------
// I1: coordinator surface

/** Lifecycle notifications to the optional visual port. No business authority. */
export type VisualLifecycle =
  | { readonly type: 'admitted'; readonly transaction: TransactionId; readonly motion: StagedRequestOptions['motion'] | undefined; readonly placement: string | undefined }
  | { readonly type: 'commitReserved'; readonly transaction: TransactionId }
  | { readonly type: 'terminal'; readonly transaction: TransactionId; readonly outcome: TransactionOutcome };

/**
 * Optional visual cue port supplied by a motion-capable Host. `admitted` returns `true` when the
 * Host will supply the cue (choreography); otherwise the coordinator uses the next-turn cue.
 */
export interface VisualCuePort {
  admitted(event: Extract<VisualLifecycle, { type: 'admitted' }>): boolean;
  notify(event: Exclude<VisualLifecycle, { type: 'admitted' }>): void;
}

export interface StagedRouteCoordinator<Intent> {
  request(intent: Intent, source: SourceAuthorityInput, options?: StagedRequestOptions): RequestHandle;
  /** Cue source only: appends a commit control. */
  cue(transaction: TransactionId): void;
  /** Early visual terminal outcome; appends a commit control only for the same pending transaction. */
  visualTerminal(transaction: TransactionId, reason: VisualTerminalReason): void;
  /** Owner-bound explicit cancel control. */
  cancel(transaction: TransactionId, owner: OwnerToken | undefined): void;
  readonly status: StagedStatusProjection;
  subscribe(listener: (event: ProtocolEvent) => void): () => void;
  subscribeDiagnostics(listener: (event: ProtocolDiagnostic) => void): () => void;
  /** Managed route outlet attachment; detaching cancels pending with `detached`. */
  setOutletAttached(attached: boolean): void;
  setVisualPort(port: VisualCuePort | undefined): void;
  /** Host binding attached/replaced (new epoch) or detached. */
  setEligibility(eligibility: StagingEligibility | undefined): void;
  /** Current attachment epoch (render identity component). */
  epoch(): EpochId | undefined;
  dispose(): void;
}
export interface SourceAuthorityInput {
  readonly owner?: OwnerToken | undefined;
  readonly ownerLive?: (() => boolean) | undefined;
  /** Owner-bound retirement observation; returns a detach that must not report retirement. */
  readonly observeRetirement?: ((retired: () => void) => () => void) | undefined;
}
