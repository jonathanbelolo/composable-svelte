<!-- Scopes the shared pavilion model inside the ApplicationHost (scoping needs the Host's claim) and provides it to the pages. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { scopeTo, type ApplicationInstance } from '@composable-svelte/core/application';
  import { sceneSlot, type AppState, type AppAction } from './model.js';
  import { providePavilionScene } from './scene.js';

  let { app, children }: { app: ApplicationInstance<AppState, AppAction>; children: Snippet } = $props();

  const sceneStore = $derived(scopeTo(app.store, sceneSlot));
  providePavilionScene({
    get store() {
      return sceneStore;
    }
  });
</script>

{@render children()}
