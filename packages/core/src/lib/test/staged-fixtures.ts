/**
 * Staged routing test fixture implementing StagingEligibility for TestStore.
 *
 * A simulation of the routed Host's history binding, not a physical history: it proves
 * adapter behavior only. Real binding/history evidence uses `bindManagedRootRoute`.
 *
 * Like the production binding (`routing/managed-binding.ts`), eligibility is derived from
 * independent facts rather than stored: attachment, history uncertainty, open traversal
 * barriers and an open correction. Each control changes only its own fact, and each
 * attachment owns its facts: handles from a retired attachment never change a later one.
 *
 * Once connected by `TestStore.enableStaging`, the fixture records an exact history result
 * for every committed turn with the store's own `serialize`, as the binding does: `unchanged`
 * when the URL did not change, `written` after a successful write, `failed` after an armed
 * write failure or a serialization failure (both then enter history uncertainty).
 *
 * Contract: specs/frontend/fluid-layout-motion-design.md, "Staged routing protocol"
 * and "Production and TestStore parity".
 */
import type {
  EpochId,
  HistoryInvalidation,
  HistoryResult,
  HistoryTurnObservation,
  StagingEligibility
} from '../routing/staged/types.js';

export interface TestStagingFixtureOptions {
  /** Start attached (default: true). */
  attached?: boolean | undefined;
  /** Epoch of the initial attachment (default: a fresh epoch). Ignored when detached. */
  initialEpoch?: EpochId | number | undefined;
  /** Initial staged traversal generation (default: 0). */
  initialGeneration?: number | undefined;
}

/** One observed browser traversal; settle it exactly once. */
export interface TestTraversal {
  /** Whether it has taken the route-affecting steps (at observation or reclassification). */
  readonly routeAffecting: boolean;
  /**
   * Reclassification at settlement: a traversal observed as fragment-only resolves to a route
   * request because an earlier queued turn changed the accepted URL. Takes the route-affecting
   * steps now; a no-op if it already took them.
   */
  reclassify(): void;
  /**
   * Settle the traversal and open its barrier.
   * - `correction`: settlement starts a correction (for example a vetoed traversal); the barrier
   *   stays closed until `deliverCorrection()` or `failCorrection()`.
   * - `failed`: settlement failed; history becomes uncertain.
   * Otherwise the settlement re-establishes an accepted entry and ends uncertainty.
   */
  settle(options?: { correction?: boolean; failed?: boolean }): void;
}

/** Store facts the fixture observes; supplied by TestStore.enableStaging. */
interface FixtureConnection {
  readonly state: () => unknown;
  readonly subscribe: (listener: (state: unknown) => void) => () => void;
  readonly serialize: (state: unknown) => string;
}

/** TestStore-internal connection hook; not part of the public test API. */
export const connectStagingFixture = Symbol('connectStagingFixture');

type Recorded = { readonly state: unknown; readonly result: HistoryResult };

/**
 * One attachment's binding state. Like a production binding instance, it is never revived:
 * `attach()` always creates a new one, even for a repeated epoch ID, and handles or turn
 * observations captured from an older attachment can neither read nor change a newer one.
 */
interface Attachment {
  readonly epoch: EpochId;
  live: boolean;
  uncertain: boolean;
  /** Increments on every entry into uncertainty, including while already uncertain. */
  uncertaintyRevision: number;
  openTraversals: number;
  correctionOpen: boolean;
  acceptedState: unknown;
  acceptedURL: string | undefined;
  writeFailed: boolean;
  lastTurn: Recorded | undefined;
  observing: { recorded: Recorded | undefined } | undefined;
}

export class TestStagingFixture implements StagingEligibility {
  private _current: Attachment | undefined;
  private _generation: number;
  private readonly _listeners = new Set<(cause: HistoryInvalidation) => void>();
  private readonly _usedEpochs = new Set<EpochId>();
  private _nextEpoch = 0;
  private _connection: FixtureConnection | undefined;
  private _armedWriteFailures = 0;

  constructor(options: TestStagingFixtureOptions = {}) {
    this._generation = options.initialGeneration ?? 0;
    if (options.attached ?? true) this._current = this._open(this._allocate(options.initialEpoch));
  }

  // ------------------------------------------------------------------ StagingEligibility

  epoch(): EpochId | undefined {
    return this._current?.epoch;
  }

  generation(): number {
    return this._generation;
  }

  eligibility(): 'ok' | 'noBinding' | 'historyBarrier' | 'historyUncertain' {
    const current = this._current;
    if (!current) return 'noBinding';
    if (current.uncertain) return 'historyUncertain';
    if (current.openTraversals > 0 || current.correctionOpen) return 'historyBarrier';
    return 'ok';
  }

  onInvalidate(listener: (cause: HistoryInvalidation) => void): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  historyResult(committedState: unknown): HistoryResult {
    const last = this._current?.lastTurn;
    if (last !== undefined && Object.is(last.state, committedState)) return last.result;
    return this._current ? 'unchanged' : 'failed';
  }

  /**
   * Exact-turn evidence from the attachment current when the observation opens. Its result is
   * what that attachment recorded for the committed state; otherwise `unchanged` only while that
   * same attachment is still live, else `failed`: a retired attachment cannot prove no write was
   * due, and a later attachment's writes or liveness are not evidence for it.
   */
  observeTurn(): HistoryTurnObservation {
    const attachment = this._current;
    const turn: { recorded: Recorded | undefined } = { recorded: undefined };
    if (attachment) attachment.observing = turn;
    return {
      result: state => {
        if (attachment?.observing === turn) attachment.observing = undefined;
        const recorded = turn.recorded;
        if (recorded !== undefined && Object.is(recorded.state, state)) return recorded.result;
        return attachment?.live ? 'unchanged' : 'failed';
      }
    };
  }

  // ------------------------------------------------------------------ attachment

  /** True while an epoch is attached. */
  get attached(): boolean {
    return this._current !== undefined;
  }

  /**
   * Attach a new attachment, retiring any current one (its pending work is invalidated with
   * `detached`). The new attachment starts with certain history and no open barrier, and
   * reconciles its accepted URL to the current committed state; pending intent is never replayed.
   *
   * Omitting `epochId` allocates a fresh epoch that never repeats. Passing an explicit ID uses
   * that identity, including a previously used one; the attachment itself is still new.
   */
  attach(epochId?: EpochId | number): EpochId {
    const previous = this._current;
    if (previous) previous.live = false;
    const next = this._open(this._allocate(epochId));
    this._current = next;
    this._reconcile(next);
    if (previous) this._invalidate('detached');
    return next.epoch;
  }

  /** Detach the current attachment; invalidates pending work with `detached`. No-op when detached. */
  detach(): void {
    const current = this._current;
    if (!current) return;
    current.live = false;
    this._current = undefined;
    this._invalidate('detached');
  }

  // ------------------------------------------------------------------ traversals

  /**
   * Observe a browser traversal on the current attachment. A route-affecting traversal (default)
   * synchronously increments the staged generation, closes its barrier and invalidates with
   * `traversal` before its inspection would be enqueued. A fragment-only traversal does neither
   * unless reclassified. With no live attachment nothing is observed, and a handle whose
   * attachment has since been retired is inert: it never changes a later attachment.
   */
  observeTraversal(options?: { routeAffecting?: boolean }): TestTraversal {
    const fixture = this;
    const attachment = this._current;
    const observedRevision = attachment?.uncertaintyRevision;
    let routeAffecting = false;
    let released = false;
    let settled = false;
    const owns = () => attachment !== undefined && attachment.live && fixture._current === attachment;
    const routeSteps = () => {
      if (routeAffecting || !owns()) return;
      routeAffecting = true;
      fixture._generation++;
      attachment!.openTraversals++;
      fixture._invalidate('traversal');
    };
    if (options?.routeAffecting !== false) routeSteps();
    return {
      get routeAffecting() { return routeAffecting; },
      reclassify() {
        if (settled) throw new Error('[TestStagingFixture] reclassify() after settlement');
        routeSteps();
      },
      settle(settleOptions) {
        if (settled) throw new Error('[TestStagingFixture] traversal already settled');
        settled = true;
        if (!owns()) return;
        const current = attachment!;
        try {
          if (settleOptions?.correction) current.correctionOpen = true;
          if (settleOptions?.failed) fixture._enterUncertain(current);
          // Clearing needs current evidence: no uncertainty was entered after this traversal was
          // observed, and no correction is still open (production binding's settlement rule).
          else if (!current.correctionOpen && current.uncertaintyRevision === observedRevision) current.uncertain = false;
        } finally {
          if (routeAffecting && !released) { released = true; current.openTraversals--; }
        }
      }
    };
  }

  /**
   * A traversal observed but unprocessable on the current attachment: conservatively
   * route-affecting (the generation changes and pending work is invalidated) and history
   * becomes uncertain. No-op when detached.
   */
  failTraversalObservation(): void {
    const current = this._current;
    if (!current) return;
    this._generation++;
    this._invalidate('traversal');
    this._enterUncertain(current);
  }

  // ------------------------------------------------------------------ corrections

  /** A correction is in flight on the current attachment; its barrier stays closed until it arrives or fails. */
  startCorrection(): void {
    if (this._current) this._current.correctionOpen = true;
  }

  /** The correction's matched arrival was processed; its barrier opens. */
  deliverCorrection(): void {
    if (this._current) this._current.correctionOpen = false;
  }

  /**
   * The correction failed. With `reestablished`, the binding re-established an accepted entry
   * and history is certain; otherwise history becomes uncertain.
   */
  failCorrection(options?: { reestablished?: boolean }): void {
    const current = this._current;
    if (!current) return;
    current.correctionOpen = false;
    if (options?.reestablished) current.uncertain = false;
    else this._enterUncertain(current);
  }

  // ------------------------------------------------------------------ writes

  /**
   * Arm physical write failures for the next `count` history writes. The failing turn records
   * `failed` for its own committed state (reported alongside its outcome), then history becomes
   * uncertain. A later successful write ends uncertainty (the binding's existing retry).
   *
   * A serialization failure needs no control: make the store's `serialize` throw, which both
   * the coordinator's classification and this fixture observe, as in production.
   */
  failNextWrite(count: number = 1): void {
    if (!Number.isInteger(count) || count < 1) throw new RangeError('[TestStagingFixture] failNextWrite count must be a positive integer');
    this._armedWriteFailures += count;
  }

  /** Clear armed write failures that have not fired. */
  clearWriteFailures(): void {
    this._armedWriteFailures = 0;
  }

  // ------------------------------------------------------------------ internals

  /** @internal Connect to a store's committed turns; TestStore.enableStaging calls this once. */
  [connectStagingFixture](connection: FixtureConnection): () => void {
    if (this._connection) throw new Error('[TestStagingFixture] fixture is already connected to a store');
    this._connection = connection;
    if (this._current) this._reconcile(this._current);
    const stop = connection.subscribe(state => this._accept(state));
    return () => {
      stop();
      if (this._connection === connection) this._connection = undefined;
    };
  }

  private _open(epoch: EpochId): Attachment {
    return {
      epoch, live: true, uncertain: false, uncertaintyRevision: 0, openTraversals: 0, correctionOpen: false,
      acceptedState: undefined, acceptedURL: undefined, writeFailed: false, lastTurn: undefined, observing: undefined
    };
  }

  private _allocate(epochId: EpochId | number | undefined): EpochId {
    let next: EpochId;
    if (epochId !== undefined) {
      next = epochId as EpochId;
      if (next >= this._nextEpoch) this._nextEpoch = next;
    } else {
      do { next = ++this._nextEpoch as EpochId; } while (this._usedEpochs.has(next));
    }
    this._usedEpochs.add(next);
    return next;
  }

  private _invalidate(cause: HistoryInvalidation): void {
    for (const listener of [...this._listeners]) {
      try { listener(cause); } catch { /* Observers cannot prevent invalidation. */ }
    }
  }

  private _enterUncertain(attachment: Attachment): void {
    attachment.uncertaintyRevision++;
    if (attachment.uncertain) return;
    attachment.uncertain = true;
    if (this._current === attachment) this._invalidate('historyUnavailable');
  }

  private _record(attachment: Attachment, state: unknown, result: HistoryResult): void {
    attachment.lastTurn = { state, result };
    if (attachment.observing) attachment.observing.recorded = attachment.lastTurn;
  }

  /** The accepted entry follows the current committed state (initial connect or a new attachment). */
  private _reconcile(attachment: Attachment): void {
    const connection = this._connection;
    if (!connection) return;
    const state = connection.state();
    attachment.acceptedState = state;
    try { attachment.acceptedURL = connection.serialize(state); }
    catch { attachment.acceptedURL = undefined; attachment.writeFailed = true; this._enterUncertain(attachment); }
  }

  /** Mirrors the binding's per-turn write on the current attachment: record, serialize, write or fail. */
  private _accept(state: unknown): void {
    const attachment = this._current;
    if (!this._connection || !attachment) return;
    this._record(attachment, state, 'unchanged');
    if (Object.is(state, attachment.acceptedState) && !attachment.writeFailed) return;
    attachment.acceptedState = state;
    let nextURL: string;
    try { nextURL = this._connection.serialize(state); }
    catch {
      attachment.writeFailed = true;
      this._record(attachment, state, 'failed');
      this._enterUncertain(attachment);
      return;
    }
    if (nextURL === attachment.acceptedURL && !attachment.writeFailed) return;
    attachment.acceptedURL = nextURL;
    if (this._armedWriteFailures > 0) {
      this._armedWriteFailures--;
      attachment.writeFailed = true;
      this._record(attachment, state, 'failed');
      this._enterUncertain(attachment);
      return;
    }
    attachment.writeFailed = false;
    this._record(attachment, state, 'written');
    attachment.uncertain = false;
  }
}

/** Create a TestStagingFixture. */
export function createStagingFixture(options?: TestStagingFixtureOptions): TestStagingFixture {
  return new TestStagingFixture(options);
}
