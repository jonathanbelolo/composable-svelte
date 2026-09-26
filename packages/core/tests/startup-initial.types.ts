import { integrate } from '../src/lib/navigation/integrate.js';
import { optionalSlot } from '../src/lib/navigation/managed-integration.js';
import { Effect } from '../src/lib/effect.js';
import type { Reducer, StoreExecutionConfig } from '../src/lib/types.js';
import type { PresentationAction } from '../src/lib/navigation/types.js';
type Child = { loaded: boolean }; type CA = { type: 'load'; key: string } | { type: 'cancel' };
type State = { child: Child | null }; type Action = { type: 'boot' } | { type: 'child'; action: PresentationAction<CA> };
const slot = optionalSlot<State, Action>()('child');
const child: Reducer<Child, CA> = state => [state, Effect.none()];
const root: Reducer<State, Action> = state => [state, Effect.none()];
integrate(root).managed().with(slot, child, { startup: state => state.loaded ? undefined : { type: 'load', key: 'initial' } });
integrate(root).managed().with(slot, child, {
  // @ts-expect-error child startup must supply the child's exact action payload
  startup: () => ({ type: 'load' })
});
integrate(root).managed().with(slot, child, {
  // @ts-expect-error parent business actions are not child actions
  startup: () => ({ type: 'boot' })
});
const execution: StoreExecutionConfig<State, Action> = { mode: 'managed', _initialization: { mode: 'attached', startup: { type: 'boot' } } };
const invalid: StoreExecutionConfig<State, Action> = { mode: 'managed', _initialization: { mode: 'attached',
  // @ts-expect-error startup cannot invent a root action
  startup: { type: 'unknown' }
} };
void execution; void invalid;
