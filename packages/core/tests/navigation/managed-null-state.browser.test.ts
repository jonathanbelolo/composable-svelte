import { afterEach, describe, expect, it } from 'vitest';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import {
  ManagedIntegrationBuilder,
  assertPresentationView,
  destinationSlot,
  keyedSlot,
  nestedSlot,
  optionalSlot
} from '../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';

const stores: Array<{ destroy(): void }> = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.destroy();
});

describe('managed live-null normalization', () => {
  it('preserves direct keyed live-null state across select, initial subscribe, and dispatch', () => {
    type KeyedItemState = { count: number } | null;
    type KeyedItemAction = { type: 'setCount'; count: number };
    type RootState = {
      items: Array<{ id: number; state: KeyedItemState }>;
    };
    type RootAction =
      | { type: 'items'; id: number; action: KeyedItemAction };

    const items = keyedSlot<RootState, RootAction>()('items');
    const keyedReducer: Reducer<KeyedItemState, KeyedItemAction> = (state, action) => {
      if (action.type === 'setCount') return [{ count: action.count }, Effect.none()];
      return [state, Effect.none()];
    };
    const composition = new ManagedIntegrationBuilder<RootState, RootAction, undefined>((state) => [state, Effect.none()])
      .forEach(items, keyedReducer)
      .build();

    const store = createStore({
      initialState: {
        items: [{ id: 1, state: null }]
      } satisfies RootState,
      ...composition
    });
    stores.push(store);

    const rowHandle = items.at(1);
    const view = composition.bind(store, rowHandle)!;
    expect(view).toBeDefined();
    expect(view.state).toBeNull();
    expect(view.select((s) => s)).toBeNull();

    let observed: KeyedItemState | undefined = undefined;
    let notifications = 0;
    const unsubscribe = view.subscribe((s) => {
      observed = s;
      notifications++;
    });
    expect(observed).toBeNull();
    expect(notifications).toBe(1);

    view.dispatch({ type: 'setCount', count: 42 });
    expect(store.state.items[0]?.state).toEqual({ count: 42 });
    expect(view.state).toEqual({ count: 42 });
    expect(observed).toEqual({ count: 42 });
    expect(notifications).toBe(2);

    unsubscribe();
  });

  it('preserves destination case live-null and transitions to undefined on dismissal retirement', () => {
    type AlphaState = { text: string } | null;
    type AlphaAction = { type: 'setText'; text: string };
    type BetaState = { value: number };
    type BetaAction = { type: 'increment' };

    const Destination = createDestination({
      alpha: ((state, action) => {
        if (action.type === 'setText') return [{ text: action.text }, Effect.none()];
        return [state, Effect.none()];
      }) as Reducer<AlphaState, AlphaAction>,
      beta: ((state) => [{ value: state.value + 1 }, Effect.none()]) as Reducer<BetaState, BetaAction>
    });
    type DestRootState = {
      destination: typeof Destination._types.State | null;
    };
    type DestRootAction =
      | { type: 'destination'; action: PresentationAction<typeof Destination._types.Action> };

    const destination = destinationSlot<DestRootState, DestRootAction>()('destination', Destination);
    const composition = new ManagedIntegrationBuilder<DestRootState, DestRootAction, undefined>((state) => [state, Effect.none()])
      .with(destination)
      .build();

    const store = createStore({
      initialState: {
        destination: Destination.initial('alpha', null)
      } satisfies DestRootState,
      ...composition
    });
    stores.push(store);

    const caseHandle = destination.case('alpha');
    const view = composition.bind(store, caseHandle)!;
    expect(view).toBeDefined();
    expect(() => assertPresentationView(view)).not.toThrow();
    expect(view.state).toBeNull();
    expect(view.select((s) => s)).toBeNull();

    let observed: AlphaState | undefined = undefined;
    const unsubscribe = view.subscribe((s) => {
      observed = s;
    });
    expect(observed).toBeNull();

    view.dispatch({ type: 'setText', text: 'live from null' });
    expect(view.state).toEqual({ text: 'live from null' });
    expect(observed).toEqual({ text: 'live from null' });

    view.dismiss();
    expect(store.state.destination).toBeNull();
    expect(view.state).toBeUndefined();
    expect(observed).toBeUndefined();

    unsubscribe();
  });

  it('preserves nested keyed live-null under an optional container, retires on removal, and stays stale on replacement', () => {
    type RowState = { label: string } | null;
    type RowAction = { type: 'setLabel'; label: string };
    type ContainerState = { rows: Array<{ id: number; state: RowState }> };
    type ContainerAction =
      | { type: 'rows'; id: number; action: RowAction }
      | { type: 'removeRow'; id: number }
      | { type: 'addRow'; id: number; state: RowState };

    type RootState = {
      container: ContainerState | null;
    };
    type RootAction =
      | { type: 'container'; action: PresentationAction<ContainerAction> };

    const container = optionalSlot<RootState, RootAction>()('container');
    const rows = keyedSlot<ContainerState, ContainerAction>()('rows');

    const rowReducer: Reducer<RowState, RowAction> = (state, action) => {
      if (action.type === 'setLabel') return [{ label: action.label }, Effect.none()];
      return [state, Effect.none()];
    };
    const containerReducer: Reducer<ContainerState, ContainerAction> = (state, action) => {
      if (action.type === 'removeRow') {
        return [{ ...state, rows: state.rows.filter((r) => r.id !== action.id) }, Effect.none()];
      }
      if (action.type === 'addRow') {
        return [{ ...state, rows: [...state.rows, { id: action.id, state: action.state }] }, Effect.none()];
      }
      return [state, Effect.none()];
    };

    const containerComposition = new ManagedIntegrationBuilder<ContainerState, ContainerAction, undefined>(containerReducer)
      .forEach(rows, rowReducer)
      .build();
    const rootComposition = new ManagedIntegrationBuilder<RootState, RootAction, undefined>((state) => [state, Effect.none()])
      .with(container, containerComposition)
      .build();

    const store = createStore({
      initialState: {
        container: {
          rows: [{ id: 1, state: null }]
        }
      } satisfies RootState,
      ...rootComposition
    });
    stores.push(store);

    const nestedHandle = nestedSlot(container, rows.at(1));
    const view = rootComposition.bind(store, nestedHandle)!;
    expect(view).toBeDefined();
    expect(view.state).toBeNull();
    expect(view.select((s) => s)).toBeNull();

    let observed: RowState | undefined = undefined;
    const unsubscribe = view.subscribe((s) => {
      observed = s;
    });
    expect(observed).toBeNull();

    // Row removal retires the row view to undefined
    store.dispatch({
      type: 'container',
      action: {
        type: 'presented',
        action: { type: 'removeRow', id: 1 }
      }
    });
    expect(store.state.container?.rows).toEqual([]);
    expect(view.state).toBeUndefined();
    expect(observed).toBeUndefined();

    // Same-key replacement allocates a new owner; the old bound view remains stale
    store.dispatch({
      type: 'container',
      action: {
        type: 'presented',
        action: { type: 'addRow', id: 1, state: { label: 'fresh' } }
      }
    });
    expect(store.state.container?.rows).toEqual([{ id: 1, state: { label: 'fresh' } }]);
    expect(view.state).toBeUndefined();
    expect(observed).toBeUndefined();

    expect(() => view.dispatch({ type: 'setLabel', label: 'stale write' })).not.toThrow();
    expect(store.state.container?.rows).toEqual([{ id: 1, state: { label: 'fresh' } }]);

    // Re-binding produces a fresh view observing the new owner
    const freshView = rootComposition.bind(store, nestedSlot(container, rows.at(1)))!;
    expect(freshView).toBeDefined();
    expect(freshView.state).toEqual({ label: 'fresh' });

    unsubscribe();
  });

  it('normalizes absent optional token read to undefined and keeps retained view undefined after retirement', () => {
    type PanelState = { count: number };
    type PanelAction = { type: 'increment' };
    type RootState = { panel: PanelState | null };
    type RootAction =
      | { type: 'panel'; action: PresentationAction<PanelAction> }
      | { type: 'replacePanel'; count: number };

    const panel = optionalSlot<RootState, RootAction>()('panel');

    // Direct optional token raw-read sentinel returns undefined for null field
    expect(panel.read({ panel: null })).toBeUndefined();
    expect(panel.read({ panel: { count: 7 } })).toEqual({ count: 7 });

    const panelReducer: Reducer<PanelState, PanelAction> = (state) => [{ count: state.count + 1 }, Effect.none()];
    const rootReducer: Reducer<RootState, RootAction> = (state, action) => {
      if (action.type === 'replacePanel') {
        return [{ ...state, panel: { count: action.count } }, Effect.none()];
      }
      return [state, Effect.none()];
    };
    const composition = new ManagedIntegrationBuilder<RootState, RootAction, undefined>(rootReducer)
      .with(panel, panelReducer, { replaceOn: (action) => action.type === 'replacePanel' })
      .build();

    const store = createStore({
      initialState: { panel: { count: 1 } } satisfies RootState,
      ...composition
    });
    stores.push(store);

    const view = composition.bind(store, panel)!;
    expect(view).toBeDefined();
    expect(view.state).toEqual({ count: 1 });

    let observed: PanelState | undefined = undefined;
    const unsubscribe = view.subscribe((s) => {
      observed = s;
    });
    expect(observed).toEqual({ count: 1 });

    // Dismissal retires the owner
    view.dismiss();
    expect(store.state.panel).toBeNull();
    expect(view.state).toBeUndefined();
    expect(observed).toBeUndefined();

    // Retained view remains undefined after replacement re-allocation
    store.dispatch({ type: 'replacePanel', count: 99 });
    expect(store.state.panel).toEqual({ count: 99 });
    expect(view.state).toBeUndefined();
    expect(observed).toBeUndefined();

    unsubscribe();
  });
});
