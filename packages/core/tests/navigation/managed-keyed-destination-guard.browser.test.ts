import { it, expect } from 'vitest';
import { Effect } from '../../src/lib/effect.js';
import { createStore } from '../../src/lib/store.svelte.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import { destinationSlot, keyedSlot, ManagedIntegrationBuilder } from '../../src/lib/navigation/managed-integration.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';
import type { Reducer } from '../../src/lib/types.js';

type AState = { count: number };
type AAction = { type: 'arm' } | { type: 'late' };
type BState = { label: string };
type BAction = { type: 'noop' };

let late: (() => void) | undefined;
const a: Reducer<AState, AAction> = (state, action) => {
  if (action.type === 'arm') return [state, Effect.run(dispatch => { late = () => dispatch({ type: 'late' }); })];
  return [{ count: state.count + 1 }, Effect.none()];
};
const b: Reducer<BState, BAction> = state => [state, Effect.none()];
const Destination = createDestination({ a, b });
type Occupant = typeof Destination._types.State;
type DestinationAction = typeof Destination._types.Action;

it('rejects a generated destination reducer before reserving a keyed field and preserves ordinary unions', () => {
  type State = { rows: Array<{ id: string; state: Occupant }> };
  type Action = { type: 'rows'; id: string; action: DestinationAction };
  const rows = keyedSlot<State, Action>()('rows');
  const root: Reducer<State, Action> = state => [state, Effect.none()];
  const builder = new ManagedIntegrationBuilder(root);
  expect(() => builder.forEach(rows, Destination.reducer)).toThrow(
    'Use destinationSlot inside a managed row composition for a createDestination-managed row'
  );

  // Membership, not structural resemblance, drives the guard. The failed call
  // did not reserve the field, so a same-shaped ordinary reducer can register.
  const ordinary: Reducer<Occupant, DestinationAction> = (state, action) => {
    if (state.type === 'a' && action.type === 'a' && action.action.type === 'late') {
      return [{ type: 'a', state: { count: state.state.count + 1 } }, Effect.none()];
    }
    return [state, Effect.none()];
  };
  expect(() => builder.forEach(rows, ordinary)).not.toThrow();
});

it('supports a destination nested inside each row and retires the old case callback', () => {
  type RowState = { destination: Occupant | null };
  type RowAction =
    | { type: 'destination'; action: PresentationAction<DestinationAction> }
    | { type: 'replace'; case: 'a' | 'b' };
  type State = { rows: Array<{ id: string; state: RowState }> };
  type Action = { type: 'rows'; id: string; action: RowAction };

  const destination = destinationSlot<RowState, RowAction>()('destination', Destination);
  const rowCore: Reducer<RowState, RowAction> = (state, action) => {
    if (action.type !== 'replace') return [state, Effect.none()];
    return [{ destination: action.case === 'a'
      ? Destination.initial('a', { count: 100 })
      : Destination.initial('b', { label: 'replacement' }) }, Effect.none()];
  };
  const row = new ManagedIntegrationBuilder(rowCore).with(destination).build();
  const rows = keyedSlot<State, Action>()('rows');
  const root: Reducer<State, Action> = state => [state, Effect.none()];
  const composition = new ManagedIntegrationBuilder(root).forEach(rows, row).build();
  const store = createStore({
    initialState: { rows: [{ id: 'row', state: { destination: Destination.initial('a', { count: 0 }) } }] },
    ...composition
  });
  try {
    store.dispatch(rows.at('row').wrap(destination.case('a').wrap({ type: 'arm' })));
    expect(late).toBeTypeOf('function');
    store.dispatch(rows.at('row').wrap({ type: 'replace', case: 'b' }));
    store.dispatch(rows.at('row').wrap({ type: 'replace', case: 'a' }));
    late!();
    const afterStale = store.state.rows[0]!.state.destination;
    store.dispatch(rows.at('row').wrap(destination.case('a').wrap({ type: 'late' })));
    const afterFresh = store.state.rows[0]!.state.destination;
    expect([afterStale, afterFresh]).toEqual([
      { type: 'a', state: { count: 100 } },
      { type: 'a', state: { count: 101 } }
    ]);
  } finally {
    store.destroy();
    late = undefined;
  }
});
