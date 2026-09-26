import { afterEach, describe, expect, it } from 'vitest';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import { TestStore } from '../../src/lib/test/test-store.js';
import {
  ManagedIntegrationBuilder,
  destinationSlot,
  keyedSlot,
  optionalSlot,
  type ChildPolicy
} from '../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import {
  managedDismissDependency,
  type DismissDependency
} from '../../src/lib/navigation/dismiss-dependency.js';
import type { Effect as EffectType, Reducer, Store } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';

interface Deps { readonly dismiss: DismissDependency; }
type Child = { count: number };
type ChildAction =
  | { type: 'close' }
  | { type: 'load' }
  | { type: 'loaded' }
  | { type: 'bump' }
  | { type: 'ready' };

const child: Reducer<Child, ChildAction, Deps> = (state, action, deps) => {
  if (action.type === 'close') return [state, deps.dismiss()];
  if (action.type === 'load') {
    return [state, Effect.run<ChildAction>((dispatch) => dispatch({ type: 'loaded' }))];
  }
  if (action.type === 'loaded' || action.type === 'bump' || action.type === 'ready') {
    return [{ count: state.count + 1 }, Effect.none()];
  }
  return [state, Effect.none()];
};

const Destination = createDestination({ alpha: child, beta: child });
type Occupant = typeof Destination._types.State;
type DestinationAction = typeof Destination._types.Action;
type State = { destination: Occupant | null; marker: number };
type Action =
  | { type: 'destination'; action: PresentationAction<DestinationAction> }
  | { type: 'openAlpha'; count?: number }
  | { type: 'switchBeta'; count?: number }
  | { type: 'replaceAlpha'; count?: number }
  | { type: 'marker' };

const slot = destinationSlot<State, Action>()('destination', Destination);
const reduce: Reducer<State, Action, Deps> = (state, action) => {
  if (action.type === 'openAlpha') {
    return [{ ...state, destination: Destination.initial('alpha', { count: action.count ?? 0 }) }, Effect.none()];
  }
  if (action.type === 'switchBeta') {
    return [{ ...state, destination: Destination.initial('beta', { count: action.count ?? 0 }) }, Effect.none()];
  }
  if (action.type === 'replaceAlpha') {
    return [{ ...state, destination: Destination.initial('alpha', { count: action.count ?? 0 }) }, Effect.none()];
  }
  if (action.type === 'marker') return [{ ...state, marker: state.marker + 1 }, Effect.none()];
  return [state, Effect.none()];
};

const cleanups: Array<() => void> = [];
const flush = async (): Promise<void> => {
  for (let i = 0; i < 24; i++) await Promise.resolve();
};
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  await flush();
});

function controlledDismiss() {
  const gates: Array<() => void> = [];
  const dismiss = managedDismissDependency(() => new Promise<void>((resolve) => gates.push(resolve)));
  cleanups.push(() => { for (const release of gates) release(); });
  return { dismiss, gates };
}

function captureRefusal<A>(effect: EffectType<A>, refusals: unknown[]): EffectType<A> {
  if (effect._tag !== 'Run') throw new Error(`expected a Run requester, got ${effect._tag}`);
  return Effect.run<A>(async (dispatch, signal) => {
    try {
      await effect.execute(dispatch, signal);
    } catch (error) {
      refusals.push(error);
    }
  });
}

function expectRefusal(refusals: readonly unknown[]): void {
  expect(refusals).toHaveLength(1);
  expect(refusals[0]).toBeInstanceOf(TypeError);
  expect((refusals[0] as TypeError).message).toMatch(/no enclosing managed presentation|does not claim it/);
}

function definition(policy: ChildPolicy<State, Action, Occupant, DestinationAction, Deps> = {}) {
  return new ManagedIntegrationBuilder<State, Action, Deps>(reduce).with(slot, policy).build();
}

function observe(store: Store<State, Action>): Action[] {
  const result: Action[] = [];
  if (!store.subscribeToActions) throw new Error('expected action observation');
  const stop = store.subscribeToActions((action) => result.push(action));
  cleanups.push(stop);
  return result;
}

const alpha = (action: ChildAction): Action => slot.case('alpha').wrap(action);
const beta = (action: ChildAction): Action => slot.case('beta').wrap(action);
const dismissed: Action = { type: 'destination', action: { type: 'dismiss' } };

describe('managed destination dismiss request policy', () => {
  it('claims a live case request at the destination field and maps ordinary actions exactly once', async () => {
    const composition = definition();
    const store = createStore({
      initialState: { destination: Destination.initial('alpha', { count: 0 }), marker: 0 },
      ...composition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());
    const notified = observe(store);

    store.dispatch(alpha({ type: 'load' }));
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('alpha', { count: 1 }));
    expect(store.history).toEqual([alpha({ type: 'load' }), alpha({ type: 'loaded' })]);

    store.dispatch(alpha({ type: 'close' }));
    await flush();
    expect(store.state.destination).toBeNull();
    expect(store.history).toEqual([
      alpha({ type: 'load' }),
      alpha({ type: 'loaded' }),
      alpha({ type: 'close' }),
      dismissed
    ]);
    expect(notified).toEqual(store.history);
    expect(notified.every((action) => typeof action.type === 'string')).toBe(true);
  });

  it('drops an old case request after a case change, while the current case can close', async () => {
    const controlled = controlledDismiss();
    const composition = definition();
    const store = createStore({
      initialState: { destination: Destination.initial('alpha', { count: 1 }), marker: 0 },
      ...composition,
      dependencies: { dismiss: controlled.dismiss }
    });
    cleanups.push(() => store.destroy());

    store.dispatch(alpha({ type: 'close' }));
    await flush();
    store.dispatch({ type: 'switchBeta', count: 7 });
    controlled.gates[0]!();
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('beta', { count: 7 }));
    expect(store.history).toEqual([alpha({ type: 'close' }), { type: 'switchBeta', count: 7 }]);

    store.dispatch(beta({ type: 'close' }));
    await flush();
    controlled.gates[1]!();
    await flush();
    expect(store.state.destination).toBeNull();
    expect(store.history.at(-1)).toEqual(dismissed);
  });

  it('drops an old same-case request only when replaceOn creates a new owner', async () => {
    const controlled = controlledDismiss();
    const composition = definition({ replaceOn: (action) => action.type === 'replaceAlpha' });
    const store = createStore({
      initialState: { destination: Destination.initial('alpha', { count: 1 }), marker: 0 },
      ...composition,
      dependencies: { dismiss: controlled.dismiss }
    });
    cleanups.push(() => store.destroy());

    store.dispatch(alpha({ type: 'close' }));
    await flush();
    store.dispatch({ type: 'replaceAlpha', count: 9 });
    controlled.gates[0]!();
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('alpha', { count: 9 }));

    store.dispatch(alpha({ type: 'close' }));
    await flush();
    controlled.gates[1]!();
    await flush();
    expect(store.state.destination).toBeNull();
  });

  it('keeps same-case overwrite in one owner when replaceOn declines replacement', async () => {
    const controlled = controlledDismiss();
    const composition = definition({ replaceOn: () => false });
    const store = createStore({
      initialState: { destination: Destination.initial('alpha', { count: 1 }), marker: 0 },
      ...composition,
      dependencies: { dismiss: controlled.dismiss }
    });
    cleanups.push(() => store.destroy());

    store.dispatch(alpha({ type: 'close' }));
    await flush();
    store.dispatch({ type: 'replaceAlpha', count: 11 });
    controlled.gates[0]!();
    await flush();

    expect(store.state.destination).toBeNull();
    expect(store.history).toEqual([
      alpha({ type: 'close' }),
      { type: 'replaceAlpha', count: 11 },
      dismissed
    ]);
  });

  it('drops an old onCreate request after a case change and lets the new case close', async () => {
    const controlled = controlledDismiss();
    const composition = definition({ onCreate: (_state, deps) => deps.dismiss() });
    const store = createStore({
      initialState: { destination: null, marker: 0 },
      ...composition,
      dependencies: { dismiss: controlled.dismiss }
    });
    cleanups.push(() => store.destroy());

    store.dispatch({ type: 'openAlpha', count: 1 });
    await flush();
    store.dispatch({ type: 'switchBeta', count: 8 });
    await flush();
    controlled.gates[0]!();
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('beta', { count: 8 }));
    controlled.gates[1]!();
    await flush();
    expect(store.state.destination).toBeNull();
  });

  it('binds onCreate across same-case replacement and maps ordinary onCreate once', async () => {
    const controlled = controlledDismiss();
    const dismissing = definition({
      replaceOn: (action) => action.type === 'replaceAlpha',
      onCreate: (_state, deps) => deps.dismiss()
    });
    const store = createStore({
      initialState: { destination: null, marker: 0 },
      ...dismissing,
      dependencies: { dismiss: controlled.dismiss }
    });
    cleanups.push(() => store.destroy());

    store.dispatch({ type: 'openAlpha', count: 1 });
    await flush();
    store.dispatch({ type: 'replaceAlpha', count: 2 });
    await flush();
    controlled.gates[0]!();
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('alpha', { count: 2 }));
    controlled.gates[1]!();
    await flush();
    expect(store.state.destination).toBeNull();

    const ordinary = definition({
      onCreate: (occupant) => Effect.run<DestinationAction>((dispatch) =>
        dispatch({ type: occupant.type, action: { type: 'ready' } })
      )
    });
    const ordinaryStore = createStore({
      initialState: { destination: null, marker: 0 },
      ...ordinary,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => ordinaryStore.destroy());
    ordinaryStore.dispatch({ type: 'openAlpha', count: 3 });
    await flush();
    expect(ordinaryStore.state.destination).toEqual(Destination.initial('alpha', { count: 4 }));
    expect(ordinaryStore.history).toEqual([{ type: 'openAlpha', count: 3 }, alpha({ type: 'ready' })]);
  });

  it('keeps startup as one ordinary case action without request authority', async () => {
    const composition = definition({
      startup: (occupant) => ({ type: occupant.type, action: { type: 'ready' } })
    });
    const store = createStore({
      initialState: { destination: null, marker: 0 },
      ...composition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    store.dispatch({ type: 'openAlpha', count: 5 });
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('alpha', { count: 6 }));
    expect(store.history).toEqual([{ type: 'openAlpha', count: 5 }, alpha({ type: 'ready' })]);
  });

  it('claims at the nearest nested destination and leaves the outer optional owner live', async () => {
    type Root = { panel: State | null };
    type RootAction = { type: 'panel'; action: PresentationAction<Action> };
    const panel = optionalSlot<Root, RootAction>()('panel');
    const inside = definition({ onCreate: (_state, deps) => deps.dismiss() });
    const outer = new ManagedIntegrationBuilder<Root, RootAction, Deps>((state) => [state, Effect.none()])
      .with(panel, inside)
      .build();
    const store = createStore({
      initialState: { panel: { destination: null, marker: 0 } } satisfies Root,
      ...outer,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    outer.bind(store, panel)?.dispatch({ type: 'openAlpha', count: 2 });
    await flush();
    expect(store.state).toEqual({ panel: { destination: null, marker: 0 } });
    outer.bind(store, panel)?.dispatch({ type: 'marker' });
    expect(store.state.panel?.marker).toBe(1);
  });

  it('claims inside a keyed row and leaves the row owner live', async () => {
    type List = { rows: Array<{ id: number; state: State }> };
    type ListAction = { type: 'rows'; id: number; action: Action };
    const rows = keyedSlot<List, ListAction>()('rows');
    const inside = definition({ onCreate: (_state, deps) => deps.dismiss() });
    const outer = new ManagedIntegrationBuilder<List, ListAction, Deps>((state) => [state, Effect.none()])
      .forEach(rows, inside)
      .build();
    const store = createStore({
      initialState: { rows: [{ id: 1, state: { destination: null, marker: 0 } }] },
      ...outer,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    outer.bind(store, rows.at(1))?.dispatch({ type: 'openAlpha', count: 4 });
    await flush();
    expect(store.state.rows[0]?.state).toEqual({ destination: null, marker: 0 });
    outer.bind(store, rows.at(1))?.dispatch({ type: 'marker' });
    expect(store.state.rows[0]?.state.marker).toBe(1);
  });

  it('fails closed at a raw root and at a public map without exposing a request', async () => {
    const initial = Destination.initial('alpha', { count: 0 });
    const action: DestinationAction = { type: 'alpha', action: { type: 'close' } };
    const dependencies: Deps = { dismiss: managedDismissDependency() };
    const rawReceived: unknown[] = [];

    const [, rawEffect] = Destination.reducer(initial, action, dependencies);
    if (rawEffect._tag !== 'Run') throw new Error(`expected a Run requester, got ${rawEffect._tag}`);
    await expect(rawEffect.execute((value) => rawReceived.push(value))).rejects.toThrow(/no enclosing managed presentation/);
    expect(rawReceived).toEqual([]);

    const [, innerEffect] = Destination.reducer(initial, action, dependencies);
    const mapperCalls: unknown[] = [];
    const publicEffect = Effect.map(innerEffect, (value) => {
      mapperCalls.push(value);
      return value;
    });
    if (publicEffect._tag !== 'Run') throw new Error(`expected a Run requester, got ${publicEffect._tag}`);
    await expect(publicEffect.execute((value) => rawReceived.push(value))).rejects.toThrow(/does not claim it/);
    expect(mapperCalls).toEqual([]);
    expect(rawReceived).toEqual([]);
  });

  it('matches keyed rejection state and refusal under production and TestStore', async () => {
    type Row = { value: number };
    type RowAction = { type: 'close' };
    type List = { rows: Array<{ id: number; state: Row }> };
    type ListAction = { type: 'rows'; id: number; action: RowAction };
    const rows = keyedSlot<List, ListAction>()('rows');

    for (const adapter of ['production', 'test'] as const) {
      const refusals: unknown[] = [];
      const row: Reducer<Row, RowAction, Deps> = (state, _action, deps) =>
        [state, captureRefusal(deps.dismiss(), refusals)];
      const composition = new ManagedIntegrationBuilder<List, ListAction, Deps>((state) => [state, Effect.none()])
        .forEach(rows, row)
        .build();
      const initialState: List = { rows: [{ id: 1, state: { value: 3 } }] };
      const config = { initialState, ...composition, dependencies: { dismiss: managedDismissDependency() } };
      const store = adapter === 'production' ? createStore(config) : new TestStore(config);
      cleanups.push(() => store.destroy());

      store.dispatch({ type: 'rows', id: 1, action: { type: 'close' } });
      await flush();
      expectRefusal(refusals);
      expect(store.state).toEqual(initialState);
    }
  });

  for (const adapter of ['production', 'test'] as const) {
    it(`${adapter} store has the same live and stale destination transcript`, async () => {
      const controlled = controlledDismiss();
      const composition = definition();
      const seen: Action[] = [];
      const parityComposition = new ManagedIntegrationBuilder<State, Action, Deps>((state, action) => {
        seen.push(action);
        return reduce(state, action, { dismiss: controlled.dismiss });
      }).with(slot).build();
      const config = {
        initialState: { destination: Destination.initial('alpha', { count: 0 }), marker: 0 } satisfies State,
        ...parityComposition,
        dependencies: { dismiss: controlled.dismiss }
      };
      const store = adapter === 'production' ? createStore(config) : new TestStore(config);
      cleanups.push(() => store.destroy());

      store.dispatch(alpha({ type: 'close' }));
      await flush();
      store.dispatch({ type: 'switchBeta', count: 4 });
      controlled.gates[0]!();
      await flush();
      expect(store.state.destination).toEqual(Destination.initial('beta', { count: 4 }));

      store.dispatch(beta({ type: 'close' }));
      await flush();
      controlled.gates[1]!();
      await flush();
      expect(store.state.destination).toBeNull();
      expect(seen).toEqual([
        alpha({ type: 'close' }),
        { type: 'switchBeta', count: 4 },
        beta({ type: 'close' }),
        dismissed
      ]);
    });
  }
});
