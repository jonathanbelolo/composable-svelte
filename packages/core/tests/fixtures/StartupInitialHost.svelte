<script lang="ts">
  import ApplicationHost from '../../src/lib/application/ApplicationHost.svelte';
  import type { StartupModel } from './StartupInitialModel.js';
  let { model, fail = false }: { model: StartupModel; fail?: boolean } = $props();
  function failRender(): never { throw new Error('startup child render failed'); }
</script>
<ApplicationHost owner={model.owner}>
  <p data-startup>{fail ? failRender() : model.store.state.child?.label ?? 'none'}</p>
</ApplicationHost>
