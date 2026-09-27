/**
 * Focused tests for the staged routing TestStore adapter.
 *
 * Verifies Production and TestStore parity under specs/frontend/fluid-layout-motion-design.md:
 * 1. Exactly one received domain action from committed staged turn
 * 2. No stale cue commit
 * 3. Explicit unavailable degradation and drop
 * 4. Owner retirement from captured view
 * 5. Deadline advanceTime driving commit
 * 6. Meaningful finish failures (pending request, pending transaction, unasserted events, deadline timers)
 * 7. Queued race: distinct traversal observation versus settlement
 * 8. Rejected reduction appears only as failure/rejection (zero received domain actions)
 * 9. Physical write failure in StagingEligibility fixture
 */
import { describe, expect, it } from 'vitest';
import { STAGED_DEFAULTS } from '../../src/lib/routing/staged/coordinator.js';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createTestStore, createStagingFixture, TestStagingFixture } from '../../src/lib/test/index.js';
import { integrate } from '../../src/lib/navigation/integrate.js';
import { optionalSlot } from '../../src/lib/navigation/managed-integration.js';
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';
import type { ApplicationStaging, TransactionId } from '../../src/lib/routing/staged/types.js';

type State = {
  url: string;
  child: { count: number } | null;
  tick: number;
};

type Action =
  | { type: 'go'; url: string }
  | { type: 'replace' }
  | { type: 'tick' }
  | { type: 'child'; action: PresentationAction<{ type: 'inc' }> };

type Intent = { to: string };

const slot = optionalSlot<State, Action>()('child');

function createStagedTestRig(options?: {
  policy?: (state: State, input: any) => boolean;
  onUnavailable?: 'immediate' | 'drop';
  budgets?: { preparationMs?: number; cueSlackMs?: number };
  cueMode?: 'manual' | 'auto';
  routeKey?: (state: State) => string;
  fixture?: TestStagingFixture;
}) {
  const reducer: Reducer<State, Action> = (state, action) => {
    if (action.type === 'go') {
      if (action.url === '/throw') throw new Error('route reducer failed');
      if (action.url === '/blocked') return [state, Effect.none()];
      return [{ ...state, url: action.url }, Effect.none()];
    }
    if (action.type === 'replace') return [{ ...state, child: { count: 0 } }, Effect.none()];
    if (action.type === 'tick') return [{ ...state, tick: state.tick + 1 }, Effect.none()];
    return [state, Effect.none()];
  };

  const childReducer: Reducer<{ count: number }, { type: 'inc' }> = (state) => [
    { count: state.count + 1 },
    Effect.none()
  ];

  const composition = integrate(reducer)
    .managed()
    .with(slot, childReducer, { replaceOn: (action) => action.type === 'replace' })
    .build();

  const stagingFixture = options?.fixture ?? createStagingFixture({ attached: true });

  const staging: ApplicationStaging<State, Action, Intent> = {
    policy: options?.policy ?? (() => true),
    commit: (intent) => ({ action: { type: 'go', url: intent.to }, expectedURL: intent.to }),
    routeSlot: slot,
    ...(options?.routeKey ? { routeKey: options.routeKey } : {}),
    ...(options?.onUnavailable ? { onUnavailable: options.onUnavailable } : {}),
    ...(options?.budgets ? { budgets: options.budgets } : {})
  };

  const store = createTestStore<State, Action>({
    initialState: { url: '/start', child: { count: 0 }, tick: 0 },
    reducer: composition.reducer,
    execution: composition.execution,
    staging: {
      staging,
      serialize: (state) => state.url,
      destination: (url) => url,
      outletAttached: true,
      eligibility: stagingFixture,
      cueMode: options?.cueMode ?? 'manual'
    }
  });

  return {
    store,
    stagingFixture,
    childView: () => composition.bind(store as any, slot)!
  };
}

describe('TestStore staged routing adapter', () => {
  it('1. admitted transaction commits only at cue: exactly one domain action received', async () => {
    const { store } = createStagedTestRig();

    const handle = store.request({ to: '/next' });
    const status = handle.status;
    if (status === 'pending' || status.type !== 'admitted') throw new Error('Expected admitted handle');
    const tx = status.transaction;
    expect(status).toEqual({ type: 'admitted', transaction: tx });

    // Assert protocol events for admission
    await store.receiveProtocol({
      kind: 'request',
      request: handle.id,
      result: status
    });
    await store.receiveProtocol({
      kind: 'admitted',
      transaction: tx,
      request: handle.id
    });

    // Before cue: no domain actions dispatched or received, state unchanged
    expect(store.state.url).toBe('/start');
    store.assertNoPendingActions();

    // Cue transaction
    store.cue();

    // The domain action appears in ordinary receive exactly once
    await store.receive({ type: 'go', url: '/next' }, (state) => {
      expect(state.url).toBe('/next');
    });

    // Terminal protocol event
    await store.receiveProtocol({
      kind: 'terminal',
      transaction: tx,
      outcome: {
        type: 'committed',
        route: 'accepted',
        attempted: 1,
        domainCommitted: true,
        url: '/next',
        history: 'written'
      }
    });

    await store.finish();
  });

  it('2. no stale cue commit: a cancelled transaction drops cues and emits no domain actions', async () => {
    const { store } = createStagedTestRig();

    const handle = store.request({ to: '/next' });
    const tx = (handle.status as { transaction: TransactionId }).transaction;

    await store.receiveProtocol({ kind: 'request' });
    await store.receiveProtocol({ kind: 'admitted' });

    // Cancel transaction explicitly
    store.cancelStaged(tx);

    await store.receiveProtocol({
      kind: 'terminal',
      transaction: tx,
      outcome: { type: 'cancelled', reason: 'explicit', attempted: 0, domainCommitted: false }
    });

    // Now issue a stale cue for the already-terminal transaction
    store.cue(tx);

    // Verify zero domain actions were queued or received
    store.assertNoPendingActions();
    expect(store.state.url).toBe('/start');

    await store.finish();
  });

  it('3a. explicit unavailable degradation: commits immediately and appears in receive exactly once', async () => {
    const { store, stagingFixture } = createStagedTestRig();

    // Detach epoch makes staging unavailable with reason 'noBinding'
    stagingFixture.detach();

    const handle = store.request({ to: '/next' });
    expect(handle.status).toMatchObject({
      type: 'degraded',
      reason: 'noBinding',
      outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true }
    });

    // Degraded commit action appears in ordinary receive exactly once
    await store.receive({ type: 'go', url: '/next' }, (state) => {
      expect(state.url).toBe('/next');
    });

    // Protocol event for degraded request
    await store.receiveProtocol({
      kind: 'request',
      request: handle.id,
      result: {
        type: 'degraded',
        reason: 'noBinding',
        outcome: {
          type: 'committed',
          route: 'accepted',
          attempted: 1,
          domainCommitted: true,
          url: '/next',
          history: 'unchanged'
        }
      }
    });

    await store.finish();
  });

  it('3b. explicit unavailable drop: yields zero domain actions', async () => {
    const { store, stagingFixture } = createStagedTestRig({ onUnavailable: 'drop' });

    stagingFixture.detach();

    const handle = store.request({ to: '/next' });
    expect(handle.status).toEqual({ type: 'dropped', reason: 'noBinding' });

    await store.receiveProtocol({
      kind: 'request',
      request: handle.id,
      result: { type: 'dropped', reason: 'noBinding' }
    });

    // Dropped request emits zero domain actions
    store.assertNoPendingActions();
    expect(store.state.url).toBe('/start');

    await store.finish();
  });

  it('4. owner retirement cancels pending transaction from captured view; late cue cannot commit', async () => {
    const { store, childView } = createStagedTestRig();

    const view = childView();
    const handle = store.request({ to: '/next' }, view);
    const tx = (handle.status as { transaction: TransactionId }).transaction;

    await store.receiveProtocol({ kind: 'request' });
    await store.receiveProtocol({ kind: 'admitted' });

    // Send action that replaces/reconciles child owner, causing retirement
    await store.send({ type: 'replace' });

    // Retirement cancels the transaction with reason 'ownerRetired'
    await store.receiveProtocol({
      kind: 'terminal',
      transaction: tx,
      outcome: { type: 'cancelled', reason: 'ownerRetired', attempted: 0, domainCommitted: false }
    });

    // A late cue cannot commit
    store.cue(tx);

    // No domain actions received from the staged request
    store.assertNoPendingActions();
    expect(store.state.url).toBe('/start');

    await store.finish();
  });

  it('5. deadline advanceTime: deterministic scheduler advances and triggers commit', async () => {
    const { store } = createStagedTestRig({
      budgets: { preparationMs: 10, cueSlackMs: 10 }
    });

    // Request with 20ms cue -> deadline = 10 + 20 + 10 = 40ms
    const handle = store.request({ to: '/next' }, { motion: { cueMs: 20 } });
    const tx = (handle.status as { transaction: TransactionId }).transaction;

    await store.receiveProtocol({ kind: 'request' });
    await store.receiveProtocol({ kind: 'admitted' });

    // Advance 20ms: deadline not yet reached, no commit
    await store.advanceTime(20);
    store.assertNoPendingActions();
    expect(store.state.url).toBe('/start');

    // Advance remaining 25ms: deadline expires (total 45ms > 40ms) and commits
    await store.advanceTime(25);

    // The commit action is delivered and received
    await store.receive({ type: 'go', url: '/next' }, (state) => {
      expect(state.url).toBe('/next');
    });

    await store.receiveProtocol({
      kind: 'terminal',
      transaction: tx,
      outcome: {
        type: 'committed',
        route: 'accepted',
        attempted: 1,
        domainCommitted: true,
        url: '/next',
        history: 'written'
      }
    });

    await store.finish();
  });

  it('6a. meaningful finish failures: pending transaction and its own staged deadline are named independently', async () => {
    const { store } = createStagedTestRig({
      budgets: { preparationMs: 100, cueSlackMs: 100 }
    });

    const handle = store.request({ to: '/next' });
    const tx = (handle.status as { transaction: TransactionId }).transaction;
    await store.receiveProtocol({ kind: 'request' });
    await store.receiveProtocol({ kind: 'admitted' });
    expect(store.stagedCoordinator!.status.pendingDeadlines()).toEqual([tx]);

    const error = await store.finish().then(() => undefined, (e: Error) => e);
    expect(error?.message).toMatch(/staged routing is not settled/);
    expect(error?.message).toContain(`- transaction ${tx} is still pending`);
    expect(error?.message).toContain(`- staged deadline timer remains for transaction ${tx}`);
    expect(error?.message).not.toContain('protocol event(s) not asserted');
    store.destroy();
  });

  it('6b. the deadline fires, commits and clears: finish() passes with nothing left', async () => {
    const { store } = createStagedTestRig();
    const handle = store.request({ to: '/other' });
    const tx = (handle.status as { transaction: TransactionId }).transaction;
    await store.receiveProtocol([{ kind: 'request' }, { kind: 'admitted' }]);
    // The default deadline without a cue: preparation + cue slack (calibrated defaults, not a literal).
    await store.advanceTime(STAGED_DEFAULTS.preparationMs + STAGED_DEFAULTS.cueSlackMs);
    await store.receive({ type: 'go', url: '/other' });
    await store.receiveProtocol({ kind: 'terminal', transaction: tx, outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/other', history: 'written' } });
    expect(store.stagedCoordinator!.status.pendingDeadlines()).toEqual([]);
    await store.finish();
  });

  it('6c. meaningful finish failures: unasserted protocol events', async () => {
    const { store } = createStagedTestRig();

    store.request({ to: '/next' });
    store.cue();

    // Receive the domain action but leave protocol events unasserted
    await store.receive({ type: 'go', url: '/next' });

    const error = await store.finish().then(() => undefined, (e: Error) => e);
    expect(error?.message).toMatch(/- 3 protocol event\(s\) not asserted/);
    expect(error?.message).not.toMatch(/still pending|deadline timer/);
    store.destroy();
  });

  it('7. queued race: distinct traversal observation vs settlement', async () => {
    const { store, stagingFixture } = createStagedTestRig();

    const handle = store.request({ to: '/next' });
    const status1 = handle.status;
    if (status1 === 'pending' || status1.type !== 'admitted') throw new Error('Expected admitted');
    const tx1 = status1.transaction;
    await store.receiveProtocol({ kind: 'request' });
    await store.receiveProtocol({ kind: 'admitted' });

    // Step 1: Traversal is OBSERVED (synchronous invalidation, generation incremented, barrier closed)
    const traversal = stagingFixture.observeTraversal({ routeAffecting: true });
    expect(stagingFixture.generation()).toBe(1);
    expect(stagingFixture.eligibility()).toBe('historyBarrier');

    // Observation cancels the pending transaction
    await store.receiveProtocol({
      kind: 'terminal',
      transaction: tx1,
      outcome: { type: 'cancelled', reason: 'traversal', attempted: 0, domainCommitted: false }
    });

    // Step 2: Traversal SETTLES (barrier opens, restoring eligibility)
    traversal.settle();
    expect(stagingFixture.eligibility()).toBe('ok');

    // A subsequent request can now be admitted normally
    const handle2 = store.request({ to: '/second' });
    const status2 = handle2.status;
    if (status2 === 'pending' || status2.type !== 'admitted') throw new Error('Expected admitted');
    const tx2 = status2.transaction;
    expect(status2).toEqual({ type: 'admitted', transaction: tx2 });

    await store.receiveProtocol({ kind: 'request', request: handle2.id });
    await store.receiveProtocol({ kind: 'admitted', transaction: tx2 });

    store.cue();
    await store.receive({ type: 'go', url: '/second' });
    await store.receiveProtocol({
      kind: 'terminal',
      transaction: tx2,
      outcome: {
        type: 'committed',
        route: 'accepted',
        attempted: 1,
        domainCommitted: true,
        url: '/second',
        history: 'written'
      }
    });

    await store.finish();
  });

  it('8. rejected reduction appears only as failure/rejection: zero received domain actions', async () => {
    const { store } = createStagedTestRig();

    const handle = store.request({ to: '/throw' });
    const status = handle.status;
    if (status === 'pending' || status.type !== 'admitted') throw new Error('Expected admitted');
    const tx = status.transaction;
    expect(status).toMatchObject({ type: 'admitted' });

    await store.receiveProtocol({ kind: 'request' });
    await store.receiveProtocol({ kind: 'admitted' });

    // The cue does not throw: the rejection goes to the runtime failure sink (interfaces.md
    // revision 4) and surfaces exactly once, at the next TestStore call.
    expect(() => store.cue()).not.toThrow();
    await expect(store.receiveProtocol({ kind: 'terminal' })).rejects.toThrow('route reducer failed');

    // Terminal outcome records failure/reduction
    await store.receiveProtocol(
      event =>
        event.kind === 'terminal' &&
        event.transaction === tx &&
        event.outcome.type === 'failed' &&
        event.outcome.phase === 'reduction',
      event => {
        if (event.kind === 'terminal' && event.outcome.type === 'failed') {
          expect(event.outcome.attempted).toBe(1);
          expect(event.outcome.domainCommitted).toBe(false);
          expect((event.outcome.error as Error).message).toBe('route reducer failed');
        }
      }
    );

    // Zero domain actions appear in receive; the failure was consumed once, so finish() passes
    store.assertNoPendingActions();
    expect(store.state.url).toBe('/start');
    await store.finish();
  });

  it('8b. deadline-driven rejected commit: advanceTime() resolves; the failure surfaces once, at finish()', async () => {
    const { store } = createStagedTestRig({ budgets: { preparationMs: 10, cueSlackMs: 10 } });
    store.request({ to: '/throw' });
    await store.receiveProtocol([{ kind: 'request' }, { kind: 'admitted' }]);
    await expect(store.advanceTime(20)).resolves.toBeUndefined();
    await expect(store.finish()).rejects.toThrow('route reducer failed');
    await store.receiveProtocol(event => event.kind === 'terminal' && event.outcome.type === 'failed' && event.outcome.phase === 'reduction' && !event.outcome.domainCommitted);
    await store.finish();
  });

  it('9. armed write failure: the staged commit reports history failed, then history is uncertain until a later write', async () => {
    const { store, stagingFixture } = createStagedTestRig();

    const handle = store.request({ to: '/next' });
    const tx = (handle.status as { transaction: TransactionId }).transaction;
    await store.receiveProtocol([{ kind: 'request' }, { kind: 'admitted' }]);

    // Arming the failure does not cancel pending work: nothing has failed yet.
    stagingFixture.failNextWrite();
    expect(stagingFixture.eligibility()).toBe('ok');
    expect(store.stagedCoordinator!.status.pending).toBe(tx);

    store.cue();
    await store.receive({ type: 'go', url: '/next' });
    await store.receiveProtocol({
      kind: 'terminal',
      transaction: tx,
      outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/next', history: 'failed' }
    });
    expect(stagingFixture.eligibility()).toBe('historyUncertain');

    // Uncertain history degrades the next request; its successful write ends uncertainty.
    const next = store.request({ to: '/after' });
    expect(next.status).toMatchObject({ type: 'degraded', reason: 'historyUncertain', outcome: { type: 'committed', history: 'written' } });
    await store.receive({ type: 'go', url: '/after' });
    await store.receiveProtocol({ kind: 'request', request: next.id });
    expect(stagingFixture.eligibility()).toBe('ok');

    await store.finish();
  });

  it('10a. staged-only usage arms test hook and fails test cleanup when protocol events unasserted', async () => {
    const { store } = createStagedTestRig();

    // Only issue staged request without send() or receiveProtocol()
    store.request({ to: '/next' });

    // The test finish hook must be armed
    await (store as any)._hookReady;
    expect((store as any)._hook).toBe('armed');

    // Automatic test cleanup (_onTestCleanup) fails with pending staging/unasserted protocol events
    await expect(() => (store as any)._onTestCleanup()).rejects.toThrow(
      /\[TestStore\] finish\(\): staged routing is not settled:\n- transaction 1 is still pending/
    );
    store.destroy();
  });

  it('10b. cue() and cancelStaged() arm test hook and throw pending failures on entry', async () => {
    const { store } = createStagedTestRig();

    expect(() => store.cue()).toThrow(/cue\(\) called with no pending transaction/);
    await (store as any)._hookReady;
    expect((store as any)._hook).toBe('armed');

    expect(() => store.cancelStaged()).toThrow(/cancelStaged\(\) called with no pending transaction/);
    store.destroy();
  });

  it('11a. enableStaging() rejects unsafe late conversion on legacy store', () => {
    const legacyStore = createTestStore({
      initialState: { count: 0 },
      reducer: (state: { count: number }) => [state, Effect.none()]
    });

    expect(() => {
      legacyStore.enableStaging({
        staging: {
          policy: () => true,
          commit: () => ({ action: { type: 'go', url: '/' }, expectedURL: '/' }),
          routeSlot: {}
        },
        serialize: () => '/'
      });
    }).toThrow('[TestStore] enableStaging() requires managed execution mode');
  });

  it('11b. enableStaging() succeeds post-construction on store configured with execution: managed', () => {
    const store = createTestStore({
      initialState: { count: 0 },
      reducer: (state: { count: number }) => [state, Effect.none()],
      execution: { mode: 'managed' }
    });

    const coordinator = store.enableStaging({
      staging: {
        policy: () => true,
        commit: () => ({ action: { type: 'go', url: '/' }, expectedURL: '/' }),
        routeSlot: {}
      },
      serialize: () => '/'
    });

    expect(coordinator).toBeDefined();
    expect(store.stagedCoordinator).toBe(coordinator);
    store.destroy();
  });

  it('12a. attachment epochs do not repeat under custom initialEpoch or custom attach IDs', () => {
    const fixture = new TestStagingFixture({ initialEpoch: 5 });
    expect(fixture.epoch()).toBe(5);

    // Auto attach must not reuse 5 or restart from 1
    const next1 = fixture.attach();
    expect(next1).toBe(6);

    // Explicit attach with higher number advances allocation
    const custom = fixture.attach(10);
    expect(custom).toBe(10);

    const next2 = fixture.attach();
    expect(next2).toBe(11);
  });

  it('12b. attachment replacement invalidates pending work consistently via detached invalidation', async () => {
    const fixture = new TestStagingFixture({ initialEpoch: 1 });
    const { store } = createStagedTestRig({ fixture });

    // Issue request on epoch 1
    const handle = store.request({ to: '/next' });
    const tx = (handle.status as { transaction: TransactionId }).transaction;

    await store.receiveProtocol({ kind: 'request' });
    await store.receiveProtocol({ kind: 'admitted' });

    // In-flight transaction is pending on epoch 1
    expect(store.stagedCoordinator?.status.pending).toBe(tx);

    // Replace attachment with epoch 2
    fixture.attach(2);
    expect(fixture.epoch()).toBe(2);

    // Replacement invalidates pending work from epoch 1 with reason 'detached'
    await store.receiveProtocol({
      kind: 'terminal',
      transaction: tx,
      outcome: { type: 'cancelled', reason: 'detached', attempted: 0, domainCommitted: false }
    });

    expect(store.stagedCoordinator?.status.pending).toBeUndefined();
    await store.finish();
  });
});

describe('TestStore staged adapter corrections (teststore-opus-review D1–D4, D6, E2, E3, E5)', () => {
  const urlReducer: Reducer<{ url: string }, { type: 'go'; url: string }> = (state, action) =>
    [action.url === '/blocked' ? state : { ...state, url: action.url }, Effect.none()];
  const urlStaging = (): ApplicationStaging<{ url: string }, { type: 'go'; url: string }, Intent> => ({
    policy: () => true,
    commit: intent => ({ action: { type: 'go', url: intent.to }, expectedURL: intent.to }),
    routeSlot: {}
  });

  describe('D1 source authority follows the production rule', () => {
    it('rejects an object that is not a captured view instead of treating it as root options', async () => {
      const { store } = createStagedTestRig();
      const notAView = { state: {}, dispatch() {} };
      expect(() => store.request({ to: '/next' }, notAView as never)).toThrow(/captured feature view of this store/);
      expect(() => store.request({ to: '/next' }, { onUnavailable: 'drop' } as never, {})).toThrow(/captured feature view/);
      expect(store.protocolEvents).toEqual([]);
      await store.finish();
    });

    it('rejects a captured view of another store', async () => {
      const a = createStagedTestRig();
      const b = createStagedTestRig();
      expect(() => a.store.request({ to: '/next' }, b.childView())).toThrow(/belongs to another store/);
      expect(a.store.protocolEvents).toEqual([]);
      await a.store.finish();
      await b.store.finish();
    });

    it('explicit root options remain accepted', async () => {
      const { store, stagingFixture } = createStagedTestRig();
      stagingFixture.detach();
      const handle = store.request({ to: '/next' }, { onUnavailable: 'drop' });
      expect(handle.status).toEqual({ type: 'dropped', reason: 'noBinding' });
      await store.receiveProtocol({ kind: 'request', request: handle.id });
      await store.finish();
    });

    it('a view-owned transaction is cancelled only by its own view', async () => {
      const { store, childView } = createStagedTestRig();
      const view = childView();
      const handle = store.request({ to: '/next' }, view);
      const tx = (handle.status as { transaction: TransactionId }).transaction;
      await store.receiveProtocol([{ kind: 'request' }, { kind: 'admitted' }]);
      store.cancelStaged(tx);
      expect(store.stagedCoordinator!.status.pending).toBe(tx);
      store.cancelStaged(tx, view);
      await store.receiveProtocol({ kind: 'terminal', transaction: tx, outcome: { type: 'cancelled', reason: 'explicit', attempted: 0, domainCommitted: false } });
      await store.finish();
    });
  });

  describe('D2/D3 exact-turn history results', () => {
    it('a refused commit records history unchanged', async () => {
      const { store } = createStagedTestRig();
      const handle = store.request({ to: '/blocked' });
      const tx = (handle.status as { transaction: TransactionId }).transaction;
      await store.receiveProtocol([{ kind: 'request' }, { kind: 'admitted' }]);
      store.cue();
      await store.receive({ type: 'go', url: '/blocked' });
      await store.receiveProtocol({
        kind: 'terminal', transaction: tx,
        outcome: { type: 'refused', attempted: 1, domainCommitted: true, url: '/start', history: 'unchanged' }
      });
      await store.finish();
    });

    it('a serialization failure of the committed state enters uncertainty; a later write ends it', async () => {
      let poison = false;
      const store = createTestStore<{ url: string }, { type: 'go'; url: string }>({
        initialState: { url: '/start' },
        reducer: urlReducer,
        staging: {
          staging: urlStaging(),
          serialize: state => { if (poison && state.url === '/bad') throw new Error('serialize failed'); return state.url; }
        }
      });
      const fixture = store.stagingFixture!;
      const handle = store.request({ to: '/bad' });
      const tx = (handle.status as { transaction: TransactionId }).transaction;
      await store.receiveProtocol([{ kind: 'request' }, { kind: 'admitted' }]);
      poison = true;
      store.cue();
      await store.receive({ type: 'go', url: '/bad' });
      await store.receiveProtocol({
        kind: 'terminal', transaction: tx,
        outcome: { type: 'failed', phase: 'routeClassification', attempted: 1, domainCommitted: true, history: 'failed', error: new Error('serialize failed') }
      });
      expect(fixture.eligibility()).toBe('historyUncertain');
      poison = false;
      const next = store.request({ to: '/y' });
      expect(next.status).toMatchObject({ type: 'degraded', reason: 'historyUncertain', outcome: { type: 'committed', history: 'written' } });
      await store.receive({ type: 'go', url: '/y' });
      await store.receiveProtocol({ kind: 'request', request: next.id });
      expect(fixture.eligibility()).toBe('ok');
      await store.finish();
    });

    it('failNextWrite validates its count and can be cleared before it fires', async () => {
      const { store, stagingFixture } = createStagedTestRig();
      expect(() => stagingFixture.failNextWrite(0)).toThrow(RangeError);
      stagingFixture.failNextWrite(2);
      stagingFixture.clearWriteFailures();
      store.request({ to: '/next' });
      store.cue();
      await store.receive({ type: 'go', url: '/next' });
      await store.receiveProtocol([{ kind: 'request' }, { kind: 'admitted' }, { kind: 'terminal', outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/next', history: 'written' } }]);
      await store.finish();
    });
  });

  describe('D4/E2 independent binding facts', () => {
    it('write, attachment, traversal and correction controls change only their own fact', () => {
      const fixture = createStagingFixture();
      const traversal = fixture.observeTraversal();
      fixture.failNextWrite();
      fixture.clearWriteFailures();
      expect(fixture.eligibility()).toBe('historyBarrier');
      fixture.detach();
      expect([fixture.epoch(), fixture.eligibility()]).toEqual([undefined, 'noBinding']);
      traversal.settle();
      expect(fixture.eligibility()).toBe('noBinding');
      fixture.attach();
      expect(fixture.eligibility()).toBe('ok');
    });

    it('overlapping traversals and a settlement correction keep the barrier closed until each opens', () => {
      const fixture = createStagingFixture();
      const first = fixture.observeTraversal();
      const second = fixture.observeTraversal();
      expect(fixture.generation()).toBe(2);
      first.settle({ correction: true });
      expect(fixture.eligibility()).toBe('historyBarrier');
      second.settle();
      expect(fixture.eligibility()).toBe('historyBarrier');
      fixture.deliverCorrection();
      expect(fixture.eligibility()).toBe('ok');
      expect(() => first.settle()).toThrow(/already settled/);
    });

    it('correction failure is uncertain unless re-established; a new epoch ends uncertainty', () => {
      const fixture = createStagingFixture();
      fixture.startCorrection();
      fixture.failCorrection({ reestablished: true });
      expect(fixture.eligibility()).toBe('ok');
      fixture.startCorrection();
      fixture.failCorrection();
      expect(fixture.eligibility()).toBe('historyUncertain');
      const failedSettlement = fixture.observeTraversal();
      failedSettlement.settle({ failed: true });
      expect(fixture.eligibility()).toBe('historyUncertain');
      const reestablishing = fixture.observeTraversal();
      reestablishing.settle();
      expect(fixture.eligibility()).toBe('ok');
      fixture.failCorrection();
      fixture.attach();
      expect(fixture.eligibility()).toBe('ok');
    });

    it('a fragment-only traversal keeps pending work until reclassified at settlement', async () => {
      const { store, stagingFixture } = createStagedTestRig();
      const handle = store.request({ to: '/next' });
      const tx = (handle.status as { transaction: TransactionId }).transaction;
      await store.receiveProtocol([{ kind: 'request' }, { kind: 'admitted' }]);
      const traversal = stagingFixture.observeTraversal({ routeAffecting: false });
      expect([traversal.routeAffecting, stagingFixture.generation(), stagingFixture.eligibility()]).toEqual([false, 0, 'ok']);
      expect(store.stagedCoordinator!.status.pending).toBe(tx);
      traversal.reclassify();
      expect([traversal.routeAffecting, stagingFixture.generation(), stagingFixture.eligibility()]).toEqual([true, 1, 'historyBarrier']);
      await store.receiveProtocol({ kind: 'terminal', transaction: tx, outcome: { type: 'cancelled', reason: 'traversal', attempted: 0, domainCommitted: false } });
      traversal.settle();
      expect(stagingFixture.eligibility()).toBe('ok');
      await store.finish();
    });

    it('an unprocessable traversal observation cancels conservatively and makes history uncertain', async () => {
      const { store, stagingFixture } = createStagedTestRig();
      const handle = store.request({ to: '/next' });
      const tx = (handle.status as { transaction: TransactionId }).transaction;
      await store.receiveProtocol([{ kind: 'request' }, { kind: 'admitted' }]);
      stagingFixture.failTraversalObservation();
      await store.receiveProtocol({ kind: 'terminal', transaction: tx, outcome: { type: 'cancelled', reason: 'traversal', attempted: 0, domainCommitted: false } });
      expect(stagingFixture.eligibility()).toBe('historyUncertain');
      await store.finish();
    });

    it('a fixture connects to one store only', () => {
      const fixture = createStagingFixture();
      const { store } = createStagedTestRig({ fixture });
      expect(() => createStagedTestRig({ fixture })).toThrow(/already connected/);
      store.destroy();
    });
  });

  describe('D6/E3/E5 finish and automatic cleanup parity', () => {
    it('exhaustivity off: finish() and automatic cleanup both name pending staged work', async () => {
      for (const check of ['finish', 'cleanup'] as const) {
        const { store } = createStagedTestRig();
        store.exhaustivity = 'off';
        const handle = store.request({ to: '/next' });
        const tx = (handle.status as { transaction: TransactionId }).transaction;
        const run = check === 'finish' ? store.finish() : (store as any)._onTestCleanup();
        const error = await run.then(() => undefined, (e: Error) => e);
        expect(error?.message).toContain(`- transaction ${tx} is still pending`);
        expect(error?.message).not.toContain('protocol event(s) not asserted');
        store.destroy();
      }
    });

    it('exhaustivity off with nothing pending: automatic cleanup passes despite unasserted events', async () => {
      const { store } = createStagedTestRig();
      store.exhaustivity = 'off';
      store.request({ to: '/next' });
      store.cue();
      await expect((store as any)._onTestCleanup()).resolves.toBeUndefined();
    });

    it('a request still waiting for admission is named, including one made through the coordinator seam', async () => {
      const store = createTestStore<{ url: string }, { type: 'go'; url: string }>({
        initialState: { url: '/start' },
        reducer: urlReducer,
        staging: { staging: urlStaging(), serialize: state => state.url }
      });
      store.exhaustivity = 'off';
      // A request made while an admission inspection runs waits behind it in the FIFO.
      let message: string | undefined;
      let requestId: number | undefined;
      const stop = store.stagedCoordinator!.subscribe(event => {
        if (requestId !== undefined || event.kind !== 'admitted') return;
        const handle = store.stagedCoordinator!.request({ to: '/a' }, {});
        requestId = handle.id;
        try { (store as any)._assertStagedFinish(); } catch (error) { message = (error as Error).message; }
      });
      store.request({ to: '/first' });
      stop();
      expect(message).toContain(`- staged request ${requestId} lacks a terminal result`);
      expect(store.stagedCoordinator!.status.request(requestId as never)).toMatchObject({ type: 'admitted' });
      store.cancelStaged();
      await store.finish();
    });

    it('explicit legacy execution with staging is rejected with a clear message', () => {
      expect(() => createTestStore<{ url: string }, { type: 'go'; url: string }>({
        initialState: { url: '/start' },
        reducer: urlReducer,
        execution: { mode: 'legacy' } as never,
        staging: { staging: urlStaging(), serialize: state => state.url }
      })).toThrow(/staging requires managed execution; remove execution.mode: 'legacy'/);
    });
  });
});

describe('TestStore staged adapter follow-up (teststore-astra-review F1–F3)', () => {
  describe('F1 an older settlement cannot clear newer uncertainty', () => {
    it('reviewer W1: a newer failed observation survives an older successful settlement', () => {
      const f = createStagingFixture();
      const old = f.observeTraversal();
      f.failTraversalObservation();
      expect(f.eligibility()).toBe('historyUncertain');
      old.settle();
      expect(f.eligibility()).toBe('historyUncertain');
    });

    it('a repeated failure while already uncertain also survives an older settlement', () => {
      const f = createStagingFixture();
      f.failCorrection();
      const old = f.observeTraversal();
      f.failTraversalObservation();
      old.settle();
      expect(f.eligibility()).toBe('historyUncertain');
      // A settlement observed after the last failure is current evidence and re-establishes history.
      const current = f.observeTraversal();
      current.settle();
      expect(f.eligibility()).toBe('ok');
    });

    it('a newer write failure survives an older settlement', async () => {
      const { store, stagingFixture } = createStagedTestRig();
      store.exhaustivity = 'off';
      const old = stagingFixture.observeTraversal({ routeAffecting: false });
      stagingFixture.failNextWrite();
      await store.send({ type: 'go', url: '/next' });
      expect(stagingFixture.eligibility()).toBe('historyUncertain');
      old.settle();
      expect(stagingFixture.eligibility()).toBe('historyUncertain');
      await store.finish();
    });
  });

  describe('F2 attachment isolation', () => {
    it('reviewer W2: an old traversal cannot release or corrupt a new attachment barrier', () => {
      const f = createStagingFixture();
      const old = f.observeTraversal();
      f.attach();
      const current = f.observeTraversal();
      expect(f.eligibility()).toBe('historyBarrier');
      old.settle();
      expect(f.eligibility()).toBe('historyBarrier');
      current.settle();
      expect(f.eligibility()).toBe('ok');
      f.observeTraversal();
      expect(f.eligibility()).toBe('historyBarrier');
    });

    it('old handles after detach/attach (including a repeated epoch ID) change no generation, uncertainty or correction', async () => {
      const fixture = createStagingFixture({ initialEpoch: 1 });
      const { store } = createStagedTestRig({ fixture });
      const oldFragment = fixture.observeTraversal({ routeAffecting: false });
      const oldRoute = fixture.observeTraversal();
      fixture.detach();
      expect(fixture.attach(1)).toBe(1);
      const current = fixture.observeTraversal();
      const generation = fixture.generation();
      const handle = store.request({ to: '/next' });
      expect(handle.status).toMatchObject({ type: 'degraded', reason: 'historyBarrier' });
      await store.receive({ type: 'go', url: '/next' });
      await store.receiveProtocol({ kind: 'request', request: handle.id });
      current.settle();
      const pending = store.request({ to: '/later' });
      const tx = (pending.status as { transaction: TransactionId }).transaction;
      await store.receiveProtocol([{ kind: 'request' }, { kind: 'admitted' }]);
      oldFragment.reclassify();
      oldRoute.settle({ correction: true });
      oldFragment.settle({ failed: true });
      expect([fixture.generation(), fixture.eligibility(), store.stagedCoordinator!.status.pending]).toEqual([generation, 'ok', tx]);
      store.cancelStaged(tx);
      await store.receiveProtocol({ kind: 'terminal', transaction: tx, outcome: { type: 'cancelled', reason: 'explicit', attempted: 0, domainCommitted: false } });
      await store.finish();
    });

    it('reviewer W3: an old turn observation without evidence is failed after detach and reattach', () => {
      const f = createStagingFixture();
      const oldTurn = f.observeTurn();
      f.detach();
      f.attach();
      expect(oldTurn.result({})).toBe('failed');
      const liveTurn = f.observeTurn();
      expect(liveTurn.result({})).toBe('unchanged');
    });

    it('old turn receipts keep their own recorded result and never take a new attachment write', async () => {
      const { store, stagingFixture } = createStagedTestRig();
      store.exhaustivity = 'off';
      const recorded = stagingFixture.observeTurn();
      await store.send({ type: 'go', url: '/one' });
      const committedOne = store.state;
      const unrecorded = stagingFixture.observeTurn();
      stagingFixture.detach();
      stagingFixture.attach();
      await store.send({ type: 'go', url: '/two' });
      expect(recorded.result(committedOne)).toBe('written');
      expect(unrecorded.result(store.state)).toBe('failed');
      expect(stagingFixture.historyResult(store.state)).toBe('written');
      await store.finish();
    });
  });

  describe('F3 the coordinator seam arms automatic cleanup', () => {
    const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
    type Scenario = { work: 'abandoned' | 'settled'; load: 'warm' | 'cold'; sibling: boolean };
    // Warm: TestStore is imported while the file is collected. Cold: an ordinary dynamic import
    // inside the running test, with no delay before the synchronous staged call.
    const runScenario = async ({ work, load, sibling }: Scenario) => {
      const dir = mkdtempSync(join(tmpdir(), 'teststore-hook-'));
      try {
        const testStorePath = JSON.stringify(join(packageRoot, 'src/lib/test/test-store.ts'));
        const fixture = join(dir, 'coordinator-hook.fixture.ts');
        writeFileSync(fixture, `
import { expect, it } from 'vitest';
${load === 'warm' ? `import { createTestStore as warmCreateTestStore } from ${testStorePath};` : ''}
let store: any;
it('drives staging only through the coordinator seam', async () => {
  const createTestStore = ${load === 'warm' ? 'warmCreateTestStore' : `(await import(${testStorePath})).createTestStore`};
  store = createTestStore({
    initialState: { url: '/a' },
    reducer: (_state: any, action: any) => [{ url: action.url }, { _tag: 'None' }],
    staging: {
      serialize: (state: any) => state.url,
      staging: { routeSlot: {}, policy: () => true, commit: (to: string) => ({ action: { type: 'go', url: to }, expectedURL: to }) }
    }
  });
  const handle = store.stagedCoordinator.request('/b', {});
  expect(store._hook).toBe('armed');
  if (${JSON.stringify(work)} === 'settled') {
    store.exhaustivity = 'off';
    store.stagedCoordinator.cancel(handle.status.transaction, undefined);
  }
});
${sibling ? `it('automatic cleanup destroyed the originating store', () => {
  expect(store._destroyed).toBe(true);
});` : ''}
`);
        const config = join(dir, 'coordinator-hook.config.ts');
        writeFileSync(config, `
import base from ${JSON.stringify(join(packageRoot, 'vitest.node.config.ts'))};
export default { ...base, root: ${JSON.stringify(packageRoot)}, test: { ...base.test, include: [${JSON.stringify(fixture)}], exclude: [] } };
`);
        try {
          const { stdout, stderr } = await promisify(execFile)(process.execPath, [
            join(packageRoot, 'node_modules/vitest/vitest.mjs'), 'run', '--config', config
          ], { cwd: packageRoot, timeout: 30000 });
          return { code: 0, output: stdout + stderr };
        } catch (error) {
          const failure = error as { code?: number; stdout?: string; stderr?: string };
          return { code: failure.code, output: (failure.stdout ?? '') + (failure.stderr ?? '') };
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    const originatingFailure = /FAIL .*coordinator-hook\.fixture\.ts > drives staging only through the coordinator seam\n[^\n]*staged routing is not settled/;

    for (const load of ['warm', 'cold'] as const) {
      it(`${load} import: an abandoned coordinator-only request fails its originating test, which destroys the store`, async () => {
        const result = await runScenario({ work: 'abandoned', load, sibling: true });
        expect(result.code, result.output).toBe(1);
        expect(result.output).toMatch(originatingFailure);
        expect(result.output).toContain('transaction 1 is still pending');
        expect(result.output).toMatch(/1 failed \| 1 passed/);
      }, 40000);

      it(`${load} import: an abandoned request alone still fails (no sibling needed to detect it)`, async () => {
        const result = await runScenario({ work: 'abandoned', load, sibling: false });
        expect(result.code, result.output).toBe(1);
        expect(result.output).toMatch(originatingFailure);
        expect(result.output).toMatch(/Tests {2}1 failed \(1\)/);
      }, 40000);

      it(`${load} import, negative control: settled coordinator-only work passes and is destroyed`, async () => {
        const result = await runScenario({ work: 'settled', load, sibling: true });
        expect(result.code, result.output).toBe(0);
        expect(result.output).toMatch(/2 passed \(2\)/);
      }, 40000);
    }
  });
});
