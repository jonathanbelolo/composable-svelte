<script lang="ts">
  import { ApplicationHost, ApplicationRoot } from '../../src/lib/application/index.js';
  import { definition } from './ApplicationBasicModel.js';
  import MotionGroupTimingChild from './MotionGroupTimingChild.svelte';
  let { mode = 'sequence' }: { mode?: 'sequence' | 'parallel' | 'stagger' } = $props();
  const dependencies = { step: 1, events: [] as string[] };
</script>
<ApplicationRoot {definition} options={{ dependencies, initial: { input: 0 } }}>
  {#snippet children(app)}<ApplicationHost {app}><MotionGroupTimingChild {mode} /></ApplicationHost>{/snippet}
</ApplicationRoot>
