import { createStore } from '../../src/lib/store.svelte.js';
import { Effect } from '../../src/lib/effect.js';
import { integrate } from '../../src/lib/navigation/integrate.js';
import { optionalSlot } from '../../src/lib/navigation/managed-integration.js';
import { rendererOwner } from '../../src/lib/application/renderer/owner.js';
import type { Reducer } from '../../src/lib/types.js';
import type { PresentationAction } from '../../src/lib/navigation/types.js';
type Child = { loaded: boolean; label: string };
type CA = { type: 'load' };
type State = { child: Child | null };
type Action = { type: 'boot' } | { type: 'child'; action: PresentationAction<CA> };
const slot = optionalSlot<State, Action>()('child');
export function createStartupModel(events: string[], loaded = true, removeOnBoot = false) {
  const child: Reducer<Child, CA> = state => {
    events.push('child:load');
    if (state.loaded) return [state, Effect.none()];
    return [{ loaded: true, label: 'client' }, Effect.run(() => { events.push('fetch'); })];
  };
  const parent: Reducer<State, Action> = (state, action) => {
    events.push(`reduce:${action.type}`);
    return [action.type === 'boot' && removeOnBoot ? { child: null } : state, Effect.none()];
  };
  const definition = integrate(parent).managed().with(slot, child, {
    onCreate: () => { events.push('plan'); return Effect.subscription('client-source', () => { events.push('subscribe'); return () => { events.push('cleanup'); }; }); },
    startup: state => state.loaded ? undefined : { type: 'load' }
  }).build();
  const execution = { ...definition.execution, _initialization: { mode: 'attached' as const, startup: { type: 'boot' as const } } };
  const store = createStore({ initialState: { child: { loaded, label: 'server' } }, reducer: definition.reducer, execution, ssr: { deferEffects: false } });
  return { store, owner: rendererOwner(store, execution), definition, slot };
}
export type StartupModel = ReturnType<typeof createStartupModel>;
