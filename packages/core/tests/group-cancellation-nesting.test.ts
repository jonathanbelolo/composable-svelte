import { describe, it, expect } from 'vitest';
import { Effect } from '../src/lib/effect.js';
import { createStore } from '../src/lib/store.svelte.js';
import { TestStore } from '../src/lib/test/test-store.js';
import type { Dispatch, Reducer, Effect as EffectType } from '../src/lib/types.js';

type Action = { type: 'start' | 'cancelA' | 'cancelRoot' | 'cancelB' } | { type: 'message'; source: string };

for (const adapter of ['production', 'test'] as const) {
  for (const order of ['prefix-map', 'map-prefix'] as const) {
    describe(`nested group cancellation (${adapter}, ${order})`, () => {
      it('cancels nested scoped work without cancelling sibling or root groups', async () => {
        const cleaned: string[] = [];
        const callbacks = new Map<string, Dispatch<Action>>();
        const lift = (effect: EffectType<Action>, prefix: string): EffectType<Action> =>
          order === 'prefix-map'
            ? Effect.map(Effect.prefixGroups(effect, prefix), action => action)
            : Effect.prefixGroups(Effect.map(effect, action => action), prefix);
        const subscription = (id: string) => Effect.inGroup(
          Effect.subscription<Action>(id, dispatch => {
            callbacks.set(id, dispatch);
            return () => { cleaned.push(id); };
          }), 'task');
        const nestedCancel = (): EffectType<Action> => Effect.batch(
          Effect.fireAndForget(() => {}),
          Effect.batch(Effect.cancelGroup<Action>('task'), Effect.fireAndForget(() => {}))
        );
        const reducer: Reducer<string[], Action> = (state, action) => {
          switch (action.type) {
            case 'start': return [state, Effect.batch(lift(subscription('a'), 'a'), lift(subscription('b'), 'b'), subscription('root'))];
            case 'cancelA': return [state, lift(nestedCancel(), 'a')];
            case 'cancelRoot': return [state, Effect.cancelGroup('task')];
            case 'cancelB': return [state, lift(nestedCancel(), 'b')];
            case 'message': return [[...state, action.source], Effect.none()];
          }
        };
        const production = adapter === 'production' ? createStore({ initialState: [] as string[], reducer, ssr: { deferEffects: false } }) : undefined;
        const testStore = adapter === 'test' ? new TestStore({ initialState: [] as string[], reducer }) : undefined;
        const send = async (action: Action): Promise<void> => {
          if (testStore) await testStore.send(action);
          else production!.dispatch(action);
        };
        try {
          await send({ type: 'start' });
          expect(callbacks.size).toBe(3);
          await send({ type: 'cancelA' });
          expect([...cleaned]).toEqual(['a']);
          callbacks.get('b')!({ type: 'message', source: 'b' });
          if (testStore) await testStore.receive({ type: 'message', source: 'b' });
          expect(testStore ? testStore.getState() : production!.state).toEqual(['b']);
          await send({ type: 'cancelRoot' });
          expect([...cleaned]).toEqual(['a', 'root']);
          await send({ type: 'cancelB' });
          expect([...cleaned]).toEqual(['a', 'root', 'b']);
          if (testStore) await testStore.finish();
        } finally {
          production?.destroy();
          testStore?.destroy();
        }
        expect([...cleaned]).toEqual(['a', 'root', 'b']);
      });
    });
  }
}
