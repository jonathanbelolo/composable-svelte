<script lang="ts">
  import { ApplicationHost, ApplicationRoot } from '../../src/lib/application/index.js';
  import { definition } from './ApplicationBasicModel.js';
  import MotionGroupTopologyChild from './MotionGroupTopologyChild.svelte';

  let { initialDuplicate = false }: { initialDuplicate?: boolean } = $props();
  const dependencies = { step: 1, events: [] as string[] };
</script>

<ApplicationRoot {definition} options={{ dependencies, initial: { input: 0 } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <MotionGroupTopologyChild {initialDuplicate} />
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
