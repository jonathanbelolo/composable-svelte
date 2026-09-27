import { defineApplication } from '../../../src/lib/application/index.js';
import { Effect } from '../../../src/lib/effect.js';
import type { Reducer } from '../../../src/lib/types.js';
export interface LocalState { readonly open: boolean }
export type LocalAction = { readonly type: 'toggle' };
const reducer: Reducer<LocalState, LocalAction, {}> = state => [{ open: !state.open }, Effect.none()];
/** A plain application: no routing, no staging. */
export const localDefinition = defineApplication(reducer, { initialState: () => ({ open: false }) });
export const panelToggles: { toggle(plan: import('../../../src/lib/application/motion-public.js').ChoreographyPlan): void }[] = [];
