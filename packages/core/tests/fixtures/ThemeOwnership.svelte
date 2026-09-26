<script lang="ts">
  import { onMount } from 'svelte';
  import type { ThemeManager } from '../../src/lib/styles/theme.js';
  let { manager }: { manager: ThemeManager } = $props();
  onMount(() => manager.initialize());
</script>
<p data-testid="theme">{$manager.resolvedTheme}</p>
<button onclick={() => manager.toggle()}>Toggle</button>
