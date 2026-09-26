import { afterEach, describe, expect, it } from 'vitest';
import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import {
  ManagedIntegrationBuilder,
  destinationSlot,
  optionalSlot
} from '../../src/lib/navigation/managed-integration.js';
import { createDestination } from '../../src/lib/navigation/destination.js';
import {
  managedDismissDependency,
  type DismissDependency
} from '../../src/lib/navigation/dismiss-dependency.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';

interface Deps {
  readonly dismiss: DismissDependency;
}

const cleanups: Array<() => void> = [];
const flush = async (): Promise<void> => {
  for (let i = 0; i < 24; i++) await Promise.resolve();
};

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  await flush();
});

describe('managed optional slot deferred dismissal policy', () => {
  type Child = { count: number };
  type ChildAction =
    | { type: 'increment' }
    | { type: 'close' }
    | { type: 'dismissalCompleted' };

  type State = {
    child: Child | null;
    dismissRequests: number;
  };

  type Action =
    | { type: 'child'; action: PresentationAction<ChildAction> }
    | { type: 'open'; count?: number }
    | { type: 'replace'; count?: number };

  const childSlot = optionalSlot<State, Action>()('child');

  const childReducer: Reducer<Child, ChildAction, Deps> = (state, action, deps) => {
    if (action.type === 'increment') return [{ count: state.count + 1 }, Effect.none()];
    if (action.type === 'close') return [state, deps.dismiss()];
    if (action.type === 'dismissalCompleted') return [state, Effect.none()];
    return [state, Effect.none()];
  };

  const parentReducer: Reducer<State, Action, Deps> = (state, action) => {
    if (action.type === 'open') return [{ child: { count: action.count ?? 0 }, dismissRequests: 0 }, Effect.none()];
    if (action.type === 'replace') return [{ child: { count: action.count ?? 100 }, dismissRequests: 0 }, Effect.none()];
    if (action.type === 'child') {
      if (action.action.type === 'dismiss') return [{ ...state, dismissRequests: state.dismissRequests + 1 }, Effect.none()];
      if (action.action.type === 'presented' && action.action.action.type === 'dismissalCompleted') {
        return [{ child: null, dismissRequests: 0 }, Effect.none()];
      }
    }
    return [state, Effect.none()];
  };

  it('clears child immediately by default when dismissal policy is omitted', async () => {
    const definition = new ManagedIntegrationBuilder<State, Action, Deps>(parentReducer)
      .with(childSlot, childReducer)
      .build();
    const store = createStore({
      initialState: { child: { count: 0 }, dismissRequests: 0 },
      ...definition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    const view = definition.bind(store, childSlot);
    expect(view).toBeDefined();
    view?.dismiss();
    await flush();

    expect(store.state.child).toBeNull();
    expect(definition.bind(store, childSlot)).toBeUndefined();
  });

  it('clears child immediately when dismissal policy is explicitly immediate', async () => {
    const definition = new ManagedIntegrationBuilder<State, Action, Deps>(parentReducer)
      .with(childSlot, childReducer, { dismissal: 'immediate' })
      .build();
    const store = createStore({
      initialState: { child: { count: 0 }, dismissRequests: 0 },
      ...definition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    const view = definition.bind(store, childSlot);
    expect(view).toBeDefined();
    view?.dismiss();
    await flush();

    expect(store.state.child).toBeNull();
    expect(definition.bind(store, childSlot)).toBeUndefined();
  });

  it('retains exact state, visible mutation, and same view identity across repeated deferred dismiss requests', async () => {
    const definition = new ManagedIntegrationBuilder<State, Action, Deps>(parentReducer)
      .with(childSlot, childReducer, { dismissal: 'deferred' })
      .build();
    const store = createStore({
      initialState: { child: { count: 0 }, dismissRequests: 0 },
      ...definition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    const view1 = definition.bind(store, childSlot);
    expect(view1).toBeDefined();
    if (!view1) throw new Error('expected view1');

    view1.dispatch({ type: 'increment' });
    await flush();
    expect(store.state.child).toEqual({ count: 1 });
    expect(view1.state).toEqual({ count: 1 });

    const liveChild = store.state.child;
    view1.dispatch({ type: 'close' });
    await flush();
    expect(store.state.child).toBe(liveChild);
    expect(store.state.child).toEqual({ count: 1 });
    expect(store.state.dismissRequests).toBe(1);
    expect(view1.state).toEqual({ count: 1 });
    expect(definition.bind(store, childSlot)).toBe(view1);

    view1.dismiss();
    await flush();
    expect(store.state.child).toEqual({ count: 1 });
    expect(store.state.dismissRequests).toBe(2);
    expect(view1.state).toEqual({ count: 1 });
    expect(definition.bind(store, childSlot)).toBe(view1);
  });

  it('clears child only upon distinct captured-view completion action', async () => {
    const definition = new ManagedIntegrationBuilder<State, Action, Deps>(parentReducer)
      .with(childSlot, childReducer, { dismissal: 'deferred' })
      .build();
    const store = createStore({
      initialState: { child: { count: 5 }, dismissRequests: 0 },
      ...definition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    const view = definition.bind(store, childSlot);
    expect(view).toBeDefined();
    if (!view) throw new Error('expected view');

    view.dismiss();
    await flush();
    expect(store.state.child).toEqual({ count: 5 });
    expect(store.state.dismissRequests).toBe(1);

    view.dispatch({ type: 'dismissalCompleted' });
    await flush();
    expect(store.state.child).toBeNull();
    expect(store.state.dismissRequests).toBe(0);
    expect(view.state).toBeUndefined();
    expect(definition.bind(store, childSlot)).toBeUndefined();
  });

  it('allocates a new view on replacement, and old captured completion cannot clear successor', async () => {
    const definition = new ManagedIntegrationBuilder<State, Action, Deps>(parentReducer)
      .with(childSlot, childReducer, {
        dismissal: 'deferred',
        replaceOn: (action) => action.type === 'replace'
      })
      .build();
    const store = createStore({
      initialState: { child: { count: 1 }, dismissRequests: 0 },
      ...definition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    const view1 = definition.bind(store, childSlot);
    expect(view1).toBeDefined();
    if (!view1) throw new Error('expected view1');

    view1.dismiss();
    await flush();
    expect(store.state.child).toEqual({ count: 1 });
    expect(store.state.dismissRequests).toBe(1);

    store.dispatch({ type: 'replace', count: 42 });
    await flush();
    expect(store.state.child).toEqual({ count: 42 });

    const view2 = definition.bind(store, childSlot);
    expect(view2).toBeDefined();
    if (!view2) throw new Error('expected view2');
    expect(view2).not.toBe(view1);
    expect(view2.state).toEqual({ count: 42 });
    expect(view1.state).toBeUndefined();

    view1.dispatch({ type: 'dismissalCompleted' });
    await flush();
    expect(store.state.child).toEqual({ count: 42 });
    expect(view2.state).toEqual({ count: 42 });

    view2.dispatch({ type: 'dismissalCompleted' });
    await flush();
    expect(store.state.child).toBeNull();
    expect(view2.state).toBeUndefined();
  });

  it('rejects invalid runtime dismissal value before registration', () => {
    const builder = new ManagedIntegrationBuilder<State, Action, Deps>(parentReducer);
    expect(() => {
      Reflect.apply(builder.with, builder, [childSlot, childReducer, { dismissal: 'unsupported' }]);
    }).toThrow(TypeError);

    builder.with(childSlot, childReducer, { dismissal: 'deferred' });
    const composition = builder.build();
    const store = createStore({
      initialState: { child: { count: 0 }, dismissRequests: 0 },
      ...composition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());
    expect(composition.bind(store, childSlot)).toBeDefined();
  });
});

describe('managed destination slot deferred dismissal policy', () => {
  type Child = { count: number };
  type ChildAction =
    | { type: 'increment' }
    | { type: 'close' }
    | { type: 'dismissalCompleted' };

  const destinationChildReducer: Reducer<Child, ChildAction, Deps> = (state, action, deps) => {
    if (action.type === 'increment') return [{ count: state.count + 1 }, Effect.none()];
    if (action.type === 'close') return [state, deps.dismiss()];
    if (action.type === 'dismissalCompleted') return [state, Effect.none()];
    return [state, Effect.none()];
  };

  const Destination = createDestination({
    alpha: destinationChildReducer,
    beta: destinationChildReducer
  });

  type Occupant = typeof Destination._types.State;
  type DestAction = typeof Destination._types.Action;

  type State = {
    destination: Occupant | null;
    dismissRequests: number;
  };

  type Action =
    | { type: 'destination'; action: PresentationAction<DestAction> }
    | { type: 'openAlpha'; count?: number }
    | { type: 'replaceAlpha'; count?: number };

  const destSlot = destinationSlot<State, Action>()('destination', Destination);

  const destParentReducer: Reducer<State, Action, Deps> = (state, action) => {
    if (action.type === 'openAlpha') return [{ destination: Destination.initial('alpha', { count: action.count ?? 0 }), dismissRequests: 0 }, Effect.none()];
    if (action.type === 'replaceAlpha') return [{ destination: Destination.initial('alpha', { count: action.count ?? 100 }), dismissRequests: 0 }, Effect.none()];
    if (action.type === 'destination') {
      if (action.action.type === 'dismiss') return [{ ...state, dismissRequests: state.dismissRequests + 1 }, Effect.none()];
      if (action.action.type === 'presented') {
        const caseAction = action.action.action;
        if (caseAction.type === 'alpha' && caseAction.action.type === 'dismissalCompleted') {
          return [{ destination: null, dismissRequests: 0 }, Effect.none()];
        }
      }
    }
    return [state, Effect.none()];
  };

  it('clears destination immediately by default when dismissal policy is omitted', async () => {
    const definition = new ManagedIntegrationBuilder<State, Action, Deps>(destParentReducer)
      .with(destSlot)
      .build();
    const store = createStore({
      initialState: { destination: Destination.initial('alpha', { count: 0 }), dismissRequests: 0 },
      ...definition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    const view = definition.bind(store, destSlot.case('alpha'));
    expect(view).toBeDefined();
    view?.dismiss();
    await flush();

    expect(store.state.destination).toBeNull();
    expect(definition.bind(store, destSlot.case('alpha'))).toBeUndefined();
  });

  it('clears destination immediately when dismissal policy is explicitly immediate', async () => {
    const definition = new ManagedIntegrationBuilder<State, Action, Deps>(destParentReducer)
      .with(destSlot, { dismissal: 'immediate' })
      .build();
    const store = createStore({
      initialState: { destination: Destination.initial('alpha', { count: 0 }), dismissRequests: 0 },
      ...definition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    const view = definition.bind(store, destSlot.case('alpha'));
    expect(view).toBeDefined();
    view?.dismiss();
    await flush();

    expect(store.state.destination).toBeNull();
    expect(definition.bind(store, destSlot.case('alpha'))).toBeUndefined();
  });

  it('retains exact state, visible mutation, and same view identity across repeated deferred dismiss requests on destination', async () => {
    const definition = new ManagedIntegrationBuilder<State, Action, Deps>(destParentReducer)
      .with(destSlot, { dismissal: 'deferred' })
      .build();
    const store = createStore({
      initialState: { destination: Destination.initial('alpha', { count: 0 }), dismissRequests: 0 },
      ...definition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    const view1 = definition.bind(store, destSlot.case('alpha'));
    expect(view1).toBeDefined();
    if (!view1) throw new Error('expected view1');

    view1.dispatch({ type: 'increment' });
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('alpha', { count: 1 }));
    expect(view1.state).toEqual({ count: 1 });

    view1.dispatch({ type: 'close' });
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('alpha', { count: 1 }));
    const liveOccupant = store.state.destination;
    expect(store.state.dismissRequests).toBe(1);
    expect(view1.state).toEqual({ count: 1 });
    expect(definition.bind(store, destSlot.case('alpha'))).toBe(view1);

    view1.dismiss();
    await flush();
    expect(store.state.destination).toBe(liveOccupant);
    expect(store.state.destination).toEqual(Destination.initial('alpha', { count: 1 }));
    expect(store.state.dismissRequests).toBe(2);
    expect(view1.state).toEqual({ count: 1 });
    expect(definition.bind(store, destSlot.case('alpha'))).toBe(view1);
  });

  it('clears destination only upon distinct captured-view completion action', async () => {
    const definition = new ManagedIntegrationBuilder<State, Action, Deps>(destParentReducer)
      .with(destSlot, { dismissal: 'deferred' })
      .build();
    const store = createStore({
      initialState: { destination: Destination.initial('alpha', { count: 5 }), dismissRequests: 0 },
      ...definition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    const view = definition.bind(store, destSlot.case('alpha'));
    expect(view).toBeDefined();
    if (!view) throw new Error('expected view');

    view.dismiss();
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('alpha', { count: 5 }));
    expect(store.state.dismissRequests).toBe(1);

    view.dispatch({ type: 'dismissalCompleted' });
    await flush();
    expect(store.state.destination).toBeNull();
    expect(store.state.dismissRequests).toBe(0);
    expect(view.state).toBeUndefined();
    expect(definition.bind(store, destSlot.case('alpha'))).toBeUndefined();
  });

  it('allocates a new view on destination replacement, and old captured completion cannot clear successor', async () => {
    const definition = new ManagedIntegrationBuilder<State, Action, Deps>(destParentReducer)
      .with(destSlot, {
        dismissal: 'deferred',
        replaceOn: (action) => action.type === 'replaceAlpha'
      })
      .build();
    const store = createStore({
      initialState: { destination: Destination.initial('alpha', { count: 1 }), dismissRequests: 0 },
      ...definition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());

    const view1 = definition.bind(store, destSlot.case('alpha'));
    expect(view1).toBeDefined();
    if (!view1) throw new Error('expected view1');

    view1.dismiss();
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('alpha', { count: 1 }));
    expect(store.state.dismissRequests).toBe(1);

    store.dispatch({ type: 'replaceAlpha', count: 77 });
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('alpha', { count: 77 }));

    const view2 = definition.bind(store, destSlot.case('alpha'));
    expect(view2).toBeDefined();
    if (!view2) throw new Error('expected view2');
    expect(view2).not.toBe(view1);
    expect(view2.state).toEqual({ count: 77 });
    expect(view1.state).toBeUndefined();

    view1.dispatch({ type: 'dismissalCompleted' });
    await flush();
    expect(store.state.destination).toEqual(Destination.initial('alpha', { count: 77 }));
    expect(view2.state).toEqual({ count: 77 });

    view2.dispatch({ type: 'dismissalCompleted' });
    await flush();
    expect(store.state.destination).toBeNull();
    expect(view2.state).toBeUndefined();
  });

  it('rejects invalid runtime dismissal value on destination before registration', () => {
    const builder = new ManagedIntegrationBuilder<State, Action, Deps>(destParentReducer);
    expect(() => {
      Reflect.apply(builder.with, builder, [destSlot, { dismissal: 'unsupported' }]);
    }).toThrow(TypeError);

    builder.with(destSlot, { dismissal: 'deferred' });
    const composition = builder.build();
    const store = createStore({
      initialState: { destination: Destination.initial('alpha', { count: 0 }), dismissRequests: 0 },
      ...composition,
      dependencies: { dismiss: managedDismissDependency() }
    });
    cleanups.push(() => store.destroy());
    expect(composition.bind(store, destSlot.case('alpha'))).toBeDefined();
  });
});
