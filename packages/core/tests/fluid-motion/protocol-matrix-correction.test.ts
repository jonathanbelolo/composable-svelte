/**
 * Complex protocol matrix (retained Opus): real correction chains through the actual managed history
 * connection/binding, observation vs settlement classification, reentrant requests, reserved commit
 * ordering, exact-turn history with writePolicy counts, and TestStore adapter parity. Shared scenarios
 * run on the production store and on TestStore's own staging adapter.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createChainRig, type ChainRig, type ChainRigOptions } from './protocol-matrix-fixtures/history-chain.js';
import type { TestStore } from '../../src/lib/test/index.js';
import type { ChainAction, ChainState } from './protocol-matrix-fixtures/history-chain.js';

const rigs: ChainRig[] = [];
afterEach(() => { for (const rig of rigs.splice(0)) rig.destroy(); });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const pushes = (rig: ChainRig) => rig.port.writes.filter(write => write.kind === 'push').length;
const terminalOf = (rig: ChainRig, tx: number) => rig.events.find(event => event.kind === 'terminal' && event.transaction === tx);

describe.each(['production', 'teststore'] as const)('correction chains and reentrancy (%s)', runtime => {
  const make = (options: ChainRigOptions = {}) => { const rig = createChainRig({ runtime, ...options }); rigs.push(rig); return rig; };
  /** Builds /start → /one → /two (two real pushes), locks, and vetoes a user Back: a correction is in flight. */
  const vetoedBack = (rig: ChainRig, beforeBack?: () => void) => {
    rig.dispatch({ type: 'go', url: '/one' });
    rig.dispatch({ type: 'go', url: '/two' });
    expect(pushes(rig)).toBe(2);
    rig.dispatch({ type: 'lock' });
    beforeBack?.();
    rig.port.back();
  };

  it('vetoed Back starts a real correction: barrier closes; matched arrival does not invalidate and reopens staging', async () => {
    const rig = make();
    let before!: ReturnType<typeof rig.coordinator.request>;
    vetoedBack(rig, () => {
      before = rig.coordinator.request({ to: '/three' }, {});
      expect(before.status).toMatchObject({ type: 'admitted' });
    });
    // Observation cancelled the older intention; the traversal's refused domain turn ran; correction requested.
    expect(terminalOf(rig, rig.txOf(before))).toMatchObject({ outcome: { type: 'cancelled', reason: 'traversal', attempted: 0 } });
    expect(rig.trace).toEqual(['go:/one', 'go:/two', 'go:/one']);
    expect(rig.port.gos).toEqual([1]);
    expect(rig.port.index).toBe(1);
    // Barrier: a fresh drop request is unavailable; a default request degrades to exactly one immediate turn.
    expect(rig.coordinator.request({ to: '/three' }, {}, { onUnavailable: 'drop' }).status).toEqual({ type: 'dropped', reason: 'historyBarrier' });
    const degraded = rig.coordinator.request({ to: '/three' }, {});
    expect(degraded.status).toMatchObject({ type: 'degraded', reason: 'historyBarrier', outcome: { type: 'refused', attempted: 1, history: 'unchanged' } });
    expect(rig.trace.filter(entry => entry === 'go:/three')).toHaveLength(1);
    // Reentrant capture during the correction, dequeued after the matched arrival: arrival changes no
    // generation (fresh, not stale) and opens the barrier (admitted, not degraded).
    rig.dispatch({ type: 'unlock' });
    let reentrant: ReturnType<typeof rig.coordinator.request> | undefined;
    const stop = rig.subscribe(state => {
      if (state.tick === 1 && !reentrant) { reentrant = rig.coordinator.request({ to: '/three' }, {}); rig.port.deliverGo(); }
    });
    rig.dispatch({ type: 'tick' });
    stop();
    expect(rig.port.index).toBe(2);
    expect(reentrant!.status).toMatchObject({ type: 'admitted' });
    expect(pushes(rig)).toBe(2);
    rig.coordinator.cue(rig.txOf(reentrant!));
    expect(terminalOf(rig, rig.txOf(reentrant!))).toMatchObject({ outcome: { type: 'committed', route: 'accepted', attempted: 1, history: 'written' } });
    expect(pushes(rig)).toBe(3);
    await flush();
  });

  it('failed correction that re-establishes the accepted entry ends uncertainty; staging is available again', async () => {
    const rig = make({ traverseTo: true });
    rig.port.rejectTraverseTo(true);
    vetoedBack(rig);
    await flush();
    // The connection rebased the visited entry to the accepted URL (a real replace), then re-established.
    expect(rig.port.writes.at(-1)).toEqual({ kind: 'replace', url: '/two' });
    expect(rig.port.read().url).toBe('/two');
    expect(rig.history.some(event => event.type === 'historyRebased')).toBe(true);
    rig.dispatch({ type: 'unlock' });
    expect(rig.coordinator.request({ to: '/three' }, {}).status).toMatchObject({ type: 'admitted' });
  });

  it('failed correction without re-establishment leaves history uncertain until a later accepted write', async () => {
    const rig = make({ traverseTo: true });
    rig.port.rejectTraverseTo(true);
    rig.port.failReplaceWhen(url => url === '/two');
    vetoedBack(rig);
    await flush();
    // The recovery rebase write failed: no accepted entry re-established, so history is uncertain.
    expect(rig.history.some(event => event.type === 'historyRebased')).toBe(false);
    expect(rig.coordinator.request({ to: '/three' }, {}, { onUnavailable: 'drop' }).status).toEqual({ type: 'dropped', reason: 'historyUncertain' });
    rig.port.failReplaceWhen(undefined);
    const writes = rig.port.writes.length;
    // The binding's existing retry on a later committed turn completes an accepted write, ending uncertainty.
    rig.dispatch({ type: 'unlock' });
    expect(rig.port.writes.length).toBe(writes + 1);
    expect(rig.port.writes.at(-1)!.url).toBe('/two');
    expect(rig.coordinator.request({ to: '/four' }, {}).status).toMatchObject({ type: 'admitted' });
  });

  it('fragment-only at observation, reclassified route-affecting at settlement, cancels before the traversal turn', () => {
    const rig = make({ routeKey: () => 'app' });
    const pending = rig.coordinator.request({ to: '/three' }, {});
    let observedPending: unknown;
    const stop = rig.subscribe(state => {
      if (state.tick !== 1 || observedPending) return;
      rig.dispatch({ type: 'go', url: '/other' });
      rig.port.visitNew('/start#section');
      observedPending = rig.coordinator.status.transaction(rig.txOf(pending));
    });
    rig.dispatch({ type: 'tick' });
    stop();
    // At observation the accepted URL was /start: fragment-only, nothing cancelled.
    expect(observedPending).toMatchObject({ phase: 'pending' });
    // At settlement /other had been accepted: reclassified, cancelled(traversal) before go:/start ran.
    const terminal = terminalOf(rig, rig.txOf(pending));
    expect(terminal).toMatchObject({ outcome: { type: 'cancelled', reason: 'traversal', attempted: 0 } });
    expect(rig.trace).toEqual(['go:/other', 'go:/start']);
    expect(rig.events.indexOf(terminal!)).toBeGreaterThan(-1);
  });

  it('a request captured between traversal observation and settlement is fresh; one captured before is stale', () => {
    const rig = make();
    let before: ReturnType<typeof rig.coordinator.request> | undefined;
    let after: ReturnType<typeof rig.coordinator.request> | undefined;
    const stop = rig.subscribe(state => {
      if (state.tick !== 1 || before) return;
      before = rig.coordinator.request({ to: '/three' }, {});
      rig.port.visitNew('/visited');
      after = rig.coordinator.request({ to: '/four' }, {});
    });
    rig.dispatch({ type: 'tick' });
    stop();
    expect(before!.status).toEqual({ type: 'stale', reason: 'traversal' });
    expect(after!.status).toMatchObject({ type: 'admitted' });
    expect(rig.trace).toEqual(['go:/visited']);
  });

  it('a reserved commit wins over a newer request, an explicit cancel and a return queued behind it', () => {
    const rig = make();
    const staged = rig.coordinator.request({ to: '/three' }, {});
    const tx = rig.txOf(staged);
    let newer: ReturnType<typeof rig.coordinator.request> | undefined;
    let back: ReturnType<typeof rig.coordinator.request> | undefined;
    let explicitReturn: ReturnType<typeof rig.coordinator.request> | undefined;
    const stop = rig.subscribe(state => {
      if (state.tick !== 1 || newer) return;
      rig.coordinator.cue(tx);
      newer = rig.coordinator.request({ to: '/four' }, {});
      rig.coordinator.cancel(tx, undefined);
      back = rig.coordinator.request({ to: '/start' }, {});
      explicitReturn = rig.coordinator.request({ to: '/start' }, {}, { return: true });
    });
    rig.dispatch({ type: 'tick' });
    stop();
    // The reserved commit ran first: committed, never superseded/cancelled/returned.
    expect(terminalOf(rig, tx)).toMatchObject({ outcome: { type: 'committed', route: 'accepted', attempted: 1, history: 'written' } });
    expect(rig.trace).toEqual(['go:/three']);
    // The newer request was admitted against the resulting state; the late cancel is a no-op diagnostic.
    expect(newer!.status).toMatchObject({ type: 'admitted' });
    expect(rig.diagnostics).toContainEqual({ kind: 'staleCancel', transaction: tx });
    // '/start' no longer equals the committed URL: an ordinary request superseding `newer`.
    expect(back!.status).toMatchObject({ type: 'admitted' });
    expect(terminalOf(rig, rig.txOf(newer!))).toMatchObject({ outcome: { type: 'superseded' } });
    // Explicit return intent now cancels the pending `back` (returned), with zero actions.
    expect(explicitReturn!.status).toEqual({ type: 'returned' });
    expect(terminalOf(rig, rig.txOf(back!))).toMatchObject({ outcome: { type: 'cancelled', reason: 'returned' } });
    expect(pushes(rig)).toBe(1);
  });

  it('a request made inside the reserved commit turn is admitted after it against the resulting state', () => {
    const rig = make();
    const staged = rig.coordinator.request({ to: '/three' }, {});
    let inside: ReturnType<typeof rig.coordinator.request> | undefined;
    const stop = rig.subscribe(state => { if (state.url === '/three' && !inside) inside = rig.coordinator.request({ to: '/four' }, {}); });
    rig.coordinator.cue(rig.txOf(staged));
    stop();
    expect(terminalOf(rig, rig.txOf(staged))).toMatchObject({ outcome: { type: 'committed', route: 'accepted' } });
    expect(inside!.status).toMatchObject({ type: 'admitted' });
    const order = rig.events.map(event => event.kind === 'terminal' ? `terminal:${event.transaction}` : event.kind === 'admitted' ? `admitted:${event.transaction}` : 'request');
    expect(order.indexOf(`terminal:${rig.txOf(staged)}`)).toBeLessThan(order.indexOf(`admitted:${rig.txOf(inside!)}`));
  });

  it('exact-turn history: writePolicy runs once per real write; retirement before/after the write and same-state refusal', () => {
    const accepted = make();
    const handle = accepted.coordinator.request({ to: '/three' }, {});
    accepted.coordinator.cue(accepted.txOf(handle));
    expect(accepted.writePolicy).toHaveBeenCalledTimes(1);
    expect(terminalOf(accepted, accepted.txOf(handle))).toMatchObject({ outcome: { history: 'written' } });
    // Same-state refusal after a written turn: its own turn wrote nothing.
    const refused = accepted.coordinator.request({ to: '/blocked' }, {});
    accepted.coordinator.cue(accepted.txOf(refused));
    expect(accepted.writePolicy).toHaveBeenCalledTimes(1);
    expect(terminalOf(accepted, accepted.txOf(refused))).toMatchObject({ outcome: { type: 'refused', history: 'unchanged' } });

    const beforeWrite = make({ before: (subscribe, destroy) => { subscribe(state => { if (state.url === '/three') destroy(); }); } });
    const early = beforeWrite.coordinator.request({ to: '/three' }, {});
    beforeWrite.coordinator.cue(beforeWrite.txOf(early));
    expect(beforeWrite.writePolicy).not.toHaveBeenCalled();
    expect(pushes(beforeWrite)).toBe(0);
    expect(terminalOf(beforeWrite, beforeWrite.txOf(early))).toMatchObject({ outcome: { type: 'committed', domainCommitted: true, history: 'failed' } });

    const afterWrite = make();
    const stop = afterWrite.subscribe(state => { if (state.url === '/three') afterWrite.binding!.dispose(); });
    const late = afterWrite.coordinator.request({ to: '/three' }, {});
    afterWrite.coordinator.cue(afterWrite.txOf(late));
    stop();
    expect(afterWrite.writePolicy).toHaveBeenCalledTimes(1);
    expect(pushes(afterWrite)).toBe(1);
    expect(terminalOf(afterWrite, afterWrite.txOf(late))).toMatchObject({ outcome: { type: 'committed', history: 'written' } });
  });
});

describe('TestStore adapter parity (its own request/cue/receiveProtocol/receive API over the real binding)', () => {
  it('staged commit: identical protocol transcript to production and the domain action received exactly once', async () => {
    const production = createChainRig({ runtime: 'production' });
    const adapter = createChainRig({ runtime: 'teststore', exhaustivity: 'on' });
    rigs.push(production, adapter);
    const store = adapter.store as TestStore<ChainState, ChainAction>;
    const prodHandle = production.coordinator.request({ to: '/three' }, {});
    production.coordinator.cue(production.txOf(prodHandle));
    const handle = store.request({ to: '/three' });
    expect(handle.status).toEqual(prodHandle.status);
    store.cue();
    await store.receive({ type: 'go', url: '/three' });
    await store.receiveProtocol({ kind: 'request', request: handle.id, result: { type: 'admitted', transaction: adapter.txOf(handle) } });
    await store.receiveProtocol({ kind: 'admitted', transaction: adapter.txOf(handle) });
    await store.receiveProtocol({ kind: 'terminal', transaction: adapter.txOf(handle), outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/three', history: 'written' } });
    expect(adapter.events).toEqual(production.events);
    expect(adapter.trace).toEqual(['go:/three']);
    expect(pushes(adapter)).toBe(1);
    // finish() correctly counts the live binding subscription; release the attachment first.
    adapter.binding!.dispose();
    await store.finish();
  });

  it('degraded request under a real history barrier: one immediate action received exactly once, same result as production', async () => {
    const production = createChainRig({ runtime: 'production' });
    const adapter = createChainRig({ runtime: 'teststore', exhaustivity: 'on' });
    rigs.push(production, adapter);
    const store = adapter.store as TestStore<ChainState, ChainAction>;
    for (const rig of [production, adapter]) {
      rig.dispatch({ type: 'go', url: '/one' });
      rig.dispatch({ type: 'go', url: '/two' });
      rig.dispatch({ type: 'lock' });
      rig.port.back();
    }
    await store.receive([{ type: 'go', url: '/one' }, { type: 'go', url: '/two' }, { type: 'lock' }, { type: 'go', url: '/one' }]);
    for (const rig of [production, adapter]) rig.dispatch({ type: 'unlock' });
    await store.receive({ type: 'unlock' });
    const prodHandle = production.coordinator.request({ to: '/three' }, {});
    const handle = store.request({ to: '/three' });
    expect(handle.status).toEqual(prodHandle.status);
    expect(handle.status).toMatchObject({ type: 'degraded', reason: 'historyBarrier', outcome: { type: 'committed', route: 'accepted', attempted: 1 } });
    await store.receive({ type: 'go', url: '/three' });
    await store.receiveProtocol({ kind: 'request', request: handle.id });
    expect(adapter.trace.filter(entry => entry === 'go:/three')).toHaveLength(1);
    adapter.binding!.dispose();
    await store.finish();
  });
});
