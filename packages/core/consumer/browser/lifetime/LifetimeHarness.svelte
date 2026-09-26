<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
  let mounted = $state(true);
</script>

<section aria-label="Application lifetime controls" data-lifetime-harness>
  <button type="button" disabled={mounted} onclick={() => mounted = true}>Mount application</button>
  <button type="button" disabled={!mounted} onclick={() => mounted = false}>Unmount application</button>
</section>

{#if mounted}
  {@render children()}
{/if}
