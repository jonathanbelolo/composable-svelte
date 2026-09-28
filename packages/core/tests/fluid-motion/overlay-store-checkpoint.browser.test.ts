/**
 * C2 default-phase pipeline hook (store semantics): the checkpoint runs synchronously after a CHANGED commit — pure
 * reduction first, before any render — for plain and managed (application) stores. Refused actions and throwing
 * reducers notify nothing; an observer failure never breaks dispatch or later observers.
 */
import { afterEach, expect, it, vi } from 'vitest';
import { createStore, onStateCommitted } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); });
type S = { n: number }; type A = { type: 'inc' } | { type: 'noop' } | { type: 'boom' };
const reducer = (state: S, action: A): [S, ReturnType<typeof Effect.none>] => {
  if (action.type === 'boom') throw new Error('reducer failed');
  return action.type === 'inc' ? [{ n: state.n + 1 }, Effect.none()] : [state, Effect.none()];
};

for (const managed of [false, true]) it(`${managed ? 'managed' : 'plain'} store: notifies once per changed commit, after reduction, never on refusal or reducer failure`, () => {
  const store = createStore<S, A>({ initialState: { n: 0 }, reducer, ...(managed ? { execution: { mode: 'managed' } } : {}) } as never);
  stops.push(() => store.destroy());
  const seen: number[] = [];
  stops.push(onStateCommitted(() => seen.push(store.state.n)));
  stops.push(onStateCommitted(() => { throw new Error('observer failed'); }));
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  stops.push(() => errors.mockRestore());
  store.dispatch({ type: 'inc' });
  expect(seen).toEqual([1]); // the committed (reduced) state, synchronously
  store.dispatch({ type: 'noop' }); // refused / unchanged: nothing
  expect(seen).toEqual([1]);
  try { store.dispatch({ type: 'boom' }); } catch { /* the store's own error semantics */ }
  expect(seen).toEqual([1]);
  store.dispatch({ type: 'inc' });
  expect(seen).toEqual([1, 2]); // a failing observer never blocks dispatch or others
  expect(store.state.n).toBe(2);
});
