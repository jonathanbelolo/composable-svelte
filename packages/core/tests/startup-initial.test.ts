import { describe, it, expect } from 'vitest';
import { Effect } from '../src/lib/effect.js';
import { TurnQueue } from '../src/lib/execution/turn-queue.js';
import { EffectRuntime } from '../src/lib/execution/runtime.js';
import { DeterministicScheduler } from '../src/lib/execution/scheduler.js';
import { ownerAt, stampOrigin } from '../src/lib/execution/identity.js';
import { integrate } from '../src/lib/navigation/integrate.js';
import { optionalSlot, keyedSlot, nestedSlot } from '../src/lib/navigation/managed-integration.js';
import { TestStore } from '../src/lib/test/test-store.js';
import type { Reducer, StoreExecutionConfig } from '../src/lib/types.js';
import type { PresentationAction } from '../src/lib/navigation/types.js';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
type Child = { loaded: boolean };
type CA = { type: 'load' };
type State = { child: Child | null; saved: boolean };
type Action = { type: 'boot' } | { type: 'open' } | { type: 'remove' } | { type: 'replace' } | { type: 'save' } | { type: 'saved' } | { type: 'child'; action: PresentationAction<CA> };
const childSlot = optionalSlot<State, Action>()('child');
const initial = (): State => ({ child: { loaded: false }, saved: false });
function makeDefinition(log: string[], options: { removeOnBoot?: boolean; failBoot?: boolean; loaded?: boolean } = {}) {
  const child: Reducer<Child, CA> = (state, action) => {
    log.push(`child:${action.type}`);
    return [{ loaded: true }, Effect.none()];
  };
  const parent: Reducer<State, Action> = (state, action) => {
    log.push(`parent:${action.type}`);
    if (action.type === 'boot' && options.failBoot) throw new Error('startup failed');
    if (action.type === 'remove' || (action.type === 'boot' && options.removeOnBoot)) return [{ ...state, child: null }, Effect.none()];
    if (action.type === 'open' || action.type === 'replace') return [{ ...state, child: { loaded: false } }, Effect.none()];
    if (action.type === 'saved') return [{ ...state, saved: true }, Effect.none()];
    return [state, Effect.none()];
  };
  return integrate(parent).managed().with(childSlot, child, {
    replaceOn: action => action.type === 'replace',
    onCreate: () => { log.push('plan'); return Effect.run(() => { log.push('initialize'); }); },
    startup: state => state.loaded ? undefined : { type: 'load' }
  }).build();
}
function harness<S, A>(state: S, reducer: Reducer<S, A>, execution: StoreExecutionConfig<S, A>, server = false) {
  let queue!: TurnQueue<S, A>;
  const failures: unknown[] = [];
  const runtime = new EffectRuntime<A>({ scheduler: new DeterministicScheduler(), isServer: () => server, ssr: { deferEffects: false }, dispatch: (action, origin) => queue.enqueue({ action, origin, source: 'effect' }), onError: error => failures.push(error) });
  queue = new TurnQueue({ initialState: state, reducer, execution, runtime });
  return { queue, runtime, failures };
}
function enabled<S, A>(execution: StoreExecutionConfig<S, A>, startup?: A): StoreExecutionConfig<S, A> {
  return { ...execution, _initialization: { mode: 'attached', startup } };
}

it('plans initial work without reductions and reuses the original owner at activation', async () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const { queue, runtime } = harness(initial(), definition.reducer, enabled(definition.execution, { type: 'boot' }));
  const owner = ownerAt(queue.getLifecycle(), childSlot.path);
  expect(log).toEqual(['plan']); expect(runtime.resourceScope.size).toBe(3); expect(queue.history).toEqual([]);
  queue.activateInitialization({ live: true }); await flush();
  expect(log).toEqual(['plan', 'parent:boot', 'initialize', 'child:load', 'parent:child']);
  expect(ownerAt(queue.getLifecycle(), childSlot.path)).toBe(owner); expect(queue.getState().child?.loaded).toBe(true);
  expect(runtime.pendingWorkCount).toBe(0); queue.destroy();
});
it('root startup removes a child before any of its planned initialization executes', async () => {
  const log: string[] = []; const definition = makeDefinition(log, { removeOnBoot: true });
  const { queue, runtime } = harness(initial(), definition.reducer, enabled(definition.execution, { type: 'boot' }));
  queue.activateInitialization({ live: true }); await flush();
  expect(log).toEqual(['plan', 'parent:boot']); expect(queue.getState().child).toBeNull(); expect(runtime.pendingWorkCount).toBe(0); queue.destroy();
});
it('standalone composition preserves existing construction and newly-created behavior', async () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const { queue } = harness(initial(), definition.reducer, definition.execution);
  expect(log).toEqual([]); queue.activateInitialization({ live: true }); expect(log).toEqual([]);
  queue.dispatch({ type: 'replace' }); await flush(); expect(log).toContain('initialize'); expect(log.filter(item => item === 'child:load')).toHaveLength(1); queue.destroy();
});
it('repeated activation and detach/reattach never repeat attempted startup', async () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const { queue } = harness(initial(), definition.reducer, enabled(definition.execution, { type: 'boot' }));
  const first = { live: true }; queue.activateInitialization(first); queue.activateInitialization(first); first.live = false; queue.releaseInitialization(first); queue.activateInitialization({ live: true }); await flush();
  expect(log.filter(item => item === 'parent:boot')).toHaveLength(1); expect(log.filter(item => item === 'initialize')).toHaveLength(1); queue.destroy();
});
it('create/remove before attachment retires pending work, while a later epoch starts once', async () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const { queue, runtime } = harness({ child: null, saved: false } as State, definition.reducer, enabled(definition.execution));
  queue.dispatch({ type: 'open' }); queue.dispatch({ type: 'remove' }); await flush(); expect(runtime.pendingWorkCount).toBe(0);
  queue.activateInitialization({ live: true }); expect(log).not.toContain('initialize'); queue.dispatch({ type: 'open' }); await flush(); expect(log.filter(item => item === 'initialize')).toHaveLength(1); queue.destroy();
});
it('same-path replacement retires old pending descriptions and starts the new epoch', async () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const { queue } = harness(initial(), definition.reducer, enabled(definition.execution)); const old = ownerAt(queue.getLifecycle(), childSlot.path);
  queue.dispatch({ type: 'replace' }); const current = ownerAt(queue.getLifecycle(), childSlot.path); expect(current).not.toBe(old);
  queue.activateInitialization({ live: true }); await flush(); expect(log.filter(item => item === 'plan')).toHaveLength(2); expect(log.filter(item => item === 'initialize')).toHaveLength(1); queue.destroy();
});
it('new work waits while detached and old release cannot retire a new attachment', async () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const { queue } = harness({ child: null, saved: false } as State, definition.reducer, enabled(definition.execution));
  const first = { live: true }; queue.activateInitialization(first); first.live = false; queue.releaseInitialization(first); queue.dispatch({ type: 'open' }); expect(log).not.toContain('initialize');
  const second = { live: true }; queue.activateInitialization(second); queue.releaseInitialization(first); await flush(); expect(log.filter(item => item === 'initialize')).toHaveLength(1); queue.destroy();
});
it('already loaded child skips business load while client resource initialization remains', async () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const { queue } = harness({ child: { loaded: true }, saved: false }, definition.reducer, enabled(definition.execution)); queue.activateInitialization({ live: true }); await flush();
  expect(log).toEqual(['plan', 'initialize']); queue.destroy();
});
it('SSR never activates even when ordinary server effects are enabled', async () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const { queue, runtime } = harness(initial(), definition.reducer, enabled(definition.execution, { type: 'boot' }), true);
  queue.activateInitialization({ live: true }); await flush(); expect(log).toEqual(['plan']); expect(queue.history).toEqual([]); expect(runtime.resourceScope.size).toBe(3);
  queue.destroy(); await flush(); expect(runtime.pendingWorkCount).toBe(0);
});
it('destroy before activation retires every pending resource and stale claims cannot revive it', async () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const { queue, runtime } = harness(initial(), definition.reducer, enabled(definition.execution, { type: 'boot' })); queue.destroy(); queue.activateInitialization({ live: true }); await flush();
  expect(log).toEqual(['plan']); expect(runtime.pendingWorkCount).toBe(0);
});
it('constructor planning failure disposes its runtime and publishes no root', () => {
  const runtime = new EffectRuntime<Action>({ scheduler: new DeterministicScheduler(), dispatch: () => {} });
  expect(() => new TurnQueue({ initialState: initial(), reducer: state => [state, Effect.none()], runtime, execution: { mode: 'managed', _initialization: { mode: 'attached' }, _initial: () => { throw new Error('planning failed'); } } })).toThrow('planning failed');
  expect(runtime.isDisposed).toBe(true); expect(runtime.resourceScope.size).toBe(0);
});
it('initial plan rejects missing owners and pre-stamped foreign authority atomically', () => {
  for (const foreign of [false, true]) {
    const log: string[] = []; const definition = makeDefinition(log);
    const runtime = new EffectRuntime<Action>({ scheduler: new DeterministicScheduler(), dispatch: () => {} });
    expect(() => new TurnQueue({ initialState: initial(), reducer: definition.reducer, runtime, execution: { ...enabled(definition.execution), _initial: (_state, _deps, lifecycle) => [{ path: foreign ? childSlot.path : [{ slot: 'missing' }], effect: foreign ? stampOrigin(Effect.none(), ownerAt(lifecycle, childSlot.path)!) : Effect.none() }] } })).toThrow();
    expect(runtime.isDisposed).toBe(true); expect(runtime.resourceScope.size).toBe(0);
  }
});
it('startup rejection is observable once and does not automatically retry on reattachment', () => {
  const log: string[] = []; const definition = makeDefinition(log, { failBoot: true });
  const { queue } = harness(initial(), definition.reducer, enabled(definition.execution, { type: 'boot' }));
  expect(() => queue.activateInitialization({ live: true })).toThrow('startup failed'); queue.activateInitialization({ live: true }); expect(log.filter(item => item === 'parent:boot')).toHaveLength(1); queue.destroy();
});
it('activation cannot jump ahead of already accepted reentrant business turns', () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const { queue } = harness(initial(), definition.reducer, enabled(definition.execution, { type: 'boot' }));
  queue.subscribeToActions(action => { if (action.type === 'save') { queue.dispatch({ type: 'remove' }); queue.activateInitialization({ live: true }); } }); queue.dispatch({ type: 'save' });
  expect(log).toEqual(['plan', 'parent:save', 'parent:remove', 'parent:boot']); queue.destroy();
});
it('reentrant attachment replacement reschedules only still-live pending work', async () => {
  const log: string[] = []; const definition = makeDefinition(log); const { queue } = harness(initial(), definition.reducer, enabled(definition.execution));
  const first = { live: true }, second = { live: true };
  queue.subscribeToActions(action => { if (action.type === 'save') { queue.activateInitialization(first); first.live = false; queue.activateInitialization(second); } }); queue.dispatch({ type: 'save' }); await flush();
  expect(log.filter(item => item === 'initialize')).toHaveLength(1); queue.destroy();
});
it('managed TestStore exposes pending initialization and shares activation action traces', async () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const test = new TestStore({ initialState: initial(), reducer: definition.reducer, execution: enabled(definition.execution, { type: 'boot' }) });
  await expect(test.finish(1)).rejects.toThrow('managed resource'); expect(log).toEqual(['plan']);
  test._activateInitialization({ live: true }); await test.receive({ type: 'boot' }); await test.receive(childSlot.wrap({ type: 'load' })); await test.finish();
  expect(log).toEqual(['plan', 'parent:boot', 'initialize', 'child:load', 'parent:child']); await test.destroyAndSettle();
});
it('two roots reuse one composition definition without sharing initialization entitlement', async () => {
  const log: string[] = []; const definition = makeDefinition(log);
  const a = harness(initial(), definition.reducer, enabled(definition.execution)); const b = harness(initial(), definition.reducer, enabled(definition.execution));
  a.queue.activateInitialization({ live: true }); expect(log.filter(item => item === 'initialize')).toHaveLength(1); b.queue.activateInitialization({ live: true }); await flush(); expect(log.filter(item => item === 'initialize')).toHaveLength(2); a.queue.destroy(); b.queue.destroy();
});
it('nested optional and keyed initial entries use existing epochs and stable traversal order', async () => {
  type Leaf = { name: string }; type LA = { type: 'ready' };
  type Panel = { detail: Leaf | null; rows: { id: string; state: Leaf }[] };
  type PA = { type: 'detail'; action: PresentationAction<LA> } | { type: 'rows'; id: string; action: LA };
  type Root = { panel: Panel | null }; type RA = { type: 'panel'; action: PresentationAction<PA> } | { type: 'reverse' } | { type: 'remove' } | { type: 'insert' };
  const panel = optionalSlot<Root, RA>()('panel'), detail = optionalSlot<Panel, PA>()('detail'), rows = keyedSlot<Panel, PA>()('rows');
  const events: string[] = []; const leaf: Reducer<Leaf, LA> = state => { events.push(`reduce:${state.name}`); return [state, Effect.none()]; };
  const sub = integrate<Panel, PA, unknown>(state => [state, Effect.none()]).managed().with(detail, leaf, { onCreate: state => Effect.run(() => { events.push(state.name); }) }).forEach(rows, leaf, { onCreate: state => Effect.run(() => { events.push(state.name); }), startup: () => ({ type: 'ready' }) }).build();
  const parent: Reducer<Root, RA> = (state, action) => {
    if (!state.panel) return [state, Effect.none()];
    const current = state.panel.rows;
    const next = action.type === 'reverse' ? [...current].reverse() : action.type === 'remove' ? current.filter(row => row.id !== 'a') : action.type === 'insert' ? [...current, { id: 'a', state: { name: 'new-a' } }] : current;
    return [{ panel: { ...state.panel, rows: next } }, Effect.none()];
  };
  const definition = integrate(parent).managed().with(panel, sub, { onCreate: () => Effect.run(() => { events.push('panel'); }) }).build();
  const { queue } = harness({ panel: { detail: { name: 'detail' }, rows: [{ id: 'a', state: { name: 'a' } }, { id: 'b', state: { name: 'b' } }] } }, definition.reducer, enabled(definition.execution));
  const token = ownerAt(queue.getLifecycle(), nestedSlot(panel, rows.at('a')).path); queue.dispatch({ type: 'reverse' }); expect(ownerAt(queue.getLifecycle(), nestedSlot(panel, rows.at('a')).path)).toBe(token);
  queue.activateInitialization({ live: true }); await flush(); expect(events).toEqual(['panel', 'detail', 'a', 'b', 'reduce:a', 'reduce:b']);
  queue.dispatch({ type: 'reverse' }); expect(events).toHaveLength(6); queue.dispatch({ type: 'remove' }); queue.dispatch({ type: 'insert' }); await flush(); expect(events.slice(-2)).toEqual(['new-a', 'reduce:new-a']); expect(ownerAt(queue.getLifecycle(), nestedSlot(panel, rows.at('a')).path)).not.toBe(token); queue.destroy();
});
it('pending initialization has no local effect ID until execution and cannot cancel parent work', async () => {
  let completed!: () => void; const events: string[] = [];
  const child: Reducer<Child, CA> = state => [state, Effect.none()];
  const parent: Reducer<State, Action> = (state, action) => action.type === 'save' ? [state, Effect.cancellable('shared', async dispatch => { await new Promise<void>(resolve => { completed = resolve; }); dispatch({ type: 'saved' }); })] : action.type === 'saved' ? [{ ...state, saved: true }, Effect.none()] : [state, Effect.none()];
  const definition = integrate(parent).managed().with(childSlot, child, { onCreate: () => Effect.subscription('shared', () => { events.push('child'); return () => {}; }) }).build();
  const { queue } = harness(initial(), definition.reducer, enabled(definition.execution)); queue.dispatch({ type: 'save' }); queue.activateInitialization({ live: true }); completed(); await flush(); expect(queue.getState().saved).toBe(true); expect(events).toEqual(['child']); queue.destroy();
});
it('planning decisions are captured once while startup reducers read current business state', async () => {
  const plans: boolean[] = []; const effects: boolean[] = []; let childLoads = 0;
  const child: Reducer<Child, CA> = state => { if (!state.loaded) childLoads++; return [state, Effect.none()]; };
  const parent: Reducer<State, Action> = (state, action) => [action.type === 'boot' ? { ...state, child: { loaded: true } } : state, Effect.none()];
  const definition = integrate(parent).managed().with(childSlot, child, { onCreate: state => { plans.push(state.loaded); return Effect.run(() => { effects.push(state.loaded); }); }, startup: () => ({ type: 'load' }) }).build();
  const { queue } = harness(initial(), definition.reducer, enabled(definition.execution, { type: 'boot' })); queue.activateInitialization({ live: true }); await flush(); expect(plans).toEqual([false]); expect(effects).toEqual([false]); expect(childLoads).toBe(0); queue.destroy();
});
it('pending initialization teardown observes asynchronous cleanup through the existing scope', async () => {
  let resolve!: () => void; const cleanup = new Promise<void>(done => { resolve = done; });
  const log: string[] = []; const definition = makeDefinition(log);
  const runtime = new EffectRuntime<Action>({ scheduler: new DeterministicScheduler(), dispatch: () => {}, onEvent: event => {
    if (event.type === 'started' && event.record.description === 'Pending feature initialization') event.record.addCleanup(() => cleanup);
  } });
  const queue = new TurnQueue({ initialState: initial(), reducer: definition.reducer, runtime, execution: enabled(definition.execution) });
  queue.destroy(); expect(runtime.resourceScope.size).toBe(0); expect(runtime.resourceScope.pendingCleanupCount).toBeGreaterThan(0);
  resolve(); await runtime.whenCleanupsSettled(); expect(runtime.pendingWorkCount).toBe(0);
});
it('initial slot traversal failure disposes construction resources too', () => {
  let cleaned = 0; const runtime = new EffectRuntime<Action>({ scheduler: new DeterministicScheduler(), dispatch: () => {} });
  runtime.resourceScope.createRecord({ cleanup: () => { cleaned++; } });
  expect(() => new TurnQueue({ initialState: initial(), reducer: state => [state, Effect.none()], runtime, execution: { mode: 'managed', slots: { select: () => { throw new Error('bad initial slots'); } }, _initialization: { mode: 'attached' } } })).toThrow('bad initial slots');
  expect(runtime.isDisposed).toBe(true); expect(cleaned).toBe(1);
});
it.each(['Pending feature initialization', 'Pending root startup'])('reattachment preserves unexecuted work if %s cleanup releases the host', async description => {
  const log: string[] = []; const definition = makeDefinition(log); const claim = { live: true }; let released = false; let queue!: TurnQueue<State, Action>;
  const runtime = new EffectRuntime<Action>({ scheduler: new DeterministicScheduler(), dispatch: (action, origin) => queue.enqueue({ action, origin, source: 'effect' }), onEvent: event => {
    if (event.type === 'started' && event.record.description === description) event.record.addCleanup(() => {
      if (!released) { released = true; claim.live = false; queue.releaseInitialization(claim); }
    });
  } });
  queue = new TurnQueue({ initialState: initial(), reducer: definition.reducer, runtime, execution: enabled(definition.execution, { type: 'boot' }) });
  queue.activateInitialization(claim); expect(log).not.toContain('initialize'); queue.activateInitialization({ live: true }); await flush();
  expect(log).toEqual(['plan', 'parent:boot', 'initialize', 'child:load', 'parent:child']); expect(runtime.pendingWorkCount).toBe(0); queue.destroy();
});
it('boot subscriber release leaves children pending for the next attachment without repeating boot', async () => {
  const log: string[] = []; const definition = makeDefinition(log); const { queue } = harness(initial(), definition.reducer, enabled(definition.execution, { type: 'boot' })); const claim = { live: true };
  queue.subscribeToActions(action => { if (action.type === 'boot') { claim.live = false; queue.releaseInitialization(claim); } });
  queue.activateInitialization(claim); expect(log).toEqual(['plan', 'parent:boot']); queue.activateInitialization({ live: true }); await flush();
  expect(log).toEqual(['plan', 'parent:boot', 'initialize', 'child:load', 'parent:child']); queue.destroy();
});
it('SSR explicit business turns stage new children without running their lifecycle initialization', async () => {
  const log: string[] = []; const definition = makeDefinition(log); const { queue, runtime } = harness({ child: null, saved: false } as State, definition.reducer, enabled(definition.execution), true);
  queue.dispatch({ type: 'open' }); queue.activateInitialization({ live: true }); expect(log).toEqual(['parent:open', 'plan']); expect(queue.history).toEqual([{ type: 'open' }]); expect(runtime.resourceScope.size).toBe(2);
  queue.destroy(); await flush(); expect(runtime.pendingWorkCount).toBe(0);
});
it.each(['Pending feature initialization', 'Pending root startup'])('root destruction during %s settlement never restages or executes work', async description => {
  const log: string[] = []; const definition = makeDefinition(log); let queue!: TurnQueue<State, Action>;
  const runtime = new EffectRuntime<Action>({ scheduler: new DeterministicScheduler(), dispatch: (action, origin) => queue.enqueue({ action, origin, source: 'effect' }), onEvent: event => {
    if (event.type === 'started' && event.record.description === description) event.record.addCleanup(() => { queue.destroy(); });
  } });
  queue = new TurnQueue({ initialState: initial(), reducer: definition.reducer, runtime, execution: enabled(definition.execution, { type: 'boot' }) });
  queue.activateInitialization({ live: true }); queue.activateInitialization({ live: true }); await flush();
  expect(log).not.toContain('initialize'); expect(runtime.pendingWorkCount).toBe(0); expect(runtime.isDisposed).toBe(true);
});
