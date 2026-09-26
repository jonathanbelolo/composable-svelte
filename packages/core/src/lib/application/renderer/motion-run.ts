import { ResourceScope, type CleanupFunction, type ResourceRecord } from '../../execution/resources.js';
import type { ExecutionScheduler, TimerHandle } from '../../execution/scheduler.js';

/** Private renderer protocol. Never schedules feature actions or owns business state. */
export type MotionTerminal =
  | { readonly status: 'completed' }
  | { readonly status: 'skipped'; readonly reason: 'reducedMotion' | 'disabled' | 'unavailable' }
  | { readonly status: 'superseded'; readonly reason: 'replacement' | 'preferenceChanged' }
  | { readonly status: 'failed'; readonly error: unknown }
  | { readonly status: 'timedOut' }
  | { readonly status: 'disposed' };
export interface MotionReceipt {
  readonly id: symbol;
  readonly outcome: MotionTerminal;
  /** Normal settlement preserves delivery authority; replacement or owner death revokes it. */
  readonly current: boolean;
}
export interface MotionRunContext {
  readonly signal: AbortSignal;
  readonly live: boolean;
  /** Enroll immediately after acquiring a resource, including after cancellation. */
  adopt(cleanup: CleanupFunction): void;
}
export interface MotionPlan {
  /** End-to-end budget, including asynchronous target readiness. */
  readonly deadlineMs: number;
  readonly execute: (context: MotionRunContext) => void | Promise<void>;
  readonly stable: () => void;
  readonly skip?: Extract<MotionTerminal, { status: 'skipped' }>['reason'] | undefined;
  readonly complete?: true | undefined;
}
export interface MotionClock {
  /** Milliseconds; the returned disposer cancels it. A scheduler may invoke synchronously. */
  schedule(delayMs: number, callback: () => void): CleanupFunction;
}
export function createMotionClock(scheduler: ExecutionScheduler): MotionClock {
  return {
    schedule(delayMs: number, callback: () => void): CleanupFunction {
      let handle: TimerHandle | undefined;
      let cancelled = false;
      let handleCleared = false;
      const cancel = () => {
        cancelled = true;
        if (handle !== undefined && !handleCleared) {
          handleCleared = true;
          scheduler.clearTimer(handle);
        }
      };
      let synchronous = true;
      let firedSync = false;
      handle = scheduler.setTimer(delayMs, () => {
        if (synchronous) firedSync = true;
        callback();
      });
      synchronous = false;
      if (firedSync || cancelled) {
        cancel();
      }
      return cancel;
    }
  };
}
export interface MotionRun {
  readonly id: symbol;
  readonly live: boolean;
  readonly settled: Promise<MotionReceipt>;
}
interface ActiveRun extends MotionRun { settle(outcome: MotionTerminal): void; }
function isAbortError(error: unknown): boolean {
  try { return (error as {name?: unknown} | null)?.name === 'AbortError'; }
  catch { return false; }
}

/** One replaceable visual channel. Distinct properties can use distinct channels. */
export class MotionChannel {
  private current: ActiveRun | undefined;
  private disposed = false;
  private readonly resources: ResourceScope;
  constructor(
    private readonly owner: ResourceRecord,
    private readonly clock: MotionClock,
    private readonly diagnostic: (error: unknown) => void = error => console.error('[Composable Svelte] Motion cleanup:', error),
    private readonly observeCleanup?: ((cleanup: CleanupFunction) => void) | undefined
  ) {
    this.resources = new ResourceScope({ onCleanupError: error => this.report(error) });
    owner.addCleanup(() => this.dispose());
  }
  private report(error: unknown): void {
    if (this.observeCleanup) {
      try { this.observeCleanup(() => { throw error; }); return; } catch { /* Diagnostics cannot own settlement. */ }
    }
    try { void Promise.resolve(this.diagnostic(error)).catch(() => {}); } catch { /* Diagnostics cannot own settlement. */ }
  }
  start(plan: MotionPlan, cause: 'replacement' | 'preferenceChanged' = 'replacement'): MotionRun {
    // Reject malformed plans before disturbing the previous run.
    const deadlineMs = plan.deadlineMs;
    const execute = plan.execute;
    const stable = plan.stable;
    const skip = plan.skip;
    const complete = plan.complete;
    if (skip !== undefined && complete !== undefined)
      throw new TypeError('Cannot specify both skip and complete in a motion plan');
    if (!Number.isFinite(deadlineMs) || deadlineMs < 0 || deadlineMs > 2_147_483_647)
      throw new RangeError('Motion deadline must be finite nonnegative milliseconds within timer range');
    if (typeof execute !== 'function' || typeof stable !== 'function')
      throw new TypeError('Motion requires execution and stable projection functions');
    if (this.disposed || !this.owner.live) throw new Error('Cannot animate a retired owner');
    const controller = new AbortController();
    const record = this.resources.createRecord({ kind: 'execution', controller, description: 'Managed finite motion' });
    const id = Symbol('motion run');
    let terminal = false;
    let resolve!: (receipt: MotionReceipt) => void;
    const settled = new Promise<MotionReceipt>(done => { resolve = done; });
    const authoritative = () => !this.disposed && this.owner.live && this.current === run;
    const run: ActiveRun = {
      id,
      get live() { return !terminal && record.live && authoritative(); },
      settled,
      settle: outcome => {
        if (terminal) return;
        terminal = true;
        // Stop playback and resource writers before exposing stable appearance.
        // Cleanup can reenter start(), which must win over this run's fallback.
        record.dispose();
        let result = outcome;
        if (authoritative() && outcome.status !== 'superseded' && outcome.status !== 'disposed') {
          try {
            const projection: unknown = stable.call(plan);
            if (projection !== null && (typeof projection === 'object' || typeof projection === 'function') && typeof (projection as {then?: unknown}).then === 'function') {
              // A fallback cannot keep settlement pending. Observe rejected async
              // returns, but reject that unsupported writer contract immediately.
              void Promise.resolve(projection).catch(error => this.report(error));
              throw new TypeError('Stable motion projection must be synchronous');
            }
          }
          catch (error) { result = { status: 'failed', error }; this.report(error); }
        }
        const receipt: MotionReceipt = Object.freeze({
          id, outcome: Object.freeze(result), get current() { return authoritative(); }
        });
        resolve(receipt);
      }
    };
    const previous = this.current;
    this.current = run;
    previous?.settle({ status: 'superseded', reason: cause });
    // A predecessor disposer may have installed a newer run or destroyed owner.
    if (!run.live) {
      if (this.disposed || !this.owner.live) run.settle({ status: 'disposed' });
      else run.settle({ status: 'superseded', reason: 'replacement' });
      return run;
    }
    const installed = new WeakSet<CleanupFunction>();
    const context: MotionRunContext = Object.freeze({
      signal: controller.signal,
      get live() { return run.live; },
      adopt: (cleanup: CleanupFunction) => {
        if (typeof cleanup !== 'function' || installed.has(cleanup)) return;
        installed.add(cleanup);
        if (record.live) {
          record.addCleanup(cleanup);
        } else if (this.observeCleanup) {
          this.observeCleanup(cleanup);
        } else {
          record.addCleanup(cleanup);
        }
      }
    });
    const fail = (error: unknown) => {
      if (run.live) run.settle({ status: 'failed', error });
      else if (!(controller.signal.aborted && isAbortError(error))) this.report(error);
    };
    try {
      if (skip !== undefined) {
        run.settle({ status: 'skipped', reason: skip });
        return run;
      }
      if (complete) {
        run.settle({ status: 'completed' });
        return run;
      }
      // Enroll watchdog before readiness/playback; unresolved promises cannot retain a run.
      record.addCleanup(this.clock.schedule(deadlineMs, () => run.settle({ status: 'timedOut' })));
      if (run.live) {
        const execution = execute.call(plan, context);
        void Promise.resolve(execution).then(
          () => run.settle({ status: 'completed' }),
          fail
        );
      }
    } catch (error) { fail(error); }
    return run;
  }
  /** Private arbitration hook: losing a required property retires the whole run. */
  supersede(): void {
    const current = this.current;
    current?.settle({ status: 'superseded', reason: 'replacement' });
    if (this.current === current) this.current = undefined;
  }

  dispose(): Promise<void> {
    if (this.disposed) return this.resources.whenCleanupsSettled();
    this.disposed = true;
    const current = this.current;
    this.current = undefined;
    current?.settle({ status: 'disposed' });
    this.resources.dispose();
    return this.resources.whenCleanupsSettled();
  }
}
