import { describe, it, expect } from 'vitest';
import { integrate } from '../src/lib/navigation/integrate.js';
import { destinationSlot, keyedSlot, nestedSlot } from '../src/lib/navigation/managed-integration.js';
import { createStore } from '../src/lib/store.svelte.js';
import { Effect } from '../src/lib/effect.js';
import type { Reducer, Dispatch, Effect as EffectType } from '../src/lib/types.js';
import type { IdentifiedItem } from '../src/lib/composition/for-each.js';
import { scope, scopeAction } from '../src/lib/composition/scope.js';
import { forEach, forEachElement } from '../src/lib/composition/for-each.js';
import { ifLet } from '../src/lib/navigation/if-let.js';
import { createDestination } from '../src/lib/navigation/destination.js';
import { handleStackAction } from '../src/lib/navigation/stack.js';
import { PresentationAction, StackAction } from '../src/lib/navigation/types.js';

function createHarness<S, A>(childReducer: Reducer<S, A>, initialRows: IdentifiedItem<number, S>[]) {
  type SState = { rows: IdentifiedItem<number, S>[] };
  type SAction = { type: 'rows'; id: number; action: A } | { type: 'remove'; id: number };
  const rows = keyedSlot<SState, SAction>()('rows');
  const core: Reducer<SState, SAction> = (state, action) =>
    action.type === 'remove' ? [{ rows: state.rows.filter(r => r.id !== action.id) }, Effect.none()] : [state, Effect.none()];
  const definition = integrate(core).managed().forEach(rows, childReducer).build();
  const store = createStore({ initialState: { rows: initialRows }, ...definition });
  return { store, definition, rows };
}

describe('managed helper joins', () => {
  it('joins scope with managed keyed siblings', () => {
    type Child = { id: number; count: number };
    type CA = { type: 'sub' } | { type: 'tick' };
    type Row = { child: Child };
    type RA = { type: 'child'; action: CA };
    const callbacks: Dispatch<CA>[] = [];
    const cleaned: number[] = [];
    const child: Reducer<Child, CA> = (s, a) => {
      if (a.type === 'sub') return [s, Effect.subscription('same', d => { callbacks.push(d); return () => { cleaned.push(s.id); }; })];
      if (a.type === 'tick') return [{ ...s, count: s.count + 1 }, Effect.none()];
      return [s, Effect.none()];
    };
    const row = scope<Row, RA, Child, CA>(s => s.child, (s, child) => ({ ...s, child }), a => (a.type === 'child' ? a.action : null), ca => ({ type: 'child', action: ca }), child);
    const { store, definition, rows } = createHarness(row, [{ id: 1, state: { child: { id: 1, count: 10 } } }, { id: 2, state: { child: { id: 2, count: 20 } } }]);
    try {
      const first = definition.bind(store, rows.at(1))!;
      const sibling = definition.bind(store, rows.at(2))!;
      first.dispatch({ type: 'child', action: { type: 'sub' } });
      sibling.dispatch({ type: 'child', action: { type: 'sub' } });
      expect(callbacks).toHaveLength(2);
      expect(store._runtime!.resourceScope.size).toBe(2);
      callbacks[0]!({ type: 'tick' });
      callbacks[1]!({ type: 'tick' });
      expect(first.state?.child.count).toBe(11);
      expect(sibling.state?.child.count).toBe(21);
      store.dispatch({ type: 'remove', id: 1 });
      expect(first.state).toBeUndefined();
      expect(cleaned).toEqual([1]);
      expect(store._runtime!.resourceScope.size).toBe(1);
      const h = store.history.length;
      callbacks[0]!({ type: 'tick' });
      expect(store.history.length).toBe(h);
      callbacks[1]!({ type: 'tick' });
      expect(store.history.length).toBe(h + 1);
      expect(sibling.state?.child.count).toBe(22);
      store.destroy();
      expect(cleaned).toEqual([1, 2]);
      expect(store._runtime!.resourceScope.size).toBe(0);
    } finally {
      store.destroy();
    }
  });

  it('joins scopeAction with managed keyed siblings', () => {
    type Child = { id: number; count: number };
    type CA = { type: 'sub' } | { type: 'tick' };
    type Row = { counter: Child };
    type RA = { type: 'counter'; action: CA };
    const callbacks: Dispatch<CA>[] = [];
    const cleaned: number[] = [];
    const child: Reducer<Child, CA> = (s, a) => {
      if (a.type === 'sub') return [s, Effect.subscription('same', d => { callbacks.push(d); return () => { cleaned.push(s.id); }; })];
      if (a.type === 'tick') return [{ ...s, count: s.count + 1 }, Effect.none()];
      return [s, Effect.none()];
    };
    const row = scopeAction<Row, RA, Child, CA>(s => s.counter, (s, counter) => ({ ...s, counter }), 'counter', child);
    const { store, definition, rows } = createHarness(row, [{ id: 1, state: { counter: { id: 1, count: 10 } } }, { id: 2, state: { counter: { id: 2, count: 20 } } }]);
    try {
      const first = definition.bind(store, rows.at(1))!;
      const sibling = definition.bind(store, rows.at(2))!;
      first.dispatch({ type: 'counter', action: { type: 'sub' } });
      sibling.dispatch({ type: 'counter', action: { type: 'sub' } });
      expect(callbacks).toHaveLength(2);
      expect(store._runtime!.resourceScope.size).toBe(2);
      callbacks[0]!({ type: 'tick' });
      callbacks[1]!({ type: 'tick' });
      expect(first.state?.counter.count).toBe(11);
      expect(sibling.state?.counter.count).toBe(21);
      store.dispatch({ type: 'remove', id: 1 });
      expect(first.state).toBeUndefined();
      expect(cleaned).toEqual([1]);
      expect(store._runtime!.resourceScope.size).toBe(1);
      const h = store.history.length;
      callbacks[0]!({ type: 'tick' });
      expect(store.history.length).toBe(h);
      callbacks[1]!({ type: 'tick' });
      expect(store.history.length).toBe(h + 1);
      expect(sibling.state?.counter.count).toBe(22);
      store.destroy();
      expect(cleaned).toEqual([1, 2]);
      expect(store._runtime!.resourceScope.size).toBe(0);
    } finally {
      store.destroy();
    }
  });

  it('joins forEach with managed keyed siblings', () => {
    type Item = { id: number; count: number };
    type IA = { type: 'sub' } | { type: 'tick' };
    type Row = { items: IdentifiedItem<string, Item>[] };
    type RA = { type: 'item'; id: string; action: IA };
    const callbacks: Dispatch<IA>[] = [];
    const cleaned: number[] = [];
    const item: Reducer<Item, IA> = (s, a) => {
      if (a.type === 'sub') return [s, Effect.subscription('same', d => { callbacks.push(d); return () => { cleaned.push(s.id); }; })];
      if (a.type === 'tick') return [{ ...s, count: s.count + 1 }, Effect.none()];
      return [s, Effect.none()];
    };
    const row = forEach<Row, RA, Item, IA, string, unknown>({
      getArray: s => s.items,
      setArray: (s, items) => ({ ...s, items }),
      extractChild: a => (a.type === 'item' ? { id: a.id, action: a.action } : null),
      wrapChild: (id, action) => ({ type: 'item', id, action }),
      childReducer: item
    });
    const { store, definition, rows } = createHarness(row, [
      { id: 1, state: { items: [{ id: 'a', state: { id: 1, count: 10 } }] } },
      { id: 2, state: { items: [{ id: 'a', state: { id: 2, count: 20 } }] } }
    ]);
    try {
      const first = definition.bind(store, rows.at(1))!;
      const sibling = definition.bind(store, rows.at(2))!;
      first.dispatch({ type: 'item', id: 'a', action: { type: 'sub' } });
      sibling.dispatch({ type: 'item', id: 'a', action: { type: 'sub' } });
      expect(callbacks).toHaveLength(2);
      expect(store._runtime!.resourceScope.size).toBe(2);
      callbacks[0]!({ type: 'tick' });
      callbacks[1]!({ type: 'tick' });
      expect(first.state?.items[0]?.state.count).toBe(11);
      expect(sibling.state?.items[0]?.state.count).toBe(21);
      store.dispatch({ type: 'remove', id: 1 });
      expect(first.state).toBeUndefined();
      expect(cleaned).toEqual([1]);
      expect(store._runtime!.resourceScope.size).toBe(1);
      const h = store.history.length;
      callbacks[0]!({ type: 'tick' });
      expect(store.history.length).toBe(h);
      callbacks[1]!({ type: 'tick' });
      expect(store.history.length).toBe(h + 1);
      expect(sibling.state?.items[0]?.state.count).toBe(22);
      store.destroy();
      expect(cleaned).toEqual([1, 2]);
      expect(store._runtime!.resourceScope.size).toBe(0);
    } finally {
      store.destroy();
    }
  });

  it('joins forEachElement with managed keyed siblings', () => {
    type Item = { id: number; count: number };
    type IA = { type: 'sub' } | { type: 'tick' };
    type Row = { items: IdentifiedItem<string, Item>[] };
    type RA = { type: 'item'; id: string; action: IA };
    const callbacks: Dispatch<IA>[] = [];
    const cleaned: number[] = [];
    const item: Reducer<Item, IA> = (s, a) => {
      if (a.type === 'sub') return [s, Effect.subscription('same', d => { callbacks.push(d); return () => { cleaned.push(s.id); }; })];
      if (a.type === 'tick') return [{ ...s, count: s.count + 1 }, Effect.none()];
      return [s, Effect.none()];
    };
    const row = forEachElement<Row, RA, Item, IA, string, unknown>('item', s => s.items, (s, items) => ({ ...s, items }), item);
    const { store, definition, rows } = createHarness(row, [
      { id: 1, state: { items: [{ id: 'a', state: { id: 1, count: 10 } }] } },
      { id: 2, state: { items: [{ id: 'a', state: { id: 2, count: 20 } }] } }
    ]);
    try {
      const first = definition.bind(store, rows.at(1))!;
      const sibling = definition.bind(store, rows.at(2))!;
      first.dispatch({ type: 'item', id: 'a', action: { type: 'sub' } });
      sibling.dispatch({ type: 'item', id: 'a', action: { type: 'sub' } });
      expect(callbacks).toHaveLength(2);
      expect(store._runtime!.resourceScope.size).toBe(2);
      callbacks[0]!({ type: 'tick' });
      callbacks[1]!({ type: 'tick' });
      expect(first.state?.items[0]?.state.count).toBe(11);
      expect(sibling.state?.items[0]?.state.count).toBe(21);
      store.dispatch({ type: 'remove', id: 1 });
      expect(first.state).toBeUndefined();
      expect(cleaned).toEqual([1]);
      expect(store._runtime!.resourceScope.size).toBe(1);
      const h = store.history.length;
      callbacks[0]!({ type: 'tick' });
      expect(store.history.length).toBe(h);
      callbacks[1]!({ type: 'tick' });
      expect(store.history.length).toBe(h + 1);
      expect(sibling.state?.items[0]?.state.count).toBe(22);
      store.destroy();
      expect(cleaned).toEqual([1, 2]);
      expect(store._runtime!.resourceScope.size).toBe(0);
    } finally {
      store.destroy();
    }
  });

  it('joins ifLet with managed keyed siblings', () => {
    type Modal = { id: number; count: number };
    type MA = { type: 'sub' } | { type: 'tick' };
    type Row = { modal: Modal | null };
    type RA = { type: 'modal'; action: MA };
    const callbacks: Dispatch<MA>[] = [];
    const cleaned: number[] = [];
    const modal: Reducer<Modal, MA> = (s, a) => {
      if (a.type === 'sub') return [s, Effect.subscription('same', d => { callbacks.push(d); return () => { cleaned.push(s.id); }; })];
      if (a.type === 'tick') return [{ ...s, count: s.count + 1 }, Effect.none()];
      return [s, Effect.none()];
    };
    const row = ifLet<Row, RA, Modal, MA>(s => s.modal, (s, modal) => ({ ...s, modal }), a => (a.type === 'modal' ? a.action : null), ca => ({ type: 'modal', action: ca }), modal);
    const { store, definition, rows } = createHarness(row, [
      { id: 1, state: { modal: { id: 1, count: 10 } } },
      { id: 2, state: { modal: { id: 2, count: 20 } } }
    ]);
    try {
      const first = definition.bind(store, rows.at(1))!;
      const sibling = definition.bind(store, rows.at(2))!;
      first.dispatch({ type: 'modal', action: { type: 'sub' } });
      sibling.dispatch({ type: 'modal', action: { type: 'sub' } });
      expect(callbacks).toHaveLength(2);
      expect(store._runtime!.resourceScope.size).toBe(2);
      callbacks[0]!({ type: 'tick' });
      callbacks[1]!({ type: 'tick' });
      expect(first.state?.modal?.count).toBe(11);
      expect(sibling.state?.modal?.count).toBe(21);
      store.dispatch({ type: 'remove', id: 1 });
      expect(first.state).toBeUndefined();
      expect(cleaned).toEqual([1]);
      expect(store._runtime!.resourceScope.size).toBe(1);
      const h = store.history.length;
      callbacks[0]!({ type: 'tick' });
      expect(store.history.length).toBe(h);
      callbacks[1]!({ type: 'tick' });
      expect(store.history.length).toBe(h + 1);
      expect(sibling.state?.modal?.count).toBe(22);
      store.destroy();
      expect(cleaned).toEqual([1, 2]);
      expect(store._runtime!.resourceScope.size).toBe(0);
    } finally {
      store.destroy();
    }
  });

  it('joins createDestination with managed keyed siblings', () => {
    type Editor = { id: number; text: string };
    type EA = { type: 'sub' } | { type: 'edit'; text: string };
    const callbacks: Dispatch<EA>[] = [];
    const cleaned: number[] = [];
    const destination = createDestination({
      editor: (s: Editor, a: EA): readonly [Editor, EffectType<EA>] => {
        if (a.type === 'sub') return [s, Effect.subscription('same', d => { callbacks.push(d); return () => { cleaned.push(s.id); }; })];
        if (a.type === 'edit') return [{ ...s, text: a.text }, Effect.none()];
        return [s, Effect.none()];
      }
    });
    type DestinationState = typeof destination._types.State;
    type DestinationAction = typeof destination._types.Action;
    type Row = { destination: DestinationState | null };
    type RowAction = { type: 'destination'; action: PresentationAction<DestinationAction> };
    type Root = { rows: IdentifiedItem<number, Row>[] };
    type RootAction = { type: 'rows'; id: number; action: RowAction } | { type: 'remove'; id: number };
    const destinationHandle = destinationSlot<Row, RowAction>()('destination', destination);
    const row = integrate< Row, RowAction >((state) => [state, Effect.none()])
      .managed()
      .with(destinationHandle)
      .build();
    const rows = keyedSlot<Root, RootAction>()('rows');
    const root: Reducer<Root, RootAction> = (state, action) =>
      action.type === 'remove' ? [{ rows: state.rows.filter(item => item.id !== action.id) }, Effect.none()] : [state, Effect.none()];
    const definition = integrate(root).managed().forEach(rows, row).build();
    const store = createStore({
      initialState: { rows: [
        { id: 1, state: { destination: destination.initial('editor', { id: 1, text: 't1' }) } },
        { id: 2, state: { destination: destination.initial('editor', { id: 2, text: 't2' }) } }
      ] },
      ...definition
    });
    try {
      const first = definition.bind(store, rows.at(1))!;
      const sibling = definition.bind(store, rows.at(2))!;
      const firstEditor = definition.bind(store, nestedSlot(rows.at(1), destinationHandle.case('editor')))!;
      const siblingEditor = definition.bind(store, nestedSlot(rows.at(2), destinationHandle.case('editor')))!;
      firstEditor.dispatch({ type: 'sub' });
      siblingEditor.dispatch({ type: 'sub' });
      expect(callbacks).toHaveLength(2);
      expect(store._runtime!.resourceScope.size).toBe(2);
      callbacks[0]!({ type: 'edit', text: 'u1' });
      callbacks[1]!({ type: 'edit', text: 'u2' });
      expect(destination.extract(first.state?.destination ?? null, 'editor')?.text).toBe('u1');
      expect(destination.extract(sibling.state?.destination ?? null, 'editor')?.text).toBe('u2');
      store.dispatch({ type: 'remove', id: 1 });
      expect(first.state).toBeUndefined();
      expect(firstEditor.state).toBeUndefined();
      expect(cleaned).toEqual([1]);
      expect(store._runtime!.resourceScope.size).toBe(1);
      const h = store.history.length;
      callbacks[0]!({ type: 'edit', text: 'stale' });
      expect(store.history.length).toBe(h);
      callbacks[1]!({ type: 'edit', text: 'u3' });
      expect(store.history.length).toBe(h + 1);
      expect(destination.extract(sibling.state?.destination ?? null, 'editor')?.text).toBe('u3');
      expect(siblingEditor.state?.text).toBe('u3');
      store.destroy();
      expect(cleaned).toEqual([1, 2]);
      expect(store._runtime!.resourceScope.size).toBe(0);
    } finally {
      store.destroy();
    }
  });

  it('joins handleStackAction presented arm with managed keyed siblings', () => {
    type Screen = { id: number; count: number };
    type SA = { type: 'sub' } | { type: 'tick' };
    type Row = { stack: readonly Screen[] };
    type RA = { type: 'stack'; action: StackAction<SA> };
    const callbacks: Dispatch<SA>[] = [];
    const cleaned: number[] = [];
    const screen: Reducer<Screen, SA> = (s, a) => {
      if (a.type === 'sub') return [s, Effect.subscription('same', d => { callbacks.push(d); return () => { cleaned.push(s.id); }; })];
      if (a.type === 'tick') return [{ ...s, count: s.count + 1 }, Effect.none()];
      return [s, Effect.none()];
    };
    const row: Reducer<Row, RA> = (state, action, deps) =>
      action.type === 'stack'
        ? handleStackAction<Row, RA, Screen, SA, unknown>(state, action.action, deps, screen, s => s.stack, (s, stack) => ({ ...s, stack }), { actionType: 'stack' })
        : [state, Effect.none()];
    const { store, definition, rows } = createHarness(row, [
      { id: 1, state: { stack: [{ id: 1, count: 10 }] } },
      { id: 2, state: { stack: [{ id: 2, count: 20 }] } }
    ]);
    try {
      const first = definition.bind(store, rows.at(1))!;
      const sibling = definition.bind(store, rows.at(2))!;
      first.dispatch({ type: 'stack', action: StackAction.screen(0, PresentationAction.presented({ type: 'sub' })) });
      sibling.dispatch({ type: 'stack', action: StackAction.screen(0, PresentationAction.presented({ type: 'sub' })) });
      expect(callbacks).toHaveLength(2);
      expect(store._runtime!.resourceScope.size).toBe(2);
      callbacks[0]!({ type: 'tick' });
      callbacks[1]!({ type: 'tick' });
      expect(first.state?.stack[0]?.count).toBe(11);
      expect(sibling.state?.stack[0]?.count).toBe(21);
      store.dispatch({ type: 'remove', id: 1 });
      expect(first.state).toBeUndefined();
      expect(cleaned).toEqual([1]);
      expect(store._runtime!.resourceScope.size).toBe(1);
      const h = store.history.length;
      callbacks[0]!({ type: 'tick' });
      expect(store.history.length).toBe(h);
      callbacks[1]!({ type: 'tick' });
      expect(store.history.length).toBe(h + 1);
      expect(sibling.state?.stack[0]?.count).toBe(22);
      store.destroy();
      expect(cleaned).toEqual([1, 2]);
      expect(store._runtime!.resourceScope.size).toBe(0);
    } finally {
      store.destroy();
    }
  });

  it('handles representative group cancellation from handleStackAction without masking by teardown', () => {
    type Screen = { id: number; count: number };
    type SA = { type: 'sub' } | { type: 'tick' };
    type Row = { stack: readonly Screen[] };
    type RA = { type: 'stack'; action: StackAction<SA> };
    const callbacks: Dispatch<SA>[] = [];
    const cleaned: number[] = [];
    const screen: Reducer<Screen, SA> = (s, a) => {
      if (a.type === 'sub') return [s, Effect.subscription('same', d => { callbacks.push(d); return () => { cleaned.push(s.id); }; })];
      if (a.type === 'tick') return [{ ...s, count: s.count + 1 }, Effect.none()];
      return [s, Effect.none()];
    };
    const row: Reducer<Row, RA> = (state, action, deps) =>
      action.type === 'stack'
        ? handleStackAction<Row, RA, Screen, SA, unknown>(state, action.action, deps, screen, s => s.stack, (s, stack) => ({ ...s, stack }), { actionType: 'stack' })
        : [state, Effect.none()];
    const { store, definition, rows } = createHarness(row, [
      { id: 1, state: { stack: [{ id: 10, count: 0 }, { id: 11, count: 10 }] } },
      { id: 2, state: { stack: [{ id: 20, count: 0 }, { id: 21, count: 20 }] } }
    ]);
    try {
      const first = definition.bind(store, rows.at(1))!;
      const sibling = definition.bind(store, rows.at(2))!;
      first.dispatch({ type: 'stack', action: StackAction.screen(1, PresentationAction.presented({ type: 'sub' })) });
      sibling.dispatch({ type: 'stack', action: StackAction.screen(1, PresentationAction.presented({ type: 'sub' })) });
      expect(callbacks).toHaveLength(2);
      expect(store._runtime!.resourceScope.size).toBe(2);
      first.dispatch({ type: 'stack', action: StackAction.pop() });
      expect(first.state?.stack).toHaveLength(1);
      expect(sibling.state?.stack).toHaveLength(2);
      expect(cleaned).toEqual([11]);
      expect(store._runtime!.resourceScope.size).toBe(1);
      const h = store.history.length;
      callbacks[0]!({ type: 'tick' });
      expect(store.history.length).toBe(h);
      callbacks[1]!({ type: 'tick' });
      expect(store.history.length).toBe(h + 1);
      expect(sibling.state?.stack[1]?.count).toBe(21);
      expect(cleaned).toEqual([11]);
      store.destroy();
      expect(cleaned).toEqual([11, 21]);
      expect(store._runtime!.resourceScope.size).toBe(0);
    } finally {
      store.destroy();
    }
  });

  // createDestinationReducer is non-transforming; its existing E4 audit already covers passthrough identity.
});
