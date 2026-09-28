<script lang="ts">
  import ModalPrimitive from '../../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
  import type { PresentationState } from '../../../src/lib/navigation/types.js';
  let first = $state<PresentationState<string>>({ status: 'presented', content: 'a' });
  let second = $state<PresentationState<string>>({ status: 'idle' });
  export function setFirst(next: PresentationState<string>) { first = next; }
  export function setSecond(next: PresentationState<string>) { second = next; }
</script>
<!-- The library Modal's documented stacking: backdrop z-50, content z-[51] (here inline, without Tailwind). -->
<ModalPrimitive presentation={first}>
  {#snippet children({ bindBackdrop, bindContent })}
    <div data-first-backdrop use:bindBackdrop style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.2)"></div>
    <div data-first-content use:bindContent style="position:fixed;left:20px;top:20px;width:300px;height:200px;z-index:51;background:rgb(220,0,0)"></div>
  {/snippet}
</ModalPrimitive>
<ModalPrimitive presentation={second}>
  {#snippet children({ bindBackdrop, bindContent })}
    <div data-second-backdrop use:bindBackdrop style="position:fixed;inset:0;z-index:50;background:rgb(0,0,220)"></div>
    <div data-second-content use:bindContent style="position:fixed;left:200px;top:150px;width:80px;height:60px;z-index:51;background:rgb(0,160,0)"></div>
  {/snippet}
</ModalPrimitive>
