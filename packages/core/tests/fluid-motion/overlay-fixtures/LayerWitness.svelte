<script lang="ts">
  import ModalPrimitive from '../../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
  import PopoverPrimitive from '../../../src/lib/navigation-components/primitives/PopoverPrimitive.svelte';
  let { mode }: { mode: 'popover' | 'nested' } = $props();
  const presented = { status: 'presented', content: 'x' } as const;
</script>
{#if mode === 'popover'}
  <div style="height:3000px"><button data-page-button style="position:absolute;left:5px;top:5px;width:60px;height:30px">page</button></div>
  <PopoverPrimitive presentation={presented}>
    {#snippet children({ bindContent })}
      <div data-popover use:bindContent style="position:absolute;left:10%;top:420px;width:50%;height:40px;background:#7c3aed"></div>
    {/snippet}
  </PopoverPrimitive>
{:else}
  <ModalPrimitive presentation={presented}>
    {#snippet children({ bindBackdrop, bindContent })}
      <div data-outer-backdrop use:bindBackdrop style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.1)"></div>
      <div data-outer-content use:bindContent style="position:fixed;left:20px;top:20px;width:300px;height:200px;z-index:51;background:rgb(220,0,0)">
        <!-- Nested public primitive inside the outer modal's children snippet. -->
        <ModalPrimitive presentation={presented}>
          {#snippet children({ bindBackdrop: innerBackdrop, bindContent: innerContent })}
            <div data-inner-backdrop use:innerBackdrop style="position:fixed;inset:0;z-index:50;background:rgb(0,0,220)"></div>
            <div data-inner-content use:innerContent style="position:fixed;left:200px;top:150px;width:80px;height:60px;z-index:51;background:rgb(0,160,0)"></div>
          {/snippet}
        </ModalPrimitive>
      </div>
    {/snippet}
  </ModalPrimitive>
{/if}
