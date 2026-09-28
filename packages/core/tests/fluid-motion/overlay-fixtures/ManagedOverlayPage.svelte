<script lang="ts">
 // A REAL managed presentation view (deferred dismissal): Escape / outside pointer go through the dismissal
 // coordinator to `view.dismiss()`; the reducer enters `dismissing`; the default close plan claims it.
 import { onDestroy } from 'svelte';
 import { useOverlayMotion, defineChoreography } from '../../../src/lib/application/motion-public.js';
 import { optionalRouteHost } from '../../../src/lib/application/renderer/choreography/route-host.js';
 import ModalPrimitive from '../../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
 import { createStore } from '../../../src/lib/store.svelte.js';
 import { Effect } from '../../../src/lib/effect.js';
 import { ManagedIntegrationBuilder, optionalSlot, type PresentationView } from '../../../src/lib/navigation/managed-integration.js';
 import { managedDismissDependency, type DismissDependency } from '../../../src/lib/navigation/dismiss-dependency.js';
 import type { Reducer } from '../../../src/lib/types.js';
 import type { PresentationAction, PresentationState } from '../../../src/lib/navigation/types.js';
 import { managedHooks } from './ManagedOverlayHooks.js';
 type Child = { title: string };
 type ChildAction = { type: 'noop' };
 type State = { child: Child | null; presentation: PresentationState<string> };
 type Action = { type: 'child'; action: PresentationAction<ChildAction> } | { type: 'open' } | { type: 'presentationCompleted' } | { type: 'dismissalCompleted' };
 const slot = optionalSlot<State, Action>()('child');
 const childReducer: Reducer<Child, ChildAction, { dismiss: DismissDependency }> = state => [state, Effect.none()];
 const parent: Reducer<State, Action, { dismiss: DismissDependency }> = (state, action) => {
  switch (action.type) {
   case 'open': return [{ child: { title: 'dialog' }, presentation: { status: 'presenting', content: 'dialog', duration: 0.3 } }, Effect.none()];
   case 'presentationCompleted': return [state.presentation.status === 'presenting' ? { ...state, presentation: { status: 'presented', content: 'dialog' } } : state, Effect.none()];
   case 'dismissalCompleted': return [state.presentation.status === 'dismissing' ? { child: null, presentation: { status: 'idle' } } : state, Effect.none()];
   case 'child':
    if (action.action.type === 'dismiss' && (state.presentation.status === 'presented' || state.presentation.status === 'presenting'))
     return [{ ...state, presentation: { status: 'dismissing', content: 'dialog', duration: 0.3 } }, Effect.none()];
    return [state, Effect.none()];
  }
 };
 const composition = new ManagedIntegrationBuilder<State, Action, { dismiss: DismissDependency }>(parent).with(slot, childReducer, { dismissal: 'deferred' }).build();
 const store = createStore({ initialState: { child: { title: 'dialog' }, presentation: { status: 'presented', content: 'dialog' } } as State, ...composition, dependencies: { dismiss: managedDismissDependency() } });
 onDestroy(() => store.destroy());
 let bound: PresentationView<Child, ChildAction> | undefined;
 const view = $derived.by(() => { if (!store.state.child) { bound = undefined; return undefined; } return (bound ??= composition.bind(store, slot) as PresentationView<Child, ChildAction>); });
 const dialog = useOverlayMotion(overlay => ({
  open: defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
   { participant: overlay.select('backdrop'), side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 0, to: 1 } },
   { participant: overlay.select('content'), side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 0, to: 1 } }
  ] }),
  close: defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
   { participant: overlay.select('content'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } },
   { participant: overlay.select('backdrop'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } }
  ] })
 }));
 managedHooks.host = optionalRouteHost();
 managedHooks.open = () => store.dispatch({ type: 'open' });
 managedHooks.status = () => store.state.presentation.status;
 managedHooks.child = () => store.state.child;
</script>
<button data-outside style="display:block">outside</button>
<ModalPrimitive store={view} presentation={store.state.presentation} motion={dialog}
 onPresentationComplete={() => { managedHooks.completions.present++; store.dispatch({ type: 'presentationCompleted' }); }}
 onDismissalComplete={() => { managedHooks.completions.dismiss++; store.dispatch({ type: 'dismissalCompleted' }); }}>
 {#snippet children({ bindBackdrop, bindContent })}
  <div data-managed-backdrop use:bindBackdrop style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.3)"></div>
  <div data-managed-content use:bindContent style="position:fixed;left:40px;top:40px;width:240px;height:160px;z-index:51;background:#fff">
   <button data-managed-button>confirm</button>
  </div>
 {/snippet}
</ModalPrimitive>
