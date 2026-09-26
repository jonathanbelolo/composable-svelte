<script lang="ts">
  import PopoverPrimitive from '../../src/lib/navigation-components/primitives/PopoverPrimitive.svelte';
  import type { PresentationState } from '../../src/lib/navigation/types';
  let { onComplete }: { onComplete: (event: string) => void } = $props();
  let shown = $state(true);
  let presentation = $state<PresentationState<string>>({ status: 'presenting', content: 'first' });
  let config = $state({ visualDuration: 0.04, bounce: 0 });
  export function hide() { shown = false; }
  export function present(content: string) { presentation = { status: 'presenting', content }; }
  export function dismiss() { presentation = { status: 'dismissing', content: 'first' }; }
  export function updateConfig() { config = { visualDuration: 0.03, bounce: 0 }; }
  function complete(kind: string) { onComplete(`${kind}:${presentation.status === 'idle' ? 'idle' : presentation.content}`); }
</script>
{#if shown}
  <PopoverPrimitive store={undefined} {presentation} springConfig={config} onPresentationComplete={() => complete('presented')} onDismissalComplete={() => complete('dismissed')}>
    {#snippet children({ bindContent, initialOpacity })}
      <div data-popover-owner use:bindContent={'translateX(10px)'} style:opacity={initialOpacity} style="position:fixed;left:80px;top:80px;width:140px;height:100px;background:white"><button>Popover content</button></div>
    {/snippet}
  </PopoverPrimitive>
{/if}
