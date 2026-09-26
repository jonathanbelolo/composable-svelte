import { afterEach, expect, it } from 'vitest';
import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import { createTestStore } from '@composable-svelte/core/test';
import { requestInitial, requestReducer } from '../src/request';
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(clean => clean()); });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture() {
  const calls: { query: string; signal: AbortSignal | undefined; work: ReturnType<typeof deferred<string>> }[] = [];
  const store = createStore({ initialState: requestInitial(), reducer: requestReducer,
    dependencies: { search: (query: string, signal: AbortSignal | undefined) => {
      const work = deferred<string>(); calls.push({ query, signal, work }); return work.promise;
    } }, execution: { mode: 'managed' } });
  cleanups.push(() => store.destroy());
  return { store, calls };
}
it.each(['success', 'failure'])('ignores old %s from an abort-ignoring A→B→A transport', async outcome => {
  const { store, calls } = fixture();
  for (const query of ['A', 'B', 'A']) store.dispatch({ type: 'search', query });
  expect(calls[0]!.signal?.aborted).toBe(true);
  calls[2]!.work.resolve('fresh'); await flush();
  if (outcome === 'success') calls[0]!.work.resolve('obsolete'); else calls[0]!.work.reject(new Error('obsolete'));
  calls[1]!.work.resolve('also obsolete'); await flush();
  expect(store.state.accepted).toEqual({ query: 'A', value: 'fresh' });
  expect(store.state.phase).toBe('ready');
});
it('keeps accepted query provenance through pending work and failure', async () => {
  const { store, calls } = fixture();
  store.dispatch({ type: 'search', query: 'A' }); calls[0]!.work.resolve('result'); await flush();
  store.dispatch({ type: 'search', query: 'B' }); calls[1]!.work.reject(new Error('offline')); await flush();
  expect(store.state).toMatchObject({ query: 'B', phase: 'failed', accepted: { query: 'A', value: 'result' } });
});
it('root destruction aborts work and rejects late state changes', async () => {
  const { store, calls } = fixture(); store.dispatch({ type: 'search', query: 'A' });
  const before = store.state; store.destroy(); calls[0]!.work.resolve('late'); await flush();
  expect(calls[0]!.signal?.aborted).toBe(true); expect(store.state).toBe(before);
});
it('TestStore receives real managed results and finishes exhaustively', async () => {
  const store = createTestStore({ initialState: requestInitial(), reducer: requestReducer,
    dependencies: { search: async () => 'value' }, execution: { mode: 'managed' } });
  await store.send({ type: 'search', query: 'A' });
  await store.receive({ type: 'received', request: 1, query: 'A', value: 'value' }, state => expect(state.phase).toBe('ready'));
  await store.finish();
});
// Paired negative control: same runtime/schedule, only the reducer epoch gate differs.
it.each([false, true])('already-enqueued result requires a reducer epoch gate: guarded=%s', guarded => {
  type S = { epoch: number; value: string };
  type A = { type: 'start' } | { type: 'result'; epoch: number };
  const reducer: Reducer<S, A> = (state, action) => action.type === 'start'
    ? [{ ...state, epoch: state.epoch + 1 }, Effect.cancellable('job', dispatch => {
        if (state.epoch === 0) dispatch({ type: 'result', epoch: 1 });
      })]
    : [guarded && action.epoch !== state.epoch ? state : { ...state, value: 'obsolete' }, Effect.none()];
  const store = createStore({ initialState: { epoch: 0, value: '' }, reducer, execution: { mode: 'managed' } });
  cleanups.push(() => store.destroy());
  let queued = false;
  store.subscribeToActions!((action) => {
    if (action.type === 'start' && !queued) { queued = true; store.dispatch({ type: 'start' }); }
  });
  store.dispatch({ type: 'start' });
  expect(store.state).toEqual({ epoch: 2, value: guarded ? '' : 'obsolete' });
});
it('explicit cancellation invalidates public results as well as the transport', async () => {
  const { store, calls } = fixture(); store.dispatch({ type: 'search', query: 'A' }); store.dispatch({ type: 'cancel' });
  store.dispatch({ type: 'received', request: 1, query: 'A', value: 'queued' });
  calls[0]!.work.resolve('late'); await flush(); expect(store.state.accepted).toBeNull(); expect(store.state.phase).toBe('idle');
});
it('isolated latest callbacks need neither epochs nor explicit abort checks', async () => {
  type A = { type: 'start' } | { type: 'result'; value: string };
  const work = [deferred<string>(), deferred<string>()]; let next = 0;
  const reducer: Reducer<string, A> = (state, action) => action.type === 'result'
    ? [action.value, Effect.none()]
    : [state, Effect.cancellable('job', async dispatch => {
        const value = await work[next++]!.promise; dispatch({ type: 'result', value });
      })];
  const store = createStore({ initialState: '', reducer, execution: { mode: 'managed' } });
  cleanups.push(() => store.destroy()); store.dispatch({ type: 'start' }); store.dispatch({ type: 'start' });
  work[1]!.resolve('latest'); await flush(); work[0]!.resolve('old'); await flush(); expect(store.state).toBe('latest');
});
it('TestStore exhaustively observes cancellation and no late completion', async () => {
  const work = deferred<string>();
  const store = createTestStore({ initialState: requestInitial(), reducer: requestReducer,
    dependencies: { search: () => work.promise }, execution: { mode: 'managed' } });
  await store.send({ type: 'search', query: 'A' }); await store.send({ type: 'cancel' });
  work.resolve('late'); await flush(); await store.finish(); expect(store.state.accepted).toBeNull();
});
