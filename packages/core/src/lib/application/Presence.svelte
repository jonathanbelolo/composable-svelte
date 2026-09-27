<script lang="ts">
 /**
  * S2 managed participation: a framework-owned presence boundary that owns its conditional. When the committed state
  * turns `when` false, the pre-effect runs after the business commit and before Svelte destroys the block: the
  * boundary's registered participants hand off while still connected (established retirement only; a throwing or
  * no-op commit never flips `when`). Renders nothing extra (no wrapper element).
  */
 import { untrack, type Snippet } from 'svelte';
 import { optionalPresence, optionalRouteHost, providePresence } from './renderer/choreography/route-host.js';
 let { when, children }: { when: boolean; children: Snippet } = $props();
 const host = optionalRouteHost();
 const members = new Set<HTMLElement>();
 // Nested boundaries forward their members: an ancestor's established removal covers the whole nested subtree.
 const parent = optionalPresence();
 providePresence({ add: node => { members.add(node); parent?.add(node); }, delete: node => { members.delete(node); parent?.delete(node); } });
 let previous = untrack(() => when);
 $effect.pre(() => {
  const now = when;
  if (previous && !now && host && members.size) untrack(() => host.removing([...members].filter(node => node.isConnected)));
  previous = now;
 });
</script>
{#if when}{@render children()}{/if}
