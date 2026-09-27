import { describe, expect, it } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { initialAppState, rootReducer, staging, type AppAction, type AppState } from '../src/model.js';

// TestStore staging options wrap the application's declaration: { staging, serialize }.
const stagedStore = (url = '/') =>
  createTestStore<AppState, AppAction>({
    initialState: initialAppState(url),
    reducer: rootReducer,
    staging: { staging, serialize: state => state.url }
  });

describe('staged catalog → detail navigation', () => {
  it('admits, commits on cue, and records the outcome', async () => {
    const store = stagedStore();

    const handle = store.request({ to: '/items/pavilion' });
    const status = handle.status;
    if (status === 'pending' || status.type !== 'admitted') throw new Error('expected admission');
    const tx = status.transaction;

    // Protocol events: the request result, then the admitted transaction.
    await store.receiveProtocol({ kind: 'request', request: handle.id, result: status });
    await store.receiveProtocol({ kind: 'admitted', transaction: tx, request: handle.id });

    // Nothing reaches the reducer before the cue.
    expect(store.state.page?.type).toBe('catalog');

    // TestStore cues manually by default (cueMode: 'manual').
    store.cue(tx);

    // Domain: exactly one ordinary action; the page really changes.
    await store.receive({ type: 'navigate', url: '/items/pavilion' }, state => {
      expect(state.page?.type).toBe('detail');
    });
    await store.receiveProtocol({
      kind: 'terminal',
      transaction: tx,
      outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/items/pavilion', history: 'written' }
    });
    await store.finish();
  });

  it('commits at the absolute deadline without a cue', async () => {
    const store = stagedStore();
    // Deadline = preparationMs (600) + cueMs + cueSlackMs (250) with the default budgets.
    store.request({ to: '/items/harbour' }, { motion: { cueMs: 200 } });
    await store.receiveProtocol({ kind: 'request' });
    await store.receiveProtocol({ kind: 'admitted' });

    await store.advanceTime(1050);

    await store.receive({ type: 'navigate', url: '/items/harbour' });
    await store.receiveProtocol({ kind: 'terminal', outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/items/harbour', history: 'written' } });
    await store.finish();
  });

  it('a newer request supersedes the pending one', async () => {
    const store = stagedStore();
    store.request({ to: '/items/pavilion' });
    await store.receiveProtocol({ kind: 'request' });
    const first = await store.receiveProtocol({ kind: 'admitted' });
    if (first.kind !== 'admitted') throw new Error('expected admission');

    store.request({ to: '/items/harbour' });
    await store.receiveProtocol({ kind: 'terminal', transaction: first.transaction, outcome: { type: 'superseded', attempted: 0, domainCommitted: false } });
    await store.receiveProtocol({ kind: 'request' });
    await store.receiveProtocol({ kind: 'admitted' });

    store.cue();
    await store.receive({ type: 'navigate', url: '/items/harbour' });
    await store.receiveProtocol({ kind: 'terminal' });
    await store.finish();
  });

  it('return: true abandons the pending transition and stays put', async () => {
    const store = stagedStore();
    store.request({ to: '/items/pavilion' });
    await store.receiveProtocol({ kind: 'request' });
    const admitted = await store.receiveProtocol({ kind: 'admitted' });
    if (admitted.kind !== 'admitted') throw new Error('expected admission');

    store.request({ to: '/' }, { return: true });
    await store.receiveProtocol({ kind: 'terminal', transaction: admitted.transaction, outcome: { type: 'cancelled', reason: 'returned', attempted: 0, domainCommitted: false } });
    await store.receiveProtocol({ kind: 'request', result: { type: 'returned' } });

    // With nothing pending, return intent is `unchanged`; it never navigates.
    store.request({ to: '/items/pavilion' }, { return: true });
    await store.receiveProtocol({ kind: 'request', result: { type: 'unchanged' } });

    expect(store.state.url).toBe('/');
    await store.finish();
  });

  it('a request for the current URL while a transition is pending returns to it', async () => {
    const store = stagedStore();
    store.request({ to: '/items/pavilion' });
    await store.receiveProtocol({ kind: 'request' });
    const admitted = await store.receiveProtocol({ kind: 'admitted' });
    if (admitted.kind !== 'admitted') throw new Error('expected admission');

    // No return option: the current URL alone makes this a return.
    store.request({ to: '/' });
    await store.receiveProtocol({ kind: 'terminal', transaction: admitted.transaction, outcome: { type: 'cancelled', reason: 'returned', attempted: 0, domainCommitted: false } });
    await store.receiveProtocol({ kind: 'request', result: { type: 'returned' } });
    expect(store.state.url).toBe('/');
    await store.finish();
  });

  it('policy false at admission is a rejected request, not a transaction', async () => {
    const store = createTestStore<AppState, AppAction>({
      initialState: { url: '/', page: null },
      reducer: rootReducer,
      staging: { staging, serialize: state => state.url }
    });
    store.request({ to: '/items/pavilion' });
    await store.receiveProtocol({ kind: 'request', result: { type: 'rejected' } });
    expect(store.state.url).toBe('/');
    await store.finish();
  });
});
