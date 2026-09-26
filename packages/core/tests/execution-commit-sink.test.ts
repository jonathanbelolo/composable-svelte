import { it, expect } from 'vitest';
import { Effect } from '../src/lib/effect.js';
import { EffectRuntime } from '../src/lib/execution/runtime.js';
import { TurnQueue } from '../src/lib/execution/turn-queue.js';
import { DeterministicScheduler } from '../src/lib/execution/scheduler.js';
import { ownerAt, stampOrigin } from '../src/lib/execution/identity.js';

it.each([false, true])('retiring an owner cleans its subscription when commit notification throws=%s', failNotification => {
  const path = [{ slot: 'child' }] as const;
  const failure = new Error('commit notification failed');
  let cleanups = 0;
  const runtime = new EffectRuntime<string>({ scheduler: new DeterministicScheduler(), dispatch() {} });
  const queue = new TurnQueue<boolean, string>({
    initialState: true,
    runtime,
    reducer: (_state, _action) => [false, Effect.none()],
    execution: { mode: 'managed', slots: { select: state => state ? [path] : [] } },
    onStateCommitted: () => { if (failNotification) throw failure; }
  });
  const owner = ownerAt(queue.getLifecycle(), path);
  expect(owner).toBeDefined();
  if (!owner) throw new Error('owner missing');
  runtime.executeEffect(stampOrigin(Effect.subscription<string>('live', () => () => { cleanups++; }), owner), queue.getLifecycle());
  expect(cleanups).toBe(0);
  try {
    if (failNotification) expect(() => queue.dispatch('close')).toThrow(failure);
    else expect(() => queue.dispatch('close')).not.toThrow();
    expect(queue.getState()).toBe(false);
    expect(ownerAt(queue.getLifecycle(), path)).toBeUndefined();
    expect(cleanups).toBe(1);
  } finally {
    queue.destroy();
  }
});

it('proves owner cleanup occurs before state subscriber notification when commit notification throws', () => {
  const path = [{ slot: 'child' }] as const;
  const failure = new Error('commit notification failed');
  let cleanups = 0;
  let cleanupsWhenSubscriberNotified = -1;
  const runtime = new EffectRuntime<string>({ scheduler: new DeterministicScheduler(), dispatch() {} });
  const queue = new TurnQueue<boolean, string>({
    initialState: true,
    runtime,
    reducer: (_state, _action) => [false, Effect.none()],
    execution: { mode: 'managed', slots: { select: state => state ? [path] : [] } },
    onStateCommitted: () => { throw failure; }
  });
  const owner = ownerAt(queue.getLifecycle(), path);
  expect(owner).toBeDefined();
  if (!owner) throw new Error('owner missing');
  runtime.executeEffect(stampOrigin(Effect.subscription<string>('live', () => () => { cleanups++; }), owner), queue.getLifecycle());

  queue.subscribe(state => {
    if (state === false) {
      cleanupsWhenSubscriberNotified = cleanups;
    }
  });

  try {
    expect(() => queue.dispatch('close')).toThrow(failure);
    expect(cleanupsWhenSubscriberNotified).toBe(1);
    expect(cleanups).toBe(1);
    expect(queue.getState()).toBe(false);
  } finally {
    queue.destroy();
  }
});

it('executes valid new effects and preserves single error identity when commit notification throws', () => {
  const failure = new Error('commit notification failed');
  let effectRan = false;
  const runtime = new EffectRuntime<string>({ scheduler: new DeterministicScheduler(), dispatch() {} });
  const queue = new TurnQueue<number, string>({
    initialState: 0,
    runtime,
    reducer: (state, _action) => [
      state + 1,
      Effect.subscription<string>('new-effect', () => {
        effectRan = true;
        return () => {};
      })
    ],
    onStateCommitted: () => { throw failure; }
  });

  try {
    let caught: unknown;
    try {
      queue.dispatch('increment');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(failure);
    expect(effectRan).toBe(true);
    expect(queue.getState()).toBe(1);
  } finally {
    queue.destroy();
  }
});

it('processes queued turns in order and preserves state when commit notification throws on earlier turn', () => {
  const failure = new Error('turn 1 commit failed');
  const seenStates: number[] = [];
  const runtime = new EffectRuntime<string>({ scheduler: new DeterministicScheduler(), dispatch() {} });
  let queueRef!: TurnQueue<number, string>;
  const queue = new TurnQueue<number, string>({
    initialState: 0,
    runtime,
    reducer: (state, _action) => [state + 1, Effect.none()],
    onStateCommitted: state => {
      seenStates.push(state);
      if (state === 1) {
        queueRef.dispatch('second');
        throw failure;
      }
    }
  });
  queueRef = queue;

  try {
    expect(() => queue.dispatch('first')).toThrow(failure);
    expect(seenStates).toEqual([1, 2]);
    expect(queue.getState()).toBe(2);
  } finally {
    queue.destroy();
  }
});

it('aggregates multiple commit notification errors across queued turns', () => {
  const failure1 = new Error('commit failure 1');
  const failure2 = new Error('commit failure 2');
  const runtime = new EffectRuntime<string>({ scheduler: new DeterministicScheduler(), dispatch() {} });
  let queueRef!: TurnQueue<number, string>;
  const queue = new TurnQueue<number, string>({
    initialState: 0,
    runtime,
    reducer: (state, _action) => [state + 1, Effect.none()],
    onStateCommitted: state => {
      if (state === 1) {
        queueRef.dispatch('second');
        throw failure1;
      }
      if (state === 2) {
        throw failure2;
      }
    }
  });
  queueRef = queue;

  try {
    let caught: unknown;
    try {
      queue.dispatch('first');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    const agg = caught as AggregateError;
    expect(agg.message).toBe('Multiple errors occurred during turn drain');
    expect(agg.errors).toHaveLength(2);
    expect(agg.errors[0]).toBe(failure1);
    expect(agg.errors[1]).toBe(failure2);
    expect(queue.getState()).toBe(2);
  } finally {
    queue.destroy();
  }
});

it('destruction during commit notification prevents state subscriber notification while preserving committed state and error identity', () => {
  const path = [{ slot: 'child' }] as const;
  const failure = new Error('commit failure with destroy');
  let cleanups = 0;
  let subscriberCalled = false;
  const runtime = new EffectRuntime<string>({ scheduler: new DeterministicScheduler(), dispatch() {} });
  let queueRef!: TurnQueue<boolean, string>;
  const queue = new TurnQueue<boolean, string>({
    initialState: true,
    runtime,
    reducer: (_state, _action) => [false, Effect.none()],
    execution: { mode: 'managed', slots: { select: state => state ? [path] : [] } },
    onStateCommitted: () => {
      queueRef.destroy();
      throw failure;
    }
  });
  queueRef = queue;
  const owner = ownerAt(queue.getLifecycle(), path);
  expect(owner).toBeDefined();
  if (!owner) throw new Error('owner missing');
  runtime.executeEffect(stampOrigin(Effect.subscription<string>('live', () => () => { cleanups++; }), owner), queue.getLifecycle());

  queue.subscribe(state => {
    if (state === false) subscriberCalled = true;
  });

  try {
    let caught: unknown;
    try {
      queue.dispatch('close');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(failure);
    expect(queue.isDestroyed).toBe(true);
    expect(cleanups).toBe(1);
    expect(subscriberCalled).toBe(false);
    expect(queue.getState()).toBe(false);
  } finally {
    queue.destroy();
  }
});

it('escapes commit notification failure without routing to onSubscriberError', () => {
  const failure = new Error('commit notification failed');
  const subscriberErrors: unknown[] = [];
  let subscriberCalledWith: number | undefined;
  const runtime = new EffectRuntime<string>({ scheduler: new DeterministicScheduler(), dispatch() {} });
  const queue = new TurnQueue<number, string>({
    initialState: 0,
    runtime,
    reducer: (state, _action) => [state + 1, Effect.none()],
    onSubscriberError: err => subscriberErrors.push(err),
    onStateCommitted: () => { throw failure; }
  });
  queue.subscribe(state => {
    if (state > 0) subscriberCalledWith = state;
  });

  try {
    let caught: unknown;
    try {
      queue.dispatch('increment');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(failure);
    expect(subscriberErrors).toEqual([]);
    expect(subscriberCalledWith).toBe(1);
    expect(queue.getState()).toBe(1);
  } finally {
    queue.destroy();
  }
});

it.each([false, true])('staged initialization follows attached lifetime when commit sink destroys=%s', destroyInSink => {
  const path = [{ slot: 'child' }] as const;
  const failure = new Error('commit failure with destroy and staged init');
  let executed = false;
  const scheduler = new DeterministicScheduler();
  const runtime = new EffectRuntime<string>({ scheduler, dispatch() {} });
  let queueRef!: TurnQueue<boolean, string>;
  const queue = new TurnQueue<boolean, string>({
    initialState: false,
    runtime,
    reducer: (_state, _action) => [true, Effect.none()],
    execution: {
      mode: 'managed',
      slots: { select: state => (state ? [path] : []) },
      _initialization: { mode: 'attached' },
      // Internal composition seam, not an application reducer pattern.
      _reduce: ({ state, action, dependencies, reducer }) => {
        const [next, effect] = reducer(state, action, dependencies);
        return [next, effect, [], [{ path, effect: Effect.run(() => { executed = true; }) }]];
      }
    },
    onStateCommitted: () => {
      if (destroyInSink) {
        queueRef.destroy();
        throw failure;
      }
    }
  });
  queueRef = queue;
  queue.activateInitialization({ live: true });

  try {
    let caught: unknown;
    try {
      queue.dispatch('open');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(destroyInSink ? failure : undefined);
    expect(queue.isDestroyed).toBe(destroyInSink);
    expect(queue.getState()).toBe(true);
    expect(executed).toBe(!destroyInSink);
    expect(scheduler.pendingTimersCount).toBe(0);
    expect(runtime.isDisposed).toBe(destroyInSink);
    if (destroyInSink) {
      expect(runtime.resourceScope.size).toBe(0);
      expect(runtime.pendingWorkCount).toBe(0);
    }
  } finally {
    queue.destroy();
  }
});
