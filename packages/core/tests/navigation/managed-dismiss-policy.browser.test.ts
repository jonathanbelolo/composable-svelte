/**
 * DEF-021 request policy R1: a managed optional slot claims a managed dismiss
 * request in its reduction lift and its own created-owner lift. Real managed
 * `createStore` execution and the real `managedDismissDependency` throughout:
 * no request is simulated and no private mint or claim helper is called.
 *
 * Keyed elements and dedicated destination cases stay rejecting boundaries;
 * destination construction uses the case-aware public slot path.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import {
  ManagedIntegrationBuilder,
  destinationSlot,
  optionalSlot,
  keyedSlot,
  nestedSlot,
  type ChildPolicy
} from '../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import { managedDismissDependency, type DismissDependency } from '../../src/lib/navigation/dismiss-dependency.js';
import type { Reducer, Store, Effect as EffectType } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';

interface Deps {
  readonly dismiss: DismissDependency;
}

/** Every store is destroyed and every controlled promise resolved, whatever a test asserted. */
const cleanups: (() => void)[] = [];
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  await flush();
});

/** A managed dismissal whose cleanup waits on a gate the test releases: one gate per dismissal. */
function controlledDismiss() {
  const gates: (() => void)[] = [];
  const dismiss = managedDismissDependency(
    () =>
      new Promise<void>((resolve) => {
        gates.push(resolve);
      })
  );
  cleanups.push(() => {
    for (const release of gates) release();
  });
  return { dismiss, gates };
}

/** The actions a store notified its action subscribers of, from now on. */
function observe<S, A>(store: Store<S, A>): A[] {
  const notified: A[] = [];
  if (!store.subscribeToActions) throw new Error('expected a store with action subscribers');
  const stop = store.subscribeToActions((action) => {
    notified.push(action);
  });
  cleanups.push(stop);
  return notified;
}

/** An ordinary action has a string type; a request has no prototype and no properties. */
const typed = (action: unknown): boolean => typeof (action as { type?: unknown } | null)?.type === 'string';

/**
 * Run the real requester with the dispatch its lift handed over, recording a
 * refusal instead of leaving it to the runtime's console report. The dispatch is
 * forwarded as it is: a wrapper around it would not be a framework lift.
 */
function probe<A>(effect: EffectType<A>, refusals: unknown[]): EffectType<A> {
  if (effect._tag !== 'Run') throw new Error(`expected the requester to be a Run effect, got ${effect._tag}`);
  const { execute } = effect;
  return Effect.run<A>(async (dispatch, signal) => {
    try {
      await execute(dispatch, signal);
    } catch (error) {
      refusals.push(error);
    }
  });
}

function expectRejectingLift(refusals: readonly unknown[]): void {
  expect(refusals).toHaveLength(1);
  expect(refusals[0]).toBeInstanceOf(TypeError);
  expect((refusals[0] as TypeError).message).toMatch(/reached a lift that does not claim it/);
}

type Child = { count: number };
type ChildAction = { type: 'close' } | { type: 'increment' } | { type: 'load' } | { type: 'loaded' } | { type: 'ready' };
type State = { child: Child | null; peer: Child | null };
type Action =
  | { type: 'child'; action: PresentationAction<ChildAction> }
  | { type: 'peer'; action: PresentationAction<ChildAction> }
  | { type: 'open' }
  | { type: 'replace' };

const childSlot = optionalSlot<State, Action>()('child');
const peerSlot = optionalSlot<State, Action>()('peer');
const closeChild: Action = childSlot.wrap({ type: 'close' });
const childDismissed: Action = { type: 'child', action: { type: 'dismiss' } };

const child: Reducer<Child, ChildAction, Deps> = (state, action, deps) => {
  if (action.type === 'close') return [state, deps.dismiss()];
  if (action.type === 'load') return [state, Effect.run<ChildAction>((dispatch) => dispatch({ type: 'loaded' }))];
  return [{ count: state.count + 1 }, Effect.none()];
};

function workspace(
  initialState: State,
  dependencies: Deps,
  policy: ChildPolicy<State, Action, Child, ChildAction, Deps> = {}
) {
  const seen: Action[] = [];
  const core: Reducer<State, Action, Deps> = (state, action) => {
    seen.push(action);
    if (action.type === 'open' || action.type === 'replace') return [{ ...state, child: { count: 0 } }, Effect.none()];
    return [state, Effect.none()];
  };
  const definition = new ManagedIntegrationBuilder<State, Action, Deps>(core)
    .with(childSlot, child, policy)
    .with(peerSlot, child)
    .build();
  const store = createStore({ initialState, ...definition, dependencies });
  cleanups.push(() => store.destroy());
  return { store, definition, seen, notified: observe(store) };
}

describe('managed optional slot: claims a managed dismiss request', () => {
  it('closes only the presenting child, and no reducer, history or subscriber sees a request', async () => {
    const { store, definition, seen, notified } = workspace(
      { child: { count: 0 }, peer: { count: 10 } },
      { dismiss: managedDismissDependency() }
    );

    store.dispatch(closeChild);
    await flush();

    expect(store.state).toEqual({ child: null, peer: { count: 10 } });
    const expected: Action[] = [closeChild, childDismissed];
    expect(store.history).toEqual(expected);
    expect(seen).toEqual(expected);
    expect(notified).toEqual(expected);
    expect([...store.history, ...seen, ...notified].every(typed)).toBe(true);
    expect(definition.bind(store, childSlot)).toBeUndefined();

    definition.bind(store, peerSlot)?.dispatch({ type: 'increment' });
    expect(store.state.peer).toEqual({ count: 11 });
  });

  it('drops a dismissal whose child was replaced while its cleanup was pending', async () => {
    const controlled = controlledDismiss();
    const { store, definition, seen, notified } = workspace(
      { child: { count: 5 }, peer: null },
      { dismiss: controlled.dismiss },
      { replaceOn: (action) => action.type === 'replace' }
    );

    store.dispatch(closeChild);
    await flush();
    expect(controlled.gates).toHaveLength(1);
    expect(store.state.child).toEqual({ count: 5 });

    store.dispatch({ type: 'replace' });
    expect(store.state.child).toEqual({ count: 0 });
    controlled.gates[0]?.();
    await flush();

    // The old origin's dismissal is dropped: the replacement stays presented.
    expect(store.state.child).toEqual({ count: 0 });
    const expected: Action[] = [closeChild, { type: 'replace' }];
    expect(store.history).toEqual(expected);
    expect(seen).toEqual(expected);
    expect(notified).toEqual(expected);

    const current = definition.bind(store, childSlot);
    expect(current).toBeDefined();
    current?.dispatch({ type: 'increment' });
    expect(store.state.child).toEqual({ count: 1 });
  });

  it('binds an onCreate dismissal to the owner created at exactly the slot path', async () => {
    const controlled = controlledDismiss();
    const { store, seen, notified } = workspace(
      { child: null, peer: { count: 10 } },
      { dismiss: controlled.dismiss },
      { replaceOn: (action) => action.type === 'replace', onCreate: (_state, deps) => deps.dismiss() }
    );

    store.dispatch({ type: 'open' });
    await flush();
    expect(controlled.gates).toHaveLength(1);
    store.dispatch({ type: 'replace' });
    await flush();
    expect(controlled.gates).toHaveLength(2);

    // The replaced child's created-owner request must not close its replacement.
    controlled.gates[0]?.();
    await flush();
    expect(store.state.child).toEqual({ count: 0 });
    expect(store.history).toEqual([{ type: 'open' }, { type: 'replace' }]);

    // Live control: the replacement's own onCreate dismissal closes it, and only it.
    controlled.gates[1]?.();
    await flush();
    expect(store.state).toEqual({ child: null, peer: { count: 10 } });
    const expected: Action[] = [{ type: 'open' }, { type: 'replace' }, childDismissed];
    expect(store.history).toEqual(expected);
    expect(seen).toEqual(expected);
    expect(notified).toEqual(expected);
    expect([...store.history, ...seen, ...notified].every(typed)).toBe(true);
  });

  it('claims a nested dismissal at the innermost lift and leaves the outer presentation live', async () => {
    type Detail = { value: number };
    type DetailAction = { type: 'close' } | { type: 'ready' };
    type Panel = { detail: Detail | null; opened: number };
    type PanelAction = { type: 'detail'; action: PresentationAction<DetailAction> } | { type: 'openDetail' };
    type Root = { panel: Panel | null };
    type RootAction = { type: 'panel'; action: PresentationAction<PanelAction> };
    const detailSlot = optionalSlot<Panel, PanelAction>()('detail');
    const panelSlot = optionalSlot<Root, RootAction>()('panel');

    const detail: Reducer<Detail, DetailAction, Deps> = (state, action, deps) => {
      if (action.type === 'close') return [state, deps.dismiss()];
      return [{ value: state.value + 1 }, Effect.none()];
    };
    const panelCore: Reducer<Panel, PanelAction, Deps> = (state, action) => {
      if (action.type === 'openDetail') return [{ detail: { value: 0 }, opened: state.opened + 1 }, Effect.none()];
      return [state, Effect.none()];
    };
    const seen: RootAction[] = [];
    const rootCore: Reducer<Root, RootAction, Deps> = (state, action) => {
      seen.push(action);
      return [state, Effect.none()];
    };
    const inside = new ManagedIntegrationBuilder<Panel, PanelAction, Deps>(panelCore)
      .with(detailSlot, detail, { onCreate: () => Effect.run<DetailAction>((dispatch) => dispatch({ type: 'ready' })) })
      .build();
    const definition = new ManagedIntegrationBuilder<Root, RootAction, Deps>(rootCore).with(panelSlot, inside).build();
    const initialState: Root = { panel: { detail: { value: 0 }, opened: 0 } };
    const dependencies: Deps = { dismiss: managedDismissDependency() };
    const store = createStore({ initialState, ...definition, dependencies });
    cleanups.push(() => store.destroy());
    const notified = observe(store);

    const closeDetail = panelSlot.wrap(detailSlot.wrap({ type: 'close' }));
    const detailDismissed = panelSlot.wrap({ type: 'detail', action: { type: 'dismiss' } });

    definition.bind(store, nestedSlot(panelSlot, detailSlot))?.dispatch({ type: 'close' });
    await flush();
    expect(store.state).toEqual({ panel: { detail: null, opened: 0 } });

    // The outer panel is still presented and still acts. The new detail's onCreate
    // action maps through both created-owner lifts like any other action.
    definition.bind(store, panelSlot)?.dispatch({ type: 'openDetail' });
    await flush();
    expect(store.state).toEqual({ panel: { detail: { value: 1 }, opened: 1 } });

    definition.bind(store, nestedSlot(panelSlot, detailSlot))?.dispatch({ type: 'close' });
    await flush();
    expect(store.state).toEqual({ panel: { detail: null, opened: 1 } });

    const expected: RootAction[] = [
      closeDetail,
      detailDismissed,
      panelSlot.wrap({ type: 'openDetail' }),
      panelSlot.wrap(detailSlot.wrap({ type: 'ready' })),
      closeDetail,
      detailDismissed
    ];
    expect(store.history).toEqual(expected);
    expect(seen).toEqual(expected);
    expect(notified).toEqual(expected);
    expect([...store.history, ...seen, ...notified].every(typed)).toBe(true);
  });

  it('routes a nested onCreate dismissal through the rejecting outer lift as an ordinary inner action', async () => {
    type Detail = { value: number };
    type DetailAction = { type: 'bump' };
    type Panel = { detail: Detail | null; opened: number };
    type PanelAction = { type: 'detail'; action: PresentationAction<DetailAction> } | { type: 'openDetail' };
    type Root = { panel: Panel | null };
    type RootAction = { type: 'panel'; action: PresentationAction<PanelAction> };
    const detailSlot = optionalSlot<Panel, PanelAction>()('detail');
    const panelSlot = optionalSlot<Root, RootAction>()('panel');

    const detail: Reducer<Detail, DetailAction, Deps> = (state) => [
      { value: state.value + 1 },
      Effect.none()
    ];
    const panelCore: Reducer<Panel, PanelAction, Deps> = (state, action) =>
      action.type === 'openDetail'
        ? [{ detail: { value: 0 }, opened: state.opened + 1 }, Effect.none()]
        : [state, Effect.none()];
    const rootCore: Reducer<Root, RootAction, Deps> = (state) => [state, Effect.none()];
    const inside = new ManagedIntegrationBuilder<Panel, PanelAction, Deps>(panelCore)
      .with(detailSlot, detail, { onCreate: (_state, deps) => deps.dismiss() })
      .build();
    const definition = new ManagedIntegrationBuilder<Root, RootAction, Deps>(rootCore)
      .with(panelSlot, inside)
      .build();
    const store = createStore({
      initialState: { panel: { detail: null, opened: 0 } } satisfies Root,
      ...definition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());
    const notified = observe(store);

    definition.bind(store, panelSlot)?.dispatch({ type: 'openDetail' });
    await flush();

    const open = panelSlot.wrap({ type: 'openDetail' });
    const innerDismiss = panelSlot.wrap({ type: 'detail', action: { type: 'dismiss' } });
    expect(store.state).toEqual({ panel: { detail: null, opened: 1 } });
    expect(store.history).toEqual([open, innerDismiss]);
    expect(notified).toEqual([open, innerDismiss]);

    // The outer presentation remained live after carrying the claimed inner
    // dismissal through its rejecting lift as an ordinary wrapped action.
    definition.bind(store, panelSlot)?.dispatch({ type: 'openDetail' });
    await flush();
    expect(store.state).toEqual({ panel: { detail: null, opened: 2 } });
    expect(store.history).toEqual([open, innerDismiss, open, innerDismiss]);
    expect(notified).toEqual([open, innerDismiss, open, innerDismiss]);
  });
});

describe('request boundaries', () => {
  it('a managed keyed element fails closed at its lift, changing neither state nor history', async () => {
    type Row = { value: number };
    type RowAction = { type: 'close' } | { type: 'bump' };
    type List = { rows: { id: number; state: Row }[] };
    type ListAction = { type: 'rows'; id: number; action: RowAction };
    const rowsSlot = keyedSlot<List, ListAction>()('rows');
    const refusals: unknown[] = [];

    const row: Reducer<Row, RowAction, Deps> = (state, action, deps) => {
      if (action.type === 'close') return [state, probe<RowAction>(deps.dismiss(), refusals)];
      return [{ value: state.value + 1 }, Effect.none()];
    };
    const seen: ListAction[] = [];
    const core: Reducer<List, ListAction, Deps> = (state, action) => {
      seen.push(action);
      return [state, Effect.none()];
    };
    const definition = new ManagedIntegrationBuilder<List, ListAction, Deps>(core).forEach(rowsSlot, row).build();
    const initialState: List = { rows: [{ id: 1, state: { value: 0 } }, { id: 2, state: { value: 0 } }] };
    const dependencies: Deps = { dismiss: managedDismissDependency() };
    const store = createStore({ initialState, ...definition, dependencies });
    cleanups.push(() => store.destroy());
    const notified = observe(store);

    const closeRow: ListAction = { type: 'rows', id: 1, action: { type: 'close' } };
    store.dispatch(closeRow);
    await flush();

    expectRejectingLift(refusals);
    expect(store.state).toEqual(initialState);
    expect(store.history).toEqual([closeRow]);
    expect(seen).toEqual([closeRow]);
    expect(notified).toEqual([closeRow]);

    definition.bind(store, rowsSlot.at(1))?.dispatch({ type: 'bump' });
    expect(store.state.rows.map((item) => item.state.value)).toEqual([1, 0]);
  });

  it('a managed destination claims at its field while preserving ordinary case routing', async () => {
    type Doc = { title: string };
    type DocAction = { type: 'close' } | { type: 'rename'; title: string };
    const editor: Reducer<Doc, DocAction, Deps> = (state, action, deps) => {
      if (action.type === 'close') return [state, deps.dismiss()];
      return [{ title: action.title }, Effect.none()];
    };
    const Destination = createDestination({ editor });
    type Sheet = typeof Destination._types.State;
    type SheetAction = typeof Destination._types.Action;
    type Shell = { destination: Sheet | null };
    type ShellAction = { type: 'destination'; action: PresentationAction<SheetAction> };
    const destination = destinationSlot<Shell, ShellAction>()('destination', Destination);

    const seen: ShellAction[] = [];
    const core: Reducer<Shell, ShellAction, Deps> = (state, action) => {
      seen.push(action);
      return [state, Effect.none()];
    };
    const definition = new ManagedIntegrationBuilder<Shell, ShellAction, Deps>(core)
      .with(destination)
      .build();
    const initialState: Shell = { destination: Destination.initial('editor', { title: 'draft' }) };
    const dependencies: Deps = { dismiss: managedDismissDependency() };
    const store = createStore({ initialState, ...definition, dependencies });
    cleanups.push(() => store.destroy());
    const notified = observe(store);

    const closeEditor = destination.case('editor').wrap({ type: 'close' });
    store.dispatch(closeEditor);
    await flush();

    const fieldDismissed: ShellAction = { type: 'destination', action: { type: 'dismiss' } };
    expect(store.state.destination).toBeNull();
    expect(store.history).toEqual([closeEditor, fieldDismissed]);
    expect(seen).toEqual([closeEditor, fieldDismissed]);
    expect(notified).toEqual([closeEditor, fieldDismissed]);
  });
});

describe('ordinary optional-child actions under the claim policy', () => {
  it('map exactly once, from reduction effects and from onCreate effects', async () => {
    const { store, seen, notified } = workspace(
      { child: null, peer: null },
      { dismiss: managedDismissDependency() },
      { onCreate: () => Effect.run<ChildAction>((dispatch) => dispatch({ type: 'ready' })) }
    );

    store.dispatch({ type: 'open' });
    await flush();
    store.dispatch(childSlot.wrap({ type: 'load' }));
    await flush();

    expect(store.state).toEqual({ child: { count: 2 }, peer: null });
    const expected: Action[] = [
      { type: 'open' },
      childSlot.wrap({ type: 'ready' }),
      childSlot.wrap({ type: 'load' }),
      childSlot.wrap({ type: 'loaded' })
    ];
    expect(store.history).toEqual(expected);
    expect(seen).toEqual(expected);
    expect(notified).toEqual(expected);
  });
});
