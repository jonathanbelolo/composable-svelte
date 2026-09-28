<script lang="ts">
 import { useOverlayMotion, defineChoreography } from '../../../src/lib/application/motion-public.js';
 import ModalPrimitive from '../../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
 import { routedHooks, type RoutedState, type RoutedAction } from './RoutedModalModel.js';
 let { store }: { store: { state: RoutedState; dispatch(action: RoutedAction): void } } = $props();
 routedHooks.store = store;
 const dialog = useOverlayMotion(overlay => ({
  close: defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
   { participant: overlay.select('content'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } },
   { participant: overlay.select('backdrop'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } }
  ] })
 }));
</script>
<p data-url>{store.state.url}</p>
<ModalPrimitive presentation={store.state.presentation} motion={dialog}
 onPresentationComplete={() => { routedHooks.completions.present++; store.dispatch({ type: 'presentationCompleted' }); }}
 onDismissalComplete={() => { routedHooks.completions.dismiss++; store.dispatch({ type: 'dismissalCompleted' }); }}>
 {#snippet children({ bindBackdrop, bindContent })}
  <div data-routed-backdrop use:bindBackdrop style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.3)"></div>
  <div data-routed-content use:bindContent style="position:fixed;left:40px;top:40px;width:200px;height:120px;z-index:51;background:#fff">routed</div>
 {/snippet}
</ModalPrimitive>
