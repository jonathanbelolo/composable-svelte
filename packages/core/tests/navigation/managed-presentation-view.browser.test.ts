import { afterEach, describe, expect, it } from 'vitest';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import { registerManagedProjection, type ManagedProjection } from '../../src/lib/execution/store-access.js';
import {
  ManagedIntegrationBuilder,
  assertPresentationView,
  destinationSlot,
  keyedSlot,
  nestedSlot,
  optionalSlot,
  type ChildView
} from '../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import { scopeTo } from '../../src/lib/navigation/scope.js';
import { bindViewDefinition, resolveView } from '../../src/lib/application/view-binding.js';
import { defineViews, type PresentationFeatureViewProps } from '../../src/lib/application/view-definition.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';
import type { Component } from 'svelte';

type Detail = { value: number };
type DetailAction = { type: 'increment' };
type Panel = { value: number };
type PanelAction = { type: 'increment' };
type Row = { detail: Detail | null; marker: number };
type RowAction =
  | { type: 'detail'; action: PresentationAction<DetailAction> }
  | { type: 'marker' };
type CaseAction = { type: 'increment' };
const Destination = createDestination({
  alpha: ((state, action) => [action.type === 'increment' ? { value: state.value + 1 } : state, Effect.none()]) as Reducer<Detail, CaseAction>,
  beta: ((state, action) => [action.type === 'increment' ? { value: state.value + 1 } : state, Effect.none()]) as Reducer<Detail, CaseAction>
});
type DestinationState = typeof Destination._types.State;
type DestinationAction = typeof Destination._types.Action;
type State = {
  panel: Panel | null;
  rows: Array<{ id: number; state: Row }>;
  destination: DestinationState | null;
};
type Action =
  | { type: 'panel'; action: PresentationAction<PanelAction> }
  | { type: 'rows'; id: number; action: RowAction }
  | { type: 'destination'; action: PresentationAction<DestinationAction> }
  | { type: 'replacePanel'; value: number }
  | { type: 'show'; case: 'alpha' | 'beta'; value: number }
  | { type: 'probe' };

const panel = optionalSlot<State, Action>()('panel');
const rows = keyedSlot<State, Action>()('rows');
const detail = optionalSlot<Row, RowAction>()('detail');
const destination = destinationSlot<State, Action>()('destination', Destination);
const panelReducer: Reducer<Panel, PanelAction> = (state) => [{ value: state.value + 1 }, Effect.none()];
const detailReducer: Reducer<Detail, DetailAction> = (state) => [{ value: state.value + 1 }, Effect.none()];
const rowComposition = new ManagedIntegrationBuilder<Row, RowAction, undefined>((state, action) =>
  [action.type === 'marker' ? { ...state, marker: state.marker + 1 } : state, Effect.none()]
).with(detail, detailReducer).build();
const reducer: Reducer<State, Action> = (state, action) => {
  if (action.type === 'replacePanel') return [{ ...state, panel: { value: action.value } }, Effect.none()];
  if (action.type === 'show') return [{ ...state, destination: Destination.initial(action.case, { value: action.value }) }, Effect.none()];
  return [state, Effect.none()];
};
const composition = new ManagedIntegrationBuilder<State, Action, undefined>(reducer)
  .with(panel, panelReducer, { replaceOn: (action) => action.type === 'replacePanel' })
  .forEach(rows, rowComposition)
  .with(destination)
  .build();

const stores: Array<{ destroy(): void }> = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.destroy();
});
function makeStore() {
  const store = createStore({
    initialState: {
      panel: { value: 1 },
      rows: [{ id: 1, state: { detail: { value: 2 }, marker: 0 } }],
      destination: Destination.initial('alpha', { value: 3 })
    } satisfies State,
    ...composition
  });
  stores.push(store);
  return store;
}

describe('managed presentation view substrate', () => {
  it('mints capability only for optional and destination-case handles', () => {
    const store = makeStore();
    const panelView = composition.bind(store, panel)!;
    const caseView = composition.bind(store, destination.case('alpha'))!;
    const rowView = composition.bind(store, rows.at(1))!;

    expect(() => assertPresentationView(panelView)).not.toThrow();
    expect(() => assertPresentationView(caseView)).not.toThrow();
    expect(() => assertPresentationView(rowView)).toThrow('Expected a managed presentation view');
    expect('dismiss' in rowView).toBe(false);

    caseView.dismiss();
    expect(store.state.destination).toBeNull();
    panelView.dismiss();
    expect(store.state.panel).toBeNull();
  });

  it('keeps dismissal bound to the exact optional owner across replacement and destruction', () => {
    const store = makeStore();
    const stale = composition.bind(store, panel)!;
    store.dispatch({ type: 'replacePanel', value: 9 });
    stale.dismiss();
    expect(store.state.panel).toEqual({ value: 9 });

    const current = composition.bind(store, panel)!;
    current.dismiss();
    expect(store.state.panel).toBeNull();
    store.destroy();
    expect(() => current.dismiss()).not.toThrow();
    expect(store.state.panel).toBeNull();
  });

  it('drops a queued dismissal when an earlier reentrant replacement retires its origin', () => {
    const store = makeStore();
    const stale = composition.bind(store, panel)!;
    let queued = false;
    const stop = store.subscribeToActions!((action) => {
      if (action.type !== 'probe' || queued) return;
      queued = true;
      store.dispatch({ type: 'replacePanel', value: 12 });
      stale.dismiss();
    });

    store.dispatch({ type: 'probe' });
    stop();
    expect(store.state.panel).toEqual({ value: 12 });
    expect(store.history).toEqual([{ type: 'probe' }, { type: 'replacePanel', value: 12 }]);
  });

  it('drops an A capability after A to B to A and lets the current case dismiss', () => {
    const store = makeStore();
    const oldAlpha = composition.bind(store, destination.case('alpha'))!;
    store.dispatch({ type: 'show', case: 'beta', value: 4 });
    store.dispatch({ type: 'show', case: 'alpha', value: 5 });

    oldAlpha.dismiss();
    expect(store.state.destination).toEqual(Destination.initial('alpha', { value: 5 }));
    composition.bind(store, destination.case('alpha'))!.dismiss();
    expect(store.state.destination).toBeNull();
  });

  it('propagates only a nested child capability through a keyed row', () => {
    const store = makeStore();
    const rowHandle = rows.at(1);
    const rowView = composition.bind(store, rowHandle)!;
    const detailView = composition.bind(store, nestedSlot(rowHandle, detail))!;

    expect(() => assertPresentationView(rowView)).toThrow('Expected a managed presentation view');
    expect(() => assertPresentationView(detailView)).not.toThrow();
    detailView.dismiss();
    expect(store.state.rows[0]?.state).toEqual({ detail: null, marker: 0 });
    rowView.dispatch({ type: 'marker' });
    expect(store.state.rows[0]?.state.marker).toBe(1);
  });

  it('does not lend an optional parent capability to a nested keyed child', () => {
    type Container = { rows: Array<{ id: number; state: Detail }> };
    type ContainerAction = { type: 'rows'; id: number; action: DetailAction };
    type Root = { container: Container | null };
    type RootAction = { type: 'container'; action: PresentationAction<ContainerAction> };
    const container = optionalSlot<Root, RootAction>()('container');
    const childRows = keyedSlot<Container, ContainerAction>()('rows');
    const childComposition = new ManagedIntegrationBuilder<Container, ContainerAction, undefined>((state) => [state, Effect.none()])
      .forEach(childRows, detailReducer)
      .build();
    const rootComposition = new ManagedIntegrationBuilder<Root, RootAction, undefined>((state) => [state, Effect.none()])
      .with(container, childComposition)
      .build();
    const store = createStore({
      initialState: { container: { rows: [{ id: 1, state: { value: 1 } }] } } satisfies Root,
      ...rootComposition
    });
    stores.push(store);

    const rowView = rootComposition.bind(store, nestedSlot(container, childRows.at(1)))!;
    expect(() => assertPresentationView(rowView)).toThrow('Expected a managed presentation view');
    expect('dismiss' in rowView).toBe(false);
  });

  it('preserves the capability through the registered application projection path', () => {
    const store = makeStore();
    const projection: ManagedProjection<State, Action> = Object.freeze({
      get state() { return store.state; },
      dispatch: (action: Action) => store.dispatch(action),
      select: <T>(selector: (state: State) => T) => selector(store.state),
      subscribe: (listener: (state: State) => void) => store.subscribe(listener)
    });
    registerManagedProjection(projection, {
      matchesComposition: (execution) => execution._reduce === composition.execution._reduce && execution.slots === composition.execution.slots,
      isLive: () => true,
      bind: (slot) => composition.bind(store, slot)
    });

    const view = scopeTo(projection, panel)!;
    expect(() => assertPresentationView(view)).not.toThrow();
    view.dismiss();
    expect(store.state.panel).toBeNull();
  });

  it('preserves membership through declarative view resolution', () => {
    type Root = { child: Detail | null };
    type RootAction = { type: 'child'; action: PresentationAction<DetailAction> };
    const child = optionalSlot<Root, RootAction>()('child');
    const feature = new ManagedIntegrationBuilder<Root, RootAction, undefined>((state) => [state, Effect.none()])
      .with(child, detailReducer)
      .build();
    const Renderer = (() => undefined) as unknown as Component<PresentationFeatureViewProps<Detail, DetailAction>>;
    const definition = defineViews(feature, { child: { render: Renderer } });
    const store = createStore({ initialState: { child: { value: 1 } } satisfies Root, ...feature });
    stores.push(store);

    const handles = bindViewDefinition(store, definition);
    const [instance] = resolveView(handles.child);
    expect(instance).toBeDefined();
    assertPresentationView(instance!.store);
    instance!.store.dismiss();
    expect(store.state.child).toBeNull();
  });

  it('rejects structurally forged and legacy-shaped views at the runtime membership gate', () => {
    const forged: ChildView<Panel, PanelAction> = {
      state: { value: 1 },
      dispatch() {},
      select: (selector) => selector({ value: 1 }),
      subscribe() { return () => {}; }
    };
    const legacy = { ...forged, dismiss() {} };
    expect(() => assertPresentationView(forged)).toThrow('Expected a managed presentation view');
    expect(() => assertPresentationView(legacy)).toThrow('Expected a managed presentation view');

    const store = makeStore();
    const copiedOptional = { ...panel } as typeof panel;
    const alphaHandle = destination.case('alpha');
    const copiedCase = { ...alphaHandle } as typeof alphaHandle;
    expect(() => composition.bind(store, copiedOptional)).toThrow('Expected a genuine managed slot handle');
    expect(() => composition.bind(store, copiedCase)).toThrow('Expected a genuine managed slot handle');

    const genuineParent = rows.at(1);
    const copiedParent = {
      ...genuineParent,
      wrap: (_action: RowAction) => ({ type: 'replacePanel', value: 999 } as Action)
    } as typeof genuineParent;
    expect(() => nestedSlot(copiedParent, detail)).toThrow('Expected genuine managed slot handles');
  });
});
