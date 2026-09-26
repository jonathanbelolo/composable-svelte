import { describe, expect, it } from 'vitest';
import { Effect } from '../src/lib/effect.js';
import type { Effect as EffectType, Reducer } from '../src/lib/types.js';
import { createStore } from '../src/lib/store.svelte.js';
import { TestStore } from '../src/lib/test/test-store.js';
import {
  createLifecycle,
  ownerAt,
  qualifyEffect,
  reconcile,
  stampOrigin
} from '../src/lib/execution/identity.js';
import type { Lifecycle, OwnerPath, OwnerToken, SlotDescriptor } from '../src/lib/execution/identity.js';
import { scope, scopeAction } from '../src/lib/composition/scope.js';
import { forEach, forEachElement } from '../src/lib/composition/for-each.js';
import { ifLet, ifLetPresentation } from '../src/lib/navigation/if-let.js';
import { createDestination } from '../src/lib/navigation/destination.js';
import { createDestinationReducer } from '../src/lib/navigation/destination-reducer.js';
import { handleStackAction } from '../src/lib/navigation/stack.js';
import { PresentationAction, StackAction } from '../src/lib/navigation/types.js';

const path = (key: string | number): OwnerPath => [{ slot: 'items' }, { key }];
interface Feature { items: readonly (string | number)[]; }
const slots: SlotDescriptor<Feature> = { select: state => state.items.map(path) };
function initial(items: readonly (string | number)[] = ['a', 'b']) {
  return reconcile(createLifecycle(), { items: [] }, { items }, slots).lifecycle;
}
function required(lifecycle: Lifecycle, key: string | number): OwnerToken {
  const owner = ownerAt(lifecycle, path(key));
  if (!owner) throw new Error('Missing fixture owner');
  return owner;
}

function leaves<A>(effect: EffectType<A>): EffectType<A>[] {
  return effect._tag === 'Batch' ? effect.effects.flatMap(leaves) : [effect];
}

function descriptions(): { tag: string; effect: EffectType<number> }[] {
  return [
    { tag: 'None', effect: Effect.none() },
    { tag: 'Run', effect: Effect.run(dispatch => dispatch(1)) },
    { tag: 'FireAndForget', effect: Effect.fireAndForget(() => {}) },
    { tag: 'Cancellable (executor)', effect: Effect.cancellable('local', dispatch => dispatch(1)) },
    { tag: 'Cancellable (cancelOnly)', effect: Effect.cancel('local') },
    { tag: 'Debounced', effect: Effect.debounced('local', 1, dispatch => dispatch(1)) },
    { tag: 'Throttled', effect: Effect.throttled('local', 1, dispatch => dispatch(1)) },
    { tag: 'AfterDelay', effect: Effect.afterDelay(1, dispatch => dispatch(1)) },
    { tag: 'Subscription', effect: Effect.subscription('local', dispatch => { dispatch(1); return () => {}; }) },
    { tag: 'CancelGroup', effect: Effect.cancelGroup('local') },
    { tag: 'Batch', effect: { _tag: 'Batch', effects: [Effect.run(dispatch => dispatch(1)), Effect.none()] } }
  ];
}

describe('transforming lifts preserve owner identity and reject stale origins', () => {
  const start = initial(['a', 'b']);
  const a = required(start, 'a');
  const removed = reconcile(start, { items: ['a', 'b'] }, { items: ['b'] }, slots).lifecycle;

  it('preserves child owner token through scope and rejects stale origin', () => {
    type ChildState = { count: number };
    type ChildAction = { type: 'inc' } | { type: 'done' };
    type ParentState = { child: ChildState };
    type ParentAction = { type: 'child'; action: ChildAction };

    const childReducer: Reducer<ChildState, ChildAction> = (state, action) => {
      if (action.type === 'inc') {
        return [{ count: state.count + 1 }, stampOrigin(Effect.run(dispatch => dispatch({ type: 'done' })), a)];
      }
      return [state, Effect.none()];
    };

    const scoped = scope<ParentState, ParentAction, ChildState, ChildAction>(
      s => s.child,
      (s, c) => ({ ...s, child: c }),
      act => (act.type === 'child' ? act.action : null),
      ca => ({ type: 'child', action: ca }),
      childReducer
    );

    const [, parentEff] = scoped({ child: { count: 0 } }, { type: 'child', action: { type: 'inc' } }, undefined);
    expect(parentEff.origin).toBe(a);
    expect(qualifyEffect(parentEff, start).origin).toBe(a);
    expect(qualifyEffect(parentEff, removed)._tag).toBe('None');
  });

  it('preserves child owner token through scopeAction and rejects stale origin', () => {
    type ChildState = { count: number };
    type ChildAction = { type: 'inc' } | { type: 'done' };
    type ParentState = { counter: ChildState };
    type ParentAction = { type: 'counter'; action: ChildAction };

    const childReducer: Reducer<ChildState, ChildAction> = (state, action) => {
      if (action.type === 'inc') {
        return [{ count: state.count + 1 }, stampOrigin(Effect.run(dispatch => dispatch({ type: 'done' })), a)];
      }
      return [state, Effect.none()];
    };

    const scoped = scopeAction<ParentState, ParentAction, ChildState, ChildAction>(
      s => s.counter,
      (s, counter) => ({ ...s, counter }),
      'counter',
      childReducer
    );

    const [, parentEff] = scoped({ counter: { count: 0 } }, { type: 'counter', action: { type: 'inc' } }, undefined);
    expect(parentEff.origin).toBe(a);
    expect(qualifyEffect(parentEff, start).origin).toBe(a);
    expect(qualifyEffect(parentEff, removed)._tag).toBe('None');
  });

  it('preserves child owner token through forEach and forEachElement', () => {
    type ItemState = { text: string };
    type ItemAction = { type: 'edit'; text: string } | { type: 'saved' };
    type ListState = { items: { id: string; state: ItemState }[] };
    type ListAction = { type: 'item'; id: string; action: ItemAction };

    const itemReducer: Reducer<ItemState, ItemAction> = (state, action) => {
      if (action.type === 'edit') {
        return [{ text: action.text }, stampOrigin(Effect.run(d => d({ type: 'saved' })), a)];
      }
      return [state, Effect.none()];
    };

    const forEachElem = forEachElement<ListState, ListAction, ItemState, ItemAction, string, unknown>(
      'item',
      s => s.items,
      (s, items) => ({ ...s, items }),
      itemReducer
    );

    const [, elemEff] = forEachElem(
      { items: [{ id: '1', state: { text: 'before' } }] },
      { type: 'item', id: '1', action: { type: 'edit', text: 'after' } },
      undefined
    );
    expect(elemEff.origin).toBe(a);
    expect(qualifyEffect(elemEff, start).origin).toBe(a);
    expect(qualifyEffect(elemEff, removed)._tag).toBe('None');

    const customForEach = forEach<ListState, ListAction, ItemState, ItemAction, string, unknown>({
      getArray: s => s.items,
      setArray: (s, items) => ({ ...s, items }),
      extractChild: act => (act.type === 'item' ? { id: act.id, action: act.action } : null),
      wrapChild: (id, action) => ({ type: 'item', id, action }),
      childReducer: itemReducer
    });

    const [, customEff] = customForEach(
      { items: [{ id: '1', state: { text: 'before' } }] },
      { type: 'item', id: '1', action: { type: 'edit', text: 'after' } },
      undefined
    );
    expect(customEff.origin).toBe(a);
    expect(qualifyEffect(customEff, start).origin).toBe(a);
    expect(qualifyEffect(customEff, removed)._tag).toBe('None');
  });

  it('preserves child owner token through ifLet and ifLetPresentation', () => {
    type ChildState = { value: string };
    type ChildAction = { type: 'save' } | { type: 'saved' };
    type NavState = { modal: ChildState | null };
    type DirectNavAction = { type: 'modal'; action: ChildAction };
    type PresNavAction = { type: 'modal'; action: PresentationAction<ChildAction> };

    const modalReducer: Reducer<ChildState, ChildAction> = (state, action) => {
      if (action.type === 'save') {
        return [state, stampOrigin(Effect.run(d => d({ type: 'saved' })), a)];
      }
      return [state, Effect.none()];
    };

    const directIfLet = ifLet<NavState, DirectNavAction, ChildState, ChildAction>(
      s => s.modal,
      (s, modal) => ({ ...s, modal }),
      act => (act.type === 'modal' ? act.action : null),
      ca => ({ type: 'modal', action: ca }),
      modalReducer
    );

    const [, directEff] = directIfLet(
      { modal: { value: 'val' } },
      { type: 'modal', action: { type: 'save' } },
      undefined
    );
    expect(directEff.origin).toBe(a);
    expect(qualifyEffect(directEff, start).origin).toBe(a);
    expect(qualifyEffect(directEff, removed)._tag).toBe('None');

    const presIfLet = ifLetPresentation<NavState, PresNavAction, ChildState, ChildAction, 'modal'>(
      s => s.modal,
      (s, modal) => ({ ...s, modal }),
      'modal',
      ca => ({ type: 'modal', action: PresentationAction.presented(ca) }),
      modalReducer
    );

    const [, presEff] = presIfLet(
      { modal: { value: 'val' } },
      { type: 'modal', action: PresentationAction.presented({ type: 'save' }) },
      undefined
    );
    expect(presEff.origin).toBe(a);
    expect(qualifyEffect(presEff, start).origin).toBe(a);
    expect(qualifyEffect(presEff, removed)._tag).toBe('None');
  });

  it('preserves child owner token through createDestination reducer', () => {
    type AddItemState = { name: string };
    type AddItemAction = { type: 'save' };

    const destination = createDestination({
      addItem: (state: AddItemState, action: AddItemAction) => {
        if (action.type === 'save') {
          return [state, stampOrigin(Effect.run(() => {}), a)];
        }
        return [state, Effect.none()];
      }
    });

    const [, destEff] = destination.reducer(
      { type: 'addItem', state: { name: 'widget' } },
      { type: 'addItem', action: { type: 'save' } },
      undefined
    );

    expect(destEff.origin).toBe(a);
    expect(qualifyEffect(destEff, start).origin).toBe(a);
    expect(qualifyEffect(destEff, removed)._tag).toBe('None');
  });

  it('preserves screen owner token through handleStackAction presented screen arm', () => {
    type Screen = { step: number };
    type ScreenAct = { type: 'next' };
    type StackState = { stack: readonly Screen[] };
    type StackAct = { type: 'stack'; action: StackAction<ScreenAct> };

    const screenReducer: Reducer<Screen, ScreenAct> = (state, action) => {
      if (action.type === 'next') {
        return [{ step: state.step + 1 }, stampOrigin(Effect.run(() => {}), a)];
      }
      return [state, Effect.none()];
    };

    const [, stackEff] = handleStackAction<StackState, StackAct, Screen, ScreenAct, unknown>(
      { stack: [{ step: 1 }] },
      StackAction.screen(0, PresentationAction.presented({ type: 'next' })),
      undefined,
      screenReducer,
      s => s.stack,
      (s, stack) => ({ ...s, stack })
    );

    expect(stackEff.origin).toBe(a);
    expect(qualifyEffect(stackEff, start).origin).toBe(a);
    expect(qualifyEffect(stackEff, removed)._tag).toBe('None');

    const [, popEff] = handleStackAction<StackState, StackAct, Screen, ScreenAct, unknown>(
      { stack: [{ step: 1 }, { step: 2 }] },
      StackAction.pop(),
      undefined,
      screenReducer,
      s => s.stack,
      (s, stack) => ({ ...s, stack })
    );
    expect(popEff.origin).toBeUndefined();
  });
});

describe('non-transforming pass-through lifts preserve owner identity (audit-confirmed)', () => {
  // NOTE: createDestinationReducer does not map effects through liftEffect; it returns the
  // child reducer tuple directly. Origin is preserved by reference rather than through transformation.
  const start = initial(['a', 'b']);
  const a = required(start, 'a');
  const removed = reconcile(start, { items: ['a', 'b'] }, { items: ['b'] }, slots).lifecycle;

  it('preserves child owner token through createDestinationReducer legacy helper pass-through', () => {
    type Dest = { type: 'edit'; state: { text: string } };
    type Act = { type: 'save' };

    const legacyDest = createDestinationReducer<Dest, Act, unknown>({
      edit: state => [state, stampOrigin(Effect.run(() => {}), a)]
    });

    const [, legacyEff] = legacyDest({ type: 'edit', state: { text: 'widget' } }, { type: 'save' }, undefined);
    expect(legacyEff.origin).toBe(a);
    expect(qualifyEffect(legacyEff, start).origin).toBe(a);
    expect(qualifyEffect(legacyEff, removed)._tag).toBe('None');
  });
});

describe('tag-exhaustive origin preservation across lifts', () => {
  const start = initial(['a', 'b']);
  const a = required(start, 'a');
  const removed = reconcile(start, { items: ['a', 'b'] }, { items: ['b'] }, slots).lifecycle;

  for (const [idx, { tag, effect: desc }] of descriptions().entries()) {
    it(`preserves origin across scopeAction for tag ${tag} (#${idx})`, () => {
      type S = { v: number };
      type A = number;
      type ParentS = { sub: S };
      type ParentA = { type: 'sub'; action: A };

      const subReducer: Reducer<S, A> = state => [state, stampOrigin(desc, a)];
      const scoped = scopeAction<ParentS, ParentA, S, A>(
        s => s.sub,
        (s, sub) => ({ ...s, sub }),
        'sub',
        subReducer
      );

      const [, eff] = scoped({ sub: { v: 0 } }, { type: 'sub', action: 1 }, undefined);
      for (const leaf of leaves(eff)) {
        expect(leaf.origin).toBe(a);
      }

      const live = qualifyEffect(eff, start);
      for (const leaf of leaves(live)) {
        expect(leaf.origin).toBe(a);
      }

      const retired = qualifyEffect(eff, removed);
      for (const leaf of leaves(retired)) {
        expect(leaf._tag).toBe('None');
      }
    });
  }
});

// Legacy interpreter characterization only: explicit qualification, storing Lifecycle
// in feature state, and calling reconcile inside the reducer below are test fixtures
// designed solely to simulate the managed interpreter boundary. Reducers are pure
// synchronous functions; storing Lifecycle in application state, reconciling within
// reducers, and calling qualifyEffect in reducers are NOT application patterns.
describe('legacy adapter execution of explicitly qualified lifted effects', () => {
  const start = initial(['a', 'b']);
  const a = required(start, 'a');

  for (const adapter of ['production', 'test'] as const) {
    it(`${adapter} executes lifted child effects when owner is live and drops them when retired`, async () => {
      const executed: string[] = [];
      type ChildState = { text: string };
      type ChildAction = { type: 'act'; tag: string };
      type ParentState = { feature: Feature; lifecycle: Lifecycle; child: ChildState };
      type ParentAction = { type: 'remove' } | { type: 'child'; action: ChildAction };

      const childReducer: Reducer<ChildState, ChildAction> = (state, action) => {
        return [
          state,
          stampOrigin(
            Effect.run(() => {
              executed.push(action.tag);
            }),
            a
          )
        ];
      };

      const scoped = scope<ParentState, ParentAction, ChildState, ChildAction>(
        s => s.child,
        (s, c) => ({ ...s, child: c }),
        act => (act.type === 'child' ? act.action : null),
        ca => ({ type: 'child', action: ca }),
        childReducer
      );

      const reducer: Reducer<ParentState, ParentAction> = (state, action) => {
        if (action.type === 'remove') {
          const feature = { items: ['b'] };
          const lifecycle = reconcile(state.lifecycle, state.feature, feature, slots).lifecycle;
          return [{ ...state, feature, lifecycle }, Effect.none()];
        }
        const [nextState, effect] = scoped(state, action, undefined);
        return [nextState, qualifyEffect(effect, state.lifecycle)];
      };

      const initialState: ParentState = {
        feature: { items: ['a', 'b'] },
        lifecycle: start,
        child: { text: 'init' }
      };

      if (adapter === 'production') {
        const store = createStore({ initialState, reducer, ssr: { deferEffects: false } });
        try {
          store.dispatch({ type: 'child', action: { type: 'act', tag: 'live' } });
          store.dispatch({ type: 'remove' });
          store.dispatch({ type: 'child', action: { type: 'act', tag: 'stale' } });
        } finally {
          store.destroy();
        }
      } else {
        const store = new TestStore({ initialState, reducer });
        try {
          await store.send({ type: 'child', action: { type: 'act', tag: 'live' } });
          await store.send({ type: 'remove' });
          await store.send({ type: 'child', action: { type: 'act', tag: 'stale' } });
          await store.finish();
        } finally {
          store.destroy();
        }
      }

      expect(executed).toEqual(['live']);
    });
  }
});
