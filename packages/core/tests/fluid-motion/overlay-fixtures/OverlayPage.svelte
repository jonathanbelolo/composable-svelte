<script lang="ts">
 import { useParticipant, useOverlayMotion, defineChoreography } from '../../../src/lib/application/motion-public.js';
 import { optionalRouteHost, optionalRouteInstance } from '../../../src/lib/application/renderer/choreography/route-host.js';
 import ModalPrimitive from '../../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
 import type { ApplicationStore } from '../../../src/lib/application/index.js';
 import { overlayHooks, type OverlayState, type OverlayAction } from './OverlayModel.js';
 let { store }: { store: ApplicationStore<OverlayState, OverlayAction> } = $props();
 // Initialised by the PAGE; the same action is used inside the modal's children snippet below.
 const participant = useParticipant();
 const dialog = useOverlayMotion(overlay => overlayHooks.withPlans ? {
  open: defineChoreography({ cueMs: 0, durationMs: 400, tracks: [
   { participant: 'card', side: 'shared', from: 'card', to: overlay.select('hero'), startMs: 0, durationMs: 400, easing: { cubicBezier: [0.2, 0, 0, 1] } },
   { participant: overlay.select('backdrop'), side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 0, to: 1 } },
   { participant: overlay.select('content'), side: 'incoming', startMs: 0, durationMs: 400, easing: 'linear', opacity: { from: 0, to: 1 }, scale: { from: 0.9, to: 1 } }
  ] }),
  close: defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
   { participant: overlay.select('content'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } },
   { participant: overlay.select('backdrop'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } }
  ] }),
  ...(overlayHooks.conditional ? { presentation: () => store.state.presentation } : {})
 } : {});
 overlayHooks.host = optionalRouteHost();
 overlayHooks.pageOwner = optionalRouteInstance();
 overlayHooks.handle = dialog;
 // Prop/bindable-only state (no store commit): written by the test in one update.
 let localPresentation = $state<{ status: 'idle' | 'presenting' | 'presented' | 'dismissing'; content?: string; duration?: number }>({ status: 'idle' });
 let localCardHidden = $state(false);
 overlayHooks.setLocal = (status, hideCard) => { localPresentation = status === 'idle' ? { status: 'idle' } : { status: status as never, content: 'dialog', duration: 0.3 }; localCardHidden = hideCard; };
 // The nested child dialog has no plans of its own: a parent's combined plan names its roles.
 const childDialog = useOverlayMotion();
 overlayHooks.childHandle = childDialog;
 overlayHooks.dispatch = action => store.dispatch(action);
 overlayHooks.state = () => store.state;
 function paintRed(node: HTMLCanvasElement) { const ctx = node.getContext('2d')!; ctx.fillStyle = 'rgb(255,0,0)'; ctx.fillRect(0, 0, node.width, node.height); }
</script>
<div data-page-hero use:participant={{ key: 'hero' }} style="display:block;width:120px;height:40px;background:#334155">page hero</div>
{#if overlayHooks.catalog && !store.state.catalogHidden}
 <div data-catalog use:participant={{ key: 'catalog' }} style="display:block;width:200px;height:60px;background:#e2e8f0"><button data-catalog-button>item</button></div>
{/if}
{#if overlayHooks.media}
 <canvas data-canvas-card use:participant={{ key: 'canvasCard' }} width="80" height="40" style="display:block;width:80px;height:40px" use:paintRed></canvas>
 <iframe data-frame-card title="frame" use:participant={{ key: 'frameCard' }} sandbox="" srcdoc="<p>frame</p>" style="display:block;width:80px;height:40px;border:0"></iframe>
{/if}
{#if overlayHooks.video && !store.state.cardHidden}
 <!-- svelte-ignore a11y_media_has_caption -->
 <video data-video-card use:participant={{ key: 'videoCard' }} muted playsinline style="display:block;width:128px;height:72px"></video>
{/if}
{#if !store.state.cardHidden && !(overlayHooks.local && localCardHidden)}
 <div data-card use:participant={{ key: 'card' }} style="display:block;width:160px;height:90px;background:#22c55e">card</div>
{/if}
{#if !overlayHooks.conditional || store.state.presentation.status !== 'idle'}
<ModalPrimitive presentation={overlayHooks.local ? localPresentation as never : store.state.presentation} motion={dialog}
 onPresentationComplete={() => { overlayHooks.completions.present++; store.dispatch({ type: 'presentationCompleted' }); }}
 onDismissalComplete={() => { overlayHooks.completions.dismiss++; store.dispatch({ type: 'dismissalCompleted' }); }}>
 {#snippet children({ bindBackdrop, bindContent })}
  <div data-modal-backdrop use:bindBackdrop style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.3)"></div>
  <div data-modal-content use:bindContent style="position:fixed;left:40px;top:40px;width:240px;height:160px;z-index:51;background:#fff">
   {#if !overlayHooks.noHero}<div data-modal-hero use:participant={{ key: 'hero' }} style="display:block;width:100px;height:60px;background:#1d4ed8">modal hero</div>{/if}
   {#if overlayHooks.twoHeroes}<div data-modal-hero2 use:participant={{ key: 'hero' }} style="display:block;width:100px;height:20px;background:#9333ea">second hero</div>{/if}
   <button data-modal-button tabindex="0" style="display:block;margin-top:8px">confirm</button>
   <ModalPrimitive presentation={store.state.child} motion={childDialog}
    onPresentationComplete={() => store.dispatch({ type: 'childPresentationCompleted' })}
    onDismissalComplete={() => { overlayHooks.completions.childDismiss = (overlayHooks.completions.childDismiss ?? 0) + 1; store.dispatch({ type: 'childDismissalCompleted' }); }}>
    {#snippet children({ bindBackdrop: childBackdrop, bindContent: childContent })}
     <div data-child-backdrop use:childBackdrop style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.2)"></div>
     <div data-child-content use:childContent style="position:fixed;left:80px;top:80px;width:160px;height:80px;z-index:51;background:#fde68a">child</div>
    {/snippet}
   </ModalPrimitive>
  </div>
 {/snippet}
</ModalPrimitive>
{/if}
