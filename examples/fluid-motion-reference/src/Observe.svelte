<!-- Test observation seam only: hands the application instance to an evidence test. Renders nothing. -->
<script lang="ts">
  import type { ApplicationInstance } from '@composable-svelte/core/application';
  import type { AppState, AppAction } from './model.js';

  let { app, onApp }: { app: ApplicationInstance<AppState, AppAction>; onApp: (app: ApplicationInstance<AppState, AppAction>) => void } = $props();
  // svelte-ignore state_referenced_locally
  onApp(app);
</script>
