/**
 * Staged route coordinator (I1). Framework work runs as root FIFO inspections: admission, commit
 * inspection and explicit cancel are never reduced and never domain actions. Motion-free.
 * Contract: specs/frontend/fluid-layout-motion-design.md, "Staged routing protocol".
 */
import type { Access } from '../../execution/store-access.js';
import type { InspectionEvent, InspectionResolution } from '../../execution/turn-queue.js';
import type { OwnerToken } from '../../execution/identity.js';
import type { TimerHandle } from '../../execution/scheduler.js';
import type {
  ApplicationStaging, CancelReason, CommitTurnOutcome, EpochId, ProtocolDiagnostic, ProtocolEvent,
  RequestHandle, RequestId, RequestResult, SourceAuthority, SourceAuthorityInput, StagedRequestOptions,
  StagedRouteCoordinator, StagedStatusProjection, StagingEligibility, HistoryTurnObservation, TransactionId, TransactionOutcome,
  TransactionStatus, UnavailableReason, VisualCuePort, VisualTerminalReason
} from './types.js';

/** Implementation defaults (Q7); reported in the slice report, not design constants. */
/** Preparation 600 ms: calibrated with the visual preparation default (measured cold 1500-element preparation 326–376 ms). */
export const STAGED_DEFAULTS = Object.freeze({ preparationMs: 600, cueSlackMs: 250 });

export interface StagedCoordinatorInput<S, A, Intent> {
  readonly access: Pick<Access<A>, 'enqueueInspection' | 'scheduler' | 'isLive'>;
  /** Committed root state. */
  readonly state: () => S;
  /** Committed state subscription; notified in the queue's subscriber pass. */
  readonly subscribe: (listener: (state: S) => void) => () => void;
  readonly staging: ApplicationStaging<S, A, Intent>;
  /** Canonical, fragment-projected serialization of committed state. */
  readonly serialize: (state: S) => string;
  /** Canonical, fragment-projected form of a declared expected URL. */
  readonly destination: (url: string) => string;
  readonly cueMode?: 'auto' | 'manual' | undefined;
  /** Observer-failure sink. Failures never acquire root or DOM authority and are never rethrown. */
  readonly report?: ((error: unknown) => void) | undefined;
}

/** Terminal request/transaction statuses retained for the read-only projection. Pending entries are never evicted. */
export const STAGED_RETAINED_TERMINALS = 64;

interface Transaction<A, Intent> {
  readonly id: TransactionId;
  readonly request: RequestId;
  readonly source: SourceAuthority;
  readonly intent: Intent;
  readonly action: A;
  readonly expectedURL: string;
  readonly routeKey: string;
  readonly epoch: EpochId;
  status: TransactionStatus;
  detachRetirement: (() => void) | undefined;
  deadline: TimerHandle | undefined;
}

type Classified = { readonly url: string } | { readonly error: unknown };

export function createStagedCoordinator<S, A, Intent>(input: StagedCoordinatorInput<S, A, Intent>): StagedRouteCoordinator<Intent> {
  const { access, staging } = input;
  const routeKeyOf = staging.routeKey ?? input.serialize;
  const cueMode = input.cueMode ?? 'auto';
  const budgets = { ...STAGED_DEFAULTS, ...Object.fromEntries(Object.entries(staging.budgets ?? {}).filter(([, v]) => v !== undefined)) };
  let nextRequest = 0, nextTransaction = 0;
  const requests = new Map<RequestId, 'pending' | RequestResult>();
  const transactions = new Map<TransactionId, Transaction<A, Intent>>();
  let pending: Transaction<A, Intent> | undefined;
  /** The transaction whose reserved commit turn is running (attribution before reduction). */
  let committing: Transaction<A, Intent> | undefined;
  let eligibility: StagingEligibility | undefined;
  let stopEligibility: (() => void) | undefined;
  let outletAttached = false;
  let visual: VisualCuePort | undefined;
  let disposed = false;
  const listeners = new Set<(event: ProtocolEvent) => void>();
  const diagnosticListeners = new Set<(event: ProtocolDiagnostic) => void>();

  // Ordered, non-reentrant delivery: events produced by a listener (for example a terminal caused by a
  // synchronous dispose) are delivered after the events already being delivered, never interleaved.
  const emitQueue: ProtocolEvent[] = [];
  let emitting = false;
  const emit = (...events: ProtocolEvent[]) => {
    emitQueue.push(...events);
    if (emitting) return;
    emitting = true;
    try {
      while (emitQueue.length) {
        const event = emitQueue.shift()!;
        for (const listener of [...listeners]) { try { listener(event); } catch (error) { reportError(error); } }
      }
    } finally { emitting = false; }
  };
  const diagnose = (event: ProtocolDiagnostic) => { for (const listener of [...diagnosticListeners]) { try { listener(event); } catch (error) { reportError(error); } } };
  const reportError = (error: unknown) => { try { input.report?.(error); } catch { /* A diagnostic sink cannot change the protocol. */ } };
  const retainedRequests: RequestId[] = [];
  const retainedTransactions: TransactionId[] = [];
  const retain = <K,>(order: K[], map: Map<K, unknown>, id: K) => {
    order.push(id);
    while (order.length > STAGED_RETAINED_TERMINALS) map.delete(order.shift()!);
  };
  const decide = (id: RequestId, result: RequestResult, ...also: ProtocolEvent[]) => {
    const handle = handles.get(id);
    if (!handle || handle.status !== 'pending') return;
    handle.status = result;
    handles.delete(id);
    requests.set(id, result);
    retain(retainedRequests, requests, id);
    degradedObservers.delete(id);
    emit({ kind: 'request', request: id, result }, ...also);
  };
  const handles = new Map<RequestId, { status: 'pending' | RequestResult }>();
  const notifyVisual = (event: Parameters<VisualCuePort['notify']>[0]) => {
    try { visual?.notify(event); } catch (error) { reportError(error); }
  };
  const end = (tx: Transaction<A, Intent>, outcome: TransactionOutcome) => {
    if (tx.status.phase === 'terminal') return;
    tx.status = { phase: 'terminal', outcome };
    if (pending === tx) pending = undefined;
    if (committing === tx) committing = undefined;
    const detach = tx.detachRetirement; tx.detachRetirement = undefined;
    try { detach?.(); } catch (error) { reportError(error); }
    if (tx.deadline !== undefined) { access.scheduler.clearTimer(tx.deadline); tx.deadline = undefined; }
    retain(retainedTransactions, transactions, tx.id);
    emit({ kind: 'terminal', transaction: tx.id, outcome });
    notifyVisual({ type: 'terminal', transaction: tx.id, outcome });
  };
  const cancelled = (reason: CancelReason): TransactionOutcome => ({ type: 'cancelled', reason, attempted: 0, domainCommitted: false });
  const cancelPending = (reason: CancelReason) => { const tx = pending; if (tx && committing !== tx) end(tx, cancelled(reason)); };

  const classify = (committedState: S): Classified => {
    try { return { url: input.serialize(committedState) }; } catch (error) { return { error }; }
  };
  /** Classification by exact URL after the reserved turn's notifications (Q2 settlement point). */
  const commitOutcome = (committedState: S, preURL: string, expectedURL: string, binding: StagingEligibility | undefined, turn: HistoryTurnObservation | undefined): CommitTurnOutcome => {
    const classified = classify(committedState);
    if ('error' in classified) {
      // Committed state is preserved; the binding's own serialization failure enters uncertainty.
      return { type: 'failed', phase: 'routeClassification', attempted: 1, domainCommitted: true, history: 'failed', error: classified.error };
    }
    // History evidence comes from the exact binding captured when the commit action was reserved,
    // never from whatever eligibility is current after notifications (it may have detached).
    const history = turn ? turn.result(committedState) : binding ? binding.historyResult(committedState) : 'unchanged';
    if (classified.url === expectedURL) return { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: classified.url, history };
    if (classified.url === preURL) return { type: 'refused', attempted: 1, domainCommitted: true, url: classified.url, history };
    return { type: 'committed', route: 'redirected', attempted: 1, domainCommitted: true, url: classified.url, history };
  };
  /** Shared terminal observation for a reserved commit action (staged or degraded). */
  const observeReserved = (settle: (outcome: CommitTurnOutcome) => void, preURL: () => string, expectedURL: string, binding: StagingEligibility | undefined) => {
    let committedState: { value: S } | undefined;
    const observer = (event: InspectionEvent<unknown, A>) => {
      if (event.type === 'committed') committedState = { value: event.state as S };
      else if (event.type === 'rejected') settle({ type: 'failed', phase: 'reduction', attempted: 1, domainCommitted: false, error: event.error });
      else if (event.type === 'dropped') settle({ type: 'cancelled', reason: 'rootDestroyed', attempted: 0, domainCommitted: false });
    };
    // Exact-turn evidence: opened now, immediately before the reserved turn (it runs next in FIFO).
    const turn = binding?.observeTurn?.();
    const settled = () => { if (committedState) settle(commitOutcome(committedState.value, preURL(), expectedURL, binding, turn)); };
    return { observer, settled };
  };

  // -------------------------------------------------------------------------------- invalidation
  const stopDirect = input.subscribe(state => {
    const tx = pending;
    if (!tx || committing === tx) return;
    let key: string;
    try { key = routeKeyOf(state); } catch { end(tx, cancelled('routeKeyFailed')); return; }
    if (key !== tx.routeKey) end(tx, cancelled('directCommit'));
  });

  // ---------------------------------------------------------------------------------- admission
  const unavailableReason = (): UnavailableReason | undefined => {
    if (!eligibility || eligibility.epoch() === undefined) return 'noBinding';
    const state = eligibility.eligibility();
    if (state !== 'ok') return state;
    if (!outletAttached) return 'unmanagedRouteRender';
    return undefined;
  };
  const admit = (id: RequestId, source: SourceAuthority, intent: Intent, options: StagedRequestOptions, retirement: SourceAuthorityInput['observeRetirement']): InspectionResolution<A> | undefined => {
    // 1. Freshness.
    if (!access.isLive() || disposed) { decide(id, { type: 'stale', reason: 'rootDestroyed' }); return undefined; }
    if (source.owner !== undefined && !source.ownerLive()) { decide(id, { type: 'stale', reason: 'ownerRetired' }); return undefined; }
    if (eligibility?.epoch() !== source.epoch) { decide(id, { type: 'stale', reason: 'epochChanged' }); return undefined; }
    if ((eligibility?.generation() ?? 0) !== source.generation) { decide(id, { type: 'stale', reason: 'traversal' }); return undefined; }
    // 2. Policy.
    const state = input.state();
    let action: A, expectedURL: string, currentURL: string, routeKey: string;
    try {
      const decision = staging.commit(intent);
      if (!decision || typeof decision !== 'object' || !('action' in decision) || typeof decision.expectedURL !== 'string') throw new TypeError('Staged commit must return an action with expectedURL');
      action = decision.action;
      expectedURL = input.destination(decision.expectedURL);
      currentURL = input.serialize(state);
      routeKey = routeKeyOf(state);
      const eligible = staging.policy(state, { intent, expectedURL, currentURL, routeKey });
      if (typeof eligible !== 'boolean') throw new TypeError('Staging policy must return a boolean');
      if (!eligible) { decide(id, { type: 'rejected' }); return undefined; }
    } catch (error) {
      decide(id, { type: 'failed', phase: 'admission', error });
      return undefined;
    }
    // 3. Return or unchanged: explicit intent or exact committed-URL equality, never key equality.
    if (options.return === true || expectedURL === currentURL) {
      if (pending) { end(pending, cancelled('returned')); decide(id, { type: 'returned' }); }
      else decide(id, { type: 'unchanged' });
      return undefined;
    }
    // 4. Staging.
    const reason = unavailableReason();
    if (reason === undefined) {
      if (pending) end(pending, { type: 'superseded', attempted: 0, domainCommitted: false });
      const tx: Transaction<A, Intent> = {
        id: ++nextTransaction as TransactionId, request: id, source, intent, action, expectedURL, routeKey,
        epoch: source.epoch!, status: { phase: 'pending', committing: false }, detachRetirement: undefined, deadline: undefined
      };
      transactions.set(tx.id, tx);
      pending = tx;
      if (retirement) {
        try {
          tx.detachRetirement = retirement(() => {
            // Owner retirement performed by this transaction's own commit turn is part of the commit.
            if (committing !== tx) end(tx, cancelled('ownerRetired'));
          });
        } catch (error) { reportError(error); }
      }
      // All admission bookkeeping (pending, retirement, absolute deadline) precedes observable callbacks,
      // so a terminal caused by an observer clears it; observers never resurrect terminal work.
      const cueMs = options.motion?.cueMs ?? 0;
      const deadlineMs = budgets.preparationMs + (Number.isFinite(cueMs) && cueMs > 0 ? cueMs : 0) + budgets.cueSlackMs;
      if (pending === tx) tx.deadline = access.scheduler.setTimer(deadlineMs, () => { tx.deadline = undefined; if (pending === tx) enqueueCommit(tx); });
      decide(id, { type: 'admitted', transaction: tx.id }, { kind: 'admitted', transaction: tx.id, request: id });
      if (pending !== tx || disposed) return undefined;
      let visualCue = false;
      if (pending === tx && visual) {
        try { visualCue = visual.admitted({ type: 'admitted', transaction: tx.id, motion: options.motion, placement: source.placement }) === true; }
        catch (error) { diagnose({ kind: 'cueSourceFailed', transaction: tx.id, error }); }
      }
      // Next-turn cue: no motion-capable Host, reduced motion, or a plan unsupported before playback.
      if (!visualCue && cueMode === 'auto' && pending === tx) enqueueCommit(tx);
      return undefined;
    }
    // 5. Unavailable.
    if ((options.onUnavailable ?? staging.onUnavailable ?? 'immediate') === 'drop') { decide(id, { type: 'dropped', reason }); return undefined; }
    const preURL = currentURL;
    // A fresh noBinding request keeps the baseline: no binding, no write, `unchanged`.
    const reserved = observeReserved(outcome => decide(id, { type: 'degraded', reason, outcome }), () => preURL, expectedURL, reason === 'noBinding' ? undefined : eligibility);
    degradedObservers.set(id, reserved.observer);
    // Protocol-issued turn: a reducer rejection is failed(reduction) plus the runtime failure sink.
    return { action, settled: reserved.settled, failure: 'report' };
  };
  const degradedObservers = new Map<RequestId, (event: InspectionEvent<unknown, A>) => void>();

  // --------------------------------------------------------------------------------- commit path
  const enqueueCommit = (tx: Transaction<A, Intent>) => {
    let reserved: ReturnType<typeof observeReserved> | undefined;
    access.enqueueInspection(() => {
      if (pending !== tx) { diagnose({ kind: 'staleCue', transaction: tx.id }); return undefined; }
      if (tx.source.owner !== undefined && !tx.source.ownerLive()) { end(tx, cancelled('ownerRetired')); return undefined; }
      if (eligibility?.epoch() !== tx.epoch || !outletAttached) { end(tx, cancelled('detached')); return undefined; }
      if (eligibility.generation() !== tx.source.generation) { end(tx, cancelled('traversal')); return undefined; }
      if (eligibility.eligibility() !== 'ok') { end(tx, cancelled('historyUnavailable')); return undefined; }
      const state = input.state();
      let key: string, preURL: string;
      try { key = routeKeyOf(state); preURL = input.serialize(state); }
      catch (error) { end(tx, { type: 'failed', phase: 'commitRouteKey', attempted: 0, domainCommitted: false, error }); return undefined; }
      if (key !== tx.routeKey) { end(tx, cancelled('directCommit')); return undefined; }
      let eligible: unknown;
      try { eligible = staging.policy(state, { intent: tx.intent, expectedURL: tx.expectedURL, currentURL: preURL, routeKey: key }); if (typeof eligible !== 'boolean') throw new TypeError('Staging policy must return a boolean'); }
      catch (error) { end(tx, { type: 'failed', phase: 'commitPolicy', attempted: 0, domainCommitted: false, error }); return undefined; }
      if (!eligible) { end(tx, { type: 'vetoed', attempted: 0, domainCommitted: false }); return undefined; }
      committing = tx;
      tx.status = { phase: 'pending', committing: true };
      reserved = observeReserved(outcome => end(tx, outcome), () => preURL, tx.expectedURL, eligibility);
      notifyVisual({ type: 'commitReserved', transaction: tx.id });
      return { action: tx.action, settled: reserved.settled, failure: 'report' };
    }, undefined, event => {
      if (event.type === 'inspection-dropped') { if (pending === tx) end(tx, cancelled('rootDestroyed')); return; }
      if (event.type === 'inspection-rejected') { if (pending === tx) end(tx, { type: 'failed', phase: 'commitPolicy', attempted: 0, domainCommitted: false, error: event.error }); return; }
      reserved?.observer(event);
    });
  };

  // ------------------------------------------------------------------------------------ surface
  const status: StagedStatusProjection = {
    get pending() { return pending?.id; },
    transaction: id => transactions.get(id)?.status,
    request: id => requests.get(id),
    pendingDeadlines: () => [...transactions.values()].filter(tx => tx.deadline !== undefined).map(tx => tx.id)
  };
  const coordinator: StagedRouteCoordinator<Intent> = {
    epoch: () => eligibility?.epoch(),
    request(intent, sourceInput, options = {}) {
      const id = ++nextRequest as RequestId;
      requests.set(id, 'pending');
      const record: { status: 'pending' | RequestResult } = { status: 'pending' };
      handles.set(id, record);
      const handle: RequestHandle = { id, get status() { return record.status; } };
      const source: SourceAuthority = {
        owner: sourceInput.owner,
        ownerLive: sourceInput.ownerLive ?? (() => true),
        epoch: eligibility?.epoch(),
        generation: eligibility?.generation() ?? 0,
        placement: options.placement
      };
      if (disposed) { decide(id, { type: 'stale', reason: 'rootDestroyed' }); return handle; }
      const captured = Object.freeze({ ...options });
      access.enqueueInspection(() => admit(id, source, intent, captured, sourceInput.observeRetirement), undefined, event => {
        if (event.type === 'inspection-dropped') { decide(id, { type: 'stale', reason: event.reason === 'destroyed' ? 'rootDestroyed' : 'ownerRetired' }); return; }
        if (event.type === 'inspection-rejected') { decide(id, { type: 'failed', phase: 'admission', error: event.error }); return; }
        const observer = degradedObservers.get(id);
        if (!observer) return;
        if (event.type === 'committed' || event.type === 'rejected' || event.type === 'dropped') {
          if (event.type !== 'committed') degradedObservers.delete(id);
          observer(event);
        }
      });
      return handle;
    },
    cue(tx) {
      const record = transactions.get(tx);
      if (!record || pending !== record) { diagnose({ kind: 'staleCue', transaction: tx }); return; }
      enqueueCommit(record);
    },
    visualTerminal(tx, _reason: VisualTerminalReason) {
      const record = transactions.get(tx);
      if (!record || pending !== record) { diagnose({ kind: 'staleVisualReport', transaction: tx }); return; }
      enqueueCommit(record);
    },
    cancel(tx, owner: OwnerToken | undefined) {
      access.enqueueInspection(() => {
        const record = transactions.get(tx);
        if (!record || pending !== record || record.source.owner !== owner) { diagnose({ kind: 'staleCancel', transaction: tx }); return undefined; }
        end(record, cancelled('explicit'));
        return undefined;
      }, undefined, () => {});
    },
    status,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    subscribeDiagnostics(listener) { diagnosticListeners.add(listener); return () => { diagnosticListeners.delete(listener); }; },
    setOutletAttached(attached) {
      if (outletAttached === attached) return;
      outletAttached = attached;
      if (!attached) cancelPending('detached');
    },
    setVisualPort(port) { visual = port; },
    setEligibility(next) {
      if (eligibility === next) return;
      stopEligibility?.(); stopEligibility = undefined;
      const tx = pending;
      eligibility = next;
      if (tx && committing !== tx && next?.epoch() !== tx.epoch) end(tx, cancelled('detached'));
      if (next) {
        stopEligibility = next.onInvalidate(cause => {
          if (eligibility !== next) return;
          cancelPending(cause === 'traversal' ? 'traversal' : cause === 'historyUnavailable' ? 'historyUnavailable' : 'detached');
        });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // A reserved commit turn already running finalizes through its own settlement or terminal event.
      const tx = pending;
      if (tx && committing !== tx) end(tx, cancelled('rootDestroyed'));
      stopDirect();
      stopEligibility?.();
      eligibility = undefined;
      visual = undefined;
    }
  };
  return coordinator;
}
