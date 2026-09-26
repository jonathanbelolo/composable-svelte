<script lang="ts">
  import { MotionElement, defineMotionRecipe } from '../../src/lib/application/motion-public.js';

  let { state }: { state: 'off' | 'on' } = $props();
  const recipe = defineMotionRecipe({
    targets: { box: { properties: ['opacity', 'width'] } },
    states: {
      off: { box: { opacity: 0, width: 10 } },
      on: { box: { opacity: 1, width: 24 } },
    },
    graph: { kind: 'track', target: 'box', properties: ['opacity', 'width'] },
    interruption: 'replace',
  });
</script>

<MotionElement as="a" {recipe} {state} href="/motion" data-motion-state={state}>
  {#snippet children()}motion{/snippet}
</MotionElement>
