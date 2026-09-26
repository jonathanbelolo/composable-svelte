<script lang="ts">
  import Host from '../recipes/managed/Host.svelte';
  import { createRoot } from '../recipes/managed/model';

  const store = createRoot();
</script>

<Host {store} />
