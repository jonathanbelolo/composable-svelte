/**
 * `scopeToDestination` and `scopeToOptional` must accept anything that can be
 * read and dispatched to — not just a full `Store`.
 *
 * Both declared `parentStore: Store<P, A>` while using only `.state` and
 * `.dispatch`. That shut out the one caller that matters: a component holding a
 * `ScopedDestinationStore` — `{state, dispatch, dismiss}`, which is what every
 * scoping API in this library returns — and scoping again. Nested destinations
 * were only reachable by a component lying about its own prop type, which is
 * exactly what examples/product-gallery's ProductDetail did.
 *
 * These tests pin the widened contract by passing a plain object. Reverting the
 * signature makes this file stop compiling — six TS2345s, each naming
 * `Store<any, any>`, which incidentally confirms that the two omitted trailing
 * type parameters take their `= any` defaults rather than being inferred.
 *
 * Be careful about what guards it, though: `packages/core/tsconfig.json` excludes
 * every `.test.ts`, and `tsconfig.test.json` inherits that exclude, so `pnpm
 * typecheck` compiles NO test file in this package — and vitest transpiles
 * without typechecking. The runtime assertions below are gated; the *type* claim
 * is not, until examples/product-gallery is enrolled in `pnpm -r check`, at which
 * point reverting the widening breaks it there. Verified by hand meanwhile.
 */

import { describe, it, expect } from 'vitest';
import {
  scopeToDestination,
  scopeToOptional,
  type ScopableStore
} from '../../src/lib/navigation/scope-to-destination.js';

interface ChildState {
  value: string;
}
type ChildAction = { type: 'changed'; value: string };

interface ParentState {
  destination: { type: 'child'; state: ChildState } | null;
  optionalChild: ChildState | null;
}
type ParentAction = { type: 'destination'; action: unknown } | { type: 'child'; action: unknown };

/** The minimum shape — no select, subscribe, history or destroy. */
function makeMinimalStore(state: ParentState) {
  const dispatched: ParentAction[] = [];
  const store: ScopableStore<ParentState, ParentAction> = {
    get state() {
      return state;
    },
    dispatch(action: ParentAction) {
      dispatched.push(action);
    }
  };
  return { store, dispatched };
}

describe('scoping from a minimal store', () => {
  it('reads destination state through a plain object', () => {
    const { store } = makeMinimalStore({
      destination: { type: 'child', state: { value: 'hello' } },
      optionalChild: null
    });

    const scoped = scopeToDestination<ChildState, ChildAction>(
      store,
      ['destination'],
      'child',
      'destination'
    );

    expect(scoped.state).toEqual({ value: 'hello' });
  });

  it('wraps dispatched actions the same way it would from a full Store', () => {
    const { store, dispatched } = makeMinimalStore({
      destination: { type: 'child', state: { value: 'hello' } },
      optionalChild: null
    });

    const scoped = scopeToDestination<ChildState, ChildAction>(
      store,
      ['destination'],
      'child',
      'destination'
    );

    scoped.dispatch({ type: 'changed', value: 'world' });

    // Three wrappers: the case type, then PresentationAction.presented, then the
    // parent's action field. scopeToOptional omits the case wrapper.
    expect(dispatched).toEqual([
      {
        type: 'destination',
        action: {
          type: 'presented',
          action: { type: 'child', action: { type: 'changed', value: 'world' } }
        }
      }
    ]);
  });

  it('returns null state when the case does not match', () => {
    const { store } = makeMinimalStore({ destination: null, optionalChild: null });

    const scoped = scopeToDestination<ChildState, ChildAction>(
      store,
      ['destination'],
      'child',
      'destination'
    );

    expect(scoped.state).toBeNull();
  });

  it('scopeToOptional accepts the same minimal shape', () => {
    const { store, dispatched } = makeMinimalStore({
      destination: null,
      optionalChild: { value: 'present' }
    });

    const scoped = scopeToOptional<ChildState, ChildAction>(store, ['optionalChild'], 'child');

    expect(scoped.state).toEqual({ value: 'present' });

    scoped.dispatch({ type: 'changed', value: 'next' });
    expect(dispatched).toEqual([
      {
        type: 'child',
        action: { type: 'presented', action: { type: 'changed', value: 'next' } }
      }
    ]);
  });

  it('a scoped store can itself be scoped — nested destinations', () => {
    // The case the old signature made impossible: the thing being scoped is a
    // ScopedDestinationStore, whose `state` is `T | null`.
    const { store, dispatched } = makeMinimalStore({
      destination: {
        type: 'child',
        state: { value: 'outer' } as ChildState & { destination?: unknown }
      },
      optionalChild: null
    });

    const outer = scopeToDestination<
      { destination: { type: 'inner'; state: ChildState } | null },
      ChildAction
    >(store, ['destination'], 'child', 'destination');

    // `outer.state` is `T | null`, so a caller must narrow before scoping again.
    // That narrowing is the whole point — it is what `Store` could never express.
    const parent: ScopableStore<
      { destination: { type: 'inner'; state: ChildState } | null },
      ChildAction
    > = { state: outer.state ?? { destination: null }, dispatch: outer.dispatch };

    const inner = scopeToDestination<ChildState, ChildAction>(
      parent,
      ['destination'],
      'inner',
      'destination'
    );

    expect(inner.state).toBeNull();
    inner.dispatch({ type: 'changed', value: 'deep' });
    expect(dispatched).toHaveLength(1);
  });
});
