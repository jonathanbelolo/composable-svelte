import { describe, it, expect } from 'vitest';
import { createStore } from '../src/lib/store.svelte.js';
import { Effect } from '../src/lib/effect.js';
import { createDeterministicScheduler } from '../src/lib/execution/scheduler.js';
import {
  ownerAt,
  stampOrigin,
  resourceKey,
  createLifecycle,
  reconcile,
  qualifyEffect
} from '../src/lib/execution/identity.js';
import type { OwnerToken } from '../src/lib/execution/identity.js';
import type { Reducer, ManagedReductionAdapter } from '../src/lib/types.js';
import type { RuntimeEvent } from '../src/lib/execution/runtime.js';

describe('execution managed boundary regression tests (V5/O4/O6)', () => {
  // Module-level reusable root effect to verify that execution does not mutate
  // or define markers on frozen application-owned descriptions across multiple turns.
  let reusableRootRuns = 0;
  const reusableRootEffect = Object.freeze(
    Effect.fireAndForget(() => {
      reusableRootRuns++;
    })
  );

  type ManagedState = {
    slotA: boolean;
    slotB: boolean;
  };

  type ManagedAction =
    | { type: 'subscribe_all' }
    | { type: 'cancel_a' }
    | { type: 'group_all' }
    | { type: 'cancel_group_a' }
    | { type: 'debounce_a' }
    | { type: 'cancellable_a' }
    | { type: 'reusable_root' };

  function createManagedFixture() {
    const scheduler = createDeterministicScheduler(0);
    const cleanups = {
      a: 0,
      b: 0,
      root: 0
    };

    const slotDescriptor = {
      select: (state: ManagedState) => [
        ...(state.slotA ? [[{ slot: 'a' }]] : []),
        ...(state.slotB ? [[{ slot: 'b' }]] : [])
      ]
    };

    let capturedOwnerA: OwnerToken | undefined;
    let capturedOwnerB: OwnerToken | undefined;

    const reducer: Reducer<ManagedState, ManagedAction> = (state, action) => {
      switch (action.type) {
        case 'subscribe_all':
          return [
            state,
            Effect.batch(
              Effect.subscription('same', () => () => { cleanups.a++; }),
              Effect.subscription('same', () => () => { cleanups.b++; }),
              Effect.subscription('same', () => () => { cleanups.root++; })
            )
          ];
        case 'cancel_a':
          return [state, Effect.cancel('same')];
        case 'group_all':
          return [
            state,
            Effect.batch(
              Effect.inGroup(
                Effect.subscription('group-sub', () => () => { cleanups.a++; }),
                'shared-group'
              ),
              Effect.inGroup(
                Effect.subscription('group-sub', () => () => { cleanups.b++; }),
                'shared-group'
              ),
              Effect.inGroup(
                Effect.subscription('group-sub', () => () => { cleanups.root++; }),
                'shared-group'
              )
            )
          ];
        case 'cancel_group_a':
          return [state, Effect.cancelGroup('shared-group')];
        case 'debounce_a':
          return [
            state,
            Effect.inGroup(Effect.debounced('search-query', 50, () => {}), 'search-group')
          ];
        case 'cancellable_a':
          return [state, Effect.cancellable('local-work', async () => {})];
        case 'reusable_root':
          return [state, reusableRootEffect];
        default:
          return [state, Effect.none()];
      }
    };

    // NOTE: _reduce is an internal pure composition seam used here to stamp owner origins
    // on child effects at the runtime boundary for testing. This is NOT an application author
    // pattern; application reducers are pure business logic and must never manually qualify
    // effect IDs or groups in the reducer. Qualification is performed once by the framework
    // runtime at the interpreter entry boundary.
    const managedReduce: ManagedReductionAdapter<ManagedState, ManagedAction, undefined> = ({
      state,
      action,
      dependencies,
      lifecycle,
      reducer: reduceOnce
    }) => {
      const [nextState, effect] = reduceOnce(state, action, dependencies);
      const ownerA = ownerAt(lifecycle, [{ slot: 'a' }]);
      const ownerB = ownerAt(lifecycle, [{ slot: 'b' }]);
      if (ownerA) capturedOwnerA = ownerA;
      if (ownerB) capturedOwnerB = ownerB;

      if (action.type === 'subscribe_all' || action.type === 'group_all') {
        if (effect._tag === 'Batch') {
          const stampedEffects = [
            ownerA ? stampOrigin(effect.effects[0]!, ownerA) : effect.effects[0]!,
            ownerB ? stampOrigin(effect.effects[1]!, ownerB) : effect.effects[1]!,
            effect.effects[2]!
          ];
          return [nextState, Effect.batch(...stampedEffects)];
        }
      }

      if (
        action.type === 'cancel_a' ||
        action.type === 'cancel_group_a' ||
        action.type === 'debounce_a' ||
        action.type === 'cancellable_a'
      ) {
        return [nextState, ownerA ? stampOrigin(effect, ownerA) : effect];
      }

      return [nextState, effect];
    };

    const store = createStore({
      initialState: { slotA: true, slotB: true },
      reducer,
      execution: {
        mode: 'managed',
        scheduler,
        slots: slotDescriptor,
        _reduce: managedReduce
      }
    });

    const runtime = store._runtime;
    if (!runtime) throw new Error('Missing runtime on managed store');

    const startedRecords: Extract<RuntimeEvent, { type: 'started' }>['record'][] = [];
    runtime.observe((event: RuntimeEvent) => {
      if (event.type === 'started') {
        startedRecords.push(event.record);
      }
    });

    return {
      store,
      scheduler,
      cleanups,
      startedRecords,
      getOwnerA(): OwnerToken {
        if (!capturedOwnerA) throw new Error('Missing captured owner A');
        return capturedOwnerA;
      },
      getOwnerB(): OwnerToken {
        if (!capturedOwnerB) throw new Error('Missing captured owner B');
        return capturedOwnerB;
      },
      destroy(): void {
        store.destroy();
      }
    };
  }

  it('qualifies owner a/b/root local subscriptions with same ID once at managed interpreter', () => {
    const fixture = createManagedFixture();
    try {
      fixture.store.dispatch({ type: 'subscribe_all' });

      const ownerA = fixture.getOwnerA();
      const ownerB = fixture.getOwnerB();
      expect(ownerA).toBeDefined();
      expect(ownerB).toBeDefined();

      const subRecordA = fixture.startedRecords.find(r => r.id === resourceKey(ownerA, 'id', 'same'));
      const subRecordB = fixture.startedRecords.find(r => r.id === resourceKey(ownerB, 'id', 'same'));
      const subRecordRoot = fixture.startedRecords.find(r => r.id === resourceKey(undefined, 'id', 'same'));

      expect(subRecordA).toBeDefined();
      expect(subRecordB).toBeDefined();
      expect(subRecordRoot).toBeDefined();
      if (!subRecordA || !subRecordB || !subRecordRoot) throw new Error('Missing expected subscription records');

      expect(subRecordA.id).toBe(JSON.stringify([['owner', ownerA.id], 'id', 'same']));
      expect(subRecordB.id).toBe(JSON.stringify([['owner', ownerB.id], 'id', 'same']));
      expect(subRecordRoot.id).toBe(JSON.stringify([['root'], 'id', 'same']));
    } finally {
      fixture.destroy();
    }
  });

  it('isolates owned cancellation to the targeted owner subscription', () => {
    const fixture = createManagedFixture();
    try {
      fixture.store.dispatch({ type: 'subscribe_all' });

      const ownerA = fixture.getOwnerA();
      const ownerB = fixture.getOwnerB();
      const subRecordA = fixture.startedRecords.find(r => r.id === resourceKey(ownerA, 'id', 'same'));
      const subRecordB = fixture.startedRecords.find(r => r.id === resourceKey(ownerB, 'id', 'same'));
      const subRecordRoot = fixture.startedRecords.find(r => r.id === resourceKey(undefined, 'id', 'same'));

      expect(subRecordA).toBeDefined();
      expect(subRecordB).toBeDefined();
      expect(subRecordRoot).toBeDefined();
      if (!subRecordA || !subRecordB || !subRecordRoot) throw new Error('Missing expected subscription records');

      fixture.store.dispatch({ type: 'cancel_a' });
      expect(fixture.cleanups).toEqual({ a: 1, b: 0, root: 0 });
      expect(subRecordA.live).toBe(false);
      expect(subRecordB.live).toBe(true);
      expect(subRecordRoot.live).toBe(true);
    } finally {
      fixture.destroy();
    }
  });

  it('cancels owner-local CancelGroup membership without retiring other owners or root in the same group (F6)', () => {
    const fixture = createManagedFixture();
    try {
      fixture.store.dispatch({ type: 'group_all' });

      const ownerA = fixture.getOwnerA();
      const ownerB = fixture.getOwnerB();
      expect(ownerA).toBeDefined();
      expect(ownerB).toBeDefined();
      expect(ownerA).not.toBe(ownerB);

      const groupRecordA = fixture.startedRecords.find(r => r.id === resourceKey(ownerA, 'id', 'group-sub'));
      const groupRecordB = fixture.startedRecords.find(r => r.id === resourceKey(ownerB, 'id', 'group-sub'));
      const groupRecordRoot = fixture.startedRecords.find(r => r.id === resourceKey(undefined, 'id', 'group-sub'));

      expect(groupRecordA).toBeDefined();
      expect(groupRecordB).toBeDefined();
      expect(groupRecordRoot).toBeDefined();
      if (!groupRecordA || !groupRecordB || !groupRecordRoot) throw new Error('Missing expected group subscription records');

      const expectedGroupA = resourceKey(ownerA, 'group', 'shared-group');
      const expectedGroupB = resourceKey(ownerB, 'group', 'shared-group');
      const expectedGroupRoot = resourceKey(undefined, 'group', 'shared-group');

      expect(groupRecordA.groups).toContain(expectedGroupA);
      expect(groupRecordB.groups).toContain(expectedGroupB);
      expect(groupRecordRoot.groups).toContain(expectedGroupRoot);

      fixture.store.dispatch({ type: 'cancel_group_a' });

      expect(fixture.cleanups).toEqual({ a: 1, b: 0, root: 0 });
      expect(groupRecordA.live).toBe(false);
      expect(groupRecordB.live).toBe(true);
      expect(groupRecordRoot.live).toBe(true);
    } finally {
      fixture.destroy();
    }
  });

  it('encodes fired debounce group once through injected scheduler', async () => {
    const fixture = createManagedFixture();
    try {
      fixture.store.dispatch({ type: 'debounce_a' });
      await fixture.scheduler.advanceTime(50);

      const ownerA = fixture.getOwnerA();
      const firedDebounceRecord = fixture.startedRecords.find(
        r => r.description === 'Debounced' && r.kind === 'execution'
      );
      expect(firedDebounceRecord).toBeDefined();
      if (!firedDebounceRecord) throw new Error('Missing fired debounce record');

      const expectedGroup = resourceKey(ownerA, 'group', 'search-group');
      expect(firedDebounceRecord.groups).toContain(expectedGroup);
      expect(expectedGroup).toBe(JSON.stringify([['owner', ownerA.id], 'group', 'search-group']));
    } finally {
      fixture.destroy();
    }
  });

  it('exposes diagnostics with ownerId, description tag, and local name in id (O6)', () => {
    const fixture = createManagedFixture();
    try {
      fixture.store.dispatch({ type: 'cancellable_a' });

      const ownerA = fixture.getOwnerA();
      const runtime = fixture.store._runtime;
      if (!runtime) throw new Error('Missing runtime');

      const cancellableDiag = runtime.diagnostics.find(
        (d): d is Extract<typeof d, { type: 'started' }> =>
          d.type === 'started' && d.record.description === 'Cancellable'
      );
      expect(cancellableDiag).toBeDefined();
      if (!cancellableDiag) throw new Error('Missing cancellable diagnostic');

      expect(cancellableDiag.record.ownerId).toBe(ownerA.id);
      expect(cancellableDiag.record.description).toBe('Cancellable');
      expect(cancellableDiag.record.id).toBe(resourceKey(ownerA, 'id', 'local-work'));
      expect(cancellableDiag.record.id).toContain('local-work');
    } finally {
      fixture.destroy();
    }
  });

  it('executes frozen reusable root effect across turns without mutation or property additions', () => {
    const fixture = createManagedFixture();
    try {
      reusableRootRuns = 0;
      fixture.store.dispatch({ type: 'reusable_root' });
      expect(reusableRootRuns).toBe(1);

      fixture.store.dispatch({ type: 'reusable_root' });
      expect(reusableRootRuns).toBe(2);

      expect(Object.isFrozen(reusableRootEffect)).toBe(true);
      expect(Object.getOwnPropertyNames(reusableRootEffect).sort()).toEqual(['_tag', 'execute']);
      expect(Object.getOwnPropertySymbols(reusableRootEffect)).toEqual([]);
    } finally {
      fixture.destroy();
    }
  });

  it('separately traces retired owner cleanup before subscriber before root effect start (O4)', () => {
    const trace: string[] = [];

    type State = {
      childActive: boolean;
    };

    type Action =
      | { type: 'setup_child' }
      | { type: 'retire_and_run_root' };

    const slotDescriptor = {
      select: (s: State) => (s.childActive ? [[{ slot: 'child' }]] : [])
    };

    const reducer: Reducer<State, Action> = (state, action) => {
      switch (action.type) {
        case 'setup_child':
          return [
            state,
            Effect.subscription('child-sub', () => () => {
              trace.push('cleanup:a');
            })
          ];
        case 'retire_and_run_root':
          return [
            { childActive: false },
            Effect.run(() => {
              trace.push('start:root');
            })
          ];
        default:
          return [state, Effect.none()];
      }
    };

    // NOTE: _reduce is an internal pure composition seam used here to stamp owner origins
    // on child effects at the runtime boundary for testing.
    const store = createStore({
      initialState: { childActive: true },
      reducer,
      execution: {
        mode: 'managed',
        slots: slotDescriptor,
        _reduce: ({ state, action, dependencies, lifecycle, reducer: reduceOnce }) => {
          const [nextState, effect] = reduceOnce(state, action, dependencies);
          if (action.type === 'setup_child') {
            const owner = ownerAt(lifecycle, [{ slot: 'child' }]);
            return [nextState, owner ? stampOrigin(effect, owner) : effect];
          }
          return [nextState, effect];
        }
      }
    });

    try {
      store.subscribe(state => {
        if (!state.childActive) {
          trace.push('subscriber');
        }
      });

      store.dispatch({ type: 'setup_child' });
      expect(trace).toEqual([]);

      store.dispatch({ type: 'retire_and_run_root' });
      expect(trace).toEqual(['cleanup:a', 'subscriber', 'start:root']);
    } finally {
      store.destroy();
    }
  });

  it('characterizes deliberate non-recognition: double qualification produces a distinct key that never aliases another owner (V5)', () => {
    const emptyLifecycle = createLifecycle();
    const { lifecycle } = reconcile(
      emptyLifecycle,
      { a: false, b: false },
      { a: true, b: true },
      {
        select: (s: { a: boolean; b: boolean }) => [
          ...(s.a ? [[{ slot: 'a' }]] : []),
          ...(s.b ? [[{ slot: 'b' }]] : [])
        ]
      }
    );
    const ownerA = ownerAt(lifecycle, [{ slot: 'a' }]);
    const ownerB = ownerAt(lifecycle, [{ slot: 'b' }]);

    expect(ownerA).toBeDefined();
    expect(ownerB).toBeDefined();
    expect(ownerA).not.toBe(ownerB);
    if (!ownerA || !ownerB) throw new Error('Missing fixture owner');

    const eff = stampOrigin(
      Effect.subscription('same', () => () => {}),
      ownerA
    );

    const once = qualifyEffect(eff, lifecycle);
    const twice = qualifyEffect(once, lifecycle);

    expect(once._tag).toBe('Subscription');
    expect(twice._tag).toBe('Subscription');
    if (once._tag === 'Subscription' && twice._tag === 'Subscription') {
      const singleKey = resourceKey(ownerA, 'id', 'same');
      expect(once.id).toBe(singleKey);
      expect(twice.id).toBe(resourceKey(ownerA, 'id', resourceKey(ownerA, 'id', 'same')));
      expect(twice.id).not.toBe(singleKey);
      expect(twice.id).not.toBe(resourceKey(ownerB, 'id', 'same'));
      expect(twice.id).not.toBe(resourceKey(undefined, 'id', 'same'));
    }
  });
});
