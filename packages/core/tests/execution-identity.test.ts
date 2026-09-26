import { describe, expect, it, vi } from 'vitest';
import { Effect } from '../src/lib/effect.js';
import type { Effect as EffectType, Dispatch, Reducer } from '../src/lib/types.js';
import { createStore } from '../src/lib/store.svelte.js';
import { TestStore } from '../src/lib/test/test-store.js';
import { createLifecycle, isOwnerLive, ownerAt, qualifyEffect, reconcile, resourceKey, stampOrigin } from '../src/lib/execution/identity.js';
import type { Lifecycle, LiveOwner, OwnerPath, OwnerToken, SlotDescriptor } from '../src/lib/execution/identity.js';
import type { TurnEnvelope } from '../src/lib/execution/turn-queue.js';

const path = (key: string | number): OwnerPath => [{ slot: 'items' }, { key }];
interface Feature { items: readonly (string | number)[]; detail?: string }
const slots: SlotDescriptor<Feature> = { select: state => state.items.map(path) };
function initial(items: readonly (string | number)[] = ['a', 'b']) {
  return reconcile(createLifecycle(), { items: [] }, { items }, slots).lifecycle;
}
function required(lifecycle: Lifecycle, key: string | number): OwnerToken {
  const owner = ownerAt(lifecycle, path(key));
  if (!owner) throw new Error('Missing fixture owner');
  return owner;
}

function descriptions(): EffectType<number>[] {
  return [
    Effect.none(), Effect.run(dispatch => dispatch(1)), Effect.fireAndForget(() => {}),
    Effect.cancellable('local', dispatch => dispatch(1)), Effect.cancel('local'),
    Effect.debounced('local', 1, dispatch => dispatch(1)),
    Effect.throttled('local', 1, dispatch => dispatch(1)),
    Effect.afterDelay(1, dispatch => dispatch(1)),
    Effect.subscription('local', dispatch => { dispatch(1); return () => {}; }),
    Effect.cancelGroup('local'),
    { _tag: 'Batch', effects: [Effect.run(dispatch => dispatch(1)), Effect.none()] }
  ];
}

function leaves<A>(effect: EffectType<A>): EffectType<A>[] {
  return effect._tag === 'Batch' ? effect.effects.flatMap(leaves) : [effect];
}

describe('pure owner reconciliation', () => {
  it('keeps edits and reorders, but isolates removal/re-addition and same-key replacement', () => {
    const start = initial();
    const a = required(start, 'a');
    const b = required(start, 'b');
    const reordered = reconcile(start, { items: ['a', 'b'] }, { items: ['b', 'a'], detail: 'edited' }, slots);
    expect(reordered.surviving).toEqual([a, b]);
    expect(reordered.created).toEqual([]);
    expect(reordered.invalidated).toEqual([]);
    const removedBoth = reconcile(reordered.lifecycle, { items: ['b', 'a'] }, { items: [] }, slots);
    expect(removedBoth.invalidated).toEqual([a, b]);
    const removed = reconcile(reordered.lifecycle, { items: ['b', 'a'] }, { items: ['b'] }, slots);
    expect(removed.invalidated).toEqual([a]);
    expect(isOwnerLive(removed.lifecycle, a)).toBe(false);
    const reopened = reconcile(removed.lifecycle, { items: ['b'] }, { items: ['a', 'b'] }, slots);
    expect(required(reopened.lifecycle, 'a').id).toBeGreaterThan(a.id);
    const replacement = reconcile(reopened.lifecycle, { items: ['a', 'b'] }, { items: ['a', 'b'] }, slots, [{ type: 'replace', path: path('a') }]);
    expect(replacement.invalidated).toEqual([required(reopened.lifecycle, 'a')]);
    expect(replacement.surviving).toEqual([b]);
    expect(start.nextId).toBe(3);
    expect(start.owners.map(owner => owner.token)).toEqual([a, b]);
  });

  it('handles explicit optional and nested slots, replacing a parent invalidates descendants', () => {
    type State = { open: boolean; nested: boolean; unrelated: object };
    const parent: OwnerPath = [{ slot: 'dialog' }];
    const child: OwnerPath = [...parent, { slot: 'detail' }];
    const descriptor: SlotDescriptor<State> = { select: state => state.open ? [parent, ...(state.nested ? [child] : [])] : [] };
    const closed: State = { open: false, nested: false, unrelated: {} };
    const opened: State = { open: true, nested: true, unrelated: {} };
    const first = reconcile(createLifecycle(), closed, opened, descriptor);
    expect(first.created).toHaveLength(2);
    const replaced = reconcile(first.lifecycle, opened, opened, descriptor, [{ type: 'replace', path: parent }]);
    expect(replaced.invalidated).toEqual(first.created);
    expect(replaced.invalidated[0]).toBe(ownerAt(first.lifecycle, child));
    expect(replaced.invalidated[1]).toBe(ownerAt(first.lifecycle, parent));
    expect(replaced.created).toHaveLength(2);
    const removed = reconcile(replaced.lifecycle, opened, closed, descriptor);
    expect(removed.lifecycle.owners).toEqual([]);
    expect(removed.invalidated).toEqual(replaced.created);
    expect(() => reconcile(first.lifecycle, opened, opened, { select: state => state === opened ? [child] : [] })).toThrow(/before state/);
    const invalidAfter = { ...opened, nested: false };
    expect(() => reconcile(first.lifecycle, opened, invalidAfter, { select: state => state === opened ? [parent, child] : [child] })).toThrow(/removed parent/);
  });

  it('allocates deterministically, without delimiter, numeric, or slot/key aliasing', () => {
    const keys = [1, '1', 'a/b', 'a', '-0', -0, 0];
    const a = initial(keys);
    const b = initial([...keys].reverse());
    expect(a.owners.map(owner => [owner.path, owner.token.id])).toEqual(b.owners.map(owner => [owner.path, owner.token.id]));
    expect(new Set(keys.map(key => required(a, key))).size).toBe(keys.length);
    expect(ownerAt(a, [{ key: 'items' }, { key: 'a' }])).toBeUndefined();
  });

  it('rejects lookalike and foreign tokens, retaining only live owner records', () => {
    const start = initial(['a']);
    const owner = required(start, 'a');
    expect(isOwnerLive(start, { ...owner })).toBe(false);
    expect(isOwnerLive(start, required(initial(['a']), 'a'))).toBe(false);
    expect(isOwnerLive(start, undefined)).toBe(true);
    let current = start;
    for (let i = 0; i < 100; i++) {
      current = reconcile(current, { items: ['a'] }, { items: ['a'] }, slots, [{ type: 'replace', path: path('a') }]).lifecycle;
    }
    expect(current.owners).toHaveLength(1);
    expect(current.nextId).toBe(102);
    expect(isOwnerLive(current, owner)).toBe(false);
  });

  it('fails atomically on exhaustion and rejects ambiguous descriptors or replacement', () => {
    const near: Lifecycle = Object.freeze({ nextId: Number.MAX_SAFE_INTEGER - 1, owners: Object.freeze([]) });
    expect(() => reconcile(near, { items: [] }, { items: ['a', 'b'] }, slots)).toThrow(RangeError);
    const fitting = reconcile(near, { items: [] }, { items: ['b'] }, slots);
    expect(fitting.created).toHaveLength(1);
    expect(fitting.created[0]!.id).toBe(Number.MAX_SAFE_INTEGER - 1);
    expect(fitting.lifecycle.nextId).toBe(Number.MAX_SAFE_INTEGER);
    expect(ownerAt(fitting.lifecycle, path('a'))).toBeUndefined();
    const edited = reconcile(fitting.lifecycle, { items: ['b'] }, { items: ['b'], detail: 'edited' }, slots);
    expect(edited.surviving).toEqual(fitting.created);
    expect(() => reconcile(fitting.lifecycle, { items: ['b'] }, { items: ['a', 'b'] }, slots)).toThrow(/exhausted/);

    const liveA: LiveOwner = Object.freeze({ path: path('a'), token: Object.freeze({ id: 1 }) as OwnerToken });
    const nearWithA: Lifecycle = Object.freeze({
      nextId: Number.MAX_SAFE_INTEGER - 1,
      owners: Object.freeze([liveA])
    });
    expect(() => reconcile(nearWithA, { items: ['a'] }, { items: ['a', 'b'] }, slots, [{ type: 'replace', path: path('a') }])).toThrow(RangeError);

    expect(() => initial(['a', 'a'])).toThrow(/Duplicate/);
    expect(() => initial([NaN])).toThrow(/finite/);
    expect(() => reconcile(initial(), { items: [] }, { items: [] }, slots)).toThrow(/before/);
    expect(() => reconcile(initial(), { items: ['a', 'b'] }, { items: ['b'] }, slots, [{ type: 'replace', path: path('a') }])).toThrow(/surviving/);
  });

  it('copies and freezes descriptor paths, without freezing consumer feature objects', () => {
    const part = { slot: 'dialog' };
    const feature = { items: [] };
    const result = reconcile(createLifecycle(), { items: [] }, feature, { select: state => state === feature ? [[part]] : [] });
    part.slot = 'changed';
    expect(result.lifecycle.owners[0]!.path).toEqual([{ slot: 'dialog' }]);
    expect(Object.isFrozen(feature)).toBe(false);
    expect(Object.isFrozen(result.lifecycle.owners)).toBe(true);
    expect(Object.isFrozen(result.lifecycle.owners[0]!.token)).toBe(true);
  });
});

describe('effect origin transformations', () => {
  for (const [index, effect] of descriptions().entries()) {
    it(`preserves origin and legacy cancellation metadata through map/group/prefix (${effect._tag} ${index})`, async () => {
      const lifecycle = initial();
      const a = required(lifecycle, 'a');
      const scoped = stampOrigin(Effect.inGroup(effect, 'group'), a);
      const mapped = Effect.map(scoped, value => `mapped:${value}`);
      const prefixed = Effect.prefixGroups(mapped, 'outer');
      expect(leaves(prefixed).every(leaf => leaf.origin === a)).toBe(true);
      const inverse = stampOrigin(Effect.map(Effect.inGroup(effect, 'group'), value => `mapped:${value}`), a);
      expect(leaves(mapped).map(leaf => [leaf._tag, leaf.origin, 'id' in leaf ? leaf.id : null, 'groups' in leaf ? leaf.groups : null, 'cancelOnly' in leaf ? leaf.cancelOnly : null]))
        .toEqual(leaves(inverse).map(leaf => [leaf._tag, leaf.origin, 'id' in leaf ? leaf.id : null, 'groups' in leaf ? leaf.groups : null, 'cancelOnly' in leaf ? leaf.cancelOnly : null]));
      const actions: string[] = [];
      const controller = new AbortController();
      for (const leaf of leaves(mapped)) {
        if ('execute' in leaf && leaf._tag !== 'FireAndForget') await leaf.execute(action => actions.push(action), controller.signal);
        if (leaf._tag === 'Subscription') await leaf.setup(action => actions.push(action))();
      }
      expect(actions).toEqual(['None', 'FireAndForget', 'CancelGroup'].includes(effect._tag) || (effect._tag === 'Cancellable' && effect.cancelOnly) ? [] : ['mapped:1']);
      const qualified = qualifyEffect(prefixed, lifecycle);
      for (const leaf of leaves(qualified)) {
        expect(leaf.origin).toBe(a);
        if ('id' in leaf) expect(leaf.id).toBe(resourceKey(a, 'id', 'local'));
        if ('groups' in leaf) expect(leaf.groups).toEqual([resourceKey(a, 'group', 'outer/group')]);
        if (leaf._tag === 'CancelGroup') expect(leaf.group).toBe(resourceKey(a, 'group', 'outer/local'));
      }
    });
  }

  it('preserves mixed parent/child ownership through outer lifts and nested batches', () => {
    const state = initial();
    const a = required(state, 'a'); const b = required(state, 'b');
    const mixed = stampOrigin({ _tag: 'Batch', effects: [stampOrigin(Effect.run<number>(() => {}), a), { _tag: 'Batch', effects: [stampOrigin(Effect.cancelGroup('group'), b), Effect.fireAndForget(() => {})] }] }, a);
    expect(leaves(Effect.map(mixed, String)).map(leaf => leaf.origin)).toEqual([a, b, a]);
    const removed = reconcile(state, { items: ['a', 'b'] }, { items: ['b'] }, slots).lifecycle;
    expect(leaves(qualifyEffect(mixed, removed)).map(leaf => leaf._tag)).toEqual(['None', 'CancelGroup', 'None']);
  });

  it('does not expose ownership on the public Effect namespace or qualify IDs during stamping', () => {
    expect('withOrigin' in Effect).toBe(false);
    const owner = required(initial(), 'a');
    const stamped = stampOrigin(Effect.cancel('arbitrary:[owner,1]'), owner);
    expect(stamped).toMatchObject({ id: 'arbitrary:[owner,1]', cancelOnly: true });
  });

  it('root strings resembling encoded IDs cannot cancel a child, and id/group domains differ', () => {
    const owner = required(initial(), 'a');
    const child = resourceKey(owner, 'id', 'x');
    expect(resourceKey(undefined, 'id', child)).not.toBe(child);
    expect(resourceKey(owner, 'group', 'x')).not.toBe(child);
    expect(resourceKey(undefined, 'id', 'x')).not.toBe(child);
  });

  it('drops every obsolete tag before execution, including FireAndForget and cancellation', () => {
    const state = initial(); const old = required(state, 'a');
    const next = reconcile(state, { items: ['a', 'b'] }, { items: ['a', 'b'] }, slots, [{ type: 'replace', path: path('a') }]).lifecycle;
    for (const effect of descriptions()) {
      expect(leaves(qualifyEffect(stampOrigin(effect, old), next)).every(leaf => leaf._tag === 'None')).toBe(true);
    }
  });
});

for (const adapter of ['production', 'test'] as const) {
  for (const cancellation of ['id', 'group'] as const) {
    it(`qualifies local IDs/groups at the real ${adapter} boundary (${cancellation})`, async () => {
      type Action = { type: 'start' | 'cancel-a' | 'cancel-root' | 'cancel-b' } | { type: 'message'; source: string };
      const lifecycle = initial(); const a = required(lifecycle, 'a'); const b = required(lifecycle, 'b');
      const callbacks = new Map<string, Dispatch<Action>>(); const trace: string[] = [];
      const subscription = (label: string) => Effect.inGroup(Effect.subscription<Action>('same', dispatch => {
        callbacks.set(label, dispatch); trace.push(`start:${label}`); return () => { trace.push(`cleanup:${label}`); };
      }), 'same');
      const cancel = () => cancellation === 'id' ? Effect.cancel<Action>('same') : Effect.cancelGroup<Action>('same');
      const reducer: Reducer<string[], Action> = (state, action) => {
        let effect: EffectType<Action>;
        switch (action.type) {
          case 'start': effect = Effect.batch(stampOrigin(subscription('a'), a), stampOrigin(subscription('b'), b), subscription('root')); break;
          case 'cancel-a': effect = stampOrigin(cancel(), a); break;
          case 'cancel-b': effect = stampOrigin(cancel(), b); break;
          case 'cancel-root': effect = cancel(); break;
          case 'message': return [[...state, action.source], Effect.none()];
        }
        return [state, qualifyEffect(Effect.map(Effect.prefixGroups(effect, 'lift'), value => value), lifecycle)];
      };
      const production = adapter === 'production' ? createStore({ initialState: [] as string[], reducer, ssr: { deferEffects: false } }) : undefined;
      const test = adapter === 'test' ? new TestStore({ initialState: [] as string[], reducer }) : undefined;
      const send = async (action: Action) => { if (test) await test.send(action); else production!.dispatch(action); };
      try {
        await send({ type: 'start' });
        expect(trace).toEqual(['start:a', 'start:b', 'start:root']);
        await send({ type: 'cancel-a' });
        expect(trace).toEqual(['start:a', 'start:b', 'start:root', 'cleanup:a']);
        callbacks.get('a')!({ type: 'message', source: 'stale-a' });
        callbacks.get('b')!({ type: 'message', source: 'b' });
        if (test) await test.receive({ type: 'message', source: 'b' });
        expect(test ? test.getState() : production!.state).toEqual(['b']);
        await send({ type: 'cancel-root' }); await send({ type: 'cancel-b' });
        expect(trace).toEqual(['start:a', 'start:b', 'start:root', 'cleanup:a', 'cleanup:root', 'cleanup:b']);
        if (test) await test.finish();
      } finally { production?.destroy(); test?.destroy(); }
    });
  }
}

for (const adapter of ['production', 'test'] as const) {
  for (const tag of ['Run', 'Cancellable', 'Debounced', 'Throttled', 'AfterDelay'] as const) {
    it(`isolates ${tag} starts, signals and late deliveries in ${adapter}`, async () => {
      vi.useFakeTimers();
      type Action = { type: 'start' | 'cancel' } | { type: 'value'; label: string };
      const lifecycle = initial(); const a = required(lifecycle, 'a'); const b = required(lifecycle, 'b');
      const callbacks = new Map<string, Dispatch<Action>>();
      const signals = new Map<string, AbortSignal | undefined>();
      const resolve = new Map<string, () => void>();
      const make = (label: string, owner: OwnerToken): EffectType<Action> => {
        const execute = (dispatch: Dispatch<Action>, signal?: AbortSignal) => {
          callbacks.set(label, dispatch); signals.set(label, signal);
          return new Promise<void>(done => resolve.set(label, done));
        };
        const effect = tag === 'Run' ? Effect.run(execute)
          : tag === 'Cancellable' ? Effect.cancellable('same', execute)
          : tag === 'Debounced' ? Effect.debounced('same', 10, execute)
          : tag === 'Throttled' ? Effect.throttled('same', 10, execute)
          : Effect.afterDelay(10, execute);
        return stampOrigin(Effect.inGroup(effect, 'same'), owner);
      };
      const reducer: Reducer<string[], Action> = (state, action) => action.type === 'value'
        ? [[...state, action.label], Effect.none()]
        : [state, qualifyEffect(action.type === 'start' ? Effect.batch(make('a', a), make('b', b)) : stampOrigin(Effect.cancelGroup('same'), a), lifecycle)];
      const production = adapter === 'production' ? createStore({ initialState: [] as string[], reducer, ssr: { deferEffects: false } }) : undefined;
      const test = adapter === 'test' ? new TestStore({ initialState: [] as string[], reducer }) : undefined;
      const send = async (action: Action) => { if (test) await test.send(action); else production!.dispatch(action); };
      try {
        await send({ type: 'start' });
        await vi.advanceTimersByTimeAsync(10);
        expect([...callbacks.keys()]).toEqual(['a', 'b']);
        expect(signals.get('a')?.aborted).toBe(false);
        expect(signals.get('b')?.aborted).toBe(false);
        await send({ type: 'cancel' });
        expect(signals.get('a')?.aborted).toBe(true);
        expect(signals.get('b')?.aborted).toBe(false);
        callbacks.get('a')!({ type: 'value', label: 'stale' });
        callbacks.get('b')!({ type: 'value', label: 'b' });
        if (test) await test.receive({ type: 'value', label: 'b' });
        expect(test ? test.getState() : production!.state).toEqual(['b']);
        resolve.get('a')!(); resolve.get('b')!();
        await Promise.resolve(); await Promise.resolve();
        if (test) await test.finish();
      } finally { production?.destroy(); test?.destroy(); vi.useRealTimers(); }
    });
  }
}

// Compile-time contracts: arbitrary data cannot assert managed execution authority.
if (false) {
  // @ts-expect-error The private brand is required; counters are not capabilities.
  const forged: OwnerToken = { id: 1 };
  // @ts-expect-error There is no consumer-facing ownership constructor on Effect.
  Effect.withOrigin(Effect.none(), forged);
  // @ts-expect-error 'subscription' is not a valid provenance source; runtime callbacks use 'effect'.
  const _envelope: TurnEnvelope<number> = { action: 1, source: 'subscription' };
}

describe('reviewed identity boundaries', () => {
 it('inherits batch origin for live and retired leaves without overwriting explicit descendants',()=>{
  const lifecycle=initial();const a=required(lifecycle,'a');const b=required(lifecycle,'b');
  const batch:EffectType<number>={_tag:'Batch',origin:a,effects:[Effect.cancellable('x',()=>{}),stampOrigin(Effect.cancellable('x',()=>{}),b)]};
  const live=leaves(qualifyEffect(batch,lifecycle));expect(live[0]?.origin).toBe(a);expect(live[1]?.origin).toBe(b);expect((live[0] as {id:string}).id).toBe(resourceKey(a,'id','x'));
  const removed=reconcile(lifecycle,{items:['a','b']},{items:['b']},slots).lifecycle;
  const retired=leaves(qualifyEffect(batch,removed));expect(retired[0]?._tag).toBe('None');expect(retired[1]?.origin).toBe(b);
 });
 it('preserves batch metadata and shape across all transformations',()=>{
  const a=required(initial(),'a');const batch:EffectType<number>={_tag:'Batch',origin:a,effects:[Effect.none(),Effect.inGroup(Effect.run(()=>{}),'local')]};
  for(const mapped of [Effect.map(batch,String),Effect.inGroup(batch,'extra'),Effect.prefixGroups(batch,'prefix')]) {
   expect(mapped.origin).toBe(a);expect(mapped._tag).toBe('Batch');if(mapped._tag==='Batch')expect(mapped.effects).toHaveLength(2);
  }
 });
 it('retains exact live token references after edits and reorders',()=>{
  const old=initial();const a=required(old,'a');const next=reconcile(old,{items:['a','b']},{items:['b','a'],detail:'changed'},slots).lifecycle;
  expect(required(next,'a')).toBe(a);expect(isOwnerLive(next,a)).toBe(true);
 });
 for(const adapter of ['production','test'] as const) it(`${adapter} rejects retired-owner work at the actual interpreter boundary`,async()=>{
  const original=initial();const a=required(original,'a');const b=required(original,'b');const started:string[]=[];
  type State={feature:Feature;lifecycle:Lifecycle};type Action={type:'remove'|'probe'};
  const reducer:Reducer<State,Action>=(state,action)=>{
   if(action.type==='remove'){const feature={items:['b']};const lifecycle=reconcile(state.lifecycle,state.feature,feature,slots).lifecycle;return [{feature,lifecycle},Effect.none()];}
   return [state,qualifyEffect(Effect.batch(stampOrigin(Effect.fireAndForget(()=>{started.push('retired');}),a),stampOrigin(Effect.fireAndForget(()=>{started.push('survivor');}),b),Effect.fireAndForget(()=>{started.push('root');})),state.lifecycle)];
  };
  const initialState:State={feature:{items:['a','b']},lifecycle:original};const config={initialState,reducer};
  if(adapter==='production'){const store=createStore({...config,ssr:{deferEffects:false}});try{store.dispatch({type:'remove'});store.dispatch({type:'probe'});}finally{store.destroy();}}
  else {const store=new TestStore(config);await store.send({type:'remove'});await store.send({type:'probe'});await store.finish();}
  expect(started).toEqual(['survivor','root']);
 });
});

it('rejects a missing before-state owner instead of silently re-identifying it', () => {
  expect(() => reconcile(createLifecycle(), { items: ['a'] }, { items: ['a'] }, slots))
    .toThrow(/before state/);
});

it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid allocation counter %s', nextId => {
  expect(() => reconcile({ nextId, owners: [] }, { items: [] }, { items: ['a'] }, slots)).toThrow(/exhausted/);
});

describe('immutable lifecycle lookup acceleration', () => {
  it('bounds encoding and membership scans for 1000 keyed owners across turns', () => {
    const items = Array.from({length: 1000}, (_, i) => i);
    let lifecycle = initial(items);
    const foreign = required(initial([0]), 0);
    for (let turn = 0; turn < 3; turn++) {
      const stringify = vi.spyOn(JSON, 'stringify');
      const some = vi.spyOn(Array.prototype, 'some');
      try {
        const next = reconcile(lifecycle, {items}, {items: [...items].reverse()}, slots).lifecycle;
        for (const key of items) {
          const token = required(next, key);
          expect(token).toBe(required(lifecycle, key));
          expect(isOwnerLive(next, token)).toBe(true);
        }
        expect(isOwnerLive(next, foreign)).toBe(false);
        // Linear encoding work, including reconciliation and both sets of lookups.
        expect(stringify.mock.calls.length).toBeLessThanOrEqual(7000);
        // Membership queries must not scan the live-owner array.
        expect(some.mock.contexts.filter(context => context === next.owners)).toHaveLength(0);
        lifecycle = next;
      } finally { stringify.mockRestore(); some.mockRestore(); }
    }
  });

  it('checks 1000 token capabilities without live-table scans', () => {
    const lifecycle = initial(Array.from({length:1000},(_,i)=>i));
    const some = vi.spyOn(Array.prototype, 'some');
    try {
      for (const owner of lifecycle.owners) expect(isOwnerLive(lifecycle, owner.token)).toBe(true);
      expect(isOwnerLive(lifecycle, {id: 1} as OwnerToken)).toBe(false);
      expect(some.mock.contexts.filter(context => context === lifecycle.owners)).toHaveLength(0);
    } finally { some.mockRestore(); }
  });

  it('does not transfer a cached index through spread or cache manually mutable owners', () => {
    const original = initial(['a']);
    const a = required(original, 'a');
    const mutablePath: Array<{slot: string} | {key: string}> = [{slot:'items'}, {key:'a'}];
    const owners = [{path: mutablePath, token: a}];
    const structural: Lifecycle = {...original, owners};
    expect(ownerAt(structural, path('a'))).toBe(a);
    mutablePath[1] = {key:'b'};
    expect(ownerAt(structural, path('a'))).toBeUndefined();
    expect(ownerAt(structural, path('b'))).toBe(a);
    const reconciled = reconcile(structural, {items:['b']}, {items:['b']}, slots).lifecycle;
    expect(ownerAt(reconciled, path('b'))).toBe(a);
    mutablePath[1] = {key:'c'};
    expect(ownerAt(reconciled, path('b'))).toBeUndefined();
    expect(ownerAt(reconciled, path('c'))).toBe(a);
    owners.splice(0);
    expect(isOwnerLive(structural, a)).toBe(false);
    expect(required(original, 'a')).toBe(a);
    expect(isOwnerLive(original, {...a} as OwnerToken)).toBe(false);
  });

  it('keeps negative zero, zero, numeric strings and replacements distinct in indexed snapshots', () => {
    const keys = [-0, 0, '0', '-0'];
    const before = initial(keys);
    const tokens = keys.map(key => required(before, key));
    expect(new Set(tokens).size).toBe(4);
    const replaced = reconcile(before, {items:keys}, {items:[...keys].reverse()}, slots,
      [{type:'replace',path:path(-0)}]).lifecycle;
    expect(required(replaced, -0)).not.toBe(tokens[0]);
    expect(isOwnerLive(replaced,tokens[0])).toBe(false);
    for (let i=1;i<keys.length;i++) expect(required(replaced,keys[i]!)).toBe(tokens[i]);
    const removed = reconcile(replaced,{items:keys},{items:[]},slots).lifecycle;
    for (const token of replaced.owners.map(owner=>owner.token)) expect(isOwnerLive(removed,token)).toBe(false);
    const again = reconcile(removed,{items:[]},{items:keys},slots).lifecycle;
    for (const key of keys) expect(required(again,key)).not.toBe(required(replaced,key));
  });
});
