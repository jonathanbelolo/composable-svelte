/**
 * C2 qualification tests for private destination case slots.
 * Exercises genuine createDestination integration, captured metadata.reducer routing,
 * exact owner paths, atomic rejection, departure cancellation, and boundary enforcement.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import {
  ManagedIntegrationBuilder,
  destinationSlot,
  optionalSlot,
  keyedSlot,
  nestedSlot,
  compositionViewEntries,
  type ChildPolicy
} from '../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import { destinationCases, isDestinationReducer } from '../../src/lib/navigation/destination-metadata.js';
import { managedRootAccess } from '../../src/lib/execution/store-access.js';
import { resourceKey } from '../../src/lib/execution/identity.js';
import { managedDismissDependency, type DismissDependency } from '../../src/lib/navigation/dismiss-dependency.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';

interface Deps { readonly dismiss: DismissDependency; }
type CounterState = { count: number };
type CounterAction = { type: 'increment' } | { type: 'reset' } | { type: 'close' };
type TextState = { text: string };
type TextAction = { type: 'set'; text: string };

const counterReducer: Reducer<CounterState, CounterAction, Deps> = (s, a, d) => {
  if (a.type === 'increment') return [{ count: s.count + 1 }, Effect.none()];
  if (a.type === 'reset') return [{ count: 0 }, Effect.none()];
  if (a.type === 'close') return [s, d.dismiss()];
  return [s, Effect.none()];
};
const textReducer: Reducer<TextState, TextAction, Deps> = (s, a) => {
  if (a.type === 'set') return [{ text: a.text }, Effect.none()];
  return [s, Effect.none()];
};

const Dest = createDestination({ counter: counterReducer, text: textReducer });
type DestOccupant = typeof Dest._types.State;
type DestAct = typeof Dest._types.Action;

type ParentState = { dest: DestOccupant | null; tag?: string };
type ParentAction =
  | { type: 'dest'; action: PresentationAction<DestAct> }
  | { type: 'openCounter'; initialCount?: number }
  | { type: 'openText'; initialText?: string }
  | { type: 'replaceCounter'; newCount?: number }
  | { type: 'closeDest' }
  | { type: 'corruptUnknown' }
  | { type: 'corruptMalformed' };

const coreReducer: Reducer<ParentState, ParentAction, Deps> = (s, a) => {
  if (a.type === 'openCounter') return [{ ...s, dest: Dest.initial('counter', { count: a.initialCount ?? 0 }) }, Effect.none()];
  if (a.type === 'openText') return [{ ...s, dest: Dest.initial('text', { text: a.initialText ?? 'hello' }) }, Effect.none()];
  if (a.type === 'replaceCounter') return [{ ...s, dest: Dest.initial('counter', { count: a.newCount ?? 0 }) }, Effect.none()];
  if (a.type === 'closeDest') return [{ ...s, dest: null }, Effect.none()];
  if (a.type === 'corruptUnknown') return [{ ...s, dest: { type: 'unknown_case', state: {} } as any }, Effect.none()];
  if (a.type === 'corruptMalformed') return [{ ...s, dest: { type: 'counter' } as any }, Effect.none()];
  return [s, Effect.none()];
};

const destSlot = destinationSlot<ParentState, ParentAction>()('dest', Dest);
const cleanups: (() => void)[] = [];
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
afterEach(async () => { for (const c of cleanups.splice(0)) c(); await flush(); });

describe('C2 Private Destination Case Slot Qualification Suite', () => {
  it('1. accepts genuine destination and rejects invalid values/arities before registration', () => {
    expect(destSlot.field).toBe('dest');
    for (const bad of [null, undefined, 42, 'str', {}, { ...Dest }, Object.create(Dest), new Proxy(Dest, {}), Dest.reducer]) {
      expect(() => (destinationSlot<ParentState, ParentAction>() as any)('dest', bad)).toThrow(TypeError);
    }
    const forgedBuilder = new ManagedIntegrationBuilder(coreReducer);
    expect(() => (forgedBuilder as any).with({ ...destSlot })).toThrow('Expected a typed managed slot token');
    expect(() => forgedBuilder.with(destSlot)).not.toThrow();
    expect(() => new ManagedIntegrationBuilder(coreReducer).with(destSlot, {})).not.toThrow();
    for (const bad of [counterReducer, Dest, 'bad', 123, { replaceOn: 1 }, { onCreate: 2 }, { startup: 3 }]) {
      const builder = new ManagedIntegrationBuilder(coreReducer);
      expect(() => (builder as any).with(destSlot, bad)).toThrow('A destination slot carries its own reducer; pass only a policy');
      expect(() => builder.with(destSlot)).not.toThrow();
    }
    const threeArgBuilder = new ManagedIntegrationBuilder(coreReducer);
    expect(() => (threeArgBuilder as any).with(destSlot, {}, {})).toThrow('A destination slot carries its own reducer; pass only a policy');
    expect(() => threeArgBuilder.with(destSlot)).not.toThrow();
  });

  it('2. preserves frozen keys, memoized handles, view entries, and routing immutability', () => {
    const Ordered = createDestination({ zebra: counterReducer, alpha: textReducer });
    const meta = destinationCases(Ordered);
    expect(meta.keys).toEqual(['zebra', 'alpha']);
    expect(Object.isFrozen(meta.keys)).toBe(true);

    type OState = { dest: typeof Ordered._types.State | null };
    type OAction = { type: 'dest'; action: PresentationAction<typeof Ordered._types.Action> };
    const oSlot = destinationSlot<OState, OAction>()('dest', Ordered);
    const oComp = new ManagedIntegrationBuilder<OState, OAction, Deps>((s) => [s, Effect.none()]).with(oSlot).build();
    const entries = compositionViewEntries(oComp);
    const entry = entries[0]!;
    expect(entry).toMatchObject({ field: 'dest', kind: 'destination', slot: oSlot, cases: meta.keys });
    expect(entry.child).toBeUndefined();
    expect(Object.isFrozen(entry.cases)).toBe(true);

    expect(oSlot.case('zebra')).toBe(oSlot.case('zebra'));
    expect(Object.isFrozen(oSlot.case('zebra'))).toBe(true);
    for (const badKey of ['missing', 'toString', '__proto__', 'presented', 'dismiss']) {
      expect(() => destSlot.case(badKey as any)).toThrow(TypeError);
    }
    expect(() => createDestination({ presented: counterReducer as any })).toThrow(TypeError);
    expect(() => createDestination({ dismiss: counterReducer as any })).toThrow(TypeError);

    const orig = Dest.reducer;
    expect(isDestinationReducer(orig)).toBe(true);
    try {
      (Dest as any).reducer = () => { throw new Error('mutated result.reducer consulted'); };
      const comp = new ManagedIntegrationBuilder(coreReducer).with(destSlot).build();
      const store = createStore({ initialState: { dest: Dest.initial('counter', { count: 5 }) }, ...comp, dependencies: { dismiss: managedDismissDependency() } });
      try {
        comp.bind(store, destSlot.case('counter'))?.dispatch({ type: 'increment' });
        expect(store.state.dest).toEqual({ type: 'counter', state: { count: 6 } });
      } finally { store.destroy(); }
    } finally { (Dest as any).reducer = orig; }
  });

  it('3. routes exact case paths with prefix, cycles a->b->a, retires stale dispatch, and omits replacement', () => {
    const comp = new ManagedIntegrationBuilder(coreReducer).with(destSlot).build();
    expect(comp.execution.slots!.select({ dest: Dest.initial('counter', { count: 0 }) })).toEqual([[{ slot: 'dest' }, { key: 'counter' }]]);

    type RootState = { panel: ParentState | null };
    type RootAction = { type: 'panel'; action: PresentationAction<ParentAction> };
    const panelSlot = optionalSlot<RootState, RootAction>()('panel');
    const rootComp = new ManagedIntegrationBuilder<RootState, RootAction, Deps>((s) => [s, Effect.none()]).with(panelSlot, comp).build();
    expect(rootComp.execution.slots!.select({ panel: { dest: Dest.initial('text', { text: 'hi' }) } })).toEqual([[{ slot: 'panel' }], [{ slot: 'panel' }, { slot: 'dest' }, { key: 'text' }]]);

    const store = createStore({ initialState: { dest: Dest.initial('counter', { count: 0 }) }, ...comp, dependencies: { dismiss: managedDismissDependency() } });
    try {
      const v1 = comp.bind(store, destSlot.case('counter'))!;
      expect(v1.state).toEqual({ count: 0 });

      const [, , repl] = comp.execution._reduce!({ state: store.state, action: { type: 'openText', initialText: 'b' }, dependencies: { dismiss: managedDismissDependency() }, lifecycle: managedRootAccess(store, comp.execution).lifecycle(), reducer: coreReducer });
      expect(repl).toEqual([]);

      store.dispatch({ type: 'openText', initialText: 'b' });
      expect(v1.state).toBeUndefined();
      v1.dispatch({ type: 'increment' });
      expect(store.state.dest).toEqual({ type: 'text', state: { text: 'b' } });

      const vText = comp.bind(store, destSlot.case('text'))!;
      expect(vText.state).toEqual({ text: 'b' });
      vText.dispatch({ type: 'set', text: 'b2' });
      expect(store.state.dest).toEqual({ type: 'text', state: { text: 'b2' } });

      store.dispatch({ type: 'openCounter', initialCount: 20 });
      expect(vText.state).toBeUndefined();
      expect(v1.state).toBeUndefined();

      const v2 = comp.bind(store, destSlot.case('counter'))!;
      expect(v2).not.toBe(v1);
      expect(v2.state).toEqual({ count: 20 });
      v2.dispatch({ type: 'increment' });
      expect(store.state.dest).toEqual({ type: 'counter', state: { count: 21 } });
    } finally { store.destroy(); }
  });

  it('4. emits exact case path and refires onCreate on replaceOn, ignoring case changes', async () => {
    let replaceOnCalls = 0;
    const created: string[] = [];
    const policy: ChildPolicy<ParentState, ParentAction, DestOccupant, DestAct, Deps> = {
      replaceOn: (a) => { replaceOnCalls++; return a.type === 'replaceCounter'; },
      onCreate: (occ) => { created.push(occ.type); return Effect.none(); }
    };
    const comp = new ManagedIntegrationBuilder(coreReducer).with(destSlot, policy).build();
    const store = createStore({ initialState: { dest: Dest.initial('counter', { count: 0 }) }, ...comp, dependencies: { dismiss: managedDismissDependency() } });
    try {
      await flush();
      // Raw createStore has no attached initialization claim, so initial-owner work is staged only by application startup.
      expect(created).toEqual([]);
      expect(replaceOnCalls).toBe(0);

      store.dispatch({ type: 'openText', initialText: 'txt' });
      await flush();
      expect(created).toEqual(['text']);
      expect(replaceOnCalls).toBe(0);

      comp.bind(store, destSlot.case('text'))?.dispatch({ type: 'set', text: 'next' });
      expect(replaceOnCalls).toBe(1);
      expect(created).toEqual(['text']);

      store.dispatch({ type: 'openCounter', initialCount: 10 });
      await flush();
      expect(created).toEqual(['text', 'counter']);
      expect(replaceOnCalls).toBe(1);

      const oldCounter = comp.bind(store, destSlot.case('counter'))!;
      const [, , repl] = comp.execution._reduce!({ state: store.state, action: { type: 'replaceCounter', newCount: 99 }, dependencies: { dismiss: managedDismissDependency() }, lifecycle: managedRootAccess(store, comp.execution).lifecycle(), reducer: coreReducer });
      expect(repl).toEqual([{ type: 'replace', path: [{ slot: 'dest' }, { key: 'counter' }] }]);

      // Direct _reduce plans created-owner work, so snapshot both pure callbacks before the real dispatch.
      const callsAfterPureProbe = replaceOnCalls;
      const createdAfterPureProbe = created.length;
      store.dispatch({ type: 'replaceCounter', newCount: 99 });
      await flush();
      expect(replaceOnCalls).toBe(callsAfterPureProbe + 1);
      expect(created).toHaveLength(createdAfterPureProbe + 1);
      expect(created.at(-1)).toBe('counter');
      expect(oldCounter.state).toBeUndefined();
      expect(comp.bind(store, destSlot.case('counter'))?.state).toEqual({ count: 99 });
    } finally { store.destroy(); }
  });

  it('5. aborts construction on invalid initial occupants and rejects later occupants atomically', () => {
    const comp = new ManagedIntegrationBuilder(coreReducer).with(destSlot).build();
    for (const bad of [{ type: 'bogus', state: {} }, { type: 1, state: {} }, { state: {} }, { type: 'counter' }, 'str']) {
      expect(() => createStore({ initialState: { dest: bad as any }, ...comp, dependencies: { dismiss: managedDismissDependency() } })).toThrow(TypeError);
    }
    const store = createStore({ initialState: { dest: Dest.initial('counter', { count: 10 }) }, ...comp, dependencies: { dismiss: managedDismissDependency() } });
    try {
      const snap = { state: store.state, history: [...store.history] };
      expect(() => store.dispatch({ type: 'corruptUnknown' })).toThrow("Destination slot 'dest' occupant is outside the createDestination catalog");
      expect(store.state).toEqual(snap.state);
      expect(store.history).toEqual(snap.history);

      expect(() => store.dispatch({ type: 'corruptMalformed' })).toThrow(TypeError);
      expect(store.state).toEqual(snap.state);
      expect(store.history).toEqual(snap.history);

      comp.bind(store, destSlot.case('counter'))?.dispatch({ type: 'increment' });
      expect(store.state.dest).toEqual({ type: 'counter', state: { count: 11 } });
    } finally { store.destroy(); }
  });

  it('6. stamps case owner to reducer effect and drops completion after departure', async () => {
    let resolveGate!: () => void;
    let gate = new Promise<void>((r) => { resolveGate = r; });
    type AsyncAction = { type: 'start' } | { type: 'done' };
    const asyncRed: Reducer<{ val: number }, AsyncAction, Deps> = (s, a) => {
      if (a.type === 'start') return [s, Effect.run<AsyncAction>(async (d) => { await gate; d({ type: 'done' }); })];
      if (a.type === 'done') return [{ val: s.val + 1 }, Effect.none()];
      return [s, Effect.none()];
    };
    const AsyncDest = createDestination({ worker: asyncRed, idle: textReducer });
    type AS = { dest: typeof AsyncDest._types.State | null };
    type AA = { type: 'dest'; action: PresentationAction<typeof AsyncDest._types.Action> } | { type: 'openWorker' } | { type: 'openIdle' };
    const aCore: Reducer<AS, AA, Deps> = (s, a) => {
      if (a.type === 'openWorker') return [{ dest: AsyncDest.initial('worker', { val: 0 }) }, Effect.none()];
      if (a.type === 'openIdle') return [{ dest: AsyncDest.initial('idle', { text: 'ready' }) }, Effect.none()];
      return [s, Effect.none()];
    };
    const aSlot = destinationSlot<AS, AA>()('dest', AsyncDest);
    const comp = new ManagedIntegrationBuilder(aCore).with(aSlot).build();
    const store = createStore({ initialState: { dest: AsyncDest.initial('worker', { val: 0 }) }, ...comp, dependencies: { dismiss: managedDismissDependency() } });
    try {
      store.dispatch(aSlot.case('worker').wrap({ type: 'start' }));
      await flush();
      store.dispatch({ type: 'openIdle' });
      await flush();
      expect(store.state.dest).toEqual({ type: 'idle', state: { text: 'ready' } });

      resolveGate();
      await flush();
      expect(store.state.dest).toEqual({ type: 'idle', state: { text: 'ready' } });
      expect(store.history.some((a) => JSON.stringify(a).includes('done'))).toBe(false);

      gate = new Promise<void>((r) => { resolveGate = r; });
      store.dispatch({ type: 'openWorker' });
      await flush();
      store.dispatch(aSlot.case('worker').wrap({ type: 'start' }));
      await flush();
      resolveGate();
      await flush();
      expect(store.state.dest).toEqual({ type: 'worker', state: { val: 1 } });
      expect(store.history.some((a) => JSON.stringify(a).includes('done'))).toBe(true);
    } finally { store.destroy(); }
  });

  it('7. rejects whole-token bind and nested-under-case handle lineage', () => {
    const comp = new ManagedIntegrationBuilder(coreReducer).with(destSlot).build();
    const store = createStore({ initialState: { dest: Dest.initial('counter', { count: 0 }) }, ...comp, dependencies: { dismiss: managedDismissDependency() } });
    try {
      expect(() => comp.bind(store, destSlot as any)).toThrow('Destination slots bind through a case handle');
      const innerOpt = (optionalSlot<any, any>() as any)('n');
      const nested = nestedSlot(destSlot.case('counter') as any, innerOpt as any);
      expect(() => comp.bind(store, nested as any)).toThrow('Slot token is not registered in this composition');
    } finally { store.destroy(); }
  });

  it('8. preserves ordinary optional R1 claim and keyed controls in composite', async () => {
    type MultiState = { dest: DestOccupant | null; opt: CounterState | null; rows: { id: number; state: CounterState }[] };
    type MultiAction =
      | { type: 'dest'; action: PresentationAction<DestAct> }
      | { type: 'opt'; action: PresentationAction<CounterAction> }
      | { type: 'rows'; id: number; action: CounterAction };
    const mDest = destinationSlot<MultiState, MultiAction>()('dest', Dest);
    const mOpt = optionalSlot<MultiState, MultiAction>()('opt');
    const mKeyed = keyedSlot<MultiState, MultiAction>()('rows');
    const comp = new ManagedIntegrationBuilder<MultiState, MultiAction, Deps>((s) => [s, Effect.none()])
      .with(mDest)
      .with(mOpt, counterReducer)
      .forEach(mKeyed, counterReducer)
      .build();
    const store = createStore({
      initialState: { dest: Dest.initial('counter', { count: 0 }), opt: { count: 10 }, rows: [{ id: 1, state: { count: 50 } }] },
      ...comp,
      dependencies: { dismiss: managedDismissDependency() }
    });
    try {
      store.dispatch(mOpt.wrap({ type: 'close' }));
      await flush();
      expect(store.state.opt).toBeNull();
      expect(store.history).toContainEqual({ type: 'opt', action: { type: 'dismiss' } });

      comp.bind(store, mDest.case('counter'))?.dispatch({ type: 'increment' });
      comp.bind(store, mKeyed.at(1))?.dispatch({ type: 'increment' });
      expect(store.state.dest).toEqual({ type: 'counter', state: { count: 1 } });
      expect(store.state.rows[0]!.state.count).toBe(51);
    } finally { store.destroy(); }
  });

  it('9. enforces field collisions in both orders and allows one token in multiple builders', () => {
    type S = { same: any }; type A = { type: 'same'; action: PresentationAction<any> };
    const opt = optionalSlot<S, A>()('same', { destinationShape: 'ordinary' });
    const dest = destinationSlot<S, A>()('same', Dest);
    expect(() => new ManagedIntegrationBuilder<S, A, Deps>((s) => [s, Effect.none()]).with(opt, counterReducer).with(dest)).toThrow("Managed slot 'same' already registered");
    expect(() => new ManagedIntegrationBuilder<S, A, Deps>((s) => [s, Effect.none()]).with(dest).with(opt, counterReducer)).toThrow("Managed slot 'same' already registered");
    expect(() => new ManagedIntegrationBuilder<S, A, Deps>((s) => [s, Effect.none()]).with(dest).with(dest)).toThrow("Managed slot 'same' already registered");

    const comp1 = new ManagedIntegrationBuilder(coreReducer).with(destSlot).build();
    const comp2 = new ManagedIntegrationBuilder(coreReducer).with(destSlot).build();
    const s1 = createStore({ initialState: { dest: Dest.initial('counter', { count: 1 }) }, ...comp1, dependencies: { dismiss: managedDismissDependency() } });
    const s2 = createStore({ initialState: { dest: Dest.initial('counter', { count: 10 }) }, ...comp2, dependencies: { dismiss: managedDismissDependency() } });
    try {
      comp1.bind(s1, destSlot.case('counter'))?.dispatch({ type: 'increment' });
      comp2.bind(s2, destSlot.case('counter'))?.dispatch({ type: 'reset' });
      expect(s1.state.dest).toEqual({ type: 'counter', state: { count: 2 } });
      expect(s2.state.dest).toEqual({ type: 'counter', state: { count: 0 } });
    } finally { s1.destroy(); s2.destroy(); }
  });

  it('10. filters stale inner replacement/case-change intents on simultaneous outer removal', () => {
    type InnerState = { dest: DestOccupant | null };
    type InnerAction = { type: 'dest'; action: PresentationAction<DestAct> } | { type: 'replaceCounter' };
    const innerSlot = destinationSlot<InnerState, InnerAction>()('dest', Dest);
    const innerComp = new ManagedIntegrationBuilder<InnerState, InnerAction, Deps>(
      (s, a) => [a.type === 'replaceCounter' ? { dest: Dest.initial('counter', { count: 999 }) } : s, Effect.none()]
    ).with(innerSlot, { replaceOn: (a) => a.type === 'replaceCounter' }).build();

    type OuterState = { panel: InnerState | null };
    type OuterAction = { type: 'panel'; action: PresentationAction<InnerAction> };
    const panelSlot = optionalSlot<OuterState, OuterAction>()('panel');
    const outerComp = new ManagedIntegrationBuilder<OuterState, OuterAction, Deps>(
      (s, a) => [
        a.type === 'panel' && a.action.type === 'presented' && a.action.action.type === 'replaceCounter'
          ? { panel: null }
          : s,
        Effect.none()
      ]
    ).with(panelSlot, innerComp).build();

    const store = createStore({ initialState: { panel: { dest: Dest.initial('counter', { count: 0 }) } }, ...outerComp, dependencies: { dismiss: managedDismissDependency() } });
    try {
      expect(() => store.dispatch({ type: 'panel', action: { type: 'presented', action: { type: 'replaceCounter' } } })).not.toThrow();
      expect(store.state.panel).toBeNull();
    } finally { store.destroy(); }
  });

  it('11. policy callbacks receive occupant/action union and suppresses departed onCreate without timers', async () => {
    let capturedOnCreate: DestOccupant | undefined;
    let capturedReplaceArgs: [ParentAction, ParentState, ParentState] | undefined;
    let resolveCreateGate!: () => void;
    const createGate = new Promise<void>((r) => { resolveCreateGate = r; });

    const policy: ChildPolicy<ParentState, ParentAction, DestOccupant, DestAct, Deps> = {
      onCreate: (occ) => {
        capturedOnCreate = occ;
        if (occ.type === 'counter') {
          return Effect.run<DestAct>(async (d) => { await createGate; d({ type: 'counter', action: { type: 'increment' } }); });
        }
        return Effect.none();
      },
      replaceOn: (a, b, after) => { capturedReplaceArgs = [a, b, after]; return false; }
    };

    const comp = new ManagedIntegrationBuilder(coreReducer).with(destSlot, policy).build();
    const store = createStore({ initialState: { dest: null }, ...comp, dependencies: { dismiss: managedDismissDependency() } });
    try {
      store.dispatch({ type: 'openCounter', initialCount: 42 });
      await flush();
      expect(capturedOnCreate).toEqual({ type: 'counter', state: { count: 42 } });
      comp.bind(store, destSlot.case('counter'))?.dispatch({ type: 'increment' });
      expect(capturedReplaceArgs).toBeDefined();
      expect(capturedReplaceArgs![1].dest).toEqual({ type: 'counter', state: { count: 42 } });
      expect(capturedReplaceArgs![2].dest).toEqual({ type: 'counter', state: { count: 43 } });

      store.dispatch({ type: 'openText', initialText: 'departed' });
      await flush();
      expect(store.state.dest).toEqual({ type: 'text', state: { text: 'departed' } });

      const countBefore = store.history.length;
      resolveCreateGate();
      await flush();
      expect(store.state.dest).toEqual({ type: 'text', state: { text: 'departed' } });
      expect(store.history.length).toBe(countBefore);
    } finally { store.destroy(); }
  });

  it('12. stages an initial occupant subscription until attached activation and qualifies it once to the case owner', async () => {
    let setups = 0;
    let cleanups = 0;
    const comp = new ManagedIntegrationBuilder(coreReducer).with(destSlot, {
      onCreate: () => Effect.subscription('destination-initial', () => {
        setups++;
        return () => { cleanups++; };
      })
    }).build();
    const store = createStore({
      initialState: { dest: Dest.initial('counter', { count: 7 }) },
      ...comp,
      execution: { ...comp.execution, _initialization: { mode: 'attached' } },
      dependencies: { dismiss: managedDismissDependency() }
    });
    const access = managedRootAccess(store, comp.execution);
    const claim = { live: true };
    const lifecycle = access.lifecycle();
    expect(lifecycle.owners).toHaveLength(1);
    const owner = lifecycle.owners[0]!;
    expect(owner.path).toEqual([{ slot: 'dest' }, { key: 'counter' }]);
    const register = vi.spyOn(store._runtime!.resourceScope, 'registerSubscription');
    try {
      expect(setups).toBe(0);
      access.activateInitialization(claim);
      await flush();
      expect(setups).toBe(1);
      expect(register).toHaveBeenCalledOnce();
      expect(register.mock.calls[0]![0]).toMatchObject({
        id: resourceKey(owner.token, 'id', 'destination-initial'),
        ownerToken: owner.token
      });
      access.activateInitialization(claim);
      await flush();
      expect(setups).toBe(1);
      expect(register).toHaveBeenCalledOnce();
    } finally {
      claim.live = false;
      access.releaseInitialization(claim);
      store.destroy();
      await store._runtime!.whenCleanupsSettled();
      expect(cleanups).toBe(1);
    }
  });

  it('13. suppresses replacement intent on a case-changing action even when replaceOn always accepts', () => {
    const comp = new ManagedIntegrationBuilder(coreReducer).with(destSlot, { replaceOn: () => true }).build();
    const store = createStore({ initialState: { dest: Dest.initial('counter', { count: 1 }) }, ...comp, dependencies: { dismiss: managedDismissDependency() } });
    try {
      const [next, , replacements] = comp.execution._reduce!({
        state: store.state,
        action: { type: 'openText', initialText: 'changed' },
        dependencies: { dismiss: managedDismissDependency() },
        lifecycle: managedRootAccess(store, comp.execution).lifecycle(),
        reducer: coreReducer
      });
      expect(next.dest).toEqual({ type: 'text', state: { text: 'changed' } });
      expect(replacements).toEqual([]);
      expect(() => store.dispatch({ type: 'openText', initialText: 'committed' })).not.toThrow();
      expect(store.state.dest).toEqual({ type: 'text', state: { text: 'committed' } });
    } finally { store.destroy(); }
  });

});
