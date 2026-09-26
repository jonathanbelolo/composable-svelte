/**
 * `observeChildActions` / `isManagedChildView` from `@composable-svelte/core/application`.
 *
 * Imported through the application entry's source module so the views below and
 * the registry share one module graph. The built declarations are pinned
 * separately by `application-public-managed-types.emitted.types.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { createStore } from '../src/lib/store.svelte.js';
import { Effect } from '../src/lib/effect.js';
import {
  ManagedIntegrationBuilder,
  destinationSlot,
  isManagedChildView,
  keyedSlot,
  nestedSlot,
  observeChildActions,
  optionalSlot,
  type ApplicationInstance,
  type ChildView
} from '../src/lib/application/index.js';
import { createDestination } from '../src/lib/navigation/destination.js';
import { TurnQueue } from '../src/lib/execution/turn-queue.js';
import type { Reducer } from '../src/lib/types.js';
import type { PresentationAction } from '../src/lib/navigation/types.js';
import Fixture from './fixtures/ApplicationNested.svelte';
import type { Root as AppRoot, Action as AppAction, Leaf, LeafAction } from './fixtures/ApplicationNestedModel.js';

type Cmd =
  | { type: 'poke'; n: number }
  | { type: 'burst'; ns: number[] }
  | { type: 'bump' }
  | { type: 'restart' };
interface Row { hits: number; generation: number }

interface Root {
  rows: Array<{ id: string; state: Row }>;
  panel: Row | null;
}
type RootAction =
  | { type: 'rows'; id: string; action: Cmd }
  | { type: 'panel'; action: PresentationAction<Cmd> }
  | { type: 'replace'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'openPanel' }
  | { type: 'closePanel' };

const rows = keyedSlot<Root, RootAction>()('rows');
const panel = optionalSlot<Root, RootAction>()('panel');

/** `poke` preserves state (a pure command marker); `bump` changes it; `burst` re-dispatches. */
const child: Reducer<Row, Cmd> = (state, action) => {
  switch (action.type) {
    case 'poke':
      return [state, Effect.none()];
    case 'bump':
      return [{ ...state, hits: state.hits + 1 }, Effect.none()];
    case 'burst':
      return [state, Effect.run<Cmd>((dispatch) => action.ns.forEach((n) => dispatch({ type: 'poke', n })))];
    case 'restart':
      return [{ hits: 0, generation: state.generation + 1 }, Effect.none()];
  }
};

const root: Reducer<Root, RootAction> = (state, action) => {
  switch (action.type) {
    case 'replace':
      return [{ ...state, rows: state.rows.map((row) => (row.id === action.id ? { id: row.id, state: { hits: 0, generation: row.state.generation + 1 } } : row)) }, Effect.none()];
    case 'remove':
      return [{ ...state, rows: state.rows.filter((row) => row.id !== action.id) }, Effect.none()];
    case 'openPanel':
      return [{ ...state, panel: { hits: 0, generation: 0 } }, Effect.none()];
    case 'closePanel':
      return [{ ...state, panel: null }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

const composition = new ManagedIntegrationBuilder<Root, RootAction, undefined>(root)
  .forEach(rows, child, {
    replaceOn: (action, id) =>
      (action.type === 'replace' && action.id === id) ||
      (action.type === 'rows' && action.id === id && action.action.type === 'restart')
  })
  .with(panel, child)
  .build();

const stores: Array<{ destroy(): void }> = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.destroy();
  vi.restoreAllMocks();
});

function setup() {
  const store = createStore({
    initialState: {
      rows: [
        { id: 'a', state: { hits: 0, generation: 0 } },
        { id: 'b', state: { hits: 0, generation: 0 } }
      ],
      panel: null
    } satisfies Root,
    ...composition
  });
  stores.push(store);
  const bind = (id: string) => composition.bind(store, rows.at(id))!;
  return { store, bind };
}

const poke = (id: string, n: number): RootAction => ({ type: 'rows', id, action: { type: 'poke', n } });

describe('observeChildActions', () => {
  it('delivers only the captured owner’s actions, unwrapped to the child domain, including state-preserving ones', () => {
    const { store, bind } = setup();
    const a: Cmd[] = [];
    const b: Cmd[] = [];
    observeChildActions(bind('a'), (action) => a.push(action));
    observeChildActions(bind('b'), (action) => b.push(action));
    store.dispatch(poke('a', 1));
    store.dispatch(poke('b', 2));
    store.dispatch(poke('a', 1));
    store.dispatch({ type: 'openPanel' });
    expect(a).toEqual([{ type: 'poke', n: 1 }, { type: 'poke', n: 1 }]);
    expect(b).toEqual([{ type: 'poke', n: 2 }]);
  });

  it('view.dispatch and root dispatch reach the same owner; the listener sees the committed turn state', () => {
    const { store, bind } = setup();
    const view = bind('a');
    const seen: Array<[string, number | undefined]> = [];
    observeChildActions(view, (action) => seen.push([action.type, view.state?.hits]));
    view.dispatch({ type: 'bump' });
    store.dispatch({ type: 'rows', id: 'a', action: { type: 'bump' } });
    expect(seen).toEqual([['bump', 1], ['bump', 2]]);
  });

  it('optional slot: presented actions are delivered unwrapped; dismiss is not a child action', () => {
    const { store } = setup();
    store.dispatch({ type: 'openPanel' });
    const view = composition.bind(store, panel)!;
    const seen: Cmd[] = [];
    observeChildActions(view, (action) => seen.push(action));
    view.dispatch({ type: 'poke', n: 7 });
    view.dismiss();
    view.dispatch({ type: 'poke', n: 8 });
    expect(store.state.panel).toBeNull();
    expect(seen).toEqual([{ type: 'poke', n: 7 }]);
  });

  it('destination case and nested slot: each owner sees exactly its own action type', () => {
    type Leaf = { n: number };
    type LeafAction = { type: 'set'; n: number };
    const leaf: Reducer<Leaf, LeafAction> = (s, a) => [{ n: a.n }, Effect.none()];
    const Destination = createDestination({ first: leaf, second: leaf });
    type DState = { type: 'first'; state: Leaf } | { type: 'second'; state: Leaf };
    type DAction = { type: 'first'; action: LeafAction } | { type: 'second'; action: LeafAction };
    type Inner = { sheet: Leaf | null };
    type InnerAction = { type: 'sheet'; action: PresentationAction<LeafAction> };
    type Outer = { dest: DState | null; inner: Inner | null };
    type OuterAction =
      | { type: 'dest'; action: PresentationAction<DAction> }
      | { type: 'inner'; action: PresentationAction<InnerAction> };
    const dest = destinationSlot<Outer, OuterAction>()('dest', Destination);
    const innerSlot = optionalSlot<Outer, OuterAction>()('inner');
    const sheet = optionalSlot<Inner, InnerAction>()('sheet');
    const innerComposition = new ManagedIntegrationBuilder<Inner, InnerAction, undefined>((s) => [s, Effect.none()])
      .with(sheet, leaf)
      .build();
    const outer = new ManagedIntegrationBuilder<Outer, OuterAction, undefined>((s) => [s, Effect.none()])
      .with(dest)
      .with(innerSlot, innerComposition)
      .build();
    const store = createStore({
      initialState: { dest: { type: 'first', state: { n: 0 } }, inner: { sheet: { n: 0 } } } as Outer,
      ...outer
    });
    stores.push(store);

    const firstCase = outer.bind(store, dest.case('first'))!;
    const innerView = outer.bind(store, innerSlot)!;
    const nested = outer.bind(store, nestedSlot(innerSlot, sheet))!;
    const caseSeen: unknown[] = [];
    const innerSeen: unknown[] = [];
    const nestedSeen: unknown[] = [];
    observeChildActions(firstCase, (action) => caseSeen.push(action));
    observeChildActions(innerView, (action) => innerSeen.push(action));
    observeChildActions(nested, (action) => nestedSeen.push(action));
    for (const view of [firstCase, innerView, nested]) expect(isManagedChildView(view)).toBe(true);

    firstCase.dispatch({ type: 'set', n: 1 });
    // A mismatched case is routed to the destination field but not to the 'first' owner.
    store.dispatch({ type: 'dest', action: { type: 'presented', action: { type: 'second', action: { type: 'set', n: 2 } } } });
    nested.dispatch({ type: 'set', n: 3 });

    expect(caseSeen).toEqual([{ type: 'set', n: 1 }]);
    // The outer owner sees its own domain (the wrapped inner action); the nested owner the leaf.
    expect(innerSeen).toEqual([{ type: 'sheet', action: { type: 'presented', action: { type: 'set', n: 3 } } }]);
    expect(nestedSeen).toEqual([{ type: 'set', n: 3 }]);
  });

  it('an observer attached during a nested turn starts with the next turn', () => {
    type Leaf = { n: number };
    type LeafAction = { type: 'set'; n: number };
    type Inner = { sheet: Leaf | null };
    type InnerAction = { type: 'sheet'; action: PresentationAction<LeafAction> };
    type Outer = { inner: Inner | null };
    type OuterAction = { type: 'inner'; action: PresentationAction<InnerAction> };
    const innerSlot = optionalSlot<Outer, OuterAction>()('inner');
    const sheet = optionalSlot<Inner, InnerAction>()('sheet');
    const innerReducer: Reducer<Inner, InnerAction> = (s) => [s, Effect.none()];
    const leafReducer: Reducer<Leaf, LeafAction> = (_, a) => [{ n: a.n }, Effect.none()];
    const innerComposition = new ManagedIntegrationBuilder<Inner, InnerAction, undefined>(innerReducer)
      .with(sheet, leafReducer)
      .build();
    const outer = new ManagedIntegrationBuilder<Outer, OuterAction, undefined>((s) => [s, Effect.none()])
      .with(innerSlot, innerComposition)
      .build();
    const store = createStore({ initialState: { inner: { sheet: { n: 0 } } } as Outer, ...outer });
    stores.push(store);
    const inner = outer.bind(store, innerSlot)!;
    const nested = outer.bind(store, nestedSlot(innerSlot, sheet))!;
    const seen: LeafAction[] = [];
    observeChildActions(inner, () => observeChildActions(nested, (action) => seen.push(action)));

    nested.dispatch({ type: 'set', n: 1 });
    expect(seen).toEqual([]);
    nested.dispatch({ type: 'set', n: 2 });
    expect(seen).toEqual([{ type: 'set', n: 2 }]);
  });

  it('an observer attached by a root action subscriber starts with the next turn', () => {
    const { store, bind } = setup();
    const view = bind('a');
    const seen: Cmd[] = [];
    let stop: (() => void) | undefined;
    store.subscribeToActions?.(() => {
      stop ??= observeChildActions(view, (action) => seen.push(action));
    });

    store.dispatch(poke('a', 1));
    expect(seen).toEqual([]);
    store.dispatch(poke('a', 2));
    expect(seen).toEqual([{ type: 'poke', n: 2 }]);
    stop?.();
  });

  it('an observer attached by a state subscriber starts with the next turn', () => {
    const { store, bind } = setup();
    const view = bind('a');
    const seen: Cmd[] = [];
    let stop: (() => void) | undefined;
    store.subscribe((state) => {
      if (state.rows[0]?.state.hits === 1) {
        stop ??= observeChildActions(view, (action) => seen.push(action));
      }
    });

    view.dispatch({ type: 'bump' });
    expect(seen).toEqual([]);
    view.dispatch({ type: 'poke', n: 2 });
    expect(seen).toEqual([{ type: 'poke', n: 2 }]);
    stop?.();
  });

  it('reentrant turn order: effect follow-ups and listener dispatches are later turns, in FIFO order', () => {
    const { store, bind } = setup();
    const view = bind('a');
    const order: string[] = [];
    let injected = false;
    observeChildActions(view, (action) => {
      order.push(action.type === 'poke' ? `poke:${action.n}` : action.type);
      if (!injected && action.type === 'poke' && action.n === 1) {
        injected = true;
        view.dispatch({ type: 'poke', n: 99 });
      }
    });
    store.dispatch({ type: 'rows', id: 'a', action: { type: 'burst', ns: [1, 2, 3] } });
    // burst's effect enqueues 1,2,3 before any is reduced; 99 is enqueued while 1 is delivered.
    expect(order).toEqual(['burst', 'poke:1', 'poke:2', 'poke:3', 'poke:99']);
  });

  it('same-ID replacement: the predecessor’s observer stops; the successor’s actions never reach it', () => {
    const { store, bind } = setup();
    const first = bind('a');
    const old: Cmd[] = [];
    observeChildActions(first, (action) => old.push(action));
    store.dispatch(poke('a', 1));
    store.dispatch({ type: 'replace', id: 'a' });
    expect(first.state).toBeUndefined();
    const successor = bind('a');
    expect(successor).not.toBe(first);
    const fresh: Cmd[] = [];
    observeChildActions(successor, (action) => fresh.push(action));
    successor.dispatch({ type: 'poke', n: 2 });
    store.dispatch(poke('a', 3));
    // A late dispatch through the retired view is refused by core and delivered nowhere.
    first.dispatch({ type: 'poke', n: 4 });
    expect(old).toEqual([{ type: 'poke', n: 1 }]);
    expect(fresh).toEqual([{ type: 'poke', n: 2 }, { type: 'poke', n: 3 }]);
  });

  it('a child action that replaces its own owner reaches neither the retired owner nor the successor', () => {
    const { store, bind } = setup();
    const first = bind('a');
    const old: Cmd[] = [];
    observeChildActions(first, (action) => old.push(action));
    store.dispatch({ type: 'rows', id: 'a', action: { type: 'restart' } });
    expect(first.state).toBeUndefined();
    expect(old).toEqual([]);
    const successor = bind('a');
    const fresh: Cmd[] = [];
    observeChildActions(successor, (action) => fresh.push(action));
    successor.dispatch({ type: 'poke', n: 1 });
    expect(fresh).toEqual([{ type: 'poke', n: 1 }]);
    expect(old).toEqual([]);
  });

  it('same drain: command, replacement, command — each lands on the owner that reduced it', () => {
    const { store, bind } = setup();
    const first = bind('a');
    const old: Cmd[] = [];
    observeChildActions(first, (action) => old.push(action));
    let queued = false;
    // Enqueue all three from inside one delivery so they share a drain.
    observeChildActions(bind('b'), () => {
      if (queued) return;
      queued = true;
      store.dispatch(poke('a', 1));
      store.dispatch({ type: 'replace', id: 'a' });
      store.dispatch(poke('a', 2));
    });
    store.dispatch(poke('b', 0));
    expect(old).toEqual([{ type: 'poke', n: 1 }]);
    expect(store.state.rows.find((row) => row.id === 'a')?.state.generation).toBe(1);
  });

  it('retirement is silent: removal stops delivery without a terminal call, and so does unsubscribe', () => {
    const { store, bind } = setup();
    const a = bind('a');
    const seen: Cmd[] = [];
    observeChildActions(a, (action) => seen.push(action));
    const bSeen: Cmd[] = [];
    const stopB = observeChildActions(bind('b'), (action) => bSeen.push(action));
    store.dispatch({ type: 'remove', id: 'a' });
    a.dispatch({ type: 'poke', n: 1 });
    stopB();
    store.dispatch(poke('b', 2));
    expect(seen).toEqual([]);
    expect(bSeen).toEqual([]);
    // Observing a retired view is an inert no-op.
    const late: Cmd[] = [];
    observeChildActions(a, (action) => late.push(action))();
    expect(late).toEqual([]);
  });

  it('pre-attachment is a drop: nothing dispatched before the listener exists is replayed', () => {
    const { store, bind } = setup();
    const view = bind('a');
    store.dispatch(poke('a', 1));
    view.dispatch({ type: 'poke', n: 2 });
    const seen: Cmd[] = [];
    observeChildActions(view, (action) => seen.push(action));
    expect(seen).toEqual([]);
    store.dispatch(poke('a', 3));
    expect(seen).toEqual([{ type: 'poke', n: 3 }]);
  });

  it('a throwing listener is reported and does not block other owners or later turns', () => {
    const { store, bind } = setup();
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args);
    try {
      observeChildActions(bind('a'), () => {
        throw new Error('listener failed');
      });
      const b: Cmd[] = [];
      observeChildActions(bind('b'), (action) => b.push(action));
      store.dispatch(poke('a', 1));
      store.dispatch(poke('b', 2));
      expect(b).toEqual([{ type: 'poke', n: 2 }]);
      expect(errors).toHaveLength(1);
    } finally {
      console.error = original;
    }
  });

  it('delivers after child state and root action subscribers in the same turn', () => {
    const { store, bind } = setup();
    const view = bind('a');
    const order: string[] = [];
    view.subscribe((state) => order.push(`state:${state?.hits}`));
    store.subscribeToActions?.(() => order.push('rootAction'));
    observeChildActions(view, (action) => order.push(`delivery:${action.type}:${view.state?.hits}`));
    order.length = 0;
    view.dispatch({ type: 'bump' });
    expect(order).toEqual(['state:1', 'rootAction', 'delivery:bump:1']);
  });

  it('removes delivery listeners when their owner retires or they unsubscribe', () => {
    let live = 0;
    const original = TurnQueue.prototype.subscribeOwnerDeliveries;
    vi.spyOn(TurnQueue.prototype, 'subscribeOwnerDeliveries').mockImplementation(function (this: TurnQueue<unknown, unknown>, listener) {
      live += 1;
      const stop = original.call(this, listener);
      let stopped = false;
      return () => {
        if (!stopped) {
          stopped = true;
          live -= 1;
        }
        stop();
      };
    });
    const { store, bind } = setup();
    observeChildActions(bind('a'), () => {});
    const stopB = observeChildActions(bind('b'), () => {});
    expect(live).toBe(2);
    store.dispatch({ type: 'replace', id: 'a' });
    expect(live).toBe(1);
    stopB();
    expect(live).toBe(0);
  });

  it('isolates a throwing listener from another listener in the same delivery', () => {
    const { store, bind } = setup();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = bind('a');
    const seen: Cmd[] = [];
    observeChildActions(view, () => { throw new Error('listener failed'); });
    observeChildActions(view, (action) => seen.push(action));
    store.dispatch(poke('a', 1));
    expect(seen).toEqual([{ type: 'poke', n: 1 }]);
    expect(errors).toHaveBeenCalledTimes(1);
  });
});

describe('isManagedChildView', () => {
  it('recognizes keyed and optional views (destination case and nested: above)', () => {
    const { store, bind } = setup();
    store.dispatch({ type: 'openPanel' });
    expect(isManagedChildView(bind('a'))).toBe(true);
    expect(isManagedChildView(composition.bind(store, panel))).toBe(true);
  });

  it('recognizes a retired view (removal and same-ID replacement); observing it is an inert, callable no-op', () => {
    const { store, bind } = setup();
    const removed = bind('a');
    const replaced = bind('b');
    store.dispatch({ type: 'remove', id: 'a' });
    store.dispatch({ type: 'replace', id: 'b' });
    const subscribed = vi.spyOn(TurnQueue.prototype, 'subscribeOwnerDeliveries');
    const seen: Cmd[] = [];
    for (const view of [removed, replaced]) {
      expect(view.state).toBeUndefined();
      expect(isManagedChildView(view)).toBe(true);
      const stop = observeChildActions(view, (action) => seen.push(action));
      expect(stop).toBeTypeOf('function');
      view.dispatch({ type: 'poke', n: 1 });
      expect(() => stop()).not.toThrow();
    }
    store.dispatch(poke('b', 2));
    expect(seen).toEqual([]);
    // Inert means no delivery subscription at all, not one that happens never to match.
    expect(subscribed).not.toHaveBeenCalled();
  });

  it('recognizes a view whose root was destroyed; observing it is an inert, callable no-op', () => {
    const { store, bind } = setup();
    const view = bind('a');
    const live: Cmd[] = [];
    observeChildActions(view, (action) => live.push(action));
    store.destroy();
    expect(isManagedChildView(view)).toBe(true);
    const subscribed = vi.spyOn(TurnQueue.prototype, 'subscribeOwnerDeliveries');
    const late: Cmd[] = [];
    const stop = observeChildActions(view, (action) => late.push(action));
    view.dispatch({ type: 'poke', n: 1 });
    expect(() => stop()).not.toThrow();
    expect(live).toEqual([]);
    expect(late).toEqual([]);
    expect(subscribed).not.toHaveBeenCalled();
  });

  it('recognizes FeatureViewProps/scopeTo views, not the ApplicationStore, including after the root unmounts', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const views: (ChildView<Leaf, LeafAction> | undefined)[] = [];
    let app!: ApplicationInstance<AppRoot, AppAction>;
    const component = mount(Fixture, {
      target,
      props: { dependencies: { step: 1, trace: [] }, onApp: (value) => (app = value), onView: (view) => views.push(view) }
    });
    await tick();
    const view = views.at(-1)!;
    const seen: LeafAction[] = [];
    observeChildActions(view, (action) => seen.push(action));
    view.dispatch({ type: 'increment' });
    expect(seen).toEqual([{ type: 'increment' }]);
    expect(isManagedChildView(view)).toBe(true);
    expect(isManagedChildView(app.store)).toBe(false);
    expect(() => observeChildActions(app.store as unknown as ChildView<AppRoot, AppAction>, () => {})).toThrow(TypeError);
    await unmount(component);
    target.remove();
    expect(isManagedChildView(view)).toBe(true);
    expect(() => observeChildActions(view, () => {})()).not.toThrow();
  });

  it('never recognizes structural wrappers, root stores or non-objects', () => {
    const { store, bind } = setup();
    const view = bind('a');
    const legacy = createStore({ initialState: { hits: 0, generation: 0 } satisfies Row, reducer: child });
    stores.push(legacy);
    const imitation: ChildView<Row, Cmd> = {
      get state() { return view.state; },
      dispatch: (action) => view.dispatch(action),
      select: (selector) => view.select(selector),
      subscribe: (listener) => view.subscribe(listener)
    };
    const candidates: unknown[] = [
      { ...view }, Object.create(view), new Proxy(view, {}), Object.freeze({ ...view }), imitation,
      store, legacy, null, undefined, 0, 'view', () => view
    ];
    for (const candidate of candidates) expect(isManagedChildView(candidate)).toBe(false);
  });
});

describe('observeChildActions unsupported input', () => {
  it('rejects a wrapper or a standalone store with an actionable TypeError', () => {
    const { store, bind } = setup();
    const legacy = createStore({ initialState: { hits: 0, generation: 0 } satisfies Row, reducer: child });
    stores.push(legacy);
    // A standalone Store is structurally assignable to ChildView, so only the runtime check refuses it.
    for (const input of [{ ...bind('a') }, new Proxy(bind('a'), {}), legacy, store as unknown as ChildView<Row, Cmd>]) {
      expect(() => observeChildActions(input as ChildView<Row, Cmd>, () => {})).toThrow(TypeError);
    }
    expect(() => observeChildActions(legacy, () => {})).toThrow(/isManagedChildView.*subscribeToActions/);
    expect(() => observeChildActions(legacy, () => {})).toThrow(/second copy of @composable-svelte\/core/);
    for (const input of [null, undefined, 1]) {
      expect(() => observeChildActions(input as unknown as ChildView<Row, Cmd>, () => {})).toThrow(TypeError);
    }
  });

  it('rejects a non-function listener without subscribing', () => {
    const { bind } = setup();
    expect(() => observeChildActions(bind('a'), undefined as unknown as (action: Cmd) => void)).toThrow(
      'observeChildActions: listener must be a function'
    );
  });
});
