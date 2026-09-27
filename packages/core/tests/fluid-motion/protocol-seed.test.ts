/**
 * Protocol seed cases for the staged route coordinator over the real root FIFO and the real root
 * history binding (fake port). Exact request results, transaction outcomes, domain-action counts and
 * history writes. The exhaustive matrix is WP4.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectConsole } from '../helpers/console.js';
import { createStore } from '../../src/lib/store.svelte.js';
import { integrate } from '../../src/lib/navigation/integrate.js';
import { optionalSlot } from '../../src/lib/navigation/managed-integration.js';
import { managedRootAccess, capturedView } from '../../src/lib/execution/store-access.js';
import { Effect } from '../../src/lib/effect.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';
import { bindManagedRootRoute } from '../../src/lib/routing/managed-binding.js';
import type { HistoryPort, HistorySnapshot } from '../../src/lib/routing/managed-history.js';
import { createStagedCoordinator } from '../../src/lib/routing/staged/coordinator.js';
import type { ApplicationStaging, ProtocolEvent, TransactionId, VisualCuePort } from '../../src/lib/routing/staged/types.js';

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.restoreAllMocks(); });

type State = { url: string; child: { count: number } | null; tick: number };
type Action = { type: 'go'; url: string } | { type: 'replace' } | { type: 'tick' } | { type: 'child'; action: PresentationAction<{ type: 'inc' }> };
type Intent = { to: string };
const slot = optionalSlot<State, Action>()('child');

function fixture(options: { before?: (store: ReturnType<typeof createStore<State, Action>>) => void; routeKey?: (state: State) => string; policy?: () => boolean; normalize?: (url: string) => string; bind?: boolean; outlet?: boolean; onUnavailable?: 'immediate' | 'drop'; cueMode?: 'auto' | 'manual'; budgets?: ApplicationStaging<State, Action, Intent>['budgets'] } = {}) {
  const trace: string[] = [];
  const reducer: Reducer<State, Action> = (state, action) => {
    if (action.type === 'go') {
      trace.push(`go:${action.url}`);
      if (action.url === '/throw') throw new Error('route reducer failed');
      if (action.url === '/blocked') return [state, Effect.none()];
      return [{ ...state, url: options.normalize ? options.normalize(action.url) : action.url }, Effect.none()];
    }
    if (action.type === 'replace') return [{ ...state, child: { count: 0 } }, Effect.none()];
    if (action.type === 'tick') return [{ ...state, tick: state.tick + 1 }, Effect.none()];
    return [state, Effect.none()];
  };
  const child: Reducer<{ count: number }, { type: 'inc' }> = state => [{ count: state.count + 1 }, Effect.none()];
  const composition = integrate(reducer).managed().with(slot, child, { replaceOn: action => action.type === 'replace' }).build();
  const store = createStore({ initialState: { url: '/start', child: { count: 0 }, tick: 0 }, ...composition });
  cleanups.push(() => store.destroy());
  let current: HistorySnapshot = { url: '/start', state: null, entryKey: 'key-0' }, id = 0;
  let listener: (() => void) | undefined;
  const port: HistoryPort = {
    read: () => current,
    replace: vi.fn((url, state) => { current = { ...current, url, state }; }),
    push: vi.fn((url, state) => { current = { url, state, entryKey: `key-${++id}` }; }),
    go: vi.fn(),
    listen: vi.fn(fn => { listener = fn; return () => { listener = undefined; }; })
  };
  let allowed = true;
  const staging: ApplicationStaging<State, Action, Intent> = {
    policy: options.policy ?? (() => allowed),
    commit: intent => ({ action: { type: 'go', url: intent.to }, expectedURL: intent.to }),
    routeSlot: slot,
    ...(options.routeKey ? { routeKey: options.routeKey } : {}),
    ...(options.onUnavailable ? { onUnavailable: options.onUnavailable } : {}),
    ...(options.budgets ? { budgets: options.budgets } : {})
  };
  const coordinator = createStagedCoordinator<State, Action, Intent>({
    access: managedRootAccess(store, composition.execution),
    state: () => store.state, subscribe: listener => store.subscribe(listener),
    staging, serialize: state => state.url, destination: url => url, cueMode: options.cueMode ?? 'manual'
  });
  cleanups.push(() => coordinator.dispose());
  const events: ProtocolEvent[] = [];
  coordinator.subscribe(event => events.push(event));
  let binding: { dispose(): void } | undefined;
  options.before?.(store);
  if (options.bind !== false) {
    binding = bindManagedRootRoute({ store, execution: composition.execution, port, initial: 'accepted-state', fragment: 'native', serialize: state => state.url, request: url => ({ action: { type: 'go', url }, expectedURL: url }), id: () => `id-${++id}`, report: vi.fn(), staging: eligibility => coordinator.setEligibility(eligibility) });
    cleanups.push(() => binding?.dispose());
  }
  if (options.outlet !== false) coordinator.setOutletAttached(true);
  const txOf = (handle: { status: unknown }) => (handle.status as { transaction: TransactionId }).transaction;
  return {
    store, trace, port, coordinator, events, txOf, composition,
    get binding() { return binding; },
    setAllowed(value: boolean) { allowed = value; },
    visit(url: string) { current = { url, state: null, entryKey: `key-${++id}` }; listener?.(); },
    childView() { return composition.bind(store, slot)!; }
  };
}

it('admitted transaction commits only at the cue: one action, accepted, one push', () => {
  const f = fixture();
  const handle = f.coordinator.request({ to: '/next' }, {});
  expect(handle.status).toEqual({ type: 'admitted', transaction: 1 });
  expect(f.trace).toEqual([]);
  f.coordinator.cue(f.txOf(handle));
  expect(f.trace).toEqual(['go:/next']);
  expect(f.port.push).toHaveBeenCalledOnce();
  expect(f.events).toEqual([
    { kind: 'request', request: 1, result: { type: 'admitted', transaction: 1 } },
    { kind: 'admitted', transaction: 1, request: 1 },
    { kind: 'terminal', transaction: 1, outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/next', history: 'written' } }
  ]);
  // Duplicate cue: no-op, no second action.
  f.coordinator.cue(f.txOf(handle));
  expect(f.trace).toEqual(['go:/next']);
});

it('no binding degrades to exactly one immediate turn; drop yields zero actions', () => {
  const f = fixture({ bind: false });
  const degraded = f.coordinator.request({ to: '/next' }, {});
  expect(degraded.status).toEqual({ type: 'degraded', reason: 'noBinding', outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url: '/next', history: 'unchanged' } });
  expect(f.trace).toEqual(['go:/next']);
  const dropped = f.coordinator.request({ to: '/other' }, {}, { onUnavailable: 'drop' });
  expect(dropped.status).toEqual({ type: 'dropped', reason: 'noBinding' });
  expect(f.trace).toEqual(['go:/next']);
});

it('an unattached route outlet makes staging unavailable (unmanagedRouteRender)', () => {
  const f = fixture({ outlet: false });
  const handle = f.coordinator.request({ to: '/next' }, {});
  expect(handle.status).toMatchObject({ type: 'degraded', reason: 'unmanagedRouteRender', outcome: { type: 'committed', route: 'accepted', history: 'written' } });
  expect(f.port.push).toHaveBeenCalledOnce();
});

it('a request captured before a traversal and dequeued after it is stale, never degraded', () => {
  const f = fixture();
  let once = false;
  let handle: ReturnType<typeof f.coordinator.request> | undefined;
  const stop = f.store.subscribe(state => {
    if (state.tick === 1 && !once) { once = true; handle = f.coordinator.request({ to: '/next' }, {}); f.visit('/visited'); }
  });
  cleanups.push(stop);
  f.store.dispatch({ type: 'tick' });
  expect(handle!.status).toEqual({ type: 'stale', reason: 'traversal' });
  expect(f.trace).toEqual(['go:/visited']);
});

it('a route-affecting traversal cancels the pending transaction; a late cue cannot commit', () => {
  const f = fixture();
  const handle = f.coordinator.request({ to: '/next' }, {});
  f.visit('/visited');
  expect(f.coordinator.status.transaction(f.txOf(handle))).toMatchObject({ phase: 'terminal', outcome: { type: 'cancelled', reason: 'traversal' } });
  f.coordinator.cue(f.txOf(handle));
  expect(f.trace).toEqual(['go:/visited']);
});

it('same-key, different-URL request under a query-collapsing key: unrelated edits keep it; exact URL classifies', () => {
  const routeKey = (state: State) => state.url.split('?')[0]!;
  const accepted = fixture({ routeKey });
  accepted.store.dispatch({ type: 'go', url: '/search?q=old' });
  const handle = accepted.coordinator.request({ to: '/search?q=new' }, {});
  expect(handle.status).toMatchObject({ type: 'admitted' });
  accepted.store.dispatch({ type: 'tick' });
  accepted.store.dispatch({ type: 'go', url: '/search?q=other' });
  expect(accepted.coordinator.status.transaction(accepted.txOf(handle))).toMatchObject({ phase: 'pending' });
  accepted.coordinator.cue(accepted.txOf(handle));
  expect(accepted.coordinator.status.transaction(accepted.txOf(handle))).toMatchObject({ phase: 'terminal', outcome: { type: 'committed', route: 'accepted', url: '/search?q=new', history: 'written' } });

  const redirected = fixture({ routeKey, normalize: url => url.includes('?') ? `${url}&page=1` : url });
  const second = redirected.coordinator.request({ to: '/search?q=new' }, {});
  redirected.coordinator.cue(redirected.txOf(second));
  expect(redirected.coordinator.status.transaction(redirected.txOf(second))).toMatchObject({ phase: 'terminal', outcome: { type: 'committed', route: 'redirected', url: '/search?q=new&page=1' } });

  const refused = fixture({ routeKey });
  const third = refused.coordinator.request({ to: '/blocked' }, {});
  refused.coordinator.cue(refused.txOf(third));
  expect(refused.coordinator.status.transaction(refused.txOf(third))).toMatchObject({ phase: 'terminal', outcome: { type: 'refused', attempted: 1, domainCommitted: true, url: '/start', history: 'unchanged' } });
});

it('a direct commit that changes the route key cancels (directCommit) with zero staged actions', () => {
  const f = fixture();
  const handle = f.coordinator.request({ to: '/next' }, {});
  f.store.dispatch({ type: 'go', url: '/direct' });
  expect(f.coordinator.status.transaction(f.txOf(handle))).toMatchObject({ phase: 'terminal', outcome: { type: 'cancelled', reason: 'directCommit' } });
  f.coordinator.cue(f.txOf(handle));
  expect(f.trace).toEqual(['go:/direct']);
});

it('owner retirement cancels; explicit cancel is owner-bound; return cancels with returned', () => {
  const f = fixture();
  const view = f.childView();
  const capture = capturedView(view);
  const source = () => ({ owner: capture.origin, ownerLive: () => capture.isLive(), observeRetirement: (retired: () => void) => { let active = true; const record = capture.registerResource({ kind: 'subscription', cleanup: () => { if (active) retired(); } }); return () => { active = false; record.dispose(); }; } });
  const first = f.coordinator.request({ to: '/next' }, source());
  f.store.dispatch({ type: 'replace' });
  expect(f.coordinator.status.transaction(f.txOf(first))).toMatchObject({ phase: 'terminal', outcome: { type: 'cancelled', reason: 'ownerRetired' } });
  // A retained source after retirement is stale at admission, never degraded.
  expect(f.coordinator.request({ to: '/next' }, source()).status).toEqual({ type: 'stale', reason: 'ownerRetired' });

  const liveView = f.childView();
  const liveCapture = capturedView(liveView);
  const second = f.coordinator.request({ to: '/next' }, { owner: liveCapture.origin, ownerLive: () => liveCapture.isLive() });
  f.coordinator.cancel(f.txOf(second), undefined);
  expect(f.coordinator.status.transaction(f.txOf(second))).toMatchObject({ phase: 'pending' });
  f.coordinator.cancel(f.txOf(second), liveCapture.origin);
  expect(f.coordinator.status.transaction(f.txOf(second))).toMatchObject({ phase: 'terminal', outcome: { type: 'cancelled', reason: 'explicit' } });

  const third = f.coordinator.request({ to: '/next' }, {});
  const back = f.coordinator.request({ to: '/start' }, {});
  expect(back.status).toEqual({ type: 'returned' });
  expect(f.coordinator.status.transaction(f.txOf(third))).toMatchObject({ phase: 'terminal', outcome: { type: 'cancelled', reason: 'returned' } });
  expect(f.coordinator.request({ to: '/start' }, {}).status).toEqual({ type: 'unchanged' });
  expect(f.trace).toEqual([]);
});

it('commit inspection veto, reducer failure, and binding detach are distinct terminal outcomes', () => {
  const f = fixture();
  const vetoed = f.coordinator.request({ to: '/next' }, {});
  f.setAllowed(false);
  f.coordinator.cue(f.txOf(vetoed));
  expect(f.coordinator.status.transaction(f.txOf(vetoed))).toMatchObject({ phase: 'terminal', outcome: { type: 'vetoed', attempted: 0 } });
  f.setAllowed(true);
  const failing = f.coordinator.request({ to: '/throw' }, {});
  // D5: a protocol-issued turn's rejection is failed(reduction) plus the runtime failure sink, not a
  // throw out of whichever call drained the queue.
  const sink = expectConsole('error');
  expect(() => f.coordinator.cue(f.txOf(failing))).not.toThrow();
  expect(sink.filter(call => String(call[0]).includes('Runtime error (reduction)'))).toHaveLength(1);
  expect(f.coordinator.status.transaction(f.txOf(failing))).toMatchObject({ phase: 'terminal', outcome: { type: 'failed', phase: 'reduction', attempted: 1, domainCommitted: false } });
  const detached = f.coordinator.request({ to: '/next' }, {});
  f.binding!.dispose();
  expect(f.coordinator.status.transaction(f.txOf(detached))).toMatchObject({ phase: 'terminal', outcome: { type: 'cancelled', reason: 'detached' } });
  expect(f.trace).toEqual(['go:/throw']);
});

it('a failed history write is reported with the committed outcome and makes later staging unavailable', () => {
  const f = fixture();
  vi.mocked(f.port.push).mockImplementationOnce(() => { throw new Error('write failed'); });
  const handle = f.coordinator.request({ to: '/next' }, {});
  f.coordinator.cue(f.txOf(handle));
  expect(f.coordinator.status.transaction(f.txOf(handle))).toMatchObject({ phase: 'terminal', outcome: { type: 'committed', route: 'accepted', history: 'failed' } });
  const later = f.coordinator.request({ to: '/later' }, {});
  expect(later.status).toMatchObject({ type: 'degraded', reason: 'historyUncertain' });
  expect(f.trace).toEqual(['go:/next', 'go:/later']);
});

it('an absolute cue deadline appends a commit when the visual cue never arrives; next-turn cue without a port', async () => {
  const auto = fixture({ cueMode: 'auto' });
  const immediate = auto.coordinator.request({ to: '/next' }, {});
  expect(auto.coordinator.status.transaction(auto.txOf(immediate))).toMatchObject({ phase: 'terminal', outcome: { type: 'committed' } });
  const silent = fixture({ cueMode: 'auto', budgets: { preparationMs: 0, cueSlackMs: 5 } });
  const port: VisualCuePort = { admitted: () => true, notify: () => {} };
  silent.coordinator.setVisualPort(port);
  const handle = silent.coordinator.request({ to: '/next' }, {}, { motion: { cueMs: 5 } });
  expect(silent.trace).toEqual([]);
  await vi.waitFor(() => expect(silent.trace).toEqual(['go:/next']), { timeout: 1000 });
  expect(silent.coordinator.status.transaction(silent.txOf(handle))).toMatchObject({ phase: 'terminal', outcome: { type: 'committed', route: 'accepted' } });
});

it('root destruction during the commit turn notifications still records the committed outcome', () => {
  const f = fixture();
  const handle = f.coordinator.request({ to: '/next' }, {});
  const stop = f.store.subscribe(state => { if (state.url === '/next') f.store.destroy(); });
  cleanups.push(stop);
  f.coordinator.cue(f.txOf(handle));
  expect(f.trace).toEqual(['go:/next']);
  const outcome = (f.coordinator.status.transaction(f.txOf(handle)) as { outcome: { type: string; route?: string; domainCommitted: boolean } }).outcome;
  expect(outcome).toMatchObject({ type: 'committed', route: 'accepted', domainCommitted: true });
});

it('native fragment-only traversal is not route-affecting: the pending transaction survives and commits', () => {
  const f = fixture();
  const handle = f.coordinator.request({ to: '/next' }, {});
  f.visit('/start#section');
  expect(f.coordinator.status.transaction(f.txOf(handle))).toMatchObject({ phase: 'pending' });
  f.coordinator.cue(f.txOf(handle));
  expect(f.coordinator.status.transaction(f.txOf(handle))).toMatchObject({ phase: 'terminal', outcome: { type: 'committed', route: 'accepted' } });
  expect(f.trace).toEqual(['go:/next']);
});

it('a request made after traversal observation captures the new generation and is fresh at its FIFO position', () => {
  const f = fixture();
  let once = false;
  let handle: ReturnType<typeof f.coordinator.request> | undefined;
  const stop = f.store.subscribe(state => {
    if (state.tick === 1 && !once) { once = true; f.visit('/visited'); handle = f.coordinator.request({ to: '/next' }, {}); }
  });
  cleanups.push(stop);
  f.store.dispatch({ type: 'tick' });
  expect(f.trace).toEqual(['go:/visited']);
  expect(handle!.status).toMatchObject({ type: 'admitted' });
});

it('history evidence: retirement before the binding writes reports failed, never a guessed unchanged', () => {
  // Registered before the binding's own subscriber, so it destroys the root before any write.
  const f = fixture({ before: store => { store.subscribe(state => { if (state.url === '/next') store.destroy(); }); } });
  const handle = f.coordinator.request({ to: '/next' }, {});
  f.coordinator.cue(f.txOf(handle));
  expect(f.trace).toEqual(['go:/next']);
  expect(f.port.push).not.toHaveBeenCalled();
  expect(f.coordinator.status.transaction(f.txOf(handle))).toMatchObject({ phase: 'terminal', outcome: { type: 'committed', route: 'accepted', domainCommitted: true, history: 'failed' } });
});

it('history evidence: retirement after a completed write keeps written', () => {
  const f = fixture();
  const stop = f.store.subscribe(state => { if (state.url === '/next') f.binding!.dispose(); });
  cleanups.push(stop);
  const handle = f.coordinator.request({ to: '/next' }, {});
  f.coordinator.cue(f.txOf(handle));
  expect(f.port.push).toHaveBeenCalledOnce();
  expect(f.coordinator.status.transaction(f.txOf(handle))).toMatchObject({ phase: 'terminal', outcome: { type: 'committed', route: 'accepted', history: 'written' } });
});

it('history evidence: a live binding with no write due reports unchanged; fresh noBinding keeps baseline unchanged', () => {
  const f = fixture();
  const handle = f.coordinator.request({ to: '/blocked' }, {});
  f.coordinator.cue(f.txOf(handle));
  expect(f.port.push).not.toHaveBeenCalled();
  expect(f.coordinator.status.transaction(f.txOf(handle))).toMatchObject({ phase: 'terminal', outcome: { type: 'refused', history: 'unchanged' } });
  const unbound = fixture({ bind: false });
  expect(unbound.coordinator.request({ to: '/next' }, {}).status).toMatchObject({ type: 'degraded', reason: 'noBinding', outcome: { history: 'unchanged' } });
});

describe('R3: synchronous observer disposal/detachment during admission', () => {
  function counted(options: Parameters<typeof fixture>[0] = {}) {
    const f = fixture(options);
    // Wrap the real root scheduler to count outstanding staged timer handles.
    const access = managedRootAccess(f.store, f.composition.execution);
    const live = new Set<unknown>();
    const installed: unknown[] = [];
    const scheduler = {
      ...access.scheduler,
      now: () => access.scheduler.now(),
      setTimer: (delay: number, callback: () => void) => { const handle = access.scheduler.setTimer(delay, () => { live.delete(handle); callback(); }); live.add(handle); installed.push(handle); return handle; },
      clearTimer: (handle: Parameters<typeof access.scheduler.clearTimer>[0]) => { live.delete(handle); access.scheduler.clearTimer(handle); },
      requestFrame: access.scheduler.requestFrame.bind(access.scheduler),
      cancelFrame: access.scheduler.cancelFrame.bind(access.scheduler)
    };
    const coordinator = createStagedCoordinator<State, Action, Intent>({
      access: { enqueueInspection: access.enqueueInspection.bind(access), isLive: () => access.isLive(), scheduler },
      state: () => f.store.state, subscribe: listener => f.store.subscribe(listener),
      staging: { policy: () => true, commit: intent => ({ action: { type: 'go', url: intent.to }, expectedURL: intent.to }), routeSlot: slot },
      serialize: state => state.url, destination: url => url, cueMode: 'manual'
    });
    cleanups.push(() => coordinator.dispose());
    return { f, coordinator, live, installed };
  }
  it.each(['dispose', 'detachOutlet', 'detachBinding'] as const)('%s from the admission result listener: admitted precedes terminal, no deadline survives, no later commit', cause => {
    const { f, coordinator, live, installed } = counted({ bind: false });
    const binding = bindManagedRootRoute({ store: f.store, execution: f.composition.execution, port: f.port, initial: 'accepted-state', fragment: 'native', serialize: state => state.url, request: url => ({ action: { type: 'go', url }, expectedURL: url }), id: () => `r3-${Math.random()}`, report: vi.fn(), staging: eligibility => coordinator.setEligibility(eligibility) });
    cleanups.push(() => binding?.dispose());
    coordinator.setOutletAttached(true);
    const order: string[] = [];
    coordinator.subscribe(event => {
      order.push(event.kind === 'terminal' ? `terminal:${event.outcome.type}` : event.kind);
      if (event.kind === 'request' && event.result.type === 'admitted') {
        if (cause === 'dispose') coordinator.dispose();
        else if (cause === 'detachOutlet') coordinator.setOutletAttached(false);
        else binding!.dispose();
      }
    });
    const handle = coordinator.request({ to: '/next' }, {});
    expect(handle.status).toMatchObject({ type: 'admitted' });
    expect(order).toEqual(['request', 'admitted', `terminal:cancelled`]);
    // Positive control: admission installed exactly one absolute deadline; the terminal cleared it.
    expect(installed).toHaveLength(1);
    expect(live.size).toBe(0);
    coordinator.cue((handle.status as { transaction: TransactionId }).transaction);
    expect(f.trace).toEqual([]);
  });
});

describe('D5: staged commit rejections use the runtime failure sink; E3: staged deadline inspection', () => {
  const reductionReports = (calls: readonly (readonly unknown[])[]) => calls.filter(call => String(call[0]).includes('Runtime error (reduction)'));

  it('a deadline-driven commit rejection is failed(reduction) plus exactly one runtime report; it never escapes the timer', async () => {
    const sink = expectConsole('error');
    const f = fixture({ cueMode: 'auto', budgets: { preparationMs: 0, cueSlackMs: 5 } });
    f.coordinator.setVisualPort({ admitted: () => true, notify: () => {} });
    const handle = f.coordinator.request({ to: '/throw' }, {}, { motion: { cueMs: 5 } });
    expect(f.coordinator.status.pendingDeadlines()).toEqual([f.txOf(handle)]);
    await vi.waitFor(() => expect(f.trace).toEqual(['go:/throw']), { timeout: 1000 });
    expect(f.coordinator.status.transaction(f.txOf(handle))).toMatchObject({ phase: 'terminal', outcome: { type: 'failed', phase: 'reduction', attempted: 1, domainCommitted: false } });
    expect(reductionReports(sink)).toHaveLength(1);
    expect(String((reductionReports(sink)[0]![1] as Error).message)).toBe('route reducer failed');
    expect(f.coordinator.status.pendingDeadlines()).toEqual([]);
  });

  it('a degraded immediate turn rejection is reported once and returned as degraded(failed reduction); request() does not throw', () => {
    const sink = expectConsole('error');
    const f = fixture({ bind: false });
    let handle: ReturnType<typeof f.coordinator.request> | undefined;
    expect(() => { handle = f.coordinator.request({ to: '/throw' }, {}); }).not.toThrow();
    expect(handle!.status).toMatchObject({ type: 'degraded', reason: 'noBinding', outcome: { type: 'failed', phase: 'reduction', attempted: 1, domainCommitted: false } });
    expect(reductionReports(sink)).toHaveLength(1);
  });

  it('ordinary external dispatch keeps its synchronous throw (queue default unchanged) and is not also reported', () => {
    const sink = expectConsole('error', 0);
    const f = fixture();
    expect(() => f.store.dispatch({ type: 'go', url: '/throw' })).toThrow('route reducer failed');
    expect(reductionReports(sink)).toHaveLength(0);
  });

  it('TestStore records the staged rejection through its existing managed failure path (no throw from cue)', async () => {
    const { createTestStore } = await import('../../src/lib/test/index.js');
    const reducer: Reducer<State, Action> = (state, action) => {
      if (action.type === 'go' && action.url === '/throw') throw new Error('route reducer failed');
      return [action.type === 'go' ? { ...state, url: action.url } : state, Effect.none()];
    };
    const child: Reducer<{ count: number }, { type: 'inc' }> = state => [state, Effect.none()];
    const composition = integrate(reducer).managed().with(slot, child).build();
    const store = createTestStore<State, Action>({ initialState: { url: '/start', child: null, tick: 0 }, ...composition });
    store.enableStaging<Intent>({ staging: { policy: () => true, commit: intent => ({ action: { type: 'go', url: intent.to }, expectedURL: intent.to }), routeSlot: slot }, serialize: state => state.url });
    const handle = store.request<Intent>({ to: '/throw' });
    expect(() => store.cue()).not.toThrow();
    expect(store.stagedCoordinator!.status.transaction((handle.status as { transaction: TransactionId }).transaction)).toMatchObject({ phase: "terminal", outcome: { type: "failed", phase: "reduction", attempted: 1 } });
    await expect(store.finish()).rejects.toThrow('route reducer failed');
    store.destroy();
  });
});
