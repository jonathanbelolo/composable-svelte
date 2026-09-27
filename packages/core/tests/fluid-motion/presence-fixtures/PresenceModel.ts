import { defineApplication } from '../../../src/lib/application/index.js';
import { fluidMotion } from '../../../src/lib/application/motion-public.js';
import type { RepresentationProvider, ChoreographyPlan } from '../../../src/lib/application/motion-public.js';
import { Effect } from '../../../src/lib/effect.js';
import type { Reducer } from '../../../src/lib/types.js';
export interface PresenceState { readonly show: boolean }
export type PresenceAction = { readonly type: 'hide' } | { readonly type: 'noop' } | { readonly type: 'boom' };
const reducer: Reducer<PresenceState, PresenceAction, {}> = (state, action) => {
  if (action.type === 'boom') throw new Error('commit failed');
  return [action.type === 'hide' ? { show: false } : state, Effect.none()];
};
export function presenceDefinition(providers: readonly RepresentationProvider[]) {
  return defineApplication(reducer, { initialState: () => ({ show: true }), visual: fluidMotion({ providers }) });
}
export const hooks: { transition?: (plan: ChoreographyPlan, action: PresenceAction) => void; lookup?: unknown; lookupOutside?: unknown } = {};
