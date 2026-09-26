/** Shared internal resource lifecycle, independent of Svelte and TestStore. */
import type { Dispatch } from '../types.js';
export type CleanupFunction = () => void | Promise<void>;
type ErrorReporter = (error: unknown) => void;

/** Diagnostic failures must not interrupt cancellation or create rejected handlers. */
function report(onError: ErrorReporter | undefined, error: unknown): void {
  try { void Promise.resolve(onError?.(error)).catch(() => {}); }
  catch { /* The failing diagnostic sink cannot own teardown. */ }
}

export function safeCleanup(cleanup: CleanupFunction | void | null, onError?: ErrorReporter): Promise<void> | void {
  if (typeof cleanup !== 'function') return;
  try { return Promise.resolve(cleanup()).catch(error => report(onError, error)); }
  catch (error) { report(onError, error); }
}

/** Invoke all disposers synchronously before awaiting any returned cleanup promises. */
export async function safeCleanupAll(cleanups: Iterable<CleanupFunction | void | null>, onError?: ErrorReporter): Promise<void> {
  await Promise.all([...cleanups].map(cleanup => safeCleanup(cleanup, onError)));
}

/**
 * Subscribe before invoking code that may synchronously cancel itself.
 * This low-level result promise can reject and must be observed by its caller;
 * ResourceScope exposes a non-rejecting notification plus an explicit outcome instead.
 */
export function settleAbandonedWork<T = void>(execute: () => T | Promise<T>, signal: AbortSignal, onLateError?: ErrorReporter): {
  logicalPromise: Promise<T | undefined>;
  executionPromise: Promise<T | undefined>;
} {
  if (signal.aborted) {
    const settled = Promise.resolve(undefined);
    return { logicalPromise: settled, executionPromise: settled };
  }
  let resolveLogical!: (value: T | undefined) => void;
  let rejectLogical!: (error: unknown) => void;
  let settled = false;
  const logicalPromise = new Promise<T | undefined>((resolve, reject) => { resolveLogical = resolve; rejectLogical = reject; });
  const complete = (error: unknown, value: T | undefined, failed: boolean): void => {
    if (settled) { if (failed) report(onLateError, error); return; }
    settled = true;
    signal.removeEventListener('abort', onAbort);
    if (failed) rejectLogical(error); else resolveLogical(value);
  };
  const onAbort = () => complete(undefined, undefined, false);
  signal.addEventListener('abort', onAbort, { once: true });
  let executionPromise: Promise<T>;
  try { executionPromise = Promise.resolve(execute()); }
  catch (error) { executionPromise = Promise.reject(error); }
  // Both handlers return normally, so this observer cannot create an unhandled rejection.
  void executionPromise.then(value => complete(undefined, value, false), error => complete(error, undefined, true));
  return { logicalPromise, executionPromise };
}

export function createGatedDispatch<Action>(isLive: () => boolean, dispatch: Dispatch<Action>, onDrop?: (() => void) | undefined): Dispatch<Action> {
  return action => { if (isLive()) dispatch(action); else report(onDrop, undefined); };
}

export type ResourceKind = 'execution' | 'subscription' | 'timer';
export interface ResourceRecordOptions {
  kind?: ResourceKind | undefined;
  /** Already-qualified identity from the caller's composition layer, not a local slot name. */
  id?: string | undefined;
  groups?: readonly string[] | undefined;
  ownerToken?: unknown | undefined;
  /** Cancellation only: normal completion does not abort this signal. */
  controller?: AbortController | undefined;
  cleanup?: CleanupFunction | undefined;
  description?: string | undefined;
}
export type ResourceOutcome = 'pending' | 'completed' | 'cancelled' | 'failed';
export interface ResourceRecord {
  readonly kind: ResourceKind | undefined;
  readonly uid: symbol;
  readonly id: string | undefined;
  readonly groups: readonly string[];
  readonly ownerToken: unknown;
  readonly controller: AbortController | undefined;
  readonly description: string | undefined;
  readonly live: boolean;
  readonly outcome: ResourceOutcome;
  readonly failure: unknown;
  /** Always initialized before publication. Notification; execution failure is in outcome/failure. */
  readonly logicalSettlement: Promise<void>;
  /** Retirement-batch teardown checkpoint. Later addCleanup calls are observed through the scope. */
  readonly cleanupSettlement: Promise<void>;
  /** Add an exactly-once disposer. On a retired record it is invoked immediately. */
  addCleanup(cleanup: CleanupFunction): void;
  dispose(): void;
}
export interface SubscriptionRegistrationOptions<Action> extends Omit<ResourceRecordOptions, 'cleanup'> {
  cleanup?: undefined;
  setup: (dispatch: Dispatch<Action>) => CleanupFunction | void;
  dispatch: Dispatch<Action>;
  onDroppedDispatch?: ((reason: ResourceOutcome | 'scope-disposed') => void) | undefined;
}
export interface CancellableExecutionOptions<Action> extends Omit<ResourceRecordOptions, 'controller'> {
  controller?: undefined;
  execute: (dispatch: Dispatch<Action>, signal: AbortSignal) => void | Promise<void>;
  dispatch: Dispatch<Action>;
  onLateError?: ErrorReporter | undefined;
  onDroppedDispatch?: ((reason: ResourceOutcome | 'scope-disposed') => void) | undefined;
}
export interface TimerRegistrationOptions extends Omit<ResourceRecordOptions, 'cleanup'> {
  cleanup?: undefined;
  clear: () => void;
}
export interface ResourceScopeOptions {
  /** Called after registry publication and before setup or predecessor cleanup. */
  onRegistered?: ((record: ResourceRecord) => void) | undefined;
  onCleanupError?: ErrorReporter | undefined;
  onExecutionError?: ErrorReporter | undefined;
}

/** A registry for already-qualified resources. Origin construction and scheduling are separate adapters. */
export class ResourceScope {
  private readonly records = new Set<ResourceRecord>();
  private readonly byId = new Map<string, ResourceRecord>();
  private readonly finish = new WeakMap<ResourceRecord, (outcome: 'completed' | 'failed', error?: unknown) => void>();
  private readonly pendingCleanups = new Set<Promise<void>>();
  private disposed = false;
  private readonly onRegistered: (record: ResourceRecord) => void;
  readonly onCleanupError: ErrorReporter;
  readonly onExecutionError: ErrorReporter;
  constructor(options?: ResourceScopeOptions) {
    const cleanupSink = options?.onCleanupError ?? (error => console.error('[Composable Svelte] Resource cleanup error:', error));
    const executionSink = options?.onExecutionError ?? (error => console.error('[Composable Svelte] Resource execution error:', error));
    this.onCleanupError = error => report(cleanupSink, error);
    this.onExecutionError = error => report(executionSink, error);
    this.onRegistered = record => {
      try { void Promise.resolve(options?.onRegistered?.(record)).catch(this.onExecutionError); }
      catch (error) { this.onExecutionError(error); }
    };
  }
  get isDisposed(): boolean { return this.disposed; }
  get size(): number { return this.records.size; }
  get pendingCleanupCount(): number { return this.pendingCleanups.size; }
  /** Observe outstanding teardown, including tasks added while it settles. Callers such as TestStore.finish must supply their own assertion deadline; this never advances business time. */
  async whenCleanupsSettled(): Promise<void> {
    while (this.pendingCleanups.size) await Promise.all([...this.pendingCleanups]);
  }
  getRecord(id: string): ResourceRecord | undefined { return this.byId.get(id); }
  has(record: ResourceRecord): boolean { return this.records.has(record); }

  createRecord(options: ResourceRecordOptions): ResourceRecord {
    // The registration owns this controller even if the caller reuses its options.
    const controller = options.controller;
    let live = true;
    let outcome: ResourceOutcome = 'pending';
    let failure: unknown;
    const cleanups = new Set<CleanupFunction>();
    if (options.cleanup) cleanups.add(options.cleanup);
    const installed = new WeakSet(cleanups);
    const cleanupTasks = new Set<Promise<void>>();
    let resolveLogical!: () => void;
    let resolveCleanup!: () => void;
    const logicalSettlement = new Promise<void>(resolve => { resolveLogical = resolve; });
    const cleanupSettlement = new Promise<void>(resolve => { resolveCleanup = resolve; });
    const runCleanup = (cleanup: CleanupFunction): void => {
      let done!: () => void;
      const work = new Promise<void>(resolve => { done = resolve; });
      cleanupTasks.add(work); this.pendingCleanups.add(work);
      void Promise.resolve(safeCleanup(cleanup, this.onCleanupError)).then(done);
      void work.then(() => { cleanupTasks.delete(work); this.pendingCleanups.delete(work); });
    };
    const previous = options.id === undefined ? undefined : this.byId.get(options.id);
    const retire = (nextOutcome: Exclude<ResourceOutcome, 'pending'>, error?: unknown): void => {
      if (!live) return;
      live = false; outcome = nextOutcome; failure = error;
      this.records.delete(record);
      if (record.id !== undefined && this.byId.get(record.id) === record) this.byId.delete(record.id);
      this.finish.delete(record);
      controller?.signal.removeEventListener('abort', onAbort);
      // Invalidate capability before abort listeners or user teardown run.
      if (nextOutcome === 'cancelled') {
        try { controller?.abort(); } catch (abortError) { this.onCleanupError(abortError); }
      }
      for (const cleanup of cleanups) runCleanup(cleanup);
      cleanups.clear();
      resolveLogical();
      // The checkpoint includes a subscription cleanup returned after self-cancellation.
      void Promise.resolve().then(async () => {
        while (cleanupTasks.size) await Promise.all([...cleanupTasks]);
        resolveCleanup();
      });
    };
    const onAbort = () => record.dispose();
    const record: ResourceRecord = {
      uid: Symbol(options.description ?? options.id ?? 'resource'),
      id: options.id, groups: Object.freeze([...(options.groups ?? [])]), ownerToken: options.ownerToken,
      controller, description: options.description, kind: options.kind,
      get live() { return live; }, get outcome() { return outcome; }, get failure() { return failure; },
      logicalSettlement, cleanupSettlement,
      addCleanup(cleanup) {
        if (installed.has(cleanup)) return;
        installed.add(cleanup);
        if (live) cleanups.add(cleanup); else runCleanup(cleanup);
      },
      dispose: () => retire('cancelled')
    };
    // Successor publication precedes predecessor teardown so reentrant replacement sees it.
    if (this.disposed || controller?.signal.aborted) { record.dispose(); return record; }
    controller?.signal.addEventListener('abort', onAbort, { once: true });
    this.records.add(record);
    this.finish.set(record, (nextOutcome, error) => retire(nextOutcome, error));
    if (record.id !== undefined) this.byId.set(record.id, record);
    this.onRegistered(record);
    previous?.dispose();
    return record;
  }

  /** Normal completion retires ownership without aborting an execution signal. */
  complete(record: ResourceRecord): void { this.finish.get(record)?.('completed'); }

  cancel(id: string): void { this.byId.get(id)?.dispose(); }
  cancelGroup(group: string): void {
    for (const record of [...this.records]) if (record.groups.includes(group)) record.dispose();
  }
  cancelOwner(token: unknown): void {
    if (token === undefined || token === null) return;
    for (const record of [...this.records]) if (record.ownerToken === token) record.dispose();
  }
  /** FIFO registration order is intentional; dependent resources should register one composed disposer. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const record of [...this.records]) record.dispose();
  }

  registerSubscription<Action>(options: SubscriptionRegistrationOptions<Action>): ResourceRecord {
    const record = this.createRecord(options);
    if (!record.live) return record;
    const dispatch = createGatedDispatch(() => record.live && !this.disposed, options.dispatch, () => options.onDroppedDispatch?.(this.disposed ? 'scope-disposed' : record.outcome));
    try {
      const cleanup = options.setup(dispatch);
      if (cleanup && typeof (cleanup as unknown as { then?: unknown }).then === 'function') {
        // JavaScript callers can violate the synchronous setup contract. Retire
        // immediately, but observe and dispose any asynchronously acquired resource.
        const pending = Promise.resolve(cleanup).then(value => {
          if (typeof value === 'function') record.addCleanup(value);
        }, this.onExecutionError);
        this.pendingCleanups.add(pending);
        void pending.then(() => this.pendingCleanups.delete(pending));
        throw new TypeError('Subscription setup must return a cleanup function synchronously; received a Promise');
      }
      if (typeof cleanup === 'function') record.addCleanup(cleanup);
    } catch (error) {
      this.finish.get(record)?.('failed', error);
      this.onExecutionError(error);
    }
    return record;
  }

  runCancellable<Action>(options: CancellableExecutionOptions<Action>): ResourceRecord {
    const controller = new AbortController();
    const record = this.createRecord({ ...options, controller });
    if (!record.live) return record;
    const dispatch = createGatedDispatch(() => record.live && !controller.signal.aborted && !this.disposed, options.dispatch, () => options.onDroppedDispatch?.(this.disposed ? 'scope-disposed' : record.outcome));
    const reportLateError = (error: unknown): void => {
      // Only an abort of this execution makes AbortError expected. An unrelated
      // AbortError (or a genuine failure arriving after cancellation) remains visible.
      if (controller.signal.aborted && (error as { name?: unknown } | null)?.name === 'AbortError') return;
      report(options.onLateError ?? this.onExecutionError, error);
    };
    const result = settleAbandonedWork(() => options.execute(dispatch, controller.signal), controller.signal, reportLateError);
    // Logical cancellation retires immediately; abandoned execution remains observed by the primitive.
    void result.logicalPromise.then(
      () => this.finish.get(record)?.('completed'),
      error => { this.finish.get(record)?.('failed', error); this.onExecutionError(error); }
    );
    return record;
  }

  registerTimer(options: TimerRegistrationOptions): ResourceRecord {
    return this.createRecord({ ...options, cleanup: options.clear });
  }
}
export function createResourceScope(options?: ResourceScopeOptions): ResourceScope { return new ResourceScope(options); }
