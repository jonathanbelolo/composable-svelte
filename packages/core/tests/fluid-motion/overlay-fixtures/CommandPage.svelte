<script lang="ts">
 import { useOverlayMotion, defineChoreography } from '../../../src/lib/application/motion-public.js';
 import { optionalRouteHost } from '../../../src/lib/application/renderer/choreography/route-host.js';
 import Command from '../../../src/lib/components/command/Command.svelte';
 import { overlayHooks } from './OverlayModel.js';
 let open = $state(false);
 export function setOpen(next: boolean) { open = next; }
 const palette = useOverlayMotion(overlay => ({
  open: defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
   { participant: overlay.select('content'), side: 'incoming', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 0, to: 1 } }
  ] }),
  close: defineChoreography({ cueMs: 0, durationMs: 300, tracks: [
   { participant: overlay.select('content'), side: 'outgoing', startMs: 0, durationMs: 300, easing: 'linear', opacity: { from: 1, to: 0 } }
  ] })
 }));
 overlayHooks.host = optionalRouteHost();
</script>
<Command bind:open commands={[{ id: 'a', label: 'Alpha', onSelect: () => {} }] as never} motion={palette} />
