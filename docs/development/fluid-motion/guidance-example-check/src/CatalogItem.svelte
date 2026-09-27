<script lang="ts">
  import { useParticipant } from '@composable-svelte/core/application/motion';
  import Pulse from './Pulse.svelte';
  import type { Item } from './model.js';

  let { item, onopen }: { item: Item; onopen: (id: string) => void } = $props();

  // Called inside CatalogView's <Presence>, so this participant belongs to that boundary.
  const participant = useParticipant();
</script>

<li use:participant={{ key: `item-${item.id}` }}>
  <Pulse />
  <button type="button" onclick={() => onopen(item.id)}>{item.title}</button>
</li>
