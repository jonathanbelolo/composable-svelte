import { registerManagedRoot } from './execution/store-access.js';
import { isOwnerLive } from './execution/identity.js';
/**
 * Store implementation for Composable Svelte.
 *
 * The Store is the runtime that manages state, processes actions, and executes effects.
 * Uses $state.raw() for reactive state tracking across compiled library boundaries.
 * Consumers can use either $derived(store.state) or $store (subscribe-based) patterns.
 */

import type {
  Store,
  StoreConfig,
  Dispatch,
  Selector,
  MiddlewareAPI,
  Effect,
  EffectExecutor
} from './types.js';
import { isServer } from './ssr/utils.js';
import { ProductionScheduler } from './execution/scheduler.js';
import { EffectRuntime } from './execution/runtime.js';
import { TurnQueue } from './execution/turn-queue.js';

const stateCommitObservers = new Set<() => void>();
/**
 * @internal Framework pipeline hook (fluid overlays C2): called synchronously after any store commits a changed state
 * and before Svelte renders it — the destructive render has not happened, so outgoing geometry still exists.
 * Refused actions (unchanged state) and throwing reducers commit nothing and notify nothing.
 */
export function onStateCommitted(observer: () => void): () => void {
  stateCommitObservers.add(observer);
  return () => { stateCommitObservers.delete(observer); };
}
function notifyStateCommitted(): void {
  for (const observer of stateCommitObservers) { try { observer(); } catch (error) { console.error('[Composable Svelte] State-commit observer error:', error); } }
}

/**
 * Create a Store for a feature.
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: { count: 0 },
 *   reducer: counterReducer,
 *   dependencies: { apiClient }
 * });
 * ```
 */
export function createStore<State, Action, Dependencies = any>(
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> {
  if (config.execution?.mode !== 'managed' && config.execution &&
      (config.execution.scheduler !== undefined || config.execution.slots !== undefined || config.execution._reduce !== undefined || config.execution._initial !== undefined || config.execution._initialization !== undefined || config.execution.rootThrottleCapacity !== undefined)) {
    throw new TypeError('Managed execution options require execution.mode: managed');
  }
  if (config.execution?.mode === 'managed') {
    return createManagedStore(config);
  }

  // $state.raw tracks reassignment only (no deep proxy) — ideal for immutable reducer state
  let currentState = config.initialState;
  let state = $state.raw(config.initialState);

  // Action history for debugging/time-travel
  const actionHistory: Action[] = [];

  // In-flight effects for cancellation
  const inFlightEffects = new Map<string, AbortController>();

  // Subscription cleanup functions
  const subscriptionCleanups = new Map<string, () => void | Promise<void>>();

  // Debounce timers
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Throttle state
  const throttleState = new Map<string, { lastRun: number; timeout?: ReturnType<typeof setTimeout> }>();

  // Subscribers
  const subscribers = new Set<(state: State) => void>();

  // Action subscribers (for Destination.on() in Phase 3)
  const actionSubscribers = new Set<(action: Action, state: State) => void>();

  // Everything destroy() must stop that the maps above did not hold: the
  // AfterDelay timers, the executors in flight, and dispatch itself. The
  // first form left all three live, so a delayed action reduced state and
  // re-armed timers in a destroyed store (AUDIT-2026-09-03-FINDINGS N7).
  const delayTimers = new Set<ReturnType<typeof setTimeout>>();
  const lifetime = new AbortController();
  let destroyed = false;

  // Cancellation groups (types.ts `EffectGroups`). Every disposer leaves its
  // groups first, then acts, so a later cancel by id or by another group
  // finds nothing to do; a member that settles leaves on its own.
  type Disposer = () => void;
  const groupMembers = new Map<string, Set<Disposer>>();
  /** What a timer leaves when it is cleared, wherever that happens. */
  const timerLeaves = new Map<ReturnType<typeof setTimeout>, () => void>();

  function joinGroups(groups: readonly string[] | undefined, dispose: Disposer): () => void {
    if (!groups || groups.length === 0) return () => {};
    for (const group of groups) {
      let members = groupMembers.get(group);
      if (!members) {
        members = new Set();
        groupMembers.set(group, members);
      }
      members.add(dispose);
    }
    return () => {
      for (const group of groups) {
        const members = groupMembers.get(group);
        if (!members) continue;
        members.delete(dispose);
        if (members.size === 0) groupMembers.delete(group);
      }
    };
  }

  function cancelGroup(group: string): void {
    const members = groupMembers.get(group);
    if (!members) return;
    groupMembers.delete(group);
    for (const dispose of [...members]) dispose();
  }

  /** Clear a timer and let it leave its groups. */
  function clearTimer(timer: ReturnType<typeof setTimeout>): void {
    clearTimeout(timer);
    timerLeaves.get(timer)?.();
    timerLeaves.delete(timer);
  }

  /**
   * Run an executor: with groups, under its own controller — the group's
   * disposer aborts it and its dispatches are gated — and without, under the
   * store's lifetime signal, as before.
   */
  function runExecutor(groups: readonly string[] | undefined, execute: EffectExecutor<Action>): void {
    if (!groups || groups.length === 0) {
      guarded(() => execute(dispatch, lifetime.signal));
      return;
    }
    const controller = new AbortController();
    const gatedDispatch: Dispatch<Action> = action => {
      if (controller.signal.aborted) return;
      dispatch(action);
    };
    let leave = (): void => {};
    leave = joinGroups(groups, () => {
      leave();
      controller.abort();
    });
    let running: Promise<void>;
    try {
      running = Promise.resolve(execute(gatedDispatch, controller.signal));
    } catch (error) {
      running = Promise.reject(error);
    }
    running
      .catch(error => {
        if ((error as { name?: string } | null)?.name !== 'AbortError') {
          console.error('[Composable Svelte] Effect error:', error);
        }
      })
      .finally(() => leave());
  }

  /** Arm a timer that belongs to groups: cancelling one disarms it. */
  function armTimer(
    groups: readonly string[] | undefined,
    ms: number,
    fire: () => void,
    onClear: (timer: ReturnType<typeof setTimeout>) => void
  ): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      timerLeaves.get(timer)?.();
      timerLeaves.delete(timer);
      fire();
    }, ms);
    if (groups && groups.length > 0) {
      let leave = (): void => {};
      leave = joinGroups(groups, () => {
        leave();
        clearTimeout(timer);
        timerLeaves.delete(timer);
        onClear(timer);
      });
      timerLeaves.set(timer, leave);
    }
    return timer;
  }
  /** One warning per destroyed store; a later dispatch is silently dropped. */
  let warnedAfterDestroy = false;

  /**
   * Core dispatch logic (before middleware).
   */
  function dispatchCore(action: Action): void {
    if (destroyed) {
      if (!warnedAfterDestroy) {
        warnedAfterDestroy = true;
        console.warn(
          '[Composable Svelte] dispatch after destroy ignored:',
          (action as { type?: unknown } | null)?.type
        );
      }
      return;
    }

    // Record action (with optional size limit)
    if (config.maxHistorySize === undefined || config.maxHistorySize > 0) {
      actionHistory.push(action);

      // Trim history if it exceeds max size
      if (config.maxHistorySize !== undefined && actionHistory.length > config.maxHistorySize) {
        actionHistory.shift(); // Remove oldest action
      }
    }

    // Run reducer (pure function)
    const [newState, effect] = config.reducer(
      currentState,
      action,
      config.dependencies as Dependencies
    );

    // Update state (Svelte reactivity kicks in)
    const stateChanged = !Object.is(currentState, newState);
    if (stateChanged) {
      // Teardown effects can read an earlier Svelte reactive snapshot.
      // Reduction and imperative observers always use the latest committed value.
      currentState = newState;
      state = newState;

      // Framework pre-render checkpoint: the committed state is known, the DOM still shows the previous state.
      notifyStateCommitted();

      // Notify subscribers
      subscribers.forEach(listener => {
        try {
          listener(currentState);
        } catch (error) {
          console.error('[Composable Svelte] Subscriber error:', error);
        }
      });
    }

    // Notify action subscribers
    actionSubscribers.forEach(listener => {
      try {
        listener(action, currentState);
      } catch (error) {
        console.error('[Composable Svelte] Action subscriber error:', error);
      }
    });

    // Execute effect asynchronously
    if (effect._tag !== 'None') {
      executeEffect(effect);
    }
  }

  // TODO: Middleware support deferred to Phase 5
  const dispatch: Dispatch<Action> = dispatchCore;

  /**
   * Execute an effect based on its type.
   */
  /**
   * Invoke a subscription cleanup without letting it take anything else down.
   *
   * Three failures this absorbs, all of which only became reachable once
   * cleanups started actually running:
   *
   * - a setup that returned nothing, which the documented consumer shape for a
   *   WebSocket dependency does. Calling `undefined` threw a *synchronous*
   *   TypeError the surrounding `.catch` could not see, so `destroy()` threw and
   *   every later teardown step — the remaining cleanups, the subscription map,
   *   the debounce and throttle timers, the subscriber list — was skipped.
   * - a cleanup that throws synchronously, which escaped through `dispatch()`
   *   and out of the caller's event handler, leaving the entry installed to
   *   throw again at destroy.
   * - a cleanup that rejects, which was already handled.
   */
  function runCleanup(cleanup: (() => void | Promise<void>) | undefined): void {
    if (typeof cleanup !== 'function') return;
    try {
      Promise.resolve(cleanup()).catch(error => {
        console.error('[Composable Svelte] Subscription cleanup error:', error);
      });
    } catch (error) {
      console.error('[Composable Svelte] Subscription cleanup error:', error);
    }
  }

  /**
   * Run an effect body without letting a synchronous throw out.
   *
   * `Promise.resolve(execute()).catch(…)` handles a rejection but not a body
   * that throws before returning: that escaped `dispatch()` into the caller's
   * event handler, skipped the rest of a `Batch`, and inside a debounce,
   * throttle or delay timer was an uncaught exception — while the same
   * executor mapped through `scope()` was caught, so behaviour depended on
   * composition depth (AUDIT-2026-09-03-FINDINGS N3).
   */
  function guarded(run: () => void | Promise<void>): void {
    try {
      Promise.resolve(run()).catch(error => {
        console.error('[Composable Svelte] Effect error:', error);
      });
    } catch (error) {
      console.error('[Composable Svelte] Effect error:', error);
    }
  }

  function executeEffect(effect: Effect<Action>): void {
    if (destroyed) return;
    // Check if we should defer effects (SSR)
    const deferEffects = config.ssr?.deferEffects ?? true; // Default to true
    if (isServer() && deferEffects) {
      // Skip effect execution on server
      return;
    }

    switch (effect._tag) {
      case 'None':
        break;

      case 'Run':
        // The store's lifetime signal — aborted by destroy() — for an executor
        // that awaits something and wants to stop; its own when it belongs to
        // a group.
        runExecutor(effect.groups, effect.execute);
        break;

      case 'CancelGroup':
        cancelGroup(effect.group);
        break;

      case 'Batch':
        effect.effects.forEach(executeEffect);
        break;

      case 'Cancellable': {
        // Detach every predecessor before invoking abort handlers or cleanup.
        // Reentrant work then owns new entries and must not be cleared by this
        // older operation after its user-code boundary.
        const existing = inFlightEffects.get(effect.id);
        const previousCleanup = subscriptionCleanups.get(effect.id);
        const previousTimer = debounceTimers.get(effect.id);
        const previousThrottle = throttleState.get(effect.id);
        inFlightEffects.delete(effect.id);
        subscriptionCleanups.delete(effect.id);
        debounceTimers.delete(effect.id);
        throttleState.delete(effect.id);
        if (previousTimer !== undefined) clearTimer(previousTimer);
        if (previousThrottle?.timeout !== undefined) clearTimer(previousThrottle.timeout);

        // Enroll a replacement before user code, as Subscription does. A newer
        // reentrant cancellable can retire it before its executor starts.
        const controller = effect.cancelOnly ? undefined : new AbortController();
        let leave = (): void => {};
        const retire = () => {
          leave();
          if (controller && inFlightEffects.get(effect.id) === controller) inFlightEffects.delete(effect.id);
        };
        if (controller) {
          inFlightEffects.set(effect.id, controller);
          leave = joinGroups(effect.groups, () => controller.abort());
          controller.signal.addEventListener('abort', retire, { once: true });
        }
        existing?.abort();
        runCleanup(previousCleanup);
        if (!controller) break;
        if (destroyed || controller.signal.aborted || inFlightEffects.get(effect.id) !== controller) {
          controller.abort();
          break;
        }

        // The signal is handed to the executor so it can cooperate — pass it to
        // `fetch`, check it around an await. It used to be created, stored and
        // aborted while never reaching anyone, so `Effect.cancel` on a cancellable
        // was pure bookkeeping: the work ran to completion and still dispatched.
        //
        // Dispatch is gated on it as well, so cancellation means something even
        // for an executor that ignores the signal entirely. A cancelled effect's
        // actions are no longer wanted, and that must not depend on the author
        // having opted in.
        const guardedDispatch: Dispatch<Action> = action => {
          if (controller.signal.aborted) return;
          dispatch(action);
        };

        let running: Promise<void>;
        try {
          running = Promise.resolve(effect.execute(guardedDispatch, controller.signal));
        } catch (error) {
          running = Promise.reject(error);
        }
        running
          .catch(error => {
            // Optional chaining because a rejection is not required to be an
            // object: `throw null` or a bare `Promise.reject()` used to throw a
            // second TypeError *inside* this handler, turning a handled failure
            // into an unhandled rejection.
            if ((error as { name?: string } | null)?.name !== 'AbortError') {
              console.error('[Composable Svelte] Effect error:', error);
            }
          })
          .finally(() => {
            controller.signal.removeEventListener('abort', retire);
            retire();
          });
        break;
      }

      case 'Debounced': {
        // Clear existing timer
        const existingTimer = debounceTimers.get(effect.id);
        if (existingTimer !== undefined) {
          clearTimer(existingTimer);
        }

        // Set new timer. The executor gets the store's lifetime signal, as a
        // Run or an AfterDelay does (R1-REVIEW 1.9) — or its own, in a group.
        const timer = armTimer(
          effect.groups,
          effect.ms,
          () => {
            debounceTimers.delete(effect.id);
            runExecutor(effect.groups, effect.execute);
          },
          (cleared) => {
            if (debounceTimers.get(effect.id) === cleared) debounceTimers.delete(effect.id);
          }
        );

        debounceTimers.set(effect.id, timer);
        break;
      }

      case 'Throttled': {
        const now = Date.now();
        const throttle = throttleState.get(effect.id);

        if (!throttle || now - throttle.lastRun >= effect.ms) {
          // Execute immediately, clear any pending timeout
          if (throttle?.timeout) {
            clearTimer(throttle.timeout);
          }
          throttleState.set(effect.id, { lastRun: now });
          runExecutor(effect.groups, effect.execute);
        } else if (!throttle.timeout) {
          // Schedule for later
          const delay = effect.ms - (now - throttle.lastRun);
          const timeout = armTimer(
            effect.groups,
            delay,
            () => {
              // Clear timeout field by replacing entire object
              throttleState.set(effect.id, { lastRun: Date.now() });
              runExecutor(effect.groups, effect.execute);
            },
            (cleared) => {
              const current = throttleState.get(effect.id);
              if (current?.timeout === cleared) throttleState.set(effect.id, { lastRun: current.lastRun });
            }
          );

          throttleState.set(effect.id, { lastRun: throttle.lastRun, timeout });
        }
        // else: Already throttled with pending timeout, ignore this call
        break;
      }

      case 'AfterDelay': {
        const timer = armTimer(
          effect.groups,
          effect.ms,
          () => {
            delayTimers.delete(timer);
            runExecutor(effect.groups, effect.execute);
          },
          (cleared) => delayTimers.delete(cleared)
        );
        delayTimers.add(timer);
        break;
      }

      case 'FireAndForget':
        guarded(() => effect.execute());
        break;

      case 'Subscription': {
        // Enroll before setup: setup and previous cleanup may synchronously
        // cancel, destroy, or replace this subscription. A retired callback is
        // inert even if its socket closes on a later task after reconnect.
        const previous = subscriptionCleanups.get(effect.id);
        let live = true;
        // Enrollment precedes user code; the initial leave is a safe no-op
        // until joinGroups returns the real membership disposer.
        let leave = (): void => {};
        let cleanup: (() => void | Promise<void>) | undefined;
        const teardown = (): void | Promise<void> => {
          if (!live) return;
          live = false;
          leave();
          if (subscriptionCleanups.get(effect.id) === teardown) subscriptionCleanups.delete(effect.id);
          const dispose = cleanup;
          cleanup = undefined;
          if (typeof dispose === 'function') return dispose();
        };
        // Enroll before invoking either old cleanup or new setup: both may dispatch.
        subscriptionCleanups.set(effect.id, teardown);
        leave = joinGroups(effect.groups, () => runCleanup(teardown));
        runCleanup(previous);
        // Identity is a defensive ownership check alongside the liveness gate.
        if (!live || destroyed || subscriptionCleanups.get(effect.id) !== teardown) {
          runCleanup(teardown);
          break;
        }
        const gatedDispatch: Dispatch<Action> = action => {
          if (live && !destroyed) dispatch(action);
        };
        try {
          const returnedCleanup = effect.setup(gatedDispatch);
          if (returnedCleanup && typeof (returnedCleanup as unknown as { then?: unknown }).then === 'function') {
            runCleanup(teardown);
            Promise.resolve(returnedCleanup).then(value => {
              if (typeof value === 'function') runCleanup(value);
            }, () => {});
            throw new TypeError(`Subscription '${effect.id}' setup must return a cleanup function synchronously; received a Promise`);
          }
          if (!live) runCleanup(returnedCleanup);
          else cleanup = returnedCleanup;
        } catch (error) {
          runCleanup(teardown);
          console.error('[Composable Svelte] Subscription setup error:', error);
        }
        break;
      }

      default:
        // Exhaustiveness check
        const _exhaustive: never = effect;
        throw new Error(`Unhandled effect type: ${(_exhaustive as any)._tag}`);
    }
  }

  /**
   * Select a derived value from state (non-reactive).
   */
  function select<T>(selector: Selector<State, T>): T {
    return selector(currentState);
  }

  /**
   * Subscribe to state changes.
   */
  function subscribe(listener: (state: State) => void): () => void {
    subscribers.add(listener);

    // Immediately call with current state
    try {
      listener(currentState);
    } catch (error) {
      console.error('[Composable Svelte] Subscriber error:', error);
    }

    return () => {
      subscribers.delete(listener);
    };
  }

  /**
   * Subscribe to action dispatches (for Destination.on() in Phase 3).
   */
  function subscribeToActions(listener: (action: Action, state: State) => void): () => void {
    actionSubscribers.add(listener);
    return () => {
      actionSubscribers.delete(listener);
    };
  }

  /**
   * Clean up resources.
   */
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    lifetime.abort();

    // Every grouped effect: its own controller, timer or subscription.
    for (const group of [...groupMembers.keys()]) cancelGroup(group);

    // Cancel all in-flight effects
    inFlightEffects.forEach(controller => controller.abort());
    inFlightEffects.clear();

    // Pending delays never fire
    delayTimers.forEach(timer => clearTimer(timer));
    delayTimers.clear();

    // Call all subscription cleanups
    subscriptionCleanups.forEach(cleanup => runCleanup(cleanup));
    subscriptionCleanups.clear();

    // Clear all timers
    debounceTimers.forEach(timer => clearTimer(timer));
    debounceTimers.clear();

    throttleState.forEach(t => {
      if (t.timeout) clearTimer(t.timeout);
    });
    throttleState.clear();

    // Clear subscribers
    subscribers.clear();
    actionSubscribers.clear();
  }

  return {
    get state() {
      return state;
    },
    dispatch,
    select,
    subscribe,
    subscribeToActions,
    get history() {
      return actionHistory;
    },
    destroy
  };
}

function createManagedStore<State, Action, Dependencies = any>(
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> {
  const execution = config.execution ?? {};
  const scheduler = execution.scheduler ?? new ProductionScheduler();


  let warnedAfterDestroy = false;
  let turnQueue: TurnQueue<State, Action, Dependencies>;
  let reactiveState = $state.raw(config.initialState);
  let reactiveLifecycle = $state.raw<ReturnType<TurnQueue<State, Action, Dependencies>['getLifecycle']>>();
  let reactiveLive = $state(true);

  const runtime = new EffectRuntime<Action>({
    scheduler,
    rootThrottleCapacity: execution.rootThrottleCapacity,
    dispatch: (action, origin) => {
      try { turnQueue.enqueue({ action, origin, source: 'effect' }); }
      catch (error) { runtime.reportFailure(error, 'reduction'); }
    },
    ssr: config.ssr,
    isServer,
    onError: (error, context) => console.error(`[Composable Svelte] Runtime error (${context}):`, error)
  });

  turnQueue = new TurnQueue<State, Action, Dependencies>({
    initialState: config.initialState,
    reducer: config.reducer,
    dependencies: config.dependencies as Dependencies,
    execution: config.execution,
    maxHistorySize: config.maxHistorySize,
    runtime,
    onStateCommitted: newState => {
      const changed = !Object.is(reactiveState, newState);
      reactiveState = newState;
      reactiveLifecycle = turnQueue.getLifecycle();
      if (changed) notifyStateCommitted(); // framework pre-render checkpoint (managed stores; refused turns excluded)
    },
    onSubscriberError: error => console.error('[Composable Svelte] Subscriber error:', error)
  });

  const store: Store<State, Action> = {
    get state() {
      return reactiveState;
    },
    dispatch(action: Action) {
      if (runtime.isDisposed) {
        if (!warnedAfterDestroy) {
          warnedAfterDestroy = true;
          console.warn('[Composable Svelte] dispatch after destroy ignored:', (action as { type?: unknown } | null)?.type);
        }
        return;
      }
      turnQueue.dispatch(action);
    },
    select<T>(selector: Selector<State, T>): T {
      return selector(reactiveState);
    },
    subscribe(listener: (state: State) => void) {
      return turnQueue.subscribe(listener);
    },
    subscribeToActions(listener: (action: Action, state: State) => void) {
      return turnQueue.subscribeToActions(listener);
    },
    get history() {
      return turnQueue.history;
    },
    destroy() {
      try { turnQueue.destroy(); } finally { reactiveLive = false; }
    },
    get _runtime() {
      return runtime;
    }
  };
  reactiveLifecycle = turnQueue.getLifecycle();
  registerManagedRoot(store, {
    execution,
    scheduler,
    registerResource: options => runtime.resourceScope.createRecord(options),
    activateInitialization: claim => turnQueue.activateInitialization(claim),
    releaseInitialization: claim => turnQueue.releaseInitialization(claim),
    isLive: () => reactiveLive && !turnQueue.isDestroyed && !runtime.isDisposed,
    lifecycle: () => reactiveLifecycle!,
    enqueue: (action, origin) => turnQueue.enqueue({ action, origin, source: 'external' }),
    enqueueObserved: (action, origin, observer) => turnQueue.enqueueObserved(action, origin, observer),
        enqueueInspection: (resolve, origin, observer) => turnQueue.enqueueInspection(resolve, origin, observer),
    subscribe(origin, listener) {
      const report = (error: unknown) => console.error('[Composable Svelte] Subscriber error:', error);
      const notify = () => {
        try { void Promise.resolve(listener()).catch(report); }
        catch (error) { report(error); }
      };
      if (turnQueue.isDestroyed || runtime.isDisposed || !isOwnerLive(turnQueue.getLifecycle(), origin)) {
        notify();
        return () => {};
      }
      const record = runtime.resourceScope.createRecord({
        ownerToken: origin, kind: 'subscription', description: 'ChildView'
      });
      let manuallyStopped = false;
      const stop = store.subscribe(() => { if (record.live) notify(); });
      record.addCleanup(() => {
        stop();
        // Owner invalidation has one terminal notification; explicit unsubscribe
        // is silent, matching the ordinary subscription contract.
        if (!manuallyStopped) notify();
      });
      return () => { manuallyStopped = true; record.dispose(); };
    },
    // Backs observeChildActions. Pre-attachment is a drop: nothing is
    // buffered for an owner with no listener. Retirement and unsubscribe are silent.
    subscribeActions(origin, listener) {
      if (turnQueue.isDestroyed || runtime.isDisposed || !isOwnerLive(turnQueue.getLifecycle(), origin))
        return () => {};
      const record = runtime.resourceScope.createRecord({
        ownerToken: origin, kind: 'subscription', description: 'ChildView actions'
      });
      const stop = turnQueue.subscribeOwnerDeliveries((owner, action) => {
        if (owner === origin && record.live) listener(action);
      });
      record.addCleanup(stop);
      return () => record.dispose();
    }
  });
  return store;
}
