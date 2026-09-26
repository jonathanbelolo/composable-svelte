import { describe, it, expect, vi } from 'vitest';
import {
  ResourceScope,
  safeCleanup,
  safeCleanupAll,
  settleAbandonedWork
} from '../src/lib/execution/resources.js';
import {
  DeterministicScheduler,
  ProductionScheduler,
  createDeterministicScheduler
} from '../src/lib/execution/scheduler.js';
import { createStore } from '../src/lib/store.svelte.js';
import { createTestStore } from '../src/lib/test/test-store.js';
import type { Reducer } from '../src/lib/types.js';
import { Effect } from '../src/lib/effect.js';

describe('execution/resources: ResourceScope & Idempotent Cleanup Lifecycle', () => {
  it('registers resource record before invoking setup [semantic trace + mutation control]', () => {
    const scope = new ResourceScope();
    const trace: string[] = [];

    scope.registerSubscription({
      id: 'sub-alpha',
      setup() {
        trace.push('setup:start');
        const registered = scope.getRecord('sub-alpha');
        if (registered) {
          trace.push(`registered-during-setup:${String(registered.live)}`);
        } else {
          trace.push('missing-during-setup');
        }
        return () => {
          trace.push('cleanup');
        };
      },
      dispatch() {}
    });

    trace.push('setup:end');

    expect(trace).toEqual([
      'setup:start',
      'registered-during-setup:true',
      'setup:end'
    ]);
    expect(scope.getRecord('sub-alpha')).toBeDefined();
  });

  it('handles synchronous self-abort during setup, gates dispatch, and runs returned cleanup once immediately [semantic trace]', () => {
    const scope = new ResourceScope();
    const trace: string[] = [];
    const captured: { dispatch?: (action: { type: string }) => void } = {};

    const record = scope.registerSubscription<{ type: string }>({
      id: 'self-aborting-sub',
      setup(dispatch) {
        trace.push('setup:start');
        captured.dispatch = dispatch;

        trace.push('self-abort');
        scope.cancel('self-aborting-sub');

        dispatch({ type: 'should-be-gated' });

        trace.push('setup:end');
        return () => {
          trace.push('late-cleanup-run');
        };
      },
      dispatch(action) {
        trace.push(`dispatched:${action.type}`);
      }
    });

    expect(trace).toEqual([
      'setup:start',
      'self-abort',
      'setup:end',
      'late-cleanup-run'
    ]);
    expect(record.live).toBe(false);

    captured.dispatch?.({ type: 'later-attempt' });
    expect(trace).not.toContain('dispatched:should-be-gated');
    expect(trace).not.toContain('dispatched:later-attempt');

    record.dispose();
    expect(trace.filter((t) => t === 'late-cleanup-run')).toHaveLength(1);
  });

  it('continues after throwing cleanup without halting other member disposers [mutation control]', () => {
    const cleanupErrors: unknown[] = [];
    const scope = new ResourceScope({
      onCleanupError(err) {
        cleanupErrors.push(err);
      }
    });
    const trace: string[] = [];

    scope.createRecord({
      id: 'res-1',
      groups: ['group-alpha'],
      cleanup() {
        trace.push('cleanup:1');
      }
    });

    scope.createRecord({
      id: 'res-2',
      groups: ['group-alpha'],
      cleanup() {
        trace.push('cleanup:2:throw');
        throw new Error('Explosion in res-2 cleanup');
      }
    });

    scope.createRecord({
      id: 'res-3',
      groups: ['group-alpha'],
      cleanup() {
        trace.push('cleanup:3');
      }
    });

    scope.cancelGroup('group-alpha');

    expect(trace).toEqual(['cleanup:1', 'cleanup:2:throw', 'cleanup:3']);
    expect(cleanupErrors).toHaveLength(1);
    expect((cleanupErrors[0] as Error).message).toBe('Explosion in res-2 cleanup');
  });

  it('observes asynchronous cleanup rejections without unhandled rejection [mutation control]', async () => {
    const cleanupErrors: unknown[] = [];
    const scope = new ResourceScope({
      onCleanupError(err) {
        cleanupErrors.push(err);
      }
    });

    const record = scope.createRecord({
      id: 'async-fail',
      cleanup() {
        return Promise.reject(new Error('Async cleanup failure'));
      }
    });

    record.dispose();
    await Promise.resolve();

    expect(cleanupErrors).toHaveLength(1);
    expect((cleanupErrors[0] as Error).message).toBe('Async cleanup failure');
  });

  it('supersedes existing id and ensures predecessor settlement does not clobber successor', () => {
    const scope = new ResourceScope();
    const trace: string[] = [];

    const sub1 = scope.registerSubscription({
      id: 'slot-1',
      setup() {
        trace.push('sub1:start');
        return () => {
          trace.push('sub1:cleanup');
        };
      },
      dispatch(a) {
        trace.push(`sub1:dispatch:${JSON.stringify(a)}`);
      }
    });

    expect(sub1.live).toBe(true);

    const sub2 = scope.registerSubscription({
      id: 'slot-1',
      setup() {
        trace.push('sub2:start');
        return () => {
          trace.push('sub2:cleanup');
        };
      },
      dispatch(a) {
        trace.push(`sub2:dispatch:${JSON.stringify(a)}`);
      }
    });

    expect(sub1.live).toBe(false);
    expect(sub2.live).toBe(true);
    expect(scope.getRecord('slot-1')).toBe(sub2);
    expect(trace).toEqual(['sub1:start', 'sub1:cleanup', 'sub2:start']);

    sub1.dispose();
    expect(scope.getRecord('slot-1')).toBe(sub2);
    expect(sub2.live).toBe(true);
  });
});

describe('execution/resources: settleAbandonedWork Primitive', () => {
  it('resolves logical settlement on normal completion', async () => {
    const controller = new AbortController();
    const { logicalPromise } = settleAbandonedWork(
      () => Promise.resolve(42),
      controller.signal
    );
    const result = await logicalPromise;
    expect(result).toBe(42);
  });

  it('rejects logical settlement on error when not aborted', async () => {
    const controller = new AbortController();
    const { logicalPromise } = settleAbandonedWork(
      () => Promise.reject(new Error('unaborted failure')),
      controller.signal
    );
    await expect(logicalPromise).rejects.toThrow('unaborted failure');
  });

  it('settles abandoned work immediately upon abort without waiting for hung promise', async () => {
    const controller = new AbortController();
    const lateErrors: unknown[] = [];
    const trace: string[] = [];

    let resolveHungPromise!: () => void;
    const hungPromise = new Promise<void>((resolve) => {
      resolveHungPromise = resolve;
    });

    const { logicalPromise } = settleAbandonedWork(
      () => {
        trace.push('execute:start');
        return hungPromise.then(() => {
          trace.push('execute:resolved');
        });
      },
      controller.signal,
      (err) => lateErrors.push(err)
    );

    expect(trace).toEqual(['execute:start']);

    controller.abort();
    trace.push('aborted');

    await logicalPromise;
    trace.push('logicalPromise:settled');

    expect(trace).toEqual(['execute:start', 'aborted', 'logicalPromise:settled']);

    resolveHungPromise();
    await Promise.resolve();
    expect(lateErrors).toHaveLength(0);
  });

  it('observes late rejection after abort without unhandled rejection', async () => {
    const controller = new AbortController();
    const lateErrors: unknown[] = [];

    let rejectHungPromise!: (err: Error) => void;
    const hungPromise = new Promise<void>((_, reject) => {
      rejectHungPromise = reject;
    });

    const { logicalPromise } = settleAbandonedWork(
      () => hungPromise,
      controller.signal,
      (err) => lateErrors.push(err)
    );

    controller.abort();
    await logicalPromise;

    rejectHungPromise(new Error('Late network failure'));
    await Promise.resolve();

    expect(lateErrors).toHaveLength(1);
    expect((lateErrors[0] as Error).message).toBe('Late network failure');
  });
});

describe('execution/scheduler: DeterministicScheduler Ordering & Phases', () => {
  it('schedules timers with due-time ordering and insertion-order ties', async () => {
    const scheduler = createDeterministicScheduler(100);
    const trace: string[] = [];

    scheduler.setTimer(30, () => trace.push(`t30@${scheduler.now()}`));
    scheduler.setTimer(10, () => trace.push(`t10-a@${scheduler.now()}`));
    scheduler.setTimer(10, () => trace.push(`t10-b@${scheduler.now()}`));
    scheduler.setTimer(20, () => trace.push(`t20@${scheduler.now()}`));

    await scheduler.advanceTime(30);

    expect(trace).toEqual([
      't10-a@110',
      't10-b@110',
      't20@120',
      't30@130'
    ]);
    expect(scheduler.now()).toBe(130);
  });

  it('separates frame phase from timer phase explicitly', async () => {
    const scheduler = createDeterministicScheduler(0);
    const trace: string[] = [];

    scheduler.setTimer(16, () => trace.push(`timer@${scheduler.now()}`));
    scheduler.requestFrame((time) => trace.push(`frame@${time}`));

    await scheduler.advanceTime(20);
    expect(trace).toEqual(['timer@16']);

    await scheduler.stepFrame();
    expect(trace).toEqual(['timer@16', 'frame@20']);
  });
});

describe('execution/scheduler: ProductionScheduler SSR Safety', () => {
  it('provides monotonic now() in the production environment', () => {
    const scheduler = new ProductionScheduler();
    const t1 = scheduler.now();
    const t2 = scheduler.now();
    expect(t2).toBeGreaterThanOrEqual(t1);
  });
});

describe('execution adapters: Production Store & TestStore boundary checks', () => {
  it('exercises production store adapter boundary with ResourceScope and gated dispatch', () => {
    type State = { messages: string[]; disconnected: boolean };
    type Action = { type: 'received'; msg: string } | { type: 'disconnect' };

    const scope = new ResourceScope();
    const external: { callback?: (msg: string) => void } = {};
    const trace: string[] = [];

    const reducer: Reducer<State, Action> = (state, action) => {
      switch (action.type) {
        case 'received':
          return [{ ...state, messages: [...state.messages, action.msg] }, Effect.none()];
        case 'disconnect':
          return [{ ...state, disconnected: true }, Effect.none()];
      }
    };

    const store = createStore<State, Action>({
      initialState: { messages: [], disconnected: false },
      reducer,
      ssr: { deferEffects: false }
    });

    scope.registerSubscription<Action>({
      id: 'ws-conn',
      setup(dispatch) {
        trace.push('ws:connected');
        external.callback = (msg: string) => {
          dispatch({ type: 'received', msg });
        };
        return () => {
          trace.push('ws:disconnected');
          // Keep the callback to exercise framework gating after cleanup.
        };
      },
      dispatch: action => store.dispatch(action)
    });

    external.callback?.('hello');
    expect(store.state.messages).toEqual(['hello']);

    scope.cancel('ws-conn');
    expect(trace).toEqual(['ws:connected', 'ws:disconnected']);

    external.callback?.('stale message');
    expect(store.state.messages).toEqual(['hello']);
    store.destroy();
  });

  it('exercises TestStore adapter boundary with ResourceScope and logical settlement', async () => {
    type State = { count: number };
    type Action = { type: 'inc' } | { type: 'done' };

    const scope = new ResourceScope();
    const trace: string[] = [];

    const reducer: Reducer<State, Action> = (state, action) => {
      switch (action.type) {
        case 'inc':
          return [{ count: state.count + 1 }, Effect.none()];
        case 'done':
          return [{ count: state.count + 100 }, Effect.none()];
      }
    };

    const store = createTestStore<State, Action>({
      initialState: { count: 0 },
      reducer
    });

    let resolveTask!: () => void;
    const taskPromise = new Promise<void>((resolve) => {
      resolveTask = resolve;
    });

    const record = scope.runCancellable<Action>({
      id: 'long-running',
      execute(dispatch) {
        trace.push('task:started');
        return taskPromise.then(() => {
          trace.push('task:finished');
          dispatch({ type: 'done' });
        });
      },
      dispatch: action => store.dispatch(action)
    });

    expect(trace).toEqual(['task:started']);

    scope.cancel('long-running');
    trace.push('cancelled');

    await record.logicalSettlement;
    trace.push('logically-settled');

    expect(trace).toEqual(['task:started', 'cancelled', 'logically-settled']);

    resolveTask();
    await Promise.resolve();
    expect(store.getState().count).toBe(0);
    await store.finish();
    store.destroy();
  });
});


describe('coordinator adversarial resource regressions', () => {
  it('does not execute already-aborted work', async () => {
    const controller = new AbortController(); controller.abort();
    const execute = vi.fn(() => 1);
    const result = settleAbandonedWork(execute, controller.signal);
    await result.logicalPromise;
    expect(execute).not.toHaveBeenCalled();
  });
  it('reports rejected work without an unhandled finally promise', async () => {
    const errors: unknown[] = [];
    const scope = new ResourceScope({ onExecutionError: e => errors.push(e) });
    const record = scope.runCancellable({ execute: () => Promise.reject(new Error('expected execution failure')), dispatch() {} });
    await Promise.allSettled([record.logicalSettlement]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(errors).toHaveLength(1);
    expect(record.live).toBe(false);
    expect(scope.size).toBe(0);
  });
  it('does not create a live successor after replacement cleanup destroys scope', () => {
    const scope = new ResourceScope();
    scope.createRecord({ id: 'same', cleanup: () => scope.dispose() });
    const setup = vi.fn(() => () => {});
    const successor = scope.registerSubscription({ id: 'same', setup, dispatch() {} });
    expect(setup).not.toHaveBeenCalled();
    expect(successor.live).toBe(false);
    expect(scope.size).toBe(0);
  });
  it('reentrant replacement leaves only the newest registration alive', () => {
    const scope = new ResourceScope();
    const thirdCleanup = vi.fn();
    scope.createRecord({ id: 'same', cleanup: () => {
      scope.createRecord({ id: 'same', cleanup: thirdCleanup });
    } });
    const second = scope.createRecord({ id: 'same' });
    expect(second.live).toBe(false);
    expect(scope.size).toBe(1);
    scope.cancel('same');
    expect(thirdCleanup).toHaveBeenCalledTimes(1);
    expect(scope.size).toBe(0);
  });
  it('settled callback cannot dispatch after its execution has completed', async () => {
    const scope = new ResourceScope();
    const actions: number[] = [];
    const holder: { dispatch?: (value: number) => void } = {};
    const record = scope.runCancellable<number>({ execute: dispatch => { holder.dispatch = dispatch; dispatch(1); }, dispatch: action => actions.push(action) });
    await record.logicalSettlement;
    holder.dispatch?.(2);
    expect(actions).toEqual([1]);
    expect(record.live).toBe(false);
  });
  it('handles throwing error reporters without skipping remaining cleanup', async () => {
    const scope = new ResourceScope({ onCleanupError() { throw new Error('reporter failure'); } });
    const later = vi.fn();
    scope.createRecord({ cleanup() { throw new Error('cleanup failure'); } });
    scope.createRecord({ cleanup: later });
    expect(() => scope.dispose()).not.toThrow();
    expect(later).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });
  it('preserves timer/frame phase while allowing current frame to cancel a later one', () => {
    const scheduler = new DeterministicScheduler();
    const trace: string[] = [];
    scheduler.requestFrame(() => { trace.push('first'); scheduler.cancelFrame(second); });
    const second = scheduler.requestFrame(() => trace.push('second'));
    scheduler.stepFrameSync();
    expect(trace).toEqual(['first']);
    expect(scheduler.pendingFramesCount).toBe(0);
  });
  it('frame timestamp and timer clock cannot disagree or move backward', () => {
    const scheduler = new DeterministicScheduler(10);
    const trace: number[] = [];
    scheduler.requestFrame(t => { trace.push(t, scheduler.now()); });
    scheduler.stepFrameSync(20);
    expect(trace).toEqual([20,20]);
    expect(() => scheduler.stepFrameSync(19)).toThrow('Frame time cannot move backward');
    expect(() => scheduler.advanceTimeSync(Number.NaN)).toThrow('duration must be finite');
  });
  it('cancels production fallback frame with its original timer authority', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', undefined);
    vi.stubGlobal('cancelAnimationFrame', undefined);
    try {
      const scheduler = new ProductionScheduler(); const callback = vi.fn();
      const handle = scheduler.requestFrame(callback);
      const wrongCancel = vi.fn(); vi.stubGlobal('cancelAnimationFrame', wrongCancel);
      scheduler.cancelFrame(handle);
      vi.advanceTimersByTime(20);
      expect(callback).not.toHaveBeenCalled();
      expect(wrongCancel).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
});


describe('coordinator controls and resource boundaries', () => {
  it('settles synchronously self-cancelled execution without abandoned-promise completion', async () => {
    const scope = new ResourceScope();
    const record = scope.runCancellable({ id: 'self', execute() { scope.cancel('self'); return new Promise<void>(() => {}); }, dispatch() {} });
    await record.logicalSettlement;
    expect(scope.size).toBe(0);
    expect(record.live).toBe(false);
  });
  it('does not set up subscriptions or executors after scope disposal; clears acquired timer once', () => {
    const scope = new ResourceScope(); scope.dispose();
    const setup = vi.fn(); const execute = vi.fn(); const clear = vi.fn();
    scope.registerSubscription({ setup, dispatch() {} });
    scope.runCancellable({ execute, dispatch() {} });
    const timer = scope.registerTimer({ clear }); timer.dispose();
    expect(setup).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledTimes(1); expect(scope.size).toBe(0);
  });
  it('owner cancellation leaves unrelated resources intact and handles multiple group membership once', () => {
    const scope = new ResourceScope(); const left = {}; const right = {};
    const cleaned: string[] = [];
    scope.createRecord({ ownerToken: left, groups: ['a','b'], cleanup: () => { cleaned.push('left'); } });
    scope.createRecord({ ownerToken: right, groups: ['b'], cleanup: () => { cleaned.push('right'); } });
    scope.cancelOwner(left); expect(cleaned).toEqual(['left']); expect(scope.size).toBe(1);
    scope.cancelGroup('a'); expect(cleaned).toEqual(['left']);
    scope.cancelGroup('b'); scope.dispose(); expect(cleaned).toEqual(['left','right']);
  });
  it('positive timer and frame controls execute uncancelled work and retain next-frame work', () => {
    const scheduler = new DeterministicScheduler(); const trace: string[] = [];
    const cancelled = scheduler.setTimer(1, () => trace.push('cancelled')); scheduler.clearTimer(cancelled);
    scheduler.setTimer(0, () => { trace.push('timer'); scheduler.setTimer(0, () => trace.push('inserted')); });
    scheduler.requestFrame(() => { trace.push('frame1'); scheduler.requestFrame(() => trace.push('frame2')); });
    scheduler.advanceTimeSync(0); expect(trace).toEqual(['timer','inserted']);
    scheduler.stepFrameSync(); expect(trace).toEqual(['timer','inserted','frame1']);
    expect(scheduler.pendingFramesCount).toBe(1);
    scheduler.stepFrameSync(); expect(trace).toEqual(['timer','inserted','frame1','frame2']);
  });
  it('late rejection is reported once after cancellation, with no pending registered resource', async () => {
    const errors: unknown[] = []; const scope = new ResourceScope({onExecutionError: error => errors.push(error)});
    let reject!: (error: unknown) => void;
    const record = scope.runCancellable({ execute: () => new Promise<void>((_, r) => { reject = r; }), dispatch() {} });
    record.dispose(); await record.logicalSettlement; reject(new Error('late'));
    await new Promise(resolve => setTimeout(resolve,0));
    expect(errors).toHaveLength(1); expect(scope.size).toBe(0);
  });
});


describe('deterministic scheduler advancement authority', () => {
  it('rejects overlapping advancement without rewinding time and preserves future callbacks', async () => {
    const scheduler = new DeterministicScheduler(); const trace: number[] = [];
    scheduler.setTimer(1, () => { trace.push(scheduler.now()); expect(() => scheduler.stepFrameSync()).toThrow('Frame advancement cannot reenter'); });
    const advance = scheduler.advanceTime(10);
    await expect(scheduler.advanceTime(2)).rejects.toThrow('Timer advancement cannot reenter');
    await advance; expect(scheduler.now()).toBe(10); expect(trace).toEqual([1]);
    scheduler.advanceTimeSync(2); expect(scheduler.now()).toBe(12);
  });
});

describe('Opus foundation regression families', () => {
  it('nullish owner cancellation never cancels ownerless resources', () => {
    const scope = new ResourceScope(); const cleanup = vi.fn();
    scope.createRecord({cleanup}); scope.cancelOwner(undefined); scope.cancelOwner(null);
    expect(scope.size).toBe(1); expect(cleanup).not.toHaveBeenCalled(); scope.dispose();
  });
  it('composes cleanup explicitly and invokes late cleanup exactly once', async () => {
    const scope = new ResourceScope(); const a=vi.fn(); const b=vi.fn();
    const r=scope.createRecord({cleanup:a}); r.addCleanup(b); r.addCleanup(b);
    expect(a).not.toHaveBeenCalled(); expect(b).not.toHaveBeenCalled();
    r.dispose(); r.addCleanup(b); r.dispose(); await r.cleanupSettlement;
    expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1);
    const late=vi.fn();r.addCleanup(late);r.addCleanup(late);expect(late).toHaveBeenCalledTimes(1);
  });
  it('publishes pending settlement before predecessor teardown or self-cancellation', async () => {
    const scope = new ResourceScope(); let observed: Promise<void>|undefined;
    scope.createRecord({id:'same',cleanup:()=>{observed=scope.getRecord('same')?.logicalSettlement;}});
    const r=scope.runCancellable({id:'same',execute(){scope.cancel('same');return new Promise<void>(()=>{});},dispatch(){}});
    expect(observed).toBeDefined(); expect(observed).toBe(r.logicalSettlement);
    await observed;expect(r.outcome).toBe('cancelled');
  });
  it('execution and setup failures have one execution channel and no cleanup misclassification', async () => {
    const execution=vi.fn();const cleanup=vi.fn();const scope=new ResourceScope({onExecutionError:execution,onCleanupError:cleanup});
    const error=new Error('work failed');
    const r=scope.runCancellable({execute:()=>Promise.reject(error),dispatch(){}});
    await r.logicalSettlement;expect(r.outcome).toBe('failed');expect(r.failure).toBe(error);
    const setupError=new Error('setup failed');const sub=scope.registerSubscription({setup(){throw setupError;},dispatch(){}});
    await sub.logicalSettlement;expect(sub.outcome).toBe('failed');expect(sub.failure).toBe(setupError);
    expect(execution.mock.calls).toEqual([[error],[setupError]]);expect(cleanup).not.toHaveBeenCalled();
  });
  it('natural completion is not cancellation and explicit resource cleanup still runs', async () => {
    const abort=vi.fn();const cleanup=vi.fn();const scope=new ResourceScope();
    const r=scope.runCancellable({cleanup,execute:(_d,signal)=>{signal.addEventListener('abort',abort);},dispatch(){}});
    await r.logicalSettlement;await r.cleanupSettlement;r.dispose();
    expect(r.outcome).toBe('completed');expect(abort).not.toHaveBeenCalled();expect(cleanup).toHaveBeenCalledTimes(1);
  });
  it('async cleanup is observable even after logical resource retirement', async () => {
    let reject!: (error:unknown)=>void;const errors:unknown[]=[];const scope=new ResourceScope({onCleanupError:e=>errors.push(e)});
    const r=scope.createRecord({cleanup:()=>new Promise<void>((_resolve,fail)=>{reject=fail;})});
    r.dispose();await r.logicalSettlement;expect(scope.size).toBe(0);expect(scope.pendingCleanupCount).toBe(1);
    let done=false;const settled=scope.whenCleanupsSettled().then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);
    const error=new Error('async cleanup');reject(error);await settled;await r.cleanupSettlement;
    expect(errors).toEqual([error]);expect(scope.pendingCleanupCount).toBe(0);
  });
  it('observes cleanup returned after setup self-cancels', async () => {
    let finish!:()=>void; const scope=new ResourceScope();
    const r=scope.registerSubscription({id:'x',setup(){scope.cancel('x');return ()=>new Promise<void>(done=>{finish=done;});},dispatch(){}});
    let cleaned=false;const p=r.cleanupSettlement.then(()=>{cleaned=true;});await Promise.resolve();expect(cleaned).toBe(false);
    finish();await p;expect(cleaned).toBe(true);
  });
  it('timer registration participates in group/owner teardown and cleanup helpers observe every failure', async()=>{
    const scope=new ResourceScope();const owner={};const clear=vi.fn();const r=scope.registerTimer({ownerToken:owner,groups:['g'],clear});
    expect(scope.has(r)).toBe(true);scope.cancelOwner(owner);scope.cancelGroup('g');scope.dispose();scope.dispose();await scope.whenCleanupsSettled();expect(clear).toHaveBeenCalledTimes(1);
    const errors:unknown[]=[];const a=new Error('a');const b=new Error('b');
    await safeCleanupAll([()=>{throw a;},()=>Promise.reject(b)],e=>errors.push(e));expect(errors).toEqual([a,b]);
    await safeCleanup(()=>Promise.resolve(),()=>{throw new Error('unused');});
  });
  it('timer errors do not strand sibling timers or clock advancement', async()=>{
    for(const asyncAdvance of [false,true]){
      const s=new DeterministicScheduler();const ran=vi.fn();s.setTimer(1,()=>{throw new Error('timer boom');});s.setTimer(2,ran);
      if(asyncAdvance) await expect(s.advanceTime(5)).rejects.toThrow('timer boom');else expect(()=>s.advanceTimeSync(5)).toThrow('timer boom');
      expect(ran).toHaveBeenCalledTimes(1);expect(s.now()).toBe(5);expect(s.pendingTimersCount).toBe(0);
    }
  });
  it('timer and frame drains preserve secondary failures',()=>{
    for(const frame of [false,true]){
      const s=new DeterministicScheduler();const errors=[new Error('one'),new Error('two')];
      for(const error of errors){if(frame)s.requestFrame(()=>{throw error;});else s.setTimer(0,()=>{throw error;});}
      let caught:unknown;try{if(frame)s.stepFrameSync();else s.advanceTimeSync(0);}catch(error){caught=error;}
      expect(caught).toBeInstanceOf(AggregateError);expect((caught as AggregateError).errors).toEqual(errors);
    }
  });
  it('bounded timer storms throw explicitly and retain pending work (finite baseline control)',async()=>{
    for(const asyncAdvance of [false,true]){
      const s=new DeterministicScheduler(0,{maxCallbacksPerAdvance:3});let calls=0;
      const loop=()=>{calls++;if(calls<5)s.setTimer(0,loop);};s.setTimer(0,loop);
      if(asyncAdvance)await expect(s.advanceTime(0)).rejects.toThrow('Timer callback limit 3 exceeded');else expect(()=>s.advanceTimeSync(0)).toThrow('Timer callback limit 3 exceeded');
      expect(calls).toBe(3);expect(s.pendingTimersCount).toBe(1);s.advanceTimeSync(0);expect(calls).toBe(5);
    }
  });
  it('production clock retains its initially selected source across global replacement',()=>{
    let now=1000;vi.stubGlobal('performance',undefined);vi.spyOn(Date,'now').mockImplementation(()=>now);
    try{const s=new ProductionScheduler();expect(s.now()).toBe(1000);vi.stubGlobal('performance',{now:()=>10});now=1005;expect(s.now()).toBe(1005);now=1003;expect(s.now()).toBe(1005);now=1006;expect(s.now()).toBe(1008);}finally{vi.restoreAllMocks();vi.unstubAllGlobals();}
  });
  it('production timer cancellation retains scheduling-time authority',()=>{
    const callbacks=new Map<number,()=>void>();const clear=vi.fn((id:number)=>{callbacks.delete(id);});
    vi.stubGlobal('setTimeout',(cb:()=>void)=>{callbacks.set(1,cb);return 1;});vi.stubGlobal('clearTimeout',clear);
    try{const s=new ProductionScheduler();const cb=vi.fn();const handle=s.setTimer(2,cb);const wrong=vi.fn();vi.stubGlobal('clearTimeout',wrong);s.clearTimer(handle);for(const f of callbacks.values())f();expect(clear).toHaveBeenCalledWith(1);expect(wrong).not.toHaveBeenCalled();expect(cb).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}
  });
  it('moving a frame clock past a due timer is diagnosed without dropping either callback',()=>{
    const s=new DeterministicScheduler();const trace:string[]=[];s.setTimer(5,()=>trace.push('timer'));s.requestFrame(()=>trace.push('frame'));
    expect(()=>s.stepFrameSync(20)).toThrow('Advance due timers before moving the frame clock');expect(s.now()).toBe(0);
    s.advanceTimeSync(20);s.stepFrameSync(20);expect(trace).toEqual(['timer','frame']);
  });
  it('forged handles cannot cancel work',()=>{
    const s=new DeterministicScheduler();const t=vi.fn();const f=vi.fn();const timer=s.setTimer(0,t);const frame=s.requestFrame(f);
    s.clearTimer({...timer});s.cancelFrame({...frame});s.advanceTimeSync(0);s.stepFrameSync();expect(t).toHaveBeenCalledTimes(1);expect(f).toHaveBeenCalledTimes(1);
  });
});


// The specialized paths own these lifecycle hooks; rejecting them at compile time prevents silent replacement.
if (false) {
  const scope = new ResourceScope();
  // @ts-expect-error A timer registration owns its clear callback, not a second cleanup slot.
  scope.registerTimer({ clear() {}, cleanup() {} });
  // @ts-expect-error A subscription owns the cleanup returned by setup.
  scope.registerSubscription({ setup() {}, dispatch() {}, cleanup() {} });
  // @ts-expect-error Cancellable execution owns its AbortController.
  scope.runCancellable({ execute() {}, dispatch() {}, controller: new AbortController() });
}

it('contains asynchronously rejecting diagnostic sinks', async () => {
  const later=vi.fn();const scope=new ResourceScope({onCleanupError:async()=>{throw new Error('async reporter');}});
  scope.createRecord({cleanup(){throw new Error('cleanup');}});scope.createRecord({cleanup:later});scope.dispose();
  await scope.whenCleanupsSettled();await new Promise(resolve=>setTimeout(resolve,0));expect(later).toHaveBeenCalledTimes(1);
});


it('resource ownership composes with one injected deterministic timer authority', () => {
  const scheduler = new DeterministicScheduler();const scope = new ResourceScope();const run=vi.fn();
  const timer=scheduler.setTimer(5,run);
  scope.registerTimer({id:'opaque-timer-1',groups:['lifetime'],clear:()=>scheduler.clearTimer(timer)});
  scope.cancelGroup('lifetime');scheduler.advanceTimeSync(5);
  expect(run).not.toHaveBeenCalled();expect(scheduler.pendingTimersCount).toBe(0);expect(scope.size).toBe(0);
});


describe('external cancellation and native frame timestamp parity', () => {
 it('external controller abort synchronously retires work as cancelled', async () => {
  const scope = new ResourceScope();
  const cleanup = vi.fn();
  const record = scope.runCancellable({ execute: () => new Promise<void>(() => {}), dispatch() {}, cleanup });
  record.controller!.abort();
  expect(record.live).toBe(false);
  expect(record.outcome).toBe('cancelled');
  expect(scope.size).toBe(0);
  expect(cleanup).toHaveBeenCalledOnce();
  await record.logicalSettlement;
  await record.cleanupSettlement;
  expect(record.outcome).toBe('cancelled');
 });
 it('an already aborted record never supersedes a live registered owner', () => {
  const scope = new ResourceScope();
  const live = scope.createRecord({id:'same'});
  const controller = new AbortController(); controller.abort();
  const cleanup = vi.fn();
  const dead = scope.createRecord({id:'same',controller,cleanup});
  expect(dead.outcome).toBe('cancelled');
  expect(scope.getRecord('same')).toBe(live);
  expect(cleanup).toHaveBeenCalledOnce();
  scope.dispose();
 });
 it('callbacks in one host frame receive its identical timestamp', () => {
  const callbacks: FrameRequestCallback[] = [];
  let clock = 40;
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{callbacks.push(callback);return callbacks.length;});
  vi.stubGlobal('cancelAnimationFrame',vi.fn());
  vi.stubGlobal('performance',{now:()=>++clock});
  try {
   const scheduler = new ProductionScheduler();
   const times: number[] = [];
   scheduler.requestFrame(time=>times.push(time));
   scheduler.requestFrame(time=>times.push(time));
   for(const callback of callbacks) callback(32);
   expect(times).toEqual([32,32]);
  } finally {vi.unstubAllGlobals();}
 });
});


it('keeps timer/frame equality an explicitly selected phase without moving past due work', () => {
 const scheduler = new DeterministicScheduler(); const trace: string[] = [];
 scheduler.setTimer(0, () => trace.push('timer')); scheduler.requestFrame(() => trace.push('frame'));
 scheduler.stepFrameSync(0); expect(scheduler.now()).toBe(0); expect(trace).toEqual(['frame']);
 scheduler.advanceTimeSync(0); expect(trace).toEqual(['frame','timer']);
});
it('rejects overflowing timer delays on production and deterministic adapters', () => {
 for (const scheduler of [new ProductionScheduler(), new DeterministicScheduler()]) {
  expect(() => scheduler.setTimer(2147483648, () => {})).toThrow('Timer delay exceeds');
 }
});

it('record cancellation retains the controller captured at registration',()=>{
 const scope=new ResourceScope();const first=new AbortController();const second=new AbortController();
 const options={controller:first};const record=scope.createRecord(options);
 options.controller=second;
 record.dispose();
 expect(first.signal.aborted).toBe(true);
 expect(second.signal.aborted).toBe(false);
});


it('normalizes fractional timer delays before host or deterministic registration', () => {
  const scheduler = new DeterministicScheduler();
  const order: string[] = [];
  scheduler.setTimer(1.9, () => order.push('first'));
  scheduler.setTimer(1.1, () => order.push('second'));
  scheduler.advanceTimeSync(1);
  expect(order).toEqual(['first', 'second']);
  const schedule = vi.fn((_callback: () => void, _delay: number) => 1);
  vi.stubGlobal('setTimeout', schedule);
  try { new ProductionScheduler().setTimer(1.9, () => {}); expect(schedule.mock.calls[0]?.[1]).toBe(1); }
  finally { vi.unstubAllGlobals(); }
});
