<script lang="ts">
  import Host from '../recipes/code/Host.svelte';
  import { createRoot } from '../recipes/code/model';

  const store = createRoot();
</script>

<Host {store} />
