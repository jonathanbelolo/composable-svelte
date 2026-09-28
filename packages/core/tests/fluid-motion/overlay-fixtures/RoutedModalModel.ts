import { defineApplication } from '../../../src/lib/application/index.js';
import { fluidMotion } from '../../../src/lib/application/motion-public.js';
import { Effect } from '../../../src/lib/effect.js';
import type { Reducer } from '../../../src/lib/types.js';
import type { PresentationState } from '../../../src/lib/navigation/types.js';
/** A routed modal: `/modal` presents it; navigating anywhere else (including Browser Back) is an accepted dismissal. */
export interface RoutedState { readonly url: string; readonly presentation: PresentationState<string> }
export type RoutedAction = { readonly type: 'navigate'; readonly url: string } | { readonly type: 'presentationCompleted' } | { readonly type: 'dismissalCompleted' };
const reducer: Reducer<RoutedState, RoutedAction, {}> = (state, action) => {
  switch (action.type) {
    case 'navigate':
      if (action.url === '/modal') return [{ url: '/modal', presentation: { status: 'presenting', content: 'dialog', duration: 0.3 } }, Effect.none()];
      return [{ url: action.url, presentation: state.presentation.status === 'idle' ? state.presentation : { status: 'dismissing', content: 'dialog', duration: 0.3 } }, Effect.none()];
    case 'presentationCompleted': return [state.presentation.status === 'presenting' ? { ...state, presentation: { status: 'presented', content: 'dialog' } } : state, Effect.none()];
    case 'dismissalCompleted': return [state.presentation.status === 'dismissing' ? { ...state, presentation: { status: 'idle' } } : state, Effect.none()];
  }
};
export const routedDefinition = () => defineApplication(reducer, {
  initialState: (url: string): RoutedState => ({ url, presentation: { status: 'idle' } }),
  routing: { fragment: 'native', serialize: state => state.url, request: (url: string) => ({ action: { type: 'navigate', url } as RoutedAction, expectedURL: url }) },
  visual: fluidMotion()
});
export const routedHooks: { store?: { state: RoutedState; dispatch(action: RoutedAction): void }; completions: { present: number; dismiss: number } } = { completions: { present: 0, dismiss: 0 } };
