<script lang="ts">
  import { ApplicationHost, ApplicationRoot } from '../../src/lib/application/index.js';
  import { definition } from './ApplicationBasicModel.js';
  import MotionPublicConditionalChild from './MotionPublicConditionalChild.svelte';

  const dependencies = { step: 1, events: [] as string[] };
</script>

<ApplicationRoot {definition} options={{ dependencies, initial: { input: 0 } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <MotionPublicConditionalChild />
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
