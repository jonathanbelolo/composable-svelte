<script lang="ts">
  import { setContext, type Snippet } from 'svelte';
  import { scopeTo, type ApplicationInstance } from '@composable-svelte/core/application';
  import { sceneSlot, type HostState, type HostAction } from './model.js';
  let { app, children }: { app: ApplicationInstance<HostState, HostAction>; children: Snippet } = $props();
  const store = $derived(scopeTo(app.store, sceneSlot));
  setContext('webgpu-host-scene', { get store() { return store; } });
</script>
{@render children()}
