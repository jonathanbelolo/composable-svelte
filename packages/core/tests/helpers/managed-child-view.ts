import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import {
  ManagedIntegrationBuilder,
  keyedSlot,
  type ChildView
} from '../../src/lib/navigation/managed-integration.js';
import type { Reducer } from '../../src/lib/types.js';

interface KeyedState<T> { items: Array<{ id: number; state: T }>; }
type KeyedAction<A> = { type: 'items'; id: number; action: A } | { type: 'remove'; id: number };

export interface ManagedChildViewHandle<T, A = unknown> {
  readonly view: ChildView<T, A>;
  remove(): void;
  retire(): void;
  destroy(): void;
}

export function createManagedChildView<T, A = unknown>(initialState: T): ManagedChildViewHandle<T, A> {
  const itemsSlot = keyedSlot<KeyedState<T>, KeyedAction<A>>()('items');
  const childReducer: Reducer<T, A> = (s) => [s, Effect.none()];
  const parentReducer: Reducer<KeyedState<T>, KeyedAction<A>> = (s, a) => [
    a.type === 'remove' ? { ...s, items: s.items.filter((i) => i.id !== a.id) } : s,
    Effect.none()
  ];
  const composition = new ManagedIntegrationBuilder<KeyedState<T>, KeyedAction<A>, undefined>(parentReducer)
    .forEach(itemsSlot, childReducer)
    .build();
  const parentStore = createStore({ initialState: { items: [{ id: 1, state: initialState }] }, ...composition });
  const view: ChildView<T, A> = composition.bind(parentStore, itemsSlot.at(1))!;
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    parentStore.destroy();
  };
  const remove = () => { parentStore.dispatch({ type: 'remove', id: 1 }); };
  return { view, remove, retire: remove, destroy };
}
