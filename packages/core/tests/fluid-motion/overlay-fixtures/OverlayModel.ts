import { defineApplication } from '../../../src/lib/application/index.js';
import { fluidMotion } from '../../../src/lib/application/motion-public.js';
import { Effect } from '../../../src/lib/effect.js';
import type { Reducer } from '../../../src/lib/types.js';
import type { PresentationState } from '../../../src/lib/navigation/types.js';
export interface OverlayState { readonly open: boolean; readonly presentation: PresentationState<string>; readonly refuseClose: boolean; readonly cardHidden: boolean; readonly catalogHidden?: boolean; readonly child: PresentationState<string> }
export type OverlayAction =
  | { readonly type: 'open' } | { readonly type: 'close' } | { readonly type: 'refuseClose'; readonly refuse: boolean } | { readonly type: 'hideCard' } | { readonly type: 'showCard' } | { readonly type: 'hideCatalog' } | { readonly type: 'openChild' } | { readonly type: 'closeChild' } | { readonly type: 'closeAll' } | { readonly type: 'childPresentationCompleted' } | { readonly type: 'childDismissalCompleted' }
  | { readonly type: 'presentationCompleted' } | { readonly type: 'dismissalCompleted' };
const reducer: Reducer<OverlayState, OverlayAction, {}> = (state, action) => {
  switch (action.type) {
    case 'open': return [{ ...state, open: true, presentation: { status: 'presenting', content: 'dialog', duration: 0.3 } }, Effect.none()];
    case 'close':
      // A refusing guard (unsaved changes): the close intent is not accepted; nothing changes.
      if (state.refuseClose || state.presentation.status === 'idle') return [state, Effect.none()];
      return [{ ...state, presentation: { status: 'dismissing', content: 'dialog', duration: 0.3 } }, Effect.none()];
    case 'openChild': return [{ ...state, child: { status: 'presenting', content: 'child', duration: 0.3 } }, Effect.none()];
    // One accepted business intent closes the child and its parent together.
    case 'closeAll': return [{ ...state, child: state.child.status === 'idle' ? state.child : { status: 'dismissing', content: 'child', duration: 0.3 }, presentation: { status: 'dismissing', content: 'dialog', duration: 0.3 } }, Effect.none()];
    case 'closeChild': return [state.child.status === 'presented' ? { ...state, child: { status: 'dismissing', content: 'child', duration: 0.3 } } : state, Effect.none()];
    case 'childPresentationCompleted': return [state.child.status === 'presenting' ? { ...state, child: { status: 'presented', content: 'child' } } : state, Effect.none()];
    case 'childDismissalCompleted': return [state.child.status === 'dismissing' ? { ...state, child: { status: 'idle' } } : state, Effect.none()];
    case 'hideCatalog': return [{ ...state, catalogHidden: true }, Effect.none()];
    case 'showCard': return [{ ...state, cardHidden: false }, Effect.none()];
    case 'hideCard': return [{ ...state, cardHidden: true }, Effect.none()];
    case 'refuseClose': return [{ ...state, refuseClose: action.refuse }, Effect.none()];
    case 'presentationCompleted': return [state.presentation.status === 'presenting' ? { ...state, presentation: { status: 'presented', content: 'dialog' } } : state, Effect.none()];
    case 'dismissalCompleted': return [state.presentation.status === 'dismissing' ? { ...state, open: false, presentation: { status: 'idle' } } : state, Effect.none()];
  }
};
export function overlayDefinition() {
  return defineApplication(reducer, { initialState: (): OverlayState => ({ open: true, presentation: { status: 'presented', content: 'dialog' }, refuseClose: false, cardHidden: false, child: { status: 'idle' } }), visual: fluidMotion() });
}
/** Test hooks filled by the page during initialisation. */
export const overlayHooks: { host?: unknown; pageOwner?: unknown; handle?: unknown; dispatch?: (action: OverlayAction) => void; state?: () => OverlayState; completions: { present: number; dismiss: number; childDismiss?: number }; withPlans: boolean; twoHeroes?: boolean; childHandle?: unknown; media?: boolean; conditional?: boolean; catalog?: boolean; noHero?: boolean; video?: boolean; local?: boolean; setLocal?: (status: string, hideCard: boolean) => void } = { completions: { present: 0, dismiss: 0 }, withPlans: false };
